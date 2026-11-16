import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Order } from '@/types';

/**
 * Mọi thay đổi đơn hàng đi qua RPC (hàm SECURITY DEFINER trong schema.sql + migrations).
 * Client KHÔNG có quyền INSERT/UPDATE trực tiếp bảng `orders`.
 */
export interface CreateOrderInput {
  listingId: string;
  recipientName: string;
  phone: string;
  address: string;
  note?: string;
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const { data, error } = await supabase.rpc('create_order', {
    p_listing_id: input.listingId,
    p_recipient_name: input.recipientName,
    p_phone: input.phone,
    p_address: input.address,
    p_note: input.note ?? null,
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function cancelOrder(orderId: string): Promise<Order> {
  const { data, error } = await supabase.rpc('cancel_order', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data as Order;
}

export interface MarkShippedInput {
  carrier: string;
  trackingCode: string;
  packingVideoUrl: string;
}

export async function markShipped(orderId: string, input: MarkShippedInput): Promise<Order> {
  const { data, error } = await supabase.rpc('mark_shipped', {
    p_order_id: orderId,
    p_carrier: input.carrier,
    p_tracking_code: input.trackingCode,
    p_packing_video_url: input.packingVideoUrl,
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function confirmReceived(orderId: string): Promise<Order> {
  const { data, error } = await supabase.rpc('confirm_received', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data as Order;
}

export async function openDispute(orderId: string, reason: string, videoUrl: string): Promise<Order> {
  const { data, error } = await supabase.rpc('open_dispute', {
    p_order_id: orderId,
    p_reason: reason,
    p_video_url: videoUrl,
  });
  if (error) throw new Error(error.message);
  return data as Order;
}

/** Gọi khi đồng hồ về 0: DB tự kiểm tra hạn và trả về trạng thái hiện tại của đơn. */
export async function expireOrderIfDue(orderId: string): Promise<Order> {
  const { data, error } = await supabase.rpc('expire_order_if_due', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  return data as Order;
}

/** Link Facebook công khai của người bán (RLS chặn đọc trực tiếp `profile_contacts`). */
export async function getSellerFacebook(userId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_seller_facebook', { p_user_id: userId });
  if (error) return null;
  return typeof data === 'string' && data ? data : null;
}

/**
 * Realtime: nhận cập nhật ngay khi webhook đặt đơn sang PAID_HELD.
 * RLS vẫn áp dụng, nên người dùng chỉ nhận sự kiện của đơn mình mua/bán.
 * Nhớ gọi hàm trả về (unsubscribe) khi component unmount.
 */
export function subscribeToOrder(orderId: string, onChange: (changes: Partial<Order>) => void): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`order:${orderId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
      (payload) => onChange(payload.new as Partial<Order>),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
