#!/usr/bin/env python3
"""Deterministic post-processing filters for digital-graphic image treatments.

FLUX renders a clean photograph; this turns it into pixel-art / halftone / ascii /
blueprint reliably (the model itself cannot). Called by the engine's post-process
stage (engine/image-postprocess.ts).

Usage: python3 image-filters.py <filter> <in_path> <out_path>
  filter ∈ pixel-art | halftone | ascii | blueprint
"""
import sys
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageFilter

FONT_CANDIDATES = [
    "/System/Library/Fonts/Menlo.ttc",
    "/System/Library/Fonts/Monaco.ttf",
    "/Library/Fonts/Courier New.ttf",
]


def _load_font(size):
    for p in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def pixel_art(img, px=128, colors=24):
    W, H = img.size
    small = img.resize((px, max(1, int(px * H / W))), Image.BILINEAR)
    small = small.quantize(colors=colors, method=Image.FASTOCTREE).convert("RGB")
    return small.resize((W, H), Image.NEAREST)


def halftone(img, sample=9, scale=4, angles=(15, 75, 0, 45)):
    W, H = img.size
    cmyk = img.convert("CMYK")
    out_chans = []
    for ch, ang in zip(cmyk.split(), angles):
        ch = ch.rotate(ang, expand=1)
        sw, sh = ch.size
        half = Image.new("L", (sw * scale, sh * scale), 0)
        d = ImageDraw.Draw(half)
        data = ch.load()
        for x in range(0, sw, sample):
            for y in range(0, sh, sample):
                tot = n = 0
                for xx in range(x, min(x + sample, sw)):
                    for yy in range(y, min(y + sample, sh)):
                        tot += data[xx, yy]
                        n += 1
                mean = tot / max(1, n)
                r = (mean / 255) * (sample * scale * 1.2) / 2
                cx, cy = (x + sample / 2) * scale, (y + sample / 2) * scale
                d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=255)
        half = half.resize((sw, sh), Image.LANCZOS).rotate(-ang, expand=1)
        wd, hd = half.size
        half = half.crop(((wd - W) // 2, (hd - H) // 2, (wd - W) // 2 + W, (hd - H) // 2 + H))
        out_chans.append(half)
    return Image.merge("CMYK", out_chans).convert("RGB")


def ascii_art(img, cols=128):
    W, H = img.size
    chars = " .:-=+*#%@"
    gray = ImageOps.autocontrast(ImageOps.grayscale(img))
    cw = W / cols
    ch = cw * 1.6
    rows = max(1, int(H / ch))
    g = gray.resize((cols, rows))
    canvas = Image.new("RGB", (W, H), (8, 10, 12))
    d = ImageDraw.Draw(canvas)
    font = _load_font(int(ch))
    px = g.load()
    for y in range(rows):
        for x in range(cols):
            v = px[x, y]
            c = chars[v * (len(chars) - 1) // 255]
            if c != " ":
                shade = 90 + v * 0.5
                d.text((x * cw, y * ch), c, fill=(int(shade * 0.5), int(shade), int(shade * 0.55)), font=font)
    return canvas


def blueprint(img):
    W, H = img.size
    gray = ImageOps.autocontrast(ImageOps.grayscale(img))
    edges = gray.filter(ImageFilter.FIND_EDGES).filter(ImageFilter.MaxFilter(3))
    edges = ImageOps.autocontrast(edges)
    bg = Image.new("RGB", (W, H), (10, 38, 92))
    out = bg.copy()
    d = ImageDraw.Draw(out)
    step = 48
    for x in range(0, W, step):
        d.line([(x, 0), (x, H)], fill=(40, 70, 130), width=1)
    for y in range(0, H, step):
        d.line([(0, y), (W, y)], fill=(40, 70, 130), width=1)
    # paint white linework where edges are strong
    lines = Image.new("RGB", (W, H), (210, 228, 255))
    out = Image.composite(lines, out, edges)
    return out


FILTERS = {
    "pixel-art": pixel_art,
    "halftone": halftone,
    "ascii": ascii_art,
    "blueprint": blueprint,
}


def main():
    if len(sys.argv) != 4:
        print("Usage: image-filters.py <filter> <in> <out>", file=sys.stderr)
        sys.exit(2)
    name, src, dst = sys.argv[1], sys.argv[2], sys.argv[3]
    if name not in FILTERS:
        print(f"unknown filter: {name}", file=sys.stderr)
        sys.exit(2)
    img = Image.open(src).convert("RGB")
    FILTERS[name](img).save(dst, "JPEG", quality=92)


if __name__ == "__main__":
    main()
