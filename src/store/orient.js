// OWNER: builder-store (round 24). THE HAND THAT PUT IT THERE.
//
// EXPORT CONTRACT
//   ORIENT              the round's dial, read off the URL
//   hand(U, opts)       the per-unit orientation triple (turn, lean, rise),
//                       drawn from six HASH uniforms and never from `rng`
//   seat(r, y, sx,sy,sz) THE ONE OWNER of "how far up does a rotated package's
//                       centre have to sit so its lowest corner rests on the
//                       deck". Row 1 of the same R that facet.js owns rows 0
//                       and 2 of. Exact, closed form.
//   seatCheck(scene)    shipped assertion: the seat model IS the geometry
//   seatSelfTest(scene) proves seatCheck against the exact expression it replaced
//   handStats(scene,PL) the orientation census — what a critic is looking at
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS
//
// r23's blind critic, on frames that scored 10/10 for the twenty-third round
// running: "EVERY PACKAGE IN THE STORE SHARES ONE GLOBAL ORIENTATION. Carton
// vertical edges are mutually parallel and lean the same way; adjacent units
// are separated by constant-width slots instead of touching; top edges are
// collinear."
//
// Measured on the shipped build before this file existed — front-rank rigid
// cartons only, 3,022 instances matched against products.js's own face
// registry, orientation recovered from the instance matrices:
//
//     roll (the in-image lean of a vertical edge on a Z-run)   IQR  1.23 deg
//     yaw about the rail                                       IQR  4.47 deg
//     |top-edge step| between adjacent facings, 1,657 pairs    p50  3.77 mm
//     world gap between adjacent facings                       p50  1.12 mm
//
// TWO OF THOSE NUMBERS SAY THE CRITIC IS RIGHT AND ONE SAYS THE STATED
// MECHANISM IS NOT. The lean is 1.2 degrees wide, so every carton on the shelf
// really is plumb to within about half a degree of every other one, and the top
// step is 1.5% of a 250 mm carton's height where the reference photograph's is
// 4-22%. But the "constant-width slots" are NOT air: 45.6% of adjacent
// front-rank pairs are already touching or interpenetrating in world space and
// the median gap is 1.1 mm. Round 23 established what the slots actually are —
// they are the near facing's SIDE FACE, rendering at 14-38% of the luminance of
// the front face beside it. So slot width IS orientation, and the way to stop
// the slots being constant-width is to stop the units being identically
// oriented, not to close a gap that is already closed.
//
// THE THREE TERMS
//
//   turn   yaw about the shelf's up axis. This is the one the critic's own
//          acceptance test is about: "per-unit random yaw, not perspective,
//          dominates side-face width in a real rank". A unit turned by theta
//          presents a side face of world width sz*|sin theta| REGARDLESS of
//          where it sits in the frame, so it is exactly the term that puts
//          variance into side-face width AT A FIXED OFFSET.
//   lean   roll about world X. On a Z-axis run — 85% of the front-rank cartons
//          in this building — that is the in-image lean, and extentAlong's row
//          0 has no roll in it, so it costs the lip line NOTHING. On an X-axis
//          run the same rotation pitches the box out of the shelf instead of
//          along the rail, which is a different and much rarer event (a box
//          that pitches out of a shelf falls off it), so X runs take 0.35 of
//          the amplitude and pay `sin(roll)*sy/2` of clearance for it. That is
//          a modelling decision and not a metric one; it is stated here so the
//          next round can price it. The consequence is that this round fixes
//          the lean cue on the gondola runs and barely moves it on the wall
//          fixtures.
//   rise   per-unit height. A brand block is not one SKU: reference/store_00's
//          Cap'n Crunch block at (1320,780)-(1920,1060) has four adjacent
//          facings whose tops sit at 855 / 860 / 854 / 827 px on a 125 px box,
//          i.e. adjacent steps of 4% / 5% / 22% of the box height. The render's
//          per-unit height jitter was rr(0.965, 1.035), which is 1.5%.
//
// WHY NOT MORE. `rise` is applied to the plain `carton/box` outline and not to
// `carton/wrap`, whose own aspect already sits at 0.284 against a band floor of
// 0.28 — a shrink-wrapped multipack's height is set by the cans inside it and
// does not vary within a block, which is both the physical reason and the
// reason clampAspect would otherwise start narrowing those facings and OPEN the
// gaps this round is trying to close. `lean` is applied to boxes and bags and
// not to cans and bottles: a lathe has no vertical edge to lean, a leaning can
// rolls off the shelf, and `seat` below is exact only for the unit-cube
// geometries (measured live: carton/box, carton/wrap, pouch/bag, pouch/gusset
// are all dx=dy=dz=1.000; the lathes are 0.827-0.989 in x).
//
// EVERY TERM IS A HASH, NEVER AN RNG DRAW — the rule round 23 set. `?flatyaw`
// is therefore not a different store, it is THIS store with three expressions
// zeroed, facing for facing, and the fill loop makes exactly the same number of
// calls to the same stream in both arms.
// ---------------------------------------------------------------------------

