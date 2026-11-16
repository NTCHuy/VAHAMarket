-- =====================================================================
--  PATCH 002 — bổ sung cột cho giao diện (chạy 1 lần trên SQL Editor, chạy lại an toàn)
--   • profile_contacts: facebook_url, province
--   • listings: box_status (hộp & phụ kiện), ship_cod (ship COD người mua trả ship)
--   • listings.images: tối đa 6 ảnh
--   • bắt buộc có ít nhất 1 hình thức giao nhận (gặp trực tiếp hoặc ship COD)
-- =====================================================================

-- 1. profile_contacts
alter table public.profile_contacts add column if not exists facebook_url text;
alter table public.profile_contacts add column if not exists province text;

alter table public.profile_contacts drop constraint if exists profile_contacts_facebook_url_check;
alter table public.profile_contacts add constraint profile_contacts_facebook_url_check
  check (facebook_url is null or (
    char_length(facebook_url) <= 200
    and facebook_url ~* '^https?://([a-z0-9-]+\.)?(facebook\.com|fb\.com|fb\.me)/.+$'
  ));

alter table public.profile_contacts drop constraint if exists profile_contacts_province_check;
alter table public.profile_contacts add constraint profile_contacts_province_check
  check (province is null or char_length(province) <= 60);

grant update (phone, shipping_address, facebook_url, province)
  on public.profile_contacts to authenticated;

-- 2. listings
alter table public.listings add column if not exists box_status text not null default 'full';
alter table public.listings add column if not exists ship_cod   boolean not null default true;

alter table public.listings drop constraint if exists listings_box_status_check;
alter table public.listings add constraint listings_box_status_check
  check (box_status in ('full', 'box_only', 'accessories_only', 'none'));

alter table public.listings drop constraint if exists listings_images_check;
alter table public.listings drop constraint if exists listings_images_1_6;
alter table public.listings add constraint listings_images_1_6
  check (jsonb_typeof(images) = 'array' and jsonb_array_length(images) between 1 and 6);

alter table public.listings drop constraint if exists listings_delivery_required;
alter table public.listings add constraint listings_delivery_required
  check (ship_cod or province is not null);

grant insert (box_status, ship_cod) on public.listings to authenticated;
grant update (box_status, ship_cod) on public.listings to authenticated;
