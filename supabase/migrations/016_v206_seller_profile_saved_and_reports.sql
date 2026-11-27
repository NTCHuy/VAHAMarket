-- =====================================================================
--  PATCH 016 — VAHA Market v2.0.6:
--    1. Hồ sơ công khai người bán (`get_public_seller_profile`)
--    2. Lưu tin yêu thích & cảnh báo giảm giá Realtime (`saved_listings`)
--    3. Báo cáo tin vi phạm từ cộng đồng (`listing_reports` + Admin RPC)
--    4. Mở rộng `admin_stats()` và `admin_list_audit_logs()`
--  Chạy 1 lần trên SQL Editor (100% idempotent). Cần chạy SAU schema.sql và 002 -> 015.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Bảng public.saved_listings (Wishlist + theo dõi giảm giá)
-- ---------------------------------------------------------------------
create table if not exists public.saved_listings (
  user_id          uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  listing_id       uuid not null references public.listings (id) on delete cascade,
  saved_price      bigint not null check (saved_price > 0),
  latest_price     bigint not null check (latest_price > 0),
  price_dropped_at timestamptz,
  created_at       timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists idx_saved_listings_user_created
  on public.saved_listings (user_id, created_at desc);
create index if not exists idx_saved_listings_listing
  on public.saved_listings (listing_id);

alter table public.saved_listings enable row level security;
revoke all on table public.saved_listings from public, anon, authenticated;
grant select on public.saved_listings to authenticated;

drop policy if exists "saved_listings_select_own" on public.saved_listings;
create policy "saved_listings_select_own" on public.saved_listings
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Bật Supabase Realtime cho saved_listings (an toàn vì RLS chỉ cho chủ sở hữu đọc)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'saved_listings'
  ) then
    alter publication supabase_realtime add table public.saved_listings;
  end if;
end $$;

alter table public.saved_listings replica identity full;

-- Trigger cập nhật price_dropped_at khi người bán hạ giá tin đang active
create or replace function public.trg_listings_saved_price_drop_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text = 'active' and new.price < old.price then
    update public.saved_listings
       set latest_price     = new.price,
           price_dropped_at = now()
     where listing_id = new.id
       and new.price < latest_price;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listings_saved_price_drop on public.listings;
create trigger trg_listings_saved_price_drop
  after update of price on public.listings
  for each row
  execute function public.trg_listings_saved_price_drop_fn();

-- ---------------------------------------------------------------------
-- 2. Bảng public.listing_reports (Báo cáo tin đăng vi phạm)
-- ---------------------------------------------------------------------
create table if not exists public.listing_reports (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings (id) on delete cascade,
  reporter_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason_category text not null check (
    reason_category in (
      'counterfeit',
      'scam_suspected',
      'off_platform',
      'wrong_description',
      'already_sold',
      'spam',
      'other'
    )
  ),
  details         text check (details is null or char_length(details) <= 1000),
  status          text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by     uuid references auth.users (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  created_at      timestamptz not null default now(),
  constraint uq_listing_reports_listing_reporter unique (listing_id, reporter_id)
);

create index if not exists idx_listing_reports_status_created
  on public.listing_reports (status, created_at desc);
create index if not exists idx_listing_reports_listing
  on public.listing_reports (listing_id);

alter table public.listing_reports enable row level security;
revoke all on table public.listing_reports from public, anon, authenticated;
grant select on public.listing_reports to authenticated;

drop policy if exists "listing_reports_select_own_or_admin" on public.listing_reports;
create policy "listing_reports_select_own_or_admin" on public.listing_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or public.is_admin());

-- ---------------------------------------------------------------------
-- 3. RPC công khai: Hồ sơ người bán (/u/:id) — không lộ PII nhạy cảm
-- ---------------------------------------------------------------------
create or replace function public.get_public_seller_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile  public.profiles%rowtype;
  v_verified boolean := false;