const urlHas = (re) => { try { return re.test(location.search); } catch { return false; } };

// `?flatyaw` restores round 23's orientation: the baseline yaw skew alone, roll
// at rr(-0.018, 0.018) for rigid units, height at rr(0.965, 1.035), and the
// round-23 lying-flat lift expression instead of `seat`. It is INDEPENDENT of
// `?flat`, `?lipflat`, `?flatface` and `?leanpad`; round 22's arrangement on
// this tree is `?flatface&leanpad&flatyaw`.
// `?noturn`, `?nolean`, `?norise`, `?noseat` ablate ONE term at a time, so the
// three can be priced apart the way round 22's ink and tone halves were. They
// are debug dials, not shipping arrangements, and `?flatyaw` is the control.
export const ORIENT = {
  on: !urlHas(/[?&]flatyaw(&|=|$)/),
  noTurn: urlHas(/[?&]noturn(&|=|$)/),
  noLean: urlHas(/[?&]nolean(&|=|$)/),
  noRise: urlHas(/[?&]norise(&|=|$)/),
  noSeat: urlHas(/[?&]noseat(&|=|$)/),
};

// The ledger. Same argument as CLAMP_LOG and COMB_LOG in products.js: a term
// that fires on everything and a term that never fires look identical from the
// outside, and the only thing that separates them is the distribution of what
// they did. Reported, never asserted.
export const HAND_LOG = {
  n: 0, leanN: 0, riseN: 0, turnTail: 0, leanTail: 0,
  turnAbs: 0, leanAbs: 0, riseSum: 0, seatSum: 0, seatMax: 0, seatN: 0,
};
export function handLog() {
  const L = HAND_LOG, d = Math.max(1, L.n);
  return {
    units: L.n,
    turnMeanDeg: +(L.turnAbs / d * 180 / Math.PI).toFixed(2),
    turnTailPc: +(100 * L.turnTail / d).toFixed(2),
    leanUnits: L.leanN,
    leanMeanDeg: +(L.leanAbs / Math.max(1, L.leanN) * 180 / Math.PI).toFixed(2),
    leanTailPc: +(100 * L.leanTail / Math.max(1, L.leanN)).toFixed(2),
    riseUnits: L.riseN,
    riseMean: +(L.riseSum / Math.max(1, L.riseN)).toFixed(4),
    seatN: L.seatN,
    seatMeanMm: +(1000 * L.seatSum / Math.max(1, L.seatN)).toFixed(2),
    seatMaxMm: +(1000 * L.seatMax).toFixed(1),
  };
}

const NO_HAND = { turn: 0, lean: 0, rise: 1 };

