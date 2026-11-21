interface PriceTagProps {
  display: number;
  strike?: number | null;
  percent?: number;
  feePromo?: boolean;
  note?: string;
  size?: 'md' | 'lg';
}

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

export default function PriceTag({ display, strike, percent = 0, feePromo = false, note, size = 'md' }: PriceTagProps) {
  const lg = size === 'lg';
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`${lg ? 'text-3xl' : 'text-base'} font-semibold text-brand-800 dark:text-brand-400`}>{vnd.format(display)}</span>
        {strike ? (
          <>
            <span className={`${lg ? 'text-lg' : 'text-xs'} text-slate-400 line-through dark:text-slate-500`}>{vnd.format(strike)}</span>
            {percent > 0 && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">−{percent}%</span>}
          </>
        ) : null}
      </div>
      {(feePromo || note) && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {feePromo && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">Ưu đãi phí sàn</span>}
          {note && <span>{note}</span>}
        </p>
      )}
    </div>
  );
}
