// OWNER: builder-store. THE CELL PLAN — what product is in atlas cell i.
//
// =========================================================================
// ROUND 17 — THE ATLAS WAS A 48-CELL PIPE AND ROUND 16 WROTE 82 MOTIFS INTO IT.
//
// Round 16 drew one motif per product, assigned one to each of 140 SKUs, and
// shipped a depictCheck() that passed at 100%. Measured off the live scene by
// its critic:
//
//     30 of 81 motifs reach a shelf.        51 never appear anywhere.
//     40 of 140 product nouns in the store. 31 of 58 brand names.
//     44,853 package instances drawing from 48 artworks.
//
// Three of the four motifs the round led with — peachHalf, spaghetti,
// toothpaste — were never drawn at all. depictCheck() could not see it because
// it asserted every SKU has a motif and every motif has a SKU, and never asked
// whether the SKU is ever BAKED. AGENTS_BRIEF's own words for this shape:
// "an assertion can guard the wrong STAGE of the pipeline".
//
// There were two separate faults and widening the atlas only fixes one.
//
//   1. THE PIPE. ATLAS was 6x4 + 4x2 + 4x2 + 4x2 = 48 cells, hard-coded.
//   2. THE DEAL. Every cell asked copyFor(rng, dept, form), which picks a
//      RANDOM row from the department's pool. With 74 carton SKUs and 24
//      carton cells, a random deal collides: even at 48 cells it would have
//      landed ~38 distinct products, not 48. Widening a pipe that draws with
//      replacement buys you sqrt of what you paid for.
//
// So this file replaces the random draw with a COVERAGE DEAL: cells are dealt
// the SKU whose motif has been baked fewest times so far, across all four
// atlases in bake order. That is a greedy set cover, it is deterministic, and
// it is what turns 120 cells into 81 of 81 motifs rather than ~60.
//
// WHY THIS IS A SEPARATE FILE. pack.js bakes the cells and products.js decides
// which cells a department's shelves may draw from. Both need to agree on what
// is in cell i, and before this round they agreed by a CONVENTION written down
// in three places — "cell i is department i%8" in store.js line 63, in
// products.js's poolFor(), and in pack.js's deptKeys[i % deptKeys.length].
// That is exactly the duplicated derivation CLAUDE.md forbids, and it had
// already gone wrong: FROZEN.idx is 8, so 8%8 = 0 and the FROZEN department
// was drawing bakery-vocabulary packages on every frozen-case shelf.
//
// One owner: this file. pack.js bakes what PLAN says; products.js pools what
// PLAN says. Neither computes a cell index from a department any more.
// =========================================================================

import { SKUS, skuFood } from './brands.js';
import { MOTIF } from './depict.js';

// --- the department order ---------------------------------------------------
// This is the ONE copy. products.js holds the department OBJECTS (colours,
// package kinds, signage) and asserts its own order against this list at module
// load — see planDeptCheck() below. A reorder in either file throws rather than
// silently re-pointing every cell pool in the store.
export const DEPT_ORDER = [
  'bakery', 'canned', 'pasta', 'snacks', 'soda', 'breakfast', 'paper', 'health',
  'frozen',
];

// WHICH PACKAGE FAMILIES EACH DEPARTMENT ACTUALLY SHELVES.
//
// Found by measuring the first r17 build rather than by reasoning about it, and
// it is the same bug one surface along from the one this round is fixing. The
// widened atlas baked 18 bottle cells and the census said only 10 of them ever
// reached a shelf — because the lane allocation gave every department two
// bottle cells and ONLY FOUR DEPARTMENTS STOCK A BOTTLE. `soySplash` and
// `sportBottle` were baked, verified by bakeCheck(), and still not in the store.
//
// BAKED IS NOT PLACED. That distinction is the whole lesson of round 16
// repeating itself at the next stage, and it is why shelfCheck() in store.js
// asserts against the scene graph and not against this table.
//
// The keys are products.js's own kind letters (box/bag/can/bottle map onto the
// carton/pouch/can/bottle atlases). products.js asserts this against the union
// of each department's `kinds` and `soft` lists at module load — see
// planDeptCheck() — so adding a bottle to the frozen case fires here rather
// than quietly starving eight cells.
export const DEPT_FAMILIES = {
  bakery:    ['box', 'bag', 'can'],
  canned:    ['box', 'bag', 'can'],
  pasta:     ['box', 'bag', 'can', 'bottle'],
  snacks:    ['box', 'bag', 'can'],
  soda:      ['box', 'can', 'bottle'],
  breakfast: ['box', 'bag', 'can'],
  paper:     ['box', 'bag', 'can', 'bottle'],
  health:    ['box', 'bag', 'can', 'bottle'],
  frozen:    ['box', 'bag', 'can'],
};
// atlas name -> products.js kind letter
export const ATLAS_KIND = { carton: 'box', pouch: 'bag', can: 'can', bottle: 'bottle' };
const shelves = (dept, atlas) => DEPT_FAMILIES[dept].includes(ATLAS_KIND[atlas]);

