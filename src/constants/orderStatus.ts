import type { OrderStatus } from '@/types';

export const ORDER_STATUS_META: Record<OrderStatus, { label: string; cls: string }> = {
  PENDING_PAYMENT: { label: 'Chờ thanh toán', cls: 'bg-amber-50 text-amber-700' },
  PAID_HELD: { label: 'Đã thanh toán – chờ gửi hàng', cls: 'bg-brand-50 text-brand-800' },
  SHIPPED: { label: 'Đang giao hàng', cls: 'bg-sky-50 text-sky-700' },
  COMPLETED: { label: 'Đã nhận hàng', cls: 'bg-emerald-50 text-emerald-700' },
  PAID_OUT: { label: 'Hoàn tất', cls: 'bg-emerald-50 text-emerald-700' },
  CANCELLED: { label: 'Đã hủy', cls: 'bg-slate-100 text-slate-600' },
  EXPIRED: { label: 'Hết hạn thanh toán', cls: 'bg-slate-100 text-slate-600' },
  DISPUTED: { label: 'Đang khiếu nại', cls: 'bg-red-50 text-red-700' },
  REFUNDED: { label: 'Đã hoàn tiền', cls: 'bg-slate-100 text-slate-600' },
};

export interface OrderFilter {
  id: string;
  label: string;
  statuses: OrderStatus[] | null; // null = tất cả
}

export const ORDER_FILTERS: readonly OrderFilter[] = [
  { id: 'all', label: 'Tất cả', statuses: null },
  { id: 'pending', label: 'Chờ thanh toán', statuses: ['PENDING_PAYMENT'] },
  { id: 'paid', label: 'Chờ gửi hàng', statuses: ['PAID_HELD'] },
  { id: 'shipping', label: 'Đang giao', statuses: ['SHIPPED'] },
  { id: 'done', label: 'Hoàn tất', statuses: ['COMPLETED', 'PAID_OUT'] },
  { id: 'dispute', label: 'Khiếu nại', statuses: ['DISPUTED', 'REFUNDED'] },
  { id: 'closed', label: 'Đã hủy / hết hạn', statuses: ['CANCELLED', 'EXPIRED'] },
] as const;

/** Danh sách đơn vị vận chuyển phổ biến (người bán có thể chọn "Khác"). */
export const CARRIERS: readonly string[] = ['GHTK', 'GHN', 'Viettel Post', 'J&T', 'SPX', 'Khác'] as const;
