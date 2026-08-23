// OWNER: builder-agents. THE DECOY LIBRARY — every reach-with-an-object in the
// store, guilty and innocent, drawn by ONE function.
//
//   GESTURES              the table. Each entry is a keyframed clip.
//   pickGesture(rng, k)   roll one of a kind: 'steal' | 'decoy' | 'putback'
//   applyGesture(o, g, u) sample clip `g` at u in 0..1 -> a pose object
//   POSE                  the neutral pose, for reference
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS, AND WHY IT IS NOT IN agents.js
//
// The CCTV builder made the monitors genuinely readable this round — a spot
// monitor you can watch an arm move on, and it captured a five-frame
// concealment: item out, raised to shoulder, at chest, gone, hands back on the
// cart. Then it flagged the hole, against its own interest:
//
//   "The analytics verdict is identical — both boxed, both STOPPED, both a
//    person at a cart. But the footage is not ambiguous, because agents.js has
//    no innocent behaviour that produces a reach-with-an-object. Innocents
//    never generate a false positive at the picture level."
//
// That is the whole game, lost. If a legible picture is a PROOF, the desk phase
// is a spotting exercise with no risk in it, the harassment complaint can never
// fire on a reasonable read, and BEHAVIOUR_TRAP in game.js — an innocent whose
// TEXT keeps flagging — is a lie the roster tells that the footage contradicts.
//
// The fix is not a louder tell. It is that innocent people, on camera, in a
// discount grocery store, constantly do the thing. They take a phone out of a
// hip pocket, raise it, and put it back. They dig a wallet out of a bag at
// chest height. They take a box off the shelf, turn away from the light to read
// the back of it, and put it in a coat pocket to free a hand. They hand
// something down to a child who is below the frame line, and the item never
// comes back. Every one of those is: object appears, object rises to chest,
// object is gone, hands return to the cart. THAT IS THE CONCEALMENT, FRAME FOR
// FRAME.
//
// So it is one table, and the steal is IN IT. `conceal` is entry zero and it is
// sampled by the same `applyGesture` the decoys are. There is no code path that
// only a thief takes, which is the only version of this claim that cannot rot:
// the day somebody tunes the thief's arm, they tune six innocents' arms with
// it. What separates them is `tell`, which nothing in the renderer reads.
//
// ---------------------------------------------------------------------------
// THE ONE THING THAT MUST NOT LEAK
// `tell` is metadata for the SIM (game.js decides whether a bolt is coming; the
// bench counts how many decoys the player had to sit through). It must never
// reach a material, a scale, a duration or a colour. If a decoy is 2.0 s and
// every steal is 1.9 s, the durations ARE the tell and a player with a
// stopwatch beats the game. So the durations overlap on purpose: steals run
// 1.75-2.60 s, decoys 1.60-2.70 s, and the shortest clip in the file is a
// decoy while the longest is also a decoy.
// ---------------------------------------------------------------------------

// Neutral. Anything a clip does not mention returns to this.
export const POSE = {
  hand: [0.20, 1.02, 0.16],   // root-local position of the held prop
  vis: 0,
  armR: -0.95, armRz: -0.16,  // the cart-bar pose is the rest state in this store
  armL: -0.95, armLz: 0.16,
  chest: 0.0,                 // pitch ADDED to the rig's own stoop
  neck: 0.0,                  // pitch: + is looking down
  look: 0.0,                  // yaw: the shoulder check
  turn: 0.0,                  // body yaw offset: turning away from the shelf
  item: [1, 1, 1],            // prop scale
};

// Prop shapes. The base box is 0.15 x 0.18 x 0.11 m.
const BOX   = [1.00, 1.00, 1.00];   // a grocery item
const SMALL = [0.72, 0.62, 0.62];   // a wallet, a pack of something
const FLAT  = [0.42, 0.92, 0.26];   // a phone
const TALL  = [0.66, 1.28, 0.60];   // a bottle / a carton

// Shorthand for a keyframe. Every field optional except u.
const kf = (u, o) => ({ u, ...o });

