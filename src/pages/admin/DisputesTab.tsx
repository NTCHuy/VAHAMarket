import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ExternalLink, Facebook, Loader2, Phone, ShieldBan, ShieldCheck, Undo2, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { issueWarning, resolveDispute, type DisputeDecision } from '@/lib/admin';
import { cldUrl } from '@/lib/cloudinary';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import CopyButton from '@/components/CopyButton';
import { Alert, Avatar, Field, PageLoader } from '@/components/ui';
import type { Order, Profile, ProfileContact } from '@/types';

export default function DisputesTab({ onChanged }: { onChanged: () => void }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [contacts, setContacts] = useState<Record<string, ProfileContact>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data, error: err } = await supabase.from('orders').select('*').eq('status', 'DISPUTED').order('disputed_at', { ascending: true });
      if (err) throw err;
      const list = (data ?? []) as Order[];
      const ids = Array.from(new Set(list.flatMap((o) => [o.buyer_id, o.seller_id])));
      if (ids.length > 0) {
        const [p, c] = await Promise.all([
          supabase.from('profiles').select('*').in('id', ids),
          supabase.from('profile_contacts').select('*').in('user_id', ids),
        ]);
        if (p.error) throw p.error;
        if (c.error) throw c.error;
        setProfiles(Object.fromEntries(((p.data ?? []) as Profile[]).map((x) => [x.id, x])));
        setContacts(Object.fromEntries(((c.data ?? []) as ProfileContact[]).map((x) => [x.user_id, x])));
      }
      setOrders(list);
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
  if (orders.length === 0) {
    return (
      <div className="card flex flex-col items-center px-4 py-12 text-center">
        <ShieldCheck className="h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Không có khiếu nại nào đang chờ xử lý.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-5">
      {orders.map((o) => (
        <DisputeCard key={o.id} order={o} buyer={profiles[o.buyer_id]} seller={profiles[o.seller_id]}
          buyerContact={contacts[o.buyer_id]} sellerContact={contacts[o.seller_id]}
          onDone={async () => { await load(); onChanged(); }} />
      ))}
    </ul>
  );
}

