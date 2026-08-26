#!/usr/bin/env python3
"""THE CHROMATIC BODY. One rule, both sides. builder-store round 14.

THE RULE, stated once and applied identically to render and photograph:

    chromatic pixel  ==  C* > 20
    whole frame, no mask, no crop, native resolution unless --width says otherwise

and every L* statistic below is over THAT POPULATION, not over the frame:

    %chr     percentage of ALL frame pixels that are chromatic
    p25 / med / p75 / p95     L* percentiles of the chromatic pixels
    IQR      p75 - p25
    %>80     percentage of the CHROMATIC pixels with L* > 80

The population definition is the whole point.  Round 13 filed a headline
("the product wall has no bright end") using the product mask on the render
and the whole frame on the photograph, and overturned it itself.  This file
exists so that cannot happen again: there is no mask argument.  --region
exists only for looking at the render's own internals and it prints a loud
ASYMMETRIC banner when used.

INSTRUMENT CONTROLS, because none of these is free:

  --jpeg Q --sub S   re-encode through the reference set's own codec first.
                     Every reference file is a 1920-wide 4:2:0 JPEG; a render
                     is a 1280 PNG.  4:2:0 upsampling smears chroma ACROSS the
                     boundary between a saturated facing and the bright neutral
                     rail above it, which moves BOTH the chromatic fraction and
                     the lightness of the chromatic set.  Measure it, do not
                     assume it.
  --width W          resample (Lanczos, IN LINEAR LIGHT) to a common width.
                     AGENTS_BRIEF: a kernel choice has moved a published number
                     48x on this project.  The kernel is named in the output.
  --dump PATH        evidence image: chromatic pixels keyed by L* bin, the rest
                     dropped to grey.  Publish it with any number from here.

Reference glob hazard: reference/*.jpg is 12 of 14 files.  --refs uses an
explicit listdir and takes all 14.
"""
import argparse
import io
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chroma import srgb_to_linear, linear_to_srgb, linear_to_lab  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REFDIR = os.path.join(ROOT, 'reference')


def all_refs():
    """All 14, not the 12 that reference/*.jpg globs."""
    out = []
    for n in sorted(os.listdir(REFDIR)):
        if n.startswith('store_'):
            out.append(os.path.join(REFDIR, n))
    return out


def load_lab(path, jpeg=None, sub='4:2:0', width=None):
    im = Image.open(path).convert('RGB')
    if width and im.width != width:
        lin = srgb_to_linear(np.asarray(im, dtype=np.float64) / 255.0)
        h = int(round(im.height * width / im.width))
        f = Image.fromarray((np.clip(lin, 0, 1) * 65535).astype(np.uint16).reshape(
            im.height, im.width, 3)[:, :, 0])
        # resample each linear channel at 16 bit, Lanczos
        chans = []
        for c in range(3):
            ci = Image.fromarray((np.clip(lin[:, :, c], 0, 1) * 65535 + 0.5).astype(np.uint16))
            chans.append(np.asarray(ci.resize((width, h), Image.LANCZOS), dtype=np.float64) / 65535.0)
        lin = np.clip(np.stack(chans, axis=-1), 0.0, 1.0)
        im = Image.fromarray((linear_to_srgb(lin) * 255 + 0.5).astype(np.uint8))
    if jpeg:
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=jpeg, subsampling=sub)
        buf.seek(0)
        im = Image.open(buf).convert('RGB')
    a = np.asarray(im, dtype=np.float64) / 255.0
    return linear_to_lab(srgb_to_linear(a)), a


def stats(lab, cthr=20.0, region=None):
    L = lab[..., 0]
    C = np.hypot(lab[..., 1], lab[..., 2])
    if region:
        x0, y0, x1, y1 = region
        h, w = L.shape
        sl = (slice(int(y0 * h), int(y1 * h)), slice(int(x0 * w), int(x1 * w)))
        L, C = L[sl], C[sl]
    m = C > cthr
    n = m.sum()
    if n == 0:
        return None
    Lc = L[m]
    q = np.percentile(Lc, [25, 50, 75, 90, 95])
    return dict(
        pct=100.0 * n / L.size,
        p25=q[0], med=q[1], p75=q[2], p90=q[3], p95=q[4],
        iqr=q[2] - q[0],
        gt80=100.0 * (Lc > 80).mean(),
        medC=float(np.median(C[m])),
        p90C=float(np.percentile(C, 90)),
        frameMedL=float(np.median(L)),
        n=int(n),
    )


BINS = [(0, 30, (70, 70, 70)), (30, 45, (0, 60, 200)), (45, 60, (0, 170, 120)),
        (60, 75, (240, 170, 0)), (75, 200, (255, 40, 40))]


def dump(lab, srgb, path, cthr=20.0):
    L = lab[..., 0]
    C = np.hypot(lab[..., 1], lab[..., 2])
    g = (0.30 + 0.35 * (L / 100.0))[..., None] * np.ones(3)
    out = (g * 255).astype(np.uint8)
    for lo, hi, col in BINS:
        m = (C > cthr) & (L >= lo) & (L < hi)
        out[m] = col
    Image.fromarray(out).save(path)


LBINS = [0, 20, 30, 40, 50, 60, 70, 80, 101]
CBINS = [0, 10, 20, 30, 40, 60, 1000]


