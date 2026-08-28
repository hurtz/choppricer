#!/usr/bin/env python3
"""BUILDER-FLOOR r28 - ABSOLUTE SINGLE-IMAGE CLASSIFICATION.

Round 27's critic retired the matched-arm forced choice after proving its own
administration broken: 18 "second" against 2 "first", and on 6 of 8 catch pairs
whose two halves were THE SAME IMAGE it invented a specific named geometric
difference, three at high confidence. Its conclusion -- "randomising position
per trial is not enough; the pairwise question itself is answerable by position"
-- and its replacement, an absolute single-image classification against a
criterion fixed in advance, is the standard this round uses.

THE CRITERION, FIXED BEFORE ANY TILE WAS CUT:

    Does at least one thing standing on the floor in this crop -- a shoe, a
    cart caster, a fixture foot, a body -- put a shadow on the floor it is
    standing on?  SHADOW or NONE.

One crop. One arm. No pair, and therefore no position.

WINDOW SELECTION, AND THE FIRST VERSION OF IT WAS BROKEN. Reported because the
broken run's number would otherwise read as a null.

Run 1 cast the floor plane per pixel and marked a pixel when its floor point lay
within 1.0 m of an occupied column -- with NO VISIBILITY TEST. It therefore
marked pixels where the floor is hidden behind a gondola, and five of its six
windows contained no floor at all: tiles of shelf face, judged against a
criterion about floors. That run scored 7 of 12, which measures the selector and
not the render, and it is published here as a defect rather than as a result.

Run 2, below, gets the floor mask exactly: the floor mesh is painted flat
magenta for ONE throwaway render, the magenta pixels ARE the visible floor, and
the material is restored. Neither arm's capture is touched. A pixel is marked
when it is visible floor AND its floor point lies within 0.85 m of a column the
moving occluder field says something stands in; windows are 360x240 on a 20 px
grid, top two non-overlapping per pose, and a window must reach 3%.

WHAT THAT SELECTOR MEASURED, AND IT IS THE ROUND'S SCOPE STATEMENT. Visible
floor samples per pose on an 8 px grid, and how many of them are near something
standing:

    near_a1      0 visible floor samples  --  no floor in frame at all
    near_a4      0 visible floor samples  --  no floor in frame at all
    near_a7   2354 visible,  115 near an occluder   (4.9%)
    chase_a1  2123 visible,  691 near an occluder  (32.5%)
    chase_a4  2666 visible,   52 near an occluder   (1.9%)
    chase_a6  2505 visible,   14 near an occluder   (0.6%)

Two of the six poses cannot show a floor change of any kind. chase_a6 has floor
but nothing standing on the near part of it in this configuration and does not
reach the 3% gate. The set below is therefore three poses, two windows each.

The field is identical in both arms -- only the shading differs -- so the
selector is blind to the effect. The marked fraction is recorded per window.

Crops are upscaled 2x to 720x480 and every tile goes through ONE encoder at q88
4:2:0, both classes, so file size cannot separate the arms.

THIS IS AN INFORMED TEST and is labelled as such: the scorer built the change
and knows what it does. It answers "can an observer who knows exactly what to
look for tell these apart at all", which is the weaker question and the only one
its own builder is entitled to ask.

USAGE
    python3 tools/r28_single.py [seed]
"""
import json
import os
import random
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')

# pose, window, and the fraction of the window that is floor within 1.0 m of an
# occluder -- measured in the browser off the moving field, which is identical
# in both arms.
WINDOWS = [
    {"pose": "near_a7",  "x": 840, "y": 180, "w": 360, "h": 240, "frac": 0.0844},
    {"pose": "near_a7",  "x": 200, "y": 200, "w": 360, "h": 240, "frac": 0.0844},
    {"pose": "chase_a1", "x": 520, "y": 440, "w": 360, "h": 240, "frac": 0.4267},
    {"pose": "chase_a1", "x":   0, "y": 460, "w": 360, "h": 240, "frac": 0.3756},
    {"pose": "chase_a4", "x": 360, "y": 240, "w": 360, "h": 240, "frac": 0.0378},
    {"pose": "chase_a4", "x": 360, "y": 440, "w": 360, "h": 240, "frac": 0.0378},
]

# Run 1's windows, kept so the defective run stays reproducible and is not
# quietly replaced. See the header.
WINDOWS_RUN1 = [
    {"pose": "near_a1",  "x": 920, "y": 360, "w": 360, "h": 240, "frac": 0.1067},
    {"pose": "near_a4",  "x": 920, "y": 280, "w": 360, "h": 240, "frac": 0.1637},
    {"pose": "near_a7",  "x": 240, "y": 200, "w": 360, "h": 240, "frac": 0.1252},
    {"pose": "chase_a1", "x": 520, "y": 440, "w": 360, "h": 240, "frac": 0.5148},
    {"pose": "chase_a4", "x": 920, "y": 400, "w": 360, "h": 240, "frac": 0.0622},
    {"pose": "chase_a6", "x": 920, "y": 440, "w": 360, "h": 240, "frac": 0.1370},
]


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 2811
    rng = random.Random('r28single|%d' % seed)
    name = 'r28_s1_' + ''.join(rng.choice('abcdefghijkmnpqrstuvwxyz23456789')
                               for _ in range(8))
    out = os.path.join(SHOTS, name)
    os.makedirs(out, exist_ok=True)

    items = [(wi, arm) for wi in range(len(WINDOWS)) for arm in ('ON', 'OFF')]
    rng.shuffle(items)
    key = []
    for slot, (wi, arm) in enumerate(items):
        w = WINDOWS[wi]
        box = (w['x'], w['y'], w['x'] + w['w'], w['y'] + w['h'])
        src = 'r28%s_%s.png' % ('on' if arm == 'ON' else 'off', w['pose'])
        im = Image.open(os.path.join(SHOTS, src)).convert('RGB').crop(box)
        im = im.resize((w['w'] * 2, w['h'] * 2), Image.LANCZOS)
        im.save(os.path.join(out, 'tile_%02d.jpg' % slot),
                quality=88, subsampling='4:2:0', optimize=False)
        key.append({'slot': slot, 'window': wi, 'pose': w['pose'],
                    'arm': arm, 'box': list(box), 'frac': w['frac']})

    with open(os.path.join(out, 'KEY.json'), 'w') as f:
        json.dump({'seed': seed, 'criterion': 'SHADOW if anything standing on '
                   'the floor casts a shadow onto it, else NONE',
                   'key': key}, f, indent=1)
    print(name)
    print('%d single tiles, 720x480, q88 4:2:0 through one encoder' % len(key))


if __name__ == '__main__':
    main()
