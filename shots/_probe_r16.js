// builder-store r16 probe. Paste-able into the page; owns nothing else.
// Renders depiction motifs through a JS copy of chopPackageMat's decode so the
// mask-channel canvas can be judged as the shader will actually show it.
window.__R16 = (() => {
  const STOCK = [0.855, 0.845, 0.822];
  // The four food swatches, copied from chopPackageMat. If this drifts from the
  // shader the sheet lies, so it is asserted against a known texel below.
  const SW = [[0.92, 0.58, 0.17], [0.34, 0.64, 0.14], [0.80, 0.115, 0.065], [0.95, 0.735, 0.255]];
  const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function decodePx(r, g, b, brand) {
    const scaled = (b / 255) * 4;
    const band = Math.min(3, Math.floor(scaled));
    const amt = Math.max(0, Math.min(1, scaled - band));
    const food = SW[band];
    const rr = r / 255, gg = g / 255;
    const out = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let base = STOCK[k] * (1 - rr) + brand[k] * rr;
      base = base * (1 - amt) + food[k] * amt;
      out[k] = base * (0.045 + 0.955 * gg);
    }
    return out;
  }
  // Apply the decode to a whole canvas in place.
  function decodeCanvas(cv, brandHex) {
    const b = [((brandHex >> 16) & 255) / 255, ((brandHex >> 8) & 255) / 255, (brandHex & 255) / 255]
      .map(s2l);
    const g = cv.getContext('2d');
    const im = g.getImageData(0, 0, cv.width, cv.height);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const o = decodePx(d[i], d[i + 1], d[i + 2], b);
      d[i] = Math.round(255 * Math.max(0, Math.min(1, l2s(o[0]))));
      d[i + 1] = Math.round(255 * Math.max(0, Math.min(1, l2s(o[1]))));
      d[i + 2] = Math.round(255 * Math.max(0, Math.min(1, l2s(o[2]))));
      d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return cv;
  }

  async function post(name, cv) {
    const res = await fetch('/shot?name=' + encodeURIComponent(name),
      { method: 'POST', body: cv.toDataURL('image/png') });
    return res.text();
  }

  // A grid of every motif, drawn at `cell` px, decoded, labelled.
  async function motifSheet(name, D, cell = 150, cols = 10, brands = null) {
    const keys = Object.keys(D.MOTIF);
    const seen = new Map();
    for (const k of keys) if (!seen.has(D.MOTIF[k])) seen.set(D.MOTIF[k], k);
    const rows = Math.ceil(seen.size / cols);
    const lab = 22;
    const cv = document.createElement('canvas');
    cv.width = cols * cell; cv.height = rows * (cell + lab);
    const g = cv.getContext('2d');
    g.fillStyle = 'rgb(0,215,0)'; g.fillRect(0, 0, cv.width, cv.height);
    let i = 0;
    const pal = brands || [0xd8442f, 0x2f6ed8, 0xe0a52a, 0x2f9e58, 0x8b3fa8, 0xd8442f];
    const rng = mulberry(0xD1CE);
    for (const [motif, sku] of seen) {
      const cx0 = (i % cols) * cell, cy0 = Math.floor(i / cols) * (cell + lab);
      // a per-cell brand patch, decoded with its own brand colour
      const sub = document.createElement('canvas'); sub.width = cell; sub.height = cell;
      const sg = sub.getContext('2d');
      sg.fillStyle = 'rgb(0,250,0)'; sg.fillRect(0, 0, cell, cell);
      D.depict(sg, cell * 0.5, cell * 0.5, cell * 0.36, cell * 0.36, rng, { desc: sku, cls: '' });
      decodeCanvas(sub, pal[i % pal.length]);
      g.drawImage(sub, cx0, cy0);
      g.fillStyle = '#000'; g.fillRect(cx0, cy0 + cell, cell, lab);
      g.fillStyle = '#fff'; g.font = '11px Helvetica'; g.textAlign = 'center';
      g.fillText(motif, cx0 + cell / 2, cy0 + cell + 10);
      g.fillStyle = '#9cf'; g.font = '9px Helvetica';
      g.fillText(sku.slice(0, 26), cx0 + cell / 2, cy0 + cell + 20);
      i++;
    }
    return post(name, cv);
  }

  // The atlases themselves, decoded, so a facing can be read as printed.
  async function atlasSheet(name, texKey, brandHex = 0xd8442f, scale = 1) {
    const T = window.__CHOP.THREE;
    const tex = window.__R16_TEX && window.__R16_TEX[texKey];
    if (!tex) return 'no tex ' + texKey;
    const src = tex.image;
    const cv = document.createElement('canvas');
    cv.width = src.width * scale; cv.height = src.height * scale;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(src, 0, 0, cv.width, cv.height);
    decodeCanvas(cv, brandHex);
    return post(name, cv);
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // SELF-CHECK on the decoder: a texel written by depict.js's F(RED, 0.98, 168)
  // must come back red, not golden. If the swatch table here drifts from the
  // shader's, every sheet this probe produces is a lie and it should say so.
  function decodeCheck() {
    const foodB = (band, amt) => band * 64 + Math.round(Math.min(0.97, Math.max(0.05, amt)) * 62);
    const red = decodePx(0, 168, foodB(2, 0.98), [0.2, 0.2, 0.2]);
    const grn = decodePx(0, 168, foodB(1, 0.95), [0.2, 0.2, 0.2]);
    const ok = red[0] > red[1] * 2.2 && grn[1] > grn[0] * 1.4;
    return { ok, red: red.map((v) => +v.toFixed(3)), green: grn.map((v) => +v.toFixed(3)) };
  }

  return { decodePx, decodeCanvas, motifSheet, atlasSheet, decodeCheck, mulberry, post };
})();

