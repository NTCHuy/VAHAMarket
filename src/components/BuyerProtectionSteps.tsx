import { Banknote, PackageCheck, ShieldCheck } from 'lucide-react';

const STEPS = [
  { icon: Banknote, num: '1', title: 'Chuyển khoản', sub: 'Sàn giữ tiền' },
  { icon: PackageCheck, num: '2', title: 'Nhận & kiểm tra', sub: 'Quay video 6 mặt' },
  { icon: ShieldCheck, num: '3', title: 'Xác nhận', sub: 'Sàn chuyển tiền' },
] as const;

export interface BuyerProtectionStepsProps {
  current?: 1 | 2 | 3;
  layout?: 'compact' | 'wide';
}

export default function BuyerProtectionSteps({ current, layout = 'compact' }: BuyerProtectionStepsProps) {
  const isWide = layout === 'wide';

  return (
    <div className="space-y-2">
      <ol
        className={`grid grid-cols-1 divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-neutral-50 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950 ${
          isWide ? 'md:grid-cols-3 md:divide-x md:divide-y-0' : ''
        }`}
        aria-label="Quy trình trung gian 3 bước"
      >
        {STEPS.map(({ icon: Icon, num, title, sub }, i) => {
          const active = current === i + 1;
          return (
            <li
              key={num}
              className={`min-w-0 p-3 ${
                isWide
                  ? 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 md:block'
                  : 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1'
              } ${active ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}`}
            >
              <div className="flex items-center gap-2">
                <Icon
                  size={16}
                  strokeWidth={1.75}
                  className={active ? 'shrink-0 text-blue-700 dark:text-blue-400' : 'shrink-0 text-neutral-500 dark:text-neutral-400'}
                />
                <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100 sm:text-sm">
                  {num}. {title}
                </span>
              </div>
              <p className={`text-xs text-neutral-500 dark:text-neutral-400 ${isWide ? 'md:mt-1 md:pl-6' : ''}`}>
                {sub}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="text-xs leading-relaxed font-medium text-emerald-700 dark:text-emerald-400">
        Sàn giữ tiền an toàn đến khi người mua xác nhận nhận hàng ổn định hoặc có kết quả phân xử.
      </p>
    </div>
  );
}
