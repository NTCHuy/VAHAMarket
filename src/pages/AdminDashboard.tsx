import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Banknote, Flag, History, Landmark, Lock, Percent, RotateCcw, ShieldBan, Star, Users, type LucideIcon } from 'lucide-react';
import { getAdminStats, type AdminStats } from '@/lib/admin';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { Alert } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import ReviewTab from './admin/ReviewTab';
import PayoutsTab from './admin/PayoutsTab';
import RefundsTab from './admin/RefundsTab';
import DisputesTab from './admin/DisputesTab';
import TransactionsTab from './admin/TransactionsTab';
import OrdersTab from './admin/OrdersTab';
import ListingsTab from './admin/ListingsTab';
import MembersTab from './admin/MembersTab';
import BansTab from './admin/BansTab';
import ReportsTab from './admin/ReportsTab';
import ReviewsTab from './admin/ReviewsTab';
import AuditLogTab from './admin/AuditLogTab';
import MemberDetailModal from './admin/MemberDetailModal';
import FeeSettingsCard from './admin/FeeSettingsCard';

type TabId = 'review' | 'reports' | 'reviews' | 'payouts' | 'refunds' | 'disputes' | 'transactions' | 'orders' | 'listings' | 'members' | 'bans' | 'audit';
const TAB_IDS: TabId[] = ['review', 'reports', 'reviews', 'payouts', 'refunds', 'disputes', 'transactions', 'orders', 'listings', 'members', 'bans', 'audit'];

export default function AdminDashboard() {
  useDocumentTitle('Quản trị hệ thống');
  const [params, setParams] = useSearchParams();
  const tab = (TAB_IDS.includes(params.get('tab') as TabId) ? params.get('tab') : 'review') as TabId;

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inspectUserId, setInspectUserId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await getAdminStats());
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, []);

  const handleGlobalMutated = useCallback(() => {
    void refreshStats();
    setRefreshTick((n) => n + 1);
  }, [refreshStats]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const tabs: { id: TabId; label: string; badge?: number }[] = [
    { id: 'review', label: 'Duyệt tin', badge: stats?.pending_review_count },
    { id: 'reports', label: 'Báo cáo', badge: stats?.open_reports_count },
    { id: 'reviews', label: 'Đánh giá', badge: stats?.total_reviews_count },
    { id: 'payouts', label: 'Giải ngân', badge: stats?.payout_pending_count },
    { id: 'refunds', label: 'Hoàn tiền', badge: stats?.refund_pending_count },
    { id: 'disputes', label: 'Khiếu nại', badge: stats?.dispute_count },
    { id: 'transactions', label: 'Giao dịch lệch', badge: stats?.flagged_tx_count },
    { id: 'orders', label: 'Đơn hàng', badge: stats?.overdue_shipped_count },
    { id: 'listings', label: 'Quản lý tin' },
    { id: 'members', label: 'Thành viên', badge: stats?.total_members },
    { id: 'bans', label: 'Cảnh báo & Khóa', badge: stats?.banned_count },
    { id: 'audit', label: 'Nhật ký' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Quản trị</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Duyệt tin, giải ngân, hoàn tiền, kiểm duyệt thành viên và nhật ký hệ thống.
          {stats?.total_members !== undefined && stats?.active_listings_count !== undefined && (
            <span className="ml-1 text-neutral-500 dark:text-neutral-400">
              ({stats.total_members} thành viên · {stats.active_listings_count} tin đang bán)
            </span>
          )}
        </p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Banknote} label="Tổng giá trị giao dịch" value={stats ? formatVND(stats.gmv) : '—'} sub="Đơn đã hoàn tất" />
        <StatCard icon={Percent} label="Phí sàn đã thu" value={stats ? formatVND(stats.fees) : '—'} sub={stats ? `Chờ giải ngân: ${formatVND(stats.payout_pending_amount)}` : undefined} />
        <StatCard icon={Lock} label="Đơn đang giữ tiền" value={stats ? String(stats.held_count) : '—'} sub={stats ? `${formatVND(stats.held_amount)}` : undefined} />
        <StatCard icon={AlertTriangle} label="Đơn đang khiếu nại" value={stats ? String(stats.dispute_count) : '—'} sub="Cần phân xử" tone={stats && stats.dispute_count > 0 ? 'danger' : 'normal'} />
      </div>

      <FeeSettingsCard />

      <div role="tablist" className="flex max-w-full gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${tab === t.id ? 'border-brand-700 dark:border-brand-500 text-brand-800 dark:text-brand-300' : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}`}>
            {t.id === 'reports' && <Flag className="h-4 w-4" />}
            {t.id === 'reviews' && <Star className="h-4 w-4" />}
            {t.id === 'refunds' && <RotateCcw className="h-4 w-4" />}
            {t.id === 'transactions' && <Landmark className="h-4 w-4" />}
            {t.id === 'members' && <Users className="h-4 w-4" />}
            {t.id === 'bans' && <ShieldBan className="h-4 w-4" />}
            {t.id === 'audit' && <History className="h-4 w-4" />}
            {t.label}
            {t.badge !== undefined && t.badge > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] font-semibold leading-5 ${
                t.id === 'members' || t.id === 'reviews'
                  ? 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                  : 'bg-red-600 text-white'
              }`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'review' && <ReviewTab onChanged={refreshStats} onInspectMember={setInspectUserId} />}
      {tab === 'reports' && <ReportsTab onChanged={refreshStats} onInspectMember={setInspectUserId} refreshSignal={refreshTick} />}
      {tab === 'reviews' && <ReviewsTab onChanged={refreshStats} onInspectMember={setInspectUserId} refreshSignal={refreshTick} />}
      {tab === 'payouts' && <PayoutsTab onChanged={refreshStats} />}
      {tab === 'refunds' && <RefundsTab onChanged={refreshStats} />}
      {tab === 'disputes' && <DisputesTab onChanged={refreshStats} onInspectMember={setInspectUserId} />}
      {tab === 'transactions' && <TransactionsTab onChanged={refreshStats} />}
      {tab === 'orders' && <OrdersTab onChanged={refreshStats} overdueCount={stats?.overdue_shipped_count ?? 0} />}
      {tab === 'listings' && <ListingsTab onChanged={refreshStats} onInspectMember={setInspectUserId} refreshSignal={refreshTick} />}
      {tab === 'members' && <MembersTab onChanged={refreshStats} onInspectMember={setInspectUserId} refreshSignal={refreshTick} />}
      {tab === 'bans' && <BansTab onChanged={refreshStats} onInspectMember={setInspectUserId} refreshSignal={refreshTick} />}
      {tab === 'audit' && <AuditLogTab onInspectMember={setInspectUserId} />}

      {inspectUserId && (
        <MemberDetailModal
          userId={inspectUserId}
          onClose={() => setInspectUserId(null)}
          onSelectUser={(uid) => setInspectUserId(uid)}
          onMutated={handleGlobalMutated}
        />
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone = 'normal' }: {
  icon: LucideIcon; label: string; value: string; sub?: string; tone?: 'normal' | 'danger';
}) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
        <Icon className={`h-4 w-4 ${tone === 'danger' ? 'text-red-500' : 'text-brand-600 dark:text-brand-400'}`} /> {label}
      </div>
      <p className={`mt-2 text-xl font-semibold tracking-tight sm:text-2xl ${tone === 'danger' ? 'text-red-700 dark:text-red-400' : 'text-neutral-900 dark:text-neutral-100'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{sub}</p>}
    </div>
  );
}
