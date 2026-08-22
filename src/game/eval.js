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
  const st = { path: [], repath: 0, gx: 0, gz: 0, dry: 0 };

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
    if (!t || t.caught || t.escaped) {
      st.dry += dt;
      input.x = 0; input.z = 0; input.sprint = false;
      if (st.dry > 3.0) { game.enterDesk(); st.dry = 0; st.path = []; }
      return;
    }
    st.dry = 0;
    const gap = d2(cop.x, cop.z, t.position.x, t.position.z);
    const running = t.state === 'bolt' || t.state === 'react';
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
// A read costs time. `react` is the whole budget for noticing a blinking badge
// on one of eight monitors, switching to that channel, reading three rows of
// 12px mono and hitting the key. 1.1s is generous to the machine and stingy to
// a human, which is the direction an honest bench should err.
function observer(ctx, opts) {
  const react = opts.react ?? 1.1;
  const scan = opts.scan ?? 0.4;
  let scanT = 0, lockId = null, lockT = 0;
  return {
    name: 'observer',
    desk(dt, game) {
      scanT -= dt;
      if (lockId != null) {
        lockT -= dt;
        if (lockT <= 0) {
          const row = game._g.desk.subjects.find((s) => s.id === lockId);
          if (row && GUILTY.has(row.line)) {
            game.bot.selectCam(row.cam); game.bot.select(row.id);
            if (!game.bot.dispatch()) lockId = null; else { lockId = null; return; }
          } else lockId = null;
        }
        return;
      }
      if (scanT > 0) return;
      scanT = scan;
      // Every row on every camera — the wall is in front of him, he can look.
      const hot = game._g.desk.subjects.filter((s) => GUILTY.has(s.line));
      if (!hot.length) return;
      // Whoever is closest to the door is the one about to stop being a problem.
      hot.sort((a, b) => rank(game, a) - rank(game, b));
      lockId = hot[0].id; lockT = react;
    },
  };
}
function rank(game, row) {
  const s = game.bot.shopper(row.id);
  if (!s) return 1e9;
  return d2(s.position.x, s.position.z, EXIT.x, EXIT.z);
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
    };
    for (let k = 0; k < shifts; k++) {
      const seed = (opts.seed ?? 7717) + k * 104729;
      const r = await shift(ctx, name, { ...opts, seed, seconds, dt });
      for (const key of Object.keys(agg)) {
        if (typeof agg[key] === 'number' && key in r) agg[key] += r[key];
      }
    }
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
  game.bot.FIX && null;

  const r = {
    thieves: 0, caught: 0, escaped: 0, complaints: 0, demotions: 0, points: 0,
    dispatches: 0, deadZone: 0, holds: 0, floorTime: 0, deskTime: 0, wuTime: 0,
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
    onCatch(s) { r.caught++; closeOut(s); gapi.onCatch(s); },
    onEscape(s) { r.escaped++; closeOut(s); gapi.onEscape(s); },
    onHarass(s) {
      const before = game.st.complaints;
      gapi.onHarass(s);
      if (game.st.complaints > before) r.complaints++;
    },
    report(t) { gapi.report(t); },
  };
  function closeOut(s) {
    r.thieves++;
    const m = seen.get(s.id);
    if (m && m.dead) r.deadZone++;
    seen.delete(s.id);
  }

  let prevMode = game.st.mode;
  let wasHeld = null;
  for (let i = 0; i < steps; i++) {
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
      if (!m) { m = { dead: false }; seen.set(s.id, m); }
      if (game.st.mode === 'desk' && (s.position.z <= -HALF - 0.35 || s.position.z >= HALF + 0.35)) {
        m.dead = true;
      }
    }
    prevMode = mode;
    if ((i & 2047) === 2047) await new Promise((res) => setTimeout(res, 0));
  }
  r.points = game.st.points;
  Math.random = realRandom;
  return r;
}
