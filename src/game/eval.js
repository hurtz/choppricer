// OWNER: builder-game. A bench for the DESK phase, not the chase.
// agents.js already benches the foot chase in isolation. What was never measured
// is the half of the game this file owns: can a player who reads the analytics
// roster correctly turn that read into a catch, and does a player who does not
// read it lose? Round 1 shipped a desk phase that was close to unwinnable and
// nobody could say by how much, because nothing counted.
//
//   run(ctx, { policy:'observer'|'random', shifts, seconds })
//
// Two bots share one floor driver, so the only difference between them is the
// decision made at the desk:
//   observer — reads the roster text. Dispatches only on a line from
//              BEHAVIOUR_GUILTY, which is a claim that an item left the frame
//              and did not arrive in a cart. Never dispatches on a trap line,
//              which is a claim about somebody's coat.
//   random   — reacts to the red FLAG badge and nothing else, which is exactly
//              what the terminal is inviting you to do. Traps flag too.
//
// The bots drive game.bot, the same functions the mouse and keyboard call, and
// the same agents.update() the real loop calls. Nothing here is a model of the
// game; it is the game with a script holding the keys.
import { EXIT, AISLE_COUNT, AISLE_LEN, aisleX, TUNING } from '../config.js';
import { BEHAVIOUR_GUILTY } from './lines.js';

const HALF = AISLE_LEN / 2;
const d2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
const GUILTY = new Set(BEHAVIOUR_GUILTY);
// "How close is this man to being gone." There are two doors now and they are
// 35 m apart, so this is route metres to whichever way out he is nearest — the
// number agents.js exposes for exactly this. Falls back to the old straight line
// to Door 1 only if the contract addition is not there.
const doorDist = (agents, s) => (agents && agents.exitDistOf ? agents.exitDistOf(s)
  : d2(s.position.x, s.position.z, EXIT.x, EXIT.z));

// A yield the browser will not throttle. setTimeout(0) is clamped to ~1s in a
// backgrounded tab, and every agent here runs its tab in the background, which
// turned a 90 second bench into a twenty minute one. MessageChannel is exempt.
const yieldNow = (() => {
  if (typeof MessageChannel !== 'function') return () => new Promise((r) => setTimeout(r, 0));
  const ch = new MessageChannel();
  let waiting = [];
  ch.port1.onmessage = () => { const w = waiting; waiting = []; w.forEach((r) => r()); };
  return () => new Promise((r) => { waiting.push(r); ch.port2.postMessage(0); });
})();

