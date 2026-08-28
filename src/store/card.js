// OWNER: builder-signage (round 26). PHYSICAL CARD STOCK.
//
// Contract — must keep exporting exactly this:
//   eulerXYZ(X, Y, Z)              basis -> the XYZ euler Batch.push wants
//   basisOf(ex, ey, ez)            the inverse, and the self-test's other half
//   eulerSelfTest()                proves the pair against the wrong convention
//   Vol                            the aisle-volume collision index
//   obbFromBasis / satPen          oriented boxes and their overlap depth
//   hash32(...) / hjit(h, i, a, b) rng-free per-object jitter
//   makeCardStock(ctx)             -> { card, rimLedger, slabs }
//   cardCheck(THREE, scene, slabs) reads LIVE instance matrices
//   cardSelfTest(slabs)            fires cardCheck's comparison on the wrong
//                                  euler convention and proves it catches it
//
// =========================================================================
// ROUND 26 — WHY THIS FILE EXISTS.
//
// r25's critic, on tile_11 of shots/blind_hhlphpxo at (350,290)-(560,470) —
// reproduced exactly at near_a1 in shots/r26_before_near_a1.png:
//
//   "SALE card + RECIPE pad: flat planes.  no card thickness anywhere."
//
// Measured on the live scene before a line of this was written: FIFTEEN
// printed-surface soups in this store, 21,278 quads between them, and
// ZERO of those quads has a short edge under 8 mm. Not one card in this
// building has a rim. Fourteen of the fifteen soups are MeshBasicMaterial —
// unlit by authoring — so even if a rim existed it could not catch a light.
//
// So the critic's falsifier ("falsified if any card anywhere shows a lit side
// face") does not fire, and the fix is not a texture. A card is BOARD with
// PRINT ON IT:
//
//   * the board is a real box through Batch.push, which is the store's lit
//     Lambert fixture material (the one round 25 gave a derived finish to), so
//     its four narrow faces shade with the room and carry a lamp lobe;
//   * the print is the quad soup that was already there, moved to sit just
//     proud of the board's face instead of floating on its own;
//   * a board that is 1.4-2.2 mm thick is 0.5-1.5 px of rim at the near poses
//     and nothing at chase range, which is exactly the scale ladder r24
//     measured — this is a near-pose change and says so.
//
// AND THE BOARD IS WHAT MAKES THE OTHER THREE HALVES POSSIBLE. A plane cannot
// bend, cannot be hooked over anything, and cannot be tested for collision
// against a product, because it has no volume to test. Every one of those is a
// property of the solid, not of the picture on it.
//
// THE EULER IS THE WHOLE RISK IN THIS FILE. The cards are built from a basis
// (half-width vector, half-height vector) because that is what Quads.rect
// takes; Batch.push takes three euler angles composed XYZ. Getting that
// conversion wrong puts a board at a plausible-looking wrong angle behind every
// card in the store and NOTHING throws. So there is exactly one owner of it
// here, the inverse is written next to it, and cardCheck() reads the built
// InstancedMesh's own matrices back rather than re-deriving what it just wrote.

