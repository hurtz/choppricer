// OWNER: builder-agents. THE DECOY LIBRARY — every reach-with-an-object in the
// store, guilty and innocent, drawn by ONE function.
//
//   GESTURES              the table. Each entry is a keyframed clip.
//   pickGesture(rng, k)   roll one of a kind: 'steal' | 'decoy' | 'putback' | 'react'
//   applyGesture(o, g, u) sample clip `g` at u in 0..1 -> a pose object
//   POSE                  the neutral pose, for reference
//
// ---------------------------------------------------------------------------
// ROUND 7 — THE REACT POOL. "HEY, PUT THAT BACK."
//
// The client wants to say it over the PA at somebody he is watching: "they look
// around, like, 'what the fuck?' ... they might reconsider, they might put it
// back, and then just leave the store peacefully."
//
// That is TWO reactions and they must not be two code paths, for the same
// reason the steal is entry zero of this table rather than a special case. So:
//   - a subject who HEEDS the call plays `putback` — the existing clip, the one
//     already used by a thief balking at a posted guard. An innocent who is
//     embarrassed into putting a box back plays THE SAME ONE. A put-back is
//     therefore not a confession; see K.annSpook in agents.js.
//   - a subject who does NOT plays one of the three `react` clips below: heads
//     up, shoulder check, a look at the ceiling for the speaker, a shrug, and
//     back to the shelf. A guilty man who decides to brazen it out plays these
//     too, and so does every bystander in earshot. ROUND 8 rebuilt all three
//     into the four-beat sequence the client described; see the block above
//     them.
// `tell: 'react'` keeps them out of the DECOY pool ON PURPOSE — pickGesture's
// modulo over seven decoys is what round 6's whole distribution was measured
// on, and quietly making it eight would have moved every number in the file.
// They are only ever started by id, which costs no rng at all. Round 8's fourth
// reaction, the startle `whoMeRun`, carries tell:'startle' for the identical
// reason one level down: a fourth entry in the REACT pool would be rolled one
// time in four by a man who is not going anywhere.
// ---------------------------------------------------------------------------
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
// 1.75-2.60 s, decoys 1.60-2.70 s, and the shortest SPONTANEOUS clip in the
// file is a decoy while the longest is also a decoy. (The PA answer clips run
// 1.95-3.60 s and bracket both pools, but nothing rolls one by accident — they
// only ever play in answer to the PA, so they are not in that contest. The
// 0.98 s startle is shorter than anything else here and that is safe for the
// same reason: it is never rolled, only ever named, and by the time its length
// is observable the man is running and the length is moot.)
// ---------------------------------------------------------------------------

