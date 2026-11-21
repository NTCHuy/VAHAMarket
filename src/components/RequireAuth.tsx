import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LogIn, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Alert, PageLoader } from './ui';

export default function RequireAuth({ requireAdmin = false }: { requireAdmin?: boolean }) {
  const { user, loading, isAdmin, error, signIn } = useAuth();
  const [busy, setBusy] = useState(false);

  if (loading) return <PageLoader />;

  if (!user) {
    return (
      <div className="card mx-auto mt-8 max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">Đăng nhập để tiếp tục</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Bạn cần đăng nhập bằng tài khoản Google để sử dụng chức năng này.</p>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await signIn();
            } catch {
              setBusy(false);
            }
          }}
          className="btn-primary mt-4 w-full"
        >
          <LogIn className="h-4 w-4" /> Đăng nhập với Google
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto mt-8 max-w-md">
        <Alert kind="error">Không tải được hồ sơ của bạn: {error}</Alert>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="card mx-auto mt-8 max-w-md p-6 text-center">
        <ShieldAlert className="mx-auto h-8 w-8 text-slate-400" />
        <h1 className="mt-2 text-lg font-semibold">Không đủ quyền truy cập</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Khu vực này chỉ dành cho quản trị viên.</p>
      </div>
    );
  }

  return <Outlet />;
}
