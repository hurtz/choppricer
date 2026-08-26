#!/usr/bin/env python3
"""WITHIN-FRAME CLASS CONTRAST.  builder-store round 18.

    K = A(round) / A(box),   A = mean|dL*/dx| / mean|dL*/dy|

both masks taken from ONE frame.  K < 1 is the real world (a can is banded
horizontally — label, rim, lid — so it is LESS x-anisotropic than the carton
beside it).  K > 1 is the defect round 17's critic found.

WHY A RATIO OF RATIOS AND NOT A MAGNITUDE.  Round 17's critic published two
refutations of its own headline and both are constraints on this file:

  * Round facings carry MORE gradient energy than flat ones, not less.  So
    "less ink" is false and any magnitude here would be measuring the wrong
    thing.  The defect is DIRECTIONAL.
  * Whole-frame anisotropy does not separate at all: the render's 0.706 median
    sits inside the references' 0.617-1.164.  A frame's anisotropy is mostly
    its shelf edges, rails and uprights, which both populations share.

K divides those out.  Exposure, codec, pose, lens and the fixture grammar are
common to both masks of a frame and cancel term for term.

--------------------------------------------------------------------------
THE RENDER MASKS ARE ABLATIONS.  NO BOX IS DECLARED ANYWHERE ON THE RENDER.

src/store/aniso.js renders four frames per pose: full, rndoff, boxoff,
restore.  Then

    mask_round = (full != rndoff)     pixels where a round is frontmost
    mask_box   = (full != boxoff)     pixels where a box   is frontmost

which are disjoint by construction — a can standing in front of a carton
belongs to round and to nothing else — and the overlap is COMPUTED and printed,
not assumed.  `restore` must be byte-identical to `full`; this file checks the
PNG bytes rather than trusting a boolean from the page, because an unproven
restore has returned two byte-identical PNGs on this project before.

Gradients are taken on the FULL frame and only across pixel pairs BOTH of
which are inside the mask, so no gradient is ever the silhouette of the mask
itself.  That matters more than it sounds: a mask boundary is the highest-
contrast edge available and it is oriented, so admitting boundary pairs would
manufacture most of the statistic.

--------------------------------------------------------------------------
THE PHOTOGRAPH SIDE CANNOT BE ABLATED.  That asymmetry is real and is printed
as a banner on every run that touches a reference.  A reference crop is a
DECLARED REGION, which is the failure mode AGENTS_BRIEF has retired eight
metrics for, so:

  * both crops come from the SAME photograph, so K still cancels exposure and
    codec even though the masks are hand-drawn;
  * every crop is swept +/-6% of frame width in x and y and +/-20% in size,
    and the SPREAD of K over that sweep is printed beside the point estimate.
    If the spread covers 1.0 the crop is doing the work and the number is not
    reportable.  Say so rather than quoting the centre.

L* is CIE lightness from linear-light sRGB (tools/chroma.py), not gamma luma:
|dL| on a gamma-encoded image weights shadow detail by roughly 3x, and the
round packages are the darkest class in the frame.

    python3 tools/aniso.py --render r18a          # all poses of a prefix
    python3 tools/aniso.py --refs                 # the three named photographs
    python3 tools/aniso.py --render r18a --refs   # both, and the verdict
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from chroma import srgb_to_linear, linear_to_lab  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'shots')
REF = os.path.join(ROOT, 'reference')


def lstar(path_or_arr):
    if isinstance(path_or_arr, str):
        im = Image.open(path_or_arr).convert('RGB')
        a = np.asarray(im).astype(np.float64) / 255.0
    else:
        a = path_or_arr
    lin = srgb_to_linear(a)
    lab = linear_to_lab(lin)
    return lab[..., 0]


def raw(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.int16)


def aniso(L, mask):
    """mean|dL/dx| / mean|dL/dy| over pixel pairs BOTH inside `mask`."""
    dx = np.abs(np.diff(L, axis=1))
    mx = mask[:, :-1] & mask[:, 1:]
    dy = np.abs(np.diff(L, axis=0))
    my = mask[:-1, :] & mask[1:, :]
    nx, ny = int(mx.sum()), int(my.sum())
    if nx < 500 or ny < 500:
        return None, nx, ny
    return float(dx[mx].mean() / dy[my].mean()), nx, ny


def render_pose(prefix, tag, quiet=False):
    p = lambda s: os.path.join(SHOTS, f'{prefix}_{tag}_{s}.png')
    for s in ('full', 'rndoff', 'boxoff', 'restore'):
        if not os.path.exists(p(s)):
            return None
    full, rnd, box, res = (raw(p(s)) for s in ('full', 'rndoff', 'boxoff', 'restore'))
    with open(p('full'), 'rb') as fh:
        b_full = fh.read()
    with open(p('restore'), 'rb') as fh:
        b_res = fh.read()
    restore_bytes = (b_full == b_res)
    restore_px = int((full != res).any(axis=2).sum())
    m_round = (full != rnd).any(axis=2)
    m_box = (full != box).any(axis=2)
    overlap = int((m_round & m_box).sum())
    L = lstar(p('full'))
    a_r, nxr, nyr = aniso(L, m_round)
    a_b, nxb, nyb = aniso(L, m_box)
    return dict(
        tag=tag, A_round=a_r, A_box=a_b,
        K=(a_r / a_b) if (a_r and a_b) else None,
        px_round=int(m_round.sum()), px_box=int(m_box.sum()),
        overlap=overlap, restore_identical_bytes=restore_bytes,
        restore_diff_px=restore_px,
        pairs=dict(rx=nxr, ry=nyr, bx=nxb, by=nyb),
    )


# --- the reference crops ----------------------------------------------------
# DECLARED REGIONS.  Fractions of frame (x0, y0, x1, y1).  Both crops of a pair
# come from one photograph so K still cancels exposure and codec.  Chosen by
# looking at the frames and picking the largest area that is unambiguously one
# class; every one is swept below.
# Each pair is (round, box) as (x0, y0, x1, y1) fractions of frame, drawn so
# that the crop contains ONLY that class plus the shelf edges no crop of a
# supermarket photograph can avoid.  Evidence images:
#   python3 tools/aniso.py --refs --evidence   ->  shots/r18ref_<name>.png
#
# store_01  a wall of tuna cans over a shelf of flat retort pouches, which is
#           the cleanest pair in the reference set: one frame, one lighting,
#           one focal length, the two classes stacked one above the other.
# store_00  the Campbell's soup endcap against the Cap'n Crunch endcap opposite.
#           NOT the r17 crops: those took a red box that was half bare wooden
#           deck, a chip rack and floor, and a blue box that was half aisle.
# store_05  the Lipton bottle shelf against the paper-pack rack behind it.
REFS = {
    'store_01_tuna': dict(
        file='store_01_Canned_and_packaged_tuna_on_supermarket_shelves.jpg',
        round=(0.473, 0.165, 0.926, 0.688),
        box=(0.078, 0.750, 0.922, 0.960),
    ),
    'store_00_drinks': dict(
        file='store_00_Drinks_aisle_of_Smith_s_Food_and_Drug_in_Gillette_Wyoming.jpg',
        round=(0.120, 0.495, 0.310, 0.755),
        box=(0.745, 0.630, 0.985, 0.870),
    ),
    'store_05_ingles': dict(
        file='store_05_Ingles_Supermarket_NC_Highway_107_and_Webster_Road_Sylva_NC_2024_-_Ais.jpg',
        round=(0.003, 0.370, 0.160, 0.510),
        box=(0.208, 0.455, 0.360, 0.640),
    ),
}

# THE ESTIMATOR VALIDATION. The render has ground truth — its masks are
# ablations — so the declared-crop estimator can be run on the RENDER and
# compared against the ablation it is standing in for. These are crops drawn on
# the render's own frames the same way the reference crops above were drawn: by
# looking at the picture and taking the largest rectangle that is one class.
# If K_crop tracks K_ablation here, the photograph numbers are trustworthy to
# that tolerance; if it does not, the reference row is not reportable and this
# file says so instead of quoting it.
RENDER_CROPS = {
    'near_a1': dict(round=(0.700, 0.600, 0.995, 0.700), box=(0.300, 0.230, 0.700, 0.310)),
    'near_a7': dict(round=(0.590, 0.700, 0.910, 0.795), box=(0.520, 0.495, 0.900, 0.580)),
}


def render_crop_validate(prefix):
    """Run the DECLARED-CROP estimator on the render, where the ablation is
    ground truth, and report both the estimate and the crop's purity."""
    out = []
    for tag, spec in RENDER_CROPS.items():
        p = lambda s: os.path.join(SHOTS, f'{prefix}_{tag}_{s}.png')
        if not os.path.exists(p('full')):
            continue
        full, rnd, box = (raw(p(s)) for s in ('full', 'rndoff', 'boxoff'))
        m_round = (full != rnd).any(axis=2)
        m_box = (full != box).any(axis=2)
        L = lstar(p('full'))
        h, w = L.shape
        pur = {}
        for cls, m in (('round', m_round), ('box', m_box)):
            x0, y0, x1, y1 = spec[cls]
            sub = m[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
            pur[cls] = float(sub.mean())
        ar = crop_aniso(L, spec['round'])
        ab = crop_aniso(L, spec['box'])
        truth = render_pose(prefix, tag)
        out.append(dict(tag=tag, K_crop=(ar / ab) if (ar and ab) else None,
                        K_ablation=truth['K'] if truth else None,
                        purity_round=pur['round'], purity_box=pur['box']))
    return out


def evidence(name, path, spec, out_png):
    from PIL import ImageDraw
    im = Image.open(path).convert('RGB')
    W, H = im.size
    d = ImageDraw.Draw(im)
    lw = max(3, W // 320)
    d.rectangle([spec['round'][0] * W, spec['round'][1] * H,
                 spec['round'][2] * W, spec['round'][3] * H], outline=(255, 32, 32), width=lw)
    d.rectangle([spec['box'][0] * W, spec['box'][1] * H,
                 spec['box'][2] * W, spec['box'][3] * H], outline=(0, 160, 255), width=lw)
    im.save(out_png)
    return out_png


def crop_aniso(L, box):
    h, w = L.shape
    x0, y0, x1, y1 = box
    sl = L[int(y0 * h):int(y1 * h), int(x0 * w):int(x1 * w)]
    if sl.shape[0] < 8 or sl.shape[1] < 8:
        return None
    m = np.ones(sl.shape, dtype=bool)
    a, _, _ = aniso(sl, m)
    return a


def sweep(box, dxs, dys, scales):
    out = []
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    hw, hh = (x1 - x0) / 2, (y1 - y0) / 2
    for dx in dxs:
        for dy in dys:
            for s in scales:
                out.append((max(0.0, cx + dx - hw * s), max(0.0, cy + dy - hh * s),
                            min(1.0, cx + dx + hw * s), min(1.0, cy + dy + hh * s)))
    return out


def ref_pair(name, spec, do_sweep=True):
    path = os.path.join(REF, spec['file'])
    L = lstar(path)
    ar = crop_aniso(L, spec['round'])
    ab = crop_aniso(L, spec['box'])
    row = dict(name=name, A_round=ar, A_box=ab, K=(ar / ab) if (ar and ab) else None,
               dims=f'{L.shape[1]}x{L.shape[0]}')
    if do_sweep:
        ds = (-0.06, -0.03, 0.0, 0.03, 0.06)
        sc = (0.8, 1.0, 1.2)
        ks = []
        for br in sweep(spec['round'], ds, ds, sc):
            for bb in sweep(spec['box'], ds, ds, sc):
                a, b = crop_aniso(L, br), crop_aniso(L, bb)
                if a and b:
                    ks.append(a / b)
        ks = np.array(ks)
        row['sweep'] = dict(n=len(ks), lo=float(ks.min()), hi=float(ks.max()),
                            med=float(np.median(ks)),
                            frac_below_1=float((ks < 1).mean()))
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', help='shots/ prefix written by aniso.js ablateAll')
    ap.add_argument('--refs', action='store_true')
    ap.add_argument('--no-sweep', action='store_true')
    ap.add_argument('--json', action='store_true')
    ap.add_argument('--evidence', action='store_true')
    a = ap.parse_args()

    doc = {}
    if a.render:
        tags = ['near_a1', 'near_a4', 'near_a7', 'chase_a1', 'chase_a4', 'chase_a6']
        rows = [r for r in (render_pose(a.render, t) for t in tags) if r]
        doc['render'] = rows
        print(f'== RENDER  prefix={a.render}   masks by ABLATION, no declared box ==')
        print(f'{"pose":10} {"A(round)":>9} {"A(box)":>8} {"K":>7} {"px_rnd":>8} {"px_box":>8} '
              f'{"overlap":>8}  restore')
        for r in rows:
            print(f'{r["tag"]:10} {r["A_round"]:9.3f} {r["A_box"]:8.3f} {r["K"]:7.3f} '
                  f'{r["px_round"]:8d} {r["px_box"]:8d} {r["overlap"]:8d}  '
                  f'{"IDENTICAL" if r["restore_identical_bytes"] else "DIFFERS " + str(r["restore_diff_px"]) + "px"}')
        ks = np.array([r['K'] for r in rows if r['K']])
        ar = np.array([r['A_round'] for r in rows if r['A_round']])
        print(f'\n  A(round) {ar.mean():.3f} +/- {ar.std(ddof=1):.3f}    '
              f'K {ks.mean():.3f} +/- {ks.std(ddof=1):.3f}   '
              f'{int((ks > 1).sum())}/{len(ks)} poses K>1')
        bad = [r for r in rows if not r['restore_identical_bytes']]
        if bad:
            print('  !! RESTORE NOT BYTE-IDENTICAL on ' + ', '.join(r['tag'] for r in bad)
                  + ' — every number above is junk.')
        if any(r['overlap'] for r in rows):
            print('  !! MASKS OVERLAP — they are not disjoint, the class split is wrong.')

    if a.refs:
        print('\n' + '=' * 74)
        print('!! ASYMMETRIC: the reference masks are DECLARED CROPS, not ablations.')
        print('!! Both crops of a pair come from ONE photograph, so K still cancels')
        print('!! exposure and codec — but the crop is hand-drawn. Read the sweep.')
        print('=' * 74)
        rows = [ref_pair(n, s, not a.no_sweep) for n, s in REFS.items()]
        if a.evidence:
            for n, sp in REFS.items():
                print('  evidence -> ' + evidence(n, os.path.join(REF, sp['file']), sp,
                      os.path.join(SHOTS, 'r18ref_' + n + '.png')))
        doc['refs'] = rows
        for r in rows:
            print(f'{r["name"]:18} A(round) {r["A_round"]:6.3f}  A(box) {r["A_box"]:6.3f}  '
                  f'K {r["K"]:6.3f}   [{r["dims"]}]')
            if 'sweep' in r:
                s = r['sweep']
                verdict = 'ROBUST' if s['hi'] < 1.0 else ('spans 1.0 — NOT REPORTABLE'
                                                         if s['lo'] < 1.0 < s['hi'] else 'ROBUST >1')
                print(f'{"":18}   sweep n={s["n"]:4d}  K {s["lo"]:.3f}..{s["hi"]:.3f} '
                      f'med {s["med"]:.3f}  {100*s["frac_below_1"]:.0f}% below 1.0   {verdict}')

    if a.render and a.refs:
        print('\n-- the declared-crop estimator, run where there IS ground truth --')
        vs = render_crop_validate(a.render)
        doc['validate'] = vs
        for v in vs:
            print(f'  {v["tag"]:10} K_crop {v["K_crop"]:.3f}  vs K_ablation {v["K_ablation"]:.3f}  '
                  f'(err {100*(v["K_crop"]/v["K_ablation"]-1):+.1f}%)   crop purity '
                  f'round {100*v["purity_round"]:.0f}%  box {100*v["purity_box"]:.0f}%')

        kr = np.mean([r['K'] for r in doc['render'] if r['K']])
        # ONLY THE REPORTABLE REFERENCE ROWS. Averaging in a row this same file
        # has just refused to quote would be quoting it.
        rep = [r for r in doc['refs']
               if r['K'] and (('sweep' not in r) or not (r['sweep']['lo'] < 1.0 < r['sweep']['hi']))]
        dropped = [r['name'] for r in doc['refs'] if r not in rep]
        kf = np.mean([r['K'] for r in rep]) if rep else float('nan')
        print(f'\nVERDICT   render K {kr:.3f}   photographs K {kf:.3f} '
              f'(over {len(rep)} of {len(doc["refs"])} reference pairs'
              + (', dropped ' + ', '.join(dropped) if dropped else '') + ')')
        print('          ' + ('SIGN INVERTED — opposite sides of 1.0'
                              if (kr - 1) * (kf - 1) < 0 else 'same side of 1.0')
              + f'.  render is {100*(kr/kf-1):+.0f}% against the photographs.')

    if a.json:
        print(json.dumps(doc, indent=1, default=float))


if __name__ == '__main__':
    main()
