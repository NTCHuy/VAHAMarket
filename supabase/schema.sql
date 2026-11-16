-- =====================================================================
--  CHỢ NGHIỆN TAI NGHE — SUPABASE SCHEMA (dán nguyên file vào SQL Editor → Run)
--  Có thể chạy lại nhiều lần (idempotent). Không xóa dữ liệu hiện có.
--
--  Nguyên tắc bảo mật:
--   1. Bật RLS cho MỌI bảng trong schema public.
--   2. `orders`, `order_payouts`, `transactions`: client CHỈ ĐỌC (đã REVOKE ghi).
--      Mọi thay đổi trạng thái đi qua các hàm SECURITY DEFINER (RPC) hoặc service_role (webhook).
--   3. Quyền ghi theo CỘT (column-level GRANT) để client không sửa được cột nhạy cảm
--      (sold_count, bought_count, seller_id, status = reserved/sold ...).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. KIỂU DỮ LIỆU (ENUM)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.listing_status as enum ('draft', 'active', 'hidden', 'reserved', 'sold', 'removed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.listing_condition as enum ('like_new', 'good', 'fair', 'for_parts');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum (
    'PENDING_PAYMENT',  -- chờ người mua chuyển tiền vào tài khoản Escrow
    'PAID_HELD',        -- đã nhận tiền, sàn đang giữ (CHỈ webhook/service_role được đặt)
    'SHIPPED',          -- người bán đã gửi hàng
    'COMPLETED',        -- người mua xác nhận đã nhận hàng, chờ giải ngân
    'PAID_OUT',         -- đã chuyển 95% cho người bán
    'CANCELLED',
    'EXPIRED',
    'DISPUTED',
    'REFUNDED'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payout_status as enum ('NOT_READY', 'PENDING', 'DONE');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 1. HÀM TIỆN ÍCH
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. BẢNG
-- ---------------------------------------------------------------------

-- 2.1 admins: danh sách quản trị viên (không có policy → client không đọc được)
create table if not exists public.admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

-- 2.2 profiles: hồ sơ công khai, 1-1 với auth.users
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url   text check (avatar_url is null or char_length(avatar_url) <= 500),
  bio          text check (bio is null or char_length(bio) <= 300),
  sold_count   integer not null default 0 check (sold_count >= 0),
  bought_count integer not null default 0 check (bought_count >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 2.3 profile_contacts: thông tin riêng tư (email, SĐT, địa chỉ nhận hàng mặc định)
create table if not exists public.profile_contacts (
  user_id          uuid primary key references public.profiles (id) on delete cascade,
  email            text,
  phone            text check (phone is null or phone ~ '^[0-9+ ]{8,15}$'),
  shipping_address text check (shipping_address is null or char_length(shipping_address) <= 400),
  updated_at       timestamptz not null default now()
);
alter table public.profile_contacts enable row level security;

drop trigger if exists trg_profile_contacts_updated_at on public.profile_contacts;
create trigger trg_profile_contacts_updated_at
  before update on public.profile_contacts
  for each row execute function public.set_updated_at();

-- 2.4 bank_accounts: tài khoản nhận tiền của người bán (CHỈ chủ sở hữu thấy)
create table if not exists public.bank_accounts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  bank_bin       text not null check (bank_bin ~ '^[0-9]{6}$'),
  bank_code      text not null check (char_length(bank_code) between 2 and 20),
  bank_name      text not null check (char_length(bank_name) between 2 and 120),
  account_number text not null check (account_number ~ '^[0-9]{6,19}$'),
  account_name   text not null check (char_length(account_name) between 3 and 100),
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_bank_accounts_user on public.bank_accounts (user_id);
create unique index if not exists uq_bank_accounts_one_default
  on public.bank_accounts (user_id) where is_default;
alter table public.bank_accounts enable row level security;

drop trigger if exists trg_bank_accounts_updated_at on public.bank_accounts;
create trigger trg_bank_accounts_updated_at
  before update on public.bank_accounts
  for each row execute function public.set_updated_at();

-- Khi đặt 1 tài khoản làm mặc định → tự bỏ mặc định ở các tài khoản khác của cùng người dùng
create or replace function public.bank_accounts_single_default()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_default then
    update public.bank_accounts
       set is_default = false
     where user_id = new.user_id and id <> new.id and is_default;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bank_accounts_single_default on public.bank_accounts;
create trigger trg_bank_accounts_single_default
  before insert or update of is_default on public.bank_accounts
  for each row when (new.is_default)
  execute function public.bank_accounts_single_default();

-- Giới hạn tối đa 10 tài khoản ngân hàng / người dùng
create or replace function public.bank_accounts_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.bank_accounts where user_id = new.user_id) >= 10 then
    raise exception 'Mỗi người dùng chỉ được lưu tối đa 10 tài khoản ngân hàng.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bank_accounts_limit on public.bank_accounts;
create trigger trg_bank_accounts_limit
  before insert on public.bank_accounts
  for each row execute function public.bank_accounts_limit();

-- 2.5 listings: tin đăng bán
create table if not exists public.listings (
  id              uuid primary key default gen_random_uuid(),
  seller_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title           text not null check (char_length(title) between 5 and 120),
  description     text not null check (char_length(description) between 10 and 5000),
  price           bigint not null check (price between 10000 and 1000000000), -- VND
  category        text not null check (char_length(category) between 2 and 40),
  condition       public.listing_condition not null,
  brand           text check (brand is null or char_length(brand) <= 60),
  province        text check (province is null or char_length(province) <= 60),
  images          jsonb not null check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) between 1 and 10),
  -- Bắt buộc chọn 1 tài khoản nhận tiền đã lưu. Tài khoản bị xóa → NULL (chỉ hợp lệ với tin đã bán/gỡ).
  bank_account_id uuid references public.bank_accounts (id) on delete set null,
  status          public.listing_status not null default 'active',
  moderation_note text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint listings_bank_required
    check (bank_account_id is not null or status in ('sold', 'removed'))
);
create index if not exists idx_listings_status_created on public.listings (status, created_at desc);
create index if not exists idx_listings_status_cat_created on public.listings (status, category, created_at desc);
create index if not exists idx_listings_status_price on public.listings (status, price);
create index if not exists idx_listings_seller_created on public.listings (seller_id, created_at desc);
alter table public.listings enable row level security;

