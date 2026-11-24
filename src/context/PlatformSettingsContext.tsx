import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { PLATFORM_FEE_BP } from '@/constants/payment';

interface PlatformSettingsValue {
  feeBp: number;
  feeRate: number;
  feeCapVnd: number;
  loaded: boolean;
  refresh: () => Promise<void>;
}

const DEFAULT_VALUE: PlatformSettingsValue = {
  feeBp: 0,
  feeRate: 0,
  feeCapVnd: 0,
  loaded: false,
  refresh: async () => undefined,
};
const PlatformSettingsContext = createContext<PlatformSettingsValue>(DEFAULT_VALUE);

export function PlatformSettingsProvider({ children }: { children: ReactNode }) {
  const [feeBp, setFeeBp] = useState(0);
  const [feeCapVnd, setFeeCapVnd] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('platform_settings')
      .select('global_fee_rate, fee_cap_vnd')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return;
    const row = data as { global_fee_rate: number | string; fee_cap_vnd?: number | string | null };
    const rate = Number(row.global_fee_rate);
    if (Number.isFinite(rate)) {
      setFeeBp(Math.min(Math.max(Math.round(rate * 10000), 0), PLATFORM_FEE_BP));
    }
    if (row.fee_cap_vnd !== undefined && row.fee_cap_vnd !== null) {
      const cap = Number(row.fee_cap_vnd);
      if (Number.isFinite(cap) && cap >= 0) setFeeCapVnd(Math.floor(cap));
    }
    setLoaded(true);
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

  const value = useMemo(
    () => ({ feeBp, feeRate: feeBp / 10000, feeCapVnd, loaded, refresh }),
    [feeBp, feeCapVnd, loaded, refresh],
  );
  return <PlatformSettingsContext.Provider value={value}>{children}</PlatformSettingsContext.Provider>;
}

export const usePlatformSettings = (): PlatformSettingsValue => useContext(PlatformSettingsContext);
