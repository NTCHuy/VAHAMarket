import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './AuthContext';

interface OrderAlertsValue {
  /** Đơn MUA cần bạn xử lý: chờ chuyển khoản (còn hạn) hoặc đã được gửi, chờ bạn xác nhận nhận hàng. */
  buy: number;
  /** Đơn BÁN cần bạn xử lý: khách đã thanh toán (PAID_HELD), chờ bạn gửi hàng. */
  sell: number;
  total: number;
  refresh: () => void;
}

const EMPTY: OrderAlertsValue = { buy: 0, sell: 0, total: 0, refresh: () => undefined };
const OrderAlertsContext = createContext<OrderAlertsValue>(EMPTY);

export function OrderAlertsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [counts, setCounts] = useState({ buy: 0, sell: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setCounts({ buy: 0, sell: 0 });
      return;
    }
    const nowIso = new Date().toISOString();
    const [b, s] = await Promise.all([
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('buyer_id', userId)
        .or(`status.eq.SHIPPED,and(status.eq.PENDING_PAYMENT,expires_at.gt.${nowIso})`),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('seller_id', userId).eq('status', 'PAID_HELD'),
    ]);
    setCounts({ buy: b.error ? 0 : (b.count ?? 0), sell: s.error ? 0 : (s.count ?? 0) });
  }, [userId]);

  // Gom nhiều sự kiện liên tiếp thành 1 lần tải
  const scheduleLoad = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void load(), 300);
  }, [load]);

  useEffect(() => {
    void load();
    if (!userId) return;

    // Realtime (RLS vẫn áp dụng: chỉ nhận sự kiện của đơn mình mua/bán) + dự phòng polling 60s
    const channel = supabase
      .channel(`order-alerts:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `buyer_id=eq.${userId}` }, scheduleLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${userId}` }, scheduleLoad)
      .subscribe();
    const poll = setInterval(() => void load(), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [userId, load, scheduleLoad]);

  const value = useMemo<OrderAlertsValue>(
    () => ({ ...counts, total: counts.buy + counts.sell, refresh: () => void load() }),
    [counts, load],
  );
  return <OrderAlertsContext.Provider value={value}>{children}</OrderAlertsContext.Provider>;
}

export const useOrderAlerts = (): OrderAlertsValue => useContext(OrderAlertsContext);
