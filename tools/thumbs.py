#!/usr/bin/env python3
"""Generate progress-page thumbnails.

The progress page renders every screenshot every round has ever filed. Those are
full-resolution 1280x720 PNGs — 1.5 MB each, ~98 MB for one page view — displayed
in a strip about 90 px wide. The page was unusable for exactly the pieces that had
done the most work, because they had the most history to load.

This writes a small JPEG next to each one. The page loads these; the lightbox
still opens the original PNG, so nothing is lost for actually judging a frame.

    python3 tools/thumbs.py          # only what is missing or stale
    python3 tools/thumbs.py --all    # rebuild everything

Idempotent and safe to run while agents are filing new shots.
"""
import json, os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATUS = os.path.join(ROOT, "progress", "status.json")
OUT = os.path.join(ROOT, "progress", "thumbs")
WIDTH = 480          # ~2x the widest the strip ever displays, so it stays crisp
QUALITY = 72

def main():
    force = "--all" in sys.argv
    os.makedirs(OUT, exist_ok=True)
    with open(STATUS) as fh:
        d = json.load(fh)

    seen, made, skipped, missing = set(), 0, 0, []
    for piece in d.get("pieces", {}).values():
        for shot in piece.get("shots", []):
            rel = shot["path"].replace("../", "", 1)
            src = os.path.join(ROOT, rel)
            name = os.path.splitext(os.path.basename(rel))[0] + ".jpg"
            if name in seen:
                continue
            seen.add(name)
            if not os.path.exists(src):
                missing.append(rel)
                continue
            dst = os.path.join(OUT, name)
            if not force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                skipped += 1
                continue
            try:
                im = Image.open(src)
                im = im.convert("RGB")
                w, h = im.size
                im = im.resize((WIDTH, max(1, round(h * WIDTH / w))), Image.LANCZOS)
                im.save(dst, "JPEG", quality=QUALITY, optimize=True)
                made += 1
            except Exception as e:
                missing.append(f"{rel} ({e})")

    tot = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)
              if f.endswith(".jpg"))
    print(f"thumbs: {made} built, {skipped} current, {len(seen)} total, {tot/1e6:.1f} MB")
    for m in missing:
        print(f"  MISSING {m}")

main()
