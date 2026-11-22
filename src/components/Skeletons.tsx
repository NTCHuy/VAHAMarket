/** Skeleton loaders giữ bố cục ổn định (chống giật CLS) trong lúc tải dữ liệu từ Supabase. */

export function ListingGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <ul
      aria-label="Đang tải danh sách sản phẩm"
      aria-busy="true"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="card overflow-hidden">
          <div className="aspect-[4/3] w-full animate-pulse bg-neutral-200/70 dark:bg-neutral-800" />
          <div className="space-y-2.5 p-2.5 sm:p-3">
            <div className="space-y-1.5">
              <div className="h-3.5 w-full animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" />
            </div>
            <div className="space-y-1">
              <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-200/90 dark:bg-neutral-800" />
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800/70" />
            </div>
            <div className="space-y-1 pt-1">
              <div className="h-2.5 w-2/3 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800/70" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800/70" />
            </div>
            <div className="flex justify-between border-t border-neutral-100 pt-2 dark:border-neutral-800">
              <div className="h-2.5 w-20 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800/70" />
              <div className="h-2.5 w-14 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800/70" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ListingDetailSkeleton() {
  return (
    <div aria-label="Đang tải chi tiết sản phẩm" aria-busy="true" className="mx-auto max-w-6xl space-y-4">
      <div className="h-4 w-48 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" />
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-5">
          <div className="card overflow-hidden p-3">
            <div className="aspect-[4/3] w-full animate-pulse rounded-md bg-neutral-200/70 dark:bg-neutral-800" />
            <div className="mt-2.5 flex gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 w-14 shrink-0 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800 sm:h-16 sm:w-16" />
              ))}
            </div>
          </div>
          <div className="card space-y-3 p-5">
            <div className="h-4 w-40 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex justify-between gap-4 border-t border-neutral-100 pt-2 dark:border-neutral-800">
                <div className="h-3.5 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800/70" />
                <div className="h-3.5 w-32 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" />
              </div>
            ))}
          </div>
        </div>
        <div className="card space-y-4 p-5">
          <div className="space-y-2">
            <div className="h-5 w-full animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" />
            <div className="h-5 w-2/3 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" />
          </div>
          <div className="h-8 w-44 animate-pulse rounded bg-neutral-200/90 dark:bg-neutral-800" />
          <div className="h-28 w-full animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800/70" />
          <div className="h-10 w-full animate-pulse rounded-md bg-neutral-200/80 dark:bg-neutral-800" />
        </div>
      </div>
    </div>
  );
}

export function ListRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <ul aria-label="Đang tải danh sách" aria-busy="true" className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="card flex gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="h-20 w-20 shrink-0 animate-pulse rounded-md bg-neutral-200/70 dark:bg-neutral-800" />
          <div className="min-w-0 flex-1 space-y-2 py-0.5">
            <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-200/80 dark:bg-neutral-800" />
            <div className="h-3.5 w-1/3 animate-pulse rounded bg-neutral-200/70 dark:bg-neutral-800" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800/70" />
          </div>
        </li>
      ))}
    </ul>
  );
}
