#!/usr/bin/env python3
"""BUILDER-PACK r22 — the blind crop set, chosen by SCRIPT, left unscored.

AGENTS_BRIEF: "Anyone who has read the brand table is disqualified from the
blind test on this store, permanently." This builder has read brands.js, so it
generates the set and does not open the key.

THE LEAK LEDGER. Five have been found in this harness. Four are closed here and
the fifth is open and named, because a leak you have written down is cheaper
than one you have papered over. A blind test that leaks cannot register an
improvement in the render no matter how good the render gets -- the score is
pinned by the harness, not by the picture.

  LEAK 1 (closed, r21 critic) -- builder-chosen crops. Two near-empty shelf
    views had been picked by eye. No window is chosen by eye now: a render crop
    is accepted only if PKG_STAGE 7, the package shader's own product mask, says
    at least MIN_PROD of it is package, and the measured fraction of every
    accepted tile goes into the key so a critic can check the set was not
    stacked.

  LEAK 2 (closed, r22 critic) -- FILE SIZE SCORED THE SET BY ITSELF. Photograph
    tiles are crops of 4:2:0 JPEGs re-saved as PNG and compress badly; render
    tiles were clean. Separation was total: render max 600,898 bytes against
    photo min 870,709, a 269,811-byte gap with no overlap. A critic could have
    scored 100% from `ls` without looking at a picture. The same asymmetry was
    also contaminating the statistic that round was built on -- a symmetric JPEG
    round-trip collapsed the facing-flatness gap from +0.045/+0.031 to
    +0.010/-0.010. Both are fixed by ONE encoder at ONE quality for BOTH
    classes; verified by re-encoding the shipped sets, render 148,809-165,263
    against photo 141,848-240,524, overlapping.

  LEAK 3 (closed here) -- n=1 POSE. r22's set was generated with only near_a4
    captured, so every render tile was a window on one frame, pixel-identical on
    overlaps. Class calls survive it; no population statistic does. This script
    always iterated all six poses, so the fault was upstream -- it now FAILS
    LOUDLY rather than quietly emitting an unquotable set.

  LEAK 4 (closed here) -- CROSS-TILE CATALOGUE GROUPING, and it was the worst of
    them. Ten render tiles shared one invented catalogue while nine photographs
    showed nine different real stores, so the classes partition on grouping
    alone: a repeated catalogue reads render, a singleton reads photograph, and
    no per-tile judgement is needed. The render side cannot help being one
    catalogue -- there is one store -- so the photo side is now matched to it,
    a couple of files per set with several crops each, so both classes show
    repeated catalogues and grouping yields clusters with no labels on them.

  LEAK 5 (OPEN, named) -- CONTENT MATCHING. Render tiles are gated to >=55%
    package, but photo files are drawn at random, so a set can pair packed
    aisle renders against produce or checkout photographs. A critic could then
    call on subject matter rather than on rendering. Until this is closed, pick
    the seed so the photo files match the render arm's content, and say in the
    report which files a set drew.

Two things r21's critic flagged about builder-made sets are fixed here:

  * "builder-chosen crops included two near-empty shelf views."  No window is
    chosen by eye. A render crop is accepted only if PKG_STAGE 7 — the package
    shader's own product mask — says at least MIN_PROD of it is package. That
    threshold is stated, and the measured product fraction of every accepted
    tile is written into the key so a critic can check the set was not
    stacked.
  * aspect / resolution / file format leaking the class.  Every tile is a
    720x720 PNG cut from a 1280-wide frame, both sides, so nothing outside the
    picture separates them.

The split is randomised away from 50/50 and the key is written to a file this
script does not print.
"""
import glob
import json
import os
import random
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference')
SHOTS = os.path.join(ROOT, 'shots')

