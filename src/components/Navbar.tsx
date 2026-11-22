import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BellOff,
  ChevronDown,
  LogIn,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Plus,
  Settings,
  Shield,
  Sun,
  Tag,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useOrderAlerts } from '@/context/OrderAlertsContext';
import { useTheme, type ThemeMode } from '@/context/ThemeContext';
import { useNotifications } from '@/context/NotificationContext';
import CountBadge from './CountBadge';
import SellerTermsModal, { hasAcceptedSellerTerms } from './SellerTermsModal';
import { Avatar } from './ui';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-neutral-100 text-neutral-950 dark:bg-neutral-800 dark:text-neutral-50'
      : 'text-neutral-600 hover:bg-neutral-100/70 hover:text-neutral-950 dark:text-neutral-400 dark:hover:bg-neutral-800/70 dark:hover:text-neutral-50'
  }`;

const THEME_LABEL: Record<ThemeMode, string> = {
  light: 'Giao diện Sáng (bấm để chuyển Tối)',
  dark: 'Giao diện Tối (bấm để chuyển Theo hệ thống)',
  system: 'Giao diện Theo hệ thống (bấm để chuyển Sáng)',
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

function NotificationToggleButton() {
  const { browserSupported, browserEnabled, toggleBrowserNotifications } = useNotifications();
  if (!browserSupported) return null;
  const label = browserEnabled
    ? 'Đang bật thông báo đẩy trình duyệt (bấm để tắt)'
    : 'Bật thông báo đẩy trình duyệt khi có đơn hàng mới';

  return (
    <button
      type="button"
      onClick={() => void toggleBrowserNotifications()}
      title={label}
      aria-label={label}
      aria-pressed={browserEnabled}
      className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${
        browserEnabled
          ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
          : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 hover:text-neutral-950 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100'
      }`}
    >
      {browserEnabled ? <Bell size={16} strokeWidth={1.75} /> : <BellOff size={16} strokeWidth={1.75} />}
      {browserEnabled && (
        <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
      )}
    </button>
  );
}

export default function Navbar() {
  const { user, profile, isAdmin, isBanned, deviceBanned, loading, signIn, signOut } = useAuth();
  const blocked = (isBanned || deviceBanned) && !isAdmin;
  const alerts = useOrderAlerts();
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
        <div className="mx-auto flex h-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 tracking-tight text-neutral-950 dark:text-neutral-50">
            <span className="text-sm font-bold tracking-wider">VAHA MARKET</span>
            <span className="rounded border border-neutral-200 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
              ESCROW
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="ml-3 hidden items-center gap-0.5 md:flex">
            <NavLink to="/" end className={navLinkClass}>
              Khám phá
            </NavLink>
            {user && (
              <>
                <NavLink to="/orders" className={navLinkClass}>
                  Đơn hàng <CountBadge count={alerts.total} />
                </NavLink>
                <NavLink to="/my-listings" className={navLinkClass}>
                  Tin của tôi
                </NavLink>
              </>
            )}
            {isAdmin && (
              <NavLink to="/admin" className={navLinkClass}>
                <Shield size={15} strokeWidth={1.75} /> Admin
              </NavLink>
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user && <NotificationToggleButton />}
            <ThemeToggleButton />

            {!blocked && (
              <button
                type="button"
                onClick={handleSellClick}
                className="btn-primary hidden h-8 px-3 text-xs sm:inline-flex"
              >
                <Plus size={15} strokeWidth={2} /> Đăng bán
              </button>
            )}

            {loading ? (
              <span className="h-8 w-8 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
            ) : user ? (
              <div ref={menuRef} className="relative hidden md:block">
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
                      <Settings size={15} strokeWidth={1.75} className="text-neutral-400" /> Cài đặt tài khoản
                    </Link>
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
              <button type="button" onClick={handleSignIn} disabled={signingIn} className="btn-secondary hidden h-8 px-3 text-xs md:inline-flex">
                <LogIn size={15} strokeWidth={1.75} /> Đăng nhập
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={mobileOpen}
              className="btn-ghost relative h-8 w-8 px-0 md:hidden"
            >
              {mobileOpen ? <X size={18} strokeWidth={1.75} /> : <Menu size={18} strokeWidth={1.75} />}
              {!mobileOpen && alerts.total > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-600" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile panel */}
        {mobileOpen && (
          <div className="border-b border-neutral-200 bg-white px-4 pb-4 pt-2 dark:border-neutral-800 dark:bg-neutral-950 md:hidden">
            {!blocked && (
              <button type="button" onClick={handleSellClick} className="btn-primary mb-2 w-full">
                <Plus size={16} strokeWidth={1.75} /> Đăng bán
              </button>
            )}
            <div className="flex flex-col gap-0.5">
              <NavLink to="/" end className={navLinkClass}>Khám phá</NavLink>
              {user ? (
                <>
                  <div className="my-1 flex items-center gap-2 border-y border-neutral-100 py-2 dark:border-neutral-800">
                    <Avatar name={displayName} url={profile?.avatar_url ?? null} size={32} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">{displayName}</p>
                      <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">{user.email}</p>
                    </div>
                  </div>
                  <NavLink to="/orders" className={navLinkClass}>Đơn hàng <CountBadge count={alerts.total} /></NavLink>
                  <NavLink to="/my-listings" className={navLinkClass}>Tin của tôi</NavLink>
                  {isAdmin && <NavLink to="/admin" className={navLinkClass}><Shield size={15} strokeWidth={1.75} /> Admin</NavLink>}
                  <NavLink to="/settings" className={navLinkClass}>Cài đặt tài khoản</NavLink>
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
                  <LogIn size={16} strokeWidth={1.75} /> Đăng nhập với Google
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
