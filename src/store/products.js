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

import { rr, ri, pick } from './kit.js';

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
const K = {
  cerealBox: { t: 'box', w: [0.17, 0.23], h: [0.28, 0.35], d: 0.72, run: [2, 4] },
  midBox:    { t: 'box', w: [0.10, 0.16], h: [0.17, 0.24], d: 0.80, run: [2, 5] },
  smallBox:  { t: 'box', w: [0.06, 0.10], h: [0.11, 0.17], d: 0.85, run: [3, 6] },
  wideBox:   { t: 'box', w: [0.24, 0.34], h: [0.14, 0.20], d: 0.80, run: [1, 3] },
  tallBox:   { t: 'box', w: [0.09, 0.13], h: [0.26, 0.33], d: 0.82, run: [2, 5] },
  tinyBox:   { t: 'box', w: [0.045, 0.075], h: [0.075, 0.12], d: 0.9, run: [4, 8] },
  can:       { t: 'can', w: [0.068, 0.086], h: [0.10, 0.13], d: 1.0, run: [3, 7] },
  bigCan:    { t: 'can', w: [0.098, 0.115], h: [0.15, 0.19], d: 1.0, run: [2, 5] },
  jar:       { t: 'can', w: [0.075, 0.098], h: [0.14, 0.19], d: 1.0, run: [2, 5] },
  tallJar:   { t: 'can', w: [0.082, 0.105], h: [0.20, 0.27], d: 1.0, run: [2, 4] },
  bottle:    { t: 'bottle', shape: 'spray', w: [0.070, 0.090], h: [0.24, 0.32], d: 1.0, run: [3, 6] },
  jug:       { t: 'bottle', shape: 'jug',   w: [0.115, 0.150], h: [0.26, 0.34], d: 1.0, run: [2, 4] },
  sodaBtl:   { t: 'bottle', shape: 'soda',  w: [0.078, 0.095], h: [0.28, 0.34], d: 1.0, run: [3, 7] },
  squat:     { t: 'bottle', shape: 'squat', w: [0.088, 0.110], h: [0.15, 0.20], d: 1.0, run: [2, 5] },
  bag:       { t: 'bag', w: [0.19, 0.30], h: [0.24, 0.33], d: 0.55, run: [1, 3] },
  smallBag:  { t: 'bag', w: [0.11, 0.18], h: [0.15, 0.23], d: 0.60, run: [2, 4] },
  pouch:     { t: 'bag', w: [0.085, 0.130], h: [0.13, 0.19], d: 0.45, run: [3, 6] },
  case12:    { t: 'box', w: [0.30, 0.42], h: [0.13, 0.17], d: 0.85, run: [1, 3] },
};

