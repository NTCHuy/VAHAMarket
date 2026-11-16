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

export function buildVietQrUrl(params: VietQrParams = {}): string {
  const {
    bin = ESCROW_ACCOUNT.bin,
    accountNo = ESCROW_ACCOUNT.accountNo,
    accountName = ESCROW_ACCOUNT.accountName,
    amount,
    addInfo,
    template = 'compact2',
  } = params;

  if (!/^\d{6}$/.test(bin)) throw new Error(`Mã BIN không hợp lệ: ${bin}`);
  if (!/^\d{6,19}$/.test(accountNo)) throw new Error('Số tài khoản không hợp lệ (6–19 chữ số).');
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

/** QR để ADMIN giải ngân cho NGƯỜI BÁN (dùng snapshot tài khoản trong đơn hàng). */
export function buildPayoutQrUrl(opts: {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  paymentCode: string;
}): string {
  return buildVietQrUrl({
    bin: opts.bankBin,
    accountNo: opts.accountNumber,
    accountName: opts.accountName,
    amount: opts.amount,
    addInfo: `Giai ngan don ${opts.paymentCode}`,
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
