-- =====================================================================
--  PATCH 009 — VAHA Market v1.9.0: Hệ thống Cảnh báo 3 lần tự động Ban (3-Strike)
--              & Device Fingerprinting + Blacklist chống tạo tài khoản mới lách luật
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002 → 008.
--
--  1. Cột mới trên `profiles`: warning_count, is_banned, banned_at, ban_reason, banned_by
--  2. Bảng mới: `user_devices`, `banned_entities`, `user_warnings`
--  3. Hệ thống Cảnh báo (admin_issue_warning) tự động Ban khi warning_count >= 3
--  4. admin_ban_user / admin_unban_user / admin_add_banned_entity / admin_remove_banned_entity
--  5. Device Fingerprinting RPC: check_device_banned & register_device_and_check_ban (tự động Ban
--     nếu tạo tài khoản Google mới từ thiết bị đã bị cấm)
--  6. Trigger chặn lưu Facebook / SĐT / Tài khoản ngân hàng trùng danh sách đen + chặn user bị Ban đăng/sửa tin
-- =====================================================================

-- 1. Cập nhật bảng profiles ---------------------------------------------------------------
alter table public.profiles add column if not exists warning_count integer not null default 0;
alter table public.profiles add column if not exists is_banned     boolean not null default false;
alter table public.profiles add column if not exists banned_at     timestamptz;
alter table public.profiles add column if not exists ban_reason    text;
alter table public.profiles add column if not exists banned_by     uuid references auth.users (id) on delete set null;

alter table public.profiles drop constraint if exists profiles_warning_count_check;
alter table public.profiles add constraint profiles_warning_count_check check (warning_count >= 0);

alter table public.profiles drop constraint if exists profiles_ban_reason_check;
alter table public.profiles add constraint profiles_ban_reason_check
  check (ban_reason is null or char_length(ban_reason) <= 1000);

create index if not exists idx_profiles_is_banned on public.profiles (is_banned) where is_banned = true;
create index if not exists idx_profiles_warning_count on public.profiles (warning_count) where warning_count > 0;

-- 2. Bảng theo dõi thiết bị: public.user_devices ------------------------------------------
create table if not exists public.user_devices (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  visitor_id    text not null check (char_length(btrim(visitor_id)) between 4 and 128),
  user_agent    text check (user_agent is null or char_length(user_agent) <= 500),
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  constraint uq_user_devices_user_visitor unique (user_id, visitor_id)
);
create index if not exists idx_user_devices_user on public.user_devices (user_id);
create index if not exists idx_user_devices_visitor on public.user_devices (visitor_id);

alter table public.user_devices enable row level security;
revoke all on table public.user_devices from public, anon, authenticated;
grant select on public.user_devices to authenticated;

drop policy if exists "user_devices_select_admin" on public.user_devices;
create policy "user_devices_select_admin" on public.user_devices
  for select to authenticated
  using (public.is_admin());

-- 3. Bảng danh sách đen toàn sàn: public.banned_entities ----------------------------------
--    RLS bật, KHÔNG có policy cho client -> mọi thao tác bắt buộc đi qua hàm SECURITY DEFINER
create table if not exists public.banned_entities (
  id             uuid primary key default gen_random_uuid(),
  entity_type    text not null check (entity_type in ('fingerprint', 'bank_account', 'facebook_url', 'phone', 'email')),
  entity_value   text not null check (char_length(btrim(entity_value)) between 1 and 300),
  reason         text not null check (char_length(btrim(reason)) between 1 and 1000),
  source_user_id uuid references auth.users (id) on delete set null,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint uq_banned_entities_type_value unique (entity_type, entity_value)
);
create index if not exists idx_banned_entities_source_user on public.banned_entities (source_user_id);
create index if not exists idx_banned_entities_type on public.banned_entities (entity_type, created_at desc);

alter table public.banned_entities enable row level security;
revoke all on table public.banned_entities from public, anon, authenticated;

