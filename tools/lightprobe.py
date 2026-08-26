#!/usr/bin/env python3
"""Where does the light on a shelf FACE come from?  (builder-store round 13)

Round 12 measured that the render's product pixels sit 12.3 L* below their own
frame median where photographs sit +1.4, and the critic showed a x2.0 scale of
all four store lights closes most of it.  x2.0 is not a fix -- whole-frame
median L* is already correct -- so the question this tool answers is WHICH light
a vertical gondola face is actually collecting, and how that split differs from
the horizontal surfaces in the same frame.

METHOD.  Every input is one capture off ONE page load with a uniform-only
ablation (a light intensity or a field uniform), so the scene, the geometry and
every program are byte-identical between rows -- `base` and `base2` md5 the same.
The renderer runs NoToneMapping into an sRGB framebuffer, so decoding sRGB gives
linear radiance directly and light contributions subtract exactly, except where
a pixel clips at 1.0 (reported as `clip%`).

TWO REGION KINDS, both declared:
  * `--mask FILE` uses the pack.js stage-7 render (product facings flat green)
    as an exact per-pixel mask -- no hand-drawn rectangle.
  * `--rect x0,y0,x1,y1:NAME` declares a rectangle in frame fractions.
Every region writes an evidence crop with --dump so it can be checked.

SHADING FACTOR.  With an albedo capture (stage 4) the tool divides it out:
    shade = final_linear / albedo_linear   =   E/pi * AO   +   bounce/albedo
which is what "how much light reached this surface" means independent of what
colour the packaging is printed.  That is the number the round-13 gap is about.
"""
import argparse, os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chroma import srgb_to_linear, linear_to_srgb, linear_to_lab

LUMW = np.array([0.2126390059, 0.7151686788, 0.0721923154])


def lin(path):
    return srgb_to_linear(np.asarray(Image.open(path).convert('RGB'), np.float64) / 255.0)


def load_mask(path):
    m8 = np.asarray(Image.open(path).convert('RGB'))
    return (m8[:, :, 1] > 200) & (m8[:, :, 0] < 40) & (m8[:, :, 2] < 40)


def rect_mask(shape, r):
    x0, y0, x1, y1 = r
    h, w = shape[:2]
    m = np.zeros((h, w), bool)
    m[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)] = True
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('prefix', help='e.g. shots/r13d  -> shots/r13d_<tag>_<pose>.png')
    ap.add_argument('--pose', default='A')
    ap.add_argument('--tags', default='base,noamb,nohemi,nokey,nofill,nobnc,noao,x2all')
    ap.add_argument('--albedo', default='s4')
    ap.add_argument('--mask', default='s7')
    ap.add_argument('--rect', action='append', default=[],
                    help='x0,y0,x1,y1:NAME  extra declared region')
    ap.add_argument('--dump', default=None)
    args = ap.parse_args()

    p = lambda t: f'{args.prefix}_{t}_{args.pose}.png'
    base = lin(p('base'))
    mask = load_mask(p(args.mask))
    alb = lin(p(args.albedo))

    regions = [('product facings (stage-7 mask)', mask, alb)]
    for spec in args.rect:
        r, name = spec.rsplit(':', 1)
        regions.append((name, rect_mask(base.shape, [float(v) for v in r.split(',')]), None))

    if args.dump:
        os.makedirs(args.dump, exist_ok=True)
        for name, m, _ in regions:
            ev = (linear_to_srgb(base) * 255).astype(np.uint8).copy()
            ev[~m] = (ev[~m] * 0.22).astype(np.uint8)
            fn = name.split()[0].replace('/', '_')
            Image.fromarray(ev).save(os.path.join(args.dump, f'region_{fn}.png'))

    tags = args.tags.split(',')
    frames = {t: lin(p(t)) for t in tags if os.path.exists(p(t))}

    for name, m, albm in regions:
        n = int(m.sum())
        print(f'\n=== {name}   n={n} px = {100*n/m.size:.1f}% of frame ===')
        bY = (base[m] @ LUMW)
        clip = 100.0 * float((base[m] >= 254.5 / 255.0).any(axis=-1).mean())
        print(f'{"row":26s} {"medY":>8s} {"medL*":>7s} {"share of base Y":>17s}')
        print('-' * 64)
        b_med = float(np.median(bY))
        for t in tags:
            if t not in frames:
                continue
            fY = (frames[t][m] @ LUMW)
            lab = linear_to_lab(frames[t][m])
            share = ''
            if t.startswith('no'):
                d = np.median(bY - fY)
                share = f'{100*d/max(b_med,1e-9):+9.1f}%'
            elif t == 'x2all':
                share = f'{np.median(fY)/max(b_med,1e-9):9.2f}x'
            print(f'{t:26s} {np.median(fY):8.4f} {np.median(lab[:,0]):7.2f} {share:>17s}')
        print(f'clipped pixels: {clip:.2f}%')

        if albm is not None:
            aY = (albm[m] @ LUMW)
            ok = aY > 0.01
            print(f'\n  albedo medY {np.median(aY):.4f}  '
                  f'medL* {np.median(linear_to_lab(albm[m])[:,0]):.2f}')
            print(f'  {"row":24s} {"shade = final/albedo":>22s}')
            for t in tags:
                if t not in frames:
                    continue
                sh = (frames[t][m] @ LUMW)[ok] / aY[ok]
                print(f'  {t:24s} {np.median(sh):22.4f}')


if __name__ == '__main__':
    main()
