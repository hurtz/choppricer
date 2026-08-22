// OWNER: builder-store. Every texture in the store is generated here on a
// 2D canvas at load time. No network, no image files.
//
// Two flavours:
//   * colour maps  -> colorSpace = SRGB  (floor, ceiling, signage, wood...)
//   * package masks-> raw (NoColorSpace). red channel = "how much brand colour",
//     green channel = "print brightness". ../store.js patches the standard
//     shader so a single greyscale package mask + a per-instance brand colour
//     yields an unlimited variety of grocery packages.

import { makeRng, rr, ri } from './kit.js';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(THREE, canvas, { srgb = true, rx = 1, ry = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const hsl = (h, s, l) => `hsl(${h} ${s}% ${l}%)`;

// ---------------------------------------------------------------------------
// FLOOR — polished VCT. 8x8 tiles of 12in on a 512px canvas => 2.44 m repeat.
export function floorTex(THREE) {
  const N = 1024, T = 8, S = N / T;
  const [c, g] = cv(N, N);
  const rng = makeRng(4711);
  g.fillStyle = '#d7cfbe'; g.fillRect(0, 0, N, N);
  for (let ty = 0; ty < T; ty++) {
    for (let tx = 0; tx < T; tx++) {
      const h = rr(rng, 34, 44), s = rr(rng, 13, 22), l = rr(rng, 69, 77);
      g.fillStyle = hsl(h, s, l);
      g.fillRect(tx * S, ty * S, S, S);
      // speckle — the classic vinyl composition chip pattern
      const n = 2600;
      for (let i = 0; i < n; i++) {
        const x = tx * S + rng() * S, y = ty * S + rng() * S;
        const v = rng();
        if (v < 0.36) g.fillStyle = `hsl(${h - 6} ${s + 10}% ${l - 24}%)`;
        else if (v < 0.66) g.fillStyle = `hsl(${h + 8} ${s + 4}% ${l + 14}%)`;
        else if (v < 0.86) g.fillStyle = `hsl(${h + 2} ${s}% ${l - 11}%)`;
        else g.fillStyle = `hsl(${h - 14} ${s + 18}% ${l - 38}%)`;
        const w = rr(rng, 1.4, 4.2), hh = rr(rng, 1.3, 3.6);
        g.save(); g.translate(x, y); g.rotate(rng() * 3.14);
        g.fillRect(-w / 2, -hh / 2, w, hh); g.restore();
      }
      // grout / tile seam. Round 3: pushed from 46% to a hard dark line with a
      // bright wax bead beside it — at twenty metres the old seam aliased away
      // and the floor became the second-flattest band in the frame.
      g.strokeStyle = 'rgba(74,66,53,0.72)'; g.lineWidth = 2.4;
      g.strokeRect(tx * S + 0.9, ty * S + 0.9, S - 1.8, S - 1.8);
      g.strokeStyle = 'rgba(255,251,240,0.40)'; g.lineWidth = 1.2;
      g.strokeRect(tx * S + 3.0, ty * S + 3.0, S - 6, S - 6);
      // one tile in six is a different dye lot, one in twenty is chipped
      if (rng() < 0.16) {
        g.fillStyle = `hsla(${h - 10} ${s + 6}% ${l - 6}% / 0.55)`;
        g.fillRect(tx * S + 2, ty * S + 2, S - 4, S - 4);
      }
      if (rng() < 0.06) {
        g.strokeStyle = 'rgba(66,58,46,0.45)'; g.lineWidth = rr(rng, 0.8, 1.8);
        g.beginPath();
        let cx2 = tx * S + rng() * S, cy2 = ty * S + rng() * S;
        g.moveTo(cx2, cy2);
        for (let k = 0; k < 4; k++) g.lineTo(cx2 += rr(rng, -18, 18), cy2 += rr(rng, -18, 18));
        g.stroke();
      }
    }
  }
  // long scuff arcs from the buffing machine
  g.globalAlpha = 0.05;
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = i % 2 ? '#fffaf0' : '#8d8272';
    g.lineWidth = rr(rng, 0.6, 2.2);
    g.beginPath();
    const x = rng() * N, y = rng() * N, r = rr(rng, 60, 380), a = rng() * 6.28;
    g.arc(x, y, r, a, a + rr(rng, 0.3, 1.1));
    g.stroke();
  }
  g.globalAlpha = 1;
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// ---------------------------------------------------------------------------
// CEILING — 2ft acoustic drop tile with T-bar grid.
// ROUND 3. The old version tiled a 4x4 patch every 2.44 m and drew the T-bar at
// ~14 grey levels of contrast, which aliases to nothing past six metres: the
// ceiling was a 30%-of-frame flat cream field and the single lowest-detail
// region in every render (band-1 edge density 11-14% against 19-49% for real
// photography). Now: 8x8 tiles over a 4.88 m repeat so the pattern period is
// doubled, a T-bar with real contrast and a dark shadow line on one side, and
// per-tile incident — water stains, cut tiles, return-air grilles, patched
// tiles, sagging corners. Real supermarket ceilings are visibly beaten up.
// ROUND 6 — THREE FAULTS, ALL CALLED, ALL REAL.
//
// 1. IT READ AS ASPHALT. The round-3 grain was 5200 rects of ~2.5 x 2.2 px on a
//    128 px tile: 28 600 px of ink over 16 400 px of tile, i.e. 175% coverage.
//    That is not a fissured mineral-fibre face, it is a solid noise field, and
//    a solid dark noise field over a warm ground is exactly exposed aggregate.
//    Real Armstrong/USG tile is a smooth pressed face with SPARSE pinholes and
//    a handful of long cut fissures — under 12% coverage — and the tone comes
//    from the board, not from the grain.
// 2. THE GRAIN CROSSED THE GRID. It did not, strictly: the old grain was drawn
//    per tile. But the tile was 610 mm SQUARE and the map repeated every 4.88 m,
//    so an 8x8 block of near-identical square tiles tiled the whole ceiling and
//    read as one continuous field with a grid ruled on top of it. A real store
//    grid is 600 x 1200 planks: the long axis alone breaks the read, and the
//    per-tile tone has to be wide enough to see.
// 3. IT WAS DARKER THAN THE FLOOR. Half of that is the material tint in
//    store.js; the other half is here — the board was authored at l = 80-93 and
//    then had 175% dark grain multiplied over it. The board is now 86-96 with a
//    third of the ink, so the tile is genuinely the second-brightest surface in
//    the store, which is what a ceiling bouncing 4000 lm/fixture actually is.
//
// Layout: 4 columns x 4 rows over 2.44 m x 4.88 m => 610 x 1220 mm planks.
// Cross tees run every 610 mm across u, main runners every 1220 mm along v.
export function ceilTex(THREE) {
  const N = 1024, TX = 4, TY = 4, SX = N / TX, SY = N / TY;
  const [c, g] = cv(N, N);
  const rng = makeRng(90210);
  g.fillStyle = '#e6e0cf'; g.fillRect(0, 0, N, N);
  for (let ty = 0; ty < TY; ty++) for (let tx = 0; tx < TX; tx++) {
    const roll = rng();
    const grille = roll < 0.055;             // return-air grille
    const patched = roll >= 0.055 && roll < 0.135;
    // PER-TILE TONE. This is the single biggest change: neighbouring planks in
    // a real ceiling are visibly different, because they were installed in
    // different years out of different cartons and they yellow at different
    // rates. A 10-point lightness spread is what makes the grid read as
    // DISCRETE UNITS rather than as a ruled pattern on one surface.
    const base = [rr(rng, 36, 52), rr(rng, 7, 19), patched ? rr(rng, 74, 82) : rr(rng, 86, 96)];
    g.fillStyle = hsl(base[0], base[1], base[2]);
    g.fillRect(tx * SX + 3, ty * SY + 3, SX - 6, SY - 6);
    // Fissure direction is set by how the plank was laid — half the ceiling
    // gets turned 90 degrees, which is exactly what a tiler does with a carton
    // of directional board and is another break in the field.
    const turned = rng() < 0.5;
    g.save();
    g.beginPath();
    g.rect(tx * SX + 3, ty * SY + 3, SX - 6, SY - 6);
    g.clip();
    const cx0 = tx * SX + SX / 2, cy0 = ty * SY + SY / 2;
    g.translate(cx0, cy0);
    if (turned) g.rotate(Math.PI / 2);
    g.translate(-cx0, -cy0);
    // PINHOLES. Sparse, small, and mostly a touch darker than the board — a
    // pressed acoustic face is perforated, not sprayed with gravel.
    for (let i = 0; i < 900; i++) {
      g.fillStyle = rng() < 0.80
        ? `rgba(126,117,98,${rr(rng, 0.10, 0.26)})`
        : `rgba(255,253,247,${rr(rng, 0.10, 0.28)})`;
      const w = rr(rng, 1.1, 2.3);
      g.fillRect(tx * SX + rng() * SX, ty * SY + rng() * SY, w, w * rr(rng, 0.8, 1.2));
    }
    // FISSURES. Long, shallow, running roughly with the plank — 30 of them,
    // not 150, and each one visibly a cut rather than a scribble.
    for (let i = 0; i < 30; i++) {
      g.strokeStyle = rng() < 0.66
        ? `rgba(112,103,86,${rr(rng, 0.16, 0.34)})`
        : `rgba(255,252,244,${rr(rng, 0.14, 0.30)})`;
      g.lineWidth = rr(rng, 1.4, 3.2);
      g.beginPath();
      let x = tx * SX + rng() * SX, y = ty * SY + rng() * SY;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo(x += rr(rng, -12, 12), y += rr(rng, -46, 46));
      g.stroke();
    }
    g.restore();
    if (grille) {                            // eggcrate return-air register
      g.fillStyle = '#9a927e';
      g.fillRect(tx * SX + 9, ty * SY + 9, SX - 18, SY - 18);
      for (let k = 14; k < SY - 14; k += 11) {
        g.fillStyle = 'rgba(38,36,30,0.72)';
        g.fillRect(tx * SX + 12, ty * SY + k, SX - 24, 5);
      }
      for (let k = 14; k < SX - 14; k += 11) {
        g.fillStyle = 'rgba(38,36,30,0.72)';
        g.fillRect(tx * SX + k, ty * SY + 12, 5, SY - 24);
      }
      g.strokeStyle = 'rgba(255,252,240,0.55)'; g.lineWidth = 2;
      g.strokeRect(tx * SX + 9, ty * SY + 9, SX - 18, SY - 18);
    } else if (roll > 0.885) {               // water stain, ringed and off-centre
      const sx = tx * SX + rr(rng, SX * 0.25, SX * 0.75);
      const sy = ty * SY + rr(rng, SY * 0.25, SY * 0.75);
      for (let ring = 3; ring >= 0; ring--) {
        const rad = SX * (0.20 + ring * 0.10);
        g.fillStyle = `rgba(${168 - ring * 8},${140 - ring * 9},${94 - ring * 6},${0.050 + ring * 0.036})`;
        g.beginPath();
        for (let k = 0; k <= 22; k++) {
          const a = (k / 22) * 6.283, rp = rad * (0.78 + 0.34 * Math.abs(Math.sin(a * 2.3 + ring)));
          g[k ? 'lineTo' : 'moveTo'](sx + Math.cos(a) * rp, sy + Math.sin(a) * rp * 1.35);
        }
        g.closePath(); g.fill();
      }
    } else if (roll > 0.68) {                // sagging tile: it has dropped off
      // the flange on one side, so the shadow is a WEDGE, not a border
      const sd = rng() < 0.5;
      const grd = sd
        ? g.createLinearGradient(tx * SX, 0, tx * SX + SX * 0.55, 0)
        : g.createLinearGradient(0, ty * SY, 0, ty * SY + SY * 0.45);
      grd.addColorStop(0, 'rgba(58,52,42,0.30)');
      grd.addColorStop(1, 'rgba(58,52,42,0)');
      g.fillStyle = grd;
      g.fillRect(tx * SX + 3, ty * SY + 3, SX - 6, SY - 6);
    }
  }
  // T-BAR. A real 15/16in grid reads as a light metal face with a hard shadow
  // line on one side of it — that shadow is what survives to twenty metres.
  // Cross tees along u (610 mm), main runners along v (1220 mm) — the main
  // runner is the heavier section and is drawn wider.
  const bar = (x, y, w, h, heavy) => {
    g.fillStyle = 'rgba(26,23,17,0.92)';
    g.fillRect(x - w, y - h, w * 2, h * 2);
    g.fillStyle = '#d6cfb9';
    g.fillRect(x - w * 0.62, y - h * 0.62, w * 1.24, h * 1.24);
    g.fillStyle = heavy ? 'rgba(255,254,250,0.98)' : 'rgba(252,249,240,0.90)';
    g.fillRect(x - w * 0.28, y - h * 0.28, w * 0.56, h * 0.56);
  };
  for (let i = 0; i <= TX; i++) bar(i * SX, N / 2, 5.0, N / 2, false);
  for (let i = 0; i <= TY; i++) bar(N / 2, i * SY, N / 2, 6.4, true);
  // the shadow gap under the flange — one side only, which is what reads as a
  // suspended grid rather than as a painted lattice
  g.fillStyle = 'rgba(20,17,12,0.72)';
  for (let i = 0; i <= TX; i++) g.fillRect(i * SX + 5.0, 0, 3.2, N);
  for (let i = 0; i <= TY; i++) g.fillRect(0, i * SY + 6.4, N, 4.0);
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// ---------------------------------------------------------------------------
// CONTACT SHADOW at the floor. ROUND 6.
//
// Every base in the store — gondola kick plates, freezer plinths, endcaps, cart
// castors — met the floor at a hard clean line, and in one frame a solid black
// band with a razor edge was standing in for the shadow, so the case read as
// floating. Round 3 solved exactly this problem INSIDE the shelf cavities and
// the floor never got it.
//
// Two maps, both authored for MULTIPLY blending so they darken whatever the
// floor is already doing — including its reflection, which is the point: a real
// mirror goes dark where something is sitting on it, it does not get a black
// decal pasted over it.
//   contactTex   1-D ramp: near-black at v = 0 (hard against the base) fading
//                to white by v = 1, 100-300 mm out. Used as edge-hugging strips.
//   groundAOTex  radial pool for the broad ambient darkening under a fixture.
export function contactTex(THREE) {
  const W = 8, H = 128;
  const [c, g] = cv(W, H);
  const grd = g.createLinearGradient(0, H, 0, 0);      // v = 0 is the BOTTOM row
  grd.addColorStop(0.00, 'rgb(28,26,26)');
  grd.addColorStop(0.10, 'rgb(58,55,54)');
  grd.addColorStop(0.26, 'rgb(120,116,112)');
  grd.addColorStop(0.52, 'rgb(196,192,186)');
  grd.addColorStop(0.78, 'rgb(240,238,233)');
  grd.addColorStop(1.00, 'rgb(255,255,255)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

export function groundAOTex(THREE) {
  const N = 128;
  const [c, g] = cv(N, N);
  const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grd.addColorStop(0.00, 'rgb(96,92,88)');
  grd.addColorStop(0.22, 'rgb(140,136,130)');
  grd.addColorStop(0.52, 'rgb(212,209,203)');
  grd.addColorStop(0.80, 'rgb(247,246,242)');
  grd.addColorStop(1.00, 'rgb(255,255,255)');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---------------------------------------------------------------------------
// LIGHT STRIP ATLAS — 4 states of one 4ft 2-tube fluorescent troffer, in a
// 4x1 grid. The quad's u runs ACROSS the fixture and v runs along its length,
// so each cell is drawn tall: canvas x = the 0.44 m width, canvas y = the run.
// ROUND 3: a perfect grid of identically bright fixtures is one of the loudest
// CG tells there is. Real rows carry dead tubes, aged-warm tubes and dim ones,
// so store.js picks a cell per fixture and jitters the spacing.
//   0 bright   1 dim/cool   2 aged warm   3 one tube out
export function stripTex(THREE) {
  // ROUND 4. Three changes here, all from the blind critique.
  //  * The prismatic ladder was a 3 px pitch at 22% contrast. Sampled at 70
  //    degrees off normal that undersamples catastrophically and breaks into
  //    hard black shards — which is what the critic saw and read as a failed
  //    map. It is now a 7 px pitch at half the contrast, and ../store.js no
  //    longer forces a negative mip bias on it.
  //  * Three T8 lamps, not two undifferentiated "lens halves": a real 2x4
  //    troffer shows three parallel bright tubes with the reflector visible
  //    between them.
  //  * Cell 3 is now a completely DEAD fixture (both lamps out, grey acrylic),
  //    because store.js needs a state to draw for a dead unit.
  const CW = 96, CH = 256, COLS = 4;
  const [c, g] = cv(CW * COLS, CH);
  const rng = makeRng(0x11467);
  const LAMPS = [
    ['#ffffff', '#fdfbef', '#eef0dd'],     // 4100K, the default
    ['#e6ece2', '#f2f6ec', '#cdd6c8'],     // aged, gone slightly green
    ['#fff1d2', '#ffe8ba', '#f0d7a2'],     // 3000K warm
    ['#9d9c90', '#aaa99d', '#8c8b80'],     // dead
  ];
  for (let i = 0; i < COLS; i++) {
    const dead = i === 3;
    g.save();
    g.translate(i * CW, 0);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    // the painted-steel reflector behind the lamps
    g.fillStyle = dead ? '#6d6b60' : '#cfcbb8';
    g.fillRect(0, 0, CW, CH);
    const grd0 = g.createLinearGradient(0, 0, CW, 0);
    grd0.addColorStop(0, 'rgba(70,66,56,0.42)');
    grd0.addColorStop(0.5, 'rgba(255,253,244,0.30)');
    grd0.addColorStop(1, 'rgba(70,66,56,0.42)');
    g.fillStyle = grd0; g.fillRect(0, 0, CW, CH);
    // THREE lamps across the 2 ft dimension
    const L = LAMPS[i];
    for (let t = 0; t < 3; t++) {
      const cx = 14 + t * ((CW - 28) / 2), w = 20;
      const grd = g.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
      grd.addColorStop(0.00, L[2]); grd.addColorStop(0.24, L[1]);
      grd.addColorStop(0.50, L[0]); grd.addColorStop(0.78, L[1]);
      grd.addColorStop(1.00, L[2]);
      g.fillStyle = grd;
      g.fillRect(cx - w / 2, 10, w, CH - 20);
      if (!dead) {                        // the halo the tube throws on the lens
        g.globalAlpha = 0.30;
        g.fillStyle = L[1];
        g.fillRect(cx - w, 10, w * 2, CH - 20);
        g.globalAlpha = 1;
      }
    }
    // prismatic acrylic over the top: a coarse low-contrast ladder that still
    // survives to twenty metres but no longer aliases into shards up close
    for (let y = 12; y < CH - 12; y += 7) {
      g.fillStyle = dead ? 'rgba(96,94,86,0.13)' : 'rgba(150,152,138,0.11)';
      g.fillRect(0, y, CW, 2.4);
      g.fillStyle = 'rgba(255,255,255,0.13)';
      g.fillRect(0, y + 2.8, CW, 1.8);
    }
    // dead flies and a dust line, because every diffuser in the world has them
    for (let k = 0; k < 9; k++) {
      g.fillStyle = 'rgba(58,52,42,0.44)';
      g.beginPath();
      g.ellipse(rr(rng, 6, CW - 6), rr(rng, 16, CH - 16), rr(rng, 1.0, 2.6),
        rr(rng, 0.8, 1.9), 0, 0, 6.29);
      g.fill();
    }
    // socket end caps at both ends — unlit metal, and the thing that makes the
    // joint between two units in a continuous strip legible
    g.fillStyle = '#83806f'; g.fillRect(0, 0, CW, 11); g.fillRect(0, CH - 11, CW, 11);
    g.fillStyle = '#5b584d'; g.fillRect(0, 0, CW, 3.5); g.fillRect(0, CH - 3.5, CW, 3.5);
    g.restore();
  }
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// TROFFER HOUSING interior. v0 is the lamp end, v1 the door flange — see the
// half-extent convention in store.js troffer(). The gradient IS the recess: a
// housing you can see the inside of is the difference between a fixture and an
// emissive rectangle.
export const WELL_UV = [0, 0, 1, 1];
export function wellTex(THREE) {
  const W = 32, H = 128;
  const [c, g] = cv(W, H);
  // canvas top = v1 = door flange (dim), canvas bottom = v0 = lamp (bright)
  const grd = g.createLinearGradient(0, H, 0, 0);
  grd.addColorStop(0.00, '#fbf7e9');
  grd.addColorStop(0.28, '#ddd6c2');
  grd.addColorStop(0.62, '#a49d8b');
  grd.addColorStop(1.00, '#6e695c');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // the stiffening rib and the earth screw you can see up inside a real one
  g.fillStyle = 'rgba(60,56,46,0.35)'; g.fillRect(0, H * 0.44, W, 3);
  g.fillStyle = 'rgba(255,252,240,0.30)'; g.fillRect(0, H * 0.44 + 3, W, 2);
  g.fillStyle = 'rgba(48,44,36,0.55)'; g.fillRect(0, 0, W, 4);
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 8 });
}

// The soft shadow a recessed housing throws onto the tiles either side of it.
// Multiply-blended: white leaves the tile alone, so only the ring matters.
export function trofferShadowTex(THREE) {
  const N = 64;
  const [c, g] = cv(N, N);
  const im = g.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const u = Math.abs(x / (N - 1) - 0.5) * 2, v = Math.abs(y / (N - 1) - 0.5) * 2;
      const d = Math.max(u, v);
      // dark right at the housing edge, clearing by the outside of the quad
      const t = Math.min(1, Math.max(0, (d - 0.40) / 0.58));
      const k = 0.55 + 0.45 * (t * t * (3 - 2 * t));
      const o = (y * N + x) * 4;
      im.data[o] = im.data[o + 1] = im.data[o + 2] = Math.round(k * 255);
      im.data[o + 3] = 255;
    }
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function slotTex(THREE) {
  const W = 48, H = 64;
  const [c, g] = cv(W, H);
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0.00, '#8e8674');
  grd.addColorStop(0.16, '#e3dbc4');
  grd.addColorStop(0.42, '#cec6ad');
  grd.addColorStop(0.58, '#d9d1b8');
  grd.addColorStop(0.86, '#b3ab95');
  grd.addColorStop(1.00, '#7d7665');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // the two punched slots
  for (const cy of [H * 0.25, H * 0.75]) {
    g.fillStyle = 'rgba(28,25,19,0.92)';
    g.fillRect(W * 0.34, cy - H * 0.105, W * 0.32, H * 0.21);
    g.fillStyle = 'rgba(255,250,236,0.55)';       // struck edge catching light
    g.fillRect(W * 0.34, cy + H * 0.095, W * 0.32, 1.6);
    g.fillStyle = 'rgba(70,64,50,0.45)';
    g.fillRect(W * 0.34, cy - H * 0.115, W * 0.32, 1.4);
  }
  // the pressed return down each edge
  g.fillStyle = 'rgba(255,252,240,0.42)'; g.fillRect(W * 0.09, 0, 1.4, H);
  g.fillStyle = 'rgba(52,47,38,0.38)'; g.fillRect(W * 0.92, 0, 1.6, H);
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// ---------------------------------------------------------------------------
// GONDOLA BACK PANEL — perforated steel. One tile = 300 mm square carrying a
// 25 mm grid of punched pegboard slots plus the horizontal joint between
// panels. Visible in the bottom of every cavity and across the whole of any
// bare bay, where round 2 showed a smooth beige slab.
export function pegTex(THREE) {
  const N = 128;
  const [c, g] = cv(N, N);
  const rng = makeRng(0x9E6);
  g.fillStyle = '#b7b1a4'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 900; i++) {            // powder-coat grain and grime
    g.fillStyle = `rgba(${ri(rng, 122, 188)},${ri(rng, 118, 180)},${ri(rng, 108, 168)},${rr(rng, 0.06, 0.22)})`;
    g.fillRect(rng() * N, rng() * N, rr(rng, 1, 4), rr(rng, 1, 4));
  }
  const P = N / 12;                          // 25 mm slot pitch
  for (let ry = 0; ry < 12; ry++) for (let rx = 0; rx < 12; rx++) {
    const x = (rx + 0.5) * P, y = (ry + 0.5) * P;
    g.fillStyle = 'rgba(32,32,34,0.72)';
    g.fillRect(x - P * 0.16, y - P * 0.30, P * 0.32, P * 0.60);
    g.fillStyle = 'rgba(255,250,236,0.30)';
    g.fillRect(x - P * 0.16, y + P * 0.28, P * 0.32, 1.1);
  }
  // panel joint across the middle
  g.fillStyle = 'rgba(60,54,42,0.45)'; g.fillRect(0, N / 2 - 1.5, N, 3);
  g.fillStyle = 'rgba(255,250,236,0.35)'; g.fillRect(0, N / 2 + 1.5, N, 1.2);
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// ---------------------------------------------------------------------------
// SHELF-CAVITY AMBIENT OCCLUSION. Multiply-blended over everything inside one
// shelf cavity: near-black hard up under the deck above, clearing by 45% of
// the head height, then a hard dark seam in the bottom few percent where the
// product meets the deck. This is the round-3 headline change — without it
// every facing is evenly lit and the whole gondola reads as a decal on a plane.
// TWO gradients in one 2-column atlas so both AO passes share one material and
// one draw call. store.js selects with AO_UV.mouth / AO_UV.deck.
//   left  (u 0..0.5)  cavity mouth: v=1 hard under the deck above -> v=0 deck
//   right (u 0.5..1)  deck surface: v=1 hard against the back panel -> v=0 lip
// The DECK pass is the one round-3 nearly missed. A side-by-side crop against
// the reference photography showed the single largest flat region in the frame
// was not the product at all — it was the bare cream deck surface receding
// behind the facings on every shelf below eye level.
export const AO_UV = { mouth: [0.02, 0, 0.48, 1], deck: [0.52, 0, 0.98, 1] };
export function shelfAOTex(THREE) {
  // ROUND 4. The round-3 version was "omnidirectional and too weak — a uniform
  // dark halo with no light direction in it". Light in a supermarket aisle
  // comes from a strip four metres straight up, so a shelf cavity is not softly
  // shaded: the deck above it is a hard horizontal occluder, and it throws a
  // distinct shadow BAND across the top third of whatever is on the deck below.
  // These stops are that band, and the deck gradient is the same argument seen
  // from above: near black where the deck meets the back panel, blown out along
  // the front two inches where the lip catches the light.
  const [c, g] = cv(16, 256);
  const mouth = g.createLinearGradient(0, 0, 0, 256);
  // The band has to be HARD but not deep. Round-4a crushed the top fifth of
  // every cavity under 40% brightness, which put the printed packaging in there
  // below the threshold where any of it reads — a real cast shadow is a sharp
  // edge with recoverable detail behind it, not a black hole.
  // ROUND 5. Softened about 12% and the band narrowed. Measured mean VALUE of a
  // shelf close-up was 0.37-0.40 against 0.52-0.56 for reference/store_01 and
  // _02, and the cavity card was most of it: it was multiplying the top quarter
  // of every cavity down toward black over the ENTIRE mouth. The band stays
  // hard-edged — that was the round-4 win and it is real — but a shadow cast by
  // a shelf lip in a room lit to 800 lux does not take a facing to 8% grey.
  //
  // ...and ROUND 5 made them NEUTRAL, which turned out to matter more than the
  // softening. A hue mask over a shelf close-up put 22% of the frame in the
  // saturated warm band, and it was not the packaging: it was the shadowed
  // pegboard visible in every cavity. Multiply blending COMPOUNDS chroma — a
  // 12%-saturated cream panel under a 26%-saturated brown shadow card lands at
  // 35%, well past anything in the reference photography. An occlusion card is
  // a light-LEVEL change, not a pigment; and what fills the deepest part of a
  // shelf cavity is bounce off the cool fill, so if it leans anywhere it leans
  // the other way. Every surface in here is still as warm as it was painted.
  mouth.addColorStop(0.00, '#1c1d20');        // deepest, right under the deck
  mouth.addColorStop(0.035, '#2b2c30');
  mouth.addColorStop(0.085, '#535459');       // the lip's cast shadow band
  mouth.addColorStop(0.160, '#8d8e91');
  mouth.addColorStop(0.260, '#c0c1c1');
  mouth.addColorStop(0.400, '#e0e0de');
  mouth.addColorStop(0.600, '#f7f6f2');
  mouth.addColorStop(0.780, '#fefdfa');
  mouth.addColorStop(0.880, '#d2d2cf');       // deck contact seam
  mouth.addColorStop(0.945, '#87888b');
  mouth.addColorStop(1.00, '#4f5054');
  g.fillStyle = mouth; g.fillRect(0, 0, 8, 256);
  const deck = g.createLinearGradient(0, 0, 0, 256);
  deck.addColorStop(0.00, '#1e1f23');         // hard against the back panel
  deck.addColorStop(0.10, '#3e3f44');
  deck.addColorStop(0.26, '#7c7d80');
  deck.addColorStop(0.48, '#a5a6a6');
  deck.addColorStop(0.74, '#d8d8d5');
  deck.addColorStop(0.90, '#f6f5f1');
  deck.addColorStop(1.00, '#fffefc');         // the lit strip at the lip
  g.fillStyle = deck; g.fillRect(8, 0, 8, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function smearTex(THREE) {
  const [c, g] = cv(8, 128);
  const grd = g.createLinearGradient(0, 128, 0, 0);
  grd.addColorStop(0.00, 'rgba(255,255,255,0.92)');
  grd.addColorStop(0.10, 'rgba(255,255,255,0.60)');
  grd.addColorStop(0.30, 'rgba(255,255,255,0.26)');
  grd.addColorStop(0.62, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 8, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// FLOOR WEAR — one non-repeating multiply layer stretched over the whole sales
// floor: black scuffing concentrated in the traffic lanes, cart-wheel arcs,
// heel marks, patched tiles and the dull halo where the buffer never reaches.
export function floorWearTex(THREE) {
  const N = 1024;
  const [c, g] = cv(N, N);
  const rng = makeRng(0x5CFF);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, N, N);
  // broad dull traffic bands — the store's aisles run vertically in this map
  for (let k = 0; k < 9; k++) {
    const x = (k + 0.5) * N / 9;
    const grd = g.createLinearGradient(x - N * 0.052, 0, x + N * 0.052, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(118,117,114,0.30)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x - N * 0.052, 0, N * 0.104, N);
  }
  for (const y of [N * 0.14, N * 0.86]) {         // front + back cross-aisles
    const grd = g.createLinearGradient(0, y - N * 0.06, 0, y + N * 0.06);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(113,112,109,0.30)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, y - N * 0.06, N, N * 0.12);
  }
  // black scuff arcs — cart wheels and shoe heels, biased into the lanes
  for (let i = 0; i < 1500; i++) {
    const lane = Math.floor(rng() * 9);
    const x = (lane + 0.5) * N / 9 + rr(rng, -N * 0.055, N * 0.055);
    const y = rng() * N;
    g.strokeStyle = `rgba(${ri(rng, 30, 78)},${ri(rng, 28, 70)},${ri(rng, 24, 60)},${rr(rng, 0.05, 0.30)})`;
    g.lineWidth = rr(rng, 0.7, 3.2);
    g.beginPath();
    const r = rr(rng, 4, 46), a = rng() * 6.28;
    g.arc(x, y, r, a, a + rr(rng, 0.25, 1.5));
    g.stroke();
  }
  // buffer swirls over the whole floor, much fainter
  for (let i = 0; i < 420; i++) {
    g.strokeStyle = rng() < 0.5 ? 'rgba(255,255,255,0.30)' : 'rgba(120,112,98,0.10)';
    g.lineWidth = rr(rng, 0.8, 2.6);
    g.beginPath();
    const x = rng() * N, y = rng() * N, r = rr(rng, 40, 260), a = rng() * 6.28;
    g.arc(x, y, r, a, a + rr(rng, 0.2, 0.9));
    g.stroke();
  }
  // a few dark patches — a repair, a stain, a mat shadow
  for (let i = 0; i < 26; i++) {
    g.fillStyle = `rgba(96,88,74,${rr(rng, 0.05, 0.15)})`;
    g.beginPath();
    g.ellipse(rng() * N, rng() * N, rr(rng, 8, 54), rr(rng, 6, 40), rng() * 3, 0, 6.29);
    g.fill();
  }
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 8 });
}

// ---------------------------------------------------------------------------
// CEILING DANGLERS — die-cut cardboard promo cards on strings. Cheap, and they
// put real detail into the top third of the frame, which was the single
// lowest-detail band in every round-2 render.
export function danglerAtlas(THREE) {
  const COLS = 4, ROWS = 2, CW = 192, CH = 144;
  const [c, g] = cv(CW * COLS, CH * ROWS);
  const rng = makeRng(0xDA9);
  const SETS = [
    ['SAVE', '$1.00', '#d8341f', '#fff8e6'],
    ['2 FOR', '$5', '#1d5f97', '#fffdf0'],
    ['NEW!', 'TRY IT', '#e0a416', '#2b2519'],
    ['BUY 1', 'GET 1', '#2f7a35', '#fffbe9'],
    ['LOW', 'PRICE', '#c8551b', '#fff6e2'],
    ['SALE', '99¢', '#b3161d', '#fffae8'],
    ['CLUB', 'DEAL', '#5a3d8c', '#fff6ec'],
    ['FRESH', 'DAILY', '#3f7f4f', '#fdf8e8'],
  ];
  for (let i = 0; i < COLS * ROWS; i++) {
    const s = SETS[i % SETS.length];
    g.save();
    g.translate((i % COLS) * CW, Math.floor(i / COLS) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    g.fillStyle = s[3]; g.fillRect(0, 0, CW, CH);
    g.fillStyle = s[2]; g.fillRect(0, 0, CW, CH * 0.30);
    g.fillStyle = s[2]; g.fillRect(0, CH * 0.90, CW, CH * 0.10);
    g.strokeStyle = 'rgba(60,52,40,0.45)'; g.lineWidth = 3;
    g.strokeRect(1.5, 1.5, CW - 3, CH - 3);
    g.textBaseline = 'alphabetic';
    g.textAlign = 'center';
    g.fillStyle = s[3];
    fitText(g, s[0], CW / 2, CH * 0.235, CW * 0.84, CH * 0.20, '900');
    g.fillStyle = s[2];
    fitText(g, s[1], CW / 2, CH * 0.68, CW * 0.86, CH * 0.36, '900');
    g.fillStyle = 'rgba(40,34,26,0.75)';
    g.font = `700 ${CH * 0.075}px ${'Helvetica Neue, Arial'}`;
    g.textAlign = 'center';
    g.fillText('WITH CARD  ·  LIMIT 4', CW / 2, CH * 0.855);
    // punched hang hole
    g.fillStyle = 'rgba(30,26,20,0.8)';
    g.beginPath(); g.arc(CW / 2, CH * 0.075, CH * 0.032, 0, 6.29); g.fill();
    // a little print noise so it is not a flat vector plate
    for (let k = 0; k < 160; k++) {
      g.fillStyle = `rgba(${ri(rng, 0, 255)},${ri(rng, 0, 255)},${ri(rng, 0, 255)},0.05)`;
      g.fillRect(rng() * CW, rng() * CH, rr(rng, 1, 3), rr(rng, 1, 3));
    }
    g.restore();
  }
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 8 });
}

// ---------------------------------------------------------------------------
// PRICE RAIL — 1.0 m of shelf lip: cream channel packed with little tags.
// SHOPPING-CART MESH. Alpha map of a real wire basket: a chrome grid on
// nothing. Round 3 built the parked carts out of flat grey Lambert slabs, and
// the blind critic listed "untextured grey cart proxies" as a binary tell.
export function cartMeshTex(THREE) {
  const N = 128;
  const [c, g] = cv(N, N);
  g.clearRect(0, 0, N, N);
  const wire = (x0, y0, x1, y1, w, hi) => {
    g.strokeStyle = hi ? 'rgba(246,247,250,0.98)' : 'rgba(150,157,166,0.95)';
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  };
  const P = N / 8;                       // 8 wires across the cell
  for (let i = 0; i < 8; i++) {
    const o = i * P + P / 2;
    // verticals sit proud of the horizontals and catch a chrome highlight
    wire(o, 0, o, N, 4.6, false);
    wire(o - 0.9, 0, o - 0.9, N, 1.9, true);
  }
  for (let i = 0; i < 8; i++) {
    const o = i * P + P / 2;
    wire(0, o, N, o, 3.4, false);
    wire(0, o - 0.7, N, o - 0.7, 1.3, true);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function railTex(THREE) {
  const N = 256, H = 56;
  const [c, g] = cv(N, H);
  // Round 2: the rail carries NO printed tags any more. Real tags align to each
  // SKU's facing width, so store.js emits them one-per-SKU into its own quad
  // soup — an irregular rhythm keyed to the product above. Drawing pseudo-random
  // dashes into a tiling ribbon here produced a visible moire instead.
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#fdfaf0');      // top return, catching the light run
  grd.addColorStop(0.22, '#f3eddd');
  grd.addColorStop(0.62, '#ded7c4');
  grd.addColorStop(0.88, '#bdb5a3');
  grd.addColorStop(1, '#8e8776');      // shadowed underside of the lip
  g.fillStyle = grd; g.fillRect(0, 0, N, H);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(0, 1, N, 2);
  g.fillStyle = 'rgba(110,102,88,0.30)'; g.fillRect(0, 0, N, 1);
  // the extruded channel that the tag strip slides into
  g.fillStyle = 'rgba(120,112,98,0.22)'; g.fillRect(0, H * 0.30, N, 1.6);
  g.fillStyle = 'rgba(255,255,255,0.30)'; g.fillRect(0, H * 0.34, N, 1.2);
  return tex(THREE, c, { rx: 1, ry: 1 });
}

// ---------------------------------------------------------------------------
// WOOD — gondola end panels, produce crates, service desk.
export function woodTex(THREE, base = [32, 34, 62], seed = 77) {
  const N = 256;
  const [c, g] = cv(N, N);
  const rng = makeRng(seed);
  const [h, s, l] = base;
  g.fillStyle = hsl(h, s, l); g.fillRect(0, 0, N, N);
  for (let i = 0; i < 420; i++) {
    const y = rng() * N;
    g.strokeStyle = `hsla(${h + rr(rng, -5, 5)} ${s}% ${l + rr(rng, -13, 9)}% / ${rr(rng, 0.1, 0.4)})`;
    g.lineWidth = rr(rng, 0.6, 3.2);
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= N; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * rr(rng, 0.5, 3));
    g.stroke();
  }
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `hsla(${h} ${s}% ${l - 18}% / 0.5)`; g.lineWidth = 1.5;
    const y = (i + 0.5) * N / 5;
    g.beginPath(); g.moveTo(0, y); g.lineTo(N, y); g.stroke();
  }
  return tex(THREE, c, { rx: 1, ry: 1 });
}

// ---------------------------------------------------------------------------
// PACKAGE MASKS (raw channels — see header)
function maskTex(THREE, canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}
const ink = (r, gg) => `rgb(${r | 0},${gg | 0},0)`;

export function boxMask(THREE) {
  const W = 128, H = 168;
  const [c, g] = cv(W, H);
  const rng = makeRng(1212);
  // full-bleed brand field — grocery cartons are printed edge to edge
  g.fillStyle = ink(255, 232); g.fillRect(0, 0, W, H);
  g.fillStyle = ink(255, 168); g.fillRect(0, 0, W, 20);          // darker brand band
  g.fillStyle = ink(255, 140); g.fillRect(0, H - 26, W, 26);
  // wordmark plate — the only genuinely pale area
  g.fillStyle = ink(96, 250); g.fillRect(11, 25, W - 22, 30);
  g.fillStyle = ink(30, 48); g.fillRect(19, 33, W - 46, 13);     // dark type
  // food photography blob
  g.fillStyle = ink(215, 252);
  g.beginPath(); g.ellipse(W * 0.63, H * 0.585, 35, 29, 0, 0, 6.29); g.fill();
  g.fillStyle = ink(150, 205);
  g.beginPath(); g.ellipse(W * 0.63, H * 0.585, 22, 18, 0, 0, 6.29); g.fill();
  // type lines down the left rail
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ink(40, 244);
    g.fillRect(11, 66 + i * 14, (W - 62) * rr(rng, 0.55, 1), 8);
  }
  g.fillStyle = ink(255, 250); g.fillRect(0, 62, W, 3);
  // barcode patch
  g.fillStyle = ink(18, 250); g.fillRect(W - 44, H - 24, 38, 19);
  g.fillStyle = ink(18, 26);
  for (let x = W - 41; x < W - 9; x += 2.6) g.fillRect(x, H - 21, 1.3, 13);
  // vertical edge shading — reads as a box corner
  const e = g.createLinearGradient(0, 0, W, 0);
  e.addColorStop(0, 'rgba(0,0,0,0.42)'); e.addColorStop(0.09, 'rgba(0,0,0,0)');
  e.addColorStop(0.9, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.globalCompositeOperation = 'multiply'; g.fillStyle = e; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return maskTex(THREE, c);
}

// BOX ATLAS — 2x2 of four different carton designs. The left 13% of every cell
// is a plain wrap column: ../store.js points the box's side/top/back faces at it
// so a shelf seen down-aisle isn't 400 copies of the same decal.
export function boxAtlas(THREE) {
  const CW = 128, CH = 168, COLS = 2, ROWS = 2;
  const [c, g] = cv(CW * COLS, CH * ROWS);
  const rng = makeRng(4242);
  const M = 17;                                  // plain wrap column width

  const design = (d) => {
    const W = CW, H = CH, x0 = M;
    const fw = W - M;
    if (d === 0) {                               // saturated cereal carton
      g.fillStyle = ink(255, 236); g.fillRect(0, 0, W, H);
      g.fillStyle = ink(255, 150); g.fillRect(0, 0, W, 18);
      g.fillStyle = ink(255, 122); g.fillRect(0, H - 24, W, 24);
      g.fillStyle = ink(28, 252); g.fillRect(x0 + 6, 24, fw - 12, 32);
      g.fillStyle = ink(255, 42); g.fillRect(x0 + 13, 32, fw - 34, 15);
      g.fillStyle = ink(70, 250);
      g.beginPath(); g.ellipse(x0 + fw * 0.6, H * 0.60, 34, 27, 0, 0, 6.29); g.fill();
      g.fillStyle = ink(230, 168);
      g.beginPath(); g.ellipse(x0 + fw * 0.6, H * 0.60, 21, 17, 0, 0, 6.29); g.fill();
      for (let i = 0; i < 3; i++) {
        g.fillStyle = ink(25, 246);
        g.fillRect(x0 + 4, 66 + i * 14, (fw - 52) * rr(rng, 0.5, 1), 8);
      }
    } else if (d === 1) {                        // banded cracker box
      g.fillStyle = ink(255, 214); g.fillRect(0, 0, W, H);
      g.fillStyle = ink(20, 252); g.fillRect(0, 52, W, 56);
      g.fillStyle = ink(255, 44); g.fillRect(x0 + 4, 60, fw - 12, 17);
      g.fillStyle = ink(200, 210); g.fillRect(x0 + 4, 84, fw - 30, 12);
      g.fillStyle = ink(255, 250); g.fillRect(0, 46, W, 5);
      g.fillStyle = ink(255, 250); g.fillRect(0, 109, W, 5);
      g.fillStyle = ink(255, 118); g.fillRect(0, H - 30, W, 30);
      g.fillStyle = ink(90, 250); g.fillRect(x0 + 8, 12, fw - 24, 22);
    } else if (d === 2) {                        // pale stock, colour footer
      g.fillStyle = ink(34, 250); g.fillRect(0, 0, W, H);
      g.fillStyle = ink(255, 235); g.fillRect(0, 0, W, 30);
      g.fillStyle = ink(255, 200); g.fillRect(0, H - 54, W, 54);
      g.fillStyle = ink(255, 60); g.fillRect(x0 + 5, 44, fw - 16, 16);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ink(120, 120 + i * 12);
        g.fillRect(x0 + 5, 68 + i * 11, (fw - 40) * rr(rng, 0.45, 1), 6);
      }
      g.fillStyle = ink(255, 250);
      g.beginPath(); g.ellipse(x0 + fw * 0.68, H - 30, 24, 17, 0, 0, 6.29); g.fill();
    } else {                                     // dark rich package, big photo
      g.fillStyle = ink(255, 168); g.fillRect(0, 0, W, H);
      g.fillStyle = ink(255, 108); g.fillRect(0, 0, W, 26);
      g.fillStyle = ink(210, 250); g.fillRect(x0 + 5, 62, fw - 12, 68);
      g.fillStyle = ink(120, 205);
      g.beginPath(); g.ellipse(x0 + fw * 0.5, 96, 32, 26, 0, 0, 6.29); g.fill();
      g.fillStyle = ink(24, 250); g.fillRect(x0 + 5, 34, fw - 12, 22);
      g.fillStyle = ink(255, 40); g.fillRect(x0 + 12, 39, fw - 32, 12);
      g.fillStyle = ink(255, 230); g.fillRect(0, H - 26, W, 26);
    }
    // plain wrap column — brand field only, matching top/bottom bands
    g.fillStyle = ink(255, d === 2 ? 232 : 210); g.fillRect(0, 0, M, H);
    g.fillStyle = ink(255, 150); g.fillRect(0, 0, M, 18);
    g.fillStyle = ink(255, 124); g.fillRect(0, H - 24, M, 24);
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(M - 3, 0, 3, H);
    // a small net-weight flash — a barcode belongs on the back of the carton and
    // repeating one in the same corner of every facing is an instant tell
    if (d === 1 || d === 2) {
      g.fillStyle = ink(40, 245); g.fillRect(W - 30, H - 16, 23, 9);
      g.fillStyle = ink(40, 40); g.fillRect(W - 27, H - 14, 16, 4);
    }
    // vertical edge shading — reads as a carton corner
    const e = g.createLinearGradient(M, 0, W, 0);
    e.addColorStop(0, 'rgba(0,0,0,0.34)'); e.addColorStop(0.10, 'rgba(0,0,0,0)');
    e.addColorStop(0.88, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,0.40)');
    g.globalCompositeOperation = 'multiply'; g.fillStyle = e; g.fillRect(M, 0, W - M, H);
    g.globalCompositeOperation = 'source-over';
  };

  for (let i = 0; i < 4; i++) {
    g.save();
    g.translate((i % COLS) * CW, Math.floor(i / COLS) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    design(i);
    g.restore();
  }
  return maskTex(THREE, c);
}

// BAG ATLAS — 2 designs side by side, same plain-wrap convention.
export function bagAtlas(THREE) {
  const CW = 128, CH = 128, COLS = 2;
  const [c, g] = cv(CW * COLS, CH);
  const rng = makeRng(8081);
  const M = 15;
  for (let d = 0; d < 2; d++) {
    g.save(); g.translate(d * CW, 0);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    g.fillStyle = ink(255, d ? 226 : 200); g.fillRect(0, 0, CW, CH);
    for (let i = 0; i < 130; i++) {              // crinkle highlights
      g.strokeStyle = `rgba(255,255,255,${rr(rng, 0.05, 0.26)})`;
      g.lineWidth = rr(rng, 0.6, 2.4);
      g.beginPath();
      let x = rng() * CW, y = rng() * CH;
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) g.lineTo(x += rr(rng, -18, 18), y += rr(rng, -18, 18));
      g.stroke();
    }
    if (d === 0) {
      g.fillStyle = ink(215, 252);
      g.beginPath(); g.ellipse(CW * 0.56, CH * 0.56, 40, 26, 0, 0, 6.29); g.fill();
      g.fillStyle = ink(24, 250); g.fillRect(M + 4, CH * 0.20, CW - M - 14, 27);
      g.fillStyle = ink(255, 44); g.fillRect(M + 12, CH * 0.245, CW - M - 34, 15);
    } else {
      g.fillStyle = ink(30, 250); g.fillRect(M + 2, CH * 0.30, CW - M - 8, 36);
      g.fillStyle = ink(255, 48); g.fillRect(M + 10, CH * 0.345, CW - M - 30, 17);
      g.fillStyle = ink(255, 130); g.fillRect(0, CH * 0.70, CW, 16);
    }
    g.fillStyle = ink(255, d ? 226 : 200); g.fillRect(0, 0, M, CH);
    g.fillStyle = ink(255, 118); g.fillRect(0, 0, CW, 11);
    g.fillStyle = ink(255, 118); g.fillRect(0, CH - 13, CW, 13);
    g.fillStyle = 'rgba(0,0,0,0.14)'; g.fillRect(M - 3, 0, 3, CH);
    g.restore();
  }
  return maskTex(THREE, c);
}

export function canMask(THREE) {
  const W = 96, H = 96;
  const [c, g] = cv(W, H);
  g.fillStyle = ink(255, 200); g.fillRect(0, 0, W, H);
  g.fillStyle = ink(12, 205); g.fillRect(0, 0, W, 11);      // steel lid
  g.fillStyle = ink(12, 160); g.fillRect(0, H - 10, W, 10); // base rim
  g.fillStyle = ink(255, 228); g.fillRect(0, 11, W, H - 21);
  g.fillStyle = ink(120, 250); g.fillRect(0, 36, W, 26);    // pale label band
  g.fillStyle = ink(255, 60); g.fillRect(6, 41, W - 12, 10);// dark brand type
  g.fillStyle = ink(220, 150); g.fillRect(12, 53, W - 24, 6);
  g.fillStyle = ink(255, 252); g.fillRect(0, 30, W, 4);
  g.fillStyle = ink(255, 252); g.fillRect(0, 65, W, 3);
  g.fillStyle = ink(255, 130); g.fillRect(0, 74, W, 9);
  // cylindrical shading around the circumference
  const e = g.createLinearGradient(0, 0, W, 0);
  e.addColorStop(0, 'rgba(0,0,0,0.5)'); e.addColorStop(0.28, 'rgba(255,255,255,0.18)');
  e.addColorStop(0.55, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.globalCompositeOperation = 'multiply'; g.fillStyle = e; g.fillRect(0, 12, W, H - 23);
  g.globalCompositeOperation = 'source-over';
  return maskTex(THREE, c);
}

export function bottleMask(THREE) {
  const W = 64, H = 128;
  const [c, g] = cv(W, H);
  // lathe v: 0 = bottom of profile, 1 = top (cap)
  g.fillStyle = ink(255, 205); g.fillRect(0, 0, W, H);
  g.fillStyle = ink(255, 244); g.fillRect(0, H * 0.55, W, H * 0.45); // body sheen
  g.fillStyle = ink(190, 250); g.fillRect(0, H * 0.34, W, H * 0.34); // shrink label
  g.fillStyle = ink(255, 55); g.fillRect(4, H * 0.40, W - 8, 10);    // dark brand type
  g.fillStyle = ink(60, 250); g.fillRect(8, H * 0.52, W - 16, 7);
  g.fillStyle = ink(255, 250); g.fillRect(0, H * 0.325, W, 3);
  g.fillStyle = ink(255, 250); g.fillRect(0, H * 0.665, W, 3);
  g.fillStyle = ink(200, 90); g.fillRect(0, 0, W, H * 0.10);         // cap
  const e = g.createLinearGradient(0, 0, W, 0);
  e.addColorStop(0, 'rgba(0,0,0,0.55)'); e.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  e.addColorStop(0.6, 'rgba(0,0,0,0.05)'); e.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.globalCompositeOperation = 'multiply'; g.fillStyle = e; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return maskTex(THREE, c);
}

export function bagMask(THREE) {
  const W = 128, H = 128;
  const [c, g] = cv(W, H);
  const rng = makeRng(8080);
  g.fillStyle = ink(255, 200); g.fillRect(0, 0, W, H);
  // crinkle highlights
  for (let i = 0; i < 160; i++) {
    g.strokeStyle = `rgba(255,255,255,${rr(rng, 0.05, 0.3)})`;
    g.lineWidth = rr(rng, 0.6, 2.6);
    g.beginPath();
    let x = rng() * W, y = rng() * H;
    g.moveTo(x, y);
    for (let k = 0; k < 3; k++) g.lineTo(x += rr(rng, -18, 18), y += rr(rng, -18, 18));
    g.stroke();
  }
  g.fillStyle = ink(225, 252); g.beginPath();
  g.ellipse(W / 2, H * 0.52, W * 0.34, H * 0.22, 0, 0, 6.29); g.fill();
  g.fillStyle = ink(110, 250); g.fillRect(16, H * 0.24, W - 32, 24);  // wordmark plate
  g.fillStyle = ink(255, 50); g.fillRect(24, H * 0.28, W - 48, 13);
  g.fillStyle = ink(255, 175); g.fillRect(30, H * 0.70, W - 60, 9);
  g.fillStyle = ink(255, 120); g.fillRect(0, 0, W, 11);
  g.fillStyle = ink(255, 120); g.fillRect(0, H - 13, W, 13);
  return maskTex(THREE, c);
}

export function cartonMask(THREE) {
  const W = 128, H = 128;
  const [c, g] = cv(W, H);
  const rng = makeRng(606);
  g.fillStyle = ink(255, 210); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(0,0,0,${rr(rng, 0.02, 0.09)})`;
    g.fillRect(rng() * W, rng() * H, rr(rng, 2, 14), rr(rng, 1, 3));
  }
  g.fillStyle = ink(40, 245); g.fillRect(14, 34, W - 28, 46);
  g.fillStyle = ink(235, 120); g.fillRect(22, 42, W - 44, 12);
  g.fillStyle = ink(200, 170); g.fillRect(28, 60, W - 56, 8);
  g.strokeStyle = 'rgba(0,0,0,0.30)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// AISLE SIGN ATLAS — 4x4 cells of 512. 0..7 front panels, 8..15 back panels.
const CREAM = '#f1ead6', SAGE = '#7d8b58', SAGE_D = '#5f6c40', TERRA = '#c26333';

function fitText(g, txt, cx, y, maxW, px, weight = '700') {
  g.font = `${weight} ${px}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  let w = g.measureText(txt).width;
  const sx = Math.min(1, maxW / w);
  g.save();
  g.translate(cx, y); g.scale(sx, 1);
  g.fillText(txt, 0, 0);
  g.restore();
}

export function signAtlas(THREE, aisles) {
  const S = 512, N = 4, SIZE = S * N;
  const [c, g] = cv(SIZE, SIZE);
  g.clearRect(0, 0, SIZE, SIZE);
  g.textAlign = 'center'; g.textBaseline = 'middle';

  const cell = (i) => [(i % N) * S, Math.floor(i / N) * S];

  for (let a = 0; a < 8; a++) {
    const info = aisles[a % aisles.length];
    // ---- front panel
    let [ox, oy] = cell(a);
    g.save(); g.translate(ox, oy);
    g.fillStyle = CREAM; g.fillRect(0, 0, S, S);
    g.fillStyle = '#dcd3bc'; g.fillRect(0, 0, S, 12); g.fillRect(0, S - 16, S, 16);
    g.fillStyle = TERRA; g.fillRect(0, 96, S, 7);
    // number roundel
    g.fillStyle = TERRA; g.beginPath(); g.arc(S / 2, 54, 44, 0, 6.29); g.fill();
    g.strokeStyle = '#f5eedc'; g.lineWidth = 5; g.stroke();
    g.fillStyle = '#fffaf0';
    fitText(g, String(a + 1), S / 2, 58, 62, 64, '800');
    // category rows
    const rows = info.sign;
    const top = 118, avail = S - top - 26;
    const rh = avail / rows.length;
    for (let r = 0; r < rows.length; r++) {
      const y = top + r * rh;
      g.fillStyle = r % 2 ? SAGE_D : SAGE;
      g.fillRect(14, y + 3, S - 28, rh - 9);
      g.fillStyle = TERRA; g.fillRect(14, y + rh - 8, S - 28, 4);
      g.fillStyle = '#fdf7e6';
      fitText(g, rows[r], S / 2, y + rh / 2 - 2, S - 56, Math.min(56, rh * 0.62), '700');
    }
    g.restore();

    // ---- back panel: giant number, readable from the far end
    [ox, oy] = cell(8 + a);
    g.save(); g.translate(ox, oy);
    g.fillStyle = SAGE; g.fillRect(0, 0, S, S);
    g.fillStyle = CREAM; g.fillRect(16, 16, S - 32, S - 32);
    g.fillStyle = TERRA; g.fillRect(16, 16, S - 32, 74);
    g.fillStyle = '#fdf7e6';
    fitText(g, 'AISLE', S / 2, 55, S - 90, 54, '800');
    g.fillStyle = '#43482f';
    fitText(g, String(a + 1), S / 2, 300, S - 90, 330, '800');
    g.fillStyle = TERRA; g.fillRect(16, S - 46, S - 32, 30);
    g.restore();
  }
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// BLADE SIGNS — small mid-aisle markers, 8 cells stacked 512x128.
export function bladeAtlas(THREE, aisles) {
  // ROUND-4b. These were a SAGE field with cream text — the same green as the
  // back-wall decor band and as the PRODUCE department sign. Looking down an
  // aisle you therefore got three unrelated green rectangles at three different
  // depths stacked on top of one another, and the blind critic read the nearest
  // one as "a grey banner with a corrupted texture occluding the PRODUCE sign".
  // It was neither grey nor corrupted: it was a sage blade seen at 5 degrees
  // off edge-on, in front of a sage band, in front of a sage sign.
  // A real category blade is a light panel with DARK type on it, which is also
  // the only version that stays legible at the grazing angle these are always
  // seen at — and legibility here is load-bearing, the player navigates by it.
  const W = 512, H = 128;
  const [c, g] = cv(W, H * 8);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let a = 0; a < 8; a++) {
    const info = aisles[a % aisles.length];
    g.save(); g.translate(0, a * H);
    g.fillStyle = '#f6f0dd'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e6dcc0'; g.fillRect(0, H - 11, W, 11);   // shadowed bottom edge
    g.fillStyle = TERRA; g.fillRect(0, 0, 132, H);
    g.fillStyle = 'rgba(0,0,0,0.20)'; g.fillRect(132, 0, 5, H);
    g.fillStyle = '#fffaf0';
    fitText(g, String(a + 1), 66, H / 2 + 4, 104, 104, '800');
    g.fillStyle = '#37402a';
    fitText(g, info.blade, 132 + (W - 132) / 2, H / 2, W - 168, 58, '700');
    g.restore();
  }
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// DEPARTMENT WALL SIGNS + storefront banners — 4 cells of 1024x256.
export function wallSignAtlas(THREE, words) {
  const W = 1024, H = 256;
  const [c, g] = cv(W, H * words.length);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  words.forEach((w, i) => {
    g.save(); g.translate(0, i * H);
    g.fillStyle = w.bg; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(0, H - 22, W, 22);
    g.fillStyle = w.fg;
    fitText(g, w.t, W / 2, H / 2, W - 90, 150, '800');
    g.restore();
  });
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// LANE NUMBERS — 8 cells of 256x256 for the checkout lane lightboxes.
export function laneAtlas(THREE) {
  const S = 256;
  const [c, g] = cv(S * 4, S * 2);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    const ox = (i % 4) * S, oy = Math.floor(i / 4) * S;
    g.save(); g.translate(ox, oy);
    g.fillStyle = '#fdfaf0'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#c8402c'; g.fillRect(0, 0, S, 34); g.fillRect(0, S - 34, S, 34);
    g.fillStyle = '#20242c';
    fitText(g, String(i + 1), S / 2, S / 2 + 6, S - 70, 168, '800');
    g.restore();
  }
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 16 });
}

// ENDCAP PROMO SIGNS — 4 cells of 512x256, loud red discount boards.
export function promoAtlas(THREE) {
  const W = 512, H = 256, n = 4;
  const [c, g] = cv(W, H * n);
  const rng = makeRng(2468);
  const copy = [['SALE', '2 FOR $5'], ['LOW', 'PRICE'], ['SAVE', '$1.50'], ['BOGO', 'FREE']];
  for (let i = 0; i < n; i++) {
    g.save(); g.translate(0, i * H);
    g.fillStyle = i % 2 ? '#c8281c' : '#ffd21e'; g.fillRect(0, 0, W, H);
    g.fillStyle = i % 2 ? '#ffd21e' : '#c8281c'; g.fillRect(0, 0, W, 20); g.fillRect(0, H - 20, W, 20);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = i % 2 ? '#fffaf0' : '#20242c';
    fitText(g, copy[i][0], W / 2, 82, W - 60, 92, '800');
    g.fillStyle = i % 2 ? '#ffd21e' : '#c8281c';
    g.fillRect(30, 130, W - 60, 92);
    g.fillStyle = i % 2 ? '#20242c' : '#fffaf0';
    fitText(g, copy[i][1], W / 2, 176, W - 90, 78, '800');
    g.restore();
  }
  return tex(THREE, c, { rx: 1, ry: 1, aniso: 8 });
}

// GLOW — soft radial/elliptical smear used for floor reflections & light bloom.
export function glowTex(THREE) {
  const N = 128;
  const [c, g] = cv(N, N);
  const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grd.addColorStop(0, 'rgba(255,252,238,1)');
  grd.addColorStop(0.25, 'rgba(255,250,232,0.55)');
  grd.addColorStop(0.6, 'rgba(252,246,225,0.16)');
  grd.addColorStop(1, 'rgba(250,244,220,0)');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// WALL — painted drywall with a faint roller mottle.
export function wallTex(THREE) {
  const N = 256;
  const [c, g] = cv(N, N);
  const rng = makeRng(515);
  g.fillStyle = '#ece2cc'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 800; i++) {
    g.fillStyle = `rgba(${ri(rng, 190, 250)},${ri(rng, 180, 235)},${ri(rng, 160, 210)},${rr(rng, 0.05, 0.2)})`;
    g.beginPath(); g.ellipse(rng() * N, rng() * N, rr(rng, 3, 22), rr(rng, 3, 18), 0, 0, 6.29); g.fill();
  }
  return tex(THREE, c, { rx: 1, ry: 1 });
}

// COOLER INTERIOR BACKDROP — blurry rows of frozen boxes behind the glass.
export function coolerBackTex(THREE) {
  const W = 256, H = 256;
  const [c, g] = cv(W, H);
  const rng = makeRng(9191);
  g.fillStyle = '#cfd6d8'; g.fillRect(0, 0, W, H);
  for (let row = 0; row < 5; row++) {
    const y = row * (H / 5);
    g.fillStyle = 'rgba(30,36,42,0.55)'; g.fillRect(0, y, W, 5);
    let x = 0;
    while (x < W) {
      const w = rr(rng, 10, 26);
      g.fillStyle = `hsl(${ri(rng, 0, 359)} ${ri(rng, 25, 70)}% ${ri(rng, 45, 78)}%)`;
      g.fillRect(x, y + 5, w - 1.5, H / 5 - 7);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(x + 1, y + 12, w - 4, rr(rng, 4, 10));
      x += w;
    }
  }
  g.fillStyle = 'rgba(180,205,215,0.25)'; g.fillRect(0, 0, W, H);
  return tex(THREE, c, { rx: 1, ry: 1 });
}

// ---------------------------------------------------------------------------
// WHAT IS OUTSIDE THE FRONT DOOR. Round 4's storefront was a single flat plate
// of 0xd9e6ee — one of the loudest CG shapes in the frame, because a real
// storefront is the brightest thing in the picture AND the most structured:
// blown-out sky over a dark canopy soffit, a car park washing out to nothing,
// bollards and a cart corral in near-silhouette against it. The value range
// matters more than the content: the top of the glass clips to white and the
// bottom sits two stops under the sales floor.
export function outsideTex(THREE) {
  const W = 256, H = 256;
  const [c, g] = cv(W, H);
  const rng = makeRng(0x0d0072);
  // sky -> haze -> asphalt
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0.00, '#ffffff');
  sky.addColorStop(0.30, '#f4f8fb');
  sky.addColorStop(0.52, '#e8eef0');
  sky.addColorStop(0.58, '#cfd4d1');
  sky.addColorStop(0.66, '#a9aca4');
  sky.addColorStop(1.00, '#8e9089');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // canopy soffit eating the top third — this is what stops the plate reading
  // as one flat sheet of light
  g.fillStyle = '#6d6a60'; g.fillRect(0, 0, W, H * 0.16);
  g.fillStyle = '#4b4841'; g.fillRect(0, H * 0.155, W, 3);
  for (let x = 6; x < W; x += 26) { g.fillStyle = '#7e7a6e'; g.fillRect(x, 0, 2, H * 0.155); }
  // distant treeline / low buildings on the horizon
  g.fillStyle = 'rgba(96,104,92,0.55)';
  for (let x = -10; x < W; x += 9) {
    g.beginPath();
    g.ellipse(x + rr(rng, -3, 3), H * 0.545, rr(rng, 5, 13), rr(rng, 3, 9), 0, 0, 6.29);
    g.fill();
  }
  g.fillStyle = 'rgba(120,124,128,0.6)';
  for (let i = 0; i < 5; i++) {
    const w = rr(rng, 18, 44);
    g.fillRect(rng() * W, H * 0.50 - rr(rng, 4, 14), w, 18);
  }
  // parked cars: flat silhouettes, roofline only
  for (let i = 0; i < 7; i++) {
    const x = rng() * W, w = rr(rng, 22, 40), h = w * rr(rng, 0.22, 0.30);
    const y = H * rr(rng, 0.60, 0.72);
    g.fillStyle = `rgba(${ri(rng, 40, 130)},${ri(rng, 42, 130)},${ri(rng, 46, 135)},0.72)`;
    g.beginPath();
    g.moveTo(x, y + h); g.lineTo(x + w * 0.10, y + h * 0.35);
    g.lineTo(x + w * 0.34, y); g.lineTo(x + w * 0.68, y);
    g.lineTo(x + w * 0.92, y + h * 0.40); g.lineTo(x + w, y + h);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(x + w * 0.20, y + h * 0.30, w * 0.5, 1.5);
  }
  // asphalt: sun glare band, then dirt
  const asf = g.createLinearGradient(0, H * 0.72, 0, H);
  asf.addColorStop(0, '#9b9c94'); asf.addColorStop(1, '#6f7069');
  g.fillStyle = asf; g.fillRect(0, H * 0.72, W, H * 0.28);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${ri(rng, 60, 190)},${ri(rng, 60, 190)},${ri(rng, 60, 185)},0.20)`;
    g.fillRect(rng() * W, H * 0.72 + rng() * H * 0.28, rr(rng, 1, 9), rr(rng, 1, 3));
  }
  // painted stall lines running away
  g.strokeStyle = 'rgba(250,246,230,0.55)'; g.lineWidth = 1.6;
  for (let i = 0; i < 9; i++) {
    const x = i * (W / 8) + 4;
    g.beginPath(); g.moveTo(x, H); g.lineTo(x * 0.72 + W * 0.14, H * 0.755); g.stroke();
  }
  return tex(THREE, c, { rx: 1, ry: 1 });
}

// AUTOMATIC-DOOR DECALS + the hours plate. 4 cells across, one row.
//   0 CAUTION / AUTOMATIC DOOR   1 IN     2 OUT    3 store hours block
export function doorDecalAtlas(THREE) {
  const W = 512, H = 128, COLS = 4;
  const [c, g] = cv(W, H);
  const cw = W / COLS;
  g.clearRect(0, 0, W, H);
  const cell = (i, fn) => { g.save(); g.translate(i * cw, 0); fn(); g.restore(); };
  cell(0, () => {
    g.fillStyle = '#f5c11f'; g.fillRect(6, 22, cw - 12, 84);
    g.fillStyle = '#1a1a1a'; g.fillRect(6, 22, cw - 12, 22);
    g.fillStyle = '#f5c11f'; g.font = 'bold 15px Helvetica, Arial'; g.textAlign = 'center';
    g.fillText('CAUTION', cw / 2, 39);
    g.fillStyle = '#1a1a1a'; g.font = 'bold 17px Helvetica, Arial';
    g.fillText('AUTOMATIC', cw / 2, 68);
    g.fillText('DOOR', cw / 2, 88);
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 3; g.strokeRect(6, 22, cw - 12, 84);
  });
  cell(1, () => {
    g.fillStyle = '#1f6f3a'; g.beginPath(); g.arc(cw / 2, 64, 44, 0, 6.29); g.fill();
    g.fillStyle = '#ffffff'; g.font = 'bold 34px Helvetica, Arial'; g.textAlign = 'center';
    g.fillText('IN', cw / 2, 76);
  });
  cell(2, () => {
    g.fillStyle = '#a8331f'; g.beginPath(); g.arc(cw / 2, 64, 44, 0, 6.29); g.fill();
    g.fillStyle = '#ffffff'; g.font = 'bold 28px Helvetica, Arial'; g.textAlign = 'center';
    g.fillText('OUT', cw / 2, 74);
  });
  cell(3, () => {
    g.fillStyle = 'rgba(255,255,255,0.94)'; g.fillRect(10, 10, cw - 20, 108);
    g.fillStyle = '#23262a'; g.font = 'bold 14px Helvetica, Arial'; g.textAlign = 'center';
    g.fillText('STORE HOURS', cw / 2, 30);
    g.font = '11px Helvetica, Arial';
    const rows = ['MON - SAT   6A - 11P', 'SUNDAY      7A - 10P', 'PHARMACY   9A - 8P'];
    rows.forEach((t, i) => g.fillText(t, cw / 2, 52 + i * 17));
    g.fillStyle = '#a8331f'; g.fillRect(10, 10, cw - 20, 6);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// EXIT boxes over the two doors. Cell 0 = Door 1, cell 1 = Door 2 — the same
// sign with a different sub-legend, because the chase dispatches by door and
// the player has to be able to tell which one he is looking at.
export function exitSignAtlas(THREE) {
  const W = 512, H = 160, COLS = 2;
  const [c, g] = cv(W, H);
  const cw = W / COLS;
  for (let i = 0; i < COLS; i++) {
    g.save(); g.translate(i * cw, 0);
    g.fillStyle = '#101418'; g.fillRect(0, 0, cw, H);
    g.fillStyle = '#1d2228'; g.fillRect(4, 4, cw - 8, H - 8);
    // the lit legend: emissive green on black, with the diffuser's bloom
    g.shadowColor = '#7bef6a'; g.shadowBlur = 22;
    g.fillStyle = '#8ef07a';
    g.font = 'bold 84px Helvetica, Arial'; g.textAlign = 'center';
    g.fillText('EXIT', cw / 2, 92);
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(190,246,180,0.85)';
    g.font = 'bold 22px Helvetica, Arial';
    g.fillText(i ? 'DOOR 2' : 'DOOR 1', cw / 2, 128);
    g.strokeStyle = '#39424a'; g.lineWidth = 4; g.strokeRect(4, 4, cw - 8, H - 8);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
