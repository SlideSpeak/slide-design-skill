#!/usr/bin/env python3
"""Build a labelled contact sheet from the image-showcase PNGs.
Output: ~/Desktop/SlideSpeak-Image-Showcase/_Overview.png"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path.home() / "Desktop" / "SlideSpeak-Image-Showcase"
imgs = sorted(p for p in OUT.glob("*.png") if not p.name.startswith("_"))

def font(sz):
    for f in ["/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc",
              "/Library/Fonts/Arial.ttf"]:
        if Path(f).exists():
            try: return ImageFont.truetype(f, sz)
            except Exception: pass
    return ImageFont.load_default()

cols = 3
tw, th = 620, 424          # thumb
lab = 46                   # label strip
pad = 28
rows = (len(imgs) + cols - 1) // cols
W = cols * tw + (cols + 1) * pad
Hh = rows * (th + lab) + (rows + 1) * pad
sheet = Image.new("RGB", (W, Hh), (244, 244, 242))
d = ImageDraw.Draw(sheet)
f = font(26)

for i, p in enumerate(imgs):
    r, c = divmod(i, cols)
    x = pad + c * (tw + pad)
    y = pad + r * (th + lab + pad)
    im = Image.open(p).convert("RGB").resize((tw, th))
    sheet.paste(im, (x, y))
    label = p.stem.split("-", 1)[1].replace("-", " ")
    d.rectangle([x, y + th, x + tw, y + th + lab], fill=(20, 22, 24))
    d.text((x + 14, y + th + 10), label, fill=(236, 238, 242), font=f)

over = OUT / "_Overview.png"
sheet.save(over)
print("wrote", over, sheet.size)