// mulberry32. game.js reaches for Math.random(); agents.js has its own stream.
// Patching Math.random for the duration makes the game side reproducible and
// leaves the agents side alone.
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- floor driver
// One competent pair of hands, shared by both policies, so the comparison
// isolates the desk decision.
//
// ROUND 5 REBUILD, AND THE REASON IS NOT A PREFERENCE. This driver used to end
// with `input.sprint = running || gap > 16 || toDoor < 14`, i.e. it held the key
// from the dispatch to the grab. For four rounds that was free. It is not free
// now: agents.js fixed a bug where a gassed cop STILL HOLDING SPRINT outran a
// full-tank cop who chose to walk (3.13 m/s vs 2.35), and with that inverted and
// the tank cut to 1.40 s, holding the key measures 46.0% against 74.7% for
// rationing it. A bot that holds the key does not measure this game any more; it
// measures a player making the single worst available mistake, twice a minute,
// and it would have reported the desk phase about 25 points low.
//
// So the driver rations. But rationing needs something to ration AGAINST, and
// that is the part that is easy to get wrong: agents.js measured wind skill at
// 28.7 points to a bot that plans an intercept and only 6.7 to one that runs
// straight at the man, because "do I need to spend this?" is unanswerable
// without an estimate of when you would otherwise arrive. A pure pursuit has no
// such estimate — its slack is always infinite — so bolting a wind policy onto
// the old straight-line follower would have bought back a quarter of what the
// change cost. The driver therefore plans first and spends second:
//
//   ROUTE   one Dijkstra out of the cop a few times a second, and the thief's
//           own line to the door he is nearest, sampled every ~2 m with the arc
//           length along it. The goal is the EARLIEST point on his line the cop
//           can reach before he does — not his current position, which is the
//           one place he is guaranteed not to be when you get there.
//   WIND    spend only when the intercept is actually tight (slack < 0.35 s),
//           when he is inside grabbing range, or when he is on the push-bar.
//           A live boost is a timer and not a top speed, so it is always spent.
//
// This is deliberately the same shape as agents.js's own `cut` + `ration`
// reference pair, because the desk phase should be measured through a floor
// phase that plays the way the chase builder has established a competent player
// plays. Any other choice measures the desk read through somebody else's
// mistakes. Nothing here reads a thief's hidden state: the route is computed
// from his position, the same way the HUD's door read is.
function makeDriver(ctx, opts = {}) {
  const { agents, input } = ctx;
  // Wind policy, sliceable so "was rebuilding this worth it" is a measurement
  // rather than a claim. 'ration' ships; 'always' is the old driver's key-down
  // behaviour on the SAME routing, which isolates the wind decision from the
  // plan it is made against.
  const always = opts.wind === 'always';
  const st = {
    path: [], repath: 0, gx: 0, gz: 0, dry: 0, leash: 0, was: 'desk',
    navRef: null, copF: null, copBuf: null, cfT: 0, planT: 0, route: [],
  };

  function follow(nav, pos) {
    while (st.path.length) {
      const w = st.path[0];
      const nxt = st.path[1];
      if (d2(pos.x, pos.z, w.x, w.z) < 0.75
        || (nxt && st.path.length > 1 && nav.clearSeg(pos.x, pos.z, nxt.x, nxt.z))) {
        st.path.shift(); continue;
      }
      break;
    }
    if (!st.path.length) return null;
    const w = st.path[0];
    const dx = w.x - pos.x, dz = w.z - pos.z;
    const m = Math.hypot(dx, dz) || 1;
    return { x: dx / m, z: dz / m, d: m };
  }

  // His line to the door he is nearest, sampled every ~2 m carrying the arc
  // length, so "can I be at THAT spot before he is" is one field lookup.
  function routeOf(nav, t) {
    const e = agents.exitOf && agents.exitOf(t.position.x, t.position.z);
    const door = e && e.exit;
    if (!door) return [];
    const raw = nav.path(t.position.x, t.position.z, door.x, door.z) || [];
    const out = [];
    let cx = t.position.x, cz = t.position.z, run = 0;
    for (const w of raw) {
      const d = d2(cx, cz, w.x, w.z);
      const steps = Math.max(1, Math.round(d / 2.0));
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        run += d / steps;
        out.push({ x: cx + (w.x - cx) * f, z: cz + (w.z - cz) * f, s: run });
      }
      cx = w.x; cz = w.z;
    }
    return out;
  }

  return function drive(dt, game) {
    const nav = agents.nav;
    const cop = agents.cop.position;
    const u = agents.cop.userData;
    const T = agents.tuning;
    const t = game.bot.target();
    if (st.navRef !== nav) {          // store.js rebuilt the world under us
      st.navRef = nav; st.copF = null; st.copBuf = null; st.path = []; st.route = [];
    }
    if (st.was !== 'floor') { st.leash = 0; st.dry = 0; st.path = []; }
    st.was = 'floor';
    st.leash += dt;
    if (!t || t.caught || t.escaped) {
      st.dry += dt;
      input.x = 0; input.z = 0; input.sprint = false;
      if (st.dry > 3.0) { game.enterDesk(); st.was = 'desk'; }
      return;
    }
    st.dry = 0;
    const gap = d2(cop.x, cop.z, t.position.x, t.position.z);
    const running = t.state === 'bolt' || t.state === 'react';
    // Nobody stands in an aisle following a stranger for a minute. If the read
    // was wrong the subject never runs, and the player goes back to post.
    if (!running && st.leash > 14) {
      input.x = 0; input.z = 0; input.sprint = false;
      game.enterDesk(); st.was = 'desk'; return;
    }

    let gx = t.position.x, gz = t.position.z;
    let sprint;

    if (!running) {
      // Walking up on him. Lead him, but only when the segment is clear —
      // leading through a gondola aims the cop at a shelf.
      if (nav.clearSeg(cop.x, cop.z, gx, gz)) { gx += t.vel.x * 0.30; gz += t.vel.z * 0.30; }
      // Bank the wind on the approach: arriving winded loses the chase before
      // it starts, and the tank refills in 0.81 s of NOT holding the key, so
      // there is no reason to still be on it when you get there.
      sprint = always ? gap > 16 : gap > 12;
    } else {
      st.cfT -= dt;
      if (!st.copF || st.cfT <= 0) {
        st.cfT = 0.30;
        if (!st.copBuf || st.copBuf.length !== nav.count) st.copBuf = new Float32Array(nav.count);
        st.copF = nav.field(cop.x, cop.z, { out: st.copBuf });
      }
      st.planT -= dt;
      if (st.planT <= 0) { st.planT = 0.20; st.route = routeOf(nav, t); }

      const tSpd = agents.thiefCruise ? agents.thiefCruise() : T.thiefRun;
      const cSpd = T.copRun * 0.86;
      // A boost is a timer, not a top speed: plan the metres it actually buys,
      // then the rest at a normal pace.
      const bSpd = T.copRun * T.boostMul;
      const dBoost = u.boost > 0 ? u.boost * bSpd : 0;
      const arrive = (d) => (d <= dBoost ? d / bSpd : u.boost + (d - dBoost) / cSpd);

      let best = null;
      for (const w of st.route) {                 // ordered, so the first hit is the earliest
        const cD = nav.at(st.copF, w.x, w.z);
        if (!isFinite(cD)) continue;
        const tT = w.s / tSpd, cT = arrive(cD);
        if (cT <= tT - 0.18) { best = { w, slack: tT - cT }; break; }
      }
      let slack;
      if (best) { gx = best.w.x; gz = best.w.z; slack = best.slack; }
      else {
        // Cannot head him off anywhere on his line. The door is the last place
        // he has to be, so go and stand on it if that is even close to
        // reachable; otherwise there is nothing left but to run at him.
        const e = agents.exitOf && agents.exitOf(t.position.x, t.position.z);
        const door = e && e.exit;
        const rTot = st.route.length ? st.route[st.route.length - 1].s : 0;
        const cD = door ? nav.at(st.copF, door.x, door.z) : Infinity;
        if (door && isFinite(cD) && arrive(cD) < rTot / tSpd + 1.2) { gx = door.x; gz = door.z; }
        slack = 0;                                // nothing is comfortable from here
      }
      // Spend it when the intercept needs it, when he is inside grabbing range,
      // or when he is stalled on a push-bar. Never to arrive four seconds early.
      sprint = always || u.boost > 0 || gap < 3.4 || t.state === 'shove' || slack < 0.35;
    }

    st.repath -= dt;
    if (st.repath <= 0 || !st.path.length || d2(st.gx, st.gz, gx, gz) > 1.2) {
      st.repath = 0.12; st.gx = gx; st.gz = gz;
      st.path = nav.path(cop.x, cop.z, gx, gz);
    }
    const dir = follow(nav, cop);
    if (!dir) { input.x = 0; input.z = 0; input.sprint = false; return; }
    input.x = dir.x; input.z = -dir.z;              // main.js hands W as -1
    input.sprint = sprint;
  };
}


