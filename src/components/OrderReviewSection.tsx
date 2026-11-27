import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Edit3, Loader2, MessageSquare, ShieldAlert } from 'lucide-react';
import { findViolation } from '@/lib/moderation';
import {
  getOrderReviews,
  getReviewTagLabel,
  getReviewTagsForRole,
  isWithinEditWindow,
  replyOrderReview,
  submitOrderReview,
} from '@/lib/reviews';
import { getErrorMessage } from '@/lib/errors';
import { StarInput, StarRow } from '@/components/StarRating';
import { Alert, Avatar } from '@/components/ui';
import type { OrderReview, OrderReviewsBundle, OrderStatus, ReviewRole } from '@/types';

export default function OrderReviewSection({
  orderId,
  orderStatus,
  isBuyer,
  counterpartName,
  onChanged,
}: {
  orderId: string;
  orderStatus: OrderStatus;
  isBuyer: boolean;
  counterpartName: string;
  onChanged?: () => void;
}) {
  const isCompleted = orderStatus === 'COMPLETED' || orderStatus === 'PAID_OUT';
  const myRole: ReviewRole = isBuyer ? 'BUYER' : 'SELLER';
  const tagOptions = getReviewTagsForRole(myRole);

  const [bundle, setBundle] = useState<OrderReviewsBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [savingReview, setSavingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [savingReply, setSavingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    if (!isCompleted) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getOrderReviews(orderId);
      setBundle(res);
      if (res.my_review) {
        setRating(res.my_review.rating);
        setSelectedTags(res.my_review.tags ?? []);
        setComment(res.my_review.comment ?? '');
        setEditing(false);
      } else {
        setRating(0);
        setSelectedTags([]);
        setComment('');
        setEditing(true);
      }
      if (res.counterpart_review?.reply_text) {
        setReplyText(res.counterpart_review.reply_text);
      }
    } catch (err) {
      setLoadError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [orderId, isCompleted]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  if (!isCompleted) return null;

  const toggleTag = (code: string) => {
    setSelectedTags((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  };

  const handleSubmitReview = async (e: FormEvent) => {
    e.preventDefault();
    setReviewError(null);
    setReviewNotice(null);

    if (rating < 1 || rating > 5) {
      setReviewError('Vui lòng chọn số sao từ 1 đến 5.');
      return;
    }

    const trimmed = comment.trim();
    if (trimmed) {
      const violation = findViolation(trimmed);
      if (violation) {
        setReviewError(violation);
        return;
      }
    }

    setSavingReview(true);
    try {
      await submitOrderReview({
        orderId,
        rating,
        comment: trimmed,
        tags: selectedTags,
      });
      setReviewNotice(bundle?.my_review ? 'Đã cập nhật đánh giá của bạn.' : 'Đã gửi đánh giá thành công.');
      await loadReviews();
      onChanged?.();
    } catch (err) {
      setReviewError(getErrorMessage(err));
    } finally {
      setSavingReview(false);
    }
  };

  const handleSubmitReply = async (e: FormEvent, review: OrderReview) => {
    e.preventDefault();
    setReplyError(null);
    const trimmed = replyText.trim();
    if (trimmed.length < 2) {
      setReplyError('Phản hồi cần tối thiểu 2 ký tự.');
      return;
    }
    const violation = findViolation(trimmed);
    if (violation) {
      setReplyError(violation);
      return;
    }

    setSavingReply(true);
    try {
      await replyOrderReview(review.id, trimmed);
      setReplyOpen(false);
      await loadReviews();
      onChanged?.();
    } catch (err) {
      setReplyError(getErrorMessage(err));
    } finally {
      setSavingReply(false);
    }
  };

  const myReview = bundle?.my_review ?? null;
  const otherReview = bundle?.counterpart_review ?? null;
  const canEditMyReview = Boolean(
    myReview && !myReview.is_hidden && isWithinEditWindow(myReview.created_at),
  );
  const canReplyOther = Boolean(
    otherReview &&
      !otherReview.is_hidden &&
      (!otherReview.replied_at || isWithinEditWindow(otherReview.replied_at)),
  );

  return (
    <section className="card space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">
            Đánh giá sau giao dịch
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Chỉ thành viên đã hoàn tất đơn hàng mới có thể gửi đánh giá. Mỗi bên được sửa một lần trong 7 ngày.
          </p>
        </div>
      </div>

      {loadError && <Alert kind="error">{loadError}</Alert>}
      {reviewNotice && <Alert kind="success">{reviewNotice}</Alert>}

      {loading && !bundle ? (
        <div className="flex items-center gap-2 py-4 text-sm text-neutral-500 dark:text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải đánh giá...
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Đánh giá của tôi */}
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Đánh giá của bạn về {counterpartName}
              </p>
              {myReview && canEditMyReview && !editing && (
                <button
                  type="button"
                  onClick={() => {
                    setRating(myReview.rating);
                    setSelectedTags(myReview.tags ?? []);
                    setComment(myReview.comment ?? '');
                    setReviewError(null);
                    setEditing(true);
                  }}
                  className="btn-secondary h-7 px-2.5 text-xs"
                >
                  <Edit3 size={12} /> Sửa đánh giá
                </button>
              )}
            </div>

            {myReview && myReview.is_hidden && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="flex items-center gap-1.5 font-medium">
                  <ShieldAlert size={13} /> Đánh giá này đã bị quản trị viên ẩn
                </p>
                {myReview.hidden_reason && <p className="mt-1">Lý do: {myReview.hidden_reason}</p>}
              </div>
            )}

            {editing && bundle?.can_review && !myReview?.is_hidden ? (
              <form onSubmit={handleSubmitReview} className="space-y-3">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Mức độ hài lòng <span className="text-red-600">*</span>
                  </p>
                  <StarInput value={rating} onChange={setRating} disabled={savingReview} />
                </div>

                <div>
                  <p className="mb-1.5 text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    Nhận xét nhanh (tùy chọn)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tagOptions.map((tag) => {
                      const active = selectedTags.includes(tag.code);
                      return (
                        <button
                          key={tag.code}
                          type="button"
                          disabled={savingReview}
                          onClick={() => toggleTag(tag.code)}
                          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                            active
                              ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                              : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
                          }`}
                        >
                          {tag.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor={`order-review-comment-${orderId}`}
                    className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
                  >
                    Chi tiết trải nghiệm (không chèn link hay SĐT)
                  </label>
                  <textarea
                    id={`order-review-comment-${orderId}`}
                    rows={3}
                    maxLength={1000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={savingReview}
                    placeholder={
                      isBuyer
                        ? 'Chia sẻ về tình trạng sản phẩm, cách đóng gói, thái độ giao dịch...'
                        : 'Chia sẻ về tốc độ thanh toán và xác nhận nhận hàng của người mua...'
                    }
                    className="input resize-y text-sm"
                  />
                  <p className="mt-1 text-right text-[11px] tabular-nums text-neutral-400">
                    {comment.length}/1000
                  </p>
                </div>

                {reviewError && <Alert kind="error">{reviewError}</Alert>}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="submit"
                    disabled={savingReview || rating < 1}
                    className="btn-primary h-9 px-4 text-xs"
                  >
                    {savingReview && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {myReview ? 'Lưu thay đổi' : 'Gửi đánh giá'}
                  </button>
                  {myReview && (
                    <button
                      type="button"
                      disabled={savingReview}
                      onClick={() => {
                        setEditing(false);
                        setReviewError(null);
                      }}
                      className="btn-secondary h-9 px-3 text-xs"
                    >
                      Hủy
                    </button>
                  )}
                </div>
              </form>
            ) : myReview ? (
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <StarRow rating={myReview.rating} size={15} />
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {myReview.rating}/5
                  </span>
                  <span className="ml-auto text-[11px] text-neutral-400">
                    {new Date(myReview.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                {myReview.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {myReview.tags.map((code) => (
                      <span
                        key={code}
                        className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {getReviewTagLabel(code)}
                      </span>
                    ))}
                  </div>
                )}
                {myReview.comment && (
                  <p className="whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
                    {myReview.comment}
                  </p>
                )}
                {myReview.reply_text && (
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                      Phản hồi từ {counterpartName}
                    </p>
                    <p className="mt-1 whitespace-pre-line text-neutral-600 dark:text-neutral-400">
                      {myReview.reply_text}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Chưa có đánh giá.
              </p>
            )}
          </div>

          {/* Đánh giá từ đối tác */}
          <div className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="mb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Đánh giá từ {counterpartName}
            </p>

            {!otherReview ? (
              <div className="flex items-start gap-2 rounded-md border border-dashed border-neutral-200 p-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
                <span>{counterpartName} chưa gửi đánh giá cho giao dịch này.</span>
              </div>
            ) : (
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2">
                  {otherReview.reviewer && (
                    <Avatar
                      name={otherReview.reviewer.display_name}
                      url={otherReview.reviewer.avatar_url}
                      size={24}
                    />
                  )}
                  <StarRow rating={otherReview.rating} size={15} />
                  <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {otherReview.rating}/5
                  </span>
                  <span className="ml-auto text-[11px] text-neutral-400">
                    {new Date(otherReview.created_at).toLocaleDateString('vi-VN')}
                  </span>
                </div>

                {otherReview.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {otherReview.tags.map((code) => (
                      <span
                        key={code}
                        className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {getReviewTagLabel(code)}
                      </span>
                    ))}
                  </div>
                )}

                {otherReview.comment ? (
                  <p className="whitespace-pre-line text-sm text-neutral-700 dark:text-neutral-300">
                    {otherReview.comment}
                  </p>
                ) : (
                  <p className="text-xs italic text-neutral-400">Không kèm nhận xét chữ.</p>
                )}

                {otherReview.reply_text && !replyOpen && (
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                        Phản hồi của bạn
                      </p>
                      {canReplyOther && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyText(otherReview.reply_text ?? '');
                            setReplyError(null);
                            setReplyOpen(true);
                          }}
                          className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                        >
                          Sửa
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-neutral-600 dark:text-neutral-400">
                      {otherReview.reply_text}
                    </p>
                  </div>
                )}

                {!otherReview.reply_text && canReplyOther && !replyOpen && (
                  <button
                    type="button"
                    onClick={() => {
                      setReplyText('');
                      setReplyError(null);
                      setReplyOpen(true);
                    }}
                    className="btn-secondary h-8 px-3 text-xs"
                  >
                    <MessageSquare size={13} /> Phản hồi đánh giá này
                  </button>
                )}

                {replyOpen && (
                  <form onSubmit={(e) => void handleSubmitReply(e, otherReview)} className="space-y-2 pt-1">
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      disabled={savingReply}
                      placeholder="Nhập phản hồi lịch sự, tối đa 500 ký tự..."
                      className="input resize-y text-xs"
                    />
                    {replyError && <Alert kind="error">{replyError}</Alert>}
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={savingReply || replyText.trim().length < 2}
                        className="btn-primary h-8 px-3 text-xs"
                      >
                        {savingReply && <Loader2 className="h-3 w-3 animate-spin" />}
                        Lưu phản hồi
                      </button>
                      <button
                        type="button"
                        disabled={savingReply}
                        onClick={() => setReplyOpen(false)}
                        className="btn-secondary h-8 px-3 text-xs"
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
