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
// isolates the desk decision. Walks in (arriving gassed loses chases), sprints
// once the subject is moving, gives up and goes back to post on an empty aisle.
function makeDriver(ctx) {
  const { agents, input } = ctx;
  const nav = agents.nav;
  const st = { path: [], repath: 0, gx: 0, gz: 0, dry: 0, leash: 0, was: 'desk' };

  function follow(pos) {
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

  return function drive(dt, game) {
    const cop = agents.cop.position;
    const t = game.bot.target();
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
    // Lead him, but only when the segment is clear — leading through a gondola
    // aims the cop at a shelf.
    let gx = t.position.x, gz = t.position.z;
    if (nav.clearSeg(cop.x, cop.z, gx, gz)) { gx += t.vel.x * 0.30; gz += t.vel.z * 0.30; }
    st.repath -= dt;
    if (st.repath <= 0 || !st.path.length || d2(st.gx, st.gz, gx, gz) > 1.2) {
      st.repath = 0.12; st.gx = gx; st.gz = gz;
      st.path = nav.path(cop.x, cop.z, gx, gz);
    }
    const dir = follow(cop);
    if (!dir) { input.x = 0; input.z = 0; input.sprint = false; return; }
    input.x = dir.x; input.z = -dir.z;              // main.js hands W as -1
    // Bank the wind on the approach. Sprint once he is moving, or when he is
    // close enough to the doors that arriving late is the same as not arriving.
    const toDoor = d2(t.position.x, t.position.z, EXIT.x, EXIT.z);
    input.sprint = running || gap > 16 || toDoor < 14;
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
      lit.sort((a, b) => camUrgency(game, a) - camUrgency(game, b));
      cam = lit[0]; phase = 'switch'; timer = tSwitch;
    },
  };
}
function camUrgency(game, i) {
  let best = 1e9;
  for (const row of game._g.desk.subjects) {
    if (row.cam !== i || !row.flagged) continue;
    const s = game.bot.shopper(row.id);
    if (s) best = Math.min(best, d2(s.position.x, s.position.z, EXIT.x, EXIT.z));
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

  const drive = makeDriver(ctx);
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
