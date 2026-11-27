import { Star } from 'lucide-react';
import { formatRatingScore } from '@/lib/reviews';

export function StarRow({
  rating,
  size = 14,
  className = '',
}: {
  rating: number;
  size?: number;
  className?: string;
}) {
  const rounded = Math.round(Math.max(0, Math.min(5, rating)));
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`${rating.toFixed(1)} trên 5 sao`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={1.75}
          className={
            n <= rounded
              ? 'fill-amber-500 text-amber-500'
              : 'text-neutral-300 dark:text-neutral-700'
          }
        />
      ))}
    </span>
  );
}

export function RatingSummaryBadge({
  avg,
  count,
  compact = false,
}: {
  avg: number | null | undefined;
  count: number | null | undefined;
  compact?: boolean;
}) {
  const total = Number(count ?? 0);
  const score = Number(avg ?? 0);

  if (total <= 0) {
    return compact ? null : (
      <span className="inline-flex items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
        <Star size={12} strokeWidth={1.75} className="text-neutral-400 dark:text-neutral-500" />
        Chưa có đánh giá
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 tabular-nums ${
        compact ? 'text-[11px]' : 'text-xs'
      } text-neutral-700 dark:text-neutral-300`}
    >
      <Star
        size={compact ? 11 : 13}
        strokeWidth={1.75}
        className="shrink-0 fill-amber-500 text-amber-500"
      />
      <strong className="font-semibold text-neutral-900 dark:text-neutral-100">
        {formatRatingScore(score)}
      </strong>
      <span className="text-neutral-500 dark:text-neutral-400">({total})</span>
    </span>
  );
}

const RATING_LABELS: Record<number, string> = {
  1: 'Rất không hài lòng',
  2: 'Chưa hài lòng',
  3: 'Bình thường',
  4: 'Hài lòng',
  5: 'Rất hài lòng',
};

export function StarInput({
  value,
  onChange,
  disabled = false,
}: {
  value: number;
  onChange: (rating: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="Chọn số sao">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= value;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} sao`}
              onClick={() => onChange(n)}
              className="rounded-md p-1 transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Star
                size={24}
                strokeWidth={1.75}
                className={
                  active
                    ? 'fill-amber-500 text-amber-500'
                    : 'text-neutral-300 hover:text-amber-400 dark:text-neutral-700 dark:hover:text-amber-500'
                }
              />
            </button>
          );
        })}
      </div>
      {value >= 1 && value <= 5 && (
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          {value}/5 · {RATING_LABELS[value]}
        </span>
      )}
    </div>
  );
}
