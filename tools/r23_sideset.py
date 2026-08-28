#!/usr/bin/env python3
"""BUILDER-STORE r23 — the sealed crop set, chosen by SCRIPT, left unscored.

This REUSES tools/r22_blindset.py rather than restating it: `photo_tiles`,
`prod_frac`, the tile size and — the part that matters — the symmetric codec
normalisation all come from there. AGENTS_BRIEF retired facing flatness as a
discriminator precisely because the two classes were not going through one
encoder; re-implementing the set here would have been a second owner for that
rule, which is the failure this project has paid for three times.

What is different, and only this:

  * the render plates are r23's two arms, `r23on_<pose>.png` (shipped) and
    `r23off_<pose>.png` (`?flatface&leanpad`, round 22's placement on the same
    tree), and the product mask is `r23mask_<pose>.png`.
  * a tile is accepted only if it also holds enough SIDE-FACE evidence to be
    about this round at all: at least MIN_BANDS distinct dark inter-facing seams
    on the tile's middle row band. That rule runs on the RENDER side only and is
    stated here, so a critic can see the set was cut toward the cue and decide
    what that is worth. Photograph tiles take r22's rule unchanged.

The builder has read the placement code and does not open the key.

    python3 tools/r23_sideset.py shots/side_<name> [seed]
"""
import json
import os
import random
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import r22_blindset as B                                    # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')
ARMS = ('r23on', 'r23off')
MIN_BANDS = 6            # distinct dark seams across the tile's mid rows


def seam_count(im, x, y, s):
    """Dark inter-facing seams on three rows of the tile. Deliberately crude:
    it is an ACCEPTANCE rule for the crop set, not a statistic — the round's
    statistics are the face-attribution census in shots/_probe_r23.js."""
    px = im.load()
    best = 0
    for yy in (y + s // 3, y + s // 2, y + 2 * s // 3):
        lum = [0.2126 * px[xx, yy][0] + 0.7152 * px[xx, yy][1] + 0.0722 * px[xx, yy][2]
               for xx in range(x, x + s)]
        m = sum(lum) / len(lum)
        runs, inrun = 0, False
        for v in lum:
            if v < 0.45 * m:
                if not inrun:
                    runs += 1
                    inrun = True
            else:
                inrun = False
        best = max(best, runs)
    return best


def render_tiles(arm):
    out = []
    for pose in B.POSES:
        f = os.path.join(SHOTS, '%s_%s.png' % (arm, pose))
        mf = os.path.join(SHOTS, 'r23mask_%s.png' % pose)
        if not (os.path.exists(f) and os.path.exists(mf)):
            continue
        im = Image.open(f).convert('RGB')
        mask = Image.open(mf).convert('RGB')
        for x in range(0, im.width - B.TILE + 1, 40):
            for y in range(0, im.height - B.TILE + 1, 40):
                p = B.prod_frac(mask, x, y, B.TILE)
                if p < B.MIN_PROD:
                    continue
                n = seam_count(im, x, y, B.TILE)
                if n < MIN_BANDS:
                    continue
                out.append((im.crop((x, y, x + B.TILE, y + B.TILE)),
                            '%s %s %d,%d prod=%.2f seams=%d' % (arm, pose, x, y, p, n)))
    return out


def main():
    outdir = sys.argv[1]
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else None
    rnd = random.Random(seed)
    R = []
    for arm in ARMS:
        t = render_tiles(arm)
        rnd.shuffle(t)
        R += t[:9]
    P = B.photo_tiles()
    rnd.shuffle(R)
    rnd.shuffle(P)
    nR = rnd.randint(8, 12)
    nP = rnd.randint(8, 12)
    tiles = ([(t, 'RENDER', w) for (t, w) in R[:nR]]
             + [(t, 'PHOTO', w) for (t, w) in P[:nP]])
    rnd.shuffle(tiles)
    os.makedirs(outdir, exist_ok=True)
    key = []
    for i, (im, cls, why) in enumerate(tiles):
        n = 'tile_%02d.jpg' % i
        im.save(os.path.join(outdir, n), 'JPEG', quality=B.ENCODE_Q,
                subsampling=B.ENCODE_SS)
        key.append({'tile': n, 'class': cls, 'provenance': why})
    with open(os.path.join(outdir, 'KEY_DO_NOT_OPEN.json'), 'w') as f:
        json.dump({'arms': ARMS, 'minProd': B.MIN_PROD, 'minBands': MIN_BANDS,
                   'tile': B.TILE, 'encodeQ': B.ENCODE_Q, 'key': key}, f, indent=1)
    print('%d tiles written to %s (split not printed)' % (len(tiles), outdir))


if __name__ == '__main__':
    main()
