// OWNER: builder-store. Packaging atlases — the round-2 rewrite.
//
// WHY THIS FILE EXISTS
// A blind critic called 4/4 renders as CG in under a second and said every call
// was made "from the packaging alone". Round-1 facings were a flat colour field
// plus two-to-four grey bars: wrong spatial frequency, nowhere near enough
// contrast. A real carton face is 40-70% white stock carrying a heavy wordmark,
// a serving-suggestion photo, a net-weight line and six-to-ten lines of tiny
// legal type. That is what gets drawn here, with real fillText glyphs.
//
// MASK CHANNEL CONTRACT  (raw texture, NoColorSpace — see chopPackageMat)
//   r  brand-colour amount.  0 = bare white stock, 255 = full per-instance brand
//   g  print brightness.     0 = ink black, 255 = paper white
//   b  food-photo tint. Four 64-wide bands, each ramping 0 -> full strength:
//        0..63 golden (grains, crackers, nuts)   64..127  green (vegetables)
//      128..191 red (tomato, berry, meat)       192..255  cream (corn, cheese)
//      Encoded with foodB(band, amount) below; decoded in chopPackageMat.
//
// One atlas per package family, per-instance UV offset picks the cell. That
// keeps 24 carton designs x unlimited brand colours at ONE draw call per batch
// instead of one geometry clone per design.

import { makeRng, rr, ri } from './kit.js';
import {
  FACE, BRANDS, VALUE_BRANDS, DESC, FLASH, BURST, NUTRI, WEIGHTS, LEGAL,
  PANEL_HEAD, TAG_DESC, SUBDESC, CLAIMS,
} from './brands.js';

// --- atlas grid descriptors (store.js reads these) --------------------------
// ROUND 3: every cell is 25-33% larger. At 3x zoom on a package a metre from
// camera the round-2 cells ran out of texels below the wordmark, and a legible
// logo over an illegible panel reads as MORE artificial than a blank one.
export const ATLAS = {
  carton: { cols: 6, rows: 4, cw: 340, ch: 420, wrap: 0.150 },
  pouch:  { cols: 4, rows: 2, cw: 320, ch: 320, wrap: 0.135 },
  can:    { cols: 4, rows: 2, cw: 320, ch: 240, wrap: 0 },
  bottle: { cols: 4, rows: 2, cw: 256, ch: 340, wrap: 0 },
};
// Shelf-tag atlas cells 13-15 are ORPHANS: an empty channel, a bleached blank
// and a torn remnant. products.js asks for one wherever it leaves a bare bay.
export const TAG_SKU = 13, TAG_COLS = 4, TAG_ROWS = 4;

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
const ink = (r, g, b = 0) => `rgb(${r | 0},${g | 0},${b | 0})`;
const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const pk = (rng, a) => a[Math.floor(rng() * a.length) % a.length];

// Pack a food-palette band + strength into one byte for the mask's b channel.
const foodB = (band, amt) => band * 64 + Math.round(Math.min(0.97, Math.max(0.05, amt)) * 62);

// Which palette a product's own words imply. Canned peas coming out green and
// tomato paste coming out red is most of what stops a shelf reading as one
// repeated brown blob.
function foodBand(desc) {
  const d = String(desc).toUpperCase();
  if (/GREEN|PEAS|BROCCOLI|SPINACH|BEAN|PICKLE|LIME|HERB|VEGET|STIR FRY|FLORET/.test(d)) return 1;
  if (/TOMATO|SAUCE|SALSA|BERRY|CHERRY|BEEF|PUNCH|CHILI|MARINARA|STRAWBER|PIZZA|PEPPERONI|GRAPE|KIDNEY/.test(d)) return 2;
  if (/CORN|CHEESE|LEMON|BUTTER|VANILLA|CREAM|MILK|BANANA|HONEY|PEACH|ORANGE|MANDARIN|POTATO|FRIES|RICE|PASTA|MACARONI|NOODLE/.test(d)) return 3;
  return 0;
}

// ---------------------------------------------------------------------------
// TYPE HELPERS
// Grocery wordmarks are almost always squeezed to fill the panel width, so
// horizontal-scale-to-fit is the correct behaviour, not a smaller point size.
function fitText(g, txt, cx, y, maxW, px, face, weight = '900', align = 'center') {
  g.font = `${weight} ${px}px ${face}`;
  const w = g.measureText(txt).width || 1;
  const sx = Math.min(1, maxW / w);
  g.save();
  g.translate(cx, y);
  g.scale(sx, 1);
  g.textAlign = align;
  g.fillText(txt, 0, 0);
  g.restore();
  return Math.min(w, maxW);
}

// Tiny legal type. Individually unreadable by design — the job is to make the
// dense luminance noise a photographed package has and a flat fill does not.
function legalBlock(g, x, y, w, n, px, rng, style) {
  g.textAlign = 'left';
  g.font = `400 ${px}px ${FACE.grot}`;
  for (let i = 0; i < n; i++) {
    const line = LEGAL[(i + (rng() * 12 | 0)) % LEGAL.length];
    g.fillStyle = style;
    g.save();
    g.translate(x, y + i * (px + 1.1));
    // squeeze the sentence into the column so it terminates at a ragged edge
    const cut = line.slice(0, 30 + (rng() * 34 | 0));
    const mw = g.measureText(cut).width || 1;
    g.scale(Math.min(1, w / mw), 1);
    g.fillText(cut, 0, 0);
    g.restore();
  }
}

function barcode(g, x, y, w, h, rng) {
  g.fillStyle = ink(6, 252);
  g.fillRect(x, y, w, h);
  g.fillStyle = ink(6, 14);
  let bx = x + 2.5;
  while (bx < x + w - 3) {
    const bw = rr(rng, 0.9, 2.6);
    if (rng() < 0.72) g.fillRect(bx, y + 1.5, bw, h - 7);
    bx += bw + rr(rng, 0.8, 2.0);
  }
  g.font = `400 ${Math.max(3.5, h * 0.22)}px ${FACE.mono}`;
  g.textAlign = 'center';
  g.fillStyle = ink(6, 20);
  g.fillText('0 74100 21886 3', x + w / 2, y + h - 1.2);
}

// The black-ruled panel. Almost every package in a US store carries one and
// its hard horizontal rules read at surprisingly small sizes.
function nutriPanel(g, x, y, w, h, rng) {
  g.fillStyle = ink(8, 253);
  g.fillRect(x, y, w, h);
  g.strokeStyle = ink(8, 26); g.lineWidth = 1.4;
  g.strokeRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4);
  g.textAlign = 'left';
  g.fillStyle = ink(8, 22);
  fitText(g, pk(rng, PANEL_HEAD), x + 3, y + h * 0.20, w - 6, h * 0.20, FACE.fat, '900', 'left');
  g.fillRect(x + 3, y + h * 0.25, w - 6, 2.2);
  const rows = Math.max(3, Math.floor(h / 7));
  g.font = `400 ${Math.max(3.4, h * 0.085)}px ${FACE.grot}`;
  for (let i = 0; i < rows; i++) {
    const ry = y + h * 0.36 + i * ((h * 0.60) / rows);
    g.fillStyle = ink(8, 30);
    g.fillText(['Total Fat 2g', 'Sodium 210mg', 'Total Carb 24g', 'Protein 3g',
      'Dietary Fiber 3g', 'Sugars 9g', 'Calcium 10%', 'Iron 45%'][i % 8], x + 3, ry);
    g.fillStyle = ink(8, 60);
    g.fillRect(x + 3, ry + 1.4, w - 6, 0.7);
  }
}

