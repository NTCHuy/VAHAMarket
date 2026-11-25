/**
 * Bộ lọc chặn dẫn dụ giao dịch ngoài sàn. PHẢI khớp với hàm SQL `listing_text_violation` (migration 007 & 014):
 * frontend báo lỗi sớm, còn trigger trong DB là lớp chặn cuối cùng.
 */

/** Chuẩn hóa: chữ thường, bỏ dấu tiếng Việt (đ → d), gộp khoảng trắng. */
export function normalizeForModeration(text: string): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/đ/g, 'd')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Từ khóa lách luật (đã chuẩn hóa, không dấu). Sửa danh sách này thì sửa cả hàm SQL tương ứng. */
export const OFF_PLATFORM_KEYWORDS: readonly string[] = [
  'bank truc tiep', 'ck truc tiep', 'chuyen khoan truc tiep',
  'chuyen khoan rieng', 'ck rieng', 'bank rieng',
  'khong qua san', 'zalo',
];

// (a) ≥ 9 chữ số liên tiếp (9–11 chữ số là SĐT)
const LONG_DIGITS_RE = /[0-9]{9,11}/;
// (b) SĐT có phân cách (cách/chấm/gạch ngang), bắt đầu bằng 0 hoặc +84/84.
const SPACED_PHONE_RE = /(^|[^0-9.-])(\+?84|0)([ .-]*[0-9]){8,10}([^0-9]|$)/;

/** Trả về mô tả vi phạm đầu tiên (vd `số điện thoại`, `từ khóa "zalo"`), hoặc null nếu sạch. */
export function findViolation(text: string): string | null {
  const v = normalizeForModeration(text);
  if (LONG_DIGITS_RE.test(v) || SPACED_PHONE_RE.test(v)) return 'số điện thoại';
  for (const k of OFF_PLATFORM_KEYWORDS) {
    if (v.includes(k)) return `từ khóa "${k}"`;
  }
  return null;
}

export interface ContentErrors {
  title?: string;
  brand?: string;
  description?: string;
}

/** Kiểm tra tiêu đề + thương hiệu + mô tả; trả về lỗi tiếng Việt cho từng ô. */
export function validateListingContent(title: string, description: string, brand = ''): ContentErrors {
  const errors: ContentErrors = {};
  const t = findViolation(title);
  if (t) errors.title = `Tiêu đề không được chứa ${t}. Vui lòng xóa thông tin giao dịch ngoài sàn.`;
  const b = brand ? findViolation(brand) : null;
  if (b) errors.brand = `Thương hiệu không được chứa ${b}.`;
  const d = findViolation(description);
  if (d) errors.description = `Mô tả không được chứa ${d}. Vui lòng xóa thông tin giao dịch ngoài sàn (giá nên ghi dạng 15tr hoặc 15.000.000đ).`;
  return errors;
}
