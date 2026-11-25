-- =====================================================================
--  PATCH 014 — Bảo mật toàn diện (Security Hardening)
--  Chạy 1 lần trên SQL Editor (100% idempotent). Cần chạy SAU schema.sql và 002 -> 013.
--
--  Nội dung chính:
--   1. Tách tài khoản nhận hoàn tiền của người mua sang bảng riêng `order_refund_accounts`
--      (RLS: chỉ người mua và quản trị viên đọc được → người bán KHÔNG còn thấy STK người mua).
--   2. Khóa chặt các hàm SECURITY DEFINER hỗ trợ trigger (`is_entity_blacklisted`,
--      `listing_seller_missing`, `identity_locked`, `is_user_banned`, `is_mod_user`)
--      không cho gọi trực tiếp qua RPC để dò dữ liệu người khác / danh sách đen;
--      thu hồi toàn bộ quyền EXECUTE từ `anon`.
--   3. Ẩn lý do chi tiết của `check_device_banned` với khách chưa đăng nhập;
--      chặn fingerprint yếu (`fb_*`) & giới hạn số thiết bị / dấu vết trên mỗi tài khoản
--      trong `register_device_and_check_ban` (chống tự khóa nhầm & chống bơm rác bảng).
--   4. Kiểm tra URL hợp lệ ở tầng DB cho `listings.images` (chỉ Cloudinary HTTPS)
--      và `profiles.avatar_url` (chỉ Google Avatar hoặc Cloudinary HTTPS) → chặn Stored XSS & IP logger.
--   5. Chặn tài khoản đã bị khóa cập nhật `profiles`, `profile_contacts`, `bank_accounts`
--      và xóa `listings`.
--   6. Bổ sung kiểm tra `brand` trong bộ lọc chống dẫn dụ ngoài sàn & yêu cầu duyệt lại nếu sửa `brand`.
--   7. Chặn hủy / tự hết hạn đơn khi `paid_amount > 0` (tránh mất dấu đơn chuyển thiếu);
--      bổ sung `refund_requested_at` trong `admin_resolve_dispute`.
--   8. Thu hồi quyền UPDATE trực tiếp bảng `platform_settings` (bắt buộc đi qua RPC có nhật ký).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bảng riêng lưu tài khoản nhận hoàn tiền của người mua (chỉ buyer + admin đọc)
-- ---------------------------------------------------------------------
create table if not exists public.order_refund_accounts (
  order_id       uuid primary key references public.orders (id) on delete cascade,
  buyer_id       uuid not null references public.profiles (id) on delete restrict,
  bank_bin       text not null,
  bank_code      text not null,
  bank_name      text not null,
  account_number text not null,
  account_name   text not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_order_refund_accounts_buyer on public.order_refund_accounts (buyer_id);

alter table public.order_refund_accounts enable row level security;
revoke all on table public.order_refund_accounts from public, anon, authenticated;
grant select on public.order_refund_accounts to authenticated;

drop policy if exists "refund_accounts_select_buyer_or_admin" on public.order_refund_accounts;
create policy "refund_accounts_select_buyer_or_admin" on public.order_refund_accounts
  for select to authenticated
  using (buyer_id = (select auth.uid()) or public.is_admin());

-- Chuyển dữ liệu cũ từ public.orders sang public.order_refund_accounts
insert into public.order_refund_accounts (
  order_id, buyer_id, bank_bin, bank_code, bank_name, account_number, account_name
)
select o.id,
       o.buyer_id,
       coalesce(o.refund_bank_bin, ''),
       coalesce(o.refund_bank_code, ''),
       coalesce(o.refund_bank_name, ''),
       o.refund_account_number,
       coalesce(o.refund_account_name, '')
  from public.orders o
 where coalesce(btrim(o.refund_account_number), '') <> ''
on conflict (order_id) do nothing;

-- Xóa bản sao STK người mua trên bảng orders để người bán (và Realtime) không đọc được
update public.orders
   set refund_bank_bin       = null,
       refund_bank_code      = null,
       refund_bank_name      = null,
       refund_account_number = null,
       refund_account_name   = null
 where refund_bank_bin is not null
    or refund_bank_code is not null
    or refund_bank_name is not null
    or refund_account_number is not null
    or refund_account_name is not null;

-- Backfill refund_requested_at cho các đơn REFUNDED cũ (vd từ phân xử khiếu nại)
update public.orders
   set refund_requested_at = coalesce(resolved_at, cancelled_at, updated_at)
 where status = 'REFUNDED'
   and refund_requested_at is null;

-- ---------------------------------------------------------------------
-- 2. Khóa chặt các hàm SECURITY DEFINER hỗ trợ trigger (chặn dò dữ liệu qua RPC)
-- ---------------------------------------------------------------------
create or replace function public.is_entity_blacklisted(p_type text, p_value text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 0
     and coalesce((select auth.role()), '') in ('anon', 'authenticated')
     and not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  return exists (
    select 1
      from public.banned_entities
     where entity_type = p_type
       and entity_value = public.normalize_ban_value(p_type, p_value)
  );
end;
$$;

create or replace function public.is_user_banned(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 0
     and coalesce((select auth.role()), '') in ('anon', 'authenticated')
     and p_uid is distinct from (select auth.uid())
     and not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  return coalesce((select is_banned from public.profiles where id = p_uid), false);
end;
$$;

create or replace function public.is_mod_user(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 0
     and coalesce((select auth.role()), '') in ('anon', 'authenticated')
     and p_uid is distinct from (select auth.uid())
     and not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  return coalesce((select is_mod from public.profiles where id = p_uid), false);
end;
$$;

create or replace function public.listing_seller_missing(p_uid uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 0
     and coalesce((select auth.role()), '') in ('anon', 'authenticated')
     and p_uid is distinct from (select auth.uid())
     and not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  return array_remove(array[
    case when coalesce(btrim((select phone from public.profile_contacts where user_id = p_uid)), '') = '' then 'số điện thoại' end,
    case when coalesce(btrim((select facebook_url from public.profiles where id = p_uid)), '') = '' then 'đường dẫn Facebook cá nhân' end,
    case when not exists (select 1 from public.bank_accounts where user_id = p_uid) then 'tài khoản ngân hàng nhận tiền' end
  ], null);
end;
$$;

create or replace function public.identity_locked(p_uid uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() = 0
     and coalesce((select auth.role()), '') in ('anon', 'authenticated')
     and p_uid is distinct from (select auth.uid())
     and not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  return exists (select 1 from public.listings where seller_id = p_uid and status::text in ('pending_review', 'active', 'reserved'))
      or exists (select 1 from public.orders   where seller_id = p_uid and status in ('PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED', 'COMPLETED', 'DISPUTED'));
end;
$$;

-- Thu hồi EXECUTE từ anon cho các hàm nội bộ / hỗ trợ trigger
revoke all on function public.is_entity_blacklisted(text, text) from public, anon, authenticated;
revoke all on function public.is_user_banned(uuid)              from public, anon, authenticated;
revoke all on function public.is_mod_user(uuid)                 from public, anon, authenticated;
revoke all on function public.listing_seller_missing(uuid)      from public, anon, authenticated;
revoke all on function public.identity_locked(uuid)             from public, anon, authenticated;
revoke all on function public.normalize_ban_value(text, text)   from public, anon, authenticated;

grant execute on function public.is_entity_blacklisted(text, text) to authenticated;
grant execute on function public.is_user_banned(uuid)              to authenticated;
grant execute on function public.is_mod_user(uuid)                 to authenticated;
grant execute on function public.listing_seller_missing(uuid)      to authenticated;
grant execute on function public.identity_locked(uuid)             to authenticated;
grant execute on function public.normalize_ban_value(text, text)   to authenticated;

-- ---------------------------------------------------------------------
-- 3. Siết chặt Fingerprint: chặn mã yếu (`fb_*`), ẩn lý do với anon, giới hạn bản ghi
-- ---------------------------------------------------------------------
create or replace function public.check_device_banned(p_visitor_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vid text := btrim(coalesce(p_visitor_id, ''));
begin
  -- Chỉ chấp nhận mã thiết bị đủ độ dài/định dạng và bỏ qua mã dự phòng cũ (fb_*) dễ trùng lặp
  if v_vid !~ '^[A-Za-z0-9_-]{16,128}$' or v_vid like 'fb_%' then
    return jsonb_build_object('banned', false, 'reason', null);
  end if;

  if exists (
    select 1
      from public.banned_entities
     where entity_type = 'fingerprint'
       and entity_value = v_vid
  ) then
    -- Không trả ghi chú nội bộ của quản trị viên ra cho khách chưa đăng nhập
    return jsonb_build_object(
      'banned', true,
      'reason', 'Thiết bị này đã bị hạn chế truy cập VAHA Market.'
    );
  end if;

  return jsonb_build_object('banned', false, 'reason', null);
end;
$$;

create or replace function public.register_device_and_check_ban(
  p_visitor_id text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_vid           text := left(btrim(coalesce(p_visitor_id, '')), 128);
  v_ua            text := nullif(left(btrim(coalesce(p_user_agent, '')), 500), '');
  v_valid_vid     boolean;
  v_profile       public.profiles%rowtype;
  v_email         text;
  v_is_admin      boolean := false;
  v_matched       boolean := false;
  v_device_count  integer := 0;
  v_banned_fp_cnt integer := 0;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  -- Chỉ chấp nhận mã thiết bị đủ độ tin cậy, bỏ qua mã dự phòng cũ dễ trùng lặp (fb_*)
  v_valid_vid := (v_vid ~ '^[A-Za-z0-9_-]{16,128}$' and v_vid not like 'fb_%');

  -- 1) Ghi nhận thiết bị (tối đa 20 thiết bị / tài khoản để chống bơm rác bảng)
  if v_valid_vid then
    if exists (select 1 from public.user_devices where user_id = v_uid and visitor_id = v_vid) then
      update public.user_devices
         set last_seen_at = now(),
             user_agent   = coalesce(v_ua, user_agent)
       where user_id = v_uid and visitor_id = v_vid;
    else
      select count(*) into v_device_count from public.user_devices where user_id = v_uid;
      if v_device_count < 20 then
        insert into public.user_devices (user_id, visitor_id, user_agent)
        values (v_uid, v_vid, v_ua)
        on conflict (user_id, visitor_id) do update
          set last_seen_at = now(),
              user_agent   = coalesce(excluded.user_agent, public.user_devices.user_agent);
      end if;
    end if;
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  select exists (select 1 from public.admins where user_id = v_uid) into v_is_admin;

  if v_is_admin then
    return jsonb_build_object(
      'is_banned',     false,
      'ban_reason',    null,
      'banned_at',     null,
      'warning_count', coalesce(v_profile.warning_count, 0),
      'auto_banned',   false
    );
  end if;

  -- Đã bị khóa sẵn: giới hạn tối đa 5 mã thiết bị tự động thêm vào danh sách đen / tài khoản
  if coalesce(v_profile.is_banned, false) then
    if v_valid_vid then
      select count(*) into v_banned_fp_cnt
        from public.banned_entities
       where source_user_id = v_uid and entity_type = 'fingerprint';

      if v_banned_fp_cnt < 5 then
        insert into public.banned_entities (entity_type, entity_value, reason, source_user_id)
        values ('fingerprint', v_vid, coalesce(v_profile.ban_reason, 'Tài khoản bị khóa vĩnh viễn'), v_uid)
        on conflict (entity_type, entity_value) do nothing;
      end if;
    end if;

    return jsonb_build_object(
      'is_banned',     true,
      'ban_reason',    v_profile.ban_reason,
      'banned_at',     v_profile.banned_at,
      'warning_count', v_profile.warning_count,
      'auto_banned',   false
    );
  end if;

  -- 2) Kiểm tra trùng thiết bị hợp lệ hoặc email trong danh sách đen
  select public.normalize_ban_value('email', u.email)
    into v_email
    from auth.users u
   where u.id = v_uid;

  if v_valid_vid and exists (
    select 1 from public.banned_entities
     where entity_type = 'fingerprint' and entity_value = v_vid
  ) then
    v_matched := true;
  elsif coalesce(v_email, '') <> '' and exists (
    select 1 from public.banned_entities
     where entity_type = 'email' and entity_value = v_email
  ) then
    v_matched := true;
  end if;

  if v_matched then
    v_profile := public._ban_user_internal(
      v_uid,
      'Phát hiện tạo tài khoản mới từ thiết bị hoặc email đã bị khóa trên VAHA Market',
      null
    );

    insert into public.admin_audit_log (admin_id, action, target_user_id, note)
    values (null, 'AUTO_BAN_BLACKLISTED_DEVICE', v_uid, 'visitor_id=' || coalesce(v_vid, ''));

    return jsonb_build_object(
      'is_banned',     true,
      'ban_reason',    v_profile.ban_reason,
      'banned_at',     v_profile.banned_at,
      'warning_count', v_profile.warning_count,
      'auto_banned',   true
    );
  end if;

  return jsonb_build_object(
    'is_banned',     false,
    'ban_reason',    null,
    'banned_at',     null,
    'warning_count', coalesce(v_profile.warning_count, 0),
    'auto_banned',   false
  );
end;
$$;

-- Xóa các mã dự phòng cũ (fb_*) nếu lỡ tồn tại trong banned_entities để tránh khóa nhầm người dùng
delete from public.banned_entities
 where entity_type = 'fingerprint'
   and (entity_value like 'fb_%' or char_length(entity_value) < 16);

-- ---------------------------------------------------------------------
-- 4. Kiểm tra URL ảnh ở tầng DB (chặn Stored XSS & ảnh theo dõi IP bên ngoài)
-- ---------------------------------------------------------------------
create or replace function public.is_valid_cloudinary_url(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_url, '') ~ '^https://res\.cloudinary\.com/[A-Za-z0-9_-]+/image/upload/[^[:space:]<>"]+$';
$$;

create or replace function public.listings_images_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if jsonb_typeof(new.images) <> 'array' then
    raise exception 'Danh sách ảnh sản phẩm không hợp lệ.' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(new.images) loop
    if jsonb_typeof(v_item) <> 'object'
       or not public.is_valid_cloudinary_url(v_item ->> 'url') then
      raise exception 'Đường dẫn ảnh sản phẩm không hợp lệ.' using errcode = '22023';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_listings_images_validate on public.listings;
create trigger trg_listings_images_validate
  before insert or update of images on public.listings
  for each row execute function public.listings_images_validate();

create or replace function public.profiles_avatar_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.avatar_url is not null
     and new.avatar_url is distinct from old.avatar_url
     and new.avatar_url !~ '^https://(lh[0-9]\.googleusercontent\.com|res\.cloudinary\.com)/[^[:space:]<>"]+$' then
    raise exception 'Đường dẫn ảnh đại diện không hợp lệ.' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_avatar_validate on public.profiles;
create trigger trg_profiles_avatar_validate
  before update of avatar_url on public.profiles
  for each row execute function public.profiles_avatar_validate();

-- ---------------------------------------------------------------------
-- 5. Chặn tài khoản bị khóa chỉnh sửa hồ sơ, liên hệ, ngân hàng và xóa tin
-- ---------------------------------------------------------------------
create or replace function public.block_banned_user_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and public.is_user_banned((select auth.uid())) then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_ban_guard on public.profiles;
create trigger trg_profiles_ban_guard
  before update on public.profiles
  for each row execute function public.block_banned_user_write();

drop trigger if exists trg_profile_contacts_ban_guard on public.profile_contacts;
create trigger trg_profile_contacts_ban_guard
  before update on public.profile_contacts
  for each row execute function public.block_banned_user_write();

drop trigger if exists trg_bank_accounts_ban_guard on public.bank_accounts;
create trigger trg_bank_accounts_ban_guard
  before insert or update or delete on public.bank_accounts
  for each row execute function public.block_banned_user_write();

drop trigger if exists trg_listings_delete_ban_guard on public.listings;
create trigger trg_listings_delete_ban_guard
  before delete on public.listings
  for each row execute function public.block_banned_user_write();

-- ---------------------------------------------------------------------
-- 6. Bổ sung kiểm tra cột `brand` trong bộ lọc chống dẫn dụ ngoài sàn & tiền kiểm
-- ---------------------------------------------------------------------
create or replace function public.listings_moderation_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' or new.title is distinct from old.title then
    v := public.listing_text_violation(new.title);
    if v is not null then
      raise exception 'Tiêu đề không được chứa % (không dẫn dụ giao dịch ngoài sàn).', v using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' or new.description is distinct from old.description then
    v := public.listing_text_violation(new.description);
    if v is not null then
      raise exception 'Mô tả không được chứa % (không dẫn dụ giao dịch ngoài sàn).', v using errcode = 'P0001';
    end if;
  end if;

  if (tg_op = 'INSERT' or new.brand is distinct from old.brand) and new.brand is not null then
    v := public.listing_text_violation(new.brand);
    if v is not null then
      raise exception 'Thương hiệu không được chứa % (không dẫn dụ giao dịch ngoài sàn).', v using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.listings_review_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_priv    boolean;
  v_missing text[];
  v_changed boolean;
  v_target  text;
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  v_priv := public.is_admin() or public.is_mod_user(v_uid);

  if tg_op = 'INSERT' then
    v_missing := public.listing_seller_missing(new.seller_id);
    if cardinality(v_missing) > 0 then
      raise exception 'Hồ sơ người bán chưa đủ: thiếu %. Hãy cập nhật trong Cài đặt tài khoản.', array_to_string(v_missing, ', ') using errcode = 'P0001';
    end if;
    if not public.is_valid_cloudinary_url(new.verification_image_url) then
      raise exception 'Cần tải lên ảnh xác thực chính chủ trước khi đăng tin.' using errcode = 'P0001';
    end if;

    v_target := new.status::text;
    if v_target in ('active', 'pending_review') then
      new.status := case when v_priv then 'active' else 'pending_review' end;
    else
      new.status := 'draft';
    end if;
    new.approved_at := case when new.status::text = 'active' then now() else null end;
    new.rejection_reason := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    return new;
  end if;

  new.approved_at := old.approved_at;
  new.rejection_reason := old.rejection_reason;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;

  v_changed := new.title is distinct from old.title
            or new.brand is distinct from old.brand
            or new.description is distinct from old.description
            or new.images is distinct from old.images
            or new.verification_image_url is distinct from old.verification_image_url
            or new.bank_account_id is distinct from old.bank_account_id;
  v_target := new.status::text;

  if v_priv then
    if v_target in ('active', 'pending_review') then
      new.status := 'active';
      new.approved_at := coalesce(old.approved_at, now());
      new.rejection_reason := null;
    end if;
  elsif v_target in ('active', 'pending_review') then
    if old.approved_at is not null and old.status::text in ('active', 'hidden') and not v_changed then
      new.status := 'active';
    else
      v_missing := public.listing_seller_missing(new.seller_id);
      if cardinality(v_missing) > 0 then
        raise exception 'Hồ sơ người bán chưa đủ: thiếu %. Hãy cập nhật trong Cài đặt tài khoản.', array_to_string(v_missing, ', ') using errcode = 'P0001';
      end if;
      if not public.is_valid_cloudinary_url(new.verification_image_url) then
        raise exception 'Cần tải lên ảnh xác thực chính chủ để gửi duyệt.' using errcode = 'P0001';
      end if;
      new.status := 'pending_review';
      new.approved_at := null;
      new.rejection_reason := null;
    end if;
  elsif v_changed and old.approved_at is not null then
    new.approved_at := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Cập nhật create_order, cancel_order, expire_*, admin_resolve_dispute, email trigger
-- ---------------------------------------------------------------------
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
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;
  if p_recipient_name is null or char_length(btrim(p_recipient_name)) not between 2 and 80 then
    raise exception 'Tên người nhận không hợp lệ (2–80 ký tự).' using errcode = '22023';
  end if;
  if p_phone is null or btrim(p_phone) !~ '^[0-9+ ]{8,15}$' then
    raise exception 'Số điện thoại không hợp lệ.' using errcode = '22023';
  end if;
  if p_address is null or char_length(btrim(p_address)) not between 10 and 400 then
    raise exception 'Địa chỉ nhận hàng không hợp lệ (10–400 ký tự).' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Ghi chú quá dài (tối đa 500 ký tự).' using errcode = '22023';
  end if;

  select * into v_buyer_bank
    from public.bank_accounts
   where user_id = v_uid
   order by is_default desc, created_at desc
   limit 1;
  if not found then
    raise exception 'Hãy thêm tài khoản ngân hàng trong Cài đặt tài khoản trước khi đặt mua để nhận hoàn tiền khi cần.' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'active' then
    raise exception 'Sản phẩm không còn mở bán.' using errcode = 'P0001';
  end if;
  if v_listing.seller_id = v_uid then
    raise exception 'Bạn không thể mua sản phẩm của chính mình.' using errcode = 'P0001';
  end if;
  if not v_listing.ship_cod then
    raise exception 'Tin này chỉ giao dịch trực tiếp.' using errcode = 'P0001';
  end if;

  select * into v_bank
    from public.bank_accounts
   where id = v_listing.bank_account_id and user_id = v_listing.seller_id;
  if not found then
    raise exception 'Người bán chưa có tài khoản nhận tiền hợp lệ.' using errcode = 'P0001';
  end if;

  select round(global_fee_rate * 10000)::integer, coalesce(fee_cap_vnd, 0)
    into v_global_bp, v_fee_cap
    from public.platform_settings
   where id = 1;
  v_global_bp := coalesce(v_global_bp, 0);
  v_fee_cap   := coalesce(v_fee_cap, 0);

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
    raise exception 'Giá vừa thay đổi (hiện là % đ). Hãy tải lại trang trước khi mua.', (v_listing.price + v_buyer_fee)
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
        btrim(p_recipient_name), btrim(p_phone), btrim(p_address), nullif(btrim(coalesce(p_note, '')), ''),
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

  insert into public.order_refund_accounts (
    order_id, buyer_id, bank_bin, bank_code, bank_name, account_number, account_name
  ) values (
    v_order.id, v_uid, v_buyer_bank.bank_bin, v_buyer_bank.bank_code, v_buyer_bank.bank_name,
    v_buyer_bank.account_number, v_buyer_bank.account_name
  );

  update public.listings set status = 'reserved' where id = v_listing.id;

  return v_order;
end;
$$;

-- Chặn hủy đơn nếu đã nhận một phần tiền (UNDERPAID)
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
    raise exception 'Chỉ hủy được đơn chưa thanh toán.' using errcode = 'P0001';
  end if;
  if v_order.paid_amount > 0 then
    raise exception 'Đơn đã ghi nhận một phần tiền chuyển khoản. Hãy chuyển nốt phần thiếu hoặc liên hệ quản trị viên.' using errcode = 'P0001';
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

-- Không tự đóng đơn quá hạn nếu đã nhận 1 phần tiền (tránh mở bán lại khi tiền đang treo)
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

  if v_order.status = 'PENDING_PAYMENT' and v_order.paid_amount = 0 and v_order.expires_at < now() then
    update public.orders
       set status = 'EXPIRED', cancelled_at = now(), cancel_reason = 'Hết hạn thanh toán'
     where id = v_order.id
     returning * into v_order;

    update public.listings set status = 'active'
     where id = v_order.listing_id and status = 'reserved';
  end if;

  return v_order;
end;
$$;

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
     where status = 'PENDING_PAYMENT'
       and paid_amount = 0
       and expires_at < now()
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

-- Cập nhật admin_resolve_dispute: ghi refund_requested_at khi hoàn tiền cho người mua
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
    update public.orders
       set status = 'COMPLETED', completed_at = now(), resolved_at = now(), admin_note = v_note
     where id = v_order.id
     returning * into v_order;

    update public.order_payouts set status = 'PENDING' where order_id = v_order.id;
    update public.listings      set status = 'sold'    where id = v_order.listing_id;
    update public.profiles      set sold_count   = sold_count   + 1 where id = v_order.seller_id;
    update public.profiles      set bought_count = bought_count + 1 where id = v_order.buyer_id;
  else
    update public.orders
       set status = 'REFUNDED', resolved_at = now(), refund_requested_at = now(), admin_note = v_note
     where id = v_order.id
     returning * into v_order;

    update public.listings set status = 'hidden'
     where id = v_order.listing_id and status = 'reserved';
  end if;

  insert into public.admin_audit_log (admin_id, action, order_id, note)
  values ((select auth.uid()), 'RESOLVE_DISPUTE_' || p_decision, v_order.id, v_note);

  return v_order;
end;
$$;

-- Cập nhật trigger gửi email đơn hàng: đọc STK hoàn tiền từ public.order_refund_accounts
create or replace function public.trg_orders_email_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email       text;
  v_name        text;
  v_title       text := coalesce(new.listing_snapshot ->> 'title', new.payment_code);
  v_ref_bank    text;
  v_ref_acc_no  text;
  v_ref_acc_nm  text;
begin
  if new.status = 'REFUNDED' and old.refund_completed_at is null and new.refund_completed_at is not null then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.buyer_id;

    select r.bank_name, r.account_number, r.account_name
      into v_ref_bank, v_ref_acc_no, v_ref_acc_nm
      from public.order_refund_accounts r
     where r.order_id = new.id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',         'ORDER_REFUND_COMPLETED',
      'to',            v_email,
      'recipientName', v_name,
      'orderId',       new.id,
      'paymentCode',   new.payment_code,
      'listingTitle',  v_title,
      'amount',        greatest(new.paid_amount, new.amount),
      'bankName',      coalesce(v_ref_bank, new.refund_bank_name),
      'accountNumber', coalesce(v_ref_acc_no, new.refund_account_number),
      'accountName',   coalesce(v_ref_acc_nm, new.refund_account_name),
      'reference',     new.refund_reference
    ));
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

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
      'sellerPayout',  new.seller_payout,
      'adminNote',     new.admin_note
    ));

  elsif new.status = 'REFUNDED' then
    select u.email, p.display_name
      into v_email, v_name
      from auth.users u
      left join public.profiles p on p.id = u.id
     where u.id = new.buyer_id;

    select r.bank_name, r.account_number, r.account_name
      into v_ref_bank, v_ref_acc_no, v_ref_acc_nm
      from public.order_refund_accounts r
     where r.order_id = new.id;

    perform public.notify_send_order_email(jsonb_build_object(
      'event',         'ORDER_REFUND_REQUESTED',
      'to',            v_email,
      'recipientName', v_name,
      'orderId',       new.id,
      'paymentCode',   new.payment_code,
      'listingTitle',  v_title,
      'amount',        greatest(new.paid_amount, new.amount),
      'cancelReason',  coalesce(new.cancel_reason, new.admin_note),
      'bankName',      coalesce(v_ref_bank, new.refund_bank_name),
      'accountNumber', coalesce(v_ref_acc_no, new.refund_account_number),
      'accountName',   coalesce(v_ref_acc_nm, new.refund_account_name)
    ));
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Thu hồi quyền UPDATE trực tiếp bảng platform_settings (bắt buộc qua RPC)
-- ---------------------------------------------------------------------
revoke update on table public.platform_settings from authenticated;
drop policy if exists "settings_update_admin" on public.platform_settings;

-- ---------------------------------------------------------------------
-- 9. Phân quyền thực thi hàm mới & hàm cập nhật
-- ---------------------------------------------------------------------
revoke all on function public.is_valid_cloudinary_url(text)                        from public, anon, authenticated;
revoke all on function public.listings_images_validate()                           from public, anon, authenticated;
revoke all on function public.profiles_avatar_validate()                           from public, anon, authenticated;
revoke all on function public.block_banned_user_write()                            from public, anon, authenticated;
revoke all on function public.check_device_banned(text)                            from public, anon, authenticated;
revoke all on function public.register_device_and_check_ban(text, text)            from public, anon, authenticated;
revoke all on function public.create_order(uuid, text, text, text, text, bigint)   from public, anon, authenticated;
revoke all on function public.cancel_order(uuid)                                   from public, anon, authenticated;
revoke all on function public.expire_order_if_due(uuid)                            from public, anon, authenticated;
revoke all on function public.expire_pending_orders()                              from public, anon, authenticated;
revoke all on function public.admin_resolve_dispute(uuid, text, text)              from public, anon, authenticated;
revoke all on function public.trg_orders_email_notify()                            from public, anon, authenticated;

grant execute on function public.is_valid_cloudinary_url(text)                     to authenticated;
grant execute on function public.check_device_banned(text)                         to anon, authenticated;
grant execute on function public.register_device_and_check_ban(text, text)         to authenticated;
grant execute on function public.create_order(uuid, text, text, text, text, bigint) to authenticated;
grant execute on function public.cancel_order(uuid)                                to authenticated;
grant execute on function public.expire_order_if_due(uuid)                         to authenticated;
grant execute on function public.expire_pending_orders()                           to service_role;
grant execute on function public.admin_resolve_dispute(uuid, text, text)           to authenticated;
