import { Link } from 'react-router-dom';
import { AlertTriangle, FileText, LogOut, ShieldBan } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { DISCORD_SERVER_URL } from '@/constants/links';

export default function BannedScreen() {
  const { user, isBanned, banReason, bannedAt, warningCount, signOut } = useAuth();

  return (
    <div className="mx-auto my-8 max-w-xl">
      <div
        role="alert"
        className="rounded-lg border-2 border-red-600 bg-red-50 p-6 text-red-950 dark:border-red-500/80 dark:bg-red-950/60 dark:text-red-50 sm:p-8"
      >
        <div className="flex flex-col items-center text-center">
          <ShieldBan size={28} strokeWidth={1.75} className="text-red-600 dark:text-red-400" />
          <h1 className="mt-4 text-xl font-bold text-red-900 dark:text-red-100 sm:text-2xl">
            {isBanned ? 'Tài khoản đã bị khóa vĩnh viễn' : 'Thiết bị này bị hạn chế truy cập'}
          </h1>
          <p className="mt-2 text-sm text-red-800 dark:text-red-200">
            Quyền đăng tin, đặt mua và sửa tài khoản đã bị tắt để bảo vệ cộng đồng.
          </p>
        </div>

        <div className="mt-5 space-y-3 rounded-lg border border-red-200 bg-white p-4 text-sm text-neutral-900 dark:border-red-900/80 dark:bg-neutral-950/90 dark:text-neutral-100">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">Lý do</p>
            <p className="mt-1 whitespace-pre-line font-medium text-neutral-900 dark:text-neutral-100">
              {banReason?.trim() || 'Vi phạm quy định của VAHA Market.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-neutral-100 pt-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
            {user && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" /> Cảnh báo: {warningCount}/3
              </span>
            )}
            {bannedAt && (
              <span>Thời điểm khóa: {new Date(bannedAt).toLocaleString('vi-VN')}</span>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-red-900/90 dark:text-red-200/90">
          Các tin đang mở đã bị gỡ và thông tin định danh đã vào danh sách đen. Nếu có nhầm lẫn, liên hệ kênh hỗ trợ tại{' '}
          <a href={DISCORD_SERVER_URL} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
            Discord VAHA Market
          </a>
          .
        </p>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link to="/terms" className="btn-secondary">
            <FileText className="h-4 w-4" /> Xem điều khoản
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
