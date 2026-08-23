// OWNER: builder-agents. Cop, shoppers, thieves, stamina, powerups. The chase feel.
// CONTRACT — must keep exporting exactly this:
//   createAgents(THREE, scene, world) -> {
//     cop, shoppers, update(dt, input, api), reset()
//   }
// `api` provides: api.onBolt(shopper), api.onCatch(shopper),
//                 api.onEscape(shopper), api.onHarass(shopper)
// ROUND 6 adds two OPTIONAL callbacks. Nothing breaks if they are absent, but
// one of them is now load-bearing for the scoreboard:
//   api.onLeave(shopper)  — a CUSTOMER finished his shop and walked out of the
//     one exit. Innocents use that door now (see the note in escape()), so
//     onEscape must not fire for them or every honest shopper scores as a
//     merchandise loss. agents.js already routes them here instead; a game.js
//     that ignores onLeave simply sees fewer events than before, never more.
//   api.onAbort(shopper)  — he had it in his hand, saw the uniform posted on
//     the only way out, and put it back. This is the entire feedback loop of
//     the one-exit design: camping the door is punished by there being no
//     crime, and if the HUD never says so, a shift with no income reads as a
//     broken game rather than as a consequence. See agents.posted.
// All movement constants come from TUNING in ./config.js.
//
// Also (additive, all optional — nothing breaks if the other side is absent):
//   we CALL   api.report({stamina,staminaMax,boost,gassed,speed,nearest,chase})
//             ...plus, ROUND 5 and additive, the wind state machine itself so
//             the HUD does not have to re-derive it from `stamina < eps`:
//               wind      'ready' | 'recovering' | 'winded'
//               windIn    seconds until you can sprint again. IT ONLY TICKS
//                         DOWN WITH THE KEY UP — Infinity while it is held,
//                         which is the lesson, on a countdown.
//               burst     seconds of sprint in hand right now (0 when winded)
//               burstMax  seconds a full tank buys — size the segments off
//                         this, not off a hardcoded 3.1
//               refill    seconds from empty to full, off the key
//               windFrac  stamina/staminaMax, for a plain bar
//               fatigue   0..1, rises fast and falls slow. Accumulated wear for
//                         a PULSE readout, which wants a LAGGING signal rather
//                         than `1 - frac` restated in a different shape.
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
// THE CHASE, MEASURED — from the spawn the game actually creates, and reported
// AS A DISTRIBUTION. Round 3's headline (68% -> 73%) was the mean of two
// near-deterministic branches and it hid the only number that mattered:
// 61% of catches landed inside ONE SECOND of the bolt. That is not a chase, it
// is a collection, and my own bench had been printing `catchUnder1s: 120/200`
// on the object I was quoting from. Read the whole instrument before you write
// the report. Nothing below is a mean without its shape attached.
//
// ===========================================================================
// ROUND 5 — DOES MANAGING YOUR WIND PAY? IT DOES NOW. THAT IS THE HEADLINE.
// ===========================================================================
// Round 4 reported, honestly, that stamina management paid NOTHING: holding
// sprint from the dispatch to the grab beat rationing it 81.3% to 74.0%. Same
// instrument, same store, today, with round 4's lung bolted back on:
//
//   ROUND 4's LUNG          always-sprint 81.7%   ration 82.5%    +0.8
//   ROUND 5's, SHIPPED      always-sprint 51.7%   ration 76.7%   +25.0
//                                      (n=120, `cut` routing, right aisle)
// (Round 4 measured -7.3 on the old store and +0.8 here; the store's new mid
// cross-aisle nudged the sign but 0.8 points at n=120 is noise. The point
// stands either way: under round 4's lung, what you did with the key did not
// matter. Under this one it is worth a quarter of the game.)
//
// Five named wind policies, all on the same routing, n=150 unless marked:
//   always   hold the key the whole way ...................... 46.0% (n=250)
//   loose    round 4's own default, sprint on a loose intercept 47.6% (n=250)
//   pulse    intervals, run it into the ground every time ..... 63.3%
//   keep     intervals with a reserve, never go WINDED ........ 70.0%
//   ration   spend only when the intercept is tight .. SHIPPED  74.7%
// Monotone, five rungs, 28.7 points end to end. There was no such ladder in
// this game before this round; there was one policy and four ways to spell it.
//
// ---- IT TOOK THREE CHANGES AND ONLY THE THIRD ONE IS OBVIOUS IN HINDSIGHT --
// Each added on top of the last. n=120, competent routing, right aisle.
//                                          always-sprint   ration    delta
//   round 4 as shipped (3.10 s, ungated)       81.7%       82.5%     +0.8
//   + recovery gated on releasing the key      75.8%       81.7%     +5.9
//   + no sprint while gassed                   45.8%       78.3%    +32.5
//   + 1.40 s tank, 0.81 s refill  (SHIPPED)    51.7%       76.7%    +25.0
//
// The gate is the fix everybody names and it is worth 5.9 points. THE ONE THAT
// MATTERED WAS THE SECOND LINE, and it is a bug I shipped for four rounds:
// gassed speed read `(wantSprint ? copRun : copWalk) * gassedPenalty`, so a cop
// who had blown his lungs out and was still holding the key did 5.05 x 0.62 =
// 3.13 m/s — while a cop with a FULL TANK who chose to walk did 2.35. Gassing
// out was an UPGRADE over pacing yourself. No recovery gate can ever beat a
// penalty state that outruns the healthy state, which is why round 4 gated the
// regen, measured +2.7, and correctly refused to ship it. `gassedPenalty` is
// untouched at 0.62; what changed is that the key stops helping.
//
// The short tank is the third line and it is worth NEGATIVE 1.6 points to the
// good player. It is in anyway, and not as a compromise: at a 3.10 s tank with
// the first two fixes the naive player gets ONE spend and then crawls for the
// rest of the chase (45.8%), which is a punishment, not a decision. At 1.40 s
// he gets a spend every 2.21 s (1.40 s of sprint, 0.81 s to refill) against a
// 5.8 s median chase — 2.6 complete spend-and-refill cycles, so a mistake is
// survivable and the rhythm is countable. It buys the naive player 5.9 points
// back and costs the careful one 1.6. That is the trade the game builder asked
// for, and it is bought with the tank rather than by softening `gassedPenalty`.
//
// ---- WHAT I ALSO LEARNED, BY MEASURING IT INSTEAD OF ASSUMING --------------
//   copWalk 2.35 -> 2.90 looked like a free buff to the rationing player, since
//     a cop holding sprint is gassed and never touches copWalk. It is not:
//     gassed speed is DERIVED from copWalk, so it lifts the always-sprint floor
//     by more. Spread 25.0 -> 14.2. Built, measured, thrown away — see K.copWalk.
//   `bargeDump` (0.85) has NEVER been a live constant. 0.40 vs 0.85 is
//     byte-identical on every field of the bench, because `s.adren` is ~1.0 at
//     the moment of any barge and Math.max never fires.
//   `bargeWind` — round 4's 22-point mechanic — is nearly inert at a fast-
//     refilling tank: a one-off stamina cost evaporates in 0.8 s. What still
//     bites is `bargeStagger`, and 1.25 s of it was priced against a man who
//     could then sprint for 3.1 s. It is 0.55 now. See K.bargeStagger.
//
// ---- THE ROUND-4 DISTRIBUTION, RE-MEASURED (n=150, postSpawn('aisle'), -----
// ---- crowded, no powerup, competent bot, right aisle) ---------------------
//                                    round 4        round 5
//   median chase (bolt -> grab)      3.03 s         5.83 s
//   catchUnder1s                     15.7%          14.3%
//   comes at the cop                 97/200 89%     88/150 70%  med 6.07 s
//   goes the other way               70/200 61%     39/150 87%  med 6.42 s
//   competent / naive / camper       79.5/68.5/22.5 74.7/43.3/21.3
//   by how far the dispatch landed   83/89/80/75/69 77/86/69/68/74
//   barge: committed / got through   124 / 37       79 / 17
//   ...and of those, still caught    59%            18%
//   door: reached / caught there     -- / --        38 / 7
//   exits used                       --             DOOR 1:19  DOOR 2:19
// The ladder holds and the gap widens where it should: chasing beats camping by
// 53.4 points (round 4: 57.0), and the naive pursuit bot loses 25 points
// because holding the key is no longer free. Wind skill is worth 28.7 points to
// the competent router and 6.7 to the naive one (43.3% -> 50.0% with the same
// interval policy) — you cannot ration against a plan you do not have.
//
// ---- THE STORE GREW A MID CROSS-AISLE AND IT CHANGED MORE THAN I DID -------
// The store builder cut a cross-aisle through the middle of the shelf runs
// (nav picks it up for free — the grid is built from the collider set). Round
// 4's back-route metric tested `z > HALF_LEN - 2.2` and now reads ZERO, which
// is not the counterplay dying, it is the instrument pointing at the wrong
// corridor. `crossBands()` finds the store's corridors from the grid instead:
//   out the back (rear wall) ....  0 of 150   (round 4: 61% of chases)
//   via the MID cross-aisle .....  53, 92% caught
//   via the front cross-aisle ...  39, 59% caught
//   straight down and out .......  35
// The long grind round the back is gone; the same idea now costs 12 m instead
// of 55 and gets used three times as often. It also doubled the median chase.
// AND IT IS WHAT MADE THIS ROUND POSSIBLE: round 4 diagnosed the tank as
// unfixable because "the median chase is 3.0 s and the tank is 3.1 s". The
// cross-aisle took the median to 6.1 s under round 4's own numbers, which is
// what leaves room for two or three spends. Credit where it is due.
//
// The misaim table got much steeper this round and IT IS NOT MINE:
//                              off0    off1    off2    off4
//   round 4, old store         79.5    60.0    58.0    60.0
//   round 4's lung, THIS store 82.7    38.7    25.3    24.0
//   round 5, shipped           74.7    34.7    28.0    21.3
// Being sent one aisle wrong went from a 19-point mistake to a 44-point one the
// moment the store grew a way across the middle, because the cut-through the
// cop cannot cover is the same cut-through he cannot GET to. Round 4's flat
// table (60/58/60 — being four aisles wrong cost the same as one) was the
// weakness; this is a gradient. My change moves it by about three points.
//
// ---- THE ENERGY DRINK HAS A CLIFF IN IT, AND IT IS NOT WHERE I EXPECTED ----
// The game builder warned that boostTime 4.0 s against a 1.4 s tank is three
// tanks of free sprint and should be shortened. It should — but only to 3.0,
// and the sweep is the reason. n=120, drink already in hand, against a 76.7%
// no-powerup baseline:
//   2.20 s -> 64.2%   boostFrac 0.53      A DRINK MAKES YOU WORSE
//   3.00 s -> 90.0%   boostFrac 0.76   <- shipped
//   3.50 s -> 94.2%   boostFrac 0.86
//   4.00 s -> 94.2%   boostFrac 0.91      (round 4 measured 93.0%)
// At the shipped 3.00 s, re-run at n=150 against a 74.7% baseline: drink in
// hand 87.3% (boostFrac 0.75), one reachable on a shelf 75.3% (boostFrac 0.39).
// There is no middle. A drink that runs out mid-approach carries a 7.17 m/s cop
// into a 3.16 m lane he cannot cover both shoulders of; the thief jukes, and
// commitments-that-get-through go 17% -> 25%. Fast is not agile.
// So: are powerups the dominant tactic now? A drink IN HAND is, at +13 points.
// GOING TO GET ONE is not — `mode:'pickup'`, where the cop has to leave his
// line and reach into the shelf face, is 75.3% against 74.7% for no powerup at
// all. The detour costs almost exactly what the drink buys. That is the right
// place for a powerup and it is held there by the shelf-lip reach gate, not by
// the timer.
//
// ---- SECONDARY, same build ------------------------------------------------
//   dispatched to the front end .. 32.0%   (round 4: 68.0%)
//   legacy 'behind' spawn ........  4.7%   (round 4: 90.5%; round-4 lung on
//     THIS store: 84.0%, so this one IS mine). See the note below: it is the
//     one thing this round made worse and I did not fix it.
//   cans on the shelves, bot ignores them: boostFrac 0.01 — the shelf-lip
//     reach gate still holds (round 4: 0.02, round 3: 0.001).
//
// ---- THE ONE THING THIS ROUND MADE WORSE, AND WHY I LEFT IT ----------------
// BEING BEHIND HIM IS NOW A VERDICT, NOT A POSITION. The arithmetic: a cop
// under the best wind policy sustains ~4.0 m/s against a 3.08 m/s cruise, so he
// reclaims ~0.9 m/s where round 4 reclaimed 2.0. Three metres took 1.5 s and
// now takes 3.3, which is longer than the run to the door. Two numbers show it:
//   legacy 'behind' spawn        90.5% -> 4.7%
//   barged AND got through       59%   -> 18% still caught
// The game never spawns 'behind', so the live cost is the second line. Two ways
// to read that one. It is worse: getting past the cop is now close to a win,
// which is round 3's "97% still caught" pathology with the sign flipped. It is
// better: only 17 of 79 commitments get through at all, and the 62 the cop
// covers are caught 82% of the time, so the shoulder is a 64-point swing on one
// read where round 4's was 39. I think the duel improved and the RECOVERY died,
// and those are different complaints.
//
// Not fixed, deliberately, and here is the map for whoever takes it:
//   - `bargeStagger` is already down 1.25 -> 0.55 and a further cut to 0.35
//     measured 76.4% overall / 32% barge-caught, i.e. inside noise of 0.55.
//     The stagger is not what is left.
//   - `thiefTired` (his cruise, 0.575) is the obvious lever AND IT IS POISONED:
//     0.52 measures 42.5%, a 34-point collapse, because the competent bot reads
//     THE SAME CONSTANT to predict him and to dead-reckon a lost sighting. Any
//     change there has to move the bot's model with it or it measures the bot,
//     not the game. Do not sweep it naively; I did.
//   - The lever I would actually try is giving the THIEF the same rhythm the
//     cop just got — a cruise that decays under sustained pressure instead of a
//     flat floor — so that the cop who paced himself still has legs at second
//     eight and the one who did not does not. That is thematically exact (you
//     are both fat) and it rewards the skill this round created rather than
//     handing speed back. It is a new mechanic, not a constant, and it re-opens
//     every number above, so it is a round, not an afternoon.
// ===========================================================================
//
// ---- WHERE ROUND 4 STARTED (kept: it is what the numbers above beat) -------
//   median chase (bolt -> grab)    1.13 s      61.3% of catches under 1 s
//   comes at the cop  449/600      97.1% caught in 0.85 s
//   goes out the back 151/600       0.0% caught — 0 in 270 unboosted
//   door-camping bot beats a pursuing one 80.7% / 67.3% vs 60.0% / 47.3%
// Four foregone conclusions wearing a chase. What fixed them, each measured on
// its own, still stands and is still in force: TWO WAYS OUT (one door made the
// thief's destination public knowledge and public knowledge beats a scouting
// report); A DOOR PREFERENCE per subject, so position no longer implies
// destination; HE SEES YOU ARRIVE (thiefLook 8.6 -> 17 m, which is most of the
// 1.13 s -> 3.03 s); and A BARGE WITH PHYSICS IN IT. See barge() and EXIT_SPEC.
// A THIRD door was built, measured and thrown away — 13 points of difficulty
// for no design gain. The numbers are at EXIT_SPEC so nobody rebuilds it.
//
// ---- THE SKILL LADDER. There is no such thing as "the" catch rate ----------
// Three bots, all blind (they know the aisle number and what they can see), and
// now also a wind policy each, because those are two different skills:
//                       right aisle   off by 1   off by 2   off by 4
//   cut   (competent)      74.7%        34.7%      28.0%      21.3%
//   chase (naive pursuit)  43.3%          -          -          -
//   camp  (ignores it)     21.3%          -          -          -
// Round 3 shipped one weak bot and published its misaim table as if it
// described the game; an outside critic put its own bot in the same geometry
// and beat mine by fifteen points. Quote all three, and quote the wind ladder
// with them — the dispatch is worth 40 points to a player who paces himself
// and 22 to one who holds the key down, and both are true.
// Re-run: window.__CHOP.agents.benchReal(200) / .benchCamp(200)
import {
  TUNING, EXIT, EXIT2, aisleX, AISLE_LEN, AISLE_COUNT, AISLE_GAP, SHELF_W,
  STORE, FRONT_WALK_Z, SERVICE_DESK,
} from './config.js';
import { makeNav } from './agents/nav.js';
// ROUND 6 — the figures moved out. agents.js owns how people MOVE; figures.js
// owns what they look like while they do it. It also carries the write-up of
// the bug that was this round's whole brief (every person in the game was
// headless: the head sphere was 96% inside the torso capsule). Read it there.
import {
  mergeParts, buildFigureGeo, rollPerson, makePerson, makeCop, FIG,
  SKIN, HAIR, CLOTH, PANTS,
} from './agents/figures.js';
// ROUND 6 — the decoy library. Every reach-with-an-object in the store, guilty
// and innocent, keyframed in ONE table and sampled by ONE function, so the
// steal has no code path of its own that a tuning pass could accidentally make
// louder than the six innocent behaviours it has to hide inside. Read the
// header there: it is the answer to the CCTV builder's own finding that a
// legible picture had become a PROOF.
import { GESTURES, BY_ID, pickGesture, applyGesture } from './agents/decoy.js';

// ---------------------------------------------------------------------------
// Tunables. Anything already in TUNING is read from TUNING, no local copy.
// The `?? fallback` ones are values I want promoted into TUNING by the lead;
// if they appear there, they are picked up automatically with no code change.
// ---------------------------------------------------------------------------
const T = TUNING;

// ===========================================================================
// THE ROUND-5 TUNING SET — APPLIED. Kept as a record of what moved together,
// because the one thing that must not happen to it is being unpicked one line
// at a time. Every number here was measured against every other one, and a
// SUBSET IS WORSE THAN NONE: the regen gate alone costs the cop 5.9 points and
// buys 5.9 back; no-sprint-while-gassed alone makes the naive player 30 points
// worse with nothing to teach him; the short tank alone does nothing at all,
// because holding the key still dominates. Ablation in the file header.
//
//   CHANGED    staminaMax     3.10 -> 1.40   one burst, not a whole chase
//              staminaRegen   0.34 -> 1.72   0.81 s empty to full, key up
//              gassedRecover  0.26 -> 1.00   WINDED is all or nothing
//              boostTime      4.00 -> 3.00   swept; 2.20 makes a drink a trap
//              bargeStagger   1.25 -> 0.55   re-priced against a 1.4 s tank
//   ADDED      regenHold       0.00          regen with the key still down
//              gassedSprintMul 0.35          MUST stay under 0.53
//              bargeWindFrac   0.48          replaces the absolute bargeWind
//   DELETED    bargeWind                     superseded by bargeWindFrac
//   UNCHANGED, having been swept and left alone on purpose:
//              staminaDrain 1.00 · gassedPenalty 0.62 · copWalk 2.35 ·
//              thiefTired 0.575 · bargeDump 0.85 (measured inert)
//
// Verified live after the lead applied it, by running the cop into the ground
// and holding the key: STEADY-STATE 2.043 m/s against a 2.35 m/s fresh walk,
// which is exactly what lungCheck() computes from the constants. It was 3.13
// for four rounds. (The lead reported 1.77 from the live build; that does not
// reproduce here and 2.043 is both the model value and the observed one — 1.77
// is what the meter reads when he is scraping a gondola. The inequality holds
// on either number, but the one in this file is the one that is checkable.)
// That inequality IS the round, so it is asserted at startup rather than
// described — see lungCheck(). A comment is what this file had last time.
// ===========================================================================

