// OWNER: builder-store. THE FACING SHEET — read the store's own packaging back.
//
// NOT IMPORTED BY THE GAME. Nothing in src/ imports this file, so the bundler
// never sees it and it costs the shipped build zero bytes. Load it from the
// console:  const S = await import('/src/store/sheet.js');
//
// =========================================================================
// ROUND 17 — WHY THE ROUND-16 SHEET COULD NOT SEE THE DEFECTS IT WAS BUILT
// TO FIND, AND WHY THIS ONE IS A FILE INSTEAD OF A PASTE.
//
// r16's facingSheet lived in shots/_probe_r16.js and decoded each atlas cell
// like this:
//
//     const pal = [0xd8442f, 0x2f6ed8, 0xe0a52a, ...];
//     R.decodeCanvas(face, pal[n % pal.length]);
//
// The brand colour is `pal[n % pal.length]` — THE COLUMN INDEX OF THE SHEET.
// Not the colour that cell is drawn with in the store; not any colour that cell
// is ever drawn with. So no facing on that sheet was a facing in the store, and
// the builder read its own work off it and shipped:
//
//     CORNERSTONE ALLERGY RELIEF   white caplet on white stock, invisible
//     KETTLE CREEK BEEF BROTH      white smear on blue
//     SUMMERLIN ROASTED PEANUTS    gold peanuts on an orange brand field
//
// Every one of those is a MOTIF-AGAINST-ITS-OWN-BRAND-COLOUR failure, which is
// precisely the axis a column-index palette randomises away.
//
// Three faults, all fixed here:
//
//   1. THE COLOUR IS SAMPLED FROM THE SCENE. census() walks the live
//      InstancedMeshes, reads each instance's `aCell` attribute for the cell it
//      points at and its `instanceColor` for the brand colour it is drawn with,
//      and the sheet decodes cell i with a colour some real instance of cell i
//      actually wears. It also reports HOW MANY instances that is, so a cell
//      with three facings in the whole store cannot masquerade as a typical one.
//
//   2. THE DECODE IS NOT A COPY. uPkgStock and uPkgSat are read off the LIVE
//      uniforms, and the four food swatches are parsed out of pack.js's shader
//      SOURCE over HTTP. r16's copy was missing uPkgSat entirely — the round-13
//      print-saturation term, x1.22 — so every colour on that sheet was 22% less
//      chromatic than the store's. CLAUDE.md's rule is that one piece of code
//      owns a derivation; where a second reader is unavoidable it reads the
//      first, and that is what parsing the source is for.
//
//   3. IT IS A FILE. A paste-in probe cannot be re-run by the next round
//      without the transcript it was pasted from.
// =========================================================================

import { ATLAS, ATLAS_ORDER } from './plan.js';

const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// --- the atlas images, found by their own declared grid ---------------------
// r16 matched `im.width === 2040`, which is ATLAS.carton.cols * .cw written out
// as a literal in a third file. Derived here, and asserted unique so a future
// grid change that collides two families fails loudly instead of silently
// labelling one atlas as the other.
export function atlasImages(scene) {
  const want = new Map();
  for (const k of ATLAS_ORDER) {
    const A = ATLAS[k];
    const key = (A.cols * A.cw) + 'x' + (A.rows * A.ch);
    if (want.has(key)) throw new Error('sheet.js: atlases ' + want.get(key) + ' and ' + k + ' share dimensions ' + key);
    want.set(key, k);
  }
  const out = {};
  scene.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
    for (const m of ms) {
      const im = m.map && m.map.image;
      if (!im) continue;
      const k = want.get(im.width + 'x' + im.height);
      if (k) out[k] = im;
    }
  });
  return out;
}

