-- =====================================================================
--  PATCH 011 — VAHA Market v1.9.5: Hủy & Hoàn tiền tự động hóa (48h)
--              + Bảo vệ người bán khi người mua không phản hồi quá 14 ngày
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002 → 010.
--
--  1. Cột mới trên `orders`: ship_deadline_at, refund_requested_at, refund_completed_at,
--     refund_reference, refund_bank_bin, refund_bank_code, refund_bank_name,
--     refund_account_number, refund_account_name.
--  2. Cập nhật `create_order`: bắt buộc người mua có >= 1 tài khoản ngân hàng (snapshot vào
--     refund_bank_*), giữ nguyên 100% logic Fee Cap 500.000₫ từ 010.
--  3. Cập nhật `process_bank_transaction` & `admin_manual_confirm_payment`: đặt
--     `ship_deadline_at = now() + interval '48 hours'` khi đơn chuyển sang `PAID_HELD`.
--  4. RPC mới:
--     - `seller_cancel_paid_order(p_order_id, p_reason, p_listing_action)`
--     - `buyer_cancel_overdue_order(p_order_id)`
--     - `admin_force_refund_order(p_order_id, p_reason)`
--     - `admin_mark_refunded(p_order_id, p_reference)`
--     - `admin_force_complete_shipped(p_order_id, p_note)`
--  5. Cập nhật `admin_stats()`: thêm refund_pending_count, refund_pending_amount, overdue_shipped_count.
--  6. Cập nhật trigger `trg_orders_email_notify`: gửi email khi REFUNDED, khi hoàn tiền xong,
--     và khi Admin rà soát xác nhận giao thành công sau 14 ngày.
-- =====================================================================

-- 1. Bổ sung cột mới trên public.orders -----------------------------------------------
alter table public.orders add column if not exists ship_deadline_at      timestamptz;
alter table public.orders add column if not exists refund_requested_at   timestamptz;
alter table public.orders add column if not exists refund_completed_at   timestamptz;
alter table public.orders add column if not exists refund_reference      text;
alter table public.orders add column if not exists refund_bank_bin       text;
alter table public.orders add column if not exists refund_bank_code      text;
alter table public.orders add column if not exists refund_bank_name      text;
alter table public.orders add column if not exists refund_account_number text;
alter table public.orders add column if not exists refund_account_name   text;

alter table public.orders drop constraint if exists orders_refund_reference_check;
alter table public.orders add constraint orders_refund_reference_check
  check (refund_reference is null or char_length(refund_reference) <= 120);

-- Backfill hạn gửi hàng 48h cho các đơn PAID_HELD hiện có (nếu có)
update public.orders
   set ship_deadline_at = coalesce(paid_at, created_at) + interval '48 hours'
 where status = 'PAID_HELD'
   and ship_deadline_at is null;

create index if not exists idx_orders_refund_pending
  on public.orders (refund_requested_at asc)
  where status = 'REFUNDED' and refund_completed_at is null;

create index if not exists idx_orders_shipped_at
  on public.orders (shipped_at asc)
  where status = 'SHIPPED';

-- 2. Cập nhật create_order: bắt buộc người mua có TK ngân hàng + giữ nguyên Fee Cap 500k
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
  v_buyer_bank   public.bank_accounts%rowtype;
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

  -- Bắt buộc người mua đã lưu ít nhất 1 tài khoản ngân hàng (ưu tiên mặc định, mới nhất) để nhận hoàn tiền
  select * into v_buyer_bank
    from public.bank_accounts
   where user_id = v_uid
   order by is_default desc, created_at desc
   limit 1;
  if not found then
    raise exception 'Bạn cần thêm tài khoản ngân hàng trong Cài đặt tài khoản trước khi đặt mua để nhận hoàn tiền khi cần thiết.' using errcode = 'P0001';
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

  -- Chia phí dựa trên v_total_fee ĐÃ ÁP TRẦN (buyer_fee + seller_fee = v_total_fee <= v_fee_cap)
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
        refund_bank_bin, refund_bank_code, refund_bank_name, refund_account_number, refund_account_name,
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
        v_buyer_bank.bank_bin, v_buyer_bank.bank_code, v_buyer_bank.bank_name, v_buyer_bank.account_number, v_buyer_bank.account_name,
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