// ---------------------------------------------------------------------------
// THE ONE OWNER OF basis -> euler.
//
// three.js composes an XYZ euler as Rx(a)*Ry(b)*Rz(c) — intrusions.js's cable
// note already depends on that fact and derives its two angles from it. Written
// out, the columns of that product are where local +x, +y, +z land:
//
//   R = [  cb*cc              -cb*sc               sb    ]
//       [  sa*sb*cc + ca*sc   -sa*sb*sc + ca*cc   -sa*cb ]
//       [ -ca*sb*cc + sa*sc    ca*sb*sc + sa*cc    ca*cb ]
//
// so m02 = sb, and the other two come out of the third column and first row.
// X, Y, Z are the world images of local +x, +y, +z — i.e. the COLUMNS of R,
// which is what a card's (R-hat, U-hat, N-hat) frame already is.
export function eulerXYZ(X, Y, Z) {
  // m[r][c]: column c is the world image of local axis c
  const m02 = Z[0], m12 = Z[1], m22 = Z[2];
  const m00 = X[0], m01 = Y[0];
  const b = Math.asin(Math.max(-1, Math.min(1, m02)));
  // cos(b) is zero only when the card's normal is straight down the world x
  // axis AND its width vector is vertical; gimbal there, so fall back to the
  // degenerate branch rather than dividing by a vanishing cosine.
  //
  // THE THRESHOLD IS 1e-12 AND NOT three's 0.9999999, and cardCheck is what
  // found that. three's Euler.setFromRotationMatrix uses the looser number
  // because it is READING a matrix and can afford to throw away a residual;
  // this is WRITING one that three will then compose exactly, so the residual
  // it throws away comes straight back as an error. Two boards — the clip-strip
  // headers whose normal is dead along world x — came out 2.0e-4 wrong for
  // exactly that reason, on the tolerance, after the shear fix had taken 1226
  // down to 2. atan2 of two quantities of order cos(b) is well conditioned all
  // the way down to 1e-6, so there is no accuracy to buy back by leaving early.
  if (Math.abs(m02) < 0.999999999999) {
    return [Math.atan2(-m12, m22), b, Math.atan2(-m01, m00)];
  }
  // gimbal: the two remaining angles are one degree of freedom. three's own
  // Euler.setFromRotationMatrix takes it out of column 1, and this must agree
  // with it or the degenerate cards get a board nobody notices is wrong.
  return [Math.atan2(Y[2], Y[1]), b, 0];
}
// the inverse, so the self-test is not the forward map checking itself
export function basisOf(a, b, c) {
  const ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b);
  const cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cb * cc, sa * sb * cc + ca * sc, -ca * sb * cc + sa * sc],   // local +x
    [-cb * sc, -sa * sb * sc + ca * cc, ca * sb * sc + sa * cc],  // local +y
    [sb, -sa * cb, ca * cb],                                      // local +z
  ];
}
// AND IT IS PROVEN AGAINST THE CONVENTION IT WOULD OTHERWISE HAVE BEEN.
// A ZYX reading of the same matrix is the single most likely way to get this
// wrong — it is what three's Euler does under a different `order` string and
// it agrees with XYZ on every axis-aligned card in the store, which is most of
// them. The self-test returns BOTH: the round-trip error of the real pair, and
// the error the ZYX reading would have had. If the second number is small the
// test is not discriminating and the test is what is broken.
function eulerZYX(X, Y, Z) {
  const b = Math.asin(Math.max(-1, Math.min(1, -X[2])));
  if (Math.abs(X[2]) < 0.9999999) return [Math.atan2(Y[2], Z[2]), b, Math.atan2(X[1], X[0])];
  return [0, b, Math.atan2(-Y[0], Y[1])];
}
export function eulerSelfTest(n = 4096) {
  let worst = 0, worstWrong = 0;
  let s = 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < n; i++) {
    const a = (rnd() - 0.5) * Math.PI * 1.9;
    // ONE IN EIGHT SAMPLES IS PARKED AT GIMBAL, because the real store puts
    // cards there: a clip-strip header faces straight down world x, which is
    // b = +-pi/2 exactly, and a sweep over +-0.98pi never once visits it. The
    // two boards this check caught after the shear fix were both that case.
    const b = (i % 8 === 0)
      ? (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2 - Math.pow(10, -3 - 9 * rnd()))
      : (rnd() - 0.5) * Math.PI * 0.98;
    const c = (rnd() - 0.5) * Math.PI * 1.9;
    const M = basisOf(a, b, c);
    for (const [f, acc] of [[eulerXYZ, 0], [eulerZYX, 1]]) {
      const e = f(M[0], M[1], M[2]);
      const N = basisOf(e[0], e[1], e[2]);
      let err = 0;
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) err = Math.max(err, Math.abs(N[k][j] - M[k][j]));
      if (acc === 0) { if (err > worst) worst = err; } else if (err > worstWrong) worstWrong = err;
    }
  }
  // THE PASS MARK IS 1e-5 AND THE REASON IS THE GIMBAL BRANCH, not slack.
  // Away from gimbal the round trip is exact to 1.5e-15. Inside the branch the
  // pair (x, z) is genuinely one degree of freedom and folding it onto x throws
  // away a rotation of order the threshold itself — bounded at 1.4e-6 rad for a
  // cutoff of 1 - 1e-12, and measured at 2.6e-6 over 4096 draws. cardCheck's
  // tolerance is 2e-4, so that is a factor of 77 of headroom on the only number
  // that consumes this. worstWrong is what the same test scores on the ZYX
  // reading; if that ever drops toward `worst` the test has stopped separating
  // the two conventions and it is the test that is broken.
  return { n, worst, worstWrong, ok: worst < 1e-5 && worstWrong > 0.1 };
}

