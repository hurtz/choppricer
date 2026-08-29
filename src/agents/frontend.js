// OWNER: builder-agents. THE FRONT END — THE PEOPLE, NOT THE PLACE.
//
//   makeFrontEnd(THREE, scene, F, world, opt) -> {
//     ok, why, count, update(dt), bodies, anchors, dispose()
//   }
//
// store.js round 17 built the checkstands and the service desk and — the part
// that made this possible in one round instead of two — exported every place a
// body belongs as `world.frontEnd`. Where a cashier stands is a fact about the
// checkstand's geometry, so the checkstand owns it. Nothing in this file
// contains a front-of-store coordinate; if a lane moves 200 mm the people move
// with it, and if the table is not there this returns `{ ok: false }` and the
// game is exactly what it was.
//
// ===========================================================================
// THE RULE THAT MAKES THIS FREE, AND IT IS THE CHILD'S RULE ONE LEVEL UP
// ===========================================================================
// Round 9 added children to a tuned simulation and proved the bench was
// byte-identical, because a child is FURNITURE THAT FOLLOWS: not in `shoppers`,
// no guilt, no nav, and — the load-bearing one — NO DRAW OFF THE SHARED SEEDED
// RNG. Every number in agents.js's header was measured against one stream, and
// CLAUDE.md records that merely swapping a rolled call site for a named one
// once moved a published likelihood ratio from 1.95 to 2.33 without touching a
// probability anywhere.
//
// Up to eleven more bodies — seven ship — is a much bigger thing to add than
// four children, so the rule is enforced HARDER rather than merely honoured:
//
//   1. THIS FILE HAS ITS OWN GENERATOR. `rnd()` below is a private LCG seeded
//      from a constant. There is no code path from here to agents.js's rnd(),
//      so the claim is not "I was careful about draws", it is "the two streams
//      are different objects". A cashier cannot walk the chase stream by
//      construction, which is a property somebody can check in ten seconds
//      rather than a promise they have to trust.
//   2. NOBODY IS IN `shoppers`. No guilt lottery, no separation constraint, no
//      nav field, no entry in any of the fifteen loops in agents.js.
//   3. NOTHING READS THEM BACK. They are strictly downstream of the world, the
//      same as a child: they read `world.frontEnd` and a clock, and no other
//      file in this game asks them a question.
//   4. NO COLLIDER, and this one is a TRADE rather than a win — see THE ONE
//      THING THIS DOES NOT DO, at the bottom.
//
// ===========================================================================
// WHAT THEY ACTUALLY DO, AND WHY IT IS A LOOP AND NOT A STATE MACHINE
// ===========================================================================
// The client: "we need to see a bit more cashier customer service activity. It
// makes it feel a bit more like an actual functional grocery store."
//
// The thing that makes a checkout read as a checkout from thirty metres is not
// a person standing at a register. It is the RHYTHM: one arm going out to the
// belt, across, and down to the bag, about every second and a half, over and
// over, with a longer pause every eight or so items while somebody pays. That
// is a periodic signal, and a periodic signal is the one kind of animation that
// survives being 40 px tall on a monitor tile — the same argument round 9 made
// for a child's doubled cadence.
//
// So every body here is driven by ONE PHASE CLOCK and a small table of
// keyframes, with a per-body period and offset drawn once at construction. No
// state machine, no transitions, and exactly ONE body ever looks at another —
// a customer reads whether his own cashier is taking payment, so a lane reads
// as one transaction rather than as two people animating near each other. It is
// a read in one direction and it cannot get out of sync.
//
// A queue that genuinely shuffled forward when the person in front paid would
// be a coordination problem between seven objects; a queue whose members are
// all on the same slow clock with different offsets looks the same from any
// distance this is ever seen at and cannot deadlock.
//
// ===========================================================================
// THE COST, STATED BEFORE THE FEATURE IS DEFENDED
// ===========================================================================
// A shopper rig is 10-12 meshes and this adds `opt.count` bodies, default 7.
//
// AND THE FIRST DRAFT OF THIS PARAGRAPH WAS WRONG, WHICH IS WHY IT IS MEASURED.
// It said "three.js frustum-culls per mesh, so an aisle pose pays nothing at
// all for them". Measured, same run, `setVisible` toggled between two renders
// on a byte-identical scene:
//
//                       draw calls          triangles
//   mid-aisle camera    284 -> 393  (+109)  2,597,290 -> 2,625,330  (+28,040)
//   front-end camera     76 -> 137  (+61)   1,256,552 -> 1,272,088  (+15,536)
//
// The aisle pose pays MORE than the front-end pose, not less, and the reason is
// obvious the moment you look at one: every aisle in this store runs north to
// south and every down-aisle shot has the front wall at the end of it. There is
// no pose in this game that is judged on its aisles and does not contain the
// checkouts. Frustum culling was never going to help.
//
// So the number is a budget decision. Seven bodies is about 85 calls. The
// triangles are noise (+1% on a 2.6 M scene); the CALLS are the cost, and they
// are paid on every one of the ten renders whose camera can see the front wall.
//
// TWO LEVERS, and the second one is deliberately NOT taken:
//   - `TUNING.frontEndCount` / `opt.count`, and the roster below is in priority
//     order so cutting it cuts from the back.
//   - `frontEnd.setVisible(false)` from a distance gate. Available, exposed,
//     and not used: the cop's own position is the only distance this file can
//     see, and a hard cut at any radius makes seven people appear at once in a
//     shot that already contained the wall behind them. A pop that size is
//     worse than the calls. If somebody wants it, it wants a fade, and a fade
//     wants a material this feature does not otherwise need.
// ===========================================================================

