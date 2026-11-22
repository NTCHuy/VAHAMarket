# VAHA Market

*Vietnamese Association of Headphone Addicts Market* — sàn C2C đồ âm thanh second-hand có trung gian giữ tiền (escrow), bảo lãnh bởi Hội người Việt nghiện tai nghe.
React + Vite + TypeScript + Tailwind · Supabase (Auth, Postgres/RLS, Realtime, Edge Functions) · Cloudinary · VietQR + SePay.

> **Không mở `index.html` bằng cách bấm đúp.** Đây là dự án Vite, phải chạy bằng lệnh (xem Bước 1).

---

## Bước 0 — Chuẩn bị Supabase (làm 1 lần)

1. Supabase Dashboard → **SQL Editor** → chạy lần lượt, mỗi file 1 lần:
   `supabase/schema.sql` → `supabase/migrations/002_ui_fields.sql` → `003_order_dispute_fields.sql` → `004_admin_actions.sql` → `005_vaha_rebrand_and_fees.sql` → `006_platform_settings_and_ux.sql` → `007_bulletproof_moderation.sql` → `008_email_notifications.sql` → `009_ban_and_fingerprinting.sql` → `010_platform_fee_cap.sql`
   *(Lưu ý: nếu SQL Editor báo lỗi liên quan đến giá trị enum mới ở `007`, hãy chạy riêng 2 dòng `alter type public.listing_status add value ...` trước, rồi chạy phần còn lại.)*
2. **Authentication → Providers → Google**: bật và nhập Client ID/Secret (Google Cloud Console → OAuth client, loại Web).
   *Authorized redirect URI* trên Google phải là `https://<PROJECT_REF>.supabase.co/auth/v1/callback`.
3. Đăng nhập vào web 1 lần, rồi lấy UUID của bạn ở **Authentication → Users** và chạy trên SQL Editor:
   ```sql
   insert into public.admins (user_id) values ('UUID_CUA_BAN');
   ```
4. (Khuyến nghị) Bật tự hủy đơn quá hạn: bỏ comment mục 8 trong `schema.sql` (pg_cron) rồi chạy lại phần đó.

## Cấu hình VAHA Market (làm trước khi mở cho cộng đồng)

- **Link thương hiệu**: mở `src/constants/links.ts`, điền `FOUNDER_FACEBOOK_URL`, `GROUP_URL` và `DISCORD_SERVER_URL` (link mời Discord). Ba nút này hiện ở Footer và khung "Quy định giao dịch an toàn".
- **Tài khoản nhận tiền Escrow** nằm ở `src/constants/payment.ts` (BIDV + số VA, vd `96247VAHA`). Số tài khoản nhận cả **chữ cái và chữ số** (`/^[A-Z0-9]{6,25}$/i`). Nếu dữ liệu QR sai, trang đơn hàng vẫn hiển thị thông tin chuyển khoản thủ công thay vì trắng trang.
- **Phí sàn toàn hệ thống**: đổi ở **Admin → khung "Cấu hình phí sàn toàn hệ thống"** (0% ưu đãi ra mắt, 2%, 3%, 5% hoặc nhập 0–5%). Chỉ áp dụng cho đơn mới. Khi phí < 5%, tin do người mua chịu phí tự hiện giá 5% gạch ngang + nhãn "Ưu đãi phí sàn".
- **Giá trọn gói**: người mua luôn thấy tổng số tiền thực chuyển khoản (đã gồm phần phí họ chịu) ở trang chủ, trang chi tiết và đơn hàng; `create_order` từ chối nếu giá đã đổi so với màn hình để QR luôn khớp từng đồng.
- **Chấm đỏ đơn hàng**: Navbar và 2 tab Đơn mua/Đơn bán hiện số đơn cần xử lý (mua: chờ chuyển khoản còn hạn hoặc đang giao; bán: khách đã thanh toán chờ gửi hàng).
- **Phí trung gian**: mặc định 5% giá niêm yết. Người bán chọn khi đăng tin: *Người bán chịu* (mặc định) / *Người mua chịu* / *Chia đôi*. Người bán có huy hiệu **Mod** được miễn phí (0%). Gắn/gỡ Mod ở **Admin → Mod**.
- **Giảm giá**: chỉ Admin đặt `original_price` (Admin → Tin đăng & giá); người bán không tự nhập được, và nếu họ đổi giá bán thì giá ưu đãi do Admin đặt tự gỡ.
- Mã thanh toán vẫn bắt đầu bằng `CNTH` (không đổi để không ảnh hưởng webhook/đơn cũ).

