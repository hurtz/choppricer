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

## Retired demands, and references that do not mean what they were used to mean

Two rounds have now been spent partly on targets that turned out to be unsupported.
A demand retired here stays retired unless somebody brings new evidence.

**RETIRED: "the troffers should resolve 2-4 discrete tubes with dark gaps."**
Round 9's critic asked for it, round 10 claimed a ladder contrast of 4.58, and round
11's builder and critic independently measured **1.22/1.54** and **1.17/1.41** — nowhere
near it. More important, the target has no support in `reference/` at all: `store_04`'s
troffer lens is flat to within **2%** across its interior and `store_03`'s to within **6%**.
No recessed troffer in the reference set resolves tubes. The render's own fixture already
shows two tubes and a louvre at close range — *more* structure than the photographs, not
less. Do not ask for this again.

**RETIRED as an instrument: `p95/p20` across a lens.** Same disease as peak lamp
luminance. `store_04`'s lens is 30% clipped at 1.0, and widening the measuring box by
2 px swings its ratio **1.02 -> 1.58**. It cannot separate render from photograph.

**CAUTION: the ceiling/floor luminance ratio was calibrated against the wrong fixtures.**
It was quoted as "references at 0.857 / 0.959 / 0.380", but `store_01` and `store_02` —
two of those three — have **black open-deck ceilings, not drop tile**. The comparable
drop-tile store, `store_00_Drinks`, runs C/F **1.313**, which is *above* the render's
1.273-1.341. Check the fixture type before using a photograph as a ceiling target.

**CAUTION: `store_00` names TWO different files** (`..._Drinks_aisle_of_Smith_s...` and
`..._Port_Gibson_MS_Piggly_Wiggly...`), whose tile luma differs 0.644 vs 0.514. Always
cite the full filename, never the `store_NN` prefix.

**CAUTION: `store_05` tile saturation** measures 21.9-25.6% on overlay-verified pure-tile
patches, not the 13.0% that has been quoted from it.

**Do not quote three significant figures off a 1-2 px feature.** A 24 mm ceiling runner at
aisle range is one to two pixels; both a builder and a critic quoted the same T-bar
statistic to three digits and got 0.789 and 0.910 from the same reference.

## Instrument hygiene, learned the hard way

Several rounds have been saved by an agent distrusting its own tooling. The recurring ones:

- **GPU wall-clock is unusable while other builders are running.** `performance.now()` +
  `gl.finish()` has returned 0.002 ms for a real draw call here, and a timer query drifted
  12% run-to-run on an *unchanged* control while the target moved 31%. Quote exact static
  counts (draw calls, triangles, texture fetches per pixel) instead.
- **`renderer.info` after an in-game step reads ~1 call / 1 tri**, because the CCTV pass
  resets it. Read it off a probe render with non-store nodes hidden.
- **Declared measuring regions do the work.** Two "objective" ceiling metrics once reported
  the render *cleaner* than a photograph because the photo's crop was 60% promo signage.
  Publish an evidence image of every region you measure so it can be checked, not trusted.
- **Setting `m.map = null` to strip an artwork layer drops `USE_MAP`, breaks an injected
  shader, and can return two byte-identical PNGs including the "restored" one.** Probe with
  uniform-only changes and prove the restore.

## The reference photos cannot measure everything you want to measure

All 14 files in `reference/` are **1920-wide 4:2:0 JPEGs**. That is fine for luma,
structure, colour blocks and blown-highlight fractions. It is fatal for anything
sub-pixel or chroma-fine, and round 8 lost its headline to this.

**Calibrate the instrument by injecting a known signal and re-encoding through the
reference's own settings before you trust a number taken through them.** Round 8's
critic injected a known Brown-Conrady shift into three reference files:

    through PNG        gain 0.64-0.71, stable and content-independent
    through 4:2:0 q92  gain 0.06-0.19, and NONLINEAR - 0.06 at inj 0.30,
                       rising to 0.15 at inj 1.00

After the 4:2:0 step the instrument retains ~10% of the signal and its gain changes by
**2.5x across the very range being measured**. You cannot invert that. Three separate
significant figures were published off it ("0.474 -> 0.226", "0.128", "MAE 0.095 px")
and none of them is falsifiable. The reference set physically no longer retains
sub-pixel lateral chromatic aberration, so it cannot calibrate that term *at all*.

A change can still be right on **optical** grounds with no reference set involved — a
`smoothstep(0.42,1)^2` ramp with a bit-exact-zero core and an onset ring is not a lens,
and Brown-Conrady is. Make that argument instead of a fake measurement, and do not make
an invisible term (0.29 px on screen) the headline of a round.

**And measure the published quantity where you published it.** `CA_CORNER_720` is
documented as "the R-to-B separation in destination pixels at the extreme corner — the
fringe width you can measure on the picture". Measured on the picture it is **0.293 px,
not 0.70**, because `uChroma` runs *after* the CA taps and attenuates the fringe to 0.55x.
That is exactly the CLAUDE.md hazard: a documented derivation that a second piece of code
silently invalidates.

**Ablate on ONE page load.** The strongest evidence in rounds 8 and 11 came from changing
a single dial or uniform on a byte-identical scene and re-capturing, never from comparing
two builds. Run a same-settings control first to establish your noise floor — round 8's
critic measured 0.0078 levels and 0.089% of pixels moving (one distant animating shopper)
before trusting any ablation, and its effect was 25x that.

## `node --check` cleared a file the browser refused. Use the module form.

On 2026-08-26 `src/cctv/shaders.js` took the entire page down — `main.js -> cctv.js ->
cctv/shaders.js`, so nothing booted for anybody — from a stray backtick inside a GLSL
template literal, in a *comment*:

    // It multiplies `blur` as well as `col`. blur is only ever consumed as

The backticks closed the shader string early. What made it cost three agents an hour is
that the guard everyone uses **said the file was fine**:

    node --check src/cctv/shaders.js                          # EXIT 0. Silent.
    node --input-type=module --check < src/cctv/shaders.js    # line 267, with a caret

It did not merely fail to notice. It actively cleared a file the browser refused to load.
Two builders and the lead each observed this independently within half an hour, on two
different files (`src/cctv/shaders.js` and `src/store/pack.js`).

**RUN `python3 tools/check.py` BEFORE EVERY RELOAD.** One command, whole tree, module form,
prints file + line + caret and exits non-zero so it chains:

    python3 tools/check.py && echo RELOAD OK

**BETTER: START THE WATCH AND FORGET IT.**

    python3 tools/check.py --watch &

Run it in a background shell for your whole round. It polls, re-checks only what changed,
and prints file + line + caret **within about a second of the bad save** — before you have
reloaded and started debugging the wrong thing. It announces recoveries too. The one-shot
form only helps if you remember, and **four** page-downs happened with the correct command
already sitting in this brief.

**AND THE CONVENTION THAT ACTUALLY PREVENTS IT: never use backticks for emphasis inside a
comment that lives in a template literal.** Use CAPS, or 'single quotes'. Every one of the
four outages was a markdown habit — `` `rem` ``, `` `blur` ``, `` `inside` `` — meeting a
language where a backtick is a string terminator. This rule cannot be enforced by a linter
(see below), so it has to be a habit, and it belongs wherever you are writing shader source.

**AND KNOW THAT THE RULE IS FIGHTING A REFLEX, WHICH IS WHY IT KEEPS LOSING.** The builder
who did it twice in one session diagnosed it better than anyone: *"the second time was not
carelessness about the rule — my prose habit is to quote identifiers in backticks, so
writing `` `inside` is already this file's measure of... `` inside a GLSL comment reproduced
it exactly."* Every agent here writes prose in markdown all day. Telling them to stop
reaching for a backtick around an identifier is asking them to suppress a reflex mid-thought,
in a comment, while thinking about something else entirely.

**So do not rely on the rule. Rely on the watch.** A convention that fights a writing habit
will fail at some rate forever; a checker that reports in under a second makes the failure
cost twenty seconds instead of blocking every agent on the project. Both builders who hit
this said the same thing afterwards: the tool caught it before they ever loaded the page.

**Do not build a "risky backtick" warning. It cannot work.** In a file that PARSES, the
first backtick after the opener IS the closer, so there is no fragile-but-passing state to
detect — the file is either broken or fine, with nothing in between. That was tested: a
detector over every GLSL-embedding file found **0** risky lines on a healthy tree, by
construction. Fast detection is the only available defence, which is what `--watch` is.

The tool exists because this bug class took the whole page down for every working agent **four
separate times in one day** — `src/cctv/shaders.js` twice and `src/store/light.js` once —
and each time the agent had a correct invocation available and did not run it. Relying on
everyone remembering `node --input-type=module --check < FILE` has now failed three times.
Use the tool. (The one-liner is still correct if you want a single file.)

**The four-line reproduction.** Save the same bytes as `a.js` and `a.mjs`:

    export const S = `
      // x `blur` y
      blur *= vg;
    `;

    node --check a.js                        -> PASS   <- WRONG
    node --check a.mjs                       -> FAIL, caret on `blur`
    node --input-type=module --check < a.js  -> FAIL

**What decides it is whether the WRECKAGE still parses.** The stray backtick re-tokenizes
the rest of the file; in the case above the tail happens to re-close into a second complete
template literal, so the result is still parseable and the blind check affirms it. Change
the shape so the tail cannot re-parse and the blind form starts failing correctly — this
variant is script:FAIL:

    const S = `
      // x `blur` y
      blur *= vg;
    `;
    export default S;

**So the bug is not in the backtick, it is in where the NEXT backtick in the file happens
to be.** That is why safe-shape reasoning is not merely unwise here, it is unavailable:
you cannot look at a shader comment and predict which side you land on. Use the module
form on everything. `tools/bundle.py` now runs both forms and fails if either complains.

Two corrections to the first write-up of this incident, both from the builder who bisected
it: it is **not** an interaction between the two bad comments — the real file was
reconstructed in all three broken states (both comments, line 267 alone, line 314 alone)
and every one is script:PASS / module:FAIL, so either alone does it. And the lead's earlier
"the mechanism is not understood" is superseded by the repro above.

**What is still NOT established, and nobody should guess at it:** why node's CommonJS path
reports PASS on a file containing a top-level `export` at all. The empirical rule above is
solid and reproducible on node v26.7.0. The internal reason is not, and the brief says
nothing about it deliberately.

**The other half of this, and it is the more general lesson.** `shaders.js` has carried
this comment since round 2, on line 136:

    (No backticks in here, ever: this whole shader is a JS template literal.)

The warning existed. It was correct. It was ~130 lines above the place someone then put
backticks, and it did not travel. A warning only works where the mistake is made — which
is an argument for a CHECK THAT RUNS, not for a second copy of the warning. The builder
who hit this deliberately did not add one.

## C*/L* IS NOT EXPOSURE-INVARIANT. A tool in this repo says it is, and it is wrong.

`tools/faceprobe.py` carries this claim:

    "scaling linear RGB by a neutral k moves L* and C* together (both ~k^(1/3)),
     so C*/L* is invariant under exposure"

**It is false.** `L* = 116*f - 16`, so it is `(L* + 16)` that scales, not `L*`. Measured on
one unchanged frame under a pure neutral linear scale:

    C*/L*        0.417 -> 0.396 -> 0.376     (-10% per stop)
    C*/(L*+16)   0.297 -> 0.298 -> 0.297     (holds)

This matters more than a decimal. Round 12's headline was "product C*/L* now matches the
reference median" — but the render's product pixels sit **12.3 L\* below their own frame
median** where photographs sit **+1.4**. So the ratio reached parity partly **by lowering
its own denominator**, and its apparent stationarity is precisely what hid the real gap
(shelf-face illumination a stop under). Offset-corrected the render is still ahead, but by
less than published.

**Use `C*/(L*+16)` when you want exposure invariance.** And when a statistic looks stable
across a change, check whether it is stable because the thing is unchanged or because two
errors are cancelling in it.

## RETIRED: whole-frame median block C*, and dark-ceiling-clutter

**Whole-frame median block C\* cannot separate render from photograph.** Render 11.9
(poses 6.6-13.4) against references 7.1-21.6, median 14.7 — with **three reference photos
LESS chromatic than the render**. It is also nearly blind to real change: a +67.1% product
chroma injection moves it +6.2%, retaining 0.09. The reason is **region and rank, not block
averaging** — block/pixel ratio is 0.983 whole-frame, so almost nothing cancels; product is
24.2% of pixels but only **11 of 220 blocks** are >=80% product, and moving 5% of a sample
cannot move its 50th percentile. The statistic that *does* still separate is **p90 block
C\***: render 16.3-19.7 on aisle poses vs references 17.9-30.6, median 23.6. Prefer the
tail; report the region.

**Dark-ceiling-clutter is retired.** Three agents measured one sentence and got three
non-overlapping answers (11.2-18.7%, 1.7-6.7%, 30.7-45.9%). The cause: **"luma < 0.25" does
not say which colour space.** Same region, same threshold:

    sRGB-domain luma    render 1.2-5.1%    photos 0.9-93.6%   median 13.9%
    linear-light luma   render 30.7-45.9%  photos 15.2-96.8%  median 52.7%

A 10x swing on an unstated transfer function. Under every convention the render lands
*inside* the reference range and is never the extreme. The region is junk regardless: "top
22%" is stacked cans in `store_01_Canned_tuna` (0.9%) and open-deck ceiling in `store_12`
(93.6%) — it measures crop content, not clutter.

**State your colour space with every luma threshold.** sRGB-domain, linear-light, and PIL
`L` are three different numbers, and the 601-vs-709 weight choice is the *irrelevant* half
of that decision.

**Watch the glob:** `reference/*.jpg` silently measures **12 of 14** files —
`store_09_...` and `store_11_...` have no extension. Every reference range you publish
should say how many files it is over.

## RETIRED: period-2 row modulation. And a false confession worth studying.

**Period-2 row modulation is retired.** It is a pure function of the measuring window. The
same unchanged frame reads **0.109 at 320 columns, 0.060 at 640, 0.039 at 1280** — a
1/sqrt(width) law, which is the signature of an incoherent per-row term, not a coherent
scanline. Measuring the game at its native 1280 against references at their native 1920
inflates the game about 1.2x for free. Same disease as `p95/p20` and `min % of open floor`.
Measured properly, as the exact Nyquist bin, the game sits at roughly the 85th percentile
of the reference envelope — inside it.

**THE FALSE CONFESSION.** Round 9's builder volunteered, against its own interest, that
flat-shadow *chroma* noise "is the one statistic still not inside p90" (0.732 against
0.689). Its critic checked, and **the defect does not exist**: put the same game frame
through `store_03`'s own quantization tables at 4:2:0 and it reads **0.359** against a
reference median of **0.352** — at the median. A 4:4:4 control at identical quality reads
0.685, so it is the chroma subsampling doing it, not the quantization. Pushing `uChroma`
further to "fix" it would have made the render **quieter in colour than the photographs**.

Two lessons, and the second is the one that generalises:

1. **AGENTS_BRIEF already said the reference JPEGs cannot measure sub-pixel chroma.** That
   warning was written for chromatic aberration, and it applies to every chroma-fine
   statistic. The builder honoured it for CA and then walked into it for noise.
2. **An honest self-reported failure is still a measurement, and it can still be wrong.**
   Confessing a defect buys credibility, which is exactly why a critic must check a
   confession as hard as a claim. Round 9 "stopped for the right reason with the wrong
   justification" — and had a critic taken the confession at face value, the next round
   would have been spent making the picture worse.

## `snap()` is not deterministic. Never quote a single frame.

The grade reseeds its grain per render, so two consecutive identical captures differ in
**86.8% of pixels by more than half a level**. Any number taken from one frame carries that
noise. Every figure in round 9's critique came from a 6-7 capture control, with the noise
floor stated (+/-0.011 on the ceiling-blown statistic). Do the same: capture a control
series first, publish its spread, and only then claim an effect.

## A declared measuring box proves things about the box

Round 9 claimed "the tube clips and the white sign does not", measured on the promo
lightbox at x890-1190, y190-330. The claim is TRUE there — median 0.913, 3.5-3.9% clipped,
all of it in the upper-left specular corner. But the frame's two **largest** clipped blobs
are hanging aisle-sign faces, which clip *harder than the tubes*: right sign median
**1.0000** with **71.5%** of the face clipped, against the ceiling tube run at median 0.641
/ 37.5%. Legibility survives (dark type on white) and those faces are `MeshBasicMaterial`,
unlit by authoring — so it may be the right call. But the general claim was not tested by
the specific box. **Say what your box proves, and go looking for the counterexample
yourself.**

## A region-dependent statistic is not a shared statistic. Publish the coordinates.

Round 12's critic reported that render product sits **12.3 L\* below its own frame median**
while photographs sit at **+1.4**. Round 13 measured the same statistic on the same 14-file
reference set and got a photo median of **−8.5, range −27.8 to +7.6** — about **10 L\*** from
the published figure, entirely because it picked different patches of shelf.

Neither number is wrong. The statistic is simply **dominated by which rectangle you draw**,
and two agents quoting it to one decimal are not comparing anything. This is the fourth
metric on this project to fail that way (`min % of open floor`, `p95/p20`, dark-ceiling
clutter, and now the product−frame offset).

**The rule, and it now applies to every reference statistic you publish:**

1. **Publish the region coordinates**, normalised, per file — round 13 did this, e.g.
   `store_00_Drinks 0.03,0.55,0.28,0.80`. A named file is not enough; a crop inside it is.
2. **Publish an evidence image** showing every region you measured on top of the image you
   measured it on.
3. **State how many reference files the range covers** (`reference/*.jpg` globs 12 of 14).
4. **Prefer region-free statistics when one exists.** Round 13's honest headline numbers are
   whole-frame and mask-based: frame p90 C\* 27.4 → 31.9 against a reference median of 32.6,
   and %(L\*>50 & C\*>25) 3.90 → 4.82 against a reference range of 4.06–25.33. Those two are
   comparable between agents; the offset is not.

## Ship the negative result next to the code it undercuts

Round 13 built analytic troffer-row lighting, then proved with a matched-exposure control
that the **diffuse half of it is exposure-equivalent** — a plain ×1.25 on the existing
lights matches or beats it on every column but one — and wrote the table and the reason
into `src/store/light.js` above the term itself:

> a 2.65 m row pitch under a 5.2 m ceiling **is** a uniform luminous plane at shelf range, so
> no arrangement of it can put variance on a shelf face that a constant did not already have.

The term stayed, for stated reasons (it is the honest source geometry, the specular hangs
off it, and it lets the key light come down). But "put the luminaires in the right place" is
now **retired as a lever**, at the place a future round would reach for it. That is the
pattern: a negative result is only worth what it saves the next round, and it only saves
them if it lives next to the code, not in a report they will never read.

## A probe that returns zeros without throwing

`readRenderTargetPixels` into a **`Float32Array` on an `RGBA16F` target returns all zeros
and raises no exception.** Round 10's first probe therefore reported that the scene emits
no light at all — a clean, confident, entirely false measurement, from an API that had
already silently failed before the first number was printed.

**Any probe that can return a plausible null result must be validated against a known
non-null input before you believe a single figure from it.** Round 10's own list is a good
template for the shapes this takes:

- an API that fails silently and returns zeros;
- a per-material uniform write that misses most materials because they are **cloned per
  batch**, so a "specular off" control was not off and two sweep rows came back
  byte-identical (round 13 lost an hour to exactly this);
- a normalisation that gave good numbers **for an accidental reason** (tint depth happened
  to drive brightness), which is the worst case because it agrees with you;
- a region split that does not split what it claims: a "top third = ceiling" band puts
  **72% of blown pixels below it** on a 96 degree dome, and one visible cluster on CH01 is a
  lit sign face, not a tube.

## Resampling kernels move a published number 8.6x

Reducing a reference photo to the wall's 142x80 tile to compare blown-pixel fractions gives
a reference median of **0.224% under LANCZOS, 0.119% under BOX, and 0.026% under BILINEAR** —
an 8.6x swing on a choice nobody states. **Name the kernel with any statistic taken through
a resample**, and prefer to state the whole spread rather than one figure, exactly as
AGENTS_BRIEF's opening section says about profiles versus extrema.

## One owner is not enough. The owner has to be answering YOUR question.

Round 12 fixed a real bug the right way: the player's HUD and the bench bot's sighting were
two derivations of "what does the pursuer know", they disagreed by 11 points, and it
unified them onto `agents.nav.clearSeg` — one owner, everyone calls it, exactly what
CLAUDE.md prescribes.

**And it was still wrong, because `clearSeg` answers a different question.** It is a
*body-pathing* predicate: can a body walk this line. `makeSolids()` keeps only
`{x0,z0,x1,z1}` from each collider — **the height is discarded** — and `makeNav` inflates
every footprint by a 0.52 m body radius. **52 of the 74 colliders are under 1.6 m**: eight
1.10 m checkout stands across the front of the store, the 1.15 m service desk, 0.8-1.3 m
bins and produce tables. For pathing that is correct; you cannot walk through a checkout
stand. For *vision* it is wrong; you can see over one.

Measured in the front-of-store box where every chase is decided, 2,594 pairs: the game
grants CONTACT on **23.7%**, a height-aware model on the *identical grid and pad* says
**100%** — there is nothing over 1.6 m tall in that strip. **76.3% of the endgame is hidden
behind furniture the player is looking over**, 56.6% of it within 8 m, closest such pair
0.99 m.

The repo already contained the right code. `src/camera.js`'s `solids()` keeps real heights,
with a comment saying exactly why: *"checkout counters, bins, produce tables… the camera may
fly over them, which it should."*

**So the rule has a second half.** Before routing your question through somebody else's
function, check what question THAT function was built to answer. A single owner removes the
disagreement; it does not make the answer right. Deduplicating onto a predicate with the
wrong semantics converts an honest disagreement into a confident, uniform error — which is
harder to find, because now nothing disagrees with anything.

## THE HARNESS HOLE: no bot in this repo plays the game

`eval.js`'s floor driver steers at `t.position` — a full oracle — and `agents.bench` runs
the bot, not the HUD. **Nothing in this repo consumes the player's HUD**, so no instrument
here can measure whether a change made the game harder or easier *to play*. Round 12's
builder correctly refused to cite its own bench for a HUD change on exactly these grounds,
and its critic independently confirmed the hole. Two consequences:

- **A HUD or information change cannot be benched today.** Say so rather than quoting a
  number that structurally cannot move.
- **Play it.** Both critics who played this game produced their report's best section from
  it. Chase gaps of 0.8 / 0.8 / 1.9 / 2.3 / 3.3 m over six hand-played chases is the second
  bar being met, and no bench in the repo could have told you that.

**Two harness traps for anyone hand-playing:** the `computer` tool's key injection
dispatches `keydown` with an **empty `e.code`**, which this game reads exclusively — drive
the window listeners with correctly-coded events instead. And rAF is fully halted while the
browser pane is hidden (0 frames in 3 s), so drive `step(dt)` yourself.

## LATENT BUG, found by a critic and not yet fixed: the wall starves feeds below 15 fps

`renderWall` driven with `dt >= 0.083` **starves 3 of 9 feeds, permanently.** The cursor
stride in its budget loop locks onto a 3-orbit once every feed is due at once, and the
starved three then change **0.0% of pixels over 10 seconds**. Healthy at >= 15 fps, frozen
at <= 12.

This is not a 60 fps bug and it does not affect the shipped frame rate, but it is a live
fragility on a slow machine — and it is a trap for anyone taking a wall statistic the
natural way, because a paused or hand-stepped page is exactly where large `dt` comes from.
A critic's first three measurements were wrong because of it and it nearly published the
starvation as a shipped defect.

**The tell is a channel with ZERO spread across a control series.** If a number does not
move at all between captures, suspect the instrument before the build.

## Resampling: the swing is 48x, not 8.6x

Four kernels on the same reference set, reducing photos to the wall's 142x80 tile:

    LANCZOS   ref median 0.2245     game/ref 0.47x
    BOX       ref median 0.1188     game/ref 0.89x
    BILINEAR  ref median 0.0264     game/ref 4.0x
    NEAREST   ref median 1.2676     game/ref 0.08x

**48x end to end.** A single figure quoted off a resample says more about the kernel than
the build. What survived here was the *distribution*: game panel medians
`[0, 0, 0, 0.035, 0.106, 0.110, 0.761, 1.307, 1.925]` against BOX references
`min 0 / med 0.119 / p90 1.021 / max 3.64` — the shape agrees under either defensible
kernel. Report shapes, name kernels, never a lone number.

## When your own instrument refutes your headline, publish the refutation

Round 10's critic built two statistics to support its eye's call that the eight wall tiles
"are one shot copied eight times and uniformly beige". They refuted it: asymmetry 0.164
against a reference 0.182 with heavy overlap, mean C* 15.24 against 15.34. **It dropped its
own headline** and said why the impression was wrong — the montage is 8 aisles of one store
against 14 different stores, which will always look more uniform.

That is the standard. An impression that survives a measurement is a finding; an impression
that does not is a lesson about the impression.

## CORRECTION: `snapClean(storeOnly)` IS deterministic. Only the graded `snap()` is not.

An earlier section here said "`snap()` is not deterministic — never quote a single frame".
That is true of the **graded** capture, where the grade reseeds its grain per render (86.8%
of pixels move by more than half a level). It is **mostly** untrue of
`snapClean(..., {storeOnly:true})` — but not entirely, and the exception is measured.

    round 13 critic   6 of 6 poses byte-identical by md5
    round 14 builder  5 of 6 poses byte-identical

The dissenting pose is `P1_aisle3_down`, which carries a **0.0765%-of-pixels, max-12-level**
wobble in one 119x37 box at the **back-wall freezer glass**. So: clean plates are md5-able
for proving an ablation restored, on most poses — **but md5 the control first**, and if your
pose includes the back-wall glass, expect a small non-determinism there rather than
concluding your change did it. Graded frames always need a control series.

## `renderer.info` is worse than pose-dependent — only within-run toggles are valid

An earlier section here says static draw calls and triangles are pose-dependent (112-135
calls on one unchanged build). That understates it. Round 14 measured **the same build at
the same pose, minutes apart**:

    129 calls / 2,511,402 tris
    135 calls / 2,513,886 tris

**Naming the pose is not enough — the probe's own hide-set moves it.** The only trustworthy
comparison is a toggle *within a single run*: capture, flip the uniform, capture again,
without reloading or re-deriving the hide-set. Round 14's own perf claim is stated that way
(135 / 2,513,886 identical with the terms on and off) and that is the form to copy.

## Two more statistics that are not pose-free

- **Static draw calls and triangles are POSE-DEPENDENT.** One unchanged build measures
  **112-135 calls and 2.25-2.72 M triangles** across six poses. Every "geometry-neutral"
  claim must name the pose, and a 2-call delta between two rounds explains nothing.
- **Frame p90 C\* is region-free but not pose-free.** One unchanged build spans **22.9-38.3**
  across six poses — **65% of the entire reference range**. Round 13's headline 27.4 -> 31.9
  is real but not restatable by anyone who does not use the same pose.