// ---------------------------------------------------------------------------
// ORIENTED BOXES AND THE AISLE-VOLUME INDEX.
//
// The r25 critic's third bullet — "a green package hovers unsupported and clips
// straight through the red SALE banner" — is a COLLISION, and a collision needs
// two volumes. Every solid in the store is already an oriented box (Batch.push
// takes a euler and three scales); this reads them back out of the batches
// while the store is still being built, which is the only moment at which
// intrusions.js can still choose where to put something.
//
// SAT on 15 axes, returning the overlap DEPTH rather than a boolean, so a
// threshold is a distance in metres and the result can be published as a
// profile rather than as a yes.
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function satPen(A, B) {
  const d = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  let minPen = Infinity;
  for (let k = 0; k < 15; k++) {
    let raw;
    if (k < 3) raw = A.ax[k];
    else if (k < 6) raw = B.ax[k - 3];
    else {
      const i = ((k - 6) / 3) | 0, j = (k - 6) % 3;
      raw = cross3(A.ax[i], B.ax[j]);
      if (Math.hypot(raw[0], raw[1], raw[2]) < 1e-6) continue;
    }
    const l = Math.hypot(raw[0], raw[1], raw[2]) || 1;
    const L = [raw[0] / l, raw[1] / l, raw[2] / l];
    let ra = 0, rb = 0;
    for (let i = 0; i < 3; i++) ra += A.h[i] * Math.abs(dot3(A.ax[i], L));
    for (let i = 0; i < 3; i++) rb += B.h[i] * Math.abs(dot3(B.ax[i], L));
    const pen = ra + rb - Math.abs(dot3(d, L));
    if (pen <= 0) return 0;
    if (pen < minPen) minPen = pen;
  }
  return minPen === Infinity ? 0 : minPen;
}
// an OBB from a card's own frame: centre + half-width, half-height, half-thick
export function obbFromBasis(c, R, U, N, hz) {
  const lr = Math.hypot(R[0], R[1], R[2]) || 1, lu = Math.hypot(U[0], U[1], U[2]) || 1;
  const ln = Math.hypot(N[0], N[1], N[2]) || 1;
  return {
    c: [c[0], c[1], c[2]],
    ax: [[R[0] / lr, R[1] / lr, R[2] / lr], [U[0] / lu, U[1] / lu, U[2] / lu],
      [N[0] / ln, N[1] / ln, N[2] / ln]],
    h: [lr, lu, hz],
  };
}
export function obbAxis(px, py, pz, ex, ey, ez, sx, sy, sz) {
  const M = basisOf(ex, ey, ez);
  return { c: [px, py, pz], ax: M, h: [sx / 2, sy / 2, sz / 2] };
}

