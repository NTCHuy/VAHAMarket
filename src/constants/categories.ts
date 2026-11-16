import type { LucideIcon } from 'lucide-react';
import { Cable, Cpu, Disc3, Headphones, Mic, Music4, Package, Radio, Speaker } from 'lucide-react';

export interface Category {
  /** Slug lưu trong Firestore (`listings.category`) */
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const CATEGORIES: readonly Category[] = [
  { id: 'iem', label: 'Tai nghe In-ear (IEM)', description: 'IEM, earbud có dây', icon: Headphones },
  { id: 'over-ear', label: 'Tai nghe Over-ear / On-ear', description: 'Open-back, closed-back, planar, dynamic', icon: Headphones },
  { id: 'tws', label: 'Tai nghe True Wireless', description: 'TWS, Bluetooth, chống ồn ANC', icon: Headphones },
  { id: 'dac-amp', label: 'DAC / Amp', description: 'DAC/Amp để bàn và di động, dongle', icon: Cpu },
  { id: 'dap', label: 'Máy nghe nhạc (DAP)', description: 'Digital Audio Player', icon: Music4 },
  { id: 'cable-accessory', label: 'Dây cáp & Phụ kiện', description: 'Dây nâng cấp, tip, pad, adapter, hộp đựng', icon: Cable },
  { id: 'speaker', label: 'Loa & Soundbar', description: 'Loa bookshelf, loa Bluetooth, monitor', icon: Speaker },
  { id: 'amp-receiver', label: 'Ampli & Receiver', description: 'Ampli tích hợp, pre/power, ống đèn', icon: Radio },
  { id: 'turntable-vinyl', label: 'Đầu đĩa than & Đĩa', description: 'Turntable, cartridge, đĩa vinyl, CD', icon: Disc3 },
  { id: 'mic-interface', label: 'Micro & Audio Interface', description: 'Micro thu âm, sound card, interface', icon: Mic },
  { id: 'other', label: 'Khác', description: 'Các thiết bị âm thanh khác', icon: Package },
] as const;

export const CATEGORY_IDS: readonly string[] = CATEGORIES.map((c) => c.id);

export const getCategory = (id: string): Category | undefined => CATEGORIES.find((c) => c.id === id);

/** Tình trạng sản phẩm — phải khớp với danh sách trong firestore.rules */
export type ListingCondition = 'like_new' | 'good' | 'fair' | 'for_parts';

export const LISTING_CONDITIONS: readonly { id: ListingCondition; label: string; hint: string }[] = [
  { id: 'like_new', label: 'Như mới (99%)', hint: 'Gần như không dấu hiệu sử dụng, đủ hộp/phụ kiện' },
  { id: 'good', label: 'Tốt (90–98%)', hint: 'Hoạt động hoàn hảo, có vết xước nhẹ' },
  { id: 'fair', label: 'Khá (70–89%)', hint: 'Hoạt động tốt, có dấu hiệu sử dụng rõ' },
  { id: 'for_parts', label: 'Xác / Lấy linh kiện', hint: 'Hỏng hoặc lỗi, bán để sửa chữa/lấy linh kiện' },
] as const;

export const getConditionLabel = (id: string): string =>
  LISTING_CONDITIONS.find((c) => c.id === id)?.label ?? id;

/** Tình trạng hộp & phụ kiện — khớp CHECK `listings_box_status_check` trong DB */
export type BoxStatus = 'full' | 'box_only' | 'accessories_only' | 'none';

export const BOX_STATUS_OPTIONS: readonly { id: BoxStatus; label: string }[] = [
  { id: 'full', label: 'Đầy đủ hộp & phụ kiện' },
  { id: 'box_only', label: 'Có hộp, thiếu phụ kiện' },
  { id: 'accessories_only', label: 'Có phụ kiện, không hộp' },
  { id: 'none', label: 'Không hộp, không phụ kiện' },
] as const;

export const getBoxStatusLabel = (id: string): string =>
  BOX_STATUS_OPTIONS.find((o) => o.id === id)?.label ?? id;