// Every department gets at least one non-box kind in `mustSoft` so no deck is
// ever an unbroken wall of cuboids.
export const DEPTS = [
  {
    name: 'bakery', key: 'bakery', blade: 'BREAD / BAKING',
    sign: ['BREAD', 'BAKING NEEDS', 'FLOUR / SUGAR', 'COOKIES'],
    kinds: [K.bag, K.midBox, K.smallBox, K.wideBox, K.tallBox, K.pouch, K.tallJar, K.smallBag],
    soft: [K.bag, K.pouch, K.tallJar, K.smallBag],
    colors: mix('cream', 'cream', 'red', 'yellow', 'brown', 'white'),
  },
  {
    name: 'canned', key: 'canned', blade: 'CANNED GOODS',
    sign: ['CANNED VEGETABLES', 'SOUPS / BROTH', 'CANNED FRUITS', 'PORK & BEANS'],
    kinds: [K.can, K.can, K.bigCan, K.jar, K.tallJar, K.midBox, K.pouch, K.smallBox],
    soft: [K.jar, K.tallJar, K.pouch],
    colors: mix('red', 'red', 'red', 'green', 'green', 'silver', 'yellow'),
  },
  {
    name: 'pasta', key: 'pasta', blade: 'PASTA / SAUCE',
    sign: ['SPAGHETTI / SAUCES', 'RICE & DRY BEANS', 'MEXICAN', 'ASIAN'],
    kinds: [K.jar, K.midBox, K.smallBox, K.tallBox, K.tallJar, K.bigCan, K.pouch, K.squat],
    soft: [K.jar, K.tallJar, K.pouch, K.squat],
    colors: mix('red', 'red', 'green', 'cream', 'yellow'),
  },
  {
    name: 'snacks', key: 'snacks', blade: 'SNACKS / CHIPS',
    sign: ['CHIPS & SNACKS', 'CANDIES', 'CRACKERS', 'NUTS'],
    kinds: [K.bag, K.bag, K.smallBag, K.wideBox, K.midBox, K.pouch, K.tinyBox, K.tallJar],
    soft: [K.bag, K.smallBag, K.pouch, K.tallJar],
    colors: mix('orange', 'orange', 'red', 'red', 'yellow', 'yellow', 'blue', 'green', 'purple'),
  },
  {
    name: 'soda', key: 'soda', blade: 'SODA / JUICE',
    sign: ['SOFT DRINKS', 'JUICES', 'BOTTLED WATER', 'SPORTS DRINKS'],
    kinds: [K.sodaBtl, K.case12, K.sodaBtl, K.bottle, K.jug, K.case12, K.squat, K.can],
    soft: [K.sodaBtl, K.bottle, K.jug, K.squat],
    colors: mix('red', 'red', 'blue', 'blue', 'green', 'orange', 'purple', 'silver', 'white'),
  },
  {
    name: 'breakfast', key: 'breakfast', blade: 'CEREAL / COFFEE',
    sign: ['CEREAL', 'COFFEE / TEA', 'BREAKFAST FOODS', 'SYRUP / JAM'],
    kinds: [K.cerealBox, K.cerealBox, K.midBox, K.jar, K.tallBox, K.smallBox, K.tallJar, K.pouch],
    soft: [K.jar, K.tallJar, K.pouch],
    colors: mix('yellow', 'yellow', 'red', 'red', 'blue', 'brown', 'orange'),
  },
  {
    name: 'paper', key: 'paper', blade: 'PAPER / CLEANING',
    sign: ['PAPER GOODS', 'LAUNDRY', 'CLEANING SUPPLIES', 'TRASH BAGS'],
    kinds: [K.jug, K.wideBox, K.bag, K.jug, K.midBox, K.cerealBox, K.squat, K.bottle],
    soft: [K.jug, K.bag, K.squat, K.bottle],
    colors: mix('blue', 'blue', 'blue', 'blue', 'white', 'white', 'teal', 'yellow', 'green'),
  },
  {
    name: 'health', key: 'health', blade: 'HEALTH / BEAUTY',
    sign: ['HEALTH & BEAUTY', 'BABY CARE', 'VITAMINS', 'PET SUPPLIES'],
    kinds: [K.smallBox, K.bottle, K.tinyBox, K.midBox, K.smallBag, K.jar, K.squat, K.pouch],
    soft: [K.bottle, K.jar, K.squat, K.pouch, K.smallBag],
    colors: mix('white', 'white', 'white', 'silver', 'purple', 'pink', 'teal', 'blue'),
  },
];

export const FROZEN = {
  name: 'frozen', key: 'frozen', blade: 'FROZEN', sign: ['FROZEN'],
  kinds: [K.wideBox, K.midBox, K.smallBag, K.bag, K.tallBox, K.pouch],
  soft: [K.smallBag, K.bag, K.pouch],
  colors: mix('white', 'blue', 'blue', 'blue', 'teal', 'silver', 'red', 'green'),
};

