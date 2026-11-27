import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  BadgeCheck,
  Ban,
  Bookmark,
  Check,
  Copy,
  Eye,
  Flag,
  MessageSquare,
  Share2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  ShieldCheck,
  Store,
  Tag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useSavedListings } from '@/context/SavedListingsContext';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { calcFees, formatVND, getDisplayPrice } from '@/lib/money';
import { getSellerFacebook } from '@/lib/orders';
import { getListingAcceptedOffer, startOrGetConversation } from '@/lib/chat';
import { getErrorMessage } from '@/lib/errors';
import { isUuid, safeCloudinaryUrl, safeHttpUrl } from '@/lib/url';
import { getBoxStatusLabel, getCategory, getConditionLabel } from '@/constants/categories';
import { Alert, Avatar } from '@/components/ui';
import { ListingDetailSkeleton } from '@/components/Skeletons';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import BuyDialog from '@/components/BuyDialog';
import BuyerProtectionSteps from '@/components/BuyerProtectionSteps';
import ModBadge from '@/components/ModBadge';
import PriceBreakdown from '@/components/PriceBreakdown';
import PriceTag from '@/components/PriceTag';
import ReportListingModal from '@/components/ReportListingModal';
import { RatingSummaryBadge } from '@/components/StarRating';
import { usePlatformSettings } from '@/context/PlatformSettingsContext';
import type { Listing, PriceOffer, Profile } from '@/types';

const ListingModerationModal = lazy(() => import('./admin/ListingModerationModal'));
const MemberDetailModal = lazy(() => import('./admin/MemberDetailModal'));

