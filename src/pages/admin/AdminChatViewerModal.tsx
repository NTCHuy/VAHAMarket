import { useEffect, useState } from 'react';
import { Eye, Loader2, MessageSquare, Tag, X } from 'lucide-react';
import { getDisputeConversation, getReportedConversation } from '@/lib/admin';
import { OFFER_STATUS_LABEL } from '@/lib/chat';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { Alert, Avatar } from '@/components/ui';
import type { AdminConversationSnapshot, PriceOffer } from '@/types';

export type AdminChatViewerTarget =
  | { type: 'dispute'; orderId: string }
  | { type: 'report'; reportId: string };

export default function AdminChatViewerModal({
  target,
  onClose,
  onInspectMember,
}: {
  target: AdminChatViewerTarget;
  onClose: () => void;
  onInspectMember?: (userId: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<AdminConversationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const req =
      target.type === 'dispute'
        ? getDisputeConversation(target.orderId)
        : getReportedConversation(target.reportId);

    req
      .then((res) => {
        if (alive) setSnapshot(res);
      })
      .catch((err) => {
        if (alive) setError(getErrorMessage(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const offerMap = new Map<string, PriceOffer>(
    (snapshot?.offers ?? []).map((o) => [o.id, o]),
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lịch sử hội thoại"
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-950/60 p-3 backdrop-blur-[2px] sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-950 dark:text-neutral-50">
              <MessageSquare size={16} className="text-blue-700 dark:text-blue-400" />
              Nhật ký hội thoại {snapshot?.payment_code ? `· ${snapshot.payment_code}` : ''}
            </h2>
            <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
              {snapshot?.listing_title ?? 'Đang tải thông tin cuộc trò chuyện...'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-neutral-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải hội thoại...
            </div>
          ) : error ? (
            <Alert kind="error">{error}</Alert>
          ) : !snapshot ? (
            <div className="py-10 text-center text-sm text-neutral-500 dark:text-neutral-400">
              Hai bên chưa có hội thoại nào trên sàn cho sản phẩm này.
            </div>
          ) : (
            <>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {[
                  { label: 'Người mua', party: snapshot.buyer },
                  { label: 'Người bán', party: snapshot.seller },
                ].map(({ label, party }) => (
                  <div
                    key={party.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={party.display_name} url={party.avatar_url} size={28} />
                      <div className="min-w-0">
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">{label}</p>
                        <p className="truncate text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                          {party.display_name}
                        </p>
                      </div>
                    </div>
                    {onInspectMember && (
                      <button
                        type="button"
                        onClick={() => onInspectMember(party.id)}
                        className="btn-secondary h-7 px-2 text-[11px]"
                      >
                        <Eye size={12} /> Hồ sơ
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {snapshot.messages.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Chưa có tin nhắn nào được gửi trong cuộc trò chuyện này.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {snapshot.messages.map((m) => {
                    const isBuyerMsg = m.sender_id === snapshot.buyer.id;
                    const senderName =
                      m.sender_id === snapshot.buyer.id
                        ? snapshot.buyer.display_name
                        : m.sender_id === snapshot.seller.id
                          ? snapshot.seller.display_name
                          : 'Hệ thống';
                    const offer = m.offer_id ? offerMap.get(m.offer_id) : undefined;

                    if (m.message_type === 'SYSTEM') {
                      return (
                        <li key={m.id} className="text-center text-xs text-neutral-500 dark:text-neutral-400">
                          <span className="inline-block rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 dark:border-neutral-800 dark:bg-neutral-950">
                            {m.body} · {new Date(m.created_at).toLocaleString('vi-VN')}
                          </span>
                        </li>
                      );
                    }

                    return (
                      <li
                        key={m.id}
                        className={`rounded-lg border p-3 text-sm ${
                          isBuyerMsg
                            ? 'border-blue-200/80 bg-blue-50/40 dark:border-blue-900/50 dark:bg-blue-950/20'
                            : 'border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                          <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                            {senderName}{' '}
                            <span className="font-normal text-neutral-500 dark:text-neutral-400">
                              ({isBuyerMsg ? 'Người mua' : 'Người bán'})
                            </span>
                          </span>
                          <span className="tabular-nums text-neutral-400">
                            {new Date(m.created_at).toLocaleString('vi-VN')}
                          </span>
                        </div>
                        {offer && (
                          <div className="mb-1.5 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                            <Tag size={12} />
                            <span className="font-semibold tabular-nums">
                              Đề nghị giá: {formatVND(offer.offered_price)}
                            </span>
                            <span>({OFFER_STATUS_LABEL[offer.status]})</span>
                          </div>
                        )}
                        <p className="whitespace-pre-line text-neutral-800 dark:text-neutral-200">{m.body}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
