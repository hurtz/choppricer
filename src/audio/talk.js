// OWNER: builder-audio. THE HANDSET.
//
// Hold a key, talk into the microphone, and your own voice comes out of the
// store's ceiling. That is the whole feature and it is almost entirely made of
// parts that already existed: pa.js models an 8-inch coaxial can on a 70-volt
// line — HP 125/150, -5 dB @ 640, +2.5 @ 1.6 k, +3 @ 3.6 k, LP 8.2 k/11 k, a
// paper cone driven a little too hard — sitting forty metres away across four
// thousand square metres of concrete. Point a live microphone at the top of that
// chain and the player hears himself thin, honking, smeared, arriving from above
// and behind. Nobody had to build an effect. The building already was one.
//
// This file is the bit in front of the can: the handset preamp, the key click,
// the open channel, the duck, and the safety.
//
//   getUserMedia ─► micGate ─┐
//   (debug test signal) ─────┴─► micIn ─► HP 90 ─► preamp comp ─► guard ─► gate ─┐
//                                              └─► analyser (level + howl watch) │
//   key click / open-channel hiss ─────────────────────────────────────────────┬─┘
//                                                                              ▼
//                                                            pa.js `speech` ─► the can
//
// ---------------------------------------------------------------------------
// PRIVACY. THIS IS THE IMPORTANT PART OF THE FILE.
//
// Microphone audio enters the Web Audio graph and never leaves it. There is no
// MediaRecorder here, no ScriptProcessor tap, no buffer that outlives a sample,
// no fetch, no upload, and no path from `micIn` to anything except `speech` —
// which is the PA bus, which is already inside audio.js's master. The only
// number that ever escapes this module is `level`, a single smoothed RMS float
// for the HUD meter.
//
// The stream is acquired on the first key press (getUserMedia requires a user
// gesture) and cached, so the permission prompt happens once. On key-up the
// tracks are disabled immediately — that mutes at the capture device, not in
// software — and if the player does not key up again within HOLD_MS the tracks
// are stopped outright, which releases the device and takes the browser's
// recording indicator off the tab. Holding a live capture open all session for
// a feature used twice a round is not a thing to do to somebody.
//
// audio.js's recordWav() closes `micGate` for the length of a capture, so the
// one recorder in this codebase — a dev harness that POSTs to a localhost sink
// that does not exist in the shipped build — physically cannot record a voice.
//
// ---------------------------------------------------------------------------
// FEEDBACK. Read this before turning the gain up.
//
// The player is on a laptop. The microphone is nine inches from the speakers and
// the speakers are playing the PA. That is a loop with real gain in it, and the
// honk at 1.6 k and the breakup peak at 3.6 k sit exactly where a howl wants to
// live. Three defences, in order of how much work they do:
//
//  1. `echoCancellation: true`. The browser's AEC references the page's own
//     render stream, so the PA — including the player's own voice coming back —
//     is subtracted at the capture. This does 90% of the job and it is why the
//     constraints are not optional.
//  2. THE TAPE DUCKS. pa.js pulls the music to 0.18 while the channel is open,
//     the way a real priority input does. Authentic, and it removes the loudest
//     thing in the loop.
//  3. The howl watchdog below. A voice is bursty; a howl is a sine that does not
//     stop. If the mic sits above HOWL_ON for HOWL_HOLD seconds the guard gain
//     walks down, and it walks back up over three seconds once the level drops.
//     This is what an automatic feedback suppressor does, and it is the backstop
//     for the case where the AEC loses lock because somebody moved the laptop.
//
// Gain staging is the fourth defence and the quiet one: TALK_LVL is set so the
// voice sits with the announcer's, not over it. A PA the player can shout over
// is a PA that howls.

import { gain, filt, mulberry, clamp } from './dsp.js';

// How long the capture device stays claimed after the last key-up. Long enough
// that a burst of announcements does not re-acquire between each one; short
// enough that the tab's recording dot goes away when he stops using it.
const HOLD_MS = 20000;

const TALK_LVL = 0.62;      // mic into the can. Measured against voices.say's 0.46.
const HISS_LVL = 0.030;     // the amplifier's own noise floor, exposed by the key
const HOWL_ON = 0.30;       // linear RMS at the mic that counts as "too loud"
const HOWL_OFF = 0.12;
const HOWL_HOLD = 0.55;     // seconds above HOWL_ON before the guard moves

