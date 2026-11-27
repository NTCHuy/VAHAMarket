import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Package, Star } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOrderAlerts } from '@/context/OrderAlertsContext';
import CountBadge from '@/components/CountBadge';
import { getMyPendingReviewOrderIds } from '@/lib/reviews';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { ORDER_FILTERS } from '@/constants/orderStatus';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import NotificationHint from '@/components/NotificationHint';
import { Alert } from '@/components/ui';
import { ListRowsSkeleton } from '@/components/Skeletons';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { Order } from '@/types';

type Tab = 'buy' | 'sell';

export default function Orders() {
  useDocumentTitle('Đơn hàng');
  const { user } = useAuth();
  const alerts = useOrderAlerts();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'sell' ? 'sell' : 'buy';
  const filterId = params.get('status') ?? 'all';
  const filter = ORDER_FILTERS.find((f) => f.id === filterId) ?? ORDER_FILTERS[0];

  const [orders, setOrders] = useState<Order[]>([]);
  const [pendingReviewIds, setPendingReviewIds] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setLoading(true);
    setError(null);
    let query = supabase
      .from('orders')
      .select('*')
      .eq(tab === 'buy' ? 'buyer_id' : 'seller_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (filter.statuses) query = query.in('status', filter.statuses);
    query.then(({ data, error: err }) => {
      if (!alive) return;
      if (err) setError(getErrorMessage(err));
      else setOrders((data ?? []) as Order[]);
      setLoading(false);
    });
    getMyPendingReviewOrderIds()
      .then((ids) => {
        if (alive) setPendingReviewIds(ids);
      })
      .catch(() => {
        // Không làm gián đoạn danh sách đơn nếu RPC chưa sẵn sàng
      });
    return () => {
      alive = false;
    };
  }, [user, tab, filter]);

  const setParam = (key: string, value: string, fallback: string) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === fallback) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">Đơn hàng</h1>

      <NotificationHint />

      <div role="tablist" className="grid grid-cols-2 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-1">
        {([['buy', 'Đơn mua'], ['sell', 'Đơn bán']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setParam('tab', id, 'buy')}
            className={`inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === id ? 'bg-brand-700 text-white' : 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'}`}>
            {label}
            <CountBadge count={id === 'buy' ? alerts.buy : alerts.sell} />
          </button>
        ))}
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {ORDER_FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setParam('status', f.id, 'all')}
            className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium ${filter.id === f.id ? 'border-brand-600 dark:border-brand-500 bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300' : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-800'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <ListRowsSkeleton count={4} />
      ) : orders.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Package className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            {tab === 'buy' ? 'Chưa có đơn mua nào.' : 'Chưa có đơn bán nào.'}
          </p>
          {tab === 'buy' && <Link to="/" className="btn-primary mt-3">Khám phá sản phẩm</Link>}
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link to={`/orders/${o.id}`} className="card flex gap-3 p-3 transition-colors hover:border-neutral-400 dark:hover:border-neutral-600 sm:gap-4 sm:p-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
                  {o.listing_snapshot.image && <img src={cldUrl(o.listing_snapshot.image, { width: 200, height: 200, crop: 'fill' })} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">{o.listing_snapshot.title}</p>
                  <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
                    {tab === 'buy' ? 'Số tiền: ' : 'Thực nhận: '}
                    <strong className="text-neutral-900 dark:text-neutral-100">{formatVND(tab === 'buy' ? o.amount : o.seller_payout)}</strong>
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <OrderStatusBadge status={o.status} />
                    {(o.status === 'COMPLETED' || o.status === 'PAID_OUT') && pendingReviewIds.has(o.id) && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300">
                        <Star size={11} strokeWidth={1.75} className="fill-amber-500 text-amber-500" />
                        Chờ đánh giá
                      </span>
                    )}
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{new Date(o.created_at).toLocaleString('vi-VN')}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-neutral-400 dark:text-neutral-500">{o.payment_code}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