-- 4. Bảng lịch sử cảnh báo: public.user_warnings ------------------------------------------
create table if not exists public.user_warnings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  reason     text not null check (char_length(btrim(reason)) between 3 and 1000),
  listing_id uuid references public.listings (id) on delete set null,
  order_id   uuid references public.orders (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_warnings_user on public.user_warnings (user_id, created_at desc);

alter table public.user_warnings enable row level security;
revoke all on table public.user_warnings from public, anon, authenticated;
grant select on public.user_warnings to authenticated;

drop policy if exists "user_warnings_select_own_or_admin" on public.user_warnings;
create policy "user_warnings_select_own_or_admin" on public.user_warnings
  for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

-- 5. Hàm chuẩn hóa giá trị định danh cho Blacklist ----------------------------------------
create or replace function public.normalize_ban_value(p_type text, p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_value, ''));
begin
  if v = '' then
    return '';
  end if;
  if p_type = 'facebook_url' then
    return regexp_replace(lower(v), '/+$', '');
  elsif p_type = 'phone' then
    return regexp_replace(v, '[^0-9]', '', 'g');
  elsif p_type = 'email' then
    return lower(v);
  elsif p_type = 'bank_account' then
    -- Hỗ trợ dạng <bank_bin>:<account_number> hoặc chỉ <account_number>
    return upper(regexp_replace(v, '\s+', '', 'g'));
  else
    return v;
  end if;
end;
$$;

-- 6. Hàm nội bộ thực thi Ban toàn diện (dùng chung cho Admin Ban, Auto-Ban 3 gậy, Auto-Ban thiết bị)
create or replace function public._ban_user_internal(
  p_user_id  uuid,
  p_reason   text,
  p_actor_id uuid default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_reason  text := left(btrim(coalesce(p_reason, 'Vi phạm quy định VAHA Market')), 1000);
  v_email   text;
  v_phone   text;
  v_fb      text;
begin
  -- Không bao giờ ban tài khoản Admin
  if exists (select 1 from public.admins where user_id = p_user_id) then
    raise exception 'Không thể khóa tài khoản Quản trị viên.' using errcode = 'P0001';
  end if;

  -- 1) Gắn cờ is_banned trên profiles
  update public.profiles
     set is_banned  = true,
         banned_at  = coalesce(banned_at, now()),
         ban_reason = v_reason,
         banned_by  = coalesce(p_actor_id, banned_by)
   where id = p_user_id
   returning * into v_profile;

  if not found then
    raise exception 'Không tìm thấy thành viên.' using errcode = 'P0001';
  end if;

  -- 2) Chuyển toàn bộ tin đang active / pending_review / hidden sang rejected
  update public.listings
     set status           = 'rejected',
         rejection_reason = 'Tài khoản đã bị khóa vĩnh viễn do vi phạm quy định sàn',
         reviewed_by      = p_actor_id,
         reviewed_at      = now()
   where seller_id = p_user_id
     and status::text in ('active', 'pending_review', 'hidden');

  -- 3) Đưa toàn bộ dấu vết vào banned_entities
  -- 3a) Thiết bị (fingerprint)
  insert into public.banned_entities (entity_type, entity_value, reason, source_user_id, created_by)
  select 'fingerprint', btrim(d.visitor_id), v_reason, p_user_id, p_actor_id
    from public.user_devices d
   where d.user_id = p_user_id
     and btrim(d.visitor_id) <> ''
  on conflict (entity_type, entity_value) do nothing;

  -- 3b) Tài khoản ngân hàng (<bank_bin>:<account_number>)
  insert into public.banned_entities (entity_type, entity_value, reason, source_user_id, created_by)
  select 'bank_account',
         public.normalize_ban_value('bank_account', b.bank_bin || ':' || b.account_number),
         v_reason, p_user_id, p_actor_id
    from public.bank_accounts b
   where b.user_id = p_user_id
     and btrim(b.account_number) <> ''
  on conflict (entity_type, entity_value) do nothing;

  -- 3c) Link Facebook cá nhân
  v_fb := public.normalize_ban_value('facebook_url', v_profile.facebook_url);
  if v_fb <> '' then
    insert into public.banned_entities (entity_type, entity_value, reason, source_user_id, created_by)
    values ('facebook_url', v_fb, v_reason, p_user_id, p_actor_id)
    on conflict (entity_type, entity_value) do nothing;
  end if;

  -- 3d) Số điện thoại trong profile_contacts
  select public.normalize_ban_value('phone', c.phone)
    into v_phone
    from public.profile_contacts c
   where c.user_id = p_user_id;

  if coalesce(v_phone, '') <> '' then
    insert into public.banned_entities (entity_type, entity_value, reason, source_user_id, created_by)
    values ('phone', v_phone, v_reason, p_user_id, p_actor_id)
    on conflict (entity_type, entity_value) do nothing;
  end if;

  -- 3e) Email trong auth.users
  select public.normalize_ban_value('email', u.email)
    into v_email
    from auth.users u
   where u.id = p_user_id;

  if coalesce(v_email, '') <> '' then
    insert into public.banned_entities (entity_type, entity_value, reason, source_user_id, created_by)
    values ('email', v_email, v_reason, p_user_id, p_actor_id)
    on conflict (entity_type, entity_value) do nothing;
  end if;

  return v_profile;
