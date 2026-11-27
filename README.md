# VAHA Market

*Vietnamese Association of Headphone Addicts Market* — sàn trung gian (escrow) đồ âm thanh đã qua sử dụng **0% phí**, phi lợi nhuận của cộng đồng *Hội người Việt nghiện tai nghe*.

- Trang web chính thức: https://vahamarket.vercel.app
- Mã nguồn: https://github.com/NTCHuy/VAHAMarket
- Giấy phép: [AGPL-3.0](./LICENSE)
- Lịch sử thay đổi: [CHANGELOG.md](./CHANGELOG.md)
- Hướng dẫn đóng góp: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Chính sách bảo mật: [SECURITY.md](./SECURITY.md)

---

## Tính năng chính

- **Trung gian giữ tiền 0% phí**: Tạo mã VietQR tự động theo từng mã đơn (`CNTH...`) và đối soát biến động số dư qua SePay webhook.
- **Minh bạch và duy trì cộng đồng**: Công khai sổ minh bạch dòng tiền tại `/transparency` và trang ủng hộ tự nguyện duy trì hạ tầng tại `/support`.
- **Kiểm duyệt chống lừa đảo nhiều lớp**:
  - Bắt buộc hồ sơ người bán đầy đủ (số điện thoại, link Facebook cá nhân, tài khoản ngân hàng chính chủ).
  - Bắt buộc ảnh xác thực viết tay chụp cùng sản phẩm (`VAHA + Ngày tháng + Tên Facebook`).
  - Tiền kiểm tin đăng trước khi hiển thị công khai (Mod/Admin được duyệt thẳng).
  - Bộ lọc chặn dẫn dụ giao dịch ngoài sàn đồng bộ giữa frontend (`src/lib/moderation.ts`) và trigger cơ sở dữ liệu.
  - Tự động khóa thông tin định danh (Facebook, tài khoản ngân hàng) khi đang có tin mở hoặc đơn chưa hoàn tất.
  - Hệ thống 3 cảnh báo tự khóa tài khoản và nhận diện thiết bị chống lập tài khoản mới né khóa.
- **Bảo vệ giao nhận và hoàn tiền**:
  - Hạn gửi hàng 48 giờ tính từ khi đơn chuyển sang trạng thái đã giữ tiền; người mua có thể hủy hoàn tiền nếu quá hạn.
  - Hàng đợi hoàn tiền tạo sẵn mã VietQR cho người mua; hỗ trợ rà soát các đơn quá hạn 14 ngày chưa xác nhận nhận hàng.
  - Yêu cầu người bán nhập đơn vị vận chuyển, mã vận đơn, link video đóng gói và nhắc người mua quay video mở hộp 6 mặt.
- **Quản trị và kiểm duyệt nâng cao**:
  - Tra cứu hồ sơ chi tiết từng thành viên (SĐT, Facebook, ngân hàng, thiết bị trùng, lịch sử tin/đơn, ghi chú nội bộ, sửa định danh khi bị khóa).
  - Gỡ, khôi phục hoặc xóa vĩnh viễn bài viết đã duyệt kèm nhật ký quản trị (`admin_audit_log`).
- **Trải nghiệm sử dụng**:
  - Hệ thống đánh giá xác thực hai chiều sau giao dịch hoàn tất (`order_reviews`), hiển thị điểm sao uy tín trên trang chủ, chi tiết sản phẩm và tab Đánh giá trong hồ sơ công khai.
  - Trang hồ sơ công khai người bán (`/u/:id`) hiển thị sản phẩm đang bán, lịch sử đã bán và trạng thái đối chiếu.
  - Lưu tin yêu thích (`/saved`) kèm cảnh báo Realtime khi người bán hạ giá.
  - Nút báo cáo tin vi phạm từ cộng đồng giúp kiểm duyệt viên xử lý sớm.
  - Tìm kiếm tiếng Việt không dấu (`unaccent`).
  - Hỗ trợ Dark Mode (Light / Dark / System), luôn giữ nền trắng quanh mã VietQR để quét ổn định.
  - Thông báo thời gian thực (Toast + Web Notification) và 7 loại email thông báo tự động qua Gmail SMTP.
  - Tạo thẻ Open Graph động theo từng tin đăng (`api/og-listing.ts`).

---

## Công nghệ và cấu trúc thư mục

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS, React Router 7 |
| Backend & DB | Supabase (Auth, PostgreSQL + RLS, Realtime, Edge Functions) |
| Ảnh sản phẩm | Cloudinary (Unsigned Upload) |
| Thanh toán & Đối soát | VietQR + SePay Webhook |
| Email thông báo | Nodemailer (Gmail SMTP) + `pg_net` |
| Triển khai & OG | Vercel (Static SPA + Edge Runtime) |