const STATUS_TEXT: Partial<Record<Listing['status'], string>> = {
  pending_review: 'Tin đang chờ duyệt, chưa hiển thị công khai.',
  rejected: 'Tin chưa được duyệt. Bấm "Sửa tin" để xem lý do và gửi lại.',
  draft: 'Tin nháp, chỉ mình bạn thấy.',
  hidden: 'Tin đang ẩn, chỉ mình bạn thấy.',
};

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isAdmin, signIn } = useAuth();
  const { isSaved, toggleSave } = useSavedListings();
  const { feeBp, feeCapVnd } = usePlatformSettings();
  const [listing, setListing] = useState<Listing | null>(null);
  const [seller, setSeller] = useState<Profile | null>(null);
  const [facebook, setFacebook] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [galleryTab, setGalleryTab] = useState<'product' | 'verification'>('product');
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [acceptedOffer, setAcceptedOffer] = useState<PriceOffer | null>(null);
  const [useAcceptedOfferInBuy, setUseAcceptedOfferInBuy] = useState(false);
  const [chatBusy, setChatBusy] = useState<'chat' | 'offer' | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [copiedMode, setCopiedMode] = useState<'link' | 'snippet' | null>(null);
  const [adminModMode, setAdminModMode] = useState<'remove' | 'delete' | null>(null);
  const [inspectSellerId, setInspectSellerId] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<string | null>(null);
  const [related, setRelated] = useState<Pick<Listing, 'id' | 'title' | 'price' | 'province' | 'condition' | 'images'>[]>([]);

  useEffect(() => {
    if (!id) return;
    if (!isUuid(id)) {
      setListing(null);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    setGalleryTab('product');
    setActive(0);
    (async () => {
      try {
        const res = await supabase.from('listings').select('*').eq('id', id).maybeSingle();
        if (res.error) throw res.error;
        const l = res.data as Listing | null;
        if (!alive) return;
        setListing(l);
        if (l) {
          const [p, fb, rel] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', l.seller_id).maybeSingle(),
            getSellerFacebook(l.seller_id),
            supabase
              .from('listings')
              .select('id,title,price,province,condition,images')
              .eq('status', 'active')
              .eq('category', l.category)
              .neq('id', l.id)
              .order('created_at', { ascending: false })
              .limit(4),
          ]);
          if (!alive) return;
          setSeller((p.data as Profile | null) ?? null);
          setFacebook(fb);
          setRelated((rel.data ?? []) as Pick<Listing, 'id' | 'title' | 'price' | 'province' | 'condition' | 'images'>[]);
        }
      } catch (e) {
        if (alive) setError(getErrorMessage(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (lightbox === null || !listing) return;
    const count = listing.images.length;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % count));
      else if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : (i - 1 + count) % count));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [lightbox, listing]);

  useDocumentTitle(listing?.title ?? null);

  if (loading) return <ListingDetailSkeleton />;
  if (error) return <div className="mx-auto max-w-2xl"><Alert kind="error">{error}</Alert></div>;
  if (!listing) {
    return (
      <div className="card mx-auto mt-8 max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Không tìm thấy sản phẩm</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Tin đăng không tồn tại, đã bán hoặc đang bị ẩn.</p>
        <Link to="/" className="btn-primary mt-4">Về trang chủ</Link>
      </div>
    );
  }

  const isOwner = user?.id === listing.seller_id;
  const images = listing.images;
  const canBuy = listing.status === 'active' && listing.ship_cod && !isOwner;
  const category = getCategory(listing.category);
  const sellerIsMod = seller?.is_mod ?? false;
  const fees = calcFees(listing.price, listing.fee_payer, sellerIsMod, feeBp, feeCapVnd);
  const dp = getDisplayPrice(listing, { isMod: sellerIsMod, globalBp: feeBp, feeCapVnd });

  const specs: { label: string; value: string }[] = [
    { label: 'Phân loại', value: category?.label ?? listing.category },
    ...(listing.brand ? [{ label: 'Thương hiệu', value: listing.brand }] : []),
    { label: 'Tình trạng', value: getConditionLabel(listing.condition) },
    { label: 'Hộp & phụ kiện', value: getBoxStatusLabel(listing.box_status) },
    { label: 'Gặp trực tiếp', value: listing.province ?? 'Không (chỉ gửi hàng)' },
    { label: 'Gửi hàng', value: listing.ship_cod ? 'Có — người mua trả phí giao hàng' : 'Không' },
    { label: 'Ngày đăng', value: new Date(listing.created_at).toLocaleDateString('vi-VN') },
  ];

  const shareUrl = `${window.location.origin}/listing/${listing.id}`;
  const safeVerificationUrl = safeCloudinaryUrl(listing.verification_image_url);
  const safeFacebookUrl = safeHttpUrl(facebook);

  const handleCopyShare = async (mode: 'link' | 'snippet') => {
    const content =
      mode === 'link'
        ? shareUrl
        : [
            `[VAHA Market · 0% phí] ${listing.title}`,
            `Giá: ${formatVND(dp.display)} · ${getConditionLabel(listing.condition)}${listing.province ? ` · ${listing.province}` : ''}`,
            `Giao dịch bảo lãnh trung gian: ${shareUrl}`,
          ].join('\n');
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMode(mode);
      setTimeout(() => setCopiedMode((cur) => (cur === mode ? null : cur)), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className={`mx-auto max-w-6xl space-y-4 ${canBuy ? 'pb-20 lg:pb-0' : ''}`}>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <Link to="/" className="shrink-0 hover:text-neutral-950 hover:underline dark:hover:text-neutral-100">
          Trang chủ
        </Link>
        <ChevronRight size={13} strokeWidth={1.75} className="shrink-0 text-neutral-400" />
        <Link
          to={`/?category=${encodeURIComponent(listing.category)}`}
          className="shrink-0 hover:text-neutral-950 hover:underline dark:hover:text-neutral-100"
        >
          {category?.label ?? listing.category}
        </Link>
        <ChevronRight size={13} strokeWidth={1.75} className="shrink-0 text-neutral-400" />
        <span className="min-w-0 truncate font-medium text-neutral-800 dark:text-neutral-200">{listing.title}</span>
      </nav>

      {/* Bố cục 2 cột chuẩn 60% / 40% */}
      <div className="grid w-full min-w-0 items-start gap-6 lg:grid-cols-[3fr_2fr]">
        {/* CỘT TRÁI (60%): Gallery + Tab Ảnh xác thực viết tay + Thông số & Mô tả */}
        <div className="min-w-0 w-full space-y-5">
          <div className="card w-full min-w-0 overflow-hidden">
            {/* Tab chuyển đổi Ảnh sản phẩm / Ảnh xác thực */}
            {listing.verification_image_url && (
              <div className="flex w-full min-w-0 border-b border-neutral-200 bg-neutral-50 text-xs font-medium dark:border-neutral-800 dark:bg-neutral-950 sm:text-sm">
                <button
                  type="button"
                  onClick={() => setGalleryTab('product')}
                  className={`flex-1 whitespace-nowrap px-3 py-2.5 text-center transition-colors sm:px-4 ${
                    galleryTab === 'product'
                      ? 'border-b-2 border-blue-700 bg-white text-neutral-950 dark:border-blue-500 dark:bg-neutral-900 dark:text-neutral-50'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                  }`}
                >
                  Ảnh sản phẩm ({images.length})
                </button>
                <button
                  type="button"
                  onClick={() => setGalleryTab('verification')}
                  className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 py-2.5 text-center transition-colors sm:px-4 ${
                    galleryTab === 'verification'
                      ? 'border-b-2 border-emerald-600 bg-white text-emerald-700 dark:border-emerald-500 dark:bg-neutral-900 dark:text-emerald-400'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                  }`}
                >
                  <BadgeCheck size={14} strokeWidth={1.75} className="shrink-0" />
                  <span className="sm:hidden">Ảnh xác thực</span>
                  <span className="hidden sm:inline">Ảnh xác thực chính chủ</span>
                </button>
              </div>
            )}

            {galleryTab === 'product' ? (
              <div className="min-w-0 p-3">
                <button
                  type="button"
                  onClick={() => setLightbox(active)}
                  className="block aspect-[4/3] w-full overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-950"
                  aria-label="Phóng to ảnh"
                >
                  <img
                    src={cldUrl(images[active]?.url ?? '', { width: 1200 })}
                    alt={listing.title}
                    className="h-full w-full object-contain"
                  />
                </button>
                {images.length > 1 && (
                  <div className="mt-2.5 max-w-full overflow-x-auto pb-1">
                    <ul className="flex w-max gap-2">
                      {images.map((img, i) => (
                        <li key={`${img.url}-${i}`} className="shrink-0">
                          <button
                            type="button"
                            onClick={() => setActive(i)}
                            aria-label={`Xem ảnh ${i + 1}`}
                            className={`h-14 w-14 shrink-0 overflow-hidden rounded border sm:h-16 sm:w-16 ${
                              i === active
                                ? 'border-blue-700 ring-1 ring-blue-700 dark:border-blue-500 dark:ring-blue-500'
                                : 'border-neutral-200 opacity-75 hover:opacity-100 dark:border-neutral-800'
                            }`}
                          >
                            <img src={cldUrl(img.url, { width: 160, height: 160, crop: 'fill' })} alt="" className="h-full w-full object-cover" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2.5 p-3">
                {safeVerificationUrl && (
                  <a
                    href={safeVerificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-[4/3] w-full overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-950"
                  >
                    <img
                      src={cldUrl(safeVerificationUrl, { width: 1200 })}
                      alt="Ảnh xác thực viết tay chính chủ"
                      className="h-full w-full object-contain"
                    />
                  </a>
                )}
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Ảnh sản phẩm kèm giấy viết tay ghi &ldquo;VAHA + ngày + tên Facebook&rdquo; đã được duyệt.
                </p>
              </div>
            )}
          </div>

          {/* Thông số & Mô tả */}
          <section className="card min-w-0 w-full divide-y divide-neutral-200 dark:divide-neutral-800">
            <div className="min-w-0 w-full p-4 sm:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Thông số &amp; Tình trạng
              </h2>
              <dl className="mt-3 min-w-0 w-full divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                {specs.map((s) => (
                  <div key={s.label} className="flex items-start justify-between gap-3 py-2">
                    <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">{s.label}</dt>
                    <dd className="min-w-0 break-words text-right font-medium text-neutral-900 dark:text-neutral-100">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="min-w-0 w-full p-4 sm:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Mô tả chi tiết
              </h2>
              <p className="mt-2.5 break-words whitespace-pre-line text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                {listing.description}
              </p>
            </div>
          </section>
        </div>

        {/* CỘT PHẢI (40%): Sticky Purchase Panel */}
        <aside className="min-w-0 w-full space-y-4 lg:sticky lg:top-20">
          <div className="card space-y-4 p-4 sm:p-5">
            <div>
              <h1 className="text-lg font-semibold leading-snug tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-xl">
                {listing.title}
              </h1>
              <div className="mt-2">
                <PriceTag
                  size="lg"
                  display={dp.display}
                  strike={dp.strike}
                  percent={dp.percent}
                  feePromo={dp.feePromo}
                  note={fees.buyerFee > 0 ? 'Giá trọn gói đã bao gồm phí trung gian' : undefined}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5 text-xs">
                {listing.province && (
                  <span className="badge gap-1">
                    <MapPin size={12} strokeWidth={1.75} /> {listing.province}
                  </span>
                )}
                {listing.ship_cod && (
                  <span className="badge gap-1">
                    <Truck size={12} strokeWidth={1.75} /> Gửi hàng toàn quốc
                  </span>
                )}
                {listing.verification_image_url && (
                  <span className="badge gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <BadgeCheck size={12} strokeWidth={1.75} /> Ảnh xác thực
                  </span>
                )}
              </div>
            </div>

            {canBuy && (
              <PriceBreakdown
                listPrice={fees.listPrice}
                buyerFee={fees.buyerFee}
                total={fees.buyerPays}
                feePayer={listing.fee_payer}
                feeRateBp={fees.feeRateBp}
                waivedReason={sellerIsMod ? 'Mod' : undefined}
                isFeeCapped={fees.isFeeCapped}
                feeCapVnd={fees.feeCapVnd}
                feeSavedAmount={fees.feeSavedAmount}
              />
            )}

            {/* Hành động mua */}
            {listing.status !== 'active' ? (
              <Alert kind="info">
                {isOwner ? STATUS_TEXT[listing.status] ?? `Trạng thái: ${listing.status}.` : 'Sản phẩm không còn mở bán.'}
              </Alert>
            ) : isOwner ? (
              <div className="space-y-2">
                <Alert kind="info">Đây là tin của bạn.</Alert>
                <Link to={`/sell/${listing.id}/edit`} className="btn-secondary w-full">
                  Sửa tin
                </Link>
              </div>
            ) : !listing.ship_cod ? (
              <div className="space-y-2">
                <Alert kind="info">
                  Tin chỉ gặp trực tiếp{listing.province ? ` tại ${listing.province}` : ''}. Xem Facebook hoặc nhắn người bán bên dưới.
                </Alert>
                <button
                  type="button"
                  disabled={chatBusy !== null}
                  onClick={async () => {
                    if (!user) {
                      void signIn();
                      return;
                    }
                    setChatBusy('chat');
                    setChatError(null);
                    try {
                      const cid = await startOrGetConversation(listing.id);
                      navigate(`/messages/${cid}`);
                    } catch (err) {
                      setChatError(getErrorMessage(err));
                      setChatBusy(null);
                    }
                  }}
                  className="btn-secondary w-full py-2 text-xs font-semibold"
                >
                  {chatBusy === 'chat' ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                  {user ? 'Nhắn người bán' : 'Đăng nhập để nhắn tin'}
                </button>
                {chatError && <Alert kind="error">{chatError}</Alert>}
              </div>
            ) : (
              <div className="space-y-2">
                {acceptedOffer && (
                  <div className="space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs dark:border-emerald-800 dark:bg-emerald-950/40">
                    <div className="flex items-center justify-between gap-2 text-emerald-900 dark:text-emerald-200">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <Tag size={13} /> Giá đã chốt riêng với bạn
                      </span>
                      <strong className="text-sm tabular-nums">{formatVND(acceptedOffer.offered_price)}</strong>
                    </div>
                    <button
                      type="button"
                      className="btn-primary w-full py-2 text-xs font-semibold"
                      onClick={() => {
                        setUseAcceptedOfferInBuy(true);
                        setBuyOpen(true);
                      }}
                    >
                      <ShieldCheck size={15} strokeWidth={1.75} />
                      Đặt mua với giá đã chốt ({formatVND(acceptedOffer.offered_price)})
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className={acceptedOffer ? 'btn-secondary w-full py-2 text-xs font-semibold' : 'btn-primary w-full py-2.5 text-sm font-semibold'}
                  onClick={() => {
                    if (!user) {
                      void signIn();
                      return;
                    }
                    setUseAcceptedOfferInBuy(false);
                    setBuyOpen(true);
                  }}
                >
                  <ShieldCheck size={17} strokeWidth={1.75} />
                  {user
                    ? acceptedOffer
                      ? `Đặt mua giá niêm yết (${formatVND(listing.price)})`
                      : 'Đặt mua qua trung gian'
                    : 'Đăng nhập để đặt mua'}
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={chatBusy !== null}
                    onClick={async () => {
                      if (!user) {
                        void signIn();
                        return;
                      }
                      setChatBusy('chat');
                      setChatError(null);
                      try {
                        const cid = await startOrGetConversation(listing.id);
                        navigate(`/messages/${cid}`);
                      } catch (err) {
                        setChatError(getErrorMessage(err));
                        setChatBusy(null);
                      }
                    }}
                    className="btn-secondary h-9 px-2.5 text-xs"
                  >
                    {chatBusy === 'chat' ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                    Nhắn người bán
                  </button>
                  <button
                    type="button"
                    disabled={chatBusy !== null}
                    onClick={async () => {
                      if (!user) {
                        void signIn();
                        return;
                      }
                      setChatBusy('offer');
                      setChatError(null);
                      try {
                        const cid = await startOrGetConversation(listing.id);
                        navigate(`/messages/${cid}?offer=1`);
                      } catch (err) {
                        setChatError(getErrorMessage(err));
                        setChatBusy(null);
                      }
                    }}
                    className="btn-secondary h-9 px-2.5 text-xs"
                  >
                    {chatBusy === 'offer' ? <Loader2 size={14} className="animate-spin" /> : <Tag size={14} />}
                    Trả giá
                  </button>
                </div>

                {chatError && <Alert kind="error">{chatError}</Alert>}

                <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
                  Đặt mua đồng nghĩa đồng ý với{' '}
                  <Link to="/terms" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                    Điều khoản sử dụng
                  </Link>
                  .
                </p>
              </div>
            )}

            {canBuy && <BuyerProtectionSteps layout="compact" />}
          </div>

          {/* Thông tin người bán */}
          {seller && (
            <div className="card space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Link to={`/u/${listing.seller_id}`} className="shrink-0">
                  <Avatar name={seller.display_name} url={seller.avatar_url} size={40} />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                    <Link to={`/u/${listing.seller_id}`} className="truncate hover:underline">
                      {seller.display_name}
                    </Link>
                    {seller.is_mod && <ModBadge />}
                  </p>
                  <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                    Đã bán <strong className="text-neutral-800 dark:text-neutral-200">{seller.sold_count}</strong> đơn · Đã đối chiếu FB &amp; NH
                  </p>
                  <div className="mt-0.5">
                    <Link
                      to={`/u/${listing.seller_id}?tab=reviews`}
                      className="inline-flex items-center hover:underline"
                    >
                      <RatingSummaryBadge
                        avg={seller.seller_rating_avg}
                        count={seller.seller_rating_count}
                      />
                    </Link>
                  </div>
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Link to={`/u/${listing.seller_id}`} className="btn-secondary w-full text-xs">
                  <Store size={13} strokeWidth={1.75} /> Xem gian hàng
                </Link>
                {safeFacebookUrl ? (
                  <a
                    href={safeFacebookUrl}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="btn-secondary w-full text-xs"
                  >
                    Facebook <ExternalLink size={13} strokeWidth={1.75} />
                  </a>
                ) : (
                  <span className="flex items-center justify-center rounded-md border border-neutral-200 px-2 py-1.5 text-xs text-neutral-400 dark:border-neutral-800">
                    Chưa có Facebook
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Chia sẻ, lưu tin & báo cáo */}
          <div className="card space-y-2 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
              <Share2 size={14} strokeWidth={1.75} className="text-blue-700 dark:text-blue-400" />
              Chia sẻ &amp; Tương tác
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void handleCopyShare('link')}
                className="btn-secondary h-8 px-2.5 text-xs"
              >
                {copiedMode === 'link' ? <Check size={14} strokeWidth={2} className="text-emerald-600" /> : <Copy size={14} strokeWidth={1.75} />}
                {copiedMode === 'link' ? 'Đã chép' : 'Chép liên kết'}
              </button>
              <button
                type="button"
                onClick={() => void handleCopyShare('snippet')}
                className="btn-secondary h-8 px-2.5 text-xs"
              >
                {copiedMode === 'snippet' ? <Check size={14} strokeWidth={2} className="text-emerald-600" /> : <Share2 size={14} strokeWidth={1.75} />}
                {copiedMode === 'snippet' ? 'Đã chép' : 'Mẫu chia sẻ'}
              </button>
              {listing.status === 'active' && (
                <button
                  type="button"
                  onClick={() => void toggleSave(listing.id)}
                  className={`h-8 px-2.5 text-xs ${
                    isSaved(listing.id)
                      ? 'btn border border-blue-600 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'btn-secondary'
                  }`}
                >
                  <Bookmark size={14} strokeWidth={1.75} className={isSaved(listing.id) ? 'fill-current' : ''} />
                  {isSaved(listing.id) ? 'Đã lưu tin' : 'Lưu tin'}
                </button>
              )}
              {listing.status === 'active' && !isOwner && (
                <button
                  type="button"
                  onClick={() => (user ? setReportOpen(true) : void signIn())}
                  className="btn-secondary h-8 px-2.5 text-xs text-red-700 dark:text-red-400"
                >
                  <Flag size={13} strokeWidth={1.75} /> Báo cáo tin
                </button>
              )}
            </div>
          </div>

          {/* Công cụ quản trị nhanh dành cho Admin */}
          {isAdmin && (
            <div className="card space-y-2.5 border-blue-200 p-4 dark:border-blue-900/70">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                  <ShieldCheck size={14} strokeWidth={1.75} className="text-blue-700 dark:text-blue-400" />
                  Quản trị tin đăng
                </p>
                <Link to="/admin?tab=listings" className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400">
                  Mở quản trị
                </Link>
              </div>
              {adminNotice && <Alert kind="success">{adminNotice}</Alert>}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setInspectSellerId(listing.seller_id)}
                  className="btn-secondary h-8 px-2.5 text-xs"
                >
                  <Eye size={13} strokeWidth={1.75} /> Hồ sơ người bán
                </button>
                {listing.status !== 'reserved' && listing.status !== 'sold' && listing.status !== 'removed' && (
                  <button
                    type="button"
                    onClick={() => setAdminModMode('remove')}
                    className="btn-secondary h-8 px-2.5 text-xs text-amber-800 dark:text-amber-300"
                  >
                    <Ban size={13} strokeWidth={1.75} /> Gỡ tin
                  </button>
                )}
                {listing.status !== 'reserved' && listing.status !== 'sold' && (
                  <button
                    type="button"
                    onClick={() => setAdminModMode('delete')}
                    className="btn-ghost col-span-2 h-8 border border-red-200 px-2.5 text-xs text-red-700 hover:bg-red-50 dark:border-red-900/70 dark:text-red-400 dark:hover:bg-red-950/50"
                  >
                    <Trash2 size={13} strokeWidth={1.75} /> Xóa vĩnh viễn tin này
                  </button>
                )}
              </div>
            </div>
          )}

          <p className="px-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Quay video mở hộp đủ 6 mặt khi nhận hàng. Chỉ chuyển khoản qua mã QR trên đơn.
          </p>
        </aside>
      </div>

      {/* Sản phẩm cùng phân loại (giữ chân người xem từ link chia sẻ) */}
      {related.length > 0 && (
        <section className="space-y-3 pt-2" aria-label="Sản phẩm cùng phân loại">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold tracking-tight text-neutral-950 dark:text-neutral-50">
              Sản phẩm cùng phân loại
            </h2>
            <Link
              to={`/?category=${encodeURIComponent(listing.category)}`}
              className="text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
            >
              Xem thêm →
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {related.map((item) => (
              <li key={item.id} className="min-w-0">
                <Link
                  to={`/listing/${item.id}`}
                  className="card flex h-full flex-col overflow-hidden transition-colors hover:border-neutral-400 dark:hover:border-neutral-600"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                    {item.images[0] && (
                      <img
                        src={cldUrl(item.images[0].url, { width: 420, height: 315, crop: 'fill' })}
                        alt={item.title}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-2.5">
                    <p className="line-clamp-2 min-h-[2.25rem] text-xs font-medium leading-snug text-neutral-950 dark:text-neutral-100 sm:text-sm">
                      {item.title}
                    </p>
                    <p className="mt-1.5 text-sm font-semibold tabular-nums text-neutral-950 dark:text-neutral-50">
                      {formatVND(item.price)}
                    </p>
                    <p className="mt-auto pt-1.5 truncate text-[11px] text-neutral-500 dark:text-neutral-400">
                      {item.province ?? 'Toàn quốc'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 rounded-md bg-white/10 p-2 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
            aria-label="Đóng"
          >
            <X size={20} strokeWidth={1.75} />
          </button>
          {images.length > 1 && (
            <>
              <button
                type="button"
                className="absolute left-3 rounded-md bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Ảnh trước"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lightbox - 1 + images.length) % images.length);
                }}
              >
                <ChevronLeft size={24} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="absolute right-3 rounded-md bg-white/10 p-2 text-white hover:bg-white/20"
                aria-label="Ảnh sau"
                onClick={(e) => {
                  e.stopPropagation();
                  setLightbox((lightbox + 1) % images.length);
                }}
              >
                <ChevronRight size={24} strokeWidth={1.75} />
              </button>
            </>
          )}
          <img
            src={cldUrl(images[lightbox].url, { width: 1800 })}
            alt=""
            className="max-h-[90vh] max-w-[92vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="absolute bottom-4 rounded bg-black/70 px-2.5 py-1 text-xs tabular-nums text-white">
            {lightbox + 1} / {images.length}
          </span>
        </div>
      )}

      {/* Thanh đặt mua cố định dưới cùng cho Mobile (Thumb-zone) */}
      {canBuy && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-white/95 px-4 py-2.5 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95 lg:hidden">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0 tabular-nums">
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Tổng thanh toán</p>
              <p className="truncate text-base font-semibold text-neutral-950 dark:text-neutral-50">
                {formatVND(fees.buyerPays)}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                disabled={chatBusy !== null}
                aria-label="Nhắn người bán"
                onClick={async () => {
                  if (!user) {
                    void signIn();
                    return;
                  }
                  setChatBusy('chat');
                  setChatError(null);
                  try {
                    const cid = await startOrGetConversation(listing.id);
                    navigate(`/messages/${cid}`);
                  } catch (err) {
                    setChatError(getErrorMessage(err));
                    setChatBusy(null);
                  }
                }}
                className="btn-secondary h-10 px-3 text-xs"
              >
                {chatBusy === 'chat' ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}
                Nhắn
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    void signIn();
                    return;
                  }
                  setUseAcceptedOfferInBuy(Boolean(acceptedOffer));
                  setBuyOpen(true);
                }}
                className="btn-primary shrink-0 px-4 py-2.5 text-xs font-semibold sm:text-sm"
              >
                <ShieldCheck size={16} strokeWidth={1.75} />
                {user ? (acceptedOffer ? 'Mua giá chốt' : 'Đặt mua') : 'Đăng nhập để mua'}
              </button>
            </div>
          </div>
        </div>
      )}

      {buyOpen && (
        <BuyDialog
          listing={listing}
          sellerIsMod={sellerIsMod}
          acceptedOffer={useAcceptedOfferInBuy ? acceptedOffer : null}
          onClose={() => {
            setBuyOpen(false);
            setUseAcceptedOfferInBuy(false);
          }}
        />
      )}

      {reportOpen && (
        <ReportListingModal
          listingId={listing.id}
          listingTitle={listing.title}
          onClose={() => setReportOpen(false)}
        />
      )}

      {isAdmin && adminModMode && (
        <Suspense fallback={null}>
          <ListingModerationModal
            mode={adminModMode}
            listing={listing}
            sellerName={seller?.display_name}
            sellerIsBanned={seller?.is_banned}
            sellerWarningCount={seller?.warning_count}
            onClose={() => setAdminModMode(null)}
            onDone={(res) => {
              const wasDelete = adminModMode === 'delete';
              setAdminModMode(null);
              if (wasDelete) {
                navigate('/admin?tab=listings');
                return;
              }
              if (res.listing) setListing(res.listing);
              setAdminNotice('Đã gỡ tin đăng khỏi sàn.');
            }}
          />
        </Suspense>
      )}

      {isAdmin && inspectSellerId && (
        <Suspense fallback={null}>
          <MemberDetailModal
            userId={inspectSellerId}
            onClose={() => setInspectSellerId(null)}
            onSelectUser={(uid) => setInspectSellerId(uid)}
          />
        </Suspense>
      )}

      <AcceptedOfferLoader
        userId={user?.id ?? null}
        listingId={listing.id}
        sellerId={listing.seller_id}
        status={listing.status}
        onLoaded={setAcceptedOffer}
      />
    </div>
  );
}

function AcceptedOfferLoader({
  userId,
  listingId,
  sellerId,
  status,
  onLoaded,
}: {
  userId: string | null;
  listingId: string;
  sellerId: string;
  status: Listing['status'];
  onLoaded: (offer: PriceOffer | null) => void;
}) {
  useEffect(() => {
    if (!userId || userId === sellerId || status !== 'active') {
      onLoaded(null);
      return;
    }
    let alive = true;
    getListingAcceptedOffer(listingId).then((offer) => {
      if (alive) onLoaded(offer);
    });
    return () => {
      alive = false;
    };
  }, [userId, listingId, sellerId, status, onLoaded]);

  return null;
}