import { makePerson, rollPerson } from './figures.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// A PRIVATE GENERATOR. See rule 1 above: this is the whole anti-drift argument
// and it is four lines. Same xorshift agents.js uses, so a body rolled here is
// distributed like a body rolled there — it is only the STREAM that differs.
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const rnd = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  return {
    rnd,
    rr: (a, b) => a + rnd() * (b - a),
    ri: (a, b) => Math.floor(a + rnd() * (b - a + 1)),
    pick: (arr) => arr[Math.floor(rnd() * arr.length) % arr.length],
  };
}

// Ease a 0..1 into a smoothstep. Every beat below uses it, for the same reason
// applyGesture does: five straight lines between five keys reads as a machine.
const ease = (f) => f * f * (3 - 2 * f);
// Triangle wave 0->1->0 over u in 0..1, eased. This is the shape of every
// reach-and-return in the file.
const swing = (u) => ease(u < 0.5 ? u * 2 : (1 - u) * 2);

// ---------------------------------------------------------------------------
// THE ROLES
// ---------------------------------------------------------------------------
// Each is a function (r, p, b) where `r` is the rig, `p` is the body's phase in
// 0..1 through its own cycle, and `b` is the body record. They write joint
// rotations and nothing else — no positions, no world state.
//
// The pose vocabulary is deliberately the same as animateShopper's, down to the
// sign conventions: arm rotation.x is -0.95 at a cart bar, -1.55 at chest
// height, -2.20 at the shoulder; rotation.z splays the arm away from the body.
// A future round that wants a cashier to hand something to a shopper should be
// able to move a number from one file to the other and have it mean the same
// thing.
//
// ===========================================================================
// ROUND 6 (character) — AND THE ELBOW, WHICH IS THE WHOLE POINT OF THESE SEVEN
// ===========================================================================
// figures.js grew a real joint in round 5 and agents.js drove it on fourteen
// shoppers and the cop. It did not reach here or the children, and round 5 said
// so in its own close-out: "the child rig has the joint and nothing drives it
// ... same for the front-end staff." So eleven bodies were left rendering at
// ELB0 — 154.2 degrees, a straight arm — standing next to fifteen whose arms
// bend. That is worse than before the joint existed, because a difference is
// what the eye finds and a uniform stiffness is not.
//
// THESE SEVEN MATTER MORE THAN THEIR NUMBER SUGGESTS: they are the only people
// in the game the player ever sees STANDING STILL AND DOING A JOB. Everybody
// else is walking, and a walking arm can get away with being nearly straight.
// A cashier's cannot — the reference set is unusually good on exactly this
// posture, and unanimous:
//
//   ppl_00  the standing cashier in blue works with her forearms UP, the near
//           one folded to somewhere around a right angle over the belt, and the
//           second cashier at the register has both arms in about the same
//           place on the keys.
//   ppl_01  the seated cashier in orange, both forearms up over the counter,
//           the working arm around 100 degrees and the other closer still.
//   ppl_06  the child pushing the basket wagon is the counter-example and it is
//           in here on purpose: HIS arms are nearly straight, because he is
//           braced against something heavier than he is and his trunk is behind
//           it. A round that bends every elbow it can find would have got that
//           one backwards. Straight is right when a body is PUSHING.
//
// (Angles read off 2D photographs with foreshortening in them: the BAND is the
// claim — everybody handling goods sits inside ELB_HANDLING's 60-110 — and no
// single degree here is defended.)
//
// So every pose below authors both elbows, in the same units decoy.js uses:
// interior angle in radians, smaller is more bent. The numbers are named
// against agents.js's EL table where one fits, rather than being a third
// private vocabulary. The numbers are NOT imported: this file's whole
// construction argument is that it shares no mutable state with agents.js, and
// a table of constants would be the first thread across. They are quoted.

