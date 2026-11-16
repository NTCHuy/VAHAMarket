export type FeePayer = 'SELLER' | 'BUYER' | 'SPLIT';

/** Phải khớp CHECK `listings_fee_payer_check` / `orders_fee_payer_check` trong DB. */
export const FEE_PAYER_OPTIONS: readonly { id: FeePayer; label: string; hint: string }[] = [
  { id: 'SELLER', label: 'Người bán chịu phí', hint: 'Người mua trả đúng giá niêm yết, bạn nhận giá trừ phí.' },
  { id: 'BUYER', label: 'Người mua chịu phí', hint: 'Người mua trả giá + phí, bạn nhận đủ giá niêm yết.' },
  { id: 'SPLIT', label: 'Chia đôi phí', hint: 'Mỗi bên chịu một nửa phí.' },
] as const;

export const getFeePayerLabel = (id: string): string => FEE_PAYER_OPTIONS.find((o) => o.id === id)?.label ?? id;
