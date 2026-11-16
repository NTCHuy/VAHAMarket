import { ShieldCheck } from 'lucide-react';

/** Huy hiệu Mod: miễn phí trung gian 0%. */
export default function ModBadge({ full = false }: { full?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
      <ShieldCheck className="h-3 w-3" /> {full ? 'Mod Group · Phí trung gian 0%' : 'Mod'}
    </span>
  );
}
