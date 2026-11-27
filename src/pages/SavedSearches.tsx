import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bell, ExternalLink, Loader2, Plus, Search, Trash2 } from 'lucide-react';
import { CATEGORIES } from '@/constants/categories';
import { PROVINCES } from '@/constants/provinces';
import {
  createSavedSearch,
  deleteSavedSearch,
  listMySavedSearches,
  toggleSavedSearch,
} from '@/lib/lifecycle';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { Alert, PageLoader } from '@/components/ui';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import type { SavedSearch } from '@/types';

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.label]),
);

function buildSearchUrl(item: SavedSearch): string {
  const params = new URLSearchParams();
  params.set('q', item.keyword);
  if (item.category) params.set('category', item.category);
  if (item.province) params.set('province', item.province);
  if (item.max_price) params.set('max', String(item.max_price));
  return `/?${params.toString()}`;
}

export default function SavedSearches() {
  useDocumentTitle('Theo dõi từ khóa — Săn kèo');

  const [items, setItems] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState('');
  const [province, setProvince] = useState('');
  const [maxPriceText, setMaxPriceText] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listMySavedSearches());
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = keyword.trim();
    if (trimmed.length < 2) {
      setError('Từ khóa cần tối thiểu 2 ký tự.');
      return;
    }

    const numericMax = maxPriceText.trim()
      ? Number(maxPriceText.replace(/[^0-9]/g, ''))
      : null;

    if (numericMax !== null && (numericMax < 10_000 || numericMax > 1_000_000_000)) {
      setError('Giá tối đa cần từ 10.000đ đến 1 tỷ đồng.');
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await createSavedSearch({
        keyword: trimmed,
        category: category || undefined,
        province: province || undefined,
        maxPrice: numericMax,
      });
      setKeyword('');
      setCategory('');
      setProvince('');
      setMaxPriceText('');
      setNotice('Đã thêm từ khóa theo dõi. Khi có tin mới khớp được duyệt, hệ thống sẽ báo ngay.');
      await load();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (item: SavedSearch) => {
    setBusyId(item.id);
    setError(null);
    try {
      const updated = await toggleSavedSearch(item.id, !item.is_active);
      setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await deleteSavedSearch(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Theo dõi từ khóa (Săn kèo)</h1>
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            Nhận thông báo tự động ngay khi có tin mới được duyệt khớp với sản phẩm bạn đang tìm ({items.length}/15).
          </p>
        </div>
        <Link to="/notifications" className="btn-secondary h-9 px-3 text-xs">
          <Bell size={14} /> Hộp thông báo
        </Link>
      </div>

      <form onSubmit={(e) => void handleCreate(e)} className="card space-y-3 p-4">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Thêm từ khóa mới
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Từ khóa sản phẩm <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              maxLength={60}
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Ví dụ: Blessing 3, HD600, Mojo 2, FiiO M11..."
              className="input h-9 text-sm"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Danh mục (tùy chọn)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input h-9 text-xs"
            >
              <option value="">Tất cả danh mục</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Khu vực (tùy chọn)
            </label>
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="input h-9 text-xs"
            >
              <option value="">Mọi khu vực</option>
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
              Giá tối đa (VND, tùy chọn)
            </label>
            <input
              type="number"
              min={10000}
              max={1000000000}
              step={50000}
              value={maxPriceText}
              onChange={(e) => setMaxPriceText(e.target.value)}
              placeholder="Ví dụ: 5000000"
              className="input h-9 text-xs tabular-nums"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving || items.length >= 15}
              className="btn-primary h-9 w-full text-xs sm:w-auto sm:px-4"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus size={14} />}
              Theo dõi từ khóa
            </button>
          </div>
        </div>
      </form>

      {error && <Alert kind="error">{error}</Alert>}
      {notice && <Alert kind="success">{notice}</Alert>}

      {loading ? (
        <PageLoader />
      ) : items.length === 0 ? (
        <div className="card flex flex-col items-center px-4 py-12 text-center">
          <Search className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Bạn chưa theo dõi từ khóa nào.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item) => {
            const isBusy = busyId === item.id;
            return (
              <li key={item.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-950 dark:text-neutral-50">
                      &ldquo;{item.keyword}&rdquo;
                    </span>
                    <span
                      className={`badge ${
                        item.is_active
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                      }`}
                    >
                      {item.is_active ? 'Đang bật' : 'Tạm tắt'}
                    </span>
                    {item.match_count > 0 && (
                      <span className="text-xs font-medium tabular-nums text-blue-700 dark:text-blue-400">
                        Đã khớp {item.match_count} tin
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {item.category ? CATEGORY_LABELS[item.category] ?? item.category : 'Mọi danh mục'} ·{' '}
                    {item.province ?? 'Mọi khu vực'}
                    {item.max_price ? ` · Giá <= ${formatVND(item.max_price)}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Link to={buildSearchUrl(item)} className="btn-secondary h-8 px-2.5 text-xs">
                    <ExternalLink size={12} /> Tìm ngay
                  </Link>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleToggle(item)}
                    className="btn-secondary h-8 px-2.5 text-xs"
                  >
                    {item.is_active ? 'Tạm tắt' : 'Bật lại'}
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleDelete(item.id)}
                    aria-label="Xóa từ khóa"
                    className="btn-ghost h-8 px-2 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
                  >
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 size={14} />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
