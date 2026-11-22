import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Loader2,
  MapPin,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { calcFees, formatVND, getDisplayPrice } from '@/lib/money';
import { createOrder, getSellerFacebook } from '@/lib/orders';
import { getErrorMessage } from '@/lib/errors';
import { getBoxStatusLabel, getCategory, getConditionLabel } from '@/constants/categories';
import { Alert, Avatar, Field, PageLoader } from '@/components/ui';
import BuyerProtectionSteps from '@/components/BuyerProtectionSteps';
import ModBadge from '@/components/ModBadge';
import PriceBreakdown from '@/components/PriceBreakdown';
import PriceTag from '@/components/PriceTag';
import { usePlatformSettings } from '@/context/PlatformSettingsContext';
import type { Listing, Profile } from '@/types';

const STATUS_TEXT: Partial<Record<Listing['status'], string>> = {
  pending_review: 'Tin đang chờ Admin duyệt nên chưa hiển thị công khai.',
  rejected: 'Tin bị từ chối. Mở “Sửa tin” để xem lý do và gửi duyệt lại.',
  draft: 'Tin đang ở trạng thái nháp, chỉ mình bạn nhìn thấy.',
  hidden: 'Tin đang bị ẩn, chỉ mình bạn nhìn thấy.',
};

const PHONE_RE = /^[0-9+ ]{8,15}$/;

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, signIn } = useAuth();
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

  useEffect(() => {
    if (!id) return;
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
          const [p, fb] = await Promise.all([
            supabase.from('profiles').select('*').eq('id', l.seller_id).maybeSingle(),
            getSellerFacebook(l.seller_id),
          ]);
          if (!alive) return;
          setSeller((p.data as Profile | null) ?? null);
          setFacebook(fb);
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

  if (loading) return <PageLoader />;
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
    { label: 'Giao dịch trực tiếp', value: listing.province ?? 'Không (chỉ gửi hàng)' },
    { label: 'Ship COD', value: listing.ship_cod ? 'Có — người mua trả phí ship cho bưu tá' : 'Không' },
    { label: 'Ngày đăng', value: new Date(listing.created_at).toLocaleDateString('vi-VN') },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-950 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <ArrowLeft size={15} strokeWidth={1.75} /> Quay lại danh sách sản phẩm
      </Link>

      {/* Bố cục 2 cột chuẩn 60% / 40% */}
      <div className="grid items-start gap-6 lg:grid-cols-[3fr_2fr]">
        {/* CỘT TRÁI (60%): Gallery + Tab Ảnh xác thực viết tay + Thông số & Mô tả */}
        <div className="space-y-5">
          <div className="card overflow-hidden">
            {/* Tab chuyển đổi Ảnh sản phẩm / Ảnh xác thực viết tay */}
            {listing.verification_image_url && (
              <div className="flex border-b border-neutral-200 bg-neutral-50 text-xs font-medium dark:border-neutral-800 dark:bg-neutral-950">
                <button
                  type="button"
                  onClick={() => setGalleryTab('product')}
                  className={`flex-1 px-4 py-2.5 text-center transition-colors ${
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
                  className={`flex flex-1 items-center justify-center gap-1.5 px-4 py-2.5 text-center transition-colors ${
                    galleryTab === 'verification'
                      ? 'border-b-2 border-emerald-600 bg-white text-emerald-700 dark:border-emerald-500 dark:bg-neutral-900 dark:text-emerald-400'
                      : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
                  }`}
                >
                  <BadgeCheck size={14} strokeWidth={1.75} /> Ảnh xác thực viết tay chính chủ
                </button>
              </div>
            )}

            {galleryTab === 'product' ? (
              <div className="p-3">
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
                  <ul className="mt-2.5 flex gap-2 overflow-x-auto pb-0.5">
                    {images.map((img, i) => (
                      <li key={`${img.url}-${i}`} className="shrink-0">
                        <button
                          type="button"
                          onClick={() => setActive(i)}
                          aria-label={`Xem ảnh ${i + 1}`}
                          className={`h-14 w-16 overflow-hidden rounded border ${
                            i === active
                              ? 'border-blue-700 ring-1 ring-blue-700 dark:border-blue-500 dark:ring-blue-500'
                              : 'border-neutral-200 opacity-75 hover:opacity-100 dark:border-neutral-800'
                          }`}
                        >
                          <img src={cldUrl(img.url, { width: 160, height: 140, crop: 'fill' })} alt="" className="h-full w-full object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="space-y-2.5 p-3">
                <a
                  href={listing.verification_image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-[4/3] w-full overflow-hidden rounded-md bg-neutral-100 dark:bg-neutral-950"
                >
                  <img
                    src={cldUrl(listing.verification_image_url, { width: 1200 })}
                    alt="Ảnh xác thực viết tay chính chủ"
                    className="h-full w-full object-contain"
                  />
                </a>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Ảnh chụp thực tế sản phẩm cạnh giấy viết tay ghi &ldquo;VAHA + ngày đăng + tên Facebook&rdquo; đã qua kiểm duyệt.
                </p>
              </div>
            )}
          </div>

          {/* Thông số & Mô tả */}
          <section className="card divide-y divide-neutral-200 dark:divide-neutral-800">
            <div className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Thông số &amp; Tình trạng
              </h2>
              <dl className="mt-3 divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
                {specs.map((s) => (
                  <div key={s.label} className="flex justify-between gap-4 py-2">
                    <dt className="text-neutral-500 dark:text-neutral-400">{s.label}</dt>
                    <dd className="text-right font-medium text-neutral-900 dark:text-neutral-100">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="p-4 sm:p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                Mô tả chi tiết
              </h2>
              <p className="mt-2.5 whitespace-pre-line text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                {listing.description}
              </p>
            </div>
          </section>
        </div>

        {/* CỘT PHẢI (40%): Sticky Purchase Panel */}
        <aside className="space-y-4 lg:sticky lg:top-20">
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
                    <Truck size={12} strokeWidth={1.75} /> Ship COD
                  </span>
                )}
                {listing.verification_image_url && (
                  <span className="badge gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <BadgeCheck size={12} strokeWidth={1.75} /> Ảnh viết tay chính chủ
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
                waivedReason={sellerIsMod ? 'Mod Group' : undefined}
                isFeeCapped={fees.isFeeCapped}
                feeCapVnd={fees.feeCapVnd}
                feeSavedAmount={fees.feeSavedAmount}
              />
            )}

            {/* Hành động mua */}
            {listing.status !== 'active' ? (
              <Alert kind="info">
                {isOwner ? STATUS_TEXT[listing.status] ?? `Tin đang ở trạng thái “${listing.status}”.` : 'Sản phẩm này hiện không còn mở bán.'}
              </Alert>
            ) : isOwner ? (
              <div className="space-y-2">
                <Alert kind="info">Đây là tin đăng của bạn.</Alert>
                <Link to={`/sell/${listing.id}/edit`} className="btn-secondary w-full">
                  Chỉnh sửa tin đăng
                </Link>
              </div>
            ) : !listing.ship_cod ? (
              <Alert kind="info">
                Tin chỉ giao dịch trực tiếp{listing.province ? ` tại ${listing.province}` : ''}. Liên hệ người bán qua Facebook bên dưới.
              </Alert>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  className="btn-primary w-full py-2.5 text-sm font-semibold"
                  onClick={() => (user ? setBuyOpen(true) : void signIn())}
                >
                  <ShieldCheck size={17} strokeWidth={1.75} />
                  {user ? 'Đặt mua qua bảo lãnh sàn' : 'Đăng nhập để đặt mua qua bảo lãnh sàn'}
                </button>
                <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
                  Bằng việc đặt mua, bạn đồng ý với{' '}
                  <Link to="/terms" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                    Điều khoản dịch vụ
                  </Link>{' '}
                  của VAHA Market.
                </p>
              </div>
            )}

            {canBuy && <BuyerProtectionSteps compact />}
          </div>

          {/* Thông tin người bán */}
          {seller && (
            <div className="card space-y-3 p-4">
              <div className="flex items-center gap-3">
                <Avatar name={seller.display_name} url={seller.avatar_url} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                    <span className="truncate">{seller.display_name}</span>
                    {seller.is_mod && <ModBadge />}
                  </p>
                  <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                    Hoàn tất <strong className="text-neutral-800 dark:text-neutral-200">{seller.sold_count}</strong> đơn bán · Đã đối chiếu FB &amp; Ngân hàng
                  </p>
                </div>
              </div>
              {facebook ? (
                <a
                  href={facebook}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="btn-secondary w-full text-xs"
                >
                  Kiểm tra Facebook người bán <ExternalLink size={13} strokeWidth={1.75} />
                </a>
              ) : (
                <p className="text-xs text-neutral-500 dark:text-neutral-400">Chưa có link Facebook công khai.</p>
              )}
            </div>
          )}

          <p className="px-1 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
            Bắt buộc quay video mở hộp liền mạch 6 mặt khi nhận hàng để làm căn cứ đối soát. Không chuyển khoản riêng ngoài mã QR trên đơn.
          </p>
        </aside>
      </div>

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

      {buyOpen && <BuyDialog listing={listing} buyerPays={fees.buyerPays} onClose={() => setBuyOpen(false)} />}
    </div>
  );
}

function BuyDialog({ listing, buyerPays, onClose }: { listing: Listing; buyerPays: number; onClose: () => void }) {
  const { user, profile, contact, refresh } = useAuth();
  const navigate = useNavigate();
  const missing = !contact?.phone || !contact?.shipping_address;

  const [name, setName] = useState(profile?.display_name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [address, setAddress] = useState(contact?.shipping_address ?? '');
  const [note, setNote] = useState('');
  const [saveProfile, setSaveProfile] = useState(missing);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const next: Record<string, string> = {};
    if (name.trim().length < 2 || name.trim().length > 80) next.name = 'Tên người nhận 2–80 ký tự.';
    if (!PHONE_RE.test(phone.trim())) next.phone = 'Số điện thoại gồm 8–15 chữ số.';
    if (address.trim().length < 10 || address.trim().length > 400) next.address = 'Địa chỉ nhận hàng 10–400 ký tự.';
    if (!agree) next.agree = 'Bạn cần xác nhận quy định giao dịch.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setError(null);
    try {
      if (saveProfile) {
        await supabase.from('profile_contacts').update({ phone: phone.trim(), shipping_address: address.trim() }).eq('user_id', user.id);
        void refresh();
      }
      const order = await createOrder({
        listingId: listing.id,
        recipientName: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        note: note.trim() || undefined,
        expectedAmount: buyerPays,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xác nhận đặt mua"
      className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-950/60 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <form
        onSubmit={onSubmit}
        noValidate
        className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900 sm:rounded-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-neutral-200 pb-3 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-semibold">Xác nhận đặt mua</h2>
            <p className="mt-0.5 line-clamp-1 text-xs text-neutral-500 dark:text-neutral-400">{listing.title}</p>
          </div>
          <button type="button" className="btn-ghost px-1.5 py-1" onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {missing && <Alert kind="info">Điền SĐT và địa chỉ nhận hàng bên dưới để tiếp tục.</Alert>}

        <Field label="Tên người nhận" htmlFor="b-name" required error={errors.name}>
          <input id="b-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Số điện thoại" htmlFor="b-phone" required error={errors.phone}>
          <input id="b-phone" className="input" inputMode="tel" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Địa chỉ nhận hàng" htmlFor="b-address" required error={errors.address}>
          <textarea id="b-address" rows={2} className="input" value={address} maxLength={400} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Ghi chú cho người bán" htmlFor="b-note" hint="Không bắt buộc.">
          <input id="b-note" className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
          <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} className="h-4 w-4 rounded border-neutral-300 text-blue-700 dark:border-neutral-700" />
          Lưu SĐT và địa chỉ này vào hồ sơ
        </label>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm tabular-nums dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Tổng chuyển vào trung gian</span>
            <strong className="font-semibold text-neutral-950 dark:text-neutral-50">{formatVND(buyerPays)}</strong>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Hạn chuyển khoản: 15 phút. Phí ship trả riêng cho bưu tá.</p>
        </div>

        <div>
          <label className="flex items-start gap-2 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-700 dark:border-neutral-700" />
            <span>
              Tôi đồng ý với{' '}
              <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
                Điều khoản dịch vụ
              </Link>{' '}
              và cam kết <strong>quay video mở hộp liền mạch 6 mặt</strong> khi nhận hàng.
            </span>
          </label>
          {errors.agree && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.agree}</p>}
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Hủy</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />} Xác nhận đặt mua
          </button>
        </div>
      </form>
    </div>
  );
}
