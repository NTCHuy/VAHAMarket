import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type {
  ChatMessage,
  ConversationDetail,
  ConversationSummary,
  OfferStatus,
  PriceOffer,
} from '@/types';

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  PENDING: 'Đang chờ phản hồi',
  ACCEPTED: 'Đã chấp nhận',
  DECLINED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Đã hết hạn',
  ORDERED: 'Đã tạo đơn hàng',
};

export function calcMinOfferPrice(listingPrice: number): number {
  return Math.max(10_000, Math.ceil(listingPrice * 0.3));
}

export async function startOrGetConversation(
  listingId: string,
  buyerId?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('start_or_get_conversation', {
    p_listing_id: listingId,
    p_buyer_id: buyerId ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as { conversation_id: string }).conversation_id;
}

export async function listMyConversations(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ total_unread: number; items: ConversationSummary[] }> {
  const { data, error } = await supabase.rpc('list_my_conversations', {
    p_limit: opts?.limit ?? 40,
    p_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  return (data ?? { total_unread: 0, items: [] }) as {
    total_unread: number;
    items: ConversationSummary[];
  };
}

export async function getConversationDetail(
  conversationId: string,
  opts?: { limit?: number; before?: string },
): Promise<ConversationDetail> {
  const { data, error } = await supabase.rpc('get_conversation_detail', {
    p_conversation_id: conversationId,
    p_limit: opts?.limit ?? 60,
    p_before: opts?.before ?? null,
  });
  if (error) throw new Error(error.message);
  return data as ConversationDetail;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw new Error(error.message);
}

export async function sendChatMessage(conversationId: string, body: string): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc('send_chat_message', {
    p_conversation_id: conversationId,
    p_body: body,
  });
  if (error) throw new Error(error.message);
  return data as ChatMessage;
}

export async function createPriceOffer(
  conversationId: string,
  offeredPrice: number,
  note?: string,
): Promise<{ offer: PriceOffer; message: ChatMessage }> {
  const { data, error } = await supabase.rpc('create_price_offer', {
    p_conversation_id: conversationId,
    p_offered_price: offeredPrice,
    p_note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return data as { offer: PriceOffer; message: ChatMessage };
}

export async function respondPriceOffer(
  offerId: string,
  action: 'ACCEPT' | 'DECLINE' | 'CANCEL',
): Promise<{ offer: PriceOffer; message: ChatMessage }> {
  const { data, error } = await supabase.rpc('respond_price_offer', {
    p_offer_id: offerId,
    p_action: action,
  });
  if (error) throw new Error(error.message);
  return data as { offer: PriceOffer; message: ChatMessage };
}

export async function toggleBlockConversation(
  conversationId: string,
  blocked: boolean,
): Promise<{ conversation: ConversationDetail['conversation']; message: ChatMessage }> {
  const { data, error } = await supabase.rpc('toggle_block_conversation', {
    p_conversation_id: conversationId,
    p_blocked: blocked,
  });
  if (error) throw new Error(error.message);
  return data as { conversation: ConversationDetail['conversation']; message: ChatMessage };
}

export async function reportConversation(conversationId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('report_conversation', {
    p_conversation_id: conversationId,
    p_reason: reason.trim(),
  });
  if (error) throw new Error(error.message);
}

export async function getListingAcceptedOffer(listingId: string): Promise<PriceOffer | null> {
  const { data, error } = await supabase.rpc('get_listing_accepted_offer', {
    p_listing_id: listingId,
  });
  if (error) return null;
  return (data as PriceOffer | null) ?? null;
}

export function subscribeToConversationMessages(
  conversationId: string,
  onInsert: (msg: ChatMessage) => void,
): () => void {
  const channel: RealtimeChannel = supabase
    .channel(`chat-room:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(payload.new as ChatMessage),
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
