import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Bookmark,
  ChevronDown,
  Download,
  Heart,
  LogIn,
  LogOut,
  Menu,
  MessageSquare,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Shield,
  Store,
  Sun,
  Tag,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOrderAlerts } from '@/context/OrderAlertsContext';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationContext';
import { useSavedListings } from '@/context/SavedListingsContext';
import { useChat } from '@/context/ChatContext';
import { usePwaInstall } from '@/lib/pwa';
import CountBadge from './CountBadge';
import NotificationBell from './NotificationBell';
import SellerTermsModal, { hasAcceptedSellerTerms } from './SellerTermsModal';
import { Avatar } from './ui';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800 dark:text-neutral-50'
      : 'text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800/70 dark:hover:text-neutral-50'
  }`;

const THEME_LABEL: Record<ThemeMode, string> = {
  light: 'Chế độ Sáng (chuyển sang Tối)',
  dark: 'Chế độ Tối (chuyển sang Hệ thống)',
  system: 'Theo hệ thống (chuyển sang Sáng)',
};

function ThemeToggleButton() {
  const { theme, cycleTheme } = useTheme();
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return (
    <button
      type="button"
      onClick={cycleTheme}
      title={THEME_LABEL[theme]}
      aria-label={THEME_LABEL[theme]}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-950 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}

export default function Navbar() {
  const { user, profile, isAdmin, isBanned, deviceBanned, loading, signIn, signOut } = useAuth();
  const blocked = (isBanned || deviceBanned) && !isAdmin;
  const alerts = useOrderAlerts();
  const { dbUnreadCount } = useNotifications();
  const { unreadCount: chatUnread } = useChat();
  const { savedCount, priceDropCount } = useSavedListings();
  const { canInstall, promptInstall } = usePwaInstall();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [termsModalOpen, setTermsModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const displayName = profile?.display_name ?? user?.email ?? 'Tài khoản';

  const handleSignIn = async () => {
    setSigningIn(true);
    try {
      await signIn();
    } catch {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setMenuOpen(false);
    setMobileOpen(false);
    await signOut();
    navigate('/');
  };

  const handleSellClick = () => {
    setMobileOpen(false);
    if (hasAcceptedSellerTerms()) {
      navigate('/sell');
    } else {
      setTermsModalOpen(true);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-40 h-14 border-b border-neutral-200 bg-white/95 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto flex h-full max-w-6xl items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <Link to="/" className="flex min-w-0 shrink-0 items-center gap-2 tracking-tight text-neutral-950 dark:text-neutral-50">
            <img src="/logo.png" alt="VAHA Market" className="h-7 w-7 rounded-md object-cover" />
            <span className="text-sm font-bold tracking-wider">VAHA MARKET</span>
            <span className="hidden rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 sm:inline-block">
              0% PHÍ
            </span>
          </Link>

          <nav className="ml-2 hidden items-center gap-0.5 lg:flex">
            <NavLink to="/" end className={navLinkClass}>
              Khám phá
            </NavLink>
            {user && (
              <>
                <NavLink to="/messages" className={navLinkClass}>
                  <MessageSquare size={15} strokeWidth={1.75} /> Hộp thư <CountBadge count={chatUnread} />
                </NavLink>
                <NavLink to="/orders" className={navLinkClass}>
                  Đơn hàng <CountBadge count={alerts.total} />
                </NavLink>
                <NavLink to="/my-listings" className={navLinkClass}>
                  Tin của tôi
                </NavLink>
              </>
            )}
            <NavLink to="/transparency" className={navLinkClass}>
              Minh bạch
            </NavLink>
            <NavLink to="/support" className={navLinkClass}>
              <Heart size={14} strokeWidth={1.9} className="text-rose-500" /> Ủng hộ
            </NavLink>
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                <Shield size={15} strokeWidth={1.75} /> Quản trị
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {user && (
              <Link
                to="/messages"
                title={chatUnread > 0 ? `Hộp thư (${chatUnread} chưa đọc)` : 'Hộp thư'}
                aria-label="Hộp thư"
                className="relative inline-flex h-8 items-center justify-center gap-1 rounded-md border border-neutral-200 bg-white px-2 text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-950 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-100 lg:hidden"
              >
                <MessageSquare size={16} strokeWidth={1.75} />
                <CountBadge count={chatUnread} />
              </Link>
            )}
            {user && (
              <Link
                to="/saved"
                title={priceDropCount > 0 ? `Tin đã lưu (${priceDropCount} tin giảm giá)` : `Tin đã lưu (${savedCount})`}
                aria-label="Tin đã lưu"
                className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-950 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                <Bookmark size={16} strokeWidth={1.75} className={savedCount > 0 ? 'text-blue-600 dark:text-blue-400' : ''} />
                {priceDropCount > 0 && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
                )}
              </Link>
            )}
            {user && <NotificationBell />}
            <ThemeToggleButton />

            {!blocked && (
              <button
                type="button"
                onClick={handleSellClick}
                className="btn-primary inline-flex h-8 px-2.5 text-xs sm:px-3"
              >
                <Plus size={15} strokeWidth={2} /> Đăng bán
              </button>
            )}

            {loading ? (
              <span className="h-8 w-8 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
            ) : user ? (
              <div ref={menuRef} className="relative hidden lg:block">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                >
                  <Avatar name={displayName} url={profile?.avatar_url ?? null} size={28} />
                  <ChevronDown size={14} strokeWidth={1.75} className="text-neutral-400" />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-1.5 w-56 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 dark:border-neutral-800 dark:bg-neutral-900"
                  >
                    <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{displayName}</p>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
                    </div>
                    <Link
                      role="menuitem"
                      to={`/u/${user.id}`}
                      className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <Store size={15} strokeWidth={1.75} className="text-neutral-400" /> Trang cá nhân
                    </Link>
                    <Link
                      role="menuitem"
                      to="/saved"
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <span className="flex items-center gap-2">
                        <Bookmark size={15} strokeWidth={1.75} className="text-neutral-400" /> Tin đã lưu
                      </span>
                      {savedCount > 0 && (
                        <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                          {savedCount}
                        </span>
                      )}
                    </Link>
                    <Link
                      role="menuitem"
                      to="/notifications"
                      className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <span className="flex items-center gap-2">
                        <Bell size={15} strokeWidth={1.75} className="text-neutral-400" /> Thông báo
                      </span>
                      {dbUnreadCount > 0 && (
                        <span className="rounded bg-blue-600 px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-white">
                          {dbUnreadCount}
                        </span>
                      )}
                    </Link>
                    <Link
                      role="menuitem"
                      to="/alerts"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <Search size={15} strokeWidth={1.75} className="text-neutral-400" /> Từ khóa săn kèo
                    </Link>
                    <Link
                      role="menuitem"
                      to="/my-listings"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <Tag size={15} strokeWidth={1.75} className="text-neutral-400" /> Tin của tôi
                    </Link>
                    <Link
                      role="menuitem"
                      to="/settings"
                      className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <Settings size={15} strokeWidth={1.75} className="text-neutral-400" /> Cài đặt
                    </Link>
                    {canInstall && (
                      <button
                        role="menuitem"
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          void promptInstall();
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-blue-700 hover:bg-neutral-50 dark:text-blue-400 dark:hover:bg-neutral-800"
                      >
                        <Download size={15} strokeWidth={1.75} /> Cài ứng dụng
                      </button>
                    )}
                    <button
                      role="menuitem"
                      type="button"
                      onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                    >
                      <LogOut size={15} strokeWidth={1.75} className="text-neutral-400" /> Đăng xuất
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button type="button" onClick={handleSignIn} disabled={signingIn} className="btn-secondary hidden h-8 px-3 text-xs lg:inline-flex">
                <LogIn size={15} strokeWidth={1.75} /> Đăng nhập
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Đóng danh mục' : 'Mở danh mục'}
              aria-expanded={mobileOpen}
              className="btn-ghost relative h-8 w-8 px-0 lg:hidden"
            >
              {mobileOpen ? <X size={18} strokeWidth={1.75} /> : <Menu size={18} strokeWidth={1.75} />}
              {!mobileOpen && alerts.total + chatUnread + dbUnreadCount > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-b border-neutral-200 bg-white px-4 pb-4 pt-2 dark:border-neutral-800 dark:bg-neutral-950 lg:hidden">
            {!blocked && (
              <button type="button" onClick={handleSellClick} className="btn-primary mb-2 w-full">
                <Plus size={16} strokeWidth={1.75} /> Đăng bán
              </button>
            )}
            <div className="flex flex-col gap-0.5">
              <NavLink to="/" end className={navLinkClass}>Khám phá</NavLink>
              <NavLink to="/transparency" className={navLinkClass}>Minh bạch</NavLink>
              <NavLink to="/support" className={navLinkClass}>
                <Heart size={15} strokeWidth={1.9} className="text-rose-500" /> Ủng hộ
              </NavLink>
              {user ? (
                <>
                  <div className="my-1 flex items-center gap-2 border-y border-neutral-100 py-2 dark:border-neutral-800">
                    <Avatar name={displayName} url={profile?.avatar_url ?? null} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{displayName}</p>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
                    </div>
                  </div>
                  <NavLink to="/messages" className={navLinkClass}>
                    Hộp thư <CountBadge count={chatUnread} />
                  </NavLink>
                  <NavLink to="/orders" className={navLinkClass}>Đơn hàng <CountBadge count={alerts.total} /></NavLink>
                  <NavLink to="/notifications" className={navLinkClass}>
                    Thông báo <CountBadge count={dbUnreadCount} />
                  </NavLink>
                  <NavLink to="/alerts" className={navLinkClass}>Từ khóa săn kèo</NavLink>
                  <NavLink to="/saved" className={navLinkClass}>
                    Tin đã lưu{savedCount > 0 ? ` (${savedCount})` : ''}
                  </NavLink>
                  <NavLink to="/my-listings" className={navLinkClass}>Tin của tôi</NavLink>
                  <NavLink to={`/u/${user.id}`} className={navLinkClass}>Trang cá nhân</NavLink>
                  {isAdmin && <NavLink to="/admin" className={navLinkClass}><Shield size={15} strokeWidth={1.75} /> Quản trị</NavLink>}
                  <NavLink to="/settings" className={navLinkClass}>Cài đặt</NavLink>
                  {canInstall && (
                    <button
                      type="button"
                      onClick={() => void promptInstall()}
                      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-blue-700 hover:bg-neutral-100 dark:text-blue-400 dark:hover:bg-neutral-800"
                    >
                      <Download size={15} strokeWidth={1.75} /> Cài ứng dụng
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                  >
                    <LogOut size={15} strokeWidth={1.75} /> Đăng xuất
                  </button>
                </>
              ) : (
                <button type="button" onClick={handleSignIn} disabled={signingIn} className="btn-secondary mt-2 w-full">
                  <LogIn size={16} strokeWidth={1.75} /> Đăng nhập Google
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <SellerTermsModal
        open={termsModalOpen}
        onAccept={() => {
          setTermsModalOpen(false);
          navigate('/sell');
        }}
        onCancel={() => {
          setTermsModalOpen(false);
          navigate('/');
        }}
      />
    </>
  );
}
