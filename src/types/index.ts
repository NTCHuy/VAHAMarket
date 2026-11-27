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
  seller_rating_avg: number;   // điểm trung bình đánh giá người bán (cache DB)
  seller_rating_count: number; // tổng lượt đánh giá người bán (cache DB)
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
  offer_id?: string | null;  // ID đề nghị trả giá đã chốt (nếu đặt mua qua trả giá)
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

export type AdminMemberFilter = 'all' | 'mod' | 'warned' | 'banned' | 'incomplete' | 'sellers';

export interface AdminMemberSummary {
  profile: Profile;
  email: string | null;
  phone: string | null;
  province: string | null;
  is_admin: boolean;
  last_sign_in_at: string | null;
  bank_count: number;
  active_listings_count: number;
  total_listings_count: number;
  device_count: number;
  shared_device_count: number;
  missing_seller_fields: string[];
}

export interface AdminMemberNote {
  id: string;
  user_id: string;
  admin_id: string | null;
  admin_name: string;
  note: string;
  created_at: string;
}

export interface SharedDeviceUser {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_banned: boolean;
  warning_count: number;
  shared_visitor_ids: string[];
}

export type AdminAuditCategory = 'all' | 'listings' | 'reviews' | 'chat' | 'bans' | 'orders' | 'members' | 'settings';

export interface AdminAuditLogEntry {
  id: string;
  admin_id: string | null;
  admin_name: string;
  action: string;
  order_id: string | null;
  payment_code?: string | null;
  listing_id: string | null;
  transaction_id: string | null;
  target_user_id: string | null;
  target_user_name?: string | null;
  note: string | null;
  created_at: string;
}

export interface AdminMemberOrderSummary {
  id: string;
  payment_code: string;
  listing_id: string | null;
  listing_snapshot: { title: string; image: string | null; price: number };
  buyer_id: string;
  seller_id: string;
  amount: number;
  seller_payout: number;
  list_price: number;
  status: OrderStatus;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  completed_at: string | null;
  disputed_at: string | null;
}

export interface AdminMemberDetail {
  profile: Profile;
  is_admin: boolean;
  auth: {
    email: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  };
  contact: ProfileContact | null;
  bank_accounts: BankAccount[];
  missing_seller_fields: string[];
  identity_lock: {
    locked: boolean;
    listings: number;
    orders: number;
  };
  devices: UserDevice[];
  shared_device_users: SharedDeviceUser[];
  warnings: UserWarning[];
  banned_entities: BannedEntity[];
  listings: Listing[];
  orders: AdminMemberOrderSummary[];
  notes: AdminMemberNote[];
  audit_logs: AdminAuditLogEntry[];
  stats: {
    total_listings: number;
    active_listings: number;
    pending_listings: number;
    rejected_listings: number;
    removed_listings: number;
    total_sold_gmv: number;
    total_bought_gmv: number;
    dispute_as_seller: number;
    dispute_as_buyer: number;
  };
}

export interface PublicSellerListingItem {
  id: string;
  seller_id: string;
  title: string;
  price: number;
  original_price: number | null;
  fee_payer: FeePayer;
  condition: ListingCondition;
  category: string;
  province: string | null;
  ship_cod: boolean;
  box_status: BoxStatus;
  images: ListingImage[];
  verification_image_url: string;
  created_at: string;
}

export interface PublicSellerSoldItem {
  id: string;
  title: string;
  price: number;
  condition: ListingCondition;
  category: string;
  province: string | null;
  box_status: BoxStatus;
  images: ListingImage[];
  created_at: string;
  updated_at: string;
}

export interface PublicSellerProfile {
  profile: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    is_mod: boolean;
    is_banned: boolean;
    sold_count: number;
    bought_count: number;
    facebook_url: string | null;
    seller_rating_avg: number;
    seller_rating_count: number;
    created_at: string;
  };
  is_verified_seller: boolean;
  active_listings: PublicSellerListingItem[];
  sold_listings: PublicSellerSoldItem[];
}

export interface SavedListingItem {
  listing_id: string;
  saved_price: number;
  latest_price: number;
  price_dropped_at: string | null;
  saved_at: string;
  price_drop: number;
  listing: PublicSellerListingItem & { status: ListingStatus };
  seller: {
    id: string;
    display_name: string;
    is_mod: boolean;
  } | null;
}

export type ListingReportReason =
  | 'counterfeit'
  | 'scam_suspected'
  | 'off_platform'
  | 'wrong_description'
  | 'already_sold'
  | 'spam'
  | 'other';

export type ListingReportStatus = 'open' | 'resolved' | 'dismissed';

export interface AdminListingReport {
  id: string;
  listing_id: string;
  reporter_id: string;
  reason_category: ListingReportReason;
  details: string | null;
  status: ListingReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  listing: {
    id: string;
    title: string;
    price: number;
    status: ListingStatus;
    images: ListingImage[];
    seller_id: string;
    moderation_note: string | null;
  };
  seller: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_mod: boolean;
    is_banned: boolean;
    warning_count: number;
  } | null;
  reporter: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  resolver_name: string | null;
  open_reports_count: number;
}

