// OWNER: builder-agents (CHARACTER). Everything in this game with a face on it.
// agents.js owns how people MOVE; this file owns what they look like while they
// do it. Exports (agents.js imports exactly these):
//
//   mergeParts(THREE, parts)      — geometry baker, also used by the cart
//   buildFigureGeo(THREE)         — the shared bakery. Call ONCE.
//   rollPerson(rng)               — roll a shopper's description
//   makePerson(THREE, F, o)       — a shopper rig
//   makeCop(THREE, F)             — HIM
//
// Both rigs return the SAME contract, because animateShopper()/animateCop()
// both drive it:
//   { root, hips, chest, torso, belly, neck, head, legL, legR, armL, armR,
//     shirt, pants, hipY }
// `chest` is new this round and it is the reason the walk works: hips carry the
// legs and the waddle, chest carries the torso/arms/head and counter-rotates
// against them. One group, and a walk stops being two sticks under an egg.
//
// ===========================================================================
// THE BUG THAT WAS THE WHOLE BRIEF: EVERY PERSON IN THIS GAME WAS HEADLESS
// ===========================================================================
// Playtest, verbatim: "he's just kinda black, and I can't... he's not a
// character yet." The blind image critic, separately: "no arms, hair, or shoes
// ... no faces." Both were describing one number.
//
// The old rig put the neck at hips-local y=0.60 and the torso capsule at y=0.31
// with CapsuleGeometry(0.19, 0.42) — half-height 0.40, so the capsule's top cap
// reached 0.71. The head was a sphere of radius 0.135 centred at 0.60, so it
// spanned 0.465..0.735. NINETY-SIX PERCENT OF THE HEAD WAS INSIDE THE TORSO.
// What poked out was a 25 mm skullcap, and the hair hemisphere covered that, and
// on the cop the cap covered the hair. There was no face to see because there
// was no head above the shoulders to put one on. `torso.scale` only scaled x
// and z, so widening the cop to girth 1.62 made it worse in the two axes that
// could not help and left the burial depth untouched.
//
// So: measure the skeleton before drawing anything on it. The new one is
// stated in FIG below in metres from the sole, and the sole is at y=0, which
// the old rig also got wrong — its feet ended 85 mm above the floor and every
// person in the store was quietly hovering.
// ===========================================================================

// Skeleton, model units (before the per-person `height` multiplier).
// Sole 0.00 -> crown 1.65, i.e. one model unit of person is a 1.65 m adult and
// `height` is the tape measure. Shoppers roll 0.93..1.11 (1.53 m..1.83 m); the
// cop is 1.04 (1.72 m, plus 60 mm of cap) — heavy men are not tall men.
export const FIG = {
  hipY: 0.86,        // hips group sits here; leg pivots are at its origin
  legLen: 0.86,      // hip pivot -> sole. Feet reach the floor. They did not.
  shoulderY: 0.46,   // hips-local
  neckY: 0.52,       // hips-local, where the `neck` group hangs
  headY: 0.145,      // neck-local centre of the skull
  crown: 1.65,
  armLen: 0.72,      // shoulder -> fingertip
};

// ---------------------------------------------------------------------------
// GEOMETRY BAKING. Unchanged from the version that lived in agents.js except
// for `p.uv`: a part may now carry [u0, v0, du, dv] to remap its native 0..1
// UVs into one cell of a shared atlas. That one field is what lets the whole
// cop — shirt weave, basketweave leather, trouser twill, shoulder patches,
// nameplate, radio grille — run off ONE texture and TWO materials instead of a
// material per fabric. See copAtlas().
// ---------------------------------------------------------------------------
export function mergeParts(THREE, parts) {
  let vTot = 0, iTot = 0, wantCol = false;
  for (const p of parts) {
    vTot += p.g.attributes.position.count;
    iTot += p.g.index ? p.g.index.count : p.g.attributes.position.count;
    if (p.c != null || p.g.attributes.color) wantCol = true;
  }
  const pos = new Float32Array(vTot * 3);
  const nrm = new Float32Array(vTot * 3);
  const uvs = new Float32Array(vTot * 2);
  const col = wantCol ? new Float32Array(vTot * 3) : null;
  const idx = vTot > 65535 ? new Uint32Array(iTot) : new Uint16Array(iTot);
  const nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.g, m = p.m;
    if (m) nm.getNormalMatrix(m);
    if (p.c != null) c.set(p.c);
    const uv = p.uv;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    // A part may bring its OWN per-vertex colours (a loft does, so a torso can
    // shade from chest to hem inside a single surface). p.c still wins if given.
    const CA = p.c == null ? g.attributes.color : null;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i); if (m) v.applyMatrix4(m); v.toArray(pos, (vo + i) * 3);
      if (N) {
        v.fromBufferAttribute(N, i); if (m) v.applyMatrix3(nm).normalize();
        v.toArray(nrm, (vo + i) * 3);
      }
      if (U) {
        const u0 = U.getX(i), v0 = U.getY(i);
        uvs[(vo + i) * 2] = uv ? uv[0] + u0 * uv[2] : u0;
        uvs[(vo + i) * 2 + 1] = uv ? uv[1] + v0 * uv[3] : v0;
      }
      if (col) {
        const o = (vo + i) * 3;
        if (CA) { col[o] = CA.getX(i); col[o + 1] = CA.getY(i); col[o + 2] = CA.getZ(i); }
        else if (p.c != null) { col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b; }
        else { col[o] = col[o + 1] = col[o + 2] = 1; }
      }
    }
    const gi = g.index, n = gi ? gi.count : P.count;
    for (let i = 0; i < n; i++) idx[io + i] = (gi ? gi.getX(i) : i) + vo;
    vo += P.count; io += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// ---------------------------------------------------------------------------
// A tiny part-list DSL. Every primitive is a cached unit shape placed by a
// matrix, so a fifty-piece duty belt allocates four BufferGeometries, not
// fifty. Segment counts are deliberately mean: this scene renders TEN TIMES a
// frame (nine monitor feeds + the main view) and there are fifteen people in
// it, so a sphere gets 10x7 and likes it.
// ---------------------------------------------------------------------------
function shapes(THREE) {
  const cache = new Map();
  const get = (k, f) => { let g = cache.get(k); if (!g) { g = f(); cache.set(k, g); } return g; };
  return {
    box: () => get('box', () => new THREE.BoxGeometry(1, 1, 1)),
    ball: (s = 10, r = 7) => get('ball' + s + '_' + r, () => new THREE.SphereGeometry(0.5, s, r)),
    tube: (s = 10) => get('tube' + s, () => new THREE.CylinderGeometry(0.5, 0.5, 1, s, 1)),
    cone: (s = 8) => get('cone' + s, () => new THREE.ConeGeometry(0.5, 1, s)),
    ring: (s = 12, t = 5) => get('ring' + s + '_' + t,
      () => new THREE.TorusGeometry(0.5, 0.12, t, s)),
    taper: (rt, s = 8) => get('tap' + rt + '_' + s,
      () => new THREE.CylinderGeometry(rt * 0.5, 0.5, 1, s, 1)),
    half: (s = 14) => get('half' + s,
      () => new THREE.CylinderGeometry(0.5, 0.5, 1, s, 1, false, -Math.PI / 2, Math.PI)),
  };
}

