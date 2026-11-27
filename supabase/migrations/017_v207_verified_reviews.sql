-- =====================================================================
--  PATCH 017 — VAHA Market v2.0.7:
--    Hệ thống Đánh giá Xác thực sau giao dịch (Verified Reviews)
--      1. Bảng public.order_reviews (mỗi bên 1 đánh giá / đơn hoàn tất)
--      2. Cột cache uy tín người bán trên public.profiles + trigger đồng bộ
--      3. RPC người dùng: submit_order_review, reply_order_review,
--         get_order_reviews, get_my_pending_review_orders
--      4. RPC công khai: get_user_reviews, cập nhật get_public_seller_profile
--      5. RPC quản trị: admin_list_reviews, admin_set_review_visibility,
--         cập nhật admin_stats & admin_list_audit_logs
--  Chạy 1 lần trên SQL Editor (100% idempotent). Cần chạy SAU schema.sql và 002 -> 016.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cột cache đánh giá người bán trên public.profiles
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists seller_rating_avg numeric(3,2) not null default 0;

alter table public.profiles
  add column if not exists seller_rating_count integer not null default 0;

-- ---------------------------------------------------------------------
-- 2. Bảng public.order_reviews
-- ---------------------------------------------------------------------
create table if not exists public.order_reviews (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  reviewer_id   uuid not null references public.profiles (id) on delete cascade,
  reviewee_id   uuid not null references public.profiles (id) on delete cascade,
  reviewer_role text not null check (reviewer_role in ('BUYER', 'SELLER')),
  rating        smallint not null check (rating between 1 and 5),
  comment       text not null default '' check (char_length(comment) <= 1000),
  tags          text[] not null default '{}',
  reply_text    text check (reply_text is null or char_length(reply_text) <= 500),
  replied_at    timestamptz,
  is_hidden     boolean not null default false,
  hidden_reason text check (hidden_reason is null or char_length(hidden_reason) <= 500),
  hidden_by     uuid references auth.users (id) on delete set null,
  hidden_at     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint uq_order_reviews_order_reviewer unique (order_id, reviewer_id),
  constraint chk_order_reviews_diff_users check (reviewer_id <> reviewee_id)
);

create index if not exists idx_order_reviews_reviewee_visible
  on public.order_reviews (reviewee_id, is_hidden, created_at desc);
create index if not exists idx_order_reviews_order
  on public.order_reviews (order_id);
create index if not exists idx_order_reviews_reviewer
  on public.order_reviews (reviewer_id, created_at desc);

drop trigger if exists trg_order_reviews_updated_at on public.order_reviews;
create trigger trg_order_reviews_updated_at
  before update on public.order_reviews
  for each row execute function public.set_updated_at();

alter table public.order_reviews enable row level security;
revoke all on table public.order_reviews from public, anon, authenticated;
grant select on table public.order_reviews to authenticated;

drop policy if exists "order_reviews_select_visible_or_party_or_admin" on public.order_reviews;
create policy "order_reviews_select_visible_or_party_or_admin" on public.order_reviews
  for select to authenticated
  using (
    not is_hidden
    or reviewer_id = (select auth.uid())
    or reviewee_id = (select auth.uid())
    or public.is_admin()
  );

