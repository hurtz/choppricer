// OWNER: builder-audio. EVERYTHING WITH A BODY.
//
// Carts, checkouts, footfalls, doors, and the cop's lungs. All of it pooled:
// a fixed number of spatial voices that get re-aimed at whatever is nearest,
// and one-shots that are two nodes each because the filters they run through
// are shared and permanent.
//
// The cost rule for this file is that a busy store — eight lanes beeping, four
// carts moving, a man sprinting — must not create more than about forty
// short-lived nodes a second, because the frame budget belongs to nine cameras.

import { gain, filt, panner, setPos, loopNoise, mulberry, to, clamp, lerp, smooth } from './dsp.js';
import { createVoiceBank } from './voice.js';
import { STORE, FRONT_WALK_Z, EXIT, EXIT2, AISLE_LEN, AISLE_GAP, SHELF_W, AISLE_COUNT, aisleX } from '../config.js';

const PITCH = AISLE_GAP + SHELF_W;
const BODY = AISLE_LEN / 2 - 0.62;
const LANE_X0 = STORE.minX + 6.2, LANE_PITCH = 3.34, LANE_N = 8;
const LANE_Z = FRONT_WALK_Z - 1.8;

// Which slot is this x in, and is the listener in a different one? Two people in
// different aisles have eight tonnes of packaged food between them, and the
// game reads completely differently once that is true. This is the cheapest
// possible occlusion and it is the single biggest spatial cue in the building.
function slotOf(x) { return Math.round(x / PITCH + (AISLE_COUNT - 1) / 2); }

