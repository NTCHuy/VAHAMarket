import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  Bookmark,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Package,
  ShieldBan,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSavedListings } from '@/context/SavedListingsContext';
import { usePlatformSettings } from '@/context/PlatformSettingsContext';
import { getPublicSellerProfile } from '@/lib/community';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND, getDisplayPrice } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { isUuid, safeHttpUrl } from '@/lib/url';
import { getConditionLabel } from '@/constants/categories';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import ModBadge from '@/components/ModBadge';
import { Alert, Avatar, PageLoader } from '@/components/ui';
import type { PublicSellerProfile } from '@/types';

const MemberDetailModal = lazy(() => import('./admin/MemberDetailModal'));

const SHORT_CONDITION: Record<string, string> = {
  like_new: 'Như mới 99%',
  good: 'Tốt 90–98%',
  fair: 'Khá',
  for_parts: 'Xác / Linh kiện',
};

export default function SellerProfile() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  const { isSaved, toggleSave } = useSavedListings();
  const { feeBp, feeCapVnd } = usePlatformSettings();

  const [data, setData] = useState<PublicSellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'active' | 'sold'>('active');
  const [copied, setCopied] = useState(false);
  const [inspectId, setInspectId] = useState<string | null>(null);

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

              <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                Đã bán <strong className="text-neutral-900 dark:text-neutral-100">{profile.sold_count}</strong> đơn ·{' '}
                Đang mở bán <strong className="text-neutral-900 dark:text-neutral-100">{active_listings.length}</strong> tin ·{' '}
                Tham gia từ {new Date(profile.created_at).toLocaleDateString('vi-VN')}
              </p>

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
          </div>

          {tab === 'active' ? (
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
