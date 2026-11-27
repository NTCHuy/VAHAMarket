-- =====================================================================
--  PATCH 015 — VAHA Market v2.0.5:
--    1. Admin xem hồ sơ chi tiết thành viên phục vụ kiểm duyệt
--       (tìm kiếm thành viên, hồ sơ đầy đủ, thiết bị trùng, ghi chú nội bộ, sửa định danh)
--    2. Gỡ / Xóa vĩnh viễn / Khôi phục tin đăng (kể cả tin đã duyệt)
--    3. Nhật ký quản trị (Admin Audit Log) & thống kê tổng quan mở rộng
--  Chạy 1 lần trên SQL Editor (100% idempotent). Cần chạy SAU schema.sql và 002 -> 014.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Ràng buộc listings.moderation_note & bảng ghi chú nội bộ thành viên
-- ---------------------------------------------------------------------
alter table public.listings drop constraint if exists listings_moderation_note_check;
alter table public.listings add constraint listings_moderation_note_check
  check (moderation_note is null or char_length(moderation_note) <= 500);

create table if not exists public.admin_member_notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  admin_id   uuid references auth.users (id) on delete set null,
  note       text not null check (char_length(btrim(note)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists idx_admin_member_notes_user
  on public.admin_member_notes (user_id, created_at desc);

alter table public.admin_member_notes enable row level security;
revoke all on table public.admin_member_notes from public, anon, authenticated;
grant select on public.admin_member_notes to authenticated;

drop policy if exists "admin_member_notes_select_admin" on public.admin_member_notes;
create policy "admin_member_notes_select_admin" on public.admin_member_notes
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------
-- 2. Tìm kiếm & lọc danh sách thành viên (Admin)
-- ---------------------------------------------------------------------
create or replace function public.admin_search_members(
  p_query  text default null,
  p_filter text default 'all',
  p_limit  integer default 30,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q        text := btrim(coalesce(p_query, ''));
  v_esc      text;
  v_unaccent text;
  v_filter   text := lower(btrim(coalesce(p_filter, 'all')));
  v_limit    integer := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset   integer := greatest(0, coalesce(p_offset, 0));
  v_is_uuid  boolean := false;
  v_total    bigint := 0;
  v_items    jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  if v_filter not in ('all', 'mod', 'warned', 'banned', 'incomplete', 'sellers') then
    v_filter := 'all';
  end if;

  v_is_uuid := v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_esc := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');
  v_unaccent := extensions.unaccent(lower(v_esc));

  with base as (
    select
      p,
      coalesce(c.email, u.email) as email,
      c.phone,
      c.province,
      u.last_sign_in_at,
      exists (select 1 from public.admins a where a.user_id = p.id) as is_admin,
      (select count(*)::integer from public.bank_accounts b where b.user_id = p.id) as bank_count,
      (select count(*)::integer from public.listings l where l.seller_id = p.id and l.status::text = 'active') as active_listings_count,
      (select count(*)::integer from public.listings l where l.seller_id = p.id) as total_listings_count,
      (select count(*)::integer from public.user_devices d where d.user_id = p.id) as device_count,
      (
        select count(distinct d2.user_id)::integer
          from public.user_devices d1
          join public.user_devices d2
            on d2.visitor_id = d1.visitor_id
           and d2.user_id <> d1.user_id
         where d1.user_id = p.id
           and d1.visitor_id not like 'fb\_%' escape '\'
      ) as shared_device_count,
      public.listing_seller_missing(p.id) as missing_seller_fields
    from public.profiles p
    left join public.profile_contacts c on c.user_id = p.id
    left join auth.users u on u.id = p.id
    where (
      v_q = ''
      or (v_is_uuid and p.id = v_q::uuid)
      or p.display_name ilike '%' || v_esc || '%' escape '\'
      or extensions.unaccent(lower(p.display_name)) ilike '%' || v_unaccent || '%' escape '\'
      or coalesce(c.email, u.email, '') ilike '%' || v_esc || '%' escape '\'
      or coalesce(c.phone, '') ilike '%' || v_esc || '%' escape '\'
      or coalesce(p.facebook_url, '') ilike '%' || v_esc || '%' escape '\'
      or coalesce(c.province, '') ilike '%' || v_esc || '%' escape '\'
      or exists (
        select 1
          from public.bank_accounts b
         where b.user_id = p.id
           and (
             b.account_number ilike '%' || v_esc || '%' escape '\'
             or b.account_name ilike '%' || v_esc || '%' escape '\'
           )
      )
    )
    and (
      v_filter = 'all'
      or (v_filter = 'mod' and p.is_mod)
      or (v_filter = 'warned' and p.warning_count > 0 and not p.is_banned)
      or (v_filter = 'banned' and p.is_banned)
      or (v_filter = 'incomplete' and cardinality(public.listing_seller_missing(p.id)) > 0)
      or (v_filter = 'sellers' and (p.sold_count > 0 or exists (select 1 from public.listings l where l.seller_id = p.id)))
    )
  )
  select
    (select count(*) from base),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'profile',               to_jsonb(sub.p),
            'email',                 sub.email,
            'phone',                 sub.phone,
            'province',              sub.province,
            'is_admin',              sub.is_admin,
            'last_sign_in_at',       sub.last_sign_in_at,
            'bank_count',            sub.bank_count,
            'active_listings_count', sub.active_listings_count,
            'total_listings_count',  sub.total_listings_count,
            'device_count',          sub.device_count,
            'shared_device_count',   sub.shared_device_count,
            'missing_seller_fields', to_jsonb(sub.missing_seller_fields)
          )
          order by (sub.p).created_at desc
        )
        from (
          select *
            from base
           order by (p).created_at desc
           limit v_limit offset v_offset
        ) sub
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Xem hồ sơ chi tiết thành viên (Admin)
-- ---------------------------------------------------------------------
create or replace function public.admin_get_member_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_contact public.profile_contacts%rowtype;
  v_auth    jsonb;
  v_contact_json jsonb := null;
  v_is_admin boolean := false;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'Không tìm thấy thành viên.' using errcode = 'P0001';
  end if;

  select * into v_contact from public.profile_contacts where user_id = p_user_id;
  if found then
    v_contact_json := to_jsonb(v_contact);
  end if;

  select exists (select 1 from public.admins where user_id = p_user_id) into v_is_admin;

  select jsonb_build_object(
    'email',              u.email,
    'created_at',         u.created_at,
    'last_sign_in_at',    u.last_sign_in_at,
    'email_confirmed_at', u.email_confirmed_at
  )
    into v_auth
    from auth.users u
   where u.id = p_user_id;

  return jsonb_build_object(
    'profile',  to_jsonb(v_profile),
    'is_admin', v_is_admin,
    'auth',     coalesce(v_auth, '{}'::jsonb),
    'contact',  v_contact_json,
    'bank_accounts', coalesce(
      (
        select jsonb_agg(to_jsonb(b) order by b.is_default desc, b.created_at desc)
          from public.bank_accounts b
         where b.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'missing_seller_fields', to_jsonb(public.listing_seller_missing(p_user_id)),
    'identity_lock', jsonb_build_object(
      'locked',   public.identity_locked(p_user_id),
      'listings', (select count(*) from public.listings where seller_id = p_user_id and status::text in ('pending_review', 'active', 'reserved')),
      'orders',   (select count(*) from public.orders where seller_id = p_user_id and status in ('PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED', 'COMPLETED', 'DISPUTED'))
    ),
    'devices', coalesce(
      (
        select jsonb_agg(to_jsonb(d) order by d.last_seen_at desc)
          from public.user_devices d
         where d.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'shared_device_users', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'user_id',            s.user_id,
            'display_name',       s.display_name,
            'avatar_url',         s.avatar_url,
            'is_banned',          s.is_banned,
            'warning_count',      s.warning_count,
            'shared_visitor_ids', to_jsonb(s.shared_visitor_ids)
          )
          order by s.is_banned desc, s.warning_count desc, s.display_name asc
        )
        from (
          select
            p2.id as user_id,
            p2.display_name,
            p2.avatar_url,
            p2.is_banned,
            p2.warning_count,
            array_agg(distinct d2.visitor_id order by d2.visitor_id) as shared_visitor_ids
          from public.user_devices d1
          join public.user_devices d2
            on d2.visitor_id = d1.visitor_id
           and d2.user_id <> d1.user_id
          join public.profiles p2 on p2.id = d2.user_id
         where d1.user_id = p_user_id
           and d1.visitor_id not like 'fb\_%' escape '\'
         group by p2.id, p2.display_name, p2.avatar_url, p2.is_banned, p2.warning_count
        ) s
      ),
      '[]'::jsonb
    ),
    'warnings', coalesce(
      (
        select jsonb_agg(to_jsonb(w) order by w.created_at desc)
          from public.user_warnings w
         where w.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'banned_entities', coalesce(
      (
        select jsonb_agg(to_jsonb(e) order by e.created_at desc)
          from public.banned_entities e
         where e.source_user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'listings', coalesce(
      (
        select jsonb_agg(to_jsonb(l) order by l.created_at desc)
          from (
            select *
              from public.listings
             where seller_id = p_user_id
             order by created_at desc
             limit 50
          ) l
      ),
      '[]'::jsonb
    ),
    'orders', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',               o.id,
            'payment_code',     o.payment_code,
            'listing_id',       o.listing_id,
            'listing_snapshot', o.listing_snapshot,
            'buyer_id',         o.buyer_id,
            'seller_id',        o.seller_id,
            'amount',           o.amount,
            'seller_payout',    o.seller_payout,
            'list_price',       o.list_price,
            'status',           o.status,
            'created_at',       o.created_at,
            'paid_at',          o.paid_at,
            'shipped_at',       o.shipped_at,
            'completed_at',     o.completed_at,
            'disputed_at',      o.disputed_at
          )
          order by o.created_at desc
        )
        from (
          select *
            from public.orders
           where buyer_id = p_user_id or seller_id = p_user_id
           order by created_at desc
           limit 50
        ) o
      ),
      '[]'::jsonb
    ),
    'notes', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',         n.id,
            'user_id',    n.user_id,
            'admin_id',   n.admin_id,
            'admin_name', coalesce(ap.display_name, 'Quản trị viên'),
            'note',       n.note,
            'created_at', n.created_at
          )
          order by n.created_at desc
        )
        from public.admin_member_notes n
        left join public.profiles ap on ap.id = n.admin_id
       where n.user_id = p_user_id
      ),
      '[]'::jsonb
    ),
    'audit_logs', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',               al.id,
            'admin_id',         al.admin_id,
            'admin_name',       coalesce(ap.display_name, 'Hệ thống'),
            'action',           al.action,
            'order_id',         al.order_id,
            'listing_id',       al.listing_id,
            'transaction_id',   al.transaction_id,
            'target_user_id',   al.target_user_id,
            'note',             al.note,
            'created_at',       al.created_at
          )
          order by al.created_at desc
        )
        from (
          select *
            from public.admin_audit_log
           where target_user_id = p_user_id
           order by created_at desc
           limit 30
        ) al
        left join public.profiles ap on ap.id = al.admin_id
      ),
      '[]'::jsonb
    ),
    'stats', jsonb_build_object(
      'total_listings',    (select count(*) from public.listings where seller_id = p_user_id),
      'active_listings',   (select count(*) from public.listings where seller_id = p_user_id and status::text = 'active'),
      'pending_listings',  (select count(*) from public.listings where seller_id = p_user_id and status::text = 'pending_review'),
      'rejected_listings', (select count(*) from public.listings where seller_id = p_user_id and status::text = 'rejected'),
      'removed_listings',  (select count(*) from public.listings where seller_id = p_user_id and status::text = 'removed'),
      'total_sold_gmv',    coalesce((select sum(list_price) from public.orders where seller_id = p_user_id and status in ('COMPLETED', 'PAID_OUT')), 0),
      'total_bought_gmv',  coalesce((select sum(amount) from public.orders where buyer_id = p_user_id and status in ('COMPLETED', 'PAID_OUT')), 0),
      'dispute_as_seller', (select count(*) from public.orders where seller_id = p_user_id and disputed_at is not null),
      'dispute_as_buyer',  (select count(*) from public.orders where buyer_id = p_user_id and disputed_at is not null)
    )
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Gỡ / Xóa vĩnh viễn / Khôi phục tin đăng (Admin)
-- ---------------------------------------------------------------------
create or replace function public.admin_remove_listing(
  p_listing_id    uuid,
  p_reason        text,
  p_issue_warning boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing   public.listings%rowtype;
  v_reason    text := btrim(coalesce(p_reason, ''));
  v_warn_res  jsonb := null;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'Hãy nhập lý do gỡ tin (5–500 ký tự).' using errcode = '22023';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Không tìm thấy tin đăng.' using errcode = 'P0001';
  end if;
  if v_listing.status::text in ('reserved', 'sold', 'removed') then
    raise exception 'Không thể gỡ tin đang giữ chỗ, đã bán hoặc đã gỡ.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from public.orders
     where listing_id = p_listing_id
       and status in ('PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED', 'DISPUTED')
  ) then
    raise exception 'Tin đang có đơn hàng xử lý, không thể gỡ.' using errcode = 'P0001';
  end if;

  update public.listings
     set status          = 'removed',
         moderation_note = v_reason,
         reviewed_by     = (select auth.uid()),
         reviewed_at     = now()
   where id = p_listing_id
   returning * into v_listing;

  insert into public.admin_audit_log (admin_id, action, listing_id, target_user_id, note)
  values (
    (select auth.uid()),
    'REMOVE_LISTING',
    p_listing_id,
    v_listing.seller_id,
    format('"%s" — %s', left(v_listing.title, 100), v_reason)
  );

  if coalesce(p_issue_warning, false)
     and not exists (select 1 from public.admins where user_id = v_listing.seller_id) then
    v_warn_res := public.admin_issue_warning(
      v_listing.seller_id,
      left('Gỡ tin "' || left(v_listing.title, 80) || '": ' || v_reason, 1000),
      p_listing_id,
      null
    );
  end if;

  return jsonb_build_object(
    'listing', to_jsonb(v_listing),
    'warning', v_warn_res
  );
