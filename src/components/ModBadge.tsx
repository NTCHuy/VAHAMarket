import { ShieldCheck } from 'lucide-react';

export default function ModBadge({ full = false }: { full?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 dark:border-violet-900 dark:bg-violet-950/60 dark:text-violet-300">
      <ShieldCheck className="h-3 w-3" /> {full ? 'Mod Group' : 'Mod'}
    </span>
  );
}
