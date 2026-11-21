import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  CheckCircle2,
  Circle,
  Landmark,
  Loader2,
  Lock,
  Plus,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getErrorMessage, isBankInUseError } from '@/lib/errors';
import { removeVietnameseTones } from '@/lib/vietqr';
import { BANKS, getBankByBin } from '@/constants/banks';
import { PROVINCES } from '@/constants/provinces';
import { Alert, Field, PageLoader, Spinner } from '@/components/ui';
import type { BankAccount } from '@/types';

const PHONE_RE = /^[0-9+ ]{8,15}$/;
const FACEBOOK_RE = /^https?:\/\/([a-z0-9-]+\.)?(facebook\.com|fb\.com|fb\.me)\/.+$/i;

interface IdentityLock {
  locked: boolean;
  listings: number;
  orders: number;
}

const EMPTY_LOCK: IdentityLock = { locked: false, listings: 0, orders: 0 };

/** Tên chủ TK: IN HOA, không dấu, chỉ chữ cái và khoảng trắng. */
const toAccountName = (v: string) =>
  removeVietnameseTones(v).replace(/[^A-Za-z ]/g, '').replace(/^\s+/, '').replace(/\s+/g, ' ').toUpperCase().slice(0, 50);

function formatLockSummary(lock: IdentityLock): string {
  const parts: string[] = [];
  if (lock.listings > 0) parts.push(`${lock.listings} tin đang hiển thị/chờ duyệt`);
  if (lock.orders > 0) parts.push(`${lock.orders} đơn bán đang xử lý`);
  return parts.length > 0 ? parts.join(' và ') : 'tin đăng hoặc đơn hàng đang hoạt động';
}

export default function AccountSettings() {
  const { user, profile, contact, loading } = useAuth();
  const [identityLock, setIdentityLock] = useState<IdentityLock>(EMPTY_LOCK);
  const [bankCount, setBankCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) {
      setIdentityLock(EMPTY_LOCK);
      return;
    }
    let active = true;
    supabase.rpc('my_identity_lock').then(({ data, error }) => {
      if (!active || error || !data || typeof data !== 'object') return;
      const d = data as Partial<IdentityLock>;
      setIdentityLock({
        locked: Boolean(d.locked),
        listings: Number(d.listings ?? 0),
        orders: Number(d.orders ?? 0),
      });
    });
    return () => {
      active = false;
    };
  }, [user]);

  const hasPhone = Boolean(contact?.phone?.trim());
  const hasFacebook = Boolean(profile?.facebook_url?.trim());
  const hasBank = bankCount !== null && bankCount > 0;
  const checklistReady = !loading && bankCount !== null;
  const sellerReady = hasPhone && hasFacebook && hasBank;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cài đặt tài khoản</h1>
        <p className="mt-1 text-sm text-slate-600">Quản lý thông tin liên hệ và tài khoản ngân hàng nhận tiền khi bán hàng.</p>
      </div>

      {checklistReady && (
        <SellerChecklist hasPhone={hasPhone} hasFacebook={hasFacebook} hasBank={hasBank} ready={sellerReady} />
      )}

      <ProfileSection identityLock={identityLock} />
      <BankAccountsSection identityLock={identityLock} onCountChange={setBankCount} />
    </div>
  );
}

/* ----------------------------------------------------------------------------
 *  0. Checklist hồ sơ người bán (khớp listing_seller_missing ở migration 007)
 * -------------------------------------------------------------------------- */
