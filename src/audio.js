// OWNER: builder-audio. Everything you hear.
//
// CONTRACT — must keep exporting exactly this:
//   createAudio(THREE, camera) -> {
//     master,                  // AudioNode: the final pre-destination node. The lead
//                              //   taps this to record, so EVERYTHING must route here.
//     ctx,                     // AudioContext
//     resume(),                // browsers block audio until a user gesture
//     update(dt, state),       // state: { mode, cop, shoppers, chasing, gassed, boost, viaBack }
//     setMix(name, gain),      // 'ambience' | 'pa' | 'foley' | 'ui'
//
//     // ---- PUSH TO TALK (round 3). Hold a key, talk, hear yourself in the
//     // ceiling. game.js binds a key to start/stop and may draw talkLevel().
//     talkStart(),             // -> Promise<boolean>. Call on KEYDOWN: getUserMedia
//                              //   needs the gesture. false = denied/unavailable,
//                              //   which is a normal outcome and never an error.
//     talkStop(),              // call on keyup. Safe to call when nothing is live.
//     talkState(),             // 'off' | 'requesting' | 'live' | 'denied' | 'unsupported'
//     talkLevel(),             // 0..1 smoothed input level, for a HUD meter
//   }
//
// NOTHING about the game changes if the player has no microphone or says no.
// talkStart() resolves false, talkState() reads 'denied' or 'unsupported', and
// every other sound in the building carries on exactly as before. Do not gate
// anything on it succeeding.
//
// Browsers will not start an AudioContext without a user gesture. index.html's start
// card gives us one — main.js calls resume() on that click.
//
// THE BAR: a real supermarket. Not "game music". The player should be able to close
// their eyes and know they are standing in a grocery store. See AUDIO_BRIEF.md.
//
// ---------------------------------------------------------------------------
// HOW IT IS BUILT
//
// Everything is synthesised. There is not one sample file in here, because the
// shipping build is a single HTML document and an audio asset that was not
// generated at runtime does not exist.
//
// The signal path, and the reason for it:
//
//   muzak ────────────────────┐
//   MICROPHONE ─► talk ─► speech ─► pa (the ceiling speaker) ─┐
//   bed / pa / foley ──dry──►  storeDry ─┐
//                    └─send──►  room.input ──► [AISLE conv | OPEN conv] ──┤
//                                                                          ├─► room.storeIn
//                                                       ┌──────────────────┘
//                                     ┌── on the floor ─┴─ direct ─────────┐
//                                     └── at the desk ─── through a wall ──┤
//                                                                          ▼
//   desk-local ──dry────────────────────────────────────────────────► outSum ─► limit ─► master
//              └─send──► room.smallIn ──► [DESK conv] ──────────────────►│
//   breath / pulse ──────────────────────────────────────────────────────┘
//
// Two things about that graph are load-bearing:
//
//  1. THE STORE'S REVERB HAPPENS BEFORE THE WALL. At the desk you are not hearing
//     a small room with a supermarket in it, you are hearing a supermarket
//     through 150 mm of stud wall and then the small room you are sitting in.
//     Those are completely different sounds and the second one is the real one.
//  2. THE PLAYER'S OWN BODY BYPASSES ALL OF IT. His breathing does not arrive via
//     a 2.3-second tail, because it starts eight centimetres from his ears.
//
// Cost: see stats(). The DSP runs on the audio thread; what shows up in the
// game's frame budget is only the JavaScript in update(), which is measured on
// the bench at 0.11-0.16 ms a frame, 1.3 ms worst case, 634 persistent nodes
// and two live convolvers in either mode. The worst case is a beat of the tape
// landing in the same frame as a checkout burst; it is a bar-scheduler spike,
// not a floor, and it is why muzak.js schedules a BEAT at a time and not a bar.
//
// ---------------------------------------------------------------------------
// ROUND 2 — WHAT CHANGED AND WHY
//
// The client heard round 1: "there needs to be music, and it needs to be
// better." Two things came out of that, and they are the two headlines:
//
//  THE MUSIC (src/audio/muzak.js — new). Round 1 HAD music and he did not hear
//  it, which is a measurement, not an opinion: the PA soloed at -38.8 dBFS RMS
//  against an ambience bed at -34.1 — five decibels under the air conditioning
//  — with 70% of its energy inside one octave at 2 kHz, nothing at all below
//  180 Hz, and a melody generated as a random walk. No bass, so no groove; no
//  repeated phrase, so no tune. It is now a small easy-listening band playing
//  four written tunes out of the ceiling, and the ceiling speaker got bigger
//  and much more honest. See muzak.js and pa.js.
//
//  THE LUNGS (src/audio/foley.js). "He pants... you should see that in his
//  huff-huff... and then it lets up right as he gets his breath back." Round 1
//  ran one symmetrical breath cycle at a rate that scaled with effort, which at
//  speed reads as a man doing breathing exercises. It is now PAIRS of short
//  hard mouth-breaths with a real gap between them and a longer one after, all
//  driven off cop.userData.fatigue rather than off the tank, plus a dedicated
//  one-shot RELIEF breath on the way out of winded — which is the reward for
//  letting go of the sprint key and the half he asked for twice.
//
// Everything else got the broadband texture it was missing: cart traffic across
// the whole store, somebody putting stock out, an air curtain at the chilled
// run, the back room through a swing door, and traffic through the front glass.
// See the ROUND 2 section in bed.js for the measurements that motivated each.
//
// ---------------------------------------------------------------------------
// ROUND 3 — THE HANDSET
//
//  "Somebody can hit and hold down a button and then speak and say, 'I need a
//   price check on aisle five'... and then you hear your voice in the game."
//
// One new file, src/audio/talk.js, and about forty lines in pa.js. That ratio is
// the whole story: the PA chain was already a model of an 8-inch coax ceiling
// can forty metres away in a 4000 m2 concrete box, so pointing a live microphone
// at the top of it does the joke for free. No effect was written for this. The
// player's voice comes back thin, honking at 1.6 k, missing everything under
// 125 Hz, smeared by a 2.35-second tail and arriving from four cans none of
// which he is standing under, because that is what the building does to sound.
//
// Read the top of talk.js before touching it. Two things in there are not
// preferences: microphone audio never leaves the Web Audio graph, and the
// feedback defences (browser AEC, the tape ducking to 0.18, the howl watchdog,
// and conservative gain staging) are what stop a player on laptop speakers
// getting a howl instead of a joke.
//
// There is deliberately NO speech recognition. Web Speech is a network call, and
// this game makes no network requests at runtime — but the better reason is that
// the game not understanding you is funnier than the game understanding you.
//
// ---------------------------------------------------------------------------
// TWO THINGS THE HARNESS PROMISES THAT DO NOT ARRIVE (still true in round 2)
//
//   state.report   main.js passes `agents.report && agents.report()`, but
//                  agents.js has no `report` export — it CALLS api.report() into
//                  game.js. So state.report is always undefined.
//   state.chasing  main.js passes `game.st.chasing`, and game.st has no such
//                  field, so it is always false.
//
// Neither is a problem here and nothing needs to change on my account. The wind
// state is on `cop.userData` — and specifically `cop.userData.fatigue`, which
// agents.js writes inside telemetry() and which is the signal the breathing and
// the duck are both built on. "Is a chase happening" is derived from the
// shoppers' own `bolted` flags, which is what drives the music's intensity.
// Both are read defensively (`state.report` first, userData second), so if the
// lead wires the promised fields up later this file will simply prefer them.
// Flagging it because anyone else reading main.js will assume they work.
//
// ---------------------------------------------------------------------------
// TESTING IT WITHOUT THE GAME
//
//   http://127.0.0.1:8171/src/audio/bench.html
//
// The graph on its own, with a fake cop and no store, no CCTV and no agents.
// It drives the same update(dt, state) main.js does. Twice this round a syntax
// error in a file I do not own stopped me measuring a file I do; it also puts
// the listener at the dairy in one assignment instead of twenty seconds of sim.