// --- the census: every package instance in the store ------------------------
// aCell holds the cell's UV ORIGIN, which is what the shader needs; the cell
// INDEX is recovered from it here rather than stored twice.
export function census(scene) {
  const byDims = new Map();
  for (const k of ATLAS_ORDER) {
    const A = ATLAS[k];
    byDims.set((A.cols * A.cw) + 'x' + (A.rows * A.ch), k);
  }
  const out = {};
  for (const k of ATLAS_ORDER) out[k] = new Map();
  let meshes = 0, instances = 0, unmatched = 0;
  scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const aCell = o.geometry.attributes && o.geometry.attributes.aCell;
    if (!aCell || !o.instanceColor) return;
    const im = o.material && o.material.map && o.material.map.image;
    const k = im && byDims.get(im.width + 'x' + im.height);
    if (!k) { unmatched++; return; }
    const A = ATLAS[k];
    const cols = A.cols, rows = A.rows;
    const col = o.instanceColor.array;
    meshes++;
    for (let i = 0; i < o.count; i++) {
      // invert Batch.build: u0 = (c%cols)/cols ; v0 = 1 - (floor(c/cols)+1)/rows
      const cx = Math.round(aCell.getX(i) * cols);
      const cy = rows - 1 - Math.round(aCell.getY(i) * rows);
      const idx = cy * cols + cx;
      const e = out[k].get(idx) || { n: 0, cols: [], meshes: new Set() };
      e.n++;
      // keep a bounded reservoir; a cell with 900 facings does not need 900
      // colours recorded to answer "what does this cell look like in the store"
      if (e.cols.length < 64) e.cols.push([col[i * 3], col[i * 3 + 1], col[i * 3 + 2]]);
      e.meshes.add(o.name || '?');
      out[k].set(idx, e);
      instances++;
    }
  });
  return { byAtlas: out, meshes, instances, unmatchedMeshes: unmatched };
}

// --- the decode, built from the live material and the live source -----------
export async function decoder(scene) {
  // THE LIVE UNIFORMS, not a copy of their initial values. pack.js publishes
  // both on scene.userData precisely so they can be swept and ablated from the
  // console; a sheet reading the module constants would silently disagree with
  // the picture the moment anybody did that.
  const stock = (scene.userData.chopPkgStock || (await import('./pack.js')).PKG_STOCK).value;
  const satU = scene.userData.chopPkgSat || (await import('./pack.js')).PKG_SAT;
  // PKG_STOCK's own comment says "filled with a THREE.Color below". It is a
  // Vector3. Reading `.r` off it returns undefined and every decoded pixel
  // comes out NaN -> 0, i.e. a black sheet, which is at least loud. Accept
  // both rather than trust the comment, and say so.
  const ST = stock.isVector3 ? [stock.x, stock.y, stock.z] : [stock.r, stock.g, stock.b];
  if (ST.some((v) => typeof v !== 'number')) throw new Error('sheet.js: cannot read uPkgStock');
  const SAT = satU.value;
  // the four food swatches, PARSED OUT OF THE SHADER SOURCE
  const src = await (await fetch('/src/store/pack.js')).text();
  const grab = (tag) => {
    const line = src.split('\n').find((l) => l.includes('vec3 ' + tag + ' = mix('));
    if (!line) throw new Error('sheet.js: cannot find shader line for ' + tag);
    const nums = [...line.matchAll(/vec3\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g)]
      .map((m) => [+m[1], +m[2], +m[3]]);
    if (nums.length !== 2) throw new Error('sheet.js: ' + tag + ' parsed ' + nums.length + ' swatches, want 2');
    return nums;
  };
  const SW = [...grab('f01'), ...grab('f23')];        // gold, green, red, cream
  const decodePx = (r, g, b, brandLin) => {
    const scaled = (b / 255) * 4;
    const band = Math.min(3, Math.floor(scaled));
    const amt = clamp01(scaled - band);
    const food = SW[band];
    const rr = r / 255, gg = g / 255;
    const o = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let base = ST[k] * (1 - rr) + brandLin[k] * rr;
      base = base * (1 - amt) + food[k] * amt;
      o[k] = base;
    }
    // PRINT SATURATION — the term r16's probe did not have. Rec.709 luma,
    // about the pixel's own luma, exactly as the shader does it.
    const y = 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2];
    for (let k = 0; k < 3; k++) o[k] = y + (o[k] - y) * SAT;
    const shade = 0.045 + 0.955 * gg;
    for (let k = 0; k < 3; k++) o[k] *= shade;
    return o;
  };
  const decodeCanvas = (cv, brandLin) => {
    const g = cv.getContext('2d');
    const im = g.getImageData(0, 0, cv.width, cv.height);
    const d = im.data;
    for (let i = 0; i < d.length; i += 4) {
      const o = decodePx(d[i], d[i + 1], d[i + 2], brandLin);
      d[i] = Math.round(255 * clamp01(l2s(o[0])));
      d[i + 1] = Math.round(255 * clamp01(l2s(o[1])));
      d[i + 2] = Math.round(255 * clamp01(l2s(o[2])));
      d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
    return cv;
  };
  return { decodePx, decodeCanvas, SW, ST, SAT, s2l, l2s };
}

