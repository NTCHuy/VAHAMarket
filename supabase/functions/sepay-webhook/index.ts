// Edge Function nhận webhook biến động số dư từ SePay.
// Deploy: supabase functions deploy sepay-webhook --no-verify-jwt
// (SePay không gửi JWT của Supabase nên phải tắt verify_jwt; xác thực bằng API Key riêng bên dưới.)
//
// Secrets cần đặt (KHÔNG commit):
//   supabase secrets set SB_SECRET_KEY=sb_secret_xxx SEPAY_WEBHOOK_KEY=chuoi_bi_mat_ngau_nhien
//   (Khuyến nghị) supabase secrets set SEPAY_ALLOWED_ACCOUNTS="96247VAHA"
// SePay → Cấu hình WebHooks → Kiểu chứng thực: API Key → nhập đúng SEPAY_WEBHOOK_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SECRET_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const WEBHOOK_KEY = Deno.env.get('SEPAY_WEBHOOK_KEY') ?? '';
const ALLOWED_ACCOUNTS = (Deno.env.get('SEPAY_ALLOWED_ACCOUNTS') ?? '')
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const MAX_BODY_BYTES = 64 * 1024;
const MAX_AMOUNT_VND = 10_000_000_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/;

const admin = createClient(SUPABASE_URL, SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface SepayPayload {
  id: number | string;
  gateway?: string;
  transactionDate?: string; // "2026-11-15 10:00:00" (giờ Việt Nam)
  accountNumber?: string;
  subAccount?: string | null;
  content?: string;
  transferType?: 'in' | 'out';
  transferAmount?: number;
  referenceCode?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
  });

async function safeEqual(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

function parseTransactionDate(raw?: string): string {
  if (typeof raw === 'string' && DATE_RE.test(raw.trim())) {
    const dt = new Date(`${raw.trim().replace(' ', 'T')}+07:00`);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
  return new Date().toISOString();
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  // SePay gửi header: Authorization: Apikey <KEY>
  const auth = req.headers.get('authorization')?.trim() ?? '';
  const match = /^Apikey\s+(.+)$/i.exec(auth);
  const token = match?.[1]?.trim() ?? '';
  if (!WEBHOOK_KEY || !(await safeEqual(token, WEBHOOK_KEY))) {
    return json({ success: false, message: 'Unauthorized' }, 401);
  }

  let rawText: string;
  try {
    rawText = await req.text();
  } catch {
    return json({ success: false, message: 'Invalid body' }, 400);
  }
  if (rawText.length > MAX_BODY_BYTES) {
    return json({ success: false, message: 'Payload too large' }, 413);
  }

  let body: SepayPayload;
  try {
    body = JSON.parse(rawText) as SepayPayload;
  } catch {
    return json({ success: false, message: 'Invalid JSON' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return json({ success: false, message: 'Invalid JSON' }, 400);
  }

  const txId = body.id !== undefined && body.id !== null ? String(body.id).trim() : '';
  const amount = Math.round(Number(body.transferAmount));
  if (
    !txId ||
    txId.length > 100 ||
    (body.transferType !== 'in' && body.transferType !== 'out') ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > MAX_AMOUNT_VND
  ) {
    return json({ success: false, message: 'Invalid or missing fields' }, 400);
  }

  // Nếu đã cấu hình danh sách số tài khoản Escrow hợp lệ → bỏ qua giao dịch từ tài khoản khác (vd tài khoản ủng hộ)
  if (ALLOWED_ACCOUNTS.length > 0) {
    const candidates = [body.accountNumber, body.subAccount]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim().toUpperCase());
    if (candidates.length === 0 || !candidates.some((acc) => ALLOWED_ACCOUNTS.includes(acc))) {
      return json({ success: true, result: { result: 'IGNORED_ACCOUNT' } });
    }
  }

  const txDate = parseTransactionDate(body.transactionDate);
  const accountNo =
    typeof body.subAccount === 'string' && body.subAccount.trim()
      ? body.subAccount.trim()
      : typeof body.accountNumber === 'string' && body.accountNumber.trim()
        ? body.accountNumber.trim()
        : null;

  const { data, error } = await admin.rpc('process_bank_transaction', {
    p_provider: 'sepay',
    p_provider_tx_id: txId,
    p_direction: body.transferType,
    p_amount: amount,
    p_content: typeof body.content === 'string' ? body.content.slice(0, 1000) : '',
    p_reference_code: typeof body.referenceCode === 'string' ? body.referenceCode.slice(0, 120) : null,
    p_account_number: accountNo ? accountNo.slice(0, 40) : null,
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