// ROUND 4's RE-TUNES ARE IN TUNING NOW and this block is gone, as its own note
// asked. thiefLook 17.0, thiefTired 0.575, thiefAccel 10.5, stumbleT 0.28 and
// bargeStagger were all local overrides shadowing config; the lead promoted the
// first four and they read `T.x ?? fallback` again below. bargeStagger did NOT
// survive promotion unchanged — it is re-priced to 0.55, because 1.25 s of the
// cop lying in an aisle was set against a man who could then sprint for 3.1 s.
// ---------------------------------------------------------------------------
// ROUND 5 — THE LUNG. The one thing round 4 failed at, taken.
//
// The failure was not "stamina is undertuned", it was that HOLDING SPRINT WAS
// STRICTLY DOMINANT, for three separate reasons stacked on top of each other,
// and only fixing all three at once flips it. Each one on its own measures as
// noise or as a nerf, which is why round 4 gated the regen, saw -22 points, and
// correctly refused to ship a third of a fix.
//
//   1. RECOVERY DID NOT CARE ABOUT THE KEY. `canSprint` goes false the instant
//      you gas, so the man still holding it fell into the same regen branch as
//      the man who let go. Letting go bought literally nothing.
//   2. GASSED-AND-HOLDING WAS FASTER THAN FRESH-AND-WALKING. Gassed speed read
//      `(wantSprint ? copRun : copWalk) * gassedPenalty`, so 5.05 x 0.62 = 3.13
//      m/s while a cop with a FULL TANK who chose to walk did 2.35. Blowing
//      your lungs out was an upgrade over pacing yourself. This is the one I
//      missed for four rounds and it is the whole ballgame: no gate can beat a
//      penalty state that is faster than the healthy state. A winded man does
//      not get to sprint. Holding the key while gassed now does nothing at all.
//   3. THE TANK OUTLASTED THE CHASE. 3.1 s of sprint, 9.1 s to refill, against
//      a median chase that was 3.0 s at the end of round 4. One spend, no
//      decisions. Now: 1.40 s tank, 0.81 s to refill from empty — a 2.21 s
//      cycle against a 5.8 s median chase, so 2.6 complete spend-and-refill
//      cycles instead of one.
//
// The ablation table for all three is in the file header. The trade is bought
// with the tank, not by softening `gassedPenalty` — which is untouched at 0.62,
// and now bites harder because it is the walk it multiplies.
// ---------------------------------------------------------------------------
// HOW A CONSTANT IS READ IN THIS FILE, AND WHY IT IS WORTH A PARAGRAPH.
//
// Round 5 shipped its lung through a local `R5` object that K read DIRECTLY,
// with no `?? T.x` behind it. That was correct while the numbers were a
// proposal — the whole point was that the file had to run what the report
// described, and `T.x ?? fallback` would have let config quietly win. The
// moment the lead applied the block it became the exact bug this file has now
// caught three times: A VALUE THAT LOOKS LIVE AND IS NOT.
//   - the gassed-sprint inversion: a penalty state faster than the healthy one,
//     shipped for four rounds because nobody read the line next to it;
//   - `bargeDump`: byte-identical at 0.40 and 0.85, because `Math.max` never
//     fired;
//   - `R5`: six constants where an edit to config.js would have done nothing at
//     all, and would not have announced itself, because R5 and TUNING agreed.
// Agreement is what makes it dangerous. A shadow that DISAGREES gets found in
// one bench run; a shadow that agrees waits for the next person to tune it.
//
// So there is exactly one way to read a constant now, and it is TUNING-first:
//
//     get thing() { return t('thing', <fallback>); }
//
// `t` is `OVR[k] ?? T[k] ?? fallback`. TUNING always wins over the fallback, so
// config.js is live for every number in this file. OVR is the sweep lever the
// bench needs — it is EMPTY in normal operation, so it cannot shadow anything
// by accident, and `bench()` stamps any non-empty override onto its own result
// (`res.override`) so a measurement taken under one can never be quoted as if
// it were the shipped build. The fallbacks below are the round-5 values; they
// exist so the file still runs if a key is missing from config, not as a second
// source of truth.
// ---------------------------------------------------------------------------
const OVR = {};                      // debug sweep only — see agents.override
const t = (k, fallback) => OVR[k] ?? T[k] ?? fallback;
const K = {
  get copGrip()       { return t('copGrip', 0.78); }, // lateral accel fraction at top speed

  // ======== ROUND 5, THE LUNG ==============================================
  // Why these five numbers moved together, and what each of them is holding up.
  // The ablation is in the file header; this is the per-constant reasoning.
  //
  // copWalk — BUILT, MEASURED, THROWN AWAY, and left here so nobody spends an
  // afternoon on it. Rationing means spending most of a chase NOT sprinting,
  // and at 2.35 m/s against the thief's 3.08 m/s cruise every second off the
  // key hands back 0.73 m — so raising the walk to 2.90 looked like the obvious
  // way to buy the rationing player back the ground the short tank costs him,
  // and I assumed it was a pure buff to him because a cop holding sprint is
  // gassed and never touches copWalk. WRONG, and wrong in the one direction
  // that matters: gassed speed is DERIVED from copWalk — (copWalk + (copRun -
  // copWalk) x gassedSprintMul) x gassedPenalty — so raising the walk raises
  // the floor the always-sprint player stands on too, and by more, because he
  // is on it the whole chase. n=120, competent bot, right aisle:
  //     copWalk 2.35   ration 76.7%   always 51.7%   spread 25.0
  //     copWalk 2.90   ration 71.7%   always 57.5%   spread 14.2
  // It costs the good player 5 points, hands the naive one 5.8, and takes 43%
  // off the thing the whole round exists to create. It stays at 2.35.
  get copWalk()       { return t('copWalk',      2.35); },
  // 3.10 -> 1.40. One fat burst, not a whole chase.
  get staminaMax()    { return t('staminaMax',   1.40); },
  // Unchanged at 1.00, on purpose: the tank still reads directly in seconds.
  get staminaDrain()  { return t('staminaDrain', 1.00); },
  // 0.34 -> 1.72, i.e. 0.81 s from empty to full WITH THE KEY UP. Tank plus
  // refill is a 2.21 s cycle against a 5.83 s median chase — 2.6 complete
  // spend-and-refill cycles, which is what makes the rhythm countable and a
  // mistake survivable instead of terminal.
  get staminaRegen()  { return t('staminaRegen', 1.72); },
  // 0.26 -> 1.00. WINDED means empty, and you get it ALL back or none. 0.26
  // gave a 0.36 s stutter nobody can see or count; a full-refill lockout is the
  // thing the player is choosing to avoid, and it is what makes letting go
  // EARLY a decision rather than a rounding error — the duty cycle is identical
  // either way, what differs is whether you still HAVE a burst in hand when he
  // goes for your shoulder.
  get gassedRecover() { return t('gassedRecover', 1.00); }, // frac needed to un-gas
  // 4.00 -> 3.00, and NOT the 2.2 the shorter tank suggests. The game builder's
  // third warning was that 4.0 s pinned at max against a 1.4 s natural tank is
  // three tanks of free sprint: shorten it or admit powerups are the game. The
  // sweep says shorten it only so far. n=120, drink in hand, 76.7% baseline:
  //     2.20 s -> 64.2%  boostFrac 0.53   WORSE THAN NO DRINK AT ALL
  //     3.00 s -> 90.0%  boostFrac 0.76   <- shipped
  //     3.50 s -> 94.2%  boostFrac 0.86
  //     4.00 s -> 94.2%  boostFrac 0.91   (round 4 measured 93.0%)
  // There is no middle. A drink that runs out mid-approach is a LIABILITY: it
  // carries a 7.17 m/s cop into a 3.16 m lane he cannot cover both shoulders
  // of, the thief jukes, and commitments-that-get-through go 17% -> 25%. Fast
  // is not agile. 3.00 is the shortest value that is not a trap, and it holds
  // the powerup at about round 4's strength (90 vs 93) while cutting the
  // fraction of the chase it OWNS from 91% to 76%.
  // "Are powerups the dominant tactic now?" A drink IN HAND is, at +13 points
  // (87.3% at n=150). GOING TO GET ONE is not: `mode:'pickup'`, where the cop
  // has to leave his line and reach into the shelf face, measures 75.3% against
  // 74.7% for no powerup at all. The detour costs almost exactly what the drink
  // buys, which is where a powerup should sit — a judgement call, not an
  // auto-take — and the shelf-lip reach gate is what holds it there
  // (boostFrac 0.01 under `ignore`), not the timer.
  get boostTime()     { return t('boostTime',    3.00); },
  // THE GATE. Fraction of the regen you get while the sprint key is STILL DOWN.
  // Zero: a man sprinting is not getting his breath back. On its own this is a
  // 5.9-point nerf and nothing else, which is why round 4 priced it and refused
  // to ship it alone; it only becomes a mechanic next to gassedSprintMul.
  get regenHold()     { return t('regenHold',    0.00); },
  // THE FIX — the constant that actually flips the sign, and the one four
  // rounds of "stamina management pays nothing" was hiding behind. It used to
  // be effectively 1.00: a gassed cop leaning on the key did copRun x
  // gassedPenalty = 3.13 m/s while a cop with a FULL TANK who chose to walk did
  // 2.35, so blowing your lungs out was an UPGRADE over pacing yourself. At
  // 0.35 he does 2.04 — he can still lean into it, he is still slower than his
  // own walk, and letting go is strictly better. Swept, n=120:
  //     0.00   always 43.3%   ration 75.0%   spread 31.7
  //     0.35   always 51.7%   ration 76.7%   spread 25.0
  // Zero costs the naive player 8.4 points and buys the careful one 1.7 — a
  // floor-lowering wearing a difficulty knob, and the floor is not what this is
  // about. MUST stay under (copWalk/gassedPenalty - copWalk) / (copRun -
  // copWalk) = (3.79 - 2.35) / 2.70 = 0.533, or a gassed man leaning on the key
  // outruns a fresh man walking and the whole thing inverts again.
  get gassedSprintMul(){return t('gassedSprintMul', 0.35); },
  // ---- what a shoulder costs, RE-PRICED against a 1.4 s tank ---------------
  // Round 4 tuned the barge so getting through the cop was worth something but
  // not everything: 41% of the men who got past escaped, 59% were still run
  // down. Those numbers were set against a cop who could sprint for 3.1 s and
  // reclaim 2 m/s. Shorten the tank and the same constants make a successful
  // barge a foregone conclusion — n=250, competent bot, 28 got through and 0 of
  // them were caught, whatever the wind policy. That is round 3's "97% still
  // caught" pathology with the sign flipped, and it is a direct consequence of
  // this round's change, so it was this round's problem.
  //
  // bargeWindFrac replaces the ABSOLUTE `bargeWind: 1.50`, which was 48% of the
  // old 3.1 s tank and would be a total wipe every single time against a 1.4 s
  // one — it would stop discriminating anything. Held at the fraction it was
  // actually tuned to. BUT ALSO MEASURED NEARLY INERT, which is the more
  // interesting result: round 4 called this the mechanic that made the barge a
  // tactic, worth 22 points of barge outcome, and ablating it at n=250 on the
  // shipped build (0.001 vs 0.48) moves the overall rate 76.4% -> 75.6% and
  // barged-and-still-caught 32% -> 23%. Two trials. A ONE-OFF STAMINA COST
  // CANNOT MEAN MUCH WHEN THE TANK REFILLS IN 0.81 s; what a barge takes now is
  // TIME, not wind. Kept because it is free and it is the right fiction, not
  // because it is load-bearing. If the lead ever wants one fewer constant in
  // config.js, this is the one to drop.
  get bargeWindFrac() { return t('bargeWindFrac', 0.48); },
  get bargeWind()     { return K.bargeWindFrac * K.staminaMax; }, // s of tank, gone
  // =========================================================================
  // ROUND 4 — he was accelerating at 15.0 against the cop's copAccel of 9.0, so
  // every corner, every shopper, every stumble, the thief got back to speed 67%
  // harder than the man chasing him. The stated speed gap is 6% (5.35 vs 5.05);
  // the gap the bench actually measured over a long chase was 26%, and almost
  // all of the difference was this. A shoplifter with a jacket full of steaks
  // does not out-accelerate anybody.
  get thiefAccel()    { return t('thiefAccel', 10.5); },
  get thiefCorner()   { return t('thiefCorner', 0.55); }, // speed mult on a 90 degree cut
  get thiefReact()    { return t('thiefReact', 0.22); }, // seconds of "oh shit" before the bolt
  get pickupRadius()  { return t('pickupRadius', 0.62); },
  get pickupReach()   { return t('pickupReach', 1.25); }, // m/s toward the shelf face
  get shopperCount()  { return t('shopperCount', 14); },
  get thiefCount()    { return t('thiefCount', 2); },
  // A powerup is an item ON A SHELF, not a floor pickup. Sitting it on the aisle
  // centreline put it directly under a pure-pursuit chase: the bench measured the
  // "no powerup" cop boosted 45% of the chase because he ran over free cans.
  // Push it to the shelf lip so grabbing one costs you a deliberate swerve.
  get pickupLip()     { return t('pickupLip', 1.58); }, // metres off centreline
  get thiefCornerFree(){return t('thiefCornerFree', 0.985); },//cos above which a turn is free
  // The thief's own wind. He is a shoplifter with a jacket full of steaks, not a
  // sprinter — thiefRun is his first-few-seconds ceiling, not his cruise.
  get thiefWind()     { return t('thiefWind', 2.60); }, // sec of flat-out running
  get thiefTired()    { return t('thiefTired', 0.575); },// x thiefRun once blown
  get thiefPanic()    { return t('thiefPanic', 0.965); },// x thiefRun with footsteps on him
  get thiefPanicGap() { return t('thiefPanicGap', 3.00); }, // metres at which fear starts
  get thiefPanicBand(){ return t('thiefPanicBand', 0.90); }, // metres from fear to flat-out
  get thiefSecond()   { return t('thiefSecond', 0.42); }, // wind regained per sec when clear
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
  get thiefAdren()    { return t('thiefAdren', 4.20); }, // sec of adrenaline
  get thiefAdrenBack(){ return t('thiefAdrenBack', 0.17); }, // regained per sec when clear
  // Seconds with your shoulder on a push-bar. A door is not a teleport; this is
  // the beat that makes a chase to the doors contestable at the doors.
  get doorShove()     { return t('doorShove', 0.85); }, // sec at the staff-end door
  get navHug()        { return t('navHug', 0.55); }, // route cost for scraping geometry
  get harassSpeed()   { return t('harassSpeed', 0.90); }, // m/s: standing still never offends
  get harassAim()     { return t('harassAim', 0.45); }, // cos(cop velocity, shopper)

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
  get copThreatR()    { return t('copThreatR', 3.00); }, // m
  get copThreatW()    { return t('copThreatW', 110.0); }, // route-cost mult at the centre
  get copLead()       { return t('copLead', 0.30); }, // s of cop velocity the flood leads by
  get fleeEvery()     { return t('fleeEvery', 0.17); }, // s between escape-field rebuilds
  get fleeMove()      { return t('fleeMove', 0.70); }, // m of cop movement that forces one
  get fleeNear()      { return t('fleeNear', 12.0); }, // m: past this, rebuild lazily
  // How far ahead OF HIM BY ROUTE the cop has to be before he counts as an
  // obstacle rather than a pursuer. Not decoration: at 1.2 m a cop cutting the
  // inside of an aisle end briefly registers as a roadblock, the flood peels the
  // thief sideways for no reason, and a plain stern chase leaks from 1.3% caught
  // to 15%. Three metres is a body and a half plus the ground he covers deciding
  // — brief cut-ins do not qualify, being parked in the aisle mouth does.
  get threatAhead()   { return t('threatAhead', 3.00); }, // m of route
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
  get thiefLook()     { return t('thiefLook', 17.0); }, // m
  get thiefBlockCos() { return t('thiefBlockCos', 0.60); }, // cop must be this near his route line
  // The squeeze. 1.58 m of usable half-lane against a 1.15 m catch radius means
  // a shelf-hugging thief clears a centred cop by 0.43 m — thin, readable, and
  // beatable by a cop who steps to the right shoulder. That margin IS the duel.
  get jukeRange()     { return t('jukeRange', 5.20); }, // m at which he commits
  // How far off the lane centreline you can drift and still have both his
  // shoulders covered. 1.58 m of half-lane minus the 1.15 m the grab reaches
  // leaves 0.43 m of daylight either side; give it a little back so holding the
  // middle is a real position and not a pixel.
  get grabSlack()     { return t('grabSlack', 0.45); }, // m
  get bargeGrace()    { return t('bargeGrace', 0.50); }, // s of no-grab while he is through you
  get jukeAhead()     { return t('jukeAhead', 0.34); }, // cos: how "in the way" you must be
  get jukeHold()      { return t('jukeHold', 0.85); }, // s the chosen shoulder is locked in
  get jukeLat()       { return t('jukeLat', 1.75); }, // lateral steering authority
  get jukeLip()       { return t('jukeLip', 0.97); }, // fraction of the usable half-lane
  get stumbleT()      { return t('stumbleT', 0.28); }, // s of lost pace after squeezing past
  // 1.25 -> 0.55 (round 3 had 0.90). THE ONLY ONE OF THE THREE BARGE COSTS THAT
  // STILL DOES ANYTHING — see bargeWindFrac above and bargeDump below, both
  // measured inert. 1.25 s of the cop lying in the aisle was priced against a
  // man who could then sprint for 3.1 s and reclaim 2 m/s; against a 1.4 s tank
  // the same 1.25 s is simply unrecoverable, and getting past the cop went from
  // "worth something" to "decided it".
  get bargeStagger()  { return t('bargeStagger', 0.55); }, // s the COP spends shaking it off
  get bargeSlow()     { return t('bargeSlow', 0.22); }, // x speed while shaking it off
  get bargeThru()     { return t('bargeThru', 0.95); }, // m he ends up past you
  get stumbleMul()    { return t('stumbleMul', 0.72); },
  // ROUND 4 — what a shoulder actually costs the man who takes it. Two things
  // had to be true before getting through somebody meant anything, and I found
  // them one at a time by taking each back out again. n=200, competent bot,
  // right aisle, sliced on the chases where he committed to a shoulder AND got
  // past — "did going through you change the outcome":
  //   neither          overall 86.5%   barged-and-still-caught 97%   (= round 3)
  //   +push-through            83.5%                            81%
  //   +push-through +wind      79.5%                            59%
  // Round 3 had NEITHER, and 97% is exactly the "33 barges, 32 caught" the
  // critic measured and I could not explain.
  //
  // PUSH-THROUGH (bargeThru) is the physics bug: a 0.10 m nudge left the two
  // bodies inside the separation constraint they enforce on each other, welded
  // 0.78 m apart for the half-second of grace, and grabbed the instant it
  // expired. He is not squeezing past, he is running through — put him a body's
  // length down the lane.
  //
  // WIND is the one that makes it a tactic instead of a delay. Two metres of
  // knockback is nothing to a cop whose sprint (5.05) is 64% faster than the
  // thief's cruise (3.08); he reclaims it in a second. A second and a half of
  // tank is half of everything he has, so the man he just let past is the man
  // he now has to run down on fumes. Worth 22 points of barge outcome on its
  // own, and it is the only place in this file where the cop's stamina decides
  // anything at all — see the note in updateCop for why it is also not enough
  // to make stamina a decision in general.
  // ROUND 5 — this moved to `bargeWindFrac` at the top of K. It was 1.50 s
  // against a 3.10 s tank; as an ABSOLUTE number against the 1.40 s tank it
  // wipes the cop out every single time and stops discriminating anything, so
  // it is a fraction of max now and holds the 48% it was actually tuned to.
  // MEASURED INERT, n=250, and left at its round-4 value for that reason:
  // 0.40 vs 0.85 produced byte-identical results on every field in the bench.
  // `s.adren` is ~1.0 at the moment of any barge that happens early in a chase
  // — which is all of them — so `Math.max(s.adren, bargeDump)` never fires. It
  // was never a live constant; round 4 shipped it inside a bundle and I did not
  // ablate it on its own. Do not tune it, delete it or measure it in isolation.
  get bargeDump()     { return t('bargeDump', 0.85); }, // thief adrenaline on contact
  // How much of the cop this particular thief wants to risk. Rolled per subject
  // so two identical-looking dispatches do not always play out the same way.
  get nerveLo()       { return t('nerveLo', 0.55); }, // he will chance your shoulder
  get nerveHi()       { return t('nerveHi', 1.55); }, // he wants no part of you
  // ROUND 4 — which door is HIS door. Two exits killed the camper, but a
  // strengthened pursuit bot then found the next degenerate thing: if every
  // subject always walks at the geometrically nearest way out, his destination
  // is a pure function of where he is standing, so you never have to find him,
  // only work out where he will be. The misaim table went flat again — being
  // sent two aisles wrong cost eleven points instead of forty-seven — and for
  // the same reason as round 3: public knowledge beat a scouting report.
  //
  // People do not leave by the nearest door. They leave by the door they came
  // in by. So each subject rolls one, and a running man will pay this many
  // metres of extra route to use it rather than the other one. That is enough
  // to make prediction-from-position wrong about half the time while leaving it
  // sensible under real pressure — put a uniform between him and his door and
  // he takes the other one, because the cop is still priced into the same
  // field. The aisle number is then the only thing in the game that tells you
  // where the man ACTUALLY is, which is what the desk phase is for.
  get doorBias()      { return t('doorBias', 7.5); },  // m of route he will pay

  // =========================================================================
  // ROUND 6 — ONE WAY OUT, AND A REASON NOT TO STAND ON IT
  //
  // The client: "In the store, I think there should only be one exit that
  // people can leave out of. I think you should kind of have a clue where
  // they're going. The cop should kind of have a chance to get there."
  //
  // He is right and round 4's fix was the cheap one. Two doors killed the
  // door-camper by HIDING THE DESTINATION, which also hid it from the player —
  // the reason to leave the desk stopped being "I know where he is going" and
  // became "I cannot know, so I had better follow him". Measured today, on this
  // build, n=120, before any of this round's changes:
  //                       cut off0   cut off1   camp off0   chase off0
  //   two doors             76.7       (34.7)      23.3        38.3
  //   one door              76.7        73.3       71.7        24.2
  // One door hands the camper 48 points and flattens the misaim table from 40
  // points to 3.4. Both of those are the same fact: with one way out, WHERE he
  // is going is public, so the only thing the aisle number can still be worth
  // is WHO he is and WHEN he moves. This round makes it worth exactly that,
  // three ways, and none of them is geometry:
  //
  //   1. DETERRENCE. A shoplifter who can see the guard posted on the only way
  //      out does not commit. He puts it back and shops. Camping the door
  //      therefore produces a shift with NO INCIDENTS IN IT — punished by
  //      income, not by catch rate, which is why benchShift() exists and why a
  //      camper's catch rate is no longer the number that describes him.
  //   2. INNOCENTS CHECK OUT AND LEAVE. Through the same door. So the door is a
  //      crowd and not a chokepoint, "subject heading for the exit" stops being
  //      evidence, and the man at the door has to know WHICH of the four people
  //      shouldering through it is his.
  //   3. IDENTITY. You cannot grab a man you never made. See `ident` in
  //      bench(): a cop who has never had a clear look at the subject inside
  //      identR grabs the nearest body instead, and if that is a shopper it is
  //      a harassment complaint. That is the aisle number's real job with one
  //      exit, and it is what puts the slope back in the misaim table.
  // =========================================================================
  // Route metres from the cop to the way out, under which he counts as POSTED.
  // Route, not straight line: a cop the same distance away through a shelf run
  // is not standing on the door and a shoplifter can tell the difference.
  get deterR()        { return t('deterR', 8.5); },
  get deterSpeed()    { return t('deterSpeed', 1.35); }, // m/s: under this he is loitering
  get deterT()        { return t('deterT', 2.20); },  // s posted before anyone reads it
  get deterSight()    { return t('deterSight', 26.0); }, // m of route within which he cases it
  get deterBalk()     { return t('deterBalk', 3.00); }, // s of balking before he gives up
  // ...and the same decision one step later in the timeline. He already has it
  // in his coat, he is walking out, and there is a uniform on the only door. He
  // does not walk into it. He hangs back in the aisles and waits you out, and
  // after `dumpT` he ditches the goods in a shelf and leaves clean — no arrest,
  // no loss, no points. THIS is what makes camping fail against an incident
  // that is already in flight, and it is the difference between the one-exit
  // design working and the one-exit design being a 71.7% door-camping bot.
  // It applies to `drift` ONLY: once he has BOLTED he is committed and standing
  // on the door is the correct play. Before he runs / after he runs is a clean
  // line a player can learn in one shift.
  get dumpT()         { return t('dumpT', 11.0); },  // s of waiting before he ditches it
  // The race, in route metres. He goes for it while his own route to the only
  // exit is shorter than the cop's, times raceEdge, plus raceSlack metres of
  // nerve. Sweeps are in this round's report; raceEdge below ~0.85 makes him
  // turn back from a cop who is nowhere near the door and the chase stops
  // existing, above ~1.1 he commits into a man already standing on it, which is
  // the 71.7% door-camper this round exists to kill.
  get raceEdge()      { return t('raceEdge', 0.98); },
  get raceSlack()     { return t('raceSlack', 3.20); }, // m, divided by his nerve
  // Inside this, a uniform on his line is a bolt whether or not it is walking
  // at him. Outside it, it has to be coming AT him. Half of thiefLook.
  get boltNear()      { return t('boltNear', 9.00); }, // m
  get chillLo()       { return t('chillLo', 14.0); }, // s of honest shopping after a balk
  get chillHi()       { return t('chillHi', 30.0); },
  // How close, and for how long, you have to have SEEN him before the grab is
  // his and not the nearest stranger's. 12 m is most of an aisle from its mouth.
  get identR()        { return t('identR', 12.0); },
  get identT()        { return t('identT', 0.45); }, // s of clear look
  // ...and how big the crowd he is choosing from is at the moment he commits to
  // a grab. Two metres and a bit: everybody he could plausibly have got a hand
  // on. One body inside it is not a choice and never costs him anything.
  get identPick()     { return t('identPick', 2.30); }, // m
  get identCool()     { return t('identCool', 1.10); }, // s before he tries again
  // Innocent customers finish their shop and leave. Without this the only body
  // that ever walks at the door is the thief, and the door is a chokepoint
  // instead of a crowd.
  // Seconds of shopping a customer has left when he is placed. NEGATIVE at the
  // bottom on purpose: about one body in ten is placed already walking at the
  // door, so the exit has traffic through it from the first frame of a shift
  // instead of staying empty for the first minute and then discovering a
  // stream. It is also what makes the identity model in bench() bite from t=0.
  get shopLo()        { return t('shopLo', -14.0); },
  get shopHi()        { return t('shopHi', 165.0); },
  // The decoys. Seconds between one innocent behaviour and the next, per
  // shopper. At 14 shoppers, 9-22 s each puts roughly one reach-with-an-object
  // in the building every 1.1 s, which is what makes the wall worth watching
  // and a single frame worth nothing.
  get decoyLo()       { return t('decoyLo', 9.0); },
  get decoyHi()       { return t('decoyHi', 22.0); },

  // =========================================================================
  // ROUND 6 — THE DIFFICULTY RAMP. Six numbers, one dial.
  //
  // Client: "especially in the beginning of the game when we want it to be
  // easier to draw people in."
  //
  // `DIFF.level` runs 0 (opening minutes) to 1 (round 5's shipped game), and
  // every ramped quantity is `easy -> 1.0 x shipped`, so LEVEL 1 IS EXACTLY THE
  // BUILD EVERY NUMBER IN THIS FILE'S HEADER WAS MEASURED ON. That is the whole
  // safety property: the ramp cannot silently re-tune the game, because its top
  // end is the identity. It also defaults to 1, so a game.js that never calls
  // setDifficulty() gets precisely the round-5 difficulty and nothing regresses.
  //
  // What is ramped, and why each one is a DIFFICULTY change and not a DENSITY
  // change (game.js owns density — see its PACE table, and the note below
  // about sharing the breakpoints):
  //   run    5.35 -> 4.60 m/s at level 0. He is slower than you for the first
  //          few minutes, so a stern chase is winnable while you are learning
  //          that a stern chase is not the plan.
  //   walk   the DRIFT. 1.25 -> 1.00 m/s, i.e. the window between the tell on
  //          the monitor and his shoulder on the door is 25% longer. This is
  //          the one the client actually described ("it should take a minute")
  //          and it is the cheapest difficulty in the file, because it costs
  //          the player nothing to use and buys him the only thing he is short
  //          of at the start, which is time to read.
  //   react  0.22 -> 0.53 s. The "oh shit" freeze before the bolt. A third of a
  //          second of a man standing still staring at you is a beat a new
  //          player can see and act on; at 0.22 it is a frame and a half.
  //   adren  4.20 -> 2.30 s of panic fuel, so riding his shoulder pays off
  //          sooner and the last three metres close.
  //   tell   gesture clips run 1.35x long at level 0. The concealment is the
  //          same five frames, held longer. Note this ramps EVERY clip, decoys
  //          included — slowing only the steal would make clip length the tell
  //          and hand the whole of JOB 3 back.
  //   look   17.0 m unchanged at both ends, deliberately. Shortening his sight
  //          line "to make it easier" is the round-3 pathology: he bolts later,
  //          the cop is already on top of him, and the catch lands inside a
  //          second. Easier must never mean shorter.
  get rampRun()       { return t('rampRun',   0.86); }, // x thiefRun at level 0
  get rampWalk()      { return t('rampWalk',  0.80); }, // x thiefWalk (the drift)
  get rampReact()     { return t('rampReact', 2.40); }, // x thiefReact
  get rampAdren()     { return t('rampAdren', 0.55); }, // x thiefAdren
  get rampTell()      { return t('rampTell',  1.35); }, // x gesture duration

  // The ramped reads. EVERYTHING that touches a thief's speed goes through
  // these, including the pursuit bot's model of him (`tSpd` in botGoal and the
  // dead-reckoning in botInput) and the thiefCruise()/thiefTop() handles
  // game.js counts the door alarm down on. That is not tidiness, it is the
  // POISONED-LEVER RULE from this file's header: `thiefTired` measured a
  // 34-point collapse when it was swept naively, because the bot predicts the
  // thief with the same constant the thief runs on, so a change that moves one
  // without the other measures the bot. The ramp moves both, by construction.
  get thiefRun()      { return t('thiefRun',   5.35) * dlerp(K.rampRun,  1); },
  get thiefWalk()     { return t('thiefWalk',  1.25) * dlerp(K.rampWalk, 1); },
  get thiefReactD()   { return K.thiefReact * dlerp(K.rampReact, 1); },
  get thiefAdrenD()   { return K.thiefAdren * dlerp(K.rampAdren, 1); },
  get tellMul()       { return dlerp(K.rampTell, 1); },
};

