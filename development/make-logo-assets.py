"""Generate display assets from development/logo-wavio.png.

The original logo has transparent background, a bright cyan-blue icon
(speech bubble + chart), and the wordmark "Wavio" in dark navy — designed for
a light surface. The Wavio site is dark (#09090b), so this script:

  1. Recolors the navy wordmark to the site's text color (#f4f4f5),
     keeping the blue icon untouched  → public/logo-wavio.png
  2. Crops the icon mark, squares it, and writes it as the favicon
     (src/app/favicon.ico) so the browser tab matches the new brand.

Discriminator: icon pixels are cyan-dominant (R < 0.45 * G), the wordmark
is navy (R >= 0.45 * G).
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "development" / "logo-wavio.png"
OUT_LOGO = ROOT / "public" / "logo-wavio.png"
OUT_ICO = ROOT / "src" / "app" / "favicon.ico"
OUT_OG = ROOT / "public" / "og.png"

LIGHT = (244, 244, 245)  # --color-fg
LOGO_WIDTH = 720


def is_icon_px(r, g, b):
    """Cyan/blue icon pixels vs navy wordmark pixels."""
    return g > 0 and r < 0.45 * g


def main():
    im = Image.open(SRC).convert("RGBA")
    w, h = im.size
    px = im.load()

    # Recolor navy wordmark → light, keep everything else.
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and not is_icon_px(r, g, b):
                px[x, y] = (*LIGHT, a)

    # Downscale for the web (still 3x+ retina at nav sizes).
    logo = im.resize(
        (LOGO_WIDTH, round(h * LOGO_WIDTH / w)), Image.LANCZOS
    )
    OUT_LOGO.parent.mkdir(parents=True, exist_ok=True)
    logo.save(OUT_LOGO, optimize=True)
    print("wrote", OUT_LOGO, logo.size)

    # Favicon: tight-crop the icon mark, pad to a square, save multi-size ICO.
    icon_pts = [
        (x, y)
        for y in range(h)
        for x in range(w)
        if px[x, y][3] > 40 and is_icon_px(*px[x, y][:3])
    ]
    if not icon_pts:
        raise SystemExit("no icon pixels found")
    xs = [p[0] for p in icon_pts]
    ys = [p[1] for p in icon_pts]
    left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)
    bw, bh = right - left + 1, bottom - top + 1
    # Pad to square symmetrically.
    size = max(bw, bh)
    cx, cy = (left + right) / 2, (top + bottom) / 2
    x0 = max(0, round(cx - size / 2))
    y0 = max(0, round(cy - size / 2))
    x1 = min(w, x0 + size)
    y1 = min(h, y0 + size)
    x0 = max(0, x1 - size)
    y0 = max(0, y1 - size)
    mark = im.crop((x0, y0, x1, y1)).resize((256, 256), Image.LANCZOS)
    OUT_ICO.parent.mkdir(parents=True, exist_ok=True)
    mark.save(OUT_ICO, sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("wrote", OUT_ICO)

    make_og(logo)


def make_og(logo: Image.Image):
    """OpenGraph share card 1200×630 with the real logo lockup."""
    W, H = 1200, 630
    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)

    # Background: subtle vertical gradient + blue glow on top.
    top, bottom = (10, 10, 12), (17, 17, 20)
    for y in range(H):
        t = y / H
        c = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
        d.line([(0, y), (W, y)], fill=c)
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(120, 0, -1):
        alpha = round(60 * (1 - i / 120) ** 2)
        gd.ellipse(
            (W / 2 - i * 5, -200 - i * 3, W / 2 + i * 5, -200 + i * 3),
            fill=(37, 99, 235, alpha),
        )
    img.paste(glow, (0, 0), glow)
    d = ImageDraw.Draw(img)

    # Grid lines.
    for y in range(120, H, 120):
        d.line([(0, y), (W, y)], fill=(255, 255, 255, 12))
    for x in range(200, W, 200):
        d.line([(x, 0), (x, H)], fill=(255, 255, 255, 12))

    # Logo lockup: asli (bukan varian light) — teks navy tetap terbaca di sini
    # karena kita pasang di permukaan terang? Tidak: bg gelap, jadi pakai varian light.
    lw = 168
    lh = round(lw * logo.size[1] / logo.size[0])
    mark = logo.resize((lw, lh), Image.LANCZOS)
    img.paste(mark, (96, 92), mark)

    def font(name, size):
        for cand in (Path("C:/Windows/Fonts") / name, Path("/usr/share/fonts/truetype/dejavu") / name):
            if cand.exists():
                return ImageFont.truetype(str(cand), size)
        return ImageFont.load_default()

    fb = font("arialbd.ttf", 64)
    fr = font("arial.ttf", 30)
    d.text((96, 290), "Kirim pesan WhatsApp,", font=fb, fill=(244, 244, 245))
    d.text((96, 366), "semudah memanggil API.", font=fb, fill=(34, 211, 238))
    d.text(
        (96, 452),
        "WhatsApp API Gateway untuk bisnis Indonesia — notifikasi, webhook, dan inbox dua arah.",
        font=fr,
        fill=(161, 161, 170),
    )
    OUT_OG.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT_OG, optimize=True)
    print("wrote", OUT_OG)


if __name__ == "__main__":
    main()