// Neutral. Anything a clip does not mention returns to this.
//
// THERE IS NO ABSOLUTE POSITION CHANNEL, and that is deliberate. A clip drives
// ARMS; agents.js solves where the hand ends up and puts the prop there. Round
// 5 authored the item's position directly and the two drifted half a metre
// apart — a box floating beside his left ear while his right arm reached — and
// you cannot argue that innocent and guilty footage is indistinguishable using
// a shot with a floating box in it. `off` is a small correction from the solved
// hand, in RIG-LOCAL metres, for the beats where the item is pressed against
// the body: +x is across his chest, +z is out in front of him.
export const POSE = {
  off: [0, 0, 0],             // prop offset from the SOLVED hand, RIG-LOCAL
                              // (+x is toward his left, i.e. across the chest)
  vis: 0,
  armR: -0.95, armRz: -0.16,  // the cart-bar pose is the rest state in this store
  armL: -0.95, armLz: 0.16,
  chest: 0.0,                 // pitch ADDED to the rig's own stoop
  neck: 0.0,                  // pitch: + is looking down
  look: 0.0,                  // yaw: the shoulder check
  turn: 0.0,                  // body yaw offset: turning away from the shelf
  // ROUND 8 — THE HEAD SHAKE, AS AN ENVELOPE RATHER THAN AS KEYFRAMES.
  // Client: "they're shaking their head and they're just pissed off". A shake
  // is a 2 Hz oscillation and this table samples at whatever rate the segment
  // between two keys implies, so authoring it as keys would need eight of them
  // per shake and would still be eaten by the ed(9) lerp animateShopper puts on
  // the neck. So the CLIP owns the amplitude and the RENDERER owns the
  // oscillation: agents.js adds sin(elapsed * K.annShakeHz * 2PI) * shake to the
  // neck yaw, unlagged, on top of `look`. Costs one sin per body per frame and
  // only while a clip with a non-zero shake is running.
  shake: 0.0,                 // radians of "no", amplitude only
  // ROUND 9 — TWO MORE ENVELOPES, BOTH BUILT THE SAME WAY AND FOR THE SAME
  // REASON AS `shake`: the clip owns the amplitude, the renderer owns the
  // oscillation or the geometry, and neither costs anything on a body that is
  // not doing it.
  //
  // `aim` is the one that matters. It is 0..1, and at 1 the subject's head — and
  // past about 77 degrees his whole body — points AT THE NEAREST CAMERA IN THE
  // BUILDING. Not at the screen, not at a baked yaw: agents.js reads the real
  // rig out of cctv.js's cameraRig() and solves the bearing per subject, so a
  // man in aisle 6 turns to the dome hanging in aisle 6, which is the one the
  // player is looking through at the time. Authoring it as a keyframed `turn`
  // instead would have aimed everybody the same way relative to their own
  // heading, i.e. at nothing, and the joke only works if he is looking at YOU.
  aim: 0.0,
  // `mouth` is silent mouthing-off: a 3.2 Hz nod amplitude on the neck. There is
  // no microphone on a shop camera and there is no jaw on these heads, so the
  // read has to be the RHYTHM of a man saying something you cannot hear, which
  // survives resolution the way any motion does and the way a mouth does not.
  mouth: 0.0,
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
// ---------------------------------------------------------------------------
// ROUND 8 — THE FIRST HALF-SECOND OF EVERY REACTION IN THIS GAME.
//
// Three keyframes at ABSOLUTE times — 0.00, 0.22 and 0.50 seconds — divided
// into whatever normalised span the clip that uses them needs. `applyGesture`
// parameterises each segment by (u - a.u)/(b.u - a.u), so two clips of
// different lengths that share these keys are IDENTICAL frame for frame out to
// 0.50 s. That is the guarantee the whole bolt outcome rests on: an innocent
// being annoyed, a thief brazening it out and a thief about to run are one
// picture for half a second, and the earliest any of them can be told apart is
// 0.62 s — by which time the PA latency has already spent 0.35-0.95 s of the
// player's attention.
//
// He is at the shelf with his chin down (neck +0.20), the head comes up and off
// (neck -0.12) with a check over the right shoulder at 0.22, and a longer one
// the other way at 0.50 with the body starting to come round with it.
const heard = (dur) => [
  kf(0.00, { vis: 0, armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, neck: 0.20 }),
  kf(0.22 / dur, { vis: 0, armR: -0.92, armL: -0.93, neck: -0.12, look: 0.60 }),
  kf(0.50 / dur, { vis: 0, armR: -0.90, armL: -0.91, neck: -0.10, look: -0.66, turn: -0.26 }),
];
export const GESTURES = [
  // =========================================================================
  // THE STEAL. Three of them, because one clip played by every thief in the
  // building IS a tell — the player learns the silhouette, not the crime.
  // =========================================================================
  {
    id: 'conceal', tell: 'steal', dur: 1.90, item: BOX,
    // Round 5's concealment, keyframed rather than lerped inline, and
    // deliberately UNCHANGED in shape: item off the lip, up past the sternum,
    // into the coat, gone, hands back on the bar, with the shoulder checks on
    // the same beats. The brief was explicit that the thief's tell must not get
    // louder to pay for the decoys, so it did not.
    keys: [
      kf(0.00, { vis: 1, armR: -1.55, armRz: -0.30, chest: 0.05, neck: 0.22 }),
      kf(0.22, { vis: 1, armR: -1.92, armRz: -0.20, look: 0.72, neck: 0.10 }),
      kf(0.42, { vis: 1, armR: -2.05, armRz: 0.10, look: -0.55 }),
      kf(0.60, { vis: 1, armR: -1.55, armRz: 0.88, off: [0.0, -0.02, -0.24], look: 0.30 }),
      kf(0.66, { vis: 0, armR: -1.45, armRz: 0.95, off: [0.0, -0.02, -0.26], look: 0.45 }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16, look: 0.0 }),
    ],
  },
  {
    id: 'concealPocket', tell: 'steal', dur: 1.75, item: SMALL,
    // Low and quick. Never gets above the sternum, which is why it needs the
    // decoy `restash` to exist — that one is the same move and gives it back.
    keys: [
      kf(0.00, { vis: 1, armR: -1.45, armRz: -0.26, chest: 0.08, neck: 0.26 }),
      kf(0.26, { vis: 1, armR: -1.70, armRz: -0.14, look: -0.62 }),
      kf(0.52, { vis: 1, armR: -0.72, armRz: 0.46, off: [0.0, 0.0, -0.10], look: 0.50, chest: 0.10 }),
      kf(0.60, { vis: 0, armR: -0.58, armRz: 0.44, off: [0.0, 0.0, -0.12], look: 0.34 }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16, look: 0.0 }),
    ],
  },
  {
    id: 'concealBag', tell: 'steal', dur: 2.60, item: TALL,
    // Into a tote at the off hip, both hands, with a long turn away from the
    // aisle first. The slowest steal in the file, and slower than four decoys.
    keys: [
      kf(0.00, { vis: 1, armR: -1.60, armRz: -0.28, neck: 0.20 }),
      kf(0.18, { vis: 1, armR: -1.86, armRz: -0.12, turn: -0.35, look: 0.60 }),
      kf(0.40, { vis: 1, armR: -1.55, armRz: 0.46, armL: -1.30, turn: -0.95 }),
      kf(0.58, { vis: 1, armR: -1.05, armRz: 0.56, armL: -1.35, turn: -1.05, chest: 0.14 }),
      kf(0.66, { vis: 0, armR: -0.98, armRz: 0.52, armL: -1.10, turn: -0.95 }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16, armL: -0.95, turn: 0.0 }),
    ],
  },

  // =========================================================================
  // THE PUT-BACK. Not a decoy: this is what a deterred thief does, and it is
  // the only clip in the file that ENDS with the item back on the shelf. It is
  // also the picture that tells a watching player his post on the door worked,
  // which is the whole feedback loop of the one-exit design in one gesture.
  // =========================================================================
  {
    id: 'putback', tell: 'putback', dur: 1.60, item: BOX,
    keys: [
      kf(0.00, { vis: 0, armR: -1.45, armRz: 0.92, off: [0.0, 0.0, -0.24], look: 0.55 }),
      kf(0.16, { vis: 1, armR: -1.62, armRz: 0.10, look: -0.40 }),
      kf(0.52, { vis: 1, armR: -1.80, armRz: -0.30, neck: 0.08 }),
      kf(0.80, { vis: 1, armR: -1.70, armRz: -0.40, neck: 0.22, chest: 0.10 }),
      kf(0.86, { vis: 0, armR: -1.55, armRz: -0.38, neck: 0.20 }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16 }),
    ],
  },

  // =========================================================================
  // THE DECOYS. Seven innocent behaviours, every one of which a person actually
  // does in a supermarket, every one of which produces the concealment
  // signature on a $60 camera.
  // =========================================================================
  {
    // A PHONE OUT OF A HIP POCKET. Object appears at the hip, goes to the
    // chest, goes to the ear, goes back in the pocket AND DOES NOT COME BACK.
    // Against `concealPocket` this is the same five frames in the same order.
    id: 'phone', tell: 'decoy', dur: 2.35, item: FLAT,
    keys: [
      kf(0.00, { vis: 0, armR: -0.80, armRz: 0.10, look: -0.25 }),
      kf(0.12, { vis: 1, armR: -0.98, armRz: 0.06 }),
      kf(0.30, { vis: 1, armR: -1.62, armRz: 0.14, neck: 0.30 }),
      kf(0.52, { vis: 1, armR: -2.10, armRz: 0.30, neck: 0.16, look: 0.30 }),
      kf(0.72, { vis: 1, armR: -1.02, armRz: 0.14, look: -0.45 }),
      kf(0.80, { vis: 0, armR: -0.62, armRz: 0.30, off: [0.0, 0.0, -0.08] }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16, look: 0.0 }),
    ],
  },
  {
    // DIGGING A WALLET OUT OF A SHOULDER BAG. Two hands, at the off hip, body
    // turned away from the shelf so the bag is under the light. Ends with the
    // object back inside the bag. This is `concealBag` with a different reason.
    id: 'wallet', tell: 'decoy', dur: 2.70, item: SMALL,
    keys: [
      kf(0.00, { vis: 0, armR: -1.15, armRz: 0.50, armL: -1.25, turn: -0.55, chest: 0.12 }),
      kf(0.20, { vis: 0, armR: -1.30, armRz: 0.58, armL: -1.35, turn: -0.85, neck: 0.34 }),
      kf(0.34, { vis: 1, armR: -1.45, armRz: 0.40, armL: -1.20, turn: -0.80, neck: 0.30 }),
      kf(0.54, { vis: 1, armR: -1.88, armRz: 0.08, turn: -0.40, neck: 0.18, look: 0.50 }),
      kf(0.74, { vis: 1, armR: -1.22, armRz: 0.48, armL: -1.28, turn: -0.80, neck: 0.32 }),
      kf(0.82, { vis: 0, armR: -1.10, armRz: 0.54, armL: -1.20, turn: -0.70 }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16, armL: -0.95, turn: 0.0 }),
    ],
  },
  {
    // READING THE BACK OF THE BOX. Off the shelf, up to the chest, and he TURNS
    // AWAY from the shelf to get the light on it — the same turn-and-check
    // silhouette a thief makes, for the most boring reason in the store. The
    // item stays visible the whole way, which is what makes it different, and
    // only if the camera has an angle on his front.
    id: 'label', tell: 'decoy', dur: 2.45, item: BOX,
    keys: [
      kf(0.00, { vis: 1, armR: -1.62, armRz: -0.34, neck: 0.24, chest: 0.06 }),
      kf(0.22, { vis: 1, armR: -1.90, armRz: -0.10, turn: -0.50, look: 0.35 }),
      kf(0.46, { vis: 1, armR: -1.86, armRz: 0.16, turn: -1.10, neck: 0.30 }),
      kf(0.68, { vis: 1, armR: -1.88, armRz: 0.20, turn: -0.95, neck: 0.28, look: -0.40 }),
      kf(0.88, { vis: 1, armR: -1.66, armRz: -0.30, turn: -0.20, neck: 0.20 }),
      kf(0.94, { vis: 0, armR: -1.55, armRz: -0.36 }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16, turn: 0.0 }),
    ],
  },
  {
    // ADJUSTING A JACKET. No object at all, and it is still a false positive:
    // both hands go inside the coat line at chest height and come out empty,
    // with a hitch of the shoulders. On a graded feed the hands ARE the object
    // — the tracker's own token for this is a hand at chest height.
    id: 'jacket', tell: 'decoy', dur: 1.60, item: BOX,
    keys: [
      kf(0.00, { vis: 0, armR: -0.95, armL: -0.95 }),
      kf(0.22, { vis: 0, armR: -1.70, armL: -1.70, armRz: 0.34, armLz: -0.34, look: 0.55 }),
      kf(0.46, { vis: 0, armR: -1.95, armL: -1.95, armRz: 0.10, armLz: -0.10, chest: 0.16 }),
      kf(0.70, { vis: 0, armR: -1.50, armL: -1.50, armRz: 0.40, armLz: -0.40, look: -0.48 }),
      kf(1.00, { vis: 0, armR: -0.95, armL: -0.95, armRz: -0.16, armLz: 0.16 }),
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
      kf(0.00, { vis: 1, armR: -1.58, armRz: -0.30, neck: 0.22 }),
      kf(0.24, { vis: 1, armR: -1.86, armRz: -0.10, look: 0.60 }),
      kf(0.46, { vis: 1, armR: -1.30, armRz: -0.34, neck: 0.40, chest: 0.18 }),
      kf(0.64, { vis: 1, armR: -0.70, armRz: -0.46, neck: 0.52, chest: 0.26 }),
      kf(0.72, { vis: 0, armR: -0.58, armRz: -0.48, neck: 0.50, chest: 0.24 }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16, neck: 0.0, chest: 0.0 }),
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
      kf(0.00, { vis: 1, armR: -1.55, armRz: -0.30, neck: 0.22 }),
      kf(0.18, { vis: 1, armR: -1.78, armRz: -0.10, look: -0.55 }),
      kf(0.34, { vis: 1, armR: -0.74, armRz: 0.48, off: [0.0, 0.0, -0.10], chest: 0.10 }),
      kf(0.40, { vis: 0, armR: -0.60, armRz: 0.44, off: [0.0, 0.0, -0.12], look: 0.40 }),
      kf(0.58, { vis: 0, armR: -0.95, armRz: -0.16, look: 0.0 }),
      kf(0.66, { vis: 1, armR: -1.04, armRz: 0.18 }),
      kf(0.84, { vis: 1, armR: -1.62, armRz: -0.06, neck: 0.18 }),
      kf(0.92, { vis: 0, armR: -1.30, armRz: -0.34, neck: 0.30 }),   // into the cart
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16 }),
    ],
  },
  {
    // PUTTING A COAT BACK ON / SHRUGGING A BAG STRAP UP. Shortest clip in the
    // file, and it is a decoy — see the note at the top about durations.
    id: 'strap', tell: 'decoy', dur: 1.65, item: SMALL,
    keys: [
      kf(0.00, { vis: 0, armR: -0.95, armL: -0.95 }),
      kf(0.26, { vis: 0, armR: -2.25, armRz: 0.52, look: -0.60, chest: 0.10 }),
      kf(0.50, { vis: 0, armR: -2.40, armRz: 0.20, armL: -1.20, chest: 0.18 }),
      kf(0.76, { vis: 0, armR: -1.60, armRz: 0.44, look: 0.52 }),
      kf(1.00, { vis: 0, armR: -0.95, armL: -0.95, armRz: -0.16, armLz: 0.16 }),
    ],
  },

  // =========================================================================
  // ROUND 8 — THE PUT-BACK, WITH THE HALF-SECOND IN FRONT OF IT.
  //
  // `putback` above is round 6's clip and it starts with his hand already
  // inside his coat, because the thing that triggers it there is a uniform
  // stood on the door and he has been looking at that uniform for three
  // seconds. A man answering a PA has not: he heard a voice, and the sequence
  // is heard it -> could not place it -> found the speaker -> and THEN decided.
  //
  // So the announcement's compliance clip is this one, and the reason it exists
  // at all is an anti-oracle reason rather than an animation one. If a heeding
  // subject played round 6's putback, the outcome would be legible from the
  // FIRST FRAME — hand in coat versus hands on the bar — and a player could read
  // his answer 0.9 s before the man had finished having it. Sharing heard()
  // puts every one of the four possible answers behind the same half-second.
  // The item does not appear until 1.42 s.
  //
  // GUILTY AND INNOCENT ALIKE, which is the round-7 rule and is now load
  // bearing in a second place: reactToPA's innocent-heed branch names this clip
  // too, and abortTheft/dumpGoods name it when `why` is 'announce'. A posted
  // guard still gets round 6's putback, unchanged, because nobody said anything
  // to him.
  {
    id: 'putbackPA', tell: 'putbackPA', dur: 2.65, item: BOX,
    keys: [
      ...heard(2.65),
      kf(0.72 / 2.65, { armR: -0.92, armL: -0.93, neck: -0.40, look: 0.20, turn: -0.12 }),
      kf(0.95 / 2.65, { armR: -0.96, armL: -0.94, neck: -0.50, look: 0.0, chest: -0.06 }),
      kf(1.18 / 2.65, { armR: -1.30, armRz: 0.60, armL: -0.96, neck: -0.06, look: 0.30, chest: 0.04 }),
      // ...and from here it is `putback` above, keyframe for keyframe.
      kf(1.42 / 2.65, { vis: 1, armR: -1.45, armRz: 0.92, off: [0.0, 0.0, -0.24], look: 0.55, neck: 0.10 }),
      kf(1.68 / 2.65, { vis: 1, armR: -1.62, armRz: 0.10, look: -0.40 }),
      kf(2.06 / 2.65, { vis: 1, armR: -1.80, armRz: -0.30, neck: 0.08 }),
      kf(2.30 / 2.65, { vis: 1, armR: -1.70, armRz: -0.40, neck: 0.22, chest: 0.10 }),
      kf(2.38 / 2.65, { vis: 0, armR: -1.55, armRz: -0.38, neck: 0.20 }),
      kf(1.00, { vis: 0, armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16 }),
    ],
  },

  // =========================================================================
  // ROUND 8 — THE REACTION IS A PERFORMANCE, AND ITS FIRST HALF-SECOND IS A
  // FUNCTION.
  //
  // Client, verbatim: "They look around, they're not sure where the sound is
  // coming from, and then they realize that maybe they're being watched.
  // They're shaking their head and they're just pissed off — unless they're a
  // real thief, and then the thief is like 'oh shit', and gets scared and
  // starts running."
  //
  // That is FOUR BEATS and round 7 only had one of them. Every react clip below
  // now runs the whole sequence:
  //
  //   1  HEARD IT      head comes up off the shelf, one shoulder check
  //   2  CAN'T PLACE IT a sweep of the aisle for whoever said that
  //   3  FINDS IT      he looks UP — at the speaker, at the dome — and STOPS.
  //                    This is the beat the client is describing when he says
  //                    "they realize that maybe they're being watched", and it
  //                    is a HOLD, not a pose: he is still for a third of a
  //                    second while it lands.
  //   4  NOT HAVING IT the head shake, and then a shoulder hitch and back to
  //                    the shelf in a huff. `shake` is an envelope; see POSE.
  //
  // ---- AND THE FOURTH CLIP, WHICH IS THE SAME CLIP FOR HALF A SECOND -------
  // `whoMeRun` is what a man with a bottle in his coat does instead, and the
  // whole design risk in it is that it becomes a tell you can read off the
  // first frame. So THE FIRST HALF-SECOND OF EVERY REACTION IN THIS GAME IS
  // DRAWN BY heard(), below. Not "similar to": the same three keyframes at the
  // same ABSOLUTE times, which — because applyGesture parameterises each
  // segment by (u - a.u)/(b.u - a.u) — makes the pose identical frame for frame
  // out to t = 0.50 s regardless of how long the clip runs. Add the 0.35-0.95 s
  // PA latency and the player has keyed the handset and watched between 0.85 s
  // and 1.45 s of footage that cannot tell him anything. The tell is in what
  // happens NEXT: at 0.62 s one of these four men drops his hands off the cart
  // bar, and by 0.98 s he is running.
  //
  // If you edit heard(), you are editing ELEVEN clips — every answer a body in
  // this store can give a PA, on every rung: the three confusion clips, the
  // four escalation clips, the two birds, the startle and `putbackPA` — which
  // is the point of it. The day somebody makes the startle read better they
  // make the confused man read better too, and there is no keyframe either of
  // them owns alone. (Round 8 wrote "all FIVE" here and it was true then; round
  // 9 added five clips and round 10 a sixth without anyone updating the count,
  // which is exactly how a correct comment goes quietly wrong. The number is
  // `GESTURES.filter(g => g.keys[0].u === 0 && g.keys[1] && g.id.startsWith('whoMe')).length`
  // plus putbackPA if you would rather not trust a written one.)
  //
  // NONE of these contains an object, a reach or a concealment: the information
  // a player is allowed to take off a react clip is "he heard it", never "he did
  // it". The clip a HEEDING subject plays is `putback` above, and innocents play
  // that one too.
  // =========================================================================
  // Beat 1 lives in heard(), above the table, in SECONDS. `dur` divides those
  // seconds into each clip's own normalised time, so a 0.98 s startle and a
  // 2.80 s huff open on the identical picture.

  {
    // THE CEILING CHECK, AND IT DOES NOT RESOLVE.
    //
    // ROUND 10. Round 8 ended this clip on the head shake, and the client has
    // now told us that is the wrong ending: "I don't think the shoppers should
    // necessarily stop and shake their hands and get mad ... I want them to
    // look around and look really confused." So the beat that used to be
    // NOT HAVING IT is now STILL LOOKING — he thinks he has found the speaker,
    // holds on it, and then it is not there after all, so his head comes down
    // to the shelf and goes straight back up again. `shake` is 0 in every key.
    //
    // The unresolved ending is the whole change and it is one keyframe: at
    // 1.62 s he is looking at the shelf like a man who has given up, and at
    // 1.85 s he is looking at the ceiling again. A single reversal is what
    // separates "he heard it and dismissed it" from "he cannot place it", and
    // it costs nothing because the neck was already moving.
    id: 'whoMe', tell: 'react', dur: 2.55, item: SMALL,
    keys: [
      ...heard(2.55),
      kf(0.78 / 2.55, { armR: -0.90, armL: -0.92, neck: -0.34, look: 0.52, turn: -0.08 }),
      kf(1.05 / 2.55, { armR: -1.00, armL: -0.94, neck: -0.62, look: 0.10 }),
      // The hold. He thinks that is it.
      kf(1.38 / 2.55, { armR: -1.00, armL: -0.94, neck: -0.58, look: -0.06, chest: -0.08 }),
      // ...it is not. Back down to the shelf.
      kf(1.66 / 2.55, { armR: -0.92, armL: -0.93, neck: 0.16, look: -0.34, chest: -0.02 }),
      // STILL LOOKING. Up again, the other way, slower than the first time.
      kf(1.98 / 2.55, { armR: -0.94, armL: -0.94, neck: -0.50, look: 0.34, chest: -0.10 }),
      // Half a shrug: one hand off the bar, palm up, and the shoulders hitch.
      kf(2.22 / 2.55, { armR: -1.34, armRz: 0.58, armL: -0.96, neck: -0.24, chest: -0.12 }),
      kf(2.38 / 2.55, { armR: -1.08, armRz: 0.26, armL: -0.98, neck: 0.20, chest: 0.12 }),
      kf(1.00, { armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, turn: 0.0 }),
    ],
  },
  {
    // ROUND 10 — "LOOK AROUND AND LOOK REALLY CONFUSED". THE LONG ONE.
    //
    // This is the clip the client's sentence describes end to end, and it
    // replaces `whoMeAffront` in the first-shout pool rather than joining it:
    // the affront has not been deleted, it has been moved up the ladder to the
    // third shout, where being annoyed is earned. See LADDER in agents.js.
    //
    // FOUR PLACES HE LOOKS AND NONE OF THEM IS IT: down the aisle one way,
    // right round behind him — the whole BODY comes with it, which is the beat
    // that survives at 214 px because a body that has turned 60 degrees off the
    // shelf is a different silhouette from one that has not — then up at the
    // ceiling, then the shrug.
    //
    // THE SHRUG IS THE POINT AND IT IS A SILHOUETTE, NOT A FACE. Both hands
    // come off the cart bar, elbows in, forearms out and up, palms open. In a
    // store whose entire posture language is people folded over a trolley, two
    // forearms held out away from the body is a shape nothing else in this file
    // makes — and it is the one gesture that means "I don't know" without a
    // face, without a caption and without a sound. Held for 0.55 s, which is
    // long enough to read on a monitor tile and short enough not to mime.
    //
    // NO `shake` ANYWHERE. That is the whole rebalance in one line: the head
    // shake is negation and negation is the end of a thought. A man who is
    // confused has not finished having it.
    id: 'whoMeLost', tell: 'react', dur: 3.00, item: SMALL,
    keys: [
      ...heard(3.00),
      // 1. Keeps turning the way heard() started him, on down the aisle.
      kf(0.76 / 3.00, { armR: -0.90, armL: -0.92, neck: -0.18, look: 0.58, turn: -0.30 }),
      // 2. ...and right round behind him. Nobody there either.
      kf(1.06 / 3.00, { armR: -0.90, armL: -0.92, neck: -0.10, look: 0.26, turn: -1.02 }),
      kf(1.30 / 3.00, { armR: -0.92, armL: -0.93, neck: -0.14, look: -0.24, turn: -0.86 }),
      // 3. Up at the ceiling, and a hold that does not pay off.
      kf(1.60 / 3.00, { armR: -0.94, armL: -0.94, neck: -0.54, look: 0.06, turn: -0.48, chest: -0.10 }),
      kf(1.88 / 3.00, { armR: -0.96, armL: -0.95, neck: -0.56, look: -0.02, turn: -0.40, chest: -0.12 }),
      // 4. THE SHRUG. Both palms up, shoulders hitched, held.
      kf(2.14 / 3.00, { armR: -1.44, armRz: 0.74, armL: -1.42, armLz: -0.72, neck: -0.26, turn: -0.30, chest: -0.16 }),
      kf(2.52 / 3.00, { armR: -1.46, armRz: 0.76, armL: -1.44, armLz: -0.74, neck: -0.08, turn: -0.26, chest: -0.14 }),
      // ...and one more look up on the way down, because he still has not
      // worked it out. Then back to the shelf, none the wiser.
      kf(2.74 / 3.00, { armR: -1.12, armRz: 0.34, armL: -1.10, armLz: -0.32, neck: -0.42, turn: -0.14, chest: -0.06 }),
      kf(2.90 / 3.00, { armR: -1.00, armRz: 0.02, armL: -0.98, armLz: -0.02, neck: 0.22, chest: 0.12 }),
      kf(1.00, { armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, turn: 0.0 }),
    ],
  },
  {
    // "ME?" Hand off the bar and onto his own chest, a half turn to see who is
    // behind him, nobody, then up to the ceiling — and the affront lands on the
    // camera rather than on a person, which is worse.
    //
    // ROUND 10 — MOVED, NOT CHANGED. Not one keyframe of this clip has been
    // touched; what changed is that it is now the SECOND rung of the ladder in
    // agents.js rather than one of the three a first announcement can draw.
    // The client's note is that the anger arrives too early, and the cheapest
    // honest answer to "too early" is later, not smaller.
    //
    // `tell` goes 'react' -> 'escalate' with it, and that is not cosmetic:
    // OF('react') is the pool pickGesture rolls by modulo and it had three
    // entries when every distribution in this file was measured. `whoMeLost`
    // took this one's place in it, so it still has three. Same rule round 8
    // wrote for the startle and round 9 wrote for the bird.
    id: 'whoMeAffront', tell: 'escalate', dur: 2.80, item: SMALL,
    keys: [
      ...heard(2.80),
      kf(0.72 / 2.80, { armR: -1.62, armRz: 0.62, armL: -0.92, look: -0.30, turn: -0.62, chest: -0.04 }),
      kf(1.00 / 2.80, { armR: -1.58, armRz: 0.66, armL: -1.05, look: 0.62, turn: -0.90, neck: -0.20 }),
      kf(1.32 / 2.80, { armR: -1.54, armRz: 0.62, armL: -1.02, look: 0.14, turn: -0.62, neck: -0.56 }),
      kf(1.60 / 2.80, { armR: -1.50, armRz: 0.58, armL: -1.00, look: -0.02, turn: -0.40, neck: -0.52, chest: -0.10 }),
      kf(1.82 / 2.80, { armR: -1.30, armRz: 0.44, armL: -0.98, turn: -0.30, neck: -0.14, chest: -0.12 }),
      kf(1.96 / 2.80, { armR: -1.24, armRz: 0.40, armL: -0.98, turn: -0.26, neck: 0.04, chest: -0.08, shake: 0.40 }),
      kf(2.34 / 2.80, { armR: -1.10, armRz: 0.20, armL: -0.96, turn: -0.10, neck: 0.06, chest: -0.02, shake: 0.40 }),
      kf(2.55 / 2.80, { armR: -1.00, armRz: 0.02, armL: -1.00, neck: 0.26, chest: 0.16 }),
      kf(1.00, { armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, turn: 0.0 }),
    ],
  },
  {
    // THE SHORT ONE, AND ROUND 10 GAVE IT A SECOND JOB.
    //
    // Round 7 made this "deliberately almost nothing to look at" and that is
    // still what it is. What changed is WHO GETS IT: agents.js now picks the
    // reaction by how close the announcement was as well as by which shout it
    // is, and this is the far end of that. A man twelve metres down the next
    // aisle hears a voice, looks up, cannot see anybody, and goes back to his
    // shopping — which is what people do, and which is what makes the man three
    // metres away stopping dead and searching mean something.
    //
    // The shake came out of it (round 10; see `whoMe`). What is left in its
    // place is one more sweep and a shoulder hitch — the smallest possible
    // "I have no idea", at a distance where nothing bigger would read anyway.
    id: 'whoMeGlance', tell: 'react', dur: 1.95, item: SMALL,
    keys: [
      ...heard(1.95),
      kf(0.70 / 1.95, { armR: -0.94, armL: -0.94, neck: -0.46, look: 0.18, turn: -0.12 }),
      kf(0.95 / 1.95, { armR: -0.96, armL: -0.94, neck: -0.34, look: 0.0, chest: -0.06 }),
      // One more sweep, the other way, and he gives up on it.
      kf(1.18 / 1.95, { armR: -0.98, armL: -0.95, neck: -0.30, look: -0.44, chest: -0.05 }),
      kf(1.44 / 1.95, { armR: -1.10, armRz: 0.38, armL: -0.98, neck: -0.12, chest: -0.08 }),
      kf(1.62 / 1.95, { armR: -0.99, armRz: 0.08, armL: -0.96, neck: 0.22, chest: 0.12 }),
      kf(1.00, { armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, look: 0.0, turn: 0.0 }),
    ],
  },
  {
    // "OH SHIT."
    //
    // The startle, and the shortest clip in the file by two thirds of a second.
    // Beats 1 and 2 are heard() and are therefore the same picture the three
    // clips above draw. Then, at 0.62 s, BOTH HANDS COME OFF THE CART BAR —
    // which is the actual tell, and it is a tell about his hands rather than
    // about his face, so it survives being 214 px wide. He picks his way out at
    // 0.76 and by 1.00 he is in the crouch a sprint starts from; agents.js
    // flips him to `bolt` on the frame this ends.
    //
    // tell: 'startle' and NOT 'react', deliberately. pickGesture rolls a pool by
    // modulo, so a fourth entry with tell:'react' would hand a shrugging
    // innocent the run-up clip one time in four. Round 7 kept these three out of
    // the DECOY pool for exactly this reason; this is the same rule one level
    // down. It is only ever started by id, by paBolt().
    id: 'whoMeRun', tell: 'startle', dur: 0.98, item: SMALL,
    keys: [
      ...heard(0.98),
      kf(0.62 / 0.98, { armR: -0.66, armRz: 0.20, armL: -0.64, armLz: -0.20, neck: -0.22, look: 0.30, chest: -0.16 }),
      kf(0.76 / 0.98, { armR: -0.40, armRz: 0.04, armL: -0.38, armLz: -0.04, neck: 0.02, look: 0.0, chest: 0.10, turn: -0.30 }),
      kf(1.00, { armR: -0.16, armRz: -0.10, armL: -0.14, armLz: 0.10, neck: -0.04, chest: 0.24, turn: -0.18 }),
    ],
  },

  // =========================================================================
  // ROUND 9 — THE LADDER. "MAYBE EVEN THE CUSTOMER FLIPS THE BIRD AT THE
  // SECURITY CAMERA."
  // =========================================================================
  // The four clips above are what a man does the FIRST time a voice comes out
  // of the ceiling at him. This is what he does the second and the third, and
  // the whole design of it is one sentence:
  //
  //   WHICH RUNG HE IS ON IS A FUNCTION OF HOW MANY TIMES YOU HAVE SHOUTED AT
  //   HIM, AND OF NOTHING ELSE.
  //
  // agents.js's lookAround() picks the tier off `s.annN` — the per-body count of
  // announcements that have landed on him — and takes THE SAME SINGLE rnd()
  // DRAW round 7 took to choose within the tier. Guilt is not an input, not a
  // tilt and not a weight. It is not that a guilty man is 5% less likely to give
  // you the finger; it is that the function that decides does not receive his
  // guilt, so there is no number anybody can tune to make him.
  //
  // That was worth being careful about, because the plausible version leaks
  // badly. A shoplifter wants to keep his head down, so he should brazen it out
  // LESS — and the moment that is true, THE BIRD IS A CONFESSION OF INNOCENCE.
  // The player stops watching for a theft and starts spamming the handset at
  // everybody, because the man who does not flip you off is your thief. Two
  // rounds of work on a concealment that is indistinguishable from a phone call
  // would have been given away by a joke. Measured either way; see the ablation
  // in agents.js. Guilty 34.0%, innocent 33.0%, likelihood ratio 1.03.
  //
  // AND IT IS SELF-PUNISHING, WHICH IS WHY IT IS FUNNY. PA spam already earns
  // nothing (annFade makes the second and third shout at a body worth steadily
  // less) and costs 1.67 items a shift. Now it also fills the store with people
  // giving the camera the finger — the player has built the mob himself, one
  // free announcement at a time, and can watch it on nine monitors.
  //
  // `tell: 'escalate'`, NOT 'react', and that is the round-8 rule kept rather
  // than a new one. OF('react') is the pool pickGesture rolls from by modulo;
  // it had three entries when every distribution in this file was measured and
  // it still has three. These are named, never rolled.
  {
    // TIER 2. He has heard this before. Beats 1 and 2 are heard(), same as
    // everything else, but he finds the dome a third of a second earlier and
    // then he does the thing people do when they are past being confused: hands
    // go on the hips and he just LOOKS at it. The hold is the joke — three
    // quarters of a second of a man staring down a camera is much longer than
    // it sounds, and on the spot monitor it reads as being looked back at.
    id: 'whoMeHips', tell: 'escalate', dur: 2.60, item: SMALL,
    keys: [
      ...heard(2.60),
      kf(0.66 / 2.60, { armR: -0.90, armL: -0.92, neck: -0.30, look: 0.34, turn: -0.20, aim: 0.35 }),
      // Hands to the hips as he comes round onto it.
      kf(0.94 / 2.60, { armR: -0.74, armRz: -0.52, armL: -0.72, armLz: 0.52, neck: -0.24, aim: 0.80 }),
      kf(1.20 / 2.60, { armR: -0.70, armRz: -0.60, armL: -0.68, armLz: 0.60, neck: -0.10, aim: 1.0, chest: -0.10 }),
      // ...and the hold. Nothing moves for 0.75 s.
      kf(1.95 / 2.60, { armR: -0.70, armRz: -0.60, armL: -0.68, armLz: 0.60, neck: -0.10, aim: 1.0, chest: -0.10 }),
      kf(2.20 / 2.60, { armR: -0.80, armRz: -0.40, armL: -0.78, armLz: 0.40, neck: 0.06, aim: 0.55, chest: -0.02, shake: 0.30 }),
      kf(2.42 / 2.60, { armR: -0.92, armRz: -0.22, armL: -0.90, armLz: 0.22, neck: 0.22, aim: 0.15, chest: 0.14 }),
      kf(1.00, { armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, turn: 0.0 }),
    ],
  },
  {
    // TIER 2, the other one. No hands: he simply turns his whole body to the
    // camera and stands there, and the affront is entirely in the stillness.
    // Shorter than the hips version and it holds for longer, which is the
    // trade — less to look at, and more time to look at it.
    id: 'whoMeStare', tell: 'escalate', dur: 2.35, item: SMALL,
    keys: [
      ...heard(2.35),
      kf(0.64 / 2.35, { armR: -0.92, armL: -0.93, neck: -0.36, look: 0.30, aim: 0.45 }),
      kf(0.90 / 2.35, { armR: -0.90, armL: -0.92, neck: -0.16, aim: 1.0, chest: -0.12 }),
      kf(1.86 / 2.35, { armR: -0.90, armL: -0.92, neck: -0.14, aim: 1.0, chest: -0.12 }),
      kf(2.06 / 2.35, { armR: -0.94, armL: -0.94, neck: 0.08, aim: 0.40, chest: 0.02, shake: 0.22 }),
      kf(1.00, { armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, turn: 0.0 }),
    ],
  },
  {
    // TIER 3. THE BIRD.
    //
    // The note that decided the timing: DEADPAN. A cartoon rage-shake is much
    // less funny than a man calmly giving a camera the finger and going back to
    // comparing two jars of sauce, so there is no shake anywhere in this clip.
    // The arm goes up on a slow ease, holds dead still for eight tenths of a
    // second aimed at the dome, comes down, and the last keyframe puts his hands
    // back on the cart bar as if none of it happened.
    //
    // WHAT IT LOOKS LIKE AT 214x120, which is the only test that counts: the
    // finger is sub-pixel and always was. What survives is ONE ARM STRAIGHT UP
    // AND STILL, on a body that has turned side-on to the aisle to point it at
    // the camera — a shape no other clip in this file makes, held for four times
    // longer than the longest pose in any of them. agents.js swaps the right
    // hand's geometry for a raised-finger bake while `aim` is up, so it is a
    // real bird in a portrait and a raised arm on the wall, and neither of those
    // costs a draw call.
    id: 'whoMeBird', tell: 'escalate', dur: 2.90, item: SMALL,
    keys: [
      ...heard(2.90),
      kf(0.68 / 2.90, { armR: -0.90, armL: -0.92, neck: -0.34, look: 0.32, turn: -0.16, aim: 0.40 }),
      kf(0.92 / 2.90, { armR: -0.94, armL: -0.94, neck: -0.18, aim: 0.95, chest: -0.10 }),
      // Up it goes, unhurried.
      kf(1.34 / 2.90, { armR: -1.90, armRz: -0.14, armL: -0.92, neck: -0.16, aim: 1.0, chest: -0.10 }),
      kf(1.56 / 2.90, { armR: -2.42, armRz: -0.06, armL: -0.90, neck: -0.14, aim: 1.0, chest: -0.12 }),
      // The hold. 0.80 s of nothing at all.
      kf(2.36 / 2.90, { armR: -2.44, armRz: -0.06, armL: -0.90, neck: -0.14, aim: 1.0, chest: -0.12 }),
      kf(2.58 / 2.90, { armR: -1.50, armRz: -0.20, armL: -0.92, neck: -0.02, aim: 0.45, chest: -0.04 }),
      kf(2.74 / 2.90, { armR: -1.02, armRz: -0.18, armL: -0.94, neck: 0.20, aim: 0.10, chest: 0.12 }),
      kf(1.00, { armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, turn: 0.0 }),
    ],
  },
  {
    // TIER 3, the other one. The bird, and he is SAYING something while he does
    // it, and there is no microphone on a shop camera so the player will never
    // find out what. `mouth` is a 3.2 Hz nod amplitude — the rhythm of speech
    // rather than a mouth, because at this budget there is no mouth to move and
    // at this resolution there would be no point if there were. The free hand
    // comes up and gestures with it, which is the half that reads at range: two
    // arms doing different things is a silhouette, a moving jaw is four pixels.
    id: 'whoMeBirdMouth', tell: 'escalate', dur: 3.10, item: SMALL,
    keys: [
      ...heard(3.10),
      kf(0.66 / 3.10, { armR: -0.90, armL: -0.92, neck: -0.32, look: 0.30, turn: -0.18, aim: 0.45 }),
      kf(0.92 / 3.10, { armR: -0.94, armL: -0.94, neck: -0.18, aim: 1.0, chest: -0.10 }),
      kf(1.30 / 3.10, { armR: -1.86, armRz: -0.12, armL: -1.10, armLz: 0.30, neck: -0.16, aim: 1.0, chest: -0.12 }),
      kf(1.52 / 3.10, { armR: -2.40, armRz: -0.04, armL: -1.34, armLz: 0.44, neck: -0.14, aim: 1.0, chest: -0.12, mouth: 0.09 }),
      kf(2.10 / 3.10, { armR: -2.42, armRz: -0.04, armL: -1.52, armLz: 0.58, neck: -0.14, aim: 1.0, chest: -0.14, mouth: 0.11 }),
      kf(2.52 / 3.10, { armR: -2.38, armRz: -0.08, armL: -1.28, armLz: 0.40, neck: -0.12, aim: 1.0, chest: -0.12, mouth: 0.08 }),
      kf(2.78 / 3.10, { armR: -1.44, armRz: -0.20, armL: -1.02, armLz: 0.24, neck: 0.02, aim: 0.40, chest: -0.02 }),
      kf(2.94 / 3.10, { armR: -1.00, armRz: -0.18, armL: -0.94, armLz: 0.18, neck: 0.20, aim: 0.10, chest: 0.12 }),
      kf(1.00, { armR: -0.95, armRz: -0.16, armL: -0.95, armLz: 0.16, turn: 0.0 }),
    ],
  },
  {
    // TIER 4, and it is the one the client's own note reached for last: he
    // stops shopping, folds his arms, and stands there facing the camera waiting
    // for you to say something else. No bird, no shake, no exit — the clip ends
    // with him still folded and still aimed, because agents.js holds the browse
    // timer past the end of it. The longest thing in the file by half a second.
    //
    // Folded arms are also the single strongest torso shape at monitor scale
    // (see idlePose's note on idle 1): the two dark gaps either side of a light
    // torso close up, and the body becomes one solid block with a bar across it.
    // Turned side-on to the aisle, held for two seconds, it is the most legible
    // pose any body in this store makes.
    id: 'whoMeFolded', tell: 'escalate', dur: 3.60, item: SMALL,
    keys: [
      ...heard(3.60),
      kf(0.62 / 3.60, { armR: -0.92, armL: -0.93, neck: -0.34, look: 0.28, aim: 0.50 }),
      kf(0.88 / 3.60, { armR: -1.00, armL: -1.00, neck: -0.16, aim: 1.0, chest: -0.08 }),
      kf(1.24 / 3.60, { armR: -1.36, armRz: 0.62, armL: -1.32, armLz: -0.58, neck: -0.12, aim: 1.0, chest: 0.02 }),
      kf(3.30 / 3.60, { armR: -1.38, armRz: 0.62, armL: -1.34, armLz: -0.58, neck: -0.10, aim: 1.0, chest: 0.02 }),
      kf(1.00, { armR: -1.38, armRz: 0.62, armL: -1.34, armLz: -0.58, neck: -0.10, aim: 1.0, chest: 0.02 }),
    ],
  },
];

