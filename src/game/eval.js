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
// ROUND 21 — A WORST-OF IS NOT A TOTAL, AND IT SHOULD NOT NEED A LIST.
// This file pools hud.js's census in TWO places (per frame inside a shift, and
// across shifts), and both did it by adding every numeric key with two
// hand-written exceptions. Round 20 added `_subjNearWorst`, did not add it
// beside them, and a pooled bench reported the SUM of every frame's worst case
// as if it were a worst case. The same trap has now caught three fields in three
// rounds — `_erasePct`, `_worstPx`, `_subjNearWorst` — because it is a list that
// somebody has to remember to extend.
//
// So it is a NAMING RULE instead: a numeric census key whose name ends in
// `Worst` pools by maximum. The two legacy string pairs keep their special cases
// above it (a string cannot be maxed; its companion number is what is compared),
// and any field a later round adds is right by default.
const isWorstNum = (k, v) => typeof v === 'number' && /Worst$/.test(k);
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
    path: [], repath: 0, gx: 0, gz: 0, dry: 0, leash: 0, was: 'desk', boT: 0,
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

    // ---- ROUND 7: GET OUT OF HIS FACE ---------------------------------------
    // A complaint no longer files the instant you crowd somebody; the guest
    // turns round, says something, and gives you about a second and a half to
    // step back before he makes it formal. That is a SKILL, so the bench has to
    // have it or it measures a player who does not.
    //
    // AND IT IS A SKILL, SO IT IS NOT FREE AND NOT UNIVERSAL. Handing it to
    // every policy took ALL THREE bots to zero complaints a shift — including
    // the guesser, which is a game with no fail state left in it. Two things
    // fix that and both are true of people:
    //   `backOff`  — noticing that the man you walked up to has turned round and
    //                is shouting is the same kind of attention as reading the
    //                roster. A bot that reads nothing does not have it.
    //   `boReact`  — and nobody reacts instantly. The clock is 1.6 s; spending
    //                the first half of it realising is what makes the window a
    //                window rather than a formality.
    if (game._g.floor && game._g.floor.backOff && !running && opts.backOff !== false) {
      st.boT += dt;
      if (st.boT < (opts.boReact ?? 0.55)) {
        input.x = 0; input.z = 0; input.sprint = false;   // frozen, working it out
        return;
      }
      const dx = cop.x - t.position.x, dz = cop.z - t.position.z;
      const m = Math.hypot(dx, dz) || 1;
      input.x = dx / m; input.z = -(dz / m);
      input.sprint = false;
      st.leash += dt;
      return;
    }
    st.boT = 0;
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
        //
        // ROUND 7 — this exact moment is where a human differs from this bot.
        // A flag is lit, the rows do not explain it, and the disciplined move is
        // to walk away. `onPark` is the hook where a less disciplined policy
        // gets to go anyway; see reader(). It fires ONCE per read, which is the
        // whole point — an impatience rolled every frame is not impatience, it
        // is a coin that always comes up heads within a second.
        if (opts.onPark && opts.onPark(rows, game)) { phase = 'scan'; return; }
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
          // ROUND 10. The hook where a policy does something OTHER than walk at
          // a subject it has read correctly. Undefined for every round-9 bot,
          // costs no draw, and the whole bench reproduces to the decimal with
          // it in place — see tattle().
          if (opts.onTell && opts.onTell(row, game)) { phase = 'scan'; return; }
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
// Reacts to the badge, and to nothing else — including the man shouting at him.
// makeDriver reads opts.backOff, so this is the policy declaring that it does
// not have the skill rather than the driver deciding for it.
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

// ---------------------------------------------------------------- ROUND 7
// A COMPETENT PLAYER IS NOT A PERFECT ONE, AND THAT IS THE WHOLE QUESTION.
//
// The round-7 note says a player who reads every tell correctly still gets
// demoted at 7 complaints a shift against three strikes. Measured on this
// bench, `observer` takes ZERO complaints a shift — but that is not the good
// news it looks like, it is the instrument being wrong. `observer` dispatches
// only on a line from BEHAVIOUR_GUILTY, so it never confronts an innocent by
// construction: it cannot be harassed into a demotion because it never makes
// the mistake that causes one. `random` takes 7.5, but it reads nothing at all.
//
// Neither is a person. `reader` is: it does the same scan-switch-read loop as
// observer, and then, `slip` of the time that it has switched to a channel
// because something was flashing red and found nothing legible in the window,
// it goes anyway — because a red badge and no explanation is exactly the state
// a human walks into. Every one of those is a confrontation with an innocent
// and therefore a complaint. This is the bot the demotion economy has to be
// survivable for.
// ---------------------------------------------------------------- ROUND 10
// THE SAME MAN, WITH THE ROUND-10 BUTTON. `reader` walks at a flag it cannot
// explain, which is the mistake that produces every complaint in this game.
// `announcer` is the identical bot with the identical `slip` on the identical
// draw, except that what it does about the unexplained flag is KEY THE HANDSET
// at it from the desk rather than get up. That is precisely the play the desk
// button exists for — the client's "if he's viewing a camera and he says hey,
// excuse me, return that item" — so the pair prices it: same read, same
// impatience, two different things to do about it.
//
// It needs a bench that RENDERS to have a spot-monitor lock, and this one
// deliberately does not (see the prime note in run()). deskAim() therefore
// falls back to the highlighted row here, which is the man this bot has just
// selected — the same man the lock would be on in the real game, since
// selectTracked() drags one onto the other.
function announcer(ctx, opts) {
  const slip = opts.slip ?? 0.35;
  const rnd = opts.rnd;
  const tally = opts.tally;
  const base = observer(ctx, {
    ...opts,
    onPark(rows, game) {
      if (rnd() > slip) return false;
      const lit = rows.find((r) => r.flagged);
      if (!lit) return false;
      game.bot.select(lit.id);
      if (!game.bot.deskPA()) return false;
      if (tally) tally.keyed++;
      return true;
    },
  });
  return { name: 'announcer', desk: base.desk };
}

// THE OTHER HALF OF THE PRICE, AND IT IS THE HALF THE HUD HAS TO WARN ABOUT.
// `announcer` shouts at flags it CANNOT explain, which is the play the button
// is for. `tattle` shouts at the ones it CAN — a man whose row is already
// reading ITEM LEFT FRAME / NOT IN CART, i.e. a man DISPATCH is armed on. Same
// observer, same reads, same seed; the only difference is what it does at the
// moment it has been proved right. That is the exact configuration L.PA_COST
// prints on, so this is the measurement behind that line.
function tattle(ctx, opts) {
  const tally = opts.tally;
  const base = observer(ctx, {
    ...opts,
    onTell(row, game) {
      if (!game.bot.deskPA()) return false;
      if (tally) tally.keyed++;
      return true;
    },
  });
  return { name: 'tattle', desk: base.desk };
}

function reader(ctx, opts) {
  const slip = opts.slip ?? 0.35;
  const rnd = opts.rnd;
  // Identical to observer in every respect except what it does when a channel
  // is flashing red and the roster does not say why: `slip` of those, it goes
  // and has a look. Every one of those is a confrontation with an innocent and
  // therefore a complaint, which makes this the bot the demotion economy has to
  // be survivable for.
  const base = observer(ctx, {
    ...opts,
    onPark(rows, game) {
      if (rnd() > slip) return false;
      const lit = rows.find((r) => r.flagged);
      if (!lit) return false;
      game.bot.select(lit.id);
      return game.bot.dispatch();
    },
  });
  return { name: 'reader', desk: base.desk };
}

// THE MAN WHO STANDS ON THE DOOR. agents.js's one-exit design punishes camping
// by removing the crime; this measures whether that is true and what it costs.
// It never reads anything: it gets onto the floor by any means, walks to the
// exit, and stands there for the rest of the shift.
function camper(ctx, opts) {
  const { agents, input } = ctx;
  let fld = null, navRef = null;
  const exitAt = () => {
    const e = agents.exits && agents.exits[0];
    return e ? { x: e.x, z: e.z } : { x: EXIT.x, z: EXIT.z };
  };
  return {
    name: 'camper',
    desk(dt, game) {
      // Any row with a destination will do — he is not going to look at the
      // subject anyway, he just needs to be let out onto the floor.
      const row = game._g.desk.subjects.find((r) => r.post || r.aisle != null);
      if (!row) return;
      game.bot.selectCam(row.cam);
      game.bot.select(row.id);
      game.bot.dispatch();
    },
    // Walk to the way out on agents' OWN steering, and this took two wrong
    // turns worth writing down. Descending agents.toExit() by sampling a ring
    // around the cop wedges at 29 route metres: that field is priced over the
    // colliders too, so it has local minima against a gondola end. Swapping it
    // for a clean flood from the door fixes the minima and still wedges — at
    // (17.0, -12.4), pushing -X into a shelf forever — because a ring sample at
    // 1.4 m reads a cell on the far side of a collider the cop cannot walk
    // through. The field says go left; the wall says no.
    //
    // nav.steer() is the function that already knows this. It string-pulls to
    // the furthest VISIBLE point on the route, which is the whole difference
    // between a direction that is downhill and one that is walkable.
    floor(dt, game) {
      const cop = agents.cop.position;
      const goal = exitAt();
      const nav = agents.nav;
      if (nav && (!fld || navRef !== nav)) {
        try { fld = nav.field(goal.x, goal.z); navRef = nav; }
        catch { fld = null; }
      }
      const here = (fld && nav) ? nav.at(fld, cop.x, cop.z) : d2(cop.x, cop.z, goal.x, goal.z);
      if (!isFinite(here) || here < 1.3) {           // posted. Do nothing at all.
        input.x = 0; input.z = 0; input.sprint = false;
        if (opts.trace) opts.trace.push([+cop.x.toFixed(1), +cop.z.toFixed(1), +here.toFixed(1), 0, 0]);
        return;
      }
      let dx = goal.x - cop.x, dz = goal.z - cop.z;
      if (fld && nav && nav.steer) {
        const d = nav.steer(fld, cop.x, cop.z, { look: 6.0 });
        if (d) { dx = d.tx - cop.x; dz = d.tz - cop.z; }
      }
      const m = Math.hypot(dx, dz) || 1;
      input.x = dx / m; input.z = -(dz / m);
      input.sprint = false;
      if (opts.trace) opts.trace.push([+cop.x.toFixed(1), +cop.z.toFixed(1), +here.toFixed(1), input.x, input.z]);
      void game;
    },
  };
}

