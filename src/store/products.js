// OWNER: builder-store. Department palettes + the shelf-filling algorithm.
//
// ROUND-2 REWRITE. The round-1 version ran one kind per shelf, every facing in
// a single flush plane, evenly spaced and unrotated. A blind critic called
// every render instantly. What a real shelf actually does:
//   * 6-15 different SKUs per deck at clearly different heights and widths,
//     4in and 14in items side by side
//   * something on nearly every shelf is a bottle, jar, pouch or slumping bag
//   * a brand appears as a run of 3-4 varieties, identical artwork, different
//     flavour-flash colour
//   * front-face depth varies 1-4in item to item; ~1 in 5 items sits rotated;
//     there are dark voids where something sold out; something lies flat on
//     top of a row; something is shelved backwards
//   * top decks are pulled forward to the lip, bottom decks sink back

import { rr, ri, pick, makeRng } from './kit.js';
// ROUND 17 — the one owner of "what is in atlas cell i". See plan.js's header:
// the cell->department convention used to be written down in three files and
// had already gone wrong for FROZEN.
import {
  cellsOfDept, cellsOfSide, cellsOfClass, planDeptCheck, planFamilyCheck,
  DEPT_FAMILIES, ATLAS_KIND,
} from './plan.js';
// ROUND 23 — the side face. facet.js owns the clearance derivation (which used
// to be two expressions here, one of them wrong on every Z-axis run) and the
// alternating depth step that gives adjacent facings something to be a side
// face against. See its header for the mechanism and the census that found it.
import { FACET, extentAlong, extentR22, comb } from './facet.js';
export { sideCheck, sideSelfTest, leanStats, FACET } from './facet.js';
// ROUND 24 — per-unit orientation. orient.js owns the three hashed terms (turn,
// lean, rise) and `seat`, which is row 1 of the same rotation facet.js owns rows
// 0 and 2 of. See its header for the cue and the census.
import { ORIENT, hand, seat, handStats, HAND_LOG } from './orient.js';
export { ORIENT, seatCheck, seatSelfTest, handLog } from './orient.js';

// h,s,l triples -> brand colours. Grocery packaging is loud and saturated.
//
// ROUND 5. Measured against the references rather than eyeballed: a hue
// histogram of reference/store_01 and _02 (both Langenstein's, the closest
// thing here to a "normal" store) puts 11-15% of the frame in the blue band at
// s > 0.32 and 7-8% in the warm 15-60 degree band. Round 4's renders came back
// at 0.7-1.8% blue against 38-41% warm — an almost exact inversion.
//
// Two things were doing it. The illuminant (fixed in store.js — every lamp in
// the rig was warm) and this table: `blue` sat at l = 34-42, which under any
// light at all renders as navy, not as the Windex/Ziploc blue that dominates
// those two photographs. Blues and teals come up ten to twelve points of
// lightness, the warm families come down slightly, and `cream` and `brown` —
// which between them were most of the tan — lose a member each. Nothing here
// is a stylistic choice; it is what a supermarket shelf measures.
const C = {
  red:     [[354, 82, 48], [6, 85, 52], [0, 74, 42], [344, 74, 57]],
  orange:  [[24, 92, 52], [32, 95, 55], [16, 85, 48], [38, 90, 58]],
  yellow:  [[48, 96, 58], [54, 94, 60], [42, 90, 52]],
  green:   [[96, 58, 38], [138, 52, 36], [82, 66, 44], [116, 46, 32]],
  teal:    [[178, 68, 46], [190, 74, 50], [166, 56, 42]],
  blue:    [[212, 82, 50], [220, 76, 45], [202, 88, 52], [232, 66, 46]],
  navy:    [[224, 70, 28], [216, 62, 32]],
  purple:  [[280, 52, 46], [296, 46, 48], [268, 58, 42]],
  pink:    [[334, 76, 60], [318, 68, 62]],
  cream:   [[42, 40, 86], [38, 24, 91]],
  white:   [[40, 8, 93], [205, 7, 92], [30, 10, 95]],
  brown:   [[26, 46, 32], [20, 38, 28]],
  black:   [[220, 14, 18], [30, 10, 15]],
  silver:  [[208, 9, 74], [40, 6, 78]],
};
const mix = (...keys) => keys.flatMap((k) => C[k]);

// kinds: t=type, w=[min,max] facing width, h=[min,max] height, d=depth fraction
// run=[min,max] facings PER VARIETY (a brand block stacks 1-4 of these)
// ---------------------------------------------------------------------------
// ROUND 18 — SILHOUETTE ASPECT, DECLARED PER OUTLINE AND ASSERTED.
//
// r17's critic: "one lathe in the canned aisle reads as a GREEN WINE GOBLET —
// a silhouette that belongs in no grocery aisle." It was `tallJar`, at
// w[0.082,0.105] x h[0.20,0.27]: up to 3.29 times as tall as it is wide, drawn
// on the jarL profile, which pinches to a neck and flares again for a lug lid.
// Stretch that outline past about 2.6 and the neck becomes a stem.
//
// Plausible aspect is a property of the OUTLINE, not of the SKU that borrows
// it, so it is declared once here against real packages rather than tuned per
// kind. The measurements these came from:
//
//     15 oz can 75x110 = 1.47   28 oz can 100x120 = 1.20   soup 66x101 = 1.53
//     sauce jar 85x175 = 2.06   tall olive jar 70x170 = 2.43
//     margarine tub 115x60 = 0.52   yoghurt 95x105 = 1.11
//     coffee canister 100x175 = 1.75   crisp drum 78x250 = 3.20
//     2 L PET 110x327 = 2.97   20 oz PET 68x240 = 3.53
//     1 gal jug 150x245 = 1.63   32 oz trigger spray 100x265 = 2.65
//
// aspectCheck() runs at module load and THROWS, in the lungCheck() style — so
// a future kind added with a vase in it fails on the page instead of shipping
// as one SKU nobody screenshotted. It guards the CLASS: every kind, every
// outline, at both ends of both ranges.
const ASPECT = {
  rim:   [1.00, 2.00],   // a rolled-rim food can
  jarL:  [1.45, 2.60],   // a glass jar with a lug lid
  tub:   [0.45, 1.30],   // margarine, yoghurt, dips
  plain: [1.45, 3.30],   // a drum or a canister
  soda:  [2.55, 3.80],   // PET
  jug:   [1.45, 2.60],   // detergent, milk, juice
  squat: [1.00, 2.30],   // a squat jar or a stubby bottle
  spray: [2.15, 3.25],   // trigger cleaner
  // ROUND 19 — the FLAT families were never bounded at all, which is the same
  // hole one aisle over: nothing would have caught a 6:1 carton either. From
  // real packages, same method as the round outlines above:
  //     12-can case 420x130 = 0.31   shrink 6-pack 200x270 = 1.35
  //     cereal 230x350 = 1.52        spaghetti sleeve 75x300 = 4.00
  //     cracker sleeve 140x270 = 1.93   sugar 4 lb bag 190x330 = 1.74
  //     stand-up pouch 145x260 = 1.79   crisp bag 300x330 = 1.10
  // The low end of `carton` is a case of soda on its side and the high end is a
  // spaghetti box; the low end of `pouch` is a slumped bag, which products.js
  // makes on purpose (the `crushed` branch takes sy to 0.78 h and sx to 1.09 w)
  // and which is a real thing on a real shelf, not a defect.
  carton: [0.28, 4.05],
  pouch:  [0.55, 3.10],
};

const K = {
  cerealBox: { t: 'box', w: [0.17, 0.23], h: [0.28, 0.35], d: 0.72, run: [2, 4] },
  midBox:    { t: 'box', w: [0.10, 0.16], h: [0.17, 0.24], d: 0.80, run: [2, 5] },
  smallBox:  { t: 'box', w: [0.06, 0.10], h: [0.11, 0.17], d: 0.85, run: [3, 6] },
  wideBox:   { t: 'box', w: [0.24, 0.34], h: [0.14, 0.20], d: 0.80, run: [1, 3] },
  tallBox:   { t: 'box', w: [0.09, 0.13], h: [0.26, 0.33], d: 0.82, run: [2, 5] },
  tinyBox:   { t: 'box', w: [0.045, 0.075], h: [0.075, 0.12], d: 0.9, run: [4, 8] },
  // ROUND 7 — SILHOUETTE. `shape` selects one of the outlines store.js builds
  // (see CAN_PROFILES / gussetGeo / wrapGeo). Every kind below that used to be
  // a bare nine-sided cylinder now carries the rolled rim, the proud lug lid or
  // the overhanging snap lid that identifies it from across an aisle. The
  // blind test's words: "your per-instance variation is currently colour only
  // — real variation is silhouette."
  can:       { t: 'can', shape: 'rim',  w: [0.068, 0.086], h: [0.10, 0.13], d: 1.0, run: [3, 7] },
  bigCan:    { t: 'can', shape: 'rim',  w: [0.098, 0.115], h: [0.15, 0.19], d: 1.0, run: [2, 5] },
  jar:       { t: 'can', shape: 'jarL', w: [0.075, 0.098], h: [0.150, 0.190], d: 1.0, run: [2, 5] },
  // ROUND 18 — WAS w[0.082,0.105] h[0.20,0.27], i.e. up to 3.29 tall as it is
  // wide, on the jarL outline: a pinched neck under a flared lug lid. r17's
  // critic called it exactly — "one lathe in the canned aisle reads as a GREEN
  // WINE GOBLET, a silhouette that belongs in no grocery aisle". A 24 oz
  // pasta-sauce jar is 2.06, a tall olive jar 2.43. See ASPECT above.
  tallJar:   { t: 'can', shape: 'jarL', w: [0.088, 0.108], h: [0.185, 0.225], d: 1.0, run: [2, 4] },
  tub:       { t: 'can', shape: 'tub',  w: [0.090, 0.130], h: [0.075, 0.115], d: 1.0, run: [2, 5] },
  bigTub:    { t: 'can', shape: 'tub',  w: [0.125, 0.165], h: [0.115, 0.160], d: 1.0, run: [1, 3] },
  drum:      { t: 'can', shape: 'plain', w: [0.088, 0.108], h: [0.165, 0.225], d: 1.0, run: [2, 4] },
  bottle:    { t: 'bottle', shape: 'spray', w: [0.086, 0.104], h: [0.230, 0.275], d: 1.0, run: [3, 6] },
  jug:       { t: 'bottle', shape: 'jug',   w: [0.130, 0.160], h: [0.240, 0.310], d: 1.0, run: [2, 4] },
  sodaBtl:   { t: 'bottle', shape: 'soda',  w: [0.088, 0.104], h: [0.270, 0.325], d: 1.0, run: [3, 7] },
  squat:     { t: 'bottle', shape: 'squat', w: [0.088, 0.110], h: [0.15, 0.20], d: 1.0, run: [2, 5] },
  bag:       { t: 'bag', w: [0.19, 0.30], h: [0.24, 0.33], d: 0.55, run: [1, 3] },
  smallBag:  { t: 'bag', w: [0.11, 0.18], h: [0.15, 0.23], d: 0.60, run: [2, 4] },
  pouch:     { t: 'bag', w: [0.085, 0.130], h: [0.13, 0.19], d: 0.45, run: [3, 6] },
  // stand-up pouch: gusseted foot, tapered body, flat top crimp. The fastest
  // growing format in a real store and the one most obviously missing here.
  standUp:   { t: 'bag', shape: 'gusset', w: [0.095, 0.145], h: [0.17, 0.26], d: 0.55, run: [2, 5] },
  bigPouch:  { t: 'bag', shape: 'gusset', w: [0.145, 0.210], h: [0.24, 0.34], d: 0.62, run: [1, 3] },
  case12:    { t: 'box', shape: 'wrap', w: [0.30, 0.42], h: [0.13, 0.17], d: 0.85, run: [1, 3] },
  // shrink-wrapped multipack: film pulled tight over the corners, slumping
  // between them. Rounded silhouette, and the specular finally has a shape.
  multi:     { t: 'box', shape: 'wrap', w: [0.20, 0.30], h: [0.12, 0.19], d: 0.80, run: [1, 3] },
  sixPack:   { t: 'box', shape: 'wrap', w: [0.14, 0.20], h: [0.20, 0.27], d: 0.72, run: [2, 4] },
  // flat sleeve: a boxed frozen meal, a bar carton, a foil-wrapped block. Two
  // to three centimetres deep, so it reads as a slab of print on edge.
  sleeve:    { t: 'box', w: [0.14, 0.22], h: [0.19, 0.27], d: 0.16, run: [3, 7] },
  thinBox:   { t: 'box', w: [0.075, 0.115], h: [0.16, 0.23], d: 0.20, run: [4, 8] },
};

// ===========================================================================
// ROUND 19 — THE ASPECT ASSERTION NOW READS INSTANCE MATRICES.
//
// r18's version is `tableCheck()` below, kept because it is still worth
// running: it is a lint on the K table. But it passed 11 of 11 outlines while
// the shipped store carried instances at 4.22:1, past the widest band declared
// anywhere, and r18's critic found them in one pass over the scene. Two things
// the table cannot see, and BOTH of them are downstream of it:
//
//   1. THE PER-INSTANCE SCALE. `sx = w * rr(rng, 0.955, 1.005)` and
//      `sy = h * rr(rng, 0.965, 1.035)` multiply the declared aspect by up to
//      1.0838 before anything reaches the GPU. K.sodaBtl's own worst case is
//      3.69:1 against a declared 3.80 — 2.9% of headroom, and the jitter is
//      8.4% wide. The table check had no way to know that.
//   2. THE GEOMETRY IS NOT A UNIT CUBE. `w` is spent on a lathe whose local
//      x-extent is 0.827-0.989, not 1.0, so a "0.088 m wide" bottle is 0.0728 m
//      wide on screen and every aspect is inflated by 1/lw. Measured off the
//      live buffers, that factor alone is worth up to +21%.
//
// So the outline's band is checked where the outline actually exists: the
// geometry's own bounding box times the instance's own scale. It is the
// package's proportions and not its screen silhouette, so a deliberately
// knocked-over facing (roll = pi/2) is not a false positive — a package lying
// on its side is still shaped like a package.
//
// The band comes from ASPECT keyed by the geometry's NAME, which pack.js's
// unitCellUV writes onto the buffer at the one place an outline is created and
// which survives both clones. An unrecognised name is a COMPLAINT, not a skip:
// a new outline added without a band is exactly the goblet arriving again.
const OUTLINE = {
  'can/rim': 'rim', 'can/jar': 'jarL', 'can/tub': 'tub', 'can/cylinder': 'plain',
  'bottle/soda': 'soda', 'bottle/jug': 'jug', 'bottle/squat': 'squat',
  'bottle/spray': 'spray',
  'carton/box': 'carton', 'carton/wrap': 'carton',
  'pouch/bag': 'pouch', 'pouch/gusset': 'pouch',
};