async function post(name, cv) {
  const res = await fetch('/shot?name=' + encodeURIComponent(name),
    { method: 'POST', body: cv.toDataURL('image/png') });
  return res.text();
}

// Cell geometry in atlas pixels. `wrap` is the plain side-panel column the box
// UV mapping folds onto the sides; the FACE is what a shopper sees.
function faceRect(atlas, i) {
  const A = ATLAS[atlas];
  return {
    sx: (i % A.cols) * A.cw + A.cw * A.wrap,
    sy: Math.floor(i / A.cols) * A.ch,
    sw: A.cw * (1 - A.wrap),
    sh: A.ch,
    ox: A.cw * A.wrap,                       // face-local origin within the cell
  };
}

// --- THE SHEET --------------------------------------------------------------
// Chase range is computed, not eyeballed, and the derivation is r16's and still
// correct: probeCam is fov 52 vertical at 1280x720, so the horizontal fov is
// 2*atan(tan(26deg) * 16/9) = 81.8 deg and the frame spans 1.734 * d metres
// over 1280 px. A carton facing is 0.20 m wide:
//     d = 1.50 m -> 98 px     d = 1.75 m -> 84 px     d = 2.50 m -> 59 px
// The top row is 84 px. The 4x row underneath exists only so the label can be
// checked against the picture; it is not the size anything is judged at.
export async function facingSheet(name, opts = {}) {
  const C = window.__CHOP;
  const near = opts.near || 84, big = opts.big || 4;
  const PK = await import('./pack.js');
  const D = await decoder(C.scene);
  const img = atlasImages(C.scene);
  const cen = census(C.scene);
  const log = PK.CELL_LOG;

  // WHICH CELLS. Default: a spread across all four families chosen by INSTANCE
  // COUNT, so the sheet shows what the store is actually mostly made of rather
  // than whatever the first indices happen to be.
  let pick = opts.cells;
  if (!pick) {
    pick = [];
    for (const a of ATLAS_ORDER) {
      const rows = [...cen.byAtlas[a].entries()].sort((x, y) => y[1].n - x[1].n);
      const want = opts.per || { carton: 5, pouch: 3, can: 2, bottle: 2 }[a];
      for (let k = 0; k < want && k < rows.length; k++) pick.push([a, rows[k][0]]);
    }
  }
  const bigW = Math.round(near * big), pad = 14, lab = 62;
  const rowH = Math.round(bigW * 1.30);
  const cv = document.createElement('canvas');
  cv.width = pick.length * (bigW + pad) + pad;
  cv.height = pad + Math.round(near * 1.35) + 26 + rowH + lab + pad;
  const g = cv.getContext('2d');
  g.fillStyle = '#141414'; g.fillRect(0, 0, cv.width, cv.height);
  const used = [];

  for (let n = 0; n < pick.length; n++) {
    const [atlas, i] = pick[n];
    const src = img[atlas];
    if (!src) continue;
    const R = faceRect(atlas, i);
    const e = cen.byAtlas[atlas].get(i);
    // THE COLOUR: a real instance of THIS cell. opts.which selects which one so
    // a sweep can show the same facing under several of its own brand colours.
    const brand = e && e.cols.length
      ? e.cols[(opts.which || 0) % e.cols.length]
      : [0.5, 0.5, 0.5];
    const face = document.createElement('canvas');
    face.width = R.sw; face.height = R.sh;
    face.getContext('2d').drawImage(src, R.sx, R.sy, R.sw, R.sh, 0, 0, R.sw, R.sh);
    D.decodeCanvas(face, brand);
    const x0 = pad + n * (bigW + pad);
    const nh = Math.round(near * R.sh / R.sw);
    g.imageSmoothingEnabled = true;
    g.drawImage(face, x0 + (bigW - near) / 2, pad, near, nh);
    const y1 = pad + Math.round(near * 1.35) + 26;
    g.imageSmoothingEnabled = false;
    g.drawImage(face, x0, y1, bigW, Math.round(bigW * R.sh / R.sw));
    const rec = log.find((r) => r.atlas === atlas && r.i === i) || {};
    let ly = y1 + rowH + 12;
    g.textAlign = 'left'; g.font = 'bold 11px Helvetica'; g.fillStyle = '#fff';
    g.fillText((rec.desc || '?').slice(0, 26), x0, ly); ly += 13;
    g.font = '10px Helvetica'; g.fillStyle = '#9cf';
    g.fillText('motif ' + (rec.motif || '—'), x0, ly); ly += 12;
    g.fillStyle = '#c9a';
    g.fillText(atlas + '#' + i + '  ' + (e ? e.n : 0) + ' facings', x0, ly); ly += 12;
    // the brand colour actually used, printed as sRGB hex so it is checkable
    const hex = '#' + brand.map((v) => Math.round(255 * clamp01(l2s(v)))
      .toString(16).padStart(2, '0')).join('');
    g.fillStyle = '#888'; g.fillText('instance brand ' + hex, x0, ly);
    g.fillStyle = hex; g.fillRect(x0 + 108, ly - 8, 10, 9);
    used.push({ atlas, i, desc: rec.desc, motif: rec.motif, facings: e ? e.n : 0, brand: hex });
  }
  const path = await post(name, cv);
  return { path, used, censusMeshes: cen.meshes, censusInstances: cen.instances };
}

