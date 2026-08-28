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
export function attachFeet(rig) {
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
    return {
      leg, shoe, ankleY: shoeTop, leg0: leg.scale.y, shoe0: shoe.position.clone(),
      // the sole, and the two corners that touch the ground. footPose needs all
      // three; see the note there about which point a foot actually pivots on.
      soleY: sb.min.y, toeZ: sb.max.z, heelZ: sb.min.z,
    };
  };
  const L = one(rig.legL), R = one(rig.legR);
  rig.footL = L; rig.footR = R;
  rig.feetOk = !!(L && R);
  return rig.feetOk;
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
  const a = ank - th;
  f.leg.scale.y = f.leg0 * k;
  f.shoe.rotation.x = a;
  const ay = f.ankleY, ca = Math.cos(a), sa = Math.sin(a);
  // the shoe's own origin, so the ankle stays under the (possibly shortened) leg
  const base = f.shoe0.y + ay * (k - ca);
  const dz = f.shoe0.z - ay * sa;
  if (floorY == null) { f.shoe.position.set(f.shoe0.x, base, dz); return; }
  // the two ground corners, through the shoe's rotation and then the leg's
  const cth = Math.cos(th), sth = Math.sin(th);
  const corner = (z) => {
    const cy = base + f.soleY * ca - z * sa;
    const cz = dz + f.soleY * sa + z * ca;
    return cy * cth - cz * sth;                       // hips-local y
  };
  const lowest = Math.min(corner(f.toeZ), corner(f.heelZ));
  // A leg-local lift arrives in hips-local multiplied by cos(th), so divide it
  // back out. Clamped so a leg past 72 degrees cannot divide by nothing.
  f.shoe.position.set(f.shoe0.x, base + (floorY - lowest) / Math.max(0.3, cth), dz);
}
export function footRest(f) {
  if (!f) return;
  f.leg.scale.y = f.leg0;
  f.shoe.rotation.x = 0;
  f.shoe.position.copy(f.shoe0);
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
  const stR = stR0, stL = stL0;
  let hFrac = 1;
  if (stR) hFrac = Math.min(hFrac, Math.cos(thR) * (1 - fR));
  if (stL) hFrac = Math.min(hFrac, Math.cos(thL) * (1 - fL));
  G.drop = L * (1 - hFrac);
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
  const ankleOf = (u, stance) => {
    if (!o.feet) return 0;
    if (stance) {
      const p = u / D;
      if (p < 0.18) return 0.24 * (1 - p / 0.18);          // heel strike -> flat
      if (p < 0.62) return 0;                              // foot flat, loaded
      const q = (p - 0.62) / 0.38;
      return -0.52 * q * q;                                // rolling onto the toe
    }
    const w = (u - D) / (1 - D);
    // comes off the toe still pointed, swings through neutral, cocks up to
    // present the heel for the next strike
    return -0.52 * Math.pow(1 - Math.min(1, w / 0.30), 2) + 0.24 * Math.pow(w, 2.2);
  };
  G.ankR = ankleOf(uR, stR);
  G.ankL = ankleOf(uL, stL);

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
