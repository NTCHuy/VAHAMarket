import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Fingerprint,
  History,
  Landmark,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RotateCcw,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  ShieldOff,
  StickyNote,
  Trash2,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import {
  addMemberNote,
  banUser,
  deleteMemberNote,
  getMemberDetail,
  issueWarning,
  restoreListing,
  setMod,
  unbanUser,
  updateMemberIdentity,
} from '@/lib/admin';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { safeHttpUrl } from '@/lib/url';
import CopyButton from '@/components/CopyButton';
import ModBadge from '@/components/ModBadge';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { Alert, Avatar, Field, PageLoader } from '@/components/ui';
import ListingModerationModal from './ListingModerationModal';
import type { AdminMemberDetail, Listing, ListingStatus } from '@/types';

type DetailTab = 'overview' | 'listings' | 'orders' | 'history';

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

interface Props {
  userId: string;
  onClose: () => void;
  onSelectUser: (uid: string) => void;
  onMutated?: () => void;
}

export default function MemberDetailModal({ userId, onClose, onSelectUser, onMutated }: Props) {
  const [detail, setDetail] = useState<AdminMemberDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  // Form thao tác nhanh
  const [actionMode, setActionMode] = useState<'warn' | 'ban' | 'edit_identity' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [editFb, setEditFb] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [busyAction, setBusyAction] = useState(false);

  // Ghi chú nội bộ
  const [noteInput, setNoteInput] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  // Kiểm duyệt tin đăng trong tab Tin đăng
  const [listingModal, setListingModal] = useState<{ mode: 'remove' | 'delete'; listing: Listing } | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMemberDetail(userId);
      setDetail(data);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setActiveTab('overview');
    setActionMode(null);
    setNotice(null);
    void load();
  }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !listingModal) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [listingModal, onClose]);

  const refreshAfterMutation = async (msg: string) => {
    setNotice({ kind: 'success', text: msg });
    await load();
    onMutated?.();
  };

  const handleToggleMod = async () => {
    if (!detail) return;
    setBusyAction(true);
    setNotice(null);
    try {
      const updated = await setMod(detail.profile.id, !detail.profile.is_mod);
      await refreshAfterMutation(
        updated.is_mod ? 'Đã gắn huy hiệu Mod cho thành viên.' : 'Đã gỡ huy hiệu Mod.',
      );
    } catch (e) {
      setNotice({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setBusyAction(false);
    }
  };

  const handleUnban = async () => {
    if (!detail) return;
    setBusyAction(true);
    setNotice(null);
    try {
      await unbanUser(detail.profile.id);
      await refreshAfterMutation('Đã gỡ khóa tài khoản, đặt lại cảnh báo và xóa dấu vết khỏi danh sách đen.');
    } catch (e) {
      setNotice({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setBusyAction(false);
    }
  };

  const submitInlineAction = async () => {
    if (!detail || !actionMode) return;
    const reason = actionReason.trim();
    if (reason.length < 3) return;
    setBusyAction(true);
    setNotice(null);
    try {
      if (actionMode === 'warn') {
        const res = await issueWarning(detail.profile.id, reason);
        setActionMode(null);
        setActionReason('');
        await refreshAfterMutation(
          res.auto_banned
            ? `Đã gửi cảnh báo #${res.warning_count} — Tự động khóa vĩnh viễn do đạt 3/3 cảnh báo.`
            : `Đã gửi cảnh báo #${res.warning_count}/3 cho thành viên.`,
        );
      } else if (actionMode === 'ban') {
        await banUser(detail.profile.id, reason);
        setActionMode(null);
        setActionReason('');
        await refreshAfterMutation('Đã khóa vĩnh viễn tài khoản và đưa dấu vết vào danh sách đen.');
      } else if (actionMode === 'edit_identity') {
        await updateMemberIdentity(detail.profile.id, {
          facebookUrl: editFb.trim() || null,
          phone: editPhone.trim() || null,
          reason,
        });
        setActionMode(null);
        setActionReason('');
        await refreshAfterMutation('Đã cập nhật thông tin định danh và ghi nhật ký quản trị.');
      }
    } catch (e) {
      setNotice({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setBusyAction(false);
    }
  };

  const handleAddNote = async () => {
    if (!detail || !noteInput.trim()) return;
    setNoteBusy(true);
    setNotice(null);
    try {
      await addMemberNote(detail.profile.id, noteInput);
      setNoteInput('');
      await refreshAfterMutation('Đã lưu ghi chú nội bộ.');
    } catch (e) {
      setNotice({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setNoteBusy(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    setNoteBusy(true);
    setNotice(null);
    try {
      await deleteMemberNote(noteId);
      await refreshAfterMutation('Đã xóa ghi chú nội bộ.');
    } catch (e) {
      setNotice({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setNoteBusy(false);
    }
  };

  const handleRestoreListing = async (listingId: string) => {
    setRestoringId(listingId);
    setNotice(null);
    try {
      await restoreListing(listingId);
      await refreshAfterMutation('Đã khôi phục tin đăng về trạng thái Ẩn.');
    } catch (e) {
      setNotice({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setRestoringId(null);
    }
  };

  const p = detail?.profile;
  const safeFb = safeHttpUrl(p?.facebook_url ?? detail?.contact?.facebook_url);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Hồ sơ chi tiết thành viên"
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header cố định */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
              Hồ sơ kiểm duyệt thành viên
            </h2>
            {p && (
              <p className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-neutral-500 dark:text-neutral-400">
                <span className="truncate">{p.id}</span>
                <CopyButton value={p.id} />
              </p>
            )}
          </div>
          <button type="button" className="btn-ghost px-1.5 py-1" onClick={onClose} aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nội dung cuộn */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {loading ? (
            <PageLoader />
          ) : error || !detail || !p ? (
            <Alert kind="error">{error ?? 'Không tải được hồ sơ thành viên.'}</Alert>
          ) : (
            <>
              {/* Tóm tắt danh tính & trạng thái */}
              <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/60">
                <div className="flex min-w-0 items-start gap-3">
                  <Avatar name={p.display_name} url={p.avatar_url} size={48} />
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
                        {p.display_name}
                      </p>
                      {detail.is_admin && (
                        <span className="badge border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
                          Admin
                        </span>
                      )}
                      {p.is_mod && <ModBadge full />}
                      {p.is_banned ? (
                        <span className="badge bg-red-600 text-white dark:bg-red-600 dark:text-white">
                          <Ban className="mr-1 h-3 w-3" /> Đã khóa
                        </span>
                      ) : p.warning_count > 0 ? (
                        <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                          Cảnh báo {p.warning_count}/3
                        </span>
                      ) : null}
                      {detail.missing_seller_fields.length === 0 ? (
                        <span className="badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
                          Đủ hồ sơ bán
                        </span>
                      ) : (
                        <span className="badge border-neutral-200 bg-white text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                          Thiếu: {detail.missing_seller_fields.join(', ')}
                        </span>
                      )}
                      {detail.identity_lock.locked && (
                        <span className="badge border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                          <Lock className="mr-1 h-3 w-3" /> Đang khóa định danh
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      Tham gia: {new Date(p.created_at).toLocaleString('vi-VN')}
                      {detail.auth.last_sign_in_at &&
                        ` · Đăng nhập cuối: ${new Date(detail.auth.last_sign_in_at).toLocaleString('vi-VN')}`}
                    </p>
                  </div>
                </div>

                {/* Thanh thao tác kiểm duyệt */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => void handleToggleMod()}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    {p.is_mod ? <ShieldOff className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    {p.is_mod ? 'Gỡ Mod' : 'Gắn Mod'}
                  </button>
                  <button
                    type="button"
                    disabled={busyAction}
                    onClick={() => {
                      setActionMode(actionMode === 'edit_identity' ? null : 'edit_identity');
                      setEditFb(p.facebook_url ?? '');
                      setEditPhone(detail.contact?.phone ?? '');
                      setActionReason('');
                    }}
                    className="btn-secondary px-3 py-1.5 text-xs"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Sửa định danh
                  </button>
                  {!detail.is_admin && !p.is_banned && (
                    <>
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => {
                          setActionMode(actionMode === 'warn' ? null : 'warn');
                          setActionReason('');
                        }}
                        className="btn-secondary px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Cảnh báo (+1)
                      </button>
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => {
                          setActionMode(actionMode === 'ban' ? null : 'ban');
                          setActionReason('');
                        }}
                        className="btn bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700"
                      >
                        <ShieldBan className="h-3.5 w-3.5" /> Khóa vĩnh viễn
                      </button>
                    </>
                  )}
                  {p.is_banned && (
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={() => void handleUnban()}
                      className="btn-secondary px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400"
                    >
                      <Unlock className="h-3.5 w-3.5" /> Gỡ khóa
                    </button>
                  )}
                </div>
              </div>

              {p.is_banned && p.ban_reason && (
                <Alert kind="error">
                  <strong>Lý do đang khóa tài khoản:</strong> {p.ban_reason}
                </Alert>
              )}

              {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

              {/* Form inline thao tác nhanh */}
              {actionMode && (
                <div className="space-y-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/50">
                  <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    {actionMode === 'warn' &&
                      `Gửi cảnh báo lần ${p.warning_count + 1}/3${p.warning_count + 1 >= 3 ? ' (sẽ tự động khóa vĩnh viễn)' : ''}`}
                    {actionMode === 'ban' && 'Khóa vĩnh viễn tài khoản và đưa dấu vết vào danh sách đen'}
                    {actionMode === 'edit_identity' && 'Cập nhật Facebook / SĐT thay người dùng (bỏ qua khóa định danh)'}
                  </p>
                  {actionMode === 'edit_identity' && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Link Facebook cá nhân" htmlFor="adm-edit-fb">
                        <input
                          id="adm-edit-fb"
                          className="input text-xs"
                          placeholder="https://facebook.com/..."
                          value={editFb}
                          onChange={(e) => setEditFb(e.target.value)}
                        />
                      </Field>
                      <Field label="Số điện thoại" htmlFor="adm-edit-phone">
                        <input
                          id="adm-edit-phone"
                          className="input font-mono text-xs"
                          placeholder="0912345678"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                        />
                      </Field>
                    </div>
                  )}
                  <Field label="Lý do thực hiện" htmlFor="adm-action-reason" required>
                    <input
                      id="adm-action-reason"
                      className="input text-xs"
                      maxLength={500}
                      placeholder="Nhập lý do (tối thiểu 3 ký tự)..."
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                    />
                  </Field>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn-ghost px-3 py-1.5 text-xs"
                      disabled={busyAction}
                      onClick={() => setActionMode(null)}
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      disabled={busyAction || actionReason.trim().length < 3}
                      onClick={() => void submitInlineAction()}
                      className={`btn px-3 py-1.5 text-xs text-white ${
                        actionMode === 'ban'
                          ? 'bg-red-600 hover:bg-red-700'
                          : actionMode === 'warn'
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : 'bg-brand-700 hover:bg-brand-800'
                      }`}
                    >
                      {busyAction ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Xác nhận
                    </button>
                  </div>
                </div>
              )}

              {/* Cảnh báo dùng chung thiết bị với tài khoản khác */}
              {detail.shared_device_users.length > 0 && (
                <div className="space-y-2 rounded-lg border border-red-200 bg-red-50/70 p-3 dark:border-red-900/70 dark:bg-red-950/40">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-red-900 dark:text-red-200">
                    <Users className="h-4 w-4" /> Phát hiện dùng chung thiết bị với {detail.shared_device_users.length} tài khoản khác
                  </p>
                  <ul className="flex flex-wrap gap-2">
                    {detail.shared_device_users.map((su) => (
                      <li key={su.user_id}>
                        <button
                          type="button"
                          onClick={() => onSelectUser(su.user_id)}
                          className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs hover:border-red-400 dark:border-red-900 dark:bg-neutral-900 dark:hover:border-red-700"
                        >
                          <Avatar name={su.display_name} url={su.avatar_url} size={20} />
                          <span className="font-medium text-neutral-900 dark:text-neutral-100">{su.display_name}</span>
                          {su.is_banned ? (
                            <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">Đã khóa</span>
                          ) : su.warning_count > 0 ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              {su.warning_count}/3
                            </span>
                          ) : null}
                          <span className="text-[11px] text-neutral-500">({su.shared_visitor_ids.length} mã chung)</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Tabs con bên trong Modal */}
              <div className="flex gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800">
                {(
                  [
                    { id: 'overview', label: 'Hồ sơ & Dấu vết' },
                    { id: 'listings', label: `Tin đăng (${detail.stats.total_listings})` },
                    { id: 'orders', label: `Đơn hàng (${detail.orders.length})` },
                    { id: 'history', label: `Cảnh báo & Nhật ký (${detail.warnings.length + detail.audit_logs.length})` },
                  ] as { id: DetailTab; label: string }[]
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                      activeTab === t.id
                        ? 'border-brand-700 text-brand-800 dark:border-brand-500 dark:text-brand-300'
                        : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {activeTab === 'overview' && (
                <div className="space-y-4">
                  {/* Thống kê giao dịch */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <MiniStat label="Đã bán" value={`${p.sold_count} đơn`} sub={formatVND(detail.stats.total_sold_gmv)} />
                    <MiniStat label="Đã mua" value={`${p.bought_count} đơn`} sub={formatVND(detail.stats.total_bought_gmv)} />
                    <MiniStat
                      label="Tin đăng"
                      value={`${detail.stats.active_listings} đang bán`}
                      sub={`${detail.stats.pending_listings} chờ duyệt · ${detail.stats.removed_listings} đã gỡ`}
                    />
                    <MiniStat
                      label="Khiếu nại"
                      value={`${detail.stats.dispute_as_seller} bị kiện`}
                      sub={`${detail.stats.dispute_as_buyer} lần tạo`}
                    />
                  </div>

                  {/* Liên hệ & Định danh */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2.5 rounded-lg border border-neutral-200 p-3.5 text-xs dark:border-neutral-800">
                      <p className="font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        Liên hệ &amp; Hồ sơ
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                          <Mail className="h-3.5 w-3.5" /> Email:
                        </span>
                        <span className="flex items-center gap-1 font-mono text-neutral-900 dark:text-neutral-100">
                          {detail.contact?.email ?? detail.auth.email ?? '—'}
                          {(detail.contact?.email ?? detail.auth.email) && (
                            <CopyButton value={(detail.contact?.email ?? detail.auth.email)!} />
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                          <Phone className="h-3.5 w-3.5" /> SĐT:
                        </span>
                        <span className="flex items-center gap-1 font-mono text-neutral-900 dark:text-neutral-100">
                          {detail.contact?.phone ?? 'Chưa có'}
                          {detail.contact?.phone && <CopyButton value={detail.contact.phone} />}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                          <Facebook className="h-3.5 w-3.5" /> Facebook:
                        </span>
                        {safeFb ? (
                          <a
                            href={safeFb}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex max-w-[14rem] items-center gap-1 truncate text-brand-700 hover:underline dark:text-brand-400"
                          >
                            <span className="truncate">{safeFb.replace(/^https?:\/\/(www\.)?/, '')}</span>
                            <ExternalLink className="h-3 w-3 shrink-0" />
                          </a>
                        ) : (
                          <span className="text-neutral-400">Chưa có</span>
                        )}
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="flex shrink-0 items-center gap-1.5 text-neutral-600 dark:text-neutral-400">
                          <MapPin className="h-3.5 w-3.5" /> Khu vực / Địa chỉ:
                        </span>
                        <span className="text-right text-neutral-800 dark:text-neutral-200">
                          {[detail.contact?.province, detail.contact?.shipping_address].filter(Boolean).join(' — ') || 'Chưa có'}
                        </span>
                      </div>
                      {p.bio && (
                        <div className="border-t border-neutral-100 pt-2 text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
                          <strong>Giới thiệu:</strong> {p.bio}
                        </div>
                      )}
                    </div>

                    {/* Tài khoản ngân hàng */}
                    <div className="space-y-2 rounded-lg border border-neutral-200 p-3.5 text-xs dark:border-neutral-800">
                      <p className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        <Landmark className="h-3.5 w-3.5" /> Tài khoản ngân hàng ({detail.bank_accounts.length})
                      </p>
                      {detail.bank_accounts.length === 0 ? (
                        <p className="text-neutral-400">Chưa lưu tài khoản ngân hàng nào.</p>
                      ) : (
                        <ul className="space-y-2">
                          {detail.bank_accounts.map((b) => (
                            <li
                              key={b.id}
                              className="rounded-md bg-neutral-50 p-2.5 dark:bg-neutral-800/60"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                                  {b.bank_name}
                                  {b.is_default && (
                                    <span className="ml-1.5 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] text-brand-800 dark:bg-brand-900/50 dark:text-brand-300">
                                      Mặc định
                                    </span>
                                  )}
                                </span>
                                <span className="flex items-center gap-1 font-mono text-neutral-800 dark:text-neutral-200">
                                  {b.account_number} <CopyButton value={b.account_number} />
                                </span>
                              </div>
                              <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                                Chủ TK: <strong>{b.account_name}</strong> · BIN {b.bank_bin}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {/* Thiết bị & Danh sách đen */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2 rounded-lg border border-neutral-200 p-3.5 text-xs dark:border-neutral-800">
                      <p className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        <Fingerprint className="h-3.5 w-3.5" /> Thiết bị đã ghi nhận ({detail.devices.length})
                      </p>
                      {detail.devices.length === 0 ? (
                        <p className="text-neutral-400">Chưa ghi nhận thiết bị nào.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {detail.devices.map((d) => (
                            <li key={d.id} className="rounded bg-neutral-50 px-2.5 py-1.5 dark:bg-neutral-800/60">
                              <div className="flex items-center justify-between gap-2">
                                <code className="truncate font-mono text-[11px] font-medium text-neutral-900 dark:text-neutral-100">
                                  {d.visitor_id}
                                </code>
                                <CopyButton value={d.visitor_id} />
                              </div>
                              <p className="truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                                Hoạt động cuối: {new Date(d.last_seen_at).toLocaleString('vi-VN')}
                              </p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div className="space-y-2 rounded-lg border border-neutral-200 p-3.5 text-xs dark:border-neutral-800">
                      <p className="flex items-center gap-1.5 font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                        <StickyNote className="h-3.5 w-3.5" /> Ghi chú nội bộ ({detail.notes.length})
                      </p>
                      <div className="flex gap-2">
                        <input
                          className="input flex-1 text-xs"
                          maxLength={1000}
                          placeholder="Thêm ghi chú kiểm duyệt (chỉ Admin xem)..."
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && noteInput.trim()) {
                              e.preventDefault();
                              void handleAddNote();
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn-primary px-3 py-1.5 text-xs"
                          disabled={noteBusy || !noteInput.trim()}
                          onClick={() => void handleAddNote()}
                        >
                          {noteBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Lưu'}
                        </button>
                      </div>
                      {detail.notes.length === 0 ? (
                        <p className="text-neutral-400">Chưa có ghi chú nào.</p>
                      ) : (
                        <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                          {detail.notes.map((n) => (
                            <li
                              key={n.id}
                              className="flex items-start justify-between gap-2 rounded bg-neutral-50 px-2.5 py-2 dark:bg-neutral-800/60"
                            >
                              <div className="min-w-0">
                                <p className="whitespace-pre-line text-neutral-800 dark:text-neutral-200">{n.note}</p>
                                <p className="mt-0.5 text-[11px] text-neutral-400">
                                  {n.admin_name} · {new Date(n.created_at).toLocaleString('vi-VN')}
                                </p>
                              </div>
                              <button
                                type="button"
                                disabled={noteBusy}
                                onClick={() => void handleDeleteNote(n.id)}
                                className="rounded p-1 text-neutral-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                                aria-label="Xóa ghi chú"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'listings' && (
                <div className="space-y-2.5">
                  {detail.listings.length === 0 ? (
                    <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                      Thành viên chưa có tin đăng nào.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {detail.listings.map((l) => {
                        const lockedByOrder = l.status === 'reserved' || l.status === 'sold';
                        return (
                          <li
                            key={l.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-800">
                                {l.images[0]?.url && (
                                  <img
                                    src={cldUrl(l.images[0].url, { width: 120, height: 120, crop: 'fill' })}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                )}
                              </div>
                              <div className="min-w-0">
                                <Link
                                  to={`/listing/${l.id}`}
                                  onClick={onClose}
                                  className="line-clamp-1 text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                                >
                                  {l.title}
                                </Link>
                                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                                    {formatVND(l.price)}
                                  </span>
                                  <span className="badge">{LISTING_STATUS_LABEL[l.status]}</span>
                                  <span>{new Date(l.created_at).toLocaleDateString('vi-VN')}</span>
                                </p>
                                {l.moderation_note && (
                                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                                    Lý do gỡ: {l.moderation_note}
                                  </p>
                                )}
                              </div>
                            </div>
                            {!lockedByOrder && (
                              <div className="flex flex-wrap items-center gap-1.5">
                                {l.status === 'removed' ? (
                                  <button
                                    type="button"
                                    disabled={restoringId === l.id}
                                    onClick={() => void handleRestoreListing(l.id)}
                                    className="btn-secondary px-2.5 py-1 text-xs"
                                  >
                                    {restoringId === l.id ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    )}
                                    Khôi phục
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setListingModal({ mode: 'remove', listing: l })}
                                    className="btn-secondary px-2.5 py-1 text-xs text-amber-800 dark:text-amber-300"
                                  >
                                    <Ban className="h-3.5 w-3.5" /> Gỡ tin
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setListingModal({ mode: 'delete', listing: l })}
                                  className="btn-ghost px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" /> Xóa
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {activeTab === 'orders' && (
                <div className="space-y-2.5">
                  {detail.orders.length === 0 ? (
                    <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                      Chưa có đơn hàng nào.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.orders.map((o) => {
                        const isSeller = o.seller_id === p.id;
                        return (
                          <li
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3 text-xs dark:border-neutral-800"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                                  {o.payment_code}
                                </span>
                                <span
                                  className={`badge ${
                                    isSeller
                                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
                                      : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'
                                  }`}
                                >
                                  {isSeller ? 'Bán' : 'Mua'}
                                </span>
                                <OrderStatusBadge status={o.status} />
                              </div>
                              <p className="line-clamp-1 font-medium text-neutral-800 dark:text-neutral-200">
                                {o.listing_snapshot?.title ?? 'Đơn hàng'}
                              </p>
                              <p className="text-neutral-500 dark:text-neutral-400">
                                {formatVND(o.amount)} · {new Date(o.created_at).toLocaleString('vi-VN')}
                              </p>
                            </div>
                            <Link to={`/orders/${o.id}`} onClick={onClose} className="btn-secondary px-2.5 py-1 text-xs">
                              Xem đơn
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              )}

              {activeTab === 'history' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" /> Cảnh báo vi phạm ({detail.warnings.length})
                    </p>
                    {detail.warnings.length === 0 ? (
                      <p className="text-xs text-neutral-400">Chưa có cảnh báo nào.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {detail.warnings.map((w, idx) => (
                          <li
                            key={w.id}
                            className="rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs dark:border-amber-900/60 dark:bg-amber-950/30"
                          >
                            <span className="font-semibold text-amber-800 dark:text-amber-300">
                              #{detail.warnings.length - idx}
                            </span>{' '}
                            <span className="text-neutral-800 dark:text-neutral-200">{w.reason}</span>{' '}
                            <span className="text-neutral-400">({new Date(w.created_at).toLocaleString('vi-VN')})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {detail.banned_entities.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-red-700 dark:text-red-400">
                        Dấu vết trong danh sách đen ({detail.banned_entities.length})
                      </p>
                      <ul className="space-y-1">
                        {detail.banned_entities.map((e) => (
                          <li
                            key={e.id}
                            className="rounded bg-red-50 px-3 py-1.5 font-mono text-[11px] text-red-800 dark:bg-red-950/40 dark:text-red-300"
                          >
                            [{e.entity_type}] {e.entity_value}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      <History className="h-4 w-4" /> Nhật ký quản trị liên quan ({detail.audit_logs.length})
                    </p>
                    {detail.audit_logs.length === 0 ? (
                      <p className="text-xs text-neutral-400">Chưa có thao tác quản trị nào ghi nhận trên thành viên này.</p>
                    ) : (
                      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
                        {detail.audit_logs.map((log) => (
                          <li key={log.id} className="px-3 py-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                                {log.action}
                              </span>
                              <span className="text-neutral-400">
                                {log.admin_name} · {new Date(log.created_at).toLocaleString('vi-VN')}
                              </span>
                            </div>
                            {log.note && <p className="mt-0.5 text-neutral-600 dark:text-neutral-300">{log.note}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {listingModal && (
        <ListingModerationModal
          mode={listingModal.mode}
          listing={listingModal.listing}
          sellerName={p?.display_name}
          sellerIsBanned={p?.is_banned}
          sellerWarningCount={p?.warning_count}
          sellerIsAdmin={detail?.is_admin}
          onClose={() => setListingModal(null)}
          onDone={async (res) => {
            const wasDelete = listingModal.mode === 'delete';
            setListingModal(null);
            const warnNote = res.warning
              ? res.warning.auto_banned
                ? ` Đồng thời đã khóa vĩnh viễn tài khoản (${res.warning.warning_count}/3 cảnh báo).`
                : ` Đồng thời đã gửi cảnh báo ${res.warning.warning_count}/3.`
              : '';
            await refreshAfterMutation((wasDelete ? 'Đã xóa vĩnh viễn tin đăng.' : 'Đã gỡ tin đăng.') + warnNote);
          }}
        />
      )}
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">{sub}</p>}
    </div>
  );
}
