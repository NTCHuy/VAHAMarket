-- =====================================================================
--  PATCH 007 — Bulletproof Moderation (kiểm duyệt chống lừa đảo)
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002 → 006.
--
--  1. Hồ sơ người bán bắt buộc (SĐT + Facebook + tài khoản ngân hàng) và khóa thông tin định danh
--  2. Tin mới vào trạng thái 'pending_review'; Mod/Admin được duyệt thẳng; ảnh xác thực chính chủ bắt buộc
--  3. Bộ lọc chặn dẫn dụ giao dịch ngoài sàn (SĐT, "zalo", "ck trực tiếp"...) ở tầng DB
--  4. admin_review_listing (duyệt / từ chối kèm lý do) + đếm tin chờ duyệt trong admin_stats
--
--  Các quy tắc ở tầng DB chỉ áp dụng cho yêu cầu từ client (role authenticated/anon). Hàm hệ thống
--  (create_order, confirm_received...), SQL Editor và service_role không bị ràng buộc bởi các trigger này.
--
--  LƯU Ý Postgres: giá trị enum mới ('pending_review', 'rejected') chưa dùng được ngay trong cùng giao dịch,
--  nên file này chỉ tham chiếu chúng qua `status::text` hoặc bên trong thân hàm (chạy sau khi commit).
-- =====================================================================

-- 0. Trạng thái tin đăng mới ------------------------------------------------------------
alter type public.listing_status add value if not exists 'pending_review';
alter type public.listing_status add value if not exists 'rejected';

-- 1. Cột mới -------------------------------------------------------------------------------
-- 1.1 profiles.facebook_url (công khai: người mua dùng để kiểm tra uy tín)
alter table public.profiles add column if not exists facebook_url text;
alter table public.profiles drop constraint if exists profiles_facebook_url_check;
alter table public.profiles add constraint profiles_facebook_url_check
  check (facebook_url is null or (
    char_length(facebook_url) <= 200
    and facebook_url ~* '^https?://([a-z0-9-]+\.)?(facebook\.com|fb\.com|fb\.me)/.+$'
  ));

-- Chuyển link Facebook đã lưu trước đây ở profile_contacts sang profiles
update public.profiles p
   set facebook_url = c.facebook_url
  from public.profile_contacts c
 where c.user_id = p.id and p.facebook_url is null and c.facebook_url is not null;

grant update (facebook_url) on public.profiles to authenticated;

-- 1.2 listings: ảnh xác thực + thông tin kiểm duyệt
--     verification_image_url NOT NULL; tin cũ (trước 007) mang giá trị '' = "chưa có ảnh xác thực"
--     (không hiện huy hiệu). Tin MỚI luôn bị ép phải có ảnh hợp lệ bởi trigger bên dưới.
alter table public.listings add column if not exists verification_image_url text not null default '';
alter table public.listings add column if not exists rejection_reason text;
alter table public.listings add column if not exists approved_at      timestamptz;
alter table public.listings add column if not exists reviewed_by      uuid references auth.users (id) on delete set null;
alter table public.listings add column if not exists reviewed_at      timestamptz;

alter table public.listings drop constraint if exists listings_rejection_reason_check;
alter table public.listings add constraint listings_rejection_reason_check
  check (rejection_reason is null or char_length(rejection_reason) <= 500);

-- Tin đã hiển thị/đã giao dịch trước 007 được coi là đã duyệt (để người bán ẩn/hiện lại không bị bắt duyệt lại)
update public.listings
   set approved_at = created_at
 where approved_at is null and status::text in ('active', 'hidden', 'reserved', 'sold');

-- Client được ghi ảnh xác thực; các cột kiểm duyệt (approved_at, rejection_reason, reviewed_*) KHÔNG cấp quyền ghi
grant insert (verification_image_url) on public.listings to authenticated;
grant update (verification_image_url) on public.listings to authenticated;

-- 2. Hàm hỗ trợ (SECURITY DEFINER, đọc dữ liệu bỏ qua RLS) ----------------------------------------
create or replace function public.is_mod_user(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select is_mod from public.profiles where id = p_uid), false);
$$;