// THE CLAMP. products.js chooses sx and sy; this is asked, at the one place a
// package's scale is finally known, whether the pair is still inside its
// outline's band, and returns the sx that puts it back. sx and not sy on
// purpose: the fill loop's stacking arithmetic is built on sy (`dyHere + sy *
// colH`), so moving sy here would silently desynchronise a column from the
// deck above it, while horizontal packing advances on the nominal `w` and
// never on sx. Widening a facing 11% is what a crushed facing already does.
// The ledger exists because a clamp that fires on everything is not a guard,
// it is a redesign wearing one, and the only way to tell the two apart is the
// distribution of what it caught. Reported, never asserted.
export const CLAMP_LOG = {};
export function clampStats() { return CLAMP_LOG; }

// ROUND 23. The comb's own ledger, for exactly the reason above: the first
// version of it was clamped against `maxSet` and the artefact came back with a
// median adjacent stagger of 2.7 mm against the control's 2.6 — a change that
// had shipped and moved nothing, which is indistinguishable from a change that
// never ran. The ledger says which.
export const COMB_LOG = { n: 0, applied: 0, absSum: 0, deltaSum: 0, clampBack: 0, clampFwd: 0, maxAbs: 0 };
export function combStats() {
  const L = COMB_LOG, d = Math.max(1, L.n);
  return {
    facings: L.n, applied: L.applied, appliedPc: +(100 * L.applied / d).toFixed(2),
    meanRequestedMm: +(1000 * L.absSum / d).toFixed(2),
    meanDeliveredMm: +(1000 * L.deltaSum / d).toFixed(2),
    clampedBackPc: +(100 * L.clampBack / d).toFixed(2),
    clampedFwdPc: +(100 * L.clampFwd / d).toFixed(2),
    maxStepMm: +(1000 * L.maxAbs).toFixed(1),
  };
}

export function clampAspect(geoName, lw, lh, sx, sy) {
  const key = OUTLINE[geoName];
  const band = key && ASPECT[key];
  if (!band || !(lw > 0) || !(lh > 0)) return sx;
  const a = (lh * sy) / (lw * sx);
  const e = (CLAMP_LOG[geoName] = CLAMP_LOG[geoName]
    || { n: 0, hit: 0, rawMax: 0, rawMin: Infinity, worstOver: 1, band: band.slice(),
      by10: 0, by25: 0, by50: 0 });
  e.n++;
  if (a > e.rawMax) e.rawMax = +a.toFixed(3);
  if (a < e.rawMin) e.rawMin = +a.toFixed(3);
  const bite = (over) => {
    e.hit++; e.worstOver = Math.max(e.worstOver, +over.toFixed(3));
    if (over > 1.10) e.by10++;
    if (over > 1.25) e.by25++;
    if (over > 1.50) e.by50++;
  };
  if (a > band[1]) { bite(a / band[1]); return (lh * sy) / (lw * band[1]); }
  if (a < band[0]) { bite(band[0] / a); return (lh * sy) / (lw * band[0]); }
  return sx;
}

// THE LIVE CHECK. Same shape as chopShelfCheck: walk the scene, read the
// artefact, say nothing about the table.
export function aspectCheck(scene) {
  if (!scene || typeof scene.traverse !== 'function') {
    throw new Error('aspectCheck(scene): r18 read the K table and certified a store carrying '
      + '4.22:1 instances. There is no table-reading form of this check — see tableCheck().');
  }
  const bad = [];
  const byGeo = new Map();
  let meshes = 0, instances = 0;
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || !o.geometry) return;
    const name = o.geometry.name;
    if (!name || !/^(can|bottle|carton|pouch)\//.test(name)) return;
    meshes++;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const lw = bb.max.x - bb.min.x, lh = bb.max.y - bb.min.y;
    const key = OUTLINE[name];
    const band = key && ASPECT[key];
    let e = byGeo.get(name);
    if (!e) {
      e = { name, band: band ? band.slice() : null, lw: +lw.toFixed(3), lh: +lh.toFixed(3),
        n: 0, min: Infinity, max: -Infinity, over: 0, under: 0, worst: null };
      byGeo.set(name, e);
      if (!band) bad.push(name + ': no aspect band declared for this outline — add one to '
        + 'ASPECT/OUTLINE. An outline nobody has bounded is how the wine goblet shipped.');
    }
    const M = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) {
      const b = i * 16;
      // column lengths of the instance matrix ARE its scale, and reading them
      // directly avoids constructing 45,000 Matrix4/Vector3 pairs
      const cx = Math.hypot(M[b], M[b + 1], M[b + 2]);
      const cy = Math.hypot(M[b + 4], M[b + 5], M[b + 6]);
      if (!(cx > 0) || !(cy > 0)) continue;
      const a = (lh * cy) / (lw * cx);
      instances++; e.n++;
      if (a < e.min) e.min = a;
      if (a > e.max) { e.max = a; e.worst = { sx: +cx.toFixed(4), sy: +cy.toFixed(4), mesh: o.name }; }
      if (!band) continue;
      if (a > band[1] + 1e-6) e.over++;
      else if (a < band[0] - 1e-6) e.under++;
    }
  });
  const rows = [];
  for (const e of byGeo.values()) {
    e.min = +e.min.toFixed(3); e.max = +e.max.toFixed(3);
    rows.push(e);
    if (!e.band) continue;
    if (e.over) {
      bad.push(e.name + ': ' + e.over + ' of ' + e.n + ' shipped instances reach '
        + e.max.toFixed(2) + ':1, past the declared ' + e.band[1] + ':1'
        + (e.worst ? ' (sx ' + e.worst.sx + ' sy ' + e.worst.sy + ' on ' + e.worst.mesh + ')' : ''));
    }
    if (e.under) {
      bad.push(e.name + ': ' + e.under + ' of ' + e.n + ' shipped instances go to '
        + e.min.toFixed(2) + ':1, under the declared ' + e.band[0] + ':1');
    }
  }
  if (!meshes) {
    bad.push('aspectCheck saw ZERO named package meshes. Zero is the most suspicious reading '
      + 'an instrument can give — the geometry names are gone, not the packages.');
  }
  return Object.assign(bad, { rows, meshes, instances });
}

// The r18 check, demoted to a lint on the table and renamed so nobody mistakes
// it for a statement about the store. It still earns its place: it catches a
// kind whose DECLARED w/h leaves an outline's band before any jitter is
// applied, which is a cheaper error to find than the same thing at 45,000
// instances. It is no longer the thing the round quotes.
export function tableCheck() {
  const bad = [];
  const rows = [];
  for (const [name, k] of Object.entries(K)) {
    if (!k.shape || !ASPECT[k.shape]) continue;
    const [lo, hi] = ASPECT[k.shape];
    const amin = k.h[0] / k.w[1], amax = k.h[1] / k.w[0];
    rows.push({ name, shape: k.shape, amin: +amin.toFixed(2), amax: +amax.toFixed(2), lo, hi });
    if (amax > hi + 1e-9) bad.push(`${name} (${k.shape}) reaches ${amax.toFixed(2)}:1, past ${hi}:1`);
    if (amin < lo - 1e-9) bad.push(`${name} (${k.shape}) can go to ${amin.toFixed(2)}:1, under ${lo}:1`);
  }
  return { bad, rows };
}
{
  const r = tableCheck();
  if (r.bad.length) {
    throw new Error('products.js aspect table: ' + r.bad.length + ' outline(s) out of range — '
      + r.bad.join(' | '));
  }
}

// Every department gets at least one non-box kind in `mustSoft` so no deck is
// ever an unbroken wall of cuboids.
export const DEPTS = [
  {
    name: 'bakery', key: 'bakery', blade: 'BREAD / BAKING',
    sign: ['BREAD', 'BAKING NEEDS', 'FLOUR / SUGAR', 'COOKIES'],
    kinds: [K.bag, K.midBox, K.sleeve, K.wideBox, K.tallBox, K.standUp, K.tallJar, K.bigPouch],
    soft: [K.bag, K.standUp, K.tallJar, K.bigPouch, K.tub],
    colors: mix('cream', 'cream', 'red', 'yellow', 'brown', 'white'),
  },
  {
    name: 'canned', key: 'canned', blade: 'CANNED GOODS',
    sign: ['CANNED VEGETABLES', 'SOUPS / BROTH', 'CANNED FRUITS', 'PORK & BEANS'],
    kinds: [K.can, K.can, K.bigCan, K.jar, K.tallJar, K.multi, K.standUp, K.smallBox],
    soft: [K.jar, K.tallJar, K.standUp, K.tub],
    colors: mix('red', 'red', 'red', 'green', 'green', 'silver', 'yellow'),
  },
  {
    name: 'pasta', key: 'pasta', blade: 'PASTA / SAUCE',
    sign: ['SPAGHETTI / SAUCES', 'RICE & DRY BEANS', 'MEXICAN', 'ASIAN'],
    kinds: [K.jar, K.thinBox, K.smallBox, K.tallBox, K.tallJar, K.bigCan, K.standUp, K.squat],
    soft: [K.jar, K.tallJar, K.standUp, K.squat, K.tub],
    colors: mix('red', 'red', 'green', 'cream', 'yellow'),
  },
  {
    name: 'snacks', key: 'snacks', blade: 'SNACKS / CHIPS',
    sign: ['CHIPS & SNACKS', 'CANDIES', 'CRACKERS', 'NUTS'],
    kinds: [K.bag, K.bag, K.smallBag, K.wideBox, K.multi, K.standUp, K.tinyBox, K.tallJar],
    soft: [K.bag, K.smallBag, K.standUp, K.tallJar, K.bigPouch],
    colors: mix('orange', 'orange', 'red', 'red', 'yellow', 'yellow', 'blue', 'green', 'purple'),
  },
  {
    name: 'soda', key: 'soda', blade: 'SODA / JUICE',
    sign: ['SOFT DRINKS', 'JUICES', 'BOTTLED WATER', 'SPORTS DRINKS'],
    kinds: [K.sodaBtl, K.case12, K.sodaBtl, K.sixPack, K.jug, K.case12, K.squat, K.can],
    soft: [K.sodaBtl, K.bottle, K.jug, K.squat, K.drum],
    colors: mix('red', 'red', 'blue', 'blue', 'green', 'orange', 'purple', 'silver', 'white'),
  },
  {
    name: 'breakfast', key: 'breakfast', blade: 'CEREAL / COFFEE',
    sign: ['CEREAL', 'COFFEE / TEA', 'BREAKFAST FOODS', 'SYRUP / JAM'],
    kinds: [K.cerealBox, K.cerealBox, K.midBox, K.jar, K.tallBox, K.drum, K.tallJar, K.standUp],
    soft: [K.jar, K.tallJar, K.standUp, K.tub],
    colors: mix('yellow', 'yellow', 'red', 'red', 'blue', 'brown', 'orange'),
  },
  {
    name: 'paper', key: 'paper', blade: 'PAPER / CLEANING',
    sign: ['PAPER GOODS', 'LAUNDRY', 'CLEANING SUPPLIES', 'TRASH BAGS'],
    kinds: [K.jug, K.wideBox, K.bigPouch, K.jug, K.multi, K.cerealBox, K.squat, K.bottle],
    soft: [K.jug, K.bigPouch, K.squat, K.bottle, K.bigTub],
    colors: mix('blue', 'blue', 'blue', 'blue', 'white', 'white', 'teal', 'yellow', 'green'),
  },
  {
    name: 'health', key: 'health', blade: 'HEALTH / BEAUTY',
    sign: ['HEALTH & BEAUTY', 'BABY CARE', 'VITAMINS', 'PET SUPPLIES'],
    kinds: [K.thinBox, K.bottle, K.tinyBox, K.sleeve, K.standUp, K.jar, K.squat, K.tub],
    soft: [K.bottle, K.jar, K.squat, K.standUp, K.tub],
    colors: mix('white', 'white', 'white', 'silver', 'purple', 'pink', 'teal', 'blue'),
  },
];

export const FROZEN = {
  name: 'frozen', key: 'frozen', blade: 'FROZEN', sign: ['FROZEN'],
  kinds: [K.sleeve, K.sleeve, K.smallBag, K.bag, K.thinBox, K.standUp, K.bigTub, K.multi],
  soft: [K.smallBag, K.bag, K.standUp, K.bigTub],
  colors: mix('white', 'blue', 'blue', 'blue', 'teal', 'silver', 'red', 'green'),
};

