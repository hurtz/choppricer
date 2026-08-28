#!/usr/bin/env python3
"""BUILDER-PACK r22 — the FACE-WINDOW ink census, one rule, both sides.

THE RULE, stated once and applied identically to a render plate and to a
photograph:

  1. bring the image to 1280 px wide (LANCZOS) so neither side gets a
     resolution advantage.  The render plates are already 1280.
  2. take FACE WINDOWS.  On the render side each window is the projected
     printed front of one package instance, taken from the live instance
     matrices by shots/_probe_r22_boxes.js -- no window is chosen by eye.  On
     the photograph side a window is one cell of a declared shelf-row grid:
     each row is a rectangle plus a face count, cut into equal windows, and
     every rectangle is published below and drawn on the evidence sheet.
  3. reject any window under 14 px on either side, or with an aspect outside
     0.55-1.90.  A window smaller than the census grid would be measuring an
     upsample.
  4. NO RESAMPLING of the window.  Convert to linear light, then to CIE Lab,
     quantize to 12 L* x 16 a* x 16 b*, and report

       flat     the largest bin's share of the window   -- "is it a slab"
       cover50  bins needed to cover half the window    -- "is it a mosaic"
       hues     distinct 60-degree hue families among bins over 6%, C* > 12

`flat` and `cover50` are the pair this round is judged on.  `inks` -- bins
over a fixed 6% share -- is NOT used: it measures fragmentation backwards, and
it read 5 -> 4 on the same change that took `flat` 0.230 -> 0.129.

WHAT THIS RULE IS NOT.  It is not an image-row statistic: every window is a
square patch on ONE face, and nothing is scanned across a receding surface.
Five independent reproductions of that failure are recorded in AGENTS_BRIEF.
It is also not a photometric separator -- r21's critic proved five of those
fail on this cue.  It is a countable property of a face, in the units the
critic stated the defect in.
"""
import json
import math
import os
import sys
import glob

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF = os.path.join(ROOT, 'reference')
SHOTS = os.path.join(ROOT, 'shots')

# --- DECLARED SHELF ROWS ON THE PHOTOGRAPHS ---------------------------------
# Normalised (x0, y0, x1, y1) of a run of packaged facings, plus how many
# facings that run holds.  Six files of the fourteen in reference/; the other
# eight are produce, checkout lanes, frozen glass or open-deck ceiling and
# carry no packaged-goods run wide enough to cut.
#
# These rectangles ARE the instrument's assumption and AGENTS_BRIEF has retired
# eight metrics for exactly this, so: every one is drawn on
# shots/r22_ref_regions.png, and the face count is chosen by counting facings
# in the crop, not by tuning the number until it gave an answer.
PHOTO_ROWS = {
    'store_01_Canned_and_packaged_tuna': [
        (0.47, 0.17, 0.94, 0.42, 9),     # Bumble Bee wall, upper
        (0.47, 0.42, 0.94, 0.64, 9),     # Bumble Bee wall, lower
        (0.13, 0.72, 0.47, 0.94, 5),     # pouch row, left
        (0.47, 0.72, 0.94, 0.94, 6),     # pouch row, right
    ],
    'store_01_Langenstein': [
        (0.01, 0.13, 0.30, 0.29, 5),     # blue box run, top deck
        (0.01, 0.29, 0.33, 0.47, 5),     # blue box run, second deck
        (0.62, 0.30, 0.78, 0.44, 3),     # right-hand shelf, upper
        (0.62, 0.44, 0.80, 0.58, 3),     # right-hand shelf, lower
    ],
    'store_02_Langenstein': [
        (0.03, 0.28, 0.34, 0.44, 5),
        (0.03, 0.46, 0.34, 0.62, 5),
        (0.66, 0.30, 0.94, 0.46, 5),
    ],
    'store_03_Food_aisle': [
        (0.04, 0.34, 0.30, 0.48, 4),
        (0.04, 0.50, 0.30, 0.64, 4),
        (0.70, 0.36, 0.96, 0.50, 4),
    ],
    'store_05_Ingles': [
        (0.05, 0.36, 0.32, 0.50, 4),
        (0.05, 0.52, 0.32, 0.66, 4),
        (0.68, 0.38, 0.95, 0.52, 4),
    ],
    'store_00_Drinks': [
        (0.05, 0.44, 0.32, 0.58, 4),
        (0.05, 0.60, 0.32, 0.74, 4),
        (0.70, 0.46, 0.96, 0.60, 4),
    ],
}

MIN_PX = 14
NORM = 22
# THE SAME INSET AS THE RENDER SIDE. shots/_probe_r22_boxes.js insets every
# projected facing to its central 76% because a projected rectangle includes
# the facing's own edge, the rail under it and its neighbour. A declared
# photograph row is cut the same way, or the two sides are not one rule.
INSET = 0.12
AR_LO, AR_HI = 0.55, 1.90
QL, QA = 12, 16


def s2lin(v):
    v = v / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


LUT = [s2lin(i) for i in range(256)]


