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
// ADDITIVE (round 2): `moveYaw` — the bearing WASD should be rotated by.
//   ASK TO THE LEAD, one line in main.js readInput():
//       const y = (chaseCam.moveYaw ?? chaseCam.yaw) || 0;
//   `yaw` stays exactly what the contract above says it is: the camera's real
//   yaw, including whatever the player's mouse is doing to it this instant.
//   `moveYaw` is the same number with the GLANCE TAKEN OUT — the corridor
//   bearing the rig would be sitting at if the mouse had never been touched.
//   Reasoning in THE GLANCE below; the short version is that rotating the
//   movement basis with the look re-opens the feedback loop round 1 closed,
//   because the axis latch reads the cop's velocity. This file works either
//   way — it detects which number main.js is actually reading (the getter
//   counts its own reads) and shrinks the look budget when it is still on
//   `yaw`, so nothing is broken while the hook is pending.
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
// THE NEW BAND. Three hard numbers set it, and only the first two were the ones
// I expected:
//   2.05 m  gondola deck top. Below it the lens is in the shelving.
//   2.47 m  the underside of a hanging aisle sign — the CARRIER, not the panel
//           (store.js hangs a fix() box 3 cm taller than the artwork). They hang
//           over the aisle centreline at four z planes per aisle: both store
//           ends and both sides of the mid-store walkway.
//   3.80 m  the top of the SIGN GANTRY bolted to every gondola — uprights at
//           SHELF_H+0.30, slot panels at +0.55, a sage signage band at +1.30.
//           None of it has a collider, because none of it ever stopped a person.
//
// So the slot is 2.05..2.47, and it is not a compromise, it is the only place a
// camera can be in this store. 2.36 sits in the middle of it: 31 cm over the
// decks, 11 cm under the signage. From there the gondolas are walls, the signs
// pass overhead the way they do when you walk under one, and the ceiling — which
// the old 6.4 m rig lived ABOVE and therefore never showed anyone — takes the
// top third of frame from about 9 m out.
//
// I SPENT THIS ROUND BELIEVING THE OPPOSITE. The plan was a camera that lived
// low when you had time and bought height with the gap when you needed to find
// a man, on the reasoning that clearing a 2.05 m shelf top restores the
// sightline into the next aisle. It does not, because there is no 2.05 m shelf
// top: number three above is what is actually between you and him, and nothing
// under a 5.2 m ceiling clears it. Measured on a replayed chase against the real
// scene, the rise moved visibility from 10.7% to 10.9% and made keeping him IN
// FRAME slightly worse. See the gap block in T for the numbers and for the
// wrong version of the same measurement that nearly shipped.
//
// What that leaves is a better camera than the one I set out to build: it sits
// in the slot all the time. The gap still widens the frame — distance and FOV,
// so more of the aisle and more of the cross-aisle mouths are in shot — but it
// no longer climbs out of the store to do it.
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

