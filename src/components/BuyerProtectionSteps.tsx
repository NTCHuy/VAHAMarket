import { Banknote, PackageCheck, ShieldCheck } from 'lucide-react';

const STEPS = [
  { icon: Banknote, num: '1', title: 'Chuyển khoản', sub: 'Sàn giữ tiền' },
  { icon: PackageCheck, num: '2', title: 'Mở hộp & test', sub: 'Video 6 mặt' },
  { icon: ShieldCheck, num: '3', title: 'Xác nhận', sub: 'Mở khóa giải ngân' },
] as const;

export default function BuyerProtectionSteps({ current, compact = false }: { current?: 1 | 2 | 3; compact?: boolean }) {
  return (
    <div className="space-y-2">
      <ol
        className="grid grid-cols-3 divide-x divide-neutral-200 rounded-md border border-neutral-200 bg-neutral-50 dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950"
        aria-label="Quy trình bảo lãnh 3 bước"
      >
        {STEPS.map(({ icon: Icon, num, title, sub }, i) => {
          const active = current === i + 1;
          return (
            <li
              key={num}
              className={`min-w-0 px-2 py-2 sm:px-2.5 ${active ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''}`}
            >
              <div className="flex items-center gap-1">
                <Icon
                  size={14}
                  strokeWidth={1.75}
                  className={active ? 'shrink-0 text-blue-700 dark:text-blue-400' : 'shrink-0 text-neutral-400 dark:text-neutral-500'}
                />
                <span className={`truncate ${compact ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-sm'} font-medium text-neutral-900 dark:text-neutral-100`}>
                  {num}. {title}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[10px] text-neutral-500 dark:text-neutral-400 sm:text-[11px]">{sub}</p>
            </li>
          );
        })}
      </ol>
      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
        Tiền được giữ an toàn tại tài khoản trung gian của sàn cho đến khi người mua xác nhận đã nhận hàng ổn định hoặc có phán quyết cuối cùng từ Admin.
      </p>
    </div>
  );
}