// Atlas-cell pools. A department takes its own themed cells plus a few strays,
// because real neighbouring SKUs are not all from one design family.
//
// ROUND 5's finding stands and is preserved below: the strays used to be drawn
// from the WHOLE atlas, which put a carton of crackers — complete with its warm
// serving-suggestion photo — on the cleaning shelf four times out of eight. A
// non-food department takes its strays from the other non-food cells only;
// food departments still borrow freely from each other, which is real.
//
// ROUND 17 — WHAT CHANGED IS HOW A CELL IS FOUND, NOT THE POLICY. Round 5's
// rule was spelled `(idx % 8) >= 6`, and its own comment admitted it was "true
// only by the ordering of DEPTS in products.js". The cell membership was
// spelled `for (k = idx % 8; k < total; k += 8)` with `total` hard-coded 24 and
// 8 — which is a fourth copy of the atlas size, and it is why widening the
// atlas needed an edit in this file at all. Both now come from plan.js, which
// deals the cells and knows which department and which side of the food line
// each one landed on. `total` is gone; there is nothing here to keep in sync.
// ROUND 12 (people) — the stray source is now the MERCHANDISING CLASS and not
// the food line. See DEPT_CLASS in plan.js for the measurement that forced it;
// the short version is that half the pool the GRAB & GO cooler drew its box
// facings from was popcorn, oatmeal, pizza, waffles and flour, and every one of
// those passed the food test. The assertion below proves the new rule is a
// strict TIGHTENING and not a different rule that happens to be smaller.
const strayList = (atlas, key, n) => {
  const side = cellsOfClass(atlas, key).filter((c) => !cellsOfDept(atlas, key).includes(c));
  const out = [];
  // deterministic, evenly spaced through the eligible list rather than random:
  // a department's stray set should be stable across reloads so a shelf that
  // looked right in a screenshot looks the same in the next one.
  //
  // ROUND 12 (people) — IT WAS NOT EVENLY SPACED AND HAD NOT BEEN SINCE ROUND
  // 5. The expression was `side[(k * 7 + 3) % side.length]`, and a stride of 7
  // walking a list whose length shares a factor with 7 visits ONE index, n
  // times. health's carton class pool is exactly 7 candidates long, so the
  // health aisle's five stray carton cells were five copies of DISHWASHER PACS.
  // It was invisible while the pools were 20-40 cells wide and appeared the
  // moment the class rule made them small — a latent bug that a tightening
  // exposes rather than causes, which is the third one of those in this file.
  //
  // Spacing by k*len/n has no stride and therefore no bad length: it is the
  // thing the comment above always claimed.
  const L = side.length;
  for (let k = 0; k < n && L; k++) out.push(side[Math.floor((k + 0.5) * L / n) % L]);
  return out;
};
const poolFor = (atlas, key, strays) => [...cellsOfDept(atlas, key), ...strayList(atlas, key, strays)];
[...DEPTS, FROZEN].forEach((d, i) => {
  d.idx = i;
  d.cells = {
    box: poolFor('carton', d.key, 5),
    bag: poolFor('pouch', d.key, 2),
    can: poolFor('can', d.key, 2),
    bottle: poolFor('bottle', d.key, 2),
  };
});
// Two copies of a department ordering, one assertion that fires when they
// disagree — CLAUDE.md's lungCheck() pattern. Reordering DEPTS, renaming a key
// or adding a department without telling plan.js throws here at module load
// instead of silently re-pointing every cell pool in the store.
{
  const bad = planDeptCheck([...DEPTS.map((d) => d.key), FROZEN.key]);
  // ...and the same for WHICH FAMILIES each department shelves. plan.js has to
  // know, because a bottle cell dealt to a department that never places one is
  // baked and unreachable — which is exactly how the first r17 build put
  // soySplash and sportBottle in the atlas and not in the store.
  const fam = {};
  for (const d of [...DEPTS, FROZEN]) {
    fam[d.key] = [...new Set([...(d.kinds || []), ...(d.soft || [])].map((k) => k.t))];
  }
  bad.push(...planFamilyCheck(fam));

  // ---- ROUND 12 (people) — TWO PROPERTIES OF THE STRAY RULE ---------------
  //
  // 1. IT IS A TIGHTENING. Round 5's food-line rule is seven rounds old and has
  //    been right the whole time; the class rule is meant to be strictly inside
  //    it, not beside it. If a class ever lends across the food line — one
  //    careless edit to LENDS — a carton of crackers reappears on the cleaning
  //    shelf and nothing else in this codebase would notice.
  //
  // 2. NO SHELVED FAMILY MAY HAVE AN EMPTY POOL. dealCell falls back to
  //    `dept.cells.box` when a family's pool is empty, and a CARTON cell index
  //    used against the pouch grid is out of range: cell 40 of a 6x5 atlas.
  //    That fallback has never fired, and tightening the strays is exactly the
  //    kind of change that would make it fire — soda's bag pool and frozen's
  //    bottle pool are now empty, and both are safe only because neither
  //    department shelves that family. This asserts the "only because".
  const ATL = { box: 'carton', bag: 'pouch', can: 'can', bottle: 'bottle' };
  for (const d of [...DEPTS, FROZEN]) {
    for (const [famKey, atlas] of Object.entries(ATL)) {
      const cls = new Set(cellsOfClass(atlas, d.key));
      for (const c of cls) {
        if (!cellsOfSide(atlas, d.key).includes(c)) {
          bad.push(d.key + '/' + atlas + ' stray cell ' + c + ' crosses the food line');
        }
      }
      const shelved = (DEPT_FAMILIES[d.key] || []).includes(ATLAS_KIND[atlas]);
      if (shelved && !d.cells[famKey].length) {
        bad.push(d.key + ' shelves ' + famKey + ' and has an EMPTY cell pool');
      }
    }
  }
  if (bad.length) throw new Error('products.js/plan.js department drift: ' + bad.join(' | '));
}

// ---------------------------------------------------------------------------
// Fill one shelf deck with product.
//   axis   'z' (run goes along Z, faces point along X) or 'x'
//   a0,a1  extent along the run axis
//   lip    coordinate of the shelf front edge on the cross axis
//   face   +1 / -1 direction the shelf faces on the cross axis
//   deckY  top surface of the shelf board
//   headroom  clear height to the next shelf
//   depth  usable shelf depth
//   lit    brightness multiplier (fakes light falloff down the gondola)
//   pull   0 = bottom deck (product sunk back), 1 = top deck (pulled to lip)
//   tag    optional (aStart, aWidth, cell) callback -> emits a shelf-edge tag
// Kinds whose natural height suits this deck's clear height. Falls back to the
// shortest available rather than returning nothing.
const STACKABLE = new Set([K.can, K.bigCan, K.jar, K.tallJar, K.tinyBox,
  K.smallBox, K.wideBox, K.case12, K.pouch, K.tub, K.bigTub, K.multi,
  K.drum, K.standUp, K.thinBox]);

function fits(kinds, headroom) {
  let ok = kinds.filter((k) => k.h[0] <= headroom - 0.02 && k.h[1] <= headroom + 0.06);
  // ROUND 6 — STARVATION. On a shallow deck this filter could admit as few as
  // TWO of a department's eight kinds, and the run then drew ten decks of the
  // same two box shapes at nearly the same width: the "identical, gapless,
  // flush" perimeter facings the critic reported. A real store does not merchandise
  // a 5 in deck with two SKUs; it puts short versions of everything on it —
  // half-litre bottles, squat jars, single-serve pouches — and the caller
  // already clamps anything over the clear height. So when the pool is starved,
  // admit the next-shortest kinds and let them be clamped. The deck plan still
  // drives SKU size, it just stops driving it to a single answer.
  if (ok.length < 4) {
    const extra = kinds
      .filter((k) => !ok.includes(k) && k.h[0] <= headroom + 0.10)
      .sort((a, b) => a.h[0] - b.h[0])
      .slice(0, 4 - ok.length);
    ok = ok.concat(extra);
  }
  // ROUND 3: prefer kinds that actually USE the cavity. A 5in jar merchandised
  // under a 15in deck leaves a 10in band of empty air above every facing, and
  // that band — repeated the length of the run — is why round-2 aisles read as
  // rows of decals with cream gaps rather than as a packed wall of product.
  if (ok.length) {
    // 2:1 in favour of kinds that fill the cavity on their own. Weighting
    // stackables equally sent a 15in deck a wall of 4in boxes stacked six
    // high, which is a worse repetition artefact than the air gap it fixed.
    const tall = ok.filter((k) => k.h[1] >= headroom * 0.60);
    const stackers = ok.filter((k) => STACKABLE.has(k) && k.h[1] < headroom * 0.60);
    const pool = tall.concat(tall, stackers);
    return pool.length ? pool : ok;
  }
  const loose = kinds.filter((k) => k.h[0] <= headroom - 0.01);
  if (loose.length) return loose;
  return [kinds.reduce((a, b) => (a.h[0] <= b.h[0] ? a : b))];
}

// ===========================================================================
// ROUND 20 — THE PLANOGRAM. THE UNIT OF ARRANGEMENT IS NOT THE FACING.
//
// r19's blind critic named two cues and they are the same cue: "the store is a
// mirror, and it is unnaturally tidy — every facing is aligned, every row is
// full, nothing is pulled forward, nothing is out of stock."
//
// Read next to the code below that is the round-8 verdict arriving again. All
// of the disorder was firing: reserved bare bays, per-SKU setback on a u^2.1
// tail, six wrong-states per facing, four bay states, per-instance yaw and
// scale and colour. What none of it touched is SCALE.
//
// Every mechanism in this file varies something over 0.06-0.30 m — one facing.
// A deck was a free-running sequence of brand blocks capped at 0.42-0.95 m,
// and each deck ran that sequence INDEPENDENTLY of the deck above it. So a 6 m
// face carried about nine blocks per deck times five decks: forty-five colour
// patches with no vertical relationship to each other at all. At the range the
// down-aisle poses stand at, 0.1 m subtends about 12 px, and forty-five
// uncorrelated patches average to one uniform mottle. That is what
// "unnaturally tidy" is naming — not the absence of disorder, the absence of
// STRUCTURE for the disorder to break.
//
// The photographs are the argument:
//
//   reference/store_01_Langenstein_s...: the left run's second deck is ONE
//   blue SKU, about fourteen facings across roughly 1.4 m, and the deck under
//   it is the same brand again at the same x. Three blocks span 2.5 m.
//
//   reference/store_00_Drinks...: the Chunky Soup wall is 64 near-identical
//   cans in a dead-square grid with ONE hole punched in it, and the endcap two
//   metres away has an ENTIRE BARE DECK with a framed sign on it. A real store
//   is big tidy blocks with big untidy gaps, not uniform small-scale noise.
//
// So the unit of arrangement is the PLANOGRAM SLOT: a stretch of run, 0.30 to
// 2.45 m wide, that belongs to one brand on EVERY deck of that face. The slot
// boundaries, the brand identity, the artwork cell and the base hue are
// properties of the FIXTURE FACE, shared by every deck; what varies deck to
// deck is which varieties are out, how deep the row sits, how faced it is, and
// whether that slot is out of stock on that particular shelf.
//
// AND IT IS ALSO THE MIRROR FIX AVAILABLE FROM THIS FILE. The two runs that
// bound an aisle carry the SAME department (store.js hands gondola i's +1 face
// and gondola i+1's -1 face both DEPTS[i+1]), so before this they drew the same
// kinds from the same palette with the same statistics at the same scale — and
// identical statistics at a distance is what "reads as a reflection" means,
// whatever the individual draws were. The plan key includes the face's own lip
// and direction, so those two runs now get different section boundaries,
// different form/hue subsets and different slot widths: one wall carries a
// 2.1 m block of red cans where the other carries four small blocks of boxes.
// That is a structural asymmetry at the scale a photograph is judged at, and
// it does not need store.js to change.
//
// WHAT IS NOT FIXED FROM HERE, stated plainly: the aisle blade signs, the
// gondola outline and the deck heights are store.js's. See the report.
// ---------------------------------------------------------------------------
// THE CONTROL. `?flat` in the page URL rebuilds with the planogram off and the
// round-19 free-running block loop restored, on the same source tree. That is
// AGENTS_BRIEF's "ship the old layout as a dial" adapted to a scene that is
// baked once per load: one navigate per side, no cross-build comparison, no
// git. Everything outside the packages is byte-identical between the two — see
// CHILD STREAM below.
const urlHas = (re) => { try { return re.test(location.search); } catch { return false; } };
export const PLANO_ON = !urlHas(/[?&]flat(&|=|$)/);
// ...and the same for the OTHER half of this round. `?lipflat` restores round
// 19's hard floor at the shelf plane — no negative setback, no overhang — so
// the lip work can be ablated on its own, and `?flat&lipflat` is r19's
// arrangement in both respects. Neither dial touches anything else in the file.
export const LIP_ON = !urlHas(/[?&]lipflat(&|=|$)/);

// --- deterministic hashing --------------------------------------------------
// The plan must be a property of the FIXTURE FACE and not of the order the
// store happened to build things in: two decks of one face are filled by two
// separate calls, minutes apart in the build, with other fixtures in between.
// So it cannot come off the caller's rng stream at all. FNV-1a plus a final
// avalanche; `mix2` is the allocation-free form for (slot, deck) cells.
function h32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 15; h = Math.imul(h, 0x2545f491) >>> 0; h ^= h >>> 13;
  return h >>> 0;
}
function mix2(a, b) {
  let v = (Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ Math.imul((b + 0x165667b1) >>> 0, 0xc2b2ae35)) >>> 0;
  v ^= v >>> 16; v = Math.imul(v, 0x7feb352d) >>> 0; v ^= v >>> 15;
  return (v >>> 0) / 4294967296;
}
// famsOf(dept)        -> the package families this department actually shelves
// famsOf(dept, 'can') -> its kinds in that family
const famsOf = (dept, fam) => {
  const all = (dept.kinds || []).concat(dept.soft || []);
  return fam ? all.filter((k) => k.t === fam) : all.map((k) => k.t);
};
// THE COVERAGE DEAL. One cursor per (department, family) pool, walked
// round-robin across the whole store, so every cell in a pool is placed before
// any cell is placed twice. `chopShelfCheck()` in store.js is the live proof —
// it reads aCell off the instanced geometry and throws on an unplaced cell.
const CELL_CURSOR = new Map();
export function cellDealStats() {
  return Object.fromEntries([...CELL_CURSOR].map(([k, v]) => [k, v]));
}
function dealCell(dept, fam) {
  const pool = dept.cells[fam] && dept.cells[fam].length ? dept.cells[fam] : dept.cells.box;
  const k = dept.key + '|' + fam;
  const n = (CELL_CURSOR.get(k) || 0);
  CELL_CURSOR.set(k, n + 1);
  return pool[n % pool.length];
}
const shuffled = (R, arr, n) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return n ? a.slice(0, Math.min(n, a.length)) : a;
};

// --- which fixture face am I on? -------------------------------------------
// fillShelf and fillBackRow are given the same (axis, a0, a1, face) for a face
// but DIFFERENT `lip` — a back row sits 0.045-0.40 m behind the facings — and
// store.js calls them in a different order at different fixtures (the gondola
// runs face-first, every other fixture back-row-first). So a face is matched on
// the tuple that is genuinely shared, plus the first lip seen as an anchor with
// a +/-0.9 m window: wider than the deepest back-row set in the building
// (0.395 m, the gondola runs) and narrower than the closest two fixture faces
// that could otherwise collide (1.24 m, the two faces of one gondola — which
// also differ in `face`, so they cannot collide anyway).
//
// FACE_LOG makes that rule checkable rather than asserted: `lips` is the count
// of DISTINCT lips a group absorbed, and it is 1 + (back rows per deck) for
// every fixture in the store. Two fixtures collapsing into one group would show
// up there immediately as a group with more lips than any fixture has ranks.
const FACES = [];
const FACE_SPAN = 0.9;
// ROUND 23. The SHELF PLANE of every face this build filled, exported because
// re-deriving it from the instances you are about to measure is a trap this
// file already documents one function up: at every fixture except the gondola
// runs, store.js calls fillBackRow FIRST, so `f.lip` is a back rank and `f.front`
// is the plane. Round 23's first depth-relief census recovered the plane as a
// per-group quantile of the very instances it was censusing, kept back rank 1,
// and reported the RANK PITCH — 172 mm — as a facing-to-facing stagger. lipCheck
// matches instances against these same planes; nothing else should invent its own.
export function facePlanes() {
  return FACES.map((f) => ({ dept: f.dept, axis: f.axis, face: f.face,
    plane: f.front, a0: f.a0, a1: f.a1 }));
}

