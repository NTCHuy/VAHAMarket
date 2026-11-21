import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Banknote, Landmark, Lock, Percent, type LucideIcon } from 'lucide-react';
import { getAdminStats, type AdminStats } from '@/lib/admin';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { Alert } from '@/components/ui';
import ReviewTab from './admin/ReviewTab';
import PayoutsTab from './admin/PayoutsTab';
import DisputesTab from './admin/DisputesTab';
import TransactionsTab from './admin/TransactionsTab';
import OrdersTab from './admin/OrdersTab';
import ListingsTab from './admin/ListingsTab';
import MembersTab from './admin/MembersTab';
import FeeSettingsCard from './admin/FeeSettingsCard';

type TabId = 'review' | 'payouts' | 'disputes' | 'transactions' | 'orders' | 'listings' | 'members';
const TAB_IDS: TabId[] = ['review', 'payouts', 'disputes', 'transactions', 'orders', 'listings', 'members'];

export default function AdminDashboard() {
  const [params, setParams] = useSearchParams();
  const tab = (TAB_IDS.includes(params.get('tab') as TabId) ? params.get('tab') : 'review') as TabId;

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getAdminStats());
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'review', label: 'Duyệt tin', badge: stats?.pending_review_count },
    { id: 'payouts', label: 'Giải ngân', badge: stats?.payout_pending_count },
    { id: 'disputes', label: 'Khiếu nại', badge: stats?.dispute_count },
    { id: 'transactions', label: 'Giao dịch lệch', badge: stats?.flagged_tx_count },
    { id: 'orders', label: 'Tất cả đơn hàng' },
    { id: 'listings', label: 'Tin đăng & giá' },
    { id: 'members', label: 'Mod' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quản trị</h1>
        <p className="mt-1 text-sm text-slate-600">Giải ngân, xử lý khiếu nại và tra soát biến động số dư.</p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Banknote} label="Tổng giá trị giao dịch (GMV)" value={stats ? formatVND(stats.gmv) : '—'} sub="Giá hàng, đơn đã hoàn tất" />
        <StatCard icon={Percent} label="Phí sàn đã thu" value={stats ? formatVND(stats.fees) : '—'} sub={stats ? `Chờ giải ngân: ${formatVND(stats.payout_pending_amount)}` : undefined} />
        <StatCard icon={Lock} label="Đơn đang giữ tiền" value={stats ? String(stats.held_count) : '—'} sub={stats ? `${formatVND(stats.held_amount)} (đã TT / đang giao)` : undefined} />
        <StatCard icon={AlertTriangle} label="Đơn đang khiếu nại" value={stats ? String(stats.dispute_count) : '—'} sub="Cần phân xử" tone={stats && stats.dispute_count > 0 ? 'danger' : 'normal'} />
      </div>

      <FeeSettingsCard />

      <div role="tablist" className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {t.id === 'transactions' && <Landmark className="h-4 w-4" />}
            {t.label}
            {t.badge !== undefined && t.badge > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-5 text-white">{t.badge}</span>}
          </button>
        ))}
      </div>

      {tab === 'review' && <ReviewTab onChanged={refreshStats} />}
      {tab === 'payouts' && <PayoutsTab onChanged={refreshStats} />}
      {tab === 'disputes' && <DisputesTab onChanged={refreshStats} />}
      {tab === 'transactions' && <TransactionsTab onChanged={refreshStats} />}
      {tab === 'orders' && <OrdersTab onChanged={refreshStats} />}
      {tab === 'listings' && <ListingsTab />}
      {tab === 'members' && <MembersTab />}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = 'normal' }: {
  icon: LucideIcon; label: string; value: string; sub?: string; tone?: 'normal' | 'danger';
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Icon className={`h-4 w-4 ${tone === 'danger' ? 'text-red-500' : 'text-brand-600'}`} /> {label}
      </div>
      <p className={`mt-2 text-xl font-semibold tracking-tight sm:text-2xl ${tone === 'danger' ? 'text-red-700' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}