const POLICIES = { observer, reader, announcer, tattle, random, camper, idle };

// ===========================================================================
// ROUND 16 — run() IS REPRODUCIBLE, AND THE PRECONDITION IS ZERO FRAMES
// ===========================================================================
// Round 15 recovered a determinism here and built a control on it: after a page
// reload with a fixed seed order, two pools of run() come back byte-identical,
// which is what let it prove a HUD edit was game-neutral. That is real and it
// reproduced 5/5. IT ALSO HAS A PRECONDITION NOBODY WROTE DOWN, and the
// precondition is easy to break by accident:
//
//     simulation frames stepped        observer   thieves / caught / points
//     since page load
//     ---------------------------      --------   -------------------------
//     none                                        4 / 3 / 495
//     step(0)      <- WHAT snap() DOES            3 / 3 / 374
//     step(1/60)                                  4 / 4 / 482
//     run(0.5)                                    4 / 4 / 482
//
// ONE SCREENSHOT BEFORE A BENCH MOVES EVERY NUMBER IN IT. The mechanism is the
// one game.js's COLD table already names: agents seeds its RNG once at module
// init and agents.reset() does not reseed, so the agents stream carries over
// from whatever ran before. Patching Math.random above pins the GAME side and
// leaves that stream alone — deliberately, see the mulberry32 note — which is
// why "same seed" is not the same thing as "same run" unless the page is fresh.
//
// So: TAKE YOUR CAPTURES AFTER YOUR BENCHES, OR RELOAD BETWEEN THEM. It
// survives at all in a browser pane because rAF is frozen there (one tick in
// three seconds even fronted); on a fronted tab it would not.
//
// ROUND 16 USED THIS AND IT HELD. Two 4x240 s observer pools at seed 7717, on
// two fresh page loads with nothing stepped before either, across a layout
// change to hud.js:
//
//     _strings           218,924   218,924
//     _plates            125,570   125,570
//     _platesTranslucent 594,308   594,308
//     _overprints             12         0
//     _erasures               68         0
//
// The first three being byte-identical is the control: the same HUD was drawn
// on the same frames with the same elements, so the last two moved because the
// POSITIONS changed and nothing else did. A denominator that reproduces to the
// unit is worth more than any claim about the numerator.
//
// The stronger control still available, from round 15 and not bettered here:
// `census:false` removes the entire HUD draw path in one run and every one of
// 6,851 chars of game-side state comes back byte-identical — which makes HUD
// game-neutrality STRUCTURAL rather than empirical, since hud.js contains zero
// Math.random calls.
// ------------------------------------------------------------------- the shift
export async function run(ctx, opts = {}) {
  const { game, agents } = ctx;
  const shifts = opts.shifts ?? 6;
  const seconds = opts.seconds ?? 240;
  const dt = 1 / 60;
  const names = opts.policies || ['observer', 'random'];
  // ---- THE WALL PRIME, DELETED IN ROUND 10 --------------------------------
  // This used to be `if (ctx.step) ctx.step(0);` — one real frame through
  // main.js's test surface before the first shift. cctv.channelsFor() projects
  // through the channel cameras, a three.js camera only gets its world matrix
  // when something RENDERS through it, and this bench never renders the wall.
  // In a backgrounded tab, which is where every agent runs, rAF never renders
  // it either. So the round-6 census reported every subject on zero channels,
  // an empty roster, and an observer that dispatched 0 times in 10 shift-
  // minutes. Nothing was wrong with the game; the wall had never been asked to
  // look.
  //
  // It was reported to cctv at the time as something that should not need a
  // render, and cctv fixed it at the root: the cameras get
  // updateMatrixWorld(true) at construction and channelsFor() refreshes them
  // unconditionally on every call.
  //
  // MEASURED BEFORE DELETING, because "they say it is fixed" is not a
  // measurement and a prime that is quietly load-bearing would take the roster
  // down with it. A SECOND cctv was built with createCCTV() against the same
  // scene and never rendered through — genuinely cold cameras, not merely a
  // paused page — and asked for the channels of eight live subjects:
  //
  //     live wall   [] [4] [1] [4] [4] [1] [2] [3]
  //     cold wall   [] [4] [1] [4] [4] [1] [2] [3]
  //
  // Identical, line-of-sight tests and all, 7 of 8 subjects on a channel. It
  // bought the wall nothing, so it is gone.
  //
  // IT DID BUY ONE THING AND IT IS NOT A FEATURE: agents.js seeds its RNG once
  // at module init and agents.reset() does NOT reseed, so that one extra
  // agents.update() moved the agents stream by however many draws it took, and
  // every bench number after it moved with it. That is why `prime` survives as
  // an option rather than as code — it is the only way to line a round-10 bench
  // up against a round-9 one draw for draw. It is off by default because a
  // bench that has to render a frame to be correct is a bench that is lying
  // about what it measures.
  if (opts.prime && ctx.step) { try { ctx.step(0); } catch { /* no bootstrap */ } }
  const fixWas = { ...game.bot.FIX };
  if (opts.fix) Object.assign(game.bot.FIX, opts.fix);
  // ---- ROUND 13: agents.js's OWN sweep lever, driven from this bench -------
  // `agents.override` is documented there as "set a key, run, delete the key",
  // and it is `OVR[k] ?? T[k] ?? fallback` at every read site — so this is an
  // ablation of a shipped constant and not a shadow of it. Restored in the same
  // shape as `fixWas` below, including keys that were absent, so a bench that
  // sweeps cannot leave the next one measuring a different game.
  const ovrKeys = Object.keys(opts.agentsOverride || {});
  const ovrWas = {};
  for (const k of ovrKeys) ovrWas[k] = agents.override[k];
  if (ovrKeys.length) Object.assign(agents.override, opts.agentsOverride);

  const out = {};
  for (const name of names) {
    const agg = {
      policy: name, shifts, seconds, thieves: 0, caught: 0, escaped: 0,
      complaints: 0, demotions: 0, points: 0, dispatches: 0, deadZone: 0,
      holds: 0, floorTime: 0, deskTime: 0, wuTime: 0,
      stallEscape: 0, stallPutBack: 0,
      // ROUND 6 pacing census. `liveT[n]` is seconds of shift with exactly n
      // ANNOUNCED, UNRESOLVED incidents on the board — the thing the client was
      // describing when he said one at a time. A thief whose tell has not fired
      // yet is not an incident; he is a shopper.
      liveT: [0, 0, 0, 0, 0, 0],
      hChase: 0, hDialogue: 0, hSubj: 0, hZone: 0, hBlocked: 0, hRepeat: 0, hPeople: 0,
      leaves: 0, aborts: 0, balks: 0, dumps: 0,
      // ROUND 10. `annKeyed` is announcements the player made; the other four
      // are BODIES that reacted, which is a bigger number on purpose — a PA is
      // a loudspeaker and everybody in earshot answers it.
      annKeyed: 0, anns: 0, annHeed: 0, annShrug: 0, annBolt: 0,
    };
    let windows = [], cases = [], annRows = [], lineRows = [];
    // ROUND 12 — WHAT THE PLAYER WAS TOLD, counted over the same shift seconds
    // as everything else on this object. agents.bench() measures the bot's
    // information; nothing measured this file's, which is how the two came to
    // differ by eleven points of catch rate for eleven rounds without a single
    // published number noticing. Reset per policy so the rows are comparable.
    if (game.bot.sightLedgerReset) game.bot.sightLedgerReset();
    const census = { _frames: 0, _desk: 0, _floor: 0 };
    const stateC = { deskT: 0, alarmT: 0, hardT: 0, softT: 0, pipT: 0, flagT: 0, blinkT: 0, blinkTiles: 0 };
    for (let k = 0; k < shifts; k++) {
      const seed = (opts.seed ?? 7717) + k * 104729;
      const r = await shift(ctx, name, { ...opts, seed, seconds, dt });
      for (const key of Object.keys(agg)) {
        if (typeof agg[key] === 'number' && key in r) agg[key] += r[key];
      }
      for (let n = 0; n < agg.liveT.length; n++) agg.liveT[n] += r.liveT[n] || 0;
      // ROUND 15: numbers pool by addition, everything else by first-wins. The
      // census carries one string now (`_overprintWorst`, see hud.js's INK
      // LEDGER) and `(undefined || 0) + aString` pools to "0[object Object]"-
      // shaped junk without erroring — the exact silent-corruption shape this
      // project keeps retiring metrics over.
      for (const k of Object.keys(r.census || {})) {
        const v = r.census[k];
        if (k === '_overprintWorst' || k === '_worstPx') continue;   // worst-of, below
        if (k === '_eraseWorst' || k === '_erasePct') continue;      // ROUND 16, same
        // ROUND 21 — AND THE CLASS, RATHER THAN A THIRD SPECIAL CASE. Round 20
        // wrote `_subjNearWorst` per frame and it landed in the additive branch
        // below, so a pooled bench reported a SUM OF WORSTS. `_overprintWorst`
        // and `_eraseWorst` are hand-written exceptions two lines up and this
        // one "was not added beside them" — which is what a list of exceptions
        // does every time somebody adds a member. A NUMERIC key whose name ends
        // in `Worst` is a maximum by construction, in both of this file's two
        // pooling loops, and the next one costs nobody a decision.
        if (isWorstNum(k, v)) {
          if (census[k] == null || v > census[k]) census[k] = v;
          continue;
        }
        if (typeof v === 'number') census[k] = (census[k] || 0) + v;
        else if (v != null && census[k] == null) census[k] = v;
      }
      if (r.census && r.census._overprintWorst != null
        && (census._worstPx == null || r.census._worstPx > census._worstPx)) {
        census._worstPx = r.census._worstPx;
        census._overprintWorst = r.census._overprintWorst;
      }
      // ROUND 16 — the PLATE ledger's worst-of, pooled the same way. `_erasePct`
      // is a NUMBER and would otherwise have summed to a nonsense percentage
      // across shifts, which is the same silent-corruption shape the comment
      // above is about, one field along.
      if (r.census && r.census._eraseWorst != null
        && (census._erasePct == null || r.census._erasePct > census._erasePct)) {
        census._erasePct = r.census._erasePct;
        census._eraseWorst = r.census._eraseWorst;
      }
      for (const k of Object.keys(r.stateC || {})) stateC[k] = (stateC[k] || 0) + r.stateC[k];
      windows = windows.concat(r.windows);
      cases = cases.concat(r.cases);
      annRows = annRows.concat(r.annLedger || []);
      lineRows = lineRows.concat(r.lineLedger || []);
    }
    // ---- ROUND 9: HOW MUCH OF THE TIME IS EACH THING ON SCREEN --------------
    // `census` is a real frame drawn every CENSUS_EVERY steps with hud.js's
    // mark() calls recording — see hud.sample(). The percentages are OF THE
    // MODE THE ELEMENT LIVES IN, not of the whole shift: a floor panel that is
    // up for every second of every chase should read 100, because the question
    // "is this always on" is asked about the screen it is on. `_deskPct` and
    // `_floorPct` say how much of the shift each screen was up in the first
    // place, so the two can be composed when that is what you want.
    if (census._frames) {
      const pct = (n, of) => +(100 * (n || 0) / Math.max(1, of)).toFixed(1);
      const c = { _frames: census._frames, _deskPct: pct(census._desk, census._frames),
        _floorPct: pct(census._floor, census._frames),
        // ROUND 15 — hud.js's INK LEDGER, pooled over every census frame of
        // every shift. `_overprints` is the number of drawn-string collisions
        // and it MUST BE 0: the round-14 FOOTSTEPS banner printed the word NOT
        // underneath BY on 3.7% of floor frames and nothing in the repo noticed.
        // `_strings` is the denominator so a zero can be told from an instrument
        // that never ran.
        _strings: census._strings || 0,
        _overprints: census._overprints || 0,
        // Collisions where one of the two is drawn under alpha 0.2 — the CRT
        // burn-in ghost, by design. Reported, never pooled into the line above,
        // because a check that silently drops a category is the failure mode
        // that follows a check that cries wolf.
        _overprintsGhosted: census._overprintsGhosted || 0,
        _overprintWorst: census._overprintWorst || null,
        _overprintWorstPx: census._worstPx || 0,
        // ROUND 16 — hud.js's PLATE LEDGER. `_erasures` is the number of drawn
        // strings a LATER opaque fill painted over, which is the mechanism that
        // actually removes words from this HUD; `_overprints` above cannot see
        // one of them because an eraser is a fillRect and not a second string.
        // `_plates` is the denominator (fills at effective alpha >= 0.5) and
        // `_platesTranslucent` counts the ones filtered out, so the alpha rule
        // is auditable instead of silent — a naive globalAlpha test puts the
        // whole of _platesTranslucent in the numerator and the four real
        // erasers in the denominator.
        _plates: census._plates || 0,
        _platesTranslucent: census._platesTranslucent || 0,
        _erasures: census._erasures || 0,
        _eraseNear: census._eraseNear || 0,
        _eraseNearSites: Object.keys(census).filter((k) => k.slice(0, 5) === 'ERZN ')
          .sort((a, b) => census[b] - census[a]).map((k) => `${census[k]}x  ${k.slice(5)}`),
        _eraseWorst: census._eraseWorst || null,
        _eraseWorstPct: census._erasePct || 0,
        // The class tally. 94 erasures naming three painting sites is a fix;
        // 94 erasures naming a number is a complaint.
        _eraseSites: Object.keys(census).filter((k) => k.slice(0, 4) === 'ERZ ')
          .sort((a, b) => census[b] - census[a])
          .map((k) => `${census[k]}x  ${k.slice(4)}`),
        // ===================================================================
        // ROUND 21 — THE SUBJECT LEDGER HAD NEVER REACHED A REPORT EITHER
        // ===================================================================
        // The loop below builds the mark tally and its first line is
        // `if (k[0] === '_') continue`. Every key hud.sample() writes about the
        // SUBJECT starts with `_` — `_subjOn`, `_subjCovSum`, `_subjHit`,
        // `_subjPanelCovSum`, `_subjNearWorst` — and not one of them is in the
        // literal above, so round 17's subject-coverage instrument has been
        // pooled correctly across two loops and then dropped on the floor at the
        // last step, for four rounds. Round 20's `_subjNearWorst` was being
        // SUMMED into a report that never printed it.
        //
        // That is the same shape as round 20's guard with no caller, one stage
        // later: a measurement that runs, pools, and is never published. Wiring
        // the guard to hud.sample() is only half a fix if the census key it
        // writes stops here.
        //
        // `_subjOn` is the denominator and is reported first for the reason the
        // ink ledger's `_strings` is: a zero has to be distinguishable from an
        // instrument that never had a frame it could speak about.
        _subjOn: census._subjOn || 0,
        _subjCovPct: pct(100 * (census._subjCovSum || 0), 100 * (census._subjOn || 0)),
        _subjHit: census._subjHit || 0,
        _subjPanelCovPct: pct(100 * (census._subjPanelCovSum || 0), 100 * (census._subjOn || 0)),
        _subjNear: census._subjNear || 0,
        _subjNearCovPct: pct(100 * (census._subjNearCovSum || 0), 100 * (census._subjNear || 0)),
        _subjNearHit: census._subjNearHit || 0,
        // A MAXIMUM, pooled by isWorstNum above. It was an addition in round 20.
        _subjNearWorstPct: +(100 * (census._subjNearWorst || 0)).toFixed(1),
        _subjOff: census._subjOff || 0,
        // ---- AND THE GUARD, WHICH NOW HAS A CALLER ------------------------
        // `_subjGuard` is the population: the census frames the guard actually
        // ran on. `_subjGuardFail` and `_bandGuardFail` MUST BE 0 — each is a
        // frame where the shipped layout stood on more of the man than the
        // layout it replaced would have. `_subjGuardSeparable` is the subset of
        // frames where the two layouts could differ at all, so a zero failure
        // count can be told from a guard that never had a frame to speak on.
        _subjGuard: census._subjGuard || 0,
        _subjGuardSeparable: census._subjGuardSeparable || 0,
        _subjGuardFail: census._subjGuardFail || 0,
        _subjGuardWorst: census._subjGuardWorst || null,
        _subjGuardDeltaWorst: census._subjGuardDeltaWorst || 0,
        _bandGuardSeparable: census._bandGuardSeparable || 0,
        _bandGuardFail: census._bandGuardFail || 0,
        _bandGuardWorst: census._bandGuardWorst || null };
      const DESK = new Set(['officer', 'roster', 'rosterEmpty', 'dispatch', 'dispatchArmed',
        'dispatchIdle', 'deskKeyHint', 'paBtn', 'pipTiles', 'pipFresh', 'bandRow2', 'rowRunning',
        // ROUND 10: `rowPA` is an announcement's reaction on a roster row and
        // `paCost` is the flagged-row price on the line the legend vacated.
        // Both are desk-only and both are supposed to read near zero on a bot
        // that never keys the handset — see the announcer policy.
        'rowPA', 'paCost', 'rowWhere',
        'alarm', 'alarmHard', 'alarmSoft']);
      const FLOOR = new Set(['dispatched', 'pursuit', 'backBanner',
        // ROUND 16: frames where the door race is out of reach on every door
        // and the panel has handed the emphasis to GAP. Read against `pursuit`
        // — noCut/pursuit is the fraction of a chase spent looking at a race
        // that had already been decided, which is the quantity the design
        // complaint was about ("over as information before it was over as
        // gameplay"). It should be LARGE; that is the finding, not a defect.
        'pursuitNoCut', 'wind', 'pulse', 'gassedFrame',
        'record', 'prompt', 'backOff', 'dialogue', 'stamp', 'paPanel', 'paIdle', 'pan', 'floorKeyHint',
        // ROUND 14: `heard` is the blind-bolt cue. It is a floor element and it
        // should read LOW — it fires on the bolts the sight model cannot see,
        // which is a minority of them, and a large number here means it has
        // stopped being an exception.
        'heard',
        // ROUND 12: the intercept aid. TWO numbers matter and they pull in
        // opposite directions, which is why both are reported rather than one.
        //
        //   cutPath / pursuit    should be HIGH. The aid exists for chases and
        //                        an aid that is absent during them is written,
        //                        not shipped.
        //   cutPath x _floorPct  is the anti-clutter number, and it is the one
        //                        round 9 was about: the alarm plate it deleted
        //                        censused at 41% of an IDLE shift. This must
        //                        stay near the fraction of a shift that IS a
        //                        chase, because the element is nulled by
        //                        game.js the frame a case closes.
        //
        // `cutTurn` is the subset of those frames where the route was NOT in
        // front of the camera and the aid fell back to one arrow at the cop's
        // feet. It is reported separately because it is a measurement of the
        // CHASE, not of the HUD: a large number means most chases are decided
        // behind the player, which is exactly the complaint the round is about.
        // ...and the reason column. The identity to check is
        //     cutPath + cutBlind + cutLate + cutCold  ==  pursuit
        // — every chase frame is accounted for by exactly one of them.
        'cutPath', 'cutTurn', 'cutBlind', 'cutLate', 'cutCold',
        'brackets', 'doorTags', 'floorAlarm']);
      for (const k of Object.keys(census)) {
        if (k[0] === '_' || k === 'pipTiles'
          || k.slice(0, 4) === 'ERZ ' || k.slice(0, 5) === 'ERZN ') continue;
        const of = DESK.has(k) ? census._desk : FLOOR.has(k) ? census._floor : census._frames;
        c[k] = pct(census[k], of);
      }
      // Average number of monitors carrying a red flag pip at any instant. A
      // pointer that names six tiles at once names none — round 6 measured
      // exactly that, and this is the number that keeps it honest.
      c.pipsPerFrame = +((census.pipTiles || 0) / Math.max(1, census._desk)).toFixed(2);
      agg.census = c;
    }
    // State census — see stateC. Percentages of the WHOLE shift for the alarm
    // (it was drawn at the desk and the desk is where it was read) and of desk
    // time for the pips.
    {
      const tot = shifts * seconds;
      agg.alarmPct = +(100 * stateC.alarmT / tot).toFixed(1);
      agg.alarmHardPct = +(100 * stateC.hardT / tot).toFixed(1);
      agg.alarmSoftPct = +(100 * stateC.softT / tot).toFixed(1);
      agg.pipsPerDeskFrame = +(stateC.pipT / Math.max(0.001, stateC.deskT)).toFixed(2);
      agg.anyPipPct = +(100 * stateC.flagT / Math.max(0.001, stateC.deskT)).toFixed(1);
      // ...and how much of that is MOVING. A still pip is a marker; a blinking
      // one is a demand. Round 9 spends the blink only on a brand-new flag.
      agg.blinkPct = +(100 * stateC.blinkT / Math.max(0.001, stateC.deskT)).toFixed(1);
      agg.blinkPerFrame = +(stateC.blinkTiles / Math.max(0.001, stateC.deskT)).toFixed(2);
    }
    agg.windowMedian = med(windows);
    agg.windowP10 = q(windows, 0.10);
    // How long an incident LASTS, tell to resolution, whether he is caught or
    // walks. "It should take a minute" is a claim about this number and no other.
    agg.caseMedian = med(cases);
    agg.caseP90 = q(cases, 0.90);
    const resolved = agg.caught + agg.escaped;
    const mins = (shifts * seconds) / 60;
    agg.catchRate = resolved ? +(100 * agg.caught / resolved).toFixed(1) : null;
    agg.complaintsPerMin = +(agg.complaints / mins).toFixed(2);
    agg.lossesPerMin = +(agg.escaped / mins).toFixed(2);
    agg.demotionsPerShift = +(agg.demotions / shifts).toFixed(2);
    agg.deadZoneRate = resolved ? +(100 * agg.deadZone / resolved).toFixed(1) : null;
    agg.pointsPerShift = Math.round(agg.points / shifts);
    agg.incidentsPerMin = +(agg.thieves / mins).toFixed(2);
    const tot = agg.liveT.reduce((a, b) => a + b, 0) || 1;
    agg.quietPct = +(100 * agg.liveT[0] / tot).toFixed(1);
    agg.soloPct = +(100 * agg.liveT[1] / tot).toFixed(1);
    agg.overlapPct = +(100 * (tot - agg.liveT[0] - agg.liveT[1]) / tot).toFixed(1);
    agg.catchPerShift = +(agg.caught / shifts).toFixed(2);
    agg.complaintsPerShift = +(agg.complaints / shifts).toFixed(2);
    agg.repeatsPerShift = +(agg.hRepeat / shifts).toFixed(2);
    agg.abortsPerShift = +(agg.aborts / shifts).toFixed(2);
    agg.leavesPerShift = +(agg.leaves / shifts).toFixed(2);
    // The sight model, on this policy's own frames.
    if (game.bot.sightLedger) {
      const sl = game.bot.sightLedger();
      agg.sight = sl;
      // Same contract as agents' lungBroken/paceBroken: null when the model
      // holds, and the reason when it does not. A points total measured while
      // the HUD was leaking ground truth is describing a different game, and it
      // has to say so on its own object rather than be quoted.
      agg.sightBroken = sl.sightCheck.ok ? null : sl.sightCheck;
    }
    // ---- ROUND 13: IS "HE LEFT RIGHT AFTER THE PA" A TELL? ----------------
    // annHuff is an innocent-only cut to the remaining shop, so the falsifiable
    // claim is that the two populations turn for the door at different times
    // after an announcement. Reported as a likelihood ratio on the thing a
    // player can actually see — "did he turn inside `annWatch` seconds" —
    // rather than as a median, because a median of two right-skewed
    // distributions with different censoring is not a tell, it is a summary.
    // Rows where the body was ALREADY leaving when the PA landed are dropped:
    // he was not answering the announcement, he was already on his way out.
    agg.ann = annSplit(annRows, opts.annWatch ?? 20);
    agg.annRows = opts.keepAnnRows ? annRows : undefined;
    // ---- ROUND 13: AND THE SAME QUESTION ASKED OF THE ROSTER TEXT ----------
    agg.lines = lineSplit(lineRows);
    out[name] = agg;
  }
  Object.assign(game.bot.FIX, fixWas);
  for (const k of ovrKeys) {
    if (ovrWas[k] === undefined) delete agents.override[k];
    else agents.override[k] = ovrWas[k];
  }
  if (ovrKeys.length) out._agentsOverride = { ...opts.agentsOverride };
  return out;
}

