-- =====================================================================
--  PATCH 003 — Khiếu nại, video đóng gói, hết hạn đơn 15 phút, link Facebook người bán
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002.
--
--  Kết quả kiểm tra schema.sql trước patch này:
--   • enum order_status ĐÃ có 'DISPUTED', nhưng KHÔNG có hàm nào chuyển đơn sang DISPUTED
--   • CHƯA có cột: packing_video_url, dispute_reason, dispute_video_url, disputed_at
--   • create_order đang đặt thời hạn thanh toán 30 phút (yêu cầu mới: 15 phút)
--   • mark_shipped chưa nhận link video đóng gói
--   • profile_contacts chỉ chủ sở hữu đọc được → người mua không thấy Facebook người bán
-- =====================================================================

-- 1. Cột mới cho orders ------------------------------------------------
alter table public.orders add column if not exists packing_video_url text;   -- video test của người bán
alter table public.orders add column if not exists dispute_reason    text;
alter table public.orders add column if not exists dispute_video_url text;   -- video unbox của người mua
alter table public.orders add column if not exists disputed_at       timestamptz;

alter table public.orders drop constraint if exists orders_packing_video_url_check;
alter table public.orders add constraint orders_packing_video_url_check
  check (packing_video_url is null or (char_length(packing_video_url) <= 500 and packing_video_url ~* '^https?://[^\s]+$'));

alter table public.orders drop constraint if exists orders_dispute_video_url_check;
alter table public.orders add constraint orders_dispute_video_url_check
  check (dispute_video_url is null or (char_length(dispute_video_url) <= 500 and dispute_video_url ~* '^https?://[^\s]+$'));

alter table public.orders drop constraint if exists orders_dispute_reason_check;
alter table public.orders add constraint orders_dispute_reason_check
  check (dispute_reason is null or char_length(dispute_reason) <= 1000);

-- 2. create_order: thời hạn thanh toán 15 phút (giữ nguyên toàn bộ logic còn lại) ----------
create or replace function public.create_order(
  p_listing_id     uuid,
  p_recipient_name text,
  p_phone          text,
  p_address        text,
  p_note           text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_listing public.listings%rowtype;
  v_bank    public.bank_accounts%rowtype;
  v_order   public.orders%rowtype;
  v_fee     bigint;
  v_tries   integer := 0;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để mua hàng.' using errcode = '28000';
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

  v_fee := round(v_listing.price * 0.05)::bigint;

  loop
    begin
      insert into public.orders (
        payment_code, listing_id, listing_snapshot, buyer_id, seller_id,
        amount, platform_fee, seller_payout,
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
        v_listing.price, v_fee, v_listing.price - v_fee,
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

-- 3. mark_shipped: bắt buộc đơn vị vận chuyển, mã vận đơn, link video test ----------------
drop function if exists public.mark_shipped(uuid, text, text);

create or replace function public.mark_shipped(
  p_order_id          uuid,
  p_carrier           text,
  p_tracking_code     text,
  p_packing_video_url text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;
  if p_carrier is null or char_length(btrim(p_carrier)) not between 2 and 60 then
    raise exception 'Hãy nhập đơn vị vận chuyển.' using errcode = '22023';
  end if;
  if p_tracking_code is null or char_length(btrim(p_tracking_code)) not between 3 and 60 then
    raise exception 'Hãy nhập mã vận đơn (3–60 ký tự).' using errcode = '22023';
  end if;
  if p_packing_video_url is null or p_packing_video_url !~* '^https?://[^\s]+$' or char_length(p_packing_video_url) > 500 then
    raise exception 'Link video test sản phẩm không hợp lệ (cần bắt đầu bằng http:// hoặc https://).' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.seller_id <> v_uid then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'PAID_HELD' then
    raise exception 'Chỉ gửi hàng khi sàn đã nhận tiền của người mua.' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'SHIPPED', shipped_at = now(),
         carrier = btrim(p_carrier),
         tracking_code = btrim(p_tracking_code),
         packing_video_url = btrim(p_packing_video_url)
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

-- 4. open_dispute: người mua khiếu nại (SHIPPED → DISPUTED) -------------------------------
create or replace function public.open_dispute(
  p_order_id  uuid,
  p_reason    text,
  p_video_url text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) not between 10 and 1000 then
    raise exception 'Hãy mô tả lý do khiếu nại (10–1000 ký tự).' using errcode = '22023';
  end if;
  if p_video_url is null or p_video_url !~* '^https?://[^\s]+$' or char_length(p_video_url) > 500 then
    raise exception 'Link video mở hộp không hợp lệ (cần bắt đầu bằng http:// hoặc https://).' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.buyer_id <> v_uid then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'SHIPPED' then
    raise exception 'Chỉ khiếu nại được khi đơn đang giao.' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'DISPUTED', disputed_at = now(),
         dispute_reason = btrim(p_reason), dispute_video_url = btrim(p_video_url)
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

-- 5. expire_order_if_due: người mua/bán gọi khi đồng hồ về 0 (không phụ thuộc pg_cron) -----
create or replace function public.expire_order_if_due(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or (v_order.buyer_id <> v_uid and v_order.seller_id <> v_uid) then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;

  if v_order.status = 'PENDING_PAYMENT' and v_order.expires_at < now() then
    update public.orders
       set status = 'EXPIRED', cancelled_at = now(), cancel_reason = 'Hết hạn thanh toán'
     where id = v_order.id
     returning * into v_order;

    update public.listings set status = 'active'
     where id = v_order.listing_id and status = 'reserved';
  end if;

  return v_order;  -- luôn trả về trạng thái hiện tại
end;
$$;

-- 6. Link Facebook người bán: công khai có chủ đích (người mua cần kiểm tra uy tín) ---------
create or replace function public.get_seller_facebook(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select facebook_url from public.profile_contacts where user_id = p_user_id;
$$;

-- 7. Phân quyền thực thi -----------------------------------------------------------------
revoke all on function public.create_order(uuid, text, text, text, text)       from public, anon, authenticated;
revoke all on function public.mark_shipped(uuid, text, text, text)             from public, anon, authenticated;
revoke all on function public.open_dispute(uuid, text, text)                   from public, anon, authenticated;
revoke all on function public.expire_order_if_due(uuid)                        from public, anon, authenticated;
revoke all on function public.get_seller_facebook(uuid)                        from public, anon, authenticated;

grant execute on function public.create_order(uuid, text, text, text, text)    to authenticated;
grant execute on function public.mark_shipped(uuid, text, text, text)          to authenticated;
grant execute on function public.open_dispute(uuid, text, text)                to authenticated;
grant execute on function public.expire_order_if_due(uuid)                     to authenticated;
grant execute on function public.get_seller_facebook(uuid)                     to anon, authenticated;