// ---------------------------------------------------------------------------
// THE HAND. Six uniforms in [0,1), one triple out.
//
// Both angular terms are a MIXTURE and not a widened uniform, because that is
// what the reference photograph shows: three of the four Cap'n Crunch facings
// are square to the rail to within a couple of degrees and the fourth is turned
// far enough to show most of a side face. A uniform wide enough to produce the
// fourth would put every facing halfway to it, which reads as a spill rather
// than as a shelf.
//
//   turn   core +-3.2 deg;  1 unit in 4 at 6.9-17.2 deg
//   lean   core +-3.0 deg;  1 unit in 6 at 5.2-10.9 deg
//   rise   1 - 0.085 * u^1.4   ->  p50 0.972, p90 0.926, floor 0.915
//
// `gain` is the bay's own tidiness, which products.js already carries as
// BS.skew (0.32 just-fronted .. 3.10 been-a-Saturday). It is FLOORED and
// CAPPED here rather than used raw: a just-fronted bay is tidier, not
// laser-aligned, and a Saturday bay is a mess, not a car crash.
export function hand(U, opts = {}) {
  if (!ORIENT.on) return NO_HAND;
  const gain = Math.max(0.55, Math.min(1.65, 0.60 + 0.40 * (opts.gain ?? 1)));
  const axis = opts.axis ?? 1;              // 1 on a Z run, 0.35 on an X run
  const tTail = U[0] < 0.26;
  const turn = ORIENT.noTurn ? 0 : gain * (tTail
    ? (0.120 + 0.180 * U[1]) * (U[2] < 0.5 ? 1 : -1)
    : (U[1] - 0.5) * 0.110);
  let lean = 0;
  if (opts.lean && !ORIENT.noLean) {
    const lTail = U[3] < 0.17;
    lean = gain * axis * (lTail
      ? (0.090 + 0.100 * U[4]) * (U[5] < 0.5 ? 1 : -1)
      : (U[4] - 0.5) * 0.104);
  }
  const rise = opts.rise && !ORIENT.noRise ? 1 - 0.085 * Math.pow(U[2], 1.4) : 1;
  HAND_LOG.n++;
  HAND_LOG.turnAbs += Math.abs(turn);
  if (tTail) HAND_LOG.turnTail++;
  if (opts.lean) {
    HAND_LOG.leanN++; HAND_LOG.leanAbs += Math.abs(lean);
    if (U[3] < 0.17) HAND_LOG.leanTail++;
  }
  if (opts.rise) { HAND_LOG.riseN++; HAND_LOG.riseSum += rise; }
  return { turn, lean, rise };
}

// ---------------------------------------------------------------------------
// THE SEAT, AND THE ONE-OWNER RULE AGAIN.
//
// products.js places a package with its centre at `deck + sy/2`, which puts the
// bottom face exactly on the deck — for an UNROTATED box. Rotate it and the
// lowest corner drops below the centre by the world Y half-extent instead of by
// sy/2, so the corner buries itself in the shelf board. That was already
// happening before this round: the `crushed` state rolls up to 0.17 rad, which
// on a 0.25 m x 0.10 m carton sinks a corner 10 mm into the deck, and the
// `leaning` state rolls up to 0.30 rad. Nobody had noticed because the sunk
// corner is behind the shelf lip.
//
// products.js's `place` builds R = Rx(roll) * Ry(yaw) — kit.js's Batch composes
// an XYZ Euler with z = 0 — so
//
//     R = [  cy        0     sy   ]
//         [  sr*sy    cr   -sr*cy ]
//         [ -cr*sy    sr    cr*cy ]
//
// and the world half-extent along Y is ROW 1 dotted with the scale halves:
//
//     ( |sr*sy_| * sx  +  |cr| * sy  +  |sr*cy_| * sz ) / 2
//
// facet.js owns rows 0 and 2 of this same matrix (extentAlong, the clearance in
// front of the lip). This is row 1, it lives in exactly one place, and
// seatCheck() asserts it against the instance matrices the GPU is drawing.
// Deliberate duplication with a comment explaining itself is how every one of
// this project's shadow-block bugs started; a second copy needs an assertion
// that fails loudly when the two disagree.
//
// EXACT ONLY FOR A UNIT-CUBE GEOMETRY. Measured live off the buffers:
// carton/box, carton/wrap, pouch/bag and pouch/gusset are all dx=dy=dz=1.000
// and centred on the origin. The lathes are not (0.827-0.989 in x), which is
// the other reason cans and bottles take no lean here.
export function seatExtent(roll, yaw, sx, sy, sz) {
  const sr = Math.abs(Math.sin(roll)), cr = Math.abs(Math.cos(roll));
  const sn = Math.abs(Math.sin(yaw)), cs = Math.abs(Math.cos(yaw));
  return (sr * sn * sx + cr * sy + sr * cs * sz) / 2;
}
export function seat(roll, yaw, sx, sy, sz) {
  return seatExtent(roll, yaw, sx, sy, sz) - sy / 2;
}

