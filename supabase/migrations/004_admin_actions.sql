-- =====================================================================
--  PATCH 004 — Nghiệp vụ Admin: phân xử khiếu nại, duyệt thanh toán tay, tra soát giao dịch lệch
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql, 002, 003.
--
--  • MỌI hàm admin đều tự kiểm tra public.is_admin() ở tầng DB (không tin giao diện).
--  • enum order_status ĐÃ có sẵn 'REFUNDED' (khai báo ở schema.sql) nên không cần bổ sung.
--  • Mọi hành động admin được ghi vào bảng admin_audit_log.
-- =====================================================================

-- 1. Cột mới ------------------------------------------------------------
alter table public.orders add column if not exists admin_note  text;
alter table public.orders add column if not exists resolved_at timestamptz;
alter table public.orders drop constraint if exists orders_admin_note_check;
alter table public.orders add constraint orders_admin_note_check
  check (admin_note is null or char_length(admin_note) <= 1000);

alter table public.transactions add column if not exists resolved_at   timestamptz;
alter table public.transactions add column if not exists resolved_by   uuid references auth.users (id) on delete set null;
alter table public.transactions add column if not exists resolved_note text;
alter table public.transactions drop constraint if exists transactions_resolved_note_check;
alter table public.transactions add constraint transactions_resolved_note_check
  check (resolved_note is null or char_length(resolved_note) <= 1000);

-- 2. Nhật ký thao tác admin ---------------------------------------------
create table if not exists public.admin_audit_log (
  id             uuid primary key default gen_random_uuid(),
  admin_id       uuid references auth.users (id) on delete set null,
  action         text not null,
  order_id       uuid references public.orders (id) on delete set null,
  transaction_id uuid references public.transactions (id) on delete set null,
  note           text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_admin_audit_created on public.admin_audit_log (created_at desc);
alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

drop policy if exists "audit_select_admin" on public.admin_audit_log;
create policy "audit_select_admin" on public.admin_audit_log
  for select to authenticated
  using (public.is_admin());

-- 3. Thống kê tổng quan (tính ở DB, không giới hạn số dòng) ------------------
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
    'gmv',                  coalesce(sum(amount)       filter (where status in ('COMPLETED', 'PAID_OUT')), 0),
    'fees',                 coalesce(sum(platform_fee) filter (where status in ('COMPLETED', 'PAID_OUT')), 0),
    'held_count',           count(*)                   filter (where status in ('PAID_HELD', 'SHIPPED')),
    'held_amount',          coalesce(sum(amount)       filter (where status in ('PAID_HELD', 'SHIPPED')), 0),
    'dispute_count',        count(*)                   filter (where status = 'DISPUTED')
  ) into v_result
  from public.orders;

  v_result := v_result || jsonb_build_object(
    'payout_pending_count',  (select count(*) from public.order_payouts where status = 'PENDING'),
    'payout_pending_amount', (select coalesce(sum(amount), 0) from public.order_payouts where status = 'PENDING'),
    'flagged_tx_count',      (select count(*) from public.transactions
                               where resolved_at is null
                                 and match_status in ('UNDERPAID', 'LATE_PAYMENT', 'EXTRA_PAYMENT', 'UNMATCHED', 'OVERPAID'))
  );

  return v_result;
end;
$$;