// A LOFT: rings of ellipses stacked up Y and skinned into one closed surface.
// Each ring carries its own half-width, half-depth, forward offset and colour,
// so a torso can have a chest, a waist, a gut that pushes FORWARD and not
// sideways, and a seat — as ONE smooth surface.
//
// The first build of the cop stacked ellipsoids instead, and you could count
// them: every place a wider ball met a narrower one left a hard horizontal step
// round the shirt, so a heavy man read as a stack of tyres. A loft has no seams
// because there are no separate surfaces to seam.
//   rings: [{ y, rx, rz, cz, c }] bottom to top, first and last collapsed to a
//   point to cap it. `seg` is the ring resolution — 16 is plenty at 7 m and it
//   is what the CCTV feed can resolve at any distance whatsoever.
function loft(THREE, rings, seg = 16, uv) {
  const n = rings.length, W = seg + 1;
  const pos = new Float32Array(n * W * 3);
  const uvs = new Float32Array(n * W * 2);
  const col = new Float32Array(n * W * 3);
  const idx = [];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const r = rings[i];
    c.set(r.c == null ? 0xffffff : r.c);
    for (let j = 0; j <= seg; j++) {
      const a = (j / seg) * Math.PI * 2, k = i * W + j;
      pos[k * 3] = Math.sin(a) * r.rx;
      pos[k * 3 + 1] = r.y;
      pos[k * 3 + 2] = Math.cos(a) * r.rz + (r.cz || 0);
      const u = j / seg, v = i / (n - 1);
      uvs[k * 2] = uv ? uv[0] + u * uv[2] : u;
      uvs[k * 2 + 1] = uv ? uv[1] + v * uv[3] : v;
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) {
    const a = i * W + j, b = a + 1, d = a + W, e = d + 1;
    idx.push(a, b, d, b, e, d);       // outward winding; check it, do not guess
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// The builder. Every call is (size, position, colour, opts) and opts carries
// rotation `r:[x,y,z]` and atlas cell `uv`.
function partList(THREE, S) {
  const L = [];
  const V = THREE.Vector3, Q = THREE.Quaternion, E = THREE.Euler, M = THREE.Matrix4;
  const xf = (p, r, s) => new M().compose(
    new V(p[0], p[1], p[2]),
    new Q().setFromEuler(new E(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0)),
    new V(s[0], s[1], s[2]));
  const api = {
    L,
    add(g, s, p, c, o) { L.push({ g, c, m: xf(p, o && o.r, s), uv: o && o.uv }); return api; },
    // box(w,h,d, [x,y,z], colour, {r,uv})
    box: (w, h, d, p, c, o) => api.add(S.box(), [w, h, d], p, c, o),
    // ball(rx,ry,rz, [x,y,z], colour, {r,uv,seg})
    ball: (rx, ry, rz, p, c, o) => api.add(S.ball(o && o.seg, o && o.rseg),
      [rx * 2, ry * 2, rz * 2], p, c, o),
    // tube(r, h, [x,y,z], colour, {r,uv,seg})  — axis +Y
    tube: (r, h, p, c, o) => api.add(S.tube(o && o.seg), [r * 2, h, r * 2], p, c, o),
    // taper(rTop, rBot, h, ...)
    taper: (rt, rb, h, p, c, o) => api.add(S.taper(rt / rb, o && o.seg),
      [rb * 2, h, rb * 2], p, c, o),
    cone: (r, h, p, c, o) => api.add(S.cone(o && o.seg), [r * 2, h, r * 2], p, c, o),
    // ring(r, tube, ...) — lies in XY, so pass r:[Math.PI/2,0,0] for a waistband
    ring: (r, t, p, c, o) => api.add(S.ring(o && o.seg, o && o.rseg),
      [r * 2, r * 2, (t / 0.12) * (r * 2)], p, c, o),
    // half-disc of radius r and thickness h, occupying +Z. A cap brim.
    half: (r, h, p, c, o) => api.add(S.half(o && o.seg), [r * 2, h, r * 2], p, c, o),
  };
  return api;
}

// ---------------------------------------------------------------------------
// THE ATLAS. 512px, sixteen 128px cells, ONE texture shared by every material
// on the cop. Greyscale wherever a vertex colour is going to tint it, full
// colour only where the thing has to be its own colour whatever it is glued to
// (the shoulder patch, the nameplate, the radio face).
// ---------------------------------------------------------------------------
const CELLS = {
  flat: [3, 0], shirt: [0, 0], patch: [1, 0], weave: [2, 0],
  twill: [0, 1], name: [1, 1], capcloth: [2, 1], radio: [3, 1],
  shoe: [0, 2], grip: [1, 2], glove: [2, 2], face: [3, 2],
};
const uvOf = (k) => {
  const c = CELLS[k] || CELLS.flat;
  return [c[0] * 0.25, 1 - (c[1] + 1) * 0.25, 0.25, 0.25];
};

function copAtlas(THREE) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const x = cv.getContext('2d');
  const cell = (k, f) => {
    const c = CELLS[k]; x.save();
    x.translate(c[0] * 128, c[1] * 128);
    x.beginPath(); x.rect(0, 0, 128, 128); x.clip();
    f(x); x.restore();
  };
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 512, 512);

  // Poplin. Fine vertical weave, a horizontal wrinkle set where a shirt creases
  // over a gut, and a darker band at the bottom where it is tucked and pulling.
  cell('shirt', (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.globalAlpha = 0.10; g.strokeStyle = '#000';
    g.lineWidth = 1;
    for (let i = 0; i < 128; i += 3) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); }
    g.globalAlpha = 0.055;
    for (let i = 0; i < 128; i += 4) { g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    g.globalAlpha = 1;
    // strain creases radiating off the button line
    g.strokeStyle = 'rgba(0,0,0,0.055)'; g.lineWidth = 2.0;
    for (let i = 0; i < 7; i++) {
      const y = 34 + i * 11;
      g.beginPath(); g.moveTo(52, y); g.quadraticCurveTo(84, y + 5 - (i % 2) * 9, 122, y + 2); g.stroke();
      g.beginPath(); g.moveTo(52, y); g.quadraticCurveTo(22, y + 4 - (i % 2) * 8, 4, y + 1); g.stroke();
    }
    const gr = g.createLinearGradient(0, 92, 0, 128);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.30)');
    g.fillStyle = gr; g.fillRect(0, 92, 128, 36);
  });

  // Shoulder patch. Reads as a shield with a gold edge at any distance the game
  // ever shows it at; the lettering is for the one frame somebody zooms in.
  cell('patch', (g) => {
    g.fillStyle = '#8ea3bf'; g.fillRect(0, 0, 128, 128);
    const shield = (pad, fill) => {
      g.beginPath();
      g.moveTo(18 + pad, 14 + pad); g.lineTo(110 - pad, 14 + pad);
      g.lineTo(110 - pad, 72 - pad * 0.4);
      g.quadraticCurveTo(110 - pad, 104 - pad, 64, 116 - pad);
      g.quadraticCurveTo(18 + pad, 104 - pad, 18 + pad, 72 - pad * 0.4);
      g.closePath(); g.fillStyle = fill; g.fill();
    };
    shield(0, '#c8a94e'); shield(6, '#1d2740');
    g.fillStyle = '#c8a94e';
    g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
    g.fillText('POLICE', 64, 36);
    g.font = 'bold 9px sans-serif';
    g.fillText('CHOP COUNTY', 64, 104);
    // a five point star
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 8 : 19;
      g[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * r, 68 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  });

  // Basketweave duty leather. This is the single texture that makes the belt
  // read as equipment instead of as a black torus.
  cell('weave', (g) => {
    g.fillStyle = '#dedede'; g.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const X = c * 16, Y = r * 16, v = (r + c) % 2;
        g.fillStyle = v ? '#f4f4f4' : '#bdbdbd';
        for (let k = 0; k < 3; k++) {
          if (v) g.fillRect(X + 1, Y + 1 + k * 5, 14, 4);
          else g.fillRect(X + 1 + k * 5, Y + 1, 4, 14);
        }
        g.fillStyle = 'rgba(0,0,0,0.30)';
        g.fillRect(X, Y + 15, 16, 1); g.fillRect(X + 15, Y, 1, 16);
      }
    }
  });

  cell('twill', (g) => {                                  // trouser serge
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 1.4;
    for (let i = -128; i < 128; i += 4) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    }
  });

  cell('name', (g) => {                                   // engraved nameplate
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 128, 10); g.fillRect(0, 118, 128, 10);
    g.fillStyle = '#241d10'; g.font = 'bold 46px sans-serif'; g.textAlign = 'center';
    g.fillText('CHOP', 64, 80);
  });

  cell('capcloth', (g) => {                               // cap serge, tighter
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 1;
    for (let i = -128; i < 128; i += 3) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke();
    }
  });

  cell('radio', (g) => {                                  // speaker grille + LED
    g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#5a5a5a';
    for (let r = 0; r < 7; r++) for (let c = 0; c < 9; c++) {
      g.beginPath(); g.arc(20 + c * 10, 22 + r * 8, 2.6, 0, 7); g.fill();
    }
    g.fillStyle = '#2a2a2a'; g.fillRect(14, 86, 100, 30);
    g.fillStyle = '#7ee06a'; g.fillRect(20, 94, 10, 6);
    g.fillStyle = '#e0d06a'; g.fillRect(36, 94, 46, 6);
  });

  cell('shoe', (g) => {                                   // polished toe cap
    g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 128, 128);
    const gr = g.createRadialGradient(52, 44, 4, 64, 64, 78);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, '#d8d8d8'); gr.addColorStop(1, '#8e8e8e');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });

  cell('grip', (g) => {                                   // checkered polymer
    g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#8e8e8e';
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
      if ((r + c) % 2) g.fillRect(c * 8, r * 8, 8, 8);
    }
  });

  cell('glove', (g) => { g.fillStyle = '#e8f2f6'; g.fillRect(0, 0, 128, 128); });

  // Face detail — stubble on the jaw, a bit of colour in the cheeks. Applied to
  // the skull ball only; sphere UVs put u=0.25 dead centre on the face.
  cell('face', (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    const gr = g.createLinearGradient(0, 62, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(96,80,72,0.42)');
    g.fillStyle = gr; g.fillRect(0, 62, 128, 66);            // five o'clock shadow
    g.fillStyle = 'rgba(214,120,96,0.30)';
    g.beginPath(); g.ellipse(20, 52, 12, 9, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(44, 52, 12, 9, 0, 0, 7); g.fill();
  });

  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace ?? t.colorSpace;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

// Four garments for the shoppers, greyscale so the per-person shirt colour
// still does the colour. Kept from the previous round; the figures under them
// are what changed.
function clothAtlas(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const cell = (i, f) => { x.save(); x.translate((i % 2) * 128, ((i / 2) | 0) * 128);
    x.beginPath(); x.rect(0, 0, 128, 128); x.clip(); f(x); x.restore(); };
  cell(0, (g) => {                                    // horizontal stripes
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#b3b3b3';
    for (let y = 10; y < 128; y += 26) g.fillRect(0, y, 128, 11);
  });
  cell(1, (g) => {                                    // plain tee with a print
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#9a9a9a'; g.fillRect(34, 46, 60, 40);
    g.fillStyle = '#ffffff'; g.fillRect(40, 56, 48, 6); g.fillRect(40, 68, 34, 6);
    g.fillStyle = '#c9c9c9'; g.fillRect(0, 0, 128, 14);
  });
  cell(2, (g) => {                                    // button placket
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 128, 12);
    g.fillStyle = '#bcbcbc'; g.fillRect(58, 12, 12, 116);
    g.fillStyle = '#8c8c8c';
    for (let y = 26; y < 124; y += 22) { g.beginPath(); g.arc(64, y, 3.2, 0, 7); g.fill(); }
  });
  cell(3, (g) => {                                    // plaid
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(140,140,140,0.55)';
    for (let y = 6; y < 128; y += 21) g.fillRect(0, y, 128, 8);
    for (let v = 6; v < 128; v += 21) g.fillRect(v, 0, 8, 128);
  });
  const out = [];
  for (let i = 0; i < 4; i++) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace ?? t.colorSpace;
    t.repeat.set(0.5, 0.5); t.offset.set((i % 2) * 0.5, 1 - ((i / 2) | 0) * 0.5 - 0.5);
    t.needsUpdate = true; out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// PALETTES
// ---------------------------------------------------------------------------
export const SKIN = [0xf0c8a0, 0xe0ab84, 0xc68f68, 0x8d5a3b, 0x62402c, 0xf7d7b8];
export const HAIR = [0x2b2118, 0x120e0b, 0x6b4a2a, 0x9c8b6e, 0xa8a8a8, 0x4a3320, 0x7d2f16];
export const GREY = [0xb4b0aa, 0x8e8a84, 0xd2cec7];
export const CLOTH = [
  0x9aa7b4, 0x6d7f8c, 0xb8574a, 0x4a6b52, 0xd6c07a, 0x8a6f92, 0x3f4a5c,
  0xc98a4b, 0x7d8f6b, 0xa8b6c4, 0x5c4a3f, 0xbfa89b, 0x2f4858, 0xd9b8a0,
];
export const PANTS = [0x2f3a4a, 0x3d3d42, 0x5a4738, 0x1f2733, 0x6b6b70, 0x4a3f52];
const SHOE = [0x33322f, 0x1e1c1a, 0x4a3a2c, 0xbfbdb6, 0x5a2f26];

// ===========================================================================
// SHOPPER PARTS. Four builds x three hair lengths x two sleeve lengths, all
// baked ONCE and shared by every shopper — the variety is in which geometry a
// person points at and what colour their materials are, so fourteen different
// people cost fourteen sets of materials and no extra geometry at all.
// The critic's complaint was "two identically-proportioned bodies with rigid
// box arms, blob hair and no faces", and proportion is the first word in it.
// ===========================================================================
const BUILDS = [
  //          chest  waist  shoulder  belly  thigh  stoop
  { k: 'slim',  ch: 0.86, wa: 0.80, sh: 0.95, be: 0,    th: 0.88, st: 0.00 },
  { k: 'reg',   ch: 1.00, wa: 1.00, sh: 1.00, be: 0,    th: 1.00, st: 0.02 },
  { k: 'stock', ch: 1.16, wa: 1.20, sh: 1.12, be: 0.55, th: 1.16, st: 0.03 },
  { k: 'heavy', ch: 1.28, wa: 1.42, sh: 1.14, be: 1.00, th: 1.30, st: 0.06 },
];

function shopperTorso(THREE, S, b) {
  const P = partList(THREE, S);
  const w = b.ch, d = b.ch * 0.80, ww = b.wa;
  // ribcage -> waist as three stacked ellipsoids, so the profile actually has a
  // waist in it. A capsule cannot; that is why every old figure was an egg.
  P.ball(0.175 * b.sh, 0.115, 0.135 * b.sh, [0, FIG.shoulderY - 0.005, -0.005], 0xffffff, { seg: 10, rseg: 6 });
  P.ball(0.168 * w, 0.150, 0.128 * d, [0, 0.355, 0.004], 0xffffff, { seg: 10, rseg: 6 });
  P.ball(0.163 * ww, 0.150, 0.124 * ww * 0.92, [0, 0.185, 0.006], 0xf2f2f2, { seg: 10, rseg: 6 });
  P.ball(0.170 * ww, 0.120, 0.132 * ww * 0.92, [0, 0.045, 0.004], 0xe4e4e4, { seg: 10, rseg: 6 });
  // shoulder line + a slight forward roll to the shoulders
  P.ball(0.215 * b.sh, 0.072, 0.130 * b.sh, [0, FIG.shoulderY + 0.020, -0.004], 0xfafafa, { seg: 10, rseg: 5 });
  P.ball(0.115, 0.062, 0.055, [0, FIG.shoulderY + 0.010, -0.088], 0xdedede, { seg: 8, rseg: 5 });
  // collar band and a hem you can see
  P.tube(0.070, 0.045, [0, FIG.neckY + 0.010, 0.004], 0xd8d8d8, { seg: 10 });
  P.ball(0.172 * ww, 0.030, 0.135 * ww * 0.92, [0, -0.005, 0.004], 0xc8c8c8, { seg: 10, rseg: 4 });
  return mergeParts(THREE, P.L);
}

function shopperBelly(THREE, S) {
  const P = partList(THREE, S);
  P.ball(0.5, 0.5, 0.5, [0, 0, 0], 0xffffff, { seg: 12, rseg: 8 });
  return mergeParts(THREE, P.L);
}

// The cop's gut is its own bake and not the shopper sphere, for a reason worth
// writing down: the shopper belly carries native 0..1 UVs, and on a material
// whose map is a SIXTEEN-CELL ATLAS that means it samples the whole sheet. The
// first build of this shipped a man with a white apron over his stomach with
// the word CHOP across it, because the nameplate cell landed on his abdomen.
// Every part on an atlas material needs a cell. Every one.
function copBelly(THREE, S) {
  const P = partList(THREE, S);
  P.ball(0.5, 0.5, 0.5, [0, 0, 0], C.shirt, { seg: 14, rseg: 10, uv: uvOf('shirt') });
  return mergeParts(THREE, P.L);
}

// Two heads: a rounder one and a longer one. Both have a jaw, a nose, ears, a
// brow and eyes, because those five things are the entire difference between
// "a person seen from 7 m" and "a ball".
function shopperHead(THREE, S, long) {
  const P = partList(THREE, S);
  const h = FIG.headY, ln = long ? 1.0 : 0.90, wd = long ? 0.94 : 1.03;
  P.tube(0.042, 0.10, [0, h - 0.155, -0.006], 0xe0e0e0, { seg: 8 });            // neck
  P.ball(0.100 * wd, 0.108 * ln, 0.104, [0, h + 0.010, -0.004], 0xffffff, { seg: 10, rseg: 7 });
  P.ball(0.089 * wd, 0.070 * ln, 0.093, [0, h - 0.058, 0.008], 0xfbfbfb, { seg: 10, rseg: 6 }); // jaw
  P.ball(0.060, 0.036, 0.055, [0, h - 0.098, 0.014], 0xf4f4f4, { seg: 8, rseg: 5 });            // chin
  P.ball(0.028, 0.036, 0.020, [0.099 * wd, h - 0.006, -0.008], 0xf6f6f6, { seg: 6, rseg: 4 });  // ears
  P.ball(0.028, 0.036, 0.020, [-0.099 * wd, h - 0.006, -0.008], 0xf6f6f6, { seg: 6, rseg: 4 });
  P.ball(0.021, 0.026, 0.026, [0, h - 0.012, 0.086], 0xffffff, { seg: 6, rseg: 5 });            // nose
  P.box(0.020, 0.026, 0.030, [0, h + 0.020, 0.078], 0xfafafa);                                  // bridge
  P.box(0.140, 0.017, 0.024, [0, h + 0.049, 0.072], 0xf0f0f0, { r: [-0.10, 0, 0] });            // brow
  P.ball(0.024, 0.013, 0.011, [0.040, h + 0.026, 0.079], 0x6a5c52, { seg: 6, rseg: 4 });        // eyes
  P.ball(0.024, 0.013, 0.011, [-0.040, h + 0.026, 0.079], 0x6a5c52, { seg: 6, rseg: 4 });
  P.box(0.044, 0.008, 0.012, [0, h - 0.070, 0.078], 0xd8a494);                                  // mouth
  return mergeParts(THREE, P.L);
}

// Six hairstyles. The critic's word was "blob hair"; a blob is what you get
// when a hemisphere is the only shape in the set.
function shopperHair(THREE, S, k) {
  const P = partList(THREE, S);
  const h = FIG.headY;
  const cap = (ry, y, z) => P.ball(0.106, ry, 0.110, [0, y, z], 0xffffff, { seg: 10, rseg: 6 });
  if (k === 0) {                                  // short back and sides
    cap(0.086, h + 0.028, -0.008);
    P.box(0.016, 0.040, 0.030, [0.093, h + 0.002, 0.000], 0xf0f0f0);
    P.box(0.016, 0.040, 0.030, [-0.093, h + 0.002, 0.000], 0xf0f0f0);
  } else if (k === 1) {                            // bob
    cap(0.098, h + 0.024, -0.008);
    P.ball(0.112, 0.078, 0.108, [0, h - 0.030, -0.020], 0xf6f6f6, { seg: 10, rseg: 6 });
  } else if (k === 2) {                            // long, past the shoulder
    cap(0.098, h + 0.024, -0.008);
    P.ball(0.108, 0.120, 0.095, [0, h - 0.085, -0.030], 0xf4f4f4, { seg: 10, rseg: 6 });
    P.box(0.150, 0.130, 0.070, [0, h - 0.180, -0.048], 0xeaeaea);
  } else if (k === 3) {                            // balding: a horseshoe only
    P.ball(0.106, 0.052, 0.110, [0, h - 0.012, -0.014], 0xffffff, { seg: 10, rseg: 5 });
    P.box(0.014, 0.034, 0.026, [0.094, h - 0.004, 0.000], 0xf0f0f0);
    P.box(0.014, 0.034, 0.026, [-0.094, h - 0.004, 0.000], 0xf0f0f0);
  } else if (k === 4) {                            // bun
    cap(0.090, h + 0.026, -0.008);
    P.ball(0.052, 0.048, 0.050, [0, h + 0.048, -0.098], 0xf6f6f6, { seg: 8, rseg: 6 });
  } else {                                         // beanie / ballcap wearer
    cap(0.098, h + 0.030, -0.006);
    P.half(0.150, 0.014, [0, h + 0.036, 0.030], 0xbdbdbd, { r: [0.24, 0, 0], seg: 12 });
  }
  return mergeParts(THREE, P.L);
}

function shopperLeg(THREE, S, b, side) {
  const P = partList(THREE, S);
  const t = b.th;
  P.taper(0.094 * t, 0.078 * t, 0.40, [side * 0.006, -0.20, 0], 0xffffff, { seg: 8 });
  P.ball(0.070 * t, 0.060, 0.072, [0, -0.415, 0.004], 0xf6f6f6, { seg: 8, rseg: 5 });
  P.taper(0.074 * t, 0.058 * t, 0.34, [0, -0.595, 0.002], 0xfafafa, { seg: 8 });
  P.tube(0.064 * t, 0.040, [0, -0.775, 0.004], 0xe6e6e6, { seg: 8 });         // cuff
  return mergeParts(THREE, P.L);
}

// Shoes were the critic's third missing noun. One geometry, its own material,
// so a shopper can be in trainers while the cop is in oxfords.
function shopperShoe(THREE, S, kind) {
  const P = partList(THREE, S);
  const y = -0.828;
  P.ball(0.048, 0.032, 0.088, [0, y + 0.006, 0.026], 0xffffff, { seg: 8, rseg: 5 });
  P.ball(0.042, 0.026, 0.052, [0, y + 0.002, 0.078], 0xf4f4f4, { seg: 8, rseg: 5 });
  P.box(0.094, 0.018, 0.196, [0, y - 0.022, 0.024], kind ? 0xd8d8d8 : 0x8a8a8a);
  P.box(0.084, 0.020, 0.056, [0, y - 0.012, -0.046], kind ? 0xe8e8e8 : 0x9a9a9a);
  if (kind) P.box(0.086, 0.012, 0.040, [0, y + 0.020, 0.020], 0xffffff);       // laces / stripe
  return mergeParts(THREE, P.L);
}

function shopperSleeve(THREE, S, long, side) {
  const P = partList(THREE, S);
  P.ball(0.082, 0.078, 0.080, [0, -0.020, 0], 0xffffff, { seg: 8, rseg: 6 });
  if (long) {
    P.taper(0.078, 0.060, 0.26, [side * 0.004, -0.155, 0], 0xffffff, { seg: 8 });
    P.taper(0.062, 0.052, 0.26, [side * 0.006, -0.400, 0.004], 0xf8f8f8, { seg: 8 });
    P.tube(0.058, 0.030, [side * 0.006, -0.522, 0.004], 0xdcdcdc, { seg: 8 });   // cuff
  } else {
    P.taper(0.080, 0.066, 0.17, [side * 0.004, -0.105, 0], 0xffffff, { seg: 8 });
    P.tube(0.070, 0.020, [side * 0.004, -0.196, 0], 0xe0e0e0, { seg: 8 });       // rolled hem
  }
  return mergeParts(THREE, P.L);
}

function shopperForearm(THREE, S, long, side) {
  const P = partList(THREE, S);
  if (!long) {
    P.ball(0.060, 0.058, 0.058, [0, -0.235, 0], 0xffffff, { seg: 8, rseg: 5 });   // elbow
    P.taper(0.060, 0.046, 0.24, [side * 0.006, -0.375, 0.004], 0xffffff, { seg: 8 });
  }
  P.ball(0.044, 0.040, 0.044, [side * 0.008, -0.512, 0.004], 0xffffff, { seg: 6, rseg: 5 });
  P.ball(0.038, 0.056, 0.052, [side * 0.008, -0.570, 0.010], 0xffffff, { seg: 8, rseg: 6 }); // palm
  P.box(0.052, 0.078, 0.044, [side * 0.008, -0.622, 0.014], 0xf6f6f6);                        // fingers
  P.ball(0.020, 0.030, 0.024, [side * -0.032, -0.566, 0.024], 0xfafafa, { seg: 6, rseg: 4 }); // thumb
  return mergeParts(THREE, P.L);
}

// ===========================================================================
// THE COP
// ===========================================================================
// Who he is, before any of it is geometry: a uniformed officer in his fifties
// on an off-duty retail shift he takes far too seriously. The comedy is that
// he is completely sincere, so nothing here is drawn as a joke — the belt is
// the funniest object in the game precisely because it is rendered as real
// equipment, correctly clocked, in the order a duty belt is actually loaded.
//
// The one deliberate departure from the old design is COLOUR. He was navy from
// the cap to the shoes, which is where "he's just kinda black" comes from and
// which is also fatal on the monitor wall: at 20 px tall a person is a stack of
// values, and one value is a smudge. Light French blue shirt over near-black
// trousers gives him three bands — dark cap, light torso, dark legs — and that
// silhouette survives all the way down to the CCTV feed.
const C = {
  shirt: 0x93a9c6, shirtSh: 0x7c92b0, shirtDk: 0x63779a, shirtHem: 0x53668a,
  navy: 0x232c40, navyDk: 0x161d2c, brim: 0x0e1320,
  trouser: 0x2a3145, stripe: 0x0c0f18,
  skin: 0xd9a481, skinSh: 0xb17d5c, skinDk: 0x8f5f45, lip: 0xb87765,
  hair: 0x8b8279, hairDk: 0x6e675f, tache: 0x6f6459, eye: 0x33291f,
  leather: 0x1a1a1f, leatherHi: 0x2b2b32,
  gold: 0xd8be6e, chrome: 0xc6cbd2, steel: 0x8d939b,
  white: 0xffffff, glove: 0x9fd0e0, radio: 0x2a2d33, red: 0xa8352c,
};

// Metal on the cop is not a material, it is a vertex colour on the SAME merged
// mesh wherever the roughness can be shared; where it cannot (the badge has to
// catch a specular the shirt must not) it goes in the kit mesh. Two materials
// and one texture for the whole man — see the draw-call ledger in makeCop().

// --- the head, and the cap, in ONE mesh ------------------------------------
// They are welded because nothing ever moves one relative to the other: the cap
// is on his head, the head is on his neck, and `neck` is the only joint. Thirty
// primitives for one draw call.
function copHead(THREE, S) {
  const P = partList(THREE, S), h = FIG.headY;
  const F = { uv: uvOf('face') }, X = { uv: uvOf('flat') };

  // neck: a thick one, and a roll at the back where a size-17 collar bites
  P.taper(0.066, 0.078, 0.115, [0, h - 0.155, -0.004], C.skin, { seg: 10, ...X });
  P.ball(0.074, 0.030, 0.042, [0, h - 0.106, -0.058], C.skinDk, { seg: 8, rseg: 4, ...X });
  P.ball(0.068, 0.026, 0.038, [0, h - 0.146, -0.060], C.skinDk, { seg: 8, rseg: 4, ...X });

  // skull, jaw, jowls, chin. The jaw is wide and the chin is soft: he is a
  // heavy man in his fifties, not a superhero with a mandible.
  P.ball(0.104, 0.110, 0.108, [0, h + 0.012, -0.006], C.skin, { seg: 12, rseg: 8, ...F });
  P.ball(0.082, 0.070, 0.062, [0, h + 0.020, -0.062], C.skin, { seg: 10, rseg: 6, ...X });
  P.ball(0.096, 0.074, 0.098, [0, h - 0.052, 0.006], C.skin, { seg: 12, rseg: 7, ...F });
  P.ball(0.038, 0.034, 0.034, [0.068, h - 0.066, 0.038], C.skin, { seg: 8, rseg: 5, ...X });
  P.ball(0.038, 0.034, 0.034, [-0.068, h - 0.066, 0.038], C.skin, { seg: 8, rseg: 5, ...X });
  P.ball(0.070, 0.036, 0.062, [0, h - 0.096, 0.022], C.skin, { seg: 10, rseg: 5, ...X });
  P.ball(0.078, 0.036, 0.070, [0, h - 0.124, 0.000], C.skinSh, { seg: 10, rseg: 5, ...X });

  // ears, with a darker inner bowl so they are not two lumps
  for (const s of [1, -1]) {
    P.ball(0.016, 0.038, 0.026, [s * 0.108, h - 0.008, -0.006], C.skin, { seg: 6, rseg: 5, ...X });
    P.ball(0.008, 0.022, 0.014, [s * 0.114, h - 0.010, -0.002], C.skinDk, { seg: 6, rseg: 4, ...X });
  }

  // brow, sockets, eyes. A brow that overhangs is what stops a face reading as
  // a mask: it puts the eyes in shadow at every light angle in the store.
  P.box(0.146, 0.020, 0.030, [0, h + 0.040, 0.072], C.skin, { r: [-0.20, 0, 0], ...X });
  for (const s of [1, -1]) {
    P.ball(0.026, 0.014, 0.012, [s * 0.042, h + 0.014, 0.086], C.skinSh, { seg: 8, rseg: 4, ...X });
    P.ball(0.015, 0.009, 0.008, [s * 0.042, h + 0.013, 0.093], C.eye, { seg: 6, rseg: 4, ...X });
    P.box(0.048, 0.012, 0.014, [s * 0.044, h + 0.049, 0.088], C.tache, { r: [0, 0, s * 0.16], ...X });
  }

  // nose: bridge, tip, nostrils. Slightly bulbous, slightly red.
  P.box(0.026, 0.058, 0.038, [0, h + 0.012, 0.083], C.skin, { r: [0.20, 0, 0], ...X });
  P.ball(0.026, 0.022, 0.026, [0, h - 0.020, 0.098], C.skin, { seg: 8, rseg: 6, ...X });
  for (const s of [1, -1]) {
    P.ball(0.011, 0.010, 0.010, [s * 0.021, h - 0.024, 0.090], C.skinSh, { seg: 6, rseg: 4, ...X });
  }

  // moustache and mouth. Salt and pepper, and it droops.
  P.box(0.084, 0.020, 0.022, [0, h - 0.048, 0.090], C.tache, { ...X });
  for (const s of [1, -1]) {
    P.box(0.021, 0.027, 0.020, [s * 0.041, h - 0.055, 0.087], C.tache, { r: [0, 0, s * 0.42], ...X });
  }
  P.box(0.046, 0.009, 0.014, [0, h - 0.072, 0.086], C.lip, { ...X });

  // what hair is left: a grey horseshoe under the cap band, plus sideburns
  P.ball(0.109, 0.062, 0.112, [0, h + 0.006, -0.008], C.hair, { seg: 12, rseg: 5, ...X });
  for (const s of [1, -1]) {
    P.box(0.016, 0.052, 0.032, [s * 0.098, h + 0.006, 0.006], C.hairDk, { ...X });
  }

  // ---- the cap ----------------------------------------------------------
  const K = { uv: uvOf('capcloth') };
  P.taper(0.116, 0.132, 0.084, [0, h + 0.142, -0.004], C.navy, { seg: 14, ...K });
  P.ball(0.116, 0.038, 0.112, [0, h + 0.182, -0.004], C.navy, { seg: 14, rseg: 5, ...K });
  P.tube(0.135, 0.042, [0, h + 0.098, -0.004], C.navyDk, { seg: 14, ...K });
  P.half(0.156, 0.015, [0, h + 0.082, 0.022], C.brim, { r: [0.24, 0, 0], seg: 16, uv: uvOf('shoe') });
  P.half(0.156, 0.008, [0, h + 0.074, 0.022], C.navyDk, { r: [0.24, 0, 0], seg: 16, ...K });
  return mergeParts(THREE, P.L);
}

// The metal on his head: cap shield and the gold chinstrap he never uses.
function copHeadKit(THREE, S) {
  const P = partList(THREE, S), h = FIG.headY, X = { uv: uvOf('flat') };
  P.box(0.150, 0.009, 0.011, [0, h + 0.088, 0.113], C.gold, { r: [0.24, 0, 0], ...X });
  for (const s of [1, -1]) {
    P.tube(0.010, 0.007, [s * 0.088, h + 0.096, 0.086], C.gold, { r: [Math.PI / 2, 0, 0], seg: 6, ...X });
  }
  P.box(0.052, 0.046, 0.012, [0, h + 0.108, 0.120], C.gold, { r: [0.06, 0, 0], ...X });
  P.cone(0.026, 0.030, [0, h + 0.077, 0.120], C.gold, { r: [Math.PI, 0, 0], seg: 6, ...X });
  P.box(0.034, 0.028, 0.006, [0, h + 0.110, 0.127], C.navyDk, { r: [0.06, 0, 0], ...X });
  return mergeParts(THREE, P.L);
}

// --- torso: the uniform shirt, and what is pinned to it ---------------------
// The shirt's ring table, hoisted out of copTorso so that everything PINNED to
// the shirt — placket, buttons, pockets, flaps, badge, epaulettes, collar, the
// mic cord — can ask the surface where it is instead of guessing. The first
// build guessed, and a pocket flap two centimetres proud of a chest reads, at
// any distance at all, as a slab hanging in mid-air next to a man.
const SHIRT_RINGS = [
  { y: -0.040, rx: 0.030, rz: 0.026, cz: 0.012, c: 'shirtHem' },
  { y: -0.015, rx: 0.196, rz: 0.166, cz: 0.012, c: 'shirtHem' },
  { y: 0.020, rx: 0.220, rz: 0.186, cz: 0.014, c: 'shirtHem' },
  // The tuck. Everything below is under the belt, everything above hangs over
  // it, and this pinch IS the silhouette. Without it he is a barrel with a
  // black band painted round the widest part.
  { y: 0.062, rx: 0.230, rz: 0.196, cz: 0.024, c: 'shirtDk' },
  { y: 0.100, rx: 0.248, rz: 0.212, cz: 0.036, c: 'shirt' },
  { y: 0.145, rx: 0.258, rz: 0.224, cz: 0.048, c: 'shirt' },
  { y: 0.195, rx: 0.258, rz: 0.224, cz: 0.048, c: 'shirt' },
  { y: 0.245, rx: 0.250, rz: 0.212, cz: 0.040, c: 'shirt' },
  { y: 0.300, rx: 0.238, rz: 0.196, cz: 0.028, c: 'shirt' },
  { y: 0.355, rx: 0.228, rz: 0.186, cz: 0.012, c: 'shirt' },
  { y: 0.410, rx: 0.224, rz: 0.180, cz: -0.002, c: 'shirt' },
  { y: 0.455, rx: 0.218, rz: 0.172, cz: -0.012, c: 'shirt' },
  { y: 0.487, rx: 0.188, rz: 0.152, cz: -0.016, c: 'shirtSh' },
  { y: 0.510, rx: 0.132, rz: 0.116, cz: -0.014, c: 'shirtSh' },
  { y: 0.528, rx: 0.088, rz: 0.082, cz: -0.010, c: 'shirtSh' },
  { y: 0.538, rx: 0.032, rz: 0.030, cz: -0.008, c: 'shirtSh' },
];
// The ring at height y, linearly blended.
function ringAt(y) {
  const R = SHIRT_RINGS;
  if (y <= R[0].y) return R[0];
  for (let i = 1; i < R.length; i++) {
    if (y <= R[i].y) {
      const a = R[i - 1], b = R[i], t = (y - a.y) / (b.y - a.y);
      return { rx: a.rx + (b.rx - a.rx) * t, rz: a.rz + (b.rz - a.rz) * t,
               cz: a.cz + (b.cz - a.cz) * t };
    }
  }
  return R[R.length - 1];
}
// Where the front of the shirt is at (x, y). THE function this file needed.
function surf(x, y) {
  const r = ringAt(y);
  const k = Math.min(1, Math.abs(x) / r.rx);
  return r.cz + r.rz * Math.sqrt(Math.max(0, 1 - k * k));
}
// The full surface FRAME at (x, y): where to put a flat plate and which way to
// point it. Placing plates at surf() alone was only half the fix — a pocket
// flap 90 mm wide and 15 mm deep, laid flat on a chest whose surface recedes
// 34 mm over the flap's own height, has its bottom edge buried and its top edge
// sticking out. From any angle that is a fin, not a pocket. Pitch follows the
// vertical slope, yaw follows the ellipse normal.
function onShirt(x, y, h) {
  const dy = (h || 0.05) * 0.5;
  const zc = surf(x, y);
  const pitch = Math.atan2(surf(x, y + dy) - surf(x, y - dy), dy * 2);
  const r = ringAt(y);
  const yaw = Math.atan2(x / (r.rx * r.rx), Math.max(1e-4, (zc - r.cz)) / (r.rz * r.rz));
  return { p: [x, y, zc], r: [pitch, yaw, 0], z: zc };
}
const SHIRT_MAXY = SHIRT_RINGS[SHIRT_RINGS.length - 1].y;

function copTorso(THREE, S) {
  const P = partList(THREE, S);
  const F = { uv: uvOf('shirt') }, X = { uv: uvOf('flat') };
  // ---- the man, as one surface -------------------------------------------
  // Chest -> soft waist -> the gut, which pushes FORWARD (cz) rather than
  // sideways, because that is what a gut does and it is the difference between
  // a heavy man and a wide one. The hem runs on down under the belt so the
  // shirt is tucked; the belt is worn low, under the overhang.
  P.L.push({
    g: loft(THREE, SHIRT_RINGS.map((r) => ({ ...r, c: C[r.c] })), 18, uvOf('shirt')),
    m: new THREE.Matrix4(),
  });

  // Round shoulders and a bit of upper back. The brief asks for a man who is
  // recognisable from behind at 7 m and this is most of that read.
  P.ball(0.164, 0.080, 0.068, [0, FIG.shoulderY - 0.004, -0.104], C.shirtSh, { seg: 12, rseg: 6, ...F });
  P.ball(0.094, 0.062, 0.050, [0, FIG.shoulderY + 0.042, -0.044], C.shirtSh, { seg: 8, rseg: 5, ...F });

  // The collar. A stand round the throat and two points lying ON the chest.
  P.tube(0.088, 0.070, [0, FIG.neckY + 0.020, -0.006], C.shirtSh, { seg: 12, ...F });
  for (const s of [1, -1]) {
    const f = onShirt(s * 0.052, 0.501, 0.058);
    P.box(0.070, 0.014, 0.058, [f.p[0], f.p[1], f.p[2] - 0.010],
      C.shirtSh, { r: [f.r[0] + 0.34, f.r[1], s * -0.28], ...F });
  }
  // Placket and buttons. Sunk 4 mm so only the proud face shows.
  for (let i = 0; i < 6; i++) {
    const y = 0.432 - i * 0.074;
    const f = onShirt(0, y, 0.078);
    P.box(0.048, 0.078, 0.016, [f.p[0], f.p[1], f.p[2] - 0.005], C.shirtSh, { r: f.r, ...F });
    const b = onShirt(0, y - 0.030, 0.02);
    P.tube(0.011, 0.007, [b.p[0], b.p[1], b.p[2] + 0.005], C.shirtHem,
      { r: [Math.PI / 2 + b.r[0], 0, 0], seg: 6, ...X });
  }
  // breast pockets with flaps and a pen
  for (const s of [1, -1]) {
    const f = onShirt(s * 0.104, 0.348, 0.090);
    P.box(0.098, 0.090, 0.014, [f.p[0], f.p[1], f.p[2] - 0.006], C.shirtSh, { r: f.r, ...F });
    const g = onShirt(s * 0.104, 0.398, 0.030);
    P.box(0.104, 0.028, 0.017, [g.p[0], g.p[1], g.p[2] - 0.006], C.shirtDk, { r: g.r, ...F });
  }
  const pen = onShirt(-0.076, 0.418, 0.048);
  P.box(0.011, 0.048, 0.011, [pen.p[0], pen.p[1], pen.p[2] + 0.003], C.red, { r: pen.r, ...X });
  // Epaulettes, lying along the shoulder slope. At the old x=0.176, y=0.512 the
  // torso is only 0.13 wide, so both of them hung in the air beside his neck.
  for (const s of [1, -1]) {
    P.box(0.086, 0.016, 0.072, [s * 0.148, 0.466, -0.012],
      C.shirtSh, { r: [0, 0, s * -0.42], ...F });
  }
  const front = (y) => surf(0, y);
  // shoulder-mic cord: down off the left epaulette, across the chest, to the
  // radio on the belt. It is the detail that says "on duty" from behind.
  const cord = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    const yy = 0.432 - t * 0.37;
    const rr = 0.030 + t * 0.014;
    const a = t * 8.4;
    const xx = 0.132 - t * 0.050 + Math.cos(a) * rr;
    cord.push(new THREE.Vector3(xx, yy + Math.sin(a) * 0.008,
      surf(xx, yy) + 0.006 + Math.sin(a) * rr * 0.55));
  }
  P.L.push({
    g: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cord), 24, 0.0060, 4, false),
    c: 0x3d4048, m: new THREE.Matrix4(), uv: uvOf('flat'),
  });
  return mergeParts(THREE, P.L);
}

