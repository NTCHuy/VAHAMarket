// Edge Function nhận webhook biến động số dư từ SePay.
// Deploy: supabase functions deploy sepay-webhook --no-verify-jwt
// (SePay không gửi JWT của Supabase nên phải tắt verify_jwt; xác thực bằng API Key riêng bên dưới.)
//
// Secrets cần đặt (KHÔNG commit):
//   supabase secrets set SB_SECRET_KEY=sb_secret_xxx SEPAY_WEBHOOK_KEY=chuoi_bi_mat_ngau_nhien
// SePay → Cấu hình WebHooks → Kiểu chứng thực: API Key → nhập đúng SEPAY_WEBHOOK_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SECRET_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_KEY = Deno.env.get('SEPAY_WEBHOOK_KEY')!;

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface SepayPayload {
  id: number | string;
  gateway?: string;
  transactionDate?: string; // "2026-11-15 10:00:00" (giờ Việt Nam)
  accountNumber?: string;
  content?: string;
  transferType?: 'in' | 'out';
  transferAmount?: number;
  referenceCode?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  // SePay gửi header: Authorization: Apikey <KEY>
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.replace(/^Apikey\s+/i, '');
  if (!WEBHOOK_KEY || !safeEqual(token, WEBHOOK_KEY)) {
    return json({ success: false, message: 'Unauthorized' }, 401);
  }

  let body: SepayPayload;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON' }, 400);
  }

  if (body.id === undefined || body.transferAmount === undefined || !body.transferType) {
    return json({ success: false, message: 'Missing fields' }, 400);
  }

  // "2026-11-15 10:00:00" là giờ Việt Nam (UTC+7)
  const txDate = body.transactionDate
    ? new Date(`${body.transactionDate.replace(' ', 'T')}+07:00`).toISOString()
    : new Date().toISOString();

  const { data, error } = await admin.rpc('process_bank_transaction', {
    p_provider: 'sepay',
    p_provider_tx_id: String(body.id),
    p_direction: body.transferType,
    p_amount: Math.round(Number(body.transferAmount)),
    p_content: body.content ?? '',
    p_reference_code: body.referenceCode ?? null,
    p_account_number: body.accountNumber ?? null,
    p_transaction_date: txDate,
    p_raw: body,
  });

  if (error) {
    console.error('process_bank_transaction failed', error);
    // Trả 500 để SePay tự gửi lại (hàm là idempotent nên gửi lại an toàn)
    return json({ success: false, message: 'Internal error' }, 500);
  }

  return json({ success: true, result: data });
});
