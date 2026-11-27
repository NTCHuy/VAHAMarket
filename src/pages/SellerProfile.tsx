import { lazy, Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  MessageSquare,
  Package,
  ShieldBan,
  ShieldCheck,
  Star,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSavedListings } from '@/context/SavedListingsContext';
import { usePlatformSettings } from '@/context/PlatformSettingsContext';
import { getPublicSellerProfile } from '@/lib/community';
import { findViolation } from '@/lib/moderation';
import {
  formatRatingScore,
  getReviewTagLabel,
  getUserReviews,
  isWithinEditWindow,
  replyOrderReview,
} from '@/lib/reviews';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND, getDisplayPrice } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { isUuid, safeHttpUrl } from '@/lib/url';
import { getConditionLabel } from '@/constants/categories';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import ModBadge from '@/components/ModBadge';
import { RatingSummaryBadge, StarRow } from '@/components/StarRating';
import { Alert, Avatar, PageLoader } from '@/components/ui';
import type { OrderReview, PublicSellerProfile, ReviewRole, UserReviewsResult } from '@/types';

const MemberDetailModal = lazy(() => import('./admin/MemberDetailModal'));

const SHORT_CONDITION: Record<string, string> = {
  like_new: 'Như mới 99%',
  good: 'Tốt 90–98%',
  fair: 'Khá',
  for_parts: 'Xác / Linh kiện',
};

