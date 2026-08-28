#!/usr/bin/env python3
"""BUILDER-LIGHT r25 - the BETWEEN-MATERIAL luma profile, both sides, one rule.

WHY THIS IS A BETWEEN-MATERIAL STATISTIC AND NOT A PER-SURFACE ONE. r24's
critic measured its own recall at three crop scales: 46 px patches 14/20,
240 px shelf bays 18/18, 720 px tiles 18/18, and wrote that "a lone face gives
no reference for glossy; a bay puts five materials under one light". So the
quantity is the ORDERING AND SPREAD of luma p99.5 across the materials that
share one bay, and every class here is measured inside one rectangle under one
light on each side.

SYMMETRIC CODEC CONTROL, and AGENTS_BRIEF says why in one line: three
per-face statistics died at q88/q72/q60 because the render side was clean PNG
and the photograph side was a crop of a 4:2:0 JPEG. So both sides are cropped
to the SAME 720x720 tile size and put through the SAME encoder at the SAME
quality and subsampling that tools/r22_blindset.py ships - imported from there
rather than restated, because a second copy of that constant is exactly the
failure this project has paid for three times. Raw and encoded are both
reported at three qualities; a difference that is not stable across them is
the codec.

LUMA IS sRGB-ENCODED, 0-1, NOT LINEAR. r24's critic published render
jar/film/lip 0.84/0.68/0.66 against photograph 0.85/1.00/0.99. Measured in
LINEAR luma the same render bay reads 0.62/0.69/0.41, so the published numbers
are the encoded ones and everything here is in that space or the two sides are
not comparable. (The lip agreeing to 0.67 against 0.66 is what identified it.)

CLASS MEMBERSHIP ON THE RENDER SIDE IS NOT A HAND-DRAWN BOX. It is
shots/r25class_<pose>.png, written by shots/_probe_r25.js from the package
shader's own PKG_STAGE 7 mask per family, plus a LIT-FIXTURE lip class taken
inside __R21L's world-anchored zero-thickness lip quad. Price tags are removed
from the lip class by the one predicate that defines them - an unlit pixel does
not move when every light in the scene goes to zero - because the first version
of that box was 40-70% printed paper and read p99.5 0.98.

    python3 tools/r25_bayprofile.py
"""
import os
import sys
import io

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import r22_blindset as B                                    # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')
REF = os.path.join(ROOT, 'reference')

# The reference file, chosen because its cast is the render bay's cast: rigid
# metal cans, film pouches, printed cartons and a lit shelf lip, all in one
# frame at aisle height. Leak 5 in r22_blindset is content matching; this is
# that rule applied to the profile as well as to the blind set.
PHOTO = 'store_01_Canned_and_packaged_tuna_on_supermarket_shelves.jpg'
PHOTO_W = 1280                       # the same resize photo_tiles() uses
PHOTO_TILE = (250, 10, 970, 730)     # 720x720, contains all four boxes
# Declared on the resized 1280-wide image, then checked by eye at 2-3x -
# shots/r25_ref_boxes.png. AGENTS_BRIEF: "look inside every box you declare";
# r24's critic twice declared a region that straddled a face boundary.
PHOTO_BOX = {
    'can':    (820, 200, 970, 320),   # solid block of tinplate cans
    'film':   (305, 552, 438, 622),   # StarKist pouch block, one wooden divider
    'carton': (508, 566, 572, 614),   # one printed carton face
    'lip':    (770, 523, 915, 533),   # white shelf front, no price tag in it
}

# The render bay: near_a7, the deck at 1.301 m, as _probe_r25.bay() projected
# it. Products in the slot rect, lip in the lip rect, and class membership from
# the class map - so the rectangle only bounds the bay, it does not classify.
RENDER_POSE = 'near_a7'
RENDER_TILE = (300, 0, 1020, 720)
RENDER_SLOT = (446, 216, 834, 360)
RENDER_LIP = (452, 362, 828, 380)
CLASS_RGB = {'carton': (255, 0, 0), 'film': (0, 255, 0), 'can': (0, 0, 255),
             'bottle': (255, 255, 0), 'lip': (255, 0, 255)}


def luma(a):
    a = a.astype(np.float32) / 255.0
    return 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]


def roundtrip(im, q):
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=q, subsampling=B.ENCODE_SS)
    buf.seek(0)
    return Image.open(buf).convert('RGB')


def stats(v):
    if v.size < 60:
        return None
    s = np.sort(v)
    return dict(n=int(v.size),
                p50=round(float(s[int(0.50 * (s.size - 1))]), 3),
                p95=round(float(s[int(0.95 * (s.size - 1))]), 3),
                p995=round(float(s[int(0.995 * (s.size - 1))]), 3))


def photo_profile(q):
    im = Image.open(os.path.join(REF, PHOTO)).convert('RGB')
    im = im.resize((PHOTO_W, int(im.height * PHOTO_W / im.width)), Image.LANCZOS)
    tile = im.crop(PHOTO_TILE)
    if q:
        tile = roundtrip(tile, q)
    a = luma(np.array(tile))
    out = {}
    for k, (x0, y0, x1, y1) in PHOTO_BOX.items():
        out[k] = stats(a[y0 - PHOTO_TILE[1]:y1 - PHOTO_TILE[1],
                         x0 - PHOTO_TILE[0]:x1 - PHOTO_TILE[0]].ravel())
    return out


def render_profile(arm, q):
    plate = Image.open(os.path.join(SHOTS, '%s_%s.png' % (arm, RENDER_POSE))).convert('RGB')
    cls = np.array(Image.open(os.path.join(SHOTS, 'r25class_%s.png' % RENDER_POSE)).convert('RGB'))
    tile = plate.crop(RENDER_TILE)
    if q:
        tile = roundtrip(tile, q)
    a = np.zeros((720, 1280), np.float32)
    a[RENDER_TILE[1]:RENDER_TILE[3], RENDER_TILE[0]:RENDER_TILE[2]] = luma(np.array(tile))
    out = {}
    for k, rgb in CLASS_RGB.items():
        m = np.all(cls == np.array(rgb, np.uint8), axis=-1)
        box = RENDER_LIP if k == 'lip' else RENDER_SLOT
        sel = np.zeros_like(m)
        sel[box[1]:box[3], box[0]:box[2]] = True
        v = a[m & sel]
        s = stats(v)
        if s:
            out[k] = s
    return out


def main():
    print('PHOTO  %s  tile %s' % (PHOTO, RENDER_TILE and PHOTO_TILE,))
    print('RENDER %s  slot %s  lip %s' % (RENDER_POSE, RENDER_SLOT, RENDER_LIP))
    print('encoder: quality varied, subsampling %d (4:2:0), one identical '
          'round trip on BOTH classes\n' % B.ENCODE_SS)
    keys = ['carton', 'film', 'can', 'lip']
    for q in [None, 95, B.ENCODE_Q, 72]:
        tag = 'raw PNG/JPEG as-is' if q is None else 'q%d both sides' % q
        rows = [('PHOTO   ', photo_profile(q)),
                ('r25off  ', render_profile('r25off', q)),
                ('r25on   ', render_profile('r25on', q))]
        print('--- %s' % tag)
        print('          ' + '  '.join('%-22s' % k for k in keys))
        for name, p in rows:
            cells = []
            for k in keys:
                s = p.get(k)
                cells.append('%-22s' % ('-' if not s else
                                        'p995 %.3f n=%-6d' % (s['p995'], s['n'])))
            print(name + '  '.join(cells))
        print()


if __name__ == '__main__':
    main()
