import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, Check, Eye, Loader2, RotateCcw, Search, Tag, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { restoreListing, updateListingPrice } from '@/lib/admin';
import { cldUrl } from '@/lib/cloudinary';
import { discountPercent, formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import ModBadge from '@/components/ModBadge';
import PriceTag from '@/components/PriceTag';
import { Alert, PageLoader } from '@/components/ui';
import ListingModerationModal from './ListingModerationModal';
import type { Listing, ListingStatus, Profile } from '@/types';

const PAGE = 30;
const EDITABLE: ListingStatus[] = ['draft', 'active', 'hidden'];
const STATUS_LABEL: Record<ListingStatus, string> = {
  active: 'Đang bán',
  draft: 'Nháp',
  pending_review: 'Chờ duyệt',
  rejected: 'Bị từ chối',
  hidden: 'Ẩn',
  reserved: 'Giữ chỗ',
  sold: 'Đã bán',
  removed: 'Đã gỡ',
};
const MIN = 10_000;
const MAX = 1_000_000_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fmt = (t: string) => (t ? new Intl.NumberFormat('vi-VN').format(parseInt(t, 10)) : '');

export default function ListingsTab({
  onChanged,
  onInspectMember,
  refreshSignal = 0,
}: {
  onChanged?: () => void;
  onInspectMember?: (userId: string) => void;
  refreshSignal?: number;
}) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<string>('active');
  const [items, setItems] = useState<Listing[]>([]);
  const [sellers, setSellers] = useState<Record<string, Profile>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<{ mode: 'remove' | 'delete'; listing: Listing } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const fetchPage = useCallback(
    (offset: number) => {
      let q = supabase.from('listings').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (status) q = q.eq('status', status);
      if (debounced) {
        if (UUID_RE.test(debounced)) {
          q = q.eq('id', debounced);
        } else {
          const safe = debounced.replace(/[,()]/g, ' ').trim();
          if (safe) {
            const esc = safe.replace(/[\\%_]/g, (c) => `\\${c}`);
            q = q.or(`title.ilike.%${esc}%,brand.ilike.%${esc}%`);
          }
        }
      }
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
  }, [fetchPage, refreshSignal]);

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

  const removeItemFromView = (id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Chỉnh nhanh giá bán/giá gốc, xem hồ sơ người bán hoặc gỡ và xóa vĩnh viễn các tin đăng vi phạm (kể cả tin đã duyệt).
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            className="input pl-9"
            placeholder="Tìm theo tên sản phẩm, thương hiệu hoặc UUID tin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm tin đăng"
          />
        </div>
        <select className="input sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Lọc trạng thái">
          <option value="">Mọi trạng thái</option>
          {(Object.keys(STATUS_LABEL) as ListingStatus[]).map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </select>
      </div>

      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Tag className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Không có tin đăng nào.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{total} tin đăng</p>
          <ul className="space-y-3">
            {items.map((l) => (
              <ListingRow
                key={l.id}
                listing={l}
                seller={sellers[l.seller_id]}
                onSaved={replaceItem}
                onRestored={(updated) => {
                  if (status && updated.status !== status) {
                    removeItemFromView(updated.id);
                  } else {
                    replaceItem(updated);
                  }
                  setNotice('Đã khôi phục tin đăng về trạng thái Ẩn.');
                  onChanged?.();
                }}
                onInspectSeller={onInspectMember}
                onOpenModeration={(mode) => setModal({ mode, listing: l })}
              />
            ))}
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

      {modal && (
        <ListingModerationModal
          mode={modal.mode}
          listing={modal.listing}
          sellerName={sellers[modal.listing.seller_id]?.display_name}
          sellerIsBanned={sellers[modal.listing.seller_id]?.is_banned}
          sellerWarningCount={sellers[modal.listing.seller_id]?.warning_count}
          onClose={() => setModal(null)}
          onDone={(res) => {
            const target = modal.listing;
            const mode = modal.mode;
            setModal(null);
            if (mode === 'delete') {
              removeItemFromView(target.id);
            } else if (res.listing) {
              if (status && res.listing.status !== status) {
                removeItemFromView(target.id);
              } else {
                replaceItem(res.listing);
              }
            }
            const warnNote = res.warning
              ? res.warning.auto_banned
                ? ` Đồng thời đã khóa vĩnh viễn người bán (${res.warning.warning_count}/3 cảnh báo).`
                : ` Đồng thời đã gửi cảnh báo ${res.warning.warning_count}/3.`
              : '';
            setNotice((mode === 'delete' ? `Đã xóa vĩnh viễn tin "${target.title}".` : `Đã gỡ tin "${target.title}".`) + warnNote);
            onChanged?.();
          }}
        />
      )}
    </div>
  );
}

function ListingRow({
  listing,
  seller,
  onSaved,
  onRestored,
  onInspectSeller,
  onOpenModeration,
}: {
  listing: Listing;
  seller?: Profile;
  onSaved: (l: Listing) => void;
  onRestored: (l: Listing) => void;
  onInspectSeller?: (userId: string) => void;
  onOpenModeration: (mode: 'remove' | 'delete') => void;
}) {
  const [priceText, setPriceText] = useState(String(listing.price));
  const [origText, setOrigText] = useState(listing.original_price ? String(listing.original_price) : '');
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setPriceText(String(listing.price));
    setOrigText(listing.original_price ? String(listing.original_price) : '');
  }, [listing.price, listing.original_price]);

  const editable = EDITABLE.includes(listing.status);
  const lockedByOrder = listing.status === 'reserved' || listing.status === 'sold';
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

  const handleRestore = async () => {
    setRestoring(true);
    setMsg(null);
    try {
      const updated = await restoreListing(listing.id);
      setConfirmRestore(false);
      onRestored(updated);
    } catch (e) {
      setMsg({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <li className="card p-4">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
          {listing.images[0] && (
            <img src={cldUrl(listing.images[0].url, { width: 160, height: 160, crop: 'fill' })} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">{listing.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span>{seller?.display_name ?? '—'}</span>
            {seller?.is_mod && <ModBadge />}
            {onInspectSeller && (
              <button
                type="button"
                onClick={() => onInspectSeller(listing.seller_id)}
                className="inline-flex items-center gap-1 rounded border border-neutral-200 px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 hover:border-brand-500 dark:border-neutral-700 dark:text-neutral-300"
              >
                <Eye className="h-3 w-3" /> Hồ sơ
              </button>
            )}
            <span className="badge">{STATUS_LABEL[listing.status]}</span>
            <Link to={`/listing/${listing.id}`} className="text-brand-700 hover:underline dark:text-brand-400">
              Xem tin
            </Link>
          </p>
          <div className="mt-1">
            <PriceTag display={listing.price} strike={listing.original_price} percent={discountPercent(listing.price, listing.original_price)} />
          </div>
          {listing.moderation_note && (
            <p className="mt-1.5 rounded bg-red-50 px-2.5 py-1 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-300">
              <strong>Lý do gỡ:</strong> {listing.moderation_note}
            </p>
          )}
        </div>
      </div>

      {editable ? (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Giá bán (đ)
              <input
                className="input mt-1 text-right font-mono"
                inputMode="numeric"
                value={fmt(priceText)}
                onChange={(e) => setPriceText(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </label>
            <label className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Giá gốc (đ) — trống = không giảm giá
              <input
                className="input mt-1 text-right font-mono"
                inputMode="numeric"
                value={fmt(origText)}
                onChange={(e) => setOrigText(e.target.value.replace(/\D/g, '').slice(0, 10))}
              />
            </label>
          </div>
          {!priceOk && <p className="text-xs text-red-600 dark:text-red-400">Giá bán từ {formatVND(MIN)} đến {formatVND(MAX)}.</p>}
          {priceOk && !origOk && <p className="text-xs text-red-600 dark:text-red-400">Giá gốc phải lớn hơn giá bán.</p>}
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenModeration('remove')}
                className="btn-secondary px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
              >
                <Ban className="h-3.5 w-3.5" /> Gỡ tin
              </button>
              <button
                type="button"
                onClick={() => onOpenModeration('delete')}
                className="btn-ghost px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
              >
                <Trash2 className="h-3.5 w-3.5" /> Xóa vĩnh viễn
              </button>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {listing.original_price !== null && (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || !priceOk}
                  onClick={() => {
                    setOrigText('');
                    void save(null);
                  }}
                >
                  Bỏ giảm giá
                </button>
              )}
              <button type="button" className="btn-primary" disabled={busy || !dirty || !priceOk || !origOk} onClick={() => void save(orig)}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Lưu giá
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {lockedByOrder
                ? `Tin đang ${STATUS_LABEL[listing.status].toLowerCase()}, không thể chỉnh giá hoặc xóa.`
                : `Tin đang ${STATUS_LABEL[listing.status].toLowerCase()}.`}
            </p>
            {!lockedByOrder && (
              <div className="flex flex-wrap items-center gap-2">
                {listing.status === 'removed' ? (
                  confirmRestore ? (
                    <>
                      <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={restoring} onClick={() => setConfirmRestore(false)}>
                        Hủy
                      </button>
                      <button type="button" className="btn-primary px-2.5 py-1 text-xs" disabled={restoring} onClick={() => void handleRestore()}>
                        {restoring && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Xác nhận khôi phục về Ẩn
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-secondary px-3 py-1.5 text-xs" onClick={() => setConfirmRestore(true)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Khôi phục về Ẩn
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenModeration('remove')}
                    className="btn-secondary px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
                  >
                    <Ban className="h-3.5 w-3.5" /> Gỡ tin
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenModeration('delete')}
                  className="btn-ghost px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Xóa vĩnh viễn
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
