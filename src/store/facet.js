// OWNER: builder-store (round 23). THE SIDE FACE AND THE TOP FACE.
//
// EXPORT CONTRACT
//   FACET                 the round's dials, read off the URL
//   extentAlong(...)      THE ONE OWNER of "how much room in front of the lip
//                         does this rotated package need". Exact, closed form;
//                         extentBox / extentRound are its two branches.
//   comb(u, prev, amp)    the alternating per-facing depth step
//   sideCheck(scene)      shipped assertion: the clearance model IS the geometry
//   leanStats(scene)      what the round-22 clearance term was charging for
//   sideSelfTest()        proves sideCheck against the exact corruption it catches
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
//
// r22's blind critic: "Product facings have no third dimension. Every
// rank-and-file facing is one flat co-planar billboard — no top face, no side
// face, no thickness — separated by constant-width black voids." The
// observation is right and the stated mechanism is wrong: the lead measured
// 120 instanced meshes, 69,608 instances, ZERO flat meshes, every package a
// unit cube, per-instance depth scale p50 0.146-0.153, yaw not locked. They are
// boxes and they already have depth.
//
// MEASURED, on the shipped build, with a face-attribution census that reads the
// view-space normal of every package pixel (shots/_probe_r23.js):
//
//   VISIBLE-SIDE FLIP RATE, box/bag facings, near_a1 / near_a4 / near_a7
//       0.993   0.959   1.000
//
// THE SIDE FACES ARE THERE AND THEY ALREADY OBEY PERSPECTIVE. The visible side
// swaps across the optical axis on 96-100% of bands — which the render was
// always going to do, because it is a projection. Half of the critic's test was
// already passing. What fails is the WIDTH, and the reason is arithmetic. For a
// fronto-parallel wall the projected width of the side face of a facing at
// lateral offset X, occluded by its neighbour, is
//
//       f * ( X * delta + gap * D ) / ( D * ( D + delta ) )
//
// where `delta` is the depth difference between that facing and the one beside
// it. Every offset-dependent term is carried by `delta`. Read straight off a
// depth pass AT THE BAND — the two facings either side of a side band are
// adjacent by construction, so no bucketing rule is involved:
//
//                        median delta, mm      adjacent pairs under 5 mm
//       near_a1                10.5                    36.6%
//       near_a4                 9.5                    32.2%
//       near_a7                47.7                    26.7%
//
// A third of adjacent facings within 5 mm of one plane makes the constant
// `gap * D` term the whole band, and a constant-width sliver showing a face
// that renders at 14-38% of the neighbouring front face's luminance is exactly
// the "constant-width black void" the critic named. The voids ARE the side
// faces. They are narrow because the wall is flat, not because the boxes are.
//
// So this file does two things and neither of them adds a triangle:
//   1. THE COMB. A per-facing depth step that alternates sign along a run, so
//      adjacent `delta` is large while the block's MEAN depth is unchanged —
//      which is what keeps round 20's lip line and the occupancy field where
//      they were. It runs in fillShelf's front rank AND in fillBackRow, where
//      `back = pd/2 + 0.008` made every box in a rank exactly co-planar: 90% of
//      the 30,231 carton instances in this store are back rank, and that was the
//      largest flat population in the building.
//   2. THE CLEARANCE. `place()` charged `half + lean` in front of the lip,
//      where `lean = |sin(roll)| * sy / 2`. That term is exactly right for a
//      run on the X axis and exactly ZERO for a run on the Z axis, and the code
//      applied it to both. See extentAlong.
//
// ---- THE RESULT, INCLUDING THE HALF THAT DID NOT WORK ----------------------
// `?flatface&leanpad` is round 22's placement on this same tree — instance for
// instance, because every term added here is a HASH and not an rng draw, so the
// two arms differ in three expressions and nothing else. Same probe, same
// protocol, one page load each:
//
//                              CONTROL          SHIPPED
//   adjacent delta p50 mm      10.5 9.5 47.7    20.4 12.6 43.8
//   adjacent pairs < 5 mm      36.6 32.2 26.7   22.6 22.9 17.2   %
//   side-band width, px         11.4 8.7 6.4    12.3 9.5 6.9
//   instance-matrix stagger    p25 7.8 p50 21.6 p25 16.5 p50 35.3   mm
//
//   corr( |offset|, band width / its own facing's width )
//                              0.036 0.286 0.093   0.075 0.284 0.068
//
// THE DEPTH RELIEF MOVED AND THE CRITIC'S CORRELATION DID NOT. That is the
// round's own refutation and it is not a measurement problem: the regression
// slope, which is what the model actually predicts, is 0.18/1.44/0.79 against
// 0.43/1.59/0.75 per thousand px with standard errors of 0.27/0.19/0.41 — one
// pose moves within noise and two do not move at all. The diagnosis is in the
// INTERCEPTS: 0.39 at near_a1 and 0.51 at near_a7 mean that at the optical
// axis, where perspective says a side face should be invisible, the mean band
// is already 39-51% of its facing's width. That population is not the seam
// between two rank-and-file facings — it is face-turned units, block ends
// against holes, and front-rank-against-back-rank pairs whose delta is 150-200
// mm however far off axis they sit. The seam the critic's Panel C shows is a
// minority of the bands this census collects, and widening it does not move a
// correlation computed over all of them.
// ---------------------------------------------------------------------------

