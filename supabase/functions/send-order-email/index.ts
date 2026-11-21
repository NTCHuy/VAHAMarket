// Edge Function gửi email thông báo đơn hàng & duyệt tin qua Gmail SMTP (nodemailer).
// Deploy: supabase functions deploy send-order-email --no-verify-jwt
// (Được gọi nội bộ từ Database Trigger thông qua pg_net, xác thực bằng SB_SECRET_KEY.)
//
// Secrets cần đặt (KHÔNG commit):
//   npx supabase secrets set GMAIL_USER="your_email@gmail.com" GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" SITE_URL="https://vahamarket.vercel.app"
//   (SB_SECRET_KEY đã được đặt từ bước deploy sepay-webhook)
import nodemailer from 'npm:nodemailer@6';

const SECRET_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? '';
const GMAIL_APP_PASSWORD = (Deno.env.get('GMAIL_APP_PASSWORD') ?? '').replace(/\s+/g, '');
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://vahamarket.vercel.app').replace(/\/+$/, '');

type EmailEvent =
  | 'ORDER_PAID'
  | 'ORDER_SHIPPED'
  | 'ORDER_COMPLETED'
  | 'PAYOUT_DONE'
  | 'LISTING_REVIEWED';

interface EmailPayload {
  event: EmailEvent;
  to: string;
  recipientName?: string;
  orderId?: string;
  paymentCode?: string;
  listingId?: string;
  listingTitle?: string;
  amount?: number;
  sellerPayout?: number;
  carrier?: string;
  trackingCode?: string;
  packingVideoUrl?: string;
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  reference?: string;
  reviewStatus?: 'active' | 'rejected';
  rejectionReason?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function safeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatVnd(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
}

function renderLayout(opts: {
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  heading: string;
  greeting: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}): string {
  return `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="background-color:#1d3bc5;padding:18px 24px;color:#ffffff;">
                <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;">VAHA Market</div>
                <div style="font-size:12px;color:#dbe6fe;margin-top:2px;">Sàn giao dịch trung gian bảo lãnh cộng đồng âm thanh Việt Nam</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:600;background-color:${opts.badgeBg};color:${opts.badgeColor};">
                  ${escapeHtml(opts.badgeText)}
                </span>
                <h1 style="margin:12px 0 8px;font-size:20px;line-height:1.35;color:#0f172a;">${escapeHtml(opts.heading)}</h1>
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(opts.greeting)}</p>
                <div style="font-size:14px;line-height:1.6;color:#334155;">${opts.bodyHtml}</div>
                <div style="margin-top:22px;">
                  <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background-color:#1d3bc5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px;">
                    ${escapeHtml(opts.ctaLabel)}
                  </a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e2e8f0;padding:16px 24px;background-color:#f8fafc;font-size:12px;line-height:1.5;color:#64748b;">
                Email tự động từ <strong>VAHA Market</strong>. Mọi giao dịch đều được bảo vệ theo
                <a href="${escapeHtml(SITE_URL)}/terms" style="color:#1d3bc5;text-decoration:underline;">Điều khoản dịch vụ</a>.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildEmail(payload: EmailPayload): { subject: string; html: string } {
  const name = payload.recipientName?.trim() || 'bạn';
  const title = escapeHtml(payload.listingTitle?.trim() || 'Sản phẩm');
  const code = escapeHtml(payload.paymentCode?.trim() || '');
  const orderUrl = payload.orderId ? `${SITE_URL}/orders/${payload.orderId}` : `${SITE_URL}/orders`;

  switch (payload.event) {
    case 'ORDER_PAID':
      return {
        subject: `[VAHA Market] Bạn có đơn hàng mới đã thanh toán! (${payload.paymentCode ?? ''})`.trim(),
        html: renderLayout({
          badgeText: 'Đã thanh toán · Chờ gửi hàng',
          badgeBg: '#eff4ff',
          badgeColor: '#1e3a9f',
          heading: 'Bạn có đơn hàng mới đã thanh toán!',
          greeting: `Xin chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Người mua đã chuyển khoản thành công cho sản phẩm <strong>${title}</strong>${code ? ` (Mã đơn: <strong>${code}</strong>)` : ''}.</p>
            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
              <div><strong>Số tiền sàn đang giữ:</strong> ${formatVnd(payload.amount)}</div>
              <div style="margin-top:4px;"><strong>Thực nhận dự kiến sau khi hoàn tất:</strong> <span style="color:#047857;font-weight:700;">${formatVnd(payload.sellerPayout)}</span></div>
            </div>
            <div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;color:#78350f;font-size:13px;">
              <strong>Lưu ý quan trọng trước khi gửi hàng:</strong> Vui lòng quay <strong>video test chức năng &amp; đóng gói liền mạch 6 mặt</strong> gói hàng, sau đó cập nhật đơn vị vận chuyển, mã vận đơn và link video lên VAHA Market.
            </div>
          `,
          ctaLabel: 'Mở chi tiết đơn hàng',
          ctaUrl: orderUrl,
        }),
      };

    case 'ORDER_SHIPPED': {
      const carrier = escapeHtml(payload.carrier?.trim() || 'Chưa cập nhật');
      const tracking = escapeHtml(payload.trackingCode?.trim() || 'Chưa cập nhật');
      const videoLink = payload.packingVideoUrl?.trim()
        ? `<div style="margin-top:6px;"><strong>Video test &amp; đóng gói của người bán:</strong> <a href="${escapeHtml(payload.packingVideoUrl.trim())}" style="color:#1d3bc5;">Xem video</a></div>`
        : '';
      return {
        subject: `[VAHA Market] Đơn hàng của bạn đang được giao! (${payload.paymentCode ?? ''})`.trim(),
        html: renderLayout({
          badgeText: 'Đang giao hàng',
          badgeBg: '#f0f9ff',
          badgeColor: '#0369a1',
          heading: 'Đơn hàng của bạn đang được giao!',
          greeting: `Xin chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Người bán đã gửi đi sản phẩm <strong>${title}</strong>${code ? ` (Mã đơn: <strong>${code}</strong>)` : ''}.</p>
            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
              <div><strong>Đơn vị vận chuyển:</strong> ${carrier}</div>
              <div style="margin-top:4px;"><strong>Mã vận đơn:</strong> <code style="font-weight:700;">${tracking}</code></div>
              ${videoLink}
            </div>
            <div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;color:#78350f;font-size:13px;">
              <strong>Bắt buộc khi nhận hàng:</strong> Hãy quay <strong>video mở hộp liền mạch 6 mặt</strong> từ lúc bưu kiện còn nguyên vẹn chưa cắt băng dính. Đây là căn cứ bắt buộc để VAHA Market giải quyết khiếu nại nếu có sự cố.
            </div>
          `,
          ctaLabel: 'Theo dõi & xác nhận đơn hàng',
          ctaUrl: orderUrl,
        }),
      };
    }

    case 'ORDER_COMPLETED':
      return {
        subject: `[VAHA Market] Người mua đã xác nhận nhận hàng! (${payload.paymentCode ?? ''})`.trim(),
        html: renderLayout({
          badgeText: 'Đã nhận hàng · Chờ giải ngân',
          badgeBg: '#ecfdf5',
          badgeColor: '#047857',
          heading: 'Người mua đã xác nhận nhận hàng!',
          greeting: `Xin chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Đơn hàng <strong>${title}</strong>${code ? ` (Mã đơn: <strong>${code}</strong>)` : ''} đã được người mua xác nhận nhận hàng ổn định.</p>
            <div style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:12px 14px;color:#065f46;">
              <strong>Số tiền thực nhận:</strong> <span style="font-size:16px;font-weight:700;">${formatVnd(payload.sellerPayout)}</span><br/>
              <span style="font-size:13px;">Yêu cầu giải ngân đã được mở khóa. Admin VAHA Market sẽ chuyển khoản vào tài khoản ngân hàng bạn đã đăng ký trong thời gian sớm nhất.</span>
            </div>
          `,
          ctaLabel: 'Xem trạng thái giải ngân',
          ctaUrl: orderUrl,
        }),
      };

    case 'PAYOUT_DONE': {
      const bank = escapeHtml(payload.bankName?.trim() || 'Ngân hàng đã đăng ký');
      const accNo = escapeHtml(payload.accountNumber?.trim() || '');
      const accName = escapeHtml(payload.accountName?.trim() || '');
      const refHtml = payload.reference?.trim()
        ? `<div style="margin-top:4px;"><strong>Mã tham chiếu:</strong> ${escapeHtml(payload.reference.trim())}</div>`
        : '';
      return {
        subject: `[VAHA Market] Đã giải ngân thành công ${formatVnd(payload.amount)}! (${payload.paymentCode ?? ''})`.trim(),
        html: renderLayout({
          badgeText: 'Giải ngân thành công',
          badgeBg: '#ecfdf5',
          badgeColor: '#047857',
          heading: 'VAHA Market đã giải ngân thành công!',
          greeting: `Xin chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Khoản tiền bán sản phẩm <strong>${title}</strong>${code ? ` (Mã đơn: <strong>${code}</strong>)` : ''} đã được Admin chuyển khoản thành công.</p>
            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
              <div><strong>Số tiền đã chuyển:</strong> <span style="color:#047857;font-weight:700;">${formatVnd(payload.amount)}</span></div>
              <div style="margin-top:4px;"><strong>Ngân hàng nhận:</strong> ${bank}</div>
              ${accNo ? `<div style="margin-top:4px;"><strong>Số tài khoản:</strong> <code>${accNo}</code></div>` : ''}
              ${accName ? `<div style="margin-top:4px;"><strong>Chủ tài khoản:</strong> ${accName}</div>` : ''}
              ${refHtml}
            </div>
          `,
          ctaLabel: 'Xem chi tiết đơn hàng',
          ctaUrl: orderUrl,
        }),
      };
    }

    case 'LISTING_REVIEWED': {
      const approved = payload.reviewStatus === 'active';
      const listingUrl = approved && payload.listingId ? `${SITE_URL}/listing/${payload.listingId}` : `${SITE_URL}/my-listings`;
      const reason = escapeHtml(payload.rejectionReason?.trim() || 'Vui lòng kiểm tra lại ảnh xác thực chính chủ và nội dung tin đăng.');
      return {
        subject: approved
          ? `[VAHA Market] Tin đăng "${payload.listingTitle ?? ''}" đã được duyệt lên sàn!`
          : `[VAHA Market] Tin đăng "${payload.listingTitle ?? ''}" cần chỉnh sửa lại`,
        html: renderLayout({
          badgeText: approved ? 'Đã duyệt lên sàn' : 'Bị từ chối duyệt',
          badgeBg: approved ? '#ecfdf5' : '#fef2f2',
          badgeColor: approved ? '#047857' : '#b91c1c',
          heading: approved ? 'Tin đăng của bạn đã được duyệt!' : 'Tin đăng của bạn chưa được duyệt',
          greeting: `Xin chào ${name},`,
          bodyHtml: approved
            ? `<p style="margin:0;">Tin đăng <strong>${title}</strong> đã vượt qua bước kiểm duyệt chính chủ và hiện đang hiển thị công khai trên VAHA Market.</p>`
            : `
              <p style="margin:0 0 12px;">Tin đăng <strong>${title}</strong> chưa đạt yêu cầu kiểm duyệt.</p>
              <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:12px 14px;color:#991b1b;">
                <strong>Lý do từ Admin:</strong> ${reason}
              </div>
              <p style="margin:12px 0 0;font-size:13px;">Bạn có thể bấm nút bên dưới để chỉnh sửa và gửi duyệt lại ngay.</p>
            `,
          ctaLabel: approved ? 'Xem tin đăng trên sàn' : 'Sửa & gửi duyệt lại',
          ctaUrl: listingUrl,
        }),
      };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  const auth = req.headers.get('authorization') ?? '';
  const bearer = auth.replace(/^Bearer\s+/i, '').trim();
  const headerSecret = req.headers.get('x-internal-secret')?.trim() ?? '';
  if (!SECRET_KEY || (!safeEqual(bearer, SECRET_KEY) && !safeEqual(headerSecret, SECRET_KEY))) {
    return json({ success: false, message: 'Unauthorized' }, 401);
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('[send-order-email] Missing GMAIL_USER or GMAIL_APP_PASSWORD');
    return json({ success: false, message: 'SMTP not configured' }, 500);
  }

  let payload: EmailPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, message: 'Invalid JSON' }, 400);
  }

  if (!payload.event || !payload.to || !payload.to.includes('@')) {
    return json({ success: false, message: 'Missing event or recipient email' }, 400);
  }

  const { subject, html } = buildEmail(payload);

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: `"VAHA Market" <${GMAIL_USER}>`,
      to: payload.to,
      subject,
      html,
    });

    return json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('[send-order-email] SMTP error:', err);
    return json({ success: false, message: err instanceof Error ? err.message : 'SMTP send failed' }, 500);
  }
});