// What round 23 wrote for the one case it handled — the facing knocked over
// onto its face, roll = pi/2 — kept so the two can be differenced rather than
// described. It is `seat` restricted to a Z run: on an X run, where the box
// pitches over its DEPTH and not over its width, it is wrong by (sx - sz)/2.
export function seatR23(sx, sy) { return (sx - sy) / 2; }

// ---------------------------------------------------------------------------
// THE SHIPPED ASSERTION. Same shape as facet.js's sideCheck and for the same
// reason: walk the instance matrices, recover scale and rotation FROM THE
// MATRIX, evaluate the closed form on the recovered values, and compare against
// the half-extent read straight off row 1. If they disagree by more than a
// micron then the seat the fill loop is placing with is not the geometry the
// GPU is drawing.
//
// THE POPULATION IS STATED AND COUNTED, not widened. R = Rx*Ry has R01
// identically zero; an instance with R01 != 0 was pushed by somebody else
// (intrusions, the cart loads, three gondola sub-batches) and is a different
// population, enumerated by mesh exactly as sideCheck enumerates it.
export function seatCheck(scene, opts = {}) {
  const tol = opts.tol ?? 1e-6;
  const ext = opts.ext || seatExtent;
  const bad = [];
  let n = 0, meshes = 0, worst = 0, worstAt = null, skipped = 0;
  const skipBy = {};
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
      const sx = Math.hypot(M[b], M[b + 1], M[b + 2]);
      const sy = Math.hypot(M[b + 4], M[b + 5], M[b + 6]);
      const sz = Math.hypot(M[b + 8], M[b + 9], M[b + 10]);
      if (!(sx > 0 && sy > 0 && sz > 0)) continue;
      if (Math.abs(M[b + 4]) / sy > 1e-6) {
        skipped++; skipBy[o.name] = (skipBy[o.name] || 0) + 1; continue;
      }
      const roll = Math.asin(Math.max(-1, Math.min(1, M[b + 6] / sy)));
      const yaw = Math.atan2(M[b + 8] / sz, M[b] / sx);
      // the truth: row 1 of the instance matrix dotted with the geometry's own
      // half extents. No assumption that the geometry is a unit cube.
      const truth = (Math.abs(M[b + 1]) * hx + Math.abs(M[b + 5]) * hy
        + Math.abs(M[b + 9]) * hz) / 2;
      const model = ext(roll, yaw, sx * hx, sy * hy, sz * hz);
      const d = Math.abs(truth - model);
      if (d > worst) { worst = d; worstAt = { mesh: o.name, i }; }
      n++;
    }
  });
  if (!n) {
    bad.push('seatCheck saw ZERO package instances. Zero is the most suspicious reading '
      + 'an instrument can give — see AGENTS_BRIEF on checks that pass because they never run.');
  } else if (worst > tol) {
    bad.push('SEAT MODEL IS NOT THE GEOMETRY: seatExtent and row 1 of the instance matrix '
      + 'disagree by ' + (worst * 1000).toFixed(4) + ' mm at ' + JSON.stringify(worstAt)
      + ' over ' + n + ' instances. Two owners for one derivation — see orient.js.');
  }
  return Object.assign(bad, { instances: n, meshes, skipped, skipBy,
    worstMm: +(worst * 1e6).toFixed(4) / 1000, worstAt });
}

