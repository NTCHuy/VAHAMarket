-- =====================================================================
--  PATCH 013 — VAHA Market v2.0.3:
--    Sổ minh bạch dòng tiền trung gian công khai (đọc trực tiếp từ Database,
--    không phụ thuộc bảng transactions / SePay, ẩn toàn bộ dữ liệu cá nhân).
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002 -> 012.
-- =====================================================================

-- 1. Tổng hợp số liệu dòng tiền công khai (từ orders & order_payouts) -----------------
create or replace function public.get_escrow_transparency_summary()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total_inflow_vnd', coalesce((
      select sum(coalesce(paid_amount, amount))
        from public.orders
       where paid_at is not null
         and status in ('PAID_HELD', 'SHIPPED', 'DISPUTED', 'COMPLETED', 'PAID_OUT', 'REFUNDED')
    ), 0),
    'currently_held_vnd', coalesce((
      select sum(coalesce(paid_amount, amount))
        from public.orders
       where paid_at is not null
         and (
           status in ('PAID_HELD', 'SHIPPED', 'DISPUTED', 'COMPLETED')
           or (status = 'REFUNDED' and refund_completed_at is null)
         )
    ), 0),
    'total_paid_out_vnd', coalesce((
      select sum(amount)
        from public.order_payouts
       where status = 'DONE'
    ), 0),
    'total_refunded_vnd', coalesce((
      select sum(coalesce(paid_amount, amount))
        from public.orders
       where status = 'REFUNDED'
         and refund_completed_at is not null
    ), 0),
    'completed_orders_count', coalesce((
      select count(*)
        from public.orders
       where status in ('COMPLETED', 'PAID_OUT')
    ), 0),
    'active_held_count', coalesce((
      select count(*)
        from public.orders
       where paid_at is not null
         and (
           status in ('PAID_HELD', 'SHIPPED', 'DISPUTED', 'COMPLETED')
           or (status = 'REFUNDED' and refund_completed_at is null)
         )
    ), 0),
    'updated_at', now()
  );
$$;

revoke all on function public.get_escrow_transparency_summary() from public, anon, authenticated;
grant execute on function public.get_escrow_transparency_summary() to anon, authenticated;

-- 2. Nhật ký tiền vào / tiền ra công khai (ẩn PII, chỉ hiển thị mã đơn đã che) --------
create or replace function public.get_escrow_transparency_ledger(
  p_direction text default 'ALL',
  p_limit     integer default 30,
  p_offset    integer default 0
)
returns table (
  event_id         text,
  direction        text,
  event_at         timestamptz,
  amount           bigint,
  masked_code      text,
  item_title       text,
  order_status     text,
  reference_masked text
)
language sql
stable
security definer
set search_path = ''
as $$
  with ledger as (
    -- Tiền vào trung gian (người mua đã thanh toán vào đơn)
    select
      'IN:' || o.id::text as event_id,
      'IN'::text as direction,
      o.paid_at as event_at,
      coalesce(o.paid_amount, o.amount)::bigint as amount,
      case
        when char_length(o.payment_code) >= 8
          then left(o.payment_code, 4) || '••••' || right(o.payment_code, 4)
        else 'VAHA••••'
      end as masked_code,
      coalesce(nullif(btrim(o.listing_snapshot ->> 'title'), ''), 'Thiết bị âm thanh') as item_title,
      o.status::text as order_status,
      null::text as reference_masked
    from public.orders o
    where o.paid_at is not null
      and o.status in ('PAID_HELD', 'SHIPPED', 'DISPUTED', 'COMPLETED', 'PAID_OUT', 'REFUNDED')

    union all

    -- Tiền ra: Giải ngân cho người bán
    select
      'OUT_PAYOUT:' || p.order_id::text as event_id,
      'OUT_PAYOUT'::text as direction,
      coalesce(p.paid_out_at, p.updated_at) as event_at,
      p.amount::bigint as amount,
      case
        when char_length(o.payment_code) >= 8
          then left(o.payment_code, 4) || '••••' || right(o.payment_code, 4)
        else 'VAHA••••'
      end as masked_code,
      coalesce(nullif(btrim(o.listing_snapshot ->> 'title'), ''), 'Thiết bị âm thanh') as item_title,
      o.status::text as order_status,
      case
        when coalesce(btrim(p.reference), '') = '' then null
        when char_length(btrim(p.reference)) <= 4 then '••••'
        else '••••' || right(btrim(p.reference), 4)
      end as reference_masked
    from public.order_payouts p
    join public.orders o on o.id = p.order_id
    where p.status = 'DONE'

    union all

    -- Tiền ra: Hoàn tiền về cho người mua
    select
      'OUT_REFUND:' || o.id::text as event_id,
      'OUT_REFUND'::text as direction,
      o.refund_completed_at as event_at,
      coalesce(o.paid_amount, o.amount)::bigint as amount,
      case
        when char_length(o.payment_code) >= 8
          then left(o.payment_code, 4) || '••••' || right(o.payment_code, 4)
        else 'VAHA••••'
      end as masked_code,
      coalesce(nullif(btrim(o.listing_snapshot ->> 'title'), ''), 'Thiết bị âm thanh') as item_title,
      o.status::text as order_status,
      case
        when coalesce(btrim(o.refund_reference), '') = '' then null
        when char_length(btrim(o.refund_reference)) <= 4 then '••••'
        else '••••' || right(btrim(o.refund_reference), 4)
      end as reference_masked
    from public.orders o
    where o.status = 'REFUNDED'
      and o.refund_completed_at is not null
  )
  select
    l.event_id,
    l.direction,
    l.event_at,
    l.amount,
    l.masked_code,
    l.item_title,
    l.order_status,
    l.reference_masked
  from ledger l
  where l.event_at is not null
    and (
      coalesce(upper(p_direction), 'ALL') = 'ALL'
      or (upper(p_direction) = 'IN' and l.direction = 'IN')
      or (upper(p_direction) = 'OUT' and l.direction in ('OUT_PAYOUT', 'OUT_REFUND'))
    )
  order by l.event_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

revoke all on function public.get_escrow_transparency_ledger(text, integer, integer) from public, anon, authenticated;
grant execute on function public.get_escrow_transparency_ledger(text, integer, integer) to anon, authenticated;