// ===========================================================================
// ROUND 13 — annSplit: THE LIKELIHOOD RATIO OF AN ANNOUNCEMENT'S AFTERMATH
// ===========================================================================
// `rows` are annLedger rows pooled over shifts. The split is on `guilty` AS
// RECORDED AT THE ANNOUNCEMENT — a field nothing in agents.js or game.js reads
// to decide any of this — so it is the same shape as the put-back likelihood
// ratio the character rounds publish: a flag the sim cannot see, used only to
// bucket outcomes after the fact.
function annSplit(rows, watch) {
  const use = rows.filter((p) => !p.leaving);
  const grp = (g) => use.filter((p) => !!p.guilty === g);
  const cell = (a) => {
    const turned = a.filter((p) => p.toLeave != null && p.toLeave <= watch).length;
    const times = a.filter((p) => p.toLeave != null).map((p) => p.toLeave);
    return {
      n: a.length,
      turnedIn: turned,
      pct: a.length ? +(100 * turned / a.length).toFixed(1) : null,
      median: med(times),
      p90: q(times, 0.90),
      // A row that never turned inside the shift. Reported, because censoring
      // that differs by population would make the medians above incomparable.
      censored: a.length - times.length,
    };
  };
  const inn = cell(grp(false));
  const gui = cell(grp(true));
  // LR for GUILT of the observation "he turned for the door inside `watch`".
  // 1.00 = the observation is worth nothing, which is the target.
  const lr = (inn.pct && gui.pct != null) ? +(gui.pct / inn.pct).toFixed(2) : null;
  // ...and of the complement, which is the half a player would actually act on:
  // "he did NOT turn" is the cheap suspicion.
  const lrNot = (inn.pct != null && inn.pct < 100 && gui.pct != null)
    ? +((100 - gui.pct) / (100 - inn.pct)).toFixed(2) : null;
  return { watch, innocent: inn, guilty: gui, lrTurned: lr, lrStayed: lrNot,
    dropped: rows.length - use.length };
}

