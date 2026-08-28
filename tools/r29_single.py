#!/usr/bin/env python3
"""BUILDER-WEAR r29 - ABSOLUTE SINGLE-IMAGE CLASSIFICATION, WITH CATCH TRIALS.

THE INSTRUMENT. Round 27's critic retired the matched-arm forced choice by
proving it broken with a control nobody had added: on 6 of 8 pairs whose two
halves were THE SAME IMAGE it invented a specific named geometric difference,
three at high confidence, and it named the second-presented half 18 times in 20.
Its replacement -- one crop, one arm, judged alone against a criterion fixed in
advance, no pair and therefore no position -- produced round 28's 10 of 12 and is
the standard. This is that instrument, plus the thing that rescued the old one:
CATCH TRIALS.

THE CRITERION, FIXED BEFORE ANY TILE WAS CUT AND NOT EDITED AFTERWARDS:

    Look at the FLOOR in this crop. Is there at least one dark mark on it that
    is shaped and valued like a shadow -- a compact, roughly blob-shaped dark
    patch about the size of a shoe or a cart base -- with NOTHING STANDING ON IT
    to cast one?

    FLOATING  at least one such unattached dark pool.
    NONE      every dark mark on the floor is either attached to the base of
              something standing there, or is a long thin line or streak rather
              than a pool.

    Truth:  OFF arm (the pre-round-29 wear decal) = FLOATING
            ON arm  (this round's wear decal)     = NONE
            PHOTO catch tiles                     = NONE

WHY THE CATCH TILES ARE PHOTOGRAPHS. The failure mode this instrument has to
defend against is the one round 27's critic caught: a scorer who has been asked
to find a thing will find it whether or not it is there. An absolute criterion
cannot be answered by position, but it can still be answered by expectation. So
four tiles are open-floor crops of REAL supermarket floors, brought to 1280x720
by tools/wholeframe_blindset.fit and windowed the same way. A real polished VCT
floor does not carry unattached shadow pools, so their truth is NONE. Calling
FLOATING on one of them means the criterion is confabulating and the run is
discarded. This is a WEAK catch and is labelled as one: the scorer knows a
photograph when it sees one, so it can score these right for the wrong reason.
It bounds confabulation, it does not bound bias.

WINDOW SELECTION IS ARM-BLIND BY CONSTRUCTION. Round 28's first single-image run
cast the floor plane per pixel with no visibility test, and five of its six
windows held no floor at all -- it published a 7 of 12 that measured its own
selector. The mask here is occlusion-exact: the floor mesh is painted flat
magenta for ONE throwaway render with the wear plane hidden, and the magenta
pixels ARE the visible floor. That render does not depend on which arm is bound,
so the selector cannot see the effect.

    per pose:  NEAR = the 360x240 window at y >= 360 with the most visible floor
               FAR  = the best window that does not overlap it, floor >= 0.15
    poses:     the four that contain any floor at all. near_a1 and near_a4
               contain ZERO visible floor pixels and no floor change of any kind
               can reach them -- measured, not assumed, and it reproduces round
               28's finding independently.

EVERY WINDOW CARRIES A NON-ZERO ARM DIFFERENCE. Two of round 28's six windows
carried none, so only 8 of its 12 tiles could have held a percept at all. The
mean absolute arm difference over each window is recorded below and in the key:
the smallest is 0.99 of 255 and the largest 6.81, so all 16 render tiles could
carry one.

Crops are upscaled 2x to 720x480 and every tile, both classes, goes through ONE
encoder at q88 4:2:0 so file size cannot separate anything.

THIS IS AN INFORMED TEST and is labelled as such: the scorer built the change.
It answers "can an observer who knows exactly what to look for tell these
apart", which is the weaker question and the only one its own builder may ask.

USAGE
    python3 tools/r29_single.py [seed]
"""
import json
import os
import random
import sys

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wholeframe_blindset import fit                            # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')
REF = os.path.join(ROOT, 'reference')

# floorfrac and armMAD are MEASURED, off shots/r29mask_<pose>.png (the magenta
# mask) and the two arm captures. They are recorded, not used to select.
WINDOWS = [
    {"pose": "near_a7",  "band": "NEAR", "x":  80, "y": 420, "floorfrac": 1.0000, "armMAD": 6.8143},
    {"pose": "near_a7",  "band": "FAR",  "x": 180, "y": 180, "floorfrac": 0.2293, "armMAD": 0.9948},
    {"pose": "chase_a1", "band": "NEAR", "x": 460, "y": 480, "floorfrac": 0.9998, "armMAD": 2.5716},
    {"pose": "chase_a1", "band": "FAR",  "x": 460, "y": 240, "floorfrac": 0.2469, "armMAD": 1.7326},
    {"pose": "chase_a4", "band": "NEAR", "x": 480, "y": 480, "floorfrac": 0.9915, "armMAD": 3.0120},
    {"pose": "chase_a4", "band": "FAR",  "x": 480, "y": 240, "floorfrac": 0.2029, "armMAD": 1.5664},
    {"pose": "chase_a6", "band": "NEAR", "x": 460, "y": 480, "floorfrac": 0.9897, "armMAD": 3.8286},
    {"pose": "chase_a6", "band": "FAR",  "x": 480, "y": 240, "floorfrac": 0.2247, "armMAD": 1.5886},
]
W, H = 360, 240