// SCANNING. The single most important animation in this file, because it is the
// one the client asked for by name and the only one with a period short enough
// to read as WORK rather than as idling.
//
//   0.00-0.30  right hand out and down to the belt, body turned to it
//   0.30-0.55  lift, and the sweep begins — the hand crosses the body
//   0.55-0.80  across the scanner window and away to the bag well
//   0.80-1.00  back to the belt, left hand steadies the next one
//
// The lateral sweep is the read. A vertical pick-and-place is a person fidgeting;
// a hand travelling ACROSS the body at counter height, once a second and a half,
// is a person scanning groceries, and it is the same signal whether you can see
// the item or not.
function poseScan(r, p) {
  const u = p;
  // The reach out. armRz swings from outboard (at the belt) through the body
  // centre (over the scanner) to inboard (over the bag well).
  const across = ease(clamp((u - 0.28) / 0.52, 0, 1));      // 0 at the belt, 1 at the bag
  const lift = swing(clamp((u - 0.10) / 0.80, 0, 1));
  r.armR.rotation.x = -1.28 - lift * 0.34;
  r.armR.rotation.z = lerp(-0.62, 0.52, across);
  // ROUND 6 — the working elbow, and it is the read. Out at the belt the arm is
  // most open (100 deg); across the scanner and down into the bag well it folds
  // to 74, which is where both reference cashiers sit. `lift` closes it a
  // little further at the top of the arc, because you bring an item IN to pass
  // it over the window rather than swinging it round on a straight arm.
  r.setElbow(-1, lerp(1.75, 1.30, across) - lift * 0.10);
  // The left hand hovers at the belt, steadying the next item, and dips as the
  // right one comes back for it.
  r.armL.rotation.x = -1.05 - (1 - across) * 0.30;
  r.armL.rotation.z = 0.30 + (1 - across) * 0.16;
  r.setElbow(1, lerp(1.44, 1.62, across));
  // Head follows the hand, but lags it — you look at the scanner, not at your
  // own arm — so the neck yaw uses `across` at 0.7 amplitude and a beat late.
  r.neck.rotation.y = lerp(0.34, -0.26, ease(clamp((u - 0.34) / 0.50, 0, 1)));
  r.neck.rotation.x = 0.26 - lift * 0.12;
  r.chest.rotation.y = lerp(0.16, -0.14, across);
  r.chest.rotation.x = r.stoop + 0.12 - lift * 0.05;
  r.hips.rotation.y = lerp(0.06, -0.05, across);
}

