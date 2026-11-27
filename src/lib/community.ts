import { supabase } from './supabase';
import type { ListingReportReason, PublicSellerProfile, SavedListingItem } from '@/types';

export const REPORT_REASON_OPTIONS: readonly {
  id: ListingReportReason;
  label: string;
  hint: string;
}[] = [
  { id: 'scam_suspected', label: 'Nghi ngờ lừa đảo / ảnh giả', hint: 'Ảnh xác thực viết tay có dấu hiệu chỉnh sửa hoặc lấy từ nguồn khác.' },
  { id: 'counterfeit', label: 'Hàng giả / hàng nhái', hint: 'Sản phẩm không phải hàng chính hãng như mô tả.' },
  { id: 'off_platform', label: 'Dẫn dụ giao dịch ngoài sàn', hint: 'Đưa SĐT, Zalo hoặc đề nghị chuyển khoản trực tiếp không qua trung gian.' },
  { id: 'wrong_description', label: 'Mô tả sai tình trạng', hint: 'Thông số, hình ảnh hoặc tình trạng thực tế không khớp với bài đăng.' },
  { id: 'already_sold', label: 'Đã bán nhưng chưa gỡ', hint: 'Sản phẩm không còn hàng nhưng người bán vẫn để trạng thái mở bán.' },
  { id: 'spam', label: 'Tin trùng lặp / spam', hint: 'Đăng lặp nhiều lần hoặc không liên quan đến thiết bị âm thanh.' },
  { id: 'other', label: 'Lý do khác', hint: 'Ghi rõ vấn đề để quản trị viên kiểm tra.' },
];

export function getReportReasonLabel(id: ListingReportReason | string): string {
  return REPORT_REASON_OPTIONS.find((r) => r.id === id)?.label ?? id;
}

/** Tải hồ sơ công khai người bán (an toàn cho khách chưa đăng nhập). */
export async function getPublicSellerProfile(userId: string): Promise<PublicSellerProfile | null> {
  const { data, error } = await supabase.rpc('get_public_seller_profile', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return (data as PublicSellerProfile | null) ?? null;
}

/** Bật/tắt lưu tin yêu thích của người dùng hiện tại. */
export async function toggleSavedListing(
  listingId: string,
): Promise<{ saved: boolean; listing_id: string; saved_price?: number }> {
  const { data, error } = await supabase.rpc('toggle_saved_listing', { p_listing_id: listingId });
  if (error) throw new Error(error.message);
  return data as { saved: boolean; listing_id: string; saved_price?: number };
}

/** Lấy danh sách tin đã lưu kèm thông tin giảm giá. */
export async function getMySavedListings(): Promise<SavedListingItem[]> {
  const { data, error } = await supabase.rpc('get_my_saved_listings');
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedListingItem[];
}

/** Gửi báo cáo tin đăng vi phạm. */
export async function submitListingReport(
  listingId: string,
  reasonCategory: ListingReportReason,
  details?: string,
): Promise<{ id: string; listing_id: string; reason_category: string; created_at: string }> {
  const { data, error } = await supabase.rpc('submit_listing_report', {
    p_listing_id: listingId,
    p_reason_category: reasonCategory,
    p_details: details?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as { id: string; listing_id: string; reason_category: string; created_at: string };
}
