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
      const n = 900;
      for (let i = 0; i < n; i++) {
        const x = tx * S + rng() * S, y = ty * S + rng() * S;
        const v = rng();
        if (v < 0.42) g.fillStyle = `hsl(${h - 6} ${s + 8}% ${l - 16}%)`;
        else if (v < 0.72) g.fillStyle = `hsl(${h + 8} ${s + 4}% ${l + 8}%)`;
        else if (v < 0.9) g.fillStyle = `hsl(${h + 2} ${s}% ${l - 7}%)`;
        else g.fillStyle = `hsl(${h - 14} ${s + 16}% ${l - 26}%)`;
        const w = rr(rng, 1.2, 3.4), hh = rr(rng, 1.2, 3.0);
        g.fillRect(x, y, w, hh);
      }
      // grout / tile seam
      g.strokeStyle = 'rgba(104,94,78,0.46)'; g.lineWidth = 1.8;
      g.strokeRect(tx * S + 0.75, ty * S + 0.75, S - 1.5, S - 1.5);
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
  return tex(THREE, c, { rx: 1, ry: 1 });
}

// ---------------------------------------------------------------------------
// CEILING — 2ft acoustic drop tile with T-bar grid. 4x4 tiles => 2.44 m repeat.
export function ceilTex(THREE) {
  const N = 512, T = 4, S = N / T;
  const [c, g] = cv(N, N);
  const rng = makeRng(90210);
  g.fillStyle = '#e9e3d3'; g.fillRect(0, 0, N, N);
  for (let ty = 0; ty < T; ty++) for (let tx = 0; tx < T; tx++) {
    g.fillStyle = hsl(rr(rng, 38, 46), rr(rng, 14, 20), rr(rng, 87, 91));
    g.fillRect(tx * S + 2, ty * S + 2, S - 4, S - 4);
    // fissured / pinhole acoustic texture
    for (let i = 0; i < 700; i++) {
      g.fillStyle = `rgba(140,132,116,${rr(rng, 0.05, 0.22)})`;
      g.fillRect(tx * S + rng() * S, ty * S + rng() * S, rr(rng, 1, 2.6), rr(rng, 1, 2.6));
    }
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(150,142,124,${rr(rng, 0.05, 0.16)})`;
      g.lineWidth = rr(rng, 1, 2.6);
      g.beginPath();
      let x = tx * S + rng() * S, y = ty * S + rng() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) g.lineTo(x += rr(rng, -22, 22), y += rr(rng, -22, 22));
      g.stroke();
    }
  }
  // T-bar
  for (let i = 0; i <= T; i++) {
    g.fillStyle = '#c9c2b0';
    g.fillRect(i * S - 2.5, 0, 5, N);
    g.fillRect(0, i * S - 2.5, N, 5);
    g.fillStyle = 'rgba(255,252,242,0.75)';
    g.fillRect(i * S - 1, 0, 1.4, N);
    g.fillRect(0, i * S - 1, N, 1.4);
  }
  return tex(THREE, c, { rx: 1, ry: 1 });
}

// ---------------------------------------------------------------------------
// LIGHT STRIP — one 2.44 m run of a 2-tube fluorescent strip fixture.
export function stripTex(THREE) {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#cfcabb'; g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#e5e1d2'; g.fillRect(0, 4, 256, 56);
  const tube = (y0, y1) => {
    const grd = g.createLinearGradient(0, y0, 0, y1);
    grd.addColorStop(0, '#e9eede');
    grd.addColorStop(0.35, '#fffef4');
    grd.addColorStop(0.6, '#ffffff');
    grd.addColorStop(1, '#eef2e0');
    g.fillStyle = grd; g.fillRect(6, y0, 244, y1 - y0);
  };
  tube(10, 27); tube(35, 52);
  // socket end caps
  g.fillStyle = '#a8a394'; g.fillRect(0, 4, 8, 56); g.fillRect(248, 4, 8, 56);
  g.fillStyle = 'rgba(120,116,104,0.5)'; g.fillRect(0, 28, 256, 6);
  return tex(THREE, c, { rx: 1, ry: 1 });
}

// ---------------------------------------------------------------------------
// PRICE RAIL — 1.0 m of shelf lip: cream channel packed with little tags.
export function railTex(THREE) {
  const N = 512, H = 56;
  const [c, g] = cv(N, H);
  const rng = makeRng(31337);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.30, '#f5f0e2');
  grd.addColorStop(0.75, '#e2dbc9');
  grd.addColorStop(1, '#b9b1a0');
  g.fillStyle = grd; g.fillRect(0, 0, N, H);
  g.fillStyle = 'rgba(120,112,98,0.35)'; g.fillRect(0, 0, N, 3);
  let x = 3;
  while (x < N - 6) {
    const w = rr(rng, 22, 44);
    const sale = rng() < 0.22, tagStyle = rng();
    g.fillStyle = sale ? '#ffe14a' : (tagStyle < 0.12 ? '#ffd6dd' : '#fffdf6');
    g.fillRect(x, 7, w - 2, H - 16);
    g.strokeStyle = 'rgba(90,84,72,0.35)'; g.lineWidth = 1;
    g.strokeRect(x + 0.5, 7.5, w - 3, H - 17);
    // price digits + a barcode smear
    g.fillStyle = sale ? '#c02318' : '#2c2a26';
    g.fillRect(x + 3, 12, Math.max(6, (w - 10) * rr(rng, 0.4, 0.75)), 11);
    g.fillStyle = 'rgba(50,46,40,0.75)';
    for (let b = x + 3; b < x + w - 5; b += 2.4) {
      if (rng() < 0.6) g.fillRect(b, 27, rr(rng, 0.7, 1.6), 9);
    }
    if (sale) { g.fillStyle = '#c02318'; g.fillRect(x + 1, H - 9, w - 4, 3); }
    x += w + rr(rng, 1, 5);
  }
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
    // barcode patch, bottom-right of the printed face
    g.fillStyle = ink(16, 250); g.fillRect(W - 40, H - 21, 34, 16);
    g.fillStyle = ink(16, 24);
    for (let x = W - 37; x < W - 9; x += 2.6) g.fillRect(x, H - 19, 1.2, 11);
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
  const W = 512, H = 128;
  const [c, g] = cv(W, H * 8);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let a = 0; a < 8; a++) {
    const info = aisles[a % aisles.length];
    g.save(); g.translate(0, a * H);
    g.fillStyle = SAGE; g.fillRect(0, 0, W, H);
    g.fillStyle = '#4e5936'; g.fillRect(0, H - 9, W, 9);
    g.fillStyle = TERRA; g.fillRect(0, 0, 132, H);
    g.fillStyle = '#fffaf0';
    fitText(g, String(a + 1), 66, H / 2 + 4, 104, 104, '800');
    g.fillStyle = '#fdf7e6';
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