// --- THE ABLATION: bake the atlas with and without the depictions -----------
// This is the instrument the round is actually judged on, and it replaces
// contrastReport() below as the headline. The difference matters: a box-vs-ring
// contrast measure cannot tell a motif that does not read from a motif sitting
// on a background that happens to be busy, because both populations contain the
// ground. An ablation contains only the motif.
//
// Returns, per cell, over a REAL instance colour of that cell:
//   cover  fraction of the depiction box whose decoded pixels the motif changed
//   dY50   median |dY| over those pixels — how far the ink moved the picture
//   dY90   p90 |dY| — the strongest marks, which is what carries at 84 px
//   outside must be ZERO changed pixels, asserted, or the mute is not a mute.
export async function depictAblate(opts = {}) {
  const C = window.__CHOP;
  const T = C.THREE;
  const PK = await import('./pack.js');
  const D0 = await import('./depict.js');
  const D = await decoder(C.scene);
  const cen = census(C.scene);
  const keep = PK.CELL_LOG.length;
  const bakers = { carton: PK.cartonAtlas, pouch: PK.pouchAtlas, can: PK.canAtlas, bottle: PK.bottleAtlas };
  const only = opts.atlases || ATLAS_ORDER;
  const rows = [];
  const notes = [];
  const restore = [];

  // ROUND 18 — `opts.cells` re-bakes the SAME artwork at another cell
  // resolution, so the round's cell-resize can be priced as a paired figure on
  // one page load instead of against a build that no longer exists. It is
  // applied INSIDE the loop and restored in a finally, because census() and
  // decoder() above find the live atlas images by their declared grid — a
  // first attempt that mutated ATLAS before calling depictAblate() returned
  // zero rows for exactly that reason, silently.
  const resize = opts.cells || null;
  const sizeKeep = {};
  for (const atlas of only) {
    const A = ATLAS[atlas];
    // Re-bake TWICE on this page load. The seeds are fixed constants inside
    // pack.js, so the unmuted re-bake must reproduce the live atlas exactly;
    // that is asserted below rather than assumed.
    // THREE BAKES, NOT TWO — this is how the mute is PROVEN rather than
    // assumed. A and C are both unmuted; if the mute perturbed the rng stream,
    // C would differ from A, because B ran between them off the same generator
    // state. A === C byte-for-byte therefore proves that every difference
    // between A and B is the depiction and nothing else, WITHOUT anybody having
    // to know where a motif draws. AGENTS_BRIEF: "probe with uniform-only
    // changes and PROVE THE RESTORE" — an unproven restore has returned two
    // byte-identical PNGs on this project before, including the restored one.
    PK.setPackProbe(true);                       // no ledger writes, no re-check
    if (resize && resize[atlas]) {
      sizeKeep[atlas] = [A.cw, A.ch];
      A.cw = resize[atlas][0]; A.ch = resize[atlas][1];
    }
    let onTex, offTex, reTex;
    PK.clearProbeLog();
    try {
      D0.setDepictMute(false);
      onTex = bakers[atlas](T);
      D0.setDepictMute(true);
      offTex = bakers[atlas](T);
      D0.setDepictMute(false);
      reTex = bakers[atlas](T);
    } finally {
      if (sizeKeep[atlas]) { A.cw = sizeKeep[atlas][0]; A.ch = sizeKeep[atlas][1]; }
      PK.setPackProbe(false);
    }
    if (PK.CELL_LOG.length !== keep) throw new Error('sheet.js: probe wrote ' + (PK.CELL_LOG.length - keep) + ' ledger entries');
    // The photo boxes AS DRAWN ON THE CANVAS JUST MEASURED, in that canvas's
    // own pixels. Never CELL_LOG's, which are the load-time bake's.
    const photoOf = new Map();
    for (const e of PK.PROBE_LOG) if (e.atlas === atlas && e.photo) photoOf.set(e.i, e.photo);
    const bw = resize && resize[atlas] ? resize[atlas][0] : A.cw;
    const bh = resize && resize[atlas] ? resize[atlas][1] : A.ch;
    const W = A.cols * bw, H = A.rows * bh;
    const mk = (tex) => {
      const cvv = document.createElement('canvas'); cvv.width = W; cvv.height = H;
      cvv.getContext('2d').drawImage(tex.image, 0, 0);
      return cvv.getContext('2d').getImageData(0, 0, W, H).data;
    };
    const a = mk(onTex), b = mk(offTex), c2 = mk(reTex);
    onTex.dispose(); offTex.dispose(); reTex.dispose();
    let restoreDiff = 0;
    for (let o = 0; o < a.length; o += 4) {
      if (a[o] !== c2[o] || a[o + 1] !== c2[o + 1] || a[o + 2] !== c2[o + 2]) restoreDiff++;
    }
    restore.push(atlas + ':' + restoreDiff);
    if (restoreDiff) {
      throw new Error('sheet.js: the mute PERTURBED the bake — ' + atlas + ' differs in '
        + restoreDiff + ' px between two unmuted bakes. Every ablation number would be junk.');
    }

    const Y = (o) => 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2];
    for (const rec of PK.CELL_LOG.filter((r) => r.atlas === atlas)) {
      const e = cen.byAtlas[atlas].get(rec.i);
      if (!e || !e.cols.length) continue;
      const ox = (rec.i % A.cols) * bw, oy = Math.floor(rec.i / A.cols) * bh;
      // Pixels the depiction changed OUTSIDE its own box. This is NOT a leak
      // and it is not the mute failing — the restore identity above already
      // settles that. It is the MASCOT, which depict() draws at
      // (cx + rw*0.58, cy - rh*0.56) with radius rw*0.42, i.e. deliberately
      // half outside the photo box so it reads as a mark ON the pack rather
      // than as the product. Counted and reported, not asserted against.
      let outside = 0;
      const P = photoOf.get(rec.i) || rec.photo;
      for (let y = 0; y < bh; y += 3) {
        for (let x = 0; x < bw; x += 3) {
          if (P && Math.abs(x - P.cx) <= P.rw * 1.02 && Math.abs(y - P.cy) <= P.rh * 1.02) continue;
          const o = ((oy + y) * W + (ox + x)) * 4;
          if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2]) outside++;
        }
      }
      if (!P) { if (outside) notes.push(atlas + '#' + rec.i + ' no photo box but ' + outside + ' px moved'); continue; }
      // the motif's own colour, under a colour it is really drawn with
      const brand = e.cols[(opts.which || 0) % e.cols.length];
      const dY = [];
      let boxPx = 0;
      const x0 = Math.max(0, Math.round(P.cx - P.rw)), x1 = Math.min(bw - 1, Math.round(P.cx + P.rw));
      const y0 = Math.max(0, Math.round(P.cy - P.rh)), y1 = Math.min(bh - 1, Math.round(P.cy + P.rh));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const o = ((oy + y) * W + (ox + x)) * 4;
          boxPx++;
          if (a[o] === b[o] && a[o + 1] === b[o + 1] && a[o + 2] === b[o + 2]) continue;
          const ya = Y(D.decodePx(a[o], a[o + 1], a[o + 2], brand));
          const yb = Y(D.decodePx(b[o], b[o + 1], b[o + 2], brand));
          dY.push(Math.abs(ya - yb));
        }
      }
      // `ink: 0` explicitly. Omitting it made every paired delta involving one
      // of these cells NaN, which then poisoned the MEAN of all 113.
      if (!dY.length) { rows.push({ atlas, i: rec.i, desc: rec.desc, motif: rec.motif, facings: e.n, cover: 0, dY50: 0, dY90: 0, ink: 0, inkClamped: 0, atClamp: false, outside }); continue; }
      dY.sort((p, q) => p - q);
      const q = (p) => dY[Math.min(dY.length - 1, Math.floor(dY.length * p))];
      rows.push({
        atlas, i: rec.i, desc: rec.desc, motif: rec.motif, facings: e.n,
        cover: +(dY.length / boxPx).toFixed(4),
        dY50: +q(0.50).toFixed(4), dY90: +q(0.90).toFixed(4),
        // THE HEADLINE: how much decoded luminance the drawing puts on the
        // package, weighted by how much of the box it occupies.
        //
        // ROUND 18 — THE CLAMP IS GONE, AND ITS REMOVAL RETRACTS ROUND 17'S
        // REGRESSION REPORT. r17 reported 13 of 113 cells regressed. All 13
        // share one signature: coverOff >= 0.3527, i.e. every one of them sat
        // at or above the `Math.min(1, cover/0.35)` ceiling this line used to
        // carry — where added coverage contributes LITERALLY NOTHING and only
        // a small p90 dilution survives. 69 of the 113 cells sit at or above
        // it, so the metric was blind to coverage on 61% of its own
        // population, and the round's headline was pessimistic by roughly 3x.
        // Unclamped, 113 of 113 improve, mean +0.1473.
        //
        // A saturating weight is not a neutral normalisation: it makes the
        // metric monotone in one variable over a minority of the data and
        // constant over the majority, so every comparison it is used for is
        // really a comparison of p90 alone on 61% of the cells. `cover` is
        // already a fraction in [0,1]; the weight is that fraction, not a
        // rescaled and truncated copy of it.
        //
        // `inkClamped` is kept ALONGSIDE so the two are comparable across the
        // round boundary rather than silently redefined — AGENTS_BRIEF's
        // "a metric that changes definition between rounds has no delta".
        ink: +(q(0.90) * (dY.length / boxPx)).toFixed(4),
        inkClamped: +(q(0.90) * Math.min(1, dY.length / boxPx / 0.35)).toFixed(4),
        atClamp: dY.length / boxPx >= 0.35,
        outside,
        brand: '#' + brand.map((v) => Math.round(255 * clamp01(l2s(v))).toString(16).padStart(2, '0')).join(''),
      });
    }
  }
  rows.sort((x, y) => x.ink - y.ink);
  const mascot = rows.filter((r) => r.outside > 0);
  // How much of the population the retired clamp was blind to, computed here
  // rather than asserted from the r17 write-up.
  const atClamp = rows.filter((r) => r.atClamp).length;
  return {
    rows,
    clampBlind: atClamp + '/' + rows.length,
    clampBlindPct: +(100 * atClamp / (rows.length || 1)).toFixed(1),
    notes,
    // the restore identity, quoted rather than merely checked
    restoreDiffPx: restore.join(' '),
    cellsWithMascotInk: mascot.length,
  };
}

