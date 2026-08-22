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

// CAM 01..04 cover aisle pairs; 05 front end, 06 back wall, 07 exit, 08 produce.
// These are INDICES into CAMERAS, so 6 is CAM 07 EXIT DOORS and 4 is CAM 05.
//
// ROUND 3, AND DELIBERATELY NOT CHANGED. The vestibule test names Door 1 because
// CAM 07 is bolted to Door 1: config's CAMERAS was written for a one-door store
// and nothing in it is aimed at Door 2 — CAM 07 faces -Z from x=-21.9 and CAM 05
// faces +Z from x=0, so a man standing in the Door 2 vestibule at x=14.5 is in
// neither frustum. I tried filing him under EXIT DOORS anyway; that is a worse
// lie than the one it replaces, because the roster would then name a channel
// whose picture is of a doorway thirty-five metres away with nobody in it.
// FRONT END is the least-wrong channel available. The real fix is a ninth camera
// on Door 2, which lives in config.js and is reported, not taken.
function camFor(x, z) {
  if (z <= -HALF - 0.35) return d2(x, z, EXIT.x, EXIT.z) < 10 ? 6 : 4;
  if (z >= HALF + 0.35) return x > STORE.maxX - 11 ? 7 : 5;
  return Math.min(3, aisleIdx(x) >> 1);
}
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
const HOLD = { dur: 9.0, cool: 21.0 };

