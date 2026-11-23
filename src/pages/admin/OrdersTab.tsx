import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { forceCompleteShipped, forceRefundOrder, manualConfirmPayment } from '@/lib/admin';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { ORDER_FILTERS } from '@/constants/orderStatus';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { Alert, Field, PageLoader } from '@/components/ui';
import type { Order } from '@/types';

const PAGE = 50;
const DAY_MS = 24 * 3600_000;
const OVERDUE_SHIPPED_DAYS = 14;
const OVERDUE_PAID_HOURS = 48;

function isShippedOverdue14d(o: Order): boolean {
  if (o.status !== 'SHIPPED' || !o.shipped_at) return false;
  return Date.now() - new Date(o.shipped_at).getTime() >= OVERDUE_SHIPPED_DAYS * DAY_MS;
}

function isPaidOverdue48h(o: Order): boolean {
  if (o.status !== 'PAID_HELD') return false;
  const deadline = o.ship_deadline_at
    ? new Date(o.ship_deadline_at).getTime()
    : o.paid_at
      ? new Date(o.paid_at).getTime() + OVERDUE_PAID_HOURS * 3600_000
      : null;
  return Boolean(deadline && Date.now() > deadline);
}

type ModalState =
  | { kind: 'manual_confirm'; order: Order }
  | { kind: 'force_complete'; order: Order }
  | { kind: 'force_refund'; order: Order };

