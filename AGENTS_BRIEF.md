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

## Contract note: `agents.report()` returns null on this build

Cop stamina had to be read off `cop.userData` instead. `agents.js`'s header documents
`api.report({stamina, staminaMax, boost, gassed, speed, nearest, chase})` as the reporting
path. Anyone relying on it should check it is live first.

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
