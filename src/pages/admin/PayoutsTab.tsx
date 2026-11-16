import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Wallet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { markPaidOut } from '@/lib/admin';
import { buildPayoutQrUrl } from '@/lib/vietqr';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import CopyButton from '@/components/CopyButton';
import { Alert, PageLoader } from '@/components/ui';
import type { OrderPayout } from '@/types';

interface PayoutRow extends OrderPayout {
  order: { payment_code: string; amount: number; platform_fee: number; seller_payout: number; completed_at: string | null } | null;
  seller: { display_name: string } | null;
}

export default function PayoutsTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('order_payouts')
      .select('*, order:orders(payment_code, amount, platform_fee, seller_payout, completed_at), seller:profiles(display_name)')
      .eq('status', 'PENDING')
      .order('updated_at', { ascending: true });
    if (err) setError(getErrorMessage(err));
    else {
      setRows((data ?? []) as unknown as PayoutRow[]);
      setError(null);
    }
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
        <Wallet className="h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm text-slate-600">Không có đơn nào chờ giải ngân.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <PayoutCard key={r.order_id} row={r} onDone={async () => { await load(); onChanged(); }} />
      ))}
    </ul>
  );
}

function PayoutCard({ row, onDone }: { row: PayoutRow; onDone: () => Promise<void> }) {
  const [reference, setReference] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = row.order?.payment_code ?? '';

  let qrUrl = '';
  try {
    qrUrl = buildPayoutQrUrl({
      bankBin: row.bank_bin,
      accountNumber: row.account_number,
      accountName: row.account_name,
      amount: row.amount,
      paymentCode: code,
    });
  } catch {
    qrUrl = '';
  }

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await markPaidOut(row.order_id, reference);
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <li className="card p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div className="mx-auto w-[200px]">
          {qrUrl ? <img src={qrUrl} alt={`QR giải ngân đơn ${code}`} className="w-full rounded-xl border border-slate-200 bg-white" loading="lazy" /> : <p className="text-xs text-red-600">Không tạo được QR.</p>}
        </div>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Mã đơn <span className="font-mono font-semibold text-slate-900">{code}</span></p>
            {row.order?.completed_at && <span className="text-xs text-slate-500">Hoàn tất {new Date(row.order.completed_at).toLocaleString('vi-VN')}</span>}
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <Info label="Người bán" value={row.seller?.display_name ?? '—'} />
            <Info label="Ngân hàng" value={row.bank_name} />
            <Info label="Số tài khoản" value={row.account_number} mono copy />
            <Info label="Chủ tài khoản" value={row.account_name} copy />
            <Info label="Số tiền thực nhận" value={formatVND(row.amount)} copyValue={String(row.amount)} strong />
            <Info label="Nội dung chuyển khoản" value={`Giai ngan don ${code}`} copy />
          </dl>

          {row.order && (
            <p className="text-xs text-slate-500">
              Người mua chuyển {formatVND(row.order.amount)} − phí sàn {formatVND(row.order.platform_fee)} = chuyển cho người bán {formatVND(row.order.seller_payout)}
            </p>
          )}

          {error && <Alert kind="error">{error}</Alert>}

          <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
            <input className="input sm:max-w-[16rem]" placeholder="Mã giao dịch ngân hàng (tùy chọn)" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} aria-label="Mã giao dịch ngân hàng" />
            {confirming ? (
              <div className="flex gap-2 sm:ml-auto">
                <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>Chưa</button>
                <button type="button" className="btn-primary" onClick={confirm} disabled={busy}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Chắc chắn đã chuyển {formatVND(row.amount)}
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary sm:ml-auto" onClick={() => setConfirming(true)}>
                <CheckCircle2 className="h-4 w-4" /> Xác nhận đã chuyển tiền
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

function Info({ label, value, mono = false, strong = false, copy = false, copyValue }: {
  label: string; value: string; mono?: boolean; strong?: boolean; copy?: boolean; copyValue?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className={`truncate ${mono ? 'font-mono' : ''} ${strong ? 'text-base font-semibold text-brand-800' : 'font-medium text-slate-900'}`}>{value}</dd>
      </div>
      {(copy || copyValue) && <CopyButton value={copyValue ?? value} />}
    </div>
  );
}
