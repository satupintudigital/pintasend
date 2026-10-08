"""Generate display assets from the canonical PintaSend masters in
`development/` (repo root).

Masters (never edited here, brand colors are immutable):
  - logo-pintasend-ai-clean.png  → light-surface wordmark (navy text) → public/pintasend.png
  - logo-pintasend-dark.png      → dark-surface wordmark (light text) → used in og.png
  - logo-pintasend-mark.png      → square mark → src/app/favicon.ico

Outputs:
  1. public/pintasend.png — wordmark for the light dashboard/nav surface.
  2. src/app/favicon.ico  — multi-size ICO cropped from the mark.
  3. public/og.png        — 1200x630 OpenGraph card with the light wordmark.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
REPO = ROOT.parent
MASTERS = REPO / "development"

SRC_LIGHT = MASTERS / "logo-pintasend-ai-clean.png"
SRC_DARK = MASTERS / "logo-pintasend-dark.png"
SRC_MARK = MASTERS / "logo-pintasend-mark.png"

OUT_LOGO = ROOT / "public" / "pintasend.png"
OUT_ICO = ROOT / "src" / "app" / "favicon.ico"
OUT_OG = ROOT / "public" / "og.png"

LOGO_WIDTH = 1000
ICO_SIZES = [(16, 16), (32, 32), (48, 48), (64, 64)]


def main():
    OUT_LOGO.parent.mkdir(parents=True, exist_ok=True)
    OUT_ICO.parent.mkdir(parents=True, exist_ok=True)

    light = Image.open(SRC_LIGHT).convert("RGBA")
    logo = light.resize(
        (LOGO_WIDTH, round(light.size[1] * LOGO_WIDTH / light.size[0])), Image.LANCZOS
    )
    logo.save(OUT_LOGO, optimize=True)
    print("wrote", OUT_LOGO, logo.size)

    mark = Image.open(SRC_MARK).convert("RGBA")
    mark.thumbnail((64, 64), Image.LANCZOS)
    mark.save(OUT_ICO, format="ICO", sizes=ICO_SIZES)
    print("wrote", OUT_ICO, mark.size)

    dark = Image.open(SRC_DARK).convert("RGBA")
    make_og(dark)


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

    # Logo lockup: varian light (wordmark putih) karena surface OG gelap.
    lw = 240
    lh = round(lw * logo.size[1] / logo.size[0])
    mark = logo.resize((lw, lh), Image.LANCZOS)
    img.paste(mark, (96, 92), mark)

    def font(name, size):
        for cand in (Path("C:/Windows/Fonts") / name, Path("/usr/share/fonts/truetype/dejavu") / name):
            if cand.exists():
                return ImageFont.truetype(str(cand), size)
        return ImageFont.load_default()

    fb = font("arialbd.ttf", 60)
    fr = font("arial.ttf", 28)
    d.text((96, 300), "Satu platform pesan,", font=fb, fill=(244, 244, 245))
    d.text((96, 374), "satu API untuk bisnis.", font=fb, fill=(34, 211, 238))
    d.text(
        (96, 456),
        "AI Gateway multi-kanal (WhatsApp, Telegram Bot, SMS) — AI menjawab pelanggan 24/7.",
        font=fr,
        fill=(161, 161, 170),
    )
    OUT_OG.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT_OG, optimize=True)
    print("wrote", OUT_OG)


if __name__ == "__main__":
    main()
