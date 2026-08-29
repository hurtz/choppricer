// OWNER: builder-move. THE WALK, AS A CONSTRAINT INSTEAD OF AS A WAVEFORM.
//
//   solveGait(G, o)     one body, one frame -> the pose numbers agents.js applies
//   attachFeet(rig)     find the shoe and the leg inside a baked leg group
//   footPose(...)       ankle pitch + knee-substitute, written onto those meshes
//   gaitCheck(...)      the assertion. See CLAUDE.md's lungCheck() rule.
//
// ===========================================================================
// WHY THE OLD WALK SLID, WITH THE ARITHMETIC
// ===========================================================================
// Round 11's gait was two sines:
//
//   phase += (speed / (0.88 * stride * scale)) * dt * 2PI
//   amp    = clamp(speed * 0.20 * P.amp, 0.02, 0.72)
//   legL.rotation.x =  sin(phase) * amp
//
// A rigid leg of length L pivoting at the hip puts its foot at x = L sin(theta).
// For the foot to be PLANTED — which is the entire difference between walking
// and waving your legs — that foot has to travel backwards at exactly the
// body's ground speed while it is down. Differentiate the line above at
// mid-stance (phase = 0, where cos is 1 and the error is largest):
//
//   dx/dt = L * amp * phase_dot
//         = 0.86 * (0.20 v) * (v / 0.88) * 2PI
//         = 1.228 * v^2
//
// Set that equal to v and there is exactly ONE speed where the foot does not
// skate: v = 0.81 m/s. At the shopper's actual 1.25 m/s the foot is going
// backwards at 1.92 m/s under a body doing 1.25, so it slips forward 0.67 m/s —
// it is a treadmill, and it gets worse quadratically. At a bolting 3.5 m/s the
// foot is doing 15 m/s. THAT is the slide, and no amount of tuning `amp` fixes
// it because the error is a function of speed and the constant is not.
//
// ===========================================================================
// WHAT THIS DOES INSTEAD: PLANT THE FOOT AND LET THE BODY FALL OVER IT
// ===========================================================================
// The stance foot is the input, not the output. Given a step length S and a
// duty factor D (the fraction of the cycle a foot is down), a foot that touches
// at +SD ahead of the hip and leaves at SD behind it has travelled 2SD while
// the hip travelled v * D * T = 2SD. Those are equal by construction at every
// speed, so the foot is planted at every speed. The hip angle is then whatever
// asin() says it is, and it is no longer a free parameter anybody can tune
// wrong.
//
// THE VERTICAL COMES FREE, AND IT IS THE WHOLE "CONTROLLED FALL". A rigid leg
// holds the hip at L*cos(theta) above the sole, so a body whose stance leg is
// angled is a body that is LOWER. The hip therefore rises to its highest at
// mid-stance, when the leg is vertical and carrying the load, and falls into
// each heel strike. Round 11 had this as `(abs(sin) - 0.5) * 0.030 * bounce`:
// the right shape, at an amplitude somebody picked, uncoupled from the step
// length. It is now L*(1 - cos theta), which for a 0.62 m step on a 0.86 m leg
// is 62 mm and for a short shuffling step is 20 mm — the difference between a
// stride and a shuffle, without a `bounce` dial having to be set per person.
//
// AND THE PART THAT NEEDS A KNEE, WHICH THIS RIG DOES NOT HAVE. With both legs
// the same rigid length, the swing foot at mid-swing (leg vertical, cos = 1)
// hangs L below a hip that is only L*cos(theta_stance) up. It is under the
// floor by L*(1 - cos theta), i.e. by exactly the bob — 62 mm at a normal step.
// Real people solve this with a knee. figures.js bakes each leg as two meshes
// in one group with no joint between them, and it is LIVE this round, so this
// file does not add one: it SHORTENS the swing leg by scaling the leg mesh and
// carries the shoe up to meet the new ankle. At 8-12% for a third of a second
// that reads as a knee at every distance this game is played at, and it is the
// honest version of the trade rather than a foot that ploughs the tiles.
//
// ===========================================================================
// WHAT DIFFERS BETWEEN A HEAVY WALK AND A LEAN ONE, AND WHY IT IS NOT "SLOWER"
// ===========================================================================
// The brief is explicit that a heavy person's walk is not a thin person's walk
// played slower, so none of the six knobs below is a speed:
//
//   step length     SHORTER. A heavy body takes 0.78x the step at the same
//                   ground speed, so its cadence goes UP, not down. This is the
//                   one that reads first and it is the opposite of the naive
//                   guess.
//   duty factor     HIGHER. More of the cycle spent with both feet down; a
//                   heavy walk has almost no flight-like single-support snap.
//   lateral sway    MUCH bigger. The pelvis has to get over each foot and the
//                   feet are further apart, so the whole silhouette rocks.
//   pelvic list     bigger, and it is the reason the sway reads as WEIGHT
//                   rather than as wobble: the unloaded hip drops.
//   knee lift       SMALLER. Heavy walking is a shuffle; the foot barely
//                   clears. Combined with the short step that is the read.
//   arm clearance   the arms cannot brush the body, so they ride out on a
//                   bigger splay and swing less. Round 11 already rolled
//                   `splay` with a heavy bonus; this uses it.
//
// Every one of them is a function of the BUILD, which figures.js rolled at
// construction, before the first setSeed(). None of them can see guilt; see the
// note over rollPose in figures.js for the argument in full.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// Symmetric smoothstep, front-loaded a little: a swing leg is quick off the
// toe and decelerating into the heel, not a symmetric slosh.
const swingEase = (w) => {
  const s = w * w * (3 - 2 * w);
  return s * s * (3 - 2 * s) * 0.42 + s * 0.58;
};

