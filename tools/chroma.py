#!/usr/bin/env python3
"""Block-chroma instrument for CHOP PRICER (builder-store round 12).

DEFINITION, stated so it can be checked rather than trusted:
  * every image is resized (Lanczos, in LINEAR light) to a common width W=1280
    so a "block" is the same fraction of the frame in a 1280 render and a 1920
    photograph.  block = 5% of image width = 64 px.
  * a block's colour is the mean of its pixels IN LINEAR LIGHT, then converted
    sRGB -> XYZ(D65) -> CIE Lab.  --srgbmean switches to averaging the 8-bit
    sRGB values instead, as a robustness check on that choice.
  * reported: median block C*, % of blocks with C* > 34, and the median C*
    inside each L* bin.
  * --jpeg N re-encodes the image at quality N first, so a PNG render and a
    JPEG photograph are carrying the same chroma subsampling / ringing.
  * --mask lets a measurement be confined to a named rectangle so the region
    doing the work is declared.  --dump writes the block image as evidence.
"""
import argparse, io, os, sys
import numpy as np
from PIL import Image

BLOCK_FRAC = 0.05
COMMON_W = 1280


def srgb_to_linear(a):
    a = np.asarray(a, dtype=np.float64)
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(a):
    a = np.clip(np.asarray(a, dtype=np.float64), 0.0, 1.0)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


M_RGB2XYZ = np.array([
    [0.4123907993, 0.3575843394, 0.1804807884],
    [0.2126390059, 0.7151686788, 0.0721923154],
    [0.0193308187, 0.1191947798, 0.9505321522],
])
WHITE = np.array([0.9504559271, 1.0, 1.0890577508])


def linear_to_lab(lin):
    """lin: (...,3) linear-sRGB in 0..1 -> (...,3) L*a*b*"""
    xyz = lin @ M_RGB2XYZ.T
    t = xyz / WHITE
    d = 6.0 / 29.0
    f = np.where(t > d ** 3, np.cbrt(np.clip(t, 1e-12, None)),
                 t / (3 * d * d) + 4.0 / 29.0)
    L = 116 * f[..., 1] - 16
    a = 500 * (f[..., 0] - f[..., 1])
    b = 200 * (f[..., 1] - f[..., 2])
    return np.stack([L, a, b], axis=-1)


def load_linear(path, jpeg=None, crop=None):
    im = Image.open(path).convert('RGB')
    if jpeg:
        buf = io.BytesIO()
        im.save(buf, 'JPEG', quality=jpeg, subsampling=2)
        buf.seek(0)
        im = Image.open(buf).convert('RGB')
    if crop:
        x0, y0, x1, y1 = crop
        w, h = im.size
        im = im.crop((int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h)))
    a = np.asarray(im, dtype=np.float64) / 255.0
    lin = srgb_to_linear(a)
    # resample in linear light to the common width
    w, h = im.size
    if w != COMMON_W:
        nh = max(1, round(h * COMMON_W / w))
        tmp = Image.fromarray((np.clip(lin, 0, 1) * 65535).astype(np.uint16).reshape(h, w, 3)[:, :, 0])
        # per-channel 16-bit resize keeps linear precision
        out = []
        for c in range(3):
            ch = Image.fromarray((np.clip(lin[:, :, c], 0, 1) * 65535).astype(np.uint16), mode='I;16')
            out.append(np.asarray(ch.resize((COMMON_W, nh), Image.LANCZOS), dtype=np.float64) / 65535.0)
        lin = np.clip(np.stack(out, axis=-1), 0, 1)
    return lin


def blocks(lin, srgbmean=False):
    h, w, _ = lin.shape
    b = max(2, int(round(w * BLOCK_FRAC)))
    ny, nx = h // b, w // b
    cut = lin[:ny * b, :nx * b]
    if srgbmean:
        s = linear_to_srgb(cut)
        m = s.reshape(ny, b, nx, b, 3).mean(axis=(1, 3))
        m = srgb_to_linear(m)
    else:
        m = cut.reshape(ny, b, nx, b, 3).mean(axis=(1, 3))
    return m, b


LBINS = [(20, 35), (35, 50), (50, 65), (65, 80), (80, 95)]


def stats(lab):
    L = lab[..., 0].ravel()
    C = np.hypot(lab[..., 1], lab[..., 2]).ravel()
    out = {
        'n': int(C.size),
        'medC': float(np.median(C)),
        'meanC': float(C.mean()),
        'pctC34': 100.0 * float((C > 34).mean()),
        'medL': float(np.median(L)),
    }
    prof = []
    for lo, hi in LBINS:
        sel = (L >= lo) & (L < hi)
        prof.append((lo, hi, int(sel.sum()),
                     float(np.median(C[sel])) if sel.sum() >= 4 else float('nan')))
    out['prof'] = prof
    return out


def fmt(name, s):
    p = ' '.join(f'{lo}-{hi}:{c:5.1f}({n:4d})' if n >= 4 else f'{lo}-{hi}:  -- '
                 for lo, hi, n, c in s['prof'])
    return (f"{name:52s} medC*{s['medC']:6.2f}  >C34 {s['pctC34']:5.1f}%  "
            f"medL*{s['medL']:5.1f}  n={s['n']:4d}  | {p}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--jpeg', type=int, default=None)
    ap.add_argument('--srgbmean', action='store_true')
    ap.add_argument('--crop', type=float, nargs=4, default=None,
                    help='x0 y0 x1 y1 as fractions of the frame')
    ap.add_argument('--dump', default=None, help='dir to write block-image evidence')
    ap.add_argument('--csv', default=None)
    args = ap.parse_args()
    rows = []
    for p in args.paths:
        lin = load_linear(p, args.jpeg, args.crop)
        m, b = blocks(lin, args.srgbmean)
        lab = linear_to_lab(m)
        s = stats(lab)
        rows.append((os.path.basename(p), s))
        print(fmt(os.path.basename(p)[:52], s))
        if args.dump:
            os.makedirs(args.dump, exist_ok=True)
            img = (linear_to_srgb(m) * 255).astype(np.uint8)
            Image.fromarray(img).resize((m.shape[1] * 8, m.shape[0] * 8), Image.NEAREST).save(
                os.path.join(args.dump, os.path.basename(p).rsplit('.', 1)[0] + '_blocks.png'))
    if args.csv:
        with open(args.csv, 'w') as f:
            f.write('file,medC,pctC34,medL\n')
            for n, s in rows:
                f.write(f"{n},{s['medC']:.3f},{s['pctC34']:.3f},{s['medL']:.3f}\n")


if __name__ == '__main__':
    main()
