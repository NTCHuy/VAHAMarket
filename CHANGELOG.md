# Lịch sử thay đổi (Changelog)

Tài liệu ghi nhận các thay đổi chính của dự án **VAHA Market**.

## [2.0.4]

### Mã nguồn mở & Tài liệu
- Phát hành chính thức mã nguồn mở theo giấy phép **GNU AGPL-3.0**.
- Bổ sung [LICENSE](./LICENSE), viết lại [README.md](./README.md), thêm [CHANGELOG.md](./CHANGELOG.md), [SECURITY.md](./SECURITY.md), [CONTRIBUTING.md](./CONTRIBUTING.md), [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
- Bổ sung cấu hình GitHub trong `.github/` (CI lint/build, mẫu báo lỗi, mẫu đề xuất tính năng, mẫu Pull Request, Dependabot).
- Thêm liên kết mã nguồn AGPL-3.0 ở chân trang (`src/components/Layout.tsx`) để người dùng truy cập qua mạng luôn tìm thấy mã nguồn tương ứng.
- Cập nhật metadata gói và nâng cấp `react-router-dom` lên `^7.18.7`.

### Bảo mật (tổng hợp bản vá hoàn thiện từ 2.0.3 lên 2.0.4)
- **Cơ sở dữ liệu & RLS (`supabase/migrations/014_security_hardening.sql`)**:
  - Tách thông tin tài khoản ngân hàng nhận hoàn tiền của người mua sang bảng riêng `public.order_refund_accounts`, chỉ người mua của đơn và Admin mới có quyền đọc.
  - Siết các hàm trigger `SECURITY DEFINER` (`is_entity_blacklisted`, `listing_seller_missing`, `identity_locked`, `is_user_banned`, `is_mod_user`) bằng kiểm tra `pg_trigger_depth()` và thu hồi quyền thực thi từ `anon`.
  - Siết RPC `check_device_banned` / `register_device_and_check_ban`, kiểm tra định dạng URL ảnh Cloudinary (`listings.images`, `verification_image_url`) và `profiles.avatar_url`.
  - Chặn tài khoản đang bị khóa thực hiện mọi thao tác ghi trên các bảng giao dịch và đánh giá.
  - Mở rộng bộ lọc chặn dẫn dụ ngoài sàn cho trường `brand`, chặn tự động/người dùng hủy đơn đang ở trạng thái thanh toán thiếu tiền (`UNDERPAID`), bổ sung cập nhật `refund_requested_at` trong `admin_resolve_dispute`, và thu hồi quyền `UPDATE` trực tiếp trên `platform_settings`.
- **Frontend, Edge Functions & HTTP Headers**:
  - Tách script khởi tạo giao diện sáng/tối ra tệp `public/theme-init.js` để loại bỏ inline script trong `index.html`.
  - Bổ sung `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy` và `Permissions-Policy` trong `vercel.json`.
  - Siết xác thực đầu vào UUID, chuyển hướng an toàn, lọc hostname Cloudinary trên `api/og-listing.ts`, `src/lib/url.ts`, `src/lib/auth.ts`, `src/lib/cloudinary.ts`, `src/lib/fingerprint.ts`.
  - Tăng cường xác thực webhook `sepay-webhook` (kiểm tra kích thước payload, giá trị giao dịch, tùy chọn `SEPAY_ALLOWED_ACCOUNTS`) và làm sạch header/HTML trên `send-order-email`.
- **Ngôn ngữ giao diện**: Tinh gọn toàn bộ thông báo và nhãn giao diện sang tiếng Việt đơn giản, dễ hiểu.

## [2.0.3]

- Bổ sung trang công khai sổ minh bạch dòng tiền `/transparency` (`supabase/migrations/013_v203_public_transparency_ledger.sql`).
- Bổ sung API Open Graph động cho từng tin đăng (`/api/og-listing.ts`) và bộ nhận diện thương hiệu mới (`public/logo.png`, `public/favicon.svg`, `public/og-preview.png`).

## [2.0.0]

- Chuyển đổi hoàn toàn sang mô hình cộng đồng **0% phí**, phi lợi nhuận (`supabase/migrations/012_v2_community_zero_fee_and_search.sql`).
- Bổ sung trang ủng hộ tự nguyện duy trì vận hành (`/support`).
- Hỗ trợ tìm kiếm sản phẩm tiếng Việt không dấu (`unaccent`).

## [1.9.5]

- Bổ sung hạn gửi hàng 48 giờ tính từ khi nhận tiền, cho phép người mua hủy đơn hoàn tiền khi quá hạn và quy trình Admin rà soát đơn quá hạn 14 ngày (`supabase/migrations/011_refund_and_overdue_delivery.sql`).
- Bổ sung tab **Hoàn tiền** trong trang quản trị kèm mã VietQR hoàn tiền tự động.

## [1.9.3] - [1.9.4]

- Đồng nhất hệ màu trung tính `neutral-*`, góc bo gọn, kết hợp font `Inter` và `JetBrains Mono`.
- Bổ sung Skeleton Loaders, Breadcrumb, tiêu đề trang động và thanh đặt mua cố định trên thiết bị di động.
- Sửa lỗi hiển thị cắt chữ ở thành phần `BuyerProtectionSteps`.

## [1.9.0]

- Ra mắt hệ thống 3 cảnh báo tự động khóa tài khoản vĩnh viễn và danh sách đen thông tin định danh (`supabase/migrations/009_ban_and_fingerprinting.sql`).
- Tích hợp nhận diện thiết bị (`@fingerprintjs/fingerprintjs`) và màn hình khóa tài khoản vi phạm (`BannedScreen`).

## [1.8.0]

- Bổ sung trang Điều khoản sử dụng (`/terms`), chế độ Dark Mode toàn hệ thống, thông báo trình duyệt thời gian thực và gửi email tự động qua Gmail SMTP (`supabase/migrations/008_email_notifications.sql`).

## [1.7.0]

- Áp dụng quy trình kiểm duyệt chống lừa đảo: bắt buộc hồ sơ người bán, ảnh xác thực viết tay, tiền kiểm bài đăng, bộ lọc chặn giao dịch ngoài sàn đồng bộ frontend/DB và tự động khóa thông tin định danh khi có tin/đơn mở (`supabase/migrations/007_bulletproof_moderation.sql`).
