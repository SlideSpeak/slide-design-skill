#!/usr/bin/env python3
"""Screenshot decks per-slide + build a contact sheet for visual review.
Usage: shoot-review.py <deck-html-basename-without-ext> <slide-count>
Outputs to /tmp/ss-review/<name>/slide-NN.png and /tmp/ss-review/<name>-contact.png
"""
import subprocess, sys, math
from pathlib import Path
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
REPO = Path(__file__).resolve().parent.parent
name, n = sys.argv[1], int(sys.argv[2])
HTML = REPO / "scripts" / f"{name}.html"
OUT = Path("/tmp/ss-review") / name
OUT.mkdir(parents=True, exist_ok=True)
SLIDE_W, SLIDE_H, STRIDE = 1920, 1080, 1104
FULL_H = n * STRIDE
BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
FULL = OUT / "_full.png"

cmd = [BRAVE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
       "--force-device-scale-factor=1",
       f"--window-size={SLIDE_W},{FULL_H}",
       "--virtual-time-budget=40000",
       f"--screenshot={FULL}", HTML.as_uri()]
print(f"shooting {name} ({n} slides)...")
subprocess.run(cmd, check=True, capture_output=True)
img = Image.open(FULL).convert("RGB")
print("  full:", img.size)

slides = []
for i in range(n):
    top = i * STRIDE
    crop = img.crop((0, top, SLIDE_W, top + SLIDE_H))
    p = OUT / f"slide-{i+1:02d}.png"
    crop.save(p)
    slides.append(crop)

# contact sheet: 2 columns, thumbs at 760px wide
cols = 2
tw = 760
th = int(tw * SLIDE_H / SLIDE_W)
rows = math.ceil(n / cols)
pad = 16
sheet = Image.new("RGB", (cols * tw + (cols + 1) * pad, rows * th + (rows + 1) * pad), (40, 40, 40))
for i, s in enumerate(slides):
    t = s.resize((tw, th))
    r, c = divmod(i, cols)
    x = pad + c * (tw + pad)
    y = pad + r * (th + pad)
    sheet.paste(t, (x, y))
contact = Path("/tmp/ss-review") / f"{name}-contact.png"
sheet.save(contact)
print("  contact:", contact, sheet.size)
FULL.unlink(missing_ok=True)
