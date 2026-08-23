// OWNER: builder-camera. The on-foot chase camera.
//
// CONTRACT — must keep exporting exactly this:
//   createCamera(THREE, cam) -> { update(dt, state), yaw }
//     cam    : the THREE.PerspectiveCamera to drive (already in the scene)
//     state  : { cop, chasing, gassed, boost, speed, report, dt }
//     yaw    : CURRENT camera yaw in radians about +Y. main.js rotates the player's
//              input by this every frame, so WASD always means what the player sees.
//              If you swing the camera and do not keep `yaw` truthful, the controls
//              mirror — which is exactly the bug a playtest just caught.
//
// ADDITIVE EXPORT (round 1): projectFromCop(cop, x, y, z) -> { x, y, behind }
//   Same signature and same return shape as the copy in src/game/hud.js, but
//   projected through the LIVE camera. See THE HUD PROJECTION BUG below.
//
// THE BRIEF: the player said walking through this store is the best thing in the
// game, and then that he is "not seeing the angles I wanted from within the store".
// This camera had been a fixed 6.4 m-high, 7.6 m-back, dead-flat follow since the
// first hour of the project. It had never been designed.

import {
  AISLE_COUNT, AISLE_GAP, AISLE_LEN, SHELF_W, SHELF_H, CEIL_H,
  aisleX, STORE, FRONT_WALK_Z, MID_WALK_Z, BACK_WALK_Z, TUNING,
} from './config.js';

// ===========================================================================
// WHAT WAS WRONG WITH 6.4 m
// ===========================================================================
// The store is 5.2 m to the drop ceiling. The old rig sat at 6.4 m — ABOVE THE
// CEILING — so the ceiling, which is a quarter of the store brief (drop tile,
// troffer rows, sprinkler mains, dome cameras), was never once on screen while
// the player was on the floor. It only ever appeared on the security monitors.
//
// The rest of it followed from the same number. At 6.4 m looking down 28 degrees
// the gondolas read as 2 m ridges on a floor plan: a sightline from the lens
// grazing a 2.05 m shelf top 2 m away lands on the floor 2.9 m out, i.e. INSIDE
// the next run, so every aisle in the store is visible at once and none of them
// is a corridor. That is a tactical map of a supermarket. It is not being in one.
//
// THE NEW BAND. Two hard numbers set it:
//   2.05 m  gondola top. Below it the camera is in the shelving.
//   2.50 m  the bottom edge of the hanging aisle signs (SIGN_Y 3.32, SIGN_H 1.64
//           in store.js), which hang over the aisle centreline at four z planes
//           per aisle — both store ends and both sides of the mid-store walkway.
// So there is a 45 cm slot, 2.05..2.50, where the camera flies over the shelves
// and under the signage, and that slot is the shot: the gondolas become walls,
// the signs pass overhead the way they do when you walk under one, and the
// ceiling occupies the top third of frame from about 9 m out.
//
// It is also, measured honestly, the worst height in the store for FINDING a man.
// To see a 1.7 m head standing in the NEXT aisle over, the lens has to clear the
// far top edge of the gondola between you: it needs 2.63 m. So the beautiful
// height and the informative height are on opposite sides of the sign line, and
// they cannot both be the resting height.
//
// THE RESOLUTION IS THE WHOLE DESIGN: the camera lives in the slot when you have
// time, and buys height with the gap when you do not. Walking, it sits at 2.44 —
// under the signs, in the aisle, no idea what is in aisle 5. Once a man is
// running and the gap opens it climbs on `gap01` to about 3.5, clears the shelf
// tops, and hands the sightline back. You get the photograph when you can afford
// it and the floor plan when you need it, and the trade is legible while it
// happens because the store visibly opens up underneath you.
// ===========================================================================

// ===========================================================================
// THE HUD PROJECTION BUG (round 1, reported to the lead before any of this was
// written). src/game/hud.js carries its own copy of the camera rig —
//
//   const F = (() => { const dy = 1.0 - 6.4, dz = 2.5 + 7.6, ... })();
//   export function projectFromCop(cop, x, y, z) {
//     const v = [x - cop.x, y - 6.4, z - (cop.z - 7.6)]; ...
//
// — and that copy draws the brackets on the thief, the door marker and the flee
// chevrons. It assumes a fixed offset AND zero yaw. It agreed with reality only
// because this file had never changed; the moment the camera moves, every marker
// detaches from the thing it marks, and those markers are a large part of the
// answer to "can I still see the man". Same hazard class as the R5 shadow blocks
// in agents.js: a duplicated value that looks live, held in sync by coincidence.
//
// The fix is one import, landed by the lead in hud.js:
//   import { projectFromCop } from '../camera.js';
// The version below has the identical signature, the identical return shape and
// the identical off-screen sentinel, and it projects through the real camera, so
// it is correct for any pose this file ever takes.
// ===========================================================================