// opts: { seed, onOpen(t), onClose(t) }
export function createTalk(ctx, speechDest, noiseBuf, opts = {}) {
  const rnd = mulberry(opts.seed || 5501);
  const nodes = [];
  const N = (n) => { nodes.push(n); return n; };

  // ---- the handset preamp -------------------------------------------------
  // micGate is a separate node from micIn on purpose: it is the ONLY thing the
  // live capture passes through, so closing it is a hard guarantee about the
  // microphone that does not also silence the test signal a critic injects.
  const micGate = N(gain(ctx, 1));
  const micIn = N(gain(ctx, 1));
  micGate.connect(micIn);

  // 90 Hz. Handling noise, the desk fan, and the thump of the key itself. The
  // can highpasses again at 125/150 — this one is here so the compressor is not
  // pumping on rumble it is about to throw away anyway.
  const hp = N(filt(ctx, 'highpass', 90, 0.7));
  // A handset preamp has an AGC on it, because it is designed for people who
  // hold the thing at arm's length and then shout into it. Hard-ish, fast, and
  // it is also the second thing keeping the loop gain under one.
  const comp = N(ctx.createDynamicsCompressor());
  comp.threshold.value = -26; comp.knee.value = 12; comp.ratio.value = 6;
  comp.attack.value = 0.003; comp.release.value = 0.25;
  const guard = N(gain(ctx, 1));      // the howl watchdog owns this
  const gate = N(gain(ctx, 0));       // 0 unless the key is down. Always.
  micIn.connect(hp); hp.connect(comp); comp.connect(guard);
  guard.connect(gate); gate.connect(speechDest);

  // Level, for the HUD meter and for the watchdog. Time-domain only — this
  // never runs an FFT, it copies 1024 floats when the channel is open and
  // nothing at all when it is not.
  const an = N(ctx.createAnalyser());
  an.fftSize = 1024; an.smoothingTimeConstant = 0;
  comp.connect(an);
  const buf = new Float32Array(an.fftSize);

  // ---- the key ------------------------------------------------------------
  // A PA is identifiable before anybody says a word, and this is why: the
  // channel opens with a click and then a few hundred milliseconds of hiss that
  // was not there a moment ago. Both go through `speech`, so both get the can
  // and the room on them like everything else.
  function click(t, up) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const bp = filt(ctx, 'bandpass', up ? 1150 : 1900, up ? 1.1 : 0.9);
    const bd = filt(ctx, 'bandpass', up ? 520 : 700, 1.2);
    const g = gain(ctx, 0);
    s.connect(bp); s.connect(bd);
    const gb = gain(ctx, up ? 0.26 : 0.35);
    bp.connect(g); bd.connect(gb); gb.connect(g);
    g.connect(speechDest);
    const pk = up ? 0.38 : 0.55, d = up ? 0.032 : 0.055;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pk, t + 0.0025);
    g.gain.exponentialRampToValueAtTime(0.0004, t + d);
    s.start(t, rnd() * 2, d + 0.05);
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }

  let hiss = null;
  function hissOn(t) {
    hissOff(t, true);
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    // Amplifier hiss, not tape hiss: broad, centred in the upper mids, and then
    // the can's own lowpass finishes it. A pure highpassed white noise reads as
    // a cymbal; this reads as a channel.
    const bp = filt(ctx, 'bandpass', 2200, 0.5);
    const g = gain(ctx, 0);
    s.connect(bp); bp.connect(g); g.connect(speechDest);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(HISS_LVL, t + 0.012);
    s.start(t, rnd() * 2);
    hiss = { s, g };
  }
  function hissOff(t, now) {
    if (!hiss) return;
    const { s, g } = hiss; hiss = null;
    // The cut is abrupt. That abruptness IS the sound of a channel closing —
    // fade it and it turns into a synthesiser.
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, now ? 0.004 : 0.010);
    try { s.stop(t + 0.09); } catch (e) {}
    s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }

  // ---- state --------------------------------------------------------------
  let state = 'off';
  let stream = null, src = null;
  let want = false;                   // is the key down RIGHT NOW
  let deniedAt = -1e9;
  let releaseTimer = 0;
  let level = 0, hot = 0, guardG = 1, capMuted = false;

  function open(t) {
    click(t, false);
    hissOn(t + 0.010);
    // The mic comes up a beat after the click, which is both what a handset does
    // and a small mercy: the thump of the player's finger on the key does not
    // go out over the store.
    gate.gain.cancelScheduledValues(t);
    gate.gain.setValueAtTime(0, t);
    gate.gain.setValueAtTime(0, t + 0.075);
    gate.gain.linearRampToValueAtTime(TALK_LVL, t + 0.115);
    if (opts.onOpen) opts.onOpen(t);
  }

  function close(t) {
    gate.gain.cancelScheduledValues(t);
    gate.gain.setTargetAtTime(0, t, 0.012);
    gate.gain.setValueAtTime(0, t + 0.07);
    hissOff(t + 0.045);
    click(t + 0.055, true);
    if (opts.onClose) opts.onClose(t);
  }

  function dropStream() {
    releaseTimer = 0;
    if (src) { try { src.disconnect(); } catch (e) {} src = null; }
    if (stream) { for (const tr of stream.getTracks()) { try { tr.stop(); } catch (e) {} } stream = null; }
  }

  async function start() {
    want = true;
    if (state === 'live') return true;
    if (state === 'requesting') return false;
    if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = 0; }

    const md = typeof navigator !== 'undefined' && navigator.mediaDevices;
    if (!md || !md.getUserMedia || !ctx.createMediaStreamSource) {
      state = 'unsupported';
      return false;
    }
    // A player who said no once should not get the prompt machinery every time
    // he leans on the key. The retry window exists because he may have changed
    // his mind in site settings, which is a thing people do.
    if (state === 'denied' && Date.now() - deniedAt < 20000) return false;

    if (!stream) {
      state = 'requesting';
      let s;
      try {
        s = await md.getUserMedia({
          audio: {
            // Not optional. See the FEEDBACK note at the top of the file.
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          video: false,
        });
      } catch (e) {
        const n = (e && e.name) || '';
        // NotAllowedError    the player said no, or an iframe has no mic policy
        // SecurityError      insecure context
        // NotFoundError      no capture device at all
        // NotReadableError   something else has the device
        state = (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError')
          ? 'denied' : 'unsupported';
        if (state === 'denied') deniedAt = Date.now();
        return false;
      }
      // He let go while the prompt was up. Do not open the channel behind him;
      // hand the device straight back.
      if (!want) {
        for (const tr of s.getTracks()) { try { tr.stop(); } catch (e) {} }
        state = 'off';
        return false;
      }
      stream = s;
      try {
        src = ctx.createMediaStreamSource(stream);
        src.connect(micGate);
      } catch (e) {
        dropStream(); state = 'unsupported'; return false;
      }
    }
    for (const tr of stream.getAudioTracks()) tr.enabled = true;
    state = 'live';
    hot = 0; guardG = 1; guard.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
    open(ctx.currentTime + 0.02);
    return true;
  }

  function stop() {
    want = false;
    if (state === 'live') { close(ctx.currentTime + 0.005); state = 'off'; }
    if (stream) {
      // Muted at the device, immediately — not merely gated in software.
      for (const tr of stream.getAudioTracks()) tr.enabled = false;
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(dropStream, HOLD_MS);
    }
  }

  // ---- per-frame ----------------------------------------------------------
  // Called from pa.update(). Costs one branch when the channel is closed.
  function update(dt, t) {
    if (state !== 'live') {
      if (level > 0) level = Math.max(0, level - dt * 3);
      return;
    }
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);

    // Meter: -50 dB floor, -6 dB top, fast up and slow down so a HUD bar reads
    // like a VU and not like a strobe.
    const db = 20 * Math.log10(rms + 1e-7);
    const v = clamp((db + 50) / 44, 0, 1);
    level += (v - level) * (1 - Math.exp(-(v > level ? 22 : 5) * dt));

    // The howl watchdog.
    if (rms > HOWL_ON) hot += dt;
    else if (rms < HOWL_OFF) hot = Math.max(0, hot - dt * 0.8);
    const target = hot > HOWL_HOLD ? Math.max(0.15, guardG * 0.55) : Math.min(1, guardG + dt / 3);
    if (Math.abs(target - guardG) > 0.005) {
      guardG = target;
      guard.gain.setTargetAtTime(guardG, t, hot > HOWL_HOLD ? 0.05 : 0.4);
      if (hot > HOWL_HOLD) hot = 0;          // one step per hold window, then re-measure
    }
  }

  return {
    update, nodes, micIn, gate,
    start, stop,
    get state() { return state; },
    get level() { return level; },
    get live() { return state === 'live'; },
    get guard() { return guardG; },
    // Whether the capture device is currently claimed at all. The HUD can say
    // so; more to the point, a person can check it.
    get holding() { return !!stream; },
    // audio.js's recorder calls this. The mic cannot reach master while a
    // capture is running, full stop.
    muteCapture(on) { capMuted = !!on; micGate.gain.value = capMuted ? 0 : 1; },
    // Hand the device back now, without waiting out HOLD_MS.
    release() { if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = 0; } dropStream(); },

    // ---- debug ------------------------------------------------------------
    // Opens the channel with NO microphone: click, hiss, duck, gate, the can,
    // the room — everything except getUserMedia. A critic connects a test signal
    // to `micIn` and records master to prove the path without speaking into it.
    testOpen() {
      if (state === 'live') return false;
      want = true; state = 'live';
      hot = 0; guardG = 1;
      open(ctx.currentTime + 0.02);
      return true;
    },
  };
}
