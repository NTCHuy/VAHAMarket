import { getBankByBin } from './banks';

export interface SupportAccountConfig {
  bin: string;
  bankName: string;
  accountNo: string;
  accountName: string;
  defaultMessage: string;
}

const envBin = (import.meta.env.VITE_SUPPORT_BANK_BIN as string | undefined)?.trim() || '970418';
const envBankName = (import.meta.env.VITE_SUPPORT_BANK_NAME as string | undefined)?.trim() || '';
const envAccountNo = (import.meta.env.VITE_SUPPORT_ACCOUNT_NO as string | undefined)?.trim() || '';
const envAccountName = (import.meta.env.VITE_SUPPORT_ACCOUNT_NAME as string | undefined)?.trim() || '';

export const SUPPORT_ACCOUNT: SupportAccountConfig = {
  bin: envBin,
  bankName: envBankName || getBankByBin(envBin)?.shortName || 'Ngân hàng',
  accountNo: envAccountNo,
  accountName: envAccountName,
  defaultMessage: 'UNG HO VAHA MARKET',
};

export const SUPPORT_PRESET_AMOUNTS = [20_000, 50_000, 100_000, 200_000, 500_000] as const;