// ROUND 24. The orientation census, wired to the SAME registry lipCheck and
// facet.js's stagger census match against. orient.js takes the planes as an
// argument rather than importing them, so it cannot grow a second idea of where
// the shelf plane is and this file does not close an import cycle.
export function orientStats(scene, opts) {
  return handStats(scene, facePlanes(), opts);
}

export function faceStats() {
  const byLips = {};
  let maxLips = 0, slots = 0;
  for (const f of FACES) {
    const n = f.lips.size; byLips[n] = (byLips[n] || 0) + 1;
    if (n > maxLips) maxLips = n;
    slots += f.plan ? f.plan.slots.length : 0;
  }
  return { faces: FACES.length, slots, maxLips, byLips,
    widths: FACES.flatMap((f) => (f.plan ? f.plan.slots.map((s) => +(s.a1 - s.a0).toFixed(3)) : [])) };
}
function faceOf(dept, axis, a0, a1, face, lip) {
  for (const f of FACES) {
    if (f.dept !== dept.key || f.axis !== axis || f.face !== face) continue;
    if (Math.abs(f.a0 - a0) > 1e-6 || Math.abs(f.a1 - a1) > 1e-6) continue;
    if (Math.abs(f.lip - lip) > FACE_SPAN) continue;
    f.lips.add(Math.round(lip * 1000));
    // THE ANCHOR IS NOT THE LIP. `f.lip` is the first lip this group saw and it
    // stays put, because it seeds the plan and a seed that moved mid-build
    // would give two decks of one face different slots. But at every fixture
    // except the gondola runs store.js calls fillBackRow FIRST, so that first
    // lip is a BACK RANK — 190 mm behind the shelf edge at the coolers. The
    // first run of lipCheck read the anchor as the shelf plane and reported
    // 11.07% of packages crossing it, with a 301 mm maximum, on the `?lipflat`
    // build where crossing is impossible by construction. `front` is the
    // front-most rank this group has been asked to fill, which is the plane.
    if ((lip - f.front) * face > 0) f.front = lip;
    return f;
  }
  const f = { dept: dept.key, axis, a0, a1, face, lip, front: lip,
    lips: new Set([Math.round(lip * 1000)]), plan: null };
  FACES.push(f);
  return f;
}

// --- the plan ---------------------------------------------------------------
// SECTIONS first. A department is not homogeneous along its run: `sign` already
// lists four sub-categories per department and a real planogram lays them out
// as contiguous stretches — coffee cans for four metres, then boxed tea. Each
// section takes a SUBSET of the department's forms and of its palette, so the
// two walls of one aisle differ in what dominates where and not merely in the
// draws they happened to make.
const BAY_STATE = [
  // skew  depth wrong hole  gap    stack chroma          cumulative p
  [0.32, 0.30, 0.30, 0.35, 0.30, 1.05, 1.00, 0.30],   // just fronted
  [1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.02, 0.66],   // ordinary
  [1.85, 1.90, 1.70, 2.10, 2.30, 0.80, 0.98, 0.87],   // shopped through
  [3.10, 2.90, 2.45, 3.30, 4.20, 0.55, 0.96, 1.00],   // been a Saturday
];
const stateOf = (i) => {
  const p = BAY_STATE[Math.max(0, Math.min(3, i))];
  return { skew: p[0], depth: p[1], wrong: p[2], hole: p[3], gap: p[4], stack: p[5], chroma: p[6] };
};
const pickState = (u) => { for (let i = 0; i < 4; i++) if (u < BAY_STATE[i][7]) return i; return 1; };

// `flatY` is the CONTROL. With `?flat` in the URL the plan is keyed by the deck
// as well as the face — so it is rebuilt per shelf instead of shared down the
// column — and the slot widths come back to round 19's uniform [0.42, 0.95].
// Those are the two things the planogram IS. Everything else in this file runs
// through the identical code path on both sides, which makes `?flat` an
// ablation of one idea rather than a comparison of two builds.
function planFor(dept, axis, a0, a1, face, lip, flatY) {
  const f = faceOf(dept, axis, a0, a1, face, lip);
  const flat = !PLANO_ON;
  if (!flat && f.plan) return f.plan;
  if (flat && f.plans && f.plans.has(flatY)) return f.plans.get(flatY);
  const seed = h32(f.dept + '|' + f.axis + '|' + f.a0.toFixed(3) + '|' + f.a1.toFixed(3)
    + '|' + f.face + '|' + Math.round(f.lip * 100) + (flat ? '|d' + flatY : ''));
  const R = makeRng(seed);
  const span = f.a1 - f.a0;

  // FAMILIES ARE CYCLED, NOT SAMPLED. Round 17: "widening a random draw buys
  // the square root of what you pay for", and this file just cut the number of
  // draws per face from ~45 to ~7 — so a sampler that was adequate at 45 is not
  // adequate here, and the first build of this round threw
  // `chopShelfCheck: pouch#9 CHUNK LIGHT TUNA is BAKED BUT NEVER PLACED`. That
  // is round 17's coverage deal arriving at a smaller pool: every face touches
  // every family its department shelves, and dealCell walks each pool
  // round-robin so the store covers a pool before it repeats a cell.
  const fams = [...new Set(famsOf(dept))];
  const famOff = Math.floor(R() * fams.length);
  const nSec = span < 2.4 ? 1 : Math.max(1, Math.min(4, Math.round(span / rr(R, 2.4, 4.6))));
  const cuts = [f.a0];
  for (let i = 1; i < nSec; i++) cuts.push(f.a0 + span * (i / nSec + rr(R, -0.12, 0.12)));
  cuts.push(f.a1 + 1e-6);
  cuts.sort((p, q) => p - q);
  const secs = [];
  for (let s = 0; s < nSec; s++) {
    secs.push({
      kinds: shuffled(R, dept.kinds, ri(R, 3, 5)),
      soft: shuffled(R, dept.soft && dept.soft.length ? dept.soft : dept.kinds, ri(R, 2, 3)),
      // shuffled ONCE and then dealt, not sampled — see nextHue
      hues: shuffled(R, dept.colors, Math.max(4, Math.round(dept.colors.length * rr(R, 0.38, 0.62)))),
      cur: Math.floor(R() * 97),
    });
  }
  // ADJACENT SLOTS MUST NOT BE THE SAME COLOUR. The first build of this round
  // put a 2.4 m red block next to a 1.8 m red block on the near-field aisle-4
  // pose and half the frame went one hue — because a department palette is
  // deliberately weighted (`canned` is mix('red','red','red','green',...), i.e.
  // 3/7 red by construction) and sampling it with replacement seven times is
  // very likely to draw the weight twice in a row. That weighting is right at
  // forty-five small patches per face and wrong at seven big ones: the whole
  // value of a big block is the STEP at its edge, and two adjacent blocks of
  // the same hue have no edge. So the palette is dealt round-robin off a
  // shuffle, and a deal within 24 degrees of the previous slot's hue is passed
  // over. Same coverage argument as dealCell, one level along.
  const hueGap = (p, q) => { const d = Math.abs(p - q) % 360; return d > 180 ? 360 - d : d; };
  const nextHue = (sec, prev) => {
    for (let t = 0; t < sec.hues.length; t++) {
      const h = sec.hues[sec.cur++ % sec.hues.length];
      if (!prev || hueGap(h[0], prev[0]) > 24 || Math.abs(h[2] - prev[2]) > 22) return h;
    }
    return sec.hues[sec.cur++ % sec.hues.length];
  };

  // SLOT WIDTH IS HEAVY-TAILED, and that is the whole point. The old
  // `brandMax = rr(rng, 0.42, 0.95)` is a NARROW band — sample it nine times
  // per deck and you get its mean, which is AGENTS_BRIEF's round-8 lesson
  // ("the variance is the thing that varies") one level up from where round 8
  // applied it. 0.30 + u^2.6 * 2.15 gives median 0.61 m, mean 0.90, p90 1.92,
  // max 2.45 — so half the shelf length sits in blocks the old code could not
  // produce at all, and a quarter of the slots are still narrower than its
  // minimum.
  const slots = [];
  let a = f.a0;
  let prevHue = null;
  while (a < f.a1 - 0.12) {
    let s = 0; while (s < nSec - 1 && a >= cuts[s + 1]) s++;
    const sec = secs[s];
    const w = Math.min(f.a1 - a, flat ? rr(R, 0.42, 0.95) : 0.30 + Math.pow(R(), 2.6) * 2.15);
    const fam = fams[(slots.length + famOff) % fams.length];
    const wantSoft = R() < 0.40;
    const secKinds = (wantSoft ? sec.soft : sec.kinds).filter((k) => k.t === fam);
    const kind = secKinds.length ? pick(R, secKinds)
      : pick(R, famsOf(dept, fam).length ? famsOf(dept, fam) : dept.kinds);
    slots.push({
      i: slots.length, a0: a, a1: a + w, sec: s, kind, fam,
      cell: dealCell(dept, fam),
      hsl: (prevHue = nextHue(sec, prevHue)),
      // The tidiness state is now a property of the SLOT and not of an
      // arbitrary 1.22 m grid laid over it. A stock clerk faces a planogram
      // section, so the seam between a fronted block and a wrecked one falls
      // where the brand changes — which is what makes it legible in a
      // photograph instead of averaging out.
      state: pickState(R()),
      // how many facings of one flavour before the flash colour steps
      runLen: ri(R, 2, 5),
    });
    a += w;
  }
  const plan = { seed, slots, secs, cuts, span };
  if (flat) { (f.plans = f.plans || new Map()).set(flatY, plan); f.plan = f.plan || plan; }
  else f.plan = plan;
  return plan;
}

// A slot's condition ON ONE DECK. Everything here is a pure function of
// (plan seed, slot index, deck) so fillShelf and fillBackRow agree without
// passing anything to each other.
//
// HARD OUT vs SOFT EMPTY, and why they are two things. A hard out is genuinely
// nothing on that shelf, back rows included: bare deck to the back panel, which
// is the single largest untidy feature in reference/store_00's right endcap and
// which this store has never once produced. A soft empty is the front rank
// gone with stock still behind it. `vacancy` — store.js's per-fixture dial,
// 0.06 at the drinks case to 2.8 on a checkout basket — scales the SOFT one
// only, because it is not passed to fillBackRow and a dial that only one of the
// two callers can see must not decide something both of them have to agree on.
const deckKeyOf = (deckY) => Math.round(deckY * 200);
const hardOut = (plan, si, deckY) =>
  mix2(plan.seed + si * 7919, deckKeyOf(deckY) * 3 + 11) < (deckY < 0.78 ? 0.052 : 0.034);

// ===========================================================================
// THE LIVE CHECK: DOES A BRAND OWN A COLUMN?
//
// The claim this round makes is one sentence — "a facing and the facing above
// it belong to the same brand" — and it is a property of the scene, not of the
// plan. AGENTS_BRIEF has retired six checks on this project for reading the
// table their author wrote instead of the artefact the player sees, so this
// one reads the instance matrices and the `aCell` attribute off the geometry
// the GPU is drawing, and identifies "same artwork" by MATERIAL IDENTITY plus
// the raw uv pair. There is no atlas table, no cell convention and no import
// from anybody else's file in it: two facings carry the same print iff they
// are drawn with the same material at the same uv, which is true by
// construction however pack.js lays its atlas out.
//
//   OBSERVED  pairs within 0.12 m of each other in plan and MORE than 0.30 m
//             apart in y — i.e. one above the other, on different decks of one
//             face. (0.30 m also excludes a stacked column, which is 0.10-0.25.)
//   NULL      the identical test with the search window displaced 1.2 m in
//             each of the four horizontal directions: same store, same
//             palette, same face, same deck spacing, DIFFERENT COLUMN. That is
//             what "these two would have matched anyway" looks like.
//
// It is a ratio, so the double-counting of unordered pairs cancels. Run it on
// `?flat` to see it read the null: that build is this round's change removed
// and nothing else, so a check that cannot tell the two apart is measuring its
// own rule set. Reported, never thrown — a store legitimately has faces with
// one deck, and a threshold here would be a constant nobody has swept.
export function columnCheck(scene, opts = {}) {
  const G = 0.25, NEAR = opts.near || 0.12, DY = opts.dy || 0.30, OFF = opts.off || 1.2;
  const px = [], py = [], pz = [], pm = [], pc = [];
  let meshes = 0;
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || !o.geometry) return;
    const aCell = o.geometry.attributes && o.geometry.attributes.aCell;
    if (!aCell || !o.material) return;
    meshes++;
    const M = o.instanceMatrix.array;
    const mid = o.material.uuid;
    for (let i = 0; i < o.count; i++) {
      const b = i * 16;
      px.push(M[b + 12]); py.push(M[b + 13]); pz.push(M[b + 14]); pm.push(mid);
      pc.push(Math.round(aCell.getX(i) * 8192) * 16384 + Math.round(aCell.getY(i) * 8192));
    }
  });
  const n = px.length;
  const key = (ix, iz) => ix * 100003 + iz;
  const H = new Map();
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(px[i] / G), Math.floor(pz[i] / G));
    let arr = H.get(k); if (!arr) H.set(k, arr = []); arr.push(i);
  }
  const tally = (ox, oz) => {
    let pairs = 0, same = 0;
    for (let i = 0; i < n; i++) {
      const qx = px[i] + ox, qz = pz[i] + oz;
      const cx = Math.floor(qx / G), cz = Math.floor(qz / G);
      for (let ax = -1; ax <= 1; ax++) {
        for (let az = -1; az <= 1; az++) {
          const arr = H.get(key(cx + ax, cz + az));
          if (!arr) continue;
          for (let t = 0; t < arr.length; t++) {
            const j = arr[t];
            if (j === i || pm[j] !== pm[i]) continue;
            if (Math.abs(py[j] - py[i]) <= DY) continue;
            if (Math.abs(px[j] - qx) > NEAR || Math.abs(pz[j] - qz) > NEAR) continue;
            pairs++; if (pc[j] === pc[i]) same++;
          }
        }
      }
    }
    return { pairs, same };
  };
  const obs = tally(0, 0);
  let np = 0, ns = 0;
  for (const [ox, oz] of [[OFF, 0], [-OFF, 0], [0, OFF], [0, -OFF]]) {
    const r = tally(ox, oz); np += r.pairs; ns += r.same;
  }
  const pct = (s, p) => (p ? +(100 * s / p).toFixed(2) : null);
  return {
    instances: n, meshes,
    columnPairs: obs.pairs, columnSameCell: pct(obs.same, obs.pairs),
    nullPairs: np, nullSameCell: pct(ns, np),
    lift: np && obs.pairs ? +((obs.same / obs.pairs) / (ns / np)).toFixed(2) : null,
  };
}

