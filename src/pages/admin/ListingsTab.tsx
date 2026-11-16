import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Search, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { updateListingPrice } from '@/lib/admin';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import ModBadge from '@/components/ModBadge';
import PriceTag from '@/components/PriceTag';
import { Alert, PageLoader } from '@/components/ui';
import type { Listing, ListingStatus, Profile } from '@/types';

const PAGE = 30;
const EDITABLE: ListingStatus[] = ['draft', 'active', 'hidden'];
const STATUS_LABEL: Record<ListingStatus, string> = {
  active: 'Đang bán', draft: 'Nháp', hidden: 'Ẩn', reserved: 'Giữ chỗ', sold: 'Đã bán', removed: 'Đã gỡ',
};
const MIN = 10_000;
const MAX = 1_000_000_000;
const fmt = (t: string) => (t ? new Intl.NumberFormat('vi-VN').format(parseInt(t, 10)) : '');

export default function ListingsTab() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<string>('active');
  const [items, setItems] = useState<Listing[]>([]);
  const [sellers, setSellers] = useState<Record<string, Profile>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    (offset: number) => {
      let q = supabase.from('listings').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      if (debounced) q = q.ilike('title', `%${debounced.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      return q.range(offset, offset + PAGE - 1);
    },
    [status, debounced],
  );

  const loadSellers = async (list: Listing[]) => {
    const ids = Array.from(new Set(list.map((l) => l.seller_id)));
    if (ids.length === 0) return;
    const { data } = await supabase.from('profiles').select('*').in('id', ids);
    setSellers((prev) => ({ ...prev, ...Object.fromEntries(((data ?? []) as Profile[]).map((p) => [p.id, p])) }));
  };

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPage(0).then(async ({ data, count, error: err }) => {
      if (!alive) return;
      if (err) setError(getErrorMessage(err));
      else {
        const list = (data ?? []) as Listing[];
        setItems(list);
        setTotal(count ?? 0);
        setError(null);
        await loadSellers(list);
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data, error: err } = await fetchPage(items.length);
    if (err) setError(getErrorMessage(err));
    else {
      const list = (data ?? []) as Listing[];
      setItems((prev) => [...prev, ...list]);
      await loadSellers(list);
    }
    setLoadingMore(false);
  };

  const replaceItem = (l: Listing) => setItems((prev) => prev.map((x) => (x.id === l.id ? l : x)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Chỉnh trực tiếp giá bán và giá gốc để chạy deal nhanh mà không cần người bán sửa tay. Giá gốc phải lớn hơn giá bán; để trống để bỏ giảm giá.</p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Tìm theo tên sản phẩm" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm tin đăng" />
        </div>
        <select className="input sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          {(Object.keys(STATUS_LABEL) as ListingStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Tag className="h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-600">Không có tin đăng nào.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-slate-500">{total} tin đăng</p>
          <ul className="space-y-3">
            {items.map((l) => <ListingRow key={l.id} listing={l} seller={sellers[l.seller_id]} onSaved={replaceItem} />)}
          </ul>
          {items.length < total && (
            <div className="flex justify-center">
              <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Xem thêm
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ListingRow({ listing, seller, onSaved }: { listing: Listing; seller?: Profile; onSaved: (l: Listing) => void }) {
  const [priceText, setPriceText] = useState(String(listing.price));
  const [origText, setOrigText] = useState(listing.original_price ? String(listing.original_price) : '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Đồng bộ khi dữ liệu từ server đổi (sau khi lưu)
  useEffect(() => {
    setPriceText(String(listing.price));
    setOrigText(listing.original_price ? String(listing.original_price) : '');
  }, [listing.price, listing.original_price]);

  const editable = EDITABLE.includes(listing.status);
  const price = priceText ? parseInt(priceText, 10) : 0;
  const orig = origText ? parseInt(origText, 10) : null;
  const priceOk = price >= MIN && price <= MAX;
  const origOk = orig === null || (orig > price && orig <= MAX);
  const dirty = price !== listing.price || orig !== listing.original_price;

  const save = async (nextOrig: number | null) => {
    setBusy(true);
    setMsg(null);
    try {
      const updated = await updateListingPrice(listing.id, price, nextOrig);
      onSaved(updated);
      setMsg({ kind: 'success', text: 'Đã lưu giá.' });
    } catch (e) {
      setMsg({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card p-4">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {listing.images[0] && <img src={cldUrl(listing.images[0].url, { width: 160, height: 160, crop: 'fill' })} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-slate-900">{listing.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>{seller?.display_name ?? '—'}</span>
            {seller?.is_mod && <ModBadge />}
            <span className="badge">{STATUS_LABEL[listing.status]}</span>
            <Link to={`/listing/${listing.id}`} className="text-brand-700 hover:underline">Xem tin</Link>
          </p>
          <div className="mt-1"><PriceTag price={listing.price} originalPrice={listing.original_price} /></div>
        </div>
      </div>

      {editable ? (
        <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">Giá bán (đ)
              <input className="input mt-1 text-right font-mono" inputMode="numeric" value={fmt(priceText)} onChange={(e) => setPriceText(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </label>
            <label className="text-xs font-medium text-slate-600">Giá gốc (đ) — trống = không giảm giá
              <input className="input mt-1 text-right font-mono" inputMode="numeric" value={fmt(origText)} onChange={(e) => setOrigText(e.target.value.replace(/\D/g, '').slice(0, 10))} />
            </label>
          </div>
          {!priceOk && <p className="text-xs text-red-600">Giá bán từ {formatVND(MIN)} đến {formatVND(MAX)}.</p>}
          {priceOk && !origOk && <p className="text-xs text-red-600">Giá gốc phải lớn hơn giá bán.</p>}
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            {listing.original_price !== null && (
              <button type="button" className="btn-ghost" disabled={busy || !priceOk} onClick={() => { setOrigText(''); void save(null); }}>Bỏ giảm giá</button>
            )}
            <button type="button" className="btn-primary" disabled={busy || !dirty || !priceOk || !origOk} onClick={() => void save(orig)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Lưu giá
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">Tin đang {STATUS_LABEL[listing.status].toLowerCase()} nên không chỉnh giá được.</p>
      )}
    </li>
  );
}
