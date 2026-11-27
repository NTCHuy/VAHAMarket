import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  ExternalLink,
  Flag,
  Loader2,
  MessageSquare,
  Search,
  Send,
  ShieldCheck,
  Tag,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useChat } from '@/context/ChatContext';
import { cldUrl } from '@/lib/cloudinary';
import {
  OFFER_STATUS_LABEL,
  calcMinOfferPrice,
  createPriceOffer,
  getConversationDetail,
  markConversationRead,
  reportConversation,
  respondPriceOffer,
  sendChatMessage,
  subscribeToConversationMessages,
  toggleBlockConversation,
} from '@/lib/chat';
import { findViolation } from '@/lib/moderation';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { isUuid } from '@/lib/url';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import BuyDialog from '@/components/BuyDialog';
import ModBadge from '@/components/ModBadge';
import { RatingSummaryBadge } from '@/components/StarRating';
import { Alert, Avatar, PageLoader } from '@/components/ui';
import type { ChatMessage, ConversationDetail, PriceOffer } from '@/types';

type InboxFilter = 'all' | 'unread' | 'offer';

const LISTING_STATUS_TEXT: Record<string, string> = {
  active: 'Đang mở bán',
  reserved: 'Đang giữ chỗ giao dịch',
  sold: 'Đã bán',
  removed: 'Đã gỡ',
  hidden: 'Đang ẩn',
  pending_review: 'Chờ duyệt',
  rejected: 'Bị từ chối',
  draft: 'Nháp',
};

function formatTimeRemaining(expiresAt: string): string {
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return 'Đã hết hạn';
  const totalMins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hours > 0) return `Còn ${hours}g ${mins}p`;
  return `Còn ${Math.max(1, mins)} phút`;
}

