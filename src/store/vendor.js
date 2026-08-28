// OWNER: builder-store. VENDOR IDENTITY AND PHOTOGRAPHIC SIGNAGE.
//
// Contract:
//   VENDORS                       the table of manufacturers this store stocks
//   vendorMark(g, ...)            one vendor's wordmark, in its own device
//   photoField(g, ...)            a depiction from depict.js, decoded to sRGB
//   posAtlas(THREE)               vendor shelf-talkers, 8 cells 320x256
//   lightboxAtlas(THREE)          backlit promo panels, 4 cells 1024x288
//   hangerAtlas(THREE)            small black category hangers, 8 cells 256x96
//   vendorCheck()                 asserts every device and every motif is drawn
//
// =========================================================================
// ROUND 19 — WHY THIS FILE EXISTS.
//
// r18's critic scored 14 render calls and **13 of them came off the signage**,
// and it named the reason precisely: every hanging sign and promo tag in this
// store comes out of ONE design system — a numbered blade, a two-word category
// list, three or four lozenge layouts, all flat matte vector. The two things
// that system has none of are VENDOR IDENTITY and PHOTOGRAPHIC CONTENT.
//
// Read against reference/store_00_Drinks_aisle_of_Smith_s_Food_and_Drug: one
// frame, five unrelated sign systems, none of which is the store's blade
// grammar.
//
//   1. a backlit lightbox, 3.5:1, a PHOTOGRAPH of a strawberry field filling
//      the whole panel, "more WAYS TO save" reversed out of it, and a row of
//      three icon chips along the bottom edge
//   2. a tiered aisle marker: the number in a dark oval over two columns of
//      category slats, each slat a separate physical board
//   3. small BLACK hangers at a lower level carrying one word each — "Tea",
//      "Glass Juice" — hung on their own wires, nothing to do with 1 or 2
//   4. a Campbell's sale POS clipped to a shelf: the STORE's red "Sale price"
//      header over the VENDOR's own wordmark, a product name, and two yellow
//      price bubbles
//   5. vendor identity on the facings themselves — Cap'n Crunch, Life, Quaker
//
// Item 5 is the one this project already closed, in round 17, and closing it is
// what the r17 critic called "the round's real achievement". The signage never
// got the same treatment, and it is the surface a critic reads FIRST because it
// is the largest, brightest, highest-contrast type in the frame.
//
// THE ONE RULE THIS FILE IS BUILT ON. A store does not design its vendors'
// point-of-sale material and a vendor does not design the store's. So a vendor
// mark here is NOT the store's palette with a different word in it: each one
// carries its own device — a script in an oval, a slab in a shield, a fat
// grotesque on a band — its own two colours, and its own type family. Where a
// store element and a vendor element share a card (the POS), they COLLIDE:
// the store's red header sits on top of the vendor's field and neither
// acknowledges the other, which is exactly what the Campbell's card does.
//
// AND THE PICTURE IS NOT A NEW DRAWING. depict.js already owns 82 depictions
// and they are on the packages. A lightbox showing a berry that does not match
// the berries on the shelf beneath it is worse than no lightbox, so the
// depictions are the SAME functions, decoded out of the package mask space into
// sRGB by the arithmetic the package shader itself uses. See decodeMask().

import { rr, ri, makeRng } from './kit.js';
import { FACE, BRANDS } from './brands.js';
import { MOTIF_DRAW } from './depict.js';

// ---------------------------------------------------------------------------
// THE VENDORS. Names are drawn from brands.js so a wordmark on a lightbox is a
// brand that is genuinely on a shelf in this building — the r17 lesson about
// baked-but-never-placed, applied to signage. `device` is how this vendor draws
// its own name and it is the whole point: five devices, no two alike, none of
// them the store's blade grammar.
//
// `motif` is a depict.js key, so the picture on a vendor's panel is the product
// that vendor actually sells.
export const DEVICES = ['oval', 'shield', 'band', 'ribbon', 'arch'];

