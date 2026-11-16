import { Outlet, useLocation } from 'react-router-dom';
import { BRAND_FULL_NAME, BRAND_NAME } from '@/constants/links';
import ErrorBoundary from './ErrorBoundary';
import Navbar from './Navbar';
import TrustBadge from './TrustBadge';

export default function Layout() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Lỗi ở 1 trang không làm mất Navbar/Footer; tự thoát lỗi khi chuyển trang */}
        <ErrorBoundary variant="inline" resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6">
          <TrustBadge />
          <div className="flex flex-col gap-1 border-t border-slate-100 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              © {new Date().getFullYear()} <strong className="text-slate-700">{BRAND_NAME}</strong> — {BRAND_FULL_NAME}
            </span>
            <span>Phí trung gian 5% (Mod Group: 0%) · Người mua trả phí ship khi nhận hàng.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
