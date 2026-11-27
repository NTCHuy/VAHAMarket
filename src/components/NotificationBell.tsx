import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, Loader2, Search } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';
import { formatRelativeTime, NOTIFICATION_KIND_LABEL } from '@/lib/notifications';

export default function NotificationBell() {
  const {
    browserSupported,
    browserEnabled,
    toggleBrowserNotifications,
    dbNotifications,
    dbUnreadCount,
    dbLoading,
    refreshDbNotifications,
    markRead,
  } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    void refreshDbNotifications();

    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, refreshDbNotifications]);

  const previewItems = dbNotifications.slice(0, 8);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={dbUnreadCount > 0 ? `Hộp thông báo (${dbUnreadCount} chưa đọc)` : 'Hộp thông báo'}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-950 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        <Bell size={16} strokeWidth={1.75} />
        {dbUnreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none tabular-nums text-white">
            {dbUnreadCount > 99 ? '99+' : dbUnreadCount}
          </span>
        ) : browserEnabled ? (
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        ) : null}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Thông báo gần đây"
          className="fixed inset-x-3 top-16 z-50 overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-1.5 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-3.5 py-2.5 dark:border-neutral-800">
            <span className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
              Thông báo {dbUnreadCount > 0 ? `(${dbUnreadCount})` : ''}
            </span>
            <div className="flex items-center gap-2">
              {dbUnreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markRead(null)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                >
                  <CheckCheck size={13} /> Đọc tất cả
                </button>
              )}
              {browserSupported && (
                <button
                  type="button"
                  onClick={() => void toggleBrowserNotifications()}
                  title={browserEnabled ? 'Tắt thông báo trình duyệt' : 'Bật thông báo trình duyệt'}
                  className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${
                    browserEnabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800'
                  }`}
                >
                  {browserEnabled ? <Bell size={11} /> : <BellOff size={11} />}
                  {browserEnabled ? 'Đang bật đẩy' : 'Bật đẩy'}
                </button>
              )}
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
            {dbLoading && previewItems.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-neutral-500">
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Đang tải...
              </div>
            ) : previewItems.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-neutral-500 dark:text-neutral-400">
                Chưa có thông báo nào.
              </div>
            ) : (
              previewItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (!n.is_read) void markRead(n.id);
                    setOpen(false);
                    navigate(n.href ?? '/notifications');
                  }}
                  className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/70 ${
                    !n.is_read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      n.is_read ? 'bg-transparent' : 'bg-blue-600 dark:bg-blue-400'
                    }`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-400">
                        {NOTIFICATION_KIND_LABEL[n.kind]}
                      </span>
                      <span className="text-[10px] tabular-nums text-neutral-400">
                        {formatRelativeTime(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-neutral-600 dark:text-neutral-400">
                        {n.body}
                      </p>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t border-neutral-100 bg-neutral-50/70 px-3.5 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-950/50">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Xem tất cả thông báo
            </Link>
            <Link
              to="/alerts"
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1 font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
            >
              <Search size={12} /> Từ khóa săn kèo
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
