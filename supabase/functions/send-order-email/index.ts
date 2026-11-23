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

const EMAIL_FOOTER_REASON = 'Bạn nhận được email này do có hoạt động giao dịch hoặc tin đăng trên VAHA Market.';

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
  isFeeCapped?: boolean;
  feeCapVnd?: number;
  feeSavedAmount?: number;
  cancelReason?: string;
  adminNote?: string;
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
              <td style="border-top:1px solid #e2e8f0;padding:16px 24px;background-color:#f8fafc;font-size:12px;line-height:1.6;color:#64748b;">
                <div>${escapeHtml(EMAIL_FOOTER_REASON)}</div>
                <div style="margin-top:4px;">
                  Mọi giao dịch đều được bảo vệ theo
                  <a href="${escapeHtml(SITE_URL)}/terms" style="color:#1d3bc5;text-decoration:underline;">Điều khoản dịch vụ</a>
                  của <strong>VAHA Market</strong>.
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
    `Điều khoản dịch vụ: ${SITE_URL}/terms`,
  ].join('\n');
}

function buildEmail(payload: EmailPayload): { subject: string; html: string; text: string } {
  const name = payload.recipientName?.trim() || 'bạn';
  const rawTitle = payload.listingTitle?.trim() || 'Sản phẩm';
  const rawCode = payload.paymentCode?.trim() || '';
  const title = escapeHtml(rawTitle);
  const code = escapeHtml(rawCode);
  const orderUrl = payload.orderId ? `${SITE_URL}/orders/${payload.orderId}` : `${SITE_URL}/orders`;
  const feeSaved = typeof payload.feeSavedAmount === 'number' && payload.feeSavedAmount > 0 ? payload.feeSavedAmount : 0;
  const feeCapLabel = formatVnd(typeof payload.feeCapVnd === 'number' && payload.feeCapVnd > 0 ? payload.feeCapVnd : 500000);
  const feeCapHtml =
    payload.isFeeCapped && feeSaved > 0
      ? `<div style="background-color:#ecfdf5;border:1px solid #6ee7b7;border-radius:10px;padding:12px 14px;margin-bottom:14px;color:#065f46;font-size:13px;"><strong>Ưu đãi trần phí sàn:</strong> Đơn hàng đã đạt mức trần phí sàn tối đa <strong>${feeCapLabel}</strong>, giúp bạn tiết kiệm <strong>${formatVnd(feeSaved)}</strong>.</div>`
      : '';
  const feeCapText =
    payload.isFeeCapped && feeSaved > 0
      ? `Đơn hàng đã đạt mức trần phí sàn tối đa ${feeCapLabel}, giúp bạn tiết kiệm ${formatVnd(feeSaved)}.`
      : '';

  switch (payload.event) {
    case 'ORDER_PAID': {
      const ctaLabel = 'Mở chi tiết đơn hàng';
      return {
        subject: `[VAHA Market] Bạn có đơn hàng mới đã thanh toán! (${rawCode})`.trim(),
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
            ${feeCapHtml}
            <div style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:10px;padding:12px 14px;color:#78350f;font-size:13px;">
              <strong>Lưu ý quan trọng trước khi gửi hàng:</strong> Vui lòng quay <strong>video test chức năng &amp; đóng gói liền mạch 6 mặt</strong> gói hàng, sau đó cập nhật đơn vị vận chuyển, mã vận đơn và link video lên VAHA Market.
            </div>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Xin chào ${name},`,
            `Người mua đã chuyển khoản thành công cho sản phẩm "${rawTitle}"${rawCode ? ` (Mã đơn: ${rawCode})` : ''}.`,
            `- Số tiền sàn đang giữ: ${formatVnd(payload.amount)}`,
            `- Thực nhận dự kiến sau khi hoàn tất: ${formatVnd(payload.sellerPayout)}`,
            ...(feeCapText ? [feeCapText] : []),
            'Lưu ý: Vui lòng quay video test chức năng & đóng gói liền mạch 6 mặt gói hàng, sau đó cập nhật đơn vị vận chuyển, mã vận đơn và link video lên VAHA Market.',
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'ORDER_SHIPPED': {
      const rawCarrier = payload.carrier?.trim() || 'Chưa cập nhật';
      const rawTracking = payload.trackingCode?.trim() || 'Chưa cập nhật';
      const rawVideo = payload.packingVideoUrl?.trim() || '';
      const carrier = escapeHtml(rawCarrier);
      const tracking = escapeHtml(rawTracking);
      const videoLink = rawVideo
        ? `<div style="margin-top:6px;"><strong>Video test &amp; đóng gói của người bán:</strong> <a href="${escapeHtml(rawVideo)}" style="color:#1d3bc5;">Xem video</a></div>`
        : '';
      const ctaLabel = 'Theo dõi & xác nhận đơn hàng';
      return {
        subject: `[VAHA Market] Đơn hàng của bạn đang được giao! (${rawCode})`.trim(),
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
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Xin chào ${name},`,
            `Người bán đã gửi đi sản phẩm "${rawTitle}"${rawCode ? ` (Mã đơn: ${rawCode})` : ''}.`,
            `- Đơn vị vận chuyển: ${rawCarrier}`,
            `- Mã vận đơn: ${rawTracking}`,
            ...(rawVideo ? [`- Video test & đóng gói của người bán: ${rawVideo}`] : []),
            'Bắt buộc khi nhận hàng: Hãy quay video mở hộp liền mạch 6 mặt từ lúc bưu kiện còn nguyên vẹn chưa cắt băng dính để làm căn cứ giải quyết khiếu nại nếu có sự cố.',
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'ORDER_COMPLETED': {
      const ctaLabel = 'Xem trạng thái giải ngân';
      const rawAdminNote = payload.adminNote?.trim() || '';
      const adminNoteHtml = rawAdminNote
        ? `<div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px;color:#334155;"><strong>Ghi chú xác nhận từ Admin:</strong> ${escapeHtml(rawAdminNote)}</div>`
        : '';
      return {
        subject: `[VAHA Market] Đơn hàng đã hoàn tất & mở khóa giải ngân (${rawCode})`.trim(),
        html: renderLayout({
          badgeText: 'Đã hoàn tất · Chờ giải ngân',
          badgeBg: '#ecfdf5',
          badgeColor: '#047857',
          heading: rawAdminNote ? 'Admin đã xác nhận giao thành công!' : 'Người mua đã xác nhận nhận hàng!',
          greeting: `Xin chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Đơn hàng <strong>${title}</strong>${code ? ` (Mã đơn: <strong>${code}</strong>)` : ''} đã được xác nhận hoàn tất giao nhận.</p>
            ${adminNoteHtml}
            ${feeCapHtml}
            <div style="background-color:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:12px 14px;color:#065f46;">
              <strong>Số tiền thực nhận:</strong> <span style="font-size:16px;font-weight:700;">${formatVnd(payload.sellerPayout)}</span><br/>
              <span style="font-size:13px;">Yêu cầu giải ngân đã được mở khóa. Admin VAHA Market sẽ chuyển khoản vào tài khoản ngân hàng bạn đã đăng ký trong thời gian sớm nhất.</span>
            </div>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Xin chào ${name},`,
            `Đơn hàng "${rawTitle}"${rawCode ? ` (Mã đơn: ${rawCode})` : ''} đã được xác nhận hoàn tất giao nhận.`,
            ...(rawAdminNote ? [`- Ghi chú từ Admin: ${rawAdminNote}`] : []),
            `- Số tiền thực nhận: ${formatVnd(payload.sellerPayout)}`,
            ...(feeCapText ? [feeCapText] : []),
            'Yêu cầu giải ngân đã được mở khóa. Admin VAHA Market sẽ chuyển khoản vào tài khoản ngân hàng bạn đã đăng ký trong thời gian sớm nhất.',
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'ORDER_REFUND_REQUESTED': {
      const ctaLabel = 'Xem trạng thái hoàn tiền';
      const rawReason = payload.cancelReason?.trim() || 'Đơn hàng được hủy theo quy định hoàn tiền của VAHA Market.';
      const rawBank = payload.bankName?.trim() || 'Tài khoản ngân hàng đã đăng ký';
      const rawAccNo = payload.accountNumber?.trim() || '';
      const rawAccName = payload.accountName?.trim() || '';
      return {
        subject: `[VAHA Market] Đơn hàng đã hủy & đang chờ hoàn tiền ${formatVnd(payload.amount)} (${rawCode})`.trim(),
        html: renderLayout({
          badgeText: 'Chờ hoàn tiền',
          badgeBg: '#fffbeb',
          badgeColor: '#92400e',
          heading: 'Đơn hàng đã chuyển sang chờ hoàn tiền',
          greeting: `Xin chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Đơn hàng <strong>${title}</strong>${code ? ` (Mã đơn: <strong>${code}</strong>)` : ''} đã được hủy và đưa vào hàng đợi hoàn tiền.</p>
            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:14px;">
              <div><strong>Lý do:</strong> ${escapeHtml(rawReason)}</div>
              <div style="margin-top:4px;"><strong>Số tiền hoàn dự kiến:</strong> <span style="color:#1d4ed8;font-weight:700;">${formatVnd(payload.amount)}</span></div>
              <div style="margin-top:4px;"><strong>Tài khoản nhận hoàn tiền:</strong> ${escapeHtml(rawBank)}${rawAccNo ? ` · <code>${escapeHtml(rawAccNo)}</code>` : ''}${rawAccName ? ` · ${escapeHtml(rawAccName)}` : ''}</div>
            </div>
            <p style="margin:0;font-size:13px;color:#475569;">Admin VAHA Market sẽ kiểm tra và chuyển khoản hoàn tiền về tài khoản ngân hàng trên trong thời gian sớm nhất.</p>
          `,
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Xin chào ${name},`,
            `Đơn hàng "${rawTitle}"${rawCode ? ` (Mã đơn: ${rawCode})` : ''} đã được hủy và đưa vào hàng đợi hoàn tiền.`,
            `- Lý do: ${rawReason}`,
            `- Số tiền hoàn dự kiến: ${formatVnd(payload.amount)}`,
            `- Tài khoản nhận hoàn tiền: ${rawBank}${rawAccNo ? ` - ${rawAccNo}` : ''}${rawAccName ? ` - ${rawAccName}` : ''}`,
            'Admin VAHA Market sẽ chuyển khoản hoàn tiền về tài khoản trên trong thời gian sớm nhất.',
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'ORDER_REFUND_COMPLETED': {
      const ctaLabel = 'Xem chi tiết đơn hàng';
      const rawBank = payload.bankName?.trim() || 'Ngân hàng đã đăng ký';
      const rawAccNo = payload.accountNumber?.trim() || '';
      const rawAccName = payload.accountName?.trim() || '';
      const rawRef = payload.reference?.trim() || '';
      const refHtml = rawRef ? `<div style="margin-top:4px;"><strong>Mã tham chiếu giao dịch:</strong> ${escapeHtml(rawRef)}</div>` : '';
      return {
        subject: `[VAHA Market] Đã hoàn tiền thành công ${formatVnd(payload.amount)} (${rawCode})`.trim(),
        html: renderLayout({
          badgeText: 'Đã hoàn tiền thành công',
          badgeBg: '#ecfdf5',
          badgeColor: '#047857',
          heading: 'VAHA Market đã hoàn tiền thành công!',
          greeting: `Xin chào ${name},`,
          bodyHtml: `
            <p style="margin:0 0 12px;">Khoản hoàn tiền cho đơn hàng <strong>${title}</strong>${code ? ` (Mã đơn: <strong>${code}</strong>)` : ''} đã được Admin chuyển khoản thành công.</p>
            <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;">
              <div><strong>Số tiền đã hoàn:</strong> <span style="color:#047857;font-weight:700;">${formatVnd(payload.amount)}</span></div>
              <div style="margin-top:4px;"><strong>Ngân hàng nhận:</strong> ${escapeHtml(rawBank)}</div>
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
            `Xin chào ${name},`,
            `Khoản hoàn tiền cho đơn hàng "${rawTitle}"${rawCode ? ` (Mã đơn: ${rawCode})` : ''} đã được Admin VAHA Market chuyển khoản thành công.`,
            `- Số tiền đã hoàn: ${formatVnd(payload.amount)}`,
            `- Ngân hàng nhận: ${rawBank}`,
            ...(rawAccNo ? [`- Số tài khoản: ${rawAccNo}`] : []),
            ...(rawAccName ? [`- Chủ tài khoản: ${rawAccName}`] : []),
            ...(rawRef ? [`- Mã tham chiếu: ${rawRef}`] : []),
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'PAYOUT_DONE': {
      const rawBank = payload.bankName?.trim() || 'Ngân hàng đã đăng ký';
      const rawAccNo = payload.accountNumber?.trim() || '';
      const rawAccName = payload.accountName?.trim() || '';
      const rawRef = payload.reference?.trim() || '';
      const bank = escapeHtml(rawBank);
      const accNo = escapeHtml(rawAccNo);
      const accName = escapeHtml(rawAccName);
      const refHtml = rawRef ? `<div style="margin-top:4px;"><strong>Mã tham chiếu:</strong> ${escapeHtml(rawRef)}</div>` : '';
      const ctaLabel = 'Xem chi tiết đơn hàng';
      return {
        subject: `[VAHA Market] Đã giải ngân thành công ${formatVnd(payload.amount)}! (${rawCode})`.trim(),
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
          ctaLabel,
          ctaUrl: orderUrl,
        }),
        text: renderPlainText(
          [
            `Xin chào ${name},`,
            `Khoản tiền bán sản phẩm "${rawTitle}"${rawCode ? ` (Mã đơn: ${rawCode})` : ''} đã được Admin VAHA Market chuyển khoản thành công.`,
            `- Số tiền đã chuyển: ${formatVnd(payload.amount)}`,
            `- Ngân hàng nhận: ${rawBank}`,
            ...(rawAccNo ? [`- Số tài khoản: ${rawAccNo}`] : []),
            ...(rawAccName ? [`- Chủ tài khoản: ${rawAccName}`] : []),
            ...(rawRef ? [`- Mã tham chiếu: ${rawRef}`] : []),
          ],
          ctaLabel,
          orderUrl,
        ),
      };
    }

    case 'LISTING_REVIEWED': {
      const approved = payload.reviewStatus === 'active';
      const listingUrl = approved && payload.listingId ? `${SITE_URL}/listing/${payload.listingId}` : `${SITE_URL}/my-listings`;
      const rawReason = payload.rejectionReason?.trim() || 'Vui lòng kiểm tra lại ảnh xác thực chính chủ và nội dung tin đăng.';
      const reason = escapeHtml(rawReason);
      const ctaLabel = approved ? 'Xem tin đăng trên sàn' : 'Sửa & gửi duyệt lại';
      return {
        subject: approved
          ? `[VAHA Market] Tin đăng "${rawTitle}" đã được duyệt lên sàn!`
          : `[VAHA Market] Tin đăng "${rawTitle}" cần chỉnh sửa lại`,
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
          ctaLabel,
          ctaUrl: listingUrl,
        }),
        text: renderPlainText(
          approved
            ? [
                `Xin chào ${name},`,
                `Tin đăng "${rawTitle}" đã vượt qua bước kiểm duyệt chính chủ và hiện đang hiển thị công khai trên VAHA Market.`,
              ]
            : [
                `Xin chào ${name},`,
                `Tin đăng "${rawTitle}" chưa đạt yêu cầu kiểm duyệt.`,
                `- Lý do từ Admin: ${rawReason}`,
                'Bạn có thể truy cập đường dẫn bên dưới để chỉnh sửa và gửi duyệt lại ngay.',
              ],
          ctaLabel,
          listingUrl,
        ),
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
      to: payload.to,
      subject,
      text,
      html,
    });

    return json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('[send-order-email] SMTP error:', err);
    return json({ success: false, message: err instanceof Error ? err.message : 'SMTP send failed' }, 500);
  }
});
