import { PLATFORM_FEE_BP } from '@/constants/payment';
import { PLATFORM_FEE_CAP, type FeePayer } from '@/constants/fees';

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export const formatVND = (value: number): string => vnd.format(value);

export interface FeeBreakdown {
  listPrice: number;       // giá niêm yết
  feeRateBp: number;       // 500 = 5%, 0 nếu người bán là Mod hoặc ưu đãi 0%
  uncappedFee: number;     // phí tính theo % trước khi áp trần
  feeCapVnd: number;       // trần phí tối đa đang áp dụng (0 = tắt trần)
  isFeeCapped: boolean;    // true nếu phí đã chạm trần
  feeSavedAmount: number;  // số tiền tiết kiệm được nhờ trần phí (= uncappedFee - platformFee)
  platformFee: number;     // tổng phí sàn thu sau khi áp trần
  buyerFee: number;        // phần phí người mua chịu
  sellerFee: number;       // phần phí người bán chịu
  buyerPays: number;       // số tiền người mua phải chuyển khoản
  sellerReceives: number;  // số tiền người bán thực nhận
}

/**
 * Tính tiền Escrow — PHẢI giống hệt hàm SQL `create_order` (010):
 *  - uncappedFee = round_half_up(price * bp / 10000); người bán là Mod → bp = 0.
 *  - Nếu feeCapVnd > 0 và uncappedFee > feeCapVnd → platformFee = feeCapVnd, feeSavedAmount = uncappedFee - feeCapVnd.
 *  - Chia phí dựa trên platformFee ĐÃ ÁP TRẦN:
 *    + SELLER: người mua trả giá;           người bán nhận giá − platformFee
 *    + BUYER : người mua trả giá + phí;     người bán nhận đủ giá
 *    + SPLIT : người mua chịu round(platformFee/2), người bán chịu phần còn lại
 * Dùng số nguyên (không dùng số thực) để không lệch 1đ so với DB. Phí ship KHÔNG nằm trong đây.
 */
export function calcFees(
  price: number,
  feePayer: FeePayer,
  isMod = false,
  rateBp: number = PLATFORM_FEE_BP,
  feeCapVnd: number = PLATFORM_FEE_CAP,
): FeeBreakdown {
  if (!Number.isInteger(price) || price <= 0) throw new Error('Giá phải là số nguyên dương.');
  const bp = isMod ? 0 : Math.min(Math.max(Math.round(rateBp), 0), PLATFORM_FEE_BP);
  const effectiveCap = Number.isFinite(feeCapVnd) && feeCapVnd > 0 ? Math.floor(feeCapVnd) : 0;

  const uncappedFee = Math.floor((price * bp + 5000) / 10000);
  const isFeeCapped = effectiveCap > 0 && uncappedFee > effectiveCap;
  const platformFee = isFeeCapped ? effectiveCap : uncappedFee;
  const feeSavedAmount = isFeeCapped ? uncappedFee - effectiveCap : 0;

  let buyerFee = 0;
  let sellerFee = platformFee;
  if (feePayer === 'BUYER') {
    buyerFee = platformFee;
    sellerFee = 0;
  } else if (feePayer === 'SPLIT') {
    // Khớp 100% với Postgres round(v_total_fee / 2.0)::bigint
    buyerFee = Math.floor((platformFee + 1) / 2);
    sellerFee = platformFee - buyerFee;
  }

  return {
    listPrice: price,
    feeRateBp: bp,
    uncappedFee,
    feeCapVnd: effectiveCap,
    isFeeCapped,
    feeSavedAmount,
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
 *  - Ưu đãi phí sàn: khi phí toàn sàn < 5% và người mua chịu một phần phí (BUYER/SPLIT) → gạch ngang giá trọn gói ở mức chuẩn 5% (có áp trần).
 *  - Giảm giá của admin (original_price): gạch ngang giá trọn gói của giá gốc (cùng cách chia phí & trần phí).
 */
export function getDisplayPrice(
  l: { price: number; original_price: number | null; fee_payer: FeePayer },
  opts: { isMod: boolean; globalBp: number; feeCapVnd?: number },
): DisplayPrice {
  const cap = opts.feeCapVnd ?? PLATFORM_FEE_CAP;
  const fees = calcFees(l.price, l.fee_payer, opts.isMod, opts.globalBp, cap);
  const display = fees.buyerPays;

  const promoActive = opts.globalBp > 0 && opts.globalBp < PLATFORM_FEE_BP && l.fee_payer !== 'SELLER';
  const hasDiscount = l.original_price !== null && l.original_price > l.price;

  let strike: number | null = null;
  if (hasDiscount || promoActive) {
    const base = hasDiscount ? (l.original_price as number) : l.price;
    const strikeBp = promoActive ? PLATFORM_FEE_BP : opts.isMod ? 0 : opts.globalBp;
    strike = calcFees(base, l.fee_payer, false, strikeBp, cap).buyerPays;
    if (strike <= display) strike = null;
  }

  const feePromo = promoActive && calcFees(l.price, l.fee_payer, false, PLATFORM_FEE_BP, cap).buyerPays > display;
  const percent = strike ? Math.round(((strike - display) / strike) * 100) : 0;
  return { display, strike, percent, feePromo, fees };
}
