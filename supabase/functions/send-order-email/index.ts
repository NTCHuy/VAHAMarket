// Edge Function gửi email thông báo đơn hàng & duyệt tin qua Gmail SMTP (nodemailer).
// Deploy: supabase functions deploy send-order-email --no-verify-jwt
// (Được gọi nội bộ từ Database Trigger thông qua pg_net, xác thực bằng SB_SECRET_KEY.)
//
// Secrets cần đặt (KHÔNG commit):
//   npx supabase secrets set GMAIL_USER="vahamarket.vn@gmail.com" GMAIL_APP_PASSWORD="xxxx xxxx xxxx xxxx" SITE_URL="https://vahamarket.vercel.app"
//   (SB_SECRET_KEY đã được đặt từ bước deploy sepay-webhook)
import nodemailer from 'npm:nodemailer@6';

const SECRET_KEY = Deno.env.get('SB_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const GMAIL_USER = Deno.env.get('GMAIL_USER') ?? '';
const GMAIL_APP_PASSWORD = (Deno.env.get('GMAIL_APP_PASSWORD') ?? '').replace(/\s+/g, '');
const SITE_URL = (Deno.env.get('SITE_URL') ?? 'https://vahamarket.vercel.app').replace(/\/+$/, '');

const EMAIL_FOOTER_REASON = 'Email tự động từ VAHA Market khi có cập nhật đơn hàng hoặc tin đăng.';
const EMAIL_RE = /^[^\s@,;<>()[\]\\]+@[^\s@,;<>()[\]\\]+\.[^\s@,;<>()[\]\\]+$/;
const VALID_EVENTS = new Set<EmailEvent>([
  'ORDER_PAID',
  'ORDER_SHIPPED',
  'ORDER_COMPLETED',
  'PAYOUT_DONE',
  'LISTING_REVIEWED',
  'ORDER_REFUND_REQUESTED',
  'ORDER_REFUND_COMPLETED',
]);

type EmailEvent =
  | 'ORDER_PAID'
  | 'ORDER_SHIPPED'
  | 'ORDER_COMPLETED'
  | 'PAYOUT_DONE'
  | 'LISTING_REVIEWED'
  | 'ORDER_REFUND_REQUESTED'
  | 'ORDER_REFUND_COMPLETED';

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
  cancelReason?: string;
  adminNote?: string;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
    },
  });

