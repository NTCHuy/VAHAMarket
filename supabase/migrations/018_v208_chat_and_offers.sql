-- =====================================================================
--  PATCH 018 — VAHA Market v2.0.8:
--    Hệ thống Chat nội bộ (Text-only) & Trả giá (Make an Offer)
--      1. Bảng public.conversations, public.price_offers,
--         public.chat_messages, public.chat_reports & cột orders.offer_id
--      2. Bật RLS & Realtime tối ưu trên conversations + chat_messages
--      3. RPC chat & trả giá cho người dùng (100% kiểm tra auth.uid + chống dẫn dụ)
--      4. Cập nhật public.create_order hỗ trợ đặt mua theo offer đã chốt (p_offer_id)
--      5. RPC quản trị xem hội thoại tranh chấp / báo cáo chat (ghi audit log)
--  Chạy 1 lần trên SQL Editor (100% idempotent). Cần chạy SAU schema.sql và 002 -> 017.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Các bảng mới & cột mở rộng trên public.orders
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  listing_id           uuid not null references public.listings (id) on delete cascade,
  buyer_id             uuid not null references public.profiles (id) on delete cascade,
  seller_id            uuid not null references public.profiles (id) on delete cascade,
  last_message_at      timestamptz not null default now(),
  last_message_preview text not null default '',
  last_sender_id       uuid references public.profiles (id) on delete set null,
  buyer_last_read_at   timestamptz not null default now(),
  seller_last_read_at  timestamptz not null default now(),
  buyer_unread_count   integer not null default 0 check (buyer_unread_count >= 0),
  seller_unread_count  integer not null default 0 check (seller_unread_count >= 0),
  is_blocked           boolean not null default false,
  blocked_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint uq_conversations_listing_buyer unique (listing_id, buyer_id),
  constraint chk_conversations_diff_users check (buyer_id <> seller_id)
);

create index if not exists idx_conversations_buyer_recent
  on public.conversations (buyer_id, last_message_at desc);
create index if not exists idx_conversations_seller_recent
  on public.conversations (seller_id, last_message_at desc);

drop trigger if exists trg_conversations_updated_at on public.conversations;
create trigger trg_conversations_updated_at
  before update on public.conversations
  for each row execute function public.set_updated_at();

create table if not exists public.price_offers (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  listing_id      uuid not null references public.listings (id) on delete cascade,
  buyer_id        uuid not null references public.profiles (id) on delete cascade,
  seller_id       uuid not null references public.profiles (id) on delete cascade,
  proposer_id     uuid not null references public.profiles (id) on delete cascade,
  original_price  bigint not null check (original_price > 0),
  offered_price   bigint not null check (offered_price between 10000 and 1000000000),
  note            text check (note is null or char_length(note) <= 300),
  status          text not null default 'PENDING'
                  check (status in ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'ORDERED')),
  order_id        uuid references public.orders (id) on delete set null,
  expires_at      timestamptz not null,
  responded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_price_offers_conversation_created
  on public.price_offers (conversation_id, created_at desc);
create index if not exists idx_price_offers_listing_status
  on public.price_offers (listing_id, status);

drop trigger if exists trg_price_offers_updated_at on public.price_offers;
create trigger trg_price_offers_updated_at
  before update on public.price_offers
  for each row execute function public.set_updated_at();

create table if not exists public.chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  message_type    text not null default 'TEXT' check (message_type in ('TEXT', 'OFFER', 'SYSTEM')),
  body            text not null check (char_length(body) between 1 and 1000),
  offer_id        uuid references public.price_offers (id) on delete set null,
  order_id        uuid references public.orders (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_chat_messages_conversation_created
  on public.chat_messages (conversation_id, created_at desc);
create index if not exists idx_chat_messages_sender_created
  on public.chat_messages (sender_id, created_at desc);

create table if not exists public.chat_reports (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  reporter_id     uuid not null references public.profiles (id) on delete cascade,
  reason          text not null check (char_length(btrim(reason)) between 5 and 500),
  status          text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolved_by     uuid references auth.users (id) on delete set null,
  resolved_at     timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  created_at      timestamptz not null default now()
);

create unique index if not exists uq_chat_reports_open
  on public.chat_reports (conversation_id, reporter_id)
  where status = 'open';
create index if not exists idx_chat_reports_status_created
  on public.chat_reports (status, created_at desc);

alter table public.orders
  add column if not exists offer_id uuid references public.price_offers (id) on delete set null;

-- ---------------------------------------------------------------------
-- 2. RLS & Supabase Realtime (chỉ SELECT qua policy; mọi ghi đi qua RPC)
-- ---------------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.price_offers  enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reports  enable row level security;

revoke all on table public.conversations from public, anon, authenticated;
revoke all on table public.price_offers  from public, anon, authenticated;
revoke all on table public.chat_messages from public, anon, authenticated;
revoke all on table public.chat_reports  from public, anon, authenticated;

grant select on table public.conversations to authenticated;
grant select on table public.price_offers  to authenticated;
grant select on table public.chat_messages to authenticated;
grant select on table public.chat_reports  to authenticated;

drop policy if exists "conversations_select_party_or_admin" on public.conversations;
create policy "conversations_select_party_or_admin" on public.conversations
  for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or public.is_admin()
  );

drop policy if exists "price_offers_select_party_or_admin" on public.price_offers;
create policy "price_offers_select_party_or_admin" on public.price_offers
  for select to authenticated
  using (
    buyer_id = (select auth.uid())
    or seller_id = (select auth.uid())
    or public.is_admin()
  );

drop policy if exists "chat_messages_select_party_or_admin" on public.chat_messages;
create policy "chat_messages_select_party_or_admin" on public.chat_messages
  for select to authenticated
  using (
    exists (
      select 1 from public.conversations c
       where c.id = chat_messages.conversation_id
         and (
           c.buyer_id = (select auth.uid())
           or c.seller_id = (select auth.uid())
         )
    )
    or public.is_admin()
  );

