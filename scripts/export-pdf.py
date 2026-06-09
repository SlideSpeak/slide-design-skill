#!/usr/bin/env python3
"""Export a rendered deck HTML to a clean PDF on the Desktop.
Usage: export-pdf.py <html-basename> <slide-count> <OutName>
Screenshot->crop->img2pdf (keeps scrims/gradients). Output:
  ~/Desktop/SlideSpeak-Decks-2026-06-08/<OutName>.pdf
"""
import subprocess, sys
from pathlib import Path
from PIL import Image
import img2pdf

Image.MAX_IMAGE_PIXELS = None
REPO = Path(__file__).resolve().parent.parent
name, n, outname = sys.argv[1], int(sys.argv[2]), sys.argv[3]
HTML = REPO / "scripts" / f"{name}.html"
OUT_DIR = Path.home() / "Desktop" / "SlideSpeak-Decks-2026-06-08"
SLIDES_DIR = OUT_DIR / f"{outname}-slides"
OUT_DIR.mkdir(parents=True, exist_ok=True)
SLIDES_DIR.mkdir(parents=True, exist_ok=True)

SLIDE_W, SLIDE_H, STRIDE = 1920, 1080, 1104
FULL_H = n * STRIDE
BRAVE = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
FULL = SLIDES_DIR / "_full.png"

# The deck HTML carries an on-screen drop-shadow + dark page bg for previewing.
# For a flat PDF those bleed a grey band into the next slide's crop, so strip
# every slide box-shadow and flatten the page to white before shooting.
raw = HTML.read_text()
raw = raw.replace("box-shadow: 0 8px 40px rgba(0,0,0,0.4);", "box-shadow: none;")
raw = raw.replace("background: #1a1a1a;", "background: #ffffff;")
raw += "\n<style>.slide{box-shadow:none !important;margin:0 0 24px !important;}body{background:#fff !important;}</style>"
CLEAN = SLIDES_DIR / "_clean.html"
CLEAN.write_text(raw)

cmd = [BRAVE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
       "--force-device-scale-factor=1",
       f"--window-size={SLIDE_W},{FULL_H}",
       "--virtual-time-budget=45000",
       f"--screenshot={FULL}", CLEAN.as_uri()]
print(f"shooting {name} ({n} slides)...")
subprocess.run(cmd, check=True, capture_output=True)
CLEAN.unlink(missing_ok=True)
img = Image.open(FULL).convert("RGB")
assert img.size == (SLIDE_W, FULL_H), f"unexpected {img.size}, expected {(SLIDE_W, FULL_H)}"

pages = []
for i in range(n):
    top = i * STRIDE
    crop = img.crop((0, top, SLIDE_W, top + SLIDE_H))
    p = SLIDES_DIR / f"slide-{i+1:02d}.png"
    crop.save(p)
    pages.append(str(p))

pdf_path = OUT_DIR / f"{outname}.pdf"
layout = img2pdf.get_layout_fun((img2pdf.in_to_pt(13.333), img2pdf.in_to_pt(7.5)))
with open(pdf_path, "wb") as f:
    f.write(img2pdf.convert(pages, layout_fun=layout))
FULL.unlink(missing_ok=True)
print("wrote", pdf_path)