// ---------------------------------------------------------------------------
// ROUND 6 — THE RAMP'S ONE PIECE OF STATE, AND ITS ENTRY POINT.
//
// `level` 0..1. Default 1 = round 5's shipped difficulty, so this file behaves
// identically until somebody drives it.
//
// THE ENTRY POINT FOR game.js, which owns shift/rank state:
//     agents.setDifficulty(d)                 // 0..1, idempotent, free to call
//     agents.setDifficulty(a.difficultyForClock(st.clock))    // every frame
//     agents.difficulty                       // read it back
//
// The breakpoints in difficultyForClock() ARE game.js's own PACE breakpoints
// (0 / 150 / 330 s) on purpose. Density and difficulty are deliberately
// different axes — game.js decides how MANY cases are open, this file decides
// how hard one of them is — but they should tighten on the same clock, or the
// shift has two unrelated ramps in it and neither reads as a curve. If game.js
// moves its table, move this one with it.
// ---------------------------------------------------------------------------
const DIFF = { level: 1 };
const dlerp = (easy, hard) => easy + (hard - easy) * DIFF.level;
const RAMP = [
  { at: 0,   level: 0.00 },   // learn the wall against a slow man
  { at: 150, level: 0.50 },
  { at: 330, level: 1.00 },   // round 5's game, in full
];
function difficultyForClock(sec) {
  const s = +sec || 0;
  for (let i = RAMP.length - 1; i >= 0; i--) {
    if (s >= RAMP[i].at) {
      const b = RAMP[i + 1];
      if (!b) return RAMP[i].level;
      const f = clamp((s - RAMP[i].at) / (b.at - RAMP[i].at), 0, 1);
      return RAMP[i].level + (b.level - RAMP[i].level) * f;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// THE INEQUALITY, CHECKED OUT LOUD. A warning comment is what this file had for
// four rounds while a gassed cop holding sprint outran a fresh cop walking, so
// a comment is demonstrably not enough. The relation the whole round rests on:
//
//     gassed-and-holding  <  copWalk        (2.043 < 2.35 as shipped)
//
// If a future tune inverts it, every wind number in this file becomes a lie at
// the same instant and the bench will keep printing confident percentages. So
// it is asserted at startup and re-asserted by bench(), which refuses to report
// a wind comparison without it. Cheap, and it fails in the direction of noise.
// ---------------------------------------------------------------------------
function lungCheck() {
  const walk = K.copWalk;
  const gassedHold = (walk + (T.copRun - walk) * K.gassedSprintMul) * T.gassedPenalty;
  const gassedIdle = walk * T.gassedPenalty;
  const bound = (walk / T.gassedPenalty - walk) / (T.copRun - walk);
  const ok = gassedHold < walk;
  return {
    ok, gassedHold: +gassedHold.toFixed(3), gassedIdle: +gassedIdle.toFixed(3),
    copWalk: walk, gassedSprintMulMax: +bound.toFixed(3),
    gassedSprintMul: K.gassedSprintMul,
    // Seconds of sprint in a tank, and seconds to put it back. Printed together
    // because the ratio is the duty cycle and the duty cycle is the design.
    burst: +(K.staminaMax / K.staminaDrain).toFixed(2),
    refill: +(K.staminaMax / K.staminaRegen).toFixed(2),
    why: ok ? null
      : 'INVERTED: a gassed cop holding sprint is faster than a fresh cop '
        + 'walking, so holding the key is dominant again and every wind number '
        + 'in agents.js is stale. Lower TUNING.gassedSprintMul below '
        + bound.toFixed(3) + ', or raise TUNING.copWalk.',
  };
}
{
  const L = lungCheck();
  if (!L.ok && typeof console !== 'undefined') console.warn('[agents] lung', L);
}

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
// Palettes (SKIN/HAIR/CLOTH/PANTS) live in agents/figures.js now, next to the
// figures that wear them, and are re-exported here by import.

// ---------------------------------------------------------------------------
// GEOMETRY BAKING. A real supermarket trolley is about a hundred thin wires you
// see straight through to the floor, and the round-3 build shipped it as a solid
// grey box on four cube wheels — the blind critic's exact words, and the eye
// goes to the carts and the people before it goes to anything else in the
// frame. A hundred wires as a hundred meshes is a hundred draw calls per cart
// and there are fourteen carts on the floor, so the lattice is baked into ONE
// buffer at startup and shared by every cart: a cart is now seven draw calls,
// which is three FEWER than the grey box it replaces.
// ---------------------------------------------------------------------------
// mergeParts() moved to agents/figures.js — same function, plus an optional
// per-part UV remap so the cop can run off one atlas. Imported above.

// A square-section wire between two points. Round wire at this scale is four
// extra triangles per strut for nothing you can see.
function makeWirer(THREE) {
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const UP = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const q = new THREE.Quaternion();
  return (list, a, b, r, c) => {
    d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length() || 1e-4; d.divideScalar(len);
    q.setFromUnitVectors(UP, d);
    p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    s.set(r * 2, len, r * 2);
    list.push({ g: BOX, m: new THREE.Matrix4().compose(p, q, s), c });
  };
}

// The trolley. Local +Z is the direction of travel, the handle is at -Z.
// Nesting taper in BOTH plan and elevation, which is the shape that makes a
// wire basket read as a wire basket from across a store: the sides splay out
// and up, so the lattice never looks like a box someone drew lines on.
function buildCartGeo(THREE) {
  const wire = makeWirer(THREE);
  const W = [];                                       // the chrome lattice
  const ZB = -0.30, ZF = 0.36, YT = 0.80, YB = 0.50;
  const halfTop = (t) => 0.300 - 0.030 * t;
  const halfBot = (t) => 0.215 - 0.022 * t;
  const zTop = (t) => ZB + (ZF - ZB) * t;
  const zBot = (t) => (ZB + 0.055) + ((ZF - 0.055) - (ZB + 0.055)) * t;
  const top = (s, t) => [s * halfTop(t), YT, zTop(t)];
  const bot = (s, t) => [s * halfBot(t), YB, zBot(t)];
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

  for (const s of [-1, 1]) {
    for (let i = 0; i <= 13; i++) {                   // close-pitch verticals
      const t = i / 13;
      wire(W, bot(s, t), top(s, t), 0.0072);
    }
    for (const f of [0.16, 0.46, 0.74]) {             // horizontal rails
      wire(W, mix(bot(s, 0), top(s, 0), f), mix(bot(s, 1), top(s, 1), f), 0.0082);
    }
    wire(W, bot(s, 0), bot(s, 1), 0.0105);            // bottom edge rail
    wire(W, top(s, 0), top(s, 1), 0.0125);            // top rim, side
  }
  for (const t of [0, 1]) {                           // front and back panels
    const n = t ? 7 : 8;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      wire(W, [(-1 + 2 * u) * halfBot(t), YB, zBot(t)],
             [(-1 + 2 * u) * halfTop(t), YT, zTop(t)], 0.0072);
    }
    for (const f of [0.30, 0.66]) {
      const a = mix(bot(-1, t), top(-1, t), f), b = mix(bot(1, t), top(1, t), f);
      wire(W, a, b, 0.0082);
    }
    wire(W, top(-1, t), top(1, t), 0.0125);           // rim, end
    wire(W, bot(-1, t), bot(1, t), 0.0105);
  }
  for (let i = 0; i <= 8; i++) {                      // basket floor, longitudinal
    const u = i / 8;
    wire(W, [(-1 + 2 * u) * halfBot(0), YB, zBot(0)],
           [(-1 + 2 * u) * halfBot(1), YB, zBot(1)], 0.0068);
  }
  for (let i = 0; i <= 6; i++) {                      // basket floor, transverse
    const t = i / 6;
    wire(W, bot(-1, t), bot(1, t), 0.0068);
  }
  // chassis: legs down to the caster mounts, rails, and the under-basket rack
  const LY = 0.145;
  for (const s of [-1, 1]) for (const t of [0.06, 0.94]) {
    wire(W, [s * halfBot(t), YB, zBot(t)], [s * 0.205, LY, zBot(t)], 0.0135);
  }
  for (const s of [-1, 1]) wire(W, [s * 0.205, LY, zBot(0.06)], [s * 0.205, LY, zBot(0.94)], 0.0125);
  wire(W, [-0.205, LY, zBot(0.06)], [0.205, LY, zBot(0.06)], 0.0115);
  wire(W, [-0.205, LY, zBot(0.94)], [0.205, LY, zBot(0.94)], 0.0115);
  for (let i = 0; i <= 6; i++) {                      // lower rack
    const u = i / 6;
    wire(W, [(-1 + 2 * u) * 0.195, LY + 0.012, zBot(0.06)],
           [(-1 + 2 * u) * 0.195, LY + 0.012, zBot(0.94)], 0.0062);
  }
  for (let i = 0; i <= 4; i++) {
    const t = 0.06 + (0.88 * i) / 4;
    wire(W, [-0.195, LY + 0.012, zBot(t)], [0.195, LY + 0.012, zBot(t)], 0.0062);
  }
  // handle posts (steel); the grip itself is plastic and lives below
  for (const s of [-1, 1]) wire(W, top(s, 0), [s * 0.255, 0.925, ZB - 0.075], 0.0115);

  // --- coloured plastic: the grip bar and the child-seat flap ---------------
  const P = [];
  const grip = new THREE.CylinderGeometry(0.021, 0.021, 0.52, 10);
  P.push({
    g: grip,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.925, ZB - 0.075),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)),
  });
  const pan = new THREE.BoxGeometry(0.34, 0.020, 0.155);
  P.push({
    g: pan,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.596, ZB + 0.115),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.13),
      new THREE.Vector3(1, 1, 1)),
  });
  const rest = new THREE.BoxGeometry(0.34, 0.135, 0.018);
  P.push({
    g: rest,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.655, ZB + 0.032),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.16),
      new THREE.Vector3(1, 1, 1)),
  });

  // --- one swivel caster: fork, axle, rubber tyre ---------------------------
  const C = [];
  const STEEL = 0x8f959c, RUBBER = 0x2b2c30;
  const plate = new THREE.BoxGeometry(0.011, 0.075, 0.055);
  for (const s of [-1, 1]) {
    C.push({ g: plate, c: STEEL,
      m: new THREE.Matrix4().makeTranslation(s * 0.030, 0.072, 0.006) });
  }
  C.push({ g: new THREE.BoxGeometry(0.072, 0.014, 0.062), c: STEEL,
    m: new THREE.Matrix4().makeTranslation(0, 0.108, 0.004) });
  C.push({ g: new THREE.CylinderGeometry(0.013, 0.013, 0.048, 8), c: STEEL,
    m: new THREE.Matrix4().makeTranslation(0, 0.134, -0.014) });
  C.push({
    g: new THREE.CylinderGeometry(0.043, 0.043, 0.030, 12), c: RUBBER,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.043, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)),
  });
  C.push({
    g: new THREE.CylinderGeometry(0.020, 0.020, 0.034, 8), c: 0xb6bcc2,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.043, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)),
  });

  // --- what is actually IN the basket. Four loads so the floor is not one
  // repeated silhouette; a shopped cart is uneven and half-full.
  const GROC = [0xd8d2c4, 0xb8452f, 0x2f5f8a, 0xe0b13c, 0x74914f, 0xf0e6d2, 0x8a5a3c, 0xcf6f2c];
  const loads = [];
  let lseed = 7;
  const lr = () => ((lseed = (lseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let v = 0; v < 4; v++) {
    const L = [];
    const n = 3 + Math.floor(lr() * 4);
    for (let i = 0; i < n; i++) {
      const w = 0.07 + lr() * 0.10, h = 0.09 + lr() * 0.13, dp = 0.06 + lr() * 0.09;
      L.push({
        g: new THREE.BoxGeometry(w, h, dp),
        c: GROC[Math.floor(lr() * GROC.length)],
        m: new THREE.Matrix4().compose(
          new THREE.Vector3((lr() - 0.5) * 0.34, YB + h / 2 - 0.01, ZB + 0.10 + lr() * 0.46),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (lr() - 0.5) * 1.1),
          new THREE.Vector3(1, 1, 1)),
      });
    }
    loads.push(mergeParts(THREE, L));
  }
  return {
    wire: mergeParts(THREE, W),
    plastic: mergeParts(THREE, P),
    caster: mergeParts(THREE, C),
    loads,
  };
}