-- 3. Cập nhật process_bank_transaction & admin_manual_confirm_payment: gán ship_deadline_at = now() + 48h
create or replace function public.process_bank_transaction(
  p_provider         text,
  p_provider_tx_id   text,
  p_direction        text,
  p_amount           bigint,
  p_content          text,
  p_reference_code   text,
  p_account_number   text,
  p_transaction_date timestamptz,
  p_raw              jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx_id  uuid;
  v_code   text;
  v_order  public.orders%rowtype;
  v_status text;
  v_paid   bigint;
begin
  insert into public.transactions (
    provider, provider_tx_id, direction, amount, content, reference_code,
    account_number, transaction_date, match_status, raw
  ) values (
    p_provider, p_provider_tx_id, p_direction, p_amount, coalesce(p_content, ''), p_reference_code,
    p_account_number, coalesce(p_transaction_date, now()), 'UNMATCHED', coalesce(p_raw, '{}'::jsonb)
  )
  on conflict (provider, provider_tx_id) do nothing
  returning id into v_tx_id;

  if v_tx_id is null then
    return jsonb_build_object('result', 'DUPLICATE');
  end if;

  if p_direction <> 'in' or p_amount <= 0 then
    update public.transactions set match_status = 'IGNORED' where id = v_tx_id;
    return jsonb_build_object('result', 'IGNORED');
  end if;

  v_code := (regexp_match(upper(coalesce(p_content, '')), 'CNTH[0-9A-F]{8}'))[1];
  if v_code is null then
    return jsonb_build_object('result', 'UNMATCHED');
  end if;

  select * into v_order from public.orders where payment_code = v_code for update;
  if not found then
    return jsonb_build_object('result', 'UNMATCHED');
  end if;

  if v_order.status in ('CANCELLED', 'EXPIRED') then
    v_status := 'LATE_PAYMENT';
  elsif v_order.status <> 'PENDING_PAYMENT' then
    v_status := 'EXTRA_PAYMENT';
  else
    v_paid := v_order.paid_amount + p_amount;
    if v_paid >= v_order.amount then
      v_status := case when v_paid > v_order.amount then 'OVERPAID' else 'MATCHED' end;
      update public.orders
         set status           = 'PAID_HELD',
             paid_amount      = v_paid,
             paid_at          = now(),
             ship_deadline_at = now() + interval '48 hours'
       where id = v_order.id;
    else
      v_status := 'UNDERPAID';
      update public.orders set paid_amount = v_paid where id = v_order.id;
    end if;
  end if;

  update public.transactions
     set match_status = v_status,
         order_id     = v_order.id,
         buyer_id     = v_order.buyer_id,
         seller_id    = v_order.seller_id
   where id = v_tx_id;

  return jsonb_build_object('result', v_status, 'order_id', v_order.id);
end;
$$;

create or replace function public.admin_manual_confirm_payment(p_order_id uuid, p_note text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order   public.orders%rowtype;
  v_listing public.listings%rowtype;
  v_note    text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_note) not between 5 and 1000 then
    raise exception 'Hãy ghi chú căn cứ duyệt (ví dụ mã giao dịch ngân hàng), 5–1000 ký tự.' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;

  if v_order.status = 'PENDING_PAYMENT' then
    null;
  elsif v_order.status = 'EXPIRED' then
    select * into v_listing from public.listings where id = v_order.listing_id for update;
    if not found or v_listing.status <> 'active' then
      raise exception 'Tin đã được người khác đặt hoặc không còn. Không thể khôi phục đơn — hãy hoàn tiền thủ công.' using errcode = 'P0001';
    end if;
    update public.listings set status = 'reserved' where id = v_listing.id;
  else
    raise exception 'Chỉ duyệt thủ công đơn chờ thanh toán hoặc đơn vừa hết hạn.' using errcode = 'P0001';
  end if;

  update public.orders
     set status           = 'PAID_HELD',
         paid_amount      = greatest(paid_amount, amount),
         paid_at          = now(),
         ship_deadline_at = now() + interval '48 hours',
         cancelled_at     = null,
         cancel_reason    = null,
         admin_note       = v_note
   where id = v_order.id
   returning * into v_order;

  insert into public.admin_audit_log (admin_id, action, order_id, note)
  values ((select auth.uid()), 'MANUAL_CONFIRM_PAYMENT', v_order.id, v_note);

  return v_order;
end;
$$;

-- 4. RPC 1: Người bán chủ động báo hết hàng / hủy đơn khi đang PAID_HELD --------------
create or replace function public.seller_cancel_paid_order(
  p_order_id       uuid,
  p_reason         text,
  p_listing_action text default 'hidden'
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_order  public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'Hãy nhập lý do hủy đơn (5–500 ký tự).' using errcode = '22023';
  end if;
  if coalesce(p_listing_action, 'hidden') not in ('hidden', 'sold') then
    raise exception 'Trạng thái tin đăng sau hủy không hợp lệ.' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.seller_id <> v_uid then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'PAID_HELD' then
    raise exception 'Chỉ có thể hủy đơn khi đơn đang ở trạng thái đã thanh toán – chờ gửi hàng.' using errcode = 'P0001';
  end if;

  update public.orders
     set status              = 'REFUNDED',
         cancelled_at        = now(),
         refund_requested_at = now(),
         cancel_reason       = 'Người bán hủy đơn: ' || v_reason
   where id = v_order.id
   returning * into v_order;

  update public.listings
     set status = case when p_listing_action = 'sold' then 'sold'::public.listing_status else 'hidden'::public.listing_status end
   where id = v_order.listing_id
     and status = 'reserved';

  return v_order;
end;
$$;

-- 5. RPC 2: Người mua hủy đơn quá hạn gửi hàng 48 giờ --------------------------------
create or replace function public.buyer_cancel_overdue_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_order    public.orders%rowtype;
  v_deadline timestamptz;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.buyer_id <> v_uid then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'PAID_HELD' then
    raise exception 'Chỉ có thể yêu cầu hủy hoàn tiền khi đơn đang chờ người bán gửi hàng.' using errcode = 'P0001';
  end if;

  v_deadline := coalesce(v_order.ship_deadline_at, v_order.paid_at + interval '48 hours');
  if v_deadline is null or now() <= v_deadline then
    raise exception 'Chưa quá thời hạn gửi hàng 48 giờ của người bán.' using errcode = 'P0001';
  end if;

  update public.orders
     set status              = 'REFUNDED',
         cancelled_at        = now(),
         refund_requested_at = now(),
         cancel_reason       = 'Người bán quá hạn gửi hàng (48 giờ)'
   where id = v_order.id
   returning * into v_order;

  update public.listings
     set status = 'hidden'
   where id = v_order.listing_id
     and status = 'reserved';

  return v_order;
end;
$$;

-- 6. RPC 3: Admin cưỡng chế hủy & đưa đơn vào hàng đợi hoàn tiền ----------------------
create or replace function public.admin_force_refund_order(p_order_id uuid, p_reason text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order  public.orders%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'Hãy nhập lý do hủy hoàn tiền (5–500 ký tự).' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status not in ('PAID_HELD', 'SHIPPED') then
    raise exception 'Chỉ áp dụng cho đơn đang giữ tiền (PAID_HELD) hoặc đang giao hàng (SHIPPED).' using errcode = 'P0001';
  end if;

  update public.orders
     set status              = 'REFUNDED',
         cancelled_at        = now(),
         refund_requested_at = now(),
         cancel_reason       = v_reason,
         admin_note          = v_reason
   where id = v_order.id
   returning * into v_order;

  update public.listings
     set status = 'hidden'
   where id = v_order.listing_id
     and status = 'reserved';

  insert into public.admin_audit_log (admin_id, action, order_id, note)
  values ((select auth.uid()), 'ADMIN_FORCE_REFUND', v_order.id, v_reason);

  return v_order;
end;
$$;

-- 7. RPC 4: Admin xác nhận đã chuyển khoản hoàn tiền cho người mua --------------------
create or replace function public.admin_mark_refunded(p_order_id uuid, p_reference text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_ref   text := nullif(left(btrim(coalesce(p_reference, '')), 120), '');
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'REFUNDED' then
    raise exception 'Chỉ đánh dấu hoàn tiền cho đơn ở trạng thái REFUNDED.' using errcode = 'P0001';
  end if;
  if v_order.refund_completed_at is not null then
    raise exception 'Đơn hàng này đã được đánh dấu hoàn tiền trước đó.' using errcode = 'P0001';
  end if;

  update public.orders
     set refund_completed_at = now(),
         refund_reference    = v_ref
   where id = v_order.id
   returning * into v_order;

  insert into public.admin_audit_log (admin_id, action, order_id, note)
  values ((select auth.uid()), 'MARK_REFUNDED', v_order.id, coalesce(v_ref, 'Admin xác nhận đã chuyển khoản hoàn tiền'));

  return v_order;
end;
$$;

-- 8. RPC 5: Admin xác nhận giao thành công & mở khóa giải ngân cho đơn SHIPPED > 14 ngày
create or replace function public.admin_force_complete_shipped(p_order_id uuid, p_note text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_note  text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_note) not between 5 and 1000 then
    raise exception 'Hãy ghi căn cứ kiểm tra vận đơn (5–1000 ký tự).' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'SHIPPED' then
    raise exception 'Chỉ áp dụng cho đơn đang ở trạng thái đang giao hàng (SHIPPED).' using errcode = 'P0001';
  end if;
  if v_order.shipped_at is null or v_order.shipped_at > now() - interval '14 days' then
    raise exception 'Chỉ áp dụng sau khi đơn đã gửi hàng quá 14 ngày mà người mua không phản hồi.' using errcode = 'P0001';
  end if;

  update public.orders
     set status       = 'COMPLETED',
         completed_at = now(),
         resolved_at  = now(),
         admin_note   = v_note
   where id = v_order.id
   returning * into v_order;

  update public.order_payouts set status = 'PENDING' where order_id = v_order.id;
  update public.listings      set status = 'sold'    where id = v_order.listing_id;
  update public.profiles      set sold_count   = sold_count   + 1 where id = v_order.seller_id;
  update public.profiles      set bought_count = bought_count + 1 where id = v_order.buyer_id;

  insert into public.admin_audit_log (admin_id, action, order_id, note)
  values ((select auth.uid()), 'ADMIN_FORCE_COMPLETE_SHIPPED', v_order.id, v_note);

  return v_order;
end;
$$;

-- 9. Cập nhật admin_stats(): thêm refund_pending_count, refund_pending_amount, overdue_shipped_count
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'gmv',                   coalesce(sum(list_price)   filter (where status in ('COMPLETED', 'PAID_OUT')), 0),
    'fees',                  coalesce(sum(platform_fee) filter (where status in ('COMPLETED', 'PAID_OUT')), 0),
    'held_count',            count(*)                   filter (where status in ('PAID_HELD', 'SHIPPED')),
    'held_amount',           coalesce(sum(amount)       filter (where status in ('PAID_HELD', 'SHIPPED')), 0),
    'dispute_count',         count(*)                   filter (where status = 'DISPUTED'),
    'refund_pending_count',  count(*)                   filter (where status = 'REFUNDED' and paid_amount > 0 and refund_completed_at is null),
    'refund_pending_amount', coalesce(sum(paid_amount)  filter (where status = 'REFUNDED' and paid_amount > 0 and refund_completed_at is null), 0),
    'overdue_shipped_count', count(*)                   filter (where status = 'SHIPPED' and shipped_at is not null and shipped_at <= now() - interval '14 days')
  ) into v_result
  from public.orders;

  v_result := v_result || jsonb_build_object(
    'payout_pending_count',  (select count(*) from public.order_payouts where status = 'PENDING'),
    'payout_pending_amount', (select coalesce(sum(amount), 0) from public.order_payouts where status = 'PENDING'),
    'flagged_tx_count',      (select count(*) from public.transactions
                               where resolved_at is null
                                 and match_status in ('UNDERPAID', 'LATE_PAYMENT', 'EXTRA_PAYMENT', 'UNMATCHED', 'OVERPAID')),
    'pending_review_count',  (select count(*) from public.listings where status::text = 'pending_review'),
    'banned_count',          (select count(*) from public.profiles where is_banned = true)
  );

  return v_result;
end;
$$;

-- 10. Cập nhật Trigger Email cho orders (hỗ trợ REFUNDED, hoàn tiền xong, hoàn tất quá 14 ngày)
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
  -- (A) Admin vừa xác nhận chuyển khoản hoàn tiền xong (refund_completed_at: null -> not null)
  if new.status = 'REFUNDED' and old.refund_completed_at is null and new.refund_completed_at is not null then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.buyer_id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',         'ORDER_REFUND_COMPLETED',
      'to',            v_email,
      'recipientName', v_name,
      'orderId',       new.id,
      'paymentCode',   new.payment_code,
      'listingTitle',  v_title,
      'amount',        greatest(new.paid_amount, new.amount),
      'bankName',      new.refund_bank_name,
      'accountNumber', new.refund_account_number,
      'accountName',   new.refund_account_name,
      'reference',     new.refund_reference
    ));
    return new;
  end if;

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

  -- (3) Đơn hoàn tất (COMPLETED: người mua xác nhận HOẶC Admin xác nhận sau 14 ngày) -> gửi Người bán
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
      'adminNote',      new.admin_note,
      'isFeeCapped',    (coalesce(new.fee_saved_amount, 0) > 0),
      'feeCapVnd',      coalesce(new.fee_cap_vnd, 500000),
      'feeSavedAmount', coalesce(new.fee_saved_amount, 0)
    ));

  -- (4) Đơn chuyển sang REFUNDED (hủy hoàn tiền) -> gửi Người mua
  elsif new.status = 'REFUNDED' then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.buyer_id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',         'ORDER_REFUND_REQUESTED',
      'to',            v_email,
      'recipientName', v_name,
      'orderId',       new.id,
      'paymentCode',   new.payment_code,
      'listingTitle',  v_title,
      'amount',        greatest(new.paid_amount, new.amount),
      'cancelReason',  coalesce(new.cancel_reason, new.admin_note),
      'bankName',      new.refund_bank_name,
      'accountNumber', new.refund_account_number,
      'accountName',   new.refund_account_name
    ));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_email_notify on public.orders;
