# Lịch sử thay đổi (Changelog)

Tài liệu ghi nhận các thay đổi chính của dự án **VAHA Market**.

## [2.0.7]

### Hệ thống đánh giá xác thực sau giao dịch (Verified Reviews)
- **CSDL & Bảo mật** (`supabase/migrations/017_v207_verified_reviews.sql`):
  - Bảng `order_reviews` gắn chặt với `orders` đã hoàn tất (`COMPLETED` hoặc `PAID_OUT`); mỗi bên gửi tối đa 1 đánh giá cho mỗi đơn và được chỉnh sửa trong vòng 7 ngày.
  - Tự động kiểm duyệt nội dung chống dẫn dụ ngoài sàn (`listing_text_violation`) cho nhận xét và phản hồi; lưu nhật ký quản trị khi Admin ẩn/hiện đánh giá (`HIDE_REVIEW` / `SHOW_REVIEW`).
  - Đồng bộ tự động điểm uy tín (`seller_rating_avg`, `seller_rating_count`) trên `profiles` thông qua trigger `SECURITY DEFINER`.
- **Trải nghiệm đánh giá & Phản hồi** (`StarRating.tsx`, `OrderReviewSection.tsx`, `OrderDetail.tsx`, `Orders.tsx`):
  - Người mua và người bán chấm 1–5 sao, chọn thẻ nhận xét nhanh và viết đánh giá chi tiết ngay trong chi tiết đơn hàng hoàn tất; gắn nhãn `Chờ đánh giá` trên trang Danh sách đơn.
  - Người được đánh giá có thể gửi và chỉnh sửa phản hồi trong vòng 7 ngày.
- **Hiển thị uy tín công khai & Kiểm duyệt** (`SellerProfile.tsx`, `ListingDetail.tsx`, `Home.tsx`, `ReviewsTab.tsx`, `AdminDashboard.tsx`):
  - Hiển thị điểm sao uy tín trên thẻ sản phẩm ở trang chủ, trang chi tiết sản phẩm và phần đầu hồ sơ `/u/:id`.
  - Bổ sung tab **Đánh giá** trên `/u/:id` (thống kê 5–1 sao, lọc theo vai trò người mua/người bán) và tab **Đánh giá** trong trang Quản trị để ẩn/hiện các đánh giá vi phạm quy định.

## [2.0.6]

### Tính năng cộng đồng & Tối ưu hiệu năng
- **Trang hồ sơ công khai người bán (`/u/:id`)** (`supabase/migrations/016_v206_seller_profile_saved_and_reports.sql`, `SellerProfile.tsx`):
  - Hiển thị thông tin công khai của người bán (huy hiệu Mod, trạng thái đối chiếu FB & NH, số đơn đã bán, liên kết Facebook), danh sách sản phẩm đang mở bán và các sản phẩm đã bán gần đây mà không lộ dữ liệu nhạy cảm.
  - Gắn liên kết trực tiếp từ trang chi tiết sản phẩm (`ListingDetail.tsx`) và menu tài khoản (`Navbar.tsx`).
- **Lưu tin yêu thích (`/saved`) & cảnh báo giảm giá Realtime** (`SavedListingsContext.tsx`, `SavedListings.tsx`):
  - Cho phép lưu nhanh tin đăng ngay trên trang chủ (`Home.tsx`), trang người bán (`SellerProfile.tsx`) và trang chi tiết sản phẩm.
  - Tự động phát hiện giảm giá khi người bán cập nhật giá tin đang lưu và gửi thông báo Toast theo thời gian thực.
- **Báo cáo tin đăng vi phạm & Tab Báo cáo quản trị** (`ReportListingModal.tsx`, `ReportsTab.tsx`):
  - Cho phép thành viên báo cáo tin có dấu hiệu giả mạo, lừa đảo, dẫn dụ ngoài sàn hoặc đã bán nhưng quên gỡ (giới hạn tần suất và chống báo cáo trùng).
  - Thêm tab **Báo cáo** trong trang quản trị (`AdminDashboard.tsx`) cho phép Admin mở hồ sơ người bán, gỡ/xóa tin hoặc đánh dấu xử lý kèm ghi chú nhật ký.
- **Tách mã nguồn theo route (`React.lazy`)**: Tách `AdminDashboard` và các trang ít dùng ra khỏi bundle chính (`App.tsx`, `ListingDetail.tsx`) để người dùng phổ thông tải trang chủ và trang sản phẩm nhanh hơn.

## [2.0.5]

### Quản trị & Kiểm duyệt
- **Xem hồ sơ chi tiết thành viên** (`supabase/migrations/015_admin_member_inspector_and_listing_moderation.sql`, `MemberDetailModal.tsx`):
  - Tìm kiếm & lọc thành viên theo tên (có/không dấu), email, SĐT, Facebook, số tài khoản ngân hàng, UUID hoặc theo nhóm (`Mod`, `Có cảnh báo`, `Đã khóa`, `Thiếu hồ sơ bán`, `Có tin bán`).
  - Xem đầy đủ hồ sơ kiểm duyệt: thông tin liên hệ, danh sách tài khoản ngân hàng, thiết bị đã ghi nhận, **cảnh báo các tài khoản khác dùng chung thiết bị**, lịch sử tin đăng, lịch sử đơn hàng, lịch sử cảnh báo và nhật ký quản trị.
  - Ghi chú nội bộ riêng cho từng thành viên (`admin_member_notes`) và hỗ trợ cập nhật Facebook/SĐT khi hồ sơ đang bị khóa định danh (`admin_update_member_identity`).
  - Tích hợp nút mở nhanh hồ sơ ngay tại các tab **Duyệt tin**, **Khiếu nại**, **Quản lý tin**, **Thành viên**, **Cảnh báo & Khóa**, **Nhật ký** và trang chi tiết sản phẩm.
- **Gỡ, khôi phục và xóa vĩnh viễn bài viết đã duyệt** (`ListingModerationModal.tsx`, `ListingsTab.tsx`, `ListingDetail.tsx`):
  - Cho phép Admin gỡ tin sang trạng thái `removed` (hoặc khôi phục về `hidden`), hoặc xóa vĩnh viễn cả các tin đã duyệt (chưa giữ chỗ/chưa bán), bắt buộc nhập lý do và lưu vết vào nhật ký.
  - Tùy chọn gửi kèm +1 cảnh báo vi phạm cho người bán khi gỡ/xóa tin; hiển thị lý do gỡ tin cho người bán ở `/my-listings` và thông báo Realtime.
- **Tab Nhật ký quản trị (`AuditLogTab.tsx`)**: Tra cứu toàn bộ lịch sử thao tác quản trị theo nhóm hành động và từ khóa.
- **Tối ưu `.github/dependabot.yml`**: Bỏ qua nâng cấp major gây xung đột cho các gói nền tảng (`react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `tailwindcss`) và gộp bản vá nhỏ theo tuần.

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
