// CHOP PRICER — shared world contract.
// OWNED BY LEAD. Builders read from here; do not redefine these numbers locally.

export const UNIT = 1;                 // 1 world unit = 1 meter
export const AISLE_COUNT = 8;
export const AISLE_LEN = 26;           // meters, running along +Z
export const AISLE_GAP = 4.0;          // walkable width between shelf runs
export const SHELF_W = 1.3;            // depth of one shelf run
export const SHELF_H = 2.05;           // top of shelf (gondola) height
export const CEIL_H = 5.2;             // drop ceiling height

// Aisle i centerline X. Aisle numbers shown to the player are i+1.
export const aisleX = (i) => (i - (AISLE_COUNT - 1) / 2) * (AISLE_GAP + SHELF_W);

export const STORE = {
  minX: aisleX(0) - (AISLE_GAP + SHELF_W),
  maxX: aisleX(AISLE_COUNT - 1) + (AISLE_GAP + SHELF_W),
  minZ: -AISLE_LEN / 2 - 7,   // front of store (checkouts, entrance, service desk)
  maxZ: AISLE_LEN / 2 + 5,    // back of store (dairy/frozen wall)
};

export const FRONT_WALK_Z = STORE.minZ + 3.5; // cross-aisle in front of checkouts
export const BACK_WALK_Z  = STORE.maxZ - 2.5; // cross-aisle along the back wall
// Mid-store cross-aisle. store.js, agents.js and camera.js all need this; it lived
// privately in store.js as CROSS_Z, which is one copy away from the duplication
// hazard in CLAUDE.md. This is its home.
export const MID_WALK_Z   = -0.70;
export const EXIT = { x: STORE.minX + 3.0, z: STORE.minZ + 0.4 };
// Second exit, 35m from Door 1. Two doors is what inverted the door-camping
// exploit — one door made the thief's destination public knowledge.
export const EXIT2 = { x: EXIT.x + 35.0, z: STORE.minZ + 0.4 };
export const SERVICE_DESK = { x: STORE.maxX - 4.0, z: STORE.minZ + 2.0 };