const urlHas = (re) => { try { return re.test(location.search); } catch { return false; } };

// `?flatface` turns the comb off in both fill functions; `?leanpad` puts the
// round-22 clearance term back. Together they are round 22's placement on this
// same source tree. They are URL dials and not live toggles for the same reason
// products.js's `?flat` is — the store is baked once per page load — and they
// are scoped so the two arms differ in three expressions and nothing else.
//
// AND THE ARMS ARE INSTANCE-FOR-INSTANCE COMPARABLE, which is worth more than
// the dial itself: every term this round adds is a HASH of (plan seed, slot,
// deck, facing index), never an rng draw, so the fill loop makes exactly the
// same number of calls to the same stream in both arms. Measured: 25,089 of
// 28,540 plane-matched carton instances are byte-identical between the arms and
// the 3,451 that moved are the front rank, median 13.2 mm. Drawing the comb off
// `rng` would have re-rolled every facing after it on the face, and the control
// would have been a different store rather than the same one lying flatter.
//
// These dials are INDEPENDENT of round 20's. Round 19's arrangement is
// `?flat&lipflat&flatface&leanpad`; no dial here implies any other.
export const FACET = {
  on: !urlHas(/[?&]flatface(&|=|$)/),
  // the old clearance term on its own, so the geometry fix can be ablated
  // without the comb and the report can price them apart
  leanPad: urlHas(/[?&]leanpad(&|=|$)/),
};

// ---------------------------------------------------------------------------
// THE CLEARANCE, AND THE ONE-OWNER RULE.
//
// A package sits at `back` behind the lip, and `back` has to be at least the
// package's own half-extent along the lip normal or the front face crosses the
// shelf edge. products.js computed that as
//
//     half = ( |cos(dth)| * sz + |sin(dth)| * sx ) / 2        // dth = yaw - baseRy
//     lean = |sin(roll)| * sy * 0.5                           // "pay for the tip"
//     back = half + 0.002 + wander + lean + setback
//
// `half` is exact. `lean` is a SECOND, independent guess at the same quantity,
// and it is wrong for half the store. The composed rotation is R = Rx(roll) *
// Ry(yaw) — kit.js's Batch builds the quaternion from an XYZ Euler with z = 0 —
// so
//
//     R = [  cy        0     sy   ]
//         [  sr*sy    cr   -sr*cy ]
//         [ -cr*sy    sr    cr*cy ]
//
// and the world half-extent along an axis is that axis's ROW dotted with the
// scale halves. Row 0 — the extent along world X — has no roll in it at all.
// So for a run on the Z axis, whose facings look along X, `lean` is a pure
// fabrication: it pushed every leaning, crushed and knocked-over facing back by
// up to half its own HEIGHT for a swing that happens along the aisle, where
// there is nothing to swing into. On a 0.35 m carton that is 175 mm — which is
// why the most out-of-plane objects on the shelf were the ones furthest from
// the lip, a complaint products.js already makes about the flat-lying leftover
// three hundred lines below the line that causes it.
//
// This is the shadow-block hazard in AGENTS_BRIEF wearing different clothes:
// two pieces of code owned one derivation and only one of them was right.
// There is now one, it is exact for both axes, and sideCheck() proves it
// against the instance matrices the GPU is drawing.
export function extentBox(isZRun, sx, sy, sz, roll, yaw) {
  const cy = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
  // row 0 of R . (sx, sy, sz) / 2 — roll does not appear
  if (isZRun) return (cy * sx + sn * sz) / 2;
  // row 2 of R . (sx, sy, sz) / 2
  const cr = Math.abs(Math.cos(roll)), sr = Math.abs(Math.sin(roll));
  return (cr * sn * sx + sr * sy + cr * cy * sz) / 2;
}