## Kiểm duyệt chống lừa đảo (Migration 007)

- **Định danh người bán bắt buộc**: người dùng phải có đủ **Số điện thoại**, **Link Facebook cá nhân** (`profiles.facebook_url`) và **ít nhất 1 tài khoản ngân hàng nhận tiền** mới mở được form đăng tin (kiểm tra ở cả UI lẫn trigger DB `listings_review_guard`). Tên chủ tài khoản ngân hàng phải là tên chính chủ, khớp với tên trên trang cá nhân Facebook của bạn để được giải ngân.
- **Tiền kiểm bài đăng & ảnh xác thực chính chủ**:
  - Tin đăng mới bắt buộc có **ảnh xác thực** (`verification_image_url`): chụp sản phẩm đặt cạnh mảnh giấy viết tay ghi `VAHA + Ngày tháng + Tên Facebook`.
  - Tin của thành viên thường mặc định vào trạng thái `pending_review` (ẩn khỏi trang chủ). Admin duyệt tại **Admin → Duyệt tin** (chấp nhận sang `active`, hoặc từ chối kèm lý do để người bán sửa và gửi lại). Tin của **Mod/Admin** được đăng thẳng `active`.
  - Tin đã duyệt chỉ ẩn/hiện lại hoặc sửa giá thì không cần duyệt lại; nếu sửa tiêu đề, mô tả, ảnh sản phẩm, ảnh xác thực hoặc tài khoản nhận tiền, tin tự quay về `pending_review`.
- **Bộ lọc chống dẫn dụ ngoài sàn**: chặn số điện thoại (9–11 chữ số liền hoặc có phân cách) và các từ khóa lách luật (`zalo`, `ck trực tiếp`, `bank trực tiếp`, `không qua sàn`...) trong tiêu đề và mô tả. Chạy đồng thời ở frontend (`src/lib/moderation.ts`) và trigger DB (`trg_listings_moderation`).
- **Khóa thông tin định danh**: khi người bán đang có tin ở trạng thái `pending_review` / `active` / `reserved` hoặc đơn bán đang xử lý, hệ thống tự khóa không cho đổi `profiles.facebook_url` đã lưu và thông tin tài khoản ngân hàng (`bank_bin`, `bank_code`, `account_number`, `account_name`). Nếu người bán gõ nhầm hợp lệ và cần sửa, Admin cập nhật trực tiếp qua **SQL Editor** (role hệ thống bỏ qua trigger khóa).
- **Siết quy trình gửi hàng & mở hộp**: người bán bắt buộc chọn đơn vị vận chuyển (GHTK, GHN, Viettel Post, J&T, SPX, Khác), nhập mã vận đơn và dán link video test/đóng gói. Khi đơn ở trạng thái `SHIPPED`, người mua nhận cảnh báo bắt buộc quay video mở hộp liền mạch 6 mặt để làm căn cứ giải quyết khiếu nại.

## Bản cập nhật v1.9.2 — Đại tu giao diện (UI Overhaul) & Cam kết người bán

