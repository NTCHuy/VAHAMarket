import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, ShieldAlert, X } from 'lucide-react';

export const SELLER_TERMS_STORAGE_KEY = 'vaha_seller_terms_accepted_v1';

export function hasAcceptedSellerTerms(): boolean {
  try {
    return sessionStorage.getItem(SELLER_TERMS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function acceptSellerTerms(): void {
  try {
    sessionStorage.setItem(SELLER_TERMS_STORAGE_KEY, 'true');
  } catch {
    // ignore storage errors
  }
}

const RULES = [
  {
    num: '01',
    title: 'Định danh chính chủ & Khóa cứng STK',
    body: 'Tên chủ tài khoản ngân hàng bắt buộc khớp với trang cá nhân Facebook thật. Link Facebook và tài khoản ngân hàng sẽ bị khóa cứng trong suốt thời gian có tin đăng hoặc đơn hàng đang xử lý.',
  },
  {
    num: '02',
    title: 'Bằng chứng xác thực 2 đầu',
    body: 'Bắt buộc tải lên ảnh chụp sản phẩm thực tế kèm giấy viết tay chính chủ khi đăng tin; bắt buộc quay video test hoạt động và đóng gói liền mạch 6 mặt khi gửi hàng.',
  },
  {
    num: '03',
    title: 'Biểu phí & Trần phí tối đa 500.000₫',
    body: 'Mức phí hiện hành được tính minh bạch trên từng đơn (áp dụng trần tối đa 500.000₫/đơn, phần vượt trần được miễn phí hoàn toàn).',
  },
  {
    num: '04',
    title: 'Kỷ luật 3 Gậy & Trách nhiệm hình sự',
    body: 'Vi phạm quy định 3 lần tự động khóa vĩnh viễn tài khoản, chặn dấu vân tay thiết bị và đưa vào danh sách đen toàn sàn. Mọi hành vi lừa đảo chiếm đoạt tài sản sẽ bị bàn giao toàn bộ hồ sơ định danh (Email, SĐT, Facebook, STK ngân hàng, lịch sử thiết bị, video bằng chứng) cho Cơ quan Công an theo Điều 174 & Điều 175 Bộ luật Hình sự.',
  },
] as const;

interface Props {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export default function SellerTermsModal({ open, onAccept, onCancel }: Props) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!open) {
      setChecked(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const handleConfirm = () => {
    if (!checked) return;
    acceptSellerTerms();
    onAccept();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="seller-terms-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-4 backdrop-blur-[2px]"
      onClick={onCancel}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-5 py-4 dark:border-neutral-800">
          <div>
            <div className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
              <ShieldAlert size={18} strokeWidth={1.75} className="shrink-0 text-red-600 dark:text-red-400" />
              <h2 id="seller-terms-title" className="text-base font-semibold tracking-tight">
                Cam kết người bán &amp; Quy định chống lừa đảo
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Xác nhận 4 nguyên tắc bắt buộc trước khi mở form đăng tin.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Đóng"
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* 4 Rules table/list */}
        <div className="divide-y divide-neutral-200 border-b border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {RULES.map((rule) => (
            <div key={rule.num} className="flex gap-3 px-5 py-3.5">
              <span className="mt-0.5 shrink-0 font-mono text-xs font-semibold tabular-nums text-neutral-400 dark:text-neutral-500">
                {rule.num}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{rule.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{rule.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Footer / Confirmation */}
        <div className="space-y-4 px-5 py-4">
          <Link
            to="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Đọc toàn văn Điều khoản dịch vụ (/terms)
            <ExternalLink size={13} strokeWidth={1.75} />
          </Link>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-700 focus:ring-blue-600 dark:border-neutral-700"
            />
            <span>Tôi đã đọc, hiểu rõ và cam kết tuân thủ toàn bộ quy định giao dịch trên VAHA Market.</span>
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Hủy / Quay lại
            </button>
            <button type="button" disabled={!checked} onClick={handleConfirm} className="btn-primary">
              Xác nhận &amp; Tiếp tục đăng bán
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
