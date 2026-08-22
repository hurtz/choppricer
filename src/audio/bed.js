// OWNER: builder-audio. THE BUILDING.
//
// The part of a supermarket that is running whether anybody is in it or not:
// ballast hum, air handling, refrigeration, the smear of forty people talking
// thirty metres away, and the hiss of a very large volume of air.
//
// Everything here is persistent — it is built once and never retriggered — so
// the per-frame cost is a handful of setTargetAtTime calls and no allocation.
// Nothing loops on a period you could ever hear: every modulator is a sum of
// sines at mutually irrational rates, and every noise bed is a long
// cross-faded buffer read at three different offsets and rates.

import { pinkBuffer, whiteBuffer, gain, filt, panner, loopNoise, ballastWave, mulberry, to, clamp, lerp, smooth } from './dsp.js';
import { STORE, AISLE_LEN } from '../config.js';

const BODY = AISLE_LEN / 2 - 0.62;

// The refrigeration plant, laid out on the runs store.js actually builds:
// the back-wall glass case line (left 56% of the store) and the reach-in bank
// down the whole minX wall. Positions come off config, not off a guess.
function fridgeSpots() {
  const coolX0 = STORE.minX + 1.2, coolX1 = STORE.minX + (STORE.maxX - STORE.minX) * 0.56;
  const cz = STORE.maxZ - 1.1;
  return [
    { x: coolX0 + (coolX1 - coolX0) * 0.16, z: cz, f0: 49.5, on: [58, 104], off: [34, 66], ph: 0.11 },
    { x: coolX0 + (coolX1 - coolX0) * 0.52, z: cz, f0: 47.2, on: [66, 122], off: [28, 58], ph: 0.47 },
    { x: coolX0 + (coolX1 - coolX0) * 0.87, z: cz, f0: 51.8, on: [52, 96], off: [40, 74], ph: 0.79 },
    { x: STORE.minX + 1.0, z: -BODY * 0.55, f0: 46.4, on: [70, 130], off: [30, 62], ph: 0.28 },
    { x: STORE.minX + 1.0, z: BODY * 0.52, f0: 50.6, on: [61, 112], off: [36, 70], ph: 0.63 },
  ];
}