// PAYING. The longer beat, every `payEvery` items. Hands come off the belt, one
// goes to the register keypad, he looks UP at the customer for the first time,
// and there is a hold. On the wall this is the thing that makes the lane look
// like it has a person in it rather than a machine: the rhythm stops.
function posePay(r, p) {
  const up = ease(clamp(p / 0.22, 0, 1));
  const down = ease(clamp((p - 0.78) / 0.22, 0, 1));
  const k = up * (1 - down);
  r.armR.rotation.x = lerp(-1.28, -1.58, k);
  r.armR.rotation.z = lerp(-0.62, -0.10, k);
  r.armL.rotation.x = lerp(-1.05, -1.34, k);
  r.armL.rotation.z = lerp(0.30, 0.20, k);
  // Hands off the belt and onto the keypad: both elbows come in and stay there
  // for the length of the beat. This is the most closed either arm gets in the
  // file and it is correct — a hand on a register keyboard is a hand held at
  // the sternum. EL.read is 1.46 on the adults; the working arm goes past it.
  r.setElbow(-1, lerp(1.75, 1.34, k));
  r.setElbow(1, lerp(1.44, 1.40, k));
  // ...and he says something. A slow nod at 0.9 Hz, which at this distance is
  // "talking" and at any distance is not a machine.
  const nod = Math.sin(p * TAU * 2.4) * 0.06 * k;
  r.neck.rotation.x = lerp(0.26, -0.06, k) + nod;
  r.neck.rotation.y = lerp(-0.26, 0.10, k);
  r.chest.rotation.y = lerp(-0.14, 0.06, k);
  r.chest.rotation.x = r.stoop + lerp(0.12, 0.02, k);
  r.hips.rotation.y = 0;
}

// UNLOADING A CART ONTO THE BELT. The customer's half of the same rhythm, one
// beat out of phase with the cashier's and slower, because taking things out of
// a trolley is slower than scanning them.
//
//   0.00-0.40  bend, reach DOWN and back into the cart
//   0.40-0.75  up and forward, put it on the belt
//   0.75-1.00  straighten
// The bend is the read here rather than the reach: a body that folds 25 degrees
// at the waist and comes back up, over and over, is somebody unloading a
// trolley, and the torso is a far bigger shape than an arm.
function poseUnload(r, p) {
  const dip = swing(clamp(p / 0.72, 0, 1));
  const out = ease(clamp((p - 0.36) / 0.40, 0, 1));
  r.chest.rotation.x = r.stoop + dip * 0.44;
  r.hips.rotation.x = dip * 0.10;
  r.armR.rotation.x = lerp(-0.75, -1.42, out) - dip * 0.42;
  r.armR.rotation.z = lerp(-0.36, 0.08, out);
  r.armL.rotation.x = lerp(-0.70, -1.10, out * 0.6) - dip * 0.30;
  r.armL.rotation.z = 0.28;
  // ROUND 6 — AND THIS IS THE ONE THAT STAYS OPEN, which is why the whole file
  // is not a single constant. Reaching DOWN into a trolley is the one moment at
  // a checkout where an arm is near full stretch: the dip has him folded at the
  // waist with the arm extended into the basket (2.28, i.e. 131 deg), and the
  // elbow only closes as he lifts the item up onto the belt (1.55, 89). It is
  // the reverse of the cashier's cycle and it is what makes the two bodies in a
  // lane read as two different jobs rather than as one animation twice.
  r.setElbow(-1, lerp(2.28, 1.55, out));
  r.setElbow(1, lerp(2.32, 1.90, out * 0.6));
  r.neck.rotation.x = 0.18 + dip * 0.30 - out * 0.34;
  r.neck.rotation.y = lerp(-0.30, 0.22, out);
  r.chest.rotation.y = lerp(-0.12, 0.10, out);
}

// WAITING TO PAY. What the customer does during the cashier's pay beat: stands
// up, fishes for a card, holds it out, waits. The hold is most of it.
function poseWait(r, p) {
  const reach = ease(clamp((p - 0.10) / 0.20, 0, 1)) * (1 - ease(clamp((p - 0.80) / 0.20, 0, 1)));
  r.chest.rotation.x = r.stoop + 0.04;
  r.hips.rotation.x = 0;
  r.armR.rotation.x = lerp(-0.86, -1.46, reach);
  r.armR.rotation.z = lerp(-0.14, 0.06, reach);
  r.armL.rotation.x = -0.80;
  r.armL.rotation.z = 0.20;
  // Fishing a card out and holding it up: the elbow closes to bring the hand to
  // the body and then OPENS as the card goes across the counter, which is the
  // opposite of what an arm-only version of this pose does. The idle arm hangs
  // at the adults' EL.hang.
  r.setElbow(-1, lerp(2.30, 1.62, reach));
  r.setElbow(1, 2.52);
  r.neck.rotation.x = 0.06;
  r.neck.rotation.y = Math.sin(p * TAU * 0.6) * 0.16;
  r.chest.rotation.y = 0;
}

