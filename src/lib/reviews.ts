import { supabase } from '@/lib/supabase';
import type {
  OrderReview,
  OrderReviewsBundle,
  ReviewRole,
  UserReviewsResult,
} from '@/types';

export interface ReviewTagOption {
  code: string;
  label: string;
}

export const BUYER_REVIEW_TAGS: ReviewTagOption[] = [
  { code: 'dung_mo_ta', label: 'Đúng mô tả' },
  { code: 'dong_goi_ky', label: 'Đóng gói kỹ' },
  { code: 'giao_nhanh', label: 'Giao hàng nhanh' },
  { code: 'nhiet_tinh', label: 'Nhiệt tình, dễ trao đổi' },
  { code: 'gia_hop_ly', label: 'Giá hợp lý' },
];

export const SELLER_REVIEW_TAGS: ReviewTagOption[] = [
  { code: 'thanh_toan_nhanh', label: 'Thanh toán nhanh' },
  { code: 'xac_nhan_nhanh', label: 'Xác nhận nhận hàng nhanh' },
  { code: 'lich_su', label: 'Trao đổi lịch sự' },
  { code: 'dang_tin_cay', label: 'Đáng tin cậy' },
];

const ALL_REVIEW_TAG_MAP: Record<string, string> = Object.fromEntries(
  [...BUYER_REVIEW_TAGS, ...SELLER_REVIEW_TAGS].map((t) => [t.code, t.label]),
);

export function getReviewTagsForRole(role: ReviewRole): ReviewTagOption[] {
  return role === 'BUYER' ? BUYER_REVIEW_TAGS : SELLER_REVIEW_TAGS;
}

export function getReviewTagLabel(code: string): string {
  return ALL_REVIEW_TAG_MAP[code] ?? code;
}

export function formatRatingScore(avg: number | null | undefined): string {
  if (!avg || avg <= 0) return '0.0';
  return avg.toFixed(1);
}

export function isWithinEditWindow(isoTimestamp: string | null | undefined): boolean {
  if (!isoTimestamp) return false;
  const ms = Date.now() - new Date(isoTimestamp).getTime();
  return ms >= 0 && ms <= 7 * 24 * 60 * 60 * 1000;
}

export async function submitOrderReview(params: {
  orderId: string;
  rating: number;
  comment: string;
  tags: string[];
}): Promise<OrderReview> {
  const { data, error } = await supabase.rpc('submit_order_review', {
    p_order_id: params.orderId,
    p_rating: params.rating,
    p_comment: params.comment,
    p_tags: params.tags,
  });
  if (error) throw error;
  return data as OrderReview;
}

export async function replyOrderReview(reviewId: string, replyText: string): Promise<OrderReview> {
  const { data, error } = await supabase.rpc('reply_order_review', {
    p_review_id: reviewId,
    p_reply_text: replyText,
  });
  if (error) throw error;
  return data as OrderReview;
}

export async function getOrderReviews(orderId: string): Promise<OrderReviewsBundle> {
  const { data, error } = await supabase.rpc('get_order_reviews', {
    p_order_id: orderId,
  });
  if (error) throw error;
  return data as OrderReviewsBundle;
}

export async function getMyPendingReviewOrderIds(): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('get_my_pending_review_orders');
  if (error) throw error;
  const rows = (data as Array<{ order_id: string }> | null) ?? [];
  return new Set(rows.map((r) => r.order_id));
}

export async function getUserReviews(params: {
  userId: string;
  role?: 'ALL' | ReviewRole;
  limit?: number;
  offset?: number;
}): Promise<UserReviewsResult> {
  const { data, error } = await supabase.rpc('get_user_reviews', {
    p_user_id: params.userId,
    p_role: params.role ?? 'ALL',
    p_limit: params.limit ?? 20,
    p_offset: params.offset ?? 0,
  });
  if (error) throw error;
  return data as UserReviewsResult;
}