// ===========================================================================
// THE LIP INSTRUMENT: HOW MANY PACKAGES CROSS THE SHELF PLANE?
//
// r20's blind critic: "every object stops exactly at the shelf plane... zero
// objects crossing the lip in twelve plates". This counts them.
//
// WHAT IS LIVE AND WHAT IS NOT, stated because six checks on this project have
// been retired for blurring the two. The instance TRANSFORM is read off
// `instanceMatrix.array` — the buffer the GPU draws from — and the package
// EXTENT off the geometry's own bounding box, so the front-face position is
// the artefact and not a table. The LIP PLANE is not derivable from the scene
// by this file: it is the `lip` argument store.js passed in, recorded per face
// group when the face was first seen. It is an INPUT, not a log of my own
// arithmetic, and no result here depends on the fill algorithm agreeing with
// itself.
//
// `oneSided` needs no lip at all and is the check on the check: per face, the
// front-face coordinates' distance from their own median, forward vs backward.
// Round 19's expression was `back = half + 0.002 + (>=0 terms) + (>=0 setback)`
// — a hard wall on the forward side and an open tail behind — so `oneSided`
// must come back large and lopsided there and near 1 with the plane broken.
// Ablate with `?lipflat` and compare; a number that does not move between them
// is measuring its own rule set.
export function lipCheck(scene, opts = {}) {
  // Attribution, because the first run of this instrument reported 11.07% of
  // instances crossing on the `?lipflat` build where crossing is IMPOSSIBLE by
  // construction, with a maximum overhang of 301 mm. Zero is the most
  // suspicious reading an instrument can give and so is a reading that cannot
  // happen; `detail` says which meshes and which heights the crossers are, so
  // the answer is looked up rather than guessed at.
  const detail = opts.detail ? { byMesh: {}, byY: {}, bySize: {} } : null;
  const groups = FACES.map((f) => ({
    axis: f.axis, face: f.face, lip: f.front, dept: f.dept,
    a0: f.a0, a1: f.a1, n: 0, over: [], fronts: [],
  }));
  let n = 0, unmatched = 0;
  const bins = { p5: 0, p15: 0, p30: 0 };
  const soft = { n: 0, p5: 0, p15: 0, p30: 0, max: 0 };
  let rigid = 0, maxOver = 0;
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || !o.geometry) return;
    if (!o.geometry.attributes || !o.geometry.attributes.aCell) return;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const hx = (bb.max.x - bb.min.x) / 2, hy = (bb.max.y - bb.min.y) / 2, hz = (bb.max.z - bb.min.z) / 2;
    // ---- THE POPULATION SPLIT, AND THE BUG THAT FORCED IT ------------------
    // Measured off the live geometry, local bounding-box depth per family:
    //
    //   pouch/bag     2.021      pouch/gusset  1.810
    //   carton/box    1.000      carton/wrap   0.930      can/tub  1.040
    //   can/rim, can/jar, can/cylinder, bottle/*   0.815 - 1.000
    //
    // `place` sizes its clearance as `half = (|cos|*sz + |sin|*sx)/2`, i.e. it
    // assumes the geometry occupies a UNIT cube, which is true of ten families
    // and false by a factor of two for the two bag ones. store.js's pillowGeo
    // multiplies its belly ring by `(1 + bulge*3)` = 2.02 and gussetGeo's foot
    // reaches 1.89, and 38-42% of those meshes' vertices sit past |z| = 0.55.
    // So every forward-facing pillow bag in this store has been standing about
    // 105 mm THROUGH the shelf lip since those two functions were written —
    // pre-existing, in both builds, and nothing to do with this round.
    //
    // It has to be split out rather than netted: those 4,201 instances cross in
    // the `?lipflat` control too, so pooling them would credit this round with
    // a constant. The headline is the ten rigid families, where the control is
    // exactly zero by construction. The geometry is store.js's; see the report.
    const isSoft = /^pouch\/(bag|gusset)$/.test(g.name || '');
    const M = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) {
      const b = i * 16;
      const cx = M[b + 12], cy = M[b + 13], cz = M[b + 14];
      // world half-extent of the rotated box along x and along z
      const ex = Math.abs(M[b]) * hx + Math.abs(M[b + 4]) * hy + Math.abs(M[b + 8]) * hz;
      const ez = Math.abs(M[b + 2]) * hx + Math.abs(M[b + 6]) * hy + Math.abs(M[b + 10]) * hz;
      // nearest face group: same axis, the run span contains it, and the cross
      // coordinate is within one fixture depth on the product side of the lip
      let best = null, bestD = 1e9;
      for (const gr of groups) {
        const along = gr.axis === 'z' ? cz : cx;
        const cross = gr.axis === 'z' ? cx : cz;
        // NO along-margin. An endcap sits BEYOND the end of the run it caps, on
        // the other axis, and a 0.25 m margin let corner facings match the
        // wrong fixture and take a nonsense cross coordinate with them.
        if (along < gr.a0 || along > gr.a1) continue;
        const d = (gr.lip - cross) * gr.face;          // >0 = behind the lip
        if (d < -0.12 || d > 0.85) continue;
        if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = gr; }
      }
      n++;
      if (!best) { unmatched++; continue; }
      const cross = best.axis === 'z' ? cx : cz;
      const ext = best.axis === 'z' ? ex : ez;
      // how far the front face sticks out past the lip, in metres
      const over = (cross + best.face * ext - best.lip) * best.face;
      best.n++; best.fronts.push(over);
      if (isSoft) {
        soft.n++;
        if (over > 0.005) soft.p5++;
        if (over > 0.015) soft.p15++;
        if (over > 0.030) soft.p30++;
        if (over > soft.max) soft.max = over;
      } else {
        rigid++;
        if (over > 0.005) bins.p5++;
        if (over > 0.015) bins.p15++;
        if (over > 0.030) bins.p30++;
        if (over > maxOver) maxOver = over;
      }
      if (detail && over > 0.005) {
        const nm = o.name || '(anon)';
        detail.byMesh[nm] = (detail.byMesh[nm] || 0) + 1;
        const yk = 'y' + (Math.round(cy * 4) / 4).toFixed(2);
        detail.byY[yk] = (detail.byY[yk] || 0) + 1;
        const sk = 'ext' + Math.round(ext * 100);
        detail.bySize[sk] = (detail.bySize[sk] || 0) + 1;
      }
    }
  });
  // lip-free one-sidedness, per face with >= 200 facings
  const ratios = [];
  for (const gr of groups) {
    if (gr.fronts.length < 200) continue;
    const s = gr.fronts.slice().sort((p, q) => p - q);
    const med = s[s.length >> 1];
    const fwd = s[Math.floor(s.length * 0.995)] - med;
    const bwd = med - s[Math.floor(s.length * 0.005)];
    if (bwd > 1e-4) ratios.push(fwd / bwd);
  }
  ratios.sort((p, q) => p - q);
  const pc = (v, d) => +(100 * v / Math.max(1, d)).toFixed(2);
  return {
    instances: n, unmatched, faces: groups.filter((g) => g.n).length,
    // HEADLINE: the ten families whose geometry is a unit cube.
    rigid,
    crossing5mm: pc(bins.p5, rigid),
    crossing15mm: pc(bins.p15, rigid),
    crossing30mm: pc(bins.p30, rigid),
    maxOverhangMm: +(maxOver * 1000).toFixed(1),
    // the two bag families, which cross in EVERY build for a reason this round
    // did not create and cannot fix from this file
    softBags: { n: soft.n, p5: pc(soft.p5, soft.n), p15: pc(soft.p15, soft.n),
      p30: pc(soft.p30, soft.n), maxMm: +(soft.max * 1000).toFixed(1) },
    oneSidedN: ratios.length,
    oneSidedMed: ratios.length ? +ratios[ratios.length >> 1].toFixed(3) : null,
    detail,
  };
}

// ---------------------------------------------------------------------------
// BACK ROWS. A real gondola shelf is 22in deep and stocked three or four units
// back; round 2 stocked exactly one row, so roughly 60% of every deck was bare
// cream board receding behind the facings. Side-by-side crops against the
// reference photography showed that band — not the product — was the single
// largest flat region in the frame.
//
// These rows are mostly occluded by the facings in front of them, so they are
// plain boxes with no tags, no stacking and no anomalies: the cheapest
// geometry that removes the flat area and shows through the gaps.
// ---------------------------------------------------------------------------
// ROUND 24 — THE DRAW SIGNATURE, and it is here because it caught a live bug.
//
// This round's A/B is only worth something if `?flatyaw` is THIS store with
// three expressions zeroed rather than a different store. Round 23 argued that
// from the code — every added term is a hash, so no draw moves. Round 24 wrote
// exactly that and it was WRONG: the leftover-on-top test ends in
// `&& rng() < 0.17`, which short-circuits, and its `lastTop` gate moved with
// `rise`, so five of the 814 fill calls made a different number of draws and the
// two arms came back with different instance counts (42,966 against 42,965).
//
// So the claim is measured instead of argued. Each fill call folds its own key
// and its own DRAW COUNT into an FNV; two builds whose fill loops made the same
// draws in the same order have the same 32-bit signature and two that did not,
// do not. It costs one closure call per draw at build time and nothing at all
// afterwards. See `drawSig()` in the report.
let DRAW_SIG = 2166136261 >>> 0;
let DRAW_CALLS = 0, DRAW_N = 0;
function drawFold(key, n) {
  const s = key + '=' + n;
  for (let i = 0; i < s.length; i++) {
    DRAW_SIG ^= s.charCodeAt(i); DRAW_SIG = Math.imul(DRAW_SIG, 16777619) >>> 0;
  }
  DRAW_CALLS++; DRAW_N += n;
}
export function drawSig() {
  return { sig: DRAW_SIG >>> 0, fillCalls: DRAW_CALLS, draws: DRAW_N };
}

export function fillBackRow(B, rng0, dept, opts) {
  const { axis, a0, a1, lip, face, deckY, headroom, depth, lit, col } = opts;
  // THE CHILD STREAM. See fillShelf's note: exactly one draw off the caller's
  // rng, whatever this function then does.
  const rngRaw = makeRng((rng0() * 4294967296) >>> 0);
  let dn = 0; const rng = () => { dn++; return rngRaw(); };
  const dkey = 'BR|' + dept.key + '|' + axis + '|' + a0.toFixed(3) + '|' + lip.toFixed(3)
    + '|' + deckY.toFixed(3);
  const litAt = opts.litAt || null;
  // ROUND 7: the deck under this row is no longer one flat line — see `notch`
  // in store.js. Product has to ride the step or it sinks into one bay's board
  // and floats over the next one's.
  const stepAt = opts.stepAt || null;
  const isZ = axis === 'z';
  const baseRy = isZ ? (face > 0 ? Math.PI / 2 : -Math.PI / 2) : (face > 0 ? 0 : Math.PI);
  // ROUND 20 — a HARD OUT is bare to the back panel. Round 17 made these boxes
  // department-aware because a bakery gap showing a bottle of bleach behind it
  // is a tell; the same argument one scale finer says the box you glimpse
  // through a gap belongs to the brand standing in front of it, and that an
  // out-of-stock slot has nothing behind it either.
  const plan = planFor(dept, axis, a0, a1, face, lip, deckKeyOf(deckY));
  const slotAt = (p) => {
    for (const s of plan.slots) if (p >= s.a0 && p < s.a1) return s;
    return plan.slots.length ? plan.slots[plan.slots.length - 1] : null;
  };
  let a = a0;
  let guard = 0;
  while (a < a1 - 0.05 && guard++ < 300) {
    if (rng() < 0.10) { a += rr(rng, 0.05, 0.26); continue; }
    const slot = slotAt(a);
    if (slot && hardOut(plan, slot.i, deckY)) { a = Math.max(a + 0.05, slot.a1 + 0.002); continue; }
    const w = rr(rng, 0.07, 0.23);
    const h = Math.max(0.06, Math.min(headroom - 0.02, rr(rng, headroom * 0.5, headroom * 0.97)));
    const pd = Math.min(depth, rr(rng, 0.10, 0.19));
    const hsl = slot && rng() < 0.72 ? slot.hsl : pick(rng, dept.colors);
    // ---- ROUND 12 (people) — A CELL INDEX IS ONLY MEANINGFUL IN ITS OWN
    //      ATLAS, AND THIS LINE HAS BEEN CROSSING THEM SINCE ROUND 20.
    //
    // Every unit in a back row is drawn as a CARTON — the push below is
    // `B.box.push` and always has been. `slot.cell` is dealt by dealCell(dept,
    // slot.fam), so on a slot whose family is a bottle or a can it is an index
    // into the BOTTLE or CAN atlas, and handing it to the carton batch prints
    // whatever carton happens to sit at that index. Soda's six bottle cells
    // {1,4,7,10,13,16} came out of the carton atlas as
    //
    //   BEEF BROTH · COLA · PAIN RELIEVER · THIN SPAGHETTI · INSTANT OATMEAL
    //   · FISH STICKS
    //
    // — five of six from the wrong department and one of them across the food
    // line, which is the exact defect round 5 exists to prevent, arriving by a
    // route round 5 could not see. Found in the GRAB & GO cooler while auditing
    // the stray pools: one box of spaghetti standing behind the drinks.
    //
    // It is worth more than it looks. This function fills the rank you see
    // THROUGH the gaps, and as of this round the player makes gaps deliberately
    // and then looks straight at them.
    //
    // THE FIX CONSUMES THE IDENTICAL RNG STREAM. `rng() < 0.72` is drawn either
    // way and `pick` runs on exactly the branch it ran on before; the family
    // test is applied to the VALUE, not to whether a draw happens. So drawSig()
    // is unchanged and nothing downstream of this function re-rolls — which is
    // the whole reason r20's child-stream note exists. The replacement is a
    // carton cell from the same department keyed by slot index, so a slot's
    // whole back row is one design: the thing the comment above already claims,
    // now true for bottle and can slots as well as box ones.
    const keep = rng() < 0.72;
    const cell = slot && keep
      ? (slot.fam === 'box' ? slot.cell
        : dept.cells.box[slot.i % dept.cells.box.length])
      : pick(rng, dept.cells.box);
    const n = ri(rng, 1, 4);
    // ---- ROUND 23 — THE BACK RANK WAS A LITERAL PLANE ---------------------
    // `back = pd / 2 + 0.008` put every box in a rank's front face EXACTLY 8 mm
    // behind that rank's lip, with no per-box term of any kind. That is 90% of
    // the 30,231 carton instances in this store — the front rank is about 3,000
    // of them — and it is the surface you see through every gap and over the top
    // of every short facing. Round 23's whole cue is co-planarity; the largest
    // co-planar population in the building was here, not in the front rank.
    //
    // Same comb as fillShelf and the same reason for hashing it rather than
    // drawing it: an rng draw here would re-roll the rest of this rank and
    // `?flatface` would stop being the same instances.
    const cAmpB = FACET.on ? 0.024 : 0;
    let cPrevB = 0;
    for (let k = 0; k < n && a < a1 - w * 0.5; k++) {
      col.setHSL(hsl[0] / 360, Math.min(1, hsl[1] / 100 * rr(rng, 1.1, 1.45)),
        Math.min(0.92, hsl[2] / 100 * rr(rng, 0.80, 1.22)));
      col.multiplyScalar(lit * (litAt ? litAt(a + w / 2) : 1) * 0.82 * rr(rng, 0.90, 1.08));
      const bk = plan.seed + Math.round(lip * 977) + Math.round(a * 1000) * 31 + k * 104729;
      cPrevB = comb(mix2(bk, deckKeyOf(deckY) * 3 + 131),
        mix2(bk, deckKeyOf(deckY) * 3 + 149), cPrevB, cAmpB);
      // ---- ROUND 24 — THE BACK RANK IS 90% OF THE CARTONS -------------------
      // This is the surface you see through every gap and over the top of every
      // short facing, and it took no orientation at all: roll fixed at 0, yaw at
      // +-0.10 rad, height with no per-unit term. Same hand as the front rank,
      // at 0.40 of the turn — a back-rank unit is boxed in on both sides and
      // cannot turn far — and the same seat.
      const dkB = deckKeyOf(deckY) * 3;
      const ohB = hand([mix2(bk, dkB + 191), mix2(bk, dkB + 197), mix2(bk, dkB + 199),
        mix2(bk, dkB + 211), mix2(bk, dkB + 223), mix2(bk, dkB + 227)],
      { gain: 1, axis: isZ ? 1 : 0.35, lean: true, rise: true });
      const rollB = ohB.lean;
      const yawB = baseRy + rr(rng, -0.10, 0.10) + ohB.turn * 0.40;
      const hB = h * ohB.rise;
      // clamped into the rank's own slab: never proud of its lip, never through
      // the rank behind it (the ranks are 175 mm apart, this box is pd deep).
      // The rotated footprint is charged through extentAlong — facet.js's one
      // owner — rather than through a second `pd / 2` guess, which is what the
      // half-extent in front of a lip is for.
      const halfB = ORIENT.on
        ? extentAlong(isZ, w * 0.98, hB, pd, rollB, yawB, false) : pd / 2;
      const back = halfB + 0.008 + Math.max(-0.006, Math.min(0.150 - pd, cPrevB));
      const cx = isZ ? lip - face * back : a + w / 2;
      const cz = isZ ? a + w / 2 : lip - face * back;
      const seatB = ORIENT.on ? seat(rollB, yawB, w * 0.98, hB, pd) : 0;
      B.box.push(cx, deckY + (stepAt ? stepAt(a + w / 2) : 0) + hB / 2 + seatB, cz,
        rollB, yawB, 0, w * 0.98, hB, pd, col, cell);
      a += w + rr(rng, 0, 0.007);
    }
    a += rr(rng, 0.002, 0.022);
  }
  drawFold(dkey, dn);
}