// Non-food departments, DERIVED rather than declared. Round 5 fixed "a carton
// of crackers on the cleaning shelf" with `(idx % 8) >= 6`, which was true only
// by the ordering of DEPTS — the same latent fault as the cell convention. A
// department is non-food here if no SKU in it is food.
export const NONFOOD = new Set(
  DEPT_ORDER.filter((d) => !SKUS.some((r) => r[1] === d && skuFood(r[0]))),
);

// --- atlas grid descriptors (pack.js bakes these, store.js reads them) ------
// ROUND 3 sized the CELLS (25-33% larger than round 2, because at 3x zoom on a
// package a metre from camera the round-2 cells ran out of texels below the
// wordmark). Those pixel sizes are untouched. What round 17 changes is the
// COUNT.
//
//   carton  6x4 =  24  ->  8x6 = 48
//   pouch   4x2 =   8  ->  6x5 = 30
//   can     4x2 =   8  ->  6x4 = 24
//   bottle  4x2 =   8  ->  6x3 = 18
//                  48        120
//
// The counts are not round numbers and they are not guesses: they are the
// smallest grid on each family for which the coverage deal below reaches 81 of
// 81 motifs. Dropping the pouch from 30 to 24 costs three motifs (meatStick,
// berries, fries); dropping the can from 24 to 18 costs six. Both were measured
// by running deal() at those sizes, which is a thing you can re-run — see
// tools/planaudit.mjs.
//
// WHAT IT COSTS, because a widening is not free:
//   texels  5.556 M -> 13.338 M   (x2.40)
//   RGBA8   22.2 MB -> 53.4 MB    (+31.1 MB, before mipmaps)
//   draw calls and triangles: IDENTICAL. One atlas per package family, one
//   draw call per batch, per-instance UV offset picks the cell — the whole
//   point of the design. Priced as a within-run texture swap in the r17 report.
//
// ROUND 18 — THE CELLS WERE PRICED AGAINST THEMSELVES, NOT AGAINST THE PIXELS
// THEY DELIVER, AND THE BILL WAS QUOTED WITHOUT ITS MIPMAPS.
//
// Two corrections to the block above, both from r17's critic and both
// re-measured here off the live textures by src/store/aniso.js:
//
//   * every atlas has `generateMipmaps: true` (maskTex, pack.js), so the RGBA8
//     figure above is 3/4 of the real one. atlasBytes() reads the flag off the
//     live texture rather than assuming: 67.8 MB for the four atlases and
//     132.1 MB for the whole store, against the 53.4 MB quoted.
//   * a facing does not get 340 px. aniso.js's facingPx() projects each
//     instance's own printed front — local (-0.5,0,0.5) to (+0.5,0,0.5)
//     through the instance matrix — and over the six published poses the
//     widest printed front any facing of each family ever gets is:
//
//         carton  p99  50.8   max  349.9   <- the max is the 1.2 m TOP-STOCK case
//         pouch   p99  26.7   max   92.3
//         can     p99  22.0   max   59.1
//         bottle  p99  30.3   max   67.6
//
//     A 340 px carton cell against a 50.8 px p99 facing is 6.7x linear, 45x
//     areal. Mip 0 and mip 1 of every package atlas are unreachable in play.
//
// So the cells are sized to what they deliver. The rule, applied identically to
// all four: cell width = next power of two at or above the family's p99.9
// delivered width, floored at 128 px so a wordmark still has room for its
// glyphs, and the aspect kept. The one exception is the carton, which keeps a
// wider cell because 1% of cartons are the 0.89-1.20 m top-stock cases that
// really do fill 200-350 px when the player walks past them.
//
//   carton  340x420 -> 192x240     pouch  320x320 -> 160x160
//   can     320x240 -> 192x144     bottle 256x340 -> 160x212
//
// which is 67.8 MB -> 21.8 MB of package atlas: ALL 120 CELLS now cost less
// than round 16 spent on 48 (its four atlases at the old cell sizes were
// 29.6 MB mipmapped). Sizing was free headroom and this round spends none of
// it — the round-package artwork below is the same cell count at a third of
// the texels.
export const ATLAS = {
  carton: { cols: 8, rows: 6, cw: 192, ch: 240, wrap: 0.150, form: 'C' },
  pouch:  { cols: 6, rows: 5, cw: 160, ch: 160, wrap: 0.135, form: 'P' },
  // ROUND 18 — `barrel` is new and it is the contract between the artwork in
  // pack.js and the UV unwrap in unitCellUV(). It says: the v range of a cell
  // that lands on the BODY of a round package. Everything above it is the lid
  // and the shoulder, everything below it is the base.
  //
  // It exists because it was not there, and the absence was the biggest single
  // defect in the store. THREE.LatheGeometry parameterises v by POINT INDEX,
  // i/(points-1), not by height or arc length. Measured off the live geometry:
  //
  //     shape   barrel height     v it carried    stretch
  //     rim     81.6% of the can   0.445..0.555   x7.4
  //     jar     59.5%              0.202..0.302   x6.0
  //     tub     79.5%              0.252..0.376   x6.4
  //     soda    50.0%              0.250..0.375   x4.0
  //
  // i.e. 88-90% of every can, jar, tub and bottle artwork in the store landed
  // on the rolled rims and the two end discs — near-horizontal annuli seen
  // edge-on — and the barrel showed an 11% slice of the cell blown up six or
  // seven times VERTICALLY. That is why no cylinder carried a readable
  // wordmark (it was on the base disc), why none carried a rim or a lid (they
  // carried the legal block and the barcode), and why the class read as
  // vertical smear: a 6.4x vertical stretch divides |dL/dy| by 6.4 and leaves
  // |dL/dx| alone, which is the anisotropy sign inversion, arrived at
  // mechanically.
  // ROUND 20 — [0.085, 0.870] WAS ASYMMETRIC AND STARVED THE BOTTOM ROLLED RIM.
  // Bottom margin 0.085 against a top margin of 0.130: the top band got 1.53x
  // the rows for the same feature, and CAN_PROFILES.rim is geometrically
  // symmetric (constant radius 0.462 from y -0.408 to +0.408, so the barrel is
  // 81.6% of the can and the geometric band is [0.092, 0.908]).
  //
  // THE GEOMETRIC BAND IS NOT THE RIGHT ONE, AND THAT IS THE INTERESTING PART.
  // Pricing the two rolled-rim walls (segments 2->3 and 6->7) through
  // latheBands()'s own weight sharing at ch 144, RADIAL_W 0.10, floor 3 texels:
  //
  //     [0.085, 0.870]  bottom 2.85 FAIL   top 3.96 ok    endRatio 1.53
  //     [0.092, 0.908]  bottom 3.09 ok     top 2.80 FAIL  endRatio 1.00
  //     [0.107, 0.893]  bottom 3.59 ok     top 3.26 ok    endRatio 1.00
  //
  // The geometric band trades one failing rim for the other. The profile is
  // symmetric in HEIGHT but not in WEIGHT: it closes to r=0 at y=+0.485 rather
  // than +0.50, so segment 8->9 carries 0.015 of extra y travel, the top end
  // zone has more total weight to share, and the top rim's slice is diluted.
  // [0.107, 0.893] equalises the two ends and clears the floor at both while
  // leaving the barrel's share of the cell where it already was — 0.786 against
  // the shipped 0.785, stretch 1.038 against 1.039. It costs the label nothing.
  can:    { cols: 6, rows: 4, cw: 192, ch: 144, wrap: 0, form: 'N', barrel: [0.107, 0.893] },
  bottle: { cols: 6, rows: 3, cw: 160, ch: 212, wrap: 0, form: 'B', barrel: [0.090, 0.660] },
};
// Bake order. The deal is greedy and stateful across atlases: a motif baked on
// a carton is not needed again on a pouch, which is how 120 cells cover 81
// motifs AND still leave 39 cells to spend on the products a shopper sees most.
export const ATLAS_ORDER = ['carton', 'pouch', 'can', 'bottle'];

