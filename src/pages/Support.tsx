import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, QrCode, Server, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { SUPPORT_ACCOUNT, SUPPORT_PRESET_AMOUNTS } from '@/constants/support';
import { ESCROW_ACCOUNT } from '@/constants/payment';
import { BRAND_NAME, DISCORD_SERVER_URL, GROUP_URL } from '@/constants/links';
import { buildVietQrUrl, isValidAccountNo, normalizeAccountName, sanitizeTransferContent } from '@/lib/vietqr';
import { formatVND } from '@/lib/money';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import CopyButton from '@/components/CopyButton';
import { Alert, Field } from '@/components/ui';

const OPERATING_COSTS = [
  {
    icon: Server,
    title: 'Hạ tầng & Cơ sở dữ liệu',
    desc: 'Duy trì máy chủ Supabase, lưu trữ ảnh tin đăng và các tác vụ tự động đối soát 24/7.',
  },
  {
    icon: ShieldCheck,
    title: 'Hệ thống thông báo & Thanh toán',
    desc: 'Webhook tự động nhận diện giao dịch ngân hàng (SePay) và gửi email xác nhận đơn hàng tức thì.',
  },
  {
    icon: Users,
    title: 'Vận hành phi lợi nhuận',
    desc: '100% giao dịch trên sàn được miễn phí trung gian (0% phí) để anh em chơi âm thanh giao lưu an toàn.',
  },
] as const;