- **Giao diện tối giản, thực dụng**: Bỏ Hero Banner trang chủ, mở thẳng vào Compact Trust Strip 1 dòng + thanh tìm kiếm/lọc ngang hàng + thẻ sản phẩm 4 tầng (`aspect-[4/3]`, `tabular-nums`, viền `1px` sắc nét, không emoji/shadow nặng/icon pastel).
- **Blocking Gate cam kết người bán (`SellerTermsModal.tsx`)**: Bắt buộc xác nhận 4 nguyên tắc chống lừa đảo (lưu theo phiên trong `sessionStorage`) khi bấm **Đăng bán** hoặc truy cập `/sell` / `/create-listing`.
- **Chi tiết sản phẩm & Layout**: Bố cục 2 cột `60%/40%` có tab xem riêng **Ảnh xác thực viết tay chính chủ**, khung đặt mua sticky, Navbar phẳng `h-14` kèm tag `ESCROW`, và Footer 3 cột tối giản.

## Bản cập nhật v1.9.1 — Trần phí sàn tối đa 500.000₫ (Migration 010)

- **Trần phí giao dịch (`PLATFORM_FEE_CAP = 500_000`)**: Lưu trong `platform_settings.fee_cap_vnd` (mặc định `500000`, nhập `0` để tắt trần). Admin chỉnh trực tiếp trong **Admin → Cấu hình phí sàn & Trần phí tối đa** (`FeeSettingsCard.tsx`).
- **Đồng bộ 100% Frontend ↔ Database**: Hàm `calcFees` (`src/lib/money.ts`) và RPC `create_order` (`010_platform_fee_cap.sql`) đều áp trần `LEAST(ROUND(list_price * bp / 10000.0), fee_cap_vnd)` **trước khi** chia `buyer_fee` / `seller_fee` theo `fee_payer` (`SELLER` / `BUYER` / `SPLIT`).
- **Hiển thị minh bạch số tiền tiết kiệm**: Badge xanh ngọc ở form đăng tin (`CreateListing.tsx`), ghi chú trong `PriceBreakdown.tsx` / `ListingDetail.tsx` / `OrderDetail.tsx`, cùng dòng chúc mừng trong pop-up (`NotificationContext.tsx`) và email tự động (`send-order-email`).

## Bản cập nhật v1.9.0 — Cảnh báo 3 lần tự động Ban & Device Fingerprinting (Migration 009)

- **Hệ thống Cảnh báo 3 lần (3-Strike Auto-Ban)**: Admin có thể gửi cảnh báo (+1 gậy) cho thành viên ngay trong **Admin → Duyệt tin**, **Admin → Khiếu nại**, hoặc **Admin → Cảnh báo & Ban**. Khi `profiles.warning_count >= 3`, DB tự động khóa vĩnh viễn tài khoản, chuyển toàn bộ tin đang mở sang `rejected` và đưa toàn bộ dấu vết định danh vào `banned_entities`.
- **Device Fingerprinting & Blacklist chống lách luật**: Sử dụng `@fingerprintjs/fingerprintjs` (có cache `localStorage` và fallback hash) để ghi nhận `visitor_id` qua RPC `register_device_and_check_ban` / `check_device_banned`. Nếu phát hiện tạo tài khoản Google mới từ thiết bị đã bị cấm, hệ thống tự động khóa tài khoản mới ngay lập tức. Các trigger DB chặn lưu lại Facebook, SĐT hoặc tài khoản ngân hàng trùng danh sách đen.
- **Màn hình khóa (`BannedScreen.tsx`)**: Khóa toàn bộ thao tác đăng tin, đặt mua, cài đặt khi tài khoản/thiết bị bị chặn (chỉ cho xem `/terms` và đăng xuất).
- *(Lưu ý: nhớ chạy `npm install` để cài thêm gói `@fingerprintjs/fingerprintjs` trước khi `npm run build`.)*

## Bản cập nhật v8 — Điều khoản, Dark Mode & Hệ thống Thông báo

