import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';
import { listMyConversations } from '@/lib/chat';
import { useAuth } from './AuthContext';
import { useNotifications } from './NotificationContext';
import type { ConversationSummary } from '@/types';

interface ChatContextValue {
  conversations: ConversationSummary[];
  unreadCount: number;
  loading: boolean;
  refreshInbox: () => Promise<void>;
  setActiveConversationId: (id: string | null) => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

interface ConversationRowPayload {
  id: string;
  last_message_at: string;
  last_message_preview: string;
  last_sender_id: string | null;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { pushToast } = useNotifications();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const activeConversationIdRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setActiveConversationId = useCallback((id: string | null) => {
    activeConversationIdRef.current = id;
  }, []);

  const refreshInbox = useCallback(async () => {
    if (!userId) {
      setConversations([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    try {
      const res = await listMyConversations({ limit: 50, offset: 0 });
      setConversations(res.items ?? []);
      setUnreadCount(res.total_unread ?? 0);
    } catch {
      // Giữ an toàn nếu CSDL chưa cập nhật migration 018
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void refreshInbox();
    }, 300);
  }, [refreshInbox]);

  useEffect(() => {
    void refreshInbox();
    if (!userId) return;

    const handleConvEvent = (payload: {
      new: Partial<ConversationRowPayload>;
      old: Partial<ConversationRowPayload>;
    }) => {
      const next = payload.new;
      const prev = payload.old;
      scheduleRefresh();

      if (
        next.id &&
        next.last_sender_id &&
        next.last_sender_id !== userId &&
        next.id !== activeConversationIdRef.current &&
        next.last_message_at !== prev?.last_message_at &&
        next.last_message_preview
      ) {
        pushToast(
          {
            title: 'Tin nhắn mới trên VAHA Market',
            body: next.last_message_preview,
            href: `/messages/${next.id}`,
            actionLabel: 'Mở hội thoại',
            kind: 'info',
          },
          `chat-msg-${next.id}-${next.last_message_at}`,
        );
      }
    };

    const channel = supabase
      .channel(`chat-inbox:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `buyer_id=eq.${userId}` },
        (p) => handleConvEvent(p as unknown as { new: Partial<ConversationRowPayload>; old: Partial<ConversationRowPayload> }),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `seller_id=eq.${userId}` },
        (p) => handleConvEvent(p as unknown as { new: Partial<ConversationRowPayload>; old: Partial<ConversationRowPayload> }),
      )
      .subscribe();

    const poll = setInterval(() => void refreshInbox(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshInbox();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      void supabase.removeChannel(channel);
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisible);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [userId, refreshInbox, scheduleRefresh, pushToast]);

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations,
      unreadCount,
      loading,
      refreshInbox,
      setActiveConversationId,
    }),
    [conversations, unreadCount, loading, refreshInbox, setActiveConversationId],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat phải được dùng bên trong <ChatProvider>.');
  return ctx;
}
