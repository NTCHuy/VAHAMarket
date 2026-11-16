import { discountPercent, formatVND } from '@/lib/money';

/** Giá bán + giá gốc gạch ngang + huy hiệu % giảm (nếu có giá gốc > giá bán). */
export default function PriceTag({ price, originalPrice, size = 'md' }: { price: number; originalPrice?: number | null; size?: 'md' | 'lg' }) {
  const pct = discountPercent(price, originalPrice);
  const main = size === 'lg' ? 'text-3xl' : 'text-base';
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={`${main} font-semibold text-brand-800`}>{formatVND(price)}</span>
      {pct > 0 && originalPrice && (
        <>
          <span className={`${size === 'lg' ? 'text-lg' : 'text-xs'} text-slate-400 line-through`}>{formatVND(originalPrice)}</span>
          <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">−{pct}%</span>
        </>
      )}
    </div>
  );
}