drop trigger if exists trg_listings_updated_at on public.listings;
create trigger trg_listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- 2.6 orders: đơn hàng Escrow (client chỉ đọc)
create table if not exists public.orders (
  id               uuid primary key default gen_random_uuid(),
  payment_code     text not null unique check (payment_code ~ '^CNTH[0-9A-F]{8}$'),
  listing_id       uuid references public.listings (id) on delete set null,
  listing_snapshot jsonb not null,                     -- {title, image, price}
  buyer_id         uuid not null references public.profiles (id) on delete restrict,
  seller_id        uuid not null references public.profiles (id) on delete restrict,

  amount           bigint not null check (amount > 0),         -- = giá sản phẩm (người mua chuyển đúng số này)
  platform_fee     bigint not null check (platform_fee >= 0),  -- = round(amount * 5%)
  seller_payout    bigint not null check (seller_payout > 0),  -- = amount - platform_fee
  constraint orders_amounts_consistent check (amount = platform_fee + seller_payout),

  status           public.order_status not null default 'PENDING_PAYMENT',
  paid_amount      bigint not null default 0 check (paid_amount >= 0),
  paid_at          timestamptz,

  recipient_name   text not null,
  phone            text not null,
  address          text not null,
  note             text,
  carrier          text,
  tracking_code    text,

  expires_at       timestamptz not null,
  shipped_at       timestamptz,
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint orders_buyer_ne_seller check (buyer_id <> seller_id)
);
create index if not exists idx_orders_buyer_created  on public.orders (buyer_id, created_at desc);
create index if not exists idx_orders_seller_created on public.orders (seller_id, created_at desc);
create index if not exists idx_orders_status_created on public.orders (status, created_at desc);
create index if not exists idx_orders_listing        on public.orders (listing_id);
alter table public.orders enable row level security;

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- 2.7 order_payouts: snapshot tài khoản người bán + trạng thái giải ngân
--     (tách riêng để NGƯỜI MUA không đọc được số tài khoản của người bán)
create table if not exists public.order_payouts (
  order_id       uuid primary key references public.orders (id) on delete cascade,
  seller_id      uuid not null references public.profiles (id) on delete restrict,
  bank_bin       text not null,
  bank_code      text not null,
  bank_name      text not null,
  account_number text not null,
  account_name   text not null,
  amount         bigint not null check (amount > 0),
  status         public.payout_status not null default 'NOT_READY',
  paid_out_at    timestamptz,
  reference      text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_order_payouts_seller on public.order_payouts (seller_id);
alter table public.order_payouts enable row level security;

drop trigger if exists trg_order_payouts_updated_at on public.order_payouts;
create trigger trg_order_payouts_updated_at
  before update on public.order_payouts
  for each row execute function public.set_updated_at();

-- 2.8 transactions: nhật ký biến động số dư từ webhook SePay/Casso (chỉ admin đọc)
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null check (provider in ('sepay', 'casso')),
  provider_tx_id   text not null,
  direction        text not null check (direction in ('in', 'out')),
  amount           bigint not null check (amount >= 0),
  content          text not null default '',
  reference_code   text,
  account_number   text,
  transaction_date timestamptz not null default now(),
  match_status     text not null check (match_status in
                     ('MATCHED', 'OVERPAID', 'UNDERPAID', 'UNMATCHED', 'LATE_PAYMENT', 'EXTRA_PAYMENT', 'IGNORED')),
  order_id         uuid references public.orders (id) on delete set null,
  buyer_id         uuid references public.profiles (id) on delete set null,
  seller_id        uuid references public.profiles (id) on delete set null,
  raw              jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  constraint uq_transactions_provider_tx unique (provider, provider_tx_id)  -- chống xử lý trùng (idempotent)
);
create index if not exists idx_transactions_order on public.transactions (order_id);
create index if not exists idx_transactions_match_created on public.transactions (match_status, created_at desc);
alter table public.transactions enable row level security;

