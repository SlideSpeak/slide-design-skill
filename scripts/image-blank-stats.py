#!/usr/bin/env python3
"""Report decode + uniformity stats for one image file, as JSON on stdout.
Used by engine/image-providers.ts to reject the flux/dev degenerate-frame failure
(a near-solid, often black ~32KB frame returned for some close-up bgPrompts) before
it ships into a deck. Pure read; never mutates.
Usage: image-blank-stats.py <imagePath>

Reasons on failure are distinguished so the caller can tell "PIL not installed"
(fall back to a size floor, do NOT reject the image) from "bytes don't decode"
(a genuinely corrupt/empty frame, reject it)."""
import sys, json, os

try:
    from PIL import Image, ImageStat
except Exception as e:  # PIL/Pillow unavailable in this environment
    print(json.dumps({"ok": False, "reason": "no-pil", "error": str(e)}))
    sys.exit(0)

try:
    p = sys.argv[1]
    im = Image.open(p).convert("RGB")
    st = ImageStat.Stat(im)
    std = sum(st.stddev) / len(st.stddev)
    mean = sum(st.mean) / len(st.mean)
    print(json.dumps({
        "ok": True,
        "w": im.size[0], "h": im.size[1],
        "std": round(std, 2), "meanLum": round(mean, 2),
        "bytes": os.path.getsize(p),
    }))
except Exception as e:
    print(json.dumps({"ok": False, "reason": "decode-fail", "error": str(e)}))
