import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ArrowRight, ImagePlus, Landmark, Loader2, RefreshCw, Truck, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { cldUrl, uploadImage, validateImage } from '@/lib/cloudinary';
import { calcEscrow, formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { BOX_STATUS_OPTIONS, CATEGORIES, LISTING_CONDITIONS, type BoxStatus, type ListingCondition } from '@/constants/categories';
import { PLATFORM_FEE_RATE } from '@/constants/payment';
import { PROVINCES } from '@/constants/provinces';
import { Alert, Field, PageLoader } from '@/components/ui';
import type { BankAccount, Listing, ListingStatus } from '@/types';

const MAX_IMAGES = 6;
const MIN_PRICE = 10_000;
const MAX_PRICE = 1_000_000_000;

/** Route /sell và /sell/:id/edit dùng chung form; `key` đảm bảo form được dựng lại khi đổi tin. */
export default function CreateListingPage() {
  const { id } = useParams<{ id: string }>();
  return <ListingForm key={id ?? 'new'} listingId={id} />;
}

interface ImageItem {
  key: string;
  url: string | null;
  publicId?: string;
  width?: number;
  height?: number;
  preview: string;
  progress: number;
  state: 'uploading' | 'done' | 'error';
  error?: string;
  file?: File;
  isObjectUrl: boolean;
}

type EditableStatus = Extract<ListingStatus, 'draft' | 'active' | 'hidden'>;

const STATUS_LABEL: Record<EditableStatus, string> = {
  active: 'Đang bán (hiển thị công khai)',
  draft: 'Nháp (chỉ mình tôi thấy)',
  hidden: 'Tạm ẩn',
};

let keySeq = 0;
const nextKey = () => `img-${Date.now()}-${keySeq++}`;

function ListingForm({ listingId }: { listingId?: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isEdit = Boolean(listingId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [locked, setLocked] = useState<ListingStatus | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);

  const [images, setImages] = useState<ImageItem[]>([]);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [condition, setCondition] = useState<ListingCondition | ''>('');
  const [boxStatus, setBoxStatus] = useState<BoxStatus>('full');
  const [priceText, setPriceText] = useState('');
  const [province, setProvince] = useState('');
  const [shipCod, setShipCod] = useState(true);
  const [description, setDescription] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [status, setStatus] = useState<EditableStatus>('active');

  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState<'publish' | 'draft' | 'save' | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const imagesRef = useRef<ImageItem[]>([]);
  imagesRef.current = images;

  // Giải phóng object URL khi rời trang
  useEffect(
    () => () => {
      imagesRef.current.forEach((i) => i.isObjectUrl && URL.revokeObjectURL(i.preview));
    },
    [],
  );

  // Tải tài khoản ngân hàng (+ tin cần sửa)
  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      try {
        const bankRes = await supabase
          .from('bank_accounts')
          .select('*')
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: true });
        if (bankRes.error) throw bankRes.error;
        const banks = (bankRes.data ?? []) as BankAccount[];
        if (!active) return;
        setAccounts(banks);

        if (listingId) {
          const res = await supabase.from('listings').select('*').eq('id', listingId).maybeSingle();
          if (res.error) throw res.error;
          const l = res.data as Listing | null;
          if (!l || l.seller_id !== user.id) throw new Error('Không tìm thấy tin đăng hoặc bạn không có quyền sửa.');
          if (!active) return;
          if (!['draft', 'active', 'hidden'].includes(l.status)) {
            setLocked(l.status);
            return;
          }
          setTitle(l.title);
          setBrand(l.brand ?? '');
          setCategory(l.category);
          setCondition(l.condition);
          setBoxStatus(l.box_status);
          setPriceText(String(l.price));
          setProvince(l.province ?? '');
          setShipCod(l.ship_cod);
          setDescription(l.description);
          setStatus(l.status as EditableStatus);
          setBankAccountId(l.bank_account_id ?? banks[0]?.id ?? '');
          setImages(
            l.images.map((img) => ({
              key: nextKey(),
              url: img.url,
              publicId: img.publicId,
              width: img.width,
              height: img.height,
              preview: cldUrl(img.url, { width: 400, height: 400, crop: 'fill' }),
              progress: 100,
              state: 'done',
              isObjectUrl: false,
            })),
          );
        } else {
          setBankAccountId(banks[0]?.id ?? ''); // đã sắp xếp: tài khoản mặc định đứng đầu
        }
      } catch (e) {
        if (active) setLoadError(getErrorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user, listingId]);

  /* ----------------------------- Ảnh ----------------------------- */
  const patchImage = useCallback((key: string, patch: Partial<ImageItem>) => {
    setImages((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }, []);

  const startUpload = useCallback(
    async (key: string, file: File) => {
      patchImage(key, { state: 'uploading', progress: 0, error: undefined });
      try {
        const r = await uploadImage(file, {
          folder: 'listings',
          onProgress: (p) => patchImage(key, { progress: p }),
        });
        patchImage(key, { url: r.url, publicId: r.publicId, width: r.width, height: r.height, state: 'done', progress: 100 });
      } catch (e) {
        patchImage(key, { state: 'error', error: getErrorMessage(e) });
      }
    },
    [patchImage],
  );

  const onPickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ''; // cho phép chọn lại cùng 1 file
    if (files.length === 0) return;

    const room = MAX_IMAGES - images.length;
    const notices: string[] = [];
    if (files.length > room) notices.push(`Chỉ thêm được tối đa ${MAX_IMAGES} ảnh; đã bỏ qua ${files.length - room} ảnh.`);

    const accepted: ImageItem[] = [];
    for (const file of files.slice(0, Math.max(room, 0))) {
      const invalid = validateImage(file);
      if (invalid) {
        notices.push(`${file.name}: ${invalid}`);
        continue;
      }
      accepted.push({
        key: nextKey(),
        url: null,
        preview: URL.createObjectURL(file),
        progress: 0,
        state: 'uploading',
        file,
        isObjectUrl: true,
      });
    }
    setImageNotice(notices.length ? notices.join(' ') : null);
    if (accepted.length === 0) return;
    setImages((prev) => [...prev, ...accepted]);
    accepted.forEach((i) => void startUpload(i.key, i.file!));
  };

  const moveImage = (index: number, dir: -1 | 1) => {
    setImages((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const removeImage = (key: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.key === key);
      if (item?.isObjectUrl) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.key !== key);
    });
  };

  /* ----------------------------- Giá & phí ----------------------------- */
  const price = priceText ? parseInt(priceText, 10) : 0;
  const priceValid = Number.isInteger(price) && price >= MIN_PRICE && price <= MAX_PRICE;
  const escrow = useMemo(() => (priceValid ? calcEscrow(price) : null), [price, priceValid]);

  /* ----------------------------- Validate ----------------------------- */
  const uploading = images.some((i) => i.state === 'uploading');
  const uploadFailed = images.some((i) => i.state === 'error');

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (images.length === 0) e.images = 'Cần ít nhất 1 ảnh.';
    else if (uploading) e.images = 'Đang tải ảnh lên, vui lòng đợi.';
    else if (uploadFailed) e.images = 'Có ảnh tải lên thất bại. Hãy thử lại hoặc xóa ảnh đó.';
    const t = title.trim();
    if (t.length < 5 || t.length > 120) e.title = 'Tiêu đề từ 5 đến 120 ký tự.';
    if (!category) e.category = 'Chọn phân loại.';
    if (!condition) e.condition = 'Chọn tình trạng ngoại hình.';
    if (!priceValid) e.price = `Giá bán từ ${formatVND(MIN_PRICE)} đến ${formatVND(MAX_PRICE)}.`;
    if (!province && !shipCod) e.delivery = 'Chọn ít nhất một hình thức: giao dịch trực tiếp hoặc ship COD.';
    const d = description.trim();
    if (d.length < 10 || d.length > 5000) e.description = 'Mô tả từ 10 đến 5000 ký tự.';
    if (!bankAccountId) e.bank = 'Chọn tài khoản ngân hàng nhận tiền.';
    return e;
  }, [images.length, uploading, uploadFailed, title, category, condition, priceValid, province, shipCod, description, bankAccountId]);

  /* ----------------------------- Lưu ----------------------------- */
  const save = async (targetStatus: EditableStatus, mode: 'publish' | 'draft' | 'save') => {
    setSubmitted(true);
    setSaveError(null);
    if (Object.keys(errors).length > 0 || !condition) return;

    setSaving(mode);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        price,
        category,
        condition,
        brand: brand.trim() || null,
        province: province || null,
        box_status: boxStatus,
        ship_cod: shipCod,
        images: images.map((i) => ({ url: i.url, publicId: i.publicId, width: i.width, height: i.height })),
        bank_account_id: bankAccountId,
        status: targetStatus,
      };
      const res = listingId
        ? await supabase.from('listings').update(payload).eq('id', listingId).select('id').single()
        : await supabase.from('listings').insert(payload).select('id').single();
      if (res.error) throw res.error;
      navigate('/my-listings');
    } catch (e) {
      setSaveError(getErrorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void save(isEdit ? status : 'active', isEdit ? 'save' : 'publish');
  };

  /* ----------------------------- Render ----------------------------- */
  if (loading) return <PageLoader />;

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Alert kind="error">{loadError}</Alert>
        <Link to="/my-listings" className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Về tin đăng của tôi</Link>
      </div>
    );
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        <Alert kind="info">
          Tin này đang ở trạng thái “{locked === 'reserved' ? 'đang giữ chỗ (có đơn hàng)' : locked === 'sold' ? 'đã bán' : 'đã bị gỡ'}” nên không thể chỉnh sửa.
        </Alert>
        <Link to="/my-listings" className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Về tin đăng của tôi</Link>
      </div>
    );
  }

  const show = (key: string) => (submitted ? errors[key] : undefined);
  const busy = saving !== null;

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-3xl space-y-6" noValidate>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{isEdit ? 'Sửa tin đăng' : 'Đăng bán đồ audio'}</h1>
        <p className="mt-1 text-sm text-slate-600">Mô tả trung thực, ảnh rõ nét sẽ giúp bạn bán nhanh và tránh tranh chấp.</p>
      </div>

      {/* Ảnh */}
      <section className="card space-y-3 p-5 sm:p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold">Hình ảnh <span className="text-red-500">*</span></h2>
          <span className="text-xs text-slate-500">{images.length}/{MAX_IMAGES} ảnh · ảnh đầu tiên là ảnh bìa</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, index) => (
            <div key={img.key} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <div className="relative aspect-square">
                <img src={img.preview} alt={`Ảnh ${index + 1}`} className="h-full w-full object-cover" />
                {index === 0 && <span className="absolute left-2 top-2 rounded-md bg-slate-900/80 px-1.5 py-0.5 text-[11px] font-medium text-white">Ảnh bìa</span>}
                <button
                  type="button"
                  onClick={() => removeImage(img.key)}
                  aria-label={`Xóa ảnh ${index + 1}`}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </button>
                {img.state === 'uploading' && (
                  <div className="absolute inset-x-0 bottom-0 bg-white/90 px-2 py-1.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${img.progress}%` }} />
                    </div>
                  </div>
                )}
                {img.state === 'error' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/90 p-2 text-center">
                    <p className="line-clamp-2 text-xs text-red-600">{img.error}</p>
                    {img.file && (
                      <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => void startUpload(img.key, img.file!)}>
                        <RefreshCw className="h-3.5 w-3.5" /> Thử lại
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex justify-between border-t border-slate-200 bg-white px-1 py-1">
                <button type="button" className="btn-ghost px-2 py-1" disabled={index === 0} onClick={() => moveImage(index, -1)} aria-label="Chuyển ảnh sang trái">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button type="button" className="btn-ghost px-2 py-1" disabled={index === images.length - 1} onClick={() => moveImage(index, 1)} aria-label="Chuyển ảnh sang phải">
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          {images.length < MAX_IMAGES && (
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 transition-colors hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700">
              <ImagePlus className="h-6 w-6" />
              <span className="text-xs font-medium">Thêm ảnh</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple className="sr-only" onChange={onPickFiles} />
            </label>
          )}
        </div>
        {imageNotice && <p className="text-xs text-amber-700">{imageNotice}</p>}
        {show('images') && <p className="text-xs text-red-600">{show('images')}</p>}
      </section>

      {/* Thông tin sản phẩm */}
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Thông tin sản phẩm</h2>

        <Field label="Tiêu đề" htmlFor="title" required error={show('title')} hint="Ghi rõ hãng + model, ví dụ: Sennheiser HD 650 fullbox.">
          <input id="title" className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phân loại" htmlFor="category" required error={show('category')}>
            <select id="category" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">— Chọn phân loại —</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Thương hiệu" htmlFor="brand" hint="Không bắt buộc.">
            <input id="brand" className="input" value={brand} maxLength={60} onChange={(e) => setBrand(e.target.value)} />
          </Field>
        </div>

        <fieldset>
          <legend className="label">Tình trạng ngoại hình <span className="text-red-500">*</span></legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {LISTING_CONDITIONS.map((c) => (
              <label
                key={c.id}
                className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                  condition === c.id ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input type="radio" name="condition" value={c.id} checked={condition === c.id} onChange={() => setCondition(c.id)} className="sr-only" />
                <span className="block text-sm font-medium text-slate-900">{c.label}</span>
                <span className="block text-xs text-slate-500">{c.hint}</span>
              </label>
            ))}
          </div>
          {show('condition') && <p className="mt-1 text-xs text-red-600">{show('condition')}</p>}
        </fieldset>

        <Field label="Tình trạng hộp & phụ kiện" htmlFor="box">
          <select id="box" className="input" value={boxStatus} onChange={(e) => setBoxStatus(e.target.value as BoxStatus)}>
            {BOX_STATUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Mô tả chi tiết" htmlFor="description" required error={show('description')} hint={`${description.trim().length}/5000 ký tự. Nêu rõ lý do bán, thời gian sử dụng, lỗi (nếu có).`}>
          <textarea id="description" rows={6} className="input" value={description} maxLength={5000} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </section>

      {/* Giá */}
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Giá bán</h2>
        <Field label="Giá bán (VNĐ)" htmlFor="price" required error={show('price')}>
          <div className="relative">
            <input
              id="price"
              className="input pr-12 text-right font-mono"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0"
              value={priceText ? new Intl.NumberFormat('vi-VN').format(parseInt(priceText, 10)) : ''}
              onChange={(e) => setPriceText(e.target.value.replace(/\D/g, '').slice(0, 10))}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">đ</span>
          </div>
        </Field>

        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 text-sm">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-slate-600">Giá bán</dt>
            <dd className="font-medium text-slate-900">{escrow ? formatVND(escrow.amount) : '—'}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-slate-600">Phí trung gian ({Math.round(PLATFORM_FEE_RATE * 100)}%)</dt>
            <dd className="font-medium text-red-600">{escrow ? `− ${formatVND(escrow.platformFee)}` : '—'}</dd>
          </div>
          <div className="flex justify-between px-4 py-3">
            <dt className="font-medium text-slate-900">Bạn thực nhận</dt>
            <dd className="text-base font-semibold text-brand-800">{escrow ? formatVND(escrow.sellerPayout) : '—'}</dd>
          </div>
        </dl>
        <p className="text-xs text-slate-500">Người mua chuyển đúng giá bán vào tài khoản trung gian. Sau khi họ xác nhận nhận hàng, sàn giữ phí và chuyển phần còn lại cho bạn.</p>
      </section>

      {/* Giao nhận */}
      <section className="card space-y-4 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Hình thức giao nhận</h2>
        <Field label="Khu vực giao dịch trực tiếp" htmlFor="province" hint="Bỏ trống nếu bạn chỉ gửi hàng, không gặp trực tiếp.">
          <select id="province" className="input" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">— Không giao dịch trực tiếp —</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50">
          <input type="checkbox" checked={shipCod} onChange={(e) => setShipCod(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700" />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900"><Truck className="h-4 w-4 text-slate-400" /> Ship COD — người mua trả phí ship</span>
            <span className="mt-0.5 block text-xs text-slate-500">Bạn gửi hàng qua bưu tá; người mua tự thanh toán phí ship cho bưu tá khi nhận hàng (không tính vào tiền trung gian).</span>
          </span>
        </label>
        {show('delivery') && <p className="text-xs text-red-600">{show('delivery')}</p>}
      </section>

      {/* Tài khoản nhận tiền */}
      <section className="card space-y-3 p-5 sm:p-6">
        <h2 className="text-base font-semibold">Tài khoản ngân hàng nhận tiền <span className="text-red-500">*</span></h2>
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-900"><AlertTriangle className="h-4 w-4" /> Bạn chưa có tài khoản ngân hàng nào.</p>
            <p className="mt-1 text-sm text-amber-800">Cần thêm ít nhất một tài khoản trong Cài đặt để nhận tiền sau khi bán.</p>
            <Link to="/settings" className="btn-primary mt-3"><Landmark className="h-4 w-4" /> Đến Cài đặt tài khoản</Link>
          </div>
        ) : (
          <Field label="Chọn tài khoản" htmlFor="bank" error={show('bank')} hint="Muốn thêm tài khoản khác? Vào Cài đặt tài khoản.">
            <select id="bank" className="input" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.bank_name} · {a.account_number} · {a.account_name}{a.is_default ? ' (mặc định)' : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
      </section>

      {isEdit && (
        <section className="card p-5 sm:p-6">
          <Field label="Trạng thái tin" htmlFor="status">
            <select id="status" className="input" value={status} onChange={(e) => setStatus(e.target.value as EditableStatus)}>
              {(Object.keys(STATUS_LABEL) as EditableStatus[]).map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </section>
      )}

      {saveError && <Alert kind="error">{saveError}</Alert>}
      {submitted && Object.keys(errors).length > 0 && <Alert kind="error">Vui lòng kiểm tra lại các mục được đánh dấu đỏ.</Alert>}

      <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:p-0">
        <Link to="/my-listings" className="btn-ghost">Hủy</Link>
        {isEdit ? (
          <button type="submit" className="btn-primary" disabled={busy}>
            {saving === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} Lưu thay đổi
          </button>
        ) : (
          <>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => void save('draft', 'draft')}>
              {saving === 'draft' && <Loader2 className="h-4 w-4 animate-spin" />} Lưu nháp
            </button>
            <button type="submit" className="btn-primary" disabled={busy}>
              {saving === 'publish' && <Loader2 className="h-4 w-4 animate-spin" />} Đăng bán
            </button>
          </>
        )}
      </div>
    </form>
  );
}
