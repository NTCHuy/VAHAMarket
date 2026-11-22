import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getSession, onAuthChange, signInWithGoogle, signOut as doSignOut } from '@/lib/auth';
import { getErrorMessage } from '@/lib/errors';
import { getVisitorId } from '@/lib/fingerprint';
import type { Profile, ProfileContact } from '@/types';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  contact: ProfileContact | null;
  isAdmin: boolean;
  /** Tài khoản hiện tại đang bị khóa vĩnh viễn */
  isBanned: boolean;
  /** Thiết bị hiện tại nằm trong danh sách đen (kể cả khi chưa đăng nhập) */
  deviceBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  warningCount: number;
  visitorId: string | null;
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

interface DeviceBanState {
  deviceBanned: boolean;
  reason: string | null;
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
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [deviceBan, setDeviceBan] = useState<DeviceBanState>({ deviceBanned: false, reason: null });

  // 0) Lấy Device Fingerprint và kiểm tra danh sách đen ngay cả khi chưa đăng nhập
  useEffect(() => {
    let active = true;
    getVisitorId()
      .then(async (vid) => {
        if (!active) return;
        setVisitorId(vid);
        const { data: res, error: rpcErr } = await supabase.rpc('check_device_banned', { p_visitor_id: vid });
        if (!active || rpcErr || !res || typeof res !== 'object') return;
        const r = res as { banned?: boolean; reason?: string | null };
        setDeviceBan({ deviceBanned: Boolean(r.banned), reason: r.reason ?? null });
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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

  // 3) Khi đã đăng nhập và có visitorId -> ghi nhận thiết bị & tự động kiểm tra/khóa nếu lách luật
  useEffect(() => {
    if (!userId || !visitorId) return;
    let active = true;
    supabase
      .rpc('register_device_and_check_ban', {
        p_visitor_id: visitorId,
        p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
      .then(({ data: res, error: rpcErr }) => {
        if (!active || rpcErr || !res || typeof res !== 'object') return;
        const r = res as { is_banned?: boolean; ban_reason?: string | null; banned_at?: string | null; warning_count?: number; auto_banned?: boolean };
        if (r.is_banned) {
          setData((prev) =>
            prev.profile
              ? {
                  ...prev,
                  profile: {
                    ...prev.profile,
                    is_banned: true,
                    ban_reason: r.ban_reason ?? prev.profile.ban_reason,
                    banned_at: r.banned_at ?? prev.profile.banned_at,
                    warning_count: typeof r.warning_count === 'number' ? r.warning_count : prev.profile.warning_count,
                  },
                }
              : prev,
          );
        }
      });
    return () => {
      active = false;
    };
  }, [userId, visitorId]);

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

  const isBanned = !data.isAdmin && Boolean(data.profile?.is_banned);
  const deviceBanned = !data.isAdmin && deviceBan.deviceBanned;
  const banReason = isBanned ? (data.profile?.ban_reason ?? deviceBan.reason) : deviceBan.reason;
  const bannedAt = data.profile?.banned_at ?? null;
  const warningCount = data.profile?.warning_count ?? 0;

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile: data.profile,
      contact: data.contact,
      isAdmin: data.isAdmin,
      isBanned,
      deviceBanned,
      banReason,
      bannedAt,
      warningCount,
      visitorId,
      loading: initializing || (userId !== null && dataLoading),
      error,
      signIn,
      signOut,
      refresh,
    }),
    [
      user,
      data,
      isBanned,
      deviceBanned,
      banReason,
      bannedAt,
      warningCount,
      visitorId,
      initializing,
      userId,
      dataLoading,
      error,
      signIn,
      signOut,
      refresh,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải được dùng bên trong <AuthProvider>.');
  return ctx;
}