const RAD = Math.PI / 180;
const PITCH = AISLE_GAP + SHELF_W;              // aisle-to-aisle, 5.30 m
const HALF_LEN = AISLE_LEN / 2;
const BODY_Z = HALF_LEN - 0.62;                 // gondola body half-length (store.js)

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
// Frame-rate independent approach. dt = 0 (snap() calls step(0)) is a no-op.
const sm = (cur, tgt, rate, dt) => cur + (tgt - cur) * (1 - Math.exp(-rate * dt));
const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// ---------------------------------------------------------------------------
// TUNING. Every number here was set by looking at the frame it produces; the
// prose next to each block is what the sweep actually showed, including the
// values that were tried and thrown away. `__CHOP.chaseCam.T` is live, so a
// critic can sweep any of it from the console without editing this file.
// ---------------------------------------------------------------------------
const T = {
  // --- resting shot (walking the floor, no chase) --------------------------
  // 2.44 is the slot: 39 cm over the gondolas, 6 cm under the sign edge. 2.9
  // and 3.2 were both measured first and both put the lens through every
  // hanging sign in the aisle — one frame of full-screen sign, four times per
  // traverse. Under the line there is no guard needed at all, which is worth
  // more than the 20 cm of extra sightline it costs.
  height: 2.44,
  dist: 5.55,          // 4.6 hid the far half of the aisle behind the cop's back;
                       // 7.0 put him back in the middle distance and read as the
                       // old camera with the tilt taken out.
  // Aim height. 1.30 (chest) was the first guess and it is wrong: aiming low
  // tips the frame DOWN, which parks the cop's head on the vanishing point —
  // the one pixel a man running away down the aisle occupies. 1.55 tips it back
  // up about 4 degrees, drops him into the lower third, and buys the ceiling at
  // the same time. Measured side by side, this is the second-biggest playability
  // number in the file after the shoulder dolly.
  look: 1.55,
  fov: 57,

  // --- sprint (0..1 on speed above the walk) -------------------------------
  // The speed cue is FOV and lag, not proximity. Closing the dolly at speed
  // was tried and is actively bad here: at 4.5 m the cop's own back covers the
  // end of the aisle, which is where the man you are chasing is.
  sprHeight: -0.16, sprDist: +0.40, sprFov: +7.0, sprLook: -0.08,

  // --- gassed (0..1, eased) ------------------------------------------------
  // The one place the camera is allowed to hurt you. It drops, pulls in and
  // narrows: the aisle stops being a corridor you are travelling down and
  // becomes a wall you are stuck against. No roll — see NO ROLL below.
  gasHeight: -0.22, gasDist: -0.95, gasFov: -6.0, gasLook: -0.14,

  // --- pursuit + gap -------------------------------------------------------
  // chase* is the flat lift the moment a man bolts. gap* is the part that
  // scales, and it is the playability escape hatch: by 16 m of gap the lens is
  // at ~3.5 m, which is over the 2.63 m needed to see a head in the next aisle.
  chaseHeight: +0.26, chaseLook: +0.05,
  gapHeight: +0.85, gapDist: +1.60, gapFov: +5.0, gapLook: +0.16,
  gapNear: 4.0, gapFar: 16.0,
  // YOUR chase, not any chase. Without this the rig read a man who had bolted
  // forty metres away in another department as a pursuit and sat in the high
  // wide floor-plan shot permanently — the exact frame this whole file exists
  // to stop being the default. Past 26 m no camera height finds him anyway;
  // that is what the pursuit panel's DOOR / HIM / YOU readout is for.
  chaseRange: 26.0,

  // --- boost ---------------------------------------------------------------
  bstFov: +5.0, bstHeight: -0.08,

  // --- follow springs ------------------------------------------------------
  // ANISOTROPIC, and this is most of what "fluid" means. The focus point chases
  // the cop slowly ALONG the camera axis (he pulls away from the lens when he
  // opens up, and the camera reels him back in) and fast ACROSS it (he never
  // slides out of frame sideways). Isotropic at 6.0 felt rigid; isotropic at
  // 3.5 felt like the soup the brief warned about. Split, it reads as weight.
  followAlong: 4.3, followCross: 9.5,
  rigRate: 5.0,        // how fast height/dist/fov/look chase their state targets
  lead: 1.15,          // metres of velocity lead-in at full sprint

  // --- yaw -----------------------------------------------------------------
  // Critically damped, with a hard cap on angular rate. w0 6.2 turns a 90 deg
  // corner in about 0.8 s, which is the single biggest feel number in the file:
  // 9.0 is a whip and made the store swim, 3.5 arrives after you have already
  // run into the shelf. The cap only ever binds on a 180.
  yawW: 6.2, yawMax: 3.1,
  axisDwell: 0.26,     // sustained seconds of cross-axis motion before the turn
  axisRatio: 1.35,     // and it has to dominate by this much. Stops a strafe
                       // from spinning the camera at an aisle junction.
  axisSpeed: 0.90,
  signDwell: 0.55, signHyst: 0.45, flipLock: 1.60,
  reArm: 1.00, reArmStill: 0.25,

  // --- corner behaviour ----------------------------------------------------
  // Mid-swing the lens is on a diagonal, which in a grid of gondolas means it
  // is over a shelf with a shelf between it and the cop. Pulling the dolly in
  // and lifting during the swing fixes both: shorter arc, and the sightline
  // clears the run. Falls back out as the swing settles.
  swingDolly: 0.30, swingLift: 0.42,

  // --- over the shoulder ---------------------------------------------------
  // Round 1's first render was otherwise right and unplayable: dead centre in a
  // 4 m aisle, the cop's own back sits exactly on the vanishing point, which is
  // exactly where a man you are chasing down that aisle appears. Measured on
  // that shot the thief at 7.3 m was behind the cop's head.
  // `shoulder` dollies the lens sideways — EYE AND AIM BY THE SAME AMOUNT, so
  // the shot stays square to the aisle and `yaw` stays exactly the corridor
  // bearing; only the parallax changes. Separation between a cop at 5.6 m and a
  // thief at 12.9 m works out at s*(1/5.6 - 1/12.9) = 0.10*s radians, so 0.9 m
  // of dolly buys about 5 degrees — a clear 70 px of daylight past his head at
  // 1280 wide. Rotating the aim instead would buy the same daylight and cost a
  // permanent 9 degree bias in the input frame, which walks you into a shelf.
  shoulder: 0.90,
  shoulderSide: 1,     // +1 puts the cop left of centre

  // --- sign clearance: SLIDE OUT, DO NOT DUCK ------------------------------
  // The gap rise pushes the lens through 2.50 m, and 2.50 m is the bottom edge
  // of the hanging aisle signs. Measured, not predicted: shots/cam_r1_gassed.png
  // caught it — a full-screen CRACKERS / NUTS banner across the middle of the
  // frame with the man being chased somewhere behind it.
  //
  // The obvious fix is to duck under the sign as it comes up. It is the wrong
  // one: a 0.9 m vertical dip inside a 1.3 m window at 6 m/s is a 4 m/s lurch,
  // four times per aisle, which is precisely the motion-sickness case the brief
  // rules out. And it needs the sign's z planes, i.e. a fourth private copy of
  // store.js's floor plan.
  //
  // Slide instead. A sign is only 1.86 m wide on a 4 m aisle, so 1.20 m off the
  // centreline clears the panel, its rail and its two hangers with room to
  // spare, and needs NO z knowledge at all — only that a sign hangs over the
  // middle of an aisle, which is what makes it a sign. It rides `height`, so the
  // camera cranes out sideways as it rises and back in as it settles: one
  // horizontal move instead of four vertical ones. It also widens the shoulder
  // parallax exactly when the gap is widest, which is when you most need to see
  // past the man's back.
  // 1.20 m is what it takes to MISS a sign, and missing it is not enough: it
  // leaves the panel edge 0.21 m off the lens, and a 1.86 x 1.64 m board at
  // 0.21 m is most of the screen. shots/cam_sw_clear120.png is that frame. 1.72
  // puts it at 0.71 m, where it sweeps the edge of frame the way signage does
  // when you walk under it — see cam_sw_clear172.png for the same instant.
  //
  // The other way out was to climb OVER them (4.20+). Measured and rejected:
  // cam_sw_high.png at 4.37 m still has a sign filling the corner, because you
  // pass just as close on the way up, and the store underneath has gone back to
  // being the floor plan this file exists to stop it being.
  signLo: 2.46,        // sign panels start at 2.50 (SIGN_Y 3.32 - SIGN_H/2)
  signClear: 1.72,     // half of SIGN_W 1.86 is 0.93; the rail takes it to 1.01
  signRamp: 0.50,      // metres of height over which the dolly widens

  // --- lane framing --------------------------------------------------------
  // The lens rides the AISLE centreline, not the cop's x. He is 4 m of walkable
  // width to move around in and the shot should not wander with him — pinning
  // the camera to the lane is what makes two walls of product converge instead
  // of sliding. He still drifts within the frame, which is the part that sells
  // him as a man in a place rather than a reticle.
  laneEye: 0.62, laneAim: 0.75,

  // --- life ----------------------------------------------------------------
  // NO ROLL. Vertical only, all of it small: a browser tab full of rolling
  // horizon is how you make someone put the game down. Bob is 1.6 cm at a full
  // sprint. The gassed heave is bigger (3.2 cm) and slow, and it is the one
  // camera move here that is meant to be noticed.
  bob: 0.016, heave: 0.032, shake: 0.20,
};