export function fillShelf(B, rng0, dept, opts) {
  const {
    axis, a0, a1, lip, face, deckY, headroom, depth, lit, col,
    pull = 0.5, tag = null, vacancy = 1, litAt = null, stepAt = null,
  } = opts;
  // ---- THE CHILD STREAM ---------------------------------------------------
  // ROUND 20. This function used to draw straight off store.js's run rng, and
  // it draws a DIFFERENT NUMBER of times depending on what it decides to
  // shelve. So every previous change to the fill algorithm also re-rolled
  // every sign cell, shopper position, dangler and pallet built after it, and
  // no A/B of a shelf change could ever be paired against anything.
  //
  // One draw off the caller's stream, then a child seeded from it. The store
  // outside the packages is now byte-identical between two builds that differ
  // only inside these two functions — which is what makes `?flat` a control
  // and not a second build.
  const rngRaw = makeRng((rng0() * 4294967296) >>> 0);
  let dn = 0; const rng = () => { dn++; return rngRaw(); };
  const dkey = 'FS|' + dept.key + '|' + axis + '|' + a0.toFixed(3) + '|' + lip.toFixed(3)
    + '|' + deckY.toFixed(3);
  const dy = (p) => deckY + (stepAt ? stepAt(p) : 0);
  const isZ = axis === 'z';
  const baseRy = isZ ? (face > 0 ? Math.PI / 2 : -Math.PI / 2) : (face > 0 ? 0 : Math.PI);

  // Vertical gradient: the top deck is faced right up to the lip, the bottom
  // deck sits several inches back. That gradient alone changes how an aisle
  // reads far more than any single item does.
  const deckSetback = (1 - pull) * 0.024;

  // ---- ROUND-8: THE VARIANCE IS THE THING THAT VARIES ---------------------
  //
  // Blind test 7: "every facing is face-forward, evenly pitched, flush to the
  // shelf front, and full." Read next to the code that produced those frames
  // that is a strange verdict, because round 3 already gave every unit its own
  // yaw, its own depth, a 1-in-20 chance of being shelved backwards and six
  // separate ways of being WRONG. All of it was firing. The critic is still
  // right, and the reason is the one thing none of that touched:
  //
  //   every shelf in the building drew from the SAME distribution.
  //
  // Yaw was +-4 degrees everywhere. Depth wander was 0-28 mm everywhere. The
  // wrong-state probability was 2.6/n everywhere. Sample a fixed distribution
  // four thousand times and you do not get variety, you get its mean, plus
  // noise too small to read at the scale a photograph is judged at. What a
  // real store has is high variance IN THE VARIANCE: the bay a clerk fronted
  // an hour ago is a planogram photograph, the bay beside it has been through
  // a Saturday and is 40 mm deep in gaps and cocked boxes, and the two are
  // 1.2 m apart on the same run.
  //
  // So each bay draws a STATE, and the state sets the parameters every draw
  // below is made from. Nothing new is randomised; what changed is that the
  // ranges are themselves a random variable. The same idea, one level up.
  //
  // ROUND 20 — the state is now carried by the PLANOGRAM SLOT rather than by a
  // 1.22 m grid laid across the deck, so the seam between a fronted block and a
  // wrecked one falls where the brand changes. That is the arrangement change,
  // not a retuning: the eight numbers above are round 8's, unaltered.
  const plan = planFor(dept, axis, a0, a1, face, lip, deckKeyOf(deckY));
  const lowDeck = deckY < 0.78;
  // A slot's condition on THIS deck. `u` salts pick apart so the hole, the
  // depth and the state-bump are independent; `hardOut` is shared with
  // fillBackRow and is the only one of them that has to be.
  const u = (si, salt) => mix2(plan.seed + si * 7919, deckKeyOf(deckY) * 3 + salt);
  const slotDeck = (s) => {
    const hard = hardOut(plan, s.i, deckY);
    // SOFT EMPTY — front rank gone, back rows still standing. `vacancy` scales
    // this one only; see the note above hardOut.
    const soft = !hard && u(s.i, 23) < 0.055 * vacancy * (lowDeck ? 1.55 : 1.0);
    // a whole slot shopped down and shoved back, on this deck only
    const deep = !hard && !soft && u(s.i, 41) < 0.10;
    // bottom decks are shopped harder than eye level: bump the state one step
    let si2 = s.state;
    if (lowDeck && u(s.i, 59) < 0.34) si2 = Math.min(3, si2 + 1);
    else if (!lowDeck && u(s.i, 59) < 0.16) si2 = Math.max(0, si2 - 1);
    // ---- ROUND 20 — FRONTED ONTO THE RAIL ---------------------------------
    // "Fronting" is not a synonym for tidy: a clerk pulls the whole block
    // forward until the front rank is ON the rail, and on a deep-faced block
    // it ends up proud of the lip. So a slot carries a per-deck LONGITUDINAL
    // BIAS that can be negative, and the step at a slot seam between a
    // fronted block (-22 mm) and a shopped one (+40 mm) is 60 mm of broken
    // lip line — which is the half of the r20 cue that lives in this file.
    // A per-FACING proud unit (the switch below) breaks the line in one place;
    // this breaks it in BLOCKS, which is what the photographs show.
    const pu = u(s.i, 71);
    const proud = deep ? 0 : (pu < 0.40 ? -(0.004 + (0.40 - pu) * 0.115) : 0);
    return { hard, soft, deep, proud, BS: stateOf(si2) };
  };

  // Cans and bottles have a ROUND cross-section: their depth is their width,
  // never the carton depth, or they lathe out into long elliptical tubes and
  // the whole aisle reads as boxes.
  // `overhang` is a request to hang this unit over the lip as far as the clamp
  // below allows. It exists because `lean` — the clearance a rolled unit pays
  // so its top corner does not swing through the price rail — is up to half the
  // package's HEIGHT, which for the classic knocked-over restock leftover is
  // 130 mm of guaranteed setback. That term is correct and it is also why the
  // one item on the shelf that is physically lying across the front of a row
  // was the item furthest from the lip. Callers cannot cancel it themselves
  // without a second copy of this formula, so they ask instead.
  // ---- ROUND 24 — `seatOn` -----------------------------------------------
  // A rotated package's lowest corner is not sy/2 below its centre, so a leaning
  // facing placed at `deck + sy/2` buries a corner in the shelf board. `seat`
  // (orient.js) is the one owner of that correction and it is applied HERE,
  // where `sz` is finally known, so no caller has to restate `round ? sx : pd`.
  // Callers that have already placed a unit deliberately — the tipped straggler
  // and the flat leftover, both of which pass a `cy` derived from their own
  // width — pass seatOn false and keep their own arithmetic.
  const place = (kind, cell, w, pd, a, cy0, setback, yaw, roll, sx, sy, overhang = 0,
    seatOn = false) => {
    const round = kind.t === 'can' || kind.t === 'bottle';
    const sz = round ? sx : pd;
    let cy = cy0;
    if (seatOn && !ORIENT.noSeat) {
      const s = seat(roll, yaw, sx, sy, sz);
      cy += s;
      HAND_LOG.seatN++; HAND_LOG.seatSum += Math.abs(s);
      if (Math.abs(s) > HAND_LOG.seatMax) HAND_LOG.seatMax = Math.abs(s);
    }
    // A face-turned or hard-skewed carton presents a DIFFERENT footprint to the
    // lip. Without this it pokes straight through the shelf edge and through
    // the cavity AO plane, and the wrongness reads as a bug rather than as a
    // customer having put something back sideways.
    // ---- ROUND 23 — ONE OWNER FOR THE CLEARANCE ---------------------------
    // This was two expressions:
    //
    //     half = ( |cos(dth)| * sz + |sin(dth)| * sx ) / 2       // exact
    //     lean = |sin(roll)| * sy * 0.5                          // a second guess
    //
    // and the second one was wrong for half the store. The composed rotation is
    // Rx(roll) * Ry(yaw), so the world extent along X — the axis every Z-axis
    // run faces along, which is most of the gondolas in this building — is row 0
    // of that matrix and row 0 HAS NO ROLL IN IT. `lean` was pushing every
    // leaning, crushed and knocked-over facing on those runs back by up to half
    // its own height for a swing that happens along the aisle. On a 0.35 m
    // carton that is 175 mm, and it is why the most out-of-plane objects on the
    // shelf were the ones furthest from the lip — a complaint this file already
    // makes about the flat-lying leftover, three hundred lines down, without
    // noticing that this line is the cause.
    //
    // extentAlong() is now the only place that derivation lives, it is exact for
    // both axes, and sideCheck() proves it against the instance matrices the GPU
    // is drawing (sideSelfTest fires it on the expression above). `?leanpad`
    // puts the old term back so the geometry fix can be priced on its own.
    const half = FACET.leanPad
      ? extentR22(isZ, sx, sy, sz, roll, yaw, baseRy, round)
      : extentAlong(isZ, sx, sy, sz, roll, yaw, round);
    // ROUND 5. This was a flat 14 mm of clearance behind the lip on EVERY unit,
    // so a strip of bright deck showed in front of every single facing and the
    // run read as a display rather than as a shelf that has been faced. A stock
    // clerk faces product TO the lip; on a busy day it ends up slightly proud
    // of it. 2 mm minimum, and the rail stands 12 mm in front of the lip, so a
    // proud facing still clears it.
    //
    // ---- ROUND 20 — THE LIP LINE. THIS EXPRESSION WAS THE BUG. -------------
    // r20's blind critic called the same cue at SIX OF SIX poses, including
    // the three chase poses where no package text resolves at all: "the aisle
    // volume is empty; every object stops exactly at the shelf plane, so the
    // shelf edge reads as an unbroken ruler-straight bar from gondola end to
    // gondola end." It found ZERO objects crossing the lip in twelve plates.
    //
    // Read here that is not an omission, it is an INVARIANT. `back` is
    // `half + 0.002 + (a non-negative wander) + lean + (a setback the callers
    // floored at zero)`, so the front face of all 42,000 packages in this
    // building sat at or behind the shelf plane, always, by construction. Six
    // rounds of "vary the depth" widened the distribution downwards only. A
    // one-sided distribution against a plane is a ruler.
    //
    // `setback` may now go negative and the floor is a fraction of the
    // package's own half-depth rather than the plane: a proud unit hangs over
    // by up to 0.70 of its half-depth — about 35 mm on a 100 mm carton, which
    // is what reference/store_02's 409 bottles and Windex neck tags do at
    // crop (1180,380)-(1720,684). The CENTRE never crosses, so nothing floats.
    const sb = LIP_ON ? setback : Math.max(0, setback);
    const ov = LIP_ON ? overhang : 0;
    const back = Math.max(LIP_ON ? half * 0.30 : half + 0.002,
      half + 0.002 + rr(rng, 0, 0.020) + sb - ov);
    const cx = isZ ? lip - face * back : a;
    const cz = isZ ? a : lip - face * back;
    if (kind.t === 'box' || kind.t === 'bag') {
      B[kind.t === 'bag' ? 'bag' : 'box']
        .push(cx, cy, cz, roll, yaw, 0, sx, sy, sz, col, cell, kind.shape);
    } else if (kind.t === 'can') {
      B.can.push(cx, cy, cz, roll, yaw, 0, sx, sy, sz, col, cell, kind.shape);
    } else {
      B.bottle.push(cx, cy, cz, roll, yaw, 0, sx, sy, sz, col, cell, kind.shape);
    }
  };

  // ---- the deck is now a walk over the FACE's slots, not a free run --------
  // Every deck of this face walks the same boundaries in the same order. What
  // it does inside each one is its own business.
  let a = a0;
  let lastFlat = -99;
  const famPool = dept.soft && dept.soft.length ? dept.kinds.concat(dept.soft) : dept.kinds;
  // A slot declares a FAMILY and a preferred kind; a deck declares a clear
  // height. A brand that will not stand up under this shelf is shelved in its
  // short version — which is what a real one is, and what keeps the vertical
  // column's identity while each deck keeps its own proportions.
  const kindFor = (slot) => {
    const same = famPool.filter((k) => k.t === slot.fam);
    const pool = fits(same.length ? same : famPool, headroom);
    return pool.includes(slot.kind) ? slot.kind : pick(rng, pool);
  };

  for (const slot of plan.slots) {
    const sA = Math.max(slot.a0, a0), sB = Math.min(slot.a1, a1);
    if (sB - sA < 0.07) continue;
    a = sA;
    const cond = slotDeck(slot);
    const BS = cond.BS;

    // ---- OUT OF STOCK ON THIS DECK -----------------------------------------
    // A hard out is bare to the back panel (fillBackRow honours the same
    // predicate); a soft out is the front rank gone with stock behind it. Both
    // are drawn the same way from the aisle: an orphaned tag ribbon under an
    // empty stretch, with survivors clinging to the edges.
    if (cond.hard || cond.soft) {
      if (tag) {
        for (let t = sA + 0.02; t < sB - 0.05; t += rr(rng, 0.11, 0.30)) {
          tag(t, rr(rng, 0.055, 0.10), 'orphan');
        }
      }
      // ---- ROUND 7: RAGGED, NOT RECTANGULAR -------------------------------
      // "The emptiness is too tidy: clean rectangular voids on a spotless
      // deck, where real shopped-through shelves are ragged."
      // Right, and the reason is that round 3's bare bay was a plan-level
      // SKIP — the fill loop jumped the whole span, so the void was exactly
      // as wide as the plan said and its two edges were the flush faces of
      // the blocks either side. A bay that has been shopped out is never
      // that: there is always one unit left at the back that nobody could
      // reach, one lying on its side, and a survivor or two clinging to each
      // edge of the hole. Those stragglers are what make the void read as
      // something that HAPPENED rather than as something that was drawn.
      const bw = sB - sA;
      const strag = ri(rng, 1, 3);
      for (let q = 0; q < strag && bw > 0.22; q++) {
        const sk = pick(rng, fits(dept.kinds, headroom));
        const sw = rr(rng, sk.w[0], sk.w[1]);
        const sh = Math.min(headroom - 0.03, rr(rng, sk.h[0], sk.h[1]));
        const sd = Math.min(depth * 0.9, 0.20, Math.max(0.07, sk.d * depth));
        const hs = pick(rng, dept.colors);
        col.setHSL(hs[0] / 360, Math.min(1, hs[1] / 100 * 1.4),
          Math.min(0.95, hs[2] / 100 * rr(rng, 0.80, 1.15)));
        // stragglers sit in the DARK: they are 100-200 mm back off the lip,
        // in the part of the cavity the AO card is blackest over
        col.multiplyScalar(lit * 0.58 * rr(rng, 0.82, 1.02));
        const sp = q === 0 ? sA + rr(rng, 0.01, 0.06)
          : (q === 1 ? sB - rr(rng, 0.03, 0.10) : sA + rng() * bw);
        const tipped = rng() < 0.38;
        // `dept.cells[sk.t] || dept.cells.box` never fired its fallback: an
        // empty pool is `[]`, which is truthy, so it picked from nothing and
        // handed `undefined` to Batch, which stores `(undefined|0) = 0` — cell
        // zero of the atlas, silently. Same shape as the back-row leak above.
        // The pool cannot be empty for a family this department shelves; the
        // module-load assertion at the head of this file is what says so.
        place(sk, pick(rng, dept.cells[sk.t].length ? dept.cells[sk.t] : dept.cells.box), sw, sd, sp,
          deckY + (stepAt ? stepAt(sp) : 0) + (tipped ? sw * 0.5 : sh / 2),
          Math.min(Math.max(0, depth - sd - 0.02), rr(rng, 0.06, 0.19)),
          baseRy + rr(rng, -0.5, 0.5), tipped ? Math.PI / 2 : rr(rng, -0.12, 0.12),
          sw, sh);
      }
      continue;
    }
    // ---- the slot's brand ---------------------------------------------------
    // The cell and the base hue come off the SLOT, so they are the same on
    // every deck of this face. Round 19 drew both here, per deck, which is the
    // one line that made a face forty-five uncorrelated colour patches.
    const kind = kindFor(slot);
    const cell = slot.cell;
    const baseHsl = slot.hsl;

    const w = rr(rng, kind.w[0], kind.w[1]);
    let h = rr(rng, kind.h[0], kind.h[1]);
    if (h > headroom - 0.03) h = Math.max(0.08, headroom - rr(rng, 0.03, 0.09));
    // Real cartons are 2-5in deep, not 19. Product is pulled forward and the
    // empty deck behind it goes dark under the cavity gradient — which is what
    // a shopped shelf actually looks like.
    const pd = Math.min(depth * 0.94, 0.21, w * 1.7, Math.max(0.07, kind.d * depth));

    // Flavour varieties of the SAME brand: identical artwork, different flash
    // colour. This is the dominant rhythm on a real shelf. A wide slot carries
    // more of them, so a 2 m block is not one flat colour either.
    const varieties = Math.max(1, Math.min(6, Math.round((sB - sA) / 0.42) + ri(rng, 0, 1)));
    // ~1 SKU in 9 has been shopped through: the row is still there but it has
    // been pulled 100-220 mm back off the lip and sits in the dark. That
    // silhouette — a facing at the rail beside a facing sunk in shadow — is
    // most of what makes a real shelf read as trafficked.
    const shopped = rng() < 0.115 * BS.hole;
    const maxSet = Math.max(0, depth - Math.min(depth * 0.94, 0.21) - 0.02);
    // ROUND 9 — DEPTH IS A CONTINUUM, NOT A COIN FLIP. Blind test 8:
    // "vary product depth, not just count. Everything still sits flush at the
    // lip." Both halves were true and the cause was this line: setback was
    // binary. One SKU in nine was declared "shopped" and pulled 100-220 mm
    // back, and the other eight in nine got 0-16 mm, i.e. flush. So the wall
    // read as a plane with occasional holes punched in it rather than as a
    // surface with relief.
    //
    // Nobody fronts a shelf to the millimetre. A facing is where the last
    // shopper left it, and over a day that produces a heavy-tailed
    // distribution: most SKUs a few centimetres back, a long tail out to a
    // hand's depth, and separately the ones that have genuinely been shopped
    // through. u^2.1 * 115 mm is that: median 27 mm, upper decile 90 mm,
    // maximum 115 — over a 100 mm carton, enough that the lip line reads as
    // ragged from down the aisle instead of as an edge.
    const sd = rng();
    const skuSetback = Math.min(maxSet, deckSetback + cond.proud
      + (cond.deep ? rr(rng, 0.055, 0.13) : 0)
      + (shopped
        ? rr(rng, 0.10, 0.24) * BS.depth
        : Math.pow(sd, 2.1) * 0.115 * BS.depth));

    // The SLOT is the cap now. Round 2 was called on 24 identical faces in a
    // row and round 3 answered it with a 0.42-0.95 m ceiling on every block in
    // the building; the reference photographs say the ceiling is real but the
    // BAND is wrong — store_01's freezer-bag block is ~1.4 m of one SKU and
    // store_00's soup wall is wider than that. The heavy tail lives in
    // planFor's slot width; here the block simply fills the slot it was given.
    const brandA0 = sA;
    const brandMax = sB - sA;
    for (let v = 0; v < varieties && a < sB - w * 0.6 && a - brandA0 < brandMax; v++) {
      // A GAP INSIDE THE BLOCK. Round 19 spent this roll BETWEEN brand blocks,
      // where it only ever widened a seam that already existed. Inside a slot
      // it is the hole in the middle of the soup wall.
      if (v > 0 && rng() < 0.085 * BS.hole) {
        if (tag && rng() < 0.5) tag(a + 0.01, rr(rng, 0.055, 0.095), 'orphan');
        a += rr(rng, 0.06, 0.30);
        if (a >= sB - w * 0.6) break;
      }
      // flavour shift — hue walks, saturation and lightness stay in family.
      // ROUND 20 — was rr(14, 62) * v, i.e. up to 186 degrees by the fourth
      // variety, which is not a flavour flash, it is a different brand. The
      // big colour step now happens at the SLOT boundary where a real one does.
      const hueShift = v === 0 ? 0 : rr(rng, 7, 27) * (rng() < 0.5 ? -1 : 1) * Math.min(2, v);
      const hh = (baseHsl[0] + hueShift + 360) % 360;
      // LIGHT DIRECTION. A shelf under a live lamp is visibly hotter than the
      // same shelf under the dead one two units down the strip; round 3 lit
      // every facing on a run identically, which is a large part of why the
      // whole frame sat in one narrow value band.
      // ROUND 5 — EXPOSURE. This constant was 0.70, which put every facing at
      // 50-90% before a light touched it; combined with an all-warm rig the
      // measured mean VALUE of a render was 0.44-0.45 against 0.49-0.66 for the
      // reference photographs. A supermarket is not a dim room. 0.82 with the
      // lightness range opened at the top is what a facing under a live 4 ft
      // lamp actually returns, and the print does not sink because the mask's
      // brightness channel still carries the ink.
      const shade = lit * (litAt ? litAt(a) : 1) * 0.82 * rr(rng, 0.90, 1.10);
      const vSat = Math.min(1, baseHsl[1] / 100 * rr(rng, 1.42, 1.75) * BS.chroma);
      const vLit = Math.min(0.97, baseHsl[2] / 100 * rr(rng, 0.86, 1.38));
      // Set per INSTANCE below, not once per variety: eight identical facings
      // in a row at one exact colour is a flat field with no internal edges,
      // and a photographed shelf has none of those. Cartons that came off the
      // same press still catch the light differently once a customer has
      // handled them.
      // ROUND 7 — CAVITY DEPTH. "No ambient occlusion in the shelf cavities:
      // the deck is lit uniformly to the back panel." The AO cards in store.js
      // are a vertical gradient across the cavity MOUTH and a horizontal one on
      // the deck SURFACE; neither knows how far into the hole a given facing is
      // standing. So a unit shoved 200 mm back — and about one facing in nine
      // is, deliberately — came out exactly as bright as the one faced to the
      // lip beside it, throwing away the strongest depth cue a shelf has.
      // A cavity is lit through its own mouth and the illumination falls off
      // with the solid angle of that opening, so 200 mm back is most of a stop.
      let toneDepth = 0;
      const tone = () => {
        col.setHSL(hh / 360, vSat * rr(rng, 0.90, 1.08),
          Math.min(0.96, vLit * rr(rng, 0.82, 1.22)));
        col.multiplyScalar(shade * rr(rng, 0.88, 1.10)
          * (1.0 - 1.55 * Math.min(0.34, Math.max(0, toneDepth))));
      };
      tone();

      // ROUND 20 — the run length is a property of the SLOT, so a wide block is
      // wide because it is deeply faced, not because it cycles varieties faster.
      // `run` still bounds it: a case of soda is never eight wide.
      let n = Math.max(kind.run[0], Math.min(kind.run[1] + 2, slot.runLen + ri(rng, -1, 1)));
      if (a + n * w > sB) n = Math.max(1, Math.floor((sB - a) / w));
      if (n < 1) break;

      const blockStart = a;

      // Cans, jars and small boxes get stacked until they nearly reach the
      // shelf above — that is what a stock clerk actually does, and it is what
      // keeps a cavity from reading as a half-empty display case.
      const stackable = STACKABLE.has(kind);
      let stack = 1;
      if (stackable) {
        const nFit = Math.floor((headroom - 0.015) / h);
        // a stock clerk stacks two, sometimes three. Never six.
      if (nFit >= 2 && rng() < 0.90 * BS.stack) stack = Math.min(nFit, rng() < 0.30 ? 3 : 2);
      }

      // ---- ROUND-3 PER-INSTANCE VARIATION ---------------------------------
      // Round 2 varied things BETWEEN SKUs but every unit inside one facing
      // block was the same prism at the same lean, packed flush with zero gap,
      // differing only in colour. The blind critic called the chip aisle off
      // exactly that. Every unit now gets its own yaw, depth, scale and gap,
      // and 2-3 units per block are deliberately WRONG — face-turned, crushed,
      // leaning, shoved deep, or simply missing.
      const soft = kind.t === 'bag';
      const pWrong = Math.min(0.62, (2.6 / Math.max(2, n)) * BS.wrong);
      // The "lying flat on top of the row" leftover has to sit on a unit that
      // actually EXISTS. Round 3 added missing facings and shoved-back facings,
      // and without this the leftover ended up hovering in mid-air over the
      // hole it was supposed to be resting on.
      // `lastTopNom` is `lastTop` computed from the height this facing would
      // have had WITHOUT round 24's `rise`. It exists for one reason and it is
      // the whole reason the two arms are comparable: the leftover-on-top test
      // below ends in `&& rng() < 0.17`, which short-circuits, so a gate that
      // moved with `rise` would have changed HOW MANY DRAWS the fill loop makes
      // and `?flatyaw` would have been a different store rather than this one
      // standing up straight. The gate reads the nominal top; the placement
      // reads the real one.
      let lastA = null, lastTop = 0, lastTopNom = 0, lastSet = 0;
      // ---- ROUND 23 — THE COMB ----------------------------------------------
      // The r22 critic's cue is "constant-width black voids between co-planar
      // billboards", and the void between two facings is the near one's SIDE
      // FACE, whose projected width is
      //
      //     f * ( X * delta + gap * D ) / ( D * ( D + delta ) )
      //
      // for a facing at lateral offset X. Every offset-dependent term is carried
      // by `delta`, the depth difference between a facing and the one beside it,
      // and this file shipped a median `delta` of 2.6 mm with 71.8% of adjacent
      // pairs inside 5 mm (10,456 pairs, 1,859 deck rows, off the instance
      // matrices). At that stagger the constant `gap * D` term is the whole band
      // — which is exactly what "constant width" means — and the band renders at
      // 3-24% of the neighbouring front face's luminance, which is what makes it
      // read as a void rather than as a face.
      //
      // The comb alternates the sign of a per-facing step along the run, so
      // `delta` between neighbours is about twice the amplitude while the MEAN
      // over the block is zero. That last clause is the whole reason it is a comb
      // and not a wider wander: the block's mean depth is what round 20's lip
      // line and the occupancy field are built on, and a change that moved it
      // would be scored on top of that round's work.
      //
      // NO RNG DRAW. Every term below is a hash of (plan seed, slot, deck,
      // facing index), so `?flatface` is not merely the same build with a dial —
      // it is the SAME INSTANCES, facing for facing, with three expressions
      // different. Drawing this off `rng` would have re-rolled every facing
      // after it on the face and made the control a different store.
      // Amplitude by bay state, capped. A just-fronted bay steps 21 mm and a
      // Saturday bay 55 — which is a third of a carton's depth, and about what
      // reference/store_00_Drinks shows between two Cap'n Crunch facings at crop
      // (1320,830)-(1920,1010). It is capped because a comb bigger than the
      // package is a sawtooth, not a shelf.
      const cAmp = FACET.on ? Math.min(0.055, 0.014 + 0.026 * BS.depth) : 0;
      let cPrev = 0;
      // ---- ROUND 24 — WHICH UNITS TAKE WHICH TERM ---------------------------
      // `lean` and `seat` are exact only for the unit-cube geometries and only
      // mean anything on something with a vertical edge, so cans and bottles do
      // not take them; `rise` is withheld from `carton/wrap`, whose aspect
      // already sits at 0.284 against a band floor of 0.28 and whose height is
      // set by the cans inside it. Both rules are stated in orient.js and are
      // properties of the PACKAGE, not of the measurement.
      const canLean = kind.t === 'box' || kind.t === 'bag';
      const canRise = kind.t === 'box' && !kind.shape;
      const axisGain = isZ ? 1 : 0.35;
      for (let k = 0; k < n && a < sB - w * 0.55 && a - brandA0 < brandMax; k++) {
        const jitter = rr(rng, -0.006, 0.006);
        const ck = plan.seed + slot.i * 7919 + (v + 1) * 104729 + k * 15485863;
        const cStep = comb(mix2(ck, deckKeyOf(deckY) * 3 + 83),
          mix2(ck, deckKeyOf(deckY) * 3 + 97), cPrev, cAmp);
        cPrev = cStep;
        // THE HAND. Six hash uniforms off (plan seed, slot, variety, facing,
        // deck) — no rng draw, so `?flatyaw` is this store with three
        // expressions zeroed and not a different one. Same discipline the comb
        // above is written to, and the reason a control is worth having.
        const dk = deckKeyOf(deckY) * 3;
        const oh = hand([mix2(ck, dk + 191), mix2(ck, dk + 197), mix2(ck, dk + 199),
          mix2(ck, dk + 211), mix2(ck, dk + 223), mix2(ck, dk + 227)],
        { gain: BS.skew, axis: axisGain, lean: canLean, rise: canRise });
        // per-item depth wander off the SKU's own setback. ROUND 9 — widened
        // from -6/+28 mm to -8/+52, and one facing in eleven gets shoved a
        // further 40-90 back on its own. Two facings of the same SKU are never
        // at the same depth; a shopper takes the front one and the row behind
        // it stays where it is.
        let itemSet = Math.max(-0.075, skuSetback + rr(rng, -0.008, 0.052) * BS.depth
          + (rng() < 0.09 ? rr(rng, 0.040, 0.090) * BS.depth : 0));
        // The comb rides on top, clamped into the same envelope the line above
        // already uses: never past the deck's own remaining depth, never more
        // than 75 mm proud of the row. Clamping it here rather than inside
        // comb() keeps the amplitude a property of the bay and the envelope a
        // property of the deck, which are two different facts.
        //
        // AND THE CLAMP IS LEDGERED, because the first version of this shipped a
        // comb the artefact did not carry. `maxSet` is
        // `depth - min(depth*0.94, 0.21) - 0.02`, which on a 0.24 m deck is
        // 0.001 — so `Math.min(maxSet, ...)` was not trimming the comb's tail,
        // it was flattening every facing on those decks onto one plane, comb and
        // all. A clamp that fires on everything is not a guard, it is a redesign
        // wearing one, and the only way to tell them apart is the distribution of
        // what it caught. Same argument as CLAMP_LOG, same shape of ledger.
        //
        // The backward limit is THIS SKU's own depth and never less than where
        // the facing already stood, so cStep = 0 reproduces `preComb` exactly and
        // the dial is an identity rather than a second placement rule.
        const preComb = itemSet;
        const backLimit = Math.max(preComb, depth - pd - 0.010);
        itemSet = Math.max(-0.075, Math.min(backLimit, preComb + cStep));
        COMB_LOG.n++;
        COMB_LOG.absSum += Math.abs(cStep);
        COMB_LOG.deltaSum += Math.abs(itemSet - preComb);
        if (Math.abs(itemSet - preComb) > 1e-9) COMB_LOG.applied++;
        if (itemSet + 1e-9 < preComb + cStep) COMB_LOG.clampBack++;
        if (itemSet - 1e-9 > preComb + cStep) COMB_LOG.clampFwd++;
        if (Math.abs(cStep) > COMB_LOG.maxAbs) COMB_LOG.maxAbs = Math.abs(cStep);
        // ---- THE SURVIVOR AT THE RAIL -----------------------------------
        // A row that has been shopped through is 100-240 mm back, and the ONE
        // facing somebody pulled forward and did not take is still at the lip.
        // That silhouette — a package standing alone in front of a dark hole
        // its own row left — is the single most legible thing on a shopped
        // shelf, and this file has produced its opposite for six rounds: the
        // shopped row moved back TOGETHER.
        if ((shopped || cond.deep) && k === 0 && rng() < 0.70) itemSet = rr(rng, -0.042, 0.004);
        // BASELINE yaw is now +-4 degrees on every single unit, not on one in
        // five. Nothing on a real shelf is square to the rail.
        // ROUND 24 — `oh.turn` on top: core +-3.2 degrees, one unit in four at
        // 6.9-17.2. This is the term the r23 critic's acceptance test is about,
        // because sz*|sin turn| is a side face whose width does not depend on
        // where in the frame the unit sits.
        let skew = rr(rng, -0.070, 0.070) * BS.skew + oh.turn;
        if (rng() < 0.22 * BS.wrong) skew += rr(rng, 0.06, 0.24) * BS.skew * (rng() < 0.5 ? -1 : 1);
        // one in twenty is shelved backwards — 180 degrees shows the plain
        // wrap column, which is exactly what a reversed package looks like
        let extraYaw = rng() < 0.045 * BS.wrong ? Math.PI : 0;
        // per-instance scale: 3-5% either way, and bags get more
        // ROUND 24 — `oh.rise` multiplies the height. rr(0.965, 1.035) is 1.5%
        // of a 250 mm carton and the reference's adjacent facings step 4-22% of
        // their own height, because a brand block is not one SKU. It only ever
        // SHORTENS, so nothing here can reach the deck above.
        let sx = w * rr(rng, soft ? 0.93 : 0.955, soft ? 1.035 : 1.005);
        let sy = h * rr(rng, 0.965, 1.035) * oh.rise;
        // ...and the same height WITHOUT `rise`, carried alongside because the
        // wrong-states below REASSIGN sy and dividing the rise back out of a
        // reassigned value is not the nominal. See lastTopNom.
        let syNom = sy / oh.rise;
        // ROUND 24 — `oh.lean`. On a Z-axis run this is the in-image lean of the
        // carton's vertical edges, which the census put at an IQR of 1.23
        // degrees across the whole front rank: every carton in the building
        // plumb to within half a degree of every other one. extentAlong's row 0
        // has no roll in it, so on those runs this costs the lip line nothing.
        let roll = (soft ? rr(rng, -0.075, 0.075) : rr(rng, -0.018, 0.018)) + oh.lean;
        let draw = true;
        let lift = 0;

        if (rng() < pWrong) {
          // A BAG has no side panel — the pillow silhouette turned 90 degrees
          // is a fat hexagonal prism showing the plain wrap column stretched
          // flat, which looks like a modelling error rather than like a
          // customer having put something back sideways. Bags slump instead.
          // ROUND 20 — case 6 is over-weighted on purpose. Five of the six
          // original states move a unit BACKWARD or leave it in plane; only
          // face-turning moved anything toward the aisle, and `place` then
          // charged it for the rotation. A uniform draw over the states is
          // therefore a distribution that is one-sided against the lip, which
          // is the frame-level defect restated one facing at a time.
          const wrong = soft ? pick(rng, [1, 2, 3, 4, 6, 1, 2, 6, 6])
            : pick(rng, [0, 1, 2, 3, 4, 5, 6, 6, 6, 0]);
          switch (wrong) {
            case 0:                        // face-turned: side panel to the aisle
              extraYaw += Math.PI / 2 * (rng() < 0.5 ? -1 : 1);
              // ROUND 20 — `place` pays for the rotated footprint in clearance,
              // which was correct for keeping the corner off the price rail and
              // is exactly what made a turned box END AT THE LIP like every
              // other one. A box somebody put back sideways sticks its corner
              // out; that corner is a diagonal across the lip line and it is
              // the cheapest out-of-plane silhouette on the shelf.
              itemSet -= rr(rng, 0.010, 0.045);
              break;
            case 1:                        // crushed
              sy = h * rr(rng, 0.78, 0.90);
              syNom = sy;
              roll = rr(rng, 0.07, 0.17) * (rng() < 0.5 ? -1 : 1);
              sx = w * rr(rng, 1.0, 1.09);
              break;
            case 2:                        // leaning hard against its neighbour
              roll = rr(rng, 0.13, 0.30) * (rng() < 0.5 ? -1 : 1);
              lift = -sy * 0.02;
              break;
            case 3:                        // shoved to the back of the deck
              itemSet = Math.min(maxSet, itemSet + rr(rng, 0.05, 0.15));
              break;
            case 4:                        // a single-facing hole in the row
              draw = false;
              break;
            case 6:
              // ROUND 20 — PULLED PROUD. Somebody picked this one up, looked at
              // it and put it down in front of its neighbours. It hangs over the
              // shelf edge, and `place`'s new floor lets it: -55 to -18 mm of
              // setback puts 20-40% of the package into the aisle volume.
              itemSet = rr(rng, -0.055, -0.018);
              skew += rr(rng, -0.09, 0.09);
              break;
            default:                       // knocked over, lying on its face
              roll = Math.PI / 2;
              sy = h; syNom = sy;
              // ROUND 24 — and it gives the hand's turn back. A unit lying on
              // its face was put there by gravity, not faced by a stocker, and
              // stacking a 17-degree turn on top of a 90-degree roll reads as a
              // clipping error rather than as a fallen box: the two RIVERTON
              // cases at near_a4 (330,400)-(500,545) were the tell.
              skew -= oh.turn;
              // ROUND 24 — this WAS `lift = -h * 0.5 + sx * 0.5`, which is
              // `seat` restricted to a Z run: on an X run a box tipped onto its
              // face pivots over its DEPTH and not over its width, so the old
              // expression floated or sank it by (sx - sz)/2. `seat` covers
              // both, seatSelfTest proves the two agree exactly at roll = pi/2
              // on a Z run, and with the dial off the old line is what runs.
              lift = ORIENT.on ? 0 : (-h * 0.5 + sx * 0.5);
              break;
          }
        }
        const yaw = baseRy + skew + extraYaw;
        // stack height varies COLUMN TO COLUMN — a stocker never leaves an
        // even castellation, and an even one is instantly readable as a grid
        const colH = stack > 1 && rng() < 0.30 ? Math.max(1, stack - 1) : stack;

        // ROUND 7 — THE TAG RIBBON. "Shelf-edge rails are sparse and blank: real
        // gondolas carry an unbroken edge-to-edge ribbon of tags, one under
        // every facing." Round 3-6 emitted ONE tag per brand block, so a metre
        // of shelf carrying eight facings got two tags and 800 mm of empty
        // channel. The tag now goes under the facing it belongs to, including
        // under the ones that are missing — a hole in a row still has its tag
        // sitting there, which is precisely how you can tell it is a hole.
        if (tag) tag(a + 0.003, Math.max(0.045, w * 0.94), draw ? 'sku' : 'orphan');
        if (draw) {
          toneDepth = itemSet - deckSetback;
          tone();
          const dyHere = dy(a + w / 2);
          lastA = a + w / 2 + jitter; lastTop = dyHere + sy * colH; lastSet = itemSet;
          lastTopNom = dyHere + syNom * colH;
          for (let s = 0; s < colH; s++) {
            place(kind, cell, w, pd,
              a + w / 2 + jitter, dyHere + sy / 2 + lift + s * sy * 1.005,
              // upper units in a stack were pushed BACK only; a stack a shopper
              // has taken the top can off leans forward as often as back
              itemSet + (s ? rr(rng, -0.020, 0.014) : 0),
              yaw + (s ? rr(rng, -0.06, 0.06) : 0), roll,
              sx, sy, 0, ORIENT.on);
          }
        }
        // real facings do not butt flush: film goods leave air, board goods
        // leave a saw-tooth of one or two millimetres
        // A faced bay butts flush; a shopped one leaves ragged air between
        // facings, and that irregular pitch is most of what "evenly pitched"
        // was naming. Same line, times the bay's own number.
        a += w + (soft ? rr(rng, 0.002, 0.018) : rr(rng, -0.001, 0.006)) * BS.gap
          + (BS.gap > 1.5 ? rr(rng, 0.0, 0.022) * (BS.gap - 1.0) : 0);
      }

      // one item lying flat on top of the row — the classic restock leftover
      toneDepth = 0;
      if (lastA !== null && a - blockStart > w * 1.6
          && lastTopNom - dy(lastA) + w * 0.6 < headroom
          && blockStart - lastFlat > 1.6 && rng() < 0.17) {
        col.multiplyScalar(0.97);
        // half of them are laid ACROSS the front of the row and hang over the
        // edge — which is the pose this leftover actually takes in
        // reference/store_00's endcap, and the largest single object this file
        // can put into the aisle volume.
        place(kind, cell, w, pd, lastA, lastTop + w * 0.50,
          lastSet + rr(rng, 0.0, 0.02),
          baseRy + rr(rng, -0.22, 0.22), Math.PI / 2,
          w * 0.985, h, rng() < 0.5 ? 0.45 : 0);
        lastFlat = blockStart;
      }

      a += rr(rng, 0.0, 0.012);
    }
    // the seam at a slot boundary. It is the one place on the deck where the
    // artwork, the hue, the silhouette family and the tidiness all change at
    // once — which is what a photographed shelf's block edges look like — so it
    // gets a real gap rather than the 4-28 mm nothing round 19 left here.
    a += rr(rng, 0.010, 0.038);
  }
  drawFold(dkey, dn);
}