end;
$$;

-- 7. RPC Admin: Ban / Unban / Cảnh báo (3-Strike) / Quản lý Blacklist ---------------------
create or replace function public.admin_ban_user(p_user_id uuid, p_reason text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 3 and 1000 then
    raise exception 'Hãy nhập lý do khóa tài khoản (3–1000 ký tự).' using errcode = '22023';
  end if;

  v_profile := public._ban_user_internal(p_user_id, v_reason, (select auth.uid()));

  insert into public.admin_audit_log (admin_id, action, target_user_id, note)
  values ((select auth.uid()), 'BAN_USER', p_user_id, v_reason);

  return v_profile;
end;
$$;

create or replace function public.admin_unban_user(p_user_id uuid)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  update public.profiles
     set is_banned     = false,
         banned_at     = null,
         ban_reason    = null,
         banned_by     = null,
         warning_count = 0
   where id = p_user_id
   returning * into v_profile;

  if not found then
    raise exception 'Không tìm thấy thành viên.' using errcode = 'P0001';
  end if;

  delete from public.banned_entities where source_user_id = p_user_id;

  insert into public.admin_audit_log (admin_id, action, target_user_id, note)
  values ((select auth.uid()), 'UNBAN_USER', p_user_id, 'Gỡ khóa tài khoản, reset cảnh báo về 0 và xóa dấu vết khỏi danh sách đen.');

  return v_profile;
end;
$$;

create or replace function public.admin_issue_warning(
  p_user_id    uuid,
  p_reason     text,
  p_listing_id uuid default null,
  p_order_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason      text := btrim(coalesce(p_reason, ''));
  v_profile     public.profiles%rowtype;
  v_auto_banned boolean := false;
  v_combined    text;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 3 and 1000 then
    raise exception 'Hãy nhập lý do cảnh báo (3–1000 ký tự).' using errcode = '22023';
  end if;
  if exists (select 1 from public.admins where user_id = p_user_id) then
    raise exception 'Không thể gửi cảnh báo cho tài khoản Quản trị viên.' using errcode = 'P0001';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Không tìm thấy thành viên.' using errcode = 'P0001';
  end if;

  insert into public.user_warnings (user_id, reason, listing_id, order_id, created_by)
  values (p_user_id, v_reason, p_listing_id, p_order_id, (select auth.uid()));

  update public.profiles
     set warning_count = warning_count + 1
   where id = p_user_id
   returning * into v_profile;

  insert into public.admin_audit_log (admin_id, action, target_user_id, listing_id, order_id, note)
  values (
    (select auth.uid()),
    'ISSUE_WARNING',
    p_user_id,
    p_listing_id,
    p_order_id,
    format('Cảnh báo #%s: %s', v_profile.warning_count, v_reason)
  );

  -- Tự động Ban toàn diện khi đạt >= 3 cảnh báo
  if v_profile.warning_count >= 3 and not v_profile.is_banned then
    select 'Tự động khóa vĩnh viễn do đạt 3 lần cảnh báo: ' || string_agg(w.reason, ' | ' order by w.created_at asc)
      into v_combined
      from (
        select reason, created_at
          from public.user_warnings
         where user_id = p_user_id
         order by created_at desc
         limit 3
      ) w;

    v_profile := public._ban_user_internal(
      p_user_id,
      left(coalesce(v_combined, 'Tự động khóa vĩnh viễn do đạt 3 lần cảnh báo.'), 1000),
      (select auth.uid())
    );
    v_auto_banned := true;

    insert into public.admin_audit_log (admin_id, action, target_user_id, note)
    values ((select auth.uid()), 'AUTO_BAN_3_STRIKES', p_user_id, v_profile.ban_reason);
  end if;

  return jsonb_build_object(
    'profile',       to_jsonb(v_profile),
    'warning_count', v_profile.warning_count,
    'auto_banned',   v_auto_banned
  );
end;
$$;

create or replace function public.admin_add_banned_entity(
  p_entity_type  text,
  p_entity_value text,
  p_reason       text
)
returns public.banned_entities
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_val    text := public.normalize_ban_value(p_entity_type, p_entity_value);
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row    public.banned_entities%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if p_entity_type not in ('fingerprint', 'bank_account', 'facebook_url', 'phone', 'email') then
    raise exception 'Loại định danh không hợp lệ.' using errcode = '22023';
  end if;
  if char_length(v_val) not between 1 and 300 then
    raise exception 'Giá trị định danh không hợp lệ.' using errcode = '22023';
  end if;
  if char_length(v_reason) not between 3 and 1000 then
    raise exception 'Hãy nhập lý do đưa vào danh sách đen (3–1000 ký tự).' using errcode = '22023';
  end if;

  insert into public.banned_entities (entity_type, entity_value, reason, created_by)
  values (p_entity_type, v_val, v_reason, (select auth.uid()))
  on conflict (entity_type, entity_value) do update
    set reason = excluded.reason, created_by = excluded.created_by
  returning * into v_row;

  insert into public.admin_audit_log (admin_id, action, note)
  values ((select auth.uid()), 'ADD_BANNED_ENTITY', format('[%s] %s — %s', p_entity_type, v_val, v_reason));

  return v_row;
end;
$$;

create or replace function public.admin_remove_banned_entity(p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.banned_entities%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  delete from public.banned_entities where id = p_entity_id returning * into v_row;
  if not found then
    raise exception 'Không tìm thấy mục trong danh sách đen.' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (admin_id, action, note)
  values ((select auth.uid()), 'REMOVE_BANNED_ENTITY', format('[%s] %s', v_row.entity_type, v_row.entity_value));
end;
$$;

create or replace function public.admin_list_banned_entities()
returns setof public.banned_entities
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  return query
  select *
    from public.banned_entities
   order by created_at desc
   limit 500;
end;
$$;

-- 8. Device Fingerprinting & Auto-Ban RPCs ------------------------------------------------
create or replace function public.check_device_banned(p_visitor_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_vid    text := btrim(coalesce(p_visitor_id, ''));
  v_reason text;
begin
  if char_length(v_vid) < 4 then
    return jsonb_build_object('banned', false, 'reason', null);
  end if;

  select reason
    into v_reason
    from public.banned_entities
   where entity_type = 'fingerprint'
     and entity_value = v_vid
   limit 1;

  if found then
    return jsonb_build_object('banned', true, 'reason', v_reason);
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
  v_uid      uuid := (select auth.uid());
  v_vid      text := left(btrim(coalesce(p_visitor_id, '')), 128);
  v_ua       text := nullif(left(btrim(coalesce(p_user_agent, '')), 500), '');
  v_profile  public.profiles%rowtype;
  v_email    text;
  v_is_admin boolean := false;
  v_matched  boolean := false;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  -- 1) Ghi nhận thiết bị
  if char_length(v_vid) >= 4 then
    insert into public.user_devices (user_id, visitor_id, user_agent)
    values (v_uid, v_vid, v_ua)
    on conflict (user_id, visitor_id) do update
      set last_seen_at = now(),
          user_agent   = coalesce(excluded.user_agent, public.user_devices.user_agent);
  end if;

  select * into v_profile from public.profiles where id = v_uid;
  select exists (select 1 from public.admins where user_id = v_uid) into v_is_admin;

  -- Admin không bao giờ bị tự động khóa
  if v_is_admin then
    return jsonb_build_object(
      'is_banned',     false,
      'ban_reason',    null,
      'banned_at',     null,
      'warning_count', coalesce(v_profile.warning_count, 0),
      'auto_banned',   false
    );
  end if;

  -- Đã bị ban sẵn
  if coalesce(v_profile.is_banned, false) then
    -- Đồng bộ thêm fingerprint mới nếu user đổi trình duyệt trên cùng tài khoản bị ban
    if char_length(v_vid) >= 4 then
      insert into public.banned_entities (entity_type, entity_value, reason, source_user_id)
      values ('fingerprint', v_vid, coalesce(v_profile.ban_reason, 'Tài khoản bị khóa vĩnh viễn'), v_uid)
      on conflict (entity_type, entity_value) do nothing;
    end if;

    return jsonb_build_object(
      'is_banned',     true,
      'ban_reason',    v_profile.ban_reason,
      'banned_at',     v_profile.banned_at,
      'warning_count', v_profile.warning_count,
      'auto_banned',   false
    );
  end if;

  -- 2) Kiểm tra trùng fingerprint hoặc email trong danh sách đen
  select public.normalize_ban_value('email', u.email)
    into v_email
    from auth.users u
   where u.id = v_uid;

  if char_length(v_vid) >= 4 and exists (
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

  -- 3) Nếu thiết bị / email đã nằm trong danh sách đen -> tự động Ban tài khoản mới này ngay
  if v_matched then
    v_profile := public._ban_user_internal(
      v_uid,
      'Phát hiện tạo tài khoản mới từ thiết bị đã bị cấm vĩnh viễn trên VAHA Market',
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

-- 9. Triggers chặn định danh trùng Blacklist & chặn user bị Ban thao tác ------------------
create or replace function public.is_user_banned(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_banned from public.profiles where id = p_uid), false);
$$;

create or replace function public.is_entity_blacklisted(p_type text, p_value text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.banned_entities
     where entity_type = p_type
       and entity_value = public.normalize_ban_value(p_type, p_value)
  );
$$;

-- 9a) Chặn cập nhật profiles.facebook_url trùng Blacklist
create or replace function public.profiles_blacklist_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.facebook_url is not null
     and btrim(new.facebook_url) <> ''
     and public.is_entity_blacklisted('facebook_url', new.facebook_url) then
    raise exception 'Link Facebook này đã nằm trong danh sách đen của VAHA Market và không thể sử dụng.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_blacklist_check on public.profiles;
create trigger trg_profiles_blacklist_check
  before insert or update of facebook_url on public.profiles
  for each row execute function public.profiles_blacklist_check();

-- 9b) Chặn cập nhật profile_contacts.phone trùng Blacklist
create or replace function public.profile_contacts_blacklist_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.phone is not null
     and btrim(new.phone) <> ''
     and public.is_entity_blacklisted('phone', new.phone) then
    raise exception 'Số điện thoại này đã nằm trong danh sách đen của VAHA Market và không thể sử dụng.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profile_contacts_blacklist_check on public.profile_contacts;
