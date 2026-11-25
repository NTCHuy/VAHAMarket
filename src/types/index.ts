import type { BoxStatus, ListingCondition } from '@/constants/categories';
import type { FeePayer } from '@/constants/fees';

/** Kiểu dữ liệu khớp với supabase/schema.sql (cột snake_case, timestamptz → chuỗi ISO). */

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  sold_count: number;   // chỉ hệ thống cập nhật
  bought_count: number; // chỉ hệ thống cập nhật
  is_mod: boolean;      // Mod Group: phí trung gian 0% (chỉ admin gán)
  facebook_url: string | null; // link Facebook cá nhân (công khai, bắt buộc để đăng tin)
  warning_count: number;       // số lần cảnh báo (3 lần tự động khóa vĩnh viễn)
  is_banned: boolean;          // tài khoản bị khóa vĩnh viễn
  banned_at: string | null;
  ban_reason: string | null;
  banned_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BannedEntityType = 'fingerprint' | 'bank_account' | 'facebook_url' | 'phone' | 'email';

export interface BannedEntity {
  id: string;
  entity_type: BannedEntityType;
  entity_value: string;
  reason: string;
  source_user_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface UserDevice {
  id: string;
  user_id: string;
  visitor_id: string;
  user_agent: string | null;
  first_seen_at: string;
  last_seen_at: string;
}

export interface UserWarning {
  id: string;
  user_id: string;
  reason: string;
  listing_id: string | null;
  order_id: string | null;
  created_by: string | null;
  created_at: string;
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

export type ListingStatus = 'draft' | 'pending_review' | 'rejected' | 'active' | 'hidden' | 'reserved' | 'sold' | 'removed';

export interface Listing {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number; // VND (bigint → number, an toàn dưới 2^53)
  original_price: number | null; // giá gốc (gạch ngang) nếu đang giảm giá
  fee_payer: FeePayer;
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
  verification_image_url: string; // ảnh sản phẩm cạnh giấy viết tay ('' = tin cũ chưa có)
  rejection_reason: string | null;
  approved_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
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
  amount: number;        // số tiền NGƯỜI MUA phải chuyển khoản
  platform_fee: number;  // tổng phí sàn thu
  seller_payout: number; // số tiền NGƯỜI BÁN thực nhận
  list_price: number;    // giá niêm yết
  fee_payer: FeePayer;
  fee_rate_bp: number;   // 500 = 5%, 0 = Mod
  buyer_fee: number;
  seller_fee: number;
  fee_cap_vnd?: number;      // trần phí áp dụng tại thời điểm tạo đơn (0 = không trần)
  fee_saved_amount?: number; // số tiền tiết kiệm được nhờ trần phí
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
  ship_deadline_at?: string | null;
  refund_requested_at?: string | null;
  refund_completed_at?: string | null;
  refund_reference?: string | null;
  refund_bank_bin?: string | null;
  refund_bank_code?: string | null;
  refund_bank_name?: string | null;
  refund_account_number?: string | null;
  refund_account_name?: string | null;
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

/** Tài khoản nhận hoàn tiền của người mua (chỉ người mua và quản trị viên đọc được). */
export interface OrderRefundAccount {
  order_id: string;
  buyer_id: string;
  bank_bin: string;
  bank_code: string;
  bank_name: string;
  account_number: string;
  account_name: string;
  created_at: string;
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