// PROVE IT. Feed seatCheck the round-23 expression — which is seat() with the
// yaw terms thrown away, i.e. correct on a Z run and wrong on an X run — and it
// must fire. Feed it the shipped one and it must not.
export function seatSelfTest(scene) {
  const clean = seatCheck(scene);
  if (clean.length) {
    throw new Error('seatSelfTest: the SHIPPED seat already fails its own check — '
      + clean.join(' | '));
  }
  const corrupt = seatCheck(scene, {
    // r23's lying-flat lift, restated as an extent: sx/2 whatever the yaw is.
    ext: (roll, yaw, sx, sy) => {
      const sr = Math.abs(Math.sin(roll)), cr = Math.abs(Math.cos(roll));
      return (sr * sx + cr * sy) / 2;
    },
  });
  if (!corrupt.length) {
    throw new Error('seatSelfTest: seatCheck does NOT fire on the Z-run-only seat, so it '
      + 'cannot be the thing that proves this round changed it. worst '
      + corrupt.worstMm + ' mm over ' + corrupt.instances + ' instances.');
  }
  // and the identity the lying-flat case relies on: at roll = pi/2 on a Z run,
  // seat() reproduces round 23's `-h/2 + sx/2` exactly.
  const a = seat(Math.PI / 2, Math.PI / 2, 0.21, 0.29, 0.11);
  const b = seatR23(0.21, 0.29);
  if (Math.abs(a - b) > 1e-12) {
    throw new Error('seatSelfTest: seat() does not reproduce the round-23 lying-flat lift '
      + 'on a Z run: ' + a + ' vs ' + b);
  }
  return { clean: clean.instances, skipped: clean.skipped, skipBy: clean.skipBy,
    cleanWorstMm: clean.worstMm, firesOnZOnly: true, zOnlyWorstMm: corrupt.worstMm,
    r23Identity: true };
}