// ------------------------------------------------------------------- policies
// Perfect at INTERPRETING, limited to what the terminal actually shows. That
// distinction is the whole bench. An oracle that reads every row on every
// channel at once is not a player and flatters the design; the wall only ever
// renders behaviour text for the ONE selected channel, and everything else is a
// blinking red FLAG badge on a thumbnail.
//
// So the loop is: see a badge light up somewhere -> switch to that channel ->
// read the three rows -> decide. Traps flag in exactly the same red, so every
// trap costs a switch and a read, and that is the cost the ambiguity is
// supposed to impose. Nothing here can tell a trap from a tell except the text.
function observer(ctx, opts) {
  const tSwitch = opts.switch ?? 0.55;   // notice the badge, hit the channel key
  const tRead = opts.read ?? 0.95;       // read three rows of 12px mono
  const tAct = opts.act ?? 0.35;         // select the row and hit dispatch
  let phase = 'scan', timer = 0, cam = -1, ignore = new Map();
  return {
    name: 'observer',
    desk(dt, game) {
      const G = game._g;
      for (const [k, v] of ignore) if (v < G.now) ignore.delete(k);
      timer -= dt;
      if (phase === 'switch') {
        if (timer > 0) return;
        game.bot.selectCam(cam); phase = 'read'; timer = tRead; return;
      }
      if (phase === 'read') {
        if (timer > 0) return;
        // Only the rows the panel is showing, scroll window and all.
        let rows = game.bot.visibleRows();
        const hit = rows.find((s) => GUILTY.has(s.line));
        if (hit) { game.bot.select(hit.id); phase = 'act'; timer = tAct; return; }
        // Page down only when the tile badge says this camera has a flag and no
        // flagged row is in the window — the one case where the answer can be
        // underneath. Paging whenever more rows merely EXIST costs a read per
        // row for nothing, because the roster already sorts flagged to the top;
        // that policy alone cost this bot six points of catch rate.
        const flagBelow = !rows.some((s) => s.flagged)
          && G.desk.subjects.some((s) => s.cam === cam && s.flagged);
        if (flagBelow && G.desk.scroll + rows.length < G.desk.rows) {
          game.bot.scroll(1); timer = 0.45; return;
        }
        // Nothing readable on this channel: park it and stop coming back for a
        // while, the way you stop chasing a camera that cried wolf.
        ignore.set(cam, G.now + 6);
        phase = 'scan'; return;
      }
      if (phase === 'act') {
        if (timer > 0) return;
        const row = G.desk.subjects.find((s) => s.id === G.desk.sel);
        if (row && GUILTY.has(row.line)) {
          // Two tells on one channel: park the one you are not walking to.
          const other = game.bot.visibleRows()
            .find((s) => s.id !== row.id && GUILTY.has(s.line));
          if (other) { game.bot.select(other.id); game.bot.callHold(); game.bot.select(row.id); }
          game.bot.dispatch();
        }
        phase = 'scan'; return;
      }
      // scan: the badges are the only thing legible at thumbnail size.
      const lit = [];
      for (let i = 0; i < ctx.cctv.cams.length; i++) {
        if (ignore.has(i)) continue;
        if (G.desk.subjects.some((s) => s.cam === i && s.flagged)) lit.push(i);
      }
      if (!lit.length) return;
      // Closest to the door first — that is the one about to stop being yours.
      lit.sort((a, b) => camUrgency(ctx, game, a) - camUrgency(ctx, game, b));
      cam = lit[0]; phase = 'switch'; timer = tSwitch;
    },
  };
}
function camUrgency(ctx, game, i) {
  let best = 1e9;
  for (const row of game._g.desk.subjects) {
    if (row.cam !== i || !row.flagged) continue;
    const s = game.bot.shopper(row.id);
    if (s) best = Math.min(best, doorDist(ctx.agents, s));
  }
  return best;
}

