/**
 * Upload ảnh lên Cloudinary qua REST API bằng Unsigned Upload Preset.
 * Không dùng Firebase Storage nên không tốn dung lượng Firebase.
 *
 * Cấu hình preset trên Cloudinary (Settings → Upload → Upload presets):
 *  - Signing mode: Unsigned
 *  - Folder: listings (hoặc để client gửi `folder`)
 *  - Allowed formats: jpg, png, webp, heic
 *  - (Khuyến nghị) Incoming transformation: c_limit,w_2000,q_auto,f_auto
 *
 * Lưu ý: preset unsigned KHÔNG cho phép xóa ảnh từ client. Ảnh mồ côi có thể dọn bằng Cloud Function (Admin API) ở bước sau.
 */
const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB trước khi nén
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

export interface UploadedImage {
  url: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
}

export interface UploadOptions {
  folder?: string;
  tags?: string[];
  /** Cạnh dài tối đa khi nén phía client (px). Mặc định 1800. */
  maxDimension?: number;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

export class CloudinaryError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = 'CloudinaryError';
  }
}

function assertConfigured(): void {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new CloudinaryError('Thiếu VITE_CLOUDINARY_CLOUD_NAME hoặc VITE_CLOUDINARY_UPLOAD_PRESET trong file .env');
  }
}

export function validateImage(file: File): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc HEIC.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `Ảnh quá lớn (tối đa ${MAX_IMAGE_BYTES / 1024 / 1024}MB).`;
  }
  return null;
}

/** Thu nhỏ + nén ảnh bằng canvas để tiết kiệm băng thông. HEIC/lỗi decode → trả file gốc. */
async function compressImage(file: File, maxDimension: number): Promise<Blob> {
  if (file.type === 'image/heic' || file.type === 'image/heif') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadImage(file: File, options: UploadOptions = {}): Promise<UploadedImage> {
  assertConfigured();

  const invalid = validateImage(file);
  if (invalid) throw new CloudinaryError(invalid);

  const body = await compressImage(file, options.maxDimension ?? 1800);

  const form = new FormData();
  form.append('file', body, file.name);
  form.append('upload_preset', UPLOAD_PRESET);
  if (options.folder) form.append('folder', options.folder);
  if (options.tags?.length) form.append('tags', options.tags.join(','));

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

  return new Promise<UploadedImage>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };

    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* bỏ qua */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          url: String(data.secure_url),
          publicId: String(data.public_id),
          width: Number(data.width),
          height: Number(data.height),
          bytes: Number(data.bytes),
          format: String(data.format),
        });
      } else {
        const message = (data.error as { message?: string } | undefined)?.message ?? 'Tải ảnh thất bại.';
        reject(new CloudinaryError(message, xhr.status));
      }
    };

    xhr.onerror = () => reject(new CloudinaryError('Lỗi mạng khi tải ảnh lên.'));
    xhr.onabort = () => reject(new CloudinaryError('Đã hủy tải ảnh.'));

    options.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Tải nhiều ảnh, tối đa `concurrency` ảnh cùng lúc. Giữ nguyên thứ tự đầu vào. */
export async function uploadImages(
  files: File[],
  options: Omit<UploadOptions, 'onProgress'> & { concurrency?: number; onFileProgress?: (index: number, percent: number) => void } = {},
): Promise<UploadedImage[]> {
  const { concurrency = 3, onFileProgress, ...rest } = options;
  const results: UploadedImage[] = new Array(files.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (next < files.length) {
      const i = next++;
      results[i] = await uploadImage(files[i], { ...rest, onProgress: (p) => onFileProgress?.(i, p) });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, files.length) }, worker));
  return results;
}

export interface TransformOptions {
  width?: number;
  height?: number;
  crop?: 'fill' | 'fit' | 'limit' | 'scale' | 'thumb';
  quality?: 'auto' | number;
}

/** Thêm transformation (f_auto,q_auto,w_..) vào URL Cloudinary để giảm dung lượng hiển thị. */
export function cldUrl(url: string, { width, height, crop = 'limit', quality = 'auto' }: TransformOptions = {}): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'res.cloudinary.com') return '';
    const marker = '/upload/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx === -1) return parsed.toString();

    const parts = ['f_auto', `q_${quality}`];
    if (width) parts.push(`w_${width}`);
    if (height) parts.push(`h_${height}`);
    if (width || height) parts.push(`c_${crop}`);

    const prefix = parsed.pathname.slice(0, idx + marker.length);
    const suffix = parsed.pathname.slice(idx + marker.length);
    return `https://res.cloudinary.com${prefix}${parts.join(',')}/${suffix}`;
  } catch {
    return '';
  }
}