function Party({ title, profile, contact, extraPhone }: { title: string; profile?: Profile; contact?: ProfileContact; extraPhone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</p>
      <div className="flex items-center gap-2">
        <Avatar name={profile?.display_name ?? '?'} url={profile?.avatar_url ?? null} size={32} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
            <span className="truncate">{profile?.display_name ?? '—'}</span>
            {profile?.is_banned ? (
              <span className="badge bg-red-600 text-white dark:bg-red-600 dark:text-white"><ShieldBan className="mr-1 h-3 w-3" /> Đã bị Ban</span>
            ) : (profile?.warning_count ?? 0) > 0 ? (
              <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">Cảnh báo {profile?.warning_count}/3</span>
            ) : null}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{profile?.sold_count ?? 0} đơn bán · {profile?.bought_count ?? 0} đơn mua</p>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-sm">
        <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          {contact?.phone ? <><span className="font-mono">{contact.phone}</span> <CopyButton value={contact.phone} /></> : <span className="text-slate-400 dark:text-slate-500">Chưa có SĐT/Zalo trong hồ sơ</span>}
        </p>
        {extraPhone && extraPhone !== contact?.phone && (
          <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">SĐT nhận hàng trong đơn: <span className="font-mono">{extraPhone}</span> <CopyButton value={extraPhone} /></p>
        )}
        {(profile?.facebook_url ?? contact?.facebook_url) && (
          <a href={(profile?.facebook_url ?? contact?.facebook_url) as string} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-brand-700 dark:text-brand-400 hover:underline">
            <Facebook className="h-3.5 w-3.5" /> Facebook <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}

function VideoLink({ href, label }: { href: string | null; label: string }) {
  if (!href) return <span className="text-sm text-slate-400 dark:text-slate-500">{label}: không có</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 text-sm text-brand-700 dark:text-brand-400 hover:underline">
      <Video className="h-4 w-4" /> {label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

function DisputeCard({ order, buyer, seller, buyerContact, sellerContact, onDone }: {
  order: Order; buyer?: Profile; seller?: Profile; buyerContact?: ProfileContact; sellerContact?: ProfileContact;
  onDone: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [pending, setPending] = useState<DisputeDecision | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);
  const [warnReason, setWarnReason] = useState('');
  const [warnNotice, setWarnNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteValid = note.trim().length >= 5;

  const sendSellerWarning = async () => {
    if (warnReason.trim().length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const res = await issueWarning(order.seller_id, warnReason, { orderId: order.id, listingId: order.listing_id });
      setWarnOpen(false);
      setWarnReason('');
      setWarnNotice(
        res.auto_banned
          ? `Đã gửi cảnh báo #${res.warning_count} — Người bán tự động bị Ban vĩnh viễn do đạt 3/3 cảnh báo!`
          : `Đã gửi cảnh báo #${res.warning_count}/3 cho người bán.`,
      );
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (decision: DisputeDecision) => {
    setBusy(true);
    setError(null);
    try {
      await resolveDispute(order.id, decision, note.trim());
      await onDone();
    } catch (e) {
      setError(getErrorMessage(e));
      setBusy(false);
      setPending(null);
    }
  };

  return (
    <li className="card space-y-4 border-red-200 dark:border-red-900/70 p-4 sm:p-5">
      <div className="flex gap-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
          {order.listing_snapshot.image && <img src={cldUrl(order.listing_snapshot.image, { width: 160, height: 160, crop: 'fill' })} alt="" className="h-full w-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 font-medium text-slate-900 dark:text-slate-100">{order.listing_snapshot.title}</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">Sàn đang giữ <strong>{formatVND(order.amount)}</strong> · Mã <span className="font-mono">{order.payment_code}</span></p>
          {order.disputed_at && <p className="text-xs text-slate-500 dark:text-slate-400">Khiếu nại lúc {new Date(order.disputed_at).toLocaleString('vi-VN')}</p>}
        </div>
      </div>

      <div className="rounded-xl bg-red-50/60 dark:bg-red-950/40 p-3 text-sm">
        <p className="font-medium text-slate-900 dark:text-slate-100">Lý do khiếu nại của người mua</p>
        <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-200">{order.dispute_reason}</p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
          <VideoLink href={order.dispute_video_url} label="Video unbox của người mua" />
          <VideoLink href={order.packing_video_url} label="Video test của người bán" />
        </div>
        {(order.carrier || order.tracking_code) && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Vận chuyển: {order.carrier} · {order.tracking_code}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Party title="Người mua" profile={buyer} contact={buyerContact} extraPhone={order.phone} />
        <Party title="Người bán" profile={seller} contact={sellerContact} />
      </div>

      <Field label="Ghi chú phán quyết của Admin" htmlFor={`note-${order.id}`} required
        hint="Ghi căn cứ quyết định. Với hoàn tiền, nên ghi luôn mã giao dịch hoàn tiền sau khi bạn chuyển khoản.">
        <textarea id={`note-${order.id}`} rows={3} className="input" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      {warnNotice && <Alert kind="success">{warnNotice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}

      {warnOpen && (
        <div className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800/70 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            Cảnh báo người bán (hiện có {seller?.warning_count ?? 0}/3 cảnh báo — đạt 3 sẽ tự động Ban vĩnh viễn)
          </p>
          <input
            className="input text-sm"
            maxLength={1000}
            placeholder="Nhập lý do cảnh báo (vd: Giao hàng sai mô tả, gửi hàng lỗi cố ý...)"
            value={warnReason}
            onChange={(e) => setWarnReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setWarnOpen(false)}>Hủy</button>
            <button type="button" className="btn bg-amber-600 text-white hover:bg-amber-700" disabled={busy || warnReason.trim().length < 3} onClick={() => void sendSellerWarning()}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận gửi cảnh báo (+1 gậy)
            </button>
          </div>
        </div>
      )}

      {pending ? (
        <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/50 p-3 text-sm text-amber-900 dark:text-amber-200">
          <p>
            {pending === 'REFUND_TO_BUYER'
              ? `Xác nhận HOÀN TIỀN cho người mua? Đơn chuyển sang “Đã hoàn tiền”. Bạn cần tự chuyển khoản ${formatVND(order.amount)} cho người mua (xin STK qua SĐT/Zalo).`
              : `Xác nhận BÁC BỎ khiếu nại? Đơn chuyển sang “Hoàn tất” và vào hàng đợi giải ngân ${formatVND(order.seller_payout)} cho người bán.`}
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setPending(null)} disabled={busy}>Quay lại</button>
            <button type="button" className={pending === 'REFUND_TO_BUYER' ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'} onClick={() => void submit(pending)} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận quyết định
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          {!seller?.is_banned && (
            <button type="button" className="btn-secondary text-amber-800 dark:text-amber-300" disabled={busy} onClick={() => setWarnOpen((v) => !v)}>
              <AlertTriangle className="h-4 w-4" /> Cảnh báo người bán
            </button>
          )}
          <button type="button" className="btn-secondary text-red-700 dark:text-red-400" disabled={!noteValid} onClick={() => setPending('REFUND_TO_BUYER')}>
            <Undo2 className="h-4 w-4" /> Hoàn tiền cho người mua
          </button>
          <button type="button" className="btn-primary" disabled={!noteValid} onClick={() => setPending('RELEASE_TO_SELLER')}>
            <ShieldCheck className="h-4 w-4" /> Bác bỏ khiếu nại &amp; Giải ngân cho người bán
          </button>
        </div>
      )}
    </li>
  );
}