create trigger trg_profile_contacts_blacklist_check
  before insert or update of phone on public.profile_contacts
  for each row execute function public.profile_contacts_blacklist_check();

-- 9c) Chặn thêm/sửa bank_accounts trùng Blacklist (khớp cả dạng <bin>:<stk> lẫn chỉ <stk>)
create or replace function public.bank_accounts_blacklist_check()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if public.is_entity_blacklisted('bank_account', new.bank_bin || ':' || new.account_number)
       or public.is_entity_blacklisted('bank_account', new.account_number) then
      raise exception 'Tài khoản ngân hàng này đã nằm trong danh sách đen của VAHA Market và không thể sử dụng.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bank_accounts_blacklist_check on public.bank_accounts;
create trigger trg_bank_accounts_blacklist_check
  before insert or update on public.bank_accounts
  for each row execute function public.bank_accounts_blacklist_check();

-- 9d) Chặn tài khoản bị Ban đăng/sửa tin (bảo vệ tầng DB)
create or replace function public.listings_ban_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and public.is_user_banned((select auth.uid())) then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn do vi phạm quy định VAHA Market.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listings_ban_guard on public.listings;
create trigger trg_listings_ban_guard
  before insert or update on public.listings
  for each row execute function public.listings_ban_guard();

-- 10. admin_stats: bổ sung banned_count (giữ nguyên toàn bộ khóa cũ) ----------------------
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
    'gmv',           coalesce(sum(list_price)   filter (where status in ('COMPLETED', 'PAID_OUT')), 0),
    'fees',          coalesce(sum(platform_fee) filter (where status in ('COMPLETED', 'PAID_OUT')), 0),
    'held_count',    count(*)                   filter (where status in ('PAID_HELD', 'SHIPPED')),
    'held_amount',   coalesce(sum(amount)       filter (where status in ('PAID_HELD', 'SHIPPED')), 0),
    'dispute_count', count(*)                   filter (where status = 'DISPUTED')
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