// The three cross-store corridors, straight from config. (MID_WALK_Z is new in
// config as of this round — it had been private to store.js as CROSS_Z, one file
// away from the duplication hazard in CLAUDE.md.)
//
// agents.js exports crossBands(), which finds the corridors by measuring the nav
// grid, and it was the first thing tried here because a measured answer beats an
// asserted one. It is the wrong tool for THIS job: it scans only the shelved span
// and thresholds on how open a row is, so it returns the mid walkway correctly
// and then MISSES BOTH ENDS — it reported [front z=-13.75, mid z=-0.63] and no
// back band at all, because the checkout lanes make the real front walkway at
// -16.5 read as blocked and the aisle-end gap at -13.75 read as the front
// corridor. Its answers are right for pathfinding and wrong for framing.
const BANDS = [
  { z: FRONT_WALK_Z, half: 3.4, kind: 'front' },
  { z: MID_WALK_Z, half: 2.4, kind: 'mid' },
  { z: BACK_WALK_Z, half: 3.0, kind: 'back' },
];

let LIVE_CAM = null;                 // for projectFromCop, set by createCamera

export function createCamera(THREE, cam) {
  LIVE_CAM = cam;
  const V = new THREE.Vector3();
  const AIM = new THREE.Vector3();

  // --- persistent rig state ------------------------------------------------
  let fx = 0, fz = 0;                 // smoothed focus point (world XZ)
  let started = false;
  let yawA = 0, yawV = 0;             // camera bearing + angular velocity
  let axisX = false;                  // false = reads along Z (down an aisle)
  let sign = 1;                       // +1 / -1 along that axis
  let axisT = 0, signT = 0, lockT = 0;
  let armed = true, agreeT = 0, stillT = 0;   // see WHICH END OF IT
  let vAlong = 0, vCross = 0;         // low-passed velocity in axis frame
  let h = T.height, d = T.dist, fov = T.fov, look = T.look;
  let sprint01 = 0, gas01 = 0, chase01 = 0, gap01 = 0, boost01 = 0, swing01 = 0;
  let bobP = 0, shake = 0, prevStagger = 0;
  const dbg = {};                      // last frame's corridor read, for debug()

  // Nearest aisle centreline to an x, and how far off it we are.
  function lane(x) {
    let i = Math.round((x / PITCH) + (AISLE_COUNT - 1) / 2);
    i = clamp(i, 0, AISLE_COUNT - 1);
    const cx = aisleX(i);
    return { i, cx, off: x - cx };
  }
  function nearestBand(z) {
    const bs = BANDS;
    let best = bs[0], bd = Infinity;
    for (const b of bs) {
      const dd = Math.abs(z - b.z);
      if (dd < bd) { bd = dd; best = b; }
    }
    return { b: best, d: bd };
  }

  // The one thing this file cannot get from `state`: where the running man is.
  // main.js passes `report: agents.report && agents.report()` and agents.js has
  // no report() — it PUSHES telemetry into game.js instead — so state.report is
  // undefined in the shipped build. audio.js hit the same wall and solved it the
  // same way, off the shoppers' own flags. Prefers the real report the instant
  // one exists.
  function chaseRead(state) {
    const r = state.report;
    if (r && r.chase) return { on: true, dist: r.chase.dist, x: null, z: null, live: r };
    let a = null;
    try { a = typeof window !== 'undefined' && window.__CHOP && window.__CHOP.agents; } catch (e) { a = null; }
    const sh = a && a.shoppers;
    if (!sh) return { on: !!state.chasing, dist: 0, x: null, z: null, live: r };
    const c = state.cop.position;
    let best = null, bd = Infinity;
    for (const s of sh) {
      if (!s || s.escaped || s.caught || !s.bolted) continue;
      if (s.mesh && !s.mesh.visible) continue;
      const dd = Math.hypot(s.position.x - c.x, s.position.z - c.z);
      if (dd < bd) { bd = dd; best = s; }
    }
    if (!best || bd > T.chaseRange) return { on: !!state.chasing, dist: 0, x: null, z: null, live: r };
    return { on: true, dist: bd, x: best.position.x, z: best.position.z, live: r };
  }

  const api = {
    yaw: 0,
    T,
    // Live rig readout. Nothing depends on it — projectFromCop is the supported
    // way to put a marker on a world position — but it is here for anyone who
    // genuinely needs the numbers rather than the projection.
    rig: { eye: [0, 0, 0], look: [0, 0, 0], fov: T.fov, yaw: 0, dist: T.dist, height: T.height },

    update(dt, state) {
      const cop = state && state.cop;
      if (!cop) return;
      const c = cop.position;
      const u = cop.userData || {};
      const vx = (u.vel && u.vel.x) || 0, vz = (u.vel && u.vel.z) || 0;
      const spd = u.speed || Math.hypot(vx, vz);
      dt = clamp(dt || 0, 0, 0.05);

      if (!started) { fx = c.x; fz = c.z; started = true; }

      const ch = chaseRead(state);
      const rep = ch.live;

      // ---- state scalars ---------------------------------------------------
      const walk = TUNING.copWalk, run = TUNING.copRun;
      const sprTgt = clamp((spd - walk * 0.92) / (run - walk * 0.92), 0, 1);
      const gasTgt = (rep ? rep.wind === 'winded' : !!u.gassed) ? 1 : 0;
      const bstTgt = (rep ? rep.boost > 0 : u.boost > 0) ? 1 : 0;
      const chsTgt = ch.on ? 1 : 0;
      const gapTgt = ch.on ? clamp((ch.dist - T.gapNear) / (T.gapFar - T.gapNear), 0, 1) : 0;
      sprint01 = sm(sprint01, sprTgt, 6.0, dt);
      // Gassing out is a fall off a cliff and getting your wind back is not, so
      // the ease is asymmetric — 0.22 s in, 1.1 s out. Symmetric at either rate
      // read as one wrong thing or the other.
      gas01 = sm(gas01, gasTgt, gasTgt > gas01 ? 8.0 : 1.6, dt);
      boost01 = sm(boost01, bstTgt, 5.0, dt);
      chase01 = sm(chase01, chsTgt, 2.4, dt);
      gap01 = sm(gap01, gapTgt, 1.7, dt);

      // ---- WHICH WAY DOES THE STORE FACE HERE ------------------------------
      // The store is a hard grid: eight corridors along Z, three across in X.
      // The camera picks one of those four bearings and holds it. It never
      // free-follows the cop's heading, and that is deliberate: input is rotated
      // by `yaw` in main.js, so a camera that chases the heading closes a loop —
      // hold D, the heading turns, the camera turns, D now means somewhere else,
      // and the cop pirouettes. Snapping to the STORE instead of to the MAN
      // breaks that loop, because a strafe does not change which corridor you
      // are standing in.
      const L = lane(c.x);
      const nb = nearestBand(c.z);
      const inAisle = Math.abs(L.off) < AISLE_GAP / 2 + 0.15 && Math.abs(c.z) < BODY_Z;
      // Past the ends of the shelf runs the whole floor is a cross corridor —
      // the front end and the back wall are where the run to the doors happens,
      // and a band centred on a single z does not describe 7 m of open floor.
      const inCross = Math.abs(c.z) > BODY_Z - 0.4 || nb.d < nb.b.half;
      // ...and it takes a committed move ALONG the other corridor to turn. At a
      // junction both are true, so without the dominance test a strafe across an
      // intersection would spin the camera 90 degrees at a time.
      const wantX = inCross && Math.abs(vx) > Math.abs(vz) * T.axisRatio && Math.abs(vx) > T.axisSpeed;
      const wantZ = inAisle && Math.abs(vz) > Math.abs(vx) * T.axisRatio && Math.abs(vz) > T.axisSpeed;
      dbg.off = +L.off.toFixed(2); dbg.bandZ = +nb.b.z.toFixed(2); dbg.bandD = +nb.d.toFixed(2);
      dbg.half = +nb.b.half.toFixed(2); dbg.inAisle = inAisle; dbg.inCross = inCross;
      dbg.vx = +vx.toFixed(2); dbg.vz = +vz.toFixed(2); dbg.lock = +lockT.toFixed(2);
      dbg.armed = armed;
      const flip = axisX ? wantZ : wantX;
      axisT = flip ? axisT + dt : 0;
      lockT = Math.max(0, lockT - dt);
      if (axisT >= T.axisDwell && lockT <= 0) {
        axisX = !axisX; axisT = 0; lockT = T.flipLock;
        // THE ONE THAT COST AN HOUR. The sign used to be left alone here and
        // re-decided by the latch below, which the same lockout then gagged for
        // 1.1 s — so turning left into the cross-aisle swung the camera to face
        // RIGHT down it and held it there. Instrumented: at the flip vx was
        // -2.21 and the rig picked sign +1 anyway, put the corridor behind the
        // player, and because input is camera-relative he then curved back out
        // of the corridor he had just entered.
        // The flip already proved which way he is going — it required a
        // dominant, sustained velocity along the NEW axis. Read the sign off
        // that, then start the lockout.
        const nv = axisX ? vx : vz;
        sign = nv >= 0 ? 1 : -1;
        signT = 0; vAlong = nv; vCross = 0; armed = true; agreeT = 0;
      }

      // ---- WHICH END OF IT ------------------------------------------------
      // Two votes. The chase vote — which side of you the running man is on — is
      // the one that matters: overrun him and the camera comes round to keep him
      // in frame, which is the difference between losing a thief and watching
      // him juke. It is also camera-INDEPENDENT, so it cannot feed back.
      //
      // The travel vote is not independent, and that is a trap I walked into.
      // A 180 inverts what the held key means, so a player holding S is moving
      // backwards, the camera swings to face him the other way, and now the same
      // held key drives him backwards AGAIN. Instrumented, holding S in the front
      // end flipped the camera at t=2.0, 3.5 and 5.0 s while the cop wandered 4.7
      // m sideways: a genuine oscillator, and the nausea case the brief calls out.
      // No timer fixes it — a longer lockout only lengthens the period, because
      // every quantity the latch reads is inverted by its own output.
      //
      // ARM IT ONCE PER COMMITMENT. A travel flip disarms the travel vote, and
      // only the player re-arms it: either by stopping, or by travelling the way
      // the camera now faces for a second, i.e. by agreeing that the turn was
      // right. Hold S forever and the camera turns round exactly once and then
      // lets you walk backwards, which is stable, honest, and what you asked for.
      const aV = axisX ? vx : vz;
      vAlong = sm(vAlong, aV, 1.6, dt);
      const agrees = vAlong * sign > 1.0;
      agreeT = agrees ? agreeT + dt : 0;
      stillT = spd < 0.6 ? stillT + dt : 0;
      if (!armed && (agreeT >= T.reArm || stillT >= T.reArmStill)) armed = true;

      let vote = armed ? clamp(vAlong / 1.8, -1, 1) * 0.6 : 0;
      if (ch.on && ch.x != null) {
        const along = axisX ? ch.x - c.x : ch.z - c.z;
        vote += clamp(along / 5.0, -1, 1) * 0.85;
      }
      const against = vote * sign;
      signT = against < -T.signHyst ? signT + dt : 0;
      if (signT >= T.signDwell && lockT <= 0) {
        sign = -sign; signT = 0; lockT = T.flipLock; vAlong = 0;
        armed = false; agreeT = 0;
      }

      // ---- yaw: critically damped, rate limited ----------------------------
      // yawTarget is one of four bearings. main.js's convention (readInput) is
      // forward = (-sin y, cos y), so +Z is 0, -Z is PI, +X is -PI/2.
      const yawTgt = axisX ? (sign > 0 ? -Math.PI / 2 : Math.PI / 2) : (sign > 0 ? 0 : Math.PI);
      const err = wrapPi(yawTgt - yawA);
      const w0 = T.yawW;
      yawV += (w0 * w0 * err - 2 * w0 * yawV) * dt;
      yawV = clamp(yawV, -T.yawMax, T.yawMax);
      yawA = wrapPi(yawA + yawV * dt);
      swing01 = sm(swing01, clamp(Math.abs(err) / 1.2, 0, 1), 7.0, dt);

      // ---- the rig ---------------------------------------------------------
      let hT = T.height + T.sprHeight * sprint01 + T.gasHeight * gas01
        + T.chaseHeight * chase01 + T.gapHeight * gap01 + T.bstHeight * boost01
        + T.swingLift * swing01;
      let dT = T.dist + T.sprDist * sprint01 + T.gasDist * gas01 + T.gapDist * gap01;
      dT *= 1 - T.swingDolly * swing01;
      const fT = T.fov + T.sprFov * sprint01 + T.gasFov * gas01 + T.gapFov * gap01
        + T.bstFov * boost01;
      const lT = T.look + T.sprLook * sprint01 + T.gasLook * gas01
        + T.chaseLook * chase01 + T.gapLook * gap01;
      h = sm(h, hT, T.rigRate, dt);
      d = sm(d, dT, T.rigRate, dt);
      fov = sm(fov, fT, T.rigRate, dt);
      look = sm(look, lT, T.rigRate, dt);

      // ---- focus: anisotropic follow + velocity lead ------------------------
      const bx = -Math.sin(yawA), bz = Math.cos(yawA);      // camera bearing
      const rx = -bz, rz = bx;                              // its screen-right
      const ld = T.lead * clamp(spd / run, 0, 1);
      const tx = c.x + bx * ld, tz = c.z + bz * ld;
      let ex = tx - fx, ez = tz - fz;
      const alo = ex * bx + ez * bz, cro = ex * rx + ez * rz;
      const kA = 1 - Math.exp(-T.followAlong * dt), kC = 1 - Math.exp(-T.followCross * dt);
      fx += (alo * kA) * bx + (cro * kC) * rx;
      fz += (alo * kA) * bz + (cro * kC) * rz;

      // ---- pin the shot to the corridor, not to the man --------------------
      // Blend the lens (and, harder, the aim) onto the lane or walkway centre.
      // The aim is pulled further than the lens on purpose: the residual angle
      // between them is what `yaw` ends up being, and pulling the aim tighter
      // keeps that under about 1.5 degrees, so the input frame stays glued to
      // the corridor while the cop is still free to drift inside the frame.
      // The weights fade instead of switching: the front end and the produce
      // corner have no lanes to pin to, and snapping the shot onto a phantom
      // centreline out there threw the cop 20 degrees off frame centre.
      let eyeX = fx, eyeZ = fz, aimX = c.x, aimZ = c.z;
      if (!axisX) {
        const k = (1 - smoothstep((Math.abs(L.off) - AISLE_GAP / 2) / 1.4))
                * (1 - smoothstep((Math.abs(c.z) - BODY_Z) / 2.5));
        eyeX = lerp(fx, L.cx, T.laneEye * k);
        aimX = lerp(c.x, L.cx, T.laneAim * k);
      } else {
        const k = 1 - smoothstep((nb.d - nb.b.half) / 1.5);
        eyeZ = lerp(fz, nb.b.z, T.laneEye * k);
        aimZ = lerp(c.z, nb.b.z, T.laneAim * k);
      }

      // ---- life: vertical only, no roll ------------------------------------
      bobP += dt * (u.phase != null ? 0 : spd * 2.0);
      const stride = u.phase != null ? u.phase : bobP;
      let y = h
        + Math.sin(stride * 2) * T.bob * sprint01 * (1 - gas01)
        + Math.sin((u.breath || 0)) * T.heave * gas01;
      // A shoulder barge is the one impact in this game. It gets a short kick
      // and nothing else — no roll, no freeze, no lens dirt.
      const stg = u.stagger || 0;
      if (stg > prevStagger + 1e-4) shake = 1;
      prevStagger = stg;
      shake = Math.max(0, shake - dt * 3.4);
      const sk = shake * shake * T.shake;

      // ---- place it ---------------------------------------------------------
      // Shoulder dolly, widened to clear the hanging signs once the gap rise
      // takes the lens over their bottom edge.
      //
      // It has to be measured FROM THE AISLE, not added as an offset. First
      // version added `signClear` to the lens and still put a full-screen
      // SPAGHETTI / SAUCES banner in the middle of the wide-gap frame: the lane
      // blend only pulls the lens 62% of the way onto the centreline, so a cop
      // hugging the far shelf leaves it up to 0.6 m off on its own, and when
      // that offset ran against the dolly the two cancelled to 0.63 m — inside
      // the 1.01 m the panel and its rail occupy. Logged over a chase, the lens
      // wandered between 0.63 and 2.15 m off the lane while the constant that
      // was supposed to be holding it clear never changed.
      // So: work out where the lens is ACTUALLY going to sit relative to the
      // aisle it is looking down, and dolly by whatever it takes.
      const over = axisX ? 0 : clamp((h - T.signLo) / T.signRamp, 0, 1);
      const sgx = rx * T.shoulderSide, sgz = rz * T.shoulderSide;
      const pre = (eyeX - L.cx) * sgx;              // lane offset already in hand
      const need = lerp(T.shoulder, Math.max(T.shoulder, T.signClear), over);
      const sh = Math.max(T.shoulder, need - pre);
      // Lens and aim get the same push, so the forward vector — and therefore
      // `yaw` — is untouched by any of it.
      aimX += sgx * sh; aimZ += sgz * sh;
      const jx = sk * Math.sin(shake * 41);
      let px = eyeX + sgx * sh - bx * d + rx * jx;
      let pz = eyeZ + sgz * sh - bz * d + rz * jx;
      y += sk * 0.5 * Math.sin(shake * 53);
      // Walls. Clamping the lens rather than the aim means the shot tips down
      // and closes in when you run into the front end instead of the cop sliding
      // to the edge of frame — the aim is still on him either way.
      px = clamp(px, STORE.minX + 1.1, STORE.maxX - 1.1);
      pz = clamp(pz, STORE.minZ + 1.1, STORE.maxZ - 1.1);

      // Sign guard, belt and braces. The dolly above holds the lens clear while
      // the camera is settled on an axis, but it pushes along the camera's OWN
      // right vector — and halfway through a swing that vector points down the
      // aisle instead of across it, so the push stops being lateral at all and
      // the lens can cross the centreline while it is still up in the sign band.
      // Logged over a chase, the closest it came was 0.08 m off the lane at 3.2 m
      // high, which only missed a sign because it was not at a sign's z.
      // This measures the clearance it ACTUALLY ended up with and caps the height
      // if it is not enough. Cheap, smooth, and it can only ever lower the lens
      // under 2.46 — where nothing hangs.
      const laneRel = Math.abs(px - lane(px).cx);
      const clear = smoothstep((laneRel - 0.78) / (T.signClear - 0.78));
      y = Math.min(y, lerp(T.signLo, 99, clear));
      // Never inside the shelving, never through the ceiling.
      y = clamp(y, SHELF_H + 0.30, CEIL_H - 0.55);

      cam.position.set(px, y, pz);
      AIM.set(aimX, look, aimZ);
      cam.lookAt(AIM);
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }

      // ---- THE ONE LINE THAT CANNOT BE WRONG --------------------------------
      // yaw is READ BACK off the camera that was just posed, never assumed from
      // the bearing that was used to place it — the aim carries a lane blend and
      // a wall clamp, so the two are not the same angle. main.js rotates WASD by
      // this every frame; derive it from anything other than the actual forward
      // vector and the controls mirror the moment the shot is not exactly square
      // to the aisle. main.js's basis is fwd = (-sin y, cos y), so this inverts
      // to atan2(-fwd.x, fwd.z).
      V.set(AIM.x - px, 0, AIM.z - pz);
      if (V.lengthSq() > 1e-8) {
        V.normalize();
        api.yaw = Math.atan2(-V.x, V.z);
      }

      const r = api.rig;
      r.eye[0] = px; r.eye[1] = y; r.eye[2] = pz;
      r.look[0] = AIM.x; r.look[1] = AIM.y; r.look[2] = AIM.z;
      r.fov = fov; r.yaw = api.yaw; r.dist = d; r.height = y;
    },

    // Console handle: what the rig thinks it is doing, in one line.
    debug() {
      return {
        yaw: +api.yaw.toFixed(3), axis: axisX ? 'X' : 'Z', sign,
        h: +h.toFixed(2), d: +d.toFixed(2), fov: +fov.toFixed(1),
        sprint: +sprint01.toFixed(2), gas: +gas01.toFixed(2),
        chase: +chase01.toFixed(2), gap: +gap01.toFixed(2), swing: +swing01.toFixed(2),
        dbg,
      };
    },
    bands: () => crossBands(),
  };
  return api;
}