-- 4. Giải ngân xong (viết lại để ghi audit; giữ nguyên chữ ký và hành vi) -----------
create or replace function public.admin_mark_paid_out(p_order_id uuid, p_reference text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'COMPLETED' then
    raise exception 'Chỉ giải ngân cho đơn đã hoàn tất.' using errcode = 'P0001';
  end if;

  update public.orders set status = 'PAID_OUT' where id = v_order.id returning * into v_order;
  update public.order_payouts
     set status = 'DONE', paid_out_at = now(), reference = left(p_reference, 120)
   where order_id = v_order.id;

  insert into public.admin_audit_log (admin_id, action, order_id, note)
  values ((select auth.uid()), 'MARK_PAID_OUT', v_order.id, left(p_reference, 120));

  return v_order;
end;
$$;

-- 5. Phân xử khiếu nại ---------------------------------------------------
create or replace function public.admin_resolve_dispute(
  p_order_id   uuid,
  p_decision   text,
  p_admin_note text
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_note  text := btrim(coalesce(p_admin_note, ''));
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if p_decision not in ('RELEASE_TO_SELLER', 'REFUND_TO_BUYER') then
    raise exception 'Quyết định không hợp lệ.' using errcode = '22023';
  end if;
  if char_length(v_note) not between 5 and 1000 then
    raise exception 'Hãy nhập ghi chú phán quyết (5–1000 ký tự).' using errcode = '22023';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'DISPUTED' then
    raise exception 'Chỉ xử lý được đơn đang khiếu nại.' using errcode = 'P0001';
  end if;

  if p_decision = 'RELEASE_TO_SELLER' then
    -- Bác bỏ khiếu nại: hoàn tất đơn → vào hàng đợi giải ngân (giống confirm_received)
    update public.orders
       set status = 'COMPLETED', completed_at = now(), resolved_at = now(), admin_note = v_note
     where id = v_order.id
     returning * into v_order;

    update public.order_payouts set status = 'PENDING' where order_id = v_order.id;
    update public.listings      set status = 'sold'    where id = v_order.listing_id;
    update public.profiles      set sold_count   = sold_count   + 1 where id = v_order.seller_id;
    update public.profiles      set bought_count = bought_count + 1 where id = v_order.buyer_id;
  else
    -- Hoàn tiền cho người mua. Việc chuyển khoản hoàn tiền do admin làm thủ công ngoài hệ thống.
    update public.orders
       set status = 'REFUNDED', resolved_at = now(), admin_note = v_note
     where id = v_order.id
     returning * into v_order;

    -- Hàng đã trả về người bán: chuyển tin sang "ẩn" để người bán tự mở bán lại khi sẵn sàng
    update public.listings set status = 'hidden'
     where id = v_order.listing_id and status = 'reserved';
  end if;

  insert into public.admin_audit_log (admin_id, action, order_id, note)
  values ((select auth.uid()), 'RESOLVE_DISPUTE_' || p_decision, v_order.id, v_note);

  return v_order;
end;
$$;

-- 6. Duyệt thanh toán thủ công (người mua chuyển đúng tiền nhưng quên/ghi sai mã) -----------
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
    null;  -- hợp lệ
  elsif v_order.status = 'EXPIRED' then
    -- Đơn vừa hết hạn: chỉ khôi phục nếu tin chưa bị người khác đặt
    select * into v_listing from public.listings where id = v_order.listing_id for update;
    if not found or v_listing.status <> 'active' then
      raise exception 'Tin đã được người khác đặt hoặc không còn. Không thể khôi phục đơn — hãy hoàn tiền thủ công.' using errcode = 'P0001';
    end if;
    update public.listings set status = 'reserved' where id = v_listing.id;
  else
    raise exception 'Chỉ duyệt thủ công đơn chờ thanh toán hoặc đơn vừa hết hạn.' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'PAID_HELD',
         paid_amount = greatest(paid_amount, amount),
         paid_at = now(),
         cancelled_at = null,
         cancel_reason = null,
         admin_note = v_note
   where id = v_order.id
   returning * into v_order;

  insert into public.admin_audit_log (admin_id, action, order_id, note)
  values ((select auth.uid()), 'MANUAL_CONFIRM_PAYMENT', v_order.id, v_note);

  return v_order;
end;
$$;

-- 7. Đánh dấu giao dịch lệch đã xử lý -----------------------------------------
create or replace function public.admin_mark_transaction_resolved(p_tx_id uuid, p_note text)
returns public.transactions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx   public.transactions%rowtype;
  v_note text := btrim(coalesce(p_note, ''));
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_note) not between 3 and 1000 then
    raise exception 'Hãy ghi chú cách xử lý (ví dụ mã giao dịch hoàn tiền), 3–1000 ký tự.' using errcode = '22023';
  end if;

  select * into v_tx from public.transactions where id = p_tx_id for update;
  if not found then
    raise exception 'Không tìm thấy giao dịch.' using errcode = 'P0001';
  end if;
  if v_tx.match_status not in ('UNDERPAID', 'LATE_PAYMENT', 'EXTRA_PAYMENT', 'UNMATCHED', 'OVERPAID') then
    raise exception 'Giao dịch này không thuộc nhóm cần tra soát.' using errcode = 'P0001';
  end if;
  if v_tx.resolved_at is not null then
    raise exception 'Giao dịch đã được đánh dấu xử lý trước đó.' using errcode = 'P0001';
  end if;

  update public.transactions
     set resolved_at = now(), resolved_by = (select auth.uid()), resolved_note = v_note
   where id = v_tx.id
   returning * into v_tx;

  insert into public.admin_audit_log (admin_id, action, order_id, transaction_id, note)
  values ((select auth.uid()), 'RESOLVE_TRANSACTION', v_tx.order_id, v_tx.id, v_note);

  return v_tx;
end;
$$;

-- 8. Phân quyền thực thi (hàm tự kiểm tra is_admin nên chỉ cần cấp cho authenticated) ------------
revoke all on function public.admin_stats()                                    from public, anon, authenticated;
revoke all on function public.admin_mark_paid_out(uuid, text)                  from public, anon, authenticated;
revoke all on function public.admin_resolve_dispute(uuid, text, text)          from public, anon, authenticated;
revoke all on function public.admin_manual_confirm_payment(uuid, text)         from public, anon, authenticated;
revoke all on function public.admin_mark_transaction_resolved(uuid, text)      from public, anon, authenticated;

grant execute on function public.admin_stats()                                 to authenticated;
grant execute on function public.admin_mark_paid_out(uuid, text)               to authenticated;
grant execute on function public.admin_resolve_dispute(uuid, text, text)       to authenticated;
grant execute on function public.admin_manual_confirm_payment(uuid, text)      to authenticated;
grant execute on function public.admin_mark_transaction_resolved(uuid, text)   to authenticated;