def joint(lab):
    """% of ALL frame pixels in each (L*, C*) cell. Symmetric: no mask, no crop."""
    L = lab[..., 0].ravel()
    C = np.hypot(lab[..., 1], lab[..., 2]).ravel()
    h, _, _ = np.histogram2d(L, C, bins=[LBINS, CBINS])
    return 100.0 * h / L.size


def hue_split(lab, cthr=20.0):
    """Chromatic pixels by hue octant, and their median L* in each."""
    L = lab[..., 0]
    a, b = lab[..., 1], lab[..., 2]
    C = np.hypot(a, b)
    m = C > cthr
    hh = (np.degrees(np.arctan2(b[m], a[m])) + 360.0) % 360.0
    Lm = L[m]
    out = {}
    names = [('R  0-45', 0, 45), ('O 45-75', 45, 75), ('Y 75-105', 75, 105),
             ('YG105-135', 105, 135), ('G135-195', 135, 195), ('C195-255', 195, 255),
             ('B255-315', 255, 315), ('M315-360', 315, 360)]
    for n, lo, hi in names:
        s = (hh >= lo) & (hh < hi)
        out[n] = (100.0 * s.sum() / max(1, L.size), float(np.median(Lm[s])) if s.any() else float('nan'))
    return out


def row(tag, s):
    return (f'{tag:<34s} {s["pct"]:6.2f}  {s["p25"]:6.2f} {s["med"]:6.2f} {s["p75"]:6.2f} '
            f'{s["p95"]:6.2f}  {s["iqr"]:5.2f} {s["gt80"]:6.2f}  {s["medC"]:5.1f} {s["p90C"]:5.1f}')


HDR = (f'{"":34s} {"%chr":>6s}  {"p25":>6s} {"med":>6s} {"p75":>6s} {"p95":>6s}  '
       f'{"IQR":>5s} {"%>80":>6s}  {"medC":>5s} {"p90C":>5s}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('files', nargs='*')
    ap.add_argument('--refs', action='store_true', help='all 14 reference files')
    ap.add_argument('--jpeg', type=int, default=None)
    ap.add_argument('--sub', default='4:2:0')
    ap.add_argument('--width', type=int, default=None)
    ap.add_argument('--cthr', type=float, default=20.0)
    ap.add_argument('--region', default=None, help='x0,y0,x1,y1 normalised — ASYMMETRIC, diagnosis only')
    ap.add_argument('--dump', default=None, help='directory for evidence images')
    ap.add_argument('--quiet', action='store_true')
    ap.add_argument('--joint', action='store_true', help='(L*,C*) joint histogram, %% of frame')
    ap.add_argument('--hue', action='store_true', help='chromatic pixels by hue octant')
    ap.add_argument('--npy', default=None, help='save the median joint grid here')
    a = ap.parse_args()

    files = list(a.files)
    if a.refs:
        files += all_refs()
    region = tuple(float(v) for v in a.region.split(',')) if a.region else None
    if region:
        print('!! ASYMMETRIC: --region masks one side only. Not for render-vs-photo.')

    print(f'rule C*>{a.cthr:g} whole frame, no mask'
          + (f' | jpeg q{a.jpeg} {a.sub}' if a.jpeg else '')
          + (f' | LANCZOS->{a.width}px in linear light' if a.width else ' | native res'))
    print(HDR)
    rows = []
    jj, hh = [], []
    for f in files:
        lab, srgb = load_lab(f, a.jpeg, a.sub, a.width)
        s = stats(lab, a.cthr, region)
        rows.append((os.path.basename(f), s))
        if a.joint or a.npy:
            jj.append(joint(lab))
        if a.hue:
            hh.append(hue_split(lab, a.cthr))
        if not a.quiet:
            print(row(os.path.basename(f)[:34], s))
        if a.dump:
            os.makedirs(a.dump, exist_ok=True)
            dump(lab, srgb, os.path.join(a.dump, os.path.basename(f).rsplit('.', 1)[0] + '_body.png'), a.cthr)
    if len(rows) > 1:
        print('-' * 110)
        for k in ('pct', 'p25', 'med', 'p75', 'p95', 'iqr', 'gt80', 'medC', 'p90C'):
            v = np.array([r[1][k] for r in rows])
            print(f'  {k:>5s}  median {np.median(v):7.2f}   [{v.min():7.2f} .. {v.max():7.2f}]   n={len(v)}')
    if jj:
        g = np.median(np.stack(jj), axis=0)
        if a.npy:
            np.save(a.npy, g)
        if a.joint:
            print('\n(L*,C*) JOINT — median over the set, % of ALL frame pixels')
            print(f'{"L*":>9s}' + ''.join(f'{f"C{CBINS[i]}-{CBINS[i+1]}":>9s}' for i in range(len(CBINS) - 1)))
            for i in range(len(LBINS) - 1):
                print(f'{f"{LBINS[i]}-{LBINS[i+1]}":>9s}' + ''.join(f'{g[i, j]:9.2f}' for j in range(g.shape[1])))
    if hh:
        print('\nHUE of chromatic pixels — median over the set: (% of frame, median L*)')
        for k in hh[0]:
            p = np.median([x[k][0] for x in hh])
            L = np.median([x[k][1] for x in hh])
            print(f'  {k:<10s} {p:6.2f}%   L* {L:6.2f}')


if __name__ == '__main__':
    main()