// Atlas-cell pools. Cell i of each atlas was drawn with department i%8's
// vocabulary, so a department takes its themed cells plus a few strays —
// real neighbouring SKUs are not all from one design family.
// ROUND 5. The strays used to be drawn from the WHOLE atlas, which put a
// carton of crackers — complete with its warm serving-suggestion photo — on the
// cleaning shelf four times out of eight. Cells 6 and 7 mod 8 are the non-food
// vocabularies (cleaning, health & beauty); a non-food department now takes its
// strays from the other non-food cells only. Food departments still borrow
// freely from each other, which is real: neighbouring SKUs on a grocery shelf
// genuinely are not all from one design family.
function poolFor(idx, total, strays) {
  const p = [];
  for (let k = idx % 8; k < total; k += 8) p.push(k);
  const nonFood = (idx % 8) >= 6;
  for (let k = 0; k < strays; k++) {
    let c = (idx * 5 + k * 7 + 3) % total;
    if (nonFood !== ((c % 8) >= 6)) c = (c - (c % 8)) + (nonFood ? 6 + (k % 2) : (c + 1) % 6);
    p.push(c % total);
  }
  return p;
}
[...DEPTS, FROZEN].forEach((d, i) => {
  d.idx = i;
  d.cells = {
    box: poolFor(i, 24, 5),
    bag: poolFor(i, 8, 2),
    can: poolFor(i, 8, 2),
    bottle: poolFor(i, 8, 2),
  };
});

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
  K.smallBox, K.wideBox, K.case12, K.pouch]);