- **Trang Điều khoản dịch vụ (`/terms`)**: công bố rõ vai trò trung gian Escrow & miễn trừ trách nhiệm của Admin, kèm khung cảnh báo đỏ về cam kết phối hợp Cơ quan Cảnh sát điều tra (Công an) và trích dẫn **Điều 174 & Điều 175 Bộ luật Hình sự 2015 (sửa đổi, bổ sung 2017)**. Link `/terms` nằm ở Footer, khối `TrustBadge`, trang đăng tin và khung đặt mua.
- **Dark Mode toàn diện (Light / Dark / System)**: cấu hình `darkMode: 'class'` trong `tailwind.config.js`, lưu lựa chọn vào `localStorage` (`vaha-theme`), có inline script trong `index.html` chống chớp trắng khi tải trang, nút chuyển nhanh trên Navbar, và luôn giữ khung nền trắng (`bg-white p-3`) cho mã VietQR để camera quét nhạy 100%.
- **Pop-up thông báo trình duyệt (Toast + Desktop Notification)**: `NotificationContext.tsx` lắng nghe Realtime bảng `orders` và `listings`, hiển thị thẻ Toast nổi góc dưới bên phải (tự đóng sau 8 giây, có nút mở thẳng đơn hàng/tin đăng) và hỗ trợ bật/tắt thông báo đẩy trình duyệt (icon Chuông trên Navbar, dùng Web Notification API).
- **Email tự động qua Gmail SMTP**: Edge Function `send-order-email` + Migration `008_email_notifications.sql` (`pg_net` trigger) gửi email tự động cho 5 sự kiện (`ORDER_PAID`, `ORDER_SHIPPED`, `ORDER_COMPLETED`, `PAYOUT_DONE`, `LISTING_REVIEWED`).

## Link Preview (Open Graph)

