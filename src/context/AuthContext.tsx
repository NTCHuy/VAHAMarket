import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getSession, onAuthChange, signInWithGoogle, signOut as doSignOut } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import type { Profile, ProfileContact } from '@/types';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  contact: ProfileContact | null;
  isAdmin: boolean;
  /** true khi đang khôi phục phiên hoặc đang tải hồ sơ */
  loading: boolean;
  /** Lỗi khi tải hồ sơ (nếu có) */
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface UserData {
  profile: Profile | null;
  contact: ProfileContact | null;
  isAdmin: boolean;
}

async function fetchUserData(userId: string): Promise<UserData> {
  const [p, c, a] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('profile_contacts').select('*').eq('user_id', userId).maybeSingle(),
    // Bảng `admins` không cho client đọc trực tiếp (RLS) → hỏi qua hàm is_admin() của DB.
    supabase.rpc('is_admin'),
  ]);
  if (p.error) throw p.error;
  if (c.error) throw c.error;
  return {
    profile: (p.data as Profile | null) ?? null,
    contact: (c.data as ProfileContact | null) ?? null,
    isAdmin: a.error ? false : a.data === true,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [data, setData] = useState<UserData>({ profile: null, contact: null, isAdmin: false });
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 1) Phiên đăng nhập. Không gọi API Supabase bên trong callback onAuthStateChange (tránh deadlock).
  useEffect(() => {
    let active = true;
    getSession()
      .then((s) => {
        if (active) setUser(s?.user ?? null);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setInitializing(false);
      });

    const unsubscribe = onAuthChange((u) => {
      // Giữ nguyên object khi chỉ refresh token → tránh render lại không cần thiết
      setUser((prev) => (prev?.id === u?.id ? prev : u));
      setInitializing(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  // 2) Tải profile / contact / quyền admin mỗi khi đổi người dùng.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setData({ profile: null, contact: null, isAdmin: false });
      setError(null);
      setDataLoading(false);
      return;
    }
    let active = true;
    setDataLoading(true);
    fetchUserData(userId)
      .then((d) => {
        if (!active) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (active) setError(getErrorMessage(e));
      })
      .finally(() => {
        if (active) setDataLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      setData(await fetchUserData(userId));
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  }, [userId]);

  const signIn = useCallback(
    () => signInWithGoogle(`${window.location.pathname}${window.location.search}`),
    [],
  );

  const signOut = useCallback(async () => {
    await doSignOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile: data.profile,
      contact: data.contact,
      isAdmin: data.isAdmin,
      loading: initializing || (userId !== null && dataLoading),
      error,
      signIn,
      signOut,
      refresh,
    }),
    [user, data, initializing, userId, dataLoading, error, signIn, signOut, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng bên trong <AuthProvider>.');
  return ctx;
}
