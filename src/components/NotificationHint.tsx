import { useState } from 'react';
import { Bell, BellRing, Mail } from 'lucide-react';
import { useNotifications } from '@/context/NotificationContext';

interface NotificationHintProps {
  /** 'prominent': nổi bật hơn một chút (dùng ở chi tiết đơn đang xử lý). */
  prominent?: boolean;
  className?: string;
}

/**
 * Hộp lưu ý nhắc người dùng bật Thông báo trình duyệt và kiểm tra email (kể cả mục Spam)
 * từ vahamarket.vn@gmail.com để không bỏ lỡ cập nhật đơn hàng & duyệt tin.
 */
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
      aria-label="Mẹo theo dõi đơn nhanh"
      className={`rounded-xl border px-3.5 py-3 text-xs leading-relaxed transition-colors sm:px-4 ${
        prominent
          ? 'border-brand-200 bg-brand-50/80 text-slate-800 dark:border-brand-800/70 dark:bg-brand-900/25 dark:text-slate-200'
          : 'border-slate-200 bg-slate-50/90 text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300'
      } ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
            prominent
              ? 'bg-brand-100 text-brand-700 dark:bg-brand-900/60 dark:text-brand-300'
              : 'bg-white text-brand-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-brand-400 dark:ring-slate-700'
          }`}
        >
          <Bell className="h-3.5 w-3.5" />
        </span>

        <div className="min-w-0 flex-1 space-y-2">
          <p>
            <strong className="text-slate-900 dark:text-slate-100">Mẹo theo dõi đơn nhanh:</strong> Hãy bật{' '}
            <strong className="text-slate-900 dark:text-slate-100">Thông báo trình duyệt</strong> (biểu tượng chuông trên
            thanh menu) và kiểm tra hộp thư email từ{' '}
            <span className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
              <Mail className="h-3 w-3 text-brand-600 dark:text-brand-400" />
              vahamarket.vn@gmail.com
            </span>{' '}
            (bao gồm cả mục <strong className="text-slate-900 dark:text-slate-100">Thư rác / Spam</strong>, hãy đánh dấu{' '}
            <em>&lsquo;Không phải thư rác&rsquo;</em> nếu thấy) để nhận cập nhật đơn hàng tự động.
          </p>

          {canQuickEnable && (
            <div>
              <button
                type="button"
                disabled={requesting}
                onClick={() => void onEnable()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-brand-800 disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500"
              >
                <BellRing className="h-3.5 w-3.5" />
                {requesting ? 'Đang xin quyền...' : 'Bật thông báo trình duyệt ngay'}
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