export function createFoley(ctx, room, out, wetOut, playerOut, noise, rattleBuf) {
  const rnd = mulberry(5150);
  const nodes = [];
  const N = (n) => { nodes.push(n); return n; };
  let created = 0;                     // one-shot nodes made this second (report)

  // Shared destinations. Everything with a body is fairly dry and gets the room
  // as a send, because you hear the object AND you hear the store's reply.
  const dry = N(gain(ctx, 1)); dry.connect(out);
  const wet = N(gain(ctx, 0.85)); wet.connect(wetOut);
  function send(node, d, w) {
    const a = N(gain(ctx, d)); node.connect(a); a.connect(dry);
    const b = N(gain(ctx, w)); node.connect(b); b.connect(wet);
    return node;
  }
  // A spatial slot: feed `in`, hear it from `p`, and the room hears it from
  // `in` — i.e. the reverb send is PRE-panner. See bed.js placeAt for why: the
  // reverberant field is not a function of how far away you are standing.
  function spot(x, y, z, ref, roll, d, w) {
    const p = N(panner(ctx, x, y, z, ref, roll));
    const i = N(gain(ctx, 1));
    i.connect(p);
    const a = N(gain(ctx, d)); p.connect(a); a.connect(dry);
    const b = N(gain(ctx, w)); i.connect(b); b.connect(wet);
    return { p, in: i, dryG: a };
  }

  // ======================================================================
  // FOOTFALLS
  // ======================================================================
  // A heavy man on VCT over a concrete slab is three sounds: the slab taking the
  // weight (a thud with almost no pitch), the heel (a very short bright click),
  // and the sole dragging (a scuff). Which of the three dominates is how you
  // hear the difference between walking and running, and the room does the rest.
  // A "kit" is one set of shoe filters feeding one destination. The cop gets a
  // non-positional one (his feet are under him, not somewhere in the store);
  // every spatial voice gets its own, because routing a shopper's footfall
  // through the cop's shared filters puts a running thief in the middle of the
  // player's head — which is what round 1 did, and it threw away the loudest
  // directional cue in the chase.
  function makeKit(dest, tone) {
    const thud = [], click = [];
    for (let i = 0; i < (tone ? 3 : 1); i++) {
      const f = N(filt(ctx, 'lowpass', 170 + i * 40, 1.1));
      const p = N(filt(ctx, 'peaking', 92 + i * 22, 1.4, 5));
      f.connect(p); p.connect(dest); thud.push(f);
    }
    for (let i = 0; i < (tone ? 3 : 1); i++) {
      const f = N(filt(ctx, 'bandpass', 2400 + i * 950, 1.5));
      const h = N(filt(ctx, 'highpass', 1400, 0.7));
      f.connect(h); h.connect(dest); click.push(f);
    }
    const scuff = N(filt(ctx, 'bandpass', 950, 0.8)); scuff.connect(dest);
    return { thud, click, scuff, body: dest };
  }
  const stepBus = N(gain(ctx, 1));
  send(stepBus, 0.85, 0.85);
  const copKit = makeKit(stepBus, true);

  let rr = 0;
  // `kit` lets a shopper's step go through his own panner instead of the cop's
  function step(t, hard, big, kit) {
    const K = kit || copKit;
    const thudLP = K.thud, clickBP = K.click, scuffBP = K.scuff, d = K.body;
    rr++;
    const v = 0.55 + hard * 0.75;
    // the slab
    {
      const s = ctx.createBufferSource(); s.buffer = noise;
      s.playbackRate.value = 0.55 + rnd() * 0.3;
      const g = gain(ctx, 0);
      s.connect(g);
      g.connect(thudLP[rr % thudLP.length]);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * big * (0.85 + rnd() * 0.3), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075 + rnd() * 0.05);
      s.start(t, rnd() * 2, 0.2); s.onended = () => { try { g.disconnect(); } catch (e) {} };
      created += 2;
    }
    // the body of it — a 130 kg man puts a note into a slab
    {
      const o = ctx.createOscillator(); o.type = 'sine';
      const g = gain(ctx, 0);
      o.connect(g); g.connect(d);
      o.frequency.setValueAtTime(72 + rnd() * 14, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.07);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.30 * v * big, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.10);
      o.start(t); o.stop(t + 0.13);
      o.onended = () => { try { g.disconnect(); } catch (e) {} };
      created += 2;
    }
    // the heel
    {
      const s = ctx.createBufferSource(); s.buffer = noise;
      s.playbackRate.value = 0.85 + rnd() * 0.55;
      const g = gain(ctx, 0);
      s.connect(g); g.connect(clickBP[(rr + 1) % clickBP.length]);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.105 * v * (0.5 + hard), t + 0.0015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.016 + rnd() * 0.012);
      s.start(t, rnd() * 2, 0.06); s.onended = () => { try { g.disconnect(); } catch (e) {} };
      created += 2;
    }
    // the drag. Only when he is moving fast enough to have one.
    if (hard > 0.35 && rnd() < 0.7) {
      const s = ctx.createBufferSource(); s.buffer = noise;
      s.playbackRate.value = 0.6 + rnd() * 0.5;
      const g = gain(ctx, 0);
      s.connect(g); g.connect(scuffBP);
      g.gain.setValueAtTime(0, t + 0.01);
      g.gain.linearRampToValueAtTime(0.085 * hard, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06 + rnd() * 0.05);
      s.start(t, rnd() * 2, 0.15); s.onended = () => { try { g.disconnect(); } catch (e) {} };
      created += 2;
    }
  }

  // ======================================================================
  // CARTS
  // ======================================================================
  // Broadband rattle whose density tracks the wheel rate, a low rumble of
  // castors on tile, and one bad wheel. The rattle is amplitude-modulated by an
  // audio-rate noise buffer read at a speed-dependent rate, so it costs no
  // JavaScript at all and it is never the same twice.
  const CARTS = 4;
  const carts = [];
  for (let i = 0; i < CARTS; i++) {
    const S = spot(0, 0.55, 0, 2.6, 1.25, 0.95, 0.42);
    const p = S.in;                      // voices feed the pre-panner node
    const vg = N(gain(ctx, 0));
    vg.connect(p);

    const mod = N(gain(ctx, 0.12));
    const modSrc = N(loopNoise(ctx, rattleBuf, 1, rnd));
    const modAmt = N(gain(ctx, 0.9));
    modSrc.connect(modAmt); modAmt.connect(mod.gain);

    const src = N(loopNoise(ctx, noise, 1, rnd));
    src.connect(mod);
    const frame = N(filt(ctx, 'bandpass', 1150 + i * 130, 1.3));
    const frame2 = N(filt(ctx, 'peaking', 2700 + i * 200, 3, 7));
    const fg = N(gain(ctx, 0.55));
    mod.connect(frame); frame.connect(frame2); frame2.connect(fg); fg.connect(vg);

    const low = N(gain(ctx, 1));
    src.connect(low);
    const lowBP = N(filt(ctx, 'bandpass', 130 + i * 12, 0.9));
    const lg = N(gain(ctx, 0.30));
    low.connect(lowBP); lowBP.connect(lg); lg.connect(vg);

    // the bad wheel. Every cart in America has one.
    const sq = N(ctx.createOscillator()); sq.type = 'sine';
    sq.frequency.value = 1450 + rnd() * 700;
    const sqLFO = N(ctx.createOscillator()); sqLFO.type = 'sine'; sqLFO.frequency.value = 3;
    const sqDepth = N(gain(ctx, 190));
    sqLFO.connect(sqDepth); sqDepth.connect(sq.frequency);
    const sqG = N(gain(ctx, 0));
    const sqBP = N(filt(ctx, 'peaking', 1900, 2.6, 4));
    sq.connect(sqBP); sqBP.connect(sqG); sqG.connect(vg);
    sq.start(); sqLFO.start();

    carts.push({ p: S.p, vg, modSrc, sq, sqG, sqLFO, sqBase: sq.frequency.value, bad: i === 1 ? 1.0 : (i === 3 ? 0.55 : 0.2), sid: -1, x: 0, z: 0 });
  }

  // ======================================================================
  // AGENT VOICES — the nearest few shoppers get feet and a body
  // ======================================================================
  const AGENTS = 4;
  const agents = [];
  for (let i = 0; i < AGENTS; i++) {
    const S = spot(0, 0.9, 0, 3.2, 1.15, 0.85, 0.55);
    const oc = N(filt(ctx, 'lowpass', 18000, 0.7));    // the occlusion filter
    const g = N(gain(ctx, 0.6));
    oc.connect(g); g.connect(S.in);
    agents.push({ p: S.p, oc, g, sid: -1, phase: 0, last: -9, in: oc, kit: makeKit(oc, false) });
  }

  // ======================================================================
  // CHECKOUTS
  // ======================================================================
  // Eight lanes, each with a panner that never moves. A real front end is beeps
  // in CLUSTERS — a customer's order is twenty items in ninety seconds and then
  // ninety seconds of nothing — and the cluster structure is what stops it
  // sounding like a metronome with jitter on it.
  const beepOsc = [];
  const lanes = [];
  for (let k = 0; k < LANE_N; k++) {
    const S = spot(LANE_X0 + k * LANE_PITCH, 1.15, LANE_Z, 4.0, 1.0, 0.85, 0.62);
    lanes.push({
      p: S.in, g: S.dryG, x: LANE_X0 + k * LANE_PITCH,
      busy: rnd() < 0.55, t: rnd() * 6, left: 4 + ((rnd() * 18) | 0),
      // lanes at the left end are the express lanes and they are always going
      rate: 0.55 + rnd() * 1.4 - (k < 2 ? 0.25 : 0),
    });
  }
  const printBP = N(filt(ctx, 'bandpass', 1500, 2.2));
  const printPk = N(filt(ctx, 'peaking', 760, 3, 8));
  printBP.connect(printPk);
  const bagHP = N(filt(ctx, 'highpass', 2600, 0.7));
  const bagPk = N(filt(ctx, 'peaking', 5200, 1.4, 6));
  bagHP.connect(bagPk);

  function beep(t, dest) {
    // Always the same pitch. Every scanner in every store is the same scanner.
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 2730;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 5460;
    const g = gain(ctx, 0), g2 = gain(ctx, 0.12);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.105, t + 0.003);
    g.gain.setValueAtTime(0.105, t + 0.045);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.075);
    o.start(t); o2.start(t); o.stop(t + 0.1); o2.stop(t + 0.1);
    o.onended = () => { try { g.disconnect(); } catch (e) {} };
    created += 4;
  }
  function printer(t, dest) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.7 + rnd() * 0.3;
    const g = gain(ctx, 0);
    const am = gain(ctx, 0.5);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 175 + rnd() * 40;
    const lg = gain(ctx, 0.45);
    lfo.connect(lg); lg.connect(am.gain);
    s.connect(am); am.connect(g); g.connect(printBP);
    printPk.connect(dest);
    const d = 0.45 + rnd() * 0.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.02);
    g.gain.setValueAtTime(0.09, t + d);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.04);
    s.start(t, rnd() * 2, d + 0.1); lfo.start(t); lfo.stop(t + d + 0.1);
    s.onended = () => { try { g.disconnect(); printPk.disconnect(dest); } catch (e) {} };
    created += 5;
  }
  function bagging(t, dest) {
    bagPk.connect(dest);
    const n = 5 + ((rnd() * 7) | 0);
    for (let i = 0; i < n; i++) {
      const tt = t + i * (0.03 + rnd() * 0.07);
      const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.9 + rnd() * 1.1;
      const g = gain(ctx, 0);
      s.connect(g); g.connect(bagHP);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(0.045 * (0.4 + rnd()), tt + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.02 + rnd() * 0.04);
      s.start(tt, rnd() * 2, 0.08); s.onended = () => { try { g.disconnect(); } catch (e) {} };
    }
    created += n * 2;
    setTimeout(() => { try { bagPk.disconnect(dest); } catch (e) {} }, 1800);
  }
  function drawer(t, dest) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.4;
    const g = gain(ctx, 0); const f = filt(ctx, 'lowpass', 420, 1.4);
    s.connect(g); g.connect(f); f.connect(dest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    s.start(t, rnd() * 2, 0.2);
    for (let i = 0; i < 4 + ((rnd() * 5) | 0); i++) {     // change into the tray
      const tt = t + 0.16 + rnd() * 0.5;
      const o = ctx.createOscillator(); o.type = 'triangle';
      o.frequency.value = 2200 + rnd() * 3400;
      const gg = gain(ctx, 0); o.connect(gg); gg.connect(dest);
      gg.gain.setValueAtTime(0.05 * (0.4 + rnd()), tt);
      gg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.06 + rnd() * 0.08);
      o.start(tt); o.stop(tt + 0.2);
      o.onended = () => { try { gg.disconnect(); } catch (e) {} };
    }
    s.onended = () => { try { f.disconnect(); } catch (e) {} };
    created += 12;
  }

  // ======================================================================
  // DOORS
  // ======================================================================
  // Sliders on a belt, plus three seconds of outdoors. The outdoors is the only
  // thing in this build that is not inside the building, and it is exactly why
  // it matters: you only notice how enclosed the store is when a door opens.
  const doorP = [EXIT, EXIT2].map((e) => spot(e.x, 1.4, e.z, 4.5, 1.15, 0.9, 0.55).in);
  function doorCycle(t, which) {
    const dest = doorP[which % 2];
    // motor
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const bp = filt(ctx, 'bandpass', 520, 2.6);
    const g = gain(ctx, 0);
    o.connect(bp); bp.connect(g); g.connect(dest);
    o.frequency.setValueAtTime(58, t);
    o.frequency.linearRampToValueAtTime(92, t + 0.25);
    o.frequency.setValueAtTime(92, t + 0.95);
    o.frequency.linearRampToValueAtTime(52, t + 1.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.1);
    g.gain.setValueAtTime(0.10, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.35);
    o.start(t); o.stop(t + 1.4);
    // rail
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 0.5;
    const f = filt(ctx, 'bandpass', 240, 1.1); const sg = gain(ctx, 0);
    s.connect(sg); sg.connect(f); f.connect(dest);
    sg.gain.setValueAtTime(0, t); sg.gain.linearRampToValueAtTime(0.09, t + 0.12);
    sg.gain.setValueAtTime(0.09, t + 0.95); sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    s.start(t, rnd() * 2, 1.5);
    // and outside: tyres on asphalt, a long way off, and air
    const w = ctx.createBufferSource(); w.buffer = noise; w.loop = true; w.playbackRate.value = 0.35;
    const wf = filt(ctx, 'lowpass', 900, 0.6); const wf2 = filt(ctx, 'peaking', 190, 1.2, 6);
    const wg = gain(ctx, 0);
    w.connect(wf); wf.connect(wf2); wf2.connect(wg); wg.connect(dest);
    wg.gain.setValueAtTime(0, t);
    wg.gain.linearRampToValueAtTime(0.075, t + 0.9);
    wg.gain.setValueAtTime(0.075, t + 2.6);
    wg.gain.linearRampToValueAtTime(0.0, t + 4.2);
    w.start(t); w.stop(t + 4.4);
    w.onended = () => { try { wg.disconnect(); f.disconnect(); g.disconnect(); } catch (e) {} };
    created += 12;
  }
  // EAS pedestal. A real fixture bolted to a real doorway, and it is the sound
  // of the game being over.
  function easAlarm(t, which) {
    const dest = doorP[which % 2];
    for (let i = 0; i < 9; i++) {
      const tt = t + i * 0.30;
      const o = ctx.createOscillator(); o.type = 'square';
      o.frequency.value = i % 2 ? 2050 : 2650;
      const f = filt(ctx, 'bandpass', 2400, 1.4);
      const g = gain(ctx, 0);
      o.connect(f); f.connect(g); g.connect(dest);
      g.gain.setValueAtTime(0, tt);
      g.gain.linearRampToValueAtTime(0.085, tt + 0.006);
      g.gain.setValueAtTime(0.085, tt + 0.17);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.22);
      o.start(tt); o.stop(tt + 0.28);
      o.onended = () => { try { g.disconnect(); f.disconnect(); } catch (e) {} };
    }
    created += 27;
  }

  // ======================================================================
  // SOMEBODY SAID SOMETHING
  // ======================================================================
  // The murmur bed in bed.js is the crowd; this is one person, near enough to
  // have a direction and never near enough to be understood. It is the cue that
  // turns a room with people in it into a room where people are. And a kid,
  // because every supermarket has exactly one child making a noise in it.
  const talk = createVoiceBank(ctx, noise, 1212);
  const voxS = spot(0, 1.55, 0, 5.0, 0.95, 0.42, 0.80);
  const kidS = spot(0, 1.05, 0, 7.0, 0.85, 0.34, 0.90);

  // ======================================================================
  // THINGS THAT HAPPEN TO A BODY
  // ======================================================================
  // Grabbing a can off the shelf, and being gone through by a man who does not
  // want to be caught. Both are physically real, both are gameplay, and neither
  // is a stinger — the store does not know either of them happened.
  function grab(t, kind) {
    // the item leaving a wire shelf
    for (let i = 0; i < 7; i++) {
      const tt = t + i * (0.012 + rnd() * 0.028);
      const s2 = ctx.createBufferSource(); s2.buffer = noise; s2.playbackRate.value = 1.1 + rnd();
      const g = gain(ctx, 0);
      s2.connect(g); g.connect(bagHP);
      g.gain.setValueAtTime(0.05 * (0.4 + rnd()), tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.02 + rnd() * 0.05);
      s2.start(tt, rnd() * 2, 0.08); s2.onended = () => { try { g.disconnect(); } catch (e) {} };
    }
    bagPk.connect(stepBus);
    setTimeout(() => { try { bagPk.disconnect(stepBus); } catch (e) {} }, 1500);
    if (kind === 'energy') {
      // the tab. A crack, then eight hundred millilitres of gas.
      const tt = t + 0.34;
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 1750;
      const og = gain(ctx, 0); o.connect(og); og.connect(stepBus);
      og.gain.setValueAtTime(0.16, tt); og.gain.exponentialRampToValueAtTime(0.0001, tt + 0.035);
      o.start(tt); o.stop(tt + 0.06);
      const s3 = ctx.createBufferSource(); s3.buffer = noise; s3.playbackRate.value = 1.4;
      const f = filt(ctx, 'highpass', 3800, 0.7); const fg = gain(ctx, 0);
      s3.connect(fg); fg.connect(f); f.connect(stepBus);
      fg.gain.setValueAtTime(0, tt);
      fg.gain.linearRampToValueAtTime(0.09, tt + 0.02);
      fg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.75);
      s3.start(tt, rnd() * 2, 0.9);
      s3.onended = () => { try { f.disconnect(); og.disconnect(); } catch (e) {} };
    } else {
      // a lid coming off a box of donuts
      const tt = t + 0.30;
      const s3 = ctx.createBufferSource(); s3.buffer = noise; s3.playbackRate.value = 0.75;
      const f = filt(ctx, 'bandpass', 1400, 0.8); const fg = gain(ctx, 0);
      s3.connect(fg); fg.connect(f); f.connect(stepBus);
      fg.gain.setValueAtTime(0, tt);
      fg.gain.linearRampToValueAtTime(0.10, tt + 0.03);
      fg.gain.exponentialRampToValueAtTime(0.0001, tt + 0.30);
      s3.start(tt, rnd() * 2, 0.4);
      s3.onended = () => { try { f.disconnect(); } catch (e) {} };
    }
    created += 20;
  }

  // 130 kg going through 80 kg at five metres a second.
  function barge(t) {
    const s2 = ctx.createBufferSource(); s2.buffer = noise; s2.playbackRate.value = 0.42;
    const f = filt(ctx, 'lowpass', 340, 1.1); const g = gain(ctx, 0);
    s2.connect(g); g.connect(f); f.connect(stepBus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.38, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    s2.start(t, rnd() * 2, 0.3);
    // cloth
    const s4 = ctx.createBufferSource(); s4.buffer = noise; s4.playbackRate.value = 1.0;
    const f2 = filt(ctx, 'bandpass', 2600, 0.7); const g2 = gain(ctx, 0);
    s4.connect(g2); g2.connect(f2); f2.connect(stepBus);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.13, t + 0.02);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    s4.start(t, rnd() * 2, 0.4);
    // the air going out of him
    const s5 = ctx.createBufferSource(); s5.buffer = noise; s5.playbackRate.value = 0.85;
    const f3 = filt(ctx, 'bandpass', 620, 1.4); const g3 = gain(ctx, 0);
    s5.connect(g3); g3.connect(f3); f3.connect(stepBus);
    g3.gain.setValueAtTime(0, t + 0.02);
    g3.gain.linearRampToValueAtTime(0.22, t + 0.05);
    g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    s5.start(t + 0.02, rnd() * 2, 0.5);
    s2.onended = () => { try { f.disconnect(); f2.disconnect(); f3.disconnect(); } catch (e) {} };
    created += 12;
  }

  // ======================================================================
  // THE COP'S LUNGS
  // ======================================================================
  // When he gasses out the breathing IS the mechanic. Everything else in this
  // file is scenery; this is the only sound in the build that the player is
  // supposed to want to stop.
  //
  // One persistent voice: noise through a bandpass whose centre sweeps up on the
  // inhale and down on the exhale, a very high-Q peak that only comes up when he
  // is in trouble (that is the wheeze), and a low pulse train through a narrow
  // filter for the rasp at the back of the throat. Almost entirely dry — your own
  // breath does not come to you via a 2.3 second reverb.
  const brSrc = N(loopNoise(ctx, noise, 0.85, rnd));
  const brBP = N(filt(ctx, 'bandpass', 600, 1.1));
  const brWheeze = N(filt(ctx, 'peaking', 1180, 13, 0));
  const brWheeze2 = N(filt(ctx, 'peaking', 2350, 9, 0));
  const brHP = N(filt(ctx, 'highpass', 180, 0.7));
  const brG = N(gain(ctx, 0));
  brSrc.connect(brBP); brBP.connect(brWheeze); brWheeze.connect(brWheeze2);
  brWheeze2.connect(brHP); brHP.connect(brG);
  const brDry = N(gain(ctx, 1.0)); brG.connect(brDry); brDry.connect(playerOut);
  const brWet = N(gain(ctx, 0.16)); brG.connect(brWet); brWet.connect(wetOut);

  const raspOsc = N(ctx.createOscillator()); raspOsc.type = 'sawtooth'; raspOsc.frequency.value = 74;
  const raspBP = N(filt(ctx, 'bandpass', 330, 3.2));
  const raspLP = N(filt(ctx, 'lowpass', 900, 0.8));
  const raspG = N(gain(ctx, 0));
  raspOsc.connect(raspBP); raspBP.connect(raspLP); raspLP.connect(raspG);
  raspG.connect(brDry); raspOsc.start();

  // the pulse in your ears. Only when he is truly finished, and quiet enough
  // that it reads as a body rather than as a sound effect.
  const heart = N(ctx.createOscillator()); heart.type = 'sine'; heart.frequency.value = 44;
  const heartG = N(gain(ctx, 0)); heart.connect(heartG);
  const heartLP = N(filt(ctx, 'lowpass', 120, 0.9));
  heartG.connect(heartLP); heartLP.connect(playerOut); heart.start();

  const breath = { ph: 0, rate: 0.3, len: 3.3, next: 0, effort: 0, gass: 0, hb: 0 };

  function breathCycle(t, effort, gass) {
    // in : out is about 40:60 at rest and closer to 50:50 when he is gulping
    const rate = lerp(lerp(0.30, 0.95, effort), 2.05, gass);
    const len = (1 / rate) * (0.86 + rnd() * 0.30);       // never a loop
    const inh = len * lerp(0.40, 0.49, gass);
    const lvl = lerp(lerp(0.030, 0.14, effort), 0.62, gass);

    // ---- inhale: filter sweeps up, gets narrow, gets loud
    brBP.frequency.cancelScheduledValues(t);
    brBP.frequency.setValueAtTime(brBP.frequency.value, t);
    brBP.frequency.exponentialRampToValueAtTime(lerp(760, 1420, gass) * (0.9 + rnd() * 0.2), t + inh * 0.75);
    brBP.Q.setTargetAtTime(lerp(1.0, 2.6, gass), t, inh * 0.4);
    brG.gain.cancelScheduledValues(t);
    brG.gain.setValueAtTime(Math.max(0.0001, brG.gain.value), t);
    brG.gain.linearRampToValueAtTime(lvl * (0.9 + rnd() * 0.25), t + inh * (gass > 0.4 ? 0.16 : 0.42));
    // the catch: when he is finished the inhale is not smooth, it stops and
    // restarts
    if (gass > 0.45 && rnd() < 0.55) {
      brG.gain.setTargetAtTime(lvl * 0.35, t + inh * 0.34, 0.02);
      brG.gain.setTargetAtTime(lvl * 1.05, t + inh * 0.46, 0.03);
    }
    brG.gain.setTargetAtTime(lvl * 0.12, t + inh * 0.86, 0.045);

    // ---- exhale: down and out, with the rasp on it
    const ex = t + inh;
    brBP.frequency.exponentialRampToValueAtTime(lerp(430, 300, gass) * (0.9 + rnd() * 0.2), ex + (len - inh) * 0.8);
    brG.gain.setTargetAtTime(lvl * lerp(0.7, 1.0, gass), ex + 0.03, 0.05);
    brG.gain.setTargetAtTime(0.0008, ex + (len - inh) * 0.72, 0.06);

    // wheeze rides the inhale and only exists when he is in trouble
    const wz = clamp((gass - 0.15) / 0.85, 0, 1);
    brWheeze.gain.cancelScheduledValues(t);
    brWheeze.gain.setValueAtTime(0, t);
    brWheeze.gain.linearRampToValueAtTime(wz * (14 + rnd() * 8), t + inh * 0.5);
    brWheeze.gain.setTargetAtTime(0, t + inh * 0.9, 0.08);
    brWheeze.frequency.setValueAtTime(1050 + rnd() * 420, t);
    brWheeze2.gain.cancelScheduledValues(t);
    brWheeze2.gain.setValueAtTime(0, t);
    brWheeze2.gain.linearRampToValueAtTime(wz * (6 + rnd() * 6), t + inh * 0.55);
    brWheeze2.gain.setTargetAtTime(0, t + inh * 0.92, 0.09);

    // rasp on the exhale
    raspOsc.frequency.setValueAtTime((66 + rnd() * 22) * lerp(1, 1.18, gass), ex);
    raspG.gain.cancelScheduledValues(ex);
    raspG.gain.setValueAtTime(0, ex);
    raspG.gain.linearRampToValueAtTime(wz * 0.075 * (0.6 + rnd() * 0.8), ex + 0.05);
    raspG.gain.setTargetAtTime(0, ex + (len - inh) * 0.5, 0.09);

    return len;
  }

  // ======================================================================
  // per-frame
  // ======================================================================
  let lastStepAt = -9, phasePrev = 0, phaseInit = false;
  let secTimer = 0, madeLast = 0;
  let doorT = 8 + rnd() * 14;
  let tVox = 5 + rnd() * 11, tKid = 25 + rnd() * 45;
  let lastBoost = 0, lastStag = 0;
  const seen = new Map();       // shopper id -> last known bolted/escaped state

  function update(dt, t, st, zn, lx, lz) {
    secTimer += dt;
    if (secTimer >= 1) { madeLast = created; created = 0; secTimer -= 1; }

    const u = st.cop.userData || {};
    const cx = st.cop.position.x, cz = st.cop.position.z;
    const lslot = slotOf(lx), lbody = Math.abs(lz) < BODY;

    // ---- the cop's feet, off the real gait phase so the sound lands on the
    // frame the leg does. `run()` can advance the sim far faster than wall
    // clock, so a minimum interval keeps a fast-forward from firing a hundred
    // steps into the same tenth of a second.
    if (st.mode !== 'desk') {
      const ph = u.phase || 0;
      if (!phaseInit) { phasePrev = ph; phaseInit = true; }
      const a = Math.floor(phasePrev / Math.PI), b = Math.floor(ph / Math.PI);
      if (b !== a && (u.speed || 0) > 0.35 && t - lastStepAt > 0.11) {
        lastStepAt = t;
        const sp = clamp((u.speed || 0) / 5.0, 0, 1.2);
        step(t + 0.005, sp, 1.0);
      }
      phasePrev = ph;
    } else phaseInit = false;

    // ---- breathing
    const K = st.tuning || {};
    const smax = K.staminaMax || 1.4;
    const wind = clamp((u.stamina == null ? smax : u.stamina) / smax, 0, 1);
    const gassed = u.gassed ? 1 : 0;
    // effort lags the speed; a fat man's lungs do not know he stopped for a
    // second and a half
    const eff = clamp((u.speed || 0) / 4.6, 0, 1) * 0.55 + (1 - wind) * 0.75;
    breath.effort += (clamp(eff, 0, 1) - breath.effort) * (1 - Math.exp(-1.6 * Math.min(0.1, dt)));
    // gass rises instantly and comes off slowly — that asymmetry is the feeling
    const gTarget = gassed ? 1 : clamp((1 - wind) * 0.75, 0, 0.6);
    breath.gass += (gTarget - breath.gass) * (1 - Math.exp(-(gTarget > breath.gass ? 6.0 : 0.55) * Math.min(0.1, dt)));
    if (t >= breath.next) {
      breath.next = (breath.next < t - 1 ? t : breath.next) + breathCycle(Math.max(t, breath.next), breath.effort, breath.gass);
    }
    // pulse
    if (breath.gass > 0.5) {
      breath.hb -= dt;
      if (breath.hb <= 0) {
        breath.hb = 0.42 + rnd() * 0.06;
        const tt = t + 0.01, v = (breath.gass - 0.5) * 2 * 0.10;
        heartG.gain.cancelScheduledValues(tt);
        heartG.gain.setValueAtTime(0, tt);
        heartG.gain.linearRampToValueAtTime(v, tt + 0.012);
        heartG.gain.exponentialRampToValueAtTime(0.0001, tt + 0.13);
        heartG.gain.setValueAtTime(0, tt + 0.16);
        heartG.gain.linearRampToValueAtTime(v * 0.55, tt + 0.20);
        heartG.gain.exponentialRampToValueAtTime(0.0001, tt + 0.30);
      }
    }
    // at the desk he is sitting down, so the breath is quiet but it is there
    to(brDry.gain, st.mode === 'desk' ? 0.55 : 1.0, t, 0.3);

    // ---- carts and bodies: re-aim the pool at whatever is nearest.
    const sh = st.shoppers || [];
    // cheap partial sort: score every shopper, keep the best few
    for (let i = 0; i < sh.length; i++) {
      const s = sh[i];
      s._d = (s.position.x - lx) * (s.position.x - lx) + (s.position.z - lz) * (s.position.z - lz);
      // a man running is worth hearing from further away than a man shopping
      if (s.bolted) s._d *= 0.18;
    }
    const near = sh.slice().sort((a, b) => a._d - b._d);

    let ci = 0;
    for (let i = 0; i < near.length && ci < CARTS; i++) {
      const s = near[i];
      if (!s.hasCart || !s.cart || !s.cart.visible || s._d > 40 * 40) continue;
      const c = carts[ci++];
      c.sid = s.id;
      const px = s.cart.position ? s.cart.position.x : s.position.x;
      const pz = s.cart.position ? s.cart.position.z : s.position.z;
      setPos(c.p, px, 0.55, pz, t, 0.05);
      const sp = clamp(s.speed || 0, 0, 4);
      // wheel rate for a 100 mm castor
      const wheel = clamp(sp * 3.1, 0.1, 12);
      c.modSrc.playbackRate.setTargetAtTime(clamp(sp * 1.35, 0.12, 3.2), t, 0.15);
      c.sqLFO.frequency.setTargetAtTime(wheel, t, 0.15);
      to(c.vg.gain, clamp(sp * 0.62, 0, 1.0), t, 0.12);
      // the squeal needs load and speed; a stationary bad wheel is silent
      to(c.sqG.gain, c.bad * clamp((sp - 0.5) * 0.18, 0, 0.17) * (0.6 + 0.4 * Math.sin(t * 0.7 + c.sqBase)), t, 0.2);
      c.sq.frequency.setTargetAtTime(c.sqBase * (1 + sp * 0.06), t, 0.3);
    }
    for (let i = ci; i < CARTS; i++) to(carts[i].vg.gain, 0, t, 0.25);

    let ai = 0;
    for (let i = 0; i < near.length && ai < AGENTS; i++) {
      const s = near[i];
      if (s._d > 34 * 34) break;
      const a = agents[ai++];
      if (a.sid !== s.id) { a.sid = s.id; a.phase = s.phase || 0; }
      setPos(a.p, s.position.x, 0.9, s.position.z, t, 0.05);
      // occlusion: different aisle slot, both alongside the gondolas
      const diff = Math.abs(slotOf(s.position.x) - lslot);
      const thru = (diff >= 1 && lbody && Math.abs(s.position.z) < BODY) ? Math.min(1, diff * 0.75) : 0;
      to(a.oc.frequency, lerp(18000, 640, thru), t, 0.12);
      to(a.g.gain, lerp(0.6, 0.34, thru) * (s.bolted ? 1.5 : 1), t, 0.12);
      // his feet
      const ph = s.phase || 0;
      if (Math.floor(ph / Math.PI) !== Math.floor(a.phase / Math.PI)
          && (s.speed || 0) > 0.3 && t - a.last > 0.1) {
        a.last = t;
        step(t + 0.004, clamp((s.speed || 0) / 5.2, 0, 1.1) * (s.bolted ? 1.15 : 0.6), s.bolted ? 0.7 : 0.42, a.kit);
      }
      a.phase = ph;
    }
    for (let i = ai; i < AGENTS; i++) to(agents[i].g.gain, 0, t, 0.3);

    // ---- checkouts
    for (const L of lanes) {
      L.t -= dt;
      if (L.t > 0) continue;
      if (L.busy) {
        beep(t + rnd() * 0.06, L.p);
        L.left--;
        L.t = (0.55 + rnd() * 1.5) / L.rate;
        if (rnd() < 0.18) bagging(t + 0.15, L.p);
        if (L.left <= 0) {
          L.busy = false;
          printer(t + 0.5 + rnd() * 0.7, L.p);
          if (rnd() < 0.45) drawer(t + 1.4 + rnd() * 0.8, L.p);
          L.t = 8 + rnd() * 26;              // the gap between customers
        }
      } else {
        L.busy = true; L.left = 5 + ((rnd() * 24) | 0);
        L.t = 1.5 + rnd() * 3;
      }
    }

    // ---- doors: somebody comes in or goes out every so often
    doorT -= dt;
    if (doorT <= 0) { doorT = 11 + rnd() * 26; doorCycle(t + 0.1, rnd() < 0.5 ? 0 : 1); }

    // ---- somebody two aisles over says something you cannot make out
    tVox -= dt;
    if (tVox <= 0 && near.length) {
      tVox = 7 + rnd() * 17;
      const pick = near[Math.min(near.length - 1, 1 + ((rnd() * 4) | 0))];
      if (pick && pick._d > 9 && pick._d < 30 * 30) {
        setPos(voxS.p, pick.position.x, 1.55, pick.position.z);
        talk.say({ when: t + 0.05, dur: 0.9 + rnd() * 2.1, dest: voxS.in, level: 0.30,
          f0: rnd() < 0.5 ? 104 + rnd() * 26 : 176 + rnd() * 40,
          rate: 3.4 + rnd() * 1.6, tense: rnd() < 0.5 ? 1.0 : 1.12 });
      }
    }
    // ---- and there is always one child
    tKid -= dt;
    if (tKid <= 0) {
      tKid = 34 + rnd() * 70;
      const ang = rnd() * Math.PI * 2, rr2 = 12 + rnd() * 20;
      setPos(kidS.p, clamp(lx + Math.cos(ang) * rr2, STORE.minX + 2, STORE.maxX - 2),
        1.05, clamp(lz + Math.sin(ang) * rr2, STORE.minZ + 2, STORE.maxZ - 2));
      talk.say({ when: t + 0.05, dur: 0.5 + rnd() * 1.6, dest: kidS.in, level: 0.34,
        f0: 250 + rnd() * 95, rate: 2.5 + rnd() * 1.6, tense: 1.34 });
    }

    // ---- he grabbed something off a shelf. agents.js does not tell us; his own
    // boost timer going up is the honest tell, same as speed is for sprinting.
    const bo = u.boost || 0;
    if (bo > lastBoost + 0.05 && t - lastStepAt > -1) grab(t + 0.01, rnd() < 0.5 ? 'energy' : 'donuts');
    lastBoost = bo;
    // ---- and somebody went through him
    const sg = u.stagger || 0;
    if (sg > lastStag + 0.05) barge(t + 0.01);
    lastStag = sg;

    // ---- events off the agent state, not off a game callback we do not own
    for (const s of sh) {
      const key = (s.bolted ? 1 : 0) | (s.escaped ? 2 : 0) | (s.caught ? 4 : 0);
      const was = seen.get(s.id);
      if (seen.size > 256) seen.clear();
      if (was === undefined) { seen.set(s.id, key); continue; }
      if (key !== was) {
        seen.set(s.id, key);
        if ((key & 1) && !(was & 1)) {
          // he goes. A cart shoved out of the way, and the sound of somebody
          // taking a hard first step. No stinger — the store does not know.
          if (s._d < 26 * 26) shove(t + 0.02, s.position.x, s.position.z);
        }
        if ((key & 2) && !(was & 2)) {
          const wh = Math.abs(s.position.x - EXIT.x) < Math.abs(s.position.x - EXIT2.x) ? 0 : 1;
          doorCycle(t + 0.02, wh); easAlarm(t + 0.30, wh);
        }
      }
    }
    return madeLast;
  }

  // A cart taking a shoulder. Steel on steel and then wheels chattering.
  const shoveS = spot(0, 0.6, 0, 3.0, 1.2, 0.9, 0.7);
  const shovePan = shoveS.in;
  function shove(t, x, z) {
    setPos(shoveS.p, x, 0.6, z);
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 1.3;
    const f = filt(ctx, 'bandpass', 1650, 1.1); const pk = filt(ctx, 'peaking', 3400, 4, 9);
    const g = gain(ctx, 0);
    s.connect(g); g.connect(f); f.connect(pk); pk.connect(shovePan);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.30, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.02, t + 0.22);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    s.start(t, rnd() * 2, 0.9);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = 210;
    const og = gain(ctx, 0); o.connect(og); og.connect(shovePan);
    og.gain.setValueAtTime(0.11, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.start(t); o.stop(t + 0.4);
    s.onended = () => { try { f.disconnect(); pk.disconnect(); og.disconnect(); } catch (e) {} };
    created += 8;
  }

  return { update, nodes, step, beep, doorCycle, easAlarm, grab, barge, carts, agents, lanes };
}