export type ReviewRole = 'BUYER' | 'SELLER';

export interface ReviewAuthorSummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_mod: boolean;
  is_banned?: boolean;
}

export interface OrderReview {
  id: string;
  order_id: string;
  reviewer_id: string;
  reviewee_id: string;
  reviewer_role: ReviewRole;
  rating: number;
  comment: string;
  tags: string[];
  reply_text: string | null;
  replied_at: string | null;
  is_hidden: boolean;
  hidden_reason?: string | null;
  hidden_by?: string | null;
  hidden_at?: string | null;
  created_at: string;
  updated_at: string;
  reviewer?: ReviewAuthorSummary;
  listing_id?: string | null;
  listing_title_snapshot?: string;
}

export interface OrderReviewsBundle {
  can_review: boolean;
  my_review: OrderReview | null;
  counterpart_review: OrderReview | null;
}

export interface UserReviewsSummary {
  total_count: number;
  avg_rating: number;
  seller_count: number;
  seller_avg: number;
  buyer_count: number;
  buyer_avg: number;
  stars: Record<'5' | '4' | '3' | '2' | '1', number>;
}

export interface UserReviewsResult {
  summary: UserReviewsSummary;
  total_filtered: number;
  items: OrderReview[];
}

export type AdminReviewFilter = 'ALL' | 'VISIBLE' | 'HIDDEN' | 'LOW_RATING';

export interface AdminReviewItem extends OrderReview {
  payment_code: string;
  listing_id: string | null;
  listing_title_snapshot: string;
  reviewer: ReviewAuthorSummary;
  reviewee: ReviewAuthorSummary;
}

export interface AdminReviewsListResult {
  total: number;
  items: AdminReviewItem[];
  counts: {
    all: number;
    visible: number;
    hidden: number;
    low_rating: number;
  };
}

export type OfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED' | 'ORDERED';
export type ChatMessageType = 'TEXT' | 'OFFER' | 'SYSTEM';

export interface PriceOffer {
  id: string;
  conversation_id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  proposer_id: string;
  original_price: number;
  offered_price: number;
  note: string | null;
  status: OfferStatus;
  order_id: string | null;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  message_type: ChatMessageType;
  body: string;
  offer_id: string | null;
  order_id: string | null;
  created_at: string;
}

export interface ConversationListingPreview {
  id: string;
  title: string;
  price: number;
  status: ListingStatus;
  ship_cod: boolean;
  fee_payer: FeePayer;
  image: string | null;
}

export interface ConversationPartySummary {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_mod: boolean;
  is_banned: boolean;
  sold_count?: number;
  bought_count?: number;
  seller_rating_avg?: number;
  seller_rating_count?: number;
}

export interface ConversationSummary {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  last_message_preview: string;
  last_sender_id: string | null;
  my_unread_count: number;
  is_blocked: boolean;
  blocked_by: string | null;
  created_at: string;
  listing: ConversationListingPreview;
  counterpart: ConversationPartySummary;
  active_offer: PriceOffer | null;
  latest_order_id: string | null;
}

export interface ConversationDetail {
  conversation: {
    id: string;
    listing_id: string;
    buyer_id: string;
    seller_id: string;
    last_message_at: string;
    last_message_preview: string;
    last_sender_id: string | null;
    buyer_unread_count: number;
    seller_unread_count: number;
    is_blocked: boolean;
    blocked_by: string | null;
    created_at: string;
  };
  listing: Pick<
    Listing,
    'id' | 'seller_id' | 'title' | 'price' | 'original_price' | 'fee_payer' | 'condition' | 'category' | 'province' | 'ship_cod' | 'status' | 'images'
  > & {
    seller_is_mod: boolean;
  };
  counterpart: ConversationPartySummary;
  messages: ChatMessage[];
  offers: PriceOffer[];
  active_offer: PriceOffer | null;
  latest_order: {
    id: string;
    payment_code: string;
    status: OrderStatus;
    amount: number;
    offer_id: string | null;
    created_at: string;
  } | null;
  has_more: boolean;
}

export type ChatReportStatus = 'open' | 'resolved' | 'dismissed';

export interface AdminChatReport {
  id: string;
  conversation_id: string;
  reporter_id: string;
  reason: string;
  status: ChatReportStatus;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  listing_id: string;
  listing_title: string;
  buyer_id: string;
  seller_id: string;
  last_message_preview: string;
  last_message_at: string;
  reporter: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
  buyer: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_banned: boolean;
  };
  seller: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_banned: boolean;
  };
  resolver_name: string | null;
}

export interface AdminConversationSnapshot {
  conversation: ConversationDetail['conversation'];
  listing_title: string;
  payment_code: string | null;
  buyer: ConversationPartySummary;
  seller: ConversationPartySummary;
  messages: ChatMessage[];
  offers: PriceOffer[];
}