TILE = 720
# LEAK 5, SECOND HALF. Restricting the photo pool to packed aisles narrowed the
# subject mismatch but did not close it. r25's critic: "all 9 renders are flat-on
# shelf faces and all 12 photographs are corridor views with floor, ceiling and a
# vanishing point. The set partitions on 'is there a floor?' -- nothing to do
# with render quality." That asymmetry was made HERE: a >=55% product gate admits
# only the near poses, while a crop of an aisle photograph naturally contains
# floor and ceiling. So the gate is loosened to admit the chase poses (14-26%
# product) and the guard below requires BOTH pose families to contribute, which
# also moves the test back toward the bar as written in PROMPT.md -- a whole
# frame beside a whole photograph, not a magnified shelf-face crop.
# (The critic tried and failed to QUANTIFY the mismatch -- smooth-area fraction
# and a floor detector both overlapped heavily, because real floors are speckled
# terrazzo. It stands as a structural observation, which is why it is fixed by
# construction here rather than measured.)
MIN_PROD = 0.15          # of the tile must be package, by the shader's own mask
NEAR = ('near_a1', 'near_a4', 'near_a7')
CHASE = ('chase_a1', 'chase_a4', 'chase_a6')
# CODEC NORMALISATION. Every tile, BOTH classes, goes through one encoder at one
# quality, in the reference set's own 4:2:0. See the note over the save loop.
ENCODE_Q = 88
ENCODE_SS = 2            # 4:2:0, matching the 14 reference JPEGs
POSES = ['near_a1', 'near_a4', 'near_a7', 'chase_a1', 'chase_a4', 'chase_a6']


# LEAK 8, second half -- AND A FIX THAT WAS MEASURED AND REJECTED.
#
# `prod_frac` gates only the RENDER side; `photo_tiles` emits every stride window
# ungated, so leak 5 is closed at the level of FILES (the SHELF_FACE list) and
# still open at the level of CROPS. r26's critic named four: ceiling, department
# signage, and a glass floral cooler -- content no render crop can hold. It cost
# it 4 misses out of 18, so it was not load-bearing for that score, but the photo
# class is not testing what this harness claims.
#
# THE OBVIOUS FIX IS WRONG AND WAS NOT SHIPPED. A symmetric edge-density gate was
# built and calibrated against the actual offending tiles:
#
#     offending photo crops   edge_frac 0.346, 0.369, 0.380, 0.390
#     good render crops       edge_frac 0.412, 0.425, 0.426, 0.428, 0.457
#     photo whole frames      edge_frac 0.346 - 0.440
#
# A threshold near 0.40 would indeed drop the offenders -- because THE PROXY
# ITSELF DISCRIMINATES CLASS. Gating on it would select the photo population to
# resemble the render population, make the selector the thing under test, and
# quietly delete the photographs least like a render. That is this file's own
# standing rule ("if your rule selects the two populations differently, you are
# measuring the selector") pointed at the harness. Rejected, and recorded here so
# nobody spends a round rediscovering it.
#
# The principled fix is to stop cropping. See tools/wholeframe_blindset.py:
# PROMPT.md's bar is a screenshot beside a real store photo -- a WHOLE FRAME. Of
# the eight leaks found in this harness, five (1, 4, 5, 6, 8) exist only because
# something had to choose a window.


def arm_seed(arm, seed):
    """The per-arm seed. LEAK 7's fix, and it lives HERE because it was fixed
    in r22_blindset.main and the r24/r25 wrappers never called that function --
    so two more rounds shipped sets whose photographs were byte-identical
    across arms and whose answer key fell straight out of `md5`. Fixing a
    definition is not fixing the call sites; every wrapper calls this.

    SECOND COPY, KNOWINGLY LEFT: r26_blindset has its own arm_seed doing FNV-1a
    to an int, written because its author feared Python's hash randomisation
    would make a string seed unreproducible between runs. That fear does not
    apply -- random.Random(str) seeds through sha512, not hash(), and this was
    checked rather than assumed: PYTHONHASHSEED 0, 1 and 12345 all give
    0.9621357655761895 for ('41','r26on'). Both derivations are correct and
    they return different values, so an equality assertion between them would
    be wrong. r26's sets were sealed and awaiting a score when this was found,
    and regenerating them would have broken their reproducibility, so it was
    left. NEW WRAPPERS CALL THIS ONE."""
    return '%s|%s' % (seed, arm)


