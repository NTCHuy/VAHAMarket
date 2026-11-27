import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, Bookmark, Check, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { createSavedSearch } from '@/lib/lifecycle';
import { getErrorMessage } from '@/lib/errors';
import { BOX_STATUS_OPTIONS, CATEGORIES, CATEGORY_IDS, LISTING_CONDITIONS } from '@/constants/categories';
import { PROVINCES } from '@/constants/provinces';
import { Alert } from '@/components/ui';
import { ListingGridSkeleton } from '@/components/Skeletons';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/context/AuthContext';
import { usePlatformSettings } from '@/context/PlatformSettingsContext';
import { useSavedListings } from '@/context/SavedListingsContext';
import { formatVND, getDisplayPrice } from '@/lib/money';
import { removeVietnameseTones } from '@/lib/vietqr';
import { RatingSummaryBadge } from '@/components/StarRating';
import type { Listing } from '@/types';

type ListingCardItem = Pick<
  Listing,
  'id' | 'title' | 'price' | 'original_price' | 'fee_payer' | 'condition' | 'category' | 'province' | 'ship_cod' | 'box_status' | 'images' | 'verification_image_url'
> & {
  profiles: {
    display_name: string;
    is_mod: boolean;
    facebook_url: string | null;
    seller_rating_avg: number;
    seller_rating_count: number;
  } | null;
};

const PAGE_SIZE = 24;
const COLUMNS =
  'id,title,price,original_price,fee_payer,condition,category,province,ship_cod,box_status,images,verification_image_url,profiles:profiles!listings_seller_id_fkey(display_name,is_mod,facebook_url,seller_rating_avg,seller_rating_count)';

type SortKey = 'new' | 'price_asc' | 'price_desc';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'new', label: 'Mới nhất' },
  { id: 'price_asc', label: 'Giá tăng dần' },
  { id: 'price_desc', label: 'Giá giảm dần' },
];

const QUICK_CATEGORIES: { id: string; label: string }[] = [
  { id: '', label: 'Tất cả' },
  { id: 'iem', label: 'IEM' },
  { id: 'over-ear', label: 'Chụp tai' },
  { id: 'dac-amp', label: 'DAC/Amp' },
  { id: 'cable-accessory', label: 'Dây & Phụ kiện' },
  { id: 'tws', label: 'Không dây' },
  { id: 'dap', label: 'Máy nghe nhạc' },
];

const QUICK_PRICE_RANGES: { id: string; label: string; min: string; max: string }[] = [
  { id: 'u1', label: 'Dưới 1tr', min: '', max: '1000000' },
  { id: '1to3', label: '1 – 3tr', min: '1000000', max: '3000000' },
  { id: '3to10', label: '3 – 10tr', min: '3000000', max: '10000000' },
  { id: '10p', label: 'Trên 10tr', min: '10000000', max: '' },
];

const POPULAR_KEYWORDS = ['Moondrop', 'Sennheiser', 'FiiO', 'Sony', 'Truthear', '7Hz'] as const;

const SHORT_CONDITION: Record<string, string> = {
  like_new: 'Như mới 99%',
  good: 'Tốt 90–98%',
  fair: 'Khá',
  for_parts: 'Xác / Linh kiện',
};

