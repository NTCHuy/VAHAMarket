import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Alert } from '@/components/ui';

type FilterMode = 'ALL' | 'IN' | 'OUT';

interface TransparencySummary {
  total_inflow_vnd: number;
  currently_held_vnd: number;
  total_paid_out_vnd: number;
  total_refunded_vnd: number;
  completed_orders_count: number;
  active_held_count: number;
  updated_at: string;
}

interface LedgerRow {
  event_id: string;
  direction: 'IN' | 'OUT_PAYOUT' | 'OUT_REFUND';
  event_at: string;
  amount: number;
  masked_code: string;
  item_title: string;
  order_status: string;
  reference_masked: string | null;
}

const PAGE_SIZE = 30;

const FILTERS: { id: FilterMode; label: string }[] = [
  { id: 'ALL', label: 'Tất cả dòng tiền' },
  { id: 'IN', label: 'Tiền vào trung gian' },
  { id: 'OUT', label: 'Tiền ra (Giải ngân & Hoàn tiền)' },
];

const DIRECTION_META: Record<LedgerRow['direction'], { label: string; sign: '+' | '−'; cls: string }> = {
  IN: {
    label: 'Tiền vào trung gian',
    sign: '+',
    cls: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300',
  },
  OUT_PAYOUT: {
    label: 'Giải ngân người bán',
    sign: '−',
    cls: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300',
  },
  OUT_REFUND: {
    label: 'Hoàn tiền người mua',
    sign: '−',
    cls: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300',
  },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Transparency() {
  useDocumentTitle('Minh bạch dòng tiền trung gian');
  const [filter, setFilter] = useState<FilterMode>('ALL');
  const [summary, setSummary] = useState<TransparencySummary | null>(null);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async (mode: FilterMode) => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, ledRes] = await Promise.all([
        supabase.rpc('get_escrow_transparency_summary'),
        supabase.rpc('get_escrow_transparency_ledger', {
          p_direction: mode,
          p_limit: PAGE_SIZE,
          p_offset: 0,
        }),
      ]);
      if (sumRes.error) throw sumRes.error;
      if (ledRes.error) throw ledRes.error;
      setSummary((sumRes.data ?? null) as TransparencySummary | null);
      const list = (ledRes.data ?? []) as LedgerRow[];
      setRows(list);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(filter);
  }, [filter, loadData]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { data, error: err } = await supabase.rpc('get_escrow_transparency_ledger', {
        p_direction: filter,
        p_limit: PAGE_SIZE,
        p_offset: rows.length,
      });
      if (err) throw err;
      const more = (data ?? []) as LedgerRow[];
      setRows((prev) => [...prev, ...more]);
      setHasMore(more.length === PAGE_SIZE);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="min-w-0 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
            <ShieldCheck size={14} strokeWidth={1.75} /> Dữ liệu đối soát trực tiếp từ hệ thống · 0% phí
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-2xl">
            Minh bạch dòng tiền trung gian
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
            Toàn bộ giao dịch tiền vào (khi đơn được xác nhận thanh toán) và tiền ra (giải ngân cho người bán hoặc hoàn
            tiền cho người mua) được đồng bộ trực tiếp từ cơ sở dữ liệu đơn hàng của VAHA Market. Thông tin cá nhân và
            số tài khoản ngân hàng được ẩn để bảo vệ quyền riêng tư.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData(filter)}
          disabled={loading}
          className="btn-secondary shrink-0 self-start text-xs"
        >
          <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </header>

      {error && <Alert kind="error">{error}</Alert>}

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Tổng hợp dòng tiền trung gian">
        <div className="card space-y-1 p-4">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Đang giữ bảo lãnh</p>
          <p className="text-lg font-semibold tabular-nums text-blue-700 dark:text-blue-400 sm:text-xl">
            {summary ? formatVND(summary.currently_held_vnd) : '—'}
          </p>
          <p className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
            {summary ? `${summary.active_held_count} đơn đang xử lý` : 'Đang tải...'}
          </p>
        </div>

        <div className="card space-y-1 p-4">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Tổng tiền đã vào</p>
          <p className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-xl">
            {summary ? formatVND(summary.total_inflow_vnd) : '—'}
          </p>
          <p className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
            {summary ? `${summary.completed_orders_count} giao dịch hoàn tất` : 'Đang tải...'}
          </p>
        </div>

        <div className="card space-y-1 p-4">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Đã giải ngân người bán</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-950 dark:text-neutral-50 sm:text-xl">
            {summary ? formatVND(summary.total_paid_out_vnd) : '—'}
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Chuyển đủ 100% giá bán</p>
        </div>

        <div className="card space-y-1 p-4">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Đã hoàn tiền người mua</p>
          <p className="text-lg font-semibold tabular-nums text-neutral-950 dark:text-neutral-50 sm:text-xl">
            {summary ? formatVND(summary.total_refunded_vnd) : '—'}
          </p>
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Đơn hủy / khiếu nại</p>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:px-5">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === f.id
                    ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-950'
                    : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {summary?.updated_at && (
            <p className="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
              Cập nhật: {formatTime(summary.updated_at)}
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-500 dark:text-neutral-400">
            <Loader2 size={16} className="animate-spin" /> Đang tải sổ dòng tiền...
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Chưa có bản ghi dòng tiền nào trong mục này.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {rows.map((r) => {
              const meta = DIRECTION_META[r.direction];
              const isIn = r.direction === 'IN';
              return (
                <div
                  key={r.event_id}
                  className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-medium ${meta.cls}`}>
                        {isIn ? <ArrowDownLeft size={12} strokeWidth={2} /> : <ArrowUpRight size={12} strokeWidth={2} />}
                        {meta.label}
                      </span>
                      <span className="font-mono text-xs font-medium text-neutral-700 dark:text-neutral-300">
                        {r.masked_code}
                      </span>
                      {r.reference_masked && (
                        <span className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                          Ref {r.reference_masked}
                        </span>
                      )}
                    </div>
                    <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {r.item_title}
                    </p>
                    <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                      {formatTime(r.event_at)}
                    </p>
                  </div>

                  <div className="shrink-0 text-left tabular-nums sm:text-right">
                    <p
                      className={`text-sm font-semibold sm:text-base ${
                        isIn ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-900 dark:text-neutral-100'
                      }`}
                    >
                      {meta.sign} {formatVND(r.amount)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div className="border-t border-neutral-200 px-4 py-3 text-center dark:border-neutral-800">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="btn-secondary text-xs">
              {loadingMore && <Loader2 size={14} className="animate-spin" />}
              Tải thêm giao dịch
            </button>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-neutral-500 dark:text-neutral-400">
        <p>Mọi giao dịch trung gian trên VAHA Market đều miễn phí 0%.</p>
        <div className="flex items-center gap-3">
          <Link to="/support" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
            Ủng hộ duy trì sàn
          </Link>
          <span>·</span>
          <Link to="/terms" className="hover:underline">
            Điều khoản dịch vụ
          </Link>
        </div>
      </div>
    </div>
  );
}