-- ---------------------------------------------------------------------
-- 3. TRIGGER TẠO PROFILE KHI CÓ USER MỚI (Google Sign-in)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name   text;
  v_avatar text;
begin
  v_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Người dùng mới'
    ),
    60
  );
  v_avatar := left(
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    500
  );

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, v_name, v_avatar)
  on conflict (id) do nothing;

  insert into public.profile_contacts (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Bổ sung profile cho các user đã tồn tại trước khi tạo trigger (nếu có)
insert into public.profiles (id, display_name, avatar_url)
select u.id,
       left(coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                     nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                     nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
                     'Người dùng mới'), 60),
       left(coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'), 500)
from auth.users u
on conflict (id) do nothing;

insert into public.profile_contacts (user_id, email)
select u.id, u.email from auth.users u
on conflict (user_id) do nothing;

-- ---------------------------------------------------------------------
-- 4. QUYỀN (GRANT) — theo nguyên tắc tối thiểu, có kiểm soát theo CỘT
-- ---------------------------------------------------------------------
revoke all on table
  public.admins, public.profiles, public.profile_contacts, public.bank_accounts,
  public.listings, public.orders, public.order_payouts, public.transactions
from anon, authenticated;

-- profiles: ai cũng đọc; chủ sở hữu chỉ sửa 3 cột (KHÔNG sửa được sold_count/bought_count)
grant select on public.profiles to anon, authenticated;
grant update (display_name, avatar_url, bio) on public.profiles to authenticated;

-- profile_contacts: chỉ chủ sở hữu (qua RLS); email do hệ thống đồng bộ, client chỉ sửa SĐT/địa chỉ
grant select on public.profile_contacts to authenticated;
grant update (phone, shipping_address) on public.profile_contacts to authenticated;

-- bank_accounts: chủ sở hữu thêm/sửa/xóa (user_id tự gán = auth.uid())
grant select, delete on public.bank_accounts to authenticated;
grant insert (bank_bin, bank_code, bank_name, account_number, account_name, is_default)
  on public.bank_accounts to authenticated;
grant update (bank_bin, bank_code, bank_name, account_number, account_name, is_default)
  on public.bank_accounts to authenticated;

-- listings: ai cũng đọc tin active (qua RLS); chủ tin thêm/sửa/xóa (seller_id tự gán = auth.uid())
grant select on public.listings to anon, authenticated;
grant delete on public.listings to authenticated;
grant insert (title, description, price, category, condition, brand, province, images, bank_account_id, status)
  on public.listings to authenticated;
grant update (title, description, price, category, condition, brand, province, images, bank_account_id, status)
  on public.listings to authenticated;

-- orders / order_payouts / transactions: client CHỈ ĐỌC (RLS lọc theo chủ sở hữu/admin)
grant select on public.orders         to authenticated;
grant select on public.order_payouts  to authenticated;
grant select on public.transactions   to authenticated;

-- ---------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY — POLICIES
-- ---------------------------------------------------------------------

-- 5.1 profiles
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles
  for select to anon, authenticated
  using (true);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- Không có policy INSERT/DELETE: profile chỉ do trigger tạo, xóa theo auth.users (CASCADE).

-- 5.2 profile_contacts
drop policy if exists "contacts_select_own_or_admin" on public.profile_contacts;
create policy "contacts_select_own_or_admin" on public.profile_contacts
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "contacts_update_own" on public.profile_contacts;
create policy "contacts_update_own" on public.profile_contacts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 5.3 bank_accounts: CHỈ chủ sở hữu (admin chỉ đọc)
drop policy if exists "bank_select_own_or_admin" on public.bank_accounts;
create policy "bank_select_own_or_admin" on public.bank_accounts
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

drop policy if exists "bank_insert_own" on public.bank_accounts;
create policy "bank_insert_own" on public.bank_accounts
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "bank_update_own" on public.bank_accounts;
create policy "bank_update_own" on public.bank_accounts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "bank_delete_own" on public.bank_accounts;
create policy "bank_delete_own" on public.bank_accounts
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 5.4 listings
-- Ai cũng xem được tin đang mở bán; chủ tin xem được mọi tin của mình; admin xem tất cả.
drop policy if exists "listings_select_active_or_own" on public.listings;
create policy "listings_select_active_or_own" on public.listings
  for select to anon, authenticated
  using (
    status = 'active'
    or seller_id = (select auth.uid())
    or public.is_admin()
  );

-- Thêm tin: phải là chính mình, trạng thái draft/active/hidden, và bank_account_id là tài khoản ĐÃ LƯU của mình.
drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own" on public.listings
  for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and status in ('draft', 'active', 'hidden')
    and bank_account_id is not null
    and exists (
      select 1 from public.bank_accounts b
      where b.id = bank_account_id and b.user_id = (select auth.uid())
    )
  );