def prod_frac(mask, x, y, s):
    px = mask.load()
    hit = tot = 0
    for yy in range(y, y + s, 6):
        for xx in range(x, x + s, 6):
            r, g, b = px[xx, yy]
            tot += 1
            if r < 12 and g > 240 and b < 12:
                hit += 1
    return hit / max(1, tot)


MIN_POSES = 3            # see LEAK 3 in the module docstring


def render_tiles(arm):
    out = []
    seen_poses = []
    for pose in POSES:
        f = os.path.join(SHOTS, '%s_%s.png' % (arm, pose))
        mf = os.path.join(SHOTS, 'r22mask_%s.png' % pose)
        if not (os.path.exists(f) and os.path.exists(mf)):
            continue
        seen_poses.append(pose)
        im = Image.open(f).convert('RGB')
        mask = Image.open(mf).convert('RGB')
        # every 720x720 window on a 40 px lattice, accepted on the mask alone
        for x in range(0, im.width - TILE + 1, 40):
            for y in range(0, im.height - TILE + 1, 40):
                p = prod_frac(mask, x, y, TILE)
                if p >= MIN_PROD:
                    out.append((im.crop((x, y, x + TILE, y + TILE)),
                                '%s %s %d,%d prod=%.2f' % (arm, pose, x, y, p)))
    # LEAK 3. r22's set was generated with only near_a4 captured, so every render
    # tile was a window on ONE frame, pixel-identical on overlaps. Its critic:
    # "effective sample is n=1 pose per arm, not 9 and 11." The class calls
    # survive that -- a tell visible in one frame is still a tell -- but no
    # population statistic on the render side does.
    #
    # THE FIRST FIX HERE WAS VACUOUS AND r24'S BUILDER CAUGHT IT. It counted
    # pose FILES that existed, not poses that produced a tile -- and at
    # MIN_PROD 0.55 the per-pose yield on both arms was `near_a4 15,
    # everything else 0`. Every frame was present, the guard passed, and the
    # set was still n=1. A check that certifies something it cannot see, in
    # the harness whose own ledger documents that failure twice.
    #
    # It now counts CONTRIBUTING poses, and main() enforces per-pose spread in
    # the selection as well -- a pool drawn from three poses can still be
    # sampled nine-from-one.
    by_pose = {}
    for _, why in out:
        k = why.split()[1]
        by_pose[k] = by_pose.get(k, 0) + 1
    fam = {'near': sum(v for k, v in by_pose.items() if k in NEAR),
           'chase': sum(v for k, v in by_pose.items() if k in CHASE)}
    if not (fam['near'] and fam['chase']):
        raise SystemExit(
            'blindset: arm %r contributed %r -- both a near pose and a chase '
            'pose must contribute, or the render side is all flat-on shelf face '
            'while the photo side is all corridor view, and the set partitions '
            'on "is there a floor?" (leak 5).' % (arm, fam))
    if len(by_pose) < MIN_POSES:
        raise SystemExit(
            'blindset: arm %r yielded tiles from only %d pose(s) %r at '
            'MIN_PROD %.2f (frames present: %s). A set built from this is n=1 '
            'and no population statistic on the render side would mean '
            'anything. Lower MIN_PROD or capture more poses.'
            % (arm, len(by_pose), by_pose, MIN_PROD,
               ', '.join(seen_poses) or 'none'))
    return out


PHOTO_FILES_RANGE = (2, 3)   # see LEAK 4 and LEAK 6 in the module docstring
PHOTO_FILES = 2              # floor, used by the subject-filter check below
PHOTO_STRIDE = 120

