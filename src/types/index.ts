import type { BoxStatus, ListingCondition } from '@/constants/categories';

/** Kiểu dữ liệu khớp với supabase/schema.sql (cột snake_case, timestamptz → chuỗi ISO). */

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  sold_count: number;   // chỉ hệ thống cập nhật
  bought_count: number; // chỉ hệ thống cập nhật
  created_at: string;
  updated_at: string;
}

export interface ProfileContact {
  user_id: string;
  email: string | null;
  phone: string | null;
  shipping_address: string | null;
  facebook_url: string | null;
  province: string | null;
  updated_at: string;
}

export interface BankAccount {
  id: string;
  user_id: string;
  bank_bin: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string; // IN HOA KHÔNG DẤU
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListingImage {
  url: string;      // secure_url từ Cloudinary
  publicId?: string;
  width?: number;
  height?: number;
}

export type ListingStatus = 'draft' | 'active' | 'hidden' | 'reserved' | 'sold' | 'removed';

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number; // VND (bigint → number, an toàn dưới 2^53)
  category: string;
  condition: ListingCondition;
  brand: string | null;
  province: string | null; // khu vực giao dịch trực tiếp
  box_status: BoxStatus;
  ship_cod: boolean;       // ship COD, người mua trả phí ship
  images: ListingImage[];
  bank_account_id: string | null;
  status: ListingStatus;
  moderation_note: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID_HELD'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'PAID_OUT'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DISPUTED'
  | 'REFUNDED';

export interface Order {
  id: string;
  payment_code: string; // CNTH + 8 ký tự HEX
  listing_id: string | null;
  listing_snapshot: { title: string; image: string | null; price: number };
  buyer_id: string;
  seller_id: string;
  amount: number;
  platform_fee: number;
  seller_payout: number;
  status: OrderStatus;
  paid_amount: number;
  paid_at: string | null;
  recipient_name: string;
  phone: string;
  address: string;
  note: string | null;
  carrier: string | null;
  tracking_code: string | null;
  packing_video_url: string | null; // video test của người bán
  dispute_reason: string | null;
  dispute_video_url: string | null; // video unbox của người mua
  disputed_at: string | null;
  admin_note: string | null;
  resolved_at: string | null;
  expires_at: string;
  shipped_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type PayoutStatus = 'NOT_READY' | 'PENDING' | 'DONE';

/** Chỉ người bán của đơn và admin đọc được. */
export interface OrderPayout {
  order_id: string;
  seller_id: string;
  bank_bin: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  amount: number;
  status: PayoutStatus;
  paid_out_at: string | null;
  reference: string | null;
}

export type TransactionMatchStatus =
  | 'MATCHED' | 'OVERPAID' | 'UNDERPAID' | 'UNMATCHED' | 'LATE_PAYMENT' | 'EXTRA_PAYMENT' | 'IGNORED';

/** Chỉ admin đọc được. */
export interface Transaction {
  id: string;
  provider: 'sepay' | 'casso';
  provider_tx_id: string;
  direction: 'in' | 'out';
  amount: number;
  content: string;
  reference_code: string | null;
  account_number: string | null;
  transaction_date: string;
  match_status: TransactionMatchStatus;
  order_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_note: string | null;
  created_at: string;
}