// Reacts to the badge, not the text. The terminal flags traps in exactly the
// same red, so this is not a strawman — it is the obvious way to play.
function random(ctx, opts) {
  const rnd = opts.rnd;
  let wait = 2 + rnd() * 6;
  return {
    name: 'random',
    desk(dt, game) {
      wait -= dt;
      if (wait > 0) return;
      wait = 3 + rnd() * 7;
      const rows = game._g.desk.subjects;
      if (!rows.length) return;
      const flagged = rows.filter((s) => s.flagged);
      const pool = flagged.length ? flagged : rows;
      const row = pool[(rnd() * pool.length) | 0];
      game.bot.selectCam(row.cam); game.bot.select(row.id);
      // Spends the PA the same way it spends everything: on whoever is lit up.
      if (rnd() < 0.5 && game.bot.callHold()) return;
      game.bot.dispatch();
    },
  };
}

// A control: never leaves the desk. This is the "doing nothing" baseline the
// round 1 note put at one loss every 27 seconds.
function idle() { return { name: 'idle', desk() {} }; }

const POLICIES = { observer, random, idle };

// ------------------------------------------------------------------- the shift
export async function run(ctx, opts = {}) {
  const { game, agents } = ctx;
  const shifts = opts.shifts ?? 6;
  const seconds = opts.seconds ?? 240;
  const dt = 1 / 60;
  const names = opts.policies || ['observer', 'random'];
  const fixWas = { ...game.bot.FIX };
  if (opts.fix) Object.assign(game.bot.FIX, opts.fix);

  const out = {};
  for (const name of names) {
    const agg = {
      policy: name, shifts, seconds, thieves: 0, caught: 0, escaped: 0,
      complaints: 0, demotions: 0, points: 0, dispatches: 0, deadZone: 0,
      holds: 0, floorTime: 0, deskTime: 0, wuTime: 0,
      stallEscape: 0, stallPutBack: 0,
    };
    let windows = [];
    for (let k = 0; k < shifts; k++) {
      const seed = (opts.seed ?? 7717) + k * 104729;
      const r = await shift(ctx, name, { ...opts, seed, seconds, dt });
      for (const key of Object.keys(agg)) {
        if (typeof agg[key] === 'number' && key in r) agg[key] += r[key];
      }
      windows = windows.concat(r.windows);
    }
    agg.windowMedian = med(windows);
    agg.windowP10 = q(windows, 0.10);
    const resolved = agg.caught + agg.escaped;
    const mins = (shifts * seconds) / 60;
    agg.catchRate = resolved ? +(100 * agg.caught / resolved).toFixed(1) : null;
    agg.complaintsPerMin = +(agg.complaints / mins).toFixed(2);
    agg.lossesPerMin = +(agg.escaped / mins).toFixed(2);
    agg.demotionsPerShift = +(agg.demotions / shifts).toFixed(2);
    agg.deadZoneRate = resolved ? +(100 * agg.deadZone / resolved).toFixed(1) : null;
    agg.pointsPerShift = Math.round(agg.points / shifts);
    out[name] = agg;
  }
  Object.assign(game.bot.FIX, fixWas);
  return out;
}