```text
vaha-market/
├── api/                         # Vercel Edge API (Open Graph động cho /listing/:id)
├── public/                      # Tài nguyên tĩnh, script khởi tạo theme, robots.txt
├── scripts/                     # Script tạo ảnh preview Open Graph
├── src/
│   ├── components/              # Layout, Navbar, QR, bảng giá, khung bảo vệ, UI cơ bản
│   ├── constants/               # Cấu hình liên kết, ngân hàng, thanh toán, ủng hộ
│   ├── context/                 # Auth, Theme, Notification, OrderAlerts, PlatformSettings
│   ├── hooks/                   # Hooks đếm ngược và tiêu đề trang
│   ├── lib/                     # Tiện ích Supabase, Cloudinary, moderation, tiền tệ, URL
│   └── pages/                   # Các trang người dùng và bảng điều khiển Admin
└── supabase/
    ├── schema.sql               # Lược đồ cơ sở dữ liệu gốc
    ├── migrations/              # Các bản vá từ 002 đến 016 (idempotent)
    └── functions/               # Edge Functions: sepay-webhook, send-order-email
```

---

## Kiến trúc bảo mật

- **Row Level Security (RLS) mặc định đóng**: Mọi chuyển đổi trạng thái đơn hàng và kiểm tra quyền hạn đều đi qua các hàm RPC `SECURITY DEFINER` (có `set search_path = ''`) hoặc `service_role`.
- **Tách dữ liệu nhạy cảm**: Thông tin tài khoản ngân hàng giải ngân (`order_payouts`) và hoàn tiền (`order_refund_accounts`) được tách khỏi bảng `orders`, chỉ bên liên quan hợp lệ và Admin mới đọc được.
- **Xác thực Webhook và nội bộ**: `sepay-webhook` so khớp API Key theo thời gian hằng số, giới hạn kích thước payload và hỗ trợ lọc số tài khoản nhận hợp lệ qua `SEPAY_ALLOWED_ACCOUNTS`; `send-order-email` chỉ chấp nhận khóa nội bộ `SB_SECRET_KEY`.
- **Kiểm soát đầu vào và tiêu đề HTTP**: Kiểm tra URL ảnh Cloudinary/avatar ở cả frontend lẫn DB trigger; tách script theme khỏi `index.html` để áp dụng Content Security Policy chặt chẽ, HSTS, `X-Frame-Options: DENY` và `X-Content-Type-Options: nosniff` trong `vercel.json`.

---

## Hướng dẫn tự triển khai (Self-hosting)

### Yêu cầu

- Node.js 18 trở lên (khuyến nghị Node.js 20 LTS)
- Tài khoản Supabase, Cloudinary, SePay và Vercel
- Tài khoản Gmail bật xác minh 2 bước + App Password (nếu bật email thông báo tự động)

> Không mở trực tiếp `index.html` bằng trình duyệt. Dự án dùng Vite và cần chạy qua lệnh `npm`.

### Bước 1 — Chạy thử trên máy cục bộ

```bash
git clone https://github.com/NTCHuy/VAHAMarket.git
cd VAHAMarket
npm install
cp .env.example .env
```

Điền các biến trong `.env` (chỉ đặt biến cấu hình công khai cho frontend; **tuyệt đối không** đưa `sb_secret_...` vào `.env` hoặc Vercel):