async function shift(ctx, policyName, opts) {
  const { game, agents, input } = ctx;
  const dt = opts.dt;
  const steps = Math.round(opts.seconds / dt);
  const realRandom = Math.random;
  const rnd = mulberry32(opts.seed);
  Math.random = rnd;

  // A policy may declare that it does not have a floor skill; see random().
  const skills = { random: { backOff: false } }[policyName] || {};
  const drive = makeDriver(ctx, { ...opts, ...skills });
  const tally = { keyed: 0 };
  const bot = POLICIES[policyName](ctx, { ...opts, rnd, tally });

  agents.reset();
  game._restart();
  game._g.dbg.stallEscape = 0; game._g.dbg.stallPutBack = 0; game._g.dbg.blocked = 0;
  game._g.dbg.reharass = 0; game._g.dbg.subjects.clear();
  for (const k of Object.keys(game._g.dbg.harass)) game._g.dbg.harass[k] = 0;

  const r = {
    thieves: 0, caught: 0, escaped: 0, complaints: 0, demotions: 0, points: 0,
    dispatches: 0, deadZone: 0, holds: 0, floorTime: 0, deskTime: 0, wuTime: 0,
    hChase: 0, hDialogue: 0, hSubj: 0, hZone: 0, hBlocked: 0, hRepeat: 0, hPeople: 0,
    leaves: 0, aborts: 0, balks: 0, dumps: 0,
    annKeyed: 0, anns: 0, annHeed: 0, annShrug: 0, annBolt: 0,
    windows: [],            // seconds from the concealment tell to the door
    cases: [],              // ...to the door OR the cuffs. How long one takes.
    // ---- ROUND 13: WHAT AN ANNOUNCEMENT DOES TO THE CLOCK, BY POPULATION ---
    // agents.js's annHuff shortens the REMAINING SHOP of an innocent who has
    // just been shouted at, and does nothing to a guilty man. It is the only
    // surviving `s.guilty` branch in that file that changes how long a body
    // stays in the building, so "he headed for the door right after the PA" is
    // a candidate tell and had never been measured. One row per body that
    // answered an announcement: when it was, what he was, and how long after it
    // he turned for the door. `guilty` is recorded AT THE ANNOUNCEMENT and is
    // never read by anything that decides an outcome.
    annLedger: [],
    // ---- ROUND 13: THE ROSTER TEXT, AS A CLASSIFIER ------------------------
    // One row per BEHAVIOUR LINE THE TERMINAL ACTUALLY PRINTED — not per frame,
    // which would weight a line by how long it happened to sit on the screen —
    // tagged with what the body was at the moment it was printed. The tag is
    // never read by anything that picks a line. This is the desk-phase twin of
    // the walk-up probe: the roster is the screen this game asks you to read,
    // so a string that only ever appears above one population is a free
    // classifier that does not even cost a walk down the aisle.
    lineLedger: [],
    liveT: [0, 0, 0, 0, 0, 0],
    census: null,
  };
  // ROUND 9. Draw one real frame every CENSUS_EVERY steps and record which
  // elements painted. 10 Hz is enough for a duty cycle and cheap enough that
  // the bench does not become a rendering benchmark; the alarm bar's own
  // 0.9 s flash period is nine samples wide at this rate.
  const CENSUS_EVERY = 6;
  const census = opts.census === false ? null : { _frames: 0, _desk: 0, _floor: 0 };
  // ---- AND A SECOND CENSUS THAT DOES NOT NEED THE HUD ---------------------
  // The draw census above can only measure the HUD that is in the tree. Two of
  // this round's claims are about elements that were DELETED, so they have to
  // be measurable from GAME STATE or the before-and-after cannot be run on one
  // build of the world. Both of these read the same fields the drawing code
  // reads and neither one depends on a mark() existing:
  //   alarmT   seconds with an alarm raised, split hard (a countdown, i.e. a
  //            man in the doorway) and soft (everything else that used to
  //            reach the bar). Sampled EVERY step, so it is exact.
  //   pipT     monitors carrying a red flag pip, summed over desk steps. A
  //            pointer that names two of nine tiles at once is not a pointer.
  const stateC = { deskT: 0, alarmT: 0, hardT: 0, softT: 0, pipT: 0, flagT: 0, blinkT: 0, blinkTiles: 0 };
  // A thief counts as dead-zoned when he resolves having spent time on a cross
  // aisle with an untouched analytics flag — i.e. the terminal saw him and the
  // player had no legal move. Tracked per shopper id.
  const seen = new Map();
  // ROUND 13. Announcement rows still waiting for the body to turn for the door.
  const annPend = [];
  // ROUND 13. Last behaviour line seen per subject, so the ledger below records
  // one row per PRINTED LINE instead of one per frame.
  const lastLine = new Map();

  const gapi = game.api;
  const api = {
    get mode() { return gapi.mode; },
    get aisle() { return gapi.aisle; },
    get frozen() { return gapi.frozen; },
    onBolt(s) { gapi.onBolt(s); },
    onCatch(s) { r.caught++; closeOut(s, false); gapi.onCatch(s); },
    onEscape(s) { r.escaped++; closeOut(s, true); gapi.onEscape(s); },
    // ROUND 7: a complaint no longer lands inside this callback. onHarass() now
    // only OPENS a confrontation; whether it becomes a form is decided up to
    // 1.6 s later in settleHarass(), by which time nothing is calling us. So the
    // count comes off the scoreboard in the step loop instead — see `filed`.
    onHarass(s) { gapi.onHarass(s); },
    report(t) { gapi.report(t); },
    // ROUND 7's two additive callbacks. A leaver is a customer who finished his
    // shop, not a loss; an abort is a theft that did not happen because the
    // player was stood on the door. Both are counted here because a shift with
    // no income has to be distinguishable from a shift where nothing works.
    onLeave(s) { r.leaves++; gapi.onLeave && gapi.onLeave(s); },
    onAbort(s, why) {
      r.aborts++;
      if (why === 'dump') r.dumps++; else r.balks++;
      gapi.onAbort && gapi.onAbort(s, why);
    },
    // ---- ROUND 10: THIS CALLBACK WAS NOT FORWARDED AT ALL -----------------
    // agents has fired onAnnounce since round 7 and this api never had it, so
    // every announcement made on this bench went out with its entire
    // presentation dead — no chip, no roster line, no ticker — and the round-8
    // and round-9 benches could not have caught a mislabelled outcome if they
    // had tried. Same species as the wall that had never been asked to look.
    onAnnounce(s, kind, outcome) {
      r.anns++;
      if (outcome === 'heed') r.annHeed++;
      else if (outcome === 'shrug') r.annShrug++;
      else if (outcome === 'bolt') r.annBolt++;
      // ROUND 13. One row per body that answered, opened here and closed in the
      // step loop when he turns for the door. `leaving` is the shopper flag the
      // shop timer sets; it is what a player watching the aisle actually sees
      // first, before the body is anywhere near the doors.
      annPend.push({ id: s.id, t: clock, kind, outcome,
        guilty: !!s.guilty, stole: !!s.stole, leaving: !!s.leaving });
      gapi.onAnnounce && gapi.onAnnounce(s, kind, outcome);
    },
  };
  // On an escape the elapsed time IS the window: tell on the wall to body
  // through the doors. That is the number the whole desk phase is played inside.
  function closeOut(s, escaped) {
    r.thieves++;
    const m = seen.get(s.id);
    if (m && m.dead) r.deadZone++;
    if (m && m.tellAt != null) {
      const len = +(clock - m.tellAt).toFixed(2);
      r.cases.push(len);
      if (escaped) r.windows.push(len);
    }
    seen.delete(s.id);
  }

  let wasHeld = null;
  let clock = 0;
  let prevComplaints = game.st.complaints;
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
      (bot.floor || drive)(dt, game);
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
    {
      const al = game._g.alarm;
      if (al) { stateC.alarmT += dt; if (al.count != null) stateC.hardT += dt; else stateC.softT += dt; }
      if (game.st.mode === 'desk') {
        stateC.deskT += dt;
        const lit = new Set(); const nw = new Set();
        for (const row of game._g.desk.subjects) {
          if (row.flagged && row.primary !== false) { lit.add(row.cam); if (row.fresh) nw.add(row.cam); }
        }
        stateC.pipT += lit.size * dt;
        stateC.flagT += (lit.size ? dt : 0);
        stateC.blinkT += (nw.size ? dt : 0);
        stateC.blinkTiles += nw.size * dt;
      }
    }
    if (census && game.hud.sample && (i % CENSUS_EVERY) === 0) {
      census._frames++;
      if (game.st.mode === 'desk') census._desk++;
      else if (game.st.mode === 'floor') census._floor++;
      const c = game.hud.sample(game._g);
      // ROUND 15: numbers add, strings keep the FIRST. `_overprintWorst` (see
      // hud.js's INK LEDGER) is a string, and `(undefined || 0) + aString`
      // concatenates silently — the first run of this instrument pooled ten
      // examples into one unreadable line and lost the "worst" it was named for.
      // Worst-of across frames cannot be done by addition; it is picked below.
      for (const k of Object.keys(c)) {
        const v = c[k];
        // ROUND 16: `_erasePct` is a worst-of and a NUMBER, so the additive
        // branch swallowed it and the first reading of this instrument published
        // a worst single-string coverage of 2382.4% — 68 erasures' percentages
        // summed. The same trap the round-15 comment above is about, one field
        // along, and it took a pooling loop this file has TWO copies of: the
        // cross-shift one was fixed and this one was not. Both now skip.
        if (k === '_overprintWorst' || k === '_worstPx') continue;
        if (k === '_eraseWorst' || k === '_erasePct') continue;
        if (isWorstNum(k, v)) {          // ROUND 21, see the cross-shift pooler
          if (census[k] == null || v > census[k]) census[k] = v;
          continue;
        }
        if (typeof v === 'number') census[k] = (census[k] || 0) + v;
        else if (v != null && census[k] == null) census[k] = v;
      }
      if (c._overprintWorst != null
        && (census._worstPx == null || c._worstPx > census._worstPx)) {
        census._worstPx = c._worstPx; census._overprintWorst = c._overprintWorst;
      }
      if (c._eraseWorst != null
        && (census._erasePct == null || c._erasePct > census._erasePct)) {
        census._erasePct = c._erasePct; census._eraseWorst = c._eraseWorst;
      }
    }
    // Count filed complaints off st.complaints. It only ever rises, except at a
    // demotion which resets it to zero — that is a fall, so it is ignored here
    // and the demotion itself is counted in the 'demoted' branch above.
    const filed = game.st.complaints - prevComplaints;
    if (filed > 0) r.complaints += filed;
    prevComplaints = game.st.complaints;

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
    // A caught or escaped thief leaves the census through closeOut(). One the
    // stall watchdog quietly put back never resolves at all, so without this his
    // entry sits on the board forever and every overlap number drifts upward
    // over the shift.
    for (const id of [...seen.keys()]) {
      const s = agents.shoppers.find((q) => q.id === id);
      if (!s || !s.guilty) seen.delete(id);
    }
    r.liveT[Math.min(5, seen.size)] += dt;
    // ---- ROUND 13: close out annLedger rows -------------------------------
    // Two clocks, because they answer two different questions. `toLeave` is
    // when the body TURNS — the thing visible from the aisle he is standing in
    // — and `toGone` is when he is off the floor. A row that never resolves
    // inside the shift closes as null rather than being dropped, so a
    // population that mostly does NOT leave cannot flatter its own median.
    for (const p of annPend) {
      if (p.toLeave != null && p.toGone != null) continue;
      const s = agents.shoppers.find((q) => q.id === p.id);
      if (!s) { if (p.toGone == null) p.toGone = +(clock - p.t).toFixed(2); continue; }
      if (p.toLeave == null && (s.leaving || s.state === 'leave' || s.bolted)) {
        p.toLeave = +(clock - p.t).toFixed(2);
      }
      if (p.toGone == null && (s.escaped || s.caught || !s.mesh.visible)) {
        p.toGone = +(clock - p.t).toFixed(2);
        if (p.toLeave == null) p.toLeave = p.toGone;
      }
    }
    // ---- ROUND 13: the roster ledger --------------------------------------
    // Only bodies a monitor has actually seen (`rec.cam != null`) — a line that
    // is not on any channel is not on the player's screen, and counting it
    // would flatter whichever population happens to walk through the blind
    // spots. Recorded on CHANGE, so each row is one line the terminal printed.
    for (const s of ((i % CENSUS_EVERY) ? [] : agents.shoppers)) {
      if (!s.mesh.visible || s.escaped || s.caught) { lastLine.delete(s.id); continue; }
      const rec = game.bot.rec(s);
      if (!rec || rec.cam == null) continue;
      const pop = !s.guilty ? 'innocent' : (s.stole ? 'hot' : 'cold');
      const key = `${rec.line} ${pop} ${rec.flagged ? 1 : 0}`;
      if (lastLine.get(s.id) === key) continue;
      lastLine.set(s.id, key);
      r.lineLedger.push({ line: rec.line, flagged: !!rec.flagged, pop });
    }
    if ((i & 2047) === 2047) await yieldNow();
  }
  r.annLedger = annPend;
  r.points = game.st.points;
  r.annKeyed = tally.keyed;
  r.stallEscape = game._g.dbg.stallEscape;
  r.stallPutBack = game._g.dbg.stallPutBack;
  // ROUND 7: a complaint is the fail state, so where they come from is worth
  // counting rather than inferring. hChase/hSubj/hZone are which branch of
  // targetShopper() had the reticle when the complaint landed.
  r.hChase = game._g.dbg.harass.chase;
  r.hDialogue = game._g.dbg.harass.dialogue;
  r.hSubj = game._g.dbg.harass.subj;
  r.hZone = game._g.dbg.harass.zone;
  r.hBlocked = game._g.dbg.blocked;
  // Complaints vs DISTINCT people who complained. If the second is much smaller
  // than the first, one confrontation is being billed several times over.
  r.hRepeat = game._g.dbg.reharass;
  r.hPeople = game._g.dbg.subjects.size;
  r.census = census;
  r.stateC = stateC;
  Math.random = realRandom;
  return r;
}

