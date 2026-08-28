#!/usr/bin/env python3
"""Contact sheets for MOVEMENT. A gait cannot be judged in a still.

    python3 tools/movestrip.py OUT.png "LABEL:crop:f1.png,f2.png,..." ...

`crop` is x0,y0,x1,y1 in the 1280x720 probe frame, or `-` for a default body band.
"""
import sys
from PIL import Image, ImageDraw, ImageFont

DEF = (455, 195, 830, 720)
import os
CW = int(os.environ.get('CW', 200))

def load(p, crop):
    im = Image.open(p).convert('RGB').crop(crop)
    w, h = im.size
    return im.resize((CW, int(h * CW / w)), Image.LANCZOS)

def main():
    out = sys.argv[1]
    rows = []
    for spec in sys.argv[2:]:
        label, crop, files = spec.split(':', 2)
        c = DEF if crop == '-' else tuple(int(v) for v in crop.split(','))
        rows.append((label, [load(f, c) for f in files.split(',')]))
    cw, ch = rows[0][1][0].size
    pad, lab = 5, 25
    W = max(len(r[1]) for r in rows) * (cw + pad) + pad
    H = len(rows) * (ch + pad + lab) + pad
    sheet = Image.new('RGB', (W, H), (16, 16, 18))
    d = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Courier New Bold.ttf', 16)
    except Exception:
        font = ImageFont.load_default()
    y = pad
    for label, ims in rows:
        d.text((pad + 2, y + 4), label, fill=(240, 238, 230), font=font)
        y += lab
        x = pad
        for im in ims:
            sheet.paste(im, (x, y)); x += cw + pad
        y += ch + pad
    sheet.save(out)
    print(out, sheet.size)

main()