// Arm angles, so the numbers below mean something. Shoulder is at y~1.32 on a
// 1.75 m body and the arm is 0.72 long, so rotation.x maps to hand height:
//   -0.60 hip, -0.95 cart bar, -1.55 chest/forward, -1.90 sternum,
//   -2.20 shoulder, -2.45 ear.
export const GESTURES = [
  // =========================================================================
  // THE STEAL. Three of them, because one clip played by every thief in the
  // building IS a tell — the player learns the silhouette, not the crime.
  // =========================================================================
  {
    id: 'conceal', tell: 'steal', dur: 1.90, item: BOX,
    // Round 5's concealment, keyframed rather than lerped inline, and
    // deliberately UNCHANGED in shape: item off the lip, up past the sternum,
    // into the coat, gone, hands back on the bar. The brief was explicit that
    // the thief's tell must not get louder to pay for the decoys.
    keys: [
      kf(0.00, { hand: [0.32, 1.24, 0.30], vis: 1, armR: -1.55, chest: 0.05, neck: 0.22 }),
      kf(0.22, { hand: [0.24, 1.46, 0.26], vis: 1, armR: -1.92, look: 0.72, neck: 0.10 }),
      kf(0.42, { hand: [0.12, 1.40, 0.20], vis: 1, armR: -2.05, look: -0.55 }),
      kf(0.60, { hand: [0.03, 1.33, 0.13], vis: 1, armR: -2.02, look: 0.30 }),
      kf(0.66, { hand: [0.02, 1.30, 0.11], vis: 0, armR: -1.90, look: 0.45 }),
      kf(1.00, { hand: [0.16, 1.04, 0.14], vis: 0, armR: -0.95, look: 0.0 }),
    ],
  },
  {
    id: 'concealPocket', tell: 'steal', dur: 1.75, item: SMALL,
    // Low and quick. Never gets above the sternum, which is why it needs the
    // decoy `restash` to exist — that one is the same move and gives it back.
    keys: [
      kf(0.00, { hand: [0.30, 1.18, 0.28], vis: 1, armR: -1.45, chest: 0.08, neck: 0.26 }),
      kf(0.26, { hand: [0.26, 1.34, 0.22], vis: 1, armR: -1.70, look: -0.62 }),
      kf(0.52, { hand: [0.19, 1.06, 0.16], vis: 1, armR: -1.05, look: 0.50, chest: 0.10 }),
      kf(0.60, { hand: [0.17, 0.98, 0.14], vis: 0, armR: -0.88, look: 0.34 }),
      kf(1.00, { hand: [0.17, 1.00, 0.14], vis: 0, armR: -0.95, look: 0.0 }),
    ],
  },
  {
    id: 'concealBag', tell: 'steal', dur: 2.60, item: TALL,
    // Into a tote at the off hip, both hands, with a long turn away from the
    // aisle first. The slowest steal in the file, and slower than four decoys.
    keys: [
      kf(0.00, { hand: [0.34, 1.30, 0.30], vis: 1, armR: -1.60, neck: 0.20 }),
      kf(0.18, { hand: [0.30, 1.44, 0.24], vis: 1, armR: -1.86, turn: -0.35, look: 0.60 }),
      kf(0.40, { hand: [0.02, 1.36, 0.10], vis: 1, armR: -1.95, armL: -1.30, turn: -0.95 }),
      kf(0.58, { hand: [-0.14, 1.10, 0.06], vis: 1, armR: -1.20, armL: -1.35, turn: -1.05, chest: 0.14 }),
      kf(0.66, { hand: [-0.18, 1.02, 0.04], vis: 0, armR: -1.02, armL: -1.10, turn: -0.95 }),
      kf(1.00, { hand: [0.14, 1.02, 0.12], vis: 0, armR: -0.95, armL: -0.95, turn: 0.0 }),
    ],
  },

  // =========================================================================
  // THE PUT-BACK. Not a decoy: this is what a deterred thief does, and it is
  // the only clip in the file that ENDS with the item back on the shelf. It is
  // also the picture that tells a watching player his post at the door worked,
  // which is the whole feedback loop of the one-exit design in one gesture.
  // =========================================================================
  {
    id: 'putback', tell: 'putback', dur: 1.60, item: BOX,
    keys: [
      kf(0.00, { hand: [0.10, 1.24, 0.12], vis: 0, armR: -1.30, look: 0.55 }),
      kf(0.16, { hand: [0.14, 1.30, 0.16], vis: 1, armR: -1.62, look: -0.40 }),
      kf(0.52, { hand: [0.30, 1.36, 0.30], vis: 1, armR: -1.80, neck: 0.08 }),
      kf(0.80, { hand: [0.36, 1.28, 0.34], vis: 1, armR: -1.70, neck: 0.22, chest: 0.10 }),
      kf(0.86, { hand: [0.36, 1.26, 0.34], vis: 0, armR: -1.55, neck: 0.20 }),
      kf(1.00, { hand: [0.18, 1.02, 0.14], vis: 0, armR: -0.95 }),
    ],
  },

  // =========================================================================
  // THE DECOYS. Six innocent behaviours, every one of which a person actually
  // does in a supermarket, every one of which produces the concealment
  // signature on a $60 camera at 431 px.
  // =========================================================================
  {
    // A PHONE OUT OF A HIP POCKET. Object appears at the hip, goes to the
    // chest, goes to the ear, goes back in the pocket AND DOES NOT COME BACK.
    // Against `concealPocket` this is the same five frames in the same order.
    id: 'phone', tell: 'decoy', dur: 2.35, item: FLAT,
    keys: [
      kf(0.00, { hand: [0.20, 0.98, 0.12], vis: 0, armR: -0.80, look: -0.25 }),
      kf(0.12, { hand: [0.22, 1.02, 0.16], vis: 1, armR: -0.98 }),
      kf(0.30, { hand: [0.18, 1.34, 0.26], vis: 1, armR: -1.62, neck: 0.30 }),
      kf(0.52, { hand: [0.14, 1.44, 0.22], vis: 1, armR: -1.90, neck: 0.26, look: 0.30 }),
      kf(0.72, { hand: [0.20, 1.06, 0.16], vis: 1, armR: -1.02, look: -0.45 }),
      kf(0.80, { hand: [0.20, 0.98, 0.12], vis: 0, armR: -0.86 }),
      kf(1.00, { hand: [0.20, 1.00, 0.14], vis: 0, armR: -0.95, look: 0.0 }),
    ],
  },
  {
    // DIGGING A WALLET OUT OF A SHOULDER BAG. Two hands, at the off hip, body
    // turned away from the shelf so the bag is under the light. Ends with the
    // object back inside the bag. This is `concealBag` with a different reason.
    id: 'wallet', tell: 'decoy', dur: 2.70, item: SMALL,
    keys: [
      kf(0.00, { hand: [-0.10, 1.06, 0.08], vis: 0, armR: -1.15, armL: -1.25, turn: -0.55, chest: 0.12 }),
      kf(0.20, { hand: [-0.12, 1.08, 0.06], vis: 0, armR: -1.30, armL: -1.35, turn: -0.85, neck: 0.34 }),
      kf(0.34, { hand: [-0.02, 1.18, 0.12], vis: 1, armR: -1.45, armL: -1.20, turn: -0.80, neck: 0.30 }),
      kf(0.54, { hand: [0.12, 1.40, 0.22], vis: 1, armR: -1.88, turn: -0.40, neck: 0.18, look: 0.50 }),
      kf(0.74, { hand: [-0.06, 1.12, 0.08], vis: 1, armR: -1.22, armL: -1.28, turn: -0.80, neck: 0.32 }),
      kf(0.82, { hand: [-0.14, 1.04, 0.06], vis: 0, armR: -1.10, armL: -1.20, turn: -0.70 }),
      kf(1.00, { hand: [0.14, 1.02, 0.12], vis: 0, armR: -0.95, armL: -0.95, turn: 0.0 }),
    ],
  },
  {
    // READING THE BACK OF THE BOX. Off the shelf, up to the chest, and he TURNS
    // AWAY from the shelf to get the light on it — the same turn-and-check
    // silhouette a thief makes, for the most boring reason in the store. The
    // item stays visible the whole way, which is what makes it different, and
    // the item is only visible if the camera has an angle on his front.
    id: 'label', tell: 'decoy', dur: 2.45, item: BOX,
    keys: [
      kf(0.00, { hand: [0.34, 1.30, 0.32], vis: 1, armR: -1.62, neck: 0.24, chest: 0.06 }),
      kf(0.22, { hand: [0.24, 1.42, 0.26], vis: 1, armR: -1.90, turn: -0.50, look: 0.35 }),
      kf(0.46, { hand: [0.16, 1.38, 0.24], vis: 1, armR: -1.86, turn: -1.10, neck: 0.30 }),
      kf(0.68, { hand: [0.20, 1.40, 0.26], vis: 1, armR: -1.88, turn: -0.95, neck: 0.28, look: -0.40 }),
      kf(0.88, { hand: [0.34, 1.30, 0.32], vis: 1, armR: -1.66, turn: -0.20, neck: 0.20 }),
      kf(0.94, { hand: [0.36, 1.28, 0.34], vis: 0, armR: -1.55 }),
      kf(1.00, { hand: [0.18, 1.02, 0.14], vis: 0, armR: -0.95, turn: 0.0 }),
    ],
  },
  {
    // ADJUSTING A JACKET. No object at all, and it is still a false positive:
    // both hands go inside the coat line at chest height and come out empty,
    // with a hitch of the shoulders. On a graded 431 px feed the hands ARE the
    // object — the tracker's own token for this is a hand at chest height.
    id: 'jacket', tell: 'decoy', dur: 1.60, item: BOX,
    keys: [
      kf(0.00, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -0.95, armL: -0.95 }),
      kf(0.22, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -1.70, armL: -1.70, armRz: -0.34, armLz: 0.34, look: 0.55 }),
      kf(0.46, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -1.95, armL: -1.95, armRz: -0.10, armLz: 0.10, chest: 0.16 }),
      kf(0.70, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -1.50, armL: -1.50, armRz: -0.40, armLz: 0.40, look: -0.48 }),
      kf(1.00, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -0.95, armL: -0.95 }),
    ],
  },
  {
    // HANDING IT DOWN TO A CHILD. The object leaves the shelf, comes to the
    // chest, goes DOWN AND OUT past the hip — below the frame line of every
    // aisle dome in this store, which sit at 4.4 m and look down a 26 m lane —
    // and never comes back. There is no camera in the building that can tell
    // this from a coat pocket, and there is no child either.
    id: 'handoff', tell: 'decoy', dur: 2.20, item: BOX,
    keys: [
      kf(0.00, { hand: [0.32, 1.28, 0.30], vis: 1, armR: -1.58, neck: 0.22 }),
      kf(0.24, { hand: [0.26, 1.40, 0.26], vis: 1, armR: -1.86, look: 0.60 }),
      kf(0.46, { hand: [0.30, 1.16, 0.30], vis: 1, armR: -1.30, neck: 0.40, chest: 0.18 }),
      kf(0.64, { hand: [0.36, 0.80, 0.30], vis: 1, armR: -0.70, neck: 0.52, chest: 0.26 }),
      kf(0.72, { hand: [0.38, 0.70, 0.28], vis: 0, armR: -0.58, neck: 0.50, chest: 0.24 }),
      kf(1.00, { hand: [0.18, 1.00, 0.14], vis: 0, armR: -0.95, neck: 0.0, chest: 0.0 }),
    ],
  },
  {
    // POCKETING IT AND TAKING IT BACK OUT. The purest one. For 1.2 s this IS a
    // concealment — object into the pocket, hand away, nothing in frame — and
    // then it comes back out and goes in the cart. A player who dispatches on
    // frame four is right about what he saw and wrong about what it was, and
    // the only way to be sure is to keep watching, which costs him the seconds
    // the actual thief two aisles over is spending walking at the door.
    id: 'restash', tell: 'decoy', dur: 2.60, item: SMALL,
    keys: [
      kf(0.00, { hand: [0.32, 1.24, 0.30], vis: 1, armR: -1.55, neck: 0.22 }),
      kf(0.18, { hand: [0.24, 1.36, 0.22], vis: 1, armR: -1.78, look: -0.55 }),
      kf(0.34, { hand: [0.18, 1.04, 0.16], vis: 1, armR: -1.02, chest: 0.10 }),
      kf(0.40, { hand: [0.17, 0.99, 0.14], vis: 0, armR: -0.90, look: 0.40 }),
      kf(0.58, { hand: [0.17, 0.99, 0.14], vis: 0, armR: -0.95, look: 0.0 }),
      kf(0.66, { hand: [0.19, 1.04, 0.16], vis: 1, armR: -1.04 }),
      kf(0.84, { hand: [0.28, 1.30, 0.28], vis: 1, armR: -1.62, neck: 0.18 }),
      kf(0.92, { hand: [0.30, 1.16, 0.34], vis: 0, armR: -1.30, neck: 0.30 }),   // into the cart
      kf(1.00, { hand: [0.18, 1.02, 0.14], vis: 0, armR: -0.95 }),
    ],
  },
  {
    // PUTTING A COAT BACK ON / SHRUGGING A BAG STRAP UP. Shortest clip in the
    // file, and it is a decoy — see the note at the top about durations.
    id: 'strap', tell: 'decoy', dur: 1.65, item: SMALL,
    keys: [
      kf(0.00, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -0.95, armL: -0.95 }),
      kf(0.26, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -2.25, armRz: -0.52, look: -0.60, chest: 0.10 }),
      kf(0.50, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -2.40, armRz: -0.20, armL: -1.20, chest: 0.18 }),
      kf(0.76, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -1.60, armRz: -0.44, look: 0.52 }),
      kf(1.00, { hand: [0.16, 1.02, 0.12], vis: 0, armR: -0.95, armL: -0.95 }),
    ],
  },
];