export default function OrdersTab({ onChanged, overdueCount = 0 }: { onChanged: () => void; overdueCount?: number }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filterId, setFilterId] = useState('all');
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const filter = ORDER_FILTERS.find((f) => f.id === filterId) ?? ORDER_FILTERS[0];

  const fetchPage = useCallback(
    (offset: number) => {
      let query = supabase.from('orders').select('*', { count: 'exact' });
      if (filterId === 'overdue_shipped') {
        const cutoff = new Date(Date.now() - OVERDUE_SHIPPED_DAYS * DAY_MS).toISOString();
        query = query.eq('status', 'SHIPPED').lte('shipped_at', cutoff).order('shipped_at', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: false });
        if (filter.statuses) query = query.in('status', filter.statuses);
      }
      if (debounced) query = query.ilike('payment_code', `%${debounced.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      return query.range(offset, offset + PAGE - 1);
    },
    [filterId, filter, debounced],
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
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
        <input className="input pl-9" placeholder="Tìm theo mã đơn (CNTH...)" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Tìm theo mã đơn" />
      </div>

      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => setFilterId('overdue_shipped')}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
            filterId === 'overdue_shipped'
              ? 'border-red-600 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950/60 dark:text-red-300'
              : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
          }`}
        >
          <AlertTriangle size={13} strokeWidth={1.75} className="text-red-600 dark:text-red-400" />
          Quá hạn vận đơn (&gt;14 ngày)
          {overdueCount > 0 && (
            <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-4 text-white">{overdueCount}</span>
          )}
        </button>

        {ORDER_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilterId(f.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
              filterId === f.id
                ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-900/40 dark:text-brand-300'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : orders.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-neutral-600 dark:text-neutral-400">
          {filterId === 'overdue_shipped' ? 'Không có đơn giao hàng nào quá 14 ngày cần rà soát.' : 'Không có đơn hàng nào.'}
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{total} đơn hàng</p>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400">
                <tr>
                  <th className="px-3 py-2.5">Mã đơn</th>
                  <th className="px-3 py-2.5">Sản phẩm &amp; Vận đơn</th>
                  <th className="px-3 py-2.5 text-right">Số tiền</th>
                  <th className="px-3 py-2.5">Trạng thái</th>
                  <th className="px-3 py-2.5">Thời gian</th>
                  <th className="px-3 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {orders.map((o) => {
                  const overdue14d = isShippedOverdue14d(o);
                  const overdue48h = isPaidOverdue48h(o);
                  return (
                    <tr key={o.id} className="align-top">
                      <td className="px-3 py-2.5 font-mono text-xs">{o.payment_code}</td>
                      <td className="max-w-[16rem] px-3 py-2.5">
                        <span className="line-clamp-2 font-medium text-neutral-900 dark:text-neutral-100">{o.listing_snapshot.title}</span>
                        {(o.carrier || o.tracking_code) && (
                          <p className="mt-0.5 font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                            {o.carrier} · {o.tracking_code}
                          </p>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{formatVND(o.amount)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <OrderStatusBadge status={o.status} />
                          {overdue14d && (
                            <span className="badge border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
                              Quá 14 ngày
                            </span>
                          )}
                          {overdue48h && (
                            <span className="badge border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Quá hạn gửi 48h
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-500 dark:text-neutral-400">
                        <div>Tạo: {new Date(o.created_at).toLocaleDateString('vi-VN')}</div>
                        {o.shipped_at && <div>Gửi: {new Date(o.shipped_at).toLocaleDateString('vi-VN')}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Link to={`/orders/${o.id}`} className="btn-ghost px-2 py-1 text-xs">Xem</Link>
                          {(o.status === 'PENDING_PAYMENT' || o.status === 'EXPIRED') && (
                            <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setModal({ kind: 'manual_confirm', order: o })}>
                              Duyệt TT thủ công
                            </button>
                          )}
                          {overdue14d && (
                            <>
                              <button
                                type="button"
                                className="btn-primary px-2 py-1 text-xs"
                                onClick={() => setModal({ kind: 'force_complete', order: o })}
                              >
                                <CheckCircle2 size={13} strokeWidth={1.75} /> Xác nhận đã giao &amp; Giải ngân
                              </button>
                              <button
                                type="button"
                                className="btn-secondary px-2 py-1 text-xs text-red-700 dark:text-red-400"
                                onClick={() => setModal({ kind: 'force_refund', order: o })}
                              >
                                <RotateCcw size={13} strokeWidth={1.75} /> Vận đơn lỗi / Hoàn tiền khách
                              </button>
                            </>
                          )}
                          {overdue48h && (
                            <button
                              type="button"
                              className="btn-secondary px-2 py-1 text-xs text-red-700 dark:text-red-400"
                              onClick={() => setModal({ kind: 'force_refund', order: o })}
                            >
                              <RotateCcw size={13} strokeWidth={1.75} /> Hủy &amp; Hoàn tiền khách
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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

      {modal?.kind === 'manual_confirm' && (
        <ManualConfirmDialog
          order={modal.order}
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await reload();
            onChanged();
          }}
        />
      )}
      {modal?.kind === 'force_complete' && (
        <ForceCompleteDialog
          order={modal.order}
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await reload();
            onChanged();
          }}
        />
      )}
      {modal?.kind === 'force_refund' && (
        <ForceRefundDialog
          order={modal.order}
          onClose={() => setModal(null)}
          onDone={async () => {
            setModal(null);
            await reload();
            onChanged();
          }}
        />
      )}
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
    <div role="dialog" aria-modal="true" aria-label="Duyệt thanh toán thủ công" className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-4 rounded-t-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Duyệt thanh toán thủ công</h2>
          <button type="button" className="btn-ghost px-2" onClick={onClose} disabled={busy} aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-800/60">
          <p className="font-mono text-xs text-neutral-600 dark:text-neutral-400">{order.payment_code}</p>
          <p className="mt-0.5 line-clamp-2 font-medium text-neutral-900 dark:text-neutral-100">{order.listing_snapshot.title}</p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">Số tiền cần nhận: <strong>{formatVND(order.amount)}</strong></p>
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
          <button type="button" className="btn-primary" onClick={() => void submit()} disabled={busy || note.trim().length < 5}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Duyệt: chuyển sang “Đã thanh toán”
          </button>
        </div>
      </div>
    </div>
  );
}

function ForceCompleteDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await forceCompleteShipped(order.id, note.trim());
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Xác nhận đã giao & Mở khóa giải ngân" className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-4 rounded-t-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold">Xác nhận đã giao &amp; Giải ngân</h2>
          <button type="button" className="btn-ghost px-2" onClick={onClose} disabled={busy} aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-800/60">
          <p className="font-mono text-xs text-neutral-600 dark:text-neutral-400">{order.payment_code} · {order.carrier} · {order.tracking_code}</p>
          <p className="mt-0.5 line-clamp-2 font-medium text-neutral-900 dark:text-neutral-100">{order.listing_snapshot.title}</p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">Giải ngân cho người bán: <strong>{formatVND(order.seller_payout)}</strong></p>
        </div>
        <Field
          label="Căn cứ tra cứu vận đơn"
          htmlFor="fc-note"
          required
          hint="Ví dụ: Đã kiểm tra vận đơn GHN giao thành công ngày dd/mm, quá 14 ngày người mua không phản hồi."
        >
          <textarea id="fc-note" rows={3} className="input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
          <button type="button" className="btn-primary" onClick={() => void submit()} disabled={busy || note.trim().length < 5}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận hoàn tất &amp; Mở khóa giải ngân
          </button>
        </div>
      </div>
    </div>
  );
}

function ForceRefundDialog({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await forceRefundOrder(order.id, reason.trim());
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Hủy đơn & Hoàn tiền cho người mua" className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/50 sm:items-center sm:p-4">
      <div className="w-full max-w-md space-y-4 rounded-t-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-lg">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-base font-semibold text-red-700 dark:text-red-400">Hủy đơn &amp; Hoàn tiền khách</h2>
          <button type="button" className="btn-ghost px-2" onClick={onClose} disabled={busy} aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>
        <div className="rounded-lg bg-neutral-50 p-3 text-sm dark:bg-neutral-800/60">
          <p className="font-mono text-xs text-neutral-600 dark:text-neutral-400">{order.payment_code}</p>
          <p className="mt-0.5 line-clamp-2 font-medium text-neutral-900 dark:text-neutral-100">{order.listing_snapshot.title}</p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">Đưa vào tab Hoàn tiền: <strong>{formatVND(order.paid_amount > 0 ? order.paid_amount : order.amount)}</strong></p>
        </div>
        <Field label="Lý do hủy & hoàn tiền" htmlFor="fr-reason" required hint="Tối thiểu 5 ký tự. Người mua sẽ thấy lý do này.">
          <textarea id="fr-reason" rows={3} className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {error && <Alert kind="error">{error}</Alert>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
          <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" onClick={() => void submit()} disabled={busy || reason.trim().length < 5}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Chuyển sang hàng đợi Hoàn tiền
          </button>
        </div>
      </div>
    </div>
  );
}