// ---------------------------------------------------------------------------
// THE DELIVERABLE SHEET: a dozen varied facings at CHASE RANGE, plus the same
// twelve enlarged so a critic can read what it is looking at.
//
// "Chase range" is computed, not eyeballed. probeCam runs fov 52 vertical at
// 1280x720, so the horizontal fov is 2*atan(tan(26deg) * 16/9) = 81.8deg and
// the frame spans 1.734 * d metres over 1280 px. A carton facing is 0.20 m, so
//     d = 1.5 m -> 98 px      d = 2.5 m -> 59 px      d = 1.75 m -> 84 px
// The top row is drawn at 84 px wide. That is the size the thing is actually
// judged at; the 4x row underneath is only so the label can be checked.
window.__R16.facingSheet = async function facingSheet(name, opts = {}) {
  const R = window.__R16;
  const near = opts.near || 84;              // px across a 0.20 m facing at 1.75 m
  const big = opts.big || 4;
  const C = window.__CHOP;
  // NO CACHE-BUSTER. '?v=' + Date.now() loads a SECOND instance of the module
  // with its own empty CELL_LOG, and the first sheet duly labelled all twelve
  // facings "?" / "motif —" while the pictures next to them were correct.
  const PK = await import('/src/store/pack.js');
  const log = PK.CELL_LOG;
  // find each atlas image off the live scene
  const img = {};
  C.scene.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of ms) {
      const im = m.map && m.map.image; if (!im) continue;
      if (im.width === 2040) img.carton = im;
      if (im.width === 1280 && im.height === 640) img.pouch = im;
      if (im.width === 1280 && im.height === 480) img.can = im;
      if (im.width === 1024 && im.height === 680) img.bottle = im;
    }
  });
  const GRID = {
    carton: { cols: 6, cw: 340, ch: 420, wrap: 0.150 },
    pouch: { cols: 4, cw: 320, ch: 320, wrap: 0.135 },
    can: { cols: 4, cw: 320, ch: 240, wrap: 0 },
    bottle: { cols: 4, cw: 256, ch: 340, wrap: 0 },
  };
  const pick = opts.cells || [
    ['carton', 0], ['carton', 5], ['carton', 11], ['carton', 14], ['carton', 20],
    ['pouch', 1], ['pouch', 4], ['pouch', 6],
    ['can', 0], ['can', 3], ['bottle', 1], ['bottle', 5],
  ];
  const pal = [0xd8442f, 0x2f6ed8, 0xe0a52a, 0x2f9e58, 0x8b3fa8, 0xc23b6a,
    0x1f8f8a, 0xd06a1f, 0x4a54b0, 0x2f9e58, 0xd8442f, 0x2f6ed8];
  const bigW = Math.round(near * big), pad = 14, lab = 46;
  const cols = pick.length;
  const cv = document.createElement('canvas');
  const rowH = Math.round(bigW * 1.30);
  cv.width = cols * (bigW + pad) + pad;
  cv.height = pad + Math.round(near * 1.35) + 26 + rowH + lab + pad;
  const g = cv.getContext('2d');
  g.fillStyle = '#141414'; g.fillRect(0, 0, cv.width, cv.height);

  for (let n = 0; n < pick.length; n++) {
    const [atlas, i] = pick[n];
    const G = GRID[atlas], src = img[atlas];
    if (!src) continue;
    const sx = (i % G.cols) * G.cw + G.cw * G.wrap;      // skip the plain wrap column
    const sy = Math.floor(i / G.cols) * G.ch;
    const sw = G.cw * (1 - G.wrap), sh = G.ch;
    const face = document.createElement('canvas');
    face.width = sw; face.height = sh;
    face.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);
    R.decodeCanvas(face, pal[n % pal.length]);
    const x0 = pad + n * (bigW + pad);
    // --- row 1: TRUE chase-range size, nearest-neighbour off the same pixels
    const nh = Math.round(near * sh / sw);
    g.imageSmoothingEnabled = true;
    g.drawImage(face, x0 + (bigW - near) / 2, pad, near, nh);
    // --- row 2: the same facing at `big`x
    const y1 = pad + Math.round(near * 1.35) + 26;
    g.imageSmoothingEnabled = false;
    g.drawImage(face, x0, y1, bigW, Math.round(bigW * sh / sw));
    // --- label
    const rec = log.find((r) => r.atlas === atlas && r.i === i) || {};
    const ly = y1 + rowH + 12;
    g.textAlign = 'left'; g.font = 'bold 11px Helvetica'; g.fillStyle = '#fff';
    g.fillText((rec.desc || '?').slice(0, 24), x0, ly);
    g.font = '10px Helvetica'; g.fillStyle = '#7fd1ff';
    g.fillText('motif ' + (rec.motif || '—'), x0, ly + 13);
    g.fillStyle = '#888';
    g.fillText(atlas + ' #' + i + '  ' + (rec.cls || ''), x0, ly + 25);
  }
  g.textAlign = 'left'; g.font = 'bold 12px Helvetica'; g.fillStyle = '#ffd'; 
  g.fillText('TOP ROW = ' + near + ' px across the facing = 1.75 m from a 52° fov camera at 1280x720. '
    + 'BOTTOM = the same pixels at ' + big + 'x.', pad, cv.height - 6);
  return R.post(name, cv);
};