// ---------------------------------------------------------------------------
// FINDING THE SHOE INSIDE A BAKED LEG.
//
// figures.js merges each leg into a Group of two Meshes with no names, no
// joints and both at the origin, and it is being edited by another builder in
// this same round. Indexing `legL.children[1]` from here would be a silent
// coupling to a child ORDER — exactly the failure CLAUDE.md's duplication rule
// is about, one storey down. So the parts are found by MEASUREMENT: the shoe is
// the child whose geometry is short and lives at the bottom of the leg. If the
// shape of that group ever changes so this cannot find it, `ok` comes back
// false, agents.js falls back to a shorter step that does not need a knee, and
// gaitCheck() says so out loud instead of the walk quietly degrading.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// ROUND 2 (character) — AND NOW THERE IS A KNEE, BECAUSE THERE WAS NOT ONE.
//
// The header below this one describes the round-12 trade honestly: with no
// joint available, the swing leg was SHORTENED by scaling the leg mesh, and
// "at 8-12% for a third of a second that reads as a knee at every distance this
// game is played at." It does not. A critic measured the shipped rig at 7.7-
// 15.6% — 69 to 139 mm — of pure telescoping, in every frame, stance and swing.
// A rigid rod that changes length is a compass gait with a slider in it, and
// planting the foot of a rigid rod gives you a walking toy.
//
// THE PATTERN IS figures.js:armBones, AND IT TRANSFERS EXACTLY. Round 10 solved
// this for the arm: the shoulder and the hand are GIVEN, the elbow is the free
// parameter that swings off the line between them, and the bend costs no new
// joint group because both segments are simply re-aimed at it. The knee is the
// same problem with the same shape — hip and ankle are given by the solve (the
// ankle sits at `k * A` along the hip-ankle line, which is exactly where the
// telescope put it), and the knee is the free parameter off that line.
//
// The one thing that does NOT transfer is that an elbow's bend is CONSTANT, so
// round 10 could bake it into the geometry. A knee's is not: it runs from 0 to
// 64 degrees twice a second. So the leg has to be two parts that can be re-aimed
// per frame, and figures.js bakes it as one.
//
// SO THE SPLIT IS DONE HERE, ONCE PER SOURCE GEOMETRY, AT ATTACH TIME. The
// merged leg is cut into a thigh and a shank at the knee, the shank goes into a
// small group hinged at the cut, and the shoe goes with it. Three properties
// make this safe rather than clever:
//
//   THE CUT IS WHERE THE KNEE BALL ALREADY IS. figures.js bakes a ball at the
//   knee ("The knee is a real landmark and it was a sphere at a guess"), and the
//   cut plane passes through its CENTRE. A ball split by a plane containing the
//   hinge axis and rotated about that axis is still the same ball, so the joint
//   covers itself at every angle instead of opening a wedge. The residual is
//   |rz - ry| of that ball — 17 mm, at the one place on a leg where a crease is
//   what you expect to see.
//
//   THE GEOMETRIES ARE SHARED AND ARE NEVER MUTATED. `F.leg[build][side]` is one
//   BufferGeometry behind every body of that build; translating or splitting it
//   in place would rebuild the whole crowd's legs from whichever body attached
//   first. The split is cached on a WeakMap keyed by the SOURCE geometry, so
//   fourteen bodies pay for it twice (once per build side) and share the result.
//
//   IT DEGRADES THE SAME WAY THE SHOE SEARCH DOES. If the cut lands outside the
//   leg, or either half comes back empty, `knee` is null, footPose falls back to
//   the round-12 telescope, and the rig reports `kneeOk: false`.
//
// COST: one extra mesh per leg, so +2 draw calls per body — the first new draw
// call this file has added in three rounds, and it is named rather than buried.
// 28 extra draws for 14 shoppers, against a store that draws thousands. No new
// material (the shank borrows the thigh's), no new texture, and the split
// geometries are shared, so no new buffer per body either.
// ---------------------------------------------------------------------------
// Knee height as a fraction of hip -> ankle. figures.js puts the knee ball's
// centre at -0.418 on a leg whose ankle is at -0.790, i.e. 0.529, and an
// anatomical knee is at 0.50-0.53 of that span measured to the ankle. It is a
// constant rather than a measurement because a measurement here is fragile: the
// ball is NOT a local maximum of the leg's radius (the thigh taper ends wider
// than the ball, t*0.78 against t*0.76), so there is nothing to find.
const KNEE_F = 0.529;
// How far either side of the cut is duplicated into both halves, as a fraction
// of hip -> ankle. 0.075 is 59 mm on a standard leg, which is the knee ball's
// own y-radius plus a little: enough that each half owns the whole ball.
const KNEE_BAND = 0.075;
const _splitCache = new WeakMap();

