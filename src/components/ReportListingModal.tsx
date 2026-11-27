import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Flag, Loader2, X } from 'lucide-react';
import { REPORT_REASON_OPTIONS, submitListingReport } from '@/lib/community';
import { getErrorMessage } from '@/lib/errors';
import { Alert, Field } from '@/components/ui';
import type { ListingReportReason } from '@/types';

interface Props {
  listingId: string;
  listingTitle: string;
  onClose: () => void;
}

export default function ReportListingModal({ listingId, listingTitle, onClose }: Props) {
  const [reason, setReason] = useState<ListingReportReason>('scam_suspected');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const needDetails = reason === 'other';
  const detailsValid = !needDetails || details.trim().length >= 5;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!detailsValid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitListingReport(listingId, reason, details);
      setDone(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Báo cáo tin đăng vi phạm"
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/60 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-950 dark:text-neutral-50">
              <Flag className="h-4 w-4 text-red-600 dark:text-red-400" /> Báo cáo tin đăng
            </h2>
            <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">{listingTitle}</p>
          </div>
          <button type="button" className="btn-ghost px-1.5 py-1" onClick={onClose} disabled={busy} aria-label="Đóng">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="space-y-4 py-2">
            <Alert kind="success">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Đã gửi báo cáo thành công.</p>
                  <p className="mt-0.5 text-xs">Đội ngũ kiểm duyệt sẽ rà soát tin đăng này sớm nhất.</p>
                </div>
              </div>
            </Alert>
            <div className="flex justify-end">
              <button type="button" className="btn-primary" onClick={onClose}>
                Đóng
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-neutral-700 dark:text-neutral-300">Chọn lý do báo cáo</p>
              <div className="space-y-1.5">
                {REPORT_REASON_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs transition-colors ${
                      reason === opt.id
                        ? 'border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/30'
                        : 'border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={opt.id}
                      checked={reason === opt.id}
                      onChange={() => setReason(opt.id)}
                      className="mt-0.5 h-3.5 w-3.5 border-neutral-300 text-blue-700"
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-neutral-900 dark:text-neutral-100">{opt.label}</p>
                      <p className="mt-0.5 text-neutral-500 dark:text-neutral-400">{opt.hint}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <Field
              label={needDetails ? 'Mô tả chi tiết' : 'Ghi chú thêm (không bắt buộc)'}
              htmlFor="report-details"
              required={needDetails}
              hint="Tối đa 1000 ký tự."
            >
              <textarea
                id="report-details"
                rows={3}
                maxLength={1000}
                className="input"
                placeholder="Cung cấp thêm bằng chứng hoặc chi tiết nếu có..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
              />
            </Field>

            {error && <Alert kind="error">{error}</Alert>}

            <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
                Hủy
              </button>
              <button
                type="submit"
                disabled={busy || !detailsValid}
                className="btn bg-red-600 text-white hover:bg-red-700"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flag className="h-4 w-4" />}
                Gửi báo cáo
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
