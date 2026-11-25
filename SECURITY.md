# Chính sách bảo mật (Security Policy)

Cảm ơn bạn đã góp phần giữ an toàn cho cộng đồng **VAHA Market**.

## Phiên bản được hỗ trợ

| Phiên bản | Trạng thái |
| --- | --- |
| `2.0.x` | Đang hỗ trợ vá lỗi bảo mật |
| `< 2.0.0` | Ngừng hỗ trợ |

## Cách báo cáo lỗ hổng bảo mật

**Vui lòng KHÔNG mở GitHub Issue công khai cho các vấn đề bảo mật.**

Hãy gửi báo cáo riêng tư thông qua tính năng **Private Vulnerability Reporting** trên GitHub:

- Truy cập: https://github.com/NTCHuy/VAHAMarket/security/advisories/new

Khi báo cáo, bạn vui lòng cung cấp:
- Mô tả ngắn gọn loại lỗ hổng và thành phần bị ảnh hưởng (tệp mã nguồn, hàm RPC SQL, Edge Function hoặc endpoint API).
- Các bước tái hiện chi tiết hoặc đoạn mã chứng minh (PoC) trên môi trường thử nghiệm.
- Mức độ ảnh hưởng dự kiến và đề xuất hướng khắc phục (nếu có).

## Thời gian phản hồi dự kiến

- Xác nhận đã tiếp nhận báo cáo: trong vòng **48 giờ**.
- Đánh giá mức độ nghiêm trọng và trao đổi bản vá: ưu tiên xử lý sớm nhất đối với các lỗi liên quan đến RLS, xác thực thanh toán/webhook hoặc rò rỉ dữ liệu người dùng.

## Nguyên tắc bảo mật dành cho người tự triển khai (Self-hosting)

Khi tự triển khai bản sao của VAHA Market, hãy đảm bảo:
1. **Không** đưa `SB_SECRET_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SEPAY_WEBHOOK_KEY` hoặc `GMAIL_APP_PASSWORD` vào `.env` frontend (`VITE_*`) hay công khai lên Git.
2. Đặt đầy đủ biến `SEPAY_ALLOWED_ACCOUNTS` trong Supabase Secrets để tránh xử lý nhầm giao dịch từ tài khoản khác.
3. Bật xác thực 2 bước (2FA) cho các tài khoản quản trị Supabase, GitHub, Vercel, Cloudinary và SePay.
4. Giới hạn định dạng và kích thước ảnh trên Cloudinary Upload Preset.
