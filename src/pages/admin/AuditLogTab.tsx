import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { History, Loader2, Search, UserCheck } from 'lucide-react';
import { listAuditLogs } from '@/lib/admin';
import { getErrorMessage } from '@/lib/errors';
import { Alert, PageLoader } from '@/components/ui';
import type { AdminAuditCategory, AdminAuditLogEntry } from '@/types';

const PAGE = 50;

const CATEGORIES: { id: AdminAuditCategory; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'listings', label: 'Tin đăng' },
  { id: 'reviews', label: 'Đánh giá' },
  { id: 'bans', label: 'Cảnh báo & Khóa' },
  { id: 'orders', label: 'Đơn & Giao dịch' },
  { id: 'members', label: 'Thành viên' },
  { id: 'settings', label: 'Cấu hình' },
];

const ACTION_LABELS: Record<string, string> = {
  REVIEW_LISTING_APPROVE: 'Duyệt tin đăng',
  REVIEW_LISTING_REJECT: 'Từ chối tin đăng',
  UPDATE_LISTING_PRICE: 'Chỉnh giá tin đăng',
  REMOVE_LISTING: 'Gỡ tin đăng',
  DELETE_LISTING: 'Xóa vĩnh viễn tin đăng',
  RESTORE_LISTING: 'Khôi phục tin đăng',
  RESOLVE_LISTING_REPORT: 'Xử lý báo cáo tin',
  HIDE_REVIEW: 'Ẩn đánh giá',
  SHOW_REVIEW: 'Hiện lại đánh giá',
  BAN_USER: 'Khóa tài khoản',
  UNBAN_USER: 'Gỡ khóa tài khoản',
  ISSUE_WARNING: 'Cảnh báo thành viên',
  AUTO_BAN_3_STRIKES: 'Tự động khóa (3/3)',
  ADD_BANNED_ENTITY: 'Thêm danh sách đen',
  REMOVE_BANNED_ENTITY: 'Gỡ danh sách đen',
  MARK_PAID_OUT: 'Xác nhận giải ngân',
  MARK_REFUNDED: 'Xác nhận hoàn tiền',
  FORCE_REFUND_ORDER: 'Cưỡng chế hoàn tiền',
  FORCE_COMPLETE_SHIPPED: 'Xác nhận giao >14 ngày',
  RESOLVE_DISPUTE_RELEASE_TO_SELLER: 'Phân xử: giải ngân',
  RESOLVE_DISPUTE_REFUND_TO_BUYER: 'Phân xử: hoàn tiền',
  MANUAL_CONFIRM_PAYMENT: 'Duyệt thanh toán tay',
  RESOLVE_TRANSACTION: 'Xử lý giao dịch lệch',
  GRANT_MOD: 'Gắn huy hiệu Mod',
  REVOKE_MOD: 'Gỡ huy hiệu Mod',
  ADD_MEMBER_NOTE: 'Thêm ghi chú hồ sơ',
  DELETE_MEMBER_NOTE: 'Xóa ghi chú hồ sơ',
  UPDATE_MEMBER_IDENTITY: 'Sửa định danh thành viên',
  SET_GLOBAL_FEE_RATE: 'Đổi phí sàn',
  SET_FEE_CAP: 'Đổi trần phí',
};

export default function AuditLogTab({
  onInspectMember,
}: {
  onInspectMember: (userId: string) => void;
}) {
  const [category, setCategory] = useState<AdminAuditCategory>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<AdminAuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAuditLogs({ action: category, query: debounced, limit: PAGE, offset: 0 });
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [category, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await listAuditLogs({ action: category, query: debounced, limit: PAGE, offset: items.length });
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            className="input pl-9"
            placeholder="Tìm theo ghi chú, tên thành viên, mã đơn (CNTH...)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Tìm nhật ký quản trị"
          />
        </div>
      </div>

      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
              category === c.id
                ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-900/40 dark:text-brand-300'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <History className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Chưa có nhật ký nào phù hợp.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{total} bản ghi</p>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="border-b border-neutral-200 bg-neutral-50 uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:bg-neutral-800/60 dark:text-neutral-400">
                <tr>
                  <th className="px-3 py-2.5">Thời gian</th>
                  <th className="px-3 py-2.5">Hành động</th>
                  <th className="px-3 py-2.5">Người thực hiện</th>
                  <th className="px-3 py-2.5">Đối tượng</th>
                  <th className="px-3 py-2.5">Ghi chú</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {items.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap px-3 py-2.5 text-neutral-500 dark:text-neutral-400">
                      {new Date(log.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="badge font-medium">
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-medium text-neutral-800 dark:text-neutral-200">
                      {log.admin_name}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {log.target_user_id && (
                          <button
                            type="button"
                            onClick={() => onInspectMember(log.target_user_id!)}
                            className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 font-medium text-neutral-800 hover:border-brand-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                          >
                            <UserCheck className="h-3 w-3" />
                            {log.target_user_name ?? 'Thành viên'}
                          </button>
                        )}
                        {log.order_id && (
                          <Link
                            to={`/orders/${log.order_id}`}
                            className="font-mono text-brand-700 hover:underline dark:text-brand-400"
                          >
                            {log.payment_code ?? 'Đơn hàng'}
                          </Link>
                        )}
                        {log.listing_id && (
                          <Link
                            to={`/listing/${log.listing_id}`}
                            className="text-brand-700 hover:underline dark:text-brand-400"
                          >
                            Xem tin
                          </Link>
                        )}
                        {!log.target_user_id && !log.order_id && !log.listing_id && (
                          <span className="text-neutral-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="max-w-md px-3 py-2.5 text-neutral-700 dark:text-neutral-300">
                      {log.note ? <span className="break-words">{log.note}</span> : <span className="text-neutral-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {items.length < total && (
            <div className="flex justify-center">
              <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Xem thêm
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
