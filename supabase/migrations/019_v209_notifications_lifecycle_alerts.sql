-- =====================================================================
--  PATCH 019 — VAHA Market v2.0.9:
--    1. Vòng đời tin đăng: bumped_at, bump_count, expires_at (45 ngày),
--       bump_listing (cooldown 3 ngày), renew_expired_listing, expire_stale_listings
--    2. Hộp chuông thông báo lưu trong DB (user_notifications + triggers + Realtime)
--    3. Theo dõi từ khóa / Săn kèo (saved_searches + tự khớp khi tin được duyệt)
--  Chạy 1 lần trên SQL Editor (100% idempotent). Cần chạy SAU schema.sql và 002 -> 018.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Mở rộng public.listings cho vòng đời tin đăng
-- ---------------------------------------------------------------------
alter table public.listings
  add column if not exists bumped_at timestamptz not null default now();

alter table public.listings
  add column if not exists bump_count integer not null default 0 check (bump_count >= 0);

alter table public.listings
  add column if not exists expires_at timestamptz;

alter table public.listings
  add column if not exists expired_at timestamptz;

-- Backfill cho các tin đã có (đảm bảo approved_at hợp lệ cho tin đang active)
update public.listings
   set approved_at = coalesce(approved_at, created_at),
       bumped_at   = coalesce(approved_at, created_at),
       expires_at  = coalesce(expires_at, coalesce(approved_at, created_at) + interval '45 days'),
       expired_at  = null
 where status::text = 'active'
   and expires_at is null;

create index if not exists idx_listings_active_bumped
  on public.listings (bumped_at desc)
  where status = 'active';

create index if not exists idx_listings_active_expires
  on public.listings (expires_at)
  where status = 'active' and expires_at is not null;

-- Chạy SAU trg_listings_review_guard (tiền tố z_) để đảm bảo chỉ gắn hạn khi status cuối cùng là active
create or replace function public.trg_listings_lifecycle_defaults_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status::text = 'active' and (tg_op = 'INSERT' or old.status::text is distinct from 'active') then
    if tg_op = 'INSERT' or old.status::text in ('pending_review', 'rejected', 'draft') then
      new.bumped_at := now();
    end if;
    if new.expires_at is null or (tg_op = 'UPDATE' and old.expired_at is not null) then
      new.expires_at := now() + interval '45 days';
    end if;
    new.expired_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listings_z_lifecycle_defaults on public.listings;
create trigger trg_listings_z_lifecycle_defaults
  before insert or update of status on public.listings
  for each row execute function public.trg_listings_lifecycle_defaults_fn();

-- ---------------------------------------------------------------------
-- 2. Bảng public.user_notifications
-- ---------------------------------------------------------------------
create table if not exists public.user_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null check (kind in ('ORDER', 'LISTING', 'PRICE_DROP', 'REVIEW', 'OFFER', 'SAVED_SEARCH', 'SYSTEM')),
  title      text not null check (char_length(btrim(title)) between 1 and 140),
  body       text not null default '' check (char_length(body) <= 500),
  href       text check (href is null or (left(href, 1) = '/' and char_length(href) <= 240)),
  dedupe_key text,
  is_read    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_notifications_user_created
  on public.user_notifications (user_id, created_at desc);

create index if not exists idx_user_notifications_user_unread
  on public.user_notifications (user_id, created_at desc)
  where not is_read;

create unique index if not exists uq_user_notifications_dedupe
  on public.user_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

alter table public.user_notifications enable row level security;
revoke all on table public.user_notifications from public, anon, authenticated;
grant select on table public.user_notifications to authenticated;

drop policy if exists "user_notifications_select_own" on public.user_notifications;
create policy "user_notifications_select_own" on public.user_notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications'
  ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Bảng public.saved_searches (Theo dõi từ khóa / Săn kèo)
