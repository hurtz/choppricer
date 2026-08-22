// OWNER: builder-agents. Cop, shoppers, thieves, stamina, powerups. The chase feel.
// CONTRACT — must keep exporting exactly this:
//   createAgents(THREE, scene, world) -> {
//     cop, shoppers, update(dt, input, api), reset()
//   }
// `api` provides: api.onBolt(shopper), api.onCatch(shopper),
//                 api.onEscape(shopper), api.onHarass(shopper)
// All movement constants come from TUNING in ./config.js.
//
// Also (additive, all optional — nothing breaks if the other side is absent):
//   we CALL   api.report({stamina,staminaMax,boost,gassed,speed,nearest,chase})
//   we READ   api.mode / api.aisle / api.frozen / api.wantSuspect
//   we EXPOSE agents.bench(opts) / benchAll / benchReal — deterministic chase
//             harness, see bottom of file. bench() starts from the geometry
//             game.js actually creates; read the note there before quoting it.
//   we EXPOSE agents.escapeField / fleeBuilds — debug handles for the cop-priced
//             route field a fleeing thief steers on.
//   we EXPOSE agents.thiefCruise() / thiefTop() — a fleeing shopper's real speed.
//             TUNING.thiefRun is his opening ceiling, not his cruise; anything
//             estimating a door countdown should use thiefCruise().
//
// THE CHASE, MEASURED — and measured FROM THE SPAWN THE GAME ACTUALLY CREATES.
//
// Round 2 published "1.5% caught with no powerup" off a bench that started the
// cop 4.32 m BEHIND the thief. game.js has never once produced that geometry.
// enterFloor() -> postSpawn({kind:'aisle'}) teleports the cop to the mouth of
// the subject's own aisle, standing between him and Door 1. From there the same
// build measured 100% caught, 120 of 120, median 1.7 s from dispatch to the
// grab and 0.32 s from the bolt. The entire chase — stamina, powerups, the gap
// tuned to park two and a half metres out — was dead code in the real game,
// because the thief's route had no way round a body in a 4.0 m aisle and he ran
// into the cop every time. A bench that measures a situation the player never
// encounters is worse than no bench: it manufactures confidence.
//
// bench() now starts at postSpawn('aisle') by default. n=200 (n=150 for the
// variants), perfect-pursuit bot, crowded store:
//   no powerup ......... 68.0% caught, loses by 2.96 m (9.7 ft), closest 3.00 m
//     ...by how close the dispatch actually landed:
//        within 6 m  100%   (you walked in on him; this SHOULD be a catch)
//        6-10 m       79%
//        10-16 m      46%
//        16 m+        36%
//   grabs a powerup .... 91.5% caught, 3.4 s from dispatch, 2.4 s of chase
//   boost in hand ...... 98.7%
//   wrong aisle by 1 ... 44.7%, by 2 ... 34.7%, by 4 ... 23.3%
//   dispatched to the front end instead of his aisle .... 39.3%
//   dispatched to the BACK of his aisle (behind him) .....  8.3%
//   escapes run 15.6 s and end 3.0 m short. 64 of 200 broke out the back of
//   the aisle, along the rear cross-aisle and down another one.
// Secondary, kept only for continuity with round 2's published number:
//   cop starting 4.3 m astern ("behind") ... 0.7%   (round 2 measured 1.5%)
// Free boosts the cop never steered at: 0% (mode 'ignore', boostFrac 0.00) —
// round 2's shelf-lip reach gate survives all of the above intact.
// Re-run any time with: window.__CHOP.agents.benchReal(200)
import {
  TUNING, EXIT, aisleX, AISLE_LEN, AISLE_COUNT, AISLE_GAP, SHELF_W,
  STORE, FRONT_WALK_Z, SERVICE_DESK,
} from './config.js';
import { makeNav } from './agents/nav.js';

// ---------------------------------------------------------------------------
// Tunables. Anything already in TUNING is read from TUNING, no local copy.
// The `?? fallback` ones are values I want promoted into TUNING by the lead;
// if they appear there, they are picked up automatically with no code change.
// ---------------------------------------------------------------------------
const T = TUNING;

// ROUND 4 RE-TUNES — three names that ALREADY EXIST in TUNING at their round-3
// values. The `T.x ?? fallback` pattern below means TUNING wins, so writing a
// new number into the fallback would have changed nothing and I would have
// reported a value the game was not running. (I nearly did: the first pass of
// round 4 "raised" thiefLook to 17 and measured no change from it, because
// TUNING still said 8.6.) These three are deliberate changes to shipped values;
// they belong in TUNING and this block should be deleted the moment they are
// there. Everything else round 4 touches is either new or absent from TUNING.
const R4 = {
  thiefLook: 17.0,    // was 8.60  — he clocks a uniform down the whole aisle
  thiefTired: 0.575,  // was 0.620 — his long-chase cruise, under the cop's
  thiefAccel: 10.5,   // was 15.0  — he no longer out-accelerates the cop by 67%
  // He clipped a shoulder at a dead run; he did not fall over. The man who was
  // standing still and got hit is the one who has to reassemble himself, and
  // round 3 had that exactly backwards -- see barge().
  stumbleT: 0.15,     // was 0.45
};
const K = {
  get copGrip()       { return T.copGrip       ?? 0.78; }, // lateral accel fraction at top speed
  get gassedRecover() { return T.gassedRecover ?? 0.26; }, // stamina frac needed to un-gas
  // ROUND 4 — he was accelerating at 15.0 against the cop's copAccel of 9.0, so
  // every corner, every shopper, every stumble, the thief got back to speed 67%
  // harder than the man chasing him. The stated speed gap is 6% (5.35 vs 5.05);
  // the gap the bench actually measured over a long chase was 26%, and almost
  // all of the difference was this. A shoplifter with a jacket full of steaks
  // does not out-accelerate anybody.
  get thiefAccel()    { return R4.thiefAccel; },
  get thiefCorner()   { return T.thiefCorner   ?? 0.55; }, // speed mult on a 90 degree cut
  get thiefReact()    { return T.thiefReact    ?? 0.22; }, // seconds of "oh shit" before the bolt
  get pickupRadius()  { return T.pickupRadius  ?? 0.62; },
  get pickupReach()   { return T.pickupReach   ?? 1.25; }, // m/s toward the shelf face
  get shopperCount()  { return T.shopperCount  ?? 14; },
  get thiefCount()    { return T.thiefCount    ?? 2; },
  // A powerup is an item ON A SHELF, not a floor pickup. Sitting it on the aisle
  // centreline put it directly under a pure-pursuit chase: the bench measured the
  // "no powerup" cop boosted 45% of the chase because he ran over free cans.
  // Push it to the shelf lip so grabbing one costs you a deliberate swerve.
  get pickupLip()     { return T.pickupLip     ?? 1.58; }, // metres off centreline
  get thiefCornerFree(){return T.thiefCornerFree?? 0.985; },//cos above which a turn is free
  // The thief's own wind. He is a shoplifter with a jacket full of steaks, not a
  // sprinter — thiefRun is his first-few-seconds ceiling, not his cruise.
  get thiefWind()     { return T.thiefWind     ?? 2.60; }, // sec of flat-out running
  get thiefTired()    { return R4.thiefTired; },           // x thiefRun once blown
  get thiefPanic()    { return T.thiefPanic    ?? 0.965; },// x thiefRun with footsteps on him
  get thiefPanicGap() { return T.thiefPanicGap ?? 3.00; }, // metres at which fear starts
  get thiefPanicBand(){ return T.thiefPanicBand?? 0.90; }, // metres from fear to flat-out
  get thiefSecond()   { return T.thiefSecond   ?? 0.42; }, // wind regained per sec when clear
  // ROUND 4 — the reason no unboosted stern chase was EVER won, in one number.
  // thiefPanic 0.965 x thiefRun 5.35 = 5.16 m/s and copRun is 5.05. The panic
  // surge was documented as "always available": a thief with footsteps on him
  // ran 5.16 for as long as the footsteps lasted, so the last three metres were
  // arithmetically uncloseable without a powerup, forever. THAT is why the back
  // route measured 0 caught in 270 attempts — not the length of the detour, the
  // fact that adrenaline never ran out. Now it does: a second, finite tank that
  // only drains while he is actually being pressed. Ride his shoulder for four
  // seconds and it is gone, and a cop who kept anything in the bank runs him
  // down. This is also what makes the cop's OWN stamina a decision — sprint the
  // whole way and you arrive gassed at a man who still has his surge; sit two
  // metres off him and spend it, and the last stretch is yours.
  get thiefAdren()    { return T.thiefAdren    ?? 4.20; }, // sec of adrenaline
  get thiefAdrenBack(){ return T.thiefAdrenBack?? 0.17; }, // regained per sec when clear
  // Seconds with your shoulder on a push-bar. A door is not a teleport; this is
  // the beat that makes a chase to the doors contestable at the doors.
  get doorShove()     { return T.doorShove     ?? 0.85; }, // sec at the staff-end door
  get navHug()        { return T.navHug        ?? 0.55; }, // route cost for scraping geometry
  get harassSpeed()   { return T.harassSpeed   ?? 0.90; }, // m/s: standing still never offends
  get harassAim()     { return T.harassAim     ?? 0.45; }, // cos(cop velocity, shopper)

  // --- ROUND 3: counterplay in a corked aisle -------------------------------
  // The cop is a cost in the escape flood, not just a body to swerve round.
  // Radius stays under the 5.3 m aisle pitch so a cop in aisle 4 never makes
  // aisle 3 expensive; the weight is what a thief will pay to get past him,
  // measured against the ~30 m the back-of-store detour actually costs.
  // The weight is set against a real distance. Crossing this bubble at the shelf
  // lip costs about 0.62 x w metres of route, and the longest detour the store
  // offers — back out of the aisle, along the rear cross-aisle, down the next
  // one — is about 55 m. Below ~45 the lip is cheaper than any detour, he
  // squeezes from everywhere, and the cork is back. The curve is flat from
  // there: 55, 70 and 90 all measure within a point of each other, because what
  // is left is the thief you walked in on top of, which no route can help.
  get copThreatR()    { return T.copThreatR    ?? 3.00; }, // m
  get copThreatW()    { return T.copThreatW    ?? 110.0; }, // route-cost mult at the centre
  get copLead()       { return T.copLead       ?? 0.30; }, // s of cop velocity the flood leads by
  get fleeEvery()     { return T.fleeEvery     ?? 0.17; }, // s between escape-field rebuilds
  get fleeMove()      { return T.fleeMove      ?? 0.70; }, // m of cop movement that forces one
  get fleeNear()      { return T.fleeNear      ?? 12.0; }, // m: past this, rebuild lazily
  // How far ahead OF HIM BY ROUTE the cop has to be before he counts as an
  // obstacle rather than a pursuer. Not decoration: at 1.2 m a cop cutting the
  // inside of an aisle end briefly registers as a roadblock, the flood peels the
  // thief sideways for no reason, and a plain stern chase leaks from 1.3% caught
  // to 15%. Three metres is a body and a half plus the ground he covers deciding
  // — brief cut-ins do not qualify, being parked in the aisle mouth does.
  get threatAhead()   { return T.threatAhead   ?? 3.00; }, // m of route
  // He sees the uniform standing in the mouth of his aisle. He does not stroll
  // up to five metres to confirm it. Seeing the way out blocked IS the tell.
  //
  // ROUND 4 — this number was the sub-second collection. Round 3 set it at
  // 8.6 m, so a thief who was fourteen metres up the aisle when the cop was
  // dispatched into its mouth kept AMBLING TOWARDS HIM for five and a half
  // metres before he reacted, while the cop came the other way at 5 m/s. The
  // two of them closed the gap together and 61% of catches landed inside one
  // second of the bolt. That is not a chase, it is a handshake. An aisle is
  // 26 m long and a uniform stepping into the end of it is visible down the
  // whole of it; the look now covers the aisle, so the bolt happens on the
  // dispatch and the chase is whatever distance the dispatch actually bought
  // you. It still needs line of sight and it still needs him to be ON the
  // route, so a cop at his post across the store never trips it.
  get thiefLook()     { return R4.thiefLook; },  // m
  get thiefBlockCos() { return T.thiefBlockCos ?? 0.60; }, // cop must be this near his route line
  // The squeeze. 1.58 m of usable half-lane against a 1.15 m catch radius means
  // a shelf-hugging thief clears a centred cop by 0.43 m — thin, readable, and
  // beatable by a cop who steps to the right shoulder. That margin IS the duel.
  get jukeRange()     { return T.jukeRange     ?? 5.20; }, // m at which he commits
  // How far off the lane centreline you can drift and still have both his
  // shoulders covered. 1.58 m of half-lane minus the 1.15 m the grab reaches
  // leaves 0.43 m of daylight either side; give it a little back so holding the
  // middle is a real position and not a pixel.
  get grabSlack()     { return T.grabSlack     ?? 0.45; }, // m
  get bargeGrace()    { return T.bargeGrace    ?? 0.50; }, // s of no-grab while he is through you
  get jukeAhead()     { return T.jukeAhead     ?? 0.34; }, // cos: how "in the way" you must be
  get jukeHold()      { return T.jukeHold      ?? 0.85; }, // s the chosen shoulder is locked in
  get jukeLat()       { return T.jukeLat       ?? 1.75; }, // lateral steering authority
  get jukeLip()       { return T.jukeLip       ?? 0.97; }, // fraction of the usable half-lane
  get stumbleT()      { return R4.stumbleT; },   // s of lost pace after squeezing past
  get bargeStagger()  { return T.bargeStagger  ?? 0.90; }, // s the COP spends shaking it off
  get bargeThru()     { return T.bargeThru     ?? 0.95; }, // m he ends up past you
  get stumbleMul()    { return T.stumbleMul    ?? 0.72; },
  // How much of the cop this particular thief wants to risk. Rolled per subject
  // so two identical-looking dispatches do not always play out the same way.
  get nerveLo()       { return T.nerveLo       ?? 0.55; }, // he will chance your shoulder
  get nerveHi()       { return T.nerveHi       ?? 1.55; }, // he wants no part of you
};

// main.js maps KeyW -> input.z = -1, but its floor camera sits at cop.z - 7.6
// looking toward +Z, so +Z is "up the screen". Flip here so W runs away from
// the camera instead of into it.
const FWD_SIGN = -1;

