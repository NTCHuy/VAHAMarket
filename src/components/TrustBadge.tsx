import { Link } from 'react-router-dom';
import { ExternalLink, Heart, ShieldCheck } from 'lucide-react';
import { DISCORD_SERVER_URL, GROUP_URL } from '@/constants/links';

const linkCls =
  'inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-blue-700 hover:underline dark:text-neutral-300 dark:hover:text-blue-400';

export default function TrustBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div className="space-y-2">
      <p className={`flex items-start gap-2 ${compact ? 'text-xs' : 'text-sm'} leading-relaxed text-neutral-600 dark:text-neutral-400`}>
        <ShieldCheck size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-blue-700 dark:text-blue-400" />
        <span>
          <strong className="font-medium text-neutral-900 dark:text-neutral-100">VAHA Market</strong> — Nền tảng giao dịch trung gian 0% phí của cộng đồng Hội người Việt nghiện tai nghe, vận hành phi lợi nhuận vì cộng đồng.
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-6">
        <a href={GROUP_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
          Group Facebook <ExternalLink size={12} strokeWidth={1.75} />
        </a>
        <a href={DISCORD_SERVER_URL} target="_blank" rel="noopener noreferrer" className={linkCls}>
          Discord hỗ trợ <ExternalLink size={12} strokeWidth={1.75} />
        </a>
        <Link to="/transparency" className={linkCls}>
          Minh bạch dòng tiền
        </Link>
        <Link to="/support" className={linkCls}>
          <Heart size={12} strokeWidth={1.75} /> Ủng hộ sàn
        </Link>
        <Link to="/terms" className={linkCls}>
          Điều khoản dịch vụ
        </Link>
      </div>
    </div>
  );
}
