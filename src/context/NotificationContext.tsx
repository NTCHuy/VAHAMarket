import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell, CheckCircle2, Package, ShieldAlert, Truck, Wallet, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatVND } from '@/lib/money';
import { useAuth } from './AuthContext';
import type { Listing, Order } from '@/types';

type ToastKind = 'info' | 'success' | 'warning';

export interface AppToast {
  id: string;
  title: string;
  body: string;
  href?: string;
  actionLabel?: string;
  kind: ToastKind;
}

type BrowserPermission = NotificationPermission | 'unsupported';

interface NotificationContextValue {
  browserSupported: boolean;
  permission: BrowserPermission;
  browserEnabled: boolean;
  requestBrowserPermission: () => Promise<BrowserPermission>;
  toggleBrowserNotifications: () => Promise<void>;
  pushToast: (toast: Omit<AppToast, 'id'>, browserTag?: string) => void;
  dismissToast: (id: string) => void;
}

const STORAGE_KEY = 'vaha-browser-notifications';
const TOAST_DURATION_MS = 8000;

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function getInitialPermission(): BrowserPermission {
  return isBrowserNotificationSupported() ? Notification.permission : 'unsupported';
}

function getSavedPreference(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const navigate = useNavigate();

  const browserSupported = isBrowserNotificationSupported();
  const [permission, setPermission] = useState<BrowserPermission>(getInitialPermission);
  const [prefEnabled, setPrefEnabled] = useState<boolean>(getSavedPreference);
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dedupeRef = useRef<Map<string, number>>(new Map());

  const browserEnabled = browserSupported && permission === 'granted' && prefEnabled;

  const dismissToast = useCallback((id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<AppToast, 'id'>, browserTag?: string) => {
      const now = Date.now();
      if (browserTag) {
        const last = dedupeRef.current.get(browserTag);
        if (last && now - last < 4000) return;
        dedupeRef.current.set(browserTag, now);
      }

      const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [{ ...toast, id }, ...prev].slice(0, 4));

      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, TOAST_DURATION_MS);
      timersRef.current.set(id, timer);

      if (browserEnabled) {
        try {
          const n = new Notification(toast.title, {
            body: toast.body,
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            tag: browserTag ?? id,
          });
          n.onclick = () => {
            window.focus();
            if (toast.href) navigate(toast.href);
            n.close();
          };
        } catch {
          // Bỏ qua nếu trình duyệt chặn Notification trong ngữ cảnh hiện tại
        }
      }
    },
    [browserEnabled, navigate],
  );

  const requestBrowserPermission = useCallback(async (): Promise<BrowserPermission> => {
    if (!browserSupported) {
      pushToast({
        title: 'Trình duyệt không hỗ trợ',
        body: 'Trình duyệt này không hỗ trợ thông báo.',
        kind: 'warning',
      });
      return 'unsupported';
    }

    let nextPerm: NotificationPermission = Notification.permission;
    if (nextPerm === 'default') {
      try {
        nextPerm = await Notification.requestPermission();
      } catch {
        nextPerm = 'denied';
      }
    }
    setPermission(nextPerm);

    if (nextPerm === 'granted') {
      setPrefEnabled(true);
      try {
        localStorage.setItem(STORAGE_KEY, 'on');
      } catch {
        // ignore
      }
      pushToast({
        title: 'Đã bật thông báo',
        body: 'Bạn sẽ nhận thông báo ngay khi đơn hàng hoặc tin đăng thay đổi.',
        kind: 'success',
      });
    } else {
      setPrefEnabled(false);
      try {
        localStorage.setItem(STORAGE_KEY, 'off');
      } catch {
        // ignore
      }
      pushToast({
        title: 'Trình duyệt đang chặn thông báo',
        body: 'Bấm biểu tượng ổ khóa trên thanh địa chỉ và bật quyền Thông báo.',
        kind: 'warning',
      });
    }
    return nextPerm;
  }, [browserSupported, pushToast]);

  const toggleBrowserNotifications = useCallback(async () => {
    if (browserEnabled) {
      setPrefEnabled(false);
      try {
        localStorage.setItem(STORAGE_KEY, 'off');
      } catch {
        // ignore
      }
      pushToast({
        title: 'Đã tắt thông báo trình duyệt',
        body: 'Bạn vẫn nhận thông báo khi đang mở trang.',
        kind: 'info',
      });
      return;
    }
    await requestBrowserPermission();
  }, [browserEnabled, pushToast, requestBrowserPermission]);

  // Dọn timer khi unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
    };
  }, []);

  // Lắng nghe Realtime trên `orders` và `listings` của user hiện tại
  useEffect(() => {
    if (!userId) return;

    const handleSellerOrderUpdate = (payload: { new: Partial<Order>; old: Partial<Order> }) => {
      const next = payload.new;
      const prev = payload.old;
      if (!next.id || !next.status || next.status === prev.status) return;
      const itemTitle = next.listing_snapshot?.title ?? next.payment_code ?? 'Đơn hàng';
      const href = `/orders/${next.id}`;

      if (next.status === 'PAID_HELD') {
        pushToast(
          {
            title: 'Đơn hàng mới đã thanh toán',
            body: `Đơn "${itemTitle}" đã được sàn giữ tiền. Hãy quay video đóng gói 6 mặt và gửi hàng.`,
            href,
            actionLabel: 'Mở đơn',
            kind: 'success',
          },
          `order-paid-${next.id}`,
        );
      } else if (next.status === 'COMPLETED') {
        const payoutText = typeof next.seller_payout === 'number' ? ` (${formatVND(next.seller_payout)})` : '';
        pushToast(
          {
            title: 'Người mua đã nhận hàng',
            body: `Đơn "${itemTitle}" hoàn tất. Sàn đang chờ giải ngân${payoutText}.`,
            href,
            actionLabel: 'Xem đơn',
            kind: 'success',
          },
          `order-completed-${next.id}`,
        );
      } else if (next.status === 'PAID_OUT') {
        const payoutText = typeof next.seller_payout === 'number' ? ` ${formatVND(next.seller_payout)}` : '';
        pushToast(
          {
            title: 'Đã giải ngân thành công',
            body: `Đã chuyển${payoutText} cho đơn "${itemTitle}" về tài khoản của bạn.`,
            href,
            actionLabel: 'Xem chi tiết',
            kind: 'success',
          },
          `order-paidout-${next.id}`,
        );
      }
    };

    const handleBuyerOrderUpdate = (payload: { new: Partial<Order>; old: Partial<Order> }) => {
      const next = payload.new;
      const prev = payload.old;
      if (!next.id || !next.status || next.status === prev.status) return;
      const itemTitle = next.listing_snapshot?.title ?? next.payment_code ?? 'Đơn hàng';
      const href = `/orders/${next.id}`;

      if (next.status === 'SHIPPED') {
        const carrierInfo = next.carrier && next.tracking_code ? ` (${next.carrier}: ${next.tracking_code})` : '';
        pushToast(
          {
            title: 'Đơn hàng đang giao',
            body: `"${itemTitle}" đã được gửi đi${carrierInfo}. Nhớ quay video mở hộp đủ 6 mặt.`,
            href,
            actionLabel: 'Theo dõi đơn',
            kind: 'info',
          },
          `order-shipped-${next.id}`,
        );
      }
    };

    const handleListingUpdate = (payload: { new: Partial<Listing>; old: Partial<Listing> }) => {
      const next = payload.new;
      const prev = payload.old;
      if (!next.id || !next.status || next.status === prev.status) return;
      if (prev.status && prev.status !== 'pending_review') return;

      const title = next.title ?? 'Tin đăng';
      if (next.status === 'active') {
        pushToast(
          {
            title: 'Tin đăng đã được duyệt',
            body: `"${title}" đã hiển thị trên sàn.`,
            href: `/listing/${next.id}`,
            actionLabel: 'Xem tin',
            kind: 'success',
          },
          `listing-approved-${next.id}`,
        );
      } else if (next.status === 'rejected') {
        const reason = next.rejection_reason ? ` Lý do: ${next.rejection_reason}` : '';
        pushToast(
          {
            title: 'Tin đăng cần chỉnh sửa',
            body: `"${title}" chưa được duyệt.${reason}`,
            href: '/my-listings',
            actionLabel: 'Sửa tin',
            kind: 'warning',
          },
          `listing-rejected-${next.id}`,
        );
      }
    };

    const channel = supabase
      .channel(`user-notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `seller_id=eq.${userId}` },
        (p) => handleSellerOrderUpdate(p as unknown as { new: Partial<Order>; old: Partial<Order> }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` },
        (p) => handleBuyerOrderUpdate(p as unknown as { new: Partial<Order>; old: Partial<Order> }),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'listings', filter: `seller_id=eq.${userId}` },
        (p) => handleListingUpdate(p as unknown as { new: Partial<Listing>; old: Partial<Listing> }),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, pushToast]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      browserSupported,
      permission,
      browserEnabled,
      requestBrowserPermission,
      toggleBrowserNotifications,
      pushToast,
      dismissToast,
    }),
    [browserSupported, permission, browserEnabled, requestBrowserPermission, toggleBrowserNotifications, pushToast, dismissToast],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} onNavigate={(href) => navigate(href)} />
    </NotificationContext.Provider>
  );
}