end;
$$;

create or replace function public.admin_delete_listing(
  p_listing_id    uuid,
  p_reason        text,
  p_issue_warning boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing   public.listings%rowtype;
  v_reason    text := btrim(coalesce(p_reason, ''));
  v_warn_res  jsonb := null;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 5 and 500 then
    raise exception 'Hãy nhập lý do xóa tin (5–500 ký tự).' using errcode = '22023';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Không tìm thấy tin đăng.' using errcode = 'P0001';
  end if;
  if v_listing.status::text in ('reserved', 'sold') then
    raise exception 'Không thể xóa vĩnh viễn tin đang giữ chỗ hoặc đã bán.' using errcode = 'P0001';
  end if;
  if exists (
    select 1
      from public.orders
     where listing_id = p_listing_id
       and status in ('PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED', 'DISPUTED')
  ) then
    raise exception 'Tin đang có đơn hàng xử lý, không thể xóa.' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (admin_id, action, listing_id, target_user_id, note)
  values (
    (select auth.uid()),
    'DELETE_LISTING',
    null,
    v_listing.seller_id,
    format('[%s] "%s" (%sđ, trạng thái cũ: %s) — Lý do: %s',
      v_listing.id,
      left(v_listing.title, 100),
      v_listing.price,
      v_listing.status::text,
      v_reason
    )
  );

  delete from public.listings where id = p_listing_id;

  if coalesce(p_issue_warning, false)
     and not exists (select 1 from public.admins where user_id = v_listing.seller_id) then
    v_warn_res := public.admin_issue_warning(
      v_listing.seller_id,
      left('Xóa tin "' || left(v_listing.title, 80) || '": ' || v_reason, 1000),
      null,
      null
    );
  end if;

  return jsonb_build_object(
    'deleted_id', p_listing_id,
    'seller_id',  v_listing.seller_id,
    'warning',    v_warn_res
  );
end;
$$;

create or replace function public.admin_restore_listing(
  p_listing_id uuid,
  p_note       text default null
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_note    text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Không tìm thấy tin đăng.' using errcode = 'P0001';
  end if;
  if v_listing.status::text <> 'removed' then
    raise exception 'Chỉ khôi phục được tin đang ở trạng thái Đã gỡ.' using errcode = 'P0001';
  end if;
  if v_listing.bank_account_id is null then
    raise exception 'Tài khoản ngân hàng gắn với tin không còn tồn tại, không thể khôi phục.' using errcode = 'P0001';
  end if;

  update public.listings
     set status          = 'hidden',
         moderation_note = null,
         reviewed_by     = (select auth.uid()),
         reviewed_at     = now()
   where id = p_listing_id
   returning * into v_listing;

  insert into public.admin_audit_log (admin_id, action, listing_id, target_user_id, note)
  values (
    (select auth.uid()),
    'RESTORE_LISTING',
    p_listing_id,
    v_listing.seller_id,
    coalesce(v_note, format('Khôi phục tin "%s" về trạng thái Ẩn.', left(v_listing.title, 100)))
  );

  return v_listing;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Ghi chú nội bộ & Chỉnh sửa định danh thành viên (Admin)
-- ---------------------------------------------------------------------
create or replace function public.admin_add_member_note(
  p_user_id uuid,
  p_note    text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note       text := btrim(coalesce(p_note, ''));
  v_row        public.admin_member_notes%rowtype;
  v_admin_name text;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_note) not between 1 and 1000 then
    raise exception 'Ghi chú phải từ 1 đến 1000 ký tự.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Không tìm thấy thành viên.' using errcode = 'P0001';
  end if;

  insert into public.admin_member_notes (user_id, admin_id, note)
  values (p_user_id, (select auth.uid()), v_note)
  returning * into v_row;

  select display_name into v_admin_name from public.profiles where id = v_row.admin_id;

  insert into public.admin_audit_log (admin_id, action, target_user_id, note)
  values ((select auth.uid()), 'ADD_MEMBER_NOTE', p_user_id, left(v_note, 300));

  return jsonb_build_object(
    'id',         v_row.id,
    'user_id',    v_row.user_id,
    'admin_id',   v_row.admin_id,
    'admin_name', coalesce(v_admin_name, 'Quản trị viên'),
    'note',       v_row.note,
    'created_at', v_row.created_at
  );
end;
$$;

create or replace function public.admin_delete_member_note(p_note_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.admin_member_notes%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  delete from public.admin_member_notes where id = p_note_id returning * into v_row;
  if not found then
    raise exception 'Không tìm thấy ghi chú.' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (admin_id, action, target_user_id, note)
  values ((select auth.uid()), 'DELETE_MEMBER_NOTE', v_row.user_id, left(v_row.note, 300));
end;
$$;

create or replace function public.admin_update_member_identity(
  p_user_id      uuid,
  p_facebook_url text,
  p_phone        text,
  p_reason       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile  public.profiles%rowtype;
  v_old_fb   text;
  v_old_ph   text;
  v_fb       text := nullif(btrim(coalesce(p_facebook_url, '')), '');
  v_phone    text := nullif(btrim(coalesce(p_phone, '')), '');
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_email    text;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'Hãy nhập lý do chỉnh sửa (3–500 ký tự).' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Không tìm thấy thành viên.' using errcode = 'P0001';
  end if;

  if v_fb is not null then
    if char_length(v_fb) > 200
       or v_fb !~* '^https?://([a-z0-9-]+\.)?(facebook\.com|fb\.com|fb\.me)/.+$' then
      raise exception 'Link Facebook không hợp lệ.' using errcode = '22023';
    end if;
    if public.is_entity_blacklisted('facebook_url', v_fb) then
      raise exception 'Link Facebook này đang nằm trong danh sách đen.' using errcode = 'P0001';
    end if;
  end if;

  if v_phone is not null then
    if v_phone !~ '^[0-9+ ]{8,15}$' then
      raise exception 'Số điện thoại không hợp lệ (8–15 chữ số).' using errcode = '22023';
    end if;
    if public.is_entity_blacklisted('phone', v_phone) then
      raise exception 'Số điện thoại này đang nằm trong danh sách đen.' using errcode = 'P0001';
    end if;
  end if;

  v_old_fb := v_profile.facebook_url;
  select phone into v_old_ph from public.profile_contacts where user_id = p_user_id;
  select email into v_email from auth.users where id = p_user_id;

  update public.profiles
     set facebook_url = v_fb
   where id = p_user_id
   returning * into v_profile;

  insert into public.profile_contacts (user_id, email, phone)
  values (p_user_id, v_email, v_phone)
  on conflict (user_id) do update
    set phone      = excluded.phone,
        updated_at = now();

  insert into public.admin_audit_log (admin_id, action, target_user_id, note)
  values (
    (select auth.uid()),
    'UPDATE_MEMBER_IDENTITY',
    p_user_id,
    format('FB: %s -> %s | SĐT: %s -> %s | Lý do: %s',
      coalesce(v_old_fb, 'trống'),
      coalesce(v_fb, 'trống'),
      coalesce(v_old_ph, 'trống'),
      coalesce(v_phone, 'trống'),
      v_reason
    )
  );

  return jsonb_build_object(
    'facebook_url', v_profile.facebook_url,
    'phone',        v_phone
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Nhật ký quản trị toàn hệ thống (Admin Audit Log)
-- ---------------------------------------------------------------------
create or replace function public.admin_list_audit_logs(
  p_action text default 'all',
  p_query  text default null,
  p_limit  integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cat    text := lower(btrim(coalesce(p_action, 'all')));
  v_q      text := btrim(coalesce(p_query, ''));
  v_esc    text;
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total  bigint := 0;
  v_items  jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  v_esc := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  with base as (
    select
      al.id,
      al.admin_id,
      coalesce(ap.display_name, 'Hệ thống') as admin_name,
      al.action,
      al.order_id,
      o.payment_code,
      al.listing_id,
      al.transaction_id,
      al.target_user_id,
      tp.display_name as target_user_name,
      al.note,
      al.created_at
    from public.admin_audit_log al
    left join public.profiles ap on ap.id = al.admin_id
    left join public.profiles tp on tp.id = al.target_user_id
    left join public.orders o on o.id = al.order_id
    where (
      v_cat = 'all'
      or (v_cat = 'listings' and (al.action like 'REVIEW_LISTING_%' or al.action in ('UPDATE_LISTING_PRICE', 'REMOVE_LISTING', 'DELETE_LISTING', 'RESTORE_LISTING')))
      or (v_cat = 'bans'     and al.action in ('BAN_USER', 'UNBAN_USER', 'ISSUE_WARNING', 'AUTO_BAN_3_STRIKES', 'ADD_BANNED_ENTITY', 'REMOVE_BANNED_ENTITY'))
      or (v_cat = 'orders'   and (al.action like 'RESOLVE_DISPUTE_%' or al.action in ('MARK_PAID_OUT', 'MARK_REFUNDED', 'FORCE_REFUND_ORDER', 'FORCE_COMPLETE_SHIPPED', 'MANUAL_CONFIRM_PAYMENT', 'RESOLVE_TRANSACTION')))
      or (v_cat = 'members'  and al.action in ('GRANT_MOD', 'REVOKE_MOD', 'ADD_MEMBER_NOTE', 'DELETE_MEMBER_NOTE', 'UPDATE_MEMBER_IDENTITY'))
      or (v_cat = 'settings' and al.action in ('SET_GLOBAL_FEE_RATE', 'SET_FEE_CAP'))
    )
    and (
      v_q = ''
      or al.action ilike '%' || v_esc || '%' escape '\'
      or coalesce(al.note, '') ilike '%' || v_esc || '%' escape '\'
      or coalesce(ap.display_name, '') ilike '%' || v_esc || '%' escape '\'
      or coalesce(tp.display_name, '') ilike '%' || v_esc || '%' escape '\'
      or coalesce(o.payment_code, '') ilike '%' || v_esc || '%' escape '\'
    )
  )
  select
    (select count(*) from base),
    coalesce(
      (
        select jsonb_agg(to_jsonb(sub) order by sub.created_at desc)
          from (
            select *
              from base
             order by created_at desc
             limit v_limit offset v_offset
          ) sub
      ),
      '[]'::jsonb
    )
  into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------
-- 7. Mở rộng admin_stats(): thêm total_members và active_listings_count
-- ---------------------------------------------------------------------
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
    'banned_count',          (select count(*) from public.profiles where is_banned = true),
    'total_members',         (select count(*) from public.profiles),
    'active_listings_count', (select count(*) from public.listings where status::text = 'active')
  );

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Phân quyền thực thi các hàm mới
-- ---------------------------------------------------------------------
revoke all on function public.admin_search_members(text, text, integer, integer)    from public, anon, authenticated;
revoke all on function public.admin_get_member_detail(uuid)                         from public, anon, authenticated;
revoke all on function public.admin_remove_listing(uuid, text, boolean)             from public, anon, authenticated;
revoke all on function public.admin_delete_listing(uuid, text, boolean)             from public, anon, authenticated;
revoke all on function public.admin_restore_listing(uuid, text)                     from public, anon, authenticated;
revoke all on function public.admin_add_member_note(uuid, text)                     from public, anon, authenticated;
revoke all on function public.admin_delete_member_note(uuid)                        from public, anon, authenticated;
revoke all on function public.admin_update_member_identity(uuid, text, text, text)  from public, anon, authenticated;
revoke all on function public.admin_list_audit_logs(text, text, integer, integer)   from public, anon, authenticated;
revoke all on function public.admin_stats()                                         from public, anon, authenticated;

grant execute on function public.admin_search_members(text, text, integer, integer)    to authenticated;
grant execute on function public.admin_get_member_detail(uuid)                         to authenticated;
grant execute on function public.admin_remove_listing(uuid, text, boolean)             to authenticated;
grant execute on function public.admin_delete_listing(uuid, text, boolean)             to authenticated;
grant execute on function public.admin_restore_listing(uuid, text)                     to authenticated;
grant execute on function public.admin_add_member_note(uuid, text)                     to authenticated;
grant execute on function public.admin_delete_member_note(uuid)                        to authenticated;
grant execute on function public.admin_update_member_identity(uuid, text, text, text)  to authenticated;
grant execute on function public.admin_list_audit_logs(text, text, integer, integer)   to authenticated;
grant execute on function public.admin_stats()                                         to authenticated;
