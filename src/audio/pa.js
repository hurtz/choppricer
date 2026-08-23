// OWNER: builder-audio. THE PA.
//
// The ceiling. Four 8-inch coaxial cans on a 70-volt line, forty metres of hard
// room between them and you, an amplifier in a rack behind the customer service
// counter, and a level somebody set in 1997.
//
// Two things come out of it: the tape (src/audio/muzak.js — the tunes, the band,
// the arrangement) and the announcements. This file is not the music. This file
// is what the building does TO the music, which is most of why a supermarket
// sounds like a supermarket and not like a radio.
//
// ---------------------------------------------------------------------------
// WHAT ROUND 1 GOT WRONG, MEASURED
//
// solo_pa.wav, round 1: RMS -38.8 dBFS, and 70.4% of its total energy inside
// ONE octave centred on 2 kHz. 0.0% below 180 Hz. 0.0% above 5.6 kHz.
//
// That is not a ceiling speaker, that is a telephone. The chain was highpassed
// at 210/240 Hz and lowpassed at 4.3/5.4 kHz, which sounds like a defensible
// model of a 4-inch cone until you notice it deletes the bass line — and a
// piece of music with no bass line is not perceived as music, it is perceived
// as leakage from somewhere. The client's "there needs to be music" is that
// measurement.
//
// So the can got bigger, which is also more accurate: American grocery ceiling
// speakers are 8-inch coax (Atlas, Bogen, Soundolier) with a rated response
// down to about 100 Hz and up past 12 k. They are not hi-fi because of the
// baffle, the 70 V transformer's insertion loss at the bottom, and the paper,
// and all three of those are modelled here as EQ rather than as a brick wall.
//
//   HP 125 / 150 Hz     the transformer and the can, 24 dB/oct
//   +2.5 dB @ 1.6 kHz   the cone's shout
//   -5 dB @ 640 Hz      and the hole under it
//   +3 dB @ 3.6 kHz     paper breakup
//   LP 8.2 / 11 kHz     the whizzer giving up
//
// Net: the bass fundamental at 90 Hz is down about 12 dB and its second and
// third harmonics are not, so the ear reconstructs the missing fundamental and
// you hear a bass line. Which is exactly what happens in a real store.
//
// ---------------------------------------------------------------------------
// AND THE ROOM DOES THE REST
//
// Four cans at four distances, each with its own delay and its own top-end
// rolloff, so you are never underneath one — you always hear two of them a few
// milliseconds apart, which is a comb filter that moves as you walk. That is
// the single most identifiable thing about ceiling-distributed sound and it is
// free.
//
// Most of what you actually hear is `paWet`: the room's opinion of the music,
// which at forty metres is louder than the music.

import { gain, filt, shaper, panner, mulberry, clamp, to } from './dsp.js';
import { createVoiceBank } from './voice.js';
import { createMuzak } from './muzak.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Ceiling speaker positions. Four cans, spread out, and the point of them is
// that you are NEVER underneath one.
const SPK = [[-16, -10, 0.000], [-5, 4, 0.012], [7, -6, 0.022], [17, 9, 0.031]];

export function createPA(ctx, room, out, wetOut, noiseBuf) {
  const rnd = mulberry(9091);
  const nodes = [];
  const N = (n) => { nodes.push(n); return n; };

  // ---- the speaker --------------------------------------------------------
  const paIn = N(gain(ctx, 1));
  const drive = N(shaper(ctx, 1.55));          // paper, at the level it is run at
  const hp1 = N(filt(ctx, 'highpass', 125, 0.72));
  const hp2 = N(filt(ctx, 'highpass', 150, 0.62));
  const suck = N(filt(ctx, 'peaking', 640, 1.5, -5));       // the baffle hole
  const honk = N(filt(ctx, 'peaking', 1600, 1.2, 2.5));     // the cone's shout
  const brk = N(filt(ctx, 'peaking', 3600, 2.0, 3));        // paper breakup
  const lp1 = N(filt(ctx, 'lowpass', 8200, 0.75));
  const lp2 = N(filt(ctx, 'lowpass', 11000, 0.6));
  const paLvl = N(gain(ctx, 0.42));
  paIn.connect(drive); drive.connect(hp1); hp1.connect(hp2); hp2.connect(suck);
  suck.connect(honk); honk.connect(brk); brk.connect(lp1); lp1.connect(lp2); lp2.connect(paLvl);

  // direct sound, from four cans at four distances
  for (const [x, z, dly] of SPK) {
    const d = N(ctx.createDelay(0.1)); d.delayTime.value = dly;
    const c = N(filt(ctx, 'lowpass', 6000 + rnd() * 3500, 0.7));
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
  const muzak = createMuzak(ctx, music, noiseBuf, 4711);

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

  // ---- announcements ------------------------------------------------------
  let annAt = 26 + rnd() * 44;
  let annUntil = -1;

  function announce(t, kind) {
    // key-up: a real PA clicks and hisses before it speaks, and the click is
    // the part everyone in the building has learned to turn their head for
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
      when: t0, dur, dest: speech, level: 0.46,
      f0: rnd() < 0.55 ? 104 + rnd() * 22 : 178 + rnd() * 32,
      tense: rnd() < 0.55 ? 1.0 : 1.14,
      rate: 3.5 + rnd() * 1.2,
    });
    // duck the music under it, the way a real PA does because it is one amp.
    // Not all the way: the amp has a priority input with a fixed depth on it,
    // so the band keeps going quietly behind the announcement.
    const end = t0 + dur + 0.35;
    music.gain.setTargetAtTime(0.30, t, 0.22);
    music.gain.setTargetAtTime(1.0, end, 0.7);
    return end;
  }

  // ---- per-frame ----------------------------------------------------------
  // Lookahead scheduling lives in muzak.js; this only decides when somebody
  // picks up the handset, and how much of the ceiling arrives via the room.
  let paOn = true, pres = 0, iv = 0;
  function update(dt, t, zn) {
    if (!paOn) return;
    muzak.update(dt, t);

    // The front end is where the amp is and where the ceiling is lowest, so
    // the direct-to-room balance changes even though the level does not. The
    // chase takes another fifth off the send: hearing the music rather than
    // the room's copy of it is the whole mix move, and it is a mix move and
    // not a cue.
    to(paWet.gain, (0.85 + 0.5 * pres) * (1 - 0.22 * iv), t, 0.7);
    to(paLvl.gain, 0.42 * (1 + 0.14 * iv), t, 0.9);

    annAt -= dt;
    if (annAt <= 0 && t > annUntil) {
      const short = rnd() < 0.45;
      annUntil = announce(t + 0.2, short ? 'short' : 'full');
      annAt = short ? 42 + rnd() * 55 : 75 + rnd() * 95;
    }
  }

  return {
    update, nodes, paLvl, music, speech, muzak,
    // debug handle: an announcement is a once-a-minute event, so a twelve second
    // clip will not contain one unless you ask for one.
    say(kind) { return announce(ctx.currentTime + 0.05, kind || 'full'); },
    setPresence(v) { pres = v; },
    // THE CHASE. Not a cue — the mix tightening. muzak.js leans on the drummer
    // and pulls the melody back; here the ceiling's reverb send comes down and
    // the amp comes up a hair. Everything moves over about a second, and it
    // only ever moves a little, because the tape does not know about the game
    // and must never appear to.
    setIntensity(v) { iv = clamp(v || 0, 0, 1); muzak.setIntensity(iv); },
    get intensity() { return iv; },
    set on(v) { paOn = v; muzak.on = v; },
  };
}
