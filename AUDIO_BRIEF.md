# CHOP PRICER — the audio bar

Playtest feedback, verbatim, from the person this is being built for:

> "I love the walking through the grocery store. That is beautiful. That is the best
> part of this game, that fluid motion and that feeling of really being in a store,
> and it would be a hundred times better if you could actually get the vibe of being
> there, which is the audio. The audio is a key component that cannot be overlooked."

So the bar is not "game audio". **The bar is: close your eyes and know you are standing
in a supermarket.** Nobody should think "nice soundtrack". They should think "I am in a
Price Chopper at 2pm on a Tuesday."

## What a real supermarket actually sounds like

It is a huge, hard-surfaced, half-empty room. Almost everything you hear is either the
building itself or somebody 30 metres away.

- **The room.** ~4000 m2, concrete floor, metal deck ceiling, glass front. Long reverb —
  RT60 roughly 1.5-2.5 s, and it is *bright*, because there is almost nothing soft in
  there. Everything distant is smeared by it. An aisle is a narrow hard corridor with
  strong early reflections; the front end is open and boomy. **They should not sound
  the same**, and moving between them is most of the feeling the player is paying for.
- **Fluorescent ballast hum** — 120 Hz plus odd harmonics, constant, everywhere, and
  the single most identifiable "indoor commercial building" cue there is.
- **Refrigeration.** Compressors that cycle on and off over minutes, not seconds. A
  chilled aisle is markedly louder and has a distinct low-mid drone. Standing next to
  the dairy run should be audibly different from standing in the middle of aisle 4.
- **HVAC** — broad low rumble, mostly under 200 Hz, never quite steady.
- **The PA.** Muzak, heavily low-passed, drenched in the room, coming from ceiling
  speakers you are never directly under. Occasional announcements. This is the one
  element allowed to be funny — but play it straight; the joke is that it is real.
- **Carts.** Wheels on hard floor: broadband rattle, one wheel always bad. They pass,
  so they need real spatial movement.
- **Checkouts.** Distant scanner beeps, irregular, always at the same pitch. Receipt
  printers. Bagging.
- **People.** Murmur, never intelligible, spread across the room. A kid somewhere.
- **The player.** Footfalls on hard tile with the room's tail on them. Heavy ones —
  he is a fat man. When he sprints they get faster and heavier; when he gasses out,
  the breathing IS the mechanic and it should be genuinely unpleasant.

## What must NOT happen
- No music bed of your own. The only music is the PA muzak, in the room, low-passed.
- No sound that would not exist in the building. No stingers, no whooshes, no risers.
- No sound that starts at full volume with no room on it. Everything has the room on it.
- Nothing perfectly looped. A loop point you can hear destroys the whole illusion.

## Measuring it
`python3 tools/audioprobe.py audio/<clip>.wav` reports spectral and dynamic properties
against the ranges a real store recording sits in.

**Treat it as a smoke test, not a target.** The previous visual proxy (`edgedensity.py`)
rose 14 points across three rounds while the blind test did not move at all — a metric
that stops tracking the thing it proxies for is worse than no metric, because it
manufactures confidence. If a change sounds right and costs a number, take the change.

## Recording a clip
```js
const C = window.__CHOP;
await C.recordAudio(12, 'floor_aisle');   // -> audio/floor_aisle.webm, 12 seconds
```
It taps `audio.master`, so it captures exactly what a player hears — there is no
special offline path that could drift from the real thing.

## The final judge is a person
The person this is for will listen. Structural correctness is necessary and not
sufficient. If it measures right and sounds wrong, it is wrong.
