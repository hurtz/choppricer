#!/usr/bin/env python3
"""BUILDER-RAIL r27 - the MATCHED-ARM FORCED CHOICE.

Round 24's critic invented this instrument and it is the best "is it visible"
test this project has: put the SAME crop from the two arms side by side at full
resolution, randomise left/right, hide the key, and score it KNOWING EXACTLY
WHAT TO LOOK FOR. Round 24 got 5 of 9. Round 25 replicated at 5 of 9. Round 26
got 5 of 9 again - but its three HIGH-confidence calls were 3 of 3, and all
three named the same feature.

WHAT THIS SCRIPT DOES, AND WHAT IT DELIBERATELY DOES NOT PRINT
--------------------------------------------------------------
  * crops the 12 windows chosen upstream by RULE (see below) out of the two
    arms' 1280x720 frames, at identical coordinates;
  * upscales each 360x240 crop 2x to 720x480, so the pair is judged at the
    720 px scale the scale-ladder says the discrimination lives at;
  * re-encodes BOTH halves through ONE encoder at q88 4:2:0 - the symmetric
    codec control this project made standing after a round's headline
    statistic turned out to be the codec;
  * randomises left/right per pair from a seed passed on the command line;
  * writes the key to KEY.json inside the set directory and PRINTS NOTHING
    ABOUT IT.

THE WINDOWS WERE NOT CHOSEN ON THE DIFFERENCE. They were chosen in the browser,
in the OFF arm only, by rendering each pose twice - once normally and once with
the `rails` and `shelfTags` soups hidden - and keeping windows where that
depth-buffer difference covers at least 3% of the window. Then two per pose,
uniformly at random from the accepted set at stated seed 27, rejecting a second
pick that overlaps the first by more than a quarter. Selecting crops on where
the two ARMS differ would manufacture the result; selecting on where the object
under test is VISIBLE is the question.

ONE-SIDED SCORING NOTE, stated before the score: the person scoring this built
the change, so a HIGH score is weak evidence - it may only show that the author
can recognise his own diff. A score at CHANCE is strong evidence, because it
says the change is invisible even to someone who knows exactly what was done
and where. Round 24's critic made the same point from the other side.
"""
import json
import os
import random
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')

# chosen in-browser by the rule in the docstring; pasted verbatim
WINDOWS = [
    {"pose": "near_a1", "x": 200, "y": 200, "w": 360, "h": 240, "frac": 0.1551},
    {"pose": "near_a1", "x": 320, "y": 0, "w": 360, "h": 240, "frac": 0.1871},
    {"pose": "near_a4", "x": 200, "y": 80, "w": 360, "h": 240, "frac": 0.1199},
    {"pose": "near_a4", "x": 720, "y": 120, "w": 360, "h": 240, "frac": 0.1559},
    {"pose": "near_a7", "x": 680, "y": 400, "w": 360, "h": 240, "frac": 0.2087},
    {"pose": "near_a7", "x": 400, "y": 120, "w": 360, "h": 240, "frac": 0.0384},
    {"pose": "chase_a1", "x": 680, "y": 200, "w": 360, "h": 240, "frac": 0.089},
    {"pose": "chase_a1", "x": 80, "y": 160, "w": 360, "h": 240, "frac": 0.0981},
    {"pose": "chase_a4", "x": 200, "y": 320, "w": 360, "h": 240, "frac": 0.0665},
    {"pose": "chase_a4", "x": 640, "y": 320, "w": 360, "h": 240, "frac": 0.0487},
    {"pose": "chase_a6", "x": 320, "y": 240, "w": 360, "h": 240, "frac": 0.0739},
    {"pose": "chase_a6", "x": 880, "y": 240, "w": 360, "h": 240, "frac": 0.1287},
]

