import { PLATFORM_FEE_BP } from '@/constants/payment';
import type { FeePayer } from '@/constants/fees';

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export const formatVND = (value: number): string => vnd.format(value);

export interface FeeBreakdown {
  listPrice: number;     // giá niêm yết
  feeRateBp: number;     // 500 = 5%, 0 nếu người bán là Mod
  platformFee: number;   // tổng phí sàn thu
  buyerFee: number;      // phần phí người mua chịu
  sellerFee: number;     // phần phí người bán chịu
  buyerPays: number;     // số tiền người mua phải chuyển khoản
  sellerReceives: number; // số tiền người bán thực nhận
}

/**
 * Tính tiền Escrow — PHẢI giống hệt hàm SQL `create_order` (005):
 *  - Phí tổng = 5% giá niêm yết, làm tròn nửa lên; người bán là Mod → 0%.
 *  - SELLER: người mua trả giá;        người bán nhận giá − phí
 *  - BUYER : người mua trả giá + phí;  người bán nhận đủ giá
 *  - SPLIT : người mua trả giá + nửa phí; người bán nhận giá − nửa còn lại
 * Dùng số nguyên (không dùng số thực) để không lệch 1đ so với DB. Phí ship KHÔNG nằm trong đây.
 */
export function calcFees(price: number, feePayer: FeePayer, isMod = false): FeeBreakdown {
  if (!Number.isInteger(price) || price <= 0) throw new Error('Giá phải là số nguyên dương.');
  const bp = isMod ? 0 : PLATFORM_FEE_BP;
  const platformFee = Math.floor((price * bp + 5000) / 10000);

  let buyerFee = 0;
  let sellerFee = platformFee;
  if (feePayer === 'BUYER') {
    buyerFee = platformFee;
    sellerFee = 0;
  } else if (feePayer === 'SPLIT') {
    buyerFee = Math.floor((price * bp + 10000) / 20000);
    sellerFee = platformFee - buyerFee;
  }

  return {
    listPrice: price,
    feeRateBp: bp,
    platformFee,
    buyerFee,
    sellerFee,
    buyerPays: price + buyerFee,
    sellerReceives: price - sellerFee,
  };
}

/** % giảm giá làm tròn; trả về 0 nếu không có giá gốc hợp lệ. */
export function discountPercent(price: number, originalPrice: number | null | undefined): number {
  if (!originalPrice || originalPrice <= price) return 0;
  return Math.round(((originalPrice - price) / originalPrice) * 100);
}