# Four open-floor windows in four DIFFERENT real stores, picked by eye off the
# fitted 1280x720 frames for containing floor and essentially nothing else.
CATCH = [
    ("store_02_Langenstein_s_grocery_store_Uptown_New_Orleans_-_Interior_aisle_Octobe.jpg", 460, 480),
    ("store_04_Frozen_foods_aisle_at_Publix_Super_Market_at_The_Paramount_on_Lake_Eol.jpg", 460, 480),
    ("store_05_Ingles_Supermarket_NC_Highway_107_and_Webster_Road_Sylva_NC_2024_-_Ais.jpg", 460, 480),
    ("store_12_Produce_section_at_Publix.jpg", 80, 460),
]

CRITERION = ("FLOATING if the floor carries at least one compact, blob-shaped "
             "dark patch about the size of a shoe or a cart base with nothing "
             "standing on it to cast one; NONE if every dark mark on the floor "
             "is either attached to the base of something standing there or is "
             "a long thin line or streak rather than a pool.")


# RUN 2 -- THE NEAR BAND ONLY, AND IT IS A DIAGNOSTIC, NOT A SCORE.
#
# Run 1 went 8 of 8 on the FAR band and 4 of 8 on the NEAR band, and the misses
# had one signature: THREE of the four were ON tiles called FLOATING -- the
# scorer finding the defect in its own fix. The build was changed in response
# (scuff strokes narrowed to the real 13-29 mm and constrained to be at least
# 3.4x longer than they are wide), so run 1 is a PRE-FIX number for that band
# and no claim is made that it improved.
#
# `--near` re-cuts the same four NEAR windows off the shipped build with two
# fresh catch tiles. It is contaminated by memory -- the scorer has already seen
# these four windows in both arms -- and it is reported as a diagnostic of
# whether the ON near tiles still read as FLOATING, never as an acceptance
# number. Selective re-testing of the band that failed is exactly what it looks
# like; saying so is the only thing that makes it publishable.
CATCH2 = [
    ("store_09_The_interior_of_a_Lowes_Foods_supermarket_chain_store_in_Clemmons_Nort", 80, 460),
    ("store_00_Drinks_aisle_of_Smith_s_Food_and_Drug_in_Gillette_Wyoming.jpg", 460, 480),
]


def main():
    near_only = '--near' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    seed = int(args[0]) if args else 2911
    rng = random.Random('r29single|%s|%d' % ('near' if near_only else 'full', seed))
    name = ('r29_s2near_' if near_only else 'r29_s1_') + ''.join(rng.choice('abcdefghijkmnpqrstuvwxyz23456789')
                               for _ in range(8))
    out = os.path.join(SHOTS, name)
    os.makedirs(out, exist_ok=True)

    wsel = [i for i, w in enumerate(WINDOWS)
            if not near_only or w['band'] == 'NEAR']
    catch = CATCH2 if near_only else CATCH
    items = [('R', wi, arm) for wi in wsel for arm in ('ON', 'OFF')]
    items += [('P', ci, 'PHOTO') for ci in range(len(catch))]
    rng.shuffle(items)

    key = []
    for slot, (kind, idx, arm) in enumerate(items):
        if kind == 'R':
            w = WINDOWS[idx]
            src = os.path.join(SHOTS, 'r29%s_%s.png'
                               % ('on' if arm == 'ON' else 'off', w['pose']))
            im = Image.open(src).convert('RGB')
            box = (w['x'], w['y'], w['x'] + W, w['y'] + H)
            rec = {'slot': slot, 'kind': 'RENDER', 'window': idx,
                   'pose': w['pose'], 'band': w['band'], 'arm': arm,
                   'truth': 'FLOATING' if arm == 'OFF' else 'NONE',
                   'box': list(box), 'floorfrac': w['floorfrac'],
                   'armMAD': w['armMAD']}
        else:
            f, x, y = catch[idx]
            im = fit(Image.open(os.path.join(REF, f)))
            box = (x, y, x + W, y + H)
            rec = {'slot': slot, 'kind': 'CATCH', 'source': f[:40],
                   'arm': 'PHOTO', 'truth': 'NONE', 'box': list(box)}
        im = im.crop(box).resize((W * 2, H * 2), Image.LANCZOS)
        im.save(os.path.join(out, 'tile_%02d.jpg' % slot),
                quality=88, subsampling='4:2:0', optimize=False)
        key.append(rec)

    with open(os.path.join(out, 'KEY.json'), 'w') as f:
        json.dump({'seed': seed, 'criterion': CRITERION, 'key': key}, f, indent=1)
    print(name)
    print('%d tiles (%d render, %d catch), 720x480, q88 4:2:0, one encoder'
          % (len(key), len(wsel) * 2, len(catch)))


if __name__ == '__main__':
    main()