// Serving-suggestion photography. Not one flat ellipse — a set of distinct
// presentation modes, because 24 cartons that all carry the same plate of
// brown blobs is the round-1 repetition failure wearing a better hat.
// Tinted through the b channel so the food does NOT take the brand colour.
function foodPhoto(g, cx, cy, rw, rh, rng, mode, band) {
  const piece = (v) => ink(200, v, foodB(band, 0.92));
  const alt = (band + 2) % 4;                  // a contrasting garnish palette
  const other = (v) => ink(200, v, foodB(alt, 0.85));

  if (mode === 'window') {                     // bordered photo panel
    g.fillStyle = ink(6, 250); g.fillRect(cx - rw * 1.12, cy - rh * 1.12, rw * 2.24, rh * 2.24);
    g.fillStyle = ink(120, 120, foodB(band, 0.75)); g.fillRect(cx - rw, cy - rh, rw * 2, rh * 2);
  } else if (mode === 'plate') {
    g.fillStyle = ink(30, 236, 0);
    g.beginPath(); g.ellipse(cx, cy + rh * 0.30, rw * 1.02, rh * 0.52, 0, 0, 6.29); g.fill();
    g.fillStyle = ink(24, 200, 0);
    g.beginPath(); g.ellipse(cx, cy + rh * 0.34, rw * 0.80, rh * 0.38, 0, 0, 6.29); g.fill();
  } else if (mode === 'bowl') {
    g.fillStyle = ink(190, 190, 0);
    g.beginPath(); g.ellipse(cx, cy + rh * 0.16, rw * 0.98, rh * 0.86, 0, 0, 3.15); g.fill();
    g.fillStyle = ink(210, 245, 0);
    g.beginPath(); g.ellipse(cx, cy - rh * 0.18, rw * 0.98, rh * 0.30, 0, 0, 6.29); g.fill();
  }

  // the heap itself
  if (mode !== 'window') {
    g.fillStyle = ink(90, 175, foodB(band, 0.70));
    g.beginPath();
    if (mode === 'stack') g.rect(cx - rw * 0.72, cy - rh * 0.75, rw * 1.44, rh * 1.5);
    else g.ellipse(cx, cy, rw * 0.86, rh * 0.72, 0, 0, 6.29);
    g.fill();
  }

  if (mode === 'stack') {
    // wafers / crackers / slices seen edge-on: hard parallel rules
    const n = 5 + (rng() * 4 | 0);
    for (let i = 0; i < n; i++) {
      const y = cy - rh * 0.70 + i * (rh * 1.4 / n);
      g.fillStyle = piece(rr(rng, 150, 240) | 0);
      g.fillRect(cx - rw * (0.60 + rng() * 0.14), y, rw * 1.3, rh * 1.4 / n * 0.66);
      g.fillStyle = ink(40, 40, foodB(band, 0.45));
      g.fillRect(cx - rw * 0.60, y + rh * 1.4 / n * 0.66, rw * 1.3, rh * 0.035);
    }
  } else {
    const n = mode === 'window' ? 34 : 26;
    for (let i = 0; i < n; i++) {
      const a2 = rng() * 6.29, r = Math.sqrt(rng());
      const px = cx + Math.cos(a2) * rw * (mode === 'window' ? 0.9 : 0.74) * r;
      const py = cy + Math.sin(a2) * rh * (mode === 'window' ? 0.9 : 0.60) * r;
      const sz = rr(rng, rw * 0.09, rw * 0.22);
      g.fillStyle = rng() < 0.22 ? other(rr(rng, 120, 230) | 0) : piece(rr(rng, 110, 235) | 0);
      g.beginPath();
      if (rng() < 0.25) g.rect(px - sz, py - sz * 0.7, sz * 2, sz * 1.4);
      else g.ellipse(px, py, sz, sz * rr(rng, 0.62, 0.95), rng() * 3.1, 0, 6.29);
      g.fill();
      if (rng() < 0.45) {                      // specular pip
        g.fillStyle = ink(60, 252, foodB(band, 0.16));
        g.beginPath();
        g.ellipse(px - sz * 0.3, py - sz * 0.34, sz * 0.26, sz * 0.18, 0, 0, 6.29);
        g.fill();
      }
    }
  }
  // garnish
  if (mode !== 'stack' && rng() < 0.7) {
    g.fillStyle = ink(60, 150, foodB(1, 0.85));   // green garnish
    for (let i = 0; i < 3; i++) {
      const a2 = rng() * 6.29;
      g.beginPath();
      g.ellipse(cx + Math.cos(a2) * rw * 0.5, cy + Math.sin(a2) * rh * 0.4,
        rw * 0.13, rh * 0.07, a2, 0, 6.29);
      g.fill();
    }
  }
}