// A lathe is not its bounding box. Its silhouette is a cylinder of radius sx/2
// about the local Y axis, which the same rotation sends to (0, cos r, sin r),
// and the extent of a cylinder along a unit n is R*sqrt(1-(a.n)^2) + H*|a.n|.
// Along world X the axis has no component at all, so — again — no roll.
export function extentRound(isZRun, sx, sy, roll) {
  if (isZRun) return sx / 2;
  const cr = Math.abs(Math.cos(roll)), sr = Math.abs(Math.sin(roll));
  return (sx / 2) * cr + (sy / 2) * sr;
}

export function extentAlong(isZRun, sx, sy, sz, roll, yaw, round) {
  return round ? extentRound(isZRun, sx, sy, roll)
    : extentBox(isZRun, sx, sy, sz, roll, yaw);
}

// What round 22 charged, kept so the two can be differenced rather than
// described. `?leanpad` puts it back in the shipped path.
export function extentR22(isZRun, sx, sy, sz, roll, yaw, baseRy, round) {
  const dth = yaw - baseRy;
  const half = round ? sz / 2
    : (Math.abs(Math.cos(dth)) * sz + Math.abs(Math.sin(dth)) * sx) / 2;
  return half + Math.abs(Math.sin(roll)) * sy * 0.5;
}

// ---------------------------------------------------------------------------
// THE COMB.
//
// `delta` has to be large between NEIGHBOURS and small in the mean, or the lip
// line moves and round 20's work is scored on top of this one. An alternating
// step does exactly that: mean zero over a run, amplitude 2A between any two
// facings that touch.
//
// A strict alternation is a comb, and this file already knows what a regular
// comb costs — "a stocker never leaves an even castellation, and an even one is
// instantly readable as a grid". So the sign flips with probability 0.80 rather
// than always, and the magnitude is drawn per facing over [0.45, 1.0] of the
// amplitude. Over a 6-facing run that is a sequence like +18 -9 -21 +14 +8 -17
// mm: no period, and still a large step at almost every seam.
//
// `u` is a uniform draw, `prev` the previous facing's signed step (0 to start).
export function comb(u, u2, prev, amp) {
  if (!(amp > 0)) return 0;
  const flip = prev === 0 ? (u2 < 0.5 ? 1 : -1)
    : (u2 < 0.80 ? -Math.sign(prev) : Math.sign(prev));
  return flip * amp * (0.45 + 0.55 * u);
}