export default function Support() {
  useDocumentTitle('Ủng hộ duy trì sàn');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(50_000);
  const [customAmount, setCustomAmount] = useState('');
  const [senderNote, setSenderNote] = useState('');

  const amount = useMemo(() => {
    if (selectedPreset !== null) return selectedPreset;
    const digits = customAmount.replace(/\D/g, '');
    if (!digits) return undefined;
    const parsed = parseInt(digits, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }, [selectedPreset, customAmount]);

  const transferContent = useMemo(() => {
    const extra = senderNote.trim();
    const raw = extra ? `${SUPPORT_ACCOUNT.defaultMessage} ${extra}` : SUPPORT_ACCOUNT.defaultMessage;
    return sanitizeTransferContent(raw) || SUPPORT_ACCOUNT.defaultMessage;
  }, [senderNote]);

  const conflictsWithEscrow =
    SUPPORT_ACCOUNT.accountNo.trim().toUpperCase() === ESCROW_ACCOUNT.accountNo.trim().toUpperCase();

  const isConfigured =
    /^\d{6}$/.test(SUPPORT_ACCOUNT.bin) &&
    isValidAccountNo(SUPPORT_ACCOUNT.accountNo) &&
    SUPPORT_ACCOUNT.accountName.trim().length > 0;

  const qrUrl = useMemo(() => {
    if (!isConfigured) return null;
    try {
      return buildVietQrUrl({
        bin: SUPPORT_ACCOUNT.bin,
        accountNo: SUPPORT_ACCOUNT.accountNo,
        accountName: SUPPORT_ACCOUNT.accountName,
        amount,
        addInfo: transferContent,
        template: 'compact2',
      });
    } catch {
      return null;
    }
  }, [isConfigured, amount, transferContent]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="card space-y-3 p-5 sm:p-6">
        <div className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
          <Heart size={14} strokeWidth={1.75} /> 0% Phí Trung Gian · Của Cộng Đồng, Vì Cộng Đồng
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-neutral-950 dark:text-neutral-50 sm:text-2xl">
          Ủng hộ duy trì {BRAND_NAME}
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
          Từ phiên bản v2.0, {BRAND_NAME} hoạt động hoàn toàn phi lợi nhuận với mức{' '}
          <strong className="font-semibold text-neutral-900 dark:text-neutral-100">0% phí giao dịch</strong> cho tất cả
          thành viên cộng đồng Hội người Việt nghiện tai nghe. Mọi đóng góp tự nguyện giúp trang trải chi phí hạ tầng
          để sân chơi luôn ổn định và miễn phí.
        </p>
      </header>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[1.15fr_1fr]">
        <section className="card min-w-0 space-y-5 p-5 sm:p-6">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-950 dark:text-neutral-50">
              <Sparkles size={17} strokeWidth={1.75} className="text-blue-700 dark:text-blue-400" />
              Chọn mức đóng góp tùy tâm
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Chọn nhanh một mức gợi ý, nhập số tiền khác hoặc bỏ trống để tự nhập trên app ngân hàng.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {SUPPORT_PRESET_AMOUNTS.map((val) => {
              const active = selectedPreset === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setSelectedPreset(val);
                    setCustomAmount('');
                  }}
                  className={`rounded-md border px-3 py-2 text-sm font-medium tabular-nums transition-colors ${
                    active
                      ? 'border-blue-700 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                      : 'border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800'
                  }`}
                >
                  {formatVND(val)}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedPreset(null)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                selectedPreset === null
                  ? 'border-blue-700 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/60 dark:text-blue-300'
                  : 'border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800'
              }`}
            >
              Tùy chọn
            </button>
          </div>

          {selectedPreset === null && (
            <Field label="Số tiền ủng hộ (VNĐ)" htmlFor="support-amount" hint="Bỏ trống nếu bạn muốn tự nhập số tiền khi quét QR.">
              <div className="relative">
                <input
                  id="support-amount"
                  className="input pr-10 text-right font-mono tabular-nums"
                  inputMode="numeric"
                  placeholder="Ví dụ: 150.000"
                  value={customAmount ? new Intl.NumberFormat('vi-VN').format(parseInt(customAmount, 10)) : ''}
                  onChange={(e) => setCustomAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">₫</span>
              </div>
            </Field>
          )}

          <Field
            label="Tên / Lời nhắn ngắn (không bắt buộc)"
            htmlFor="support-note"
            hint={`Nội dung chuyển khoản sẽ là: ${transferContent}`}
          >
            <input
              id="support-note"
              className="input"
              maxLength={30}
              placeholder="Ví dụ: Ten Facebook hoac nickname"
              value={senderNote}
              onChange={(e) => setSenderNote(e.target.value)}
            />
          </Field>

          <div className="space-y-3 border-t border-neutral-200 pt-4 dark:border-neutral-800">
            {OPERATING_COSTS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="flex items-start gap-2.5">
                  <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-blue-700 dark:text-blue-400" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{item.title}</p>
                    <p className="text-xs leading-relaxed text-neutral-600 dark:text-neutral-400">{item.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card flex min-w-0 flex-col items-center justify-between space-y-4 p-5 sm:p-6">
          <div className="w-full space-y-1 text-center">
            <h2 className="flex items-center justify-center gap-2 text-base font-semibold text-neutral-950 dark:text-neutral-50">
              <QrCode size={17} strokeWidth={1.75} className="text-blue-700 dark:text-blue-400" />
              Mã VietQR ủng hộ
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Quét bằng bất kỳ ứng dụng ngân hàng hoặc ví điện tử nào hỗ trợ VietQR.
            </p>
          </div>

          {conflictsWithEscrow ? (
            <div className="w-full space-y-3 py-4">
              <Alert kind="error">
                <p className="font-semibold">Trùng số tài khoản Escrow ({ESCROW_ACCOUNT.accountNo})</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Không dùng chung tài khoản Escrow đang gắn SePay Webhook cho mục ủng hộ. Hãy đổi{' '}
                  <code className="rounded bg-red-100 px-1 py-0.5 font-mono text-[11px] dark:bg-red-900">VITE_SUPPORT_ACCOUNT_NO</code>{' '}
                  sang tài khoản ngân hàng khác.
                </p>
              </Alert>
            </div>
          ) : !isConfigured || !qrUrl ? (
            <div className="w-full space-y-3 py-4">
              <Alert kind="info">
                <p className="font-semibold">Chưa cấu hình tài khoản nhận ủng hộ</p>
                <p className="mt-1 text-xs leading-relaxed">
                  Điền các biến{' '}
                  <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] dark:bg-neutral-800">VITE_SUPPORT_BANK_BIN</code>,{' '}
                  <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] dark:bg-neutral-800">VITE_SUPPORT_ACCOUNT_NO</code> và{' '}
                  <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] dark:bg-neutral-800">VITE_SUPPORT_ACCOUNT_NAME</code>{' '}
                  (hoặc sửa trực tiếp trong <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[11px] dark:bg-neutral-800">src/constants/support.ts</code>).
                </p>
              </Alert>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800">
                <img
                  src={qrUrl}
                  alt="Mã VietQR ủng hộ duy trì VAHA Market"
                  className="mx-auto h-auto w-60 max-w-full object-contain"
                />
              </div>

              <dl className="w-full divide-y divide-neutral-200 rounded-md border border-neutral-200 bg-neutral-50 text-xs tabular-nums dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-950">
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <dt className="text-neutral-500 dark:text-neutral-400">Ngân hàng</dt>
                  <dd className="font-medium text-neutral-900 dark:text-neutral-100">{SUPPORT_ACCOUNT.bankName}</dd>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <dt className="text-neutral-500 dark:text-neutral-400">Số tài khoản</dt>
                  <dd className="flex items-center gap-1.5 font-mono font-medium text-neutral-900 dark:text-neutral-100">
                    <span>{SUPPORT_ACCOUNT.accountNo}</span>
                    <CopyButton value={SUPPORT_ACCOUNT.accountNo} label="Copy" />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <dt className="text-neutral-500 dark:text-neutral-400">Chủ tài khoản</dt>
                  <dd className="font-medium text-neutral-900 dark:text-neutral-100">
                    {normalizeAccountName(SUPPORT_ACCOUNT.accountName)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <dt className="text-neutral-500 dark:text-neutral-400">Nội dung CK</dt>
                  <dd className="flex items-center gap-1.5 font-mono font-medium text-blue-700 dark:text-blue-400">
                    <span className="max-w-[160px] truncate">{transferContent}</span>
                    <CopyButton value={transferContent} label="Copy" />
                  </dd>
                </div>
              </dl>
            </>
          )}

          <div className="flex w-full flex-wrap items-center justify-center gap-3 border-t border-neutral-200 pt-3 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
            <Link to="/" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
              Quay lại sàn
            </Link>
            <span>·</span>
            <a href={GROUP_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Group Facebook
            </a>
            <span>·</span>
            <a href={DISCORD_SERVER_URL} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Discord
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
