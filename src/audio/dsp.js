// OWNER: builder-audio. Primitives. No game knowledge lives in here.
//
// Everything in CHOP PRICER's audio is synthesised at runtime — there are no
// sample files, because the shipping build is one HTML file and an asset that
// is not synthesised does not exist. This module is the bottom of that stack:
// seeded noise, procedural impulse responses, and the small node helpers that
// the rest of src/audio/ builds voices out of.

// ---------------------------------------------------------------- randomness
// Seeded, so an IR is byte-identical between runs and two critics listening to
// "the aisle" are listening to the same aisle.
export function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------- noise buffers
// White. Used as the raw source for every one-shot: a BufferSource reading a
// random offset out of a long shared buffer is the cheapest grain there is.
export function whiteBuffer(ctx, seconds, seed, channels = 2) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const b = ctx.createBuffer(channels, n, ctx.sampleRate);
  const r = mulberry(seed);
  for (let c = 0; c < channels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1;
  }
  return b;
}

// Pink (Paul Kellett's economy filter). Every ambience bed starts here, because
// a flat white bed is the sound of a noise generator and pink is the sound of
// air moving.
export function pinkBuffer(ctx, seconds, seed, channels = 2) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const b = ctx.createBuffer(channels, n, ctx.sampleRate);
  const r = mulberry(seed);
  for (let c = 0; c < channels; c++) {
    const d = b.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = r() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // The loop point is the enemy. Butt-splice-safe: cross-fade the last 250 ms
    // over the head so the seam is a fade between two uncorrelated noises rather
    // than a step, and nothing in the bed ever ticks.
    const x = Math.min(Math.floor(ctx.sampleRate * 0.25), (n / 4) | 0);
    for (let i = 0; i < x; i++) {
      const k = i / x;
      d[i] = d[i] * k + d[n - x + i] * (1 - k);
    }
  }
  return b;
}