const BODY_R = 0.42;          // agent collision radius
const CART_R = 0.34;
const HALF_LEN = AISLE_LEN / 2;
const LANE_HALF = AISLE_GAP / 2;
// How far off the lane centreline a body can actually get. AISLE_GAP 4.0 gives a
// 2.0 m half-lane; take the body radius off it and there is 1.58 m. Every
// "can he get past?" number in this file is measured against THIS, not against
// AISLE_GAP — round 2 used an avoid radius of 1.80 m, which is wider than the
// lane, so a cop standing in an aisle corked it completely and the thief had no
// move except to run into him.
const LANE_FREE = LANE_HALF - BODY_R;   // 1.58 m
const AISLE_PITCH = AISLE_GAP + SHELF_W;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Deterministic RNG so bench() is repeatable.
let _seed = 0x9e3779b9;
function setSeed(s) { _seed = (s >>> 0) || 1; }
function rnd() {
  _seed |= 0; _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + rnd() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

// ---------------------------------------------------------------------------
// NAVIGATION — see ./agents/nav.js. The route comes off the real collider set,
// not off the floor plan, because the store puts furniture in the lanes.
// ---------------------------------------------------------------------------
const AISLE_PITCH_ = AISLE_PITCH;
function aisleOf(x) {
  return clamp(Math.round(x / AISLE_PITCH_ + (AISLE_COUNT - 1) / 2), 0, AISLE_COUNT - 1);
}
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// ---------------------------------------------------------------------------
// COLLISION — push a circle out of the store's Box3 colliders. Uniform-grid
// broadphase so a shelf-packed store with hundreds of boxes stays cheap.
// ---------------------------------------------------------------------------
function makeSolids(world) {
  const src = (world && world.colliders) || [];
  const boxes = [];
  for (const b of src) {
    if (!b || !b.min || !b.max) continue;
    if (b.min.y > 1.55) continue;             // hanging signs, lights — walk under
    if (b.max.y < 0.16) continue;             // floor decals
    boxes.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z });
  }
  const CELL = 3.0;
  const grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
  boxes.forEach((b, idx) => {
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = key(cx, cz);
      let a = grid.get(k); if (!a) grid.set(k, a = []);
      a.push(idx);
    }
  });
  return {
    count: src.length, boxes,
    resolve(p, r) {
      const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      for (let ax = cx - 1; ax <= cx + 1; ax++) for (let az = cz - 1; az <= cz + 1; az++) {
        const a = grid.get(key(ax, az)); if (!a) continue;
        for (const idx of a) {
          const b = boxes[idx];
          const nx = clamp(p.x, b.x0, b.x1), nz = clamp(p.z, b.z0, b.z1);
          let dx = p.x - nx, dz = p.z - nz;
          const d = Math.hypot(dx, dz);
          if (d > r) continue;
          if (d < 1e-5) {           // dead centre: eject along the shallow axis
            const px = Math.min(p.x - b.x0, b.x1 - p.x);
            const pz = Math.min(p.z - b.z0, b.z1 - p.z);
            if (px < pz) p.x += (p.x - (b.x0 + b.x1) / 2 > 0 ? 1 : -1) * (px + r);
            else p.z += (p.z - (b.z0 + b.z1) / 2 > 0 ? 1 : -1) * (pz + r);
            continue;
          }
          const push = (r - d) / d;
          p.x += dx * push; p.z += dz * push;
        }
      }
      p.x = clamp(p.x, STORE.minX + 0.6, STORE.maxX - 0.6);
      p.z = clamp(p.z, STORE.minZ + 0.35, STORE.maxZ - 0.6);
    },
  };
}

// ---------------------------------------------------------------------------
// MESHES
// ---------------------------------------------------------------------------
const SKIN = [0xf0c8a0, 0xe0ab84, 0xc68f68, 0x8d5a3b, 0x62402c, 0xf7d7b8];
const HAIR = [0x2b2118, 0x120e0b, 0x6b4a2a, 0x9c8b6e, 0xa8a8a8, 0x4a3320, 0x7d2f16];
const CLOTH = [
  0x9aa7b4, 0x6d7f8c, 0xb8574a, 0x4a6b52, 0xd6c07a, 0x8a6f92, 0x3f4a5c,
  0xc98a4b, 0x7d8f6b, 0xa8b6c4, 0x5c4a3f, 0xbfa89b, 0x2f4858, 0xd9b8a0,
];
const PANTS = [0x2f3a4a, 0x3d3d42, 0x5a4738, 0x1f2733, 0x6b6b70, 0x4a3f52];

function buildGeo(THREE) {
  return {
    torso: new THREE.CapsuleGeometry(0.19, 0.42, 3, 7),
    head: new THREE.SphereGeometry(0.135, 10, 8),
    hair: new THREE.SphereGeometry(0.142, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62),
    limb: new THREE.BoxGeometry(0.135, 0.56, 0.16),
    arm: new THREE.BoxGeometry(0.11, 0.50, 0.13),
    belly: new THREE.SphereGeometry(0.25, 12, 9),
    cap: new THREE.CylinderGeometry(0.145, 0.155, 0.09, 12),
    brim: new THREE.BoxGeometry(0.30, 0.025, 0.16),
    belt: new THREE.TorusGeometry(0.235, 0.035, 5, 14),
    basket: new THREE.BoxGeometry(0.54, 0.30, 0.72),
    bar: new THREE.BoxGeometry(0.56, 0.035, 0.035),
    post: new THREE.BoxGeometry(0.035, 0.44, 0.035),
    wheel: new THREE.CylinderGeometry(0.045, 0.045, 0.03, 6),
    goods: new THREE.BoxGeometry(0.15, 0.18, 0.11),
    can: new THREE.CylinderGeometry(0.062, 0.062, 0.19, 10),
    dbox: new THREE.BoxGeometry(0.34, 0.11, 0.26),
    ring: new THREE.RingGeometry(0.42, 0.60, 20),
  };
}

function makePerson(THREE, G, o) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: o.shirt, roughness: 0.92 });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 1.0 });

  const hips = new THREE.Group(); hips.position.y = 0.62; g.add(hips);

  const torso = new THREE.Mesh(G.torso, shirt);
  torso.position.y = 0.31; torso.scale.set(o.girth, 1, o.girth * 0.84);
  torso.castShadow = true; hips.add(torso);

  let belly = null;
  if (o.girth > 1.25) {
    belly = new THREE.Mesh(G.belly, shirt);
    belly.position.set(0, 0.20, 0.10);
    belly.scale.set(o.girth * 0.82, 0.78, o.girth * 0.62);
    hips.add(belly);
  }

  const neck = new THREE.Group(); neck.position.y = 0.60; hips.add(neck);
  const head = new THREE.Mesh(G.head, skin); neck.add(head);
  const hairM = new THREE.Mesh(G.hair, hair); hairM.position.y = 0.012; neck.add(hairM);

  const mkLimb = (geo, mat, x, y) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat); m.position.y = -geo.parameters.height / 2;
    piv.add(m); hips.add(piv); return piv;
  };
  const legL = mkLimb(G.limb, pants, -0.11 * o.girth, 0.02);
  const legR = mkLimb(G.limb, pants, 0.11 * o.girth, 0.02);
  const armL = mkLimb(G.arm, shirt, -0.20 * o.girth - 0.03, 0.53);
  const armR = mkLimb(G.arm, shirt, 0.20 * o.girth + 0.03, 0.53);

  g.scale.setScalar(o.height);
  return { root: g, hips, torso, belly, neck, head, legL, legR, armL, armR, shirt, pants };
}

function makeCart(THREE, G) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.45, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x39393d, roughness: 0.85 });
  const b = new THREE.Mesh(G.basket, steel);
  b.position.set(0, 0.62, 0.05); b.rotation.x = -0.10; b.castShadow = true; g.add(b);
  const bar = new THREE.Mesh(G.bar, dark); bar.position.set(0, 0.86, -0.30); g.add(bar);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(G.post, steel); p.position.set(s * 0.24, 0.24, 0.30); g.add(p);
    const q = new THREE.Mesh(G.post, steel); q.position.set(s * 0.24, 0.24, -0.26); g.add(q);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(G.wheel, dark);
    w.position.set(sx * 0.22, 0.045, sz * 0.28); w.rotation.z = Math.PI / 2; g.add(w);
  }
  return g;
}

function angerTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#d8342a'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 46px sans-serif'; x.textAlign = 'center';
  x.fillText('!', 32, 49);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

