import { supabase } from './supabase';
import type { Listing, Order, Profile, Transaction } from '@/types';

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
}

export type DisputeDecision = 'RELEASE_TO_SELLER' | 'REFUND_TO_BUYER';

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
