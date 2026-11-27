import { supabase } from '@/lib/supabase';
import type { NotificationKind, UserNotification } from '@/types';

export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  ORDER: 'Đơn hàng',
  LISTING: 'Tin đăng',
  PRICE_DROP: 'Giảm giá',
  REVIEW: 'Đánh giá',
  OFFER: 'Trả giá',
  SAVED_SEARCH: 'Theo dõi từ khóa',
  SYSTEM: 'Hệ thống',
};

export interface NotificationsListResult {
  unread_count: number;
  total: number;
  items: UserNotification[];
}

export function formatRelativeTime(iso: string): string {
  const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} giờ trước`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return new Date(iso).toLocaleDateString('vi-VN');
}

export async function listMyNotifications(opts?: {
  limit?: number;
  offset?: number;
  onlyUnread?: boolean;
}): Promise<NotificationsListResult> {
  const { data, error } = await supabase.rpc('list_my_notifications', {
    p_limit: opts?.limit ?? 30,
    p_offset: opts?.offset ?? 0,
    p_only_unread: opts?.onlyUnread ?? false,
  });
  if (error) throw new Error(error.message);
  return (data ?? { unread_count: 0, total: 0, items: [] }) as NotificationsListResult;
}

export async function markNotificationsRead(notificationId?: string | null): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', {
    p_notification_id: notificationId ?? null,
  });
  if (error) throw new Error(error.message);
  return typeof data === 'number' ? data : 0;
}
