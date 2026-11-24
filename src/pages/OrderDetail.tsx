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
  buyerCancelOverdueOrder, cancelOrder, confirmReceived, expireOrderIfDue, getSellerFacebook, markShipped, openDispute, sellerCancelPaidOrder, subscribeToOrder,
} from '@/lib/orders';
import { getErrorMessage } from '@/lib/errors';
import { CARRIERS } from '@/constants/orderStatus';
import { formatCountdown, useCountdown } from '@/hooks/useCountdown';
import BuyerProtectionSteps from '@/components/BuyerProtectionSteps';
import CopyButton from '@/components/CopyButton';
import ErrorBoundary from '@/components/ErrorBoundary';

import PriceBreakdown from '@/components/PriceBreakdown';
import OrderStatusBadge from '@/components/OrderStatusBadge';
import NotificationHint from '@/components/NotificationHint';
import { Alert, Avatar, Field, PageLoader } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
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

  useDocumentTitle(order ? `Đơn hàng ${order.payment_code}` : 'Chi tiết đơn hàng');

  if (loading) return <PageLoader />;
  if (loadError) return <div className="mx-auto max-w-2xl"><Alert kind="error">{loadError}</Alert></div>;
  if (!order || !id) {
    return (
      <div className="card mx-auto mt-8 max-w-md p-8 text-center">
        <h1 className="text-lg font-semibold">Không tìm thấy đơn hàng</h1>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">Đơn không tồn tại hoặc bạn không phải người mua/bán của đơn này.</p>
        <Link to="/orders" className="btn-primary mt-4">Về danh sách đơn</Link>
      </div>
    );
  }

  const showShipping =
    isBuyer || (isSeller && ['PAID_HELD', 'SHIPPED', 'COMPLETED', 'PAID_OUT', 'DISPUTED'].includes(order.status));
  const step = STEP_INDEX[order.status];

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
        <Link to="/orders" className="inline-flex items-center gap-1 hover:text-neutral-950 hover:underline dark:hover:text-neutral-100">
          <ArrowLeft size={14} strokeWidth={1.75} /> Đơn hàng của tôi
        </Link>
        <span>/</span>
        <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">{order.payment_code}</span>
      </nav>

      {/* Tiêu đề */}
      <div className="card flex gap-3 p-4 sm:gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800">
          {order.listing_snapshot.image && <img src={cldUrl(order.listing_snapshot.image, { width: 200, height: 200, crop: 'fill' })} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium text-neutral-900 dark:text-neutral-100">{order.listing_snapshot.title}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={order.status} />
            <span className="text-xs text-neutral-500 dark:text-neutral-400">{isBuyer ? 'Đơn mua' : isSeller ? 'Đơn bán' : 'Xem với tư cách admin'}</span>
          </div>
          <p className="mt-1 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            Mã đơn <span className="font-mono text-neutral-700 dark:text-neutral-200">{order.payment_code}</span> <CopyButton value={order.payment_code} />
          </p>
        </div>
      </div>

      {/* Tiến trình */}
      {step !== undefined && (
        <ol className="grid grid-cols-4 gap-1" aria-label="Tiến trình đơn hàng">
          {STEPS.map((label, i) => (
            <li key={label} className="text-center">
              <div className={`mx-auto h-1.5 rounded-full ${i <= step ? 'bg-brand-600' : 'bg-neutral-200 dark:bg-neutral-700'}`} />
              <span className={`mt-1 block text-xs ${i <= step ? 'font-medium text-neutral-900 dark:text-neutral-100' : 'text-neutral-400 dark:text-neutral-500'}`}>{label}</span>
            </li>
          ))}
        </ol>
      )}

      {['PENDING_PAYMENT', 'PAID_HELD', 'SHIPPED'].includes(order.status) && (
        <NotificationHint prominent />
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
        <BuyerPaidHeldPanel
          order={order}
          paidNotice={paidNotice}
          busy={busy}
          onCancelOverdue={() => run(() => buyerCancelOverdueOrder(order.id))}
        />
      )}
      {order.status === 'PAID_HELD' && isSeller && (
        <div className="space-y-4">
          <ShipForm order={order} busy={busy} onSubmit={(input) => run(() => markShipped(order.id, input))} />
          <SellerCancelPaidPanel
            busy={busy}
            onCancel={(reason, listingAction) => run(() => sellerCancelPaidOrder(order.id, reason, listingAction))}
          />
        </div>
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
      {order.status === 'REFUNDED' && <RefundStatusCard order={order} />}

      {/* Thông tin chi tiết */}
      <div className="grid min-w-0 gap-5 md:grid-cols-2">
        <section className="card min-w-0 space-y-3 p-4 sm:p-5">
          <h2 className="text-base font-semibold">Thanh toán</h2>
          {isBuyer ? (
            <>
              <PriceBreakdown
                listPrice={order.list_price}
                buyerFee={order.buyer_fee}
                total={order.amount}
                feePayer={order.fee_payer}
                feeRateBp={order.fee_rate_bp}
                waivedReason="Ưu đãi"
                isFeeCapped={(order.fee_saved_amount ?? 0) > 0}
                feeCapVnd={order.fee_cap_vnd ?? 500_000}
                feeSavedAmount={order.fee_saved_amount ?? 0}
              />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Số tiền trên là số bạn chuyển khoản. Phí ship trả cho bưu tá khi nhận hàng.</p>
            </>
          ) : (
            <dl className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
              <Row label="Giá sản phẩm gốc" value={formatVND(order.list_price)} />
              {isSeller && <Row label="Phí trung gian" value="Miễn phí (0%)" />}
              {isSeller && <Row label="Bạn thực nhận" value={formatVND(order.seller_payout)} strong />}
              {!isSeller && <Row label="Người mua chuyển" value={formatVND(order.amount)} />}
              {!isSeller && <Row label="Phí sàn" value={formatVND(order.platform_fee)} />}
              {!isSeller && <Row label="Người bán nhận" value={formatVND(order.seller_payout)} strong />}
            </dl>
          )}

          {order.fee_rate_bp === 0 && (
            <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
              0% phí trung gian · Sàn cộng đồng
            </span>
          )}
          {(order.status === 'COMPLETED' || order.status === 'PAID_OUT') && (
            <p className="rounded-lg border border-blue-100 bg-blue-50/70 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-200">
              Giao dịch hoàn tất với <strong>0% phí</strong>! Nếu thấy VAHA Market hữu ích, bạn có thể{' '}
              <Link to="/support" className="font-semibold underline">
                ủng hộ duy trì sàn
              </Link>.
            </p>
          )}
          {isSeller && payout && (
            <p className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2 text-xs text-neutral-600 dark:text-neutral-400">
              Tài khoản nhận: {payout.bank_name} ••••{payout.account_number.slice(-4)} · <strong>{PAYOUT_LABEL[payout.status]}</strong>
            </p>
          )}
        </section>

        <section className="card min-w-0 space-y-3 p-4 sm:p-5">
          <h2 className="text-base font-semibold">{isBuyer ? 'Người bán' : 'Người mua'}</h2>
          {counterpart ? (
            <div className="flex items-center gap-3">
              <Avatar name={counterpart.display_name} url={counterpart.avatar_url} size={40} />
              <div className="min-w-0">
                <p className="truncate font-medium text-neutral-900 dark:text-neutral-100">{counterpart.display_name}</p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">{counterpart.sold_count} đơn bán · {counterpart.bought_count} đơn mua</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">—</p>
          )}
          {isBuyer && sellerFb && (
            <a href={sellerFb} target="_blank" rel="noopener noreferrer nofollow" className="btn-secondary w-full">
              <Facebook className="h-4 w-4 text-[#1877F2]" /> Facebook người bán <ExternalLink className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500" />
            </a>
          )}
        </section>
      </div>

      {showShipping && (
        <section className="card min-w-0 space-y-3 p-4 sm:p-5">
          <h2 className="text-base font-semibold">Thông tin giao nhận</h2>
          <dl className="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
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
      <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">{label}</dt>
      <dd className={`text-right ${strong ? 'text-base font-semibold text-brand-800 dark:text-brand-300' : 'font-medium text-neutral-900 dark:text-neutral-100'}`}>{value}</dd>
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
      <BuyerProtectionSteps current={1} layout="wide" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Thanh toán qua tài khoản trung gian</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${expired ? 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400' : urgent ? 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400' : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300'}`}>
          <Clock className="h-4 w-4" /> {secondsLeft === null ? '--:--' : expired ? 'Hết hạn' : formatCountdown(secondsLeft)}
        </span>
      </div>

      {expired ? (
        <Alert kind="info">Đã quá thời hạn giữ chỗ. Hệ thống đang đóng đơn — vui lòng <strong>không chuyển khoản</strong>. Bạn có thể đặt mua lại nếu sản phẩm còn.</Alert>
      ) : (
        <>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Quét mã bằng app ngân hàng hoặc chuyển khoản thủ công. Hệ thống tự nhận biết khi tiền về, bạn không cần báo lại.</p>
          <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
            <div className="mx-auto w-[220px]">
              {qrFailed || !qrUrl ? (
                <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-3 text-center text-xs text-neutral-500 dark:text-neutral-400">Không tải được mã QR. Hãy chuyển khoản thủ công theo thông tin bên cạnh.</div>
              ) : (
                <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-700"><img src={qrUrl} alt="Mã VietQR thanh toán đơn hàng" className="w-full rounded-lg bg-white" onError={() => setQrFailed(true)} /></div>
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

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-neutral-100 dark:border-neutral-800 pt-3">
        {confirming ? (
          <>
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Hủy đơn này?</span>
            <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>Không</button>
            <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy} onClick={async () => { await onCancel(); setConfirming(false); }}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận hủy
            </button>
          </>
        ) : (
          <button type="button" className="btn-ghost text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60" onClick={() => setConfirming(true)} disabled={busy}>
            <XCircle className="h-4 w-4" /> Hủy đơn hàng
          </button>
        )}
      </div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">Chỉ hủy được khi chưa chuyển tiền. Nếu đã chuyển khoản, hãy chờ hệ thống xác nhận.</p>
    </section>
  );
}

function CopyRow({ label, value, display, mono = false }: { label: string; value: string; display?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2">
      <div className="min-w-0">
        <dt className="text-xs text-neutral-500 dark:text-neutral-400">{label}</dt>
        <dd className={`truncate font-medium text-neutral-900 dark:text-neutral-100 ${mono ? 'font-mono' : ''}`}>{display ?? value}</dd>
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
      <Alert kind="success">
        <p>Sàn đã nhận <strong>{formatVND(order.amount)}</strong> từ người mua. Hãy đóng gói và gửi hàng.</p>
        {(order.ship_deadline_at || order.paid_at) && (
          <p className="mt-1 text-xs">
            Hạn chót gửi hàng (48 giờ):{' '}
            <strong>
              {new Date(
                order.ship_deadline_at ?? new Date(new Date(order.paid_at as string).getTime() + 48 * 3600_000).toISOString(),
              ).toLocaleString('vi-VN')}
            </strong>
            . Quá hạn này, người mua có quyền yêu cầu hủy đơn hoàn tiền.
          </p>
        )}
      </Alert>
      <div className="rounded-lg bg-neutral-50 dark:bg-neutral-800/60 p-3 text-sm">
        <p className="font-medium text-neutral-900 dark:text-neutral-100">Gửi tới: {order.recipient_name} · {order.phone}</p>
        <p className="mt-0.5 text-neutral-700 dark:text-neutral-200">{order.address}</p>
        {order.note && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Ghi chú: {order.note}</p>}
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
        <Truck className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="min-w-0 text-sm">
          <h2 className="text-base font-semibold">Hàng đang trên đường giao</h2>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            {order.carrier ?? 'Đơn vị vận chuyển'} · Mã vận đơn: <span className="font-mono font-medium text-neutral-900 dark:text-neutral-100">{order.tracking_code}</span>{' '}
            {order.tracking_code && <CopyButton value={order.tracking_code} label="Chép mã" />}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Dùng mã vận đơn để tra cứu trên website/app của đơn vị vận chuyển.</p>
          {order.shipped_at && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Quy tắc bảo vệ 14 ngày: nếu sau ngày{' '}
              <strong className="text-neutral-700 dark:text-neutral-300">
                {new Date(new Date(order.shipped_at).getTime() + 14 * 24 * 3600_000).toLocaleDateString('vi-VN')}
              </strong>{' '}
              người mua không xác nhận nhận hàng hoặc mở khiếu nại, đơn sẽ chuyển Admin rà soát mã vận đơn để giải ngân cho người bán.
            </p>
          )}
          {order.packing_video_url && (
            <a href={order.packing_video_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-400 hover:underline">
              <Video className="h-4 w-4" /> Xem video test của người bán <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {!isBuyer ? (
        <Alert kind="info">Đang chờ người mua nhận hàng và xác nhận.</Alert>
      ) : disputing ? (
        <form onSubmit={submitDispute} noValidate className="space-y-4 rounded-lg border border-red-200 dark:border-red-900/70 bg-red-50/40 dark:bg-red-950/30 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-red-800 dark:text-red-300"><ShieldAlert className="h-4 w-4" /> Khiếu nại / Hàng lỗi</h3>
          <Field label="Lý do khiếu nại" htmlFor="reason" required error={errors.reason}>
            <textarea id="reason" rows={4} className="input" maxLength={1000} placeholder="Mô tả chi tiết lỗi: hàng không đúng mô tả, lỗi âm thanh, thiếu phụ kiện..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Field label="Link video mở hộp (unbox)" htmlFor="dvideo" required error={errors.video}
            hint="Video quay liền mạch từ lúc bưu kiện còn nguyên niêm phong. Tải lên YouTube (không công khai), Google Drive hoặc Facebook rồi dán link.">
            <input id="dvideo" className="input" inputMode="url" placeholder="https://..." value={video} maxLength={500} onChange={(e) => setVideo(e.target.value)} />
          </Field>
          <p className="text-xs text-red-800 dark:text-red-300">Khi gửi khiếu nại, tiền sẽ tiếp tục được sàn giữ cho đến khi admin xem xét và xử lý.</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setDisputing(false)} disabled={busy}>Quay lại</button>
            <button type="submit" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Gửi khiếu nại
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-3 border-t border-neutral-100 dark:border-neutral-800 pt-4">
          <div role="alert" className="flex gap-3 rounded-lg border-2 border-amber-400 dark:border-amber-600/80 bg-amber-50 dark:bg-amber-950/50 p-4 text-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-semibold leading-relaxed sm:text-base">
              QUY TẮC BẮT BUỘC: Vui lòng quay video mở hộp liền mạch từ lúc gói hàng còn nguyên niêm phong 6 mặt đến khi cắm test âm thanh. VAHA Market từ chối giải quyết khiếu nại hoàn tiền nếu không có video mở hộp nguyên vẹn.
            </p>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-sm text-neutral-700 dark:text-neutral-200">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-neutral-300 dark:border-neutral-700 text-brand-700 dark:text-brand-400" />
            <span>Tôi đã quay video mở hộp liền mạch và kiểm tra tai nghe hoạt động đúng mô tả.</span>
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="btn-secondary text-red-700 dark:text-red-400" onClick={() => setDisputing(true)} disabled={busy}>
              <AlertTriangle className="h-4 w-4" /> Khiếu nại / Hàng lỗi
            </button>
            <button type="button" className="btn-primary" disabled={!checked || busy} onClick={() => void onConfirm()}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />} Đã nhận được hàng (Giải ngân cho người bán)
            </button>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Sau khi bấm xác nhận, tiền sẽ được chuyển cho người bán và không thể hoàn tác.</p>
        </div>
      )}
    </section>
  );
}

function DisputeInfo({ order }: { order: Order }) {
  return (
    <section className="card space-y-3 border-red-200 dark:border-red-900/70 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-red-800 dark:text-red-300"><ShieldAlert className="h-5 w-5" /> Đơn đang có khiếu nại</h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">Sàn đang giữ tiền và admin sẽ xem xét bằng chứng của hai bên.</p>
      {order.disputed_at && <p className="text-xs text-neutral-500 dark:text-neutral-400">Gửi lúc {new Date(order.disputed_at).toLocaleString('vi-VN')}</p>}
      <div className="rounded-lg bg-red-50/60 dark:bg-red-950/40 p-3 text-sm">
        <p className="font-medium text-neutral-900 dark:text-neutral-100">Lý do của người mua</p>
        <p className="mt-1 whitespace-pre-line text-neutral-700 dark:text-neutral-200">{order.dispute_reason}</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {order.dispute_video_url && (
          <a href={order.dispute_video_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-400 hover:underline">
            <Video className="h-4 w-4" /> Video mở hộp của người mua <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
        {order.packing_video_url && (
          <a href={order.packing_video_url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-400 hover:underline">
            <Video className="h-4 w-4" /> Video test của người bán <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400"><CheckCircle2 className="h-3.5 w-3.5" /> Hai bên chưa cần thao tác thêm. Hãy liên hệ admin nếu cần bổ sung bằng chứng.</p>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 *  Người mua khi đơn PAID_HELD: hiển thị hạn 48h & nút hủy hoàn tiền nếu quá hạn
 * -------------------------------------------------------------------------- */
function BuyerPaidHeldPanel({
  order,
  paidNotice,
  busy,
  onCancelOverdue,
}: {
  order: Order;
  paidNotice: boolean;
  busy: boolean;
  onCancelOverdue: () => Promise<boolean>;
}) {
  const [confirming, setConfirming] = useState(false);
  const deadlineIso =
    order.ship_deadline_at ??
    (order.paid_at ? new Date(new Date(order.paid_at).getTime() + 48 * 3600_000).toISOString() : null);
  const isOverdue = Boolean(deadlineIso && Date.now() > new Date(deadlineIso).getTime());

  return (
    <div className="space-y-3">
      <Alert kind="success">
        <p className="font-medium">{paidNotice ? 'Thanh toán thành công!' : 'Sàn đã nhận tiền của bạn.'}</p>
        <p className="mt-0.5">
          Số tiền đang được sàn giữ an toàn. Đang chờ người bán đóng gói và gửi hàng — bạn sẽ thấy mã vận đơn tại đây.
        </p>
        {deadlineIso && (
          <p className="mt-1 text-xs">
            Hạn gửi hàng tối đa (48 giờ): <strong>{new Date(deadlineIso).toLocaleString('vi-VN')}</strong>
          </p>
        )}
      </Alert>

      {isOverdue && (
        <div className="card space-y-3 border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800/70 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-950 dark:text-amber-200">
            Người bán đã quá hạn gửi hàng 48 giờ. Bạn có thể yêu cầu hủy đơn để Admin hoàn tiền về tài khoản ngân hàng đã lưu.
          </p>
          {confirming ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setConfirming(false)} disabled={busy}>
                Quay lại
              </button>
              <button
                type="button"
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={busy}
                onClick={async () => {
                  const ok = await onCancelOverdue();
                  if (ok) setConfirming(false);
                }}
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận hủy &amp; nhận hoàn tiền
              </button>
            </div>
          ) : (
            <div className="flex justify-end">
              <button
                type="button"
                className="btn bg-red-600 text-white hover:bg-red-700"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                Yêu cầu hủy đơn &amp; Hoàn tiền (Quá hạn gửi hàng 48h)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 *  Người bán chủ động báo hết hàng / hủy đơn hoàn tiền khi đang PAID_HELD
 * -------------------------------------------------------------------------- */
function SellerCancelPaidPanel({
  busy,
  onCancel,
}: {
  busy: boolean;
  onCancel: (reason: string, listingAction: 'hidden' | 'sold') => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [listingAction, setListingAction] = useState<'hidden' | 'sold'>('hidden');
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setErr('Hãy nhập lý do hủy đơn (tối thiểu 5 ký tự).');
      return;
    }
    setErr(null);
    const ok = await onCancel(reason.trim(), listingAction);
    if (ok) setOpen(false);
  };

  return (
    <section className="card p-4 sm:p-5">
      {!open ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">Không thể giao hàng / Hủy đơn hoàn tiền</p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Nếu sản phẩm đã bán ngoài hoặc gặp lỗi không thể giao, hãy báo hủy sớm để sàn hoàn tiền cho người mua.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary shrink-0 text-xs text-red-700 dark:text-red-400"
            disabled={busy}
            onClick={() => setOpen(true)}
          >
            Hủy đơn hoàn tiền
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3" noValidate>
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Xác nhận hủy đơn &amp; hoàn tiền cho người mua</p>
          <Field label="Lý do không thể giao hàng" htmlFor="seller-cancel-reason" required error={err ?? undefined}>
            <textarea
              id="seller-cancel-reason"
              rows={2}
              className="input"
              maxLength={500}
              placeholder="Ví dụ: Sản phẩm vừa bán trực tiếp, hoặc phát hiện lỗi khi test trước khi đóng gói..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="space-y-1.5 text-xs text-neutral-700 dark:text-neutral-300">
            <p className="font-medium">Trạng thái tin đăng sau khi hủy đơn:</p>
            <div className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="listingAction"
                  checked={listingAction === 'hidden'}
                  onChange={() => setListingAction('hidden')}
                />
                Ẩn tin đăng (có thể mở lại sau)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="radio"
                  name="listingAction"
                  checked={listingAction === 'sold'}
                  onChange={() => setListingAction('sold')}
                />
                Đánh dấu Đã bán
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
              Quay lại
            </button>
            <button type="submit" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận hủy &amp; hoàn tiền
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------------------
 *  Thông tin trạng thái hoàn tiền (REFUNDED)
 * -------------------------------------------------------------------------- */
function RefundStatusCard({ order }: { order: Order }) {
  const refundAmount = order.paid_amount > 0 ? order.paid_amount : order.amount;
  const done = Boolean(order.refund_completed_at);

  return (
    <section
      className={`card space-y-3 p-4 sm:p-5 ${
        done
          ? 'border-emerald-200 dark:border-emerald-800/70'
          : 'border-amber-300 dark:border-amber-800/70'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-neutral-950 dark:text-neutral-50">Thông tin hoàn tiền</h2>
        <span
          className={`badge ${
            done
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
              : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
          }`}
        >
          {done ? 'Admin đã hoàn tiền thành công' : 'Đang chờ Admin chuyển khoản hoàn tiền'}
        </span>
      </div>

      <dl className="divide-y divide-neutral-100 text-sm dark:divide-neutral-800">
        {(order.cancel_reason || order.admin_note) && (
          <div className="flex items-start justify-between gap-4 py-2">
            <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">Lý do hủy / hoàn tiền</dt>
            <dd className="min-w-0 break-words text-right text-neutral-900 dark:text-neutral-100">
              {order.cancel_reason ?? order.admin_note}
            </dd>
          </div>
        )}
        <div className="flex items-start justify-between gap-4 py-2 tabular-nums">
          <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">Số tiền hoàn</dt>
          <dd className="font-semibold text-neutral-950 dark:text-neutral-50">{formatVND(refundAmount)}</dd>
        </div>
        {order.refund_bank_name && order.refund_account_number && (
          <div className="flex items-start justify-between gap-4 py-2">
            <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">Tài khoản nhận hoàn tiền</dt>
            <dd className="min-w-0 break-words text-right text-neutral-900 dark:text-neutral-100">
              {order.refund_bank_name} · <span className="font-mono">{order.refund_account_number}</span>
              {order.refund_account_name && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{order.refund_account_name}</span>}
            </dd>
          </div>
        )}
        {order.refund_completed_at && (
          <div className="flex items-start justify-between gap-4 py-2">
            <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">Thời gian hoàn tiền</dt>
            <dd className="text-right text-neutral-900 dark:text-neutral-100">
              {new Date(order.refund_completed_at).toLocaleString('vi-VN')}
            </dd>
          </div>
        )}
        {order.refund_reference && (
          <div className="flex items-start justify-between gap-4 py-2">
            <dt className="shrink-0 text-neutral-500 dark:text-neutral-400">Mã giao dịch hoàn tiền</dt>
            <dd className="font-mono text-right text-neutral-900 dark:text-neutral-100">{order.refund_reference}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
