import { useEffect, useState } from 'react';
import { AlertTriangle, Ban, Loader2, Trash2, X } from 'lucide-react';
import { deleteListing, removeListing, type ModerateListingResult } from '@/lib/admin';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { Alert, Field } from '@/components/ui';
import type { Listing, ListingStatus } from '@/types';

const PRESET_REASONS = [
  'Hàng giả hoặc không đúng mô tả.',
  'Dấu hiệu lừa đảo hoặc ảnh xác thực không hợp lệ.',
  'Dẫn dụ giao dịch ngoài sàn.',
  'Tin trùng lặp hoặc spam.',
  'Gỡ theo yêu cầu xác nhận từ người bán.',
];

const STATUS_LABEL: Record<ListingStatus, string> = {
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
  mode: 'remove' | 'delete';
  listing: Pick<Listing, 'id' | 'title' | 'price' | 'status' | 'images'>;
  sellerName?: string;
  sellerIsBanned?: boolean;
  sellerWarningCount?: number;
  sellerIsAdmin?: boolean;
  onClose: () => void;
  onDone: (result: ModerateListingResult) => Promise<void> | void;
}

export default function ListingModerationModal({
  mode,
  listing,
  sellerName,
  sellerIsBanned = false,
  sellerWarningCount = 0,
  sellerIsAdmin = false,
  onClose,
  onDone,
}: Props) {
  const [reason, setReason] = useState('');
  const [issueWarn, setIssueWarn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDelete = mode === 'delete';
  const reasonTrimmed = reason.trim();
  const valid = reasonTrimmed.length >= 5 && reasonTrimmed.length <= 500;
  const canWarn = !sellerIsBanned && !sellerIsAdmin;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = isDelete
        ? await deleteListing(listing.id, reasonTrimmed, canWarn && issueWarn)
        : await removeListing(listing.id, reasonTrimmed, canWarn && issueWarn);
      await onDone(res);
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isDelete ? 'Xóa vĩnh viễn tin đăng' : 'Gỡ tin đăng'}
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            {isDelete ? (
              <Trash2 className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            ) : (
              <Ban className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
              {isDelete ? 'Xóa vĩnh viễn tin đăng' : 'Gỡ tin đăng khỏi sàn'}
            </h2>
          </div>
          <button type="button" className="btn-ghost px-1.5 py-1" onClick={onClose} disabled={busy} aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-neutral-200 dark:bg-neutral-800">
            {listing.images[0]?.url && (
              <img
                src={cldUrl(listing.images[0].url, { width: 120, height: 120, crop: 'fill' })}
                alt=""
                className="h-full w-full object-cover"
              />
            )}
          </div>
          <div className="min-w-0 flex-1 text-sm">
            <p className="line-clamp-2 font-medium text-neutral-900 dark:text-neutral-100">{listing.title}</p>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              {formatVND(listing.price)} · {STATUS_LABEL[listing.status]}
              {sellerName ? ` · ${sellerName}` : ''}
            </p>
          </div>
        </div>

        {isDelete ? (
          <Alert kind="error">
            Hành động này sẽ <strong>xóa vĩnh viễn</strong> tin khỏi hệ thống và không thể khôi phục. Thông tin tóm tắt vẫn được lưu trong Nhật ký quản trị.
          </Alert>
        ) : (
          <Alert kind="info">
            Tin sẽ chuyển sang trạng thái <strong>Đã gỡ</strong>, ẩn khỏi tìm kiếm và người bán sẽ thấy lý do gỡ tin. Quản trị viên có thể khôi phục về Ẩn nếu cần.
          </Alert>
        )}

        <div className="space-y-2">
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Chọn nhanh lý do mẫu</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                className="rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
              >
                {preset.replace(/\.$/, '')}
              </button>
            ))}
          </div>
        </div>

        <Field
          label={isDelete ? 'Lý do xóa vĩnh viễn' : 'Lý do gỡ tin'}
          htmlFor="mod-listing-reason"
          required
          hint="Tối thiểu 5 ký tự, tối đa 500 ký tự."
        >
          <textarea
            id="mod-listing-reason"
            rows={3}
            maxLength={500}
            className="input"
            placeholder="Nhập lý do xử lý tin đăng..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>

        {canWarn && (
          <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200">
            <input
              type="checkbox"
              checked={issueWarn}
              onChange={(e) => setIssueWarn(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-amber-400 text-amber-600"
            />
            <span>
              <strong>Đồng thời gửi +1 cảnh báo cho người bán</strong> (hiện có {sellerWarningCount}/3 cảnh báo
              {sellerWarningCount + 1 >= 3 ? ' — sẽ tự động khóa vĩnh viễn tài khoản' : ''}).
            </span>
          </label>
        )}

        {error && <Alert kind="error">{error}</Alert>}

        <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button
            type="button"
            disabled={busy || !valid}
            onClick={() => void submit()}
            className={`btn text-white ${isDelete ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isDelete ? (
              <Trash2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {isDelete ? 'Xác nhận xóa vĩnh viễn' : 'Xác nhận gỡ tin'}
          </button>
        </div>
      </div>
    </div>
  );
}