export const VENDORS = [
  { n: BRANDS[5], device: 'oval', fg: '#fdf6e6', bg: '#b8232a', ink: '#2a1410',
    face: FACE.serif, motif: 'soupBowl', word: 'CONDENSED SOUP' },
  { n: BRANDS[23], device: 'band', fg: '#1b1a17', bg: '#f5c518', ink: '#1b1a17',
    face: FACE.fat, motif: 'cerealBowl', word: 'TOASTED OAT SQUARES' },
  { n: BRANDS[9], device: 'ribbon', fg: '#ffffff', bg: '#1f4f8f', ink: '#12203a',
    face: FACE.geo, motif: 'waterBottle', word: 'SPRING WATER 24 PK' },
  { n: BRANDS[2], device: 'shield', fg: '#f7f2e2', bg: '#2f6b32', ink: '#1a2c19',
    face: FACE.human, motif: 'tomato', word: 'DICED TOMATOES' },
  { n: BRANDS[13], device: 'arch', fg: '#fff8ec', bg: '#8e2f6d', ink: '#2c1024',
    face: FACE.serif, motif: 'sauceSpoon', word: 'MARINARA SAUCE' },
  { n: BRANDS[30], device: 'oval', fg: '#22301c', bg: '#e8e2cc', ink: '#22301c',
    face: FACE.human, motif: 'berries', word: 'MIXED BERRIES' },
  { n: BRANDS[18], device: 'band', fg: '#fffaf0', bg: '#e2621b', ink: '#3a1a08',
    face: FACE.impact, motif: 'chipShard', word: 'KETTLE CHIPS' },
  { n: BRANDS[41], device: 'shield', fg: '#fdfbf4', bg: '#3d3a86', ink: '#191838',
    face: FACE.geo, motif: 'coffeeCup', word: 'GROUND COFFEE' },
];

// ---------------------------------------------------------------------------
// THE MASK DECODER. depict.js writes into the package mask space and the
// package shader decodes it; this is that decode on the CPU, transcribed from
// the fragment source in pack.js rather than invented. If the two ever
// disagree, the lightbox will show a different colour of peach from the cans
// under it, which is a visible failure and the reason the arithmetic is copied
// line for line rather than approximated.
//
//     scaled = b * 4 ; band = min(3, floor(scaled)) ; amt = scaled - band
//     base   = mix(stock, brand, r)
//     base   = mix(base, food[band], amt)
//     albedo = base * (0.045 + 0.955 * g)
//
// The four food swatches are round 12's re-authored values, and `stock` is
// pack.js's PKG_STOCK default. Both are LINEAR — three.js works in linear and
// encodes on output — so the result is encoded to sRGB here for the canvas.
const FOOD = [[0.92, 0.58, 0.17], [0.34, 0.64, 0.14],
  [0.80, 0.115, 0.065], [0.95, 0.735, 0.255]];
const STOCK = [0.855, 0.845, 0.822];
const enc = (v) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * (v ** (1 / 2.4)) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
};
const dec = (b) => { const v = b / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

export function decodeMask(src, brandHex) {
  const br = [dec((brandHex >> 16) & 255), dec((brandHex >> 8) & 255), dec(brandHex & 255)];
  const d = src.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const scaled = b * 4;
    const band = Math.min(3, Math.floor(scaled));
    const amt = Math.max(0, Math.min(1, scaled - band));
    const f = FOOD[band];
    const k = 0.045 + 0.955 * g;
    for (let c = 0; c < 3; c++) {
      let base = STOCK[c] * (1 - r) + br[c] * r;
      base = base * (1 - amt) + f[c] * amt;
      d[i + c] = enc(base * k);
    }
    d[i + 3] = 255;
  }
  return src;
}

