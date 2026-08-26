#!/usr/bin/env python3
"""builder-cctv r11: blown-highlight statistics over reference/, region-free.

Every number here is whole-frame or blob-based. No measuring boxes, no top-N%
bands -- AGENTS_BRIEF retired both, and this round's gap does not need them.

Threshold is Y >= 0.98 where Y is sRGB-DOMAIN 709 luma (the colour space is
stated because AGENTS_BRIEF records a 10x swing on an unstated one). That is the
same definition rounds 9, 10 and 11 used on the render, so the two are
comparable.

Resampling: AGENTS_BRIEF measured a 48x swing across four kernels on the wall's
142x80 tile, so every reduction here is reported under every kernel rather than
one. The floor view is 1280x720 and the references are 1920-wide, so the honest
comparison is "references reduced to 1280 wide", and the spread across kernels
is part of the answer.

reference/*.jpg globs 12 of 14 -- store_09 and store_11 have no extension. This
walks the directory instead.
"""
import sys, os, glob
import numpy as np
from PIL import Image
from scipy import ndimage

REF = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'reference')
KERNELS = {'LANCZOS': Image.LANCZOS, 'BOX': Image.BOX,
           'BILINEAR': Image.BILINEAR, 'NEAREST': Image.NEAREST}
BLOWN = 0.98


def files():
    out = []
    for p in sorted(os.listdir(REF)):
        if p.endswith('.md'):
            continue
        f = os.path.join(REF, p)
        try:
            Image.open(f).verify()
        except Exception:
            continue
        out.append(f)
    return out


def luma(im):
    a = np.asarray(im.convert('RGB'), dtype=np.float64) / 255.0
    return a[:, :, 0] * 0.2126 + a[:, :, 1] * 0.7152 + a[:, :, 2] * 0.0722


def stats(Y):
    m = Y >= BLOWN
    n = m.sum()
    H, W = Y.shape
    out = {'pct': 100.0 * n / m.size, 'n': int(n), 'w': W, 'h': H}
    if n == 0:
        out.update(top1frac=0.0, top10frac=0.0, nblob=0, ycen=float('nan'),
                   top10ycen=float('nan'))
        return out
    lab, k = ndimage.label(m, structure=np.ones((3, 3)))
    sizes = ndimage.sum(m, lab, range(1, k + 1))
    order = np.argsort(sizes)[::-1]
    out['nblob'] = int(k)
    out['top1frac'] = float(sizes[order[0]] / n)
    out['top10frac'] = float(sizes[order[:10]].sum() / n)
    ys, xs = np.nonzero(m)
    out['ycen'] = float(ys.mean() / H)
    # vertical centroid of the TEN LARGEST blobs, normalised. Blob-based, so it
    # is a property of the highlights themselves and not of a band somebody drew
    # -- but it is still sensitive to how the photographer framed the shot, and
    # that limit is the point of reporting the whole distribution.
    cen = ndimage.center_of_mass(m, lab, [order[i] + 1 for i in range(min(10, k))])
    out['top10ycen'] = float(np.mean([c[0] for c in cen]) / H)
    return out


def main():
    fs = files()
    print(f'reference files walked: {len(fs)}  (glob reference/*.jpg would see '
          f'{len(glob.glob(os.path.join(REF, "*.jpg")))})')
    print(f'threshold: sRGB-domain 709 luma >= {BLOWN}')
    print()
    rows = []
    for f in fs:
        im = Image.open(f)
        nat = stats(luma(im))
        red = {}
        for kn, kv in KERNELS.items():
            h = round(im.height * 1280 / im.width)
            red[kn] = stats(luma(im.resize((1280, h), kv)))
        rows.append((os.path.basename(f), nat, red))

    print(f'{"file":<52} {"native":>9} {"px":>10} | reduced to 1280 wide, blown %')
    print(f'{"":<52} {"blown %":>9} {"":>10} | ' + ' '.join(f'{k:>9}' for k in KERNELS))
    for name, nat, red in rows:
        print(f'{name[:52]:<52} {nat["pct"]:9.4f} {nat["w"]}x{nat["h"]:<5} | '
              + ' '.join(f'{red[k]["pct"]:9.4f}' for k in KERNELS))

    def band(vals):
        v = np.array(sorted(vals))
        return (f'min {v[0]:.4f}  p25 {np.percentile(v,25):.4f}  med {np.median(v):.4f}  '
                f'p75 {np.percentile(v,75):.4f}  max {v[-1]:.4f}')
    print()
    print('WHOLE-FRAME BLOWN %, native resolution :', band([r[1]['pct'] for r in rows]))
    for k in KERNELS:
        print(f'WHOLE-FRAME BLOWN %, 1280 {k:<8}     :', band([r[2][k]['pct'] for r in rows]))
    print()
    print('largest blob as a fraction of all blown pixels (native):',
          band([r[1]['top1frac'] for r in rows]))
    print('ten largest blobs as a fraction of all blown  (native):',
          band([r[1]['top10frac'] for r in rows]))
    print('vertical centroid of blown mass, 0=top     (native):',
          band([r[1]['ycen'] for r in rows if r[1]['n'] > 0]))
    print('vertical centroid of the ten largest blobs (native):',
          band([r[1]['top10ycen'] for r in rows if r[1]['n'] > 0]))
    print()
    print('per-file, native: blown%  nblob  top1frac  ycen  top10ycen')
    for name, nat, red in rows:
        print(f'  {name[:46]:<46} {nat["pct"]:8.4f} {nat["nblob"]:6d} '
              f'{nat["top1frac"]:8.3f} {nat["ycen"]:6.3f} {nat["top10ycen"]:6.3f}')


if __name__ == '__main__' and (len(sys.argv) < 2 or sys.argv[1] != 'tiles'):
    main()


def tiles(argv):
    """Reference blown % reduced to the wall's 142x80 thumbnail, all four kernels.

    Round 10's statistic. AGENTS_BRIEF measured a 48x swing across kernels on
    exactly this reduction, so the kernel is named and the whole distribution is
    printed rather than one number.
    """
    fs = files()
    print(f'reference files walked: {len(fs)}   reduced to 142x80 (the wall tile)')
    print(f'threshold: sRGB-domain 709 luma >= {BLOWN}')
    print()
    per = {k: [] for k in KERNELS}
    for f in fs:
        im = Image.open(f)
        row = []
        for kn, kv in KERNELS.items():
            v = stats(luma(im.resize((142, 80), kv)))['pct']
            per[kn].append(v)
            row.append(v)
        print(f'  {os.path.basename(f)[:46]:<46} ' + ' '.join(f'{v:8.4f}' for v in row))
    print(f'  {"":<46} ' + ' '.join(f'{k:>8}' for k in KERNELS))
    print()
    for kn in KERNELS:
        v = np.array(sorted(per[kn]))
        print(f'{kn:<9} min {v[0]:7.4f}  med {np.median(v):7.4f}  '
              f'p90 {np.percentile(v,90):7.4f}  max {v[-1]:7.4f}')


if __name__ == '__main__' and len(sys.argv) > 1 and sys.argv[1] == 'tiles':
    tiles(sys.argv)