// The seat and the crotch, on `hips` rather than on `chest`, because the
// trousers belong to the pelvis and the pelvis is what the legs hang off. The
// first build left this out and his thighs started in mid-air under the shirt:
// a gap you could see the floor through, right where a man is widest.
function copSeat(THREE, S) {
  const P = partList(THREE, S);
  P.L.push({
    g: loft(THREE, [
      { y: -0.170, rx: 0.040, rz: 0.048, cz: 0.010, c: C.trouser },
      { y: -0.145, rx: 0.150, rz: 0.128, cz: 0.008, c: C.trouser },
      { y: -0.090, rx: 0.204, rz: 0.176, cz: 0.006, c: C.trouser },
      { y: -0.030, rx: 0.232, rz: 0.196, cz: 0.008, c: C.trouser },
      { y: 0.030, rx: 0.238, rz: 0.200, cz: 0.010, c: C.trouser },
      { y: 0.080, rx: 0.230, rz: 0.192, cz: 0.012, c: C.trouser },
      { y: 0.110, rx: 0.190, rz: 0.160, cz: 0.012, c: C.trouser },
      { y: 0.128, rx: 0.060, rz: 0.055, cz: 0.010, c: C.trouser },
    ], 16, uvOf('twill')),
    m: new THREE.Matrix4(),
  });
  return mergeParts(THREE, P.L);
}