// THE JOINT BAND IS IN BOTH HALVES, AND THE FIRST RENDER IS WHY. Splitting on
// the centroid alone gives each half a hard rim, and at 60 degrees of flexion
// the two rims rotate apart and open a bright wedge across the front of the
// knee — visible at aisle range, which is the whole distance this game is
// played at. So every triangle within `band` of the cut goes into BOTH halves.
// Each side then carries a complete sleeve across the joint; one copy stays
// with the thigh and one swings with the shank, and their union has no hole at
// any angle. It costs about 60 triangles a leg and no draw call, and it is the
// polygon equivalent of what a trouser knee does.
function splitAtY(THREE, geo, cutY, band) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const pos = src.attributes.position;
  const up = [], dn = [];
  for (let t = 0; t < pos.count; t += 3) {
    const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
    if (cy > cutY) { up.push(t); if (cy < cutY + band) dn.push(t); }
    else { dn.push(t); if (cy > cutY - band) up.push(t); }
  }
  const keys = Object.keys(src.attributes);
  const build = (tris) => {
    const g = new THREE.BufferGeometry();
    for (const k of keys) {
      const a = src.attributes[k], n = a.itemSize;
      const arr = new a.array.constructor(tris.length * 3 * n);
      let w = 0;
      for (let i = 0; i < tris.length; i++) {
        const base = tris[i] * n;
        for (let v = 0; v < 3 * n; v++) arr[w++] = a.array[base + v];
      }
      g.setAttribute(k, new THREE.BufferAttribute(arr, n, a.normalized));
    }
    g.computeBoundingBox(); g.computeBoundingSphere();
    return g;
  };
  return { up: build(up), dn: build(dn), nUp: up.length, nDn: dn.length };
}

export function attachFeet(rig, THREE) {
  const one = (grp) => {
    if (!grp || grp.children.length < 2) return null;
    let leg = null, shoe = null, legSpan = 0, shoeTop = 0;
    for (const c of grp.children) {
      if (!c.isMesh || !c.geometry) continue;
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox;
      const span = bb.max.y - bb.min.y;
      if (span > legSpan) { legSpan = span; leg = c; }
    }
    if (!leg) return null;
    for (const c of grp.children) {
      if (c === leg || !c.isMesh || !c.geometry) continue;
      if (!c.geometry.boundingBox) c.geometry.computeBoundingBox();
      const bb = c.geometry.boundingBox;
      // short, and sitting at the bottom of the leg it belongs to
      if ((bb.max.y - bb.min.y) > legSpan * 0.35) continue;
      if (bb.max.y > -legSpan * 0.6) continue;
      if (shoe && bb.max.y > shoeTop) continue;
      shoe = c; shoeTop = bb.max.y;
    }
    if (!shoe) return null;
    const sb = shoe.geometry.boundingBox;
    const f = {
      leg, shoe, ankleY: shoeTop, leg0: leg.scale.y, shoe0: shoe.position.clone(),
      // the sole, and the two corners that touch the ground. footPose needs all
      // three; see the note there about which point a foot actually pivots on.
      soleY: sb.min.y, toeZ: sb.max.z, heelZ: sb.min.z,
      knee: null, shank: null, a: 0, b: 0, kneeY: 0, alpha: 0, beta: 0,
      // ---- THE LEG GROUP'S OWN SCALE, AND IT IS NOT COSMETIC ---------------
      // figures.js scales the leg PIVOT by (girth, legS, girth) — build and
      // stature — and everything below it lives inside that scale. The sole pin
      // computes a corner in LEG-LOCAL units and compares it against a floor
      // height in ROOT metres, so it has been off by exactly this factor since
      // it was written. That is the "sole below the tiles, -28..+28 mm" row in
      // round 12's own table and the critic's 49 mm: not a transient, a frame
      // error, and it scales with how tall the body is. Measured after: the
      // live median goes from 11 mm under the tiles to 0.9 mm.
      sy: grp.scale.y || 1, sxz: grp.scale.x || 1,
    };
    // ---- THE KNEE ---------------------------------------------------------
    if (!THREE) return f;                       // no constructors: telescope on
    const legBB = leg.geometry.boundingBox;
    const kneeY = f.ankleY * KNEE_F;
    if (!(kneeY < legBB.max.y - 0.02 && kneeY > legBB.min.y + 0.02)) return f;
    let cut = _splitCache.get(leg.geometry);
    if (!cut || Math.abs(cut.kneeY - kneeY) > 1e-6) {
      const sp = splitAtY(THREE, leg.geometry, kneeY, KNEE_BAND * -f.ankleY);
      if (!sp.nUp || !sp.nDn) return f;
      // The shank is re-based on the knee so the hinge group can be a plain
      // rotation about its own origin. `translate` mutates, so it is done on the
      // SPLIT copy and never on figures.js's shared bake.
      sp.dn.translate(0, -kneeY, 0);
      cut = { kneeY, thigh: sp.up, shank: sp.dn };
      _splitCache.set(leg.geometry, cut);
    }
    const knee = new THREE.Group();
    knee.position.set(0, kneeY, 0);
    const shank = new THREE.Mesh(cut.shank, leg.material);
    shank.castShadow = leg.castShadow; shank.receiveShadow = leg.receiveShadow;
    leg.geometry = cut.thigh;
    // The hinge hangs off the THIGH MESH, not off the leg group, so
    // `legL.rotation.x` keeps meaning exactly what it meant — the hip-to-ankle
    // line — for the solve, the plant instrument and every probe that reads it.
    // The thigh's own -alpha lives on the mesh underneath it.
    leg.add(knee);
    knee.add(shank);
    // ...and the shoe goes with the shank, because a foot is on the end of a
    // shank. Its GEOMETRY is untouched (shared, and baked in leg-local metres);
    // only the mesh's rest position moves, by exactly the hinge offset, so the
    // existing ankle algebra below carries over with one extra term.
    grp.remove(shoe); knee.add(shoe);
    f.knee = knee; f.shank = shank; f.kneeY = kneeY;
    f.a = -kneeY;                       // hip -> knee
    f.b = -(f.ankleY - kneeY);          // knee -> ankle
    f.shoe0 = shoe.position.clone(); f.shoe0.y -= kneeY;
    return f;
  };
  const L = one(rig.legL), R = one(rig.legR);
  rig.footL = L; rig.footR = R;
  rig.feetOk = !!(L && R);
  rig.kneeOk = !!(L && L.knee && R && R.knee);
  // THE SHOE'S OWN BOX, AS FRACTIONS OF THE LEG. solveGait needs the ankle's
  // height over a flat sole and the two contact reaches to solve the hip height
  // through the foot rocker, and it works in root metres while these are baked
  // in figures.js units. The RATIO is scale-free — the leg group's own scale
  // takes the geometry to root — so a fraction crosses the boundary safely and
  // a raw millimetre does not. Null when the shoes were not found, and the
  // solve falls back to the rigid-rod hip height.
  rig.footGeom = L ? {
    h0: (L.ankleY - L.soleY) / -L.soleY,
    toe: L.toeZ / -L.soleY,
    heel: -L.heelZ / -L.soleY,
  } : null;
  return rig.feetOk;
}