const VALID_CONDITIONS = new Set<string>(LISTING_CONDITIONS.map((c) => c.id));
const VALID_BOXES = new Set<string>(BOX_STATUS_OPTIONS.map((b) => b.id));
const VALID_CATEGORIES = new Set<string>(CATEGORY_IDS);
const VALID_SORTS = new Set<string>(SORTS.map((s) => s.id));

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const digitsOnly = (s: string) => s.replace(/\D/g, '').slice(0, 10);
const parsePositiveInt = (s: string): number | null => {
  if (!/^\d{1,10}$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
};

export default function Home() {
  useDocumentTitle();
  const { user, signIn } = useAuth();
  const { feeBp, feeCapVnd } = usePlatformSettings();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const rawCategory = params.get('category') ?? '';
  const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : '';
  const province = params.get('province') ?? '';
  const rawCondition = params.get('condition') ?? '';
  const condition = VALID_CONDITIONS.has(rawCondition) ? rawCondition : '';
  const rawBox = params.get('box') ?? '';
  const box = VALID_BOXES.has(rawBox) ? rawBox : '';
  const min = digitsOnly(params.get('min') ?? '');
  const max = digitsOnly(params.get('max') ?? '');
  const rawSort = params.get('sort') ?? 'new';
  const sort: SortKey = VALID_SORTS.has(rawSort) ? (rawSort as SortKey) : 'new';

  const [searchText, setSearchText] = useState(q);
  const [minText, setMinText] = useState(min);
  const [maxText, setMaxText] = useState(max);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const setParam = useCallback(
    (key: string, value: string) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value && !(key === 'sort' && value === 'new')) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchText.trim() !== q) setParam('q', searchText.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [searchText, q, setParam]);

  useEffect(() => {
    const t = setTimeout(() => {
      if (minText !== min) setParam('min', minText);
      if (maxText !== max) setParam('max', maxText);
    }, 600);
    return () => clearTimeout(t);
  }, [minText, maxText, min, max, setParam]);

  const [items, setItems] = useState<ListingCardItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alertState, setAlertState] = useState<{
    key: string;
    status: 'saving' | 'saved' | 'error';
    msg?: string;
  } | null>(null);
  const requestId = useRef(0);

  const fetchPage = useCallback(
    async (offset: number) => {
      let query = supabase
        .from('listings')
        .select(COLUMNS, { count: 'exact' })
        .eq('status', 'active');

      if (q) query = query.ilike('search_text', `%${escapeLike(removeVietnameseTones(q).toLowerCase())}%`);
      if (category) query = query.eq('category', category);
      if (province) query = query.eq('province', province);
      if (condition) query = query.eq('condition', condition);
      if (box) query = query.eq('box_status', box);
      const minVal = parsePositiveInt(min);
      const maxVal = parsePositiveInt(max);
      if (minVal !== null) query = query.gte('price', minVal);
      if (maxVal !== null) query = query.lte('price', maxVal);

      if (sort === 'price_asc') query = query.order('price', { ascending: true });
      else if (sort === 'price_desc') query = query.order('price', { ascending: false });
      else query = query.order('bumped_at', { ascending: false });

      return query.range(offset, offset + PAGE_SIZE - 1);
    },
    [q, category, province, condition, box, min, max, sort],
  );

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    fetchPage(0).then(({ data, count, error: err }) => {
      if (id !== requestId.current) return;
      if (err) setError(getErrorMessage(err));
      else {
        setItems((data ?? []) as unknown as ListingCardItem[]);
        setTotal(count ?? 0);
      }
      setLoading(false);
    });
  }, [fetchPage]);

  const loadMore = async () => {
    const id = requestId.current;
    setLoadingMore(true);
    const { data, error: err } = await fetchPage(items.length);
    if (id !== requestId.current) return;
    if (err) setError(getErrorMessage(err));
    else setItems((prev) => [...prev, ...((data ?? []) as unknown as ListingCardItem[])]);
    setLoadingMore(false);
  };

  const applyPriceRange = (nextMin: string, nextMax: string) => {
    const isSame = min === nextMin && max === nextMax;
    const finalMin = isSame ? '' : nextMin;
    const finalMax = isSame ? '' : nextMax;
    setMinText(finalMin);
    setMaxText(finalMax);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (finalMin) next.set('min', finalMin);
        else next.delete('min');
        if (finalMax) next.set('max', finalMax);
        else next.delete('max');
        return next;
      },
      { replace: true },
    );
  };

  const extraFilterCount = [condition, box, min, max].filter(Boolean).length;
  const activeFilters = [category, province, condition, box, min, max].filter(Boolean).length;
  const clearFilters = () => {
    setMinText('');
    setMaxText('');
    setParams(
      (prev) => {
        const next = new URLSearchParams();
        const keep = prev.get('q');
        if (keep) next.set('q', keep);
        return next;
      },
      { replace: true },
    );
  };

  const feeSummary = 'Miễn phí 0%';

  return (
    <div className="space-y-4">
      {/* Compact Trust Strip — 1 dòng trạng thái nền tảng, không dùng Hero Banner */}
      <div className="-mx-4 -mt-5 border-b border-neutral-200 bg-neutral-100 px-4 py-2.5 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 sm:-mx-6 sm:-mt-6 sm:px-6">
        <div className="mx-auto flex flex-col gap-1.5 lg:flex-row lg:items-center lg:justify-between">
          <p className="leading-snug">
            <strong className="font-semibold text-neutral-900 dark:text-neutral-100">VAHA Market</strong> — Sàn trung gian <strong>0% phí</strong> · Hội người Việt nghiện tai nghe.
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-neutral-600 dark:text-neutral-400">
            <span className="font-medium text-neutral-900 dark:text-neutral-100">{total} tin đang bán</span>
            <span aria-hidden="true">·</span>
            <span className={feeBp < 500 ? 'font-medium text-emerald-700 dark:text-emerald-400' : ''}>{feeSummary}</span>
            <span aria-hidden="true">·</span>
            <Link to="/transparency" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
              Minh bạch
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/support" className="font-medium text-rose-600 hover:underline dark:text-rose-400">
              Ủng hộ
            </Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
              Điều khoản
            </Link>
          </div>
        </div>
      </div>

      {/* Thanh tìm kiếm & lọc ngang hàng mật độ cao */}
      <section className="space-y-2.5" aria-label="Tìm kiếm và bộ lọc">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-0 sm:min-w-[220px] sm:flex-1">
            <Search size={16} strokeWidth={1.75} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              className="input h-9 pl-9"
              placeholder="Tìm tai nghe, DAC/Amp, thương hiệu..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              aria-label="Tìm kiếm sản phẩm"
            />
          </div>

          <select
            className="input h-9 min-w-0 flex-1 sm:w-auto sm:flex-none sm:min-w-[140px]"
            value={province}
            onChange={(e) => setParam('province', e.target.value)}
            aria-label="Khu vực"
          >
            <option value="">Mọi khu vực</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>

          <select
            className="input h-9 min-w-0 flex-1 sm:w-auto sm:flex-none sm:min-w-[130px]"
            value={sort}
            onChange={(e) => setParam('sort', e.target.value)}
            aria-label="Sắp xếp"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>

          <button
            type="button"
            className={`btn-secondary h-9 px-3 text-xs ${extraFilterCount > 0 ? 'border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-400' : ''}`}
            onClick={() => setShowMoreFilters((v) => !v)}
            aria-expanded={showMoreFilters}
          >
            <SlidersHorizontal size={15} strokeWidth={1.75} />
            Bộ lọc{extraFilterCount > 0 ? ` (${extraFilterCount})` : ''}
          </button>

          {activeFilters > 0 && (
            <button type="button" className="btn-ghost h-9 px-2.5 text-xs" onClick={clearFilters}>
              <X size={14} strokeWidth={1.75} /> Xóa lọc
            </button>
          )}
        </div>

        {/* Dải nút lọc danh mục ngang */}
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_CATEGORIES.map((c) => {
            const active = category === c.id;
            return (
              <button
                key={c.id || 'all'}
                type="button"
                onClick={() => setParam('category', c.id)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  active
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                {c.label}
              </button>
            );
          })}
          <select
            className="h-[26px] rounded-md border border-neutral-200 bg-white px-2 text-xs text-neutral-600 focus:border-blue-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400"
            value={QUICK_CATEGORIES.some((c) => c.id === category) ? '' : category}
            onChange={(e) => setParam('category', e.target.value)}
            aria-label="Danh mục khác"
          >
            <option value="">Danh mục khác...</option>
            {CATEGORIES.filter((c) => !QUICK_CATEGORIES.some((q) => q.id === c.id)).map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Lọc nhanh tầm giá & từ khóa phổ biến */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-neutral-500 dark:text-neutral-400">Tầm giá:</span>
            {QUICK_PRICE_RANGES.map((r) => {
              const active = min === r.min && max === r.max;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => applyPriceRange(r.min, r.max)}
                  className={`rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                    active
                      ? 'border-blue-700 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
          {!q && (
            <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
              <span className="text-neutral-400 dark:text-neutral-600">|</span>
              <span className="text-neutral-500 dark:text-neutral-400">Tìm nhanh:</span>
              {POPULAR_KEYWORDS.map((kw) => (
                <button
                  key={kw}
                  type="button"
                  onClick={() => {
                    setSearchText(kw);
                    setParam('q', kw);
                  }}
                  className="rounded-md px-1.5 py-0.5 text-xs text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                >
                  {kw}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Bộ lọc mở rộng (tình trạng, hộp, khoảng giá) */}
        {showMoreFilters && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-4">
            <select className="input h-9 text-xs" value={condition} onChange={(e) => setParam('condition', e.target.value)} aria-label="Tình trạng">
              <option value="">Mọi tình trạng</option>
              {LISTING_CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <select className="input h-9 text-xs" value={box} onChange={(e) => setParam('box', e.target.value)} aria-label="Hộp & phụ kiện">
              <option value="">Mọi hộp / phụ kiện</option>
              {BOX_STATUS_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            <input
              className="input h-9 text-xs tabular-nums"
              inputMode="numeric"
              placeholder="Giá từ (₫)"
              value={minText ? new Intl.NumberFormat('vi-VN').format(parseInt(minText, 10)) : ''}
              onChange={(e) => setMinText(digitsOnly(e.target.value))}
              aria-label="Giá tối thiểu"
            />
            <input
              className="input h-9 text-xs tabular-nums"
              inputMode="numeric"
              placeholder="Giá đến (₫)"
              value={maxText ? new Intl.NumberFormat('vi-VN').format(parseInt(maxText, 10)) : ''}
              onChange={(e) => setMaxText(digitsOnly(e.target.value))}
              aria-label="Giá tối đa"
            />
          </div>
        )}
      </section>

      {/* Thanh theo dõi từ khóa nhanh khi người dùng đang tìm kiếm */}
      {q.trim().length >= 2 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200/80 bg-blue-50/70 px-3.5 py-2 text-xs dark:border-blue-900/60 dark:bg-blue-950/30">
          <span className="text-neutral-700 dark:text-neutral-200">
            Muốn nhận thông báo tự động khi có tin mới khớp{' '}
            <strong className="font-semibold">&ldquo;{q.trim()}&rdquo;</strong>?
          </span>
          {(() => {
            const currentKey = `${q.trim()}|${category}|${province}|${max}`;
            const savedHere = alertState?.key === currentKey && alertState.status === 'saved';
            const savingHere = alertState?.key === currentKey && alertState.status === 'saving';
            const errorHere = alertState?.key === currentKey && alertState.status === 'error';

            if (savedHere) {
              return (
                <Link
                  to="/alerts"
                  className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                >
                  <Check size={13} /> Đã lưu từ khóa · Quản lý
                </Link>
              );
            }

            return (
              <div className="flex items-center gap-2">
                {errorHere && alertState?.msg && (
                  <span className="text-red-600 dark:text-red-400">{alertState.msg}</span>
                )}
                <button
                  type="button"
                  disabled={savingHere}
                  onClick={async () => {
                    if (!user) {
                      void signIn();
                      return;
                    }
                    setAlertState({ key: currentKey, status: 'saving' });
                    try {
                      await createSavedSearch({
                        keyword: q.trim(),
                        category: category || undefined,
                        province: province || undefined,
                        maxPrice: parsePositiveInt(max),
                      });
                      setAlertState({ key: currentKey, status: 'saved' });
                    } catch (err) {
                      setAlertState({
                        key: currentKey,
                        status: 'error',
                        msg: getErrorMessage(err),
                      });
                    }
                  }}
                  className="btn-secondary h-7 px-2.5 text-xs font-medium"
                >
                  {savingHere ? <Loader2 size={12} className="animate-spin" /> : <Bell size={12} />}
                  {user ? 'Theo dõi từ khóa này' : 'Đăng nhập để theo dõi'}
                </button>
              </div>
            );
          })()}
        </div>
      )}

      {/* Danh sách sản phẩm */}
      <section aria-label="Danh sách sản phẩm đang bán">
        {loading ? (
          <ListingGridSkeleton count={8} />
        ) : error ? (
          <Alert kind="error">{error}</Alert>
        ) : items.length === 0 ? (
          <div className="card px-4 py-12 text-center text-sm text-neutral-600 dark:text-neutral-400">
            {q || activeFilters ? 'Không tìm thấy sản phẩm phù hợp.' : 'Chưa có sản phẩm nào đang bán.'}
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((l) => (
                <ListingCard key={l.id} listing={l} feeBp={feeBp} feeCapVnd={feeCapVnd} />
              ))}
            </ul>

            {items.length < total && (
              <div className="mt-6 flex justify-center">
                <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore && <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />}
                  Xem thêm ({total - items.length} sản phẩm)
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function ListingCard({ listing: l, feeBp, feeCapVnd }: { listing: ListingCardItem; feeBp: number; feeCapVnd: number }) {
  const isMod = l.profiles?.is_mod ?? false;
  const { isSaved, toggleSave } = useSavedListings();
  const saved = isSaved(l.id);
  const dp = getDisplayPrice(l, { isMod, globalBp: feeBp, feeCapVnd });
  const condTag = l.box_status === 'full' ? `${SHORT_CONDITION[l.condition] ?? l.condition} · Đủ hộp` : (SHORT_CONDITION[l.condition] ?? l.condition);
  const feeSubline = 'Miễn phí 0%';

  return (
    <li className="min-w-0">
      <Link
        to={`/listing/${l.id}`}
        className="card group flex h-full flex-col overflow-hidden transition-colors hover:border-neutral-400 dark:hover:border-neutral-600"
      >
        {/* Khung ảnh 4:3 tràn viền trên */}
        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
          {l.images[0] && (
            <img
              src={cldUrl(l.images[0].url, { width: 520, height: 390, crop: 'fill' })}
              alt={l.title}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          )}
          <span className="absolute left-2 top-2 max-w-[calc(100%-3rem)] truncate rounded bg-neutral-950/75 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-[2px]">
            {condTag}
          </span>
          <button
            type="button"
            aria-label={saved ? 'Bỏ lưu tin' : 'Lưu tin'}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void toggleSave(l.id);
            }}
            className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
              saved
                ? 'border-blue-600 bg-blue-600 text-white'
                : 'border-white/30 bg-neutral-950/65 text-white hover:bg-neutral-950/85'
            }`}
          >
            <Bookmark size={14} strokeWidth={1.9} className={saved ? 'fill-current' : ''} />
          </button>
        </div>

        {/* Thân thẻ 4 tầng thông tin: luôn căn thẳng hàng ngang nhau */}
        <div className="flex flex-1 flex-col p-2.5 sm:p-3">
          {/* Tầng 1: Khóa cứng chiều cao 2 dòng */}
          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-neutral-950 dark:text-neutral-100">
            {l.title}
          </p>

          {/* Tầng 2: Giá bán + dòng phụ phí */}
          <div className="mt-1.5">
            <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 tabular-nums">
              <span className="text-sm font-semibold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-base">
                {formatVND(dp.display)}
              </span>
              {dp.strike && (
                <span className="text-[11px] text-neutral-400 line-through dark:text-neutral-500 sm:text-xs">
                  {formatVND(dp.strike)}
                </span>
              )}
              {dp.percent > 0 && (
                <span className="rounded bg-red-600 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
                  −{dp.percent}%
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">{feeSubline}</p>
          </div>

          {/* Tầng 3: 2 dòng xác thực gọn gàng, không tụt hay cắt chữ trên mobile */}
          <div className="mt-2 space-y-0.5 pb-2.5 text-[11px] font-medium leading-tight text-emerald-700 dark:text-emerald-400 sm:text-xs">
            <div className="flex items-center gap-1 min-w-0">
              <Check size={12} strokeWidth={2.25} className="shrink-0" />
              <span className="truncate">Đã đối chiếu FB &amp; NH</span>
            </div>
            {l.verification_image_url && (
              <div className="flex items-center gap-1 min-w-0">
                <Check size={12} strokeWidth={2.25} className="shrink-0" />
                <span className="truncate">Ảnh viết tay</span>
              </div>
            )}
          </div>

          {/* Tầng 4: Chân thẻ đẩy sát đáy bằng mt-auto */}
          <div className="mt-auto flex items-center justify-between gap-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-500 dark:border-neutral-800 dark:text-neutral-400 sm:text-xs">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 truncate font-medium text-neutral-700 dark:text-neutral-300">
                {l.profiles?.display_name ?? 'Thành viên VAHA'}
              </span>
              <RatingSummaryBadge
                avg={l.profiles?.seller_rating_avg}
                count={l.profiles?.seller_rating_count}
                compact
              />
            </div>
            <span className="max-w-[40%] shrink-0 truncate text-right">{l.province ?? 'Toàn quốc'}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
