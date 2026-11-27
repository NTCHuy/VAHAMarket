import { supabase } from './supabase';
import type {
  AdminAuditCategory,
  AdminAuditLogEntry,
  AdminListingReport,
  AdminMemberDetail,
  AdminMemberFilter,
  AdminMemberNote,
  AdminMemberSummary,
  AdminReviewFilter,
  AdminReviewsListResult,
  BannedEntity,
  BannedEntityType,
  Listing,
  ListingReportStatus,
  Order,
  OrderReview,
  Profile,
  Transaction,
} from '@/types';

/** Các hàm RPC dành cho admin. Mỗi hàm tự kiểm tra is_admin() ở tầng DB. */

export interface AdminStats {
  gmv: number;                  // tổng giá trị hàng hóa giao dịch thành công (giá niêm yết)
  fees: number;                 // tổng phí sàn đã thu
  held_count: number;           // số đơn đang giữ tiền (PAID_HELD + SHIPPED)
  held_amount: number;
  dispute_count: number;        // số đơn đang khiếu nại
  payout_pending_count: number; // số đơn chờ giải ngân
  payout_pending_amount: number;
  flagged_tx_count: number;     // số giao dịch lệch chưa xử lý
  pending_review_count: number; // số tin đăng chờ duyệt
  banned_count: number;         // số tài khoản đang bị khóa vĩnh viễn
  refund_pending_count: number; // số đơn chờ Admin chuyển khoản hoàn tiền
  refund_pending_amount: number;
  overdue_shipped_count: number; // số đơn SHIPPED quá 14 ngày cần rà soát vận đơn
  total_members?: number;
  active_listings_count?: number;
  open_reports_count?: number;
  total_reviews_count?: number;
  hidden_reviews_count?: number;
}

export type DisputeDecision = 'RELEASE_TO_SELLER' | 'REFUND_TO_BUYER';

export interface IssueWarningResult {
  profile: Profile;
  warning_count: number;
  auto_banned: boolean;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_stats');
  if (error) throw new Error(error.message);
  return data as AdminStats;
}

