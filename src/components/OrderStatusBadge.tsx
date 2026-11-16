import { ORDER_STATUS_META } from '@/constants/orderStatus';
import type { OrderStatus } from '@/types';

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = ORDER_STATUS_META[status];
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}
