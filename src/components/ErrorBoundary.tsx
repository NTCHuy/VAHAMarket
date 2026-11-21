import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  variant?: 'fullscreen' | 'inline';
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const fullscreen = this.props.variant === 'fullscreen';
    return (
      <div className={fullscreen ? 'flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950' : 'flex justify-center py-10'}>
        <div role="alert" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <h1 className="mt-3 text-lg font-semibold text-slate-900 dark:text-slate-50">Đã có lỗi hiển thị</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Trang gặp sự cố ngoài ý muốn. Dữ liệu và tiền của bạn không bị ảnh hưởng. Hãy tải lại trang hoặc quay về trang chủ.
          </p>
          <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-left font-mono text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">{error.message}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 dark:bg-brand-600 dark:hover:bg-brand-500">
              <RefreshCw className="h-4 w-4" /> Tải lại trang
            </button>
            <a href="/" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
              <Home className="h-4 w-4" /> Quay về trang chủ
            </a>
          </div>
        </div>
      </div>
    );
  }
}
