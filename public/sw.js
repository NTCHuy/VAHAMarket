const CACHE_NAME = 'vaha-market-shell-v210';
const SHELL_ASSETS = ['/logo.png', '/favicon.svg', '/manifest.webmanifest', '/theme-init.js'];

const OFFLINE_HTML = `<!doctype html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mất kết nối mạng — VAHA Market</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: #0a0a0a; color: #f5f5f5; display: flex; min-height: 100vh; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 380px; border: 1px solid #262626; border-radius: 10px; background: #171717; padding: 24px; text-align: center; }
    h1 { margin: 0 0 8px; font-size: 18px; }
    p { margin: 0 0 16px; font-size: 14px; color: #a3a3a3; line-height: 1.5; }
    button, .btn { display: inline-block; border: 0; border-radius: 8px; background: #1d4ed8; color: #fff; font-size: 14px; font-weight: 600; padding: 10px 18px; cursor: pointer; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Không có kết nối mạng</h1>
    <p>VAHA Market cần kết nối Internet để tải giá, tin đăng và trạng thái giao dịch mới nhất.</p>
    <a class="btn" href="/">Thử tải lại</a>
  </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          }),
      ),
    );
    return;
  }

  if (SHELL_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response && response.ok) {
              const copy = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            }
            return response;
          })
          .catch(() => cached);
        return cached || networkFetch;
      }),
    );
  }
});
