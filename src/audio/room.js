// OWNER: builder-audio. THE ROOM.
//
// This is the highest-value object in the audio build. Everything else is a
// source; this is the building the sources are inside, and it is what the
// playtester was describing when he said "the vibe of being there".
//
// Three procedural impulse responses, crossfaded by where the cop is standing:
//
//   AISLE      a 4 m corridor between two 2.05 m walls of cardboard. Short, dense
//              early reflections, a hard flutter slap at 11.7 ms (4 m one way),
//              poor low-frequency support because a corridor is only big in one
//              dimension. RT60 1.45 s. Tight, boxy, close.
//   OPEN       the front end: 47 x 38 m of concrete under a 5.2 m metal deck,
//              glass across the whole front. RT60 2.35 s, decorrelated, boomy,
//              and it holds its top end because there is nothing soft in there.
//   DESK       the service-desk monitor room. RT60 0.33 s, dark, small, with the
//              store arriving through a wall rather than through the air.
//
// Walking out of aisle 4 into the front end is most of what the player is paying
// for, so the crossfade is smoothstepped over ~2.5 m of travel and the wet tilt
// moves with it: the aisle's tail is mid-focused and the front end's is heavy.

import { makeIR, gain, filt, monoise, to, clamp, smooth, lerp } from './dsp.js';
import { AISLE_COUNT, AISLE_GAP, SHELF_W, AISLE_LEN, STORE, FRONT_WALK_Z, BACK_WALK_Z, aisleX } from '../config.js';

const PITCH = AISLE_GAP + SHELF_W;
const HALF = AISLE_LEN / 2;
const BODY = HALF - 0.62;          // gondolas stop here; past it you are in a cross-aisle
const CROSS_Z = -0.70, CROSS_HALF = 1.8;   // mid-store cross-aisle, half its clear width