create trigger trg_orders_email_notify
  after update of status, refund_completed_at on public.orders
  for each row execute function public.trg_orders_email_notify();

-- 11. Phân quyền thực thi -------------------------------------------------------------
revoke all on function public.create_order(uuid, text, text, text, text, bigint) from public, anon, authenticated;
revoke all on function public.process_bank_transaction(text, text, text, bigint, text, text, text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.admin_manual_confirm_payment(uuid, text)           from public, anon, authenticated;
revoke all on function public.seller_cancel_paid_order(uuid, text, text)         from public, anon, authenticated;
revoke all on function public.buyer_cancel_overdue_order(uuid)                   from public, anon, authenticated;
revoke all on function public.admin_force_refund_order(uuid, text)               from public, anon, authenticated;
revoke all on function public.admin_mark_refunded(uuid, text)                    from public, anon, authenticated;
revoke all on function public.admin_force_complete_shipped(uuid, text)           from public, anon, authenticated;
revoke all on function public.admin_stats()                                      from public, anon, authenticated;
revoke all on function public.trg_orders_email_notify()                          from public, anon, authenticated;

grant execute on function public.create_order(uuid, text, text, text, text, bigint) to authenticated;
grant execute on function public.process_bank_transaction(text, text, text, bigint, text, text, text, timestamptz, jsonb) to service_role;
grant execute on function public.admin_manual_confirm_payment(uuid, text)           to authenticated;
grant execute on function public.seller_cancel_paid_order(uuid, text, text)         to authenticated;
grant execute on function public.buyer_cancel_overdue_order(uuid)                   to authenticated;
grant execute on function public.admin_force_refund_order(uuid, text)               to authenticated;
grant execute on function public.admin_mark_refunded(uuid, text)                    to authenticated;
grant execute on function public.admin_force_complete_shipped(uuid, text)           to authenticated;
grant execute on function public.admin_stats()                                      to authenticated;
