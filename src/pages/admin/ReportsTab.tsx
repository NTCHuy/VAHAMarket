import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CheckCircle2, Eye, Flag, Loader2, MessageSquare, ShieldCheck, Trash2, XCircle } from 'lucide-react';
import { listChatReports, listListingReports, resolveChatReport, resolveListingReport } from '@/lib/admin';
import { getReportReasonLabel } from '@/lib/community';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { Alert, PageLoader } from '@/components/ui';
import AdminChatViewerModal from './AdminChatViewerModal';
import ListingModerationModal from './ListingModerationModal';
import type { AdminChatReport, AdminListingReport, ChatReportStatus, Listing, ListingReportStatus, ListingStatus } from '@/types';

const PAGE = 30;

const FILTERS: { id: ListingReportStatus | 'all'; label: string }[] = [
  { id: 'open', label: 'Chờ xử lý' },
  { id: 'resolved', label: 'Đã xử lý' },
  { id: 'dismissed', label: 'Đã bỏ qua' },
  { id: 'all', label: 'Tất cả' },
];

const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  active: 'Đang bán',
  draft: 'Nháp',
  pending_review: 'Chờ duyệt',
  rejected: 'Bị từ chối',
  hidden: 'Ẩn',
  reserved: 'Giữ chỗ',
  sold: 'Đã bán',
  removed: 'Đã gỡ',
};

export default function ReportsTab({
  onChanged,
  onInspectMember,
  refreshSignal = 0,
}: {
  onChanged: () => void;
  onInspectMember?: (userId: string) => void;
  refreshSignal?: number;
}) {
  const [kind, setKind] = useState<'listings' | 'chat'>('listings');
  const [statusFilter, setStatusFilter] = useState<ListingReportStatus | 'all'>('open');
  const [items, setItems] = useState<AdminListingReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [chatItems, setChatItems] = useState<AdminChatReport[]>([]);
  const [chatTotal, setChatTotal] = useState(0);
  const [chatLoading, setChatLoading] = useState(false);
  const [viewChatReportId, setViewChatReportId] = useState<string | null>(null);

  const [modModal, setModModal] = useState<{
    mode: 'remove' | 'delete';
    report: AdminListingReport;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listListingReports({ status: statusFilter, limit: PAGE, offset: 0 });
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, refreshSignal]);

  const loadChatReports = useCallback(async () => {
    setChatLoading(true);
    try {
      const res = await listChatReports({ status: statusFilter as ChatReportStatus | 'all', limit: PAGE, offset: 0 });
      setChatItems(res.items);
      setChatTotal(res.total);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setChatLoading(false);
    }
  }, [statusFilter, refreshSignal]);

  useEffect(() => {
    if (kind === 'listings') void load();
    else void loadChatReports();
  }, [kind, load, loadChatReports]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await listListingReports({ status: statusFilter, limit: PAGE, offset: items.length });
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Danh sách phản ánh từ thành viên về tin đăng hoặc hội thoại có dấu hiệu vi phạm.
        </p>
        <div className="inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-800 dark:bg-neutral-900">
          <button
            type="button"
            onClick={() => setKind('listings')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              kind === 'listings'
                ? 'bg-brand-700 text-white'
                : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            <Flag className="h-3.5 w-3.5" /> Báo cáo tin đăng
          </button>
          <button
            type="button"
            onClick={() => setKind('chat')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              kind === 'chat'
                ? 'bg-brand-700 text-white'
                : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" /> Báo cáo hội thoại
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setStatusFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              statusFilter === f.id
                ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-900/40 dark:text-brand-300'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {notice && <Alert kind="success">{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {kind === 'chat' ? (
        chatLoading ? (
          <PageLoader />
        ) : chatItems.length === 0 ? (
          <div className="card flex flex-col items-center px-4 py-12 text-center">
            <ShieldCheck className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Không có báo cáo hội thoại nào trong mục này.</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">{chatTotal} báo cáo hội thoại</p>
            <ul className="space-y-3">
              {chatItems.map((cr) => (
                <ChatReportCard
                  key={cr.id}
                  report={cr}
                  onViewChat={() => setViewChatReportId(cr.id)}
                  onInspectMember={onInspectMember}
                  onResolved={async (msg) => {
                    setNotice(msg);
                    await loadChatReports();
                    onChanged();
                  }}
                />
              ))}
            </ul>
          </>
        )
      ) : loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <ShieldCheck className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Không có báo cáo nào trong mục này.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{total} báo cáo</p>
          <ul className="space-y-3">
            {items.map((r) => (
              <ReportCard
                key={r.id}
                report={r}
                onInspectMember={onInspectMember}
                onOpenMod={(mode) => setModModal({ mode, report: r })}
                onResolved={async (msg) => {
                  setNotice(msg);
                  await load();
                  onChanged();
                }}
              />
            ))}
          </ul>
          {items.length < total && (
            <div className="flex justify-center">
              <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Xem thêm
              </button>
            </div>
          )}
        </>
      )}

      {modModal && (
        <ListingModerationModal
          mode={modModal.mode}
          listing={modModal.report.listing as unknown as Pick<Listing, 'id' | 'title' | 'price' | 'status' | 'images'>}
          sellerName={modModal.report.seller?.display_name}
          sellerIsBanned={modModal.report.seller?.is_banned}
          sellerWarningCount={modModal.report.seller?.warning_count}
          onClose={() => setModModal(null)}
          onDone={async () => {
            const target = modModal;
            setModModal(null);
            if (target.mode === 'remove' && target.report.status === 'open') {
              try {
                await resolveListingReport(target.report.id, 'resolved', {
                  note: 'Đã gỡ tin đăng theo báo cáo.',
                  resolveAllForListing: true,
                });
              } catch {
                // ignore follow-up resolve error
              }
            }
            setNotice(
              target.mode === 'delete'
                ? 'Đã xóa vĩnh viễn tin đăng vi phạm.'
                : 'Đã gỡ tin đăng và đóng báo cáo liên quan.',
            );
            await load();
            onChanged();
          }}
        />
      )}

      {viewChatReportId && (
        <AdminChatViewerModal
          target={{ type: 'report', reportId: viewChatReportId }}
          onClose={() => setViewChatReportId(null)}
          onInspectMember={onInspectMember}
        />
      )}
    </div>
  );
}

