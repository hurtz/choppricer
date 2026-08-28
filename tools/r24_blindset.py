#!/usr/bin/env python3
"""BUILDER-STORE r24 - the sealed crop set, chosen by SCRIPT, left unscored.

It REUSES tools/r22_blindset.py rather than restating it: `photo_tiles`,
`prod_frac`, the tile size, MIN_PROD, MIN_POSES and - the part that matters -
the symmetric one-encoder q88 4:2:0 normalisation all come from there.
AGENTS_BRIEF retired facing flatness because the two classes were not going
through one encoder; re-implementing that rule here would be a second owner for
it, which is the failure this project has paid for three times.

TWO THINGS ARE DIFFERENT, and only these:

  * THE ARM CARRIES ITS OWN MASK. r22's and r23's sets gated every arm's tiles
    on ONE product mask (`r22mask_<pose>`, `r23mask_<pose>`), captured from the
    shipped arm. That is harmless while the two arms have the same silhouette
    and this round's do not - it moves every facing's orientation, so the
    package mask itself differs. Each arm is gated on its own
    `r24mask_<on|off>_<pose>`, so a tile is accepted because THAT arm has
    product in it and not because the other one did.

  * The render plates are r24's two arms, `r24on_<pose>.png` (shipped) and
    `r24off_<pose>.png` (`?flatyaw`, round 23's orientation on the same tree,
    proven instance-for-instance identical by products.js's drawSig()).

LEAK 3 (n = 1 pose) was NOT closed and is closed here - see the block over
render_tiles. r22_blindset counts pose FILES, not poses that contributed a tile,
and at MIN_PROD 0.55 exactly one pose contributes on this round's plates. This
script counts tiles, caps how many come from any one pose, and refuses to write a
set that does not span MIN_POSE_HIT poses.
LEAK 5 (content matching) is still OPEN and is handled the way that module says
to handle it - by choosing a seed whose photograph files are packed shelf aisles
rather than produce or checkout, and saying in the report which files came up.
Choosing the seed on the PHOTOGRAPH side only looks at reference/, never at the
render tiles and never at the split.

The builder has read the placement code and does not open the key.

    python3 tools/r24_blindset.py r24on  shots/blind_<name> [seed]
    python3 tools/r24_blindset.py r24off shots/blind_<name> [seed]
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
MASK_OF = {'r24on': 'r24mask_on', 'r24off': 'r24mask_off'}


# ---------------------------------------------------------------------------
# LEAK 3 WAS NOT ACTUALLY CLOSED, AND THIS IS WHERE IT REOPENED.
#
# r22_blindset's guard counts how many pose FILES it found, not how many poses
# contributed a tile. Measured on this round's two arms, at MIN_PROD 0.55, the
# per-pose count is
#
#     near_a1 0   near_a4 15   near_a7 0   chase_a1 0   chase_a4 0   chase_a6 0
#
# for BOTH arms: the whole pool is one frame, the guard passes because six files
# exist, and the set is exactly the n=1 set r22's critic called out. The cause is
# the threshold - a 720 px window of a chase pose is 14-26% package because most
# of it is aisle, floor and ceiling, and only near_a4 has a wall of facings
# filling the frame.
#
# So two changes, both stated:
#   MIN_PROD 0.30, which admits near_a1 (15 windows), near_a4 (15) and near_a7
#     (10) and still excludes the three chase poses at 14-26%. It lets more
#     fixture and floor into a render tile - which is what a random 720 px
#     window of a supermarket PHOTOGRAPH contains too, so it makes the two sides
#     more alike rather than less.
#   PER_POSE 3, at the widest x separation the frame allows, and the pool must
#     cover MIN_POSE_HIT distinct poses or the script refuses to write a set.
#     Within one pose two picks 280 px apart overlap by 61% and the two extremes
#     by 22%; the photograph side draws at PHOTO_STRIDE 120 on a 1280-wide image,
#     so it overlaps MORE. Neither class is the one made of near-duplicates.
# LEAK 8, first half. This was 0.30, and the lead then added r22's near/chase
# family guard to this wrapper WITHOUT CHECKING IT COULD BE SATISFIED HERE. The
# best CHASE window in the building is prod 0.259 (measured across all six
# masks: near_a1 0.403, near_a4 0.733, near_a7 0.428, chase_a1 0.196,
# chase_a4 0.244, chase_a6 0.259), so at 0.30 the guard was UNSATISFIABLE and
# this path could not regenerate a valid set at all. Round 26's critic found it
# by running the guard on the shipped plates. Aligned with r22's 0.15, which the
# same measurement shows is satisfiable.
#
# A GATE AND A GUARD THAT CONTRADICT EACH OTHER ARE WORSE THAN NEITHER: the gate
# silently produced near-pose-only sets, and the guard that would have caught
# that could never run.
MIN_PROD_R24 = 0.15
PER_POSE = 3
MIN_POSE_HIT = 3


def render_tiles(arm):
    """B.render_tiles with the arm's OWN mask, this round's threshold, and a
    per-pose cap. Same tile size, same acceptance shape, same encoder."""
    prefix = MASK_OF.get(arm)
    if prefix is None:
        raise SystemExit('r24_blindset: no mask registered for arm %r' % arm)
    out, hit = [], []
    for pose in B.POSES:
        f = os.path.join(SHOTS, '%s_%s.png' % (arm, pose))
        mf = os.path.join(SHOTS, '%s_%s.png' % (prefix, pose))
        if not (os.path.exists(f) and os.path.exists(mf)):
            continue
        im = Image.open(f).convert('RGB')
        mask = Image.open(mf).convert('RGB')
        ok = []
        for x in range(0, im.width - B.TILE + 1, 40):
            for y in range(0, im.height - B.TILE + 1, 40):
                p = B.prod_frac(mask, x, y, B.TILE)
                if p >= MIN_PROD_R24:
                    ok.append((x, y, p))
        if not ok:
            continue
        hit.append('%s:%d' % (pose, len(ok)))
        # up to PER_POSE picks, spread as far apart as the passing set allows
        idx = ([0] if PER_POSE == 1
               else [round(i * (len(ok) - 1) / (PER_POSE - 1))
                     for i in range(PER_POSE)])
        for i in sorted(set(idx)):
            x, y, p = ok[i]
            out.append((im.crop((x, y, x + B.TILE, y + B.TILE)),
                        '%s %s %d,%d prod=%.2f' % (arm, pose, x, y, p)))
    # LEAK 5, framing half. r22's guard also requires a NEAR and a CHASE pose to
    # contribute, so the render side is not all flat-on shelf face while the
    # photo side is all corridor view -- r25's critic found a set partitioning
    # on "is there a floor?". This wrapper raised MIN_PROD to 0.30 and dropped
    # that guard, so sets on this path were near-pose only. Re-asserted here.
    fams = {p.split(':')[0] for p in hit}
    if not (fams & set(B.NEAR) and fams & set(B.CHASE)):
        raise SystemExit(
            'r24_blindset: arm %r contributed %s -- needs a NEAR and a CHASE '
            'pose, or the render side is all flat-on shelf face against '
            'corridor-view photographs and the set partitions on "is there a '
            'floor?" (leak 5). MIN_PROD_R24 is %.2f; r22 uses %.2f.'
            % (arm, sorted(fams), MIN_PROD_R24, B.MIN_PROD))
    if len(hit) < MIN_POSE_HIT:
        raise SystemExit(
            'r24_blindset: only %d pose(s) CONTRIBUTED a tile for arm %r (%s); '
            'need %d. This is leak 3 and counting files instead of tiles is how '
            'it hid.' % (len(hit), arm, ', '.join(hit) or 'none', MIN_POSE_HIT))
    return out, hit


def main():
    arm = sys.argv[1]
    outdir = sys.argv[2]
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else None
    # LEAK 7. This line was `random.Random(seed)` for r24 and r25, so both arms
    # drew the SAME photographs and the same tile order, only the renders
    # differed, and `md5`-ing the two directories returned the answer key at
    # zero pixels examined. It was fixed in r22_blindset.main -- which this
    # wrapper does not call. One owner now: B.arm_seed.
    rnd = random.Random(B.arm_seed(arm, seed))
    R, poses = render_tiles(arm)
    P = B.photo_tiles(rnd)
    rnd.shuffle(R)
    rnd.shuffle(P)
    # the render pool is now capped at PER_POSE per pose, so take all of it and
    # let the photo side carry the 8-12 draw. The split is further from 50/50
    # than r22's was, which the protocol allows and which render-recall - always
    # reported separately - is insensitive to.
    nR = len(R)
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
        json.dump({'arm': arm, 'minProd': MIN_PROD_R24, 'perPose': PER_POSE,
                   'tile': B.TILE,
                   'poses': poses, 'renderPool': len(R), 'photoPool': len(P),
                   'key': key}, f, indent=1)
    print('%d tiles written to %s; render pool %d over %d poses [%s] '
          '(split not printed)'
          % (len(tiles), outdir, len(R), len(poses), ' '.join(poses)))


if __name__ == '__main__':
    main()
