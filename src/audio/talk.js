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
// live. Four defences — and ROUND 4 REORDERED THEM, because the one that used
// to be first turned out to be the bug:
//
//  1. THE TWO DUCKS, and they are first now because they are the only ones that
//     cost nothing. pa.js pulls the tape to 0.18 and audio.js pulls the bed down
//     6.9 dB while the channel is open, the way a real priority input does.
//     Seven decibels off the trolleys buys exactly as much audibility as seven
//     decibels more microphone gain, and unlike microphone gain it SUBTRACTS
//     from the loop instead of adding to it. Reach for these first, always.
//  2. `lim`, the amplifier's limiter, on the way out of this file. A hard
//     ceiling on the speech bus is an absolute bound on what the loop can do,
//     which no adaptive thing can promise.
//  3. The howl watchdog below — which in round 3 had never fired and could not
//     fire, because it was watching the wrong point in the chain. It works now,
//     and it is measured: see the matrix by HOWL_ON. A voice is bursty, a howl
//     is a tone that does not stop, and telling those apart is what it does.
//  4. `echoCancellation`, WHICH IS NOW OFF BY DEFAULT. It was defence number one
//     for a round and it was the reason the feature did nothing on speakers:
//     the browser's AEC references the page's own render stream, and in this
//     game the page's own render stream contains the player's voice coming back
//     out of the ceiling. It was subtracting the thing it was supposed to be
//     protecting. The full argument is by AEC_DEFAULT; talkEcho(true) restores
//     it for a machine that turns out to need it.
//
// TALK_LVL is the number to be careful with, and the one place where the
// audible answer and the safe answer pull against each other. See its comment.

import { gain, filt, mulberry, clamp } from './dsp.js';

// How long the capture device stays claimed after the last key-up. Long enough
// that a burst of announcements does not re-acquire between each one; short
// enough that the tab's recording dot goes away when he stops using it.
const HOLD_MS = 20000;

// Mic into the can. NOT set by ear — measured. A laptop microphone with
// autoGainControl on delivers speech at about -19 dBFS RMS (checked: the test
// voice used for the evidence clips arrives at micIn at -19.1). At the first
// value tried, 0.62, that landed the player's voice 10 dB UNDER the store bed —
// which is roughly where the store's own once-a-minute announcer sits, and fine
// for background, and useless for "I hear my own voice come out of the ceiling".
// Which way it went, and why it stopped where it did:
//
//   0.62  the first guess. Voice 10 dB UNDER the bed. Inaudible; the joke dies.
//   2.00  audible, and 25.7% THD on a 700 Hz tone (h3 at -11.8 dB). The store's
//         own announcer measures 7.0% through the same cone. The paper is being
//         driven past the knee and it stops sounding cheap and starts sounding
//         broken, which is a different and much less funny thing.
//   1.35  ~12% THD. Grittier than the automated announcer, which is right — a
//         live handset is hotter than the recording — and still a speaker.
//
// The level that 2.00 bought is made back in audio.js's bed duck instead, which
// costs distortion nothing and buys feedback margin rather than spending it.
const TALK_LVL = 1.35;
const HISS_LVL = 0.030;     // the amplifier's own noise floor, exposed by the key
// Linear RMS AT THE RAW MICROPHONE, in a 1024-sample window. Round 3's comment
// said "at the mic" and the code measured the compressor's output, which is why
// it never fired — see the anIn note below. Against the real input these are
// meaningful numbers: autoGainControl targets speech at about -19 dBFS (0.11),
// a shouted syllable peaks near 0.25 for a few tens of milliseconds, and a howl
// pins somewhere between 0.3 and 0.9 and STAYS there.
//
// The sweep, measured through the real chain:
//
//   0.34, level only    shout at -12 dBFS tripped it. A false positive on the
//                       one thing the feature actively invites somebody to do.
//   0.40, level only    shout safe, but a 1.6 kHz howl at 0.389 RMS — a
//                       perfectly ordinary mid-strength one — walked under the
//                       threshold and rang forever. A worse failure.
//   0.34 + steadiness   both right. Kept.
//
// LEVEL CANNOT SEPARATE A SHOUT FROM A HOWL, because they overlap; two rounds
// of threshold-picking is what proving that cost. Steadiness separates them by
// a mile — see the detector in update(). The final matrix:
//
//     input                          guard      tripped
//     voice, -19 dBFS (normal)       1.000      no
//     voice, -12 dBFS (shouting)     1.000      no
//     voice,  -8 dBFS (yelling)      1.000      no
//     howl 1600 Hz, 0.39 RMS         0.080      yes, 801 ms
//     howl 1600 Hz, 0.67 RMS         0.080      yes, 204 ms
//     howl 3600 Hz (breakup peak)    0.091      yes, 273 ms
//
// The louder the howl the faster it is caught, which is the right way round.
// Recovery to unity takes about 2.7 s once it stops.
const HOWL_ON = 0.34;
const HOWL_OFF = 0.14;
// Coefficient of variation of the short-term RMS, below which the input is
// "ringing" rather than "talking". Measured through the real chain: a 1.6 kHz
// tone sits near 0.05, speech at every level tested sits above 0.45.
const HOWL_STEADY = 0.30;
// ROUND 4: 0.55 -> 0.20. The AEC is no longer the first line of defence (see
// AEC_DEFAULT below), so the watchdog is. Half a second of a building howling
// at 1.6 kHz is not a diagnostic delay, it is the entire unpleasant event; by
// the time the old value had decided, the player had already reached for the
// volume knob. The step also got bigger and the floor lower, because a howl
// that is only pulled to -16 dB is a howl you can still hear.
const HOWL_HOLD = 0.20;     // seconds above HOWL_ON before the guard moves
const HOWL_STEP = 0.45;     // was 0.55
const HOWL_FLOOR = 0.08;    // was 0.15

