import { supabase } from './supabase';
import type { Order, Transaction } from '@/types';

/** Các hàm RPC dành cho admin. Mỗi hàm tự kiểm tra is_admin() ở tầng DB. */

export interface AdminStats {
  gmv: number;                  // tổng giá trị giao dịch thành công
  fees: number;                 // tổng phí sàn 5% đã thu
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