// Sub-fixes, individually switchable so the bench in ./game/eval.js can attribute
// the change instead of guessing. Ship values are all true.
const FIX = { post: true, hold: true, roster: true, harass: true, close: true };
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

  // cctv.js burns a REC pip, a "CAM 09 FLOOR PATROL" label and a timestamp into
  // the on-foot view. The HUD's top band draws all three, better and on purpose,
  // so the two used to sit on top of each other. One owner: this one.
  {
    const c = cctvOf();
    if (c) {
      c.floorBurnIn = false;
      if (c.setParams) c.setParams('floor', { burnIn: 0 });
    }
  }

  const st = {
    mode: 'desk', points: 0, complaints: 0, rank: 2, caught: 0, escaped: 0,
    clock: 0, shift: '2ND',
  };

  const recs = new Map();     // shopper.id -> the DVR's opinion of that shopper
  let caseSeq = 112;
  let softAlarm = null;
  let rearmT = 6;
  let harassCool = 0;
  let recycle = [];           // shoppers to quietly put back on the floor
  let held = null;            // { id, until } — the one live PA price check
  let holdCool = 0;
  const tel = {
    stamina: TUNING.staminaMax, staminaMax: TUNING.staminaMax,
    boost: 0, gassed: false, speed: 0, nearest: null, chase: null,
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
    get hold() { return { live: held, cool: holdCool, max: HOLD.cool, on: FIX.hold }; },
    floor: null, wu: null, hr: null,
    // Is the round 1 wedge watchdog still earning its keep? agents.js rebuilt
    // its navigation this round and claims the wedge is gone at source.
    dbg: { stallEscape: 0, stallPutBack: 0 },
    get rankName() { return RANKS[clamp(st.rank | 0, 0, RANKS.length - 1)].toUpperCase(); },
    get tiles() { const c = cctvOf(); const t = c && c.tiles; return (t && t.length) ? t : FALLBACK; },
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
      };
      recs.set(s.id, r);
    }
    return r;
  }
  function newLine(s, r) {
    r.lineT = rr(3.2, 6.4);
    if (s.guilty && s.stole) { r.line = L.pick(L.BEHAVIOUR_GUILTY); r.flagged = true; return; }
    if (s.guilty) { r.line = L.pick(L.BEHAVIOUR_GUILTY_PRE); r.flagged = false; return; }
    if (r.trap && Math.random() < 0.26) {
      r.line = L.pick(L.BEHAVIOUR_TRAP); r.flagged = true;
      if (r.aisle != null) raiseSoft(r);
      return;
    }
    r.line = L.pick(L.BEHAVIOUR_BENIGN); r.flagged = false;
  }
  function raiseSoft(r) {
    const cam = r.cam == null ? 0 : r.cam;
    softAlarm = {
      text: `${L.pick(L.ALERT_FALSE)} — ${CAMERAS[cam].id}${r.aisle == null ? '' : ` / AISLE ${r.aisle + 1}`}`,
      until: G.now + 5.5,
    };
  }

  function updateSubjects(dt) {
    const out = [];
    for (const s of shoppersOf()) {
      if (s.escaped || s.caught || !s.mesh.visible) continue;
      const r = recOf(s);
      const a = inAisle(s.position.z) ? aisleIdx(s.position.x) : null;
      if (a !== r.lastA) { r.lastA = a; r.dwell = 0; } else r.dwell += dt;
      r.aisle = a;
      r.cam = camFor(s.position.x, s.position.z);
      r.lineT -= dt;
      const wantGuilty = s.guilty && s.stole;
      if (wantGuilty && !r.announced) {          // the concealment tell arrives
        r.announced = true; newLine(s, r); raiseSoft(r);
        logLine(`${CAMERAS[r.cam].id} — ANALYTICS EVENT LOGGED`);
      } else if (r.lineT <= 0) newLine(s, r);
      const post = FIX.post ? postOf(s.position.x, s.position.z)
        : (r.aisle == null ? null : { kind: 'aisle', i: r.aisle });
      out.push({
        id: s.id, cam: r.cam, aisle: r.aisle, code: r.code,
        line: r.line, dwell: r.dwell | 0, flagged: r.flagged,
        post, where: postLabel(post), held: held != null && held.id === s.id,
      });
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
  function callHold() {
    if (!FIX.hold || st.mode !== 'desk' || holdCool > 0 || held) return false;
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
  function updateHold(dt) {
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
  function armThief() {
    const a = agentsOf(); if (!a) return;
    const cop = a.cop.position;
    const pool = a.shoppers.filter((s) => !s.guilty && !s.escaped && !s.caught && s.mesh.visible
      && s.angry <= 0 && d2(s.position.x, s.position.z, cop.x, cop.z) > 9);
    if (!pool.length) return;
    const s = pool[(Math.random() * pool.length) | 0];
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
        putBack(s); rearmT = Math.min(rearmT, 4);
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
    const live = shoppersOf().filter((s) => s.guilty && !s.escaped && !s.caught && s.mesh.visible).length;
    if (live < 2 && rearmT <= 0) { armThief(); rearmT = rr(12, 22); }
  }
  // agents.js arms both openers with a 2.5-7s fuse, so they conceal and walk out
  // together before you have read one roster. Space them out.
  let staggered = false;
  function stagger() {
    const list = shoppersOf();
    if (!list.length) return;
    staggered = true;
    list.filter((s) => s.guilty && !s.stole).forEach((s, i) => { s.concealT = 9 + i * 17 + rr(0, 6); });
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
    if (chase) { f.closed = null; return chase; }
    // THE CASE IS OVER. Reported twice by the chase critic and it was the worst
    // thing on this screen: your man goes out the door, and the HUD quietly
    // re-points the reticle at the nearest STRANGER in the aisle you were sent
    // to, still saying PROCEED. Obeying your own HUD then files a complaint
    // against you. Nothing is your objective until dispatch says so again.
    if (f.closed) return null;
    if (f.dialogue && f.dialogueId != null) {          // look at whoever is yelling
      const d = list.find((s) => s.id === f.dialogueId && !s.escaped && s.mesh.visible);
      if (d) return d;
    }
    const sel = list.find((s) => s.id === f.subjId && !s.escaped && !s.caught && s.mesh.visible);
    if (sel) return sel;
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
    return best;
  }

  function say(speaker, lines, bad, per, who) {
    G.floor.dialogue = {
      speaker, all: lines.slice(), shown: [lines[0]], t: 0,
      per: per || 2.3, bad: !!bad, hold: 2.4,
    };
    G.floor.dialogueId = who == null ? null : who;
  }
  function stampIt(text, sub) {
    if (!G.floor) return;
    G.floor.stampText = text; G.floor.stampSub = sub || ''; G.floor.stampT = 2.6;
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
    f.prompt = '';
    if (!f.dialogue) {
      if (f.closed) f.prompt = L.STAND_DOWN;
      else if (f.target && f.target.state === 'flee') {
        f.prompt = f.viaBack ? L.VIA_BACK_PROMPT : 'PURSUE — DO NOT LOSE HIM';
      } else if (!f.target) f.prompt = f.clearLine;
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
      rearmT = Math.min(rearmT, 5);
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
        if (!t || t.id !== s.id) return;
      }
      if (G.floor.dialogue || G.now < harassCool) return;
      harassCool = G.now + (FIX.harass ? 5 : 12);
      const r = recOf(s);
      say(`${r.name} — GUEST`, L.pick(L.INNOCENT), true, 2.4, s.id);
      score('harass', s);
    },
    // agents.js does not report the sprint key itself; speed is the honest tell.
    report(t) { Object.assign(tel, t); tel.sprint = t.speed > TUNING.copWalk + 0.35; },
  };

  // ------------------------------------------------------------------- input
  function selectCam(i) {
    const n = CAMERAS.length;
    G.desk.cam = ((i | 0) % n + n) % n;
    G.desk.scroll = 0;
    const c = cctvOf();
    if (c && c.setActiveCam) c.setActiveCam(G.desk.cam);
    const on = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
    const hot = on.find((s) => s.flagged) || on[0];
    G.desk.sel = hot ? hot.id : null;
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
    else if (r.id === 'subj') G.desk.sel = r.data;
    else if (r.id === 'dispatch') dispatch();
    else if (r.id === 'hold') callHold();
    else if (r.id === 'scroll') { G.desk.scroll = clamp(G.desk.scroll + r.data, 0, Math.max(0, G.desk.rows - ROWS)); }
  });

  addEventListener('keydown', (ev) => {
    const c = ev.code;
    if (st.mode === 'desk') {
      if (c.startsWith('Digit')) {
        const n = +c.slice(5);
        if (n >= 1 && n <= CAMERAS.length) { selectCam(n - 1); ev.preventDefault(); }
      } else if (c === 'ArrowDown') { cycleSel(1); ev.preventDefault(); }
      else if (c === 'ArrowUp') { cycleSel(-1); ev.preventDefault(); }
      else if (c === 'KeyF') { callHold(); ev.preventDefault(); }
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

    if (st.mode === 'demoted') { G.hr.t += dt; return; }
    if (!staggered) stagger();

    updateSubjects(dt);
    updateHold(dt);
    updateAlarm();
    stallWatch(dt);
    repopulate();
    ensureThieves(dt);

    if (st.mode === 'desk') {
      const a = agentsOf();
      if (a) { a.cop.position.set(POST.x, 0, POST.z); a.cop.userData.vel.set(0, 0, 0); }
      if (G.desk.sel == null) {
        const on = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
        const hot = on.find((s) => s.flagged);
        if (hot) G.desk.sel = hot.id;
      }
    } else if (st.mode === 'floor') updateFloor(dt);
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
    selectCam, cycleSel, dispatch, callHold, wuAdvance, restart,
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
