// OWNER: builder-agents (CHARACTER). Everything in this game with a face on it.
// agents.js owns how people MOVE; this file owns what they look like while they
// do it. Exports (agents.js imports exactly these):
//
//   mergeParts(THREE, parts)      — geometry baker, also used by the cart
//   buildFigureGeo(THREE)         — the shared bakery. Call ONCE.
//   rollPerson(rng)               — roll a shopper's description
//   makePerson(THREE, F, o)       — a shopper rig
//   makeChild(THREE, F, o)        — a child rig (round 9; also reached via
//                                   makePerson, which builds one when the
//                                   person rolled a `kid`)
//   makeCop(THREE, F)             — HIM
//
// All three rigs return the SAME contract, because animateShopper()/
// animateCop()/animateChild() all drive it:
//   { root, hips, chest, torso, belly, neck, head, legL, legR, armL, armR,
//     shirt, pants, hipY }
// ROUND 5 (character) adds THE ELBOW to that contract, on all three rigs, and
// it is three calls and nothing else:
//   setElbow(side, th)      set the interior elbow angle in radians. `side` is
//                           +1 for the left arm and -1 for the right, matching
//                           every other builder in this file. Returns the angle
//                           actually used, which is the clamped one.
//   elbowOf(side)           read it back.
//   handRig(side, AL, out)  where that hand IS, in rig-local metres — the one
//                           owner, called by agents.js's prop solve AND its
//                           grasp query. `AL` is the caller's own arm length so
//                           the straight-stick term is preserved exactly and
//                           the joint contributes a pure displacement.
// `armL`/`armR` still name the SHOULDER PIVOT, so every clip, idle and gait
// channel that writes armR.rotation.x is untouched. See the ROUND 5 block under
// SH_ARM for what the joint does and why it is built the way it is.
// ROUND 9 adds three fields to the shopper rig and nothing may write them after
// construction:
//   pose   the per-person gait / idle / cart-hold table. See rollPose.
//   kid    a child rig, or null. agents.js decides where to parent it.
//   bag    a tote / crossbody / carrier bag mesh, or null.
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
//
// ===========================================================================
// ROUND 7 — "HE SHOULD REALLY LOOK FAT AND BEATEN UP."
// ===========================================================================
// Round 1 made him a person. This round makes him a person who has been doing
// this job for too long, and the note was specific: FAT AND BEATEN UP, not just
// fat. Everything below was chosen against one filter — DOES IT CHANGE THE
// SILHOUETTE — because he has to survive at 214x120 on a monitor tile, where a
// three-band stack (dark cap / light torso / dark legs) is all that is left.
// Detail that only exists at 3x focal length is decoration; detail that changes
// his outline pays at both scales and is worth twice as much.
//
// WHAT CHANGED THE OUTLINE (these are the ones that mattered):
//   1. A GUT THAT HANGS. Not a bigger sphere — a different shape. On a heavy
//      man in a duty belt the strap goes UNDER the overhang, so the profile is
//      narrow at the belt, widest 60 mm above it, and near-vertical in between.
//      Round 6 had the apex 100 mm above the belt and 10 mm proud of it, which
//      is a barrel with a band painted round it. The ring the belt now rides on
//      (rx 0.220) is NARROWER THAN THE BELT (BELT_RX 0.238), so the strap
//      disappears beneath him. At 214 px the light band goes from a rectangle
//      to a pear: widest at the bottom, with the dark waist notch UNDER the
//      widest point instead of through the middle of it.
//   2. A ROUNDED UPPER BACK and a roll at the base of the neck, plus `stoop`
//      0.09 -> 0.19 in agents.js, which drops his chin into his collar. The top
//      of the light band stops being a square shelf and becomes a slump.
//   3. THE SHIRT TAIL IS OUT at the back, over the hips. It puts a light spur
//      down into the dark leg band, so the join between the two bands is ragged
//      instead of ruled. It lives in copSeat (on `hips`) and NOT in copTorso,
//      deliberately: parented to the chest it would swing up 100 mm every time
//      he stooped for breath, and a shirt tail does not do that.
//
// WHAT ONLY EXISTS AT PORTRAIT RANGE, and is still worth having:
//   the placket pulling open into three gaps with the vest showing through; a
//   stain on the gut he has not noticed; a salt ring dried into the cap serge;
//   a brim bent down AND sideways; bags under the eyes; broken capillaries; a
//   nose that has been red for years; a moustache that needs a trim; a real
//   HAIRLINE with bare temples instead of a dome under the cap; a sleeve hem
//   that bites the arm; unpolished shoes; seven belt segments burnished at the
//   wear points; and three fabrics that no longer match each other, because a
//   uniform is replaced a piece at a time.
//
// TWO MISTAKES WORTH THE PARAGRAPH, both found by rendering it and looking:
//   - THE BRIM PITCH IS SET AGAINST `stoop`, NOT IN ISOLATION. Bending it from
//     0.24 to 0.32 on a head that was ALSO tipped 6 degrees further forward put
//     it straight across his eye line and he had no face at all. It is 0.19
//     now, with a 3-degree roll, and the read is the same. The eyes are what
//     round 1 was fought over; do not spend them on a hat.
//   - TEXTURE DETAIL IS MAGNIFIED BY THE HEAD, NOT BY THE CELL. The face cell
//     is 128 px stretched over a skull that fills a 1280-wide portrait, so
//     1.4 px stubble dots at 0.30 alpha arrived as mud splashes and 0.9 px
//     capillaries at 0.42 arrived as two red slashes. Sub-pixel marks at a
//     fifth of that alpha. The same trap will catch the next person who adds
//     freckles, scars or a five o'clock shadow to anything in this file.
//
// LEDGER, and it is the reason to do it this way: 13 meshes, 3 materials, ONE
// 512 px atlas — all three unchanged. 7,032 -> 7,816 triangles (+11%). No new
// draw call and no new texture, because every part merges into a mesh that
// already existed and every colour is a vertex colour on it. The scuffs are one
// rewritten atlas cell (shared with the cap brim, which is correct: the same
// man neglected both).
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
// ROUND 3 (character) — A RING MAY NOW SHADE AROUND ITSELF. `r.c` was one
// colour for a whole ring, which can express a hem shadow or a contact shadow
// under a belly (both are horizontal) and cannot express ANY of the three
// things a garment does that the reference photographs are unanimous about: a
// shoulder seam, an armpit crease and a strap pressing into cloth. All three
// run the other way. So `r.c` may be a function of u — the fraction round the
// ring, 0 at the SPINE and 0.5 at the sternum, with the two arm-holes at 0.25
// (the -X side, which is the RIGHT arm) and 0.75.
//
// It is a vertex colour and therefore free: same vertex count, same triangle
// count, same draw call, same material. The alternative — a normal map, or
// geometry for a seam — costs a texture or a rebake per person, and at the
// distance this game is played neither would be visible where this is.
function loft(THREE, rings, seg = 16, uv) {
  const n = rings.length, W = seg + 1;
  const pos = new Float32Array(n * W * 3);
  const uvs = new Float32Array(n * W * 2);
  const col = new Float32Array(n * W * 3);
  const idx = [];
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const r = rings[i];
    const fn = typeof r.c === 'function' ? r.c : null;
    if (!fn) c.set(r.c == null ? 0xffffff : r.c);
    for (let j = 0; j <= seg; j++) {
      if (fn) c.set(fn(j / seg));
      // ROUND 11 — the ring STARTS AT THE BACK (+PI), which is a no-op on the
      // geometry (same closed ellipse, same winding, same start-vertex count)
      // and two things on the texture: u = 0.5 is now the middle of the CHEST,
      // so the tee print and the button placket in clothAtlas land on the front
      // of the person instead of between their shoulder blades; and the UV seam
      // and its shading discontinuity move round to the spine, where nobody is
      // looking. The cop's cell is a fabric weave, so this is invisible on him.
      const a = (j / seg) * Math.PI * 2 + Math.PI, k = i * W + j;
      // ...and `r.rf` is the same idea in the radial axis: a multiplier on this
      // ring's half-widths at this u. It exists for ONE thing — a strap presses
      // cloth in, and a dark line with no groove under it reads as a stripe
      // painted on a shirt rather than as something lying on top of it.
      const rf = r.rf ? r.rf(j / seg) : 1;
      pos[k * 3] = Math.sin(a) * r.rx * rf;
      pos[k * 3 + 1] = r.y;
      pos[k * 3 + 2] = Math.cos(a) * r.rz * rf + (r.cz || 0);
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
  // Deterministic scatter for the stubble and the capillaries. Math.random()
  // would have worked — the atlas is baked once at startup and never touches
  // the sim's seeded stream — but it would make two screenshots of the same
  // build differ, and screenshots are how this file is reviewed.
  let _s = 0x2f6f2b19;
  const rnd = () => (((_s = (_s * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216);
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

  // ROUND 7 — SCUFFED, NOT POLISHED. This cell used to be a clean radial
  // highlight, i.e. a shoe somebody had shined that morning. Now the highlight
  // is weak and broken, there are two vamp creases across it (a shoe creases
  // where the foot bends, always in the same place), and the toe has been
  // kicked pale. Shared with the cap brim on purpose — the same man neglected
  // both — and it is the cheapest wear in the file because it is one cell.
  cell('shoe', (g) => {
    g.fillStyle = '#a5a29d'; g.fillRect(0, 0, 128, 128);
    const gr = g.createRadialGradient(54, 40, 6, 64, 64, 86);
    gr.addColorStop(0, '#d9d6d0'); gr.addColorStop(0.30, '#b4b0aa'); gr.addColorStop(1, '#77746f');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    // vamp creases
    g.strokeStyle = 'rgba(40,36,32,0.34)'; g.lineWidth = 2.6;
    for (const [y0, y1] of [[54, 62], [70, 76]]) {
      g.beginPath(); g.moveTo(2, y0); g.quadraticCurveTo(64, y1 + 7, 126, y0 + 2); g.stroke();
    }
    // scuffs: pale where the leather has been taken off it
    g.fillStyle = 'rgba(226,222,214,0.42)';
    for (const [sx, sy, w, hh] of [[18, 92, 30, 7], [86, 100, 22, 5], [40, 22, 18, 5], [102, 58, 12, 9]]) {
      g.beginPath(); g.ellipse(sx, sy, w * 0.5, hh * 0.5, 0.3, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(30,27,24,0.30)';
    g.beginPath(); g.ellipse(64, 118, 46, 9, 0, 0, 7); g.fill();     // dirt at the welt
  });

  cell('grip', (g) => {                                   // checkered polymer
    g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#8e8e8e';
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
      if ((r + c) % 2) g.fillRect(c * 8, r * 8, 8, 8);
    }
  });

  cell('glove', (g) => { g.fillStyle = '#e8f2f6'; g.fillRect(0, 0, 128, 128); });

  // Face detail — stubble on the jaw, colour in the cheeks, and (round 7) the
  // broken capillaries. Applied to the skull and jaw balls; sphere UVs put
  // u=0.25 dead centre on the face and v runs from crown to chin, so the
  // stubble gradient lands on the jaw on its own.
  cell('face', (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    // Stubble: deeper than round 6's and it starts higher up the cheek, because
    // three days is a different face from five o'clock.
    const gr = g.createLinearGradient(0, 52, 0, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(104,88,78,0.30)');
    gr.addColorStop(1, 'rgba(84,70,62,0.58)');
    g.fillStyle = gr; g.fillRect(0, 52, 128, 76);
    // ...and it is not a smooth wash. Speckle, so it reads as hair rather than
    // as a tan. SIZE IS THE WHOLE PROBLEM HERE and the first cut got it wrong:
    // this cell is 128 px and it is stretched over a head that fills a
    // 1280-wide portrait, so a 1.4 px dot at 0.30 alpha arrives as a 12 px mud
    // splash. 0.8 px at 0.16, and starting at y=74 so it stays on the jaw
    // instead of climbing the cheekbones.
    g.fillStyle = 'rgba(74,62,54,0.16)';
    for (let i = 0; i < 560; i++) {
      const yy = 74 + Math.pow(rnd(), 0.8) * 52;
      g.fillRect(rnd() * 128, yy, 0.8, 0.8);
    }
    // Cheeks, ruddier than they were.
    g.fillStyle = 'rgba(206,104,80,0.26)';
    g.beginPath(); g.ellipse(20, 50, 13, 10, 0, 0, 7); g.fill();
    g.beginPath(); g.ellipse(44, 50, 13, 10, 0, 0, 7); g.fill();
    // BROKEN CAPILLARIES. Short forked threads over the cheeks — the thing that
    // separates a red face from a weathered one. Same magnification trap as the
    // stubble: at 0.9 px and 0.42 alpha these arrived as two red slashes beside
    // his nose. Hairline width, quarter alpha, and half the length.
    g.strokeStyle = 'rgba(172,74,62,0.20)'; g.lineWidth = 0.5;
    for (let i = 0; i < 34; i++) {
      const cx = (i % 2 ? 20 : 44) + (rnd() - 0.5) * 20;
      const cy = 50 + (rnd() - 0.5) * 15;
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + (rnd() - 0.5) * 4.5, cy + (rnd() - 0.5) * 4.5);
      g.lineTo(cx + (rnd() - 0.5) * 7, cy + (rnd() - 0.5) * 6);
      g.stroke();
    }
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
  const c = document.createElement('canvas'); c.width = 384; c.height = 256;
  const x = c.getContext('2d');
  const cell = (i, f) => { x.save(); x.translate((i % 3) * 128, ((i / 3) | 0) * 128);
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
  // ROUND 3 (character) — CELLS 4 AND 5 EXIST BECAUSE THIRTY PERCENT OF THIS
  // CROWD HAD NO MAP AT ALL. `plain: rnd() < 0.3` meant `map: null`, and a
  // MeshStandard surface with no map and one dye is the flattest thing this
  // renderer can draw: four of fourteen bodies were a solid colour with nothing
  // but the vertex ramps on it, and they are the four a critic keeps picking
  // out. The fix is NOT to give them a pattern — a plain shirt is a real thing
  // and half the people in the photographs are wearing one — it is to give them
  // a FABRIC. Both cells are within four points of white everywhere, so the dye
  // is unchanged at any distance and what arrives is grain.
  cell(4, (g) => {                                    // jersey / heather knit
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    // A deterministic slub. Math.random() here would give every reload a
    // different crowd and make two captures of "the same build" incomparable,
    // which is the sort of thing that costs a round to notice.
    let s = 0x2f6b1d;
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 1400; i++) {
      const v = 236 + ((rnd() * 20) | 0);
      g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
      g.fillRect((rnd() * 128) | 0, (rnd() * 128) | 0, 1 + ((rnd() * 2) | 0), 1);
    }
  });
  cell(5, (g) => {                                    // fine twill, 45 degrees
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(120,120,120,0.13)'; g.lineWidth = 1.6;
    for (let k = -128; k < 256; k += 7) {
      g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke();
    }
  });
  const out = [];
  const COLS = 3, ROWS = 2;
  for (let i = 0; i < COLS * ROWS; i++) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace ?? t.colorSpace;
    t.repeat.set(1 / COLS, 1 / ROWS);
    t.offset.set((i % COLS) / COLS, 1 - (((i / COLS) | 0) + 1) / ROWS);
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
// ROUND 11 (CHARACTER) — BODIES. WEIGHT, SIZE RANGE, BUILD.
// ===========================================================================
// Client: "I would love if we could spend a lot of time making the characters
// much, much more detailed — their movements, their characteristics, their
// facial features, the way they move, THEIR SIZES."
//
// Rounds 9 and 10 gave this crowd four builds, six hairstyles, an elbow and a
// hand. Photographed side by side with reference/people/*.jpg the failure is
// not detail, it is that EVERY ONE OF THEM IS THE SAME ANIMAL. Four builds that
// differ only by a width multiplier are one build at four sizes; nobody in a
// real supermarket is a scaled copy of anybody else in it.
//
// FIVE THINGS THE PHOTOGRAPHS HAVE THAT ROUND 10 DID NOT, in the order they
// cost the comparison:
//
//   1. A BELLY IS NOT AN OBJECT. Round 9 pasted `shopperBelly` — a sphere —
//      onto the front of the torso, and at any distance you can see the seam
//      ring where the two surfaces cross. It reads as a beach ball under a
//      shirt because that is exactly what it was. The cop round already solved
//      this and wrote down why: a body is ONE LOFTED SURFACE or it is a stack
//      of tyres. The shoppers were still a stack of tyres — six ellipsoids,
//      and you can count them in shots/bodies_r0_2.png.
//   2. NOBODY HAS SQUARE SHOULDERS. The old torso put a 0.072-tall disc across
//      the top at shoulderY, so every person in the store was a T. In the
//      reference photographs the trapezius slope from neck to acromion is 12
//      to 22 degrees on every single body, steeper on the heavy and the old.
//   3. SHOULDER-TO-HIP IS A FREE VARIABLE AND IT WAS NAILED SHUT. All four old
//      builds had sh/hp within 1.24-1.26 of each other. A pear — narrow
//      shoulders over a wide seat — is one of the commonest builds there is
//      and this game could not make one. It is now a build, and it is the only
//      new silhouette here that is unmistakable at 20 px.
//   4. THE ARMS WERE 70% TOO THICK. A 1.65 m person's upper arm is about 100 mm
//      across; round 10's deltoid ball was 172 mm. That single number is most
//      of why these bodies read as action figures rather than as people, and
//      it also destroyed the WAIST — an arm that fat covers the taper.
//   5. LEG LENGTH IS NOT A CONSTANT FRACTION OF STATURE. Every body in this
//      game had its hip at exactly 52.1% of its height. Real adults run 48.5%
//      to 55.5%, and it changes the whole read of a figure: at the same
//      stature, long legs and a short trunk is a different person, not a
//      differently-sized one.
//
// GEOMETRY IS STILL SHARED. Six torsos, twelve legs, three heads — baked once
// at startup, pointed at by twenty-one bodies (14 shoppers + 7 front-end
// staff). Everything else in the range is PER-INSTANCE: group scales, pivot
// offsets and rest angles, which cost nothing at all. See rollPerson.
//
// THE LEDGER, MEASURED BY WITHIN-RUN TOGGLE (one 1280x720 render of the aisle
// with all fourteen bodies in frame, crowd visible vs crowd hidden, same
// camera, same frame — see __BODY.budget in shots/_probe_bodies.js for why the
// obvious whole-frame instrument is NOT trustworthy here):
//
//                        round 10      round 11
//   crowd draw calls          165           159      -6
//   crowd triangles        42,624        44,896      +5.3%
//   meshes on 14 bodies       179           172      -7   (the belly sphere)
//   shared geometries          34            42      +8   (2 builds, 1 head,
//                                                          1 hair, 5 bag bakes)
//   materials                  90            88      -2
//
// So the round is triangle-positive and draw-call-negative, which is the trade
// this file wants: calls are paid on every one of the ten renders a frame does.
//
// AND THE SIMULATION IS BYTE-IDENTICAL. bench(n=200, difficulty=1) on both
// spawn modes, benchAnnounce(400) and benchBird(200) all return the same
// numbers to the digit before and after — catch 64% / 90%, LR(putback) 1.93,
// LR(bird | armed) 0.80, hot 0.78. ~20 new draws per person went into
// rollPerson and moved nothing, which is round 9's claim re-proved rather than
// re-asserted: rollPerson runs once, at construction, before the first
// setSeed().
//
// WHAT IS STILL WRONG, honestly, for whoever takes the next round:
//   - hands read as mittens at portrait range. The wedge is right and the
//     fingers are one box; at 3x that box is what you see.       [ROUND 3: done]
//   - a carried basket rides `hips`, so a body that folds its arms leaves the
//     basket hanging beside a leg that is not holding it. Parenting it to the
//     arm fixes the fold and breaks every clip that raises that arm.
//                                                                [ROUND 3: done]
//   - the garment has no shoulder seam, no armpit crease and no strap
//     deformation. The lead's note off the photographs is that clothing HANGS,
//     and this round only got as far as making it hang off the right shape.
//                                                                [ROUND 3: done]
//   - `plain` bodies (30%) have no cloth map at all and read as flat colour.
//                                                                [ROUND 3: done]
//
// Half-dimensions, model units, on a 1.65 m frame, garment included. Checked
// against published anthropometry as fractions of stature S:
//   biacromial 0.234 S   bideltoid 0.245 S (obese to 0.30)
//   chest breadth 0.174 S   chest depth 0.135 S (obese 0.20)
//   waist breadth 0.166 S (obese 0.26)   hip breadth 0.191 S (obese 0.24)
// Those ratios are the whole point of the table: they are what make `pear` and
// `heavy` different SHAPES rather than different SIZES.
//
// ---------------------------------------------------------------------------
// ROUND 12 — "SIX BUILDS DIFFER IN SHAPE, NOT SIZE" ONLY HALF HELD, AND THE
// CRITIC WHO CHECKED IT DID IT PROPERLY: pairwise shape distance came out 0.037
// for lean/slim and 0.051 for slim/reg — three shapes at six sizes, with the
// pear the only genuine outlier — and chest depth ratio (chD/ch) was PERFECTLY
// RANK-CORRELATED WITH SIZE, 0.722 / 0.729 / 0.743 / 0.761 / 0.779 / 0.803 in
// table order. A ratio that is monotone in size is a size, spelled differently.
//
// Two changes, and they are deliberately in different axes so each can be
// judged on its own:
//
//   SLIM IS NOW THE RANGY ONE. Broader across the shoulder than round 11's and
//   narrower everywhere below it (sh/hp 1.31 against lean's 1.25 and reg's
//   1.20), with the FLATTEST section of the six. That is a real common build —
//   the tall wiry one — and it was the entry sitting closest to two of its
//   neighbours.
//
//   DEPTH IS NO LONGER A FUNCTION OF WIDTH. `reg` becomes the deep-chested,
//   comparatively narrow one (chD/ch 0.80) and `stock` the broad flat slab
//   (0.71), which inverts them against size and breaks the rank correlation:
//   0.694 / 0.671 / 0.802 / 0.761 / 0.714 / 0.803. Depth is invisible to the
//   front-on width instrument this round is measured with — which is the point
//   of doing it in this axis: it cannot flatter the headline number.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ROUND 3 (CHARACTER) — THE THREE THINGS ON THAT LIST, AND THE ONE THE LEAD
// ADDED AFTER PLAYING IT.
// ---------------------------------------------------------------------------
// The addendum reordered the round and it was right to: "from the chase camera,
// behind the cop, three metres — the framing for the ENTIRE floor phase — his
// bare forearms are the worst thing on screen." A shopper's hands are seen at a
// checkout and when the player walks up on somebody. HIS are on screen every
// second of every dispatch, and he is the only body in this game with short
// sleeves, so he is the only one where bare arm is a large uninterrupted
// surface. shots/f3b_cop_arms.png is the before and it is two tubes.
//
// 1. THE CARRIED BASKET. It rode `hips`, so a folded-arm body left it standing
//    beside a leg (shots/f3b_fold.png). The round-11 note proposed parenting it
//    to the arm and said that breaks every clip that raises that arm; it does,
//    and shots/f3a_fold_unclamped.png is what that looks like. The answer is
//    that those are TWO constraints, not one: a basket hangs from a HAND, and it
//    hangs PLUMB. Position comes off the fist every frame, orientation comes off
//    the pelvis, and the arm is then free. See shopperBag's header and `carry`
//    in makePerson. The last piece is in agents.js, at the bottom of
//    animateShopper: a loaded arm does not fold, pocket or pump — which is why
//    a hand load is now always in the LEFT hand, the one no clip drives.
// 2. THE HANDS. One box became three finger masses at three lengths with a
//    shaded web and a stepped wrist, and the cop's forearm became six segments
//    with an elbow knob, a flexor swell, a real wrist and the shadow the sleeve
//    band casts on the arm under it. See shopperHand and copForearm.
// 3. THE GARMENT. `loft` learned to shade AROUND a ring and to dent one, which
//    is what a shoulder seam, an armpit crease and a strap all need and what one
//    colour per ring could never say. `plain` bodies stopped having no map at
//    all. See torsoRings.
//
// MEASURED, not asserted (probe: shots/_probe_fig_r3.js). The ledger is a
// WITHIN-RUN TOGGLE on a fixed camera with all fourteen bodies and the cop
// parked in a row — `__F3.lineup()` — because the aisle camera has four of the
// fourteen in frustum and the number moves when somebody walks. Both columns
// are a fresh page load; a dirty one measures whatever the last bench left
// parented, which is how the first draft of this table came out claiming a
// 28-call saving that was fourteen carts.
//
//                        HEAD        round 3
//   crowd draw calls        160          160     0
//   crowd triangles      44,748       48,060     +7.4%
//   cop draw calls           15           15     0
//   cop triangles         8,020        8,668     +8.1%
//   meshes on 14 bodies     174          174     0
//   geometries in use        45           46     +1  (one more strap variant)
//   materials                90           90     0
//   shared library      torso 6      torso 18    +12 lofts, and no body draws
//                                                more than one of them.
//
//   armpit shadow      0.710 of the cloth beside it at y = 0.395, all 6 builds
//   under a strap      0.573 at the same column; strap alone 0.807
//   strap groove       4.8 - 5.4 mm of dent, all three strapped builds
//   stance drift       crowd mean|skateFrac| 0.0080, cop 0.0004 — the numbers
//                      the walk round bought, unmoved; gaitCheck shod AND bare,
//                      plantCheck, copCheck, lungCheck, paceCheck, exitCheck all
//                      pass.
//
// THE TRIANGLES ARE THE WHOLE COST AND THEY ARE ALL IN THE ARMS. Two extra
// finger masses and their caps, six forearm segments where there were three:
// about 240 triangles per arm on thirty arms. No draw call, no mesh, no
// material, no texture — every one of them merges into a bake that already
// existed. Round 7's filter says detail that changes a SILHOUETTE pays at every
// distance, and the lead's note is why it is spent here rather than anywhere
// else: the cop's bare forearms are the largest continuous surface on screen
// for the whole floor phase, and they were two cones.
//
// AND THE AMBIGUITY IS UNMOVED, which is the only result that could have killed
// the round. Every likelihood ratio is identical to the digit — see the report.
// The one thing that moved is that a hand load is always left-handed; guilt is
// dealt out over the fourteen indices by code that has never seen a bag, so it
// cannot leak one. The roster itself is byte-identical: `sideRoll` is still
// drawn even though kinds 2 and 3 ignore it, so no downstream body re-rolled.
// ---------------------------------------------------------------------------
const BUILDS = [
  // k       sh     shD    ch     chD    wa     waD    hp     hpD
  //         be    beY    hem     th     hw     sw     nk     kyph   st    aw   head
  { k: 'lean',
    sh: 0.182, shD: 0.100, ch: 0.144, chD: 0.100, wa: 0.126, waD: 0.096,
    hp: 0.146, hpD: 0.116,
    be: 0.00, beY: 0.075, hem: -0.052, th: 0.082, hw: 0.070, sw: 0.128,
    nk: 0.078, kyph: 0.006, st: -0.010, aw: 0.90, head: 1 },
  { k: 'slim',
    sh: 0.199, shD: 0.102, ch: 0.152, chD: 0.102, wa: 0.134, waD: 0.100,
    hp: 0.152, hpD: 0.118,
    be: 0.10, beY: 0.070, hem: -0.058, th: 0.086, hw: 0.072, sw: 0.135,
    nk: 0.074, kyph: 0.008, st: 0.000, aw: 0.92, head: 1 },
  { k: 'reg',
    sh: 0.205, shD: 0.126, ch: 0.162, chD: 0.130, wa: 0.156, waD: 0.132,
    hp: 0.169, hpD: 0.138,
    be: 0.28, beY: 0.062, hem: -0.064, th: 0.099, hw: 0.078, sw: 0.144,
    nk: 0.060, kyph: 0.012, st: 0.018, aw: 1.00, head: 0 },
  // THE PEAR. Shoulders NARROWER than the hips (0.94:1 against reg's 1.19:1),
  // the mass low and wide, the belly apex down at the trouser line rather than
  // at the navel. This is the build the old table could not express at any
  // setting of its four multipliers, and it is the one that changes the
  // outline most: at monitor scale it is a triangle with the point up, and
  // every other body in this store is a rectangle or a triangle with the point
  // down.
  { k: 'pear',
    sh: 0.188, shD: 0.111, ch: 0.159, chD: 0.121, wa: 0.165, waD: 0.131,
    hp: 0.204, hpD: 0.152,
    be: 0.34, beY: 0.040, hem: -0.070, th: 0.118, hw: 0.086, sw: 0.128,
    nk: 0.058, kyph: 0.014, st: 0.022, aw: 1.02, head: 0 },
  { k: 'stock',
    // `ch` stays 0.190 and not the 0.196 the first cut of this tried: at 0.196
    // it is identical to `wa` and the trunk is a straight tube from the waist
    // to the armpit, which measured 1.000 arms-off — the one build that would
    // still have read as a skittle the moment a pose hid its arms.
    sh: 0.220, shD: 0.128, ch: 0.190, chD: 0.140, wa: 0.196, waD: 0.152,
    hp: 0.192, hpD: 0.152,
    be: 0.62, beY: 0.058, hem: -0.072, th: 0.114, hw: 0.086, sw: 0.155,
    nk: 0.048, kyph: 0.020, st: 0.030, aw: 1.08, head: 2 },
  { k: 'heavy',
    sh: 0.234, shD: 0.150, ch: 0.213, chD: 0.171, wa: 0.228, waD: 0.194,
    hp: 0.217, hpD: 0.176,
    // `sw` is 10 mm wider than the -16 mm the other five took, and it is the
    // one build where that is not a fudge: an obese trunk is 0.216 half-width
    // at mid-humerus, so an arm hung on the same offset as everybody else's
    // lands INSIDE it. 0.176 puts the arm 20 mm proud, which is the least of
    // the six and correct — a heavy person's arms really do disappear into
    // their sides from dead front.
    be: 1.00, beY: 0.046, hem: -0.084, th: 0.132, hw: 0.094, sw: 0.176,
    nk: 0.042, kyph: 0.028, st: 0.046, aw: 1.10, head: 2 },
];

// ---------------------------------------------------------------------------
// THE BODY PROFILE. Half-width, half-depth and forward offset at any height up
// the trunk, blended between four landmarks and then pushed out by the belly.
//
// THE BELLY IS PART OF THIS FUNCTION AND NOT A SEPARATE PART. That is the whole
// fix: it is a Gaussian bump added to the SAME surface, so there is no seam to
// see, and it pushes FORWARD (cz, and rz) about twice as hard as it pushes
// SIDEWAYS (rx) — which is what distinguishes a heavy man from a wide one and
// is the one thing round 9's sphere could not do at all.
//
// The apex is LOW (beY 0.04-0.075, i.e. at or below the navel) for the same
// reason the cop's is: a gut hangs, so the widest point of the profile is near
// the trouser line and the fabric above it is nearly vertical. An apex at the
// navel is a barrel.
const TRUNK = { hipY: -0.005, waistY: 0.150, chestY: 0.320, shY: 0.455 };
function trunkProfile(b, y) {
  const T = TRUNK, L = (a, c, t) => a + (c - a) * t;
  let rx, rz;
  if (y <= T.hipY) { rx = b.hp; rz = b.hpD; }
  else if (y <= T.waistY) {
    const t = (y - T.hipY) / (T.waistY - T.hipY);
    rx = L(b.hp, b.wa, t); rz = L(b.hpD, b.waD, t);
  } else if (y <= T.chestY) {
    const t = (y - T.waistY) / (T.chestY - T.waistY);
    rx = L(b.wa, b.ch, t); rz = L(b.waD, b.chD, t);
  } else {
    const t = Math.min(1, (y - T.chestY) / (T.shY - T.chestY));
    rx = L(b.ch, b.sh, t); rz = L(b.chD, b.shD, t);
  }
  const g = Math.exp(-Math.pow((y - b.beY) / 0.105, 2));
  // A ROUNDED UPPER BACK, above the armpit only. It is `cz` going NEGATIVE, so
  // the whole section slides backward while the shoulders stay put, which is
  // what kyphosis looks like from the side; plus a little depth, because a
  // rounded back is also a deeper one. On `old` bodies rollPerson stacks a
  // forward head on top of this and the pair of them is the entire read of age
  // at a distance where nobody can see a face.
  const k = Math.max(0, (y - 0.330)) * b.kyph * 7.4;
  return { rx: rx + b.be * 0.030 * g, rz: rz + b.be * 0.046 * g + k * 0.30,
           cz: b.be * 0.060 * g - k };
}

// The garment, as ONE closed surface from hem to collar. Fourteen rings at 16
// segments is 416 triangles, against the old six-ellipsoid stack's ~840: this
// is CHEAPER than what it replaces as well as being a body.
//
// Ring colours are vertex colours multiplying the shirt dye, and they are the
// cheapest lighting in the file — a dark ring inside the hem and one under the
// belly overhang put contact shadow exactly where the reference photographs
// have it, at zero cost, on a surface that has no other way to get it.
// ===========================================================================
// ROUND 3 (character) — THE GARMENT DOES NOT HANG. Round 11's own note, three
// rounds on a "not done" list: "no shoulder seam, no armpit crease and no
// strap deformation. The lead's note off the photographs is that clothing
// HANGS, and this round only got as far as making it hang off the right shape."
//
// All three run VERTICALLY and round 11's ring colour was one value for a
// whole ring, so none of them could be said at any price. `loft` now takes a
// function of u and a radial multiplier (see its header), and the three of them
// cost the same as the flat colour did: nothing, on the same vertices.
//
// WHAT IS IN THE PHOTOGRAPHS, in the order of how much each is worth at the
// distance this game is played:
//   THE ARMPIT is the deepest shadow on a clothed torso and it is not really a
//   crease — it is the one place on a trunk that never sees the ceiling. In
//   ppl_06 and ppl_07 it is the only thing separating a pale blue sleeve from
//   the pale blue shirt it is sewn to. Round 11 solved the same problem on the
//   arm with a 9% step-down under the deltoid and left the trunk side of the
//   join alone, so the shadow existed on one of the two surfaces that make it.
//   THE SHOULDER SEAM. A set-in sleeve is stitched in a line from the armpit up
//   over the acromion and it is the only feature a plain shirt has that says
//   where the sleeve begins. 20 mm wide on a real shirt, so it is a THIN mark;
//   made wide it reads as a stripe and the body looks like it is wearing a
//   raglan tracksuit, which is what the first cut of this did.
//   THE BREAK OVER THE BELLY. Cloth over an overhang is in tension above the
//   apex and slack below it — round 11 had the slack (the contact shadow under
//   the overhang) and not the tension.
//   THE STRAP. See `strap` below.
//
// THE MAGNITUDES ARE SMALL ON PURPOSE and the round-7 note about the cop's
// stubble is why: this multiplies a dye that is already being lit, on a surface
// that is 40 px tall in the frame the player spends most of his time in. The
// armpit is the only term over 20%, and it is the only one that is a shadow
// rather than a seam.
const gbump = (u, c, w) => Math.exp(-Math.pow((u - c) / w, 2));
// Both arm-holes at once. u = 0 is the SPINE and 0.5 the sternum, so 0.25 is
// the -X side (which carries the RIGHT arm — see makePerson) and 0.75 the +X.
const gholes = (u, w) => Math.max(gbump(u, 0.25, w), gbump(u, 0.75, w));
const gtint = (hex, f) => {
  const k = f < 0 ? 0 : f > 1 ? 1 : f;
  return (Math.round((hex >> 16 & 255) * k) << 16)
       | (Math.round((hex >> 8 & 255) * k) << 8)
       | Math.round((hex & 255) * k);
};

// `strap` is 0, +1 or -1: no strap, or one over the +X (left) or -X (right)
// shoulder. It is the only per-BAG variant of the trunk and it is why `torso`
// in the bakery is now [build][strap] rather than [build] — see buildFigureGeo
// for the ledger. It is chosen from `o.bag`, which is rolled by rollPerson, is
// ungated with respect to guilt, and is already the most visible thing on the
// person; a shirt that is dented under a strap that is drawn on top of it adds
// no information a player did not already have from the strap.
function torsoRings(b, strap) {
  const R = [];
  // Where the strap crosses this ring, as a u. A shoulder strap leaves the
  // acromion (u 0.25 or 0.75) and falls toward the sternum as it comes down the
  // chest — the same line a tote's and a crossbody's both take over the top of
  // the shoulder, which is the half that is on the TRUNK. Below the chest they
  // diverge and neither one is still touching cloth that this loft owns.
  const sU = (y) => {
    const acro = strap > 0 ? 0.75 : 0.25;
    const t = Math.max(0, Math.min(1, (0.455 - y) / 0.235));
    return acro + (strap > 0 ? -1 : 1) * t * 0.085;
  };
  const sAmt = (y) => (!strap ? 0
    : Math.max(0, Math.min(1, (y - 0.150) / 0.090)) * Math.max(0, Math.min(1, (0.500 - y) / 0.060)));
  const shade = (y, base) => (u) => {
    let f = 1;
    // THE ARMPIT WEDGE. Centred 55 mm below the acromion, dead by the nipple
    // line. It is the one term here big enough to see at monitor scale.
    const ap = Math.max(0, 1 - Math.abs(y - 0.398) / 0.120);
    f -= 0.26 * ap * ap * gholes(u, 0.080);
    // THE SEAM. Narrow (w 0.026 is about 22 mm on the finished body) and only
    // on the two rings either side of the acromion.
    const sm = Math.max(0, 1 - Math.abs(y - 0.452) / 0.080);
    f -= 0.15 * sm * gholes(u, 0.026);
    // THE BREAK OVER THE BELLY, front half only, above the apex.
    const bb = b.be * Math.max(0, 1 - Math.abs(y - (b.beY + 0.098)) / 0.052);
    f -= 0.085 * bb * gbump(u, 0.5, 0.17);
    // THE STRAP, and it is a shadow ON TOP of the cloth plus the groove below.
    const sa = sAmt(y);
    if (sa > 0) f -= 0.20 * sa * gbump(u, sU(y), 0.036);
    return gtint(base, f);
  };
  // The groove. 3.5% of a half-width is 5-7 mm of dent, which is what a loaded
  // strap actually does to a shirt; at 8% it reads as a wound.
  const dent = (y) => {
    const sa = sAmt(y);
    if (sa <= 0) return null;
    const c = sU(y);
    return (u) => 1 - 0.035 * sa * gbump(u, c, 0.042);
  };
  const add = (y, s, c) => R.push({ y, rx: s.rx, rz: s.rz, cz: s.cz,
    c: shade(y, c), rf: dent(y) });
  const hemW = Math.max(b.hp, b.wa) * 1.018 + b.be * 0.008;
  const hemD = Math.max(b.hpD, b.waD) * 1.022 + b.be * 0.010;
  const hemZ = b.be * 0.030;
  // The closing disc and the hem lip, at the same height. A doubled ring makes
  // an EDGE instead of a curve, which is what the bottom of an untucked shirt
  // is; and the flare (hem wider than the waist above it) is straight off the
  // photographs, where the hem is the widest part of the lower silhouette on
  // everybody who is not tucked in.
  R.push({ y: b.hem, rx: 0.008, rz: 0.008, cz: hemZ, c: 0x6f6f6f });
  R.push({ y: b.hem, rx: hemW, rz: hemD, cz: hemZ, c: 0x8e8e8e });
  R.push({ y: b.hem + 0.030, rx: hemW * 0.992, rz: hemD * 0.992, cz: hemZ * 0.94,
           c: 0xcbcbcb });
  const YS = [TRUNK.hipY, 0.045, 0.095, TRUNK.waistY, 0.235, TRUNK.chestY, 0.395];
  for (const y of YS) {
    // Shade the ring on the UNDERSIDE of the belly overhang, in proportion to
    // how much overhang there is. One ring only — the cop round learned that
    // two dark rings read as an apron hem rather than as a shadow.
    const under = y < b.beY && y > b.beY - 0.075 ? b.be : 0;
    add(y, trunkProfile(b, y), under > 0.3 ? 0xd0d0d0 : y < 0.10 ? 0xeaeaea : 0xffffff);
  }
  // ---- the shoulder, and it SLOPES ---------------------------------------
  // Acromion at 0.455, neck base at `collarY`. The width falls from `sh` to a
  // neck's worth over that gap, and how fast is the trapezius slope. `nk` is
  // how much neck the person has showing: on a heavy or an old body the collar
  // is HIGH and the head sits straight on the shoulders, and on a lean young
  // one there are 80 mm of throat between the two.
  const collarY = 0.545 - b.nk * 0.30;
  add(TRUNK.shY, trunkProfile(b, TRUNK.shY), 0xffffff);
  const p1 = trunkProfile(b, TRUNK.shY);
  const mid = (collarY - TRUNK.shY) * 0.55 + TRUNK.shY;
  // The two trapezius rings go through `shade` as well, and it is not
  // decoration: a set-in seam does not stop at the acromion, it runs a little
  // way ONTO the top of the shoulder, and a strap that stopped at 0.455 would
  // leave the loaded shoulder unmarked at exactly the height a strap sits.
  R.push({ y: mid, rx: p1.rx * 0.80, rz: p1.rz * 0.88, cz: p1.cz * 0.9,
           c: shade(mid, 0xfbfbfb), rf: dent(mid) });
  R.push({ y: collarY - 0.020, rx: p1.rx * 0.44, rz: p1.rz * 0.66, cz: p1.cz * 0.7,
           c: 0xf2f2f2 });
  R.push({ y: collarY, rx: 0.066, rz: 0.062, cz: p1.cz * 0.5, c: 0xdcdcdc });
  return R;
}

function shopperTorso(THREE, S, b, strap) {
  const P = partList(THREE, S);
  P.L.push({ g: loft(THREE, torsoRings(b, strap), 16), m: new THREE.Matrix4() });
  const collarY = 0.545 - b.nk * 0.30;
  // A collar band, and a shoulder-blade shelf at the back so the upper back is
  // not a smooth extruded tube. Both merge into the loft's mesh.
  P.tube(0.068, 0.030, [0, collarY + 0.006, 0.002], 0xd2d2d2, { seg: 12 });
  P.ball(b.sh * 0.62, 0.070, 0.038, [0, 0.400, -trunkProfile(b, 0.400).rz * 0.72],
    0xf0f0f0, { seg: 10, rseg: 5 });
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

// ---------------------------------------------------------------------------
// A FACE IS MOUNTED ON A BALL, AND THE BALL OWNS WHERE ITS SURFACE IS.
// ---------------------------------------------------------------------------
// ROUND 4 (character). A critic raycast the BAKED merged heads — not the source
// numbers — and found that two of the five things the paragraph below boasts
// about were inside the primitive they are mounted on. Re-measured here against
// all fourteen bodies with the HAIR counted as an occluder, which the first
// pass did not do and which makes it worse, every head kind read:
//
//   mouth        0.0% visible, buried 7.9 mm (round/long) to 16.3 mm (heavy)
//                across its whole 44 mm width. Never seen, by anyone, ever.
//   nose bridge  4.4% visible, 2.0 mm in
//   cheekbones   14.1% visible, 8.2 mm in
//   brow bar     29.3% visible and DEAD ACROSS ITS MIDDLE 66% — it rendered as
//                two tabs on a forehead, which is worse than nothing
//   eyes         41.5% visible: the INNER half of each eye is inside the skull,
//                so they read as two crescents, not two eyes
//
// Every one of those was authored as a plausible z next to a plausible radius,
// one line at a time, and every one of them went wrong the moment the radius
// beside it moved. `0.078` is not wrong; it is wrong *for a jaw of rz 0.093 at
// z 0.008*, and nothing in the file said so.
//
// So the z stops being authored. `onFace` SOLVES the mount surface and returns
// where to put the part. What a feature carries now is where it sits ON the
// face and how far proud it stands — two numbers that stay true when a radius
// moves — and `faceCheck()` re-derives every one of them at startup and fails
// loudly if a feature ever goes under again. This is CLAUDE.md's rule about one
// owner for a derivation, applied to a surface instead of to a constant.
const ELL = (c, r) => ({ c, r });
// Front (+Z) surface of E at (x, y). null if (x, y) is off it.
function surfZ(E, x, y) {
  const u = (x - E.c[0]) / E.r[0], v = (y - E.c[1]) / E.r[1];
  const k = 1 - u * u - v * v;
  return k <= 1e-6 ? null : E.c[2] + E.r[2] * Math.sqrt(k);
}
// Outward unit normal of E at the front surface point above (x, y).
function normOf(E, x, y) {
  const z = surfZ(E, x, y); if (z == null) return null;
  const n = [(x - E.c[0]) / (E.r[0] * E.r[0]),
    (y - E.c[1]) / (E.r[1] * E.r[1]),
    (z - E.c[2]) / (E.r[2] * E.r[2])];
  const L = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / L, n[1] / L, n[2] / L];
}
// Place a part so its local +Z pole stands `proud` metres off E at (x, y),
// AIMED along the surface normal there. Returns { p, r, n, z } for partList.
//
// THE AIM IS NOT DECORATION. A flat 132 mm bar laid across a 104 mm skull is
// 25 mm proud at its ends when it is flush in the middle — which is exactly how
// round 10's brow became a visor and round 11's became two tabs, one problem
// twice. A part sitting on the TANGENT plane is wrong only by the sagitta,
// w^2/2R, which is 5.6 mm across a 68 mm ridge, and an ellipsoid's ends taper
// into that error rather than standing on it.
//
// THREE's Euler XYZ gives R*(0,0,1) = (sinY, -sinX cosY, cosX cosY), so the aim
// inverts in closed form and nothing here needs a quaternion.
// Every feature placed by onFace, per head kind, so faceCheck() can fire a ray
// at each one instead of being handed a second copy of the coordinates. Filled
// by shopperHead as it bakes; read only by faceCheck.
const FACE_PROBES = [[], [], []];
let FACE_REC = null;
function onFace(E, x, y, hz, proud, tag, frx, fry) {
  const z = surfZ(E, x, y); if (z == null) return null;
  const n = normOf(E, x, y);
  const d = proud - hz;
  const ry = Math.asin(Math.max(-1, Math.min(1, n[0])));
  const rx = Math.atan2(-n[1], n[2] / (Math.cos(ry) || 1e-6));
  // THE POLE, not the mount point, is what faceCheck fires a ray through. The
  // part is aimed along the normal, so its front pole is displaced in y as well
  // as z — up to 2 mm on the mouth, where the jaw normal points down and
  // forward — and a check that shot at (x, y) and expected surfZ + proud read
  // 1.4 mm SHORT on four features that are in fact proud. That is a false
  // negative in the direction of the bug the check exists for, which is the
  // worst direction available, and it is the reason this is stored rather than
  // recomputed at the check.
  const pole = [x + n[0] * proud, y + n[1] * proud, z + n[2] * proud];
  // ROUND 5 (character) — AND ITS FOOTPRINT, because the check that reads this
  // now measures RELIEF as well as burial, and relief is "how far does this
  // stand off the surface AROUND it" — which needs to know where around it is.
  // Recorded from the call site, where the radii are already typed, rather than
  // guessed from a constant.
  if (FACE_REC && tag) FACE_REC.push({ tag, E, x, y, proud, pole, rx: frx || 0.02, ry: fry || 0.02 });
  return { p: [x + n[0] * d, y + n[1] * d, z + n[2] * d], r: [rx, ry, 0], n, z, proud, pole };
}

// THREE heads: round, long, and heavy. All three have a jaw, a nose, ears, a
// brow and eyes, because those five things are the entire difference between
// "a person seen from 7 m" and "a ball".
//
// ROUND 11 adds the third, and it is a BODY change rather than a face change,
// which is why it earns its place in a round about bodies: a heavy person has
// no visible neck, a jaw that is wider than their cheekbones, and a soft
// under-chin that fills the angle between chin and throat. From the front, at
// any distance, that is a different HEAD SHAPE — square and low instead of oval
// — and it is the only facial thing in this file that survives past about 3 m.
// The `nk` field of BUILDS does the other half: on a heavy body the collar ring
// is 50 mm higher, so the head sits straight down on the shoulders.
//
// k: 0 round, 1 long, 2 heavy.
function shopperHead(THREE, S, k) {
  const P = partList(THREE, S);
  const h = FIG.headY;
  const ln = k === 1 ? 1.00 : k === 2 ? 0.90 : 0.90;
  const wd = k === 1 ? 0.94 : k === 2 ? 1.08 : 1.03;
  const jw = k === 2 ? 1.10 : 1.0;                 // jaw relative to the skull
  // ---- THE TWO MOUNTS ------------------------------------------------------
  // Declared once. The skull ball, the jaw ball and every feature stuck to
  // either of them read these and nothing repeats their numbers, which is the
  // whole point: change `wd` and the eyes move with the cheekbones.
  const SKULL = ELL([0, h + 0.010, -0.004], [0.100 * wd, 0.108 * ln, 0.104]);
  const JAW = ELL([0, h - 0.058, 0.008], [0.089 * wd * jw, 0.070 * ln, 0.093 * jw]);
  FACE_REC = FACE_PROBES[k] = [];
  // A ball whose front pole stands `proud` off E at (x, y), aimed at the
  // normal. `rz` is its own depth, so the solve knows how far to set it back.
  const onBall = (E, x, y, proud, rx, ry, rz, c, o, tag) => {
    const m = onFace(E, x, y, rz, proud, tag, rx, ry);
    P.ball(rx, ry, rz, m.p, c, { seg: 8, rseg: 4, ...(o || {}), r: m.r });
    return m;
  };
  // The neck. On a heavy body it is 40% thicker and 30 mm shorter, which puts
  // the jaw almost on the collar.
  P.tube(k === 2 ? 0.058 : 0.042, k === 2 ? 0.076 : 0.10,
    [0, h - (k === 2 ? 0.140 : 0.155), -0.006], 0xe0e0e0, { seg: 8 });
  P.ball(SKULL.r[0], SKULL.r[1], SKULL.r[2], SKULL.c, 0xffffff, { seg: 10, rseg: 7 });
  P.ball(JAW.r[0], JAW.r[1], JAW.r[2], JAW.c, 0xfbfbfb, { seg: 10, rseg: 6 });                  // jaw
  P.ball(0.060 * jw, 0.036, 0.055, [0, h - 0.098, 0.014], 0xf4f4f4, { seg: 8, rseg: 5 });       // chin
  if (k === 2) {
    // Jowls and the soft under-chin. They change the OUTLINE — the jaw line
    // stops being a curve and becomes a shelf — but they must stay BEHIND and
    // BELOW the mouth or they read as a moustache and a beard, which is what
    // the first cut of this did at z +0.030.
    P.ball(0.034, 0.030, 0.032, [0.074, h - 0.092, 0.006], 0xf6f6f6, { seg: 6, rseg: 5 });
    P.ball(0.034, 0.030, 0.032, [-0.074, h - 0.092, 0.006], 0xf6f6f6, { seg: 6, rseg: 5 });
    P.ball(0.056, 0.028, 0.048, [0, h - 0.128, -0.008], 0xefefef, { seg: 8, rseg: 5 });
  }
  P.ball(0.028, 0.036, 0.020, [0.099 * wd, h - 0.006, -0.008], 0xf6f6f6, { seg: 6, rseg: 4 });  // ears
  P.ball(0.028, 0.036, 0.020, [-0.099 * wd, h - 0.006, -0.008], 0xf6f6f6, { seg: 6, rseg: 4 });
  // ---- EVERYTHING BELOW IS PLACED BY onFace, NOT BY A TYPED z --------------
  // The old numbers are kept in the comments, because the interesting thing
  // about each of them is not that it was wrong but by how little: the mouth
  // was 8 mm out, and 8 mm is the whole difference between a face and a ball.
  // These are MULTIPLIERS on a per-person skin colour that spans 0xf7d7b8 to
  // 0x62402c, so a shadow tone is not a shade, it is a fraction — and the first
  // cut had the socket at 0xcbb5a8 (0.79x), which on the two darkest bodies in
  // the roster rendered as a hollow rather than a shadow. 0.85x reads on the
  // lightest skin and stops short of a skull on the darkest.
  const EYE = 0x6a5c52, SOCK = 0xd8c6bb, LIP = 0xdca894, LIPDK = 0x9c7264;
  // Cheekbones. Were at z 0.052 — 8.2 mm inside the skull, 14% visible.
  for (const s of [1, -1]) {
    onBall(SKULL, s * 0.056 * wd, h + 0.002, 0.004, 0.028, 0.020, 0.016, 0xfcfcfc,
      null, s > 0 ? 'cheekL' : 'cheekR');
  }
  P.ball(0.021, 0.026, 0.026, [0, h - 0.012, 0.086], 0xffffff, { seg: 6, rseg: 5 });            // nose
  // Nostrils. New, and they are the cheapest mark on this face: two dots under
  // the tip that survive to about 30 px because they are VALUE, not shape.
  for (const s of [1, -1]) {
    P.ball(0.0075, 0.006, 0.008, [s * 0.014, h - 0.026, 0.094], 0xb08c7c, { seg: 6, rseg: 3 });
  }
  // Bridge. Was a box at z 0.078 — 2 mm in, 4.4% visible.
  {
    const m = onFace(SKULL, 0, h + 0.020, 0.015, 0.003, 'bridge', 0.010, 0.015);
    P.box(0.020, 0.030, 0.030, m.p, 0xfafafa, { r: m.r });
  }
  // ---- THE BROW, WHICH IS TWO RIDGES AND NOT A BAR ------------------------
  // Round 10's bar was 24 mm proud at the eyes' own z, so it read as a visor
  // and everybody scowled. Round 11 halved the projection and tucked it 8 mm
  // back, which put its middle two thirds INSIDE the skull — the same bar, now
  // rendering as two tabs. A bar was never the right primitive: a supraorbital
  // ridge is two arcs over two eyes with a dip at the glabella between them,
  // and two arcs placed on the surface cannot go under it whatever the skull
  // does next. 6 mm proud over the eye, tapering to flush at each end.
  for (const s of [1, -1]) {
    onBall(SKULL, s * 0.043, h + 0.046, 0.006, 0.036, 0.011, 0.012, 0xf4f4f4,
      { seg: 8, rseg: 4 }, s > 0 ? 'browL' : 'browR');
  }
  onBall(SKULL, 0, h + 0.041, 0.005, 0.013, 0.012, 0.010, 0xf6f6f6,
    { seg: 8, rseg: 4 }, 'glabella');
  // ---- THE EYES, AND THE SOCKET THAT IS WORTH MORE THAN THEY ARE ----------
  // At 3.2 m — the range at which this game prints GET OUT OF HIS FACE — the
  // head is 48 px and an eye is 4. Nothing at that size reads by its SHAPE; it
  // reads by its VALUE. So the eye gets a socket: a shadow-toned patch on the
  // surface, wider than the eye and reaching under it, with the eye standing
  // 3.5 mm proud of that. The socket is the mark you can see from across the
  // store and the eye is what it resolves into when you are close.
  for (const s of [1, -1]) {
    onBall(SKULL, s * 0.041, h + 0.024, 0.0015, 0.030, 0.017, 0.010, SOCK,
      { seg: 8, rseg: 4 }, s > 0 ? 'sockL' : 'sockR');
    onBall(SKULL, s * 0.040, h + 0.026, 0.005, 0.023, 0.012, 0.009, EYE,
      { seg: 8, rseg: 4 }, s > 0 ? 'eyeL' : 'eyeR');
  }
  // ---- THE MOUTH, WHICH DID NOT EXIST ------------------------------------
  // Was a 44x8x12 box at z 0.078 with the jaw's surface at 0.0993 — 7.9 mm
  // under it on the round head, 16.3 mm on the heavy one, 0.0% visible on all
  // fourteen bodies at every range. Three parts now, all solved off JAW: the
  // aperture (dark, and it is the part that reads), a lower lip that catches
  // light under it, and a thinner upper lip. 44 mm is 10 px at 3.2 m, which is
  // enough for one dark mark and not enough for two, so the aperture is the one
  // carrying the read and the lips are what it resolves into up close.
  // `proud` is against the IDEAL jaw and the bake is a 8x4 sphere, so the facet
  // chord eats about 0.6 mm of it — faceCheck read these four 1.1-1.6 mm short
  // at proud 0.0015-0.0035 and it was right to: a mouth that is analytically
  // 1.5 mm out and tessellated 0.9 mm in is a mouth you cannot see. The numbers
  // below carry the sag rather than pretending it away, and the check is left
  // measuring the DRAWN surface against the ideal pole so it keeps saying so.
  onBall(JAW, 0, h - 0.070, 0.0050, 0.023, 0.0045, 0.008, LIPDK, { seg: 8, rseg: 4 }, 'mouth');
  onBall(JAW, 0, h - 0.080, 0.0050, 0.019, 0.008, 0.008, LIP, { seg: 8, rseg: 4 }, 'lipLo');
  onBall(JAW, 0, h - 0.062, 0.0035, 0.020, 0.006, 0.007, LIP, { seg: 8, rseg: 4 }, 'lipUp');
  FACE_REC = null;
  return mergeParts(THREE, P.L);
}

// Six hairstyles. The critic's word was "blob hair"; a blob is what you get
// when a hemisphere is the only shape in the set.
function shopperHair(THREE, S, k) {
  const P = partList(THREE, S);
  const h = FIG.headY;
  // ---- ROUND 4 (character): THERE IS A HAIRLINE NOW ----------------------
  // The dome was centred at z -0.008 with rz 0.110 against a skull of rz 0.104
  // at z -0.004, so it stood 4-6 mm PROUD OF THE SKULL AT EYE HEIGHT: eight of
  // the nine styles came down over the brow and onto the eyes, and the raycast
  // said so — brow visibility fell 42% bare to 29% dressed and the eyes 55% to
  // 38% on the same bodies. Pulling the centre back 10 mm puts the hair BEHIND
  // the skull everywhere below y = h+0.070 and leaves it proud above, so the
  // crossover IS the hairline and there is 44 mm of forehead over the brow.
  // Costs nothing at the back — the dome ends 20 mm behind the skull instead of
  // 10, which is more hair volume, not less — and the top and sides are the
  // same numbers they were.
  const CAP_Z = -0.010;
  const cap = (ry, y, z) => P.ball(0.106, ry, 0.110, [0, y, z + CAP_Z], 0xffffff,
    { seg: 10, rseg: 6 });
  if (k === 0) {                                  // short back and sides
    cap(0.086, h + 0.028, -0.008);
    P.box(0.016, 0.040, 0.030, [0.093, h + 0.002, 0.000], 0xf0f0f0);
    P.box(0.016, 0.040, 0.030, [-0.093, h + 0.002, 0.000], 0xf0f0f0);
  } else if (k === 1) {                            // bob
    cap(0.098, h + 0.024, -0.008);
    P.ball(0.112, 0.078, 0.108, [0, h - 0.030, -0.020], 0xf6f6f6, { seg: 10, rseg: 6 });
  } else if (k === 2) {
    // LONG, AND IT COMES FORWARD OVER THE SHOULDER. Round 9's version hung
    // straight down the back, where it changed nothing you could see from the
    // front. In every reference photograph with long hair in it, the mass falls
    // in FRONT of the shoulder and ERASES THE SHOULDER LINE on that side — the
    // strongest single silhouette edit any hairstyle can make, because it
    // deletes a landmark instead of adding a bump.
    cap(0.098, h + 0.024, -0.008);
    P.ball(0.108, 0.120, 0.095, [0, h - 0.085, -0.030], 0xf4f4f4, { seg: 10, rseg: 6 });
    P.box(0.150, 0.130, 0.070, [0, h - 0.180, -0.048], 0xeaeaea);
    P.box(0.062, 0.185, 0.052, [0.082, h - 0.160, 0.026], 0xf2f2f2, { r: [0, 0, -0.06] });
    P.box(0.062, 0.185, 0.052, [-0.082, h - 0.160, 0.026], 0xf2f2f2, { r: [0, 0, 0.06] });
  } else if (k === 3) {                            // balding: a horseshoe only
    P.ball(0.106, 0.052, 0.110, [0, h - 0.012, -0.014], 0xffffff, { seg: 10, rseg: 5 });
    P.box(0.014, 0.034, 0.026, [0.094, h - 0.004, 0.000], 0xf0f0f0);
    P.box(0.014, 0.034, 0.026, [-0.094, h - 0.004, 0.000], 0xf0f0f0);
  } else if (k === 4) {                            // bun
    cap(0.090, h + 0.026, -0.008);
    P.ball(0.052, 0.048, 0.050, [0, h + 0.048, -0.098], 0xf6f6f6, { seg: 8, rseg: 6 });
  } else if (k === 5) {                            // beanie / ballcap wearer
    // ---- ROUND 4: IT WAS A BOWLER ----------------------------------------
    // A 150 mm half-disc pitched 0.24 rad and hung at y = h+0.036 — 10 mm ABOVE
    // THE EYE LINE — on a head 200 mm wide. Its leading edge swept down to
    // y = h+0.000 at z 0.176, i.e. straight across the face, and the raycast
    // over the four bodies that rolled this style read eyes 8.1% visible and
    // NOSE 56.6% against 88% on everybody else. In the plate it is a black disc
    // with a chin under it. This is the identical mistake the cop round found
    // on HIM and wrote up at length ("0.32 put the brim across his eye line and
    // he had no face at all"); the fix is his, one storey down. The brim goes
    // up to h+0.082 — above the brow ridge, not above the eye — the radius
    // comes in to 0.140, the pitch to 0.20, and it keeps the 3-degree roll that
    // stops a brim reading as new. Leading edge now at y = h+0.054, which is
    // clear of the brow by 8 mm.
    // ---- ROUND 5: IT WAS STILL A BOWLER, AND THE NEW faceCheck FOUND IT ----
    // Round 4 got the brim off the eyes and stopped there. What was left is a
    // 280 mm HALF-DISC — 40% wider than the head it is on, and as deep as it is
    // wide — pitched 0.20 with 13 mm of thickness hanging off its rim. Two
    // separate things wrong with that and both are silhouette:
    //
    //   IT IS TOO WIDE. A baseball cap's brim is about as wide as the skull and
    //   no wider (~200 mm on a 200 mm head). At 280 the outline is a disc with
    //   a person under it, which is a bowler; the round-7 filter says the
    //   OUTLINE is the whole game at 214 px, so this is the only number that
    //   really matters.
    //   IT IS A SEMICIRCLE. A brim is much wider than it is deep — 200 x 78,
    //   not 280 x 280 — and the shallow forward tongue is what says "cap" from
    //   any angle at any distance. `half` is a half-cylinder, so an ELLIPTICAL
    //   half costs nothing: the same primitive with x and z scaled apart, which
    //   P.half cannot express and P.add can.
    //
    // AND THE THIRTEEN MILLIMETRES OF THICKNESS WERE COVERING THE BROW RIDGE.
    // The rim sat at y = h+0.053 with its underside at h+0.040, and the brow's
    // own mount pole is at h+0.046 — 6 mm INSIDE the brim. This round's
    // faceCheck reported it on all three head kinds at 65-66 mm of occlusion
    // (`head N hair 5: browR`); the round-4 faceCheck read ok:true, because a
    // brim in front of a feature made its number POSITIVE. That is the whole
    // argument for rewriting the assertion, found by the assertion, on the
    // exact defect class round 4 said it was for.
    // The rim now sits at h+0.059 with its underside at h+0.054, clear of the
    // brow by 8 mm and of the eye by 30, and the check is green.
    cap(0.092, h + 0.032, -0.004);
    // The front panel. A cap crown is not a hair dome: it stands up and forward
    // over the forehead in a stiff panel, which is the second thing that says
    // cap rather than beanie, and it is 3 px of extra height at monitor scale.
    P.ball(0.072, 0.052, 0.052, [0, h + 0.062, 0.040], 0xfafafa, { seg: 8, rseg: 5 });
    P.add(S.half(14), [0.200, 0.010, 0.156], [0, h + 0.086, 0.030], 0xbdbdbd,
      { r: [0.30, 0, 0.05] });
  } else if (k === 6) {
    // ROUND 9 — PONYTAIL. Added for one reason and it is a CCTV reason: at
    // 214x120 a head is four pixels of dark on top of a light torso, and every
    // one of styles 0-5 leaves that dark blob CIRCULAR. A tail hanging off the
    // back of the skull is the only thing in this list that changes the outline
    // of the head itself from a distance, which makes it worth more than the
    // three portrait-range styles put together. Same rule the cop round found:
    // spend on the outline, not on the texture.
    cap(0.092, h + 0.026, -0.010);
    P.ball(0.044, 0.040, 0.044, [0, h + 0.010, -0.104], 0xf8f8f8, { seg: 8, rseg: 5 });
    P.taper(0.052, 0.030, 0.20, [0, h - 0.086, -0.124], 0xf2f2f2, { seg: 8, r: [0.30, 0, 0] });
  } else if (k === 8) {
    // ROUND 11 — SWEPT TO ONE SIDE, and it is here for asymmetry rather than
    // for hair. Every other style in this list is mirror-symmetric, so eight
    // out of nine heads in this store are the same shape reflected, and the
    // lead's note off the reference photographs was that NOT ONE PERSON in them
    // is symmetric. A parting on one side, more volume over it, and the mass
    // down one shoulder is the cheapest asymmetric silhouette in the file: it
    // survives at monitor scale because it makes the dark blob on top of the
    // body lopsided, which no round blob ever is.
    // (round 4: the same -10 mm the shared `cap` took, for the same reason —
    // this style rolls its own dome and would otherwise be the one person in
    // the store with no forehead.)
    P.ball(0.104, 0.088, 0.108, [0.008, h + 0.030, -0.018], 0xffffff, { seg: 10, rseg: 6 });
    // The volume over the parting. It sits BEHIND the hairline: the first cut
    // put it at z +0.016 with 74 mm of depth, which reaches z 0.090 — and the
    // nose is at 0.086. Every person who rolled this style had no face at all.
    P.ball(0.058, 0.050, 0.062, [0.046, h + 0.064, -0.022], 0xfafafa, { seg: 8, rseg: 5 });
    P.box(0.070, 0.165, 0.058, [-0.086, h - 0.140, 0.012], 0xf0f0f0, { r: [0, 0, 0.10] });
    P.ball(0.070, 0.086, 0.076, [-0.052, h - 0.056, -0.038], 0xf6f6f6, { seg: 8, rseg: 5 });
  } else {
    // ROUND 9 — TOPKNOT, and the same argument one storey up: it puts 60 mm on
    // the crown, so at monitor scale this person is simply TALLER than the
    // body next to them without the roster having to roll a taller person.
    cap(0.088, h + 0.024, -0.008);
    P.ball(0.046, 0.048, 0.046, [0, h + 0.104, -0.020], 0xf6f6f6, { seg: 8, rseg: 6 });
    P.tube(0.030, 0.026, [0, h + 0.074, -0.016], 0xeeeeee, { seg: 8 });
  }
  return mergeParts(THREE, P.L);
}

// ROUND 9 — A BAG, AND WHY IT IS DRAWN ON FORTY PERCENT OF THE CROWD.
//
// Two of the fifteen clips in decoy.js reach into luggage that did not exist:
// `concealBag` puts a bottle "into a tote at the off hip" and `wallet` digs one
// out of "a shoulder bag". Both were being played by people with nothing on
// them, so the best pair of matched clips in the file — a steal and a decoy
// that are the same move for a different reason — were both playing to an
// empty hip. Now some of these people are carrying something.
//
// THE ONE THING THIS MUST NOT BECOME IS A GATE. If only bag-wearers could roll
// `concealBag`, or bag-wearers rolled it more often, the bag is a tell and it
// is a tell that a player can read off a still frame at fifty metres. So:
// pickGesture is untouched, the pool is untouched, and a person with no bag
// plays the bag clips exactly as often as a person with one. The bag is a RED
// HERRING and it is supposed to be — it is one more reason for a hand to go
// down to the hip and come back up empty.
//
// It rides the `pants` material rather than earning its own, which is why it
// costs one mesh and no new material: bag geometry carries its own vertex
// colours, and vertex colour multiplies, so a tote comes out as a darker or
// lighter tone of the same trouser dye. At the distance this is read from, that
// is indistinguishable from a bag that matched by accident, which is also what
// most of them do.
// ROUND 11 — FOUR CARRIES, AND EACH ONE IS BAKED FOR BOTH SIDES.
//
// Two changes and both come off the reference photographs.
//
// FIRST, A BASKET. The lead's note: "carried objects change the silhouette more
// than the body does ... at 20 px a strap and a bag are more legible than any
// facial feature will ever be." A basket is the strongest of them, because it
// is the only one that changes the BODY as well as the outline — 6 kg on one
// side drops that shoulder, tips the pelvis and leans the trunk away, and that
// counter-lean is applied per-person in makePerson. It is the clearest "weight
// and balance" in this round: nothing else in this game has ever had a load in
// it.
//
// SECOND, SIDES. Every carry used to be baked on the +X side, so every person
// with a tote in this store wore it on the same shoulder. Both sides are baked
// now — eight geometries of about eighty triangles each, which is nothing — and
// rollPerson picks. A mirrored bake, not a negative scale: `scale.x = -1`
// inverts the winding and the front faces get culled.
//
// AND IT IS STILL UNGATED. Nothing anywhere asks whether a person is carrying
// something before letting them play a clip. `concealBag` is played by people
// with no bag at all, exactly as often. A basket is a reason for a hand to go
// down and come back up empty, which is the same reason a pocket is.
// ===========================================================================
// ROUND 3 (character) — WHERE A CARRIED THING HANGS FROM. ITEM ONE OF THREE,
// and it had been on the "still wrong" list for three rounds:
//
//   "a carried basket rides `hips`, so a body that folds its arms leaves the
//    basket hanging beside a leg that is not holding it. Parenting it to the
//    arm fixes the fold and breaks every clip that raises that arm."
//
// Both halves of that sentence are true, which is why nobody did it. Parented
// to `hips` the basket ignores the arm entirely; parented to the ARM it follows
// the arm through a reach (armR goes to -1.57 rad, horizontal) and arrives lying
// on its side in front of the chest with six kilos of shopping falling out of
// the top of it. The clips are not optional — a reach now genuinely removes a
// facing from a shelf — so "parent it to the arm" as written is a trade of one
// broken frame for another.
//
// WHAT IT ACTUALLY IS: a basket hangs from a HAND, and it hangs PLUMB. Those
// are two different constraints and the round-11 note only had the first one.
// So the carried object gets a group of its own on `chest` which takes its
// POSITION from the hand every frame and its ORIENTATION from the pelvis, and
// the arm may then do whatever the animator wants. Fold, reach, pump, surrender
// — the basket tracks the fist and stays level, because that is what a bucket
// of shopping does. See `carry` in makePerson for the four lines that do it and
// for why they live in this file rather than in agents.js.
//
// THE BRIEF ALLOWED THE OTHER ANSWER — "the body should not fold its arms while
// holding it" — and I did not take it, for a reason worth writing down: it is a
// GATE. It would mean a person's idle repertoire depends on what he is carrying,
// and this file's one standing rule is that nothing a person carries may change
// what he does. The pose pool is guilt-blind because it is not allowed to read
// anything; the moment it reads `bag.kind` it has learned to read something,
// and the next person to add a gate has a precedent to point at.
//
// KINDS 2 AND 3 ARE THEREFORE BAKED AROUND THE FIST rather than around the
// hips. `HAND` was the fingertip in chest-local coordinates and it stays the
// origin so nothing moves at rest: SH_ARM's fore segment at t = 0.986 is
// arm-local y = -0.655, which is chest-local -0.200 on a body whose armLen is
// 1.0, i.e. exactly where round 11 hung it. What changes is that it is now the
// SAME PERSON'S hand rather than an average person's.
function shopperBag(THREE, S, k, side) {
  const P = partList(THREE, S);
  const d = side < 0 ? -1 : 1;
  // Kinds 0 and 1 are strapped to the ribs and still live in chest-local space,
  // where the fingertip is y = -0.20. Kinds 2 and 3 are baked around the fist
  // and this constant is 0 for them — see the block below.
  const HAND = -0.200;
  if (k === 0) {
    // Tote on the shoulder, body hanging at the hip. The strap is the half of
    // it that reads: a diagonal across a light torso is a strong dark line.
    P.box(0.024, 0.310, 0.022, [d * 0.086, 0.290, 0.022], 0xbdbdbd, { r: [0, 0, d * 0.30] });
    P.box(0.024, 0.310, 0.022, [d * 0.150, 0.290, -0.050], 0xa8a8a8, { r: [0, 0, d * 0.30] });
    P.box(0.150, 0.230, 0.110, [d * 0.196, 0.020, -0.014], 0xffffff);
    P.box(0.156, 0.028, 0.116, [d * 0.196, 0.132, -0.014], 0xdadada);      // open mouth
  } else if (k === 1) {
    // Crossbody, small, high on the opposite hip. Half the outline change of a
    // tote and it survives being walked past.
    P.box(0.026, 0.320, 0.022, [d * -0.058, 0.310, 0.058], 0xb2b2b2, { r: [0, 0, d * 0.44] });
    P.box(0.026, 0.320, 0.022, [d * -0.106, 0.310, -0.070], 0x9e9e9e, { r: [0, 0, d * 0.44] });
    P.ball(0.086, 0.070, 0.052, [d * -0.150, 0.108, 0.030], 0xffffff, { seg: 8, rseg: 5 });
    P.box(0.150, 0.026, 0.070, [d * -0.150, 0.158, 0.032], 0xcfcfcf);
  } else if (k === 2) {
    // A carrier bag in the off hand. No strap, so it hangs BELOW the hem and
    // pushes the light/dark band boundary down on one side only — which is the
    // cheapest asymmetry in this whole file. It hangs from the fist now, and
    // the handles are the loop the fist is actually through.
    // ROUND 3 — origin is the FIST. x = 0 is the middle of the hand, so the
    // 205 mm the old bake carried in x is gone: it was the distance from the
    // spine to an average shoulder, and it was wrong on every body that was not
    // average. 22 mm outboard is the bag swinging clear of the thigh.
    const ox = d * 0.022, oz = 0.024;
    P.box(0.026, 0.062, 0.018, [ox - d * 0.029, -0.032, oz], 0xe0e0e0);
    P.box(0.026, 0.062, 0.018, [ox + d * 0.029, -0.032, oz], 0xe0e0e0);
    P.box(0.144, 0.190, 0.084, [ox, -0.156, oz], 0xffffff);
    P.box(0.150, 0.026, 0.090, [ox, -0.062, oz], 0xf4f4f4);
  } else {
    // THE BASKET. Long axis fore-and-aft, carried out and a little in front of
    // the thigh, which is where it has to go to clear a walking leg. A tapered
    // tub (baskets stack, so they are narrower at the bottom), a rim lip, the
    // grab handle folded up into the fist, and two blocks of shopping standing
    // proud of the rim — which is the part that reads, because a basket with
    // nothing in it is a bucket.
    // IN AGAINST THE THIGH, not held out in space. A basket rests on the leg —
    // that is most of why people carry them at all — and pushing it out to
    // clear the swing of a walking leg made it read as a box floating beside a
    // person. 40 mm in and 34 mm back, and the leg passes behind it.
    // ROUND 3 — same geometry, re-originned on the fist: every y below is what
    // it was minus HAND, and cx (which was "an average shoulder's distance from
    // the spine") collapses to 24 mm outboard of whichever hand is holding it.
    // The rim still lands 80 mm under the fingers and the leg still passes
    // behind it, because cz is the same 49 mm forward of the hand it always was.
    // `cy` lifts the whole tub 32 mm so the handle ends INSIDE THE FIST rather
    // than 49 mm below it: the anchor is the fingertip (see the header) and the
    // grip is up at the knuckles, which is a distinction that did not exist
    // while this thing was parented to a pelvis.
    const cx = d * 0.024, cz = 0.049, cy = 0.032;
    P.box(0.028, 0.070, 0.016, [cx, cy - 0.036, cz], 0xcacaca);               // handle
    P.box(0.150, 0.018, 0.028, [cx, cy - 0.070, cz], 0xd6d6d6);
    P.box(0.208, 0.150, 0.300, [cx, cy - 0.156, cz], 0xffffff);
    P.box(0.164, 0.030, 0.250, [cx, cy - 0.238, cz], 0xf0f0f0);               // tapered base
    P.box(0.224, 0.020, 0.316, [cx, cy - 0.080, cz], 0xe4e4e4);               // rim
    P.box(0.120, 0.090, 0.088, [cx - d * 0.024, cy - 0.052, cz + 0.070], 0xb8b8b8);
    P.box(0.130, 0.070, 0.100, [cx + d * 0.020, cy - 0.062, cz - 0.076], 0xdedede);
  }
  return mergeParts(THREE, P.L);
}

// ROUND 11 — A LEG WITH A TOP ON IT.
//
// The old one started at the hip pivot with a 94 mm radius and tapered
// immediately, so the two legs were two poles with daylight between them all
// the way up and there was NO PELVIS in this game: below the torso's hem
// ellipse you could see the floor between a person's thighs. Shots
// bodies_r0_0.png through _3.png, every body in all four.
//
// A thigh is widest 60-80 mm BELOW the crotch, not at the hip joint, and at
// that height the two of them touch. So the profile is: a narrower cap at the
// pivot, the maximum just under it, then the long taper to the knee. With
// `hw` (the hip pivots) at 82 mm for a regular build and `th` at 93, the two
// thighs overlap by 100 mm across the midline and the pair reads as one solid
// mass — which is what a pelvis is. The garment hem now hangs over the top of
// it, so the overlap is never seen as an intersection.
//
// The knee is a real landmark and it was a sphere at a guess: the patella sits
// FORWARD of the leg axis and the calf sits BEHIND it, and those two offsets
// are why a leg from the side is an S and not a stick.
function shopperLeg(THREE, S, b, side) {
  const P = partList(THREE, S);
  const t = b.th;
  // `taper(rTop, rBottom, ...)` — top first. Getting that order backwards on
  // the thigh made every leg in the store WIDEST AT THE KNEE and narrowest at
  // the crotch, which is precisely the shape that opens a gap between a
  // person's legs, and it is what the first render of this round showed.
  P.taper(t * 0.92, t * 1.00, 0.075, [side * 0.004, -0.036, 0.002], 0xffffff, { seg: 8 });
  P.taper(t * 1.00, t * 0.78, 0.34, [side * 0.006, -0.245, 0.001], 0xffffff, { seg: 8 });
  P.ball(t * 0.70, 0.058, t * 0.76, [0, -0.418, 0.010], 0xffffff, { seg: 8, rseg: 5 });
  P.taper(t * 0.76, t * 0.52, 0.30, [0, -0.570, -0.008], 0xffffff, { seg: 8 });
  P.ball(t * 0.54, 0.078, t * 0.46, [0, -0.535, -0.030], 0xffffff, { seg: 8, rseg: 5 }); // calf
  P.taper(t * 0.50, t * 0.58, 0.10, [0, -0.760, 0.002], 0xf0f0f0, { seg: 8 });   // cuff
  return mergeParts(THREE, P.L);
}

// Shoes were the critic's third missing noun. One geometry, its own material,
// so a shopper can be in trainers while the cop is in oxfords.
function shopperShoe(THREE, S, kind) {
  const P = partList(THREE, S);
  const y = -0.828;
  P.ball(0.048, 0.032, 0.088, [0, y + 0.006, 0.026], 0xffffff, { seg: 8, rseg: 5 });
  P.ball(0.044, 0.026, 0.062, [0, y + 0.002, 0.086], 0xf4f4f4, { seg: 8, rseg: 5 });
  P.box(0.096, 0.018, 0.228, [0, y - 0.022, 0.032], kind ? 0xd8d8d8 : 0x8a8a8a);
  P.box(0.088, 0.022, 0.062, [0, y - 0.011, -0.052], kind ? 0xe8e8e8 : 0x9a9a9a);
  if (kind) P.box(0.086, 0.012, 0.040, [0, y + 0.020, 0.020], 0xffffff);       // laces / stripe
  return mergeParts(THREE, P.L);
}

// ===========================================================================
// ROUND 10 — THE ELBOW. "ARMS ARE STILL RIGID BOXES AT PORTRAIT RANGE."
// ===========================================================================
// That was this file's own honest weakness list, and the blind critics said it
// first. It is right, and it is not about the hand: every arm in this game is a
// STRAIGHT STICK from shoulder to fingertip, because the rig has one pivot per
// arm and the clips author a single shoulder angle. Nobody's arm is straight.
//
// THE OBVIOUS FIX IS THE WRONG ONE. Add an elbow GROUP, drive it from
// agents.js, and the hand moves — a bent arm is a shorter arm — which breaks
// two things at once: the cart-bar pose is geometrically calibrated (the hands
// are ON the bar at P.cartD, and pulling them 150 mm back is a visible miss at
// portrait range), and animateShopper SOLVES the held item's position from
// `FIG.armLen` and the shoulder angles. Round 5 already shipped a floating box
// beside a man's ear once and this file spent a round arguing that you cannot
// make an ambiguity case out of a shot with a floating box in it.
//
// SO THE BEND IS BAKED, AND THE HAND DOES NOT MOVE. The elbow is placed OFF
// the shoulder-to-hand line — 98 mm off it, mostly behind and a little
// outboard — and both segments are re-aimed at it. Shoulder and fingertip end
// up exactly where the straight stick put them, so:
//   - FIG.armLen is still the truth and the prop solve is untouched;
//   - every clip in decoy.js is untouched, and none of them got louder;
//   - a bent arm needs no new group, no new mesh and no new draw call.
// It is also what a real arm does: shoulder and hand are given, and the elbow
// is the free parameter that swings off the line between them.
//
// WHICH WAY IT POINTS, AND WHY THAT IS FREE. The offset is authored in ARM-
// LOCAL space, so it rides the shoulder rotation the clip is driving. A hand
// on the cart bar (armR -0.95) carries the elbow down and back against the
// ribs, which is where a person's elbow is when they push a trolley. The same
// bake with the arm overhead (the bird, armR -2.44) carries it down and
// forward, which is where an elbow is when an arm is up. One number, correct
// at both ends of the range, because the range is a rotation of the same body.
//
// WHAT IT BUYS AT WHICH SCALE — the round-7 filter, applied honestly:
//   at 214x120 the arm's outline stops being a line off the shoulder and
//   becomes a shallow V, and the 98 mm offset is ~7 px on a body 120 px tall.
//   Small, but it is the outline and not a surface detail, so it survives.
//   At portrait range it is the difference between a mannequin and a person.
// The HAND rebuild below it is honestly the other kind — it is worth having and
// it only pays at 3x. Both are labelled as what they are.
// Tuned by rendering it at portrait range and looking, which is the only test
// available for a number like this. 0.090/0.026 was the first cut and it read
// as a broken arm: the elbow swung far enough out that the forearm left the
// body's outline entirely. 0.072 back is about 11% of the reach, which is what
// a relaxed arm actually does, and the outboard term is small because an elbow
// mostly goes BACKWARD.
const ELB_BACK = 0.072;    // metres the elbow sits BEHIND the shoulder-hand line
const ELB_OUT  = 0.016;    // ...and outboard of it
// ROUND 12 — AND ON A SHOPPER IT SITS INBOARD. See shopperSleeve: a relaxed arm
// hangs with the humerus vertical while the trunk narrows away underneath it, so
// the elbow ends up NEARER the midline than the acromion, not further out. The
// cop keeps the outboard value because his does not hang — it is braced out over
// a duty belt and a gut, which is the one body in the game where it is right.
const SH_ELB_OUT = -0.008;

// Aim a part along a segment. Returns the length, the Euler that maps the
// primitive's own -Y onto (b - a), and a point sampler.
//
// three.js composes order 'XYZ' as Rx*Ry*Rz, so with y = 0:
//   Rx(th) Rz(ph) (0,-1,0) = ( sin ph, -cos ph cos th, -cos ph sin th )
// which inverts to ph = asin(u), th = atan2(-w, -v). Derived rather than
// guessed, because a sign error here puts a forearm through a torso and the
// mistake is invisible in a wireframe.
function limbSeg(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  const u = dx / len, v = dy / len, w = dz / len;
  const ph = Math.asin(u < -1 ? -1 : u > 1 ? 1 : u);
  const th = Math.atan2(-w, -v);
  // The rotated local axes, so a thumb or a wristwatch can be placed on the
  // SIDE or the FRONT of a tilted forearm without anybody doing trigonometry at
  // the call site. Same composition as above:
  //   Rx(th) Rz(ph) (1,0,0) = ( cos ph,  sin ph cos th,  sin ph sin th )
  //   Rx(th) Rz(ph) (0,0,1) = ( 0,      -sin th,         cos th        )
  const cp = Math.cos(ph), sp = Math.sin(ph), ct = Math.cos(th), st = Math.sin(th);
  const AX = [cp, sp * ct, sp * st];
  const AZ = [0, -st, ct];
  return {
    len, r: [th, 0, ph],
    // point at fraction t along the segment...
    at: (t) => [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t],
    // ...and one pushed lx metres sideways and lz metres forward IN THE LIMB'S
    // OWN FRAME.
    pt: (t, lx, lz) => [
      a[0] + dx * t + lx * AX[0] + lz * AZ[0],
      a[1] + dy * t + lx * AX[1] + lz * AZ[1],
      a[2] + dz * t + lx * AX[2] + lz * AZ[2],
    ],
  };
}

// The two segments of an arm, given where the shoulder ball and the fingertip
// are. Everything that draws an arm in this file goes through this, so there is
// exactly one place the elbow lives — CLAUDE.md's rule, and the reason the cop
// and the shoppers cannot drift apart the way the HUD camera rig did.
// The elbow sits at 45% of the shoulder-to-fingertip reach, which is where an
// anatomical elbow is once you measure to the fingertip rather than to the
// wrist. `side` is +1 for the left arm and -1 for the right, matching every
// other builder in this file.
const ELB_F = 0.45;
// `out` is how far the elbow sits outboard of the shoulder-hand line IN METRES,
// and it is a parameter rather than a constant because the two bodies that use
// this disagree about its SIGN — see SH_ELB_OUT. Omit it and you get the cop's.
function armBones(side, shoulderY, tipX, tipY, tipZ, scale, out) {
  const k = scale == null ? 1 : scale;
  const eo = out == null ? ELB_OUT * k : out;
  const sh = [0, shoulderY, 0];
  const tip = [tipX, tipY, tipZ];
  const el = [
    tipX * ELB_F + side * eo,
    shoulderY + (tipY - shoulderY) * ELB_F,
    tipZ * ELB_F - ELB_BACK * k,
  ];
  return { sh, el, tip, upper: limbSeg(sh, el), fore: limbSeg(el, tip) };
}

// Where a shopper's arm starts and ends. The fingertip is the number the prop
// solve implicitly assumes, so it does NOT move: -0.660 is exactly where the
// old straight stick put it.
const SH_ARM = (side) => armBones(side, -0.020, side * 0.008, -0.660, 0.010, 1, SH_ELB_OUT);

// ===========================================================================
// ROUND 5 (character) — NO ARM IN THIS GAME HAD AN ELBOW.
// ===========================================================================
// Round 10 built the bones and then baked the bend. `armStruct` on a shopper, a
// cop and a child all read {groups: 0}: one rigid pivot, two meshes, no child
// joint. So SH_ARM's interior elbow angle — 154.241 degrees, i.e. 25.8 of flex
// — was the angle of EVERY arm in the building, in every frame, forever. Not
// walking, not reaching a shelf, not carrying a basket, not concealing.
//
// The reference photographs are unanimous against it. Everybody handling goods
// in reference/people is between 60 and 110 degrees: both women in ppl_09 hold
// cartons at sternum height around 70-90, ppl_06 about 95, ppl_00's cashier
// about 90, ppl_01's man with the bag about 90. The game had one value.
//
// WHICH FREE PARAMETER, AND WHY NOT THE OTHER ONE. There are two ways to hang a
// joint off this rig and only one of them survives contact with the clips.
//
//   (A) HAND ON THE AIM RAY, ELBOW SWINGS OFF IT — two-bone IK to a target that
//       stays on the shoulder-to-fingertip line and just comes closer. It is
//       the obvious reading of round 10's bake (the elbow IS the free parameter
//       there) and it is wrong past about 40 degrees of flex: the elbow has to
//       go somewhere, and at 90 degrees it is 229 mm off the line. Measured on
//       a hanging arm that puts the point of the elbow a fifth of a metre
//       BEHIND the body. Every basket carry in the store would be a chicken
//       wing.
//   (B) ELBOW FIXED, FOREARM SWINGS — the shoulder aims the humerus, the elbow
//       aims the forearm, which is what the joint does. The elbow stays exactly
//       where round 10's bake put it (so the deltoid, the sleeve hem and the
//       joint ball never move), and the hand leaves the ray. Chosen.
//
// (B) costs one thing and it is the thing the brief said to measure: the hand
// is no longer at `armLen` down the arm's own -Y, so agents.js's prop solve and
// its grasp query both move. They are handed the answer instead of deriving it
// — see `handRig` on the rig — which is CLAUDE.md's rule with the second half
// AGENTS_BRIEF added: both callers are asking the same question ("where is the
// right hand, in rig-local metres"), so one owner is legitimate here.
//
// THE AXIS IS THE ARM'S OWN PLANE NORMAL, not a canonical X. sh, el and tip are
// not coplanar with any axis — the elbow is 8 mm inboard and 72 mm behind — so
// unit(u x v) is 6 degrees off -X on the left arm and 12 on the right. Using -X
// would swing the forearm out of the plane the bake defines and the arm would
// twist as it bent. One cross product, computed once per side at module load.
//
// THE CHANNEL IS THE INTERIOR ANGLE, IN RADIANS, and it is exact: rotating v
// about unit(u x v) by phi takes the interior angle to ELB0 - phi, because the
// axis is by construction perpendicular to both bones. So an author writing
// `elb: 1.57` gets 90 degrees and a probe measuring the rendered geometry gets
// 90 degrees, with no calibration in between. ELB0 is the neutral and it is the
// bake, so a branch that never mentions the elbow renders byte-identically to
// the build before this one.
function elbFrom(B, side) {
  const u = [B.el[0] - B.sh[0], B.el[1] - B.sh[1], B.el[2] - B.sh[2]];
  const v = [B.tip[0] - B.el[0], B.tip[1] - B.el[1], B.tip[2] - B.el[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  const A = Math.hypot(u[0], u[1], u[2]), C = Math.hypot(v[0], v[1], v[2]);
  const D = Math.hypot(B.tip[0] - B.sh[0], B.tip[1] - B.sh[1], B.tip[2] - B.sh[2]);
  return {
    side, sh: B.sh, el: B.el, tip: B.tip, A, B: C, D,
    axis: [n[0] / nl, n[1] / nl, n[2] / nl],
    theta0: Math.acos(Math.max(-1, Math.min(1, (A * A + C * C - D * D) / (2 * A * C)))),
  };
}
// One table per body class, because the three bakes are three different pairs
// of bones — the cop's forearm is longer and a child's is 62% of a shopper's —
// and a shared constant would be the CLAUDE.md duplication bug with extra
// steps. All three come out at 154.2-154.4 degrees, which is the point: the
// number was never authored, it fell out of ELB_F and ELB_BACK.
const COP_ARM = (side) => armBones(side, -0.032, side * 0.010, -0.674, 0.016);
const KID_ARM = (side) => armBones(side, -0.008, side * 0.005, -0.414, 0.006, 0.62);
const ELB_SH = [1, -1].map((s) => elbFrom(SH_ARM(s), s));
const ELB_COP = [1, -1].map((s) => elbFrom(COP_ARM(s), s));
const ELB_KID = [1, -1].map((s) => elbFrom(KID_ARM(s), s));
// The neutral. 2.69166 rad = 154.241 degrees, and it is a MEASUREMENT of the
// round-10 bake rather than a number anybody typed.
export const ELB0 = ELB_SH[0].theta0;
// The reference band, so nobody has to look it up again: people handling goods
// in reference/people sit here, and the game shipped 2.692 for eleven rounds.
export const ELB_HANDLING = [60 * Math.PI / 180, 110 * Math.PI / 180];
// A real elbow does not straighten past about 178 and cannot close past about
// 35 with a forearm in the way. Clamped here rather than at fifteen call sites.
export const ELB_MIN = 0.62, ELB_MAX = ELB0;
// ---- THE CONTROL LEVER, AND IT IS A DEBUG HANDLE ---------------------------
// AGENTS_BRIEF: "ablate on ONE page load ... the strongest evidence came from
// changing a single dial on a byte-identical scene, never from comparing two
// builds." The elbow's control is the build without an elbow, so it is a switch
// rather than a checkout: with this on, every joint in the game is pinned at
// ELB0 and the rig renders exactly what shipped before this round.
//
// It is OFF and it must stay off. It is read once per setElbow call, it is not
// a TUNING constant, nothing in the game writes it, and any measurement taken
// with it on says so — see the probe. This is the R5-shadow-block hazard in
// CLAUDE.md and the mitigation is the same one `agents.override` uses: one
// obvious global, empty by default, stamped onto anything it touches.
let ELB_LOCKED = false;
export function elbLock(on) { ELB_LOCKED = !!on; return ELB_LOCKED; }
export function elbLocked() { return ELB_LOCKED; }
export const elbSolve = (side, kind) =>
  (kind === 'cop' ? ELB_COP : kind === 'kid' ? ELB_KID : ELB_SH)[side > 0 ? 0 : 1];
// Shoulder-ball-to-fingertip distance at interior angle `th`. This is the whole
// reason a bent arm is a shorter arm, and agents.js needs it because a grasp
// that reaches 640 mm with a straight arm reaches 466 at 90 degrees.
export function elbReach(side, th, kind) {
  const S = elbSolve(side, kind);
  return Math.sqrt(S.A * S.A + S.B * S.B - 2 * S.A * S.B * Math.cos(th));
}

// ---------------------------------------------------------------------------
// ONE BUILDER FOR EVERY ARM IN THIS GAME. Shopper, cop and child all come
// through here, so the joint cannot drift between them the way the HUD camera
// rig drifted from the floor camera.
//
//   piv (position, rotation — NO SCALE)
//     +- Mesh(upper half)  scale (sx, sy, sx)
//     +- elb (position = scaled elbow, quaternion = flex about the arm's own
//     |       plane normal)
//          +- Mesh(fore half)  scale (sx, sy, sx)
//
// WHY THE SCALE CAME OFF THE PIVOT. It was (armThick, armLen, armThick) —
// non-uniform, spanning 0.85..1.17 on this roster — and A ROTATED CHILD OF A
// NON-UNIFORMLY SCALED PARENT IS SHEARED. makePerson's carry override already
// carries that warning in prose; this is the same hazard, and the fix is that
// rotation nodes carry no scale and scale nodes carry no rotation. Composed the
// other way round the fore half's own scale is applied in the ROTATED frame,
// which is what an arm actually does: a forearm's length and thickness do not
// depend on where it is pointing.
//
// At flex 0 this renders the previous build byte for byte. `elb.position` is
// (sx,sy,sx) (*) el and the fore geometry was translated by -el before baking,
// so the composite is S (*) p — the same vertex, arrived at by two nodes
// instead of one.
function makeArm(THREE, layers, x, y, z, sx, sy, solve) {
  const piv = new THREE.Group();
  piv.position.set(x, y, z || 0);
  // ---- THE SHOULDER NODE, AND WHY THERE ARE THREE GROUPS AND NOT TWO -------
  // A clip authors `armR: -1.92` meaning "hand at the sternum". It has always
  // meant that, in eleven clips and seven idles, because the arm was a rigid
  // stick and the shoulder angle WAS the hand's bearing. Bend the elbow with
  // nothing else changing and that stops being true: the hand swings forward
  // and up off its own ray, and the first render of this round showed a
  // concealment with the man's fist against his cheek.
  //
  // So the shoulder gives way by exactly as much as the elbow took. The hand's
  // BEARING from the shoulder is preserved and only its DISTANCE shortens,
  // which is what "brings something in to the body" means and is what every
  // existing keyframe, prop offset and reach aim in this game was authored
  // against. The correction is the closed form of the two-bone triangle:
  //
  //     corr = atan2(b sin phi, a + b cos phi)
  //
  // and it is applied on its OWN node rather than by adding to piv.rotation.x.
  // That is not tidiness. Six branches in agents.js LERP toward the arm angle
  // (`lerp(r.armR.rotation.x, T, ed(5))`), so a correction added to the pivot
  // would be read back next frame, lerped, and added again — a fixed point at
  // T + corr/k, which for a 0.08 lerp is six radians. Measured on paper before
  // it was written, because it is the shape of bug this project keeps finding
  // after it has shipped. On its own node the correction is idempotent by
  // construction and the animator cannot see it at all.
  //
  // WHERE THE ELBOW ENDS UP: `corr` radians off the shoulder-to-hand line, on
  // the arm's own back side. On a raised arm that is DOWN — an elbow hanging
  // under a hand at the sternum, which is every photograph in reference/people
  // of somebody holding a carton. On a hanging arm it is BACK — an elbow at the
  // side, behind a hand carried forward at the hip, which is the basket carry.
  // One rule, correct at both ends, because the two are the same rotation.
  const shg = new THREE.Group();
  shg.position.set(solve.sh[0] * sx, solve.sh[1] * sy, solve.sh[2] * sx);
  piv.add(shg);
  const elb = new THREE.Group();
  elb.position.set(solve.el[0] * sx - shg.position.x,
    solve.el[1] * sy - shg.position.y, solve.el[2] * sx - shg.position.z);
  shg.add(elb);
  let hand = null;
  // Every mesh is offset by -shoulder, so at corr 0 the composite position is
  // exactly S (*) v — the previous build's bytes, arrived at through two more
  // nodes.
  const mx = -shg.position.x, my = -shg.position.y, mz = -shg.position.z;
  for (const L of layers) {
    if (L[0]) {
      const m = new THREE.Mesh(L[0], L[2]);
      m.scale.set(sx, sy, sx); m.position.set(mx, my, mz); shg.add(m);
    }
    if (L[1]) {
      const m = new THREE.Mesh(L[1], L[2]);
      m.scale.set(sx, sy, sx); elb.add(m); hand = m;
    }
  }
  // The forearm vector in the SCALED frame. Everything the joint does to the
  // hand is a rotation of this, and it is the only thing agents.js needs to
  // know to put a prop in a fist or point a grasp query at a shelf.
  const w = new THREE.Vector3((solve.tip[0] - solve.el[0]) * sx,
    (solve.tip[1] - solve.el[1]) * sy, (solve.tip[2] - solve.el[2]) * sx);
  const ax = new THREE.Vector3(solve.axis[0], solve.axis[1], solve.axis[2]);
  const tip0 = new THREE.Vector3(solve.tip[0] * sx, solve.tip[1] * sy, solve.tip[2] * sx);
  const d = new THREE.Vector3(), _t = new THREE.Vector3();
  const A = solve.A, B = solve.B;
  const arm = {
    piv, shg, elb, hand, th: solve.theta0, d, solve, corr: 0,
    // Set the interior elbow angle, in radians. Returns the angle actually
    // used, which is the CLAMPED one — an author who writes 0.2 gets ELB_MIN
    // and gets told so rather than getting a forearm through a bicep.
    set(th) {
      const raw = ELB_LOCKED ? solve.theta0 : th;
      const t = raw < ELB_MIN ? ELB_MIN : raw > ELB_MAX ? ELB_MAX : raw;
      if (t === arm.th) return t;
      arm.th = t;
      const phi = solve.theta0 - t;
      arm.corr = Math.atan2(B * Math.sin(phi), A + B * Math.cos(phi))
        - Math.atan2(B * Math.sin(0), A + B);
      elb.quaternion.setFromAxisAngle(ax, phi);
      shg.quaternion.setFromAxisAngle(ax, -arm.corr);
      // Where the fingertip ended up, as a displacement from where the straight
      // stick put it. One vector, recomputed only when the joint moves.
      _t.copy(w).applyQuaternion(elb.quaternion).add(elb.position)
        .applyQuaternion(shg.quaternion).add(shg.position);
      d.copy(_t).sub(tip0);
      return t;
    },
  };
  return arm;
}
// Where a hand actually is, in RIG-LOCAL metres — the one owner, called by
// agents.js's prop solve AND its grasp query, which are the same question.
// `AL` is the caller's own arm length (it carries a deliberate 60 mm fudge past
// the fingertip, plus K.grabOut on the grasp), so the straight-stick term is
// preserved EXACTLY and the joint contributes a pure displacement. At flex 0
// `d` is zero and this is the identical arithmetic agents.js had inline.
//
// It ignores `chest` rotation, which the inline version also did. That is a
// real approximation — a body leaning 0.16 rad moves its hand ~50 mm — and it
// is left in place deliberately: changing it in the same round as the elbow
// would put two effects in one measurement.
function handRigOf(arm, hipY, AL, out) {
  const piv = arm.piv;
  out.set(arm.d.x, arm.d.y - AL, arm.d.z).applyQuaternion(piv.quaternion);
  out.x += piv.position.x;
  out.y += hipY + piv.position.y;
  out.z += piv.position.z;
  return out;
}

// ROUND 11 — THE ARMS WERE 70% TOO THICK, AND IT WAS COSTING THE WAIST.
//
// A 1.65 m person's upper arm is about 100 mm across at the deltoid (arm
// circumference ~0.32 m) and 55 mm at the wrist. Round 10's deltoid ball was
// 172 mm across and its short sleeve 162 — a bodybuilder's arm on a shopper,
// which is most of why these bodies read as action figures. It also did real
// damage further down: an arm that wide, hanging at a waist 296 mm across,
// COVERS THE TAPER, so the one place a build is legible from the front was
// hidden behind two sausages on every body in the store.
//
// Every radius below is scaled to measured arm anthropometry and then handed a
// per-instance thickness multiplier (`aw` in BUILDS, `armThick` in rollPerson)
// so a heavy body still gets a heavy arm. The HAND is untouched by that
// scaling — see makePerson — because a hand is a hand.
//
// ===========================================================================
// ROUND 12 — ROUND 11 CUT THE FAT AND THE CAP WENT WITH IT. EVERY BODY IN THE
// STORE WAS A SKITTLE.
// ===========================================================================
// A critic measured all fourteen front-on, near-orthographic:
//
//     width(0.70 S) / width(0.80 S)  =  1.07 .. 1.31, median 1.11
//     a real adult                   ~= 0.75 trunk-only, ~0.90 arms included
//
// i.e. THE WIDEST PART OF EVERY PERSON IN THIS GAME WAS BELOW THEIR SHOULDER,
// and the shape narrowed continuously from the neck to the hem. It then ran the
// control that names the cause instead of guessing at it: hide `armL`/`armR`
// and four bodies read 0.81 / 0.87 / 0.89 / 0.93. The lofted trunk is right.
// The arms did it, with two numbers:
//
//   1. THERE WAS NO DELTOID. A 0.060 ball over an upper arm tapering
//      0.057 -> 0.050 is a 5% swell where a real shoulder is 30-40%, so the arm
//      was a straight pipe from acromion to elbow. The lateral-most point of a
//      real arm is the deltoid, and every millimetre BELOW it the arm is
//      narrower — that taper is what makes a person read widest at the
//      shoulders even though their arms hang outside their ribs.
//   2. SPLAY THREW THE ELBOW OUT WHERE THE TRUNK WAS COMING IN. 0.052-0.187 rad
//      moves the elbow 15-54 mm outboard at exactly the height the waist is
//      narrowing, so the arm filled in the one taper a build is legible by.
//
// THE FIX IS NOT A FATTER ARM — round 11 was right about the 172 mm bodybuilder
// and none of it comes back. It is the SAME MASS MOVED UP: the deltoid goes
// 0.060 -> 0.076 half-width and the mid-humerus 0.054 -> 0.050, so the swell is
// 52% instead of 5%; `sw` in BUILDS comes inboard by the same 16 mm the deltoid
// gained, so no shoulder in the store got any wider; splay drops to 0.004-0.046
// rad; and SH_ELB_OUT hangs the elbow 8 mm INBOARD of the shoulder-hand line
// instead of 16 mm outboard. Four numbers, no new geometry, no new part.
//
// WHAT IT BUYS, and it is not cosmetic: the pear build's ONLY discriminating
// landmark is a narrow shoulder over a wide seat, and with the widest point of
// the body at the elbow that landmark was not on the screen at any distance.
// The best new silhouette of round 11 was invisible for a whole round.
// ROUND 5 (character) — EVERY ARM BAKE NOW COMES IN TWO HALVES, and which side
// of the joint a part is on is stated by the author rather than guessed from a
// coordinate. `half` is 0 for the humerus (arm-local, unchanged bytes) and 1
// for the forearm (translated so the elbow is the origin, because it is about
// to be rotated around it). A half with nothing in it returns null and costs no
// mesh. THE JOINT BALL STAYS ON THE UPPER HALF: it is centred on the axis, so
// it fills the corner at every angle, and a ball that rotated with the forearm
// would open a crescent of daylight at the back of the elbow.
function halfOut(THREE, P, half, el) {
  if (!P.L.length) return null;
  const g = mergeParts(THREE, P.L);
  if (half) g.translate(-el[0], -el[1], -el[2]);
  return g;
}
function shopperSleeve(THREE, S, long, side, half) {
  const P = partList(THREE, S);
  const B = SH_ARM(side), U = B.upper, F = B.fore;
  // THE DELTOID, and it is a CAP rather than a bulge on a tube: wider than the
  // arm below it and centred within 10 mm of the shoulder pivot, which is
  // 0.80 S on the finished body — where bideltoid is measured. Its equator is
  // therefore the widest point of the whole figure, which is the entire claim
  // this round is making. Half-widths, so 152 mm across the shoulder cap
  // against a 100 mm upper arm: the 1.5:1 a photograph has.
  //
  // AND THE ARM IS SHADED AGAINST THE TRUNK, which is not decoration — it is
  // the other half of the fix. Once the arm hangs where it belongs it is
  // touching the torso, drawn from the same bolt of cloth in the same dye on a
  // material that has no shoulder seam, and the first render of the correct
  // geometry showed a heavy man with a deltoid cap, a hand at his hip, and
  // nothing between them. He had arms. You could not see them. So the deltoid
  // keeps the white (it is the top-lit surface and it is what defines the
  // shoulder), and everything below it steps down ~9% per element — which is
  // what an arm hanging in its own trunk's shadow does, and is the same
  // vertex-colour trick the torso rings use for the contact shadow under a
  // belly, at the same price, which is nothing.
  if (!half) P.ball(0.076, 0.078, 0.068, [0, -0.010, 0], 0xffffff, { seg: 8, rseg: 6 });
  if (long) {
    if (!half) {
      P.taper(0.054, 0.043, U.len * 0.98, U.at(0.51), 0xe8e8e8, { seg: 8, r: U.r });
      // THE ELBOW ITSELF. A ball at the joint is what makes a bend read as an
      // elbow rather than as a kink in a pipe — the two tapers meet at an angle
      // and without something round in the corner you can see the seam from
      // across the store. It must not be BIGGER than either segment or it is a
      // knuckle: 0.058 against a 0.062 sleeve is a crease, 0.072 was a knot.
      // ROUND 5 — and it is now doing that job for real, over a joint that
      // moves through 94 degrees, instead of over a corner that never opened.
      P.ball(0.042, 0.044, 0.042, B.el, 0xe2e2e2, { seg: 8, rseg: 5 });
    } else {
      P.taper(0.041, 0.030, F.len * 0.62, F.at(0.32), 0xeeeeee, { seg: 8, r: F.r });
      P.tube(0.031, 0.030, F.at(0.64), 0xd4d4d4, { seg: 8, r: F.r });   // cuff
    }
  } else if (!half) {
    // The short sleeve stops at 60% of the upper arm, so its bottom radius is
    // NOT the elbow's — it is the mid-humerus, and 0.049 there is the number
    // the ratio above is actually made of. The rolled hem is 2 mm proud of the
    // cloth it terminates, as a hem is.
    P.taper(0.054, 0.049, U.len * 0.56, U.at(0.32), 0xe8e8e8, { seg: 8, r: U.r });
    P.tube(0.051, 0.022, U.at(0.62), 0xd6d6d6, { seg: 8, r: U.r });   // rolled hem
  }
  return halfOut(THREE, P, half, B.el);
}

// ROUND 10 — AND THE HAND IS NOT A BOX ANY MORE.
//
// This is the OTHER kind of detail and it is labelled honestly: a hand is 55 mm
// across on a 1.75 m body, so at 214 px it is a third of a pixel and none of
// what follows can possibly read there. It is for the spot monitor at 3x and
// for the portrait the client is looking at when he says "the shoppers need
// more detail" — the same argument round 7 made for the capillaries on the
// cop's nose, and the same rule: it must not cost a draw call or a material,
// and it does not, because it is more parts inside a mesh that already merged.
//
// A 52 x 78 x 44 mm box is what a hand looks like to a programmer. What a hand
// looks like is a wedge: wide and thick across the knuckles, narrowing and
// THINNING to the fingertips, with the fingers curled a few degrees so the tips
// come forward of the knuckle line, and a thumb that stands off the side rather
// than being buried in the palm. Five rounded parts instead of one box, and the
// silhouette gains the two things a box cannot have — a taper and a corner
// radius.
// `uv` is the atlas cell, for the cop — his materials run off one 512 texture,
// and a part with native 0..1 UVs on it would sample all sixteen cells at once.
// Shoppers pass nothing and get the default.
// ===========================================================================
// ROUND 3 (character) — "HANDS READ AS MITTENS AT PORTRAIT RANGE", and the
// lead's addendum, which reorders the whole item: THE COP'S HANDS ARE ON SCREEN
// PERMANENTLY. The chase camera sits three metres behind him for the entire
// floor phase; his bare forearms and hands occupy more pixels than any shopper
// in this game ever will, and shots/_lead_floor_2.png is two smooth tubes
// ending in two mittens.
//
// WHAT MADE IT A MITTEN: one box. Round 10 argued a box was the right primitive
// at 55 mm and it was right about a shopper across an aisle and wrong about the
// only body the player looks at all day. A box has no slots, and slots are the
// entire read of a hand — the outline of a relaxed hand is not a rounded
// rectangle, it is a stepped edge, because the four fingers are four different
// lengths and the two outer ones curl further than the two inner ones.
//
// THREE MASSES INSTEAD OF ONE, at three lengths: index, middle, and ring+little
// merged (two fingers that touch, and at this size they are one form). That
// buys two notches in the tip line and two slots down the side of the hand for
// 48 triangles. The old single tip ball is now three, each at its own t.
//
// AND IT IS SHADED, which is the other half and is free. Every part in here was
// one flat colour, so a hand had no interior at all — the slots between the
// fingers were geometry that could not be seen because both sides of every slot
// were the same value. Same trick, same price as shopperSleeve's step-down and
// the torso's contact ring: the dorsal surfaces keep the tint, the palm heel
// and the two outboard fingers step down, and the web under the thumb is the
// darkest thing on the hand because it is the only part of it that is a hole.
function shopperHand(P, F, side, tint, k, uv) {
  const c = tint || 0xffffff;
  const s = k || 1;
  const X = uv ? { uv } : null;
  const D = (f) => gtint(c, f);
  // The wrist. NARROWER than it was (a wrist is the thinnest part of the whole
  // arm and this one was the same width as the hand behind it) and stepped
  // down, so there is a visible waist between forearm and hand.
  P.ball(0.027 * s, 0.030 * s, 0.026 * s, F.at(0.575), D(0.90), { seg: 6, rseg: 5, ...X });
  // The heel of the hand: WIDE and FLAT. A hand is an ellipse in section, not a
  // circle, which is the single thing a tapered tube can never be and is most of
  // why the old box was reached for in the first place.
  P.ball(0.029 * s, 0.044 * s, 0.040 * s, F.pt(0.716, 0, 0.004), D(0.96), { seg: 8, rseg: 6, r: F.r, ...X });
  // ---- the fingers, three masses at three lengths -------------------------
  // `lx` is across the hand in the limb's own frame, negative toward the thumb.
  // Curl grows outboard: an open hand at rest has the little finger bent more
  // than the index, which is what stops the tip line being a straight edge.
  // `w` is a FULL width (P.box takes sizes) and `lx` is the centre offset, so
  // the three of them span -0.0198..+0.0250 — 45 mm across, against the single
  // box's 43. The hand did not get bigger; it got slots.
  // THE CAP GOES WHERE THE BOX ACTUALLY ENDS. The first cut of this put it at a
  // hand-typed `t` and made it 26 mm tall, and the render showed three fingers
  // with three eggs floating off the ends of them — the cap has to be solved
  // from the box's own length and curl or it is a separate object, and it has
  // to be FLAT along the finger or it is a knuckle on the end of one. `s` is in
  // here twice on purpose: the cop's hand is 1.22x on a forearm that is not, so
  // the half-length in metres is what converts to a limb fraction, not the
  // authored number.
  const fing = (lx, w, len, curl, t0, v) => {
    const rr = [F.r[0] + curl, F.r[1], F.r[2]];
    P.box(w * s, len * s, 0.026 * s, F.pt(t0, side * lx, 0.010), D(v), { r: rr, ...X });
    const hz = len * 0.5 * s;
    P.ball(w * 0.5 * s, 0.0065 * s, 0.012 * s,
      F.pt(t0 + hz * Math.cos(curl) / F.len, side * lx, 0.010 + hz * Math.sin(curl)),
      D(v * 0.97), { seg: 5, rseg: 3, r: rr, ...X });
  };
  fing(-0.0135, 0.0125, 0.070, 0.16, 0.848, 1.00);   // index
  fing(0.0000, 0.0125, 0.076, 0.19, 0.852, 0.97);    // middle
  fing(0.0160, 0.0180, 0.066, 0.25, 0.842, 0.91);    // ring + little
  // The thumb stands off the side of the hand and points along it, so it is a
  // notch in the outline rather than a bump on the palm. The WEB under it is
  // the darkest value on the hand — it is a hole, not a surface.
  P.ball(0.011 * s, 0.017 * s, 0.014 * s, F.pt(0.762, side * -0.023, 0.006), D(0.80),
    { seg: 6, rseg: 4, r: F.r, ...X });
  P.tube(0.0115 * s, 0.042 * s, F.pt(0.790, side * -0.030, 0.012), D(1.00),
    { seg: 6, r: [F.r[0] + 0.10, F.r[1], F.r[2] + side * 0.22], ...X });
  P.ball(0.013 * s, 0.014 * s, 0.013 * s, F.pt(0.856, side * -0.036, 0.016), D(0.98),
    { seg: 6, rseg: 4, ...X });
  return P;
}

function shopperForearm(THREE, S, long, side, half) {
  const P = partList(THREE, S);
  const B = SH_ARM(side), U = B.upper, F = B.fore;
  if (!long && !half) {
    // THE BARE ARM STARTS ABOVE THE HEM, NOT AT THE ELBOW, and getting that
    // wrong is what the first render of this showed: the sleeve stopped at 62%
    // of the upper arm and the skin started at the elbow, so a third of every
    // short-sleeved arm in the store was a hole with the shelving showing
    // through it. The two meshes have to OVERLAP; they are separate objects and
    // there is nothing to fill a gap between them.
    // ROUND 12 — and it has to stay UNDER the sleeve through the overlap, not
    // just inside its own outline: the sleeve is 0.0505 at t=0.48 where this
    // starts and 0.0490 at t=0.60 where it ends, so 0.047 -> 0.044 clears it by
    // 3 mm the whole way and the bare arm cannot poke through the cloth.
    // Same step-down as the sleeve, one notch lighter: bare skin below a short
    // sleeve is further from the trunk than the cloth above it was and catches
    // more of the room. See the shading note in shopperSleeve.
    // ROUND 3 (character) — THE SAME SIX SEGMENTS THE COP GOT, at a shopper's
    // scale, and for the same reason: three parts at one value is a cone, and
    // 55% of this crowd is short-sleeved. The clearances the round-12 note
    // above is protecting are unchanged — the two segments that run under the
    // cloth are 0.0455 and 0.0448 against a sleeve that is 0.0505 at t=0.48 and
    // 0.0490 at t=0.60, so the overlap still clears by 3 mm the whole way.
    P.taper(0.0455, 0.0448, U.len * 0.24, U.at(0.640), 0xd9d9d9, { seg: 8, r: U.r });
    P.taper(0.0448, 0.0458, U.len * 0.20, U.at(0.880), 0xe6e6e6, { seg: 8, r: U.r });
    P.ball(0.0458, 0.0436, 0.0472, B.el, 0xdedede, { seg: 8, rseg: 5 });
  }
  if (!long && half) {
    P.taper(0.0455, 0.0372, F.len * 0.30, F.at(0.160), 0xf4f4f4, { seg: 8, r: F.r });
    P.taper(0.0368, 0.0296, F.len * 0.25, F.at(0.430), 0xf4f4f4, { seg: 8, r: F.r });
    P.taper(0.0292, 0.0248, F.len * 0.11, F.at(0.605), 0xdcdcdc, { seg: 8, r: F.r });
  }
  if (half) shopperHand(P, F, side, 0xffffff);
  return halfOut(THREE, P, half, B.el);
}

// ROUND 9 — THE SAME HAND WITH ONE FINGER OUT, AND IT COSTS NO DRAW CALL.
//
// The client asked for a customer who flips the bird at the security camera.
// These hands have no fingers — the whole hand is one 52x78x44 mm box, which is
// correct at the size a shopper is ever seen — so the gesture cannot be posed.
// It can be BAKED, and then swapped in: agents.js assigns this geometry onto the
// mesh that is already there while the raised-arm beat is running and assigns
// the normal one back afterwards. A geometry swap on an existing mesh is not a
// new mesh, not a new material and not a new draw call; the cost of the whole
// feature is two extra BufferGeometries in the bakery (short sleeve and long,
// right hand only, because nobody does this left-handed by accident).
//
// The knuckle box is shortened to a fist and one finger stands 55 mm proud of
// it. That is 55 mm on a 1.7 m man: about a thirtieth of his height, so at 214
// px across an aisle it is a fraction of a pixel and it is SUPPOSED to be. The
// read at monitor scale is the arm, held straight and still and aimed at the
// dome — see the note on `whoMeBird` in decoy.js. This bake is for the two
// seconds a player spends on the spot monitor at 3x, and for the fact that when
// he does look, the joke is actually there.
function shopperBird(THREE, S, long, side, half) {
  const P = partList(THREE, S);
  const B = SH_ARM(side), U = B.upper, F = B.fore;
  if (!long && !half) {
    // Same radii AND THE SAME VALUES as shopperForearm, and they have to BE the
    // same: this bake is swapped onto a live mesh mid-clip and a forearm that
    // changed width on the frame the finger goes up is a pop at any distance.
    // ROUND 3 (character) — that promise was half kept. The radii matched and
    // the COLOURS never did: the ordinary arm was 0xeeeeee / 0xe8e8e8 / 0xf4f4f4
    // and this one was flat 0xffffff, so every arm in this store brightened by
    // about 5% on the frame the finger went up and dimmed again when it came
    // down. Nobody saw it because nobody looked at a bird and a rest arm in the
    // same second. Both are now the same six segments at the same six values.
    P.taper(0.0455, 0.0448, U.len * 0.24, U.at(0.640), 0xd9d9d9, { seg: 8, r: U.r });
    P.taper(0.0448, 0.0458, U.len * 0.20, U.at(0.880), 0xe6e6e6, { seg: 8, r: U.r });
    P.ball(0.0458, 0.0436, 0.0472, B.el, 0xdedede, { seg: 8, rseg: 5 });
  }
  if (!long && half) {
    P.taper(0.0455, 0.0372, F.len * 0.30, F.at(0.160), 0xf4f4f4, { seg: 8, r: F.r });
    P.taper(0.0368, 0.0296, F.len * 0.25, F.at(0.430), 0xf4f4f4, { seg: 8, r: F.r });
    P.taper(0.0292, 0.0248, F.len * 0.11, F.at(0.605), 0xdcdcdc, { seg: 8, r: F.r });
  }
  if (!half) return halfOut(THREE, P, half, B.el);
  // ROUND 10 — re-baked onto the same bones as the ordinary hand, which is the
  // point of there being bones at all: the swap happens on a live mesh mid-clip
  // and a wrist that jumped 30 mm when the geometry changed would be a pop you
  // could see on the spot monitor.
  // Wrist and palm heel are byte-for-byte shopperHand's, values included.
  P.ball(0.027, 0.030, 0.026, F.at(0.575), 0xe6e6e6, { seg: 6, rseg: 5 });
  P.ball(0.029, 0.044, 0.040, F.pt(0.716, 0, 0.004), 0xf5f5f5, { seg: 8, rseg: 6, r: F.r });
  // The fist: the knuckle mass stays, the fingers are curled back into the palm.
  P.ball(0.028, 0.030, 0.028, F.pt(0.820, 0, 0.008), 0xebebeb, { seg: 8, rseg: 5, r: F.r });
  P.ball(0.025, 0.019, 0.023, F.pt(0.862, 0, 0.022), 0xf0f0f0, { seg: 6, rseg: 4, r: F.r });
  // ...and the one that is not curled. It runs along the FOREARM's own axis, so
  // it aims wherever the arm aims and needs no separate solve.
  P.tube(0.0125, 0.058, F.pt(0.945, 0, 0.004), 0xffffff, { seg: 6, r: F.r });
  P.ball(0.0130, 0.014, 0.0130, F.pt(1.022, 0, 0.004), 0xfbfbfb, { seg: 6, rseg: 4 });
  P.tube(0.0115, 0.036, F.pt(0.796, side * -0.026, 0.010), 0xfafafa,
    { seg: 6, r: [F.r[0] + 0.10, F.r[1], F.r[2] + side * 0.22] });   // thumb, tucked
  return halfOut(THREE, P, half, B.el);
}

// ===========================================================================
// ROUND 9 — CHILDREN. "THE CROWD HAS NONE OF THEM AND A GROCERY STORE ALWAYS
// DOES." (the cop builder's own note, and it was the right one)
// ===========================================================================
// A child is worth more per triangle than any adult variation in this file, and
// the reason is arithmetic rather than taste. Every silhouette knob the roster
// already turns — build, girth, height, hair, sleeves — moves a body inside a
// band that is 1.53 m to 1.83 m wide, i.e. +/-9% about the mean. A child is
// 1.05 m. It is a 35% outlier in the one dimension the monitor wall can still
// resolve at 214x120, which is HEIGHT, and it is the only thing you can put in
// this crowd that changes the shape of the GROUP rather than the shape of a
// person in it. Two adults and a kid is instantly a family; three adults is
// three adults.
//
// SEPARATE SKELETON, NOT A SCALED ADULT, and this is the whole craft of it. Set
// `height` to 0.64 on the shopper rig and you get a 1.06 m adult: correct
// stature, wrong everywhere it counts, because a child is not a small man. The
// numbers that actually make the read are the RATIOS, and all three are wrong
// on a scaled adult:
//   head    19% of stature, against an adult's 13%   (1 : 5.3, not 1 : 7.5)
//   legs    45% of stature, against an adult's 52%
//   shoulders barely wider than the head, against 2.1x on an adult
// The big head on a short body over stubby legs is the entire silhouette; get
// those three and the rest is decoration. At 20 px it survives as a dark dot
// that is too big for the smudge under it, which is a thing no adult in the
// building looks like.
//
// COST, because there are up to four of them: 7 meshes and ~1,050 triangles
// each, against a shopper's 12-15 and ~3,000. That is deliberate — the sleeve
// caps are baked INTO the torso so both arms can be one bare-skin mesh apiece,
// and each shoe is a dark vertex colour on the end of its own leg rather than a
// mesh in a third material. Four kids cost less than two adults.
//
// AND THE PART THAT MATTERS MOST: a child is attached to a BODY at construction
// and never re-rolled, exactly like that body's hair colour. Guilt is dealt out
// fresh every reset over the same fourteen indices, so a man with a kid is a
// thief exactly as often as a man without one. See the ablation in agents.js.
export const KID = {
  hipY: 0.50,        // 45% of stature — a child's legs are SHORT, this is the tell
  legLen: 0.50,
  shoulderY: 0.34,   // hips-local
  neckY: 0.40,       // hips-local
  headY: 0.122,      // neck-local centre of the skull  (round 10: +7 mm)
  crown: 1.14,       // round 10: the head grew, see kidTorso's note
  armLen: 0.42,
};

// Children's clothes, and this is the only thing in the child rig that reads at
// 20 px. Bright, high-chroma, and disjoint from CLOTH/PANTS on purpose: a red
// or a yellow body a metre tall in a crowd of beige and navy is a child before
// you have resolved a single feature on it.
export const KIDCLOTH = [
  0xd94f3d, 0xe8a33d, 0xf2d24b, 0x4f9d4f, 0x3d7fc4, 0x8a4fb8,
  0xe86fa0, 0x2fb3a8, 0xf07030, 0xfaf0e0,
];
export const KIDPANTS = [0x35507a, 0x2f3a4a, 0x6b4a8a, 0x2f6b52, 0x8a3d3d, 0x4a4a52];

// ===========================================================================
// ROUND 10 — "AT 214x120 THE CHILDREN READ AS A SMALLER BLOB NEXT TO AN ADULT
// RATHER THAN AS CHILDREN. THE HEIGHT DIFFERENCE LANDS, THE PROPORTIONS DON'T."
// ===========================================================================
// That was this file's own note and it is right. Measured on the round-9 build,
// which is what made it fixable — the ratio it claimed to have is not the ratio
// it had:
//
//   HEAD HEIGHT AS A FRACTION OF STATURE      round 9      real      round 10
//     adult                                    15.3%       ~13%       15.3%
//     child                                    17.0%       ~18%       19.6%
//     the DIFFERENCE, which is the whole cue    1.7 pts     5 pts      4.3 pts
//
// A 1.7-point difference is not a proportion, it is a rounding error, and at 35
// px tall it is nothing at all — which is exactly what "a smaller blob" means.
// The adult head is the one that is wrong against reality, but round 1 of this
// file was fought over people being headless and shrinking it back is not a
// trade worth making, so the child's head grows instead and the crown goes
// 1.11 -> 1.14. Stature rolls 0.98 m to 1.28 m, which is a four to eight year
// old and is what it was.
//
// THREE MORE, ALL OUTLINE AND ALL CHEAP:
//   - THE STANCE. Round 9's legs hung at +/-0.055 on shoulders 0.208 wide, i.e.
//     a post. Children stand with their feet apart and their toes out. +/-0.072
//     turns the bottom half into a triangle, which at 35 px is the difference
//     between a smudge and a stance.
//   - THE CLOTHES. Children in a supermarket are dressed in primaries and the
//     adults are not. `KIDCLOTH` is its own palette for the same reason the
//     cop is French blue over near-black: at the size the monitor wall renders a
//     person, VALUE AND CHROMA ARE THE SILHOUETTE. This is the one change here
//     that reads at 20 px, and it costs nothing — the same single pick() off
//     the same stream, pointed at a different array.
//   - A CAP. Fourth hairstyle, and it is a hat because a brim is the only thing
//     you can put on a head at this scale that changes its shape. `ri(0,3)`
//     instead of `ri(0,2)`: one draw, as before.
function kidTorso(THREE, S) {
  const P = partList(THREE, S);
  // A barrel with a pot belly and almost no shoulder line. The pot belly is not
  // a joke: under about seven, the abdomen is the widest part of the body, and
  // it is what stops this reading as a slim adult at 40 px.
  P.ball(0.101, 0.062, 0.084, [0, KID.shoulderY - 0.004, -0.004], 0xffffff, { seg: 10, rseg: 5 });
  P.ball(0.102, 0.092, 0.085, [0, 0.238, 0.002], 0xffffff, { seg: 10, rseg: 6 });
  P.ball(0.113, 0.094, 0.097, [0, 0.132, 0.012], 0xf6f6f6, { seg: 10, rseg: 6 });   // pot belly
  P.ball(0.105, 0.052, 0.089, [0, 0.036, 0.008], 0xe6e6e6, { seg: 10, rseg: 5 });   // hem
  // Sleeve caps live HERE and not on the arms, so each arm can be one bare-skin
  // mesh instead of a sleeve plus a forearm in two materials. Half the child's
  // draw calls come out of this one decision.
  P.ball(0.050, 0.050, 0.050, [0.101, KID.shoulderY - 0.012, 0], 0xfbfbfb, { seg: 8, rseg: 5 });
  P.ball(0.050, 0.050, 0.050, [-0.101, KID.shoulderY - 0.012, 0], 0xfbfbfb, { seg: 8, rseg: 5 });
  // ROUND 10 — the collar is NARROWER than it was (0.040 -> 0.034). The notch
  // between a big head and small shoulders is the thing that stops the two
  // reading as one blob, and a notch is made of the gap either side of it.
  P.tube(0.034, 0.030, [0, KID.neckY - 0.012, 0.002], 0xdcdcdc, { seg: 8 });        // collar
  return mergeParts(THREE, P.L);
}

function kidHead(THREE, S) {
  const P = partList(THREE, S);
  const h = KID.headY;
  // ROUND 10 — the skull is 13% wider and 15% taller than round 9's, and the
  // NECK is 4 mm thinner. Both halves matter: a big head on a thick neck is a
  // bodybuilder, and the gap either side of the neck is what makes the head a
  // separate object at 35 px instead of a bulge on the shoulders.
  P.tube(0.024, 0.050, [0, h - 0.124, -0.004], 0xe8e8e8, { seg: 8 });               // neck
  P.ball(0.092, 0.098, 0.094, [0, h + 0.012, -0.004], 0xffffff, { seg: 10, rseg: 7 });
  P.ball(0.077, 0.058, 0.081, [0, h - 0.054, 0.014], 0xfbfbfb, { seg: 10, rseg: 6 }); // cheeks
  P.ball(0.025, 0.032, 0.017, [0.091, h - 0.004, -0.006], 0xf6f6f6, { seg: 6, rseg: 4 });
  P.ball(0.025, 0.032, 0.017, [-0.091, h - 0.004, -0.006], 0xf6f6f6, { seg: 6, rseg: 4 });
  P.ball(0.016, 0.017, 0.018, [0, h - 0.016, 0.080], 0xffffff, { seg: 6, rseg: 5 });  // nose
  // The eyes are proportionally enormous and set LOW on the skull, which is the
  // other half of "child" after the head-to-body ratio.
  P.ball(0.021, 0.016, 0.011, [0.037, h - 0.002, 0.078], 0x54463c, { seg: 6, rseg: 4 });
  P.ball(0.021, 0.016, 0.011, [-0.037, h - 0.002, 0.078], 0x54463c, { seg: 6, rseg: 4 });
  return mergeParts(THREE, P.L);
}

function kidHair(THREE, S, k) {
  const P = partList(THREE, S);
  const h = KID.headY;
  if (k === 0) {                                   // a mop, over the ears
    P.ball(0.098, 0.088, 0.100, [0, h + 0.020, -0.004], 0xffffff, { seg: 10, rseg: 6 });
    P.box(0.170, 0.028, 0.042, [0, h + 0.042, 0.070], 0xf2f2f2);                     // fringe
  } else if (k === 1) {                            // bunches, and they stick OUT
    P.ball(0.095, 0.080, 0.098, [0, h + 0.022, -0.006], 0xffffff, { seg: 10, rseg: 6 });
    P.ball(0.043, 0.050, 0.043, [0.107, h - 0.006, -0.034], 0xf6f6f6, { seg: 8, rseg: 5 });
    P.ball(0.043, 0.050, 0.043, [-0.107, h - 0.006, -0.034], 0xf6f6f6, { seg: 8, rseg: 5 });
  } else if (k === 2) {                            // cropped
    P.ball(0.094, 0.068, 0.096, [0, h + 0.026, -0.006], 0xffffff, { seg: 10, rseg: 5 });
  } else {
    // ROUND 10 — A BALL CAP, WORN SLIGHTLY CROOKED. The only thing you can put
    // on a head at 35 px that changes its SHAPE rather than its colour: the
    // brim puts 60 mm of flat overhang out one side of a round skull, which is
    // a profile nothing else in the store has. It is also the cheapest way for
    // a child to be reading as a child from behind.
    P.ball(0.093, 0.052, 0.095, [0, h + 0.034, -0.004], 0xffffff, { seg: 10, rseg: 5 });
    P.ball(0.078, 0.062, 0.080, [0, h + 0.006, -0.004], 0xf4f4f4, { seg: 10, rseg: 5 });
    P.half(0.098, 0.014, [0, h + 0.024, 0.020], 0xe8e8e8, { r: [0.14, 0.22, 0], seg: 12 });
    P.ball(0.016, 0.014, 0.016, [0, h + 0.080, -0.004], 0xdedede, { seg: 6, rseg: 4 }); // button
  }
  return mergeParts(THREE, P.L);
}

// Bare arm, one mesh, skin material — see the note on kidTorso's sleeve caps.
// ROUND 10 — and it gets the same baked elbow every other arm in this file got,
// off the same armBones(), scaled to a 0.41 m reach. A child's arms are the
// half of the body that is always doing something, so a bend in them is worth
// more here than on an adult holding a trolley bar.
function kidArm(THREE, S, side, half) {
  const P = partList(THREE, S);
  const B = KID_ARM(side);
  const U = B.upper, F = B.fore;
  if (!half) {
    P.taper(0.038, 0.031, U.len * 0.92, U.at(0.50), 0xffffff, { seg: 7, r: U.r });
    P.ball(0.032, 0.032, 0.032, B.el, 0xf8f8f8, { seg: 6, rseg: 5 });                  // elbow
  } else {
    P.taper(0.031, 0.024, F.len * 0.66, F.at(0.36), 0xffffff, { seg: 7, r: F.r });
    P.ball(0.024, 0.030, 0.027, F.pt(0.80, 0, 0.004), 0xf4f4f4, { seg: 6, rseg: 5, r: F.r }); // hand
    P.ball(0.019, 0.021, 0.019, F.pt(0.94, 0, 0.010), 0xf0f0f0, { seg: 6, rseg: 4, r: F.r }); // fingers
  }
  return halfOut(THREE, P, half, B.el);
}

// Leg AND shoe in one mesh: the shoe is a 0.5 vertex colour on the trouser
// material, so it comes out as a dark tone of the same dye. At the size a child
// is ever seen in this store that is a shoe, and it is a draw call we keep.
function kidLeg(THREE, S, side) {
  const P = partList(THREE, S);
  // ROUND 10 — thicker thigh, and the shoe is toed OUT by 12 degrees. Both are
  // outline: a child's leg is not a tapered dowel, and a pair of feet turned
  // out is a stance rather than a pair of posts. The widening of the stance
  // itself is in makeChild, where the pivots live.
  P.taper(0.060, 0.049, 0.24, [side * 0.004, -0.120, 0], 0xffffff, { seg: 7 });
  P.ball(0.044, 0.038, 0.046, [0, -0.245, 0.002], 0xf6f6f6, { seg: 7, rseg: 5 });     // knee
  P.taper(0.045, 0.036, 0.20, [0, -0.350, 0.002], 0xfafafa, { seg: 7 });
  P.ball(0.039, 0.028, 0.060, [0, -0.470, 0.020], 0x7e7e7e, { seg: 7, rseg: 5, r: [0, side * -0.21, 0] });
  P.box(0.068, 0.016, 0.122, [0, -0.492, 0.018], 0x606060, { r: [0, side * -0.21, 0] });
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
// ROUND 7 — the wear is mostly in this table, and it is the cheapest half of
// "beaten up". THE UNIFORM IS NOT ONE UNIFORM: the cap is the newest thing on
// him and is still properly navy; the trousers were replaced separately, years
// ago, and have gone grey-brown in the wash; the shirt has faded at the yoke
// where it sees the light and gone dingy under the arms and over the gut. Three
// fabrics that no longer match is what a uniform looks like after a decade, and
// it costs nothing but three hex values.
const C = {
  shirt: 0x93a9c6, shirtSh: 0x7c92b0, shirtDk: 0x63779a, shirtHem: 0x53668a,
  shirtFade: 0xa6b8cd,             // the yoke, sun-bleached a shade lighter
  vest: 0xd6d3ca,                  // the undershirt, seen through the gaps
  navy: 0x232c40, navyDk: 0x161d2c, brim: 0x0e1320,
  salt: 0x3e465c,                  // the sweat ring dried into the cap serge
  trouser: 0x343648, stripe: 0x0c0f18,
  skin: 0xd9a481, skinSh: 0xb17d5c, skinDk: 0x8f5f45, lip: 0xb87765,
  nose: 0xcf8d70, noseDk: 0xa96450, bag: 0xba8a72, bagDk: 0x9a6a58,
  hair: 0x8b8279, hairDk: 0x6e675f, tache: 0x7d736a, eye: 0x33291f,
  leather: 0x1a1a1f, leatherHi: 0x2b2b32, leatherWorn: 0x3c3c45,
  gold: 0xd8be6e, chrome: 0xc6cbd2, steel: 0x8d939b,
  white: 0xffffff, glove: 0x9fd0e0, radio: 0x2a2d33, red: 0xa8352c,
  stain: 0x8b7a55, stainDk: 0x746343,
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
    // ROUND 7 — THE BAGS. A puffy ridge under each eye and a soft crease
    // beneath it. This is the cheapest way to age a face by fifteen years: it
    // is not wrinkles, it is that the shadow under the eye has VOLUME casting
    // it. Both are ELLIPSOIDS — the first cut used a box for the crease and at
    // portrait range it read as a bar of eyeliner, because a hard edge on a
    // face is always a graphic and never a fold.
    P.ball(0.028, 0.010, 0.011, [s * 0.043, h - 0.001, 0.087], C.bag, { seg: 8, rseg: 4, ...X });
    P.ball(0.023, 0.005, 0.007, [s * 0.043, h - 0.011, 0.086], C.bagDk, { seg: 8, rseg: 4, ...X });
    P.box(0.048, 0.013, 0.014, [s * 0.044, h + 0.049, 0.088], C.tache, { r: [0, 0, s * 0.20], ...X });
  }

  // nose: bridge, tip, nostrils. Bulbous, and it has been red for years — the
  // colour is the detail, not the geometry.
  P.box(0.026, 0.058, 0.038, [0, h + 0.012, 0.083], C.skin, { r: [0.20, 0, 0], ...X });
  P.ball(0.029, 0.024, 0.028, [0, h - 0.021, 0.098], C.nose, { seg: 8, rseg: 6, ...X });
  for (const s of [1, -1]) {
    P.ball(0.012, 0.011, 0.011, [s * 0.022, h - 0.025, 0.090], C.noseDk, { seg: 6, rseg: 4, ...X });
  }

  // Moustache and mouth. Grey, and it needs a trim: wider than his lip, thicker
  // than it should be, and the ends straggle down past the corners.
  P.box(0.086, 0.018, 0.023, [0, h - 0.048, 0.090], C.tache, { ...X });
  for (const s of [1, -1]) {
    P.box(0.021, 0.028, 0.020, [s * 0.041, h - 0.057, 0.087], C.tache, { r: [0, 0, s * 0.52], ...X });
    P.box(0.011, 0.017, 0.013, [s * 0.049, h - 0.069, 0.083], C.tache, { r: [0, 0, s * 0.66], ...X });
  }
  P.box(0.046, 0.009, 0.014, [0, h - 0.074, 0.086], C.lip, { ...X });

  // ---- WHAT HAIR IS LEFT, AND WHERE IT STOPS -----------------------------
  // Round 6 put a dome over the whole skull, which under a cap is indis-
  // tinguishable from a full head of hair. The horseshoe is pushed BACK now so
  // the temples are bare skin, with a heavier mass at the nape spilling over
  // the collar and a thin wisp at each temple that is doing its best. A
  // HAIRLINE is the difference between a bald man in a hat and a man whose hair
  // is going, and only one of those is fifty-five.
  P.ball(0.107, 0.056, 0.100, [0, h + 0.002, -0.030], C.hair, { seg: 12, rseg: 5, ...X });
  P.ball(0.090, 0.042, 0.054, [0, h - 0.040, -0.070], C.hairDk, { seg: 10, rseg: 5, ...X });
  for (const s of [1, -1]) {
    P.box(0.013, 0.040, 0.038, [s * 0.101, h + 0.010, -0.008], C.hair, { r: [0, 0, s * 0.10], ...X });
    P.box(0.016, 0.056, 0.030, [s * 0.098, h - 0.020, 0.004], C.hairDk, { ...X });
  }

  // ---- the cap ----------------------------------------------------------
  // It is the newest thing he owns and it is still ruined: a salt ring dried
  // into the serge above the band, and a brim he has bent down and slightly
  // sideways over about four thousand shifts. The bend is worth the two numbers
  // it costs — a level brim is a brand-new cap, and nothing else on him is.
  const K = { uv: uvOf('capcloth') };
  P.taper(0.116, 0.132, 0.084, [0, h + 0.142, -0.004], C.navy, { seg: 14, ...K });
  P.ball(0.116, 0.038, 0.112, [0, h + 0.182, -0.004], C.navy, { seg: 14, rseg: 5, ...K });
  P.tube(0.129, 0.026, [0, h + 0.127, -0.004], C.salt, { seg: 14, ...K });
  P.tube(0.135, 0.042, [0, h + 0.098, -0.004], C.navyDk, { seg: 14, ...K });
  // THE BRIM PITCH IS SET AGAINST `stoop`, NOT IN ISOLATION — a lesson this
  // cost a render to learn. Round 6 used 0.24 with the head carried at 0.09; at
  // round 7's 0.19 slump the head is already tipped 6 degrees further forward,
  // so 0.32 put the brim across his eye line and he had no face at all. 0.19
  // plus a 3-degree ROLL is the same read (a cap bent down and slightly
  // sideways over four thousand shifts) with the eyes still in it, and the eyes
  // are what round 1 was fought over.
  P.half(0.157, 0.015, [0, h + 0.081, 0.022], C.brim, { r: [0.19, 0, 0.055], seg: 16, uv: uvOf('shoe') });
  P.half(0.157, 0.008, [0, h + 0.073, 0.022], C.navyDk, { r: [0.19, 0, 0.055], seg: 16, ...K });
  return mergeParts(THREE, P.L);
}

// The metal on his head: cap shield and the gold chinstrap he never uses.
function copHeadKit(THREE, S) {
  const P = partList(THREE, S), h = FIG.headY, X = { uv: uvOf('flat') };
  // The chinstrap follows the brim, so its pitch has to move with the bend or
  // it floats off the front of a cap that is now steeper than it was.
  P.box(0.150, 0.009, 0.011, [0, h + 0.086, 0.113], C.gold, { r: [0.19, 0, 0.055], ...X });
  for (const s of [1, -1]) {
    P.tube(0.010, 0.007, [s * 0.088, h + 0.094, 0.086], C.gold, { r: [Math.PI / 2, 0, 0], seg: 6, ...X });
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
//
// ROUND 7 — A GUT THAT HANGS, WHICH IS A DIFFERENT SHAPE FROM A BIG ONE.
// The note was "he should really look fat and beaten up", and the first thing
// that means is that the widest part of him is not a sphere centred on his
// navel. On a heavy man in a duty belt the strap goes UNDER the overhang, so
// the profile from the side is: narrow at the belt, wide 60 mm above it, and
// the 40 mm between them is nearly vertical because that is fabric hanging over
// leather. Round 6 had the apex 100 mm above the belt and 10 mm proud of it,
// which reads as a barrel with a band round it. Now the apex is 88 mm proud in
// cz and the ring the belt actually sits on is NARROWER than the belt itself,
// so the strap disappears under him. That trade is worth having at both scales:
// at 214 px what survives is that the dark waist notch is BELOW the widest part
// of the light band instead of through the middle of it.
const SHIRT_RINGS = [
  { y: -0.040, rx: 0.030, rz: 0.026, cz: 0.012, c: 'shirtHem' },
  { y: -0.015, rx: 0.196, rz: 0.166, cz: 0.014, c: 'shirtHem' },
  { y: 0.014, rx: 0.214, rz: 0.182, cz: 0.018, c: 'shirtHem' },
  // THE BITE. The belt (BELT_RX 0.238) is WIDER than the shirt here, so the
  // strap sits under the overhang and not on top of it.
  { y: 0.048, rx: 0.220, rz: 0.188, cz: 0.028, c: 'shirtHem' },
  // ...and this is the hang: 60 mm of near-vertical fabric coming back out
  // over the top of the strap.
  // Only the LOWEST hang ring is darkened. Two dark rings put a ruled
  // horizontal line the full width of him under the gut, and from the front
  // that reads as the hem of an apron rather than as the shadow under an
  // overhang. One ring, and the rest of the shading is the light's job.
  { y: 0.076, rx: 0.254, rz: 0.226, cz: 0.058, c: 'shirtDk' },
  { y: 0.104, rx: 0.273, rz: 0.245, cz: 0.076, c: 'shirt' },
  { y: 0.134, rx: 0.281, rz: 0.253, cz: 0.086, c: 'shirt' },   // apex, and it is LOW
  { y: 0.172, rx: 0.278, rz: 0.246, cz: 0.080, c: 'shirt' },
  { y: 0.212, rx: 0.268, rz: 0.231, cz: 0.066, c: 'shirt' },
  { y: 0.256, rx: 0.255, rz: 0.213, cz: 0.050, c: 'shirt' },
  { y: 0.300, rx: 0.242, rz: 0.198, cz: 0.032, c: 'shirt' },
  { y: 0.355, rx: 0.230, rz: 0.187, cz: 0.013, c: 'shirt' },
  { y: 0.410, rx: 0.226, rz: 0.181, cz: -0.002, c: 'shirtFade' },
  { y: 0.455, rx: 0.222, rz: 0.174, cz: -0.014, c: 'shirtFade' },
  { y: 0.487, rx: 0.192, rz: 0.154, cz: -0.018, c: 'shirtFade' },
  { y: 0.510, rx: 0.134, rz: 0.117, cz: -0.016, c: 'shirtSh' },
  { y: 0.528, rx: 0.089, rz: 0.083, cz: -0.011, c: 'shirtSh' },
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

  // Round shoulders, upper back, and — round 7 — the roll at the base of the
  // neck. The brief asks for a man who is recognisable from behind at 7 m, and
  // a rounded upper back plus a chin sunk into the collar is most of that read.
  // It is also the half of "beaten up" that survives the monitor feed, because
  // it changes the TOP of the light band from a square shelf into a slump.
  P.ball(0.178, 0.094, 0.084, [0, FIG.shoulderY - 0.008, -0.112], C.shirtSh, { seg: 12, rseg: 6, ...F });
  P.ball(0.110, 0.078, 0.064, [0, FIG.shoulderY + 0.046, -0.062], C.shirtSh, { seg: 10, rseg: 5, ...F });
  P.ball(0.074, 0.050, 0.046, [0, FIG.shoulderY + 0.064, -0.046], C.shirtSh, { seg: 8, rseg: 5, ...F });

  // The collar. A stand round the throat and two points lying ON the chest —
  // and the stand has GIVEN UP: it is shorter than it was, it does not sit
  // level, and the two points curl by different amounts because one of them has
  // been ironed flat more times than the other. Asymmetry is the whole trick
  // with worn clothing; a symmetrically ruined collar reads as a design.
  P.tube(0.090, 0.062, [0, FIG.neckY + 0.014, -0.008], C.shirtSh, { seg: 12, r: [0.06, 0, 0.03], ...F });
  for (const s of [1, -1]) {
    const f = onShirt(s * 0.052, 0.499, 0.058);
    P.box(0.072, 0.013, 0.060, [f.p[0], f.p[1] - (s > 0 ? 0.004 : 0), f.p[2] - 0.010],
      C.shirtSh, { r: [f.r[0] + (s > 0 ? 0.48 : 0.28), f.r[1], s * -0.28 - 0.06], ...F });
  }
  // Placket and buttons. Sunk 4 mm so only the proud face shows. Six of them,
  // and the bottom one now lands just above the belt rather than behind the
  // buckle, because the gut moved.
  for (let i = 0; i < 6; i++) {
    const y = 0.454 - i * 0.070;
    const f = onShirt(0, y, 0.074);
    P.box(0.048, 0.074, 0.016, [f.p[0], f.p[1], f.p[2] - 0.005], C.shirtSh, { r: f.r, ...F });
    const b = onShirt(0, y - 0.028, 0.02);
    P.tube(0.011, 0.007, [b.p[0], b.p[1], b.p[2] + 0.005], C.shirtHem,
      { r: [Math.PI / 2 + b.r[0], 0, 0], seg: 6, ...X });
  }
  // ---- IT DOES NOT FIT AND IT HAS NOT FOR YEARS --------------------------
  // The three gaps the placket makes when a shirt is worn a size and a half too
  // small: the fabric pulls apart between the buttons over the widest part of
  // him and you can see the vest through it. Two parts each — the shadow of the
  // gap, and the sliver of undershirt at its edge — because a dark slot on its
  // own reads as a stripe and a light one reads as a stripe the other way. Only
  // legible in the spot monitor's push-in; it costs six primitives and it is
  // the single most specific thing on him.
  for (const gy of [0.139, 0.209, 0.279]) {
    const g = onShirt(0, gy, 0.038);
    P.box(0.030, 0.036, 0.012, [g.p[0], g.p[1], g.p[2] - 0.010], C.shirtHem, { r: g.r, ...F });
    P.box(0.020, 0.030, 0.010, [g.p[0] + 0.004, g.p[1], g.p[2] - 0.011], C.vest, { r: g.r, ...X });
  }
  // A stain he has not noticed, low and to one side where a gut catches
  // everything. Desaturated on purpose: a bright one is a joke and he is not a
  // joke, he is sincere, which is what makes him funny.
  const sa = onShirt(0.078, 0.158, 0.05);
  P.ball(0.026, 0.020, 0.006, [sa.p[0], sa.p[1], sa.p[2] + 0.001], C.stain,
    { seg: 8, rseg: 5, r: sa.r, ...F });
  const sb = onShirt(0.050, 0.126, 0.03);
  P.ball(0.013, 0.011, 0.005, [sb.p[0], sb.p[1], sb.p[2] + 0.001], C.stainDk,
    { seg: 6, rseg: 4, r: sb.r, ...F });
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
  // ---- ROUND 7: THE TAIL CAME OUT AT THE BACK AND HE HAS NOT NOTICED ------
  // Three panels of shirt hanging below the belt line behind him, at three
  // different lengths and three different angles because that is what an
  // untucked tail does. It lives HERE, on `hips`, and not on `chest` with the
  // rest of the shirt — deliberately. A tail parented to the chest swings up
  // 100 mm every time he stoops to get his breath back, and a shirt tail does
  // not do that; it hangs off the waistband, so it belongs to the pelvis.
  // This is also the one wear detail that pays at CCTV resolution: it puts a
  // light spur down into the dark leg band, so the three-band silhouette gets
  // a ragged join at the back instead of a ruled line.
  //
  // IT HANGS OVER THE BACK OF THE HIPS AND NOT DOWN THE SPINE. The first cut
  // put three panels across the centre back and they covered the radio, the
  // baton and the keys — the funniest objects on him — and read as sheets of
  // paper taped to a belt. Two panels, set out at +-2.05 rad so they fall
  // between the kit, wrapped onto the seat's own curve so they are not flat,
  // and in the darkest shirt tone so they sit BEHIND everything in value.
  for (const [th, yc, hh, w, rz, col] of [
    [2.05, -0.046, 0.128, 0.126, 0.13, C.shirtDk],
    [-2.28, -0.020, 0.090, 0.104, -0.10, C.shirtHem]]) {
    const sx = Math.sin(th), cz = Math.cos(th);
    P.box(w, hh, 0.016, [sx * 0.228, yc, cz * 0.198 + 0.010], col,
      { r: [0.10, Math.atan2(sx, cz), rz], uv: uvOf('shirt') });
  }
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
  // The strap itself: 26 flat segments round the ellipse, basketweave-mapped.
  // ROUND 7 — SHINY AT THE WEAR POINTS. Duty leather does not age evenly: it
  // burnishes where things rub it, which on a fat man is the run either side of
  // the buckle where his forearms rest and the two spots at the hips where the
  // holster and the cuff case swing against it. The basketweave cell is tiled
  // identically across all 26 segments, so wear cannot come from the texture —
  // it is a vertex colour on seven of them, which costs nothing at all.
  const N = 26;
  const WORN = new Set([0, 1, 25, 6, 7, 19, 20]);
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const b = onBelt(th, 0.004, 0);
    const seg = (Math.PI * 2 / N) * Math.hypot(BELT_RX * Math.cos(th), BELT_RZ * Math.sin(th));
    P.box(seg * 1.35, 0.062, 0.026, b.p, WORN.has(i) ? C.leatherWorn : C.leather,
      { r: [0, b.y, 0], ...W });
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
// Trouser with the outseam stripe and a break over the shoe. The oxford it
// breaks over — sole, heel, welt and a toe cap that takes a highlight, shoes
// not made for running — is copShoe() below, and used to be part of this bake.
// ---------------------------------------------------------------------------
// ROUND 1 (cop) — THE SHOE COMES OUT OF THE LEG, AND THAT IS THE WHOLE REASON
// HE MISSED FOUR ROUNDS OF WALK FIXES.
//
// gait.js's attachFeet() finds the shoe inside a leg group BY MEASUREMENT —
// "the child whose geometry is short and lives at the bottom of the leg" — and
// then splits the leg at the knee and hinges the two halves. Every shopper has
// had that since round 12. The cop never could, for one reason: `copLeg` baked
// the oxford INTO the trouser, so his leg group had exactly one child and
// attachFeet returned null on the first line. Not a missing feature, a merged
// mesh. So the oxford is its own bake now, in the SAME leg-local coordinates it
// was already at, and `makeCop` hangs it off the same pivot: the rest pose is
// byte-identical and the rig now satisfies the shoe search.
//
// COST: one draw call per leg, plus one per leg for the knee's shank, so four.
// See the ledger over makeCop.
//
// The knee ball also MOVED, by 15 mm, and it moved because of gait.js:
// attachFeet cuts the leg at `ankleY * KNEE_F` and the cut is safe precisely
// when it passes through the CENTRE of the ball ("a ball split by a plane
// containing the hinge axis and rotated about that axis is still the same
// ball"). His shoe's top — the ankle — is at -0.780, so KNEE_F 0.529 puts the
// cut at -0.4126 and the ball was at -0.428. Moving the ball to meet the cut is
// 15 mm on a 1.72 m man and it is invisible; leaving it there would have put a
// 15 mm crease off-centre in the one place on a leg where a crease is a
// feature. It also puts his knee at the same anatomical fraction as everyone
// else's, which it was not.
export const COP_ANKLE_Y = -0.780;                 // shoe bbox top, in leg-local metres
export const COP_KNEE_Y = COP_ANKLE_Y * 0.529;     // = gait.js's KNEE_F. See the note above.
// Hip half-separation. UNCHANGED at 0.112, and the reason it is unchanged is
// worth writing down because "a fat man stands wider" is true and this is not
// where it goes. His thigh is 0.118 at the top, so the two of them overlap
// across the midline by 12 mm — round 11's note is that the overlap IS the
// pelvis this game has, and widening the pivots opens a hole at the crotch that
// the seat loft does not reach down to cover. A wide stance is hip ABDUCTION,
// which puts the FEET apart without taking the thighs apart, and it lives in
// agents.js as K.copSplay where it can be a per-frame quantity.
const COP_STANCE = 0.112;
const COP_RAKE_Z = 0.038;                   // see the note over `limb` in makeCop
function copLeg(THREE, S, side) {
  const P = partList(THREE, S);
  const T = { uv: uvOf('twill') }, X = { uv: uvOf('flat') };
  P.taper(0.118, 0.094, 0.42, [side * 0.006, -0.205, 0], C.trouser, { seg: 10, ...T });
  P.ball(0.086, 0.062, 0.090, [0, COP_KNEE_Y, 0.008], C.trouser, { seg: 8, rseg: 5, ...T });
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
  return mergeParts(THREE, P.L);
}

// The oxford, unpolished. The colour is off-black and slightly brown now —
// black leather that has not seen a brush in a year goes grey-brown, not
// black — and the shine is gone from the atlas cell rather than from here,
// so the cap brim (which shares that cell) goes dull with it, which is
// correct: they have been neglected by the same man.
//
// EVERY COORDINATE HERE IS THE ONE IT HAD INSIDE copLeg. The mesh moves from
// being merged into the trouser to being a sibling of it at the same pivot, so
// nothing about the standing figure changes; what changes is that gait.js can
// now find it, pitch it and pin its sole. `soleY`/`toeZ`/`heelZ` in attachFeet
// come straight off this box, so the numbers below ARE the foot rocker:
// sole at -0.856, toe at +0.126, heel at -0.087 — a 213 mm shoe with the ankle
// 76 mm up, which is what makes his hip rise at both ends of stance.
function copShoe(THREE, S) {
  const P = partList(THREE, S);
  const X = { uv: uvOf('flat') };
  const y = -0.826;
  P.ball(0.052, 0.036, 0.086, [0, y + 0.010, 0.020], 0x2b2721, { seg: 10, rseg: 6, uv: uvOf('shoe') });
  P.ball(0.046, 0.028, 0.056, [0, y + 0.002, 0.078], 0x362f28, { seg: 10, rseg: 6, uv: uvOf('shoe') });
  P.box(0.100, 0.016, 0.208, [0, y - 0.022, 0.020], 0x201d1a, { ...X });        // sole
  P.box(0.104, 0.008, 0.212, [0, y - 0.012, 0.020], 0x453f38, { ...X });        // welt, gone grey
  P.box(0.090, 0.026, 0.062, [0, y - 0.020, -0.056], 0x171514, { ...X });       // heel, worn down
  P.box(0.050, 0.014, 0.052, [0, y + 0.030, 0.016], 0x241f1b, { ...X });        // laces
  return mergeParts(THREE, P.L);
}

// --- arms -------------------------------------------------------------------
// Short-sleeve summer uniform: it gets the shoulder patch out where it can be
// seen and it puts two bands of skin in the silhouette, which is worth more at
// CCTV resolution than any amount of detail on the sleeve itself.
// HIS bones. Same construction as a shopper's, same elbow rule, longer reach
// and a fingertip at -0.674 — which is where the old straight stick ended, so
// nothing that assumes an arm length has moved. Declared up with the elbow
// solve (ROUND 5) so the joint table and the bake read the same one function.

// HIS sleeve is entirely above the joint — it ends at U.at(0.897), 10% of the
// humerus short of the elbow — so there is no fore half of it at all and the
// split costs him no mesh on this bake.
function copSleeve(THREE, S, side) {
  const P = partList(THREE, S);
  const F = { uv: uvOf('shirt') };
  const B = COP_ARM(side), U = B.upper;
  // ROUND 7 — THE SLEEVE IS TIGHT ON THE UPPER ARM. The cap of the sleeve is
  // fuller and the hem is 9 mm narrower than it was, so the band BITES: there
  // is a bulge of arm above the cuff and another one below it. A short sleeve
  // that hangs loose belongs to a thin man, and none of the rest of him is.
  // The cap of the sleeve has to MEET the taper under it or the shoulder grows
  // a ledge and he is wearing a doublet. 0.096 into a 0.094 top is a seam you
  // cannot find; the tightness lives at the other end, in the hem.
  //
  // ROUND 10 — and it now runs down the UPPER ARM rather than down a stick. The
  // sleeve already ended at -0.289, a hair above where the elbow turns out to
  // be, so this is the same garment on a bone that finally exists.
  // ROUND 3 (character) — AND IT IS SHADED AGAINST THE TRUNK, which round 11
  // did for every shopper and nobody ever did for him. His sleeve was C.shirt
  // for its whole length, i.e. the same value as the shirt it is sewn to, on a
  // material with no seam and a trunk 60 mm behind it: from the chase camera
  // the upper arm and the ribs were one continuous blue field. The deltoid
  // keeps the full value (it is the top-lit surface and it is what defines the
  // shoulder); everything below it steps down, same 9%, same price.
  P.ball(0.098, 0.079, 0.096, [0, -0.030, 0], C.shirt, { seg: 10, rseg: 7, ...F });
  P.taper(0.088, 0.096, U.len * 0.76, U.at(0.42), C.shirtSh, { seg: 10, r: U.r, ...F });
  P.ball(0.083, 0.022, 0.080, U.at(0.79), C.shirtSh, { seg: 10, rseg: 4, r: U.r, ...F });
  // ---- THE HEM IS A FOLD, NOT AN EDGE ------------------------------------
  // A rolled short sleeve is cloth doubled back on itself: there is a crease
  // where it turns, a band of two thicknesses, and a shadow under the bottom
  // edge. It was ONE tube, so the sleeve simply stopped and skin began — the
  // lead's note, and the reason the arm below read as a tube stuck into a
  // sleeve rather than as an arm coming out of one. Three rings instead of one,
  // and the fourth part of it (the shadow the band casts ON the arm) is in
  // copForearm, because it is on the skin and not on the cloth.
  P.tube(0.079, 0.008, U.at(0.818), C.shirtHem, { seg: 10, r: U.r, ...F });  // the turn
  P.tube(0.077, 0.031, U.at(0.860), C.shirtDk, { seg: 10, r: U.r, ...F });   // the roll
  P.tube(0.0735, 0.009, U.at(0.897), C.shirtHem, { seg: 10, r: U.r, ...F }); // its lower edge
  // shoulder patch, proud of the sleeve, facing outboard
  P.box(0.006, 0.090, 0.074, [side * 0.098, -0.080, -0.002], C.white,
    { r: [0, 0, side * -0.06], uv: uvOf('patch') });
  return mergeParts(THREE, P.L);
}

function copForearm(THREE, S, side, half) {
  const P = partList(THREE, S);
  const X = { uv: uvOf('flat') };
  const B = COP_ARM(side), U = B.upper, F = B.fore;
  // Wider than the cuff above it, so the arm reads as squeezed out of it. The
  // elbow ball now sits AT the joint instead of at an arbitrary y, so the bulge
  // and the crease are the same feature.
  // The bare arm has to START ABOVE THE CUFF, not at the elbow — see the note in
  // shopperForearm; the two meshes are separate objects and a gap between them
  // is a hole with the store showing through.
  // ===========================================================================
  // ROUND 3 (character) — THE LEAD, HAVING PLAYED IT: "from the chase camera,
  // behind the cop, three metres — the framing for the entire floor phase — his
  // bare forearms are the worst thing on screen. Two smooth skin-coloured
  // tubes: no elbow, no forearm taper, no wrist."
  //
  // He was describing FOUR parts doing the work of nine, all of them one flat
  // colour. The old arm was: one taper 80->76 from under the cuff to past the
  // elbow, one elbow ball the same width as both, one taper 76->48 for the
  // whole forearm, and a hand. That is a cone. A cone has no elbow because
  // nothing changes width at the joint, no forearm because the flexor mass and
  // the wrist are the same straight line, and no wrist because 48 mm of radius
  // ran straight into a 33 mm hand ball with no colour change to say so.
  //
  // WHAT A FOREARM ACTUALLY DOES, and every one of these is a silhouette
  // change rather than a texture:
  //   it is NARROWEST where the cuff bites and swells again below it;
  //   the elbow is a KNOB — wider than the arm above and below it, so the
  //     outline has a corner in it;
  //   the flexor mass is the widest part of the forearm and it is up at the
  //     elbow, not in the middle: the taper is 80 -> 40 over the LAST two
  //     thirds, not evenly along the whole thing;
  //   the wrist is half the width of the elbow and it is the one place the
  //     outline pinches.
  // Plus the shadow the sleeve band casts on the arm under it, which is the
  // darkest skin on him and is what makes the sleeve sit ON the arm.
  if (!half) {
    P.taper(0.072, 0.079, U.len * 0.13, U.at(0.830), C.skinDk, { seg: 10, r: U.r, ...X });
    P.taper(0.079, 0.082, U.len * 0.10, U.at(0.925), C.skinDk, { seg: 10, r: U.r, ...X });
    P.taper(0.082, 0.080, U.len * 0.10, U.at(0.985), C.skinSh, { seg: 10, r: U.r, ...X });
    // The elbow knob: proud of both segments, and darker on its own because a
    // point of the arm that sticks out backwards is not the part catching the
    // ceiling.
    P.ball(0.081, 0.078, 0.084, B.el, C.skinSh, { seg: 8, rseg: 6, ...X });
    return halfOut(THREE, P, half, B.el);
  }
  P.taper(0.081, 0.067, F.len * 0.30, F.at(0.16), C.skin, { seg: 10, r: F.r, ...X });
  P.taper(0.066, 0.050, F.len * 0.25, F.at(0.43), C.skin, { seg: 10, r: F.r, ...X });
  P.taper(0.049, 0.040, F.len * 0.11, F.at(0.605), C.skinSh, { seg: 10, r: F.r, ...X });
  // ROUND 10 — the same hand every shopper got, in his skin and on his atlas
  // cell, scaled 1.22x because he is a bigger man and his hands were always
  // modelled bigger. The SHAPE is shared, which is the point of it living in one
  // function: the day somebody rounds a fingertip, fifteen people get it.
  shopperHand(P, F, side, C.skin, 1.22, uvOf('flat'));
  if (side < 0) {                                    // watch, right wrist
    // Moved down onto the wrist proper. At F.at(0.545) it was 50 mm of radius
    // on a 52 mm arm — a watch buried in the man wearing it.
    P.tube(0.048, 0.020, F.at(0.618), 0x22222a, { seg: 8, r: F.r, ...X });
    P.tube(0.020, 0.026, F.pt(0.618, 0, 0.032), C.steel,
      { r: [F.r[0] + Math.PI / 2, F.r[1], F.r[2]], seg: 8, ...X });
  }
  return halfOut(THREE, P, half, B.el);
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
    // [build][strap], strap 0 = none, 1 = over the +X shoulder, 2 = over -X.
    // Twelve more lofts of 416 triangles each in the library and NOT ONE more
    // draw call, mesh or material on any body: a person points at one of the
    // three and which one is decided once, at construction, from a bag that was
    // already visible on him.
    torso: BUILDS.map((b) => [shopperTorso(THREE, S, b, 0),
      shopperTorso(THREE, S, b, 1), shopperTorso(THREE, S, b, -1)]),
    head: [0, 1, 2].map((k) => shopperHead(THREE, S, k)),
    hair: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => shopperHair(THREE, S, k)),
    // [kind][side]. Both sides baked; see shopperBag for why a negative scale
    // is not an option.
    bag: [0, 1, 2, 3].map((k) => [shopperBag(THREE, S, k, 1), shopperBag(THREE, S, k, -1)]),
    leg: BUILDS.map((b) => [shopperLeg(THREE, S, b, 1), shopperLeg(THREE, S, b, -1)]),
    shoe: [shopperShoe(THREE, S, 0), shopperShoe(THREE, S, 1)],
    // ROUND 5 — [sleeve][side][half]. `half` 0 is the humerus and stays in the
    // shoulder pivot; half 1 is the forearm and hangs off the elbow group. A
    // short sleeve has no fore half and a long-sleeved person's skin bake has
    // no upper half, so a body carries THREE arm meshes per arm either way,
    // against two before. That is the price of the joint and it is stated here
    // rather than discovered from a frame timer: +1 mesh per arm, +2 per body.
    sleeve: [0, 1].map((long) => [1, -1].map((sd) =>
      [shopperSleeve(THREE, S, !!long, sd, 0), shopperSleeve(THREE, S, !!long, sd, 1)])),
    fore: [0, 1].map((long) => [1, -1].map((sd) =>
      [shopperForearm(THREE, S, !!long, sd, 0), shopperForearm(THREE, S, !!long, sd, 1)])),
    // Both are SHORT-forearm bakes, which looks wrong and is not: the mesh that
    // actually carries a hand in skin is `fore[sleeve][1]` on both sleeve
    // lengths — round 10 collapsed the long-sleeved person's third arm mesh, so
    // there is now exactly one skin hand per arm and one bird bake per sleeve.
    // ROUND 10 — [long, short], both for the RIGHT hand (side -1), because that
    // is the only hand this ever swaps onto. See makePerson.
    // ROUND 5 — and only the FORE half of it, because the finger is on the
    // hand: the upper half of a bird arm is byte-identical to the upper half of
    // an ordinary one, so the swap agents.js does on `handR` still lands on
    // exactly one geometry and the two bakes it needs are still two.
    bird: [shopperBird(THREE, S, true, -1, 1), shopperBird(THREE, S, false, -1, 1)],
    // the cop, baked once, one instance
    cop: {
      head: copHead(THREE, S), headKit: copHeadKit(THREE, S),
      torso: copTorso(THREE, S), torsoKit: copTorsoKit(THREE, S),
      seat: copSeat(THREE, S),
      belt: copBelt(THREE, S), beltKit: copBeltKit(THREE, S),
      leg: [copLeg(THREE, S, 1), copLeg(THREE, S, -1)],
      // ONE bake, shared by both feet: the oxford is symmetric about x, so a
      // second copy would be the same buffer twice. (The trouser is NOT
      // symmetric — the outseam stripe runs down the outside — which is why
      // `leg` is still a pair.) gait.js only ever writes a shoe's mesh
      // position/rotation, never its geometry, so sharing is safe.
      shoe: copShoe(THREE, S),
      sleeve: [copSleeve(THREE, S, 1), copSleeve(THREE, S, -1)],
      fore: [1, -1].map((sd) => [copForearm(THREE, S, sd, 0), copForearm(THREE, S, sd, 1)]),
      belly: copBelly(THREE, S),
    },
    kid: {
      torso: kidTorso(THREE, S),
      head: kidHead(THREE, S),
      hair: [0, 1, 2, 3].map((k) => kidHair(THREE, S, k)),
      arm: [1, -1].map((sd) => [kidArm(THREE, S, sd, 0), kidArm(THREE, S, sd, 1)]),
      leg: [kidLeg(THREE, S, 1), kidLeg(THREE, S, -1)],
    },
    BUILDS,
  };
  return F;
}

// ===========================================================================
// TWO ASSERTIONS, BOTH REWRITTEN IN ROUND 5 BECAUSE BOTH WERE BLIND TO THE BUG
// THEY WERE WRITTEN FOR, AND BOTH NOW CARRY THEIR OWN FALSIFICATION SUITE.
// ===========================================================================
// Round 4 shipped these as "two derivations of one fact, made to say so out
// loud rather than agreeing by coincidence". They were wired, they ran, and a
// critic proved that neither tested its own proposition:
//
//   faceCheck  computed (frontmost_hit_z - feature_pole_z) and failed only when
//              that went NEGATIVE. Anything IN FRONT of a feature makes it
//              POSITIVE, so the entire occlusion class — the class the check
//              exists for — passed. Flattening a hairstyle into a slab 195 mm
//              over every face: ok, 0 bad. A fringe dropped 20/40/60/80/120 mm
//              over the eyes: output BYTE-IDENTICAL to baseline. Scaling the
//              skull in z by 1.15, which is literally the "grow the jaw radius"
//              input its own text named: zero movement. Two of its three named
//              falsifiers did not turn it red. (Worse than the critic said: a
//              BURIED feature also reads positive, because the thing burying it
//              is nearer the camera — so the round-4 bug that motivated the
//              check would not have tripped it either.)
//
//   carryCheck took the nearest vertex of the forearm bake to the derived fist.
//              A forearm is a 361 mm tube of vertices around that point, so
//              sliding the whole bake 150 mm DOWN ITS OWN AXIS moved the answer
//              12.0 -> 13.6 mm against a 30 mm threshold; it needed about 250
//              to fire. Changing 0.986 — the first input its docstring names —
//              could not turn it red.
//
// SO THE RULE THIS ROUND ADDS, AND IT IS NOW IN AGENTS_BRIEF: for every input
// an assertion names as a hazard, SHOW IT FAILING ON THAT INPUT. Both functions
// below take an optional `inj` describing a perturbation, and both are paired
// with a selfTest that runs every named input and asserts the check goes red on
// each one. A green selfTest is the only thing that makes a green check mean
// anything, and it is cheap enough to run at boot.

// ---------------------------------------------------------------------------
// faceCheck(THREE, F, inj) — IS THE FACE ON THE OUTSIDE OF THE HEAD, AND CAN
// YOU SEE IT?
// ---------------------------------------------------------------------------
// Two propositions now, because the old one silently tested neither:
//
//   OCCLUSION  fire a ray down -Z through the feature's own recorded pole and
//              require the frontmost surface to BE that pole. Too far forward
//              means something is in front of it — a fringe, a brim, a jaw that
//              grew, a skull scaled in z. Too far back means the pole is
//              hanging in space in front of its own mesh. Both are failures and
//              the test is TWO-SIDED, which is the entire fix.
//   RELIEF     ring of rays just outside the feature's own footprint, median
//              hit taken as "the surface around it". A feature that is flush
//              with its surroundings is as invisible as one that is buried, and
//              nothing in the old check could see the difference. Two clauses:
//              an absolute floor, and a fraction of what onFace() was ASKED to
//              stand proud — so a mount that grows underneath a feature whose
//              `proud` never changed still fires.
//
// The ring uses the MEDIAN rather than the min because neighbours are legally
// proud: the ring round an eye lands on its own socket and on the brow, and a
// min would be measuring the brow. It requires half the ring to hit something;
// a feature with no surface around it at all is its own failure and says so.
//
// Both propositions are re-derived against the BAKED buffer. onFace() computed
// where to put each feature; this asks the merged geometry — a different object
// arrived at by a different route — what actually got drawn.
//
// FALSIFIERS, and every one of them turns this red. See faceSelfTest().
//   slab    a hairstyle flattened into a solid plate in front of every face
//   fringe  a 20 mm bar dropped over both eyes (and 40/60/80/120)
//   skullZ  the skull scaled 1.15 in z under features that did not move
//   jaw     the jaw grown 6% under the mouth and lips
//   sink    every feature's proud reduced by 4 mm, i.e. "move a mouth back"
//   gone    the head collapsed to a point (the wired-at-all control)
const FACE_OCC_MM = 3.0;      // tolerable slack between a pole and its own tessellated surface
const FACE_REL_MM = 0.8;      // a feature flatter than this is not on the face
const FACE_REL_FRAC = 0.40;   // ...and it must keep this much of its authored proud
export function faceCheck(THREE, F, inj) {
  const J = inj || {};
  const bad = [], rows = [];
  const rc = new THREE.Raycaster();
  const dir = new THREE.Vector3(0, 0, -1), org = new THREE.Vector3();
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  // DoubleSide, and it matters: a FrontSide raycast through a merged buffer
  // misses any surface whose winding faces away, and half the reason to fire a
  // ray at all is to catch geometry that is not where the author thinks.
  const meshOf = (g, sz) => {
    const m = new THREE.Mesh(g, mat);
    if (sz) m.scale.set(sz[0], sz[1], sz[2]);
    m.updateMatrixWorld();
    return m;
  };
  // ---- the injections, all of them applied to the RAYCAST INPUT ------------
  // Nothing here mutates a shipped buffer. A slab or a fringe is an extra
  // target; a grown mount is a scaled clone; a sunk feature is a cloned buffer
  // with the vertices inside the feature's own footprint pushed back along its
  // normal. That last one is the only vertex-level edit and it is the only way
  // to model "somebody moved a feature 4 mm" honestly.
  const extra = [];
  if (J.slab != null) {
    const g = new THREE.BoxGeometry(0.40, 0.40, 0.02);
    g.translate(0, FIG.headY, J.slab);
    extra.push(meshOf(g));
  }
  if (J.fringe != null) {
    const g = new THREE.BoxGeometry(0.16, 0.030, 0.010);
    g.translate(0, FIG.headY + 0.026, 0.104 + J.fringe);
    extra.push(meshOf(g));
  }
  const sunk = (geo, probes, d) => {
    const g = geo.clone();
    const p = g.attributes.position;
    for (const q of probes) {
      const rr = Math.max(q.rx, q.ry) * 1.05;
      for (let i = 0; i < p.count; i++) {
        const dx = p.getX(i) - q.pole[0], dy = p.getY(i) - q.pole[1];
        if (dx * dx + dy * dy > rr * rr) continue;
        if (p.getZ(i) < q.pole[2] - 2.2 * q.proud - 0.004) continue;
        p.setZ(i, p.getZ(i) - d);
      }
    }
    p.needsUpdate = true;
    return g;
  };
  // "grow the jaw radius" — the mount comes forward and the features mounted on
  // it do NOT follow, which is round 4's bug exactly ("0.078 is not wrong; it is
  // wrong FOR A JAW OF rz 0.093"). Vertex-level, on the lower half of the head
  // only, so nothing above the mouth moves.
  const grown = (geo, k, f) => {
    const g = geo.clone();
    const p = g.attributes.position;
    const cy = FIG.headY - 0.058, cz = 0.008;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > cy + 0.030) continue;
      p.setZ(i, cz + (p.getZ(i) - cz) * f);
    }
    p.needsUpdate = true;
    return g;
  };
  // `fast` walks ONE head against ONE hairstyle instead of 3 x 9. It exists for
  // the self-test, which asks a question about the INSTRUMENT and not about the
  // roster: 27 identical answers cost 1.9 s at boot and told nobody anything.
  // The full cross-product is what faceCheck() itself runs, once, next to it.
  const nH = J.fast ? 1 : FACE_PROBES.length;
  for (let k = 0; k < nH; k++) {
    const probes = FACE_PROBES[k];
    if (!probes || !probes.length) { bad.push('head ' + k + ' registered no face probes'); continue; }
    let hg = F.head[k];
    if (J.sink) hg = sunk(hg, probes, J.sink);
    if (J.jaw) hg = grown(hg, k, J.jaw);
    const head = meshOf(hg, J.gone ? [1e-3, 1e-3, 1e-3]
      : J.skullZ ? [1, 1, J.skullZ] : null);
    const nJ = J.fast ? 1 : F.hair.length;
    for (let j = 0; j < nJ; j++) {
      const targets = [head, meshOf(F.hair[j]), ...extra];
      for (const q of probes) {
        const px = q.pole[0], py = q.pole[1];
        const shoot = (x, y) => {
          org.set(x, y, 1.0); rc.set(org, dir);
          const hit = rc.intersectObjects(targets, false)[0];
          return hit ? hit.point.z : null;
        };
        const got = shoot(px, py);
        const want = q.pole[2];
        const occ = got == null ? -999 : +((got - want) * 1000).toFixed(2);
        // ---- RELIEF: HOW FAR THE DRAWN FEATURE STANDS OFF ITS OWN MOUNT -----
        // A feature that is flush is as invisible as one that is buried, and
        // `occ` cannot see the difference: sink every feature 4 mm and its pole
        // sinks with it, so the frontmost hit is still the feature and occ stays
        // at zero. This is the clause that catches "move a mouth back 4 mm".
        //
        // A NEGATIVE RESULT, KEPT NEXT TO THE CODE IT REPLACED. The first two
        // versions of this measured the feature against a RING of rays just
        // outside its own footprint, and both were junk:
        //   raw z round the ring       every feature read 30-80 mm proud,
        //                              because a 100 mm skull drops 10 mm
        //                              across a 45 mm ring. It measured the
        //                              head's curvature.
        //   ring height above the mount  cancels the curvature and then reads
        //                              8-14 mm against authored prouds of
        //                              1.5-6.0, because the SKULL's own facet
        //                              sag is up to 7 mm (seg 10 / rseg 6 on a
        //                              93-104 mm radius) and the feature balls'
        //                              is 0.3. The sag does not cancel, it is
        //                              the whole signal, and no quantile of the
        //                              ring fixes that — swept 0.0/0.1/0.2/0.3
        //                              and the floor moved 11.4 -> 6.3 mm while
        //                              the thing being measured is 1.5.
        // So the ring is gone. The mount surface is ANALYTIC — surfZ(E) — and a
        // hit measured against it carries no tessellation floor at all. One
        // raycast per feature instead of seventeen, and it resolves the
        // millimetre the ring could not.
        const sZ = surfZ(q.E, px, py);
        const rel = (got == null || sZ == null) ? -999 : +((got - sZ) * 1000).toFixed(2);
        const proudMM = q.proud * 1000;
        const need = Math.max(FACE_REL_MM, proudMM * FACE_REL_FRAC);
        // A feature may legally be covered by ANOTHER recorded feature standing
        // prouder in the same footprint — the eye sits 3.5 mm in front of its
        // own socket on every head in the game, and a check that called that a
        // bug would be crying wolf 54 times at boot. So the occlusion tolerance
        // carries the prouder neighbour's own overhang, and nothing else.
        let tol = FACE_OCC_MM;
        for (const o of probes) {
          if (o === q) continue;
          const dx = o.pole[0] - px, dy = o.pole[1] - py;
          if (dx * dx + dy * dy > Math.max(o.rx, o.ry) * Math.max(o.rx, o.ry)) continue;
          const over = (o.proud - q.proud) * 1000;
          if (over > tol - FACE_OCC_MM) tol = FACE_OCC_MM + over;
        }
        const why = [];
        if (got == null) why.push('no surface at all in its own column');
        else if (occ > tol) {
          why.push('something is ' + occ.toFixed(1) + ' mm IN FRONT of it (tol '
            + tol.toFixed(1) + ')');
        } else if (occ < -0.6) {
          why.push('its pole hangs ' + (-occ).toFixed(1) + ' mm in front of its own mesh');
        }
        if (sZ == null) why.push('its pole is not over its own mount surface at all');
        else if (rel < need) {
          why.push('it is drawn only ' + rel.toFixed(1) + ' mm proud of its own mount, '
            + 'against ' + need.toFixed(1) + ' needed (authored proud '
            + proudMM.toFixed(1) + ' mm)');
        }
        if (why.length) {
          bad.push('head ' + k + ' hair ' + j + ': ' + q.tag + ' — ' + why.join('; '));
        }
        rows.push({ head: k, hair: j, tag: q.tag, occ, rel, need: +need.toFixed(2),
          tol: +tol.toFixed(2), proudMM: +proudMM.toFixed(2) });
      }
    }
  }
  const wOcc = rows.reduce((a, r) => (r.occ > a.occ ? r : a), rows[0] || { occ: 0 });
  const wRel = rows.reduce((a, r) => (r.rel - r.need < a.rel - a.need ? r : a), rows[0] || { rel: 0, need: 0 });
  return {
    ok: bad.length === 0, bad, n: rows.length, rows,
    // The two numbers to watch, and they point in OPPOSITE directions on
    // purpose: worstOccMM is how much geometry is in front of the most covered
    // feature, worstReliefMM is how flat the flattest one is.
    worstOccMM: +wOcc.occ.toFixed(2), worstOccAt: wOcc,
    worstReliefMM: +wRel.rel.toFixed(2), worstReliefAt: wRel,
    inj: inj || null,
  };
}

// Every input the docstring above names, run, with the result of running it.
// `ok` is true when ALL of them turned the check red — a falsifier that does
// not fire is a bug in the instrument, and it is reported as one.
export function faceSelfTest(THREE, F) {
  const cases = [
    ['baseline (must PASS)', null, false],
    ['slab: a hairstyle flattened to a plate at z=+0.30', { slab: 0.30 }, true],
    ['fringe 20 mm over both eyes', { fringe: 0.020 }, true],
    ['fringe 40 mm', { fringe: 0.040 }, true],
    ['fringe 60 mm', { fringe: 0.060 }, true],
    ['fringe 80 mm', { fringe: 0.080 }, true],
    ['fringe 120 mm', { fringe: 0.120 }, true],
    ['skull scaled 1.15 in z under fixed features', { skullZ: 1.15 }, true],
    ['jaw grown 6% under the mouth', { jaw: 1.06 }, true],
    ['every feature sunk 4 mm ("move a mouth back")', { sink: 0.004 }, true],
    ['every feature sunk 2 mm', { sink: 0.002 }, true],
    ['head collapsed to a point', { gone: 1 }, true],
  ];
  const rows = [], bad = [];
  for (const [name, inj, wantRed] of cases) {
    const r = faceCheck(THREE, F, { ...(inj || {}), fast: true });
    const red = !r.ok;
    rows.push({ input: name, red, nBad: r.bad.length,
      worstOccMM: r.worstOccMM, worstReliefMM: r.worstReliefMM,
      first: r.bad[0] ? r.bad[0].slice(0, 110) : null });
    if (red !== wantRed) {
      bad.push('faceCheck is BLIND to "' + name + '": it stayed '
        + (red ? 'red' : 'GREEN') + ' when it should have gone '
        + (wantRed ? 'red' : 'green') + '. An assertion that cannot fail on an '
        + 'input its own docstring names is decoration — see AGENTS_BRIEF.');
    }
  }
  return { ok: bad.length === 0, bad, rows };
}

// ---------------------------------------------------------------------------
// carryCheck(F, inj) — DOES THE BASKET STILL HANG OFF THE FIST?
// ---------------------------------------------------------------------------
// makePerson's `carry` group re-derives the fist from SH_ARM: `B.fore.at(0.986)`
// taken into elbow-local space and scaled by the arm's own mesh scale. That is
// a SECOND copy of where the hand is; the first is the hand shopperHand() bakes
// into the forearm buffer. Round 3's note said so and left it: "if someone
// moves the hand without moving B.fore.at(0.986) the basket detaches silently."
//
// THREE RESIDUALS, BECAUSE ONE WAS BLIND ALONG THE ARM. Round 4 measured only
// the nearest vertex, and a forearm is a tube of vertices around the axis, so
// the one direction the fist can slide without ever leaving that tube was the
// one direction the check could not see.
//
//   axMM   how far along the forearm axis the derived fist sits BEHIND the
//          bake's own distal extreme (the fingertip). A hand is about 95 mm
//          from palm heel to fingertip, so the fist belongs in a band inside
//          that. This is the residual that catches 0.986, ELB_F, the fingertip
//          and an axial slide of the whole bake.
//   latMM  how far the fist sits off the bake's own centreline AT ITS OWN
//          STATION — the centroid of every vertex in a +/-15 mm slab. This is
//          the residual that catches a lateral slide, and it is deliberately
//          separate from axMM so the two cannot mask each other.
//   nearMM round 4's nearest-vertex distance, kept: it is the scalar the
//          original note asked for and it is still the honest summary of "the
//          two derivations have parted company".
//
// FALSIFIERS, and every one of them turns this red. See carrySelfTest().
//   slideAx   the bake slid 150 mm (and 40, and 20) down its own axis
//   slideLat  the bake slid 35 mm across it
//   t         0.986 -> 0.900, the first constant the docstring names
//   elbF      ELB_F 0.45 -> 0.50
//   tipY      SH_ARM's fingertip -0.660 -> -0.620
//   fingers   fing()'s three t0 values pushed 25 mm down the arm
// THE THREE TOLERANCES, WITH THEIR MEASURED BASELINES AND THEIR MARGINS, so
// nobody has to re-derive whether a green row means anything:
//   axMM   nominal +4.63 mm, identical on all four rows, tol +/-8. It FIRES AT
//          8 mm of axial movement in either direction; round 4's needed about
//          250. The nominal is not zero and is not meant to be: shopperHand's
//          middle-finger cap ball ends 4.6 mm short of the fingertip SH_ARM
//          names, so 0.986 lands just past the drawn tip. That 4.6 is a FACT
//          ABOUT THE BAKE and the assertion is that it does not move.
//   latMM  nominal 13.94 / 13.81, tol 20 -> fires at about 15 mm of lateral
//          slide. Not zero for the same kind of reason: the cross-section at
//          the fingertips is three fingers and a thumb, and its centroid is not
//          on the middle finger's axis.
//   nearMM nominal 11.97 / 12.00, tol 30. Round 4's residual, kept.
// All three are static functions of the bake — they do not drift between runs,
// they move only when somebody edits one of the constants they are watching,
// which is the whole point of an assertion.
const CARRY_AX_NOM = 4.63, CARRY_AX_TOL = 8;  // mm along the forearm axis
const CARRY_LAT_MM = 20;                      // mm off the hand's own centreline
const CARRY_NEAR_MM = 30;                     // mm to the nearest vertex — half a fist
export function carryCheck(F, inj) {
  const J = inj || {};
  const bad = [], rows = [];
  for (const side of [1, -1]) {
    // The fist, re-derived. ELB_F and the fingertip are injectable because they
    // are the two numbers that move it without moving the bake.
    const B = J.elbF != null || J.tipY != null
      ? armBonesWith(J.elbF, side, -0.020, side * 0.008, J.tipY != null ? J.tipY : -0.660,
        0.010, 1, SH_ELB_OUT)
      : SH_ARM(side);
    const t = J.t != null ? J.t : 0.986;
    const h = B.fore.at(t);
    // Elbow-local, which is the frame the fore half is baked in.
    const hx = h[0] - B.el[0], hy = h[1] - B.el[1], hz = h[2] - B.el[2];
    const L = B.fore.len;
    const ux = (B.tip[0] - B.el[0]) / L, uy = (B.tip[1] - B.el[1]) / L, uz = (B.tip[2] - B.el[2]) / L;
    // ...and one axis across it, for the lateral injection.
    const ax = B.fore.pt(0, 1, 0);
    const lx = ax[0] - B.el[0], ly = ax[1] - B.el[1], lz = ax[2] - B.el[2];
    for (let long = 0; long < 2; long++) {
      // makePerson hangs the bag off armL when bag.side > 0 and armR otherwise,
      // and both of those are `fore[sleeve][side>0?0:1][1]` — the FORE half,
      // which is the one carrying the hand on both sleeve lengths.
      const g = F.fore[long][side > 0 ? 0 : 1][1];
      const pos = g.attributes.position;
      // Injections that move the BAKE rather than the derivation.
      const sa = J.slideAx || 0, sl = J.slideLat || 0;
      const dxi = ux * sa + lx * sl, dyi = uy * sa + ly * sl, dzi = uz * sa + lz * sl;
      let best = 1e9, sTip = -1e9;
      const acc = { n: 0, x: 0, y: 0, z: 0 };
      const sFist = hx * ux + hy * uy + hz * uz;
      for (let i = 0; i < pos.count; i++) {
        let vx = pos.getX(i) + dxi, vy = pos.getY(i) + dyi, vz = pos.getZ(i) + dzi;
        // fing(): the three finger masses live past t=0.80, so pushing only
        // those down the axis is exactly "somebody edited fing()'s t0".
        if (J.fingers && (pos.getX(i) * ux + pos.getY(i) * uy + pos.getZ(i) * uz) > L * 0.80) {
          vx += ux * J.fingers; vy += uy * J.fingers; vz += uz * J.fingers;
        }
        const d = Math.hypot(vx - hx, vy - hy, vz - hz);
        if (d < best) best = d;
        const s = vx * ux + vy * uy + vz * uz;
        if (s > sTip) sTip = s;
        if (Math.abs(s - sFist) < 0.015) { acc.n++; acc.x += vx; acc.y += vy; acc.z += vz; }
      }
      const nearMM = +(best * 1000).toFixed(2);
      const axMM = +((sFist - sTip) * 1000).toFixed(2);
      let latMM = null;
      if (acc.n) {
        const cx = acc.x / acc.n - hx, cy = acc.y / acc.n - hy, cz = acc.z / acc.n - hz;
        const along = cx * ux + cy * uy + cz * uz;
        latMM = +(Math.hypot(cx - along * ux, cy - along * uy, cz - along * uz) * 1000).toFixed(2);
      }
      const why = [];
      if (Math.abs(axMM - CARRY_AX_NOM) > CARRY_AX_TOL) {
        why.push('it sits ' + axMM.toFixed(1) + ' mm from the bake\'s own distal extreme ALONG '
          + 'THE FOREARM AXIS, against a baked ' + CARRY_AX_NOM + ' (tol +/-' + CARRY_AX_TOL
          + '). This is the direction round 4 could '
          + 'not see: a forearm is a tube of vertices around this point, so the nearest-vertex '
          + 'residual barely moves when the two derivations slide past each other');
      }
      if (latMM == null) why.push('no hand vertices at its own station at all');
      else if (latMM > CARRY_LAT_MM) {
        why.push('it is ' + latMM.toFixed(1) + ' mm off the hand\'s own centreline (tol '
          + CARRY_LAT_MM + ')');
      }
      if (nearMM > CARRY_NEAR_MM) {
        why.push('its nearest baked vertex is ' + nearMM.toFixed(1) + ' mm away (tol '
          + CARRY_NEAR_MM + ')');
      }
      if (why.length) {
        bad.push('carry: the fist SH_ARM(' + side + ').fore.at(' + t + ') derives — sleeve '
          + (long ? 'long' : 'short') + ' — ' + why.join('; ')
          + '. Either shopperHand moved or 0.986 did, and makePerson\'s carry override '
          + 'will hang the basket in mid air.');
      }
      rows.push({ side, long, axMM, latMM, nearMM,
        at: [+h[0].toFixed(4), +h[1].toFixed(4), +h[2].toFixed(4)] });
    }
  }
  return {
    ok: bad.length === 0, bad, rows,
    worstAxMM: rows.reduce((a, r) => (Math.abs(r.axMM - CARRY_AX_NOM)
      > Math.abs(a - CARRY_AX_NOM) ? r.axMM : a), rows[0].axMM),
    worstLatMM: rows.reduce((a, r) => Math.max(a, r.latMM == null ? 999 : r.latMM), 0),
    worstNearMM: rows.reduce((a, r) => Math.max(a, r.nearMM), 0),
    inj: inj || null,
  };
}
// armBones with ELB_F overridden, for the falsifier that names it. It is a copy
// of four lines rather than a parameter on armBones, deliberately: ELB_F is a
// constant everything in this file shares and giving it a live override would
// be exactly the shadow-block hazard CLAUDE.md keeps a section about. This one
// is reachable only from carryCheck's own self-test.
function armBonesWith(elbF, side, shoulderY, tipX, tipY, tipZ, scale, out) {
  const f = elbF == null ? ELB_F : elbF;
  const k = scale == null ? 1 : scale;
  const eo = out == null ? ELB_OUT * k : out;
  const sh = [0, shoulderY, 0];
  const tip = [tipX, tipY, tipZ];
  const el = [tipX * f + side * eo, shoulderY + (tipY - shoulderY) * f, tipZ * f - ELB_BACK * k];
  return { sh, el, tip, upper: limbSeg(sh, el), fore: limbSeg(el, tip) };
}

export function carrySelfTest(F) {
  const cases = [
    ['baseline (must PASS)', null, false],
    ['bake slid 150 mm down its own axis', { slideAx: -0.150 }, true],
    ['bake slid 40 mm down its own axis', { slideAx: -0.040 }, true],
    ['bake slid 20 mm down its own axis', { slideAx: -0.020 }, true],
    ['bake slid 35 mm laterally', { slideLat: 0.035 }, true],
    ['bake slid 20 mm laterally', { slideLat: 0.020 }, true],
    ['0.986 -> 0.900', { t: 0.900 }, true],
    ['0.986 -> 0.930', { t: 0.930 }, true],
    // ...and the floor, published rather than hidden. These three are the
    // largest perturbations the check does NOT catch, which is the number a
    // critic actually needs: it is 17 mm axial and 18 mm lateral, against the
    // 250 mm and 35 mm round 4 shipped.
    ['0.986 -> 0.970 (BELOW the floor, must pass)', { t: 0.970 }, false],
    ['bake slid 5 mm down its axis (BELOW the floor, must pass)', { slideAx: -0.005 }, false],
    ['bake slid 10 mm laterally (BELOW the floor, must pass)', { slideLat: 0.010 }, false],
    ['ELB_F 0.45 -> 0.50', { elbF: 0.50 }, true],
    ['SH_ARM fingertip -0.660 -> -0.620', { tipY: -0.620 }, true],
    ['fing() t0 pushed 25 mm down the arm', { fingers: -0.025 }, true],
  ];
  const rows = [], bad = [];
  for (const [name, inj, wantRed] of cases) {
    const r = carryCheck(F, inj);
    const red = !r.ok;
    rows.push({ input: name, red, nBad: r.bad.length,
      axMM: r.rows[0].axMM, latMM: r.rows[0].latMM, nearMM: r.rows[0].nearMM });
    if (red !== wantRed) {
      bad.push('carryCheck is BLIND to "' + name + '": it stayed '
        + (red ? 'red' : 'GREEN') + ' when it should have gone '
        + (wantRed ? 'red' : 'green') + '.');
    }
  }
  return { ok: bad.length === 0, bad, rows };
}

// ===========================================================================
// ROUND 9 — THE POSE PERSONALITY, AND WHY IT IS ROLLED HERE OF ALL PLACES
// ===========================================================================
// The cop builder handed this round its brief and it was not about geometry:
//
//   "They now have varied builds, ages, heights, hairstyles, sleeve lengths,
//    shoes and hands — but they still share ONE POSE VOCABULARY. Fourteen
//    people idle identically, hold a cart identically, and reach for a shelf
//    identically, and that reads as clones far more than the geometry does."
//
// Which is correct, and the render agreed: nine bodies in an aisle, every one
// of them in `walk+cart`, every one with both arms out at exactly -0.95 rad
// like a row of forklifts. The fix is a per-person table of numbers, and the
// only interesting question was WHERE TO ROLL IT.
//
// IT IS ROLLED HERE, IN rollPerson, AND THAT IS A CORRECTNESS DECISION RATHER
// THAN A TIDINESS ONE. agents.js is driven by one seeded stream and every
// number in that file's header was measured against it; CLAUDE.md's standing
// warning is that even swapping a rolled call for a named one walked the stream
// and moved a measured compliance rate by five points without touching a single
// probability. So a gait roll in resetShopper() — the obvious place — would
// have shifted every chase, every balk and every announcement in the bench, and
// the round would have had to argue that a 3-point move was noise.
//
// rollPerson is the one roller in this game that CANNOT do that. It is reached
// only from makeShopper, makeShopper is reached only from the
// `while (shoppers.length < K.shopperCount)` line in reset(), and that loop is
// a no-op after the fourteenth body exists — which happens once, at module
// construction, before bench() ever calls setSeed(). Draws added here are free.
// Measured, not assumed: every field of bench(n=100) is byte-identical across
// this change. See the ablation table in agents.js.
//
// The second reason is that it is TRUE. How a man walks is not a property of
// this shift. It belongs to him, the way his hair colour does, and it should
// survive a reset for the same reason his hair colour does.
//
// AND THE THIRD, WHICH IS THE ONE THE WHOLE GAME RESTS ON: guilt is dealt out
// fresh at every reset() over the same fourteen indices, uniformly, by code
// that has never seen a pose. A gait, an idle repertoire, a way of holding a
// cart and a child are therefore INDEPENDENT of guilt by construction — not by
// a promise in a comment, but because the two are rolled by different code at
// different times from different seeds. There is no tuning pass anybody can do
// to this table that makes a thief walk differently, because the table does not
// know which of these people is a thief and it is not there when it is decided.
// ---------------------------------------------------------------------------
// THE IDLE POOL. Seven, and every one of them is something a person does while
// standing in a supermarket doing nothing.
//   0 hip     weight on one hip, one hand resting on it
//   1 fold    arms folded across the chest
//   2 phone   both hands up at chest height, chin down, reading it
//   3 pocket  hands in pockets, shoulders up round the ears
//   4 lean    forearms down on the cart bar, hips back off it   (cart only)
//   5 shelf   one hand flat on the shelf lip, head into the shelf
//   6 rock    arms at the sides, weight rocking foot to foot
// A person gets two or three of them and cycles, so the crowd is not a set of
// fourteen statues in fourteen fixed poses either — which was the failure mode
// the first version of this shipped and it looked worse than the clones did.
const IDLE_POOL = [0, 1, 2, 3, 4, 5, 6];

function rollPose(rng, age, build) {
  const { rr, ri, rnd } = rng;
  // ROUND 11 — BUILDS grew from four entries to six, so this index moved.
  // The old `build >= 2` meant "stock or heavy"; the two heavy builds are now
  // 4 and 5. Left as >= it was and the pear and the regular build would have
  // inherited a heavy man's stride tax, which is exactly the class of silent
  // off-by-one CLAUDE.md keeps a section about.
  const heavy = build >= 4;
  const old = age === 'old';
  // Two or three idles per person, no repeats. A shuffle would cost more draws
  // than it is worth for a seven-long list; reject-and-retry is fine at n=3.
  const idles = [];
  for (let k = 0; k < 40 && idles.length < (rnd() < 0.55 ? 3 : 2); k++) {
    const c = IDLE_POOL[ri(0, IDLE_POOL.length - 1)];
    if (!idles.includes(c)) idles.push(c);
  }
  if (!idles.length) idles.push(6);
  return {
    // ---- gait. Stride is the one that reads first, because it sets CADENCE:
    // at a fixed walking speed a short stride is a fast, busy little walk and a
    // long one is a lope, and two people crossing an aisle at the same speed
    // with different cadences is the single strongest cue that they are not the
    // same animation. Heavy bodies get a short stride and a big roll.
    stride: rr(0.80, 1.18) * (heavy ? 0.90 : 1) * (old ? 0.88 : 1),
    amp: rr(0.80, 1.24) * (old ? 0.82 : 1),          // how far the legs swing
    bounce: rr(0.55, 1.55) * (heavy ? 1.25 : 1),      // vertical, per step
    roll: rr(0.45, 1.70) * (heavy ? 1.45 : 1),        // hip yaw + shoulder counter
    swing: rr(0.50, 1.40) * (old ? 0.6 : 1),          // free-arm swing
    lag: rr(0.28, 0.66),                              // arm phase behind the leg
    // ROUND 12 — HALVED. This is the WALKING splay (the free arm on a one-handed
    // cart push, and the idle poses); `splayL/R` in rollPerson is the standing
    // one. Both were throwing the elbow out into the waist taper — see the block
    // over shopperSleeve — and a heavy body gets its clearance from a wider
    // deltoid now rather than from an abducted shoulder.
    splay: rr(0.020, 0.070) + (heavy ? 0.045 : 0),    // arms carried away from the body
    toe: rr(-0.10, 0.20),                             // toe-out, in radians
    // ---- the cart. 0 two hands, 1 right only, 2 left only, 3 leaning on the
    // bar, 4 pushed out ahead at arm's length.
    cart: [0, 0, 0, 1, 1, 2, 3, 4][ri(0, 7)],
    cartD: rr(0.50, 0.90),                            // how far out front he pushes it
    // ---- idles
    idles,
    idleHold: rr(3.4, 7.6),                           // seconds before he shifts
    idlePh: rr(0, 20),                                // where in the cycle he starts
    fidget: rr(0.55, 1.55),                           // how much he moves while idle
    // ---- browsing. 0 reach up at the shelf, 1 hand flat on the shelf lip,
    // 2 both hands up in front reading something.
    browse: [0, 0, 1, 1, 1, 2][ri(0, 5)],
    hipSide: rnd() < 0.5 ? 1 : -1,                    // which hip he pops
  };
}

// ---------------------------------------------------------------------------
// Roll a shopper. The critic's complaint was that they looked like "the same
// person recoloured", and a colour roll is exactly what the old one was: two
// numbers of variation (girth, height) and four palettes. This rolls a BUILD,
// an AGE and a SILHOUETTE, and the palettes follow from them — a senior gets
// grey hair and a stoop and a longer coat, a slim young one gets a tee and
// trainers. Height spread is 1.53 m to 1.83 m, which is a real crowd.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ROUND 11 — WHAT VARIES, AND WHY IT VARIES HERE.
//
// The round-10 roster was six numbers: build (of four), height, girth, age,
// stoop and a set of palettes. Two of those six are SIZE and four are colour,
// so the crowd was one shape at fourteen sizes in fourteen colourways. The
// fields below are the ones a real crowd differs in, and every one of them is
// applied as a group scale, a pivot offset or a rest angle in makePerson — no
// per-person geometry, no per-person bake, nothing the bakery has to know
// about.
//
//   legF        FRACTION OF STATURE AT THE HIP. 0.487-0.548 against round 10's
//               flat 0.521. This is the one that changes a body most for the
//               least: at the same height, "long legs, short trunk" and "short
//               legs, long trunk" are two different people, and the game had
//               neither because it had only the mean. Stature is renormalised
//               afterwards so the tape measure still reads what was rolled.
//   torsoW/D    trunk width and DEPTH, independently. Round 10 scaled x and z
//               by one number, so nobody could be broad-and-flat or narrow-and-
//               deep — and a barrel-chested man and a wide-shouldered one are
//               the same thing under a single girth multiplier.
//   shoulderW   where the arms hang from, off the build's own `sw`.
//   armLen/Thk  reach and arm mass. `armLen` goes onto the RIG, not just the
//               mesh, because animateShopper solves a held prop's position from
//               it — see the note there.
//   stanceW     how far apart the feet are. A heavy body stands wide; this is
//               in the brief in those words, and it costs one pivot offset.
//   neckDy/Z    how much neck shows, and how far FORWARD the head sits. The
//               second one is the whole read of age at a distance: an older
//               body's ear is ahead of its shoulder, and that plus the build's
//               kyphosis is worth more than any amount of grey hair.
//   headSize    heads are not a fixed fraction of stature either.
//
// ...and the asymmetry set, which is the lead's first note off the reference
// photographs — "nobody in that photograph is symmetric, not one person":
//   wSide       which leg the weight is on
//   contra      how much contrapposto: hip up on the weighted side, opposite
//               shoulder down. Real, and free: two rest angles.
//   footFwd     one foot in front of the other, because nobody stands square
//   toeL/toeR   INDEPENDENT turnout per foot, where round 10 mirrored one value
//   splayL/R    likewise for the arms, which used to hang at +-P.splay exactly
//   headTilt    a few degrees of roll on the neck
//
// NONE OF IT KNOWS ABOUT GUILT, and cannot: guilt is dealt out fresh at every
// reset() over the same fourteen indices by code that has never seen a person
// description, and this function runs once, at construction, before the first
// setSeed(). Round 9's argument in full is above rollPose and it is unchanged;
// round 11 adds ~20 draws to it and re-proves the claim the same way, by
// byte-comparing a bench across the change.
export function rollPerson(rng) {
  const { rr, ri, pick, rnd } = rng;
  const bi = ri(0, BUILDS.length - 1);
  const age = rnd() < 0.20 ? 'old' : rnd() < 0.22 ? 'young' : 'adult';
  const tall = age === 'young' ? rr(0.93, 1.04) : rr(0.94, 1.11);
  const long = rnd() < 0.45;
  let hair = ri(0, 8);
  if (age === 'old' && rnd() < 0.55) hair = 3;
  // CLOTH carries two beiges (0xbfa89b, 0xd9b8a0) that are within a few points
  // of two of the skin tones, and when a person rolls both plus `plain` they
  // come out looking naked from the waist up. Re-roll the shirt off the skin.
  const skin = pick(SKIN);
  const near = (a, b) => Math.abs((a >> 16 & 255) - (b >> 16 & 255))
    + Math.abs((a >> 8 & 255) - (b >> 8 & 255)) + Math.abs((a & 255) - (b & 255));
  // ROUND 12 — THE BAR WAS TOO LOW AND THE LOOP COULD LOSE. A critic found body
  // 11 clearing this at 116 and reading BARE-CHESTED at 2 m, which is right:
  // 116 summed over three channels is 39 points a channel, and the two beiges
  // in CLOTH sit that close to two of the SKIN tones by construction. 150.
  //
  // ...and a threshold with a bounded retry is a threshold that sometimes
  // fails. At 150 the worst skin tone has 5 of 14 cloths clear of it, so six
  // rejections land a naked-looking body about 7% of the time it comes up —
  // once every couple of rosters, which is exactly often enough to ship. The
  // loop keeps its shape — up to six re-draws, the same bounded retry round 11
  // wrote — and then falls back DETERMINISTICALLY to the furthest cloth from
  // that skin, which draws nothing and cannot fail. Raising the bar does change
  // how many draws the loop spends, so the SHIPPED ROSTER moves; every bench
  // setSeed()s first and re-rolls nobody, so none of them do. Verified by
  // running them, not by asserting it.
  let shirt = pick(CLOTH);
  for (let k = 0; k < 6 && near(shirt, skin) < 150; k++) shirt = pick(CLOTH);
  if (near(shirt, skin) < 150) {
    for (const c of CLOTH) if (near(c, skin) > near(shirt, skin)) shirt = c;
  }
  const pants = pick(PANTS);
  // ROUND 9 — a bag on about two in five, in one of three carries. See
  // shopperBag: this exists because two clips in decoy.js reach into luggage,
  // and it is UNGATED on purpose — nothing anywhere asks whether a person has a
  // bag before letting them play a bag clip, because that gate is the tell.
  const bagRoll = rnd();
  // ...and a child on about one body in four. `mode` is what the kid is doing,
  // not who the parent is: a cart seat, a kid trailing two paces back, or the
  // one every parent in the world recognises — the one that stops dead in front
  // of something and has to be come back for.
  // TWO ROLLS, NOT ONE, and the first build's single roll is why. Slicing
  // `kidRoll < 0.26` into three bands entangles WHETHER a body has a child with
  // WHAT the child does, and on the one seed this game actually ships
  // (setSeed(20240822) at construction) that came out as five children, all
  // five of them trailing, and not one in a cart seat. The roster is fourteen
  // bodies rolled once — it is not a distribution the player ever samples twice
  // — so a correlation that averages out over 4,000 draws can still hand the
  // shipped store a crowd with a third of this feature missing from it.
  const kidRoll = rnd();
  const kidMode = rnd();
  const kid = kidRoll < 0.26 ? {
    mode: kidMode < 0.34 ? 'seat' : 'walk',
    height: rr(0.86, 1.12),                 // 0.95 m to 1.24 m
    skin,                                    // the parent's, which is the point
    hair: age === 'old' ? pick(HAIR) : pick(HAIR),
    // ROUND 10 — children's own palettes. Same single pick() off the same
    // stream, pointed at a different array, so no draw count moved. See
    // KIDCLOTH: this is the only part of the child rig that reads at 20 px.
    shirt: pick(KIDCLOTH),
    pants: pick(KIDPANTS),
    hairStyle: ri(0, 3),
    // Gait: a child's legs are half the length of an adult's, so at the same
    // ground speed the cadence is roughly double. That difference is visible at
    // CCTV scale even when the body is eight pixels tall — it is MOVEMENT rate,
    // and movement survives resolution long after shape stops.
    stride: rr(0.44, 0.62),
    amp: rr(1.05, 1.45),
    swing: rr(0.9, 1.7),
    // How the follow behaves. `side` is which flank of the parent it walks on,
    // `weave` is how badly it fails to walk in a straight line, `lagT` is how
    // far back it trails, `stopEvery`/`stopFor` are the anchor.
    side: rnd() < 0.5 ? 1 : -1,
    weave: rr(0.25, 0.62),
    weaveHz: rr(0.22, 0.46),
    lagT: rr(0.75, 1.55),
    // THE ANCHOR IS A DIAL, NOT A THIRD MODE, and that was the second thing the
    // shipped seed taught. As a mode it was rolled at 7% and the fourteen-body
    // roster simply did not contain one, so the best behaviour in the feature —
    // the child that stops dead in front of something and has to be come back
    // for — was in the file and not in the game. Every walking child now does
    // it; the only question is how often, and at the top of this range it is
    // once a minute, which is a child who is broadly co-operative.
    stopEvery: rr(7.0, 46.0),
    stopFor: rr(1.6, 3.6),
    phase: rr(0, 12),
  } : null;
  // Four carries, and a side for each. The basket is the one that puts a LOAD
  // on a body — see makePerson, where it buys a lean. Hoisted out of the return
  // literal this round because two fields below now have to READ it: which leg
  // the weight is on, and whether this body has a trolley at all.
  // ROUND 3 (character) — A HAND LOAD IS ALWAYS IN THE LEFT HAND, and the roll
  // that used to decide it is STILL MADE (`sideRoll`) so that the shipped
  // roster — every height, build, hairstyle and child after this line — is
  // byte-identical to round 12's. Dropping the draw would have re-rolled the
  // whole crowd for a cosmetic decision, which is the trap this file's header
  // spends a paragraph on.
  //
  // WHY LEFT: agents.js reaches with `armR` and only with armR — every browse
  // style, every clip, the prop solve and the bird are all the right arm. So
  // every person in this store is right-handed by construction, and a
  // right-handed person carries the basket in the other hand. Once that is
  // true, "a loaded arm does not fold and does not reach" can be enforced on
  // armL alone, where it collides with nothing (see animateShopper's carry
  // clamp). With the load on the right it would have had to fight the reach,
  // and a shopper who takes a facing off a shelf without extending his arm is a
  // worse frame than the one this round is fixing.
  //
  // THE COST, said out loud: round 11 baked both sides specifically so that not
  // everybody wore their bag on the same shoulder, and kinds 2 and 3 — 22% of
  // the crowd — now do. Straps (kinds 0 and 1) keep both sides, so 24% of the
  // crowd is still split. The -1 bakes for 2 and 3 are kept rather than deleted
  // because nothing about this is a law of nature: if a later round makes the
  // reach arm a per-person property, this line is the only thing to undo.
  //
  // AND THE DRAW STAYS INSIDE THE TERNARY. The first cut of this hoisted
  // `sideRoll` and `bagKind` to the top of the block, which reads better and is
  // wrong: the old literal only evaluated `rnd()` and `pick(CLOTH)` WHEN THERE
  // WAS A BAG, so a hoisted draw costs one extra rnd() on the eight bodies in
  // fourteen that have none, and every roll after it — build, height, pose,
  // child — walks. That is this file's own standing warning (see the rollPose
  // header) and it caught the person who wrote the warning. It showed up as one
  // trial in two hundred moving in benchBird, which is exactly how small a
  // stream shift looks before you go looking for it.
  let bag = null;
  if (bagRoll < 0.46) {
    const kind = bagRoll < 0.14 ? 0 : bagRoll < 0.24 ? 1 : bagRoll < 0.35 ? 2 : 3;
    const sideRoll = rnd() < 0.5 ? 1 : -1;
    bag = { kind, side: kind >= 2 ? 1 : sideRoll, color: pick(CLOTH) };
  }
  // A HAND load: a carrier bag or a shopping basket, held down at one side. A
  // shoulder bag or a crossbody is strapped on and weighs nothing worth leaning
  // against, which is why kind >= 2 is the test everywhere it appears.
  const handLoad = !!bag && bag.kind >= 2;
  const wRoll = rnd() < 0.5 ? 1 : -1;
  // ---- ROUND 12: NOT EVERYBODY HAS A TROLLEY --------------------------------
  // 14 of 14 shoppers pushed a cart in every reset, and a cart pins BOTH ARMS
  // TO A HANDLE at a fixed angle: the highest-traffic pose in the game was also
  // the one with the least in it, and a crowd of fourteen forklifts is what the
  // reference photographs are least like. Every one of the eight has more
  // people carrying than pushing.
  //
  // It is rolled HERE, at construction, and not in resetShopper(), for the
  // reason this file's header gives at length: resetShopper runs inside the
  // seeded shift and one extra rnd() there moves every subsequent decision in
  // the building. Rolled here it is a property of the PERSON — the same body
  // shops the same way every shift, which is also what people do — and it costs
  // the sim stream nothing.
  //
  // Two of the three branches are not a roll at all, because they are physical:
  // a hand load means no trolley (that is WHY you are carrying it), and a child
  // in a cart seat means there had better be a cart under it, or `animateChild`
  // has a toddler riding thin air. See its `mode === 'seat'` branch.
  const cartRoll = rnd();
  const cart = kid && kid.mode === 'seat' ? true
    : handLoad ? false
    : cartRoll < 0.64;
  const B = BUILDS[bi];
  const old = age === 'old', young = age === 'young';
  // AGE IS NOT HEIGHT, and round 10's 0.965 said it was. Real stature loss over
  // a lifetime is 2-4 cm, i.e. about 1.5%, and the reason an old body looks
  // shorter is POSTURE — a rounded upper back and a head carried forward take
  // 30-60 mm off standing height on their own, and they read as age while a
  // uniform shrink just reads as "small person". So: 0.99 on the tape, and the
  // difference goes into `neckZ`, `stoop` and the build's kyphosis instead.
  const heavyB = bi >= 4;
  return {
    build: bi,
    height: tall * (old ? 0.990 : 1),
    girth: rr(0.94, 1.07),
    // ---- proportion, all per-instance -------------------------------------
    legF: rr(0.487, 0.548) + (young ? 0.008 : 0) - (old ? 0.006 : 0),
    torsoW: rr(0.94, 1.07),
    torsoD: rr(0.90, 1.12) * (heavyB ? 1.03 : 1),
    torsoLen: rr(0.96, 1.05),
    shoulderW: rr(0.93, 1.07) * (young ? 0.97 : 1),
    armLen: rr(0.95, 1.05),
    armThick: rr(0.94, 1.06) * B.aw,
    stanceW: rr(0.88, 1.16) * (heavyB ? 1.10 : 1),
    neckDy: rr(-0.014, 0.016),
    // The head carried forward of the shoulders. Old bodies get most of it,
    // heavy bodies some, everybody a little — because in the photographs
    // literally nobody's ear is over their acromion.
    neckZ: rr(0.004, 0.020) + (old ? rr(0.018, 0.040) : 0) + B.kyph * 0.5,
    headSize: rr(0.905, 1.015) * (young ? 1.03 : 1),
    // ---- asymmetry --------------------------------------------------------
    // WHICH LEG THE WEIGHT IS ON, AND A LOAD GETS TO DECIDE IT. Carry six kilos
    // of shopping in your right hand and you stand with the weight on the RIGHT
    // leg, right hip hiked under the load, trunk leaning left to put the centre
    // of mass back over your feet. Rolled independently — which is what round 11
    // did — the two are opposite signs half the time and they CANCEL: the
    // basket's 0.062 rad of lean against the contrapposto's 0.0595 leaves 0.003,
    // and the one feature in this file that gives a body weight silently
    // vanishes on a quarter of the bodies that have it. A critic found it by
    // reading the sum rather than by looking at a render, which is the only way
    // it could have been found: 0.003 rad looks exactly like a body standing up
    // straight, because it is one.
    wSide: handLoad ? bag.side : wRoll,
    contra: rr(0.020, 0.070),
    footFwd: rr(0.006, 0.046),
    toeL: rr(-0.10, 0.26),
    toeR: rr(-0.10, 0.26),
    // ROUND 11 cut this from 5-16 degrees to 3-8 and called it done. It was
    // still three times too much, and the reason is a mistake worth naming
    // because it is easy to make twice: the round-11 note reasons about how the
    // arm looks NEXT TO THE WAIST, where daylight is wanted, and never checks
    // what the same rotation does UP AT THE SHOULDER, where it is not. 0.13 rad
    // moves the elbow 37 mm outboard at exactly the height the trunk is
    // narrowing, which is the whole skittle. 0.2 to 2.6 degrees now, and the
    // daylight comes from the trunk's own taper plus an elbow that hangs inboard
    // (SH_ELB_OUT), which is where a real arm gets it.
    splayL: rr(0.004, 0.046) + (heavyB ? 0.030 : 0),
    splayR: rr(0.004, 0.046) + (heavyB ? 0.030 : 0),
    headTilt: rr(-0.055, 0.055),
    // ---- palettes and kit --------------------------------------------------
    skin,
    hair: old ? pick(GREY) : pick(HAIR),
    shirt,
    pants,
    shoe: pick(SHOE),
    // Head shape follows the BUILD (a heavy body gets the heavy skull), with a
    // coin-flip between round and long on everybody the build has no opinion
    // about. `head` in BUILDS is that opinion.
    headKind: B.head === 2 ? 2 : rnd() < 0.5 ? 1 : 0,
    hairStyle: hair,
    sleeve: long ? 1 : 0,
    shoeKind: rnd() < 0.4 ? 1 : 0,
    stoop: B.st + (old ? 0.15 : 0),
    plain: rnd() < 0.3,
    age,
    bag,
    // Whether this body pushes a trolley. agents.js reads it in resetShopper()
    // and nothing writes it afterwards except the bolt, which lets go.
    cart,
    kid,
    pose: rollPose(rng, age, bi),
  };
}

// ---------------------------------------------------------------------------
// A CHILD RIG. Same joint names as the other two, because animateChild in
// agents.js is a third animator and there is no reason for it to learn a third
// vocabulary. There is no `chest` group and no belly: a child's torso does not
// counter-rotate enough at this size to be worth a group, and the one place it
// would show — the shoulder swing — is carried by the arms instead.
// ---------------------------------------------------------------------------
export function makeChild(THREE, F, o) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: o.shirt, roughness: 0.93, vertexColors: true });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.95, vertexColors: true });
  const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.78, vertexColors: true });
  const hairM = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 1.0, vertexColors: true });

  const hips = new THREE.Group(); hips.position.y = KID.hipY; g.add(hips);
  const chest = hips;                       // deliberately the same group — see above
  const torso = new THREE.Mesh(F.kid.torso, shirt);
  torso.castShadow = true; hips.add(torso);

  const neck = new THREE.Group(); neck.position.y = KID.neckY; hips.add(neck);
  neck.add(new THREE.Mesh(F.kid.head, skin));
  neck.add(new THREE.Mesh(F.kid.hair[o.hairStyle], hairM));

  const limb = (geo, mat, x, y) => {
    const p = new THREE.Group(); p.position.set(x, y, 0);
    p.add(new THREE.Mesh(geo, mat)); return p;
  };
  // ROUND 10 — THE STANCE. Round 9 hung the legs at +/-0.055 under shoulders
  // 0.202 wide, which is a post with a head on it; a child stands with its feet
  // apart. +/-0.072, and the arms come out with them, so the bottom half of the
  // silhouette is a triangle. At 35 px tall that is the whole difference
  // between a smudge and a small person standing there.
  const legL = limb(F.kid.leg[0], pants, 0.072, 0);
  const legR = limb(F.kid.leg[1], pants, -0.072, 0);
  // ROUND 5 (character) — and the children get it as well, because a child in
  // this store holds a parent's hand and hangs off a cart bar, and both of
  // those are elbows. Their bones are the same construction at 62%.
  const armLb = makeArm(THREE, [[F.kid.arm[0][0], F.kid.arm[0][1], skin]],
    0.105, KID.shoulderY, 0, 1, 1, elbSolve(1, 'kid'));
  const armRb = makeArm(THREE, [[F.kid.arm[1][0], F.kid.arm[1][1], skin]],
    -0.105, KID.shoulderY, 0, 1, 1, elbSolve(-1, 'kid'));
  const armL = armLb.piv, armR = armRb.piv;
  hips.add(legL); hips.add(legR); hips.add(armL); hips.add(armR);

  g.scale.setScalar(o.height);
  return {
    root: g, hips, chest, torso, belly: null, neck, head: neck,
    legL, legR, armL, armR, shirt, pants, hipY: KID.hipY, stoop: 0.02,
    cop: false, kid: true, spec: o,
    armLbone: armLb, armRbone: armRb, elbL: armLb.elb, elbR: armRb.elb,
    setElbow: (side, th) => (side > 0 ? armLb : armRb).set(th),
    elbowOf: (side) => (side > 0 ? armLb : armRb).th,
    handRig: (side, AL, out) => handRigOf(side > 0 ? armLb : armRb, KID.hipY, AL, out),
    // Follow state, all of it driven by dt and the constants above. No rng
    // reaches this object after construction, which is what makes a child
    // replayable in a bench trial and unable to walk the seeded stream.
    t: o.phase, phase: o.phase * 3.1, stopT: 0, x: 0, z: 0, vx: 0, vz: 0,
    heading: 0, started: false,
  };
}