// Every department gets at least this many cells in every family, whether or
// not it has a product in that form. A department with two carton cells reads
// as two designs repeated down an aisle, which is the defect this round is
// fixing; the floor is here so the deal cannot starve a lane to zero while
// chasing coverage, not because 2 is enough.
const MIN_PER_DEPT = 2;

// --- pools ------------------------------------------------------------------
const BY_DF = new Map();      // deptKey + form -> rows
const BY_F = new Map();       // form -> rows
for (const r of SKUS) {
  for (const f of r[3]) {
    (BY_DF.get(r[1] + f) || BY_DF.set(r[1] + f, []).get(r[1] + f)).push(r);
    (BY_F.get(f) || BY_F.set(f, []).get(f)).push(r);
  }
}
// The soft-fallback ladder is brands.js's and is repeated here for the same
// stated reason it gives: a department with no product in a form borrows from
// the whole store, because a real endcap carries stock from other aisles and
// that is a far smaller error than a can of bread. bakery has no bottle and
// frozen has no bottle.
const poolOf = (dept, form) => BY_DF.get(dept + form) || BY_F.get(form) || SKUS;
const hasOwn = (dept, form) => BY_DF.has(dept + form);

// --- lane allocation --------------------------------------------------------
// Which department each cell belongs to. Need-driven: after every department
// has its floor, the next cell goes to whichever department still has the most
// motifs nobody has baked yet. A department with no SKU in this form has need
// 0 — it keeps its floor and no more, so the soda aisle does not end up with
// fourteen store-wide fallback pouches on it, which is what a naive need
// calculation produced on the first run of this.
function lanesFor(atlas, form, n, baked) {
  // ONLY departments that shelve this family get a lane. A cell dealt to a
  // department that never places one is a cell the player cannot see, however
  // correctly it is baked.
  const eligible = DEPT_ORDER.map((d, i) => (shelves(d, atlas) ? i : -1)).filter((i) => i >= 0);
  const L = DEPT_ORDER.length;
  const cnt = DEPT_ORDER.map((d) => (shelves(d, atlas) ? MIN_PER_DEPT : 0));
  const need = DEPT_ORDER.map((d) => (shelves(d, atlas) && hasOwn(d, form)
    ? Math.max(0, new Set(poolOf(d, form).map((r) => MOTIF[r[0]])
      .filter((m) => m && !baked.has(m))).size - MIN_PER_DEPT)
    : 0));
  let rem = n - MIN_PER_DEPT * eligible.length;
  let rr2 = 0;
  while (rem-- > 0) {
    let bi = -1;
    for (let i = 0; i < L; i++) if (need[i] > 0 && (bi < 0 || need[i] > need[bi])) bi = i;
    // Once every department's motifs are spoken for, spare cells go round-robin
    // rather than piling onto lane 0. Leftovers are not waste — a second cell
    // for a product is a second BRAND, a second layout archetype and a second
    // copy draw, which is the variety half of the round.
    if (bi < 0) { bi = eligible[rr2 % eligible.length]; rr2++; } else need[bi]--;
    cnt[bi]++;
  }
  // Interleave, so neighbouring cells in the atlas are different departments.
  // Nothing reads the atlas spatially; this is so a facing sheet is legible.
  const lane = [];
  const q = cnt.map((c, i) => ({ i, c }));
  while (lane.length < n) {
    let moved = false;
    for (const e of q) {
      if (e.c > 0) { lane.push(e.i); e.c--; moved = true; if (lane.length >= n) break; }
    }
    if (!moved) break;
  }
  return lane;
}