-- Sửa tin: chỉ khi tin chưa reserved/sold/removed; không thể tự đặt reserved/sold.
drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own" on public.listings
  for update to authenticated
  using (
    seller_id = (select auth.uid())
    and status in ('draft', 'active', 'hidden')
  )
  with check (
    seller_id = (select auth.uid())
    and status in ('draft', 'active', 'hidden')
    and bank_account_id is not null
    and exists (
      select 1 from public.bank_accounts b
      where b.id = bank_account_id and b.user_id = (select auth.uid())
    )
  );

drop policy if exists "listings_delete_own" on public.listings;
create policy "listings_delete_own" on public.listings
  for delete to authenticated
  using (
    seller_id = (select auth.uid())
    and status in ('draft', 'active', 'hidden')
  );

-- 5.5 orders: chỉ người mua / người bán / admin ĐỌC. KHÔNG có policy INSERT/UPDATE/DELETE
--     (và đã REVOKE ghi ở mục 4) → client tuyệt đối không thể sửa trạng thái PAID_HELD.
drop policy if exists "orders_select_participants" on public.orders;
create policy "orders_select_participants" on public.orders
  for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or public.is_admin()
  );

-- 5.6 order_payouts: chỉ người bán của đơn / admin đọc (người mua KHÔNG thấy số TK người bán)
drop policy if exists "payouts_select_seller_or_admin" on public.order_payouts;
create policy "payouts_select_seller_or_admin" on public.order_payouts
  for select to authenticated
  using (seller_id = (select auth.uid()) or public.is_admin());

-- 5.7 transactions: chỉ admin đọc
drop policy if exists "transactions_select_admin" on public.transactions;
create policy "transactions_select_admin" on public.transactions
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 6. HÀM NGHIỆP VỤ (RPC) — nơi DUY NHẤT thay đổi orders
-- ---------------------------------------------------------------------