const q = (a, p) => {
  if (!a.length) return null;
  const b = [...a].sort((x, y) => x - y);
  return +b[Math.min(b.length - 1, Math.floor(p * b.length))].toFixed(1);
};
const med = (a) => q(a, 0.5);

// ===========================================================================
// ROUND 13 — THE GUILT PROBE. IS WALKING UP TO SOMEBODY AN ORACLE?
// ===========================================================================
// The leak this instrument was built for: the yell used to live inside
// agents.js's `else if (!s.guilty)` and the react/bolt trigger needs `drift` or
// `stole`, so a thief who had not concealed anything YET did NEITHER. Walking
// up to a body read out three ways —
//
//     they yell     innocent
//     they bolt     guilty, already stolen
//     NOTHING       a thief who has not done it yet
//
// — and the third cell cost nothing. No complaint, no risk, no timer. Every
// ambiguity number in this project is measured against the premise that you
// cannot tell without watching what someone DOES, and this handed a player a
// perfect classifier for the price of a walk down the aisle.
//
// ---------------------------------------------------------------------------
// WHY THIS IS A RANDOMISED TRIAL AND NOT A TALLY OFF A SHIFT
// ---------------------------------------------------------------------------
// The obvious instrument — run a shift, note what each body did when the cop
// got near — cannot answer the question, because in a real shift GUILT IS NOT
// ASSIGNED AT RANDOM. game.js's armThief() runs a tournament of four on route
// distance to the nearest exit, so a guilty body is systematically DEEPER in
// the store than an innocent one. Any outcome that depends on where a man is
// standing would then split by population for a reason that has nothing to do
// with the code path under test, and the split would be real, reproducible and
// completely misleading.
//
// So: one candidate pool, one uniform draw out of it, and then a COIN FLIP that
// decides whether that body is armed. The geometry, the state, the aisle, the
// body and the approach are drawn from the same distribution in every arm, and
// `arm` is a label this file keeps on the side. Nothing in agents.js or game.js
// reads it.
//
// ---------------------------------------------------------------------------
// THE PRECONDITION THAT MAKES A ZERO MEAN SOMETHING
// ---------------------------------------------------------------------------
// Round 6 made the yell require CLOSING: `copClosingOn()` wants the cop above
// K.harassSpeed and pointed within K.harassAim of the body. A probe that
// teleports the cop next to somebody therefore gets silence out of BOTH
// populations and reports a beautiful, meaningless 0/0 — that mistake was made
// once already this round. This walks the cop in on nav.steer(), from a start
// point on a real route, and every trial reports `minD` and `touchT` so a
// "nothing happened" can be told apart from a "never got there". Trials that
// never got inside suspicionRadius are counted as `noReach` and EXCLUDED from
// the distribution, in every arm equally.
//
// The predicate itself is deliberately NOT re-derived here. This file measures
// the OBSERVABLE — angry / bolted / neither — which is what a player has. If
// a copy of copClosingOn() lived in this file it would be the third instance of
// the duplication hazard in CLAUDE.md's header.
export async function probeWalkUp(ctx, opts = {}) {
  const { agents, input } = ctx;
  // CLAUDE.md: bench() inherits DIFF.level from whatever last set it, and the
  // same build has read 85/87/75% because of it. This one refuses to guess.
  if (opts.difficulty == null) {
    throw new Error('probeWalkUp: pass `difficulty` explicitly — see CLAUDE.md');
  }
  const dt = opts.dt ?? 1 / 60;
  const per = opts.per ?? 60;                    // trials PER ARM
  const arms = opts.arms ?? ['innocent', 'cold', 'hot'];
  const startD = opts.startD ?? 8.0;             // > suspicionRadius + 1.6, so
  const maxT = opts.maxT ?? 9.0;                 //   harassArmed re-arms first
  const warmT = opts.warmT ?? 4.0;
  const hotT = opts.hotT ?? 14.0;                // budget for a forced conceal
  const R = TUNING.suspicionRadius;
  const realRandom = Math.random;
  const rnd = mulberry32(opts.seed ?? 4242);
  Math.random = rnd;
  const ovrKeys = Object.keys(opts.agentsOverride || {});
  const ovrWas = {};
  for (const k of ovrKeys) ovrWas[k] = agents.override[k];
  if (ovrKeys.length) Object.assign(agents.override, opts.agentsOverride);

  let watchId = -1, harassFired = false;
  const api = {
    onBolt() {}, onCatch() {}, onEscape() {}, onAbort() {}, onLeave() {},
    onAnnounce() {}, report() {},
    // The sim's OWN verdict, not this file's reading of a flag. If `angry` and
    // this ever disagree, the instrument is wrong and says so (`mismatch`).
    onHarass(s) { if (s.id === watchId) harassFired = true; },
  };
  const idle = () => { input.x = 0; input.z = 0; input.sprint = false; };
  const stepN = (n) => {
    for (let i = 0; i < n; i++) {
      agents.setDifficulty(opts.difficulty);
      agents.update(dt, input, api);
    }
  };
  const nav = agents.nav;
  // A start point on a REAL ROUTE at about `r` metres. Sampling a ring and
  // taking the candidate whose route distance is closest to the straight line
  // picks a clean lane rather than a spot on the far side of a gondola — the
  // camper bot in this file already learned that a field value is not a
  // walkable direction, twice, and the note above floor() has the wreckage.
  function ringStart(fld, s, r) {
    let best = null;
    for (let k = 0; k < 32; k++) {
      const a = (k / 32) * Math.PI * 2;
      const x = s.position.x + Math.cos(a) * r;
      const z = s.position.z + Math.sin(a) * r;
      const d = nav.at(fld, x, z);
      if (!isFinite(d)) continue;
      const err = Math.abs(d - r);
      if (!best || err < best.err) best = { x, z, err, route: d };
    }
    return (best && best.err < r * 0.5) ? best : null;
  }

  const rows = [];
  const budget = opts.budget ?? per * arms.length * 4;
  let attempts = 0;
  const want = {}; for (const a of arms) want[a] = per;
  let ai = 0;
  while (attempts < budget && arms.some((a) => want[a] > 0)) {
    // round-robin over the arms that still need trials, so a slow arm cannot
    // be starved by a fast one and the world state is shared out evenly.
    let arm = null;
    for (let k = 0; k < arms.length; k++) {
      const c = arms[(ai + k) % arms.length];
      if (want[c] > 0) { arm = c; ai = (ai + k + 1) % arms.length; break; }
    }
    attempts++;
    // A FRESH WORLD PER TRIAL. agents.reset() does not reseed (see the note in
    // run()), so this re-scatters the bodies without making every trial the
    // same trial — and it means an angry body, a half-finished conceal or a
    // shelf hole from trial N cannot reach trial N+1.
    agents.reset();
    idle(); stepN(Math.round(warmT / dt));
    const pool = agents.shoppers.filter((s) => s.mesh.visible && !s.escaped && !s.caught
      && !s.guilty && !s.leaving && !s.bolted && s.angry <= 0 && s.harassArmed);
    if (!pool.length) continue;
    const s = pool[(rnd() * pool.length) | 0];
    // ---- THE COIN FLIP -----------------------------------------------------
    // Uniform over the pool and then armed HERE, not by armThief()'s
    // far-from-the-exit tournament. That is the whole point: the arm must not
    // predict the geometry.
    if (arm !== 'innocent') {
      s.guilty = true; s.stole = false; s.bolted = false; s.aborts = 0;
      s.chill = 0; s.balk = 0; s.leaving = false;
      // `cold` is a man who has not concealed and will not inside this trial;
      // `hot` is forced through a real concealment below and is the published
      // outcome (he bolts) rather than the leak.
      s.concealT = arm === 'hot' ? 0.05 : 90;
    }
    if (arm === 'hot') {
      idle();
      const cap = Math.round(hotT / dt);
      for (let i = 0; i < cap && !s.stole; i++) {
        agents.setDifficulty(opts.difficulty);
        agents.update(dt, input, api);
      }
      if (!s.stole || s.escaped || s.caught || !s.mesh.visible) continue;
    }
    let fld = null;
    try { fld = nav.field(s.position.x, s.position.z); } catch { fld = null; }
    if (!fld) continue;
    const start = ringStart(fld, s, startD);
    if (!start) continue;
    const cop = agents.cop;
    cop.position.set(start.x, cop.position.y, start.z);
    cop.userData.vel.set(0, 0, 0); cop.userData.speed = 0;
    watchId = s.id; harassFired = false;
    // Settle: two beats of standing still at ~8 m. Re-arms `harassArmed` (the
    // re-arm band is suspicionRadius + 1.6 = 6.1 m) and lets the teleport wash
    // out of the cop's own smoothing before the walk starts.
    idle(); stepN(Math.round(0.5 / dt));

    let out = null, minD = Infinity, touchT = 0, t = 0, repath = 0;
    const steps = Math.round(maxT / dt);
    const state0 = s.state;
    const cp = cop.position;
    // Sampled BEFORE and AFTER each update. agents decides the yell off the
    // pre-update gap and then both bodies move, so a post-update-only sample
    // reported minD = 4.50 with touchT = 0 on trials that had visibly yelled —
    // and the "did this trial even reach him" test was reading off it.
    const gap = () => Math.hypot(s.position.x - cp.x, s.position.z - cp.z);
    for (let i = 0; i < steps && !out; i++) {
      agents.setDifficulty(opts.difficulty);
      repath -= dt;
      if (repath <= 0) {
        try { fld = nav.field(s.position.x, s.position.z); } catch { /* keep old */ }
        repath = 0.4;
      }
      const d0 = gap();
      if (d0 < minD) minD = d0;
      let dx = s.position.x - cp.x, dz = s.position.z - cp.z;
      if (fld && nav.steer) {
        const d = nav.steer(fld, cp.x, cp.z, { look: 6.0 });
        if (d) { dx = d.tx - cp.x; dz = d.tz - cp.z; }
      }
      const m = Math.hypot(dx, dz) || 1;
      input.x = dx / m; input.z = -(dz / m); input.sprint = false;
      agents.update(dt, input, api);
      t += dt;
      const d1 = gap();
      if (d1 < minD) minD = d1;
      if (Math.min(d0, d1) < R) touchT += dt;
      // THE THREE CELLS, read off what a player can see and nothing else.
      if (s.bolted || s.state === 'react' || s.state === 'shove') out = 'bolt';
      else if (s.angry > 0) out = 'yell';
    }
    if (!out) out = 'nothing';
    // DID THIS TRIAL EVEN GET THERE. Round 6 made the yell need a cop who is
    // WALKING AT you, so a probe that never closes gets silence out of both
    // populations and reports a beautiful, meaningless zero. `minD < R` is the
    // geometric half of that precondition and is the same test in every arm;
    // trials that fail it are `noReach` and are excluded from the distribution.
    // A bolt is exempt: agents lets a thief clock a uniform from K.thiefLook
    // (17 m) away, so demanding he be crowded first would throw away the one
    // outcome that is SUPPOSED to discriminate.
    // `minD` alone straddles the boundary: agents decides at its own copD and
    // the cop covers ~3 cm in a step, so a trial whose yell fired at 4.499 can
    // sample 4.501 either side of it and land in the wrong column. The sim's
    // own callback settles it — onHarass IS agents saying the precondition was
    // met — and a bolt is exempt because agents lets a thief clock a uniform
    // from K.thiefLook (17 m), so demanding he be crowded first would throw
    // away the one outcome that is SUPPOSED to discriminate. First cut of this
    // instrument used `minD` alone and reported noReach at 27% for one arm and
    // 13% for another on a difference of three centimetres.
    if (minD >= R && !harassFired && out !== 'bolt') out = 'noReach';
    rows.push({
      arm, out, id: s.id, state0, t: +t.toFixed(2), harassFired,
      minD: +minD.toFixed(2), touchT: +touchT.toFixed(3),
      // Did agents' own callback agree with the flag this file read? Recorded
      // per row and reported as a count. The dangerous direction is a body that
      // fired onHarass — i.e. cost the player a complaint — while this file saw
      // nothing happen, because that is the observable and the economy coming
      // apart, which is exactly the kind of thing that gets found four rounds
      // late. A yell that is overtaken by a bolt in the same frame is not a
      // mismatch; it is the bolt winning, and it is counted as one.
      mismatch: (out === 'yell' && !harassFired) || (out === 'nothing' && harassFired),
    });
    want[arm]--;
    if ((attempts & 3) === 3) await yieldNow();
  }
  for (const k of ovrKeys) {
    if (ovrWas[k] === undefined) delete agents.override[k];
    else agents.override[k] = ovrWas[k];
  }
  Math.random = realRandom;
  idle();
  return probeReport(rows, { arms, attempts, difficulty: opts.difficulty,
    startD, maxT, agentsOverride: ovrKeys.length ? { ...opts.agentsOverride } : null });
}

