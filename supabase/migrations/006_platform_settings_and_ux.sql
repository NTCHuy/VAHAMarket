-- =====================================================================
--  PATCH 006 — Phí sàn toàn hệ thống (platform_settings), khóa original_price phía người bán
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002 → 005.
--
--  • platform_settings: 1 dòng cấu hình (id = 1). global_fee_rate từ 0 đến 0.05 (0% – 5%).
--  • create_order đọc mức phí hiện hành; người bán Mod luôn 0%. Thêm tham số tùy chọn
--    p_expected_amount: nếu số tiền người mua đang thấy trên màn hình khác số tiền tính ra
--    (vd admin vừa đổi phí) thì từ chối, để QR/chuyển khoản luôn khớp từng đồng với giá đã hiển thị.
--  • original_price (giá gốc gạch ngang) CHỈ admin được đặt: thu hồi quyền ghi của client ở tầng DB.
--    Nếu người bán đổi giá bán, giá gốc do admin đặt tự động bị gỡ (tránh giảm giá "ảo").
-- =====================================================================

-- 1. Bảng cấu hình toàn sàn ---------------------------------------------------------
create table if not exists public.platform_settings (
  id              integer primary key default 1 check (id = 1),
  global_fee_rate numeric(5,4) not null default 0.05
                  check (global_fee_rate >= 0 and global_fee_rate <= 0.05),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id) on delete set null
);

insert into public.platform_settings (id, global_fee_rate) values (1, 0.05) on conflict (id) do nothing;

drop trigger if exists trg_platform_settings_updated_at on public.platform_settings;
create trigger trg_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

revoke all on table public.platform_settings from anon, authenticated;
grant select on public.platform_settings to anon, authenticated;
grant update (global_fee_rate) on public.platform_settings to authenticated;

drop policy if exists "settings_select_all" on public.platform_settings;
create policy "settings_select_all" on public.platform_settings
  for select to anon, authenticated
  using (true);

drop policy if exists "settings_update_admin" on public.platform_settings;
create policy "settings_update_admin" on public.platform_settings
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
-- Không có policy INSERT/DELETE: chỉ tồn tại đúng 1 dòng id = 1.

-- 2. Admin đổi phí toàn sàn (qua RPC để có nhật ký + kiểm tra giá trị) ---------------------
create or replace function public.admin_set_global_fee_rate(p_rate numeric)
returns public.platform_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old numeric;
  v_row public.platform_settings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if p_rate is null or p_rate < 0 or p_rate > 0.05 then
    raise exception 'Mức phí phải từ 0%% đến 5%%.' using errcode = '22023';
  end if;
  if p_rate <> round(p_rate, 4) then
    raise exception 'Mức phí tối đa 2 chữ số thập phân (ví dụ 2.5%%).' using errcode = '22023';
  end if;

  select global_fee_rate into v_old from public.platform_settings where id = 1 for update;

  update public.platform_settings
     set global_fee_rate = p_rate, updated_by = (select auth.uid())
   where id = 1
   returning * into v_row;

  insert into public.admin_audit_log (admin_id, action, note)
  values ((select auth.uid()), 'SET_GLOBAL_FEE_RATE', format('%s%% → %s%%', round(coalesce(v_old, 0.05) * 100, 2), round(p_rate * 100, 2)));

  return v_row;
end;
$$;

-- 3. original_price: chỉ admin được đặt -------------------------------------------------
revoke insert (original_price) on public.listings from authenticated;
revoke update (original_price) on public.listings from authenticated;

-- Người bán đổi giá bán → gỡ giá gốc (ưu đãi do admin đặt không còn đúng nữa).
-- Hàm admin_update_listing_price bật cờ phiên 'vaha.admin_price_update' để không bị gỡ.
create or replace function public.listings_reset_discount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is distinct from old.price
     and coalesce(current_setting('vaha.admin_price_update', true), '') <> '1' then
    new.original_price := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listings_reset_discount on public.listings;
create trigger trg_listings_reset_discount
  before update on public.listings
  for each row execute function public.listings_reset_discount();

