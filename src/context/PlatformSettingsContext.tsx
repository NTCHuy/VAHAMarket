import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { PLATFORM_FEE_BP } from '@/constants/payment';

interface PlatformSettingsValue {
  /** Mức phí toàn sàn hiện hành, basis point (0–500; 500 = 5%). */
  feeBp: number;
  /** Mức phí dạng phân số (0–0.05). */
  feeRate: number;
  loaded: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_VALUE: PlatformSettingsValue = { feeBp: PLATFORM_FEE_BP, feeRate: PLATFORM_FEE_BP / 10000, loaded: false, refresh: async () => undefined };
const PlatformSettingsContext = createContext<PlatformSettingsValue>(DEFAULT_VALUE);

/**
 * Đọc `platform_settings.global_fee_rate` (ai cũng đọc được). Tự làm mới mỗi 2 phút và khi quay lại tab.
 * Dù giao diện có hiển thị mức phí cũ, hàm DB `create_order` luôn kiểm tra lại số tiền người mua đang thấy.
 */
export function PlatformSettingsProvider({ children }: { children: ReactNode }) {
  const [feeBp, setFeeBp] = useState(PLATFORM_FEE_BP);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from('platform_settings').select('global_fee_rate').eq('id', 1).maybeSingle();
    if (error || !data) return;
    const rate = Number((data as { global_fee_rate: number | string }).global_fee_rate);
    if (Number.isFinite(rate)) {
      setFeeBp(Math.min(Math.max(Math.round(rate * 10000), 0), PLATFORM_FEE_BP));
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 120_000);
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({ feeBp, feeRate: feeBp / 10000, loaded, refresh }), [feeBp, loaded, refresh]);
  return <PlatformSettingsContext.Provider value={value}>{children}</PlatformSettingsContext.Provider>;
}

export const usePlatformSettings = (): PlatformSettingsValue => useContext(PlatformSettingsContext);