-- ---------------------------------------------------------------------
-- 3. Đồng bộ cache seller_rating_avg & seller_rating_count trên profiles
-- ---------------------------------------------------------------------
create or replace function public.sync_profile_seller_rating(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_avg   numeric(3,2) := 0;
  v_count integer := 0;
begin
  if p_user_id is null then
    return;
  end if;

  select
    coalesce(round(avg(rating)::numeric, 2), 0)::numeric(3,2),
    count(*)::integer
    into v_avg, v_count
    from public.order_reviews
   where reviewee_id = p_user_id
     and reviewer_role = 'BUYER'
     and not is_hidden;

  update public.profiles
     set seller_rating_avg   = v_avg,
         seller_rating_count = v_count
   where id = p_user_id;
end;
$$;

create or replace function public.trg_order_reviews_sync_rating_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.sync_profile_seller_rating(new.reviewee_id);
  elsif tg_op = 'DELETE' then
    perform public.sync_profile_seller_rating(old.reviewee_id);
  elsif tg_op = 'UPDATE' then
    if old.reviewee_id is distinct from new.reviewee_id then
      perform public.sync_profile_seller_rating(old.reviewee_id);
      perform public.sync_profile_seller_rating(new.reviewee_id);
    elsif old.rating is distinct from new.rating
       or old.is_hidden is distinct from new.is_hidden
       or old.reviewer_role is distinct from new.reviewer_role then
      perform public.sync_profile_seller_rating(new.reviewee_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_order_reviews_sync_rating on public.order_reviews;
create trigger trg_order_reviews_sync_rating
  after insert or update or delete on public.order_reviews
  for each row execute function public.trg_order_reviews_sync_rating_fn();

-- Backfill cache cho dữ liệu sẵn có (idempotent)
update public.profiles p
   set seller_rating_avg = coalesce(agg.avg_rating, 0),
       seller_rating_count = coalesce(agg.cnt, 0)
  from (
    select
      reviewee_id,
      round(avg(rating)::numeric, 2)::numeric(3,2) as avg_rating,
      count(*)::integer as cnt
      from public.order_reviews
     where reviewer_role = 'BUYER'
       and not is_hidden
     group by reviewee_id
  ) agg
 where p.id = agg.reviewee_id;

-- ---------------------------------------------------------------------
-- 4. RPC người dùng: Gửi / sửa đánh giá đơn hàng (trong 7 ngày)
-- ---------------------------------------------------------------------
create or replace function public.submit_order_review(
  p_order_id uuid,
  p_rating   integer,
  p_comment  text default '',
  p_tags     text[] default '{}'
)
returns public.order_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_banned        boolean := false;
  v_order         public.orders%rowtype;
  v_role          text;
  v_reviewee_id   uuid;
  v_comment       text := btrim(coalesce(p_comment, ''));
  v_violation     text;
  v_allowed_tags  text[];
  v_clean_tags    text[];
  v_existing      public.order_reviews%rowtype;
  v_row           public.order_reviews%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để đánh giá.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_banned
    from public.profiles
   where id = v_uid;
  if v_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Điểm đánh giá phải từ 1 đến 5 sao.' using errcode = '22023';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0002';
  end if;

  if v_order.status::text not in ('COMPLETED', 'PAID_OUT') then
    raise exception 'Chỉ có thể đánh giá sau khi đơn hàng đã hoàn tất.' using errcode = 'P0001';
  end if;

  if v_order.buyer_id = v_uid then
    v_role := 'BUYER';
    v_reviewee_id := v_order.seller_id;
    v_allowed_tags := array['dung_mo_ta', 'dong_goi_ky', 'giao_nhanh', 'nhiet_tinh', 'gia_hop_ly'];
  elsif v_order.seller_id = v_uid then
    v_role := 'SELLER';
    v_reviewee_id := v_order.buyer_id;
    v_allowed_tags := array['thanh_toan_nhanh', 'xac_nhan_nhanh', 'lich_su', 'dang_tin_cay'];
  else
    raise exception 'Bạn không phải người mua hoặc người bán trong đơn hàng này.' using errcode = '42501';
  end if;

  if char_length(v_comment) > 1000 then
    raise exception 'Nhận xét tối đa 1.000 ký tự.' using errcode = '22023';
  end if;

  if v_comment <> '' then
    v_violation := public.listing_text_violation(v_comment);
    if v_violation is not null then
      raise exception '%', v_violation using errcode = 'P0001';
    end if;
  end if;

  select coalesce(array_agg(distinct t), '{}'::text[])
    into v_clean_tags
    from unnest(coalesce(p_tags, '{}'::text[])) as t
   where t = any(v_allowed_tags);

  select * into v_existing
    from public.order_reviews
   where order_id = p_order_id
     and reviewer_id = v_uid;

  if found then
    if v_existing.is_hidden then
      raise exception 'Đánh giá này đã bị ẩn bởi quản trị viên nên không thể chỉnh sửa.' using errcode = 'P0001';
    end if;
    if v_existing.created_at < now() - interval '7 days' then
      raise exception 'Đã quá thời hạn 7 ngày để chỉnh sửa đánh giá.' using errcode = 'P0001';
    end if;

    update public.order_reviews
       set rating  = p_rating::smallint,
           comment = v_comment,
           tags    = v_clean_tags
     where id = v_existing.id
     returning * into v_row;
  else
    insert into public.order_reviews (
      order_id, reviewer_id, reviewee_id, reviewer_role, rating, comment, tags
    ) values (
      p_order_id, v_uid, v_reviewee_id, v_role, p_rating::smallint, v_comment, v_clean_tags
    )
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RPC người dùng: Phản hồi đánh giá (chỉ người được đánh giá, trong 7 ngày)
-- ---------------------------------------------------------------------
create or replace function public.reply_order_review(
  p_review_id  uuid,
  p_reply_text text
)
returns public.order_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_banned    boolean := false;
  v_reply     text := btrim(coalesce(p_reply_text, ''));
  v_violation text;
  v_existing  public.order_reviews%rowtype;
  v_row       public.order_reviews%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để phản hồi.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_banned
    from public.profiles
   where id = v_uid;
  if v_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  select * into v_existing
    from public.order_reviews
   where id = p_review_id;
  if not found then
    raise exception 'Không tìm thấy đánh giá.' using errcode = 'P0002';
  end if;

  if v_existing.reviewee_id <> v_uid then
    raise exception 'Chỉ người được đánh giá mới có thể phản hồi.' using errcode = '42501';
  end if;

  if v_existing.is_hidden then
    raise exception 'Đánh giá đã bị ẩn, không thể phản hồi.' using errcode = 'P0001';
  end if;

  if char_length(v_reply) < 2 or char_length(v_reply) > 500 then
    raise exception 'Phản hồi cần từ 2 đến 500 ký tự.' using errcode = '22023';
  end if;

  v_violation := public.listing_text_violation(v_reply);
  if v_violation is not null then
    raise exception '%', v_violation using errcode = 'P0001';
  end if;

  if v_existing.replied_at is not null and v_existing.replied_at < now() - interval '7 days' then
    raise exception 'Đã quá thời hạn 7 ngày để chỉnh sửa phản hồi.' using errcode = 'P0001';
  end if;

  update public.order_reviews
     set reply_text = v_reply,
         replied_at = coalesce(v_existing.replied_at, now())
   where id = p_review_id
   returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RPC người dùng: Xem đánh giá của 1 đơn hàng & đơn chờ đánh giá
-- ---------------------------------------------------------------------
create or replace function public.get_order_reviews(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_is_admin   boolean := public.is_admin();
  v_order      public.orders%rowtype;
  v_my_review  jsonb := null;
  v_other      jsonb := null;
  v_can_review boolean := false;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select * into v_order
    from public.orders
   where id = p_order_id;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0002';
  end if;

  if not v_is_admin and v_order.buyer_id <> v_uid and v_order.seller_id <> v_uid then
    raise exception 'Không có quyền xem đánh giá đơn hàng này.' using errcode = '42501';
  end if;

  v_can_review :=
    v_order.status::text in ('COMPLETED', 'PAID_OUT')
    and (v_order.buyer_id = v_uid or v_order.seller_id = v_uid)
    and not coalesce((select p.is_banned from public.profiles p where p.id = v_uid), false);

  select jsonb_build_object(
    'id',            r.id,
    'order_id',      r.order_id,
    'reviewer_id',   r.reviewer_id,
    'reviewee_id',   r.reviewee_id,
    'reviewer_role', r.reviewer_role,
    'rating',        r.rating,
    'comment',       r.comment,
    'tags',          r.tags,
    'reply_text',    r.reply_text,
    'replied_at',    r.replied_at,
    'is_hidden',     r.is_hidden,
    'hidden_reason', r.hidden_reason,
    'created_at',    r.created_at,
    'updated_at',    r.updated_at,
    'reviewer', jsonb_build_object(
      'id',           rp.id,
      'display_name', rp.display_name,
      'avatar_url',   rp.avatar_url,
      'is_mod',       rp.is_mod
    )
  )
  into v_my_review
  from public.order_reviews r
  join public.profiles rp on rp.id = r.reviewer_id
  where r.order_id = p_order_id
    and r.reviewer_id = v_uid
  limit 1;

  select jsonb_build_object(
    'id',            r.id,
    'order_id',      r.order_id,
    'reviewer_id',   r.reviewer_id,
    'reviewee_id',   r.reviewee_id,
    'reviewer_role', r.reviewer_role,
    'rating',        r.rating,
    'comment',       r.comment,
    'tags',          r.tags,
    'reply_text',    r.reply_text,
    'replied_at',    r.replied_at,
    'is_hidden',     r.is_hidden,
    'hidden_reason', case when v_is_admin then r.hidden_reason else null end,
    'created_at',    r.created_at,
    'updated_at',    r.updated_at,
    'reviewer', jsonb_build_object(
      'id',           rp.id,
      'display_name', rp.display_name,
      'avatar_url',   rp.avatar_url,
      'is_mod',       rp.is_mod
    )
  )
  into v_other
  from public.order_reviews r
  join public.profiles rp on rp.id = r.reviewer_id
  where r.order_id = p_order_id
    and r.reviewer_id <> v_uid
    and (not r.is_hidden or v_is_admin)
  limit 1;

  return jsonb_build_object(
    'can_review',         v_can_review,
    'my_review',          v_my_review,
    'counterpart_review', v_other
  );
end;
$$;

create or replace function public.get_my_pending_review_orders()
returns table (order_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    return;
  end if;

  return query
  select o.id
    from public.orders o
   where o.status::text in ('COMPLETED', 'PAID_OUT')
     and (o.buyer_id = v_uid or o.seller_id = v_uid)
     and not exists (
       select 1
         from public.order_reviews r
        where r.order_id = o.id
          and r.reviewer_id = v_uid
     )
   order by coalesce(o.completed_at, o.updated_at) desc;
end;
$$;

-- ---------------------------------------------------------------------
-- 7. RPC công khai: Danh sách đánh giá & cập nhật hồ sơ công khai người bán
-- ---------------------------------------------------------------------
create or replace function public.get_user_reviews(
  p_user_id uuid,
  p_role    text default 'ALL',
  p_limit   integer default 20,
  p_offset  integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role           text := upper(btrim(coalesce(p_role, 'ALL')));
  v_limit          integer := greatest(1, least(coalesce(p_limit, 20), 50));
  v_offset         integer := greatest(0, coalesce(p_offset, 0));
  v_total_all      integer := 0;
  v_avg_all        numeric(3,2) := 0;
  v_seller_count   integer := 0;
  v_seller_avg     numeric(3,2) := 0;
  v_buyer_count    integer := 0;
  v_buyer_avg      numeric(3,2) := 0;
  v_filtered_total integer := 0;
  v_stars          jsonb;
  v_items          jsonb := '[]'::jsonb;
begin
  if v_role not in ('ALL', 'BUYER', 'SELLER') then
    v_role := 'ALL';
  end if;

  select
    count(*)::integer,
    coalesce(round(avg(rating)::numeric, 2), 0)::numeric(3,2),
    count(*) filter (where reviewer_role = 'BUYER')::integer,
    coalesce(round(avg(rating) filter (where reviewer_role = 'BUYER')::numeric, 2), 0)::numeric(3,2),
    count(*) filter (where reviewer_role = 'SELLER')::integer,
    coalesce(round(avg(rating) filter (where reviewer_role = 'SELLER')::numeric, 2), 0)::numeric(3,2)
    into v_total_all, v_avg_all, v_seller_count, v_seller_avg, v_buyer_count, v_buyer_avg
    from public.order_reviews
   where reviewee_id = p_user_id
     and not is_hidden;

  select jsonb_build_object(
    '5', count(*) filter (where rating = 5),
    '4', count(*) filter (where rating = 4),
    '3', count(*) filter (where rating = 3),
    '2', count(*) filter (where rating = 2),
    '1', count(*) filter (where rating = 1)
  )
  into v_stars
  from public.order_reviews
  where reviewee_id = p_user_id
    and not is_hidden
    and (v_role = 'ALL' or reviewer_role = v_role);

  select count(*)::integer
    into v_filtered_total
    from public.order_reviews
   where reviewee_id = p_user_id
     and not is_hidden
     and (v_role = 'ALL' or reviewer_role = v_role);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',                     r.id,
        'order_id',               r.order_id,
        'reviewer_id',            r.reviewer_id,
        'reviewee_id',            r.reviewee_id,
        'reviewer_role',          r.reviewer_role,
        'rating',                 r.rating,
        'comment',                r.comment,
        'tags',                   r.tags,
        'reply_text',             r.reply_text,
        'replied_at',             r.replied_at,
        'is_hidden',              r.is_hidden,
        'created_at',             r.created_at,
        'updated_at',             r.updated_at,
        'listing_id',             r.listing_id,
        'listing_title_snapshot', r.listing_title_snapshot,
        'reviewer', jsonb_build_object(
          'id',           r.rp_id,
          'display_name', r.rp_display_name,
          'avatar_url',   r.rp_avatar_url,
          'is_mod',       r.rp_is_mod
        )
      )
      order by r.created_at desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      rev.*,
      o.listing_id,
      coalesce(o.listing_snapshot->>'title', 'Sản phẩm trên VAHA Market') as listing_title_snapshot,
      rp.id as rp_id,
      rp.display_name as rp_display_name,
      rp.avatar_url as rp_avatar_url,
      rp.is_mod as rp_is_mod
      from public.order_reviews rev
      join public.orders o on o.id = rev.order_id
      join public.profiles rp on rp.id = rev.reviewer_id
     where rev.reviewee_id = p_user_id
       and not rev.is_hidden
       and (v_role = 'ALL' or rev.reviewer_role = v_role)
     order by rev.created_at desc
     limit v_limit offset v_offset
  ) r;

  return jsonb_build_object(
    'summary', jsonb_build_object(
      'total_count',  v_total_all,
      'avg_rating',   v_avg_all,
      'seller_count', v_seller_count,
      'seller_avg',   v_seller_avg,
      'buyer_count',  v_buyer_count,
      'buyer_avg',    v_buyer_avg,
      'stars',        coalesce(v_stars, '{"5":0,"4":0,"3":0,"2":0,"1":0}'::jsonb)
    ),
    'total_filtered', v_filtered_total,
    'items',          v_items
  );
end;
$$;

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

  v_verified :=
    coalesce(btrim((select c.phone from public.profile_contacts c where c.user_id = p_user_id)), '') <> ''
    and coalesce(btrim(v_profile.facebook_url), '') <> ''
    and exists (select 1 from public.bank_accounts b where b.user_id = p_user_id);

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id',                  v_profile.id,
      'display_name',        v_profile.display_name,
      'avatar_url',          v_profile.avatar_url,
      'bio',                 v_profile.bio,
      'is_mod',              v_profile.is_mod,
      'is_banned',           v_profile.is_banned,
      'sold_count',          v_profile.sold_count,
      'bought_count',        v_profile.bought_count,
      'facebook_url',        v_profile.facebook_url,
      'seller_rating_avg',   v_profile.seller_rating_avg,
      'seller_rating_count', v_profile.seller_rating_count,
      'created_at',          v_profile.created_at
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
-- 8. RPC quản trị: Kiểm duyệt đánh giá & cập nhật admin_stats / audit log
-- ---------------------------------------------------------------------
create or replace function public.admin_list_reviews(
  p_filter text default 'ALL',
  p_search text default '',
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
  v_filter text := upper(btrim(coalesce(p_filter, 'ALL')));
  v_q      text := btrim(coalesce(p_search, ''));
  v_esc    text;
  v_limit  integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_total  bigint := 0;
  v_items  jsonb := '[]'::jsonb;
  v_counts jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  if v_filter not in ('ALL', 'VISIBLE', 'HIDDEN', 'LOW_RATING') then
    v_filter := 'ALL';
  end if;

  v_esc := replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_');

  select jsonb_build_object(
    'all',        count(*),
    'visible',    count(*) filter (where not is_hidden),
    'hidden',     count(*) filter (where is_hidden),
    'low_rating', count(*) filter (where rating <= 2)
  )
  into v_counts
  from public.order_reviews;

  with base as (
    select
      rev.id,
      rev.order_id,
      o.payment_code,
      o.listing_id,
      coalesce(o.listing_snapshot->>'title', 'Sản phẩm trên VAHA Market') as listing_title_snapshot,
      rev.reviewer_id,
      rev.reviewee_id,
      rev.reviewer_role,
      rev.rating,
      rev.comment,
      rev.tags,
      rev.reply_text,
      rev.replied_at,
      rev.is_hidden,
      rev.hidden_reason,
      rev.hidden_by,
      rev.hidden_at,
      rev.created_at,
      rev.updated_at,
      jsonb_build_object(
        'id',           rp.id,
        'display_name', rp.display_name,
        'avatar_url',   rp.avatar_url,
        'is_mod',       rp.is_mod,
        'is_banned',    rp.is_banned
      ) as reviewer,
      jsonb_build_object(
        'id',           ep.id,
        'display_name', ep.display_name,
        'avatar_url',   ep.avatar_url,
        'is_mod',       ep.is_mod,
        'is_banned',    ep.is_banned
      ) as reviewee
    from public.order_reviews rev
    join public.orders o on o.id = rev.order_id
    join public.profiles rp on rp.id = rev.reviewer_id
    join public.profiles ep on ep.id = rev.reviewee_id
    where (
      v_filter = 'ALL'
      or (v_filter = 'VISIBLE'    and not rev.is_hidden)
      or (v_filter = 'HIDDEN'     and rev.is_hidden)
      or (v_filter = 'LOW_RATING' and rev.rating <= 2)
    )
    and (
      v_q = ''
      or rev.comment ilike '%' || v_esc || '%' escape '\'
      or coalesce(rev.reply_text, '') ilike '%' || v_esc || '%' escape '\'
      or rp.display_name ilike '%' || v_esc || '%' escape '\'
      or ep.display_name ilike '%' || v_esc || '%' escape '\'
      or coalesce(o.payment_code, '') ilike '%' || v_esc || '%' escape '\'
      or coalesce(o.listing_snapshot->>'title', '') ilike '%' || v_esc || '%' escape '\'
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

  return jsonb_build_object(
    'total',  v_total,
    'items',  v_items,
    'counts', coalesce(v_counts, '{"all":0,"visible":0,"hidden":0,"low_rating":0}'::jsonb)
  );
end;
$$;

create or replace function public.admin_set_review_visibility(
  p_review_id uuid,
  p_hidden    boolean,
  p_reason    text default null
)
returns public.order_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_reason   text := nullif(btrim(coalesce(p_reason, '')), '');
  v_rev      public.order_reviews%rowtype;
  v_order    public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  if p_hidden and (v_reason is null or char_length(v_reason) < 2) then
    raise exception 'Vui lòng nhập lý do ẩn đánh giá (tối thiểu 2 ký tự).' using errcode = '22023';
  end if;

  select * into v_rev
    from public.order_reviews
   where id = p_review_id;
  if not found then
    raise exception 'Không tìm thấy đánh giá.' using errcode = 'P0002';
  end if;

  select * into v_order
    from public.orders
   where id = v_rev.order_id;

  update public.order_reviews
     set is_hidden     = coalesce(p_hidden, false),
         hidden_reason = case when coalesce(p_hidden, false) then v_reason else null end,
         hidden_by     = case when coalesce(p_hidden, false) then v_admin_id else null end,
         hidden_at     = case when coalesce(p_hidden, false) then now() else null end
   where id = p_review_id
   returning * into v_rev;

  insert into public.admin_audit_log (
    admin_id, action, order_id, listing_id, target_user_id, note
  ) values (
    v_admin_id,
    case when coalesce(p_hidden, false) then 'HIDE_REVIEW' else 'SHOW_REVIEW' end,
    v_rev.order_id,
    v_order.listing_id,
    v_rev.reviewee_id,
    format('Đánh giá %s sao (%s)%s',
      v_rev.rating,
      v_rev.reviewer_role,
      case when v_reason is not null then ' — Lý do: ' || v_reason else '' end
    )
  );

  return v_rev;
end;
$$;

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
    'open_reports_count',    (select count(*) from public.listing_reports where status = 'open'),
    'total_reviews_count',   (select count(*) from public.order_reviews),
    'hidden_reviews_count',  (select count(*) from public.order_reviews where is_hidden = true)
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
      or (v_cat = 'reviews'  and al.action in ('HIDE_REVIEW', 'SHOW_REVIEW'))
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
-- 9. Phân quyền thực thi
-- ---------------------------------------------------------------------
revoke all on function public.sync_profile_seller_rating(uuid)                    from public, anon, authenticated;
revoke all on function public.trg_order_reviews_sync_rating_fn()                 from public, anon, authenticated;
revoke all on function public.submit_order_review(uuid, integer, text, text[])   from public, anon, authenticated;
revoke all on function public.reply_order_review(uuid, text)                     from public, anon, authenticated;
revoke all on function public.get_order_reviews(uuid)                            from public, anon, authenticated;
revoke all on function public.get_my_pending_review_orders()                     from public, anon, authenticated;
revoke all on function public.get_user_reviews(uuid, text, integer, integer)     from public, anon, authenticated;
revoke all on function public.get_public_seller_profile(uuid)                    from public, anon, authenticated;
revoke all on function public.admin_list_reviews(text, text, integer, integer)   from public, anon, authenticated;
revoke all on function public.admin_set_review_visibility(uuid, boolean, text)   from public, anon, authenticated;
revoke all on function public.admin_stats()                                      from public, anon, authenticated;
revoke all on function public.admin_list_audit_logs(text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.submit_order_review(uuid, integer, text, text[])   to authenticated;
grant execute on function public.reply_order_review(uuid, text)                     to authenticated;
grant execute on function public.get_order_reviews(uuid)                            to authenticated;
grant execute on function public.get_my_pending_review_orders()                     to authenticated;
grant execute on function public.get_user_reviews(uuid, text, integer, integer)     to anon, authenticated;
grant execute on function public.get_public_seller_profile(uuid)                    to anon, authenticated;
grant execute on function public.admin_list_reviews(text, text, integer, integer)   to authenticated;
grant execute on function public.admin_set_review_visibility(uuid, boolean, text)   to authenticated;
grant execute on function public.admin_stats()                                      to authenticated;
grant execute on function public.admin_list_audit_logs(text, text, integer, integer) to authenticated;