async function shift(ctx, policyName, opts) {
  const { game, agents, input } = ctx;
  const dt = opts.dt;
  const steps = Math.round(opts.seconds / dt);
  const realRandom = Math.random;
  const rnd = mulberry32(opts.seed);
  Math.random = rnd;

  const drive = makeDriver(ctx, opts);
  const bot = POLICIES[policyName](ctx, { ...opts, rnd });

  agents.reset();
  game._restart();
  game._g.dbg.stallEscape = 0; game._g.dbg.stallPutBack = 0;

  const r = {
    thieves: 0, caught: 0, escaped: 0, complaints: 0, demotions: 0, points: 0,
    dispatches: 0, deadZone: 0, holds: 0, floorTime: 0, deskTime: 0, wuTime: 0,
    windows: [],            // seconds from the concealment tell to the door
  };
  // A thief counts as dead-zoned when he resolves having spent time on a cross
  // aisle with an untouched analytics flag — i.e. the terminal saw him and the
  // player had no legal move. Tracked per shopper id.
  const seen = new Map();

  const gapi = game.api;
  const api = {
    get mode() { return gapi.mode; },
    get aisle() { return gapi.aisle; },
    get frozen() { return gapi.frozen; },
    onBolt(s) { gapi.onBolt(s); },
    onCatch(s) { r.caught++; closeOut(s, false); gapi.onCatch(s); },
    onEscape(s) { r.escaped++; closeOut(s, true); gapi.onEscape(s); },
    onHarass(s) {
      const before = game.st.complaints;
      gapi.onHarass(s);
      if (game.st.complaints > before) r.complaints++;
    },
    report(t) { gapi.report(t); },
  };
  // On an escape the elapsed time IS the window: tell on the wall to body
  // through the doors. That is the number the whole desk phase is played inside.
  function closeOut(s, escaped) {
    r.thieves++;
    const m = seen.get(s.id);
    if (m && m.dead) r.deadZone++;
    if (escaped && m && m.tellAt != null) r.windows.push(+(clock - m.tellAt).toFixed(2));
    seen.delete(s.id);
  }

  let wasHeld = null;
  let clock = 0;
  for (let i = 0; i < steps; i++) {
    clock += dt;
    const mode = game.st.mode;
    if (mode === 'desk') {
      r.deskTime += dt;
      input.x = 0; input.z = 0; input.sprint = false;
      const before = game.st.mode;
      bot.desk(dt, game);
      if (game.st.mode === 'floor' && before === 'desk') r.dispatches++;
      const h = game.bot.held;
      if (h && h !== wasHeld) r.holds++;
      wasHeld = h;
    } else if (mode === 'floor') {
      r.floorTime += dt;
      drive(dt, game);
    } else if (mode === 'writeup') {
      r.wuTime += dt;
      input.x = 0; input.z = 0; input.sprint = false;
      game.bot.wuAdvance();                 // a player mashes space; so do we
    } else if (mode === 'demoted') {
      r.demotions++;
      game.bot.restart();
      agents.reset();
    }
    agents.update(dt, input, api);
    game.update(dt);

    // dead-zone census: an announced, still-flagged thief standing somewhere the
    // old terminal refused to dispatch to.
    for (const s of agents.shoppers) {
      if (!s.guilty || !s.stole || s.escaped || s.caught) continue;
      let m = seen.get(s.id);
      if (!m) { m = { dead: false, tellAt: clock }; seen.set(s.id, m); }
      if (game.st.mode === 'desk' && (s.position.z <= -HALF - 0.35 || s.position.z >= HALF + 0.35)) {
        m.dead = true;
      }
    }
    if ((i & 2047) === 2047) await yieldNow();
  }
  r.points = game.st.points;
  r.stallEscape = game._g.dbg.stallEscape;
  r.stallPutBack = game._g.dbg.stallPutBack;
  Math.random = realRandom;
  return r;
}

const q = (a, p) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return +b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(1);
};
const med = (a) => q(a, 0.5);