// A uniform grid hash. Cell size is 0.25 m because the largest thing it ever
// holds is a 0.30 m shelf-talker and the smallest is a 40 mm pouch.
export class Vol {
  constructor(cell = 0.25) { this.g = cell; this.m = new Map(); this.n = 0; }
  _k(x, y, z) { return ((x / this.g) | 0) + ',' + ((y / this.g) | 0) + ',' + ((z / this.g) | 0); }
  _cells(o, fn) {
    const r = Math.hypot(o.h[0], o.h[1], o.h[2]);
    const g = this.g;
    const x0 = Math.floor((o.c[0] - r) / g), x1 = Math.floor((o.c[0] + r) / g);
    const y0 = Math.floor((o.c[1] - r) / g), y1 = Math.floor((o.c[1] + r) / g);
    const z0 = Math.floor((o.c[2] - r) / g), z1 = Math.floor((o.c[2] + r) / g);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) fn(x + ',' + y + ',' + z);
  }
  add(o) {
    this.n++;
    this._cells(o, (k) => { let b = this.m.get(k); if (!b) this.m.set(k, b = []); b.push(o); });
    return o;
  }
  // deepest overlap with anything in the index, or 0
  pen(o, minPen = 0) {
    let deep = 0; const seen = new Set();
    this._cells(o, (k) => {
      const b = this.m.get(k); if (!b) return;
      for (const q of b) {
        if (seen.has(q)) continue; seen.add(q);
        const p = satPen(o, q);
        if (p > minPen && p > deep) deep = p;
      }
    });
    return deep;
  }
  // pull every instance a Batch is holding RIGHT NOW into the index. Batch.t is
  // the live transform list — this is the actual store being built, not a copy
  // of what someone meant to build. `mark` is the high-water map so a run's
  // batches are only ever read forward.
  soakBatches(all, mark) {
    for (let bi = 0; bi < all.length; bi++) {
      const b = all[bi];
      const g = b.geo;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      const hx = (bb.max.x - bb.min.x) / 2, hy = (bb.max.y - bb.min.y) / 2, hz = (bb.max.z - bb.min.z) / 2;
      const cx = (bb.max.x + bb.min.x) / 2, cy = (bb.max.y + bb.min.y) / 2, cz = (bb.max.z + bb.min.z) / 2;
      const from = mark[bi] || 0;
      for (let i = from; i < b.n; i++) {
        const t = b.t, o = i * 9;
        const M = basisOf(t[o + 3], t[o + 4], t[o + 5]);
        const sx = t[o + 6], sy = t[o + 7], sz = t[o + 8];
        const px = t[o] + M[0][0] * cx * sx + M[1][0] * cy * sy + M[2][0] * cz * sz;
        const py = t[o + 1] + M[0][1] * cx * sx + M[1][1] * cy * sy + M[2][1] * cz * sz;
        const pz = t[o + 2] + M[0][2] * cx * sx + M[1][2] * cy * sy + M[2][2] * cz * sz;
        this.add({ c: [px, py, pz], ax: M, h: [hx * sx, hy * sy, hz * sz], src: 'pkg' });
      }
      mark[bi] = b.n;
    }
    return this.n;
  }
}

// ---------------------------------------------------------------------------
// RNG-FREE JITTER.
//
// The r24 lesson, arriving from the other side: a dial is only instance-for-
// instance if the two arms consume the same random stream. Everything this
// round adds — board thickness, curl angle, how far a card hangs off true, how
// many candidate positions a collision resolver tries — is derived from a hash
// of the object's OWN identity, so `?flatcard` reproduces round 25 byte for
// byte and both arms place the same objects in the same order.
export function hash32(...nums) {
  let h = 0x811c9dc5;
  for (const v of nums) {
    // 1/16 mm quantisation: fine enough that no two objects in this store share
    // a key, coarse enough that a float printed differently still hashes the same
    let k = Math.round(v * 16000) | 0;
    for (let b = 0; b < 4; b++) { h ^= k & 255; h = Math.imul(h, 0x01000193) >>> 0; k >>= 8; }
  }
  return h >>> 0;
}
export function hjit(h, i, a, b) {
  const x = Math.imul(h ^ Math.imul(i + 1, 0x9e3779b1), 0x85ebca6b) >>> 0;
  return a + (b - a) * (((x >>> 8) & 0xffffff) / 0x1000000);
}

