// OWNER: builder-store. Department palettes + the shelf-filling algorithm.
//
// Real shelves are not random: a category runs 3-12 identical facings wide, then
// the next SKU starts with a different size and colour. Getting that rhythm right
// is what makes a shelf read as merchandised rather than noise-generated.

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

// kinds: t=type, w=[min,max] facing width, h=[min,max] height, run=[min,max] facings
const K = {
  cerealBox: { t: 'box', w: [0.17, 0.23], h: [0.28, 0.35], d: 0.72, run: [3, 8] },
  midBox:    { t: 'box', w: [0.10, 0.16], h: [0.17, 0.24], d: 0.80, run: [4, 11] },
  smallBox:  { t: 'box', w: [0.06, 0.10], h: [0.11, 0.17], d: 0.85, run: [5, 14] },
  wideBox:   { t: 'box', w: [0.24, 0.34], h: [0.14, 0.20], d: 0.80, run: [2, 5] },
  tallBox:   { t: 'box', w: [0.09, 0.13], h: [0.26, 0.33], d: 0.82, run: [4, 9] },
  can:       { t: 'can', w: [0.068, 0.086], h: [0.10, 0.13], d: 1.0, run: [6, 16] },
  bigCan:    { t: 'can', w: [0.098, 0.115], h: [0.15, 0.19], d: 1.0, run: [4, 9] },
  jar:       { t: 'can', w: [0.075, 0.098], h: [0.14, 0.19], d: 1.0, run: [4, 10] },
  bottle:    { t: 'bottle', w: [0.070, 0.090], h: [0.24, 0.32], d: 1.0, run: [5, 12] },
  jug:       { t: 'bottle', w: [0.115, 0.150], h: [0.26, 0.34], d: 1.0, run: [3, 7] },
  sodaBtl:   { t: 'bottle', w: [0.078, 0.095], h: [0.28, 0.34], d: 1.0, run: [6, 14] },
  bag:       { t: 'bag', w: [0.19, 0.30], h: [0.24, 0.33], d: 0.55, run: [2, 5] },
  smallBag:  { t: 'bag', w: [0.11, 0.18], h: [0.15, 0.23], d: 0.60, run: [3, 7] },
  case12:    { t: 'box', w: [0.30, 0.42], h: [0.13, 0.17], d: 0.85, run: [2, 4] },
};

// Eight departments, one per aisle. `sign` feeds the hanging sign, `blade` the
// mid-aisle markers.
export const DEPTS = [
  {
    name: 'bakery', blade: 'BREAD / BAKING',
    sign: ['BREAD', 'BAKING NEEDS', 'FLOUR / SUGAR', 'COOKIES'],
    kinds: [K.bag, K.midBox, K.smallBox, K.wideBox, K.tallBox, K.bag],
    colors: mix('cream', 'brown', 'red', 'yellow', 'white', 'orange'),
  },
  {
    name: 'canned', blade: 'CANNED GOODS',
    sign: ['CANNED VEGETABLES', 'SOUPS / BROTH', 'CANNED FRUITS', 'PORK & BEANS'],
    kinds: [K.can, K.can, K.bigCan, K.jar, K.can, K.midBox],
    colors: mix('red', 'green', 'silver', 'blue', 'orange', 'white'),
  },
  {
    name: 'pasta', blade: 'PASTA / SAUCE',
    sign: ['SPAGHETTI / SAUCES', 'RICE & DRY BEANS', 'MEXICAN', 'ASIAN'],
    kinds: [K.jar, K.midBox, K.smallBox, K.tallBox, K.jar, K.bigCan],
    colors: mix('red', 'yellow', 'green', 'brown', 'cream', 'orange'),
  },
  {
    name: 'snacks', blade: 'SNACKS / CHIPS',
    sign: ['CHIPS & SNACKS', 'CANDIES', 'CRACKERS', 'NUTS'],
    kinds: [K.bag, K.bag, K.smallBag, K.wideBox, K.midBox, K.bag],
    colors: mix('orange', 'red', 'yellow', 'blue', 'green', 'purple', 'teal'),
  },
  {
    name: 'soda', blade: 'SODA / JUICE',
    sign: ['SOFT DRINKS', 'JUICES', 'BOTTLED WATER', 'SPORTS DRINKS'],
    kinds: [K.sodaBtl, K.case12, K.sodaBtl, K.bottle, K.jug, K.case12],
    colors: mix('red', 'blue', 'green', 'orange', 'purple', 'white', 'teal'),
  },
  {
    name: 'breakfast', blade: 'CEREAL / COFFEE',
    sign: ['CEREAL', 'COFFEE / TEA', 'BREAKFAST FOODS', 'SYRUP / JAM'],
    kinds: [K.cerealBox, K.cerealBox, K.midBox, K.jar, K.tallBox, K.smallBox],
    colors: mix('yellow', 'red', 'blue', 'orange', 'brown', 'green'),
  },
  {
    name: 'paper', blade: 'PAPER / CLEANING',
    sign: ['PAPER GOODS', 'LAUNDRY', 'CLEANING SUPPLIES', 'TRASH BAGS'],
    kinds: [K.jug, K.wideBox, K.bag, K.jug, K.midBox, K.cerealBox],
    colors: mix('blue', 'white', 'teal', 'green', 'orange', 'purple'),
  },
  {
    name: 'health', blade: 'HEALTH / BEAUTY',
    sign: ['HEALTH & BEAUTY', 'BABY CARE', 'VITAMINS', 'PET SUPPLIES'],
    kinds: [K.smallBox, K.bottle, K.smallBox, K.midBox, K.smallBag, K.jar],
    colors: mix('white', 'teal', 'purple', 'blue', 'pink', 'cream', 'green'),
  },
];