**RETIRED: the product-minus-frame-median offset.** The render side is exact and reproducible
(-11.85, matching round 12's -12.3). The photograph side cannot be measured at all: a
25% x 25% patch swept over each reference spans about **-18 to +16 within a single file**, and
-35.1 to +34.2 at the extremes. **Both +1.4 and -8.5 are reachable on 14 of 14 files** —
the within-photo spread is 3.5x the disagreement two agents were arguing about. Sixth metric
retired on this project for the same reason.

## The asymmetric-rule trap: run YOUR rule on BOTH sides

Round 13's critic filed a headline — "the product wall has no bright end, 4.25% vs
22.6-26.2%" — and then **overturned it itself**. The render side had used the exact
product mask; the photograph side had used the whole frame, including its bright fixtures.
Under one symmetric rule (`C*>20`, whole frame, no mask, both sides) the render is **not**
short of bright chromatic pixels at all.

This is the promo-signage trap from an earlier round running in reverse, and it is the
easiest way on this project to manufacture a gap that does not exist. **State your rule once
and apply the identical rule to render and photograph.** If you must mask one side, mask the
other the same way or do not compare.

## A second false confession, same shape as round 9's

Round 13 volunteered that "L\*65-80 got worse 0.79 -> 0.62 because the white specular pushes
neutral pixels into it." Checked: absolute C\* in that bin went **UP** on all six poses, the
ratio fell by a median of **0.017 not 0.17**, and killing the specular entirely moves the
bin ratio **0.648 -> 0.646**. The stated cause is not the cause.

Twice now a builder has confessed a defect and been wrong about it. **Check confessions as
hard as claims** — a self-reported failure is still a measurement.

**And check the justifications that survive into comments.** Round 13's `light.js` says the
lamp diffuse term stays because "it is what the specular hangs off". That is false — the
specular debug channel is byte-identical with `lampGain` at 0.45 and at 0.00. A wrong reason
written above working code is how the next round talks itself out of a correct change.

## The backtick will also eat your report.py note

Fifth incident of the day, and this one was the lead's, in a shell command rather than a
source file. `report.py --note "... gating on `inside` is the physics ..."` inside DOUBLE
quotes runs `inside` as a command. The note filed with the word silently missing:

    "gating on  is the physics"

No error, no truncation, just a hole where the identifier was — and `command not found:
inside` scrolled past above a line that said `store r14 filed`, which reads like success.

**Use single quotes for `--note` and `--gap`, or drop the backticks entirely.** These notes
are the progress page and they are the only durable record of a round for anyone who was not
there. A note that lost its subject is worse than a short one.

The general shape, for the fifth time today: **a backtick is a live operator in three of the
languages used on this project** — JS template literals, Markdown, and the shell — and the
habit of quoting identifiers in prose collides with all three. `tools/check.py --watch`
covers the source files. Nothing covers your shell, so quote deliberately there.

## `tools/check.py` now also resolves imports — because syntax was not enough

`node --input-type=module --check` validates **syntax only**. It cleared a `src/game/sight.js`
that the browser then refused, because `game.js` imported a name `sight.js` did not export.
A whole-page failure the syntax gate is structurally blind to.

`tools/check.py` now runs a second pass resolving every relative named import against the
target module's exports. It stays deliberately silent where it cannot know — namespace
imports (`import * as ns`), bare specifiers (`'three'`), and any target carrying `export *`.

**Two false alarms while building it, both worth knowing because they are generic:**

- `export const CW = 5, CH = 7, ADV = 6;` declares **three** names. Matching only the first
  reported `font5x7.js does not export CH_H` on a healthy tree.
- A greedy `(.*)$` with `re.DOTALL` swallows the rest of the file, and `finditer` cannot
  overlap — so only the **first** `export const` in each module was ever seen, producing a
  second wave claiming `config.js` exports nothing at all.

A checker that cries wolf gets ignored, which is worse than not having one. **Test a new
guard in both directions against the real tree before trusting it**: it must fire on a
synthetic break AND stay silent on a healthy build.

## Pose is 150x the noise. A single-pose figure is not restatable.

Whole-frame blown % on ONE unchanged build reads **0.472 / 1.203 / 1.533 / 1.411** across
four aisle poses — a 3.2x spread — while a 12-frame control at one pose spreads **+/-0.010**.
**The pose is 150x the measurement noise.**

The consequence is not "be careful", it is that two honest agents will disagree and both be
right: round 11's builder measured a blade sign at 7.8% of blown pixels on aisle 7 and its
critic measured 41.1% on its own aisle-7 framing. Their *reference bands* agreed to the third
decimal, which is the check that they held the same instrument. **Whether a lens run or a
printed sign is the largest blown blob is close to a coin flip depending on where you stand.**

**So: publish the camera for every pose-sensitive number, quote a set of poses rather than
one, and if you and another agent disagree, compare your reference bands first — if those
agree, the disagreement is framing, not method.**

## The overlay trap in an ID render

Classifying pixels by re-rendering meshes in flat ID colours is the right way to attribute
blown pixels to store nodes — it beats any band or box. But `lightBloom` is an **additive,
`depthWrite:false`, `renderOrder:5` halo card covering far more area than the fixture it
belongs to.** A naive material swap makes it opaque, and it then claims every ceiling-tile
pixel under the halo as LAMPS — **inflating the exact statistic the round is judged on.**

Round 11's critic excluded all seven non-depth-writing overlays so a pixel's class is the
opaque surface that owns it, which made its lamp shares **conservative against its own
conclusion**. That is the direction to bias in. Assert **zero UNKNOWN and 100% frame
coverage** before trusting a single number off a class map, and prefer exact node names plus
anchored family regexes to prefixes — `light*` swallows both `lightLenses` and `lightBloom`.

## Count the conditional taps too

Round 10 said 12 texture fetches, round 11 said 11. **12 is correct.** The difference is the
macroblock tap, which sits inside `if (uBlocky > 0.0)` — and every shipped preset (wall 0.26,
spot 0.09, floor 0.13) and all nine channels have `blocky > 0`, so every pixel pays it. A
count that silently excludes conditional work is not a budget. (For reference, the committed
bundle still carries 13: the extra is the half-res chroma point sample round 8 replaced.)

## THE BLIND TEST DOES NOT TURN ON THE STATISTIC WE HAVE BEEN OPTIMISING

Rounds 12, 13 and 14 of `store` each chased a colour/lightness statistic — product chroma,
then shelf-face illumination, then the chromatic body's L\*. Each round moved its number.
The blind A/B went **12/12 -> 35/36 -> 36/36**. It got *worse*.

Round 14's critic named the cue it was actually calling on, and none of it is lighting:

1. **Generated package copy that is legible and CATEGORY-INCOHERENT** — "PENNYWHISTLE
   MARINARA SAUCE / KETTLE COOKED FOR EXTRA CRUNCH". A human reads one facing and knows.
2. **Bilateral symmetry of the two shelf runs.**
3. **The distant floor reading as one continuous mottle**, where `store_03/07/12` resolve grout.

**This is the most important thing in this file.** A measurable statistic that is out of band
is a real defect and closing it is real work — but *it is not automatically the thing that
gives the render away*. Three rounds of correct, careful, well-measured optimisation did not
move the bar, because the bar was being decided somewhere else entirely.

**So, before you optimise a number: ask a blind critic what it actually called on.** If the
cue and the statistic are different things, the statistic is maintenance and the cue is the
round. Report both, and say which one you are working on.

## Two failure modes in a builder's own reasoning, both found this round

**1. A lever retired against the wrong baseline.** Round 14 killed "product-only lift x2.0"
for reaching only %chr 27.88 — and then **shipped a build that reaches 26.09**. It judged the
lever against the *photograph* and the shipped work against *nothing*. A lever that beats what
you shipped is not a dead end, whatever it fails to reach. **Price every rejected lever
against your own baseline as well as against the target**, and the physical version of that
same lever turned out to close **80% of the median gap with the ceiling untouched**
(+0.000 L\* against exposure x1.35's +7.8).

**2. A claim inside its own noise, reported as a result.** Round 14's headline median gain was
**+0.41 +/- 0.57** across six poses — indistinguishable from zero. Its %chr and p25 gains were
real (+1.31 +/- 0.49 and +1.30 +/- 0.29, both 6/6 poses). **Quote the spread with every
paired statistic**, and if it straddles zero, say so instead of quoting the mean.

## Validate the codec control by encoding TWICE

Round 14 reported that pushing the render through the references' q87 4:2:0 encode moves the
median "under 1 L\*". Its critic measured **+1.98 median and +4.36 p95** — and then showed why
the control was mis-read: re-encoding an **already-q87 photograph** moves the median +0.095,
and the render's **second** encode moves +0.18. The large first move is a one-time PNG->JPEG
transition **the photographs had already made and the render had not**.

Consequence: measured symmetrically, **p95 and %>L\*80 do NOT already agree** — 80.38 vs 77.49
and 5.21 vs 2.97. **The bright end is hot, not level**, which removes the premise that killed
every global lever at once.

**If you push one side through an encode to match the other, encode BOTH sides once more and
check the second pass is small. A first-transition artefact is not a codec correction.**

## Ship an instrument, then READ it

Round 13 shipped a phantom un-learn, and shipped `sightLedger()` publishing `sweepPct` to
measure it. **`sweepPct` reported 0.0 on every run.** Across 9 bench shifts and 20,356 belief
frames the mechanism **never fired once** — `b.dry` peaked at 0.38 s against its own 2.0 s
latch, because every CONTACT frame zeroes it and a chase re-acquires contact every few
hundred milliseconds.

The damning part: `updateSight()`'s own comment says the **rejected earlier draft** died of
exactly that — *"oscillating around 0.1-0.3 s and never reaching the 2.0 s clock"*. The
shipped fix (stop bleeding `dry` off) **did not remove the mechanism, it renamed it**. And the
number that proves it was on the round's own result object the whole time.

**Two rules out of this.** If you build an instrument for your feature, **quote its reading in
your report** — a feature whose own telemetry says 0.0 is not shipped, it is written.
And when you reject a draft for a named failure mode, **re-check the shipped version against
that same failure mode by name** before claiming it is fixed.

Related, same round: the un-learn was also **gated out of the frames it exists for**. All 197
frames with belief error > 5 m — and all 84 over 10 m — are non-fleeing, so the
`if (fleeing && ...)` guard meant the falsifiers could never reach the 24.5 m markers.
**Check that your guard admits the population your feature is for.**

## A guard against the failure you had is not a guard against the failure you get

Round 13's evasion probe fires correctly under injection and is genuinely discriminating —
verified. But it only catches an **always-true** predicate, i.e. under-blocking. **The failure
that actually happened in that round was over-blocking**: a pad-at-the-endpoints draft that
scored *below* the predicate it replaced. There is no guard for that direction at all.

**Assertions tend to get written for the bug you just fixed.** Ask which way the *next* one
could go, and whether anything would catch it.

## Calibrate the uncertainty you print, not just the coverage

Round 13's COLD marker keeps its promise — the true position lands inside the printed radius
on 99.8-100% of frames. But the **printed radius is 5-8x the actual error** (11.1-14.9 m
printed against 1.3-2.9 m real), and **BEARING GONE fires on 30-60% of COLD frames while the
marker it is disowning averages 2.9 m from the man.** The retirement threshold is computed off
that same inflated spread, so it inherits the miscalibration.

**Coverage and calibration are different claims.** An interval that is always right and
always huge is not honest uncertainty — it reads as the game withholding, which is precisely
the complaint the round set out to fix.

## THE ROLL TRAP: the control every round has run cannot see the biggest term

The grade carries a **roll band with `rollSpeed: 0.040` — a 25 SECOND period.** Whole-frame
blown % is therefore a function of `uTime mod 25 s`. One unchanged build, aisle 3, 25 samples
across a full period:

    bloom 0    0.154 -> 0.774     swing 270% OF ITS MEAN
    bloom 12   2.007 -> 2.499     swing 23.5%

**A 6- or 12-frame control at 1/60 s samples 0.2 seconds of a 25 second cycle** and duly
reports +/-0.010. Every round on this piece has quoted a control of that shape and called it
the noise floor. **It is a GRAIN control, not a variance control** — and the term it cannot
see moves the bloom-0 baseline that is the denominator of every "added by the bloom" figure.

**What to do:** ablate `roll` to 0 for any A/B on a graded capture, or sample a full 25 s
period. Round 12's numbers are all roll-ablated on one page load. It lost a measurement to
this before finding it.

**Blast radius, checked:** `snapClean(..., {storeOnly:true})` calls `renderer.render()`
directly and never touches the grade, so **store's clean plates are unaffected**. Anything
judged on a GRADED frame — all of cctv, and any game HUD capture over the floor view — is.

## An assertion that was silently broken while its numbers were right

Round 12's class-map exactness audit read **54%** until it noticed three.js was treating its
ID colours as linear-sRGB and returning 188 where it wrote 128. **The classifier had been
correct the whole time** — it matched by nearest palette entry — so the *numbers* were fine
and the *assertion guarding them* was quietly meaningless.

That is the worst shape a broken check can take: it does not fire, it does not fail loudly,
and the work it is supposed to protect happens to be right, so nothing draws attention to it.
**An assertion that has never fired is not evidence of correctness — test it by breaking the
thing it guards.** It now throws instead of returning a number.

## A fix can create the conditions for the next bug

Round 11 replaced a bloom selector that thresholded the blurred tap average with a
threshold-each-tap-then-average kernel. **That was correct.** But the per-tap form required a
gain compensation — 12 rather than 1 — and that gain is **only valid where the taps are
sparse**. On a large flat source every tap equals the centre, the kernel **degenerates to the
identity**, and `col += uBloom*s*col` becomes a pure x(1 + uBloom*s) multiply: x2.6 across
148,334 pixels of printed card.

So the fourth appearance of the Jensen bug class in that file was **caused by the fix for the
third**. When a change requires a compensating constant, state the regime the compensation is
valid in, and check the regime where it is not.

## THE CUE IS SEMANTIC. STOP HUNTING A NUMBER.

Blind A/B on `store`: **12/12 -> 35/36 -> 36/36 -> 36/36**. Round 15 attacked all three cues
the round-14 critic named — package copy, bilateral symmetry, distant floor — did real,
verified work on all three, and **the score did not move.**

Round 15's critic then named the cue and, crucially, **tried to reduce it to a statistic and
failed**:

    flat-field fraction   separates the distributions 5x   ...classifies 24/36
    colour richness       distinct 5-bit colours/window    ...classifies 25/36
    the critic's eye                                       ...36/36
    chance floor                                           ...18/36

**Neither statistic is the cue.** Its conclusion, and it is the most useful sentence handed
to this piece so far: *"The call is semantic, not statistical. Stop hunting a number."*

**What it is actually calling on: the render contains no depicted real-world object.** Eleven
of eighteen render calls came off a hanging sign or promo tag whose *categories were correct*
— what gave them away is that they are the store's own template grammar as flat matte vector
type. The other seven came off facings: type on flat colour plus one repeated plated-food
oval. **Every photograph call came off recognising something real** — a named brand, an Epson
printer, a human face, an actual peach.

**The general lesson for every piece here:** a frame-wide statistic can be out of band and
worth fixing, and still not be what a human is deciding on. When three rounds move their
numbers and the blind score does not move, **the statistic is not the bar** — ask the critic
what it recognised, not what it measured.

## Enlarging a pool is not the same as fixing it

Round 15 replaced a global copy pool with 44 class-scoped pools and the contradiction rate
did not go to zero — it went from department-level to class-level. **36 of 44 classes hold
more than one distinct product, and 132 of 140 SKUs share all six copy bands with a different
product.** 200,000 sampled draws against 40 declared rules: **27.4% of facings carry at least
one contradiction.**

    RAPID RELEASE - COUGH SYRUP - PAIN RELIEVER / FEVER REDUCER - 100 COUNT - NON DROWSY
    PRE-SIFTED - PURE CANE SUGAR - RESEALABLE POUR SPOUT - NET WT 2 LB - 100% WHOLE GRAIN
    SEEDED - HAMBURGER BUNS - 20 SLICES PER LOAF

And `copyCheck()` — the assertion written to prevent exactly this — **returns `[]` and cannot
see one of them**, because it asks whether a SKU has a class and never whether a band fits
the SKU. That is this brief's own "assertions get written for the bug you just fixed",
arriving one round after it was written down.

## An eighth metric retired for its measuring box

The distant-floor mid/near fine-structure ratio reproduces the builder's figure **exactly**
(0.358 vs 0.359) — but only by reproducing its *box*, not its build. With floor-only boxes
the same frames read **0.235 / 0.184 / 0.295**, because the near box reached over a wooden
endcap base and halved its own denominator. **Sliding the mid box 120 px in y swings the
statistic 0.031 -> 0.242.**

And the premise was weaker than assumed: `store_05` — the down-aisle photograph closest to
the render's own pose — has far-floor fine structure of **0.008** against the render's
0.022-0.026, i.e. the *more* continuous distant floor. `store_12`, the stated target, is
polished terrazzo with essentially no grout in the mid-ground.

## A guard that asks for the negation of its own precondition

Round 13's belief un-learn never fired. Its critic diagnosed the cause as the 2.0 s clock
being zeroed by re-contact. **Round 14 instrumented it instead of accepting that, and the
stated cause was wrong.** Across 61,832 frames on the r13 build:

    falsifier held clear      611 frames
    belief OCCLUDED        24,273 frames
    out of range               88 frames
    clock zeroed by re-contact 48 frames     <- the diagnosed cause. A rounding error.

40:1 blocked-versus-clear. **The real fault was structural: the LOOKED falsifier asks for a
clear sightline to the belief — but the belief sits ~1.2 m from the man, and you are in that
branch precisely because the man is occluded. It asks for the negation of the condition that
creates the state it runs in.** Proof the clock was never binding: with the old gate in place,
quartering the dry clock to 0.5 s still produces **zero** latches.

**Look for this shape.** A guard whose condition can only be true when the state it guards
cannot be is not a rare bug — it is what happens when a predicate is written from the outside
looking in. And note the round changed **one** variable (the gate) once it knew, rather than
the two the diagnosis implied.

It also corrected the critic's population claim: the high-error frames are **not** "all
`flee === 0`" — they run 36-57% non-fleeing.

## `eval.run()` non-determinism — CORRECTED: it is the carried-over RNG stream, not the run

**Round 15 found the actual mechanism and it is recoverable.** After a **page reload with a
fixed seed order**, `eval.run()` is **byte-identical across two pools**. The non-determinism
reported below is the **agents RNG stream carried over between runs in one page**, not the
harness itself — and round 15 used that recovered identity as a *control*, proving its HUD
edits were game-neutral because every game-side statistic held byte-for-byte while the HUD
numbers moved.

**So: reload the page and fix the seed order, and you get a determinism you can build a
control on.** Without that, the spread below is what you get.

## (Original entry, still true when the stream is not reset)

Same config, same seed, same build, run twice: **3,849 vs 12,385 frames**, and
`coldCoveredPct` read **59.6 then 93.4**. Every figure taken from `eval.run()` must be
**pooled across reps**, and a single run of it is not evidence of anything.

This is the third instrument on this project whose spread exceeds the effects people were
reading off it (after the roll trap and pose dominance). The pattern is consistent enough to
be a default: **measure your instrument's run-to-run spread before you quote a delta through
it.**

## A ratio quantile is not a coverage

Round 14 sized COLD's uncertainty radius by reading p95 off a drift-**ratio** histogram and
got **91%** realized coverage, not 95 — because age and drift correlate, so the p95 of a
ratio is not the p95 of the product. It found this, fixed the sizing, and replaced a
documented "93-97%" with the measured band **91% (82-98 by seed)**.

**Calibrate against the quantity you are promising**, not against a proxy that shares its
units. And when you publish an interval, publish the *realized* coverage from a pooled
sample, not the quantile you sized it from.

## Validate a threshold across the axis it will actually be used on

`bloomThr 1.27` was chosen from four poses that **all shared the same camera distance**
(z = −11.6). It is correct there — lamp:card selectivity **40x**. Swept over distance in the
same aisle it collapses:

    z = -6      156x        z = -15     1.9x
    z = -11.6    40x   <-   z = -16     0.82x   INVERTED
    z = -18      11x

The mechanism is that `signMat`'s fresnel glare grows as a blade sign turns edge-on with
distance: BLADE p99 climbs **1.1262 -> 1.3135** while LENS p90 falls **1.4670 -> 1.0640**, and
they cross. The round priced that glare at "0.01% of the class" **from poses that could not
see it**; at z = −16 it is 2.9% — **290x the price paid**.

**The round's own shipped check already flagged it** — `bloomSeparation()` returns both
margins negative at z −15/−16/−17. **Sweep a threshold over the axis that moves the
populations, not the axis that is convenient**, and when you ship a live check, run it across
that axis before you publish the constant it guards.

## Centroid-y was a proxy, and it fails in both directions

The claim "no reference photograph's largest blown blob sits in the 0.22-0.32 band" is
**false** — `store_01_Langenstein_s...` sits at **0.266**, kernel-invariant. It happens to be
a fluorescent tube, which *strengthens* the underlying thesis and *destroys* the proxy. And
from the other side, a z = −20 render pose puts a **SIGN** largest blob at cy 0.026 — dead on
the reference median.

**The class label the ID render already produces is the statistic that separates.**
Centroid-y was the weaker measure and it was the headline. When you have a direct label,
do not lead with a geometric stand-in for it.

## A trap's own write-up can go stale in the round that fixes it

The roll trap's published figures — bloom-0 swinging 270% of mean, bloom-12 only 23.5% —
are the **r11 dials**. The **shipped r12 build swings 90.3%**, i.e. **3.8x more
phase-sensitive**, because removing the large flat blade population left a smaller and more
phase-sensitive denominator. Both `src/cctv.js` and `src/cctv/probe.js` quote the r11 pair in
their trap sections, so anyone reading them **under-estimates the trap for the build that
just shipped.**

**Re-measure a hazard write-up against the build that ships with it.** The number that made
the trap visible is not automatically the number that describes it afterwards.

## The wall has no live check, and its comment predates two changes

Measured at last: `LENS` is absent from **all nine wall feeds (n = 0)** — the domes at
y 2.5-3.6 never frame a troffer, so the bloom cannot favour a lamp that is never in shot.
Round 11's "SIGN 0.0%" was right **for a reason nobody had stated.** The latent risk is real:
BLADE sits at 61-75% inside the selector on CH03/CH06/CH07 (flat-source multiply x1.25-1.42)
and p90 1.26-1.28 — **a store round that lifts sign brightness ~20% pushes them over.**

The floor has `bloomSeparation()`. **The wall has no live check, and its preset comment cites
a round-11 measurement that predates both the kernel and the gain change.**

Worth knowing for its own sake: 88% of the wall's bloom lift is **CH09 alone**, and its blown
surface is front-door daylight through the storefront glazing — the bloom doing exactly its
job, on the single most characteristic artefact of real store CCTV.

## The fix was already in the file, 1,360 lines above the bug

Round 14's new FOOTSTEPS banner **overprints itself by a deterministic 28.6 px** and the
character it destroys is the **negation**: the player reads
`FOOTSTEPS — SOMEONE JUST RAN, CLOSE[BY/NOT] IN SIGHT`. The one new player-facing channel of
the round renders **the opposite of its meaning on every firing**, on 3.7% of floor frames.
No seed, pose or frame dependence — pure layout arithmetic.

`src/game/hud.js` already contains the fix, **1,360 lines above the bug**:

    // Width of a string as tx() will actually draw it. ctx.measureText does NOT
    // account for ctx.letterSpacing, which is how the round-9 alarm chip first
    // shipped with its countdown printed on top of the word VESTIBULE.
    function advance(str, size = 12, wt = '', ls = 0.7) {

**The banner never calls it.** This is the same shape as the `shaders.js` backtick warning
that sat 130 lines from where four agents then put backticks — and it is now the second time
a warning failed to travel *within a single file*. **A helper written to prevent a bug does
not prevent it; a helper that is CALLED does.** If a correct-width function exists, every new
text box uses it, and the check for that is grep, not memory.

## A guard blind exactly where the thing it guards matters

`openPairs` — the over-blocking probe built last round — is **blind below 1.156 m by
construction**, because the shipped exemption and the rejected draft are *algebraically
identical* above `pad/0.45`. The shortest pair in either probe set is 1.5 m, and **0 of 264
pairs** can separate them. So the fractional-cap draft — **the over-blocking bug the file
documents at greatest length** — scores **0/208 and 0/56, passing both probes perfectly**.

Extend the same family downward and the difference is enormous: **56 of 64 pairs blocked at
0.4 / 0.6 / 0.8 m** that the shipped predicate clears; zero difference at 1.0 m and above.
**The blind band sits entirely inside the 1.15 m catch radius — the guard stops looking at
the arrest.**

**Check that your probe set spans the range where the predicate decides something.** A guard
validated only where two implementations agree is a guard that cannot fail.

## Score the promise the UI actually makes

A critic reported COLD coverage at **37.7%** and nearly filed it as the headline defect —
before noticing that 594 of those frames **print a diamond and no radius at all**. It was
scoring a promise the HUD does not make. Decomposed properly:

    ring drawn, not swept   8,031 frames   98.0% covered
    ring drawn, swept         407 frames   80.6% covered   <- the real defect
    diamond (no radius)     1,177 frames   n/a - no claim is being made

**Where the interval is actually printed it holds 98.0%**, so the round's published 91% was
*pessimistic*, pooling in frames that make no claim. The genuine bug is row two: `bearing`
never consults `b.sweep`, so the dashed ring is drawn at full spread **while the readout says
NOT WHERE I LOOKED** — two contradictory claims in one glance. That is the identical bug the
round fixed one state over (*"`lost` HAS TO SILENCE THE ARROWS TOO"*), reintroduced for
`swept`.

## Two more harness traps

- **A timed-out `javascript_tool` call does not stop the page.** A 6-rep job that exceeded the
  30 s limit **kept running**, and two `eval` loops then interleaved on the same game object,
  the same `FIX` and the same accumulator. Every number from that batch had to be thrown away.
  **Run one rep per call behind a busy-guard.**
- **`eval.run()` non-determinism confirmed again and worse:** same seed, same build,
  **7,928 vs 10,959 frames**. Pool everything.

## Measure what the camera can REACH before deciding a pose set is representative

Round 12's `bloomThr` was validated at four poses that shared one camera distance, and its
critic found selectivity inverted at z = −16. Round 13 then measured **what the chase camera
can actually reach**, off the rig rather than assumed: driving the cop down aisle 3, camera z
runs **−18.9 (it clamps against the front wall) to +9.45**, continuously — and **the inverted
stretch is where the player stands when they step onto the floor. They walk through it every
time.** The four validated poses sat 4.4 m past it.

**A pose set is not representative because it is varied. It is representative because it
covers the band the player's camera occupies** — which is a measurement off the rig, not a
judgement.

## When no threshold exists, change the operator, not the constant

Round 13's stronger finding: at z = −17, −16, −15 and −2 the interval
`[printed p99, lens p90]` is **empty**. No scalar threshold separates the populations,
**including a per-pose optimal one**. Tuning the constant harder could never have worked.

The fix was to notice the threshold was doing **two** jobs — choosing what haloes, and
stopping a flat surface from multiplying itself — and that only the second eats a numeral.
A source flat over the kernel has every tap equal to its centre, so the kernel degenerates to
the identity. The shader now subtracts what the centre would contribute to its own
neighbourhood: on a flat source `h == hc` bit-for-bit and the term is **exactly zero at any
brightness**. In its own words: **"a glare can fake amplitude; it cannot fake a gradient it
doesn't have."** Zero extra texture fetches.

**When two populations overlap on the axis you are thresholding, look for an axis on which
they cannot overlap.**

## Naming the limit that is not yours to fix

Round 13 states its honest half plainly: at z −17/−16/−2 the largest blown blob is **still**
a blade on both kernels, because **the troffers are dimmer in the raw buffer (p90 1.02-1.08)
than the printed numeral (1.2383)** — the camera cannot frame ceiling nearer than 18.3 m, so
**no luminance-domain selector of any shape can separate them.** It names two ways out, both
outside its file (store.js's lamp emissive, or an emitter mask channel) and files neither as
a blame.

That is the shape to copy: **prove the limit is structural, state where the fix would have to
live, and do not reach across the boundary** — this piece got that wrong in round 8 and right
in rounds 11 and 13.

## A bug kept deliberately, with the reason written down

Wall and spot ship the OLD kernel (`bloomLocal: 0`) **on purpose**: the flat self-multiply is
what makes CH09's front-door daylight blow, and switching it off costs that feed
**2.2257 -> 0.0799, 28x**. The uncomfortable part is stated in the file rather than hidden —
**daylight tops out at 1.0287 raw, dimmer than the printed card, so the wanted artefact was
being produced by the bug.** What keeps it safe on the wall is **size** (a blade is 16-198 raw
texels), not brightness.

Keeping a known-wrong mechanism because it produces a wanted result is legitimate **exactly
when the reason and the safety margin are written where the next person will change it.**

## When luma cannot separate, look at a channel you are already sampling

Round 13 proved no scalar **luma** threshold separates lamp from printed card, and concluded
*"no luminance-domain selector of any shape can separate them"* — filing the fix as store's.
Its critic tested a second axis and the claim is **false**. `(R−B)/L` — a ratio of three
channels **already in registers, zero extra fetches** — is strictly dominant at **9 of 9**
poses: more lamp than the shipped gate, and **0.000% printed card everywhere**.

The physical grounding extends the round's own reasoning: **an emitter shows its own SPD; a
reflector shows lamp SPD x albedo, so it cannot be COOLER than the light that lit it.** A
glare can fake amplitude, it cannot fake a gradient — and it cannot fake a colour temperature
below its source.

It also frees a constant the file had declared immovable (`"IT CANNOT BE PUSHED"`): with a
chroma gate, `bloomThr` comes **down** to 1.15 with the numeral untouched by construction —
BLADE chroma p01 is 0.1635 (0.000% below the gate) against LENS at 99.811% below it.

**Before concluding a separation is impossible, enumerate the channels you already have.**
And note the shape of the error: the conclusion (the limit is real at three poses) survived,
but **the stated reason was the sentence a future round would have read before deciding not
to touch the file.**

## Prove a structural limit by ablating to zero, not by comparing populations

The critic proved the same limit far more cleanly than the round did. With the bloom switched
off **entirely**, at the three contested poses the blade is **already the largest blown blob**
(z −16: BLADE 162 px, LENS 1 px). **No bloom-side selector of any kind can flip a class the
bloom is not producing.** That is a one-measurement proof, and it lands the fix in the same
place without resting on a comparison that turned out to be wrong.

## Sometimes the metric decides, not the render

At z = −17 the shipped bloom already makes LENS **the larger class by total blown area**
(393 vs 309) and loses the headline only on **connectivity** — one edge-on blade is a single
263-px sliver, while a distant troffer row is many small blobs. **"Largest blob" and "largest
class" disagree there, and the verdict is a property of which one you chose to report.**
When a result flips between two defensible summaries of the same pixels, publish both.

## Two published derivations found wrong in passing

- **`warp.js`'s own doc comment**: *"At the corners both fall to 1"* — measured, tangential is
  1.000 and **radial is 0.8184**. A published derivation wrong for half its output.
- **A wall comment's "284x160 per feed"**: CH09's raw is **640x360**, 2x the aisle feeds.
- And an attribution that is right about the number and wrong about the label: CH09's blown
  surface is documented as "front-door daylight through the storefront glazing", but the class
  carrying it is **SHELLOTHER** — unmatched store mesh, 84.5% of the feed. `FRONT` clears the
  threshold **0.000%** of the time. **A number verified by measurement and a label assigned by
  eye are two different claims; do not let the first vouch for the second.**

## Grep finds the sites you can name. An ink ledger finds the ones you cannot.

Round 15 fixed the FOOTSTEPS banner and then audited every text box in `hud.js`: **eight
sites did not route through `advance()`**. The worst is `stamp()` — `measureText(text).width
+ 34`, drawn at `ls: 3`, i.e. **literally the bug `advance()` was written to prevent**, with
the padding gone past 11 characters. Another guessed the COLD readout at 7 px against a real
11 px bold advance — **and round 14's canvas clamp was sized off that guess, so the error
propagated.** One measured `lbl` and drew `lbl + ' ▶'`.

**Grep found all eight. It could not have found the next class**, so the durable deliverable
is an **ink ledger**: every drawn string's real box recorded on the census frame the harness
already renders. **81 -> 21 collisions across 574,958 strings over 7 seeds.**

It caught a second word-destroying erasure nobody knew about — `LAST SEEN 7.4s ±11m`
rendering as `◀ DOOR 1] 7.4s ±11m` — where **both boxes were correctly measured** and they
collide only because **two elements clamp independently to the same edge.** No width audit
can find that; only drawn-box bookkeeping can.

It also caught **its own regression**: adding a top clamp to the bracket label took overprints
**25 -> 261**, because a clamp does not find free space, it finds the panel that is already
there. Reverted, with the negative result published above the line.

**Measure what is actually inked, not what you believe you asked for.**

## Guard the guard's coverage, not just its verdict

`openPairs` was blind below 1.156 m, so the over-blocking draft scored **0/208 — a perfect
pass**. Extended to 0.4 m it scores **252/592**. The durable half is that `sightCheck()` now
asserts the probe set's **span**, so trimming the distance list **fires the guard**. A probe
whose coverage can silently shrink is a probe that will eventually pass everything.

## Do not answer a question about play with an oracle bot

Round 15 measured the door panel's half-store spread properly — `you − him > 10 m` on
**59-87% of frames in the last 2 s** of a run, and verified the panel is **not exaggerating**
(the same statistic off the man's true position is byte-identical there, because the front of
the store has no occluders, so the belief *is* the man).

And then refused to draw the obvious conclusion: **`routeOf()` plans from `t.position` — a
full oracle** — and its catch rate reads 16.7-42.9% across pools, against a human
hand-playing at final gaps of 0.8 / 0.8 / 1.9 / 2.3 / 3.3 m. Its words: *"I will not quote the
oracle bot's ~10 m escape gap as an answer about play — that is the harness hole, not a
finding."*

**The HUD faithfully displaying a losing race, for a driver that cannot play, is not evidence
the game is losable.**

## An assertion can guard the wrong STAGE of the pipeline

Round 16 wrote **82 motifs and assigned one to each of 140 SKUs**. `depictCheck()` asserts
every SKU has a motif and every motif has a SKU, and **passes at 100%**.

**30 of 81 motifs reach a shelf. 51 never appear anywhere** — including **three of the four
the round leads with**: `peachHalf`, `spaghetti` and `toothpaste` are all never drawn. The
cause is one line elsewhere: `ATLAS` in `pack.js` is **48 hard-coded cells, baked once**, and
44,853 package instances draw from those 48 artworks. **The assertion never asks whether the
SKU is ever BAKED**, so it certifies a table while 63% of the work does not ship.

**Assert against the artefact the player sees, not the table you authored.** Every check on
this project that has failed silently — `copyCheck()` twice, the class-map exactness audit,
this one — failed by guarding an earlier stage than the defect.

The same shape one surface along: the signage gating verifies perfectly **as a grammar**
(`PLUS DEPOSIT` 11.45% in soda, 0% elsewhere), but the store instantiates that grammar **32
times**, and **seven of the eight gated strings have zero instances in the shipped build**.
"Not suppressed — concentrated" is true of the distribution and false of the store.

## An auditor in which no rule fires is measuring its rule set

Three independent contradiction auditors reported **27.4%**, **35.64%** and **11.66%** on this
piece. Round 16's critic resolved the disagreement rather than picking a number: **all 45 of
`copyaudit.mjs`'s rules never fire**, and it traced the one nominal overlap to a gate —
`form.floz-on-dry` keys on a **food-noun list**, so it structurally cannot see
`DISINFECTING WIPES — 46 FL OZ`. **The 0.00% is real for the axis it measures**, and the axes
simply differ.

**Before quoting a rate, report how many of your rules ever fire.** And the critic killed one
of its own first: 100% of its "food language on non-food" hits were `RESPONSIBLY SOURCED
FIBER` on bath tissue, where FIBER is paper fibre. **Its rule was wrong and the build was
right** — and that rule staying silent across 200k draws afterwards is *positive evidence*
the gate works.

Its sharper number is the one to carry: **3.04% of facings contradict themselves in
display-size type** — `RISING CRUST / FISH STICKS`, `ORANGE MARMALADE / GRAPE JELLY` — in the
two largest pieces of type on the pack, while `copyCheck()` returns `[]` because that is a
different axis from tag conflict.

## A blind protocol that leaks its own balance is not fully blind

Round 16's critic scored 36/36 — and then reported this against itself: *"I re-examined tile
31 because my running count stood 19R/17P. The flip was on evidence... but I would not have
looked again without the imbalance."* A test with a known 18/18 split leaks information
through the tally.

**Randomise the split, or do not tell yourself what it is.** Two of its calls also carried
contamination because it had read the builder's facing sheet before the test — it reported
both.

**And a first-glance score is worth recording separately.** It called **31/36 at a glance**
and only recovered four render tiles at 2x magnification. That is the first movement on this
piece in four rounds and **it is invisible in the 36/36.**

## `git checkout HEAD -- <path>` IS DESTRUCTIVE HERE. IT IS NOT A REVERT.

HEAD is far behind the working tree. Measured today:

    src/cctv.js         HEAD  83,971 B   tree 200,555 B   (zero "ROUND 13")
    src/game.js         HEAD 136,999 B   tree 236,878 B
    src/store/brands.js HEAD   8,876 B   tree  92,443 B
    src/store/light.js  HEAD  53,543 B   tree  89,739 B
    ...16 files, ~516 KB of source

**And four files are UNTRACKED, so checkout cannot restore them at all:**
`src/cctv/probe.js`, `src/game/sight.js`, `src/store/depict.js`, `src/store/plan.js`.

This is not hypothetical. A builder ran it against its own file, put `src/cctv.js` back to
**round 7** on disk for about four minutes, and recovered only because it had made a copy
first. **Any graded capture another agent took in that window is the wrong build.**

**To get a baseline, read it — do not check it out:**

    git show wip-snapshot2:src/store/pack.js > /tmp/base.js   # read-only copy
    git diff wip-snapshot2 -- src/store/pack.js               # what changed

`wip-snapshot2` is a tag on a commit object containing the **entire working tree, including
all four untracked files**. It was created with a scratch index and touches neither HEAD, the
branch, the index, nor the tree. It is the recovery path if anything goes wrong.

**This is CLAUDE.md's own committing hazard, arrived at from the other end.** That file warns
that sweeping commits make `git checkout HEAD -- <their file>` stop reverting to a clean
baseline. The same thing happens when nothing is committed for long enough: the operation
everyone reaches for silently means "delete the last N rounds."

## A dominance table can be true in the wrong domain

Round 13's critic showed a two-term gate strictly dominant at 9/9 poses — more lamp entering
the selector, zero printed card. Round 14 implemented it and reported honestly that **the
headline does not survive the domain change**: at z −16 the gate more than doubles the LENS
share *entering the selector* (2.378 -> 5.080) while blown lamp pixels go **11 -> 9**.

**"A troffer at p90 1.06 has nothing to give a halo however certain the selector is."**

`clears%` is a property of the *selector*; blown pixels are a property of the *picture*. On
its own the warm cut was a card-side fix — it only became a lamp-side one once it freed the
threshold to come down. **State which domain a statistic lives in before you call it
dominant.**

## Read a coupled constant live; never transcribe it

Round 14 made a cross-file coupling explicit by reading the lamp colour off the live uniform
and **throwing** if it is absent — and that immediately caught a discrepancy a transcription
would have shipped: **`light.js` defaults to `0xfff6ea`, `store.js` passes `0xfff4e4`.** The
value it needed was not the one written in the file it came from.

## Typeset is not painted. The eraser is `fillRect`, not another string.

Round 15 built an ink ledger to end word-destroying overprints, and its slogan was *"measure
what is actually inked."* **It measures what is actually TYPESET.** What erases words in this
HUD is `ctx.fillRect`: the subject bracket paints `fillRect(cx-bw/2, cy-9, bw, 20)` — a 20 px
opaque plate reaching **15 px above** the baseline the ledger records — and the top band is
`1280x52` at alpha 0.93.

A plate-aware probe over 8,458 census frames: **94 erasures, 65 of them never named by the
shipped ledger**, including `SUBJ-05` **100% painted out**.

And the residual the round called "one class, a close subject high in frame putting its label
off-canvas" is **three on-canvas classes**, none of them that:

    24/35  bracket plate x `AISLE n`      DESTROYS A WORD - takes the top half of
                                          the one string the game exists to deliver
     5/35  bracket x `DISPATCHED TO`      leaves a bare `3` where `SUBJ-13` should read
     6/35  top band                       `SUBJ-05` dark-on-dark, unreadable

**When you build an instrument to catch a class of defect, enumerate every mechanism in that
class first.** Two rounds of width-measuring did not touch the mechanism that was actually
doing the damage.

Related trap the critic names: **opacity lives in the `rgba()` fill string, not
`globalAlpha`** — a naive `globalAlpha >= 0.8` test counts semi-transparent panels as erasers
and misses the opaque ones.

## `eval.run()` determinism has an unstated precondition: ZERO frames since load

The recovered determinism is real — reproduced **5/5**, same hash every time. But it holds
only with **no simulation frames stepped since page load**:

    pre-bench exposure          observer thieves / caught / points
    none                        4 / 3 / 495
    step(0)   <- what snap() does   3 / 3 / 374
    step(1/60)                  4 / 4 / 482
    run(0.5)                    4 / 4 / 482

**One screenshot before a bench moves every number in it.** It survived at all here only
because rAF is frozen in the browser pane (1 tick in 3 s even fronted). **Take your captures
after your benches, or reload between them.**

Better control, worth copying: `census:false` removes the entire HUD draw path in a single
run, and every one of 6,851 chars of game-side state comes back byte-identical — which makes
HUD game-neutrality **structural**, not merely empirical, since `hud.js` contains zero
`Math.random` calls.

## "Over as information before it was over as gameplay"

The sharpest design observation of the session, from hand-play. At the bolt the door panel
read `HIM 56.9 / YOU 59.0` — a 2.1 m race, genuinely tense. Four seconds later
`HIM 49.5 / YOU 59.8`, **and the chase was decided as information long before it was decided
as gameplay.**

An honest HUD that tells the player the outcome early is not automatically a better HUD. The
same round's tilde-and-dashed treatment (`GAP ~8m`, `SUBJ-08 ? ▶`) reads as honest rather
than withholding and is a clear win — **the door panel is the case where more information is
worse.** Worth a design decision rather than a default.

## Contract note: `agents.report` DOES NOT EXIST, and the caller is `main.js`

**Corrected.** An earlier note here said `agents.report()` "returns null". It is worse and the
direction was backwards: **`agents.report` is `undefined` — there is no such export.**
`agents.js`'s header documents `api.report({stamina, staminaMax, ...})` as something **agents
CALLS INTO game.js**. That is an outbound callback, it is correct, and it is live.

**It is `main.js` that is wrong**, calling `agents.report && agents.report()` at two sites
(`audio.update`, `chaseCam.update`) for a method that was never on that side of the contract.
The `&&` makes it evaluate to `undefined` silently, so both consumers receive `undefined` for
`report` on **every frame of the game**, and both guard (`audio.js` does
`const r = state.report || {}`). Nothing is broken; the line has simply never done anything.
`camera.js` already documents it at its own call site.

**Read cop telemetry off `cop.userData`.** LEAD ACTION QUEUED: either `agents` exposes a real
accessor and `main.js` calls it, or the dead call comes out — not both, and not by reaching
into `cop.userData` from `main.js`, which would be the same hazard one file along.

## Widening a random draw buys the square root of what you pay for

Round 17 widened the package atlas 48 -> 120 cells and found that **was only half the fix**.
Every cell called `copyFor(rng, dept, form)` — a **random draw with replacement** — so 48 cells
drawing from a 74-SKU pool land only **~38 distinct products**. Widening a sampler with
replacement gains roughly `sqrt` of the cells you add. A deterministic **coverage deal**
(`src/store/plan.js`) took motifs-on-a-shelf from **30/81 to 81/81**, nouns 40 -> 99, brands
31 -> 49, at **zero** extra draw calls or triangles.

Consolidating that decision also retired a convention written down in **three files** — and it
had already gone wrong: `FROZEN.idx` is 8 and `8 % 8 === 0`, so **every frozen case was
stocked with bakery-vocabulary packages.**

## "Baked is not placed" — the same lesson, one stage further along

Round 16's `depictCheck()` certified a table while 63% of its motifs never baked. Round 17
fixed that with `bakeCheck()` reading `CELL_LOG` — **and its first widened build passed
`bakeCheck()` at 81/81 while 8 of 18 bottle cells were dealt to departments that never shelve
a bottle.** `soySplash` and `sportBottle` were baked, verified, and **invisible**.

It took **three checks at three stages** — assigned, baked, and `shelfCheck()` reading the
**scene graph** — before the number meant what it said. **Each new assertion moved the defect
one stage downstream rather than removing it.** When you add a check, ask what the *next*
stage is and whether anything guards it.

## The metric would have chosen the sticker

Round 17 rejected two experiments that **scored better** than what it shipped:

- a filled photo window — fired on 110 of 113 cells, 86 of them dark: round 12's *"hole
  punched through the brand block"* arriving from the other side;
- fat rims at 0.058/0.030 scoring **0.499 against the shipped 0.472** — and looking like
  **sticker cutouts**.

Both are kept in the code with their numbers. **"The metric would have chosen the sticker"**
is the whole argument for looking at the thing as well as measuring it, and it is the same
finding as the blind A/B refusing to move while three rounds of statistics improved.

## A restore identity that only fires on the third bake

Round 17's ablation asserts byte-exact restore across **three** bakes, and that caught a bug
two would have missed: shared rim buffers grow and never shrink, only the sub-rect was
cleared, and **the final blit's fractional destination made its bilinear edge taps pull in
stale pixels from the previous atlas.** Its own words: *"Had I asserted only two bakes I would
have shipped it."*

Also found in passing: **`PKG_STOCK`'s comment says "filled with a THREE.Color". It is a
`Vector3`** — reading `.r` returns `undefined` and every decoded pixel comes out black. The
seventh published derivation on this project found wrong by someone measuring it.

## Effective alpha is `globalAlpha x the alpha in the rgba() string`

A naive `globalAlpha >= 0.8` filter for "is this rectangle an eraser" gets the answer
**exactly backwards**. On one desk frame the correct test separates **8 opaque plates from 61
translucent** ones; the naive test picks the wrong set. Parse the fill string.

And validate an erasure probe **on a known signal in three directions** before quoting it:
an opaque rect injected *after* the draw must fire (5/5 at 100%), the same rect at alpha 0.30
must not fire, and the same opaque rect drawn *first* must not fire. Bind it to the HUD's own
`ctx` inside the factory rather than patching the prototype, so it structurally cannot see the
CCTV wall or the offscreen composite.

## Ship the old layout as a dial, and the A/B becomes one page load

Round 16 kept round 15's layout reachable as `hud.bands('r15')`. Before/after is then **one
page load and one flag on a byte-identical scene** — 116/106 collisions -> 0/0 — with no
cross-build comparison, no reload, and no question about whether anything else moved. On a
project where three separate statistics have been wrecked by cross-load drift, **making the
previous behaviour a runtime option is the cheapest trustworthy control available.**

## The headline number degraded because the player did the right thing

The door panel was accused of resolving the chase too early: at the bolt `HIM 56.9 / YOU 59.0`,
four seconds later `HIM 49.5 / YOU 59.8`. Round 16 found **`YOU` ROSE 0.8 m because the player
ran at the man** — the number got worse as a *consequence of the correct decision*.

Its answer was **change the emphasis, withhold nothing**: every metre still prints, the dead
chip reads `NO CUT`, and `GAP` — the race that is still undecided — grows 13 px -> 19 px. It
also priced a boost in **metres (6.36 m) rather than as a speed**, after its first cut priced
it as a speed and **did not fire on its own motivating example**.

**When a readout looks pessimistic, check whether it is measuring the player's mistake or the
player's skill.** Those want opposite treatments.

## An exemption and a shell that cancel term for term

Found while making the `run` probe pairs fire: **a perpendicular `step` pair can never be
blocked by any pad**, because the end exemption is `pad` metres and the shell is `pad` deep —
the two cancel exactly. A probe family that cannot respond to the dial you are sweeping is not
a weak probe, it is a constant. Assert the **boundary** (here, half-gap), not merely that
something fired.

## The blind score is not the bar. RENDER DETECTION is.

Round 17 scored **33/36 first glance, 35/36 considered** — better than round 16's 36/36. It
moved nothing. **All three misses were real photographs called *render*. Render detection was
18/18 at first glance and 18/18 considered**, same as round 16.

**A photograph misread as a render does not help you.** The bar is *"someone shown your
screenshot next to a real store photo can tell which is the game"* — that is a one-sided test.
**Report render-recall separately from the total, every time**, and treat a falling total with
flat render-recall as no movement at all.

(Its persistent miss is a genuine compliment and worth recording: `store_03`'s real Publix
`CANDIES / CANNED FRUITS / SPAGHETTI SAUCES` blade over a cream wall, called render **twice**.
The signage grammar is now close enough to a photograph to fool a critic in that direction.)

**And it fixed the protocol flaw its predecessor confessed:** the render/photo split was
randomised over U[14,22] and never printed, so the running tally could not leak the balance.

**The semantic cue is closed.** Its words: *"Not once did I call a tile on copy semantics.
Round 15 concluded the render contains no depicted real-world object. That is no longer true,
and it is the round's real achievement."*

## Round packages: the sign of the statistic inverts against reality

**23.0% of every package in the store — 10,333 of 44,853 instances — is a lathe or cylinder**,
and the atlas cell wraps round a body of revolution so the print collapses into vertical
smear. Gradient anisotropy `mean|dL/dx| / mean|dL/dy|`, masks by **ablation** (disjoint,
overlap 0 px, all restores byte-identical):

    render round/box   1.490 +/- 0.372   6/6 poses > 1.0
    real photographs   0.730 / 0.783 / 1.033   <- BELOW their flat neighbours

**A real can is banded HORIZONTALLY** — label, rim, lid — so its anisotropy sits *under* a
carton's. The render's sits *over*. **Not one cylinder in the store carries a readable
wordmark, a rim ellipse or a lid**, and one lathe reads as a **green wine goblet**.

Two refutations the critic published against its own headline: its first instrument said round
facings carry **more** gradient energy, not less (so *"less ink"* is false — the defect is
**directional**, not quantitative), and **whole-frame anisotropy does not separate at all**
(render 0.706 median sits inside references 0.617-1.164). **The separation lives in the
within-frame class contrast, not the frame.**

## A metric clamped blind on 61% of its own population

Round 17 reported **13 of 113 cells regressed**. All 13 share one signature: `coverOff >=
0.3527`, i.e. **all of them sit at or above the `min(1, cover/0.35)` clamp** in the ink
formula, where added coverage contributes *literally nothing* and only a small p90 dilution
survives. **Remove the clamp and 113 of 113 improve**, mean +0.1473. **69 of 113 cells sit at
or above that clamp — the metric is blind to coverage on 61% of its population**, and the
round's own headline was pessimistic by roughly 3x.

**Check whether your metric saturates before you report a regression it produced.**

## Price a texture against the pixels it delivers, not against itself

The atlas widening was priced at 21.2 -> 50.9 MB. Two corrections:

- **Quoted at RGBA8 with no mipmaps, while all four atlases have `generateMipmaps: true`.**
  The machine-facing numbers are **67.9 MB** for the atlases and **132.1 MB** for the store.
  The round understated its own bill by a third.
- **A facing subtends 84-110 px on screen at its largest** (the rig cannot get nearer than
  ~1.5 m) **while the carton cell is 340 px wide** — 4x linear, **16x areal** oversampling.
  **The top mip of every package atlas is never sampled in play.** Sized to the delivered
  resolution, **all 120 cells would fit in less memory than the previous round spent on 48.**

The round bought cell **count** at full price while cell **size** was already 4x over.

## A throwing guard that samples one pose

`lampWarm()` throws if the warm cut loses its margin — and **defaults to a single pose**
(aisle 3, z −11.6), where BLADE cMin is 0.1630 and it prints a margin of **0.0130**. A
4-aisle x 16-z grid finds cMin **0.1542 at aisle 7, z −14**: the real margin is **0.0042**,
**3.1x tighter than the check announces**, and the check would not fire on the pose actually
closest to the cut.

Nothing is broken today (BLADE two-term is still 0.000% at 64/64). It matters because **at
`bloomThr` 1.15 the warm cut is the only thing keeping the aisle numeral legible** — without
it the glyph is not degraded, it is gone. **A gameplay-critical glyph resting on 2.8% of
headroom deserves a guard that sweeps the band, not a pose.**

**A guard is only as good as its sample.** If you ship a check, sweep it over the same axis
you were told to validate the constant over.

## "Rises at N of N" needs a PER-POSE null, not a global one

Round 14 reported whole-frame blown *"rises at 16/16, reversing two rounds of decline."* An
in-load null control (identical patches, same code path) drifts **0.54-6.01% relative** by
pose. Measured properly, r13 -> r14 **falls** at 3 of 16 aisle-3 poses and **9 of 46 overall**
— and at z = −4 it declines **18-21%**, 3/3 reps, two aisles, ~10x the null. That is a
systematic pose region, not noise. The round's own warm-cut-alone table already said the cut
takes blown *down*; **the two halves never got netted.**

Also: **"16 of 16" is 15 of 16.** At z = +9 the build has **zero blown pixels** — it cannot be
a LENS because there is nothing there — and **both published tables print 15 rows** while the
sentence above them says 16. Count the rows you printed.

**Largest-blob *size* is far tighter (±0.9%) and the *class label* was stable at every
repeated pose.** Prefer the label; it is what the bar is written in.

## Match your quantiles before you compare multiples

*"Printed BLADE x2.024-2.060 against daylight x1.684"* compares BLADE at **p90** with
daylight at **max**. Matched at p90, the daylight's multiply is **exactly 1.000**; matched at
max it is 1.684 against 1.787-2.060. **Every matched comparison supports the conclusion, so
the decision was right — but the number carrying it was not**, and the quoted range silently
dropped the one feed where the gap nearly closes.

## A metric whose direction is right and whose scale is meaningless

`glyphIoU` moved **1.000 -> 0.763** for a change that by eye is *"readable -> destroyed."*
The direction is correct; the scale carries no information. **Do not read severity off a
metric you have only validated for sign** — round 14's critic refused to make a legibility
claim from it and looked at full-grade frames instead, with the macroblocker and both noises
ON, because the metric ablates all three.

## The `.jpg` glob bit again, concretely

Two of the 14 reference files **have no extension**. `glob('reference/*.jpg')` silently
returns 12, and that shifted a published 142x80 median from **0.1188 to 0.1408** before the
critic caught it. **Anyone who has quoted a reference band off a `.jpg` glob measured 12 of
14 files.**

## Two systems shared a convention and nothing asserted it

Round 17's critic diagnosed smeared cylinder artwork as a wrapping problem. The root cause was
simpler and worse: **`THREE.LatheGeometry` sets `uv.y = i/(points-1)` — a POINT INDEX, not a
height.** Measured off the live geometry:

    shape   barrel as % of height    v-span the barrel got    stretch
    rim            81.6%                    0.110              7.40x
    jar            71.5%                    0.198              3.60x
    tub            88.5%                    0.372              2.38x

So **63-89% of every can, jar, tub and bottle label landed on the end discs and rolled rims**,
while the barrel got an 11% slice blown up **sevenfold**. The wordmark was on the base disc;
the rim and lid carried the legal block and the barcode. And a 7.4x vertical stretch divides
`|dL/dy|` by 7.4 and leaves `|dL/dx|` alone — **the anisotropy sign inversion, arrived at
mechanically.**

**Nothing asserted that the atlas's rows and the geometry's `v` meant the same thing.** A
second instance of the identical missing contract sat next to it: **the bottle cap was drawn
on the bottom of the bottle, under a comment stating the correct convention.**

This is CLAUDE.md's duplication hazard in a new shape. It is not two copies of a *value* — it
is two systems with an implicit shared *convention*, where each is internally correct and the
interface between them is nobody's. **When you index into someone else's parameterisation,
assert the units agree.**

## A check that passes because it never runs

Round 18's type ledger logged **zero entries** on its first build — **canvas normalises
`fillStyle` to hex and the parser only read `rgb()`**. It reported clean because it never saw
a single draw. Its own list also includes a corrector whose output **failed its own check on
39 runs**, and an ablation that **measured photo boxes at the wrong resolution — the round's
own bug, inside the instrument built to find it.**

**Zero is the most suspicious reading an instrument can give.** Prove a checker fires before
you believe it is silent — `typeCheckSelfTest()` is the pattern: **116 of 688 runs fail with
the guarantee off, 0 with it on.**

## Refusing to quote a measurement that will not hold still

Round 18 measured three reference photographs for the round/flat contrast. Two swept 5,625
crop positions each and stayed **100% below 1.0** (0.643, 0.581). The third measured 1.131
with a sweep **spanning 1.0** — and **the tool refuses to quote it and drops it from the
verdict**, rather than reporting a median that a different crop would move.

That is the eighth region-dependent statistic on this project and the first one **declined at
source**. Build the refusal into the instrument, not into the write-up.

## Fix the class, not the instance

Told to fix one illegible wordmark, round 18 declined to hunt it: its class is **type
differing from its ground only in the brand channel, whose worst-case contrast is zero for a
cream brand.** `fitText` now guarantees the print-brightness step **at the one place every
wordmark is drawn**, with a self-test proving the guard fires. Likewise the "green wine
goblet" is now an `aspectCheck` keyed to **outline, not SKU**.

**A fix keyed to the instance you were shown will be back next round under a different name** —
r16's `CORNERSTONE ALLERGY RELIEF` returned as r17's `PENNYWHISTLE`.

## THE SECOND BAR IS MET. Here is the evidence.

Round 16's critic hand-played three chases with real keys and got final gaps of
**4.41 / 8.05 / 4.71 m** — a third data point between the earlier 0.8-3.3 m and 18-39 m. But
the trace is the evidence, not the total. One second per row, post-bolt:

    17.75  2.50m  SPRINTING        21.25  3.28m  SPRINTING   <- clawed back
    18.25  1.61m  SPRINTING        21.50  3.59m  WINDED
    19.00  3.02m  WINDED           22.25  4.98m  WINDED
    20.00  4.33m  READY            23.75  3.85m  SPRINTING
    20.25  4.15m  SPRINTING        24.50  4.41m  shove - gone

**Every burst takes back ~1 m; every gas-out gives back ~1.4 m. You oscillate between 3.3 and
5.0 m for eight straight seconds and lose by 4.4 m.** The priced arithmetic backs it: walk
2.35 flat, sprint peaks 5.05 for ~1.0 s then decays to 0 by t≈2.0 s, thief flee peaks 4.94 and
sustains 3.63-3.87 for 8+ s. **You are strictly slower at every stamina state, so you cannot
win dry — and a drink at 7.17 m/s closes 3.4 m/s.**

PROMPT.md: *"If you catch him without a powerup it's too easy. If you can't catch him with one
it's broken. You should lose by a few feet, not half a store."* **Both halves are satisfied.**

## Prominence inversion: the right numbers, ranked wrong

The complaint that the chase is *"over as information before it is over as gameplay"* survives
round 16's emphasis fix — but **not for the reason it was given**. Four seconds after the bolt
the panel read `GAP ~4m`; it did not declare the chase over.

The real defect is ranking. At a **2.3 m** gap the screen carried:

    GAP 2.3m          small, left
    2.3m              12 px, far-left margin, on an off-screen chevron
    HIM 16.7 / YOU 15.1   LARGE, top-right, colour-coded

**The two numbers that decide nothing are the two that read first.** Honesty is not the same
as legibility, and this HUD is now honest.

## An instrument cannot see outside its own model

Two rounds of erasure work — a typeset ledger, then a painted-rectangle ledger — and the worst
defect left is **the pursuit panel drawn on top of the fleeing man.** At a 3.8 m gap, the
moment the chase is decided, the thief renders from the knees up *behind* a 1280 px HUD band:
legs below it, torso a dark smear through it. It fires on **169 of 397 chase frames** and the
proxy under-counts.

**The ledger is HUD-vs-HUD by construction. The subject is not a string.** No amount of
refining a HUD-vs-HUD instrument can ever reach a HUD-vs-world defect — and it costs the
player exactly what the bar is about: **seeing the man you are a few feet from.**

Its own enumeration of what it still cannot see is the model to copy: opaque `fillText` over a
string (**live today**, 21-46 px type over 11-12 px), `destination-out`, `clearRect`,
`drawImage`, effective alpha within 0.03 of its cliff, strokes, anything on another canvas, and
**HUD over the 3D world — outside the model entirely.** It also lists two ways the ledger
**over**-reports: it has no severity (a `100%` line turned out to be a *duplicate* string —
the panel title saying `DOOR 1` at the same pixels), and `devBox` takes the axis-aligned bound
of a −7 degree rotated plate, inflating its top by ~32 px. **All six surviving erasures on the
current build are that artefact, not defects.**

## State the population next to the count

Round 16 published **0 erasures / 0 overprints**. Its critic reproduced the layout fix and
found it **~135x larger than claimed** — 813 -> 6 and 288 -> 0 across 48,000 census frames a
side. But **the published 0/0 was one cell** (seed 7717 + `observer` + 4 shifts) of a table
that read **10 of 16 runs non-zero** on the build that shipped.

And the same seed at a **different RNG stream position** gave 0 vs 3 erasures **on the same
build**. **A census result is not a property of the build alone.** Quote the seeds, the
policies, the frame count and the number of non-zero runs — never a bare zero.

## THREE ASSERTIONS, ALL VACUOUS, ONE ROUND AFTER THE WARNING

Round 18 shipped three load-time checks. Its critic broke **all three**, and each failed the
same way the brief had described one round earlier:

- **`latheCheck()` returns `[]` while all 51 lathes carry the OLD index-based `v` live on the
  GPU** — worst stretch 6.0x, barrel v-span 0.099. It reads `LATHE_LOG`, written once **at
  bake time**, and never the geometry. The round's own `uvAB()` swap corrupts the store **while
  the check certifies it.**
- **`aspectCheck()` passes 11/11 outlines while 38 shipped instances reach 4.22:1**, past the
  widest declared band of 3.80. The aspect comes from a **per-instance non-uniform scale**
  (3.2-3.6x more in y than x) that a check reading only the shape table cannot see. **The
  goblet it was written for reached a shelf through exactly a downstream path.**
- **`typeCheck()`'s self-test reproduces exactly (688 runs, 116 complaints, 0 with the
  guarantee on) — and `setTypeCtx` is called for only four atlases**, so the entire shelf-tag
  atlas sits outside it: 10 raw `fillText` sites including the price numerals, plus a
  `fitText('CLEARANCE')` whose contrast step **silently no-ops**. It contributes **0 of 688
  logged runs — on the price rail**, which AGENTS_BRIEF lists as bar item #4.

**A self-test that passes proves the check can fire. It does not prove the check is WATCHING
the artefact.** Read the live thing — geometry, instance attributes, the actual draw calls —
not the log you wrote while building it. This is now the fourth, fifth and sixth instance of
the same failure on this project.

## K measures ARRANGEMENT, not packaging shape

The round/flat anisotropy statistic cannot cross the render/photograph boundary: the render is
masked by **ablation**, the photographs by **rectangles**, and running the *crop* rule on both
sides makes the render **not quotable at 6/6 poses by the round's own refusal test** — the
densest round window on a render frame reaches only **10-35% round pixels**, so no rectangle
can isolate the class.

And on the photograph side it is measuring something else entirely: `store_01_Langenstein's`
reads **K = 2.034, sweep [1.559, 2.208], 0.0% below 1.0** — fully quotable and pointing the
*other* way — because it is **bottles in vertical rows against boxes in horizontal shelf
bands**. Ninth region-dependent statistic here.

**The "+46% residual" does not survive.** The unwrap fix is real and verified **off the
geometry** (barrel v-span 0.099-0.248 -> 0.57-0.745, r = 0.992-0.998 on all 51 lathes) — which
is the right way to check it. The K comparison was never the evidence.

## FIXED: the blind protocol's tell was a LEAK IN THE HARNESS, not the test design

`snapClean(..., {storeOnly: true})` collected every hidden node into `reHide` **and never
consumed the array.** One storeOnly capture therefore hid every cart, shopper and child **for
the rest of the page load.**

Measured live before the fix: **14 shoppers visible -> 0 after a single call**, and still 0
after a second. After the fix: **14 -> 14 -> 14, and the clean plate is still clean.**

So the "empty tidy corridor" that made every render tile look unnaturally orderly — while
every photograph it was scored against has people, carts and pulled-forward stock in it —
**was the harness handing the render a tell**, not a limitation of blind testing. It also
silently emptied any **graded** capture taken later in the same page load, which means any
round that took a `storeOnly` plate before a graded frame measured a depopulated store.

Found by builder-store-r19, in `src/main.js`, which is lead-owned. Fixed, restore in a
`finally` so a throwing render cannot leave the scene half-hidden. **Blind A/Bs from here on
have people in both columns.**

Also worth copying: round 18's critic found **a previous run's blind tiles and answer key
sitting in the scratch directory** and regenerated into a fresh randomly-named directory
**without opening them.**

## Verify a legibility claim against the pixels the player gets

Round 18's fix is real, but `facingPx` says the **median can facing is 1.5-2.4 px at chase
range**, 8.5 px at the nearest pose the rig can reach, and **54 px maximum anywhere**. **No
per-can legibility claim is available at all.** What improved is the **aggregate banding of
the shelf** — which is the honest claim, and it is still worth having.

## KEEP THE AUDIO OFF WHILE YOU TEST

Every agent driving this page clicks and presses keys — and those are exactly the gestures a
browser needs before it will start an `AudioContext`. So a tab under test plays the store's
full ambience, PA and foley **out of the machine's speakers, at whoever is sitting there.**

**It is already off.** `main.js` honours a persisted flag and `localStorage` is per-origin, so
every tab on `127.0.0.1:8171` inherits it:

    __CHOP.muted        // true
    __CHOP.mute(true)   // persists until mute(false)
    ?mute               // one page load

When muted the `resume()` listeners are **never wired**, so the context stays in its default
suspended state rather than being started and turned down. Verified after a reload: agent-style
clicks, keypresses and `run()` leave `ctx.state === 'suspended'` and master gain 0.

**Do not call `audio.resume()`, `talkStart()` or `recordAudio()` unless the round is about
audio** — and if it is, say so first and put it back afterwards. Nothing else in the harness
needs sound: `snap()`, `snapClean()`, `run()` and every bench are silent by construction.

## DO NOT POP WINDOWS. Background tabs only, and close them.

The user watches this machine. Every fronted tab, every `preview_start`, every pane that
grabs focus interrupts them. Absolute rules:

1. **`tabs_create({ foreground: false })`** — always background. Never omit the flag.
2. **NEVER call `tabs_select`.** There is no reason to front a tab: `snap()`, `snapClean()`,
   `run()`, every bench and every probe work in a background tab. If a call times out because
   the pane is hidden, that is a *compositing* problem — reduce the work per call, do not
   front the tab.
3. **Do not call `preview_start`.** The pane is already open; it opens a window.
4. **Close your tab when your round ends** (`tabs_close`), and set
   `window.__claim='<your-name>'` on it while you hold it so nobody reclaims a live one.
5. **Do not drive `seed`** (the lead's) or **`tab-4`** (the progress page).

Tabs are also a scarce resource here — agents have already had to reclaim each other's. One
tab per agent, backgrounded, closed on exit.

## THE SHIPPED BUNDLE DIVERGED AGAIN, AND NO PARSE CHECK COULD CATCH IT

`tools/bundle.py` emitted every export as a **shorthand property**, so an aliased export —
`export { M as MOTIF_DRAW }` — became `return { MOTIF_DRAW }` **with no such local binding**.

The bundle **parsed**. Both syntax gates passed it. `tools/check.py` was clean on all 47
files. And the shipped build died at boot with `MOTIF_DRAW is not defined`, stuck on the
INITIALIZING card — **a runtime reference error, which a parse check can never see.**

Third source-vs-bundle divergence on this project. **`node --check` passing is not evidence
the bundle works.** The only sufficient test is the one that was missing: **load
`docs/index.html` and confirm `window.__CHOP` exists.** Do that before telling anyone a build
is playable.

## A self-test that runs on an empty sample proves nothing

Round 15's first draft ran `lampWarm()`'s self-test on **`a7z9` — a pose with no blade in the
gate at all** — and reported `agree: true` **having compared nothing.** It now runs on the
pose that decided the verdict, and the guard **throws on an empty sweep.**

Coverage is now reported rather than assumed: **45 of 64 poses have a blade in the gate; 19
do not** (all sixteen of aisle 1, plus z = +9 elsewhere). **State the denominator of any
sweep.** This is the seventh check on this project to certify something it could not see.

The guard itself is now worth copying: at a cut of 0.156 the **band** sweep throws naming
`a7z0`, while the old **single-pose** call at the *same cut* returns silently with a margin of
+0.0065. That is the difference stated as a test, not as an argument.

## One global null cannot serve 58 poses

Per-pose null (`gradeAB(pose, patchA, patchA)` — same patch both sides), over 58 poses:

    min 0.00%   p25 0.22%   med 0.43%   p90 1.82%   max 4.76%

**A 20x spread.** Every "rises at N of N" claim on whole-frame blown needs its own per-pose
null. Netted properly with one, r13 -> r14 is **49 up / 9 down of 58**, not 16 of 16 — and
z = −4 falls **17.7-20.7% at 3 of 3 aisles**.

**The class label, by contrast, was identical under the null at 58 of 58.** That is the
statistic to lead with; it is also what the bar is written in.

## Two kernels disagreeing on the SIGN is the prerequisite

Round 15 plumbed per-channel `bloomWarm` through a single `warmFor()`, proved the dial fires
and proved the build byte-identical with it unset — **and deliberately did not set it**,
because over the eight feeds that really are 142x80, **BOX says the cut is a wash (1.67x ->
0.63x the median) while LANCZOS says clear overshoot (0.88x -> 0.33x).**

**When two defensible kernels disagree on the direction of an effect, you do not have a
measurement yet.** Ship the mechanism, prove it inert, leave the constant alone, and say so.

## `snap()` corrupts pose evidence, not just bench determinism

`numeral()` readings taken after a `C.snap()` sequence returned **glyphArea 1.000 for a change
that a clean page, the live canvas and saved PNGs all put at 1.307.** Cause: **`snap()` calls
`step(0)`, which resumes the game and moves the floor camera out from under a cached class
map.**

The brief already warned that `step(0)` breaks `eval.run()` determinism. It also silently
invalidates **pose-dependent** measurements. **Post the probe canvas directly; do not take a
measurement through `snap()`.** Round 15 could not reproduce those readings and **discarded
them rather than publishing a negative result off a number that would not hold still.**

## The leak fix now has the negative control its own entry lacked

The `snapClean(storeOnly)` fix was recorded above with the right numbers — 14 shoppers
visible -> 0 after one call before the fix, 14 -> 14 -> 14 after. Round 20 re-verified it on
the live artefact before scoring anything against it, and the re-verification is the part
worth copying, because the original entry proves less than it looks.

Effective visibility is a walk of the **whole ancestor chain**, not `o.visible` on the mesh —
a hidden parent hides a visible child, and the first draft of this probe counted
`userData.kind === 'shopper'`, **matched nothing, and returned a clean 0/0/0**. That is the
seventh check on this project to certify something it could not see.

Working probe, over `agents.shoppers`:

    start                 14 shoppers / 14 carts
    after storeOnly #1    14 / 14
    after storeOnly #2    14 / 14
    after a plain capture 14 / 14

**And the two controls the original entry did not have:**

- **It can fire.** Hiding three meshes by hand reads **11**, and restores to 14. A 14/14/14
  from a probe that cannot reach zero is not evidence.
- **`storeOnly` is still doing its job**, rather than having been "fixed" into a no-op that
  hides nothing and therefore restores nothing. The two storeOnly plates are byte-identical
  (`d1a85bd6`), the plain plate at the same pose is a **different file** (`f0430cf1`), and all
  six canonical poses differ pop-vs-so — so people really are in every populated plate.

**A restore assertion and an it-still-works assertion are two different tests, and a fix to a
hiding bug needs both.** Passing only the first is indistinguishable from deleting the feature.

## ROUND 20: THE AISLE VOLUME IS EMPTY, AND EVERY OBJECT STOPS AT THE SHELF PLANE

Render-recall **12/12, first glance 12/12**. Twenty rounds, still 100%, still flat.

The cue, and it is **semantic and geometric, not photometric**: in every reference photograph
the space between the two shelf faces is continuously invaded by paper and wire — clip strips
hung down into the aisle with product on them, wobblers on plastic arms perpendicular to the
face, hang-tags, coupon dispensers, wire dividers, peg hooks including **empty** ones, coiled
cable hanging off a shelf, taped signs at odd angles, product overhanging the lip. Four such
objects in one 600 px crop of `store_03` at (1300,560)-(1900,898); three in `store_02` at
(1180,380)-(1720,684).

In all twelve round-20 plates the count is **zero to two**, and every one is the same object:
**a flat, camera-facing, zero-thickness billboard quad with no shadow and no overlap onto the
product behind it.**

**The consequence is the defect.** Every object stops exactly at the shelf plane, so the shelf
edge is **an unbroken ruler-straight bar from gondola end to gondola end** — and that
silhouette was the first call at **six of six poses, including the three chase poses where no
product text is legible at all.** Evidence: `shots/r20_critic_shelfedge.png`.

## The populated/clean experiment came back null, and could not have done otherwise

`_pop` 6/6, `_so` 6/6. No difference. The harness leak really is fixed, but **the poses do not
exercise it**: the two conditions differ over **0.10-4.93%** of pixels (chase_a1 0.10, chase_a4
0.36, chase_a6 0.96, near_a4 0.98, near_a1 4.09, near_a7 4.93) — under 1% in four of six.

Worth having anyway, because where a shopper IS large and foreground (`near_a7_pop`) the figure
became **a second independent tell, not cover**: mitten hands, flat repeating stripe texture
with no fold shading, lozenge shoes, and a soft blob under the feet instead of a grounded
contact shadow. **Re-shoot with a shopper near the camera before anyone claims people help.**

## Three more instruments retired, and the one that worked

Measured and then **refused** by the critic that measured them:

    within-frame clone census   renders 0.5% +/- 0.2   photos 0.3% +/- 0.3   fully overlapping
    along-lip variability       renders 1.289 +/- 0.101 photos 1.532 +/- 0.138  ~2 sd, overlapping
    shelf-lip continuity        renders 0.589 +/- 0.105 photos 0.444 +/- 0.059  overlapping

The clone census is the important retirement: **real supermarkets genuinely have identical
facings, so REPETITION IS NOT A RENDER TELL.** Both lip statistics **scan horizontal rows while
real shelf lips recede in perspective**, which is exactly why they smear. Twelfth through
fourteenth region-dependent statistics retired here.

**THE INSTRUMENT THAT WORKED — copy this protocol.** A localisation sub-test: 17 crops of the
**shelf band only** — no ceiling, no floor, no people, no composition — shuffled and scored
blind. **17/17** (9 renders, 8 photographs). The cue survives with everything else cropped
away, which is what makes it the cue rather than a composition artefact. Any round claiming to
have moved this should run its own shelf-band set before and after, and say so if it did not move.

Also worth copying from the protocol: all 22 tiles were **normalised to 1280x720 PNG** (largest
16:9 window, random offset, LANCZOS) so that **aspect ratio, resolution and file format could
not leak**, and the split was randomised away from 50/50 with the running tally never printed.

## THE PROGRESS PAGE UNDER-REPORTED THE TREE, AND A ROUND'S EVIDENCE WAS VOID

Round 20's game builder was briefed that the HUD-over-the-man gap was "unworked since round
16," because `progress/status.json` read `game r16 gap`. **It was not unworked.** A previous
`builder-game r17` pass had already written `subjectBox()`, the tight-panel switch and the
door-tag keep-out into the working tree **and never filed a report.** The brief inherited the
status page's view of reality and was wrong.

**Worse, that pass's evidence was void — by a trap this file already documents.** It captured
its before/after through `C.snap()`, which calls `step(0)`, so its two "decisive" frames are
**one sim frame apart** and the panel is wide in both: the man drifted out from under the rect
between the measurement and the capture. Round 20 re-took everything through `hud.shot()`,
which does not step, and **kept both probe files so the failure stays readable.**

Two rules out of this. **Uncommitted work is invisible work** — if it is not filed, the next
round is briefed against a tree that does not exist, and `git status` is part of reading the
state. And **the `snap()`/`step(0)` trap has now voided evidence twice**, once for a pose
measurement and once for a before/after pair. It is not a determinism footnote. It silently
changes the thing you are photographing.

## The panel is off the man, and the instrument is HUD-vs-WORLD

Two matched sweeps, both layouts scored **on the same frame** via `hud.bands()` — no
cross-load comparison, which is the part that makes it quotable:

    sweep A (838 fr, 7 chases)      sweep B (528 fr, 7 chases)
    panel on him >=20%   25 -> 0    8 -> 0
    panel worst frame  47.8 -> 7.1  32.4 -> 5.6
    chrome mean        4.27 -> 2.91 2.08 -> 1.23
    separable frames worse  0 of 56     0 of 24

The instrument answers round 16's actual objection — that a HUD-vs-HUD ink ledger can never
reach a HUD-vs-WORLD defect. `subjectBox()` projects the silhouette through **the same
`projectFromCop` + `warpFloor` pair every marker uses** (one owner, not a second copy) and
**was validated against pixels rather than against itself**: ablate the body group, re-render
the same frame, erode 2 px — null 0 px, silhouette 8,904 px, **8,827 inside the box,
containment 0.991**, the 77 outside being 1-3 px of swinging arm.

**And the assertion it ships is RELATIVE, deliberately.** `subjCheck()` promises the shipped
panel never covers more of him than the wide one would. A ceiling would have been vacuous —
**the tight panel still reaches 34.8% on its worst frame.** The self-test fires in three
directions and throws EMPTY SAMPLE on a non-chase frame.

**The regression it caused, and caught:** the 330 px panel made the rear-break banner overprint
itself — `SUBJEGTiNgBREAKlNGtFOR THEsREAR`. That is round 14's FOOTSTEPS bug, **in the round
that cites it, 300 lines below the note saying a helper nobody calls is not a guard.** Fixed
with `advOf` and a stacking fallback; 0 overprints across 528 chase frames.

**Standing, by its own account:** the TOP band still covers up to 100% of him and was not
touched; the ranking claim has **no executable before** (`bands('r16')` restores the rectangle,
not the type scale); the door tag still lands on him on 16 of 528 frames; and **no claim about
play was made at all** — `eval.js`'s driver steers at `t.position`, so nothing in this repo
consumes the HUD.

## THE LIP LINE WAS AN INVARIANT, NOT AN OMISSION

Six rounds have been spent "varying the depth" of packages on a shelf. None of them could have
worked. `place()` computed

    back = half + 0.002 + (NON-NEGATIVE wander) + lean + (setback the callers floored at 0)

so **the front face of all 42,000 packages sat at or behind the shelf plane, always.** Every
one of those rounds widened the distribution **downwards only**. That is why the round-20 blind
critic could call an unbroken ruler-straight lip at six of six poses: nothing was permitted to
cross it. Setback may now go negative, floored at `half * 0.30` — a proud unit hangs over by
about 35 mm on a 100 mm carton.

**When six rounds of dialling a parameter produce no movement, check whether the parameter can
express the thing you are asking for.** Measured, control vs shipped on one page load via URL
flags, `columnCheck`/`lipCheck` reading `instanceMatrix` and `aCell` off the GPU with artwork
identity from material + raw uv (no table, no atlas convention):

    column same-artwork    10.22%  ->  60.28%     (null 8.98 -> 21.68)
    rigid crossing >= 5 mm  0.31%  ->   6.92%
    rigid crossing >= 30 mm 0.21%  ->   2.74%

**The null rose 9.0 -> 21.7 and was reported anyway** — bigger blocks mean fewer distinct
artworks per face. That is the cost of the change, published next to its benefit.

## "Unnaturally tidy" was missing STRUCTURE, not missing disorder

The round-19 deck ran a free-running sequence of brand blocks capped at 0.42-0.95 m, and **each
deck ran that sequence independently** — a 6 m face carried about 9 blocks x 5 decks = 45
uncorrelated colour patches, which at down-aisle range average to **one uniform mottle**.

Vacancy, six wrong-states and four bay states were all firing the whole time. **The disorder
was there and had nothing to break.** A brand now owns a slot on every deck of a face
(0.30-2.45 m, heavy-tailed: median 0.56, mean 0.82, p90 1.84), so the fronted/wrecked seam
falls where the brand changes.

## FOUND, NOT CAUSED: 4,200 bags have stood through the shelf lip in every build ever shipped

`pillowGeo` and `gussetGeo` in `src/store.js` have **local z extents of 2.021 and 1.810, not
1.0** — 38-42% of their vertices sit past |z| 0.55. `place()` sizes clearance assuming a unit
cube, so those bags protrude about **105 mm**, and **59.5% of them cross the 5 mm threshold in
the CONTROL build.**

It was split out of the round's headline rather than netted into it, which is the right call
and also the warning: **any lip-crossing census taken on this project before today was partly
measuring this bug.** A geometry helper whose local extents are not what its consumer assumes
is the same class as the shadow-override and duplicate-camera-rig hazards already in this file.

## A check that reported 11.07% crossing on a build where crossing is IMPOSSIBLE

The round's own first `lipCheck` read **11.07% crossing, max 301 mm**, against a control in
which the invariant above makes crossing impossible. Two bugs: the face anchor was the **first
lip seen**, which at every fixture except the gondola runs is a back rank 190 mm too far back;
and a 0.25 m along-span margin let endcap facings match run groups. Control floor after the fix:
**0.31%.**

**A number that is impossible is worth more than a number that is merely surprising** — it
names the bug for you. The builder published it rather than quietly fixing it.

## THE GEOMETRIC BAND WAS THE WRONG BAND, AND THE LEAD ALMOST SHIPPED IT

`latheCheck()` verifies the BARREL and stops there. Everything outside it was allocated by
`latheBands()` at `RADIAL_W = 0.5`, which gave **every wall above or below the barrel 0.23-0.44
rows of cell per unit of object height, and every end disc 2.2x to infinity.** The rolled rim —
which `CAN_PROFILES` itself calls "the two bright rings that identify a can across an aisle" —
held **1.7 px of a 144-row cell**, while the recessed end panel nobody can see from a shelf held
10.7. **That is round 18's unwrap bug surviving one segment along, under a check that could not
see it.**

`RADIAL_W` is now 0.10, and it was **derived, not chosen**: a disc projects `|sin e|` of its area
and a wall `|cos e|`, so the ratio the player actually receives is `|tan e|`. Measured off the
rig over 10,234 round instances against the six `POSES` — 20,102 pairs — **p10 0.010 / p25 0.030
/ median 0.071 / mean 0.0995 / p90 0.224.** 0.5 over-served the discs fivefold.

**Then the part worth recording.** The builder asked the lead for one line in `plan.js`:
`ATLAS.can.barrel` `[0.085, 0.870]` -> `[0.107, 0.893]`. The lead checked it against
`CAN_PROFILES.rim`, found the profile geometrically symmetric (constant radius 0.462 from
y -0.408 to +0.408, barrel 81.6% of the can, so the geometric band is `[0.092, 0.908]`), and
**was about to apply the geometric value instead, on the grounds that a band wider than the
geometry is a constant shaved to clear its own gate.**

Pricing the two rolled-rim walls through `latheBands()`'s own weight sharing first, at ch 144,
`RADIAL_W` 0.10, floor 3 texels:

    [0.085, 0.870]   bottom 2.85 FAIL   top 3.96 ok     endRatio 1.53
    [0.092, 0.908]   bottom 3.09 ok     top 2.80 FAIL   endRatio 1.00
    [0.107, 0.893]   bottom 3.59 ok     top 3.26 ok     endRatio 1.00

**The geometric band trades one failing rim for the other.** The profile is symmetric in HEIGHT
and not in WEIGHT: it closes to r = 0 at y = **+0.485**, not +0.50, so segment 8->9 carries 0.015
of extra y travel, the top end zone has more total weight to share, and the top rim's slice is
diluted. `[0.107, 0.893]` equalises the ends and clears the floor at both **while leaving the
barrel's share of the cell exactly where it was** — 0.786 against 0.785, stretch 1.038 against
1.039. It costs the label nothing.

Applied and verified live: `latheCheck` still returns `[]`, bottom rim **3.60** texels, top
**3.25**, `endCheck` complaints **18 -> 11**, and every survivor is the `can/jar` neck the builder
said it was deliberately leaving (28.5% of the jar's height sharing a 13% band sized for a can).

**The lesson is not "the builder was right."** It is that the objection was worth raising and
worth *computing* rather than acting on, and that **"symmetric geometry" and "symmetric texel
allocation" are different claims** whenever allocation is by weight. Nine lines of arithmetic
separated a good fix from a regression that would have read as a principled correction.

## Two erasures found by a check built for a class the previous one could not see

`plateCheck()` — effective alpha is `globalAlpha` x the alpha in the `rgba()` string, multiply
and lighter excluded, and **a rect thinner than 0.30 of the glyph box is a rule, not a plate**
(its first run flagged the tag's strike-through and the build was right). Self-test fires five
ways, including the r19 bug reproduced to its own numbers at 0.185 cover.

It found two real erasures, both live in the shipped build and both now zero: **17 of 24 can
cells ran their flash string under the barcode's opaque plate** by 4.7-23.0 px, and **6 of 48
carton cells** lost 29.6-31.1% of the sub-descriptor under the nutrition panel on arch 6. Clean
across 720 display strings and 3,259 opaque plates.

**And a caught self-regression:** the first draft of the end artwork regressed mip-3 bottom to
0.131, **11% worse than r19**, and the builder's own mip-survival table caught it before it
shipped. The negative result is written above the constants it produced.

## THE AISLE VOLUME HAS HARDWARE IN IT, AND THE ROUND-7 WOBBLER WAS THE BILLBOARD

Seven families now stand **in the aisle volume**, 55-300 mm past the shelf plane, all real
geometry through `Batch` so they stamp the occupancy field, and **none of them camera-facing**:
aisle violators (318, rigid card perpendicular to the shelf, 130-260 mm out — the only family
read face-on from a chase pose), wobblers (275, two-segment springy arm, 43 bent the wrong way),
clip strips with **1462 real wire hooks, 561 of them bare**, swing tags hung by one corner (184),
taped photocopies curling off the lip in two quads (49), coiled cable as a contiguous polyline
(11), and stray facings pushed past the lip (351).

**The round-7 "wobbler" was a 75 mm quad PARALLEL to the face with no arm** — that is, precisely
the flat camera-facing billboard the round-20 critic called out. And the clip strips were at
`lip + 36 mm`: **inside the cavity, behind the rail.** A family can be present by name in the
build and absent from the frame.

`lipCensus` — instance matrices plus soup position buffers, 9 gondola faces, band y 0.35-2.05 m,
20 mm z bins, **in world-space metres**, deliberately not an image row scanned across a receding
perspective, which is exactly why both lip statistics retired earlier that day smeared:

    frac of run >60 mm out   0.088 -> 0.276
                >100 mm      0.053 -> 0.174
                >150 mm      0.032 -> 0.088

9 of 9 faces up on all three. Cost: +4 to +7 draw calls, instances +10.1%, **colliders 75 -> 75**
— nothing hangs into the walkway (`maxReach` 0.297 m), which is the trap that once sealed the
eight checkout lanes into dead-end channels.

## A UNIT-CUBE ASSERTION FOUND A THIRD BROKEN GEOMETRY NOBODY HAD REPORTED

The `pillowGeo` / `gussetGeo` bug (local z 2.021 and 1.810 against a `place()` that assumes a
unit cube) was fixed by **normalising in `unitBox()` rather than exporting the true extents** —
"a contract is cheaper to make true than to make everyone compensate for."

Then `chopUnitCheck`, which reads the position buffers the GPU actually holds, **fired on a third
geometry nobody had reported: `wrapGeo` at 0.9557.** The +x face of a 3x3x2 box has no vertex at
y = 0, so the corner pull never releases.

**And the re-baseline is the number to remember: fixing the bags took shipped f100 from 0.231 to
0.174. Roughly a quarter of what any lip census on this project ever read was the bag bug, not
the thing being measured.** Every lip figure quoted before that fix is contaminated by it.

## A BUILDER CANNOT RUN THE SHELF-BAND SUB-TEST ON THIS STORE

The fixture builder ran the localisation sub-test on its own work and published the refutation:
**16/17 both columns, render-recall 9/9 before and 9/9 after. It does not move.**

Its explanation is the useful part: **every render crop carries wordmarks from `brands.js` —
THRIFT KING, FAIRVIEW FARMS, HAVENWOOD, TALLGRASS — and the builder can name them at 400 px.**
Its single miss was the same photograph both times, and a photograph misread as a render does not
help. The generator was committed so a critic who has not read `brands.js` can run it.

**Anyone who has read the brand table is disqualified from the blind test on this store,
permanently.** That is a stronger constraint than "get a fresh critic" and it applies to every
future round.

## What the intrusion layer does NOT reach

**Beyond about 8 m the intrusions are 1-3 px, so the far half of every chase frame's lip line is
still essentially straight** — and no object that hangs into a 4 m aisle ever would reach the
vanishing point. These families change the near-field silhouette and the mid-field texture only.
Peg-hung product on the gondola back panel is not built. The pixel-level contact shadow is
**inferred from `chopField.field.top`** (mean occluder height 0.863 -> 0.974 m, fraction above
0.4 m 0.370 -> 0.457, 9 of 9 faces up) and **was not measured as darkening on the facings behind**.
`a4L`/`a4R` carry the fewest intrusions (f100 0.145/0.105 against ~0.20) because those runs' deck
ladders put fewer decks above the 0.40 m cutoff — genuine fixture variety, but `near_a4` is one of
the six canonical poses and it is the weakest of them.

## ROUND 20 MOVED DETECTABILITY BY ZERO, AND THE NEXT CUE IS THE SHELF CAVITY

Paired blind A/B, 51 shelf-band tiles, calls written to disk before the key was opened:

    overall render-recall   36/36 = 100%
    CONTROL (r19)           18/18 = 100%
    AFTER   (r20)           18/18 = 100%
    photo-recall            15/15 = 100%

Every render called on **first glance**; no considered pass ever changed a call. Excluding the
contaminated tiles changes nothing (32/32). **The builder flagged two contaminated tiles; there
were four** — two more carried ceiling deck and hanging signage, leaking exactly the composition
the set existed to exclude. Provenance, stated: the 36 render tiles are **3 camera stations x 3
crops per build**, matched pairs of the same 18 views. A fair *paired* A/B, which is what the
round needed, but it says nothing about recall on unseen views.

**THE CUE: A GONDOLA SHELF IS A THREE-SIDED BOX AND LIGHT HAS TO GET INTO IT.** In the
reference photographs the shelf underside, the back panel and the deck under a product sit at
**0.19-0.42** of the brightness of that same shelf's own lit lip. The render sits at
**0.59-0.87**. Hand-placed regions, coordinates published, offered as a structural observation
on 7 instances and explicitly **not** as a population statistic:

    tile_45  PHOTO  store_03   lip 112.3  cavity  22.0   0.20
    tile_43  PHOTO  store_01   lip 174.9  cavity  74.0   0.42  (-> 0.24 by y273)
    tile_19  RENDER r20        lip 173.8  cavity 150.5   0.87
    tile_47  RENDER ctl        lip 186.3  cavity 120.8   0.65

**Occlusion dynamic range is compressed about 3x, identically in control and after.** Nothing
reads as being *inside* a box, and nothing reads as *resting on* the deck it stands on.

**Semantic, and proven so rather than asserted, in two directions.** At **45x32** downsampling,
with every label and glyph destroyed, the classes stay trivially separable by eye
(`shots/r20_critic_blur45.png`) — so the cue is not in the labels. And **five photometric
instruments failed, all interleaved**: global luma percentiles, local Michelson contrast in both
axes, row-profile trough depth, block saturation, and a scale-adaptive inter-lip trough ratio —
so the cue is not a statistic. **It is about WHERE light is missing relative to geometry, not how
much light there is on average. Do not chase a global number. Occlude the ambient term.**

This lands exactly on round 13's own measurement, which has been sitting in this file unused:
**of a vertical gondola facing's light, Ambient contributes 32.2% and Hemisphere 30.4% — 63%
from two terms that are constant and cannot respond to geometry.**

## THE VERDICT ON ROUND 20'S OWN INTRUSION WORK, and it is the sharpest sentence of the round

> "Adding protruding geometry to a scene whose light does not respond to geometry just creates
> more objects that visibly fail to cast shadows."

The disorder is genuinely there in both builds — a can lying on its side, bottles pushed past the
shelf plane, tumbled bags. It did not help, and it **arguably hurt**: a fallen object demands a
contact shadow more strongly than an upright box does, and at the tipped can the deck darkens
only **~20%** (119.0 against 149.1 on the same rows) where a photograph runs **3-5x**.

**Sequencing is a finding, not a preference.** Geometry that occludes nothing is worse than no
geometry, because it advertises the missing term.

## A fifth independent reproduction of the row-scan failure

The critic's scale-adaptive inter-lip trough collapsed to 0.788 / 0.824 / 0.810 across all three
classes, and it diagnosed itself: **shelf lips recede in perspective and row-scans smear them.**
`tile_43`, where a hand-placed measurement gives a clean 2.4x, scores **0.898** automatically.

That is now the same failure found independently by the aisle critic (two lip statistics), the
fixture builder (which built its census in world-space metres and 20 mm z bins **specifically to
avoid it**), and this critic. **An image-row statistic on a receding surface is not measuring the
surface. Stop building them.**

## THE PANEL FIX HOLDS UNDER HAND-PLAY. THE TOP BAND IS NOW THE OCCLUDER.

Three chases, real keys, three losses, `hud.shot()` between every decision so nothing went
through `snap()`/`step(0)`. **The panel never touched him once** — `wideOn` read 0.0 on every
hand-played frame, gaps 1.79-6.20 m. The headline reproduced on the critic's own probe, twice:

    panel on him >=20%   11 -> 0        5 -> 0
    panel worst frame  56.7 -> 10.4  56.0 -> 6.3
    frames made worse         0        0 of 613

**What actually cost sight of the man was not the HUD**: he breaks laterally within a second of
the bolt and the camera does not turn, shoppers and gondolas stand between, and the camera
pitches into the floor when you reverse. The panel is usable at the decision — `GAP` at 26 px is
what the critic steered by, and `NO CUT - RUN HIM DOWN` correctly stopped it racing a door
already lost.

**THE BUILDER'S ARGUMENT FOR LEAVING THE TOP BAND IS REFUTED BY ITS OWN POPULATION.** "A man
whose head is off the top is a man you are on top of" — the band fires at 2.25, 2.32, 2.77,
2.93 and then **5.44, 5.51, 5.57, 5.62, 5.66 m, the worst three at 5.4-5.7 m with `vis` = 1.0,
entirely on canvas.** Hunted frames: **23.0% of him at 4.50 m on CONTACT**, and **67.1% at
3.86 m**. That is the losing-gap band. It is 52 px of title strip carrying REC, a store name and
a clock — **none of which changes during a chase** — and the round already proved a 330 px slot
and a side flip are affordable. **The round's own lever, yield to the man, was not applied to the
one element that now costs him his head.**

## A ROUND'S OWN COMPARISON, OVERSTATED — checked against `git show HEAD`

The shipped half is true: live ink ledger at 3.17 m CONTACT gives `GAP` 26 px against `HIM/YOU`
13 px, reproducing the table exactly. **But the claimed "exactly 2:1 the other way from round
16" is not.** `git show HEAD` gives r16 as `GAP s: noCut ? 19 : 13` against HIM/YOU at 13 — so
the **type ratio went 1.0 -> 2.0, not 1:2 -> 2:1.** Round 16 inverted *prominence* — a filled
106x56 colour-coded chip — not point size. **When you claim a reversal, diff the old source; do
not infer the old state from the complaint about it.**

## TWO DEFECTS THE ROUND SHIPPED, BOTH OF THE CLASS IT CITES

- **A live overprint inside the new tight panel.** The foot row typesets `YOU 40m` at x208 w47
  and the verdict at x202 w128 — the verdict starts **6 px left of the number** and is drawn
  after it, rendering `NIOU40m`. Both boxes are measured correctly by `advOf`; they collide
  because **two elements clamp independently into the same 310 px span.** Measuring each string
  correctly does not make a layout correct.
- **The subject label typesets off the canvas on 34 of 500 chase frames (6.8%)** — `SUBJ-07` at
  top -20 to -40, so the marker prints a bracket with no identity. One predicate: `rowFree()`
  asks only whether a keep-out rectangle intersects the row, **and no keep-out is the canvas
  edge**, so y = -40 reads FREE and round 16's flip, gated on `!rowFree(above)`, never fires on
  exactly those frames.

## `subjCheck` AND `subjSelfTest` HAVE NO CALLER ANYWHERE

Not in `src`, not in `tools`, not in `docs`. The assertion round 20 built to guard its own fix,
validated in three directions and proven to throw on an empty sample, **never runs.** That is
the "a check that passes because it never runs" entry in this file, recurring in the round that
was told about it.

## Three instrument notes worth more than the numbers they qualify

- **73% of the chrome statistic is one bottom panel.** 3.13 of 4.31 points come from the untagged
  WIND gauge at (10,606)-(480,710), on 40 of 613 frames, mean 47.9% / worst 88.0% — and **every
  one of those is a frame where his box top is y601-624 and `vis` is 0.07-0.13**, i.e. he is ~90%
  off the bottom of the screen. **"Off-canvas is not occlusion" was written for the horizontal
  case only.**
- **Chrome mean across three sweeps of the same build family: 2.08 / 4.27 / 4.96.** Quote the
  delta, never the level.
- **`_subjNearWorst` is written per frame and `eval.js` SUMS every numeric census key.**
  `_overprintWorst` and `_eraseWorst` are max-of special cases; this one was not added beside
  them, so a worst-case statistic is being accumulated as a total.
- `subjectBox` is the projected body rectangle and does not model store geometry occluding him:
  on one frame it ran y112-569 while his largest silhouette component ran y158-375 (containment
  0.879, fill 0.248). It does not touch the headline, which is relative.

## THE SAME DENOMINATOR BUG, AT THE OPPOSITE EDGE — found by the round it would have flattered

Round 20's critic found that 73% of the chrome statistic was the WIND gauge firing on frames
where the man was ~90% off the BOTTOM of the screen: "off-canvas is not occlusion," implemented
for the horizontal case only. **Round 21 found the mirror at the TOP, in its own headline gap.**

`subjectBox` clips in both axes, but `coveredFrac` divided by the **clipped** area — so a man
90% off an edge has a denominator a tenth of himself. The three worst top-band frames read
**98.3 / 100 / 100%** at `vis` 0.263 / 0.116 / **0.009**: the band standing on his last three
pixels and scoring as if it had covered him whole. `coverOf` now divides by the **whole
silhouette**, and those extremes become **25.9 / 11.6 / 0.9%**. **The top band is 9% of chrome,
not 30%.**

**And the gap survived its own correction, which is the part that matters.** Hunted at
`vis >= 0.90` on CONTACT: the band takes **23.2% of him at 4.34 m** — against the critic's
independently hunted 23.0% at 4.50 m — and 12.7% at 2.51 m, with `bandRaw` on those same frames
at 24.2 / 12.7. **The correction changes nothing on a man you can actually see.** Fix the
instrument first, then show the defect is still there; a round that only did the first half
would have closed a real gap by redefinition.

The band now keeps every word and gives up the space between them — two chips sized by `advOf`,
778 px of open canvas across the middle, same trigger and hysteresis as the tight panel — and
then, after measuring a residual of 16 of 602 frames with him under a chip at the frame edge,
**the chips yield too**: left drops the constant unit name, right drops the date. Matched sweep,
12 chases, 597 frames, both layouts on the same frame: band mean **0.44 -> 0.01**, band worst
**16.1 -> 2.6**, **0 of 597 frames worse**. Decisive pair at 2.34 m CONTACT, `vis` 1.00: chrome
**33.7% -> 0.3%**.

## A GATE THAT WOULD HAVE SILENTLY REVERTED THE PREVIOUS ROUND, CAUGHT BEFORE SHIPPING

**Every layout gate in the file was `BANDS === 'r17'`.** Shipping the new name `'r21'` would have
made `pursuitRect` fall through and return the **wide rectangle** — round 20's entire fix undone
**by a string comparison**, with no error, no failing check, and a passing parse.

Layout names are an ordered sequence now and `hud.bands` **throws on an unimplemented name**.
**A version gate written as equality against a literal is a time bomb that arms itself on the
next rename.** This is the same shape as the shadow-override blocks in `agents.js`, one file
along: the constant is fine, the *dispatch* is what rots.

## THE LEDGER WAS CORRECT FOR FOUR ROUNDS AND DROPPED AT THE LAST STEP

`subjCheck` now runs — `hud.sample` calls it on every chase census frame; full bench of
3 x 240 s / 7,200 frames gives `_subjOn` 280, `_subjGuard` **280**, fails 0 — and it is **proven
to fire through the bench path**, not merely to exist: parking an opaque 330x72 in the tight slot
yields `_subjGuardFail` **3 of 13** with the why-string, against **0 of 16** clean.

The second half nobody had noticed is worse than the missing caller: **`eval.js`'s report skips
every `_`-prefixed key.** Round 17's *entire* subject ledger had been pooled correctly on every
frame and then **discarded at the final step, for four rounds.** A naming convention in one file
silently emptied another file's instrument. Two systems shared a convention and nothing asserted
it — again.

`_subjNearWorst` was fixed **as a class rather than as an instance**: any numeric key ending
`Worst` now pools by max in both loops, proven end-to-end with a forced 0.10 / 0.90 / 0.30 cycle
over 1,800 frames reporting **90.0** where summing would give **77,994**.

## STANDING GAP FOR THE GAME PIECE: the WIND panel

It survives the denominator correction and is now **65% of corrected chrome**, worst **30.6% of a
fully-visible man at 2.85 m** (`vis` 1.00, box y372-712). It is tagged `wind` so it can be
decomposed by name. The 1 px band rule costs **1 erasure in 7,200 frames** (9.5% of one
`SUBJ-11`), quoted rather than removed. `eval.run` never renders, so every subject number in
round 21 comes from the live probe and not the bench. **Chrome LEVELS are run-dependent —
2.08 / 4.11 / 3.30 across sweeps of the same build family. Quote deltas on matched frames only.**

## THE ROUND'S BRIEFED PREMISE WAS WRONG IN BOTH HALVES, AND THE BUILDER SAID SO FIRST

Round 21 was dispatched against this file's own long-standing line: "63% of a vertical facing's
light is Ambient + Hemisphere, two constant terms that cannot respond to geometry." **Both the
number and the conclusion were wrong.**

Re-run live on the near_a4 shelf band, 580,000 px, one light zeroed at a time with the restore
hash-proven: **Ambient 18.1%, Hemisphere 19.3%, key 7.7%, fill 0.2% — 37.4%, not 63%.** The
remaining ~55% is `light.js`'s own terms, which **did not exist when the 63% was measured.**

And the conclusion fails independently of the number: **`AO_FRAG` runs
`gl_FragColor.rgb *= chopA.x` AFTER `<opaque_fragment>`**, so ambient and hemisphere were always
being scaled by the occlusion term, and the lamp / aisle / bounce terms each ride `chopA.x` or
`chopA.y` explicitly. **The ambient was never unoccludable.** The defect was that the occlusion
term itself could not see a shelf box. At near_a1, six slots, regions declared in world metres:

    chopA.x at the lit lip   0.932  0.939  0.944  0.980  0.989  0.993
    chopA.x in the cavity    0.867  0.857  0.943  0.989  0.992  0.953

**A stale measurement in this file sent a round at the wrong term. Re-measure the premise before
you build against it** — and note that the premise had been sitting here quoted and unused for
eight rounds, which is exactly how it survived.

## THE SECOND STRUCTURE, AND WHY THE FIRST ONE COULD NOT BE DIALLED INTO IT

A top-down field **cannot** see inside a shelf: every column through a gondola is 2.05 m tall,
and `chopAO`'s 145 mm normal push exists precisely to escape that sealed column — **deleting the
only signal a cavity could ever have had.** So `light.js` gains a **512 x 64 x 512 occupancy
volume** (93 x 50 x 74 mm cells, fractional coverage, mipmapped, 16.8 MB), cone-traced by
`chopCav` in 5 fetches.

**It is stamped inside `Field.box` — the sink `kit.js`'s `Batch.push` already calls for every
instance in the building.** Nothing opts in; a prop pushed in round 22 by someone who has never
read the file is occluded the moment it is pushed. That is round 8's rule honoured rather than
quoted: an authored occlusion card exists only at the junctions its author remembered.
`boxHex` (the `solid()` collider path) is marked bulk and skipped — **55 of 64,744 stamps**, and
what they are is named in the file.

**Draft one failed on every product facing and the failure is kept in the file.** Three taps
along the normal was perfect on deck tops and **exactly zero on facings**, because a facing's
normal points *at the open mouth of the shelf*. The fix is a vertical straddle pair blended on
`lat = length(N.xz)`.

## Results, and the OFF column is the one that matters

Whole-frame, region-free, 6 canonical poses, 5,529,600 px, bucketed by the world-space closure
the GPU itself computed — **same classifier on both arms**:

    closure  share    OFF     ON      x
    0.06     53.9%   146.4   146.4   1.000
    0.44      5.0%   116.1   107.2   0.923
    0.69      8.1%   115.5    90.2   0.781
    0.94     12.9%   107.7    37.3   0.346

The monotonicity is tautological. **The OFF column is not:** a fragment 450 mm inside a shelf
rendered at **107.7** against 146.4 in the open, so the whole occlusion axis spanned **0.736**.
It now spans **0.255**, against photographs at **0.162-0.417**.

Lip-vs-cavity, 11 world-anchored declared pairs: **0.785 +/- 0.219 -> 0.669 +/- 0.312**, improved
9 of 11, and the four instances whose cavity quad genuinely sees into a box land **0.20 / 0.27 /
0.34 / 0.41 — inside the reference band.**

**A sixth reproduction of the row-scan class, in the measuring apparatus itself:** the first
version of those pairs used quads with 60 mm of depth extent, and **perspective bled the depth
into apparent height.** They are zero-thickness now. And **two of the first four boxes landed on
product and reported the cavity BRIGHTER than its lip** — both failures kept in the file.

## `voxCheck()` fires, and its first run found a duplicated derivation

0 violations of 69,226 occupied columns live; **53,704 on a transposed read; exactly 1 on an
injected spike, 0 after restore.** A rule that fires in three directions, one of them a single
planted defect.

Its first run found a real bug: **`vol()` had written its own ellipse feather, disagreeing with
the height stamp by up to 880 mm.** All three copies now go through one `ellipseCov()`. One owner
per derivation, found by the check rather than by a critic.

Cost: **draw calls 177 -> 177**, triangles identical, **+5 texture fetches** per opaque fragment,
median frame 2.425 -> 2.500 ms (+3.1%) — **and the timer's own minimum disagreed in sign, so the
static count is what is quoted.** +16.8 MB.

## THE CONTRACT REQUEST NAMED SIX CONSTANTS. THERE WERE SEVEN.

`cavVoxBnc` was still defaulting inside `light.js` — **the exact defect the request existed to
close.** All seven are now passed from `store.js` and every value is byte-equal to that file's
own `??` default, verified against the live uniform bag rather than assumed:
`uFldCav2` reads (0.98, 0.10, 3.20, 0.85) and `uFldVoxCfg` reads (0.3125, 0.09, 0.60, 0.17).
**A no-op by construction and by measurement.**

**When you file a contract request, enumerate from the source, not from the ones you touched.**

## ROUND 21: THE CAVITY CUE CLOSED AND THE SCORE DID NOT MOVE

    overall render-recall   18/18 = 100%
    CONTROL (round 20)       9/9  = 100%
    ROUND 21 (cavity on)     9/9  = 100%

First-glance and considered agreed on all 31 tiles; **not one render was close to passing.**
Twenty-one rounds, still 100%.

**And the cue it was built for really did close**, measured independently of the builder, hand-
placed with coordinates in 400x240 tile space:

    near_a7_880_400  void 200,128,224,176   0.903 -> 0.338
    near_a4_700_240  void   8, 86, 90,114   0.511 -> 0.131
    near_a4_700_240  void 100, 86,196,114   0.313 -> 0.097
    chase_a1_30_330  void 240,146,300,160   1.003 -> 0.819

The critic's own photograph voids — 0.309, 0.330, 0.298 — **independently corroborate the
0.162-0.417 band the builder quoted.** RMS error against it fell **0.465 -> 0.290**. Real, large,
correct in direction, and **one instance overshot to about a third of the photograph floor while
another is still washed at 0.819: the axis is compressed and scattered, not landed.**

**This is now the fourth cue closed without the score moving** (chroma, shelf-face illumination,
chromatic-body L\*, and now cavity occlusion). Closing a real cue is real work and it is not the
same act as moving the bar.

## THE CUE, AND IT IS THE OPPOSITE OF ROUND 18'S RESULT

**Product faces are flat-shaded proxies, not printed packaging.** Every render facing is one flat
colour field wearing a wordmark or a vector glyph; every photograph facing is full-bleed print
with internal structure — brand mark, illustration, colour bands, white legal panel.

    RENDER  near_a4_700_240  190,115-400,210   flat crimson field, grey vector bottle outline
    RENDER  near_a7_880_400  222,120-330,185   flat grey field, dark rectangle standing in for a label
    PHOTO   store_01_Langenstein_s      0,20-210,115
    PHOTO   store_01_Canned_and_packaged_tuna  0,140-210,235

**All 18 renders were called on this, in about a second each**, and **it survives the 45x32
downsample**: renders read as large flat single-hue slabs, photographs as a fine mosaic.

**Round 18's headline was "ZERO render calls came off a package."** That was true, of full frames
in which signage and mirrored corridor geometry were louder. Crop the composition away, fix the
cavity, and the packaging is now what every single call comes off. **A cue that is retired is not
a cue that is fixed — it can be a cue that was being drowned out.**

**Do not read this as licence to chase repetition.** The clone census is retired and stays
retired: real supermarkets genuinely have identical facings. **The defect is the internal
structure of one face**, not the relationship between neighbours.

## A CRITIC THAT CONTAMINATED ITSELF, SAID SO, AND REBUILT

It opened the two sheets' `KEY.json` before realising it would contaminate scoring them. It then
**discarded the sheets' own photo tiles, extracted only the 18 render tiles programmatically
without ever viewing the labelled sheets, generated fresh photo crops at script-randomised
windows, and let the script shuffle and seal the key.** It also gave ~45% of photo windows a
jittered, mildly re-gained twin, so that "two near-identical tiles" — unavoidable when each
render viewpoint appears in both arms — **carried no class information.**

It also declared that its **photo-recall of 13/13 is inflated** because it had seen the full
reference images while choosing crop bands, and correctly noted this cannot touch render-recall,
which is one-sided.

**Two instrument notes worth keeping:**
- **Its eyeball read of which arm was darker was WRONG TWICE.** It recorded the control as looking
  darker at two instances where measurement said the opposite: **the control's hard black
  lip-shadow bar reads as "dark" while its actual interior is brighter.** Eyeball impressions were
  excluded from the cavity verdict.
- Four of its own void rectangles were discarded on inspection — three contained lit soup cans and
  one was bag tops rather than cavity. **Look at what is inside the box you declared.**

**Confound it raised against itself:** the render crop set was chosen by the round-21 builder and
includes two near-empty shelf views, which bias the blur panel toward flat beige. **Choose crop
windows by script, not by eye.**

## ROUND 22: EVERY PACKAGE FACE IN THIS STORE WAS PRINTED IN ONE INK

r21's critic called all eighteen renders in about a second on one cue — product
faces are flat-shaded proxies, not printed packaging — and the mechanism turned
out to be one line of `pack.js`'s own mask contract rather than a matter of
degree. Every band, plate, ribbon, keyline and roundel in that file is drawn
with `ink(r, g)`: r is how much of the **one** per-instance brand colour covers
the texel, g is print brightness. The `b` channel — four spot inks the shader
has decoded since round 5 — was written **only inside `depict()`'s photo box**.
So the entire chromatic vocabulary of a face was the paper stock, one brand
hue, and whatever the depiction painted. Everything that looked like structure
was that same hue at a different brightness.

`src/store/press.js` spends the existing four spots on the face's large
structure. **No new channel, no shader edit, no new texture:** draw calls 176
and 1,926,636 triangles **identical with the dial on, off and restored**
(within-run toggle, one pose), package atlases 21.6 MB unchanged.

## THE FACE-WINDOW CENSUS NEEDED THREE VERSIONS AND THE FIRST TWO MANUFACTURED THE GAP

The rule is one square window on one package face, brought to 22 px — the
render's own median delivered facing width — with BOX, then quantized Lab. Not
an image row on a receding surface.

**v1 projected each instance's printed front and measured whatever was there.**
A projected rectangle comes back whether or not something stands in front of
it, so the census was handed shelf lips, price rails, the black gaps between
facings and whole back ranks, while the photograph side had been cut onto real
facings by hand. That is the asymmetric-rule trap, and the contact sheet is
kept as `shots/r22_win_render_bad.png`. **v2** added a painter's front-rank
pass and a 12% inset and was still about a third non-product. **v3 asks the
shader**: `PKG_STAGE` 7 writes `vec3(0,1,0)` into every package fragment and is
documented in `pack.js` as "the product-facing MASK, for region evidence"; it is
uniform-only, so the plate either side of it is byte-identical (proven on 6 of
6 poses). A window survives only if 90% of it is that green.

**77% of v1's render windows were not product.** Every number taken before the
gate is void.

**AND THE CONTROL IS WHAT MAKES THE REST MEAN ANYTHING.** Windows on manifestly
flat regions — ceiling tile, plain shelf front — read `cover50` **2** on the
photographs and **2** on the render (flat 0.465 against 0.403). The statistic is
not counting sensor noise or JPEG texture: a blank tile scores the same on both
sides. A render package face sat at **3**, one step above a blank ceiling tile,
where a photographed one sits at **10**.

    144 render windows / 6 poses     flat p10/p50/p90     cover50 p10/p50/p90
    96 photo windows / 6 of 14 files
      photographs                    0.052 0.103 0.308      3   10   23
      render r21                     0.085 0.223 0.479      2    3   11
      render r22                     0.081 0.192 0.436      2    5   12

flat improves at 5 of 6 poses, `cover50` at 5 and holds at 1.

**`inks` — bins over a fixed 6% share — measures fragmentation BACKWARDS.** It
read 5 -> 4 on the same change that took flat 0.230 -> 0.129, because breaking
one slab into four patches drops all four below the threshold. `cover50` (bins
needed to cover half the window) has no threshold to fail at. Do not use a
fixed-share count for a "how many colours" question.

**And the hue-family count does not move, for a reason about the palette rather
than about the build:** three of the four spot inks are warm and sit inside one
60-degree family in Lab, so a six-sector hue count cannot separate gold from
red from cream. Median hue families stays 1 in both arms on all four families.

## PROBE RE-BAKES HAVE BEEN SHIPPING UNCORRECTED TYPE, AND A RESTORE CHECK FOUND IT

`sampleGround()` opened with `if (PROBE.on && TYPE_FIX) return null` — which
skipped **the contrast correction as well as the ledger write**. So every probe
re-bake in this repo carried ghosted wordmarks the shipped atlas does not have:
`endsSwap('r19')`'s control arm and every `sheet.js` ablation. Found by
comparing a fresh probe bake against the live canvas: **10.41% of the carton
atlas's texels differed, across all 48 cells, 207,947 of them in the print-
brightness channel.** The distinguishing condition is `TYPE_FIX`, not `PROBE` —
`typeCheckSelfTest` is the only caller that turns the guarantee off and the only
probe caller that needs the ledger — so the guarantee now always runs and only
the ledger write is conditional.

## A LOAD-TIME BAKE AND A RE-BAKE ARE NOT THE SAME ATLAS

After that fix the two still differed by 5.59%, and the split is decisive: of 48
carton cells, **all 7 that draw no depiction are byte-identical and all 41 that
do differ** (median 2,712 texels, max delta 101). Two successive re-bakes agree
exactly, so the state is set during bake 1 and stable afterwards. It is
`depict.js`'s three module-level scratch canvases — `SCRATCH`, `RIM`, `SIL` —
which grow monotonically and are shared across bakes.

**Consequence for every A/B on this piece: an arm that is a probe re-bake cannot
be compared with the LIVE atlas.** `pressSwap()` re-bakes *both* arms so they
are on equal footing, and restores by assigning the **original texture object**
rather than by re-baking, which is byte-exact by construction. Contract request
against `depict.js` is written into `src/store/press.js`'s header.

## LIGHTNESS WAS NOT THE MISSING AXIS. CHROMA WAS — AND THE FIRST READING OF THAT WAS WRONG TOO

Within-face p90-p10 at 22 px, product-mask-gated:

                        dL*                 da*                db*
    photographs   27.6 44.2 68.4      6.4 22.7 44.0     14.0 30.7 59.5
    render r21    14.3 29.3 47.4      0.8 10.4 38.6      2.4 19.2 39.1
    render r22    16.0 30.2 47.3      2.8 17.5 42.0      4.8 25.8 45.2

The press closes **58% of the a\* gap and 57% of the b\* gap** and leaves L\*
essentially where it was. **An earlier reading of the same table, taken before
the product-mask gate, said the render was AHEAD of the photographs on dL\*** —
that was the shelf lips in the sample, and it is the reading that sent this
round at a continuous-tone term. Publish the gated number.

## THE TONE HALF IS NEARLY REDUNDANT WITH THE INK HALF

Four arms on one page load:

                     flat p50   cover50 p50   da* p50   db* p50
    r21 control        0.223         3         10.4      19.2
    TONE only          0.219         4         15.5      21.0
    INK only           0.194         5         17.7      26.1
    both (shipped)     0.192         5         17.5      25.8
    photographs        0.103        10         22.7      30.7

Ink alone reaches the shipped figure on every column and is fractionally ahead
on da\*. The tone term ships anyway on stated grounds — bake-time only, 0.35-
0.73% of product-mask luma against the ink half's **+4.6%**, and a rendered box
face genuinely has one normal and therefore one Lambert value edge to edge —
with the negative result written above it. **Do not reach for a bigger tone
amplitude**: and note that a pure print-brightness multiply moves Lab a\* too,
because a\* is not exposure-invariant, so part of TONE-only's 10.4 -> 15.5 is
L\* coupling and not chroma at all.

## THE REFUTATION, NEXT TO THE HEADLINE

**At 45x32, with every glyph destroyed, the classes are still trivially
separable by eye** — `shots/r22_blur45.png`, r21's critic's own test reproduced.
Render tiles read as large flat slabs, photographs as a fine saturated mosaic,
in the r22 arm as in the r21 one. This round moved the cue by roughly a quarter
of the flat gap and three tenths of the cover50 gap. It did not close it.

Sharper, because it is on the critic's own crop: reproducing `near_a4` at plate
(890,355)-(1100,450) at 4x, **two of the three facings are materially
unchanged.** The press's structure is at the top, the bottom and one edge of a
cell, and a crop of the middle of a 0.89-1.20 m top-stock case sees the brand
field and the edge column and nothing else.

## 20.9-69.1% OF A RENDER FRAME IS PRODUCT, AND THE REST IS WARM NEUTRAL

Measured off `PKG_STAGE` 7 over the six canonical poses: whole frame 20.9 /
24.1 / 25.7 / 31.0 / 38.6 / 69.1%, shelf band (rows 15-80%) 28.1-69.9%. In
`store_01_Canned_and_packaged_tuna` the shelf band is wall-to-wall facings. A
large part of what makes a 45x32 render tile read as beige slabs is the shelf
deck, upright, rail, pegboard and floor between the facings, and **none of that
is in `pack.js`** — it is the planogram, in `products.js` and `store.js`. Stated
with the render side only: nobody has run a symmetric product mask on a
photograph, and until someone does this is a direction, not a measurement.

## A TOLERANCE NOBODY DERIVED IS NOT AN ASSERTION

`decodeSelfTest()`'s first draft asserted that bare stock decodes to the stock
vector times g. **It fired, and the code was right** — the print-saturation step
scales chroma about luma and the stock is not neutral. Its second draft asserted
a full spot is brand-independent to within 0.02; **that fired too, and the code
was right again**: `foodB` clamps its amount to 0.97 and quantizes to 62 steps,
so the strongest spot the palette can encode is amt **0.949**, and 5% of the
base always shows through. The bound is now that arithmetic rather than a
number somebody liked. Both misfires were cheap and both were informative;
a guard that has never been wrong has probably never been tested.

## THE SPOT INKS EXISTED SINCE ROUND 5 AND WERE ONLY EVER USED INSIDE THE PHOTO BOX

Every band, plate, ribbon, keyline and roundel in `pack.js` was drawn with `ink(r, g)` — `r` is
how much of the **one** per-instance brand colour covers the texel, `g` is print brightness. The
**`b` channel, four spot inks the shader has decoded since round 5, was written ONLY inside
`depict()`'s photo box.**

So a facing's entire chromatic vocabulary was: paper stock, **one** brand hue, and whatever the
depiction painted. **Everything that looked like structure was that same hue at another
brightness** — which is exactly what "a flat colour field wearing a vector glyph" means, and it
had been sitting under a decoded-but-unwritten channel for seventeen rounds.

`src/store/press.js` spends those existing spots on the face's large structure — two spot inks
per cell, 3-5 zones with hard keylines, a full-height edge column with a tick repeat, a framed
paper panel, a continuous-tone field. **No new channel, no shader edit, no new texture.** Draw
calls **176** and 1,926,636 triangles **byte-identical with the dial on, off and restored**;
atlases 21.6 MB and store textures 120.2 MB unchanged.

One rule both sides — 144 render windows over 6 poses against 96 photograph windows over 6 of 14
reference files, every window one package face brought to **22 px**, the render's own median
delivered facing width:

                     flat p10/p50/p90        cover50 p10/p50/p90
    photographs      0.052 0.103 0.308        3   10   23
    render r21       0.085 0.223 0.479        2    3   11
    render r22       0.081 0.192 0.436        2    5   12

Within-face `da*` 10.4 -> 17.5 against a photograph's 22.7; `db*` 19.2 -> 25.8 against 30.7.
**And the control that makes those numbers mean anything:** windows on manifestly flat regions
read `cover50` **2 on photographs and 2 on the render** — the statistic is not counting sensor
noise.

## EVERY PROBE RE-BAKE IN THIS REPO HAS MEASURED AN ATLAS THE GAME DOES NOT SHIP

**`sampleGround` skipped the contrast correction under `PROBE`, not just the ledger write.** So
every probe re-bake this project has ever taken — `endsSwap('r19')`, every `sheet.js` ablation —
**carried ghosted wordmarks the shipped atlas does not have: 10.41% of the carton atlas's texels,
207,947 of them in the print channel.**

**And a load-time bake is not the same artefact as a re-bake even after that fix.** All 7 carton
cells that draw no depiction are byte-identical; **all 41 that do differ**, because `depict.js`
holds three **grow-only scratch canvases**. Any A/B that re-bakes one arm and not the other is
comparing two atlases. `pressSwap` works around it by re-baking **both** arms.

**A probe mode that takes a different code path from the shipped path is not a probe of the
shipped thing.** This is the same disease as `renderer.info` after an in-game step and the
`storeOnly` leak: the instrument changed the artefact.

## A CENSUS THAT MANUFACTURED ITS OWN GAP, CAUGHT BY ITS AUTHOR

The round's **first two** census versions put **77% of the render windows on shelf lips, rails
and back ranks** while the photograph side was cut onto real facings. It was fixed by gating on
`PKG_STAGE` 7, and **the broken contact sheet is kept as `shots/r22_win_render_bad.png`.**

**If your rule selects the two populations differently, you are measuring the selector.** That is
now the third distinct form of this on the project, after the ablation-vs-rectangle masks and the
promo-signage crop.

## Refutations published next to the headline, and one dial shipped inert-ish on stated grounds
- **At 45x32 the classes are still trivially separable by eye.** The round moved the cue by
  roughly **a quarter of the gap** and did not close it.
- On the previous critic's own `near_a4` crop, **two of three facings are materially unchanged** —
  the press works at the top, bottom and one edge of a cell, so a crop of the middle of a
  top-stock case still sees a brand field and a column.
- **The tone half is nearly redundant with the ink half**: ink alone reaches the shipped figure on
  every column. It ships on stated grounds — bake-time only, 0.35-0.73% of product luma against
  the ink half's +4.6% — with the negative result written above it.

## Two structural limits handed forward, both outside `pack.js`
- **No cool spot ink.** A warm-branded carton cannot carry a blue panel; that needs a fifth `b`
  band across **4 files, 6 sites**, enumerated by grep in `press.js`'s header. **Three of the four
  spots sit inside one 60-degree Lab family**, so hue-family count does not move.
- **20.9-69.1% of a render frame is product by the shader's own mask; the rest is warm-neutral
  fixture** — a large part of what the 45x32 sheet reads as slab, and it is `products.js` /
  `store.js`, not packaging. **Stated render-side only: nobody has ever run a symmetric mask on a
  photograph.** Until someone does, it is a lead and not a finding.

## ROUND 22 SCORED 20/20, AND ITS STATISTIC TURNED OUT TO BE THE CODEC

    r22 press   (blind_js33j419)   9/9  = 100%
    r21 control (blind_i6tr5mub)  11/11 = 100%
    overall                       20/20 = 100%

Every render tile called at first glance; none close. Twenty-two rounds.

**The builder's own refutation was right and understated.** Both arms are the same `near_a4`
pose, so a direct pixel diff is valid: the press changed 25.8% of the frame, but inside the
builder's own crop the change sits in **three narrow columns** while the facing **interiors moved
0.0%, 3.9% and 0.5%.** The press edits facing EDGES and leaves the interior field as flat as it
was.

**FACING FLATNESS IS RETIRED, AND THE REASON GENERALISES.** Photograph tiles are crops of 4:2:0
JPEGs; render tiles were clean PNG. Applying **one identical JPEG round-trip to both classes**:

    raw gap                    r21 +0.045    r22 +0.031
    after symmetric control    r21 +0.010    r22 -0.010   (stable, monotone, quality 75-95)

**Round 22 did not close a quarter of the gap. It eliminated the gap and overshot** — r22 facings
are now *less* flat than real photographs on a level playing field, **and recall stayed perfect.**

**APPLY A SYMMETRIC CODEC CONTROL TO ANY STATISTIC COMPARED ACROSS THE RENDER/PHOTOGRAPH
BOUNDARY.** Round 8 learned to calibrate an instrument by injecting a known signal through the
reference's own encoder; this is the same lesson arriving from the other direction, and it has
now cost a round.

Also retired as a genuine negative: **edge transition width**, render 2.00-2.02 px against photo
1.79-2.10 px, fully overlapping. **The render is properly anti-aliased; edge optics are not a cue.**

## TWO HARNESS DEFECTS IN THE BLIND SET ITSELF — one of them scored the test on its own

**1. FILE SIZE SEPARATED THE CLASSES PERFECTLY.** Measured by the lead on both shipped sets:

    blind_js33j419   render max 600,898   photo min 870,709   SEPARABLE, gap 269,811 bytes
    blind_i6tr5mub   render max 569,370   photo min 845,238   SEPARABLE, gap 275,868 bytes

**Total separation, no overlap. A critic could have scored 100% from `ls` without looking at a
picture.** Round 22's critic saw the sizes in its first listing, **did not use them, and gave a
visual reason for every sealed call** — which is the only reason that round's score is worth
anything.

Fixed in `tools/r22_blindset.py`: every tile, both classes, now goes through **one encoder at one
quality in the reference set's own 4:2:0**. Verified by re-encoding the shipped sets through it —
render 148,809-165,263 against photo 141,848-240,524, **overlapping, leak closed.** It fixes the
codec contamination above at the same time, because they were the same asymmetry.

**2. THE RENDER SIDE OF EACH SET WAS ONE FRAME.** Every render tile is a 720-wide window of a
single `near_a4` render, pixel-identical on overlaps. **Effective sample is n = 1 pose per arm,
not 9 and 11**, so no population statistic on the render side of those sets means anything. The
class calls survive — a tell visible in one frame is still a tell — but nothing quantitative does.

## THE CUE: FACINGS PRESENT NO THIRD DIMENSION — and the critic's MECHANISM is wrong

The observation is right and `shots/r22_critic_no_third_dimension.png` panel C is decisive: three
adjacent render facings at identical depth and angle with **pure black voids** between them,
against photographed cartons showing **top faces, side faces, varied angle, and print wrapping the
corner.** Round 22 painted a gold side panel **onto the billboard**, and the critic's test of it
is the round's gift: 11 named instances, band width mean 4.09 px, sd 1.78, and
**corr(|offset from optical axis|, width) = −0.24 — NEGATIVE.** The widest bands sit near the
axis, the narrowest at the frame edge. **A real side face must widen toward the edge and flip
sides across the axis.** No painted texture can do that, which is why four spot inks bought
nothing.

**But they are NOT billboards.** Measured live by the lead before dispatching the next round:

    120 instanced meshes, 69,608 instances, ZERO flat meshes in the scene
    every package mesh: 24 vertices, unit-cube bbox dx=dy=dz=1.000
    per-instance depth scale (run0/run1/run5): p05 0.102-0.107, p50 0.146-0.153, p95 0.175-0.210
    yaw is not locked: only 9.1-11.0% of instances sit within 1 degree of the modal yaw

**They are boxes, they already have depth, and the round is about PRESENTING geometry rather than
adding it.** A box whose front face is co-planar with its neighbours', packed shoulder to
shoulder, at a yaw that never turns a side toward the camera, renders as a billboard. Round 20's
own figure says where it comes from: rigid crossing at 5 mm is 6.92%, so **about 93% of rigid
facings still sit within 5 mm of one plane.**

**Check a critic's mechanism against the artefact before you brief a round on it.** The
observation and the explanation are separate claims and this critic got one of each.

## THE ACCEPTANCE TEST DID NOT MOVE, AND THE ROUND EXPLAINED WHY RATHER THAN EXCUSING IT

Round 23 was dispatched against the critic's falsifiable test: a real side face must **widen
toward the frame edge and flip sides across the optical axis**, from a measured `corr` of −0.24.

**Half of that test was already passing and could not have failed.** The visible side swaps
across the axis on **0.993 / 0.959 / 1.000** of bands at near_a1/a4/a7. **It had to — it is a
projection.** Half a falsifiable test was tautological, and nobody noticed when it was written.

**The width half did not move:** `corr(|offset|, band/own facing)` 0.036 / 0.286 / 0.093 ->
0.075 / 0.284 / 0.068, slopes 0.18/1.44/0.79 -> 0.43/1.59/0.75 per thousand px against standard
errors of 0.27/0.19/0.41 — one pose within noise, two flat.

**The diagnosis is in the intercepts: 0.39 and 0.51 at the optical axis, where perspective says a
side face should be invisible.** So the census population is not what the cue is about — it is
dominated by face-turned units, block ends against holes, and front-vs-back-rank pairs at
150-200 mm **regardless of offset**, while the rank-and-file seam in the critic's own Panel C is a
minority of it. **Widening that seam cannot move a correlation taken over the whole set.**

**A test can be falsifiable, correctly executed, and still measure the wrong population.** Check
what a proposed acceptance test would include before you write a round against it — the lead
adopted this one from the critic without checking its denominator.

## THE ARITHMETIC OF A SIDE BAND, and "the voids ARE the side faces"

For a facing at lateral offset X occluded by its neighbour, the side band projects to

    f * (X*delta + gap*D) / (D * (D + delta))

**All of the offset dependence sits in `delta`, the depth step to the facing beside it.** Read off
a depth pass **at the band** — no bucketing, since the two facings either side of a band are
adjacent by construction — median delta was **10.5 / 9.5 / 47.7 mm**, with **36.6 / 32.2 / 26.7%
of adjacent pairs inside 5 mm.** At that stagger the constant `gap*D` term is the entire band.

And the source of the co-planarity was one line: **`fillBackRow` had `back = pd/2 + 0.008` —
every box in a rank exactly co-planar, and that is 90% of the 30,231 carton instances.**

## A ROTATION EXTENT CHARGED ALONG THE WRONG AXIS, for every leaning unit in the store

`place()` charged `half + lean`, with `lean = |sin(roll)| * sy/2`. **The composed rotation is
`Rx(roll) * Ry(yaw)`, whose row 0 — the extent along world X, which every Z-axis run faces
along — has no roll term in it at all.** So every leaning, crushed and knocked-over facing on the
main gondolas was pushed back by up to **172 mm to pay for a swing that happens along the aisle.**

    Z-runs: p99 99.7 mm, max 172.3 mm, 3.97% of 34,892 instances over 20 mm
    X-runs: max 5.9 mm, exactly as the arithmetic predicts

`extentAlong` is the one owner now; `sideCheck` asserts it against the live instance matrices
(clean on 42,328, worst 5.8e-6 mm, **638 skipped and named** — they carry a third Euler term and
are pushed by other files), and `sideSelfTest` fires it on the round-22 expression at **229.6 mm**.
**A guard proven against the exact expression it replaced.**

## Two instrument failures kept in the probe's comments

- The first stagger census **recovered the shelf plane as a quantile of the instances it was
  measuring**, kept back rank 1, and reported the **175 mm rank pitch as a facing stagger.** Fixed
  by exporting `facePlanes()` — `faceOf` already documented why `f.lip` is not the plane.
- The first census **scanned every subpixel row of one deck band, counting one facing pair 692
  times**, so two builds whose geometry demonstrably differed **read the same to two decimals.**

## Handed forward: TOP FACES ARE A HEADROOM PROBLEM, NOT A DEPTH ONE

Package pixels showing a top face: **6.0 / 4.4 / 2.8%**, and the depth comb moves it under half a
point. On matched 115-px-per-facing crops (`shots/r23_fig_ref.png`):
`store_00_Drinks_aisle_of_Smith_s_Food_and_Drug` (1400,840)-(1860,1000) shows **a top face on 4 of
4 front cartons with the rank behind visible over the top**; `near_a4` (180,300)-(460,420) shows
**0 of 3**.

Cause: **`fillShelf` caps `h` at `headroom − 0.03` and stacks to `floor((headroom − 0.015)/h)`, so
the front rank reaches within 15-30 mm of the deck above.** It is a planogram change with a
density cost — its own round, its own control.

Also standing: **side faces render at 14-38% of the front face beside them** and the comb does not
change that (0.238/0.138/0.380 -> 0.239/0.148/0.367) — packages have shadows off, so it is Lambert
plus `light.js`'s AO against a normal pointing along the aisle, not `products.js`.

**And a change declined with its reason, which is the right way to decline one:** the builder did
**not** raise yaw, because yaw adds an offset-*independent* side-face term that **would have made
the axis correlation worse while looking more like the reference.** Stated rather than done.

## THE LEAD SHIPPED A VACUOUS GUARD, ONE ROUND AFTER WRITING THIS FILE'S ENTRY ABOUT THEM

Round 23's critic found the blind sets were built from **one pose**. The lead "fixed" it in
`tools/r22_blindset.py` with a guard that **counted pose FILES that existed on disk** — and every
pose file existed. Round 24's builder caught it: at `MIN_PROD 0.55` the per-pose **yield** on both
arms is `near_a4 15, everything else 0`. Frames all present, guard green, set still n=1.

Reproduced by the lead on `r22on` after rewriting the guard to count **contributing poses**:

    blindset: arm 'r22on' yielded tiles from only 1 pose(s) {'near_a4': 15} at MIN_PROD 0.55
    (frames present: near_a1, near_a4, near_a7, chase_a1, chase_a4, chase_a6)

**A check that certifies something it cannot see, written by the person maintaining the ledger of
checks that certify what they cannot see.** The second half was missing too: a pool spread over
three poses can still be *sampled* nine-from-one, so selection now deals round-robin over
contributing poses. **Prove a guard against the exact corruption it exists to catch, every time,
including when you are the lead and it is only a tool script.**

## THE ROUND REFUTED ITS OWN ACCEPTANCE TEST'S PREMISE

The test handed down was "variance of side-face width among units at the same offset, **near zero
in the render by construction**." **It was never near zero.** Ungated pooled within-bin CV on the
control: **1.98 / 2.36 / 2.66** — because that band population is the same contaminated one that
broke round 23's correlation, and the distribution is right-skewed (median 0.10, p99 2.5-12.7), so
a mean/sd estimator reports its own tail.

**And the ratio's denominator moves with the treatment**: `ownW` is a contiguous front-face *run*,
not a facing, and turning one unit **splits the run it belonged to**. On the gated population the
test **does not move in one direction and its two estimators disagree at two of three poses** —
published next to the headline rather than buried.

**Two acceptance tests in a row have now been adopted from a critic and turned out to measure the
wrong thing.** Round 23's was half tautological; round 24's had a false premise and a
treatment-dependent denominator. **Before adopting a proposed test, measure its control.**

## What moved, off the geometry where it is exact and offset-free

Front-rank rigid cartons matched against `facePlanes()` — never a quantile of the measured
population — n = 3,022 -> 3,012, selector moved 0.33%:

    roll IQR, Z-runs           1.26 deg -> 4.53 deg
    yaw IQR, Z-runs            4.93 deg -> 8.42 deg
    per-unit side face p50     5.74 mm  -> 10.38 mm
    top step, adjacent p50     3.77 mm  -> 7.50 mm   (under 5 mm: 59.8% -> 36.2%)
    world gap p50              +1.12 mm -> -7.04 mm  (touching: 45.6% -> 68.1%)

**SLOT WIDTH IS NOT A GAP.** 45.6% of adjacent front-rank pairs were **already touching or
interpenetrating** in world space at a median gap of 1.12 mm. The "constant-width slots" a critic
sees between facings are the near facing's **side face** — round 23's finding, confirmed from the
other direction. **Slot width is orientation.**

Only one image-space quantity moved monotonically at 3 of 3 poses: **side-face pixel share**,
16.08 -> 17.31, 8.06 -> 9.16, 14.88 -> 16.00% of package pixels.

## `drawSig()` — proving two arms are the same store, and catching a live bug doing it

Every fill call's key **and draw count** folded into one FNV. Both arms: **sig 2294903825, 814
fill calls, 526,234 draws**, 42,966 instances, per-mesh counts identical, instance-colour buffers
byte-identical.

**It caught a real bug immediately, of exactly the shape round 23 argued could not happen.** The
leftover-on-top test ends `&& rng() < 0.17`, **which short-circuits**, and its gate moved with the
new per-unit height — so 5 of 814 fill calls made a different number of draws and the arms came
back **42,966 against 42,965**. Fixed by carrying `syNom`, the height *without* `rise`, because the
wrong-states **reassign** `sy` and dividing the rise back out of a reassigned value is not the
nominal. **A hashed dial is only instance-for-instance if nothing downstream consumes the rng
conditionally.**

## `seat`, and a corner that had been buried in the shelf board

`seat` is the one owner of how far a rotated package's centre must rise so its lowest corner rests
on the deck — **row 1 of the same `Rx(roll)·Ry(yaw)` that `facet.js` owns rows 0 and 2 of.**
`seatCheck` asserts it against live instance matrices (**42,328 clean, worst 4.4e-6 mm**);
`seatSelfTest` fires on the Z-run-only expression it replaced at **72.72 mm** and proves
`seat(pi/2, pi/2, ...) === -h/2 + sx/2` exactly. It also fixed a pre-existing defect: `crushed`
rolls to 0.17 rad and had been **burying a corner about 10 mm into the shelf board.**

## A negative result, and a scope statement that is the honest half of the round

**The least-squares residual of top-corner HEIGHTS about a fitted line did not move** (7.49->7.41,
9.36->9.38, 20.29->20.15 px). At 9-17 m those ranks span several bays and the residual is
dominated by block-to-block height; **4 mm of world is 0.3 px there.** The world-space top step is
what moved.

**Where it stops mattering:** side face from a turn is `frontRunPx * (sz/sx) * |sin θ|`, which at
the median turn is 1 px at ~18 px of front-run width. Front-run width over 20 px is **78.6 / 84.0
/ 41.5% at the near poses and 11.5 / 11.4 / 10.6% at the chase poses (median 4.0 px)**. **At chase
range every term in this round is a twentieth of a pixel.** It is a near-pose change and the tail
of the chase poses, by its own arithmetic.

## QUEUED CONTRACT BUG: the occupancy sink reads the wrong Euler

`Batch.push` in `src/store/kit.js` computes `hy = |cos(ez)|*sy + |sin(ez)|*sx` — reading roll from
the **Z** Euler. But `place()` pushes `(roll, yaw, 0)`, so **`ez` is identically zero for every
package and the field is simply told `sy`.** Against the true row-1 extent over all 42,966 package
instances:

    control  12.48% wrong by >5 mm,  4.56% by >20 mm,  max 297.9 mm
    r24      39.17% wrong by >5 mm,  9.59% by >20 mm,  max 297.9 mm

**The defect and its maximum pre-date round 24** (the knocked-over population); round 24 triples
the population it touches. The one-line fix is to make `hy` twice the row-1 half-extent of the
composed rotation — exactly `2 * seatExtent(...)`. **The builder deliberately did not take it,
because it moves the light field and would contaminate its own A/B.** Correct call. It needs its
own round and its own control. The intrusion census does not detect it (f60 0.278->0.280, f100 and
f150 identical), so **its lit consequence is currently unmeasured.**

## ROUND 24: 18/18, AND A CRITIC RAN A FORCED CHOICE ON ITSELF

    overall render-recall   18/18 = 100%
    r24on                    9/9
    r24off (control)         9/9

First glance equalled considered on every tile. **Twenty-five rounds at 100%.**

**THE BEST "IS IT VISIBLE" INSTRUMENT THIS PROJECT HAS PRODUCED.** The keys showed the two arms
were the same nine crops rendered twice, so the critic put both arms side by side at full
resolution, randomised left/right, key hidden, **knowing exactly what to look for** — and scored
**5 of 9. Chance.** On the four it felt moderately confident about: **2 of 4.** The change is large
in pixels (6.9-20.2 mean absolute difference; 17-48% of pixels moved more than 8 levels).

Its explanation: **what it thought it saw is present in BOTH arms** — the control's existing
knocked-over deco swamps the added per-unit yaw and roll. **Third round running of measured
geometry moved, percept did not.** A self-administered forced choice on a matched pair costs
minutes and is worth more than any statistic; run one before claiming a change is visible.

**And it sharpened the builder's refutation rather than accepting it.** The ungated CV of
1.98/2.36/2.66 does **not** refute the "near zero by construction" premise — *a high CV on a
population the builder itself calls contaminated says the sample was never clean, not that the
store has real variance.* The real refutation is the second half: on the gated population the
statistic does not move in one direction and its two estimators disagree at two of three poses.

**But the premise died a third way, and this is the important one:** *"I couldn't see the cue
before or after, so global orientation was never carrying the discrimination and un-globalising it
couldn't have cost anything."* **A cue named from a still image may not be what the caller is
actually using.**

## THE SCALE LADDER — where the discrimination actually lives

Measured blind, three times, by the same critic:

    46 px patches      14/20
    240 px shelf bays  18/18
    720 px tiles       18/18

> "A lone face gives no reference for 'glossy'; a bay puts five materials under one light, and the
> render returns all five as the same matte substance in different colours."

**The discrimination is in the CONTRAST BETWEEN MATERIALS UNDER ONE LIGHT, not in any single
surface.** That explains why every per-face statistic this project has built eventually failed,
and it says any acceptance test should be a *between-family* profile inside one bay.

    RENDER bay   jar 0.84   film pouch 0.68   lip 0.66      (luma p99.5)
    PHOTO  bay   carton 0.85   film wrap 1.00   lip 0.99

**The film pouch — the glossiest thing on a real shelf — is darker than the rigid jar beside it.**

## AND THE MECHANISM IS WRONG AGAIN: there is not one BRDF

The lead checked before dispatching. `src/store.js` has carried **four distinct per-family Phong
specs since round 2** — box shininess 14, can 58, bottle 96, bag 34, each with its own gloss curve
— and **the bag has the highest gloss coefficient of the four and reads darkest in frame.**

The answer is already written in that file, in the round-13 note directly beneath the constants:
**"the specular has existed since round 2 and has never once put a highlight on a product facing,"**
because the lights sit at 66.8 and 26.6 degrees of elevation and the mirror direction off a
vertical facing points into the floor. **It is a DELIVERY failure, not an authoring one.**

**That is the third consecutive critic whose observation was right and whose mechanism was wrong**
(billboards that are boxes, one BRDF that is four, and orientation that was never the cue).
**Check a proposed mechanism against the source before you brief a round on it.**

## Negative results worth keeping
- **Whole-tile clipped-white does NOT separate**: renders 0.24-3.14%, photographs 0.01-2.92%,
  overlapping. The critic explicitly refused to claim the render never clips. **"Make more pixels
  clip" is not the target — WHICH materials clip is.**
- **Three per-face statistics failed under symmetric codec control** at q88/q72/q60: bright-tail
  saturation ratio, high-pass p99, top-8%-luma set thickness.
- It twice declared a region that straddled a face boundary and a cavity, producing a bogus 21%
  and a bogus 9.28 **before catching it**. "Look inside every box" keeps earning its place.

## LEAKS 5 AND 6, FOUND AND CLOSED — the harness ledger is now six deep

**LEAK 5 was live in the r24on arm.** Every photograph in it was a vista or the floral department;
not one was a flat-on shelf face, so **subject matter alone partitions that arm perfectly.** The
critic's own calls were rendering-based and its framing-controlled 240 px re-test still gave
18/18, so the score survives — **but that arm did not test what it claimed to test.** Closed: the
photo pool is now restricted to the seven references that are themselves packed shelf face, listed
by prefix with the reason each of the other seven is excluded (frozen glass, two checkouts, a
Halloween display, a vista, two produce sections).

**LEAK 6, found by the same critic:** even after 4 and 5, **group SIZE partitioned the classes** —
9 render tiles over 3 poses against 2 photo files gives clusters of 3+3+3 against 6+6, separable
on the shape of the partition without judging a tile. Closed: both sides now draw an irregular
number of sources and are dealt with random per-source weights.

**Six leaks in this harness so far, three of them found by critics scoring through them.** A blind
test that leaks cannot register an improvement in the render no matter how good the render gets —
**the harness is a load-bearing instrument and it has been wrong more often than any single
statistic.**

## ROUND 25: THE STORE REALLY DID HAVE ONE LOBE, AND TWO OF THE FIVE AUTHORED FINISH PARAMETERS WERE NEVER READ

The round was dispatched with the mechanism pre-checked: `src/store.js` has carried four
per-family Phong specs since round 2, so "one BRDF" looked wrong. **It was right, and about
the half nobody had looked at.** Ablating each specular path separately, per-family masks,
restore hash-proven (`shots/_probe_r25.js`):

    path                                       carton    film    can   bottle    (linear luma p99.5)
    P1  three's Phong, off the two
        directionals, fed by shininess
        and by `specular`         near_a4     0.0003  0.0012      -   0.0424
                                  near_a7     0.0007  0.1559 0.1116  0.2919
    P2  light.js chopLamp .y lobe,
        fed by chopLampSpec       near_a7     0.0031  0.1629 0.1631  0.2837

**P2 read exactly ONE of the five parameters `store.js` authors per family: the gain.** The
lobe EXPONENT was `uLampCfg.y`, one global 60 for the whole building, and the `specular`
COLOUR — which is three's own F0 — was never read at all. So the store had four gains and
**one lobe shape**, and the two parameters that make a finish look like a finish rather than
like brighter paint were both delivered down a path measured at zero.

**ROUND 13'S GEOMETRY IS STILL EXACTLY RIGHT, BUT ONLY FOR FLAT VERTICAL FACINGS.** P1 is
0.0003-0.0007 on cartons at both poses — the mirror direction off a vertical facing points
into the floor, twelve rounds later. It is **not** dead on lathes and pillow bags, whose
normals sweep: 0.156 on film and 0.292 on bottles at near_a7. The claim in `store.js`'s
round-13 note needs that qualifier or the next round will ablate the wrong path.

## THE LOSS IS THE LOBE WIDTH, AND IT IS A LOTTERY, NOT A GATE

The obvious suspect was the `RA > 0` visibility gate. It is not: a CPU read of the shader's
own predicate over the real instance matrices at near_a7 says **93.8-94.3% of facings CAN see
at least one row.** What kills it is the exponent:

    ct at the best row      p50 0.887-0.914     p99 0.992-0.997
    pow( ct, 60 )           p50 0.0007-0.0044   p99 0.60-0.83

**The median facing's lobe is three orders of magnitude below the p99 facing's**, so a
highlight is all-or-nothing per face. 50.6% of film pixels and 78.8% of carton pixels get a
lobe of exactly zero at near_a4. In a photograph every pouch on the shelf flares; here it is
a draw.

## WHAT SHIPPED, ONE UNIFORM AWAY FROM OFF

`uLampFinOn` (and `?flatfin`), 0 = round 24 byte for byte. Per material, resolved in
`patchAO` from what the material itself declares — `shininess` and `specular`, read, never
copied:

  * **the two lobes are combined, not swapped.** `uLampCfg.y` is the SOURCE's angular size
    (the file's own note: a tighter lobe draws a lamp narrower than the lamp is); shininess
    is roughness. `1/n_eff = 1/n_src + 1/n_mat`, so carton 14 -> 11.4, film 34 -> 21.7,
    can 58 -> 29.5, bottle 96 -> 36.9. The bottle's authored 96 had been drawing a lamp
    narrower than the lamp.
  * **Schlick Fresnel, gated by roughness against `uLampCfg.y`** and not against a copy of
    the four shininesses. Exactly 1.0 at normal incidence, so round 13's swept gains keep
    their meaning and the term only adds where a dielectric adds. There had been no Fresnel
    anywhere in the file, and a camera down an aisle sees every facing at 60-85 degrees.
  * **a derived finish for the 12 lit materials that authored none.** 210 materials in the
    scene, **exactly 4 carried a `chopLampSpec`** — the four package families. `fixtures`
    (17,648 instances: every deck, lip, kick, rail, upright), `tubes`, `produce`, `uprights`,
    `backPanels` and the steel all resolved to 0, and P1 is dead on them, so the whole
    fixture half of the store was a perfect Lambertian.

## THE ROUND'S OWN INSTRUMENT REFUTED ITS FIRST VERSION, MONOTONICALLY

Draft one divided by the Phong lobe normalisation `(n_eff+2)/(n_src+2)`. Swept live, one
declared bay at near_a7, sRGB luma p99.5, `n_eff` scaled by `s`:

    s              0.25   0.5     1     2     4   |  round-24 lobe
    can           0.749 0.756 0.768 0.780 0.784   |  0.784
    film          0.570 0.585 0.604 0.625 0.652   |  0.694

**Monotone downward in every column.** The normalisation was buying lobe coverage out of the
peak, and p99.5 is a peak statistic. It is dropped, and the reason is not only the sweep: the
peak radiance of a highlight is the source's radiance times F and does not depend on the lobe
width, and `store.js` already authors a separate gain, so normalising made the exponent carry
"how reflective" a second time.

## THE PROFILE, BOTH SIDES, ONE RULE — sRGB luma p99.5, one bay each, symmetric q88 4:2:0

`tools/r25_bayprofile.py`. Class membership on the render side is the package shader's own
PKG_STAGE 7 mask per family plus a lit-fixture lip class inside `__R21L`'s world-anchored
zero-thickness lip quad; the photograph's four boxes are declared, then looked at at 3x
(`shots/r25_ref_boxes2.png`).

                     carton    film     can     lip
    PHOTOGRAPH        0.685   0.867   0.897   0.867     store_01 canned and packaged tuna
    r25off            0.632   0.853   0.813   0.675
    r25on             0.633   0.891   0.840   0.675

Stable at raw / q95 / q88 / q72 — render drift <= 0.008, photograph <= 0.02, so none of it is
the codec.

**THE BRIEFED PREMISE DOES NOT REPRODUCE.** The round was dispatched on "in the photograph,
film and metal CLIP and the carton does not — 0.85 / 1.00 / 0.99. That spread IS the
material." On a subject-matched photograph measured this way **nothing clips**: 0.685 /
0.867 / 0.897 / 0.867, and the rigid metal can is marginally ABOVE the film pouch. The
ordering survives (carton lowest, film near the top); the clipping does not. **A profile read
off one tile is a profile of that tile.**

Also: the published render numbers were in sRGB-ENCODED luma, not linear. The same render bay
reads 0.62 / 0.69 / 0.41 linear. The lip agreeing to 0.67 against the critic's 0.66 is what
identified the space. **Say which luma space a profile is in or the two sides are not
comparable.**

## WHAT DID NOT MOVE, AND WHY IT COULD NOT

**The lip did not move at all in the headline bay (0.675 both arms) and it is now the largest
gap in the profile by 3.6x** (0.192 against carton's 0.053). It has a gain now; it has no
lobe. Of the lit lip pixels inside the declared quads, **2.13% at near_a1 and 26.43% at
near_a7 have a non-zero lobe** — a lip is a vertical surface at aisle height, so its mirror
direction is the camera's elevation flipped, and it points at the floor. Fresnel multiplies a
zero. **A gain cannot fix a geometry.**

**The carton did not move at 10 of 10 bays.** Its p99.5 pixels are the brightest DIFFUSE
print, and the pixels that carry a lobe are different pixels. In a photograph they are the
same pixels. That is the next mechanism and it is not a gain either.

## THE CAP IS ONE CONSTANT AND IT IS IN store.js

Swept live at near_a7, `uLampCfg.w`, sRGB p99.5:

    lampSpecScale   0.18    0.50    1.00    2.00
    can            0.784   0.913   1.000   1.000
    film           0.816   0.930   1.000   1.000
    lip            0.741   0.808   0.895   0.997
    carton         0.670   0.670   0.670   0.670   (never moves at any scale)

**0.18 caps every material's specular at 0.18 x its gain**, so the carton's ceiling is 0.047
linear against a measured contribution of 0.003. Filed as a contract request with all 26
constants enumerated from source, not six of seven.

## COST, AND WHERE IT STOPS MATTERING

Draw calls 176 / 431 identical, triangles identical, **program count 37 identical** — the two
new uniforms did not fork the shader cache. `renderer.render` p50 0.4 / 0.6-0.7 ms both arms;
full `step(1/60)` p50 1.5 / 1.5 / 1.6 ms on / off / on-again, and the p99 tail moved more
between two runs of the SAME arm (17.1 then 13.5) than between arms, so it is not separable.
rAF frame time is not measurable in a backgrounded tab and was not quoted.

Unlike round 24, this is a shading change and does not thin out with distance: package pixels
moving more than one 8-bit level are **24.4 / 18.4 / 20.2% at the near poses and 37.0 / 24.3 /
29.4% at the chase poses.** It stops mattering on cartons (median delta 0.0000 at both near
poses) and on any surface whose mirror direction misses every row.

## THREE INSTRUMENT FAILURES, KEPT

  * **The first lip box was 40-70% price tag.** `shots/r25_bay_zoom.png` is the picture: the
    40 mm band under a deck is where the price rail hangs, a price tag is a MeshBasic, and
    unlit printed paper pinned the class at p99.5 0.98 — which looked like the render already
    matching the photograph's 0.99. Fixed by the predicate that defines an unlit pixel rather
    than by a name list: **it does not move when every light in the scene goes to zero.**
  * **A sweep that silently did nothing.** `t.us = m.userData.chopLampU.value` is a NUMBER,
    so `t.us.value = x` wrote a property on a primitive and threw nothing. Two sweep rows came
    back matching an earlier table to three decimals, which is what caught it. This is the
    third time this repo has published a control that was not off.
  * **The per-family masks disagree with the union mask by exactly 1 pixel** at chase_a1 and
    chase_a6 (0 at the other four). An anti-aliased edge where blacking one family changes
    which surface wins. Stated rather than rounded away.

## GUARDS

`finCheck()` reads the LIVE bound uniform (`m.userData.chopFinU`), not a re-derivation of
`finishOf()` — the four package materials had no bound `chopLampU` at all until the first
render, and a check that called `finishOf` twice would have passed on a build where the
uniform was never written. Denominator stated: **210 materials, 34 patched, 34 bound, 4
authored, 12 derived, 18 unlit, 0 bad.** `finSelfTest()` fires it on the exact round-24
expression it replaced (one global exponent, `uLampFin.x = 0`) and catches **5 of the 5
materials that carry a shininess to disagree with** — the other 29 legitimately have none,
which is why the number is 5 and not 34.

**The two arms are the same store, proven in image space:** the PKG_STAGE 7 silhouette is
identical pixel for pixel at all six poses (348260 / 625892 / 282790 / 191823 / 234464 /
221181, diff 0). The change is one uniform and consumes no `rng` draw.

## THE QUEUED kit.js EULER BUG WAS NOT TAKEN

`Batch.push`'s `hy` still reads roll from the Z Euler. Declined for the same reason round 24
declined it — it moves the occupancy field, which is the input to every term in this file,
and folding it in would have contaminated the A/B. It is still queued and its lit consequence
is still unmeasured.

## CONTRACT REQUEST r25 -> store.js OWNER. 26 constants, enumerated from source

Round 21's request named six constants and there were seven, and the seventh was the exact
defect the request existed to close. So this lists **everything in `src/store.js` that touches
the specular path**, marked REQUESTED or NAMED-NOT-REQUESTED, with line numbers as of this
round.

REQUESTED — the delivery cap, and it is one number:

     1  4513  lampSpecScale: 0.18   ->  0.45.  It multiplies EVERY material's specular gain,
              so the carton's ceiling is 0.047 linear against a measured 0.003. Swept live at
              near_a7 (table above): 0.50 puts the can at 0.913 and the film at 0.930 against
              a photograph's 0.897 / 0.867, and 1.00 clips both. 0.45 lands the two families
              that have a lobe on the photograph and leaves headroom.

REQUESTED — the fixtures, which have no finish to author into:

     2   589  fix:   MeshLambertMaterial({ color: 0xffffff })   17,648 instances, plus
                     `tubes` 1,232 and `produce` 2,896 share this exact material
     3   590  wood:  MeshLambertMaterial({ map: T.wood })
     4  4633  uprights   MeshLambertMaterial({ map: T.slot,  color: 0xf6f0dd })
     5  4634  backPanels MeshLambertMaterial({ map: T.peg,   color: 0xece8dc })
     6  1049  MeshLambertMaterial({ map: t, color: 0xf3ead4 })
     7  1961  domeMat MeshLambertMaterial({ color: 0x2c2f33 })
              Request: set `userData.chopLampSpec` on each — 0.55 reproduces what light.js
              currently supplies as FIX_GAIN, so the number moves house without changing a
              pixel, and the authoring then lives where the other four gains live. FIX_GAIN
              is the ONE value in light.js's finish ladder that is authoring rather than
              physics (DIELECTRIC_F0 = 0.04 is Schlick for n = 1.5 and is not a taste dial),
              and it should not be in light.js.

NAMED, NOT REQUESTED — already reached by the derived path, or measured inert:

     8   591  steel: MeshPhongMaterial shininess 42
     9   592  steel: specular 0x6a665c        -> F0 0.139, lobe 24.7. Reaches the frame now.
    10  4513  lampGain: 0.45                  the DIFFUSE half. Round 14 proved the specular
                                              is byte-identical with it at 0. Unchanged.
    11    --  lampExp                         NEVER PASSED. `fieldUniforms` falls back to
                                              `?? 60`, so the reference lobe is light.js's,
                                              which is correct — it is the fixture's angular
                                              size and light.js owns the fixture geometry.
                                              Recorded because a reader looking for 60 in
                                              store.js will not find it.

NAMED, NOT REQUESTED — the per-family finish. All 16 now reach the frame; the ordering is
`store.js`'s call and this round did not touch it:

    12   574  pkgBox    shininess 14   13  574  specular 0x2b2924  (F0 0.0223, lobe 11.4)
    14   575  pkgBox    gloss  0.16 + 0.42 * chopM.g * chopM.g
    15   578  pkgCan    shininess 58   16  578  specular 0x8c8880  (F0 0.2474, lobe 29.5)
    17   579  pkgCan    gloss  0.45 + 0.95 * pow( chopM.g, 2.2 )
    18   582  pkgBottle shininess 96   19  582  specular 0xa39f95  (F0 0.3475, lobe 36.9)
    20   583  pkgBottle gloss  0.50 + 1.25 * pow( chopM.g, 2.6 )
    21   586  pkgBag    shininess 34   22  586  specular 0x8e8a80  (F0 0.2549, lobe 21.7)
    23   587  pkgBag    gloss  0.28 + 1.35 * pow( chopM.g, 3.2 )
    24   613  pkgBox.chopLampSpec    0.26
    25   614  pkgBag.chopLampSpec    0.72
    26   615  pkgCan.chopLampSpec    0.90   and 616 pkgBottle 1.15

Two observations a future round should have before it moves any of them:

  * **the four F0 values are really two.** carton 0.0223, then film 0.2549, can 0.2474,
    bottle 0.3475 — film and can are within 3% of each other. Four specular colours, two
    materials.
  * **the pouch is authored ROUGHER than the jar** (34 against 58), which is why the
    roughness gate gives it 0.51 of Schlick's rise against the can's 0.995. The r24 critic's
    cue is that film should out-flare rigid plastic. On the subject-matched photograph
    measured this round the can is actually 0.03 ABOVE the pouch, so the cue may be a
    property of that critic's tile rather than of photographs — **measure it on more than one
    reference before spending a round inverting these two constants.**

## THE LEAD'S CORRECTION WAS ITSELF HALF WRONG, AND THE BUILDER FOUND THE REAL SHAPE

Round 24's critic called **"one BRDF for the whole store."** The lead corrected it before
dispatching: `store.js` has carried **four distinct per-family Phong specs since round 2**, so it
is a delivery failure, not an authoring one. **That correction was half right and it mattered
which half.**

- **P1, three's own Phong off the two directionals** — the path fed by `shininess` and
  `specular`. Ablated, per-family masks, restore hash-proven: linear luma p99.5 **0.0003 / 0.0007**
  on cartons. Round 13's geometry holds twelve rounds on. **But it is NOT dead on lathes and
  pillow bags — 0.156 film, 0.292 bottle at near_a7. That qualifier was missing from both the
  round-13 note and the lead's brief.**
- **P2, `light.js`'s troffer lobe, carries everything — and read exactly ONE of the five
  parameters `store.js` authors: the gain.** The exponent was `uLampCfg.y`, **one global 60 for
  the entire building**, and the `specular` colour — three's own F0 — **was never read at all.**

**So the critic was closer to right than the lead's correction was: four gains, one lobe shape.**
Four authored materials collapsing to a single specular response is, functionally, one BRDF. The
lead checked that the constants existed and did not check that anything read them. **Existence in
the source is not delivery to the pixel — the same distinction this round was dispatched to
investigate, missed one level up.**

And the loss is not the visibility gate: **93.8-94.3% of facings can see a lamp row.** It is lobe
width. Median `pow(ct, 60)` is **0.0007-0.0044** against a p99 of **0.60-0.83** — so a highlight
is a per-face lottery and **half of every pouch is shaded as unfinished board.**

**Four of 210 materials in the scene carried a lamp specular at all.** `fixtures` — 17,648
instances, every deck, lip, kick, rail and upright — plus `tubes`, `produce`, `uprights`,
`backPanels` and steel: **zero. The fixture half of the store was a perfect Lambertian.**

## A CUE WHOSE OWN EVIDENCE WAS CONTAMINATED BY A HARNESS LEAK

Round 24's cue was "film and metal CLIP and the carton does not," at 0.85 / 1.00 / 0.99.
**It does not reproduce.** On a subject-matched photograph **nothing clips**:

                     carton    film     can     lip
    PHOTOGRAPH        0.685   0.867   0.897   0.867
    r25off            0.632   0.853   0.813   0.675
    r25on             0.633   0.891   0.840   0.675

sRGB luma p99.5, one bay each side, symmetric q88 4:2:0, stable raw/q95/q88/q72 with render drift
under 0.008 — **so none of it is the codec.** And **the rigid can sits 0.03 ABOVE the film
pouch**, the opposite of the claim that drove the round.

The cause is almost certainly **leak 5**: that critic's photograph bay came from a set whose photo
files were vistas and floral departments rather than shelf faces. **A harness leak does not only
corrupt a score — it can corrupt the CUE the next round is written against.** Leak 5 was closed
between those two rounds; the cue it produced had already been dispatched.

Second correction from the same round: **those numbers were sRGB-encoded, not linear.** The same
bay reads 0.62 / 0.69 / 0.41 linear. **State the encoding next to any luma figure.**

## Shipped, and the refutation it dropped on the way

Per-material lobe combined with the source's angular size — `1/n_eff = 1/n_src + 1/n_mat`, since
**the bottle's authored 96 had been drawing a lamp narrower than the lamp** — plus a
roughness-gated Schlick Fresnel, of which **there was none anywhere in the file**, and a derived
finish for the 12 lit materials that authored none. `finCheck` reads the live bound uniform: 210
materials, 34 patched, 34 bound, 0 bad. `finSelfTest` fires on the round-24 expression and catches
**5 of the 5** materials carrying a shininess.

**Its first version normalised the lobe by `(n+2)` and moved the acceptance statistic monotonically
the WRONG way** — film 0.570 -> 0.652 as the lobe narrowed, against 0.694 for the old lobe — and
was dropped rather than argued with.

## STANDING GAP: the lip, and it is structural

**The lip did not move and cannot.** It has a gain now, but only **2.13% (near_a1) and 26.43%
(near_a7) of lit lip pixels have any lobe at all**, because **a vertical surface at aisle height
reflects the floor.** At 0.675 against a photograph's 0.867 it is **the largest gap in the profile
by 3.6x**.

Also standing: **carton moved at 0 of 10 bays** — its p99.5 pixels are bright diffuse print and the
lobe lands on different pixels — and a global `lampSpecScale` of **0.18 caps everything**. Swept
live: 0.50 gives can 0.913 and film 0.930; 1.00 clips both. **Filed as a contract request with all
26 constants enumerated from source and marked requested-versus-named** — which is the standard
round 21 failed and this round met.

**Note the scale is not a simple win:** film already overshoots at 0.18 (0.891 against 0.867) while
can, carton and lip all undershoot. A global multiplier fixes two and worsens one. **That is a
per-material argument, not a scale argument** — and it should be settled against a scored A/B, not
by turning the dial.

## LEAK 7: THE ANSWER KEY WAS RECOVERABLE BY `md5`, AT ZERO PIXELS EXAMINED

Round 25's critic found it **in the inventory listing, before looking at a single image**. The two
arms were generated with the same seed, so their photograph tiles were **byte-identical and shared
tile indices** — only the renders differed. Diffing the two directories therefore returned exactly
the render filenames.

Verified by the lead afterwards on the shipped sets:

    tiles per arm 21 / 21, identical filename lists: True
    BYTE-DIFFERENT across arms: 9  -> tile_00,02,03,05,11,12,14,16,17
    both keys: 9 renders          -> tile_00,02,03,05,11,12,14,16,17

**Exactly the render set. The complete answer key, for free.** The critic salvaged its round by
copying all 42 tiles to opaque shuffled names and scoring from pixels — but it had already been
contaminated by the listing, and said so.

Fixed by mixing the arm name into the seed, so the photo draw, the crop windows **and the tile
order** all differ per arm. **Attack re-run against the fix: byte-identical tiles across arms
12 -> 0, arm sizes 22 and 20, different photo files, and the diff no longer equals the render
set.** Prove a harness fix by running the attack, not by reading the patch.

## LEAK 5 WAS NARROWED, NOT CLOSED: "is there a floor?"

Restricting the photo pool to packed aisles fixed the vistas-and-floral problem and left a
sharper one. The critic: **"all 9 renders are flat-on shelf faces and all 12 photographs are
corridor views with floor, ceiling and a vanishing point. The set partitions on 'is there a
floor?' — nothing to do with render quality."**

**The asymmetry was made by the harness itself.** A `>=55%` product gate on render tiles admits
only the near poses, while any crop of an aisle photograph naturally contains floor and ceiling.
Fixed by construction: the gate drops to 0.15 so the chase poses (14-26% product) are admitted,
and the guard now **requires both a near pose and a chase pose to contribute.** Verified: arms now
draw over all six poses.

**This also moves the test back toward the bar as written.** `PROMPT.md` says a screenshot beside
a real store photo — a whole frame, not a magnified shelf-face crop. The last several rounds have
been scored on a stricter test than the brief specifies.

**And note the critic tried to QUANTIFY the mismatch and failed** — smooth-area fraction and a
bottom-of-frame floor detector both overlapped heavily, because real floors are speckled terrazzo.
**It published it as a structural observation rather than a statistic**, which is why it could be
fixed by construction.

## HAND-PICKED-BAY p99.5 IS RETIRED. THREE CRITICS, THREE BAYS, THREE ORDERINGS.

Round 24: "film and metal clip, carton does not," 0.85 / 1.00 / 0.99.
Round 25's builder: "on a subject-matched photograph **nothing clips**," 0.685 / 0.867 / 0.897.
Round 25's critic, on subject-matched **near-field** photograph regions:

    PHOTO film    sRGB p99.5 0.999   4.38% of pixels >= 0.99   7.19% with a channel at 255
    PHOTO carton             0.994   0.96%                     3.08%
    PHOTO rigid              0.904   0.00%                     0.85%
    all 4 RENDER regions     0.842-0.967   0.00%               <= 1.38%

**So the photographs clip hard and both previous accounts were wrong, differently.** Its verdict:
**"p99.5 on a hand-picked bay measures which instance you point at, not the class."** Fifteenth
region-dependent statistic retired here.

What survives from all three rounds is the *render* side of that last row: **no render region
reached luma 0.99 anywhere.** That is a one-sided statement about the render alone, and it is the
only part that has held across three independent measurements.

## THE FORCED CHOICE REPLICATED AT EXACTLY THE SAME NUMBER

Round 25's critic ran round 24's instrument on a different change, a fresh randomisation, and a
different arm pair: **5 of 9. Chance. Identical to round 24's result.** And **its one
medium-confidence call was wrong — confidence anti-correlated with correctness.**

**Two independent replications, two different rounds, two different changes, both at chance.** A
matched-arm forced choice costs minutes; run it before claiming any change is visible, and treat a
failure to beat chance as the finding rather than as a null.

## The cue, stated the way a cue should be stated

**Shelf-edge signage is floating decals, not physical card** — a green package hovering
unsupported and clipping straight through a SALE banner; cards as dead-flat planes with zero edge
thickness; a dangler's hanger wire terminating in empty space. Present in all 9 render tiles,
untouched by round 25, and **it survives every codec control because it is geometry.**

**And the critic separated its confidence from its explanation, which is what the last three
failed to do:** observation **high confidence**, reproducible at published coordinates in both
arms; mechanism **a hypothesis** — camera-facing quads placed without a collision test;
**falsified if** any card shows a lit side face, or if the green package is parented to a peg
hidden behind the banner. **That is the format. Ask for it every round.**

It also **retired one of its own claims before publishing**: it nearly asserted that render box
text was mirrored, and rotation and mirror tests refuted it — the text reads correctly and only
its orientation is rotated.

## THE LEAD FIXED A DEFINITION AND NOT THE CALL SITES. THIRD TIME. LEAK 7 STAYED OPEN.

Leak 7 was fixed in `r22_blindset.main` — **which the r24, r25 and r26 wrappers do not call.**
Round 26's builder generated its first pair and got **9 of 18 byte-identical: exactly the 9
photographs.** The leak was live on every path anyone was actually using.

**This is the same error the lead made two rounds earlier**, correcting a critic by checking that
four material constants existed in `store.js` without checking that anything *read* them — the
lobe read one of five. **And it is the error this file has documented since round 8 under a
different name.** Existence in the source is not delivery to the pixel; a patched definition is
not a patched program.

Closed properly: `arm_seed(arm, seed)` is now **one owner in `r22_blindset`** and every wrapper
calls it, verified by grepping **every** `random.Random(` site in the harness — the only remaining
matches are comment lines. `r24_blindset` also silently raised `MIN_PROD` to 0.30 and **dropped
r22's near/chase family guard**, so every set on that path was near-pose only after leak 5's fix
went in; the guard is re-asserted there with its own message.

**A second copy left knowingly, with the reasoning recorded:** `r26_blindset` has its own
`arm_seed` doing FNV-1a to an int, written because its author feared Python's hash randomisation
would make a string seed unreproducible. **That fear does not apply and it was checked rather than
assumed** — `random.Random(str)` seeds through sha512, and PYTHONHASHSEED 0, 1 and 12345 all
return 0.9621357655761895. Both derivations are correct and return *different* values, so an
equality assertion between them would be wrong. Its sets were sealed and awaiting a score, and
regenerating them would have broken their reproducibility. **Left, documented, and new wrappers
call the shared one.**

## BOTH FALSIFIERS TESTED FIRST, NEITHER FIRED — and the mechanism was half wrong AGAIN

**F1, "any card shows a lit side face":** **15 printed-surface soups, 21,278 quads, ZERO with a
short edge under 8 mm.** No card in the building had a rim at all, and **14 of the 15 soups are
`MeshBasicMaterial`** — unlit by authoring — so even a rim could not have caught a light.

**F2, "the green package is parented to a peg":** it is `run1.2` instance 9, a bag at
lip + 41.4 mm carrying `stray()`'s hard-coded 45 mm depth, **17.0 mm inside the vendor
shelf-talker**, one of 42,966 unparented instances. **There is no peg — and the package came from
the builder's own file.**

**But the mechanism was half wrong for the fourth consecutive round:** these are **not
camera-facing quads.** They are world-oriented, and the talker and blade already have real
hardware behind them. **Only "zero edge thickness" was right.** Testing the falsifiers before
building is what separated the true half from the false one, and it took one measurement.

## What shipped, and the refutation next to it

    promo signage interpenetration   68 of 1,569 (4.33%)  ->  57 of 1,569 (3.63%)
    vendor shelf-talkers              5 of 76             ->   1 of 76   (4 of 5 were its own)
    its own cards                     8.19% of quads      ->   5.71%
    hang-tag wires ending in air    184 of 184            ->   0 of 184
    stray() capped 341/351 (max 37.3 mm past the talker plane), seated 338/351 (max 28.7 mm buried)

Draw calls **442 -> 442**, colliders **75 -> 75**, instances +3,466 "exactly the arithmetic",
**41,714 of 42,966 package matrices byte-identical between arms** with the 1,252 that differ all
in the one batch this file pushes to, and zero rng draws added.

**Its own refutation:** at 1.55 m and 52 degrees, **one pixel is 2.1 mm of card**. A 3.5 mm rim is
**1.7 px**; rim is **2.2-3.4% of card pixels**, at 1 px or more on only 81-132 cards per pose.
**"The rim is a thin near-pose cue."** What the board actually buys is the four things a plane
cannot have: a bend, a hook, a collision volume, a square outline.

## An instrument that read 0 of 184 BEFORE the fix, because it found the string touching itself

The hang-tag attachment probe reported **0 of 184 wires ending in air** on the unfixed build.
Cause: it was testing each wire against all geometry **including its own instance**, so every wire
"terminated on" itself. Excluding the probe's own instance gave the true **184 of 184.** **A
self-intersection test must exclude self.**

## `cardCheck` found the round-20 cards were PARALLELOGRAMS

On its first run: **1,243 of 1,784 bands sheared by up to 48.6 degrees**, because `violator()`
derives `U` perpendicular to `D` **assuming yaw = 0** and then yaws `D`. **Same shape in `hangTag`
and `wobbler`.** It then caught two more at 2.0e-4 from three's own gimbal threshold being too
loose to *write* an euler with.

The guard reads the live `fixtures` matrices — 1,784 recorded, 1,784 matched, 0 missing, 0 bad,
worst 5.9e-8 — and `cardSelfTest` fires it on the ZYX convention, catching **1,734 of 1,784**.

## Standing: 19,500 of 21,278 sign quads are still zero-thickness planes

Vendor POS, coupon flags, blades, danglers and price tags are all outside `intrusions.js`. One
talker pierce and **24 of 45 coupon-flag pierces are store-side.** And the queued `kit.js` `hy`
euler bug **now bites harder** — this round's boards are the first things in that file to push a
non-zero `ez`, which is exactly the term `Batch.push` reads and `place()` never set.

## THE FIRST THING ANYONE HAS RELIABLY SEEN IN TWENTY-SEVEN ROUNDS

Round 26 scored 18/18 and the forced choice came back **5 of 9 — chance, the third critic in a
row.** But **the breakdown is not noise, and it is the most important result this project has
produced:**

    high-confidence calls    3 of 3 CORRECT
    low/no-confidence        1 of 5
    confidence CORRELATED with correctness   (round 25's was ANTI-correlated)

**All three high-confidence calls named the same feature: the RECIPE dangler no longer passing
through the SALE PRICE header.** The pairs whose only change was card *thickness* gave it nothing
at 720 px and it coin-flipped both — **confirming round 26's own refutation by failing to beat
it.**

> **"Interpenetration is a percept. A 1.7 px rim is not. Stop adding millimetres; keep removing
> interpenetrations."**

**Report the confidence breakdown of every forced choice from now on.** A total at chance can
contain a subset at 3 of 3, and the subset is the signal. Nine rounds of geometry work have been
scored as "no movement" by a number that could not distinguish these two cases.

## LEAK 8: A GATE AND A GUARD THAT CONTRADICTED EACH OTHER

**First half, and it is the lead's.** The near/chase family guard was added to `r24_blindset`
**without checking it could be satisfied there.** Measured across all six masks:

    near_a1 0.403   near_a4 0.733   near_a7 0.428
    chase_a1 0.196  chase_a4 0.244  chase_a6 0.259   <- best chase window 0.259

`MIN_PROD_R24` was **0.30**, so the guard was **unsatisfiable** and that path **could not
regenerate a valid set at all.** The gate silently produced near-pose-only sets and the guard that
would have caught it could never run. **A gate and a guard that contradict each other are worse
than neither.** Aligned to r22's 0.15, which the same measurement shows is satisfiable.

**Second half:** `prod_frac` gates only the RENDER side; `photo_tiles` emits every stride window
ungated. **Leak 5 is closed at the level of FILES and still open at the level of CROPS** — a
ceiling, department signage and a glass floral cooler got in, content no render crop can hold.

## A FIX THAT WAS MEASURED AND REJECTED, WHICH IS WORTH MORE THAN ONE THAT WAS SHIPPED

The obvious answer to leak 8's second half is a symmetric density gate on photo crops. It was
built and calibrated **against the actual offending tiles** before shipping:

    offending photo crops   edge_frac 0.346, 0.369, 0.380, 0.390
    good render crops       edge_frac 0.412, 0.425, 0.426, 0.428, 0.457
    photo whole frames      edge_frac 0.346 - 0.440

A threshold near 0.40 drops the offenders — **because the proxy itself discriminates class.**
Gating on it would have selected the photo population to resemble the render population, deleted
the photographs *least* like a render, and made the selector the thing under test. **Rejected, and
written down so nobody spends a round rediscovering it.** This file's own rule, pointed at the
harness: if your rule selects the two populations differently, you are measuring the selector.

## THE HARNESS WITHOUT A CROP SELECTOR — `tools/wholeframe_blindset.py`

**Five of the eight leaks — 1, 4, 5, 6 and 8 — exist only because something had to choose a
window.** `PROMPT.md`'s bar is a *screenshot* beside a real store photo. A whole frame. The
cropping machinery was never in the brief.

So: whole 1280x720 render frames against whole references brought to the same size by resize and
**centre-crop, never letterbox** — bars are a class tell as loud as file size was. Everything that
is not a window is still controlled: one encoder at one quality in the reference's own 4:2:0,
per-arm seeding through the shared `arm_seed`, identical pixel dimensions, split randomised away
from 50/50 and never printed.

Both attacks run against it rather than reasoned about:

    LEAK 7 attack   13 shared names, 0 byte-identical across arms
    LEAK 2 attack   render 267,186-335,592 vs photo 272,267-405,177  -> overlapping
    dimensions      {(1280, 720)} across both arms

**What it deliberately gives up:** n is small — six poses against fourteen photographs. Fine for
render-recall, which is the score and is one-sided; **useless for any population statistic, so do
not compute one off it.** The cropped harness stays for close work.

## The cue, in the house format
**The price rail has no cross-section and the tags are decals on it.** Observation **HIGH**: a bare
rail is one flat plane down to a hard black boundary — no upper return, no lower return, no
channel, no groove, no shadow line — and a tag **hangs 4 px below its own holder** while its
neighbour starts 5 px higher, **with nothing registering either to a datum**. The photograph shows
the same object as **a folded channel with four separately lit facets and tags recessed behind a
return that shadows their top edge.** 20-35 instances per tile, all 18 tiles, both arms.
Mechanism **MEDIUM**. Falsifiers: 1-2 distinct normals across the lip (3+ means it is shading, not
geometry); tag bboxes exceeding the rail face height; and **build it, re-render, re-run the forced
choice — chance again means the mechanism was right and the percept still is not there.**

## THE FORCED CHOICE HAS A BROKEN ADMINISTRATION, AND IT REACHES BACK THREE ROUNDS

Round 27's builder ran the instrument on itself and **caught it failing rather than quoting it.**
Two paired runs, **6 of 12 and 6 of 12** — and then the diagnostic:

**It named the SECOND-PRESENTED half in 22 of 24 pairs** — "right" every time in run 1, "bottom"
every time in run 2, **two orthogonal axes.** Its three HIGH-confidence calls, made on the largest
pixel differences in the set (arm MAD 9.28, 8.97, 11.86), were **all wrong.** Both keys verified
mechanically against the source frames, 0 mismatches.

**That is a broken administration, not a null.** Its own words: quoting it as "the change is
invisible" would repeat the codec mistake. **And it casts retrospective doubt on rounds 24, 25 and
26, all of which reported a paired forced choice at 5 of 9 without a position tally.** Round 26's
3-of-3 high-confidence subset all named one feature, which is hard to explain by position alone —
but none of those runs can be defended as administered.

**Every forced choice from now on: randomise position per trial, and PUBLISH THE CALL-BY-POSITION
TALLY.** A run that names one position most of the time is discarded, not reported.

**Run 3 removed position by construction** — one crop per image, judged alone, "channel or flat":

    TOTAL              10 of 16   p = 0.23, not significant
    HIGH confidence     2 of 2    both naming card-to-neighbour registration
    NEAR poses          8 of 10   p = 0.055
    CHASE poses         2 of 6    below chance
    call balance       ON 6 of 16 against a truth of 8 -- no response bias

**THE NEAR/CHASE SPLIT IS THE ROUND'S RESULT.** A 15 mm cross-section and a 25 mm registration
error **are a percept at 1.5 m and are not one at 12 m.** That refines round 26's standing order
("interpenetration is a percept, a 1.7 px rim is not") rather than overturning it — and it says
plainly where the remaining rounds can and cannot pay.

**Run 3 was an INFORMED test** — the builder had seen two keys by then — so it cannot answer the
naive question, and it said so. Run 1 was the naive test and its answer is unusable.

## A FALSIFIER THAT FIRED ON ITS WORDING AND NOT ON ITS INTENT

F1 asked for the normal count across the lip: 1-2 expected, **3 or more would mean the mechanism
was wrong.** The census:

    rails soup       1,905 quads    4 distinct normals (+/-X, +/-Z)   0 with any vertical component
    shelfTags soup  15,762 quads  682 distinct normals                0 with any vertical component

A 36-section visible-ladder probe reads **3 or more normals on 15 of 36 sections — so the literal
threshold fires — but the rail itself returns exactly ONE normal in 33 of 33 sections where it is
visible.** Every extra normal came from a leaning package or the deck top.

**So the mechanism was UNDERSTATED, not wrong:** not "a box with no return flanges" but **a single
quad per section.** The builder published both readings rather than the flattering one. **When a
falsifier fires, check whether it fired on the wording or on the thing.**

## F2's ROOT CAUSE: two samplings of one 25.4 mm stair

Confirmed and larger than claimed — **6,669 of 14,629 tags (45.59%) exceed the rail face**, 17.92%
are taller than their own rail, top-edge error absMean 16.29 mm (p01 -63.6, p99 +56.0), cards sit
**8 mm proud** at p50.

**The rail steps on `notch(k,d)` indexed by railSeg's VARIABLE-length sections; the card steps on
`stepAt(pos)` indexed by the shelf board's EQUAL-length sections.** Two indexings of the same
25.4 mm stair, so the mismatch is always some multiple of a notch. **Two systems sharing a
convention with nothing asserting it — the fourth instance of that shape in this file.**

    tags with no rail under them   7.19%  ->  0.13%
    tags exceeding the rail face  45.59%  ->  0 of 14,578
    card top vs the channel line    n/a   ->  absMean 0.27 mm, max 3.74
    adjacent card tops, p50       3.18 mm ->  0.03 mm
    cards recessed behind return    4.9%  ->  14,578 of 14,578, p50 -9.01 mm
    facets per section                  1 ->  7      N.L spread 0 -> 0.68

Draw calls **177 = 177**, triangles +1.01%, frame 3.9 -> 3.8 ms. Arms proven identical by
`drawSig` (2294903825 / 814 fills / 526,234 draws) **and an FNV over all 73,074 instance
matrices** (1885645821 both), colliders 75 = 75.

## A SELF-TEST CALIBRATED TO THE DEFECT IT REPLACED

`railSelfTest()` corrupts 500 live card quads **by 8.24 mm — the flat arm's own median error** —
and confirms **0 caught before, 500 of 500 while corrupt, 0 after restore.** Not an arbitrary
injection: the guard is proven to catch exactly the magnitude of the bug it was built for. And the
structural half **downgrades to a report rather than throwing on `?flatrail`, because a control
must stay loadable** — the lesson from leak 8, applied one round later.

## Unreproduced, recorded rather than claimed
The round reported a pre-existing console error, `THREE.Sprite: "Raycaster.camera" needs to be
set`, on a bare page load. **The lead could not reproduce it**: a clean load of `index.html` shows
no errors at all, and there is no `Raycaster` anywhere in `src/`. What the console does carry is
repeated `Canvas2D: multiple readback operations ... willReadFrequently` warnings — a performance
hint, not an error, and frame time is 3.8 ms. **Recorded as unreproduced rather than fixed or
dismissed.**

## THE MATCHED-ARM FORCED CHOICE IS RETIRED. IT INVENTED DIFFERENCES BETWEEN IDENTICAL IMAGES.

Round 27's critic did not merely fail the instrument — it **proved** it broken, with a control
nobody had thought to add:

    position tally            18 "second" against 2 "first" over 20 trials
    HIGH-confidence calls     all 6 were "second"; only 2 of 6 correct
    CATCH TRIALS              2 of 8 -- and on 6 OF 8 PAIRS WHOSE TWO HALVES WERE
                              THE SAME IMAGE it invented a specific, named
                              geometric difference, three at HIGH/MED confidence
    same-window control       identical crop, arms swapped, called BOTTOM both times
    near 6/12, chase 6/12     both chance

**Randomising position per trial is not enough. The pairwise question itself — "which one
differs" — is answerable by position.** Four rounds of this project's headline perceptual number
were produced by an instrument that will confabulate a detailed geometric difference between two
copies of one image, most of the time, at high confidence.

**RETIRED. Do not run a matched-arm forced choice again.** And note what rescued it: **a catch
trial.** Any instrument that asks a scorer to find a difference must include trials with no
difference in them.

## AND THEN IT PRODUCED THE FIRST POSITIVE RESULT IN TWENTY-EIGHT ROUNDS

**Absolute single-image classification** — one crop, one arm, judged against a criterion fixed in
advance. No pair, therefore no position:

    TOTAL              10 of 12   p = 0.019
    HIGH confidence     5 of 5
    near_a1 4/4   near_a7 4/4   near_a4 2/4   CHASE: no percept at any pose

**This is the first result in this project showing a change is visible to a scorer who did not
build it.** It independently confirms round 27's own near/chase split. **This instrument is now
the standard.**

The working signature is worth recording because it explains an earlier failure: it is
**direction-agnostic** — *is the card registered to the rail*, not which way the error runs. The
OFF error goes up or down by notch multiples, **which is exactly why a single-polarity rule
flip-flopped.**

## LEAK 9: A DIAL THAT ALSO RE-ROLLED CONTENT IS NOT A DIAL

**The two arms differed in tag CONTENT and card SIZE, not only in the geometry under test.** The
same rail slot in `near_a7` renders **"3.99" in one arm and "3.08" in the other**, and the OFF card
is **about 50% taller**. **The pair was solvable by reading a price**, with no percept of the rail
at all — and that channel was available in **both** of the builder's own runs.

**Prove your arms differ only in your change.** Round 24's `drawSig` and round 27's FNV over all
73,074 instance matrices are the tools; neither was pointed at the *content* of the thing being
varied.

## WHOLE FRAMES CHANGED WHAT GETS CALLED ON, WHICH IS THE POINT

First round scored without a crop selector. **Not one render was named from a shelf-edge detail.**
The tells were scene-scale: a perfectly bilateral vanishing point, a standing shopper with no
shadow, and above all the aisle floor.

**The price rail — the thing round 27 rebuilt, and which round 27's own single-image test shows IS
visible at near poses — was never the tell in any whole frame.** Both results are true and they
are not in conflict: a change can be perceptible when you are asked about it and irrelevant to
what a viewer volunteers. **Render-recall asks the second question. The bar is written in the
second question.**

Five of eight crop leaks existed only because something had to choose a window; with no window,
the answer came from scene-scale facts.

## THE CUE: THE FLOOR CARRIES LIGHT NOTHING CAUSES, AND NONE THAT EVERYTHING SHOULD

Frames `r27_on_chase_a4` / `chase_a1` / `chase_a6`, region **x 360-960, y 330-690**:

- **An amorphous bright pool with dark curling filaments mid-aisle.** Real troffers are thin
  rectangles across the aisle and their floor images are **thin streaks converging to the vanishing
  point.** These **curl, ignore the tile seams' perspective, and subtend the same size at 4 m and
  at 12 m.**
- **Nothing standing on the floor darkens it** — shoes, all four cart casters, the endcap base,
  every kick plate. **Every caster in the matched Ingles reference has a contact shadow.**

Observation **HIGH** (10 instances, three poses, both arms, two reference photographs).
Explanation **MEDIUM**, with three alternatives explicitly not excluded: the floor may not be a
shadow *receiver*; the cascade may not reach 12 m; the swirl may be a separate decal cue.

**And this is round 8's complaint returning verbatim.** That round built the entire world light
field because three blind tests in a row were called *"from the ceiling plane and the floor within
about a second"*, and because *"an authored occlusion card exists only at the junctions its author
remembered."* Round 21 then reported that **open floor is exactly zero on all five taps** of its
occupancy volume. **Whether that is the design or the bug is the first thing round 28 has to
answer** — and it is a question about whether the floor reads the field at all, not about what to
build.

## THE FIELD IS STAMPED AT BUILD TIME, SO NOTHING THAT WALKS IS IN IT

**101 of 101 meshes that touch the floor and belong to a body that moves are absent from
`light.js`'s occupancy field** — 42 shopper feet, 56 cart casters, 3 on the thief, the cop's two.
The one that reads a non-zero column does so only because it is parked inside a gondola's own
padded stamp. **Translating a shopping cart 1.0 m changed ZERO of 880 floor pixels** in the band
in front of it, zero of 1,274 further out, zero of 2,829 in a control.

Round 8's field is populated *by construction* through `Batch.push` and `solid()` — **at build
time.** That is exactly right for shelving and exactly wrong for anyone in the store. **"By
construction" answers WHO is covered, not WHEN.**

## Three alternatives, all tested before a line was written, all settled

- **"The floor is not a shadow receiver" — FALSE.** Stamping a synthetic 0.30 x 1.00 m column into
  the live field where a cart stands darkens the band 0.45-1.05 m in front of it by **0.103 mean
  linear luma, 0.877 -> 0.776, 891 of 891 pixels, max 0.347**, while a control band 3.0-3.6 m away
  moves **2.8e-5**. Undo byte-identical over 58,420 px.
- **"The cascade does not reach 12 m" — FALSE.** `chopA.x` outward from a kickplate at five camera
  distances: **the profile at 19 m is the profile at 4 m.** So **round 27's critic's "every kick
  plate" was wrong** — a kickplate already takes the floor to **6% of its open-aisle visibility, at
  every range tested.**
- **"The swirl is a separate decal cue" — TRUE, and it is the whole of observation (a).** Hiding
  the multiply-blended wear plane removes **every filament**; `uGloss` 0 and a flat `uBurn` leave
  them untouched; and the floor rendered as `vec3(chopA.x)` still shows them. **They are in no
  lighting term.**

**F2 answered, and it changes the diagnosis:** two cameras 0.5 m apart, best normalised
cross-correlation over a 5-13 m floor band — **the filaments track the tile seams to within 1 px of
a 6-7 px parallax, while the mirror moves 2 px less**, which is correct for a virtual source 2.9 m
below the floor. **So "baked" survives — baked into a DECAL, not a lighting term — and the
single-mechanism explanation is falsified: (a) and (b) have different causes.**

## THE ANCHOR: a correct multiply, applied one stage too early, arrives at 38% of itself

Applying the tread multiply inside `<opaque_fragment>` puts it **under `AO_FRAG`'s additive lamp,
bounce, aisle and daylight terms.** The shadow arrived at **38% of its own size and nothing
reported it** — 0.924 where `light.js`'s own field gives 0.676 for the identical box. Correct
anchor: **`<colorspace_fragment>`**, after AO_FRAG, after tonemapping, before the sRGB encode.

**A shading term can be right in every constant and wrong in its stage.** The round found it only
by driving its own estimator against `light.js`'s on the same synthetic box.

Its other documented mistake, because it also looks right: **admitting only meshes that TOUCH the
floor threw away every shopper's torso and every cart basket — the parts that actually block the
ceiling.**

## THE ROUND IS A NULL, AND THE REASON IS THE NEXT ROUND

Its own absolute single-image test: **6 of 12, p = 0.61.** (Its first attempt scored 7 of 12 and
**was published as a defect, not a result** — the window selector cast the floor plane per pixel
with no visibility test, so **five of six windows contained no floor at all.** "That number
measures the selector.") **Two of the six corrected windows carry zero pixel difference between
arms, so only 8 tiles could carry a percept; on those, 4 of 8.**

**And the tile it got backwards is the finding.** It called the ON arm "no shadow, HIGH" and the
OFF arm "shadow". At 3x, ON has an unmistakable dark contact pool under a shoe and four casters
and OFF has none:

> **"I had been drawn to the wear decal's grey swirls lower in the crop and read THOSE as the
> shadow. The floor is already covered in shadow-shaped grey smudges that nothing casts, so a real
> contact shadow has nothing to be contrasted against."**

**Observation (a) is actively concealing observation (b).** Fixing a defect can be invisible
because an older defect occupies its channel. **Check what else is already shaped like the thing
you are adding.**

## Scope, and two poses that no floor change can ever reach
Measured with an occlusion-exact floor mask (the floor mesh painted flat magenta for one throwaway
render): **`near_a1` and `near_a4` contain ZERO visible floor samples.** `chase_a1` is 32.5% near
an occluder, `near_a7` 4.9%, `chase_a4` 1.9%, `chase_a6` 0.6%. **This is a chase-pose change** —
and the first round in a while that can pay at range.

Depth against named references: `store_06` floor under a wire display rack runs **0.13-0.44 of
open floor**, `store_09` at a barrel foot **0.73 at the contact line**; the render's changed pixels
sit at median 0.21-0.50, p05 0.083-0.100. Same band, floored where `light.js`'s own term floors.

Cost: draw calls **377 = 377**, triangles identical, **0 meshes added**, one 1024x1024 R8 texture,
CPU raster 0.135 ms, isolated GPU **+0.476 ms**, live frame **8.1 ms on against 8.3 off — below
the noise floor.** Arms proven identical by an FNV over 625 meshes / 73,074 instances / 1,179,929
words: `c98a6dbe` on, off, and on again.

## QUEUED: 210 arcs that are stroked white into a multiply layer and do nothing

`floorWearTex()` in `src/store/tex.js`. **420 buffer swirls** at 46.6 mm per canvas pixel — 37-121
mm strokes on 1.86-12.1 m radii sweeping up to 10.9 m of arc — **and half of them are
`rgba(255,255,255,0.26)` into a multiply layer, where white is the identity.** Pure cost, zero
pixels. Plus **skid arcs** that cluster into a 3 m scribble exactly where the aisle meets the
mid-store walkway — **9.7 m from the chase_a4 camera, which is precisely where round 27's critic
drew its box.**

## 211 CONTACT-SHADOW-SHAPED POOLS ON THE OPEN FLOOR, AT THE EXACT MAGNITUDE OF A REAL ONE

Measured **artefact against artefact** — the pre-r29 `floorWearTex()` lifted verbatim out of
`git show HEAD:` and re-baked from the store's own plan, so nothing rests on a quoted number:

    local dip   r28 decal   r29 decal
    0.030          239          35
    0.045          281          22
    0.070          337           2
    0.110          211           0     <- r28's own contact shadow, 0.877 -> 0.776

Attribution before the fix: **skid 94-117, heel 22-59, patch 8-17, swirl 3-12.** One loop made half
of them.

**The whole diagnosis is dimensional, and it is the cleanest in this file.** At N=1024 over
47.7 x 38.0 m the canvas is **46.58 mm/px across and 37.11 mm down**:

- skid arcs at 0.9-3.4 px were **42-158 mm of rubber**; a cart caster tread is **25-32 mm**
- heel "marks" were **0.14-1.40 m arcs**; a real heel drag is **12-30 x 60-350 mm**
- 26 ellipses **0.37-2.50 m** across, uniform random, **no traffic term and no fixture mask** —
  the source comment called one "a mat shadow"
- **every arc used `rw/spanX*N` on BOTH axes**, so a 0.9 m cart turn baked as a **0.90 x 0.72 m
  world ellipse**

**Convert your texture-space constants into world millimetres before you believe them.** Nothing
here was a tuning error; every one was a unit error hiding behind a plausible-looking pixel value.

The replacement constrains shape rather than darkness: **1,500 rubber dashes at 13-29 mm wide with
length/width >= 3.4, so a scuff CANNOT be a compact mark whatever its value**; 120 buffer passes
striating along the runs instead of 420 random 1.9-12.1 m circles; casters at 26-49 mm; the 26
ellipses cut; and every ink term now clipped to the fixture mask, where only two of them were.

## THE 210 WHITE ARCS: round 28 was HALF right, and the lead passed on the wrong half

Round 28 reported them as doing "nothing at all", and this brief and the round-29 dispatch repeated
it. **White is the identity of the BLEND — but these are source-over strokes into the CANVAS,
before the texture ever reaches the blend.** Ablated on the live artefact: **20,369 px (47.95%)
landed on canvas already at 255 and were genuinely dead; 22,110 px (52.05%) lightened the floor by
mean 0.0124, max 0.1216.**

The real fault was upstream: **the traffic field pinned the whole lane centre at exactly 1.0**,
which also clamped away **the burnish term's entire +0.085.** A `DULL_OPEN` pedestal gives them
somewhere to work — **113,733 px lightened, 5.1x.**

**"It does nothing" is a claim about a pipeline stage, and it needs the stage named.** Twice now
this project has been wrong about a term by reasoning at the wrong stage — this, and round 28's
multiply anchored under the additive lamp terms, arriving at 38% of itself.

## THE SECOND STATISTICALLY SIGNIFICANT RESULT, AND IT CAME WITH CATCH TRIALS

    RENDER   12 of 16   p = 0.0384
    CATCH     4 of 4    (real photograph floors)
    FAR       8 of 8
    NEAR      4 of 8
    difference-carrying tiles: 16 of 16   (round 28 managed 8 of 12)

**And the round refused to claim its own NEAR number.** Three of the four NEAR misses were **ON
tiles called as the defect — the scorer finding the defect inside its own fix** — and the scuff
geometry constraint was added *because* of that, so run 1's NEAR figure is a pre-fix number and no
improvement is claimed from it. A labelled re-run on the shipped build gives **6 of 8**.

**Both remaining misses are ONE window** — chase_a6 NEAR, inverted in both arms in both runs, at
the second-highest arm difference in the set. **A non-zero arm difference is necessary but not
sufficient: it has to be in the feature the criterion names.**

## AN INSTRUMENT RETIRED FOR COUNTING THE GROUT

An image-space compact-dark-mark census appeared to say the new scuffs were **worse** — 79 marks
against 56. Overlaying it showed **it was counting the grout network**, which fragments differently
when the wear layer is lighter. Retired; the texture-space census is the valid instrument, and the
scuff change rests on **dimensional analysis rather than on that number.**

## A SELF-TEST WHOSE ONE SHAPE REPRODUCES BOTH OF THE PREVIOUS ROUND'S NUMBERS

`wearSelfTest()` stamps 24 ellipses with **a linear radial falloff from 34.7% to 0, whose area-mean
is 0.347/3 = 0.1157** — reproducing round 28's max (0.347) *and* its mean (0.110) **with a single
shape**. Result: **0 pools before, 21 of 24 caught, 0 after, restore byte-identical over 4,194,304
bytes**, repeatable.

**A first version stamped a flat 11.5% and caught 2 of 24 — it sits exactly on the threshold — and
that was recorded rather than quietly retuned.** Both guards report rather than throw, so controls
stay loadable.

## Arms differ only in the change, with a built-in null pair
One page load, one scene graph, **one texture object swapped on `material.map`.** Of **617,476
differing pixels across six poses, 617,131 lie inside the occlusion-exact floor mask**; 345
(0.056%) fall outside, 274 of those vanish under a 1-px dilation, and the remaining 71 are one
22x13 cluster **every pixel of which is magnitude 1/255**, where the 4 mm-high wear plane covers
the bottom sliver of one object.

**`near_a1` and `near_a4` are byte-identical between arms** — zero visible floor pixels, so they
are a **null pair built into the set. An instrument that ever calls those two differently is
reporting noise.**

Cost: draw calls **391 = 391**, triangles identical, textures 66 = 66, programs 79 = 79; bake
34-41 ms -> 78-109 ms, one-time at load.

## A CRITIC INVALIDATED THE PREVIOUS ROUND'S POSITIVE RESULT USING THAT ROUND'S OWN NUMBERS

Round 29 reported **12 of 16, p = 0.0384, catch 4 of 4** and it was written up here — and in the
lead's report to the user — as the strongest result of the run. **It does not survive.** Round
29's critic took it apart with figures round 29 had itself recorded:

**1. The near/far split was confounded with how much floor was in the tile.** Round 29's FAR
windows are **20-25% floor** (`floorfrac` 0.2029-0.2469 against a 0.15 selector threshold) while
its NEAR windows are **99-100%**. So FAR 8/8 against NEAR 4/8 is not a distance result: **the near
band was hard because it is the only band that actually shows floor.**

**2. And the criterion saturates.** It labels **the fixed ON arm NONE and a real photograph NONE —
the same answer.** An instrument that returns the same label for your fix and for a photograph
**cannot see the gap that decides the bar.** Once the fake pools were gone, its near score went to
chance, and **chance there is the instrument going blind, not a pass.**

**THIS IS THE MOST IMPORTANT METHODOLOGICAL ENTRY IN THIS FILE.** The absolute single-image test
replaced the matched-arm forced choice because that one confabulated. But a single-image criterion
can fail the opposite way: **by being satisfiable.** Round 29 asked "is there an unattached dark
pool?", fixed the pools, and the question stopped discriminating anything.

**Before running an acceptance test, state what your criterion returns for three inputs: the OFF
arm, the ON arm, and a real photograph. If ON and the photograph get the same answer, the test is
finished before it starts.**

The critic's own criterion is the model: it deliberately **did not mention smudges or shadows** and
instead named **surface microstructure and lattice metronomy** — properties a photograph and a
render differ on regardless of what the round changed. It scored **26 of 26, p = 1.5e-8, with ON
9/9 AND OFF 9/9 both called RENDER at mean confidence 5.0/5, and catch 8/8.**

**What does survive from round 29:** the fix is real, the arm difference sits exactly on visible
floor, the OFF arm does carry obvious unattached arcs, and its correction of the white-strokes
claim is right. **The 211 pools were a genuine defect and they are genuinely gone. It just was not
what the bar turns on.**

## No tenth leak — and this is what checking for one looks like

All 25 frames verified to share **one quantization-table hash, one SOF spec (4:2:0), no EXIF, no
ICC, no comment segment, identical dimensions, and byte sizes overlapping across classes**; and the
**null pair `near_a1`/`near_a4` confirmed byte-identical between arms, zero differing pixels.** The
whole-frame harness holds.

## THE CUE: THE FLOOR MIRRORS THE CEILING AND NOT THE STORE

Object chroma appearing in the floor beneath the object:

    red barrel  frame_00   0.04 of its own chroma offset
    endcap      frame_04   0.10
    barrel      frame_13   0.02
    store_08 terrazzo      0.31 and 0.50
    store_11 / store_12    cases readable as FULL-HEIGHT MIRROR IMAGES

**And round 28 had already written the mechanism down in its own "what I did not fix":** *"A
shopper standing on a burnished floor still has no mirror image; the floor's reflected march reads
light.js's field and my field carries no colour."* The mirror is real — round 28 measured it moving
2 px against a 6-7 px seam parallax, correct for a virtual source 2.9 m below the floor. **It
reflects the lights. It does not reflect the store.**

Observation **high**; explanation **moderate**, and stated as such because the critic did not read
the source. **Both statistics it built to prove it FAILED and it published both:** vertical mirror
correlation with an alignment scan **overfits and does not separate** (photo +0.421 against render
+0.412), and within-image paired hue transfer is **unstable to hand box placement and blind to
low-chroma objects** (gated out 2 of 5 photograph cases, one of them wrong-signed).

**An observation that survives its own failed instruments is stronger than one propped up by a
statistic**, and this is the second time a critic here has been right by eye while its numbers
refused to cooperate.

## ROUND 30 — THE MIRROR DID HAVE A COLOUR TERM ALL ALONG, AND IT WAS READING BEIGE

Round 28's confession ("the floor's reflected march reads light.js's field and my field carries
no colour") is true of `tread.js` and **false of the mirror as a whole.** `floor.js` has marched
light.js's Field for colour since round 8. Ablated on the live artefact, inside an
occlusion-exact floor mask:

    term ablated      frac of floor px      mean |delta| /255     mean chroma shift
    lamps                 0.21-0.32              7.6-10.7               0.56-0.86
    ceiling surface       0.44-0.55               5.0-6.6               0.53-0.75
    gondola wall LUT      0.09-0.22               2.0-5.0               0.48-0.91
    static objects        0.38-0.55              6.6-21.1               1.16-2.88
    the whole mirror      0.93-0.99              7.6-15.0               1.02-1.74

So the objects ARE in it. **What they are not in is any hue.** Removing the entire object term
moves the floor's chroma by p50 0.02-0.08, p99 5.9-9.3, max 12.5-16.4 — and QUADRUPLING its gain
(uFldGain 3.05 -> 12.2) moves the max from 13.4 to 14.6 and no further. A term that saturates
under a 4x gain is not weak. It is achromatic.

## THE MECHANISM: A MIP OF A FIELD WHOSE EMPTY CELLS HOLD THE FLOOR'S OWN BEIGE

`light.js`'s Field stores colour in RGB and height in A, **not premultiplied**, and — counted on
the live texture — **3,104,010 of its empty cells carry (189, 179, 160)**, the floor's colour, not
black. Harmless at the base mip. The mirror does not read the base mip: the reflection lobe widens
along the ray, so `lod = log2((0.06 + t*0.16) * 48.4 texels/m)`. Marched down aisle 1 in JS off the
same texture data, the only sample on that ray that hits anything reads through a **2.22 m
footprint** and returns **(181, 183, 174) — saturation 8 of 255**, off a store whose occupied cells
average 38 and whose displays reach 251.

**"How much of my lobe is blocked" is a lobe-width question. "What colour is the thing blocking
it" is not.** Reading both at one footprint is what made the mirror grey.

## AND ROUND 10 CHARGED THE KICKPLATE'S DARKNESS TWICE

`lit = pcol * uFldGain * (0.12 + 1.15 * smoothstep(0.02, 0.90, hitY))`. Round 10 justified the
0.12 floor as "a kickplate at L20 against a top facing at L150" — but that ratio is mostly a
difference in **pigment**, and the pigment is already in `pcol`: the field's low band at a gondola
foot is stamped with the kickplate's own dark colour. The half that was double-charged is the half
a floor shows most of: the 200 mm above the contact line of a free-standing barrel, endcap or
shopper, which is not a recessed toe space. Round 10's defence of the crush — the mirror filling
in the contact skirt — is now held by two terms that know where the occluder is and run AFTER it:
chopAO at `<tonemapping_fragment>` and tread's multiply at `<colorspace_fragment>`.

## `src/store/mirror.js` — PREMULTIPLIED, IN LINEAR, AND WHY IT IS NOT IN tread.js

The moving half genuinely had no colour. tread.js knows where 353-445 movers are standing every
frame and is R8. The new field is 256^2 (186 x 148 mm/texel, matched to a lobe whose vertical
softness starts at 300 mm), two bands split at light.js's own 1.00/1.70, **rgb premultiplied by
coverage in LINEAR bytes** so a mip is a coverage-weighted average and an empty neighbourhood
dilutes the ALPHA rather than the hue. Linear rather than sRGB because glGenerateMipmap on an sRGB
texture averages encoded values on most drivers, and a premultiplied field must unpremultiply
against an alpha averaged in its own space.

**It does not walk the scene.** `sync()` reads tread's OWN `items` and tread's OWN `worldOf()`,
and rebuilds only when tread's own FNV says something moved. One owner for "which objects move and
where"; this file owns only "what colour are they". No second collection rule, no second hash.

## THREE BUGS THE INSTRUMENTS CAUGHT, ALL WORTH KEEPING

**1. An uninitialised GLSL global is not zero, and it cost an hour.** The debug channel was
`vec4 chopDbgV = vec4( 0.0 );` at global scope — legal GLSL, not honoured by this driver. With the
channel switched OFF, large regions of the floor came back **pure white in the shape of the `ny`
gate, in BOTH arms**, because `.a` read garbage above 0.5 and `.rgb` read garbage above 1.0. An
instrument that is only live when a uniform says so has to be dead **by assignment**, not by
initialiser — and the consumer is now guarded by the uniform as well.

**2. Unpremultiplying without returning the coverage is half a fix and the half that blows up.**
light.js's field gets coverage for free and by accident: not premultiplying means a mip of a
shopper alone in a 2 m footprint returns mostly beige, so the reflection is weak because the COLOUR
was diluted. Premultiplying removes that dilution correctly and therefore removes the only thing
scaling the term down. Measured: a 0.7 m body four metres in front of the chase_a4 camera took
58,000 floor pixels to white and held them there **whatever colour it was painted**. The split is
now explicit — coverage scales the occlusion, unpremultiplied rgb is the colour — and neither
question is allowed to answer the other.

**3. A 2D readback context WITH alpha reports a blown-out floor that is not there.** `getImageData`
returns unpremultiplied bytes, so a framebuffer pixel at low alpha reads back (255,255,255)
whatever its colour. Two separate "the composite is white" conclusions came from that before the
probe was switched to `{ alpha: false }`. **The saved PNGs were fine the whole time.**

## THE SELF-TEST'S FIRST VERSION RETURNED ZERO, AND ZERO WAS THE RIGHT ANSWER

`mirrorSelfTest()` stamped a saturated primary into the colour field alone and moved **0 of 174,166
floor pixels** at three positions. That is the design working: tread owns "is anything standing
here", this file owns "what colour", so a colour with no height is a colour nobody looks at. It now
stamps both. Its control is **a grey of the same luminance, not an absent object** — stamping an
object where there was none also switches on round 28's contact shadow, and the first version
scored 58,372 "moved" pixels for one 0.7 m body, which is a third of the visible floor and is the
SHADOW being counted. Shipped result: **3 of 3 pass, chroma max 15.7 / 16.4 / 22.1 against a 6.0
threshold that is round 29's own whole-floor p99, restore byte-identical over all three.**

## THE REFERENCES' FLOORS, MEASURED TWO WAYS, ONE RULE FOR BOTH CLASSES

`tools/r30_floorchroma.py`. Bottom 30% of a 1280x720 frame, sized the way `wholeframe_blindset.py`
sizes (resize to width, centre-crop, never letterbox), both classes through q88 4:2:0 because
chroma is the subject and 4:2:0 is a chroma operation. Region is **geometric, never
content-selected**. Mean CIELAB chroma:

    REFERENCE n=14   mean 18.90   min 14.96 (store_04)   max 25.21 (store_06)   p25 17.02  p75 20.35
    RENDER r29       11.49 - 13.36        RENDER r30      11.63 - 13.90

**Every one of the fourteen is above every render pose. The round moves it and does not close it,**
and the reason is that in the near band the statistic is mostly the floor's own PIGMENT — which
lives in tex.js's floor map, not here.

And the calibration that decided the fresnel, on `reference/store_12`'s polished terrazzo, linear
luminance, three boxes (hand-placed, and named as calibration rather than as a scored instrument):

    dark wood produce table            Y 0.1310
    floor directly under it            Y 0.1691
    open floor either side          Y 0.3883 / 0.3534
    (open - under) / (open - object) = 0.85

That figure is reflection AND occlusion together, so it is an upper bound on the mirror alone. The
render's near field answered **0.04** to the same question — `fres = 0.040 + 0.820*pow(1-ny,5)`,
the textbook bare-dielectric F0 — and no split of 0.85 into two terms leaves 0.04 for one of them.
F0 0.040 -> 0.220 is that admission, the same one `uGF0` makes one function down in the same file
where 0.04 became 0.34 because a reach-in door is a coated assembly.

## TWO INSTRUMENTS BUILT AND REPORTED AS NOT DISCRIMINATING

Both are in `tools/r30_colecho.py` and both are honest failures, recorded so nobody rebuilds them:

* **Column chroma echo.** For a mirror in a horizontal plane and a camera with no roll, a point and
  its mirror image land in *exactly* the same image column — so the cosine between the upper band's
  and the lower band's centred chroma fields across column bins needs no alignment scan and no box.
  It works, and it **does not separate the classes**: REFERENCE spans -0.56 to +0.80 (store_05
  -0.51, store_04 +0.83) and the renders sit inside it at 0.20-0.42. ON - OFF was +0.005.
* **Effective reflectance slope**, the OLS slope of the lower band's linear luminance on the upper
  band's across the same bins. REFERENCE -0.334 to +2.542, renders -0.12 to +1.49. Same verdict.

**A statistic that is geometrically exact can still have a reference population too wide to be a
bar.** Report the reference spread before you report your own number.

## THE ARMS ARE UNIFORM VALUES, NOT A SECOND CODE PATH

Every change is a number the shader already reads, so the control arm runs the identical
instruction stream on identical geometry: `uMirLift`, `uMirCol`, `uMirRag`, `uMirSat`, `uMirF0`,
`uMirVB`, `uMirCfg.w`. `?flatmirror` sets them to round 29's. That is leak 9's lesson applied at
the cheapest possible point — a dial that touches nothing but uniforms cannot re-roll content.

    pose        floor px    diff px    in mask   outside   max|d|   dC p90   dC p99   dC max
    near_a1            0          0          0         0        0        -        -        -
    near_a4            0          0          0         0        0        -        -        -
    near_a7      141,944    142,411    141,786       625       97     9.59    24.82    48.33
    chase_a1     174,921    173,876    170,996     2,880       47     6.80    14.36    26.51
    chase_a4     175,699    173,870    173,844        26       75     5.75    12.23    22.64
    chase_a6     162,186    160,993    159,695     1,298       53     5.41    11.59    24.91

**The null pair holds: `near_a1` and `near_a4` are byte-identical between arms by md5.** And every
one of the 4,829 differing pixels outside the occlusion-exact floor mask is explained: rendering a
second mask with every transparent and blended mesh hidden puts **3,530 of 3,530 of them on floor
that is behind glass** — 2,481 in chase_a1, 808 in chase_a6, 230 in near_a7, 11 in chase_a4,
**0 unexplained.**

## COST
Draw calls **368 = 368**, triangles identical, programs **79 = 79** between arms; +2 textures
(256^2 RGBA8 each). CPU raster **0.2-0.5 ms** per rebuild, 512 KB upload, and it rebuilds only when
tread's own hash changes (853 rebuilds against 212 skipped over one session). Live frame median
**8.3 ms**, which is round 29's own figure. Per-fragment the march **removed** up to twelve in-loop
`chopFldCol` calls (two fetches each) and added twelve `chopTreadTop` (one each) plus one two-fetch
colour read on the winning sample only — worst case a net saving.

## WHAT THIS ROUND DID NOT FIX
* **The mirror image is not elongated the way a real one is.** store_12's dark produce tables put
  solid dark columns in the floor running a full table-height toward the camera. Ours puts a soft
  patch. `uMirCol.z` displaces the colour tap along the aisle but the lobe is still isotropic in
  `textureLod`; a real anisotropic smear needs more than one tap.
* **The floor's own pigment is out of band and it is not this file's.** 11.6-13.9 against a
  reference floor at 14.96-25.21, and in the near band that number is mostly `tex.js`'s floor map.
* **`uMirSat` is short of its own exact inverse on purpose.** 1/0.42 = 2.38 restores all of
  wallLUT's per-band department contrast at once and the mid-field reads as separate magenta and
  green patches. Shipped at 1.80. The right fix is in the LUT's authoring, not in a gain.
* **The near poses still cannot pay.** `near_a1` and `near_a4` have zero visible floor. The whole
  round lands on three chase poses and `near_a7`.

## CONTRACT REQUEST r30 -> light.js OWNER, enumerated from source
`FIELD_GLSL`'s `uFld` / `uFldHi` store colour NOT premultiplied by coverage, and `Field`'s empty
cells are filled with the floor colour rather than zero. Every consumer that reads them at a mip —
`chopFldCol` from this floor's mirror, from `freezerGlass`'s trace, and `chopBounce` — therefore
gets a colour mixed toward that beige by an amount nobody records. Premultiplying at the bake
(`rgb *= coverage`, `a = coverage`) and dividing at `chopFldCol` would make every one of those
lookups correct under filtering, at the cost of one divide. `src/store/mirror.js` is a worked
example of the same field built that way.

## THE CRITERION, STATED BEFORE ANYTHING IS SCORED, AND WHAT IT RETURNS FOR ALL THREE

Round 29's criterion labelled the fixed render NONE and a real photograph NONE — the same label —
so it could not see the gap that decides the bar. This one is written to give **three different
answers**, and the third is the one that says the round is not finished:

> **Look only at the floor. Does it carry a vertically elongated image of the things standing on
> it — a column of an object's own colour or darkness that begins at its contact line and runs
> toward the viewer, and that changes from one part of the frame to the next according to what is
> standing there? Or is the floor's colour the same everywhere the light is the same, with only
> the ceiling's lamps in it?**

Direction-agnostic, names a surface property and not a fix, and mentions neither smudges nor
shadows nor the price rail.

    OFF arm      NONE. The floor carries lamp smears and nothing else. Ablating the whole object
                 term moves its chroma by p50 0.02-0.08, and the floor beside a shelf run is the
                 same beige as the floor in the middle of the aisle.
    ON arm       PRESENT BUT SHORT. Coloured bands appear beside the runs and under a standing
                 body; ON - OFF is dC p90 5.4-9.6, p99 11.6-24.8, max 22.6-48.3 inside the floor
                 mask. The image is a patch, not a column: it does not run a full object-height
                 toward the viewer.
    PHOTOGRAPH   PRESENT AND FULL. store_12's produce tables put solid dark columns in the floor
                 running a full table-height at the camera; the floor under one sits 54% below the
                 open floor beside it and within 29% of the table itself.

**If a scorer cannot separate ON from PHOTOGRAPH on this criterion, the criterion is wrong, not the
build** — the elongation gap above is measured and is the round's own stated miss.

## "THE FIELD CARRIES NO COLOUR" WAS TRUE OF ONE FILE AND FALSE OF THE SYSTEM

Round 28 wrote, in its own not-fixed list, *"the floor's reflected march reads light.js's field and
my field carries no colour."* This brief repeated it and the round-30 dispatch was written around
it. **It is true of `tread.js` and false of the mirror as a whole** — `floor.js` has marched the
Field **for colour since round 8.** Ablation inside an occlusion-exact floor mask:

    term ablated        frac of floor px   mean |d|/255   mean dC
    lamps                  0.21-0.32          7.6-10.7      0.56-0.86
    ceiling surface        0.44-0.55           5.0-6.6      0.53-0.75
    gondola wall LUT       0.09-0.22           2.0-5.0      0.48-0.91
    static objects         0.38-0.55          6.6-21.1      1.16-2.88

**The objects were in the reflection. They were in no HUE.** Third time a round has been dispatched
against a mechanism that was wrong in the source and right in the observation — and the second time
the wrong half came from a previous round's own honest self-report rather than from a critic.

## THE MECHANISM: AN UNPREMULTIPLIED FIELD WHOSE EMPTY CELLS HOLD THE FLOOR'S OWN BEIGE

`light.js`'s Field is **not premultiplied**, and **3,104,010 of its empty cells hold
(189,179,160) — the floor's own beige.** The mirror lobe reads a **mip**, so down aisle 1 the only
hit arrives through a **2.22 m footprint** and returns **saturation 8/255**, off a store whose
*occupied* cells average **38**. The empty cells are not neutral; they are a bath of floor colour
that the mip averages the store into.

**Proof it is saturation and not weakness: quadrupling `uFldGain` 3.05 -> 12.2 moved max dC
13.4 -> 14.6 and stopped.** A gain that does nothing is the signature of a term that is being
averaged away upstream, not one that is too small. Round 10's `hitY` crush also **charged the
kickplate's darkness twice**, once in `pcol` and once in the ramp.

Fresnel calibrated off `reference/store_12`: dark table Y 0.1310, floor under it 0.1691, open floor
0.3883/0.3534, so **(open-under)/(open-object) = 0.85. The render answered 0.04.**

## THE CRITERION DECLARED ITS THREE ANSWERS BEFORE SCORING

Round 29 died because its criterion returned the same label for the fixed render and for a
photograph. Round 30 states, in advance:

    OFF arm      = none
    ON arm       = present but short
    PHOTOGRAPH   = present and full

**Three distinct answers, so it cannot saturate** — and the middle one is an admission built into
the instrument. **Declare the three answers before you cut a tile. If two of them collapse, the
test is finished before it starts.**

Its headline is published **as short of the target**: floor-band chroma, references n=14 **mean
18.90, range 14.96-25.21**; render **r29 11.49-13.36 -> r30 11.63-13.90**. *"Moves, does not
close"*, with the near band attributed mostly to a floor map in a file it does not own.

## THREE BUGS FOUND BY THE INSTRUMENTS, ALL OF WHICH LOOK LIKE A RESULT

- **An uninitialised GLSL global is not zero.** The debug channel **blew the floor white in BOTH
  arms with the channel off.**
- **Unpremultiply without returning coverage blows up.** One 0.7 m body took **58,000 pixels to
  white whatever colour it was painted** — a bug that is invisible to a colour check because it is
  colour-independent.
- **A 2D readback context with alpha reports a blown floor that is not there.** Two wrong
  conclusions were drawn before `{alpha:false}`.

**All three produce a confident, plausible, wrong measurement rather than an error.** Round 30 also
built two instruments and **published both as non-discriminating** — column chroma echo and
effective-reflectance slope, reference spread too wide.

Cost: draw calls **368 = 368**, triangles identical, programs 79 = 79, +2 textures, raster
0.2-0.5 ms, live frame **8.3 ms** — and **the new march REMOVED up to 12 in-loop colour fetches.**
Arms differ in uniform values only; `near_a1`/`near_a4` byte-identical by md5; **3,530 of 3,530
outside-mask differences explained as floor behind glass, 0 unexplained.**

**Standing:** the mirror image is **a patch, not a column** — real elongation needs more than one
texture tap.
