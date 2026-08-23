// OWNER: builder-audio. THE MUSIC.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS, AND WHY IT EXISTS
//
// Round 1's brief said "no music bed of your own; the only music is the PA
// muzak". The client heard round 1 and said "there needs to be music, and it
// needs to be better". Both of those are true at once, and the resolution is
// not a soundtrack — it is that the PA muzak in round 1 was not music. It was
// a random walk over a chord loop, mixed 5 dB under the ambience, with 70% of
// its energy in a single octave around 2 kHz and literally nothing below
// 180 Hz. Measured: solo_pa.wav, -38.8 dBFS RMS, 0.0% of its energy under
// 180 Hz. There was no bass, so there was no groove; there was no repeated
// phrase, so there was no tune. A random walk is not a melody, it is a melody's
// statistics, and the ear knows the difference instantly.
//
// So this file is a small easy-listening band, playing WRITTEN TUNES, out of
// four steel cans in a drop ceiling. Same place in the fiction as before. It
// is louder, it has a low end, and it repeats — because repetition is the
// entire difference between "music is playing" and "something is happening
// somewhere".
//
// It is still not supposed to be good. It is supposed to be the fourteenth
// track on a licensing-library CD called SHOPPING MOODS VOL. 3, playing at a
// level somebody set in 1997 and never touched again. Bland, competent,
// slightly too quiet to enjoy properly. If a player ever thinks "nice
// soundtrack" this file has failed; the target is "oh — it's got the music".
//
// ---------------------------------------------------------------------------
// STRUCTURE
//
//   TRACK = one tune, transposed to a random key, at a tempo inside its own
//           range, with one of five lead instruments and one of four grooves.
//           Plays its 32-bar AABA form TWICE (head, then a slightly ornamented
//           reprise with the string pad in), then a 2-bar tag, then 2-6 seconds
//           of tape gap before the next track.
//
//   A track is ~2.5-3.5 minutes. Nothing loops: even the same tune coming round
//   again is in a different key, at a different tempo, with a different lead
//   and different per-note humanisation, and the tape gap resets the phase
//   against everything else in the building.
//
// The melodies are written out as note data — pitch in semitones above the
// tonic, length in beats — because a tune is a thing you can hum a second time
// and generated melodies are not. They are deliberately plain: long notes,
// stepwise motion, landing on chord tones, one phrase answering another.
//
// The comp is VOICE-LED: each chord picks the inversion nearest the last one,
// so the electric piano moves by a semitone or two instead of jumping around.
// That is most of what makes cheap keyboard music sound professionally cheap
// rather than randomly generated.
//
// ---------------------------------------------------------------------------
// THE CHASE
//
// setIntensity(0..1). The store's own tape is the only score this game gets:
// the drums come up and subdivide, the bass starts pushing eighths, the comp
// starts stabbing offbeats, the melody recedes, and the tempo creeps up about
// four per cent. Nothing new appears — it is the same band, same speaker, same
// room. It is what you would notice about the music if you were running, which
// is the only honest way to score a foot chase in a Price Chopper.
//
// Applied at bar boundaries only. The tape does not know about the game and
// must never appear to.
//
// ---------------------------------------------------------------------------
// COST
//
// Scheduled a BEAT at a time, not a bar, because a bar of 16th-note hats plus a
// comp voicing plus a melody phrase is ~150 nodes and ~400 AudioParam calls in
// one frame, and this game renders the scene ten times a frame. Per-beat the
// spike is a fifth of that and it lands 1-2 times a second. See stats().

import { gain, filt, mulberry, clamp } from './dsp.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// ---------------------------------------------------------------- chord shapes
// Semitones above the chord root. Sevenths everywhere, because the entire
// harmonic language of supermarket music is "a triad is not quite enough".
const Q = {
  maj7: [0, 4, 7, 11],
  maj6: [0, 4, 7, 9],
  maj9: [0, 4, 7, 11, 14],
  min7: [0, 3, 7, 10],
  min9: [0, 3, 7, 10, 14],
  min6: [0, 3, 7, 9],
  dom7: [0, 4, 7, 10],
  dom9: [0, 4, 7, 10, 14],
  dom13: [0, 4, 7, 10, 21],
  hdim: [0, 3, 6, 10],
  sus7: [0, 5, 7, 10],
};