-- ---------------------------------------------------------------------
create table if not exists public.saved_searches (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,
  keyword            text not null check (char_length(btrim(keyword)) between 2 and 60),
  normalized_keyword text not null check (char_length(btrim(normalized_keyword)) between 2 and 60),
  category           text,
  province           text,
  max_price          bigint check (max_price is null or max_price between 10000 and 1000000000),
  is_active          boolean not null default true,
  match_count        integer not null default 0 check (match_count >= 0),
  last_matched_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_saved_searches_user_created
  on public.saved_searches (user_id, created_at desc);

create index if not exists idx_saved_searches_active
  on public.saved_searches (is_active)
  where is_active = true;

drop trigger if exists trg_saved_searches_updated_at on public.saved_searches;
create trigger trg_saved_searches_updated_at
  before update on public.saved_searches
  for each row execute function public.set_updated_at();

alter table public.saved_searches enable row level security;
revoke all on table public.saved_searches from public, anon, authenticated;
grant select on table public.saved_searches to authenticated;

drop policy if exists "saved_searches_select_own" on public.saved_searches;
create policy "saved_searches_select_own" on public.saved_searches
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 4. Helper nội bộ & 5 Trigger tự động ghi thông báo DB
-- ---------------------------------------------------------------------
create or replace function public.push_user_notification(
  p_user_id    uuid,
  p_kind       text,
  p_title      text,
  p_body       text default '',
  p_href       text default null,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.user_notifications (
    user_id, kind, title, body, href, dedupe_key
  ) values (
    p_user_id,
    p_kind,
    left(btrim(p_title), 140),
    left(coalesce(btrim(p_body), ''), 500),
    case when p_href is not null and left(p_href, 1) = '/' then left(p_href, 240) else null end,
    nullif(btrim(coalesce(p_dedupe_key, '')), '')
  )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.trg_orders_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := coalesce(new.listing_snapshot->>'title', new.payment_code, 'Đơn hàng');
  v_href  text := '/orders/' || new.id::text;
begin
  if new.status::text is not distinct from old.status::text then
    return null;
  end if;

  if new.status::text = 'PAID_HELD' then
    perform public.push_user_notification(
      new.seller_id,
      'ORDER',
      'Đơn hàng mới đã thanh toán',
      format('Đơn "%s" (%s) đã được giữ tiền. Hãy quay video đóng gói 6 mặt và gửi hàng.', v_title, new.payment_code),
      v_href,
      'order-paid-' || new.id::text
    );
  elsif new.status::text = 'SHIPPED' then
    perform public.push_user_notification(
      new.buyer_id,
      'ORDER',
      'Đơn hàng đang được giao',
      format('"%s" đã được gửi đi%s. Nhớ quay video mở hộp đủ 6 mặt.',
        v_title,
        case when coalesce(new.carrier, '') <> '' and coalesce(new.tracking_code, '') <> ''
          then format(' (%s: %s)', new.carrier, new.tracking_code)
          else ''
        end
      ),
      v_href,
      'order-shipped-' || new.id::text
    );
  elsif new.status::text = 'COMPLETED' then
    perform public.push_user_notification(
      new.seller_id,
      'ORDER',
      'Người mua đã xác nhận nhận hàng',
      format('Đơn "%s" đã hoàn tất và chờ giải ngân. Bạn có thể gửi đánh giá đối tác.', v_title),
      v_href,
      'order-completed-seller-' || new.id::text
    );
    perform public.push_user_notification(
      new.buyer_id,
      'ORDER',
      'Đơn hàng đã hoàn tất',
      format('Đơn "%s" đã hoàn tất. Bạn có thể đánh giá người bán trong chi tiết đơn.', v_title),
      v_href,
      'order-completed-buyer-' || new.id::text
    );
  elsif new.status::text = 'PAID_OUT' then
    perform public.push_user_notification(
      new.seller_id,
      'ORDER',
      'Đã giải ngân thành công',
      format('Tiền đơn "%s" (%s đ) đã được chuyển về tài khoản của bạn.',
        v_title, trim(to_char(new.seller_payout, 'FM999G999G999G990'))),
      v_href,
      'order-paidout-' || new.id::text
    );
  elsif new.status::text = 'DISPUTED' then
    perform public.push_user_notification(
      new.seller_id,
      'ORDER',
      'Đơn hàng đang có khiếu nại',
      format('Người mua đã mở khiếu nại cho đơn "%s" (%s). Vui lòng theo dõi chi tiết đơn.', v_title, new.payment_code),
      v_href,
      'order-disputed-' || new.id::text
    );
  elsif new.status::text = 'REFUNDED' then
    perform public.push_user_notification(
      new.buyer_id,
      'ORDER',
      'Đơn hàng đã chuyển sang hoàn tiền',
      format('Đơn "%s" (%s) đã được hủy hoặc xử lý hoàn tiền.', v_title, new.payment_code),
      v_href,
      'order-refunded-buyer-' || new.id::text
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_orders_notify on public.orders;
create trigger trg_orders_notify
  after update of status on public.orders
  for each row execute function public.trg_orders_notify_fn();

create or replace function public.trg_listings_notify_and_match_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_search_text text := coalesce(
    nullif(new.search_text, ''),
    lower(
      extensions.unaccent(
        concat_ws(
          ' ',
          coalesce(new.title, ''),
          coalesce(new.brand, ''),
          coalesce(new.description, ''),
          coalesce(new.province, '')
        )
      )
    )
  );
  v_matched_rec record;
begin
  if new.status::text is not distinct from old.status::text then
    return null;
  end if;

  if old.status::text = 'pending_review' and new.status::text = 'active' then
    perform public.push_user_notification(
      new.seller_id,
      'LISTING',
      'Tin đăng đã được duyệt',
      format('"%s" đã hiển thị công khai trên VAHA Market.', new.title),
      '/listing/' || new.id::text,
      'listing-approved-' || new.id::text || '-' || extract(epoch from now())::bigint::text
    );

    -- Khớp từ khóa săn kèo cho các thành viên khác
    for v_matched_rec in
      select distinct on (ss.user_id)
        ss.id as search_id,
        ss.user_id,
        ss.keyword
      from public.saved_searches ss
      where ss.is_active = true
        and ss.user_id <> new.seller_id
        and position(ss.normalized_keyword in v_search_text) > 0
        and (ss.category is null or ss.category = new.category)
        and (ss.province is null or ss.province = coalesce(new.province, ''))
        and (ss.max_price is null or new.price <= ss.max_price)
      order by ss.user_id, ss.created_at desc
    loop
      perform public.push_user_notification(
        v_matched_rec.user_id,
        'SAVED_SEARCH',
        format('Có tin mới khớp "%s"', v_matched_rec.keyword),
        format('"%s" — %s đ vừa được duyệt trên sàn.', new.title, trim(to_char(new.price, 'FM999G999G999G990'))),
        '/listing/' || new.id::text,
        'saved-search-' || v_matched_rec.search_id::text || '-' || new.id::text
      );

      update public.saved_searches
         set match_count     = match_count + 1,
             last_matched_at = now()
       where id = v_matched_rec.search_id;
    end loop;

  elsif new.status::text = 'rejected' then
    perform public.push_user_notification(
      new.seller_id,
      'LISTING',
      'Tin đăng cần chỉnh sửa',
      format('"%s" chưa được duyệt.%s',
        new.title,
        case when coalesce(new.rejection_reason, '') <> '' then ' Lý do: ' || new.rejection_reason else '' end
      ),
      '/my-listings',
      'listing-rejected-' || new.id::text || '-' || extract(epoch from now())::bigint::text
    );
  elsif new.status::text = 'removed' then
    perform public.push_user_notification(
      new.seller_id,
      'LISTING',
      'Tin đăng đã bị gỡ',
      format('"%s" đã bị gỡ khỏi sàn.%s',
        new.title,
        case when coalesce(new.moderation_note, '') <> '' then ' Lý do: ' || new.moderation_note else '' end
      ),
      '/my-listings',
      'listing-removed-' || new.id::text
    );
  elsif new.status::text = 'hidden' and new.expired_at is not null and old.expired_at is null then
    perform public.push_user_notification(
      new.seller_id,
      'LISTING',
      'Tin đăng đã hết hạn hiển thị 45 ngày',
      format('"%s" vừa tự động chuyển sang Đang ẩn sau 45 ngày. Bạn có thể gia hạn mở bán lại trong Tin của tôi.', new.title),
      '/my-listings',
      'listing-expired-' || new.id::text || '-' || to_char(new.expired_at, 'YYYYMMDD')
    );
  end if;

  return null;
end;
$$;

drop trigger if exists trg_listings_notify_and_match on public.listings;
create trigger trg_listings_notify_and_match
  after update of status on public.listings
  for each row execute function public.trg_listings_notify_and_match_fn();

create or replace function public.trg_saved_listings_notify_drop_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
begin
  if new.latest_price < old.latest_price then
    select l.title into v_title from public.listings l where l.id = new.listing_id;
    perform public.push_user_notification(
      new.user_id,
      'PRICE_DROP',
      'Tin đã lưu vừa giảm giá',
      format('"%s" giảm từ %s đ xuống còn %s đ.',
        coalesce(v_title, 'Sản phẩm'),
        trim(to_char(old.latest_price, 'FM999G999G999G990')),
        trim(to_char(new.latest_price, 'FM999G999G999G990'))
      ),
      '/listing/' || new.listing_id::text,
      'price-drop-' || new.listing_id::text || '-' || new.latest_price::text
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_saved_listings_notify_drop on public.saved_listings;
create trigger trg_saved_listings_notify_drop
  after update of latest_price on public.saved_listings
  for each row execute function public.trg_saved_listings_notify_drop_fn();

create or replace function public.trg_order_reviews_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reviewer_name text;
  v_reviewee_name text;
begin
  if tg_op = 'INSERT' then
    select display_name into v_reviewer_name from public.profiles where id = new.reviewer_id;
    perform public.push_user_notification(
      new.reviewee_id,
      'REVIEW',
      'Bạn nhận được đánh giá mới',
      format('%s đã đánh giá bạn %s/5 sao cho một giao dịch hoàn tất.', coalesce(v_reviewer_name, 'Đối tác'), new.rating),
      '/orders/' || new.order_id::text,
      'review-new-' || new.id::text
    );
  elsif tg_op = 'UPDATE' and new.reply_text is not null and old.reply_text is null then
    select display_name into v_reviewee_name from public.profiles where id = new.reviewee_id;
    perform public.push_user_notification(
      new.reviewer_id,
      'REVIEW',
      'Đánh giá của bạn có phản hồi mới',
      format('%s đã phản hồi lại đánh giá của bạn.', coalesce(v_reviewee_name, 'Đối tác')),
      '/orders/' || new.order_id::text,
      'review-reply-' || new.id::text
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_order_reviews_notify on public.order_reviews;
create trigger trg_order_reviews_notify
  after insert or update of reply_text on public.order_reviews
  for each row execute function public.trg_order_reviews_notify_fn();

create or replace function public.trg_price_offers_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_id   uuid;
  v_proposer    text;
  v_responder   text;
  v_title       text;
  v_price_text  text := trim(to_char(new.offered_price, 'FM999G999G999G990')) || ' đ';
begin
  select title into v_title from public.listings where id = new.listing_id;

  if tg_op = 'INSERT' then
    v_target_id := case when new.proposer_id = new.buyer_id then new.seller_id else new.buyer_id end;
    select display_name into v_proposer from public.profiles where id = new.proposer_id;
    perform public.push_user_notification(
      v_target_id,
      'OFFER',
      'Có đề nghị trả giá mới',
      format('%s đề nghị giá %s cho "%s".', coalesce(v_proposer, 'Thành viên'), v_price_text, coalesce(v_title, 'sản phẩm')),
      '/messages/' || new.conversation_id::text,
      'offer-new-' || new.id::text
    );
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    v_responder := case when new.proposer_id = new.buyer_id then 'Người bán' else 'Người mua' end;
    if new.status = 'ACCEPTED' then
      perform public.push_user_notification(
        new.proposer_id,
        'OFFER',
        'Đề nghị giá đã được chấp nhận',
        format('%s đã đồng ý mức giá %s cho "%s" (hiệu lực 24 giờ).', v_responder, v_price_text, coalesce(v_title, 'sản phẩm')),
        '/messages/' || new.conversation_id::text,
        'offer-accepted-' || new.id::text
      );
    elsif new.status = 'DECLINED' then
      perform public.push_user_notification(
        new.proposer_id,
        'OFFER',
        'Đề nghị giá bị từ chối',
        format('%s chưa đồng ý mức giá %s cho "%s".', v_responder, v_price_text, coalesce(v_title, 'sản phẩm')),
        '/messages/' || new.conversation_id::text,
        'offer-declined-' || new.id::text
      );
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_price_offers_notify on public.price_offers;
create trigger trg_price_offers_notify
  after insert or update of status on public.price_offers
  for each row execute function public.trg_price_offers_notify_fn();

-- ---------------------------------------------------------------------
-- 5. RPC Hộp chuông thông báo (user_notifications)
-- ---------------------------------------------------------------------
create or replace function public.list_my_notifications(
  p_limit       integer default 30,
  p_offset      integer default 0,
  p_only_unread boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_limit  integer := greatest(1, least(coalesce(p_limit, 30), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
  v_unread integer := 0;
  v_total  integer := 0;
  v_items  jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select count(*)::integer into v_unread
    from public.user_notifications
   where user_id = v_uid and not is_read;

  select count(*)::integer into v_total
    from public.user_notifications
   where user_id = v_uid
     and (not coalesce(p_only_unread, false) or not is_read);

  select coalesce(
    jsonb_agg(to_jsonb(sub) order by sub.created_at desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select id, user_id, kind, title, body, href, is_read, read_at, created_at
      from public.user_notifications
     where user_id = v_uid
       and (not coalesce(p_only_unread, false) or not is_read)
     order by created_at desc
     limit v_limit offset v_offset
  ) sub;

  return jsonb_build_object(
    'unread_count', v_unread,
    'total',        v_total,
    'items',        v_items
  );
end;
$$;

create or replace function public.mark_notifications_read(p_notification_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_unread integer := 0;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  if p_notification_id is null then
    update public.user_notifications
       set is_read = true,
           read_at = now()
     where user_id = v_uid
       and not is_read;
  else
    update public.user_notifications
       set is_read = true,
           read_at = now()
     where id = p_notification_id
       and user_id = v_uid
       and not is_read;
  end if;

  select count(*)::integer into v_unread
    from public.user_notifications
   where user_id = v_uid and not is_read;

  return v_unread;
end;
$$;

-- ---------------------------------------------------------------------
-- 6. RPC Vòng đời tin đăng (Đẩy tin 3 ngày/lần, Gia hạn tin 45 ngày, Cron)
-- ---------------------------------------------------------------------
create or replace function public.bump_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_listing public.listings%rowtype;
  v_banned  boolean := false;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_banned from public.profiles where id = v_uid;
  if v_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Không tìm thấy tin đăng.' using errcode = 'P0002';
  end if;

  if v_listing.seller_id <> v_uid then
    raise exception 'Bạn không phải chủ tin đăng này.' using errcode = '42501';
  end if;

  if v_listing.status::text <> 'active' then
    raise exception 'Chỉ có thể làm mới tin đang mở bán.' using errcode = 'P0001';
  end if;

  if v_listing.bumped_at > now() - interval '3 days' then
    raise exception 'Mỗi tin đăng chỉ được làm mới tối đa 3 ngày một lần.' using errcode = 'P0001';
  end if;

  update public.listings
     set bumped_at  = now(),
         bump_count = bump_count + 1,
         expires_at = now() + interval '45 days',
         expired_at = null
   where id = p_listing_id
   returning * into v_listing;

  return v_listing;
end;
$$;

create or replace function public.renew_expired_listing(p_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_listing public.listings%rowtype;
  v_banned  boolean := false;
  v_missing text[];
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_banned from public.profiles where id = v_uid;
  if v_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Không tìm thấy tin đăng.' using errcode = 'P0002';
  end if;

  if v_listing.seller_id <> v_uid then
    raise exception 'Bạn không phải chủ tin đăng này.' using errcode = '42501';
  end if;

  if v_listing.status::text <> 'hidden' or v_listing.expired_at is null then
    raise exception 'Chỉ có thể gia hạn các tin đã tự ẩn do hết hạn 45 ngày.' using errcode = 'P0001';
  end if;

  if v_listing.approved_at is null then
    raise exception 'Tin đăng chưa từng được duyệt trước đây.' using errcode = 'P0001';
  end if;

  if v_listing.bank_account_id is null then
    raise exception 'Vui lòng chỉnh sửa tin và chọn tài khoản ngân hàng nhận tiền trước khi mở bán lại.' using errcode = 'P0001';
  end if;

  v_missing := public.listing_seller_missing(v_uid);
  if cardinality(v_missing) > 0 then
    raise exception 'Hồ sơ người bán chưa đủ: thiếu %.', array_to_string(v_missing, ', ') using errcode = 'P0001';
  end if;

  update public.listings
     set status     = 'active',
         bumped_at  = now(),
         bump_count = bump_count + 1,
         expires_at = now() + interval '45 days',
         expired_at = null
   where id = p_listing_id
   returning * into v_listing;

  return v_listing;
end;
$$;

-- Hàm dành riêng cho pg_cron (hoặc service_role) để ẩn tin quá hạn 45 ngày
create or replace function public.expire_stale_listings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  update public.listings
     set status     = 'hidden',
         expired_at = now()
   where status::text = 'active'
     and expires_at is not null
     and expires_at <= now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Gợi ý lịch pg_cron (chạy 1 lần ở SQL Editor nếu muốn tự động chạy lúc 02:00 UTC hàng ngày):
-- select cron.schedule('vaha-expire-stale-listings', '0 2 * * *', $$select public.expire_stale_listings();$$);

-- ---------------------------------------------------------------------
-- 7. RPC Theo dõi từ khóa / Săn kèo (saved_searches)
-- ---------------------------------------------------------------------
create or replace function public.list_my_saved_searches()
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

  return coalesce(
    (
      select jsonb_agg(to_jsonb(ss) order by ss.created_at desc)
        from public.saved_searches ss
       where ss.user_id = v_uid
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.create_saved_search(
  p_keyword   text,
  p_category  text default null,
  p_province  text default null,
  p_max_price bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_banned   boolean := false;
  v_kw       text := btrim(coalesce(p_keyword, ''));
  v_norm     text;
  v_cat      text := nullif(btrim(coalesce(p_category, '')), '');
  v_prov     text := nullif(btrim(coalesce(p_province, '')), '');
  v_max      bigint := case when p_max_price is not null and p_max_price > 0 then p_max_price else null end;
  v_count    integer := 0;
  v_existing public.saved_searches%rowtype;
  v_row      public.saved_searches%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để theo dõi từ khóa.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_banned from public.profiles where id = v_uid;
  if v_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  if char_length(v_kw) < 2 or char_length(v_kw) > 60 then
    raise exception 'Từ khóa theo dõi cần từ 2 đến 60 ký tự.' using errcode = '22023';
  end if;

  if v_max is not null and (v_max < 10000 or v_max > 1000000000) then
    raise exception 'Giá tối đa không hợp lệ (10.000đ – 1 tỷ đồng).' using errcode = '22023';
  end if;

  v_norm := btrim(extensions.unaccent(lower(regexp_replace(v_kw, '\s+', ' ', 'g'))));
  if char_length(v_norm) < 2 then
    raise exception 'Từ khóa không hợp lệ.' using errcode = '22023';
  end if;

  select * into v_existing
    from public.saved_searches
   where user_id = v_uid
     and normalized_keyword = v_norm
     and category is not distinct from v_cat
     and province is not distinct from v_prov
     and max_price is not distinct from v_max
   limit 1;

  if found then
    if not v_existing.is_active then
      update public.saved_searches
         set is_active = true,
             keyword   = v_kw
       where id = v_existing.id
       returning * into v_row;
      return to_jsonb(v_row);
    end if;
    return to_jsonb(v_existing);
  end if;

  select count(*)::integer into v_count
    from public.saved_searches
   where user_id = v_uid;
  if v_count >= 15 then
    raise exception 'Mỗi tài khoản theo dõi tối đa 15 từ khóa. Hãy xóa bớt từ khóa cũ.' using errcode = 'P0001';
  end if;

  insert into public.saved_searches (
    user_id, keyword, normalized_keyword, category, province, max_price
  ) values (
    v_uid, v_kw, v_norm, v_cat, v_prov, v_max
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.toggle_saved_search(
  p_id     uuid,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.saved_searches%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  update public.saved_searches
     set is_active = coalesce(p_active, false)
   where id = p_id
     and user_id = v_uid
   returning * into v_row;

  if not found then
    raise exception 'Không tìm thấy từ khóa theo dõi.' using errcode = 'P0002';
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.delete_saved_search(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  delete from public.saved_searches
   where id = p_id
     and user_id = v_uid;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. Phân quyền thực thi (KHÔNG cấp cho anon / trigger helpers / pg_cron)
-- ---------------------------------------------------------------------
revoke all on function public.trg_listings_lifecycle_defaults_fn()        from public, anon, authenticated;
revoke all on function public.push_user_notification(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.trg_orders_notify_fn()                     from public, anon, authenticated;
revoke all on function public.trg_listings_notify_and_match_fn()         from public, anon, authenticated;
revoke all on function public.trg_saved_listings_notify_drop_fn()        from public, anon, authenticated;
revoke all on function public.trg_order_reviews_notify_fn()              from public, anon, authenticated;
revoke all on function public.trg_price_offers_notify_fn()               from public, anon, authenticated;
revoke all on function public.expire_stale_listings()                    from public, anon, authenticated;

revoke all on function public.list_my_notifications(integer, integer, boolean) from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid)                    from public, anon, authenticated;
revoke all on function public.bump_listing(uuid)                               from public, anon, authenticated;
revoke all on function public.renew_expired_listing(uuid)                      from public, anon, authenticated;
revoke all on function public.list_my_saved_searches()                         from public, anon, authenticated;
revoke all on function public.create_saved_search(text, text, text, bigint)    from public, anon, authenticated;
revoke all on function public.toggle_saved_search(uuid, boolean)               from public, anon, authenticated;
revoke all on function public.delete_saved_search(uuid)                        from public, anon, authenticated;

grant execute on function public.list_my_notifications(integer, integer, boolean) to authenticated;
grant execute on function public.mark_notifications_read(uuid)                    to authenticated;
grant execute on function public.bump_listing(uuid)                               to authenticated;
grant execute on function public.renew_expired_listing(uuid)                      to authenticated;
grant execute on function public.list_my_saved_searches()                         to authenticated;
grant execute on function public.create_saved_search(text, text, text, bigint)    to authenticated;
grant execute on function public.toggle_saved_search(uuid, boolean)               to authenticated;
grant execute on function public.delete_saved_search(uuid)                        to authenticated;
