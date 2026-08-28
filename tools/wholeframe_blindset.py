#!/usr/bin/env python3
"""THE BLIND SET WITHOUT A CROP SELECTOR.

PROMPT.md's bar is: "someone shown your screenshot next to a real store photo
can tell which is the game." A SCREENSHOT. A WHOLE FRAME. Not a magnified
shelf-face crop.

Eight leaks have been found in the cropped harness (see the ledger in
tools/r22_blindset.py) and FIVE of them -- 1, 4, 5, 6 and 8 -- exist only
because something had to choose a window:

  1  builder-chosen crops flattered the build
  4  cross-tile catalogue grouping: repeated catalogue reads render
  5  subject mismatch: flat-on shelf faces against corridor views, then
     against ceilings and a glass floral cooler
  6  group size: 3+3+3 renders against 6+6 photographs
  8  a product-fraction gate on one side only, and a family guard that its own
     threshold made unsatisfiable

There is no window to choose here, so none of those five can exist. What is
left is the comparison the brief actually asks for.

WHAT THIS DELIBERATELY GIVES UP. n is small: six render poses per arm against
fourteen photographs. That is fine for RENDER-RECALL, which is the score and is
one-sided, and useless for any population statistic -- so do not compute one
off this set. The cropped harness stays for close work; this is the one that
answers the bar as written.

WHAT IT STILL CONTROLS. Everything that is not a window:

  * ONE encoder at ONE quality for BOTH classes, in the reference set's own
    4:2:0 (leak 2 -- file size once separated the classes perfectly, and a
    critic could have scored 100% from `ls`)
  * per-arm seeding, so two arms are not diffable (leak 7 -- the answer key
    once fell straight out of `md5`)
  * identical pixel dimensions for every tile, so aspect and resolution carry
    nothing
  * the split randomised away from 50/50 and never printed

USAGE
    python3 tools/wholeframe_blindset.py <arm> <outdir> [seed]

`<arm>` names the render plates: shots/<arm>_<pose>.png for the six poses in
r22_blindset.POSES. Photographs come from reference/ -- ALL of them, with no
subject list, because with the whole frame in view there is nothing to match.
"""
import json
import os
import random
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import r22_blindset as B                                       # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference')
SHOTS = os.path.join(ROOT, 'shots')

W, H = 1280, 720          # the render's native size; everything is brought here


def fit(im):
    """Resize to width W, then centre-crop to H.

    Centre-crop rather than letterbox: a letterbox writes black bars, and bars
    are a class tell as loud as the file size was. Every tile leaves here at
    exactly WxH so aspect and resolution carry nothing.
    """
    im = im.convert('RGB')
    if im.width != W:
        im = im.resize((W, max(1, round(im.height * W / im.width))),
                       Image.LANCZOS)
    if im.height < H:                      # too short to crop: pad by resize
        im = im.resize((W, H), Image.LANCZOS)
        return im
    top = (im.height - H) // 2
    return im.crop((0, top, W, top + H))


def render_frames(arm):
    out = []
    for pose in B.POSES:
        f = os.path.join(SHOTS, '%s_%s.png' % (arm, pose))
        if not os.path.exists(f):
            continue
        out.append((fit(Image.open(f)), '%s %s' % (arm, pose)))
    if len(out) < 3:
        raise SystemExit(
            'wholeframe: arm %r has %d pose frame(s); capture at least 3 of %s.'
            % (arm, len(out), ', '.join(B.POSES)))
    return out


def photo_frames():
    out = []
    for p in sorted(os.listdir(REF)):
        if p == 'CREDITS.md':
            continue
        try:
            im = Image.open(os.path.join(REF, p))
        except Exception:
            continue
        out.append((fit(im), p[:40]))
    return out


def main():
    arm = sys.argv[1]
    outdir = sys.argv[2]
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else None
    rnd = random.Random(B.arm_seed(arm, seed))       # leak 7, one owner

    R = render_frames(arm)
    P = photo_frames()
    rnd.shuffle(R)
    rnd.shuffle(P)
    nP = rnd.randint(max(3, len(R) - 2), min(len(P), len(R) + 4))
    tiles = ([(im, 'RENDER', w) for (im, w) in R]
             + [(im, 'PHOTO', w) for (im, w) in P[:nP]])
    rnd.shuffle(tiles)

    os.makedirs(outdir, exist_ok=True)
    key = []
    for i, (im, cls, why) in enumerate(tiles):
        n = 'frame_%02d.jpg' % i
        im.save(os.path.join(outdir, n), 'JPEG',
                quality=B.ENCODE_Q, subsampling=B.ENCODE_SS)   # leak 2
        key.append({'tile': n, 'class': cls, 'provenance': why})
    with open(os.path.join(outdir, 'KEY_DO_NOT_OPEN.json'), 'w') as f:
        json.dump({'arm': arm, 'size': [W, H], 'key': key}, f, indent=1)
    print('%d whole frames written to %s (split not printed)'
          % (len(tiles), outdir))


if __name__ == '__main__':
    main()
