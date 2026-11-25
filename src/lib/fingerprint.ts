import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'vaha-visitor-id';
const VALID_VID_RE = /^[A-Za-z0-9_-]{16,128}$/;
let pendingPromise: Promise<string | null> | null = null;

/** Tạo mã ngẫu nhiên riêng cho từng trình duyệt khi FingerprintJS bị chặn (không gây trùng lặp giữa người dùng khác). */
function generateRandomBrowserId(): string | null {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `dev_${crypto.randomUUID().replace(/-/g, '')}`;
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      return `dev_${hex}`;
    }
  } catch {
    // ignore
  }
  return null;
}

function readCachedId(): string | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
    // Bỏ qua mã dự phòng cũ (`fb_*`) dễ gây trùng giữa nhiều máy
    if (!VALID_VID_RE.test(val) || val.startsWith('fb_')) return null;
    return val;
  } catch {
    return null;
  }
}

function saveCachedId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage
  }
}

/**
 * Lấy mã định danh thiết bị ổn định (`visitorId`):
 * 1. Ưu tiên cache trong `localStorage` (bỏ qua mã `fb_*` cũ).
 * 2. Gọi `@fingerprintjs/fingerprintjs`.
 * 3. Nếu bị chặn, tạo mã ngẫu nhiên lưu riêng trên trình duyệt đó (tránh trùng lặp giữa người dùng).
 */
export function getVisitorId(): Promise<string | null> {
  const cached = readCachedId();
  if (cached) return Promise.resolve(cached);

  if (!pendingPromise) {
    pendingPromise = (async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const id = result.visitorId?.trim() ?? '';
        if (VALID_VID_RE.test(id) && !id.startsWith('fb_')) {
          saveCachedId(id);
          return id;
        }
      } catch {
        // Trình duyệt chặn FingerprintJS
      }
      const randomId = generateRandomBrowserId();
      if (randomId) saveCachedId(randomId);
      return randomId;
    })();
  }
  return pendingPromise;
}
