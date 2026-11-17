import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cldUrl } from '@/lib/cloudinary';
import { getErrorMessage } from '@/lib/errors';
import { Alert, PageLoader } from '@/components/ui';
import PriceTag from '@/components/PriceTag';
import { discountPercent } from '@/lib/money';
import type { Listing, ListingStatus } from '@/types';

const STATUS_BADGE: Record<ListingStatus, { label: string; cls: string }> = {
  active: { label: 'Đang bán', cls: 'bg-emerald-50 text-emerald-700' },
  draft: { label: 'Nháp', cls: 'bg-slate-100 text-slate-700' },
  hidden: { label: 'Đang ẩn', cls: 'bg-amber-50 text-amber-700' },
  reserved: { label: 'Đang giữ chỗ', cls: 'bg-brand-50 text-brand-800' },
  sold: { label: 'Đã bán', cls: 'bg-slate-100 text-slate-500' },
  removed: { label: 'Đã gỡ', cls: 'bg-red-50 text-red-700' },
};

const EDITABLE: ListingStatus[] = ['draft', 'active', 'hidden'];

export default function MyListings() {
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

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="card px-4 py-12 text-center text-sm text-slate-600">Bạn chưa đăng tin nào.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((l) => {
            const badge = STATUS_BADGE[l.status];
            const editable = EDITABLE.includes(l.status);
            return (
              <li key={l.id} className="card flex gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 sm:h-24 sm:w-24">
                  {l.images[0] && <img src={cldUrl(l.images[0].url, { width: 200, height: 200, crop: 'fill' })} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-slate-900">{l.title}</p>
                  <div className="mt-0.5"><PriceTag display={l.price} strike={l.original_price} percent={discountPercent(l.price, l.original_price)} /></div>
                  <span className={`badge mt-1 ${badge.cls}`}>{badge.label}</span>
                  {editable && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link to={`/sell/${l.id}/edit`} className="btn-secondary px-3 py-1.5"><Pencil className="h-3.5 w-3.5" /> Sửa</Link>
                      {confirmId === l.id ? (
                        <>
                          <button type="button" className="btn bg-red-600 px-3 py-1.5 text-white hover:bg-red-700" disabled={busyId === l.id} onClick={() => onDelete(l.id)}>
                            {busyId === l.id && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận xóa
                          </button>
                          <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setConfirmId(null)}>Hủy</button>
                        </>
                      ) : (
                        <button type="button" className="btn-ghost px-3 py-1.5 text-red-600 hover:bg-red-50" onClick={() => setConfirmId(l.id)}>
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