// BAGGING. Both hands down and across into the bag well, on a shorter cycle
// than the cashier's — a bagger is always behind.
function poseBag(r, p) {
  const d = swing(p);
  const side = ease(clamp((p - 0.30) / 0.45, 0, 1));
  r.chest.rotation.x = r.stoop + 0.22 + d * 0.16;
  r.armR.rotation.x = -1.14 - d * 0.40;
  r.armR.rotation.z = lerp(-0.28, 0.30, side);
  r.armL.rotation.x = -1.06 - d * 0.34;
  r.armL.rotation.z = lerp(0.34, -0.10, side);
  // Both hands working in a bag well below the counter line: forearms down and
  // in, elbows around 80-90 and closing on the dip, which is the moment the
  // hands are deepest in the bag. A bagger is the most CLOSED body in the file
  // and it is the pose the reference shows twice (ppl_00's bagged goods, ppl_01
  // handing a loaf across).
  r.setElbow(-1, 1.58 - d * 0.22);
  r.setElbow(1, 1.50 - d * 0.20);
  r.neck.rotation.x = 0.34 - d * 0.08;
  r.neck.rotation.y = lerp(0.18, -0.20, side);
  r.chest.rotation.y = lerp(0.10, -0.10, side);
}

// THE SERVICE DESK. A clerk does one of two things and neither of them is
// interesting, which is correct: they are typing at a terminal, or they are
// handing something across the counter. The hand-over is the beat that reads,
// because an arm crossing the counter line is the only thing at that desk that
// changes the silhouette.
function poseClerk(r, p) {
  const hand = ease(clamp((p - 0.55) / 0.18, 0, 1)) * (1 - ease(clamp((p - 0.82) / 0.18, 0, 1)));
  const type = Math.sin(p * TAU * 6.0);
  r.chest.rotation.x = r.stoop + 0.16 - hand * 0.06;
  r.armR.rotation.x = lerp(-1.30 + type * 0.05, -1.62, hand);
  r.armR.rotation.z = lerp(-0.16, 0.10, hand);
  r.armL.rotation.x = -1.26 - type * 0.05;
  r.armL.rotation.z = 0.18;
  // Typing is a folded arm — forearms level with the desk, elbows near a right
  // angle — and the hand-over EXTENDS one of them across the counter, which is
  // the only thing at that desk that changes a silhouette. The 6 Hz `type`
  // wobble goes on the joint as well as the shoulder, at a tenth of the
  // amplitude: at this distance it is the forearm that is visible and the
  // upper arm that is not.
  r.setElbow(-1, lerp(1.46 + type * 0.04, 2.10, hand));
  r.setElbow(1, 1.42 - type * 0.04);
  r.neck.rotation.x = lerp(0.30, 0.02, hand);
  r.neck.rotation.y = lerp(-0.14, 0.10, hand);
  r.chest.rotation.y = hand * 0.10;
}

