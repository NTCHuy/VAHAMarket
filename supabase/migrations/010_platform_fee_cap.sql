-- =====================================================================
--  PATCH 010 — VAHA Market v1.9.1: Trần phí sàn tối đa 500.000₫ (Fee Cap)
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002 → 009.
--
--  1. Bổ sung cột `fee_cap_vnd` (mặc định 500000; 0 = tắt trần) vào `platform_settings`.
--  2. Bổ sung `admin_set_fee_cap(p_fee_cap_vnd bigint)` để Admin đổi trần phí trực tiếp.
--  3. Bổ sung cột `fee_cap_vnd`, `fee_saved_amount` vào `orders` để lưu lịch sử chính xác.
--  4. Cập nhật `create_order`: áp trần LEAST(ROUND(list_price * bp / 10000.0), v_fee_cap)
--     TRƯỚC KHI chia `buyer_fee` / `seller_fee`, khớp 100% từng đồng với `src/lib/money.ts`.
--  5. Cập nhật trigger `trg_orders_email_notify` gửi kèm `isFeeCapped`, `feeCapVnd`, `feeSavedAmount`
--     tới Edge Function `send-order-email`.
-- =====================================================================

-- 1. Cột fee_cap_vnd trên platform_settings -------------------------------------------
alter table public.platform_settings
  add column if not exists fee_cap_vnd bigint not null default 500000;

alter table public.platform_settings drop constraint if exists platform_settings_fee_cap_check;
alter table public.platform_settings add constraint platform_settings_fee_cap_check
  check (fee_cap_vnd >= 0 and fee_cap_vnd <= 100000000);

grant update (fee_cap_vnd) on public.platform_settings to authenticated;

-- 2. RPC Admin đổi trần phí tối đa (0 = tắt trần) ------------------------------------
create or replace function public.admin_set_fee_cap(p_fee_cap_vnd bigint)
returns public.platform_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old bigint;
  v_row public.platform_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if p_fee_cap_vnd is null or p_fee_cap_vnd < 0 or p_fee_cap_vnd > 100000000 then
    raise exception 'Trần phí tối đa phải từ 0đ (tắt trần) đến 100.000.000đ.' using errcode = '22023';
  end if;

  select fee_cap_vnd into v_old from public.platform_settings where id = 1 for update;

  update public.platform_settings
     set fee_cap_vnd = p_fee_cap_vnd,
         updated_by  = (select auth.uid())
   where id = 1
   returning * into v_row;

  insert into public.admin_audit_log (admin_id, action, note)
  values (
    (select auth.uid()),
    'SET_FEE_CAP_VND',
    format('%sđ → %sđ', coalesce(v_old, 500000), p_fee_cap_vnd)
  );

  return v_row;
end;
$$;

-- 3. Cột lưu thông tin trần phí tại thời điểm tạo đơn trên orders ---------------------
alter table public.orders add column if not exists fee_cap_vnd      bigint not null default 500000;
alter table public.orders add column if not exists fee_saved_amount bigint not null default 0;

alter table public.orders drop constraint if exists orders_fee_cap_check;
alter table public.orders add constraint orders_fee_cap_check
  check (fee_cap_vnd >= 0 and fee_saved_amount >= 0);

