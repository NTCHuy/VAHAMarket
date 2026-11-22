export type FeePayer = 'SELLER' | 'BUYER' | 'SPLIT';

/** Trần phí sàn tối đa mặc định cho mỗi giao dịch (500.000₫). Giá trị 0 = tắt trần. */
export const PLATFORM_FEE_CAP = 500_000;

/** Phải khớp CHECK `listings_fee_payer_check` / `orders_fee_payer_check` trong DB. */
export const FEE_PAYER_OPTIONS: readonly { id: FeePayer; label: string; hint: string }[] = [
  { id: 'SELLER', label: 'Người bán chịu phí', hint: 'Người mua trả đúng giá niêm yết, bạn nhận giá trừ phí.' },
  { id: 'BUYER', label: 'Người mua chịu phí', hint: 'Người mua trả giá + phí, bạn nhận đủ giá niêm yết.' },
  { id: 'SPLIT', label: 'Chia đôi phí', hint: 'Mỗi bên chịu một nửa phí.' },
] as const;

export const getFeePayerLabel = (id: string): string => FEE_PAYER_OPTIONS.find((o) => o.id === id)?.label ?? id;