// The table, and the number the round is about. `LR` is the likelihood ratio
// FOR GUILT of each observable outcome: P(outcome | guilty) / P(outcome |
// innocent), computed over trials that actually reached the body. 1.00 means
// the observation is worth nothing, which is the design target for every cell
// except `bolt` — a man running is a published confession and is SUPPOSED to be
// worth something.
function probeReport(rows, meta) {
  const cells = ['yell', 'bolt', 'nothing'];
  const arm = (a) => rows.filter((r) => r.arm === a);
  const dist = (a) => {
    const all = arm(a);
    const reached = all.filter((r) => r.out !== 'noReach');
    const o = { n: all.length, reached: reached.length, noReach: all.length - reached.length };
    for (const c of cells) {
      const k = reached.filter((r) => r.out === c).length;
      o[c] = k;
      o[c + 'Pct'] = reached.length ? +(100 * k / reached.length).toFixed(1) : null;
    }
    o.minDMedian = med(reached.map((r) => r.minD));
    o.touchMedian = q(reached.map((r) => r.touchT), 0.5);
    // agents' own callback rate, alongside the observable. These two answer
    // different questions — what the player SEES and what the economy is BILLED
    // — and this round is about keeping them the same shape.
    o.onHarass = all.filter((r) => r.harassFired).length;
    o.onHarassPct = reached.length
      ? +(100 * reached.filter((r) => r.harassFired).length / reached.length).toFixed(1) : null;
    return o;
  };
  const out = { meta, mismatches: rows.filter((r) => r.mismatch).length };
  for (const a of meta.arms) out[a] = dist(a);
  // Laplace-smoothed so a zero cell gives a finite ratio instead of Infinity or
  // NaN. The smoothing is stated rather than hidden: at n=60 per arm it moves a
  // real rate by under two points and it stops a 0/0 from being quoted as "no
  // difference" when what it means is "no data".
  const lr = (g, i, cell) => {
    const A = out[g], B = out[i];
    if (!A || !B || !A.reached || !B.reached) return null;
    const pg = (A[cell] + 0.5) / (A.reached + 1);
    const pi = (B[cell] + 0.5) / (B.reached + 1);
    return +(pg / pi).toFixed(2);
  };
  out.LR = {};
  for (const a of meta.arms) {
    if (a === 'innocent') continue;
    out.LR[a] = {};
    for (const c of cells) out.LR[a][c] = lr(a, 'innocent', c);
  }
  return out;
}