// --- the deal ---------------------------------------------------------------
// Greedy set cover over motifs. Deterministic: no rng anywhere in this file.
function deal() {
  const baked = new Set();
  const mCount = new Map();
  const sCount = new Map();
  const out = {};
  for (const atlas of ATLAS_ORDER) {
    const A = ATLAS[atlas];
    const n = A.cols * A.rows;
    const lane = lanesFor(atlas, A.form, n, baked);
    out[atlas] = [];
    for (let i = 0; i < n; i++) {
      const dept = DEPT_ORDER[lane[i]];
      const pool = poolOf(dept, A.form);
      let best = null, bm = 0, bs = 0;
      for (const r of pool) {
        const mo = MOTIF[r[0]] || '';
        const m = mCount.get(mo) || 0, s = sCount.get(r[0]) || 0;
        if (!best || m < bm || (m === bm && s < bs)) { best = r; bm = m; bs = s; }
      }
      const mo = MOTIF[best[0]] || '';
      mCount.set(mo, bm + 1);
      sCount.set(best[0], (sCount.get(best[0]) || 0) + 1);
      baked.add(mo);
      out[atlas].push({ i, dept, row: best, desc: best[0], motif: mo, own: hasOwn(dept, A.form) });
    }
  }
  return out;
}

export const PLAN = deal();

