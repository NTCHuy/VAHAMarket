import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { manualConfirmPayment } from '@/lib/admin';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { ORDER_FILTERS } from '@/constants/orderStatus';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { Alert, Field, PageLoader } from '@/components/ui';
import type { Order } from '@/types';

const PAGE = 50;

export default function OrdersTab({ onChanged }: { onChanged: () => void }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filterId, setFilterId] = useState('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Order | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const filter = ORDER_FILTERS.find((f) => f.id === filterId) ?? ORDER_FILTERS[0];

  const fetchPage = useCallback(
    (offset: number) => {
      let query = supabase.from('orders').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (filter.statuses) query = query.in('status', filter.statuses);
      if (debounced) query = query.ilike('payment_code', `%${debounced.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      return query.range(offset, offset + PAGE - 1);
    },
    [filter, debounced],
  );

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, count, error: err } = await fetchPage(0);
    if (err) setError(getErrorMessage(err));
    else {
      setOrders((data ?? []) as Order[]);
      setTotal(count ?? 0);
      setError(null);
    }
    setLoading(false);
  }, [fetchPage]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data, error: err } = await fetchPage(orders.length);
    if (err) setError(getErrorMessage(err));
    else setOrders((prev) => [...prev, ...((data ?? []) as Order[])]);
    setLoadingMore(false);
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input className="input pl-9" placeholder="Tìm theo mã đơn (CNTH...)" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm theo mã đơn" />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {ORDER_FILTERS.map((f) => (
          <button key={f.id} type="button" onClick={() => setFilterId(f.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${filterId === f.id ? 'border-brand-600 dark:border-brand-500 bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : orders.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-slate-600 dark:text-slate-400">Không có đơn hàng nào.</div>
      ) : (
        <>
          <p className="text-sm text-slate-500 dark:text-slate-400">{total} đơn hàng</p>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">Mã đơn</th>
                  <th className="px-3 py-2.5">Sản phẩm</th>
                  <th className="px-3 py-2.5 text-right">Số tiền</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5">Ngày tạo</th>
                  <th className="px-3 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.map((o) => (
                  <tr key={o.id} className="align-top">
                    <td className="px-3 py-2.5 font-mono text-xs">{o.payment_code}</td>
                    <td className="max-w-[16rem] px-3 py-2.5"><span className="line-clamp-2">{o.listing_snapshot.title}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium">{formatVND(o.amount)}</td>
                    <td className="px-3 py-2.5"><OrderStatusBadge status={o.status} /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">{new Date(o.created_at).toLocaleString('vi-VN')}</td>
                    <td className="px-3 py-2.5 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Link to={`/orders/${o.id}`} className="btn-ghost px-2 py-1 text-xs">Xem</Link>
                        {(o.status === 'PENDING_PAYMENT' || o.status === 'EXPIRED') && (
                          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setTarget(o)}>Duyệt thanh toán thủ công</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {orders.length < total && (
            <div className="flex justify-center">
              <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Xem thêm
              </button>
            </div>
          )}
        </>
      )}

      {target && <ManualConfirmDialog order={target} onClose={() => setTarget(null)} onDone={async () => { setTarget(null); await reload(); onChanged(); }} />}
    </div>
  );
}

function ManualConfirmDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await manualConfirmPayment(order.id, note.trim());
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Duyệt thanh toán thủ công" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-4 rounded-t-2xl bg-white dark:bg-slate-900 p-5 shadow-pop sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Duyệt thanh toán thủ công</h2>
          <button type="button" className="btn-ghost px-2" onClick={onClose} disabled={busy} aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3 text-sm">
          <p className="font-mono text-xs text-slate-600 dark:text-slate-400">{order.payment_code}</p>
          <p className="mt-0.5 line-clamp-2 font-medium text-slate-900 dark:text-slate-100">{order.listing_snapshot.title}</p>
          <p className="mt-1 text-slate-600 dark:text-slate-400">Số tiền cần nhận: <strong>{formatVND(order.amount)}</strong></p>
        </div>
        <Alert kind="info">
          Chỉ duyệt khi bạn đã <strong>thấy tiền về tài khoản trung gian</strong> đúng {formatVND(order.amount)}.
          {order.status === 'EXPIRED' && ' Đơn này đã hết hạn: hệ thống chỉ khôi phục được nếu tin vẫn chưa bị người khác đặt.'}
        </Alert>
        <Field label="Căn cứ duyệt" htmlFor="mc-note" required hint="Ví dụ: mã giao dịch ngân hàng, tên người chuyển.">
          <input id="mc-note" className="input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={busy || note.trim().length < 5}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Duyệt: chuyển sang “Đã thanh toán”
          </button>
        </div>
      </div>
    </div>
  );
}
