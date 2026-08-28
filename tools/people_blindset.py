#!/usr/bin/env python3
"""BLIND SET FOR THE PEOPLE.

The whole-frame harness (tools/wholeframe_blindset.py) answers the STORE bar and
it has been won nine times. It cannot answer this one: a 1280x720 frame of our
store is mostly store, so a critic scoring it is scoring shelves, floor and
ceiling. The people occupy a few percent of it.

So this harness crops, and cropping reopens five of the eight leaks catalogued in
tools/r22_blindset.py. Each one is closed here explicitly or declared open.

  LEAK 1  builder-chosen crops flattered the build.
          CLOSED ON THE RENDER SIDE BY CONSTRUCTION: render boxes are projected
          from agent world positions by main.js, not chosen. Nobody picks which
          shopper looks good.
          OPEN ON THE PHOTO SIDE AND SAID SO: a human annotates person boxes in
          the photographs, because there is no detector here. The annotation is
          in reference/people/boxes.json, it is committed, and it is written
          ONCE -- before any arm is captured -- so it cannot be tuned against a
          result. Whoever adds photographs re-annotates blind to the renders.

  LEAK 2  file size separated the classes perfectly; a critic could score from
          `ls`. CLOSED: one encoder, one quality, 4:2:0, identical dimensions.

  LEAK 3  too few poses. CLOSED: MIN_BODIES bodies from >= MIN_POSES poses.

  LEAK 5  subject mismatch. This is the one that matters here and it is why the
          harness exists in this shape. A 900px-tall person photographed at 2 m
          against a 60px-tall render at 12 m is a test of RESOLUTION, not of
          craft, and the render loses it every time without telling you anything.
          CLOSED BY SCALE NORMALISATION: every box is expanded about the
          subject to TILE_AR and resampled to exactly TILE, so a person is the
          same pixel height in both classes. The scale a build is judged at is
          then a parameter -- see SCALES -- instead of an accident.

  LEAK 6  group size gave the split away. CLOSED: split randomised, never
          printed, and n equalised per arm.

  LEAK 7  per-arm seeding; the key once fell out of `md5`. CLOSED: arm_seed.

  LEAK 8  a content gate on one side only. NOT REOPENED: the only gate here is
          "the box contains a person", which is what both classes are supposed
          to contain. No edge-density, no product-fraction, no proxy that could
          select one population to resemble the other.

WHAT THIS DOES NOT TEST. Motion. A still cannot show you a gait, and gait is
half of what the client asked for. Frame strips are judged separately and are
not blind -- there is nothing to blind them against, since we have no video of
the reference. Do not let a win here stand in for a win on movement.

USAGE
    python3 tools/people_blindset.py <arm> <outdir> [seed] [scale]

`<arm>` names render plates shots/<arm>_<pose>.png, each with a sidecar
shots/<arm>_<pose>.boxes.json written by C.snapPeople() holding
[{x, y, w, h, id}] in image pixels.
"""
import json, os, random, sys
from PIL import Image

ROOT   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF    = os.path.join(ROOT, 'reference', 'people')
SHOTS  = os.path.join(ROOT, 'shots')
BOXES  = os.path.join(REF, 'boxes.json')

TILE_AR   = 3 / 4          # w:h. People are tall; a square wastes half the tile
SCALES    = {'far': (96, 128), 'mid': (168, 224), 'near': (288, 384)}
QUALITY   = 82             # one encoder, one quality, both classes
MIN_BODIES = 10
MIN_POSES  = 3


def arm_seed(arm, seed):
    """Per-arm seed. LEAK 7. Two rounds shipped sets whose photographs were
    byte-identical across arms because the wrappers never called the fixed
    function -- so this is called from exactly one place, below."""
    return random.Random(f'{arm}:{seed}')