// --- Chase tuning. The second bar lives in these numbers. ---
export const TUNING = {
  copWalk: 2.35,
  copRun: 5.05,          // thief is slightly faster; you lose without a powerup
  thiefWalk: 1.25,
  thiefRun: 5.35,
  copAccel: 9.0,
  staminaMax: 1.40,       // seconds of sprint from full
  staminaDrain: 1.0,
  staminaRegen: 1.72,
  gassedPenalty: 0.62,   // speed multiplier while winded
  boostMul: 1.42,
  boostTime: 3.00,
  suspicionRadius: 4.5,  // thief bolts when cop closes inside this
  catchRadius: 1.15,

  // Thief stamina. He fades to a cruise so both parties gas out together and the
  // gap parks ~2.8m out instead of growing without bound. Adrenaline is a
  // gap-proportional floor that just exceeds the cop's sprint.
  thiefWind: 2.60,
  thiefTired: 0.575,
  thiefPanic: 0.965,
  thiefPanicGap: 3.00,
  thiefPanicBand: 0.90,

  // Powerups sit on the shelf lip and need a real lateral reach, otherwise they
  // land in the cop's lap mid-aisle and every chase is secretly a boosted one.
  pickupLip: 1.58,
  pickupRadius: 0.62,
  pickupReach: 1.25,

  // --- Corked-aisle counterplay (round 3) ---
  // The cop is priced as a cost inside the exit flood, so "out the back, along the
  // rear cross-aisle, down another aisle" emerges as a route only when it is
  // genuinely cheaper. copThreat* applies ONLY downstream of the runner: without
  // that filter a cop merely BEHIND the thief prices the ground he is standing on,
  // the flood hands him a sidestep instead of a sprint, and the stern chase leaks
  // from 1.3% caught to 79%.
  copThreatR: 3.00, copThreatW: 110.0, copLead: 0.30, threatAhead: 3.00,
  fleeEvery: 0.17, fleeMove: 0.70, fleeNear: 12.0,
  thiefLook: 17.0, thiefBlockCos: 0.60,
  // Shoulder barge: decided by where the cop stands at the moment of commitment.
  // Hold the lane centre and you have him; drift off one side and he goes past the
  // other for a 0.45s stumble.
  jukeRange: 5.20, jukeAhead: 0.34, jukeHold: 0.85, jukeLat: 1.75, jukeLip: 0.97,
  grabSlack: 0.45, bargeGrace: 0.50, stumbleT: 0.28, stumbleMul: 0.72,
  nerveLo: 0.55, nerveHi: 1.55,

  // --- Round 6: one exit, and a reason not to stand on it ---
  // The client asked for a single exit so the player knows where they're going and
  // gets a chance to cut them off. Measured with round-5 rules that is a disaster:
  // a door-camper scores 91% and the aisle number is worth EXACTLY ZERO (82.0 at
  // off0, 82.0 at off1). Four mechanics pay for it, none of them geometry: he won't
  // commit with a uniform on the door, he won't walk into one either (ditches the
  // goods after dumpT), he only bolts from a man coming AT him (boltNear), and
  // innocents leave by the same door so "heading for the exit" isn't a confession.
  // Camper income is now zero pts/shift in every shift sampled — his 27% catch rate
  // describes nothing, because the denominator is what he destroyed.
  deterR: 8.5, deterSpeed: 1.35, deterT: 2.20, deterSight: 26.0,
  deterBalk: 3.00, chillLo: 14.0, chillHi: 30.0, dumpT: 11.0,
  raceEdge: 0.98, raceSlack: 3.20, boltNear: 9.00,
  identR: 12.0, identT: 0.45, identPick: 2.30, identCool: 1.10,
  shopLo: -14.0, shopHi: 165.0, decoyLo: 9.0, decoyHi: 22.0,

  // --- Round 6: difficulty ramp. Level-0 multipliers; 1.0 = level 1 = round 5. ---
  // rampRun stays 1.00 deliberately: "make the thief slower early" makes the game
  // HARDER by 27 points, because a slower man is still walking out when the dispatch
  // lands, so the cop arrives BEHIND him — and behind is a verdict, not a position.
  // rampWalk is the real lever: tell-to-door window 14% longer, near-free on the floor.
  rampRun: 1.00, rampWalk: 0.88, rampReact: 2.40, rampAdren: 0.55,
  rampTell: 1.35, rampNerve: 1.55, rampStagger: 0.40,

  // --- Round 7: "hey, put that back" — deterrence at range, at a chosen subject.
  // Guilty 63.3% comply / innocent 32.5% comply. Likelihood ratio on a put-back is
  // 1.95: one call moves a 50/50 suspicion to 66%, a shrug to 35%. A read, not a test.
  // Four things hold that line: a third of thieves brazen it out; innocents put
  // things back too, using the IDENTICAL putback clip; everyone within annSpill
  // looks up, because a PA is a loudspeaker and not a laser; and annFade makes
  // repeat shouts converge at ~78% rather than 100%.
  // The row that proves it hardest is annHeedHot — once it is already in his coat,
  // 35.0% against the innocent 32.5% means the call carries NO information at all.
  // The information only exists in the window where the payout is zero anyway.
  // A PA-spam player earns 0 pts/shift AND loses 1.67 items: strictly worse than the
  // camper, who at least stops the goods leaving. Zero complaints on this path by
  // construction — it is the safe alternative to walking up to him.
  annHeed: 0.62,       // P(comply) — guilty, has not concealed yet
  annHeedHot: 0.34,    // ...and once it is already in his coat
  annSpook: 0.30,      // P(an INNOCENT sheepishly puts back what is in his hand)
  annNerve: 0.45,      // how much per-subject nerve tilts the roll
  annFade: 0.45,       // x per previous shout at the same body — stops the slot machine
  annSpillMul: 0.45,   // bystanders take it less personally
  annSpill: 7.0,       // m — everyone this close to the subject looks up too
  annLagLo: 0.35, annLagHi: 0.95,   // s before he reacts
  annCool: 6.0,        // s between PA calls (game.js's button cooldown is the real gate)
  annHold: 4.5,        // s a 'hold' call pins him for
  annHuff: 0.55,       // x remaining shopT — a customer shouted at in public shops less

  // --- Round 4: two doors, and going through a man ---
  // One door made the thief's destination public knowledge, and public knowledge
  // beats a scouting report — a camper scored 80.7% at wrong-aisle-by-1. Two doors
  // 35m apart plus a per-subject door preference (people leave by the door they
  // came in by) inverts it: camper 4.0%, pursuer 60.0%. A third door was built,
  // measured, and thrown away: 13 points of difficulty for no design gain.
  thiefAccel: 10.5,
  thiefAdren: 4.20, thiefAdrenBack: 0.17,
  doorShove: 0.85, doorBias: 7.50,
  // The barge needed BOTH halves: ending up through the cop (97% -> 81% still
  // caught) AND costing him 1.5s of wind (-> 59%). The cop's sprint is 64% faster
  // than the thief's cruise and reclaims two metres a second, so push-through
  // alone was not a tactic. Half the tank is what makes it one.
  bargeStagger: 0.55,

  // --- Round 5: the four-round bug ---
  // Gassed speed read (wantSprint ? copRun : copWalk) * gassedPenalty, so a cop who
  // had blown his lungs and was STILL HOLDING sprint did 5.05*0.62 = 3.13 m/s, while
  // a full-tank cop who chose to walk did 2.35. Gassing out was an UPGRADE over
  // pacing yourself, so no recovery gate could ever make rationing pay. Attribution:
  // the gate was worth 5.9 points, this was worth 32.5.
  // gassedSprintMul MUST stay under 0.53 or the inversion returns.
  gassedSprintMul: 0.35,
  gassedRecover: 1.00,   // WINDED is all-or-nothing
  regenHold: 0.00,       // regen granted while the sprint key is still down
 bargeSlow: 0.22, bargeWindFrac: 0.48, bargeDump: 0.85,
};