// ---------------------------------------------------------------------------
// Drop-in for src/game/hud.js. Same signature, same return shape, same
// off-screen sentinel — but through the live camera, so it is correct for any
// pose. `cop` is accepted and unused: it exists so the call sites in hud.js do
// not have to change.
// ---------------------------------------------------------------------------
const _W = 1280;
let _v = null, _m = null;
export function projectFromCop(cop, x, y, z) {
  const c = LIVE_CAM;
  const H = Math.round(_W / ((c && c.aspect) || 16 / 9));
  if (!c) return { x: -90, y: H / 2, behind: true };
  if (!_v) {
    // three is not imported here on purpose — this file's only three.js handle
    // is the constructor argument. Borrow the classes off the camera itself.
    _v = new c.position.constructor(0, 0, 0);
    _m = new c.matrixWorld.constructor();
  }
  c.updateMatrixWorld();
  _m.copy(c.matrixWorld).invert();
  _v.set(x, y, z).applyMatrix4(_m);
  const zc = -_v.z;                                  // metres in front of the lens
  if (zc <= 0.25) return { x: _v.x > 0 ? _W + 90 : -90, y: H / 2, behind: true };
  const TAN = Math.tan((c.fov * RAD) / 2), ASP = c.aspect;
  return {
    x: ((_v.x / zc) / (TAN * ASP) * 0.5 + 0.5) * _W,
    y: (0.5 - (_v.y / zc) / TAN * 0.5) * H,
    behind: false,
  };
}