// The kit pinned to the shirt. Badge on his LEFT chest (+X is his left: the
// figure faces +Z, so right = -X — the old rig had the badge on the wrong side),
// nameplate over the right pocket, collar brass on both points.
function copTorsoKit(THREE, S) {
  const P = partList(THREE, S), X = { uv: uvOf('flat') };
  // Shield on his LEFT chest, above the pocket flap, lying on the surface with
  // the surface's own pitch and yaw. A badge that catches the light has to face
  // the same way the chest does or the highlight lands nowhere.
  const b = onShirt(0.104, 0.448, 0.070);
  const bp = [b.p[0], b.p[1], b.p[2] - 0.002];
  P.tube(0.039, 0.012, bp, C.gold, { r: [Math.PI / 2 + b.r[0], b.r[1], 0], seg: 6, ...X });
  P.cone(0.039, 0.036, [bp[0], bp[1] - 0.034, bp[2] + 0.034 * Math.tan(b.r[0])],
    C.gold, { r: [Math.PI - b.r[0], b.r[1], 0], seg: 6, ...X });
  P.tube(0.020, 0.015, bp, C.chrome, { r: [Math.PI / 2 + b.r[0], b.r[1], 0], seg: 6, ...X });
  // nameplate, engraved, over the right pocket
  const n = onShirt(-0.104, 0.450, 0.020);
  P.box(0.084, 0.019, 0.012, n.p, C.gold, { r: n.r, uv: uvOf('name') });
  // collar brass, on the collar points
  for (const s of [1, -1]) {
    const f = onShirt(s * 0.056, 0.490, 0.020);
    P.box(0.016, 0.013, 0.007, [f.p[0], f.p[1], f.p[2] + 0.005],
      C.gold, { r: [f.r[0] + 0.30, f.r[1], 0], ...X });
  }
  // shoulder mic clipped to the left epaulette
  const mc = onShirt(0.132, 0.428, 0.052);
  P.box(0.032, 0.052, 0.024, [mc.p[0], mc.p[1], mc.p[2] + 0.008], C.radio, { r: [mc.r[0] + 0.10, mc.r[1], 0], uv: uvOf('grip') });
  P.box(0.022, 0.022, 0.007, [mc.p[0], mc.p[1] + 0.018, mc.p[2] + 0.020], C.steel, { r: [mc.r[0] + 0.10, mc.r[1], 0], uv: uvOf('radio') });
  return mergeParts(THREE, P.L);
}

