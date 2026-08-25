// OWNER: builder-game. Mode flow, scoring, rank, harassment complaints, HUD copy.
// CONTRACT — must keep exporting exactly this:
//   createGame(hudEl, deps) -> { mode, st, update(dt), enterFloor(aisleIndex),
//                                enterDesk(), score(evt), render(), api }
//   deps = { cctv, agents, world, THREE }   (main.js passes real references)
// Modes: 'desk' (monitor wall) | 'floor' (on foot) | 'writeup' | 'demoted'
//
// Additive (safe to ignore): the returned object also carries
//   st        live scoreboard
//   api       callback bag main.js hands to agents.update() — onBolt/onCatch/
//             onEscape/onHarass/report, plus mode/aisle/frozen that agents reads
//   shot(n)   composite 3D + HUD into shots/<n>.png (window.__CHOP.snap does this
//             too now; shot() is kept only so old console snippets still run)
//   bot       the same actions the mouse and keyboard drive, callable from a
//             script. ./game/eval.js uses it to bench the desk phase.
//
// This file owns the loop; ./game/hud.js owns every pixel; ./game/lines.js owns
// every word. cctv and agents arrive through `deps`; window.__CHOP is only a
// fallback for consoles and old bootstraps.
import {
  CAMERAS, EXIT, AISLE_COUNT, AISLE_LEN, AISLE_GAP, SHELF_W,
  aisleX, STORE, SERVICE_DESK, FRONT_WALK_Z, TUNING,
} from './config.js';
import * as L from './game/lines.js';
import { createHUD, fallbackTiles } from './game/hud.js';

export const RANKS = ['Traffic Duty', 'Cart Corral', 'Loss Prevention', 'Senior LP', 'Chief of Chops'];
// Points needed to hold a title on merit. You start at index 2 with nothing.
const RANK_AT = [-1, -1, 0, 550, 1400];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rr = (a, b) => a + Math.random() * (b - a);
const HALF = AISLE_LEN / 2;
const PITCH = AISLE_GAP + SHELF_W;
const d2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const aisleIdx = (x) => clamp(Math.round(x / PITCH + (AISLE_COUNT - 1) / 2), 0, AISLE_COUNT - 1);
const inAisle = (z) => z > -HALF - 0.35 && z < HALF + 0.35;

// ===========================================================================
// ROUND 6 — THE ROSTER NOW ASKS THE WALL WHICH MONITOR HE IS ON
// ===========================================================================
// What follows was the channel oracle for five rounds: a zone table. z below the
// aisles is CAM 07 or CAM 05, z above them is CAM 08 or CAM 06, anything between
// is the aisle pair by x. It was written when the wall was wallpaper, and as
// wallpaper it was fine.
//
// It is not fine now. cctv.js rebuilt the desk around a 766x431 spot monitor, so
// the player LOOKS at the picture, and the picture and this table disagreed for
// 7 of 13 subjects on the first frame I measured — 54%. Worse, the disagreements
// are the loud kind: shots/game_r6_before.png is CAM 06 with a man standing in
// the middle of the spot monitor, boxed and labelled STOPPED 0:02, over a roster
// that says NO SUBJECTS IN FRAME. That is the original playtest complaint
// wearing different clothes — the pictures and the list are unrelated, so read
// the list.
//
// cctv.channelsFor(x,z,h) answers the question properly: frustum test plus the
// same line-of-sight test through the store's colliders that its analytics boxes
// use, nearest first. 0.022 ms/frame for all thirteen subjects across all nine
// channels — it is free, and it is the only source of truth that agrees with the
// glass by construction.
//
// The zone table survives as a fallback for a console that builds this file
// without a cctv, and for nothing else.
//
// ROUND 9 — AND IT IS NOW A TABLE OF ONE LINE. config.js put ONE CHANNEL ON
// EACH AISLE: channel N is aisle N, each dome sitting above the front cross-
// aisle looking down its own run, so it sees the whole 26 m plus both cross-
// aisle mouths. The old body of this function was four zones and a shift — it
// had to be, because a channel covered an aisle PAIR and the front and back
// walks were filed under whichever camera happened to point at them. None of
// that is true any more, and the honest fallback is the same sentence the
// player now holds in his head: which aisle is he standing in.
//
// The one exception is the vestibule, where the door camera is genuinely a
// different picture from the aisle behind it.
function camForZone(x, z) {
  if (d2(x, z, EXIT.x, EXIT.z) < 9 && CAMERAS.length > AISLE_COUNT) return AISLE_COUNT;
  return aisleIdx(x);
}
function camDist(i, x, z) {
  const p = CAMERAS[i].pos;
  return Math.hypot(p[0] - x, p[2] - z);
}
// Nearest-first is the right ORDER and the wrong RULE to apply every frame. Two
// domes whose ranges cross put a subject a metre from the tie-break, and a
// roster row that changes channel four times a second is less readable than the
// zone table was. So a row STAYS on a channel that can still see him, and only
// moves when another is CHAN_MARGIN metres closer AND has been for CHAN_DWELL.
// Measured: at 4.0 m / 0.7 s the row follows a man walking out of an aisle onto
// the front end within about a stride of when the picture does, and a man
// browsing an end-cap never flips at all.
const CHAN_MARGIN = 4.0;
const CHAN_DWELL = 0.7;
// This store has blind spots. 13.2% of subject-seconds are on NO channel —
// median blackout 2 s, p90 3 s, but with a 33 s tail for somebody parked in the
// lee of an end-cap gondola. The honest thing is a row that says the track is
// lost. Filing him under a channel whose picture he is not in for thirty-three
// seconds is the exact bug this round is about, only slower.
//
// Held at 8 s, not the 4 s I started with. At 4 s a FLAGGED subject had no row
// at all for 8.3% of his announced life, and a case the terminal drops is a case
// the player cannot act on for reasons he cannot see. A row that says SIGNAL
// LOST — LAST SEEN 6.1s is not the bug this round is about: it is not claiming
// he is in the picture, it is saying out loud that he is not.
const LOST_HOLD = 8.0;
// Where the cop is standing while he is supposed to be watching the wall: behind
// the service counter, far enough back that walk-by traffic is not "contact".
const POST = { x: Math.min(STORE.maxX - 0.9, SERVICE_DESK.x + 3.2), z: STORE.minZ + 0.7 };

// --- ROUND 2: the desk phase was unwinnable, and this is why -----------------
// Dispatch used to demand an aisle number. A drifting thief leaves his aisle the
// moment he steps onto the front cross-aisle, and the last ~20m of his walk to
// Door 1 happens out there. So the tell fired, you read it correctly, and then
// the DISPATCH button greyed out and the game gave you nothing to press while he
// strolled out. That dead zone, not the length of the window, was the problem.
//
// A "post" is now wherever the subject actually is, and the post determines the
// odds by geometry alone: the aisle mouth puts you between him and the door, the
// front end makes you chase a man who is already most of the way there. Acting
// early is rewarded because the map rewards it, not because the UI locks.
const HALF_FRONT = -HALF - 0.35, HALF_BACK = HALF + 0.35;
function postOf(x, z) {
  if (z > HALF_FRONT && z < HALF_BACK) return { kind: 'aisle', i: aisleIdx(x) };
  if (z <= HALF_FRONT) return { kind: 'front', i: aisleIdx(x) };
  return { kind: 'back', i: aisleIdx(x) };
}
function postLabel(p) {
  if (!p) return null;
  if (p.kind === 'aisle') return `AISLE ${p.i + 1}`;
  return p.kind === 'front' ? 'FRONT END' : 'BACK WALL';
}
// Where the cop physically enters that zone from. He is behind the service
// counter; the walk is implied, the arrival point is not negotiable.
function postSpawn(p) {
  if (p.kind === 'aisle') return { x: aisleX(p.i), z: -HALF + 3.0 };
  if (p.kind === 'back') return { x: aisleX(p.i), z: HALF - 3.0 };
  // Out of the service desk onto the front walk — the far end from Door 1.
  return { x: Math.max(STORE.minX + 2, SERVICE_DESK.x - 3.0), z: FRONT_WALK_Z };
}

// "PRICE CHECK, AISLE FOUR." The only authority this man has is the PA, and all
// it buys him is somebody standing still for a few seconds. It reads identically
// on a thief and on a shopper — it must, or it would be a guilt oracle and the
// whole trap/tell ambiguity would collapse into a button you press to cheat.
// ROUND 7 — AND NOW IT IS YOUR ACTUAL VOICE.
// Client: "Can we make it so that maybe I can actually go over the PA system?
// Somebody can hit and hold down a button and then speak... you say it and then
// you hear your voice in the game. I just think it sounds funny as shit."
//
// Correct instinct, and the important part of building it is what it is NOT: it
// is not a second mechanic. [F] already opens the PA and already stalls a
// subject for nine seconds, and it already reads identically on a thief and on
// a shopper, which is the property the whole trap/tell ambiguity rests on. The
// microphone is a SKIN ON THAT, not a new verb. Tap it and you get exactly the
// game that shipped; hold it and the same announcement goes out in your voice.
//
// `talkMax` is why a rambling price check is worth making: the nine seconds
// starts counting when you STOP talking, so the subject stands there for as
// long as you are on the air plus the usual nine. Capped, because a player who
// discovers he can hold a man in place by reading the phone book at him has
// found a bug rather than a joke.
//
// ---- ROUND 8: THE COOLDOWN THAT MADE THE WHOLE FEATURE LOOK BROKEN --------
// Client: "The voice thing doesn't work. It looks like it's recording, but it
// doesn't do anything." FOUR mechanisms across three files produced that one
// sentence. Two were audio's (echoCancellation subtracting the player's own
// voice off the ceiling; the voice arriving at parity with the store bed, so
// opening the channel took the mix 4.3 dBA DOWN). The other two are mine, and
// mine are the ones that make it look DEAD rather than merely quiet:
//
//   1. `cool` was charged TWICE per use. callHold() set 21 s on the keydown and
//      talkClose() set another 21 s on the release, so a nine-second stall was
//      followed by ~12 s in which [F] did nothing at all — no click, no
//      channel, no readout change — while audio's talk.js still held the
//      capture device for HOLD_MS = 20 s and the tab's recording dot stayed
//      lit. That window is a literal description of the client's sentence.
//   2. The microphone was gated on the ANNOUNCEMENT'S recharge. It should
//      never have been: the announcement is a resource (it pins a man where he
//      stands, and that has to be rationed) and the microphone is a SKIN on the
//      handset. Talking into a PA costs the store nothing.
//
// So they are two clocks now and only one of them is a cooldown. See micReady()
// and annReady(). `cool` is charged ONCE, on the keydown, which is also what
// makes the number legible: the stall is 9 s and the recharge is 12, so the
// button reads HOLDING for nine seconds and then counts 3, 2, 1. Three seconds
// of dead key instead of twelve, and it is a dead key the player watched arrive.
//
// A ramble now costs nothing extra, which is the property I wanted and did not
// have: talk the full talkMax and the stall runs to 17 s, by which time the
// 12 s recharge has long since expired, so the handset is free the instant he
// lets the man go. The old code charged him another 21 s for the joke.
//
// Not cut all the way to agents' K.annCool of 6 s, and the reason is that these
// are different mechanics with the same name. Their 6 s gates the round-8
// deterrence line, which rolls a compliance check and can END a case. Mine gates
// a price check that PINS A MAN IN PLACE for nine seconds; at 6 s that is a 60%
// duty cycle and a player who never leaves the desk can park a thief on a shelf
// indefinitely. 12 s puts it at 43% and keeps the sentence honest — one
// announcement every twelve seconds.
//
// MEASURED, both halves.
//
// The symptom, timed off bot.callHold() with the stall and the recharge sampled
// at 10 Hz. The number the audio builder reported from the other side of the
// wall was "roughly twelve seconds", and it is:
//
//                    stall ends   handset back   DEAD KEY
//     cool 21 (r7)      9.0 s        20.9 s       11.9 s
//     cool 12 (r8)      9.0 s        11.9 s        2.9 s
//
// and the microphone's own dead window goes to ZERO in both columns, because
// that half is fixed by micReady() and not by this number at all.
//
// THE BALANCE HALF: 21 s was never load-bearing, and the clean way to see it is
// that the recharge was not the binding constraint on either bench bot.
// ./game/eval.js, 5 shifts x 240 s, seed 7717, cool 21 -> 12:
//
//     observer   32.3% -> 32.1% catch, 0/0 complaints/demotions, AND ZERO HOLDS
//                IN BOTH RUNS — it never keys the PA, so this constant cannot
//                reach it. The identity is exact, not approximate.
//     random     31 -> 30 holds. Halve the recharge and the bot makes the same
//                number of announcements, because its rate is set by its own
//                dispatch cadence and not by the handset. Demotions 7 -> 7.
//
// Its catch rate swung 40.9% -> 25.0% on those unchanged 30 holds, which is the
// noise floor at n=22-24 thieves rather than a result; the hold COUNT is the
// number that would have had to move for this constant to be doing work, and it
// did not move.
const HOLD = { dur: 9.0, cool: 12.0, talkMax: 8.0 };
// Seconds stood on the way out before the store remarks on it. See updateFloor.
const QUIET_AT = 6.0;
// ROUND 11. Announcements in one shift, with nobody written up, before the
// store manager comes over to say something supportive and fails. Nine, and
// the derivation is in the block at update()'s desk branch — it is out of
// reach of both bench bots that touch this button and reachable in about four
// minutes by a man who has decided to work the handset instead of the wall.
const DALE_AT = 9;
// ---- ROUND 7: THE BEAT BEFORE A COMPLAINT ---------------------------------
// Measured, and it is the number that made this round necessary: a competent
// player who occasionally acts on an unexplained red flag — `reader` in
// ./game/eval.js, which does the full scan-switch-read loop and then goes
// anyway on 35% of the channels it cannot explain — takes 4.83 complaints and
// 1.13 DEMOTIONS per four-minute shift. He is fired roughly every three and a
// half minutes for playing well. That is not a difficulty setting, it is the
// game refusing to be played.
//
// The fix is not a bigger allowance, because three strikes is the fiction and
// the fiction is good. It is that WALKING UP TO SOMEONE IS NOT YET AN OFFENCE.
// A guest you have crowded turns round and says something; he decides whether
// to make it a formal complaint based on what you do NEXT. Stand there and he
// files. Get out of his face inside HARASS_GRACE and nothing happened.
//
// This turns the one unrecoverable mistake in the game into a recoverable one,
// and it does it by adding a skill rather than removing a punishment: you have
// to look at the person you walked up to and decide, in about a second and a
// half, whether you were wrong. Which is the entire game the client described,
// happening at the one moment it was previously impossible to play.
const HARASS_GRACE = 1.6;
// How far out of his face counts as out of his face. TUNING.suspicionRadius is
// where agents.js decides you are crowding him; leaving needs to be a real step
// back rather than a jitter across the boundary, so it is that plus a margin.
const HARASS_CLEAR = 1.4;

// Sub-fixes, individually switchable so the bench in ./game/eval.js can attribute
// the change instead of guessing. Ship values are all true.
// ROUND 6 adds two: `chan` swaps the roster's channel oracle back to the old
// zone table, and `pace` restores round 5's thief supply. Both exist so the
// bench can attribute this round's two changes separately instead of reporting
// one number for a round that moved two things.
const FIX = {
  post: true, hold: true, roster: true, harass: true, close: true,
  chan: true, pace: true,
  // ROUND 7. `ramp` drives agents.setDifficulty off the shift clock; false
  // pins it at 1.0, which agents.js documents as round 5's game exactly, so
  // the ablation is a true identity rather than an approximation.
  ramp: true,
  // `grace` is round 7's back-off window. Off = a complaint files the instant
  // you crowd somebody, which is what shipped through round 6.
  grace: true,
  // `once` is round 7's complaint rule: one guest files at most one complaint.
  // Separate from `harass` so the bench can price it against the round-2 gate
  // rather than reporting one number for two rules.
  once: true,
};
const ROWS = 3;                 // roster rows the analytics panel can physically fit
// Seconds a NEW flag blinks on the monitor wall before it settles into a still
// red square. See stampFlag() and hud.js's tile loop. 1.6 s is two flashes at
// the 1.25 Hz the pip already ran at — enough to catch an eye that is looking
// somewhere else, and short enough that with 13 subjects churning through the
// building SOMETHING is moving on the wall 17% of the shift instead of 89%.
const FLAG_BLINK = 1.6;
// ...and how long a row has to have been CLEAR before going red again counts as
// news. This number is the whole difference between a blink that means
// something and a twitch: a trap subject re-rolls his behaviour line every
// 3.2-6.4 s and takes a trap line about half the time, so without a rearm
// window the same man flashes the same monitor every other roll and the wall
// blinks somewhere 45.9% of the time — measured, first cut of this round.
// At 8 s that man stamps once and then holds a still square, and the blink is
// spent on a channel that had nothing on it a moment ago.
const FLAG_REARM = 8.0;