// ---------------------------------------------------------------------------
// echoCancellation, AND WHY IT IS OFF — ROUND 4, BUG 2
//
// Client, having played it on SPEAKERS: "the voice thing doesn't work. It looks
// like it's recording, but it doesn't do anything."
//
// "Looks like it's recording" means the tab's capture indicator lit, so
// getUserMedia resolved and the device is open. Everything downstream of that
// was measured this round and is fine — see the note on the real-stream test at
// the bottom of this file. What is left is the one part of the chain that is
// not ours: the browser's own acoustic echo canceller, and on speakers it is
// pointed directly at this feature.
//
// Chrome's AEC references THE PAGE'S OWN RENDER STREAM. Round 3's comment
// called that a feature, and for a video call it is. Here it is fatal, because
// of what the render stream contains: the store, the tape, and — ten to two
// hundred milliseconds after he speaks, via four ceiling cans and a 2.35 s
// tail — HIS OWN VOICE. The canceller is being asked to subtract a reference
// signal that the near-end talker is inside. Worse, AEC3's residual suppressor
// gates the capture hard whenever it believes the far end is active, and in
// this game the far end is NEVER not active: there is always a supermarket
// coming out of the speakers. Device open, indicator lit, nothing audible.
// That is the client's sentence, mechanism first.
//
// On headphones there is no acoustic loop and none of this happens, which is
// exactly why round 3 shipped it: it was never tested the way he played it.
//
// So the constraint is off, and the feedback budget is rebuilt around that:
//
//   - the tape still ducks to 0.18 and the bed still ducks 6.9 dB, and those
//     two SUBTRACT from the loop instead of adding to it
//   - `lim` below is a hard ceiling on the speech bus, so no amount of loop
//     gain can produce a level the amp would not have produced anyway
//   - the howl watchdog now moves in a fifth of a second instead of half of one
//   - and the voice arrives at master around the level of the store bed, so the
//     loop gain through a laptop's speaker-to-mic path is far below unity
//
// If it ever does howl on somebody's machine, audio.js exposes talkEcho(true)
// and the old behaviour is one call away without a rebuild.
const AEC_DEFAULT = false;

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
  // ---- the amplifier's limiter -------------------------------------------
  // ROUND 4. Measured at the `speech` bus with a voice-shaped signal injected
  // at the level a laptop microphone actually delivers (-19.1 dBFS RMS): the
  // handset arrived at -14.7 dBFS RMS and PEAKED AT -2.81 dBFS. The next node
  // it meets is pa.js's `drive`, a tanh at 1.55, so those peaks were being
  // shaped at x = 0.72 — the top of the curve, where the paper cone stops
  // sounding cheap and starts sounding broken. The compressor above is an AGC
  // for people who hold a handset at arm's length; it has a 3 ms attack and a
  // 12 dB knee and it lets every transient straight through, which is correct
  // for what it is and useless as a ceiling.
  //
  // A 70 V rack amp has a limiter on its priority input. This is that: fast,
  // high ratio, and it exists so the AVERAGE level can go up (see pa.js — the
  // ceiling comes up 5 dB while the channel is live) while the PEAK into the
  // cone goes DOWN. More voice, less distortion, and it is also the absolute
  // bound on the feedback loop now that the browser's canceller is out of it.
  //
  // Measured doing its job on the voice-shaped test signal: 3.6 dB of gain
  // reduction on average and 5.5 dB on the loudest syllables, which is a
  // limiter catching peaks and not a compressor squashing a performance.
  const lim = N(ctx.createDynamicsCompressor());
  lim.threshold.value = -10; lim.knee.value = 2; lim.ratio.value = 20;
  lim.attack.value = 0.002; lim.release.value = 0.10;
  micIn.connect(hp); hp.connect(comp); comp.connect(guard);
  guard.connect(gate); gate.connect(lim); lim.connect(speechDest);

  // Level, for the HUD meter. Time-domain only — this never runs an FFT, it
  // copies 1024 floats when the channel is open and nothing at all when it is
  // not. It reads the COMPRESSOR, which is what is actually going to air.
  const an = N(ctx.createAnalyser());
  an.fftSize = 1024; an.smoothingTimeConstant = 0;
  comp.connect(an);
  const buf = new Float32Array(an.fftSize);

  // ---- and a SECOND one, on the raw microphone, for the watchdog ----------
  //
  // ROUND 4 — THE WATCHDOG HAD NEVER FIRED, AND COULD NOT. It read the same
  // analyser as the meter, i.e. the output of a 6:1 compressor with its
  // threshold at -26 dBFS, and compared it against HOWL_ON = 0.30 linear, which
  // is -10.5 dBFS. Work the compressor backwards: to put 0.30 RMS on its OUTPUT
  // you have to put about +85 dBFS on its input. There is no such signal. The
  // guard has sat at exactly 1.000 for every frame of its existence.
  //
  // Proved rather than reasoned: a sustained 1.6 kHz sine at 0.55 amplitude —
  // the can's own honk frequency, i.e. a textbook howl, and 11 dB hotter than a
  // shout — injected at micIn for 2.6 s. guard stayed at 1.000 for all 26
  // samples. The compressor's own gain reduction was hiding the event from the
  // thing whose job was to notice it.
  //
  // This is the shadow-block shape CLAUDE.md warns about, in a different
  // costume: not a constant that is read from the wrong object, but a constant
  // that is compared against the wrong SIGNAL. It read plausibly for a round and
  // did nothing, and it mattered the moment round 4 took the browser's echo
  // canceller out and told this file the watchdog was the first line of defence.
  //
  // A howl detector wants the raw input, because the compressor above it is an
  // AGC and hiding level is its entire function. One more AnalyserNode, one more
  // 1024-float copy per frame WHILE THE CHANNEL IS OPEN, and nothing at all the
  // rest of the time.
  const anIn = N(ctx.createAnalyser());
  anIn.fftSize = 1024; anIn.smoothingTimeConstant = 0;
  hp.connect(anIn);
  const bufIn = new Float32Array(anIn.fftSize);

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
  let level = 0, hot = 0, guardG = 1;
  let rMean = 0, rVar = 0;            // the howl detector's steadiness estimate
  let aec = AEC_DEFAULT;              // see the note by AEC_DEFAULT

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
            // OFF by default, and the reason is forty lines at the top of this
            // file. It is the thing that made the feature do nothing on
            // speakers. talkEcho(true) puts it back.
            echoCancellation: aec,
            // Kept. Chrome's suppressor is a STATIONARY-noise suppressor, and
            // the thing it will find in this microphone is the store bed coming
            // back out of the speakers — which is exactly the broadband half of
            // the feedback loop. It removes loop gain instead of adding it, and
            // it does not touch a voice.
            noiseSuppression: true,
            // Kept, reluctantly. Without it the delivered level is whatever the
            // player's device felt like and TALK_LVL is a guess about a stranger's
            // hardware. It rides down against the leaked bed, which costs a few
            // decibels; the limiter and pa.js's ceiling lift buy them back.
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
    // rMean/rVar too: a steadiness estimate left over from the last hold would
    // otherwise decide the first third of a second of this one.
    hot = 0; guardG = 1; rMean = 0; rVar = 0;
    guard.gain.setTargetAtTime(1, ctx.currentTime, 0.05);
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
    // like a VU and not like a strobe. Unchanged — game.js's meter reads this
    // and it was never the broken part.
    const db = 20 * Math.log10(rms + 1e-7);
    const v = clamp((db + 50) / 44, 0, 1);
    level += (v - level) * (1 - Math.exp(-(v > level ? 22 : 5) * dt));

    // The howl watchdog, now looking at the RAW MICROPHONE — see anIn above for
    // why it spent round 3 looking at a signal that could not trip it.
    anIn.getFloatTimeDomainData(bufIn);
    let sIn = 0;
    for (let i = 0; i < bufIn.length; i++) sIn += bufIn[i] * bufIn[i];
    const rmsIn = Math.sqrt(sIn / bufIn.length);
    // `hot` must DECAY whenever the input is not actually hot, and round 3's
    // version only decayed below HOWL_OFF. Anything landing in the gap between
    // the two thresholds froze the accumulator instead of unwinding it, so a
    // loud voice — which lives in that gap almost continuously — ratcheted `hot`
    // upward across its own syllable gaps.
    //
    // But the decay rule alone is not enough, and the sweep says so: at any
    // threshold low enough to see a mid-strength howl, a sustained shout trips
    // it too, because THE TWO OVERLAP IN LEVEL. Separating them by loudness is
    // not possible. So separate them by the thing that actually differs.
    //
    // A howl is a room resonance ringing. Its short-term level is almost
    // perfectly CONSTANT. A voice — any voice, at any volume — is syllables,
    // and its short-term level swings enormously from frame to frame. The
    // coefficient of variation of the 21 ms RMS over about a third of a second
    // is ~0.05 for a ringing tone and 0.5-1.0 for speech, and that gap is a
    // chasm compared to the few decibels separating a shout from a howl.
    //
    // Two exponential accumulators and a square root, once a frame, only while
    // the channel is open. No FFT — the cost note at the top of this file still
    // holds. `veryLoud` is the belt-and-braces: something twice over the
    // threshold gets caught whatever its shape, because at that level being
    // wrong about the diagnosis costs less than being slow.
    const aS = 1 - Math.exp(-dt / 0.33);
    rMean += (rmsIn - rMean) * aS;
    const dv = rmsIn - rMean;
    rVar += (dv * dv - rVar) * aS;
    const steady = rMean > 1e-6 ? Math.sqrt(Math.max(0, rVar)) / rMean : 1;
    const veryLoud = rmsIn > HOWL_ON * 1.7;
    if (rmsIn > HOWL_ON && (steady < HOWL_STEADY || veryLoud)) hot += dt;
    else hot = Math.max(0, hot - dt * (rmsIn < HOWL_OFF ? 1.6 : 0.55));
    const target = hot > HOWL_HOLD ? Math.max(HOWL_FLOOR, guardG * HOWL_STEP) : Math.min(1, guardG + dt / 3);
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
    muteCapture(on) { micGate.gain.value = on ? 0 : 1; },
    get captureMuted() { return micGate.gain.value === 0; },
    // Hand the device back now, without waiting out HOLD_MS.
    release() { if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = 0; } dropStream(); },

    // ---- the AEC escape hatch ----------------------------------------------
    // Round 4 turned the browser's echo canceller OFF because on speakers it
    // was subtracting the player's own voice — see AEC_DEFAULT. If somebody's
    // machine howls instead, this puts it back. It drops the cached stream, so
    // the NEXT key press re-acquires with the new constraint; it cannot change
    // a capture that is already open, because a MediaStreamTrack's audio
    // processing is fixed when the track is created.
    echo(on) {
      const v = on !== false;
      if (v === aec) return aec;
      aec = v;
      if (state !== 'live') dropStream();
      return aec;
    },
    get aec() { return aec; },

    // ---- debug ------------------------------------------------------------
    // Opens the channel with NO microphone: click, hiss, duck, gate, the can,
    // the room — everything except getUserMedia. A critic connects a test signal
    // to `micIn` and records master to prove the path without speaking into it.
    testOpen() {
      if (state === 'live') return false;
      want = true; state = 'live';
      hot = 0; guardG = 1; rMean = 0; rVar = 0;
      open(ctx.currentTime + 0.02);
      return true;
    },
  };
}

