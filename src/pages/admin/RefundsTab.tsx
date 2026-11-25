import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { markRefunded } from '@/lib/admin';
import { buildPayoutQrUrl } from '@/lib/vietqr';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import CopyButton from '@/components/CopyButton';
import { Alert, PageLoader } from '@/components/ui';
import type { Order, OrderRefundAccount } from '@/types';

interface RefundRow extends Order {
  buyer: { display_name: string } | null;
}

export default function RefundsTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [refundAccounts, setRefundAccounts] = useState<Record<string, OrderRefundAccount>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('orders')
      .select('*, buyer:profiles!orders_buyer_id_fkey(display_name)')
      .eq('status', 'REFUNDED')
      .gt('paid_amount', 0)
      .is('refund_completed_at', null)
      .order('refund_requested_at', { ascending: true, nullsFirst: false });

    if (err) {
      setError(getErrorMessage(err));
      setLoading(false);
      return;
    }

    const list = (data ?? []) as unknown as RefundRow[];
    setRows(list);
    if (list.length > 0) {
      const orderIds = list.map((o) => o.id);
      const { data: accData } = await supabase.from('order_refund_accounts').select('*').in('order_id', orderIds);
      if (accData) {
        setRefundAccounts(Object.fromEntries((accData as OrderRefundAccount[]).map((a) => [a.order_id, a])));
      }
    } else {
      setRefundAccounts({});
    }
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageLoader />;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (rows.length === 0) {
    return (
      <div className="card flex flex-col items-center px-4 py-12 text-center">
        <RotateCcw className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Không có đơn hàng nào đang chờ hoàn tiền.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <RefundCard
          key={r.id}
          order={r}
          refundAccount={refundAccounts[r.id]}
          onDone={async () => {
            await load();
            onChanged();
          }}
        />
      ))}
    </ul>
  );
}

function RefundCard({
  order,
  refundAccount,
  onDone,
}: {
  order: RefundRow;
  refundAccount?: OrderRefundAccount;
  onDone: () => Promise<void>;
}) {
  const [reference, setReference] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refundAmount = order.paid_amount > 0 ? order.paid_amount : order.amount;
  const transferContent = `Hoan tien don ${order.payment_code}`;
  const bankBin = refundAccount?.bank_bin ?? order.refund_bank_bin;
  const bankName = refundAccount?.bank_name ?? order.refund_bank_name;
  const accountNumber = refundAccount?.account_number ?? order.refund_account_number;
  const accountName = refundAccount?.account_name ?? order.refund_account_name;

  let qrUrl = '';
  if (bankBin && accountNumber && accountName) {
    try {
      qrUrl = buildPayoutQrUrl({
        bankBin,
        accountNumber,
        accountName,
        amount: refundAmount,
        paymentCode: order.payment_code,
        addInfo: transferContent,
      });
    } catch {
      qrUrl = '';
    }
  }

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await markRefunded(order.id, reference);
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <li className="card border-amber-200 p-4 dark:border-amber-800/70 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="mx-auto w-[200px]">
          {qrUrl ? (
            <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700">
              <img
                src={qrUrl}
                alt={`QR hoàn tiền đơn ${order.payment_code}`}
                className="w-full rounded-lg bg-white"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-neutral-300 p-3 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
              Đơn cũ chưa lưu sẵn tài khoản người mua — liên hệ SĐT {order.phone} để lấy STK hoàn tiền.
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Mã đơn{' '}
                <Link to={`/orders/${order.id}`} className="font-mono font-semibold text-neutral-900 hover:underline dark:text-neutral-100">
                  {order.payment_code}
                </Link>
              </p>
              <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">{order.listing_snapshot.title}</p>
            </div>
            {(order.refund_requested_at || order.cancelled_at) && (
              <span className="text-xs text-neutral-500 dark:text-neutral-400">
                Yêu cầu lúc {new Date((order.refund_requested_at ?? order.cancelled_at) as string).toLocaleString('vi-VN')}
              </span>
            )}
          </div>

          {(order.cancel_reason || order.admin_note) && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
              <strong>Lý do:</strong> {order.cancel_reason ?? order.admin_note}
            </p>
          )}

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Info label="Người mua" value={`${order.buyer?.display_name ?? order.recipient_name} (${order.phone})`} />
            <Info label="Ngân hàng nhận" value={bankName ?? 'Chưa có'} />
            <Info label="Số tài khoản" value={accountNumber ?? '—'} mono copy={Boolean(accountNumber)} />
            <Info label="Chủ tài khoản" value={accountName ?? '—'} copy={Boolean(accountName)} />
            <Info label="Số tiền hoàn" value={formatVND(refundAmount)} copyValue={String(refundAmount)} strong />
            <Info label="Nội dung chuyển khoản" value={transferContent} copy />
          </dl>

          {error && <Alert kind="error">{error}</Alert>}

          <div className="flex flex-col gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800 sm:flex-row sm:items-center">
            <input
              className="input sm:max-w-[16rem]"
              placeholder="Mã giao dịch hoàn tiền (tùy chọn)"
              value={reference}
              maxLength={120}
              onChange={(e) => setReference(e.target.value)}
              aria-label="Mã giao dịch hoàn tiền"
            />
            {confirming ? (
              <div className="flex gap-2 sm:ml-auto">
                <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  Chưa
                </button>
                <button type="button" className="btn-primary" onClick={() => void confirm()} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Chắc chắn đã hoàn {formatVND(refundAmount)}
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary sm:ml-auto" onClick={() => setConfirming(true)}>
                <CheckCircle2 className="h-4 w-4" /> Xác nhận đã hoàn tiền
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function Info({
  label,
  value,
  mono = false,
  strong = false,
  copy = false,
  copyValue,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
  copy?: boolean;
  copyValue?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/60">
      <div className="min-w-0">
        <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
        <dd className={`truncate ${mono ? 'font-mono' : ''} ${strong ? 'text-base font-semibold tabular-nums text-brand-800 dark:text-brand-300' : 'font-medium text-neutral-900 dark:text-neutral-100'}`}>
          {value}
        </dd>
      </div>
      {(copy || copyValue) && <CopyButton value={copyValue ?? value} />}
    </div>
  );
}
