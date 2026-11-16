import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Headphones, LogIn, LogOut, Menu, Package, Plus, Settings, Shield, Tag, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar } from './ui';

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  }`;

export default function Navbar() {
  const { user, profile, isAdmin, loading, signIn, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Đóng menu khi đổi trang
  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [location.pathname]);

  // Đóng menu tài khoản khi bấm ra ngoài / nhấn Esc
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
      await signIn(); // chuyển hướng sang Google
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

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
            <Headphones className="h-[18px] w-[18px]" />
          </span>
          <span className="hidden sm:inline">Chợ Nghiện Tai Nghe</span>
          <span className="sm:hidden">CNTN</span>
        </Link>

        {/* Desktop */}
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {user && (
            <NavLink to="/orders" className={navLinkClass}>
              <Package className="h-4 w-4" /> Đơn hàng của tôi
            </NavLink>
          )}
          {isAdmin && (
            <NavLink to="/admin" className={navLinkClass}>
              <Shield className="h-4 w-4" /> Admin
            </NavLink>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Link to="/sell" className="btn-primary hidden sm:inline-flex">
            <Plus className="h-4 w-4" /> Đăng bán
          </Link>

          {loading ? (
            <span className="h-8 w-8 animate-pulse rounded-full bg-slate-100" />
          ) : user ? (
            <div ref={menuRef} className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <Avatar name={displayName} url={profile?.avatar_url ?? null} />
                <span className="max-w-[9rem] truncate text-sm font-medium text-slate-700">{displayName}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {menuOpen && (
                <div role="menu" className="absolute right-0 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-pop">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                  <Link role="menuitem" to="/my-listings" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <Tag className="h-4 w-4 text-slate-400" /> Tin đăng của tôi
                  </Link>
                  <Link role="menuitem" to="/settings" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <Settings className="h-4 w-4 text-slate-400" /> Cài đặt tài khoản
                  </Link>
                  <button
                    role="menuitem"
                    type="button"
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <LogOut className="h-4 w-4 text-slate-400" /> Đăng xuất
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={handleSignIn} disabled={signingIn} className="btn-secondary hidden md:inline-flex">
              <LogIn className="h-4 w-4" /> Đăng nhập với Google
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={mobileOpen}
            className="btn-ghost px-2 md:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 pt-2 md:hidden">
          <Link to="/sell" className="btn-primary mb-2 w-full">
            <Plus className="h-4 w-4" /> Đăng bán
          </Link>
          {user ? (
            <div className="flex flex-col">
              <div className="flex items-center gap-2 px-1 py-2">
                <Avatar name={displayName} url={profile?.avatar_url ?? null} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
              </div>
              <NavLink to="/orders" className={navLinkClass}><Package className="h-4 w-4" /> Đơn hàng của tôi</NavLink>
              <NavLink to="/my-listings" className={navLinkClass}><Tag className="h-4 w-4" /> Tin đăng của tôi</NavLink>
              {isAdmin && <NavLink to="/admin" className={navLinkClass}><Shield className="h-4 w-4" /> Admin</NavLink>}
              <NavLink to="/settings" className={navLinkClass}><Settings className="h-4 w-4" /> Cài đặt tài khoản</NavLink>
              <button type="button" onClick={handleSignOut} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                <LogOut className="h-4 w-4" /> Đăng xuất
              </button>
            </div>
          ) : (
            <button type="button" onClick={handleSignIn} disabled={signingIn} className="btn-secondary w-full">
              <LogIn className="h-4 w-4" /> Đăng nhập với Google
            </button>
          )}
        </div>
      )}
    </header>
  );
}
