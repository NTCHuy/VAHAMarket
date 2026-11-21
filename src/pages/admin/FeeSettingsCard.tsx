import { useState } from 'react';
import { Loader2, Percent } from 'lucide-react';
import { setGlobalFeeRate } from '@/lib/admin';
import { getErrorMessage } from '@/lib/errors';
import { usePlatformSettings } from '@/context/PlatformSettingsContext';
import { Alert } from '@/components/ui';

const PRESETS: { bp: number; label: string }[] = [
  { bp: 0, label: '0% (Ưu đãi ra mắt)' },
  { bp: 200, label: '2%' },
  { bp: 300, label: '3%' },
  { bp: 500, label: '5% (Mặc định)' },
];

const pctText = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;

/** Cấu hình phí sàn toàn hệ thống (0–5%). Đổi bằng 1 cú bấm, có bước xác nhận. */
export default function FeeSettingsCard() {
  const { feeBp, loaded, refresh } = usePlatformSettings();
  const [custom, setCustom] = useState('');
  const [pendingBp, setPendingBp] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const customNum = custom.trim() === '' ? null : Number(custom.replace(',', '.'));
  const customBp = customNum === null ? null : Math.round(customNum * 100);
  const customValid =
    customNum !== null && Number.isFinite(customNum) && customNum >= 0 && customNum <= 5 && Math.abs(customNum * 100 - Math.round(customNum * 100)) < 1e-9;

  const apply = async () => {
    if (pendingBp === null) return;
    setBusy(true);
    setMsg(null);
    try {
      await setGlobalFeeRate(pendingBp / 10000);
      await refresh();
      setMsg({ kind: 'success', text: `Đã đổi phí sàn toàn hệ thống thành ${pctText(pendingBp)}.` });
      setPendingBp(null);
      setCustom('');
    } catch (e) {
      setMsg({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Percent className="h-4 w-4 text-brand-600 dark:text-brand-400" /> Cấu hình phí sàn toàn hệ thống</h2>
        <span className={`badge ${feeBp < 500 ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' : ''}`}>
          Hiện tại: <strong className="ml-1">{loaded ? pctText(feeBp) : '…'}</strong>{feeBp < 500 && loaded ? ' · đang ưu đãi' : ''}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.bp} type="button" disabled={busy || (loaded && p.bp === feeBp)} onClick={() => { setMsg(null); setPendingBp(p.bp); }}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${loaded && p.bp === feeBp ? 'border-brand-600 dark:border-brand-500 bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
            {p.label}
          </button>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (customValid && customBp !== null) { setMsg(null); setPendingBp(customBp); } }}>
        <label className="text-sm text-slate-600 dark:text-slate-400" htmlFor="custom-fee">Hoặc nhập mức khác (0–5%):</label>
        <input id="custom-fee" className="input w-28 text-right" inputMode="decimal" placeholder="2.5" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
        <button type="submit" className="btn-secondary" disabled={!customValid || busy}>Chọn mức này</button>
      </form>
      {custom.trim() !== '' && !customValid && <p className="text-xs text-red-600 dark:text-red-400">Nhập số từ 0 đến 5, tối đa 2 chữ số thập phân (ví dụ 2.5).</p>}

      {pendingBp !== null && (
        <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/50 p-3 text-sm text-amber-900 dark:text-amber-200">
          <p>
            Đổi phí sàn toàn hệ thống từ <strong>{pctText(feeBp)}</strong> sang <strong>{pctText(pendingBp)}</strong>? Áp dụng cho <strong>đơn mới</strong> ngay lập tức; đơn đã tạo giữ nguyên.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setPendingBp(null)} disabled={busy}>Hủy</button>
            <button type="button" className="btn-primary" onClick={apply} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận đổi phí
            </button>
          </div>
        </div>
      )}

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
        <li>Người bán có huy hiệu Mod luôn được miễn phí (0%) bất kể mức này.</li>
        <li>Khi phí &lt; 5%, các tin do người mua chịu phí (hoặc chia đôi) tự hiện giá trọn gói ở mức 5% gạch ngang kèm nhãn “Ưu đãi phí sàn”.</li>
        <li>Nếu người mua đang xem giá cũ lúc bạn đổi phí, hệ thống sẽ yêu cầu họ tải lại trang trước khi đặt mua để số tiền luôn khớp.</li>
      </ul>
    </section>
  );
}