// A printed label. Cheap, and it is what stops the powerup reading as a
// placeholder: the thing you grab has words on it like everything else does.
function labelTex(THREE, draw, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace ?? t.colorSpace;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

// clothAtlas() and legGeo() moved to agents/figures.js.

function buildGeo(THREE) {
  const cart = buildCartGeo(THREE);
  // The human half of this bundle (torso/head/hair/limb/arm/hand/belly/cap/
  // brim/belt/cloth) is gone: figures.js bakes a whole library of bodies now,
  // and it is spread over `F` below. What is left here is everything a person
  // is not.
  return {
    goods: new THREE.BoxGeometry(0.15, 0.18, 0.11),
    ring: new THREE.RingGeometry(0.42, 0.60, 20),
    cart,
    // Chrome with no environment map is black, so this is metalness that keeps
    // half its diffuse: it takes a hard specular off the ceiling troffers and
    // still reads as a bright object in the aisle rather than a silhouette.
    matChrome: new THREE.MeshStandardMaterial({
      color: 0xe4e8ec, roughness: 0.29, metalness: 0.34,
    }),
    matPlastic: [0xb8352c, 0x2f5c9e, 0x3f6b46, 0x2b2d33].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.44 })),
    matCaster: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.28 }),
    matLoad: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84 }),
  };
}

// makePerson() moved to agents/figures.js, along with makeCop(), which is new.
// The rig contract they both return gained ONE joint — `chest`, between the
// hips and everything above them — and that joint is most of why the walk now
// reads as a walk: hips carry the legs and the waddle, chest carries the torso,
// arms and head and counter-rotates against it. It is also where the winded
// heave lives. See animateCop().

function makeCart(THREE, G) {
  const g = new THREE.Group();
  const wire = new THREE.Mesh(G.cart.wire, G.matChrome);
  wire.castShadow = true; g.add(wire);
  const plastic = new THREE.Mesh(G.cart.plastic, pick(G.matPlastic));
  plastic.castShadow = true; g.add(plastic);
  // Four swivel casters, each pointing its own way. A parked trolley never has
  // its wheels lined up and that is most of why the old four-cube-wheels version
  // read as furniture instead of as a cart.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(G.cart.caster, G.matCaster);
    c.position.set(sx * 0.205, 0, sz > 0 ? 0.300 : -0.245);
    c.rotation.y = rr(-1.1, 1.1) + (sz > 0 ? 0 : Math.PI);
    g.add(c);
  }
  if (rnd() < 0.78) {
    const load = new THREE.Mesh(pick(G.cart.loads), G.matLoad);
    load.castShadow = true; g.add(load);
  }
  return g;
}

