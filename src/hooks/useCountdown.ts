import { useEffect, useState } from 'react';

/** Số giây còn lại tới `targetIso` (>= 0), cập nhật mỗi giây. Trả về null nếu không có mốc. */
export function useCountdown(targetIso: string | null): number | null {
  const calc = () => (targetIso ? Math.max(0, Math.ceil((Date.parse(targetIso) - Date.now()) / 1000)) : null);
  const [seconds, setSeconds] = useState<number | null>(calc);

  useEffect(() => {
    setSeconds(calc());
    if (!targetIso) return;
    const id = setInterval(() => setSeconds(calc()), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetIso]);

  return seconds;
}

export function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
