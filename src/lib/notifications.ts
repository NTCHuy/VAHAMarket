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