export default function SellerProfile() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const { isSaved, toggleSave } = useSavedListings();
  const { feeBp, feeCapVnd } = usePlatformSettings();

  const rawTab = searchParams.get('tab');
  const tab: 'active' | 'sold' | 'reviews' =
    rawTab === 'sold' ? 'sold' : rawTab === 'reviews' ? 'reviews' : 'active';
  const setTab = (next: 'active' | 'sold' | 'reviews') => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === 'active') p.delete('tab');
        else p.set('tab', next);
        return p;
      },
      { replace: true },
    );
  };

  const [data, setData] = useState<PublicSellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);

  const [reviewRole, setReviewRole] = useState<'ALL' | ReviewRole>('ALL');
  const [reviewsData, setReviewsData] = useState<UserReviewsResult | null>(null);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsLoadingMore, setReviewsLoadingMore] = useState(false);
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !isUuid(id)) {
      setData(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    getPublicSellerProfile(id)
      .then((res) => {
        if (alive) setData(res);
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
  }, [id]);

  const loadReviews = useCallback(async () => {
    if (!id || !isUuid(id)) return;
    setReviewsLoading(true);
    try {
      const res = await getUserReviews({ userId: id, role: reviewRole, limit: 20, offset: 0 });
      setReviewsData(res);
    } catch {
      // Giữ trạng thái an toàn nếu migration chưa chạy
    } finally {
      setReviewsLoading(false);
    }
  }, [id, reviewRole]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  useDocumentTitle(data ? `${data.profile.display_name} — Hồ sơ người bán` : 'Hồ sơ người bán');

  if (loading) return <PageLoader />;
  if (error) return <div className="mx-auto max-w-4xl"><Alert kind="error">{error}</Alert></div>;
  if (!data) {
    return (
      <div className="card mx-auto mt-8 max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Không tìm thấy thành viên</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Đường dẫn người bán không tồn tại hoặc đã bị xóa.</p>
        <Link to="/" className="btn-primary mt-4">Về trang chủ</Link>
      </div>
    );
  }

  const { profile, is_verified_seller, active_listings, sold_listings } = data;
  const safeFb = safeHttpUrl(profile.facebook_url);

  const copyProfileLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/u/${profile.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      {/* Khung thông tin công khai người bán */}
      <section className="card space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3.5">
            <Avatar name={profile.display_name} url={profile.avatar_url} size={56} />
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
                  {profile.display_name}
                </h1>
                {profile.is_mod && <ModBadge full />}
                {is_verified_seller && !profile.is_banned && (
                  <span className="badge gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <ShieldCheck size={12} strokeWidth={2} /> Đã đối chiếu FB &amp; NH
                  </span>
                )}
                {profile.is_banned && (
                  <span className="badge gap-1 bg-red-600 text-white dark:bg-red-600 dark:text-white">
                    <ShieldBan size={12} strokeWidth={2} /> Tài khoản đã bị khóa
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                <span>
                  Đã bán <strong className="text-neutral-900 dark:text-neutral-100">{profile.sold_count}</strong> đơn ·{' '}
                  Đang mở bán <strong className="text-neutral-900 dark:text-neutral-100">{active_listings.length}</strong> tin ·{' '}
                  Tham gia từ {new Date(profile.created_at).toLocaleDateString('vi-VN')}
                </span>
                <button
                  type="button"
                  onClick={() => setTab('reviews')}
                  className="inline-flex items-center hover:underline"
                >
                  <RatingSummaryBadge
                    avg={profile.seller_rating_avg}
                    count={profile.seller_rating_count}
                  />
                </button>
              </div>

              {profile.bio && (
                <p className="max-w-2xl text-sm text-neutral-700 dark:text-neutral-300">{profile.bio}</p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {safeFb && (
              <a
                href={safeFb}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn-secondary h-8 px-3 text-xs"
              >
                Facebook <ExternalLink size={13} strokeWidth={1.75} />
              </a>
            )}
            <button type="button" onClick={() => void copyProfileLink()} className="btn-secondary h-8 px-3 text-xs">
              {copied ? <Check size={13} strokeWidth={2} className="text-emerald-600" /> : <Copy size={13} strokeWidth={1.75} />}
              {copied ? 'Đã chép link' : 'Chia sẻ'}
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setInspectId(profile.id)}
                className="btn-primary h-8 px-3 text-xs"
              >
                <Eye size={13} strokeWidth={1.75} /> Hồ sơ kiểm duyệt
              </button>
            )}
          </div>
        </div>
      </section>

      {profile.is_banned ? (
        <Alert kind="error">
          Tài khoản này đã bị khóa vĩnh viễn do vi phạm quy định của VAHA Market. Toàn bộ tin đăng đã được gỡ khỏi sàn.
        </Alert>
      ) : (
        <>
          <div className="flex gap-1 border-b border-neutral-200 dark:border-neutral-800">
            <button
              type="button"
              onClick={() => setTab('active')}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === 'active'
                  ? 'border-blue-700 text-neutral-950 dark:border-blue-500 dark:text-neutral-50'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              Đang bán ({active_listings.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('sold')}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === 'sold'
                  ? 'border-blue-700 text-neutral-950 dark:border-blue-500 dark:text-neutral-50'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              Đã bán gần đây ({sold_listings.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('reviews')}
              className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                tab === 'reviews'
                  ? 'border-blue-700 text-neutral-950 dark:border-blue-500 dark:text-neutral-50'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              <Star size={14} className="fill-amber-500 text-amber-500" />
              Đánh giá ({reviewsData?.summary.total_count ?? profile.seller_rating_count ?? 0})
            </button>
          </div>

          {tab === 'reviews' ? (
            <SellerReviewsSection
              profileId={profile.id}
              profileName={profile.display_name}
              isOwner={user?.id === profile.id}
              reviewsData={reviewsData}
              loading={reviewsLoading}
              loadingMore={reviewsLoadingMore}
              reviewRole={reviewRole}
              onChangeRole={setReviewRole}
              replyTargetId={replyTargetId}
              replyText={replyText}
              replyBusy={replyBusy}
              replyError={replyError}
              onStartReply={(review) => {
                setReplyTargetId(review.id);
                setReplyText(review.reply_text ?? '');
                setReplyError(null);
              }}
              onChangeReplyText={setReplyText}
              onCancelReply={() => {
                setReplyTargetId(null);
                setReplyError(null);
              }}
              onSubmitReply={async (e, reviewId) => {
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
                setReplyBusy(true);
                try {
                  await replyOrderReview(reviewId, trimmed);
                  setReplyTargetId(null);
                  await loadReviews();
                } catch (err) {
                  setReplyError(getErrorMessage(err));
                } finally {
                  setReplyBusy(false);
                }
              }}
              onLoadMore={async () => {
                if (!id || !reviewsData) return;
                setReviewsLoadingMore(true);
                try {
                  const more = await getUserReviews({
                    userId: id,
                    role: reviewRole,
                    limit: 20,
                    offset: reviewsData.items.length,
                  });
                  setReviewsData((prev) =>
                    prev
                      ? {
                          ...more,
                          items: [...prev.items, ...more.items],
                        }
                      : more,
                  );
                } finally {
                  setReviewsLoadingMore(false);
                }
              }}
            />
          ) : tab === 'active' ? (
            active_listings.length === 0 ? (
              <div className="card flex flex-col items-center px-4 py-12 text-center">
                <Package className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Người bán hiện chưa có sản phẩm nào đang mở bán.</p>
              </div>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {active_listings.map((l) => {
                  const dp = getDisplayPrice(l, { isMod: profile.is_mod, globalBp: feeBp, feeCapVnd });
                  const saved = isSaved(l.id);
                  const condTag =
                    l.box_status === 'full'
                      ? `${SHORT_CONDITION[l.condition] ?? l.condition} · Đủ hộp`
                      : SHORT_CONDITION[l.condition] ?? l.condition;

                  return (
                    <li key={l.id} className="min-w-0">
                      <Link
                        to={`/listing/${l.id}`}
                        className="card group flex h-full flex-col overflow-hidden transition-colors hover:border-neutral-400 dark:hover:border-neutral-600"
                      >
                        <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                          {l.images[0] && (
                            <img
                              src={cldUrl(l.images[0].url, { width: 520, height: 390, crop: 'fill' })}
                              alt={l.title}
                              loading="lazy"
                              className="h-full w-full object-cover"
                            />
                          )}
                          <span className="absolute left-2 top-2 max-w-[calc(100%-3rem)] truncate rounded bg-neutral-950/75 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-[2px]">
                            {condTag}
                          </span>
                          <button
                            type="button"
                            aria-label={saved ? 'Bỏ lưu tin' : 'Lưu tin'}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              void toggleSave(l.id);
                            }}
                            className={`absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                              saved
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-white/30 bg-neutral-950/65 text-white hover:bg-neutral-950/85'
                            }`}
                          >
                            <Bookmark size={14} strokeWidth={1.9} className={saved ? 'fill-current' : ''} />
                          </button>
                        </div>

                        <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                          <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium leading-snug text-neutral-950 dark:text-neutral-100">
                            {l.title}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-baseline gap-1.5 tabular-nums">
                            <span className="text-sm font-semibold text-neutral-950 dark:text-neutral-50 sm:text-base">
                              {formatVND(dp.display)}
                            </span>
                            {dp.strike && (
                              <span className="text-xs text-neutral-400 line-through dark:text-neutral-500">
                                {formatVND(dp.strike)}
                              </span>
                            )}
                          </div>
                          <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[11px] text-neutral-500 dark:text-neutral-400">
                            <span>{l.province ?? 'Toàn quốc'}</span>
                            {l.verification_image_url && (
                              <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400">
                                <BadgeCheck size={12} /> Xác thực
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )
          ) : sold_listings.length === 0 ? (
            <div className="card flex flex-col items-center px-4 py-12 text-center">
              <Package className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Chưa có sản phẩm nào hoàn tất bán qua sàn.</p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {sold_listings.map((s) => (
                <li key={s.id} className="card flex flex-col overflow-hidden opacity-85">
                  <div className="relative aspect-[4/3] w-full bg-neutral-100 dark:bg-neutral-800">
                    {s.images[0] && (
                      <img
                        src={cldUrl(s.images[0].url, { width: 520, height: 390, crop: 'fill' })}
                        alt={s.title}
                        loading="lazy"
                        className="h-full w-full object-cover grayscale-[25%]"
                      />
                    )}
                    <span className="absolute left-2 top-2 rounded bg-neutral-900/85 px-2 py-0.5 text-[11px] font-medium text-white">
                      Đã bán
                    </span>
                  </div>
                  <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                    <p className="line-clamp-2 min-h-[2.5rem] text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {s.title}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold tabular-nums text-neutral-700 dark:text-neutral-300">
                      {formatVND(s.price)}
                    </p>
                    <p className="mt-auto pt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                      {getConditionLabel(s.condition)} · {new Date(s.updated_at).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {isAdmin && inspectId && (
        <Suspense fallback={null}>
          <MemberDetailModal
            userId={inspectId}
            onClose={() => setInspectId(null)}
            onSelectUser={(uid) => setInspectId(uid)}
          />
        </Suspense>
      )}
    </div>
  );
}

function SellerReviewsSection({
  profileId,
  profileName,
  isOwner,
  reviewsData,
  loading,
  loadingMore,
  reviewRole,
  onChangeRole,
  replyTargetId,
  replyText,
  replyBusy,
  replyError,
  onStartReply,
  onChangeReplyText,
  onCancelReply,
  onSubmitReply,
  onLoadMore,
}: {
  profileId: string;
  profileName: string;
  isOwner: boolean;
  reviewsData: UserReviewsResult | null;
  loading: boolean;
  loadingMore: boolean;
  reviewRole: 'ALL' | ReviewRole;
  onChangeRole: (role: 'ALL' | ReviewRole) => void;
  replyTargetId: string | null;
  replyText: string;
  replyBusy: boolean;
  replyError: string | null;
  onStartReply: (review: OrderReview) => void;
  onChangeReplyText: (text: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (e: FormEvent, reviewId: string) => Promise<void>;
  onLoadMore: () => Promise<void>;
}) {
  const summary = reviewsData?.summary;
  const items = reviewsData?.items ?? [];
  const totalFiltered = reviewsData?.total_filtered ?? 0;
  const starBase = Math.max(
    1,
    summary
      ? (['5', '4', '3', '2', '1'] as const).reduce((acc, k) => acc + Number(summary.stars[k] ?? 0), 0)
      : 0,
  );

  return (
    <div className="space-y-4">
      {summary && (
        <div className="card grid gap-5 p-4 sm:grid-cols-[220px_1fr] sm:p-5">
          <div className="flex flex-col justify-center border-b border-neutral-200 pb-4 dark:border-neutral-800 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-5">
            <p className="text-3xl font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
              {formatRatingScore(summary.avg_rating)}
              <span className="text-base font-normal text-neutral-400"> / 5</span>
            </p>
            <div className="mt-1">
              <StarRow rating={Number(summary.avg_rating ?? 0)} size={16} />
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              Tổng cộng <strong className="text-neutral-800 dark:text-neutral-200">{summary.total_count}</strong> đánh giá xác thực
            </p>
            <div className="mt-3 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              <p>
                Vai trò người bán: <strong className="text-neutral-900 dark:text-neutral-100">{formatRatingScore(summary.seller_avg)}</strong> ({summary.seller_count})
              </p>
              <p>
                Vai trò người mua: <strong className="text-neutral-900 dark:text-neutral-100">{formatRatingScore(summary.buyer_avg)}</strong> ({summary.buyer_count})
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-center space-y-1.5">
            {(['5', '4', '3', '2', '1'] as const).map((starKey) => {
              const cnt = Number(summary.stars[starKey] ?? 0);
              const pct = totalFiltered > 0 ? Math.round((cnt / starBase) * 100) : 0;
              return (
                <div key={starKey} className="flex items-center gap-2 text-xs tabular-nums">
                  <span className="w-10 shrink-0 font-medium text-neutral-700 dark:text-neutral-300">
                    {starKey} sao
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-neutral-500 dark:text-neutral-400">
                    {cnt}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ['ALL', `Tất cả (${summary?.total_count ?? 0})`],
            ['BUYER', `Từ người mua (${summary?.seller_count ?? 0})`],
            ['SELLER', `Từ người bán (${summary?.buyer_count ?? 0})`],
          ] as const
        ).map(([roleKey, label]) => (
          <button
            key={roleKey}
            type="button"
            onClick={() => onChangeRole(roleKey)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              reviewRole === roleKey
                ? 'border-blue-600 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && items.length === 0 ? (
        <div className="card flex items-center justify-center py-10 text-sm text-neutral-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang tải đánh giá...
        </div>
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Star className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Chưa có đánh giá nào ở mục này.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((rev) => {
            const canReply =
              isOwner &&
              rev.reviewee_id === profileId &&
              (!rev.replied_at || isWithinEditWindow(rev.replied_at));
            const replyingHere = replyTargetId === rev.id;

            return (
              <div key={rev.id} className="card space-y-2.5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {rev.reviewer && (
                      <Link to={`/u/${rev.reviewer.id}`} className="shrink-0">
                        <Avatar name={rev.reviewer.display_name} url={rev.reviewer.avatar_url} size={32} />
                      </Link>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {rev.reviewer ? (
                          <Link
                            to={`/u/${rev.reviewer.id}`}
                            className="truncate text-sm font-medium text-neutral-900 hover:underline dark:text-neutral-100"
                          >
                            {rev.reviewer.display_name}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium">Thành viên VAHA</span>
                        )}
                        {rev.reviewer?.is_mod && <ModBadge />}
                        <span className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                          {rev.reviewer_role === 'BUYER' ? 'Người mua' : 'Người bán'}
                        </span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <StarRow rating={rev.rating} size={13} />
                        <span className="text-[11px] text-neutral-400">
                          {new Date(rev.created_at).toLocaleDateString('vi-VN')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {rev.listing_title_snapshot && (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Sản phẩm:{' '}
                    {rev.listing_id ? (
                      <Link
                        to={`/listing/${rev.listing_id}`}
                        className="font-medium text-neutral-700 hover:underline dark:text-neutral-300"
                      >
                        {rev.listing_title_snapshot}
                      </Link>
                    ) : (
                      <span>{rev.listing_title_snapshot}</span>
                    )}
                  </p>
                )}

                {rev.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {rev.tags.map((code) => (
                      <span
                        key={code}
                        className="rounded border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        {getReviewTagLabel(code)}
                      </span>
                    ))}
                  </div>
                )}

                {rev.comment && (
                  <p className="whitespace-pre-line text-sm text-neutral-800 dark:text-neutral-200">
                    {rev.comment}
                  </p>
                )}

                {rev.reply_text && !replyingHere && (
                  <div className="rounded-md border border-neutral-200 bg-neutral-50 p-2.5 text-xs dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                        Phản hồi của {profileName}
                      </p>
                      {canReply && (
                        <button
                          type="button"
                          onClick={() => onStartReply(rev)}
                          className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
                        >
                          Sửa
                        </button>
                      )}
                    </div>
                    <p className="mt-1 whitespace-pre-line text-neutral-600 dark:text-neutral-400">
                      {rev.reply_text}
                    </p>
                  </div>
                )}

                {!rev.reply_text && canReply && !replyingHere && (
                  <button
                    type="button"
                    onClick={() => onStartReply(rev)}
                    className="btn-secondary h-7 px-2.5 text-xs"
                  >
                    <MessageSquare size={12} /> Phản hồi
                  </button>
                )}

                {replyingHere && (
                  <form onSubmit={(e) => void onSubmitReply(e, rev.id)} className="space-y-2 pt-1">
                    <textarea
                      rows={2}
                      maxLength={500}
                      value={replyText}
                      onChange={(e) => onChangeReplyText(e.target.value)}
                      disabled={replyBusy}
                      placeholder="Nhập phản hồi lịch sự..."
                      className="input resize-y text-xs"
                    />
                    {replyError && <Alert kind="error">{replyError}</Alert>}
                    <div className="flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={replyBusy || replyText.trim().length < 2}
                        className="btn-primary h-7 px-3 text-xs"
                      >
                        {replyBusy && <Loader2 className="h-3 w-3 animate-spin" />}
                        Lưu phản hồi
                      </button>
                      <button
                        type="button"
                        disabled={replyBusy}
                        onClick={onCancelReply}
                        className="btn-secondary h-7 px-3 text-xs"
                      >
                        Hủy
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}

          {items.length < totalFiltered && (
            <div className="flex justify-center pt-1">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => void onLoadMore()}
                className="btn-secondary h-9 px-4 text-xs"
              >
                {loadingMore && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                Xem thêm đánh giá ({items.length}/{totalFiltered})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
