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
const C = {
  red:     [[352, 78, 46], [8, 82, 50], [0, 68, 40], [346, 70, 55]],
  orange:  [[24, 92, 52], [32, 95, 55], [16, 85, 48], [38, 90, 58]],
  yellow:  [[46, 95, 55], [52, 92, 58], [42, 88, 50]],
  green:   [[96, 55, 34], [138, 48, 34], [82, 62, 40], [116, 40, 28]],
  teal:    [[176, 55, 38], [190, 60, 42], [166, 45, 34]],
  blue:    [[214, 72, 40], [222, 66, 34], [202, 78, 42], [232, 55, 38]],
  navy:    [[224, 60, 22], [216, 55, 26]],
  purple:  [[280, 45, 40], [296, 40, 44], [268, 50, 36]],
  pink:    [[334, 70, 58], [318, 62, 60]],
  cream:   [[40, 45, 82], [36, 30, 88], [44, 55, 78]],
  white:   [[40, 12, 90], [200, 8, 88], [30, 15, 92]],
  brown:   [[26, 50, 30], [20, 42, 26], [32, 38, 34]],
  black:   [[220, 12, 16], [30, 10, 14]],
  silver:  [[210, 8, 68], [40, 6, 72]],
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
    colors: mix('cream', 'brown', 'red', 'yellow', 'white', 'orange'),
  },
  {
    name: 'canned', key: 'canned', blade: 'CANNED GOODS',
    sign: ['CANNED VEGETABLES', 'SOUPS / BROTH', 'CANNED FRUITS', 'PORK & BEANS'],
    kinds: [K.can, K.can, K.bigCan, K.jar, K.tallJar, K.midBox, K.pouch, K.smallBox],
    soft: [K.jar, K.tallJar, K.pouch],
    colors: mix('red', 'green', 'silver', 'blue', 'orange', 'white'),
  },
  {
    name: 'pasta', key: 'pasta', blade: 'PASTA / SAUCE',
    sign: ['SPAGHETTI / SAUCES', 'RICE & DRY BEANS', 'MEXICAN', 'ASIAN'],
    kinds: [K.jar, K.midBox, K.smallBox, K.tallBox, K.tallJar, K.bigCan, K.pouch, K.squat],
    soft: [K.jar, K.tallJar, K.pouch, K.squat],
    colors: mix('red', 'yellow', 'green', 'brown', 'cream', 'orange'),
  },
  {
    name: 'snacks', key: 'snacks', blade: 'SNACKS / CHIPS',
    sign: ['CHIPS & SNACKS', 'CANDIES', 'CRACKERS', 'NUTS'],
    kinds: [K.bag, K.bag, K.smallBag, K.wideBox, K.midBox, K.pouch, K.tinyBox, K.tallJar],
    soft: [K.bag, K.smallBag, K.pouch, K.tallJar],
    colors: mix('orange', 'red', 'yellow', 'blue', 'green', 'purple', 'teal'),
  },
  {
    name: 'soda', key: 'soda', blade: 'SODA / JUICE',
    sign: ['SOFT DRINKS', 'JUICES', 'BOTTLED WATER', 'SPORTS DRINKS'],
    kinds: [K.sodaBtl, K.case12, K.sodaBtl, K.bottle, K.jug, K.case12, K.squat, K.can],
    soft: [K.sodaBtl, K.bottle, K.jug, K.squat],
    colors: mix('red', 'blue', 'green', 'orange', 'purple', 'white', 'teal'),
  },
  {
    name: 'breakfast', key: 'breakfast', blade: 'CEREAL / COFFEE',
    sign: ['CEREAL', 'COFFEE / TEA', 'BREAKFAST FOODS', 'SYRUP / JAM'],
    kinds: [K.cerealBox, K.cerealBox, K.midBox, K.jar, K.tallBox, K.smallBox, K.tallJar, K.pouch],
    soft: [K.jar, K.tallJar, K.pouch],
    colors: mix('yellow', 'red', 'blue', 'orange', 'brown', 'green'),
  },
  {
    name: 'paper', key: 'paper', blade: 'PAPER / CLEANING',
    sign: ['PAPER GOODS', 'LAUNDRY', 'CLEANING SUPPLIES', 'TRASH BAGS'],
    kinds: [K.jug, K.wideBox, K.bag, K.jug, K.midBox, K.cerealBox, K.squat, K.bottle],
    soft: [K.jug, K.bag, K.squat, K.bottle],
    colors: mix('blue', 'white', 'teal', 'green', 'orange', 'purple'),
  },
  {
    name: 'health', key: 'health', blade: 'HEALTH / BEAUTY',
    sign: ['HEALTH & BEAUTY', 'BABY CARE', 'VITAMINS', 'PET SUPPLIES'],
    kinds: [K.smallBox, K.bottle, K.tinyBox, K.midBox, K.smallBag, K.jar, K.squat, K.pouch],
    soft: [K.bottle, K.jar, K.squat, K.pouch, K.smallBag],
    colors: mix('white', 'teal', 'purple', 'blue', 'pink', 'cream', 'green'),
  },
];

