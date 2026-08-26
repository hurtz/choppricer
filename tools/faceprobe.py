#!/usr/bin/env python3
"""Per-pixel shelf-face chroma over a DECLARED region, scale-matched.

Both photograph and render are resampled to a common 1280 px width in linear
light first, so a pixel is the same solid angle in each.  The region is given
as fractions of the frame and an evidence crop is written for every call, so
the thing being measured can be looked at rather than trusted — the
AGENTS_BRIEF failure mode where two "objective" ceiling metrics disagreed
because one crop was 60% promo signage.

Reports median C*, median L* and the ratio C*/(L* + 16).

THE DENOMINATOR IS +16 AND THAT IS NOT A DETAIL.  This tool used to claim that
"scaling linear RGB by a neutral k moves L* and C* together (both ~k^(1/3)),
so C*/L* is invariant under exposure".  That claim is FALSE and it cost round
12 its headline.  L* = 116 * f - 16, so under a neutral scale it is (L* + 16)
that scales, not L*.  Measured on one unchanged frame under a pure neutral
linear scale:

    C*/L*        0.417 -> 0.396 -> 0.376     (-10% per stop)
    C*/(L*+16)   0.297 -> 0.298 -> 0.297     (holds)

Round 13 re-confirmed it end to end on the live page: the four store lights
scaled x1.17 / x1.25 / x1.35 move the whole-frame median L* 51.6 -> 54.1 ->
55.2 -> 56.4 while the product mask's C*/(L*+16) reads 0.322 at every one of
the four.  So the corrected ratio really is the exposure-invariant one, and
what it says about this render is that no lighting change moves product chroma
per unit lightness by one part in a thousand -- only the print does.

Under a NEUTRAL illuminant the C*/(L*+16) of a lit diffuse surface equals its
albedo's, which is what makes a lit photograph and a render albedo directly
comparable on this number.  The render's illuminant is deliberately neutral
(see the round-5 note in ../src/store.js), so that comparison is legitimate
here; it would not be under a coloured one.
"""
import sys, os, argparse
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chroma import load_linear, linear_to_lab, linear_to_srgb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('specs', nargs='+',
                    help='path:x0,y0,x1,y1  (fractions; omit rect for whole frame)')
    ap.add_argument('--jpeg', type=int, default=None)
    ap.add_argument('--dump', default=None, help='dir for evidence crops')
    args = ap.parse_args()
    print(f"{'region':58s} {'C*':>7s} {'L*':>6s} {'C/(L+16)':>8s} {'>C34%':>6s} {'p90C*':>6s}")
    print('-' * 96)
    for sp in args.specs:
        if ':' in sp and sp.rsplit(':', 1)[1].count(',') == 3:
            path, rect = sp.rsplit(':', 1)
            x0, y0, x1, y1 = (float(v) for v in rect.split(','))
        else:
            path, (x0, y0, x1, y1) = sp, (0.0, 0.0, 1.0, 1.0)
        lin = load_linear(path, args.jpeg)
        h, w, _ = lin.shape
        sub = lin[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
        lab = linear_to_lab(sub.reshape(-1, 3))
        C = np.hypot(lab[:, 1], lab[:, 2]); L = lab[:, 0]
        mc, ml = float(np.median(C)), float(np.median(L))
        tag = f'{os.path.basename(path)[:38]} [{x0:.2f},{y0:.2f},{x1:.2f},{y1:.2f}]'
        print(f'{tag:58s} {mc:7.2f} {ml:6.1f} {float(np.median(C / (L + 16))):8.3f} '
              f'{100*(C>34).mean():6.1f} {np.percentile(C,90):6.1f}')
        if args.dump:
            os.makedirs(args.dump, exist_ok=True)
            out = (linear_to_srgb(sub) * 255).astype(np.uint8)
            n = os.path.basename(path).rsplit('.', 1)[0][:30]
            Image.fromarray(out).save(
                os.path.join(args.dump, f'{n}_{x0:.2f}_{y0:.2f}.png'))


if __name__ == '__main__':
    main()