// --- THE CONTRAST REPORT ----------------------------------------------------
// The sheet is for the eye. This is the number, and it is the one that would
// have caught all three shipped defects without anybody looking at anything.
//
// For every cell, over every distinct brand colour the store draws it with:
// decode the depiction's box, decode a ring of ground just outside it, and
// report the WEBER-style luminance separation between the motif's ink and the
// field it sits on. A motif that is invisible on its own package scores near 0
// no matter how well drawn it is.
export async function contrastReport(opts = {}) {
  const C = window.__CHOP;
  const PK = await import('./pack.js');
  const D = await decoder(C.scene);
  const img = atlasImages(C.scene);
  const cen = census(C.scene);
  const rows = [];
  const Y = (o) => 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2];
  const maxCols = opts.brands || 6;

  for (const atlas of ATLAS_ORDER) {
    const src = img[atlas];
    if (!src) continue;
    const A = ATLAS[atlas];
    const work = document.createElement('canvas');
    work.width = A.cw; work.height = A.ch;
    const wg = work.getContext('2d');
    for (const rec of PK.CELL_LOG.filter((r) => r.atlas === atlas)) {
      if (!rec.photo) continue;
      const e = cen.byAtlas[atlas].get(rec.i);
      if (!e) continue;
      wg.clearRect(0, 0, A.cw, A.ch);
      wg.drawImage(src, (rec.i % A.cols) * A.cw, Math.floor(rec.i / A.cols) * A.ch,
        A.cw, A.ch, 0, 0, A.cw, A.ch);
      const raw = wg.getImageData(0, 0, A.cw, A.ch).data;
      const P = rec.photo;
      // distinct instance colours, deduped to 3 decimals
      const seen = new Map();
      for (const c of e.cols) {
        const k = c.map((v) => v.toFixed(3)).join(',');
        if (!seen.has(k)) seen.set(k, c);
        if (seen.size >= maxCols) break;
      }
      let worst = null;
      for (const brand of seen.values()) {
        // sample the motif box and a ground ring around it
        const inY = [], outY = [];
        const step = 2;
        const x0 = Math.max(0, Math.round(P.cx - P.rw)), x1 = Math.min(A.cw - 1, Math.round(P.cx + P.rw));
        const y0 = Math.max(0, Math.round(P.cy - P.rh)), y1 = Math.min(A.ch - 1, Math.round(P.cy + P.rh));
        const gx0 = Math.max(0, Math.round(P.cx - P.rw * 1.55)), gx1 = Math.min(A.cw - 1, Math.round(P.cx + P.rw * 1.55));
        const gy0 = Math.max(0, Math.round(P.cy - P.rh * 1.55)), gy1 = Math.min(A.ch - 1, Math.round(P.cy + P.rh * 1.55));
        for (let y = gy0; y <= gy1; y += step) {
          for (let x = gx0; x <= gx1; x += step) {
            const o = (y * A.cw + x) * 4;
            const lum = Y(D.decodePx(raw[o], raw[o + 1], raw[o + 2], brand));
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1) inY.push(lum); else outY.push(lum);
          }
        }
        if (!inY.length || !outY.length) continue;
        inY.sort((a, b) => a - b); outY.sort((a, b) => a - b);
        const q = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))];
        // INK RANGE inside the motif box: how much tonal separation the drawing
        // itself has once decoded. A white object on white stock reads near 0
        // here even though the drawing is perfectly correct in the mask.
        const ink = q(inY, 0.95) - q(inY, 0.05);
        // FIGURE/GROUND: how far the motif's own body sits from the field it is
        // printed on. Brand-on-brand collisions live here.
        const fg = Math.abs(q(inY, 0.50) - q(outY, 0.50));
        const score = Math.min(ink, Math.max(fg, ink));
        if (!worst || ink < worst.ink) {
          worst = { ink: +ink.toFixed(4), fg: +fg.toFixed(4), score: +score.toFixed(4),
            brand: '#' + brand.map((v) => Math.round(255 * clamp01(l2s(v))).toString(16).padStart(2, '0')).join('') };
        }
      }
      if (worst) {
        rows.push({ atlas, i: rec.i, desc: rec.desc, motif: rec.motif,
          facings: e.n, ...worst });
      }
    }
  }
  rows.sort((a, b) => a.ink - b.ink);
  return rows;
}

