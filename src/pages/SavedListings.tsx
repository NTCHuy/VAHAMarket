import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, Loader2, TrendingDown } from 'lucide-react';
import { getMySavedListings } from '@/lib/community';
import { useSavedListings } from '@/context/SavedListingsContext';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { getConditionLabel } from '@/constants/categories';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Alert } from '@/components/ui';
import { ListRowsSkeleton } from '@/components/Skeletons';
import type { ListingStatus, SavedListingItem } from '@/types';

const STATUS_BADGE: Partial<Record<ListingStatus, string>> = {
  reserved: 'Đang giữ chỗ',
  sold: 'Đã bán',
  hidden: 'Người bán tạm ẩn',
  removed: 'Đã gỡ',
  rejected: 'Không khả dụng',
};

export default function SavedListings() {
  useDocumentTitle('Tin đã lưu');
  const { toggleSave } = useSavedListings();
  const [items, setItems] = useState<SavedListingItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'dropped'>('all');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await getMySavedListings());
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (filter === 'active') return items.filter((i) => i.listing.status === 'active');
    if (filter === 'dropped') return items.filter((i) => i.price_drop > 0 && i.listing.status === 'active');
    return items;
  }, [items, filter]);

  const droppedCount = useMemo(
    () => items.filter((i) => i.price_drop > 0 && i.listing.status === 'active').length,
    [items],
  );

  const handleUnsave = async (listingId: string) => {
    setBusyId(listingId);
    const saved = await toggleSave(listingId);
    if (!saved) {
      setItems((prev) => prev.filter((x) => x.listing_id !== listingId));
    }
    setBusyId(null);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tin đã lưu</h1>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            Theo dõi giá các sản phẩm bạn quan tâm (tối đa 100 tin).
          </p>
        </div>
        <Link to="/" className="btn-secondary text-xs">
          Khám phá thêm
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'all', label: `Tất cả (${items.length})` },
            { id: 'active', label: `Đang mở bán (${items.filter((i) => i.listing.status === 'active').length})` },
            { id: 'dropped', label: `Đang giảm giá (${droppedCount})` },
          ] as const
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.id
                ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <ListRowsSkeleton count={4} />
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Bookmark className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {items.length === 0 ? 'Bạn chưa lưu tin đăng nào.' : 'Không có tin nào trong mục lọc này.'}
          </p>
          <Link to="/" className="btn-primary mt-4 text-xs">
            Xem sản phẩm đang bán
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => {
            const l = item.listing;
            const inactiveLabel = l.status !== 'active' ? (STATUS_BADGE[l.status] ?? 'Không khả dụng') : null;
            return (
              <li key={item.listing_id} className="card flex gap-3 p-3 sm:gap-4 sm:p-4">
                <Link
                  to={`/listing/${l.id}`}
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800 sm:h-24 sm:w-24"
                >
                  {l.images[0]?.url && (
                    <img
                      src={cldUrl(l.images[0].url, { width: 220, height: 220, crop: 'fill' })}
                      alt={l.title}
                      className="h-full w-full object-cover"
                    />
                  )}
                </Link>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Link
                      to={`/listing/${l.id}`}
                      className="line-clamp-2 text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                    >
                      {l.title}
                    </Link>
                  </div>

                  <div className="flex flex-wrap items-baseline gap-2 tabular-nums">
                    <span className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
                      {formatVND(l.price)}
                    </span>
                    {item.price_drop > 0 && (
                      <>
                        <span className="text-xs text-neutral-400 line-through dark:text-neutral-500">
                          {formatVND(item.saved_price)}
                        </span>
                        <span className="badge gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                          <TrendingDown size={12} /> Giảm {formatVND(item.price_drop)}
                        </span>
                      </>
                    )}
                    {inactiveLabel && (
                      <span className="badge bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                        {inactiveLabel}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {item.seller ? (
                      <Link to={`/u/${item.seller.id}`} className="font-medium hover:underline">
                        {item.seller.display_name}
                      </Link>
                    ) : (
                      'Thành viên'
                    )}{' '}
                    · {getConditionLabel(l.condition)} · {l.province ?? 'Toàn quốc'}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Link to={`/listing/${l.id}`} className="btn-secondary px-3 py-1 text-xs">
                      Xem tin
                    </Link>
                    <button
                      type="button"
                      disabled={busyId === item.listing_id}
                      onClick={() => void handleUnsave(item.listing_id)}
                      className="btn-ghost px-2.5 py-1 text-xs text-neutral-600 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
                    >
                      {busyId === item.listing_id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Bookmark className="h-3.5 w-3.5" />
                      )}
                      Bỏ lưu
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