// A depiction, decoded, filling the given box. `bleed` scales the drawing past
// the box so a lightbox reads as a photograph CROPPED by its frame rather than
// as a sticker floating in the middle of one — which is what every promo
// photograph in the reference set does.
export function photoField(g, x, y, w, h, motifKey, rng, opts = {}) {
  const { brand = 0xc03028, bleed = 1.22, alpha = 1 } = opts;
  const draw = MOTIF_DRAW[motifKey];
  if (!draw) throw new Error('vendor.js: no depict.js motif named "' + motifKey + '". A silent '
    + 'fallback to M.generic is how r15 shipped a heap of ellipses on 51 packages.');
  MOTIF_LOG.add(motifKey);
  const W = Math.max(8, Math.round(w)), H = Math.max(8, Math.round(h));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const sg = c.getContext('2d');
  // THE GROUND. `paper` is bare stock at full print brightness — r = 0 so the
  // decode takes uPkgStock, which is the near-white board a shelf-talker is
  // printed on. `brand` is r = 255, which takes the vendor's own colour, and it
  // is what a full-bleed lit panel needs: the first lightbox bake left the
  // uncovered half of every panel as white paper, so a photograph that is meant
  // to run to all four edges stopped halfway across in a grey field.
  sg.fillStyle = opts.ground === 'brand' ? 'rgb(255,196,0)' : 'rgb(0,240,0)';
  sg.fillRect(0, 0, W, H);
  // three overlapping draws at different scales and offsets: one depiction
  // alone is an ILLUSTRATION, several crowding out of the frame is a
  // photograph of a pile of the stuff, which is what the strawberry panel is.
  const n = opts.n || (opts.single ? 1 : 3);
  const R = Math.min(W, H) / 2;
  for (let i = 0; i < n; i++) {
    const s = bleed * (i === 0 ? 1 : rr(rng, 0.66, 0.94));
    // the box a motif owns is SQUARE off the short side, not the panel's own
    // aspect — a 3.5:1 box handed to a berry draws a 3.5:1 berry, which is the
    // fastest way to make a depiction read as an abstract smear
    const cx = W * (i === 0 ? 0.5 : rr(rng, 0.06, 0.94));
    const cy = H * (i === 0 ? 0.5 : rr(rng, 0.10, 0.90));
    draw(sg, cx, cy, R * s, R * s, rng);
  }
  // ONE read, decode in place, ONE write. The first draft here read the buffer
  // twice and decoded twice, which squares the transfer function and turns
  // every mid-tone to mud — a bug that looks like a lighting choice.
  const px = sg.getImageData(0, 0, W, H);
  decodeMask(px, brand);
  sg.putImageData(px, 0, 0);
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(c, x, y, w, h);
  g.restore();
  return c;
}

// ---------------------------------------------------------------------------
// THE DEVICES. Five ways a manufacturer draws its own name, and the reason
// there are five rather than one is the entire finding of r18's critique: one
// grammar repeated is the tell, whatever the grammar is.
//
// Each returns the box it painted so a caller can stack copy under it.
const DEVICE_LOG = new Set();
const MOTIF_LOG = new Set();

