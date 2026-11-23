import { supabase } from './supabase';
import type { BannedEntity, BannedEntityType, Listing, Order, Profile, Transaction } from '@/types';

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