// ---------------------------------------------------------------------------
// THE ORIENTATION CENSUS. What the critic is looking at, read off the instance
// matrices, on the population products.js's own face registry defines.
//
// `planes` is facePlanes() and is PASSED IN rather than imported, so this file
// does not close a cycle with products.js and so the census cannot invent its
// own idea of where the shelf plane is — the trap round 23's first stagger
// census fell into, which recovered the plane as a quantile of the instances it
// was measuring and reported the 175 mm rank pitch as a facing stagger.
//
// EVERY NUMBER IS PER-UNIT AND OFFSET-FREE. Nothing here is an image row on a
// receding surface, and nothing here needs a camera, which is the point: the
// cue is about orientation and orientation is in the matrices.
export function handStats(scene, planes, opts = {}) {
  const near = opts.near ?? 0.35;
  const planeOf = (along, cross, axis) => {
    let best = null, bd = 1e9;
    for (const p of planes) {
      if (p.axis !== axis) continue;
      if (along < p.a0 || along > p.a1) continue;
      const d = (p.plane - cross) * p.face;
      if (d < -0.12 || d > 0.85) continue;
      if (Math.abs(d) < bd) { bd = Math.abs(d); best = p; }
    }
    return best;
  };
  const rows = new Map();
  const yawZ = [], yawX = [], rollZ = [], rollX = [], sideMm = [];
  let matched = 0, frontRank = 0;
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || !o.geometry) return;
    const g = o.geometry;
    if (!g.attributes || !g.attributes.aCell) return;
    if (!/^carton\//.test(g.name || '')) return;      // rigid boxes only
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    const hx = (bb.max.x - bb.min.x) / 2, hy = (bb.max.y - bb.min.y) / 2,
      hz = (bb.max.z - bb.min.z) / 2;
    const M = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) {
      const b = i * 16;
      const sx = Math.hypot(M[b], M[b + 1], M[b + 2]);
      const sy = Math.hypot(M[b + 4], M[b + 5], M[b + 6]);
      const sz = Math.hypot(M[b + 8], M[b + 9], M[b + 10]);
      if (!(sx > 0 && sy > 0 && sz > 0)) continue;
      if (Math.abs(M[b + 4]) / sy > 1e-6) continue;     // sideCheck's population
      const cx = M[b + 12], cy = M[b + 13], cz = M[b + 14];
      const alongZ = Math.abs(M[b + 8]) > Math.abs(M[b + 10]);
      const ex = Math.abs(M[b]) * hx + Math.abs(M[b + 4]) * hy + Math.abs(M[b + 8]) * hz;
      const ez = Math.abs(M[b + 2]) * hx + Math.abs(M[b + 6]) * hy + Math.abs(M[b + 10]) * hz;
      const ey = Math.abs(M[b + 1]) * hx + Math.abs(M[b + 5]) * hy + Math.abs(M[b + 9]) * hz;
      const along = alongZ ? cz : cx, cross = alongZ ? cx : cz;
      const pl = planeOf(along, cross, alongZ ? 'z' : 'x');
      if (!pl) continue;
      matched++;
      const behind = (pl.plane - (cross + pl.face * (alongZ ? ex : ez))) * pl.face;
      // THE FRONT RANK, cut against the REGISTERED plane and never against a
      // quantile of the measured population. Same window facet.js's stagger
      // census uses: the front rank's own deepest setback is about 115 mm and
      // round 20 lets it come 75 mm proud.
      if (behind < -0.12 || behind > 0.17) continue;
      frontRank++;
      const roll = Math.asin(Math.max(-1, Math.min(1, M[b + 6] / sy)));
      const yaw = Math.atan2(M[b + 8] / sz, M[b] / sx);
      const baseRy = alongZ ? (pl.face > 0 ? Math.PI / 2 : -Math.PI / 2)
        : (pl.face > 0 ? 0 : Math.PI);
      let d = yaw - baseRy;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      (alongZ ? yawZ : yawX).push(d);
      (alongZ ? rollZ : rollX).push(roll);
      // THE PER-UNIT SIDE FACE, in millimetres of world, with no camera in it.
      // This is the term the r23 critic named: a unit turned by theta shows a
      // side face of sz*|sin theta| whatever its offset from the optical axis.
      sideMm.push(Math.abs(Math.sin(d)) * sz * hz * 2 * 1000);
      const r = alongZ ? 2 : 0;
      const ea = Math.abs(M[b + r]) * hx + Math.abs(M[b + 4 + r]) * hy
        + Math.abs(M[b + 8 + r]) * hz;
      const key = pl.axis + '|' + pl.face + '|' + Math.round(pl.plane * 100)
        + '|' + Math.round((cy - ey) / 0.03);
      let a = rows.get(key); if (!a) { a = []; rows.set(key, a); }
      a.push({ along, ea, top: cy + ey });
    }
  });
  const gaps = [], tops = [];
  for (const a of rows.values()) {
    if (a.length < 2) continue;
    a.sort((p, q) => p.along - q.along);
    for (let i = 1; i < a.length; i++) {
      if (a[i].along - a[i - 1].along > near) continue;
      gaps.push(((a[i].along - a[i].ea) - (a[i - 1].along + a[i - 1].ea)) * 1000);
      tops.push(Math.abs(a[i].top - a[i - 1].top) * 1000);
    }
  }
  const q = (arr, f) => {
    if (!arr.length) return null;
    const s = arr.slice().sort((p, r) => p - r);
    return +s[Math.floor(f * (s.length - 1))].toFixed(3);
  };
  const deg = (v) => (v === null ? null : +(v * 180 / Math.PI).toFixed(2));
  const ang = (arr) => ({
    n: arr.length,
    p25: deg(q(arr, 0.25)), p50: deg(q(arr, 0.50)), p75: deg(q(arr, 0.75)),
    iqrDeg: deg(q(arr, 0.75) - q(arr, 0.25)),
    p05: deg(q(arr, 0.05)), p95: deg(q(arr, 0.95)),
  });
  const pc = (arr, f) => (arr.length
    ? +(100 * arr.filter(f).length / arr.length).toFixed(1) : null);
  return {
    matched, frontRank, rows: rows.size, pairs: gaps.length,
    yawZ: ang(yawZ), yawX: ang(yawX), rollZ: ang(rollZ), rollX: ang(rollX),
    sideMm: { n: sideMm.length, p25: q(sideMm, 0.25), p50: q(sideMm, 0.50),
      p75: q(sideMm, 0.75), p90: q(sideMm, 0.90),
      iqr: +((q(sideMm, 0.75) ?? 0) - (q(sideMm, 0.25) ?? 0)).toFixed(3) },
    gapMm: { p25: q(gaps, 0.25), p50: q(gaps, 0.50), p75: q(gaps, 0.75),
      iqr: +((q(gaps, 0.75) ?? 0) - (q(gaps, 0.25) ?? 0)).toFixed(2),
      touchingPc: pc(gaps, (v) => v <= 0) },
    topStepMm: { p25: q(tops, 0.25), p50: q(tops, 0.50), p75: q(tops, 0.75),
      p90: q(tops, 0.90), under5mmPc: pc(tops, (v) => v < 5) },
  };
}