- Ảnh preview 1200×630 nằm ở `public/og-preview.png`, thẻ meta nằm trong `index.html` (og:image dùng URL tuyệt đối `https://vahamarket.vercel.app/og-preview.png`).
- Muốn sửa nội dung ảnh: chỉnh `scripts/generate-og-preview.py` rồi chạy `python3 scripts/generate-og-preview.py` (cần `pip install pillow` và font Inter).
- Sau khi deploy, Facebook/Zalo/Discord **lưu cache** preview cũ: dán link vào [Sharing Debugger](https://developers.facebook.com/tools/debug/) và bấm **Scrape Again** để Facebook/Messenger lấy ảnh mới. Discord cache vài giờ; thêm `?v=2` sau link nếu cần xem ngay.

## Bước 1 — Chạy thử trên máy

Cần Node.js 18+. Trong thư mục dự án:

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# điền VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (sb_publishable_...),
# VITE_CLOUDINARY_CLOUD_NAME, VITE_CLOUDINARY_UPLOAD_PRESET, VITE_ESCROW_ACCOUNT_NAME
npm run dev               # mở http://localhost:5173
```

Thêm `http://localhost:5173` vào **Authentication → URL Configuration → Redirect URLs**.
Sửa `.env` xong phải tắt và chạy lại `npm run dev`.

---

## Bước 2 — Deploy Edge Function `sepay-webhook`

Function nhận biến động số dư từ SePay và đặt đơn sang `PAID_HELD` (qua hàm SQL `process_bank_transaction`).

1. Tạo chuỗi bí mật ngẫu nhiên cho webhook (dài ≥ 32 ký tự), ví dụ: `openssl rand -hex 24`. Lưu lại — gọi là `SEPAY_WEBHOOK_KEY`.
2. Lấy **secret key** `sb_secret_...` ở Dashboard → Project Settings → API Keys. **Chỉ dùng ở bước này, không đưa vào `.env` hay Vercel.**
3. Trong thư mục dự án:
   ```bash
   npx supabase login
   npx supabase init                          # chỉ lần đầu; tạo supabase/config.toml, không xóa file có sẵn
   npx supabase link --project-ref <PROJECT_REF>   # PROJECT_REF nằm trong URL: https://<PROJECT_REF>.supabase.co
   npx supabase secrets set SB_SECRET_KEY=sb_secret_xxx SEPAY_WEBHOOK_KEY=chuoi_bi_mat_cua_ban
   npm run functions:deploy                   # = supabase functions deploy sepay-webhook --no-verify-jwt
   ```
   `--no-verify-jwt` là bắt buộc vì SePay không gửi JWT của Supabase; function tự xác thực bằng `SEPAY_WEBHOOK_KEY`.
4. URL webhook của bạn: `https://<PROJECT_REF>.supabase.co/functions/v1/sepay-webhook`
5. Thử nhanh (thay giá trị), phải trả về `{"success":true,...}`:
   ```bash
   curl -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/sepay-webhook" \
     -H "Authorization: Apikey chuoi_bi_mat_cua_ban" -H "Content-Type: application/json" \
     -d '{"id":1,"transferType":"in","transferAmount":10000,"content":"test khong ma","accountNumber":"96247VAHA"}'
   ```
   Kết quả đúng: `"result":"UNMATCHED"` và có 1 dòng mới trong bảng `transactions` (xóa dòng thử sau khi kiểm tra).
   Gọi sai key sẽ nhận `401`. Xem log: Dashboard → Edge Functions → sepay-webhook → Logs.

## Bước 2.5 — Bật `pg_net` & Deploy Edge Function `send-order-email` (Gmail SMTP)

1. Tạo **App Password** cho Gmail: Google Account → Security → bật 2-Step Verification → tạo *App password* (16 ký tự).
2. Trên Supabase Dashboard → **Database → Extensions**: bật **`pg_net`** (hoặc chạy `supabase/migrations/008_email_notifications.sql` trong SQL Editor, file này đã kèm `create extension if not exists pg_net`).
3. Đặt secrets và deploy Edge Function `send-order-email`:
   ```bash
   npx supabase secrets set \
     GMAIL_USER="your_email@gmail.com" \
     GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" \
     SITE_URL="https://vahamarket.vercel.app"
   npm run functions:deploy:email    # = supabase functions deploy send-order-email --no-verify-jwt
   ```
4. Cấu hình URL & `SB_SECRET_KEY` cho Database Trigger (chạy 1 lần trong **Supabase SQL Editor**, thay `<PROJECT_REF>` và `sb_secret_xxx`):
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
   *(Bảng `internal_email_config` đã bật RLS và thu hồi toàn bộ quyền đọc từ `anon`/`authenticated`; nếu chưa cấu hình hoặc mạng lỗi, trigger tự bỏ qua an toàn mà không ảnh hưởng đơn hàng.)*

## Bước 3 — Gắn webhook với SePay.vn

(Tên mục trên SePay có thể khác đôi chút theo phiên bản giao diện.)

1. Đăng nhập [sepay.vn](https://sepay.vn), liên kết tài khoản **BIDV** (và tài khoản ảo VA) nhận tiền của sàn (đúng STK trong `src/constants/payment.ts`).
2. Vào **Tích hợp Webhooks → Thêm webhooks** và điền:
   - **Gọi đến URL**: URL ở Bước 2.4
   - **Sự kiện**: *Có tiền vào*
   - **Tài khoản ngân hàng**: tài khoản BIDV ở trên
   - **Kiểu chứng thực**: *API Key* → nhập đúng `SEPAY_WEBHOOK_KEY`
   - **Content-Type**: `application/json`
   - Không bật "Bỏ qua nếu không có code thanh toán" (hệ thống tự tìm mã `CNTH…` trong nội dung chuyển khoản).
3. Kiểm thử thật: tạo 1 đơn trên web → quét QR chuyển **đúng số tiền** → trang đơn hàng tự chuyển sang "Đã thanh toán" trong vài giây.
   Nếu không đổi trạng thái: xem **Logs của SePay** (có gọi tới không, mã trả về), rồi **Logs Edge Function**, rồi bảng `transactions` (cột `match_status`).
4. Mọi giao dịch lệch (thiếu/thừa/muộn/không khớp) hiện ở **Admin → Giao dịch lệch**.

---

## Bước 4 — Deploy Frontend lên Vercel

1. Đẩy mã lên GitHub (file `.env` đã nằm trong `.gitignore`, đừng commit).
2. [vercel.com](https://vercel.com) → **Add New → Project** → chọn repo. Vercel tự nhận Vite; file `vercel.json` đã cấu hình build `npm run build`, thư mục `dist` và rewrite về `index.html` (cần cho các đường dẫn như `/orders/...`).
3. **Environment Variables** (Production): thêm đủ
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_CLOUDINARY_UPLOAD_PRESET`, `VITE_ESCROW_ACCOUNT_NAME`.
   **Tuyệt đối không** thêm `sb_secret_...` vì mọi biến `VITE_*` đều lộ ra trình duyệt.
4. Bấm **Deploy**. Sau khi có domain (vd `https://vahamarket.vercel.app`):
   - Supabase → **Authentication → URL Configuration**: đặt **Site URL** = domain Vercel và thêm `https://<domain>/**` vào **Redirect URLs** (giữ cả `http://localhost:5173`).
   - Nếu đổi biến môi trường sau này, phải **Redeploy** vì biến được nhúng lúc build.

## Kiểm tra toàn bộ trước khi mở cho cộng đồng

- [ ] Đăng nhập Google trên domain thật, kiểm tra tài khoản thiếu SĐT/Facebook/ngân hàng bị chặn mở form đăng tin
- [ ] Hoàn tất hồ sơ người bán, đăng tin kèm ảnh xác thực giấy viết tay → tin vào `pending_review` (ẩn khỏi trang chủ) → Admin duyệt ở **Admin → Duyệt tin** → tin lên `active`
- [ ] Thử từ chối 1 tin kèm lý do → người bán thấy lý do ở **Tin của tôi**, sửa và gửi duyệt lại; thử sửa mô tả tin đã duyệt → tin quay về `pending_review`
- [ ] Thử đăng tin chứa SĐT hoặc từ khóa `"zalo"` / `"ck trực tiếp"` → bị chặn ngay ở form (và chặn ở DB)
- [ ] Khi đang có tin `pending_review` / `active`, vào **Cài đặt tài khoản** → ô Facebook bị khóa, cảnh báo ngân hàng hiển thị rõ
- [ ] Tài khoản thứ 2 đặt mua → quét QR → đơn tự sang `PAID_HELD`
- [ ] Người bán nhập đơn vị vận chuyển + mã vận đơn + link video → người mua thấy cảnh báo quay video unbox 6 mặt → xác nhận nhận hàng → Admin thấy đơn trong **Giải ngân** → quét QR chuyển tiền → bấm "Xác nhận đã chuyển tiền"
- [ ] Thử 1 khiếu nại và xử lý ở **Admin → Khiếu nại**
- [ ] Đăng 3 tin thử với 3 cách chia phí, đặt mua và kiểm tra số tiền chuyển khoản khớp bảng giá
- [ ] Đổi phí sàn về 0% rồi đặt mua 1 tin "người mua chịu phí": số tiền ở trang chủ = trang chi tiết = mã QR
- [ ] Đơn chờ thanh toán / chờ gửi hàng làm hiện chấm đỏ ở Navbar và tab tương ứng
- [ ] Gắn Mod cho 1 người bán → đơn mới của họ không tính phí và đăng tin vào thẳng `active`; đặt giá gốc cho 1 tin → thấy giá gạch ngang
- [ ] Đơn không thanh toán sau 15 phút tự hết hạn và tin được mở bán lại
- [ ] `sb_secret_...` chỉ nằm trong Supabase secrets (không có trong `.env`, GitHub hay Vercel)

## Lưu ý vận hành

- **Hoàn tiền / giải ngân là chuyển khoản thủ công** bằng app ngân hàng của sàn; hệ thống chỉ ghi nhận trạng thái và nhật ký (`admin_audit_log`).
- Khi quyết định *Hoàn tiền cho người mua*, tin của người bán chuyển sang "ẩn" để họ tự mở bán lại sau khi nhận lại hàng.
- Gói Free của Supabase tạm dừng project sau thời gian dài không hoạt động; hãy kiểm tra trước khi cộng đồng dùng.
- Ảnh tải lên Cloudinary bằng preset unsigned nên không xóa được từ trình duyệt; ảnh bỏ dở sẽ nằm lại trên Cloudinary.
