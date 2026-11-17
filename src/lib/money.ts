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
 * Tính tiền Escrow — PHẢI giống hệt hàm SQL `create_order` (006):
 *  - Phí tổng = mức phí toàn sàn (platform_settings, 0–5%) × giá niêm yết, làm tròn nửa lên; người bán là Mod → 0%.
 *  - SELLER: người mua trả giá;        người bán nhận giá − phí
 *  - BUYER : người mua trả giá + phí;  người bán nhận đủ giá
 *  - SPLIT : người mua trả giá + nửa phí; người bán nhận giá − nửa còn lại
 * Dùng số nguyên (không dùng số thực) để không lệch 1đ so với DB. Phí ship KHÔNG nằm trong đây.
 */
export function calcFees(price: number, feePayer: FeePayer, isMod = false, rateBp: number = PLATFORM_FEE_BP): FeeBreakdown {
  if (!Number.isInteger(price) || price <= 0) throw new Error('Giá phải là số nguyên dương.');
  // rateBp = mức phí toàn sàn hiện hành (basis point, 0–500). Người bán Mod luôn 0%.
  const bp = isMod ? 0 : Math.min(Math.max(Math.round(rateBp), 0), PLATFORM_FEE_BP);
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

export interface DisplayPrice {
  /** Giá trọn gói người mua thực sự phải trả (đã gồm phần phí người mua chịu). */
  display: number;
  /** Giá gạch ngang (null nếu không có ưu đãi). */
  strike: number | null;
  /** % giảm so với giá gạch ngang. */
  percent: number;
  /** true nếu giá đang được giảm nhờ ưu đãi phí sàn toàn hệ thống. */
  feePromo: boolean;
  fees: FeeBreakdown;
}

/**
 * Giá hiển thị cho NGƯỜI MUA (thẻ sản phẩm, đầu trang chi tiết). Luôn là giá TRỌN GÓI = số tiền thực sự chuyển khoản.
 *  - Ưu đãi phí sàn: khi phí toàn sàn < 5% và người mua chịu một phần phí (BUYER/SPLIT) → gạch ngang giá trọn gói ở mức chuẩn 5%.
 *  - Giảm giá của admin (original_price): gạch ngang giá trọn gói của giá gốc (cùng cách chia phí).
 */
export function getDisplayPrice(
  l: { price: number; original_price: number | null; fee_payer: FeePayer },
  opts: { isMod: boolean; globalBp: number },
): DisplayPrice {
  const fees = calcFees(l.price, l.fee_payer, opts.isMod, opts.globalBp);
  const display = fees.buyerPays;

  const promoActive = opts.globalBp < PLATFORM_FEE_BP && l.fee_payer !== 'SELLER';
  const hasDiscount = l.original_price !== null && l.original_price > l.price;

  let strike: number | null = null;
  if (hasDiscount || promoActive) {
    const base = hasDiscount ? (l.original_price as number) : l.price;
    const strikeBp = promoActive ? PLATFORM_FEE_BP : opts.isMod ? 0 : opts.globalBp;
    strike = calcFees(base, l.fee_payer, false, strikeBp).buyerPays;
    if (strike <= display) strike = null;
  }

  const feePromo = promoActive && calcFees(l.price, l.fee_payer, false, PLATFORM_FEE_BP).buyerPays > display;
  const percent = strike ? Math.round(((strike - display) / strike) * 100) : 0;
  return { display, strike, percent, feePromo, fees };
}
