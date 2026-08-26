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
  // ROUND 9 — THE DRINK BUYS FOOTWORK, NOT JUST LEGS. `steer()` turns a radius
  // out of speed and grip, so a boosted 7.17 m/s cop was carrying a 7.32 m
  // turning circle (sober: 3.35 m) into a lane with 1.58 m of usable half-width.
  // He was losing the duel the drink had just bought him. Round 5 wrote "fast is
  // not agile" as prose; this is the arithmetic behind it. Worth +11.0 points of
  // drink value on its own, the largest single term in restoring it.
  boostGrip: 2.40,
  suspicionRadius: 4.5,  // thief bolts when cop closes inside this
  catchRadius: 1.15,

  // ---- ROUND 12: HOW FAR THE PURSUER CAN SEE. ONE NUMBER, TWO READERS. ------
  // For eleven rounds the player's HUD drew the runner's exact position, gap and
  // door ETA THROUGH SOLID SHELVING, while agents.js's bench bot had to hold
  // line of sight. Two pieces of code owned "what does the pursuer know", they
  // disagreed by 11 points of catch rate, and nothing asserted it. game.js now
  // derives every positional marker from agents' own nav.clearSeg().
  //
  // This is the last hand copy in that derivation. It is read TWICE:
  //   game.js  SIGHT_R                      — already reads it via sightCheck()
  //   agents.js botInput() blind branch     — STILL A BARE LITERAL `< 20`
  //
  // ACTION FOR builder-agents, one line each and then this stops being a
  // hazard: add `get botSightR() { return t('botSightR', 20.0); }` to the K
  // block and replace botInput's literal with K.botSightR. game.js's
  // sightCheck() ALREADY compares SIGHT_R against agents.K.botSightR and is
  // null-guarded, so it is dormant today and starts asserting the instant that
  // getter exists — no further change on either side.
  //
  // 20 m is deliberately shorter than an aisle (26 m): a shape at the far end of
  // your own run is a shape, not a subject, and that is the bot's rule too.
  botSightR: 20.0,

  // Thief stamina. He fades to a cruise so both parties gas out together and the
  // gap parks ~2.8m out instead of growing without bound. Adrenaline is a
  // gap-proportional floor that just exceeds the cop's sprint.
  thiefWind: 2.60,
  thiefTired: 0.575,
  thiefPanic: 0.965,
  thiefPanicGap: 3.00,
  thiefPanicBand: 0.90,

  // --- ROUND 9: THE THIEF'S THIRD TANK ---------------------------------------
  // Round 5 named this lever by hand and deferred it: "give the THIEF the same
  // rhythm the cop just got — a cruise that decays under sustained pressure
  // instead of a flat floor — so that the cop who paced himself still has legs
  // at second eight." It is in.
  //
  // `thiefTired` ABOVE HAS CHANGED MEANING AND ITS VALUE HAS NOT. It is now the
  // ANCHOR, and the base of the bot's own estimate of him, rather than the man's
  // flat cruise. His BLOWN cruise is still exactly thiefTired to three decimals,
  // so nothing was taken away from him; only his first seconds are new. Anyone
  // sweeping thiefTired is still sweeping the bot's model of the thief as well as
  // the thief — round 5's warning at that constant stands, and now has one more
  // reader.
  thiefFreshMul: 1.183,   // x thiefTired — legs FULL
  thiefSpentMul: 1.000,   // x thiefTired — legs GONE, i.e. identical to round 8
  thiefLegs: 34.0,        // s, fresh -> spent

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

  // --- Round 8: "oh shit" — the third answer to the PA, and the only one worth
  // points. Carved out of the SHRUG interval of round 7's SINGLE roll, so every
  // compliance rate is unmoved: set annBolt and annBoltCold to 0 and this build IS
  // round 7, every row to the decimal. Put-back likelihood ratio 1.98 vs 1.95.
  //
  // The gate is GEOMETRY, not a mode check — beatsCopToDoor(). He does not run at a
  // door you are standing in front of, so the flush is available exactly when you
  // are too far away to use it: 29.2% from the service desk, 22.5% from 8m behind,
  // 0.0% from the aisle mouth you were just dispatched to, 0.0% from the door,
  // 0.0% for innocents anywhere. That kills the walk-to-10m-and-scan exploit.
  // Announcing at a man you have already made is worth 8.4 expected points against
  // a dispatch's 77.0 — nine times worse. That is the price of the information.
  annBolt: 0.30,       // P(run) — guilty, already has it in his coat
  annBoltCold: 0.13,   // ...and before he has committed. He takes it with him.
  annBoltNerve: 0.35,  // nerve tilt, INVERTED against the compliance tilt
  annShakeHz: 2.10,    // head shake, Hz. Clip owns amplitude, renderer owns the rate.
  annHuffT: 7.0,       // s of visible annoyance after a shrug — guilty or not, or the
                       //   huff would be the tell the shrug is not.
  annHuffPace: 1.18,   // x walk while huffing

  // --- The bird. Armed by annN ALONE, deliberately off the compliance roll.
  // The first build put it in the rung-4 shrug pool and measured LR 0.26 — four
  // times more likely from an innocent. The ladder was not leaking: a react clip is
  // only reachable THROUGH the shrug, so it inherited the shrug's ratio to two
  // decimals. It was not adding information, it was making existing information
  // impossible to miss, which for a monitor-wall player is the same thing.
  // Off the roll entirely, a man who COMPLIES and then flips you off gets one too,
  // and LR(bird | armed) is 1.00. At 214x120 the finger does not read and never
  // would — what reads is the body turned side-on to the aisle, held still 0.8s.
  birdRung: 4,
  birdGap: 0.55,

  // --- Round 10: confusion, not anger. The client: "I don't think the shoppers
  // should stop and shake their hands and get mad. I DO want them to take notice...
  // I want them to look around and look really confused."
  // whoMeAffront was MOVED to rung 3, not changed — not one keyframe touched — and
  // a new whoMeLost took its place: four places he looks and none of them is it,
  // ending in a two-handed palms-up shrug held 0.55s. In a store whose posture
  // language is people folded over a trolley, two forearms held out from the body
  // is a shape nothing else in the file makes. No shake below rung 3.
  // Every likelihood-ratio cell is IDENTICAL to the ablation: the rebalance changes
  // what a subject looks like and moves no probability at all.
  annReach: 14.0,      // m — proximity is a strength, not a switch
  annNearCut: 0.55,    // below this weight (6.3m) the confusion collapses to a glance
  annMadRung: 3,       // anger is earned, not the default
  annPuzzT: 4.5, annPuzzPace: 0.88, annTailFar: 0.42,
  annScanHz: 0.42,     // head keeps sweeping — an eighth of the 2.10Hz shake it replaces
  annScanAmp: 0.30,
  frontEndCount: 7,    // staffed lane, service desk, second lane, bagger

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

