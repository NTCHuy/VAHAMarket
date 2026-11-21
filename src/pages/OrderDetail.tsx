import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Clock, ExternalLink, Facebook, Loader2, PackageCheck, ShieldAlert, Truck, Video, XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getEscrowTransferInfo, tryBuildEscrowQrUrl } from '@/lib/vietqr';
import {
  cancelOrder, confirmReceived, expireOrderIfDue, getSellerFacebook, markShipped, openDispute, subscribeToOrder,
} from '@/lib/orders';
import { getErrorMessage } from '@/lib/errors';
import { CARRIERS } from '@/constants/orderStatus';
import { formatCountdown, useCountdown } from '@/hooks/useCountdown';
import BuyerProtectionSteps from '@/components/BuyerProtectionSteps';
import CopyButton from '@/components/CopyButton';
import ErrorBoundary from '@/components/ErrorBoundary';
import ModBadge from '@/components/ModBadge';
import PriceBreakdown from '@/components/PriceBreakdown';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import { Alert, Avatar, Field, PageLoader } from '@/components/ui';
import type { Order, OrderPayout, OrderStatus, Profile } from '@/types';

const URL_RE = /^https?:\/\/[^\s]+$/i;

const STEPS = ['Đặt mua', 'Thanh toán', 'Đang giao', 'Hoàn tất'] as const;
const STEP_INDEX: Partial<Record<OrderStatus, number>> = {
  PENDING_PAYMENT: 0, PAID_HELD: 1, SHIPPED: 2, COMPLETED: 3, PAID_OUT: 3,
};

const PAYOUT_LABEL: Record<OrderPayout['status'], string> = {
  NOT_READY: 'Chờ người mua xác nhận nhận hàng',
  PENDING: 'Chờ sàn chuyển khoản cho bạn',
  DONE: 'Sàn đã chuyển khoản cho bạn',
};

/** Bọc ErrorBoundary riêng cho trang đơn hàng: lỗi render không bao giờ làm trắng trang. */
export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <ErrorBoundary variant="inline" resetKey={id}>
      <OrderDetailContent />
    </ErrorBoundary>
  );
}

function OrderDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [counterpart, setCounterpart] = useState<Profile | null>(null);
  const [sellerFb, setSellerFb] = useState<string | null>(null);
  const [payout, setPayout] = useState<OrderPayout | null>(null);
  const [paidNotice, setPaidNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const orderRef = useRef<Order | null>(null);
  orderRef.current = order;
  const prevStatus = useRef<OrderStatus | null>(null);

  const isBuyer = !!order && user?.id === order.buyer_id;
  const isSeller = !!order && user?.id === order.seller_id;

  const fetchOrder = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('orders').select('*').eq('id', id).maybeSingle();
    if (error) {
      setLoadError(getErrorMessage(error));
      return;
    }
    setOrder((data as Order | null) ?? null);
  }, [id]);

  const tryExpire = useCallback(async () => {
    if (!id) return;
    try {
      setOrder(await expireOrderIfDue(id));
    } catch {
      /* im lặng: sẽ thử lại ở lần polling sau */
    }
  }, [id]);

  // Tải đơn lần đầu
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchOrder().finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fetchOrder]);

  // Supabase Realtime: webhook đổi trạng thái → UI cập nhật ngay
  useEffect(() => {
    if (!id) return;
    return subscribeToOrder(id, (changes) => setOrder((prev) => (prev ? { ...prev, ...changes } : prev)));
  }, [id]);

  // Dự phòng: polling khi đang chờ thanh toán + refetch khi quay lại tab
  const status = order?.status;
  useEffect(() => {
    if (status !== 'PENDING_PAYMENT') return;
    const tick = () => {
      void fetchOrder();
      const o = orderRef.current;
      if (o && Date.parse(o.expires_at) <= Date.now()) void tryExpire();
    };
    const timer = setInterval(tick, 8000);
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [status, fetchOrder, tryExpire]);

  // Phát hiện thanh toán thành công
  useEffect(() => {
    if (prevStatus.current === 'PENDING_PAYMENT' && status === 'PAID_HELD') setPaidNotice(true);
    prevStatus.current = status ?? null;
  }, [status]);

  // Đồng hồ đếm ngược; về 0 thì nhờ DB kiểm tra hạn
  const secondsLeft = useCountdown(status === 'PENDING_PAYMENT' && order ? order.expires_at : null);
  useEffect(() => {
    if (secondsLeft === 0 && status === 'PENDING_PAYMENT') void tryExpire();
  }, [secondsLeft, status, tryExpire]);

  // Thông tin đối tác + Facebook người bán (cho người mua)
  const buyerId = order?.buyer_id;
  const sellerId = order?.seller_id;
  useEffect(() => {
    if (!user || !buyerId || !sellerId) return;
    const otherId = user.id === buyerId ? sellerId : buyerId;
    let alive = true;
    supabase.from('profiles').select('*').eq('id', otherId).maybeSingle().then(({ data }) => alive && setCounterpart((data as Profile | null) ?? null));
    if (user.id === buyerId) getSellerFacebook(sellerId).then((fb) => alive && setSellerFb(fb));
    return () => {
      alive = false;
    };
  }, [user, buyerId, sellerId]);

  // Trạng thái giải ngân (chỉ người bán đọc được)
  useEffect(() => {
    if (!id || !isSeller) return;
    let alive = true;
    supabase.from('order_payouts').select('*').eq('order_id', id).maybeSingle().then(({ data }) => alive && setPayout((data as OrderPayout | null) ?? null));
    return () => {
      alive = false;
    };
  }, [id, isSeller, status]);

  /** Chạy 1 RPC, cập nhật đơn từ kết quả. Trả về true nếu thành công. */
  const run = async (fn: () => Promise<Order>): Promise<boolean> => {
    setBusy(true);
    setActionError(null);
    try {
      setOrder(await fn());
      return true;
    } catch (e) {
      setActionError(getErrorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <PageLoader />;
  if (loadError) return <div className="mx-auto max-w-2xl"><Alert kind="error">{loadError}</Alert></div>;
  if (!order || !id) {
    return (
      <div className="card mx-auto mt-8 max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Không tìm thấy đơn hàng</h1>
        <p className="mt-1 text-sm text-slate-600">Đơn không tồn tại hoặc bạn không phải người mua/bán của đơn này.</p>
        <Link to="/orders" className="btn-primary mt-4">Về danh sách đơn</Link>
      </div>
    );
  }

  const showShipping =
    isBuyer || (isSeller && ['PAID_HELD', 'SHIPPED', 'COMPLETED', 'PAID_OUT', 'DISPUTED'].includes(order.status));
  const step = STEP_INDEX[order.status];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link to="/orders" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft className="h-4 w-4" /> Đơn hàng của tôi</Link>

      {/* Tiêu đề */}
      <div className="card flex gap-3 p-4 sm:gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100">
          {order.listing_snapshot.image && <img src={cldUrl(order.listing_snapshot.image, { width: 200, height: 200, crop: 'fill' })} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium text-slate-900">{order.listing_snapshot.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <span className="text-xs text-slate-500">{isBuyer ? 'Đơn mua' : isSeller ? 'Đơn bán' : 'Xem với tư cách admin'}</span>
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            Mã đơn <span className="font-mono text-slate-700">{order.payment_code}</span> <CopyButton value={order.payment_code} />
          </p>
        </div>
      </div>

      {/* Tiến trình */}
      {step !== undefined && (
        <ol className="grid grid-cols-4 gap-1" aria-label="Tiến trình đơn hàng">
          {STEPS.map((label, i) => (
            <li key={label} className="text-center">
              <div className={`mx-auto h-1.5 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-slate-200'}`} />
              <span className={`mt-1 block text-xs ${i <= step ? 'font-medium text-slate-900' : 'text-slate-400'}`}>{label}</span>
            </li>
          ))}
        </ol>
      )}

      {actionError && <Alert kind="error">{actionError}</Alert>}

      {/* ------------------- Theo trạng thái ------------------- */}
      {order.status === 'PENDING_PAYMENT' && isBuyer && (
        <PaymentPanel order={order} secondsLeft={secondsLeft} busy={busy} onCancel={() => run(() => cancelOrder(order.id))} />
      )}
      {order.status === 'PENDING_PAYMENT' && isSeller && (
        <Alert kind="info">Đang chờ người mua thanh toán vào tài khoản trung gian. Bạn chưa cần gửi hàng.</Alert>
      )}

      {order.status === 'PAID_HELD' && isBuyer && (
        <Alert kind="success">
          <p className="font-medium">{paidNotice ? 'Thanh toán thành công!' : 'Sàn đã nhận tiền của bạn.'}</p>
          <p className="mt-0.5">Số tiền đang được sàn giữ an toàn. Đang chờ người bán đóng gói và gửi hàng — bạn sẽ thấy mã vận đơn tại đây.</p>
        </Alert>
      )}
      {order.status === 'PAID_HELD' && isSeller && (
        <ShipForm order={order} busy={busy} onSubmit={(input) => run(() => markShipped(order.id, input))} />
      )}

      {order.status === 'SHIPPED' && (
        <ShippedPanel order={order} isBuyer={isBuyer} busy={busy}
          onConfirm={() => run(() => confirmReceived(order.id))}
          onDispute={(reason, video) => run(() => openDispute(order.id, reason, video))} />
      )}

      {order.status === 'COMPLETED' && <Alert kind="success">Đơn đã hoàn tất giao nhận. {isSeller ? 'Sàn sẽ chuyển tiền cho bạn trong thời gian sớm nhất.' : 'Cảm ơn bạn đã mua hàng!'}</Alert>}
      {order.status === 'PAID_OUT' && <Alert kind="success">Đơn hàng đã hoàn tất{isSeller ? ' và tiền đã được chuyển cho bạn.' : '.'}</Alert>}
      {order.status === 'CANCELLED' && <Alert kind="info">Đơn đã bị hủy{order.cancel_reason ? `: ${order.cancel_reason}` : '.'}</Alert>}
      {order.status === 'EXPIRED' && (
        <Alert kind="info">
          Đơn đã hết hạn thanh toán và sản phẩm được mở bán lại. Nếu bạn đã lỡ chuyển tiền sau khi hết hạn, hãy liên hệ admin kèm mã đơn <strong>{order.payment_code}</strong> để được hoàn tiền.
        </Alert>
      )}
      {order.status === 'DISPUTED' && <DisputeInfo order={order} />}
      {order.status === 'REFUNDED' && <Alert kind="info">Đơn đã được hoàn tiền cho người mua.</Alert>}

      {/* Thông tin chi tiết */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="card space-y-3 p-5">
          <h2 className="text-base font-semibold">Thanh toán</h2>
          {isBuyer ? (
            <>
              <PriceBreakdown listPrice={order.list_price} buyerFee={order.buyer_fee} total={order.amount} feePayer={order.fee_payer} feeRateBp={order.fee_rate_bp} waivedReason="Ưu đãi" />
              <p className="text-xs text-slate-500">Số tiền trên là số bạn chuyển khoản. Phí ship trả cho bưu tá khi nhận hàng.</p>
            </>
          ) : (
            <dl className="divide-y divide-slate-100 text-sm">
              <Row label="Giá sản phẩm gốc" value={formatVND(order.list_price)} />
              {isSeller && (order.seller_fee > 0
                ? <Row label="Phí bảo lãnh giao dịch (bên bạn chịu)" value={`− ${formatVND(order.seller_fee)}`} />
                : <Row label="Phí bảo lãnh giao dịch (bên bạn chịu)" value="Miễn phí" />)}
              {isSeller && <Row label="Bạn thực nhận" value={formatVND(order.seller_payout)} strong />}
              {!isSeller && <Row label="Người mua chuyển" value={formatVND(order.amount)} />}
              {!isSeller && <Row label="Phí sàn" value={formatVND(order.platform_fee)} />}
              {!isSeller && <Row label="Người bán nhận" value={formatVND(order.seller_payout)} strong />}
            </dl>
          )}
          {order.fee_rate_bp === 0 && <ModBadge full />}
          {isSeller && payout && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Tài khoản nhận: {payout.bank_name} ••••{payout.account_number.slice(-4)} · <strong>{PAYOUT_LABEL[payout.status]}</strong>
            </p>
          )}
        </section>

        <section className="card space-y-3 p-5">
          <h2 className="text-base font-semibold">{isBuyer ? 'Người bán' : 'Người mua'}</h2>
          {counterpart ? (
            <div className="flex items-center gap-3">
              <Avatar name={counterpart.display_name} url={counterpart.avatar_url} size={40} />
              <div className="min-w-0">
                <p className="truncate font-medium text-slate-900">{counterpart.display_name}</p>
                <p className="text-xs text-slate-500">{counterpart.sold_count} đơn bán · {counterpart.bought_count} đơn mua</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">—</p>
          )}
          {isBuyer && sellerFb && (
            <a href={sellerFb} target="_blank" rel="noopener noreferrer nofollow" className="btn-secondary w-full">
              <Facebook className="h-4 w-4 text-[#1877F2]" /> Facebook người bán <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </a>
          )}
        </section>
      </div>

      {showShipping && (
        <section className="card space-y-3 p-5">
          <h2 className="text-base font-semibold">Thông tin giao nhận</h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <Row label="Người nhận" value={order.recipient_name} />
            <Row label="Số điện thoại" value={order.phone} />
            <Row label="Địa chỉ" value={order.address} />
            {order.note && <Row label="Ghi chú" value={order.note} />}
            {order.carrier && <Row label="Đơn vị vận chuyển" value={order.carrier} />}
            {order.tracking_code && <Row label="Mã vận đơn" value={order.tracking_code} />}
          </dl>
        </section>
      )}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className={`text-right ${strong ? 'text-base font-semibold text-brand-800' : 'font-medium text-slate-900'}`}>{value}</dd>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 *  Người mua: thanh toán VietQR + đếm ngược
 * -------------------------------------------------------------------------- */
function PaymentPanel({ order, secondsLeft, busy, onCancel }: {
  order: Order; secondsLeft: number | null; busy: boolean; onCancel: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  // tryBuild không ném lỗi: nếu dữ liệu tài khoản sai, chỉ hiện hướng dẫn chuyển khoản thủ công thay vì trắng trang
  const qrUrl = useMemo(() => tryBuildEscrowQrUrl({ amount: order.amount, paymentCode: order.payment_code }), [order.amount, order.payment_code]);
  const info = getEscrowTransferInfo();
  const expired = secondsLeft === 0;
  const urgent = secondsLeft !== null && secondsLeft <= 120;

  return (
    <section className="card space-y-4 p-5">
      <BuyerProtectionSteps current={1} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Thanh toán qua tài khoản trung gian</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${expired ? 'bg-slate-100 text-slate-600' : urgent ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
          <Clock className="h-4 w-4" /> {secondsLeft === null ? '--:--' : expired ? 'Hết hạn' : formatCountdown(secondsLeft)}
        </span>
      </div>

      {expired ? (
        <Alert kind="info">Đã quá thời hạn giữ chỗ. Hệ thống đang đóng đơn — vui lòng <strong>không chuyển khoản</strong>. Bạn có thể đặt mua lại nếu sản phẩm còn.</Alert>
      ) : (
        <>
          <p className="text-sm text-slate-600">Quét mã bằng app ngân hàng hoặc chuyển khoản thủ công. Hệ thống tự nhận biết khi tiền về, bạn không cần báo lại.</p>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div className="mx-auto w-[220px]">
              {qrFailed || !qrUrl ? (
                <div className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-slate-300 p-3 text-center text-xs text-slate-500">Không tải được mã QR. Hãy chuyển khoản thủ công theo thông tin bên cạnh.</div>
              ) : (
                <img src={qrUrl} alt="Mã VietQR thanh toán đơn hàng" className="w-full rounded-xl border border-slate-200 bg-white" onError={() => setQrFailed(true)} />
              )}
            </div>
            <dl className="space-y-2 text-sm">
              <CopyRow label="Ngân hàng" value={info.bankName} />
              <CopyRow label="Số tài khoản" value={info.accountNo} mono />
              {info.accountName && <CopyRow label="Chủ tài khoản" value={info.accountName} />}
              <CopyRow label="Số tiền" value={String(order.amount)} display={formatVND(order.amount)} />
              <CopyRow label="Nội dung CK" value={order.payment_code} mono />
            </dl>
          </div>
          <Alert kind="info">Nhập <strong>đúng số tiền</strong> và <strong>đúng nội dung chuyển khoản</strong> để đơn được xác nhận tự động.</Alert>
        </>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
        {confirming ? (
          <>
            <span className="text-sm text-slate-600">Hủy đơn này?</span>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>Không</button>
            <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={async () => { await onCancel(); setConfirming(false); }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận hủy
            </button>
          </>
        ) : (
          <button type="button" className="btn-ghost text-red-600 hover:bg-red-50" onClick={() => setConfirming(true)} disabled={busy}>
            <XCircle className="h-4 w-4" /> Hủy đơn hàng
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">Chỉ hủy được khi chưa chuyển tiền. Nếu đã chuyển khoản, hãy chờ hệ thống xác nhận.</p>
    </section>
  );
}

function CopyRow({ label, value, display, mono = false }: { label: string; value: string; display?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className={`truncate font-medium text-slate-900 ${mono ? 'font-mono' : ''}`}>{display ?? value}</dd>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 *  Người bán: nhập thông tin gửi hàng
 * -------------------------------------------------------------------------- */
function ShipForm({ order, busy, onSubmit }: {
  order: Order; busy: boolean; onSubmit: (input: { carrier: string; trackingCode: string; packingVideoUrl: string }) => Promise<boolean>;
}) {
  const [carrier, setCarrier] = useState('');
  const [otherCarrier, setOtherCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const [video, setVideo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const finalCarrier = carrier === 'Khác' ? otherCarrier.trim() : carrier;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (finalCarrier.length < 2) next.carrier = 'Chọn hoặc nhập đơn vị vận chuyển.';
    if (tracking.trim().length < 3) next.tracking = 'Nhập mã vận đơn (tối thiểu 3 ký tự).';
    if (!URL_RE.test(video.trim())) next.video = 'Dán link video (bắt đầu bằng http:// hoặc https://).';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onSubmit({ carrier: finalCarrier, trackingCode: tracking.trim(), packingVideoUrl: video.trim() });
  };

  return (
    <form onSubmit={submit} noValidate className="card space-y-4 p-5">
      <Alert kind="success">Sàn đã nhận <strong>{formatVND(order.amount)}</strong> từ người mua. Hãy đóng gói và gửi hàng.</Alert>
      <div className="rounded-xl bg-slate-50 p-3 text-sm">
        <p className="font-medium text-slate-900">Gửi tới: {order.recipient_name} · {order.phone}</p>
        <p className="mt-0.5 text-slate-700">{order.address}</p>
        {order.note && <p className="mt-1 text-xs text-slate-500">Ghi chú: {order.note}</p>}
      </div>

      <h2 className="text-base font-semibold">Xác nhận đã gửi hàng</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Đơn vị vận chuyển" htmlFor="carrier" required error={errors.carrier}>
          <select id="carrier" className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)}>
            <option value="">— Chọn —</option>
            {CARRIERS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Mã vận đơn" htmlFor="tracking" required error={errors.tracking}>
          <input id="tracking" className="input font-mono" value={tracking} maxLength={60} onChange={(e) => setTracking(e.target.value)} />
        </Field>
      </div>
      {carrier === 'Khác' && (
        <Field label="Tên đơn vị vận chuyển" htmlFor="otherCarrier">
          <input id="otherCarrier" className="input" value={otherCarrier} maxLength={60} onChange={(e) => setOtherCarrier(e.target.value)} />
        </Field>
      )}
      <Field label="Link video test & đóng gói liền mạch" htmlFor="video" required error={errors.video}
        hint="Bắt buộc. Quay liền mạch từ lúc test sản phẩm đến khi đóng gói xong, tải lên YouTube (không công khai), Google Drive hoặc Facebook rồi dán link. Đây là bằng chứng nếu có khiếu nại.">
        <input id="video" className="input" inputMode="url" placeholder="https://..." value={video} maxLength={500} onChange={(e) => setVideo(e.target.value)} />
      </Field>

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Xác nhận đã gửi hàng
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------------------
 *  Đang giao: người mua xác nhận nhận hàng / khiếu nại
 * -------------------------------------------------------------------------- */
function ShippedPanel({ order, isBuyer, busy, onConfirm, onDispute }: {
  order: Order; isBuyer: boolean; busy: boolean;
  onConfirm: () => Promise<boolean>;
  onDispute: (reason: string, videoUrl: string) => Promise<boolean>;
}) {
  const [checked, setChecked] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState('');
  const [video, setVideo] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submitDispute = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (reason.trim().length < 10) next.reason = 'Mô tả lý do ít nhất 10 ký tự.';
    if (!URL_RE.test(video.trim())) next.video = 'Dán link video mở hộp (bắt đầu bằng http:// hoặc https://).';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    await onDispute(reason.trim(), video.trim());
  };

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <Truck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600" />
        <div className="min-w-0 text-sm">
          <h2 className="text-base font-semibold">Hàng đang trên đường giao</h2>
          <p className="mt-1 text-slate-600">
            {order.carrier ?? 'Đơn vị vận chuyển'} · Mã vận đơn: <span className="font-mono font-medium text-slate-900">{order.tracking_code}</span>{' '}
            {order.tracking_code && <CopyButton value={order.tracking_code} label="Chép mã" />}
          </p>
          <p className="mt-1 text-xs text-slate-500">Dùng mã vận đơn để tra cứu trên website/app của đơn vị vận chuyển.</p>
          {order.packing_video_url && (
            <a href={order.packing_video_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1.5 text-brand-700 hover:underline">
              <Video className="h-4 w-4" /> Xem video test của người bán <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {!isBuyer ? (
        <Alert kind="info">Đang chờ người mua nhận hàng và xác nhận.</Alert>
      ) : disputing ? (
        <form onSubmit={submitDispute} noValidate className="space-y-4 rounded-xl border border-red-200 bg-red-50/40 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800"><ShieldAlert className="h-4 w-4" /> Khiếu nại / Hàng lỗi</h3>
          <Field label="Lý do khiếu nại" htmlFor="reason" required error={errors.reason}>
            <textarea id="reason" rows={4} className="input" maxLength={1000} placeholder="Mô tả chi tiết lỗi: hàng không đúng mô tả, lỗi âm thanh, thiếu phụ kiện..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Link video mở hộp (unbox)" htmlFor="dvideo" required error={errors.video}
            hint="Video quay liền mạch từ lúc bưu kiện còn nguyên niêm phong. Tải lên YouTube (không công khai), Google Drive hoặc Facebook rồi dán link.">
            <input id="dvideo" className="input" inputMode="url" placeholder="https://..." value={video} maxLength={500} onChange={(e) => setVideo(e.target.value)} />
          </Field>
          <p className="text-xs text-red-800">Khi gửi khiếu nại, tiền sẽ tiếp tục được sàn giữ cho đến khi admin xem xét và xử lý.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setDisputing(false)} disabled={busy}>Quay lại</button>
            <button type="submit" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Gửi khiếu nại
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <div role="alert" className="flex gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 text-amber-950">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            <p className="text-sm font-semibold leading-relaxed sm:text-base">
              QUY TẮC BẮT BUỘC: Vui lòng quay video mở hộp liền mạch từ lúc gói hàng còn nguyên niêm phong 6 mặt đến khi cắm test âm thanh. VAHA Market từ chối giải quyết khiếu nại hoàn tiền nếu không có video mở hộp nguyên vẹn.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700" />
            <span>Tôi đã quay video mở hộp liền mạch và kiểm tra tai nghe hoạt động đúng mô tả.</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary text-red-700" onClick={() => setDisputing(true)} disabled={busy}>
              <AlertTriangle className="h-4 w-4" /> Khiếu nại / Hàng lỗi
            </button>
            <button type="button" className="btn-primary" disabled={!checked || busy} onClick={() => void onConfirm()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Đã nhận được hàng (Giải ngân cho người bán)
            </button>
          </div>
          <p className="text-xs text-slate-500">Sau khi bấm xác nhận, tiền sẽ được chuyển cho người bán và không thể hoàn tác.</p>
        </div>
      )}
    </section>
  );
}

function DisputeInfo({ order }: { order: Order }) {
  return (
    <section className="card space-y-3 border-red-200 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-red-800"><ShieldAlert className="h-5 w-5" /> Đơn đang có khiếu nại</h2>
      <p className="text-sm text-slate-600">Sàn đang giữ tiền và admin sẽ xem xét bằng chứng của hai bên.</p>
      {order.disputed_at && <p className="text-xs text-slate-500">Gửi lúc {new Date(order.disputed_at).toLocaleString('vi-VN')}</p>}
      <div className="rounded-xl bg-red-50/60 p-3 text-sm">
        <p className="font-medium text-slate-900">Lý do của người mua</p>
        <p className="mt-1 whitespace-pre-line text-slate-700">{order.dispute_reason}</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {order.dispute_video_url && (
          <a href={order.dispute_video_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
            <Video className="h-4 w-4" /> Video mở hộp của người mua <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {order.packing_video_url && (
          <a href={order.packing_video_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-brand-700 hover:underline">
            <Video className="h-4 w-4" /> Video test của người bán <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5" /> Hai bên chưa cần thao tác thêm. Hãy liên hệ admin nếu cần bổ sung bằng chứng.</p>
    </section>
  );
}