// Satin varnish across the top third. Cartons are coated stock; without this
// they read as matte paper, which nothing in a supermarket is.
function varnish(g, x, y, w, h) {
  const s = g.createLinearGradient(0, y, 0, y + h);
  s.addColorStop(0, 'rgba(255,255,255,0.00)');
  s.addColorStop(0.42, 'rgba(255,255,255,0.30)');
  s.addColorStop(0.62, 'rgba(255,255,255,0.10)');
  s.addColorStop(1, 'rgba(255,255,255,0.00)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = s; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'source-over';
}

function edgeShade(g, x, y, w, h, strength = 0.38) {
  const e = g.createLinearGradient(x, 0, x + w, 0);
  e.addColorStop(0, `rgba(0,0,0,${strength})`);
  e.addColorStop(0.09, 'rgba(0,0,0,0)');
  e.addColorStop(0.90, 'rgba(0,0,0,0)');
  e.addColorStop(1, `rgba(0,0,0,${strength + 0.06})`);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = e; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'source-over';
}

// A hard vertical specular band cut straight into the MASK channels.
// ROUND-3 BUG FOUND: round 2 drew every sheen as white under 'multiply', and
// multiplying by white is a no-op — so cans, bottles and jugs came out
// perfectly matte no matter what the gradient said. A real highlight does two
// things at once: it DESATURATES toward the light (drop the r = brand-amount
// channel) and it BRIGHTENS (raise the g = print-brightness channel).
function glint(g, W, H, cx, halfW, y0, y1, kill, add) {
  const mk = (fn) => {
    const gr = g.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    gr.addColorStop(0.00, fn(0));
    gr.addColorStop(0.30, fn(0.35));
    gr.addColorStop(0.50, fn(1));
    gr.addColorStop(0.68, fn(0.30));
    gr.addColorStop(1.00, fn(0));
    return gr;
  };
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = mk((a) => `rgba(${kill},255,255,${a})`);
  g.fillRect(cx - halfW, y0, halfW * 2, y1 - y0);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = mk((a) => `rgba(0,${add},0,${a})`);
  g.fillRect(cx - halfW, y0, halfW * 2, y1 - y0);
  g.globalCompositeOperation = 'source-over';
}

function maskTex(THREE, canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

// ---------------------------------------------------------------------------
// CARTON ATLAS — 24 designs. Three families so a shelf has real tonal spread:
//   0..9   white stock, brand-colour header  (crackers, baking, cookies)
//   10..17 full-bleed brand colour, white wordmark plate  (cereal, detergent)
//   18..23 dark rich stock, big photo  (coffee, premium, frozen)
export function cartonAtlas(THREE, deptKeys) {
  const A = ATLAS.carton;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xC4A701);
  const M = A.cw * A.wrap;

  for (let i = 0; i < A.cols * A.rows; i++) {
    g.save();
    g.translate((i % A.cols) * A.cw, Math.floor(i / A.cols) * A.ch);
    g.beginPath(); g.rect(0, 0, A.cw, A.ch); g.clip();
    cartonDesign(g, i, A.cw, A.ch, M, rng, deptKeys);
    g.restore();
  }
  return maskTex(THREE, c);
}


// PRODUCT HERO — what goes where the food photo goes on non-food packaging.
// A full-strength brand field with the bottle reversed out of it in white, a
// burst and a couple of sparkles. Detergent and shampoo cartons are 60-80% one
// saturated colour with the product in white on top; that ratio is the whole
// reason reference/store_02's cleaning aisle measures as the bluest frame in
// the set, and it is exactly what round 4 was missing.
function heroPanel(g, cx, cy, rw, rh, rng) {
  g.fillStyle = ink(255, 230);                       // solid brand field
  g.fillRect(cx - rw * 1.05, cy - rh * 1.05, rw * 2.1, rh * 2.1);
  g.fillStyle = ink(255, 170);                       // darker brand shadow half
  g.fillRect(cx - rw * 1.05, cy + rh * 0.25, rw * 2.1, rh * 0.80);
  // the product, in white, three-quarter height
  const bw = rw * 0.52, bh = rh * 1.32;
  g.fillStyle = ink(10, 252);
  g.beginPath();
  g.moveTo(cx - bw * 0.5, cy + bh * 0.44);
  g.lineTo(cx - bw * 0.5, cy - bh * 0.10);
  g.quadraticCurveTo(cx - bw * 0.42, cy - bh * 0.30, cx - bw * 0.16, cy - bh * 0.34);
  g.lineTo(cx - bw * 0.16, cy - bh * 0.48);
  g.lineTo(cx + bw * 0.16, cy - bh * 0.48);
  g.lineTo(cx + bw * 0.16, cy - bh * 0.34);
  g.quadraticCurveTo(cx + bw * 0.42, cy - bh * 0.30, cx + bw * 0.5, cy - bh * 0.10);
  g.lineTo(cx + bw * 0.5, cy + bh * 0.44);
  g.closePath(); g.fill();
  g.fillStyle = ink(255, 120);                       // the label ON the bottle
  g.fillRect(cx - bw * 0.42, cy - bh * 0.02, bw * 0.84, bh * 0.30);
  g.fillStyle = ink(10, 240);                        // cap
  g.fillRect(cx - bw * 0.20, cy - bh * 0.56, bw * 0.40, bh * 0.10);
  // sparkles — the universal "this makes things clean" device
  g.fillStyle = ink(6, 254);
  for (let k = 0; k < 4; k++) {
    const a = rng() * 6.29, r = rw * rr(rng, 0.55, 0.95);
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r * 0.8;
    const sz = rw * rr(rng, 0.07, 0.14);
    g.beginPath();
    g.moveTo(px, py - sz); g.lineTo(px + sz * 0.22, py - sz * 0.22);
    g.lineTo(px + sz, py); g.lineTo(px + sz * 0.22, py + sz * 0.22);
    g.lineTo(px, py + sz); g.lineTo(px - sz * 0.22, py + sz * 0.22);
    g.lineTo(px - sz, py); g.lineTo(px - sz * 0.22, py - sz * 0.22);
    g.closePath(); g.fill();
  }
}

const PHOTO_MODES = ['plate', 'bowl', 'pile', 'window', 'stack', 'plate', 'window'];

function cartonDesign(g, i, W, H, M, rng, deptKeys) {
  // fam sets the tonal family, arch sets the LAYOUT. 24 cells that share one
  // template read as one product recoloured 24 times, which is exactly the
  // repetition the blind test picked up on.
  const fam = i < 8 ? 0 : (i < 18 ? 1 : 2);
  const arch = i % 7;                       // 0..6, see the switch below
  const x0 = M, fw = W - M;
  const brand = pk(rng, i % 7 === 6 ? VALUE_BRANDS : BRANDS);
  const deptKey = deptKeys[i % deptKeys.length];
  const desc = pk(rng, DESC[deptKey] || DESC.canned);
  const flash = pk(rng, FLASH);
  const wt = pk(rng, WEIGHTS);
  const wmFace = pk(rng, [FACE.fat, FACE.fat, FACE.impact, FACE.geo, FACE.serif,
    FACE.human, FACE.slab, FACE.didone, FACE.plate, FACE.script]);
  const photoMode = PHOTO_MODES[(i * 3 + fam) % PHOTO_MODES.length];
  // ROUND 5. Cells 6 and 7 mod 8 are the CLEANING and HEALTH & BEAUTY
  // vocabularies. Round 4 put a plate of food on a bottle of bleach, which is
  // both absurd and — because the food palette is warm — most of why the one
  // aisle that should have measured like reference/store_02 (15.4% of frame in
  // the blue band) came out at 1.6%. Non-food packaging gets a hero device: a
  // full-bleed brand field with the product itself reversed out in white.
  const nonFood = (i % 8) >= 6;
  const noPhoto = arch === 3 || nonFood;    // flour / sugar / detergent look
  g.textBaseline = 'alphabetic';

  // ---- ground -------------------------------------------------------------
  if (fam === 0) {
    g.fillStyle = ink(14, 250); g.fillRect(0, 0, W, H);            // white stock
    g.fillStyle = ink(255, 232); g.fillRect(0, 0, W, H * 0.135);
    g.fillStyle = ink(255, 150); g.fillRect(0, H * 0.135, W, H * 0.012);
    g.fillStyle = ink(255, 214); g.fillRect(0, H - H * 0.075, W, H * 0.075);
  } else if (fam === 1) {
    g.fillStyle = ink(255, 224); g.fillRect(0, 0, W, H);           // full bleed
    g.fillStyle = ink(255, 135); g.fillRect(0, 0, W, H * 0.10);
    g.fillStyle = ink(255, 160); g.fillRect(0, H - H * 0.10, W, H * 0.10);
  } else {
    g.fillStyle = ink(255, 92); g.fillRect(0, 0, W, H);            // dark rich
    g.fillStyle = ink(255, 58); g.fillRect(0, 0, W, H * 0.09);
  }

  // decorative ground pattern on some designs — stripes, checks, a burst
  if (arch === 3 || arch === 6) {
    g.save(); g.globalAlpha = 0.5;
    if (rng() < 0.5) {
      for (let k = -H; k < W + H; k += 14) {
        g.fillStyle = ink(255, fam === 0 ? 225 : 130);
        g.save(); g.translate(k, 0); g.rotate(0.5); g.fillRect(0, -H, 6, H * 3); g.restore();
      }
    } else {
      for (let k = 0; k < H; k += 22) {
        g.fillStyle = ink(255, fam === 0 ? 228 : 140);
        g.fillRect(0, k, W, 9);
      }
    }
    g.restore();
  }

  // ---- LAYOUT -------------------------------------------------------------
  let wmY, wmPx, wmCx, wmMaxW, photoX, photoY, photoR, plate = true;
  switch (arch) {
    case 0:  // header wordmark, photo centred below
      wmY = H * 0.255; wmPx = H * 0.115; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.88;
      photoX = x0 + fw * 0.52; photoY = H * 0.63; photoR = fw * 0.31; break;
    case 1:  // big photo bottom 55%, wordmark high on colour
      wmY = H * 0.20; wmPx = H * 0.125; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.9;
      photoX = x0 + fw * 0.5; photoY = H * 0.70; photoR = fw * 0.44; plate = false; break;
    case 2:  // wordmark in an oval, photo behind it
      wmY = H * 0.32; wmPx = H * 0.105; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.72;
      photoX = x0 + fw * 0.55; photoY = H * 0.60; photoR = fw * 0.36; break;
    case 3:  // no photo: type-led, big ingredient panel
      wmY = H * 0.30; wmPx = H * 0.155; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.92;
      photoX = 0; photoY = 0; photoR = 0; break;
    case 4:  // wordmark left-aligned, photo to the right
      wmY = H * 0.24; wmPx = H * 0.10; wmCx = x0 + fw * 0.06; wmMaxW = fw * 0.62;
      photoX = x0 + fw * 0.68; photoY = H * 0.58; photoR = fw * 0.28; break;
    case 5:  // narrow tall: stacked wordmark over a small window photo
      wmY = H * 0.22; wmPx = H * 0.13; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.94;
      photoX = x0 + fw * 0.5; photoY = H * 0.55; photoR = fw * 0.30; break;
    default: // 6: banded, wordmark low over a wide photo
      wmY = H * 0.62; wmPx = H * 0.12; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.86;
      photoX = x0 + fw * 0.5; photoY = H * 0.34; photoR = fw * 0.38; break;
  }

  // ---- serving-suggestion photograph (drawn under the type) ---------------
  if (!noPhoto) {
    foodPhoto(g, photoX, photoY, photoR, photoR * (arch === 1 ? 0.62 : 0.80),
      rng, photoMode, foodBand(desc));
  } else if (nonFood && photoR > 0) {
    heroPanel(g, photoX, photoY, photoR, photoR * 0.86, rng);
  }

  // ---- wordmark, roughly a quarter of the face height ---------------------
  if (plate && arch !== 4) {                 // white plate behind the mark
    g.fillStyle = fam === 1 ? ink(14, 250) : ink(255, fam === 2 ? 210 : 245);
    if (arch === 2) {
      g.beginPath();
      g.ellipse(wmCx, wmY - wmPx * 0.30, fw * 0.46, wmPx * 0.86, 0, 0, 6.29);
      g.fill();
    } else if (fam !== 0) {
      g.fillRect(x0 + fw * 0.04, wmY - wmPx * 0.92, fw * 0.92, wmPx * 1.30);
    }
  }
  g.fillStyle = fam === 0 ? ink(255, 120) : (fam === 1 ? ink(255, 150) : ink(10, 250));
  if (arch === 2 || (fam === 1 && plate)) g.fillStyle = ink(255, 130);
  fitText(g, brand, wmCx, wmY, wmMaxW, wmPx, wmFace, '900', arch === 4 ? 'left' : 'center');
  if (rng() < 0.5) {
    g.fillStyle = fam === 2 ? ink(20, 240) : ink(255, 140);
    g.fillRect(wmCx - (arch === 4 ? 0 : wmMaxW / 2), wmY + wmPx * 0.20, wmMaxW * 0.9, H * 0.006);
  }

  // ---- product descriptor -------------------------------------------------
  g.fillStyle = fam === 2 ? ink(30, 245) : ink(12, 40);
  fitText(g, desc, wmCx, wmY + H * 0.070, wmMaxW * 0.96, H * 0.045,
    pk(rng, [FACE.grot, FACE.human, FACE.geo]), '700', arch === 4 ? 'left' : 'center');
  // sub-descriptor: the second line that has to survive a 3x zoom
  g.fillStyle = fam === 2 ? ink(40, 200) : ink(14, 62);
  fitText(g, pk(rng, SUBDESC), wmCx, wmY + H * 0.111, wmMaxW * 0.90, H * 0.030,
    FACE.grot, '600', arch === 4 ? 'left' : 'center');

  // ---- flavour flash ribbon ----------------------------------------------
  const flY = arch === 6 ? H * 0.755 : (arch === 1 ? H * 0.395 : H * 0.455);
  g.fillStyle = ink(255, fam === 2 ? 210 : 120);
  g.fillRect(0, flY, W, H * 0.052);
  g.fillStyle = ink(fam === 2 ? 255 : 10, fam === 2 ? 40 : 250);
  fitText(g, flash, W * 0.5 + M * 0.35, flY + H * 0.040, fw * 0.70, H * 0.038,
    FACE.fat, '900');

  // ---- burst -------------------------------------------------------------
  if (rng() < 0.42) {
    const bx = x0 + fw * (rng() < 0.5 ? 0.19 : 0.80), by = H * 0.545;
    g.fillStyle = ink(255, 235);
    g.beginPath();
    for (let k = 0; k < 20; k++) {
      const a2 = (k / 20) * 6.283, r = (k % 2 ? 0.66 : 1.0) * fw * 0.115;
      g[k ? 'lineTo' : 'moveTo'](bx + Math.cos(a2) * r, by + Math.sin(a2) * r * 0.9);
    }
    g.closePath(); g.fill();
    g.fillStyle = ink(20, 30);
    fitText(g, pk(rng, BURST), bx, by + H * 0.010, fw * 0.17, H * 0.030, FACE.fat, '900');
  }

  // ---- legal type + weight + barcode + nutrition flash --------------------
  // Type-led designs give the panel far more room, the way a flour or a
  // detergent carton does.
  // third readable band: a claim line above the weight, set in caps at a size
  // that survives near-field zoom
  g.fillStyle = fam === 2 ? ink(50, 210) : ink(14, 70);
  fitText(g, pk(rng, CLAIMS), x0 + fw * 0.045, noPhoto ? H * 0.532 : H * 0.752,
    fw * 0.54, H * 0.026, FACE.grot, '700', 'left');
  const legN = noPhoto ? 11 : 7;
  legalBlock(g, x0 + fw * 0.045, noPhoto ? H * 0.60 : H * 0.815, fw * 0.52, legN,
    H * 0.0180, rng, fam === 2 ? ink(60, 175) : ink(16, 78));
  g.textAlign = 'left';
  g.fillStyle = fam === 2 ? ink(40, 245) : ink(12, 45);
  fitText(g, wt, x0 + fw * 0.045, noPhoto ? H * 0.565 : H * 0.785, fw * 0.50, H * 0.030,
    FACE.grot, '700', 'left');
  if (rng() < 0.82) nutriPanel(g, x0 + fw * 0.62, H * 0.700, fw * 0.34, H * 0.175, rng);
  barcode(g, x0 + fw * 0.62, H * 0.892, fw * 0.34, H * 0.082, rng);

  if (rng() < 0.5) {                         // circular nutrition claim
    const nx = x0 + fw * 0.855, ny = H * 0.075, nr = fw * 0.095;
    g.fillStyle = fam === 1 ? ink(14, 250) : ink(255, 175);
    g.beginPath(); g.arc(nx, ny, nr, 0, 6.29); g.fill();
    const nu = pk(rng, NUTRI);
    g.fillStyle = fam === 1 ? ink(255, 130) : ink(12, 250);
    fitText(g, nu[0], nx, ny + nr * 0.10, nr * 1.6, nr * 0.78, FACE.fat, '900');
    fitText(g, nu[1], nx, ny + nr * 0.62, nr * 1.7, nr * 0.34, FACE.grot, '700');
  }

  // ---- plain wrap column: sides / top / bottom of every carton ------------
  g.fillStyle = fam === 0 ? ink(14, 236) : (fam === 1 ? ink(255, 178) : ink(255, 84));
  g.fillRect(0, 0, M, H);
  g.fillStyle = ink(255, fam === 2 ? 54 : 150);
  g.fillRect(0, 0, M, H * (fam === 1 ? 0.10 : 0.135));
  g.fillStyle = ink(255, fam === 2 ? 60 : 165);
  g.fillRect(0, H - H * 0.085, M, H * 0.085);
  g.save();
  g.translate(M * 0.52, H * 0.52); g.rotate(-Math.PI / 2);
  g.fillStyle = fam === 2 ? ink(30, 220) : ink(16, 70);
  fitText(g, brand + '  ' + desc, 0, 0, H * 0.55, M * 0.30, FACE.grot, '700');
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(M - 3, 0, 3, H);

  varnish(g, 0, 0, W, H * 0.42);
  edgeShade(g, M, 0, W - M, H, 0.34);
}

// ---------------------------------------------------------------------------
// POUCH ATLAS — bags of chips, candy, frozen veg. Film, not board: crinkle
// highlights, a big centred wordmark and a hard specular streak.
export function pouchAtlas(THREE, deptKeys) {
  const A = ATLAS.pouch;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xB0FFE);
  const M = A.cw * A.wrap;

  for (let i = 0; i < A.cols * A.rows; i++) {
    const W = A.cw, H = A.ch;
    g.save();
    g.translate((i % A.cols) * W, Math.floor(i / A.cols) * H);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.textBaseline = 'alphabetic';

    const dark = i % 3 === 2;
    g.fillStyle = dark ? ink(255, 120) : ink(255, 205);
    g.fillRect(0, 0, W, H);
    // crinkle — film never lies flat
    for (let k = 0; k < 190; k++) {
      g.strokeStyle = rgba(255, 255, 255, rr(rng, 0.04, 0.30));
      g.lineWidth = rr(rng, 0.5, 2.6);
      g.beginPath();
      let x = rng() * W, y = rng() * H;
      g.moveTo(x, y);
      for (let q = 0; q < 3; q++) g.lineTo(x += rr(rng, -20, 20), y += rr(rng, -20, 20));
      g.stroke();
    }
    // sealed crimp top and bottom
    g.fillStyle = ink(255, dark ? 78 : 150);
    g.fillRect(0, 0, W, H * 0.085); g.fillRect(0, H - H * 0.10, W, H * 0.10);
    for (let k = 0; k < W; k += 3) {
      g.fillStyle = rgba(255, 255, 255, 0.16);
      g.fillRect(k, 0, 1.3, H * 0.085);
      g.fillRect(k, H - H * 0.10, 1.3, H * 0.10);
    }

    const pdesc = pk(rng, DESC[deptKeys[i % deptKeys.length]] || DESC.snacks);
    // no plate of food on a bag of cotton pads — see cartonDesign's nonFood
    if ((i % 8) >= 6) {
      heroPanel(g, M + (W - M) * 0.52, H * 0.63, (W - M) * 0.30, H * 0.22, rng);
    } else {
      foodPhoto(g, M + (W - M) * 0.52, H * 0.66, (W - M) * 0.34, H * 0.21, rng,
        PHOTO_MODES[(i * 5) % PHOTO_MODES.length], foodBand(pdesc));
    }

    const brand = pk(rng, BRANDS);
    g.fillStyle = ink(14, 250);
    g.fillRect(M + 3, H * 0.19, W - M - 8, H * 0.155);
    g.fillStyle = ink(255, 130);
    fitText(g, brand, M + (W - M) * 0.5, H * 0.305, (W - M) * 0.86, H * 0.125,
      pk(rng, [FACE.fat, FACE.impact, FACE.geo, FACE.script]), '900');
    g.fillStyle = dark ? ink(20, 245) : ink(12, 40);
    fitText(g, pdesc, M + (W - M) * 0.5, H * 0.395, (W - M) * 0.84, H * 0.055,
      FACE.grot, '800');
    g.fillStyle = ink(255, dark ? 225 : 118);
    g.fillRect(0, H * 0.425, W, H * 0.052);
    g.fillStyle = ink(dark ? 255 : 12, dark ? 45 : 250);
    fitText(g, pk(rng, FLASH), M + (W - M) * 0.5, H * 0.466, (W - M) * 0.7,
      H * 0.040, FACE.fat, '900');

    legalBlock(g, M + 4, H * 0.845, (W - M) * 0.5, 4, H * 0.019, rng, ink(20, 92));
    g.fillStyle = ink(14, 245);
    fitText(g, pk(rng, WEIGHTS), M + 4, H * 0.825, (W - M) * 0.46, H * 0.036,
      FACE.grot, '700', 'left');
    barcode(g, M + (W - M) * 0.66, H * 0.845, (W - M) * 0.30, H * 0.075, rng);

    // hard specular streaks — this is how a viewer instantly reads "plastic".
    // Only the GREEN channel is raised: adding white here (round 2) also
    // pushed r and b, which silently shifted the brand amount and the food
    // palette band of every bag in the store.
    for (const [ox, ow, amt, rot] of [[0.30, 0.055, 150, -0.34], [0.66, 0.030, 90, 0.28]]) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(W * ox, H * 0.5); g.rotate(rot);
      const st = g.createLinearGradient(-W * ow, 0, W * ow, 0);
      st.addColorStop(0, 'rgba(0,0,0,0)');
      st.addColorStop(0.5, `rgba(0,${amt},0,1)`);
      st.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = st; g.fillRect(-W * ow, -H, W * ow * 2, H * 2);
      g.restore();
    }
    // scattered blown highlights where the film creases — the noise-driven
    // glint that separates a wrapped pack from a printed carton
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 46; k++) {
      const gx = rng() * W, gy = rr(rng, H * 0.06, H * 0.94);
      const gr2 = rr(rng, 2.5, 11);
      const rad = g.createRadialGradient(gx, gy, 0, gx, gy, gr2);
      rad.addColorStop(0, `rgba(0,${ri(rng, 80, 190)},0,1)`);
      rad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rad;
      g.fillRect(gx - gr2, gy - gr2, gr2 * 2, gr2 * 2);
    }
    g.globalCompositeOperation = 'source-over';

    g.fillStyle = dark ? ink(255, 108) : ink(255, 190);
    g.fillRect(0, 0, M, H);
    g.fillStyle = ink(255, dark ? 78 : 150);
    g.fillRect(0, 0, M, H * 0.085); g.fillRect(0, H - H * 0.10, M, H * 0.10);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(M - 3, 0, 3, H);
    edgeShade(g, M, 0, W - M, H, 0.30);
    g.restore();
  }
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// CAN ATLAS — one full label per cell. unitCellUV folds the cylinder's u so
// the whole label lands on the front-facing half; the hidden back takes the
// squashed edge. That beats wrapping, which only ever showed a fragment.
export function canAtlas(THREE, deptKeys) {
  const A = ATLAS.can;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xCA5);
  const REP = 1;

  for (let i = 0; i < A.cols * A.rows; i++) {
    const W = A.cw, H = A.ch, seg = W / REP;
    g.save();
    g.translate((i % A.cols) * W, Math.floor(i / A.cols) * H);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.textBaseline = 'alphabetic';

    // ROUND 3: half the cells were bare white stock carrying two thin brand
    // stripes, and after the cylindrical shading multiply they rendered as pale
    // grey tubes with no colour anywhere. Real canned goods are dominated by a
    // full-width brand field. Pale cells keep a white label PANEL but sit it on
    // a coloured ground, top and bottom.
    const pale = i % 3 !== 2;
    g.fillStyle = ink(255, pale ? 175 : 150);
    g.fillRect(0, 0, W, H);
    if (pale) {                                 // white label panel in the middle
      g.fillStyle = ink(18, 250);
      g.fillRect(0, H * 0.255, W, H * 0.44);
    }
    // steel lid and base rim — mapped to the cylinder caps too
    g.fillStyle = ink(8, 150); g.fillRect(0, 0, W, H * 0.085);
    g.fillStyle = ink(8, 96); g.fillRect(0, H * 0.085, W, H * 0.022);
    g.fillStyle = ink(8, 120); g.fillRect(0, H - H * 0.075, W, H * 0.075);
    // brand bands
    g.fillStyle = ink(255, pale ? 110 : 105);
    g.fillRect(0, H * 0.135, W, H * 0.125);
    g.fillStyle = ink(255, pale ? 240 : 200);
    g.fillRect(0, H * 0.245, W, H * 0.014);
    g.fillStyle = ink(255, pale ? 120 : 130);
    g.fillRect(0, H * 0.695, W, H * 0.085);

    const brand = pk(rng, BRANDS);
    const desc = pk(rng, DESC[deptKeys[i % deptKeys.length]] || DESC.canned);
    const face = pk(rng, [FACE.fat, FACE.serif, FACE.didone, FACE.plate, FACE.geo]);
    for (let r = 0; r < REP; r++) {
      const cx = seg * (r + 0.5);
      g.fillStyle = ink(255, pale ? 245 : 250);
      fitText(g, brand, cx, H * 0.225, seg * 0.90, H * 0.095, face, '900');
      g.fillStyle = pale ? ink(20, 40) : ink(20, 245);
      fitText(g, desc, cx, H * 0.325, seg * 0.92, H * 0.058, FACE.grot, '700');
      // the food picture that fills the middle of nearly every can label
      foodPhoto(g, cx, H * 0.50, seg * 0.34, H * 0.115, rng,
        PHOTO_MODES[(i * 2 + 1) % PHOTO_MODES.length], foodBand(desc));
      g.fillStyle = ink(255, pale ? 246 : 240);
      fitText(g, pk(rng, FLASH), cx, H * 0.762, seg * 0.80, H * 0.052, FACE.fat, '900');
      legalBlock(g, cx - seg * 0.44, H * 0.815, seg * 0.86, 3, H * 0.030, rng,
        pale ? ink(18, 85) : ink(40, 150));
    }
    barcode(g, seg * 0.10, H * 0.60, seg * 0.55, H * 0.075, rng);

    // cylindrical shading, then two REAL specular bands on the tinplate
    const e = g.createLinearGradient(0, 0, W, 0);
    e.addColorStop(0.00, 'rgba(0,0,0,0.52)');
    e.addColorStop(0.18, 'rgba(0,0,0,0.06)');
    e.addColorStop(0.50, 'rgba(0,0,0,0.00)');
    e.addColorStop(0.82, 'rgba(0,0,0,0.18)');
    e.addColorStop(1.00, 'rgba(0,0,0,0.52)');
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = e; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    glint(g, W, H, W * 0.30, W * 0.095, 0, H, 74, 118);
    glint(g, W, H, W * 0.735, W * 0.045, 0, H, 165, 52);
    g.restore();
  }
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// BOTTLE ATLAS — shrink-film label around a lathe, front-folded like the can.
// Elongated white streaks are doing most of the "this is PET" work.
export function bottleAtlas(THREE, deptKeys) {
  const A = ATLAS.bottle;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xB07);
  const REP = 1;

  for (let i = 0; i < A.cols * A.rows; i++) {
    const W = A.cw, H = A.ch, seg = W / REP;
    g.save();
    g.translate((i % A.cols) * W, Math.floor(i / A.cols) * H);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.textBaseline = 'alphabetic';

    // v runs 0 = bottom of the lathe profile, 1 = cap
    g.fillStyle = ink(255, 225); g.fillRect(0, 0, W, H);
    g.fillStyle = ink(255, 250); g.fillRect(0, 0, W, H * 0.34);       // clear liquid below label
    g.fillStyle = ink(200, 90); g.fillRect(0, H * 0.90, W, H * 0.10); // closure
    for (let k = 0; k < W; k += 2.5) {                                // cap knurl
      g.fillStyle = rgba(0, 0, 0, 0.22); g.fillRect(k, H * 0.90, 1.1, H * 0.10);
    }
    // shrink label band
    const ly = H * 0.34, lh = H * 0.44;
    g.fillStyle = i % 2 ? ink(16, 250) : ink(255, 196);
    g.fillRect(0, ly, W, lh);
    g.fillStyle = ink(255, 130); g.fillRect(0, ly, W, lh * 0.13);
    g.fillStyle = ink(255, 130); g.fillRect(0, ly + lh * 0.87, W, lh * 0.13);

    const brand = pk(rng, BRANDS);
    const desc = pk(rng, DESC[deptKeys[i % deptKeys.length]] || DESC.soda);
    const face = pk(rng, [FACE.fat, FACE.script, FACE.geo, FACE.impact]);
    for (let r = 0; r < REP; r++) {
      const cx = seg * (r + 0.5);
      g.fillStyle = i % 2 ? ink(255, 140) : ink(14, 250);
      fitText(g, brand, cx, ly + lh * 0.44, seg * 0.90, lh * 0.30, face, '900');
      g.fillStyle = i % 2 ? ink(18, 45) : ink(18, 240);
      fitText(g, desc, cx, ly + lh * 0.62, seg * 0.90, lh * 0.15, FACE.grot, '800');
      g.fillStyle = i % 2 ? ink(255, 150) : ink(20, 235);
      fitText(g, pk(rng, FLASH), cx, ly + lh * 0.78, seg * 0.72, lh * 0.12,
        FACE.fat, '900');
      legalBlock(g, cx - seg * 0.42, ly + lh * 0.90, seg * 0.84, 2, lh * 0.055, rng,
        i % 2 ? ink(18, 90) : ink(40, 160));
    }
    barcode(g, seg * 0.12, ly + lh * 0.03, seg * 0.5, lh * 0.10, rng);

    // curvature, then two hard elongated streaks — this is how a viewer reads
    // "PET bottle" in a single glance, and it is the mirror strip you see down
    // every bleach jug in the reference photography
    const e = g.createLinearGradient(0, 0, W, 0);
    e.addColorStop(0.00, 'rgba(0,0,0,0.70)');
    e.addColorStop(0.14, 'rgba(0,0,0,0.06)');
    e.addColorStop(0.55, 'rgba(0,0,0,0.05)');
    e.addColorStop(0.86, 'rgba(0,0,0,0.30)');
    e.addColorStop(1.00, 'rgba(0,0,0,0.70)');
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = e; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    glint(g, W, H, W * 0.245, W * 0.085, 0, H, 46, 150);
    glint(g, W, H, W * 0.700, W * 0.050, 0, H, 130, 78);
    g.restore();
  }
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// SHELF-TAG ATLAS — sRGB colour, not a mask. Real tags are dominated by one
// large bold price numeral, black on white, plus a UPC block and a caps
// description. store.js emits ONE tag per SKU run so the rhythm is irregular
// and matches the facing width above it, instead of a moiring ribbon.
// The three orphan states. A bare bay in a real store almost never has a bare
// RAIL — it has the holder still clipped on with nothing, or something curled
// and bleached, or half a tag someone tore off. Round 2 had no vocabulary for
// this at all because round 2 had no bare bays.
function orphanTag(g, variant, CW, CH, rng) {
  if (variant === 0) {                       // empty extruded channel
    const grd = g.createLinearGradient(0, 0, 0, CH);
    grd.addColorStop(0, '#cfc7b2'); grd.addColorStop(0.30, '#8b8371');
    grd.addColorStop(0.55, '#5d5647'); grd.addColorStop(0.80, '#9b9380');
    grd.addColorStop(1, '#6e6757');
    g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(255,252,240,0.45)'; g.fillRect(0, 1, CW, 2.5);
    g.fillStyle = 'rgba(28,25,19,0.55)'; g.fillRect(0, CH * 0.34, CW, 3);
    for (let k = 0; k < 8; k++) {            // adhesive residue and grime
      g.fillStyle = `rgba(${ri(rng, 90, 150)},${ri(rng, 84, 140)},${ri(rng, 70, 120)},${rr(rng, 0.10, 0.30)})`;
      g.fillRect(rr(rng, 0, CW), rr(rng, CH * 0.2, CH * 0.8), rr(rng, 6, 40), rr(rng, 3, 12));
    }
    return;
  }
  if (variant === 1) {                       // bleached blank, curled corner
    g.fillStyle = '#efe9d6'; g.fillRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(196,182,150,0.45)'; g.fillRect(0, 0, CW, CH * 0.16);
    g.strokeStyle = 'rgba(120,110,90,0.5)'; g.lineWidth = 2;
    g.strokeRect(1, 1, CW - 2, CH - 2);
    g.fillStyle = 'rgba(150,138,112,0.30)';
    for (let k = 0; k < 5; k++) {            // ghost of the print that faded
      g.fillRect(CW * 0.08, CH * (0.30 + k * 0.13), rr(rng, CW * 0.18, CW * 0.62), CH * 0.045);
    }
    g.fillStyle = '#ded6c0';                 // the curl
    g.beginPath();
    g.moveTo(CW, CH); g.lineTo(CW - CH * 0.42, CH); g.lineTo(CW, CH * 0.55);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(110,100,82,0.55)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(CW - CH * 0.42, CH); g.lineTo(CW, CH * 0.55); g.stroke();
    g.fillStyle = 'rgba(150,138,112,0.55)'; g.fillRect(0, 0, CW * 0.02, CH);
    return;
  }
  // torn remnant: half a tag left in the channel, ragged edge
  g.fillStyle = '#6b6454'; g.fillRect(0, 0, CW, CH);
  g.fillStyle = 'rgba(28,25,19,0.5)'; g.fillRect(0, CH * 0.34, CW, 3);
  g.fillStyle = '#fdf9ec';
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(CW * 0.40, 0);
  for (let k = 0; k <= 8; k++) {
    g.lineTo(CW * (0.40 + rr(rng, -0.05, 0.05)), CH * (k / 8));
  }
  g.lineTo(0, CH); g.closePath(); g.fill();
  g.fillStyle = '#26241f';
  g.font = `900 ${CH * 0.46}px ${FACE.fat}`;
  g.textAlign = 'left';
  g.fillText(String(ri(rng, 1, 9)), 6, CH * 0.62);
  g.fillStyle = 'rgba(120,110,90,0.5)';
  g.fillRect(0, 0, CW * 0.022, CH);
}