# LEAK 5 (closed here). Photo files were drawn at random from all 14 references,
# so a set could pair packed-aisle render tiles -- which are gated to >=55%
# package by the shader's own mask -- against vistas, checkout lanes, produce or
# a Halloween display. r24's critic found exactly that in the r24on arm: "every
# photograph there is a vista or the floral department; not one is a flat-on
# shelf face. Subject matter alone partitions that arm perfectly." Its own calls
# were rendering-based and its framing-controlled re-test still gave 18/18, so
# the score survived -- but that arm did not test what it claimed to test.
#
# The render tiles are always packed shelf face. So the photo pool is restricted
# to the references that are also packed shelf face, listed here by prefix with
# the reason each of the other seven is excluded. Pass subjects=None to
# photo_tiles() to draw from everything, and say so in the report if you do.
SHELF_FACE = (
    'store_00_Drinks_aisle',            # packed aisle, drinks
    'store_00_Port_Gibson',             # packed aisle, frozen (open case)
    'store_01_Canned_and_packaged',     # shelf face, cans and pouches
    'store_01_Langenstein',             # packed centre aisle
    'store_02_Langenstein',             # packed interior aisle
    'store_03_Food_aisle',              # packed aisle, Publix
    'store_05_Ingles',                  # packed aisle
)
# EXCLUDED, and why -- store_04 frozen doors (the subject is reflective glass,
# not a shelf face); store_06 and store_07 checkout lanes; store_08 a Halloween
# display; store_09 a whole-store vista; store_11 and store_12 produce.


def photo_tiles(rnd, subjects=SHELF_FACE):
    # LEAK 4. Drawing from all 14 references gave a set where ten tiles shared
    # one invented catalogue and nine showed nine different real stores, so
    # r23's critic could partition the classes on CROSS-TILE GROUPING before
    # judging any single tile: a repeated catalogue reads render, a singleton
    # reads photograph, and no per-tile judgement is needed at all. The render
    # side cannot help being one catalogue -- there is one store. So the photo
    # side is matched to it: a few files per set, several crops each, so BOTH
    # classes show repeated catalogues and grouping yields clusters with no
    # labels on them. Rotate which files by reseeding.
    out = []
    files = [q for q in sorted(glob.glob(os.path.join(REF, '*')))
             if os.path.basename(q) != 'CREDITS.md']
    if subjects:
        files = [q for q in files
                 if any(os.path.basename(q).startswith(k) for k in subjects)]
        if len(files) < PHOTO_FILES:
            raise SystemExit('blindset: subject filter left %d file(s), need %d'
                             % (len(files), PHOTO_FILES))
    rnd.shuffle(files)
    # LEAK 6. Even after leaks 4 and 5, GROUP SIZE still partitioned the classes:
    # r24's sets held 9 render tiles over 3 poses against 2 photo files, so the
    # clusters were 3+3+3 against 6+6 and a critic could separate them on the
    # shape of the partition without judging a tile. Both sides now draw an
    # irregular number of sources, and main() deals both classes unevenly.
    nf = rnd.randint(*PHOTO_FILES_RANGE)
    for p in files[:nf]:
        try:
            im = Image.open(p).convert('RGB')
        except Exception:
            continue
        im = im.resize((1280, int(im.height * 1280 / im.width)), Image.LANCZOS)
        if im.height < TILE:
            continue
        for x in range(0, im.width - TILE + 1, PHOTO_STRIDE):
            for y in range(0, im.height - TILE + 1, PHOTO_STRIDE):
                out.append((im.crop((x, y, x + TILE, y + TILE)),
                            '%s %d,%d' % (os.path.basename(p)[:34], x, y)))
    return out