-- 11. Phân quyền thực thi -----------------------------------------------------------------
revoke all on function public.normalize_ban_value(text, text)                  from public, anon, authenticated;
revoke all on function public._ban_user_internal(uuid, text, uuid)             from public, anon, authenticated;
revoke all on function public.admin_ban_user(uuid, text)                       from public, anon, authenticated;
revoke all on function public.admin_unban_user(uuid)                           from public, anon, authenticated;
revoke all on function public.admin_issue_warning(uuid, text, uuid, uuid)      from public, anon, authenticated;
revoke all on function public.admin_add_banned_entity(text, text, text)        from public, anon, authenticated;
revoke all on function public.admin_remove_banned_entity(uuid)                 from public, anon, authenticated;
revoke all on function public.admin_list_banned_entities()                     from public, anon, authenticated;
revoke all on function public.check_device_banned(text)                        from public, anon, authenticated;
revoke all on function public.register_device_and_check_ban(text, text)        from public, anon, authenticated;
revoke all on function public.is_user_banned(uuid)                             from public, anon, authenticated;
revoke all on function public.is_entity_blacklisted(text, text)                from public, anon, authenticated;
revoke all on function public.admin_stats()                                    from public, anon, authenticated;

grant execute on function public.normalize_ban_value(text, text)               to authenticated, anon;
grant execute on function public.is_user_banned(uuid)                          to authenticated, anon;
grant execute on function public.is_entity_blacklisted(text, text)             to authenticated, anon;
grant execute on function public.check_device_banned(text)                     to anon, authenticated;
grant execute on function public.register_device_and_check_ban(text, text)     to authenticated;
grant execute on function public.admin_ban_user(uuid, text)                    to authenticated;
grant execute on function public.admin_unban_user(uuid)                        to authenticated;
grant execute on function public.admin_issue_warning(uuid, text, uuid, uuid)   to authenticated;
grant execute on function public.admin_add_banned_entity(text, text, text)     to authenticated;
grant execute on function public.admin_remove_banned_entity(uuid)              to authenticated;
grant execute on function public.admin_list_banned_entities()                  to authenticated;
grant execute on function public.admin_stats()                                 to authenticated;
