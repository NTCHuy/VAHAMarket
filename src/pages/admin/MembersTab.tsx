import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Ban,
  ExternalLink,
  Eye,
  Landmark,
  Loader2,
  Phone,
  Search,
  ShieldCheck,
  ShieldOff,
  Users,
} from 'lucide-react';
import { searchMembers, setMod } from '@/lib/admin';
import { getErrorMessage } from '@/lib/errors';
import { safeHttpUrl } from '@/lib/url';
import ModBadge from '@/components/ModBadge';
import { Alert, Avatar, PageLoader } from '@/components/ui';
import type { AdminMemberFilter, AdminMemberSummary } from '@/types';

const PAGE = 30;

const FILTERS: { id: AdminMemberFilter; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'mod', label: 'Mod' },
  { id: 'warned', label: 'Có cảnh báo' },
  { id: 'banned', label: 'Đã khóa' },
  { id: 'incomplete', label: 'Thiếu hồ sơ bán' },
  { id: 'sellers', label: 'Có tin bán' },
];

export default function MembersTab({
  onChanged,
  onInspectMember,
  refreshSignal = 0,
}: {
  onChanged?: () => void;
  onInspectMember?: (userId: string) => void;
  refreshSignal?: number;
}) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<AdminMemberFilter>('all');
  const [items, setItems] = useState<AdminMemberSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await searchMembers({ query: debounced, filter, limit: PAGE, offset: 0 });
      setItems(res.items);
      setTotal(res.total);
      setError(null);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [debounced, filter, refreshSignal]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    setDebounced(query.trim());
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await searchMembers({ query: debounced, filter, limit: PAGE, offset: items.length });
      setItems((prev) => [...prev, ...res.items]);
      setTotal(res.total);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleMod = async (m: AdminMemberSummary) => {
    setBusyId(m.profile.id);
    setError(null);
    try {
      const updated = await setMod(m.profile.id, !m.profile.is_mod);
      setItems((prev) =>
        prev.map((row) => (row.profile.id === updated.id ? { ...row, profile: updated } : row)),
      );
      onChanged?.();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Tra cứu hồ sơ đầy đủ của thành viên (SĐT, Facebook, ngân hàng, thiết bị, tin đăng, đơn hàng) để phục vụ kiểm duyệt và quản lý huy hiệu Mod.
      </p>

      <form onSubmit={onSearchSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            className="input pl-9"
            placeholder="Tìm theo tên, email, SĐT, link Facebook, số TK ngân hàng hoặc UUID..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Tìm thành viên"
          />
        </div>
        <button type="submit" className="btn-primary">
          Tìm
        </button>
      </form>

      <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f.id
                ? 'border-brand-600 bg-brand-50 text-brand-800 dark:border-brand-500 dark:bg-brand-900/40 dark:text-brand-300'
                : 'border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <Alert kind="error">{error}</Alert>}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Users className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Không tìm thấy thành viên nào phù hợp.</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{total} thành viên</p>
          <ul className="space-y-3">
            {items.map((m) => {
              const p = m.profile;
              const safeFb = safeHttpUrl(p.facebook_url);
              return (
                <li
                  key={p.id}
                  className={`card flex flex-wrap items-start justify-between gap-3 p-3.5 ${
                    p.is_banned ? 'border-red-200 dark:border-red-900/70' : ''
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <Avatar name={p.display_name} url={p.avatar_url} size={40} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                          {p.display_name}
                        </span>
                        {m.is_admin && (
                          <span className="badge border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
                            Admin
                          </span>
                        )}
                        {p.is_mod && <ModBadge full />}
                        {p.is_banned ? (
                          <span className="badge bg-red-600 text-white dark:bg-red-600 dark:text-white">
                            <Ban className="mr-1 h-3 w-3" /> Đã khóa
                          </span>
                        ) : p.warning_count > 0 ? (
                          <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                            Cảnh báo {p.warning_count}/3
                          </span>
                        ) : null}
                        {m.shared_device_count > 0 && (
                          <span className="badge border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300">
                            Trùng thiết bị ({m.shared_device_count})
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                        <span>{m.email ?? 'Chưa có email'}</span>
                        {m.phone ? (
                          <span className="inline-flex items-center gap-1 font-mono">
                            <Phone className="h-3 w-3" /> {m.phone}
                          </span>
                        ) : (
                          <span className="text-neutral-400">Chưa có SĐT</span>
                        )}
                        {safeFb && (
                          <a
                            href={safeFb}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 text-brand-700 hover:underline dark:text-brand-400"
                          >
                            Facebook <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Landmark className="h-3 w-3" /> {m.bank_count} TK
                        </span>
                      </div>

                      <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                        {m.active_listings_count}/{m.total_listings_count} tin · {p.sold_count} đơn bán · {p.bought_count} đơn mua ·{' '}
                        {m.device_count} thiết bị · tham gia {new Date(p.created_at).toLocaleDateString('vi-VN')}
                        {m.missing_seller_fields.length > 0 && (
                          <span className="text-amber-700 dark:text-amber-400">
                            {' '}· Thiếu: {m.missing_seller_fields.join(', ')}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {onInspectMember && (
                      <button
                        type="button"
                        onClick={() => onInspectMember(p.id)}
                        className="btn-primary px-3 py-1.5 text-xs"
                      >
                        <Eye className="h-3.5 w-3.5" /> Xem hồ sơ
                      </button>
                    )}
                    <button
                      type="button"
                      className={p.is_mod ? 'btn-secondary px-3 py-1.5 text-xs text-red-700 dark:text-red-400' : 'btn-secondary px-3 py-1.5 text-xs'}
                      disabled={busyId === p.id}
                      onClick={() => void toggleMod(m)}
                    >
                      {busyId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : p.is_mod ? (
                        <ShieldOff className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {p.is_mod ? 'Gỡ Mod' : 'Gắn Mod'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {items.length < total && (
            <div className="flex justify-center">
              <button type="button" className="btn-secondary" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />} Xem thêm
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