function fits(kinds, headroom) {
  const ok = kinds.filter((k) => k.h[0] <= headroom - 0.02 && k.h[1] <= headroom + 0.06);
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
export function fillBackRow(B, rng, dept, opts) {
  const { axis, a0, a1, lip, face, deckY, headroom, depth, lit, col } = opts;
  const litAt = opts.litAt || null;
  const isZ = axis === 'z';
  const baseRy = isZ ? (face > 0 ? Math.PI / 2 : -Math.PI / 2) : (face > 0 ? 0 : Math.PI);
  let a = a0;
  let guard = 0;
  while (a < a1 - 0.05 && guard++ < 300) {
    if (rng() < 0.10) { a += rr(rng, 0.05, 0.26); continue; }
    const w = rr(rng, 0.07, 0.23);
    const h = Math.max(0.06, Math.min(headroom - 0.02, rr(rng, headroom * 0.5, headroom * 0.97)));
    const pd = Math.min(depth, rr(rng, 0.10, 0.19));
    const hsl = pick(rng, dept.colors);
    const cell = (rng() * 24) | 0;
    const n = ri(rng, 1, 4);
    for (let k = 0; k < n && a < a1 - w * 0.5; k++) {
      col.setHSL(hsl[0] / 360, Math.min(1, hsl[1] / 100 * rr(rng, 1.1, 1.45)),
        Math.min(0.92, hsl[2] / 100 * rr(rng, 0.80, 1.22)));
      col.multiplyScalar(lit * (litAt ? litAt(a + w / 2) : 1) * 0.82 * rr(rng, 0.90, 1.08));
      const back = pd / 2 + 0.008;
      const cx = isZ ? lip - face * back : a + w / 2;
      const cz = isZ ? a + w / 2 : lip - face * back;
      B.box.push(cx, deckY + h / 2, cz, 0, baseRy + rr(rng, -0.10, 0.10), 0,
        w * 0.98, h, pd, col, cell);
      a += w + rr(rng, 0, 0.007);
    }
    a += rr(rng, 0.002, 0.022);
  }
}

export function fillShelf(B, rng, dept, opts) {
  const {
    axis, a0, a1, lip, face, deckY, headroom, depth, lit, col,
    pull = 0.5, tag = null, vacancy = 1, litAt = null,
  } = opts;
  const isZ = axis === 'z';
  const baseRy = isZ ? (face > 0 ? Math.PI / 2 : -Math.PI / 2) : (face > 0 ? 0 : Math.PI);

  // Vertical gradient: the top deck is faced right up to the lip, the bottom
  // deck sits several inches back. That gradient alone changes how an aisle
  // reads far more than any single item does.
  const deckSetback = (1 - pull) * 0.024;

  // ---- ROUND-3 VACANCY PLAN ----------------------------------------------
  // Round-2 shelves were 100% full and perfectly faced, which no store on
  // earth is. Before anything is stocked, this deck reserves 0-2 BARE BAYS it
  // will simply skip: bare deck, dark cavity, and an orphaned tag holder left
  // on the rail underneath. Between them the fill loop still shops individual
  // facings out, so total voids land around 12-18% of the run.
  const bays = [];
  {
    const span = a1 - a0;
    const roll = rng() * (vacancy > 0 ? 1 / vacancy : 1e9);
    const n = roll < 0.055 ? 2 : (roll < 0.24 ? 1 : 0);
    for (let i = 0; i < n && span > 0.9; i++) {
      const bw = rr(rng, 0.30, Math.min(1.20, span * 0.26));
      const bs = a0 + 0.05 + rng() * Math.max(0.01, span - bw - 0.1);
      bays.push([bs, bs + bw]);
    }
    bays.sort((p, q) => p[0] - q[0]);
  }
  const bayAt = (p) => {
    for (const b of bays) if (p >= b[0] - 0.02 && p < b[1]) return b;
    return null;
  };

  // Cans and bottles have a ROUND cross-section: their depth is their width,
  // never the carton depth, or they lathe out into long elliptical tubes and
  // the whole aisle reads as boxes.
  const place = (kind, cell, w, pd, a, cy, setback, yaw, roll, sx, sy) => {
    const round = kind.t === 'can' || kind.t === 'bottle';
    const sz = round ? sx : pd;
    // A face-turned or hard-skewed carton presents a DIFFERENT footprint to the
    // lip. Without this it pokes straight through the shelf edge and through
    // the cavity AO plane, and the wrongness reads as a bug rather than as a
    // customer having put something back sideways.
    const dth = yaw - baseRy;
    const half = round ? sz / 2
      : (Math.abs(Math.cos(dth)) * sz + Math.abs(Math.sin(dth)) * sx) / 2;
    // ROUND 4. `roll` tips the item about its long axis, which swings the top
    // corner forward by up to half its height — unaccounted for, that is what
    // put facings THROUGH the price rail and through each other in the round-3
    // renders. Pay for the lean in clearance.
    const lean = Math.abs(Math.sin(roll)) * sy * 0.5;
    // ROUND 5. This was a flat 14 mm of clearance behind the lip on EVERY unit,
    // so a strip of bright deck showed in front of every single facing and the
    // run read as a display rather than as a shelf that has been faced. A stock
    // clerk faces product TO the lip; on a busy day it ends up slightly proud
    // of it. 2 mm minimum, and the rail stands 12 mm in front of the lip, so a
    // proud facing still clears it.
    const back = half + 0.002 + rr(rng, 0, 0.020) + lean + setback;
    const cx = isZ ? lip - face * back : a;
    const cz = isZ ? a : lip - face * back;
    if (kind.t === 'box' || kind.t === 'bag') {
      B[kind.t === 'bag' ? 'bag' : 'box'].push(cx, cy, cz, roll, yaw, 0, sx, sy, sz, col, cell);
    } else if (kind.t === 'can') {
      B.can.push(cx, cy, cz, roll, yaw, 0, sx, sy, sz, col, cell);
    } else {
      B.bottle.push(cx, cy, cz, roll, yaw, 0, sx, sy, sz, col, cell, kind.shape);
    }
  };

  let a = a0 + rr(rng, 0.01, 0.05);
  let guard = 0;
  let lastFlat = -99;

  while (a < a1 - 0.05 && guard++ < 320) {
    // a reserved bare bay: leave the deck showing and drop orphan tag holders
    // along the rail beneath it, which is exactly what a shopped-out facing
    // looks like from the aisle
    const bay = bayAt(a);
    if (bay) {
      if (tag) {
        for (let t = bay[0] + 0.02; t < bay[1] - 0.05; t += rr(rng, 0.11, 0.30)) {
          tag(t, rr(rng, 0.055, 0.10), 'orphan');
        }
      }
      a = bay[1] + rr(rng, 0.004, 0.02);
      continue;
    }
    // ---- pick a BRAND BLOCK -------------------------------------------------
    // Only consider kinds that actually FIT this deck. Clamping a 14in cereal
    // box down to an 8in canned-goods deck was flattening every SKU on the
    // shelf to the same height, which is the repetition the blind test saw.
    // Soft goods are forced in periodically so no deck is a wall of cuboids.
    const wantSoft = dept.soft && dept.soft.length && rng() < 0.42;
    const kind = pick(rng, fits(wantSoft ? dept.soft : dept.kinds, headroom));
    const cellPool = dept.cells[kind.t] || dept.cells.box;
    const cell = pick(rng, cellPool);
    const baseHsl = pick(rng, dept.colors);

    const w = rr(rng, kind.w[0], kind.w[1]);
    let h = rr(rng, kind.h[0], kind.h[1]);
    if (h > headroom - 0.03) h = Math.max(0.08, headroom - rr(rng, 0.03, 0.09));
    // Real cartons are 2-5in deep, not 19. Product is pulled forward and the
    // empty deck behind it goes dark under the cavity gradient — which is what
    // a shopped shelf actually looks like.
    const pd = Math.min(depth * 0.94, 0.21, w * 1.7, Math.max(0.07, kind.d * depth));

    // sold-out void — deeper shelves and lower decks get shopped harder
    if (rng() < 0.060 + (1 - pull) * 0.050) {
      if (tag && rng() < 0.5) tag(a + 0.01, rr(rng, 0.055, 0.095), 'orphan');
      a += rr(rng, 0.06, 0.34);
      continue;
    }

    // 1-4 flavour varieties of the SAME brand: identical artwork, different
    // flash colour. This is the dominant rhythm on a real shelf.
    const varieties = ri(rng, 1, 4);
    // ~1 SKU in 9 has been shopped through: the row is still there but it has
    // been pulled 100-220 mm back off the lip and sits in the dark. That
    // silhouette — a facing at the rail beside a facing sunk in shadow — is
    // most of what makes a real shelf read as trafficked.
    const shopped = rng() < 0.115;
    const maxSet = Math.max(0, depth - Math.min(depth * 0.94, 0.21) - 0.02);
    const skuSetback = shopped
      ? Math.min(maxSet, deckSetback + rr(rng, 0.10, 0.22))
      : deckSetback + rr(rng, 0.0, 0.016);

    // Cap the whole brand block. Four varieties x six facings of one design is
    // 24 identical faces in a row, which is the exact repetition round 2 was
    // called on — real planograms give a brand 60-90 cm of shelf, not three
    // metres of it.
    const brandA0 = a;
    const brandMax = rr(rng, 0.42, 0.95);
    for (let v = 0; v < varieties && a < a1 - w * 0.6 && a - brandA0 < brandMax; v++) {
      // flavour shift — hue walks, saturation and lightness stay in family
      const hueShift = v === 0 ? 0 : rr(rng, 14, 62) * (rng() < 0.5 ? -1 : 1) * v;
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
      const vSat = Math.min(1, baseHsl[1] / 100 * rr(rng, 1.42, 1.75));
      const vLit = Math.min(0.97, baseHsl[2] / 100 * rr(rng, 0.86, 1.38));
      // Set per INSTANCE below, not once per variety: eight identical facings
      // in a row at one exact colour is a flat field with no internal edges,
      // and a photographed shelf has none of those. Cartons that came off the
      // same press still catch the light differently once a customer has
      // handled them.
      const tone = () => {
        col.setHSL(hh / 360, vSat * rr(rng, 0.90, 1.08),
          Math.min(0.96, vLit * rr(rng, 0.82, 1.22)));
        col.multiplyScalar(shade * rr(rng, 0.88, 1.10));
      };
      tone();

      let n = ri(rng, kind.run[0], kind.run[1]);
      if (a + n * w > a1) n = Math.max(1, Math.floor((a1 - a) / w));
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
      if (nFit >= 2 && rng() < 0.90) stack = Math.min(nFit, rng() < 0.30 ? 3 : 2);
      }

      // ---- ROUND-3 PER-INSTANCE VARIATION ---------------------------------
      // Round 2 varied things BETWEEN SKUs but every unit inside one facing
      // block was the same prism at the same lean, packed flush with zero gap,
      // differing only in colour. The blind critic called the chip aisle off
      // exactly that. Every unit now gets its own yaw, depth, scale and gap,
      // and 2-3 units per block are deliberately WRONG — face-turned, crushed,
      // leaning, shoved deep, or simply missing.
      const soft = kind.t === 'bag';
      const pWrong = Math.min(0.34, 2.6 / Math.max(2, n));
      // The "lying flat on top of the row" leftover has to sit on a unit that
      // actually EXISTS. Round 3 added missing facings and shoved-back facings,
      // and without this the leftover ended up hovering in mid-air over the
      // hole it was supposed to be resting on.
      let lastA = null, lastTop = 0, lastSet = 0;
      for (let k = 0; k < n && a < a1 - w * 0.55 && a - brandA0 < brandMax; k++) {
        const jitter = rr(rng, -0.006, 0.006);
        // per-item depth wander: 0-40 mm off the SKU's own setback
        let itemSet = Math.max(0, skuSetback + rr(rng, -0.006, 0.028));
        // BASELINE yaw is now +-4 degrees on every single unit, not on one in
        // five. Nothing on a real shelf is square to the rail.
        let skew = rr(rng, -0.070, 0.070);
        if (rng() < 0.22) skew += rr(rng, 0.06, 0.24) * (rng() < 0.5 ? -1 : 1);
        // one in twenty is shelved backwards — 180 degrees shows the plain
        // wrap column, which is exactly what a reversed package looks like
        let extraYaw = rng() < 0.045 ? Math.PI : 0;
        // per-instance scale: 3-5% either way, and bags get more
        let sx = w * rr(rng, soft ? 0.93 : 0.955, soft ? 1.035 : 1.005);
        let sy = h * rr(rng, 0.965, 1.035);
        let roll = soft ? rr(rng, -0.075, 0.075) : rr(rng, -0.018, 0.018);
        let draw = true;
        let lift = 0;

        if (rng() < pWrong) {
          // A BAG has no side panel — the pillow silhouette turned 90 degrees
          // is a fat hexagonal prism showing the plain wrap column stretched
          // flat, which looks like a modelling error rather than like a
          // customer having put something back sideways. Bags slump instead.
          const wrong = soft ? pick(rng, [1, 2, 3, 4, 1, 2]) : ri(rng, 0, 5);
          switch (wrong) {
            case 0:                        // face-turned: side panel to the aisle
              extraYaw += Math.PI / 2 * (rng() < 0.5 ? -1 : 1);
              break;
            case 1:                        // crushed
              sy = h * rr(rng, 0.78, 0.90);
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
            default:                       // knocked over, lying on its face
              roll = Math.PI / 2;
              sy = h;
              lift = -h * 0.5 + sx * 0.5;
              break;
          }
        }
        const yaw = baseRy + skew + extraYaw;
        // stack height varies COLUMN TO COLUMN — a stocker never leaves an
        // even castellation, and an even one is instantly readable as a grid
        const colH = stack > 1 && rng() < 0.30 ? Math.max(1, stack - 1) : stack;

        if (draw) {
          tone();
          lastA = a + w / 2 + jitter; lastTop = deckY + sy * colH; lastSet = itemSet;
          for (let s = 0; s < colH; s++) {
            place(kind, cell, w, pd,
              a + w / 2 + jitter, deckY + sy / 2 + lift + s * sy * 1.005,
              itemSet + (s ? rr(rng, 0, 0.014) : 0),
              yaw + (s ? rr(rng, -0.06, 0.06) : 0), roll,
              sx, sy);
          }
        }
        // real facings do not butt flush: film goods leave air, board goods
        // leave a saw-tooth of one or two millimetres
        a += w + (soft ? rr(rng, 0.002, 0.018) : rr(rng, -0.001, 0.006));
      }

      // one item lying flat on top of the row — the classic restock leftover
      if (lastA !== null && a - blockStart > w * 1.6
          && lastTop - deckY + w * 0.6 < headroom
          && blockStart - lastFlat > 1.6 && rng() < 0.13) {
        col.multiplyScalar(0.97);
        place(kind, cell, w, pd, lastA, lastTop + w * 0.50,
          lastSet + rr(rng, 0.0, 0.02),
          baseRy + rr(rng, -0.22, 0.22), Math.PI / 2,
          w * 0.985, h);
        lastFlat = blockStart;
      }

      // ONE shelf tag per variety, sized to this SKU's facing — irregular
      // rhythm keyed to the product above it, not a tiling ribbon
      if (tag && a > blockStart) {
        tag(blockStart + 0.004, Math.min(0.115, Math.max(0.052, w * 0.92)), 'sku');
      }
      a += rr(rng, 0.0, 0.012);
    }
    // gap between brand blocks
    a += rr(rng, 0.004, 0.028);
  }
}