// STANDING IN A QUEUE. Weight shifts foot to foot, and every so often the head
// goes up and along the line. Deliberately the dullest thing in the file: a
// queue that is doing something is not a queue.
function poseQueue(r, p) {
  const shift = Math.sin(p * TAU);
  const look = Math.sin(p * TAU * 0.5 + 1.1);
  // ROUND 11 — the shift is ON TOP OF a parked weight side, not centred on
  // attention. Seven people in a queue all rocking symmetrically about the
  // midline is the same clone tell the aisle had; the rest angles are rolled
  // per body in figures.js and are the same ones animateShopper adds.
  r.hips.rotation.z = shift * 0.045 + r.rest.hipZ;
  r.hips.position.y = r.hipY - Math.abs(shift) * 0.008;
  r.chest.rotation.z = -shift * 0.030 + r.rest.chestZ;
  r.chest.rotation.x = r.stoop + 0.06;
  r.armR.rotation.x = -0.92 + shift * 0.05;
  r.armR.rotation.z = -0.16 + r.rest.splayR;
  r.armL.rotation.x = -0.94 - shift * 0.05;
  r.armL.rotation.z = 0.16 + r.rest.splayL;
  // ROUND 6 — the dullest elbow in the file, and PER BODY. Standing in a queue
  // is a hanging arm (EL.hang, 150 deg), but seven hanging arms at one number
  // is the identical clone tell this function's own note describes for the
  // weight shift — and it is worse on the elbow, because a queue is the one
  // place several of these bodies are in frame at once. `b.elbRest` is rolled
  // once, off THIS FILE's private generator, so the variety costs agents.js no
  // draw. The shift opens and closes them a few degrees out of phase with each
  // other, which is what a bored body does.
  r.setElbow(-1, r.feElbRest + shift * 0.10);
  r.setElbow(1, r.feElbRest - 0.06 - shift * 0.08);
  r.neck.rotation.y = look * 0.40;
  r.neck.rotation.x = 0.06 - Math.max(0, look) * 0.10;
}

// ---------------------------------------------------------------------------
// THE ROSTER
// ---------------------------------------------------------------------------
// Priority order, and `opt.count` cuts from the BACK. A store with three
// staffed lanes and nobody at the desk reads as a quiet Tuesday; a store with a
// queue and no cashier reads as broken.
// THE ORDER IS THE CLIENT'S SENTENCE, NOT THE STORE'S LAYOUT. He named two
// things — "a fully functional checkout AND customer service" — so one staffed
// lane and one staffed desk come before a second lane, and every body after
// those four is dressing. Cutting `count` cuts from the back.
const ROLES = [
  'cashier', 'customer',          // 1-2  one lane actually working
  'clerk', 'deskCustomer',        // 3-4  ...and the service desk
  'cashier', 'customer',          // 5-6  a second lane
  'bagger',                       // 7    somebody at the bag well
  'cashier', 'customer',          // 8-9  a third lane
  'queue', 'queue',               // 10-11 people waiting
];

