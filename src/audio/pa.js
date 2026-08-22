// OWNER: builder-audio. THE PA.
//
// The only music allowed in this game, and it is not a soundtrack — it is a
// 4-inch paper cone in a steel can in the ceiling, forty metres of hard room
// between it and you, playing a licensing-library instrumental at a level
// somebody set in 1997 and never touched again.
//
// Procedural muzak is a real synthesis problem and the trap is trying to write
// good music. Good music is the wrong answer: the player would start listening
// to it. What sells it is that it is BLAND and SLIGHTLY WRONG — a lead line that
// holds a note one beat too long, a chord voicing that sits on a ninth for no
// reason, a tempo nobody chose. So the harmony here is the most obvious
// progression in music, the melody is a random walk that occasionally fumbles,
// and the whole thing is destroyed by the speaker before it reaches the room.
//
// It never repeats: the key steps up every eight to sixteen bars, the melody is
// generated a phrase at a time, and the tempo drifts.

import { gain, filt, shaper, panner, mulberry, clamp } from './dsp.js';
import { createVoiceBank } from './voice.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// The four progressions muzak is actually made of, as semitone offsets from the
// key and a chord quality.
const MAJ7 = [0, 4, 7, 11], MIN7 = [0, 3, 7, 10], DOM7 = [0, 4, 7, 10], MAJ6 = [0, 4, 7, 9];
const PROGS = [
  [[0, MAJ7], [9, MIN7], [2, MIN7], [7, DOM7]],
  [[0, MAJ7], [5, MAJ7], [4, MIN7], [9, MIN7], [2, MIN7], [7, DOM7]],
  [[2, MIN7], [7, DOM7], [0, MAJ6], [0, MAJ6]],
  [[0, MAJ7], [5, MAJ7], [0, MAJ7], [7, DOM7]],
  [[0, MAJ7], [2, MIN7], [4, MIN7], [5, MAJ7]],
];
const SCALE = [0, 2, 4, 5, 7, 9, 11];

// Ceiling speaker positions. Four cans on a 70-volt line, spread out, and the
// point of them is that you are NEVER underneath one — you always hear two at
// slightly different distances, which is a comb filter that changes as you walk.
const SPK = [[-16, -10, 0.000], [-5, 4, 0.012], [7, -6, 0.022], [17, 9, 0.031]];