-- Danh sách mục còn thiếu của hồ sơ người bán (rỗng = đủ điều kiện đăng tin)
create or replace function public.listing_seller_missing(p_uid uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_remove(array[
    case when coalesce(btrim((select phone from public.profile_contacts where user_id = p_uid)), '') = '' then 'số điện thoại' end,
    case when coalesce(btrim((select facebook_url from public.profiles where id = p_uid)), '') = '' then 'link Facebook cá nhân' end,
    case when not exists (select 1 from public.bank_accounts where user_id = p_uid) then 'tài khoản ngân hàng nhận tiền' end
  ], null);
$$;

-- Người bán đang có tin hiển thị / chờ duyệt / đã giữ chỗ hoặc đơn bán đang xử lý → khóa thông tin định danh
create or replace function public.identity_locked(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.listings where seller_id = p_uid and status::text in ('pending_review', 'active', 'reserved'))
      or exists (select 1 from public.orders   where seller_id = p_uid and status in ('PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED', 'COMPLETED', 'DISPUTED'));
$$;

-- Giao diện hỏi: tài khoản của tôi có đang bị khóa định danh không
create or replace function public.my_identity_lock()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'locked', public.identity_locked((select auth.uid())),
    'listings', (select count(*) from public.listings where seller_id = (select auth.uid()) and status::text in ('pending_review', 'active', 'reserved')),
    'orders', (select count(*) from public.orders where seller_id = (select auth.uid()) and status in ('PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED', 'COMPLETED', 'DISPUTED'))
  );
$$;

