/** Lấy thông báo lỗi dễ đọc từ Error / PostgrestError / giá trị bất kỳ. */
export function getErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as { message: unknown }).message);
  return 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}

/** CHECK `listings_bank_required`: tin nháp/đang bán/ẩn không được thiếu tài khoản nhận tiền. */
export function isBankInUseError(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const msg = getErrorMessage(e);
  return msg.includes('listings_bank_required') || (code === '23514' && msg.includes('listings'));
}