export function tagAtlas(THREE) {
  const COLS = TAG_COLS, ROWS = TAG_ROWS, CW = 256, CH = 128;
  const [c, g] = cv(CW * COLS, CH * ROWS);
  const rng = makeRng(0x7A65);

  for (let i = 0; i < COLS * ROWS; i++) {
    g.save();
    g.translate((i % COLS) * CW, Math.floor(i / COLS) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    g.textBaseline = 'alphabetic';

    if (i >= TAG_SKU) { orphanTag(g, i - TAG_SKU, CW, CH, rng); g.restore(); continue; }
    const sale = i % 5 === 4, yellow = i % 7 === 3;
    g.fillStyle = sale ? '#ffe418' : (yellow ? '#fff6b0' : '#ffffff');
    g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgba(70,64,54,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 1, CW - 2, CH - 2);
    if (sale) {
      g.fillStyle = '#d21f16'; g.fillRect(0, 0, CW, CH * 0.20);
      g.fillStyle = '#fffdf2'; g.textAlign = 'left';
      fitText(g, 'SALE PRICE', 5, CH * 0.16, CW * 0.5, CH * 0.15, FACE.fat, '900', 'left');
    }

    // the big numeral — this is what a shopper's eye locks onto and it is
    // the dominant mark on every tag in every reference photo
    // grocery prices cluster at 99/49/29 cents and rarely start at zero
    const dollars = rng() < 0.16 ? 0 : ri(rng, 1, 9);
    const cents = rng() < 0.55 ? pk(rng, [99, 49, 29, 79, 19, 89, 59, 39]) : ri(rng, 0, 99);
    g.fillStyle = sale ? '#1b1a17' : '#141312';
    g.textAlign = 'left';
    const py = sale ? CH * 0.66 : CH * 0.58;
    g.font = `900 ${CH * 0.46}px ${FACE.fat}`;
    const big = `${dollars}`;
    g.fillText(big, 6, py);
    const bw = g.measureText(big).width;
    g.font = `900 ${CH * 0.30}px ${FACE.fat}`;
    g.fillText(String(cents).padStart(2, '0'), 6 + bw + 3, py - CH * 0.15);
    g.font = `900 ${CH * 0.13}px ${FACE.grot}`;
    g.fillText('$', 6 + bw + 3, py);

    // caps description + unit price
    g.fillStyle = '#26241f';
    fitText(g, pk(rng, BRANDS), CW * 0.45, CH * 0.26, CW * 0.52, CH * 0.16,
      FACE.grot, '800', 'left');
    g.fillStyle = '#3b382f';
    fitText(g, pk(rng, TAG_DESC), CW * 0.45, CH * 0.42, CW * 0.50, CH * 0.125,
      FACE.grot, '600', 'left');
    g.fillStyle = '#55503f';
    fitText(g, `UNIT ${ri(rng, 1, 9)}.${ri(rng, 10, 99)} PER LB`, CW * 0.45, CH * 0.56,
      CW * 0.48, CH * 0.10, FACE.grot, '400', 'left');

    // UPC block bottom-right
    g.fillStyle = '#1a1917';
    let bx = CW * 0.50;
    while (bx < CW - 8) {
      const w = rr(rng, 0.8, 2.2);
      if (rng() < 0.7) g.fillRect(bx, CH * 0.66, w, CH * 0.20);
      bx += w + rr(rng, 0.7, 1.9);
    }
    g.font = `400 ${CH * 0.085}px ${FACE.mono}`;
    g.fillStyle = '#2a2824';
    g.fillText(`${ri(rng, 10000, 99999)} ${ri(rng, 10000, 99999)}`, CW * 0.50, CH * 0.955);
    // coloured spine down the left edge, the way ESL-style tags print
    g.fillStyle = sale ? '#b8190f' : (yellow ? '#c8a41c' : '#8d8676');
    g.fillRect(0, 0, CW * 0.022, CH);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// SHELF-CAVITY GRADIENT — a vertical ramp, near-opaque at the top where the
// shelf above casts, clearing toward the deck. Sold-out voids read as dark
// holes with this behind them instead of beige gaps.
export function cavityTex(THREE) {
  const [c, g] = cv(4, 64);
  // CanvasTexture flips Y, so canvas row 0 becomes v=1 — the top of the
  // cavity, hard up under the next shelf, which is the dark end.
  const grd = g.createLinearGradient(0, 0, 0, 64);
  // ROUND 5: neutral, not brown. See shelfAOTex — multiply layers compound
  // chroma, and this one sits on top of the pegboard in every single cavity.
  grd.addColorStop(0, 'rgba(15,15,17,0.82)');    // v=1: under the next shelf
  grd.addColorStop(0.22, 'rgba(18,18,21,0.60)');
  grd.addColorStop(0.60, 'rgba(21,21,24,0.24)');
  grd.addColorStop(1, 'rgba(21,21,24,0.00)');    // v=0: the deck
  g.fillStyle = grd; g.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// PACKAGE MATERIAL — one mask atlas + a per-instance brand colour + a
// per-instance atlas cell. See the channel contract at the top of the file.
// Sharpen a mapped material by biasing it toward a finer mip level.
//
// WHY. Edge maps of a round-3 render against the reference photography showed
// the deficit precisely: my facings are clean OUTLINES with blank interiors
// past about five metres, while every package in a photograph stays covered in
// internal detail at any distance. That is mipmapping doing exactly what it is
// designed to do — averaging the print away — where a camera's optics do not.
// A negative LOD bias plus the anisotropy already in place puts the printed
// detail back. It costs some shimmer, which a real photograph also has.
export function sharpen(THREE, m, bias = -0.8) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace(
      'texture2D( map, vMapUv )', `texture2D( map, vMapUv, ${bias.toFixed(2)} )`);
  };
  // the stock implementation reads `this.onBeforeCompile`, so it has to be
  // called bound or it throws inside the renderer's program cache
  const k = m.customProgramCacheKey;
  m.customProgramCacheKey = function () { return k.call(this) + 'sharp' + bias; };
  return m;
}

// `spec` turns the material Phong instead of Lambert. Round-2 shaded cans,
// glossy bottles, foil bags and coated board with one identical matte diffuse,
// and a real aisle is DOMINATED by specular events: the bright vertical band
// down every can, the blown white glint on shrink film, the mirror strip on a
// bleach jug. `gloss` is a GLSL expression over `chopM` (the mask sample) that
// drives per-texel specular strength — feeding it the print-brightness channel
// makes white film crinkle flare while the printed ink stays dull.
export function chopPackageMat(THREE, mask, grid, extra = {}) {
  const { spec = null, gloss = null, ...rest } = extra;
  const m = spec
    ? new THREE.MeshPhongMaterial({
      map: mask, color: 0xffffff, shininess: spec.shininess,
      specular: new THREE.Color(spec.specular), ...rest,
    })
    : new THREE.MeshLambertMaterial({ map: mask, color: 0xffffff, ...rest });
  const cell = new THREE.Vector2(1 / grid.cols, 1 / grid.rows);
  const px = new THREE.Vector2(grid.cw * grid.cols, grid.ch * grid.rows);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCell = { value: cell };
    sh.uniforms.uAtlasPx = { value: px };
    sh.vertexShader = 'attribute vec2 aCell;\nvarying vec2 vCell;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvCell = aCell;');
    sh.fragmentShader = 'uniform vec2 uCell;\nuniform vec2 uAtlasPx;\nvarying vec2 vCell;\nfloat chopGloss;\n'
      + sh.fragmentShader
        .replace('#include <map_fragment>', `
        vec2 chopUv = vCell + clamp( vMapUv, 0.0015, 0.9985 ) * uCell;
        vec4 chopM = texture2D( map, chopUv, -0.85 );
        // ---- ROUND 7: MAGNIFICATION ------------------------------------
        // "Product blur is depth-independent: a pack half a metre away is as
        // unreadable as one six metres away. That is a magnified low-res atlas
        // behaving as the inverse of a lens."
        //
        // Exactly right, and the number is easy to check. A carton cell is 340
        // px wide and the printed front face gets 85% of it, so a 200 mm facing
        // carries 289 texels. At 600 mm from a 40-degree lens that facing
        // covers 586 pixels. Two screen pixels per texel — the bilinear filter
        // is interpolating, so the near shelf is soft for the same reason a
        // scaled-up JPEG is, and no amount of LOD bias touches it because we are
        // MAGNIFYING, not minifying. Bias only ever selects a mip.
        //
        // Quadrupling every atlas is 55 MB of texture for one shelf's worth of
        // near field. An unsharp mask is the honest alternative: it restores the
        // acutance the sampler threw away, it costs four taps, and it is gated
        // on the actual magnification ratio so it does nothing at all past about
        // a metre and a half — which is where the atlas genuinely does have more
        // texels than the screen has pixels. Only the ink channels are
        // sharpened; chopM.b packs the food-palette band and an over/undershoot
        // there would flip a swatch to a different colour entirely.
        {
          vec2 dpx = fwidth( vMapUv ) * uCell * uAtlasPx;
          float mag = clamp( 1.0 - max( dpx.x, dpx.y ), 0.0, 1.0 );
          if ( mag > 0.04 ) {
            vec2 o = 1.0 / uAtlasPx;
            vec4 lo = texture2D( map, chopUv + vec2( o.x, 0.0 ), -0.85 )
                    + texture2D( map, chopUv - vec2( o.x, 0.0 ), -0.85 )
                    + texture2D( map, chopUv + vec2( 0.0, o.y ), -0.85 )
                    + texture2D( map, chopUv - vec2( 0.0, o.y ), -0.85 );
            chopM.rg = clamp( chopM.rg + ( chopM.rg - lo.rg * 0.25 ) * ( 1.45 * mag ),
                              0.0, 1.0 );
          }
        }
        float scaled = chopM.b * 4.0;
        float band = min( 3.0, floor( scaled ) );
        float amt = clamp( scaled - band, 0.0, 1.0 );
        // ROUND 5. These four swatches are the serving-suggestion photography on
        // every carton, and three of the four were warm and DARK: golden at
        // (0.80,0.52,0.17) is a mud brown and olive at (0.34,0.50,0.15) is army
        // green. A hue mask over a shelf close-up showed the photo ovals were
        // the single biggest remaining source of the sepia cast — a blue
        // detergent carton with a khaki blob over half its face reads khaki.
        // Food photography on packaging is lit hard and reproduces BRIGHT.
        // Same four hues, opened up about two stops.
        vec3 f01 = mix( vec3( 0.88, 0.66, 0.34 ), vec3( 0.46, 0.68, 0.24 ), step( 0.5, band ) );
        vec3 f23 = mix( vec3( 0.82, 0.20, 0.13 ), vec3( 0.97, 0.91, 0.68 ), step( 2.5, band ) );
        vec3 food = mix( f01, f23, step( 1.5, band ) );
        vec3 base = mix( vec3( 1.0 ), vColor, chopM.r );
        base = mix( base, food, amt );
        diffuseColor.rgb *= base * ( 0.045 + 0.955 * chopM.g );
        chopGloss = ${gloss || '1.0'};
      `)
        .replace('#include <color_fragment>', '')
        .replace('#include <specularmap_fragment>', 'float specularStrength = chopGloss;');
  };
  m.customProgramCacheKey = () => 'chopPkgR7' + grid.cols + 'x' + grid.rows
    + (spec ? 'P' + (gloss ? gloss.length : 0) : 'L');
  return m;
}