export const FROZEN = {
  name: 'frozen', key: 'frozen', blade: 'FROZEN', sign: ['FROZEN'],
  kinds: [K.wideBox, K.midBox, K.smallBag, K.bag, K.tallBox, K.pouch],
  soft: [K.smallBag, K.bag, K.pouch],
  colors: mix('white', 'blue', 'teal', 'red', 'green', 'silver', 'orange'),
};

// Atlas-cell pools. Cell i of each atlas was drawn with department i%8's
// vocabulary, so a department takes its themed cells plus a few strays —
// real neighbouring SKUs are not all from one design family.
function poolFor(idx, total, strays) {
  const p = [];
  for (let k = idx % 8; k < total; k += 8) p.push(k);
  for (let k = 0; k < strays; k++) p.push((idx * 5 + k * 7 + 3) % total);
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
function fits(kinds, headroom) {
  const ok = kinds.filter((k) => k.h[0] <= headroom - 0.02 && k.h[1] <= headroom + 0.06);
  if (ok.length) return ok;
  const loose = kinds.filter((k) => k.h[0] <= headroom - 0.01);
  if (loose.length) return loose;
  return [kinds.reduce((a, b) => (a.h[0] <= b.h[0] ? a : b))];
}

export function fillShelf(B, rng, dept, opts) {
  const {
    axis, a0, a1, lip, face, deckY, headroom, depth, lit, col,
    pull = 0.5, tag = null,
  } = opts;
  const isZ = axis === 'z';
  const baseRy = isZ ? (face > 0 ? Math.PI / 2 : -Math.PI / 2) : (face > 0 ? 0 : Math.PI);

  // Vertical gradient: the top deck is faced right up to the lip, the bottom
  // deck sits several inches back. That gradient alone changes how an aisle
  // reads far more than any single item does.
  const deckSetback = (1 - pull) * 0.048;

  // Cans and bottles have a ROUND cross-section: their depth is their width,
  // never the carton depth, or they lathe out into long elliptical tubes and
  // the whole aisle reads as boxes.
  const place = (kind, cell, w, pd, a, cy, setback, yaw, roll, sx, sy) => {
    const round = kind.t === 'can' || kind.t === 'bottle';
    const sz = round ? sx : pd;
    const back = sz / 2 + 0.012 + setback;
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

  while (a < a1 - 0.05 && guard++ < 260) {
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
    if (rng() < 0.055 + (1 - pull) * 0.05) {
      a += rr(rng, 0.07, 0.30);
      continue;
    }

    // 1-4 flavour varieties of the SAME brand: identical artwork, different
    // flash colour. This is the dominant rhythm on a real shelf.
    const varieties = ri(rng, 1, 4);
    const skuSetback = deckSetback + rr(rng, 0.0, 0.028);

    for (let v = 0; v < varieties && a < a1 - w * 0.6; v++) {
      // flavour shift — hue walks, saturation and lightness stay in family
      const hueShift = v === 0 ? 0 : rr(rng, 14, 62) * (rng() < 0.5 ? -1 : 1) * v;
      const hh = (baseHsl[0] + hueShift + 360) % 360;
      const shade = lit * rr(rng, 0.93, 1.05);
      col.setHSL(
        hh / 360,
        Math.min(1, baseHsl[1] / 100 * rr(rng, 1.0, 1.20)),
        Math.min(0.94, baseHsl[2] / 100 * rr(rng, 0.94, 1.12)));
      col.multiplyScalar(shade);

      let n = ri(rng, kind.run[0], kind.run[1]);
      if (a + n * w > a1) n = Math.max(1, Math.floor((a1 - a) / w));
      if (n < 1) break;

      const blockStart = a;

      // Cans, jars and small boxes get stacked until they nearly reach the
      // shelf above — that is what a stock clerk actually does, and it is what
      // keeps a cavity from reading as a half-empty display case.
      const stackable = kind.t === 'can' || kind === K.tinyBox || kind === K.smallBox
        || kind === K.wideBox || kind === K.case12 || kind === K.pouch;
      let stack = 1;
      if (stackable) {
        const fits = Math.floor((headroom - 0.015) / h);
        if (fits >= 2 && rng() < 0.82) stack = Math.min(fits, rng() < 0.35 ? 3 : 2);
      }

      for (let k = 0; k < n && a < a1 - w * 0.55; k++) {
        const jitter = rr(rng, -0.005, 0.005);
        // per-item depth wander, 1-4in off the SKU's own setback
        const itemSet = Math.max(0, skuSetback + rr(rng, -0.012, 0.035));
        // roughly one in five items sits rotated 3-15 degrees
        const skew = rng() < 0.20 ? rr(rng, 0.05, 0.26) * (rng() < 0.5 ? -1 : 1) : rr(rng, -0.03, 0.03);
        // one in twenty is shelved backwards — 180 degrees shows the plain
        // wrap column, which is exactly what a reversed package looks like
        const backwards = rng() < 0.045;
        const yaw = baseRy + skew + (backwards ? Math.PI : 0);
        // a crushed corner: squashed and leaning
        const crushed = rng() < 0.035;
        const roll = crushed ? rr(rng, 0.06, 0.16) * (rng() < 0.5 ? -1 : 1)
          : (kind.t === 'bag' ? rr(rng, -0.05, 0.05) : 0);
        const sy = crushed ? h * rr(rng, 0.86, 0.94) : h;

        for (let s = 0; s < stack; s++) {
          place(kind, cell, w, pd,
            a + w / 2 + jitter, deckY + sy / 2 + s * sy, itemSet, yaw, roll,
            w * 0.985, sy);
        }
        a += w;
      }

      // one item lying flat on top of the row — the classic restock leftover
      if (a - blockStart > w * 1.6 && headroom > h + w * 1.15
          && blockStart - lastFlat > 1.6 && rng() < 0.13) {
        col.multiplyScalar(0.97);
        place(kind, cell, w, pd,
          blockStart + (a - blockStart) * 0.5, deckY + h + w * 0.52,
          skuSetback + rr(rng, 0.01, 0.05),
          baseRy + rr(rng, -0.22, 0.22), Math.PI / 2,
          w * 0.985, h);
        lastFlat = blockStart;
      }

      // ONE shelf tag per variety, sized to this SKU's facing — irregular
      // rhythm keyed to the product above it, not a tiling ribbon
      if (tag && a > blockStart) {
        tag(blockStart + 0.004, Math.min(0.115, Math.max(0.052, w * 0.92)), cell);
      }
      a += rr(rng, 0.0, 0.012);
    }
    // gap between brand blocks
    a += rr(rng, 0.004, 0.028);
  }
}
