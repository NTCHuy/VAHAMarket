import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Loader2, Search, ShieldCheck, ShieldOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { setMod } from '@/lib/admin';
import { getErrorMessage } from '@/lib/errors';
import ModBadge from '@/components/ModBadge';
import { Alert, Avatar, PageLoader } from '@/components/ui';
import type { Profile, ProfileContact } from '@/types';

interface Member {
  profile: Profile;
  email: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

async function withEmails(profiles: Profile[]): Promise<Member[]> {
  if (profiles.length === 0) return [];
  const { data } = await supabase.from('profile_contacts').select('user_id,email').in('user_id', profiles.map((p) => p.id));
  const map = new Map(((data ?? []) as Pick<ProfileContact, 'user_id' | 'email'>[]).map((c) => [c.user_id, c.email]));
  return profiles.map((profile) => ({ profile, email: map.get(profile.id) ?? null }));
}

export default function MembersTab() {
  const [mods, setMods] = useState<Member[]>([]);
  const [results, setResults] = useState<Member[] | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadMods = useCallback(async () => {
    const { data, error: err } = await supabase.from('profiles').select('*').eq('is_mod', true).order('display_name');
    if (err) setError(getErrorMessage(err));
    else setMods(await withEmails((data ?? []) as Profile[]));
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadMods();
  }, [loadMods]);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setError(null);
    try {
      let profiles: Profile[] = [];
      if (UUID_RE.test(q)) {
        const { data, error: err } = await supabase.from('profiles').select('*').eq('id', q);
        if (err) throw err;
        profiles = (data ?? []) as Profile[];
      } else {
        // Tìm theo email (profile_contacts) và theo tên hiển thị
        const [byEmail, byName] = await Promise.all([
          supabase.from('profile_contacts').select('user_id').ilike('email', `%${esc(q)}%`).limit(10),
          supabase.from('profiles').select('*').ilike('display_name', `%${esc(q)}%`).limit(10),
        ]);
        if (byEmail.error) throw byEmail.error;
        if (byName.error) throw byName.error;
        const ids = ((byEmail.data ?? []) as { user_id: string }[]).map((r) => r.user_id);
        const fromEmail = ids.length ? await supabase.from('profiles').select('*').in('id', ids) : { data: [], error: null };
        if (fromEmail.error) throw fromEmail.error;
        const merged = new Map<string, Profile>();
        [...((fromEmail.data ?? []) as Profile[]), ...((byName.data ?? []) as Profile[])].forEach((p) => merged.set(p.id, p));
        profiles = Array.from(merged.values());
      }
      setResults(await withEmails(profiles));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSearching(false);
    }
  };

  const toggle = async (m: Member) => {
    setBusyId(m.profile.id);
    setError(null);
    try {
      const updated = await setMod(m.profile.id, !m.profile.is_mod);
      setResults((prev) => prev?.map((r) => (r.profile.id === updated.id ? { ...r, profile: updated } : r)) ?? null);
      await loadMods();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const Row = ({ m }: { m: Member }) => (
    <li className="card flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar name={m.profile.display_name} url={m.profile.avatar_url} size={40} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100"><span className="truncate">{m.profile.display_name}</span>{m.profile.is_mod && <ModBadge full />}</p>
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{m.email ?? 'Không có email'} · {m.profile.sold_count} đơn bán</p>
          <p className="truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">{m.profile.id}</p>
        </div>
      </div>
      <button type="button" className={m.profile.is_mod ? 'btn-secondary text-red-700 dark:text-red-400' : 'btn-primary'} disabled={busyId === m.profile.id} onClick={() => void toggle(m)}>
        {busyId === m.profile.id ? <Loader2 className="h-4 w-4 animate-spin" /> : m.profile.is_mod ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        {m.profile.is_mod ? 'Gỡ huy hiệu Mod' : 'Gắn huy hiệu Mod'}
      </button>
    </li>
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-600 dark:text-slate-400">Người bán có huy hiệu <strong>Mod</strong> được miễn phí trung gian (0%) cho các đơn mới. Đơn đã tạo trước đó giữ nguyên mức phí cũ.</p>

      <form onSubmit={search} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input className="input pl-9" placeholder="Email, UUID hoặc tên thành viên" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Tìm thành viên" />
        </div>
        <button type="submit" className="btn-primary" disabled={searching || !query.trim()}>
          {searching && <Loader2 className="h-4 w-4 animate-spin" />} Tìm
        </button>
      </form>

      {error && <Alert kind="error">{error}</Alert>}

      {results && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Kết quả tìm kiếm</h2>
          {results.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Không tìm thấy thành viên nào.</p> : <ul className="space-y-2">{results.map((m) => <Row key={m.profile.id} m={m} />)}</ul>}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Danh sách Mod hiện tại ({mods.length})</h2>
        {loading ? <PageLoader /> : mods.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Chưa có Mod nào.</p> : <ul className="space-y-2">{mods.map((m) => <Row key={m.profile.id} m={m} />)}</ul>}
      </section>
    </div>
  );
}
