-- =====================================================================
--  PATCH 008 — Email tự động qua Gmail SMTP (pg_net) & Realtime cho listings
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002 → 007.
--
--  1. Bật extension pg_net để gọi bất đồng bộ tới Edge Function `send-order-email`.
--  2. Bật Supabase Realtime + REPLICA IDENTITY FULL cho bảng `listings`
--     (để pop-up trình duyệt nhận ngay sự kiện duyệt/từ chối tin kèm trạng thái cũ).
--  3. Bảng cấu hình nội bộ `internal_email_config` (RLS bật, không có policy, client KHÔNG đọc được).
--  4. Trigger AFTER UPDATE trên `orders`, `order_payouts`, `listings` gọi `send-order-email`
--     bất đồng bộ. Mọi lỗi gọi mạng đều được nuốt an toàn (EXCEPTION WHEN OTHERS) để KHÔNG
--     bao giờ làm chậm hay làm lỗi giao dịch chính.
--
--  SAU KHI CHẠY FILE NÀY, hãy cấu hình URL & SB_SECRET_KEY 1 lần duy nhất trong SQL Editor:
--    insert into public.internal_email_config (id, function_url, secret_key)
--    values (1, 'https://<PROJECT_REF>.supabase.co/functions/v1/send-order-email', 'sb_secret_xxx')
--    on conflict (id) do update
--      set function_url = excluded.function_url, secret_key = excluded.secret_key;
-- =====================================================================

-- 1. Extension pg_net -----------------------------------------------------------------
create extension if not exists pg_net with schema extensions;

-- 2. Bật Realtime cho bảng listings (orders đã bật từ schema.sql) ---------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'listings'
  ) then
    alter publication supabase_realtime add table public.listings;
  end if;
end $$;

alter table public.listings replica identity full;

-- 3. Bảng cấu hình nội bộ (chỉ postgres / service_role / SECURITY DEFINER đọc được) ---
create table if not exists public.internal_email_config (
  id           integer primary key default 1 check (id = 1),
  function_url text not null,
  secret_key   text not null,
  updated_at   timestamptz not null default now()
);
alter table public.internal_email_config enable row level security;
revoke all on table public.internal_email_config from public, anon, authenticated;

-- 4. Hàm gửi HTTP bất đồng bộ tới Edge Function send-order-email ----------------------
create or replace function public.notify_send_order_email(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select function_url, secret_key
    into v_url, v_secret
    from public.internal_email_config
   where id = 1;

  -- Chưa cấu hình URL/secret thì bỏ qua im lặng (không ảnh hưởng giao dịch)
  if coalesce(btrim(v_url), '') = '' or coalesce(btrim(v_secret), '') = '' then
    return;
  end if;

  if coalesce(btrim(p_payload ->> 'to'), '') = '' then
    return;
  end if;

  perform extensions.net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    body    := p_payload
  );
exception when others then
  -- Tuyệt đối không để lỗi gửi email làm hỏng giao dịch đơn hàng / giải ngân / duyệt tin
  raise warning '[008_email_notifications] Failed to enqueue email: %', sqlerrm;
end;
$$;

revoke all on function public.notify_send_order_email(jsonb) from public, anon, authenticated;

-- 5. Trigger AFTER UPDATE trên orders (ORDER_PAID, ORDER_SHIPPED, ORDER_COMPLETED) ----
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
      'event',         'ORDER_PAID',
      'to',            v_email,
      'recipientName', v_name,
      'orderId',       new.id,
      'paymentCode',   new.payment_code,
      'listingTitle',  v_title,
      'amount',        new.amount,
      'sellerPayout',  new.seller_payout
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
      'event',         'ORDER_COMPLETED',
      'to',            v_email,
      'recipientName', v_name,
      'orderId',       new.id,
      'paymentCode',   new.payment_code,
      'listingTitle',  v_title,
      'sellerPayout',  new.seller_payout
    ));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_orders_email_notify on public.orders;
create trigger trg_orders_email_notify
  after update of status on public.orders
  for each row execute function public.trg_orders_email_notify();

-- 6. Trigger AFTER UPDATE trên order_payouts (PAYOUT_DONE) ----------------------------
create or replace function public.trg_order_payouts_email_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email        text;
  v_name         text;
  v_payment_code text;
  v_title        text;
begin
  if new.status = 'DONE' and old.status is distinct from 'DONE' then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.seller_id;

    select o.payment_code, coalesce(o.listing_snapshot ->> 'title', o.payment_code)
      into v_payment_code, v_title
      from public.orders o
     where o.id = new.order_id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',         'PAYOUT_DONE',
      'to',            v_email,
      'recipientName', v_name,
      'orderId',       new.order_id,
      'paymentCode',   v_payment_code,
      'listingTitle',  v_title,
      'amount',        new.amount,
      'bankName',      new.bank_name,
      'accountNumber', new.account_number,
      'accountName',   new.account_name,
      'reference',     new.reference
    ));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_order_payouts_email_notify on public.order_payouts;
create trigger trg_order_payouts_email_notify
  after update of status on public.order_payouts
  for each row execute function public.trg_order_payouts_email_notify();

-- 7. Trigger AFTER UPDATE trên listings (LISTING_REVIEWED) ----------------------------
create or replace function public.trg_listings_email_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_name  text;
begin
  if old.status::text = 'pending_review' and new.status::text in ('active', 'rejected') then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.seller_id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',           'LISTING_REVIEWED',
      'to',              v_email,
      'recipientName',   v_name,
      'listingId',       new.id,
      'listingTitle',    new.title,
      'reviewStatus',    new.status::text,
      'rejectionReason', new.rejection_reason
    ));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_listings_email_notify on public.listings;
create trigger trg_listings_email_notify
  after update of status on public.listings
  for each row execute function public.trg_listings_email_notify();

-- Thu hồi quyền gọi trực tiếp các hàm trigger từ client
revoke all on function public.trg_orders_email_notify()        from public, anon, authenticated;
revoke all on function public.trg_order_payouts_email_notify() from public, anon, authenticated;
revoke all on function public.trg_listings_email_notify()      from public, anon, authenticated;
