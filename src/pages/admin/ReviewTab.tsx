import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, CheckCircle2, ExternalLink, Facebook, Landmark, Loader2, Phone, ShieldCheck, XCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { reviewListing } from '@/lib/admin';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { getBoxStatusLabel, getCategory, getConditionLabel } from '@/constants/categories';
import CopyButton from '@/components/CopyButton';
import ModBadge from '@/components/ModBadge';
import { Alert, Avatar, PageLoader } from '@/components/ui';
import type { BankAccount, Listing, Profile, ProfileContact } from '@/types';

const REJECT_PRESETS = [
  'Ảnh giấy viết tay mờ hoặc thiếu thông tin (cần: VAHA + ngày hôm nay + tên Facebook).',
  'Tên Facebook trên giấy không khớp với hồ sơ người bán.',
  'Ngày trên giấy viết tay không đúng ngày đăng tin.',
  'Ảnh sản phẩm không phải hàng thật / không cùng khung hình với giấy viết tay.',
  'Nội dung tin vi phạm quy định của VAHA Market.',
];

/** Hàng đợi tiền kiểm: Admin xem ảnh xác thực + hồ sơ người bán rồi duyệt hoặc từ chối kèm lý do. */
export default function ReviewTab({ onChanged }: { onChanged: () => void }) {
  const [items, setItems] = useState<Listing[]>([]);
  const [sellers, setSellers] = useState<Record<string, Profile>>({});
  const [contacts, setContacts] = useState<Record<string, ProfileContact>>({});
  const [banks, setBanks] = useState<Record<string, BankAccount>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.from('listings').select('*').eq('status', 'pending_review').order('created_at', { ascending: true });
      if (err) throw err;
      const list = (data ?? []) as Listing[];
      const sellerIds = Array.from(new Set(list.map((l) => l.seller_id)));
      const bankIds = Array.from(new Set(list.map((l) => l.bank_account_id).filter((x): x is string => Boolean(x))));
      if (list.length > 0) {
        const [p, c, b] = await Promise.all([
          supabase.from('profiles').select('*').in('id', sellerIds),
          supabase.from('profile_contacts').select('*').in('user_id', sellerIds),
          bankIds.length ? supabase.from('bank_accounts').select('*').in('id', bankIds) : Promise.resolve({ data: [], error: null }),
        ]);
        if (p.error) throw p.error;
        if (c.error) throw c.error;
        if (b.error) throw b.error;
        setSellers(Object.fromEntries(((p.data ?? []) as Profile[]).map((x) => [x.id, x])));
        setContacts(Object.fromEntries(((c.data ?? []) as ProfileContact[]).map((x) => [x.user_id, x])));
        setBanks(Object.fromEntries(((b.data ?? []) as BankAccount[]).map((x) => [x.id, x])));
      }
      setItems(list);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <PageLoader />;
  if (error) return <Alert kind="error">{error}</Alert>;
  if (items.length === 0) {
    return (
      <div className="card flex flex-col items-center px-4 py-12 text-center">
        <ShieldCheck className="h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm text-slate-600">Không có tin nào đang chờ duyệt.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-5">
      {items.map((l) => (
        <ReviewCard key={l.id} listing={l} seller={sellers[l.seller_id]} contact={contacts[l.seller_id]} bank={l.bank_account_id ? banks[l.bank_account_id] : undefined}
          onDone={async () => { await load(); onChanged(); }} />
      ))}
    </ul>
  );
}

function ReviewCard({ listing, seller, contact, bank, onDone }: {
  listing: Listing; seller?: Profile; contact?: ProfileContact; bank?: BankAccount; onDone: () => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (decision: 'APPROVE' | 'REJECT') => {
    setBusy(decision);
    setError(null);
    try {
      await reviewListing(listing.id, decision, decision === 'REJECT' ? reason : undefined);
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(null);
    }
  };

  const postedDate = new Date(listing.created_at).toLocaleDateString('vi-VN');

  return (
    <li className="card space-y-4 border-amber-200 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold text-slate-900">{listing.title}</p>
          <p className="text-sm text-slate-600">
            {formatVND(listing.price)} · {getCategory(listing.category)?.label ?? listing.category} · {getConditionLabel(listing.condition)} · {getBoxStatusLabel(listing.box_status)}
          </p>
        </div>
        <span className="text-xs text-slate-500">Gửi lúc {new Date(listing.created_at).toLocaleString('vi-VN')}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Ảnh xác thực: nổi bật nhất */}
        <div className="space-y-2 rounded-xl border-2 border-amber-300 bg-amber-50/60 p-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900"><BadgeCheck className="h-4 w-4" /> Ảnh xác thực giấy viết tay</p>
          {listing.verification_image_url ? (
            <a href={listing.verification_image_url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-amber-200 bg-white">
              <img src={cldUrl(listing.verification_image_url, { width: 900 })} alt="Ảnh xác thực" className="max-h-96 w-full object-contain" />
            </a>
          ) : (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Tin này chưa có ảnh xác thực.</p>
          )}
          <p className="text-xs text-amber-900">
            Kiểm tra giấy viết tay có đủ: <strong>VAHA</strong> + <strong>ngày {postedDate}</strong> + <strong>tên Facebook</strong> khớp với hồ sơ bên cạnh, và sản phẩm thật nằm cùng khung hình.
          </p>
        </div>

        {/* Hồ sơ người bán */}
        <div className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div className="flex items-center gap-3">
            <Avatar name={seller?.display_name ?? '?'} url={seller?.avatar_url ?? null} size={40} />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900"><span className="truncate">{seller?.display_name ?? '—'}</span>{seller?.is_mod && <ModBadge />}</p>
              <p className="text-xs text-slate-500">{seller?.sold_count ?? 0} đơn bán thành công · tham gia {seller ? new Date(seller.created_at).toLocaleDateString('vi-VN') : '—'}</p>
            </div>
          </div>

          {seller?.facebook_url ? (
            <a href={seller.facebook_url} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary w-full">
              <Facebook className="h-4 w-4" /> Mở Facebook cá nhân của người bán <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Người bán chưa khai báo link Facebook.</p>
          )}

          <p className="flex items-center gap-2 text-sm">
            <Phone className="h-4 w-4 text-slate-400" />
            {contact?.phone ? <><span className="font-mono">{contact.phone}</span> <CopyButton value={contact.phone} /></> : <span className="text-red-600">Chưa có SĐT</span>}
          </p>

          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><Landmark className="h-3.5 w-3.5" /> Tài khoản nhận giải ngân</p>
            {bank ? (
              <>
                <p className="font-medium text-slate-900">{bank.bank_name} · <span className="font-mono">{bank.account_number}</span> <CopyButton value={bank.account_number} /></p>
                <p className="text-slate-700">Chủ TK: <strong>{bank.account_name}</strong></p>
                <p className="mt-1 text-xs text-slate-500">Tên chủ TK phải là tên chính chủ, khớp Facebook / giấy viết tay.</p>
              </>
            ) : (
              <p className="text-red-600">Không tìm thấy tài khoản ngân hàng.</p>
            )}
          </div>
        </div>
      </div>

      {/* Ảnh sản phẩm + mô tả */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900">Ảnh sản phẩm ({listing.images.length})</p>
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {listing.images.map((img, i) => (
            <li key={`${img.url}-${i}`} className="shrink-0">
              <a href={img.url} target="_blank" rel="noopener noreferrer" className="block h-24 w-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                <img src={cldUrl(img.url, { width: 240, height: 240, crop: 'fill' })} alt={`Ảnh ${i + 1}`} loading="lazy" className="h-full w-full object-cover" />
              </a>
            </li>
          ))}
        </ul>
        <p className="whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{listing.description}</p>
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {rejecting ? (
        <div className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-3">
          <p className="text-sm font-medium text-red-900">Lý do từ chối (người bán sẽ thấy để sửa lại)</p>
          <div className="flex flex-wrap gap-1.5">
            {REJECT_PRESETS.map((p) => (
              <button key={p} type="button" className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-xs text-red-800 hover:bg-red-50" onClick={() => setReason(p)}>{p.split(' (')[0]}</button>
            ))}
          </div>
          <textarea className="input" rows={3} maxLength={500} placeholder="Nhập lý do từ chối (tối thiểu 5 ký tự)" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Lý do từ chối" />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" disabled={busy !== null} onClick={() => setRejecting(false)}>Quay lại</button>
            <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busy !== null || reason.trim().length < 5} onClick={() => void run('REJECT')}>
              {busy === 'REJECT' && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận từ chối
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary text-red-700" disabled={busy !== null} onClick={() => setRejecting(true)}><XCircle className="h-4 w-4" /> Từ chối</button>
          <button type="button" className="btn-primary" disabled={busy !== null || !listing.verification_image_url} onClick={() => void run('APPROVE')}>
            {busy === 'APPROVE' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Duyệt lên sàn
          </button>
        </div>
      )}
    </li>
  );
}