export function createPA(ctx, room, out, wetOut, noiseBuf) {
  const rnd = mulberry(9091);
  const nodes = [];
  const N = (n) => { nodes.push(n); return n; };

  // ---- the speaker --------------------------------------------------------
  const paIn = N(gain(ctx, 1));
  const drive = N(shaper(ctx, 1.9));
  const hp1 = N(filt(ctx, 'highpass', 210, 0.7));
  const hp2 = N(filt(ctx, 'highpass', 240, 0.6));
  const honk = N(filt(ctx, 'peaking', 1750, 1.5, 4));      // the cone's own shout
  const suck = N(filt(ctx, 'peaking', 820, 1.8, -6));       // and its hole
  const lp1 = N(filt(ctx, 'lowpass', 4300, 0.8));
  const lp2 = N(filt(ctx, 'lowpass', 5400, 0.6));
  const paLvl = N(gain(ctx, 0.175));
  paIn.connect(drive); drive.connect(hp1); hp1.connect(hp2); hp2.connect(honk);
  honk.connect(suck); suck.connect(lp1); lp1.connect(lp2); lp2.connect(paLvl);

  // direct sound, from four cans at four distances
  for (const [x, z, dly] of SPK) {
    const d = N(ctx.createDelay(0.1)); d.delayTime.value = dly;
    const c = N(filt(ctx, 'lowpass', 3400 + rnd() * 1600, 0.7));
    const p = N(panner(ctx, x, 4.85, z, 8, 0.55));
    const g = N(gain(ctx, 0.42));
    paLvl.connect(d); d.connect(c); c.connect(p); p.connect(g); g.connect(out);
  }
  // and the room's opinion of it, which is most of what you hear
  const paWet = N(gain(ctx, 1.05));
  paLvl.connect(paWet); paWet.connect(wetOut);

  // sub-buses so an announcement can duck the music
  const music = N(gain(ctx, 1)); music.connect(paIn);
  const speech = N(gain(ctx, 1)); speech.connect(paIn);

  const voices = createVoiceBank(ctx, noiseBuf, 777);

  // ---- instruments --------------------------------------------------------
  // Every note is built, played and thrown away. That is what Web Audio is for,
  // and it keeps the resting node count at the ~30 above.
  const compBus = N(gain(ctx, 0.16)); compBus.connect(music);
  const bassBus = N(gain(ctx, 0.30)); bassBus.connect(music);
  const leadBus = N(gain(ctx, 0.20)); leadBus.connect(music);
  const percBus = N(gain(ctx, 0.10)); percBus.connect(music);

  // one shared vibrato for the lead — a per-note LFO would be three more nodes
  // per note for no audible gain
  const vib = N(ctx.createOscillator()); vib.frequency.value = 5.2; vib.type = 'sine';
  const vibAmt = N(gain(ctx, 11)); vib.connect(vibAmt); vib.start();
  // and one wow: the whole PA drifts a few cents, like everything that has been
  // playing continuously since 1997
  const wow = N(ctx.createOscillator()); wow.frequency.value = 0.077; wow.type = 'sine';
  const wowAmt = N(gain(ctx, 5)); wow.connect(wowAmt); wow.start();

  function rhodes(f, t, dur, vel) {
    const g = gain(ctx, 0);
    const o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2.002;
    const o3 = ctx.createOscillator(); o3.type = 'sine'; o3.frequency.value = f * 4.01;
    const g2 = gain(ctx, 0.20), g3 = gain(ctx, 0.10);
    wowAmt.connect(o1.detune); wowAmt.connect(o2.detune);
    o1.connect(g); o2.connect(g2); g2.connect(g); o3.connect(g3); g3.connect(g);
    g.connect(compBus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.008);
    g.gain.exponentialRampToValueAtTime(vel * 0.30, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    // the tine's bark dies before the body does
    g3.gain.setValueAtTime(0.10, t); g3.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    for (const o of [o1, o2, o3]) { o.start(t); o.stop(t + dur + 0.05); }
    o1.onended = () => { try { g.disconnect(); } catch (e) {} };
  }

  function bass(f, t, dur, vel) {
    const g = gain(ctx, 0);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = f;
    const g2 = gain(ctx, 0.16);
    const lp = filt(ctx, 'lowpass', 340, 1.0);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(bassBus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o2.start(t); o.stop(t + dur + 0.03); o2.stop(t + dur + 0.03);
    o.onended = () => { try { lp.disconnect(); } catch (e) {} };
  }

  function lead(f, t, dur, vel) {
    const g = gain(ctx, 0);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const bp = filt(ctx, 'bandpass', clamp(f * 2.4, 500, 2600), 1.1);
    const pk = filt(ctx, 'peaking', 1300, 1.5, 4);
    vibAmt.connect(o.detune); wowAmt.connect(o.detune);
    o.connect(bp); bp.connect(pk); pk.connect(g); g.connect(leadBus);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.065);      // a breath, not a pluck
    g.gain.setTargetAtTime(vel * 0.82, t + 0.065, 0.25);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.88, 0.055);
    o.start(t); o.stop(t + dur + 0.25);
    o.onended = () => { try { g.disconnect(); } catch (e) {} };
  }

  const hatHP = N(filt(ctx, 'highpass', 6200, 0.7));
  const hatLvl = N(gain(ctx, 0.5)); hatHP.connect(hatLvl); hatLvl.connect(percBus);
  function hat(t, vel) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const g = gain(ctx, 0);
    s.connect(g); g.connect(hatHP);
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    s.start(t, rnd() * 2, 0.06); s.onended = () => { try { g.disconnect(); } catch (e) {} };
  }
  function kick(t, vel) {
    const o = ctx.createOscillator(); o.type = 'sine';
    const g = gain(ctx, 0);
    o.connect(g); g.connect(percBus);
    o.frequency.setValueAtTime(88, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.09);
    g.gain.setValueAtTime(vel, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.start(t); o.stop(t + 0.2);
    o.onended = () => { try { g.disconnect(); } catch (e) {} };
  }

  // ---- the chime ----------------------------------------------------------
  // Two struck bars, inharmonic, in the room. A real building sound, not a
  // stinger: it is the thing that happens before somebody talks.
  function bell(f, t, vel) {
    const g = gain(ctx, 0);
    g.connect(speech);
    for (const [r, a, d] of [[1, 1, 1.5], [2.76, 0.32, 0.9], [5.40, 0.14, 0.5], [8.93, 0.06, 0.28]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * r;
      const gg = gain(ctx, 0);
      o.connect(gg); gg.connect(g);
      gg.gain.setValueAtTime(0, t);
      gg.gain.linearRampToValueAtTime(a * vel, t + 0.004);
      gg.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.start(t); o.stop(t + d + 0.05);
    }
    g.gain.setValueAtTime(1, t);
    setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 2600);
  }

  // ---- sequencer state ----------------------------------------------------
  let key = 65;                    // F, because muzak lives in flat keys
  let bpm = 84 + rnd() * 10;
  let prog = PROGS[(rnd() * PROGS.length) | 0];
  let bar = 0, barsSinceKey = 0, keyEvery = 8 + ((rnd() * 9) | 0);
  let nextBarAt = 0;
  let melNote = key + 12, restBars = 0;
  let paOn = true;

  // announcements
  let annAt = 30 + rnd() * 50;
  let annUntil = -1;

  function scheduleBar(t) {
    const spb = 60 / bpm, barLen = spb * 4;
    const [deg, qual] = prog[bar % prog.length];
    const root = key + deg;

    // --- comp. Rootless-ish, up in the middle where a 4-inch cone can pass it.
    const voicing = [];
    for (let i = 1; i < qual.length; i++) voicing.push(root + qual[i] + 12);
    if (rnd() < 0.4) voicing.push(root + qual[1] + 24);
    for (const hit of (rnd() < 0.35 ? [0, 1.5, 2.5] : [0, 2])) {
      const tt = t + hit * spb;
      const vel = 0.75 + rnd() * 0.3;
      for (const m of voicing) rhodes(mtof(m), tt, barLen * 0.85, vel * (0.7 + rnd() * 0.4));
    }
    // --- bass. Root, then the fifth or a walk to the next root.
    bass(mtof(root - 12), t, spb * 1.5, 0.9);
    const nxt = prog[(bar + 1) % prog.length][0] + key;
    const walk = rnd() < 0.45 ? nxt - 1 : root + 7;
    bass(mtof(walk - 12), t + spb * 2, spb * 1.4, 0.72);

    // --- percussion, barely there. Through the speaker it is a tick and a bump,
    // which is exactly how you hear a drum machine two aisles away.
    for (let e = 0; e < 8; e++) {
      if (e % 2 === 1 && rnd() < 0.35) continue;
      hat(t + e * spb * 0.5 + (e % 2 ? 0.02 : 0), (e % 2 ? 0.10 : 0.19) * (0.7 + rnd() * 0.6));
    }
    kick(t, 0.5); if (rnd() < 0.7) kick(t + spb * 2, 0.42);

    // --- melody. A random walk on the chord and the scale, in phrases, with the
    // occasional wrong note held far too long. That is the whole joke and it is
    // played straight.
    if (restBars > 0) { restBars--; } else {
      let tt = t + (rnd() < 0.3 ? spb * 0.5 : 0);
      const tones = qual.map((q) => root + q);
      while (tt < t + barLen - spb * 0.4) {
        const len = spb * [0.5, 1, 1, 1.5, 2][(rnd() * 5) | 0];
        // step, mostly; leap to a chord tone sometimes
        if (rnd() < 0.30) {
          melNote = tones[(rnd() * tones.length) | 0] + (rnd() < 0.5 ? 12 : 24);
        } else {
          const dir = rnd() < 0.5 ? -1 : 1;
          let m = melNote + dir * (rnd() < 0.7 ? 1 : 2);
          // quantise to the key... usually
          const pc = ((m - key) % 12 + 12) % 12;
          if (!SCALE.includes(pc) && rnd() < 0.82) m += dir;
          melNote = m;
        }
        melNote = clamp(melNote, key + 7, key + 31);
        const hold = rnd() < 0.09 ? len * 2.4 : len;      // the note held too long
        lead(mtof(melNote), tt, hold * 0.92, 0.72 + rnd() * 0.35);
        tt += hold;
      }
      if (rnd() < 0.34) restBars = 1 + ((rnd() * 2) | 0);
    }

    bar++; barsSinceKey++;
    if (barsSinceKey >= keyEvery) {
      barsSinceKey = 0; keyEvery = 8 + ((rnd() * 9) | 0);
      key += rnd() < 0.6 ? 2 : (rnd() < 0.5 ? -3 : 5);     // the muzak modulation
      while (key > 72) key -= 12; while (key < 58) key += 12;
      if (rnd() < 0.5) prog = PROGS[(rnd() * PROGS.length) | 0];
      bpm = clamp(bpm + (rnd() * 6 - 3), 76, 98);
      bar = 0;
    }
    return barLen;
  }

  // ---- announcements ------------------------------------------------------
  function announce(t, kind) {
    // key-up: a real PA clicks and hisses before it speaks
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const g = gain(ctx, 0); const bp = filt(ctx, 'bandpass', 1900, 0.9);
    s.connect(bp); bp.connect(g); g.connect(speech);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.02, t + 0.06);
    g.gain.setValueAtTime(0.02, t + 0.06);
    s.start(t, rnd() * 2, 0.9); s.onended = () => { try { g.disconnect(); } catch (e) {} };

    let t0 = t + 0.12;
    if (kind !== 'short') {
      bell(mtof(79), t0, 0.55); bell(mtof(72), t0 + 0.62, 0.5);
      t0 += 1.5;
    }
    const dur = kind === 'short' ? 2.2 + rnd() * 1.6 : 4.0 + rnd() * 3.2;
    voices.say({
      when: t0, dur, dest: speech, level: 0.42,
      f0: rnd() < 0.55 ? 104 + rnd() * 22 : 178 + rnd() * 32,
      tense: rnd() < 0.55 ? 1.0 : 1.14,
      rate: 3.5 + rnd() * 1.2,
    });
    // duck the music under it, the way a real PA does because it is one amp
    const end = t0 + dur + 0.35;
    music.gain.setTargetAtTime(0.34, t, 0.25);
    music.gain.setTargetAtTime(1.0, end, 0.7);
    return end;
  }

  // ---- per-frame ----------------------------------------------------------
  // Lookahead scheduling against ctx.currentTime, NOT against dt: main.js's
  // run() can advance four simulated seconds in thirty milliseconds and a
  // sequencer driven off dt would try to play all of it at once.
  function update(dt, t, zn) {
    if (!paOn) return;
    if (nextBarAt < t) nextBarAt = t + 0.15;
    let guard = 0;
    while (nextBarAt < t + 0.9 && guard++ < 4) nextBarAt += scheduleBar(nextBarAt);

    annAt -= dt;
    if (annAt <= 0 && t > annUntil) {
      const short = rnd() < 0.45;
      annUntil = announce(t + 0.2, short ? 'short' : 'full');
      annAt = short ? 42 + rnd() * 55 : 75 + rnd() * 95;
    }
  }

  return {
    update, nodes, paLvl, music, speech,
    // debug handle: an announcement is a once-a-minute event, so a twelve second
    // clip will not contain one unless you ask for one.
    say(kind) { return announce(ctx.currentTime + 0.05, kind || 'full'); },
    // the front end is where the PA amp lives and where the ceiling is lowest;
    // the level does not change but the balance of direct to room does
    setPresence(v) { paWet.gain.value = 0.85 + 0.5 * v; },
    set on(v) { paOn = v; },
  };
}