export function createRoom(ctx) {
  // ---- the three rooms ----------------------------------------------------
  const irAisle = makeIR(ctx, {
    seed: 21, predelay: 0.004,
    rtLo: 0.95, rtMid: 1.45, rtHi: 1.18, fLo: 210, fHi: 2600,
    gLo: 0.50, gHi: 1.12, width: 0.52, trim: 0.80, build: 0.055, build0: 0.10,
    // floor bounce, then both shelf faces, then the ceiling, then the far mouth
    taps: [[0.006, 0.78, 0], [0.0117, 1.05, -0.9], [0.0128, 0.99, 0.9],
           [0.021, 0.62, 0.2], [0.0235, 0.72, -0.7], [0.0247, 0.68, 0.7],
           [0.034, 0.40, 0.4], [0.047, 0.30, -0.5], [0.062, 0.21, 0.3]],
    flutter: { t: 0.0234, g: 0.72, n: 18, decay: 0.74 },
    modes: [[66, 0.010, 0.55], [99, 0.007, 0.42]],
  });
  const irOpen = makeIR(ctx, {
    seed: 44, predelay: 0.017,
    rtLo: 2.60, rtMid: 2.35, rtHi: 1.78, fLo: 200, fHi: 2500,
    gLo: 0.85, gHi: 1.02, width: 0.97, trim: 0.92, build: 0.105, build0: 0.16,
    // in the middle of a front end the nearest surface is the floor and then the
    // ceiling; everything else arrives late and smeared, which is the sound
    taps: [[0.009, 0.62, 0], [0.026, 0.52, -0.8], [0.031, 0.48, 0.85],
           [0.045, 0.37, 0.3], [0.058, 0.31, -0.4], [0.079, 0.24, 0.6],
           [0.104, 0.18, -0.6], [0.131, 0.14, 0.2]],
    modes: [[33, 0.009, 1.2], [66, 0.010, 1.1], [46, 0.008, 1.2]],
  });
  const irDesk = makeIR(ctx, {
    seed: 90, predelay: 0.0015,
    rtLo: 0.42, rtMid: 0.33, rtHi: 0.17, fLo: 240, fHi: 2200,
    gLo: 1.15, gHi: 0.5, width: 0.68, trim: 0.55, build: 0.010, build0: 0.34,
    taps: [[0.0028, 0.72, -0.5], [0.0041, 0.66, 0.6], [0.0063, 0.55, 0.2],
           [0.0088, 0.45, -0.3], [0.0121, 0.34, 0.4], [0.0168, 0.24, 0]],
    modes: [[43, 0.020, 0.30], [57, 0.018, 0.26], [66, 0.014, 0.22]],
    // trim is lower than the store's on purpose: a closet returns less energy
    // to you than a 4000 m2 box does, and that difference IS the desk.
  });

  // ---- graph --------------------------------------------------------------
  // TWO separate rooms, deliberately not sharing an input. `input` is the store;
  // `smallIn` is the closet you are sitting in. The store's reverb has to happen
  // BEFORE the wall filters it, or the desk sounds like a small room that has a
  // supermarket inside it instead of next to it.
  const input = gain(ctx, 1);            // store sources send here
  const smallIn = gain(ctx, 1);          // desk-local sources send here
  const out = gain(ctx, 1);              // store wet; goes on to the wall
  const deskOut = gain(ctx, 1);          // small-room wet; goes straight to the mix

  function branch(src, ir, g0) {
    const send = gain(ctx, g0);
    const conv = ctx.createConvolver();
    conv.normalize = false; conv.buffer = ir;
    const lvl = gain(ctx, 1);
    src.connect(send); send.connect(conv); conv.connect(lvl);
    return { send, conv, lvl, live: true, dead: 0, src };
  }
  const A = branch(input, irAisle, 0.0);
  const O = branch(input, irOpen, 1.0);
  const D = branch(smallIn, irDesk, 1.0);

  // Wet tilt. The aisle's tail is mid-forward and a little thin; the open room's
  // is heavy underneath and slightly darker on top. One shelf each, moved by the
  // same parameter that moves the crossfade, so the room changes character and
  // not just length.
  const wLow = filt(ctx, 'lowshelf', 190, 0.7, 0);
  const wHigh = filt(ctx, 'highshelf', 3800, 0.7, 0);
  const wMid = filt(ctx, 'peaking', 900, 0.9, 0);
  A.lvl.connect(wLow); O.lvl.connect(wLow);
  wLow.connect(wMid); wMid.connect(wHigh); wHigh.connect(out);
  // the closet gets its own tilt: dark, and nothing under 90 Hz because a room
  // that size cannot hold it
  const dHP = filt(ctx, 'highpass', 88, 0.7);
  const dHS = filt(ctx, 'highshelf', 3000, 0.7, -5);
  D.lvl.connect(dHP); dHP.connect(dHS); dHS.connect(deskOut);

  // ---- store-heard-through-a-wall ----------------------------------------
  // Desk mode. Everything that happens on the floor routes through `storeIn`;
  // in desk mode it goes the long way round instead: 12 dB/oct from about
  // 1.2 kHz, a scoop where the partition's cavity eats it, summed to mono, and
  // then fed BACK into the small room, because a sound that got through a wall
  // is now in the little room with you.
  //
  // ROUND 1 HAD THIS AT 560 Hz AND IT WAS WRONG. The desk clip measured 47% of
  // its total energy in one octave at 90 Hz — a subwoofer in a cupboard. The
  // service desk is not a sealed room: it is an alcove behind a counter at the
  // front of the store with a doorway in it, so the store arrives mostly
  // filtered and partly straight. Filtering it to death made the desk quieter
  // than the floor without making it feel like a different place, which is the
  // whole job.
  const storeIn = gain(ctx, 1);
  const direct = gain(ctx, 1);
  const bleed = gain(ctx, 0);
  const bl1 = filt(ctx, 'lowpass', 1250, 0.7);
  const bl2 = filt(ctx, 'lowpass', 2100, 0.6);
  const blNotch = filt(ctx, 'peaking', 300, 1.4, -5);
  const blLow = filt(ctx, 'lowshelf', 140, 0.7, -2.0);
  const mono = monoise(ctx);
  const bleedOut = gain(ctx, 0.62);
  const storeOut = gain(ctx, 1);
  storeIn.connect(direct); direct.connect(storeOut);
  storeIn.connect(bleed); bleed.connect(bl1); bl1.connect(bl2); bl2.connect(blNotch);
  blNotch.connect(blLow); blLow.connect(mono.in); mono.out.connect(bleedOut);
  const leak = gain(ctx, 0.16);
  const leakLP = filt(ctx, 'lowpass', 7000, 0.6);
  const leakHP = filt(ctx, 'highpass', 300, 0.7);
  bleed.connect(leak); leak.connect(leakHP); leakHP.connect(leakLP); leakLP.connect(bleedOut);
  bleedOut.connect(storeOut);
  const bleedToDesk = gain(ctx, 0.45);
  bleedOut.connect(bleedToDesk); bleedToDesk.connect(smallIn); // it is in your room now

  // ---- listener -----------------------------------------------------------
  const L = ctx.listener;
  function setListener(x, y, z, fx, fz, t) {
    if (L.positionX) {
      L.positionX.setTargetAtTime(x, t, 0.05);
      L.positionY.setTargetAtTime(y, t, 0.05);
      L.positionZ.setTargetAtTime(z, t, 0.05);
      L.forwardX.setTargetAtTime(fx, t, 0.08);
      L.forwardY.setTargetAtTime(0, t, 0.08);
      L.forwardZ.setTargetAtTime(fz, t, 0.08);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(x, y, z);
      if (L.setOrientation) L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
  }

  // ---- where am I standing ------------------------------------------------
  // The whole zone solve, and the only place in the audio build that knows what
  // a supermarket is shaped like. All of it off config.js.
  const zone = { open: 1, aisle: -1, lateral: 9, chill: 0, front: 0, back: 0, mouth: 0 };

  function solve(x, z) {
    // nearest aisle centreline, and how far off it we are
    let ai = Math.round(x / PITCH + (AISLE_COUNT - 1) / 2);
    ai = clamp(ai, 0, AISLE_COUNT - 1);
    const lat = Math.abs(x - aisleX(ai));
    zone.aisle = ai; zone.lateral = lat;

    // In the slot? Needs to be near a centreline AND alongside the gondola body.
    // The cross-aisles (front walk, mid walkway, back walk) are open ground even
    // though they sit on an aisle's X.
    //
    // All three edges are RAMPS, not booleans. Walking out of an aisle mouth is
    // the single moment this whole file exists for, and a step change in `open`
    // makes it a switch you hear flip rather than a room you walk out of. The
    // ramps are about 2 m wide, which is roughly one second at walking pace.
    const inCross = smooth(CROSS_HALF - 0.9, CROSS_HALF + 1.6, Math.abs(z - CROSS_Z));
    const endF = smooth(BODY + 1.5, BODY - 1.0, Math.abs(z));
    const slot = (1 - smooth(1.35, 2.45, lat)) * endF * inCross;

    // front end: past the checkout heads, and the glass is right there
    const front = smooth(FRONT_WALK_Z + 5.0, FRONT_WALK_Z - 1.5, z);
    // back wall run
    const back = smooth(BACK_WALK_Z - 4.5, BACK_WALK_Z + 1.0, z);
    // standing in a mouth — the ends of the aisles and the mid walkway. Half open.
    const mouth = Math.max(
      (1 - inCross) * (lat < 2.6 ? 1 : 0),
      (1 - endF) * smooth(BODY + 3.2, BODY - 0.4, Math.abs(z)) * (lat < 2.6 ? 1 : 0));

    zone.front = front; zone.back = back; zone.mouth = mouth;
    // openness: 0 deep in a slot, 1 out on the front end.
    let open = 1 - slot;
    open = Math.max(open * (1 - 0.35 * mouth * slot), front * 0.95 + open * (1 - front));
    open = clamp(open, 0, 1);
    zone.open = open;

    // --- refrigeration proximity. Two runs: the back-wall case line (which
    // covers only the LEFT 56% of the store — see store.js) and the reach-in
    // bank down the whole minX wall. Standing at the dairy has to be a different
    // place to stand than aisle 4, and this number is what makes it one.
    const coolX0 = STORE.minX + 1.2, coolX1 = STORE.minX + (STORE.maxX - STORE.minX) * 0.56;
    const dBack = Math.hypot(Math.max(0, Math.max(coolX0 - x, x - coolX1)), Math.max(0, (STORE.maxZ - 0.62) - z - 0.55));
    const dLeft = Math.hypot(Math.max(0, x - (STORE.minX + 0.62)), Math.max(0, Math.abs(z) - (BODY + 0.44)));
    const d = Math.min(dBack, dLeft);
    zone.chill = 1 - smooth(1.5, 11.0, d);
    zone.chillDist = d;
    return zone;
  }

  // ---- per-frame ----------------------------------------------------------
  // Convolvers are the one thing in here with a real DSP cost, so a room that is
  // not being used gets its send disconnected once its tail has run out, and
  // reconnected when it is wanted again. On the floor that is 2 convolvers live;
  // at the desk it is 2 (small room + whatever of the store is bleeding in).
  function park(b, want, t, tail) {
    if (want > 0.0015) {
      if (!b.live) { b.send.connect(b.conv); b.live = true; }
      b.dead = 0;
      to(b.send.gain, want, t, 0.28);
    } else {
      to(b.send.gain, 0, t, 0.22);
      if (b.live) { b.dead += 1; if (b.dead > tail) { try { b.send.disconnect(b.conv); } catch (e) {} b.live = false; } }
    }
  }

  let deskF = 0;
  function update(t, x, z, isDesk, dt) {
    const zn = solve(x, z);
    deskF += ((isDesk ? 1 : 0) - deskF) * (1 - Math.exp(-4.5 * Math.min(0.1, dt)));
    const o = zn.open, floorF = 1 - deskF;

    // aisle <-> open crossfade. Equal-power so the total wet energy holds through
    // the walk instead of dipping in the doorway. At the desk the store keeps
    // its OPEN room — that reverb is still happening on the other side of the
    // wall whether you are in it or not — and only the aisle branch shuts down.
    const ga = Math.cos(o * Math.PI * 0.5), go = Math.sin(o * Math.PI * 0.5);
    park(A, ga * floorF * 0.92, t, 90);
    park(O, (0.16 + go * 0.94) * floorF + deskF * 1.0, t, 90);
    // The closet is only a room when you are in it. Parking it on the floor is
    // one whole convolver back, and the floor is where the frame budget is.
    park(D, deskF > 0.002 ? 1 : 0, t, 40);

    // wet level and tilt travel together: a slot is drier, tighter, mid-forward;
    // the front end is wetter, heavier and a shade darker on top.
    to(out.gain, lerp(0.72, 1.0, o) * floorF + deskF * 1.0, t, 0.25);
    to(wLow.gain, lerp(-3.0, 1.6, o) * floorF, t, 0.3);
    to(wMid.gain, lerp(2.6, -1.1, o) * floorF, t, 0.3);
    to(wHigh.gain, lerp(1.6, -1.4, o) * floorF, t, 0.3);

    to(direct.gain, 1 - deskF, t, 0.15);
    to(bleed.gain, deskF, t, 0.15);
    return zn;
  }

  return {
    input, smallIn, out, deskOut, storeIn, storeOut, zone, solve, update, setListener,
    // the convolvers, so audio.js can report what it actually costs
    convs: [A, O, D],
    irs: { aisle: irAisle, open: irOpen, desk: irDesk },
  };
}