export function createBed(ctx, room, out, wetOut) {
  const rnd = mulberry(1337);
  const nodes = [];       // for the cost report
  const N = (n) => { nodes.push(n); return n; };

  // Three long pink beds at coprime-ish durations, read at slightly different
  // rates. Anything that wants noise taps one of these instead of owning a
  // source, so the whole building costs three BufferSourceNodes.
  const pinkA = pinkBuffer(ctx, 9.1, 11);
  const pinkB = pinkBuffer(ctx, 7.3, 29);
  const white = whiteBuffer(ctx, 3.7, 71);
  const srcA = N(loopNoise(ctx, pinkA, 1.0, rnd));
  const srcB = N(loopNoise(ctx, pinkB, 0.937, rnd));
  const srcC = N(loopNoise(ctx, pinkA, 1.061, rnd));

  // A source's own trim, so a shared bed can feed six chains at six levels.
  const tap = (src, g) => { const n = N(gain(ctx, g)); src.connect(n); return n; };

  // ---- send helper --------------------------------------------------------
  // Every element decides how much of itself is direct and how much arrives via
  // the room. There is no dry-only sound in this building.
  function place(node, dry, wet) {
    const d = N(gain(ctx, dry)); node.connect(d); d.connect(out);
    const w = N(gain(ctx, wet)); node.connect(w); w.connect(wetOut);
    return { dry: d, wet: w };
  }

  // The same, for something with a position — and the send is taken BEFORE the
  // panner on purpose. A reverberant field does not fall off with distance the
  // way direct sound does; a compressor forty metres away puts just as much
  // energy into the room as one next to you, you just stop hearing it directly.
  // Taking the send after the panner (which is what this did in round 1) makes
  // distant sources DRY, which is backwards, and it is the difference between a
  // 4000 m2 room and a diorama of one.
  function placeAt(src, p, dry, wet) {
    src.connect(p);
    const d = N(gain(ctx, dry)); p.connect(d); d.connect(out);
    const w = N(gain(ctx, wet)); src.connect(w); w.connect(wetOut);
    return { dry: d, wet: w };
  }

  // =========================================================================
  // FLUORESCENT BALLAST HUM — 120 Hz and its odd harmonics.
  // =========================================================================
  // Not one buzz: a store has two hundred fixtures, and what you hear is the
  // sum. Mains sits at 60 Hz +- 0.03, so the fixtures beat against each other
  // over five to twenty seconds and the hum never sits still. Three voices with
  // independent slow random walks is enough to read as "hundreds".
  const bwave = ballastWave(ctx, 3);
  const humSum = N(gain(ctx, 1));
  const humOsc = [];
  for (let i = 0; i < 3; i++) {
    const o = N(ctx.createOscillator());
    o.setPeriodicWave(bwave);
    o.frequency.value = 120 + (i - 1) * 0.045;
    const g = N(gain(ctx, [0.0315, 0.0230, 0.0184][i]));
    // each fixture family has its own mechanical resonance, so each voice gets
    // its own colour instead of three copies of one waveform
    const p = N(filt(ctx, 'peaking', [352, 604, 843][i], [3.0, 3.6, 4.2][i], [5, 4, 6][i]));
    const hp = N(filt(ctx, 'highpass', 96, 0.7));
    o.connect(p); p.connect(hp); hp.connect(g); g.connect(humSum);
    o.start();
    humOsc.push({ o, g, base: 120 + (i - 1) * 0.045, walk: rnd() * 6.28 });
  }
  // The rasp. A magnetic ballast that is on its way out buzzes in the 2-4 kHz
  // band at twice mains, and this is the detail that stops the hum reading as a
  // sine. One bad fixture, up in the deck, off to one side.
  const raspSrc = N(tap(srcB, 1));
  const raspBP = N(filt(ctx, 'bandpass', 2650, 2.4));
  const raspBP2 = N(filt(ctx, 'peaking', 3900, 5, 8));
  const raspGate = N(gain(ctx, 0));
  const raspLFO = N(ctx.createOscillator()); raspLFO.type = 'sawtooth'; raspLFO.frequency.value = 120;
  const raspDepth = N(gain(ctx, 0.5));
  raspLFO.connect(raspDepth); raspDepth.connect(raspGate.gain); raspLFO.start();
  const raspPan = N(panner(ctx, STORE.minX + 14, 4.9, 6.0, 6, 0.9));
  raspSrc.connect(raspBP); raspBP.connect(raspBP2); raspBP2.connect(raspGate);
  raspGate.connect(raspPan);
  const raspLvl = N(gain(ctx, 0.026));
  raspPan.connect(raspLvl);
  place(raspLvl, 0.55, 0.85);

  const humLvl = N(gain(ctx, 1.0));
  humSum.connect(humLvl);
  const humPlace = place(humLvl, 0.62, 0.75);

  // =========================================================================
  // HVAC — broad rumble under 200 Hz that is never quite steady.
  // =========================================================================
  const airLow = tap(srcA, 1);
  const hv1 = N(filt(ctx, 'lowpass', 155, 0.8));
  const hv2 = N(filt(ctx, 'lowpass', 210, 0.6));
  const hvRes = N(filt(ctx, 'peaking', 56, 1.10, 6));
  const hvRes2 = N(filt(ctx, 'peaking', 108, 2.0, 4));
  const hvHP = N(filt(ctx, 'highpass', 33, 0.7));   // below this is speaker damage, not sound
  const hvGain = N(gain(ctx, 0.115));
  airLow.connect(hv1); hv1.connect(hv2); hv2.connect(hvRes); hvRes.connect(hvRes2);
  hvRes2.connect(hvHP); hvHP.connect(hvGain);
  place(hvGain, 0.95, 0.45);

  // The diffusers themselves: air through a grille, up in the ceiling, all over
  // the store. Quiet, wide, and it is most of what makes a big room sound big
  // when nothing else is happening.
  const diff = tap(srcB, 1);
  const dfBP = N(filt(ctx, 'bandpass', 620, 0.55));
  const dfHS = N(filt(ctx, 'highshelf', 2400, 0.7, -8));
  const dfGain = N(gain(ctx, 0.115));
  diff.connect(dfBP); dfBP.connect(dfHS); dfHS.connect(dfGain);
  place(dfGain, 0.35, 1.05);

  // ROOM AIR. A very quiet broadband top end. Without it the store sounds like a
  // synthesiser between events; with it the silence has a floor.
  const air = tap(srcC, 1);
  const airHP = N(filt(ctx, 'highpass', 900, 0.6));
  const airLP = N(filt(ctx, 'lowpass', 7200, 0.6));
  const airG = N(gain(ctx, 0.155));
  air.connect(airHP); airHP.connect(airLP); airLP.connect(airG);
  place(airG, 0.25, 1.0);

  // The top two octaves. Pink noise has already fallen 15 dB by the time it
  // gets here, so this branch takes it back: a shelved-up, high-passed hiss
  // that is the diffusers, the lights, and forty metres of hard air. Without it
  // the store measured 0.000 of its energy above 5 kHz and read as a boiler
  // room. It is quiet and it is doing more work than anything else in the file.
  const airTop = tap(srcB, 1);
  const atHP = N(filt(ctx, 'highpass', 3400, 0.5));
  const atHP2 = N(filt(ctx, 'highpass', 4200, 0.6));
  const atSh = N(filt(ctx, 'highshelf', 5200, 0.7, 9));
  const atLP = N(filt(ctx, 'lowpass', 21500, 0.5));
  const atG = N(gain(ctx, 0.265));
  airTop.connect(atHP); atHP.connect(atHP2); atHP2.connect(atSh); atSh.connect(atLP);
  atLP.connect(atG);
  place(atG, 0.30, 0.95);

  // =========================================================================
  // REFRIGERATION — cycling over minutes, not seconds.
  // =========================================================================
  // A compressor is a motor at ~2900 rpm with a hard mechanical spectrum, a
  // condenser fan, and a case full of moving air. It runs for a minute or two
  // and then stops, and a store has half a dozen of them out of phase. Standing
  // at the dairy is not "the same store but louder" — it is a different set of
  // frequencies, because the near unit's fan hiss survives the distance the far
  // ones' does not.
  const units = fridgeSpots().map((sp, i) => {
    const p = N(panner(ctx, sp.x, 1.1, sp.z, 4.5, 1.05));
    const body = N(gain(ctx, 0));               // duty-cycle envelope

    const mot = N(ctx.createOscillator());
    mot.type = 'sawtooth';
    mot.frequency.value = sp.f0;
    const motLP = N(filt(ctx, 'lowpass', 340, 0.9));
    const motPk = N(filt(ctx, 'peaking', sp.f0 * 3, 4, 7));
    const motG = N(gain(ctx, 0.042));
    mot.connect(motLP); motLP.connect(motPk); motPk.connect(motG); motG.connect(body);
    mot.start();

    // case + evaporator air. The lowpass on this one is driven by distance in
    // update() — near the glass it is a hiss, from aisle 4 it is a drone.
    const fan = N(gain(ctx, 1));
    (i % 2 ? srcB : srcC).connect(fan);
    const fanBP = N(filt(ctx, 'bandpass', 780 + i * 90, 0.62));
    const fanLP = N(filt(ctx, 'lowpass', 1400, 0.7));
    const fanG = N(gain(ctx, 0.155));
    fan.connect(fanBP); fanBP.connect(fanLP); fanLP.connect(fanG); fanG.connect(body);

    const rum = N(gain(ctx, 1));
    (i % 2 ? srcA : srcB).connect(rum);
    const rumLP = N(filt(ctx, 'lowpass', 250, 0.8));
    const rumPk = N(filt(ctx, 'peaking', 172, 1.6, 6));
    const rumG = N(gain(ctx, 0.085));
    rum.connect(rumLP); rumLP.connect(rumPk); rumPk.connect(rumG); rumG.connect(body);

    const lvl = N(gain(ctx, 1.0));
    placeAt(body, p, 1.05, 0.40);
    p.connect(lvl);

    return {
      sp, p, body, mot, fanLP, lvl,
      state: rnd() < 0.6 ? 'on' : 'off',
      t: rnd() * (rnd() < 0.6 ? 70 : 45),
      dur: sp.on[0] + rnd() * (sp.on[1] - sp.on[0]),
      f0: sp.f0,
    };
  });

  // The rack in the back room. Always on, never located, and it is the reason a
  // supermarket has a floor of low-mid noise even at 6 am.
  const rack = tap(srcA, 1);
  const rkBP = N(filt(ctx, 'bandpass', 205, 0.75));
  const rkPk = N(filt(ctx, 'peaking', 96, 2.2, 7));
  const rkG = N(gain(ctx, 0.045));
  rack.connect(rkBP); rkBP.connect(rkPk); rkPk.connect(rkG);
  place(rkG, 0.55, 0.85);

  // =========================================================================
  // PEOPLE — a smear, never a word.
  // =========================================================================
  // Rendered offline into one 16-second mono buffer at 11 kHz (there is nothing
  // above 2.5 kHz in a crowd heard across a store), then read by three sources
  // at different rates and offsets. Composite period is minutes; individual
  // period is inaudible because a crowd has no features to loop.
  const murmur = murmurBuffer(ctx, 16.0, 12, 606);
  const talkers = [
    { x: -6, z: STORE.minZ + 6.5, rate: 1.0, g: 0.85 },     // the front end
    { x: 6, z: 2.0, rate: 0.941, g: 0.6 },                   // mid store
    { x: -14, z: 11.0, rate: 1.077, g: 0.5 },                // back left
  ].map((t) => {
    const s = N(loopNoise(ctx, murmur, t.rate, rnd));
    const bp = N(filt(ctx, 'bandpass', 780, 0.5));
    const hs = N(filt(ctx, 'highshelf', 1900, 0.7, -6));
    const p = N(panner(ctx, t.x, 1.55, t.z, 7, 0.75));
    const g = N(gain(ctx, 0.26 * t.g));
    s.connect(bp); bp.connect(hs); hs.connect(g);
    // Mostly wet. You are never hearing a voice from thirty metres away; you are
    // hearing the room's opinion of one.
    placeAt(g, p, 0.52, 0.40);
    return { p, g, base: t, s };
  });

  // =========================================================================
  // per-frame
  // =========================================================================
  // Modulators are sums of sines at mutually irrational rates. There is no
  // period, so there is no loop, and it costs seven Math.sin calls a frame.
  let clock = 0;
  const hvBase = 0.115;

  function update(dt, t, zn, cop) {
    clock += dt;
    const c = clock;

    // --- HVAC never quite steady
    const hvm = 1 + 0.20 * Math.sin(c * 0.0389) + 0.11 * Math.sin(c * 0.1237 + 1.7)
                  + 0.06 * Math.sin(c * 0.0113 + 4.1);
    to(hvGain.gain, hvBase * hvm, t, 0.9);
    to(hvRes.frequency, 56 + 2.4 * Math.sin(c * 0.0271), t, 1.2);
    to(dfGain.gain, 0.115 * (1 + 0.22 * Math.sin(c * 0.0733 + 2.2)), t, 0.8);

    // --- ballast: a slow random walk of a few hundredths of a hertz, which is
    // exactly what the grid does. The three voices drift past each other and the
    // beat rate wanders between about four and thirty seconds.
    for (let i = 0; i < humOsc.length; i++) {
      const h = humOsc[i];
      h.walk += dt * (0.13 + i * 0.037);
      to(h.o.frequency, h.base + 0.055 * Math.sin(h.walk) + 0.022 * Math.sin(h.walk * 2.61 + i), t, 1.5);
    }
    // the bad fixture stutters now and then
    const flick = Math.sin(c * 0.317) * Math.sin(c * 1.913 + 0.7) * Math.sin(c * 0.0871);
    to(raspLvl.gain, 0.026 * (0.55 + 0.9 * clamp(flick * 2 + 0.7, 0, 1.4)), t, 0.25);

    // --- refrigeration duty cycles
    for (const u of units) {
      u.t += dt;
      if (u.t >= u.dur) {
        u.t = 0;
        if (u.state === 'on') {
          u.state = 'off';
          u.dur = u.sp.off[0] + rnd() * (u.sp.off[1] - u.sp.off[0]);
          // spin-down: the motor drops about eight per cent as it coasts
          u.body.gain.cancelScheduledValues(t);
          u.body.gain.setTargetAtTime(0.0, t, 0.75);
          u.mot.frequency.cancelScheduledValues(t);
          u.mot.frequency.setValueAtTime(u.f0, t);
          u.mot.frequency.exponentialRampToValueAtTime(u.f0 * 0.905, t + 2.4);
        } else {
          u.state = 'on';
          u.dur = u.sp.on[0] + rnd() * (u.sp.on[1] - u.sp.on[0]);
          // start: the motor pulls down under load and climbs back
          u.body.gain.cancelScheduledValues(t);
          u.body.gain.setValueAtTime(u.body.gain.value, t);
          u.body.gain.linearRampToValueAtTime(1.16, t + 0.55);
          u.body.gain.setTargetAtTime(1.0, t + 0.55, 0.9);
          u.mot.frequency.cancelScheduledValues(t);
          u.mot.frequency.setValueAtTime(u.f0 * 0.86, t);
          u.mot.frequency.setTargetAtTime(u.f0, t + 0.05, 0.35);
        }
      }
      // distance colour: from the glass it is air, from aisle 4 it is a drone.
      const dx = cop.x - u.sp.x, dz = cop.z - u.sp.z;
      const d = Math.hypot(dx, dz);
      to(u.fanLP.frequency, lerp(6800, 900, smooth(1.6, 16, d)), t, 0.5);
      // slow load wobble while running
      if (u.state === 'on') to(u.mot.frequency, u.f0 * (1 + 0.004 * Math.sin(c * 0.21 + u.sp.ph * 9)), t, 1.4);
    }

    // --- the crowd drifts. People do not stand still, and a murmur nailed to a
    // coordinate is the fastest way to make a room read as a diorama.
    for (let i = 0; i < talkers.length; i++) {
      const k = talkers[i], b = k.base;
      const ox = 5.5 * Math.sin(c * (0.021 + i * 0.008) + i * 2.1);
      const oz = 4.0 * Math.sin(c * (0.017 + i * 0.006) + i * 3.7);
      if (k.p.positionX) {
        k.p.positionX.setTargetAtTime(b.x + ox, t, 1.5);
        k.p.positionZ.setTargetAtTime(b.z + oz, t, 1.5);
      } else if (k.p.setPosition) k.p.setPosition(b.x + ox, 1.55, b.z + oz);
      // the front end is where the queue is; it gets busier and quieter in waves
      to(k.g.gain, 0.26 * b.g * (0.72 + 0.42 * Math.sin(c * (0.033 + i * 0.011) + i)), t, 1.2);
    }

    // --- the hum is the one thing that does NOT change with the room. It is
    // overhead everywhere, so it stays put while everything else moves, and that
    // is what makes it read as the building rather than as a source.
    to(humPlace.wet.gain, lerp(0.60, 0.92, zn.open), t, 0.4);
  }

  return { update, units, nodes, talkers, murmur };
}

