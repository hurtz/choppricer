#!/usr/bin/env python3
"""Assemble a contact sheet of gesture frames captured by agents.js's probe.

    python3 tools/strip.py OUT.png LABEL:f1.png,f2.png,... LABEL2:...

Crops each frame to the subject box, stacks a row per clip, and writes a
labelled sheet. Pure stdlib + PIL if present; falls back to a plain grid.
"""
import sys, os

from PIL import Image, ImageDraw, ImageFont

CROP = (330, 120, 950, 720)      # the subject, in the 1280x720 probe framing
CELL_W = 250

def load(path):
    im = Image.open(path).convert('RGB').crop(CROP)
    w, h = im.size
    return im.resize((CELL_W, int(h * CELL_W / w)), Image.LANCZOS)

def main():
    out = sys.argv[1]
    rows = []
    for spec in sys.argv[2:]:
        label, files = spec.split(':', 1)
        rows.append((label, [load(f) for f in files.split(',')]))
    cw, ch = rows[0][1][0].size
    pad, lab = 6, 30
    W = max(len(r[1]) for r in rows) * (cw + pad) + pad
    H = len(rows) * (ch + pad + lab) + pad
    sheet = Image.new('RGB', (W, H), (18, 18, 20))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Courier New Bold.ttf', 19)
    except Exception:
        font = ImageFont.load_default()
    y = pad
    for label, ims in rows:
        d.text((pad + 2, y + 5), label, fill=(235, 235, 225), font=font)
        y += lab
        x = pad
        for im in ims:
            sheet.paste(im, (x, y))
            x += cw + pad
        y += ch + pad
    sheet.save(out)
    print(out, sheet.size)

main()