-- 4. Cập nhật create_order: áp trần phí trước khi chia buyer_fee / seller_fee ---------
create or replace function public.create_order(
  p_listing_id      uuid,
  p_recipient_name  text,
  p_phone           text,
  p_address         text,
  p_note            text default null,
  p_expected_amount bigint default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_listing      public.listings%rowtype;
  v_bank         public.bank_accounts%rowtype;
  v_order        public.orders%rowtype;
  v_is_mod       boolean;
  v_global_bp    integer;
  v_fee_cap      bigint;
  v_bp           integer;
  v_uncapped_fee bigint;
  v_total_fee    bigint;
  v_fee_saved    bigint := 0;
  v_buyer_fee    bigint;
  v_seller_fee   bigint;
  v_tries        integer := 0;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để mua hàng.' using errcode = '28000';
  end if;
  if public.is_user_banned(v_uid) then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn do vi phạm quy định VAHA Market.' using errcode = 'P0001';
  end if;
  if p_recipient_name is null or char_length(btrim(p_recipient_name)) not between 2 and 80 then
    raise exception 'Tên người nhận không hợp lệ (2–80 ký tự).' using errcode = '22023';
  end if;
  if p_phone is null or p_phone !~ '^[0-9+ ]{8,15}$' then
    raise exception 'Số điện thoại không hợp lệ.' using errcode = '22023';
  end if;
  if p_address is null or char_length(btrim(p_address)) not between 10 and 400 then
    raise exception 'Địa chỉ nhận hàng không hợp lệ (10–400 ký tự).' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Ghi chú quá dài (tối đa 500 ký tự).' using errcode = '22023';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'active' then
    raise exception 'Sản phẩm không còn khả dụng.' using errcode = 'P0001';
  end if;
  if v_listing.seller_id = v_uid then
    raise exception 'Bạn không thể mua sản phẩm của chính mình.' using errcode = 'P0001';
  end if;
  if not v_listing.ship_cod then
    raise exception 'Tin này chỉ giao dịch trực tiếp, không mua qua trung gian được.' using errcode = 'P0001';
  end if;

  select * into v_bank
    from public.bank_accounts
   where id = v_listing.bank_account_id and user_id = v_listing.seller_id;
  if not found then
    raise exception 'Người bán chưa có tài khoản nhận tiền hợp lệ.' using errcode = 'P0001';
  end if;

  -- Đọc mức phí toàn sàn (0–500 bp) và trần phí tối đa (0 = không giới hạn); người bán Mod luôn 0%
  select round(global_fee_rate * 10000)::integer, coalesce(fee_cap_vnd, 500000)
    into v_global_bp, v_fee_cap
    from public.platform_settings
   where id = 1;
  v_global_bp := coalesce(v_global_bp, 500);
  v_fee_cap   := coalesce(v_fee_cap, 500000);

  select coalesce(is_mod, false) into v_is_mod from public.profiles where id = v_listing.seller_id;
  v_bp := case when v_is_mod then 0 else v_global_bp end;

  v_uncapped_fee := round(v_listing.price * v_bp / 10000.0)::bigint;

  if v_fee_cap > 0 and v_uncapped_fee > v_fee_cap then
    v_total_fee := v_fee_cap;
    v_fee_saved := v_uncapped_fee - v_fee_cap;
  else
    v_total_fee := v_uncapped_fee;
    v_fee_saved := 0;
  end if;

  -- Chia phí dựa trên v_total_fee ĐÃ ÁP TRẦN (đảm bảo buyer_fee + seller_fee = v_total_fee <= v_fee_cap)
  if v_listing.fee_payer = 'BUYER' then
    v_buyer_fee  := v_total_fee;
    v_seller_fee := 0;
  elsif v_listing.fee_payer = 'SPLIT' then
    v_buyer_fee  := round(v_total_fee / 2.0)::bigint;
    v_seller_fee := v_total_fee - v_buyer_fee;
  else
    v_buyer_fee  := 0;
    v_seller_fee := v_total_fee;
  end if;

  -- Số tiền khác với giá người mua đang thấy (admin vừa đổi phí/trần phí/giá) → dừng, không tạo đơn
  if p_expected_amount is not null and p_expected_amount <> v_listing.price + v_buyer_fee then
    raise exception 'Giá vừa thay đổi (hiện là % đ). Vui lòng tải lại trang để xem giá mới trước khi mua.', (v_listing.price + v_buyer_fee)
      using errcode = 'P0001';
  end if;

  loop
    begin
      insert into public.orders (
        payment_code, listing_id, listing_snapshot, buyer_id, seller_id,
        amount, platform_fee, seller_payout,
        list_price, fee_payer, fee_rate_bp, buyer_fee, seller_fee,
        fee_cap_vnd, fee_saved_amount,
        recipient_name, phone, address, note, expires_at
      ) values (
        'CNTH' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        v_listing.id,
        jsonb_build_object(
          'title', v_listing.title,
          'image', v_listing.images -> 0 ->> 'url',
          'price', v_listing.price
        ),
        v_uid, v_listing.seller_id,
        v_listing.price + v_buyer_fee, v_total_fee, v_listing.price - v_seller_fee,
        v_listing.price, v_listing.fee_payer, v_bp, v_buyer_fee, v_seller_fee,
        v_fee_cap, v_fee_saved,
        btrim(p_recipient_name), p_phone, btrim(p_address), nullif(btrim(coalesce(p_note, '')), ''),
        now() + interval '15 minutes'
      )
      returning * into v_order;
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries >= 5 then raise; end if;
    end;
  end loop;

  insert into public.order_payouts (
    order_id, seller_id, bank_bin, bank_code, bank_name, account_number, account_name, amount
  ) values (
    v_order.id, v_listing.seller_id, v_bank.bank_bin, v_bank.bank_code, v_bank.bank_name,
    v_bank.account_number, v_bank.account_name, v_order.seller_payout
  );

  update public.listings set status = 'reserved' where id = v_listing.id;

  return v_order;
end;
$$;

-- 5. Cập nhật trigger email đơn hàng: gửi kèm thông tin trần phí & tiền tiết kiệm -----
create or replace function public.trg_orders_email_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name  text;
  v_title text := coalesce(new.listing_snapshot ->> 'title', new.payment_code);
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- (1) Đơn vừa thanh toán (PAID_HELD) -> gửi Người bán
  if new.status = 'PAID_HELD' then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.seller_id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',          'ORDER_PAID',
      'to',             v_email,
      'recipientName',  v_name,
      'orderId',        new.id,
      'paymentCode',    new.payment_code,
      'listingTitle',   v_title,
      'amount',         new.amount,
      'sellerPayout',   new.seller_payout,
      'isFeeCapped',    (coalesce(new.fee_saved_amount, 0) > 0),
      'feeCapVnd',      coalesce(new.fee_cap_vnd, 500000),
      'feeSavedAmount', coalesce(new.fee_saved_amount, 0)
    ));

  -- (2) Người bán đã gửi hàng (SHIPPED) -> gửi Người mua
  elsif new.status = 'SHIPPED' then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.buyer_id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',           'ORDER_SHIPPED',
      'to',              v_email,
      'recipientName',   v_name,
      'orderId',         new.id,
      'paymentCode',     new.payment_code,
      'listingTitle',    v_title,
      'carrier',         new.carrier,
      'trackingCode',    new.tracking_code,
      'packingVideoUrl', new.packing_video_url
    ));

  -- (3) Người mua xác nhận đã nhận hàng (COMPLETED) -> gửi Người bán
  elsif new.status = 'COMPLETED' then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.seller_id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',          'ORDER_COMPLETED',
      'to',             v_email,
      'recipientName',  v_name,
      'orderId',        new.id,
      'paymentCode',    new.payment_code,
      'listingTitle',   v_title,
      'sellerPayout',   new.seller_payout,
      'isFeeCapped',    (coalesce(new.fee_saved_amount, 0) > 0),
      'feeCapVnd',      coalesce(new.fee_cap_vnd, 500000),
      'feeSavedAmount', coalesce(new.fee_saved_amount, 0)
    ));
  end if;

  return new;
end;
$$;

-- 6. Phân quyền thực thi --------------------------------------------------------------
revoke all on function public.admin_set_fee_cap(bigint)                                 from public, anon, authenticated;
revoke all on function public.create_order(uuid, text, text, text, text, bigint)        from public, anon, authenticated;
revoke all on function public.trg_orders_email_notify()                                 from public, anon, authenticated;

grant execute on function public.admin_set_fee_cap(bigint)                              to authenticated;
grant execute on function public.create_order(uuid, text, text, text, text, bigint)     to authenticated;
