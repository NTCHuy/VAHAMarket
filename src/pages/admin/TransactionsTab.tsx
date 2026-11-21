import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Landmark, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { markTransactionResolved } from '@/lib/admin';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import CopyButton from '@/components/CopyButton';
import { Alert, PageLoader } from '@/components/ui';
import type { Transaction, TransactionMatchStatus } from '@/types';

interface TxRow extends Transaction {
  order: { payment_code: string; amount: number; paid_amount: number; status: string } | null;
}

const FLAGGED: TransactionMatchStatus[] = ['UNDERPAID', 'LATE_PAYMENT', 'EXTRA_PAYMENT', 'UNMATCHED', 'OVERPAID'];

const STATUS_INFO: Record<string, { label: string; cls: string; hint: (r: TxRow) => string }> = {
  UNDERPAID: {
    label: 'Chuyển thiếu', cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300',
    hint: (r) => r.order ? `Đơn cần ${formatVND(r.order.amount)}, đã nhận ${formatVND(r.order.paid_amount)}. Yêu cầu chuyển bù hoặc hoàn lại tiền.` : 'Yêu cầu chuyển bù hoặc hoàn lại tiền.',
  },
  OVERPAID: {
    label: 'Chuyển thừa', cls: 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-400',
    hint: (r) => r.order ? `Đơn đã chuyển sang giữ tiền. Hoàn lại phần dư ${formatVND(Math.max(0, r.order.paid_amount - r.order.amount))} cho người chuyển.` : 'Hoàn lại phần dư cho người chuyển.',
  },
  LATE_PAYMENT: {
    label: 'Tiền về muộn', cls: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400',
    hint: () => 'Đơn đã hủy/hết hạn. Nếu tin còn, có thể “Duyệt thanh toán thủ công” ở tab Tất cả đơn hàng; nếu không, hoàn tiền.',
  },
  EXTRA_PAYMENT: {
    label: 'Chuyển trùng', cls: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400',
    hint: () => 'Đơn đã được thanh toán đủ trước đó. Hoàn lại khoản chuyển trùng.',
  },
  UNMATCHED: {
    label: 'Không khớp đơn', cls: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
    hint: () => 'Nội dung không có mã đơn hợp lệ. Tìm người chuyển; nếu đúng tiền một đơn thì duyệt thủ công, nếu không thì hoàn tiền.',
  },
};

export default function TransactionsTab({ onChanged }: { onChanged: () => void }) {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('transactions')
      .select('*, order:orders(payment_code, amount, paid_amount, status)')
      .in('match_status', FLAGGED)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!showResolved) query = query.is('resolved_at', null);
    const { data, error: err } = await query;
    if (err) setError(getErrorMessage(err));
    else {
      setRows((data ?? []) as unknown as TxRow[]);
      setError(null);
    }
    setLoading(false);
  }, [showResolved]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 text-brand-700 dark:text-brand-400" />
        Hiện cả giao dịch đã xử lý
      </label>

      {loading ? (
        <PageLoader />
      ) : error ? (
        <Alert kind="error">{error}</Alert>
      ) : rows.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Landmark className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Không có giao dịch lệch nào cần tra soát.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <TxCard key={r.id} row={r} onDone={async () => { await load(); onChanged(); }} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TxCard({ row, onDone }: { row: TxRow; onDone: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = STATUS_INFO[row.match_status];
  const resolved = row.resolved_at !== null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await markTransactionResolved(row.id, note.trim());
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <li className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${info?.cls ?? ''}`}>{info?.label ?? row.match_status}</span>
          <span className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatVND(row.amount)}</span>
        </div>
        <span className="text-xs text-slate-500 dark:text-slate-400">{new Date(row.transaction_date).toLocaleString('vi-VN')}</span>
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex gap-2"><dt className="text-slate-500 dark:text-slate-400">Nội dung:</dt><dd className="min-w-0 break-words font-medium text-slate-900 dark:text-slate-100">{row.content || '—'}</dd></div>
        <div className="flex items-center gap-2"><dt className="text-slate-500 dark:text-slate-400">Mã tham chiếu NH:</dt><dd className="font-mono">{row.reference_code ?? '—'}</dd>{row.reference_code && <CopyButton value={row.reference_code} />}</div>
        <div className="flex gap-2"><dt className="text-slate-500 dark:text-slate-400">Đơn liên quan:</dt><dd className="font-mono">{row.order?.payment_code ?? '—'}</dd></div>
        <div className="flex gap-2"><dt className="text-slate-500 dark:text-slate-400">Mã GD {row.provider}:</dt><dd className="font-mono">{row.provider_tx_id}</dd></div>
      </dl>

      {info && <p className="rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs text-slate-600 dark:text-slate-400">{info.hint(row)}</p>}

      {resolved ? (
        <p className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Đã xử lý {row.resolved_at && new Date(row.resolved_at).toLocaleString('vi-VN')}: {row.resolved_note}</span>
        </p>
      ) : (
        <>
          {error && <Alert kind="error">{error}</Alert>}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input className="input" placeholder="Ghi chú cách xử lý (VD: đã hoàn tiền, mã GD FT123...)" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Ghi chú xử lý" />
            <button type="button" className="btn-primary shrink-0" disabled={busy || note.trim().length < 3} onClick={submit}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Đánh dấu đã xử lý
            </button>
          </div>
        </>
      )}
    </li>
  );
}
