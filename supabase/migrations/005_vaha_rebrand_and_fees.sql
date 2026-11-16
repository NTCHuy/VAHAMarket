-- =====================================================================
--  PATCH 005 — VAHA Market: chia phí sàn (fee_payer), phí 0% cho Mod, giá gốc gạch ngang
--  Chạy 1 lần trên SQL Editor (chạy lại an toàn). Cần chạy SAU schema.sql, 002, 003, 004.
--
--  Quy ước tiền (giữ nguyên các cột cũ để webhook/giao diện cũ vẫn đúng):
--    amount        = số tiền NGƯỜI MUA phải chuyển khoản (webhook so khớp với số này)
--    seller_payout = số tiền NGƯỜI BÁN thực nhận
--    platform_fee  = amount - seller_payout = tổng phí sàn thu được
--    list_price    = giá niêm yết;  buyer_fee / seller_fee = phần phí mỗi bên chịu
--  Phí gốc = 5% giá niêm yết (làm tròn nửa lên); người bán là Mod → 0%.
--    SELLER: người mua trả giá niêm yết;       người bán nhận giá − phí
--    BUYER : người mua trả giá + phí;          người bán nhận đủ giá
--    SPLIT : người mua trả giá + nửa phí;      người bán nhận giá − nửa còn lại
-- =====================================================================

-- 1. Mod: cờ trên profiles (client KHÔNG sửa được: quyền UPDATE theo cột chỉ gồm tên/ảnh/bio) ---------
alter table public.profiles add column if not exists is_mod boolean not null default false;

-- 2. listings: bên chịu phí + giá gốc ------------------------------------------------------
alter table public.listings add column if not exists fee_payer      text not null default 'SELLER';
alter table public.listings add column if not exists original_price bigint;

alter table public.listings drop constraint if exists listings_fee_payer_check;
alter table public.listings add constraint listings_fee_payer_check
  check (fee_payer in ('SELLER', 'BUYER', 'SPLIT'));

alter table public.listings drop constraint if exists listings_original_price_check;
alter table public.listings add constraint listings_original_price_check
  check (original_price is null or (original_price > price and original_price <= 1000000000));

grant insert (fee_payer, original_price) on public.listings to authenticated;
grant update (fee_payer, original_price) on public.listings to authenticated;

-- 3. orders: lưu cách tính phí tại thời điểm đặt (không đổi dù tin đăng sửa sau đó) ---------------
alter table public.orders add column if not exists list_price  bigint;
alter table public.orders add column if not exists fee_payer   text    not null default 'SELLER';
alter table public.orders add column if not exists fee_rate_bp integer not null default 500;  -- 500 = 5%
alter table public.orders add column if not exists buyer_fee   bigint  not null default 0;
alter table public.orders add column if not exists seller_fee  bigint  not null default 0;

-- Đơn cũ: người bán chịu toàn bộ phí, giá niêm yết = số tiền người mua đã trả
update public.orders set list_price = amount, seller_fee = platform_fee where list_price is null;
alter table public.orders alter column list_price set not null;

alter table public.orders drop constraint if exists orders_fee_payer_check;
alter table public.orders add constraint orders_fee_payer_check check (fee_payer in ('SELLER', 'BUYER', 'SPLIT'));

alter table public.orders drop constraint if exists orders_fee_consistent;
alter table public.orders add constraint orders_fee_consistent check (
  amount = list_price + buyer_fee
  and seller_payout = list_price - seller_fee
  and platform_fee = buyer_fee + seller_fee
);

-- 4. Nhật ký admin: thêm đối tượng tin đăng / thành viên ---------------------------------------
alter table public.admin_audit_log add column if not exists listing_id     uuid references public.listings (id) on delete set null;
alter table public.admin_audit_log add column if not exists target_user_id uuid references auth.users (id) on delete set null;

-- 5. create_order: tính phí theo fee_payer và is_mod của người bán -------------------------------
create or replace function public.create_order(
  p_listing_id     uuid,
  p_recipient_name text,
  p_phone          text,
  p_address        text,
  p_note           text default null
)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_listing   public.listings%rowtype;
  v_bank      public.bank_accounts%rowtype;
  v_order     public.orders%rowtype;
  v_is_mod    boolean;
  v_bp        integer;
  v_total_fee bigint;
  v_buyer_fee bigint;
  v_seller_fee bigint;
  v_tries     integer := 0;
