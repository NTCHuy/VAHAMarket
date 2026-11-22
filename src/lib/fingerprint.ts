import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'vaha-visitor-id';
let pendingPromise: Promise<string> | null = null;

/** Hash dự phòng ổn định (FNV-1a 64-bit mô phỏng) nếu trình duyệt chặn script FingerprintJS. */
function computeFallbackVisitorId(): string {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown-ua';
    const w = typeof screen !== 'undefined' ? screen.width : 0;
    const h = typeof screen !== 'undefined' ? screen.height : 0;
    const tz =
      typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown-tz'
        : 'unknown-tz';
    const raw = `${ua}|${w}x${h}|${tz}`;

    let h1 = 0x811c9dc5;
    let h2 = 0x01000193;
    for (let i = 0; i < raw.length; i++) {
      const c = raw.charCodeAt(i);
      h1 ^= c;
      h1 = Math.imul(h1, 0x01000193);
      h2 ^= c + i;
      h2 = Math.imul(h2, 0x01000193);
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
    return `fb_${hex1}${hex2}`;
  } catch {
    return 'fb_fallback_device';
  }
}

function readCachedId(): string | null {
  try {
    const val = localStorage.getItem(STORAGE_KEY)?.trim() ?? '';
    return val.length >= 4 ? val : null;
  } catch {
    return null;
  }
}

function saveCachedId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Bỏ qua nếu trình duyệt chặn localStorage (chế độ ẩn danh nghiêm ngặt)
  }
}

/**
 * Lấy mã định danh thiết bị ổn định (`visitorId`):
 * 1. Ưu tiên cache trong `localStorage` để tốc độ tức thì.
 * 2. Gọi `@fingerprintjs/fingerprintjs` (`FingerprintJS.load()` -> `fp.get()`).
 * 3. Fallback hash từ `userAgent + screen.width + screen.height + timeZone` nếu bị chặn script.
 */
export function getVisitorId(): Promise<string> {
  const cached = readCachedId();
  if (cached) return Promise.resolve(cached);

  if (!pendingPromise) {
    pendingPromise = (async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const id = result.visitorId?.trim();
        if (id && id.length >= 4) {
          saveCachedId(id);
          return id;
        }
      } catch {
        // Trình duyệt chặn FingerprintJS -> chuyển sang fallback hash
      }
      const fallback = computeFallbackVisitorId();
      saveCachedId(fallback);
      return fallback;
    })();
  }
  return pendingPromise;
}
