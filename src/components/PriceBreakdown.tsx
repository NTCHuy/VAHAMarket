import { formatVND } from '@/lib/money';
import type { FeePayer } from '@/constants/fees';

interface Props {
  listPrice: number;
  buyerFee: number;
  total: number;
  feePayer: FeePayer;
  feeRateBp: number;
  waivedReason?: string;
  isFeeCapped?: boolean;
  feeCapVnd?: number;
  feeSavedAmount?: number;
}

export default function PriceBreakdown({ listPrice, total }: Props) {
  return (
    <dl className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-neutral-50 text-sm tabular-nums dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex justify-between gap-3 px-3 py-2">
        <dt className="text-neutral-600 dark:text-neutral-400">Giá sản phẩm</dt>
        <dd className="font-medium text-neutral-900 dark:text-neutral-100">{formatVND(listPrice)}</dd>
      </div>
      <div className="flex justify-between gap-3 px-3 py-2">
        <dt className="text-neutral-600 dark:text-neutral-400">Phí trung gian</dt>
        <dd className="text-right font-medium text-emerald-700 dark:text-emerald-400">Miễn phí (0%)</dd>
      </div>
      <div className="flex justify-between gap-3 px-3 py-2.5">
        <dt className="font-semibold text-neutral-950 dark:text-neutral-50">Tổng thanh toán</dt>
        <dd className="text-base font-semibold text-blue-700 dark:text-blue-400">{formatVND(total)}</dd>
      </div>
    </dl>
  );
}
