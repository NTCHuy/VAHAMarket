import { ESCROW_ACCOUNT } from '@/constants/payment';
import { getBankByBin } from '@/constants/banks';

/**
 * Tạo link ảnh VietQR động qua img.vietqr.io (Quick Link).
 * Định dạng: https://img.vietqr.io/image/<BIN>-<SỐ_TK>-<TEMPLATE>.png?amount=&addInfo=&accountName=
 * Templates: compact | compact2 | qr_only | print
 */
const VIETQR_BASE = 'https://img.vietqr.io/image';

export type VietQrTemplate = 'compact' | 'compact2' | 'qr_only' | 'print';

export interface VietQrParams {
  /** Mã BIN ngân hàng nhận. Mặc định: tài khoản Escrow. */
  bin?: string;
  /** Số tài khoản nhận. Mặc định: tài khoản Escrow. */
  accountNo?: string;
  /** Tên chủ tài khoản (hiển thị trên QR). */
  accountName?: string;
  /** Số tiền VND (số nguyên dương). Bỏ trống → người chuyển tự nhập. */
  amount?: number;
  /** Nội dung chuyển khoản (được làm sạch, tối đa 50 ký tự). */
  addInfo?: string;
  template?: VietQrTemplate;
}

/** Bỏ dấu tiếng Việt. */
export function removeVietnameseTones(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Nội dung CK: bỏ dấu, bỏ ký tự đặc biệt (ngân hàng thường loại bỏ chúng), tối đa 50 ký tự. */
export function sanitizeTransferContent(input: string): string {
  return removeVietnameseTones(input)
    .replace(/[^A-Za-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);
}

/** Tên chủ TK: IN HOA, không dấu (chuẩn hiển thị ngân hàng). */
export function normalizeAccountName(input: string): string {
  return removeVietnameseTones(input).replace(/[^A-Za-z ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase().slice(0, 50);
}

/**
 * Số tài khoản nhận tiền: hỗ trợ cả tài khoản ảo (VA) có chữ cái, ví dụ `96247VAHA`.
 * KHÔNG lọc bằng .replace(/\D/g, '') vì sẽ xóa mất phần chữ của VA.
 */
export const ACCOUNT_NO_RE = /^[A-Z0-9]{6,25}$/i;
export const isValidAccountNo = (v: string): boolean => ACCOUNT_NO_RE.test(v.trim());

export function buildVietQrUrl(params: VietQrParams = {}): string {
  let {
    bin = ESCROW_ACCOUNT.bin,
    accountNo = ESCROW_ACCOUNT.accountNo,
    accountName = ESCROW_ACCOUNT.accountName,
    amount,
    addInfo,
    template = 'compact2',
  } = params;

  if (!/^\d{6}$/.test(bin)) throw new Error(`Mã BIN không hợp lệ: ${bin}`);
  if (!isValidAccountNo(accountNo)) throw new Error('Số tài khoản không hợp lệ (6–25 ký tự chữ hoặc số).');
  accountNo = accountNo.trim().toUpperCase();
  if (amount !== undefined && (!Number.isInteger(amount) || amount <= 0)) {
    throw new Error('Số tiền phải là số nguyên dương (VND).');
  }

  const query = new URLSearchParams();
  if (amount !== undefined) query.set('amount', String(amount));
  if (addInfo) query.set('addInfo', sanitizeTransferContent(addInfo));
  if (accountName) query.set('accountName', normalizeAccountName(accountName));

  const qs = query.toString();
  return `${VIETQR_BASE}/${bin}-${accountNo}-${template}.png${qs ? `?${qs}` : ''}`;
}

/** QR để NGƯỜI MUA chuyển tiền vào tài khoản Escrow của sàn. */
export function buildEscrowQrUrl(opts: { amount: number; paymentCode: string; template?: VietQrTemplate }): string {
  return buildVietQrUrl({ amount: opts.amount, addInfo: opts.paymentCode, template: opts.template });
}

/** Như buildEscrowQrUrl nhưng không bao giờ ném lỗi (trả về null) — dùng trong lúc render để không trắng trang. */
export function tryBuildEscrowQrUrl(opts: { amount: number; paymentCode: string; template?: VietQrTemplate }): string | null {
  try {
    return buildEscrowQrUrl(opts);
  } catch (e) {
    console.error('[vietqr] Không tạo được mã QR:', e);
    return null;
  }
}

/** QR để ADMIN giải ngân cho NGƯỜI BÁN hoặc hoàn tiền cho NGƯỜI MUA (dùng snapshot tài khoản trong đơn hàng). */
export function buildPayoutQrUrl(opts: {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  paymentCode: string;
  addInfo?: string;
}): string {
  return buildVietQrUrl({
    bin: opts.bankBin,
    accountNo: opts.accountNumber,
    accountName: opts.accountName,
    amount: opts.amount,
    addInfo: opts.addInfo ?? `Giai ngan don ${opts.paymentCode}`,
  });
}

/** Thông tin hiển thị cạnh mã QR (cho người dùng chuyển khoản thủ công). */
export function getEscrowTransferInfo(): { bankName: string; accountNo: string; accountName: string } {
  return {
    bankName: getBankByBin(ESCROW_ACCOUNT.bin)?.shortName ?? ESCROW_ACCOUNT.bankCode,
    accountNo: ESCROW_ACCOUNT.accountNo,
    accountName: ESCROW_ACCOUNT.accountName,
  };
}
