import { PLATFORM_FEE_RATE } from '@/constants/payment';

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export const formatVND = (value: number): string => vnd.format(value);

/**
 * Tính tiền Escrow: người mua chuyển đúng `amount` (= giá sản phẩm),
 * sàn giữ 5% phí, người bán nhận phần còn lại. Phí ship KHÔNG nằm trong đây.
 * Ví dụ: 1.000.000đ → fee 50.000đ → seller nhận 950.000đ.
 */
export function calcEscrow(price: number): { amount: number; platformFee: number; sellerPayout: number } {
  if (!Number.isInteger(price) || price <= 0) throw new Error('Giá phải là số nguyên dương.');
  const platformFee = Math.round(price * PLATFORM_FEE_RATE);
  return { amount: price, platformFee, sellerPayout: price - platformFee };
}
