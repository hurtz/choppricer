#!/usr/bin/env python3
"""COLUMN CHROMA ECHO -- does the floor carry the colour of what stands on it?

WHY THIS SHAPE, given what is retired.

r29's within-image paired hue transfer is retired: unstable to hand box
placement, blind to low-chroma objects, and it gated out 2 of 5 photo cases with
one wrong-signed.  r29's vertical mirror correlation is retired for a different
reason: it scanned for its own best alignment and therefore overfitted, reading
+0.421 on a photograph against +0.412 on a render.

The geometry removes both problems without a replacement heuristic.  For a
MIRROR IN A HORIZONTAL PLANE and a camera with no roll, a point and its mirror
image lie in the same vertical plane through the camera centre, so they land in
THE SAME IMAGE COLUMN.  Exactly.  No alignment to scan for and no box to place:

  * two GEOMETRIC row bands with a gap between them -- an upper band that is
    whatever is standing up, a lower band that is whatever it is standing on;
  * per column bin, the mean CHROMA VECTOR (a*, b*) of each band, each centred
    across bins so a global cast contributes nothing;
  * the statistic is the cosine between those two centred fields:

        rho = sum_k (u_k . f_k) / sqrt( sum_k |u_k|^2 * sum_k |f_k|^2 )

    +1 = the floor's colour varies across the frame exactly as the objects above
    it do; 0 = the floor's colour has nothing to do with them.

It cannot be answered by position, by a global gradient, or by overall
saturation, and low-chroma objects contribute in proportion to how chromatic
they are rather than being gated out.

WHAT IT CANNOT SEPARATE, stated up front: an object tall enough to reach into
the lower band raises rho with no mirror involved.  That is why the gap exists,
why the profile over gap sizes is printed, and why the render's two arms -- which
carry the identical geometry and differ only in shader uniforms -- are the
controlled comparison.  The photographs give the level to reach, not a null.

Both classes go through the same encoder at the same quality in the reference
set's own 4:2:0, because chroma is the subject and 4:2:0 is a chroma operation.

USAGE  python3 tools/r30_colecho.py [image ...]      (no args: references only)
"""
import io
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference')
W, H = 1280, 720
QUALITY = 88
BIN = 32                       # 40 column bins across the frame
UP = (0.22, 0.60)              # the band things stand in
LO = (0.68, 1.00)              # the band they stand on
GAPS = [0.00, 0.04, 0.08]      # extra separation, as a fraction of H


def fit(im):
    im = im.convert('RGB')
    if im.width != W:
        im = im.resize((W, max(1, round(im.height * W / im.width))), Image.LANCZOS)
    if im.height < H:
        return im.resize((W, H), Image.LANCZOS)
    top = (im.height - H) // 2
    return im.crop((0, top, W, top + H))


def codec(im):
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=QUALITY, subsampling='4:2:0')
    b.seek(0)
    return Image.open(b).convert('RGB')


def ab(im):
    a = np.asarray(im, float) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    M = np.array([[0.4124, 0.3576, 0.1805],
                  [0.2126, 0.7152, 0.0722],
                  [0.0193, 0.1192, 0.9505]])
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), xyz * 7.787 + 16 / 116)
    return np.dstack([500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])])


def rho(A, gap):
    y0, y1 = int(H * UP[0]), int(H * (UP[1] - gap))
    y2, y3 = int(H * (LO[0] + gap)), int(H * LO[1])
    nb = W // BIN
    u = np.array([A[y0:y1, k * BIN:(k + 1) * BIN].reshape(-1, 2).mean(0)
                  for k in range(nb)])
    f = np.array([A[y2:y3, k * BIN:(k + 1) * BIN].reshape(-1, 2).mean(0)
                  for k in range(nb)])
    u = u - u.mean(0)
    f = f - f.mean(0)
    den = np.sqrt((u * u).sum() * (f * f).sum())
    return 0.0 if den <= 0 else float((u * f).sum() / den)


def measure(path):
    A = ab(codec(fit(Image.open(path))))
    return [round(rho(A, g), 3) for g in GAPS]


def main():
    print('rho at gaps %s   bands up %s lo %s   bin %dpx   q%d 4:2:0'
          % (GAPS, UP, LO, BIN, QUALITY))
    ref = []
    for p in sorted(os.listdir(REF)):
        if p == 'CREDITS.md':
            continue
        try:
            r = measure(os.path.join(REF, p))
        except Exception:
            continue
        ref.append(r)
        print('%-46s %s' % (p[:46], r))
    a = np.array(ref)
    print('REFERENCE n=%d  mean %s  min %s  max %s'
          % (len(a), np.round(a.mean(0), 3), np.round(a.min(0), 3),
             np.round(a.max(0), 3)))
    for f in sys.argv[1:]:
        print('%-46s %s' % (os.path.basename(f)[:46], measure(f)))


if __name__ == '__main__':
    main()


# ---------------------------------------------------------------------------
# EFFECTIVE SPECULAR REFLECTANCE, off the same column geometry.
#
# A floor point's radiance is its own diffuse plus R times the radiance of
# whatever it mirrors, and for a horizontal mirror the thing it mirrors is in
# the SAME image column. So across column bins
#
#     Y_floor(k) = Y_diffuse + R * Y_object(k)
#
# and R is the ordinary least-squares slope of the lower band's LINEAR
# luminance on the upper band's. It is an effective reflectance -- lobe width,
# fresnel over the band's range of angles and the diffuse's own column-to-column
# variation are all folded into it -- which is the point: it is what a viewer
# sees, measured the same way on a photograph and on a render.
#
# Linear, never sRGB: a slope taken through a gamma curve is not a reflectance.
def refl_slope(im, gap=0.04):
    a = np.asarray(im, float) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    Y = lin @ np.array([0.2126, 0.7152, 0.0722])
    y0, y1 = int(H * UP[0]), int(H * (UP[1] - gap))
    y2, y3 = int(H * (LO[0] + gap)), int(H * LO[1])
    nb = W // BIN
    u = np.array([Y[y0:y1, k * BIN:(k + 1) * BIN].mean() for k in range(nb)])
    f = np.array([Y[y2:y3, k * BIN:(k + 1) * BIN].mean() for k in range(nb)])
    uu = u - u.mean()
    ff = f - f.mean()
    den = (uu * uu).sum()
    if den <= 0:
        return 0.0, 0.0
    R = float((uu * ff).sum() / den)
    r = float((uu * ff).sum() / np.sqrt(den * (ff * ff).sum())) if (ff * ff).sum() > 0 else 0.0
    return round(R, 3), round(r, 3)
