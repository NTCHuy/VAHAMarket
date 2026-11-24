import { Link, Outlet, useLocation } from 'react-router-dom';
import { ExternalLink, Heart } from 'lucide-react';
import { BRAND_NAME, DISCORD_SERVER_URL, GROUP_URL } from '@/constants/links';
import { useAuth } from '@/context/AuthContext';
import BannedScreen from './BannedScreen';
import ErrorBoundary from './ErrorBoundary';
import Navbar from './Navbar';

export default function Layout() {
  const location = useLocation();
  const { isBanned, deviceBanned, isAdmin } = useAuth();
  const blocked = (isBanned || deviceBanned) && !isAdmin && location.pathname !== '/terms';

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <Navbar />
      <main className="mx-auto w-full max-w-6xl flex-1 min-w-0 px-4 py-5 sm:px-6 sm:py-6">
        <ErrorBoundary variant="inline" resetKey={location.pathname}>
          {blocked ? <BannedScreen /> : <Outlet />}
        </ErrorBoundary>
      </main>
      <footer className="border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
        <div className="mx-auto max-w-6xl px-4 py-7 sm:px-6">
          <div className="grid gap-6 text-sm sm:grid-cols-3">
            <div className="min-w-0 space-y-1.5">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="" className="h-6 w-6 rounded-md object-cover" />
                <p className="font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">{BRAND_NAME}</p>
              </div>
              <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">
                Nền tảng giao dịch trung gian thiết bị âm thanh <strong>0% phí</strong> của cộng đồng{' '}
                <em>Hội người Việt nghiện tai nghe</em> — phi lợi nhuận, minh bạch và bảo vệ người chơi.
              </p>
            </div>

            <div className="min-w-0 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Quy định &amp; Đóng góp
              </p>
              <ul className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                <li>
                  <Link to="/terms" className="hover:text-neutral-950 hover:underline dark:hover:text-neutral-100">
                    Điều khoản dịch vụ
                  </Link>
                </li>
                <li>
                  <Link
                    to="/support"
                    className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline dark:text-blue-400"
                  >
                    <Heart size={12} strokeWidth={2} className="shrink-0" /> Ủng hộ duy trì sàn
                  </Link>
                </li>
              </ul>
            </div>

            <div className="min-w-0 space-y-1.5">
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
                    Group Hội người Việt nghiện tai nghe <ExternalLink size={12} strokeWidth={1.75} className="shrink-0" />
                  </a>
                </li>
                <li>
                  <a
                    href={DISCORD_SERVER_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-neutral-950 hover:underline dark:hover:text-neutral-100"
                  >
                    Server Discord hỗ trợ trực tiếp <ExternalLink size={12} strokeWidth={1.75} className="shrink-0" />
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-6 border-t border-neutral-100 pt-4 text-xs text-neutral-500 dark:border-neutral-900">
            © {new Date().getFullYear()} {BRAND_NAME} · Của cộng đồng, vì cộng đồng.
          </div>
        </div>
      </footer>
    </div>
  );
}
