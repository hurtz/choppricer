// OWNER: builder-audio. THE MONITOR ROOM.
//
// The desk must NOT sound like the store. It is an alcove behind the customer
// service counter with nine CRTs in it, and the whole point of walking out onto
// the floor is that the room opens up when you do. So: a 0.33 s room, a wall of
// flyback whine, a fan, and the store arriving mostly through a partition and
// partly round the edge of the counter (see room.js — the leak matters; a store
// filtered to death behind a wall reads as a recording, not as next door).
//
// The flyback is 15734 Hz — the NTSC horizontal line rate — and nine of them at
// slightly different loads beat against each other at a few hertz. Half the
// people who play this will not hear it at all and every one of them will feel
// the difference when it stops.

import { gain, filt, panner, loopNoise, mulberry, to, clamp } from './dsp.js';
import { createVoiceBank } from './voice.js';

export function createDesk(ctx, room, out, wetOut, noise, pinkBuf) {
  const rnd = mulberry(31337);
  const nodes = [];
  const N = (n) => { nodes.push(n); return n; };

  const bus = N(gain(ctx, 0));            // 0 on the floor, 1 at the desk
  const dry = N(gain(ctx, 1)); bus.connect(dry); dry.connect(out);
  const wet = N(gain(ctx, 0.55)); bus.connect(wet); wet.connect(wetOut);

  // ---- nine CRTs ---------------------------------------------------------
  const crt = N(gain(ctx, 0.0032));
  for (const [f, g] of [[15731.5, 1.0], [15734.3, 0.85], [15738.2, 0.6], [15729.0, 0.45]]) {
    const o = N(ctx.createOscillator()); o.type = 'sine'; o.frequency.value = f;
    const gg = N(gain(ctx, g)); o.connect(gg); gg.connect(crt); o.start();
  }
  const crtHP = N(filt(ctx, 'highpass', 9000, 0.7));
  crt.connect(crtHP); crtHP.connect(bus);

  // their transformers, which is the part you actually feel
  const crtHum = N(gain(ctx, 0.022));
  for (const [f, g] of [[120, 1.0], [240, 0.42], [360, 0.28], [480, 0.12]]) {
    const o = N(ctx.createOscillator()); o.type = 'sine'; o.frequency.value = f;
    const gg = N(gain(ctx, g)); o.connect(gg); gg.connect(crtHum); o.start();
  }
  crtHum.connect(bus);

  // static off the tubes
  const stat = N(loopNoise(ctx, noise, 1.03, rnd));
  const statHP = N(filt(ctx, 'highpass', 4200, 0.7));
  const statG = N(gain(ctx, 0.014));
  stat.connect(statHP); statHP.connect(statG); statG.connect(bus);

  // ---- the DVR and the PC under the desk ---------------------------------
  const fan = N(loopNoise(ctx, pinkBuf, 0.91, rnd));
  const fanLP = N(filt(ctx, 'lowpass', 780, 0.75));
  const fanPk = N(filt(ctx, 'peaking', 94, 2.4, 8));
  const fanPk2 = N(filt(ctx, 'peaking', 188, 3.0, 4));
  const fanG = N(gain(ctx, 0.16));
  fan.connect(fanLP); fanLP.connect(fanPk); fanPk.connect(fanPk2); fanPk2.connect(fanG);
  fanG.connect(bus);

  // the desk's own tube, which is a metre over your head and not a hundred
  const tube = N(ctx.createOscillator()); tube.type = 'sawtooth'; tube.frequency.value = 120;
  const tubeBP = N(filt(ctx, 'bandpass', 400, 1.2));
  const tubePk = N(filt(ctx, 'peaking', 1250, 4, 8));
  const tubeG = N(gain(ctx, 0.016));
  tube.connect(tubeBP); tubeBP.connect(tubePk); tubePk.connect(tubeG); tubeG.connect(bus);
  tube.start();

  // ---- one-shots ---------------------------------------------------------
  const clickBP = N(filt(ctx, 'bandpass', 2900, 1.6)); clickBP.connect(bus);
  function relay(t, v) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 1.4;
    const g = gain(ctx, 0);
    s.connect(g); g.connect(clickBP);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.012);
    s.start(t, rnd() * 2, 0.04);
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }
  // a mechanical drive doing what a DVR makes it do all day
  function seek(t) {
    const n = 3 + ((rnd() * 8) | 0);
    for (let i = 0; i < n; i++) relay(t + i * (0.02 + rnd() * 0.05), 0.03 + rnd() * 0.05);
  }
  function creak(t) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const bp = filt(ctx, 'bandpass', 420, 7);
    const g = gain(ctx, 0);
    o.connect(bp); bp.connect(g); g.connect(bus);
    o.frequency.setValueAtTime(96, t);
    o.frequency.linearRampToValueAtTime(64, t + 0.5);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.06);
    g.gain.setTargetAtTime(0.0001, t + 0.18, 0.11);
    o.start(t); o.stop(t + 0.7);
    o.onended = () => { try { g.disconnect(); bp.disconnect(); } catch (e) {} };
  }

  // ---- the store radio ---------------------------------------------------
  // Loss prevention carries one. It squelches, somebody says four words in the
  // produce cooler, it squelches again.
  const radioIn = N(gain(ctx, 1));
  const rHP = N(filt(ctx, 'highpass', 420, 0.8));
  const rLP = N(filt(ctx, 'lowpass', 2600, 0.9));
  const rPk = N(filt(ctx, 'peaking', 1400, 1.6, 7));
  const rG = N(gain(ctx, 0.30));
  const rPan = N(panner(ctx, 0.55, 0.15, -0.3, 1.0, 0.6));
  radioIn.connect(rHP); rHP.connect(rLP); rLP.connect(rPk); rPk.connect(rG);
  rG.connect(rPan); rPan.connect(bus);
  const voices = createVoiceBank(ctx, noise, 4242);
  function squelch(t, v) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.playbackRate.value = 1.2;
    const g = gain(ctx, 0);
    s.connect(g); g.connect(radioIn);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + rnd() * 0.05);
    s.start(t, rnd() * 2, 0.14);
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }
  function radio(t) {
    squelch(t, 0.22);
    const dur = 1.6 + rnd() * 2.6;
    voices.say({
      when: t + 0.09, dur, dest: radioIn, level: 0.55,
      f0: rnd() < 0.6 ? 108 + rnd() * 26 : 186 + rnd() * 30,
      rate: 4.0 + rnd() * 1.4, tense: 1.0,
    });
    squelch(t + dur + 0.14, 0.30);
  }

  let tRelay = 3 + rnd() * 9, tSeek = 12 + rnd() * 20, tRadio = 25 + rnd() * 60, tCreak = 20 + rnd() * 40;
  let live = 0;

  function update(dt, t, isDesk) {
    live += ((isDesk ? 1 : 0) - live) * (1 - Math.exp(-4.0 * Math.min(0.1, dt)));
    to(bus.gain, live, t, 0.12);
    if (live < 0.05) return;
    // the multiplexer steps through the cameras all day whether you look or not
    tRelay -= dt; if (tRelay <= 0) { tRelay = 2.5 + rnd() * 11; relay(t + 0.02, 0.06 + rnd() * 0.10); }
    tSeek -= dt; if (tSeek <= 0) { tSeek = 9 + rnd() * 26; seek(t + 0.02); }
    tCreak -= dt; if (tCreak <= 0) { tCreak = 22 + rnd() * 55; creak(t + 0.02); }
    tRadio -= dt; if (tRadio <= 0) { tRadio = 30 + rnd() * 90; radio(t + 0.05); }
    // the tubes drift the way the store's do
    to(crt.gain, 0.0032 * (0.85 + 0.3 * Math.sin(t * 0.11)), t, 1.0);
  }

  return { update, nodes, bus, radio, relay };
}