-- 6.1 Người mua tạo đơn: khóa tin (reserved), snapshot tài khoản người bán, tính phí 5%
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

  -- Khóa dòng listing để 2 người không cùng mua 1 sản phẩm
  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'active' then
    raise exception 'Sản phẩm không còn khả dụng.' using errcode = 'P0001';
  end if;
  if v_listing.seller_id = v_uid then
    raise exception 'Bạn không thể mua sản phẩm của chính mình.' using errcode = 'P0001';
  end if;

  select * into v_bank
    from public.bank_accounts
   where id = v_listing.bank_account_id and user_id = v_listing.seller_id;
  if not found then
    raise exception 'Người bán chưa có tài khoản nhận tiền hợp lệ.' using errcode = 'P0001';
  end if;

  v_fee := round(v_listing.price * 0.05)::bigint;  -- phí nền tảng 5%

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
        now() + interval '30 minutes'
      )
      returning * into v_order;
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;           -- trùng payment_code (cực hiếm) → thử lại
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

-- 6.2 Người mua hủy đơn khi CHƯA thanh toán
create or replace function public.cancel_order(p_order_id uuid)
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
  if not found or v_order.buyer_id <> v_uid then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'PENDING_PAYMENT' then
    raise exception 'Chỉ hủy được đơn chưa thanh toán. Với đơn đã thanh toán, hãy liên hệ admin.' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Người mua hủy đơn'
   where id = v_order.id
   returning * into v_order;

  update public.listings set status = 'active'
   where id = v_order.listing_id and status = 'reserved';

  return v_order;
end;
$$;