// ===========================================================================
// THE GLANCE (round 2) — "I just want to be able to turn and look down those
// aisles as I'm walking."
//
// WHAT IS ADDED IS AN OFFSET, NOT A CAMERA. Every number round 1 measured —
// the 2.36 slot, the lane pin, the shoulder dolly, the sign clearance, the
// corner swing, the boom — still computes the same pose it always did. The
// mouse rotates the AIM off that pose and nothing else. With the mouse
// untouched the two are the same angle to the bit, so a player who never
// moves the mouse is playing round 1's camera exactly.
//
// 1. LOOK IS DECOUPLED FROM HEADING. This is the decision the round asked for
//    and it is not the standard one. In a third-person game the mouse is the
//    steering: turn the camera, W follows. Here that re-opens a loop this file
//    spent round 1 closing. The chain is short and it is real:
//
//        mouse turns camera -> W (camera-relative) drives the cop diagonally
//        -> the axis latch reads |vx| > |vz| * 1.35 -> the CORRIDOR bearing
//        flips 90 degrees -> the camera whips, and W now means somewhere else
//        again.
//
//    So a 40 degree glance while holding W does not just curve you into a
//    gondola, it can trip a 90 degree automatic swing — the auto-whip the
//    brief rules out — off nothing but a wrist movement. Decoupled, the mouse
//    cannot move the cop at all, so the latch stays fed by pure walking and
//    round 1's corridor behaviour is untouched while you look.
//
//    It is also just what was asked for. "Turn and look down those aisles AS
//    I'M WALKING" is a head turn, not a change of course. Look-to-apex in a
//    racing game, freelook in a milsim, glancing over your shoulder at a
//    junction: all of them keep the body going where it was pointed.
//
//    It costs one line in main.js (see moveYaw above). Until that line lands
//    the movement basis is the camera, so the look budget is capped at 52
//    degrees instead of 110 — enough to read a cross-aisle, small enough that
//    the diagonal never reaches the latch's dominance test. The file detects
//    which world it is in rather than assuming.
//
// 2. IT RECENTRES, AT A RATE THAT SCALES WITH HOW FAST YOU ARE MOVING. One
//    rule, and every awkward case falls out of it:
//      standing still  rate 0     — it holds. Stand and read the aisle signs.
//      walking         rate ~0.95 — a glance decays over about two seconds.
//      sprinting       rate ~3.2  — back down the corridor in ~0.6 s.
//    Which is the answer to "he has turned to admire the shelves and lost the
//    man": during a chase you are sprinting, so the corridor comes back on its
//    own the moment you stop pushing the mouse. Right-click recentres now.
//    A 0.40 s dwell after the last mouse input keeps it from fighting the
//    hand, and the return is suspended entirely while the corridor bearing is
//    mid-swing, so the two rotations can never stack into a whip.
//
// 3. IT DOLLIES IN, IT DOES NOT ORBIT. A 5.55 m boom looking 90 degrees to the
//    side does not see down the aisle — it sees the gondola end 5.55 m short
//    of the mouth. The lens has to be AT the corner to read round it. Two ways
//    to get there: orbit the eye around the cop, or run it up the boom.
//    Orbiting takes the eye off the lane centreline, which is where every
//    round-1 guarantee lives (sign clearance, the `lat` budget, the boom
//    origin), and it is lateral translation, which is the nauseating kind.
//    The dolly is along the view axis, it keeps the lens exactly on the lane,
//    and it lands the eye 1.15 m behind the cop — inside the 2.00 m half-width
//    of the aisle it is looking down. So the deep glance is a peek from the
//    corner, and the geometry that makes it safe never changed.
//    It only engages past 22 degrees: a small glance is pure rotation and
//    moves the lens not at all.
//
// 4. PITCH, BECAUSE THE SIGNS ARE THE GAME. Aisle signs hang 2.47..4.11 m and
//    the brief makes reading them a mechanic. From 2.36 m a sign 6 m ahead is
//    only 9 degrees up, so a little goes a long way: 34 up, 24 down, and the
//    absolute pitch is clamped at 42 either way. NO ROLL, still.
//
// 5. POINTER LOCK, RELEASED BY THE DESK. The client asked to "just mouse
//    move", which means lock; the desk phase is a mouse UI, which means the
//    lock cannot be allowed to outlive the floor. Both, then:
//      - left click on the floor takes the lock. Plain mouse motion looks.
//      - Esc gives the cursor back (the browser does this itself); clicking
//        again takes it back. Nothing on the floor is clickable — every
//        hud.js reg() call is inside drawDesk() — so a click there is free.
//      - holding the left button and dragging looks WITHOUT the lock, which is
//        the whole feature for anyone whose browser refuses the lock, and the
//        way to take one quick look without being captured.
//      - a 200 ms watchdog runs ONLY while locked and drops the lock the
//        instant game.mode stops being 'floor' — Q, Tab, a catch, a write-up,
//        a demotion. Belt and braces: every mouse handler no-ops unless the
//        mode is 'floor' AND update() has been called in the last 500 ms, so
//        even a wedged watchdog cannot leave the desk being steered.
//    None of it touches main.js or game.js. The listeners are this file's.
//
// 6. prefers-reduced-motion: the automatic return is halved (an unrequested
//    rotation is the thing that hurts), the pitch range is cut to 60%, and the
//    glance dolly — the only translation in here — is turned off entirely.
//    Read live, so toggling the OS setting takes effect without a reload.
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
// TUNING. `__CHOP.chaseCam.T` is live, so any of it can be swept from the
// console without editing this file — which is how the numbers below that cite
// a measurement were arrived at.
//
// Where a comment says MEASURED it names the shot or the number it came from.
// Where it does not, it is a judgement made by looking at the frame, and should
// be treated as one. Round 1 did not have time to sweep everything, and an
// invented measurement in this file would be worse than an admitted opinion.
// ---------------------------------------------------------------------------
const T = {
  // --- resting shot (walking the floor, no chase) --------------------------
  // 2.36 is the slot: 31 cm over the gondolas, 11 cm under the signage.
  // MEASURED TWICE, and the second one is the reason this is 2.36 and not 2.44.
  //   1. The first build let the pursuit rise carry the lens to 3.16 m and
  //      shots/cam_r1_gassed.png came back with a full-screen CRACKERS / NUTS
  //      banner across the middle of frame.
  //   2. With the rise fixed, the CORNER frame still came back as a wall of
  //      cream. The panel bottom is 2.50, but the sign sits on a carrier box —
  //      store.js: fix(x, SIGN_Y, z, SIGN_W+0.06, SIGN_H+0.06, 0.07) — which is
  //      3 cm taller, so the real underside of a hanging sign is 2.47, not 2.50.
  //      2.44 was clearing it by three centimetres and the camera was grazing
  //      the carrier every time it passed one. Nothing in the occlusion metric
  //      caught it because the metric only modelled gondolas.
  // The lesson is the cheap one: measure the thing that is actually in the way,
  // not the thing named in the brief.
  height: 2.36,
  dist: 5.55,
  // Aim height. 1.30 (chest) was the first guess and it is wrong: aiming low
  // tips the frame DOWN, which parks the cop's head on the vanishing point —
  // the one pixel a man running away down the aisle occupies.
  // MEASURED, 1.30 vs 1.65 on the same spawn: at 1.30 the subject at 6.9 m sat
  // behind the cop's head; at 1.65 he was clear of it with the aisle open above.
  // 1.55 keeps that and holds a little more floor, which is where the reference
  // photography puts the specular smear.
  look: 1.55,
  fov: 57,

  // --- sprint (0..1 on speed above the walk) -------------------------------
  // The speed cue is FOV and lag, not proximity. Closing the dolly at speed is
  // the obvious move and it is wrong here: the cop's own back is what covers the
  // end of the aisle, and the end of the aisle is where the man is. So it pulls
  // slightly BACK and takes the speed out of the FOV instead.
  sprHeight: -0.16, sprDist: +0.40, sprFov: +7.0, sprLook: -0.08,

  // --- gassed (0..1, eased) ------------------------------------------------
  // The one place the camera is allowed to hurt you. It drops, pulls in and
  // narrows — 2.22 m, 4.60 m back, 51 degrees — so the aisle stops being a
  // corridor you are travelling down and becomes a wall you are stuck against.
  // No roll: see NO ROLL below.
  gasHeight: -0.22, gasDist: -0.95, gasFov: -6.0, gasLook: -0.14,

  // --- pursuit + gap -------------------------------------------------------
  // chase* is the flat lift the moment a man bolts. gap* is the part that scales
  // with how far away he is, and it is the playability half of this whole file.
  //
  // MEASURED, TWICE, AND THE SECOND ONE OVERTURNED THE FIRST. This is the
  // number that was supposed to decide whether the low camera is allowed to
  // exist, and the answer turned out to be that it does not matter at all.
  //
  // Method: record one chase as a tape of cop and thief positions, replay it
  // under each rig so the trajectory is identical and the camera is the only
  // variable, and count frames where the thief is on screen AND has a clear
  // line from the lens to his head, chest or hip.
  //
  // First pass modelled the shelving as 2.05 m boxes — SHELF_H, straight out of
  // config — and reported that lifting the lens took visibility from 63.8% to
  // 69.8%. On that number the gap rise was the playability half of this file.
  //
  // Then a raycast against the ACTUAL SCENE found the thing that had been
  // filling the corner frame sitting at y 2.39, and a gondola turned out to
  // carry uprights, slot panels and a sage signage band to about 3.8 m. There
  // is no 2.05 m shelf in this store to see over. Re-run against real geometry:
  //
  //     gapHeight 0      lens avg 2.60 m    visible 10.7%   on screen 82.3%
  //     gapHeight 0.85   lens avg 2.91 m    visible 10.9%   on screen 78.1%
  //
  // Two tenths of a point, and it makes KEEPING him in frame slightly worse.
  // The rise bought nothing, and everything expensive in this file — the sign
  // dolly, the height cap, the boom budget — existed to pay for it.
  //
  // So it is zero. A thief who leaves your aisle is not visible from anywhere
  // under a 5.2 m ceiling in a store shelved like this one, and no camera height
  // changes that; the pursuit panel's DOOR / HIM / YOU / OUT IN readout is the
  // mechanism that answers "where is he", and it is a good one. What the gap
  // still buys is FRAMING — distance and FOV, so more of the aisle and more of
  // the cross-aisle mouths are in shot. Those stay.
  //
  // The general lesson, which cost this round about an hour: a measurement is
  // only as good as its model of the world. Both of my first two occlusion
  // models were made of config constants and both were confidently wrong. The
  // scene itself was always right there to ask.
  chaseHeight: +0.16, chaseLook: +0.05,
  gapHeight: 0.0, gapDist: +1.60, gapFov: +5.0, gapLook: +0.16,
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
  // slides out of frame sideways). Not swept — set by eye, and the honest thing
  // to say is that the SPLIT is the idea and the two rates are a first guess.
  // A critic with time should sweep them; they are the most likely place a
  // round-2 improvement is sitting.
  followAlong: 4.3, followCross: 9.5,
  rigRate: 5.0,        // how fast height/dist/fov/look chase their state targets
  lead: 1.15,          // metres of velocity lead-in at full sprint

  // --- yaw -----------------------------------------------------------------
  // Critically damped, with a hard cap on angular rate. This is the single
  // biggest feel decision in the file and it is deliberately on the slow side
  // of decisive: MEASURED off the logs, w0 6.2 takes about 0.8 s to settle a 90
  // degree corner and about 1.5 s for a 180 (yaw 0 -> 3.10 between t=2.0 and
  // t=3.5 while holding S). A 180 in 1.5 s averages 2.1 rad/s, which is a turn
  // you can follow rather than a whip. The rate cap only ever binds on a 180.
  yawW: 6.2, yawMax: 3.1,
  axisDwell: 0.26,     // sustained seconds of cross-axis motion before the turn
  axisRatio: 1.35,     // and it has to dominate by this much. Stops a strafe
                       // from spinning the camera at an aisle junction.
  axisSpeed: 0.90,
  signDwell: 0.55, signHyst: 0.45, flipLock: 1.60,
  reArm: 1.00, reArmStill: 0.25,

  // --- corner behaviour ----------------------------------------------------
  // Mid-swing the lens is on a diagonal, which in a grid of gondolas means it is
  // over a shelf run with another shelf run between it and the cop. The first
  // corner frame came back as a full-screen wall of cream.
  //
  // MEASURED. A soak walks aisle 4 end to end (all four sign planes), turns 180
  // at the back, comes back and turns into the mid walkway — 1018 frames — and
  // counts frames where a gondola or a sign slab sits on the segment from lens
  // to cop's chest:
  //
  //     swingDolly 0.30, swingFollow 0      6.68% hidden
  //     swingDolly 0.30, swingFollow 2.4    6.68%
  //     swingDolly 0.58, swingFollow 0      4.13%
  //     swingDolly 0.58, swingFollow 2.4    0.00%   <- shipped
  //
  // Read that carefully, because it is not what I expected and not what I first
  // wrote down. NEITHER CONSTANT DOES ANYTHING USEFUL ALONE. Tightening the
  // follow spring on its own changes nothing at all; pulling the dolly in on its
  // own gets a third of the way. They only work together: the dolly has to bring
  // the lens close enough that the aisle cell it shares with the cop has no shelf
  // in it, and THEN the spring has to stop framing where he was a third of a
  // second ago. Either one without the other and the corner still eats him.
  swingDolly: 0.58, swingLift: 0.50, swingFollow: 2.4,

  // --- over the shoulder ---------------------------------------------------
  // Round 1's first render was otherwise right and unplayable: dead centre in a
  // 4 m aisle, the cop's own back sits exactly on the vanishing point, which is
  // exactly where a man you are chasing down that aisle appears. Measured on
  // that shot (shots/cam_probe.png) the thief at 7.3 m was behind the cop's
  // head, and projectFromCop put the cop's chest at screen x 640.0 of 1280 —
  // dead centre to a tenth of a pixel.
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
  // The lens is not pinned at one height — the chase lift and the corner lift
  // carry it between 2.35 and 2.63, and the signage starts at 2.47. So it does
  // still cross the sign line, just by 16 cm instead of the 80 that the deleted
  // gap rise used to cost. Measured, not predicted: shots/cam_r1_gassed.png
  // caught the first version of this — a full-screen CRACKERS / NUTS banner
  // across the middle of the frame with the man being chased somewhere behind it.
  //
  // The obvious fix is to duck under the sign as it comes up. It is the wrong
  // one: a vertical dip inside a 1.3 m window at 6 m/s is a lurch, four times
  // per aisle, which is precisely the motion-sickness case the brief rules out.
  // And it needs the sign's z planes, i.e. another private copy of store.js's
  // floor plan.
  //
  // Slide instead. A sign is only 1.86 m wide on a 4 m aisle, so going wide of
  // the centreline clears the panel, its rail and its two hangers, and needs NO
  // z knowledge at all — only that a sign hangs over the middle of an aisle,
  // which is what makes it a sign. It rides `height`, so the camera cranes out
  // sideways as it rises and back in as it settles: one horizontal move instead
  // of four vertical ones. It also widens the shoulder parallax while it is out
  // there, which is free.
  //
  // 1.20 m is what it takes to MISS a sign, and missing it is not enough: it
  // leaves the panel edge 0.21 m off the lens, and a 1.86 x 1.64 m board at
  // 0.21 m is most of the screen — shots/cam_sw_clear120.png is that frame, and
  // cam_sw_clear172.png is the same instant with the lens further out, where the
  // sign sweeps the edge of frame the way signage does when you walk under it.
  // The shipped 1.66 is that, minus the 6 cm the boom radius needs back (see
  // `lat`). The other way out was to climb OVER them: cam_sw_high.png at 4.37 m
  // still has a sign filling the corner, because you pass just as close on the
  // way up, and the store underneath has gone back to being a floor plan.
  signLo: 2.38,        // underside of the sign CARRIER, 2.47, minus 9 cm
  signClear: 1.66,     // half of SIGN_W 1.86 is 0.93; the rail takes it to 1.01
  signRamp: 0.50,      // metres of height over which the dolly widens
  // Where the height cap lets go. It has to be OUTSIDE the sign footprint
  // (1.01 m), not merely on the way there: at 0.78 the cap released while the
  // lens was still directly under the panel, which is the other half of the
  // wall-of-cream corner frame.
  signFree: 1.06,
  // Hard ceiling on how far off the lane centreline the lens or the aim may sit,
  // and it has to be budgeted against `boomR`, not just against the aisle.
  // AISLE_GAP/2 is 2.00 to the gondola face. Round 1 set this to 1.78 with a
  // 0.34 boom radius: 1.78 + 0.34 = 2.12, so the swept lens was permanently 12
  // cm INSIDE the inflated shelf and the boom collapsed to its minimum on every
  // frame the gap rise was active — avgBoom 2.92 m against a 5.55 m rig, and a
  // thief visible in 0% of a replayed chase. `lat + boomR` and
  // `signClear + boomR` must both stay under 2.00.
  lat: 1.70, boomR: 0.26,

  // --- lane framing --------------------------------------------------------
  // The lens rides the AISLE centreline, not the cop's x. He is 4 m of walkable
  // width to move around in and the shot should not wander with him — pinning
  // the camera to the lane is what makes two walls of product converge instead
  // of sliding. He still drifts within the frame, which is the part that sells
  // him as a man in a place rather than a reticle.
  laneEye: 0.62, laneAim: 0.75,

  // --- the glance (round 2) ------------------------------------------------
  // Sensitivity is in radians per CSS pixel of mouse travel, i.e. after the
  // OS's own acceleration curve. 0.0032 puts the 110 degree stop 600 px away,
  // which on a normal desktop setup is a 2-4 cm flick — a wrist, not an arm.
  // Pointer lock is asked for with unadjustedMovement so the OS curve comes
  // off where the browser allows it; it falls back silently where it does not.
  lookSens: 0.0032,
  // Drag has a hard travel limit (the window), so it runs hotter: full range
  // in about 420 px, comfortably inside a 1280-wide canvas.
  lookSensDrag: 0.0046,
  lookPitchScale: 0.78,       // vertical is always the less-wanted axis
  // The budget. lookMax applies once main.js is steering off `moveYaw`;
  // lookMaxCoupled is the fallback while it is still steering off `yaw`, where
  // every degree of look is also a degree of steering error. 52 is set at the
  // latch: the axis flip needs the cross-axis component to dominate by 1.35,
  // i.e. 53.5 degrees off the corridor, so at 52 a full-deflection glance on a
  // held W still cannot trip a corridor swing. That is the number that matters
  // in the fallback, not comfort.
  lookMax: 110 * RAD,
  lookMaxCoupled: 52 * RAD,
  lookUp: 34 * RAD, lookDown: 24 * RAD, pitchClamp: 42 * RAD,
  lookSmooth: 24,             // applied offset chases the target, tau ~42 ms.
                              // Enough to kill the stair-step from a 125 Hz
                              // mouse against a 60 Hz frame, short enough that
                              // it is not felt as lag.
  lookDwell: 0.40,            // seconds of a still mouse before the return starts
  // Return rate = returnWalk * (speed/walk) + returnRun * sprint01. Standing
  // still that is zero and the look simply stays where it was put.
  returnWalk: 0.95, returnRun: 2.30,
  returnCap: 2.20,            // rad/s ceiling on the automatic return. Round 1
                              // judged 2.1 rad/s (a 180 in 1.5 s) followable
                              // rather than a whip; this sits just under it.
  returnSwing: 0.35,          // suspend the return while the corridor bearing
                              // is swinging harder than this. The two rotations
                              // must never add up.
  recentreRate: 9.0,          // right-click: ~0.35 s for 90 degrees, cap x1.5
  // Glance dolly. Starts at 22 degrees, full by 95. 0.80 takes a 5.55 m boom
  // to 1.11, floored at 1.15 — which is the number that matters, because the
  // aisle it is looking down is 2.00 m half-width and the eye has to be inside
  // that to see anything but shelf.
  lookDollyAt: 22 * RAD, lookDollyFull: 95 * RAD,
  lookDolly: 0.80, lookDollyMin: 1.15,
  // Metres per second the glance dolly is allowed to travel. Rate-limited on
  // the RAMP, not on `d`, on purpose: capping `d` itself would also cap the
  // corner dolly, and that one is measured (0.00% hidden) and must not move.
  dollyMax: 6.0,
  // The shoulder exists to keep the cop's head off the vanishing point. In a
  // deep glance he is not near it — he is off frame — and 0.90 m of lateral
  // offset on a 1.15 m boom is a 38 degree skew. Fade it out with the dolly.
  lookShoulderFade: 0.80,

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

  // --- the store's own colliders, for boom collision -----------------------
  // Round 1 spent three passes guessing what was in front of the lens from
  // config numbers and got it wrong every time — first the gondolas (2.05),
  // then the sign panels (2.50), then the sign carriers (2.47). The thing that
  // was ACTUALLY filling the corner frame turned out to be none of them: a
  // raycast against the live scene put it at y 2.39, x 1.97 off the lane, which
  // is the gondola's SIGN GANTRY — uprights at SHELF_H+0.30, slot panels at
  // +0.55, a sage signage band at +1.30 x 0.70 tall. A shelf run is 3.7 m tall
  // as far as a camera is concerned, not 2.05.
  //
  // So stop asserting the floor plan and read it. store.js publishes Box3
  // colliders (74 of them — nothing, per frame) and they are the authoritative
  // footprint of everything solid. The one adjustment: a collider's height is
  // sized for a PERSON, and nothing above head height was ever given one, so
  // anything tall enough to stop a body is treated as solid to the ceiling.
  // Things shorter than that — checkout counters, bins, produce tables — keep
  // their real height and the camera may fly over them, which it should.
  let boxes = null;
  function solids() {
    if (boxes) return boxes;
    try {
      const w = typeof window !== 'undefined' && window.__CHOP && window.__CHOP.world;
      const cs = w && w.colliders;
      if (!cs || !cs.length) return null;
      boxes = cs.map((b) => ({
        x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z,
        // A gondola's collider stops at 2.0 because that is where it stops
        // stopping people; the sign gantry bolted to it goes to about 3.8
        // (SHELF_H + 1.30 + 0.35) and has no collider at all. Walls declare
        // their real height and keep it. Round 1 first wrote this as "anything
        // over 1.5 is solid to the ceiling", which is what strangled the wide
        // pursuit shot — at 5.2 there is no height the lens can rise to.
        y1: b.max.y > 2.5 ? b.max.y : b.max.y > 1.5 ? SHELF_H + 1.75 : b.max.y + 0.15,
      }));
    } catch (e) { boxes = null; }
    return boxes;
  }
  // Slab sweep from the aim point back along the boom. Returns the fraction of
  // the boom that is clear, so a wall or an endcap tucks the lens in behind the
  // cop instead of putting itself between them.
  function boomClear(ax, ay, az, ex, ey, ez, r) {
    const bs = solids();
    if (!bs) return 1;
    const dx = ex - ax, dy = ey - ay, dz = ez - az;
    let best = 1;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      let t0 = 0, t1 = best;
      if (dx > -1e-9 && dx < 1e-9) { if (ax < b.x0 - r || ax > b.x1 + r) continue; }
      else {
        let a = (b.x0 - r - ax) / dx, c = (b.x1 + r - ax) / dx;
        if (a > c) { const s = a; a = c; c = s; }
        if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue;
      }
      if (dy > -1e-9 && dy < 1e-9) { if (ay < -r || ay > b.y1 + r) continue; }
      else {
        let a = (-r - ay) / dy, c = (b.y1 + r - ay) / dy;
        if (a > c) { const s = a; a = c; c = s; }
        if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue;
      }
      if (dz > -1e-9 && dz < 1e-9) { if (az < b.z0 - r || az > b.z1 + r) continue; }
      else {
        let a = (b.z0 - r - az) / dz, c = (b.z1 + r - az) / dz;
        if (a > c) { const s = a; a = c; c = s; }
        if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) continue;
      }
      if (t0 < best) best = t0 < 0 ? 0 : t0;
    }
    return best;
  }

  // --- persistent rig state ------------------------------------------------
  let fx = 0, fz = 0;                 // smoothed focus point (world XZ)
  let started = false;
  let yawA = 0, yawV = 0;             // camera bearing + angular velocity
  let axisX = false;                  // false = reads along Z (down an aisle)
  let sign = 1;                       // +1 / -1 along that axis
  let axisT = 0, signT = 0, lockT = 0;
  let armed = true, agreeT = 0, stillT = 0;   // see WHICH END OF IT
  let vAlong = 0;                     // low-passed velocity along the axis
  let h = T.height, d = T.dist, fov = T.fov, look = T.look;
  let sprint01 = 0, gas01 = 0, chase01 = 0, gap01 = 0, boost01 = 0, swing01 = 0;
  let bobP = 0, shake = 0, prevStagger = 0, boomT = 1;
  let baseYaw = 0;                     // corridor bearing with the glance removed
  let moveReads = 0, lastReads = 0, coupleT = 99;   // is main.js reading moveYaw?
  const dbg = {};                      // last frame's corridor read, for debug()

  // =========================================================================
  // THE GLANCE. Design rationale is in the block at the top of the file; this
  // is the plumbing. Nothing in here touches another file: the listeners are
  // ours, they are all no-ops unless the game is on the floor, and the one
  // thing they can affect outside this closure is the pointer lock, which is
  // taken on the floor and dropped the moment the floor ends.
  // =========================================================================
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const GL = {
    on: true,                 // master switch, for the console
    pointerLock: true,        // ask for the lock on click (drag still works without)
    invertY: false,
    tgtY: 0, tgtP: 0,         // where the player has put the look
    curY: 0, curP: 0,         // what is applied, one smoothing step behind
    pendX: 0, pendY: 0,       // mouse delta accumulated since the last update
    idle: 9,                  // seconds since the last mouse input
    force: 0,                 // right-click recentre timer
    ramp: 0, rampA: 0,        // glance dolly, wanted and rate-limited
    dragging: false, locked: false, decoupled: false, reduced: false,
  };
  function zeroGlance() {
    GL.tgtY = GL.tgtP = GL.curY = GL.curP = 0;
    GL.pendX = GL.pendY = 0; GL.ramp = GL.rampA = 0; GL.idle = 9; GL.force = 0;
  }

  // --- is the player actually on the floor right now ------------------------
  // Two independent reads, because the cost of getting this wrong is a desk
  // phase you cannot click. main.js only calls update() when the mode is not
  // 'desk', so a recent update is a liveness proof; game.mode is the direct
  // answer and rules out 'writeup' and 'demoted', which also get update()d.
  let lastUpdateMs = -1e9, prevMode = null;
  function gameMode() {
    try {
      const g = typeof window !== 'undefined' && window.__CHOP && window.__CHOP.game;
      return (g && g.mode) || null;
    } catch (e) { return null; }
  }
  function onFloor() {
    if (now() - lastUpdateMs > 500) return false;
    const m = gameMode();
    return m == null ? true : m === 'floor';
  }

  // --- pointer lock ---------------------------------------------------------
  let watch = 0;
  const lockEl = () => (typeof document !== 'undefined' && (document.body || document.documentElement)) || null;
  function releaseLock() {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* nothing */ }
  }
  function requestLock() {
    const el = lockEl();
    if (!el || !el.requestPointerLock) return;
    try {
      // unadjustedMovement takes the OS acceleration curve off where Chrome
      // supports it. Where it does not, the promise rejects and the plain call
      // is still inside the click's gesture window.
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { el.requestPointerLock(); } catch (e) { /* denied */ } });
    } catch (e) {
      try { el.requestPointerLock(); } catch (e2) { /* denied, drag still works */ }
    }
  }
  function startWatch() {
    if (watch || typeof setInterval !== 'function') return;
    watch = setInterval(() => {
      if (typeof document === 'undefined' || !document.pointerLockElement) { stopWatch(); return; }
      if (!onFloor()) releaseLock();
    }, 200);
  }
  function stopWatch() { if (watch) { clearInterval(watch); watch = 0; } }

  function bindLook() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!window.addEventListener) return;

    document.addEventListener('mousemove', (e) => {
      if (!GL.on) return;
      const locked = !!document.pointerLockElement;
      if (!locked && !GL.dragging) return;
      if (!onFloor()) { if (locked) releaseLock(); GL.dragging = false; return; }
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (!dx && !dy) return;
      const s = locked ? T.lookSens : T.lookSensDrag;
      GL.pendX += dx * s;
      // Screen-down is a negative pitch offset. invertY flips it for the
      // people who fly planes.
      GL.pendY += dy * s * T.lookPitchScale * (GL.invertY ? 1 : -1);
      GL.idle = 0;
    }, { passive: true });

    // NOTE: no preventDefault anywhere on the button path. game.js listens for
    // mousedown on the HUD canvas and does its own hit test; if this handler
    // ever swallowed an event the desk would stop taking clicks. It does not
    // need to — on the floor hud.hit() has nothing to return.
    window.addEventListener('pointerdown', (e) => {
      if (!GL.on || !onFloor()) return;
      if (e.button === 2) { GL.force = 0.45; GL.idle = 9; return; }   // recentre now
      if (e.button !== 0) return;
      GL.dragging = true;
      if (GL.pointerLock && !document.pointerLockElement) requestLock();
    });
    window.addEventListener('pointerup', () => { GL.dragging = false; });
    // A mouse button held while the window loses focus never sends its up.
    window.addEventListener('blur', () => { GL.dragging = false; GL.pendX = GL.pendY = 0; });
    document.addEventListener('contextmenu', (e) => {
      if (GL.on && onFloor()) e.preventDefault();      // right button is recentre
    });
    document.addEventListener('pointerlockchange', () => {
      GL.locked = !!document.pointerLockElement;
      if (GL.locked) startWatch(); else stopWatch();
    });
    document.addEventListener('pointerlockerror', () => { GL.pointerLock = false; });

    try {
      const mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
      if (mq) {
        GL.reduced = !!mq.matches;
        const onMQ = () => { GL.reduced = !!mq.matches; };
        if (mq.addEventListener) mq.addEventListener('change', onMQ);
        else if (mq.addListener) mq.addListener(onMQ);
      }
    } catch (e) { /* no matchMedia, no reduced motion */ }
  }
  bindLook();

  // --- one glance step ------------------------------------------------------
  // Called from update() before the rig is built, so the dolly ramp is in hand
  // by the time `d` is placed. `swing` is last frame's corridor swing; a frame
  // of lag on a suspension test is not worth another ordering constraint.
  function glanceStep(dt, spd, swing, sprint) {
    if (GL.pendX || GL.pendY) {
      GL.tgtY += GL.pendX; GL.tgtP += GL.pendY;
      GL.pendX = 0; GL.pendY = 0;
    }
    const maxY = GL.decoupled ? T.lookMax : T.lookMaxCoupled;
    const rm = GL.reduced ? 0.6 : 1;
    GL.tgtY = clamp(GL.tgtY, -maxY, maxY);
    GL.tgtP = clamp(GL.tgtP, -T.lookDown * rm, T.lookUp * rm);
    GL.idle += dt;

    // ---- the return ------------------------------------------------------
    let rate = 0, cap = T.returnCap;
    if (GL.force > 0) { GL.force -= dt; rate = T.recentreRate; cap = T.returnCap * 1.5; }
    else if (GL.idle >= T.lookDwell && swing < T.returnSwing) {
      const w = clamp(spd / Math.max(0.4, TUNING.copWalk), 0, 1);
      rate = T.returnWalk * w + T.returnRun * sprint;
      if (GL.reduced) rate *= 0.55;
    }
    if (rate > 0 && dt > 0) {
      const k = 1 - Math.exp(-rate * dt), lim = cap * dt;
      GL.tgtY += clamp(-GL.tgtY * k, -lim, lim);
      GL.tgtP += clamp(-GL.tgtP * k, -lim, lim);
      if (Math.abs(GL.tgtY) < 1e-4) GL.tgtY = 0;
      if (Math.abs(GL.tgtP) < 1e-4) GL.tgtP = 0;
    }

    GL.curY = sm(GL.curY, GL.tgtY, T.lookSmooth, dt);
    GL.curP = sm(GL.curP, GL.tgtP, T.lookSmooth, dt);
    // dt == 0 is snap()'s single deterministic step. Nothing eases on a zero
    // step, so a look set from the console would never reach the frame it is
    // being screenshotted into. Apply it whole instead.
    if (dt <= 0) { GL.curY = GL.tgtY; GL.curP = GL.tgtP; }

    // ---- the dolly ramp, rate limited in metres --------------------------
    GL.ramp = GL.reduced ? 0
      : smoothstep((Math.abs(GL.curY) - T.lookDollyAt) / (T.lookDollyFull - T.lookDollyAt));
    // A full ramp is T.lookDolly * d metres of boom, so the ramp rate that
    // holds the lens under dollyMax m/s falls straight out of the current d.
    const rr = T.dollyMax / Math.max(0.5, T.lookDolly * Math.max(1, d));
    const st = rr * dt;
    GL.rampA = dt > 0 ? clamp(GL.ramp, GL.rampA - st, GL.rampA + st) : GL.ramp;
  }

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
    rig: {
      eye: [0, 0, 0], look: [0, 0, 0], fov: T.fov, yaw: 0, dist: T.dist,
      height: T.height, moveYaw: 0, lookYaw: 0, lookPitch: 0,
    },

    update(dt, state) {
      const cop = state && state.cop;
      if (!cop) return;
      const c = cop.position;
      const u = cop.userData || {};
      const vx = (u.vel && u.vel.x) || 0, vz = (u.vel && u.vel.z) || 0;
      const spd = u.speed || Math.hypot(vx, vz);
      dt = clamp(dt || 0, 0, 0.05);

      // ---- who is main.js steering by ---------------------------------------
      // The `moveYaw` getter counts its own reads. readInput() runs immediately
      // before step() in main.js's frame(), and inside run() too, so a read
      // since the previous update means the hook is live and the movement basis
      // is the corridor. Four frames of slack so a bare step(0) — snap() takes
      // one, with no readInput in front of it — cannot flip the mode.
      if (moveReads !== lastReads) { lastReads = moveReads; coupleT = 0; } else coupleT++;
      GL.decoupled = coupleT < 4;
      // ---- floor entry -------------------------------------------------------
      // A look held when the player walked back to the desk must not still be
      // held when he is dispatched again. Keyed off the mode transition rather
      // than off a time gap, so pausing the loop for a screenshot does not
      // silently wipe a look that was set from the console.
      lastUpdateMs = now();
      const md = gameMode();
      if (md !== prevMode) { if (md === 'floor') zeroGlance(); prevMode = md; }

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

      // ---- the player's own look, before anything is placed -----------------
      if (GL.on) glanceStep(dt, spd, swing01, sprint01);

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
        signT = 0; vAlong = nv; armed = true; agreeT = 0;
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
      // The glance dolly rides ON TOP of `d` and never inside it. `d` keeps its
      // measured corner behaviour to the byte; dEff is what the lens uses.
      // At rampA 0 — mouse untouched — dEff === d, because d never gets near
      // the 1.15 floor (the smallest the round-1 rig ever asks for is 1.93).
      const dEff = Math.max(T.lookDollyMin, d * (1 - T.lookDolly * GL.rampA));

      // ---- focus: anisotropic follow + velocity lead ------------------------
      const bx = -Math.sin(yawA), bz = Math.cos(yawA);      // camera bearing
      const rx = -bz, rz = bx;                              // its screen-right
      const ld = T.lead * clamp(spd / run, 0, 1);
      const tx = c.x + bx * ld, tz = c.z + bz * ld;
      let ex = tx - fx, ez = tz - fz;
      const alo = ex * bx + ez * bz, cro = ex * rx + ez * rz;
      const sf = 1 + T.swingFollow * swing01;
      const kA = 1 - Math.exp(-T.followAlong * sf * dt), kC = 1 - Math.exp(-T.followCross * sf * dt);
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
      // Fade the shoulder as the glance dolly runs the lens up the boom. The
      // SIGN clearance term is deliberately not faded — that one is structural.
      const SHO = T.shoulder * (1 - T.lookShoulderFade * GL.rampA);
      const need = lerp(SHO, Math.max(SHO, T.signClear), over);
      // Lane offsets the lens and the aim already carry. They are NOT the same —
      // the aim is pulled harder onto the centreline — so both get measured.
      const preEye = (eyeX - L.cx) * sgx;
      const preAim = (aimX - L.cx) * sgx;
      let sh = Math.max(SHO, need - Math.min(preEye, preAim));
      // ...and then bounded, which is the bit that was missing. `need - pre`
      // is unbounded above, and the follow spring is deliberately soft, so a cop
      // moving sideways leaves the focus point trailing by up to two metres —
      // which reads as a huge negative lane offset, which inflates the dolly to
      // compensate, which put the AIM POINT 1.92 m off the centreline: inside
      // the gondola. The boom then swept from a start position that was already
      // inside a shelf, collapsed to its minimum every single frame, and the
      // thief was visible in 0% of a replayed chase. A camera-collision system
      // whose origin is inside the wall is worse than none.
      if (!axisX) sh = Math.min(sh, T.lat - Math.max(preEye, preAim));
      sh = Math.max(sh, 0);
      // Lens and aim get the same push, so the forward vector — and therefore
      // `yaw` — is untouched by any of it.
      aimX += sgx * sh; aimZ += sgz * sh;
      const jx = sk * Math.sin(shake * 41);
      let px = eyeX + sgx * sh - bx * dEff + rx * jx;
      let pz = eyeZ + sgz * sh - bz * dEff + rz * jx;
      y += sk * 0.5 * Math.sin(shake * 53);
      // Walls. Clamping the lens rather than the aim means the shot tips down
      // and closes in when you run into the front end instead of the cop sliding
      // to the edge of frame — the aim is still on him either way.
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
      const clear = smoothstep((laneRel - T.signFree) / (T.signClear - T.signFree));
      y = Math.min(y, lerp(T.signLo, 99, clear));
      // Boom collision. Sweep from just above the aim point back to where the
      // lens wants to be; whatever fraction of that is clear is the boom we get.
      // Snaps in hard and eases back out, so a wall tucks the camera in at once
      // and gives the shot back gently rather than pumping.
      const ay = look + 0.30;
      const t = boomClear(aimX, ay, aimZ, px, y, pz, T.boomR);
      boomT = sm(boomT, t, t < boomT ? 26 : 4.5, dt);
      const bt = clamp(boomT, 0.16, 1);
      if (bt < 1) {
        px = aimX + (px - aimX) * bt;
        pz = aimZ + (pz - aimZ) * bt;
        y = ay + (y - ay) * bt;
      }
      // Backstop only — the boom above should already have handled the walls.
      px = clamp(px, STORE.minX + 1.1, STORE.maxX - 1.1);
      pz = clamp(pz, STORE.minZ + 1.1, STORE.maxZ - 1.1);
      // Never inside the shelving, never through the ceiling.
      y = clamp(y, SHELF_H + 0.30, CEIL_H - 0.55);

      cam.position.set(px, y, pz);
      AIM.set(aimX, look, aimZ);

      // ---- the glance, applied ----------------------------------------------
      // Everything above is round 1's pose, unmodified. Read the bearing it
      // came out at — that IS the corridor bearing, lane blend, wall clamp and
      // all, which is why it is read back and not assumed — publish it as
      // `moveYaw`, and then rotate the aim point off it by the player's look.
      // The eye does not move. Rotating an aim point rather than composing a
      // quaternion keeps this on exactly the same code path as round 1, so the
      // yaw read-back below stays the single source of truth for both.
      {
        const ax2 = AIM.x - px, az2 = AIM.z - pz, ay2 = AIM.y - y;
        const dh = Math.hypot(ax2, az2);
        if (dh > 1e-4) {
          baseYaw = Math.atan2(-ax2, az2);
          if (GL.curY || GL.curP || GL.rampA > 0) {
            const rad = Math.hypot(dh, ay2);
            // Pitch: the natural one, blended toward the RESTING pitch as the
            // glance dolly runs in. Without this the deep glance tips at the
            // floor — the aim height is fixed at ~1.55 and the lens at ~2.36,
            // so a boom of 5.55 is 8 degrees down and a boom of 1.15 is 34.
            const pRest = Math.atan2(T.look - T.height, T.dist);
            const p0 = lerp(Math.atan2(ay2, dh), pRest, GL.rampA);
            const yF = wrapPi(baseYaw + GL.curY);
            const pF = clamp(p0 + GL.curP, -T.pitchClamp, T.pitchClamp);
            const cp = Math.cos(pF);
            AIM.set(px - Math.sin(yF) * cp * rad, y + Math.sin(pF) * rad,
              pz + Math.cos(yF) * cp * rad);
          }
        }
      }
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
      r.fov = fov; r.yaw = api.yaw; r.dist = dEff; r.height = y;
      r.moveYaw = baseYaw;
      r.lookYaw = GL.curY; r.lookPitch = GL.curP;
    },

    // The look handle. Everything a console (or a critic's driver) needs to
    // reproduce a glance exactly, plus the switches a player-facing options
    // menu would want if this game ever grows one.
    glance: {
      // Absolute offsets in RADIANS, off the corridor bearing. Writes both the
      // target and the applied value, so a set() is visible in the very next
      // snap() even though snap steps with dt = 0.
      set(y, p) {
        const maxY = GL.decoupled ? T.lookMax : T.lookMaxCoupled;
        const rm = GL.reduced ? 0.6 : 1;
        if (y != null) GL.curY = GL.tgtY = clamp(y, -maxY, maxY);
        if (p != null) GL.curP = GL.tgtP = clamp(p, -T.lookDown * rm, T.lookUp * rm);
        GL.idle = 0; GL.force = 0;
        GL.ramp = GL.rampA = GL.reduced ? 0
          : smoothstep((Math.abs(GL.curY) - T.lookDollyAt) / (T.lookDollyFull - T.lookDollyAt));
        return api.glance.state();
      },
      // Degrees, for hands. glance.deg(-60) reads down the aisle on the left.
      deg(y, p) { return api.glance.set(y == null ? null : y * RAD, p == null ? null : p * RAD); },
      nudge(dy, dp) { GL.pendX += dy || 0; GL.pendY += dp || 0; GL.idle = 0; },
      recentre() { GL.force = 0.45; GL.idle = 9; },
      state() {
        return {
          yaw: +GL.curY.toFixed(4), pitch: +GL.curP.toFixed(4),
          deg: +(GL.curY / RAD).toFixed(1), pitchDeg: +(GL.curP / RAD).toFixed(1),
          dolly: +GL.rampA.toFixed(3), locked: GL.locked, dragging: GL.dragging,
          decoupled: GL.decoupled, reduced: GL.reduced, on: GL.on,
          max: +((GL.decoupled ? T.lookMax : T.lookMaxCoupled) / RAD).toFixed(0),
        };
      },
      // Switches. `enabled(false)` restores round 1 exactly.
      enabled(v) { if (v != null) { GL.on = !!v; if (!GL.on) { zeroGlance(); releaseLock(); } } return GL.on; },
      pointerLock(v) { if (v != null) { GL.pointerLock = !!v; if (!GL.pointerLock) releaseLock(); } return GL.pointerLock; },
      invertY(v) { if (v != null) GL.invertY = !!v; return GL.invertY; },
      release: releaseLock,
    },

    // Console handle: what the rig thinks it is doing, in one line.
    debug() {
      return {
        yaw: +api.yaw.toFixed(3), moveYaw: +baseYaw.toFixed(3),
        look: +(GL.curY / RAD).toFixed(1), pitch: +(GL.curP / RAD).toFixed(1),
        dolly: +GL.rampA.toFixed(2), decoupled: GL.decoupled,
        axis: axisX ? 'X' : 'Z', sign,
        h: +h.toFixed(2), d: +d.toFixed(2), fov: +fov.toFixed(1),
        sprint: +sprint01.toFixed(2), gas: +gas01.toFixed(2),
        chase: +chase01.toFixed(2), gap: +gap01.toFixed(2), swing: +swing01.toFixed(2),
        dbg,
      };
    },
    // The three cross-store corridors this file frames against. Round 1 wrote
    // this as crossBands(), which is agents.js's export and was never imported
    // here — so calling it threw a ReferenceError. It was only ever a readout.
    bands: () => BANDS.map((b) => ({ ...b })),
  };
  // THE MOVEMENT BASIS. A getter, not a value, and it counts its own reads:
  // that count is how update() knows whether main.js is steering by the
  // corridor (this) or by the camera (`yaw`), and therefore how much look the
  // player is allowed before the two disagree enough to matter. See the top
  // of the file. Falls back to the true yaw until the first frame is posed.
  Object.defineProperty(api, 'moveYaw', {
    enumerable: true, configurable: true,
    get() { moveReads++; return started ? baseYaw : api.yaw; },
  });
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