-- 3. Bộ lọc dẫn dụ giao dịch ngoài sàn -------------------------------------------------------
-- Chuẩn hóa: chữ thường, bỏ dấu tiếng Việt (đ → d). PHẢI khớp với src/lib/moderation.ts
create or replace function public.moderation_normalize(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(replace(normalize(lower(coalesce(p_text, '')), NFD), 'đ', 'd'), E'[\u0300-\u036f]', '', 'g');
$$;

-- Trả về mô tả vi phạm đầu tiên tìm thấy, hoặc NULL nếu sạch
create or replace function public.listing_text_violation(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(public.moderation_normalize(p_text), '\s+', ' ', 'g');
  k text;
begin
  -- (a) ≥ 9 chữ số liên tiếp (chuỗi 9–11 chữ số là SĐT)
  if v ~ '[0-9]{9,11}' then
    return 'số điện thoại';
  end if;
  -- (b) SĐT viết có phân cách: bắt đầu bằng 0 hoặc +84/84, 9–11 chữ số, ngăn bởi dấu cách/chấm/gạch ngang
  --     (ký tự đứng trước không được là số, dấu chấm hoặc gạch ngang để không nhầm với giá "1.000.000.000")
  if v ~ '(^|[^0-9.-])(\+?84|0)([ .-]*[0-9]){8,10}([^0-9]|$)' then
    return 'số điện thoại';
  end if;
  -- (c) từ khóa lách luật
  foreach k in array array[
    'bank truc tiep', 'ck truc tiep', 'chuyen khoan truc tiep',
    'chuyen khoan rieng', 'ck rieng', 'bank rieng',
    'khong qua san', 'zalo'
  ] loop
    if position(k in v) > 0 then
      return 'từ khóa "' || k || '"';
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.listings_moderation_check()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v text;
begin
  -- Chỉ áp dụng cho yêu cầu từ client; hàm hệ thống / SQL Editor / service_role bỏ qua
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' or new.title is distinct from old.title then
    v := public.listing_text_violation(new.title);
    if v is not null then
      raise exception 'Tiêu đề không được chứa % (không dẫn dụ giao dịch ngoài sàn). Hãy sửa lại tiêu đề.', v using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'INSERT' or new.description is distinct from old.description then
    v := public.listing_text_violation(new.description);
    if v is not null then
      raise exception 'Mô tả không được chứa % (không dẫn dụ giao dịch ngoài sàn). Hãy sửa lại mô tả.', v using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_listings_moderation on public.listings;
create trigger trg_listings_moderation
  before insert or update on public.listings
  for each row execute function public.listings_moderation_check();

-- 4. Tiền kiểm bài đăng: ép trạng thái + ảnh xác thực + hồ sơ người bán -------------------------
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
    return new;   -- hàm hệ thống (create_order...), SQL Editor, service_role
  end if;

  v_priv := public.is_admin() or public.is_mod_user(v_uid);

  if tg_op = 'INSERT' then
    v_missing := public.listing_seller_missing(new.seller_id);
    if cardinality(v_missing) > 0 then
      raise exception 'Hồ sơ người bán chưa đủ: thiếu %. Hãy hoàn tất trong Cài đặt tài khoản trước khi đăng tin.', array_to_string(v_missing, ', ') using errcode = 'P0001';
    end if;
    if new.verification_image_url !~ '^https://res\.cloudinary\.com/[^[:space:]]+$' then
      raise exception 'Cần tải lên ảnh xác thực chính chủ (sản phẩm đặt cạnh giấy viết tay) trước khi đăng tin.' using errcode = 'P0001';
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

  -- UPDATE: client không được tự sửa các cột kiểm duyệt
  new.approved_at := old.approved_at;
  new.rejection_reason := old.rejection_reason;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_at := old.reviewed_at;

  v_changed := new.title is distinct from old.title
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
      new.status := 'active';          -- tin đã duyệt, chỉ bật lại / sửa giá → không cần duyệt lại
    else
      v_missing := public.listing_seller_missing(new.seller_id);
      if cardinality(v_missing) > 0 then
        raise exception 'Hồ sơ người bán chưa đủ: thiếu %. Hãy hoàn tất trong Cài đặt tài khoản.', array_to_string(v_missing, ', ') using errcode = 'P0001';
      end if;
      if new.verification_image_url !~ '^https://res\.cloudinary\.com/[^[:space:]]+$' then
        raise exception 'Cần tải lên ảnh xác thực chính chủ (sản phẩm đặt cạnh giấy viết tay) để gửi duyệt.' using errcode = 'P0001';
      end if;
      new.status := 'pending_review';  -- sửa nội dung / gửi lại sau khi bị từ chối → chờ Admin duyệt
      new.approved_at := null;
      new.rejection_reason := null;
    end if;
  elsif v_changed and old.approved_at is not null then
    new.approved_at := null;           -- sửa nội dung lúc đang ẩn/nháp → mất trạng thái "đã duyệt"
  end if;

  return new;
end;
$$;

drop trigger if exists trg_listings_review_guard on public.listings;
create trigger trg_listings_review_guard
  before insert or update on public.listings
  for each row execute function public.listings_review_guard();

-- 5. Policies cho listings (cập nhật theo trạng thái mới; so sánh qua ::text) ----------------------
drop policy if exists "listings_select_active_or_own" on public.listings;
create policy "listings_select_active_or_own" on public.listings
  for select to anon, authenticated
  using (
    status::text = 'active'                 -- công khai chỉ thấy tin đã duyệt và đang bán
    or seller_id = (select auth.uid())      -- tác giả thấy mọi tin của mình (kể cả chờ duyệt / bị từ chối)
    or public.is_admin()
  );

drop policy if exists "listings_insert_own" on public.listings;
create policy "listings_insert_own" on public.listings
  for insert to authenticated
  with check (
    seller_id = (select auth.uid())
    and status::text in ('draft', 'pending_review', 'active', 'hidden')   -- trigger sẽ ép lại: người thường → pending_review
    and bank_account_id is not null
    and exists (
      select 1 from public.bank_accounts b
      where b.id = bank_account_id and b.user_id = (select auth.uid())
    )
  );

drop policy if exists "listings_update_own" on public.listings;
create policy "listings_update_own" on public.listings
  for update to authenticated
  using (
    seller_id = (select auth.uid())
    and status::text in ('draft', 'pending_review', 'active', 'hidden', 'rejected')
  )
  with check (
    seller_id = (select auth.uid())
    and status::text in ('draft', 'pending_review', 'active', 'hidden')
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
    and status::text in ('draft', 'pending_review', 'active', 'hidden', 'rejected')
  );

-- 6. Khóa thông tin định danh khi đang có tin/đơn hoạt động -------------------------------------
create or replace function public.profiles_identity_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and old.facebook_url is not null
     and new.facebook_url is distinct from old.facebook_url
     and public.identity_locked(new.id) then
    raise exception 'Không thể đổi link Facebook khi bạn đang có tin đang hiển thị/chờ duyệt hoặc đơn hàng đang xử lý. Liên hệ Admin nếu cần chỉnh sửa.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_identity_lock on public.profiles;
create trigger trg_profiles_identity_lock
  before update of facebook_url on public.profiles
  for each row execute function public.profiles_identity_lock();

create or replace function public.bank_accounts_identity_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.bank_bin is distinct from old.bank_bin
          or new.bank_code is distinct from old.bank_code
          or new.account_number is distinct from old.account_number
          or new.account_name is distinct from old.account_name)
     and public.identity_locked(new.user_id) then
    raise exception 'Không thể đổi thông tin tài khoản ngân hàng khi bạn đang có tin đang hiển thị/chờ duyệt hoặc đơn hàng đang xử lý. Tên chủ tài khoản phải chính chủ, khớp Facebook/CCCD. Liên hệ Admin nếu cần chỉnh sửa.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bank_accounts_identity_lock on public.bank_accounts;
create trigger trg_bank_accounts_identity_lock
  before update on public.bank_accounts
  for each row execute function public.bank_accounts_identity_lock();

-- 7. Admin: duyệt / từ chối tin ------------------------------------------------------------------
create or replace function public.admin_review_listing(
  p_listing_id uuid,
  p_decision   text,
  p_reason     text default null
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_listing public.listings%rowtype;
  v_reason  text := btrim(coalesce(p_reason, ''));
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVE', 'REJECT') then
    raise exception 'Quyết định không hợp lệ.' using errcode = '22023';
  end if;
  if p_decision = 'REJECT' and char_length(v_reason) not between 5 and 500 then
    raise exception 'Hãy nhập lý do từ chối (5–500 ký tự) để người bán sửa lại.' using errcode = '22023';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found or v_listing.status::text <> 'pending_review' then
    raise exception 'Chỉ duyệt được tin đang ở trạng thái chờ duyệt.' using errcode = 'P0001';
  end if;

  if p_decision = 'APPROVE' then
    update public.listings
       set status = 'active', approved_at = now(), rejection_reason = null,
           reviewed_by = (select auth.uid()), reviewed_at = now()
     where id = p_listing_id
     returning * into v_listing;
  else
    update public.listings
       set status = 'rejected', rejection_reason = v_reason,
           reviewed_by = (select auth.uid()), reviewed_at = now()
     where id = p_listing_id
     returning * into v_listing;
  end if;

  insert into public.admin_audit_log (admin_id, action, listing_id, note)
  values ((select auth.uid()), 'REVIEW_LISTING_' || p_decision, p_listing_id, nullif(v_reason, ''));

  return v_listing;
end;
$$;

-- 8. Link Facebook người bán (công khai có chủ đích) đọc từ profiles ---------------------------------
create or replace function public.get_seller_facebook(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select facebook_url from public.profiles where id = p_user_id;
$$;

-- 9. admin_stats: thêm số tin chờ duyệt (giữ nguyên các khóa cũ) ------------------------------------
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
    'gmv',         coalesce(sum(list_price)   filter (where status in ('COMPLETED', 'PAID_OUT')), 0),
    'fees',        coalesce(sum(platform_fee) filter (where status in ('COMPLETED', 'PAID_OUT')), 0),
    'held_count',  count(*)                   filter (where status in ('PAID_HELD', 'SHIPPED')),
    'held_amount', coalesce(sum(amount)       filter (where status in ('PAID_HELD', 'SHIPPED')), 0),
    'dispute_count', count(*)                 filter (where status = 'DISPUTED')
  ) into v_result
  from public.orders;

  v_result := v_result || jsonb_build_object(
    'payout_pending_count',  (select count(*) from public.order_payouts where status = 'PENDING'),
    'payout_pending_amount', (select coalesce(sum(amount), 0) from public.order_payouts where status = 'PENDING'),
    'flagged_tx_count',      (select count(*) from public.transactions
                               where resolved_at is null
                                 and match_status in ('UNDERPAID', 'LATE_PAYMENT', 'EXTRA_PAYMENT', 'UNMATCHED', 'OVERPAID')),
    'pending_review_count',  (select count(*) from public.listings where status::text = 'pending_review')
  );

  return v_result;
end;
$$;

-- 10. Phân quyền thực thi -------------------------------------------------------------------------
revoke all on function public.is_mod_user(uuid)                      from public, anon, authenticated;
revoke all on function public.listing_seller_missing(uuid)           from public, anon, authenticated;
revoke all on function public.identity_locked(uuid)                  from public, anon, authenticated;
revoke all on function public.my_identity_lock()                     from public, anon, authenticated;
revoke all on function public.admin_review_listing(uuid, text, text) from public, anon, authenticated;
revoke all on function public.get_seller_facebook(uuid)              from public, anon, authenticated;
revoke all on function public.admin_stats()                          from public, anon, authenticated;

-- Hàm hỗ trợ cần cho trigger chạy dưới quyền client
grant execute on function public.is_mod_user(uuid)                   to authenticated, anon;
grant execute on function public.listing_seller_missing(uuid)        to authenticated, anon;
grant execute on function public.identity_locked(uuid)               to authenticated, anon;
grant execute on function public.my_identity_lock()                  to authenticated;
grant execute on function public.admin_review_listing(uuid, text, text) to authenticated;
grant execute on function public.get_seller_facebook(uuid)           to anon, authenticated;
grant execute on function public.admin_stats()                       to authenticated;