drop policy if exists "chat_reports_select_own_or_admin" on public.chat_reports;
create policy "chat_reports_select_own_or_admin" on public.chat_reports
  for select to authenticated
  using (
    reporter_id = (select auth.uid())
    or public.is_admin()
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

alter table public.conversations replica identity full;

-- ---------------------------------------------------------------------
-- 3. RPC Chat & Trả giá dành cho thành viên đã đăng nhập
-- ---------------------------------------------------------------------
create or replace function public.start_or_get_conversation(
  p_listing_id uuid,
  p_buyer_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_listing       public.listings%rowtype;
  v_buyer_id      uuid;
  v_seller_id     uuid;
  v_counterpart   uuid;
  v_conv_id       uuid;
  v_caller_banned boolean := false;
  v_other_banned  boolean := false;
  v_existing_id   uuid;
  v_has_order     boolean := false;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để nhắn tin.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_caller_banned
    from public.profiles where id = v_uid;
  if v_caller_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  select * into v_listing
    from public.listings
   where id = p_listing_id;
  if not found then
    raise exception 'Không tìm thấy tin đăng.' using errcode = 'P0002';
  end if;

  v_seller_id := v_listing.seller_id;

  if v_uid = v_seller_id then
    if p_buyer_id is null or p_buyer_id = v_seller_id then
      raise exception 'Không thể tự nhắn tin cho chính mình.' using errcode = 'P0001';
    end if;
    v_buyer_id := p_buyer_id;
    v_counterpart := v_buyer_id;

    select id into v_existing_id
      from public.conversations
     where listing_id = p_listing_id and buyer_id = v_buyer_id;

    select exists (
      select 1 from public.orders
       where listing_id = p_listing_id
         and buyer_id = v_buyer_id
         and seller_id = v_seller_id
    ) into v_has_order;

    if v_existing_id is null and not v_has_order then
      raise exception 'Chưa có giao dịch hoặc hội thoại với người mua này.' using errcode = '42501';
    end if;
  else
    v_buyer_id := v_uid;
    v_counterpart := v_seller_id;

    select id into v_existing_id
      from public.conversations
     where listing_id = p_listing_id and buyer_id = v_buyer_id;

    if v_existing_id is null and v_listing.status::text <> 'active' then
      raise exception 'Sản phẩm hiện không còn mở bán.' using errcode = 'P0001';
    end if;
  end if;

  select coalesce(is_banned, false) into v_other_banned
    from public.profiles where id = v_counterpart;
  if not found then
    raise exception 'Không tìm thấy tài khoản đối tác.' using errcode = 'P0002';
  end if;
  if v_other_banned and v_existing_id is null then
    raise exception 'Tài khoản đối tác hiện đã bị khóa.' using errcode = 'P0001';
  end if;

  if v_existing_id is not null then
    return jsonb_build_object('conversation_id', v_existing_id);
  end if;

  insert into public.conversations (
    listing_id, buyer_id, seller_id, last_message_at, last_message_preview
  ) values (
    p_listing_id, v_buyer_id, v_seller_id, now(), 'Đã mở cuộc trò chuyện về sản phẩm'
  )
  on conflict (listing_id, buyer_id) do update
    set updated_at = now()
  returning id into v_conv_id;

  return jsonb_build_object('conversation_id', v_conv_id);
end;
$$;

create or replace function public.list_my_conversations(
  p_limit  integer default 40,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_limit        integer := greatest(1, least(coalesce(p_limit, 40), 100));
  v_offset       integer := greatest(0, coalesce(p_offset, 0));
  v_total_unread integer := 0;
  v_items        jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  -- Đồng bộ trạng thái EXPIRED cho các đề nghị giá đã quá hạn
  update public.price_offers
     set status = 'EXPIRED'
   where (buyer_id = v_uid or seller_id = v_uid)
     and status in ('PENDING', 'ACCEPTED')
     and expires_at <= now();

  select coalesce(sum(
    case
      when c.buyer_id = v_uid then c.buyer_unread_count
      else c.seller_unread_count
    end
  ), 0)::integer
  into v_total_unread
  from public.conversations c
  where c.buyer_id = v_uid or c.seller_id = v_uid;

  select coalesce(
    jsonb_agg(to_jsonb(sub) order by sub.last_message_at desc),
    '[]'::jsonb
  )
  into v_items
  from (
    select
      c.id,
      c.listing_id,
      c.buyer_id,
      c.seller_id,
      c.last_message_at,
      c.last_message_preview,
      c.last_sender_id,
      case when c.buyer_id = v_uid then c.buyer_unread_count else c.seller_unread_count end as my_unread_count,
      c.is_blocked,
      c.blocked_by,
      c.created_at,
      jsonb_build_object(
        'id',        l.id,
        'title',     l.title,
        'price',     l.price,
        'status',    l.status,
        'ship_cod',  l.ship_cod,
        'fee_payer', l.fee_payer,
        'image',     l.images -> 0 ->> 'url'
      ) as listing,
      jsonb_build_object(
        'id',                  cp.id,
        'display_name',        cp.display_name,
        'avatar_url',          cp.avatar_url,
        'is_mod',              cp.is_mod,
        'is_banned',           cp.is_banned,
        'seller_rating_avg',   cp.seller_rating_avg,
        'seller_rating_count', cp.seller_rating_count
      ) as counterpart,
      (
        select to_jsonb(po)
          from public.price_offers po
         where po.conversation_id = c.id
           and po.status in ('PENDING', 'ACCEPTED')
           and po.expires_at > now()
         order by po.created_at desc
         limit 1
      ) as active_offer,
      (
        select o.id
          from public.orders o
         where o.listing_id = c.listing_id
           and o.buyer_id = c.buyer_id
           and o.seller_id = c.seller_id
         order by o.created_at desc
         limit 1
      ) as latest_order_id
    from public.conversations c
    join public.listings l on l.id = c.listing_id
    join public.profiles cp on cp.id = case when c.buyer_id = v_uid then c.seller_id else c.buyer_id end
    where c.buyer_id = v_uid or c.seller_id = v_uid
    order by c.last_message_at desc
    limit v_limit offset v_offset
  ) sub;

  return jsonb_build_object(
    'total_unread', v_total_unread,
    'items',        v_items
  );
end;
$$;

create or replace function public.get_conversation_detail(
  p_conversation_id uuid,
  p_limit           integer default 60,
  p_before          timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_limit         integer := greatest(1, least(coalesce(p_limit, 60), 100));
  v_conv          public.conversations%rowtype;
  v_listing       public.listings%rowtype;
  v_seller        public.profiles%rowtype;
  v_counterpart   public.profiles%rowtype;
  v_counterpart_id uuid;
  v_messages      jsonb := '[]'::jsonb;
  v_offers        jsonb := '[]'::jsonb;
  v_active_offer  jsonb := null;
  v_latest_order  jsonb := null;
  v_has_more      boolean := false;
  v_msg_count     integer := 0;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select * into v_conv
    from public.conversations
   where id = p_conversation_id;
  if not found then
    raise exception 'Không tìm thấy cuộc trò chuyện.' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_uid and v_conv.seller_id <> v_uid then
    raise exception 'Bạn không có quyền xem cuộc trò chuyện này.' using errcode = '42501';
  end if;

  -- Cập nhật offer quá hạn trong phòng này
  update public.price_offers
     set status = 'EXPIRED'
   where conversation_id = p_conversation_id
     and status in ('PENDING', 'ACCEPTED')
     and expires_at <= now();

  select * into v_listing from public.listings where id = v_conv.listing_id;
  select * into v_seller  from public.profiles where id = v_conv.seller_id;

  v_counterpart_id := case when v_conv.buyer_id = v_uid then v_conv.seller_id else v_conv.buyer_id end;
  select * into v_counterpart from public.profiles where id = v_counterpart_id;

  select count(*)::integer into v_msg_count
    from public.chat_messages m
   where m.conversation_id = p_conversation_id
     and (p_before is null or m.created_at < p_before);

  v_has_more := v_msg_count > v_limit;

  select coalesce(
    jsonb_agg(to_jsonb(sub) order by sub.created_at asc),
    '[]'::jsonb
  )
  into v_messages
  from (
    select m.*
      from public.chat_messages m
     where m.conversation_id = p_conversation_id
       and (p_before is null or m.created_at < p_before)
     order by m.created_at desc
     limit v_limit
  ) sub;

  select coalesce(
    jsonb_agg(to_jsonb(po) order by po.created_at asc),
    '[]'::jsonb
  )
  into v_offers
  from public.price_offers po
  where po.conversation_id = p_conversation_id;

  select to_jsonb(po) into v_active_offer
    from public.price_offers po
   where po.conversation_id = p_conversation_id
     and po.status in ('PENDING', 'ACCEPTED')
     and po.expires_at > now()
   order by po.created_at desc
   limit 1;

  select jsonb_build_object(
    'id',           o.id,
    'payment_code', o.payment_code,
    'status',       o.status,
    'amount',       o.amount,
    'offer_id',     o.offer_id,
    'created_at',   o.created_at
  )
  into v_latest_order
  from public.orders o
  where o.listing_id = v_conv.listing_id
    and o.buyer_id = v_conv.buyer_id
    and o.seller_id = v_conv.seller_id
  order by o.created_at desc
  limit 1;

  return jsonb_build_object(
    'conversation', to_jsonb(v_conv),
    'listing', jsonb_build_object(
      'id',            v_listing.id,
      'seller_id',     v_listing.seller_id,
      'title',         v_listing.title,
      'price',         v_listing.price,
      'original_price', v_listing.original_price,
      'fee_payer',     v_listing.fee_payer,
      'condition',     v_listing.condition,
      'category',      v_listing.category,
      'province',      v_listing.province,
      'ship_cod',      v_listing.ship_cod,
      'status',        v_listing.status,
      'images',        v_listing.images,
      'seller_is_mod', coalesce(v_seller.is_mod, false)
    ),
    'counterpart', jsonb_build_object(
      'id',                  v_counterpart.id,
      'display_name',        v_counterpart.display_name,
      'avatar_url',          v_counterpart.avatar_url,
      'is_mod',              v_counterpart.is_mod,
      'is_banned',           v_counterpart.is_banned,
      'sold_count',          v_counterpart.sold_count,
      'bought_count',        v_counterpart.bought_count,
      'seller_rating_avg',   v_counterpart.seller_rating_avg,
      'seller_rating_count', v_counterpart.seller_rating_count
    ),
    'messages',     v_messages,
    'offers',       v_offers,
    'active_offer', v_active_offer,
    'latest_order', v_latest_order,
    'has_more',     v_has_more
  );
end;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := (select auth.uid());
  v_conv public.conversations%rowtype;
begin
  if v_uid is null then
    return;
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    return;
  end if;

  if v_conv.buyer_id = v_uid then
    update public.conversations
       set buyer_unread_count = 0,
           buyer_last_read_at = now()
     where id = p_conversation_id;
  elsif v_conv.seller_id = v_uid then
    update public.conversations
       set seller_unread_count = 0,
           seller_last_read_at = now()
     where id = p_conversation_id;
  end if;
end;
$$;

create or replace function public.send_chat_message(
  p_conversation_id uuid,
  p_body            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_conv          public.conversations%rowtype;
  v_body          text := btrim(coalesce(p_body, ''));
  v_violation     text;
  v_recent_count  integer := 0;
  v_other_id      uuid;
  v_caller_banned boolean := false;
  v_other_banned  boolean := false;
  v_msg           public.chat_messages%rowtype;
  v_preview       text;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để gửi tin nhắn.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_caller_banned from public.profiles where id = v_uid;
  if v_caller_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'Không tìm thấy cuộc trò chuyện.' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_uid and v_conv.seller_id <> v_uid then
    raise exception 'Bạn không thuộc cuộc trò chuyện này.' using errcode = '42501';
  end if;

  if v_conv.is_blocked then
    raise exception 'Cuộc trò chuyện đang bị chặn.' using errcode = 'P0001';
  end if;

  v_other_id := case when v_conv.buyer_id = v_uid then v_conv.seller_id else v_conv.buyer_id end;
  select coalesce(is_banned, false) into v_other_banned from public.profiles where id = v_other_id;
  if v_other_banned then
    raise exception 'Tài khoản đối tác đã bị khóa, không thể gửi tin nhắn mới.' using errcode = 'P0001';
  end if;

  if char_length(v_body) < 1 or char_length(v_body) > 1000 then
    raise exception 'Tin nhắn cần từ 1 đến 1.000 ký tự.' using errcode = '22023';
  end if;

  v_violation := public.listing_text_violation(v_body);
  if v_violation is not null then
    raise exception 'Tin nhắn không được chứa % hoặc thông tin dẫn dụ ngoài sàn.', v_violation using errcode = 'P0001';
  end if;

  select count(*)::integer into v_recent_count
    from public.chat_messages
   where sender_id = v_uid
     and message_type in ('TEXT', 'OFFER')
     and created_at >= now() - interval '60 seconds';
  if v_recent_count >= 20 then
    raise exception 'Bạn gửi tin quá nhanh. Vui lòng đợi vài giây rồi thử lại.' using errcode = 'P0001';
  end if;

  insert into public.chat_messages (conversation_id, sender_id, message_type, body)
  values (p_conversation_id, v_uid, 'TEXT', v_body)
  returning * into v_msg;

  v_preview := case when char_length(v_body) > 100 then left(v_body, 97) || '...' else v_body end;

  update public.conversations
     set last_message_at      = v_msg.created_at,
         last_message_preview = v_preview,
         last_sender_id       = v_uid,
         buyer_unread_count   = case when buyer_id = v_uid then 0 else buyer_unread_count + 1 end,
         seller_unread_count  = case when seller_id = v_uid then 0 else seller_unread_count + 1 end,
         buyer_last_read_at   = case when buyer_id = v_uid then v_msg.created_at else buyer_last_read_at end,
         seller_last_read_at  = case when seller_id = v_uid then v_msg.created_at else seller_last_read_at end
   where id = p_conversation_id;

  return to_jsonb(v_msg);
end;
$$;

create or replace function public.create_price_offer(
  p_conversation_id uuid,
  p_offered_price   bigint,
  p_note            text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_conv          public.conversations%rowtype;
  v_listing       public.listings%rowtype;
  v_note          text := nullif(btrim(coalesce(p_note, '')), '');
  v_violation     text;
  v_min_price     bigint;
  v_recent_offers integer := 0;
  v_caller_banned boolean := false;
  v_other_banned  boolean := false;
  v_other_id      uuid;
  v_offer         public.price_offers%rowtype;
  v_msg           public.chat_messages%rowtype;
  v_preview       text;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để trả giá.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_caller_banned from public.profiles where id = v_uid;
  if v_caller_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'Không tìm thấy cuộc trò chuyện.' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_uid and v_conv.seller_id <> v_uid then
    raise exception 'Bạn không thuộc cuộc trò chuyện này.' using errcode = '42501';
  end if;

  if v_conv.is_blocked then
    raise exception 'Cuộc trò chuyện đang bị chặn.' using errcode = 'P0001';
  end if;

  v_other_id := case when v_conv.buyer_id = v_uid then v_conv.seller_id else v_conv.buyer_id end;
  select coalesce(is_banned, false) into v_other_banned from public.profiles where id = v_other_id;
  if v_other_banned then
    raise exception 'Tài khoản đối tác đã bị khóa.' using errcode = 'P0001';
  end if;

  select * into v_listing from public.listings where id = v_conv.listing_id for share;
  if not found or v_listing.status::text <> 'active' then
    raise exception 'Sản phẩm hiện không còn mở bán.' using errcode = 'P0001';
  end if;
  if not v_listing.ship_cod then
    raise exception 'Tin chỉ gặp trực tiếp, không tạo đề nghị trả giá qua trung gian.' using errcode = 'P0001';
  end if;

  v_min_price := greatest(10000::bigint, ceil(v_listing.price * 0.3)::bigint);
  if p_offered_price is null or p_offered_price < v_min_price or p_offered_price >= v_listing.price then
    raise exception 'Giá đề nghị cần từ % đ trở lên và thấp hơn giá niêm yết (% đ).', v_min_price, v_listing.price
      using errcode = '22023';
  end if;

  if v_note is not null then
    if char_length(v_note) > 300 then
      raise exception 'Ghi chú trả giá tối đa 300 ký tự.' using errcode = '22023';
    end if;
    v_violation := public.listing_text_violation(v_note);
    if v_violation is not null then
      raise exception 'Ghi chú không được chứa %.', v_violation using errcode = 'P0001';
    end if;
  end if;

  select count(*)::integer into v_recent_offers
    from public.price_offers
   where conversation_id = p_conversation_id
     and proposer_id = v_uid
     and created_at >= now() - interval '1 hour';
  if v_recent_offers >= 10 then
    raise exception 'Bạn đã gửi tối đa 10 đề nghị giá trong 1 giờ cho cuộc trò chuyện này.' using errcode = 'P0001';
  end if;

  update public.price_offers
     set status = 'CANCELLED'
   where conversation_id = p_conversation_id
     and status in ('PENDING', 'ACCEPTED');

  insert into public.price_offers (
    conversation_id, listing_id, buyer_id, seller_id, proposer_id,
    original_price, offered_price, note, status, expires_at
  ) values (
    p_conversation_id, v_conv.listing_id, v_conv.buyer_id, v_conv.seller_id, v_uid,
    v_listing.price, p_offered_price, v_note, 'PENDING', now() + interval '24 hours'
  )
  returning * into v_offer;

  v_preview := 'Đề nghị giá ' || trim(to_char(p_offered_price, 'FM999G999G999G990')) || ' đ';
  if v_note is not null then
    v_preview := left(v_preview || ' — ' || v_note, 120);
  end if;

  insert into public.chat_messages (conversation_id, sender_id, message_type, body, offer_id)
  values (
    p_conversation_id,
    v_uid,
    'OFFER',
    coalesce(v_note, 'Đã gửi đề nghị giá ' || trim(to_char(p_offered_price, 'FM999G999G999G990')) || ' đ'),
    v_offer.id
  )
  returning * into v_msg;

  update public.conversations
     set last_message_at      = v_msg.created_at,
         last_message_preview = v_preview,
         last_sender_id       = v_uid,
         buyer_unread_count   = case when buyer_id = v_uid then 0 else buyer_unread_count + 1 end,
         seller_unread_count  = case when seller_id = v_uid then 0 else seller_unread_count + 1 end,
         buyer_last_read_at   = case when buyer_id = v_uid then v_msg.created_at else buyer_last_read_at end,
         seller_last_read_at  = case when seller_id = v_uid then v_msg.created_at else seller_last_read_at end
   where id = p_conversation_id;

  return jsonb_build_object('offer', to_jsonb(v_offer), 'message', to_jsonb(v_msg));
end;
$$;

create or replace function public.respond_price_offer(
  p_offer_id uuid,
  p_action   text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_action        text := upper(btrim(coalesce(p_action, '')));
  v_offer         public.price_offers%rowtype;
  v_listing       public.listings%rowtype;
  v_caller_banned boolean := false;
  v_msg           public.chat_messages%rowtype;
  v_sys_text      text;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_caller_banned from public.profiles where id = v_uid;
  if v_caller_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  if v_action not in ('ACCEPT', 'DECLINE', 'CANCEL') then
    raise exception 'Hành động không hợp lệ.' using errcode = '22023';
  end if;

  select * into v_offer from public.price_offers where id = p_offer_id for update;
  if not found then
    raise exception 'Không tìm thấy đề nghị giá.' using errcode = 'P0002';
  end if;

  if v_offer.buyer_id <> v_uid and v_offer.seller_id <> v_uid then
    raise exception 'Bạn không thuộc giao dịch này.' using errcode = '42501';
  end if;

  if v_offer.status in ('PENDING', 'ACCEPTED') and v_offer.expires_at <= now() then
    update public.price_offers set status = 'EXPIRED' where id = p_offer_id;
    raise exception 'Đề nghị giá này đã hết hạn 24 giờ.' using errcode = 'P0001';
  end if;

  if v_action in ('ACCEPT', 'DECLINE') then
    if v_offer.status <> 'PENDING' then
      raise exception 'Chỉ có thể phản hồi đề nghị giá đang chờ.' using errcode = 'P0001';
    end if;
    if v_offer.proposer_id = v_uid then
      raise exception 'Bạn không thể tự phản hồi đề nghị giá do chính mình gửi.' using errcode = '42501';
    end if;

    if v_action = 'ACCEPT' then
      select * into v_listing from public.listings where id = v_offer.listing_id for share;
      if not found or v_listing.status::text <> 'active' or not v_listing.ship_cod then
        raise exception 'Sản phẩm hiện không còn mở bán qua trung gian.' using errcode = 'P0001';
      end if;

      update public.price_offers
         set status       = 'ACCEPTED',
             responded_at = now(),
             expires_at   = now() + interval '24 hours'
       where id = p_offer_id
       returning * into v_offer;

      v_sys_text := 'Đã chấp nhận mức giá ' || trim(to_char(v_offer.offered_price, 'FM999G999G999G990')) || ' đ (hiệu lực 24 giờ).';
    else
      update public.price_offers
         set status       = 'DECLINED',
             responded_at = now()
       where id = p_offer_id
       returning * into v_offer;

      v_sys_text := 'Đã từ chối đề nghị giá ' || trim(to_char(v_offer.offered_price, 'FM999G999G999G990')) || ' đ.';
    end if;
  else
    -- CANCEL: người đề nghị hủy khi PENDING, hoặc một trong hai bên hủy thỏa thuận ACCEPTED trước khi đặt đơn
    if v_offer.status = 'PENDING' and v_offer.proposer_id <> v_uid then
      raise exception 'Chỉ người gửi đề nghị mới có thể hủy đề nghị đang chờ.' using errcode = '42501';
    end if;
    if v_offer.status not in ('PENDING', 'ACCEPTED') then
      raise exception 'Đề nghị giá này không thể hủy.' using errcode = 'P0001';
    end if;

    update public.price_offers
       set status       = 'CANCELLED',
           responded_at = coalesce(responded_at, now())
     where id = p_offer_id
     returning * into v_offer;

    v_sys_text := 'Đã hủy đề nghị giá ' || trim(to_char(v_offer.offered_price, 'FM999G999G999G990')) || ' đ.';
  end if;

  insert into public.chat_messages (conversation_id, sender_id, message_type, body, offer_id)
  values (v_offer.conversation_id, v_uid, 'SYSTEM', v_sys_text, v_offer.id)
  returning * into v_msg;

  update public.conversations
     set last_message_at      = v_msg.created_at,
         last_message_preview = v_sys_text,
         last_sender_id       = v_uid,
         buyer_unread_count   = case when buyer_id = v_uid then 0 else buyer_unread_count + 1 end,
         seller_unread_count  = case when seller_id = v_uid then 0 else seller_unread_count + 1 end,
         buyer_last_read_at   = case when buyer_id = v_uid then v_msg.created_at else buyer_last_read_at end,
         seller_last_read_at  = case when seller_id = v_uid then v_msg.created_at else seller_last_read_at end
   where id = v_offer.conversation_id;

  return jsonb_build_object('offer', to_jsonb(v_offer), 'message', to_jsonb(v_msg));
end;
$$;

create or replace function public.toggle_block_conversation(
  p_conversation_id uuid,
  p_blocked         boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_conv     public.conversations%rowtype;
  v_msg      public.chat_messages%rowtype;
  v_sys_text text;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập.' using errcode = '28000';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'Không tìm thấy cuộc trò chuyện.' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_uid and v_conv.seller_id <> v_uid then
    raise exception 'Bạn không thuộc cuộc trò chuyện này.' using errcode = '42501';
  end if;

  if v_conv.is_blocked and v_conv.blocked_by <> v_uid and not coalesce(p_blocked, false) then
    raise exception 'Chỉ người đã chặn mới có thể bỏ chặn cuộc trò chuyện này.' using errcode = '42501';
  end if;

  if coalesce(p_blocked, false) then
    update public.conversations
       set is_blocked = true,
           blocked_by = v_uid
     where id = p_conversation_id
     returning * into v_conv;
    v_sys_text := 'Một bên đã tạm chặn gửi tin mới trong cuộc trò chuyện này.';
  else
    update public.conversations
       set is_blocked = false,
           blocked_by = null
     where id = p_conversation_id
     returning * into v_conv;
    v_sys_text := 'Đã bỏ chặn cuộc trò chuyện.';
  end if;

  insert into public.chat_messages (conversation_id, sender_id, message_type, body)
  values (p_conversation_id, v_uid, 'SYSTEM', v_sys_text)
  returning * into v_msg;

  update public.conversations
     set last_message_at      = v_msg.created_at,
         last_message_preview = v_sys_text,
         last_sender_id       = v_uid
   where id = p_conversation_id
   returning * into v_conv;

  return jsonb_build_object('conversation', to_jsonb(v_conv), 'message', to_jsonb(v_msg));
end;
$$;

create or replace function public.report_conversation(
  p_conversation_id uuid,
  p_reason          text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid           uuid := (select auth.uid());
  v_reason        text := btrim(coalesce(p_reason, ''));
  v_conv          public.conversations%rowtype;
  v_caller_banned boolean := false;
  v_report        public.chat_reports%rowtype;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để báo cáo.' using errcode = '28000';
  end if;

  select coalesce(is_banned, false) into v_caller_banned from public.profiles where id = v_uid;
  if v_caller_banned then
    raise exception 'Tài khoản của bạn đã bị khóa vĩnh viễn.' using errcode = 'P0001';
  end if;

  select * into v_conv from public.conversations where id = p_conversation_id;
  if not found then
    raise exception 'Không tìm thấy cuộc trò chuyện.' using errcode = 'P0002';
  end if;

  if v_conv.buyer_id <> v_uid and v_conv.seller_id <> v_uid then
    raise exception 'Bạn không thuộc cuộc trò chuyện này.' using errcode = '42501';
  end if;

  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'Lý do báo cáo cần từ 5 đến 500 ký tự.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.chat_reports
     where conversation_id = p_conversation_id
       and reporter_id = v_uid
       and status = 'open'
  ) then
    raise exception 'Bạn đã gửi báo cáo cho cuộc trò chuyện này và đang chờ xử lý.' using errcode = 'P0001';
  end if;

  insert into public.chat_reports (conversation_id, reporter_id, reason)
  values (p_conversation_id, v_uid, v_reason)
  returning * into v_report;

  return to_jsonb(v_report);
end;
$$;

create or replace function public.get_listing_accepted_offer(p_listing_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_offer public.price_offers%rowtype;
begin
  if v_uid is null then
    return null;
  end if;

  update public.price_offers
     set status = 'EXPIRED'
   where listing_id = p_listing_id
     and buyer_id = v_uid
     and status in ('PENDING', 'ACCEPTED')
     and expires_at <= now();

  select * into v_offer
    from public.price_offers
   where listing_id = p_listing_id
     and buyer_id = v_uid
     and status = 'ACCEPTED'
     and expires_at > now()
   order by responded_at desc nulls last, created_at desc
   limit 1;

  if not found then
    return null;
  end if;

  return to_jsonb(v_offer);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. Cập nhật public.create_order hỗ trợ giá thỏa thuận (p_offer_id)
-- ---------------------------------------------------------------------
drop function if exists public.create_order(uuid, text, text, text, text, bigint);
drop function if exists public.create_order(uuid, text, text, text, text, bigint, uuid);

create or replace function public.create_order(
  p_listing_id      uuid,
  p_recipient_name  text,
  p_phone           text,
  p_address         text,
  p_note            text default null,
  p_expected_amount bigint default null,
  p_offer_id        uuid default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid             uuid := (select auth.uid());
  v_listing         public.listings%rowtype;
  v_offer           public.price_offers%rowtype;
  v_effective_price bigint;
  v_bank            public.bank_accounts%rowtype;
  v_buyer_bank      public.bank_accounts%rowtype;
  v_order           public.orders%rowtype;
  v_is_mod          boolean;
  v_global_bp       integer;
  v_fee_cap         bigint;
  v_bp              integer;
  v_uncapped_fee    bigint;
  v_total_fee       bigint;
  v_fee_saved       bigint := 0;
  v_buyer_fee       bigint;
  v_seller_fee      bigint;
  v_tries           integer := 0;
  v_sys_msg_text    text;
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

  v_effective_price := v_listing.price;

  if p_offer_id is not null then
    select * into v_offer
      from public.price_offers
     where id = p_offer_id
     for update;
    if not found then
      raise exception 'Không tìm thấy đề nghị giá.' using errcode = 'P0002';
    end if;
    if v_offer.listing_id <> v_listing.id or v_offer.buyer_id <> v_uid then
      raise exception 'Đề nghị giá không hợp lệ cho tài khoản hoặc tin đăng này.' using errcode = '42501';
    end if;
    if v_offer.status <> 'ACCEPTED' then
      raise exception 'Đề nghị giá chưa được chấp nhận hoặc đã được sử dụng.' using errcode = 'P0001';
    end if;
    if v_offer.expires_at <= now() then
      update public.price_offers set status = 'EXPIRED' where id = v_offer.id;
      raise exception 'Đề nghị giá đã hết hạn 24 giờ.' using errcode = 'P0001';
    end if;
    v_effective_price := v_offer.offered_price;
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

  v_uncapped_fee := round(v_effective_price * v_bp / 10000.0)::bigint;

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

  if p_expected_amount is not null and p_expected_amount <> v_effective_price + v_buyer_fee then
    raise exception 'Giá vừa thay đổi (hiện là % đ). Hãy tải lại trang trước khi mua.', (v_effective_price + v_buyer_fee)
      using errcode = 'P0001';
  end if;

  loop
    begin
      insert into public.orders (
        payment_code, listing_id, listing_snapshot, buyer_id, seller_id,
        amount, platform_fee, seller_payout,
        list_price, fee_payer, fee_rate_bp, buyer_fee, seller_fee,
        fee_cap_vnd, fee_saved_amount, offer_id,
        recipient_name, phone, address, note, expires_at
      ) values (
        'CNTH' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
        v_listing.id,
        jsonb_build_object(
          'title', v_listing.title,
          'image', v_listing.images -> 0 ->> 'url',
          'price', v_effective_price
        ),
        v_uid, v_listing.seller_id,
        v_effective_price + v_buyer_fee, v_total_fee, v_effective_price - v_seller_fee,
        v_effective_price, v_listing.fee_payer, v_bp, v_buyer_fee, v_seller_fee,
        v_fee_cap, v_fee_saved, p_offer_id,
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

  if p_offer_id is not null then
    update public.price_offers
       set status   = 'ORDERED',
           order_id = v_order.id
     where id = p_offer_id;

    v_sys_msg_text := 'Đã tạo đơn hàng ' || v_order.payment_code || ' theo giá đã chốt ' ||
      trim(to_char(v_effective_price, 'FM999G999G999G990')) || ' đ.';

    insert into public.chat_messages (
      conversation_id, sender_id, message_type, body, offer_id, order_id
    ) values (
      v_offer.conversation_id, v_uid, 'SYSTEM', v_sys_msg_text, v_offer.id, v_order.id
    );

    update public.conversations
       set last_message_at      = now(),
           last_message_preview = v_sys_msg_text,
           last_sender_id       = v_uid,
           seller_unread_count  = seller_unread_count + 1
     where id = v_offer.conversation_id;
  end if;

  -- Hủy các đề nghị giá còn mở khác trên cùng tin đăng
  update public.price_offers
     set status = 'CANCELLED'
   where listing_id = v_listing.id
     and status in ('PENDING', 'ACCEPTED')
     and (p_offer_id is null or id <> p_offer_id);

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. RPC quản trị: Xem hội thoại tranh chấp / báo cáo chat & audit log
-- ---------------------------------------------------------------------
create or replace function public.admin_get_dispute_conversation(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_order    public.orders%rowtype;
  v_conv     public.conversations%rowtype;
  v_buyer    public.profiles%rowtype;
  v_seller   public.profiles%rowtype;
  v_messages jsonb := '[]'::jsonb;
  v_offers   jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found then
    raise exception 'Không tìm thấy đơn hàng.' using errcode = 'P0002';
  end if;

  if v_order.status::text <> 'DISPUTED' then
    raise exception 'Chỉ được xem hội thoại khi đơn hàng đang trong trạng thái Khiếu nại (DISPUTED).' using errcode = '42501';
  end if;

  select * into v_conv
    from public.conversations
   where listing_id = v_order.listing_id
     and buyer_id = v_order.buyer_id
     and seller_id = v_order.seller_id;

  insert into public.admin_audit_log (
    admin_id, action, order_id, listing_id, target_user_id, note
  ) values (
    v_admin_id,
    'VIEW_DISPUTE_CHAT',
    v_order.id,
    v_order.listing_id,
    v_order.seller_id,
    format('Xem hội thoại tranh chấp đơn %s', v_order.payment_code)
  );

  if v_conv.id is null then
    return null;
  end if;

  select * into v_buyer  from public.profiles where id = v_conv.buyer_id;
  select * into v_seller from public.profiles where id = v_conv.seller_id;

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at asc), '[]'::jsonb)
    into v_messages
    from public.chat_messages m
   where m.conversation_id = v_conv.id;

  select coalesce(jsonb_agg(to_jsonb(po) order by po.created_at asc), '[]'::jsonb)
    into v_offers
    from public.price_offers po
   where po.conversation_id = v_conv.id;

  return jsonb_build_object(
    'conversation',  to_jsonb(v_conv),
    'listing_title', coalesce(v_order.listing_snapshot->>'title', 'Sản phẩm VAHA Market'),
    'payment_code',  v_order.payment_code,
    'buyer', jsonb_build_object(
      'id',           v_buyer.id,
      'display_name', v_buyer.display_name,
      'avatar_url',   v_buyer.avatar_url,
      'is_mod',       v_buyer.is_mod,
      'is_banned',    v_buyer.is_banned
    ),
    'seller', jsonb_build_object(
      'id',           v_seller.id,
      'display_name', v_seller.display_name,
      'avatar_url',   v_seller.avatar_url,
      'is_mod',       v_seller.is_mod,
      'is_banned',    v_seller.is_banned
    ),
    'messages', v_messages,
    'offers',   v_offers
  );
end;
$$;

create or replace function public.admin_list_chat_reports(
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
      cr.id,
      cr.conversation_id,
      cr.reporter_id,
      cr.reason,
      cr.status,
      cr.resolved_by,
      cr.resolved_at,
      cr.resolution_note,
      cr.created_at,
      c.listing_id,
      l.title as listing_title,
      c.buyer_id,
      c.seller_id,
      c.last_message_preview,
      c.last_message_at,
      jsonb_build_object(
        'id',           rp.id,
        'display_name', rp.display_name,
        'avatar_url',   rp.avatar_url
      ) as reporter,
      jsonb_build_object(
        'id',           bp.id,
        'display_name', bp.display_name,
        'avatar_url',   bp.avatar_url,
        'is_banned',    bp.is_banned
      ) as buyer,
      jsonb_build_object(
        'id',           sp.id,
        'display_name', sp.display_name,
        'avatar_url',   sp.avatar_url,
        'is_banned',    sp.is_banned
      ) as seller,
      res_p.display_name as resolver_name
    from public.chat_reports cr
    join public.conversations c on c.id = cr.conversation_id
    join public.listings l on l.id = c.listing_id
    join public.profiles rp on rp.id = cr.reporter_id
    join public.profiles bp on bp.id = c.buyer_id
    join public.profiles sp on sp.id = c.seller_id
    left join public.profiles res_p on res_p.id = cr.resolved_by
    where v_status = 'all' or cr.status = v_status
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

create or replace function public.admin_get_reported_conversation(p_report_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_report   public.chat_reports%rowtype;
  v_conv     public.conversations%rowtype;
  v_listing  public.listings%rowtype;
  v_buyer    public.profiles%rowtype;
  v_seller   public.profiles%rowtype;
  v_messages jsonb := '[]'::jsonb;
  v_offers   jsonb := '[]'::jsonb;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  select * into v_report from public.chat_reports where id = p_report_id;
  if not found then
    raise exception 'Không tìm thấy báo cáo hội thoại.' using errcode = 'P0002';
  end if;

  select * into v_conv    from public.conversations where id = v_report.conversation_id;
  select * into v_listing from public.listings where id = v_conv.listing_id;
  select * into v_buyer   from public.profiles where id = v_conv.buyer_id;
  select * into v_seller  from public.profiles where id = v_conv.seller_id;

  insert into public.admin_audit_log (
    admin_id, action, listing_id, target_user_id, note
  ) values (
    v_admin_id,
    'VIEW_REPORTED_CHAT',
    v_conv.listing_id,
    case when v_report.reporter_id = v_conv.buyer_id then v_conv.seller_id else v_conv.buyer_id end,
    format('Xem hội thoại từ báo cáo %s', v_report.id)
  );

  select coalesce(jsonb_agg(to_jsonb(m) order by m.created_at asc), '[]'::jsonb)
    into v_messages
    from public.chat_messages m
   where m.conversation_id = v_conv.id;

  select coalesce(jsonb_agg(to_jsonb(po) order by po.created_at asc), '[]'::jsonb)
    into v_offers
    from public.price_offers po
   where po.conversation_id = v_conv.id;

  return jsonb_build_object(
    'conversation',  to_jsonb(v_conv),
    'listing_title', coalesce(v_listing.title, 'Sản phẩm VAHA Market'),
    'payment_code',  null,
    'buyer', jsonb_build_object(
      'id',           v_buyer.id,
      'display_name', v_buyer.display_name,
      'avatar_url',   v_buyer.avatar_url,
      'is_mod',       v_buyer.is_mod,
      'is_banned',    v_buyer.is_banned
    ),
    'seller', jsonb_build_object(
      'id',           v_seller.id,
      'display_name', v_seller.display_name,
      'avatar_url',   v_seller.avatar_url,
      'is_mod',       v_seller.is_mod,
      'is_banned',    v_seller.is_banned
    ),
    'messages', v_messages,
    'offers',   v_offers
  );
end;
$$;

create or replace function public.admin_resolve_chat_report(
  p_report_id uuid,
  p_status    text,
  p_note      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_status   text := lower(btrim(coalesce(p_status, '')));
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_report   public.chat_reports%rowtype;
  v_conv     public.conversations%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;

  if v_status not in ('resolved', 'dismissed') then
    raise exception 'Trạng thái xử lý không hợp lệ.' using errcode = '22023';
  end if;

  select * into v_report from public.chat_reports where id = p_report_id for update;
  if not found then
    raise exception 'Không tìm thấy báo cáo.' using errcode = 'P0002';
  end if;

  select * into v_conv from public.conversations where id = v_report.conversation_id;

  update public.chat_reports
     set status          = v_status,
         resolved_by     = v_admin_id,
         resolved_at     = now(),
         resolution_note = v_note
   where id = p_report_id
   returning * into v_report;

  insert into public.admin_audit_log (
    admin_id, action, listing_id, target_user_id, note
  ) values (
    v_admin_id,
    'RESOLVE_CHAT_REPORT',
    v_conv.listing_id,
    case when v_report.reporter_id = v_conv.buyer_id then v_conv.seller_id else v_conv.buyer_id end,
    format('Xử lý báo cáo hội thoại (%s)%s', v_status, case when v_note is not null then ': ' || v_note else '' end)
  );

  return to_jsonb(v_report);
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
    'payout_pending_count',    (select count(*) from public.order_payouts where status = 'PENDING'),
    'payout_pending_amount',   (select coalesce(sum(amount), 0) from public.order_payouts where status = 'PENDING'),
    'flagged_tx_count',        (select count(*) from public.transactions
                                 where resolved_at is null
                                   and match_status in ('UNDERPAID', 'LATE_PAYMENT', 'EXTRA_PAYMENT', 'UNMATCHED', 'OVERPAID')),
    'pending_review_count',    (select count(*) from public.listings where status::text = 'pending_review'),
    'banned_count',            (select count(*) from public.profiles where is_banned = true),
    'total_members',           (select count(*) from public.profiles),
    'active_listings_count',   (select count(*) from public.listings where status::text = 'active'),
    'open_reports_count',      (select count(*) from public.listing_reports where status = 'open'),
    'open_chat_reports_count', (select count(*) from public.chat_reports where status = 'open'),
    'total_reviews_count',     (select count(*) from public.order_reviews),
    'hidden_reviews_count',    (select count(*) from public.order_reviews where is_hidden = true)
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
      or (v_cat = 'chat'     and al.action in ('VIEW_DISPUTE_CHAT', 'VIEW_REPORTED_CHAT', 'RESOLVE_CHAT_REPORT'))
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
-- 6. Phân quyền thực thi (KHÔNG cấp cho anon)
-- ---------------------------------------------------------------------
revoke all on function public.start_or_get_conversation(uuid, uuid)                        from public, anon, authenticated;
revoke all on function public.list_my_conversations(integer, integer)                      from public, anon, authenticated;
revoke all on function public.get_conversation_detail(uuid, integer, timestamptz)          from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid)                                 from public, anon, authenticated;
revoke all on function public.send_chat_message(uuid, text)                                from public, anon, authenticated;
revoke all on function public.create_price_offer(uuid, bigint, text)                       from public, anon, authenticated;
revoke all on function public.respond_price_offer(uuid, text)                              from public, anon, authenticated;
revoke all on function public.toggle_block_conversation(uuid, boolean)                     from public, anon, authenticated;
revoke all on function public.report_conversation(uuid, text)                              from public, anon, authenticated;
revoke all on function public.get_listing_accepted_offer(uuid)                             from public, anon, authenticated;
revoke all on function public.create_order(uuid, text, text, text, text, bigint, uuid)     from public, anon, authenticated;
revoke all on function public.admin_get_dispute_conversation(uuid)                         from public, anon, authenticated;
revoke all on function public.admin_list_chat_reports(text, integer, integer)              from public, anon, authenticated;
revoke all on function public.admin_get_reported_conversation(uuid)                        from public, anon, authenticated;
revoke all on function public.admin_resolve_chat_report(uuid, text, text)                  from public, anon, authenticated;
revoke all on function public.admin_stats()                                                from public, anon, authenticated;
revoke all on function public.admin_list_audit_logs(text, text, integer, integer)          from public, anon, authenticated;

grant execute on function public.start_or_get_conversation(uuid, uuid)                     to authenticated;
grant execute on function public.list_my_conversations(integer, integer)                   to authenticated;
grant execute on function public.get_conversation_detail(uuid, integer, timestamptz)       to authenticated;
grant execute on function public.mark_conversation_read(uuid)                              to authenticated;
grant execute on function public.send_chat_message(uuid, text)                             to authenticated;
grant execute on function public.create_price_offer(uuid, bigint, text)                    to authenticated;
grant execute on function public.respond_price_offer(uuid, text)                           to authenticated;
grant execute on function public.toggle_block_conversation(uuid, boolean)                  to authenticated;
grant execute on function public.report_conversation(uuid, text)                           to authenticated;
grant execute on function public.get_listing_accepted_offer(uuid)                          to authenticated;
grant execute on function public.create_order(uuid, text, text, text, text, bigint, uuid)  to authenticated;
grant execute on function public.admin_get_dispute_conversation(uuid)                      to authenticated;
grant execute on function public.admin_list_chat_reports(text, integer, integer)           to authenticated;
grant execute on function public.admin_get_reported_conversation(uuid)                     to authenticated;
grant execute on function public.admin_resolve_chat_report(uuid, text, text)               to authenticated;
grant execute on function public.admin_stats()                                             to authenticated;
grant execute on function public.admin_list_audit_logs(text, text, integer, integer)       to authenticated;
