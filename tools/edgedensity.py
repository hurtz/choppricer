#!/usr/bin/env python3
"""High-frequency edge density — cheap automated proxy for 'micro-detail'.

Found by the round-2 blind critic: renders clustered at 36.4-36.9%, real
supermarket photos at 44.5-65%. One number separated the sets perfectly.
Use it as a regression gate: a render batch under ~40% is still missing
micro-detail no matter how good the packaging looks.

  python3 tools/edgedensity.py shots/b2_*.png reference/store_0*.jpg
  python3 tools/edgedensity.py --gate 40 shots/b3_*.png
"""
import sys, numpy as np
from PIL import Image

def density(path, size=(1024, 576), thresh=12.0):
    im = Image.open(path).convert("L")
    w, h = im.size
    tw = size[0] / size[1]
    if w / h > tw:                      # center-crop to 16:9 so framing can't skew it
        nw = int(h * tw); im = im.crop(((w - nw) // 2, 0, (w + nw) // 2, h))
    else:
        nh = int(w / tw); im = im.crop((0, (h - nh) // 2, w, (h + nh) // 2))
    a = np.asarray(im.resize(size, Image.LANCZOS), dtype=np.float32)
    gx = np.abs(np.diff(a, axis=1))[:-1, :]
    gy = np.abs(np.diff(a, axis=0))[:, :-1]
    return float((np.hypot(gx, gy) > thresh).mean() * 100.0)

gate, args, skip = None, [], False
for i, a in enumerate(sys.argv[1:], 1):
    if skip: skip = False; continue
    if a == "--gate": gate = float(sys.argv[i + 1]); skip = True
    elif not a.startswith("--"): args.append(a)

rows = []
for p in args:
    try: rows.append((density(p), p))
    except Exception as e: print(f"  ????  {p}  ({e})")
rows.sort()
for d, p in rows:
    flag = ""
    if gate is not None: flag = "  FAIL" if d < gate else "  pass"
    print(f"  {d:5.1f}%  {p}{flag}")
if rows:
    vals = [d for d, _ in rows]
    print(f"\n  n={len(vals)}  min {min(vals):.1f}%  max {max(vals):.1f}%  mean {sum(vals)/len(vals):.1f}%")
if gate is not None and rows and min(d for d, _ in rows) < gate:
    sys.exit(1)