// ---------------------------------------------------------------------------
// A SHOPPER. Same joints as the cop, so one animator drives both.
// Draw calls: torso, head, hair, 2 legs, 2 shoes, 2 sleeves, 2 forearms
// (+ belly on a heavy build) = 10-11, against the old rig's 9-12. More person,
// no more calls: the detail is inside merged geometry, and the variety is in
// which baked geometry a person points at.
// ---------------------------------------------------------------------------
// The stature the SKELETON comes out at when every per-person proportion is 1.
// Sole -> crown, where the crown is the top of the skull ball. Everything below
// renormalises against this, so `o.height` stays the tape measure no matter how
// the leg/trunk/head split is rolled.
const CROWN0 = FIG.hipY + FIG.neckY + FIG.headY + 0.112;

export function makePerson(THREE, F, o) {
  const g = new THREE.Group();
  const b = BUILDS[o.build];
  const shirt = new THREE.MeshStandardMaterial({
    color: o.shirt, roughness: 0.92, vertexColors: true,
    // `plain` is still plain — it picks one of the two unpatterned weaves
    // rather than nothing at all. See clothAtlas cells 4 and 5.
    map: F.cloth[o.plain ? 4 + ((o.build + o.headKind) & 1) : (o.hairStyle + o.build) & 3],
  });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.95, vertexColors: true });
  const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.78, vertexColors: true });
  const hairM = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 1.0, vertexColors: true });
  const shoeM = new THREE.MeshStandardMaterial({ color: o.shoe, roughness: 0.62, vertexColors: true });

  // ---- THE SPLIT. How much of this person is leg and how much is trunk ----
  // hipY is where the pelvis sits; everything above it is scaled by `trunkS` so
  // the two halves add up, and the whole figure is then scaled so the crown
  // lands at the stature that was rolled. Round 10 had legF pinned at 0.525 for
  // all twenty-one bodies in the building.
  const hipY = CROWN0 * o.legF;
  const legS = hipY / FIG.hipY;
  const trunkS = ((CROWN0 - hipY) / (CROWN0 - FIG.hipY)) * o.torsoLen;
  const neckY = FIG.neckY * trunkS + o.neckDy;
  const shoulderY = FIG.shoulderY * trunkS;
  const crownM = hipY + neckY + (FIG.headY + 0.112) * o.headSize;

  const hips = new THREE.Group(); hips.position.y = hipY; g.add(hips);
  const chest = new THREE.Group(); hips.add(chest);

  // ROUND 3 (character) — WHICH TRUNK, and the answer depends on the strap.
  // A shoulder bag or a crossbody (kinds 0 and 1) presses cloth in; a carrier
  // bag or a basket (2 and 3) hangs off a fist and touches no shirt, so those
  // two take the undented bake. Decided here, once, and never written again.
  const strapIx = o.bag && o.bag.kind < 2 ? (o.bag.side > 0 ? 1 : 2) : 0;
  const torso = new THREE.Mesh(F.torso[o.build][strapIx], shirt);
  // Width and depth are SEPARATE multipliers. One number for both is what made
  // every round-10 body an ellipse of a fixed aspect ratio.
  torso.scale.set(o.girth * o.torsoW, trunkS, o.girth * o.torsoD);
  torso.castShadow = true; chest.add(torso);

  // No belly mesh. It is in the torso loft, on the same surface, which is the
  // only way an overhang can exist without a seam ring round it — the cop round
  // wrote this down in 2 lines and the shoppers kept the sphere for two more.
  const belly = null;

  const neck = new THREE.Group();
  // FORWARD of the shoulders, not on top of them. See rollPerson: this is most
  // of what "old" looks like at a distance, and everybody gets a little.
  neck.position.set(0, neckY, o.neckZ);
  neck.rotation.z = o.headTilt;
  chest.add(neck);
  const head = new THREE.Mesh(F.head[o.headKind], skin);
  head.scale.setScalar(o.headSize); neck.add(head);
  const hairMesh = new THREE.Mesh(F.hair[o.hairStyle], hairM);
  hairMesh.scale.setScalar(o.headSize); neck.add(hairMesh);

  const limb = (geo, mat, x, y, z, sx, sy, extra) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z);
    piv.scale.set(sx, sy, sx);
    piv.add(new THREE.Mesh(geo, mat));
    if (extra) piv.add(new THREE.Mesh(extra[0], extra[1]));
    return piv;
  };
  // ROUND 12 — THE SHOULDER HANGS OFF THE TRUNK IT IS ATTACHED TO. `torso.scale`
  // multiplies every trunk half-width by `girth * torsoW` (up to 1.14) and the
  // arm pivot was NOT multiplied by anything of the kind, so a body that rolled
  // a wide trunk grew its ribs out past its own arms and swallowed them: the
  // widest builds rendered with a deltoid cap, a hand at the hip, and no arm in
  // between. It has been true since round 11 and was invisible while the splay
  // was throwing the elbows clear of the body anyway — which is the shape of
  // every bug in this file's header: a second mistake hiding a first.
  //
  // `sw` in BUILDS is therefore now read as "shoulder half-width RELATIVE TO
  // THIS TRUNK", which is what it always meant, and `shoulderW` keeps its own
  // independent 0.93-1.07 on top. Measured on the shipped roster, the arm's
  // lateral edge at mid-humerus stands 20-38 mm proud of the trunk on all six
  // builds, against 10-13 mm before and a real adult's ~42 mm.
  // ROUND 2 (character) — AND THE LEGS HAD THE ARMS' BUG, one paragraph up.
  // The leg MESH is scaled by `o.girth` (see the two limb() calls below, whose
  // `sx` is o.girth), so a wide body's thighs get wider — but the hip PIVOTS
  // were `b.hw * o.stanceW` and knew nothing about girth, so the two thighs
  // walked into each other. Round 11's own note explains why that is not
  // cosmetic: the thighs are MEANT to overlap across the midline, because that
  // overlap is the only pelvis this game has. Scale the separation and the
  // overlap holds at whatever it was authored to be; leave it and the overlap
  // grows with girth until the widest builds are one solid block from hip to
  // knee with the crotch swallowed. Measured on the shipped roster of 14, as
  // (thigh half-width x girth) - (hip half-separation):
  //     before   11.3 - 48.6 mm of overlap, and it moved with GIRTH
  //     after     8.6 - 44.6 mm, and it moves with BUILD alone
  // The three widest bodies (girth 1.06-1.067) were each carrying 4-6 mm of
  // overlap they had not been authored. `stanceW` is untouched and still means
  // what it says — how far apart this person stands — because it multiplies on
  // top of the corrected quantity rather than instead of it.
  const hw = b.hw * o.stanceW * o.girth, sw = b.sw * o.shoulderW * o.girth * o.torsoW;
  // ONE FOOT IN FRONT OF THE OTHER, and it is the free leg that goes forward.
  const ff = o.wSide > 0 ? [0, o.footFwd] : [o.footFwd, 0];
  const legL = limb(F.leg[o.build][0], pants, hw, 0, ff[0], o.girth, legS,
    [F.shoe[o.shoeKind], shoeM]);
  const legR = limb(F.leg[o.build][1], pants, -hw, 0, ff[1], o.girth, legS,
    [F.shoe[o.shoeKind], shoeM]);
  // ROUND 10 — TWO MESHES PER ARM, WHATEVER THE SLEEVE, AND THE HAND IS DRAWN
  // ONCE. Round 9 gave a long-sleeved person THREE arm meshes: the sleeve, the
  // long `fore` bake in SHIRT — which is a wrist, a palm, fingers and a thumb
  // in shirt colour — and then the short `fore` bake in SKIN on top of it, at
  // byte-identical transforms. Two coincident hands, one shirt-coloured, and
  // which one you saw was whichever the depth test happened to keep. It cost a
  // mesh, a material and a z-fight on 40% of the crowd.
  //
  // The fix is that the second slot is ALWAYS the skin bake: `F.fore[1]` is the
  // hand alone (for a sleeve that covers the forearm) and `F.fore[0]` is the
  // bare forearm plus the hand. Long-sleeved people go from 3 arm meshes to 2,
  // which is 2 draw calls per person back on every long-sleeved body in the
  // store, and the arm count is now the same for everybody.
  // ROUND 5 (character) — AND THE ARMS GO THROUGH makeArm, WHICH HAS A JOINT.
  // `sw` and `shoulderY` are unchanged; what changed is that the pivot no
  // longer carries the scale (see makeArm) and there is an elbow group under
  // it. `armL`/`armR` still name the shoulder pivot, so every clip, idle and
  // gait channel in agents.js that writes armR.rotation.x is untouched.
  const armLb = makeArm(THREE, [
    [F.sleeve[o.sleeve][0][0], F.sleeve[o.sleeve][0][1], shirt],
    [F.fore[o.sleeve][0][0], F.fore[o.sleeve][0][1], skin],
  ], sw, shoulderY, 0, o.armThick, o.armLen, elbSolve(1));
  const armRb = makeArm(THREE, [
    [F.sleeve[o.sleeve][1][0], F.sleeve[o.sleeve][1][1], shirt],
    [F.fore[o.sleeve][1][0], F.fore[o.sleeve][1][1], skin],
  ], -sw, shoulderY, 0, o.armThick, o.armLen, elbSolve(-1));
  const armL = armLb.piv, armR = armRb.piv;
  // ROUND 9 — the mesh whose geometry carries the RIGHT HAND, handed back by
  // name so agents.js can swap in the raised-finger bake without counting
  // children. ROUND 5 — makeArm returns it by name, which is what round 9's
  // note wanted in the first place; `children[length-1]` stopped being the hand
  // the moment the arm grew a joint.
  const handR = armRb.hand;
  const handGeo = handR.geometry;                 // what to put back afterwards
  // ROUND 10 — AND ROUND 9'S TWO BAKES WERE THE WRONG TWO. `F.bird` was
  // [side +1, side -1], both short-sleeved, indexed by SLEEVE — so a
  // long-sleeved man giving the camera the finger got the LEFT hand's bake
  // (thumb 60 mm out on the wrong side) and a short-sleeved one got the right
  // hand by luck of the index. The right hand is ALWAYS built from side -1;
  // what actually varies with the sleeve is whether the bake carries a bare
  // forearm. The bakery now holds those two and this expression is finally
  // asking the question it looks like it is asking.
  const birdGeo = F.bird[o.sleeve ? 0 : 1];
  hips.add(legL); hips.add(legR); chest.add(armL); chest.add(armR);

  // ROUND 9 — one mesh. It gets its OWN material rather than borrowing the
  // trousers, and the extra material is free where it matters: a material is
  // not a draw call, the mesh already was one, and the shader program is the
  // same MeshStandard variant every other part of this person compiles to. The
  // first version did borrow `pants` to save the allocation and it looked
  // exactly like what it was — a tote cut from the same bolt as the trousers,
  // on every single person who had one.
  //
  // WHICH GROUP IT HANGS ON IS THE ANIMATION. A shoulder bag is strapped to the
  // ribs, so it goes on `chest` and rides the counter-rotation; a carrier bag
  // is held in a hand at the hip, so it goes on `hips` and swings with the
  // walk. Same geometry list, and the difference is one ternary.
  let bag = null;
  // THE LOAD. A basket with six kilos of shopping in it is the only thing in
  // this game that has ever had WEIGHT, and weight is the first item in the
  // brief. It does three things to a body and all three are rest angles:
  // the carrying shoulder drops, the trunk leans AWAY from the load to put the
  // centre of mass back over the feet, and the pelvis shifts under it. A
  // carrier bag does a third of the same. That is the whole feature and it
  // costs nothing per frame.
  let loadLean = 0;
  if (o.bag) {
    const bagM = new THREE.MeshStandardMaterial({
      color: o.bag.color, roughness: 0.88, vertexColors: true,
    });
    bag = new THREE.Mesh(F.bag[o.bag.kind][o.bag.side > 0 ? 0 : 1], bagM);
    if (o.bag.kind < 2) {
      // Strapped to the body -> rides the ribs and counter-rotates. Unchanged.
      chest.add(bag);
    } else {
      // ---- HELD IN A HAND. See the header of shopperBag ------------------
      // A group on `chest` that takes its POSITION from the fist and its
      // ORIENTATION from the pelvis. Both halves matter and they are separate
      // constraints: position is what "it is in his hand" means, orientation is
      // what "it has six kilos in it" means.
      //
      // WHY IT IS NOT SIMPLY A CHILD OF THE ARM, which is the obvious build and
      // the one the round-11 note proposed: the arm pivot is SCALED, by
      // (armThick, armLen, armThick), and a rotated child of a non-uniformly
      // scaled parent is SHEARED. armThick spans 0.85 to 1.17 across this
      // roster, so a basket hanging off a raised arm would arrive up to 11% out
      // of square — and it would follow the arm through a fold or a reach and
      // end up on its side, which is the bug this is fixing.
      //
      // `chest` has no scale of its own and `g.scale` is uniform, so a group
      // hung here is square. The four lines in the override are the whole
      // feature and they run once per graph traversal on the two or three
      // bodies in the store that are carrying something.
      const armB = o.bag.side > 0 ? armLb : armRb;
      const armPiv = armB.piv, elbGrp = armB.elb, shGrp = armB.shg;
      // The fist, in ELBOW-LOCAL coordinates, pre-multiplied by the arm's own
      // mesh scale — which is what the fore mesh does to a vertex before the
      // joint rotates it. t = 0.986 is chest-local y = -0.200 on an armLen of
      // 1.0 at flex 0, i.e. the exact point round 11's `HAND` named.
      // ROUND 5 (character) — IT IS ELBOW-LOCAL NOW, AND THAT IS THE FEATURE.
      // A basket used to hang off a dead-straight arm at knee height, clipping
      // the thigh, because the fist was derived from a stick. Derived through
      // the joint it rides the forearm, so `carry` bends with the elbow and a
      // shopper carries a basket at the hip the way the reference photographs
      // do. carryCheck() asserts this point is still inside the baked hand.
      const HB = SH_ARM(o.bag.side > 0 ? 1 : -1);
      const hb = HB.fore.at(0.986);
      const hand = new THREE.Vector3((hb[0] - HB.el[0]) * o.armThick,
        (hb[1] - HB.el[1]) * o.armLen, (hb[2] - HB.el[2]) * o.armThick);
      const carry = new THREE.Group();
      carry.add(bag);
      chest.add(carry);
      const qv = new THREE.Quaternion(), qId = new THREE.Quaternion();
      const pv = new THREE.Vector3();
      // A tenth of the trunk's lean is allowed through, so the thing is not
      // gyroscopically rigid — a carried basket does swing a little, it just
      // does not turn over.
      const PLUMB = 0.10;
      const base = THREE.Object3D.prototype.updateMatrixWorld;
      carry.updateMatrixWorld = function (force) {
        pv.copy(hand).applyQuaternion(elbGrp.quaternion).add(elbGrp.position)
          .applyQuaternion(shGrp.quaternion).add(shGrp.position)
          .applyQuaternion(armPiv.quaternion).add(armPiv.position);
        this.position.copy(pv);
        qv.copy(chest.quaternion).invert();
        this.quaternion.copy(qv).slerp(qId, PLUMB);
        base.call(this, force);
      };
    }
    loadLean = o.bag.kind === 3 ? -o.bag.side * 0.062
      : o.bag.kind === 2 ? -o.bag.side * 0.024 : 0;
  }

  // ---- CONTRAPPOSTO. Nobody in the reference photographs stands square ----
  // Weight on one leg puts that hip UP and the opposite shoulder DOWN, and the
  // pair of them is the difference between a person standing and a mannequin
  // standing. These are REST angles: animateShopper adds them to the gait
  // channels and fades them out as a body starts to walk, because a walking
  // body's weight is alternating rather than parked.
  // ROUND 12 — AND A LOAD OUTRANKS A POSE. rollPerson now puts the weight on the
  // loaded leg, so these two terms have the same sign by construction and add
  // instead of cancelling; the clamp is here anyway, because the bug was one
  // `+` between two independently rolled numbers and the next person to re-roll
  // `wSide` for some unrelated reason would put it straight back. A body that is
  // carrying something keeps at least its own lean, whatever the pose wants.
  // This is CLAUDE.md's rule applied to a value rather than to a derivation: if
  // two things can disagree, say which one wins, out loud, at the join.
  const contraZ = -o.wSide * o.contra * 0.85;
  const chestZ = loadLean === 0 ? contraZ
    : (contraZ < 0) === (loadLean < 0) ? contraZ + loadLean : loadLean + contraZ * 0.25;
  const rest = {
    hipZ: o.wSide * o.contra,
    chestZ,
    toeL: o.toeL, toeR: -o.toeR,
    splayL: o.splayL, splayR: -o.splayR,
  };

  // Renormalise the tape measure. Every proportion above moved the crown; this
  // puts it back at exactly the stature that was rolled, so `height` still
  // means what the roster prints and the leg/trunk/head split is free.
  g.scale.setScalar(o.height * (CROWN0 / crownM));
  // The child is BUILT here and PARENTED by agents.js, because where it goes
  // depends on what it is doing: a kid in the cart seat belongs to the cart
  // object, and a kid on foot belongs to the scene with its own ground
  // position. figures.js does not know the cart exists.
  const kid = o.kid ? makeChild(THREE, F, o.kid) : null;
  return {
    root: g, hips, chest, torso, belly, neck, head, legL, legR, armL, armR,
    shirt, pants, hipY, stoop: o.stoop, cop: false,
    // ROUND 5 (character) — THE JOINT. Three fields, and they are the whole
    // contract: set the interior angle, read it back, and ask where the hand
    // ended up. `elbL`/`elbR` are the groups, for a probe that wants the
    // quaternion; nothing in agents.js should touch them directly.
    armLbone: armLb, armRbone: armRb, elbL: armLb.elb, elbR: armRb.elb,
    setElbow: (side, th) => (side > 0 ? armLb : armRb).set(th),
    elbowOf: (side) => (side > 0 ? armLb : armRb).th,
    handRig: (side, AL, out) => handRigOf(side > 0 ? armLb : armRb, hipY, AL, out),
    // ROUND 11 — ON THE RIG, because two things in agents.js used to read them
    // off the FIG constants and therefore assumed every body in the store was
    // the same one. `armLen` is the prop solve (a held item is placed from the
    // shoulder along the arm) and `eyeY` is the camera look-up angle.
    armLen: FIG.armLen * o.armLen,
    eyeY: (hipY + neckY + FIG.headY * o.headSize),
    rest,
    bag, bagKind: o.bag ? o.bag.kind : -1, kid,
    // ROUND 3 (character) — THE LOAD, ON THE RIG, for animateShopper's carry
    // clamp. A hand load is always armL (see rollPerson), so this is a flag and
    // not a pointer: `weight` is how much of a constraint it is — a basket with
    // six kilos in it is not a carrier bag with a loaf in it. Nothing writes it
    // after construction and nothing in the scheduler is allowed to read it.
    carry: o.bag && o.bag.kind >= 2 ? { kind: o.bag.kind, weight: o.bag.kind === 3 ? 1 : 0.55 } : null,
    handR, handGeo, birdGeo, birdOn: false,
    // The per-person pose table. animateShopper reads it every frame; nothing
    // else in the game is allowed to write it.
    pose: o.pose, age: o.age,
    // The description this body was rolled from. Read-only, and it is here so a
    // probe can print the roster's proportions without re-rolling anything.
    desc: o,
    // Idle bookkeeping, on the RIG rather than on the shopper, for a reason
    // that matters: `s` is wiped by resetShopper() every trial and the rig is
    // not, so an idle clock parked here cannot be restarted by a state change
    // and therefore cannot be correlated with one.
    idleT: o.pose.idlePh, idleMix: 0, idleCur: 0,
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
//
// ROUND 1 (cop) — 13 -> 17, and the four are named rather than buried:
//   +2  the shoes, which had to leave the trouser mesh before gait.js's
//       attachFeet() could find them at all. This is the whole port.
//   +2  the shanks, from the knee split. attachFeet cuts the trouser in two
//       and hinges the lower half; the shank borrows the thigh's material and
//       the split geometry is cached on the source, so it is a draw call and
//       nothing else — no material, no texture, no new buffer per body.
// He is ONE body against a store that draws thousands, and the scene renders
// ten times a frame, so this is 40 draw calls a frame for the only walk cycle
// the player ever looks at from three metres. Every shopper already pays the
// same four.
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
  // ROUND 7 — carried further forward and 12 mm lower. A head that sits on top
  // of the shoulders belongs to somebody with a posture; his is down in the
  // collar, which is also what makes the jowls and the neck roll do any work.
  neck.position.set(0, FIG.neckY - 0.012, 0.040);
  chest.add(neck);
  const head = new THREE.Mesh(F.cop.head, uni);
  head.castShadow = true; neck.add(head);
  neck.add(new THREE.Mesh(F.cop.headKit, kit));

  const limb = (a, b, mb, x, y, z) => {
    const piv = new THREE.Group(); piv.position.set(x, y, z || 0);
    piv.add(new THREE.Mesh(a, uni));
    if (b) piv.add(new THREE.Mesh(b, mb || uni));
    return piv;
  };
  // ---- WEIGHT ON THE HEELS, AS A TRANSLATION AND NOT AS AN ANGLE ----------
  // animateCop used to open every frame with `legL.rotation.x += 0.046` on both
  // legs — "both legs raked 2.6 degrees forward of the pelvis, so his feet lead
  // and the gut is out over them". The read is right and it is the single most
  // fat-man thing on him, but that channel now belongs to gait.js's solve,
  // where the leg angle and the ground travel are an EQUALITY (see the header
  // of gait.js). Adding a constant to one side of an equality is not constant
  // on the other: -L sin(th + rake) differs from -L sin(th) by L·rake·cos(th),
  // which swings 2.4 mm across a stance and is skate.
  //
  // What "raked forward" physically MEANS is that his feet are in front of his
  // pelvis, so it is a translation of the hip pivot, and a translation cannot
  // slip. 0.038 m is L·sin(0.046) — the same displacement the old angle bought,
  // exact at every phase instead of at one.
  const legL = limb(F.cop.leg[0], F.cop.shoe, uni, COP_STANCE, 0, COP_RAKE_Z);
  const legR = limb(F.cop.leg[1], F.cop.shoe, uni, -COP_STANCE, 0, COP_RAKE_Z);
  // ROUND 5 (character) — HIS ARMS GET THE JOINT TOO, and he is the body it
  // matters most on: the chase camera sits three metres behind him for the
  // whole floor phase, so his two forearms are the largest moving thing on
  // screen in this game. He has no per-body scale, so makeArm's (sx, sy) are
  // both 1 and the bytes at flex 0 are the previous build's.
  const armLb = makeArm(THREE, [[F.cop.sleeve[0], null, uni],
    [F.cop.fore[0][0], F.cop.fore[0][1], uni]],
  0.206, FIG.shoulderY + 0.012, 0, 1, 1, elbSolve(1, 'cop'));
  const armRb = makeArm(THREE, [[F.cop.sleeve[1], null, uni],
    [F.cop.fore[1][0], F.cop.fore[1][1], uni]],
  -0.206, FIG.shoulderY + 0.012, 0, 1, 1, elbSolve(-1, 'cop'));
  const armL = armLb.piv, armR = armRb.piv;
  hips.add(legL); hips.add(legR); chest.add(armL); chest.add(armR);

  g.scale.setScalar(1.04);
  return {
    root: g, hips, chest, torso, belly, neck, head, legL, legR, armL, armR,
    beltGrp, shirt: uni, pants: uni, kit, leather,
    // `stoop` is BOTH the chest's resting slump and the neck's resting pitch —
    // see animateCop. 0.09 -> 0.19 is chin-into-the-neck, which round 6 could
    // not afford because the head was still half inside the torso and dropping
    // it any further would have buried it again.
    hipY: FIG.hipY, stoop: 0.19, cop: true,
    // The three fields round 11 put on a shopper rig, at their neutral values,
    // so a function that reads them off "a rig" cannot get a different answer
    // depending on whose rig it was handed.
    armLen: FIG.armLen, eyeY: FIG.hipY + FIG.neckY + FIG.headY,
    rest: { hipZ: 0, chestZ: 0, toeL: 0, toeR: 0, splayL: 0, splayR: 0 },
    // Where the arms hang from at rest. animateCop rolls them forward off this
    // as `fatigue` rises, which is the "shoulders round further" note.
    armZ: 0.010,
    // ROUND 5 (character) — the same three fields a shopper rig carries, so a
    // function handed "a rig" cannot get a different answer depending on whose.
    armLbone: armLb, armRbone: armRb, elbL: armLb.elb, elbR: armRb.elb,
    setElbow: (side, th) => (side > 0 ? armLb : armRb).set(th),
    elbowOf: (side) => (side > 0 ? armLb : armRb).th,
    handRig: (side, AL, out) => handRigOf(side > 0 ? armLb : armRb, FIG.hipY, AL, out),
  };
}

