# CHOP PRICER — shared brief for every builder and critic

## The game
You're the fat cop working loss prevention at a discount grocery store. You watch a
wall of security monitors at the customer service desk trying to tell shoplifters
from normal shoppers. Spot one, you get an aisle number, and you waddle out onto the
floor. Get close — if they bolt, they were stealing. Chase them down before the exit.
You're fat, so you gas out in seconds; grab an energy drink or donuts off a shelf for
a short boost. Catch them: write-up, manager attaboy, points. Roll up on an innocent
shopper: harassment complaint. Three of those and you're back on traffic duty.

## THE BAR (this is what you are judged against)
**Real supermarket photography in `reference/`.** Look at those files. Not "inspired
by" — the test is whether someone shown your screenshot next to a real store photo can
tell which is the game. What actually makes those photos read as real:

1. **Product density above everything.** Shelves are packed edge to edge, floor to
   ceiling, no gaps, every facing a different size and color. A game supermarket with
   6 repeated box models reads as fake instantly. This is the single biggest tell.
2. **Hanging aisle signs** — numbered, with category lists (CANDIES / CANNED FRUITS /
   SPAGHETTI SAUCES). Gameplay depends on reading these, so they must be legible.
3. **Ceiling** — drop-tile grid, recessed fluorescent troffers in rows, track lights,
   sprinkler pipes, dome security cameras.
4. **Price-tag rails** — a thin white/yellow strip on every single shelf lip. Huge
   density cue, cheap to fake, almost always missing in game supermarkets.
5. **Floor** — polished VCT with a long specular smear of the ceiling lights on it.
6. **Palette** — warm cream and beige walls, sage/terracotta accents, wood-tone shelf
   uprights. Not grey. Not neutral. Real stores are warm and slightly ugly.

## Harness
- Project root: `/Users/jason/Documents/choppricer`
- **A server is already running on port 8171. Do not start another one.**
  Game: `http://127.0.0.1:8171/index.html` · Progress: `http://127.0.0.1:8171/progress/index.html`
- No build step. Plain ESM + three.js vendored in `vendor/`. Just edit and reload.
- **Make your own browser tab** with `tabs_create`, and pass that `tabId` to every
  browser call. Other agents are working in parallel; do not drive the `seed` tab.

### Driving the game from the browser console (`javascript_tool`)
```js
const C = window.__CHOP;
C.pause();                         // stop the RAF loop for deterministic work
await C.snap('store_r2');          // -> writes shots/store_r2.png, returns the path
C.run(4.0, { keys: ['KeyW','ShiftLeft'] });  // simulate 4s of input, no RAF needed
C.game.enterFloor(3); C.game.enterDesk();
```
`snap()` and `run()` work even when the browser pane is hidden — everything renders at
a fixed 1280x720, so screenshots from different agents are directly comparable.

### Reporting (do this every round)
```bash
python3 tools/report.py --piece store --role builder --round 2 \
  --state building --note "what changed" --shot shots/store_r2.png
```
`--state` is one of queued | building | critiquing | gap | passed. Critics add
`--gap "the single biggest remaining gap"` and `--verdict "..."`.

## Rules
- **You own exactly one file.** Do not edit another agent's file. You may add new files
  under your own namespace (e.g. `src/store/*.js`).
- **`src/config.js` and `src/main.js` are owned by the lead. Do not edit them.** If you
  need a contract change, report it and work around it for now.
- **Keep the export contract in your file's header comment intact.** Everyone else
  depends on it.
- All layout numbers come from `src/config.js`. Never hardcode aisle positions.
- Keep it running at 60fps at 1280x720. Use `InstancedMesh` for anything you draw
  thousands of. No external network requests at runtime — everything procedural or local.
- If the page throws an error from a file you don't own, another agent is mid-save.
  Wait and reload. Do not "fix" their file.


## Reporting a measurement: profiles, not single points

A blind critic reported render contact shadows bottoming at 31-58% of open floor.
The builder re-measured the same fixtures at 2-7%, and then showed that a hand-placed
contact line on the *real reference photo* swings between 2.2% and 37.4% depending
on which of two runs you pick. The metric was almost entirely a function of where
the measuring row was placed.

So: **report the whole profile and its error against the reference, not a single
extremum.** `min % of open floor` is not a number two people can compare. Mean
absolute error across a stated pixel range, against a named reference file, is.

The same builder listed three instruments it distrusted and why — peak lamp
luminance (clips at 0.99 in both render and photograph, so it cannot separate them),
that min% metric, and its own bake timing (varies 32-39 ms from JIT warm-up alone).
**Naming the instruments you distrusted is as useful as naming the ones you trusted.**
