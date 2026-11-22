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
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums">
        <span className={`${lg ? 'text-2xl sm:text-3xl' : 'text-base'} font-semibold tracking-tight text-neutral-950 dark:text-neutral-50`}>
          {vnd.format(display)}
        </span>
        {strike ? (
          <>
            <span className={`${lg ? 'text-base' : 'text-xs'} text-neutral-400 line-through dark:text-neutral-500`}>
              {vnd.format(strike)}
            </span>
            {percent > 0 && (
              <span className="rounded bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
                −{percent}%
              </span>
            )}
          </>
        ) : null}
      </div>
      {(feePromo || note) && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          {feePromo && (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">Ưu đãi phí sàn</span>
          )}
          {feePromo && note && <span>·</span>}
          {note && <span>{note}</span>}
        </p>
      )}
    </div>
  );
}