function SellerChecklist({
  hasPhone,
  hasFacebook,
  hasBank,
  ready,
}: {
  hasPhone: boolean;
  hasFacebook: boolean;
  hasBank: boolean;
  ready: boolean;
}) {
  const items = [
    { label: 'Số điện thoại liên hệ', done: hasPhone },
    { label: 'Link Facebook cá nhân', done: hasFacebook },
    { label: 'Ít nhất 1 tài khoản ngân hàng nhận tiền', done: hasBank },
  ];

  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 ${
        ready ? 'border-emerald-200 bg-emerald-50/70' : 'border-amber-200 bg-amber-50/80'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className={`text-sm font-semibold ${ready ? 'text-emerald-900' : 'text-amber-900'}`}>
            {ready ? 'Hồ sơ người bán đã đầy đủ' : 'Hoàn tất hồ sơ để mở quyền đăng bán'}
          </h2>
          <p className={`mt-0.5 text-xs ${ready ? 'text-emerald-800' : 'text-amber-800'}`}>
            {ready
              ? 'Bạn đã đủ điều kiện định danh để đăng tin trên VAHA Market.'
              : 'Để chống lừa đảo, hệ thống yêu cầu đủ 3 thông tin dưới đây trước khi mở form đăng tin.'}
          </p>
        </div>
        {ready && (
          <Link to="/sell" className="btn-primary shrink-0 text-xs">
            Đăng bán ngay
          </Link>
        )}
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.label}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium ${
              item.done
                ? 'border-emerald-200 bg-white/80 text-emerald-900'
                : 'border-amber-200 bg-white/80 text-slate-700'
            }`}
          >
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-amber-500" />
            )}
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 *  1. Thông tin cá nhân & liên hệ
 * -------------------------------------------------------------------------- */
function ProfileSection({ identityLock }: { identityLock: IdentityLock }) {
  const { user, profile, contact, loading, refresh } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [facebook, setFacebook] = useState('');
  const [province, setProvince] = useState('');
  const [address, setAddress] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const fbLocked = identityLock.locked && Boolean(profile?.facebook_url?.trim());

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name);
      setFacebook(profile.facebook_url ?? '');
    }
    if (contact) {
      setPhone(contact.phone ?? '');
      setProvince(contact.province ?? '');
      setAddress(contact.shipping_address ?? '');
    }
  }, [profile, contact]);

  if (loading) return <PageLoader />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const name = displayName.trim();
    const fb = facebook.trim();
    const fbUrl = fb && !/^https?:\/\//i.test(fb) ? `https://${fb}` : fb;
    const next: Record<string, string> = {};
    if (name.length < 1 || name.length > 60) next.displayName = 'Tên hiển thị từ 1 đến 60 ký tự.';
    if (phone.trim() && !PHONE_RE.test(phone.trim())) next.phone = 'Số điện thoại gồm 8–15 chữ số (có thể có dấu + và khoảng trắng).';
    if (!fbLocked && fbUrl && (!FACEBOOK_RE.test(fbUrl) || fbUrl.length > 200)) {
      next.facebook = 'Hãy dán link trang cá nhân Facebook (facebook.com/...).';
    }
    if (address.trim().length > 400) next.address = 'Địa chỉ tối đa 400 ký tự.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setResult(null);
    try {
      const profileUpdate: { display_name: string; facebook_url?: string | null } = { display_name: name };
      if (!fbLocked) profileUpdate.facebook_url = fbUrl || null;

      const r1 = await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
      if (r1.error) throw r1.error;

      const r2 = await supabase
        .from('profile_contacts')
        .update({
          phone: phone.trim() || null,
          province: province || null,
          shipping_address: address.trim() || null,
        })
        .eq('user_id', user.id);
      if (r2.error) throw r2.error;

      await refresh();
      setResult({ kind: 'success', text: 'Đã lưu thông tin.' });
    } catch (err) {
      setResult({ kind: 'error', text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="card space-y-4 p-5 sm:p-6" noValidate>
      <h2 className="text-base font-semibold">Thông tin liên hệ</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tên hiển thị" htmlFor="displayName" required error={errors.displayName}>
          <input id="displayName" className="input" value={displayName} maxLength={60} onChange={(e) => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Số điện thoại (Zalo)" htmlFor="phone" error={errors.phone} hint="Bắt buộc để đăng bán. Dùng để liên hệ xử lý đơn hàng khi cần.">
          <input id="phone" className="input" inputMode="tel" placeholder="0912 345 678" value={phone} maxLength={15} onChange={(e) => setPhone(e.target.value)} />
        </Field>
      </div>

      <Field
        label="Link Facebook cá nhân"
        htmlFor="facebook"
        error={errors.facebook}
        hint="Hiển thị công khai trên tin đăng của bạn để người mua kiểm tra uy tín. Ví dụ: https://facebook.com/ten.cua.ban"
      >
        <input
          id="facebook"
          className="input disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
          inputMode="url"
          placeholder="https://facebook.com/..."
          value={facebook}
          maxLength={200}
          disabled={fbLocked}
          onChange={(e) => setFacebook(e.target.value)}
        />
      </Field>

      {fbLocked && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <p>
            Link Facebook đang bị khóa vì bạn có <strong>{formatLockSummary(identityLock)}</strong>. Thông tin định danh được giữ cố định để bảo vệ người mua; hãy liên hệ Admin nếu cần chỉnh sửa.
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tỉnh / Thành phố" htmlFor="province">
          <select id="province" className="input" value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="">— Chọn tỉnh/thành —</option>
            {PROVINCES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </Field>
        <Field label="Địa chỉ" htmlFor="address" error={errors.address} hint="Dùng để điền sẵn khi bạn mua hàng.">
          <input id="address" className="input" placeholder="Số nhà, đường, phường/xã" value={address} maxLength={400} onChange={(e) => setAddress(e.target.value)} />
        </Field>
      </div>

      {user?.email && <p className="text-xs text-slate-500">Email đăng nhập: {user.email}</p>}
      {result && <Alert kind={result.kind}>{result.text}</Alert>}

      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Lưu thông tin
        </button>
      </div>
    </form>
  );
}

/* ----------------------------------------------------------------------------
 *  2. Tài khoản ngân hàng nhận tiền
 * -------------------------------------------------------------------------- */
const BANK_IN_USE_MESSAGE =
  'Không thể xóa: tài khoản này đang được gắn với tin đăng (đang bán, chờ duyệt, nháp hoặc đang ẩn). ' +
  'Hãy đổi tài khoản nhận tiền của tin đó sang tài khoản khác, hoặc xóa tin, rồi thử lại.';

function BankAccountsSection({
  identityLock,
  onCountChange,
}: {
  identityLock: IdentityLock;
  onCountChange: (count: number) => void;
}) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [bankBin, setBankBin] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from('bank_accounts')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as BankAccount[];
    setAccounts(rows);
    onCountChange(rows.length);
  };

  useEffect(() => {
    let active = true;
    load()
      .catch((e) => {
        if (active) {
          setLoadError(getErrorMessage(e));
          onCountChange(0);
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const resetForm = () => {
    setBankBin('');
    setAccountNumber('');
    setAccountName('');
    setMakeDefault(false);
    setFormErrors({});
  };

  const onAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const bank = getBankByBin(bankBin);
    const next: Record<string, string> = {};
    if (!bank) next.bank = 'Hãy chọn ngân hàng.';
    if (!/^[0-9]{6,19}$/.test(accountNumber)) next.accountNumber = 'Số tài khoản gồm 6–19 chữ số.';
    const name = accountName.trim();
    if (name.length < 3) next.accountName = 'Nhập tên chủ tài khoản (IN HOA, không dấu).';
    setFormErrors(next);
    if (Object.keys(next).length > 0 || !bank) return;

    setAdding(true);
    setNotice(null);
    try {
      const { error } = await supabase.from('bank_accounts').insert({
        bank_bin: bank.bin,
        bank_code: bank.code,
        bank_name: bank.shortName,
        account_number: accountNumber,
        account_name: name,
        is_default: accounts.length === 0 || makeDefault,
      });
      if (error) throw error;
      await load();
      resetForm();
      setShowForm(false);
      setNotice({ kind: 'success', text: 'Đã thêm tài khoản ngân hàng.' });
    } catch (err) {
      setNotice({ kind: 'error', text: getErrorMessage(err) });
    } finally {
      setAdding(false);
    }
  };

  const onSetDefault = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      const { error } = await supabase.from('bank_accounts').update({ is_default: true }).eq('id', id);
      if (error) throw error;
      await load();
    } catch (err) {
      setNotice({ kind: 'error', text: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      const { error } = await supabase.from('bank_accounts').delete().eq('id', id);
      if (error) throw error;
      setConfirmId(null);
      await load();
      setNotice({ kind: 'success', text: 'Đã xóa tài khoản ngân hàng.' });
    } catch (err) {
      setConfirmId(null);
      setNotice({ kind: 'error', text: isBankInUseError(err) ? BANK_IN_USE_MESSAGE : getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="card space-y-4 p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Tài khoản ngân hàng nhận tiền</h2>
          <p className="mt-0.5 text-sm text-slate-600">Khi đăng bán, bạn chọn 1 tài khoản trong danh sách này để nhận tiền sau giao dịch.</p>
        </div>
        {!showForm && (
          <button type="button" className="btn-secondary shrink-0" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" /> Thêm
          </button>
        )}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-3 text-sm text-amber-950">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="space-y-1">
          <p className="font-medium">
            Tên chủ tài khoản ngân hàng phải là tên chính chủ, khớp với Facebook/CCCD để được giải ngân.
          </p>
          {identityLock.locked && (
            <p className="text-xs text-amber-900">
              Bạn đang có <strong>{formatLockSummary(identityLock)}</strong>: thông tin tài khoản ngân hàng đã lưu đang được khóa chỉnh sửa để chống gian lận. Liên hệ Admin nếu cần hỗ trợ.
            </p>
          )}
        </div>
      </div>

      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      {showForm && (
        <form onSubmit={onAdd} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4" noValidate>
          <Field label="Ngân hàng" htmlFor="bank" required error={formErrors.bank}>
            <select id="bank" className="input" value={bankBin} onChange={(e) => setBankBin(e.target.value)}>
              <option value="">— Chọn ngân hàng —</option>
              {BANKS.map((b) => (
                <option key={b.bin} value={b.bin}>{b.shortName} ({b.code})</option>
              ))}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Số tài khoản" htmlFor="accNo" required error={formErrors.accountNumber}>
              <input
                id="accNo"
                className="input font-mono"
                inputMode="numeric"
                autoComplete="off"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, '').slice(0, 19))}
              />
            </Field>
            <Field label="Tên chủ tài khoản" htmlFor="accName" required error={formErrors.accountName} hint="Viết HOA không dấu, đúng tên chính chủ khớp Facebook/CCCD.">
              <input
                id="accName"
                className="input uppercase"
                autoComplete="off"
                placeholder="NGUYEN VAN A"
                value={accountName}
                onChange={(e) => setAccountName(toAccountName(e.target.value))}
                onBlur={() => setAccountName((v) => v.trim())}
              />
            </Field>
          </div>
          {accounts.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-700" />
              Đặt làm tài khoản mặc định
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { resetForm(); setShowForm(false); }}>Hủy</button>
            <button type="submit" className="btn-primary" disabled={adding}>
              {adding && <Loader2 className="h-4 w-4 animate-spin" />} Lưu tài khoản
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : loadError ? (
        <Alert kind="error">{loadError}</Alert>
      ) : accounts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center">
          <Landmark className="mx-auto h-7 w-7 text-slate-300" />
          <p className="mt-2 text-sm text-slate-600">Bạn chưa lưu tài khoản ngân hàng nào.</p>
          {!showForm && <button type="button" className="btn-primary mt-3" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Thêm tài khoản đầu tiên</button>}
        </div>
      ) : (
        <ul className="space-y-3">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {a.bank_name}
                    {a.is_default && <span className="badge bg-brand-50 text-brand-800"><Star className="mr-1 h-3 w-3" /> Mặc định</span>}
                  </p>
                  <p className="mt-1 font-mono text-sm text-slate-700">{a.account_number}</p>
                  <p className="text-sm text-slate-500">{a.account_name}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!a.is_default && (
                    <button type="button" className="btn-secondary" disabled={busyId === a.id} onClick={() => onSetDefault(a.id)}>
                      Đặt mặc định
                    </button>
                  )}
                  {confirmId === a.id ? (
                    <>
                      <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" disabled={busyId === a.id} onClick={() => onDelete(a.id)}>
                        {busyId === a.id && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận xóa
                      </button>
                      <button type="button" className="btn-ghost" onClick={() => setConfirmId(null)}>Hủy</button>
                    </>
                  ) : (
                    <button type="button" className="btn-ghost text-red-600 hover:bg-red-50" aria-label={`Xóa tài khoản ${a.bank_name}`} onClick={() => setConfirmId(a.id)}>
                      <Trash2 className="h-4 w-4" /> Xóa
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-slate-500">
        Thông tin ngân hàng chỉ bạn (và quản trị viên khi giải ngân) xem được. Người mua không thấy số tài khoản của bạn.{' '}
        <Link to="/sell" className="text-brand-700 hover:underline">Đăng bán ngay</Link>
      </p>
    </section>
  );
}