// --- BEFORE / AFTER AT CHASE RANGE ------------------------------------------
// One page load, one toggle, the same cells, the same real instance colours.
// Top row is the build WITHOUT the round-17 rims, bottom row WITH them, both at
// the computed 84 px a 0.20 m facing subtends at 1.75 m. The 4x strip under
// each is only so a reader can check the label against the picture.
export async function rimAB(name, opts = {}) {
  const C = window.__CHOP;
  const T = C.THREE;
  const PK = await import('./pack.js');
  const D0 = await import('./depict.js');
  const D = await decoder(C.scene);
  const cen = census(C.scene);
  const keep = PK.CELL_LOG.length;
  const bakers = { carton: PK.cartonAtlas, pouch: PK.pouchAtlas, can: PK.canAtlas, bottle: PK.bottleAtlas };
  const wantMotifs = opts.motifs
    || ['caplet', 'tabletRound', 'peanut', 'wheatEar', 'babyFace', 'chocBar', 'spaghetti', 'peachHalf', 'toothpaste', 'soupBowl'];
  const cells = [];
  for (const m of wantMotifs) {
    const rec = PK.CELL_LOG.find((r) => r.motif === m && r.photo);
    if (rec) cells.push(rec);
  }
  // bake each needed atlas twice: rims off, rims on
  const need = [...new Set(cells.map((c) => c.atlas))];
  const off = {}, on = {};
  PK.setPackProbe(true);
  for (const a of need) {
    D0.setRims(false); const t0 = bakers[a](T);
    D0.setRims(true); const t1 = bakers[a](T);
    const A = ATLAS[a], W = A.cols * A.cw, H = A.rows * A.ch;
    const mk = (tex) => { const c2 = document.createElement('canvas'); c2.width = W; c2.height = H; c2.getContext('2d').drawImage(tex.image, 0, 0); tex.dispose(); return c2; };
    off[a] = mk(t0); on[a] = mk(t1);
  }
  PK.setPackProbe(false);
  if (PK.CELL_LOG.length !== keep) throw new Error('sheet.js: rimAB wrote ledger entries');

  const near = opts.near || 84, big = 4;
  const bigW = near * big, pad = 12, lab = 40, gap = 22;
  const cv = document.createElement('canvas');
  const cellH = Math.round(near * 1.32);
  cv.width = cells.length * (bigW + pad) + pad;
  cv.height = pad + 16 + cellH + 6 + cellH + gap + Math.round(bigW * 1.32) + lab + pad;
  const g = cv.getContext('2d');
  g.fillStyle = '#141414'; g.fillRect(0, 0, cv.width, cv.height);
  g.font = 'bold 12px Helvetica'; g.textAlign = 'left';
  const rows = [];
  for (let n = 0; n < cells.length; n++) {
    const rec = cells[n];
    const R = faceRect(rec.atlas, rec.i);
    const e = cen.byAtlas[rec.atlas].get(rec.i);
    const brand = e && e.cols.length ? e.cols[0] : [0.5, 0.5, 0.5];
    const x0 = pad + n * (bigW + pad);
    const crop = (srcCv) => {
      const f = document.createElement('canvas');
      f.width = R.sw; f.height = R.sh;
      f.getContext('2d').drawImage(srcCv, R.sx, R.sy, R.sw, R.sh, 0, 0, R.sw, R.sh);
      D.decodeCanvas(f, brand);
      return f;
    };
    const fOff = crop(off[rec.atlas]), fOn = crop(on[rec.atlas]);
    const nh = Math.round(near * R.sh / R.sw);
    g.imageSmoothingEnabled = true;
    let y = pad + 16;
    g.drawImage(fOff, x0 + (bigW - near) / 2, y, near, nh);
    g.drawImage(fOn, x0 + (bigW - near) / 2, y + cellH + 6, near, nh);
    g.imageSmoothingEnabled = false;
    const y2 = y + cellH * 2 + 6 + gap;
    g.drawImage(fOn, x0, y2, bigW, Math.round(bigW * R.sh / R.sw));
    g.fillStyle = '#fff'; g.font = 'bold 11px Helvetica';
    g.fillText((rec.desc || '?').slice(0, 26), x0, y2 + Math.round(bigW * 1.32) + 12);
    g.font = '10px Helvetica'; g.fillStyle = '#9cf';
    g.fillText(rec.motif + '  ' + (e ? e.n : 0) + ' facings', x0, y2 + Math.round(bigW * 1.32) + 25);
    rows.push({ desc: rec.desc, motif: rec.motif, cell: rec.atlas + '#' + rec.i, facings: e ? e.n : 0 });
  }
  g.fillStyle = '#ff6'; g.font = 'bold 12px Helvetica';
  g.fillText('TOP: no rims (r16 behaviour)   MIDDLE: r17 rims   both at 84 px = a 0.20 m facing at 1.75 m', pad, 12);
  return { path: await post(name, cv), rows };
}
