-- =====================================================================
--  PATCH 012 — VAHA Market v2.0.0:
--    1. Định hướng sàn cộng đồng 0% phí (đặt mặc định global_fee_rate = 0, fee_cap_vnd = 0)
--    2. Tìm kiếm tiếng Việt không dấu & đa trường (title, brand, description, province)
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql và 002 -> 011.
-- =====================================================================

-- 1. Cập nhật mức phí mặc định sang 0% (sàn cộng đồng phi lợi nhuận) --------------
update public.platform_settings
   set global_fee_rate = 0,
       fee_cap_vnd     = 0,
       updated_at      = now()
 where id = 1;

-- 2. Hỗ trợ tìm kiếm không dấu tiếng Việt trên bảng public.listings ------------
create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

alter table public.listings add column if not exists search_text text;

create or replace function public.listings_build_search_text()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.search_text := lower(
    extensions.unaccent(
      concat_ws(
        ' ',
        coalesce(new.title, ''),
        coalesce(new.brand, ''),
        coalesce(new.description, ''),
        coalesce(new.province, '')
      )
    )
  );
  return new;
end;
$$;

revoke all on function public.listings_build_search_text() from public, anon, authenticated;

drop trigger if exists trg_listings_build_search_text on public.listings;
create trigger trg_listings_build_search_text
  before insert or update of title, brand, description, province
  on public.listings
  for each row
  execute function public.listings_build_search_text();

-- Backfill cho toàn bộ tin đăng hiện có
update public.listings
   set search_text = lower(
     extensions.unaccent(
       concat_ws(
         ' ',
         coalesce(title, ''),
         coalesce(brand, ''),
         coalesce(description, ''),
         coalesce(province, '')
       )
     )
   )
 where search_text is null
    or search_text = '';

create index if not exists idx_listings_search_text_trgm
  on public.listings using gin (search_text extensions.gin_trgm_ops)
  where status = 'active';