// ------------------------------------------------------------------- the tunes
// chords : one entry per bar, [[degree, quality, beats], ...]. Degree is
//          semitones above the tonic.
// mel    : [pitch|null, beats]. Pitch is semitones above the tonic, in the
//          octave above the key. null is a rest, and the rests matter — a
//          melody with no holes in it is a scale exercise.
//
// Four tunes is enough that you will not hear the same one twice in a session,
// and the key/tempo/lead/groove roll on top means you would not notice if you
// did.
const TUNES = [
  {
    name: 'CHECKOUT LANE THREE',
    bpm: [102, 112], beats: 4, groove: 'bossa', leads: ['vibes', 'guitar'],
    sections: {
      A: {
        chords: [
          [[0, 'maj7', 4]], [[0, 'maj7', 4]], [[2, 'dom9', 4]], [[2, 'dom7', 4]],
          [[2, 'min7', 4]], [[7, 'dom9', 4]], [[0, 'maj7', 4]], [[2, 'min7', 2], [7, 'dom7', 2]],
        ],
        mel: [
          [4, 1], [7, 1], [9, 2],
          [7, 3], [null, 1],
          [6, 1.5], [4, 0.5], [2, 2],
          [4, 2], [2, 2],
          [5, 1], [7, 1], [9, 2],
          [11, 3], [9, 1],
          [7, 2], [4, 2],
          [5, 2], [2, 2],
        ],
      },
      B: {
        chords: [
          [[5, 'maj7', 4]], [[5, 'maj7', 4]], [[5, 'min7', 4]], [[10, 'dom7', 4]],
          [[0, 'maj7', 4]], [[9, 'dom7', 4]], [[2, 'min7', 4]], [[7, 'dom9', 4]],
        ],
        mel: [
          [9, 2], [12, 2],
          [11, 1], [9, 1], [7, 2],
          [8, 2], [5, 2],
          [3, 2], [0, 2],
          [4, 1], [5, 1], [7, 2],
          [9, 3], [7, 1],
          [5, 2], [4, 2],
          [2, 2], [null, 2],
        ],
      },
    },
  },
  {
    name: 'ELEVEN ITEMS OR FEWER',
    bpm: [84, 94], beats: 4, groove: 'softrock', leads: ['sax', 'epiano'],
    sections: {
      A: {
        chords: [
          [[0, 'maj9', 4]], [[9, 'min7', 4]], [[5, 'maj7', 4]], [[7, 'dom7', 4]],
          [[0, 'maj7', 4]], [[9, 'min7', 4]], [[2, 'min7', 4]], [[7, 'dom9', 4]],
        ],
        mel: [
          [null, 1], [0, 1], [4, 1], [7, 1],
          [9, 2], [7, 2],
          [5, 1], [7, 1], [9, 2],
          [11, 4],
          [12, 1], [11, 1], [9, 2],
          [7, 3], [4, 1],
          [5, 2], [2, 2],
          [4, 2], [null, 2],
        ],
      },
      B: {
        chords: [
          [[5, 'maj7', 4]], [[5, 'maj7', 4]], [[0, 'maj7', 4]], [[0, 'maj6', 4]],
          [[2, 'min7', 4]], [[7, 'dom7', 4]], [[0, 'maj7', 4]], [[7, 'dom9', 4]],
        ],
        mel: [
          [9, 2], [5, 2],
          [7, 4],
          [4, 2], [0, 2],
          [2, 4],
          [5, 1], [7, 1], [9, 2],
          [11, 2], [9, 2],
          [7, 4],
          [null, 2], [2, 2],
        ],
      },
    },
  },
  {
    name: 'FROZEN FOODS',
    bpm: [108, 118], beats: 4, groove: 'disco', leads: ['guitar', 'vibes'],
    minor: true,
    sections: {
      A: {
        chords: [
          [[0, 'min7', 4]], [[0, 'min9', 4]], [[3, 'maj7', 4]], [[8, 'maj7', 4]],
          [[5, 'min7', 4]], [[10, 'dom7', 4]], [[0, 'min7', 4]], [[7, 'dom7', 4]],
        ],
        mel: [
          [7, 2], [10, 2],
          [12, 3], [10, 1],
          [7, 2], [3, 2],
          [8, 2], [7, 2],
          [5, 1], [7, 1], [8, 2],
          [10, 3], [7, 1],
          [3, 2], [0, 2],
          [2, 2], [null, 2],
        ],
      },
      B: {
        chords: [
          [[8, 'maj7', 4]], [[10, 'dom7', 4]], [[0, 'min7', 4]], [[0, 'min7', 4]],
          [[8, 'maj7', 4]], [[10, 'dom7', 4]], [[3, 'maj7', 4]], [[7, 'dom7', 4]],
        ],
        mel: [
          [8, 2], [12, 2],
          [10, 2], [8, 2],
          [7, 4],
          [null, 2], [3, 2],
          [5, 2], [8, 2],
          [10, 2], [12, 2],
          [14, 3], [12, 1],
          [11, 2], [null, 2],
        ],
      },
    },
  },
  {
    name: 'PRODUCE (WALTZ)',
    bpm: [92, 102], beats: 3, groove: 'waltz', leads: ['epiano', 'vibes', 'sax'],
    sections: {
      A: {
        chords: [
          [[0, 'maj7', 3]], [[0, 'maj6', 3]], [[2, 'min7', 3]], [[7, 'dom7', 3]],
          [[4, 'min7', 3]], [[9, 'dom7', 3]], [[2, 'min7', 3]], [[7, 'dom9', 3]],
        ],
        mel: [
          [7, 2], [9, 1],
          [11, 3],
          [9, 2], [7, 1],
          [5, 3],
          [4, 2], [7, 1],
          [9, 2], [6, 1],
          [5, 2], [4, 1],
          [2, 3],
        ],
      },
      B: {
        chords: [
          [[5, 'maj7', 3]], [[5, 'maj7', 3]], [[5, 'min6', 3]], [[5, 'min7', 3]],
          [[0, 'maj7', 3]], [[9, 'dom7', 3]], [[2, 'min7', 3]], [[7, 'dom7', 3]],
        ],
        mel: [
          [12, 2], [9, 1],
          [7, 3],
          [8, 2], [5, 1],
          [3, 3],
          [4, 2], [0, 1],
          [9, 2], [7, 1],
          [5, 2], [2, 1],
          [4, 3],
        ],
      },
    },
  },
];

