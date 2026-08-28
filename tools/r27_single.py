#!/usr/bin/env python3
"""BUILDER-RAIL r27 - RUN 3. THE SAME QUESTION WITH POSITION REMOVED.

WHY THIS EXISTS, AND IT IS THE ROUND'S SECOND FINDING
-----------------------------------------------------
Runs 1 and 2 of the matched-arm forced choice both came back 6 of 12 - chance -
and both carried the SAME defect: the scorer named the second-presented half in
11 of 12 pairs. Run 1 was side by side and the answer was always "right"; run 2
was stacked and the answer was always "bottom". Two orthogonal axes, one bias.

A forced choice administered by an observer with a 92% position bias measures
the shuffle, not the render. So the total from runs 1 and 2 is NOT evidence that
the change is invisible - it is evidence that THAT instrument, administered by
THIS scorer, cannot answer the question. Publishing it as a null would be the
same error as quoting a statistic that turned out to be the codec.

Run 3 removes position by construction: ONE crop per image, judged on its own,
"channel or flat". There is no left, right, top or bottom to be biased toward.
Sixteen images - eight windows, both arms, shuffled - and the score is against a
50% base rate exactly as before.

Run 3 is an INFORMED test and is labelled as such: by now the scorer has seen
two keys and knows what the change does. It answers "can an observer who knows
exactly what to look for tell these apart at all", which is the weaker question.
The naive question was answered by run 1 and the answer there is unusable.

Windows: chosen in the browser by the same rule as runs 1 and 2 - rail-family
pixels, found by re-rendering each pose with the `rails` and `shelfTags` soups
hidden, covering at least 3% of the window - one per pose plus two extra, drawn
uniformly at stated seed 901. Crops are upscaled 2x to 720x480 and every image
goes through ONE encoder at q88 4:2:0.
"""
import json
import os
import random
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')

WINDOWS3 = [
    {"pose": "near_a1", "x": 120, "y": 40, "w": 360, "h": 240, "frac": 0.2004},
    {"pose": "near_a4", "x": 240, "y": 400, "w": 360, "h": 240, "frac": 0.1063},
    {"pose": "near_a7", "x": 720, "y": 280, "w": 360, "h": 240, "frac": 0.2040},
    {"pose": "chase_a1", "x": 0, "y": 360, "w": 360, "h": 240, "frac": 0.2859},
    {"pose": "chase_a4", "x": 280, "y": 360, "w": 360, "h": 240, "frac": 0.0470},
    {"pose": "chase_a6", "x": 280, "y": 280, "w": 360, "h": 240, "frac": 0.1061},
    {"pose": "near_a1", "x": 840, "y": 240, "w": 360, "h": 240, "frac": 0.3841},
    {"pose": "near_a4", "x": 360, "y": 240, "w": 360, "h": 240, "frac": 0.1084},
]


def main():
    seed = int(sys.argv[1]) if len(sys.argv) > 1 else 3311
    rng = random.Random('r27single|%d' % seed)
    name = 'r27_s1_' + ''.join(rng.choice('abcdefghijkmnpqrstuvwxyz23456789') for _ in range(8))
    out = os.path.join(SHOTS, name)
    os.makedirs(out, exist_ok=True)

    items = [(wi, arm) for wi in range(len(WINDOWS3)) for arm in ('ON', 'OFF')]
    rng.shuffle(items)
    key = []
    for slot, (wi, arm) in enumerate(items):
        w = WINDOWS3[wi]
        box = (w['x'], w['y'], w['x'] + w['w'], w['y'] + w['h'])
        src = 'r27_%s_%s.png' % ('on' if arm == 'ON' else 'off', w['pose'])
        im = Image.open(os.path.join(SHOTS, src)).convert('RGB').crop(box)
        im = im.resize((w['w'] * 2, w['h'] * 2), Image.LANCZOS)
        im.save(os.path.join(out, 'tile_%02d.jpg' % slot),
                quality=88, subsampling='4:2:0', optimize=False)
        key.append({'slot': slot, 'window': wi, 'pose': w['pose'], 'arm': arm, 'box': list(box)})

    with open(os.path.join(out, 'KEY.json'), 'w') as f:
        json.dump({'seed': seed, 'key': key}, f, indent=1)
    print(name)
    print('%d single tiles, 720x480, q88 4:2:0 through one encoder' % len(key))


if __name__ == '__main__':
    main()
