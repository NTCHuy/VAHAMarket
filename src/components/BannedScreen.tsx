import { Link } from 'react-router-dom';
import { AlertTriangle, FileText, LogOut, ShieldBan } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { FOUNDER_FACEBOOK_URL } from '@/constants/links';

/** Màn hình khóa tài khoản / chặn thiết bị khi user bị Ban hoặc thiết bị nằm trong danh sách đen. */
export default function BannedScreen() {
  const { user, isBanned, banReason, bannedAt, warningCount, signOut } = useAuth();

  return (
    <div className="mx-auto my-8 max-w-xl">
      <div
        role="alert"
        className="rounded-2xl border-2 border-red-600 bg-red-50 p-6 text-red-950 shadow-sm dark:border-red-500/80 dark:bg-red-950/60 dark:text-red-50 sm:p-8"
      >
        <div className="flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-600 text-white shadow-sm">
            <ShieldBan className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-xl font-bold text-red-900 dark:text-red-100 sm:text-2xl">
            {isBanned ? 'Tài khoản của bạn đã bị khóa vĩnh viễn' : 'Thiết bị này đã bị cấm truy cập VAHA Market'}
          </h1>
          <p className="mt-2 text-sm text-red-800 dark:text-red-200">
            Mọi quyền đăng tin, đặt mua và chỉnh sửa tài khoản đã bị vô hiệu hóa để bảo vệ cộng đồng VAHA Market.
          </p>
        </div>

        <div className="mt-5 space-y-3 rounded-xl border border-red-200 bg-white p-4 text-sm text-slate-900 dark:border-red-900/80 dark:bg-slate-950/90 dark:text-slate-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">Lý do khóa</p>
            <p className="mt-1 whitespace-pre-line font-medium text-slate-900 dark:text-slate-100">
              {banReason?.trim() || 'Vi phạm nghiêm trọng quy định giao dịch của VAHA Market.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
            {user && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Số cảnh báo đã nhận: {warningCount}/3
              </span>
            )}
            {bannedAt && (
              <span>Thời điểm khóa: {new Date(bannedAt).toLocaleString('vi-VN')}</span>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-red-900/90 dark:text-red-200/90">
          Toàn bộ tin đăng đang mở đã bị gỡ bỏ. Các dấu vết định danh (thiết bị, tài khoản ngân hàng, Facebook, SĐT, email) đã được lưu vào danh sách đen toàn sàn. Nếu bạn cho rằng đây là nhầm lẫn, vui lòng liên hệ trực tiếp{' '}
          <a href={FOUNDER_FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Facebook Founder
          </a>
          .
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/terms" className="btn-secondary">
            <FileText className="h-4 w-4" /> Xem Điều khoản dịch vụ
          </Link>
          {user && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="btn bg-red-600 text-white hover:bg-red-700"
            >
              <LogOut className="h-4 w-4" /> Đăng xuất
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
