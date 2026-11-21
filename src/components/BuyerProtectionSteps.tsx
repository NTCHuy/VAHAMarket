import { Banknote, PackageCheck, ShieldCheck } from 'lucide-react';

const STEPS = [
  { icon: Banknote, title: '1. Bạn chuyển khoản', sub: 'Web giữ tiền' },
  { icon: PackageCheck, title: '2. Người bán gửi hàng', sub: 'Bạn quay video test' },
  { icon: ShieldCheck, title: '3. Bạn bấm Xác nhận', sub: 'Web mới chuyển tiền cho người bán' },
] as const;

/** Thanh 3 bước bảo vệ người mua + cảnh báo nổi bật. `current` tô sáng bước hiện tại (1–3). */
export default function BuyerProtectionSteps({ current, compact = false }: { current?: 1 | 2 | 3; compact?: boolean }) {
  return (
    <div className="space-y-3">
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="3 bước bảo vệ người mua">
        {STEPS.map(({ icon: Icon, title, sub }, i) => {
          const active = current === i + 1;
          return (
            <li
              key={title}
              className={`flex items-start gap-2.5 rounded-xl border p-3 ${
                active
                  ? 'border-brand-600 bg-brand-50 dark:border-brand-500 dark:bg-brand-900/30'
                  : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? 'text-brand-700 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'}`} />
              <div className="min-w-0">
                <p className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-slate-900 dark:text-slate-100`}>{title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-400">{sub}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p
        className={`rounded-xl border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-center font-bold text-emerald-900 dark:border-emerald-700/80 dark:bg-emerald-950/50 dark:text-emerald-200 ${
          compact ? 'text-base' : 'text-lg sm:text-xl'
        }`}
      >
        Người bán CHƯA nhận được tiền cho đến khi bạn xác nhận
      </p>
    </div>
  );
}