begin
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    return null;
  end if;

  -- Kiểm tra trực tiếp trong SECURITY DEFINER (không gọi listing_seller_missing để tránh chặn anon từ patch 014)
  v_verified :=
    coalesce(btrim((select c.phone from public.profile_contacts c where c.user_id = p_user_id)), '') <> ''
    and coalesce(btrim(v_profile.facebook_url), '') <> ''
    and exists (select 1 from public.bank_accounts b where b.user_id = p_user_id);

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id',           v_profile.id,
      'display_name', v_profile.display_name,
      'avatar_url',   v_profile.avatar_url,
      'bio',          v_profile.bio,
      'is_mod',       v_profile.is_mod,
      'is_banned',    v_profile.is_banned,
      'sold_count',   v_profile.sold_count,
      'bought_count', v_profile.bought_count,
      'facebook_url', v_profile.facebook_url,
      'created_at',   v_profile.created_at
    ),
    'is_verified_seller', v_verified,
    'active_listings', case
      when v_profile.is_banned then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',                     l.id,
            'seller_id',              l.seller_id,
            'title',                  l.title,
            'price',                  l.price,
            'original_price',         l.original_price,
            'fee_payer',              l.fee_payer,
            'condition',              l.condition,
            'category',               l.category,
            'province',               l.province,
            'ship_cod',               l.ship_cod,
            'box_status',             l.box_status,
            'images',                 l.images,
            'verification_image_url', l.verification_image_url,
            'created_at',             l.created_at
          )
          order by l.created_at desc
        )
        from (
          select *
            from public.listings
           where seller_id = p_user_id
             and status::text = 'active'
           order by created_at desc
           limit 50
        ) l
      ), '[]'::jsonb)
    end,
    'sold_listings', case
      when v_profile.is_banned then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id',         l.id,
            'title',      l.title,
            'price',      l.price,
            'condition',  l.condition,
            'category',   l.category,
            'province',   l.province,
            'box_status', l.box_status,
            'images',     l.images,
            'created_at', l.created_at,
            'updated_at', l.updated_at
          )
          order by l.updated_at desc
        )
        from (
          select *
            from public.listings
           where seller_id = p_user_id
             and status::text = 'sold'
           order by updated_at desc
           limit 20
        ) l
      ), '[]'::jsonb)
    end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 4. RPC Wishlist cho người dùng đã đăng nhập
-- ---------------------------------------------------------------------
create or replace function public.toggle_saved_listing(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_banned  boolean := false;
  v_listing public.listings%rowtype;
  v_count   integer := 0;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để lưu tin.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_banned from public.profiles where id = v_uid;
  if v_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.saved_listings
     where user_id = v_uid and listing_id = p_listing_id
  ) then
    delete from public.saved_listings
     where user_id = v_uid and listing_id = p_listing_id;

    return jsonb_build_object(
      'saved',      false,
      'listing_id', p_listing_id
    );
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found or v_listing.status::text <> 'active' then
    raise exception 'Tin đăng không còn mở bán.' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_count
    from public.saved_listings
   where user_id = v_uid;

  if v_count >= 100 then
    raise exception 'Bạn chỉ có thể lưu tối đa 100 tin.' using errcode = 'P0001';
  end if;

  insert into public.saved_listings (user_id, listing_id, saved_price, latest_price)
  values (v_uid, p_listing_id, v_listing.price, v_listing.price)
  on conflict (user_id, listing_id) do nothing;

  return jsonb_build_object(
    'saved',       true,
    'listing_id',  p_listing_id,
    'saved_price', v_listing.price
  );
end;
$$;