| Biến môi trường | Ý nghĩa |
| --- | --- |
| `VITE_SUPABASE_URL` | URL project Supabase (`https://<PROJECT_REF>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Khóa công khai dạng `sb_publishable_...` trong Supabase API Keys |
| `VITE_CLOUDINARY_CLOUD_NAME` | Cloud Name trên Cloudinary |
| `VITE_CLOUDINARY_UPLOAD_PRESET` | Tên Upload Preset (chế độ `Unsigned`) trên Cloudinary |
| `VITE_ESCROW_ACCOUNT_NAME` | Tên chủ tài khoản trung gian (in hoa không dấu, hiện trên QR) |
| `VITE_SUPPORT_BANK_BIN` | Mã BIN ngân hàng nhận ủng hộ (tra trong `src/constants/banks.ts`) |
| `VITE_SUPPORT_BANK_NAME` | Tên viết tắt ngân hàng nhận ủng hộ (ví dụ `BIDV`) |
| `VITE_SUPPORT_ACCOUNT_NO` | Số tài khoản nhận ủng hộ hiển thị tại `/support` |
| `VITE_SUPPORT_ACCOUNT_NAME` | Tên chủ tài khoản nhận ủng hộ |

Khởi chạy môi trường phát triển:

```bash
npm run dev
```

Mở `http://localhost:5173`. Sau khi sửa `.env`, cần dừng và chạy lại `npm run dev`.

### Bước 2 — Thiết lập Supabase

1. Vào **Supabase Dashboard → SQL Editor** và chạy lần lượt toàn bộ 17 file SQL theo đúng thứ tự:
   1. `supabase/schema.sql`
   2. `supabase/migrations/002_ui_fields.sql`
   3. `supabase/migrations/003_order_dispute_fields.sql`
   4. `supabase/migrations/004_admin_actions.sql`
   5. `supabase/migrations/005_vaha_rebrand_and_fees.sql`
   6. `supabase/migrations/006_platform_settings_and_ux.sql`
   7. `supabase/migrations/007_bulletproof_moderation.sql`
   8. `supabase/migrations/008_email_notifications.sql`
   9. `supabase/migrations/009_ban_and_fingerprinting.sql`
   10. `supabase/migrations/010_platform_fee_cap.sql`
   11. `supabase/migrations/011_refund_and_overdue_delivery.sql`
   12. `supabase/migrations/012_v2_community_zero_fee_and_search.sql`
   13. `supabase/migrations/013_v203_public_transparency_ledger.sql`
   14. `supabase/migrations/014_security_hardening.sql`
   15. `supabase/migrations/015_admin_member_inspector_and_listing_moderation.sql`
   16. `supabase/migrations/016_v206_seller_profile_saved_and_reports.sql`
   17. `supabase/migrations/017_v207_verified_reviews.sql`

   *Lưu ý: nếu SQL Editor báo lỗi liên quan đến giá trị enum mới ở file `007`, hãy chạy riêng 2 câu lệnh `alter type public.listing_status add value ...` trước rồi chạy phần còn lại.*

2. Vào **Authentication → Providers → Google**, bật và điền Client ID / Client Secret từ Google Cloud Console (OAuth Web Application). Đặt *Authorized redirect URI* trên Google là:
   `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
3. Trong **Authentication → URL Configuration**, thêm `http://localhost:5173` vào *Redirect URLs* để thử nghiệm cục bộ.
4. Đăng nhập vào web một lần bằng Google, lấy `User UID` trong **Authentication → Users**, rồi cấp quyền Admin trong SQL Editor:
   ```sql
   insert into public.admins (user_id) values ('UUID_CUA_BAN');
   ```
5. (Khuyến nghị) Kích hoạt `pg_cron` theo phần 8 trong `supabase/schema.sql` để tự động hủy các đơn quá hạn thanh toán sau 15 phút.

### Bước 3 — Cấu hình Cloudinary

1. Vào **Cloudinary Console → Settings → Upload → Upload presets → Add upload preset**.
2. Chọn **Signing Mode: Unsigned**.
3. Đặt **Allowed formats** là `jpg,png,webp,avif` và cấu hình **Incoming Transformation** (ví dụ giới hạn cạnh tối đa và chất lượng tự động) để kiểm soát dung lượng ảnh đầu vào. (Gói Free của Cloudinary tự giới hạn kích thước tệp tối đa 10 MB ở phía máy chủ.)

### Bước 4 — Deploy Edge Functions

1. Tạo một chuỗi bí mật ngẫu nhiên dài tối thiểu 32 ký tự làm khóa webhook SePay (ví dụ `openssl rand -hex 24`), gọi là `SEPAY_WEBHOOK_KEY`.
2. Lấy khóa `sb_secret_...` trong **Supabase Dashboard → Project Settings → API Keys**.
3. Đăng nhập CLI, liên kết project và đặt secrets cho `sepay-webhook`:
   ```bash
   npx supabase login
   npx supabase link --project-ref <PROJECT_REF>
   npx supabase secrets set \
     SB_SECRET_KEY=sb_secret_xxx \
     SEPAY_WEBHOOK_KEY=chuoi_bi_mat_cua_ban \
     SEPAY_ALLOWED_ACCOUNTS="SO_TAI_KHOAN_ESCROW_CUA_BAN"
   npm run functions:deploy
   ```
   Lệnh `functions:deploy` dùng `--no-verify-jwt` vì SePay không gửi JWT của Supabase mà xác thực bằng header `Authorization: Apikey <SEPAY_WEBHOOK_KEY>`.
4. Kiểm tra nhanh webhook (thay `<PROJECT_REF>`, key và số tài khoản phù hợp):
   ```bash
   curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/sepay-webhook" \
     -H "Authorization: Apikey chuoi_bi_mat_cua_ban" \
     -H "Content-Type: application/json" \
     -d '{"id":1,"transferType":"in","transferAmount":10000,"content":"test khong ma","accountNumber":"SO_TAI_KHOAN_ESCROW_CUA_BAN"}'
   ```
   Kết quả đúng trả về `"result":"UNMATCHED"` (hãy xóa dòng thử nghiệm trong bảng `transactions` sau khi kiểm tra).
5. (Tùy chọn) Bật email tự động `send-order-email`:
   - Đảm bảo `pg_net` đã được bật (đã kèm trong migration `008`).
   - Đặt secrets và deploy:
     ```bash
     npx supabase secrets set \
       GMAIL_USER="your_email@gmail.com" \
       GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" \
       SITE_URL="https://domain-cua-ban.vercel.app"
     npm run functions:deploy:email
     ```
   - Chạy SQL 1 lần trong **SQL Editor** để database trigger biết URL và khóa gọi function:
     ```sql
     insert into public.internal_email_config (id, function_url, secret_key)
     values (
       1,
       'https://<PROJECT_REF>.supabase.co/functions/v1/send-order-email',
       'sb_secret_xxx'
     )
     on conflict (id) do update
       set function_url = excluded.function_url,
           secret_key   = excluded.secret_key,
           updated_at   = now();
     ```

### Bước 5 — Kết nối Webhook SePay.vn

1. Đăng nhập SePay, liên kết tài khoản ngân hàng nhận tiền trung gian (khớp với `src/constants/payment.ts`).
2. Tạo Webhook mới với cấu hình:
   - **URL**: `https://<PROJECT_REF>.supabase.co/functions/v1/sepay-webhook`
   - **Sự kiện**: *Có tiền vào*
   - **Tài khoản ngân hàng**: tài khoản nhận tiền trung gian
   - **Kiểu chứng thực**: *API Key* → nhập đúng giá trị `SEPAY_WEBHOOK_KEY`
   - **Content-Type**: `application/json`
   - Không bật tùy chọn bỏ qua giao dịch không có code thanh toán (hệ thống tự nhận diện mã `CNTH...`).

### Bước 6 — Tùy biến thương hiệu và Deploy lên Vercel

1. Trước khi đưa lên domain riêng, cập nhật các tệp cấu hình sau cho phù hợp với cộng đồng của bạn:
   - `src/constants/links.ts`: liên kết cộng đồng Facebook, Discord, tên thương hiệu.
   - `src/constants/payment.ts` và `src/constants/banks.ts`: ngân hàng và số tài khoản trung gian (hỗ trợ cả tài khoản ảo VA chữ và số).
   - `index.html`, `api/og-listing.ts` và `scripts/generate-og-preview.py`: domain, tiêu đề và ảnh xem trước liên kết Open Graph.
2. Đưa mã nguồn lên GitHub và tạo Project mới trên Vercel. `vercel.json` đã cấu hình sẵn lệnh build `npm run build`, thư mục `dist`, tiêu đề bảo mật HTTP và quy tắc rewrite cho SPA cũng như `/api/og-listing`.
3. Khai báo đầy đủ 9 biến `VITE_*` ở Bước 1 trong **Vercel → Project Settings → Environment Variables**, rồi bấm **Deploy**.
4. Sau khi có domain thực tế, vào **Supabase → Authentication → URL Configuration** để cập nhật **Site URL** thành domain Vercel và thêm `https://<domain-cua-ban>/**` vào **Redirect URLs**.

---

## Đóng góp và Bảo mật

- Đọc [CONTRIBUTING.md](./CONTRIBUTING.md) và [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) trước khi gửi Pull Request.
- Nếu phát hiện lỗ hổng bảo mật, vui lòng xem [SECURITY.md](./SECURITY.md) và báo cáo riêng tư — **không** mở Issue công khai.

---

## Giấy phép

VAHA Market được phát hành theo giấy phép **GNU Affero General Public License v3.0 (AGPL-3.0)**. Xem toàn văn trong tệp [LICENSE](./LICENSE).

Tóm tắt quyền và nghĩa vụ chính:
- Bạn có quyền xem, sử dụng, sửa đổi và triển khai lại mã nguồn cho mục đích cá nhân hoặc cộng đồng.
- Mọi phiên bản sửa đổi khi phát hành hoặc triển khai chạy trên máy chủ cho người dùng tương tác từ xa qua mạng đều phải được phát hành theo giấy phép **AGPL-3.0**, giữ nguyên thông báo bản quyền/giấy phép và cung cấp liên kết công khai tới mã nguồn tương ứng đầy đủ của phiên bản đang chạy (Điều 13 AGPL-3.0).
- Phần mềm được cung cấp nguyên trạng, không kèm bất kỳ bảo đảm pháp lý nào.
