# CHOP PRICER

Browser game. You're the fat cop working loss prevention at a discount grocery
store: watch the monitor wall, spot a shoplifter, waddle out, chase them down
before the exit. See PROMPT.md for the original brief, AGENTS_BRIEF.md for the
quality bar and the harness.

## Running it
    python3 tools/serve.py 8171

The server hands out TWO different builds of the same game:

| | what it is | who it is for |
|---|---|---|
| `/index.html` | **dev** — 39 separate ES modules, no build step, edit-and-reload | builders, critics, all testing |
| `/docs/index.html` | **built** — one self-contained 3 MB file, every module and three.js inlined | what ships |

`https://hurtz.github.io/choppricer/` is GitHub Pages serving that committed
`docs/index.html`. **Share that URL** — public, no login, HTTPS (the push-to-talk
mic needs it).

Live gauntlet progress: http://127.0.0.1:8171/progress/index.html

### The three can drift, silently
The dev build is always current. The shipped one is only as current as the last
`python3 tools/bundle.py docs/index.html` plus a push. A build that did not even
parse reached the player once this way.

    python3 tools/check-live.py

verifies source -> bundle -> live URL and names the fix for whichever link is
stale. Run it before telling anyone the link is updated. The bundler itself
`node --check`s its output and refuses to write a bundle that does not parse.

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


## A check on the solve is not a check on the rig

`gaitCheck()` passed while the walk rig was visibly wrong **four separate times**
in one round, and again for three more bugs in the round after: the ankle rocker
signs were inverted, so every body in every build that ever shipped landed
toe-first and pushed off its heel; the sole pin was solving in the leg's *scaled*
frame against a floor in root metres, so it was wrong by each body's own stature;
and `gaitFlex` was authored as an angle and encoded as a length fraction, its own
comment saying "about 15 degrees" while the shipped 0.055 was 38.

All three are invisible to a checker that validates the maths, because the maths
was right. Rule: a numeric check earns you nothing about geometry you have not
rendered. Capture the thing, look at it, and keep the probe
(`shots/_probe_move_plant.js`, `shots/_probe_crit_move.js`).

## Instruments known to lie here

Keep this list; every entry cost a round or a false report.

- **`bench()` chases `shoppers[0]` every trial**, so anything that varies per
  person is sampled at n=1. A per-person pace multiplier read as a −3.5 regression
  on one seed and +4.0 on another. Use paired seeds and say which body you got.
- **`benchTake` carries store state between calls.** The gap FIFO caps at 160, so
  a run straight after another starts on a partly-shopped shelf: same build, same
  seed, same difficulty read 0.888 and 0.885 depending on what ran before it.
- **Any geometry hash on a tab you have been testing in.** A put-back permanently
  re-poses a facing and swap-and-shrink permutes push order, so the store builder
  nearly reported "this round moved 40 meshes" off its own test activity. Hash
  before the first take.
- **Summing `renderer.info` across a `step()`** gave −305, −247 and −745 draw
  calls on three identical toggles, with "crowd hidden" reading *higher* than
  "crowd shown". One explicit render is stable to the call.
- **Wall-clock frame timers**, repeatedly: a 3x spread on an unchanged build, and
  a ranged arm timing *below* its own no-op baseline.
- **A sample of two.** A per-body trait looked like a perfect classifier in both
  directions at n=2 guilty bodies (`gMean` 1.000 then 0.455; at n=5 it was 0.498
  vs 0.500). Publish a census of who was armed alongside any population claim.

## Guilt must not be readable, and it keeps becoming readable

The premise is that you cannot tell a thief from a shopper without watching what
they *do*. Two **perfect** classifiers have been found in consecutive rounds, both
by measuring distributions rather than by reading code:

- `drift` (a guilty-only state) walked at `thiefWalk * 1.12` where innocents
  capped at 1.25 — 57.8% of a thief's pre-bolt life above a threshold no innocent
  ever crossed, zero false positives in 27 minutes.
- The harassment branch sat inside `else if (!s.guilty)` while the bolt needed
  `drift` or `stole`, so walking up to someone read out yell = innocent, bolt =
  guilty, **nothing = a thief who has not stolen yet** — and unlike the other two
  that probe was free.

Both existed for rounds under passing tests, and in the first case the file
already carried a comment stating the exact rule it broke, applied to a
neighbouring state. Rules:

- **Anything an armed body does at a different rate, speed, angle or interval
  than an unarmed one is this bug.** Sweep distributions per population and report
  `leakHi` — the share of guilty body-time above the highest value any innocent
  reached. It should be 0.00%.
- Do not gate on `s.guilty` to fix an economy. That rebuilds the leak.
- A published confession (the bolt) is fine. A *free* probe is not.

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