export function createGame(hudEl, deps = {}) {
  const hud = createHUD(hudEl);
  const FALLBACK = fallbackTiles(CAMERAS.length);
  // Prefer the injected references; window.__CHOP is a fallback for consoles and
  // for any bootstrap that still constructs us before it has them.
  const ext = () => (typeof window !== 'undefined' && window.__CHOP) || {};
  const cctvOf = () => deps.cctv || ext().cctv || null;
  const agentsOf = () => deps.agents || ext().agents || null;
  const shoppersOf = () => (agentsOf() ? agentsOf().shoppers : []);
  const audioOf = () => deps.audio || ext().audio || null;

  // cctv.js burns a REC pip, a "CAM 09 FLOOR PATROL" label and a timestamp into
  // the on-foot view. The HUD's top band draws all three, better and on purpose,
  // so the two used to sit on top of each other. One owner: this one.
  //
  // ROUND 6 — AND THERE ARE TWO CLOCKS ON THIS SCREEN NOW. The HUD band printed
  // a shift clock forty-three minutes fast off a fixed 08/22/26 date; cctv's
  // spot-monitor OSD prints new Date(). shots/game_r6_before.png has them
  // 20 hours and 26 minutes apart on one desk, which is the same species of
  // mistake as the roster naming a channel the picture disagrees with. The HUD
  // is now the one that moved — see dvrClock() in ./game/hud.js, which reads
  // wall time so the two stamps are identical to the second. If cctv ever ships
  // the setClock(fn) it offered, hand it the same function rather than both of
  // us independently deciding to agree.
  {
    const c = cctvOf();
    if (c) {
      c.floorBurnIn = false;
      if (c.setParams) c.setParams('floor', { burnIn: 0 });
      if (c.setClock) c.setClock(() => hud.wallClock(st.clock));
    }
  }

  const st = {
    mode: 'desk', points: 0, complaints: 0, rank: 2, caught: 0, escaped: 0,
    clock: 0, shift: '2ND',
  };

  // ---- ROUND 9: A KEYBOARD LEGEND IS FOR THE FIRST THIRTY SECONDS ---------
  // Measured: the desk key-hint row and the WIND panel's [SHIFT] SPRINT [WASD]
  // MOVE line are both drawn on 100% of frames in their mode, forever, in a
  // game whose entire input is six keys. After the first dispatch the player
  // knows what SPACE does; the row is then just words competing with a roster
  // he is trying to read.
  //
  // So each clause of each legend is deleted the first time its key is
  // actually pressed, and the row disappears when the last clause goes. It is
  // not a timer and not a setting — it erodes exactly as fast as the player
  // learns, which is the only rate that is right for everybody. What does NOT
  // erode is anything that reports STATE: the PA button's four words, the
  // WIND panel's KEY HELD — NO RECOVERY, the stand-down prompt's [Q]. Those
  // are not teaching a key, they are answering "what is happening".
  // ROUND 10 adds `cost`, which is the same idea one step further out: not a
  // key the player has not pressed but a SENTENCE he has not read. See
  // tickCost() — the price of announcing at a flagged row is said in words
  // once and carried by the PA button's colour from then on.
  const taught = { dispatch: 0, roster: 0, pa: 0, track: 0, sprint: 0, post: 0, cost: 0 };

  const recs = new Map();     // shopper.id -> the DVR's opinion of that shopper
  let caseSeq = 112;
  // ---- ROUND 11: THE STORE NUMBERS ITS OWN EVENTS -------------------------
  // One counter, and the point of it is that there is only one. The analytics
  // box files a concealment and it files a man putting his middle finger up at
  // a dome, and it files them four apart on the same sequence, because it has
  // no field for the difference. That is the whole of L.PA_ROW_SHRUG's third
  // rung: the gesture is not funny because somebody made a joke about it, it
  // is funny because a building took a note.
  //
  // It does not reset with the shift. A number that starts at 1 every time you
  // are reinstated would be a game counter; this is a machine that has been in
  // the ceiling since before you were hired.
  let evtSeq = 4470;
  const nextEvt = () => ++evtSeq;
  let rearmT = 8;
  let harassCool = 0;
  let pending = null;         // { id, until, code } — a complaint not yet filed
  let recycle = [];           // shoppers to quietly put back on the floor
  let held = null;            // { id, until } — the one live PA price check
  let holdCool = 0;
  // Who the handset was last pointed at, stamped on the KEYDOWN. Read by
  // onBolt to tell "he ran" from "he ran because of you" without depending on
  // the order agents delivers its two callbacks in.
  let lastAnn = null;         // { id, t }
  // ---- ROUND 11: THE SHIFT'S PA USAGE, WHICH IS A THING DALE M. COUNTS ----
  // Every keying of the handset that actually went out, both verbs, because
  // Dale is not at this terminal and cannot tell a deterrence line from a
  // price check — he is in the deli and he can hear a voice. `daleSaid`
  // makes it once a shift. See the block in update().
  let annKeyed = 0;
  let daleSaid = false;
  // ---- ROUND 10: THE ANNOUNCEMENT RECORD LEFT G.floor ----------------------
  // This was `G.floor.annAt` for two rounds, which was fine while the only
  // place you could make an announcement was the floor. It is the bug in one
  // field now: the desk is where the client asked for the button, `G.floor` is
  // null at the desk, and every line of presentation in onAnnounce hangs off
  // that object — so a desk announcement would have gone out silently, with
  // three outcomes and no readout for any of them.
  //
  // One record, owned by the file rather than by a mode. The floor chip and
  // the desk's roster rows both read it; whichever screen is up renders it.
  let ann = null;   // { code, id, t, heard, out, label, line, sub, boltT, from }
  // THE OPEN CHANNEL. Everything the microphone touches lives in this object and
  // nowhere else, so what this file does and does not do with a live mic is one
  // paragraph rather than a hunt.
  //
  // PRIVACY, AND IT IS A DESIGN CONSTRAINT NOT A DISCLAIMER: this file never
  // sees a sample. It calls talkStart/talkStop and reads a single 0..1 number
  // off talkLevel() for a meter. The capture lives entirely inside audio.js's
  // Web Audio graph on the player's own machine — nothing here records it,
  // stores it, serialises it or sends it anywhere, and there is deliberately no
  // code path in this file that could.
  //
  // NO SPEECH RECOGNITION, ALSO DELIBERATELY. The announcement is the mechanic;
  // the words are the player's own business, and a game that does not
  // understand you is funnier than one that does.
  const talk = {
    down: false,        // is [F] physically held
    live: false,        // is the channel actually open
    since: 0,           // G.now when the channel opened
    held: 0,            // seconds of air on this announcement
    level: 0,           // smoothed talkLevel(), for the meter
    state: 'off',       // mirrors audio.talkState()
    offered: false,     // have we ever asked for the mic
    denied: false,      // ...and were we told no. We do not ask twice.
    told: false,        // have we mentioned the handset exists. Once a session.
  };
  const tel = {
    stamina: TUNING.staminaMax, staminaMax: TUNING.staminaMax,
    boost: 0, gassed: false, speed: 0, nearest: null, chase: null,
    // ROUND 5 wind state machine, straight off agents.js's report(). Defaults
    // so the first frame renders a full tank rather than a NaN.
    wind: 'ready', windIn: 0, fatigue: 0, windFrac: 1,
    burst: TUNING.staminaMax / TUNING.staminaDrain,
    burstMax: TUNING.staminaMax / TUNING.staminaDrain,
    refill: TUNING.staminaMax / TUNING.staminaRegen,
    readyAt: null,        // when the tank last came back — the flash fires here
  };

  // ---- ROUND 3: THERE ARE TWO DOORS -----------------------------------------
  // Everything in this file that said DOOR 1 was a lie about half the time as of
  // this round, and the HUD repeating a lie is worse than the HUD saying nothing.
  //
  // The hard part is not "which door is nearer", it is being HONEST about it.
  // agents.js gives each subject a hidden door preference — people leave by the
  // door they came in by — and a running man will pay `doorBias` metres of extra
  // route to use his. That preference is exactly the thing the two-door design
  // exists to hide: if this panel read `s.doorPref` and printed the answer the
  // instant he bolted, it would hand the player the hidden variable back and
  // re-flatten the chase at the HUD layer. So nothing below ever looks at it.
  //
  // What it reads instead is the margin. Route metres to each door, from where
  // he ACTUALLY IS. If the nearer door is nearer by more than doorBias, no
  // preference he could be holding can send him to the other one — that is a
  // provable statement about the geometry, and the panel locks. Inside the band,
  // both doors are still live and the panel says so, breaking the tie only on
  // which door is measurably closing faster, which is an observation about a man
  // running and not a peek at his file.
  const DOORS_FALLBACK = [{ id: 'door1', label: 'DOOR 1', x: EXIT.x, z: EXIT.z }];
  function exitsOf() {
    const a = agentsOf();
    const e = a && a.exits;
    return (e && e.length) ? e : DOORS_FALLBACK;
  }
  const doorBias = () => { const a = agentsOf(); return (a && a.K && a.K.doorBias) || 7.5; };
  const thiefCruise = () => { const a = agentsOf(); return (a && a.thiefCruise) ? a.thiefCruise() : TUNING.thiefRun; };

  // One flood per door, cached. agents.js exposes the combined field (metres to
  // the NEAREST way out) and exitOf(); neither can answer "how far to the OTHER
  // one", which is the whole question a two-door chase asks. nav is rebuilt when
  // store.js changes the collider set, so key the cache on the nav itself.
  let doorNav = null, doorKey = '', doorF = null;
  function doorFields() {
    const a = agentsOf();
    if (!a || !a.nav) return null;
    const ex = exitsOf();
    const key = ex.map((e) => `${e.x.toFixed(2)},${e.z.toFixed(2)}`).join(';');
    if (doorNav !== a.nav || doorKey !== key || !doorF) {
      try { doorF = ex.map((e) => a.nav.field(e.x, e.z)); doorNav = a.nav; doorKey = key; }
      catch { doorF = null; doorNav = null; doorKey = ''; }
    }
    return doorF;
  }
  // Route metres from (x,z) to every door. Straight lines through six gondolas
  // read short by a third, so this falls back to one only when nav is mid-rebuild.
  function doorDists(x, z) {
    const a = agentsOf(), fs = doorFields();
    const ex = exitsOf();
    if (a && a.nav && fs && fs.length === ex.length) {
      const d = fs.map((f) => a.nav.at(f, x, z));
      if (d.every((v) => isFinite(v))) return d;
    }
    return ex.map((e) => d2(x, z, e.x, e.z));
  }
  // Which door did this man actually leave by / is he standing at. Used for the
  // log lines, where guessing is not required — he is at the thing.
  function doorLabelOf(s) {
    const ex = exitsOf();
    const a = agentsOf();
    if (!s) return ex[0].label;
    // s.exitI is initialised to 0 on every shopper in the building and only
    // becomes true at startShove(), so trusting it early makes every line in the
    // game say DOOR 1 again — which is exactly the bug this round is about.
    const atDoor = s.escaped || s.state === 'shove';
    if (atDoor && s.exitI != null && ex[s.exitI]) return ex[s.exitI].label;
    if (a && a.exitOf) {
      const e = a.exitOf(s.position.x, s.position.z);
      if (e && e.exit) return e.exit.label;
    }
    return ex[0].label;
  }
  const EMA_TAU = 0.40;      // s — smoothing window for "which door is closing"
  function doorRead(s, f, dt) {
    const ex = exitsOf();
    const him = doorDists(s.position.x, s.position.z);
    const cop = G.cop;
    const you = doorDists(cop.x, cop.z);
    let near = 0;
    for (let i = 1; i < him.length; i++) if (him[i] < him[near]) near = i;
    let second = Infinity;
    for (let i = 0; i < him.length; i++) if (i !== near) second = Math.min(second, him[i]);
    // Can his preference still overrule the geometry? That is the whole question.
    const sure = ex.length < 2 || (second - him[near]) > doorBias();

    // Smoothed closure rate, so a lean is "he is running at that one" and not
    // one frame of noise. Rebased whenever the chase changes hands.
    const prev = (f && f.dEma && f.dEma.length === him.length) ? f.dEma : null;
    const ema = prev ? him.map((v, i) => prev[i] + (v - prev[i]) * Math.min(1, dt / EMA_TAU)) : him.slice();
    if (f) f.dEma = ema;
    let pick = near;
    if (!sure && prev) {
      const rate = him.map((v, i) => (ema[i] - v) / EMA_TAU);      // m/s of closure
      let b = 0;
      for (let i = 1; i < rate.length; i++) if (rate[i] > rate[b]) b = i;
      let other = -Infinity;
      for (let i = 0; i < rate.length; i++) if (i !== b) other = Math.max(other, rate[i]);
      if (rate[b] - other > 0.8) pick = b;
    }
    return {
      i: pick, label: ex[pick].label, x: ex[pick].x, z: ex[pick].z,
      dist: him[pick], him, you, sure, near, all: ex,
    };
  }

  const G = {
    st, tel, now: 0, log: [], alarm: null, cams: CAMERAS,
    desk: { cam: 0, sel: null, subjects: [], scroll: 0, rows: 0 },
    get hold() {
      const a = agentsOf();
      return {
        live: held, cool: holdCool, max: HOLD.cool, on: FIX.hold,
        // The microphone half. `can` is "is this worth advertising", and it is
        // false in three cases that are all the same case: the player declined,
        // the browser cannot do it, or audio.js has not shipped the entry point
        // yet. Nagging a man who already said no is the rudest thing a HUD can
        // do, and promising a key that does nothing is the second rudest.
        talk: talk.live, talkLevel: talk.level, talkFor: talk.held,
        talkState: talk.state, can: talkAvailable(),
        // ROUND 8. Everything below is here so the HUD never has to guess what
        // [F] would do if it were pressed right now — which is the whole of the
        // round-8 complaint. `mic` is whether the key opens a channel at all;
        // `ann` is whether an ANNOUNCEMENT would ride out on it, and `annIn` is
        // the seconds until one would. Two clocks, both published, neither
        // inferred from the other.
        mic: micReady(), mode: st.mode,
        // ROUND 10: `ann` used to publish "the price check is armed" here, and
        // the button drew its whole armed state off it. There are two verbs
        // now and the field could only ever describe one of them; the button
        // asks deskReadout() below which verb is up and reports that verb's
        // clock, so this one has nothing left to say.
        // The floor half answers to agents' cooldown, not mine, so the readout
        // and the behaviour cannot drift apart. If they ever disagree the
        // button is lying again and that is the bug this round is about.
        pbReady: !a || a.announceReady !== false,
        pbIn: (a && a.announceIn) || 0,
        pbMax: (a && a.K && a.K.annCool) || 6,
        pbAt: ann,
        // ROUND 10 — THE DESK BUTTON SAYS WHICH OF THE TWO LINES IT WOULD
        // SPEAK, AT WHOM, AND WHAT THAT COSTS. Same rule as round 8's: the HUD
        // never guesses what [F] would do, it is told. See deskAim/deskVerb.
        ...deskReadout(),
      };
    },
    // ROUND 8 — WHERE THE PLAYER IS LOOKING, which is now a thing that can be
    // different from where he is going. camera.js owns 110 degrees of mouse
    // look and main.js steers by `moveYaw`, so the head and the course have come
    // apart on purpose. hud.js already tracks the glance for free — it projects
    // through the LIVE camera — but the player has no way to know HOW FAR off
    // the corridor he is looking, and with a thief invisible ~89% of the time
    // the moment he leaves your aisle, a lost glance is disorienting rather
    // than difficult.
    //
    // Read off the rig rather than duplicated: `lookYaw` is the applied offset
    // in radians, `T.lookMax` the budget it is clamped to. main.js publishes
    // chaseCam on window.__CHOP; deps.camera is preferred if a bootstrap ever
    // passes one. Returns null when there is no camera to ask, and every
    // consumer treats null as "no glance", so a console that builds this file
    // without a camera renders round 7's HUD exactly.
    get look() {
      const c = deps.camera || ext().chaseCam;
      const r = c && c.rig;
      if (!r || typeof r.lookYaw !== 'number') return null;
      const max = (c.T && c.T.lookMax) || (110 * Math.PI / 180);
      return { yaw: r.lookYaw, pitch: r.lookPitch || 0, max };
    },
    floor: null, wu: null, hr: null,
    // Is the round 1 wedge watchdog still earning its keep? agents.js rebuilt
    // its navigation this round and claims the wedge is gone at source.
    // ROUND 7: which branch of targetShopper() let a complaint through. The
    // chase builder measured 7.0 complaints a shift against a three-strike
    // demotion; this says WHICH of my own rules is the leak rather than making
    // me guess at it.
    dbg: { stallEscape: 0, stallPutBack: 0, harass: { chase: 0, dialogue: 0, subj: 0, zone: 0 },
      blocked: 0, reharass: 0, subjects: new Set() },
    get rankName() { return RANKS[clamp(st.rank | 0, 0, RANKS.length - 1)].toUpperCase(); },
    taught,
    get tiles() { const c = cctvOf(); const t = c && c.tiles; return (t && t.length) ? t : FALLBACK; },
    // The big monitor's glass rect, so the HUD can make it clickable. cctv.js
    // draws every pixel of it; this is a hit region and nothing else.
    get spot() { const c = cctvOf(); const p = c && c.spot && c.spot.panel; return p || null; },
    get cop() { const a = agentsOf(); return a ? a.cop.position : { x: 0, z: 0 }; },
  };

  function logLine(text, bad) {
    G.log.unshift({ t: G.now, clock: st.clock, text, bad: !!bad });
    if (G.log.length > 8) G.log.length = 8;
  }

  // ------------------------------------------------------------------ ranks
  function baseRank() {
    let r = 2;
    for (let i = 3; i < RANK_AT.length; i++) if (st.points >= RANK_AT[i]) r = i;
    return r;
  }
  function refreshRank() {
    // Traffic Duty is reserved for the bust. Complaints one and two can only walk
    // you down to Cart Corral, so the third one still means something.
    const floorR = st.complaints >= 3 ? 0 : 1;
    st.rank = clamp(baseRank() - st.complaints, floorR, RANKS.length - 1);
  }
  function rankProgress() {
    const b = baseRank();
    if (b >= RANKS.length - 1) {
      return { frac: 1, label: st.complaints ? `${st.complaints} COMPLAINT(S) HELD AGAINST TITLE` : 'NO FURTHER TITLES EXIST' };
    }
    const lo = RANK_AT[b], hi = RANK_AT[b + 1];
    const held = st.complaints ? ` · −${st.complaints} FOR COMPLAINTS` : '';
    return {
      frac: clamp((st.points - lo) / Math.max(1, hi - lo), 0, 1),
      label: `NEXT: ${RANKS[b + 1].toUpperCase()} @ ${RANK_AT[b + 1]} PTS${held}`,
    };
  }

  // ------------------------------------------------------- subject bookkeeping
  function recOf(s) {
    let r = recs.get(s.id);
    if (!r) {
      r = {
        code: `SUBJ-${String(s.id).padStart(2, '0')}`,
        name: L.name(s.id * 3 + 1),
        trap: Math.random() < 0.30,          // innocent, but the box keeps flagging them
        line: L.pick(L.BEHAVIOUR_BENIGN), lineT: rr(0, 3), flagged: false,
        dwell: (Math.random() * 300) | 0, aisle: null, lastA: -1,
        item: L.ITEMS[(s.id * 5) % L.ITEMS.length], announced: false,
        complained: false,          // he has already filed one. See onHarass.
        // ROUND 10. What he did about the last announcement, and when. Lives on
        // the record rather than on the row because the row is rebuilt every
        // frame from scratch. See stampPA().
        paLine: null, paT: -99,
        // channel state — see camForZone()'s note. cam is null until a monitor
        // has actually seen him; lost is seconds since the last one did.
        cam: null, lost: 0, pend: -1, pendT: 0, lostSaid: false,
        // When this row most recently went red. See the `fresh` field on the
        // roster row: it is what lets the monitor pip blink for a NEW flag and
        // sit still for an old one.
        flagAt: -99, clearAt: -99,
      };
      recs.set(s.id, r);
    }
    return r;
  }
  // FALSE POSITIVES ARE THE OTHER HALF OF THE PACING, AND I NEARLY MISSED IT.
  //
  // Serialising the shift to one live thief made the guesser BETTER: 28.2% catch
  // under round-5 supply, 35.2% under round-6. It is a COVERAGE effect, not a
  // discrimination one — catch rate is over all thieves, and one guard against
  // three simultaneous cases loses two of them without being wrong about
  // anything. Take it down to one case and his single stab in the dark is
  // usually pointed at the only thief in the building. Reading the roster
  // stopped being worth much for CATCHES — separation fell to +3.2pp — even
  // though it stayed worth everything for keeping the job (0 demotions a shift
  // against 1.64, 3.1x the points).
  //
  // That is not a reason to give the client back his firehose. It says the
  // difficulty was never really "how many thieves", it was HOW MANY CANDIDATES,
  // and the round-5 wall got its candidates for free by running three incidents
  // at once. Take the incidents away and the false positives have to carry the
  // discrimination on their own — which is the better game anyway, because a
  // trap is a person behaving oddly and a second thief is just more work.
  //
  // So the trap rate is the inverse of the pace: fewest real incidents, most
  // things that look like one. The player's job stays "tell them apart" at every
  // point in the shift; only the volume changes.
  const TRAP_RATE = [0.50, 0.36, 0.26];
  function trapRate() {
    if (!FIX.pace) return 0.26;
    const i = PACE.indexOf(pace());
    return TRAP_RATE[i < 0 ? TRAP_RATE.length - 1 : i];
  }
  function newLine(s, r) {
    r.__wasFlagged = r.flagged;
    pickLine(s, r);
    stampFlag(r);
  }
  function pickLine(s, r) {
    r.lineT = rr(3.2, 6.4);
    if (s.guilty && s.stole) { r.line = L.pick(L.BEHAVIOUR_GUILTY); r.flagged = true; return; }
    if (s.guilty) { r.line = L.pick(L.BEHAVIOUR_GUILTY_PRE); r.flagged = false; return; }
    if (r.trap && Math.random() < trapRate()) {
      r.line = L.pick(L.BEHAVIOUR_TRAP); r.flagged = true;
      return;
    }
    r.line = L.pick(L.BEHAVIOUR_BENIGN); r.flagged = false;
  }
  // ---- ROUND 9: WHEN DID THIS ROW GO RED ----------------------------------
  // Every exit from newLine() runs through here. The census says 1.8 of the 9
  // monitors carry a red flag pip at any instant of an IDLE shift and at least
  // one is lit 89% of the time — which is the alarm bar's disease in a smaller
  // font. It is also NOT a bug: the trap rate is 0.50 in phase 0 on purpose,
  // because ambiguity is the game and the roster text is where you resolve it.
  //
  // So the pip stays and the BLINKING goes. Motion is the expensive half of a
  // warning light and it is worth spending on exactly one thing, which is a
  // flag that was not there a moment ago. `fresh` is that: three seconds of
  // blink on a NEW flag, then a still red square that says "there is something
  // in here to read" without waving. See hud.js's tile loop.
  function stampFlag(r) {
    if (r.flagged && !r.__wasFlagged) {
      if (G.now - (r.clearAt == null ? -99 : r.clearAt) > FLAG_REARM) r.flagAt = G.now;
    } else if (!r.flagged && r.__wasFlagged) r.clearAt = G.now;
    r.__wasFlagged = undefined;
  }
  // =========================================================================
  // ROUND 9 — THE SOFT ALARM IS GONE. ALL OF IT.
  // =========================================================================
  // Client, on the one element he named: "the flashing red bar that happens at
  // the top, like the suspicious subject in the vestibule or something, is
  // obnoxious and too much."
  //
  // He is describing a measurement I had already taken and not acted on. Round
  // 7 recorded the bar lit ~52% of an idle shift; this round's census (a real
  // frame drawn at 10 Hz through the whole shift — see hud.sample) puts it at
  // 40.5% of an idle shift, of which 27.3pp is SOFT: a rotating MOTION ANOMALY
  // banner raised by trap flags on a 24 s cooldown, plus a merchandise-loss
  // notice. A warning that is on two-fifths of a shift in which NOTHING
  // HAPPENS is not a warning. It is wallpaper that shouts.
  //
  // The 24 s cooldown was the tell that this thing should not exist. I sized it
  // by arithmetic — 5.5 s of banner over N seconds caps the duty cycle at 5.5/N
  // — which is what you do to an element you have already decided to keep. An
  // element that has to be rationed to stay tolerable is an element that is not
  // carrying its own weight.
  //
  // AND IT WAS NEVER THE ONLY CHANNEL. Everything the soft bar said was already
  // said, better, by something attached to the man it was about:
  //   the concealment tell   red flag pip on his monitor, red roster row, AND a
  //                          ticker line. The bar was the fourth telling.
  //   a trap flagging        the pip and the row, which is the whole point of a
  //                          trap: you have to READ it, not be shouted at.
  //   merchandise loss       a ticker line, which is where a thing that has
  //                          already finished happening belongs.
  // What survives is the vestibule countdown, which is the only alarm in this
  // game with a deadline on it — and it survives as a chip in the status band
  // rather than a full-width flashing red bar. See updateAlarm().

  // Which monitor is this man ACTUALLY on. Ask the wall; keep the answer stable.
  // Falls all the way back to the zone table only when there is no cctv to ask.
  function channelFor(s, r, dt) {
    const c = cctvOf();
    const x = s.position.x, z = s.position.z;
    if (!FIX.chan || !c || !c.channelsFor) {
      r.cam = camForZone(x, z); r.lost = 0; r.pend = -1; return;
    }
    const seen = c.channelsFor(x, z, 1.7);
    r.chans = seen;
    if (!seen.length) {                       // in a blind spot, or behind glass
      r.lost += dt; r.pend = -1;
      if (r.cam == null) r.cam = camForZone(x, z);
      return;
    }
    r.lost = 0; r.lostSaid = false;
    if (r.cam == null || !seen.includes(r.cam)) {
      r.cam = seen[0]; r.pend = -1; r.pendT = 0; return;
    }
    const best = seen[0];
    if (best === r.cam || camDist(best, x, z) > camDist(r.cam, x, z) - CHAN_MARGIN) {
      r.pend = -1; r.pendT = 0; return;
    }
    if (r.pend !== best) { r.pend = best; r.pendT = 0; }
    r.pendT += dt;
    if (r.pendT >= CHAN_DWELL) { r.cam = best; r.pend = -1; r.pendT = 0; }
  }

  function updateSubjects(dt) {
    const out = [];
    const marks = [];
    const a2 = agentsOf();
    for (const s of shoppersOf()) {
      if (s.escaped || s.caught || !s.mesh.visible) continue;
      const r = recOf(s);
      const a = inAisle(s.position.z) ? aisleIdx(s.position.x) : null;
      if (a !== r.lastA) { r.lastA = a; r.dwell = 0; } else r.dwell += dt;
      r.aisle = a;
      channelFor(s, r, dt);
      // Everything below this line is what a MOTION DETECTOR reported, so none
      // of it may happen while no detector can see him. The behaviour line
      // freezes and the concealment tell waits for him to walk back into a
      // frustum.
      //
      // I expected that to be the expensive part of this round and measured it
      // before defending it: across a five-minute shift the tell was delayed by
      // ZERO seconds, every time (n=5, median 0, max 0). Thieves conceal in the
      // middle of an aisle, which is precisely where the aisle domes are
      // pointed, so the case where the DVR misses the moment barely arises. The
      // blind spots are real — they are just not where people steal.
      const blind = r.lost > 0;
      if (!blind) r.lineT -= dt;
      const wantGuilty = s.guilty && s.stole;
      if (wantGuilty && !r.announced && !blind) {   // the concealment tell arrives
        r.announced = true; newLine(s, r);
        // ROUND 11: numbered off the same sequence a gesture at a camera gets.
        // See nextEvt() — the joke at the top of the ladder only works if the
        // player has already watched this counter tick on a real event.
        logLine(`${CAMERAS[r.cam].id} — ANALYTICS EVENT ${nextEvt()} LOGGED`);
      } else if (!blind && r.lineT <= 0) newLine(s, r);
      // He is always a subject as far as the picture-to-row cross-reference is
      // concerned — cctv renames its blob T19 to SUBJ-19 off this list, and a
      // blob it can see is by definition not in a blind spot.
      marks.push({ code: r.code, x: s.position.x, z: s.position.z, flagged: r.flagged });
      if (r.lost > LOST_HOLD) {
        if (r.flagged && !r.lostSaid) { r.lostSaid = true; logLine(`${r.code} — TRACK LOST`, true); }
        continue;                              // off every monitor: off the list
      }
      const post = FIX.post ? postOf(s.position.x, s.position.z)
        : (r.aisle == null ? null : { kind: 'aisle', i: r.aisle });
      // ROUND 9 — THE HEAD START, ON THE ROW, INSTEAD OF ON A BAR.
      // A man who is RUNNING is not a behaviour line; the analytics text
      // freezes into irrelevance the moment he breaks, and the thing the
      // player needs instead is how much of his run is left. That is exactly
      // what the alarm bar used to carry, so it moves here — onto the man it
      // is about, on the channel he is on.
      //
      // 'bolt' and 'react' ONLY. `drift` is a thief who has concealed and is
      // walking out, and that is the hidden state the whole desk phase is
      // about reading — publishing it here would be a guilt oracle. A running
      // man is not hidden from anybody: agents.js has him at a sprint in the
      // middle of the picture.
      const running = s.state === 'bolt' || s.state === 'react';
      const toDoor = running && a2 && a2.exitDistOf ? a2.exitDistOf(s) : null;
      // ROUND 10 — WHAT HE DID ABOUT THE PA, on his own row, for a few seconds.
      // Expires here rather than in the drawing code so the census and the
      // screen cannot disagree, and it is dropped the moment the wall loses
      // him: everything in that column is something a motion detector
      // reported, and a detector that cannot see him is not reporting a
      // reaction. The same three lines go on the man who was aimed at and on
      // everybody who merely heard it — see L.PA_ROW_WAIT.
      if (r.paLine && (blind || G.now - r.paT > PA_ROW_HOLD)) r.paLine = null;
      const row = {
        id: s.id, cam: r.cam, aisle: r.aisle, code: r.code,
        line: r.line, pa: r.paLine || null,
        dwell: r.dwell | 0, flagged: r.flagged, lost: r.lost,
        running, toDoor: isFinite(toDoor) ? toDoor : null,
        fresh: r.flagged && G.now - r.flagAt < FLAG_BLINK,
        post, where: postLabel(post), held: held != null && held.id === s.id,
        // How many monitors have him. Two channels on one man is a real thing
        // and it is worth saying, because it is the player's cheapest second
        // angle on somebody he cannot read.
        chans: (r.chans && r.chans.length) || 0,
        primary: true,
      };
      // ONE ROW PER MONITOR HE IS ON, not one row per man.
      //
      // The first cut of this filed each subject under his NEAREST channel, and
      // it reintroduced the bug from the other end: press [C], the dome locks on
      // to a man plainly boxed in the middle of CAM 02, and the CAM 02 roster
      // does not contain him — because CAM 03 happened to be two metres nearer.
      // A list titled MOTION ANALYTICS — CAM 02 has exactly one correct
      // definition, which is everything CAM 02 can see, and that is a set, not a
      // choice. Duplication across channels is not a defect in the list; it is a
      // man standing where two cameras overlap. cctv's own boxes come off the
      // same visibility test, so the rows and the rectangles now agree by
      // construction and not by coincidence.
      //
      // `primary` is the one channel out of those that is worth SWITCHING to:
      // the nearest, which is where he is biggest and where the PTZ has the most
      // to push into. The roster is a set — who can this camera see — but the
      // red flag pip on the bank is a POINTER, and a pointer that names six
      // monitors at once names none. Measured on the round-6 capture: four
      // flagged subjects were lighting six of the nine tiles.
      if (!FIX.chan || !r.chans || !r.chans.length) out.push(row);
      else for (const ch of r.chans) out.push(ch === r.cam ? row : { ...row, cam: ch, primary: false });
    }
    // ONE CALL A FRAME, and the whole point of it: the box on the spot monitor
    // said T19 while the roster said SUBJ-03/04/10, so the two halves of the
    // desk could not be cross-referenced at all. Now the box says SUBJ-19.
    { const c = cctvOf(); if (c && c.setSubjects) c.setSubjects(marks); }

    // THE LAST HOLE, AND IT IS THE ONE THE PLAYER CAN SEE.
    //
    // channelsFor() rejects a point outside 0.94 of normalised frame; cctv's own
    // box test keeps anything whose head OR feet land inside 1.0. That sliver at
    // the very edge of a wide feed is 1 subject-channel pair in 18, and I would
    // leave it alone — except that [C] makes the PTZ lock STICKY, so a man the
    // dome is following out of frame can end up boxed in the picture with no row
    // under it. Measured 0 in 51 samples under auto-track; reproduced on the
    // first try by pressing [C] and waiting.
    //
    // So the wall gets the last word about its own picture. If cctv says it is
    // tracking somebody on the channel that is up, he is on that channel's list,
    // full stop. This is not a second visibility test — it is deferring to the
    // only one that renders.
    if (FIX.chan) {
      const code = trackedCode();
      if (code && !out.some((s) => s.cam === G.desk.cam && s.code === code)) {
        const him = out.find((s) => s.code === code);
        if (him) out.push({ ...him, cam: G.desk.cam });
      }
    }
    out.sort((a, b) => (b.flagged - a.flagged) || (a.id - b.id));
    G.desk.subjects = out;
    if (G.desk.sel != null && !out.some((s) => s.id === G.desk.sel && s.cam === G.desk.cam)) {
      G.desk.sel = null;
    }
    const onCam = out.filter((s) => s.cam === G.desk.cam).length;
    G.desk.rows = onCam;
    G.desk.scroll = clamp(G.desk.scroll, 0, Math.max(0, onCam - ROWS));
  }

  // ------------------------------------------------------------------- the PA
  function shopperById(id) { return shoppersOf().find((s) => s.id === id) || null; }
  function releaseHold() {
    if (!held) return;
    const s = shopperById(held.id);
    if (s && !s.caught && !s.escaped && s.state === 'browse') {
      if (s.stole) { s.state = 'drift'; s.path = []; s.aim = null; s.aimT = 0; }
      else { s.state = 'walk'; s.timer = rr(1, 3); s.path = []; s.target = null; }
    }
    held = null;
  }
  // ---- TWO CLOCKS, AND ONLY ONE OF THEM IS A COOLDOWN ----------------------
  // Round 7 had one predicate called paReady() and used it for both halves of
  // the handset. That is the round-8 bug in one line: it made the MICROPHONE
  // unavailable for twelve seconds after every ANNOUNCEMENT, with no readout
  // saying so, which is exactly "it looks like it's recording but it doesn't do
  // anything". They are different questions and they get different answers.
  //
  // annReady() — can I make an ANNOUNCEMENT. That is a resource: it pins a man
  // where he stands, so it recharges, and it is a desk action because reading a
  // roster row is what tells you what to announce. See the floor's own verb in
  // announce(), which is agents' deterrence line and answers to THEIR cooldown.
  function annReady() {
    return !!FIX.hold && st.mode === 'desk' && holdCool <= 0 && !held;
  }
  // micReady() — can I TALK. A PA is a microphone. There is no resource here to
  // spend and never was: no cooldown, no selection required, and it works on
  // the floor, because a man who has walked out onto the floor and spotted
  // something is exactly the man who has something to say. Being able to talk
  // into it with nobody highlighted is both correct and funnier.
  //
  // The one thing it will not do is open during a write-up or a demotion, where
  // there is no store to talk to and the HUD is a form.
  function micReady() {
    return st.mode === 'desk' || st.mode === 'floor';
  }
  function callHold() {
    if (!annReady()) return false;
    const sel = G.desk.subjects.find((s) => s.id === G.desk.sel);
    const s = sel && shopperById(sel.id);
    if (!s || s.caught || s.escaped || s.bolted || s.state === 'react') return false;
    s.state = 'browse'; s.timer = HOLD.dur + 2; s.path = []; s.target = null;
    held = { id: s.id, until: G.now + HOLD.dur };
    holdCool = HOLD.cool;
    lastAnn = { id: s.id, t: G.now };
    annKeyed++;
    const r = recOf(s);
    logLine(`PA — PRICE CHECK, ${(r.aisle == null ? 'FRONT END' : `AISLE ${r.aisle + 1}`)}`);
    return true;
  }

  // =========================================================================
  // ROUND 8 — "HEY, PUT THAT BACK."
  // =========================================================================
  // Client: "If I see them doing something suspicious, I can go, 'Hey, put that
  // back,' and then they look around, like, 'What the fuck?' ... But if it's a
  // criminal doing it, they might reconsider, they might put it back, and then
  // just leave the store peacefully."
  //
  // The behaviour is entirely agents.js's — announceAt() ends in the same
  // abortTheft()/dumpGoods() a posted guard drives, so a deterred thief is
  // worth zero on exactly the same path and there is no new economics here. My
  // half is three things: which man it goes to, what the HUD says about it, and
  // what it costs.
  //
  // WHY IT IS THE SAME KEY, AND WHY THE MODE PICKS THE LINE. There is one
  // handset in this game and it has one button. What you SAY into it is decided
  // by where you are standing, because that is what you know:
  //
  //   at the desk   you have a roster row and a channel and no eyes on him, so
  //                 the thing you can honestly say is a price check. callHold()
  //                 is unchanged, measured and neutral, and it stays that way.
  //   on the floor  you are in the aisle with him. You can see what his hands
  //                 are doing. THAT is the man you can tell to put it back.
  //
  // AND IT IS THE SAFE ALTERNATIVE TO WALKING UP TO SOMEBODY, which is the
  // whole reason it earns a place next to round 7's HARASS_GRACE. Nothing on
  // this path can reach onHarass — agents says so and it is true by
  // construction, because the announcement never closes the distance. A player
  // who is 60% sure now has something to do about it other than crowd a guest
  // and hope. What it costs when he is wrong is not a complaint, it is the
  // thing an innocent does next: agents cuts his remaining shop, so he is at
  // the door sooner and the shift has one fewer subject to arm.
  //
  // THE ANTI-ORACLE RULE, AND I NEARLY BROKE IT IN THIS FILE. Both populations
  // produce both visible outcomes on purpose, and a PA is a loudspeaker rather
  // than a laser, so every body inside annSpill looks up too. That guarantee
  // lives in agents.js and it is trivially undone at the HUD layer — see
  // onAnnounce and onAbort below for the one place it nearly was.
  function announceSubject() {
    if (st.mode !== 'floor' || !G.floor) return null;
    // Whatever the brackets are on. On the floor there is no spot monitor, and
    // the reticle is the lock: it is the one subject the game has already
    // committed to pointing at, and aiming the PA anywhere else would mean the
    // player shouting at somebody the HUD is not drawing.
    const s = targetShopper();
    if (!s || s.caught || s.escaped || !s.mesh.visible) return null;
    if (s.bolted || s.state === 'react' || s.state === 'shove') return null;
    return s;
  }
  function announce() {
    const a = agentsOf();
    if (!a || typeof a.announceAt !== 'function') return false;   // pre-round-8 agents
    const s = announceSubject();
    if (!s) return false;
    const res = a.announceAt(s, 'putback');
    if (!res || !res.ok) return false;
    lastAnn = { id: s.id, t: G.now };
    annKeyed++;
    const r = recOf(s);
    const f = G.floor;
    // WHAT THE TICKER SAYS NOW, AND WHAT IT DOES NOT SAY. It records that an
    // announcement went out and who it was aimed at. It does not say what he
    // did, because he has not done it yet — agents rolls the reaction 0.35-0.95 s
    // later precisely so that no HUD line can get ahead of the picture. See
    // onAnnounce.
    logLine(L.fillA(L.fillS(L.pick(L.PA_PUTBACK), r.code), paPlace(s)));
    if (f) {
      // The chip on the floor HUD holds the aim for a beat so the player can see
      // WHO it went to, and `heard` is the honest footnote: a loudspeaker is not
      // a laser and three other people in that aisle just looked up too. Saying
      // so out loud is what stops "somebody looked around" being worth anything.
      // Copy is composed here, not in hud.js — that file owns pixels and this
      // one owns words, same as f.backLine and f.clearLine.
      openAnn(s, r, res, 'floor');
    }
    // ...and his roster row says so too, so `r.paLine` means the same thing
    // wherever the key was pressed. Nothing renders it from out here; it is
    // there for the player who shouts and then hits [Q].
    stampPA(r, L.PA_ROW_WAIT[paRung(s)]);
    return true;
  }

  // =========================================================================
  // ROUND 10 — "IF HE'S VIEWING A CAMERA AND HE SAYS 'HEY, EXCUSE ME'"
  // =========================================================================
  // Round 8 read the second half of the client's sentence and put the
  // deterrence line on the FLOOR, at the reticle. The first half of the same
  // sentence says where he is standing when he says it, and it is the desk.
  //
  // That is not a preference, it is the only screen the mechanic is alive on.
  // The chase builder gated the bolt on geometry rather than on a mode — it
  // returns zero unless the subject beats the cop to a door — so:
  //
  //     cop at the service desk, 40 m            29.2% bolt
  //     cop 8 m behind him                       22.5%
  //     cop at the mouth of his aisle             0.0%   <- where dispatch puts you
  //     cop standing on the door                  0.0%
  //
  // The floor button lives at the two zeroes. "The thief is like 'oh shit', and
  // gets scared and starts running" could not happen at all on the screen the
  // key was on. The floor version stays — shouting at a man you are walking up
  // to is a legitimate thing to do and it is where the whole put-it-back half
  // of the mechanic pays — but the desk is where it was asked for and where the
  // third outcome exists.
  //
  // WHO IT GOES TO. The highlighted roster row — which IS the spot monitor's
  // PTZ lock in normal play, and that is the point rather than a coincidence:
  // round 6 spent a round making the two halves of this desk name the same man
  // (selectTracked drags the highlight onto the dome's pick, selectCam prefers
  // it, [C] and a click on the glass both step it, and setSubjects hands cctv
  // the same subject codes the roster prints, so the box in the big picture
  // says SUBJ-19 and so does the row). The man is boxed on 676x380 of glass
  // with his code beside him, which is what makes "he's viewing a camera and he
  // says hey, excuse me" a thing the player can actually aim.
  //
  // AIMING AT THE LOCK DIRECTLY WAS THE FIRST CUT AND IT WAS WRONG. In the one
  // case where the two disagree — the player has arrowed off the dome's pick
  // onto another row — it put DISPATCH on one man and the PA on a different
  // one, side by side, two buttons pointing at two people. That is the round-6
  // bug rebuilt in a new place. The lock is the fallback for the case where
  // nothing is highlighted at all, which is also what keeps this path
  // reachable from ./game/eval.js: that bench never renders a wall, so it never
  // has a lock, and every announcement it makes goes to the row it selected.
  function deskAim() {
    if (st.mode !== 'desk') return null;
    const rows = G.desk.subjects;
    const code = trackedCode();
    const row = rows.find((s) => s.id === G.desk.sel)
      || (code && rows.find((s) => s.code === code));
    if (!row) return null;
    const s = shopperById(row.id);
    if (!s || s.caught || s.escaped || !s.mesh.visible) return null;
    if (s.bolted || s.state === 'react' || s.state === 'shove') return null;
    return { s, row };
  }
  // ...AND WHICH OF THE TWO LINES HE GETS. Round 8 wrote the rule and got the
  // premise wrong, not the rule:
  //
  //   at the desk   you have a roster row and a channel and NO EYES ON HIM, so
  //                 the thing you can honestly say is a price check.
  //
  // The eyes arrived. cctv rebuilt this desk around a spot monitor you can
  // watch a man's hands on, so the premise held for exactly as long as the
  // desk was a wall of thumbnails. What survives is the sentence under it —
  // what you say is decided by what you can see — and the terminal already
  // publishes that per row, in words, on 13.2% of subject-seconds:
  // SIGNAL LOST. A man no camera has is a man you can only page an aisle
  // about. A man in a picture is a man you can tell to put it back.
  //
  // So the price check is not retired and not weakened; it has stopped being
  // the only thing the desk could say and become the thing you say when the
  // wall has lost him. bot.callHold() is still the price check verb directly,
  // so every round-9 bench number that went through it still measures what it
  // measured.
  function deskVerb() {
    const aim = deskAim();
    if (!aim) return null;
    return (aim.row.lost > 0) ? 'hold' : 'putback';
  }
  // What [F] would do if you pressed it right now, in words, for the button.
  // Round 8's rule and it still stands: the HUD is TOLD what the key would do,
  // it never re-derives it, and the copy is composed here because this file
  // owns words and hud.js owns pixels.
  const PA_OFF = { annAim: null, annVerb: null, annLabel: null, annCost: null, annArmed: false };
  function deskReadout() {
    if (st.mode !== 'desk') return PA_OFF;
    const aim = deskAim();
    if (!aim) return PA_OFF;
    const verb = aim.row.lost > 0 ? 'hold' : 'putback';
    const a = agentsOf();
    return {
      annAim: aim.row.code, annVerb: verb,
      // TWO VERBS, TWO CLOCKS, AND EACH ONE REPORTS ITS OWN. The deterrence
      // line answers to agents' annCool, same as the floor's does, so the
      // readout and the behaviour cannot drift apart. The price check answers
      // to mine. Round 8's whole bug was one predicate serving both.
      annArmed: verb === 'putback' ? (!a || a.announceReady !== false) : annReady(),
      annLabel: verb === 'putback' ? L.fillS(L.PA_BTN_WARN, aim.row.code) : L.PA_BTN_HOLD,
      // The STATE half of the price: the man this key is pointed at is a man
      // DISPATCH is armed on. Carried by the button's own weight rather than by
      // a sentence — it is true 59% of a competent player's desk time, and a
      // sentence that is true 59% of the time is furniture. See tickCost().
      annHot: verb === 'putback' && !!aim.row.flagged,
      // ...and the TEACHING half, which is said once and then never again.
      annCost: G.now - costAt < COST_SHOW ? L.PA_COST : null,
    };
  }
  // ---- THE PRICE IS A LESSON, NOT A LABEL ---------------------------------
  // First cut of this printed the cost line on every frame the handset was
  // pointed at a flagged row. That predicate is honest and it was the wrong
  // element: censused at 63.1% OF DESK FRAMES on the observer bench, 8 shifts
  // x 240 s — more than the key legend it draws over, and comfortably the
  // loudest permanent thing left on this desk. Round 9's whole result was
  // deleting things that were on 97.5% of idle frames. Adding one back at 63%
  // because the sentence happens to be true would be the alarm bar again in a
  // smaller font, and I would have spent the round undoing the last one.
  //
  // Second cut said it once per LANDING — stamp it when the aim arrives on a
  // flagged row, hold 2.6 s, drop it. Measured 59-62%, i.e. no change at all,
  // and the reason is worth writing down because it is not obvious: the aim
  // does not sit still. updateSubjects clears G.desk.sel on any frame the
  // selected man is not on the channel that is up, the auto-pick puts it back
  // the next frame, and a bot working the wall re-lands on a flagged row
  // several times a second. "Landing" was not the event I thought it was.
  //
  // So the line is split from the state, which is what round 9 says to do with
  // anything that is true most of the time:
  //
  //   THE STATE   the man you are pointed at is a man DISPATCH is armed on.
  //               Carried by the BUTTON'S OWN WEIGHT — `annHot` above paints
  //               the armed word in the recharge's warm grey-amber instead of
  //               full amber, so the loud control next to it is the one worth
  //               pressing. No new ink at any duty cycle.
  //   THE LESSON  what that weight MEANS, in words, exactly once — the first
  //               time the handset is ever pointed at a flagged row. Same
  //               reasoning as `taught`: a legend is for the first thirty
  //               seconds, and a player who has read this sentence once does
  //               not need it again, because from then on the colour says it.
  const COST_SHOW = 2.6;
  let costAt = -99;
  function tickCost() {
    if (st.mode !== 'desk' || taught.cost) return;
    const aim = deskAim();
    if (!aim || !aim.row.flagged || aim.row.lost > 0) return;
    if (costAt < 0) costAt = G.now;
    if (G.now - costAt >= COST_SHOW) taught.cost = 1;
  }
  // ONE HANDSET, ONE BUTTON, and the mouse and the key must not be able to
  // disagree about what it does. Both go through here.
  function deskPA() {
    return deskVerb() === 'putback' ? announceDesk() : callHold();
  }
  function announceDesk() {
    const a = agentsOf();
    if (!a || typeof a.announceAt !== 'function') return false;   // pre-round-8 agents
    const aim = deskAim();
    if (!aim) return false;
    const res = a.announceAt(aim.s, 'putback');
    if (!res || !res.ok) return false;
    lastAnn = { id: aim.s.id, t: G.now };
    annKeyed++;
    const r = recOf(aim.s);
    logLine(L.fillA(L.fillS(L.pick(L.PA_PUTBACK), r.code), paPlace(aim.s)));
    openAnn(aim.s, r, res, 'desk');
    // His row says so on the next frame — see stampPA. The wait state is not a
    // gap to be filled: agents rolls the reaction 0.35-0.95 s later precisely
    // so nothing in this file can get ahead of the picture.
    stampPA(r, L.PA_ROW_WAIT[paRung(aim.s)]);
    return true;
  }
  // The one announcement record, and it is not owned by a mode. Was
  // G.floor.annAt; see the note on `ann`.
  function openAnn(s, r, res, from) {
    const heard = res.heard | 0;
    ann = {
      code: r.code, id: s.id, t: G.now, heard, out: null, from,
      label: L.fillS(L.PA_CHIP_AIM, r.code),
      line: L.PA_CHIP_WAIT,
      sub: heard ? L.fillN(L.PA_CHIP_HEARD, heard) : L.PA_CHIP_ALONE,
    };
  }
  // THE DESK'S READOUT IS THE ROSTER ROW, and it costs no pixels: an
  // announcement REPLACES the behaviour line on the row of everybody it
  // reached, for PA_ROW_HOLD seconds, and then the row is a row again. The
  // floor needed a chip because the floor has no list; the desk has a list of
  // sentences about what bodies are doing, and "he just put something back" is
  // one of those sentences.
  const PA_ROW_HOLD = 3.2;
  function stampPA(r, line) { r.paLine = line; r.paT = G.now; }
  // =========================================================================
  // ROUND 11 — HOW MANY TIMES HAS THIS STORE SHOUTED AT THIS MAN
  // =========================================================================
  // `s.annN` is agents.js's per-body count and it is the only input the whole
  // escalation ladder has. Clamped to the three rungs there is copy for — a
  // fourth shout prints the third rung again, which is correct, because there
  // is nothing above the finger and a store that escalated past it would be
  // narrating a different game.
  //
  // GUILT-BLIND BY CONSTRUCTION, and it is worth being precise about why,
  // because this is the field a future round will be tempted to branch on.
  // announceAt() increments annN on the man you aimed at AND on every body
  // inside annSpill — so the number counts LOUDSPEAKER EVENTS THAT REACHED A
  // BODY, not accusations, not suspicion, and not anything either population
  // does differently. An innocent parked at a shelf climbs it faster than a
  // thief does, because the thief keeps walking out of earshot. Nothing in
  // this file may ever combine it with s.guilty.
  const paRung = (s) => clamp(((s && s.annN) || 1) - 1, 0, 2);
  // The three roster pools are indexed the same way and the gesture rung is
  // the only one that takes a number. Composed here rather than in hud.js for
  // the usual reason: that file owns pixels, this one owns words.
  const rowLine = (pool, rung) => (rung === 2 && /%N/.test(pool[2]))
    ? L.fillN(pool[rung], nextEvt()) : pool[rung];
  // WHERE the announcement went, in the store's own vocabulary. A courtesy
  // announcement is addressed to an aisle, because a loudspeaker cannot be
  // addressed to a person — see L.PA_PUTBACK. postLabel() already turns a
  // position into AISLE 4 / FRONT END / BACK WALL for dispatch, and using the
  // same function means the ticker and the DISPATCH button cannot disagree
  // about where a man is standing.
  const paPlace = (s) => postLabel(postOf(s.position.x, s.position.z));
  // ---- hold to talk --------------------------------------------------------
  // Fire and forget: talkStart() is a Promise and a keydown handler is not the
  // place to wait on a permission prompt. If the player is still deciding when
  // he lets go, talkStop() below closes a channel that never opened, which
  // audio.js is expected to treat as a no-op.
  function talkAvailable() {
    const a = audioOf();
    if (!a || typeof a.talkStart !== 'function') return false;
    if (talk.denied) return false;
    // audio.js is the authority on 'unsupported' — it knows whether the browser
    // has getUserMedia long before we ask for a permission we cannot get.
    if (a.talkState) { try { if (a.talkState() === 'unsupported') return false; } catch { return false; } }
    return true;
  }
  function talkOpen() {
    const a = audioOf();
    if (!talkAvailable() || talk.live) return;
    // ROUND 8: this used to read `if (!paReady() && !held) return;`, on the
    // reasoning that opening a channel the button says is unavailable would
    // make the readout a liar. The reasoning was right and the fix was backwards
    // — the readout was describing the wrong thing. The button is the
    // ANNOUNCEMENT'S recharge; the microphone was never on it.
    if (!micReady()) return;
    talk.offered = true;
    talk.state = 'requesting';
    Promise.resolve(a.talkStart()).then((ok) => {
      if (!ok) {
        talk.state = (a.talkState && a.talkState()) || 'denied';
        // 'denied' and 'unsupported' are ordinary answers, not failures. The
        // player gets exactly today's game with today's [F] and is never asked
        // again for the rest of the session.
        talk.denied = true;
        return;
      }
      if (!talk.down) { talkClose(); return; }     // let go while we were asking
      talk.live = true; talk.since = G.now; talk.held = 0;
      talk.state = 'live';
    }).catch(() => { talk.denied = true; talk.state = 'denied'; });
  }
  function talkClose() {
    const a = audioOf();
    if (a && a.talkStop) { try { a.talkStop(); } catch { /* already shut */ } }
    // ROUND 8 — THE SECOND CHARGE, DELETED. This line was
    //   if (talk.live && FIX.hold) holdCool = HOLD.cool;   // clock starts at release
    // and it is half of why the feature read as broken. callHold() had already
    // charged the recharge on the keydown, so every use cost two of them; and
    // it fired even when NO ANNOUNCEMENT HAD GONE OUT — talk into the handset
    // with nobody selected, which the file explicitly calls correct and
    // funnier, and callHold() returns false while this still billed you the
    // full recharge for it. The clock belongs to the announcement and is
    // charged where the announcement happens.
    talk.live = false; talk.level = 0;
    if (talk.state === 'live' || talk.state === 'requesting') talk.state = 'off';
  }
  function talkTick(dt) {
    const a = audioOf();
    if (talk.live && a && a.talkLevel) {
      let v = 0;
      try { v = a.talkLevel() || 0; } catch { v = 0; }
      talk.level += (clamp(v, 0, 1) - talk.level) * Math.min(1, dt * 12);
    } else if (!talk.live) talk.level *= Math.exp(-6 * dt);
    if (!talk.live) return;
    talk.held = Math.min(HOLD.talkMax, talk.held + dt);
    // THE RAMBLE BONUS. While you are on the air the subject is standing there
    // listening, so his nine seconds has not started yet — it starts when you
    // stop. Capped at talkMax so the joke cannot become a strategy.
    if (held && talk.held < HOLD.talkMax) held.until = G.now + HOLD.dur;
  }

  // Does the guest actually file? Called every frame while one is hanging. Three
  // ways out: he is gone or the case ended (drop it), the cop got out of his
  // face in time (drop it, and say so in the ticker so the player learns the
  // rule from the game rather than from a manual), or the timer runs out with
  // the cop still crowding him (file it).
  function settleHarass() {
    if (!pending) return;
    const s = shopperById(pending.id);
    if (!s || s.caught || s.escaped || !s.mesh.visible || st.mode !== 'floor') { pending = null; return; }
    const cop = G.cop;
    const d = d2(s.position.x, s.position.z, cop.x, cop.z);
    if (d > TUNING.suspicionRadius + HARASS_CLEAR) {
      logLine(L.fillS(L.pick(L.BACK_OFF_OK), pending.code));
      pending = null;
      return;
    }
    if (G.now < pending.until) return;
    const r = recOf(s);
    r.complained = true;
    G.dbg.harass[pending.why]++;
    G.dbg.subjects.add(s.id);
    pending = null;
    score('harass', s);
  }

  function updateHold(dt) {
    talkTick(dt);
    if (holdCool > 0) holdCool = Math.max(0, holdCool - dt);
    if (!held) return;
    const s = shopperById(held.id);
    // Gone, spooked, or you have walked up on him: the PA stops mattering.
    if (!s || s.caught || s.escaped || s.bolted || s.state === 'react') { held = null; return; }
    const cop = G.cop;
    const near = d2(s.position.x, s.position.z, cop.x, cop.z) < TUNING.suspicionRadius + 1;
    if (G.now >= held.until || near) releaseHold();
  }

  // ------------------------------------------------------------------ alarms
  function updateAlarm() {
    let best = null;
    const a = agentsOf();
    // Metres of ROUTE left, not line of sight — the door is round two corners
    // from most of the store and a straight line reads short by a third.
    const routeTo = (s) => (a && a.toExit ? a.toExit(s.position.x, s.position.z)
      : d2(s.position.x, s.position.z, EXIT.x, EXIT.z));
    // A bolting thief no longer runs thiefRun forever: that is his opening
    // ceiling. He fades to a cruise, so timing the countdown off thiefRun told
    // the player the door was closer than it was.
    const runSpeed = thiefCruise();
    for (const s of shoppersOf()) {
      if (!s.guilty || s.escaped || s.caught) continue;
      if (s.state !== 'drift' && s.state !== 'bolt') continue;
      const de = routeTo(s);
      if (!isFinite(de) || de > 14) continue;
      const sp = s.state === 'bolt' ? runSpeed : TUNING.thiefWalk * 1.12;
      const eta = de / sp;
      if (!best || eta < best.eta) best = { eta, s };
    }
    // ONE ALARM, AND IT IS THE ONLY ONE WITH A DEADLINE ON IT. Everything else
    // that used to reach this bar is narrated where it belongs — see the note
    // above raiseSoft's grave. This is a man about to be through the doors and
    // a number counting down to it, which is the one sentence on this screen
    // that expires.
    G.alarm = best ? {
      text: L.fill(L.VESTIBULE, doorLabelOf(best.s)),
      count: Math.max(0, best.eta),
    } : null;
  }

  // ------------------------------------------------------------ thief supply
  //
  // ROUND 6 — ONE INCIDENT AT A TIME
  // Client: "The number of incidents happening is kinda high. That all happens
  // quick. It should take a minute. Maybe you could slow it down. Make it so,
  // like, one incident at a time."
  //
  // He is right and the bench agrees. `live < 2` plus a 12-22 s rearm is a
  // standing order to keep two open cases on the wall and to replace either one
  // within twenty seconds of it resolving. Measured over 144 shift-minutes it
  // ran at 3.0 incidents a minute — one every twenty seconds — with two or more
  // live 10.3% of the time for a competent player and 17.9% for a poor one, and
  // only 30% of the shift quiet. The round-6 numbers below measure 1.5 a minute,
  // 0.7% overlap and 59% quiet: half the volume, essentially never two at once,
  // and the majority of the shift is you watching a store where nothing has
  // happened yet, which is the job.
  //
  // So density is a RAMP and phase 0 is serial: one live case, and the next one
  // is not armed until the shift has had a breath. Note this is density only —
  // the chase builder owns the difficulty ramp in agents.js and the two are
  // deliberately different axes, so say which you are changing before you touch
  // either.
  const PACE = [
    { at: 0, live: 1, gap: [26, 38] },      // learn the wall on one man at a time
    { at: 150, live: 2, gap: [18, 28] },    // a second case can now overlap
    { at: 330, live: 3, gap: [12, 20] },    // roughly the old round-5 pressure
  ];
  const PACE_R5 = { at: 0, live: 2, gap: [12, 22] };   // what round 5 shipped
  function pace() {
    if (!FIX.pace) return PACE_R5;
    let p = PACE[0];
    for (const q of PACE) if (st.clock >= q.at) p = q;
    return p;
  }
  const armGap = (k = 1) => { const g = pace().gap; return rr(g[0] * k, g[1] * k); };
  function armThief() {
    const a = agentsOf(); if (!a) return;
    const cop = a.cop.position;
    const pool = a.shoppers.filter((s) => !s.guilty && !s.escaped && !s.caught && s.mesh.visible
      && s.angry <= 0 && d2(s.position.x, s.position.z, cop.x, cop.z) > 9);
    if (!pool.length) return;
    // "It should take a minute." The tell-to-door window is route metres from
    // wherever he conceals to a way out, over a walk speed this file does not
    // own — but WHICH CUSTOMER GETS ARMED is entirely this file's, and it moves
    // the same number. A tournament of FOUR on route distance to the nearest
    // exit picks a man deeper in the store without ever making it deterministic
    // (a pure max would arm the back-left corner every single time).
    const far = (s) => (a.toExit ? a.toExit(s.position.x, s.position.z)
      : d2(s.position.x, s.position.z, EXIT.x, EXIT.z));
    let s = pool[(Math.random() * pool.length) | 0];
    for (let k = 0; k < 3; k++) {
      const c = pool[(Math.random() * pool.length) | 0];
      const dc = far(c), ds = far(s);
      if (isFinite(dc) && (!isFinite(ds) || dc > ds)) s = c;
    }
    s.guilty = true; s.stole = false; s.bolted = false;
    s.concealT = rr(10, 22); s.state = 'walk'; s.timer = rr(1, 3);
    s.path = []; s.target = null; s.held.visible = false;
    const r = recOf(s);
    r.announced = false; r.trap = false; r.item = L.pick(L.ITEMS);
    newLine(s, r);
  }
  // ROUND 2: agents.js rebuilt its navigation on an occupancy grid flooded from
  // the real collider set, and the wedge it used to compensate for is gone. The
  // bench confirms it — across ~50 shift-minutes the "he is close enough, call
  // it an escape" branch fired ZERO times, so it is deleted: fabricating a loss
  // the player never saw was always the worst thing in this file. What is left
  // is a plain stuck-shopper recycle, which fired twice in the same 50 minutes.
  // If it ever reads zero as well, delete this too.
  function stallWatch(dt) {
    const a = agentsOf();
    for (const s of shoppersOf()) {
      if (!s.guilty || s.escaped || s.caught) continue;
      if (s.state !== 'drift' && s.state !== 'bolt') { s.__best = Infinity; s.__stall = 0; continue; }
      // Progress, not velocity: a wedged thief walks into the wall at full speed.
      // Metres of ROUTE to the nearest way out, not a straight line to Door 1 —
      // a man walking steadily at Door 2 was reading as a man making no progress.
      const de = (a && a.exitDistOf) ? a.exitDistOf(s) : d2(s.position.x, s.position.z, EXIT.x, EXIT.z);
      if (!isFinite(de)) { s.__stall = 0; continue; }
      if (de < (s.__best == null ? Infinity : s.__best) - 0.5) { s.__best = de; s.__stall = 0; continue; }
      s.__stall = (s.__stall || 0) + dt;
      if (s.__stall > 16 && st.mode === 'desk') {
        G.dbg.stallPutBack++;
        putBack(s); rearmT = Math.min(rearmT, armGap(0.25));
      }
    }
  }

  // agents.js retires a shopper permanently once they leave through Door 1. Left
  // alone the store empties out over a shift and the wall goes dead, so put a new
  // customer in the building — new name, new subject number, same body.
  function repopulate() {
    for (const s of shoppersOf()) {
      if (!s.escaped || s.mesh.visible) continue;
      if (s.__gone == null) { s.__gone = G.now; continue; }
      if (G.now - s.__gone > 18) { putBack(s); s.__gone = null; }
    }
  }

  function ensureThieves(dt) {
    rearmT -= dt;
    const p = pace();
    const live = shoppersOf().filter((s) => s.guilty && !s.escaped && !s.caught && s.mesh.visible).length;
    if (live >= p.live || rearmT > 0) return;
    // Serialisation, and it is a stronger claim than "one live thief". A case is
    // not over when the man is caught, it is over when you are back at the desk:
    // arming the next one while the write-up is on screen is how the player ends
    // up reading a tell he was never shown the wall for.
    if (FIX.pace && p.live <= 1 && st.mode !== 'desk') return;
    armThief();
    rearmT = armGap();
  }
  // agents.js arms its openers with a 2.5-7s fuse, so they conceal and walk out
  // together before you have read one roster. Space them out — and in phase 0,
  // where the budget is ONE live case, hand the surplus openers back their lives.
  // agents.js arms them at reset and has no idea what this shift's pacing is.
  let staggered = false;
  function stagger() {
    const list = shoppersOf();
    if (!list.length) return;
    staggered = true;
    const budget = pace().live;
    list.filter((s) => s.guilty && !s.stole).forEach((s, i) => {
      if (i < budget || !FIX.pace) { s.concealT = 7 + i * 24 + rr(0, 5); return; }
      s.guilty = false; s.concealT = 0;
      const r = recOf(s); r.announced = false; newLine(s, r);
    });
    rearmT = Math.max(rearmT, armGap(0.8));
  }
  function putBack(s) {
    const i = (Math.random() * AISLE_COUNT) | 0;
    s.position.set(aisleX(i) + rr(-1.1, 1.1), 0, rr(-HALF + 1.6, HALF - 1.6));
    s.vel.set(0, 0, 0); s.speed = 0;
    s.guilty = false; s.stole = false; s.caught = false; s.escaped = false;
    s.bolted = false; s.angry = 0; s.harassArmed = true; s.hasCart = true;
    s.state = 'walk'; s.timer = rr(1, 4); s.path = []; s.target = null; s.look = 0;
    s.mesh.visible = true; s.cart.visible = true; s.held.visible = false; s.bang.visible = false;
    s.__stall = 0; s.__best = Infinity; s.__gone = null;
    recs.delete(s.id);
  }

  // -------------------------------------------------------------- floor mode
  function targetShopper() {
    const f = G.floor; if (!f) return null;
    const list = shoppersOf();
    let chase = null;
    for (const s of list) {
      if (s.escaped || s.caught || !s.guilty) continue;
      if (s.state === 'bolt' || s.state === 'react') chase = s;
    }
    if (chase) { f.closed = null; f.tgtWhy = 'chase'; return chase; }
    // THE CASE IS OVER. Reported twice by the chase critic and it was the worst
    // thing on this screen: your man goes out the door, and the HUD quietly
    // re-points the reticle at the nearest STRANGER in the aisle you were sent
    // to, still saying PROCEED. Obeying your own HUD then files a complaint
    // against you. Nothing is your objective until dispatch says so again.
    if (f.closed) { f.tgtWhy = null; return null; }
    if (f.dialogue && f.dialogueId != null) {          // look at whoever is yelling
      const d = list.find((s) => s.id === f.dialogueId && !s.escaped && s.mesh.visible);
      if (d) { f.tgtWhy = 'dialogue'; return d; }
    }
    const sel = list.find((s) => s.id === f.subjId && !s.escaped && !s.caught && s.mesh.visible);
    if (sel) { f.tgtWhy = 'subj'; return sel; }
    const cop = G.cop;
    let best = null, bd = Infinity;
    for (const s of list) {
      if (s.escaped || s.caught || !s.mesh.visible) continue;
      const p = postOf(s.position.x, s.position.z);
      // Same zone you were sent to. In an aisle that is the aisle; on a cross-
      // aisle it is the whole run of it, because that is what you can see.
      if (p.kind !== f.post.kind) continue;
      if (p.kind === 'aisle' && p.i !== f.aisle) continue;
      const d = d2(s.position.x, s.position.z, cop.x, cop.z);
      if (d < bd) { bd = d; best = s; }
    }
    f.tgtWhy = best ? 'zone' : null;
    return best;
  }

  function say(speaker, lines, bad, per, who) {
    G.floor.dialogue = {
      speaker, all: lines.slice(), shown: [lines[0]], t: 0,
      per: per || 2.3, bad: !!bad, hold: 2.4,
    };
    G.floor.dialogueId = who == null ? null : who;
  }
  // `tone` is 'bad' (default) or 'flat'. An abort is not a loss and must not be
  // stamped in the same red as one — he put it back, which is a non-event that
  // happens to pay nothing, and the HUD saying it in complaint-red would tell
  // the player he had been penalised for the thing he did right.
  function stampIt(text, sub, tone) {
    if (!G.floor) return;
    G.floor.stampText = text; G.floor.stampSub = sub || '';
    G.floor.stampTone = tone || 'bad'; G.floor.stampT = 2.6;
  }

  function updateFloor(dt) {
    const f = G.floor; if (!f) return;
    f.t += dt;
    const cop = G.cop;
    const sh = targetShopper();

    if (sh) {
      const flee = sh.state === 'bolt' || sh.state === 'react';
      const r = recOf(sh);
      f.subjCode = r.code;
      f.tgtId = sh.id;
      f.target = { x: sh.position.x, z: sh.position.z, code: r.code, state: flee ? 'flee' : 'walk' };
      f.dist = d2(sh.position.x, sh.position.z, cop.x, cop.z);
      if (flee) {
        if (f.chaseId !== sh.id) {                 // new chase: rebase everything
          f.chaseId = sh.id; f.dEma = null; f.doorI = null;
          f.exitDist0 = 0; f.viaBack = false; f.backT = 0; f.backSaid = false;
        }
        const dr = doorRead(sh, f, dt);
        f.door = dr;
        f.exitDist = dr.dist;
        // The bar is "how much of his run to the door he has done". He can make
        // it longer by turning round, so the baseline is the worst it has ever
        // been rather than the first reading — the bar retreats to zero and sits
        // there while he runs away from every exit, which is the truth.
        f.exitDist0 = Math.max(f.exitDist0, f.exitDist, 2);
        f.eta = f.exitDist / Math.max(0.5, thiefCruise());
        if (f.doorI == null) f.doorI = dr.i;
        else if (dr.i !== f.doorI) {
          f.doorI = dr.i;
          if (dr.sure) logLine(L.fill(L.DOOR_SWITCH, dr.label), true);
        }
        // agents.js flags the rear break in telemetry the frame he commits. Hold
        // it briefly so a single frame of route noise cannot strobe the callout.
        const ch = tel.chase;
        if (ch && ch.id === sh.id && ch.viaBack) f.backT = 0.45;
        else f.backT = Math.max(0, f.backT - dt);
        const back = f.backT > 0;
        // Announced on four channels at once and none of them a full-screen
        // stamp: a stamp lands in the middle of the 3D view at the exact second
        // the player needs to watch a man turn round. The brackets ON him go
        // orange, the band under the pursuit panel flashes, the prompt band
        // changes what it is asking for, and it goes in the log. Once per chase.
        if (back && !f.viaBack && !f.backSaid) {
          f.backSaid = true;
          logLine(L.pick(L.VIA_BACK_LOG), true);
        }
        f.viaBack = back;
      } else {
        f.exitDist = 0; f.exitDist0 = 0; f.chaseId = null; f.door = null;
        f.viaBack = false; f.backT = 0; f.dEma = null; f.doorI = null; f.eta = 0;
      }
      f.confronted = sh.angry > 0;
    } else {
      f.target = null; f.dist = 0; f.exitDist = 0; f.exitDist0 = 0; f.chaseId = null;
      f.door = null; f.viaBack = false; f.backT = 0; f.dEma = null; f.doorI = null; f.eta = 0;
    }

    // dialogue reveal
    if (f.dialogue) {
      const d = f.dialogue;
      d.t += dt;
      if (d.shown.length < d.all.length) {
        if (d.t >= d.per) { d.t = 0; d.shown.push(d.all[d.shown.length]); }
      } else if (d.t >= d.hold) f.dialogue = null;
    }
    if (f.stampT > 0) f.stampT -= dt;

    // prompt
    // ---- ROUND 7: BEING PUNISHED BY AN ABSENCE --------------------------
    // agents.js's one-exit design makes camping the way out remove the crime
    // rather than lower your catch rate. That is the right punishment and it
    // works — nobody commits while a uniform is stood in the doorway — but the
    // player experiences it as a shift where the game stopped producing
    // thieves. An absence has to be narrated or it reads as a bug.
    //
    // Two rules about how. It is on the PROMPT band and nowhere louder, because
    // this is the quietest thing that ever happens in this game and a klaxon
    // about nothing happening would be absurd. And the line is the fiction, not
    // the mechanic: the store noticing, never "deterrence active". A player who
    // works the rule out from this worked it out; nobody told him.
    //
    // QUIET_AT is 6 s against agents' deterT of ~2.2 s, deliberately later than
    // the mechanic — the shoplifters have to have been reading the room for a
    // while before the room says anything back, or the line fires every time
    // you jog past the front end.
    const ag = agentsOf();
    f.postedFor = (ag && ag.postedFor) || 0;
    if (f.postedFor < 1) f.quietLine = null;
    else if (!f.quietLine) f.quietLine = L.pick(L.POSTED_QUIET);

    // Standing on the door with no live case is not "aisle clear", and it is
    // certainly not PROCEED TO FRONT END — which is what the zone branch was
    // telling a man already standing in the front end, because there is nearly
    // always SOME shopper in the busiest part of the store and the reticle will
    // happily point at a stranger. A nearest-stranger-in-zone is not a case, so
    // it does not get to outrank this.
    const quiet = f.postedFor > QUIET_AT && f.quietLine
      && f.tgtWhy !== 'chase' && f.tgtWhy !== 'subj';

    // ROUND 8 — WHAT [F] WOULD DO IF YOU PRESSED IT, in words, every frame.
    // The round-8 complaint was a key you had to press in order to find out it
    // was dead. The cure is not only a shorter cooldown; it is a key that says
    // what it is for before you touch it, and says who it is pointed at.
    const pa = sh && !sh.caught && !sh.escaped && sh.mesh.visible
      && !sh.bolted && sh.state !== 'react' && sh.state !== 'shove' ? sh : null;
    f.paAim = pa ? recOf(pa).code : null;
    f.paLabel = pa ? L.fillS(L.PA_AT, f.paAim) : L.PA_IDLE;

    f.prompt = '';
    f.promptQuiet = false;
    f.backOff = !!pending;
    // 1 -> 0 across the window, so the HUD can show the deadline rather than
    // just assert one. A warning with an invisible timer is a jump scare.
    f.backOffLeft = pending ? clamp((pending.until - G.now) / HARASS_GRACE, 0, 1) : 0;
    // The one prompt that outranks the dialogue, because it is the only one
    // with a deadline on it and the dialogue is what caused it.
    if (pending) { f.prompt = L.BACK_OFF; return; }
    if (!f.dialogue) {
      if (f.closed) f.prompt = L.STAND_DOWN;
      else if (f.target && f.target.state === 'flee') {
        f.prompt = f.viaBack ? L.VIA_BACK_PROMPT : 'PURSUE — DO NOT LOSE HIM';
      } else if (quiet) { f.prompt = f.quietLine; f.promptQuiet = true; }
      else if (!f.target) f.prompt = f.clearLine;
      else if (f.dist > 9) f.prompt = `PROCEED TO ${f.where || `AISLE ${f.aisle + 1}`}`;
      else f.prompt = 'ESTABLISH CONTACT';
    }
  }

  // Whatever it was, it is over. Everything on the floor HUD that names a place
  // or points at a person is now stale, so all of it goes at once.
  function closeCase(line) {
    const f = G.floor; if (!f) return;
    f.closed = { line, t: G.now };
    f.target = null; f.subjId = null; f.tgtId = null; f.chaseId = null;
    f.door = null; f.exitDist = 0; f.exitDist0 = 0; f.eta = 0;
    f.viaBack = false; f.backT = 0; f.dEma = null; f.doorI = null;
    f.dialogue = null; f.dialogueId = null;
    ann = null;                   // the man you shouted at is not your business now
    f.prompt = L.STAND_DOWN;
  }

  // ------------------------------------------------------------- the write-up
  function openWriteup(s) {
    const r = recOf(s);
    caseSeq++;
    const before = st.rank;
    const award = 100 + Math.round(r.item[1] * 5);
    st.points += award; st.caught++;
    refreshRank();
    const prog = rankProgress();
    G.wu = {
      caseNo: `#4417-${String(caseSeq).padStart(4, '0')}`,
      name: r.name, code: r.code,
      aisle: r.aisle == null ? aisleIdx(s.position.x) : r.aisle,
      item: r.item[0], value: r.item[1],
      t: 0, stage: 0, lines: [], all: [], per: 1.5,
      award, nextLabel: prog.label, rankFrac: prog.frac,
      promo: st.rank > before, promoSub: L.pick(L.PROMO_SUB),
      subject: s,
    };
    st.mode = 'writeup';
    logLine(`RECOVERY LOGGED — ${r.code} / ${r.item[0]}`);
  }

  function wuStage(n) {
    const w = G.wu; if (!w) return;
    w.stage = n; w.t = 0; w.lines = []; w.all = [];
    if (n === 1) { w.all = L.pick(L.COP_WARNING).slice(); w.per = 1.6; w.lines = [w.all[0]]; }
    if (n === 2) {
      const a = L.pick(L.ESCORT), b = L.pick(L.ESCORT.filter((x) => x !== a));
      const door = w.subject ? doorLabelOf(w.subject) : null;
      w.all = [L.fill(a, door), L.fill(b, door)]; w.per = 1.1; w.lines = [w.all[0]];
      if (w.subject) { w.subject.mesh.visible = false; w.subject.cart.visible = false; }
    }
    if (n === 3) { w.all = L.pick(L.MANAGER).slice(); w.per = 1.95; w.lines = [w.all[0]]; }
    if (n === 4) { w.lines = []; }
  }

  function updateWriteup(dt) {
    const w = G.wu; if (!w) return;
    w.t += dt;
    if (w.stage === 0) { if (w.t > 2.3) wuStage(1); return; }
    if (w.stage === 4) { if (w.t > 7.5) closeWriteup(); return; }
    if (w.lines.length < w.all.length) {
      if (w.t >= w.per) { w.t = 0; w.lines.push(w.all[w.lines.length]); }
    } else if (w.t >= (w.stage === 3 ? 2.6 : 1.4)) wuStage(w.stage + 1);
  }
  function wuAdvance() {
    const w = G.wu; if (!w) return;
    if (w.stage === 4) { closeWriteup(); return; }
    if (w.stage === 0) { wuStage(1); return; }
    if (w.lines.length < w.all.length) { w.t = 0; w.lines.push(w.all[w.lines.length]); return; }
    wuStage(w.stage + 1);
  }
  function closeWriteup() {
    const w = G.wu;
    if (w && w.subject) recycle.push(w.subject);
    G.wu = null;
    enterDesk();
  }

  // ---------------------------------------------------------------- demotion
  function openDemoted() {
    st.rank = 0;
    G.hr = { head: L.HR_HEAD, body: L.HR_BODY, sign: L.HR_SIGN, t: 0 };
    st.mode = 'demoted';
    G.floor = null; G.wu = null;
  }
  function restart() {
    const a = agentsOf(); if (a) a.reset();
    recs.clear(); recycle = []; G.log = []; harassCool = 0;
    st.points = 0; st.complaints = 0; st.caught = 0; st.escaped = 0;
    st.clock = 0; st.rank = 2; G.hr = null; G.wu = null; G.floor = null;
    st.mode = 'desk'; staggered = false;
    // ROUND 11: a new shift, so the manager has not been over yet and the PA
    // count starts again. `evtSeq` deliberately does NOT — see nextEvt().
    annKeyed = 0; daleSaid = false;
    enterDesk();
    logLine('SHIFT RESTARTED. VEST REISSUED.');
  }

  // -------------------------------------------------------------- transitions
  // enterFloor(i) keeps its old meaning exactly: an aisle index. `post` is an
  // optional richer destination from dispatch(); without it nothing changes.
  function enterFloor(i, post) {
    if (st.mode === 'demoted') return;      // the vest is store property
    const idx = clamp((Number.isFinite(i) ? i : 0) | 0, 0, AISLE_COUNT - 1);
    const p = post || { kind: 'aisle', i: idx };
    const sel = G.desk.subjects.find((s) => s.id === G.desk.sel);
    const same = sel && (post ? sel.id === G.desk.sel : sel.aisle === idx);
    G.floor = {
      aisle: idx, post: p, where: postLabel(p), subjId: same ? sel.id : null,
      target: null, tgtId: null, dist: 0, exitDist: 0, exitDist0: 0, chaseId: null,
      confronted: false, dialogue: null, dialogueId: null, prompt: '', t: 0,
      stampT: 0, stampText: '', stampSub: '', clearLine: L.pick(L.AISLE_CLEAR),
      // two doors: which one he is running at, and how sure the box is
      door: null, doorI: null, dEma: null, eta: 0,
      viaBack: false, backT: 0, backSaid: false, closed: null,
      postedFor: 0, quietLine: null,
      standDown: L.STAND_DOWN_DEST, backLine: L.VIA_BACK, backSub: L.VIA_BACK_SUB,
    };
    st.mode = 'floor';
    // The hold deliberately survives leaving the desk. Parking the OTHER one
    // while you go deal with this one is the entire reason the PA exists; if it
    // cleared on dispatch it would only ever delay somebody you were already
    // walking towards. updateHold() drops it when you get close to him anyway.
    const a = agentsOf();
    if (a) {                       // the waddle across the store is implied
      const sp = postSpawn(p);
      a.cop.position.set(sp.x, 0, sp.z);
      a.cop.userData.vel.set(0, 0, 0);
      a.cop.userData.speed = 0;
      a.cop.userData.heading = 0;
    }
    logLine(L.pick(L.RADIO_DISPATCH));
  }
  function enterDesk() {
    if (st.mode === 'demoted') return;
    if (st.mode === 'floor') taught.post = 1;
    // Walking back to the desk is the most complete form of getting out of
    // somebody's face there is.
    pending = null;
    st.mode = 'desk'; G.floor = null;
    const a = agentsOf();
    if (a) {
      a.cop.position.set(POST.x, 0, POST.z);
      a.cop.userData.vel.set(0, 0, 0); a.cop.userData.speed = 0;
    }
    while (recycle.length) putBack(recycle.pop());
  }

  // ------------------------------------------------------------------ scoring
  function score(evt, s) {
    if (evt === 'catch') { if (s) openWriteup(s); else { st.points += 100; st.caught++; refreshRank(); } }
    if (evt === 'escape') {
      st.escaped++;
      const door = s ? doorLabelOf(s) : null;
      const line = L.fill(L.pick(L.ESCAPE_LOG), door);
      logLine(line, true);
      // Only YOUR man ending it ends your assignment. A thief resolving at the
      // other end of the store while you are mid-chase is a ticker line, not a
      // stand-down order.
      const f = G.floor;
      const mine = f && s && (f.tgtId === s.id || f.subjId === s.id || f.chaseId === s.id);
      if (st.mode === 'floor' && mine) {
        stampIt('SUBJECT LOST', line);
        if (FIX.close) closeCase(L.STAND_DOWN);
      }
      // ROUND 9: this used to raise a soft banner as well. A loss has already
      // finished happening; the ticker line above is the right and only place
      // for it, and the banner was 8pp of the duty cycle that made the alarm
      // unreadable.
    }
    if (evt === 'harass') {
      st.complaints++;
      refreshRank();
      const n = clamp(st.complaints - 1, 0, L.COMPLAINT_STAMP.length - 1);
      logLine(L.COMPLAINT_STAMP[n], true);
      if (st.complaints >= 3) { openDemoted(); return; }
      if (st.mode === 'floor') stampIt(L.COMPLAINT_STAMP[n], L.COMPLAINT_SUB[n]);
    }
  }

  // ------------------------------------------------- callbacks from agents.js
  const api = {
    get mode() { return st.mode; },
    get aisle() { return G.floor ? G.floor.aisle : null; },
    get frozen() { return st.mode === 'writeup' || st.mode === 'demoted'; },
    onBolt(s) {
      const r = recOf(s);
      // ROUND 9. If you shouted at this man in the last couple of seconds, the
      // ticker says WHY he is running rather than only that he is. One line,
      // not two: agents fires onBolt and onAnnounce('bolt') for the same event
      // and in an order this file does not get to depend on, so the causality
      // is read off `lastAnn` — which is stamped when the handset is KEYED,
      // before any reaction exists — and never off the outcome.
      const caused = lastAnn && lastAnn.id === s.id && G.now - lastAnn.t < 2.5;
      if (G.floor) {
        const f = G.floor;
        f.chaseId = null; f.exitDist0 = 0; f.subjId = s.id;
        f.closed = null;                 // a man running reopens any case
        f.dEma = null; f.doorI = null; f.viaBack = false; f.backT = 0; f.backSaid = false;
      }
      logLine(caused ? L.fillS(L.pick(L.PA_BOLT), r.code) : `${r.code} IS RUNNING`, true);
    },
    onCatch(s) {
      if (st.mode === 'demoted') return;
      score('catch', s);
    },
    onEscape(s) {
      if (st.mode === 'demoted') return;
      recs.delete(s.id);
      score('escape', s);
      // A LOSS IS NOT A CUE TO DEAL ANOTHER HAND. This used to cut the rearm to
      // five seconds, which meant the punishment for missing one was the next one
      // arriving before you had read the log line about the first. Give the shift
      // a beat; the ramp decides how long a beat is.
      rearmT = FIX.pace ? armGap(0.6) : Math.min(rearmT, 5);
    },
    // ROUND 7 — A CUSTOMER WHO FINISHED HIS SHOP IS NOT A MERCHANDISE LOSS.
    // Innocents use the one exit now. agents.js routes them here instead of to
    // onEscape, so the ONLY thing this has to do is not score a loss — and the
    // most important line in it is the one that is missing. What it does do is
    // tidy up after him, and close the case if he happened to be the man you
    // were sent to look at, because "your subject walked out of the building"
    // and "the aisle is clear" are different sentences and the second one is
    // the wrong one.
    onLeave(s) {
      recs.delete(s.id);
      const f = G.floor;
      if (st.mode === 'floor' && f && !f.closed
        && (f.subjId === s.id || f.tgtId === s.id || f.chaseId === s.id)) {
        logLine(`${recOf(s).code} CHECKED OUT. NOTHING IN HIS BAGS THAT ISN'T PAID FOR.`);
        closeCase(L.STAND_DOWN);
      }
    },
    // HE PUT IT BACK. This is the one-exit design's whole feedback loop and it
    // is the only event in the game that is GOOD NEWS THAT PAYS NOTHING: you
    // stood on the door, so he never committed the offence, so there is nothing
    // to arrest him for. If the HUD stays silent here the player experiences it
    // as a shift where the game stopped producing thieves — which is exactly
    // what it looks like from the inside, and exactly the wrong lesson.
    //
    // Announced on three channels, none of which explains the mechanic: the log
    // says what he did, the floor gets a stamp because it is the payoff for
    // where the player is standing, and the roster tell is retracted.
    onAbort(s, why) {
      const r = recOf(s);
      // RETRACT THE TELL. `announced` and a BEHAVIOUR_GUILTY line are a claim
      // that an item left the frame and did not arrive in a cart. He put it
      // back; the claim is no longer true, and a roster still flashing red for
      // a man holding nothing is the round-6 bug wearing a different hat.
      r.announced = false;
      newLine(s, r);
      // ---- ROUND 8: THE GUILT ORACLE I ALMOST SHIPPED --------------------
      // agents fires onAbort(s,'announce') when a subject HEEDS the PA — but
      // only for a GUILTY one. An innocent who heeds plays the identical
      // `putback` clip and arrives here not at all; he arrives at onAnnounce
      // with outcome 'heed' and nothing else. So every line below this point,
      // left as it was, would have fired for exactly one of the two
      // populations: a ticker line, a full-screen HE PUT IT BACK stamp and a
      // stand-down for the guilty man, and silence for the innocent one.
      //
      // That is a perfect guilt oracle bolted onto a mechanic whose entire
      // design is that both populations produce both visible outcomes. Announce
      // at everybody, read the ticker, and the roll agents.js spent a round
      // balancing is a lookup table. Same species as reading `s.doorPref` on
      // the pursuit panel, and it would have been much harder to spot, because
      // every individual line here is correct for the case that reaches it.
      //
      // So the announcement's presentation is NOT here. It is in onAnnounce,
      // which both populations reach, and this path keeps only the bookkeeping
      // above — which is guilt-blind because it can only change a row that was
      // already red, and a row being red is a thing the player watched happen.
      if (why === 'announce') return;
      logLine(L.fillS(L.pick(why === 'dump' ? L.ABORT_DUMP : L.ABORT_BALK), r.code));
      const f = G.floor;
      if (st.mode === 'floor' && f) {
        stampIt(L.ABORT_STAMP, L.ABORT_SUB, 'flat');
        if (!f.closed && (f.subjId === s.id || f.tgtId === s.id || f.chaseId === s.id)) {
          closeCase(L.STAND_DOWN);
        }
      }
    },
    // ROUND 8 — WHAT HE VISIBLY DID, one latency after you keyed the handset.
    // `outcome` is 'heed' | 'shrug' | 'hold' and it is never his guilt; agents
    // is explicit that both populations produce both, and this file must stay
    // explicit about it too. One pool of lines per outcome, no branch on
    // s.guilty, no branch on whether onAbort also fired.
    //
    // AND ONLY FOR THE MAN YOU AIMED AT. Every body inside annSpill reacts and
    // fires this, which is the point of the feature — four people look up, so
    // "somebody looked around" is worth nothing. A ticker that printed a row
    // per reaction would name all four and hand back the very thing the spill
    // exists to hide, on top of flooding an eight-line log. The bystanders are
    // in the picture, where they belong.
    onAnnounce(s, kind, outcome) {
      const r = recOf(s);
      // ---- ROUND 10: THE ROW FIRST, AND FOR EVERYBODY IT REACHED ----------
      // This callback fires for the man you aimed at AND for every body inside
      // agents' annSpill, which is the property the whole feature rests on: a
      // PA is a loudspeaker and not a laser, so four people look up and
      // "somebody looked around" is worth nothing. Round 8 answered that with
      // a footnote counting them. The desk can do better for free — put the
      // reaction on each of their rows and the player watches four rows change
      // at once. Shown, not told, and the bystanders end up exactly where
      // round 8 said they belonged: in the picture.
      //
      // ONE POOL FOR ALL OF THEM. No branch on s.guilty, and no branch on
      // whether this was the aimed man — the box cannot tell those apart from
      // a body either. 'bolt' deliberately writes nothing: he is sprinting
      // through the middle of the picture and updateSubjects gives his row
      // RUNNING — n M FROM THE DOOR, which is the number that matters now.
      //
      // ---- ROUND 11: WHICH RUNG, AND THE ROW IS STILL SHARED --------------
      // `paRung` is agents' per-body annN and nothing else — see the note
      // there for why that number cannot leak guilt. The important property
      // of putting it HERE, above the `ann.id !== s.id` gate, is that the
      // round-10 guarantee survives the new copy verbatim: the man you aimed
      // at and the three people who merely stood next to him print the SAME
      // roster line at whatever rung each of them has reached. A bystander on
      // his third announcement gives the camera the finger on his own row,
      // and nothing on this desk says which of the four was the target.
      //
      // `gesture` is accepted as a synonym for the third rung so the chase
      // builder can ship the bird either way — as a clip inside the existing
      // 'shrug' outcome (which is what annN alone gives us) or as its own
      // outcome name. Both land on identical copy, and `ann.out` is
      // normalised back to 'shrug' immediately below so hud.js's colour table
      // never has to learn a fourth word.
      const shrug = outcome === 'shrug' || outcome === 'gesture';
      const rung = outcome === 'gesture' ? 2 : paRung(s);
      if (outcome === 'heed') stampPA(r, rowLine(L.PA_ROW_HEED, rung));
      else if (shrug) stampPA(r, rowLine(L.PA_ROW_SHRUG, rung));
      else r.paLine = null;

      if (!ann || ann.id !== s.id) return;
      ann.out = shrug ? 'shrug' : outcome;
      ann.t = G.now;
      // ---- ROUND 9: THE THIRD OUTCOME, AND IT IS NOT A PRIZE --------------
      // agents.js added 'bolt' — you shouted and he panicked. It is the one
      // outcome of the three that IS a confession, and the temptation is to
      // treat it as one: a stamp, a flourish, HE'S RUNNING in forty-point red.
      // That would be celebrating the read at the exact moment the read has
      // stopped mattering. A man who bolts from an announcement bolts from
      // wherever you were standing when you keyed the handset, which is by
      // definition not between him and the door — you have just started a
      // chase from the worst position the game offers.
      //
      // So the chip says the two words and then the ONE number that changes
      // what happens next, which is the gap he has on you. Then it goes: 1.4 s
      // rather than 2.8, because the pursuit panel is the instrument now and
      // two panels narrating one running man is this round's whole complaint.
      //
      // NO TICKER LINE HERE. onBolt() writes that, and it writes the causal
      // version — see the lastAnn check there.
      if (outcome === 'bolt') {
        ann.line = L.PA_CHIP_BOLT;
        ann.boltT = G.now;
        const gap = d2(s.position.x, s.position.z, G.cop.x, G.cop.z);
        ann.sub = L.fillN(L.PA_CHIP_GAP, Math.round(gap));
        return;
      }
      // ---- ROUND 10: THE THIRD ARM, AND IT IS A THIRD ARM NOW -------------
      // This line used to be reached by 'bolt' as well, because the ternary
      // below has two arms and agents has four outcomes. It printed HE LOOKED
      // AROUND over a man sprinting for the doors. The `if` above is the fix
      // and 'hold' — the price check's own outcome, which rolls nothing — is
      // the fourth: it gets no chip line at all, because nothing happened that
      // the player did not already watch happen.
      if (outcome !== 'heed' && !shrug) return;
      // ROUND 11 — AND THE TICKER CLIMBS TOO. Three pools, indexed by the same
      // rung the row used, because a log that says "LOOKED AROUND FOR WHOEVER
      // SAID THAT" under a man who is currently holding his middle finger up
      // at the ceiling is a log that has stopped watching. This is the ONE
      // line the aimed man gets that the bystanders do not — see the note at
      // the top of this callback — so it may not carry anything the row
      // cannot, and it does not: same rung, same register, no guilt in either.
      ann.line = outcome === 'heed' ? L.PA_CHIP_HEED : L.PA_CHIP_SHRUG[rung];
      const pool = outcome === 'heed' ? L.PA_HEED : L.PA_SHRUG_RUNGS[rung];
      logLine(L.fillS(L.pick(pool), r.code));
      // No stamp and no stand-down, either way. A stamp is for a resolution,
      // and neither of these is one: the guilty man who put it back is walking
      // out on his own and onLeave will say so in his own time, and the
      // innocent is still stood in the aisle being looked at. Round 7 already
      // owns both of those endings and they are both guilt-blind. What the
      // player gets here is the same thing he would get stood in a real shop —
      // he said something, and he has to watch what happens next.
    },
    onHarass(s) {
      if (st.mode !== 'floor' || !G.floor || G.floor.t < 0.8) return;
      // A complaint is for a CONTACT — you walked up to this person because you
      // decided this person was the thief. Sharing an aisle with a stranger is
      // not a contact. agents.js can only offer a radius, and a 4.5m radius in a
      // 4m aisle means every bystander you edge past files on you: the bench had
      // a player who read every tell correctly still demoted three shifts in
      // four, purely from walking to the subject he had correctly identified.
      // Whoever the reticle is on is who you are confronting. Nobody else.
      if (FIX.harass) {
        const t = targetShopper();
        if (!t || t.id !== s.id) { G.dbg.blocked++; return; }
      }
      if (G.floor.dialogue || G.now < harassCool) { G.dbg.blocked++; return; }
      const r = recOf(s);
      // ---- ROUND 7: ONE GUEST, ONE COMPLAINT --------------------------------
      // The round-2 gate stopped bystanders filing. It did not stop the SAME
      // person filing over and over: `harassCool` is a global five seconds and
      // agents.js re-arms a shopper as soon as the cop backs off 1.6 m, which in
      // a 4 m aisle is one sidestep. So a single confrontation — walk up, get
      // yelled at, shuffle, still be standing there — was billed two and three
      // times over. Measured below.
      //
      // A guest complains about being followed round the shop ONCE. He does not
      // file a second form because you were still there ten seconds later. The
      // rec is dropped when he leaves the building, so the next customer through
      // the door has his own complaint to give.
      if (FIX.once && r.complained) { G.dbg.blocked++; G.dbg.reharass++; return; }
      harassCool = G.now + (FIX.harass ? 5 : 12);
      // HE TURNS ROUND AND SAYS SOMETHING. That happens immediately — it is the
      // feedback, and it is the only warning the player gets. The FORM does not
      // exist yet; see settleHarass(). If the player steps out of his face
      // inside HARASS_GRACE, it never will.
      say(`${r.name} — GUEST`, L.pick(L.INNOCENT), true, 2.4, s.id);
      if (!FIX.grace) {
        r.complained = true;
        G.dbg.harass[G.floor.tgtWhy || 'zone']++;
        G.dbg.subjects.add(s.id);
        score('harass', s);
        return;
      }
      pending = { id: s.id, until: G.now + HARASS_GRACE, code: r.code, why: G.floor.tgtWhy || 'zone' };
    },
    // agents.js does not report the sprint key itself; speed is the honest tell.
    report(t) {
      // THE FLASH MOVED. It used to pulse the panel frame while you were
      // sprinting, which tells a man holding a key that he is holding a key.
      // What drives a rhythm is the moment the tank comes BACK, so the edge is
      // latched here and the panel flares on it. `prev` guards the first report
      // of a session, which would otherwise flare for no reason.
      const prev = tel.wind;
      Object.assign(tel, t);
      tel.sprint = t.speed > TUNING.copWalk + 0.35;
      if (tel.sprint) taught.sprint = 1;
      if (prev && prev !== 'ready' && tel.wind === 'ready') tel.readyAt = G.now;
    },
  };

  // ------------------------------------------------------------------- input
  function selectCam(i) {
    const n = CAMERAS.length;
    G.desk.cam = ((i | 0) % n + n) % n;
    G.desk.scroll = 0;
    const c = cctvOf();
    if (c && c.setActiveCam) c.setActiveCam(G.desk.cam);
    // Pick from the rows the panel is ABOUT TO SHOW, not from the whole list.
    // Preferring the dome's subject is right, but only if he is already in the
    // window: reaching for him further down would open a freshly-switched
    // channel scrolled into the middle of its own roster, past the flagged rows
    // that sort to the top, which is the row you switched channels to read.
    const on = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
    const win = on.slice(0, ROWS);
    const code = trackedCode();
    const hot = (code && win.find((s) => s.code === code)) || win.find((s) => s.flagged) || win[0];
    G.desk.sel = hot ? hot.id : null;
  }
  // Scroll the three-row window onto whatever is selected. cycleSel() has always
  // done this for itself; nothing else did, so selecting a subject any OTHER way
  // could highlight a row the panel was not showing. Caught it in the round-6
  // capture: [C] locked the dome on SUBJ-10, DISPATCH read AISLE 2, and the
  // roster listed 02/03/04 with "1 MORE" — the row it was acting on was the one
  // row you could not see.
  function showSel() {
    if (G.desk.sel == null) return;
    const on = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
    const i = on.findIndex((s) => s.id === G.desk.sel);
    if (i < 0) return;
    G.desk.scroll = clamp(G.desk.scroll, Math.max(0, i - ROWS + 1), i);
  }
  // Hand the dome to the next subject on this channel. The spot monitor's PTZ
  // auto-track picks the strongest motion, which is guilt-blind and correct —
  // but it is still a machine choosing for you, and the one thing this game is
  // about is who you decide to spend your good monitor on. This gives the choice
  // back. It cannot be a guilt oracle: cctv.cycleTrack() steps through the blobs
  // its detector already found, in the order they happen to be in, and returns
  // the same thing whether the man is stealing or reading a label.
  //
  // Also drag the roster selection onto whoever the dome landed on, when the
  // wall can name him — that is the whole point of setSubjects: the box says
  // SUBJ-19 and now so does the highlighted row.
  function cycleTrack() {
    taught.track = 1;
    const c = cctvOf();
    if (!c || !c.cycleTrack) return false;
    if (!c.cycleTrack()) return false;
    selectTracked(true);
    return true;
  }
  // WHO IS THE BIG MONITOR ON. cctv's PTZ holds a lock of its own — its
  // auto-track picks the strongest motion, and [C] makes that lock sticky — so
  // the dome has an opinion about who matters whether or not this file asked.
  // Both halves of the desk pointing at the same man is the whole cross-
  // reference, and it drifted apart in testing: [C] put the dome on SUBJ-12,
  // SUBJ-12 flickered off CAM 02's channel list for one frame, the selection
  // reset, and the auto-pick handed the highlight to SUBJ-01 while the picture
  // still had SUBJ-12 boxed in the middle of it. So the dome's pick is now what
  // the roster falls back to, ahead of the first flagged row.
  function trackedCode() {
    const c = cctvOf();
    const tr = c && c.spot && c.spot.track;
    if (!tr || !c.detector || !c.detector.labelFor) return null;
    const lab = c.detector.labelFor(tr);
    return (lab && lab.code) || null;
  }
  // `scroll` true means this was an explicit act — [C], or a click on the big
  // monitor — and the window should go and find him wherever he is in the list.
  // The idle fallback does not scroll, for the reason in selectCam().
  function selectTracked(scroll) {
    const code = trackedCode();
    if (!code) return false;
    const on = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
    const row = scroll ? on.find((s) => s.code === code)
      : on.slice(G.desk.scroll, G.desk.scroll + ROWS).find((s) => s.code === code);
    if (!row) return false;
    G.desk.sel = row.id;
    if (scroll) showSel();
    return true;
  }

  // The roster window is three rows because three rows is what fits. Before, the
  // other rows simply did not exist — with seven shoppers on one camera the game
  // could be hiding the row you needed. Now the window scrolls and follows the
  // selection, and the panel says how many are underneath it.
  function cycleSel(dir) {
    taught.roster = 1;
    const all = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
    const on = FIX.roster ? all : all.slice(0, ROWS);
    if (!on.length) { G.desk.sel = null; G.desk.scroll = 0; return; }
    let i = on.findIndex((s) => s.id === G.desk.sel);
    i = (i < 0 ? (dir > 0 ? 0 : on.length - 1) : i + dir + on.length) % on.length;
    G.desk.sel = on[i].id;
    G.desk.scroll = clamp(G.desk.scroll, Math.max(0, i - ROWS + 1), i);
  }
  function dispatch() {
    const sel = G.desk.subjects.find((s) => s.id === G.desk.sel);
    if (!sel) return false;
    taught.dispatch = 1;
    if (FIX.post && sel.post) { enterFloor(sel.post.i, sel.post); return true; }
    if (sel.aisle != null) { enterFloor(sel.aisle); return true; }
    return false;
  }

  hud.canvas.addEventListener('mousedown', (ev) => {
    const p = hud.toLocal(ev);
    const r = hud.hit(p.x, p.y);
    if (!r) return;
    ev.preventDefault();
    if (r.id === 'cam') selectCam(r.data);
    else if (r.id === 'subj') { taught.roster = 1; G.desk.sel = r.data; showSel(); }
    else if (r.id === 'track') cycleTrack();
    else if (r.id === 'dispatch') dispatch();
    else if (r.id === 'hold') { taught.pa = 1; deskPA(); }
    else if (r.id === 'scroll') { taught.roster = 1; G.desk.scroll = clamp(G.desk.scroll + r.data, 0, Math.max(0, G.desk.rows - ROWS)); }
  });

  addEventListener('keyup', (ev) => {
    if (ev.code !== 'KeyF') return;
    talk.down = false;
    talkClose();
  });
  // Alt-tabbing away with the key down must not leave the microphone open.
  addEventListener('blur', () => { talk.down = false; talkClose(); });

  addEventListener('keydown', (ev) => {
    const c = ev.code;
    if (st.mode === 'desk') {
      if (c.startsWith('Digit')) {
        const n = +c.slice(5);
        if (n >= 1 && n <= CAMERAS.length) { selectCam(n - 1); ev.preventDefault(); }
      } else if (c === 'ArrowDown') { cycleSel(1); ev.preventDefault(); }
      else if (c === 'ArrowUp') { cycleSel(-1); ev.preventDefault(); }
      else if (c === 'KeyC') { cycleTrack(); ev.preventDefault(); }
      else if (c === 'KeyF') {
        // ROUND 10 — AND THIS IS THE LINE THE WHOLE ROUND IS ABOUT. It used to
        // be `callHold()`, unconditionally: the neutral price check, on the one
        // screen where the client's third outcome is live and the only screen
        // he ever described. Now the key speaks to the man in the big picture
        // and says what you can honestly say about him — see deskVerb(). The
        // microphone rides on top of whichever line goes out, exactly as
        // before; if it never opens, this key is the key that shipped.
        if (!ev.repeat) {
          taught.pa = 1; talk.down = true;
          deskPA();
          talkOpen();
        }
        ev.preventDefault();
      }
      else if (c === 'Space' || c === 'Enter') { dispatch(); ev.preventDefault(); }
    } else if (st.mode === 'floor') {
      if (c === 'KeyQ') { enterDesk(); ev.preventDefault(); }
      // ROUND 8 — THE SAME HANDSET, OUT ON THE FLOOR. Two answers to the round-8
      // question in one branch: the microphone opens (that is Job 1's answer —
      // the mic was never a desk resource and gating it on one is what made the
      // key look dead), and the announcement that rides out on it is the
      // deterrence line at whoever the brackets are on, because on the floor
      // you can see his hands and at the desk you cannot.
      else if (c === 'KeyF') {
        if (!ev.repeat) { taught.pa = 1; talk.down = true; announce(); talkOpen(); }
        ev.preventDefault();
      }
    } else if (st.mode === 'writeup') {
      if (c === 'Space' || c === 'Enter') { wuAdvance(); ev.preventDefault(); }
    } else if (st.mode === 'demoted') {
      if (c === 'KeyR') { restart(); ev.preventDefault(); }
    }
  });

  // -------------------------------------------------------------------- loop
  function update(dt) {
    dt = Math.max(0, Math.min(0.1, dt || 0));
    G.now += dt;
    if (st.mode !== 'demoted') st.clock += dt;

    // ---- ROUND 7: THE RAMP, AND THE LEVER I ASKED FOR BACKWARDS -------------
    // I asked the chase builder for a SLOWER DRIFT SPEED early in the shift, on
    // the theory that the tell-to-door window is route metres over walk speed
    // and I only own the numerator. They measured it and it goes the wrong way:
    // rampRun 0.86 costs 50.0%, 0.65 costs 70.0% against 86.3% at 1.00. A
    // slower man is still walking out when the dispatch lands, so the cop
    // arrives BEHIND him, and behind is a verdict rather than a position.
    // Median chase collapsed 6.22 s -> 1.98 s: it does not make the chase
    // longer, it deletes it.
    //
    // `rampWalk` is the lever that does what I wanted — the drift, not the run.
    // It is theirs and it is already in their K block; all this does is tell
    // them where in the shift we are. Idempotent and free, and level 1 is round
    // 5 exactly, so a build that never called this changed nothing. Their
    // breakpoints are deliberately MY PACE breakpoints, so density and
    // difficulty move on the same three beats instead of beating against each
    // other.
    {
      const a = agentsOf();
      if (FIX.ramp && a && a.setDifficulty && a.difficultyForClock) {
        a.setDifficulty(a.difficultyForClock(st.clock));
      } else if (a && a.setDifficulty) a.setDifficulty(1);
    }

    if (st.mode === 'demoted') { G.hr.t += dt; return; }
    if (!staggered) stagger();

    updateSubjects(dt);
    updateHold(dt);
    // The announcement record. It holds the aim from the moment you key the
    // handset, through agents' 0.35-0.95 s reaction latency, to a beat after he
    // has visibly done whatever he is going to do — then it goes, because a
    // readout that stays up is a readout the player starts reading as state.
    // ROUND 10: aged here rather than in updateFloor, because there is an
    // announcement at the desk now and updateFloor does not run there.
    if (ann && G.now - ann.t > (ann.boltT ? 1.4 : ann.out ? 2.8 : 4.5)) ann = null;
    updateAlarm();
    stallWatch(dt);
    repopulate();
    ensureThieves(dt);

    if (st.mode === 'desk') {
      // FIRST-RUN AFFORDANCE. A feature nobody knows about is a feature nobody
      // has. One line, in the ticker, in the DVR's own voice, the first time the
      // player is at the desk with a working handset — and never again, and
      // never at all if the microphone is unavailable or was declined. It says
      // what the key does and not what the feature is called.
      if (!talk.told && talkAvailable()) {
        talk.told = true;
        logLine('PA HANDSET LIVE ON THIS TERMINAL — HOLD [F] AND SPEAK.');
      }
      // ---- ROUND 11: THE MANAGER NOTICES A SHIFT WITH NOTHING IN IT --------
      // A player who works the handset and never leaves the desk is playing a
      // legitimate strategy that pays ZERO — agents.js deters a man for free
      // and scores nothing for it, on purpose — and until this round the game
      // answered that with silence. A silence is not a joke. Dale is the only
      // character here with opinions about your work, so he gets the line, and
      // it is disappointed rather than angry: see L.MANAGER_PA.
      //
      // DALE_AT is nine, which is about four minutes of a man doing nothing
      // but announcing — the deterrence line answers to agents' 6 s recharge
      // and the price check to HOLD.cool at 12.
      //
      // THE COUNT IS NOT THE GATE THAT DOES THE WORK, and I had this backwards
      // until I measured it. ./game/eval.js, 4 shifts x 240 s: `announcer`
      // keys 12.0 announcements a shift and `tattle` 9.3, so BOTH bots that
      // touch this button clear nine comfortably. What stops them is the other
      // half — they catch 2.8 and 3.0 thieves a shift respectively, and this
      // fires only on a shift that has produced NOTHING. That is the right
      // condition anyway: the joke is not "you talk a lot", it is "you talk a
      // lot and there is nobody in the office", and a man who announced twenty
      // times and made an arrest does not get told off for it.
      //
      // AT THE DESK ONLY, and the fiction is the reason rather than the
      // rendering: he came to your terminal to say it. If the condition trips
      // while you are out on the floor he is stood there waiting when you get
      // back, which is worse for you and better for the joke.
      //
      // Two ticker lines out of eight, once a shift. He gets the second one
      // because he is Dale.
      //
      // ONE line, because the desk ticker shows one — measured off the capture
      // this round and now enforced in hud.js's ticker(); see the note at
      // L.MANAGER_PA. And it is not `bad`. Red in this game means a loss or a
      // complaint, and nothing here has been penalised, which is precisely
      // Dale's problem with it.
      //
      // NOT `L.pick`, AND THIS IS A MEASUREMENT RULE RATHER THAN A STYLE ONE.
      // L.pick() draws from Math.random, which ./game/eval.js replaces with a
      // seeded stream for the duration of a bench — so one extra draw here
      // moves every subsequent draw in that shift and every number after it.
      // This is the ONLY line added this round that could have consumed one,
      // and `announcer` keys about twelve announcements a shift, so it would
      // have fired often enough to matter. Indexed off state instead: varies
      // between shifts, costs nothing, and makes round 11 draw-for-draw
      // identical to round 10 by construction rather than by hoping.
      if (!daleSaid && annKeyed >= DALE_AT && st.caught === 0) {
        daleSaid = true;
        const i = (annKeyed * 5 + (st.clock | 0)) % L.MANAGER_PA.length;
        logLine(L.fillN(L.MANAGER_PA[i], annKeyed));
      }
      const a = agentsOf();
      if (a) { a.cop.position.set(POST.x, 0, POST.z); a.cop.userData.vel.set(0, 0, 0); }
      if (G.desk.sel == null && !selectTracked()) {
        const on = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
        const hot = on.find((s) => s.flagged);
        if (hot) { G.desk.sel = hot.id; showSel(); }
      }
      tickCost();               // after the selection settles: it reads the aim
    } else if (st.mode === 'floor') { updateFloor(dt); settleHarass(); }
    else if (st.mode === 'writeup') updateWriteup(dt);
  }

  function render() { hud.render(G); }

  async function shot(name) {
    const C = ext();
    if (C.step) C.step(0);
    render();
    return hud.shot(name);
  }
  if (typeof window !== 'undefined') {
    setTimeout(() => { if (window.__CHOP) window.__CHOP.snapHUD = shot; }, 0);
  }

  logLine('SHIFT START — POST MANNED');
  refreshRank();

  // Everything the mouse and keyboard can do, callable from a script. This is
  // the surface ./game/eval.js drives; it deliberately goes through the same
  // functions the real input handlers call, so a bench measures the real game.
  const bot = {
    selectCam, cycleSel, cycleTrack, dispatch, callHold, wuAdvance, restart,
    // ROUND 8. `announce` is the floor's [F]; announceSubject reports who it
    // WOULD go to without firing, so the bench can measure the aim separately
    // from the roll.
    announce, announceSubject,
    // ROUND 10. `deskPA` is the desk's [F] exactly as the key and the mouse
    // fire it, verb routing and all. deskAim/deskVerb report who it would go to
    // and what it would say without firing, and callHold above is still the
    // price check verb on its own, so a bench that measured a price check in
    // round 9 measures the same thing in round 10.
    deskPA, announceDesk, deskAim, deskVerb,
    get deskReadout() { return deskReadout(); },
    get taught() { return taught; },
    get annReady() { return annReady(); },
    // ROUND 11. Announcements this shift, both verbs, and the rung a given
    // body is on. The bench needs the first to check DALE_AT is out of reach
    // of a bot; a capture script needs the second to drive the ladder.
    get annKeyed() { return annKeyed; },
    rung: paRung,
    get micReady() { return micReady(); },
    get pace() { return pace(); },
    // The bench drives these instead of the mouse, and they teach the same
    // thing the mouse does — a player who is picking rows has demonstrated he
    // can pick rows, whichever input he used. See `taught`.
    select(id) { taught.roster = 1; G.desk.sel = id; },
    scroll(d) { taught.roster = 1; G.desk.scroll = clamp(G.desk.scroll + d, 0, Math.max(0, G.desk.rows - ROWS)); },
    target: targetShopper,
    shopper: shopperById,
    rec: recOf,
    get FIX() { return FIX; },
    get HOLD() { return HOLD; },
    get held() { return held; },
    get holdCool() { return holdCool; },
    // Roster rows exactly as the panel shows them, window and all.
    visibleRows() {
      const all = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
      return FIX.roster ? all.slice(G.desk.scroll, G.desk.scroll + ROWS) : all.slice(0, ROWS);
    },
  };

  return {
    st, api, hud, shot, bot,
    get mode() { return st.mode; },
    set mode(m) { st.mode = m; },
    enterFloor, enterDesk, score, update, render,
    // debug handles for the console
    _g: G, _recs: recs, _armThief: armThief, _demote: openDemoted, _restart: restart,
    async _eval(opts) {
      const m = await import('./game/eval.js');
      return m.run({ game: this, ...ext() }, opts);
    },
  };
}