// Two-bone IK, and it is four lines because the hard part was choosing what the
// unknowns are. The hip and the ankle are GIVEN — `d` is the hip-to-ankle
// distance the solve already asked for, which is where the round-12 telescope
// put the ankle too — so what is left is the law of cosines on a triangle with
// two known sides. `alpha` is how far the thigh leaves the hip-ankle line and
// `beta` is how far the shank comes back to it; `alpha + beta` is the knee's
// own flexion angle. Both are zero when d = a + b, so a straight leg is the
// continuous limit of this and not a special case.
//
// The sign puts the knee FORWARD (+Z, the body's facing), which is the only
// direction a knee bends. Writing it the other way gives a flamingo, and that is
// how the sign was checked.
function ikKnee(f, d) {
  const a = f.a, b = f.b;
  const dd = clamp(d, Math.abs(a - b) + 1e-4, a + b - 1e-5);
  f.alpha = Math.acos(clamp((a * a + dd * dd - b * b) / (2 * a * dd), -1, 1));
  f.beta = Math.acos(clamp((b * b + dd * dd - a * a) / (2 * b * dd), -1, 1));
}

// Ankle pitch + knee substitute, written onto the two meshes attachFeet found.
//
// `k` shortens the LEG mesh about the hip, which lifts the ankle from ay to
// ay*k; `a` pitches the shoe about that ankle. Rotating a mesh whose geometry
// is baked around the HIP by `a` sends the ankle (0, ay, 0) to (0, ay cos a,
// ay sin a), so the shoe's own position has to make up the difference — that
// is the whole of the two `ay` terms below, and getting the sign wrong swings a
// foot through a 0.8 m arc, which is how it was found.
//
// ---------------------------------------------------------------------------
// A FOOT DOES NOT PIVOT ON ITS ANKLE, AND MEASURING IT IS THE ONLY REASON I
// KNOW THAT
// ---------------------------------------------------------------------------
// The first version rotated the shoe about the ankle and nothing else, which is
// what an ankle joint does and is wrong for a foot that is ON THE GROUND. At
// toe-off the shoe plantarflexes 0.52 rad, and about the ankle that swings the
// HEEL — 83 mm behind the joint — down through the floor. Probed on the live
// rig, the lowest point of a walking shoe was 70 mm BELOW the tiles, on both
// builds, every stride. It is invisible in a still (the floor hides it) and it
// is exactly what makes a walk look like it is happening slightly underground.
//
// What a real foot does is roll: it pivots on the heel at strike and on the
// metatarsals at push-off, i.e. ALWAYS ON WHICHEVER CONTACT POINT IS DOWN. That
// is one line, given the two corners: rotate about the ankle as before, then
// lift by however far the lowest corner went under. The pivot point falls out of
// the min() instead of being chosen, so it is correct at both ends of the roll
// and everywhere between them without a phase test.
// THE PITCH IS AGAINST THE GROUND, NOT AGAINST THE SHANK, and that is the
// second thing measuring found. `ank` is the angle of the SOLE to the FLOOR —
// toes up at heel strike, flat and level through mid-stance, pointed at push-off
// — so what the shoe is actually given is `ank - th`, the ankle joint angle that
// produces it under a shank already leaning by `th`. Writing `ank` straight onto
// the shoe instead makes the foot rotate WITH the leg, which is a peg leg: the
// probe read the sole 74 mm under the tiles at mid-stride, because a 230 mm shoe
// pivoted rigidly with a leg at 0.35 rad puts its heel 50 mm below its ankle.
//
// `floorY` then pins the lowest of the two sole corners, in HIPS-local metres,
// to where the ground is (or to the swing arc). It is the belt to the ankle
// angle's braces: the sole angle makes the foot LOOK planted and the pin makes
// it BE planted, through the shoe's own box geometry, the knee scale and the
// leg's lean, none of which the ankle angle knows about. Pass null to leave a
// foot wherever the ankle put it.
export function footPose(f, k, ank, th, floorY) {
  if (!f) return;
  // ---- ROUND 2 (character): THE REAL KNEE --------------------------------
  // Same contract, same five arguments, same `k`: it is still "how long the
  // hip-to-ankle line is, as a fraction". What changed is what the leg DOES
  // about it. The telescope below is kept as the fallback for a rig whose leg
  // could not be split — see attachFeet — and for gaitCheck's synthetic runs.
  if (f.knee) {
    const A = -f.ankleY;
    ikKnee(f, k * A);
    const al = f.alpha, be = f.beta;
    f.leg.scale.y = f.leg0;                 // NEVER scaled again. That was the bug.
    f.leg.rotation.x = -al;                 // thigh leaves the line, knee forward
    f.knee.rotation.x = al + be;            // ...and the shank comes back to it
    // The shank's pitch is what the foot hangs off now, so the ankle angle is
    // solved against THAT and not against the hip-to-ankle line. This is the
    // same correction round 12 made when it wrote `ank - th` instead of `ank`:
    // one more joint upstream, one more term.
    const sh = th + be;
    const a = ank - sh;
    f.shoe.rotation.x = a;
    const ay = f.ankleY, ca = Math.cos(a), sa = Math.sin(a);
    const base = f.shoe0.y + ay * (1 - ca);
    const dz = f.shoe0.z - ay * sa;
    if (floorY == null) { f.shoe.position.set(f.shoe0.x, base, dz); return; }
    // The sole pin, through the whole chain and now through the SCALE as well.
    // Below the leg group the transform is
    //     M = T_grp . Rx(th) . S(g, ly, g) . Rx(-alpha) . T(0,kneeY,0) . Rx(alpha+beta)
    // so every child rotation happens INSIDE the non-uniform scale and the scale
    // is applied once, last, before the hip rotation. Fold it in that order or
    // the pin is wrong by the body's own stature — which is exactly what it has
    // been. Closed form, no matrix update: this runs 28 times a frame.
    const cb = Math.cos(be), sb = Math.sin(be);
    const cal = Math.cos(al), sal = Math.sin(al);
    const cth = Math.cos(th), sth = Math.sin(th);
    const corner = (z) => {
      const cy = base + f.soleY * ca - z * sa;
      const cz = dz + f.soleY * sa + z * ca;
      // up through the hinge into leg-group-local, still unscaled
      const Y = f.kneeY * cal + (cy * cb - cz * sb);
      const Z = -f.kneeY * sal + (cy * sb + cz * cb);
      return f.sy * Y * cth - f.sxz * Z * sth;          // hips-local y, root metres
    };
    const lowest = Math.min(corner(f.toeZ), corner(f.heelZ));
    // ...and a lift of `d` along the knee frame's own Y arrives in hips-local as
    // d * (sy*cos(beta)*cos(th) - sxz*sin(beta)*sin(th)). Clamped so a deeply
    // flexed leg cannot divide by nothing.
    const gain = f.sy * cb * cth - f.sxz * sb * sth;
    f.shoe.position.set(f.shoe0.x, base + (floorY - lowest) / Math.max(0.3, gain), dz);
    return;
  }
  const a = ank - th;
  f.leg.scale.y = f.leg0 * k;
  f.shoe.rotation.x = a;
  const ay = f.ankleY, ca = Math.cos(a), sa = Math.sin(a);
  // the shoe's own origin, so the ankle stays under the (possibly shortened) leg
  const base = f.shoe0.y + ay * (k - ca);
  const dz = f.shoe0.z - ay * sa;
  if (floorY == null) { f.shoe.position.set(f.shoe0.x, base, dz); return; }
  // the two ground corners, through the shoe's rotation, the leg group's SCALE
  // and then its rotation — in that order, because that is the order the matrix
  // composes them. See the knee branch above for why the scale is not optional.
  const cth = Math.cos(th), sth = Math.sin(th);
  const corner = (z) => {
    const cy = base + f.soleY * ca - z * sa;
    const cz = dz + f.soleY * sa + z * ca;
    return f.sy * cy * cth - f.sxz * cz * sth;          // hips-local y, root metres
  };
  const lowest = Math.min(corner(f.toeZ), corner(f.heelZ));
  // A leg-local lift arrives in hips-local multiplied by sy*cos(th), so divide
  // it back out. Clamped so a leg past 72 degrees cannot divide by nothing.
  f.shoe.position.set(f.shoe0.x, base + (floorY - lowest) / Math.max(0.3, f.sy * cth), dz);
}
export function footRest(f) {
  if (!f) return;
  f.leg.scale.y = f.leg0;
  f.shoe.rotation.x = 0;
  f.shoe.position.copy(f.shoe0);
  if (f.knee) { f.leg.rotation.x = 0; f.knee.rotation.x = 0; f.alpha = f.beta = 0; }
}