function ReportCard({
  report,
  onInspectMember,
  onOpenMod,
  onResolved,
}: {
  report: AdminListingReport;
  onInspectMember?: (userId: string) => void;
  onOpenMod: (mode: 'remove' | 'delete') => void;
  onResolved: (msg: string) => Promise<void>;
}) {
  const [actionMode, setActionMode] = useState<'resolved' | 'dismissed' | null>(null);
  const [note, setNote] = useState('');
  const [resolveAll, setResolveAll] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const l = report.listing;
  const lockedByOrder = l.status === 'reserved' || l.status === 'sold';

  const submitResolve = async () => {
    if (!actionMode) return;
    setBusy(true);
    setError(null);
    try {
      const res = await resolveListingReport(report.id, actionMode, {
        note: note.trim() || undefined,
        resolveAllForListing: resolveAll,
      });
      setActionMode(null);
      setNote('');
      await onResolved(
        `${actionMode === 'resolved' ? 'Đã đánh dấu xử lý' : 'Đã bỏ qua'} ${res.updated_count} báo cáo.`,
      );
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <li className={`card space-y-3 p-4 ${report.status === 'open' ? 'border-amber-200 dark:border-amber-800/70' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="badge border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
            <Flag className="mr-1 h-3 w-3" /> {getReportReasonLabel(report.reason_category)}
          </span>
          {report.open_reports_count > 1 && report.status === 'open' && (
            <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
              {report.open_reports_count} báo cáo đang mở
            </span>
          )}
          {report.status !== 'open' && (
            <span className="badge">
              {report.status === 'resolved' ? 'Đã xử lý' : 'Đã bỏ qua'}
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {new Date(report.created_at).toLocaleString('vi-VN')}
        </span>
      </div>

      {/* Tin bị báo cáo */}
      <div className="flex gap-3 rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800/60">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-700">
          {l.images[0]?.url && (
            <img src={cldUrl(l.images[0].url, { width: 120, height: 120, crop: 'fill' })} alt="" className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <Link to={`/listing/${l.id}`} className="line-clamp-1 text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-100">
            {l.title}
          </Link>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">{formatVND(l.price)}</span>
            <span className="badge">{LISTING_STATUS_LABEL[l.status]}</span>
            <span>Người bán: <strong>{report.seller?.display_name ?? '—'}</strong></span>
            {onInspectMember && report.seller && (
              <button
                type="button"
                onClick={() => onInspectMember(report.seller!.id)}
                className="inline-flex items-center gap-1 rounded border border-neutral-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-neutral-700 hover:border-brand-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300"
              >
                <Eye className="h-3 w-3" /> Hồ sơ người bán
              </button>
            )}
          </p>
        </div>
      </div>

      {/* Chi tiết báo cáo */}
      <div className="space-y-1 text-xs text-neutral-700 dark:text-neutral-300">
        <p className="flex flex-wrap items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <span>Người báo cáo: <strong className="text-neutral-800 dark:text-neutral-200">{report.reporter?.display_name ?? 'Thành viên'}</strong></span>
          {onInspectMember && report.reporter && (
            <button
              type="button"
              onClick={() => onInspectMember(report.reporter!.id)}
              className="text-brand-700 hover:underline dark:text-brand-400"
            >
              Xem hồ sơ
            </button>
          )}
        </p>
        {report.details && (
          <p className="whitespace-pre-line rounded border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950">
            {report.details}
          </p>
        )}
        {report.resolution_note && (
          <p className="text-neutral-500 dark:text-neutral-400">
            <strong>Ghi chú xử lý ({report.resolver_name ?? 'Admin'}):</strong> {report.resolution_note}
          </p>
        )}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {actionMode ? (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/50">
          <input
            className="input text-xs"
            maxLength={500}
            placeholder={actionMode === 'resolved' ? 'Ghi chú cách xử lý (tùy chọn)...' : 'Lý do bỏ qua báo cáo (tùy chọn)...'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {report.open_reports_count > 1 && (
            <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
              <input
                type="checkbox"
                checked={resolveAll}
                onChange={(e) => setResolveAll(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-300"
              />
              Đóng luôn toàn bộ {report.open_reports_count} báo cáo đang mở của tin này
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost px-3 py-1 text-xs" disabled={busy} onClick={() => setActionMode(null)}>
              Hủy
            </button>
            <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={busy} onClick={() => void submitResolve()}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {actionMode === 'resolved' ? 'Xác nhận đã xử lý' : 'Xác nhận bỏ qua'}
            </button>
          </div>
        </div>
      ) : (
        report.status === 'open' && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-2">
              {!lockedByOrder && l.status !== 'removed' && (
                <button
                  type="button"
                  onClick={() => onOpenMod('remove')}
                  className="btn-secondary px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300"
                >
                  <Ban className="h-3.5 w-3.5" /> Gỡ tin
                </button>
              )}
              {!lockedByOrder && (
                <button
                  type="button"
                  onClick={() => onOpenMod('delete')}
                  className="btn-ghost px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Xóa vĩnh viễn
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActionMode('dismissed')}
                className="btn-secondary px-2.5 py-1 text-xs"
              >
                <XCircle className="h-3.5 w-3.5" /> Bỏ qua
              </button>
              <button
                type="button"
                onClick={() => setActionMode('resolved')}
                className="btn-primary px-2.5 py-1 text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Đánh dấu đã xử lý
              </button>
            </div>
          </div>
        )
      )}
    </li>
  );
}

function ChatReportCard({
  report,
  onViewChat,
  onInspectMember,
  onResolved,
}: {
  report: AdminChatReport;
  onViewChat: () => void;
  onInspectMember?: (userId: string) => void;
  onResolved: (msg: string) => Promise<void>;
}) {
  const [actionMode, setActionMode] = useState<'resolved' | 'dismissed' | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!actionMode) return;
    setBusy(true);
    setErr(null);
    try {
      await resolveChatReport(report.id, actionMode, note);
      await onResolved(actionMode === 'resolved' ? 'Đã xử lý báo cáo hội thoại.' : 'Đã bỏ qua báo cáo hội thoại.');
    } catch (e) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="card space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              {report.listing_title}
            </span>
            <span className="text-neutral-400">·</span>
            <span className="text-neutral-500 dark:text-neutral-400">
              {new Date(report.created_at).toLocaleString('vi-VN')}
            </span>
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            Người báo cáo: <strong>{report.reporter.display_name}</strong> · Mua:{' '}
            {onInspectMember ? (
              <button type="button" onClick={() => onInspectMember(report.buyer.id)} className="font-medium underline">
                {report.buyer.display_name}
              </button>
            ) : (
              report.buyer.display_name
            )}{' '}
            · Bán:{' '}
            {onInspectMember ? (
              <button type="button" onClick={() => onInspectMember(report.seller.id)} className="font-medium underline">
                {report.seller.display_name}
              </button>
            ) : (
              report.seller.display_name
            )}
          </p>
        </div>

        <button type="button" onClick={onViewChat} className="btn-secondary h-8 px-3 text-xs">
          <MessageSquare className="h-3.5 w-3.5" /> Xem hội thoại
        </button>
      </div>

      <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
        <p className="font-semibold text-neutral-900 dark:text-neutral-100">Lý do báo cáo:</p>
        <p className="mt-0.5">{report.reason}</p>
      </div>

      {report.status !== 'open' && (
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Trạng thái: <strong>{report.status === 'resolved' ? 'Đã xử lý' : 'Đã bỏ qua'}</strong>
          {report.resolver_name ? ` bởi ${report.resolver_name}` : ''}
          {report.resolution_note ? ` — ${report.resolution_note}` : ''}
        </p>
      )}

      {err && <Alert kind="error">{err}</Alert>}

      {actionMode ? (
        <div className="space-y-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <input
            className="input h-8 text-xs"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú xử lý (tùy chọn)..."
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost px-3 py-1 text-xs" disabled={busy} onClick={() => setActionMode(null)}>
              Hủy
            </button>
            <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={busy} onClick={() => void submit()}>
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {actionMode === 'resolved' ? 'Xác nhận đã xử lý' : 'Xác nhận bỏ qua'}
            </button>
          </div>
        </div>
      ) : (
        report.status === 'open' && (
          <div className="flex justify-end gap-2 border-t border-neutral-100 pt-2.5 dark:border-neutral-800">
            <button type="button" onClick={() => setActionMode('dismissed')} className="btn-secondary px-2.5 py-1 text-xs">
              <XCircle className="h-3.5 w-3.5" /> Bỏ qua
            </button>
            <button type="button" onClick={() => setActionMode('resolved')} className="btn-primary px-2.5 py-1 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" /> Đánh dấu đã xử lý
            </button>
          </div>
        )
      )}
    </li>
  );
}
