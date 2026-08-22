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
//   }
//
// Browsers will not start an AudioContext without a user gesture. index.html's start
// card gives us one — main.js calls resume() on that click.
//
// THE BAR: a real supermarket. Not "game music". The player should be able to close
// their eyes and know they are standing in a grocery store. See AUDIO_BRIEF.md.

export function createAudio(THREE, camera) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const buses = {};
  for (const name of ['ambience', 'pa', 'foley', 'ui']) {
    const g = ctx.createGain();
    g.gain.value = 1.0;
    g.connect(master);
    buses[name] = g;
  }

  return {
    ctx, master, buses,
    resume() { if (ctx.state === 'suspended') ctx.resume(); },
    update(_dt, _state) {},
    setMix(name, gain) { if (buses[name]) buses[name].gain.value = gain; },
  };
}