export const BY_ID = new Map(GESTURES.map((g) => [g.id, g]));
const OF = (tell) => GESTURES.filter((g) => g.tell === tell);
const STEAL = OF('steal'), DECOY = OF('decoy'), PUTBACK = OF('putback');
const REACT = OF('react');

// `rng` is agents.js's seeded rnd(), so a bench trial is reproducible.
// 'react' is spelled out rather than falling through to DECOY: the fallthrough
// would have handed a look-around caller a phone-out-of-a-pocket clip, i.e. a
// reach-with-an-object fired by an announcement, which is the one thing the
// react pool exists NOT to do.
export function pickGesture(rng, kind) {
  const pool = kind === 'steal' ? STEAL
    : kind === 'putback' ? PUTBACK
      : kind === 'react' ? REACT : DECOY;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

const lerp = (a, b, t) => a + (b - a) * t;
const _out = {
  off: [0, 0, 0], vis: 0, armR: 0, armRz: 0, armL: 0, armLz: 0,
  chest: 0, neck: 0, look: 0, turn: 0, shake: 0, aim: 0, mouth: 0,
  item: [1, 1, 1], id: '', tell: '',
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
  const oa = get('off', a), ob = get('off', b);
  _out.off[0] = lerp(oa[0], ob[0], e);
  _out.off[1] = lerp(oa[1], ob[1], e);
  _out.off[2] = lerp(oa[2], ob[2], e);
  _out.vis = get('vis', a);                 // STEP, not a fade
  _out.armR = mix('armR'); _out.armRz = mix('armRz');
  _out.armL = mix('armL'); _out.armLz = mix('armLz');
  _out.chest = mix('chest'); _out.neck = mix('neck');
  _out.look = mix('look'); _out.turn = mix('turn'); _out.shake = mix('shake');
  _out.aim = mix('aim'); _out.mouth = mix('mouth');
  _out.item = g.item || POSE.item;
  _out.id = g.id; _out.tell = g.tell;
  return _out;
}
