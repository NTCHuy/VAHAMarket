import { ESCROW_BANK_BIN } from './banks';

/** Phí nền tảng: 5% giá trị sản phẩm (không gồm phí ship). */
export const PLATFORM_FEE_RATE = 0.05;
/** Phí nền tảng tính bằng basis point (500 = 5%). Người bán là Mod: 0. */
export const PLATFORM_FEE_BP = 500;

/** Tiền tố nội dung chuyển khoản, ví dụ: CNTH7K2M9QXA. SePay/Casso nhận diện đơn bằng tiền tố này. */
export const PAYMENT_CODE_PREFIX = 'CNTH';

/** Tài khoản trung gian (Escrow) nhận tiền của người mua. Thông tin này công khai (hiển thị trên mã QR). */
export const ESCROW_ACCOUNT = {
  bin: ESCROW_BANK_BIN, // BIDV
  bankCode: 'BIDV',
  accountNo: '96247VAHA',
  accountName: (import.meta.env.VITE_ESCROW_ACCOUNT_NAME as string | undefined) ?? '',
} as const;

/** Thời gian chờ thanh toán trước khi đơn tự hết hạn (phút). */
export const PAYMENT_TIMEOUT_MINUTES = 15;
