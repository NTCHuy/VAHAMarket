import type { ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';

export function Spinner({ className = '' }: { className?: string }) {
  return <Loader2 className={`h-5 w-5 animate-spin text-neutral-400 ${className}`} aria-label="Đang tải" />;
}

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}

type AlertKind = 'error' | 'success' | 'info';

const ALERT_STYLES: Record<AlertKind, { box: string; Icon: typeof Info }> = {
  error: {
    box: 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/70 dark:bg-red-950/50 dark:text-red-200',
    Icon: AlertCircle,
  },
  success: {
    box: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-200',
    Icon: CheckCircle2,
  },
  info: {
    box: 'border-brand-200 bg-brand-50 text-brand-900 dark:border-brand-800/70 dark:bg-brand-900/30 dark:text-brand-200',
    Icon: Info,
  },
};

export function Alert({ kind = 'info', children }: { kind?: AlertKind; children: ReactNode }) {
  const { box, Icon } = ALERT_STYLES[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border px-3 py-2.5 text-sm ${box}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{hint}</p>
      ) : null}
    </div>
  );
}

export function Avatar({ name, url, size = 32 }: { name: string; url: string | null; size?: number }) {
  const style = { width: size, height: size };
  if (url) {
    return <img src={url} alt="" referrerPolicy="no-referrer" style={style} className="shrink-0 rounded-full bg-neutral-100 object-cover dark:bg-neutral-800" />;
  }
  return (
    <span style={style} className="flex shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800 dark:bg-brand-900/60 dark:text-brand-200">
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  );
}