begin
  if v_uid is null then
    raise exception 'Bạn cần đăng nhập để mua hàng.' using errcode = '28000';
  end if;
  if p_recipient_name is null or char_length(btrim(p_recipient_name)) not between 2 and 80 then
    raise exception 'Tên người nhận không hợp lệ (2–80 ký tự).' using errcode = '22023';
  end if;
  if p_phone is null or p_phone !~ '^[0-9+ ]{8,15}$' then
    raise exception 'Số điện thoại không hợp lệ.' using errcode = '22023';
  end if;
  if p_address is null or char_length(btrim(p_address)) not between 10 and 400 then
    raise exception 'Địa chỉ nhận hàng không hợp lệ (10–400 ký tự).' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 500 then
    raise exception 'Ghi chú quá dài (tối đa 500 ký tự).' using errcode = '22023';
  end if;

  select * into v_listing from public.listings where id = p_listing_id for update;
  if not found or v_listing.status <> 'active' then
    raise exception 'Sản phẩm không còn khả dụng.' using errcode = 'P0001';
  end if;
  if v_listing.seller_id = v_uid then
    raise exception 'Bạn không thể mua sản phẩm của chính mình.' using errcode = 'P0001';
  end if;
  if not v_listing.ship_cod then
    raise exception 'Tin này chỉ giao dịch trực tiếp, không mua qua trung gian được.' using errcode = 'P0001';
  end if;

  select * into v_bank
    from public.bank_accounts
   where id = v_listing.bank_account_id and user_id = v_listing.seller_id;
  if not found then
    raise exception 'Người bán chưa có tài khoản nhận tiền hợp lệ.' using errcode = 'P0001';
  end if;

  -- Phí: 5% (500 bp); người bán là Mod → 0%
  select coalesce(is_mod, false) into v_is_mod from public.profiles where id = v_listing.seller_id;
  v_bp := case when v_is_mod then 0 else 500 end;
  v_total_fee := round(v_listing.price * v_bp / 10000.0)::bigint;

  if v_listing.fee_payer = 'BUYER' then
    v_buyer_fee := v_total_fee;
    v_seller_fee := 0;
  elsif v_listing.fee_payer = 'SPLIT' then
    v_buyer_fee := round(v_listing.price * v_bp / 20000.0)::bigint;
    v_seller_fee := v_total_fee - v_buyer_fee;
  else
    v_buyer_fee := 0;
    v_seller_fee := v_total_fee;
  end if;

  loop
    begin
      insert into public.orders (
        payment_code, listing_id, listing_snapshot, buyer_id, seller_id,
        amount, platform_fee, seller_payout,
        list_price, fee_payer, fee_rate_bp, buyer_fee, seller_fee,
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
        btrim(p_recipient_name), p_phone, btrim(p_address), nullif(btrim(coalesce(p_note, '')), ''),
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

  update public.listings set status = 'reserved' where id = v_listing.id;

  return v_order;
end;
$$;

-- 6. Admin: gắn/gỡ huy hiệu Mod ----------------------------------------------------------
create or replace function public.admin_set_mod(p_user_id uuid, p_is_mod boolean)
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
  if p_is_mod is null then
    raise exception 'Thiếu giá trị Mod.' using errcode = '22023';
  end if;

  update public.profiles set is_mod = p_is_mod where id = p_user_id returning * into v_profile;
  if not found then
    raise exception 'Không tìm thấy thành viên.' using errcode = 'P0001';
  end if;

  insert into public.admin_audit_log (admin_id, action, target_user_id, note)
  values ((select auth.uid()), case when p_is_mod then 'GRANT_MOD' else 'REVOKE_MOD' end, p_user_id, null);

  return v_profile;
end;
$$;

-- 7. Admin: chỉnh giá / giá gốc của tin đăng (chạy deal nhanh) ------------------------------------
create or replace function public.admin_update_listing_price(
  p_listing_id     uuid,
  p_price          bigint,
  p_original_price bigint default null
)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     public.listings%rowtype;
  v_listing public.listings%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Không đủ quyền.' using errcode = '42501';
  end if;
  if p_price is null or p_price < 10000 or p_price > 1000000000 then
    raise exception 'Giá bán phải từ 10.000đ đến 1.000.000.000đ.' using errcode = '22023';
  end if;
  if p_original_price is not null and (p_original_price <= p_price or p_original_price > 1000000000) then
    raise exception 'Giá gốc phải lớn hơn giá bán (hoặc để trống).' using errcode = '22023';
  end if;

  select * into v_old from public.listings where id = p_listing_id for update;
  if not found then
    raise exception 'Không tìm thấy tin đăng.' using errcode = 'P0001';
  end if;
  if v_old.status not in ('draft', 'active', 'hidden') then
    raise exception 'Chỉ chỉnh giá được tin đang bán, nháp hoặc ẩn (tin đã giữ chỗ/đã bán thì không).' using errcode = 'P0001';
  end if;

  update public.listings
     set price = p_price, original_price = p_original_price
   where id = p_listing_id
   returning * into v_listing;

  insert into public.admin_audit_log (admin_id, action, listing_id, note)
  values (
    (select auth.uid()), 'UPDATE_LISTING_PRICE', p_listing_id,
    format('giá %s → %s; giá gốc %s → %s', v_old.price, p_price, coalesce(v_old.original_price::text, 'không'), coalesce(p_original_price::text, 'không'))
  );

  return v_listing;
end;
$$;

-- 8. Thống kê admin: GMV tính theo giá niêm yết hàng hóa ---------------------------------------
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
                                 and match_status in ('UNDERPAID', 'LATE_PAYMENT', 'EXTRA_PAYMENT', 'UNMATCHED', 'OVERPAID'))
  );

  return v_result;
end;
$$;

-- 9. Phân quyền thực thi ---------------------------------------------------------------------
revoke all on function public.create_order(uuid, text, text, text, text)       from public, anon, authenticated;
revoke all on function public.admin_set_mod(uuid, boolean)                     from public, anon, authenticated;
revoke all on function public.admin_update_listing_price(uuid, bigint, bigint) from public, anon, authenticated;
revoke all on function public.admin_stats()                                    from public, anon, authenticated;

grant execute on function public.create_order(uuid, text, text, text, text)    to authenticated;
grant execute on function public.admin_set_mod(uuid, boolean)                  to authenticated;
grant execute on function public.admin_update_listing_price(uuid, bigint, bigint) to authenticated;
grant execute on function public.admin_stats()                                 to authenticated;
