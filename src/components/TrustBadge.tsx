import { BadgeCheck, Facebook, MessagesSquare, Users } from 'lucide-react';
import { DISCORD_SERVER_URL, FOUNDER_FACEBOOK_URL, GROUP_URL } from '@/constants/links';

/** Khối chứng thực uy tín của VAHA Market (dùng ở Footer và trang chi tiết sản phẩm). */
export default function TrustBadge({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex gap-3 ${compact ? '' : 'items-start'}`}>
      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
      <div className="min-w-0">
        <p className={`${compact ? 'text-xs' : 'text-sm'} leading-relaxed text-slate-700`}>
          <strong className="text-slate-900">Giao dịch được bảo lãnh bởi VAHA Market</strong> — Nền tảng trung gian thuộc hệ sinh thái Hội người Việt nghiện tai nghe (50.000+ thành viên), vận hành bởi Founder Huy Nguyễn (HweeHiFi).
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a href={FOUNDER_FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Facebook className="h-3.5 w-3.5 text-[#1877F2]" /> Facebook Founder
          </a>
          <a href={GROUP_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Users className="h-3.5 w-3.5 text-brand-700" /> Group 50.000+ thành viên
          </a>
          <a href={DISCORD_SERVER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <MessagesSquare className="h-3.5 w-3.5 text-[#5865F2]" /> Discord Cộng đồng
          </a>
        </div>
      </div>
    </div>
  );
}