// ===========================================================================
export function createAgents(THREE, scene, world) {
  world = world || {};
  const G = buildGeo(THREE);
  let solids = makeSolids(world);
  let solidCount = solids.count;
  // One grid, one flood-fill out from the doors. Every thief in the store
  // shares it, and it only gets rebuilt when the store itself changes.
  const buildNav = () => makeNav(solids.boxes, STORE, {
    cell: 0.42, pad: BODY_R + 0.10, hug: K.navHug,
    walkMinX: STORE.minX + 0.6, walkMaxX: STORE.maxX - 0.6,
    walkMinZ: STORE.minZ + 0.35, walkMaxZ: STORE.maxZ - 0.6,
  });
  let nav = buildNav();

  // ---- WAYS OUT ------------------------------------------------------------
  // ROUND 4. There used to be exactly one door, and that one fact was quietly
  // the biggest problem in the game. A bot that ignores the dispatch entirely,
  // walks to Door 1 and stands on it scores 80.7% / 67.3% at wrong-aisle +/-1
  // and +/-2, against 60.0% / 47.3% for a bot that actually goes and chases the
  // man. The aisle number — the single thing the whole desk phase exists to make
  // the player read — was worth about four points, and the dominant strategy was
  // to throw the dispatch away and guard the only hole in the building.
  //
  // You cannot fix that with movement constants. One door means the thief's
  // destination is public knowledge, and public knowledge beats a scouting
  // report every time. So: TWO doors, both on the front wall, thirty-five metres
  // apart — Door 1 in the front-left corner where the glazing already is, and
  // Door 2 down at the service-desk end of the checkout run. Now:
  //   - camping is a coin flip you mostly lose, because the escape flood has the
  //     cop priced into it and a cop standing on one door simply makes the other
  //     one cheaper. Guarding a door is now the thing that sends him to the
  //     other door;
  //   - being NEAR HIM is the only position that covers both, and the aisle
  //     number is the only thing that puts you near him. The dispatch is worth
  //     something again, which is the entire point of the desk;
  //   - the front cross-aisle becomes the real ground to hold, not one corner.
  // Both doors stay on the front wall on purpose: a back door would make half
  // the store's dispatches a straight footrace away from the checkouts and would
  // have made game.js's door-alarm countdown a lie.
  //
  // `shove` is the second half of it — see updateShopper's 'shove' state. You do
  // not teleport through a door at a dead run; you hit it, and for a beat you are
  // a stationary man with his shoulder on a push-bar. That beat is what makes a
  // chase to the doors contestable instead of decided ten metres out.
  const EXIT_SPEC = [
    { id: 'door1', label: 'DOOR 1', x: EXIT.x, z: EXIT.z, shoveMul: 0.35, sign: 0x8ef07a },
    { id: 'door2', label: 'DOOR 2', x: clamp(SERVICE_DESK.x - 5.4, STORE.minX + 3, STORE.maxX - 3),
      z: STORE.minZ + 0.6, shoveMul: 1.0, sign: 0x8ef07a },
  ];
  // Snap each door onto ground a body can actually stand on, and drop any the
  // store has walled off this rebuild — src/store.js is rebuilt in parallel and
  // the collider set moves under us. If only Door 1 survives, everything below
  // degrades to exactly the old single-exit behaviour.
  let EXITS = [];
  let exitFs = [];      // one static flood per door
  let exitF = null;     // static flood from ALL doors: metres of route to the nearest way out
  // Attribution switch: run the store with only the first `doorLimit` doors, so
  // round 4's changes can be measured one at a time instead of asserted as a
  // bundle. 1 = the old single-exit store.
  let doorLimit = 99;
  function buildExits() {
    const probe = nav.field(EXIT.x, EXIT.z);
    EXITS = [];
    for (const sp of EXIT_SPEC.slice(0, doorLimit)) {
      let bx = sp.x, bz = sp.z, ok = false;
      for (let r = 0; r <= 8 && !ok; r++) {
        for (let a = 0; a < (r ? 12 : 1) && !ok; a++) {
          const th = (a / 12) * Math.PI * 2;
          const x = clamp(sp.x + Math.cos(th) * r * 0.55, STORE.minX + 1, STORE.maxX - 1);
          const z = clamp(sp.z + Math.abs(Math.sin(th)) * r * 0.55, STORE.minZ + 0.5, STORE.maxZ - 1);
          if (nav.free(x, z) && nav.reachable(probe, x, z)) { bx = x; bz = z; ok = true; }
        }
      }
      if (!ok && EXITS.length) continue;                 // walled off this rebuild
      EXITS.push({ ...sp, x: bx, z: bz, shove: K.doorShove * sp.shoveMul });
    }
    exitFs = EXITS.map((e) => nav.field(e.x, e.z));
    exitF = nav.field(EXITS.map((e) => ({ x: e.x, z: e.z, cost: 0 })));
    placeExitSigns();
  }
  const toExit = (x, z) => nav.at(exitF, x, z);          // metres of route left
  const canReachExit = (x, z) => nav.reachable(exitF, x, z);
  // Which door is this man actually heading for. game.js wants it for the alarm
  // countdown, which used to measure everyone against Door 1 whether or not that
  // was the door they were walking at.
  function exitOf(x, z) {
    let best = 0, bd = Infinity;
    for (let e = 0; e < exitFs.length; e++) {
      const d = nav.at(exitFs[e], x, z);
      if (d < bd) { bd = d; best = e; }
    }
    return { i: best, exit: EXITS[best], dist: bd };
  }

  // The door has to be legible or the second one is a trap rather than a choice.
  // src/store.js draws the glazing and the entry doors at Door 1; it has nothing
  // at Door 2 yet, so this puts a lit EXIT box and a pair of push-bar leaves
  // there. Cheap, additive, mine — and flagged to the store builder to replace
  // with a real storefront.
  const exitProps = [];
  function placeExitSigns() {
    for (const p of exitProps) scene.remove(p);
    exitProps.length = 0;
    for (const e of EXITS) {
      const g = new THREE.Group();
      const face = e.z < 0 ? 1 : -1;                       // into the room
      const lit = new THREE.MeshBasicMaterial({ color: e.sign });
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.30, 0.09), lit);
      box.position.set(0, 2.58, 0.10 * face); g.add(box);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.06, 0.22),
        new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.8 }));
      hood.position.set(0, 2.76, 0.06 * face); g.add(hood);
      // two leaves with a push bar, held ajar so the gap reads as a way through
      const leafM = new THREE.MeshStandardMaterial({ color: 0xd6d9dc, roughness: 0.45, metalness: 0.2 });
      const barM = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.7 });
      for (const s of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.94, 2.12, 0.07), leafM);
        leaf.position.set(s * 0.52, 1.06, 0.04 * face);
        leaf.rotation.y = s * 0.20 * face; g.add(leaf);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.06), barM);
        bar.position.set(s * 0.52, 1.02, 0.11 * face); g.add(bar);
      }
      const glow = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({
        color: e.sign, transparent: true, opacity: 0.20, side: THREE.DoubleSide, depthWrite: false,
      }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.02; glow.scale.setScalar(2.4);
      g.add(glow);
      g.position.set(e.x, 0, e.z);
      scene.add(g); exitProps.push(g);
      e.prop = g;
    }
  }
  buildExits();

  // ---- the escape field ----------------------------------------------------
  // Same flood, from the same doors, with the cop priced in. A thief who is
  // running reads THIS one, so "out the back, along the rear cross-aisle and
  // down another aisle" is a route the search can actually return — it was
  // never available before, because the cop only ever existed as a filter on
  // the aim point of a descent that had already been computed without him.
  //
  // One field, shared by every runner in the store (they are all avoiding the
  // same man), rebuilt on a timer or when he moves, and only while somebody is
  // actually running. A flood costs ~2 ms on this 114x91 grid, so it is metered
  // hard: ~4.5 rebuilds a second during a chase, none at all otherwise. Measured
  // in the live loop, agents.update() is 0.20 ms mean / 2.0 ms p95 and a whole
  // step() including the render submit is 0.6 ms median, 4.7 ms worst — the
  // worst frame in a chase is still under a third of the 16.7 ms budget.
  let fleeF = null, fleeBuf = null, fleeT = 0, fleeCx = 1e9, fleeCz = 1e9;
  let fleeBuilds = 0;
  const escapeField = () => fleeF || exitF;
  function updateFlee(dt) {
    let running = null, rd = Infinity;
    for (const s of shoppers) {
      if (s.escaped || s.caught) continue;
      if (s.state !== 'bolt' && s.state !== 'react') continue;
      const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
      if (d < rd) { rd = d; running = s; }
    }
    if (!running) { fleeF = null; fleeT = 0; fleeCx = fleeCz = 1e9; return; }
    // Nerve. Without it the decision is a pure function of where he was standing
    // when you walked in, so a player who has done it twenty times knows from the
    // aisle marker whether this one turns and runs or comes through him. One
    // thief will take his chances past your shoulder from eight metres out;
    // another is already heading for the back wall from four. Same shared field
    // — there is only ever one man being chased — scaled by whose it is.
    const w = K.copThreatW * (running.nerve || 1);
    const u = cop.userData;
    const lx = cop.position.x + u.vel.x * K.copLead;
    const lz = cop.position.z + u.vel.z * K.copLead;
    // Where the cop is standing only changes the route while he is near it. Once
    // he is twelve metres astern and the man is committed to the back of the
    // store, the answer stops moving, so stop asking as often — that is most of
    // a long chase, and it is where the rebuild would otherwise be pure waste.
    const near = rd < K.fleeNear;
    const every = near ? K.fleeEvery : K.fleeEvery * 3.5;
    const move = near ? K.fleeMove : K.fleeMove * 3.0;
    fleeT -= dt;
    if (fleeF && fleeT > 0 && dist2d(lx, lz, fleeCx, fleeCz) < move) return;
    fleeT = every; fleeCx = lx; fleeCz = lz; fleeBuilds++;
    if (!fleeBuf || fleeBuf.length !== nav.count) fleeBuf = new Float32Array(nav.count);
    // Seeded from EVERY door at once, so "which way out" and "how do I get round
    // that man" are the same question and get one answer. A cop parked on Door 1
    // raises the cost of every cell near Door 1; Door 2 is then simply cheaper,
    // and the descent walks him there without anybody writing a rule about it.
    fleeF = nav.field(EXITS.map((e) => ({ x: e.x, z: e.z, cost: 0 })), {
      out: fleeBuf,
      avoid: {
        x: lx, z: lz, r: K.copThreatR, w,
        // Only where he is actually in the way — see threatMask().
        ref: exitF,
        refMax: toExit(running.position.x, running.position.z) - K.threatAhead,
      },
    });
  }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- cop -----------------------------------------------------------------
  const copRig = makePerson(THREE, G, {
    shirt: 0x2c3a56, pants: 0x22252c, skin: 0xe2b48c, hair: 0x50412e,
    girth: 1.62, height: 1.06,
  });
  {
    const duty = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.7 });
    const belt = new THREE.Mesh(G.belt, duty);
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.06;
    belt.scale.set(1.42, 1.42, 1.0); copRig.hips.add(belt);
    const cap = new THREE.Mesh(G.cap, new THREE.MeshStandardMaterial({ color: 0x1e2a44, roughness: 0.8 }));
    cap.position.y = 0.10; copRig.neck.add(cap);
    const brim = new THREE.Mesh(G.brim, new THREE.MeshStandardMaterial({ color: 0x16203a, roughness: 0.8 }));
    brim.position.set(0, 0.075, 0.145); copRig.neck.add(brim);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.045, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9c169, roughness: 0.3, metalness: 0.8 }));
    badge.position.set(-0.13, 0.42, 0.20 * 1.62); copRig.hips.add(badge);
  }
  const cop = copRig.root;
  cop.userData = {
    rig: copRig, vel: V(0, 0, 0), speed: 0, phase: 0, heading: 0, prevHeading: 0,
    stamina: T.staminaMax, gassed: false, boost: 0, breath: 0, lean: 0, skid: 0, turn: 0,
    stagger: 0,
  };
  scene.add(cop);
  // steer() writes speed/skid and moves .position; the cop's live on userData.
  const copBody = {
    position: cop.position, vel: cop.userData.vel,
    get speed() { return cop.userData.speed; }, set speed(v) { cop.userData.speed = v; },
    get skid() { return cop.userData.skid; }, set skid(v) { cop.userData.skid = v; },
  };

  // ---- shoppers ------------------------------------------------------------
  const angerTex = angerTexture(THREE);
  const shoppers = [];
  let nextId = 1;

  function makeShopper() {
    const rig = makePerson(THREE, G, {
      shirt: pick(CLOTH), pants: pick(PANTS), skin: pick(SKIN), hair: pick(HAIR),
      girth: rr(0.86, 1.30), height: rr(0.94, 1.10),
    });
    const cart = makeCart(THREE, G);
    cart.visible = false;
    const held = new THREE.Mesh(G.goods, new THREE.MeshStandardMaterial({ color: pick(CLOTH), roughness: 0.9 }));
    held.visible = false; rig.root.add(held);
    const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: angerTex, transparent: true, depthTest: false }));
    bang.scale.setScalar(0.42); bang.position.y = 2.05; bang.visible = false; rig.root.add(bang);
    scene.add(rig.root); scene.add(cart);
    const s = {
      id: nextId++, rig, mesh: rig.root, cart, held, bang,
      position: rig.root.position, vel: V(0, 0, 0), speed: 0, phase: rnd() * 7,
      heading: 0, hasCart: true, guilty: false, aisle: 0,
      state: 'walk', timer: 0, path: [], repathIn: 0, wind: 1, aim: null, aimT: 0,
      bolted: false, escaped: false, caught: false, angry: 0, harassArmed: true,
      concealT: 0, look: 0, lean: 0, target: null, dropCartAt: null,
      duck: 0, duckT: 0, stumble: 0, bargeT: 0, bargeN: 0, nerve: 1,
      adren: 1, shoveT: 0, exitI: 0,
    };
    shoppers.push(s);
    return s;
  }

  // ---- powerups ------------------------------------------------------------
  const powerups = [];
  function buildPowerups() {
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;
    let spots = (world.powerupSpots || []).filter((s) => s && isFinite(s.x) && isFinite(s.z));
    if (!spots.length) {                     // store mid-rebuild: synthesize
      spots = [];
      for (let i = 0; i < AISLE_COUNT; i++) {
        spots.push({ x: aisleX(i), z: (i % 2 ? 1 : -1) * (3 + i * 1.4), kind: i % 2 ? 'donuts' : 'energy' });
      }
    }
    for (const sp of spots) {
      const kind = sp.kind === 'donuts' ? 'donuts' : 'energy';
      const g = new THREE.Group();
      const col = kind === 'energy' ? 0x63e05a : 0xf07fae;
      const item = new THREE.Mesh(kind === 'energy' ? G.can : G.dbox,
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, emissive: col, emissiveIntensity: 0.55 }));
      item.position.y = 1.06; g.add(item);
      const ring = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
      }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
      // Keep it inside the walkable lane even if the store parked it in a shelf,
      // and if the store handed us a bare centreline point, shove it out to the
      // shelf lip — a can on the centreline is a free boost for anyone running
      // the aisle, which is exactly what a chase does.
      // Snap it to the shelf lip, keeping the side and the depth the store
      // chose. A can sitting on the lane centreline is a free boost for anyone
      // running the aisle, and a chase runs the aisle: the bench measured the
      // supposedly-unpowered cop boosted 45% of the time. It is on a SHELF.
      const inAisle = Math.abs(sp.z) < HALF_LEN - 0.5;
      const ai = aisleOf(sp.x);
      const off = sp.x - aisleX(ai);
      const side = off < 0 ? -1 : off > 0 ? 1 : (powerups.length % 2 ? 1 : -1);
      const x = inAisle ? aisleX(ai) + side * K.pickupLip
                        : clamp(sp.x, STORE.minX + 1, STORE.maxX - 1);
      const z = inAisle ? clamp(sp.z, -HALF_LEN + 1, HALF_LEN - 1)
                        : clamp(sp.z, STORE.minZ + 1, STORE.maxZ - 1);
      // Unit vector from the lane centre out to the shelf face: the direction
      // the cop has to actually move in to take it off the shelf.
      const nx = inAisle ? side : 0;
      const nz = inAisle ? 0 : (z > 0 ? 1 : -1);
      g.position.set(x, 0, z); scene.add(g);
      powerups.push({ mesh: g, item, ring, x, z, nx, nz, kind, live: true, respawn: 0 });
    }
  }
  buildPowerups();

  // ---- spawn / reset -------------------------------------------------------
  // Never drop anyone in a pocket the store has sealed off — a thief who cannot
  // reach the doors is not a chase, he is a bug that reads as one.
  function placeInAisle(s) {
    let i = 0, x = 0, z = 0;
    for (let k = 0; k < 24; k++) {
      i = ri(0, AISLE_COUNT - 1);
      x = aisleX(i) + rr(-1.1, 1.1);
      z = rr(-HALF_LEN + 1.5, HALF_LEN - 1.5);
      if (nav.free(x, z) && canReachExit(x, z)) break;
    }
    s.position.set(x, 0, z);
    s.aisle = i;
  }
  function resetShopper(s, guilty) {
    placeInAisle(s);
    s.vel.set(0, 0, 0); s.speed = 0; s.state = 'walk'; s.timer = rr(0.5, 4);
    s.path = []; s.repathIn = 0; s.guilty = !!guilty; s.bolted = false;
    s.escaped = false; s.caught = false; s.angry = 0; s.harassArmed = true;
    s.concealT = guilty ? rr(2.5, 7.0) : 0; s.look = 0; s.lean = 0; s.wind = 1;
    s.aim = null; s.aimT = 0; s.duck = 0; s.duckT = 0;
    s.adren = 1; s.shoveT = 0; s.exitI = 0;
    s.stumble = 0; s.bargeT = 0; s.bargeN = 0;
    s.nerve = rr(K.nerveLo, K.nerveHi);
    s.hasCart = true; s.cart.visible = true; s.mesh.visible = true;
    s.held.visible = false; s.bang.visible = false; s.target = null;
    s.stole = false;
  }

  function reset() {
    while (shoppers.length < K.shopperCount) makeShopper();
    const guiltyIdx = new Set();
    while (guiltyIdx.size < Math.min(K.thiefCount, shoppers.length)) guiltyIdx.add(ri(0, shoppers.length - 1));
    shoppers.forEach((s, i) => resetShopper(s, guiltyIdx.has(i)));
    cop.position.set(0, 0, FRONT_WALK_Z + 1.5);
    const cu = cop.userData;
    cu.vel.set(0, 0, 0); cu.speed = 0; cu.stamina = T.staminaMax;
    cu.gassed = false; cu.boost = 0; cu.heading = 0; cu.skid = 0; cu.stagger = 0;
    for (const p of powerups) { p.live = true; p.respawn = 0; p.mesh.visible = true; }
  }
  setSeed(20240822);
  reset();

  // ---- shared steering -----------------------------------------------------
  // Split accel into along-velocity and lateral. Lateral authority drops with
  // speed, so a heavy body swings wide instead of pivoting.
  function steer(ent, dirx, dirz, target, accel, gripAtSpeed, topSpeed, dt) {
    const v = ent.vel;
    const tvx = dirx * target, tvz = dirz * target;
    let dvx = tvx - v.x, dvz = tvz - v.z;
    const sp = Math.hypot(v.x, v.z);
    let ax, az;
    if (sp > 0.4) {
      const fx = v.x / sp, fz = v.z / sp;
      const along = dvx * fx + dvz * fz;
      let lx = dvx - along * fx, lz = dvz - along * fz;
      const lm = Math.hypot(lx, lz);
      const spN = clamp(sp / topSpeed, 0, 1.2);
      const latMax = accel * (1 - (1 - gripAtSpeed) * spN);
      const alMax = accel;
      const aAlong = clamp(along, -alMax * dt, alMax * dt);
      const aLat = lm > 1e-6 ? Math.min(lm, latMax * dt) : 0;
      ax = fx * aAlong + (lm > 1e-6 ? (lx / lm) * aLat : 0);
      az = fz * aAlong + (lm > 1e-6 ? (lz / lm) * aLat : 0);
      ent.skid = lm > 1e-6 ? clamp(aLat / (latMax * dt + 1e-9), 0, 1) * clamp(sp / topSpeed, 0, 1) : 0;
    } else {
      const dm = Math.hypot(dvx, dvz);
      const step = Math.min(dm, accel * dt);
      ax = dm > 1e-6 ? (dvx / dm) * step : 0;
      az = dm > 1e-6 ? (dvz / dm) * step : 0;
      ent.skid = 0;
    }
    v.x += ax; v.z += az;
    ent.speed = Math.hypot(v.x, v.z);
    ent.position.x += v.x * dt; ent.position.z += v.z * dt;
  }

  function followPath(ent, dt) {
    while (ent.path.length) {
      const w = ent.path[0];
      const d = dist2d(ent.position.x, ent.position.z, w.x, w.z);
      const nxt = ent.path[1];
      if (d < 0.75 || (nxt && nav.clearSeg(ent.position.x, ent.position.z, nxt.x, nxt.z) && ent.path.length > 1)) {
        ent.path.shift(); continue;
      }
      break;
    }
    if (!ent.path.length) return null;
    const w = ent.path[0];
    let dx = w.x - ent.position.x, dz = w.z - ent.position.z;
    const m = Math.hypot(dx, dz) || 1;
    return { x: dx / m, z: dz / m, dist: m };
  }

  // Steer away from other bodies so the aisles feel occupied, not ghostly.
  //
  // `tangent` is for a runner. Plain radial repulsion from a cop who is directly
  // ahead points STRAIGHT BACKWARDS, so a thief squeezing past would brake to a
  // halt a metre in front of him and be collected — the avoidance was doing the
  // cop's job for him. For a runner the backward half of the repulsion is thrown
  // away and only the sideways half survives: he slides round you, he does not
  // back off you.
  function avoid(ent, dirx, dirz, radius, strength, tangent) {
    let ax = 0, az = 0;
    for (const o of shoppers) {
      if (o === ent || o.escaped || !o.mesh.visible) continue;
      const dx = ent.position.x - o.position.x, dz = ent.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 1e-4) continue;
      const w = (1 - d / radius) * strength;
      ax += (dx / d) * w; az += (dz / d) * w;
    }
    const dx = ent.position.x - cop.position.x, dz = ent.position.z - cop.position.z;
    const d = Math.hypot(dx, dz);
    if (d < radius + 0.3 && d > 1e-4) {
      const w = (1 - d / (radius + 0.3)) * strength * 1.3;
      let rx = dx / d, rz = dz / d;
      if (tangent) {
        const along = rx * dirx + rz * dirz;
        if (along < 0) { rx -= along * dirx; rz -= along * dirz; }
        const m2 = Math.hypot(rx, rz);
        if (m2 < 1e-4) { rx = 0; rz = 0; } else { rx /= m2; rz /= m2; }
      }
      ax += rx * w; az += rz * w;
    }
    const nx = dirx + ax, nz = dirz + az;
    const m = Math.hypot(nx, nz) || 1;
    return { x: nx / m, z: nz / m };
  }

  // ---- the squeeze ---------------------------------------------------------
  // A thief with a uniform in his way does not stop and he does not turn round:
  // the doors are the only thing in his world. He picks a shoulder and goes.
  //
  // The shoulder is chosen ONCE and held, so it is a read the player can make
  // from the chair instead of per-frame noise, and so guessing right is worth
  // something. He takes the side with more daylight; dead-centre he goes against
  // whichever way the cop is already drifting — which is exactly the tell a
  // player can bait by leaning one way and stepping the other.
  //
  // The arithmetic that makes it a duel rather than a coin flip: 1.58 m of
  // usable half-lane against a 1.15 m catch radius. A shelf-hugging thief clears
  // a dead-centre cop by 0.43 m. Move 0.43 m onto his shoulder and you have him.
  function squeezePast(s, dir, copD, dt) {
    s.duckT = Math.max(0, (s.duckT || 0) - dt);
    const cdx = cop.position.x - s.position.x, cdz = cop.position.z - s.position.z;
    // "In the way" has to be measured against where he is actually GOING, which
    // near a corner is not the same as the route's aim point. Take the stricter
    // of the two. Round 3 first shipped this on the route direction alone and
    // the bench caught it immediately: a cop chasing from behind kept clipping
    // the cone as the thief rounded the end of an aisle, so the thief committed
    // to a shoulder against a man who was nowhere near his path, ate a stumble
    // for it, and did that three or four times a chase. The stern-chase catch
    // rate went from 1.5% to 81% on that alone.
    let ax = dir.x, az = dir.z;
    if (s.speed > 1.2) { ax = s.vel.x / s.speed; az = s.vel.z / s.speed; }
    const ahead = copD > 1e-3
      ? Math.min((cdx * dir.x + cdz * dir.z) / copD, (cdx * ax + cdz * az) / copD) : 0;

    // He is through, or the man was never really in his way. Note that clearing
    // the commit costs NOTHING: the stumble is the price of going THROUGH
    // somebody (see barge()), not the price of having considered it.
    if (s.duck && (ahead < 0.05 || copD > K.jukeRange + 1.4)) { s.duck = 0; s.duckT = 0; }

    // Only a body actually in the way provokes one, and only inside an aisle,
    // in the same lane — out on the cross-aisles there is room to go round and
    // no duel to have.
    if (copD > K.jukeRange || ahead < K.jukeAhead) return dir;
    if (Math.abs(s.position.z) > HALF_LEN - 0.25) return dir;
    if (Math.abs(cop.position.z) > HALF_LEN + 0.4) return dir;

    const laneC = aisleX(aisleOf(s.position.x));
    if (Math.abs(cop.position.x - laneC) > LANE_HALF) return dir;
    if (!s.duck || s.duckT <= 0) {
      const copOff = cop.position.x - laneC;
      let side = copOff > 0.12 ? -1 : copOff < -0.12 ? 1 : 0;
      if (!side) {
        const drift = cop.userData.vel.x;
        side = Math.abs(drift) > 0.45 ? (drift > 0 ? -1 : 1)
             : (s.position.x - laneC >= 0 ? 1 : -1);
      }
      s.duck = side; s.duckT = K.jukeHold;
    }
    const want = laneC + s.duck * LANE_FREE * K.jukeLip;
    const lat = clamp((want - s.position.x) / 0.70, -1, 1);
    const w = clamp((K.jukeRange - copD) / (K.jukeRange - 0.80), 0, 1) * K.jukeLat;
    const nx = dir.x + lat * w, nz = dir.z;
    const m = Math.hypot(nx, nz) || 1;
    return { x: nx / m, z: nz / m, dist: dir.dist };
  }

  // ---- cop update ----------------------------------------------------------
  function updateCop(dt, input, frozen) {
    const u = cop.userData;
    let ix = frozen ? 0 : (input.x || 0);
    let iz = frozen ? 0 : FWD_SIGN * (input.z || 0);
    const mag = Math.hypot(ix, iz);
    const moving = mag > 0.02;
    if (moving) { ix /= mag; iz /= mag; }

    const wantSprint = !frozen && !!input.sprint && moving;
    const boosted = u.boost > 0;
    const canSprint = wantSprint && (boosted || (u.stamina > 0 && !u.gassed));

    if (boosted) {
      u.boost = Math.max(0, u.boost - dt);
      u.stamina = T.staminaMax;                 // energy drink: you are not tired
      u.gassed = false;
    } else if (canSprint) {
      u.stamina -= T.staminaDrain * dt;
    } else {
      u.stamina += T.staminaRegen * dt * (moving ? 1 : 1.6);
    }
    u.stamina = clamp(u.stamina, 0, T.staminaMax);
    if (u.stamina <= 0.0001) u.gassed = true;
    if (u.gassed && u.stamina >= K.gassedRecover * T.staminaMax) u.gassed = false;

    // Gassed = a wheezing labored jog, not a dead stop: run speed x penalty.
    let target = canSprint ? T.copRun : T.copWalk;
    if (u.gassed) target = (wantSprint ? T.copRun : T.copWalk) * T.gassedPenalty;
    if (boosted) target *= T.boostMul;
    // Shaking off a shoulder — see barge(). Not a freeze: a wobble.
    if (u.stagger > 0) { u.stagger = Math.max(0, u.stagger - dt); target *= 0.42; }
    if (!moving) target = 0;

    const top = T.copRun * T.boostMul;
    steer(copBody, ix, iz, target, T.copAccel, K.copGrip, top, dt);
    solids.resolve(cop.position, BODY_R);

    // shove shoppers out of the way rather than clipping through them
    for (const s of shoppers) {
      if (s.escaped || !s.mesh.visible) continue;
      // Mid-barge the two of them are momentarily occupying the same ground.
      // Holding them 0.78 m apart through it is what pinned a thief who had
      // just gone through a man to the front of the man he went through.
      if (s.bargeT > 0) continue;
      const dx = s.position.x - cop.position.x, dz = s.position.z - cop.position.z;
      const d = Math.hypot(dx, dz), min = BODY_R + 0.36;
      if (d < min && d > 1e-4) {
        const push = (min - d) / d;
        s.position.x += dx * push * 0.8; s.position.z += dz * push * 0.8;
        cop.position.x -= dx * push * 0.2; cop.position.z -= dz * push * 0.2;
        u.vel.multiplyScalar(0.985);
      }
    }
    animateCop(dt, moving, boosted);
  }

  function animateCop(dt, moving, boosted) {
    const u = cop.userData, r = u.rig;
    if (u.speed > 0.12) u.heading = Math.atan2(u.vel.x, u.vel.z);
    let dh = u.heading - u.prevHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    u.prevHeading = u.heading;
    u.turn = lerp(u.turn, dt > 0 ? clamp(dh / dt, -4, 4) : 0, 1 - Math.exp(-12 * (dt || 0.016)));
    cop.rotation.y = u.heading;
    const stride = 0.95;
    u.phase += (u.speed / stride) * dt * Math.PI * 2;
    const amp = clamp(u.speed * 0.17, 0.04, 0.62);
    const sw = Math.sin(u.phase);
    r.legL.rotation.x = sw * amp; r.legR.rotation.x = -sw * amp;
    r.armL.rotation.x = -sw * amp * 0.85; r.armR.rotation.x = sw * amp * 0.85;
    r.armL.rotation.z = 0.30; r.armR.rotation.z = -0.30;   // arms out over the gut

    // lean into the turn — sells the skid
    const wantLean = clamp(u.turn * 0.11 * clamp(u.speed / T.copRun, 0, 1.3), -0.36, 0.36);
    u.lean = lerp(u.lean, wantLean, 1 - Math.exp(-9 * (dt || 0.016)));
    r.hips.rotation.z = u.lean;

    u.breath += dt * (u.gassed ? 7.4 : 2.2);
    const puff = Math.sin(u.breath);
    if (u.gassed) {
      r.hips.rotation.x = lerp(r.hips.rotation.x, 0.34, 1 - Math.exp(-7 * dt));   // hunched
      r.neck.rotation.x = lerp(r.neck.rotation.x, -0.30, 1 - Math.exp(-7 * dt));  // head up, gasping
      if (r.belly) r.belly.scale.z = 1.0 * (1 + puff * 0.10);
      r.hips.position.y = 0.62 + puff * 0.022;
      if (!moving) { r.armL.rotation.x = -1.15; r.armR.rotation.x = -1.15; }      // hands on knees
    } else {
      const t = boosted ? 0.20 : 0.06 + clamp(u.speed * 0.03, 0, 0.12);
      r.hips.rotation.x = lerp(r.hips.rotation.x, t, 1 - Math.exp(-7 * dt));
      r.neck.rotation.x = lerp(r.neck.rotation.x, 0, 1 - Math.exp(-7 * dt));
      if (r.belly) r.belly.scale.z = 1.0 * (1 + puff * 0.035);
      r.hips.position.y = 0.62 + Math.abs(Math.sin(u.phase)) * 0.028;
    }
    r.shirt.emissive?.setHex(boosted ? 0x1d3a12 : 0x000000);
  }

  // ---- shopper / thief update ---------------------------------------------
  function wanderTarget(s) {
    const i = rnd() < 0.55 ? s.aisle : ri(0, AISLE_COUNT - 1);
    s.aisle = i;
    return { x: aisleX(i) + rr(-1.15, 1.15), z: rr(-HALF_LEN + 1.2, HALF_LEN - 1.2) };
  }

  // How fast the thief can ACTUALLY run right now.
  //
  // T.thiefRun is his ceiling for the first couple of seconds, not his cruise.
  // He is a shoplifter with a jacket full of steaks; he blows up on roughly the
  // same clock the cop does. Without this the chase is a straight speed subtract
  // — thief 5.35, cop 5.05 — and the gap grows 0.30 m/s forever, so the only way
  // it ever ends is the cop tripping over a free powerup. That is what the bench
  // caught. With it, both of them gas out around the same time, the gap parks a
  // couple of metres out, and every time the cop gets his wind back he surges
  // and very nearly touches him.
  //
  // The one concession to drama: footsteps right behind you find you another
  // gear. Adrenaline is drawn from the same tank and empties it faster, so a
  // thief who has already been run down once cannot keep doing it.
  function thiefPace(s, copD, dt) {
    const near = clamp((K.thiefPanicGap - copD) / K.thiefPanicBand, 0, 1);
    s.wind = clamp(s.wind - dt * (1 + near * 1.4) / K.thiefWind, 0, 1);
    // Adrenaline is a SECOND tank and it is finite.
    //
    // It has to drain on PRESSURE, not on `near`. Draining it on `near` was a
    // bug with a very specific signature and the bench printed it: a chase
    // settles at the gap where the surge exactly matches the cop, which is just
    // inside thiefPanicGap, so `near` sits around 0.1, the tank drained at 0.02
    // a second and refilled at 0.15, and the man had infinite adrenaline again
    // at exactly the distance where it mattered. Every escape in the sample had
    // a closest approach of 2.8-3.3 m. Pressure starts at six metres — the point
    // where he can hear you — and it does not care whether you have closed the
    // last three.
    const press = clamp((K.thiefPanicGap + 3.0 - copD) / 3.0, 0, 1);
    s.adren = clamp(s.adren - dt * press / K.thiefAdren
                            + dt * (1 - press) * K.thiefAdrenBack, 0, 1);
    const cruise = lerp(K.thiefTired, 1, s.wind);              // opening sprint, fading
    const surge = lerp(K.thiefTired, K.thiefPanic, near * s.adren);  // fear, and it runs out
    s.dbgNear = near;
    return T.thiefRun * Math.max(cruise, surge);
  }

  // Escape direction, read off the exit field. No repathing, no waypoint list
  // and no thrash — and it cannot point at a wall, which is the entire reason
  // this file no longer navigates off config.js's floor plan.
  function navToExit(s, flee, dt) {
    // Re-reading the field every frame is pure cost: the aim point is stable for
    // several metres of running. Refresh it on a timer, when he reaches it, or
    // when it stops being something he can see.
    s.aimT -= dt;
    const px = s.position.x, pz = s.position.z;
    let a = s.aim;
    if (!a || s.aimT <= 0 || dist2d(px, pz, a.x, a.z) < 0.85 || !nav.clearSeg(px, pz, a.x, a.z)) {
      // A runner reads the cop-priced field and looks further down it, because
      // committing to the back of the store is a decision you cannot make while
      // only looking six metres ahead.
      const F = flee ? escapeField() : exitF;
      const d = nav.steer(F, px, pz, { look: flee ? 11.0 : 6.5 });
      s.aimT = 0.13;
      a = s.aim = d ? { x: d.tx, z: d.tz } : null;
    }
    if (!a) {
      const dx = EXIT.x - px, dz = EXIT.z - pz;                     // sealed pocket
      const m = Math.hypot(dx, dz) || 1;
      return { x: dx / m, z: dz / m, dist: m };
    }
    const dx = a.x - px, dz = a.z - pz;
    const m = Math.hypot(dx, dz) || 1;
    return { x: dx / m, z: dz / m, dist: m };
  }

  // Is the cop standing between this shopper and the way he is walking out?
  // `s.aim` is the route point navToExit last handed him, so this is "is that
  // man on my line", not "is that man near me".
  function seesBlocker(s, copD) {
    const a = s.aim;
    if (!a || copD < 1e-3) return false;
    let rx = a.x - s.position.x, rz = a.z - s.position.z;
    const rm = Math.hypot(rx, rz);
    if (rm < 0.25) return false;
    rx /= rm; rz /= rm;
    const ux = (cop.position.x - s.position.x) / copD;
    const uz = (cop.position.z - s.position.z) / copD;
    if (ux * rx + uz * rz < K.thiefBlockCos) return false;
    return nav.clearSeg(s.position.x, s.position.z, cop.position.x, cop.position.z);
  }

  // Is the cop bearing down on this shopper under his own steam?
  function copClosingOn(s, copD) {
    const u = cop.userData;
    if (u.speed < K.harassSpeed || copD < 1e-3) return false;
    const dx = s.position.x - cop.position.x, dz = s.position.z - cop.position.z;
    return (u.vel.x * dx + u.vel.z * dz) / (u.speed * copD) > K.harassAim;
  }

  function updateShopper(s, dt, api, frozen) {
    if (s.escaped || s.caught) { animateShopper(s, dt, 0); return; }
    if (frozen) { s.vel.multiplyScalar(Math.exp(-6 * dt)); animateShopper(s, dt, 0); return; }

    const copD = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
    s.aisle = aisleOf(s.position.x);
    if (s.state !== 'bolt') {
      s.wind = clamp(s.wind + dt * K.thiefSecond, 0, 1);
      s.adren = clamp(s.adren + dt * K.thiefAdrenBack, 0, 1);
    }

    // ---- guilty timeline: browse -> conceal -> drift -> bolt
    if (s.guilty && !s.bolted) {
      if (!s.stole) {
        s.concealT -= dt;
        if (s.concealT <= 0 && s.state !== 'conceal') {
          s.state = 'conceal'; s.timer = 1.9; s.look = 0;
          s.held.visible = true;
          s.held.position.set(0.22, 1.02, 0.24);
        }
      }
      // ROUND 3. He is walking out with a jacket full of steaks and a uniform
      // has just appeared in the mouth of his aisle, in line with the doors. He
      // does not amble up to within four and a half metres to make sure. Seeing
      // the way out blocked IS the tell, and it is the difference between a
      // chase and a collection: the old radius let him bolt at 3.4 m from a cop
      // already at a dead sprint, which is 0.3 s of "chase" and 100% caught.
      // Needs line of sight and needs the cop to actually be ON his route, so a
      // cop stood at his post across the store never trips it.
      if (s.state === 'drift' && copD < T.suspicionRadius) { s.state = 'react'; s.timer = K.thiefReact; }
      else if (s.state === 'drift' && copD < K.thiefLook && seesBlocker(s, copD)) {
        s.state = 'react'; s.timer = K.thiefReact;
      }
      if (s.state === 'conceal' && copD < T.suspicionRadius && s.timer < 1.2) { s.state = 'react'; s.timer = K.thiefReact; }
    } else if (!s.guilty) {
      // ---- innocent: turn and yell, never run
      // A complaint is for ROLLING UP ON someone. Standing at your post while a
      // shopper wanders past you is not harassment, and the old pure-distance
      // test handed the player a complaint — and a demotion — for doing nothing
      // at all for thirty seconds. You have to walk at them.
      if (copD < T.suspicionRadius && s.harassArmed && s.angry <= 0 && copClosingOn(s, copD)) {
        s.angry = 2.6; s.harassArmed = false; s.bang.visible = true;
        api.onHarass && api.onHarass(s);
      }
      if (copD > T.suspicionRadius + 1.6) s.harassArmed = true;
      if (s.angry > 0) { s.angry -= dt; if (s.angry <= 0) s.bang.visible = false; }
    }

    let target = T.thiefWalk;
    let dir = null;

    switch (s.state) {
      case 'walk': {
        s.timer -= dt;
        if (!s.path.length) {
          if (!s.target) s.target = wanderTarget(s);
          s.path = nav.path(s.position.x, s.position.z, s.target.x, s.target.z);
        }
        dir = followPath(s, dt);
        if (!dir) { s.target = null; s.state = 'browse'; s.timer = rr(1.6, 4.5); }
        break;
      }
      case 'browse': {
        s.timer -= dt;
        target = 0;
        if (s.timer <= 0) { s.state = 'walk'; s.timer = rr(4, 9); s.target = null; s.path = []; }
        break;
      }
      case 'conceal': {
        s.timer -= dt; target = 0;
        const t = 1 - clamp(s.timer / 1.9, 0, 1);
        // item arcs from the shelf lip into the jacket, then is gone
        const ax = lerp(0.30, 0.02, clamp(t * 1.6, 0, 1));
        const ay = lerp(1.02, 1.12, clamp(t * 1.6, 0, 1)) + Math.sin(clamp(t * 1.6, 0, 1) * Math.PI) * 0.16;
        const az = lerp(0.28, 0.13, clamp(t * 1.6, 0, 1));
        s.held.position.set(ax, ay, az);
        s.held.visible = t < 0.62;
        s.look = Math.sin(t * Math.PI * 3.2) * 0.85;              // shoulder checks
        if (s.timer <= 0) { s.stole = true; s.state = 'drift'; s.path = []; s.held.visible = false; }
        break;
      }
      case 'drift': {
        dir = navToExit(s, false, dt);
        target = T.thiefWalk * 1.12;
        s.look = Math.sin(s.phase * 0.8) * 0.5;
        if (atExit(s) >= 0) { startShove(s); break; }
        break;
      }
      case 'react': {
        s.timer -= dt; target = 0.5;
        dir = { x: (s.position.x - cop.position.x), z: (s.position.z - cop.position.z) };
        const m = Math.hypot(dir.x, dir.z) || 1; dir.x /= m; dir.z /= m;
        s.look = 1.0;
        if (s.timer <= 0) {
          s.state = 'bolt'; s.bolted = true; s.path = []; s.repathIn = 0;
          if (s.hasCart) { s.hasCart = false; s.dropCartAt = { x: s.position.x, z: s.position.z, y: s.heading }; }
          api.onBolt && api.onBolt(s);
        }
        break;
      }
      case 'bolt': {
        // The route already knows where the cop is — see escapeField(). If the
        // front of his aisle is corked and the back of the store is genuinely
        // cheaper, that is the route this returns, on its own, because it is the
        // cheaper one. If squeezing past is cheaper, it returns that instead,
        // hugging the shelf, and squeezePast() commits him to a shoulder.
        dir = navToExit(s, true, dt);
        dir = squeezePast(s, dir, copD, dt);
        target = thiefPace(s, copD, dt);
        if (s.stumble > 0) { s.stumble = Math.max(0, s.stumble - dt); target *= K.stumbleMul; }
        s.look = 0;
        if (atExit(s) >= 0) { startShove(s); break; }
        break;
      }
      // ---- the door -------------------------------------------------------
      // A door is not a teleport. He arrives at a dead run, hits the leaf, and
      // for the better part of a second he is a stationary man with his
      // shoulder on a push-bar and his back to you. THAT is what makes a chase
      // to the doors contestable at the doors instead of decided ten metres
      // out, and it is why the pursuing cop — the intuitive, thematic action —
      // now has an ending available to him. He is grabbable throughout; the
      // grab is a plain one, because a man leaning on a door is not juking.
      case 'shove': {
        s.shoveT -= dt; target = 0; s.look = 0;
        const e = EXITS[s.exitI] || EXITS[0];
        // still creeping at the leaf, so a grab is a real tackle and not a
        // freeze-frame two metres short
        dir = { x: (e.x - s.position.x), z: (e.z - s.position.z), dist: 1 };
        const dm = Math.hypot(dir.x, dir.z) || 1; dir.x /= dm; dir.z /= dm;
        target = 0.55;
        if (s.shoveT <= 0) { escape(s, api); return; }
        break;
      }
    }

    if (s.angry > 0 && s.state !== 'bolt' && s.state !== 'react') {
      target = 0;
      const dx = cop.position.x - s.position.x, dz = cop.position.z - s.position.z;
      const m = Math.hypot(dx, dz) || 1;
      s.heading = Math.atan2(dx / m, dz / m);
    }

    if (dir) {
      const run = s.state === 'bolt';
      const av = avoid(s, dir.x, dir.z, run ? 1.15 : 1.5, run ? 0.9 : 1.25, run);
      // Corner cost: you cannot take a 90 at full tilt. Charge it against the
      // ROUTE direction, not the crowd-avoidance one — steer()'s lateral grip
      // already handles jostle, and billing it twice meant every shopper the
      // thief squeezed past cut him to 60% while the cop shoved straight through.
      // Free under ~30 degrees, full bite at 90.
      let cm = 1;
      if (s.speed > 0.6) {
        const fx = s.vel.x / s.speed, fz = s.vel.z / s.speed;
        const cosA = clamp(dir.x * fx + dir.z * fz, -1, 1);
        let bite = clamp((K.thiefCornerFree - cosA) / K.thiefCornerFree, 0, 1);
        // ROUND 4 — as written in round 3 this measured a corner multiplier of
        // 0.99 across every chase in the bench: it never fired. `dir` comes out
        // of nav.steer(), which string-pulls to the furthest VISIBLE point on
        // the descent, so the aim point swings round the end of a gondola a beat
        // before the body does and the two vectors never disagree by much. The
        // cost was written, documented, tuned — and dead. thiefCornerFree is now
        // set where the angle a running body actually produces can reach it.
        //
        // I also tried billing it against steer()'s `skid`, which is the lateral
        // acceleration he is really spending, and that is the right quantity but
        // it is NOT SAFE as written: skid is downstream of the speed target, so
        // charging the target against it closes a feedback loop. The bench trace
        // showed the result plainly — a bolting thief oscillating between 3.7
        // and 1.1 m/s on a straight, with his target collapsing to 1.8. Left in,
        // it would have flattered every number in this file by crippling the man
        // being chased. The correct version bills the BEND OF THE ROUTE AHEAD,
        // which is exogenous; it is worth doing and it is not done here.
        cm = 1 - (1 - K.thiefCorner) * bite;
        target *= cm;
      }
      s.dbgCorner = cm;
      s.dbgTarget = target;
      steer(s, av.x, av.z, target, K.thiefAccel, 0.72, T.thiefRun, dt);
    } else {
      s.dbgTarget = 0;
      steer(s, 0, 0, 0, K.thiefAccel, 0.72, T.thiefRun, dt);
    }
    solids.resolve(s.position, BODY_R);
    animateShopper(s, dt, target);
  }

  // Which door he is at, if any. -1 otherwise.
  function atExit(s) {
    for (let i = 0; i < EXITS.length; i++) {
      const e = EXITS[i];
      if (dist2d(s.position.x, s.position.z, e.x, e.z) < 1.35) return i;
    }
    return -1;
  }
  function startShove(s) {
    const i = atExit(s);
    if (i < 0) return;
    s.exitI = i; s.state = 'shove'; s.shoveT = EXITS[i].shove; s.duck = 0; s.duckT = 0;
  }

  function escape(s, api) {
    s.escaped = true; s.mesh.visible = false; s.cart.visible = false;
    s.bang.visible = false; s.vel.set(0, 0, 0);
    api.onEscape && api.onEscape(s);
  }

  function animateShopper(s, dt, target) {
    const r = s.rig;
    if (s.speed > 0.15) s.heading = Math.atan2(s.vel.x, s.vel.z);
    s.mesh.rotation.y = s.heading;
    s.phase += (s.speed / (0.88 * r.root.scale.x)) * dt * Math.PI * 2 + dt * 0.6;
    const amp = clamp(s.speed * 0.20, 0.02, 0.66);
    const sw = Math.sin(s.phase);
    r.legL.rotation.x = sw * amp; r.legR.rotation.x = -sw * amp;
    r.neck.rotation.y = lerp(r.neck.rotation.y, s.look, 1 - Math.exp(-8 * dt));
    r.hips.position.y = 0.62 + Math.abs(sw) * 0.022;

    // Shouldering the door. Both arms out flat on the leaf, body pitched into
    // it — the beat has to be VISIBLE or the grab window is invisible too.
    if (s.state === 'shove') {
      const e = EXITS[s.exitI] || EXITS[0];
      if (e) s.mesh.rotation.y = s.heading = Math.atan2(e.x - s.position.x, e.z - s.position.z);
      const heave = Math.sin((1 - clamp(s.shoveT / Math.max(0.05, e ? e.shove : 1), 0, 1)) * Math.PI);
      r.armL.rotation.x = -1.75 - heave * 0.28; r.armR.rotation.x = -1.75 - heave * 0.28;
      r.hips.rotation.x = 0.22 + heave * 0.18;
      r.hips.position.y = 0.62;
      return;
    }
    const bolting = s.state === 'bolt' || s.state === 'react';
    if (s.hasCart) {
      // both hands on the bar, cart pushed out front
      r.armL.rotation.x = -0.95; r.armR.rotation.x = -0.95;
      r.armL.rotation.z = 0.16; r.armR.rotation.z = -0.16;
      s.cart.visible = true;
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      s.cart.position.set(s.position.x + fx * 0.62, 0, s.position.z + fz * 0.62);
      s.cart.rotation.y = s.heading;
    } else {
      if (s.cart.visible && s.dropCartAt) {
        s.cart.position.set(s.dropCartAt.x + Math.sin(s.dropCartAt.y) * 0.5, 0,
          s.dropCartAt.z + Math.cos(s.dropCartAt.y) * 0.5);
        s.cart.rotation.y = s.dropCartAt.y + 0.5;                 // slewed, abandoned
        s.dropCartAt = null;
      }
      r.armL.rotation.x = -sw * amp * (bolting ? 1.25 : 0.8);
      r.armR.rotation.x = sw * amp * (bolting ? 1.25 : 0.8);
      r.armL.rotation.z = bolting ? 0.10 : 0.06;
      r.armR.rotation.z = bolting ? -0.10 : -0.06;
    }
    if (s.angry > 0) {
      const w = Math.sin(s.angry * 22);
      r.armR.rotation.x = -1.9 + w * 0.45; r.armR.rotation.z = -0.55;
      r.armL.rotation.x = -0.4; r.hips.rotation.x = 0.12;
      r.neck.rotation.x = -0.12;
      s.bang.position.y = 2.05 + Math.abs(w) * 0.07;
    } else if (s.state === 'browse' || s.state === 'conceal') {
      const reach = s.state === 'conceal' ? 1.55 : 1.05 + Math.sin(s.phase * 0.7) * 0.25;
      r.armR.rotation.x = -reach; r.armR.rotation.z = -0.22;
      r.hips.rotation.x = 0.05;
    } else {
      r.hips.rotation.x = bolting ? 0.26 : lerp(r.hips.rotation.x, 0.04, 1 - Math.exp(-8 * dt));
    }
    r.hips.rotation.z = 0;
  }

  // ---- powerups ------------------------------------------------------------
  function updatePowerups(dt) {
    const u = cop.userData;
    for (const p of powerups) {
      if (!p.live) {
        p.respawn -= dt;
        if (p.respawn <= 0) { p.live = true; p.mesh.visible = true; }
        continue;
      }
      p.item.rotation.y += dt * 2.1;
      p.item.position.y = 1.06 + Math.sin(performance.now() * 0.003 + p.x) * 0.05;
      p.ring.material.opacity = 0.40 + 0.22 * Math.sin(performance.now() * 0.005 + p.z);
      // You have to REACH for it. Being inside the radius is not enough: the
      // can is on a shelf, off to the side of the lane, and a cop sprinting past
      // parallel to the shelf face is not grabbing anything. Without this the
      // chase kept handing him free boosts — the aim point of a pursuit drifts
      // toward whichever side the thief is running, and the bench measured the
      // supposedly-unpowered cop boosted 11% of the chase off pure geometry.
      // Steer into the shelf and it is yours; run past it and it is not.
      const dx = p.x - cop.position.x, dz = p.z - cop.position.z;
      const d = Math.hypot(dx, dz);
      if (d >= K.pickupRadius + BODY_R) continue;
      // The test is LATERAL, not radial. Closing on the can while running down
      // the aisle at it is just... running down the aisle; the whole chase does
      // that. What costs you something is leaving your line and going at the
      // shelf face, so that is what the grab asks for.
      if (u.speed > 0.6 && (u.vel.x * p.nx + u.vel.z * p.nz) < K.pickupReach) continue;
      p.live = false; p.mesh.visible = false; p.respawn = 16;
      u.boost = T.boostTime; u.stamina = T.staminaMax; u.gassed = false;
    }
  }

  // ---- catch / telemetry ---------------------------------------------------
  //
  // A committed thief coming the other way is not caught by proximity, he is
  // caught by BEING IN FRONT OF HIM. Round 2's grab was a bare radius test, and
  // in a 4.0 m aisle a bare radius test cannot be beaten: the lane gives 1.58 m
  // of half-width, the grab reaches 1.15 m of it, and a cop with any lateral
  // authority at all covers the 0.43 m of daylight faster than a running body
  // can get to it. Footwork does not beat footwork in a corridor.
  //
  // So the barge. He picks a shoulder (squeezePast) and he is going through it.
  //
  // ROUND 4 — this asked the wrong question and so it never fired. It used to
  // read the cop's offset from the lane centreline AT THE MOMENT HE COMMITTED.
  // A pursuit bot steers at the thief, the thief is near the middle of the lane
  // when he decides, therefore the cop was near the middle too, therefore the
  // cop always "covered" him: 114 of 200 chases committed to a shoulder, 7
  // actually got through, and all 7 of those were caught anyway. Nine tuning
  // constants for a mechanic that changed nothing.
  //
  // What decides a shoulder in real life is not where you were standing a
  // second ago, it is whether you are in front of THAT shoulder when he
  // arrives. So: measure the separation ACROSS his line of run, at contact. If
  // you are more than grabSlack off it, he is past you and it costs him only
  // the stumble. If the cop is behind him it is not a barge at all, it is a
  // chase-down, and those always grab.
  //
  // The arithmetic that makes it a duel and not a coin flip: the juke moves him
  // ~1.5 m sideways over the last 4.4 m of closing, which at ten metres a second
  // of closing speed is a lateral rate near 3.5 m/s. A 5 m/s cop with copGrip
  // 0.78 has about 7 m/s^2 of lateral authority, so mirroring it from a standing
  // start takes him half a second he does not have. From the MIDDLE he only has
  // to find 1.1 m and he makes it; from one side he needs 2.6 m and he does not.
  // That is the whole tactical content of a corked aisle: HOLD THE MIDDLE. It is
  // readable, it is learnable, and it does not care how fast you can twitch.
  function copCovers(s) {
    const m = Math.hypot(s.vel.x, s.vel.z);
    if (m < 1.2) return true;                       // not running past anybody
    const fx = s.vel.x / m, fz = s.vel.z / m;
    const dx = cop.position.x - s.position.x, dz = cop.position.z - s.position.z;
    if (dx * fx + dz * fz < -0.10) return true;     // cop is astern: a chase-down grab
    // Measured ACROSS THE LANE, at contact. Inside an aisle the lane axis is X;
    // out on a cross-aisle it is Z. He locked his shoulder in jukeHold seconds
    // ago and he cannot change it — 0.85 s, and 1.5 m of lane to cover, which is
    // 2.1 m/s^2 against the 7 m/s^2 of lateral authority a sprinting cop has. So
    // it is entirely coverable BY A COP WHO READ THE COMMIT, and not remotely
    // coverable by one still steering at where the man was a moment ago. That
    // asymmetry is the duel; the bench bot's 0.16 s of reaction lag is exactly
    // what decides it, which is the correct thing for it to turn on.
    const off = Math.abs(s.position.z) < HALF_LEN ? Math.abs(dx) : Math.abs(dz);
    return off < K.grabSlack;
  }
  function barge(s) {
    s.bargeN = (s.bargeN || 0) + 1;
    s.stumble = K.stumbleT;
    s.bargeT = K.bargeGrace;
    s.duckSide = s.duck; s.duck = 0; s.duckT = 0;
    // ROUND 4 — who actually pays. Round 3 charged the THIEF for getting past
    // (0.45 s at three quarters pace) and charged the cop a 22% velocity trim,
    // which is nothing: he was still inside grab range half a second later and
    // the bench duly measured 80 barges and 79 catches. Getting through a man
    // that has to MEAN something or it is not a mechanic, it is an animation.
    //
    // So it lands the other way round now, which is also the way it works: he is
    // running and you are not. He clips a body and loses a step; you take a
    // shoulder, most of your speed goes, and you are left facing the way he came
    // from with a stagger to shake off before you can go again. Roughly three
    // metres, which against a 26 m aisle is a chase instead of a formality.
    let dx = s.position.x - cop.position.x, dz = s.position.z - cop.position.z;
    const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
    cop.position.x -= dx * 0.34; cop.position.z -= dz * 0.34;
    cop.userData.vel.multiplyScalar(0.22);
    cop.userData.stagger = K.bargeStagger;
    // ...and he ends up THROUGH, which is the whole point and is the thing that
    // was missing. A 0.10 m nudge left him inside the separation constraint the
    // two bodies enforce on each other — the bench trace showed the pair welded
    // at 0.78 m for the entire half-second of grace and then a grab the instant
    // it expired, which is exactly the "33 barges, 32 still caught" the critic
    // measured and I could not explain. He is not squeezing past, he is running
    // through: put him a body's length down the lane on the shoulder he picked.
    const sp = Math.hypot(s.vel.x, s.vel.z) || 1;
    s.position.x += (s.vel.x / sp) * K.bargeThru + (s.duckSide || 0) * 0.22;
    s.position.z += (s.vel.z / sp) * K.bargeThru;
    solids.resolve(s.position, BODY_R);
  }
  function interactions(dt, api) {
    for (const s of shoppers) {
      if (s.escaped || s.caught || !s.guilty) continue;
      if (!s.bolted && s.state !== 'react') continue;
      if (s.bargeT > 0) { s.bargeT -= dt; continue; }
      const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
      if (d > T.catchRadius) continue;
      if (s.duck && !copCovers(s)) { barge(s); continue; }
      s.caught = true; s.vel.set(0, 0, 0); s.state = 'caught';
      s.rig.armL.rotation.x = -2.5; s.rig.armR.rotation.x = -2.5;     // hands up
      api.onCatch && api.onCatch(s);
    }
  }

  function telemetry(api) {
    if (!api.report) return;
    const u = cop.userData;
    let nearest = null, nd = Infinity, chase = null;
    for (const s of shoppers) {
      if (s.escaped || !s.mesh.visible) continue;
      const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
      if (d < nd) {
        nd = d;
        nearest = { id: s.id, dist: d, guilty: s.guilty, aisle: s.aisle, fleeing: s.state === 'bolt' };
      }
      if (s.state === 'bolt' && !s.caught) {
        // ROUND 4: metres to the door HE is going to, not to Door 1. With two
        // ways out, measuring everyone against one of them is a lie the HUD
        // then repeats. See exits / exitDistOf in the export block.
        const ex = exitOf(s.position.x, s.position.z);
        chase = {
          id: s.id, dist: d, exit: ex.i, exitLabel: ex.exit ? ex.exit.label : 'DOOR 1',
          thiefToExit: ex.dist,
          shoving: s.state === 'shove',
        };
      }
    }
    api.report({
      stamina: u.stamina, staminaMax: T.staminaMax, boost: u.boost,
      gassed: u.gassed, speed: u.speed, nearest, chase,
    });
  }

  // ---- main tick -----------------------------------------------------------
  function tick(dt, input, api) {
    if (!(dt > 0)) dt = 0;
    input = input || {};
    api = api || {};
    if (world.colliders && world.colliders.length !== solidCount) {
      solids = makeSolids(world); solidCount = world.colliders.length;
      nav = buildNav(); buildExits();
      fleeF = null; fleeBuf = null; fleeT = 0; fleeCx = fleeCz = 1e9;
      for (const s of shoppers) { s.aim = null; s.aimT = 0; s.path = []; }
      buildPowerups();
    }
    const frozen = !!api.frozen;
    updateCop(dt, input, frozen);
    if (!frozen) updateFlee(dt);
    updatePowerups(dt);
    for (const s of shoppers) updateShopper(s, dt, api, frozen);
    interactions(dt, api);
    telemetry(api);
  }

  // =========================================================================
  // BENCH — the second bar, measured. Runs headless (no render), same update
  // path the game uses. Usage from the console:
  //   const C = window.__CHOP; C.pause();
  //   C.agents.benchReal(200)                 // the eight numbers that matter
  //   C.agents.bench({ n: 200, mode: 'none' })    // NO POWERUP EXISTS
  //   C.agents.bench({ n: 200, mode: 'pickup' })  // one is reachable, bot detours
  //   C.agents.bench({ n: 200, mode: 'boost' })   // already boosted
  //   C.agents.bench({ n: 200, mode: 'ignore' })  // cans on the shelves, bot
  //                                               // ignores them: boostFrac is
  //                                               // then the free-boost leak
  // `spawn` picks the starting geometry and DEFAULTS TO THE REAL ONE:
  //   'aisle'  postSpawn({kind:'aisle'})  — cop in the mouth of his aisle  <-- default
  //   'back'   postSpawn({kind:'back'})   — cop at the back of his aisle
  //   'front'  postSpawn({kind:'front'})  — cop out on the front cross-aisle
  //   'behind' round 2's bench: cop a suspicion-radius astern. The game does not
  //            produce this. Never report it as "the" catch rate.
  // Diagnostic options: { misaim:k } dispatches k aisles wrong, { crowd:false }
  // empties the store, { trace:k } returns a per-frame trace of trial k,
  // { lag:s } gives the pursuit bot s seconds of reaction delay (0 = oracle),
  // { gapMul } moves the 'behind' separation, { seed }.
  // =========================================================================
  const routeLen = (fx, fz) => toExit(fx, fz);

  // ---- the bot ------------------------------------------------------------
  // ROUND 4. There is no such thing as "the" catch rate; there is a catch rate
  // FOR A GIVEN PLAYER. Round 3 shipped exactly one bot, a pure pursuit that
  // paths at wherever the man is standing this frame, and then published its
  // misaim table as if it described the game. An independent critic put its own
  // bot in the same geometry and beat mine by fifteen points at misaim 2. A
  // bench with one weak bot in it does not measure a game, it measures that bot.
  //
  // So: three, and every headline reports all three.
  //   chase  — round 3's. Steers at the thief. This is what the game's fiction
  //            invites you to do and it is the weakest of the three.
  //   cut    — a competent player. Works out where the man has to GO, floods
  //            its own route costs, and moves to the earliest point on his line
  //            it can reach before he does. Also manages its wind: it only
  //            spends sprint when the intercept is actually tight.
  //   camp   — the degenerate strategy the critic found. Ignores the dispatch,
  //            walks to a door and stands on it. THIS is the number that says
  //            whether the desk phase is worth playing: if camp beats cut, the
  //            aisle number is decoration.
  // `lag` gives the bot a reaction delay. At 0 it is an oracle that mirrors a
  // sidestep perfectly, which is a true statement about a tracking algorithm and
  // a false one about a man on a keyboard; the default is a human's.
  const _pathLen = (px, pz, pts) => {
    let L = 0, cx = px, cz = pz;
    for (const w of pts) { L += dist2d(cx, cz, w.x, w.z); cx = w.x; cz = w.z; }
    return L;
  };
  // The thief's route to the door he is actually going for, sampled every ~2 m
  // so the bot can ask "can I be at THAT spot before he is".
  function routePoints(fx, fz) {
    const e = exitOf(fx, fz);
    const raw = nav.path(fx, fz, e.exit.x, e.exit.z);
    const out = [];
    let cx = fx, cz = fz, run = 0;
    for (const w of raw) {
      const d = dist2d(cx, cz, w.x, w.z);
      const steps = Math.max(1, Math.round(d / 2.0));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        run += d / steps;
        out.push({ x: cx + (w.x - cx) * t, z: cz + (w.z - cz) * t, s: run });
      }
      cx = w.x; cz = w.z;
    }
    return out;
  }

  function botGoal(thief, st, dt, tx, tz) {
    const u = cop.userData;
    if (st.bot === 'chase') return { x: tx, z: tz, sprint: true };

    // One Dijkstra out of the cop, a few times a second: exact route cost from
    // where he is standing to every cell in the building. Cheaper than one A*
    // per candidate and it is what lets the bot compare arrivals honestly.
    st.cfT -= dt;
    if (!st.copF || st.cfT <= 0) {
      st.cfT = 0.30;
      if (!st.copBuf || st.copBuf.length !== nav.count) st.copBuf = new Float32Array(nav.count);
      st.copF = nav.field(cop.position.x, cop.position.z, { out: st.copBuf });
    }
    st.planT -= dt;
    if (st.planT <= 0) {
      st.planT = 0.20;
      st.route = routePoints(tx, tz);
    }
    const route = st.route || [];
    const tSpd = T.thiefRun * K.thiefTired;                 // his cruise, not his ceiling
    const cSpd = T.copRun * (u.boost > 0 ? T.boostMul : 0.86);
    const doorI = exitOf(tx, tz).i;
    const door = EXITS[doorI] || EXITS[0];

    if (st.bot === 'camp') {
      // Stands on a door. Switches only once the man has clearly committed to
      // the other one — that is what a camper actually does, and pretending he
      // never switches would flatter the pursuing bot.
      if (st.campI == null) st.campI = clamp(st.campFix != null ? st.campFix : doorI, 0, EXITS.length - 1);
      if (st.campFix == null && doorI !== st.campI && exitFs[st.campI] && exitFs[doorI]) {
        const mine = nav.at(exitFs[st.campI], tx, tz);
        const his = nav.at(exitFs[doorI], tx, tz);
        if (mine - his > 5.0) st.campI = doorI;
      }
      const e = EXITS[st.campI] || EXITS[0];
      const near = dist2d(cop.position.x, cop.position.z, e.x, e.z) < 1.4;
      // Once he is inside grabbing range, stop being furniture.
      const gap = dist2d(cop.position.x, cop.position.z, tx, tz);
      if (gap < 3.2) return { x: tx, z: tz, sprint: true };
      return { x: e.x, z: e.z, sprint: !near };
    }

    // ---- cut: the earliest point on his line I can reach before he does -----
    let best = null;
    const rTot = route.length ? route[route.length - 1].s : 0;
    for (const w of route) {
      const tT = w.s / tSpd;
      const cD = nav.at(st.copF, w.x, w.z);
      if (!isFinite(cD)) continue;
      const cT = cD / cSpd;
      if (cT <= tT - 0.18) { best = { w, cT, tT }; break; }   // route is ordered: first = earliest
    }
    if (!best) {
      // Cannot head him off anywhere. Then the door is the last place he has to
      // be, so go and stand on it — this is exactly why camping works at all,
      // and a bot that would not do it is not a competent player.
      const cD = nav.at(st.copF, door.x, door.z);
      const tT = rTot / tSpd, cT = cD / cSpd;
      if (isFinite(cD) && cT < tT + 1.2) return { x: door.x, z: door.z, sprint: true };
      return { x: tx, z: tz, sprint: true };
    }
    // Wind management. Sprinting to arrive four seconds early buys nothing and
    // costs you the legs you need at the door; spend it when the intercept is
    // tight, or when he is close enough to grab.
    const slack = best.tT - best.cT;
    const gap = dist2d(cop.position.x, cop.position.z, tx, tz);
    const sprint = st.conserve === false ? true
      : (slack < 1.1 || gap < 5.0 || thief.state === 'shove');
    return { x: best.w.x, z: best.w.z, sprint };
  }

  function botInput(thief, mode, st, dt) {
    const u = cop.userData;
    if (u.boost > 0) st.gotBoost = true;
    const lag = st.lag || 0;
    if (lag > 0) {
      st.hist.push(thief.position.x, thief.position.z);
      const keep = Math.max(2, Math.round(lag / dt) * 2 + 2);
      while (st.hist.length > keep) st.hist.splice(0, 2);
    }
    let tx = lag > 0 ? st.hist[0] : thief.position.x;
    let tz = lag > 0 ? st.hist[1] : thief.position.z;
    // `blind` is what finally makes the misaim table mean anything. An oracle
    // bot knows which door the man prefers before he does, so it cuts the right
    // corner from the wrong aisle and being dispatched two aisles out costs it
    // almost nothing — which is exactly how round 3 came to publish a misaim
    // table that flattered itself. A blind bot only knows what the desk told it
    // (an aisle number) plus whatever it can currently SEE down a lane. Being
    // sent to the wrong aisle then costs what it should: you are cutting off a
    // route he is not on.
    if (st.blind) {
      if (nav.clearSeg(cop.position.x, cop.position.z, tx, tz)
          && dist2d(cop.position.x, cop.position.z, tx, tz) < 20) {
        st.seen.x = tx; st.seen.z = tz; st.seenT = 0;
      } else {
        st.seenT += dt;
        tx = st.seen.x; tz = st.seen.z;
      }
    }

    let g = botGoal(thief, st, dt, tx, tz);
    let gx = g.x, gz = g.z, sprint = g.sprint !== false;

    if (mode === 'pickup' && !st.gotBoost) {
      // A competent player, not an oracle: every fifth of a second, look for the
      // powerup that costs the least ground to detour to, and only take it if
      // that detour is worth it. Committing to one can across the store at the
      // start of the chase is not how anybody plays, and it was costing the
      // bench 20 points of catch rate.
      st.puT -= dt;
      if (st.puT <= 0) {
        st.puT = 0.2;
        const direct = dist2d(cop.position.x, cop.position.z, gx, gz);
        let best = null, bestX = Infinity;
        for (const p of powerups) {
          if (!p.live) continue;
          const extra = dist2d(cop.position.x, cop.position.z, p.x, p.z)
                      + dist2d(p.x, p.z, gx, gz) - direct;
          if (extra < bestX) { bestX = extra; best = p; }
        }
        st.puTarget = best && bestX <= st.detour ? best : null;
      }
      const p = st.puTarget;
      // Aim past the can into the shelf face — you cannot take it off the shelf
      // by running parallel to it.
      if (p && p.live) { gx = p.x + p.nx * 0.55; gz = p.z + p.nz * 0.55; sprint = true; }
    }

    // lead the target when we can see him and we are actually chasing him
    if (gx === tx && gz === tz && nav.clearSeg(cop.position.x, cop.position.z, gx, gz)) {
      gx += thief.vel.x * 0.28; gz += thief.vel.z * 0.28;
    }
    st.repath -= dt;
    if (st.repath <= 0 || !st.path.length
        || dist2d(st.goal.x, st.goal.z, gx, gz) > 1.2) {
      st.repath = 0.12; st.goal.x = gx; st.goal.z = gz;
      st.path = nav.path(cop.position.x, cop.position.z, gx, gz);
    }
    const holder = { position: cop.position, path: st.path };
    const dir = followPath(holder, 0);
    if (!dir) return { x: 0, z: 0, sprint };
    // main.js hands us input.z with the camera-inverted sign; undo it here.
    return { x: dir.x, z: FWD_SIGN * dir.z, sprint };
  }


  // NaN used to survive into the sort here, which silently scrambles the order
  // and prints a percentile that is not one. Drop them.
  const _q = (a, p) => {
    const b = a.filter(isFinite).sort((x, y) => x - y);
    if (!b.length) return NaN;
    return b[Math.min(b.length - 1, Math.floor(p * b.length))];
  };
  const _mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const _f2 = (v) => (isFinite(v) ? +v.toFixed(2) : null);

  function bench(opts = {}) {
    const n = opts.n ?? 200;
    const mode = opts.mode ?? 'none';       // 'none' | 'ignore' | 'pickup' | 'boost'
    const spawn = opts.spawn ?? 'aisle';    // 'aisle' | 'back' | 'front' | 'behind'
    const dt = 1 / 60, maxT = opts.maxT ?? 30;
    const crowd = opts.crowd !== false;
    const gapMul = opts.gapMul ?? 0.96;
    const traceK = opts.trace == null ? -1 : (opts.trace | 0);
    const trace = [];
    const save = { pos: cop.position.clone(), ud: { ...cop.userData } };
    const R = [];                            // per-trial records

    for (let k = 0; k < n; k++) {
      setSeed((opts.seed ?? 1234) + k * 7919);
      reset();
      // one thief, everyone else innocent, so the bench measures one chase
      const thief = shoppers[0];
      shoppers.forEach((s, i) => resetShopper(s, i === 0));
      if (!crowd) {
        shoppers.forEach((s, i) => {
          if (i === 0) return;
          s.escaped = true; s.mesh.visible = false; s.cart.visible = false;
        });
      }
      let ai = 0, txx = 0, tzz = 0;
      for (let a = 0; a < 40; a++) {
        ai = ri(0, AISLE_COUNT - 1);
        txx = aisleX(ai) + rr(-0.7, 0.7);
        tzz = rr(-HALF_LEN + 2, HALF_LEN - 2);
        if (nav.free(txx, tzz) && canReachExit(txx, tzz)) break;
      }
      thief.position.set(txx, 0, tzz);
      thief.stole = true; thief.state = 'drift'; thief.path = []; thief.repathIn = 0;
      thief.hasCart = false; thief.cart.visible = false;
      // Point him at the exit; he is strolling out with the steaks.
      const w0 = nav.steer(exitF, thief.position.x, thief.position.z, { look: 4 });
      let fx = w0 ? w0.x : EXIT.x - thief.position.x;
      let fz = w0 ? w0.z : EXIT.z - thief.position.z;
      const fm = Math.hypot(fx, fz) || 1; fx /= fm; fz /= fm;
      thief.vel.set(fx * T.thiefWalk, 0, fz * T.thiefWalk);

      // ---- where the COP starts. This is the whole methodology. -------------
      // The default is `aisle`, which reproduces game.js postSpawn({kind:'aisle'})
      // EXACTLY: the player reads the monitors, presses DISPATCH, and the cop is
      // teleported to the mouth of the subject's own aisle, standing between him
      // and Door 1, stopped, with full wind. That is the geometry every real
      // chase in this game starts from, so it is the geometry the headline
      // number has to come from. `behind` is the old round-2 spawn — a cop
      // 4.3 m astern of a thief already running — and it is kept only as a
      // secondary scenario, because the game never actually produces it.
      const cu = cop.userData;
      const tAisle = aisleOf(thief.position.x);
      const dAisle = clamp(tAisle + (opts.misaim ?? 0), 0, AISLE_COUNT - 1);
      let cx0, cz0, cvx = 0, cvz = 0;
      if (spawn === 'behind') {
        const jit = rr(-0.6, 0.6);
        const bx = -(fx * Math.cos(jit) - fz * Math.sin(jit));
        const bz = -(fx * Math.sin(jit) + fz * Math.cos(jit));
        const gap = T.suspicionRadius * gapMul;
        cx0 = thief.position.x + bx * gap; cz0 = thief.position.z + bz * gap;
        cvx = -bx * T.copRun * 0.7; cvz = -bz * T.copRun * 0.7;
      } else if (spawn === 'back') {
        cx0 = aisleX(dAisle); cz0 = HALF_LEN - 3.0;              // postSpawn 'back'
      } else if (spawn === 'front') {
        cx0 = Math.max(STORE.minX + 2, SERVICE_DESK.x - 3.0);    // postSpawn 'front'
        cz0 = FRONT_WALK_Z;
      } else {
        cx0 = aisleX(dAisle); cz0 = -HALF_LEN + 3.0;             // postSpawn 'aisle'
      }
      cop.position.set(cx0, 0, cz0);
      solids.resolve(cop.position, BODY_R);
      cu.vel.set(cvx, 0, cvz); cu.speed = Math.hypot(cvx, cvz);
      cu.stamina = T.staminaMax; cu.gassed = false; cu.skid = 0; cu.stagger = 0;
      cu.heading = Math.atan2(cvx, cvz);
      cu.boost = mode === 'boost' ? T.boostTime : 0;

      // 'none' means NO POWERUP AVAILABLE. It used to mean "the bot does not
      // detour for one", which is a different and much weaker claim — the round-2
      // report published 1.5% from a call that was actually still handing the cop
      // free cans. The documented call now does the obvious thing; `ignore`
      // is the old behaviour, kept because boostFrac under it is the measurement
      // that proves the shelf-lip reach gate still works.
      if (mode === 'none' || opts.nopu) {
        for (const p of powerups) { p.live = false; p.respawn = 1e6; p.mesh.visible = false; }
      }
      const st = {
        gotBoost: mode !== 'pickup', puTarget: null, puT: 0, detour: opts.detour ?? 7,
        path: [], repath: 0, goal: { x: 0, z: 0 },
        lag: opts.lag ?? 0.16, hist: [thief.position.x, thief.position.z],
        bot: opts.bot ?? 'cut', conserve: opts.conserve, campFix: opts.campFix,
        copF: null, copBuf: null, cfT: 0, planT: 0, route: null, campI: null,
        // All the desk actually told him: an aisle number. Not a position in it.
        blind: opts.blind !== false, seen: { x: aisleX(dAisle), z: 0 }, seenT: 0,
      };

      let time = 0, done = 0, finalGap = 0, wentBack = false, ducked = false;
      let tBolt = NaN, gapAtBolt = NaN, routeAtBolt = NaN;
      let minGap = Infinity, sumTs = 0, sumCs = 0, nS = 0;
      let gassedT = 0, slowT = 0, boostT = 0, sumCm = 0, sumLat = 0, nLat = 0;
      let sprintT = 0, atCop = null, doorT = NaN, exitUsed = -1;
      const api = {
        onBolt() {}, onHarass() {},
        onCatch() { done = 1; },
        onEscape() {
          done = 2;
          // How far behind he was when the doors ate him. This is THE number.
          finalGap = dist2d(cop.position.x, cop.position.z, thief.position.x, thief.position.z);
        },
      };
      while (time < maxT && !done) {
        tick(dt, botInput(thief, mode, st, dt), api);
        time += dt;
        const g = dist2d(thief.position.x, thief.position.z, cop.position.x, cop.position.z);
        if (!isFinite(tBolt) && thief.bolted) {
          tBolt = time; gapAtBolt = g;
          routeAtBolt = routeLen(thief.position.x, thief.position.z);
        }
        if (thief.bolted && !done) {
          if (g < minGap) minGap = g;
          if (thief.position.z > HALF_LEN - 2.2) wentBack = true;
          if (thief.duck) ducked = true;
          if (cu.speed > T.copWalk + 0.35) sprintT += dt;
          if (thief.state === 'shove' && !isFinite(doorT)) { doorT = time; exitUsed = thief.exitI; }
          // THE BRANCH. Half a second after the bolt, is he running AT the man
          // chasing him or away from him? Round 3's headline was the average of
          // two near-deterministic outcomes -- 449 of 600 came at the cop and
          // 97.1% of those were collected, 151 went out the back and 0 of those
          // were ever caught -- and an average of two foregone conclusions is
          // not a chase. Any headline that does not carry this split is hiding
          // the game.
          if (atCop === null && time - tBolt > 0.5) {
            const m = thief.speed || 1;
            atCop = ((cop.position.x - thief.position.x) * thief.vel.x
                   + (cop.position.z - thief.position.z) * thief.vel.z) / (m * (g || 1)) > 0.15;
          }
          sumTs += thief.speed; sumCs += cu.speed; nS++;
          if (cu.gassed) gassedT += dt;
          if (cu.boost > 0) boostT += dt;
          if (thief.dbgTarget < T.thiefRun * 0.92) slowT += dt;
          sumCm += thief.dbgCorner ?? 1;
          if (Math.abs(cop.position.z) < HALF_LEN) {
            sumLat += Math.abs(cop.position.x - aisleX(aisleOf(cop.position.x))); nLat++;
          }
        }
        if (k === traceK) {
          trace.push([+time.toFixed(3), +g.toFixed(2), +cu.speed.toFixed(2), +thief.speed.toFixed(2),
            thief.state, +cu.stamina.toFixed(2), cu.gassed ? 1 : 0, +cu.boost.toFixed(2),
            +dist2d(thief.position.x, thief.position.z, EXIT.x, EXIT.z).toFixed(2),
            +(thief.dbgTarget ?? 0).toFixed(2), +thief.wind.toFixed(2), thief.path.length,
            +thief.position.x.toFixed(1), +thief.position.z.toFixed(1),
            +cop.position.x.toFixed(1), +cop.position.z.toFixed(1)]);
        }
      }
      R.push({
        done, time, tBolt, gapAtBolt, routeAtBolt, minGap: isFinite(minGap) ? minGap : NaN,
        finalGap, chaseT: time - (isFinite(tBolt) ? tBolt : 0),
        thiefSpd: nS ? sumTs / nS : NaN, copSpd: nS ? sumCs / nS : NaN,
        gassedFrac: nS ? gassedT / (nS * dt) : NaN,
        boostFrac: nS ? boostT / (nS * dt) : NaN,
        slowFrac: nS ? slowT / (nS * dt) : NaN,
        corner: nS ? sumCm / nS : NaN,
        copLat: nLat ? sumLat / nLat : NaN,
        aisle: ai, wentBack, ducked, barged: thief.bargeN > 0,
        atCop: atCop === true, doorT, exitUsed,
        caughtShoving: done === 1 && isFinite(doorT),
        sprintFrac: nS ? sprintT / (nS * dt) : NaN,
        // Starting geometry, so a result can be sliced by how deep in the aisle
        // he was when you walked in on him instead of only pooled.
        z0: tzz, d0: dist2d(txx, tzz, cx0, cz0),
        noBolt: !isFinite(tBolt),
      });
    }

    cop.position.copy(save.pos);
    Object.assign(cop.userData, save.ud);
    reset();

    const caught = R.filter((r) => r.done === 1);
    const esc = R.filter((r) => r.done === 2);
    const stall = R.filter((r) => r.done === 0);
    // ---- THE DISTRIBUTION ---------------------------------------------------
    // Round 3 published a headline catch rate that was the mean of two
    // near-deterministic branches, and the number that mattered -- 61% of
    // catches landing inside one second of the bolt -- was already printing on
    // this object and went unread. Nothing below is optional.
    const bolted = R.filter((r) => !r.noBolt);
    const branch = (f) => {
      const g = bolted.filter(f);
      const c = g.filter((r) => r.done === 1);
      return g.length
        ? `n${g.length} ${Math.round(c.length / g.length * 100)}% med${_f2(_q(c.map((r) => r.chaseT), 0.5))}s`
        : 'n0';
    };
    const res = {
      mode, spawn, bot: opts.bot ?? 'cut', lag: opts.lag ?? 0.16,
      misaim: opts.misaim ?? 0, n, crowd,
      catchRate: +(caught.length / n * 100).toFixed(1),
      escaped: esc.length, stalled: stall.length,
      // Seconds from DISPATCH (not from the bolt) to the grab. If this is ~1s
      // the player never had a chase, whatever the catch rate says.
      catchFromDispatch_median: _f2(_q(caught.map((r) => r.time), 0.5)),
      catchFromDispatch_p10: _f2(_q(caught.map((r) => r.time), 0.1)),
      catchFromDispatch_p90: _f2(_q(caught.map((r) => r.time), 0.9)),
      // THE two branches, each with its own catch rate and its own median. A
      // headline that pools these is hiding whether either one is a chase.
      cameAtCop: branch((r) => r.atCop),
      turnedAway: branch((r) => !r.atCop),
      // Caught with his shoulder on a push-bar: the chase decided AT the door,
      // which before round 4 could not happen because there was no beat there.
      caughtAtDoor: caught.filter((r) => r.caughtShoving).length,
      // Is the shoulder barge inert? Not "how often does it fire" -- round 3
      // asked that and got 7 -- but DOES GETTING THROUGH YOU CHANGE ANYTHING.
      // Compare the chases where he committed to a shoulder and got through
      // against the ones where he committed and you had it covered.
      bargeGot: branch((r) => r.barged),
      bargeStopped: branch((r) => r.ducked && !r.barged),
      reachedDoor: R.filter((r) => isFinite(r.doorT)).length,
      exitSplit: EXITS.map((e, i) =>
        `${e.label}:${R.filter((r) => r.exitUsed === i).length}`).join(' '),
      copSprintFrac: _f2(_mean(R.map((r) => r.sprintFrac).filter(isFinite))),
      // Did he ever use the back of the store? The counterplay, measured.
      outTheBack: R.filter((r) => r.wentBack).length,
      outTheBackCaught: R.filter((r) => r.wentBack && r.done === 1).length,
      // ...and how often he committed to a shoulder and tried to go through you.
      squeezed: R.filter((r) => r.ducked).length,
      // He committed to a shoulder and you were not in front of it.
      barged: R.filter((r) => r.barged).length,
      bargedThenCaught: R.filter((r) => r.barged && r.done === 1).length,
      // Grabbed before he even finished flinching — you landed on top of him.
      caughtStanding: caught.filter((r) => r.noBolt).length,
      // Catch rate sliced by how far away he was when you walked in. Pooling
      // these hides the whole story: walking in on top of him is meant to be a
      // catch, and it is a different event from a chase down the aisle.
      byStartGap: [[0, 3], [3, 6], [6, 10], [10, 16], [16, 99]].map(([a, b]) => {
        const g = R.filter((r) => r.d0 >= a && r.d0 < b);
        return g.length ? `${a}-${b}m n${g.length}:${Math.round(g.filter((r) => r.done === 1).length / g.length * 100)}%` : null;
      }).filter(Boolean).join(' '),
      // how badly the escapes were lost (cop-to-thief separation at the doors)
      missByM_median: _f2(_q(esc.map((r) => r.finalGap), 0.5)),
      missByM_p10: _f2(_q(esc.map((r) => r.finalGap), 0.1)),
      missByM_p90: _f2(_q(esc.map((r) => r.finalGap), 0.9)),
      missByFt_median: _f2(_q(esc.map((r) => r.finalGap), 0.5) * 3.281),
      // closest the cop ever got on an escape — the "barely" number
      minGapM_median: _f2(_q(esc.map((r) => r.minGap), 0.5)),
      // where catches happen: chase seconds from bolt to grab
      catchT_median: _f2(_q(caught.map((r) => r.chaseT), 0.5)),
      catchT_p90: _f2(_q(caught.map((r) => r.chaseT), 0.9)),
      catchUnder1s: caught.filter((r) => r.chaseT < 1.0).length,
      // ...as a percentage of catches, because that is the form the claim takes.
      catchUnder1sPct: caught.length
        ? +(caught.filter((r) => r.chaseT < 1.0).length / caught.length * 100).toFixed(1) : null,
      catchUnder2s: caught.filter((r) => r.chaseT < 2.0).length,
      escT_median: _f2(_q(esc.map((r) => r.chaseT), 0.5)),
      gapAtBolt_median: _f2(_q(R.map((r) => r.gapAtBolt), 0.5)),
      routeAtBolt_median: _f2(_q(R.map((r) => r.routeAtBolt), 0.5)),
      // speeds actually achieved during the bolt
      thiefSpd_mean: _f2(_mean(R.map((r) => r.thiefSpd).filter(isFinite))),
      copSpd_mean: _f2(_mean(R.map((r) => r.copSpd).filter(isFinite))),
      gassedFrac: _f2(_mean(R.map((r) => r.gassedFrac).filter(isFinite))),
      boostFrac: _f2(_mean(R.map((r) => r.boostFrac).filter(isFinite))),
      thiefSlowFrac: _f2(_mean(R.map((r) => r.slowFrac).filter(isFinite))),
      cornerMul: _f2(_mean(R.map((r) => r.corner).filter(isFinite))),
      copLat_mean: _f2(_mean(R.map((r) => r.copLat).filter(isFinite))),
    };
    if (opts.raw) res.raw = R;
    if (traceK >= 0) res.trace = trace;
    return res;
  }

  // Every scenario is measured FROM THE REAL SPAWN unless you say otherwise.
  function benchAll(n = 200, opts = {}) {
    return [
      bench({ ...opts, n, mode: 'none' }),
      bench({ ...opts, n, mode: 'ignore' }),
      bench({ ...opts, n, mode: 'pickup' }),
      bench({ ...opts, n, mode: 'boost' }),
    ];
  }
  // Compact one-line summary for sweeps.
  const fmt = (r) => `${r.mode}${r.misaim ? `/off${r.misaim}` : ''}:${r.catchRate}%`
    + ` t${r.catchFromDispatch_median}s <1s ${r.catchUnder1sPct}%`
    + ` | atCop ${r.cameAtCop} | away ${r.turnedAway}`
    + ` | door ${r.caughtAtDoor}/${r.reachedDoor} miss${r.missByM_median}m`;
  function benchLine(n = 200, opts = {}) {
    return benchAll(n, opts).map(fmt).join('  |  ');
  }
  // THE report, all from postSpawn('aisle'), all with the distribution attached.
  function benchReal(n = 200, opts = {}) {
    const o = { ...opts, n, spawn: 'aisle' };
    return {
      noPowerup:   fmt(bench({ ...o, mode: 'none' })),
      canGrabOne:  fmt(bench({ ...o, mode: 'pickup' })),
      boostInHand: fmt(bench({ ...o, mode: 'boost' })),
      wrongBy1:    fmt(bench({ ...o, mode: 'none', misaim: 1 })),
      wrongBy2:    fmt(bench({ ...o, mode: 'none', misaim: 2 })),
      wrongBy4:    fmt(bench({ ...o, mode: 'none', misaim: 4 })),
      fromFrontEnd: fmt(bench({ ...o, mode: 'none', spawn: 'front' })),
      legacyBehind: fmt(bench({ ...o, mode: 'none', spawn: 'behind' })),
    };
  }
  // IS THE DISPATCH WORTH READING? The one question the desk phase lives or
  // dies on. A door-camping bot that throws the aisle number away, against a
  // bot that goes and uses it, at every misaim the player can be off by. If the
  // camper wins, the monitors are decoration.
  function benchCamp(n = 200, opts = {}) {
    const o = { ...opts, n, spawn: 'aisle', mode: 'none' };
    const row = (bot) => [0, 1, 2, 4].map((m) => {
      const r = bench({ ...o, bot, misaim: m });
      return `off${m}:${r.catchRate}%`;
    }).join(' ');
    return { cut: row('cut'), chase: row('chase'), camp: row('camp') };
  }

  return {
    cop, shoppers, powerups, reset,
    update: tick,
    bench, benchAll, benchLine, benchReal, benchCamp,
    // debug handles
    // game.js counts down the door alarm off a thief's speed. TUNING.thiefRun is
    // his opening ceiling, not his cruise — use these instead so the ETA is true.
    thiefCruise: () => T.thiefRun * K.thiefTired,
    thiefTop: () => T.thiefRun * K.thiefPanic,
    get nav() { return nav; }, get exitField() { return exitF; }, toExit,
    // ROUND 4 CONTRACT ADDITION (additive; nothing that ignores it breaks).
    // There are now TWO ways out of this store — see EXIT_SPEC. Anything that
    // measures a thief against config's EXIT is measuring him against one of
    // them. game.js's updateAlarm() already routes through toExit() and is
    // correct as written; the floor HUD's f.exitDist and stallWatch()'s
    // progress test are still straight lines to Door 1 and want exitDistOf().
    get exits() { return EXITS; },
    exitOf: (x, z) => exitOf(x, z),
    useDoors(k) { doorLimit = k == null ? 99 : k; buildExits(); return EXITS.length; },
    exitDistOf: (s) => exitOf(s.position.x, s.position.z).dist,
    get escapeField() { return escapeField(); }, get fleeBuilds() { return fleeBuilds; },
    rebuildNav() {
      nav = buildNav(); buildExits();
      fleeF = null; fleeBuf = null; fleeT = 0; fleeCx = fleeCz = 1e9;
    },
    tuning: T, K,
    get thieves() { return shoppers.filter((s) => s.guilty); },
  };
}
