import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Fingerprint,
  Loader2,
  Plus,
  Search,
  ShieldBan,
  ShieldCheck,
  Trash2,
  Unlock,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  addBannedEntity,
  banUser,
  issueWarning,
  listBannedEntities,
  removeBannedEntity,
  unbanUser,
} from '@/lib/admin';
import { getErrorMessage } from '@/lib/errors';
import { Alert, Avatar, Field, PageLoader } from '@/components/ui';
import type { BannedEntity, BannedEntityType, Profile, UserDevice, UserWarning } from '@/types';

const ENTITY_TYPE_LABELS: Record<BannedEntityType, { label: string; placeholder: string }> = {
  email: { label: 'Email Google', placeholder: 'scammer@gmail.com' },
  facebook_url: { label: 'Link Facebook', placeholder: 'https://facebook.com/username' },
  bank_account: { label: 'Tài khoản ngân hàng (BIN:STK hoặc STK)', placeholder: '970436:0123456789' },
  phone: { label: 'Số điện thoại', placeholder: '0912345678' },
  fingerprint: { label: 'Mã thiết bị (Visitor ID)', placeholder: 'abc123xyz...' },
};

export default function BansTab({ onChanged }: { onChanged: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [warnings, setWarnings] = useState<UserWarning[]>([]);
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [entities, setEntities] = useState<BannedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  // Form thêm Ban / Blacklist trực tiếp
  const [formMode, setFormMode] = useState<'user' | 'entity'>('user');
  const [userSearch, setUserSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [entityType, setEntityType] = useState<BannedEntityType>('email');
  const [entityValue, setEntityValue] = useState('');
  const [banReason, setBanReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Bộ lọc danh sách đen
  const [entityFilter, setEntityFilter] = useState<'all' | BannedEntityType>('all');
  const [entitySearch, setEntitySearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [pRes, wRes, dRes, entList] = await Promise.all([
        supabase.from('profiles').select('*').order('is_banned', { ascending: false }).order('warning_count', { ascending: false }).order('created_at', { ascending: false }).limit(500),
        supabase.from('user_warnings').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('user_devices').select('*').order('last_seen_at', { ascending: false }).limit(500),
        listBannedEntities(),
      ]);
      if (pRes.error) throw pRes.error;
      if (wRes.error) throw wRes.error;
      if (dRes.error) throw dRes.error;

      setProfiles((pRes.data ?? []) as Profile[]);
      setWarnings((wRes.data ?? []) as UserWarning[]);
      setDevices((dRes.data ?? []) as UserDevice[]);
      setEntities(entList);
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

  const flaggedUsers = useMemo(
    () => profiles.filter((p) => p.is_banned || p.warning_count > 0),
    [profiles],
  );

  const selectableUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return profiles
      .filter((p) => !p.is_banned)
      .filter((p) => !q || p.display_name.toLowerCase().includes(q) || (p.facebook_url ?? '').toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
      .slice(0, 50);
  }, [profiles, userSearch]);

  const warningsByUser = useMemo(() => {
    const map: Record<string, UserWarning[]> = {};
    for (const w of warnings) (map[w.user_id] ??= []).push(w);
    return map;
  }, [warnings]);

  const devicesByUser = useMemo(() => {
    const map: Record<string, UserDevice[]> = {};
    for (const d of devices) (map[d.user_id] ??= []).push(d);
    return map;
  }, [devices]);

  const entitiesByUser = useMemo(() => {
    const map: Record<string, BannedEntity[]> = {};
    for (const e of entities) {
      if (e.source_user_id) (map[e.source_user_id] ??= []).push(e);
    }
    return map;
  }, [entities]);

  const filteredEntities = useMemo(() => {
    const q = entitySearch.trim().toLowerCase();
    return entities.filter((e) => {
      if (entityFilter !== 'all' && e.entity_type !== entityFilter) return false;
      if (!q) return true;
      return e.entity_value.toLowerCase().includes(q) || e.reason.toLowerCase().includes(q);
    });
  }, [entities, entityFilter, entitySearch]);

  const onDirectSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const reason = banReason.trim();
    if (reason.length < 3) {
      setNotice({ kind: 'error', text: 'Hãy nhập lý do vi phạm (tối thiểu 3 ký tự).' });
      return;
    }

    setSubmitting(true);
    setNotice(null);
    try {
      if (formMode === 'user') {
        if (!selectedUserId) {
          setNotice({ kind: 'error', text: 'Hãy chọn một thành viên để khóa tài khoản.' });
          setSubmitting(false);
          return;
        }
        await banUser(selectedUserId, reason);
        setSelectedUserId('');
        setBanReason('');
        setNotice({ kind: 'success', text: 'Đã khóa vĩnh viễn tài khoản và đưa toàn bộ dấu vết vào danh sách đen.' });
      } else {
        if (!entityValue.trim()) {
          setNotice({ kind: 'error', text: 'Hãy nhập giá trị định danh cần đưa vào danh sách đen.' });
          setSubmitting(false);
          return;
        }
        await addBannedEntity(entityType, entityValue, reason);
        setEntityValue('');
        setBanReason('');
        setNotice({ kind: 'success', text: 'Đã thêm định danh vào danh sách đen toàn sàn.' });
      }
      await load();
      onChanged();
    } catch (err) {
      setNotice({ kind: 'error', text: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveEntity = async (id: string) => {
    setBusyId(id);
    setNotice(null);
    try {
      await removeBannedEntity(id);
      await load();
      onChanged();
      setNotice({ kind: 'success', text: 'Đã gỡ mục khỏi danh sách đen.' });
    } catch (err) {
      setNotice({ kind: 'error', text: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <Alert kind="error">{error}</Alert>;

  return (
    <div className="space-y-6">
      {notice && <Alert kind={notice.kind}>{notice.text}</Alert>}

      {/* 1. Form Khóa tài khoản / Danh sách đen */}
      <form onSubmit={onDirectSubmit} className="card space-y-4 border-red-200 dark:border-red-900/70 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
              <ShieldBan className="h-5 w-5 text-red-600 dark:text-red-400" />
              Khóa tài khoản / Danh sách đen
            </h2>
            <p className="mt-0.5 text-xs text-neutral-600 dark:text-neutral-400">
              Khóa thẳng tài khoản vi phạm nặng hoặc chặn trước Email / Facebook / STK / SĐT / Thiết bị.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setFormMode('user')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                formMode === 'user'
                  ? 'bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Khóa tài khoản
            </button>
            <button
              type="button"
              onClick={() => setFormMode('entity')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                formMode === 'entity'
                  ? 'bg-white text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100'
                  : 'text-neutral-600 dark:text-neutral-400'
              }`}
            >
              Thêm danh sách đen
            </button>
          </div>
        </div>

        {formMode === 'user' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tìm thành viên" htmlFor="ban-user-search">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  id="ban-user-search"
                  className="input pl-9"
                  placeholder="Tên hiển thị, Facebook hoặc UUID..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
            </Field>
            <Field label="Chọn thành viên cần khóa" htmlFor="ban-user-select" required>
              <select
                id="ban-user-select"
                className="input"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">— Chọn thành viên ({selectableUsers.length}) —</option>
                {selectableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name} ({u.warning_count}/3 cảnh báo){u.is_mod ? ' [Mod]' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Loại định danh" htmlFor="ban-entity-type" required>
              <select
                id="ban-entity-type"
                className="input"
                value={entityType}
                onChange={(e) => setEntityType(e.target.value as BannedEntityType)}
              >
                {(Object.keys(ENTITY_TYPE_LABELS) as BannedEntityType[]).map((k) => (
                  <option key={k} value={k}>
                    {ENTITY_TYPE_LABELS[k].label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Giá trị định danh" htmlFor="ban-entity-val" required>
              <input
                id="ban-entity-val"
                className="input font-mono"
                placeholder={ENTITY_TYPE_LABELS[entityType].placeholder}
                value={entityValue}
                onChange={(e) => setEntityValue(e.target.value)}
              />
            </Field>
          </div>
        )}

        <Field label="Lý do vi phạm" htmlFor="ban-reason" required>
          <input
            id="ban-reason"
            className="input"
            maxLength={1000}
            placeholder="Ví dụ: Đăng bán hàng giả, lừa đảo tay ba, dẫn dụ chuyển khoản ngoài sàn..."
            value={banReason}
            onChange={(e) => setBanReason(e.target.value)}
          />
        </Field>

        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className="btn bg-red-600 text-white hover:bg-red-700">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {formMode === 'user' ? 'Khóa vĩnh viễn' : 'Thêm vào danh sách đen'}
          </button>
        </div>
      </form>

      {/* 2. Danh sách tài khoản bị khóa & cảnh báo */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          Tài khoản cảnh báo / Đã khóa ({flaggedUsers.length})
        </h2>

        {flaggedUsers.length === 0 ? (
          <div className="card flex flex-col items-center px-4 py-10 text-center">
            <ShieldCheck className="h-8 w-8 text-neutral-300 dark:text-neutral-600" />
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Chưa có tài khoản nào bị cảnh báo hoặc bị khóa.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {flaggedUsers.map((u) => (
              <FlaggedUserCard
                key={u.id}
                profile={u}
                warnings={warningsByUser[u.id] ?? []}
                devices={devicesByUser[u.id] ?? []}
                entities={entitiesByUser[u.id] ?? []}
                onUpdated={async (msg) => {
                  setNotice({ kind: 'success', text: msg });
                  await load();
                  onChanged();
                }}
                onError={(msg) => setNotice({ kind: 'error', text: msg })}
              />
            ))}
          </ul>
        )}
      </section>

      {/* 3. Toàn bộ Danh sách đen (banned_entities) */}
      <section className="card space-y-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
              Danh sách đen toàn sàn ({entities.length})
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Hệ thống tự động chặn đăng ký mới, cập nhật hồ sơ hoặc thêm tài khoản ngân hàng trùng các dấu vết dưới đây.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-auto text-xs"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value as 'all' | BannedEntityType)}
              aria-label="Lọc loại định danh"
            >
              <option value="all">Tất cả loại</option>
              {(Object.keys(ENTITY_TYPE_LABELS) as BannedEntityType[]).map((k) => (
                <option key={k} value={k}>
                  {ENTITY_TYPE_LABELS[k].label}
                </option>
              ))}
            </select>
            <input
              className="input w-48 text-xs"
              placeholder="Tìm giá trị hoặc lý do..."
              value={entitySearch}
              onChange={(e) => setEntitySearch(e.target.value)}
            />
          </div>
        </div>

        {filteredEntities.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500 dark:text-neutral-400">Không có mục nào trong danh sách đen.</p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {filteredEntities.map((ent) => (
              <li key={ent.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300">
                      {ENTITY_TYPE_LABELS[ent.entity_type]?.label ?? ent.entity_type}
                    </span>
                    <code className="break-all font-mono text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {ent.entity_value}
                    </code>
                  </div>
                  <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
                    {ent.reason} · {new Date(ent.created_at).toLocaleString('vi-VN')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busyId === ent.id}
                  onClick={() => void handleRemoveEntity(ent.id)}
                  className="btn-ghost px-2.5 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                >
                  {busyId === ent.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Gỡ
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FlaggedUserCard({
  profile,
  warnings,
  devices,
  entities,
  onUpdated,
  onError,
}: {
  profile: Profile;
  warnings: UserWarning[];
  devices: UserDevice[];
  entities: BannedEntity[];
  onUpdated: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [actionMode, setActionMode] = useState<'warn' | 'ban' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const runWarn = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await issueWarning(profile.id, reason);
      setActionMode(null);
      setReason('');
      await onUpdated(
        res.auto_banned
          ? `Đã gửi cảnh báo #${res.warning_count} cho ${profile.display_name} — Tự động Ban vĩnh viễn do đạt 3/3 cảnh báo!`
          : `Đã gửi cảnh báo #${res.warning_count}/3 cho ${profile.display_name}.`,
      );
    } catch (e) {
      onError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const runBan = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      await banUser(profile.id, reason);
      setActionMode(null);
      setReason('');
      await onUpdated(`Đã khóa vĩnh viễn tài khoản ${profile.display_name} và đưa dấu vết vào danh sách đen.`);
    } catch (e) {
      onError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const runUnban = async () => {
    setBusy(true);
    try {
      await unbanUser(profile.id);
      await onUpdated(`Đã gỡ Ban, reset cảnh báo về 0 và xóa dấu vết của ${profile.display_name} khỏi danh sách đen.`);
    } catch (e) {
      onError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li
      className={`card space-y-3 p-4 ${
        profile.is_banned
          ? 'border-red-300 dark:border-red-800/80'
          : 'border-amber-200 dark:border-amber-800/70'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={profile.display_name} url={profile.avatar_url} size={40} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">{profile.display_name}</p>
              {profile.is_banned ? (
                <span className="badge bg-red-600 text-white dark:bg-red-600 dark:text-white">
                  <Ban className="mr-1 h-3 w-3" /> Đã khóa
                </span>
              ) : (
                <span className="badge bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300">
                  <AlertTriangle className="mr-1 h-3 w-3" /> {profile.warning_count}/3 cảnh báo
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {profile.sold_count} đơn bán · {profile.bought_count} đơn mua
              {profile.banned_at && ` · Khóa lúc ${new Date(profile.banned_at).toLocaleString('vi-VN')}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!profile.is_banned && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setActionMode('warn'); setReason(''); }}
                className="btn-secondary px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
              >
                <AlertTriangle className="h-3.5 w-3.5" /> Cảnh báo (+1)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => { setActionMode('ban'); setReason(''); }}
                className="btn bg-red-600 px-3 py-1.5 text-xs text-white hover:bg-red-700"
              >
                <ShieldBan className="h-3.5 w-3.5" /> Khóa vĩnh viễn
              </button>
            </>
          )}
          {profile.is_banned && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runUnban()}
              className="btn-secondary px-3 py-1.5 text-xs text-emerald-700 dark:text-emerald-400"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />} Gỡ khóa
            </button>
          )}
        </div>
      </div>

      {profile.is_banned && profile.ban_reason && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200">
          <strong>Lý do khóa:</strong> {profile.ban_reason}
        </div>
      )}

      {/* Form inline cảnh báo / ban */}
      {actionMode && (
        <div className="space-y-2 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/60">
          <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
            {actionMode === 'warn'
              ? `Nhập lý do cảnh báo lần ${profile.warning_count + 1}/3${profile.warning_count + 1 >= 3 ? ' (sẽ tự động Ban vĩnh viễn!)' : ''}:`
              : 'Nhập lý do khóa vĩnh viễn tài khoản này:'}
          </p>
          <input
            className="input text-xs"
            maxLength={1000}
            placeholder="Nhập lý do (tối thiểu 3 ký tự)..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5 text-xs" disabled={busy} onClick={() => setActionMode(null)}>
              Hủy
            </button>
            <button
              type="button"
              disabled={busy || reason.trim().length < 3}
              onClick={() => void (actionMode === 'warn' ? runWarn() : runBan())}
              className={`btn px-3 py-1.5 text-xs text-white ${actionMode === 'ban' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {actionMode === 'warn' ? 'Xác nhận gửi cảnh báo' : 'Xác nhận Ban'}
            </button>
          </div>
        </div>
      )}

      {/* Lịch sử cảnh báo */}
      {warnings.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Lịch sử cảnh báo ({warnings.length})</p>
          <ul className="space-y-1">
            {warnings.map((w, idx) => (
              <li key={w.id} className="rounded-lg bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700 dark:bg-neutral-800/60 dark:text-neutral-300">
                <span className="font-semibold text-amber-700 dark:text-amber-400">#{warnings.length - idx}</span>{' '}
                {w.reason}{' '}
                <span className="text-neutral-400">({new Date(w.created_at).toLocaleString('vi-VN')})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Thiết bị & Dấu vết Blacklist */}
      {(devices.length > 0 || entities.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          {devices.length > 0 && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-2.5 text-xs dark:border-neutral-800 dark:bg-neutral-800/40">
              <p className="mb-1 flex items-center gap-1 font-medium text-neutral-700 dark:text-neutral-300">
                <Fingerprint className="h-3.5 w-3.5" /> Thiết bị đã ghi nhận ({devices.length})
              </p>
              <ul className="space-y-0.5 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                {devices.map((d) => (
                  <li key={d.id} className="truncate" title={d.user_agent ?? d.visitor_id}>
                    {d.visitor_id}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {entities.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-2.5 text-xs dark:border-red-900/60 dark:bg-red-950/30">
              <p className="mb-1 font-medium text-red-800 dark:text-red-300">
                Định danh đang bị khóa ({entities.length})
              </p>
              <ul className="space-y-0.5 text-[11px] text-red-700 dark:text-red-300">
                {entities.map((e) => (
                  <li key={e.id} className="truncate font-mono">
                    [{e.entity_type}] {e.entity_value}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </li>
  );
}