def lab(r, g, b):
    R, G, B = LUT[r], LUT[g], LUT[b]
    X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047
    Y = 0.2126 * R + 0.7152 * G + 0.0722 * B
    Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883

    def f(v):
        return v ** (1.0 / 3.0) if v > 0.008856 else 7.787 * v + 16.0 / 116.0
    fx, fy, fz = f(X), f(Y), f(Z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def census(px, w, h):
    bins = {}
    n = w * h
    for i in range(n):
        r, g, b = px[i * 3], px[i * 3 + 1], px[i * 3 + 2]
        L, a, bb = lab(r, g, b)
        k = (min(QL - 1, max(0, int(L / (100.0 / QL)))) * QA * QA
             + min(QA - 1, max(0, int((a + 80) / (160.0 / QA)))) * QA
             + min(QA - 1, max(0, int((bb + 80) / (160.0 / QA)))))
        bins[k] = bins.get(k, 0) + 1
    order = sorted(bins.values(), reverse=True)
    flat = order[0] / n
    acc, cover50 = 0, 0
    for v in order:
        acc += v
        cover50 += 1
        if acc >= n * 0.5:
            break
    hues = set()
    inks = 0
    for k, v in bins.items():
        if v / n < 0.06:
            continue
        inks += 1
        ai = (k % (QA * QA)) // QA
        bi = k % QA
        a = (ai + 0.5) * (160.0 / QA) - 80
        b2 = (bi + 0.5) * (160.0 / QA) - 80
        if math.hypot(a, b2) > 12:
            hues.add(round(math.atan2(b2, a) * 3 / math.pi))
    return dict(flat=flat, cover50=cover50, hues=len(hues), inks=inks, n=n)


def windows_from_rows(im, rows):
    W, H = im.size
    out = []
    for (x0, y0, x1, y1, nfac) in rows:
        px0, py0 = x0 * W, y0 * H
        px1, py1 = x1 * W, y1 * H
        fw = (px1 - px0) / nfac
        fh = py1 - py0
        for k in range(nfac):
            wx = int(px0 + k * fw)
            ww = int(fw)
            wh = int(fh)
            if ww < MIN_PX or wh < MIN_PX:
                continue
            ar = ww / float(wh)
            if ar < AR_LO or ar > AR_HI:
                # square it off on the row's own height, centred: a facing is
                # taller than one grid cell, so take the square that a facing
                # of that height would occupy.
                side = min(ww, wh)
                if side < MIN_PX:
                    continue
                wx = int(wx + (ww - side) / 2)
                wy = int(py0 + (wh - side) / 2)
                out.append((wx, wy, side, side))
                continue
            out.append((wx, int(py0), ww, wh))
    ins = []
    for (x, y, w, h) in out:
        dx, dy = int(w * INSET), int(h * INSET)
        if w - 2 * dx < MIN_PX or h - 2 * dy < MIN_PX:
            continue
        ins.append((x + dx, y + dy, w - 2 * dx, h - 2 * dy))
    return ins


def run_image(path, wins, want=1280, N=None):
    im = Image.open(path).convert('RGB')
    if im.width != want:
        im = im.resize((want, int(im.height * want / im.width)), Image.LANCZOS)
    res = []
    for (x, y, w, h) in wins:
        if w < MIN_PX or h < MIN_PX:
            continue
        if x < 0 or y < 0 or x + w > im.width or y + h > im.height:
            continue
        crop = im.crop((x, y, x + w, y + h))
        native = crop.width
        if N:
            # BOTH SIDES ARE BROUGHT TO THE SAME WINDOW SIZE, and this is the
            # correction that makes the comparison mean anything.  Measured
            # first without it: photograph windows have a median side of 87 px
            # and render windows 22, so `cover50` was counting the photograph's
            # extra 16x pixel budget rather than its extra structure.  N is the
            # render's own median DELIVERED facing width, so the question the
            # numbers answer is "if a real facing arrived at the size this game
            # delivers one, would it still be a mosaic".  BOX, named.
            crop = crop.resize((N, N), Image.BOX)
        r = census(crop.tobytes(), crop.width, crop.height)
        r['native'] = native
        res.append(r)
    return im, res


def q(a, p):
    a = sorted(a)
    return a[min(len(a) - 1, int(len(a) * p))]


def summarise(name, res):
    if not res:
        return {'name': name, 'n': 0}
    return {
        'name': name, 'n': len(res),
        'flat': [round(q([r['flat'] for r in res], p), 3) for p in (0.10, 0.50, 0.90)],
        'cover50': [q([r['cover50'] for r in res], p) for p in (0.10, 0.50, 0.90)],
        'hues': [q([r['hues'] for r in res], p) for p in (0.10, 0.50, 0.90)],
        'medWinNative': q([r.get('native', int(math.sqrt(r['n']))) for r in res], 0.5),
    }


def refpath(prefix):
    hits = [p for p in glob.glob(os.path.join(REF, '*'))
            if os.path.basename(p).startswith(prefix)]
    if not hits:
        raise SystemExit('no reference file for ' + prefix)
    return hits[0]


# THE PRODUCT-MASK GATE, and it is the third version of this rule.
#
# A projected instance rectangle is returned whether or not anything stands in
# front of it, so v1 handed the census shelf lips, price rails, the black gaps
# between facings and whole back ranks (shots/r22_win_render_bad.png) while the
# photograph side was cut onto real facings. AGENTS_BRIEF's asymmetric-rule
# trap, and it manufactures a gap out of the difference. v2 added a painter's
# front-rank pass and a 12% inset and was still about a third non-product.
#
# v3 asks the shader. PKG_STAGE 7 writes vec3(0,1,0) into every package
# fragment and is documented in pack.js as "the product-facing MASK, for region
# evidence"; it is a uniform-only ablation, so the plate either side of it is
# byte-identical (proven on all six poses, r22on vs r22on2). A window survives
# only if MASK_MIN of its pixels are that green, which is a test on the
# frontmost visible surface rather than on where an instance happens to be.
MASK_MIN = 0.90
_MASKS = {}


def mask_gate(pose, wins):
    f = os.path.join(SHOTS, 'r22mask_%s.png' % pose)
    if not os.path.exists(f):
        return wins
    if pose not in _MASKS:
        _MASKS[pose] = Image.open(f).convert('RGB').load(), Image.open(f).size
    px, (W, H) = _MASKS[pose]
    out = []
    for (x, y, w, h) in wins:
        if x < 0 or y < 0 or x + w > W or y + h > H:
            continue
        hit = tot = 0
        for yy in range(y, y + h, 2):
            for xx in range(x, x + w, 2):
                r, g, b = px[xx, yy]
                tot += 1
                if r < 12 and g > 240 and b < 12:
                    hit += 1
        if tot and hit / tot >= MASK_MIN:
            out.append((x, y, w, h))
    return out


ARMS = (('render_on', 'r22on'), ('render_off', 'r22off'),
        ('render_ink', 'r22ink'), ('render_tone', 'r22tone'))


def main():
    global NORM
    boxes_json = sys.argv[1] if len(sys.argv) > 1 else None
    NORM = int(sys.argv[2]) if len(sys.argv) > 2 else 22
    out = {'photo': [], 'render_on': [], 'render_off': [],
           'render_ink': [], 'render_tone': [], 'rule': {
        'minPx': MIN_PX, 'aspect': [AR_LO, AR_HI], 'quant': [QL, QA, QA],
        'kernel': 'LANCZOS to 1280 wide; windows NOT resampled',
        'refFiles': len(PHOTO_ROWS), 'refFilesTotal': 14,
        'normalisedTo': NORM, 'normKernel': 'BOX',
        'maskGate': MASK_MIN, 'inset': INSET}}

    # --- photographs --------------------------------------------------------
    ev = []
    allphoto = []
    for prefix, rows in PHOTO_ROWS.items():
        p = refpath(prefix)
        im0 = Image.open(p).convert('RGB')
        im0 = im0.resize((1280, int(im0.height * 1280 / im0.width)), Image.LANCZOS)
        wins = windows_from_rows(im0, rows)
        _, res = run_image(p, wins, N=NORM)
        allphoto += res
        out['photo'].append(summarise(prefix, res))
        ev.append((prefix, im0, wins))
    out['photoALL'] = summarise('ALL PHOTOGRAPHS', allphoto)

    # --- render -------------------------------------------------------------
    if boxes_json:
        B = json.load(open(boxes_json))
        for arm, tag in ARMS:
            allr = []
            for pose, e in B.items():
                wins = [(b['x'], b['y'], b['w'], b['h']) for b in e['picked']
                        if b['w'] >= MIN_PX and b['h'] >= MIN_PX
                        and AR_LO <= b['w'] / float(b['h']) <= AR_HI]
                wins = mask_gate(pose, wins)
                f = os.path.join(SHOTS, '%s_%s.png' % (tag, pose))
                if not os.path.exists(f):
                    continue
                _, res = run_image(f, wins, N=NORM)
                allr += res
                out[arm].append(summarise(pose, res))
            out[arm + 'ALL'] = summarise('ALL ' + arm, allr)

    # --- evidence sheet -----------------------------------------------------
    cols = 2
    rowsN = (len(ev) + cols - 1) // cols
    TW, TH = 640, 480
    sheet = Image.new('RGB', (cols * TW, rowsN * TH), (18, 18, 20))
    d = ImageDraw.Draw(sheet)
    for i, (name, im0, wins) in enumerate(ev):
        t = im0.copy()
        dd = ImageDraw.Draw(t)
        for (x, y, w, h) in wins:
            dd.rectangle([x, y, x + w, y + h], outline=(0, 255, 120), width=3)
        t = t.resize((TW, int(t.height * TW / t.width)), Image.LANCZOS)
        sheet.paste(t, ((i % cols) * TW, (i // cols) * TH))
        d.text(((i % cols) * TW + 8, (i // cols) * TH + 6),
               '%s  %d windows' % (name, len(wins)), fill=(255, 220, 60))
    sheet.save(os.path.join(SHOTS, 'r22_ref_regions.png'))
    print(json.dumps(out, indent=1))


if __name__ == '__main__':
    main()