// CHANNEL LINEUP — what the channels ARE. Ids, labels, and which aisle each covers.
// This is the contract game.js and store.js read.
//
// WHERE THEY PHYSICALLY HANG IS NOT DECIDED HERE. `pos`/`look` below are a fallback
// only; src/cctv.js overrides them in cameraRig() and owns the pose, the lens and the
// mount. That split exists because the lead placed these twice and got it wrong twice:
// first at 4.35m, where the domes saw over the 2.05m gondolas and 54.3% of roster rows
// named an aisle the subject was not in; then at 2.62m in one flat row at the aisle
// mouths, which made "channel N is aisle N" literally true and destroyed the look —
// "you really screwed up the effect... they're blocked by the sign... the new layout
// sucks." Placement is a LOOK decision. It has to be judged by whoever can render the
// frame and look at it, not computed from aisle arithmetic by someone who cannot.
export const CAMERAS = [
  ...Array.from({ length: AISLE_COUNT }, (_, i) => ({
    id: `CAM 0${i + 1}`,
    label: `AISLE ${i + 1}`,
    aisle: i,                                   // authoritative: channel i watches aisle i
    pos: [aisleX(i), 2.62, FRONT_WALK_Z + 1.6], // FALLBACK ONLY — cctv.js overrides
    look: [aisleX(i), 1.15, BACK_WALK_Z - 1.0],
  })),
  { id: 'CAM 09', label: 'DOOR 1', aisle: null,
    pos: [EXIT.x + 1.2, 4.2, EXIT.z + 6.5], look: [EXIT.x, 1.0, EXIT.z] },
];
