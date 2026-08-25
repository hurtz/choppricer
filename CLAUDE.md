# CHOP PRICER

Browser game. You're the fat cop working loss prevention at a discount grocery
store: watch the monitor wall, spot a shoplifter, waddle out, chase them down
before the exit. See PROMPT.md for the original brief, AGENTS_BRIEF.md for the
quality bar and the harness.

## Running it
No build step. Plain ESM + three.js vendored in `vendor/`.

    python3 tools/serve.py 8171

Game: http://127.0.0.1:8171/index.html
Live gauntlet progress: http://127.0.0.1:8171/progress/index.html

## Layout
- `src/config.js`  — shared world contract (aisle math, TUNING, camera rig). LEAD-OWNED.
- `src/main.js`    — bootstrap + wiring, and the agent test surface. LEAD-OWNED.
- `src/store.js`   — the supermarket: shelving, product density, ceiling, signage.
- `src/cctv.js`    — monitor wall + the security-footage grade.
- `src/agents.js`  — cop, shoppers, thieves, stamina, powerups. Owns the chase feel.
- `src/game.js`    — modes, scoring, complaints, rank, HUD.
- `reference/`     — real supermarket photos. The visual bar. Not shipped in the game.
- `shots/`         — screenshots agents capture as evidence each round.

## Test surface
Everything renders at a fixed 1280x720 so screenshots are comparable between agents,
and `snap()`/`run()` work with the tab backgrounded (they never depend on rAF).

    const C = window.__CHOP;
    C.pause();
    await C.snap('name');                        // -> shots/name.png
    C.run(4, { keys: ['KeyW','ShiftLeft'] });    // deterministic sim steps

## Tuning hazard: shadow blocks

`src/agents.js` has carried per-round override objects (`R4`, `R5`) so a builder can
run its own numbers before the lead promotes them into `TUNING`. These are fine
while a round is in flight and dangerous afterwards: a getter written
`return R5.x` instead of `return T.x ?? R5.x` makes `config.js` decorative for
that constant, and a later TUNING edit silently does nothing.

Rule: an override block gets collapsed in the round after it is promoted, and
every constant ends up read as `T.x ?? fallback`. When collapsing, keep the
measurement prose — the rejected experiments and sweeps in those comments are
the most useful documentation in the file.

Two bugs of exactly this shape have already cost rounds here: gassed sprint speed
outrunning the healthy walk for four rounds, and `bargeDump` being byte-identical
at 0.40 and 0.85 because its `Math.max` never fired.

The same hazard is not limited to tuning constants. `src/game/hud.js` carried a
hand-copied duplicate of the floor camera rig ("reproduced here so HUD markers can
sit on world positions without needing the camera object") — correct only while the
camera never moved, and held in sync purely by coincidence. Deliberate duplication
with a comment explaining itself is how every one of these starts.

Rule: exactly one piece of code owns a derivation, and everyone else calls it. If a
second copy is genuinely unavoidable, it needs an assertion that fails loudly when
the two disagree — see `lungCheck()` in `src/agents.js` for the pattern.


## Committing while builders are live

Several commits in this repo were made with `git add -A` while other agents had
in-flight edits in the tree. Nothing was lost, but a builder's work landed inside an
unrelated commit under someone else's message, and `git checkout HEAD -- <their file>`
stopped reverting to a clean baseline for them.

Rule for the lead: while any builder is running, commit **only the paths that round
touched**, named explicitly. `git add -A` is for a quiet tree. If a sweep is
unavoidable, say so in the commit message so the owner can find their change later.


## Benching on a live page: pass `difficulty` explicitly

`bench()` in `src/agents.js` inherits `DIFF.level` from whatever last set it, and
`game.js` sets it every frame from the shift clock. So a bench started *after* the
rAF loop has ticked once measures `difficultyForClock(0)`, and one started *before*
it measures the default. The same build read 85% / 87% / 75% across four attempts
until the cause was found — every shopper's `nerve` differing by exactly the ramp
multiplier was the tell.

This can corrupt any live-page measurement in that file, and has been able to since
the difficulty ramp landed. **Pass `difficulty` to every bench call.** If you are
comparing two builds, pin it in both.
