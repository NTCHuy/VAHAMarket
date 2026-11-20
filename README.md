# VAHA Market

*Vietnamese Association of Headphone Addicts Market* — sàn C2C đồ âm thanh second-hand có trung gian giữ tiền (escrow), bảo lãnh bởi Hội người Việt nghiện tai nghe.
React + Vite + TypeScript + Tailwind · Supabase (Auth, Postgres/RLS, Realtime, Edge Functions) · Cloudinary · VietQR + SePay.

> **Không mở `index.html` bằng cách bấm đúp.** Đây là dự án Vite, phải chạy bằng lệnh (xem Bước 1).

---

## Bước 0 — Chuẩn bị Supabase (làm 1 lần)

1. Supabase Dashboard → **SQL Editor** → chạy lần lượt, mỗi file 1 lần:
   `supabase/schema.sql` → `supabase/migrations/002_ui_fields.sql` → `003_order_dispute_fields.sql` → `004_admin_actions.sql` → `005_vaha_rebrand_and_fees.sql` → `006_platform_settings_and_ux.sql`
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
     -d '{"id":1,"transferType":"in","transferAmount":10000,"content":"test khong ma","accountNumber":"9936916346"}'
   ```
   Kết quả đúng: `"result":"UNMATCHED"` và có 1 dòng mới trong bảng `transactions` (xóa dòng thử sau khi kiểm tra).
   Gọi sai key sẽ nhận `401`. Xem log: Dashboard → Edge Functions → sepay-webhook → Logs.

## Bước 3 — Gắn webhook với SePay.vn

(Tên mục trên SePay có thể khác đôi chút theo phiên bản giao diện.)

1. Đăng nhập [sepay.vn](https://sepay.vn), liên kết tài khoản **Vietcombank** nhận tiền của sàn (đúng STK trong `src/constants/payment.ts`).
2. Vào **Tích hợp Webhooks → Thêm webhooks** và điền:
   - **Gọi đến URL**: URL ở Bước 2.4
   - **Sự kiện**: *Có tiền vào*
   - **Tài khoản ngân hàng**: tài khoản Vietcombank ở trên
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

- [ ] Đăng nhập Google trên domain thật, lưu tài khoản ngân hàng, đăng 1 tin có ảnh
- [ ] Tài khoản thứ 2 đặt mua → quét QR → đơn tự sang `PAID_HELD`
- [ ] Người bán nhập vận đơn + link video → người mua xác nhận → Admin thấy đơn trong **Giải ngân** → quét QR chuyển tiền → bấm "Xác nhận đã chuyển tiền"
- [ ] Thử 1 khiếu nại và xử lý ở **Admin → Khiếu nại**
- [ ] Đăng 3 tin thử với 3 cách chia phí, đặt mua và kiểm tra số tiền chuyển khoản khớp bảng giá
- [ ] Đổi phí sàn về 0% rồi đặt mua 1 tin "người mua chịu phí": số tiền ở trang chủ = trang chi tiết = mã QR
- [ ] Đơn chờ thanh toán / chờ gửi hàng làm hiện chấm đỏ ở Navbar và tab tương ứng
- [ ] Gắn Mod cho 1 người bán → đơn mới của họ không tính phí; đặt giá gốc cho 1 tin → thấy giá gạch ngang
- [ ] Đơn không thanh toán sau 15 phút tự hết hạn và tin được mở bán lại
- [ ] `sb_secret_...` chỉ nằm trong Supabase secrets (không có trong `.env`, GitHub hay Vercel)

## Lưu ý vận hành

- **Hoàn tiền / giải ngân là chuyển khoản thủ công** bằng app ngân hàng của sàn; hệ thống chỉ ghi nhận trạng thái và nhật ký (`admin_audit_log`).
- Khi quyết định *Hoàn tiền cho người mua*, tin của người bán chuyển sang "ẩn" để họ tự mở bán lại sau khi nhận lại hàng.
- Gói Free của Supabase tạm dừng project sau thời gian dài không hoạt động; hãy kiểm tra trước khi cộng đồng dùng.
- Ảnh tải lên Cloudinary bằng preset unsigned nên không xóa được từ trình duyệt; ảnh bỏ dở sẽ nằm lại trên Cloudinary.