def expand(box, iw, ih):
    """Grow a person box to TILE_AR about its own centre, then clamp into the
    image. Returns None if the subject cannot be framed without letterboxing --
    black bars are a class tell as loud as file size was."""
    x, y, w, h = box
    if w <= 2 or h <= 2:
        return None
    cw, ch = h * TILE_AR, h
    if cw < w:
        cw, ch = w, w / TILE_AR
    cx, cy = x + w / 2, y + h / 2
    x0, y0 = cx - cw / 2, cy - ch / 2
    x0 = max(0, min(x0, iw - cw))
    y0 = max(0, min(y0, ih - ch))
    if cw > iw or ch > ih:
        return None
    return (int(x0), int(y0), int(x0 + cw), int(y0 + ch))


def tile(im, box, size):
    b = expand(box, im.width, im.height)
    if b is None:
        return None
    return im.crop(b).resize(size, Image.LANCZOS).convert('RGB')


def render_tiles(arm, size):
    out = []
    for f in sorted(os.listdir(SHOTS)):
        if not (f.startswith(arm + '_') and f.endswith('.boxes.json')):
            continue
        pose = f[len(arm) + 1:-len('.boxes.json')]
        png = os.path.join(SHOTS, f'{arm}_{pose}.png')
        if not os.path.exists(png):
            print(f'  no plate for {pose}', file=sys.stderr)
            continue
        im = Image.open(png)
        for b in json.load(open(os.path.join(SHOTS, f))):
            t = tile(im, (b['x'], b['y'], b['w'], b['h']), size)
            if t is not None:
                out.append((t, pose))
    return out


def photo_tiles(size):
    if not os.path.exists(BOXES):
        sys.exit(f'no annotation at {BOXES} -- annotate the photographs first')
    ann, out = json.load(open(BOXES)), []
    for name, boxes in sorted(ann.items()):
        p = os.path.join(REF, name)
        if not os.path.exists(p):
            print(f'  annotated but missing: {name}', file=sys.stderr)
            continue
        im = Image.open(p).convert('RGB')
        for b in boxes:
            t = tile(im, (b['x'], b['y'], b['w'], b['h']), size)
            if t is not None:
                out.append((t, name))
    return out


def main():
    if len(sys.argv) < 3:
        sys.exit(__doc__.strip().rsplit('USAGE', 1)[-1])
    arm, outdir = sys.argv[1], sys.argv[2]
    seed  = sys.argv[3] if len(sys.argv) > 3 else 'x'
    scale = sys.argv[4] if len(sys.argv) > 4 else 'mid'
    size  = SCALES[scale]
    rng   = arm_seed(arm, seed)

    R, P = render_tiles(arm, size), photo_tiles(size)
    poses = {p for _, p in R}
    if len(R) < MIN_BODIES or len(poses) < MIN_POSES:
        sys.exit(f'thin render side: {len(R)} bodies from {len(poses)} poses '
                 f'(need {MIN_BODIES} from {MIN_POSES}) -- LEAK 3')
    if len(P) < MIN_BODIES:
        sys.exit(f'thin photo side: {len(P)} bodies (need {MIN_BODIES})')

    # Equalise n so the split cannot be read off the count, then take a random
    # subset of each -- the split itself is jittered away from 50/50 and never
    # printed anywhere the critic can reach.
    n = min(len(R), len(P))
    k = max(MIN_BODIES, n - rng.randint(0, max(1, n // 5)))
    rng.shuffle(R); rng.shuffle(P)
    items = [(t, 'render', s) for t, s in R[:k]] + [(t, 'photo', s) for t, s in P[:k]]
    rng.shuffle(items)

    os.makedirs(outdir, exist_ok=True)
    key = {}
    for t, cls, src in items:
        name = ''.join(rng.choice('abcdefghijklmnopqrstuvwxyz0123456789')
                       for _ in range(10)) + '.jpg'
        t.save(os.path.join(outdir, name), 'JPEG',
               quality=QUALITY, subsampling=2, optimize=False)
        key[name] = {'class': cls, 'src': src}

    with open(os.path.join(outdir, '_KEY.json'), 'w') as f:
        json.dump({'arm': arm, 'scale': scale, 'size': size, 'key': key}, f, indent=1)
    print(f'{len(items)} tiles at {size[0]}x{size[1]} ({scale}) -> {outdir}')
    print('_KEY.json is the answer key. Do NOT give the critic this directory '
          'listing with it in place -- move it out first.')


main()
