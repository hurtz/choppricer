# CHOP PRICER — SECOND GAUNTLET

Pick CHOP PRICER back up. It is a finished game and it has one unfinished job.

## Where it stands

Nineteen rounds on the store, fifteen on the monitor wall, sixteen on the game
layer, ten on the agents. The chase works: a critic hand-played three of them
with real keys and lost by 4.41, 8.05 and 4.71 metres, oscillating between three
and five metres for eight straight seconds. You are strictly slower than the
thief at every stamina state, so you cannot win dry, and an energy drink closes
3.4 m/s. That was the second bar in the original brief and it is met. Do not
break it.

The first bar is not met. It has never once been met.

The test is one-sided: someone shown your screenshot next to a real store photo
should not be able to tell which is the game. Round 16 scored 36/36. Round 17
scored 33/36 — and that looked like progress until you split it, because all
three misses were real photographs called *render*. **Render detection was 18 of
18 both rounds.** Round 18's critic made fourteen render calls and got fourteen.
Round 19's builder scored its own work at 13 of 13. Not one frame of this game
has ever been mistaken for a photograph, by anybody, in nineteen rounds. A
photograph misread as a render does not help you.

## The goal

Get a blind critic to call one of your frames a photograph. Then get it to
happen again, on a different pose, with a different critic.

## The bar

`reference/` — fourteen real supermarket photographs. Same as it ever was. Look
at the files, not at what previous rounds wrote about the files.

Score it blind, in a fresh randomly-named directory, split randomised and never
printed, and **report render-recall separately from the total, every time.** A
falling total with flat render-recall is not movement. It is noise.

The blind test now runs honestly for the first time: `snapClean(storeOnly)` was
collecting hidden nodes into a `reHide` array it never consumed, so one call
emptied the store of every shopper, cart and child for the rest of the page load
— and every photograph it was being scored against has people in it. That leak
is fixed. Blind A/Bs from here have people in both columns. Nobody has scored a
round under those conditions yet. Get a clean baseline before you believe any
delta.

## The thing that decides this, and it is not a number

Rounds 12, 13 and 14 each picked a colour or lightness statistic, measured it
carefully, moved it, and published the work. The blind A/B went 12/12, then
35/36, then 36/36. Three correct rounds made it worse, because the bar was being
decided somewhere else entirely.

**Ask the blind critic what it actually called on before you optimise anything.**
If the cue and the statistic are different things, the statistic is maintenance
and the cue is the round. Report both and say which one you are working.

Here is what the last critics said they called on. This is evidence, not a task
list, and it is one round stale — re-derive it:

- **One design system.** Every hanging sign and promo tag in the store is a
  numbered blade, a two-word category list and three or four lozenge layouts,
  all flat matte vector, no vendor identity, nothing photographic. Thirteen of
  fourteen render calls came off that grammar and off the mirrored corridor.
  `store_00_Drinks` carries five colliding sign systems in a single frame.
  Round 19 shipped vendor identity against this and scored it itself — treat
  that number as a floor, not a result.
- **Zero calls came off a package.** That is real and it is the achievement of
  rounds 15 through 18. Keep it.
- **Round packages.** Twenty-three percent of the 44,853 instances in the store
  are lathes. Not one carries a rim ellipse, a lid, or a readable wordmark, and
  one reads as a green wine goblet. The unwrap fix is verified off the geometry;
  the anisotropy statistic that was quoted alongside it is retired and does not
  cross the render/photograph boundary.
- **The product wall has no bright end** — 4.25% of lit product above L\*65
  against 22.6–26.2% in the references. Honest, out of band, and a statistic.
- **The distant floor is one continuous mottle** where `store_03/07/12` resolve
  grout.
- **Bilateral symmetry** of the two shelf runs.

And one that is not the store's: **the pursuit panel is drawn on top of the man.**
A 1280 px band at y 62–140, and at a 3.8 m gap the thief renders from the knees
up behind it. It fires on 169 of 397 chase frames. The ink ledger cannot see it —
that ledger is HUD-versus-HUD by construction and the subject is not a string.
It is a visual defect in the frame the player is actually looking at, at the exact
moment the chase is decided, and it costs the player the one thing the second bar
is about: seeing the man he is a few feet from.

## How to run it

Break the remaining work into the smallest pieces that can be built and judged on
their own. For each one, fan out a builder sub-agent and a separate harsh critic
with fresh context. The critic runs the real game, looks at the real output,
scores it blind against `reference/`, names the single biggest remaining gap and
sends it back. Loop until it wins. Use subagents. Use ultracode.

Keep the progress page live the whole time. Every builder and every critic reports
each round with `tools/report.py`.

## What has already cost rounds here

`AGENTS_BRIEF.md` is the accumulated record — a hundred-odd entries of retired
metrics, false confessions, instruments that could not see what they certified,
and eleven region-dependent statistics that two people cannot compare. Read it
before you measure anything. It is long because every entry cost a round.

The five that bite hardest:

- **A parse check is not evidence the bundle works.** A shipped build died at boot
  on `MOTIF_DRAW is not defined` with every syntax gate clean. Run
  `python3 tools/check-live.py`, then load `docs/index.html` and confirm
  `window.__CHOP` exists, before telling anyone the link is updated.
- **Do not take a measurement through `snap()`.** It calls `step(0)`, which resumes
  the game and moves the camera out from under whatever you cached. It corrupts
  pose evidence, not just bench determinism. Post the probe canvas directly.
- **Pass `difficulty` explicitly to every `bench()` call.** It inherits `DIFF.level`
  from whatever last set it and `game.js` sets it every frame. The same build read
  85 / 87 / 75 percent across four attempts before anyone found that.
- **One owner per derivation, and the owner has to be answering your question.**
  Two bugs of exactly that shape have cost rounds — a shadow override block that
  made `config.js` decorative, and a hand-copied camera rig in the HUD held in sync
  by coincidence.
- **`git checkout HEAD -- <path>` is destructive here, not a revert**, and
  `git add -A` while builders are live puts someone else's work in your commit.
  Commit only the paths your round touched, named explicitly.

Own exactly one file. `src/config.js` and `src/main.js` belong to the lead.
Background tabs only, close them when you are done, and keep the audio off while
you test.

Don't ask me how to build it. Decide.