// ------------------------------------------------------- impulse responses
// A supermarket is a 4000 m2 box with a concrete floor and a metal deck. There
// is nothing soft in it, so the tail is long AND bright — the high band decays
// only a little faster than the mid, which is the opposite of a room with
// carpet and people in it.
//
// Built as three band-limited noise tails with independent RT60s, plus discrete
// early reflections, plus (for the aisle) a flutter comb. Three bands is enough
// to control the two things the ear actually reads: how long it rings, and
// whether the ring is bright or dark.
//
//   rtLo/rtMid/rtHi  seconds to -60 dB in each band
//   fLo/fHi          band split frequencies
//   taps             [[timeSec, gain, pan(-1..1)], ...] early reflections
//   flutter          { t, g, n } repeating slap — a parallel-wall corridor
//   modes            [[hz, gain, rt], ...] axial room modes
//   width            0 = mono tail, 1 = fully decorrelated
//   build/build0     how fast the diffuse tail comes up behind the reflections
//
// `build` is the one that took two rounds to get right. A real room does not
// go diffuse instantly: for the first few tens of milliseconds you are hearing
// COUNTABLE reflections off specific surfaces, and only after that does it
// smear. Round 1 started the noise tail at full amplitude from 8 ms, which
// drowned every early reflection and the whole flutter comb 10 dB under a wash
// — the aisle measured a 23.4 ms slap that was mathematically present and
// acoustically invisible. Holding the tail down to `build0` and ramping it in
// over `build` seconds is what turns "a reverb" into "that corridor".
export function makeIR(ctx, o) {
  const sr = ctx.sampleRate;
  const pre = o.predelay || 0;
  const rtMax = Math.max(o.rtLo, o.rtMid, o.rtHi);
  const len = Math.max(128, Math.ceil(sr * (pre + rtMax * 1.02)));
  const buf = ctx.createBuffer(2, len, sr);
  const p0 = Math.floor(pre * sr);
  const aLo = 1 - Math.exp((-2 * Math.PI * (o.fLo || 200)) / sr);
  const aHi = 1 - Math.exp((-2 * Math.PI * (o.fHi || 2600)) / sr);
  const kLo = Math.log(0.001) / o.rtLo, kMid = Math.log(0.001) / o.rtMid, kHi = Math.log(0.001) / o.rtHi;
  const w = o.width == null ? 0.9 : o.width;
  const blT = o.build == null ? 0.05 : o.build;
  const bl0 = o.build0 == null ? 0.14 : o.build0;
  const rC = mulberry((o.seed || 7) * 3 + 11);          // the shared (mono) part
  const common = new Float32Array(len);
  for (let i = 0; i < len; i++) common[i] = rC() * 2 - 1;

  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    const r = mulberry((o.seed || 7) + c * 977);
    let lo = 0, hi = 0;
    for (let i = p0; i < len; i++) {
      const t = (i - p0) / sr;
      const n = (r() * 2 - 1) * w + common[i] * (1 - w);
      lo += aLo * (n - lo);                              // < fLo
      hi += aHi * (n - hi);                              // < fHi
      const mid = hi - lo, top = n - hi;
      // 6 ms fade-in so the tail does not start as a click, then the
      // diffusion build: the wash comes up BEHIND the early reflections
      // instead of on top of them.
      const fin = t < 0.006 ? t / 0.006 : 1;
      const dif = bl0 + (1 - bl0) * (t >= blT ? 1 : (t / blT) * (t / blT));
      d[i] = fin * dif * (lo * Math.exp(kLo * t) * (o.gLo == null ? 1 : o.gLo)
                  + mid * Math.exp(kMid * t)
                  + top * Math.exp(kHi * t) * (o.gHi == null ? 1 : o.gHi));
    }
    // --- discrete early reflections. Slightly different times per ear; that
    // difference is the entire reason a room has a width.
    for (const [tt, g, pan] of (o.taps || [])) {
      const jitter = 1 + (c === 0 ? -1 : 1) * 0.045 * (0.4 + r() * 0.6);
      const i = p0 + Math.floor(tt * jitter * sr);
      if (i < 2 || i >= len - 6) continue;
      const side = c === 0 ? (1 - pan) * 0.5 : (1 + pan) * 0.5;
      const amp = g * (0.35 + side * 1.3);
      // a reflection off a shelf full of cardboard is not an impulse; give it
      // ~1.6 ms of smear so it reads as a surface and not as a tick. Any longer
      // and the reflections stop being countable, which is the whole point.
      for (let k = 0; k < Math.floor(sr * 0.0016); k++) {
        d[i + k] += amp * (r() * 2 - 1) * Math.exp(-k / (sr * 0.00045));
      }
    }
    // --- flutter: parallel hard walls 4 m apart, i.e. the whole point of an aisle
    //
    // The repeats have to be THE SAME BURST. A flutter echo is one sound bouncing
    // between two surfaces; if each repeat is freshly generated noise the ear
    // reads it as dense early reflections and never hears the ring. Round 2
    // measured this: the envelope had the right structure and the
    // autocorrelation at 23.4 ms was 0.001, i.e. no periodicity at all. One
    // burst, copied, decaying, alternating ears — that is a corridor.
    if (o.flutter) {
      const F = o.flutter;
      const bn = Math.floor(sr * 0.0022);
      const burst = new Float32Array(bn);
      for (let j = 0; j < bn; j++) burst[j] = (r() * 2 - 1) * Math.exp(-j / (sr * 0.0006));
      for (let k = 1; k <= F.n; k++) {
        const i = p0 + Math.floor(F.t * k * sr * (1 + (c ? 0.006 : -0.006)));
        if (i >= len - bn - 4) break;
        const amp = F.g * Math.pow(F.decay || 0.62, k) * (k % 2 === (c ? 0 : 1) ? 1 : 0.72);
        for (let j = 0; j < bn; j++) d[i + j] += amp * burst[j];
      }
    }
    // --- axial modes. A big flat box rings at c/2L; the vertical mode of a
    // 5.2 m ceiling lands right where the HVAC already is, which is why big
    // rooms feel heavy rather than merely loud.
    for (const [f, g, rt] of (o.modes || [])) {
      const ph = r() * Math.PI * 2, kk = Math.log(0.001) / rt;
      for (let i = p0; i < len; i++) {
        const t = (i - p0) / sr;
        d[i] += g * Math.sin(2 * Math.PI * f * t + ph) * Math.exp(kk * t);
      }
    }
  }
  // Normalise on TOTAL ENERGY, per channel. sum(ir^2) is the power gain a
  // convolution applies to broadband input, so this makes trim=1 mean "the wet
  // return sits at the same level as the dry" for every room in the set — and
  // crossfading from the aisle to the front end becomes a change of character
  // and not a change of volume.
  //
  // ROUND 1 GOT THIS WRONG AND IT WAS THE WHOLE BUG. It normalised
  // sqrt(sum/sampleRate) to 3.2, which sets sum(ir^2) to ten times the sample
  // rate — about +57 dB of convolution gain. Every clip came back at -9 dBFS
  // RMS regardless of what was feeding it, because the limiter was the loudest
  // object in the building and every source was 40 dB into it. Levels are not a
  // taste question when a normalisation constant is off by six orders of
  // magnitude; nothing else in the mix can be judged until this is right.
  let e = 0;
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) e += d[i] * d[i]; }
  const g = (o.trim == null ? 1 : o.trim) / Math.sqrt(e / 2 + 1e-12);
  for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] *= g; }
  return buf;
}