create or replace function public.get_my_saved_listings()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'listing_id',       s.listing_id,
        'saved_price',      s.saved_price,
        'latest_price',     s.latest_price,
        'price_dropped_at', s.price_dropped_at,
        'saved_at',         s.created_at,
        'price_drop',       greatest(0, s.saved_price - l.price),
        'listing', jsonb_build_object(
          'id',                     l.id,
          'seller_id',              l.seller_id,
          'title',                  l.title,
          'price',                  l.price,
          'original_price',         l.original_price,
          'fee_payer',              l.fee_payer,
          'condition',              l.condition,
          'category',               l.category,
          'province',               l.province,
          'ship_cod',               l.ship_cod,
          'box_status',             l.box_status,
          'images',                 l.images,
          'verification_image_url', l.verification_image_url,
          'status',                 l.status,
          'created_at',             l.created_at
        ),
        'seller', jsonb_build_object(
          'id',           p.id,
          'display_name', p.display_name,
          'is_mod',       p.is_mod
        )
      )
      order by s.created_at desc
    )
    from public.saved_listings s
    join public.listings l on l.id = s.listing_id
    left join public.profiles p on p.id = l.seller_id
   where s.user_id = v_uid
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RPC Báo cáo tin đăng vi phạm (Người dùng & Admin)
-- ---------------------------------------------------------------------
create or replace function public.submit_listing_report(
  p_listing_id      uuid,
  p_reason_category text,
  p_details         text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_banned   boolean := false;
  v_listing  public.listings%rowtype;
  v_cat      text := btrim(coalesce(p_reason_category, ''));
  v_details  text := nullif(btrim(coalesce(p_details, '')), '');
  v_recent   integer := 0;
  v_row      public.listing_reports%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để gửi báo cáo.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_banned from public.profiles where id = v_uid;
  if v_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  if v_cat not in (
    'counterfeit', 'scam_suspected', 'off_platform',
    'wrong_description', 'already_sold', 'spam', 'other'
  ) then
    raise exception 'Nhóm lý do báo cáo không hợp lệ.' using errcode = '22023';
  end if;

  if v_details is not null and char_length(v_details) > 1000 then
    raise exception 'Mô tả chi tiết tối đa 1000 ký tự.' using errcode = '22023';
  end if;
  if v_cat = 'other' and char_length(coalesce(v_details, '')) < 5 then
    raise exception 'Vui lòng mô tả cụ thể lý do báo cáo (tối thiểu 5 ký tự).' using errcode = '22023';
  end if;

  select * into v_listing from public.listings where id = p_listing_id;
  if not found or v_listing.status::text <> 'active' then
    raise exception 'Chỉ báo cáo được tin đang mở bán.' using errcode = 'P0001';
  end if;
  if v_listing.seller_id = v_uid then
    raise exception 'Không thể tự báo cáo tin của chính mình.' using errcode = 'P0001';
  end if;

  select count(*)::integer into v_recent
    from public.listing_reports
   where reporter_id = v_uid
     and created_at >= now() - interval '24 hours';

  if v_recent >= 10 then
    raise exception 'Bạn đã gửi tối đa 10 báo cáo trong 24 giờ qua.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.listing_reports
     where listing_id = p_listing_id and reporter_id = v_uid
  ) then
    raise exception 'Bạn đã báo cáo tin này trước đó.' using errcode = 'P0001';
  end if;

  insert into public.listing_reports (listing_id, reporter_id, reason_category, details)
  values (p_listing_id, v_uid, v_cat, v_details)
  returning * into v_row;

  return jsonb_build_object(
    'id',              v_row.id,
    'listing_id',      v_row.listing_id,
    'reason_category', v_row.reason_category,
    'created_at',      v_row.created_at
  );
end;
$$;