export const CAMERAS = [
  { id: 'CAM 01', label: 'AISLE 1-2',   pos: [aisleX(0) - 2, 4.4, -AISLE_LEN / 2 - 1], look: [aisleX(1), 1.0, 4] },
  { id: 'CAM 02', label: 'AISLE 3-4',   pos: [aisleX(2) - 2, 4.4, -AISLE_LEN / 2 - 1], look: [aisleX(3), 1.0, 4] },
  { id: 'CAM 03', label: 'AISLE 5-6',   pos: [aisleX(4) - 2, 4.4, -AISLE_LEN / 2 - 1], look: [aisleX(5), 1.0, 4] },
  { id: 'CAM 04', label: 'AISLE 7-8',   pos: [aisleX(6) - 2, 4.4, -AISLE_LEN / 2 - 1], look: [aisleX(7), 1.0, 4] },
  { id: 'CAM 05', label: 'FRONT END',   pos: [0, 4.6, STORE.minZ + 1],  look: [0, 1.0, STORE.minZ + 9] },
  { id: 'CAM 06', label: 'BACK WALL',   pos: [0, 4.6, STORE.maxZ - 1],  look: [0, 1.0, STORE.maxZ - 9] },
  { id: 'CAM 07', label: 'EXIT DOORS',  pos: [EXIT.x - 1, 4.2, EXIT.z + 6], look: [EXIT.x, 1.0, EXIT.z] },
  { id: 'CAM 08', label: 'PRODUCE',     pos: [STORE.maxX - 1, 4.6, STORE.maxZ - 6], look: [STORE.maxX - 9, 1.0, STORE.maxZ - 10] },
  // Door 2 had no camera, so a subject in its vestibule sat in no frustum at all.
  // Filing him under EXIT DOORS anyway measured WORSE than the least-wrong channel
  // (-1pp for the reader, +5 for the guesser) because the roster then named a
  // channel showing an empty doorway 35m away. Label must contain DOOR or EXIT so
  // the wall pairs it with CAM 07 in the right-hand column.
  { id: 'CAM 09', label: 'DOOR 2',     pos: [EXIT2.x + 1, 4.2, EXIT2.z + 6], look: [EXIT2.x, 1.0, EXIT2.z] },
];