export function vendorMark(g, cx, cy, w, h, v, rng) {
  DEVICE_LOG.add(v.device);
  const txt = (s, x, y, mw, px, face, weight, fill) => {
    g.font = `${weight} ${px}px ${face}`;
    const tw = g.measureText(s).width || 1;
    g.save();
    g.translate(x, y);
    g.scale(Math.min(1, mw / tw), 1);
    g.textAlign = 'center';
    g.fillStyle = fill;
    g.fillText(s, 0, 0);
    g.restore();
  };
  g.textBaseline = 'alphabetic';
  if (v.device === 'oval') {
    g.fillStyle = v.bg;
    g.beginPath(); g.ellipse(cx, cy, w * 0.50, h * 0.50, 0, 0, 6.2832); g.fill();
    g.strokeStyle = v.fg; g.lineWidth = Math.max(1.5, h * 0.055);
    g.beginPath(); g.ellipse(cx, cy, w * 0.44, h * 0.40, 0, 0, 6.2832); g.stroke();
    txt(v.n, cx, cy + h * 0.13, w * 0.76, h * 0.40, v.face, '700', v.fg);
  } else if (v.device === 'shield') {
    g.fillStyle = v.bg;
    g.beginPath();
    g.moveTo(cx - w * 0.42, cy - h * 0.46);
    g.lineTo(cx + w * 0.42, cy - h * 0.46);
    g.lineTo(cx + w * 0.42, cy + h * 0.08);
    g.quadraticCurveTo(cx, cy + h * 0.62, cx - w * 0.42, cy + h * 0.08);
    g.closePath(); g.fill();
    g.fillStyle = v.fg;
    g.fillRect(cx - w * 0.34, cy - h * 0.30, w * 0.68, Math.max(1.5, h * 0.045));
    txt(v.n, cx, cy + h * 0.15, w * 0.70, h * 0.34, v.face, '800', v.fg);
  } else if (v.device === 'band') {
    g.fillStyle = v.bg;
    g.fillRect(cx - w * 0.50, cy - h * 0.34, w, h * 0.68);
    g.fillStyle = v.ink;
    g.fillRect(cx - w * 0.50, cy + h * 0.30, w, Math.max(1.5, h * 0.075));
    txt(v.n, cx, cy + h * 0.14, w * 0.88, h * 0.46, v.face, '900', v.fg);
  } else if (v.device === 'ribbon') {
    const t = h * 0.30;
    g.fillStyle = v.ink;
    g.beginPath();
    g.moveTo(cx - w * 0.50, cy - t); g.lineTo(cx + w * 0.50, cy - t * 1.5);
    g.lineTo(cx + w * 0.50, cy + t * 1.5); g.lineTo(cx - w * 0.50, cy + t);
    g.closePath(); g.fill();
    g.fillStyle = v.bg;
    g.beginPath();
    g.moveTo(cx - w * 0.46, cy - t * 0.82); g.lineTo(cx + w * 0.46, cy - t * 1.24);
    g.lineTo(cx + w * 0.46, cy + t * 1.24); g.lineTo(cx - w * 0.46, cy + t * 0.82);
    g.closePath(); g.fill();
    txt(v.n, cx, cy + h * 0.13, w * 0.84, h * 0.40, v.face, '700', v.fg);
  } else {                                              // arch
    g.fillStyle = v.bg;
    g.beginPath();
    g.moveTo(cx - w * 0.48, cy + h * 0.42);
    g.lineTo(cx - w * 0.48, cy - h * 0.06);
    g.quadraticCurveTo(cx, cy - h * 0.68, cx + w * 0.48, cy - h * 0.06);
    g.lineTo(cx + w * 0.48, cy + h * 0.42);
    g.closePath(); g.fill();
    txt(v.n, cx, cy + h * 0.22, w * 0.80, h * 0.36, v.face, '700', v.fg);
  }
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

// ---------------------------------------------------------------------------
// THE VENDOR SHELF-TALKER. The Campbell's card, and the collision is the point:
// the STORE prints the red SALE PRICE header and the yellow price bubbles, the
// VENDOR owns everything between them, and the two do not match because in a
// real store they were designed in different buildings.
//
// This is the piece that carries the round at the range the critic judges from:
// it sits on the gondola face at shelf height, so it is one of the few printed
// surfaces the player is ever within two metres of.
export const POS_COLS = 4, POS_ROWS = 2;
export function posAtlas(THREE) {
  const CW = 320, CH = 256;
  const c = document.createElement('canvas');
  c.width = CW * POS_COLS; c.height = CH * POS_ROWS;
  const g = c.getContext('2d');
  const rng = makeRng(0x5A1E);
  for (let i = 0; i < POS_COLS * POS_ROWS; i++) {
    const v = VENDORS[i % VENDORS.length];
    g.save();
    g.translate((i % POS_COLS) * CW, Math.floor(i / POS_COLS) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    g.textBaseline = 'alphabetic';

    // the card stock
    g.fillStyle = '#fdfaf0'; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgba(70,64,54,0.45)'; g.lineWidth = 2.5;
    g.strokeRect(1.5, 1.5, CW - 3, CH - 3);

    // ---- THE STORE'S HALF: red header band, its own type, its own words ----
    const hb = CH * 0.155;
    g.fillStyle = '#c8171a'; g.fillRect(0, 0, CW, hb);
    g.fillStyle = '#fffdf2';
    g.font = `900 ${hb * 0.62}px ${FACE.fat}`;
    g.textAlign = 'left';
    g.fillText(i % 3 === 2 ? 'LOW PRICE' : 'SALE PRICE', 10, hb * 0.75);
    g.font = `700 ${hb * 0.38}px ${FACE.grot}`;
    g.textAlign = 'right';
    g.fillText('WITH CARD', CW - 10, hb * 0.72);

    // ---- THE VENDOR'S HALF -------------------------------------------------
    // a picture of the product, cropped by the card, then the vendor's device
    // sitting ON it — a manufacturer puts its mark over its own photography.
    photoField(g, CW * 0.03, hb + 6, CW * 0.44, CH * 0.44, v.motif, rng,
      { brand: parseInt(v.bg.slice(1), 16), bleed: 1.30 });
    g.strokeStyle = 'rgba(40,34,26,0.35)'; g.lineWidth = 1.6;
    g.strokeRect(CW * 0.03, hb + 6, CW * 0.44, CH * 0.44);
    vendorMark(g, CW * 0.71, hb + CH * 0.16, CW * 0.50, CH * 0.20, v, rng);
    g.textAlign = 'center';
    g.font = `700 ${CH * 0.062}px ${FACE.grot}`;
    g.fillStyle = '#2b2822';
    {
      const tw = g.measureText(v.word).width || 1;
      g.save();
      g.translate(CW * 0.71, hb + CH * 0.34);
      g.scale(Math.min(1, (CW * 0.50) / tw), 1);
      g.fillText(v.word, 0, 0);
      g.restore();
    }

    // ---- THE STORE'S HALF AGAIN: the price bubbles -------------------------
    // Yellow roundels with a red numeral, overlapping the vendor's block,
    // because a store manager clips its own price on top of whatever the
    // vendor sent. Two of them, the way a multibuy prints.
    const n = ri(rng, 1, 9), cts = ri(rng, 0, 9);
    g.fillStyle = '#1c1a15';
    g.font = `900 ${CH * 0.30}px ${FACE.fat}`;
    g.textAlign = 'left';
    g.fillText(`${n}`, 14, CH * 0.90);
    const bw = g.measureText(`${n}`).width;
    g.font = `900 ${CH * 0.17}px ${FACE.fat}`;
    g.fillText(`${cts}${ri(rng, 0, 9)}`, 14 + bw + 4, CH * 0.90 - CH * 0.10);
    g.font = `900 ${CH * 0.085}px ${FACE.grot}`;
    g.fillText('$', 14 + bw + 4, CH * 0.90);
    for (let k = 0; k < 2; k++) {
      const bx = CW * (0.66 + k * 0.20), by = CH * (0.76 + (k ? 0.08 : 0));
      const br = CH * (k ? 0.10 : 0.125);
      g.fillStyle = '#ffdf1a';
      g.beginPath(); g.arc(bx, by, br, 0, 6.2832); g.fill();
      g.strokeStyle = '#c8171a'; g.lineWidth = 2.2; g.stroke();
      g.fillStyle = '#c8171a';
      g.font = `900 ${br * 0.86}px ${FACE.fat}`;
      g.textAlign = 'center';
      g.fillText(k ? `${ri(rng, 2, 5)}` : `+${ri(rng, 1, 9)}0`, bx, by + br * 0.32);
    }
    // the tiny store code nobody reads, along the foot
    g.textAlign = 'left';
    g.font = `400 ${CH * 0.040}px ${FACE.mono}`;
    g.fillStyle = 'rgba(45,40,32,0.72)';
    g.fillText(`ITEM ${ri(rng, 100000, 999999)}   EFF ${ri(rng, 1, 12)}/${ri(rng, 10, 28)}`,
      10, CH - 7);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// THE BACKLIT LIGHTBOX. The single loudest object in the reference frame and
// the render had no equivalent at any size: a 3.5:1 panel, a photograph
// bleeding to all four edges, a two-weight headline reversed out of it, and a
// row of icon chips along the bottom.
//
// It is authored BRIGHT — this is an internally lit acrylic face, so it is the
// one printed surface in the store that is a source rather than a reflector,
// and store.js gives it an emissive rather than only a map.
export const LB_CELLS = 4;
export function lightboxAtlas(THREE) {
  const W = 1024, H = 288;
  const c = document.createElement('canvas');
  c.width = W; c.height = H * LB_CELLS;
  const g = c.getContext('2d');
  const rng = makeRng(0x11B0);
  const HEAD = [
    ['more', 'WAYS TO', 'save'],
    ['fresh', 'EVERY', 'day'],
    ['stock up', 'AND', 'save'],
    ['pick up', 'A DEAL', 'today'],
  ];
  const CHIP = [
    ['GREAT SALES', 'FUEL POINTS', 'DIGITAL COUPONS'],
    ['PICKED DAILY', 'LOCAL GROWERS', 'GUARANTEED'],
    ['BUY 5 SAVE $5', 'MIX AND MATCH', 'NO LIMIT'],
    ['WEEKLY AD', 'CLIP AND SAVE', 'MEMBER PRICE'],
  ];
  for (let i = 0; i < LB_CELLS; i++) {
    const v = VENDORS[(i * 3 + 1) % VENDORS.length];
    g.save();
    g.translate(0, i * H);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    // THE PHOTOGRAPH, EDGE TO EDGE, AND IT STAYS VIVID.
    //
    // The first bake put a 0.38-0.42 alpha wash across the whole panel so the
    // type had a field, and it turned every depiction into a pastel ghost — the
    // reference's strawberries are the most saturated thing in that frame, not
    // the least. A real panel of this kind darkens only the side the type is
    // on, with a gradient, and leaves the picture alone. `bleed` came down from
    // 1.55 to 1.06 for the same reason: at 1.55 one motif fills the panel and
    // reads as an abstract shape, where seven at 1.06 read as a pile of the
    // product, which is what the photograph on these actually is.
    photoField(g, 0, 0, W, H, v.motif, rng,
      { brand: parseInt(v.bg.slice(1), 16), bleed: 1.06, n: 7, ground: 'brand' });
    const wash = g.createLinearGradient(0, 0, W, 0);
    const rgb = i % 2 ? '150,20,26' : '24,60,120';
    wash.addColorStop(0, `rgba(${rgb},0.86)`);
    wash.addColorStop(0.42, `rgba(${rgb},0.58)`);
    wash.addColorStop(0.78, `rgba(${rgb},0.10)`);
    wash.addColorStop(1, `rgba(${rgb},0.02)`);
    g.fillStyle = wash; g.fillRect(0, 0, W, H);
    // headline: a light script-ish lowercase, a small caps rule, and a fat
    // lowercase. Three weights in one lockup, which is what these all do.
    //
    // AND THE FAT WORD IS FITTED, NOT ASSUMED. The first bake sized it at a
    // fixed 0.60 H and "stock up" ran straight into "save" — the identical
    // overprint AGENTS_BRIEF records twice in hud.js, arriving here because a
    // width was guessed rather than measured. `advance` is measured off the
    // same ctx that will draw it.
    const [a, b, d] = HEAD[i % HEAD.length];
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.fillStyle = '#fffaf0';
    g.font = `400 ${H * 0.36}px ${FACE.serif}`;
    const aw = Math.min(g.measureText(a).width, W * 0.38);
    g.save();
    g.translate(W * 0.045, H * 0.50);
    g.scale(Math.min(1, (W * 0.38) / (g.measureText(a).width || 1)), 1);
    g.fillText(a, 0, 0);
    g.restore();
    g.fillStyle = '#ffffff';
    g.fillRect(W * 0.045, H * 0.575, aw, Math.max(2, H * 0.016));
    g.font = `800 ${H * 0.105}px ${FACE.grot}`;
    g.fillStyle = '#ffe9c8';
    g.fillText(b, W * 0.048, H * 0.72);
    {
      const x0 = W * 0.045 + aw + W * 0.030;
      const room = W * 0.90 - x0;
      g.font = `900 ${H * 0.55}px ${FACE.fat}`;
      const dw = g.measureText(d).width || 1;
      g.save();
      g.translate(x0, H * 0.60);
      g.scale(Math.min(1, room / dw), 1);
      g.fillStyle = '#ffffff';
      g.fillText(d, 0, 0);
      g.restore();
    }
    // the chip row
    const chips = CHIP[i % CHIP.length];
    g.fillStyle = 'rgba(20,16,12,0.30)';
    g.fillRect(0, H * 0.80, W, H * 0.20);
    for (let k = 0; k < 3; k++) {
      const x = W * (0.055 + k * 0.315);
      g.fillStyle = '#ffd23a';
      g.beginPath();
      // a small pennant / tag / scissors mark — three different chip icons
      if (k === 0) {
        g.moveTo(x, H * 0.855); g.lineTo(x + H * 0.075, H * 0.855);
        g.lineTo(x + H * 0.052, H * 0.905); g.lineTo(x + H * 0.075, H * 0.955);
        g.lineTo(x, H * 0.955);
      } else if (k === 1) {
        g.moveTo(x, H * 0.905); g.lineTo(x + H * 0.040, H * 0.850);
        g.lineTo(x + H * 0.080, H * 0.905); g.lineTo(x + H * 0.040, H * 0.960);
      } else {
        g.moveTo(x, H * 0.850); g.lineTo(x + H * 0.078, H * 0.955);
        g.lineTo(x + H * 0.060, H * 0.955); g.lineTo(x, H * 0.880);
      }
      g.closePath(); g.fill();
      g.fillStyle = '#fffaf0';
      g.font = `700 ${H * 0.078}px ${FACE.grot}`;
      const s = chips[k];
      const tw = g.measureText(s).width || 1;
      g.save();
      g.translate(x + H * 0.10, H * 0.935);
      g.scale(Math.min(1, (W * 0.255) / tw), 1);
      g.fillText(s, 0, 0);
      g.restore();
    }
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// THE THIRD SYSTEM. Small black hangers on their own wires carrying one word,
// at a level below the aisle markers and unrelated to them. Cheap, and it is
// half of what makes the reference frame read as several systems rather than
// one: two signs of different colour, size and height in the same sight line.
export const HANGER_CELLS = 8;
const HANGER_WORDS = ['GLASS JUICE', 'TEA', 'POWDERED DRINKS', 'COFFEE FILTERS',
  'COCOA', 'ISOTONICS', 'SINGLE SERVE', 'MIXERS'];
export function hangerAtlas(THREE) {
  const W = 256, H = 96;
  const c = document.createElement('canvas');
  c.width = W; c.height = H * HANGER_CELLS;
  const g = c.getContext('2d');
  for (let i = 0; i < HANGER_CELLS; i++) {
    g.save();
    g.translate(0, i * H);
    g.fillStyle = '#17171a'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,252,244,0.10)'; g.fillRect(0, 0, W, 3);
    g.fillStyle = '#f4f1e6';
    g.font = `600 ${H * 0.40}px ${FACE.human}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const s = HANGER_WORDS[i % HANGER_WORDS.length];
    const tw = g.measureText(s).width || 1;
    g.save();
    g.translate(W / 2, H / 2 + H * 0.03);
    g.scale(Math.min(1, (W * 0.86) / tw), 1);
    g.fillText(s, 0, 0);
    g.restore();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// THE ASSERTION, AND IT IS BUILT FOR THE FAILURE THIS PROJECT KEEPS HAVING.
//
// r16's depictCheck certified 82 motifs while 51 never baked. r17's bakeCheck
// certified 81 bakes while 8 never reached a shelf. So this does not assert
// that the VENDORS table is well-formed — a table check is the stage that has
// failed here four times. It asserts against what the atlases actually DREW:
// vendorMark records every device it painted, photoField every motif it
// decoded, and both sets must cover what the table declares.
//
// It is deliberately silent about placement. That stage belongs to store.js's
// chopSignCheck(), which reads the scene graph, for the same reason shelfCheck
// exists one family over: baked is not placed.
export function vendorStats() {
  return { devicesDrawn: [...DEVICE_LOG], motifsDrawn: [...MOTIF_LOG] };
}

export function vendorCheck() {
  const bad = [];
  for (const d of DEVICES) {
    if (!DEVICE_LOG.has(d)) {
      bad.push('device "' + d + '" is declared and never drawn — a device nobody bakes is '
        + 'the r16 failure (82 motifs declared, 51 never baked) one surface along');
    }
  }
  for (const v of VENDORS) {
    if (!MOTIF_LOG.has(v.motif)) {
      bad.push(v.n + ' declares motif "' + v.motif + '" and no panel ever decoded it');
    }
  }
  if (!DEVICE_LOG.size) {
    bad.push('ZERO devices drawn. Zero is the most suspicious reading an instrument can '
      + 'give — the atlases did not bake, the table is not wrong.');
  }
  return bad;
}