// ---------------------------------------------------------------------------
// THE SHIPPED ASSERTION.
//
// AGENTS_BRIEF: an assertion has to read the live artefact and be proven
// against the exact corruption it catches. This one walks the instance
// matrices, recovers each package's scale and rotation from the matrix itself,
// evaluates extentAlong on the RECOVERED values, and compares that against the
// half-extent read straight off the matrix rows. If the closed form and the
// matrix disagree by more than a micron, the formula the fill algorithm is
// budgeting with is not the geometry the GPU is drawing.
//
// It is deliberately NOT a test that the setbacks look nice. It is a test that
// one derivation owns the clearance, which is the failure mode this project has
// paid for three times.
export function sideCheck(scene, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const bad = [];
  let n = 0, meshes = 0, worst = 0, worstAt = null, skipped = 0;
  const skipBy = {};
  // The AABB identity holds for every instance whatever its geometry, so the
  // model side of this comparison is always the BOX form. extentRound is a
  // TIGHTER bound inside it (a cylinder is not its bounding box) and is proven
  // by arithmetic in its own comment, not here.
  const ext = opts.ext || extentBox;
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || !o.geometry) return;
    const g = o.geometry;
    if (!g.attributes || !g.attributes.aCell) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const hx = bb.max.x - bb.min.x, hy = bb.max.y - bb.min.y, hz = bb.max.z - bb.min.z;
    meshes++;
    const M = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) {
      const b = i * 16;
      // scale = column lengths; the rotation is the matrix with them divided out
      const sx = Math.hypot(M[b], M[b + 1], M[b + 2]);
      const sy = Math.hypot(M[b + 4], M[b + 5], M[b + 6]);
      const sz = Math.hypot(M[b + 8], M[b + 9], M[b + 10]);
      if (!(sx > 0 && sy > 0 && sz > 0)) continue;
      // ---- THE POPULATION, STATED --------------------------------------
      // The closed form is exact for R = Rx(roll) * Ry(yaw), which is what
      // `place()` builds: it pushes (roll, yaw, 0) and kit.js composes an XYZ
      // Euler. Rx*Ry has R01 identically zero, so an instance with R01 != 0 was
      // pushed by somebody else — intrusions, the cart loads and three of the
      // gondola sub-batches do, 638 of 42,966 on the shipped build — and it is
      // a different population, not a failure. Counted and named rather than
      // absorbed: a check that silently widens its own rule is the shape of
      // half the retirements in AGENTS_BRIEF.
      if (Math.abs(M[b + 4]) / sy > 1e-6) {
        skipped++; skipBy[o.name] = (skipBy[o.name] || 0) + 1; continue;
      }
      // R = Rx(roll) Ry(yaw): R21 = sin(roll), R20 = -cos(roll) sin(yaw),
      // R00 = cos(yaw), R02 = sin(yaw)
      const roll = Math.asin(Math.max(-1, Math.min(1, M[b + 6] / sy)));
      const yaw = Math.atan2(M[b + 8] / sz, M[b] / sx);
      for (const isZ of [true, false]) {
        // the truth: this axis's ROW of the instance matrix, dotted with the
        // geometry's own half extents. No assumption that it is a unit cube —
        // pillowGeo's local z extent is 2.021 and that has cost a round here.
        const r0 = isZ ? 0 : 2;
        const truth = (Math.abs(M[b + r0]) * hx + Math.abs(M[b + 4 + r0]) * hy
          + Math.abs(M[b + 8 + r0]) * hz) / 2;
        const model = ext(isZ, sx * hx, sy * hy, sz * hz, roll, yaw);
        const d = Math.abs(truth - model);
        if (d > worst) { worst = d; worstAt = { mesh: o.name, i, axis: isZ ? 'x' : 'z' }; }
      }
      n++;
    }
  });
  if (!n) {
    bad.push('sideCheck saw ZERO package instances. Zero is the most suspicious reading an '
      + 'instrument can give — see AGENTS_BRIEF on checks that pass because they never run.');
  } else if (worst > tol) {
    bad.push('CLEARANCE MODEL IS NOT THE GEOMETRY: extentAlong and the instance matrix '
      + 'disagree by ' + (worst * 1000).toFixed(4) + ' mm at ' + JSON.stringify(worstAt)
      + ' over ' + n + ' instances. Two owners for one derivation — see facet.js.');
  }
  return Object.assign(bad, { instances: n, meshes, skipped, skipBy,
    worstMm: +(worst * 1e6).toFixed(4) / 1000, worstAt });
}

// PROVE IT. Feed sideCheck the round-22 expression and it must fire; feed it
// the shipped one and it must not. A guard that has never been wrong has
// probably never been tested.
export function sideSelfTest(scene) {
  const clean = sideCheck(scene);
  if (clean.length) {
    throw new Error('sideSelfTest: the SHIPPED clearance already fails its own check — '
      + clean.join(' | '));
  }
  const corrupt = sideCheck(scene, {
    ext: (isZ, sx, sy, sz, roll, yaw) => extentR22(isZ, sx, sy, sz, roll, yaw,
      isZ ? Math.PI / 2 : 0, false),
  });
  if (!corrupt.length) {
    throw new Error('sideSelfTest: sideCheck does NOT fire on the round-22 clearance term, '
      + 'so it cannot be the thing that proves round 23 changed it. worst '
      + corrupt.worstMm + ' mm over ' + corrupt.instances + ' instances.');
  }
  return { clean: clean.instances, skipped: clean.skipped, skipBy: clean.skipBy,
    cleanWorstMm: clean.worstMm, firesOnR22: true, r22WorstMm: corrupt.worstMm };
}