// ------------------------------------------------------------- node helpers
export function gain(ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }

export function filt(ctx, type, f, q = 1, gdb = 0) {
  const b = ctx.createBiquadFilter();
  b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gdb;
  return b;
}

export function chain(...nodes) {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

// equalpower, not HRTF: nine cameras already render this scene nine times a
// frame and HRTF convolution per source is the one audio cost that would show
// up in the frame budget. Width comes from the room instead, which is where a
// supermarket's width actually comes from.
export function panner(ctx, x = 0, y = 1.6, z = 0, ref = 3, roll = 1) {
  const p = ctx.createPanner();
  p.panningModel = 'equalpower';
  p.distanceModel = 'inverse';
  p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 90;
  setPos(p, x, y, z);
  return p;
}

export function setPos(p, x, y, z, when, smooth) {
  if (p.positionX) {
    if (smooth) {
      p.positionX.setTargetAtTime(x, when, smooth);
      p.positionY.setTargetAtTime(y, when, smooth);
      p.positionZ.setTargetAtTime(z, when, smooth);
    } else { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; }
  } else if (p.setPosition) p.setPosition(x, y, z);
}

// Looping noise source with a random start offset — two voices reading the same
// buffer never line up, so a shared 9-second bed sounds like N different beds.
export function loopNoise(ctx, buf, rate = 1, rnd = Math.random) {
  const s = ctx.createBufferSource();
  s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
  s.start(ctx.currentTime, rnd() * buf.duration);
  return s;
}

// Soft saturation. Used on the PA (a paper cone in a steel can) and on the
// output limiter's makeup stage.
export function shaper(ctx, amount = 2, n = 1024) {
  const ws = ctx.createWaveShaper();
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  ws.curve = c; ws.oversample = '2x';
  return ws;
}

// A glottal pulse: harmonics falling at ~1/n with the top rolled off. The
// source for every voice in this game — the PA announcer, the murmur, the kid.
export function pulseWave(ctx, partials = 44, tilt = 1.0, seed = 5) {
  const re = new Float32Array(partials + 1), im = new Float32Array(partials + 1);
  const r = mulberry(seed);
  for (let n = 1; n <= partials; n++) {
    const a = Math.pow(n, -tilt) * Math.exp(-n / 26);
    im[n] = a * (0.85 + r() * 0.3);
  }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

// A magnetic ballast's buzz: 120 Hz with the odd harmonics carrying most of the
// character. This waveform is the single most identifiable "you are inside a
// commercial building" cue that exists.
export function ballastWave(ctx, seed = 3) {
  const N = 24;
  const re = new Float32Array(N + 1), im = new Float32Array(N + 1);
  const r = mulberry(seed);
  const H = { 1: 1.0, 2: 0.30, 3: 0.52, 4: 0.13, 5: 0.34, 6: 0.07, 7: 0.20, 9: 0.12, 11: 0.075, 13: 0.045, 15: 0.03, 17: 0.02 };
  for (const k in H) { const n = +k; im[n] = H[k] * (0.9 + r() * 0.2); }
  return ctx.createPeriodicWave(re, im, { disableNormalization: false });
}

// Sum L+R into both channels. The store heard through a wall is not stereo.
export function monoise(ctx) {
  const sp = ctx.createChannelSplitter(2), mg = ctx.createChannelMerger(2);
  const gl = gain(ctx, 0.5), gr = gain(ctx, 0.5);
  sp.connect(gl, 0); sp.connect(gr, 1);
  gl.connect(mg, 0, 0); gr.connect(mg, 0, 0);
  gl.connect(mg, 0, 1); gr.connect(mg, 0, 1);
  return { in: sp, out: mg };
}

// smooth, allocation-free param moves. Called a lot; setTargetAtTime is the
// cheapest way to not hear a zipper.
export function to(param, v, t, tau = 0.06) {
  if (!isFinite(v)) return;
  param.setTargetAtTime(v, t, tau);
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
// smoothstep, for zone crossfades — a linear crossfade between two rooms has an
// audible seam at the midpoint and a smoothstep does not.
export const smooth = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0 || 1e-9), 0, 1);
  return t * t * (3 - 2 * t);
};
