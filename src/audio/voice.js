// OWNER: builder-audio. A voice you cannot quite make out.
//
// Source-filter synthesis: a glottal pulse train through three formant
// bandpasses that step between vowel targets on a syllable clock, with noise
// bursts for consonants. It is not speech synthesis and it is not trying to be —
// nothing in a supermarket is intelligible. The PA is a horn in a ceiling can
// forty metres away; a shopper two aisles over is behind eight tonnes of
// cardboard. What both of those sound like is prosody with the words taken off,
// and that is exactly what this produces.
//
// One voice = 1 osc + 1 noise source + 5 filters, alive only for the length of
// the phrase. Two at once, maximum.

import { gain, filt, pulseWave, mulberry } from './dsp.js';

// F1/F2/F3 for a relaxed male vocal tract. Scaled per speaker.
const VOWELS = [
  [730, 1090, 2440],  // a
  [530, 1840, 2480],  // e
  [270, 2290, 3010],  // i
  [570, 840, 2410],   // o
  [300, 870, 2240],   // u
  [500, 1500, 2500],  // schwa
  [660, 1720, 2410],  // ae
  [490, 1350, 2400],  // er
];

export function createVoiceBank(ctx, noiseBuf, seedBase = 4242) {
  const wave = pulseWave(ctx, 40, 1.05, 9);
  let seed = seedBase;
  let live = 0;

  // opts: { f0, when, dur, dest, level, rate, tense }
  function say(o) {
    if (live >= 2) return 0;
    const t0 = Math.max(ctx.currentTime + 0.01, o.when || ctx.currentTime);
    const f0 = o.f0 || 112;
    const dur = o.dur || 3.0;
    const rnd = mulberry(seed = (seed * 1664525 + 1013904223) >>> 0);
    live++;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;

    const glot = gain(ctx, 0);          // glottal (voiced) amplitude
    const fric = gain(ctx, 0);          // fricative (unvoiced) amplitude
    osc.connect(glot); src.connect(fric);
    const fricBP = filt(ctx, 'bandpass', 3400, 1.1);
    fric.connect(fricBP);

    const sum = gain(ctx, 1);
    const F = [];
    for (let i = 0; i < 3; i++) {
      const b = filt(ctx, 'bandpass', VOWELS[5][i], [7, 9, 11][i]);
      const g = gain(ctx, [1.0, 0.62, 0.30][i]);
      glot.connect(b); b.connect(g); g.connect(sum);
      F.push(b);
    }
    fricBP.connect(sum);
    // the tract's own tilt — a voice is not flat
    const tilt = filt(ctx, 'lowshelf', 420, 0.7, 4);
    const top = filt(ctx, 'highshelf', 3200, 0.7, -6);
    const outG = gain(ctx, o.level == null ? 0.5 : o.level);
    sum.connect(tilt); tilt.connect(top); top.connect(outG);
    outG.connect(o.dest);

    // ---- schedule the phrase ------------------------------------------------
    const rate = o.rate || (3.6 + rnd() * 1.3);      // syllables/sec
    let t = t0 + 0.02;
    // intonation: a declarative phrase falls, and the fall is most of what makes
    // a mumble read as a sentence rather than as a noise
    const top0 = f0 * (1.05 + rnd() * 0.14);
    let nsyl = 0;
    const end = t0 + dur;
    osc.frequency.setValueAtTime(top0, t0);
    // Hard syllable cap. Every syllable is ~8 AudioParam calls and the whole
    // phrase is scheduled in one frame; an unbounded nine-second announcement
    // measured a 4.1 ms spike in update(), which is a quarter of a frame for a
    // once-a-minute event. 30 syllables bounds it under a millisecond and no
    // real PA announcement is longer than that anyway.
    while (t < end - 0.05 && nsyl < 30) {
      const len = (1 / rate) * (0.66 + rnd() * 0.75);
      const hold = len * (0.42 + rnd() * 0.32);
      const k = (t - t0) / dur;
      // a comma: people pause
      if (rnd() < 0.10 && nsyl > 2) { t += 0.14 + rnd() * 0.34; continue; }
      const stress = rnd() < 0.3 ? 1.25 : 1.0;
      const f = top0 * (1 - 0.30 * k) * (0.93 + rnd() * 0.16) * stress;
      osc.frequency.setTargetAtTime(f, t, 0.035);

      const v = VOWELS[(rnd() * VOWELS.length) | 0];
      const sc = o.tense == null ? 1 : o.tense;
      for (let i = 0; i < 3; i++) F[i].frequency.setTargetAtTime(v[i] * sc, t, 0.028);

      // consonant on the front of most syllables
      if (rnd() < 0.72) {
        const cf = 1800 + rnd() * 4200;
        fricBP.frequency.setValueAtTime(cf, t);
        fric.gain.setValueAtTime(0, t);
        fric.gain.linearRampToValueAtTime(0.55 + rnd() * 0.5, t + 0.006);
        fric.gain.setTargetAtTime(0, t + 0.012, 0.018);
      }
      glot.gain.setTargetAtTime(0.9 * stress, t + 0.012, 0.016);
      glot.gain.setTargetAtTime(0.02, t + 0.012 + hold, 0.030);
      t += len; nsyl++;
    }
    glot.gain.setTargetAtTime(0, end - 0.02, 0.05);
    fric.gain.setTargetAtTime(0, end - 0.02, 0.05);
    outG.gain.setTargetAtTime(0, end + 0.02, 0.08);

    osc.start(t0); src.start(t0, rnd() * 2);
    osc.stop(end + 0.5); src.stop(end + 0.5);
    src.onended = () => {
      live--;
      try { outG.disconnect(); } catch (e) {}
    };
    return nsyl;
  }

  return { say, get live() { return live; } };
}