def main():
    arm = sys.argv[1] if len(sys.argv) > 1 else 'r22on'
    outdir = sys.argv[2]
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else None
    # LEAK 7. r25's two arms were generated with the same seed, so their photo
    # tiles were BYTE-IDENTICAL and shared tile indices, and only the renders
    # differed. `md5`-ing the two directories therefore returned exactly the 9
    # render filenames -- THE COMPLETE ANSWER KEY, AT ZERO PIXELS EXAMINED. Its
    # critic found it in the inventory listing before looking at an image, and
    # had to re-copy all 42 tiles to opaque shuffled names to recover any
    # blindness at all. Verified by the lead afterwards: the 9 byte-different
    # tiles were precisely the 9 renders in both keys.
    #
    # The arm name is mixed into the seed, so the photo draw, the crop windows
    # and the tile ORDER all differ per arm. Two arms are no longer diffable.
    rnd = random.Random(arm_seed(arm, seed))
    R = render_tiles(arm)
    P = photo_tiles(rnd)
    rnd.shuffle(R)
    rnd.shuffle(P)
    # split away from 50/50, as the r20 protocol does
    nR = rnd.randint(8, 12)
    nP = rnd.randint(8, 12)
    # LEAK 3, second half: deal the render tiles ROUND-ROBIN over the poses that
    # contributed, so a three-pose pool cannot be sampled nine-from-one. The
    # guard above proves the pool is spread; this makes the SET spread too.
    buckets = {}
    for t, w in R:
        buckets.setdefault(w.split()[1], []).append((t, w))
    order = sorted(buckets)
    rnd.shuffle(order)
    # Deal round-robin for spread, but with a random per-pose weight so the group
    # sizes are irregular (LEAK 6) rather than an even 3+3+3.
    wt = {k: rnd.uniform(0.6, 1.8) for k in order}
    picked = []
    while len(picked) < nR and any(buckets[k] for k in order):
        live = [k for k in order if buckets[k]]
        k = rnd.choices(live, weights=[wt[k] for k in live])[0]
        picked.append(buckets[k].pop())
    # same treatment on the photo side: P is already shuffled across its files
    tiles = [(t, 'RENDER', w) for (t, w) in picked] + [(t, 'PHOTO', w) for (t, w) in P[:nP]]
    rnd.shuffle(tiles)
    os.makedirs(outdir, exist_ok=True)
    key = []
    # ------------------------------------------------------------------
    # ROUND 22'S CRITIC FOUND TWO SEPARATE LEAKS HERE, AND THEY HAVE THE SAME FIX.
    #
    # (1) FILE SIZE SCORED THE SET BY ITSELF. Photograph tiles are crops of
    #     4:2:0 JPEGs re-saved as PNG, so they carry compression noise and
    #     compress badly; render tiles were clean. The separation was TOTAL and
    #     had no overlap - render max 600,898 bytes against photo min 845,238, a
    #     244 KB gap - so a critic could have scored 100% from `ls` without ever
    #     looking at a picture. (r22's critic saw the sizes in its first listing,
    #     did not use them, and gave a visual reason for every sealed call.)
    #
    # (2) THE SAME ASYMMETRY CONTAMINATED THE STATISTIC THE ROUND WAS BUILT ON.
    #     Applying one identical JPEG round-trip to both classes collapsed the
    #     facing-flatness gap from +0.045 (r21) and +0.031 (r22) to +0.010 and
    #     -0.010, stable and monotone across quality 75-95. Most of that "gap"
    #     was the codec, not the render.
    #
    # So: ONE encoder, ONE quality, BOTH classes, in the reference set's own
    # 4:2:0. DO NOT REVERT THIS TO PNG, and apply the same symmetric control to
    # any statistic compared across the render/photograph boundary.
    #
    # What this does NOT do: sizes still vary with content, and a genuinely
    # flatter render still compresses smaller. That residue is the thing under
    # test rather than a harness artefact - but it is why a critic must score
    # from pixels and never from file metadata.
    # ------------------------------------------------------------------
    for i, (im, cls, why) in enumerate(tiles):
        n = 'tile_%02d.jpg' % i
        im.save(os.path.join(outdir, n), 'JPEG', quality=ENCODE_Q,
                subsampling=ENCODE_SS)
        key.append({'tile': n, 'class': cls, 'provenance': why})
    with open(os.path.join(outdir, 'KEY_DO_NOT_OPEN.json'), 'w') as f:
        json.dump({'arm': arm, 'minProd': MIN_PROD, 'tile': TILE, 'key': key}, f, indent=1)
    print('%d tiles written to %s (split not printed)' % (len(tiles), outdir))


if __name__ == '__main__':
    main()
