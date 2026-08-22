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
//   b  food-photo tint.      1..127 ramps to warm amber, 128..255 ramps to red
//
// One atlas per package family, per-instance UV offset picks the cell. That
// keeps 24 carton designs x unlimited brand colours at ONE draw call per batch
// instead of one geometry clone per design.

import { makeRng, rr, ri } from './kit.js';
import {
  FACE, BRANDS, VALUE_BRANDS, DESC, FLASH, BURST, NUTRI, WEIGHTS, LEGAL,
  PANEL_HEAD, TAG_DESC,
} from './brands.js';

// --- atlas grid descriptors (store.js reads these) --------------------------
export const ATLAS = {
  carton: { cols: 6, rows: 4, cw: 256, ch: 320, wrap: 0.150 },
  pouch:  { cols: 4, rows: 2, cw: 256, ch: 256, wrap: 0.135 },
  can:    { cols: 4, rows: 2, cw: 256, ch: 192, wrap: 0 },
  bottle: { cols: 4, rows: 2, cw: 192, ch: 256, wrap: 0 },
};

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
const ink = (r, g, b = 0) => `rgb(${r | 0},${g | 0},${b | 0})`;
const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const pk = (rng, a) => a[Math.floor(rng() * a.length) % a.length];

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

// Serving-suggestion photography. Not a flat ellipse — a bowl or plate with
// distinct pieces, a rim highlight and a cast shadow, tinted through the b
// channel so it does NOT take the brand colour the way a flat blob would.
function foodPhoto(g, cx, cy, rw, rh, rng, red) {
  const base = red ? 150 : 60;                 // b-channel ramp anchor
  const amt = (v) => ink(200, v, base + (red ? 70 : 55) * 1);
  // plate / bowl
  g.fillStyle = ink(30, 236, 0);
  g.beginPath(); g.ellipse(cx, cy + rh * 0.30, rw * 1.02, rh * 0.52, 0, 0, 6.29); g.fill();
  g.fillStyle = ink(24, 200, 0);
  g.beginPath(); g.ellipse(cx, cy + rh * 0.34, rw * 0.80, rh * 0.38, 0, 0, 6.29); g.fill();
  // heaped food
  g.fillStyle = ink(90, 175, base + 40);
  g.beginPath(); g.ellipse(cx, cy, rw * 0.86, rh * 0.72, 0, 0, 6.29); g.fill();
  // individual pieces catch the light differently — this is the bit that reads
  for (let i = 0; i < 26; i++) {
    const a = rng() * 6.29, r = Math.sqrt(rng());
    const px = cx + Math.cos(a) * rw * 0.74 * r;
    const py = cy + Math.sin(a) * rh * 0.60 * r;
    const s = rr(rng, rw * 0.10, rw * 0.21);
    g.fillStyle = amt(rr(rng, 110, 235) | 0);
    g.beginPath();
    g.ellipse(px, py, s, s * rr(rng, 0.62, 0.95), rng() * 3.1, 0, 6.29);
    g.fill();
    if (rng() < 0.45) {                        // tiny specular pip on the piece
      g.fillStyle = ink(60, 252, base * 0.4);
      g.beginPath();
      g.ellipse(px - s * 0.3, py - s * 0.34, s * 0.26, s * 0.18, 0, 0, 6.29);
      g.fill();
    }
  }
  // garnish
  g.fillStyle = ink(150, 150, 0);
  for (let i = 0; i < 3; i++) {
    const a = rng() * 6.29;
    g.beginPath();
    g.ellipse(cx + Math.cos(a) * rw * 0.5, cy + Math.sin(a) * rh * 0.4,
      rw * 0.13, rh * 0.07, a, 0, 6.29);
    g.fill();
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
  const rng = makeRng(0xC4A70;
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

function cartonDesign(g, i, W, H, M, rng, deptKeys) {
  const fam = i < 10 ? 0 : (i < 18 ? 1 : 2);
  const x0 = M, fw = W - M;
  const brand = pk(rng, i % 7 === 6 ? VALUE_BRANDS : BRANDS);
  const deptKey = deptKeys[i % deptKeys.length];
  const desc = pk(rng, DESC[deptKey] || DESC.canned);
  const flash = pk(rng, FLASH);
  const wt = pk(rng, WEIGHTS);
  const wmFace = pk(rng, [FACE.fat, FACE.fat, FACE.impact, FACE.geo, FACE.serif,
    FACE.human, FACE.slab, FACE.didone]);
  g.textBaseline = 'alphabetic';

  // ---- ground -------------------------------------------------------------
  if (fam === 0) {
    g.fillStyle = ink(14, 250); g.fillRect(0, 0, W, H);            // white stock
    g.fillStyle = ink(255, 205); g.fillRect(0, 0, W, H * 0.135);   // brand header
    g.fillStyle = ink(255, 150); g.fillRect(0, H * 0.135, W, H * 0.012);
    g.fillStyle = ink(255, 190); g.fillRect(0, H - H * 0.075, W, H * 0.075);
  } else if (fam === 1) {
    g.fillStyle = ink(255, 198); g.fillRect(0, 0, W, H);           // full bleed
    g.fillStyle = ink(255, 135); g.fillRect(0, 0, W, H * 0.10);
    g.fillStyle = ink(14, 250); g.fillRect(x0 + fw * 0.05, H * 0.15, fw * 0.90, H * 0.26);
    g.fillStyle = ink(255, 160); g.fillRect(0, H - H * 0.10, W, H * 0.10);
  } else {
    g.fillStyle = ink(255, 92); g.fillRect(0, 0, W, H);            // dark rich
    g.fillStyle = ink(255, 58); g.fillRect(0, 0, W, H * 0.09);
    g.fillStyle = ink(200, 235); g.fillRect(0, H * 0.60, W, H * 0.018);
  }

  // ---- wordmark — roughly a quarter of the face height --------------------
  const wmY = fam === 1 ? H * 0.33 : H * 0.255;
  const wmPx = H * (fam === 1 ? 0.135 : 0.115);
  g.fillStyle = fam === 0 ? ink(255, 120) : (fam === 1 ? ink(255, 150) : ink(10, 250));
  fitText(g, brand, W * 0.5 + M * 0.35, wmY, fw * 0.88, wmPx, wmFace, '900');
  // a rule under the mark, the way a lot of house brands set it
  if (rng() < 0.55) {
    g.fillStyle = fam === 2 ? ink(20, 240) : ink(255, 140);
    g.fillRect(x0 + fw * 0.10, wmY + wmPx * 0.20, fw * 0.80, H * 0.006);
  }

  // ---- product descriptor -------------------------------------------------
  g.fillStyle = fam === 2 ? ink(30, 245) : ink(12, 40);
  fitText(g, desc, W * 0.5 + M * 0.35, wmY + H * 0.075, fw * 0.86, H * 0.045,
    pk(rng, [FACE.grot, FACE.human, FACE.geo]), '700');

  // ---- serving-suggestion photograph --------------------------------------
  const phY = H * 0.63, phR = fw * 0.31;
  foodPhoto(g, x0 + fw * 0.52, phY, phR, phR * 0.80, rng, i % 3 === 0);

  // ---- flavour flash ribbon ----------------------------------------------
  const flY = H * 0.455;
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
    for (let k = 0; k < 20; k++) {              // starburst, not a plain circle
      const a = (k / 20) * 6.283, r = (k % 2 ? 0.66 : 1.0) * fw * 0.115;
      g[k ? 'lineTo' : 'moveTo'](bx + Math.cos(a) * r, by + Math.sin(a) * r * 0.9);
    }
    g.closePath(); g.fill();
    g.fillStyle = ink(20, 30);
    fitText(g, pk(rng, BURST), bx, by + H * 0.010, fw * 0.17, H * 0.030, FACE.fat, '900');
  }

  // ---- legal type + weight + barcode + nutrition flash --------------------
  const legY = H * 0.815;
  legalBlock(g, x0 + fw * 0.045, legY, fw * 0.52, 7, H * 0.0165, rng,
    fam === 2 ? ink(60, 175) : ink(16, 78));
  g.textAlign = 'left';
  g.fillStyle = fam === 2 ? ink(40, 245) : ink(12, 45);
  fitText(g, wt, x0 + fw * 0.045, H * 0.785, fw * 0.50, H * 0.030,
    FACE.grot, '700', 'left');
  nutriPanel(g, x0 + fw * 0.62, H * 0.700, fw * 0.34, H * 0.175, rng);
  barcode(g, x0 + fw * 0.62, H * 0.892, fw * 0.34, H * 0.082, rng);

  // small circular nutrition claim, top corner
  if (rng() < 0.5) {
    const nx = x0 + fw * 0.855, ny = H * 0.075, nr = fw * 0.095;
    g.fillStyle = fam === 1 ? ink(14, 250) : ink(255, 175);
    g.beginPath(); g.arc(nx, ny, nr, 0, 6.29); g.fill();
    const nu = pk(rng, NUTRI);
    g.fillStyle = fam === 1 ? ink(255, 130) : ink(12, 250);
    fitText(g, nu[0], nx, ny + nr * 0.10, nr * 1.6, nr * 0.78, FACE.fat, '900');
    fitText(g, nu[1], nx, ny + nr * 0.62, nr * 1.7, nr * 0.34, FACE.grot, '700');
  }

  // ---- plain wrap column: sides / top / bottom of every carton ------------
  // Matches the front's bands so a box seen from the end still reads as the
  // same product, but carries no duplicated barcode.
  g.fillStyle = fam === 0 ? ink(14, 236) : (fam === 1 ? ink(255, 178) : ink(255, 84));
  g.fillRect(0, 0, M, H);
  g.fillStyle = ink(255, fam === 2 ? 54 : 150);
  g.fillRect(0, 0, M, H * (fam === 1 ? 0.10 : 0.135));
  g.fillStyle = ink(255, fam === 2 ? 60 : 165);
  g.fillRect(0, H - H * 0.085, M, H * 0.085);
  // a sliver of side-panel type so the end of a box is not a blank slab
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

    foodPhoto(g, M + (W - M) * 0.52, H * 0.66, (W - M) * 0.34, H * 0.21, rng, i % 4 === 1);

    const brand = pk(rng, BRANDS);
    g.fillStyle = ink(14, 250);
    g.fillRect(M + 3, H * 0.19, W - M - 8, H * 0.155);
    g.fillStyle = ink(255, 130);
    fitText(g, brand, M + (W - M) * 0.5, H * 0.305, (W - M) * 0.86, H * 0.125,
      pk(rng, [FACE.fat, FACE.impact, FACE.geo, FACE.script]), '900');
    g.fillStyle = dark ? ink(20, 245) : ink(12, 40);
    fitText(g, pk(rng, DESC[deptKeys[i % deptKeys.length]] || DESC.snacks),
      M + (W - M) * 0.5, H * 0.395, (W - M) * 0.84, H * 0.055, FACE.grot, '800');
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

    // hard specular streak — this is how a viewer instantly reads "plastic"
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.translate(W * 0.30, H * 0.5); g.rotate(-0.34);
    const st = g.createLinearGradient(-W * 0.06, 0, W * 0.06, 0);
    st.addColorStop(0, 'rgba(255,255,255,0)');
    st.addColorStop(0.5, 'rgba(255,255,255,0.55)');
    st.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = st; g.fillRect(-W * 0.06, -H, W * 0.12, H * 2);
    g.restore();

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
// CAN ATLAS — the label wraps the full circumference, so the wordmark is
// repeated three times across the cell exactly as a real can prints it.
// Whichever third faces the camera therefore always shows a brand.
export function canAtlas(THREE, deptKeys) {
  const A = ATLAS.can;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xCA5);
  const REP = 3;

  for (let i = 0; i < A.cols * A.rows; i++) {
    const W = A.cw, H = A.ch, seg = W / REP;
    g.save();
    g.translate((i % A.cols) * W, Math.floor(i / A.cols) * H);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.textBaseline = 'alphabetic';

    const pale = i % 2 === 0;
    g.fillStyle = pale ? ink(16, 250) : ink(255, 190);
    g.fillRect(0, 0, W, H);
    // steel lid and base rim — mapped to the cylinder caps too
    g.fillStyle = ink(8, 150); g.fillRect(0, 0, W, H * 0.085);
    g.fillStyle = ink(8, 96); g.fillRect(0, H * 0.085, W, H * 0.022);
    g.fillStyle = ink(8, 120); g.fillRect(0, H - H * 0.075, W, H * 0.075);
    // brand bands
    g.fillStyle = ink(255, pale ? 170 : 120);
    g.fillRect(0, H * 0.135, W, H * 0.115);
    g.fillStyle = ink(255, pale ? 200 : 145);
    g.fillRect(0, H * 0.70, W, H * 0.075);

    const brand = pk(rng, BRANDS);
    const desc = pk(rng, DESC[deptKeys[i % deptKeys.length]] || DESC.canned);
    const face = pk(rng, [FACE.fat, FACE.serif, FACE.didone, FACE.plate, FACE.geo]);
    for (let r = 0; r < REP; r++) {
      const cx = seg * (r + 0.5);
      g.fillStyle = pale ? ink(255, 130) : ink(14, 250);
      fitText(g, brand, cx, H * 0.225, seg * 0.90, H * 0.095, face, '900');
      g.fillStyle = pale ? ink(20, 45) : ink(20, 245);
      fitText(g, desc, cx, H * 0.325, seg * 0.92, H * 0.058, FACE.grot, '700');
      // the food picture that fills the middle of nearly every can label
      foodPhoto(g, cx, H * 0.50, seg * 0.34, H * 0.115, rng, i % 3 !== 1);
      g.fillStyle = pale ? ink(12, 40) : ink(20, 240);
      fitText(g, pk(rng, FLASH), cx, H * 0.755, seg * 0.80, H * 0.052, FACE.fat, '900');
      legalBlock(g, cx - seg * 0.44, H * 0.815, seg * 0.86, 3, H * 0.030, rng,
        pale ? ink(18, 85) : ink(40, 150));
    }
    barcode(g, seg * 0.10, H * 0.60, seg * 0.55, H * 0.075, rng);

    // cylindrical shading + a hard vertical specular on the tinplate
    const e = g.createLinearGradient(0, 0, W, 0);
    for (let r = 0; r < REP; r++) {
      const b = r / REP;
      e.addColorStop(b + 0.001, 'rgba(0,0,0,0.55)');
      e.addColorStop(b + 0.10 / REP, 'rgba(255,255,255,0.30)');
      e.addColorStop(b + 0.42 / REP, 'rgba(0,0,0,0.0)');
      e.addColorStop(b + 0.99 / REP, 'rgba(0,0,0,0.55)');
    }
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = e; g.fillRect(0, H * 0.09, W, H * 0.83);
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// BOTTLE ATLAS — shrink-film label around a lathe. Same 3x repeat rule.
// Elongated white streaks are doing most of the "this is PET" work.
export function bottleAtlas(THREE, deptKeys) {
  const A = ATLAS.bottle;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xB07);
  const REP = 3;

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

    // curvature + two hard streaks
    const e = g.createLinearGradient(0, 0, W, 0);
    for (let r = 0; r < REP; r++) {
      const b = r / REP;
      e.addColorStop(b + 0.001, 'rgba(0,0,0,0.60)');
      e.addColorStop(b + 0.09 / REP, 'rgba(255,255,255,0.42)');
      e.addColorStop(b + 0.20 / REP, 'rgba(255,255,255,0.05)');
      e.addColorStop(b + 0.62 / REP, 'rgba(0,0,0,0.10)');
      e.addColorStop(b + 0.80 / REP, 'rgba(255,255,255,0.22)');
      e.addColorStop(b + 0.99 / REP, 'rgba(0,0,0,0.60)');
    }
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = e; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    g.restore();
  }
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// SHELF-TAG ATLAS — sRGB colour, not a mask. Real tags are dominated by one
// large bold price numeral, black on white, plus a UPC block and a caps
// description. store.js emits ONE tag per SKU run so the rhythm is irregular
// and matches the facing width above it, instead of a moiring ribbon.
export function tagAtlas(THREE) {
  const COLS = 4, ROWS = 4, CW = 192, CH = 96;
  const [c, g] = cv(CW * COLS, CH * ROWS);
  const rng = makeRng(0x7A65);

  for (let i = 0; i < COLS * ROWS; i++) {
    g.save();
    g.translate((i % COLS) * CW, Math.floor(i / COLS) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    g.textBaseline = 'alphabetic';

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
    const dollars = ri(rng, 0, 9), cents = ri(rng, 0, 99);
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
    // metric strip down the left edge, as ESL-style tags print
    g.fillStyle = sale ? '#b8190f' : '#8d8straight';
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// PACKAGE MATERIAL — one mask atlas + a per-instance brand colour + a
// per-instance atlas cell. See the channel contract at the top of the file.
export function chopPackageMat(THREE, mask, grid, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ map: mask, color: 0xffffff, ...extra });
  const cell = new THREE.Vector2(1 / grid.cols, 1 / grid.rows);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCell = { value: cell };
    sh.vertexShader = 'attribute vec2 aCell;\nvarying vec2 vCell;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvCell = aCell;');
    sh.fragmentShader = 'uniform vec2 uCell;\nvarying vec2 vCell;\n' + sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec4 chopM = texture2D( map, vCell + clamp( vMapUv, 0.0015, 0.9985 ) * uCell );
        float sel = step( 0.5, chopM.b );
        float amt = clamp( ( chopM.b - sel * 0.5 ) * 2.0, 0.0, 1.0 );
        vec3 food = mix( vec3( 0.74, 0.45, 0.14 ), vec3( 0.60, 0.12, 0.09 ), sel );
        vec3 base = mix( vec3( 1.0 ), vColor, chopM.r );
        base = mix( base, food, amt );
        diffuseColor.rgb *= base * ( 0.045 + 0.955 * chopM.g );
      `)
      .replace('#include <color_fragment>', '');
  };
  m.customProgramCacheKey = () => 'chopPkg' + grid.cols + 'x' + grid.rows;
  return m;
}

// ---------------------------------------------------------------------------
// Rewrite a geometry's UVs into UNIT-CELL space: the printed front face gets
// [wrap..1] x [0..1], every other face gets the narrow plain-wrap column on the
// left. The shader then offsets by the per-instance cell origin, so one
// geometry + one draw call serves every design in the atlas.
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
    // Cylinder: [0] side wraps the full circumference, [1] top cap, [2] bottom
    const [s0, s1] = span(g.groups[0]);
    remap(s0, s1, 0.0, 1.0, 0.012, 0.988);
    if (g.groups[1]) { const [a, b] = span(g.groups[1]); remap(a, b, 0.02, 0.14, 0.905, 0.985); }
    if (g.groups[2]) { const [a, b] = span(g.groups[2]); remap(a, b, 0.02, 0.14, 0.015, 0.06); }
  } else {
    // Lathe: u around, v along the profile — already 0..1, just inset
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, 0.002 + uv.getX(i) * 0.996, 0.004 + uv.getY(i) * 0.992);
    }
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