// ---------------------------------------------------------------------------
// WHAT THE OLD TERM WAS CHARGING FOR. Read off the artefact, per axis, so the
// report can say how much setback the fix released rather than how much the
// arithmetic says it should have.
export function leanStats(scene) {
  const z = [], x = [];
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || !o.geometry) return;
    const g = o.geometry;
    if (!g.attributes || !g.attributes.aCell) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const hx = bb.max.x - bb.min.x, hy = bb.max.y - bb.min.y, hz = bb.max.z - bb.min.z;
    const M = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) {
      const b = i * 16;
      const sx = Math.hypot(M[b], M[b + 1], M[b + 2]);
      const sy = Math.hypot(M[b + 4], M[b + 5], M[b + 6]);
      const sz = Math.hypot(M[b + 8], M[b + 9], M[b + 10]);
      if (!(sx > 0 && sy > 0 && sz > 0)) continue;
      if (Math.abs(M[b + 4]) / sy > 1e-6) continue;   // same population as sideCheck
      const roll = Math.asin(Math.max(-1, Math.min(1, M[b + 6] / sy)));
      const yaw = Math.atan2(M[b + 8] / sz, M[b] / sx);
      // which axis does this facing look along? the bigger component of its
      // world +z (the printed front)
      const isZ = Math.abs(M[b + 8]) > Math.abs(M[b + 10]);
      const now = extentBox(isZ, sx * hx, sy * hy, sz * hz, roll, yaw);
      const then = extentR22(isZ, sx * hx, sy * hy, sz * hz, roll, yaw, isZ ? Math.PI / 2 : 0, false);
      (isZ ? z : x).push((then - now) * 1000);
    }
  });
  const q = (a) => {
    if (!a.length) return null;
    const s = a.slice().sort((p, r) => p - r);
    const at = (f) => +s[Math.floor(f * (s.length - 1))].toFixed(2);
    return { n: a.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), max: at(1),
      meanMm: +(a.reduce((t, v) => t + v, 0) / a.length).toFixed(2),
      over20mm: +(100 * a.filter((v) => v > 20).length / a.length).toFixed(2) };
  };
  return { zRuns: q(z), xRuns: q(x) };
}

// ---------------------------------------------------------------------------
// WHAT THIS ROUND DOES NOT REACH, stated so the next one does not re-find it.
//
// THE TOP FACE IS A HEADROOM PROBLEM, NOT A DEPTH PROBLEM. Measured off the
// same census, top faces are 6.0 / 4.4 / 2.8 % of package pixels at
// near_a1 / near_a4 / near_a7 and the comb moves that by under half a point.
// Compare the two named crops in shots/r23_fig_ref.png, cut to the same
// 115 px per facing: in reference/store_00_Drinks at (1400,840)-(1860,1000)
// FOUR OF FOUR front cartons show a top face and the stack behind is visible
// over the top of them; in the render at near_a4 (180,300)-(460,420) it is
// ZERO OF THREE. This is a count on two named crops, not a statistic — nobody
// can run the normal-attribution census on a photograph.
//
// The cause is not in this file's depth arithmetic. `fillShelf` draws
// `h = rr(kind.h[0], kind.h[1])` capped at `headroom - 0.03` and then stacks
// `STACKABLE` kinds until `floor((headroom - 0.015) / h)` is used up, so the
// front rank routinely reaches within 15-30 mm of the deck above it. At an
// eye height of 1.55 m the sightline over a facing's top is cut off by the
// shelf above long before the top face has any width, and the rank behind can
// never be seen over the front rank at all. Fixing that means shelving shorter
// blocks under taller decks — a planogram change with a density cost, which is
// the store's first bar item, so it wants its own round and its own control.
//
// THE SIDE FACE IS DARK, AND NOT FROM HERE. Side faces render at a median
// 14-38% of the luminance of the front face beside them, in the shipped output
// transform, and the comb does not change that (0.238/0.138/0.380 control
// against 0.239/0.148/0.367 shipped). Packages have castShadow and
// receiveShadow false, so that ratio is Lambert plus light.js's AO term against
// a normal pointing along the aisle — it is the light rig and the material,
// neither of which is products.js's. A wider band that is still at a fifth of
// its neighbour's luminance is a wider dark seam.
