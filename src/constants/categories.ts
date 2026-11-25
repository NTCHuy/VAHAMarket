import type { LucideIcon } from 'lucide-react';
import { Cable, Cpu, Disc3, Headphones, Mic, Music4, Package, Radio, Speaker } from 'lucide-react';

export interface Category {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'iem', label: 'Tai nghe nhét tai (IEM)', description: 'IEM, tai nghe có dây', icon: Headphones },
  { id: 'over-ear', label: 'Tai nghe chụp tai', description: 'Chụp tai mở, đóng, planar, dynamic', icon: Headphones },
  { id: 'tws', label: 'Tai nghe không dây', description: 'TWS, Bluetooth, chống ồn', icon: Headphones },
  { id: 'dac-amp', label: 'DAC / Amp', description: 'DAC/Amp để bàn, di động, dongle', icon: Cpu },
  { id: 'dap', label: 'Máy nghe nhạc', description: 'Máy nghe nhạc chuyên dụng (DAP)', icon: Music4 },
  { id: 'cable-accessory', label: 'Dây & Phụ kiện', description: 'Dây nâng cấp, nút tai, đệm tai, hộp đựng', icon: Cable },
  { id: 'speaker', label: 'Loa', description: 'Loa kệ, loa Bluetooth, loa kiểm âm', icon: Speaker },
  { id: 'amp-receiver', label: 'Ampli', description: 'Ampli tích hợp, pre/power, đèn', icon: Radio },
  { id: 'turntable-vinyl', label: 'Mâm than & Đĩa', description: 'Mâm đĩa than, kim, đĩa vinyl, CD', icon: Disc3 },
  { id: 'mic-interface', label: 'Micro & Thu âm', description: 'Micro thu âm, sound card', icon: Mic },
  { id: 'other', label: 'Khác', description: 'Thiết bị âm thanh khác', icon: Package },
] as const;

export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export const getCategory = (id: string): Category | undefined => CATEGORIES.find((c) => c.id === id);

export type ListingCondition = 'like_new' | 'good' | 'fair' | 'for_parts';

export const LISTING_CONDITIONS: readonly { id: ListingCondition; label: string; hint: string }[] = [
  { id: 'like_new', label: 'Như mới (99%)', hint: 'Gần như chưa trầy xước' },
  { id: 'good', label: 'Tốt (90–98%)', hint: 'Hoạt động tốt, trầy nhẹ' },
  { id: 'fair', label: 'Khá (70–89%)', hint: 'Hoạt động ổn, có dấu vết dùng' },
  { id: 'for_parts', label: 'Xác / Linh kiện', hint: 'Lỗi hoặc hỏng, bán lấy linh kiện' },
] as const;

export const getConditionLabel = (id: string): string =>
  LISTING_CONDITIONS.find((c) => c.id === id)?.label ?? id;

export type BoxStatus = 'full' | 'box_only' | 'accessories_only' | 'none';

export const BOX_STATUS_OPTIONS: readonly { id: BoxStatus; label: string }[] = [
  { id: 'full', label: 'Đủ hộp & phụ kiện' },
  { id: 'box_only', label: 'Có hộp, thiếu phụ kiện' },
  { id: 'accessories_only', label: 'Có phụ kiện, không hộp' },
  { id: 'none', label: 'Chỉ có sản phẩm' },
] as const;

export const getBoxStatusLabel = (id: string): string =>
  BOX_STATUS_OPTIONS.find((o) => o.id === id)?.label ?? id;