// --- the duty belt ----------------------------------------------------------
// Worn LOW, under the gut, which is both correct and the whole silhouette gag.
// Items are clocked by angle from the front; his left is +X. The order is the
// order a duty belt is actually loaded, strong side first.
const BELT_RX = 0.238, BELT_RZ = 0.202, BELT_CZ = 0.016, BELT_Y = 0.044;

// Place a thing on the belt: `th` radians from dead front, `out` metres proud of
// the strap. Yaw follows the true ellipse normal, so nothing sits crooked.
function onBelt(th, out, dy) {
  const sx = Math.sin(th), cz = Math.cos(th);
  const nx = sx / BELT_RX, nz = cz / BELT_RZ;
  const nl = Math.hypot(nx, nz) || 1;
  return {
    p: [sx * BELT_RX + (nx / nl) * out, BELT_Y + (dy || 0),
        cz * BELT_RZ + BELT_CZ + (nz / nl) * out],
    y: Math.atan2(nx / nl, nz / nl),
  };
}

function copBelt(THREE, S) {
  const P = partList(THREE, S);
  const W = { uv: uvOf('weave') }, X = { uv: uvOf('flat') };
  // the strap itself: 26 flat segments round the ellipse, basketweave-mapped
  const N = 26;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const b = onBelt(th, 0.004, 0);
    const seg = (Math.PI * 2 / N) * Math.hypot(BELT_RX * Math.cos(th), BELT_RZ * Math.sin(th));
    P.box(seg * 1.35, 0.062, 0.026, b.p, C.leather, { r: [0, b.y, 0], ...W });
  }
  // keepers, holding the duty belt to the trouser belt
  for (const th of [0.7, 2.4, -0.7, -2.4]) {
    const b = onBelt(th, 0.008, 0);
    P.box(0.030, 0.086, 0.036, b.p, C.leatherHi, { r: [0, b.y, 0], ...W });
  }
  const put = (th, out, dy, f) => { const b = onBelt(th, out, dy); f(b.p, b.y); };

  // holster, right hip, flap CLOSED — the shape says officer, and nothing in a
  // grocery store needs to see what is under the flap
  put(-1.62, 0.030, -0.052, (p, y) => {
    P.box(0.086, 0.180, 0.128, p, C.leather, { r: [0, y, 0], ...W });
    P.box(0.092, 0.030, 0.134, [p[0], p[1] + 0.098, p[2]], C.leatherHi, { r: [0, y, 0], ...W });
    P.box(0.026, 0.086, 0.020, [p[0], p[1] + 0.100, p[2] + 0.062], C.leatherHi, { r: [0, y, 0], ...W });
    P.box(0.072, 0.052, 0.040, [p[0], p[1] + 0.130, p[2] - 0.020], C.leather, { r: [0, y, 0], ...W });
  });
  // cuff cases, one each side
  for (const th of [1.02, -1.02]) put(th, 0.018, -0.006, (p, y) => {
    P.box(0.076, 0.070, 0.058, p, C.leather, { r: [0, y, 0], ...W });
    P.box(0.080, 0.020, 0.062, [p[0], p[1] + 0.040, p[2]], C.leatherHi, { r: [0, y, 0], ...W });
  });
  // OC spray in an open-top carrier
  put(1.62, 0.020, -0.020, (p, y) => {
    P.box(0.052, 0.062, 0.050, p, C.leather, { r: [0, y, 0], ...W });
    P.tube(0.020, 0.104, [p[0], p[1] + 0.052, p[2]], C.red, { seg: 8, ...X });
    P.tube(0.014, 0.020, [p[0], p[1] + 0.112, p[2]], 0x1c1c1c, { seg: 6, ...X });
  });
  // radio, left rear, antenna up
  put(2.42, 0.020, -0.030, (p, y) => {
    P.box(0.064, 0.140, 0.044, p, C.radio, { r: [0, y, 0], uv: uvOf('radio') });
    P.box(0.070, 0.026, 0.050, [p[0], p[1] - 0.076, p[2]], C.leather, { r: [0, y, 0], ...W });
    P.taper(0.005, 0.009, 0.150, [p[0] - 0.012, p[1] + 0.140, p[2] - 0.012],
      0x101014, { r: [-0.16, 0, 0.10], seg: 6, ...X });
  });
  // glove pouch, with a glove sticking out of it because it always is
  put(2.02, 0.018, -0.004, (p, y) => {
    P.box(0.092, 0.058, 0.042, p, C.leather, { r: [0, y, 0], ...W });
    P.box(0.062, 0.028, 0.034, [p[0], p[1] + 0.036, p[2]], C.glove, { r: [0, y, 0.22], uv: uvOf('glove') });
    P.box(0.096, 0.018, 0.046, [p[0], p[1] + 0.024, p[2]], C.leatherHi, { r: [0, y, 0], ...W });
  });
  // citation book — an officer doing loss prevention writes it up
  put(-0.56, 0.016, 0.004, (p, y) => {
    P.box(0.098, 0.086, 0.028, p, C.leather, { r: [0, y, 0], ...W });
    P.box(0.084, 0.070, 0.010, [p[0], p[1] + 0.006, p[2] + 0.016], 0xe8e4d8, { r: [0, y, 0], ...X });
  });
  // torch on a ring, right rear, hanging
  put(-2.34, 0.016, -0.020, (p, y) => {
    P.ring(0.026, 0.008, [p[0], p[1] - 0.016, p[2]], C.leather, { r: [0, y, 0], seg: 10, ...X });
    P.taper(0.021, 0.026, 0.116, [p[0], p[1] - 0.080, p[2]], 0x17171b, { r: [0, y, 0.10], seg: 8, uv: uvOf('grip') });
  });
  // baton loop, left rear
  put(2.88, 0.014, -0.014, (p, y) => {
    P.ring(0.028, 0.009, [p[0], p[1] - 0.012, p[2]], C.leather, { r: [0, y, 0], seg: 10, ...X });
    P.taper(0.016, 0.021, 0.150, [p[0] + 0.004, p[1] - 0.092, p[2]], 0x15151a, { r: [0, y, -0.09], seg: 8, ...X });
  });
  return mergeParts(THREE, P.L);
}