export default function Messages() {
  useDocumentTitle('Hộp thư & Trả giá');
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    conversations,
    loading: inboxLoading,
    refreshInbox,
    setActiveConversationId,
  } = useChat();

  const activeId = conversationId && isUuid(conversationId) ? conversationId : null;

  const [inboxFilter, setInboxFilter] = useState<InboxFilter>('all');
  const [search, setSearch] = useState('');

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [msgText, setMsgText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [offerOpen, setOfferOpen] = useState(false);
  const [offerPriceText, setOfferPriceText] = useState('');
  const [offerNote, setOfferNote] = useState('');
  const [sendingOffer, setSendingOffer] = useState(false);
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [blockingBusy, setBlockingBusy] = useState(false);

  const [buyDialogOffer, setBuyDialogOffer] = useState<PriceOffer | null>(null);
  const [buyDialogOpen, setBuyDialogOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const shouldScrollBottomRef = useRef(true);

  useEffect(() => {
    setActiveConversationId(activeId);
    return () => setActiveConversationId(null);
  }, [activeId, setActiveConversationId]);

  const loadDetail = useCallback(async (id: string, silent = false) => {
    if (!silent) {
      setDetailLoading(true);
      setDetailError(null);
    }
    try {
      const res = await getConversationDetail(id, { limit: 60 });
      shouldScrollBottomRef.current = true;
      setDetail(res);
      await markConversationRead(id);
      void refreshInbox();
    } catch (err) {
      if (!silent) setDetailError(getErrorMessage(err));
    } finally {
      if (!silent) setDetailLoading(false);
    }
  }, [refreshInbox]);

  useEffect(() => {
    setActionError(null);
    setActionNotice(null);
    setReportOpen(false);
    setOfferOpen(false);
    if (!activeId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    void loadDetail(activeId);
  }, [activeId, loadDetail]);

  // Mở sẵn form trả giá nếu điều hướng từ nút "Trả giá" (?offer=1)
  useEffect(() => {
    if (!detail || searchParams.get('offer') !== '1') return;
    if (detail.listing.status === 'active' && detail.listing.ship_cod && !detail.conversation.is_blocked) {
      const suggested = Math.max(
        calcMinOfferPrice(detail.listing.price),
        Math.round((detail.listing.price * 0.9) / 10_000) * 10_000,
      );
      setOfferPriceText(String(Math.min(suggested, detail.listing.price - 10_000)));
      setOfferOpen(true);
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('offer');
        return next;
      },
      { replace: true },
    );
  }, [detail, searchParams, setSearchParams]);

  // Realtime tin nhắn trong phòng đang mở
  useEffect(() => {
    if (!activeId || !user) return;
    const unsubscribe = subscribeToConversationMessages(activeId, (incoming) => {
      shouldScrollBottomRef.current = true;
      setDetail((prev) => {
        if (!prev || prev.conversation.id !== activeId) return prev;
        if (prev.messages.some((m) => m.id === incoming.id)) return prev;
        return { ...prev, messages: [...prev.messages, incoming] };
      });
      if (incoming.message_type === 'OFFER' || incoming.message_type === 'SYSTEM') {
        void loadDetail(activeId, true);
      } else {
        void markConversationRead(activeId);
        void refreshInbox();
      }
    });
    return unsubscribe;
  }, [activeId, user, loadDetail, refreshInbox]);

  useEffect(() => {
    if (shouldScrollBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      shouldScrollBottomRef.current = false;
    }
  }, [detail?.messages.length]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (inboxFilter === 'unread' && c.my_unread_count <= 0) return false;
      if (inboxFilter === 'offer' && !c.active_offer) return false;
      if (!q) return true;
      return (
        c.counterpart.display_name.toLowerCase().includes(q) ||
        c.listing.title.toLowerCase().includes(q)
      );
    });
  }, [conversations, inboxFilter, search]);

  const offerMap = useMemo(() => {
    const map = new Map<string, PriceOffer>();
    (detail?.offers ?? []).forEach((o) => map.set(o.id, o));
    return map;
  }, [detail?.offers]);

  const handleLoadOlder = async () => {
    if (!activeId || !detail || detail.messages.length === 0 || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = detail.messages[0].created_at;
      const older = await getConversationDetail(activeId, { limit: 60, before: oldest });
      setDetail((prev) => {
        if (!prev) return older;
        const existingIds = new Set(prev.messages.map((m) => m.id));
        const merged = [...older.messages.filter((m) => !existingIds.has(m.id)), ...prev.messages];
        return { ...prev, messages: merged, has_more: older.has_more };
      });
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSendMessage = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!activeId || sendingMsg) return;
    const body = msgText.trim();
    if (!body) return;

    const violation = findViolation(body);
    if (violation) {
      setActionError(`Tin nhắn không được chứa ${violation} hoặc thông tin dẫn dụ ngoài sàn.`);
      return;
    }

    setSendingMsg(true);
    setActionError(null);
    try {
      const created = await sendChatMessage(activeId, body);
      setMsgText('');
      shouldScrollBottomRef.current = true;
      setDetail((prev) => {
        if (!prev || prev.messages.some((m) => m.id === created.id)) return prev;
        return { ...prev, messages: [...prev.messages, created] };
      });
      void refreshInbox();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSendingMsg(false);
    }
  };

  const handleMessageKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSendMessage();
    }
  };

  const handleCreateOffer = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeId || !detail || sendingOffer) return;
    const numeric = Number(offerPriceText.replace(/[^0-9]/g, ''));
    const minPrice = calcMinOfferPrice(detail.listing.price);

    if (!Number.isFinite(numeric) || numeric < minPrice || numeric >= detail.listing.price) {
      setActionError(
        `Giá đề nghị phải từ ${formatVND(minPrice)} đến thấp hơn ${formatVND(detail.listing.price)}.`,
      );
      return;
    }
    const note = offerNote.trim();
    if (note) {
      const violation = findViolation(note);
      if (violation) {
        setActionError(`Ghi chú không được chứa ${violation}.`);
        return;
      }
    }

    setSendingOffer(true);
    setActionError(null);
    setActionNotice(null);
    try {
      await createPriceOffer(activeId, numeric, note || undefined);
      setOfferOpen(false);
      setOfferPriceText('');
      setOfferNote('');
      setActionNotice('Đã gửi đề nghị giá.');
      await loadDetail(activeId, true);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSendingOffer(false);
    }
  };

  const handleRespondOffer = async (
    offerId: string,
    action: 'ACCEPT' | 'DECLINE' | 'CANCEL',
  ) => {
    if (!activeId || respondingOfferId) return;
    setRespondingOfferId(offerId);
    setActionError(null);
    setActionNotice(null);
    try {
      await respondPriceOffer(offerId, action);
      await loadDetail(activeId, true);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setRespondingOfferId(null);
    }
  };

  const handleToggleBlock = async () => {
    if (!activeId || !detail || blockingBusy) return;
    setBlockingBusy(true);
    setActionError(null);
    try {
      await toggleBlockConversation(activeId, !detail.conversation.is_blocked);
      await loadDetail(activeId, true);
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBlockingBusy(false);
    }
  };

  const handleSubmitReport = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeId || sendingReport) return;
    const trimmed = reportReason.trim();
    if (trimmed.length < 5) {
      setActionError('Lý do báo cáo cần tối thiểu 5 ký tự.');
      return;
    }
    setSendingReport(true);
    setActionError(null);
    try {
      await reportConversation(activeId, trimmed);
      setReportOpen(false);
      setReportReason('');
      setActionNotice('Đã gửi báo cáo hội thoại tới quản trị viên.');
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setSendingReport(false);
    }
  };

  const isBuyer = Boolean(detail && user && detail.conversation.buyer_id === user.id);
  const canNegotiate = Boolean(
    detail &&
      detail.listing.status === 'active' &&
      detail.listing.ship_cod &&
      !detail.conversation.is_blocked &&
      !detail.counterpart.is_banned,
  );
  const minOfferPrice = detail ? calcMinOfferPrice(detail.listing.price) : 10_000;
  const activeOffer = detail?.active_offer ?? null;
  const isBlockedByMe = Boolean(detail && user && detail.conversation.blocked_by === user.id);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid min-h-[72vh] overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 lg:grid-cols-[320px_1fr]">
        {/* CỘT TRÁI: Danh sách hội thoại */}
        <aside
          className={`flex flex-col border-neutral-200 dark:border-neutral-800 lg:border-r ${
            activeId ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="space-y-3 border-b border-neutral-200 p-3.5 dark:border-neutral-800">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
                Hộp thư
              </h1>
              <span className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                {conversations.length} hội thoại
              </span>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tìm theo tên hoặc sản phẩm..."
                className="input h-8 pl-8 text-xs"
              />
            </div>

            <div className="flex gap-1.5">
              {(
                [
                  ['all', 'Tất cả'],
                  ['unread', 'Chưa đọc'],
                  ['offer', 'Đang trả giá'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setInboxFilter(key)}
                  className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    inboxFilter === key
                      ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
            {inboxLoading && conversations.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-500">Đang tải hộp thư...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <MessageSquare className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {conversations.length === 0
                    ? 'Chưa có cuộc trò chuyện nào. Hãy mở một tin đăng và bấm "Nhắn người bán".'
                    : 'Không có hội thoại phù hợp bộ lọc.'}
                </p>
              </div>
            ) : (
              filteredConversations.map((c) => {
                const selected = c.id === activeId;
                return (
                  <Link
                    key={c.id}
                    to={`/messages/${c.id}`}
                    className={`flex gap-3 p-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60 ${
                      selected ? 'bg-blue-50/70 dark:bg-blue-950/30' : ''
                    }`}
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800">
                      {c.listing.image ? (
                        <img
                          src={cldUrl(c.listing.image, { width: 120, height: 120, crop: 'fill' })}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <MessageSquare className="m-auto h-5 w-5 text-neutral-400" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {c.counterpart.display_name}
                          </span>
                          {c.counterpart.is_mod && <ModBadge />}
                        </div>
                        <span className="shrink-0 text-[10px] tabular-nums text-neutral-400">
                          {new Date(c.last_message_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>

                      <p className="truncate text-xs font-medium text-neutral-600 dark:text-neutral-300">
                        {c.listing.title} · {formatVND(c.listing.price)}
                      </p>

                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p
                          className={`truncate text-xs ${
                            c.my_unread_count > 0
                              ? 'font-semibold text-neutral-900 dark:text-neutral-100'
                              : 'text-neutral-500 dark:text-neutral-400'
                          }`}
                        >
                          {c.last_message_preview}
                        </p>
                        {c.my_unread_count > 0 && (
                          <span className="inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-semibold text-white">
                            {c.my_unread_count}
                          </span>
                        )}
                      </div>

                      {c.active_offer && (
                        <span
                          className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            c.active_offer.status === 'ACCEPTED'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          <Tag size={10} />
                          {c.active_offer.status === 'ACCEPTED'
                            ? `Đã chốt ${formatVND(c.active_offer.offered_price)}`
                            : `Đề nghị ${formatVND(c.active_offer.offered_price)}`}
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        {/* CỘT PHẢI: Khung chat & trả giá */}
        <section
          className={`flex min-w-0 flex-col ${
            activeId ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {!activeId ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <MessageSquare className="h-10 w-10 text-neutral-300 dark:text-neutral-600" />
              <p className="mt-3 text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Chọn một cuộc trò chuyện để bắt đầu trao đổi
              </p>
              <p className="mt-1 max-w-sm text-xs text-neutral-500 dark:text-neutral-400">
                Bạn có thể thương lượng giá trực tiếp và đặt mua qua tài khoản trung gian VAHA Market ngay tại đây.
              </p>
            </div>
          ) : detailLoading && !detail ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <PageLoader />
            </div>
          ) : detailError && !detail ? (
            <div className="p-6">
              <Alert kind="error">{detailError}</Alert>
              <button
                type="button"
                onClick={() => navigate('/messages')}
                className="btn-secondary mt-3 text-xs"
              >
                <ArrowLeft size={14} /> Quay lại hộp thư
              </button>
            </div>
          ) : detail ? (
            <>
              {/* Header đối tác & sản phẩm */}
              <div className="space-y-2.5 border-b border-neutral-200 p-3.5 dark:border-neutral-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Link
                      to="/messages"
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:text-neutral-300 lg:hidden"
                      aria-label="Quay lại danh sách"
                    >
                      <ArrowLeft size={15} />
                    </Link>
                    <Link to={`/u/${detail.counterpart.id}`} className="shrink-0">
                      <Avatar
                        name={detail.counterpart.display_name}
                        url={detail.counterpart.avatar_url}
                        size={36}
                      />
                    </Link>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link
                          to={`/u/${detail.counterpart.id}`}
                          className="truncate text-sm font-semibold text-neutral-950 hover:underline dark:text-neutral-50"
                        >
                          {detail.counterpart.display_name}
                        </Link>
                        {detail.counterpart.is_mod && <ModBadge />}
                        <RatingSummaryBadge
                          avg={detail.counterpart.seller_rating_avg}
                          count={detail.counterpart.seller_rating_count}
                          compact
                        />
                      </div>
                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {isBuyer ? 'Người bán' : 'Người mua'} · {detail.counterpart.sold_count ?? 0} đơn bán
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {(!detail.conversation.is_blocked || isBlockedByMe) && (
                      <button
                        type="button"
                        disabled={blockingBusy}
                        onClick={() => void handleToggleBlock()}
                        className="btn-secondary h-8 px-2.5 text-xs"
                      >
                        <Ban size={13} />
                        {detail.conversation.is_blocked ? 'Bỏ chặn' : 'Chặn'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReportOpen((v) => !v);
                        setActionError(null);
                      }}
                      className="btn-secondary h-8 px-2.5 text-xs"
                    >
                      <Flag size={13} /> Báo cáo
                    </button>
                  </div>
                </div>

                {/* Thẻ sản phẩm đính kèm */}
                <Link
                  to={`/listing/${detail.listing.id}`}
                  className="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 transition-colors hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-950 dark:hover:border-neutral-700"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    {detail.listing.images?.[0]?.url && (
                      <img
                        src={cldUrl(detail.listing.images[0].url, { width: 96, height: 96, crop: 'fill' })}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded object-cover"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                        {detail.listing.title}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs tabular-nums">
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          {formatVND(detail.listing.price)}
                        </span>
                        <span className="rounded bg-neutral-200/80 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                          {LISTING_STATUS_TEXT[detail.listing.status] ?? detail.listing.status}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ExternalLink size={14} className="shrink-0 text-neutral-400" />
                </Link>

                {/* Nhắc nhở an toàn giao dịch */}
                <div className="flex items-center gap-2 rounded-md border border-blue-200/80 bg-blue-50/70 px-3 py-1.5 text-[11px] text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-200">
                  <ShieldCheck size={14} className="shrink-0 text-blue-700 dark:text-blue-400" />
                  <span>
                    Chỉ thanh toán qua tài khoản trung gian VAHA Market để được bảo vệ. Không chia sẻ SĐT/Zalo hoặc chuyển khoản riêng.
                  </span>
                </div>

                {/* Thông báo đơn hàng hiện có giữa 2 người */}
                {detail.latest_order && (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <span>
                      Đơn hàng liên quan: <strong className="font-mono">{detail.latest_order.payment_code}</strong> ({formatVND(detail.latest_order.amount)})
                    </span>
                    <Link
                      to={`/orders/${detail.latest_order.id}`}
                      className="font-semibold text-emerald-800 underline dark:text-emerald-300"
                    >
                      Mở đơn hàng
                    </Link>
                  </div>
                )}

                {/* Banner Trả giá đang hoạt động (Sticky Offer Banner) */}
                {activeOffer && (
                  <div
                    className={`space-y-2 rounded-md border p-3 text-xs ${
                      activeOffer.status === 'ACCEPTED'
                        ? 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/30'
                        : 'border-amber-300 bg-amber-50/80 dark:border-amber-800 dark:bg-amber-950/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag size={14} className="shrink-0 text-amber-700 dark:text-amber-300" />
                        <span className="font-semibold text-neutral-950 dark:text-neutral-50">
                          {activeOffer.status === 'ACCEPTED'
                            ? `Giá đã chốt: ${formatVND(activeOffer.offered_price)}`
                            : `Đề nghị giá: ${formatVND(activeOffer.offered_price)}`}
                        </span>
                        <span className="tabular-nums text-neutral-500 line-through dark:text-neutral-400">
                          {formatVND(detail.listing.price)}
                        </span>
                        <span className="rounded bg-neutral-900/10 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-800 dark:bg-white/10 dark:text-neutral-200">
                          -{Math.max(1, Math.round(((detail.listing.price - activeOffer.offered_price) / detail.listing.price) * 100))}%
                        </span>
                      </div>
                      <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
                        {formatTimeRemaining(activeOffer.expires_at)}
                      </span>
                    </div>

                    {activeOffer.note && (
                      <p className="text-neutral-700 dark:text-neutral-300">
                        Ghi chú: {activeOffer.note}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {activeOffer.status === 'PENDING' && activeOffer.proposer_id !== user?.id && (
                        <>
                          <button
                            type="button"
                            disabled={respondingOfferId === activeOffer.id}
                            onClick={() => void handleRespondOffer(activeOffer.id, 'ACCEPT')}
                            className="btn-primary h-7 px-3 text-xs"
                          >
                            {respondingOfferId === activeOffer.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            Chấp nhận giá này
                          </button>
                          {canNegotiate && (
                            <button
                              type="button"
                              disabled={respondingOfferId === activeOffer.id}
                              onClick={() => {
                                setOfferPriceText(String(activeOffer.offered_price));
                                setOfferOpen(true);
                              }}
                              className="btn-secondary h-7 px-3 text-xs"
                            >
                              Đề xuất giá khác
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={respondingOfferId === activeOffer.id}
                            onClick={() => void handleRespondOffer(activeOffer.id, 'DECLINE')}
                            className="btn-secondary h-7 px-3 text-xs text-red-700 dark:text-red-400"
                          >
                            <XCircle size={13} /> Từ chối
                          </button>
                        </>
                      )}

                      {activeOffer.status === 'PENDING' && activeOffer.proposer_id === user?.id && (
                        <>
                          <span className="text-amber-900 dark:text-amber-200">
                            Đang chờ {detail.counterpart.display_name} phản hồi.
                          </span>
                          <button
                            type="button"
                            disabled={respondingOfferId === activeOffer.id}
                            onClick={() => void handleRespondOffer(activeOffer.id, 'CANCEL')}
                            className="btn-secondary h-7 px-2.5 text-xs"
                          >
                            Hủy đề nghị
                          </button>
                        </>
                      )}

                      {activeOffer.status === 'ACCEPTED' && (
                        <>
                          {isBuyer && detail.listing.status === 'active' && detail.listing.ship_cod ? (
                            <button
                              type="button"
                              onClick={() => {
                                setBuyDialogOffer(activeOffer);
                                setBuyDialogOpen(true);
                              }}
                              className="btn-primary h-8 px-3 text-xs font-semibold"
                            >
                              <ShieldCheck size={14} /> Đặt mua ngay — {formatVND(activeOffer.offered_price)}
                            </button>
                          ) : (
                            <span className="text-emerald-900 dark:text-emerald-200">
                              Đã chốt mức giá thỏa thuận, chờ người mua tạo đơn hàng.
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={respondingOfferId === activeOffer.id}
                            onClick={() => void handleRespondOffer(activeOffer.id, 'CANCEL')}
                            className="btn-secondary h-7 px-2.5 text-xs"
                          >
                            Hủy thỏa thuận
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {reportOpen && (
                  <form
                    onSubmit={(e) => void handleSubmitReport(e)}
                    className="space-y-2 rounded-md border border-red-200 bg-red-50/50 p-3 dark:border-red-900/60 dark:bg-red-950/20"
                  >
                    <p className="text-xs font-semibold text-red-900 dark:text-red-200">
                      Báo cáo cuộc trò chuyện vi phạm
                    </p>
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      placeholder="Mô tả dấu hiệu lừa đảo, dẫn dụ ngoài sàn hoặc quấy rối (tối thiểu 5 ký tự)..."
                      className="input resize-y text-xs"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={sendingReport || reportReason.trim().length < 5}
                        className="btn-primary h-7 px-3 text-xs"
                      >
                        {sendingReport && <Loader2 className="h-3 w-3 animate-spin" />}
                        Gửi báo cáo
                      </button>
                      <button
                        type="button"
                        disabled={sendingReport}
                        onClick={() => setReportOpen(false)}
                        className="btn-secondary h-7 px-3 text-xs"
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Luồng tin nhắn */}
              <div className="max-h-[54vh] min-h-[300px] flex-1 space-y-2.5 overflow-y-auto bg-neutral-50/50 p-4 dark:bg-neutral-950/40">
                {detail.has_more && (
                  <div className="flex justify-center pb-2">
                    <button
                      type="button"
                      disabled={loadingOlder}
                      onClick={() => void handleLoadOlder()}
                      className="btn-secondary h-7 px-3 text-xs"
                    >
                      {loadingOlder && <Loader2 className="h-3 w-3 animate-spin" />}
                      Tải tin nhắn cũ hơn
                    </button>
                  </div>
                )}

                {detail.messages.length === 0 ? (
                  <p className="py-10 text-center text-xs text-neutral-500 dark:text-neutral-400">
                    Chưa có tin nhắn nào. Hãy gửi lời chào hoặc đề nghị mức giá phù hợp.
                  </p>
                ) : (
                  detail.messages.map((m: ChatMessage) => {
                    const mine = m.sender_id === user?.id;
                    const linkedOffer = m.offer_id ? offerMap.get(m.offer_id) : undefined;

                    if (m.message_type === 'SYSTEM') {
                      return (
                        <div key={m.id} className="flex justify-center py-1">
                          <div className="rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-center text-[11px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
                            <span>{m.body}</span>
                            {m.order_id && (
                              <>
                                {' · '}
                                <Link
                                  to={`/orders/${m.order_id}`}
                                  className="font-semibold text-blue-700 hover:underline dark:text-blue-400"
                                >
                                  Xem đơn hàng
                                </Link>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (m.message_type === 'OFFER' && linkedOffer) {
                      const pct = Math.max(
                        1,
                        Math.round(
                          ((linkedOffer.original_price - linkedOffer.offered_price) /
                            linkedOffer.original_price) *
                            100,
                        ),
                      );
                      return (
                        <div
                          key={m.id}
                          className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className="w-full max-w-xs space-y-1.5 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/40">
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1 font-semibold text-amber-900 dark:text-amber-200">
                                <Tag size={12} /> {mine ? 'Bạn đề nghị giá' : 'Đề nghị giá mới'}
                              </span>
                              <span className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                                {OFFER_STATUS_LABEL[linkedOffer.status]}
                              </span>
                            </div>
                            <div className="flex items-baseline gap-2 tabular-nums">
                              <span className="text-base font-bold text-neutral-950 dark:text-neutral-50">
                                {formatVND(linkedOffer.offered_price)}
                              </span>
                              <span className="text-neutral-500 line-through dark:text-neutral-400">
                                {formatVND(linkedOffer.original_price)}
                              </span>
                              <span className="font-semibold text-red-600 dark:text-red-400">
                                -{pct}%
                              </span>
                            </div>
                            {linkedOffer.note && (
                              <p className="text-neutral-700 dark:text-neutral-300">
                                {linkedOffer.note}
                              </p>
                            )}
                            <p className="text-[10px] tabular-nums text-neutral-400">
                              {new Date(m.created_at).toLocaleString('vi-VN')}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div
                          className={`max-w-[82%] rounded-lg px-3.5 py-2 text-sm sm:max-w-[70%] ${
                            mine
                              ? 'bg-blue-700 text-white dark:bg-blue-600'
                              : 'border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100'
                          }`}
                        >
                          <p className="whitespace-pre-line break-words">{m.body}</p>
                          <p
                            className={`mt-1 text-right text-[10px] tabular-nums ${
                              mine ? 'text-blue-100' : 'text-neutral-400'
                            }`}
                          >
                            {new Date(m.created_at).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Cảnh báo lỗi/thành công & Form Trả giá + Nhập tin nhắn */}
              <div className="space-y-2.5 border-t border-neutral-200 p-3.5 dark:border-neutral-800">
                {actionError && <Alert kind="error">{actionError}</Alert>}
                {actionNotice && <Alert kind="success">{actionNotice}</Alert>}

                {detail.conversation.is_blocked ? (
                  <Alert kind="info">
                    Cuộc trò chuyện đang tạm chặn gửi tin nhắn mới.
                  </Alert>
                ) : detail.counterpart.is_banned ? (
                  <Alert kind="error">
                    Tài khoản đối tác đã bị khóa vĩnh viễn.
                  </Alert>
                ) : (
                  <>
                    {offerOpen && canNegotiate && (
                      <form
                        onSubmit={(e) => void handleCreateOffer(e)}
                        className="space-y-2.5 rounded-md border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-950"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                            <Tag size={13} className="text-blue-700 dark:text-blue-400" />
                            Đề nghị mức giá mới (giá gốc {formatVND(detail.listing.price)})
                          </p>
                          <button
                            type="button"
                            onClick={() => setOfferOpen(false)}
                            className="text-neutral-400 hover:text-neutral-600"
                            aria-label="Đóng khung trả giá"
                          >
                            <X size={15} />
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {[0.95, 0.9, 0.85].map((ratio) => {
                            const preset = Math.round((detail.listing.price * ratio) / 10_000) * 10_000;
                            if (preset < minOfferPrice || preset >= detail.listing.price) return null;
                            const pct = Math.round((1 - ratio) * 100);
                            return (
                              <button
                                key={ratio}
                                type="button"
                                onClick={() => setOfferPriceText(String(preset))}
                                className="rounded border border-neutral-200 bg-white px-2 py-1 text-[11px] font-medium tabular-nums text-neutral-700 hover:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
                              >
                                -{pct}% ({formatVND(preset)})
                              </button>
                            );
                          })}
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                              Mức giá đề nghị (VND) · tối thiểu {formatVND(minOfferPrice)}
                            </label>
                            <input
                              type="number"
                              min={minOfferPrice}
                              max={detail.listing.price - 1}
                              step={10000}
                              value={offerPriceText}
                              onChange={(e) => setOfferPriceText(e.target.value)}
                              placeholder="Ví dụ: 2500000"
                              className="input h-9 text-xs tabular-nums"
                              required
                            />
                            {(() => {
                              const n = Number(offerPriceText.replace(/[^0-9]/g, ''));
                              if (!Number.isFinite(n) || n <= 0) return null;
                              const diffPct = Math.round(((detail.listing.price - n) / detail.listing.price) * 100);
                              return (
                                <p className="mt-1 text-[11px] font-medium tabular-nums text-blue-700 dark:text-blue-400">
                                  = {formatVND(n)}
                                  {diffPct > 0 && n < detail.listing.price ? ` (-${diffPct}% so với giá niêm yết)` : ''}
                                </p>
                              );
                            })()}
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-medium text-neutral-600 dark:text-neutral-400">
                              Ghi chú (tùy chọn)
                            </label>
                            <input
                              type="text"
                              maxLength={300}
                              value={offerNote}
                              onChange={(e) => setOfferNote(e.target.value)}
                              placeholder="Ví dụ: Đủ phụ kiện zin mình chốt luôn..."
                              className="input h-9 text-xs"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={sendingOffer}
                            className="btn-primary h-8 px-3 text-xs"
                          >
                            {sendingOffer && <Loader2 className="h-3 w-3 animate-spin" />}
                            Gửi đề nghị giá
                          </button>
                          <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                            Đề nghị có hiệu lực trong 24 giờ.
                          </span>
                        </div>
                      </form>
                    )}

                    <form onSubmit={(e) => void handleSendMessage(e)} className="flex items-end gap-2">
                      {canNegotiate && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!offerOpen && !offerPriceText) {
                              const suggested = Math.max(
                                minOfferPrice,
                                Math.round((detail.listing.price * 0.9) / 10_000) * 10_000,
                              );
                              setOfferPriceText(
                                String(Math.min(suggested, detail.listing.price - 10_000)),
                              );
                            }
                            setOfferOpen((v) => !v);
                          }}
                          className={`btn-secondary h-10 shrink-0 px-3 text-xs ${
                            offerOpen ? 'border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-400' : ''
                          }`}
                        >
                          <Tag size={14} />
                          <span className="hidden sm:inline">Trả giá</span>
                        </button>
                      )}

                      <div className="min-w-0 flex-1">
                        <textarea
                          rows={1}
                          maxLength={1000}
                          value={msgText}
                          onChange={(e) => setMsgText(e.target.value)}
                          onKeyDown={handleMessageKeyDown}
                          disabled={sendingMsg}
                          placeholder="Nhập tin nhắn (Enter để gửi, Shift+Enter xuống dòng)..."
                          className="input max-h-28 min-h-[40px] resize-y py-2 text-sm"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={sendingMsg || !msgText.trim()}
                        aria-label="Gửi tin nhắn"
                        className="btn-primary h-10 shrink-0 px-3.5 text-xs"
                      >
                        {sendingMsg ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send size={15} />
                        )}
                      </button>
                    </form>
                  </>
                )}

                {detail.listing.status !== 'active' && (
                  <p className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                    <AlertTriangle size={12} /> Tin đăng hiện không ở trạng thái mở bán nên tạm khóa tạo đề nghị trả giá mới.
                  </p>
                )}
              </div>
            </>
          ) : null}
        </section>
      </div>

      {buyDialogOpen && detail && (
        <BuyDialog
          listing={detail.listing}
          sellerIsMod={detail.listing.seller_is_mod}
          acceptedOffer={buyDialogOffer}
          onClose={() => {
            setBuyDialogOpen(false);
            setBuyDialogOffer(null);
          }}
        />
      )}
    </div>
  );
}