# ROUND 2 of the instrument. Run 1 came back 6 of 12 - chance - and its own
# diagnostic was worse than its total: the scorer called RIGHT on 11 of 12
# pairs, so the score is almost entirely the base rate of which side the
# shuffle put the ON arm on, and the three HIGH-confidence calls that landed on
# the largest pixel differences in the set (arm MAD 9.28, 8.97, 11.86) were all
# WRONG. That is a broken administration, not a null result, and it is reported
# as one. Run 2 stacks the halves VERTICALLY on fresh windows so a left/right
# habit cannot produce the answer, and its calls are TOP/BOTTOM.
#
# Run 2 is NOT an "is it visible" test and must not be quoted as one: by then
# the scorer had seen run 1's key and knew the polarity of the cue. It answers
# two narrower questions - does the side bias survive a change of axis, and is
# the change visible to someone who has been TOLD what to look for.
WINDOWS2 = [
    {"pose": "near_a1", "x": 400, "y": 320, "w": 360, "h": 240, "frac": 0.2356},
    {"pose": "near_a1", "x": 800, "y": 360, "w": 360, "h": 240, "frac": 0.2282},
    {"pose": "near_a4", "x": 440, "y": 480, "w": 360, "h": 240, "frac": 0.0955},
    {"pose": "near_a4", "x": 920, "y": 400, "w": 360, "h": 240, "frac": 0.0695},
    {"pose": "near_a7", "x": 880, "y": 360, "w": 360, "h": 240, "frac": 0.2558},
    {"pose": "near_a7", "x": 520, "y": 160, "w": 360, "h": 240, "frac": 0.1339},
    {"pose": "chase_a1", "x": 640, "y": 160, "w": 360, "h": 240, "frac": 0.0501},
    {"pose": "chase_a1", "x": 120, "y": 360, "w": 360, "h": 240, "frac": 0.2112},
    {"pose": "chase_a4", "x": 920, "y": 360, "w": 360, "h": 240, "frac": 0.0792},
    {"pose": "chase_a4", "x": 80, "y": 200, "w": 360, "h": 240, "frac": 0.0457},
    {"pose": "chase_a6", "x": 800, "y": 360, "w": 360, "h": 240, "frac": 0.0607},
    {"pose": "chase_a6", "x": 360, "y": 280, "w": 360, "h": 240, "frac": 0.0723},
]

GUTTER = 16


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 8171
    vertical = '--v' in sys.argv
    wins = WINDOWS2 if vertical else WINDOWS
    rng = random.Random('r27forced|%d' % seed)
    name = 'r27_fc_' + ''.join(rng.choice('abcdefghijkmnpqrstuvwxyz23456789') for _ in range(8))
    out = os.path.join(SHOTS, name)
    os.makedirs(out, exist_ok=True)

    order = list(range(len(wins)))
    rng.shuffle(order)
    key = []
    for slot, wi in enumerate(order):
        w = wins[wi]
        box = (w['x'], w['y'], w['x'] + w['w'], w['y'] + w['h'])
        off = Image.open(os.path.join(SHOTS, 'r27_off_%s.png' % w['pose'])).convert('RGB').crop(box)
        on = Image.open(os.path.join(SHOTS, 'r27_on_%s.png' % w['pose'])).convert('RGB').crop(box)
        off = off.resize((w['w'] * 2, w['h'] * 2), Image.LANCZOS)
        on = on.resize((w['w'] * 2, w['h'] * 2), Image.LANCZOS)
        left_is_on = rng.random() < 0.5
        L, R = (on, off) if left_is_on else (off, on)
        cw, ch = L.size
        if vertical:
            comp = Image.new('RGB', (cw, ch * 2 + GUTTER), (16, 16, 16))
            comp.paste(L, (0, 0))
            comp.paste(R, (0, ch + GUTTER))
        else:
            comp = Image.new('RGB', (cw * 2 + GUTTER, ch), (16, 16, 16))
            comp.paste(L, (0, 0))
            comp.paste(R, (cw + GUTTER, 0))
        # ONE encoder, both halves, same settings - the symmetric codec control
        comp.save(os.path.join(out, 'pair_%02d.jpg' % slot),
                  quality=88, subsampling='4:2:0', optimize=False)
        key.append({'slot': slot, 'window': wi, 'pose': w['pose'],
                    'box': list(box),
                    'first': 'ON' if left_is_on else 'OFF',
                    'axis': 'vertical' if vertical else 'horizontal'})

    with open(os.path.join(out, 'KEY.json'), 'w') as f:
        json.dump({'seed': seed, 'key': key}, f, indent=1)
    print(name)
    print('%d pairs, 720x480 per half, q88 4:2:0 through one encoder' % len(key))


if __name__ == '__main__':
    main()
