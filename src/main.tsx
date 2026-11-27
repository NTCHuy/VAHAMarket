import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

const container = document.getElementById('root')!;
const root = createRoot(container);

/**
 * Import động để nếu thiếu file .env (VITE_SUPABASE_URL...) thì hiện thông báo lỗi rõ ràng
 * thay vì màn hình trắng.
 */
async function start() {
  try {
    const [
      { default: App },
      { AuthProvider },
      { PlatformSettingsProvider },
      { OrderAlertsProvider },
      { NotificationProvider },
      { SavedListingsProvider },
    ] = await Promise.all([
      import('./App'),
      import('./context/AuthContext'),
      import('./context/PlatformSettingsContext'),
      import('./context/OrderAlertsContext'),
      import('./context/NotificationContext'),
      import('./context/SavedListingsContext'),
    ]);
    root.render(
      <StrictMode>
        <ThemeProvider>
          <ErrorBoundary variant="fullscreen">
            <BrowserRouter>
              <AuthProvider>
                <PlatformSettingsProvider>
                  <OrderAlertsProvider>
                    <NotificationProvider>
                      <SavedListingsProvider>
                        <App />
                      </SavedListingsProvider>
                    </NotificationProvider>
                  </OrderAlertsProvider>
                </PlatformSettingsProvider>
              </AuthProvider>
            </BrowserRouter>
          </ErrorBoundary>
        </ThemeProvider>
      </StrictMode>,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    root.render(
      <div className="mx-auto mt-16 max-w-lg rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
        <h1 className="mb-2 text-base font-semibold">Không khởi động được ứng dụng</h1>
        <p>{message}</p>
        <p className="mt-3 text-red-700 dark:text-red-300">
          Kiểm tra file <code>.env</code> ở thư mục gốc dự án (sao chép từ <code>.env.example</code>), sau đó khởi động lại <code>npm run dev</code>.
        </p>
      </div>,
    );
  }
}

void start();
