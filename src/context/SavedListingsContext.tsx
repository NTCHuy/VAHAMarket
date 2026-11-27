import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { toggleSavedListing } from '@/lib/community';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';

interface SavedEntry {
  savedPrice: number;
  latestPrice: number;
}

interface SavedListingsContextValue {
  savedIds: Set<string>;
  savedCount: number;
  priceDropCount: number;
  isSaved: (listingId: string) => boolean;
  toggleSave: (listingId: string) => Promise<boolean>;
  refreshSaved: () => Promise<void>;
}

const SavedListingsContext = createContext<SavedListingsContextValue | undefined>(undefined);

interface SavedRow {
  listing_id: string;
  saved_price: number;
  latest_price: number;
}

export function SavedListingsProvider({ children }: { children: ReactNode }) {
  const { user, signIn } = useAuth();
  const userId = user?.id ?? null;
  const { pushToast } = useNotifications();
  const [entries, setEntries] = useState<Map<string, SavedEntry>>(new Map());

  const refreshSaved = useCallback(async () => {
    if (!userId) {
      setEntries(new Map());
      return;
    }
    const { data, error } = await supabase
      .from('saved_listings')
      .select('listing_id, saved_price, latest_price')
      .eq('user_id', userId);
    if (error || !data) return;
    const next = new Map<string, SavedEntry>();
    for (const row of data as SavedRow[]) {
      next.set(row.listing_id, { savedPrice: row.saved_price, latestPrice: row.latest_price });
    }
    setEntries(next);
  }, [userId]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  // Lắng nghe thông báo giảm giá Realtime cho các tin người dùng đã lưu
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`saved-listings:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'saved_listings', filter: `user_id=eq.${userId}` },
        (payload) => {
          const next = payload.new as Partial<SavedRow>;
          const prev = payload.old as Partial<SavedRow>;
          if (!next.listing_id || typeof next.latest_price !== 'number') return;
          const nextLatest = next.latest_price;
          setEntries((cur) => {
            const copy = new Map(cur);
            const existing = copy.get(next.listing_id!);
            const savedPrice = typeof next.saved_price === 'number' ? next.saved_price : existing?.savedPrice ?? nextLatest;
            copy.set(next.listing_id!, { savedPrice, latestPrice: nextLatest });
            return copy;
          });
          if (typeof prev.latest_price === 'number' && nextLatest < prev.latest_price) {
            pushToast(
              {
                title: 'Tin bạn đã lưu vừa giảm giá',
                body: `Giá mới còn ${formatVND(nextLatest)}. Mở tin ngay để kiểm tra.`,
                href: `/listing/${next.listing_id}`,
                actionLabel: 'Xem tin',
                kind: 'success',
              },
              `saved-drop-${next.listing_id}-${nextLatest}`,
            );
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, pushToast]);

  const savedIds = useMemo(() => new Set(entries.keys()), [entries]);

  const priceDropCount = useMemo(() => {
    let count = 0;
    entries.forEach((v) => {
      if (v.latestPrice < v.savedPrice) count += 1;
    });
    return count;
  }, [entries]);

  const isSaved = useCallback((listingId: string) => entries.has(listingId), [entries]);

  const toggleSave = useCallback(
    async (listingId: string): Promise<boolean> => {
      if (!userId) {
        void signIn();
        return false;
      }

      const wasSaved = entries.has(listingId);
      const prevSnapshot = entries.get(listingId);

      // Optimistic update
      setEntries((cur) => {
        const copy = new Map(cur);
        if (wasSaved) copy.delete(listingId);
        else copy.set(listingId, { savedPrice: 1, latestPrice: 1 });
        return copy;
      });

      try {
        const res = await toggleSavedListing(listingId);
        if (res.saved) {
          setEntries((cur) => {
            const copy = new Map(cur);
            const price = res.saved_price ?? 1;
            copy.set(listingId, { savedPrice: price, latestPrice: price });
            return copy;
          });
          pushToast(
            {
              title: 'Đã lưu tin yêu thích',
              body: 'Bạn sẽ nhận thông báo khi sản phẩm này giảm giá.',
              href: '/saved',
              actionLabel: 'Xem tin đã lưu',
              kind: 'info',
            },
            `saved-add-${listingId}`,
          );
        } else {
          setEntries((cur) => {
            const copy = new Map(cur);
            copy.delete(listingId);
            return copy;
          });
        }
        return res.saved;
      } catch (err) {
        // Rollback optimistic update
        setEntries((cur) => {
          const copy = new Map(cur);
          if (wasSaved && prevSnapshot) copy.set(listingId, prevSnapshot);
          else copy.delete(listingId);
          return copy;
        });
        pushToast(
          {
            title: 'Không thể lưu tin',
            body: getErrorMessage(err),
            kind: 'warning',
          },
          `saved-err-${listingId}`,
        );
        return wasSaved;
      }
    },
    [userId, entries, signIn, pushToast],
  );

  const value = useMemo<SavedListingsContextValue>(
    () => ({
      savedIds,
      savedCount: entries.size,
      priceDropCount,
      isSaved,
      toggleSave,
      refreshSaved,
    }),
    [savedIds, entries.size, priceDropCount, isSaved, toggleSave, refreshSaved],
  );

  return <SavedListingsContext.Provider value={value}>{children}</SavedListingsContext.Provider>;
}

export function useSavedListings(): SavedListingsContextValue {
  const ctx = useContext(SavedListingsContext);
  if (!ctx) throw new Error('useSavedListings phải được dùng bên trong <SavedListingsProvider>.');
  return ctx;
}