function copBeltKit(THREE, S) {
  const P = partList(THREE, S), X = { uv: uvOf('flat') };
  const put = (th, out, dy, f) => { const b = onBelt(th, out, dy); f(b.p, b.y); };
  // buckle
  put(0, 0.016, 0, (p, y) => {
    P.box(0.086, 0.062, 0.016, p, C.chrome, { r: [0, y, 0], ...X });
    P.box(0.058, 0.036, 0.020, [p[0], p[1], p[2] + 0.004], C.steel, { r: [0, y, 0], ...X });
  });
  // cuff-case snaps
  for (const th of [1.02, -1.02]) put(th, 0.048, 0.034, (p, y) => {
    P.tube(0.009, 0.008, [p[0], p[1], p[2]], C.chrome, { r: [Math.PI / 2, y, 0], seg: 6, ...X });
  });
  // a cuff bow peeking out of the strong-side case, which is what a loaded case
  // looks like from behind
  put(-1.02, 0.036, 0.044, (p, y) => {
    P.ring(0.026, 0.007, [p[0], p[1], p[2]], C.chrome, { r: [0.35, y, 0], seg: 10, ...X });
  });
  // holster thumb break + belt shank hardware
  put(-1.62, 0.084, 0.048, (p, y) => {
    P.tube(0.011, 0.009, [p[0], p[1], p[2]], C.chrome, { r: [Math.PI / 2, y, 0], seg: 6, ...X });
  });
  // torch bezel and tail cap
  put(-2.34, 0.016, 0, (p, y) => {
    P.taper(0.027, 0.023, 0.024, [p[0], p[1] - 0.142, p[2]], C.chrome, { r: [0, y, 0.10], seg: 8, ...X });
    P.tube(0.023, 0.016, [p[0], p[1] - 0.030, p[2]], C.steel, { r: [0, y, 0.10], seg: 8, ...X });
  });
  // keys, right rear, on a D-ring. Nine of them. He has keys to things that are
  // not his.
  put(-2.86, 0.014, -0.014, (p, y) => {
    P.ring(0.024, 0.006, [p[0], p[1] - 0.010, p[2]], C.steel, { r: [0.25, y, 0], seg: 10, ...X });
    for (let i = 0; i < 5; i++) {
      P.box(0.010, 0.056, 0.003, [p[0] + (i - 2) * 0.009, p[1] - 0.058, p[2] + (i % 2) * 0.006],
        C.steel, { r: [0, y, (i - 2) * 0.16], ...X });
    }
  });
  return mergeParts(THREE, P.L);
}

