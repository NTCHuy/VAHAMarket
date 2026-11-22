import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { getErrorMessage } from '@/lib/errors';
import { Alert } from '@/components/ui';
import { ListRowsSkeleton } from '@/components/Skeletons';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import PriceTag from '@/components/PriceTag';
import NotificationHint from '@/components/NotificationHint';
import { discountPercent } from '@/lib/money';
import type { Listing, ListingStatus } from '@/types';

const STATUS_BADGE: Record<ListingStatus, { label: string; cls: string }> = {
  active: { label: 'Đang bán', cls: 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400' },
  draft: { label: 'Nháp', cls: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200' },
  pending_review: { label: 'Chờ duyệt', cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' },
  rejected: { label: 'Bị từ chối', cls: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400' },
  hidden: { label: 'Đang ẩn', cls: 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' },
  reserved: { label: 'Đang giữ chỗ', cls: 'bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300' },
  sold: { label: 'Đã bán', cls: 'bg-neutral-100 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400' },
  removed: { label: 'Đã gỡ', cls: 'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-400' },
};

const EDITABLE: ListingStatus[] = ['draft', 'pending_review', 'rejected', 'active', 'hidden'];

export default function MyListings() {
  useDocumentTitle('Tin đăng của tôi');
  const { user } = useAuth();
  const [items, setItems] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from('listings')
      .select('*')
      .eq('seller_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (!active) return;
        if (err) setError(getErrorMessage(err));
        else setItems((data ?? []) as Listing[]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const onDelete = async (id: string) => {
    setBusyId(id);
    setError(null);
    const { error: err } = await supabase.from('listings').delete().eq('id', id);
    setBusyId(null);
    setConfirmId(null);
    if (err) setError(getErrorMessage(err));
    else setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Tin đăng của tôi</h1>
        <Link to="/sell" className="btn-primary"><Plus className="h-4 w-4" /> Đăng bán</Link>
      </div>

      <NotificationHint prominent={items.some((i) => i.status === 'pending_review')} />

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <ListRowsSkeleton count={4} />
      ) : items.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-neutral-600 dark:text-neutral-400">Bạn chưa đăng tin nào.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((l) => {
            const badge = STATUS_BADGE[l.status];
            const editable = EDITABLE.includes(l.status);
            return (
              <li key={l.id} className="card flex gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-800 sm:h-24 sm:w-24">
                  {l.images[0] && <img src={cldUrl(l.images[0].url, { width: 200, height: 200, crop: 'fill' })} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-neutral-900 dark:text-neutral-100">{l.title}</p>
                  <div className="mt-0.5"><PriceTag display={l.price} strike={l.original_price} percent={discountPercent(l.price, l.original_price)} /></div>
                  <span className={`badge mt-1 ${badge.cls}`}>{badge.label}</span>
                  {l.status === 'pending_review' && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Đang chờ Admin duyệt — chưa hiển thị công khai.</p>}
                  {l.status === 'rejected' && l.rejection_reason && (
                    <p className="mt-1.5 rounded-lg bg-red-50 dark:bg-red-950/50 px-2.5 py-1.5 text-xs text-red-800 dark:text-red-300"><strong>Lý do từ chối:</strong> {l.rejection_reason}</p>
                  )}
                  {editable && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link to={`/sell/${l.id}/edit`} className="btn-secondary px-3 py-1.5"><Pencil className="h-3.5 w-3.5" /> {l.status === 'rejected' ? 'Sửa & gửi lại' : 'Sửa'}</Link>
                      {confirmId === l.id ? (
                        <>
                          <button type="button" className="btn bg-red-600 px-3 py-1.5 text-white hover:bg-red-700" disabled={busyId === l.id} onClick={() => onDelete(l.id)}>
                            {busyId === l.id && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận xóa
                          </button>
                          <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setConfirmId(null)}>Hủy</button>
                        </>
                      ) : (
                        <button type="button" className="btn-ghost px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60" onClick={() => setConfirmId(l.id)}>
                          <Trash2 className="h-3.5 w-3.5" /> Xóa
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
