import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, Tag, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePlatformSettings } from '@/context/PlatformSettingsContext';
import { supabase } from '@/lib/supabase';
import { calcFees, formatVND } from '@/lib/money';
import { createOrder } from '@/lib/orders';
import { getErrorMessage } from '@/lib/errors';
import { Alert, Field } from '@/components/ui';
import type { BankAccount, Listing, PriceOffer } from '@/types';

const PHONE_RE = /^[0-9+ ]{8,15}$/;

export default function BuyDialog({
  listing,
  sellerIsMod,
  acceptedOffer,
  onClose,
}: {
  listing: Pick<Listing, 'id' | 'title' | 'price' | 'fee_payer'>;
  sellerIsMod: boolean;
  acceptedOffer?: PriceOffer | null;
  onClose: () => void;
}) {
  const { user, profile, contact, refresh } = useAuth();
  const { feeBp, feeCapVnd } = usePlatformSettings();
  const navigate = useNavigate();
  const missing = !contact?.phone || !contact?.shipping_address;

  const effectivePrice = acceptedOffer ? acceptedOffer.offered_price : listing.price;
  const fees = calcFees(effectivePrice, listing.fee_payer, sellerIsMod, feeBp, feeCapVnd);

  const [name, setName] = useState(profile?.display_name ?? '');
  const [phone, setPhone] = useState(contact?.phone ?? '');
  const [address, setAddress] = useState(contact?.shipping_address ?? '');
  const [note, setNote] = useState('');
  const [saveProfile, setSaveProfile] = useState(missing);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [buyerBank, setBuyerBank] = useState<BankAccount | null>(null);
  const [bankLoading, setBankLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setBankLoading(true);
    supabase
      .from('bank_accounts')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data ?? []) as BankAccount[];
        setBuyerBank(rows[0] ?? null);
        setBankLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !buyerBank) return;
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
        await supabase
          .from('profile_contacts')
          .update({ phone: phone.trim(), shipping_address: address.trim() })
          .eq('user_id', user.id);
        void refresh();
      }
      const order = await createOrder({
        listingId: listing.id,
        recipientName: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        note: note.trim() || undefined,
        expectedAmount: fees.buyerPays,
        offerId: acceptedOffer?.id,
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
          <button
            type="button"
            className="btn-ghost px-1.5 py-1"
            onClick={onClose}
            disabled={busy}
            aria-label="Đóng"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {acceptedOffer && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200">
            <span className="flex items-center gap-1.5 font-medium">
              <Tag size={13} /> Áp dụng giá đã chốt qua thương lượng
            </span>
            <span className="tabular-nums">
              <strong className="font-semibold">{formatVND(acceptedOffer.offered_price)}</strong>{' '}
              <span className="text-neutral-500 line-through dark:text-neutral-400">
                {formatVND(listing.price)}
              </span>
            </span>
          </div>
        )}

        {bankLoading ? (
          <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
            <Loader2 size={14} className="animate-spin" /> Đang kiểm tra tài khoản ngân hàng...
          </div>
        ) : !buyerBank ? (
          <Alert kind="error">
            <p className="font-medium">Chưa có tài khoản ngân hàng.</p>
            <p className="mt-0.5 text-xs">
              Cần lưu 1 tài khoản ngân hàng để nhận hoàn tiền nếu đơn bị hủy.{' '}
              <Link to="/settings" className="font-semibold underline">
                Thêm ngay
              </Link>
            </p>
          </Alert>
        ) : (
          <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
            <span className="font-medium text-neutral-900 dark:text-neutral-100">Tài khoản nhận hoàn tiền:</span>{' '}
            {buyerBank.bank_name} · <span className="font-mono">{buyerBank.account_number}</span> · {buyerBank.account_name}
          </div>
        )}

        {missing && <Alert kind="info">Nhập SĐT và địa chỉ nhận hàng bên dưới.</Alert>}

        <Field label="Tên người nhận" htmlFor="b-name" required error={errors.name}>
          <input id="b-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Số điện thoại" htmlFor="b-phone" required error={errors.phone}>
          <input id="b-phone" className="input" inputMode="tel" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="Địa chỉ nhận hàng" htmlFor="b-address" required error={errors.address}>
          <textarea id="b-address" rows={2} className="input" value={address} maxLength={400} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Ghi chú" htmlFor="b-note" hint="Không bắt buộc.">
          <input id="b-note" className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <label className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={saveProfile}
            onChange={(e) => setSaveProfile(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-300 text-blue-700 dark:border-neutral-700"
          />
          Lưu SĐT và địa chỉ vào hồ sơ
        </label>

        <div className="rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm tabular-nums dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex justify-between">
            <span className="text-neutral-600 dark:text-neutral-400">Số tiền chuyển khoản</span>
            <strong className="font-semibold text-neutral-950 dark:text-neutral-50">
              {formatVND(fees.buyerPays)}
            </strong>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Hạn thanh toán: 15 phút. Phí giao hàng trả riêng cho bưu tá.
          </p>
        </div>

        <div>
          <label className="flex items-start gap-2 text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-blue-700 dark:border-neutral-700"
            />
            <span>
              Tôi đồng ý với{' '}
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Điều khoản sử dụng
              </Link>{' '}
              và sẽ <strong>quay video mở hộp đủ 6 mặt</strong> khi nhận hàng.
            </span>
          </label>
          {errors.agree && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.agree}</p>}
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        <div className="flex justify-end gap-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>
            Hủy
          </button>
          <button type="submit" className="btn-primary" disabled={busy || bankLoading || !buyerBank}>
            {busy && <Loader2 size={15} strokeWidth={1.75} className="animate-spin" />} Xác nhận đặt mua
          </button>
        </div>
      </form>
    </div>
  );
}