export function makeFrontEnd(THREE, scene, F, world, opt = {}) {
  const fe = (world && world.frontEnd)
    || (scene && scene.userData && scene.userData.chopFrontEnd);
  if (!fe || !Array.isArray(fe.lanes) || !fe.lanes.length) {
    return { ok: false, why: 'no world.frontEnd', count: 0, bodies: [], update() {}, dispose() {} };
  }
  const rng = makeRng(opt.seed ?? 0x5E4D0C);
  // SEVEN, AND THE NUMBER IS A BUDGET DECISION RATHER THAN A TASTE ONE. Each
  // body is 10-12 meshes, and the aisle poses this game is judged on look
  // straight down a lane at the front wall, so the front end is IN FRAME from
  // most of the store — measured, +109 draw calls and +28,040 triangles at
  // nine bodies from a mid-aisle camera. Seven puts a staffed lane, a staffed
  // desk, a second lane and a bagger on the floor for about 85 calls. The
  // ledger and the lever are both in this round's report; raise it with
  // TUNING.frontEndCount when somebody has measured the frame and wants more.
  const want = clamp(opt.count ?? 7, 0, ROLES.length);
  const open = fe.lanes.filter((L) => L && L.open !== false);
  const lanes = open.length ? open : fe.lanes;
  const desk = fe.desk;

  const bodies = [];
  let laneI = 0, cashierLane = null;

  // Which lane a role belongs to. Cashier/customer/bagger come in lane order,
  // spread across the run rather than bunched at one end: three staffed lanes
  // 3.34 m apart look like a shift change, three staffed lanes 10 m apart look
  // like a store.
  const stride = Math.max(1, Math.floor(lanes.length / 3));

  const place = (role) => {
    let anchor = null, pose = null, period = 1, till = null;
    if (role === 'cashier') {
      cashierLane = lanes[(laneI * stride) % lanes.length];
      laneI++;
      anchor = cashierLane.cashier; pose = 'scan'; period = rng.rr(1.30, 1.80);
    } else if (role === 'customer') {
      const L = cashierLane || lanes[0];
      anchor = L.customer; pose = 'unload'; period = rng.rr(1.90, 2.60);
      // ...and he is served by the cashier that was placed immediately before
      // him. See `drive`: this is the ONE coupling in the file and it is a
      // READ of the cashier's own clock, not a message between two objects.
      till = bodies[bodies.length - 1] || null;
    } else if (role === 'bagger') {
      const L = lanes[0];
      anchor = L.bagger; pose = 'bag'; period = rng.rr(1.05, 1.45);
    } else if (role === 'clerk') {
      anchor = desk && desk.clerks && desk.clerks[0]; pose = 'clerk'; period = rng.rr(5.0, 7.0);
    } else if (role === 'deskCustomer') {
      anchor = desk && desk.customers && desk.customers[0]; pose = 'queue'; period = rng.rr(4.0, 6.0);
    } else if (role === 'queue') {
      const L = lanes[(laneI * stride) % lanes.length] || lanes[0];
      const q = L.queue;
      if (q) {
        const slot = bodies.filter((b) => b.role === 'queue').length + 1;
        anchor = {
          x: q.x + (q.dir ? q.dir[0] : 0) * q.pitch * slot,
          z: q.z + (q.dir ? q.dir[1] : 1) * q.pitch * slot,
          face: [-(q.dir ? q.dir[0] : 0), -(q.dir ? q.dir[1] : 1)],
        };
      }
      pose = 'queue'; period = rng.rr(3.2, 5.4);
    }
    if (!anchor || !isFinite(anchor.x) || !isFinite(anchor.z)) return null;

    // The body itself. rollPerson takes a generator object; it gets MINE, which
    // is the whole of rule 1 — the same roller, a different stream.
    const person = rollPerson(rng);
    // Nobody working a till has a child in tow. It is also 7 meshes and a
    // follow controller this file has no anchor for, so it comes off here
    // rather than being rolled away, which would move this stream instead.
    person.kid = null;
    const rig = makePerson(THREE, F, person);
    // ROUND 6 — a resting elbow per body, rolled HERE. `rest` in figures.js
    // carries this body's hip roll and arm splay and is rolled inside
    // rollPerson, i.e. on whichever stream rolled the person; adding a field to
    // it would have taken a draw off agents.js's shared seeded generator for
    // every shopper in the store, and CLAUDE.md records that a single extra
    // draw moved a published likelihood ratio from 1.95 to 2.33. So it is one
    // more number off the private LCG, on the rig, written once.
    // 2.44-2.62 rad is 140-150 degrees: a hanging arm, with the spread real
    // people have and this file did not.
    rig.feElbRest = rng.rr(2.44, 2.62);
    rig.root.position.set(anchor.x, 0, anchor.z);
    const f = anchor.face || [0, 1];
    rig.root.rotation.y = Math.atan2(f[0], f[1]);
    scene.add(rig.root);

    const b = {
      role, rig, pose, period, till,
      // Phase offset, so eleven people on similar clocks are not one animation
      // playing eleven times. This is the same failure the round-9 idle pool
      // was built to fix, arriving in a different file.
      t: rng.rr(0, 12),
      // How many items between pay beats, and how long a pay beat runs.
      payEvery: rng.ri(6, 11), payFor: rng.rr(3.2, 5.0),
      anchor,
    };
    bodies.push(b);
    return b;
  };

  for (let i = 0; i < want; i++) place(ROLES[i]);

  // A body's own clock decides everything it does. `scanned` counts items and
  // rolls over into a pay beat, and the CUSTOMER at the same lane reads the
  // cashier's beat rather than keeping its own — the one place two bodies are
  // coupled, and it is a read, not a message.
  function drive(b, dt) {
    b.t += dt;
    const r = b.rig;
    if (b.pose === 'scan' || b.pose === 'unload') {
      // One cycle per item, with a pay beat every payEvery items. The whole
      // schedule is a function of b.t, so it never accumulates error and a body
      // that was off-screen for a minute comes back mid-shift rather than
      // mid-frame-one.
      const block = b.period * b.payEvery + b.payFor;
      const inBlock = b.t % block;
      b.paying = inBlock >= b.period * b.payEvery;
      // THE ONE PLACE TWO BODIES TALK, AND IT IS A READ. A customer whose
      // cashier is taking payment stops unloading and stands there with a card
      // out; a cashier does not wait on anybody. One direction, no messages, no
      // state to get out of sync — and it is what turns two people animating
      // near each other into one transaction. `till` is null on a customer
      // whose lane has no cashier (a low `count`), and then he simply unloads
      // forever, which is what an abandoned trolley of shopping looks like.
      const paying = b.till ? b.till.paying : b.paying;
      if (paying) {
        const src2 = b.till || b;
        const p = clamp((src2.t % (src2.period * src2.payEvery + src2.payFor)
          - src2.period * src2.payEvery) / src2.payFor, 0, 1);
        if (b.pose === 'scan') posePay(r, p); else poseWait(r, p);
      } else {
        const p = (inBlock % b.period) / b.period;
        if (b.pose === 'scan') poseScan(r, p); else poseUnload(r, p);
      }
    } else if (b.pose === 'bag') {
      poseBag(r, (b.t % b.period) / b.period);
    } else if (b.pose === 'clerk') {
      poseClerk(r, (b.t % b.period) / b.period);
    } else {
      poseQueue(r, (b.t % b.period) / b.period);
    }
    // Breathing, on everybody, for the same one lerp animateShopper spends it
    // on: a body that is perfectly still at 40 px is a mannequin and a body
    // that is not is a person.
    r.chest.scale.y = 1 + Math.sin(b.t * 0.62) * 0.010;
  }

  return {
    ok: true,
    count: bodies.length,
    bodies,
    lanes: lanes.length,
    anchors: fe,
    // Rough mesh count, for the budget line in a report. The real figure comes
    // off a probe render; this is what was ADDED.
    meshes: (() => { let n = 0; bodies.forEach((b) => b.rig.root.traverse((o) => { if (o.isMesh) n++; })); return n; })(),
    update(dt) {
      if (!(dt > 0)) return;
      for (const b of bodies) drive(b, dt);
    },
    // Debug: freeze or hide the whole front end in one call, so a capture that
    // wants the store on its own can have it without naming eleven objects.
    setVisible(v) { for (const b of bodies) b.rig.root.visible = !!v; },
    dispose() {
      for (const b of bodies) {
        scene.remove(b.rig.root);
        b.rig.root.traverse((o) => { if (o.isMesh && o.material && o.material.dispose) o.material.dispose(); });
      }
      bodies.length = 0;
    },
  };
}

// ===========================================================================
// THE ONE THING THIS DOES NOT DO, STATED PLAINLY
// ===========================================================================
// NOBODY HERE HAS A COLLIDER, so a fleeing thief runs through them. That is the
// same defect the client reported about the children this round and it is
// deliberately reproduced, because the alternative is worse: eleven bodies with
// colliders standing across the front of the store would change the chase, and
// the chase is what this round was told not to move.
//
// It is also much less visible than the child version was, and the reason is
// geometry rather than luck. store.js's own note on the checkout block says the
// stands were shortened so the RUNWAY south of them is clear — a fleeing man
// takes the runway or the front walkway, and every body in here stands either
// BEHIND a checkstand (cashier, bagger, clerk) or in the 0.9 m strip on the
// customer side of one. The queue is the exception and it is why `queue` is
// last in the roster.
//
// The fix, when somebody wants it, is NOT to give these bodies colliders in
// agents.js — that is a chase change and it has to be measured as one. It is to
// hand store.js the occupied anchors so the front end's own collider set
// carries them, which keeps the nav grid and the collision resolver reading one
// list. That is a store-side change and a chase re-bench, i.e. its own round.