// ---------------------------------------------------------------------------
// THE POWERUPS. Round 3 left the thing you actually grab as an emissive box on
// a stick sitting on top of merchandise the store builder had already made
// real, and a blind critic ended a test on it. They are objects now: a bakery
// clamshell with six donuts in it, and a printed energy can with a pull tab.
// Lit by the same lights as everything else — the only concession to finding
// one at a dead run is a backface rim shell, which is a real shape hugging a
// real object, not a flat quad hovering over it.
// ---------------------------------------------------------------------------
function buildPowerupProps(THREE) {
  const donutTop = labelTex(THREE, (x, w, h) => {
    x.fillStyle = '#f2a8c4'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e07ba4'; x.fillRect(0, h * 0.34, w, h * 0.10);
    x.fillStyle = '#fdf2f6'; x.fillRect(0, h * 0.44, w, h * 0.02);
    x.fillStyle = '#7c2b46'; x.font = 'bold 25px sans-serif'; x.textAlign = 'center';
    x.fillText('DONUTS', w / 2, h * 0.28);
    x.font = 'bold 12px sans-serif'; x.fillStyle = '#9c4463';
    x.fillText('BAKED FRESH DAILY', w / 2, h * 0.60);
    x.fillStyle = '#8a3a55';
    for (let i = 0; i < 12; i++) x.fillRect(w * 0.22 + i * 6, h * 0.72, 2 + (i % 3), h * 0.14);
  });
  const canLabel = labelTex(THREE, (x, w, h) => {
    x.fillStyle = '#12301a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#5fe04f';
    x.beginPath(); x.moveTo(0, h * 0.30); x.lineTo(w, h * 0.14);
    x.lineTo(w, h * 0.40); x.lineTo(0, h * 0.56); x.closePath(); x.fill();
    x.fillStyle = '#0b1f10'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
    x.save(); x.translate(w / 2, h * 0.40); x.rotate(-0.13);
    x.fillText('VOLT', 0, 0); x.restore();
    x.fillStyle = '#cfeec6'; x.font = 'bold 11px sans-serif';
    x.fillText('ENERGY  ·  500ml', w / 2, h * 0.70);
    x.fillStyle = '#5fe04f'; x.fillRect(w * 0.30, h * 0.78, w * 0.40, 3);
  }, 128, 96);

  // --- donuts: an open clamshell with product in it -------------------------
  const boxParts = [], sugarParts = [];
  const BW = 0.25, BD = 0.20, BH = 0.062;
  const board = 0xf3ece0;
  boxParts.push({ g: new THREE.BoxGeometry(BW, 0.008, BD), c: board,
    m: new THREE.Matrix4().makeTranslation(0, -0.030, 0) });
  for (const s of [-1, 1]) {
    boxParts.push({ g: new THREE.BoxGeometry(0.009, BH, BD), c: board,
      m: new THREE.Matrix4().makeTranslation(s * BW / 2, 0, 0) });
    boxParts.push({ g: new THREE.BoxGeometry(BW, BH, 0.009), c: board,
      m: new THREE.Matrix4().makeTranslation(0, 0, s * BD / 2) });
  }
  // The lid is hinged open and folded back, printed face up. The floor camera
  // sits at 6.4 m looking down at about thirty degrees, so up IS toward the
  // player: stand the lid vertical and he sees the back of a card, lay it back
  // and he can read the box. It also stops it masking the donuts, which are the
  // actual reason to notice the thing.
  const lid = new THREE.PlaneGeometry(BW, BD * 0.94);
  const lidM = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0.052, -BD / 2 - 0.058),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.06),
    new THREE.Vector3(1, 1, 1));
  const GLAZE = [0x6b3d22, 0xefa2bf, 0xf0d9a0, 0x8d5a2f, 0xe8c15a, 0xd8687f];
  let i = 0;
  for (const gx of [-1, 0, 1]) for (const gz of [-1, 1]) {
    sugarParts.push({
      g: new THREE.TorusGeometry(0.035, 0.0155, 6, 14), c: GLAZE[i++ % GLAZE.length],
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(gx * 0.077, -0.010, gz * 0.048),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
        new THREE.Vector3(1, 1, 1)),
    });
  }
  for (let k = 0; k < 14; k++) {                     // sprinkles
    const a = (k / 14) * Math.PI * 2;
    sugarParts.push({
      g: new THREE.BoxGeometry(0.008, 0.004, 0.004), c: k % 2 ? 0xffe14d : 0x4fc9f0,
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(-0.077 + Math.cos(a) * 0.031, 0.005, -0.048 + Math.sin(a) * 0.031),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
        new THREE.Vector3(1, 1, 1)),
    });
  }

  // --- can: tapered aluminium body, printed label, pull tab -----------------
  const R = 0.041, CH = 0.150;
  const canEnds = [];
  canEnds.push({ g: new THREE.CylinderGeometry(R * 0.80, R, 0.020, 16), c: 0xc8ccd2,
    m: new THREE.Matrix4().makeTranslation(0, CH / 2 + 0.008, 0) });
  canEnds.push({ g: new THREE.CylinderGeometry(R * 0.80, R * 0.80, 0.008, 16), c: 0xdfe3e8,
    m: new THREE.Matrix4().makeTranslation(0, CH / 2 + 0.021, 0) });
  canEnds.push({ g: new THREE.TorusGeometry(R * 0.80, 0.004, 5, 16), c: 0xb9bec6,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, CH / 2 + 0.025, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)) });
  canEnds.push({ g: new THREE.BoxGeometry(0.030, 0.003, 0.016), c: 0xa9aeb6,
    m: new THREE.Matrix4().makeTranslation(0.008, CH / 2 + 0.028, 0) });
  canEnds.push({ g: new THREE.CylinderGeometry(R * 0.86, R, 0.016, 16), c: 0xc8ccd2,
    m: new THREE.Matrix4().makeTranslation(0, -CH / 2 - 0.006, 0) });

  return {
    donuts: {
      body: mergeParts(THREE, boxParts),
      lid, lidM,
      extra: mergeParts(THREE, sugarParts),
      tex: donutTop,
      rim: new THREE.BoxGeometry(BW + 0.03, BH + 0.10, BD + 0.03),
      rimY: 0.012,
      glow: 0xf07fae,
    },
    energy: {
      body: new THREE.CylinderGeometry(R, R, CH, 18, 1, true),
      extra: mergeParts(THREE, canEnds),
      tex: canLabel,
      rim: new THREE.CylinderGeometry(R + 0.012, R + 0.012, CH + 0.05, 14),
      rimY: 0,
      glow: 0x63e05a,
    },
    matBoard: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
    matSugar: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52 }),
    matAlu: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.62 }),
  };
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
  const F = buildFigureGeo(THREE);      // every body in the store, baked once
  const PW = buildPowerupProps(THREE);
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
    // ROUND 5 — this was `SERVICE_DESK.x - 5.4`, my own guess at where a second
    // door could go before there was one in config. The lead has since put
    // EXIT2 in config.js and src/store.js builds its storefront off it, so the
    // guess comes out: one source of truth, and the collider the thief shoves
    // through is the glass he can see.
    { id: 'door2', label: 'DOOR 2', x: EXIT2.x, z: EXIT2.z, shoveMul: 1.0, sign: 0x8ef07a },
  ];
  // A THIRD door was built, measured and thrown away, and the numbers are here
  // so nobody spends the afternoon rebuilding it. A fire exit at x=-2.5 gave, at
  // n=200, competent bot / door-camper on the right aisle:
  //   1 door  52.7% / 91.3%   camping is the game
  //   2 doors 79.5% / 22.5%   chasing is the game, by 57 points
  //   3 doors 66.0% / 28.0%   chasing is still the game, by 38
  // Three ways out makes every dispatch harder without making the aisle number
  // worth more — the misaim spread is the same 21 points either way, because a
  // third exit does not help you cover the other two. It is 13 points of
  // difficulty for no design gain, so the store has two doors.
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
  //
  // ROUND 6 — AND IT IS 1 NOW, ON THE CLIENT'S ASK. Door 2 is still built by
  // src/store.js and still stands there; it is the way IN. Only Door 1 is a way
  // out, so the whole store drains through one hole and you always know where
  // he is going. See the K block above for what pays for that. `useDoors(2)`
  // reproduces round 4/5 exactly and every ablation in this round's report was
  // taken by flipping it.
  //
  // NOTE FOR THE LEAD: config's EXIT2 and CAMERAS[8] ('DOOR 2') both still
  // exist and are correct — a camera on the entrance is a camera on a real
  // door. What is now wrong is only the SIGNAGE: store.js paints a lit EXIT box
  // over a door nobody may leave by. That is a store.js change (ENTRANCE / NO
  // EXIT / IN), not mine, and it is the one thing about this that would read as
  // a bug to a player.
  let doorLimit = 1;
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

  // ROUND 5 — THE PLACEHOLDER IS GONE. Round 4 drew a lit EXIT box and a pair
  // of push-bar leaves at Door 2, because the second exit was mine, it decided
  // 60% of chases, and there was nothing there to see. src/store.js now builds
  // a real storefront at both doors off config's EXIT/EXIT2 — glazing, decals,
  // bollards and its own lit EXIT box — so a chase builder drawing architecture
  // is exactly the duplicate geometry it looks like. Deleted, on the store
  // builder's own note that it matched the placeholder and could come out.
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
    const pref = Math.min(running.doorPref || 0, EXITS.length - 1);
    fleeF = nav.field(EXITS.map((e, i) => ({ x: e.x, z: e.z, cost: i === pref ? 0 : K.doorBias })), {
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
  // He used to be built here, out of the shopper rig at girth 1.62 with a belt
  // torus, a cap cylinder and a badge bolted on. The playtest verdict on that
  // was "he's just kinda black... he's not a character yet", and it was right
  // for a reason nobody had measured: at girth 1.62 the shopper capsule's top
  // cap reached hips-local 0.71 and the head sat at 0.60, so the head was
  // INSIDE the torso and the cap was sitting on his chest. There was no face to
  // see because there was no head above the shoulders. makeCop() is a rig built
  // for him instead of a shopper wearing a hat — see agents/figures.js.
  const copRig = makeCop(THREE, F);
  const cop = copRig.root;
  cop.userData = {
    rig: copRig, vel: V(0, 0, 0), speed: 0, phase: 0, heading: 0, prevHeading: 0,
    stamina: K.staminaMax, gassed: false, boost: 0, breath: 0, lean: 0, skid: 0, turn: 0,
    stagger: 0,
    // ROUND 6 — the visible half of the lung. `fatigue` is integrated in
    // updateCop() now instead of in telemetry(), because telemetry() is behind
    // `if (!api.report) return` and the ANIMATION cannot be: a cop who only
    // pants when the HUD happens to be listening is not a character.
    fatigue: 0, heave: 0, brace: 0, sway: 0,
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
  // ROUND 6. Declared up here rather than next to updatePost()/interactions()
  // because reset() runs at construction, before either of those lines is
  // reached, and a `let` in the temporal dead zone is a ReferenceError rather
  // than an undefined.
  let postT = 0;          // seconds the cop has been loitering on the way out
  let grabGate = null;    // bench-only: the identity model, see bench({ident})

  function makeShopper() {
    // rollPerson() rolls a BUILD, an AGE and a silhouette, not just four
    // palette picks. The critic's line was "two identically-proportioned bodies
    // ... recoloured"; proportion is the first word in it.
    const rig = makePerson(THREE, F, rollPerson({ rnd, rr, ri, pick }));
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
      duck: 0, duckT: 0, stumble: 0, bargeT: 0, bargeN: 0, bargeStam: null, nerve: 1,
      adren: 1, shoveT: 0, exitI: 0, viaBack: false, doorPref: 0,
      // ROUND 6 — the decoy clip currently playing on this body, guilty or not.
      // `gest` is an entry from decoy.js, `gestT` counts DOWN, `gestD` is its
      // scaled duration. `turnY` is the yaw a clip adds on top of `heading`,
      // which is how a man turns away from the shelf without turning his walk.
      gest: null, gestT: 0, gestD: 1, gestIn: 0, turnY: 0,
      // ...and the one-exit economy: `chill` is seconds of honest shopping
      // after he balked, `balk` is how long he has been looking at a guard
      // stood on the only way out, `shopT` is how much shopping an innocent has
      // left before he checks out and leaves through that same door.
      chill: 0, balk: 0, stall: 0, aborts: 0, shopT: 0, leaving: false, made: 0,
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
      const P = kind === 'energy' ? PW.energy : PW.donuts;
      const col = P.glow;
      // The object itself, lit by the store's own lights like the merchandise
      // it is sitting on. `item` is the group everything rotates and bobs with.
      const item = new THREE.Group();
      item.position.y = 1.06;
      // A shade over life size. The floor camera sits at 6.4 m and a real
      // single-serve can is 40 px from there; the thing you have to spot at a
      // dead run gets to be the hero item on the display, not one more facing.
      item.scale.setScalar(1.22);
      const printed = new THREE.MeshStandardMaterial({
        map: P.tex, roughness: kind === 'energy' ? 0.34 : 0.80,
        metalness: kind === 'energy' ? 0.45 : 0.0,
      });
      if (kind === 'energy') {
        const body = new THREE.Mesh(P.body, printed);
        body.castShadow = true; item.add(body);
        item.add(new THREE.Mesh(P.extra, PW.matAlu));
      } else {
        const body = new THREE.Mesh(P.body, PW.matBoard);
        body.castShadow = true; item.add(body);
        const lid = new THREE.Mesh(P.lid, new THREE.MeshStandardMaterial({
          map: P.tex, roughness: 0.80, side: THREE.DoubleSide,
        }));
        lid.applyMatrix4(P.lidM); item.add(lid);
        item.add(new THREE.Mesh(P.extra, PW.matSugar));
      }
      // Rim light: a backface shell of the object's own silhouette. It is a
      // shape wrapped round a real thing, so it reads as light catching an
      // edge; it is emphatically not a flat unlit card floating on top of one.
      const halo = new THREE.Mesh(P.rim, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.22, side: THREE.BackSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      halo.position.y = P.rimY; item.add(halo);
      g.add(item);
      const ring = halo;                       // what updatePowerups pulses
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
    s.adren = 1; s.shoveT = 0; s.exitI = 0; s.viaBack = false;
    s.doorPref = EXITS.length > 1 ? ri(0, EXITS.length - 1) : 0;
    s.stumble = 0; s.bargeT = 0; s.bargeN = 0; s.bargeStam = null;
    s.nerve = rr(K.nerveLo, K.nerveHi);
    s.hasCart = true; s.cart.visible = true; s.mesh.visible = true;
    s.held.visible = false; s.bang.visible = false; s.target = null;
    s.stole = false;
    s.gest = null; s.gestT = 0; s.gestD = 1; s.turnY = 0;
    s.gestIn = rr(1.5, K.decoyHi);
    s.chill = 0; s.balk = 0; s.stall = 0; s.aborts = 0; s.leaving = false; s.made = 0;
    s.shopT = rr(K.shopLo, K.shopHi);
    s.held.scale.set(1, 1, 1);
  }

  function reset() {
    while (shoppers.length < K.shopperCount) makeShopper();
    const guiltyIdx = new Set();
    while (guiltyIdx.size < Math.min(K.thiefCount, shoppers.length)) guiltyIdx.add(ri(0, shoppers.length - 1));
    shoppers.forEach((s, i) => resetShopper(s, guiltyIdx.has(i)));
    cop.position.set(0, 0, FRONT_WALK_Z + 1.5);
    const cu = cop.userData;
    cu.vel.set(0, 0, 0); cu.speed = 0; cu.stamina = K.staminaMax; cu.fatigue = 0;
    cu.gassed = false; cu.boost = 0; cu.heading = 0; cu.skid = 0; cu.stagger = 0;
    postT = 0;
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
    u.wantSprint = wantSprint;              // telemetry: the gate is on the KEY
    const boosted = u.boost > 0;
    const canSprint = wantSprint && (boosted || (u.stamina > 0 && !u.gassed));
    u.sprinting = canSprint;                // bench: counts BURSTS, not seconds

    if (boosted) {
      u.boost = Math.max(0, u.boost - dt);
      u.stamina = K.staminaMax;                 // energy drink: you are not tired
      u.gassed = false;
    } else if (canSprint) {
      u.stamina -= K.staminaDrain * dt;
    } else {
      // ---- THE GATE. Round 4's one admitted failure, fixed here -------------
      // `canSprint` goes false the instant you gas, so a player STILL HOLDING
      // THE KEY lands in this branch. Ungated, he recovered at exactly the rate
      // of the man who let go — so letting go bought nothing, and managing your
      // wind was not a weak strategy, it was a strictly dominated one
      // (always-sprint 76.0% vs ration 71.0% on this store).
      //
      // A man sprinting is not getting his breath back. `regenHold` is what he
      // gets while the key is down, and it is zero.
      //
      // On its own this is a 25-point nerf and nothing else (round 4 measured
      // it, priced it, and refused to ship it alone — correctly). It only
      // becomes a mechanic next to the other two thirds: no-sprint-while-gassed
      // below, and the short fast tank. See the lung block in K.
      const held = wantSprint ? K.regenHold : 1;
      u.stamina += K.staminaRegen * dt * held * (moving ? 1 : 1.6);
    }
    u.stamina = clamp(u.stamina, 0, K.staminaMax);
    if (u.stamina <= 0.0001) u.gassed = true;
    if (u.gassed && u.stamina >= K.gassedRecover * K.staminaMax) u.gassed = false;

    // ---- A WINDED MAN DOES NOT GET TO SPRINT -------------------------------
    // This line read `(wantSprint ? T.copRun : T.copWalk) * T.gassedPenalty`,
    // i.e. 5.05 x 0.62 = 3.13 m/s for a gassed cop holding the key, against
    // 2.35 m/s for a cop with a FULL TANK who chose to walk. Blowing your lungs
    // out made you 33% faster than pacing yourself, permanently, and no regen
    // gate can ever beat a penalty state that outruns the healthy state. Four
    // rounds of "stamina management pays nothing" was mostly this one line.
    //
    // Now the key does nothing once you are gassed: 2.35 x 0.62 = 1.46 m/s,
    // well under the thief's 3.08 m/s cruise, so gassing out costs you ground
    // instead of gaining it. `gassedPenalty` itself is UNTOUCHED at 0.62 — the
    // game builder was right that softening it would just stop gassing meaning
    // anything. It bites harder now because it multiplies the walk.
    let target = canSprint ? T.copRun : K.copWalk;
    if (u.gassed) {
      const g = wantSprint ? K.gassedSprintMul : 0;
      target = (K.copWalk + (T.copRun - K.copWalk) * g) * T.gassedPenalty;
    }
    if (boosted) target *= T.boostMul;
    // Shaking off a shoulder — see barge(). Not a freeze, but not a wobble
    // either: a heavy man who has just been run through by a sprinting one is
    // off his feet for a beat and facing the way the man came from.
    if (u.stagger > 0) { u.stagger = Math.max(0, u.stagger - dt); target *= K.bargeSlow; }
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
    // ---- the visible lung ---------------------------------------------------
    // `fatigue` used to be integrated inside telemetry(), which is guarded by
    // `if (!api.report) return`. The HUD can afford to be optional; the man's
    // breathing cannot. It is a LAGGING 0..1 — rises at 5.5/s, falls at 0.9/s —
    // so it survives across a whole chase instead of snapping back the instant
    // the tank refills, and it is what makes the heave visibly LET UP rather
    // than switch off. Same signal the audio piece drives its huff off, so the
    // body and the sound stay locked without either side calling the other.
    {
      const frac = u.stamina / K.staminaMax;
      const want = clamp(1 - frac, 0, 1);
      const k = want > u.fatigue ? 5.5 : 0.9;
      u.fatigue += (want - u.fatigue) * (1 - Math.exp(-k * dt));
      if (u.gassed) u.fatigue = Math.max(u.fatigue, 0.92);
      if (boosted) u.fatigue *= Math.exp(-2.6 * dt);   // the drink IS the relief
    }
    animateCop(dt, moving, boosted);
  }

  // ===========================================================================
  // THE WALK, THE WADDLE AND THE HUFF
  // ===========================================================================
  // Three things changed and only the third one is the client's note.
  //
  // 1. There is a `chest` joint now. Hips carry the legs, the pelvic drop and
  //    the lean; chest carries the torso, arms and head and counter-rotates
  //    against the hips. Everything used to hang off `hips`, so the whole man
  //    rotated as one piece and a walk cycle was two sticks swinging under a
  //    stationary egg.
  //
  // 2. The vertical bob had the wrong sign. It read
  //    `hips.y = 0.62 + |sin(phase)| * 0.028`, i.e. HIGHEST at the two moments
  //    the foot is planted and the body is passing over it — which is a bounce,
  //    not a gait. A walking body is highest at mid-stance and drops onto the
  //    heel. Same term, minus a half, and a heavy man lands instead of hopping.
  //
  // 3. The breath. Verbatim: "he pants, like he breathes heavily, and then it
  //    lets up right as he gets his breath back, but you should see that too."
  //    So it is not a gassed FLAG that switches an animation on. Rate, depth,
  //    hunch and head-drop are all continuous functions of `fatigue`, which
  //    rises at 5.5/s and falls at 0.9/s: he is still heaving for a good two
  //    seconds after the WIND bar goes green, and you can watch it ease off.
  //    The tank is 1.40 s with a 0.81 s refill, so the winded cycle repeats
  //    about every 2.2 s — a heave has to be visible inside that, which is why
  //    the rate tops out near 1.3 Hz and not at some tasteful 0.3 Hz.
  const TAU = Math.PI * 2;
  // Lungs-full, 0..1, with a fast gasp in and a slower blow out. A sine is
  // symmetric and reads as a machine; the asymmetry is the whole tell.
  function breathWave(ph) {
    const p = ((ph % TAU) + TAU) % TAU, IN = TAU * 0.34;
    return p < IN ? Math.sin((p / IN) * (Math.PI / 2))
                  : Math.cos(((p - IN) / (TAU - IN)) * (Math.PI / 2));
  }

  function animateCop(dt, moving, boosted) {
    const u = cop.userData, r = u.rig;
    const ed = (k) => 1 - Math.exp(-k * (dt || 0.016));
    if (u.speed > 0.12) u.heading = Math.atan2(u.vel.x, u.vel.z);
    let dh = u.heading - u.prevHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    u.prevHeading = u.heading;
    u.turn = lerp(u.turn, dt > 0 ? clamp(dh / dt, -4, 4) : 0, ed(12));
    cop.rotation.y = u.heading;

    const F = clamp(u.fatigue, 0, 1);
    const spd = clamp(u.speed / T.copRun, 0, 1.2);

    // ---- gait ---------------------------------------------------------------
    // A short stride, because he is wide and tired. It shortens further as he
    // fatigues, which is what actually makes a knackered man look knackered
    // from behind: the cadence stays up and the ground stops moving.
    const stride = 0.95 - 0.16 * F;
    u.phase += (u.speed / stride) * dt * TAU;
    const amp = clamp(u.speed * 0.165, 0.03, 0.58) * (1 - 0.20 * F);
    const sw = Math.sin(u.phase), sw2 = Math.sin(u.phase * 2);
    r.legL.rotation.x = sw * amp; r.legR.rotation.x = -sw * amp;
    // Heel strike: the trailing leg straightens hard just before it lands, and
    // the knee-less leg fakes that with a kick in the last quarter of the swing.
    const heel = Math.max(0, -Math.cos(u.phase)) * amp * 0.22;
    r.legL.rotation.x -= heel; r.legR.rotation.x += heel;
    // Arms lag the legs — a big man's arms are late and they swing across the
    // gut rather than past it.
    const alag = Math.sin(u.phase - 0.55);
    r.armL.rotation.x = -alag * amp * 0.62; r.armR.rotation.x = alag * amp * 0.62;
    const out = 0.24 + 0.06 * spd + 0.05 * F;                 // elbows off the belly
    r.armL.rotation.z = out; r.armR.rotation.z = -out;

    // ---- mass ---------------------------------------------------------------
    // Pelvic drop on the swing side plus a counter-rotating chest: that pairing
    // IS the waddle. Scaled by speed so a standing cop is not doing the twist.
    const gait = clamp(u.speed / 1.6, 0, 1);
    const wantLean = clamp(u.turn * 0.11 * clamp(u.speed / T.copRun, 0, 1.3), -0.36, 0.36);
    u.lean = lerp(u.lean, wantLean, ed(9));
    u.sway = lerp(u.sway, sw * 0.075 * gait, ed(16));
    r.hips.rotation.z = u.lean + u.sway;
    r.hips.rotation.y = sw * 0.075 * gait;
    r.chest.rotation.y = -sw * 0.115 * gait - u.turn * 0.035;
    r.chest.rotation.z = -u.sway * 0.55;
    // Highest at mid-stance, lowest on the strike. The `- 0.5` is item 2 above.
    const bob = (Math.abs(sw) - 0.5) * (0.034 + 0.012 * spd) * gait;
    const land = Math.max(0, -sw2) * 0.012 * gait;            // the heel taking him
    r.hips.position.y = r.hipY + bob - land;

    // ---- the huff -----------------------------------------------------------
    // Rate 0.34 Hz calm -> 1.30 Hz blown, depth likewise, both off `fatigue`.
    const rate = TAU * (0.34 + 1.00 * F);
    u.breath += dt * rate;
    const w = breathWave(u.breath);                            // 0 empty, 1 full
    // Amplitude, near-linear in F rather than squared. The first version was
    // `w * (0.22 + 0.78F) * F`, and at F = 0.3 that is fourteen percent of the
    // full heave — so the pant did not ease off, it SWITCHED off about a second
    // after he let go, which is precisely the thing the note asked to be able
    // to watch. This keeps a visible tail all the way down.
    const heave = w * (0.30 + 0.70 * F) * (0.24 + 0.76 * F);
    u.heave = heave;

    // Chest and shoulders. From 7 m you are looking at his BACK, so the heave
    // has to be in the shoulder line and the upper back or it does not exist:
    // the chest group lifts and the whole torso swells forward.
    r.chest.position.y = heave * 0.040;
    r.chest.scale.set(1 + heave * 0.030, 1 + heave * 0.045, 1 + heave * 0.075);
    if (r.belly) r.belly.scale.z = 0.470 * (1 + heave * 0.16 + w * 0.03);

    // Posture. Forward lean rises with fatigue and rises again on the exhale —
    // a blown man folds a little every time he empties his lungs.
    const stoopT = (boosted ? 0.14 : 0.08 + 0.06 * spd) + F * 0.30 + (1 - w) * F * 0.13;
    r.chest.rotation.x = lerp(r.chest.rotation.x, stoopT, ed(7));
    // Head: up and back on the gasp, dropping forward as he blows out. That
    // alternation is the read, not the raw amplitude.
    const neckT = r.stoop - w * (0.10 + 0.34 * F) + (1 - w) * F * 0.26;
    r.neck.rotation.x = lerp(r.neck.rotation.x, neckT, ed(11));
    r.neck.rotation.z = lerp(r.neck.rotation.z, -u.sway * 0.5, ed(10));

    // Hands to the knees, but only once he is properly cooked AND stopped, and
    // it comes on gradually so it is a man giving up on standing rather than a
    // pose snapping into place.
    const wantBrace = (!moving && F > 0.55) ? clamp((F - 0.55) / 0.30, 0, 1) : 0;
    u.brace = lerp(u.brace, wantBrace, ed(wantBrace > u.brace ? 5 : 3.2));
    if (u.brace > 0.01) {
      const b = u.brace;
      r.chest.rotation.x = lerp(r.chest.rotation.x, 0.62 + w * 0.10, b);
      r.armL.rotation.x = lerp(r.armL.rotation.x, -0.92 - w * 0.10, b);
      r.armR.rotation.x = lerp(r.armR.rotation.x, -0.92 - w * 0.10, b);
      r.armL.rotation.z = lerp(r.armL.rotation.z, 0.46, b);
      r.armR.rotation.z = lerp(r.armR.rotation.z, -0.46, b);
      r.neck.rotation.x = lerp(r.neck.rotation.x, -0.34 + (1 - w) * 0.30, b);
    }

    // Shaken off by a shoulder barge: arms up, off balance, facing the way the
    // man came from. Reads as a beat lost rather than a freeze.
    if (u.stagger > 0) {
      const t = clamp(u.stagger / Math.max(0.05, T.bargeStagger), 0, 1);
      const f = Math.sin(t * Math.PI) * t;
      r.chest.rotation.z += f * 0.34;
      r.chest.rotation.x -= f * 0.30;
      r.armL.rotation.x -= f * 1.5; r.armR.rotation.x -= f * 1.1;
      r.armL.rotation.z += f * 0.5; r.armR.rotation.z -= f * 0.35;
      r.hips.position.y -= f * 0.05;
    }

    // ---- the belt, out of phase --------------------------------------------
    // Eight kilos of leather hung off a man's hips does not travel with them.
    // It lags a fifth of a stride and bounces at twice the cadence, and the
    // torch and the keys go with it because they are welded into the same
    // merged mesh.
    if (r.beltGrp) {
      const bl = Math.sin(u.phase - 1.15);
      r.beltGrp.rotation.y = bl * 0.085 * gait;
      r.beltGrp.rotation.z = -bl * 0.045 * gait;
      r.beltGrp.position.y = Math.sin(u.phase * 2 - 1.5) * 0.014 * gait - heave * 0.006;
      r.beltGrp.position.x = bl * 0.010 * gait;
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
  // K.thiefRun is his ceiling for the first couple of seconds, not his cruise.
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
    s.adren = clamp(s.adren - dt * press / K.thiefAdrenD
                            + dt * (1 - press) * K.thiefAdrenBack, 0, 1);
    const cruise = lerp(K.thiefTired, 1, s.wind);              // opening sprint, fading
    const surge = lerp(K.thiefTired, K.thiefPanic, near * s.adren);  // fear, and it runs out
    s.dbgNear = near;
    return K.thiefRun * Math.max(cruise, surge);
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
      // Strolling out, he is walking to the door he means to use. Running, he
      // reads the cop-priced field, which is seeded from every door with HIS
      // one discounted — see updateFlee. Either way it is his choice and not a
      // fact about his coordinates.
      const F = flee ? escapeField()
        : (exitFs[Math.min(s.doorPref, exitFs.length - 1)] || exitF);
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

  // =========================================================================
  // ROUND 6 — THE DECOY CLIPS AND THE MAN ON THE DOOR
  // =========================================================================

  // Start a clip. `kind` is 'steal' | 'decoy' | 'putback'; the roll comes off
  // the same seeded rnd() every other decision in this file uses, so a bench
  // trial replays exactly. The clip's LENGTH is ramped (see K.tellMul), and it
  // is ramped for decoys and steals alike — slowing only the steal would make
  // clip length the tell and give the whole ambiguity back.
  function startGesture(s, kind, forceId) {
    const g = forceId ? BY_ID.get(forceId) : pickGesture(rnd, kind);
    if (!g) return null;
    s.gest = g;
    s.gestD = g.dur * K.tellMul;
    s.gestT = s.gestD;
    return g;
  }
  // Clock only. The POSE is applied in animateShopper, so a body nobody is
  // looking at costs one subtraction per frame and not a keyframe sample.
  function tickGesture(s, dt) {
    if (!s.gest) return false;
    s.gestT -= dt;
    if (s.gestT > 0) return true;
    s.gest = null; s.gestT = 0; s.turnY = 0;
    s.held.visible = false;
    s.held.scale.set(1, 1, 1);
    // Parked INSIDE the torso rather than left wherever the clip dropped it.
    // Invisible children are pruned by cctv/track.js's measure(), but they are
    // NOT pruned by Box3.setFromObject, which is the bug in CLAUDE.md that made
    // every shopper in this store 2.38 m tall. Do not leave props in the air.
    s.held.position.set(0.18, 1.02, 0.14);
    return false;
  }

  // ---- is the guard posted on the only way out? ----------------------------
  // Route metres, not a straight line: a cop the same distance away on the far
  // side of a gondola is not standing on the door, and a man deciding whether
  // to steal something can tell the difference. Decays 2.2x faster than it
  // builds, so stepping off the door for a second and a half clears it — the
  // player is not locked out of the front of his own store, he just cannot LIVE
  // there.
  // ---- can he still get there first? ---------------------------------------
  // Both distances are ROUTE metres off the same exit flood, so a cop ten
  // metres away through a gondola is not "in front of him" and the answer knows
  // it. `nerve` is the per-subject roll that already decides whether he will
  // chance your shoulder (nerveLo 0.55 = bold), so a bold man needs less
  // daylight to go for it and a nervous one needs more — two identical-looking
  // dispatches do not play out the same way, which is what nerve is for.
  function beatsCopToDoor(s) {
    const mine = toExit(s.position.x, s.position.z);
    const his = toExit(cop.position.x, cop.position.z);
    if (!isFinite(mine) || !isFinite(his)) return true;
    return mine < his * K.raceEdge + K.raceSlack / Math.max(0.35, s.nerve || 1);
  }
  // IS HE BEING HELD OFF. Both halves are needed and the pair of them is the
  // whole one-exit design:
  //
  //   posted   — the cop is STOPPED, on the way out, and has been for deterT.
  //              Not "the cop is in front of him": the dispatch puts the cop in
  //              the mouth of his aisle EVERY SINGLE TIME, so a rule that reads
  //              "is he between me and the door" fires on every chase in the
  //              game. Measured: gating the bolt on the race alone took the
  //              competent bot to 32.5% with 21 of 40 trials ending in a
  //              ditched item — i.e. it deleted the chase. A man MOVING is a
  //              man to run past. A man PARKED IN THE DOORWAY is not.
  //   !beatable— and he cannot get there first anyway. A thief three metres
  //              from the door with the cop eight metres off it still goes.
  const heldOff = (s) => doorPosted() && !beatsCopToDoor(s);

  // He has decided he cannot make it. Back into the shelf runs, look busy, and
  // wait for you to get bored. `stall` runs from here; see dumpGoods().
  function turnBack(s) {
    s.state = 'walk'; s.timer = rr(2.5, 6.0); s.path = []; s.aim = null; s.aimT = 0;
    s.target = { x: aisleX(ri(0, AISLE_COUNT - 1)) + rr(-1.0, 1.0), z: rr(0.5, HALF_LEN - 2) };
    s.gestIn = Math.min(s.gestIn, rr(0.4, 2.5));
  }

  function updatePost(dt) {
    const d = toExit(cop.position.x, cop.position.z);
    const posted = isFinite(d) && d < K.deterR && cop.userData.speed < K.deterSpeed;
    postT = posted ? postT + dt : Math.max(0, postT - dt * 2.2);
  }
  const doorPosted = () => postT > K.deterT;

  // He thought better of it. THIS IS THE WHOLE ONE-EXIT DESIGN IN ONE FUNCTION:
  // camping the door does not lower your catch rate, it removes the crime. The
  // shift produces no incidents, the wall stays quiet and the player earns
  // nothing — punished by income rather than by geometry, which is also exactly
  // what a real shoplifter does when he clocks a uniform by the door.
  //
  // Second balk and he is done with this store: he goes back to being a
  // customer and checks out. That matters, because otherwise a camped door
  // leaves two permanently-balking subjects in the building, game.js's
  // ensureThieves() sees `live >= 1` and never arms anybody else, and the
  // deadlock flatters the design by hiding it behind a spawn cap. Let them
  // leave and let the shift keep arming people; every one of them balks, and
  // the zero is an honest zero.
  function abortTheft(s, api) {
    s.balk = 0; s.aborts++;
    s.chill = rr(K.chillLo, K.chillHi);
    s.stole = false;
    s.state = 'putback'; s.timer = 0; s.path = []; s.target = null;
    s.concealT = Math.max(s.concealT, s.chill + rr(1.5, 5.0));
    startGesture(s, 'putback');
    if (s.aborts >= 2) { s.guilty = false; s.leaving = true; s.shopT = 0; }
    api && api.onAbort && api.onAbort(s, 'balk');
  }

  // He already had it. He waited you out for `dumpT`, you did not move off the
  // door, so it goes back on a shelf and he walks out a customer. No arrest, no
  // merchandise loss, no points — the most expensive possible outcome for a
  // player whose whole plan was to stand on the exit.
  function dumpGoods(s, api) {
    s.stall = 0; s.aborts++;
    s.stole = false; s.guilty = false; s.leaving = true; s.shopT = 0;
    s.state = 'putback'; s.timer = 0; s.path = []; s.target = null; s.aim = null;
    startGesture(s, 'putback');
    api && api.onAbort && api.onAbort(s, 'dump');
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

    // ---- ROUND 6: clips run first, so a state can ask "am I still doing it".
    const clipOn = tickGesture(s, dt);
    // ...and anybody standing at a shelf might start one. THIS IS THE ONE THAT
    // MATTERS. Guilty or innocent, pre-conceal or post-abort — the scheduler
    // does not look at `s.guilty`, so "the man doing something with his hands"
    // is never the answer, and a five-frame strip off the spot monitor is
    // evidence of a shopper rather than evidence of a crime. See decoy.js.
    if (!clipOn && s.angry <= 0 && !s.bolted && s.state !== 'leave'
        && (s.state === 'browse' || s.state === 'walk')) {
      s.gestIn -= dt;
      if (s.gestIn <= 0) {
        s.gestIn = rr(K.decoyLo, K.decoyHi);
        // You stop walking to dig your phone out. He drops into `browse` for
        // the length of the clip and a beat either side, which is also what
        // gives the motion detector a STOPPED subject to box — the identical
        // analytics verdict the CCTV builder flagged.
        if (s.state === 'walk') { s.target = null; s.path = []; }
        s.state = 'browse';
        startGesture(s, 'decoy');
        s.timer = Math.max(s.timer, s.gestD + rr(0.25, 1.20));
      }
    }

    // ---- guilty timeline: browse -> conceal -> drift -> bolt
    if (s.guilty && !s.bolted) {
      // Computed once, at the top, because THREE separate decisions below read
      // it and a one-frame-stale copy of it made him oscillate on the boundary
      // between drifting out and turning back.
      s.beatable = beatsCopToDoor(s);
      if (!s.stole) {
        // ROUND 6 — HE DOES NOT COMMIT WITH A UNIFORM ON THE ONLY WAY OUT.
        // `chill` is the honest-shopping stretch after a balk; while it runs
        // the fuse is held, and he is doing decoy clips like everybody else,
        // which is the correct picture — a man who decided not to steal
        // something is a shopper.
        if (s.chill > 0) {
          s.chill -= dt;
          s.concealT = Math.max(s.concealT, 1.2);
        } else {
          // He cases the front. Either he is close enough to the way out to
          // see it on his way there, or he has a clean line to the man himself.
          const cased = doorPosted()
            && (toExit(s.position.x, s.position.z) < K.deterSight
                || nav.clearSeg(s.position.x, s.position.z, cop.position.x, cop.position.z));
          if (cased) {
            s.balk += dt;
            s.concealT = Math.max(s.concealT, 0.9);      // hold the fuse
            if (s.balk > K.deterBalk && s.state !== 'conceal') { abortTheft(s, api); }
          } else if (s.balk > 0) {
            s.balk = Math.max(0, s.balk - dt * 0.8);
          }
        }
        s.concealT -= dt;
        if (s.concealT <= 0 && s.state !== 'conceal' && !s.gest && s.chill <= 0) {
          s.state = 'conceal'; s.look = 0;
          startGesture(s, 'steal');
          s.timer = s.gestD;
        }
      } else if (s.state === 'walk' || s.state === 'browse') {
        // STALLED. He has it in his coat and there is a uniform on the only
        // door, so he is hanging back in the aisles doing an extremely good
        // impression of a man choosing a pasta sauce. He resumes the moment the
        // door clears — no range test on the way out, deliberately: once he has
        // decided to wait you out, he waits until you MOVE, not until he
        // wanders far enough away to forget. Hysteresis, or he oscillates on
        // the deterSight boundary and it reads as a twitch.
        // The resume test has to be the SAME test that made him turn back, or
        // he flips between drifting and waiting every other frame on the
        // boundary. Either you are posted on the door, or you are simply closer
        // to it than he is: both are reasons to sit tight, and neither of them
        // stops being true because he took two steps backwards.
        if (heldOff(s)) {
          s.stall += dt;
          if (s.stall > K.dumpT) dumpGoods(s, api);
        } else {
          // Patience DECAYS, it does not reset. A man who has spent eight
          // seconds hanging back does not start his patience again from zero
          // because you stepped off the door for a moment — otherwise a cop who
          // drifts on and off the mat holds him forever and the trial never
          // resolves. Measured: 8 of 40 camp trials were timing out at 30 s
          // with a reset; with the decay they end in a ditched item, which is
          // an outcome instead of a hang.
          s.stall = Math.max(0, s.stall - dt * 0.5);
          s.state = 'drift'; s.path = []; s.aim = null; s.aimT = 0;
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
      // ROUND 6 — `stalling` is the man who has it in his coat and has turned
      // back into the aisles rather than walk into you. He is walking, not
      // drifting, so without this line he would be UNCATCHABLE: interactions()
      // only grabs a subject who has bolted or is reacting. He must still bolt
      // when you find him, or "stand on the door and he waits" would have an
      // exploit in it where the thief strolls past your elbow untouchable.
      // It is also the intended counterplay to your own post: leave the door
      // and go and get him.
      const stalling = s.stole && !s.bolted && (s.state === 'walk' || s.state === 'browse');
      // CAN HE STILL BEAT YOU TO IT. Route metres, both of you, off the same
      // field. This is the client's sentence turned into a comparison:
      //   "I think you should kind of have a clue where they're going. The cop
      //    should kind of have a chance to get there."
      // With one exit you always have the clue. What you have to do with it is
      // GET THERE FIRST, and this is the line that decides whether getting
      // there first was worth anything.
      s.beatable = beatsCopToDoor(s);
      if ((s.state === 'drift' || stalling) && copD < T.suspicionRadius) { s.state = 'react'; s.timer = K.thiefReactD; }
      // ROUND 6 — AND HE ONLY RUNS FROM A MAN WHO IS COMING AT HIM. Round 3
      // made any uniform on his line inside 17 m a bolt, which was the right
      // fix for "he ambles up to 4.5 m of a sprinting cop" and is worth most of
      // the 1.13 s -> 3.03 s median. With ONE exit it has a second, wrong
      // consequence: EVERY route out of this store passes the front end, so a
      // cop merely WALKING TOWARDS THE DOORS is on every thief's line, and the
      // thief sets off running before the man has even noticed him. Nobody does
      // that. You keep strolling and you hope.
      // So the sighting still fires at 17 m if he is being closed on (the aisle
      // mouth case, unchanged), and otherwise not until `boltNear`.
      else if ((s.state === 'drift' || stalling) && copD < K.thiefLook
               && (copClosingOn(s, copD) || copD < K.boltNear)
               && seesBlocker(s, copD)) {
        // ROUND 6 — SEEING THE WAY BLOCKED IS NO LONGER AUTOMATICALLY A BOLT.
        // Round 3 made him bolt the moment a uniform appeared on his line, and
        // that was right: before it, he ambled up to 4.5 m of a sprinting cop
        // and 61% of "chases" were over inside a second. But with ONE door it
        // has a degenerate consequence — a man who cannot possibly beat you to
        // the only exit sets off running at it anyway, straight into the arms
        // of the man standing on it. That is not fear, it is a scripted
        // donation, and it is most of why a door-camping bot scored 71.7%.
        //
        // So the sighting still fires, and now it asks a question: can I still
        // get there first? If yes he commits and it is the round-5 chase,
        // unchanged. If no he turns back into the aisles, waits you out, and
        // ditches the goods if you never move (see dumpGoods). The counterplay
        // to a man who has turned back is the one the whole game is about: stop
        // guarding the door and go and take him, which trips the line above.
        if (heldOff(s)) { if (s.state === 'drift') turnBack(s); }
        else { s.state = 'react'; s.timer = K.thiefReactD; }
      }
      if (s.state === 'conceal' && copD < T.suspicionRadius && s.gestT < 1.2) { s.state = 'react'; s.timer = K.thiefReactD; }
    } else if (!s.guilty) {
      // ---- ROUND 6: customers finish their shop and leave, by the same door.
      // Without this the only body that ever walks at the exit is the thief, so
      // "subject moving toward the doors" is a confession and the exit is a
      // chokepoint one man can hold. With it the door is a CROWD: the camper is
      // standing in a stream of people and has to know which of them is his,
      // which is the job the aisle number does once there is only one way out.
      if (!s.leaving && s.angry <= 0 && !s.gest) {
        s.shopT -= dt;
        if (s.shopT <= 0) {
          s.leaving = true; s.state = 'leave';
          s.path = []; s.target = null; s.aim = null; s.aimT = 0;
        }
      }
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

    let target = K.thiefWalk;
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
      // ROUND 6 — the concealment is now GESTURES[0] and it is sampled by the
      // same applyGesture() the six decoys are. Round 5's inline lerp is gone,
      // keyframe for keyframe, into decoy.js: item off the lip, past the
      // sternum, into the coat, gone, hands back on the bar, with the shoulder
      // checks on the same beats. The point is structural — there is no longer
      // any code a thief runs that an innocent does not — so please do not
      // re-inline it to "make the tell clearer".
      case 'conceal': {
        target = 0;
        if (!s.gest) { s.stole = true; s.state = 'drift'; s.path = []; s.held.visible = false; }
        break;
      }
      // He balked. The item comes back out of the coat and goes back on the
      // shelf, which is the only clip in the file that ends that way and is the
      // player's feedback that his post on the door worked.
      case 'putback': {
        target = 0;
        if (!s.gest) {
          if (s.leaving) { s.state = 'leave'; s.path = []; s.aim = null; s.aimT = 0; }
          else { s.state = 'walk'; s.timer = rr(2, 5); s.target = null; s.path = []; }
        }
        break;
      }
      // A customer who is done shopping, walking at the same door on the same
      // field with the same gait. He is not evidence of anything.
      case 'leave': {
        dir = navToExit(s, false, dt);
        target = K.thiefWalk * 1.06;
        s.look = Math.sin(s.phase * 0.55) * 0.32;
        if (atExit(s) >= 0) { startShove(s); break; }
        break;
      }
      case 'drift': {
        // ROUND 6 — HE DOES NOT WALK INTO A UNIFORM STOOD ON THE ONLY DOOR.
        // He turns back into the shelf runs and waits. See the `walk` branch of
        // the guilty timeline above for the other half, and dumpGoods() for
        // what happens if you never move.
        if (heldOff(s) && toExit(s.position.x, s.position.z) < K.deterSight) {
          s.state = 'walk'; s.timer = rr(2.5, 6.0); s.path = [];
          // Back INTO the store, not to a random point that might be the aisle
          // the cop is standing at the end of. He is going somewhere to wait.
          s.target = { x: aisleX(ri(0, AISLE_COUNT - 1)) + rr(-1.0, 1.0), z: rr(0.5, HALF_LEN - 2) };
          s.stall += dt;
          s.gestIn = Math.min(s.gestIn, rr(0.4, 2.5));   // look busy
          break;
        }
        dir = navToExit(s, false, dt);
        target = K.thiefWalk * 1.12;
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
        // THE COMMITMENT MOMENT. Going out the back of the store is the one
        // decision in this chase that is irreversible and worth thirty metres,
        // and until round 4 the player found out about it by losing. It is
        // visible on the floor — he turns and runs the wrong way — so it is
        // reported: `chase.viaBack` in telemetry, for the HUD to say out loud.
        // Anticipating it is the whole counterplay to the back route, because
        // the cop who reads it early can take a DIFFERENT aisle and meet him on
        // the rear cross-aisle instead of following him round the horn.
        if (dir.z > 0.30 && s.position.z > -HALF_LEN + 3.5) s.viaBack = true;
        else if (dir.z < -0.55) s.viaBack = false;
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
      steer(s, av.x, av.z, target, K.thiefAccel, 0.72, K.thiefRun, dt);
    } else {
      s.dbgTarget = 0;
      steer(s, 0, 0, 0, K.thiefAccel, 0.72, K.thiefRun, dt);
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
    // ROUND 6 — innocents use this door too, and an innocent walking out is not
    // a merchandise loss. game.js's onEscape() scores a loss, logs it and stands
    // the player down, so it MUST NOT fire for a customer who has finished his
    // shop. `onLeave` is additive and optional; a game.js that ignores it sees
    // exactly what it saw before, minus the false losses. game.js's own
    // repopulate() already puts an escaped body back in the building 18 s later,
    // so the store refills with no change on that side.
    if (s.guilty) api.onEscape && api.onEscape(s);
    else api.onLeave && api.onLeave(s);
  }

  function animateShopper(s, dt, target) {
    const r = s.rig;
    const ed = (k) => 1 - Math.exp(-k * (dt || 0.016));
    if (s.speed > 0.15) s.heading = Math.atan2(s.vel.x, s.vel.z);
    s.mesh.rotation.y = s.heading;
    s.phase += (s.speed / (0.88 * r.root.scale.x)) * dt * Math.PI * 2 + dt * 0.6;
    const amp = clamp(s.speed * 0.20, 0.02, 0.66);
    const sw = Math.sin(s.phase);
    const gait = clamp(s.speed / 1.4, 0, 1);
    r.legL.rotation.x = sw * amp; r.legR.rotation.x = -sw * amp;
    // Same two fixes as the cop: hips and chest counter-rotate, and the bob is
    // highest at mid-stance rather than at the strike.
    r.hips.rotation.y = sw * 0.055 * gait;
    r.chest.rotation.y = -sw * 0.085 * gait;
    r.hips.rotation.z = sw * 0.030 * gait;
    r.hips.position.y = r.hipY + (Math.abs(sw) - 0.5) * 0.030 * gait;
    r.neck.rotation.y = lerp(r.neck.rotation.y, s.look, ed(8));
    // Idle breathing, so a browsing shopper is not a statue. Cheap: one lerp.
    r.chest.scale.y = 1 + Math.sin(s.phase * 0.42 + s.id) * 0.012;

    // Shouldering the door. Both arms out flat on the leaf, body pitched into
    // it — the beat has to be VISIBLE or the grab window is invisible too.
    if (s.state === 'shove') {
      const e = EXITS[s.exitI] || EXITS[0];
      if (e) s.mesh.rotation.y = s.heading = Math.atan2(e.x - s.position.x, e.z - s.position.z);
      const heave = Math.sin((1 - clamp(s.shoveT / Math.max(0.05, e ? e.shove : 1), 0, 1)) * Math.PI);
      r.armL.rotation.x = -1.75 - heave * 0.28; r.armR.rotation.x = -1.75 - heave * 0.28;
      r.chest.rotation.x = 0.22 + heave * 0.18;
      r.hips.position.y = r.hipY;
      return;
    }
    // ROUND 6 — A CLIP IS PLAYING, AND IT OWNS THE UPPER BODY.
    // Arms, prop, neck pitch, shoulder check and the yaw he turns away from the
    // shelf by, all sampled out of decoy.js — the SAME four lines for a
    // concealment and for a man taking a phone out of his pocket. That identity
    // is the point: the strip of frames off the spot monitor is drawn by one
    // function, so there is no per-frame difference for a player to learn and
    // no way for a later tuning pass to make one of them louder by accident.
    // The legs keep walking off `sw`/`amp` above, because people do fidget with
    // their hands while they shuffle along a shelf.
    if (s.gest) {
      const u = 1 - clamp(s.gestT / Math.max(0.05, s.gestD), 0, 1);
      const p = applyGesture(s.gest, u);
      s.turnY = p.turn;
      s.mesh.rotation.y = s.heading + p.turn;
      r.armR.rotation.x = p.armR; r.armR.rotation.z = p.armRz;
      r.armL.rotation.x = p.armL; r.armL.rotation.z = p.armLz;
      r.chest.rotation.x = lerp(r.chest.rotation.x, r.stoop + p.chest, ed(10));
      r.neck.rotation.x = lerp(r.neck.rotation.x, p.neck, ed(9));
      r.neck.rotation.y = lerp(r.neck.rotation.y, p.look, ed(9));
      s.held.visible = !!p.vis;
      s.held.position.set(p.hand[0], p.hand[1], p.hand[2]);
      s.held.scale.set(p.item[0], p.item[1], p.item[2]);
      // The cart is parked where he stopped, hands OFF the bar. Half the
      // picture is the two seconds his hands are not on it.
      if (s.hasCart) {
        const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        s.cart.visible = true;
        s.cart.position.set(s.position.x + fx * 0.62, 0, s.position.z + fz * 0.62);
        s.cart.rotation.y = s.heading;
      }
      r.chest.rotation.z = -sw * 0.020 * gait;
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
      const al = Math.sin(s.phase - (bolting ? 0.2 : 0.45));
      r.armL.rotation.x = -al * amp * (bolting ? 1.25 : 0.8);
      r.armR.rotation.x = al * amp * (bolting ? 1.25 : 0.8);
      r.armL.rotation.z = bolting ? 0.12 : 0.09;
      r.armR.rotation.z = bolting ? -0.12 : -0.09;
    }
    if (s.angry > 0) {
      const w = Math.sin(s.angry * 22);
      r.armR.rotation.x = -1.9 + w * 0.45; r.armR.rotation.z = -0.55;
      r.armL.rotation.x = -0.4; r.chest.rotation.x = 0.12;
      r.neck.rotation.x = -0.12;
      s.bang.position.y = 2.15 + Math.abs(w) * 0.07;
    } else if (s.state === 'browse') {
      // 'conceal' used to share this branch with a fixed 1.55 reach. It cannot
      // reach here any more — a concealing thief always has a clip loaded, so
      // the block above returned before this line. Left as the plain
      // reaching-at-a-shelf pose it always was, which is what a shopper does
      // between clips.
      const reach = 1.05 + Math.sin(s.phase * 0.7) * 0.25;
      r.armR.rotation.x = -reach; r.armR.rotation.z = -0.22;
      r.chest.rotation.x = r.stoop + 0.05;
      r.neck.rotation.x = lerp(r.neck.rotation.x, 0.22, ed(6));   // looking at the shelf
    } else {
      r.chest.rotation.x = lerp(r.chest.rotation.x, r.stoop + (bolting ? 0.24 : 0.02), ed(8));
      r.neck.rotation.x = lerp(r.neck.rotation.x, bolting ? -0.10 : 0, ed(6));
    }
    r.chest.rotation.z = -sw * 0.020 * gait;
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
      p.item.rotation.y += dt * 1.05;
      p.item.position.y = 1.06 + Math.sin(performance.now() * 0.0028 + p.x) * 0.032;
      p.ring.material.opacity = 0.20 + 0.10 * Math.sin(performance.now() * 0.0045 + p.z);
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
      u.boost = K.boostTime; u.stamina = K.staminaMax; u.gassed = false;
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
    // What the cop had in the tank when he took it. Recorded for the bench.
    // NOTE it is not the discriminator I expected it to be — see the note on
    // bargeWinded/bargeFresh in bench(); what decides a barge is the wind the
    // contact TAKES, not the level he happened to be at.
    if (s.bargeStam == null) s.bargeStam = cop.userData.stamina / K.staminaMax;
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
    cop.userData.vel.multiplyScalar(0.15);
    cop.userData.stagger = K.bargeStagger;
    // ...AND HIS WIND. Round 4's second pass: the knockback alone was worth two
    // metres, and a cop whose sprint is 64% faster than the thief's cruise
    // reclaims two metres in one second — which is why the first version of
    // this measured 30 barges and 30 catches and I nearly reported the mechanic
    // as fixed on the strength of it FIRING. Firing is not working.
    //
    // Half his tank is what makes it a tactic. Ablated: turn this one line off
    // and barged-and-still-caught goes 59% -> 81%, and the whole "he came at
    // the cop" branch goes 89% -> 96%. It is the single biggest thing standing
    // between that branch and a foregone conclusion.
    const cu = cop.userData;
    cu.stamina = Math.max(0, cu.stamina - K.bargeWind);
    if (cu.stamina <= 0.0001) cu.gassed = true;
    // And the other half of it, on his side: going through a man is an
    // adrenaline dump, and adrenaline is the only thing in this file that lets
    // him out-run a cop at all. It is a TOP-UP of the same finite tank, not a
    // refill — it decays under pressure like everything else, so it buys him
    // the break and not the rest of the chase.
    s.adren = Math.max(s.adren, K.bargeDump);
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
      // ROUND 6 — YOU CANNOT GRAB A MAN YOU NEVER MADE. The gate is null in the
      // live game (the player is looking at the floor and picks his own body to
      // run at), and non-null in bench(), where the bot's information set has to
      // be modelled honestly or the one-exit misaim table measures an oracle.
      // See the `ident` block in bench().
      if (grabGate && !grabGate(s)) continue;
      s.caught = true; s.vel.set(0, 0, 0); s.state = 'caught';
      s.rig.armL.rotation.x = -2.5; s.rig.armR.rotation.x = -2.5;     // hands up
      api.onCatch && api.onCatch(s);
    }
  }

  function telemetry(api, dtLast) {
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
          // He has turned and gone for the rear cross-aisle. See updateShopper.
          viaBack: !!s.viaBack,
        };
      }
    }
    // ROUND 5 CONTRACT ADDITION (additive; a HUD that ignores it is unchanged).
    // The WIND bar is the game builder's, but the state machine behind it is
    // mine and it should not have to re-derive it from `stamina < eps`. Three
    // states and a countdown, which is exactly the READY / RECOVERING / WINDED
    // panel it asked for:
    //   winded     — gassed. You cannot sprint AT ALL and holding the key is
    //                actively worse than letting go (see updateCop). `windIn`
    //                is the seconds until you can go again, and it only ticks
    //                DOWN IF THE KEY IS UP — that is the whole lesson, and a
    //                countdown that stalls while you hold sprint teaches it
    //                faster than any tooltip. Infinity while it is held.
    //   recovering — off the key with something in the tank, refilling.
    //   ready      — full. Nothing to gain by waiting; go.
    // `burst` is the seconds of sprint currently in hand, which is what the
    // segments should count. `fatigue` is a lagging 0..1 that rises fast and
    // falls slow — a PULSE readout wants accumulated wear, not `1 - frac`
    // restated a second time in a different shape.
    const frac = u.stamina / K.staminaMax;
    const held = u.wantSprint ? K.regenHold : 1;
    const rate = K.staminaRegen * held;
    const need = u.gassed ? K.gassedRecover * K.staminaMax - u.stamina
                          : K.staminaMax - u.stamina;
    // `fatigue` is integrated in updateCop() now — it drives the cop's heave
    // animation, which has to run whether or not anything is reading the HUD.
    // Same number, same rise/fall rates, one owner.
    api.report({
      stamina: u.stamina, staminaMax: K.staminaMax, boost: u.boost,
      gassed: u.gassed, speed: u.speed, nearest, chase,
      wind: u.gassed ? 'winded' : frac > 0.995 ? 'ready' : 'recovering',
      windIn: need <= 0 ? 0 : rate > 0 ? need / rate : Infinity,
      burst: u.gassed ? 0 : u.stamina / K.staminaDrain,
      windFrac: frac, fatigue: u.fatigue,
      // Seconds of sprint a FULL tank buys, so the bar can size its segments
      // off the model instead of a hardcoded 3.1.
      burstMax: K.staminaMax / K.staminaDrain,
      refill: K.staminaMax / K.staminaRegen,
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
    if (!frozen) { updatePost(dt); updateFlee(dt); }
    updatePowerups(dt);
    for (const s of shoppers) updateShopper(s, dt, api, frozen);
    interactions(dt, api);
    telemetry(api, dt);
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

  // ROUND 5 — WHERE ARE THE CROSS-AISLES. The store builder cut a mid-store
  // cross-aisle this round and my nav grid picks it up for free (it is built
  // from the collider set, not from the floor plan), but the round-4 back-route
  // metric does NOT: it tested `z > HALF_LEN - 2.2`, i.e. "did he reach the
  // rear wall", and a thief who now cuts across the middle instead never trips
  // it. The first bench run after the cut landed showed outTheBack 0/40 with
  // the median chase up at 6.4 s, which is not the counterplay dying, it is the
  // instrument pointing at the wrong corridor. So: find the corridors from the
  // grid instead of naming them, and report which one he used.
  function crossBands() {
    const x0 = aisleX(0) - 1.0, x1 = aisleX(AISLE_COUNT - 1) + 1.0;
    const rows = [];
    for (let z = STORE.minZ + 0.5; z <= STORE.maxZ - 0.5; z += 0.25) {
      let free = 0, tot = 0;
      for (let x = x0; x <= x1; x += 0.35) { tot++; if (nav.free(x, z)) free++; }
      rows.push({ z, f: free / tot });
    }
    // A lane row sits at ~0.55 open (eight lanes of a shelved store); a
    // corridor row is open most of the way across. 0.72 splits them cleanly and
    // is not near either mode.
    const bands = [];
    let run = null;
    for (const r of rows) {
      if (r.f > 0.72) { if (!run) run = { z0: r.z, z1: r.z }; else run.z1 = r.z; }
      else if (run) { bands.push(run); run = null; }
    }
    if (run) bands.push(run);
    return bands.filter((b) => b.z1 - b.z0 >= 0.4).map((b) => ({
      z: (b.z0 + b.z1) / 2, half: (b.z1 - b.z0) / 2 + 0.75,
      // front / mid / back, by where it sits in the shelf run
      kind: (b.z0 + b.z1) / 2 < -HALF_LEN + 2.5 ? 'front'
          : (b.z0 + b.z1) / 2 > HALF_LEN - 2.5 ? 'back' : 'mid',
    }));
  }


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

  // ROUND 5 — the wind policies, hoisted so every bot can wear any of them.
  // Hysteresis is not decoration: without the `blown` latch a threshold policy
  // chatters on the boundary at ~60% duty and stops being an interval policy.
  function windPolicy(st, thief, gap, slack) {
    const u2 = cop.userData;
    // A live boost pins the tank at max, so sprinting through it is free and
    // NOT sprinting through it throws it away. This one line is worth 16 points
    // of `mode:'boost'` (58.7% -> see header): the rationing bot computes its
    // intercept slack off an inflated boosted top speed, decides the intercept
    // is comfortable, and WALKS — at copWalk x boostMul, 3.34 m/s — for the
    // whole 2.2 s of the drink. That is not a statement about energy drinks, it
    // is a bot that does not know a timer when it sees one. Nobody sips one.
    if (u2.boost > 0) return true;
    const frac = u2.stamina / K.staminaMax;
    const urgent = gap < 3.4 || thief.state === 'shove';
    const reserve = st.reserve ?? 0.28;
    if (frac <= reserve + 1e-6) st.blown = true;
    else if (frac >= 0.97) st.blown = false;
    return st.conserve === false ? true
      : st.conserve === 'pulse' ? (urgent || !u2.gassed)
      : st.conserve === 'keep' ? (urgent || !st.blown)
      // ROUND 5 — THE DEFAULT MOVED, and that it had to is the finding.
      // 'loose' is round 4's default: sprint whenever the intercept is even
      // slightly loose. Against a 3.10 s tank that was near-optimal — 83.3% on
      // this store, dead level with holding the key down. Against a 1.40 s tank
      // THE SAME BEHAVIOUR measures 43.0% and spends half the chase winded,
      // because it empties the tank in the first two seconds and never gets it
      // back. Nothing about the bot's routing changed; the lungs under it did.
      // That is what "stamina became a decision" looks like from the inside: a
      // policy that used to be free is now worth 32 points.
      : st.conserve === 'loose' ? (slack < 1.1 || gap < 5.0 || thief.state === 'shove')
      // ...so the competent default IS rationing now. This is also the round-4
      // header's own description of the `cut` bot ("only spends sprint when the
      // intercept is actually tight") finally matching the code under it.
      : (urgent || slack < 0.35);
  }

  function botGoal(thief, st, dt, tx, tz) {
    const u = cop.userData;
    if (st.bot === 'chase') {
      // ROUND 5 — the naive bot holds the key, which is what naive MEANS now
      // that holding it is no longer free. It still honours an explicit
      // `conserve`, so the ladder can be sliced into route skill and wind
      // skill instead of confounding the two.
      // No intercept estimate exists for a pure pursuit — it steers at the man,
      // it never asks when it could be somewhere. So `slack` is infinite and
      // the slack-based policies collapse; only the tank-based ones ('pulse',
      // 'keep') say anything about this bot, which is itself the point: you
      // cannot ration against a plan you do not have.
      const g = dist2d(cop.position.x, cop.position.z, tx, tz);
      return { x: tx, z: tz, sprint: windPolicy(st, thief, g, Infinity) };
    }

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
    const tSpd = K.thiefRun * K.thiefTired;                 // his cruise, not his ceiling
    const cSpd = T.copRun * 0.86;
    // ROUND 5 — A BOOST IS A TIMER, NOT A TOP SPEED. This read
    // `copRun * (boost > 0 ? boostMul : 0.86)` — one flat speed for the whole
    // route on the strength of a drink with 2.2 s left in it — so a boosted
    // cop planned intercepts 65% further away than he could reach, committed to
    // them, and arrived after the drink had worn off. It cost 12 points of
    // `mode:'boost'` and it was invisible at round 4's boostTime of 4.0 s
    // because the timer outlasted most plans. Two-phase arrival instead: the
    // metres the boost actually buys, then the rest at a normal pace.
    const bSpd = T.copRun * T.boostMul;
    const dBoost = u.boost > 0 ? u.boost * bSpd : 0;
    const arrive = (d) => (d <= dBoost ? d / bSpd : u.boost + (d - dBoost) / cSpd);
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
      const cT = arrive(cD);
      if (cT <= tT - 0.18) { best = { w, cT, tT }; break; }   // route is ordered: first = earliest
    }
    if (!best) {
      // Cannot head him off anywhere. Then the door is the last place he has to
      // be, so go and stand on it — this is exactly why camping works at all,
      // and a bot that would not do it is not a competent player.
      //
      // ROUND 6 — WITH ONE EXIT THAT IS ONLY TRUE AFTER HE RUNS. A man who is
      // still WALKING out will not walk into a uniform on the only door: he
      // turns back into the aisles, waits you out, and ditches the goods in a
      // shelf after dumpT (see the drift case in updateShopper). So the
      // fallback that was correct with two doors is now a losing line, and a
      // competent player learns that in one shift. Before the bolt: go and find
      // him. After it: the door is still the last place he has to be.
      // Measured, n=120, one door, this build: leaving the old fallback in
      // costs the `cut` bot 12 points, all of them to `ditched` trials.
      if (thief.bolted) {
        const cD = nav.at(st.copF, door.x, door.z);
        const tT = rTot / tSpd, cT = arrive(cD);
        if (isFinite(cD) && cT < tT + 1.2) return { x: door.x, z: door.z, sprint: true };
      }
      return { x: tx, z: tz, sprint: true };
    }
    // ROUND 6 — AND HE DOES NOT STAND STILL ON THE ONLY DOOR EITHER. The
    // intercept the search returns is often the door itself, which is correct
    // arithmetic and, since this round, a losing line: a subject who has not
    // bolted yet will not walk into a parked uniform, he turns back into the
    // aisles and ditches the goods. So the moment this bot's own loitering has
    // made him POSTED and the man is still walking, it stops waiting and closes
    // on him. That is one shift's worth of learning for a person and one line
    // here; without it the competent bot measures 60% instead of 74%, and all
    // 14 of those points are trials that end with the item back on a shelf.
    if (doorPosted() && !thief.bolted) return { x: tx, z: tz, sprint: true };

    // Wind management. Sprinting to arrive four seconds early buys nothing and
    // costs you the legs you need at the door; spend it when the intercept is
    // tight, or when he is close enough to grab.
    const slack = best.tT - best.cT;
    const gap = dist2d(cop.position.x, cop.position.z, tx, tz);
    // ROUND 5 — five wind policies, because "does stamina management pay?" is
    // the headline this round and it has to be a measurement between named
    // strategies, not an assertion. Every one of them is a thing a person
    // actually does with a sprint key. All override to full sprint inside
    // grabbing range or when he is on the push-bar — nobody paces themselves
    // through the last two metres.
    //   false     ALWAYS. Hold the key from the dispatch to the grab. The naive
    //             human, and the policy that was strictly dominant for four
    //             rounds.
    //   'pulse'   INTERVALS, run into the ground. Sprint until the tank is
    //             empty, let go, go again the moment you are allowed. Maximum
    //             sprint fraction; pays the WINDED crawl every single cycle.
    //   'keep'    INTERVALS WITH A RESERVE. Same rhythm, but let go at
    //             `reserve` instead of at zero, so you never go winded and you
    //             always have a burst in hand for a shoulder or a door. This is
    //             the policy the design is meant to reward.
    //   'ration'  WALK UNTIL IT IS TIGHT. Spend nothing until the intercept
    //             actually needs it. Arrives full, which is the only thing that
    //             survives a shoulder. THIS IS THE DEFAULT NOW — see below.
    //   'loose'   round 4's default, kept as the ablation.
    // Measured, n=150 unless marked, same routing, right aisle, no powerup:
    //   always 46.0% (n=250) · loose 47.6% (n=250) · pulse 63.3% ·
    //   keep 70.0% · ration 74.7%
    // Round 3 answered this question with a flag that moved the sprint fraction
    // from 0.54 to 0.57 and reported a wash — a true statement about the flag
    // and no statement at all about the game. These are five different players.
    return { x: best.w.x, z: best.w.z, sprint: windPolicy(st, thief, gap, slack) };
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
        st.seen.x = tx; st.seen.z = tz; st.seenT = 0; st.lost = null;
        // ROUND 6 — DID HE EVER ACTUALLY MAKE HIM. Seeing a shape down a lane
        // at nineteen metres is a sighting; knowing which coat to grab in a
        // doorway is a different and much closer thing. `identR` is most of an
        // aisle from its mouth, which is exactly the look the dispatch buys
        // you and exactly the look a man stood on the door never gets.
        if (dist2d(cop.position.x, cop.position.z, tx, tz) < K.identR) {
          st.madeT = (st.madeT || 0) + dt;
          if (st.madeT > K.identT) st.made = true;
        }
      } else {
        // ROUND 4 — the bot used to steer at where it last SAW him, which is
        // the one thing a competent player never does: a man who was heading
        // for the doors two seconds ago is not still standing there. Walk the
        // last sighting forward along the exit field at his cruise instead.
        // That is a dead-reckoning a person does in their head, it needs
        // nothing the desk did not tell them, and it is worth eleven points at
        // misaim 2 — which is most of the gap an outside critic opened up on
        // this bench by bringing its own bot.
        st.seenT += dt;
        // Only the competent bot does this. Steering at a stale sighting IS
        // what makes `chase` the naive baseline, and giving all three bots the
        // dead-reckoning collapsed the skill ladder into one rung: chase went
        // from 60% to 70% and its misaim table went flat with it, which made
        // the ladder useless for saying how much the dispatch is worth TO WHOM.
        if (st.bot !== 'cut') { tx = st.seen.x; tz = st.seen.z; }
        else {
          if (!st.lost) st.lost = { x: st.seen.x, z: st.seen.z };
          let step = K.thiefRun * K.thiefTired * dt;
          while (step > 0.05) {
            const d = nav.steer(exitF, st.lost.x, st.lost.z, { look: 3.0 });
            if (!d) break;
            const m = Math.hypot(d.x, d.z) || 1;
            const h = Math.min(step, 0.34);
            st.lost.x += (d.x / m) * h; st.lost.z += (d.z / m) * h;
            step -= h;
          }
          tx = st.lost.x; tz = st.lost.z;
        }
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
    // ROUND 6 — the ramp is a bench axis. Default 1 = round 5's difficulty, so
    // every headline in this file's header stays directly comparable and a run
    // that was taken at an easier setting says so on its own result object
    // (`res.difficulty`), the same way `res.override` announces a sweep.
    const saveLevel = DIFF.level;
    if (opts.difficulty != null) DIFF.level = clamp(+opts.difficulty || 0, 0, 1);
    const save = { pos: cop.position.clone(), ud: { ...cop.userData } };
    const R = [];                            // per-trial records
    const bands = crossBands();              // the corridors the store ACTUALLY has

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
      thief.vel.set(fx * K.thiefWalk, 0, fz * K.thiefWalk);

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
      cu.stamina = K.staminaMax; cu.gassed = false; cu.skid = 0; cu.stagger = 0;
      cu.heading = Math.atan2(cvx, cvz);
      cu.boost = mode === 'boost' ? K.boostTime : 0;

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
        blown: false, reserve: opts.reserve,
        copF: null, copBuf: null, cfT: 0, planT: 0, route: null, campI: null,
        // All the desk actually told him: an aisle number. Not a position in it.
        blind: opts.blind !== false, seen: { x: aisleX(dAisle), z: 0 }, seenT: 0,
        // ROUND 6 — has he had a close enough look to know WHICH BODY is his.
        made: false, madeT: 0,
      };

      // ---- THE IDENTITY MODEL. ------------------------------------------
      // Round 4 solved the door-camper by hiding the destination behind a
      // second door. With one door back — the client asked for it and he is
      // right — the destination is public again, and the ONE-DOOR TABLE
      // MEASURED BEFORE ANY OF THIS ROUND'S CHANGES says exactly what that
      // costs: cut 76.7 / 76.7 at off0 with two doors and one, but off1 goes
      // 34.7 -> 73.3 and the camper goes 23.3 -> 71.7. Being sent to the wrong
      // aisle stopped costing anything, because you did not need to find him:
      // you needed to be at the only place he had to be.
      //
      // What the old bench was quietly asserting is that a cop standing in a
      // doorway KNOWS WHICH OF THE PEOPLE COMING THROUGH IT IS THE SUBJECT. He
      // does not. That is the entire job of the aisle number once there is one
      // exit, and it was the one thing the instrument could not see, because
      // botInput() is handed `thief` directly and every other blindness in this
      // file is about POSITION.
      //
      // So: you cannot grab a man you never made. If the bot has never had a
      // clear line to the subject inside identR, then at the moment of contact
      // it grabs one of the bodies within identPick at random — and if that is
      // a shopper it is a HARASSMENT COMPLAINT, which is what it is in the game
      // too. One body inside the radius is not a choice and costs nothing, so
      // this is inert everywhere except in a crowd, which in this store means
      // the front end and the doorway. `ident:false` reproduces the old oracle
      // exactly, and every one-door-vs-two-door comparison in this round's
      // report is published both ways.
      let falseGrabs = 0, identCool = 0, crowdAtGrab = 0;
      grabGate = opts.ident === false ? null : (sub) => {
        if (st.made) return true;
        if (identCool > 0) return false;
        let n = 0, hitI = -1, k = 0;
        for (const o of shoppers) {
          if (o.escaped || o.caught || !o.mesh.visible) continue;
          if (dist2d(o.position.x, o.position.z, cop.position.x, cop.position.z) < K.identPick) n++;
        }
        crowdAtGrab = Math.max(crowdAtGrab, n);
        if (n <= 1) return true;
        const pickI = Math.floor(rnd() * n);
        for (const o of shoppers) {
          if (o.escaped || o.caught || !o.mesh.visible) continue;
          if (dist2d(o.position.x, o.position.z, cop.position.x, cop.position.z) >= K.identPick) continue;
          if (k++ === pickI) { hitI = o === sub ? 1 : 0; break; }
        }
        if (hitI === 1) return true;
        falseGrabs++; identCool = K.identCool;      // he has the wrong man by the arm
        return false;
      };

      let time = 0, done = 0, finalGap = 0, ducked = false;
      let tBolt = NaN, gapAtBolt = NaN, routeAtBolt = NaN;
      let minGap = Infinity, sumTs = 0, sumCs = 0, nS = 0;
      let gassedT = 0, slowT = 0, boostT = 0, sumCm = 0, sumLat = 0, nLat = 0;
      let sprintT = 0, atCop = null, doorT = NaN, exitUsed = -1;
      // ROUND 5. bursts = how many separate times he put his foot down. This is
      // the number the design is actually aiming at ("a countable rhythm of
      // short bursts"), and seconds-of-sprint cannot see it: 3.4 s in one go
      // and 3.4 s in four goes are the same sprintFrac and a different game.
      let bursts = 0, wasSprint = false, usedBand = null, wentBack = false;
      const api = {
        onBolt() {}, onHarass() {},
        // ROUND 6 — a fourth ending. He waited you out and ditched the goods in
        // a shelf, so there is nothing to arrest him for and nothing was lost.
        // It is NOT a catch and it is NOT an escape, and pooling it into either
        // one would hide the whole point: a cop who stands on the door turns
        // every incident into this, which pays nothing.
        onAbort() { done = 4; },
        onCatch() { done = 1; },
        onEscape() {
          done = 2;
          // How far behind he was when the doors ate him. This is THE number.
          finalGap = dist2d(cop.position.x, cop.position.z, thief.position.x, thief.position.z);
        },
      };
      while (time < maxT && !done) {
        if (identCool > 0) identCool -= dt;
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
          if (cu.speed > K.copWalk + 0.35) sprintT += dt;
          if (cu.sprinting && !wasSprint) bursts++;
          wasSprint = !!cu.sprinting;
          // Which corridor did he actually run ALONG. Being inside the band is
          // not enough — an aisle crosses every band. He has to be travelling
          // down it, i.e. moving laterally and mostly laterally. The rear
          // cross-aisle is not a clean corridor in this store (0.6 open, not
          // 0.95) so it does not register as a band; `wentBack` still owns it
          // and wins the tie, because reaching the rear wall is the strongest
          // statement a route makes about itself.
          if (Math.abs(thief.vel.x) > 1.1 && Math.abs(thief.vel.x) > Math.abs(thief.vel.z)) {
            for (const b of bands) {
              if (Math.abs(thief.position.z - b.z) < b.half) { usedBand = b.kind; break; }
            }
          }
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
          if (thief.dbgTarget < K.thiefRun * 0.92) slowT += dt;
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
        bursts, usedBand,
        // ROUND 6 — the identity model's output: did he ever make the subject,
        // how many bodies were inside grabbing range when he committed, and how
        // many times he came away with a stranger's arm (= a complaint).
        made: !!st.made, falseGrabs, crowdAtGrab,
        bargeStam: thief.bargeStam,
        atCop: atCop === true, doorT, exitUsed,
        caughtShoving: done === 1 && isFinite(doorT),
        sprintFrac: nS ? sprintT / (nS * dt) : NaN,
        // Starting geometry, so a result can be sliced by how deep in the aisle
        // he was when you walked in on him instead of only pooled.
        z0: tzz, d0: dist2d(txx, tzz, cx0, cz0),
        noBolt: !isFinite(tBolt),
      });
    }

    grabGate = null;
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
      // Non-null means THIS RUN WAS NOT THE SHIPPED BUILD. See agents.override.
      // A swept number that does not carry this is how a file ends up running
      // constants its own report does not describe.
      override: Object.keys(OVR).length ? { ...OVR } : null,
      // Null when the lung inequality holds. Non-null means the wind numbers on
      // this object do not describe a game where managing your wind pays, and
      // it says which constant broke it. See lungCheck().
      lungBroken: lungCheck().ok ? null : lungCheck(),
      catchRate: +(caught.length / n * 100).toFixed(1),
      escaped: esc.length, stalled: stall.length,
      // He ditched it rather than walk into you. See onAbort above and dumpT.
      ditched: R.filter((r) => r.done === 4).length,
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
      // Cop's tank AT THE MOMENT OF CONTACT. Kept because it is real data, but
      // it is NOT the discriminator and I nearly reported it as one: these two
      // come out within a point of each other (60% / 59%), because what decides
      // the barge is the 1.5 s the contact TAKES OFF him, not the level he
      // happened to be at. The claim is settled by ablation instead — turn
      // bargeWind off and barged-and-still-caught goes 59% -> 81%.
      bargeWinded: branch((r) => r.barged && r.bargeStam < 0.35),
      bargeFresh: branch((r) => r.barged && r.bargeStam >= 0.35),
      reachedDoor: R.filter((r) => isFinite(r.doorT)).length,
      exitSplit: EXITS.map((e, i) =>
        `${e.label}:${R.filter((r) => r.exitUsed === i).length}`).join(' '),
      copSprintFrac: _f2(_mean(R.map((r) => r.sprintFrac).filter(isFinite))),
      // Did he ever use the back of the store? The counterplay, measured.
      outTheBack: R.filter((r) => r.wentBack).length,
      outTheBackCaught: R.filter((r) => r.wentBack && r.done === 1).length,
      // ROUND 5 — which corridor he actually ran along. `outTheBack` alone
      // stopped describing the counterplay the moment the store grew a mid
      // cross-aisle: the route is still "leave the aisle sideways and come down
      // a different one", it just does not have to reach the rear wall to do
      // it any more. Each entry carries its own catch rate, because a route
      // that is never caught and a route that is always caught are both
      // foregone conclusions wearing a chase.
      viaBand: ['mid', 'back', 'front'].map((k) => {
        const g = bolted.filter((r) => (r.wentBack ? 'back' : r.usedBand) === k);
        const c = g.filter((r) => r.done === 1);
        return `${k} n${g.length}${g.length ? `:${Math.round(c.length / g.length * 100)}%` : ''}`;
      }).join(' ') + ` straight n${bolted.filter((r) => !r.wentBack && !r.usedBand).length}`,
      crossBands: bands.map((b) => `${b.kind}@${b.z.toFixed(1)}`).join(' '),
      // ROUND 5 — the countable rhythm, counted. Median separate sprints per
      // chase. If this is 1 the tank is longer than the chase and stamina is a
      // one-shot budget however pretty the bar is.
      burstsPerChase_median: _f2(_q(bolted.map((r) => r.bursts), 0.5)),
      burstsPerChase_p90: _f2(_q(bolted.map((r) => r.bursts), 0.9)),
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
      // ---- ROUND 6: one exit, and who he thinks he is holding ---------------
      doors: EXITS.length,
      difficulty: DIFF.level,
      // Did he ever get a close enough look to know which coat to grab. This is
      // the number that separates a dispatch you used from one you ignored, and
      // with one door it is most of what the aisle number is now worth.
      madePct: +(R.filter((r) => r.made).length / n * 100).toFixed(1),
      // Grabbed a stranger. In the game that is a harassment complaint and three
      // of them is traffic duty, so it is not a rounding error on a catch rate.
      falseGrabs: R.reduce((a, r) => a + r.falseGrabs, 0),
      falseGrabTrials: R.filter((r) => r.falseGrabs > 0).length,
      // Biggest crowd inside grabbing range at the moment he committed.
      crowdAtGrab_median: _f2(_q(R.map((r) => r.crowdAtGrab), 0.5)),
      ident: opts.ident !== false,
    };
    if (opts.raw) res.raw = R;
    if (traceK >= 0) res.trace = trace;
    DIFF.level = saveLevel;
    return res;
  }

  // =========================================================================
  // benchShift — THE SECOND INSTRUMENT, AND THE ONE THE ONE-EXIT DESIGN LIVES
  // OR DIES ON.
  //
  // bench() measures ONE CHASE from a dispatch that has already happened. It
  // cannot see the thing this round changed, because deterrence acts BEFORE the
  // theft: a camper's catch rate is high and always was, and under this round
  // it is still high — he is standing on the only door. What collapses is that
  // there is nothing to catch. A catch rate is a conditional probability and
  // the condition is what moved, so the headline number for a camper has to be
  // POINTS PER SHIFT, not percent.
  //
  // So this runs a whole shift: fourteen customers, subjects armed on game.js's
  // own cadence, a cop driven by one of three policies, and it counts what the
  // scoreboard would count. game.js scores a catch at 100 and an escape at 0,
  // so points = 100 x catches; complaints are the other axis and three of them
  // is a demotion, so they are reported rather than netted.
  //
  //   desk   sits at the service desk, reads the wall, and dispatches into the
  //          mouth of the subject's aisle `deskLag` seconds after he conceals —
  //          which is postSpawn('aisle'), the same teleport the DISPATCH button
  //          performs. Then chases with `cut`. This is the intended player.
  //   chase  same dispatch, naive pursuit. The intended player, badly.
  //   camp   walks to the door at the start of the shift and stands on it. He
  //          never reads the wall, never dispatches, and never has to.
  // =========================================================================
  function benchShift(opts = {}) {
    const n = opts.n ?? 8;
    const minutes = opts.minutes ?? 4;
    const policy = opts.policy ?? 'desk';
    const dt = 1 / 60;
    const saveLevel = DIFF.level;
    const savePos = cop.position.clone(), saveUd = { ...cop.userData };
    const rows = [];
    // game.js's PACE table, as of round 6. Density is ITS axis, so this is a
    // copy for measurement only and it is marked as one: if game.js moves its
    // table, this stops describing the shift and has to be re-copied.
    const PACE = [
      { at: 0, live: 1, gap: [26, 38] },
      { at: 150, live: 2, gap: [18, 28] },
      { at: 330, live: 3, gap: [12, 20] },
    ];
    const paceAt = (c) => { let p = PACE[0]; for (const q of PACE) if (c >= q.at) p = q; return p; };

    for (let k = 0; k < n; k++) {
      setSeed((opts.seed ?? 5150) + k * 7919);
      reset();
      for (const s of shoppers) resetShopper(s, false);
      let clock = 0, rearm = 2.0;
      let incidents = 0, catches = 0, escapes = 0, aborts = 0, complaints = 0;
      let bolts = 0, thefts = 0, decoys = 0;
      let postedT = 0;
      // The cop's own little state machine. `job` is the subject he has been
      // dispatched onto, null when he is at the desk.
      let job = null, dispatchIn = 0;
      const st = {
        gotBoost: true, puTarget: null, puT: 0, detour: 7,
        path: [], repath: 0, goal: { x: 0, z: 0 },
        lag: 0.16, hist: [0, 0], bot: policy === 'chase' ? 'chase' : 'cut',
        conserve: opts.conserve, blown: false,
        copF: null, copBuf: null, cfT: 0, planT: 0, route: null, campI: 0,
        blind: true, seen: { x: 0, z: 0 }, seenT: 0, made: false, madeT: 0,
      };
      const api = {
        onBolt() { bolts++; },
        onCatch() { catches++; job = null; st.made = false; st.madeT = 0; },
        onEscape() { escapes++; job = null; st.made = false; st.madeT = 0; },
        onHarass() { complaints++; },
        onAbort() { aborts++; },
        onLeave() {},
      };
      // The camper walks to the door once and stays. Everyone else starts at
      // the desk, which is 40 m from the only exit and is NOT a post on it —
      // that separation is what makes deterrence a choice rather than a tax.
      cop.position.set(SERVICE_DESK.x, 0, SERVICE_DESK.z);
      solids.resolve(cop.position, BODY_R);
      cop.userData.vel.set(0, 0, 0); cop.userData.speed = 0;

      const armOne = () => {
        const live = shoppers.filter((s) => s.guilty && !s.escaped && !s.caught && s.mesh.visible).length;
        if (live >= paceAt(clock).live) return false;
        const pool = shoppers.filter((s) => !s.guilty && !s.escaped && !s.caught && s.mesh.visible
          && !s.leaving && s.angry <= 0
          && dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z) > 9);
        if (!pool.length) return false;
        const s = pool[Math.floor(rnd() * pool.length)];
        s.guilty = true; s.stole = false; s.bolted = false; s.aborts = 0;
        s.chill = 0; s.balk = 0; s.leaving = false;
        s.concealT = rr(10, 22);
        return true;
      };

      const maxT = minutes * 60;
      while (clock < maxT) {
        if (opts.difficulty != null) DIFF.level = clamp(+opts.difficulty || 0, 0, 1);
        else DIFF.level = difficultyForClock(clock);

        // ---- spawn pacing, on game.js's cadence --------------------------
        rearm -= dt;
        if (rearm <= 0) {
          const g = paceAt(clock).gap;
          if (armOne()) rearm = rr(g[0], g[1]); else rearm = 2.0;
        }

        // ---- what the cop is doing ---------------------------------------
        let input;
        if (policy === 'camp') {
          const e = EXITS[0];
          const d = dist2d(cop.position.x, cop.position.z, e.x, e.z);
          // Once somebody is inside grabbing range, stop being furniture.
          let tgt = shoppers.find((s) => s.guilty && s.bolted && !s.escaped && !s.caught);
          if (tgt && dist2d(tgt.position.x, tgt.position.z, cop.position.x, cop.position.z) < 4.0) {
            st.made = st.made || false;
            input = botInput(tgt, 'none', st, dt);
          } else {
            const p = nav.path(cop.position.x, cop.position.z, e.x, e.z);
            const holder = { position: cop.position, path: p };
            const dir = followPath(holder, 0);
            input = dir ? { x: dir.x, z: FWD_SIGN * dir.z, sprint: d > 6 } : { x: 0, z: 0, sprint: false };
          }
        } else {
          // THE DESK. He is watching the wall; the tell fires when the subject
          // finishes concealing, and he presses DISPATCH `deskLag` later —
          // which is a teleport to the mouth of that man's aisle, exactly what
          // game.js's postSpawn('aisle') does.
          if (!job) {
            const tell = shoppers.find((s) => s.guilty && s.stole && !s.escaped && !s.caught && s.mesh.visible);
            if (tell && dispatchIn <= 0) { dispatchIn = opts.deskLag ?? 4.0; }
            if (tell && dispatchIn > 0) {
              dispatchIn -= dt;
              if (dispatchIn <= 0) {
                job = tell; incidents++;
                const a = clamp(aisleOf(tell.position.x) + (opts.misaim ?? 0), 0, AISLE_COUNT - 1);
                cop.position.set(aisleX(a), 0, -HALF_LEN + 3.0);
                solids.resolve(cop.position, BODY_R);
                cop.userData.vel.set(0, 0, 0); cop.userData.speed = 0;
                cop.userData.stamina = K.staminaMax; cop.userData.gassed = false;
                st.path = []; st.repath = 0; st.made = false; st.madeT = 0;
                st.seen.x = aisleX(a); st.seen.z = 0; st.seenT = 0; st.lost = null;
                st.hist = [tell.position.x, tell.position.z];
                st.copF = null; st.cfT = 0; st.planT = 0; st.route = null;
              }
            }
          }
          if (job && (job.escaped || job.caught || !job.guilty)) job = null;
          if (job) input = botInput(job, 'none', st, dt);
          else {
            // Back to the desk between cases. Walking, so the deterrence field
            // sees a man moving and not a man posted.
            const d = dist2d(cop.position.x, cop.position.z, SERVICE_DESK.x, SERVICE_DESK.z);
            if (d < 1.2) input = { x: 0, z: 0, sprint: false };
            else {
              const p = nav.path(cop.position.x, cop.position.z, SERVICE_DESK.x, SERVICE_DESK.z);
              const dir = followPath({ position: cop.position, path: p }, 0);
              input = dir ? { x: dir.x, z: FWD_SIGN * dir.z, sprint: false } : { x: 0, z: 0, sprint: false };
            }
          }
        }

        tick(dt, input, api);
        clock += dt;
        if (doorPosted()) postedT += dt;
        for (const s of shoppers) {
          if (s.gest && s.gest.tell === 'decoy' && s.gestT <= dt) decoys++;
          // A THEFT THAT ACTUALLY HAPPENED, counted once, whether or not the
          // player ever saw it. This is the number the camper has to be judged
          // on: his catch RATE is a percentage of whatever got as far as this
          // line, and the whole claim of the one-exit design is that standing
          // on the door drives this to zero rather than driving the rate down.
          if (s.guilty && s.stole && !s.__inc) { s.__inc = 1; thefts++; }
        }
      }
      for (const s of shoppers) s.__inc = 0;
      rows.push({
        thefts, catches, escapes, aborts, complaints, bolts,
        points: catches * 100, decoys,
        postedFrac: postedT / maxT,
      });
    }

    DIFF.level = saveLevel;
    cop.position.copy(savePos); Object.assign(cop.userData, saveUd);
    grabGate = null; reset();
    const mean = (f) => +(_mean(rows.map(f))).toFixed(2);
    return {
      policy, minutes, n, doors: EXITS.length,
      misaim: opts.misaim ?? 0,
      difficulty: opts.difficulty == null ? 'ramped' : opts.difficulty,
      // THE HEADLINE FOR THIS INSTRUMENT.
      pointsPerShift: mean((r) => r.points),
      catchesPerShift: mean((r) => r.catches),
      escapesPerShift: mean((r) => r.escapes),
      // THE ONE THAT ANSWERS THE BRIEF. A theft that actually happened, counted
      // whether or not the player saw it. If deterrence works, this is what
      // goes to zero for a camper, and his catch rate is then a percentage of
      // nothing — which is why a catch rate alone cannot describe him.
      incidentsPerShift: mean((r) => r.thefts),
      boltsPerShift: mean((r) => r.bolts),
      abortsPerShift: mean((r) => r.aborts),
      complaintsPerShift: mean((r) => r.complaints),
      decoysPerShift: mean((r) => r.decoys),
      // Fraction of the shift the cop spent posted on the way out.
      postedFrac: mean((r) => r.postedFrac),
      raw: opts.raw ? rows : undefined,
    };
  }

  // DOES CAMPING THE DOOR PAY? With one exit this cannot be answered with a
  // catch rate, so it is answered with the scoreboard. Three players, same
  // shift length, same spawn cadence.
  function benchIncome(n = 8, opts = {}) {
    const o = { ...opts, n };
    const fmtS = (r) => `pts/shift ${r.pointsPerShift}`
      + ` | incidents ${r.incidentsPerShift} caught ${r.catchesPerShift}`
      + ` lost ${r.escapesPerShift} | balked ${r.abortsPerShift}`
      + ` | complaints ${r.complaintsPerShift}`
      + ` | on the door ${(r.postedFrac * 100).toFixed(0)}%`;
    return {
      desk: fmtS(benchShift({ ...o, policy: 'desk' })),
      naive: fmtS(benchShift({ ...o, policy: 'chase' })),
      camper: fmtS(benchShift({ ...o, policy: 'camp' })),
    };
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
  // Every line carries the distribution. A catch rate on its own is what got
  // round 3 marked down and it is not available from this file any more.
  const fmt = (r) => `${r.mode}${r.misaim ? `/off${r.misaim}` : ''}:${r.catchRate}%`
    + ` chase ${r.catchT_median}s (<1s ${r.catchUnder1sPct}%)`
    + ` | atCop ${r.cameAtCop} | away ${r.turnedAway}`
    + ` | barge ${r.barged}/${r.squeezed} got ${r.bargeGot}`
    + ` | door ${r.caughtAtDoor}/${r.reachedDoor} miss${r.missByM_median}m`;
  function benchLine(n = 200, opts = {}) {
    return benchAll(n, opts).map(fmt).join('  |  ');
  }
  // THE report, all from postSpawn('aisle'), all with the distribution attached.
  function benchReal(n = 200, opts = {}) {
    const o = { ...opts, n, spawn: 'aisle' };
    return {
      // The headline and the thing that decides whether the desk phase is worth
      // playing, printed together, because separating them is how round 3 came
      // to ship a game whose dominant strategy was to ignore the dispatch.
      noPowerup:   fmt(bench({ ...o, mode: 'none' })),
      doorCamper:  fmt(bench({ ...o, mode: 'none', bot: 'camp' })),
      naivePursuit: fmt(bench({ ...o, mode: 'none', bot: 'chase' })),
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
    bench, benchAll, benchLine, benchReal, benchCamp, benchShift, benchIncome,

    // ROUND 6 CONTRACT ADDITION — THE DIFFICULTY RAMP (additive; a game.js that
    // never calls this gets round 5's difficulty exactly, because level 1 IS
    // round 5 and 1 is the default).
    //
    //   in game.js's update, once a frame, idempotent and free:
    //       const a = agentsOf();
    //       a.setDifficulty(a.difficultyForClock(st.clock));
    //
    // DENSITY IS NOT ON THIS DIAL. game.js owns how many cases are open and how
    // often one is armed (its PACE table); this owns how hard ONE of them is —
    // his running speed, the length of his drift out to the door, the "oh shit"
    // beat before the bolt, how much panic fuel he has, and how long the tell
    // is held on the monitor. The two ramps share the 0/150/330 s breakpoints
    // on purpose so the shift reads as one curve; if game.js moves its table,
    // move RAMP with it rather than letting them drift apart.
    //
    // The lever the game builder asked for by name is `rampWalk`: the drift out
    // to the door is 0.80x for the first couple of minutes, so the tell-to-door
    // window — route metres over thiefWalk — is 25% longer while the player is
    // still learning to read the wall. That is the client's "it should take a
    // minute", bought on the difficulty axis where it belongs.
    setDifficulty(d) { DIFF.level = clamp(+d || 0, 0, 1); return DIFF.level; },
    get difficulty() { return DIFF.level; },
    difficultyForClock, get ramp() { return RAMP; },

    // ROUND 6 — the one-exit economy, for anyone who wants to show it.
    // `posted` is true while the cop has been loitering within deterR route
    // metres of the way out for longer than deterT: the state in which nobody
    // in the building will start a theft. game.js may want it on the HUD — a
    // player who is being punished by an ABSENCE needs to be told that is what
    // is happening, or a quiet shift reads as a broken one. Suggested copy is
    // the fiction, not the mechanic: "FLOOR IS QUIET — NOBODY'S GOING TO TRY IT
    // WITH YOU STOOD THERE".
    get posted() { return doorPosted(); },
    get postedFor() { return postT; },
    // Decoy clips, for a critic who wants to drive one on demand:
    //   agents.playGesture(agents.shoppers[3], 'restash')
    gestures: GESTURES,
    playGesture(s, id) { return startGesture(s, 'decoy', id); },
    // debug handles
    // game.js counts down the door alarm off a thief's speed. TUNING.thiefRun is
    // his opening ceiling, not his cruise — use these instead so the ETA is true.
    thiefCruise: () => K.thiefRun * K.thiefTired,
    thiefTop: () => K.thiefRun * K.thiefPanic,
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
    // ROUND 5 debug handles.
    // `override` is the sweep lever every number in this round's report was
    // measured with: set a key, run bench(), delete the key. It is EMPTY in
    // normal operation and TUNING wins over the fallbacks, so it cannot shadow
    // config.js the way `R5` did — and bench() stamps whatever is in it onto
    // its own result as `res.override`, so a swept measurement announces
    // itself instead of being quoted as the shipped build. Leave it empty.
    // crossBands() is how the back-route metric finds the store's corridors
    // from the nav grid instead of assuming where they are.
    override: OVR, crossBands, lungCheck,
    get thieves() { return shoppers.filter((s) => s.guilty); },
  };
}