// ---------------------------------------------------------------------------
// THE CARD ITSELF.
//
// ctx: { boxE, Q, board }  — boxE is store.js's full-euler box into the lit
// fixture batch, Q is the intrusion print soup, board is the card-stock hex.
//
// card(C, R, U, uv, o):
//   C   centre, R half-width vector, U half-height vector (Quads.rect's frame)
//   uv  [u0,v0,u1,v1] atlas window
//   o.both   print the reverse too (a violator is read from both sides)
//   o.segs   how many bands the card curls through. 1 = flat board.
//   o.curl   total angle the card falls away through, about its own width axis
//   o.key    the object's identity, for the hash
//   o.thick  board thickness override
//
// It returns the OBB list it emitted so the caller can put them in the Vol.
export function makeCardStock(ctx) {
  const { boxE, Q, flat } = ctx;
  const BOARD = ctx.board ?? 0xf2ece0;
  const slabs = [];                       // {c, X, Y, Z, s} recorded for the check
  let rims = 0, prints = 0, sheared = 0, shearMax = 0, cards = 0;

  // THE ONE OWNER of where a bent card's bands are. card() emits them and
  // bandsOf() is what a caller asks when it wants to know whether the card
  // WOULD fit somewhere before committing to putting it there. Nothing
  // re-derives this: a collision resolver testing a differently-computed shape
  // from the one that gets drawn is the same class of bug as a HUD holding its
  // own copy of the camera rig, and it fails the same silent way.
  function bandsOf(C, R, U, o = {}) {
    const h = hash32(C[0], C[1], C[2], o.key || 0);
    const t = o.thick ?? hjit(h, 7, 0.0014, 0.0022);
    const segs = Math.max(1, o.segs || 1);
    const lr = Math.hypot(R[0], R[1], R[2]) || 1e-9;
    const lu = Math.hypot(U[0], U[1], U[2]) || 1e-9;
    const Rh = [R[0] / lr, R[1] / lr, R[2] / lr];
    // THE CARDS WERE PARALLELOGRAMS, AND cardCheck FOUND IT ON ITS FIRST RUN.
    //
    // Quads.rect takes a centre and two half-extent vectors and does not care
    // whether they are perpendicular — it just makes the parallelogram they
    // describe. A BOX does care: an instance matrix has an orthonormal frame,
    // so the first build of this file threw on 1226 of 1784 boards before a
    // line of it was published.
    //
    // The shear is a round-20 defect, not a round-26 one, and its origin is
    // visible in violator(): D is the card's width axis and gets a `yaw`, while
    // U is written as the perpendicular to D *in the vertical plane* — which it
    // is, exactly, when yaw is zero, and never again. dot(D,U) works out to
    // (h/2)*cos(droop)*sin(droop)*(cos(yaw) - 1). Same shape in hangTag (a
    // swing angle applied to U only) and in wobbler (two tip axes applied
    // independently). Every one of them draws a rhombus where a die-cut card
    // should be a rectangle.
    //
    // So the board's frame is Gram-Schmidt off the WIDTH axis — the artwork's
    // aspect is measured along the width, so that is the axis whose length must
    // not move — with the height's LENGTH preserved and its direction squared
    // up. The print is then drawn on the same frame, so the card and its board
    // are the same shape by construction rather than by two derivations
    // agreeing. `?flatcard` keeps the parallelograms, because the control arm
    // is round 25 and round 25 had them.
    const rd = Rh[0] * U[0] + Rh[1] * U[1] + Rh[2] * U[2];
    let Uo = [U[0] - Rh[0] * rd, U[1] - Rh[1] * rd, U[2] - Rh[2] * rd];
    const lo = Math.hypot(Uo[0], Uo[1], Uo[2]);
    if (lo < 1e-9) Uo = [0, 1, 0]; else { Uo = [Uo[0] / lo, Uo[1] / lo, Uo[2] / lo]; }
    const Uh = Uo;
    const sh = Math.abs(Math.asin(Math.max(-1, Math.min(1, rd / lu))));
    if (sh > 1e-4) { sheared++; if (sh > shearMax) shearMax = sh; }
    // GRAVITY AND HANDLING. The photograph's card is bent, and it is bent AWAY
    // from its mounting because that is the direction gravity and a passing
    // cart both push it. The curl is applied about the card's own width axis
    // and accumulates down the card, so the TOP stays where the fixture holds
    // it and the foot is the part that has moved — which is what "clipped in at
    // the top, hanging off true" looks like, and it is why the pivot is the top
    // edge rather than the centre.
    const curl = o.curl ?? 0;
    const out = [];
    let cur = [C[0] + U[0], C[1] + U[1], C[2] + U[2]];
    const seg = (2 * lu) / segs;
    for (let j = 0; j < segs; j++) {
      const D = rotAbout([-Uh[0], -Uh[1], -Uh[2]], Rh, curl * ((j + 1) / segs));
      const mid = [cur[0] + D[0] * seg / 2, cur[1] + D[1] * seg / 2, cur[2] + D[2] * seg / 2];
      const Uj = [-D[0] * seg / 2, -D[1] * seg / 2, -D[2] * seg / 2];
      const Nj = unit(cross3(Rh, Uj));
      out.push({
        mid, Rj: [Rh[0] * lr, Rh[1] * lr, Rh[2] * lr], Uj, Nj, Rh, Uh: unit(Uj), t, seg, lr,
        v0: 1 - (j + 1) / segs, v1: 1 - j / segs,
      });
      cur = [cur[0] + D[0] * seg, cur[1] + D[1] * seg, cur[2] + D[2] * seg];
    }
    return out;
  }
  // the volume a card would occupy — the resolver's question, same geometry
  function cardBoxes(C, R, U, o = {}) {
    if (flat()) return [];
    return bandsOf(C, R, U, o).map((b) => obbFromBasis(b.mid, b.Rj, b.Uj, b.Nj, b.t / 2));
  }

  function card(C, R, U, uv, o = {}) {
    const both = !!o.both;
    // THE CONTROL ARM IS THE OLD CALL, UNCHANGED. Not "the new path with the
    // thickness set to zero" — a zero-thickness box is still a box, still an
    // instance, still a stamp in the occupancy field, and this project has
    // published a control that was not off three times.
    cards++;
    if (flat()) {
      rect(C, R, U, uv, both);
      return [];
    }
    const out = [];
    for (const b of bandsOf(C, R, U, o)) {
      const e = eulerXYZ(b.Rh, b.Uh, b.Nj);
      boxE(b.mid[0], b.mid[1], b.mid[2], e[0], e[1], e[2], 2 * b.lr, b.seg, b.t, BOARD);
      slabs.push({ c: b.mid, X: b.Rh, Y: b.Uh, Z: b.Nj, s: [2 * b.lr, b.seg, b.t] });
      rims++;
      // ...and the print, 0.15 mm proud of the board so the two never z-fight
      const off = b.t / 2 + 0.00015;
      const v0 = uv[1] + (uv[3] - uv[1]) * b.v0, v1 = uv[1] + (uv[3] - uv[1]) * b.v1;
      Q.rect([b.mid[0] + b.Nj[0] * off, b.mid[1] + b.Nj[1] * off, b.mid[2] + b.Nj[2] * off],
        b.Rj, b.Uj, uv[0], v0, uv[2], v1);
      prints++;
      if (both) {
        Q.rect([b.mid[0] - b.Nj[0] * off, b.mid[1] - b.Nj[1] * off, b.mid[2] - b.Nj[2] * off],
          [-b.Rj[0], -b.Rj[1], -b.Rj[2]], b.Uj, uv[0], v0, uv[2], v1);
        prints++;
      }
      out.push(obbFromBasis(b.mid, b.Rj, b.Uj, b.Nj, b.t / 2));
    }
    return out;
  }

  // the round-20 emitter, kept EXACTLY as it was, because it is the control arm
  function rect(C, R, U, uv, both) {
    Q.rect(C, R, U, uv[0], uv[1], uv[2], uv[3]);
    prints++;
    if (!both) return;
    const n = cross3(R, U);
    const l = Math.hypot(n[0], n[1], n[2]) || 1, e = 0.0015 / l;
    Q.rect([C[0] - n[0] * e, C[1] - n[1] * e, C[2] - n[2] * e],
      [-R[0], -R[1], -R[2]], U, uv[0], uv[1], uv[2], uv[3]);
    prints++;
  }

  return {
    card, cardBoxes, slabs,
    stats: () => ({ boards: rims, prints, cards, sheared, shearMaxDeg: +(shearMax * 180 / Math.PI).toFixed(2) }),
  };
}