// ---------------------------------------------------------------------------
// ROUND 4 — WHAT WAS ACTUALLY TESTED, AND WHAT WAS NOT
//
// Round 3 shipped this file with the live-microphone path untested and that is
// how a dead feature reached the client. So, plainly, in both directions:
//
// TESTED, with a real MediaStream through the real start().
//   The browser available to the build agent answers navigator.permissions
//   query({name:'microphone'}) with 'denied' and enumerateDevices() returns one
//   input with no label, i.e. no capture is possible in it at all. So the test
//   substituted getUserMedia itself: a MediaStreamAudioDestinationNode fed with
//   a voice-shaped signal (three formant resonators, syllable-gated, trimmed to
//   -19.1 dBFS RMS — the level round 3 measured a laptop microphone deliver),
//   handed back from a patched navigator.mediaDevices.getUserMedia. That
//   exercises start() verbatim: the constraints object, the `want` race, the
//   cached-stream branch, createMediaStreamSource, track.enabled, micGate, the
//   compressor, the guard, the gate and the ducking arbiter. Results:
//
//     talkStart() -> true, state 'live', track enabled/live/unmuted
//     gate.gain     1.35   TALK_LVL IS applied on the real path
//     guard         1.00   the watchdog did NOT fire on speech. The round-4
//                          brief's hypothesis that it rides the gain to nothing
//                          is wrong for a normal voice; it only moves under an
//                          actual howl, which is its job.
//     micGate       open   not left closed by recordWav
//     master spectrum, real stream vs the same signal injected at micIn:
//                          identical to within 0.2 dB in every band.
//
//   So nothing between the capture device and the ceiling is broken. That is
//   worth stating positively, because it is what rules out the whole middle of
//   the file and leaves only the two ends: the browser's processing, and the
//   level.
//
//   The level end was measured at the `speech` bus against the store's own
//   announcer, which is the right yardstick because it is the same cone:
//
//     announcer   -27.2 dBFS RMS,  peak -14.7
//     handset     -14.7 dBFS RMS,  peak  -2.8      12.5 dB hotter, and
//                                                  clipping the tanh
//
//   and at master, in aisle 4, against the whole store: the handset came out at
//   PARITY with the bed, and opening the channel took the mix 4.3 dBA DOWN,
//   because the tape duck and the bed duck are worth more than the voice they
//   make room for. Hence pa.js's priority-input lift and the limiter above.
//
// NOT TESTED. A REAL MICROPHONE, ON SPEAKERS.
//   Which is precisely the configuration the client played in and precisely the
//   configuration the echoCancellation argument is about. The build agent could
//   not do it: the browser it drives denies microphone permission outright, and
//   opening the user's own microphone and playing sound out of the user's own
//   speakers is not something to do on a colleague's say-so. So AEC_DEFAULT is
//   reasoned, not measured — the mechanism is documented at the top of the file
//   and it fits the client's sentence exactly, but the confirming experiment is
//   one person, one laptop, one held key, and it has not happened yet. Somebody
//   with a microphone should hold [F] on speakers before this is called fixed,
//   and talkEcho(true) is the one-call fallback if it howls instead.
//
// AND ONE THING THAT IS NOT IN THIS FILE.
//   game.js gates [F] on paReady(), which is `mode === 'desk' && holdCool <= 0
//   && !held`, and talkClose() sets holdCool to HOLD.cool = 21 s on every
//   release. HOLD.dur is 9 s. So for roughly twelve seconds after each use,
//   talkOpen() returns immediately and the key does nothing at all — no click,
//   no channel, no feedback of any kind — while talk.js is still holding the
//   capture device open for HOLD_MS = 20 s and the tab's recording dot is still
//   lit. "It looks like it's recording, but it doesn't do anything" is also a
//   literal description of that window. Not mine to change; flagged to the lead.