create or replace function public.admin_list_listing_reports(
  p_status text default 'open',
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
  v_status text := lower(btrim(coalesce(p_status, 'open')));
  v_limit  integer := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total  bigint := 0;
  v_items  jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  if v_status not in ('open', 'resolved', 'dismissed', 'all') then
    v_status := 'open';
  end if;

  with base as (
    select
      r.id,
      r.listing_id,
      r.reporter_id,
      r.reason_category,
      r.details,
      r.status,
      r.resolved_by,
      r.resolved_at,
      r.resolution_note,
      r.created_at,
      jsonb_build_object(
        'id',              l.id,
        'title',           l.title,
        'price',           l.price,
        'status',          l.status,
        'images',          l.images,
        'seller_id',       l.seller_id,
        'moderation_note', l.moderation_note
      ) as listing,
      jsonb_build_object(
        'id',            sp.id,
        'display_name',  sp.display_name,
        'avatar_url',    sp.avatar_url,
        'is_mod',        sp.is_mod,
        'is_banned',     sp.is_banned,
        'warning_count', sp.warning_count
      ) as seller,
      jsonb_build_object(
        'id',           rp.id,
        'display_name', rp.display_name,
        'avatar_url',   rp.avatar_url
      ) as reporter,
      ap.display_name as resolver_name,
      (
        select count(*)::integer
          from public.listing_reports r2
         where r2.listing_id = r.listing_id
           and r2.status = 'open'
      ) as open_reports_count
    from public.listing_reports r
    join public.listings l on l.id = r.listing_id
    left join public.profiles sp on sp.id = l.seller_id
    left join public.profiles rp on rp.id = r.reporter_id
    left join public.profiles ap on ap.id = r.resolved_by
    where (v_status = 'all' or r.status = v_status)
  )
  select
    (select count(*) from base),
    coalesce((
      select jsonb_agg(to_jsonb(sub) order by sub.created_at desc)
        from (
          select *
            from base
           order by created_at desc
           limit v_limit offset v_offset
        ) sub
    ), '[]'::jsonb)
  into v_total, v_items;

  return jsonb_build_object('total', v_total, 'items', v_items);
end;
$$;

create or replace function public.admin_resolve_listing_report(
  p_report_id              uuid,
  p_status                 text,
  p_note                   text default null,
  p_resolve_all_for_listing boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report      public.listing_reports%rowtype;
  v_status      text := lower(btrim(coalesce(p_status, '')));
  v_note        text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_seller_id   uuid;
  v_title       text;
  v_updated     integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if v_status not in ('resolved', 'dismissed') then
    raise exception 'Trạng thái xử lý không hợp lệ.' using errcode = '22023';
  end if;

  select * into v_report from public.listing_reports where id = p_report_id for update;
  if not found then
    raise exception 'Không tìm thấy báo cáo.' using errcode = 'P0001';
  end if;

  select seller_id, title into v_seller_id, v_title
    from public.listings
   where id = v_report.listing_id;

  if coalesce(p_resolve_all_for_listing, false) then
    update public.listing_reports
       set status          = v_status,
           resolved_by     = (select auth.uid()),
           resolved_at     = now(),
           resolution_note = v_note
     where listing_id = v_report.listing_id
       and (status = 'open' or id = p_report_id);
  else
    update public.listing_reports
       set status          = v_status,
           resolved_by     = (select auth.uid()),
           resolved_at     = now(),
           resolution_note = v_note
     where id = p_report_id;
  end if;

  get diagnostics v_updated = row_count;

  insert into public.admin_audit_log (admin_id, action, listing_id, target_user_id, note)
  values (
    (select auth.uid()),
    'RESOLVE_LISTING_REPORT',
    v_report.listing_id,
    v_seller_id,
    format('[%s] "%s" (%s báo cáo)%s',
      case when v_status = 'resolved' then 'Đã xử lý' else 'Bỏ qua' end,
      left(coalesce(v_title, 'Tin đăng'), 80),
      v_updated,
      case when v_note is not null then ' — ' || v_note else '' end
    )
  );

  return jsonb_build_object(
    'updated_count', v_updated,
    'listing_id',    v_report.listing_id,
    'status',        v_status
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Cập nhật admin_stats() và admin_list_audit_logs()
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
    'active_listings_count', (select count(*) from public.listings where status::text = 'active'),
    'open_reports_count',    (select count(*) from public.listing_reports where status = 'open')
  );

  return v_result;
end;
$$;

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
      or (v_cat = 'listings' and (al.action like 'REVIEW_LISTING_%' or al.action in ('UPDATE_LISTING_PRICE', 'REMOVE_LISTING', 'DELETE_LISTING', 'RESTORE_LISTING', 'RESOLVE_LISTING_REPORT')))
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
-- 7. Phân quyền thực thi
-- ---------------------------------------------------------------------
revoke all on function public.trg_listings_saved_price_drop_fn()                        from public, anon, authenticated;
revoke all on function public.get_public_seller_profile(uuid)                            from public, anon, authenticated;
revoke all on function public.toggle_saved_listing(uuid)                                 from public, anon, authenticated;
revoke all on function public.get_my_saved_listings()                                    from public, anon, authenticated;
revoke all on function public.submit_listing_report(uuid, text, text)                    from public, anon, authenticated;
revoke all on function public.admin_list_listing_reports(text, integer, integer)         from public, anon, authenticated;
revoke all on function public.admin_resolve_listing_report(uuid, text, text, boolean)    from public, anon, authenticated;
revoke all on function public.admin_stats()                                              from public, anon, authenticated;
revoke all on function public.admin_list_audit_logs(text, text, integer, integer)        from public, anon, authenticated;

grant execute on function public.get_public_seller_profile(uuid)                         to anon, authenticated;
grant execute on function public.toggle_saved_listing(uuid)                              to authenticated;
grant execute on function public.get_my_saved_listings()                                 to authenticated;
grant execute on function public.submit_listing_report(uuid, text, text)                 to authenticated;
grant execute on function public.admin_list_listing_reports(text, integer, integer)      to authenticated;
grant execute on function public.admin_resolve_listing_report(uuid, text, text, boolean) to authenticated;
grant execute on function public.admin_stats()                                           to authenticated;
grant execute on function public.admin_list_audit_logs(text, text, integer, integer)     to authenticated;
