import { useEffect, useState } from 'react';
import { Loader2, Percent, ShieldCheck } from 'lucide-react';
import { setFeeCapVnd, setGlobalFeeRate } from '@/lib/admin';
import { formatVND } from '@/lib/money';
import { getErrorMessage } from '@/lib/errors';
import { usePlatformSettings } from '@/context/PlatformSettingsContext';
import { Alert } from '@/components/ui';

const PRESETS: { bp: number; label: string }[] = [
  { bp: 0, label: '0% (Ưu đãi ra mắt)' },
  { bp: 200, label: '2%' },
  { bp: 300, label: '3%' },
  { bp: 500, label: '5% (Mặc định)' },
];

const CAP_PRESETS: { value: number; label: string }[] = [
  { value: 500_000, label: '500.000₫ (Mặc định)' },
  { value: 300_000, label: '300.000₫' },
  { value: 1_000_000, label: '1.000.000₫' },
  { value: 0, label: '0₫ (Tắt trần)' },
];

const pctText = (bp: number) => `${Number((bp / 100).toFixed(2))}%`;
const capText = (cap: number) => (cap > 0 ? formatVND(cap) : 'Không giới hạn (đã tắt trần)');

/** Cấu hình phí sàn toàn hệ thống (0–5%) và trần phí tối đa mỗi giao dịch (mặc định 500.000₫). */
export default function FeeSettingsCard() {
  const { feeBp, feeCapVnd, loaded, refresh } = usePlatformSettings();
  const [custom, setCustom] = useState('');
  const [pendingBp, setPendingBp] = useState<number | null>(null);

  const [capInput, setCapInput] = useState('');
  const [pendingCap, setPendingCap] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (loaded) setCapInput(String(feeCapVnd));
  }, [loaded, feeCapVnd]);

  const customNum = custom.trim() === '' ? null : Number(custom.replace(',', '.'));
  const customBp = customNum === null ? null : Math.round(customNum * 100);
  const customValid =
    customNum !== null &&
    Number.isFinite(customNum) &&
    customNum >= 0 &&
    customNum <= 5 &&
    Math.abs(customNum * 100 - Math.round(customNum * 100)) < 1e-9;

  const parsedCapDigits = capInput.replace(/[^\d]/g, '');
  const parsedCap = parsedCapDigits === '' ? null : parseInt(parsedCapDigits, 10);
  const capValid = parsedCap !== null && Number.isInteger(parsedCap) && parsedCap >= 0 && parsedCap <= 100_000_000;

  const applyFeeRate = async () => {
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

  const applyFeeCap = async () => {
    if (pendingCap === null) return;
    setBusy(true);
    setMsg(null);
    try {
      await setFeeCapVnd(pendingCap);
      await refresh();
      setMsg({ kind: 'success', text: `Đã cập nhật trần phí tối đa thành ${capText(pendingCap)}.` });
      setPendingCap(null);
    } catch (e) {
      setMsg({ kind: 'error', text: getErrorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Percent className="h-4 w-4 text-brand-600 dark:text-brand-400" /> Cấu hình phí sàn &amp; Trần phí tối đa
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${feeBp < 500 ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300' : ''}`}>
            Phí: <strong className="ml-1">{loaded ? pctText(feeBp) : '…'}</strong>
            {feeBp < 500 && loaded ? ' · ưu đãi' : ''}
          </span>
          <span className="badge bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            Trần tối đa: <strong className="ml-1">{loaded ? (feeCapVnd > 0 ? formatVND(feeCapVnd) : 'Tắt') : '…'}</strong>
          </span>
        </div>
      </div>

      {/* 1. Phần trăm phí toàn sàn */}
      <div className="space-y-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Mức phần trăm phí (0–5%)</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.bp}
              type="button"
              disabled={busy || (loaded && p.bp === feeBp)}
              onClick={() => {
                setMsg(null);
                setPendingCap(null);
                setPendingBp(p.bp);
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                loaded && p.bp === feeBp
                  ? 'border-brand-600 dark:border-brand-500 bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (customValid && customBp !== null) {
              setMsg(null);
              setPendingCap(null);
              setPendingBp(customBp);
            }
          }}
        >
          <label className="text-sm text-slate-600 dark:text-slate-400" htmlFor="custom-fee">
            Hoặc nhập mức khác (0–5%):
          </label>
          <input id="custom-fee" className="input w-28 text-right" inputMode="decimal" placeholder="2.5" value={custom} onChange={(e) => setCustom(e.target.value)} />
          <span className="text-sm text-slate-500 dark:text-slate-400">%</span>
          <button type="submit" className="btn-secondary" disabled={!customValid || busy}>
            Chọn mức này
          </button>
        </form>
        {custom.trim() !== '' && !customValid && <p className="text-xs text-red-600 dark:text-red-400">Nhập số từ 0 đến 5, tối đa 2 chữ số thập phân (ví dụ 2.5).</p>}
      </div>

      {/* 2. Trần phí tối đa (VNĐ) */}
      <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> Trần phí tối đa mỗi giao dịch (VNĐ)
        </p>
        <div className="flex flex-wrap gap-2">
          {CAP_PRESETS.map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={busy || (loaded && c.value === feeCapVnd)}
              onClick={() => {
                setMsg(null);
                setPendingBp(null);
                setCapInput(String(c.value));
                setPendingCap(c.value);
              }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                loaded && c.value === feeCapVnd
                  ? 'border-emerald-600 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (capValid && parsedCap !== null && parsedCap !== feeCapVnd) {
              setMsg(null);
              setPendingBp(null);
              setPendingCap(parsedCap);
            }
          }}
        >
          <label className="text-sm text-slate-600 dark:text-slate-400" htmlFor="fee-cap-vnd">
            Trần phí tối đa (nhập 0 để tắt trần):
          </label>
          <div className="relative w-40">
            <input
              id="fee-cap-vnd"
              className="input pr-7 text-right font-mono"
              inputMode="numeric"
              placeholder="500000"
              value={capInput}
              onChange={(e) => setCapInput(e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
            />
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">₫</span>
          </div>
          <button type="submit" className="btn-secondary" disabled={!capValid || parsedCap === feeCapVnd || busy}>
            Cập nhật trần phí
          </button>
        </form>
        {capInput.trim() !== '' && !capValid && <p className="text-xs text-red-600 dark:text-red-400">Nhập số nguyên từ 0 đến 100.000.000₫.</p>}
      </div>

      {pendingBp !== null && (
        <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-800/70 bg-amber-50 dark:bg-amber-950/50 p-3 text-sm text-amber-900 dark:text-amber-200">
          <p>
            Đổi phí sàn toàn hệ thống từ <strong>{pctText(feeBp)}</strong> sang <strong>{pctText(pendingBp)}</strong>? Áp dụng cho <strong>đơn mới</strong> ngay lập tức; đơn đã tạo giữ nguyên.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setPendingBp(null)} disabled={busy}>Hủy</button>
            <button type="button" className="btn-primary" onClick={() => void applyFeeRate()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận đổi phí
            </button>
          </div>
        </div>
      )}

      {pendingCap !== null && (
        <div className="space-y-2 rounded-xl border border-emerald-200 dark:border-emerald-800/70 bg-emerald-50 dark:bg-emerald-950/50 p-3 text-sm text-emerald-900 dark:text-emerald-200">
          <p>
            Đổi trần phí tối đa từ <strong>{capText(feeCapVnd)}</strong> sang <strong>{capText(pendingCap)}</strong>? Áp dụng ngay cho <strong>đơn mới</strong>; đơn đã tạo giữ nguyên.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setPendingCap(null)} disabled={busy}>Hủy</button>
            <button type="button" className="btn-primary" onClick={() => void applyFeeCap()} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Xác nhận đổi trần phí
            </button>
          </div>
        </div>
      )}

      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500 dark:text-slate-400">
        <li>Người bán có huy hiệu Mod luôn được miễn phí (0%) bất kể mức phí hay trần phí.</li>
        <li>Khi phí theo % vượt quá trần phí (mặc định 500.000₫), tổng phí sàn được giữ cố định ở mức trần trước khi chia cho người mua / người bán.</li>
        <li>Nếu người mua đang xem giá cũ lúc bạn đổi phí hoặc trần phí, hệ thống sẽ yêu cầu họ tải lại trang trước khi đặt mua để số tiền luôn khớp.</li>
      </ul>
    </section>
  );
}
