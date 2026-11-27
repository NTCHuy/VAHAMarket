import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Loader2, Search } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import { listMyNotifications, NOTIFICATION_KIND_LABEL } from '@/lib/notifications';
import { getErrorMessage } from '@/lib/errors';
import { Alert, PageLoader } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { NotificationKind, UserNotification } from '@/types';

const PAGE = 30;

const KIND_FILTERS: { id: 'ALL' | NotificationKind; label: string }[] = [
  { id: 'ALL', label: 'Tất cả' },
  { id: 'ORDER', label: 'Đơn hàng' },
  { id: 'OFFER', label: 'Trả giá' },
  { id: 'SAVED_SEARCH', label: 'Săn kèo' },
  { id: 'LISTING', label: 'Tin đăng' },
  { id: 'PRICE_DROP', label: 'Giảm giá' },
  { id: 'REVIEW', label: 'Đánh giá' },
];

export default function Notifications() {
  useDocumentTitle('Thông báo');
  const navigate = useNavigate();
  const { markRead, dbUnreadCount, refreshDbNotifications } = useNotifications();

  const [onlyUnread, setOnlyUnread] = useState(false);
  const [kindFilter, setKindFilter] = useState<'ALL' | NotificationKind>('ALL');
  const [items, setItems] = useState<UserNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listMyNotifications({ limit: PAGE, offset: 0, onlyUnread });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [onlyUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await listMyNotifications({
        limit: PAGE,
        offset: items.length,
        onlyUnread,
      });
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleItems = useMemo(
    () => (kindFilter === 'ALL' ? items : items.filter((n) => n.kind === kindFilter)),
    [items, kindFilter],
  );

  const handleMarkAll = async () => {
    await markRead(null);
    setItems((prev) =>
      onlyUnread ? [] : prev.map((n) => ({ ...n, is_read: true })),
    );
    if (onlyUnread) setTotal(0);
    await refreshDbNotifications();
  };

  const handleOpenItem = async (item: UserNotification) => {
    if (!item.is_read) {
      void markRead(item.id);
      setItems((prev) =>
        onlyUnread
          ? prev.filter((x) => x.id !== item.id)
          : prev.map((x) => (x.id === item.id ? { ...x, is_read: true } : x)),
      );
    }
    if (item.href) navigate(item.href);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Thông báo</h1>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            Lưu toàn bộ cập nhật đơn hàng, trả giá, đánh giá và từ khóa săn kèo của bạn.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/alerts" className="btn-secondary h-9 px-3 text-xs">
            <Search size={14} /> Từ khóa săn kèo
          </Link>
          {dbUnreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAll()}
              className="btn-primary h-9 px-3 text-xs"
            >
              <CheckCheck size={14} /> Đọc tất cả ({dbUnreadCount})
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {KIND_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setKindFilter(f.id)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                kindFilter === f.id
                  ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                  : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={onlyUnread}
            onChange={(e) => setOnlyUnread(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-blue-700 dark:border-neutral-700"
          />
          Chỉ xem chưa đọc
        </label>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : visibleItems.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Bell className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {onlyUnread ? 'Bạn đã đọc hết toàn bộ thông báo.' : 'Chưa có thông báo nào phù hợp.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="card divide-y divide-neutral-100 overflow-hidden dark:divide-neutral-800">
            {visibleItems.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => void handleOpenItem(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60 ${
                    !n.is_read ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.is_read ? 'bg-transparent' : 'bg-blue-600 dark:bg-blue-400'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {NOTIFICATION_KIND_LABEL[n.kind]}
                      </span>
                      <span className="text-[11px] tabular-nums text-neutral-400">
                        {new Date(n.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
                        {n.body}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {items.length < total && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void loadMore()}
                className="btn-secondary h-9 px-4 text-xs"
              >
                {loadingMore && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Xem thêm ({items.length}/{total})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