const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
// Rodrigues, about a unit axis
function rotAbout(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kv = cross3(k, v), kd = dot3(k, v);
  return [
    v[0] * c + kv[0] * s + k[0] * kd * (1 - c),
    v[1] * c + kv[1] * s + k[1] * kd * (1 - c),
    v[2] * c + kv[2] * s + k[2] * kd * (1 - c),
  ];
}

// ---------------------------------------------------------------------------
// THE CHECK, AND IT READS THE BUILT MESH.
//
// The corruption it exists to catch is the one this file's whole risk is: the
// basis -> euler conversion silently disagreeing with the one Batch.build uses,
// so every card in the store gets a board at a plausible wrong angle and
// nothing throws. It does NOT re-run eulerXYZ and compare with itself. It finds
// each recorded slab's instance in the LIVE `fixtures` InstancedMesh by its
// world position and compares that matrix's three axes with the card frame the
// print was drawn on.
//
// Denominator is stated: slabs recorded, slabs matched in the live mesh, slabs
// whose axes disagree. A slab that is missing from the mesh counts as bad —
// that is r17's baked-but-never-placed, and it is exactly what would happen if
// someone routed the boards into a batch that is never built.
export function cardCheck(THREE, scene, slabs, opts = {}) {
  const tol = opts.tol ?? 2e-4;
  const out = { recorded: slabs.length, matched: 0, missing: 0, bad: 0, worst: 0, worstAt: null };
  if (!slabs.length) return out;
  let mesh = null;
  scene.traverse((o) => { if (!mesh && o.isInstancedMesh && o.name === 'fixtures') mesh = o; });
  if (!mesh) { out.missing = slabs.length; out.note = 'no fixtures InstancedMesh in the scene'; return out; }
  // index the live matrices by quantised position
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  // A 5 mm bucket with a nearest-within-0.1-mm search inside it, rather than a
  // single rounded key: instanceMatrix is float32, so a key quantised right at
  // a boundary would report a slab MISSING that is sitting in the mesh, and a
  // check that reports a false failure gets disarmed by the next person.
  const G = 0.005, bk = (x, y, z) => Math.floor(x / G) + ',' + Math.floor(y / G) + ',' + Math.floor(z / G);
  const idx = new Map();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    const k = bk(p.x, p.y, p.z);
    let b = idx.get(k); if (!b) idx.set(k, b = []);
    b.push([p.x, p.y, p.z, i]);
  }
  const find = (c) => {
    let best = -1, bd = 1e-4;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const b = idx.get(bk(c[0] + dx * G, c[1] + dy * G, c[2] + dz * G));
      if (!b) continue;
      for (const e of b) {
        const d = Math.hypot(e[0] - c[0], e[1] - c[1], e[2] - c[2]);
        if (d < bd) { bd = d; best = e[3]; }
      }
    }
    return best;
  };
  for (const sl of slabs) {
    const i = find(sl.c);
    if (i < 0) { out.missing++; continue; }
    out.matched++;
    mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    const R = new THREE.Matrix4().makeRotationFromQuaternion(q).elements;
    const live = [[R[0], R[1], R[2]], [R[4], R[5], R[6]], [R[8], R[9], R[10]]];
    let err = 0;
    for (let a = 0; a < 3; a++) {
      const want = a === 0 ? sl.X : a === 1 ? sl.Y : sl.Z;
      for (let k = 0; k < 3; k++) err = Math.max(err, Math.abs(live[a][k] - want[k]));
    }
    if (err > out.worst) { out.worst = err; out.worstAt = sl.c.map((v) => +v.toFixed(3)); }
    if (err > tol) {
      out.bad++;
      // NAME THE OFFENDERS. A count is not a diagnosis, and the first run of
      // this check returned 1226 with nothing to look at.
      (out.badAt = out.badAt || []).length < 4 && out.badAt.push({
        at: sl.c.map((v) => +v.toFixed(4)), err: +err.toFixed(6),
        X: sl.X.map((v) => +v.toFixed(4)), Y: sl.Y.map((v) => +v.toFixed(4)),
        Z: sl.Z.map((v) => +v.toFixed(4)), s: sl.s.map((v) => +v.toFixed(4)),
        live: [live[0].map((v) => +v.toFixed(4)), live[1].map((v) => +v.toFixed(4)), live[2].map((v) => +v.toFixed(4))],
      });
    }
  }
  return out;
}
// FIRE THE CHECK ON THE WRONG EXPRESSION. If the boards had been oriented by
// reading the same matrix as a ZYX euler — the single likeliest mistake, and
// the one that agrees with XYZ on every axis-aligned card — how many of the
// recorded slabs would cardCheck have caught? A guard that cannot answer this
// is the vacuous kind this project has now shipped twice.
export function cardSelfTest(slabs, tol = 2e-4) {
  let bad = 0, worst = 0;
  for (const sl of slabs) {
    const e = eulerZYX(sl.X, sl.Y, sl.Z);
    const M = basisOf(e[0], e[1], e[2]);
    let err = 0;
    for (let a = 0; a < 3; a++) {
      const want = a === 0 ? sl.X : a === 1 ? sl.Y : sl.Z;
      for (let k = 0; k < 3; k++) err = Math.max(err, Math.abs(M[a][k] - want[k]));
    }
    if (err > worst) worst = err;
    if (err > tol) bad++;
  }
  return { n: slabs.length, bad, worst };
}
