export const config = {
  runtime: 'edge',
};

const SITE_URL = 'https://vahamarket.vercel.app';
const FALLBACK_IMAGE = `${SITE_URL}/og-preview.png`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatVnd(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

function toOgImageUrl(rawUrl: string): string {
  const marker = '/upload/';
  const idx = rawUrl.indexOf(marker);
  if (idx === -1 || !rawUrl.includes('res.cloudinary.com')) return rawUrl;
  return `${rawUrl.slice(0, idx + marker.length)}f_jpg,q_auto,w_1200,h_630,c_fill,g_auto/${rawUrl.slice(idx + marker.length)}`;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id')?.trim() ?? '';
  const targetUrl = id ? `${SITE_URL}/listing/${encodeURIComponent(id)}` : SITE_URL;

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  let title = 'VAHA Market — Sàn Trung Gian Âm Thanh 0% Phí';
  let description =
    'Sàn giao dịch trung gian bảo lãnh 0% phí của cộng đồng Hội người Việt nghiện tai nghe. Thanh toán VietQR tự động.';
  let image = FALLBACK_IMAGE;

  if (UUID_RE.test(id) && supabaseUrl && supabaseKey) {
    try {
      const apiUrl = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/listings?id=eq.${encodeURIComponent(id)}&select=title,price,province,images&limit=1`;
      const res = await fetch(apiUrl, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      });
      if (res.ok) {
        const rows = (await res.json()) as Array<{
          title?: string;
          price?: number;
          province?: string | null;
          images?: Array<{ url?: string }>;
        }>;
        const item = rows[0];
        if (item?.title) {
          const priceStr = typeof item.price === 'number' ? formatVnd(item.price) : '';
          title = priceStr ? `${item.title} — ${priceStr} | VAHA Market` : `${item.title} | VAHA Market`;
          description = `${priceStr ? `Giá ${priceStr} · ` : ''}${item.province ? `${item.province} · ` : ''}Giao dịch bảo lãnh 0% phí tại VAHA Market.`;
          const firstImg = item.images?.[0]?.url;
          if (firstImg) image = toOgImageUrl(firstImg);
        }
      }
    } catch {
      // fallback to default OG metadata
    }
  }

  const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="VAHA Market" />
    <meta property="og:locale" content="vi_VN" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(targetUrl)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${escapeHtml(title)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />
    <meta name="twitter:image:alt" content="${escapeHtml(title)}" />
  </head>
  <body>
    <p><a href="${escapeHtml(targetUrl)}">${escapeHtml(title)}</a></p>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
    },
  });
}