// ===========================================================================
// ROUND 13 — lineSplit: WHAT A BEHAVIOUR LINE IS WORTH AS EVIDENCE
// ===========================================================================
// The walk-up leak had a twin on the desk screen and nobody had asked. For each
// distinct string the terminal printed, this reports how often it appeared above
// each population and the likelihood ratio FOR "GUILTY, NOT YET STOLEN" — the
// state the whole ambiguity design is about, because a man who has already
// concealed is SUPPOSED to be readable and BEHAVIOUR_GUILTY is supposed to say
// so.
//
// `worst` is the headline: the largest finite LR over the strings a cold thief
// can show, and `perfect` is the number of strings that are literally
// impossible for an innocent. A `perfect` of anything but 0 means the roster is
// a free classifier and the walk down the aisle was never necessary.
function lineSplit(rows) {
  const tot = { innocent: 0, cold: 0, hot: 0 };
  const by = new Map();
  for (const r of rows) {
    tot[r.pop] = (tot[r.pop] || 0) + 1;
    let e = by.get(r.line);
    if (!e) { e = { line: r.line, innocent: 0, cold: 0, hot: 0, flagged: 0 }; by.set(r.line, e); }
    e[r.pop]++;
    if (r.flagged) e.flagged++;
  }
  const out = [];
  for (const e of by.values()) {
    // Rate WITHIN each population, so a string is not scored on how many bodies
    // happen to be innocent. Laplace-smoothed for the LR only; the counts and
    // the `perfect` test are raw, because a smoothed zero is exactly the thing
    // that would hide the leak this is looking for.
    const pC = (e.cold + 0.5) / (tot.cold + 1);
    const pI = (e.innocent + 0.5) / (tot.innocent + 1);
    out.push({
      line: e.line, innocent: e.innocent, cold: e.cold, hot: e.hot,
      lrCold: +(pC / pI).toFixed(2),
      perfect: e.cold > 0 && e.innocent === 0,
      flaggedPct: +(100 * e.flagged / (e.innocent + e.cold + e.hot)).toFixed(0),
    });
  }
  out.sort((a, b) => b.lrCold - a.lrCold);
  // ONLY STRINGS A COLD THIEF ACTUALLY SHOWS. A BEHAVIOUR_GUILTY line has
  // cold = 0 and innocent = 0, so its smoothed `lrCold` is just the ratio of the
  // two denominators — about 13 — and it sorts to the top of this table while
  // meaning nothing about cold guilt at all. `worstLR` and `top` are both taken
  // over `coldLines` so the headline cannot be an artefact of the smoothing.
  const coldLines = out.filter((o) => o.cold > 0);
  // How often a cold thief is showing a string an innocent CANNOT show. This is
  // the number: it is the probability that reading one roster row identifies an
  // un-concealed thief with certainty, for free, from the desk.
  const perfectHits = coldLines.filter((o) => o.perfect).reduce((a, o) => a + o.cold, 0);
  return {
    n: rows.length, tot,
    perfectStrings: coldLines.filter((o) => o.perfect).length,
    perfectPct: tot.cold ? +(100 * perfectHits / tot.cold).toFixed(1) : null,
    worstLR: coldLines.length ? coldLines[0].lrCold : null,
    // Flag rate by population. A cold thief who can never be flagged is the
    // same leak with the sign flipped — "no flag" would be the tell.
    flagPct: {
      innocent: rate(rows, 'innocent'), cold: rate(rows, 'cold'), hot: rate(rows, 'hot'),
    },
    top: coldLines.slice(0, 8),
  };
}
function rate(rows, pop) {
  const a = rows.filter((r) => r.pop === pop);
  return a.length ? +(100 * a.filter((r) => r.flagged).length / a.length).toFixed(1) : null;
}

