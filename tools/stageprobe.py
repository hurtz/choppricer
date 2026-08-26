#!/usr/bin/env python3
"""Read the round-12 stage ladder off disk and print the chroma-per-stage table.

The region is DECLARED, not assumed: shot `*_s7.png` renders every package
fragment flat green (0,255,0) and nothing else in the store can produce that,
so the product-facing mask is exact rather than a hand-drawn rectangle.
`--dump` writes the mask as evidence so it can be checked.
"""
import sys, os, argparse
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chroma import srgb_to_linear, linear_to_lab, linear_to_srgb

STAGES = {
    1: 'vColor  (per-instance brand swatch)',
    2: 'x ink-coverage mask  mix(white,vColor,mask.r)',
    3: '+ food-photo overlay',
    4: 'x print brightness   = FULL ALBEDO',
    5: 'x lighting (key+fill+ambient+hemi)  pre-AO',
    6: 'x AO + floor bounce  = pre-output-transform',
    0: 'FRAMEBUFFER (shipped)',
}


def lin(path):
    return srgb_to_linear(np.asarray(Image.open(path).convert('RGB'), np.float64) / 255.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('prefix')
    ap.add_argument('--dump', default=None)
    ap.add_argument('--minpx', type=int, default=2000)
    args = ap.parse_args()

    mp = f'{args.prefix}_s7.png'
    m8 = np.asarray(Image.open(mp).convert('RGB'))
    mask = (m8[:, :, 1] > 200) & (m8[:, :, 0] < 40) & (m8[:, :, 2] < 40)
    npx = int(mask.sum())
    print(f'product-facing mask: {npx} px = {100*npx/mask.size:.1f}% of frame   ({mp})')
    if args.dump:
        ev = np.asarray(Image.open(f'{args.prefix}_s0.png').convert('RGB')).copy()
        ev[~mask] = (ev[~mask] * 0.25).astype(np.uint8)
        Image.fromarray(ev).save(args.dump)
        print(f'mask evidence -> {args.dump}')
    if npx < args.minpx:
        print('MASK TOO SMALL — refusing to report'); return

    print()
    print(f"{'stage':52s} {'C*':>7s} {'L*':>6s} {'C*/L*':>6s} {'>C34%':>6s}  {'dC*':>7s}")
    print('-' * 92)
    prev = None
    for k in [1, 2, 3, 4, 5, 6, 0]:
        p = f'{args.prefix}_s{k}.png'
        if not os.path.exists(p):
            continue
        v = lin(p)[mask]
        lab = linear_to_lab(v)
        C = np.hypot(lab[:, 1], lab[:, 2])
        L = lab[:, 0]
        mc, ml = float(np.median(C)), float(np.median(L))
        d = '' if prev is None else f'{100*(mc-prev)/max(prev,1e-6):+6.1f}%'
        print(f'{k}. {STAGES[k]:49s} {mc:7.2f} {ml:6.1f} {mc/max(ml,1e-6):6.3f} '
              f'{100*(C>34).mean():6.1f}  {d:>7s}')
        prev = mc


if __name__ == '__main__':
    main()
