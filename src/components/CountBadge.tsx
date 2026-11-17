/** Huy hiệu số tròn màu đỏ báo có việc cần xử lý. Không hiển thị khi count <= 0. */
export default function CountBadge({ count, className = '' }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-semibold leading-5 text-white ${className}`}
      aria-label={`${count} đơn cần xử lý`}
    >
      {count > 9 ? '9+' : count}
    </span>
  );
}
