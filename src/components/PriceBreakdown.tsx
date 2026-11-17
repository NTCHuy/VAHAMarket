import { formatVND } from '@/lib/money';
import type { FeePayer } from '@/constants/fees';

interface Props {
  listPrice: number;   // giá sản phẩm gốc
  buyerFee: number;    // phần phí bảo lãnh người mua chịu
  total: number;       // tổng người mua phải thanh toán
  feePayer: FeePayer;
  feeRateBp: number;   // mức phí áp dụng (basis point)
  /** Lý do miễn phí khi người mua chịu phí nhưng phí = 0 (vd "Mod Group"). */
  waivedReason?: string;
}

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

/** Bảng: Giá sản phẩm gốc + Phí bảo lãnh giao dịch (X%) = Tổng thanh toán. */
export default function PriceBreakdown({ listPrice, buyerFee, total, feePayer, feeRateBp, waivedReason }: Props) {
  const share = feePayer === 'BUYER' ? feeRateBp / 100 : feePayer === 'SPLIT' ? feeRateBp / 200 : 0;
  const waived =
    feePayer === 'SELLER' ? 'Miễn phí (Người bán chịu)' : `Miễn phí (${waivedReason ?? 'Ưu đãi phí sàn'})`;

  return (
    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-sm">
      <div className="flex justify-between gap-3 px-3 py-2">
        <dt className="text-slate-600">Giá sản phẩm gốc</dt>
        <dd className="font-medium text-slate-900">{formatVND(listPrice)}</dd>
      </div>
      <div className="flex justify-between gap-3 px-3 py-2">
        <dt className="text-slate-600">{buyerFee > 0 ? `+ Phí bảo lãnh giao dịch (${pct(share)})` : '+ Phí bảo lãnh giao dịch'}</dt>
        <dd className={`text-right font-medium ${buyerFee > 0 ? 'text-slate-900' : 'text-emerald-700'}`}>{buyerFee > 0 ? formatVND(buyerFee) : waived}</dd>
      </div>
      <div className="flex justify-between gap-3 px-3 py-2.5">
        <dt className="font-medium text-slate-900">= Tổng thanh toán</dt>
        <dd className="text-base font-semibold text-brand-800">{formatVND(total)}</dd>
      </div>
    </dl>
  );
}
