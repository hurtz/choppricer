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
// WHAT WENT WITH IT: round 3's note here explained that a man in the Door 2
// vestibule sat in no frustum at all, and that filing him under EXIT DOORS
// anyway measured WORSE than calling it FRONT END (-1pp for the reader, +5 for
// the guesser) because the roster then named a channel showing an empty doorway
// thirty-five metres away. Both halves of that are settled: config.js took the
// fix and added CAM 09 DOOR 2, and it carries the measurement in its own comment
// beside the camera. There is no least-wrong channel to pick any more, because
// the wall is now asked instead of guessed.
function camForZone(x, z) {
  if (z <= -HALF - 0.35) return d2(x, z, EXIT.x, EXIT.z) < 10 ? 6 : 4;
  if (z >= HALF + 0.35) return x > STORE.maxX - 11 ? 7 : 5;
  return Math.min(3, aisleIdx(x) >> 1);
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
const HOLD = { dur: 9.0, cool: 12.0, talkMax: 8.0 };
// Seconds stood on the way out before the store remarks on it. See updateFloor.
const QUIET_AT = 6.0;
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

  const recs = new Map();     // shopper.id -> the DVR's opinion of that shopper
  let caseSeq = 112;
  let softAlarm = null;
  let rearmT = 8;
  let harassCool = 0;
  let pending = null;         // { id, until, code } — a complaint not yet filed
  let recycle = [];           // shoppers to quietly put back on the floor
  let held = null;            // { id, until } — the one live PA price check
  let holdCool = 0;
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
        // The desk half: an announcement needs the recharge AND a row.
        ann: annReady() && G.desk.subjects.some((s) => s.id === G.desk.sel),
        // The floor half answers to agents' cooldown, not mine, so the readout
        // and the behaviour cannot drift apart. If they ever disagree the
        // button is lying again and that is the bug this round is about.
        pbReady: !a || a.announceReady !== false,
        pbIn: (a && a.announceIn) || 0,
        pbAt: G.floor && G.floor.annAt,
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
        // channel state — see camForZone()'s note. cam is null until a monitor
        // has actually seen him; lost is seconds since the last one did.
        cam: null, lost: 0, pend: -1, pendT: 0, lostSaid: false,
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
    r.lineT = rr(3.2, 6.4);
    if (s.guilty && s.stole) { r.line = L.pick(L.BEHAVIOUR_GUILTY); r.flagged = true; return; }
    if (s.guilty) { r.line = L.pick(L.BEHAVIOUR_GUILTY_PRE); r.flagged = false; return; }
    if (r.trap && Math.random() < trapRate()) {
      r.line = L.pick(L.BEHAVIOUR_TRAP); r.flagged = true;
      if (r.aisle != null) raiseSoft(r);
      return;
    }
    r.line = L.pick(L.BEHAVIOUR_BENIGN); r.flagged = false;
  }
  // The full-width amber alarm bar. It has to stay a JOLT, and raising the trap
  // rate for phase 0 (see newLine) would otherwise have parked it permanently
  // open: ~2.1 flagged traps at any moment, each refreshing a 5.5 s banner every
  // 5 s, is a banner that is simply always there. Ambiguity belongs in the roster
  // text where you have to read it; a light that never goes out teaches nothing.
  // Concealment tells ignore the cooldown — that one is not noise.
  //
  // 24 s, and the number is arithmetic rather than taste: the banner holds for
  // 5.5 s, so a cooldown of N caps ITS duty cycle at 5.5/N. At the 9 s I first
  // tried, measurement said something soft was on the bar 42% of the shift and
  // the bar itself was lit 58% — a warning light that is on more than it is off
  // is not a warning light. 24 s caps the trap share at 23%; the other soft
  // banner is the merchandise-loss notice, which is about one a minute for
  // another ~8%, and the rest of what you see up there is the vestibule
  // countdown, which is real and is not on a cooldown for anything.
  const SOFT_COOL = 24.0;
  let softAt = -99;
  function raiseSoft(r, force) {
    if (!force && G.now - softAt < SOFT_COOL) return;
    softAt = G.now;
    const cam = r.cam == null ? 0 : r.cam;
    softAlarm = {
      text: `${L.pick(L.ALERT_FALSE)} — ${CAMERAS[cam].id}${r.aisle == null ? '' : ` / AISLE ${r.aisle + 1}`}`,
      until: G.now + 5.5,
    };
  }

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
        r.announced = true; newLine(s, r); raiseSoft(r, true);
        logLine(`${CAMERAS[r.cam].id} — ANALYTICS EVENT LOGGED`);
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
      const row = {
        id: s.id, cam: r.cam, aisle: r.aisle, code: r.code,
        line: r.line, dwell: r.dwell | 0, flagged: r.flagged, lost: r.lost,
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
    const r = recOf(s);
    const f = G.floor;
    // WHAT THE TICKER SAYS NOW, AND WHAT IT DOES NOT SAY. It records that an
    // announcement went out and who it was aimed at. It does not say what he
    // did, because he has not done it yet — agents rolls the reaction 0.35-0.95 s
    // later precisely so that no HUD line can get ahead of the picture. See
    // onAnnounce.
    logLine(L.fillS(L.pick(L.PA_PUTBACK), r.code));
    if (f) {
      // The chip on the floor HUD holds the aim for a beat so the player can see
      // WHO it went to, and `heard` is the honest footnote: a loudspeaker is not
      // a laser and three other people in that aisle just looked up too. Saying
      // so out loud is what stops "somebody looked around" being worth anything.
      f.annAt = { code: r.code, id: s.id, t: G.now, heard: res.heard | 0, out: null };
    }
    return true;
  }
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
    if (best) {
      // Which vestibule. Two doors 35 m apart and one alarm text that always
      // said DOOR 1 sent the player to the wrong end of the front wall.
      G.alarm = {
        text: `${doorLabelOf(best.s)} — SUBJECT IN THE VESTIBULE`,
        count: Math.max(0, best.eta),
      };
      return;
    }
    if (softAlarm && softAlarm.until > G.now) { G.alarm = { text: softAlarm.text }; return; }
    G.alarm = null;
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
    recs.clear(); recycle = []; G.log = []; softAlarm = null; harassCool = 0;
    st.points = 0; st.complaints = 0; st.caught = 0; st.escaped = 0;
    st.clock = 0; st.rank = 2; G.hr = null; G.wu = null; G.floor = null;
    st.mode = 'desk'; staggered = false;
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
      softAlarm = { text: 'MERCHANDISE LOSS — SHIFT TOTAL UPDATED', until: G.now + 5 };
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
      if (G.floor) {
        const f = G.floor;
        f.chaseId = null; f.exitDist0 = 0; f.subjId = s.id;
        f.closed = null;                 // a man running reopens any case
        f.dEma = null; f.doorI = null; f.viaBack = false; f.backT = 0; f.backSaid = false;
      }
      logLine(`${r.code} IS RUNNING`, true);
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
      const f = G.floor;
      if (!f || !f.annAt || f.annAt.id !== s.id) return;
      f.annAt.out = outcome;
      f.annAt.t = G.now;
      const r = recOf(s);
      const pool = outcome === 'heed' ? L.PA_HEED : L.PA_SHRUG;
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
    else if (r.id === 'subj') { G.desk.sel = r.data; showSel(); }
    else if (r.id === 'track') cycleTrack();
    else if (r.id === 'dispatch') dispatch();
    else if (r.id === 'hold') callHold();
    else if (r.id === 'scroll') { G.desk.scroll = clamp(G.desk.scroll + r.data, 0, Math.max(0, G.desk.rows - ROWS)); }
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
        // Tap fires the announcement exactly as it always has — that path is
        // measured and neutral and must not move. The microphone rides on top:
        // if it opens, the same announcement goes out in the player's voice; if
        // it never opens, this key is the key that shipped.
        if (!ev.repeat) { talk.down = true; callHold(); talkOpen(); }
        ev.preventDefault();
      }
      else if (c === 'Space' || c === 'Enter') { dispatch(); ev.preventDefault(); }
    } else if (st.mode === 'floor') {
      if (c === 'KeyQ') { enterDesk(); ev.preventDefault(); }
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
      const a = agentsOf();
      if (a) { a.cop.position.set(POST.x, 0, POST.z); a.cop.userData.vel.set(0, 0, 0); }
      if (G.desk.sel == null && !selectTracked()) {
        const on = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
        const hot = on.find((s) => s.flagged);
        if (hot) { G.desk.sel = hot.id; showSel(); }
      }
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
    get pace() { return pace(); },
    select(id) { G.desk.sel = id; },
    scroll(d) { G.desk.scroll = clamp(G.desk.scroll + d, 0, Math.max(0, G.desk.rows - ROWS)); },
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