// ---------------------------------------------------------------------------
// ONE BODY, ONE FRAME.
//
// `o` in, `G` written in place — the same scratch object every call, because
// this runs 14-25 times a frame and an allocation per body per frame is 1,500
// objects a second for nothing.
//
//   o.phase    gait phase, radians, 2PI per FULL cycle (two steps)
//   o.speed    ground speed, m/s
//   o.L        hip pivot -> sole, ROOT-LOCAL units (the root carries stature)
//   o.step     step length, root-local metres. See stepLength().
//   o.duty     fraction of the cycle one foot is down, 0.5..0.75
//   o.lift     knee-substitute depth, as a fraction of L
//   o.feet     false if attachFeet failed; the solve then avoids needing a knee
// ---------------------------------------------------------------------------
export function solveGait(G, o) {
  const L = o.L, S = o.step, D = clamp(o.duty, 0.5, 0.78);
  // Where each leg is in its own cycle. The right leg leads by convention and
  // the left is half a cycle behind it, which is what makes double support fall
  // in the right two places without any of it being written down twice.
  const uR = ((o.phase / TAU) % 1 + 1) % 1;
  const uL = (uR + 0.5) % 1;
  const reach = S * D;                       // how far ahead the heel lands

  // fx: foot position along the direction of travel, relative to the hip.
  // Stance is LINEAR IN TIME because the hip is moving at a constant speed and
  // the foot is not moving at all. That linearity is the whole fix.
  const legX = (u) => {
    if (u < D) return reach * (1 - 2 * (u / D));
    const w = (u - D) / (1 - D);
    return -reach + 2 * reach * swingEase(w);
  };
  const fxR = legX(uR), fxL = legX(uL);
  const stR0 = uR < D, stL0 = uL < D;
  // Stance knee flexion has to be known BEFORE the leg angle is, because it
  // shortens the leg the angle is solved against. Solving theta on the full L
  // and then shortening the leg moves the foot by L*flex*sin(theta), which the
  // check duly caught as 9-21 mm of slip — small, real, and entirely avoidable
  // by doing these two in the right order.
  const flexOf = (u, stance) => (stance ? (o.flex || 0) * Math.pow(Math.sin(Math.PI * u / D), 1.4) : 0);
  const fR = flexOf(uR, stR0), fL = flexOf(uL, stL0);
  const LR = L * (1 - fR), LL = L * (1 - fL);
  // +rotation.x carries the foot BEHIND the body (the leg hangs down -Y and the
  // body faces local +Z), so the sign is inverted here once, on purpose, rather
  // than at each of the four call sites.
  const thR = -Math.asin(clamp(fxR / LR, -0.94, 0.94));
  const thL = -Math.asin(clamp(fxL / LL, -0.94, 0.94));

  // ---- ROUND 2 (character): THE SIGNS WERE INVERTED AND THE FOOT ROCKED
  // ---- BACKWARDS THROUGH EVERY STEP THIS GAME HAS EVER DRAWN --------------
  // `ank` is the sole's pitch, and it goes onto the shoe as `ank - shank`, so it
  // composes to the sole's pitch in the parent frame. A positive rotation about
  // +X sends a point at +z (the toe, because the body faces +z) DOWNWARD:
  //     y' = y cos p - z sin p
  // so p > 0 is TOES DOWN. Round 12 authored +0.24 at heel strike and -0.52 at
  // toe-off with comments reading "heel strike toes-up" and "rolling onto the
  // toe" — i.e. the intent was right and the sign was the other way round for
  // both. Measured on the live rig, one full stride, id 1, world millimetres,
  // heel and toe contact corners:
  //
  //     stance begins   heel +21 mm, toe -29 mm   -> THE TOE LANDS FIRST
  //     stance ends     heel -29 mm, toe +87 mm   -> IT PUSHES OFF THE HEEL
  //
  // A person lands on the heel and leaves off the toe. This did the exact
  // opposite, on every body, in every frame, in every build that has shipped.
  // It survived because the sole pin re-plants whichever corner is lowest, so
  // the foot never floated and never sank — it was simply rolling the wrong way,
  // and that is not something a check on the SOLVE can see. It is also the real
  // cause of the note in this file's header about the heel going through the
  // floor at toe-off: the heel was going through the floor because the heel was
  // the trailing contact, which is not where a push-off happens. After:
  //
  //     stance begins   heel 0 mm,  toe +52 mm    -> heel strike
  //     stance ends     heel +95 mm, toe +2 mm    -> toe-off
  //
  // Negated. The comments underneath were already describing the fixed version.
  const ankleOf = (u, stance) => {
    if (!o.feet) return 0;
    if (stance) {
      const p = u / D;
      if (p < 0.18) return -0.24 * (1 - p / 0.18);         // heel strike -> flat
      if (p < 0.62) return 0;                              // foot flat, loaded
      const q = (p - 0.62) / 0.38;
      return 0.52 * q * q;                                 // rolling onto the toe
    }
    const w = (u - D) / (1 - D);
    // comes off the toe still pointed, swings through neutral, cocks up to
    // present the heel for the next strike
    return 0.52 * Math.pow(1 - Math.min(1, w / 0.30), 2) - 0.24 * Math.pow(w, 2.2);
  };

  // ---- the hip height, i.e. the controlled fall ---------------------------
  // Whichever planted leg is MOST angled is the one holding the hip down. In
  // double support that is the trailing leg, which is why the body is lowest
  // just after each heel strike and not at the strike itself.
  //
  // STANCE KNEE FLEXION, and it is here because the raw compass gait is a
  // caricature. A rigid stance leg puts the hip at L*cos(theta), which for the
  // longest strider in this crowd measured a 102 mm bob — twice life. Real
  // walking runs 40-50 mm, and the mechanism that buys the difference is the
  // stance knee bending about 15 degrees as the body passes over the foot,
  // which lowers the PEAK without touching the troughs. So the stance leg is
  // shortened by `flex` on a hump that maxes at mid-stance. The foot does not
  // move: the sole pin puts it back on the tiles, which is what the knee is
  // doing in a real leg too.
  //
  // ---- ROUND 2 (character): AND THE FOOT IS PART OF THE LEG ---------------
  // The paragraph above is right about the mechanism and wrong about the size
  // of it, and the error only becomes visible once there is a real knee to look
  // at. "About 15 degrees" of stance knee flexion shortens a two-bone leg by
  // 1 - cos(7.5 deg) = 0.9%, not by the 5.5% `gaitFlex` is set to; 5.5% is
  // 38 degrees of knee, two and a half times life, and with the telescope it
  // was invisible because a rod that gets 5% shorter just gets shorter.
  //
  // But dropping `flex` to its anatomical value puts the bob straight back up
  // to the compass-gait value, because stance knee flexion was never the term
  // that buys the difference. THE FOOT IS. A leg is hip -> ankle -> a 230 mm
  // sole, and the sole ROLLS: at heel strike the contact is 83 mm behind the
  // ankle and at toe-off it is 148 mm in front, so at both ends of stance the
  // ankle stands HIGHER above the ground than it does with the foot flat. That
  // raises the hip exactly where the compass gait says it should be lowest,
  // which is the whole of the classical "determinants of gait" argument and is
  // why real walking runs 40-50 mm on a leg whose rigid-rod prediction is 90.
  //
  // So the hip height is solved off the ANKLE plus the foot, not off the sole:
  //     hip = (L - h0)(1 - flex) cos(theta)  +  h0 cos(ank) + reach * |sin(ank)|
  // where h0 is the ankle's height over a flat sole and `reach` is whichever
  // sole corner is down. It needs no dial, it is exact given the shoe's own box,
  // and it is what lets gaitFlex be the angle it always claimed to be.
  // `o.foot` is null for a rig with no shoes found and the expression collapses
  // to the old one.
  const stR = stR0, stL = stL0;
  const FT = o.foot;
  const ankR0 = ankleOf(uR, stR), ankL0 = ankleOf(uL, stL);
  const hipOf = (th, flex, ank) => {
    if (!FT) return L * Math.cos(th) * (1 - flex);
    const h0 = FT.h0 * L;
    const reach = (ank > 0 ? FT.toe : FT.heel) * L;
    return (L - h0) * (1 - flex) * Math.cos(th) + h0 * Math.cos(ank) + reach * Math.abs(Math.sin(ank));
  };
  let hip = L;
  if (stR) hip = Math.min(hip, hipOf(thR, fR, ankR0));
  if (stL) hip = Math.min(hip, hipOf(thL, fL, ankL0));
  G.drop = L - hip;
  G.thR = thR; G.thL = thL;
  G.stanceR = stR; G.stanceL = stL;
  G.flexR = fR; G.flexL = fL;

  // ---- the knee substitute -----------------------------------------------
  // Only a swing leg is ever shortened, and only by enough to hold the foot at
  // `lift` above the floor. A stance leg is ALWAYS exactly 1.0, which is the
  // property that keeps the plant honest: shorten a stance leg by a hair and
  // the foot leaves the ground and the whole argument above is void.
  const hipH = L - G.drop;
  // `clear` is published as well as consumed: the knee scale positions the
  // ANKLE for it, and footPose then pins the SOLE to it, so the two agree on one
  // number instead of each having its own idea of how high the foot is.
  const kneeOf = (u, th, stance, side) => {
    if (!o.feet) { G[side] = 0; return 1; }
    // A stance leg carries its own flexion — the hip height above was solved
    // against exactly this number, so the two cannot disagree.
    if (stance) { G[side] = 0; return 1 - (side === 'clearR' ? fR : fL); }
    const w = (u - D) / (1 - D);
    const clear = o.lift * L * Math.pow(Math.sin(Math.PI * w), 1.25);
    G[side] = clear;
    const need = (hipH - clear) / Math.max(0.05, L * Math.cos(th));
    return clamp(need, 0.78, 1);
  };
  G.kneeR = kneeOf(uR, thR, stR, 'clearR');
  G.kneeL = kneeOf(uL, thL, stL, 'clearL');

  // ---- the ankle ----------------------------------------------------------
  // Heel strike toes-up, flat through mid-stance, a real push at toe-off, and
  // a neutral-to-slightly-up carriage through the swing so the toe does not
  // catch. Authored against `u` rather than against the leg angle so a shuffle
  // and a stride roll through the same phases.
  // ---- the ankle: the block moved above the hip height, which now needs it
  G.ankR = ankR0;
  G.ankL = ankL0;

  // ---- the pelvis ---------------------------------------------------------
  // LIST: the unloaded hip drops. Signed off which foot is carrying, and it is
  // a square-ish wave rather than a sine because weight transfer is quick and
  // the plateau in the middle is what makes it read as load rather than as
  // wobble. `+z` is the body's own left, so a body on its RIGHT foot lists its
  // LEFT hip down.
  const load = Math.sin(o.phase);            // +1 = right leg fully loaded
  const lw = Math.tanh(load * 2.2);
  G.list = lw;
  // TRANSVERSE ROTATION: the pelvis rotates forward on the swing side, and it
  // is scaled by the step because a long stride needs the pelvis to reach.
  G.pelvisY = (fxR - fxL) / (2 * Math.max(0.1, L)) ;
  // LATERAL: the pelvis translates over the loaded foot. Small in absolute
  // terms — 15-45 mm — and it is what turns a bob into a walk, because it is
  // the only channel that moves the whole silhouette sideways.
  G.sway = lw;
  return G;
}

