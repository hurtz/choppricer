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
// ROUND 4 (move) — THE PARAGRAPH ABOVE IS RIGHT ABOUT THE ARGUMENT AND WAS
// WRONG ABOUT WHICH POINT IT APPLIES TO
// ===========================================================================
// "A foot that touches at +SD ahead of the hip and leaves at SD behind it has
// travelled 2SD" is the plant, and it held for a point on the end of a rod of
// length L. The rig does not have one. It has a hip-to-ANKLE line, which is
// shorter than hip-to-sole by the height of the ankle (8.0% of stature on the
// crowd, 9.2% on the cop), with a 230 mm foot hung off the end of it that ROLLS
// — heel at strike, flat, toe at push-off — carrying the ankle 73 mm forward
// across a stance all by itself. Two more terms, both the size of the thing
// being solved for. `legX` targets the ankle over `LA` with `rock()` in it now,
// and the two are read off the shoe's own bounding box rather than picked.
//
// Two more places the drawn foot moved that the solve could not see, both fixed
// this round and both documented where they live: the sole pin translated the
// shoe along the knee frame's tilted Y (see footPose), and the pelvis's
// transverse rotation carried the leg PIVOTS fore and aft (see poseWalk in
// agents.js). Between them and this they are the whole of the stance skate: the
// cop went +0.0392 -> +0.0004 of the ground covered with nothing done to him.
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
    // =====================================================================
    // ROUND 4 (move) — THE PIN IS VERTICAL. IT WAS NOT.
    // =====================================================================
    // A lift of `d` along the KNEE FRAME'S own Y arrives in hips-local as
    //     Y = d * (sy*cb*cth - sxz*sb*sth)        <- what `gain` divided out
    //     Z = d * (sy*cb*sth + sxz*sb*cth)        <- what nobody did anything
    //                                                about
    // and the second row is not small. `th + beta` runs 0.20 to 0.65 rad across
    // one stance, so a pin that has to lift the shoe at all ALSO shoves it fore
    // and aft by between 0.2 and 0.76 of the lift — and because the angle
    // sweeps, the shove sweeps with it. That is a moving foot on a body that is
    // supposed to be standing on it.
    //
    // It is not a rounding term. Measured on the cop, whose 9.2-degree list
    // makes pinRolled() ask for a 44 mm lift on the loaded leg every frame of
    // stance: the shoe walked 17 mm forward of its own ankle across each
    // foot-flat window, +0.056 of the ground he covered — the LARGEST of the
    // three terms in his skate, bigger than the moment arm above.
    //
    // The fix is to stop solving a 2-D constraint with a 1-D translation. Ask
    // for a hips-local displacement of exactly (Y = floorY - lowest, Z = 0) and
    // solve the 2x2 for the knee-frame (dy, dz) that produces it. Substituting
    // Z = 0 into the pair above collapses it to P = D*cth, Q = -D*sth, and
    // inverting the beta rotation gives the two lines below. It costs two
    // multiplies over the divide it replaces.
    //
    // AND THE `Math.max(0.3, gain)` CLAMP IS GONE, because the thing it was
    // guarding against was an artefact of holding Z at nothing. Constrained to
    // move along one tilted axis, a leg near 72 degrees has almost no vertical
    // response left and the divide blows up; allowed both axes there is no
    // singularity at all — the 2x2 is a rotation and a diagonal scale, and its
    // determinant is sy*sxz. The shoe used to be left short of the tiles in
    // exactly the frames where the leg was most angled, which is heel strike
    // and toe-off.
    const D = floorY - lowest;
    const py = D * cth / (f.sy || 1), pz = -D * sth / (f.sxz || 1);
    f.shoe.position.set(f.shoe0.x, base + cb * py + sb * pz, dz - sb * py + cb * pz);
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
  // ROUND 4 (move): the same two-axis pin as the knee branch above, with
  // beta = 0 because there is no hinge here. See the long note up there for
  // why a one-axis pin on a tilted leg walks the foot forward.
  const D = floorY - lowest;
  f.shoe.position.set(f.shoe0.x, base + D * cth / (f.sy || 1), dz - D * sth / (f.sxz || 1));
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

  // ---- the ankle roll -----------------------------------------------------
  // Heel strike toes-up, flat through mid-stance, a real push at toe-off, and
  // a neutral-to-slightly-up carriage through the swing so the toe does not
  // catch. Authored against `u` rather than against the leg angle so a shuffle
  // and a stride roll through the same phases.
  //
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
  //
  // ROUND 4 (move): THIS BLOCK MOVED ABOVE legX, because the leg angle now
  // depends on it. Nothing in it changed.
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

  // =========================================================================
  // ROUND 4 (move) — THE MOMENT ARM. WHAT SWINGS IS NOT WHAT THIS SOLVED FOR.
  // =========================================================================
  // Everything below the hip pivot rotates about it as ONE rigid line of length
  // hip -> ANKLE, and then a foot hangs off the end of that line. This file has
  // always solved `theta` as though the line ran hip -> SOLE, which is longer by
  // the height of the ankle over the sole — 8.03% of stature on all fourteen
  // shoppers, 9.20% on the cop, straight out of each shoe's own bounding box.
  // So the drawn foot swept (1 - h0) of what the solve asked for, and the
  // difference went to the stance foot as forward skate, at EVERY speed and on
  // EVERY body, since the day the plant was written.
  //
  // Measured on the live rig, foot-flat stance windows, decomposed into the
  // three places a planted foot can move (hip joint / leg swing / sole pin),
  // as a signed fraction of the ground covered:
  //
  //                        hip joint    leg swing    sole pin      net
  //     cop, 2.35 m/s       -0.1083      +0.0914      +0.0561     +0.0392
  //     crowd, median       -0.0541      +0.0395      +0.0157     -0.0063
  //
  // The cop's leg-swing term is +0.0914 against a predicted +0.0920. It IS this
  // bug, to two decimal places, on a body nobody had measured. The crowd's is
  // smaller only because their idle phase tick over-sweeps the leg by about the
  // same amount in the other direction — see animateShopper, where that tick is
  // now gone, because the thing it was cancelling is this.
  //
  // AND THE FOOT IS NOT A POINT ON THE END OF THE LINE, IT ROLLS. A rigid foot
  // pivoting on its heel at strike and on its toe at push-off carries the ankle
  // FORWARD over the contact — 19 mm through the heel rocker and 54 mm through
  // the toe rocker on a standard leg, 73 mm across the whole of stance, which is
  // the same order as the moment arm itself. So the ankle's target is not the
  // straight line `reach*(1 - 2p)`: it is that line plus `rock(ank)`, the
  // ankle's own offset from the point the heel struck, for a foot rolling about
  // whichever corner is down. rock() is zero through foot-flat by construction,
  // which is where the two ends of it are pinned.
  //
  // This is the classical determinants-of-gait argument and it is the same
  // geometry hipOf() below already uses for the VERTICAL. It was only ever
  // missing from the horizontal.
  //
  // WITH NO SHOES FOUND (`o.foot` null) h0 is 0, LA is L and rock() is 0, so
  // the whole block collapses to the expression it replaced, bit for bit. The
  // degraded rig is not a new code path.
  const FT = o.foot;
  const h0 = FT ? FT.h0 * L : 0;             // ankle above a flat sole
  const LA = L - h0;                         // hip -> ANKLE. THE MOMENT ARM.
  const hz0 = FT ? -FT.heel * L : 0;         // heel corner, signed, off the ankle
  const tz0 = FT ? FT.toe * L : 0;           // toe corner, signed
  const rock = (ank) => {
    if (!FT) return 0;
    const c = Math.cos(ank), s = Math.sin(ank);
    return (ank <= 0 ? -(hz0 * c - h0 * s)
                     : (tz0 - hz0) - (tz0 * c - h0 * s)) + hz0;
  };
  const rock1 = rock(ankleOf(D, true));      // ankle at toe-off, off the strike
  const rock0 = rock(ankleOf(0, true));      // ...and at heel strike

  // fx: ANKLE position along the direction of travel, relative to the hip.
  // Stance is LINEAR IN TIME plus the rocker, because the hip is moving at a
  // constant speed and the foot is rolling over a contact that is not moving.
  // That linearity is the whole fix and the rocker is what a foot adds to it.
  const legX = (u) => {
    if (u < D) return reach * (1 - 2 * (u / D)) + rock(ankleOf(u, true));
    // The swing simply connects the two ends of stance, so the asymmetry the
    // rocker leaves behind (the ankle is 19 mm behind at strike and 54 mm ahead
    // at toe-off) is carried rather than averaged away.
    const w = (u - D) / (1 - D);
    const a = -reach + rock1, b = reach + rock0;
    return a + (b - a) * swingEase(w);
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
  // ...and it shortens the hip-to-ANKLE line, which is what footPose's `k`
  // scales: `k` is documented as "how long the hip-to-ankle line is, as a
  // fraction", and kneeOf() hands it `1 - flex` for a stance leg. So this is
  // the same length in both places instead of two different ones.
  const LR = LA * (1 - fR), LL = LA * (1 - fL);
  // +rotation.x carries the foot BEHIND the body (the leg hangs down -Y and the
  // body faces local +Z), so the sign is inverted here once, on purpose, rather
  // than at each of the four call sites.
  const thR = -Math.asin(clamp(fxR / LR, -0.94, 0.94));
  const thL = -Math.asin(clamp(fxL / LL, -0.94, 0.94));

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
  //
  // ROUND 4 (move): `h0`, `LA` and the two sole corners are hoisted to the top
  // of this function now, because the HORIZONTAL needs the same three numbers.
  // They were computed twice here and once nowhere, which is how the horizontal
  // came to be missing them.
  const stR = stR0, stL = stL0;
  const ankR0 = ankleOf(uR, stR), ankL0 = ankleOf(uL, stL);
  const hipOf = (th, flex, ank) => {
    if (!FT) return L * Math.cos(th) * (1 - flex);
    const down = ank > 0 ? tz0 : -hz0;             // whichever corner is down
    return LA * (1 - flex) * Math.cos(th) + h0 * Math.cos(ank) + down * Math.abs(Math.sin(ank));
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
    // ROUND 4 (move): the SAME moment-arm correction. `need` is a fraction of
    // the hip-to-ANKLE line, so what it has to span is the hip-to-ankle drop —
    // the floor, less the clearance, less the ankle's own height over the sole
    // — over the hip-to-ankle length. It was solving that against hip-to-sole
    // at both ends, which is 8 mm of pin work per swing frame the pin then had
    // to undo. (It was nearly right by a coincidence: (X - h0)/(L - h0) equals
    // X/L exactly when X = L, and a swing hip is close to L.)
    const need = (hipH - clear - h0) / Math.max(0.05, LA * Math.cos(th));
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
//
// ---------------------------------------------------------------------------
// ROUND 4 (move) — AND UNTIL THIS ROUND IT ONLY EVER RAN THE BRANCH THAT DOES
// NOT SHIP.
// ---------------------------------------------------------------------------
// It passed `feet: true` and no `foot`, so `o.foot` was null on every row: the
// no-shoes-found fallback, which no body in the game has taken since round 2.
// It therefore could not have seen the moment arm (h0 is 0 down that branch, so
// hip-to-ankle IS hip-to-sole and the two are the same expression) and it did
// not. It read 0.0 mm through every build that carried it.
//
// It also tracked a point that does not exist — `hip - L sin(theta)`, the end of
// a rod — where the thing that has to hold still is A CORNER OF A SHOE. Those
// differ by the foot rocker, which is the term this round added.
//
// So: every row now runs TWICE, once with a real shoe box (the fourteen
// shoppers' own, straight off attachFeet) and once with none, and the shod pass
// tracks the two SOLE CORNERS through the solve's own ankle angle, checking
// whichever one is down — the heel while the sole is pitched up, the toe while
// it is pitched down, both through foot-flat. A rolling foot is allowed to roll
// and is not allowed to slide, which is the distinction the old row could not
// express. The unshod pass keeps the old point and the old number, so the
// fallback rig is still covered and the header's arithmetic is still checked.
// ---------------------------------------------------------------------------
// The shoppers' own box, as the fractions attachFeet publishes: ankle 8.03% of
// hip-to-sole above the ground, toe 17.0% ahead of it, heel 9.66% behind.
const CHECK_FOOT = { h0: 0.0803, toe: 0.170, heel: 0.0966 };
export function gaitCheck(opts = {}) {
  const G = {};
  const bad = [];
  const speeds = opts.speeds || [0.6, 1.25, 2.0, 3.5];
  const out = [];
  for (const v of speeds) {
    for (const heavy of [false, true]) {
      for (const FT of [CHECK_FOOT, null]) {
      const L = 0.86, stride = 1.0;
      const S = stepLength(v, L, stride, heavy), D = dutyOf(v, heavy);
      const o = { phase: 0, speed: v, L, step: S, duty: D, lift: 0.07, flex: 0.055,
        feet: true, foot: FT };
      const h0 = FT ? FT.h0 * L : 0, LA = L - h0;
      const hz0 = FT ? -FT.heel * L : 0, tz0 = FT ? FT.toe * L : 0;
      // Track the RIGHT foot through one full stance, in world x.
      const T = 2 * S / v;                   // cycle period
      const n = 240;
      // Two contact corners, each only over the sub-phase in which it is the
      // one on the tiles. `+ 1e-9` so the flat plateau, where ank is exactly 0,
      // counts for BOTH — which is the interval where both really are down.
      let x = 0, minF = Infinity, maxF = -Infinity, minT = Infinity, maxT = -Infinity;
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * D;               // stance only
        o.phase = u * TAU;
        solveGait(G, o);
        x = v * (u * T);                     // how far the body has walked
        // foot = hip + fx, and fx = -L sin(theta) because +rotation.x carries
        // the foot BEHIND the body. Getting this sign wrong reports the SUM of
        // the hip advance and the foot excursion — 1,589 mm at a walk, which is
        // exactly twice the step and is how the error announced itself.
        const ankleRel = -LA * (1 - G.flexR) * Math.sin(G.thR);
        if (!FT) {
          const footWorld = x + ankleRel;
          if (footWorld < minF) minF = footWorld;
          if (footWorld > maxF) maxF = footWorld;
          continue;
        }
        const ca = Math.cos(G.ankR), sa = Math.sin(G.ankR);
        if (G.ankR <= 1e-9) {                                  // heel is down
          const w = x + ankleRel + hz0 * ca - h0 * sa;
          if (w < minF) minF = w;
          if (w > maxF) maxF = w;
        }
        if (G.ankR >= -1e-9) {                                 // toe is down
          const w = x + ankleRel + tz0 * ca - h0 * sa;
          if (w < minT) minT = w;
          if (w > maxT) maxT = w;
        }
      }
      const slip = Math.max(maxF - minF, FT ? maxT - minT : 0);
      out.push({ v, heavy, shod: !!FT, step: +S.toFixed(3), duty: +D.toFixed(3),
        slipMM: +(slip * 1000).toFixed(1) });
      if (slip > 0.005) bad.push(`v=${v}${heavy ? ' heavy' : ''}${FT ? ' shod' : ' unshod'}`
        + ` stance foot slipped ${(slip * 1000).toFixed(1)} mm`);
      }
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