import { createRoom } from './audio/room.js';
import { createBed } from './audio/bed.js';
import { createPA } from './audio/pa.js';
import { createFoley } from './audio/foley.js';
import { createDesk } from './audio/desk.js';
import { whiteBuffer, pinkBuffer, gain, filt, mulberry, to, clamp, lerp } from './audio/dsp.js';
import { SERVICE_DESK, TUNING } from './config.js';

export function createAudio(THREE, camera) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---- output -------------------------------------------------------------
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // A safety limiter, not a sound. A store's crest factor is high — a scanner
  // beep two metres away is 25 dB over the bed — and without this a burst of
  // beeps under a chase clips the bus. Sits before master so the recorder
  // captures exactly what the player hears.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3.5; limiter.knee.value = 5; limiter.ratio.value = 9;
  limiter.attack.value = 0.004; limiter.release.value = 0.22;
  limiter.connect(master);

  const outSum = gain(ctx, 1);
  outSum.connect(limiter);

  // ---- buses --------------------------------------------------------------
  // The contract's four names. Each one is really a PAIR — a dry node and a
  // send into the room — because there is no such thing in this building as a
  // sound without the room on it, and setMix has to move both together or it
  // changes the reverb balance instead of the level.
  //
  // CAL is the measured balance, in one place. setMix multiplies it, so a caller
  // asking for 1.0 gets the calibrated mix and not a wall. Round 1 shipped
  // everything at unity: the store measured -7 dBFS RMS with peaks pinned at
  // full scale for two per cent of every clip, i.e. the limiter was the loudest
  // thing in the building. A supermarket bed belongs about 30 dB down, with the
  // things that happen in it poking out of that.
  //
  // ROUND 2 MOVED `pa`. The client listened to round 1 and said "there needs to
  // be music". There WAS music; it measured -38.8 dBFS RMS against an ambience
  // bed at -34.1, i.e. five decibels UNDER the air conditioning, with no bass
  // and no top. Now the tape sits about four and a half decibels over the bed
  // broadband and fifteen over it in the 500-2000 Hz band where the tune lives,
  // which is roughly where a real store runs it: plainly the most identifiable
  // single sound in the building, and still not loud enough to enjoy properly.
  // The error to make this round is loud, not polite.
  const CAL = { ambience: 0.42, pa: 0.23, foley: 0.30, ui: 0.34 };
  const mix = { ambience: 1, pa: 1, foley: 1, ui: 1 };
  const buses = {};
  const wetB = {};
  const storeDry = gain(ctx, 1);
  for (const name of ['ambience', 'pa', 'foley', 'ui']) {
    buses[name] = gain(ctx, CAL[name]);
    wetB[name] = gain(ctx, CAL[name]);
  }

  const room = createRoom(ctx);

  buses.ambience.connect(storeDry);
  buses.pa.connect(storeDry);
  buses.foley.connect(storeDry);
  wetB.ambience.connect(room.input);
  wetB.pa.connect(room.input);
  wetB.foley.connect(room.input);

  storeDry.connect(room.storeIn);
  room.out.connect(room.storeIn);

  // The gassed duck. When he cannot breathe, the store recedes and goes dull —
  // that is a real perceptual effect and it is also the only way to make the
  // breathing hurt without simply making it louder than everything else.
  const duckLP = filt(ctx, 'lowpass', 20000, 0.7);
  const duckG = gain(ctx, 1);
  room.storeOut.connect(duckLP); duckLP.connect(duckG); duckG.connect(outSum);

  room.deskOut.connect(outSum);
  buses.ui.connect(outSum);
  wetB.ui.connect(room.smallIn);

  // The cop's own body. NOT one of the four contract buses, because it is not
  // part of any mix a caller would want to turn down: his lungs are the wind
  // mechanic and the HUD already shouts about them. Straight to the sum, past
  // the wall, past the room, past setMix.
  const playerBus = gain(ctx, 0.62);
  playerBus.connect(outSum);

  // ---- shared buffers -----------------------------------------------------
  const noise = whiteBuffer(ctx, 3.7, 4021);
  const pinkD = pinkBuffer(ctx, 6.7, 8811);
  // A slow, unipolar noise used as an audio-rate amplitude modulator for cart
  // rattle. Read faster when the cart moves faster, so the rattle density is
  // physically tied to the wheels and costs no JavaScript.
  const rattle = (function () {
    const sr = 8000, n = sr * 5;
    const b = ctx.createBuffer(1, n, sr);
    const d = b.getChannelData(0);
    const r = mulberry(3311);
    let y = 0, y2 = 0;
    for (let i = 0; i < n; i++) {
      const x = r() * 2 - 1;
      y += 0.35 * (x - y); y2 += 0.55 * (y - y2);
      d[i] = clamp(Math.abs(y2) * 3.4, 0, 1.6);
    }
    const x = (sr * 0.4) | 0;
    for (let i = 0; i < x; i++) { const k = i / x; d[i] = d[i] * k + d[n - x + i] * (1 - k); }
    return b;
  })();

  // ---- subsystems ---------------------------------------------------------
  const bed = createBed(ctx, room, buses.ambience, wetB.ambience, rattle);
  const pa = createPA(ctx, room, buses.pa, wetB.pa, noise);
  const foley = createFoley(ctx, room, buses.foley, wetB.foley, playerBus, noise, rattle);
  const desk = createDesk(ctx, room, buses.ui, wetB.ui, noise, pinkD);

  const buildMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

  // ---- listener -----------------------------------------------------------
  // At the COP, not at the camera. The camera is 7.6 m behind him and 6.4 m up,
  // and putting the ears there would make every distance in the store wrong by
  // ten metres — standing at the dairy would sound like standing near the dairy.
  // The bar is "you are in a supermarket", so the ears go where the body is.
  const fwd = new THREE.Vector3(0, 0, 1);
  let lx = 0, lz = 0, ly = 1.62;

  // ---- state --------------------------------------------------------------
  let started = false;
  const perf = { ms: 0, peak: 0, ema: 0, n: 0, made: 0 };
  let zn = room.zone;
  let gassF = 0;
  let chaseF = 0;

  function update(dt, state) {
    if (ctx.state !== 'running') return;
    const p0 = performance.now();
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(0.1, dt);
    const t = ctx.currentTime;
    state = state || {};
    const cop = state.cop;
    const isDesk = state.mode === 'desk' || state.mode === 'demoted';

    // ---- where the ears are
    if (isDesk) { lx = SERVICE_DESK.x; lz = SERVICE_DESK.z + 1.1; ly = 1.35; }
    else if (cop && cop.position) { lx = cop.position.x; lz = cop.position.z; ly = 1.62; }
    if (camera && camera.getWorldDirection) {
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1); else fwd.normalize();
    }
    room.setListener(lx, ly, lz, fwd.x, fwd.z, t);

    // ---- the room
    zn = room.update(t, lx, lz, isDesk, dt);
    pa.setPresence(zn.front);

    // ---- the building
    bed.update(dt, t, zn, { x: lx, z: lz });

    // ---- bodies
    const sh = state.shoppers || [];
    if (cop) {
      perf.made = foley.update(dt, t, {
        mode: state.mode, cop, shoppers: sh, tuning: TUNING, report: state.report,
      }, zn, lx, lz) || perf.made;
    }
    desk.update(dt, t, isDesk);

    // ---- IS A CHASE HAPPENING -------------------------------------------
    // main.js passes `chasing: game.st.chasing` and game.st has no such field,
    // so it is always false. The honest signal is the shoppers' own `bolted`
    // flags — the same ones foley.js reads to fire the shove — plus how close
    // the man is, because a chase you are winning is not the same event as a
    // chase forty metres away.
    //
    // This is the ONLY number the game hands the music, and it moves slowly
    // in both directions (about 1.2 s up, 3.3 s down) so the tape never
    // appears to react to anything. See muzak.js for what it does with it.
    let hot = 0;
    if (!isDesk) {
      for (const s of sh) {
        if (!s.bolted || s.escaped || s.caught) continue;
        const d = Math.hypot(s.position.x - lx, s.position.z - lz);
        hot = Math.max(hot, clamp(1.30 - d / 34, 0.38, 1));
      }
      if (state.chasing) hot = Math.max(hot, 0.8);
    }
    chaseF += (hot - chaseF) * (1 - Math.exp(-(hot > chaseF ? 0.85 : 0.30) * dt));
    pa.setIntensity(chaseF);
    pa.update(dt, t, zn);

    // ---- the duck. Driven off FATIGUE, not off the tank: the bar bounces
    // every 2.2 s in a chase and the world receding has to move at the speed
    // of the man, not at the speed of the meter. `report` is agents.js's wind
    // block when the harness wires it; cop.userData.fatigue is the authority
    // either way and is always present.
    const u = (cop && cop.userData) || {};
    const r = state.report || {};
    const winded = u.gassed || r.wind === 'winded';
    const frac = r.windFrac != null ? r.windFrac
      : clamp((u.stamina == null ? TUNING.staminaMax : u.stamina) / TUNING.staminaMax, 0, 1);
    const fat = clamp(r.fatigue != null ? r.fatigue : (u.fatigue != null ? u.fatigue : 1 - frac), 0, 1);
    const gTarget = clamp(fat * 0.82 + (winded ? 0.30 : 0), 0, 1);
    gassF += (gTarget - gassF) * (1 - Math.exp(-(gTarget > gassF ? 5.5 : 0.75) * dt));
    to(duckLP.frequency, lerp(20000, 3000, gassF), t, 0.25);
    to(duckG.gain, lerp(1.0, 0.58, gassF), t, 0.25);

    const el = performance.now() - p0;
    perf.ms = el; perf.n++;
    perf.ema += (el - perf.ema) * 0.05;
    if (perf.n > 60 && el > perf.peak) perf.peak = el;
  }

  // ---- WAV capture --------------------------------------------------------
  // The harness's recordAudio() writes webm/Opus, which is lossy and mangles the
  // things worth measuring at the top end (the 15.7 kHz CRT line, the scanner's
  // second harmonic). This is the same tap — audio.master — written losslessly,
  // so a probe number is a number about the signal and not about the codec.
  //
  // AND IT WILL NOT RECORD A MICROPHONE. This is the only capture path in the
  // codebase and it closes the mic gate for the length of the take, so a live
  // voice physically cannot reach the file — the click, the hiss and the duck
  // still do, which is everything a critic needs to measure. The shipped build
  // has no /audio endpoint to POST to at all.
  const sink = gain(ctx, 0); sink.connect(ctx.destination);
  async function recordWav(seconds = 12, name = 'clip') {
    resume();
    pa.talk.muteCapture(true);
    try { return await capture(seconds, name); } finally { pa.talk.muteCapture(false); }
  }
  async function capture(seconds, name) {
    const sp = ctx.createScriptProcessor ? ctx.createScriptProcessor(4096, 2, 2) : null;
    if (!sp) throw new Error('no ScriptProcessor; use recordAudio()');
    const L = [], R = [];
    sp.onaudioprocess = (e) => {
      L.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      R.push(new Float32Array(e.inputBuffer.getChannelData(1)));
    };
    master.connect(sp); sp.connect(sink);
    await new Promise((r) => setTimeout(r, seconds * 1000));
    master.disconnect(sp); sp.disconnect(sink); sp.onaudioprocess = null;
    let n = 0; for (const c of L) n += c.length;
    const sr = ctx.sampleRate;
    const buf = new ArrayBuffer(44 + n * 4);
    const v = new DataView(buf);
    const s = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
    s(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); s(8, 'WAVE'); s(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 4, true);
    v.setUint16(32, 4, true); v.setUint16(34, 16, true);
    s(36, 'data'); v.setUint32(40, n * 4, true);
    let o = 44;
    for (let c = 0; c < L.length; c++) {
      const a = L[c], b = R[c];
      for (let i = 0; i < a.length; i++) {
        v.setInt16(o, Math.max(-1, Math.min(1, a[i])) * 32767, true); o += 2;
        v.setInt16(o, Math.max(-1, Math.min(1, b[i])) * 32767, true); o += 2;
      }
    }
    const res = await fetch('/audio?name=' + encodeURIComponent(name) + '&fmt=wav',
      { method: 'POST', body: new Blob([buf], { type: 'audio/wav' }) });
    return res.text();
  }

  function resume() {
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
  }

  function stats() {
    const n = bed.nodes.length + pa.nodes.length + pa.muzak.nodes.length
      + foley.nodes.length + desk.nodes.length + pa.talk.nodes.length;
    return {
      talk: {
        state: pa.talk.state, level: +pa.talk.level.toFixed(3),
        // <1 means the howl watchdog has pulled the handset down
        guard: +pa.talk.guard.toFixed(2),
        // is the capture device claimed right now
        holding: pa.talk.holding,
      },
      buildMs: +buildMs.toFixed(1),
      updateMs: +perf.ema.toFixed(3),
      peakMs: +perf.peak.toFixed(3),
      persistentNodes: n + 24,
      convolvers: room.convs.filter((c) => c.live).length,
      irSeconds: room.convs.map((c) => +c.conv.buffer.duration.toFixed(2)),
      oneShotNodesPerSec: perf.made,
      musicNodesPerSec: pa.muzak.stats().nodesPerSec,
      nowPlaying: pa.muzak.now,
      chase: +chaseF.toFixed(2),
      sampleRate: ctx.sampleRate,
      zone: {
        open: +zn.open.toFixed(2), aisle: zn.aisle + 1,
        chill: +zn.chill.toFixed(2), front: +zn.front.toFixed(2),
      },
      gassed: +gassF.toFixed(2),
    };
  }

  return {
    ctx, master, buses,
    resume, update,
    setMix(name, g) {
      if (!buses[name]) return;
      mix[name] = g;
      buses[name].gain.value = CAL[name] * g;
      wetB[name].gain.value = CAL[name] * g;
    },
    getMix(name) { return mix[name]; },

    // ---- PUSH TO TALK -------------------------------------------------------
    // The whole feature lives in src/audio/talk.js and src/audio/pa.js; these
    // four lines are the contract game.js binds a key to.
    //
    // THE DATA PATH, END TO END: getUserMedia -> MediaStreamAudioSourceNode ->
    // a highpass and a compressor -> the PA's speech bus -> the ceiling can ->
    // four panners and the room convolver -> outSum -> the limiter -> master ->
    // ctx.destination. It is a Web Audio graph on the player's machine and
    // there is no branch off it. Nothing is buffered, nothing is written, and
    // this game makes no network requests at runtime — which is still true with
    // the microphone open, and is the reason there is no speech recognition in
    // here either.
    talkStart() { resume(); return pa.talk.start(); },
    talkStop() { pa.talk.stop(); },
    talkState() { return pa.talk.state; },
    talkLevel() { return pa.talk.level; },
    // Hands the capture device back immediately instead of after the idle
    // timeout. game.js can call it on pause or on game over; it is not required.
    talkRelease() { pa.talk.release(); },

    // ---- agent-facing, same spirit as main.js's snap()/run()
    recordWav, stats, room, bed, pa, foley, desk,
    // Opens the PA channel with NO microphone — click, hiss, duck, gate, can,
    // room. Connect a signal to audio.pa.talk.micIn and record master to prove
    // the chain without speaking into it. Debug only; game.js never calls this.
    talkTest(on) { return on === false ? (pa.talk.stop(), false) : pa.talk.testOpen(); },
    get zone() { return zn; },
    get started() { return started; },
  };
}
