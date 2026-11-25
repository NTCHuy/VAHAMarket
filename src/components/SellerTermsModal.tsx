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
    title: 'Định danh chính chủ',
    body: 'Tên chủ tài khoản ngân hàng phải khớp tên Facebook cá nhân để được giải ngân. Đường dẫn Facebook và tài khoản ngân hàng tự động khóa khi đang có tin mở hoặc đơn chưa xong.',
  },
  {
    num: '02',
    title: 'Ảnh xác thực & Video đóng gói',
    body: 'Tin mới cần ảnh sản phẩm kèm giấy viết tay ghi "VAHA + Ngày + Tên Facebook". Khi gửi hàng phải quay video kiểm tra và đóng gói đủ 6 mặt. Cấm kéo giao dịch ra ngoài sàn.',
  },
  {
    num: '03',
    title: 'Miễn phí trung gian 0%',
    body: 'Sàn phi lợi nhuận, không thu phí giao dịch. Người bán nhận đủ 100% giá bán, người mua trả đúng giá niêm yết.',
  },
  {
    num: '04',
    title: 'Xử lý vi phạm & Lừa đảo',
    body: '3 lần cảnh báo sẽ tự khóa vĩnh viễn và đưa thông tin vào danh sách đen. Hành vi lừa đảo sẽ bị chuyển đầy đủ dữ liệu định danh cho Công an theo Điều 174 & 175 Bộ luật Hình sự 2015.',
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-3 backdrop-blur-[2px] sm:p-4"
      onClick={onCancel}
    >
      <div
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3.5 dark:border-neutral-800 sm:px-5 sm:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-neutral-900 dark:text-neutral-100">
              <ShieldAlert size={18} strokeWidth={1.75} className="shrink-0 text-red-600 dark:text-red-400" />
              <h2 id="seller-terms-title" className="text-sm font-semibold tracking-tight sm:text-base">
                Quy định trước khi đăng bán
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
              Tóm tắt quy định bắt buộc dành cho người bán.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Đóng"
            className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="divide-y divide-neutral-200 border-b border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {RULES.map((rule) => (
            <div key={rule.num} className="flex gap-3 px-4 py-3 dark:border-neutral-800 sm:px-5 sm:py-3.5">
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

        <div className="space-y-4 px-4 py-4 sm:px-5">
          <Link
            to="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Xem toàn bộ Điều khoản sử dụng
            <ExternalLink size={13} strokeWidth={1.75} />
          </Link>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs leading-relaxed text-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-700 focus:ring-blue-600 dark:border-neutral-700"
            />
            <span>Tôi đã đọc và đồng ý tuân thủ quy định trên VAHA Market.</span>
          </label>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Quay lại
            </button>
            <button type="button" disabled={!checked} onClick={handleConfirm} className="btn-primary">
              Đồng ý &amp; Đăng bán
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