async function safeEqual(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
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

function cleanHeaderLine(input: string): string {
  return input.replace(/[\r\n]+/g, ' ').trim();
}

function toSafeHttpUrl(raw?: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.toString();
  } catch {
    // invalid URL
  }
  return null;
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
  <body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f5f5f5;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background-color:#1d4ed8;padding:18px 24px;color:#ffffff;">
                <div style="font-size:18px;font-weight:700;letter-spacing:-0.01em;">VAHA Market</div>
                <div style="font-size:12px;color:#dbeafe;margin-top:2px;">Sàn trung gian âm thanh 0% phí của cộng đồng</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                <span style="display:inline-block;padding:4px 10px;border-radius:6px;font-size:12px;font-weight:600;background-color:${opts.badgeBg};color:${opts.badgeColor};">
                  ${escapeHtml(opts.badgeText)}
                </span>
                <h1 style="margin:12px 0 8px;font-size:20px;line-height:1.35;color:#171717;">${escapeHtml(opts.heading)}</h1>
                <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#404040;">${escapeHtml(opts.greeting)}</p>
                <div style="font-size:14px;line-height:1.6;color:#404040;">${opts.bodyHtml}</div>
                <div style="margin-top:22px;">
                  <a href="${escapeHtml(opts.ctaUrl)}" style="display:inline-block;background-color:#1d4ed8;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:8px;">
                    ${escapeHtml(opts.ctaLabel)}
                  </a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="border-top:1px solid #e5e5e5;padding:16px 24px;background-color:#fafafa;font-size:12px;line-height:1.6;color:#737373;">
                <div>${escapeHtml(EMAIL_FOOTER_REASON)}</div>
                <div style="margin-top:4px;">
                  Xem <a href="${escapeHtml(SITE_URL)}/terms" style="color:#1d4ed8;text-decoration:underline;">Điều khoản sử dụng</a> của <strong>VAHA Market</strong>.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderPlainText(lines: string[], ctaLabel: string, ctaUrl: string): string {
  return [
    ...lines,
    '',
    `${ctaLabel}: ${ctaUrl}`,
    '',
    '---',
    EMAIL_FOOTER_REASON,
    `Điều khoản: ${SITE_URL}/terms`,
  ].join('\n');
}

function buildEmail(payload: EmailPayload): { subject: string; html: string; text: string } {
  const name = payload.recipientName?.trim() || 'bạn';
  const rawTitle = payload.listingTitle?.trim() || 'Sản phẩm';
  const rawCode = payload.paymentCode?.trim() || '';
  const title = escapeHtml(rawTitle);
  const code = escapeHtml(rawCode);
  const orderUrl = payload.orderId ? `${SITE_URL}/orders/${encodeURIComponent(payload.orderId)}` : `${SITE_URL}/orders`;

  switch (payload.event) {
    case 'ORDER_PAID': {
      const ctaLabel = 'Mở đơn hàng';
      return {
        subject: cleanHeaderLine(`[VAHA Market] Đơn hàng mới đã thanh toán (${rawCode})`),
        html: renderLayout({
          badgeText: 'Đã thanh toán · Chờ gửi hàng',
          badgeBg: '#eff6ff',
          badgeColor: '#1d4ed8',
          heading: 'Bạn có đơn hàng mới',
          greeting: `Chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Người mua đã chuyển khoản cho sản phẩm <strong>${title}</strong>${code ? ` (Mã: <strong>${code}</strong>)` : ''}.</p>
            <div style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
              <div><strong>Sàn đang giữ:</strong> ${formatVnd(payload.amount)}</div>
              <div style="margin-top:4px;"><strong>Bạn thực nhận:</strong> <span style="color:#047857;font-weight:700;">${formatVnd(payload.sellerPayout)}</span></div>
            </div>
            <div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;color:#78350f;font-size:13px;">
              <strong>Lưu ý trước khi gửi:</strong> Quay video kiểm tra hoạt động và đóng gói đủ 6 mặt trong 48 giờ, rồi cập nhật mã vận đơn lên sàn.
            </div>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Chào ${name},`,
            `Người mua đã thanh toán sản phẩm "${rawTitle}"${rawCode ? ` (Mã: ${rawCode})` : ''}.`,
            `- Sàn đang giữ: ${formatVnd(payload.amount)}`,
            `- Bạn thực nhận: ${formatVnd(payload.sellerPayout)}`,
            'Lưu ý: Quay video kiểm tra và đóng gói đủ 6 mặt trong 48 giờ, rồi cập nhật mã vận đơn lên sàn.',
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'ORDER_SHIPPED': {
      const rawCarrier = payload.carrier?.trim() || 'Chưa cập nhật';
      const rawTracking = payload.trackingCode?.trim() || 'Chưa cập nhật';
      const safeVideo = toSafeHttpUrl(payload.packingVideoUrl);
      const carrier = escapeHtml(rawCarrier);
      const tracking = escapeHtml(rawTracking);
      const videoLink = safeVideo
        ? `<div style="margin-top:6px;"><strong>Video đóng gói:</strong> <a href="${escapeHtml(safeVideo)}" style="color:#1d4ed8;">Xem video</a></div>`
        : '';
      const ctaLabel = 'Theo dõi đơn hàng';
      return {
        subject: cleanHeaderLine(`[VAHA Market] Đơn hàng đang giao (${rawCode})`),
        html: renderLayout({
          badgeText: 'Đang giao hàng',
          badgeBg: '#f0f9ff',
          badgeColor: '#0369a1',
          heading: 'Đơn hàng đang được giao',
          greeting: `Chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Người bán đã gửi sản phẩm <strong>${title}</strong>${code ? ` (Mã: <strong>${code}</strong>)` : ''}.</p>
            <div style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
              <div><strong>Đơn vị vận chuyển:</strong> ${carrier}</div>
              <div style="margin-top:4px;"><strong>Mã vận đơn:</strong> <code style="font-weight:700;">${tracking}</code></div>
              ${videoLink}
            </div>
            <div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 14px;color:#78350f;font-size:13px;">
              <strong>Bắt buộc khi nhận:</strong> Quay video mở hộp liền mạch đủ 6 mặt từ lúc còn nguyên niêm phong để làm bằng chứng nếu có lỗi.
            </div>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Chào ${name},`,
            `Người bán đã gửi sản phẩm "${rawTitle}"${rawCode ? ` (Mã: ${rawCode})` : ''}.`,
            `- Đơn vị vận chuyển: ${rawCarrier}`,
            `- Mã vận đơn: ${rawTracking}`,
            ...(safeVideo ? [`- Video đóng gói: ${safeVideo}`] : []),
            'Bắt buộc khi nhận: Quay video mở hộp liền mạch đủ 6 mặt từ lúc còn nguyên niêm phong.',
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'ORDER_COMPLETED': {
      const ctaLabel = 'Xem đơn hàng';
      const rawAdminNote = payload.adminNote?.trim() || '';
      const adminNoteHtml = rawAdminNote
        ? `<div style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#404040;"><strong>Ghi chú quản trị viên:</strong> ${escapeHtml(rawAdminNote)}</div>`
        : '';
      return {
        subject: cleanHeaderLine(`[VAHA Market] Đơn đã hoàn tất, chờ giải ngân (${rawCode})`),
        html: renderLayout({
          badgeText: 'Đã hoàn tất · Chờ giải ngân',
          badgeBg: '#ecfdf5',
          badgeColor: '#047857',
          heading: rawAdminNote ? 'Đơn hàng đã được xác nhận giao xong' : 'Người mua đã xác nhận nhận hàng',
          greeting: `Chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Đơn <strong>${title}</strong>${code ? ` (Mã: <strong>${code}</strong>)` : ''} đã hoàn tất giao nhận.</p>
            ${adminNoteHtml}
            <div style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:12px 14px;color:#065f46;">
              <strong>Số tiền thực nhận:</strong> <span style="font-size:16px;font-weight:700;">${formatVnd(payload.sellerPayout)}</span><br/>
              <span style="font-size:13px;">Sàn sẽ chuyển khoản về tài khoản ngân hàng của bạn sớm nhất.</span>
            </div>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Chào ${name},`,
            `Đơn "${rawTitle}"${rawCode ? ` (Mã: ${rawCode})` : ''} đã hoàn tất giao nhận.`,
            ...(rawAdminNote ? [`- Ghi chú quản trị viên: ${rawAdminNote}`] : []),
            `- Số tiền thực nhận: ${formatVnd(payload.sellerPayout)}`,
            'Sàn sẽ chuyển khoản về tài khoản ngân hàng của bạn sớm nhất.',
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'ORDER_REFUND_REQUESTED': {
      const ctaLabel = 'Xem trạng thái hoàn tiền';
      const rawReason = payload.cancelReason?.trim() || 'Đơn hàng đã hủy theo quy định.';
      const rawBank = payload.bankName?.trim() || 'Tài khoản đã lưu';
      const rawAccNo = payload.accountNumber?.trim() || '';
      const rawAccName = payload.accountName?.trim() || '';
      return {
        subject: cleanHeaderLine(`[VAHA Market] Đơn đã hủy, chờ hoàn ${formatVnd(payload.amount)} (${rawCode})`),
        html: renderLayout({
          badgeText: 'Chờ hoàn tiền',
          badgeBg: '#fffbeb',
          badgeColor: '#92400e',
          heading: 'Đơn hàng đang chờ hoàn tiền',
          greeting: `Chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Đơn <strong>${title}</strong>${code ? ` (Mã: <strong>${code}</strong>)` : ''} đã hủy và chuyển sang hàng đợi hoàn tiền.</p>
            <div style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;margin-bottom:14px;">
              <div><strong>Lý do:</strong> ${escapeHtml(rawReason)}</div>
              <div style="margin-top:4px;"><strong>Số tiền hoàn:</strong> <span style="color:#1d4ed8;font-weight:700;">${formatVnd(payload.amount)}</span></div>
              <div style="margin-top:4px;"><strong>Tài khoản nhận:</strong> ${escapeHtml(rawBank)}${rawAccNo ? ` · <code>${escapeHtml(rawAccNo)}</code>` : ''}${rawAccName ? ` · ${escapeHtml(rawAccName)}` : ''}</div>
            </div>
            <p style="margin:0;font-size:13px;color:#525252;">Sàn sẽ chuyển khoản hoàn tiền về tài khoản trên sớm nhất.</p>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Chào ${name},`,
            `Đơn "${rawTitle}"${rawCode ? ` (Mã: ${rawCode})` : ''} đã hủy và chờ hoàn tiền.`,
            `- Lý do: ${rawReason}`,
            `- Số tiền hoàn: ${formatVnd(payload.amount)}`,
            `- Tài khoản nhận: ${rawBank}${rawAccNo ? ` - ${rawAccNo}` : ''}${rawAccName ? ` - ${rawAccName}` : ''}`,
            'Sàn sẽ chuyển khoản hoàn tiền sớm nhất.',
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'ORDER_REFUND_COMPLETED': {
      const ctaLabel = 'Xem đơn hàng';
      const rawBank = payload.bankName?.trim() || 'Tài khoản đã lưu';
      const rawAccNo = payload.accountNumber?.trim() || '';
      const rawAccName = payload.accountName?.trim() || '';
      const rawRef = payload.reference?.trim() || '';
      const refHtml = rawRef ? `<div style="margin-top:4px;"><strong>Mã giao dịch:</strong> ${escapeHtml(rawRef)}</div>` : '';
      return {
        subject: cleanHeaderLine(`[VAHA Market] Đã hoàn tiền ${formatVnd(payload.amount)} (${rawCode})`),
        html: renderLayout({
          badgeText: 'Đã hoàn tiền',
          badgeBg: '#ecfdf5',
          badgeColor: '#047857',
          heading: 'Đã chuyển khoản hoàn tiền',
          greeting: `Chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Khoản hoàn tiền đơn <strong>${title}</strong>${code ? ` (Mã: <strong>${code}</strong>)` : ''} đã được chuyển.</p>
            <div style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;">
              <div><strong>Số tiền:</strong> <span style="color:#047857;font-weight:700;">${formatVnd(payload.amount)}</span></div>
              <div style="margin-top:4px;"><strong>Ngân hàng:</strong> ${escapeHtml(rawBank)}</div>
              ${rawAccNo ? `<div style="margin-top:4px;"><strong>Số tài khoản:</strong> <code>${escapeHtml(rawAccNo)}</code></div>` : ''}
              ${rawAccName ? `<div style="margin-top:4px;"><strong>Chủ tài khoản:</strong> ${escapeHtml(rawAccName)}</div>` : ''}
              ${refHtml}
            </div>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Chào ${name},`,
            `Khoản hoàn tiền đơn "${rawTitle}"${rawCode ? ` (Mã: ${rawCode})` : ''} đã được chuyển.`,
            `- Số tiền: ${formatVnd(payload.amount)}`,
            `- Ngân hàng: ${rawBank}`,
            ...(rawAccNo ? [`- Số tài khoản: ${rawAccNo}`] : []),
            ...(rawAccName ? [`- Chủ tài khoản: ${rawAccName}`] : []),
            ...(rawRef ? [`- Mã giao dịch: ${rawRef}`] : []),
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'PAYOUT_DONE': {
      const rawBank = payload.bankName?.trim() || 'Tài khoản đã lưu';
      const rawAccNo = payload.accountNumber?.trim() || '';
      const rawAccName = payload.accountName?.trim() || '';
      const rawRef = payload.reference?.trim() || '';
      const refHtml = rawRef ? `<div style="margin-top:4px;"><strong>Mã giao dịch:</strong> ${escapeHtml(rawRef)}</div>` : '';
      const ctaLabel = 'Xem đơn hàng';
      return {
        subject: cleanHeaderLine(`[VAHA Market] Đã giải ngân ${formatVnd(payload.amount)} (${rawCode})`),
        html: renderLayout({
          badgeText: 'Đã giải ngân',
          badgeBg: '#ecfdf5',
          badgeColor: '#047857',
          heading: 'Đã chuyển tiền bán hàng',
          greeting: `Chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Tiền bán sản phẩm <strong>${title}</strong>${code ? ` (Mã: <strong>${code}</strong>)` : ''} đã được chuyển về tài khoản của bạn.</p>
            <div style="background-color:#fafafa;border:1px solid #e5e5e5;border-radius:8px;padding:12px 14px;">
              <div><strong>Số tiền:</strong> <span style="color:#047857;font-weight:700;">${formatVnd(payload.amount)}</span></div>
              <div style="margin-top:4px;"><strong>Ngân hàng:</strong> ${escapeHtml(rawBank)}</div>
              ${rawAccNo ? `<div style="margin-top:4px;"><strong>Số tài khoản:</strong> <code>${escapeHtml(rawAccNo)}</code></div>` : ''}
              ${rawAccName ? `<div style="margin-top:4px;"><strong>Chủ tài khoản:</strong> ${escapeHtml(rawAccName)}</div>` : ''}
              ${refHtml}
            </div>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Chào ${name},`,
            `Tiền bán sản phẩm "${rawTitle}"${rawCode ? ` (Mã: ${rawCode})` : ''} đã được chuyển.`,
            `- Số tiền: ${formatVnd(payload.amount)}`,
            `- Ngân hàng: ${rawBank}`,
            ...(rawAccNo ? [`- Số tài khoản: ${rawAccNo}`] : []),
            ...(rawAccName ? [`- Chủ tài khoản: ${rawAccName}`] : []),
            ...(rawRef ? [`- Mã giao dịch: ${rawRef}`] : []),
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'LISTING_REVIEWED': {
      const approved = payload.reviewStatus === 'active';
      const listingUrl = approved && payload.listingId
        ? `${SITE_URL}/listing/${encodeURIComponent(payload.listingId)}`
        : `${SITE_URL}/my-listings`;
      const rawReason = payload.rejectionReason?.trim() || 'Vui lòng kiểm tra lại ảnh xác thực và nội dung tin.';
      const ctaLabel = approved ? 'Xem tin đăng' : 'Sửa và gửi lại';
      return {
        subject: cleanHeaderLine(
          approved ? `[VAHA Market] Tin "${rawTitle}" đã được duyệt` : `[VAHA Market] Tin "${rawTitle}" cần chỉnh sửa`,
        ),
        html: renderLayout({
          badgeText: approved ? 'Đã duyệt' : 'Cần chỉnh sửa',
          badgeBg: approved ? '#ecfdf5' : '#fef2f2',
          badgeColor: approved ? '#047857' : '#b91c1c',
          heading: approved ? 'Tin đăng đã được duyệt' : 'Tin đăng chưa được duyệt',
          greeting: `Chào ${name},`,
          bodyHtml: approved
            ? `<p style="margin:0;">Tin <strong>${title}</strong> đã được duyệt và đang hiển thị trên VAHA Market.</p>`
            : `
              <p style="margin:0 0 12px;">Tin <strong>${title}</strong> chưa đạt yêu cầu duyệt.</p>
              <div style="background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 14px;color:#991b1b;">
                <strong>Lý do:</strong> ${escapeHtml(rawReason)}
              </div>
              <p style="margin:12px 0 0;font-size:13px;">Hãy chỉnh sửa và gửi duyệt lại.</p>
            `,
          ctaLabel,
          ctaUrl: listingUrl,
        }),
        text: renderPlainText(
          approved
            ? [`Chào ${name},`, `Tin "${rawTitle}" đã được duyệt và hiển thị trên VAHA Market.`]
            : [`Chào ${name},`, `Tin "${rawTitle}" chưa đạt yêu cầu duyệt.`, `- Lý do: ${rawReason}`, 'Hãy chỉnh sửa và gửi duyệt lại.'],
          ctaLabel,
          listingUrl,
        ),
      };
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ success: false, message: 'Method not allowed' }, 405);

  const auth = req.headers.get('authorization')?.trim() ?? '';
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(auth);
  const bearer = bearerMatch?.[1]?.trim() ?? '';
  const headerSecret = req.headers.get('x-internal-secret')?.trim() ?? '';
  const authorized =
    Boolean(SECRET_KEY) &&
    ((await safeEqual(bearer, SECRET_KEY)) || (await safeEqual(headerSecret, SECRET_KEY)));

  if (!authorized) {
    return json({ success: false, message: 'Unauthorized' }, 401);
  }

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.error('[send-order-email] Missing GMAIL_USER or GMAIL_APP_PASSWORD');
    return json({ success: false, message: 'SMTP not configured' }, 500);
  }

  let payload: EmailPayload;
  try {
    payload = (await req.json()) as EmailPayload;
  } catch {
    return json({ success: false, message: 'Invalid JSON' }, 400);
  }

  const recipient = typeof payload?.to === 'string' ? payload.to.trim() : '';
  if (
    !payload ||
    !VALID_EVENTS.has(payload.event) ||
    !recipient ||
    recipient.length > 254 ||
    /[\r\n]/.test(recipient) ||
    !EMAIL_RE.test(recipient)
  ) {
    return json({ success: false, message: 'Invalid event or recipient email' }, 400);
  }

  const { subject, html, text } = buildEmail(payload);

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
      from: `VAHA Market <${GMAIL_USER}>`,
      replyTo: GMAIL_USER,
      to: recipient,
      subject,
      text,
      html,
    });

    return json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('[send-order-email] SMTP error:', err);
    return json({ success: false, message: 'SMTP send failed' }, 500);
  }
});