function ToastIcon({ kind, title }: { kind: ToastKind; title: string }) {
  if (title.includes('giải ngân')) return <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
  if (title.includes('đang giao')) return <Truck className="h-5 w-5 text-sky-600 dark:text-sky-400" />;
  if (title.includes('thanh toán')) return <Package className="h-5 w-5 text-brand-700 dark:text-brand-400" />;
  if (kind === 'success') return <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />;
  if (kind === 'warning') return <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400" />;
  return <Bell className="h-5 w-5 text-brand-700 dark:text-brand-400" />;
}

function ToastContainer({
  toasts,
  onDismiss,
  onNavigate,
}: {
  toasts: AppToast[];
  onDismiss: (id: string) => void;
  onNavigate: (href: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto overflow-hidden rounded-lg border border-neutral-200 bg-white p-4 transition-all dark:border-neutral-700 dark:bg-neutral-900"
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">
              <ToastIcon kind={t.kind} title={t.title} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{t.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{t.body}</p>
              {t.href && (
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(t.href!);
                    onDismiss(t.id);
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline dark:text-brand-400"
                >
                  {t.actionLabel ?? 'Xem chi tiết'} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(t.id)}
              aria-label="Đóng thông báo"
              className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function useNotifications(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications phải được dùng bên trong <NotificationProvider>.');
  return ctx;
}