create or replace function public.admin_update_listing_price(
  p_listing_id     uuid,
  p_price          bigint,
  p_original_price bigint default null
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     public.listings%rowtype;
  v_listing public.listings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if p_price is null or p_price < 10000 or p_price > 1000000000 then
    raise exception 'Giá bán phải từ 10.000đ đến 1.000.000.000đ.' using errcode = '22023';
  end if;
  if p_original_price is not null and (p_original_price <= p_price or p_original_price > 1000000000) then
    raise exception 'Giá gốc phải lớn hơn giá bán (hoặc để trống).' using errcode = '22023';
  end if;

  select * into v_old from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Không tìm thấy tin đăng.' using errcode = 'P0001';
  end if;
  if v_old.status not in ('draft', 'active', 'hidden') then
    raise exception 'Chỉ chỉnh giá được tin đang bán, nháp hoặc ẩn (tin đã giữ chỗ/đã bán thì không).' using errcode = 'P0001';
  end if;

  perform set_config('vaha.admin_price_update', '1', true);  -- chỉ trong giao dịch này

  update public.listings
     set price = p_price, original_price = p_original_price
   where id = p_listing_id
   returning * into v_listing;

  insert into public.admin_audit_log (admin_id, action, listing_id, note)
  values (
    (select auth.uid()), 'UPDATE_LISTING_PRICE', p_listing_id,
    format('giá %s → %s; giá gốc %s → %s', v_old.price, p_price, coalesce(v_old.original_price::text, 'không'), coalesce(p_original_price::text, 'không'))
  );

  return v_listing;
end;
$$;

-- 4. create_order: dùng global_fee_rate + kiểm tra số tiền người mua đang thấy ----------------
drop function if exists public.create_order(uuid, text, text, text, text);

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
  v_uid        uuid := (select auth.uid());
  v_listing    public.listings%rowtype;
  v_bank       public.bank_accounts%rowtype;
  v_order      public.orders%rowtype;
  v_is_mod     boolean;
  v_global_bp  integer;
  v_bp         integer;
  v_total_fee  bigint;
  v_buyer_fee  bigint;
  v_seller_fee bigint;
  v_tries      integer := 0;
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

  -- Mức phí hiện hành (0.0000–0.0500 → basis point 0–500); người bán Mod luôn 0%
  select round(global_fee_rate * 10000)::integer into v_global_bp from public.platform_settings where id = 1;
  v_global_bp := coalesce(v_global_bp, 500);
  select coalesce(is_mod, false) into v_is_mod from public.profiles where id = v_listing.seller_id;
  v_bp := case when v_is_mod then 0 else v_global_bp end;

  v_total_fee := round(v_listing.price * v_bp / 10000.0)::bigint;

  if v_listing.fee_payer = 'BUYER' then
    v_buyer_fee := v_total_fee;
    v_seller_fee := 0;
  elsif v_listing.fee_payer = 'SPLIT' then
    v_buyer_fee := round(v_listing.price * v_bp / 20000.0)::bigint;
    v_seller_fee := v_total_fee - v_buyer_fee;
  else
    v_buyer_fee := 0;
    v_seller_fee := v_total_fee;
  end if;

  -- Số tiền khác với giá người mua đang thấy (admin vừa đổi phí / giá) → dừng, không tạo đơn
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

-- 5. Phân quyền thực thi ---------------------------------------------------------------------
revoke all on function public.admin_set_global_fee_rate(numeric)                          from public, anon, authenticated;
revoke all on function public.admin_update_listing_price(uuid, bigint, bigint)            from public, anon, authenticated;
revoke all on function public.create_order(uuid, text, text, text, text, bigint)          from public, anon, authenticated;

grant execute on function public.admin_set_global_fee_rate(numeric)                       to authenticated;
grant execute on function public.admin_update_listing_price(uuid, bigint, bigint)         to authenticated;
grant execute on function public.create_order(uuid, text, text, text, text, bigint)       to authenticated;
