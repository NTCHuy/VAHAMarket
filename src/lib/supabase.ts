import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !publishableKey) {
  throw new Error(
    'Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_PUBLISHABLE_KEY. Hãy sao chép .env.example thành .env và điền giá trị.',
  );
}

// Chặn sai sót nghiêm trọng: secret key lọt vào bundle frontend sẽ bị lộ cho mọi người truy cập.
if (publishableKey.startsWith('sb_secret_') || publishableKey.includes('service_role')) {
  throw new Error('KHÔNG dùng secret/service_role key ở frontend. Hãy dùng key sb_publishable_...');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // đọc session sau khi Google redirect về
    flowType: 'pkce',
  },
  realtime: { params: { eventsPerSecond: 10 } },
});