const FORM = ['A', 'A', 'B', 'A'];

// ---------------------------------------------------------------------------
export function createMuzak(ctx, dest, noiseBuf, seed = 4711) {
  const rnd = mulberry(seed);
  const nodes = [];
  const N = (n) => { nodes.push(n); return n; };
  let made = 0, madeLast = 0, secT = 0;          // one-shot node accounting

  // ---- instrument buses ---------------------------------------------------
  // Levels here are the ARRANGEMENT balance — how the band is mixed on the
  // record. The speaker chain and the room in pa.js decide how loud the record
  // is in the building; these decide whether you can hear the bass line.
  // A record is a mixdown, so it is compressed. This is what stops a chord stab
  // and a snare landing together from spiking 8 dB over the melody, and it is
  // also 80% of why library music sounds like library music. Everything the band
  // plays goes through it; nothing reaches the ceiling any other way.
  const glue = N(ctx.createDynamicsCompressor());
  glue.threshold.value = -22; glue.knee.value = 14; glue.ratio.value = 3.6;
  glue.attack.value = 0.006; glue.release.value = 0.17;
  const mixOut = N(gain(ctx, 1.9));         // makeup for the glue
  glue.connect(mixOut); mixOut.connect(dest);

  const compBus = N(gain(ctx, 0.30));
  const bassBus = N(gain(ctx, 0.72));
  const leadBus = N(gain(ctx, 0.44));
  const padBus = N(gain(ctx, 0.20));       // strings, only fed on the reprise
  const percBus = N(gain(ctx, 0.46));
  for (const b of [compBus, bassBus, leadBus, padBus, percBus]) b.connect(glue);
  const LEAD_LVL = 0.44, PERC_LVL = 0.46;

  // ---- shared modulators --------------------------------------------------
  // One vibrato and one tape wow for the whole band. Per-note LFOs would be
  // three extra nodes a note for nothing the ear can find.
  const vib = N(ctx.createOscillator()); vib.type = 'sine'; vib.frequency.value = 5.1;
  const vibAmt = N(gain(ctx, 13)); vib.connect(vibAmt); vib.start();
  // The tape has been round the spindle a few thousand times.
  const wow = N(ctx.createOscillator()); wow.type = 'sine'; wow.frequency.value = 0.074;
  const wowAmt = N(gain(ctx, 6.5)); wow.connect(wowAmt); wow.start();
  const flutter = N(ctx.createOscillator()); flutter.type = 'triangle'; flutter.frequency.value = 5.9;
  const flutAmt = N(gain(ctx, 1.6)); flutter.connect(flutAmt); flutter.start();
  const drift = N(gain(ctx, 1));   // sum node: everything's detune reads this
  wowAmt.connect(drift); flutAmt.connect(drift);

  // The Rhodes suitcase tremolo, which is a real amplitude effect on a real
  // instrument and not a production choice.
  const tremLFO = N(ctx.createOscillator()); tremLFO.type = 'sine'; tremLFO.frequency.value = 4.6;
  const tremDepth = N(gain(ctx, 0.16));
  const tremBase = N(ctx.createConstantSource()); tremBase.offset.value = 0.86; tremBase.start();
  const tremG = N(gain(ctx, 0));
  tremLFO.connect(tremDepth); tremDepth.connect(tremG.gain); tremBase.connect(tremG.gain);
  tremLFO.start();
  tremG.connect(compBus);

  // ---- shared drum colouring ---------------------------------------------
  // Every hit of a given drum runs through the same filters, so a bar of 16ths
  // costs 2 nodes a hit and not 5.
  // The hats decide whether the tape has a beat. Round 2 first pass put them
  // above 5.6 kHz, which is where the ceiling speaker's whizzer gives up, and
  // measured 0.0% of the music's energy over 5.6 kHz — a drum machine you could
  // not hear. A real 8-inch coax passes a hi-hat perfectly well; it is the
  // FORTY METRES that eats it, and that happens in the room, not in the can.
  const hatHP = N(filt(ctx, 'highpass', 4200, 0.7));
  const hatPk = N(filt(ctx, 'peaking', 8000, 1.0, 5));
  const hatLvl = N(gain(ctx, 0.95));
  hatHP.connect(hatPk); hatPk.connect(hatLvl); hatLvl.connect(percBus);

  const snBP = N(filt(ctx, 'bandpass', 1850, 0.75));
  const snPk = N(filt(ctx, 'peaking', 420, 1.6, 5));
  const snLvl = N(gain(ctx, 0.78));
  snBP.connect(snPk); snPk.connect(snLvl); snLvl.connect(percBus);

  const shkBP = N(filt(ctx, 'bandpass', 5800, 0.75));
  const shkLvl = N(gain(ctx, 0.44)); shkBP.connect(shkLvl); shkLvl.connect(percBus);

  const kickLP = N(filt(ctx, 'lowpass', 900, 1.0));
  const kickClick = N(filt(ctx, 'bandpass', 1250, 1.4));
  const kickLvl = N(gain(ctx, 1.05));
  kickLP.connect(kickLvl); kickClick.connect(kickLvl); kickLvl.connect(percBus);

  // ---- voices -------------------------------------------------------------
  // Every note is built, played and thrown away. That is what Web Audio is for.
  const kill = (n, when) => { n.onended = () => { try { n.disconnect(); } catch (e) {} }; return when; };

  function rhodes(f, t, dur, vel, bright) {
    const g = gain(ctx, 0);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.004;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = f * 4.02;
    const g2 = gain(ctx, 0.24), g3 = gain(ctx, 0);
    drift.connect(o1.detune); drift.connect(o2.detune);
    o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
    g.connect(tremG);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.007);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, vel * 0.28), t + 0.36);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // The tine's bark. It dies well before the body does; that gap is the
    // instrument.
    g3.gain.setValueAtTime((bright == null ? 0.13 : bright) * vel, t);
    g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.20);
    for (const o of [o1, o2, o3]) { o.start(t); o.stop(t + dur + 0.05); }
    made += 6; kill(o1);
    o1.onended = () => {
      try { drift.disconnect(o1.detune); drift.disconnect(o2.detune); } catch (e) {}
      try { g.disconnect(); o1.disconnect(); o2.disconnect(); o3.disconnect(); } catch (e) {}
    };
  }

  // Electric bass through a ceiling can. The fundamental of anything below about
  // E2 does not survive the speaker's highpass, so the note is built as a strong
  // 2nd and 3rd harmonic over a weak root and the ear reconstructs the missing
  // fundamental — which is not a trick, it is exactly what happens to a bass
  // line in a supermarket.
  function bass(f, t, dur, vel, ghost) {
    const g = gain(ctx, 0);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f * 2;
    const o3 = ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = f * 3;
    const g2 = gain(ctx, 0.42), g3 = gain(ctx, 0.13);
    const lp = filt(ctx, 'lowpass', 620, 1.1);
    o.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
    g.connect(lp); lp.connect(bassBus);
    const v = vel * (ghost ? 0.34 : 1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + 0.014);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, v * 0.55), t + Math.min(0.18, dur * 0.5));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // the pluck: a finger on a wound string
    lp.frequency.setValueAtTime(1700, t);
    lp.frequency.exponentialRampToValueAtTime(560, t + 0.09);
    for (const oo of [o, o2, o3]) { oo.start(t); oo.stop(t + dur + 0.04); }
    made += 7;
    o.onended = () => { try { lp.disconnect(); o.disconnect(); o2.disconnect(); o3.disconnect(); } catch (e) {} };
  }

  // --- leads. Four instruments, because the same voice on every track is how
  // you notice there is a generator behind it.
  function vibes(f, t, dur, vel) {
    const g = gain(ctx, 0);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 3.99;
    const g2 = gain(ctx, 0.16);
    // the vibraphone's motor, which is an amplitude effect and the entire
    // reason the instrument exists
    const trem = gain(ctx, 1);
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 6.3;
    const ld = gain(ctx, 0.30); lfo.connect(ld); ld.connect(trem.gain);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(trem); trem.connect(leadBus);
    drift.connect(o.detune);
    const d = Math.max(dur, 0.9) + 0.7;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    g2.gain.setValueAtTime(0.22 * vel, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);   // the mallet
    o.start(t); o2.start(t); lfo.start(t);
    o.stop(t + d + 0.05); o2.stop(t + 0.3); lfo.stop(t + d + 0.05);
    made += 7;
    o.onended = () => {
      try { drift.disconnect(o.detune); } catch (e) {}
      try { trem.disconnect(); o.disconnect(); o2.disconnect(); lfo.disconnect(); } catch (e) {}
    };
  }

  const saxBrBP = N(filt(ctx, 'bandpass', 2600, 0.9));
  const saxBrG = N(gain(ctx, 1)); saxBrBP.connect(saxBrG); saxBrG.connect(leadBus);
  function sax(f, t, dur, vel, slur) {
    const g = gain(ctx, 0);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    // two formants: an alto's bore, roughly
    const f1 = filt(ctx, 'bandpass', clamp(f * 1.6, 420, 1250), 1.5);
    const f2 = filt(ctx, 'peaking', 1650, 1.4, 7);
    const lp = filt(ctx, 'lowpass', 3400, 0.7);
    o.connect(f1); f1.connect(f2); f2.connect(lp); lp.connect(g); g.connect(leadBus);
    vibAmt.connect(o.detune); drift.connect(o.detune);
    // a player does not hit the note dead centre; he arrives at it
    if (slur) {
      o.frequency.setValueAtTime(f * 0.955, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.075);
    } else o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.055);
    g.gain.setTargetAtTime(vel * 0.86, t + 0.055, 0.28);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.88, 0.05);
    // the breath on the front of the note. It is quiet and it is the whole
    // difference between a saxophone and a sawtooth.
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1.1;
    const bg = gain(ctx, 0);
    s.connect(bg); bg.connect(saxBrBP);
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.085 * vel, t + 0.02);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    s.start(t, rnd() * 2, 0.25);
    s.onended = () => { try { bg.disconnect(); } catch (e) {} };
    o.start(t); o.stop(t + dur + 0.2);
    made += 8;
    o.onended = () => {
      try { vibAmt.disconnect(o.detune); drift.disconnect(o.detune); } catch (e) {}
      try { f1.disconnect(); f2.disconnect(); lp.disconnect(); g.disconnect(); o.disconnect(); } catch (e) {}
    };
  }

  function guitar(f, t, dur, vel) {
    const g = gain(ctx, 0);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 8;
    const g2 = gain(ctx, 0.7);
    const lp = filt(ctx, 'lowpass', 2600, 2.2);
    const bd = filt(ctx, 'peaking', 2400, 1.6, 5);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bd); bd.connect(leadBus);
    drift.connect(o.detune); drift.connect(o2.detune);
    const d = Math.min(Math.max(dur, 0.5) + 0.5, 2.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, vel * 0.35), t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(1500, t + 0.30);
    o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
    made += 7;
    o.onended = () => {
      try { drift.disconnect(o.detune); drift.disconnect(o2.detune); } catch (e) {}
      try { lp.disconnect(); bd.disconnect(); g.disconnect(); o.disconnect(); o2.disconnect(); } catch (e) {}
    };
  }

  function epianoLead(f, t, dur, vel) {
    const g = gain(ctx, 0);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = f * 4.01;
    const g3 = gain(ctx, 0);
    o1.connect(g); o3.connect(g3); g3.connect(g); g.connect(leadBus);
    drift.connect(o1.detune);
    const d = Math.max(dur, 0.8) + 0.6;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(Math.max(1e-4, vel * 0.3), t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    g3.gain.setValueAtTime(0.28 * vel, t);
    g3.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o1.start(t); o3.start(t); o1.stop(t + d + 0.05); o3.stop(t + 0.5);
    made += 5;
    o1.onended = () => {
      try { drift.disconnect(o1.detune); } catch (e) {}
      try { g.disconnect(); o1.disconnect(); o3.disconnect(); } catch (e) {}
    };
  }

  const LEADS = { vibes, sax, guitar, epiano: epianoLead };

  // --- strings. One pad note = 2 detuned saws; a whole chord is 6 oscillators
  // held for a bar. Only comes in on the second pass through the form, which is
  // how every arranger in 1979 did it.
  function padNote(f, t, dur, vel) {
    const g = gain(ctx, 0);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = -6;
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = f; o2.detune.value = 7;
    const lp = filt(ctx, 'lowpass', 2100, 0.7);
    o.connect(g); o2.connect(g); g.connect(lp); lp.connect(padBus);
    drift.connect(o.detune); drift.connect(o2.detune);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.35);
    g.gain.setValueAtTime(vel, t + dur * 0.7);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
    made += 5;
    o.onended = () => {
      try { drift.disconnect(o.detune); drift.disconnect(o2.detune); } catch (e) {}
      try { lp.disconnect(); g.disconnect(); o.disconnect(); o2.disconnect(); } catch (e) {}
    };
  }

  // --- drum machine. A CR-78 in a rack in the studio, printed to the tape in
  // 1981 and then squeezed through a paper cone in a ceiling, which means what
  // you actually hear of the kick is its click.
  function hat(t, vel, open) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1.6 + rnd() * 0.3;
    const g = gain(ctx, 0);
    s.connect(g); g.connect(hatHP);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.17 : 0.028 + rnd() * 0.012));
    s.start(t, rnd() * 2, 0.25); made += 2;
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }
  function snare(t, vel, rim) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1.0 + rnd() * 0.2;
    const g = gain(ctx, 0);
    s.connect(g); g.connect(snBP);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (rim ? 0.045 : 0.13 + rnd() * 0.04));
    s.start(t, rnd() * 2, 0.3);
    // the shell
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = rim ? 410 : 196;
    const og = gain(ctx, 0); o.connect(og); og.connect(snLvl);
    og.gain.setValueAtTime(vel * (rim ? 0.5 : 0.34), t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.start(t); o.stop(t + 0.1); made += 4;
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
    o.onended = () => { try { og.disconnect(); } catch (e) {} };
  }
  // Brushes. A swirl, not a hit — and the single broadest-band thing the band
  // owns, which is why the softrock and waltz grooves lean on it.
  function brush(t, dur, vel) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.6 + rnd() * 0.25;
    const g = gain(ctx, 0);
    s.connect(g); g.connect(snBP);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.start(t, rnd() * 2, dur + 0.1); made += 2;
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }
  function shaker(t, vel) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1.8;
    const g = gain(ctx, 0);
    s.connect(g); g.connect(shkBP);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055 + rnd() * 0.03);
    s.start(t, rnd() * 2, 0.15); made += 2;
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }
  function kick(t, vel) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = gain(ctx, 0);
    o.connect(g); g.connect(kickLP);
    // Pitched HIGH on purpose. A kick's fundamental is 55 Hz and the ceiling
    // speaker's transformer deletes it, so the drum you actually hear in a
    // supermarket is the top of its thump plus the beater. Sweeping 190 -> 78
    // puts the audible part above the highpass instead of under it.
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(78, t + 0.065);
    g.gain.setValueAtTime(vel * 1.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.17);
    o.start(t); o.stop(t + 0.2);
    // and the beater, which is the part that survives the ceiling
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1.2;
    const sg = gain(ctx, 0); s.connect(sg); sg.connect(kickClick);
    sg.gain.setValueAtTime(vel * 0.55, t);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.022);
    s.start(t, rnd() * 2, 0.06); made += 4;
    o.onended = () => { try { g.disconnect(); } catch (e) {} };
    s.onended = () => { try { sg.disconnect(); } catch (e) {} };
  }
  function clap(t, vel) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.011;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 1.3;
      const g = gain(ctx, 0);
      s.connect(g); g.connect(snBP);
      g.gain.setValueAtTime(vel * (i === 2 ? 1 : 0.6), tt);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + (i === 2 ? 0.14 : 0.02));
      s.start(tt, rnd() * 2, 0.2);
      s.onended = () => { try { g.disconnect(); } catch (e) {} };
    }
    made += 6;
  }

  // ---- grooves ------------------------------------------------------------
  // A groove answers one question: given a beat index inside the bar, what does
  // the kit play? Returned as a list of [offsetInBeats, fn, vel]. Written per
  // beat rather than per bar so the scheduler can spread its cost.
  //
  // `iv` is the chase intensity — the drummer leaning on it, not a new drummer.
  function grooveHits(name, beat, bars, iv, out) {
    const A = (o, f, v) => out.push([o, f, v]);
    const h = 0.5;                                     // an eighth
    const sub = iv > 0.35 ? 0.25 : 0.5;                // 16ths when it is on
    switch (name) {
      case 'bossa':
        if (beat === 0) A(0, 'kick', 0.85);
        if (beat === 1) A(0.5, 'kick', 0.55 + iv * 0.2);
        if (beat === 2) A(0.5, 'kick', 0.5);
        if (beat === 3 && (bars % 2 === 1)) A(0.5, 'rim', 0.42);
        if (beat === 1 || beat === 3) A(0, 'rim', 0.30 + iv * 0.25);
        for (let o = 0; o < 1; o += sub) A(o, 'shaker', (o === 0 ? 0.22 : 0.11) * (0.7 + rnd() * 0.5));
        break;
      case 'softrock':
        if (beat === 0) A(0, 'kick', 0.9);
        if (beat === 2) A(0, 'kick', 0.62);
        if (beat === 1 || beat === 3) A(0, 'snare', 0.55 + iv * 0.3);
        if (beat === 3 && rnd() < 0.35 + iv * 0.4) A(0.5, 'snare', 0.28);
        for (let o = 0; o < 1; o += sub) A(o, 'hat', o === 0 ? 0.30 : (o === 0.5 ? 0.20 : 0.11));
        if (beat === 1 || beat === 3) A(0, 'shaker', 0.26);   // the tambourine
        A(0, 'brush', 0.09);
        break;
      case 'disco':
        A(0, 'kick', beat === 0 ? 0.95 : 0.82);
        if (beat === 1 || beat === 3) { A(0, 'snare', 0.5); A(0, 'clap', 0.42 + iv * 0.25); }
        A(0.5, 'hatOpen', 0.20 + iv * 0.10);
        for (let o = 0; o < 1; o += sub) if (o !== 0.5) A(o, 'hat', 0.16 * (0.7 + rnd() * 0.6));
        if (beat === 3 && bars % 4 === 3) A(0.75, 'snare', 0.4);
        break;
      case 'waltz':
        if (beat === 0) { A(0, 'kick', 0.8); A(0, 'brush', 0.14); }
        else A(0, 'rim', 0.32 + iv * 0.2);
        A(0, 'shaker', beat === 0 ? 0.22 : 0.13);
        if (iv > 0.35) A(0.5, 'shaker', 0.10);
        break;
    }
  }
  const DRUM = {
    kick, snare: (t, v) => snare(t, v, false), rim: (t, v) => snare(t, v, true),
    hat: (t, v) => hat(t, v, false), hatOpen: (t, v) => hat(t, v, true),
    shaker, clap, brush: (t, v) => brush(t, 0.45, v),
  };

  // ---- voice leading ------------------------------------------------------
  // Each chord takes the inversion nearest the last one. Three or four voices
  // moving a semitone at a time is what separates "a keyboard player" from "an
  // array of frequencies", and it costs about twenty comparisons a bar.
  function voiceLead(prev, pcs, centre) {
    const out = [];
    for (let i = 0; i < prev.length; i++) {
      let best = prev[i], bd = 1e9;
      for (const pc of pcs) {
        const m = pc + 12 * Math.round((prev[i] - pc) / 12);
        for (const cand of [m - 12, m, m + 12]) {
          if (cand < centre - 14 || cand > centre + 15) continue;
          let d = Math.abs(cand - prev[i]);
          for (const o of out) if (o === cand) d += 30;
          if (d < bd) { bd = d; best = cand; }
        }
      }
      out.push(best);
    }
    return out.sort((a, b) => a - b);
  }

  // ---- the tape -----------------------------------------------------------
  let track = null;
  let intensity = 0, ivBar = 0;        // ivBar only changes on a bar line
  let nextBeatAt = 0;
  let gapUntil = -1;

  function newTrack(t) {
    // never the same tune twice running
    let ti = (rnd() * TUNES.length) | 0;
    if (track && TUNES[ti] === track.tune) ti = (ti + 1 + ((rnd() * (TUNES.length - 1)) | 0)) % TUNES.length;
    const tune = TUNES[ti];
    // Flat keys, because muzak lives in flat keys and because a horn section
    // that never existed still could not play in E.
    const KEYS = [53, 55, 56, 58, 60, 51, 63];           // F Ab, near enough
    const key = KEYS[(rnd() * KEYS.length) | 0];
    const lead = tune.leads[(rnd() * tune.leads.length) | 0];
    track = {
      tune, key, lead,
      bpm: tune.bpm[0] + rnd() * (tune.bpm[1] - tune.bpm[0]),
      beats: tune.beats,
      groove: tune.groove,
      bar: 0, pass: 0,
      // 32-bar form twice, then a two-bar tag
      total: FORM.length * 8 * 2 + 2,
      voicing: null,
      barPlan: null,
    };
    return track;
  }

  // Everything that happens in one bar, decided once at the bar line.
  function planBar(T) {
    const barIn = T.bar % (FORM.length * 8);
    const pass = Math.floor(T.bar / (FORM.length * 8));
    const tag = T.bar >= FORM.length * 8 * 2;
    const sec = T.tune.sections[FORM[Math.floor(barIn / 8) % FORM.length]];
    const sb = barIn % 8;

    // --- chords for this bar
    let chords = tag ? [[0, T.tune.minor ? 'min7' : 'maj9', T.beats]] : sec.chords[sb];

    // --- where the melody is. Walked from the top of the section each bar; a
    // few dozen additions and it means the note data can stay as durations.
    const mel = [];
    if (!tag) {
      let acc = 0;
      for (const [p, d] of sec.mel) {
        if (acc >= sb * T.beats && acc < (sb + 1) * T.beats) mel.push([p, acc - sb * T.beats, d]);
        acc += d;
      }
    }
    return { chords, mel, pass, tag, sb, sec };
  }

  // ---- schedule one beat --------------------------------------------------
  const hits = [];
  function scheduleBeat(T, t, spb) {
    const P = T.barPlan;
    const beat = T.beat;
    const iv = ivBar;

    // ---- the chord under this beat, and the comp
    let acc = 0, chord = P.chords[0];
    for (const c of P.chords) { if (beat >= acc && beat < acc + c[2]) { chord = c; break; } acc += c[2]; }
    const newChord = beat === 0 || (acc === beat && P.chords.length > 1);
    const root = T.key + chord[0];
    const pcs = (Q[chord[1]] || Q.maj7).map((s) => ((root + s) % 12 + 12) % 12);

    if (newChord) {
      if (!T.voicing) {
        // first voicing of the track: the guide tones, up where a cone can pass them
        T.voicing = [root + 12 + (Q[chord[1]] || Q.maj7)[1], root + 12 + (Q[chord[1]] || Q.maj7)[2],
                     root + 12 + (Q[chord[1]] || Q.maj7)[3]];
        while (T.voicing[0] < 57) for (let i = 0; i < 3; i++) T.voicing[i] += 12;
        while (T.voicing[2] > 76) for (let i = 0; i < 3; i++) T.voicing[i] -= 12;
      } else T.voicing = voiceLead(T.voicing, pcs, 65);

      // the comp pattern. Bossa anticipates, soft rock lands on it, disco stabs.
      const push = T.groove === 'bossa' ? -0.08 : 0;
      const len = spb * (chord[2] * (T.groove === 'disco' ? 0.30 : 0.86));
      const vel = (0.62 + rnd() * 0.24) * (P.tag ? 0.8 : 1);
      for (const m of T.voicing) {
        rhodes(mtof(m), t + push * spb + rnd() * 0.008, len, vel * (0.75 + rnd() * 0.4));
      }
      // strings only on the reprise, holding the chord
      if (P.pass >= 1 || P.tag) {
        for (const m of T.voicing) padNote(mtof(m + 12), t, spb * chord[2] * 0.98, 0.10);
      }
    }
    // the offbeat stab: a comp figure that only appears when the tape has the
    // drummer leaning on it
    if (iv > 0.3 && (beat === 1 || beat === 3) && T.beats === 4 && rnd() < 0.55 + iv * 0.4) {
      for (const m of T.voicing || []) rhodes(mtof(m), t + spb * 0.5, spb * 0.28, 0.35 * iv, 0.05);
    }

    // ---- bass
    if (!P.tag || T.bar === T.total - 2) {
      const bt = T.key + chord[0] - 12;
      const fifth = bt + 7, oct = bt + 12;
      if (T.beats === 3) {
        if (beat === 0) bass(mtof(bt), t, spb * 0.9, 0.85);
        else if (beat === 2 && rnd() < 0.6) bass(mtof(fifth), t, spb * 0.8, 0.6);
      } else if (T.groove === 'disco') {
        bass(mtof(beat % 2 ? oct : bt), t, spb * 0.42, 0.8);
        bass(mtof(beat % 2 ? bt : oct), t + spb * 0.5, spb * 0.36, 0.62);
      } else if (T.groove === 'bossa') {
        if (beat === 0) bass(mtof(bt), t, spb * 1.2, 0.9);
        if (beat === 1) bass(mtof(fifth), t + spb * 0.5, spb * 1.0, 0.7);
        if (beat === 2 && iv > 0.3) bass(mtof(oct), t + spb * 0.5, spb * 0.5, 0.5 * iv);
        if (beat === 3 && rnd() < 0.30 + iv * 0.4) bass(mtof(bt + (rnd() < 0.5 ? -1 : 2)), t + spb * 0.5, spb * 0.5, 0.55, true);
      } else {                                    // softrock
        if (beat === 0) bass(mtof(bt), t, spb * 1.4, 0.9);
        if (beat === 2) bass(mtof(rnd() < 0.4 ? fifth : bt), t, spb * 1.1, 0.72);
        if (iv > 0.3) { bass(mtof(bt), t + spb * 0.5, spb * 0.35, 0.5 * iv, true); }
        if (beat === 3 && rnd() < 0.35) bass(mtof(bt + 2), t + spb * 0.5, spb * 0.45, 0.6, true);
      }
    }

    // ---- drums
    hits.length = 0;
    grooveHits(T.groove, beat, T.bar, iv, hits);
    for (const [o, fn, v] of hits) {
      const f = DRUM[fn]; if (!f) continue;
      // a drum machine is dead on the grid; a drummer is not. Both are wrong in
      // opposite directions, so: a couple of milliseconds of human, no more.
      f(t + o * spb + (rnd() - 0.5) * 0.006, v * (0.82 + rnd() * 0.3) * (P.tag ? 0.6 : 1));
    }

    // ---- melody
    // The tune. The lead does NOT play on the second bar of the tag and it
    // drops back when the tape is driving, which is the only place in this file
    // that the game touches the music.
    const play = LEADS[T.lead] || vibes;
    for (const [p, off, d] of P.mel) {
      if (p == null) continue;
      if (off < beat || off >= beat + 1) continue;
      const m = T.key + 12 + p;
      const vel = 0.70 + rnd() * 0.26;
      const swing = (rnd() - 0.4) * 0.012;
      play(mtof(m), t + (off - beat) * spb + swing, d * spb * 0.94, vel, rnd() < 0.35);
      // On the reprise the player starts decorating: a grace note into a long
      // one. It is the same tune and it is not the same take.
      if (P.pass >= 1 && d >= 2 && rnd() < 0.34) {
        play(mtof(m - (rnd() < 0.5 ? 1 : 2)), t + (off - beat) * spb - spb * 0.18, spb * 0.16, vel * 0.55);
      }
    }
  }

  // ---- per-frame ----------------------------------------------------------
  // Lookahead against ctx.currentTime, NOT against dt: main.js's run() can
  // advance four simulated seconds in thirty milliseconds and a sequencer
  // driven off dt would try to play all of it at once.
  let on = true;
  function update(dt, t) {
    secT += dt;
    if (secT >= 1) { madeLast = made; made = 0; secT -= 1; }
    if (!on) return;
    // The two mix moves. When the tape is driving, the drummer comes up and the
    // melody sits back — which is not the arranger's decision, it is what your
    // ears do to a piece of music while you are running. Slow enough (0.9 s)
    // that you never catch it happening.
    leadBus.gain.setTargetAtTime(LEAD_LVL * (1 - 0.52 * ivBar), t, 0.9);
    percBus.gain.setTargetAtTime(PERC_LVL * (1 + 0.72 * ivBar), t, 0.9);
    if (t < gapUntil) return;
    if (!track) { newTrack(t); nextBeatAt = t + 0.2; track.beat = 0; track.barPlan = planBar(track); }
    if (nextBeatAt < t) nextBeatAt = t + 0.05;

    let guard = 0;
    while (nextBeatAt < t + 0.9 && guard++ < 10) {
      const T = track;
      // tempo: the intensity leans on it a few per cent, plus the tape's own
      // slow drift. Neither is ever a jump.
      const bpm = T.bpm * (1 + ivBar * 0.042) * (1 + 0.004 * Math.sin(t * 0.031));
      const spb = 60 / bpm;
      scheduleBeat(T, nextBeatAt, spb);
      nextBeatAt += spb;
      T.beat++;
      if (T.beat >= T.beats) {
        T.beat = 0; T.bar++;
        ivBar = intensity;                     // the tape only turns at a bar line
        if (T.bar >= T.total) {
          // end of side. Real store audio has a gap here and it is one of the
          // most identifiable things about it — you notice the room.
          gapUntil = nextBeatAt + 1.8 + rnd() * 4.2;
          track = null;
          break;
        }
        T.barPlan = planBar(T);
      }
    }
  }

  return {
    update, nodes,
    setIntensity(v) { intensity = clamp(v || 0, 0, 1); },
    get intensity() { return ivBar; },
    // 0 while the tape is between tracks. pa.js uses it to decide how much of
    // the ceiling to keep alive.
    get playing() { return !!track; },
    get now() { return track ? { tune: track.tune.name, key: track.key, bpm: +track.bpm.toFixed(1), lead: track.lead, groove: track.groove, bar: track.bar, of: track.total } : null; },
    stats() { return { nodesPerSec: madeLast, tune: track ? track.tune.name : '(tape gap)' }; },
    // debug: jump to a fresh track now
    next(t) { track = null; gapUntil = -1; update(0.016, t == null ? ctx.currentTime : t); return this.now; },
    set on(v) { on = v; },
    glue,
  };
}