// Step length, and the only place it is decided.
//
// Real step length grows with speed and with leg length and shrinks with mass.
// The linear-in-speed form is the standard one; the coefficients here put a
// 1.25 m/s shopper on a 0.62 m step (cadence 1.0 Hz, two steps a second — a
// real supermarket amble) and a 3.5 m/s bolting thief on a 1.12 m step. The
// per-person `stride` roll from figures.js is a multiplier on it, so round 11's
// 1.6:1 cadence spread across the crowd survives unchanged.
export function stepLength(v, L, stride, heavy) {
  const base = (0.30 + 0.28 * Math.min(v, 4.2)) * (L / 0.86);
  return clamp(base * stride * (heavy ? 0.82 : 1), 0.10, 1.25);
}

// Duty factor: the fraction of the cycle each foot is down. 0.62 is a textbook
// walk; it falls with speed and hits 0.5 at a run, where double support ends
// and the two feet are never down together.
export function dutyOf(v, heavy) {
  return clamp(0.68 - 0.055 * v + (heavy ? 0.035 : 0), 0.50, 0.72);
}

// ---------------------------------------------------------------------------
// THE ASSERTION, in the shape CLAUDE.md names: a second derivation of the same
// quantity that FAILS LOUDLY when the two disagree.
//
// The claim this file makes is "the stance foot does not move". Verify it the
// only way that cannot be fooled by the algebra above being wrong in the same
// way twice: walk a body forward one step at a time in world coordinates,
// re-solve from scratch, and measure how far the planted foot actually drifts.
// A pass is under 5 mm over a whole stance phase; the round-11 walk measures
// 0.30-0.45 m over the same interval, which is the number in the header.
// ---------------------------------------------------------------------------
export function gaitCheck(opts = {}) {
  const G = {};
  const bad = [];
  const speeds = opts.speeds || [0.6, 1.25, 2.0, 3.5];
  const out = [];
  for (const v of speeds) {
    for (const heavy of [false, true]) {
      const L = 0.86, stride = 1.0;
      const S = stepLength(v, L, stride, heavy), D = dutyOf(v, heavy);
      const o = { phase: 0, speed: v, L, step: S, duty: D, lift: 0.07, flex: 0.055, feet: true };
      // Track the RIGHT foot through one full stance, in world x.
      const T = 2 * S / v;                   // cycle period
      const n = 240;
      let x = 0, minF = Infinity, maxF = -Infinity;
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * D;               // stance only
        o.phase = u * TAU;
        solveGait(G, o);
        x = v * (u * T);                     // how far the body has walked
        // foot = hip + fx, and fx = -L sin(theta) because +rotation.x carries
        // the foot BEHIND the body. Getting this sign wrong reports the SUM of
        // the hip advance and the foot excursion — 1,589 mm at a walk, which is
        // exactly twice the step and is how the error announced itself.
        const footWorld = x - L * (1 - G.flexR) * Math.sin(G.thR);
        if (footWorld < minF) minF = footWorld;
        if (footWorld > maxF) maxF = footWorld;
      }
      const slip = maxF - minF;
      out.push({ v, heavy, step: +S.toFixed(3), duty: +D.toFixed(3), slipMM: +(slip * 1000).toFixed(1) });
      if (slip > 0.005) bad.push(`v=${v}${heavy ? ' heavy' : ''} stance foot slipped ${(slip * 1000).toFixed(1)} mm`);
    }
  }
  // ...and the old model, measured the same way, so the header's number is
  // reproducible rather than quoted.
  const legacy = [];
  for (const v of speeds) {
    const L = 0.86, n = 240;
    const rate = v / (0.88 * 1.0);
    const amp = clamp(v * 0.20, 0.02, 0.72);
    let minF = Infinity, maxF = -Infinity;
    for (let i = 0; i <= n; i++) {
      const ph = (-Math.PI / 2) + (i / n) * Math.PI;      // one stance-ish half
      const th = Math.sin(ph) * amp;
      const t = (ph + Math.PI / 2) / (rate * TAU);
      const footWorld = v * t - L * Math.sin(th);
      if (footWorld < minF) minF = footWorld;
      if (footWorld > maxF) maxF = footWorld;
    }
    legacy.push({ v, slipMM: +((maxF - minF) * 1000).toFixed(0) });
  }
  return { ok: bad.length === 0, bad, rows: out, legacy };
}
