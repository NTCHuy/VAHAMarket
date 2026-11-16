import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ExternalLink, Facebook, Loader2, MapPin, Package, ShieldCheck, Truck, Video, X,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { calcFees, formatVND, type FeeBreakdown } from '@/lib/money';
import { getFeePayerLabel } from '@/constants/fees';
import { createOrder, getSellerFacebook } from '@/lib/orders';
import { getErrorMessage } from '@/lib/errors';
import { getBoxStatusLabel, getCategory, getConditionLabel } from '@/constants/categories';
import { Alert, Avatar, Field, PageLoader } from '@/components/ui';
import BuyerProtectionSteps from '@/components/BuyerProtectionSteps';
import ModBadge from '@/components/ModBadge';
import PriceTag from '@/components/PriceTag';
import TrustBadge from '@/components/TrustBadge';
import type { Listing, Profile } from '@/types';

const PHONE_RE = /^[0-9+ ]{8,15}$/;

export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, signIn } = useAuth();
  const [listing, setListing] = useState<Listing | null>(null);
  const [seller, setSeller] = useState<Profile | null>(null);
  const [facebook, setFacebook] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setError(null);
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

  // Điều khiển lightbox bằng bàn phím
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
        <p className="mt-1 text-sm text-slate-600">Tin đăng không tồn tại, đã bán hoặc đang bị ẩn.</p>
        <Link to="/" className="btn-primary mt-4">Về trang chủ</Link>
      </div>
    );
  }

  const isOwner = user?.id === listing.seller_id;
  const images = listing.images;
  const canBuy = listing.status === 'active' && listing.ship_cod && !isOwner;
  const category = getCategory(listing.category);
  const sellerIsMod = seller?.is_mod ?? false;
  const fees = calcFees(listing.price, listing.fee_payer, sellerIsMod);

  const specs: { label: string; value: string }[] = [
    { label: 'Phân loại', value: category?.label ?? listing.category },
    ...(listing.brand ? [{ label: 'Thương hiệu', value: listing.brand }] : []),
    { label: 'Tình trạng ngoại hình', value: getConditionLabel(listing.condition) },
    { label: 'Hộp & phụ kiện', value: getBoxStatusLabel(listing.box_status) },
    { label: 'Giao dịch trực tiếp', value: listing.province ?? 'Không (chỉ gửi hàng)' },
    { label: 'Ship COD', value: listing.ship_cod ? 'Có – người mua trả phí ship cho bưu tá' : 'Không' },
    { label: 'Đăng ngày', value: new Date(listing.created_at).toLocaleDateString('vi-VN') },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Tất cả sản phẩm</Link>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Gallery */}
        <div className="space-y-3">
          <button type="button" onClick={() => setLightbox(active)} className="block aspect-square w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100" aria-label="Phóng to ảnh">
            <img src={cldUrl(images[active]?.url ?? '', { width: 1000 })} alt={listing.title} className="h-full w-full object-contain" />
          </button>
          {images.length > 1 && (
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {images.map((img, i) => (
                <li key={`${img.url}-${i}`}>
                  <button type="button" onClick={() => setActive(i)} aria-label={`Xem ảnh ${i + 1}`}
                    className={`h-16 w-16 overflow-hidden rounded-lg border-2 ${i === active ? 'border-brand-600' : 'border-transparent'}`}>
                    <img src={cldUrl(img.url, { width: 160, height: 160, crop: 'fill' })} alt="" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Thông tin & mua */}
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">{listing.title}</h1>
            <div className="mt-2"><PriceTag price={listing.price} originalPrice={listing.original_price} size="lg" /></div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
              {listing.province && <span className="badge"><MapPin className="mr-1 h-3 w-3" />{listing.province}</span>}
              {listing.ship_cod && <span className="badge"><Truck className="mr-1 h-3 w-3" />Ship COD</span>}
            </div>
          </div>

          {/* Nút mua */}
          <div className="card space-y-3 p-4">
            {listing.status !== 'active' ? (
              <Alert kind="info">{isOwner ? `Tin của bạn đang ở trạng thái “${listing.status}”.` : 'Sản phẩm này hiện không thể mua.'}</Alert>
            ) : isOwner ? (
              <>
                <Alert kind="info">Đây là tin đăng của bạn.</Alert>
                <Link to={`/sell/${listing.id}/edit`} className="btn-secondary w-full">Sửa tin</Link>
              </>
            ) : !listing.ship_cod ? (
              <Alert kind="info">Tin này chỉ giao dịch trực tiếp{listing.province ? ` tại ${listing.province}` : ''}, không mua qua trung gian được. Hãy liên hệ người bán qua Facebook.</Alert>
            ) : user ? (
              <button type="button" className="btn-primary w-full py-3 text-base" onClick={() => setBuyOpen(true)}>
                <ShieldCheck className="h-5 w-5" /> Mua qua trung gian ngay
              </button>
            ) : (
              <button type="button" className="btn-primary w-full py-3 text-base" onClick={() => void signIn()}>
                Đăng nhập để mua qua trung gian
              </button>
            )}
            {canBuy && (
              <>
                <FeeSummary fees={fees} feePayer={listing.fee_payer} isMod={sellerIsMod} />
                <BuyerProtectionSteps compact />
                <p className="text-xs text-slate-500">Phí ship trả cho bưu tá khi nhận hàng (không tính vào số tiền chuyển cho trung gian).</p>
              </>
            )}
          </div>

          {/* Người bán */}
          {seller && (
            <div className="card p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Người bán</p>
              <div className="flex items-center gap-3">
                <Avatar name={seller.display_name} url={seller.avatar_url} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900"><span className="truncate">{seller.display_name}</span>{seller.is_mod && <ModBadge full />}</p>
                  <p className="text-sm text-slate-600">Đã bán thành công <strong>{seller.sold_count}</strong> đơn</p>
                </div>
              </div>
              {facebook ? (
                <a href={facebook} target="_blank" rel="noopener noreferrer nofollow" className="btn-secondary mt-3 w-full">
                  <Facebook className="h-4 w-4 text-[#1877F2]" /> Xem Facebook người bán <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
              ) : (
                <p className="mt-3 text-xs text-slate-500">Người bán chưa cung cấp link Facebook.</p>
              )}
              <p className="mt-2 text-xs text-slate-500">Hãy tìm tên người bán trong group để kiểm tra uy tín trước khi mua.</p>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <section className="card space-y-4 p-5">
          <h2 className="text-base font-semibold">Thông số & tình trạng</h2>
          <dl className="divide-y divide-slate-100 text-sm">
            {specs.map((s) => (
              <div key={s.label} className="flex justify-between gap-4 py-2">
                <dt className="text-slate-500">{s.label}</dt>
                <dd className="text-right font-medium text-slate-900">{s.value}</dd>
              </div>
            ))}
          </dl>
          <h2 className="pt-2 text-base font-semibold">Mô tả</h2>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{listing.description}</p>
        </section>

        <section className="card h-fit space-y-3 border-amber-200 bg-amber-50/50 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-amber-900"><ShieldCheck className="h-5 w-5" /> Quy định giao dịch an toàn</h2>
          <ul className="space-y-2 text-sm text-amber-900">
            <li className="flex gap-2"><Package className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>Bắt buộc quay video mở hộp liền mạch</strong> từ lúc bưu kiện còn nguyên niêm phong đến khi test sản phẩm. Đây là bằng chứng duy nhất để khiếu nại.</span></li>
            <li className="flex gap-2"><Video className="mt-0.5 h-4 w-4 shrink-0" /><span>Người bán phải quay video test sản phẩm trước khi đóng gói và gửi link cho người mua.</span></li>
            <li className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><span>Chỉ chuyển tiền qua mã QR trong đơn hàng. <strong>Không chuyển khoản riêng</strong> cho người bán.</span></li>
            <li className="flex gap-2"><Truck className="mt-0.5 h-4 w-4 shrink-0" /><span>Chỉ bấm “Đã nhận hàng” sau khi kiểm tra kỹ. Khi xác nhận, tiền được giải ngân cho người bán.</span></li>
          </ul>
          <div className="border-t border-amber-200 pt-3"><TrustBadge compact /></div>
        </section>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div role="dialog" aria-modal="true" aria-label="Xem ảnh" className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setLightbox(null)}>
          <button type="button" className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setLightbox(null)} aria-label="Đóng"><X className="h-6 w-6" /></button>
          {images.length > 1 && (
            <>
              <button type="button" className="absolute left-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Ảnh trước"
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox - 1 + images.length) % images.length); }}><ChevronLeft className="h-7 w-7" /></button>
              <button type="button" className="absolute right-3 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" aria-label="Ảnh sau"
                onClick={(e) => { e.stopPropagation(); setLightbox((lightbox + 1) % images.length); }}><ChevronRight className="h-7 w-7" /></button>
            </>
          )}
          <img src={cldUrl(images[lightbox].url, { width: 1800 })} alt="" className="max-h-[90vh] max-w-[92vw] object-contain" onClick={(e) => e.stopPropagation()} />
          <span className="absolute bottom-4 rounded-full bg-black/60 px-3 py-1 text-xs text-white">{lightbox + 1} / {images.length}</span>
        </div>
      )}

      {buyOpen && <BuyDialog listing={listing} buyerPays={fees.buyerPays} onClose={() => setBuyOpen(false)} />}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 *  Hộp thoại xác nhận mua: kiểm tra/nhắc cập nhật SĐT + địa chỉ trước khi gọi create_order
 * -------------------------------------------------------------------------- */
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
    if (address.trim().length < 10 || address.trim().length > 400) next.address = 'Địa chỉ nhận hàng 10–400 ký tự (ghi đủ số nhà, phường/xã, tỉnh/thành).';
    if (!agree) next.agree = 'Bạn cần đồng ý với quy định giao dịch.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    setError(null);
    try {
      if (saveProfile) {
        // Lưu nhanh vào hồ sơ; nếu lỗi vẫn tiếp tục đặt hàng
        await supabase.from('profile_contacts').update({ phone: phone.trim(), shipping_address: address.trim() }).eq('user_id', user.id);
        void refresh();
      }
      const order = await createOrder({
        listingId: listing.id,
        recipientName: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        note: note.trim() || undefined,
      });
      navigate(`/orders/${order.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Xác nhận đặt mua" className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <form onSubmit={onSubmit} noValidate className="max-h-[92vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-pop sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Xác nhận đặt mua</h2>
            <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">{listing.title}</p>
          </div>
          <button type="button" className="btn-ghost px-2" onClick={onClose} disabled={busy} aria-label="Đóng"><X className="h-5 w-5" /></button>
        </div>

        {missing && <Alert kind="info">Hồ sơ của bạn chưa có số điện thoại hoặc địa chỉ nhận hàng. Điền nhanh bên dưới, bạn có thể lưu lại để lần sau tự điền.</Alert>}

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

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-700" />
          Lưu số điện thoại và địa chỉ này vào hồ sơ
        </label>

        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Số tiền chuyển vào trung gian</span><strong>{formatVND(buyerPays)}</strong></div>
          <p className="mt-1 text-xs text-slate-500">Bạn có 15 phút để thanh toán sau khi đặt. Phí ship trả cho bưu tá khi nhận hàng.</p>
        </div>

        <div>
          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700" />
            <span>Tôi đã đọc quy định giao dịch an toàn và cam kết <strong>quay video mở hộp liền mạch</strong> khi nhận hàng.</span>
          </label>
          {errors.agree && <p className="mt-1 text-xs text-red-600">{errors.agree}</p>}
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Hủy</button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận đặt mua
          </button>
        </div>
      </form>
    </div>
  );
}

/* Bảng tóm tắt giá minh bạch: người mua chuyển bao nhiêu, người bán nhận bao nhiêu */
function FeeSummary({ fees, feePayer, isMod }: { fees: FeeBreakdown; feePayer: Listing['fee_payer']; isMod: boolean }) {
  return (
    <div className="space-y-2">
      <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-sm">
        <div className="flex justify-between px-3 py-2"><dt className="text-slate-600">Giá niêm yết</dt><dd className="font-medium text-slate-900">{formatVND(fees.listPrice)}</dd></div>
        {fees.buyerFee > 0 && (
          <div className="flex justify-between px-3 py-2"><dt className="text-slate-600">Phí trung gian (bạn chịu)</dt><dd className="font-medium text-slate-900">+ {formatVND(fees.buyerFee)}</dd></div>
        )}
        <div className="flex justify-between px-3 py-2.5"><dt className="font-medium text-slate-900">Bạn chuyển khoản</dt><dd className="text-base font-semibold text-brand-800">{formatVND(fees.buyerPays)}</dd></div>
        <div className="flex justify-between px-3 py-2"><dt className="text-slate-500">Người bán thực nhận</dt><dd className="text-slate-700">{formatVND(fees.sellerReceives)}</dd></div>
      </dl>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
        {isMod ? <ModBadge full /> : <span>Phí trung gian {fees.feeRateBp / 100}%: {getFeePayerLabel(feePayer).toLowerCase()}.</span>}
      </p>
    </div>
  );
}