// Cells of `atlas` that belong to department `deptKey`. products.js's pools are
// built from this and from nothing else — there is no longer any arithmetic
// anywhere that turns a department index into a cell index.
export function cellsOfDept(atlas, deptKey) {
  return PLAN[atlas].filter((c) => c.dept === deptKey).map((c) => c.i);
}
// Cells belonging to any department on the same side of the food line. Round
// 5's finding, kept: a non-food department's strays come from the other
// non-food cells only, or you get a carton of crackers with a warm serving
// suggestion on the cleaning shelf.
export function cellsOfSide(atlas, deptKey) {
  const nf = NONFOOD.has(deptKey);
  return PLAN[atlas].filter((c) => NONFOOD.has(c.dept) === nf).map((c) => c.i);
}

// --- what the plan promises -------------------------------------------------
// NOTE THE STAGE. This is a check on the PLAN, which is the table — the exact
// stage round 16's depictCheck() was stuck at. It is here because it is cheap
// and because a plan that cannot cover is worth catching early, but it is NOT
// the round's assertion. pack.js's bakeCheck() reads CELL_LOG, i.e. what was
// actually drawn, and that is the one that has to hold.
export function planStats() {
  const motifs = new Set(), descs = new Set();
  let cells = 0, fallback = 0;
  for (const a of ATLAS_ORDER) {
    for (const c of PLAN[a]) { cells++; motifs.add(c.motif); descs.add(c.desc); if (!c.own) fallback++; }
  }
  const want = new Set(SKUS.map((r) => MOTIF[r[0]]).filter(Boolean));
  return {
    cells,
    motifs: motifs.size,
    motifsPossible: want.size,
    descs: descs.size,
    descsPossible: SKUS.length,
    fallbackCells: fallback,
    missing: [...want].filter((m) => !motifs.has(m)),
    perAtlas: ATLAS_ORDER.map((a) => a + ':' + PLAN[a].length).join(' '),
  };
}

// products.js calls this with its own department list. Two copies of an
// ordering, one assertion that fires when they disagree — the lungCheck()
// pattern CLAUDE.md points at.
export function planDeptCheck(keysInOrder) {
  const bad = [];
  if (keysInOrder.length !== DEPT_ORDER.length) {
    bad.push('department count ' + keysInOrder.length + ' != plan ' + DEPT_ORDER.length);
  }
  for (let i = 0; i < Math.max(keysInOrder.length, DEPT_ORDER.length); i++) {
    if (keysInOrder[i] !== DEPT_ORDER[i]) {
      bad.push('department ' + i + ': products.js "' + keysInOrder[i]
        + '" != plan.js "' + DEPT_ORDER[i] + '"');
    }
  }
  for (const a of ATLAS_ORDER) {
    for (const d of DEPT_ORDER) {
      const has = cellsOfDept(a, d).length > 0;
      if (shelves(d, a) && !has) bad.push('department ' + d + ' shelves ' + a + ' and has no cell');
      if (!shelves(d, a) && has) bad.push('department ' + d + ' has a ' + a + ' cell it can never place');
    }
  }
  return bad;
}

// The second half of the department assertion: products.js knows which package
// kinds each department actually puts on a shelf, and DEPT_FAMILIES above is a
// copy of that. Two copies, one assertion — CLAUDE.md's lungCheck() pattern.
export function planFamilyCheck(actual) {
  const bad = [];
  for (const d of DEPT_ORDER) {
    const want = [...(DEPT_FAMILIES[d] || [])].sort().join(',');
    const got = [...new Set(actual[d] || [])].sort().join(',');
    if (want !== got) bad.push('department ' + d + ' shelves [' + got + '], plan.js says [' + want + ']');
  }
  return bad;
}