export const FROZEN = {
  name: 'frozen', blade: 'FROZEN', sign: ['FROZEN'],
  kinds: [K.wideBox, K.midBox, K.smallBag, K.bag, K.tallBox],
  colors: mix('white', 'blue', 'teal', 'red', 'green', 'silver', 'orange'),
};

// ---------------------------------------------------------------------------
// Fill one shelf deck with product.
//   axis   'z' (run goes along Z, faces point along X) or 'x'
//   a0,a1  extent along the run axis
//   lip    coordinate of the shelf front edge on the cross axis
//   face   +1 / -1 direction the shelf faces on the cross axis
//   deckY  top surface of the shelf board
//   headroom  clear height to the next shelf
//   depth  usable shelf depth
//   lit    0..1 brightness multiplier (fakes the light falloff down the gondola)
export function fillShelf(B, rng, dept, opts) {
  const { axis, a0, a1, lip, face, deckY, headroom, depth, lit, col } = opts;
  const isZ = axis === 'z';
  let a = a0 + rr(rng, 0.01, 0.05);
  let guard = 0;
  while (a < a1 - 0.05 && guard++ < 400) {
    const kind = pick(rng, dept.kinds);
    const hsl = pick(rng, dept.colors);
    const w = rr(rng, kind.w[0], kind.w[1]);
    let h = rr(rng, kind.h[0], kind.h[1]);
    if (h > headroom - 0.03) h = Math.max(0.08, headroom - rr(rng, 0.03, 0.09));
    const pd = Math.min(depth * 0.94, Math.max(0.12, kind.d * depth));
    let n = ri(rng, kind.run[0], kind.run[1]);
    if (a + n * w > a1) n = Math.max(1, Math.floor((a1 - a) / w));
    // occasional hole in the planogram — a real store always has a few
    if (rng() < 0.035) { a += rr(rng, 0.05, 0.22); continue; }

    const shade = lit * rr(rng, 0.9, 1.06);
    col.setHSL(hsl[0] / 360, hsl[1] / 100 * rr(rng, 0.85, 1.05), hsl[2] / 100 * rr(rng, 0.9, 1.08));
    col.multiplyScalar(shade);

    // stacking: cans and small boxes often sit two high on a deep shelf
    const stack = (kind.t === 'can' && headroom > h * 2 + 0.05 && rng() < 0.35) ? 2 : 1;

    for (let k = 0; k < n && a < a1 - w * 0.5; k++) {
      const jitter = rr(rng, -0.006, 0.006);
      for (let s = 0; s < stack; s++) {
        const cx = isZ ? lip - face * (pd / 2 + 0.015) : a + w / 2 + jitter;
        const cz = isZ ? a + w / 2 + jitter : lip - face * (pd / 2 + 0.015);
        const cy = deckY + h / 2 + s * h;
        const ry = isZ ? (face > 0 ? Math.PI / 2 : -Math.PI / 2) : (face > 0 ? 0 : Math.PI);
        const yaw = ry + rr(rng, -0.045, 0.045);
        if (kind.t === 'box' || kind.t === 'bag') {
          B[kind.t === 'bag' ? 'bag' : 'box'].push(cx, cy, cz, 0, yaw, 0, w * 0.985, h, pd, col);
        } else if (kind.t === 'can') {
          B.can.push(cx, cy, cz, 0, rng() * 6.28, 0, w, h, w, col);
        } else {
          B.bottle.push(cx, cy, cz, 0, rng() * 6.28, 0, w, h, w, col);
        }
      }
      a += w;
    }
    a += rr(rng, 0.0, 0.018);
  }
}
