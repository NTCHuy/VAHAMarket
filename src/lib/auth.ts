import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

/**
 * Đăng nhập Google. Hồ sơ `profiles` / `profile_contacts` được TRIGGER trong Postgres tự tạo,
 * client không cần (và không có quyền) tự insert.
 *
 * Cấu hình: Dashboard → Authentication → Providers → Google (Client ID/Secret),
 * và Authentication → URL Configuration → thêm http://localhost:5173 vào Redirect URLs.
 */
export async function signInWithGoogle(redirectPath: string = window.location.pathname): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${redirectPath}`,
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

/** Lắng nghe đăng nhập/đăng xuất. Trả về hàm hủy đăng ký. */
export function onAuthChange(callback: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session?.user ?? null));
  return () => data.subscription.unsubscribe();
}
