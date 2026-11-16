import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** 'fullscreen': bọc toàn app (không phụ thuộc router). 'inline': bọc 1 trang/khu vực. */
  variant?: 'fullscreen' | 'inline';
  /** Khi giá trị này đổi (vd: đường dẫn mới) thì tự thoát khỏi trạng thái lỗi. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/** Bắt lỗi render để không bao giờ trắng trang. Dùng thẻ <a> thường (không dùng router) để luôn hoạt động. */
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
      <div className={fullscreen ? 'flex min-h-screen items-center justify-center bg-slate-50 p-4' : 'flex justify-center py-10'}>
        <div role="alert" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Đã có lỗi hiển thị</h1>
          <p className="mt-1 text-sm text-slate-600">
            Trang gặp sự cố ngoài ý muốn. Dữ liệu và tiền của bạn không bị ảnh hưởng. Hãy tải lại trang hoặc quay về trang chủ.
          </p>
          <p className="mt-3 break-words rounded-lg bg-slate-50 px-3 py-2 text-left font-mono text-xs text-slate-500">{error.message}</p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button type="button" onClick={() => window.location.reload()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">
              <RefreshCw className="h-4 w-4" /> Tải lại trang
            </button>
            <a href="/" className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Home className="h-4 w-4" /> Quay về trang chủ
            </a>
          </div>
        </div>
      </div>
    );
  }
}