export const BY_ID = new Map(GESTURES.map((g) => [g.id, g]));
const OF = (tell) => GESTURES.filter((g) => g.tell === tell);
const STEAL = OF('steal'), DECOY = OF('decoy'), PUTBACK = OF('putback');

// `rng` is agents.js's seeded rnd(), so a bench trial is reproducible.
export function pickGesture(rng, kind) {
  const pool = kind === 'steal' ? STEAL : kind === 'putback' ? PUTBACK : DECOY;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

const lerp = (a, b, t) => a + (b - a) * t;
const _out = {
  hand: [0, 0, 0], vis: 0, armR: 0, armRz: 0, armL: 0, armLz: 0,
  chest: 0, neck: 0, look: 0, turn: 0, item: [1, 1, 1], id: '', tell: '',
};

// Sample a clip. Returns a SHARED object — read it, do not keep it.
//
// `vis` STEPS rather than lerping, and that is load-bearing: an item that fades
// out over 200 ms is a different picture from an item that is there and then is
// not, and the second one is what a 15 fps stream produces. Everything else is
// a plain lerp between the bracketing keys.
export function applyGesture(g, u) {
  const keys = g.keys;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  let i = 0;
  while (i < keys.length - 1 && keys[i + 1].u <= u) i++;
  const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
  const span = b.u - a.u;
  const f = span > 1e-6 ? (u - a.u) / span : 0;
  // Ease each segment, so a five-key clip does not read as five straight lines.
  const e = f * f * (3 - 2 * f);
  const get = (k, key) => (key[k] !== undefined ? key[k] : POSE[k]);
  const mix = (k) => lerp(get(k, a), get(k, b), e);
  const ha = get('hand', a), hb = get('hand', b);
  _out.hand[0] = lerp(ha[0], hb[0], e);
  _out.hand[1] = lerp(ha[1], hb[1], e);
  _out.hand[2] = lerp(ha[2], hb[2], e);
  _out.vis = get('vis', a);                 // STEP, not a fade
  _out.armR = mix('armR'); _out.armRz = mix('armRz');
  _out.armL = mix('armL'); _out.armLz = mix('armLz');
  _out.chest = mix('chest'); _out.neck = mix('neck');
  _out.look = mix('look'); _out.turn = mix('turn');
  _out.item = g.item || POSE.item;
  _out.id = g.id; _out.tell = g.tell;
  return _out;
}
