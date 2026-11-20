#!/usr/bin/env python3
"""
Tạo ảnh Link Preview (Open Graph) 1200x630 cho VAHA Market -> public/og-preview.png

Yêu cầu: Python 3 + Pillow (pip install pillow) và font Inter (Linux: apt install fonts-inter;
macOS/Windows: tải Inter từ https://rsms.me/inter/ rồi sửa FONT_DIRS bên dưới nếu cần).
Chạy:  python3 scripts/generate-og-preview.py
Ảnh được vẽ ở độ phân giải gấp đôi rồi thu nhỏ (anti-aliasing) để nét khi thu nhỏ trên điện thoại.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H, S = 1200, 630, 2  # kích thước chuẩn mạng xã hội, S = hệ số siêu mẫu
OUT = Path(__file__).resolve().parent.parent / "public" / "og-preview.png"

# Màu theo giao diện web (Tailwind slate + xanh thương hiệu)
BG, WHITE, BLUE = "#F8FAFC", "#FFFFFF", "#2563EB"
INK, MUTED, BORDER = "#0F172A", "#64748B", "#E2E8F0"
BLUE50, BLUE100, BLUE200 = "#EFF6FF", "#DBEAFE", "#BFDBFE"

FONT_DIRS = [
    "/usr/share/fonts/opentype/inter",
    "/usr/share/fonts/truetype/inter",
    str(Path.home() / ".fonts"),
    "/Library/Fonts",
    "C:/Windows/Fonts",
]
FALLBACKS = {"Bold": "DejaVuSans-Bold.ttf", "SemiBold": "DejaVuSans-Bold.ttf", "Medium": "DejaVuSans.ttf"}


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    for d in FONT_DIRS:
        p = Path(d) / f"Inter-{weight}.otf"
        if p.exists():
            return ImageFont.truetype(str(p), size * S)
    return ImageFont.truetype(FALLBACKS[weight], size * S)


def px(v: float) -> int:
    return round(v * S)


img = Image.new("RGBA", (W * S, H * S), BG)
d = ImageDraw.Draw(img)

# ---- Thẻ trắng viền tinh tế + bóng nhẹ ------------------------------------------------
CARD = (28, 28, W - 28, H - 28)
shadow = Image.new("RGBA", img.size, (0, 0, 0, 0))
ImageDraw.Draw(shadow).rounded_rectangle([px(v) for v in (CARD[0], CARD[1] + 6, CARD[2], CARD[3] + 6)], radius=px(32), fill=(15, 23, 42, 22))
from PIL import ImageFilter  # noqa: E402
img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(px(10))))
d = ImageDraw.Draw(img)
d.rounded_rectangle([px(v) for v in CARD], radius=px(32), fill=WHITE, outline=BORDER, width=px(1.5))

# ---- Họa tiết xanh nhạt góc trên phải (cắt theo thẻ) -----------------------------------
deco = Image.new("RGBA", img.size, (0, 0, 0, 0))
dd = ImageDraw.Draw(deco)
for cx, cy, r, col in [(1120, 40, 300, BLUE50), (1120, 40, 210, BLUE100), (1120, 40, 120, BLUE200)]:
    dd.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=col)
mask = Image.new("L", img.size, 0)
ImageDraw.Draw(mask).rounded_rectangle([px(v) for v in CARD], radius=px(32), fill=255)
img.paste(deco, (0, 0), Image.composite(deco.split()[3], Image.new("L", img.size, 0), mask))
d = ImageDraw.Draw(img)
d.rounded_rectangle([px(v) for v in CARD], radius=px(32), outline=BORDER, width=px(1.5))

# ---- Logo: khung bo góc xanh + tai nghe trắng (giống favicon) --------------------------
LX, LY, LS = 88, 78, 128
d.rounded_rectangle([px(LX), px(LY), px(LX + LS), px(LY + LS)], radius=px(32), fill=BLUE)
k = LS / 32.0


def lp(x, y):  # tọa độ favicon (viewBox 32) -> pixel
    return px(LX + x * k), px(LY + y * k)


stroke = px(2.2 * k)
cx0, cy0 = lp(16, 16)
r = px(8 * k)
d.arc([cx0 - r, cy0 - r, cx0 + r, cy0 + r], start=180, end=360, fill=WHITE, width=stroke)
for xs in (8, 24):  # hai đoạn thẳng của quai
    a, b = lp(xs, 16), lp(xs, 19.2)
    d.line([a, b], fill=WHITE, width=stroke)
for xs in (6, 21):  # hai ốp tai
    x0, y0 = lp(xs, 18)
    x1, y1 = lp(xs + 5, 26)
    d.rounded_rectangle([x0, y0, x1, y1], radius=px(2 * k), fill=WHITE)

# ---- Tên thương hiệu + phụ đề -----------------------------------------------------------
TX = LX + LS + 32
d.text((px(TX), px(LY + 62)), "VAHA Market", font=font("Bold", 88), fill=INK, anchor="ls")
d.text((px(TX + 2), px(LY + 112)), "Vietnamese Association of Headphone Addicts Market", font=font("Medium", 27), fill=MUTED, anchor="ls")

# ---- Câu mô tả nổi bật (tự co cỡ chữ để vừa khổ) ----------------------------------------
MAXW = W - 2 * LX
lines = [
    [("Sàn giao dịch trung gian ", INK), ("bảo lãnh 100%", BLUE)],
    [("dành cho cộng đồng âm thanh", INK)],
]
size = 58
while size > 30:
    f = font("Bold", size)
    widest = max(sum(d.textlength(t, font=f) for t, _ in ln) for ln in lines) / S
    if widest <= MAXW:
        break
    size -= 1
y = 268
for ln in lines:
    x = LX
    for text, col in ln:
        d.text((px(x), px(y)), text, font=f, fill=col, anchor="ls")
        x += d.textlength(text, font=f) / S
    y += size * 1.28

# ---- 3 pill/badge -------------------------------------------------------------------------
PILLS = ["Giữ tiền an toàn (Escrow)", "Thanh toán VietQR tự động", "Ưu đãi phí sàn 0%"]
GAP, PAD_L, ICON, PAD_R, PH = 14, 20, 26, 24, 58
psize = 26
while psize > 16:
    pf = font("SemiBold", psize)
    widths = [PAD_L + ICON + 10 + d.textlength(t, font=pf) / S + PAD_R for t in PILLS]
    if sum(widths) + GAP * (len(PILLS) - 1) <= MAXW:
        break
    psize -= 1
PY = 438
x = LX
for text, w in zip(PILLS, widths):
    d.rounded_rectangle([px(x), px(PY), px(x + w), px(PY + PH)], radius=px(PH / 2), fill=BLUE50, outline=BLUE200, width=px(1.5))
    ix, iy = x + PAD_L + ICON / 2, PY + PH / 2
    d.ellipse([px(ix - ICON / 2), px(iy - ICON / 2), px(ix + ICON / 2), px(iy + ICON / 2)], fill=BLUE)
    # dấu tick trắng
    d.line([(px(ix - 6), px(iy + 0.5)), (px(ix - 1.5), px(iy + 5)), (px(ix + 6.5), px(iy - 5))], fill=WHITE, width=px(2.6), joint="curve")
    d.text((px(x + PAD_L + ICON + 10), px(iy)), text, font=pf, fill=BLUE, anchor="lm")
    x += w + GAP

# ---- Địa chỉ web ở góc dưới ---------------------------------------------------------------
d.ellipse([px(LX), px(554), px(LX + 12), px(566)], fill=BLUE)
d.text((px(LX + 26), px(560)), "vahamarket.vercel.app", font=font("SemiBold", 30), fill=BLUE, anchor="lm")

final = img.convert("RGB").resize((W, H), Image.LANCZOS)
OUT.parent.mkdir(parents=True, exist_ok=True)
final.save(OUT, "PNG", optimize=True)
print(f"Đã tạo {OUT} ({final.size[0]}x{final.size[1]}, {OUT.stat().st_size // 1024} KB) | tagline {size}px, pill {psize}px")