// -------------------------------------------------------------------- murmur
// Ten talkers rendered into one buffer. Each is a two-pole resonator pair fed
// with noise and gated by a syllable train, which is what a voice sounds like
// once the room has taken the consonants off it. Deliberately not intelligible:
// a crowd you can understand is a crowd you are listening TO, and the moment the
// player starts parsing words the store stops being a place.
function murmurBuffer(ctx, seconds, talkers, seed) {
  const sr = 11025;
  const n = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(1, n, sr);
  const d = buf.getChannelData(n === 0 ? 0 : 0);
  const r = mulberry(seed);
  const VOW = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [440, 1020], [500, 1500], [660, 1720]];
  for (let v = 0; v < talkers; v++) {
    const lvl = (0.22 + r() * 0.55) / Math.sqrt(talkers);
    const rate = 3.1 + r() * 2.3;                 // syllables per second
    let sylT = r() * 0.4, sylLen = 0.14, gate = 0;
    let vow = VOW[(r() * VOW.length) | 0];
    let f1 = vow[0], f2 = vow[1], tf1 = f1, tf2 = f2;
    let y1a = 0, y1b = 0, y2a = 0, y2b = 0;
    // phrase structure: people talk for a few seconds and then stop
    let phrase = r() < 0.5, phT = r() * 3;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      sylT -= 1 / sr; phT -= 1 / sr;
      if (phT <= 0) { phrase = !phrase; phT = phrase ? 1.4 + r() * 3.6 : 0.7 + r() * 4.5; }
      if (sylT <= 0) {
        sylT = (1 / rate) * (0.62 + r() * 0.8);
        sylLen = sylT * (0.45 + r() * 0.35);
        vow = VOW[(r() * VOW.length) | 0];
        tf1 = vow[0] * (0.82 + r() * 0.36); tf2 = vow[1] * (0.85 + r() * 0.3);
        gate = phrase ? 1 : 0;
      }
      f1 += (tf1 - f1) * 0.004; f2 += (tf2 - f2) * 0.004;
      // syllable envelope: fast in, slower out, never a square edge
      const age = Math.max(0, sylLen - sylT) / (sylLen || 1);
      const env = gate * Math.min(1, age * 9) * Math.exp(-Math.max(0, (1 / rate - sylT) / sylLen - 0.45) * 2.6);
      if (env > 0.001) {
        const x = (r() * 2 - 1) * env;
        // two resonators = two formants. Enough to be a voice, not enough to be
        // a word.
        const w1 = 2 * Math.PI * f1 / sr, w2 = 2 * Math.PI * f2 / sr;
        const R1 = 0.976, R2 = 0.968;
        const o1 = x + 2 * R1 * Math.cos(w1) * y1a - R1 * R1 * y1b; y1b = y1a; y1a = o1;
        const o2 = x + 2 * R2 * Math.cos(w2) * y2a - R2 * R2 * y2b; y2b = y2a; y2a = o2;
        d[i] += lvl * (o1 * 0.06 + o2 * 0.035);
      }
      if (i === 0 && t < 0) d[i] = 0;
    }
  }
  // tame it, then cross-fade the seam
  let mx = 0;
  for (let i = 0; i < n; i++) mx = Math.max(mx, Math.abs(d[i]));
  const g = mx > 0 ? 0.85 / mx : 1;
  for (let i = 0; i < n; i++) d[i] *= g;
  const x = Math.floor(sr * 0.6);
  for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
  return buf;
}
