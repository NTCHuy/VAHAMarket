const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

/** Chỉ chấp nhận đường dẫn http:// hoặc https:// hợp lệ (chặn javascript:, data:, vbscript:...). */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
  } catch {
    // invalid URL
  }
  return null;
}

/** Chỉ chấp nhận ảnh Cloudinary qua HTTPS đúng hostname res.cloudinary.com. */
export function safeCloudinaryUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'https:' && u.hostname === 'res.cloudinary.com' && u.pathname.includes('/upload/')) {
      return u.toString();
    }
  } catch {
    // invalid URL
  }
  return null;
}

/** Đảm bảo đường dẫn chuyển hướng sau đăng nhập chỉ là đường dẫn tương đối nội bộ. */
export function sanitizeRedirectPath(path: string | undefined): string {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    return '/';
  }
  return path;
}