// --- legs -------------------------------------------------------------------
// Trouser with the outseam stripe, a break over the shoe, and a real oxford on
// the end of it: sole, heel, welt and a toe cap that takes a highlight. Shoes
// not made for running.
function copLeg(THREE, S, side) {
  const P = partList(THREE, S);
  const T = { uv: uvOf('twill') }, X = { uv: uvOf('flat') };
  P.taper(0.118, 0.094, 0.42, [side * 0.006, -0.205, 0], C.trouser, { seg: 10, ...T });
  P.ball(0.086, 0.062, 0.090, [0, -0.428, 0.008], C.trouser, { seg: 8, rseg: 5, ...T });
  P.taper(0.090, 0.076, 0.34, [0, -0.600, 0.004], C.trouser, { seg: 10, ...T });
  P.tube(0.078, 0.052, [0, -0.782, 0.010], C.trouser, { seg: 10, ...T });      // break
  // outseam stripe, on the outside of each leg
  // Four short segments, each set at the leg's own radius at that height, so
  // the stripe stays ON the trouser instead of hanging beside it.
  const OUT = [[-0.06, 0.113], [-0.24, 0.100], [-0.44, 0.088], [-0.62, 0.081], [-0.77, 0.077]];
  for (let i = 0; i < OUT.length - 1; i++) {
    const a = OUT[i], b = OUT[i + 1];
    P.box(0.013, a[0] - b[0] + 0.006, 0.030,
      [side * (a[1] + b[1]) * 0.5, (a[0] + b[0]) * 0.5, 0.004], C.stripe, { ...X });
  }
  // the oxford
  const y = -0.826;
  P.ball(0.052, 0.036, 0.086, [0, y + 0.010, 0.020], 0x232326, { seg: 10, rseg: 6, uv: uvOf('shoe') });
  P.ball(0.046, 0.028, 0.056, [0, y + 0.002, 0.078], 0x2b2b2f, { seg: 10, rseg: 6, uv: uvOf('shoe') });
  P.box(0.100, 0.016, 0.208, [0, y - 0.022, 0.020], 0x1a1a1c, { ...X });        // sole
  P.box(0.104, 0.008, 0.212, [0, y - 0.012, 0.020], 0x3a3a3e, { ...X });        // welt
  P.box(0.090, 0.026, 0.062, [0, y - 0.020, -0.056], 0x141416, { ...X });       // heel
  P.box(0.050, 0.014, 0.052, [0, y + 0.030, 0.016], 0x1c1c1f, { ...X });        // laces
  return mergeParts(THREE, P.L);
}

// --- arms -------------------------------------------------------------------
// Short-sleeve summer uniform: it gets the shoulder patch out where it can be
// seen and it puts two bands of skin in the silhouette, which is worth more at
// CCTV resolution than any amount of detail on the sleeve itself.
function copSleeve(THREE, S, side) {
  const P = partList(THREE, S);
  const F = { uv: uvOf('shirt') };
  P.ball(0.097, 0.076, 0.093, [0, -0.032, 0], C.shirt, { seg: 10, rseg: 7, ...F });
  P.taper(0.093, 0.081, 0.24, [side * 0.004, -0.142, 0], C.shirt, { seg: 10, ...F });
  P.tube(0.083, 0.026, [side * 0.004, -0.274, 0], C.shirtDk, { seg: 10, ...F });   // rolled hem
  // shoulder patch, proud of the sleeve, facing outboard
  P.box(0.006, 0.090, 0.074, [side * 0.094, -0.080, -0.002], C.white,
    { r: [0, 0, side * -0.06], uv: uvOf('patch') });
  return mergeParts(THREE, P.L);
}

function copForearm(THREE, S, side) {
  const P = partList(THREE, S);
  const X = { uv: uvOf('flat') };
  P.ball(0.076, 0.070, 0.074, [0, -0.292, 0], C.skin, { seg: 8, rseg: 6, ...X });
  P.taper(0.074, 0.054, 0.22, [side * 0.008, -0.412, 0.004], C.skin, { seg: 10, ...X });
  P.ball(0.050, 0.046, 0.050, [side * 0.010, -0.530, 0.004], C.skin, { seg: 8, rseg: 5, ...X });
  P.ball(0.044, 0.056, 0.056, [side * 0.010, -0.586, 0.012], C.skin, { seg: 8, rseg: 6, ...X });
  P.box(0.058, 0.076, 0.050, [side * 0.010, -0.636, 0.016], C.skin, { ...X });
  P.ball(0.023, 0.032, 0.027, [side * -0.031, -0.582, 0.028], C.skin, { seg: 6, rseg: 5, ...X });
  if (side < 0) {                                    // watch, right wrist
    P.tube(0.052, 0.020, [side * 0.010, -0.522, 0.004], 0x22222a, { seg: 8, ...X });
    P.tube(0.020, 0.026, [side * 0.010, -0.522, 0.038], C.steel, { r: [Math.PI / 2, 0, 0], seg: 8, ...X });
  }
  return mergeParts(THREE, P.L);
}

// ===========================================================================
// THE BAKERY. One call, at startup, and every figure in the store shares what
// comes out of it.
// ===========================================================================
export function buildFigureGeo(THREE) {
  const S = shapes(THREE);
  const tex = copAtlas(THREE);
  const F = {
    tex,
    cloth: clothAtlas(THREE),
    // shopper library, indexed by build / style
    torso: BUILDS.map((b) => shopperTorso(THREE, S, b)),
    belly: shopperBelly(THREE, S),
    head: [shopperHead(THREE, S, false), shopperHead(THREE, S, true)],
    hair: [0, 1, 2, 3, 4, 5].map((k) => shopperHair(THREE, S, k)),
    leg: BUILDS.map((b) => [shopperLeg(THREE, S, b, 1), shopperLeg(THREE, S, b, -1)]),
    shoe: [shopperShoe(THREE, S, 0), shopperShoe(THREE, S, 1)],
    sleeve: [[shopperSleeve(THREE, S, false, 1), shopperSleeve(THREE, S, false, -1)],
             [shopperSleeve(THREE, S, true, 1), shopperSleeve(THREE, S, true, -1)]],
    fore: [[shopperForearm(THREE, S, false, 1), shopperForearm(THREE, S, false, -1)],
           [shopperForearm(THREE, S, true, 1), shopperForearm(THREE, S, true, -1)]],
    // the cop, baked once, one instance
    cop: {
      head: copHead(THREE, S), headKit: copHeadKit(THREE, S),
      torso: copTorso(THREE, S), torsoKit: copTorsoKit(THREE, S),
      seat: copSeat(THREE, S),
      belt: copBelt(THREE, S), beltKit: copBeltKit(THREE, S),
      leg: [copLeg(THREE, S, 1), copLeg(THREE, S, -1)],
      sleeve: [copSleeve(THREE, S, 1), copSleeve(THREE, S, -1)],
      fore: [copForearm(THREE, S, 1), copForearm(THREE, S, -1)],
      belly: copBelly(THREE, S),
    },
    BUILDS,
  };
  return F;
}