// ===========================================================================
// ROUND 13 — probeAnn: IS annHuff OBSERVABLE?
// ===========================================================================
// agents.js:5228 reads `if (!s.guilty && s.shopT > 0) s.shopT = Math.max(4.0,
// s.shopT * K.annHuff)` — an INNOCENT-ONLY cut to the remaining shop of a man
// who has just answered an announcement. It is a branch on `s.guilty` that
// changes how long a body stays in the building, and the exposure term already
// leaks into take rate, so it was escalated as a candidate tell and left
// unmeasured. This measures it.
//
// The observable is "he turned for the door inside `watch` seconds of the PA",
// which is what a player watching the aisle actually has. `drift` counts as
// turning for the door alongside `leave`/`leaving`/`bolt`, deliberately: a
// guilty man's walk out IS drift, and a definition of "leaving" that only
// caught the innocent mechanism would manufacture the very asymmetry this is
// looking for.
//
// THE ANSWER, so it is next to the instrument: annHuff is NOT observable, and it
// has a large effect on the clock. Paired ablation, same build, same seed, one
// condition per page load, n=150/146 bodies that answered a PA, difficulty 1:
//
//                              annHuff 0.55 (ship)     annHuff 1.00 (off)
//   innocent turned <= 25 s          35.9%                  32.3%
//   guilty   turned <= 25 s          43.0%                  44.4%
//   LR(turned) for guilt              1.20                   1.37
//   innocents that NEVER turned      0 / 64                21 / 65
//
// The likelihood ratio on the thing a player can actually see moves by 0.17,
// which is inside the noise at these cell sizes — and it moves the WRONG WAY for
// the "annHuff is a tell" hypothesis: switching the constant off makes the
// observation slightly MORE discriminating, not less. Meanwhile the positive
// control fires hard: annHuff removes the entire "still shopping two minutes
// later" tail for innocents, 32.3% of them to zero. So it is doing exactly what
// it was written to do to the clock and nothing at all to the read. LEFT IN.
//
// The residual LR of 1.2-1.4 present in BOTH conditions is not annHuff. It is
// the guilty timeline — conceal, then drift to the door — which is the published
// tell the whole desk phase is built on.
//
// It is an ABLATION and not a single reading, because a raw split between the
// populations is uninterpretable — a guilty man leaves by concealing and
// drifting, an innocent by running out his shop clock, and those two clocks
// were never going to match. The question is only whether annHuff MOVES the
// split. Run it at the shipped 0.55 and again at 1.00 (the constant made inert,
// via agents' own OVR lever) and compare the two likelihood ratios. The
// innocent median is the positive control: if THAT does not move between the
// conditions, the ablation never took and neither number means anything.
export async function probeAnn(ctx, opts = {}) {
  const { agents, input } = ctx;
  if (opts.difficulty == null) {
    throw new Error('probeAnn: pass `difficulty` explicitly — see CLAUDE.md');
  }
  const dt = opts.dt ?? 1 / 60;
  const rounds = opts.rounds ?? 40;
  const warmT = opts.warmT ?? 5.0;
  const watchT = opts.watchT ?? 140.0;
  const pGuilty = opts.pGuilty ?? 0.5;
  const realRandom = Math.random;
  const rnd = mulberry32(opts.seed ?? 3131);
  Math.random = rnd;
  const api = { onBolt() {}, onCatch() {}, onEscape() {}, onHarass() {},
    onAbort() {}, onLeave() {}, onAnnounce() {}, report() {} };
  const idle = () => { input.x = 0; input.z = 0; input.sprint = false; };
  const step1 = () => { agents.setDifficulty(opts.difficulty); agents.update(dt, input, api); };

  const runOne = async (huff) => {
    const had = Object.prototype.hasOwnProperty.call(agents.override, 'annHuff');
    const was = agents.override.annHuff;
    if (huff != null) agents.override.annHuff = huff;
    const rows = [];
    for (let k = 0; k < rounds; k++) {
      agents.reset();
      idle();
      for (let i = 0; i < Math.round(warmT / dt); i++) step1();
      // COIN FLIP PER BODY, with a REAL fuse. A cold thief whose fuse is pinned
      // never leaves at all and would make the guilty column censored by
      // construction; these men conceal and drift out on the same timeline the
      // game gives them.
      for (const s of agents.shoppers) {
        if (!s.mesh.visible || s.escaped || s.caught || s.leaving) continue;
        if (rnd() >= pGuilty) continue;
        s.guilty = true; s.stole = false; s.bolted = false; s.aborts = 0;
        s.chill = 0; s.balk = 0;
        s.concealT = 10 + rnd() * 12;
      }
      // Somebody near the middle of the store, so the loudspeaker reaches a
      // crowd rather than one man in a corner.
      const pool = agents.shoppers.filter((s) => s.mesh.visible && !s.escaped && !s.caught
        && !s.bolted && s.state !== 'react' && s.state !== 'shove');
      if (!pool.length) continue;
      const named = pool[(rnd() * pool.length) | 0];
      const r = agents.announceAt(named, 'putback', { force: true });
      if (!r.ok) continue;
      // Everyone the loudspeaker reached, tagged with what he was AT THE PA.
      const heard = agents.shoppers.filter((s) => s.annT > 0).map((s) => ({
        s, guilty: !!s.guilty, stole: !!s.stole, shopT0: +(s.shopT || 0).toFixed(1),
        turned: null, gone: null,
      }));
      let t = 0;
      const cap = Math.round(watchT / dt);
      for (let i = 0; i < cap; i++) {
        step1(); t += dt;
        for (const h of heard) {
          const s = h.s;
          if (h.turned == null && (s.leaving || s.state === 'leave' || s.state === 'drift'
            || s.bolted || s.escaped || !s.mesh.visible)) h.turned = +t.toFixed(2);
          if (h.gone == null && (s.escaped || !s.mesh.visible)) h.gone = +t.toFixed(2);
        }
        if (heard.every((h) => h.turned != null)) break;
        // A YIELD, NOT A BREAK. The first cut of this wrote `break` here to keep
        // a round bounded and capped every watch at 2048 steps = 34 s — against
        // an innocent median time-to-door of ~42 s. It would have censored most
        // of both columns and then reported the survivors as a median.
        if ((i & 1023) === 1023) await yieldNow();
      }
      for (const h of heard) {
        rows.push({ guilty: h.guilty, stole: h.stole, shopT0: h.shopT0,
          turned: h.turned, gone: h.gone });
      }
    }
    if (huff != null) { if (had) agents.override.annHuff = was; else delete agents.override.annHuff; }
    return rows;
  };

  const watch = opts.watch ?? 25;
  const cell = (rows, g) => {
    const a = rows.filter((r) => !!r.guilty === g);
    const turned = a.filter((r) => r.turned != null && r.turned <= watch).length;
    const times = a.filter((r) => r.turned != null).map((r) => r.turned);
    return { n: a.length, turnedIn: turned,
      pct: a.length ? +(100 * turned / a.length).toFixed(1) : null,
      median: med(times), p90: q(times, 0.90), censored: a.length - times.length };
  };
  const summarise = (rows) => {
    // Rows whose body was ALREADY on his way out when the PA landed are not
    // answering it. `shopT0 <= 0` is game-side "shop finished".
    const use = rows.filter((r) => !(r.stole));
    const inn = cell(use, false), gui = cell(use, true);
    const lr = (inn.pct != null && inn.pct > 0 && gui.pct != null)
      ? +(gui.pct / inn.pct).toFixed(2) : null;
    return { n: use.length, innocent: inn, guilty: gui, lrTurned: lr,
      droppedAlreadyStole: rows.length - use.length };
  };
  // ---- ONE CONDITION PER PAGE LOAD, AND THIS IS NOT FUSSINESS ------------
  // The first cut ran both conditions back to back in one tab and the result was
  // uninterpretable: the GUILTY column moved from 45.5% to 22.2% between them,
  // and annHuff cannot touch a guilty body. The cause is that agents.js seeds its
  // RNG once at module init and `reset()` does not reseed (see the note in run()),
  // so the second condition starts wherever the first one left the stream — two
  // different worlds, different bodies armed, different n. `Math.random` is
  // patched and reproducible; agents' stream is not, and there is no setSeed on
  // its contract.
  //
  // So `only` runs ONE condition, and the ablation is two page loads of the same
  // build with the same seed — the same trick the before/after servers use. Read
  // the two results side by side; `lrShift` is only filled in when both ran here.
  const only = opts.only || null;
  const ship = only === 'off' ? null : summarise(await runOne(null));
  const off = only === 'ship' ? null : summarise(await runOne(1.0));
  Math.random = realRandom;
  idle();
  return {
    meta: { rounds, watch, watchT, difficulty: opts.difficulty, pGuilty, only,
      shipAnnHuff: agents.K.annHuff },
    ship, off,
    // THE ANSWER. If annHuff is observable, the likelihood ratio has to MOVE
    // when it is switched off. If it does not, the constant is doing nothing a
    // player could ever read, whatever it is doing to the clock.
    lrShift: (ship && off && ship.lrTurned != null && off.lrTurned != null)
      ? +(ship.lrTurned - off.lrTurned).toFixed(2) : null,
    // ...and the positive control: annHuff's DIRECT effect. The innocent median
    // must move between the two conditions, or the ablation never took.
    innocentMedianShip: ship ? ship.innocent.median : null,
    innocentMedianOff: off ? off.innocent.median : null,
  };
}
