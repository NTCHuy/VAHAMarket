import { Link, Outlet, useLocation } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { BRAND_NAME, DISCORD_SERVER_URL, FOUNDER_FACEBOOK_URL, GROUP_URL } from '@/constants/links';
import { useAuth } from '@/context/AuthContext';
import BannedScreen from './BannedScreen';
import ErrorBoundary from './ErrorBoundary';
import Navbar from './Navbar';

export default function Layout() {
  const location = useLocation();
  const { isBanned, deviceBanned, isAdmin } = useAuth();
  const blocked = (isBanned || deviceBanned) && !isAdmin && location.pathname !== '/terms';

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <ErrorBoundary variant="inline" resetKey={location.pathname}>
          {blocked ? <BannedScreen /> : <Outlet />}
        </ErrorBoundary>
      </main>
      <footer className="border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
          <div className="grid gap-6 text-sm sm:grid-cols-3">
            {/* Cột 1 */}
            <div className="space-y-1.5">
              <p className="font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">{BRAND_NAME}</p>
              <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                Nền tảng giao dịch trung gian độc lập cho người chơi âm thanh, phát triển và vận hành bởi{' '}
                <strong className="font-medium text-neutral-800 dark:text-neutral-200">Huy Nguyễn (HweeHiFi)</strong>.
              </p>
            </div>

            {/* Cột 2 */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Quy định &amp; Pháp lý
              </p>
              <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                <li>
                  <Link to="/terms" className="hover:text-neutral-950 hover:underline dark:hover:text-neutral-100">
                    Điều khoản dịch vụ &amp; Miễn trừ
                  </Link>
                </li>
                <li>
                  <Link to="/terms#video-rules" className="hover:text-neutral-950 hover:underline dark:hover:text-neutral-100">
                    Quy tắc quay video 6 mặt
                  </Link>
                </li>
                <li>
                  <Link to="/terms#fee-cap" className="hover:text-neutral-950 hover:underline dark:hover:text-neutral-100">
                    Chính sách trần phí 500.000₫/đơn
                  </Link>
                </li>
              </ul>
            </div>

            {/* Cột 3 */}
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Cộng đồng &amp; Hỗ trợ
              </p>
              <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                <li>
                  <a
                    href={GROUP_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-neutral-950 hover:underline dark:hover:text-neutral-100"
                  >
                    Group Hội người Việt nghiện tai nghe <ExternalLink size={12} strokeWidth={1.75} />
                  </a>
                </li>
                <li>
                  <a
                    href={DISCORD_SERVER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-neutral-950 hover:underline dark:hover:text-neutral-100"
                  >
                    Server Discord hỗ trợ trực tiếp <ExternalLink size={12} strokeWidth={1.75} />
                  </a>
                </li>
                <li>
                  <a
                    href={FOUNDER_FACEBOOK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-neutral-950 hover:underline dark:hover:text-neutral-100"
                  >
                    Facebook Founder (HweeHiFi) <ExternalLink size={12} strokeWidth={1.75} />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-1 border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-900 dark:text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
            <span>© {new Date().getFullYear()} {BRAND_NAME} · Escrow C2C Audio Marketplace</span>
            <span className="tabular-nums">Trần phí tối đa 500.000₫/đơn · Mod Group 0%</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
