import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Headphones, Loader2, MapPin, Search, SlidersHorizontal, Truck, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { getErrorMessage } from '@/lib/errors';
import { BOX_STATUS_OPTIONS, CATEGORIES, LISTING_CONDITIONS, getBoxStatusLabel, getCategory, getConditionLabel } from '@/constants/categories';
import { PROVINCES } from '@/constants/provinces';
import { Alert } from '@/components/ui';
import PriceTag from '@/components/PriceTag';
import type { Listing } from '@/types';

type ListingCard = Pick<Listing, 'id' | 'title' | 'price' | 'original_price' | 'condition' | 'category' | 'province' | 'ship_cod' | 'box_status' | 'images'>;

const PAGE_SIZE = 24;
const COLUMNS = 'id,title,price,original_price,condition,category,province,ship_cod,box_status,images';

type SortKey = 'new' | 'price_asc' | 'price_desc';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'new', label: 'Mới nhất' },
  { id: 'price_asc', label: 'Giá tăng dần' },
  { id: 'price_desc', label: 'Giá giảm dần' },
];

/** Escape ký tự đặc biệt của LIKE để người dùng gõ % hoặc _ không bị hiểu sai. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
const digitsOnly = (s: string) => s.replace(/\D/g, '').slice(0, 10);

export default function Home() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const category = params.get('category') ?? '';
  const province = params.get('province') ?? '';
  const condition = params.get('condition') ?? '';
  const box = params.get('box') ?? '';
  const min = params.get('min') ?? '';
  const max = params.get('max') ?? '';
  const sort = (params.get('sort') as SortKey | null) ?? 'new';

  // Ô nhập có debounce để không gọi API mỗi phím bấm
  const [searchText, setSearchText] = useState(q);
  const [minText, setMinText] = useState(min);
  const [maxText, setMaxText] = useState(max);
  const [showFilters, setShowFilters] = useState(false);

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

  const [items, setItems] = useState<ListingCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchPage = useCallback(
    async (offset: number) => {
      let query = supabase
        .from('listings')
        .select(COLUMNS, { count: 'exact' })
        .eq('status', 'active'); // bắt buộc: RLS không tự lọc, query phải khớp policy

      if (q) query = query.ilike('title', `%${escapeLike(q)}%`);
      if (category) query = query.eq('category', category);
      if (province) query = query.eq('province', province);
      if (condition) query = query.eq('condition', condition);
      if (box) query = query.eq('box_status', box);
      if (min) query = query.gte('price', parseInt(min, 10));
      if (max) query = query.lte('price', parseInt(max, 10));

      if (sort === 'price_asc') query = query.order('price', { ascending: true });
      else if (sort === 'price_desc') query = query.order('price', { ascending: false });
      else query = query.order('created_at', { ascending: false });

      return query.range(offset, offset + PAGE_SIZE - 1);
    },
    [q, category, province, condition, box, min, max, sort],
  );

  // Tải lại từ đầu khi bộ lọc đổi
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    fetchPage(0).then(({ data, count, error: err }) => {
      if (id !== requestId.current) return; // bỏ kết quả cũ
      if (err) setError(getErrorMessage(err));
      else {
        setItems((data ?? []) as ListingCard[]);
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
    else setItems((prev) => [...prev, ...((data ?? []) as ListingCard[])]);
    setLoadingMore(false);
  };

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

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">VAHA Market</h1>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Vietnamese Association of Headphone Addicts Market</p>
        <p className="mt-1.5 max-w-xl text-sm text-slate-600 sm:text-base">
          Mua bán đồ âm thanh second-hand có trung gian giữ tiền — an tâm cho cả người mua lẫn người bán.
        </p>

        <div className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              className="input pl-9"
              placeholder="Tìm theo tên sản phẩm: HD650, Moondrop, DAC..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              aria-label="Tìm kiếm sản phẩm"
            />
          </div>
          <button type="button" className="btn-secondary md:hidden" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <SlidersHorizontal className="h-4 w-4" /> Lọc{activeFilters > 0 && ` (${activeFilters})`}
          </button>
        </div>

        <div className={`${showFilters ? 'grid' : 'hidden'} mt-3 grid-cols-2 gap-2 md:grid md:grid-cols-4`}>
          <select className="input" value={category} onChange={(e) => setParam('category', e.target.value)} aria-label="Phân loại">
            <option value="">Mọi phân loại</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="input" value={province} onChange={(e) => setParam('province', e.target.value)} aria-label="Tỉnh/Thành phố">
            <option value="">Mọi khu vực</option>
            {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="input" value={condition} onChange={(e) => setParam('condition', e.target.value)} aria-label="Tình trạng ngoại hình">
            <option value="">Mọi tình trạng</option>
            {LISTING_CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="input" value={box} onChange={(e) => setParam('box', e.target.value)} aria-label="Hộp & phụ kiện">
            <option value="">Mọi hộp/phụ kiện</option>
            {BOX_STATUS_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <input className="input" inputMode="numeric" placeholder="Giá từ (đ)" value={minText ? new Intl.NumberFormat('vi-VN').format(parseInt(minText, 10)) : ''} onChange={(e) => setMinText(digitsOnly(e.target.value))} aria-label="Giá tối thiểu" />
          <input className="input" inputMode="numeric" placeholder="Giá đến (đ)" value={maxText ? new Intl.NumberFormat('vi-VN').format(parseInt(maxText, 10)) : ''} onChange={(e) => setMaxText(digitsOnly(e.target.value))} aria-label="Giá tối đa" />
          <select className="input" value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="Sắp xếp">
            {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {activeFilters > 0 && (
            <button type="button" className="btn-ghost" onClick={clearFilters}><X className="h-4 w-4" /> Xóa bộ lọc</button>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">{q || activeFilters ? 'Kết quả' : 'Tin mới đăng'}</h2>
          {!loading && !error && <span className="text-sm text-slate-500">{total} sản phẩm</span>}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
        ) : error ? (
          <Alert kind="error">{error}</Alert>
        ) : items.length === 0 ? (
          <div className="card flex flex-col items-center px-4 py-12 text-center">
            <Headphones className="h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm text-slate-600">{q || activeFilters ? 'Không có sản phẩm nào khớp bộ lọc.' : 'Chưa có tin nào. Hãy là người đăng bán đầu tiên!'}</p>
          </div>
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
              {items.map((l) => (
                <li key={l.id}>
                  <Link to={`/listing/${l.id}`} className="card block h-full overflow-hidden transition-shadow hover:shadow-pop">
                    <div className="aspect-square bg-slate-100">
                      {l.images[0] && (
                        <img src={cldUrl(l.images[0].url, { width: 480, height: 480, crop: 'fill' })} alt={l.title} loading="lazy" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <p className="line-clamp-2 text-sm font-medium text-slate-900">{l.title}</p>
                      <PriceTag price={l.price} originalPrice={l.original_price} />
                      <p className="text-xs text-slate-500">{getCategory(l.category)?.label ?? l.category} · {getConditionLabel(l.condition)}</p>
                      <p className="text-xs text-slate-500">{getBoxStatusLabel(l.box_status)}</p>
                      <p className="flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                        {l.province && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{l.province}</span>}
                        {l.ship_cod && <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" />Ship COD</span>}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {items.length < total && (
              <div className="mt-6 flex justify-center">
                <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Xem thêm
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
