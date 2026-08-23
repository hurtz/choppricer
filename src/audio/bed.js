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
import { STORE, AISLE_LEN, AISLE_COUNT, FRONT_WALK_Z, BACK_WALK_Z, aisleX } from '../config.js';

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

export function createBed(ctx, room, out, wetOut, rattleBuf) {
  const rnd = mulberry(1337);
  const nodes = [];       // for the cost report
  const N = (n) => { nodes.push(n); return n; };

  // Three long pink beds at coprime-ish durations, read at slightly different
  // rates. Anything that wants noise taps one of these instead of owning a
  // source, so the whole building costs three BufferSourceNodes.
  //
  // ROUND 2 MADE THEM LONGER AND MADE THEM DRIFT. tools/loopcheck.py on a 50 s
  // bed found the strongest timbral autocorrelation in the whole clip sitting at
  // 9.10 s — pinkA's exact length, read at exactly 1.0. r was only 0.14, but a
  // correlation peak at a known buffer period is not a coincidence, it is the
  // seam, and "nothing perfectly looped" is the one rule in the brief a listener
  // enforces for free.
  //
  // The fix is not a longer buffer (that moves the seam, it does not remove it)
  // — it is that the read rate never stops changing. A looping buffer read at a
  // constant rate has a period. Read at a rate that is always drifting, it has
  // none: the phase never returns to where it was, so there is no lag at which
  // the material lines up with itself. See update(). Costs three
  // setTargetAtTime calls a frame.
  const pinkA = pinkBuffer(ctx, 13.7, 11);
  const pinkB = pinkBuffer(ctx, 11.9, 29);
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
  const dfBP = N(filt(ctx, 'bandpass', 470, 0.42));
  const dfHS = N(filt(ctx, 'highshelf', 2400, 0.7, -5));
  const dfGain = N(gain(ctx, 0.115));
  diff.connect(dfBP); dfBP.connect(dfHS); dfHS.connect(dfGain);
  place(dfGain, 0.35, 1.05);

  // ROOM AIR. A very quiet broadband top end. Without it the store sounds like a
  // synthesiser between events; with it the silence has a floor.
  // ROUND 2: this used to start at 900 Hz. The aisle bed measured 44 dB at
  // 125 Hz and 31 dB at 250 — a thirteen-decibel notch, because HVAC stopped at
  // 210 and nothing in the building started again until 900. A real store is
  // continuous through there: it is cart frames, chests, cardboard, and forty
  // metres of air. A hole that deep is most of what a spectral-flatness number
  // is actually reporting, and it is also why round 1 read as "synthesised".
  const air = tap(srcC, 1);
  const airHP = N(filt(ctx, 'highpass', 430, 0.6));
  const airLP = N(filt(ctx, 'lowpass', 7200, 0.6));
  // ROUND 4: a second pole on the top. One lowpass at 7200 falls at 12 dB/oct,
  // which still has this layer 10 dB up at 12 kHz where a room has nothing.
  // Two poles make it fall like a room instead of like a shelf. It costs
  // nothing below 4 kHz, which is the half of this layer that does the work.
  const airLP2 = N(filt(ctx, 'lowpass', 6400, 0.55));
  const AIR_BASE = 0.19;
  const airG = N(gain(ctx, AIR_BASE));
  air.connect(airHP); airHP.connect(airLP); airLP.connect(airLP2); airLP2.connect(airG);
  place(airG, 0.25, 1.0);

  // THE TOP OF THE ROOM.
  //
  // ROUND 4 — THIS WAS THE HISS, AND IT IS THE WHOLE OF BUG 1. The client, on
  // speakers: "there's this bad hiss in the background, just constantly going
  // ... it sounds like there's music in the background, it actually sounds
  // good, but the hissing is bad." It was this branch. Bed alone, aisle 4,
  // muting this one gain node and nothing else:
  //
  //                        5-8 kHz    8-12 kHz   12-20 kHz
  //     round 3, shipped   -56.0 dB   -57.7 dB    -58.7 dB
  //     this node muted    -60.1 dB   -66.2 dB    -76.5 dB
  //     so it owned          4.1 dB     8.5 dB      17.8 dB
  //
  // Read the shipped row again. The 12-20 kHz octave came back as loud as the
  // 5-8 kHz one, and the reason is the +6 dB shelf that used to sit at 5200:
  // pink noise falls 3 dB an octave, so a +6 dB shelf spanning two octaves
  // flattens it EXACTLY. What was being generated here was not room air, it was
  // white noise from 5 kHz up — which is the textbook definition of tape hiss,
  // and it is what he heard sitting on top of a tape he otherwise liked.
  //
  // The 0.95 reverb send finished the job. Fed through a 2.35 s tail, the layer
  // loses even the pink bed's own slow movement and becomes perfectly
  // stationary. Every other layer in this file drifts — that is the first thing
  // the top of the file promises. This was the only one that did not, and it is
  // the only one anybody complained about. "Constantly going" is a literal
  // description of a fixed gain on an unmodulated broadband source.
  //
  // What is here now is air absorption, which is what should have been modelled
  // in the first place. 10 kHz loses on the order of 20 dB over the ~680 m of
  // path length inside a 2 s tail, so the top end of a big room falls away hard
  // and is gone by 12 k. A supermarket is bright in the MIDS because nothing in
  // it is soft; that is not the same claim as flat to 20 kHz.
  //
  // Kept, because it is still true: without SOME energy up here the store
  // measured 0.000 above 5 kHz and read as a boiler room. The layer stays. It
  // stops being a hiss generator.
  const airTop = tap(srcB, 1);
  const atHP = N(filt(ctx, 'highpass', 3400, 0.5));
  const atHP2 = N(filt(ctx, 'highpass', 4200, 0.6));
  // The first pass at this fix overshot: -1 dB of shelf with the corner at 7600
  // took 5.6-11.2 kHz down 12.8 dB and everything above 11.2 kHz down 36.8, and
  // a store with NOTHING above 11 kHz is the round-1 boiler room again from the
  // other side. The corner went to 9000 and the shelf back to +1, which lands
  // the audible part of the cut at about 7 dB and leaves the ultrasonic part —
  // the half that was pure hiss and no room — down where it belongs.
  const atSh = N(filt(ctx, 'highshelf', 5200, 0.7, 1));    // was +6. That was the bug.
  const atLP = N(filt(ctx, 'lowpass', 9000, 0.55));        // air absorption
  const atLP2 = N(filt(ctx, 'lowpass', 12000, 0.6));       // and the rest of it
  const AT_BASE = 0.150;                                   // was 0.21
  const atG = N(gain(ctx, AT_BASE));
  airTop.connect(atHP); atHP.connect(atHP2); atHP2.connect(atSh);
  atSh.connect(atLP); atLP.connect(atLP2); atLP2.connect(atG);
  // Wet was 0.95 — nearly all of this layer arrived as reverb, which is what
  // made it stationary. HF does not survive forty metres of air; the top of the
  // room is a local sound, not a reverberant one.
  place(atG, 0.30, 0.30);

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
  // ROUND 2 — THE BROADBAND HALF OF A SUPERMARKET
  // =========================================================================
  // Measured on round 1's clips: spectral flatness 0.03-0.07 against a real
  // store recording's 0.10-0.62, and 39% of the whole bed's energy sitting in
  // one octave at 90-180 Hz. That is a plant room with a hum in it. A real
  // store is mostly NOISE — wheels, air, cardboard, forty people — with the
  // tonal things (ballast, compressors) sitting ON TOP of it rather than being
  // the whole of it. Band-by-band against the ambience bed:
  //
  //     355-710 Hz   -52 dBFS        the murmur, and nothing else
  //     710-1400 Hz  -64 dBFS        a hole
  //    1400-2800 Hz  -73 dBFS        a bigger hole
  //
  // Everything below fills that. None of it is a new idea about what a
  // supermarket sounds like; all of it is stuff that was missing.
  //
  // It is also where the four PLACES come from. Round 1 got the desk vs the
  // floor genuinely right and that structural win is protected; this extends
  // the same idea sideways, so the chilled run, the back wall and the front end
  // are three more rooms you can identify with your eyes shut:
  //
  //    chilled run   an open-case air curtain, which is a wall of broadband
  //                  hiss, plus glass ticking as it warms and a defrost cycle
  //    back wall     the rack and the back room through a swing door, and the
  //                  door itself
  //    front end     traffic through the glass, and the belts

  // ---- CART TRAFFIC -------------------------------------------------------
  // The single most under-rated sound in a supermarket. There is ALWAYS a cart
  // rolling somewhere, and a 100 mm castor on VCT is broadband from 150 Hz to
  // 5 kHz with a hard rattle on top of it. foley.js gives the four nearest
  // visible shoppers real carts; this is everybody else, which is most of them.
  //
  // Each voice takes a trip: it appears somewhere, crosses the store over
  // fifteen to forty seconds, and stops. The amplitude modulation is the shared
  // rattle buffer read at a speed that tracks the trip, so the density of the
  // rattle is physically tied to the wheels and costs no JavaScript.
  const traffic = [];
  for (let i = 0; i < 3; i++) {
    const p = N(panner(ctx, 0, 0.55, 0, 5.0, 0.95));
    const lvl = N(gain(ctx, 0));
    const mod = N(gain(ctx, 0.14));
    const modSrc = N(loopNoise(ctx, rattleBuf, 0.7 + i * 0.2, rnd));
    const modAmt = N(gain(ctx, 1.0));
    modSrc.connect(modAmt); modAmt.connect(mod.gain);
    (i === 1 ? srcB : srcC).connect(mod);
    const bp = N(filt(ctx, 'bandpass', 1000 + i * 260, 0.55));
    const pk = N(filt(ctx, 'peaking', 2500 + i * 380, 2.2, 6));
    const g1 = N(gain(ctx, 0.62));
    mod.connect(bp); bp.connect(pk); pk.connect(g1); g1.connect(lvl);
    // the frame and the castors, which is the half you hear from four aisles away
    const low = N(gain(ctx, 1));
    (i === 1 ? srcA : srcB).connect(low);
    const lowBP = N(filt(ctx, 'bandpass', 165 + i * 22, 0.8));
    const lg = N(gain(ctx, 0.30));
    low.connect(lowBP); lowBP.connect(lg); lg.connect(lvl);
    // and the frame, which is the band nothing else in this building occupies
    const midBP = N(filt(ctx, 'bandpass', 340 + i * 55, 0.5));
    const mg = N(gain(ctx, 0.42));
    mod.connect(midBP); midBP.connect(mg); mg.connect(lvl);
    placeAt(lvl, p, 0.85, 0.62);
    traffic.push({
      p, lvl, modSrc, t: rnd() * 14, dur: 14 + rnd() * 22, on: rnd() < 0.6,
      x0: 0, z0: 0, x1: 0, z1: 0, speed: 0.8,
    });
  }
  function newTrip(k) {
    // Down an aisle, or across the front, or along the back. Carts go where the
    // floor lets them go.
    const kind = rnd();
    const ax = aisleX((rnd() * AISLE_COUNT) | 0);
    if (kind < 0.55) {
      k.x0 = ax; k.x1 = ax + (rnd() - 0.5) * 1.2;
      k.z0 = (rnd() < 0.5 ? -1 : 1) * (BODY + 1.5); k.z1 = -k.z0;
    } else if (kind < 0.8) {
      k.z0 = STORE.minZ + 4.5 + rnd() * 2; k.z1 = k.z0 + (rnd() - 0.5) * 2;
      k.x0 = STORE.minX + 2; k.x1 = STORE.maxX - 2;
      if (rnd() < 0.5) { const s = k.x0; k.x0 = k.x1; k.x1 = s; }
    } else {
      k.z0 = STORE.maxZ - 3.5; k.z1 = k.z0 + (rnd() - 0.5) * 2;
      k.x0 = STORE.minX + 2; k.x1 = STORE.maxX - 2;
      if (rnd() < 0.5) { const s = k.x0; k.x0 = k.x1; k.x1 = s; }
    }
    k.speed = 0.55 + rnd() * 0.85;
    k.dur = Math.hypot(k.x1 - k.x0, k.z1 - k.z0) / k.speed;
    k.t = 0; k.on = true;
  }

  // ---- SOMEBODY IS WORKING ------------------------------------------------
  // A store in the afternoon always has one person putting stock out. It is
  // cardboard, cans on a wire shelf, a box cutter and a pallet jack, it is the
  // broadest-band thing in the building, and it moves to a different aisle
  // every minute or so. Shared filters, one-shot sources: a burst is 2 nodes.
  const workP = N(panner(ctx, 0, 1.0, 0, 5.5, 1.0));
  const workIn = N(gain(ctx, 1)); workIn.connect(workP);
  const workDry = N(gain(ctx, 0.55)); workP.connect(workDry); workDry.connect(out);
  const workWet = N(gain(ctx, 0.62)); workIn.connect(workWet); workWet.connect(wetOut);
  const boxBP = N(filt(ctx, 'bandpass', 900, 0.6));
  const boxPk = N(filt(ctx, 'peaking', 2100, 1.4, 5));
  boxBP.connect(boxPk); boxPk.connect(workIn);
  const canBP = N(filt(ctx, 'bandpass', 2900, 1.1));
  const canPk = N(filt(ctx, 'peaking', 5200, 2.0, 7));
  canBP.connect(canPk); canPk.connect(workIn);
  function burst(t, dest, n, lvl, spread, rate) {
    for (let i = 0; i < n; i++) {
      const tt = t + i * (spread * (0.3 + rnd()));
      const s = ctx.createBufferSource(); s.buffer = white;
      s.playbackRate.value = rate * (0.7 + rnd() * 0.7);
      const g = gain(ctx, 0);
      s.connect(g); g.connect(dest);
      g.gain.setValueAtTime(lvl * (0.35 + rnd()), tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.02 + rnd() * 0.06);
      s.start(tt, rnd() * 2, 0.12);
      s.onended = () => { try { g.disconnect(); } catch (e) {} };
    }
  }
  // the jack. Hydraulic squeal on the way up, steel wheels on the way anywhere.
  function palletJack(t) {
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const bp = filt(ctx, 'bandpass', 780, 6);
    const g = gain(ctx, 0);
    o.connect(bp); bp.connect(g); g.connect(workIn);
    o.frequency.setValueAtTime(210, t);
    o.frequency.linearRampToValueAtTime(340, t + 1.1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.2);
    g.gain.setValueAtTime(0.045, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.start(t); o.stop(t + 1.4);
    o.onended = () => { try { bp.disconnect(); g.disconnect(); } catch (e) {} };
    burst(t + 1.2, boxBP, 6, 0.06, 0.09, 0.55);
  }
  const work = { t: 3 + rnd() * 8, move: 12 + rnd() * 30, x: 0, z: 0, jack: 30 + rnd() * 60 };

  // ---- THE CHILLED RUN ----------------------------------------------------
  // An open multideck case blows a curtain of cold air across its own mouth at
  // about 0.5 m/s through a slot the length of the case. Standing at the dairy,
  // that curtain is the LOUDEST thing you can hear and it is almost pure
  // broadband noise from 400 Hz to 8 kHz. It is also the reason a chilled aisle
  // is instantly identifiable with your eyes shut, and round 1 did not have it
  // at all — the chilled clip differed from the aisle only in how much
  // compressor drone was in it.
  //
  // Two runs, two positions: the back-wall case line and the reach-in bank down
  // the whole left wall. Each gets its own level from its own distance, so the
  // dairy is on your LEFT and the frozen food is BEHIND you.
  const coolX0 = STORE.minX + 1.2, coolX1 = STORE.minX + (STORE.maxX - STORE.minX) * 0.56;
  //
  // Both are LINE SOURCES, and that matters more than it sounds like it does.
  // A twenty-six metre run of cases is not a point six metres away; it is the
  // nearest two metres of itself, right there. First pass here put one panner
  // at each run's MIDPOINT and standing at the left-hand end of the dairy
  // measured the curtain 11.7 m away and 30 dB down — a wall of cold air you
  // could not hear while leaning on it. The panner now tracks the nearest point
  // on the run, which is also where the sound is coming from.
  const curtains = [
    { x: (coolX0 + coolX1) * 0.5, z: STORE.maxZ - 1.0, run: 'back' },
    { x: STORE.minX + 0.9, z: 0, run: 'left' },
  ].map((c, i) => {
    const p = N(panner(ctx, c.x, 1.3, c.z, 3.2, 0.85));
    const src = N(gain(ctx, 1));
    (i ? srcA : srcC).connect(src);
    const hp = N(filt(ctx, 'highpass', 380, 0.6));
    const bp = N(filt(ctx, 'peaking', 1500, 0.8, 4));
    const lp = N(filt(ctx, 'lowpass', 9000, 0.6));
    const g = N(gain(ctx, 0));
    src.connect(hp); hp.connect(bp); bp.connect(lp); lp.connect(g);
    placeAt(g, p, 1.1, 0.30);       // mostly direct: it is a nearfield sound
    return { ...c, p, g };
  });
  // Glass warming up, and steel racking. A case ticks all day and every one of
  // those ticks is a metal shelf that has moved a hundredth of a millimetre.
  const tickBP = N(filt(ctx, 'bandpass', 3100, 9));
  const tickPk = N(filt(ctx, 'peaking', 6400, 8, 8));
  const tickP = N(panner(ctx, 0, 1.4, 0, 3.0, 1.0));
  tickBP.connect(tickPk); tickPk.connect(tickP);
  const tickDry = N(gain(ctx, 0.8)); tickP.connect(tickDry); tickDry.connect(out);
  const tickWet = N(gain(ctx, 0.5)); tickPk.connect(tickWet); tickWet.connect(wetOut);
  function tick(t, v) {
    const s = ctx.createBufferSource(); s.buffer = white; s.playbackRate.value = 1.4;
    const g = gain(ctx, 0);
    s.connect(g); g.connect(tickBP);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + rnd() * 0.04);
    s.start(t, rnd() * 2, 0.1);
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }
  // DEFROST. Every case in America goes into defrost a few times a day: the
  // compressor drops out, a heater relay clunks, and for a while there is a
  // wet hiss and water running into a pan. It happens on a clock nobody in the
  // building knows and it is one of those details that is only ever noticed by
  // its absence.
  const defG = N(gain(ctx, 0));
  const defSrc = N(gain(ctx, 1)); srcB.connect(defSrc);
  const defBP = N(filt(ctx, 'bandpass', 2400, 0.5));
  const defPk = N(filt(ctx, 'peaking', 700, 1.2, 5));
  defSrc.connect(defBP); defBP.connect(defPk); defPk.connect(defG);
  const defP = N(panner(ctx, curtains[0].x + 6, 1.2, curtains[0].z, 4.0, 1.0));
  placeAt(defG, defP, 0.9, 0.5);
  const defrost = { t: 40 + rnd() * 160, on: false };
  function relay(t, v) {
    const o = ctx.createOscillator(); o.type = 'triangle';
    const bp = filt(ctx, 'bandpass', 640, 3.5);
    const g = gain(ctx, 0);
    o.connect(bp); bp.connect(g); g.connect(defP);
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(96, t + 0.05);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.start(t); o.stop(t + 0.15);
    o.onended = () => { try { bp.disconnect(); g.disconnect(); } catch (e) {} };
  }

  // ---- THE BACK ROOM ------------------------------------------------------
  // Behind the swing doors at the back wall: the rack, a box fan, a cage being
  // moved, a baler. All of it heard THROUGH A DOOR, which means lowpassed to
  // death and mono, and the fact that you can only hear it from the back wall
  // is what makes the back wall a place.
  // x = 12 and not 4: the back-wall case line covers the left 56% of the store
  // (see fridgeSpots), so a door at x=4 is standing in the dairy and the back
  // room measures as the chilled run with extra steps. Past the cases, it is a
  // fourth place.
  const backP = N(panner(ctx, 12, 1.6, STORE.maxZ - 0.4, 5.0, 1.1));
  const backIn = N(gain(ctx, 1));
  const backLP = N(filt(ctx, 'lowpass', 900, 0.7));
  const backLP2 = N(filt(ctx, 'lowpass', 1500, 0.6));
  const backLvl = N(gain(ctx, 0));
  backIn.connect(backLP); backLP.connect(backLP2); backLP2.connect(backLvl);
  placeAt(backLvl, backP, 0.95, 0.75);
  // the rack itself, louder than the one you hear from the floor
  const bkSrc = N(gain(ctx, 1)); srcA.connect(bkSrc);
  const bkBP = N(filt(ctx, 'bandpass', 260, 0.7));
  const bkPk = N(filt(ctx, 'peaking', 118, 2.0, 8));
  const bkG = N(gain(ctx, 0.42));
  bkSrc.connect(bkBP); bkBP.connect(bkPk); bkPk.connect(bkG); bkG.connect(backIn);
  // and a box fan, which every back room in the world has
  const bfSrc = N(gain(ctx, 1)); srcC.connect(bfSrc);
  const bfBP = N(filt(ctx, 'bandpass', 520, 0.5));
  const bfPk = N(filt(ctx, 'peaking', 88, 3.0, 6));
  const bfG = N(gain(ctx, 0.30));
  bfSrc.connect(bfBP); bfBP.connect(bfPk); bfPk.connect(bfG); bfG.connect(backIn);
  // the doors. Two leaves, a spring each, and they hit each other twice.
  function swingDoor(t) {
    for (const [dt2, v] of [[0, 0.55], [0.16, 0.34], [0.29, 0.18], [0.39, 0.09]]) {
      const s = ctx.createBufferSource(); s.buffer = white; s.playbackRate.value = 0.5;
      const f = filt(ctx, 'bandpass', 300 + rnd() * 160, 1.0);
      const g = gain(ctx, 0);
      s.connect(g); g.connect(f); f.connect(backP);
      g.gain.setValueAtTime(v, t + dt2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt2 + 0.11);
      s.start(t + dt2, rnd() * 2, 0.2);
      s.onended = () => { try { f.disconnect(); g.disconnect(); } catch (e) {} };
    }
    // a cage rolling out after it
    if (rnd() < 0.5) burst(t + 0.5, boxBP, 9, 0.09, 0.13, 0.5);
  }
  const backEv = { door: 25 + rnd() * 70, clatter: 18 + rnd() * 40 };

  // ---- THE FRONT END ------------------------------------------------------
  // Forty metres of glass, a car park behind it, and eight belts. The traffic
  // is the giveaway: a low rumble that is plainly OUTSIDE, which exists at the
  // front of every store and has completely gone by aisle four. It is also the
  // only thing in this building that tells you the building has an outside.
  const roadP = N(panner(ctx, 6, 1.2, STORE.minZ - 1.5, 8.0, 0.7));
  const roadSrc = N(gain(ctx, 1)); srcA.connect(roadSrc);
  const roadLP = N(filt(ctx, 'lowpass', 260, 0.7));
  const roadPk = N(filt(ctx, 'peaking', 96, 1.1, 7));
  const roadG = N(gain(ctx, 0));
  roadSrc.connect(roadLP); roadLP.connect(roadPk); roadPk.connect(roadG);
  // and the glass, which passes a thin band of the outside world above 1 kHz
  const glSrc = N(gain(ctx, 1)); srcB.connect(glSrc);
  const glBP = N(filt(ctx, 'bandpass', 1400, 0.45));
  const glG = N(gain(ctx, 0));
  glSrc.connect(glBP); glBP.connect(glG);
  const roadSum = N(gain(ctx, 1)); roadG.connect(roadSum); glG.connect(roadSum);
  placeAt(roadSum, roadP, 0.85, 0.75);
  // the belts. A 60 Hz gearmotor and a rubber belt over a steel bed, and there
  // are eight of them starting and stopping independently.
  const beltP = N(panner(ctx, 0, 0.9, FRONT_WALK_Z - 1.8, 6.0, 0.9));
  const beltSrc = N(gain(ctx, 1)); srcC.connect(beltSrc);
  const beltBP = N(filt(ctx, 'bandpass', 420, 0.7));
  const beltPk = N(filt(ctx, 'peaking', 122, 3.0, 7));
  const beltPk2 = N(filt(ctx, 'peaking', 1800, 1.2, 3));
  const beltG = N(gain(ctx, 0));
  beltSrc.connect(beltBP); beltBP.connect(beltPk); beltPk.connect(beltPk2); beltPk2.connect(beltG);
  placeAt(beltG, beltP, 0.85, 0.6);
  const belt = { on: rnd() < 0.5, t: rnd() * 6 };

  // =========================================================================
  // PEOPLE — a smear, never a word.
  // =========================================================================
  // Rendered offline into one 21-second mono buffer at 13 kHz, then read by FOUR
  // sources at different rates and offsets. Composite period is minutes;
  // individual period is inaudible because a crowd has no features to loop —
  // and the treatment on each reader drifts independently, so even the buffer's
  // own period never presents itself twice the same way.
  //
  // ROUND 2 OPENED THE BAND. Round 1 bandpassed the crowd at 780 Hz with a -6 dB
  // shelf over 1.9 kHz, on the theory that a room takes the consonants off. A
  // room does — but it does not take them ALL off, and the result measured
  // -73 dBFS in the 1.4-2.8 kHz octave, i.e. a store where forty people are
  // talking and none of it reaches you. That hole is most of why the bed
  // measured 0.05 flatness and read as a plant room. Sibilance, a laugh and a
  // child carry a very long way in a hard room, and they are broadband.
  const murmur = murmurBuffer(ctx, 21.3, 14, 606);
  const talkers = [
    { x: -6, z: STORE.minZ + 6.5, rate: 1.0, g: 0.95, bp: 760, hi: -3 },   // the front end
    { x: 6, z: 2.0, rate: 0.941, g: 0.62, bp: 900, hi: -5 },               // mid store
    { x: -14, z: 11.0, rate: 1.077, g: 0.52, bp: 700, hi: -7 },            // back left
    { x: 12, z: -4.0, rate: 1.021, g: 0.45, bp: 1150, hi: 0 },             // somebody nearer
  ].map((t) => {
    const s = N(loopNoise(ctx, murmur, t.rate, rnd));
    const bp = N(filt(ctx, 'bandpass', t.bp, 0.42));
    const hs = N(filt(ctx, 'highshelf', 1900, 0.7, t.hi));
    const p = N(panner(ctx, t.x, 1.55, t.z, 7, 0.75));
    const g = N(gain(ctx, 0.28 * t.g));
    s.connect(bp); bp.connect(hs); hs.connect(g);
    // Mostly wet. You are never hearing a voice from thirty metres away; you are
    // hearing the room's opinion of one.
    placeAt(g, p, 0.55, 0.42);
    return { p, g, bp, base: t, s };
  });

  // =========================================================================
  // per-frame
  // =========================================================================
  // Modulators are sums of sines at mutually irrational rates. There is no
  // period, so there is no loop, and it costs seven Math.sin calls a frame.
  let clock = 0;
  const hvBase = 0.115;
  let chillTick = 4 + rnd() * 8;

  function update(dt, t, zn, cop) {
    clock += dt;
    const c = clock;

    // --- THE BEDS NEVER READ AT THE SAME SPEED TWICE. Three drifts at mutually
    // irrational rates, about a per cent peak to peak, which is inaudible as
    // pitch and fatal to periodicity. This is the line that makes the store
    // un-loopable; see the note where the buffers are built.
    to(srcA.playbackRate, 1.000 + 0.011 * Math.sin(c * 0.0193) + 0.005 * Math.sin(c * 0.0071 + 2.2), t, 2.5);
    to(srcB.playbackRate, 0.937 + 0.010 * Math.sin(c * 0.0137 + 1.1) + 0.006 * Math.sin(c * 0.0049 + 4.0), t, 2.5);
    to(srcC.playbackRate, 1.061 + 0.012 * Math.sin(c * 0.0163 + 3.4) + 0.005 * Math.sin(c * 0.0059 + 0.7), t, 2.5);

    // --- HVAC never quite steady
    const hvm = 1 + 0.20 * Math.sin(c * 0.0389) + 0.11 * Math.sin(c * 0.1237 + 1.7)
                  + 0.06 * Math.sin(c * 0.0113 + 4.1);
    to(hvGain.gain, hvBase * hvm, t, 0.9);
    to(hvRes.frequency, 56 + 2.4 * Math.sin(c * 0.0271), t, 1.2);
    to(dfGain.gain, 0.115 * (1 + 0.22 * Math.sin(c * 0.0733 + 2.2)), t, 0.8);

    // --- ROUND 4: THE AIR MOVES TOO. These two were the only always-on layers
    // in the file with a fixed gain, and the top one was the hiss the client
    // heard. A constant broadband source is a noise generator; the same source
    // breathing on the same irrational sums as the air handling is a building.
    // Four Math.sin calls and two setTargetAtTime a frame.
    to(airG.gain, AIR_BASE * (1 + 0.13 * Math.sin(c * 0.0357 + 1.4)
                                + 0.07 * Math.sin(c * 0.0091 + 5.1)), t, 1.3);
    to(atG.gain, AT_BASE * (1 + 0.17 * Math.sin(c * 0.0421 + 0.9)
                              + 0.09 * Math.sin(c * 0.0107 + 3.3)), t, 1.4);
    to(atLP.frequency, 9000 * (1 + 0.09 * Math.sin(c * 0.0313 + 2.4)), t, 1.6);

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


    // =====================================================================
    // ROUND 2 — the broadband half, per frame
    // =====================================================================

    // --- CART TRAFFIC. Each voice is on a trip across the store; the wheel
    // rate drives the rattle buffer's playback rate, so the density of the
    // rattle is a function of how fast the thing is moving and costs nothing.
    for (const k of traffic) {
      k.t += dt;
      if (!k.on) { if (k.t > k.dur) newTrip(k); continue; }
      if (k.t > k.dur) { k.on = false; k.t = 0; k.dur = 4 + rnd() * 16; to(k.lvl.gain, 0, t, 0.6); continue; }
      const u = k.t / k.dur;
      const x = lerp(k.x0, k.x1, u), z = lerp(k.z0, k.z1, u);
      if (k.p.positionX) {
        k.p.positionX.setTargetAtTime(x, t, 0.10);
        k.p.positionZ.setTargetAtTime(z, t, 0.10);
      } else if (k.p.setPosition) k.p.setPosition(x, 0.55, z);
      // fade in and out at the ends of the trip: he came from somewhere and he
      // is going somewhere, and neither of those is a switch
      const fade = Math.min(1, u * 7) * Math.min(1, (1 - u) * 7);
      // a cart is not pushed at a constant speed. Nobody pushes anything at a
      // constant speed.
      const sp = k.speed * (0.72 + 0.4 * Math.sin(c * 0.61 + k.z0));
      k.modSrc.playbackRate.setTargetAtTime(clamp(sp * 1.5, 0.15, 3.0), t, 0.2);
      to(k.lvl.gain, 0.30 * fade * clamp(sp, 0.2, 1.6), t, 0.15);
    }

    // --- SOMEBODY IS WORKING. He puts a case out every second or two and
    // moves to another aisle every half a minute or so.
    work.t -= dt; work.move -= dt; work.jack -= dt;
    if (work.move <= 0) {
      work.move = 25 + rnd() * 55;
      work.x = aisleX((rnd() * AISLE_COUNT) | 0) + (rnd() - 0.5) * 1.6;
      work.z = (rnd() - 0.5) * 2 * BODY * 0.9;
      if (workP.positionX) {
        workP.positionX.setTargetAtTime(work.x, t, 0.4);
        workP.positionZ.setTargetAtTime(work.z, t, 0.4);
      } else if (workP.setPosition) workP.setPosition(work.x, 1.0, work.z);
    }
    if (work.t <= 0) {
      work.t = 0.5 + rnd() * 2.6;
      const r2 = rnd();
      if (r2 < 0.42) burst(t + 0.02, canBP, 3 + ((rnd() * 5) | 0), 0.075, 0.035, 1.5);   // cans on wire
      else if (r2 < 0.78) burst(t + 0.02, boxBP, 5 + ((rnd() * 6) | 0), 0.075, 0.055, 0.7); // cardboard
      else {                                                                              // a case hits the deck
        burst(t + 0.02, boxBP, 2, 0.22, 0.03, 0.35);
        burst(t + 0.09, canBP, 6 + ((rnd() * 6) | 0), 0.06, 0.028, 1.3);
      }
    }
    if (work.jack <= 0) { work.jack = 45 + rnd() * 110; palletJack(t + 0.05); }

    // --- THE CHILLED RUN. Each curtain gets its own distance, so the dairy is
    // on your left and the frozen food is behind you — which is the whole point
    // of having two of them instead of one number off room.js.
    let nearChill = 99;
    for (let i = 0; i < curtains.length; i++) {
      const cu = curtains[i];
      // nearest point ON THE RUN, not the run's midpoint
      const px = cu.run === 'back' ? clamp(cop.x, coolX0, coolX1) : cu.x;
      const pz = cu.run === 'back' ? cu.z : clamp(cop.z, -BODY * 0.95, BODY * 0.95);
      const d = Math.hypot(cop.x - px, cop.z - pz);
      nearChill = Math.min(nearChill, d);
      if (cu.p.positionX) {
        cu.p.positionX.setTargetAtTime(px, t, 0.25);
        cu.p.positionZ.setTargetAtTime(pz, t, 0.25);
      } else if (cu.p.setPosition) cu.p.setPosition(px, 1.3, pz);
      // The curtain is a NEARFIELD sound and it falls off hard: dominant at two
      // metres, plainly there at six, gone by fifteen.
      const near = 1 - smooth(1.6, 15.0, d);
      to(cu.g.gain, 0.46 * near * near * (0.85 + 0.2 * Math.sin(c * 0.14 + i * 2.1)), t, 0.4);
    }
    // the glass ticking as it warms. Only near it, and never on a clock.
    chillTick -= dt;
    if (chillTick <= 0) {
      chillTick = 2.0 + rnd() * 9.0;
      if (nearChill < 14) {
        const left = Math.abs(cop.x - curtains[1].x) < Math.abs(cop.z - curtains[0].z);
        const cu = curtains[left ? 1 : 0];
        const jx = left ? cu.x : clamp(cop.x, coolX0, coolX1) + (rnd() - 0.5) * 9;
        const jz = left ? clamp(cop.z, -BODY, BODY) + (rnd() - 0.5) * 9 : cu.z;
        if (tickP.positionX) { tickP.positionX.value = jx; tickP.positionZ.value = jz; }
        else if (tickP.setPosition) tickP.setPosition(jx, 1.4, jz);
        tick(t + 0.02, 0.05 + rnd() * 0.09);
        if (rnd() < 0.35) tick(t + 0.07 + rnd() * 0.1, 0.03 + rnd() * 0.05);
      }
    }
    // DEFROST: a relay, then a wet hiss for half a minute, then a relay back.
    defrost.t -= dt;
    if (defrost.t <= 0) {
      if (defrost.on) {
        defrost.on = false; defrost.t = 180 + rnd() * 420;
        to(defG.gain, 0, t, 3.0); relay(t + 0.02, 0.16);
      } else {
        defrost.on = true; defrost.t = 26 + rnd() * 30;
        relay(t + 0.02, 0.22); to(defG.gain, 0.10, t, 2.5);
      }
    }
    if (defrost.on) to(defG.gain, 0.10 * (0.7 + 0.5 * Math.sin(c * 0.23)), t, 1.2);

    // --- THE BACK ROOM, through a swing door. The level is the distance to
    // the doors, not zn.back, so walking along the rear cross-aisle sweeps past
    // it instead of stepping into it.
    const dBack = Math.hypot(cop.x - 12, Math.max(0, (STORE.maxZ - 0.4) - cop.z));
    const backNear = 1 - smooth(2.0, 20.0, dBack);
    to(backLvl.gain, 0.30 * backNear * backNear, t, 0.5);
    backEv.door -= dt; backEv.clatter -= dt;
    if (backEv.door <= 0) { backEv.door = 30 + rnd() * 95; swingDoor(t + 0.03); }
    if (backEv.clatter <= 0) {
      backEv.clatter = 16 + rnd() * 44;
      burst(t + 0.03, boxBP, 5 + ((rnd() * 8) | 0), 0.05, 0.10, 0.45);
    }

    // --- THE FRONT END. Traffic through the glass is the only sound in this
    // building that is outside it, and it is completely gone by aisle four.
    const dFront = Math.max(0, cop.z - (STORE.minZ + 1.0));
    const frontNear = 1 - smooth(2.0, 26.0, dFront);
    to(roadG.gain, 0.115 * frontNear * (0.75 + 0.45 * Math.sin(c * 0.047 + 1.3)), t, 1.2);
    to(glG.gain, 0.020 * frontNear * frontNear * (0.7 + 0.6 * Math.sin(c * 0.083)), t, 1.0);
    belt.t -= dt;
    if (belt.t <= 0) { belt.on = !belt.on; belt.t = belt.on ? 3 + rnd() * 9 : 4 + rnd() * 14; }
    to(beltG.gain, (belt.on ? 0.075 : 0.0) * frontNear, t, 0.35);

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
  const sr = 13000;
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