// ---------------------------------------------------------------------------
// Rewrite a geometry's UVs into UNIT-CELL space: the printed front face gets
// [wrap..1] x [0..1], every other face gets the narrow plain-wrap column on the
// left. The shader then offsets by the per-instance cell origin, so one
// geometry + one draw call serves every design in the atlas.
// Re-derive u from each vertex's bearing around Y so that local +Z — the face
// products.js always turns toward the aisle — sits at the middle of the label.
function frontFold(g, uv, lo, hi, v0, v1) {
  const pos = g.attributes.position;
  for (let i = lo; i <= hi; i++) {
    const th = Math.atan2(pos.getX(i), pos.getZ(i));
    const u = 0.5 + Math.max(-Math.PI / 2, Math.min(Math.PI / 2, th)) / Math.PI;
    uv.setXY(i, 0.004 + u * 0.992, v0 + uv.getY(i) * (v1 - v0));
  }
}

export function unitCellUV(THREE, base, kind, wrap) {
  const g = base.clone();
  const uv = g.attributes.uv, idx = g.index;
  const span = (gr) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const v = idx.getX(i);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  };
  const remap = (lo, hi, a, b, c, d) => {
    for (let i = lo; i <= hi; i++) {
      uv.setXY(i, a + uv.getX(i) * (b - a), c + uv.getY(i) * (d - c));
    }
  };
  if (kind === 'box') {
    // BoxGeometry group order: px, nx, py, ny, pz, nz
    const su0 = 0.012, su1 = wrap * 0.80;
    for (let k = 0; k < 6; k++) {
      const [lo, hi] = span(g.groups[k]);
      if (k === 4) remap(lo, hi, wrap, 0.999, 0.001, 0.999);        // printed front
      else if (k === 2) remap(lo, hi, su0, su1, 0.86, 0.995);       // top
      else if (k === 3) remap(lo, hi, su0, su1, 0.005, 0.14);       // bottom
      else remap(lo, hi, su0, su1, 0.02, 0.98);                     // sides + back
    }
  } else if (kind === 'can') {
    // Cylinder: [0] side, [1] top cap, [2] bottom cap.
    // Do NOT wrap the label around the full circumference — that shows a
    // FRAGMENT of the wordmark at every viewing angle, which is the single
    // most obviously wrong thing a canned-goods shelf can do. Instead fold u
    // around the front: the whole label lands on the half we can actually see
    // and the unseen back half takes the squashed edge.
    const [s0, s1] = span(g.groups[0]);
    frontFold(g, uv, s0, s1, 0.012, 0.988);
    if (g.groups[1]) { const [a, b] = span(g.groups[1]); remap(a, b, 0.30, 0.70, 0.905, 0.985); }
    if (g.groups[2]) { const [a, b] = span(g.groups[2]); remap(a, b, 0.30, 0.70, 0.015, 0.06); }
  } else {
    // Lathe: same front-fold, v already runs along the profile
    frontFold(g, uv, 0, uv.count - 1, 0.004, 0.996);
  }
  uv.needsUpdate = true;
  g.clearGroups();
  return g;
}

// UV origin of atlas cell `i` (canvas rows run top->bottom, texture v bottom->top)
export function cellOrigin(i, cols, rows) {
  const cx = i % cols, cy = Math.floor(i / cols) % rows;
  return [cx / cols, 1 - (cy + 1) / rows];
}
