interface PriceTagProps {
  /** Giá hiển thị chính (với người mua: giá TRỌN GÓI = số tiền thực chuyển khoản). */
  display: number;
  /** Giá gạch ngang (nếu có ưu đãi). */
  strike?: number | null;
  /** % giảm so với giá gạch ngang. */
  percent?: number;
  /** Hiện nhãn "Ưu đãi phí sàn". */
  feePromo?: boolean;
  /** Dòng chú thích nhỏ phía dưới, vd "Giá trọn gói, đã gồm phí bảo lãnh". */
  note?: string;
  size?: 'md' | 'lg';
}

const vnd = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

/** Giá bán + giá gạch ngang + huy hiệu % giảm + nhãn ưu đãi phí sàn. */
export default function PriceTag({ display, strike, percent = 0, feePromo = false, note, size = 'md' }: PriceTagProps) {
  const lg = size === 'lg';
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`${lg ? 'text-3xl' : 'text-base'} font-semibold text-brand-800`}>{vnd.format(display)}</span>
        {strike ? (
          <>
            <span className={`${lg ? 'text-lg' : 'text-xs'} text-slate-400 line-through`}>{vnd.format(strike)}</span>
            {percent > 0 && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">−{percent}%</span>}
          </>
        ) : null}
      </div>
      {(feePromo || note) && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500">
          {feePromo && <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">Ưu đãi phí sàn</span>}
          {note && <span>{note}</span>}
        </p>
      )}
    </div>
  );
}
