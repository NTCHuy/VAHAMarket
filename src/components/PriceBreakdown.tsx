import { formatVND } from '@/lib/money';
import { PLATFORM_FEE_CAP, type FeePayer } from '@/constants/fees';

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

const pct = (n: number) => `${Number(n.toFixed(2))}%`;

export default function PriceBreakdown({
  listPrice,
  buyerFee,
  total,
  feePayer,
  feeRateBp,
  waivedReason,
  isFeeCapped = false,
  feeCapVnd = PLATFORM_FEE_CAP,
  feeSavedAmount = 0,
}: Props) {
  const share = feePayer === 'BUYER' ? feeRateBp / 100 : feePayer === 'SPLIT' ? feeRateBp / 200 : 0;
  const waived =
    feePayer === 'SELLER' ? 'Miễn phí (Người bán chịu)' : `Miễn phí (${waivedReason ?? 'Ưu đãi phí sàn'})`;
  const capLabel = formatVND(feeCapVnd > 0 ? feeCapVnd : PLATFORM_FEE_CAP);

  return (
    <dl className="divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-neutral-50 text-sm tabular-nums dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex justify-between gap-3 px-3 py-2">
        <dt className="text-neutral-600 dark:text-neutral-400">Giá sản phẩm</dt>
        <dd className="font-medium text-neutral-900 dark:text-neutral-100">{formatVND(listPrice)}</dd>
      </div>
      <div className="space-y-1 px-3 py-2">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-600 dark:text-neutral-400">
            {buyerFee > 0 ? `Phí trung gian (${pct(share)})` : 'Phí trung gian'}
            {isFeeCapped && (
              <span className="ml-1 font-medium text-emerald-700 dark:text-emerald-400">
                (Trần {capLabel})
              </span>
            )}
          </dt>
          <dd className={`text-right font-medium ${buyerFee > 0 ? 'text-neutral-900 dark:text-neutral-100' : 'text-emerald-700 dark:text-emerald-400'}`}>
            {buyerFee > 0 ? formatVND(buyerFee) : waived}
          </dd>
        </div>
        {isFeeCapped && feeSavedAmount > 0 && (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
            Tiết kiệm {formatVND(feeSavedAmount)} nhờ chính sách trần phí {capLabel}
          </p>
        )}
      </div>
      <div className="flex justify-between gap-3 px-3 py-2.5">
        <dt className="font-semibold text-neutral-950 dark:text-neutral-50">Tổng thanh toán</dt>
        <dd className="text-base font-semibold text-blue-700 dark:text-blue-400">{formatVND(total)}</dd>
      </div>
    </dl>
  );
}