export async function markPaidOut(orderId: string, reference?: string): Promise<Order> {
  const { data, error } = await supabase.rpc('admin_mark_paid_out', {
    p_order_id: orderId,
    p_reference: reference?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

/** Admin cưỡng chế hủy đơn (PAID_HELD hoặc SHIPPED) để đưa vào hàng đợi hoàn tiền. */
export async function forceRefundOrder(orderId: string, reason: string): Promise<Order> {
  const { data, error } = await supabase.rpc('admin_force_refund_order', {
    p_order_id: orderId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

/** Admin xác nhận đã chuyển khoản hoàn tiền cho người mua. */
export async function markRefunded(orderId: string, reference?: string): Promise<Order> {
  const { data, error } = await supabase.rpc('admin_mark_refunded', {
    p_order_id: orderId,
    p_reference: reference?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

/** Admin xác nhận đã giao thành công & mở khóa giải ngân cho đơn SHIPPED quá 14 ngày. */
export async function forceCompleteShipped(orderId: string, note: string): Promise<Order> {
  const { data, error } = await supabase.rpc('admin_force_complete_shipped', {
    p_order_id: orderId,
    p_note: note.trim(),
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function resolveDispute(orderId: string, decision: DisputeDecision, note: string): Promise<Order> {
  const { data, error } = await supabase.rpc('admin_resolve_dispute', {
    p_order_id: orderId,
    p_decision: decision,
    p_admin_note: note,
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function manualConfirmPayment(orderId: string, note: string): Promise<Order> {
  const { data, error } = await supabase.rpc('admin_manual_confirm_payment', { p_order_id: orderId, p_note: note });
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function markTransactionResolved(txId: string, note: string): Promise<Transaction> {
  const { data, error } = await supabase.rpc('admin_mark_transaction_resolved', { p_tx_id: txId, p_note: note });
  if (error) throw new Error(error.message);
  return data as Transaction;
}

/** Gắn/gỡ huy hiệu Mod (phí trung gian 0%) cho thành viên. */
export async function setMod(userId: string, isMod: boolean): Promise<Profile> {
  const { data, error } = await supabase.rpc('admin_set_mod', { p_user_id: userId, p_is_mod: isMod });
  if (error) throw new Error(error.message);
  return data as Profile;
}

/** Chỉnh giá bán / giá gốc (null = bỏ giảm giá) của tin đăng. */
export async function updateListingPrice(listingId: string, price: number, originalPrice: number | null): Promise<Listing> {
  const { data, error } = await supabase.rpc('admin_update_listing_price', {
    p_listing_id: listingId,
    p_price: price,
    p_original_price: originalPrice,
  });
  if (error) throw new Error(error.message);
  return data as Listing;
}

/** Đổi phí sàn toàn hệ thống (0–0.05). Ví dụ 0.025 = 2.5%. */
export async function setGlobalFeeRate(rate: number): Promise<{ global_fee_rate: number }> {
  const { data, error } = await supabase.rpc('admin_set_global_fee_rate', { p_rate: rate });
  if (error) throw new Error(error.message);
  return data as { global_fee_rate: number };
}

/** Đổi trần phí tối đa mỗi đơn (VND; 0 = tắt trần). */
export async function setFeeCapVnd(capVnd: number): Promise<{ fee_cap_vnd: number }> {
  const { data, error } = await supabase.rpc('admin_set_fee_cap', { p_fee_cap_vnd: Math.floor(capVnd) });
  if (error) throw new Error(error.message);
  return data as { fee_cap_vnd: number };
}

/** Duyệt (APPROVE) hoặc từ chối (REJECT, bắt buộc có lý do) một tin đang chờ duyệt. */
export async function reviewListing(listingId: string, decision: 'APPROVE' | 'REJECT', reason?: string): Promise<Listing> {
  const { data, error } = await supabase.rpc('admin_review_listing', {
    p_listing_id: listingId,
    p_decision: decision,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as Listing;
}

/** Gửi 1 cảnh báo (+1 gậy) cho thành viên; tự động Ban toàn diện khi đạt >= 3 cảnh báo. */
export async function issueWarning(
  userId: string,
  reason: string,
  opts?: { listingId?: string | null; orderId?: string | null },
): Promise<IssueWarningResult> {
  const { data, error } = await supabase.rpc('admin_issue_warning', {
    p_user_id: userId,
    p_reason: reason.trim(),
    p_listing_id: opts?.listingId ?? null,
    p_order_id: opts?.orderId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as IssueWarningResult;
}

/** Khóa tài khoản vĩnh viễn và đưa toàn bộ dấu vết vào danh sách đen. */
export async function banUser(userId: string, reason: string): Promise<Profile> {
  const { data, error } = await supabase.rpc('admin_ban_user', {
    p_user_id: userId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
  return data as Profile;
}

/** Gỡ khóa tài khoản, reset cảnh báo về 0 và xóa dấu vết gắn với user khỏi danh sách đen. */
export async function unbanUser(userId: string): Promise<Profile> {
  const { data, error } = await supabase.rpc('admin_unban_user', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return data as Profile;
}

/** Thêm trực tiếp 1 định danh (email, Facebook, STK ngân hàng, SĐT, fingerprint) vào danh sách đen. */
export async function addBannedEntity(
  entityType: BannedEntityType,
  entityValue: string,
  reason: string,
): Promise<BannedEntity> {
  const { data, error } = await supabase.rpc('admin_add_banned_entity', {
    p_entity_type: entityType,
    p_entity_value: entityValue.trim(),
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
  return data as BannedEntity;
}

/** Xóa 1 bản ghi khỏi danh sách đen. */
export async function removeBannedEntity(entityId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_banned_entity', { p_entity_id: entityId });
  if (error) throw new Error(error.message);
}

/** Lấy toàn bộ danh sách đen (chỉ Admin, qua RPC SECURITY DEFINER). */
export async function listBannedEntities(): Promise<BannedEntity[]> {
  const { data, error } = await supabase.rpc('admin_list_banned_entities');
  if (error) throw new Error(error.message);
  return (data ?? []) as BannedEntity[];
}

export interface SearchMembersResult {
  total: number;
  items: AdminMemberSummary[];
}

/** Tìm kiếm & lọc danh sách thành viên (chỉ Admin). */
export async function searchMembers(opts?: {
  query?: string;
  filter?: AdminMemberFilter;
  limit?: number;
  offset?: number;
}): Promise<SearchMembersResult> {
  const { data, error } = await supabase.rpc('admin_search_members', {
    p_query: opts?.query?.trim() || null,
    p_filter: opts?.filter ?? 'all',
    p_limit: opts?.limit ?? 30,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? { total: 0, items: [] }) as SearchMembersResult;
}

/** Lấy toàn bộ hồ sơ chi tiết thành viên để kiểm duyệt (chỉ Admin). */
export async function getMemberDetail(userId: string): Promise<AdminMemberDetail> {
  const { data, error } = await supabase.rpc('admin_get_member_detail', { p_user_id: userId });
  if (error) throw new Error(error.message);
  return data as AdminMemberDetail;
}

export interface ModerateListingResult {
  listing?: Listing;
  deleted_id?: string;
  seller_id?: string;
  warning: IssueWarningResult | null;
}

/** Gỡ tin đăng sang trạng thái `removed` kèm lý do và tùy chọn cảnh báo người bán. */
export async function removeListing(
  listingId: string,
  reason: string,
  issueWarning = false,
): Promise<ModerateListingResult> {
  const { data, error } = await supabase.rpc('admin_remove_listing', {
    p_listing_id: listingId,
    p_reason: reason.trim(),
    p_issue_warning: issueWarning,
  });
  if (error) throw new Error(error.message);
  return data as ModerateListingResult;
}

/** Xóa vĩnh viễn tin đăng (kể cả tin đã duyệt) kèm lưu vết Audit Log. */
export async function deleteListing(
  listingId: string,
  reason: string,
  issueWarning = false,
): Promise<ModerateListingResult> {
  const { data, error } = await supabase.rpc('admin_delete_listing', {
    p_listing_id: listingId,
    p_reason: reason.trim(),
    p_issue_warning: issueWarning,
  });
  if (error) throw new Error(error.message);
  return data as ModerateListingResult;
}

/** Khôi phục tin đã bị gỡ về trạng thái Ẩn để người bán kiểm tra lại. */
export async function restoreListing(listingId: string, note?: string): Promise<Listing> {
  const { data, error } = await supabase.rpc('admin_restore_listing', {
    p_listing_id: listingId,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as Listing;
}

/** Thêm ghi chú nội bộ cho hồ sơ thành viên. */
export async function addMemberNote(userId: string, note: string): Promise<AdminMemberNote> {
  const { data, error } = await supabase.rpc('admin_add_member_note', {
    p_user_id: userId,
    p_note: note.trim(),
  });
  if (error) throw new Error(error.message);
  return data as AdminMemberNote;
}

/** Xóa ghi chú nội bộ thành viên. */
export async function deleteMemberNote(noteId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_member_note', { p_note_id: noteId });
  if (error) throw new Error(error.message);
}

/** Admin hỗ trợ cập nhật SĐT và link Facebook đã bị khóa định danh cho thành viên. */
export async function updateMemberIdentity(
  userId: string,
  payload: { facebookUrl: string | null; phone: string | null; reason: string },
): Promise<{ facebook_url: string | null; phone: string | null }> {
  const { data, error } = await supabase.rpc('admin_update_member_identity', {
    p_user_id: userId,
    p_facebook_url: payload.facebookUrl?.trim() || null,
    p_phone: payload.phone?.trim() || null,
    p_reason: payload.reason.trim(),
  });
  if (error) throw new Error(error.message);
  return data as { facebook_url: string | null; phone: string | null };
}

export interface AuditLogListResult {
  total: number;
  items: AdminAuditLogEntry[];
}

/** Lấy danh sách nhật ký quản trị toàn hệ thống (chỉ Admin). */
export async function listAuditLogs(opts?: {
  action?: AdminAuditCategory;
  query?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogListResult> {
  const { data, error } = await supabase.rpc('admin_list_audit_logs', {
    p_action: opts?.action ?? 'all',
    p_query: opts?.query?.trim() || null,
    p_limit: opts?.limit ?? 50,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? { total: 0, items: [] }) as AuditLogListResult;
}

export interface ListingReportListResult {
  total: number;
  items: AdminListingReport[];
}

/** Lấy danh sách báo cáo tin đăng vi phạm (chỉ Admin). */
export async function listListingReports(opts?: {
  status?: ListingReportStatus | 'all';
  limit?: number;
  offset?: number;
}): Promise<ListingReportListResult> {
  const { data, error } = await supabase.rpc('admin_list_listing_reports', {
    p_status: opts?.status ?? 'open',
    p_limit: opts?.limit ?? 30,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? { total: 0, items: [] }) as ListingReportListResult;
}

/** Đánh dấu báo cáo tin đã xử lý hoặc bỏ qua (chỉ Admin). */
export async function resolveListingReport(
  reportId: string,
  status: 'resolved' | 'dismissed',
  opts?: { note?: string; resolveAllForListing?: boolean },
): Promise<{ updated_count: number; listing_id: string; status: string }> {
  const { data, error } = await supabase.rpc('admin_resolve_listing_report', {
    p_report_id: reportId,
    p_status: status,
    p_note: opts?.note?.trim() || null,
    p_resolve_all_for_listing: opts?.resolveAllForListing ?? false,
  });
  if (error) throw new Error(error.message);
  return data as { updated_count: number; listing_id: string; status: string };
}

/** Lấy danh sách đánh giá sau giao dịch để kiểm duyệt (chỉ Admin). */
export async function listAdminReviews(opts?: {
  filter?: AdminReviewFilter;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<AdminReviewsListResult> {
  const { data, error } = await supabase.rpc('admin_list_reviews', {
    p_filter: opts?.filter ?? 'ALL',
    p_search: opts?.search?.trim() || '',
    p_limit: opts?.limit ?? 30,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? {
    total: 0,
    items: [],
    counts: { all: 0, visible: 0, hidden: 0, low_rating: 0 },
  }) as AdminReviewsListResult;
}

/** Ẩn hoặc hiện lại một đánh giá sau giao dịch kèm lý do lưu nhật ký (chỉ Admin). */
export async function toggleReviewVisibility(
  reviewId: string,
  hidden: boolean,
  reason?: string,
): Promise<OrderReview> {
  const { data, error } = await supabase.rpc('admin_set_review_visibility', {
    p_review_id: reviewId,
    p_hidden: hidden,
    p_reason: reason?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as OrderReview;
}