// ---------------------------------------------------------------------------
// Roll a shopper. The critic's complaint was that they looked like "the same
// person recoloured", and a colour roll is exactly what the old one was: two
// numbers of variation (girth, height) and four palettes. This rolls a BUILD,
// an AGE and a SILHOUETTE, and the palettes follow from them — a senior gets
// grey hair and a stoop and a longer coat, a slim young one gets a tee and
// trainers. Height spread is 1.53 m to 1.83 m, which is a real crowd.
// ---------------------------------------------------------------------------
export function rollPerson(rng) {
  const { rr, ri, pick, rnd } = rng;
  const bi = ri(0, 3);
  const age = rnd() < 0.20 ? 'old' : rnd() < 0.22 ? 'young' : 'adult';
  const tall = age === 'young' ? rr(0.93, 1.04) : rr(0.94, 1.11);
  const long = rnd() < 0.45;
  let hair = ri(0, 5);
  if (age === 'old' && rnd() < 0.55) hair = 3;
  // CLOTH carries two beiges (0xbfa89b, 0xd9b8a0) that are within a few points
  // of two of the skin tones, and when a person rolls both plus `plain` they
  // come out looking naked from the waist up. Re-roll the shirt off the skin.
  const skin = pick(SKIN);
  const near = (a, b) => Math.abs((a >> 16 & 255) - (b >> 16 & 255))
    + Math.abs((a >> 8 & 255) - (b >> 8 & 255)) + Math.abs((a & 255) - (b & 255));
  let shirt = pick(CLOTH);
  for (let k = 0; k < 6 && near(shirt, skin) < 90; k++) shirt = pick(CLOTH);
  return {
    build: bi,
    height: age === 'old' ? tall * 0.965 : tall,
    girth: rr(0.92, 1.08) * (age === 'old' ? 0.95 : 1),
    skin,
    hair: age === 'old' ? pick(GREY) : pick(HAIR),
    shirt,
    pants: pick(PANTS),
    shoe: pick(SHOE),
    headLong: rnd() < 0.5,
    hairStyle: hair,
    sleeve: long ? 1 : 0,
    shoeKind: rnd() < 0.4 ? 1 : 0,
    stoop: BUILDS[bi].st + (age === 'old' ? 0.16 : 0),
    plain: rnd() < 0.3,
    age,
  };
}

// ---------------------------------------------------------------------------
// A SHOPPER. Same joints as the cop, so one animator drives both.
// Draw calls: torso, head, hair, 2 legs, 2 shoes, 2 sleeves, 2 forearms
// (+ belly on a heavy build) = 10-11, against the old rig's 9-12. More person,
// no more calls: the detail is inside merged geometry, and the variety is in
// which baked geometry a person points at.
// ---------------------------------------------------------------------------
export function makePerson(THREE, F, o) {
  const g = new THREE.Group();
  const b = BUILDS[o.build];
  const shirt = new THREE.MeshStandardMaterial({
    color: o.shirt, roughness: 0.92, vertexColors: true,
    map: o.plain ? null : F.cloth[(o.hairStyle + o.build) & 3],
  });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.95, vertexColors: true });
  const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.78, vertexColors: true });
  const hairM = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 1.0, vertexColors: true });
  const shoeM = new THREE.MeshStandardMaterial({ color: o.shoe, roughness: 0.62, vertexColors: true });

  const hips = new THREE.Group(); hips.position.y = FIG.hipY; g.add(hips);
  const chest = new THREE.Group(); hips.add(chest);

  const torso = new THREE.Mesh(F.torso[o.build], shirt);
  torso.scale.set(o.girth, 1, o.girth); torso.castShadow = true; chest.add(torso);

  let belly = null;
  if (b.be > 0) {
    belly = new THREE.Mesh(F.belly, shirt);
    belly.position.set(0, 0.185, 0.075 + b.be * 0.045);
    belly.scale.set(0.40 * b.ch * o.girth, 0.30, 0.30 * b.ch * o.girth);
    chest.add(belly);
  }

  const neck = new THREE.Group(); neck.position.y = FIG.neckY; chest.add(neck);
  const head = new THREE.Mesh(F.head[o.headLong ? 1 : 0], skin); neck.add(head);
  neck.add(new THREE.Mesh(F.hair[o.hairStyle], hairM));

  const limb = (geo, mat, x, y, extra) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    piv.add(new THREE.Mesh(geo, mat));
    if (extra) piv.add(new THREE.Mesh(extra[0], extra[1]));
    return piv;
  };
  const hw = 0.098 * b.th * o.girth, sw = 0.190 * b.sh * o.girth;
  const legL = limb(F.leg[o.build][0], pants, hw, 0, [F.shoe[o.shoeKind], shoeM]);
  const legR = limb(F.leg[o.build][1], pants, -hw, 0, [F.shoe[o.shoeKind], shoeM]);
  const armL = limb(F.sleeve[o.sleeve][0], shirt, sw, FIG.shoulderY,
    [F.fore[o.sleeve][0], o.sleeve ? shirt : skin]);
  const armR = limb(F.sleeve[o.sleeve][1], shirt, -sw, FIG.shoulderY,
    [F.fore[o.sleeve][1], o.sleeve ? shirt : skin]);
  // A long-sleeved person still has hands; they are just the same mesh in the
  // skin material, so the sleeve geometry covers the arm and the hand shows.
  if (o.sleeve) {
    armL.add(new THREE.Mesh(F.fore[0][0], skin));
    armR.add(new THREE.Mesh(F.fore[0][1], skin));
  }
  hips.add(legL); hips.add(legR); chest.add(armL); chest.add(armR);

  g.scale.setScalar(o.height);
  return {
    root: g, hips, chest, torso, belly, neck, head, legL, legR, armL, armR,
    shirt, pants, hipY: FIG.hipY, stoop: o.stoop, cop: false,
  };
}

// ---------------------------------------------------------------------------
// HIM.
// Draw-call ledger, and it is the reason this is worth doing merged: eleven
// meshes, against the old rig's fifteen (torso, belly, head, hair, collar, two
// legs, two arms, two hands, belt, cap, brim, badge). The scene renders TEN
// times a frame, so that is 40 draw calls a frame given back while adding a
// face, a duty belt with eleven items on it, shoulder patches and a nameplate.
//   hips  : torso(1) torsoKit(1) belly(1)
//   belt  : leather(1) metal(1)          <- own group, swings out of phase
//   neck  : head+cap(1) headKit(1)
//   legs  : 2
//   arms  : sleeve(2) forearm(2) ... shared material, so 4
// = 13. Two over the old rig; the two are the belt, and the belt is the joke.
// ---------------------------------------------------------------------------
export function makeCop(THREE, F) {
  const g = new THREE.Group();
  const uni = new THREE.MeshStandardMaterial({
    vertexColors: true, map: F.tex, roughness: 0.86, metalness: 0.0,
  });
  const leather = new THREE.MeshStandardMaterial({
    vertexColors: true, map: F.tex, roughness: 0.44, metalness: 0.08,
  });
  // Metalness with no environment map renders BLACK — the cart bakery already
  // learned this and the badge relearned it: at 0.72 the chrome centre of the
  // shield came out as a hole. This is metalness that keeps most of its
  // diffuse, so brass takes a specular off the ceiling troffers and still reads
  // as a bright object rather than a silhouette.
  const kit = new THREE.MeshStandardMaterial({
    vertexColors: true, map: F.tex, roughness: 0.30, metalness: 0.38,
  });

  const hips = new THREE.Group(); hips.position.y = FIG.hipY; g.add(hips);
  const chest = new THREE.Group(); hips.add(chest);

  const torso = new THREE.Mesh(F.cop.torso, uni);
  torso.castShadow = true; chest.add(torso);
  chest.add(new THREE.Mesh(F.cop.torsoKit, kit));

  // No separate belly mesh. The gut is IN the torso loft, which is the only way
  // it can have no seam where it meets the shirt, and the heave is carried by
  // `chest.scale` instead — see animateCop(). One draw call back, and one
  // fewer surface to go wrong.
  const belly = null;
  hips.add(new THREE.Mesh(F.cop.seat, uni));

  const beltGrp = new THREE.Group(); hips.add(beltGrp);
  beltGrp.add(new THREE.Mesh(F.cop.belt, leather));
  beltGrp.add(new THREE.Mesh(F.cop.beltKit, kit));

  const neck = new THREE.Group();
  neck.position.set(0, FIG.neckY, 0.026);        // head carried slightly forward
  chest.add(neck);
  const head = new THREE.Mesh(F.cop.head, uni);
  head.castShadow = true; neck.add(head);
  neck.add(new THREE.Mesh(F.cop.headKit, kit));

  const limb = (a, b, mb, x, y) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    piv.add(new THREE.Mesh(a, uni));
    if (b) piv.add(new THREE.Mesh(b, mb || uni));
    return piv;
  };
  const legL = limb(F.cop.leg[0], null, null, 0.112, 0);
  const legR = limb(F.cop.leg[1], null, null, -0.112, 0);
  const armL = limb(F.cop.sleeve[0], F.cop.fore[0], uni, 0.206, FIG.shoulderY + 0.012);
  const armR = limb(F.cop.sleeve[1], F.cop.fore[1], uni, -0.206, FIG.shoulderY + 0.012);
  hips.add(legL); hips.add(legR); chest.add(armL); chest.add(armR);

  g.scale.setScalar(1.04);
  return {
    root: g, hips, chest, torso, belly, neck, head, legL, legR, armL, armR,
    beltGrp, shirt: uni, pants: uni, kit, leather,
    hipY: FIG.hipY, stoop: 0.09, cop: true,
  };
}

