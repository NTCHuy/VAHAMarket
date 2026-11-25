# Hướng dẫn đóng góp (Contributing)

Cảm ơn bạn đã quan tâm và muốn đóng góp cho **VAHA Market**.

## Quy trình gửi Pull Request

1. Fork kho mã nguồn và tạo nhánh mới từ `main` (ví dụ: `fix/ten-sua-loi` hoặc `feat/ten-tinh-nang`).
2. Cài đặt phụ thuộc và tạo `.env` từ `.env.example` để chạy kiểm thử cục bộ:
   ```bash
   npm install
   npm run dev
   ```
3. Trước khi commit, chạy kiểm tra kiểu TypeScript và build sản phẩm:
   ```bash
   npm run lint
   npm run build
   ```
4. Tạo Pull Request về nhánh `main` với mô tả rõ ràng về thay đổi, lý do và cách kiểm tra.

## Quy ước giao diện và nội dung

- **Ngôn ngữ**: Tiếng Việt đơn giản, súc tích, ngắn gọn, dễ hiểu với người dùng phổ thông.
- **Không dùng emoji**: Không chèn emoji vào giao diện, nút bấm, thông báo, tiêu đề hay tài liệu.
- **Hệ màu và bố cục**:
  - Chỉ sử dụng thang màu trung tính `neutral-*` kết hợp màu nhấn `blue-600/700`, **không** dùng `slate-*`.
  - Dùng bo góc `rounded-md` / `rounded-lg`, viền `1px`, tránh bóng đổ nặng `shadow-*`.
  - Mọi mã QR VietQR phải nằm trong khung nền trắng có khoảng đệm (`bg-white p-3`) để bảo đảm quét ổn định cả ở Dark Mode.
- **Quy tắc cộng đồng**:
  - Giữ định hướng sàn trung gian **0% phí**, phi lợi nhuận; không thêm thông tin thu phí sàn vào giao diện người dùng hay email.
  - Không yêu cầu hay thu thập giấy tờ tùy thân cá nhân và không gắn nhãn danh xưng cá nhân vào thông báo hệ thống.

## Quy ước kỹ thuật và bảo mật

- **Không sửa file cấu hình vận hành trong PR chung**: Tránh thay đổi giá trị riêng trong `src/constants/links.ts`, `src/constants/payment.ts`, `src/constants/banks.ts` trừ khi sửa lỗi cấu trúc.
- **Hỗ trợ số tài khoản ảo (VA)**: Giữ nguyên biểu thức kiểm tra số tài khoản dạng chữ và số `/^[A-Z0-9]{6,25}$/i`.
- **Đồng bộ kiểm duyệt nội dung**: Nếu cập nhật quy tắc lọc ở `src/lib/moderation.ts`, bắt buộc cập nhật đồng bộ hàm SQL `public.listing_text_violation` qua một file migration mới.
- **Migration cơ sở dữ liệu**:
  - Tạo file mới theo số thứ tự kế tiếp trong `supabase/migrations/` (ví dụ `015_ten_thay_doi.sql`).
  - Viết migration theo hướng **idempotent** (chạy lại nhiều lần không lỗi).
  - Mọi hàm `SECURITY DEFINER` mới phải đặt `set search_path = ''`, thu hồi quyền mặc định (`REVOKE ALL`) và cấp `GRANT EXECUTE` đúng đối tượng cần thiết.
- **Bí mật hệ thống**: Tuyệt đối không commit khóa bí mật, mật khẩu, `.env` hoặc dữ liệu người dùng thật.

## Giấy phép đóng góp

Bằng việc gửi Pull Request tới kho mã nguồn này, bạn đồng ý rằng mã nguồn đóng góp của mình sẽ được phát hành theo giấy phép **GNU Affero General Public License v3.0 (AGPL-3.0)** tại tệp [LICENSE](./LICENSE).
