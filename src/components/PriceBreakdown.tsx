import { formatVND } from '@/lib/money';
import type { FeePayer } from '@/constants/fees';

interface Props {
  listPrice: number;
  buyerFee: number;
  total: number;
  feePayer: FeePayer;
  feeRateBp: number;
  waivedReason?: string;
}

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

export default function PriceBreakdown({ listPrice, buyerFee, total, feePayer, feeRateBp, waivedReason }: Props) {
  const share = feePayer === 'BUYER' ? feeRateBp / 100 : feePayer === 'SPLIT' ? feeRateBp / 200 : 0;
  const waived =
    feePayer === 'SELLER' ? 'Miễn phí (Người bán chịu)' : `Miễn phí (${waivedReason ?? 'Ưu đãi phí sàn'})`;

  return (
    <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-sm dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950/60">
      <div className="flex justify-between gap-3 px-3 py-2">
        <dt className="text-slate-600 dark:text-slate-400">Giá sản phẩm gốc</dt>
        <dd className="font-medium text-slate-900 dark:text-slate-100">{formatVND(listPrice)}</dd>
      </div>
      <div className="flex justify-between gap-3 px-3 py-2">
        <dt className="text-slate-600 dark:text-slate-400">{buyerFee > 0 ? `+ Phí bảo lãnh giao dịch (${pct(share)})` : '+ Phí bảo lãnh giao dịch'}</dt>
        <dd className={`text-right font-medium ${buyerFee > 0 ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-700 dark:text-emerald-400'}`}>{buyerFee > 0 ? formatVND(buyerFee) : waived}</dd>
      </div>
      <div className="flex justify-between gap-3 px-3 py-2.5">
        <dt className="font-medium text-slate-900 dark:text-slate-100">= Tổng thanh toán</dt>
        <dd className="text-base font-semibold text-brand-800 dark:text-brand-400">{formatVND(total)}</dd>
      </div>
    </dl>
  );
}
