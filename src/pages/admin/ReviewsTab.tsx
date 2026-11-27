import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Search, Star } from 'lucide-react';
import { listAdminReviews, toggleReviewVisibility } from '@/lib/admin';
import { getReviewTagLabel } from '@/lib/reviews';
import { getErrorMessage } from '@/lib/errors';
import { StarRow } from '@/components/StarRating';
import { Alert, Avatar, PageLoader } from '@/components/ui';
import type { AdminReviewFilter, AdminReviewItem } from '@/types';

const PAGE = 30;

const FILTERS: { id: AdminReviewFilter; label: string; countKey: 'all' | 'visible' | 'hidden' | 'low_rating' }[] = [
  { id: 'ALL', label: 'Tất cả', countKey: 'all' },
  { id: 'VISIBLE', label: 'Đang hiển thị', countKey: 'visible' },
  { id: 'HIDDEN', label: 'Đã ẩn', countKey: 'hidden' },
  { id: 'LOW_RATING', label: '1–2 sao', countKey: 'low_rating' },
];

export default function ReviewsTab({
  onChanged,
  onInspectMember,
  refreshSignal = 0,
}: {
  onChanged: () => void;
  onInspectMember?: (userId: string) => void;
  refreshSignal?: number;
}) {
  const [filter, setFilter] = useState<AdminReviewFilter>('ALL');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<AdminReviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ all: 0, visible: 0, hidden: 0, low_rating: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [hideTarget, setHideTarget] = useState<AdminReviewItem | null>(null);
  const [hideReason, setHideReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminReviews({
        filter,
        search: debounced,
        limit: PAGE,
        offset: 0,
      });
      setItems(res.items);
      setTotal(res.total);
      setCounts(res.counts);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [filter, debounced]);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await listAdminReviews({
        filter,
        search: debounced,
        limit: PAGE,
        offset: items.length,
      });
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
      setCounts(res.counts);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleHideConfirm = async (item: AdminReviewItem) => {
    const reason = hideReason.trim();
    if (reason.length < 2) {
      setError('Vui lòng nhập lý do ẩn đánh giá (tối thiểu 2 ký tự).');
      return;
    }
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await toggleReviewVisibility(item.id, true, reason);
      setHideTarget(null);
      setHideReason('');
      setNotice('Đã ẩn đánh giá và ghi nhật ký.');
      await load();
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleShow = async (item: AdminReviewItem) => {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await toggleReviewVisibility(item.id, false);
      setNotice('Đã hiển thị lại đánh giá.');
      await load();
      onChanged();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const count = counts[f.countKey];
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                    : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                {f.label}
                <span className="rounded-full bg-neutral-200/80 px-1.5 text-[10px] font-semibold tabular-nums text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm nhận xét, tên thành viên, mã đơn..."
            className="input h-9 pl-9 text-xs"
          />
        </div>
      </div>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Star className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Không có đánh giá nào khớp bộ lọc.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const isBusy = busyId === item.id;
            const hidingThis = hideTarget?.id === item.id;

            return (
              <div
                key={item.id}
                className={`card space-y-3 p-4 ${
                  item.is_hidden ? 'border-amber-300/80 bg-amber-50/30 dark:border-amber-900/60 dark:bg-amber-950/10' : ''
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StarRow rating={item.rating} size={14} />
                      <span className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] font-medium text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {item.reviewer_role === 'BUYER' ? 'Người mua đánh giá' : 'Người bán đánh giá'}
                      </span>
                      {item.is_hidden && (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          Đã ẩn khỏi công khai
                        </span>
                      )}
                      <span className="text-xs text-neutral-400">
                        {new Date(item.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
                      <Avatar name={item.reviewer.display_name} url={item.reviewer.avatar_url} size={20} />
                      {onInspectMember ? (
                        <button
                          type="button"
                          onClick={() => onInspectMember(item.reviewer.id)}
                          className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                        >
                          {item.reviewer.display_name}
                        </button>
                      ) : (
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {item.reviewer.display_name}
                        </span>
                      )}
                      <span>đánh giá</span>
                      {onInspectMember ? (
                        <button
                          type="button"
                          onClick={() => onInspectMember(item.reviewee.id)}
                          className="font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                        >
                          {item.reviewee.display_name}
                        </button>
                      ) : (
                        <span className="font-medium text-neutral-900 dark:text-neutral-100">
                          {item.reviewee.display_name}
                        </span>
                      )}
                      <span>·</span>
                      <Link
                        to={`/orders/${item.order_id}`}
                        className="font-mono text-blue-700 hover:underline dark:text-blue-400"
                      >
                        {item.payment_code}
                      </Link>
                    </div>

                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Sản phẩm:{' '}
                      {item.listing_id ? (
                        <Link
                          to={`/listing/${item.listing_id}`}
                          className="font-medium text-neutral-700 hover:underline dark:text-neutral-300"
                        >
                          {item.listing_title_snapshot}
                        </Link>
                      ) : (
                        <span>{item.listing_title_snapshot}</span>
                      )}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {item.is_hidden ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleShow(item)}
                        className="btn-secondary h-8 px-3 text-xs"
                      >
                        {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye size={13} />}
                        Hiện lại
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                          setHideTarget(hidingThis ? null : item);
                          setHideReason('');
                        }}
                        className="btn-secondary h-8 px-3 text-xs"
                      >
                        <EyeOff size={13} /> Ẩn đánh giá
                      </button>
                    )}
                  </div>
                </div>

                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((code) => (
                      <span
                        key={code}
                        className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {getReviewTagLabel(code)}
                      </span>
                    ))}
                  </div>
                )}

                {item.comment && (
                  <p className="whitespace-pre-line text-sm text-neutral-800 dark:text-neutral-200">
                    {item.comment}
                  </p>
                )}

                {item.reply_text && (
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      Phản hồi từ {item.reviewee.display_name}:{' '}
                    </span>
                    <span className="text-neutral-600 dark:text-neutral-400">{item.reply_text}</span>
                  </div>
                )}

                {item.is_hidden && item.hidden_reason && (
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Lý do đã ẩn: {item.hidden_reason}
                  </p>
                )}

                {hidingThis && (
                  <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900">
                    <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      Lý do ẩn đánh giá (lưu trong nhật ký quản trị)
                    </label>
                    <input
                      type="text"
                      value={hideReason}
                      onChange={(e) => setHideReason(e.target.value)}
                      placeholder="Ví dụ: Ngôn từ xúc phạm, spam hoặc dẫn dụ ngoài sàn..."
                      className="input h-9 text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void handleHideConfirm(item)}
                        className="btn-primary h-8 px-3 text-xs"
                      >
                        {isBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                        Xác nhận ẩn
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => setHideTarget(null)}
                        className="btn-secondary h-8 px-3 text-xs"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {items.length < total && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="btn-secondary h-9 px-4 text-xs"
              >
                {loadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Xem thêm ({items.length}/{total})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