-- 6.3 Người bán xác nhận đã gửi hàng (PAID_HELD → SHIPPED)
create or replace function public.mark_shipped(
  p_order_id      uuid,
  p_carrier       text default null,
  p_tracking_code text default null
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

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.seller_id <> v_uid then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'PAID_HELD' then
    raise exception 'Chỉ gửi hàng khi sàn đã nhận tiền của người mua.' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'SHIPPED', shipped_at = now(),
         carrier = nullif(left(btrim(coalesce(p_carrier, '')), 60), ''),
         tracking_code = nullif(left(btrim(coalesce(p_tracking_code, '')), 60), '')
   where id = v_order.id
   returning * into v_order;

  return v_order;
end;
$$;

-- 6.4 Người mua xác nhận đã nhận hàng (SHIPPED → COMPLETED), mở khóa giải ngân cho người bán
create or replace function public.confirm_received(p_order_id uuid)
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
  if not found or v_order.buyer_id <> v_uid then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0001';
  end if;
  if v_order.status <> 'SHIPPED' then
    raise exception 'Chỉ xác nhận khi người bán đã gửi hàng.' using errcode = 'P0001';
  end if;

  update public.orders
     set status = 'COMPLETED', completed_at = now()
   where id = v_order.id
   returning * into v_order;

  update public.order_payouts set status = 'PENDING' where order_id = v_order.id;
  update public.listings      set status = 'sold'    where id = v_order.listing_id;
  update public.profiles      set sold_count   = sold_count   + 1 where id = v_order.seller_id;
  update public.profiles      set bought_count = bought_count + 1 where id = v_order.buyer_id;

  return v_order;
end;
$$;

-- 6.5 Admin xác nhận đã giải ngân cho người bán (COMPLETED → PAID_OUT)
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

  return v_order;
end;
$$;

-- 6.6 Webhook SePay/Casso → ghi giao dịch + đặt PAID_HELD. CHỈ service_role (Edge Function) gọi được.
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
  -- Idempotent: cùng (provider, provider_tx_id) chỉ xử lý 1 lần
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

  -- Tiền ra (giải ngân/hoàn tiền) hoặc tiền vào không hợp lệ → chỉ ghi nhật ký
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
    v_status := 'LATE_PAYMENT';          -- tiền về sau khi đơn đã hủy/hết hạn → admin hoàn tiền
  elsif v_order.status <> 'PENDING_PAYMENT' then
    v_status := 'EXTRA_PAYMENT';         -- đã trả đủ rồi mà chuyển thêm → admin hoàn tiền
  else
    v_paid := v_order.paid_amount + p_amount;
    if v_paid >= v_order.amount then
      v_status := case when v_paid > v_order.amount then 'OVERPAID' else 'MATCHED' end;
      update public.orders
         set status = 'PAID_HELD', paid_amount = v_paid, paid_at = now()
       where id = v_order.id;
    else
      v_status := 'UNDERPAID';           -- chưa đủ tiền → giữ PENDING_PAYMENT, cộng dồn
      update public.orders set paid_amount = v_paid where id = v_order.id;
    end if;
  end if;

  update public.transactions
     set match_status = v_status,
         order_id = v_order.id,
         buyer_id = v_order.buyer_id,
         seller_id = v_order.seller_id
   where id = v_tx_id;

  return jsonb_build_object('result', v_status, 'order_id', v_order.id);
end;
$$;

-- 6.7 Hủy các đơn quá hạn thanh toán và mở lại tin đăng. Gọi bằng pg_cron (mục 8) hoặc service_role.
create or replace function public.expire_pending_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with expired as (
    update public.orders
       set status = 'EXPIRED', cancelled_at = now(), cancel_reason = 'Hết hạn thanh toán'
     where status = 'PENDING_PAYMENT' and expires_at < now()
     returning id, listing_id
  ), reopened as (
    update public.listings l
       set status = 'active'
      from expired e
     where l.id = e.listing_id and l.status = 'reserved'
     returning l.id
  )
  select count(*) into v_count from expired;

  return v_count;
end;
$$;

-- Phân quyền thực thi: mặc định hàm cấp EXECUTE cho PUBLIC → thu hồi rồi cấp lại đúng đối tượng
revoke all on function public.create_order(uuid, text, text, text, text)           from public, anon, authenticated;
revoke all on function public.cancel_order(uuid)                                    from public, anon, authenticated;
revoke all on function public.mark_shipped(uuid, text, text)                        from public, anon, authenticated;
revoke all on function public.confirm_received(uuid)                                from public, anon, authenticated;
revoke all on function public.admin_mark_paid_out(uuid, text)                       from public, anon, authenticated;
revoke all on function public.process_bank_transaction(text, text, text, bigint, text, text, text, timestamptz, jsonb)
                                                                                    from public, anon, authenticated;
revoke all on function public.expire_pending_orders()                               from public, anon, authenticated;

grant execute on function public.create_order(uuid, text, text, text, text)  to authenticated;
grant execute on function public.cancel_order(uuid)                          to authenticated;
grant execute on function public.mark_shipped(uuid, text, text)              to authenticated;
grant execute on function public.confirm_received(uuid)                      to authenticated;
grant execute on function public.admin_mark_paid_out(uuid, text)             to authenticated;
grant execute on function public.process_bank_transaction(text, text, text, bigint, text, text, text, timestamptz, jsonb)
                                                                             to service_role;
grant execute on function public.expire_pending_orders()                     to service_role;

-- ---------------------------------------------------------------------
-- 7. SUPABASE REALTIME cho bảng orders (UI tự cập nhật khi tiền về)
--    Realtime tôn trọng RLS: mỗi người chỉ nhận sự kiện của đơn mình mua/bán.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
end $$;

alter table public.orders replica identity full;

-- ---------------------------------------------------------------------
-- 8. (TÙY CHỌN) TỰ ĐỘNG HỦY ĐƠN QUÁ HẠN MỖI 5 PHÚT BẰNG pg_cron
--    Bỏ comment 3 dòng dưới nếu muốn bật (gói Free hỗ trợ pg_cron).
-- ---------------------------------------------------------------------
-- create extension if not exists pg_cron with schema extensions;
-- select cron.unschedule('expire-pending-orders') where exists (select 1 from cron.job where jobname = 'expire-pending-orders');
-- select cron.schedule('expire-pending-orders', '*/5 * * * *', $$select public.expire_pending_orders();$$);

-- ---------------------------------------------------------------------
-- 9. CẤP QUYỀN ADMIN (chạy thủ công 1 lần, thay UUID bằng id của bạn ở Authentication → Users)
-- ---------------------------------------------------------------------
-- insert into public.admins (user_id) values ('00000000-0000-0000-0000-000000000000');
