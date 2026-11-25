import { useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';

interface NotificationHintProps {
  prominent?: boolean;
  className?: string;
}

export default function NotificationHint({ prominent = false, className = '' }: NotificationHintProps) {
  const { browserSupported, permission, requestBrowserPermission } = useNotifications();
  const [requesting, setRequesting] = useState(false);

  const canQuickEnable = browserSupported && permission === 'default';

  const onEnable = async () => {
    setRequesting(true);
    try {
      await requestBrowserPermission();
    } finally {
      setRequesting(false);
    }
  };

  return (
    <aside
      aria-label="Mẹo nhận thông báo nhanh"
      className={`rounded-md border px-3.5 py-2.5 text-xs leading-relaxed ${
        prominent
          ? 'border-blue-200 bg-blue-50/60 text-neutral-800 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-neutral-200'
          : 'border-neutral-200 bg-neutral-100/70 text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300'
      } ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="flex min-w-0 flex-1 items-start gap-2">
          <Bell size={15} strokeWidth={1.75} className="mt-0.5 shrink-0 text-blue-700 dark:text-blue-400" />
          <span>
            <strong className="font-semibold text-neutral-900 dark:text-neutral-100">Mẹo:</strong> Bật{' '}
            <strong>Thông báo trình duyệt</strong> (biểu tượng chuông) và kiểm tra email từ{' '}
            <code className="rounded border border-neutral-200 bg-white px-1 py-0.5 font-mono text-[11px] text-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              vahamarket.vn@gmail.com
            </code>{' '}
            (kể cả mục <strong>Thư rác</strong>).
          </span>
        </p>

        {canQuickEnable && (
          <button
            type="button"
            disabled={requesting}
            onClick={() => void onEnable()}
            className="btn-primary shrink-0 py-1.5 text-xs"
          >
            <BellRing size={14} strokeWidth={1.75} />
            {requesting ? 'Đang bật...' : 'Bật thông báo'}
          </button>
        )}
      </div>
    </aside>
  );
}
