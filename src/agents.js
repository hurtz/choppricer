// OWNER: builder-agents. Cop, shoppers, thieves, stamina, powerups. The chase feel.
// CONTRACT — must keep exporting exactly this:
//   createAgents(THREE, scene, world) -> {
//     cop, shoppers, update(dt, input, api), reset()
//   }
// `api` provides: api.onBolt(shopper), api.onCatch(shopper),
//                 api.onEscape(shopper), api.onHarass(shopper)
// ROUND 6 adds two OPTIONAL callbacks. Nothing breaks if they are absent, but
// one of them is now load-bearing for the scoreboard:
//   api.onLeave(shopper)  — a CUSTOMER finished his shop and walked out of the
//     one exit. Innocents use that door now (see the note in escape()), so
//     onEscape must not fire for them or every honest shopper scores as a
//     merchandise loss. agents.js already routes them here instead; a game.js
//     that ignores onLeave simply sees fewer events than before, never more.
//   api.onAbort(shopper)  — he had it in his hand, saw the uniform posted on
//     the only way out, and put it back. This is the entire feedback loop of
//     the one-exit design: camping the door is punished by there being no
//     crime, and if the HUD never says so, a shift with no income reads as a
//     broken game rather than as a consequence. See agents.posted.
// ROUND 7 adds ONE more optional callback and ONE entry point:
//   agents.announceAt(subject, kind, opts) -> { ok, why, id, kind, heard, aisle, at }
//     "HEY, PUT THAT BACK", fired over the PA at whatever the spot monitor is
//     locked on. `kind` is 'putback' (rolls compliance) or 'hold' (pins him
//     where he stands, rolls nothing — this is the price-check line game.js
//     already had, now driven from here instead of by poking s.state). It ends
//     in abortTheft()/dumpGoods(), i.e. round 6's own two functions, so a
//     deterred thief is worth ZERO on exactly the path a ditched one is.
//   api.onAnnounce(shopper, kind, outcome)  — outcome 'heed' | 'shrug' | 'hold'
//     ...and, ROUND 8, 'bolt'.
//     Fires 0.35-0.95 s after the call, at the instant the clip starts, so a
//     ticker line cannot get ahead of the picture. It is what he VISIBLY did
//     and never whether he was guilty: 63.3% of guilty subjects put it back and
//     so do 32.5% of innocent ones. A subject who heeds ALSO fires the existing
//     onAbort(s, 'announce'), so a game.js that already scores balks scores
//     this correctly with no change at all.
// ROUND 8 adds the FOURTH OUTCOME AND NO NEW CALLBACK: 'bolt'. He heard it, he
//     worked out what it meant, and he ran. It arrives on onAnnounce like the
//     others, at the instant the run-up clip starts, and it is followed about a
//     second later by the EXISTING api.onBolt(s) when he actually goes — so a
//     game.js that has never heard of 'bolt' still gets a complete, correct
//     chase out of it and only mislabels one ticker line.
//     *** ACTION FOR game.js: `outcome === 'heed' ? PA_CHIP_HEED : PA_CHIP_SHRUG`
//     now prints "HE LOOKED AROUND" over a man sprinting for the doors. It
//     needs a third arm. The behaviour is right either way; the copy is not. ***
//     Innocents CANNOT reach this outcome (boltChance gates on s.guilty and
//     measures 0.0% on the clean population at n=120), which makes a bolt a
//     confession — priced by the fact that you are 40 m away when you buy it.
//     See the ROUND 8 block below for what it costs and what it pays.
// All movement constants come from TUNING in ./config.js.
//
// Also (additive, all optional — nothing breaks if the other side is absent):
//   we CALL   api.report({stamina,staminaMax,boost,gassed,speed,nearest,chase})
//             ...plus, ROUND 5 and additive, the wind state machine itself so
//             the HUD does not have to re-derive it from `stamina < eps`:
//               wind      'ready' | 'recovering' | 'winded'
//               windIn    seconds until you can sprint again. IT ONLY TICKS
//                         DOWN WITH THE KEY UP — Infinity while it is held,
//                         which is the lesson, on a countdown.
//               burst     seconds of sprint in hand right now (0 when winded)
//               burstMax  seconds a full tank buys — size the segments off
//                         this, not off a hardcoded 3.1
//               refill    seconds from empty to full, off the key
//               windFrac  stamina/staminaMax, for a plain bar
//               fatigue   0..1, rises fast and falls slow. Accumulated wear for
//                         a PULSE readout, which wants a LAGGING signal rather
//                         than `1 - frac` restated in a different shape.
//   we READ   api.mode / api.aisle / api.frozen / api.wantSuspect
//   we EXPOSE agents.bench(opts) / benchAll / benchReal — deterministic chase
//             harness, see bottom of file. bench() starts from the geometry
//             game.js actually creates; read the note there before quoting it.
//   we EXPOSE agents.escapeField / fleeBuilds — debug handles for the cop-priced
//             route field a fleeing thief steers on.
//   we EXPOSE agents.thiefCruise() / thiefTop() — a fleeing shopper's real speed.
//             TUNING.thiefRun is his opening ceiling, not his cruise; anything
//             estimating a door countdown should use thiefCruise().
//             ROUND 9 (2nd pass): his cruise is a RANGE now, not a constant —
//             3.64 m/s with his legs fresh, decaying to 3.08 — and
//             thiefCruise() returns the midpoint estimate the pursuit bot uses.
//             A door countdown built on it is right on average and optimistic
//             in the first seconds of a chase, which is the correct direction
//             for an alarm. Nothing on the game.js side has to change.
//   we EXPOSE agents.lungCheck() / paceCheck() — the two startup assertions.
//             lungCheck: a gassed cop must not outrun a fresh walking one.
//             paceCheck: the thief must be fastest fresh and slowest blown, and
//             the pursuit bot's estimate must lie between the two. Both return
//             { ok, why } and both are stamped onto every bench() result as
//             `lungBroken` / `paceBroken`, so a measurement taken on a broken
//             ladder says so on its own object instead of being quoted.
//
// THE CHASE, MEASURED — from the spawn the game actually creates, and reported
// AS A DISTRIBUTION. Round 3's headline (68% -> 73%) was the mean of two
// near-deterministic branches and it hid the only number that mattered:
// 61% of catches landed inside ONE SECOND of the bolt. That is not a chase, it
// is a collection, and my own bench had been printing `catchUnder1s: 120/200`
// on the object I was quoting from. Read the whole instrument before you write
// the report. Nothing below is a mean without its shape attached.
//
// ===========================================================================
// ROUND 12 (MOVEMENT) — THE WALK WAS A WAVEFORM, AND THE SHELF NEVER LOST
// ANYTHING
// ===========================================================================
// Client, in full: "Their movements in general should be VERY BELIEVABLE, and
// when they pick something up off of the shelf, THEY REALLY SHOULD REMOVE IT
// FROM THE SHELF."
//
// ---- THE ARITHMETIC THAT STARTED IT --------------------------------------
// Round 11's gait was two sines and one of them was wrong in a way that is
// provable rather than aesthetic. A rigid leg of length L pivoting at the hip
// puts its foot at x = L sin(theta); for the foot to be PLANTED that foot has
// to travel backwards at exactly the body's ground speed while it is down.
// Differentiating the shipped line at mid-stance:
//
//     dx/dt = L * amp * phase_dot = 0.86 * (0.20 v) * (v / 0.88) * 2PI
//           = 1.228 v^2
//
// which equals v at exactly ONE speed: 0.81 m/s. At the shopper's own
// 1.25 m/s the foot went backwards at 1.92 m/s under a body doing 1.25 — a
// treadmill, quadratically worse either side, and at a bolting 3.5 m/s the
// foot was doing 15 m/s. No value of `amp` fixes it, because the error is a
// function of speed and the constant is not.
//
// So the gait is now a CONSTRAINT (src/agents/gait.js). The stance foot is the
// input: given a step length S and a duty factor D, a foot that lands SD ahead
// and leaves SD behind travels 2SD while the hip travels v*D*T = 2SD. Equal by
// construction, at every speed. The leg angle is asin() of that, the vertical
// bob is L(1 - cos theta) — the controlled fall, free, at an amplitude nobody
// had to pick — and `stride`, `amp` and `bounce` survive as trims on a real
// quantity instead of being three independent ideas of the same one.
//
// ---- FIVE BUGS, AND FOUR OF THEM WERE FOUND BY AN INSTRUMENT ---------------
// gaitCheck() re-derives the planted foot from scratch and fails loudly. It
// passed while the rig was still visibly wrong FOUR SEPARATE TIMES, which is
// the lesson: a check on the solve is not a check on the rig.
//
//   1. THE CHECK ITSELF had a sign error and reported the SUM of the hip
//      advance and the foot excursion — 1,589 mm at a walk, exactly twice the
//      step, which is how it announced itself.
//   2. THE LEG ANGLES WERE SCALED BY `gait` (speed/1.4 = 0.786 at a walk) to
//      fade the solve out at rest. The plant is an EQUALITY between the leg
//      angle and the ground travel, so scaling one side broke it: 142 mm of
//      measured stance-foot drift per step, under a passing check. Fading the
//      STEP instead keeps the equality — and every other input has to fade
//      with it, which is bug 5.
//   3. THE FOOT PIVOTED ON ITS ANKLE. At toe-off the sole plantarflexes
//      0.52 rad and about the ankle that swings the heel, 83 mm behind the
//      joint, through the floor: the probe read the lowest point of a walking
//      shoe 74 mm BELOW the tiles on every body, every stride. A real foot
//      rolls on whichever contact point is down, which is one min() over the
//      two sole corners. The pitch is also authored against the GROUND and
//      converted to an ankle angle by subtracting the shank lean; writing it
//      straight onto the shoe makes a peg leg.
//   4. THE SOLE PIN READ THE HIP HEIGHT ONE FRAME LATE. It took the floor from
//      `hips.position.y`, which is written thirty lines further down, and at
//      the stance handover — where the drop moves 46 mm in three frames as the
//      carrying leg changes — that stale value put the heel 43 mm through the
//      tiles on exactly the frame of heel strike. Everywhere else it was
//      within 6 mm, so it read as a transient rather than as an ordering bug.
//      It reads `_G.drop` now: one owner, no phase.
//   5. STANCE FLEXION AND KNEE LIFT DID NOT FADE WITH THE GAIT. `phase` keeps
//      ticking on a stopped body, so a standing body still cycles through
//      stance and swing — and it sat 47 mm low forever while slowly picking
//      each foot up off the floor. That low sit then MASKED bug 6.
//   6. (NOT MINE, AND IT HAS SHIPPED IN EVERY BUILD OF THIS GAME.) Four of
//      round 9's seven idles and one browse style lower `hips.position.y` by
//      14-55 mm to put weight on a hip or lean on a cart bar, and nothing
//      lowered the LEGS with them. Probed across all fourteen bodies, a
//      standing crowd stood 30 to 62 mm UNDERGROUND. Invisible in a still,
//      because the floor draws over it. With a knee available it is four lines.
//
// ---- WHAT THE RIG MEASURES NOW, and the instrument is __PLANT in
// ---- shots/_probe_move_plant.js, which measures the SHOE and not the solve --
//                                     round 11        round 12
//   solve slip, all speeds/builds     83-710 mm        0.0 mm  (gaitCheck)
//   live stance-foot skate, foot-flat      —          11-36 mm
//   sole below the tiles, walking          —          -28..+28 mm
//   sole below the tiles, STANDING     -30..-62 mm     -41..+48, |median| 11
//   hip bob                             ~30 mm flat    26-48 mm, off the stride
//   swing-foot clearance                    0 mm      39-136 mm, off the build
//
// The third instrument mattered as much as the numbers. Measuring foot skate is
// harder than it looks and three of my instruments were wrong before this one:
// the shoe's BBOX CENTRE reports 66 mm, but a correctly planted foot does move
// its centre forward as it rolls heel to toe — that is rolling. The LOWEST
// CORNER reports 254 mm, because the lowest corner changes identity at
// mid-stance and the heel and toe are 230 mm apart. What is unambiguous is
// FOOT-FLAT: while the sole is parallel to the floor nothing on the shoe is
// rotating, so the bbox centre is a material point, and if the foot skates it
// skates there.
//
// ===========================================================================
// ROUND 1 (COP) — AND NONE OF THE ABOVE WAS EVER APPLIED TO HIM
// ===========================================================================
// Everything in the section above is the SHOPPERS' walk. `animateCop` was a
// separate function still running round 11's two-sine waveform, so the man the
// player looks at centre frame, at three metres, for the entire floor phase,
// got none of the plant, none of the knee, none of the foot roll and none of
// the four bug fixes. His leg group could not even be given them: `copLeg`
// baked the oxford INTO the trouser, so gait.js's shoe search returned null on
// its first line and would have gone on doing so silently.
//
// The same arithmetic, run on HIS constants (amp 0.165v, stride divisor 0.95):
//
//     dx/dt = L * amp * phase_dot = 0.86 * (0.165 v) * (v / 0.95) * 2PI
//           = 0.938 v^2
//
// equals v at v = 1.066 m/s, and he is never at 1.066 m/s — his walk is 2.35
// and his gassed walk is 1.46. At 2.35 his foot swept backwards at 5.18 m/s
// under a body doing 2.35, every frame this game has ever drawn him walking.
//
// He now calls poseWalk(), the same function animateShopper() calls, and
// everything that is genuinely his is a number in K.cop*. Measured on him:
//
//                                   before          after
//   cadence at 2.35 m/s          2.477 Hz         1.604 Hz
//   step length                     474 mm           733 mm
//   lateral pelvis travel             0 mm            88 mm
//   stance-foot skate, foot-flat  (no plant)   heel 44-46, toe 73-75 mm
//   sole below the tiles          (no ankle)        -7.3 mm
//   swing-foot clearance                0 mm          37.6 mm
//   knee                             none      real, rig.kneeOk true
//
// The skate figure is against the SHOPPERS measured on the same instrument at
// the same threshold — heel 15-25 mm, toe 32-55 mm — at roughly half his speed
// and 85% of his step, so as a fraction of the foot's own excursion he is
// 7.8% against their ~7%. As planted as the shipped crowd, which is the only
// bar a rig comparison can honestly claim.
//
// TWO THINGS FOUND WHILE PORTING HIM THAT WERE NOT HIS. Round 1 gave him both
// behind flags and left the crowd alone, because fixing either one moves
// fourteen shoppers and that round was not allowed to. ROUND 3 (move) CLOSED
// BOTH AND DELETED BOTH FLAGS — see gaitUnits() and the sole pin in poseWalk.
//
//   A. THE SOLVE IS IN ROOT-LOCAL METRES AND THE STORE IS NOT. `L` and the
//      step are inside the figure's own root group, which is SCALED — 1.04 on
//      him, 0.9585 to 1.1143 across the roster. The plant identity v*T = 2*S
//      only holds when v and S share units, so the drawn foot sweeps rootScale
//      times what the solve planted and the stance foot skates by
//      (rootScale - 1) of its excursion. Measured on the crowd: the foot-flat
//      skate regressed against root scale at slope -0.721 +/- 0.142 before
//      (p = 0.0003) and +0.224 +/- 0.126 after (p = 0.10, CI contains zero), so
//      the error stopped being a function of how tall the body is rather than
//      merely getting smaller. `vLocal` is not a flag any more; it is
//      `gaitUnits()`, and both callers use it.
//   B. THE SOLE PIN SOLVES IN THE LEG'S OWN FRAME AND THE PELVIS ROLLS
//      UNDERNEATH IT. footPose returns a corner's height relative to its own
//      hip pivot; the pivot is out at +-stance and the hips roll about their
//      origin, so a listing pelvis carries the loaded pivot down by
//      px*sin(list) and the pin never hears about it. On him that was 39.6 mm
//      of sole through the tiles every stride (2.2 mm with `copList` forced to
//      zero). On the crowd it was a p01 of -24.2 mm, a median of -4.8 and a
//      worst of -25.7 over 8,300 stance-foot frames; it is -7.8, -0.35 and
//      -12.3 now. `pinRoll` is gone; the roll-aware pin is
//      what everybody gets, and it collapses to the old expression exactly at
//      zero list, which plantCheck() asserts rather than claims.
//
// ---- AND THE OTHER FOUR THINGS THE BRIEF ASKED FOR ------------------------
//   STARTING       0 -> 1.17 m/s in 0.42 s, measured, against 0.12 s before.
//                  thiefAccel is untouched — it is the chase's constant and
//                  the pursuit bot dead-reckons the thief with it — so this is
//                  a ceiling on the TARGET.
//   STOPPING       1.17 -> 0 in 0.25 s, and the trunk keeps going: the body's
//                  own acceleration drives `chest.position.z`, a channel
//                  nothing else in the file has ever written, so it composes
//                  with every pose for free.
//   TURNING        `heading` still flips in one frame and every consumer of it
//                  is untouched; the BODY is drawn at `visYaw`, which chases it
//                  at 5.6 rad/s. Measured on a 180: the sim heading inverts on
//                  frame 1 and the body takes 0.67 s. The head leads by 0.62 of
//                  the remaining error, and the yaw rate banks the trunk.
//   STANDING STILL A body at a shelf now stands SQUARE TO THE FIXTURE at arm's
//                  reach, and reaches at it on a clock. See below.
//
// ---- THE SHELF, AND THE ONE PLACE A GUILT TELL COULD HAVE ENTERED ----------
// The lead's finding, measured on the live build, was worth more than the
// wiring: only 2 of 14 bodies were ever within 1.4 m of a takeable facing,
// because wanderTarget picked `aisleX +- 1.15 m` and that is the middle of the
// lane. A reach animation would have been reaching at nothing, and a crowd on
// one line is why the render read as a lineup. It now stands 1.05-1.38 m off
// the centre — the nav's own free edge is 1.46 m in six aisles and 1.02 m in
// the narrow one, and the retry finds whichever it is — AND IT TAKES THE SAME
// NUMBER OF DRAWS OFF rnd() AS BEFORE, which this file's header explains at
// length is not a style point.
//
// THE TAKE HAS EXACTLY ONE CALL SITE and it is not the concealment. takeAt() is
// called from the grasp frame of the browse reach, which is scheduled off the
// RIG's idle clock — a clock no state transition can restart, round 9's
// argument, reused because it is the strongest available. A thief conceals an
// item he is ALREADY CARRYING, picked up two aisles ago looking like everybody
// else. The rejected build wired takeFacing into every clip that shows a prop;
// that leaks, because the clips author different arm angles at the frame `vis`
// turns on, so the three steals would take from a different HEIGHT than the
// seven decoys and only thieves play the steals.
//
// Measured with benchTake(28, secs 75), cop parked, difficulty 1, two posts:
//
//                          takes/min   putBack%   grab height   grab dist
//   innocent, cop at desk     0.925      49.0%       1.344 m      0.397 m
//   ARMED,    cop at desk     0.109      66.7%       1.665 m      0.461 m
//   innocent, cop on door     0.984      46.6%       1.347 m      0.388 m
//   ARMED,    cop on door     0.150      57.1%       1.541 m      0.428 m
//
//   LR(take rate)   0.118 desk / 0.152 door        <-- THE ROUND'S KNOWN LEAK
//   LR(put-back)    1.36 / 1.23      (n=3 and n=7 guilty takes; noise)
//   LR(grab height) 1.24 / 1.14      (same, noise)
//
// ---- AND I AM NOT GOING TO PRETEND THAT FIRST NUMBER IS 1.00 --------------
// A body that was armed this shift opens a gap about a SEVENTH as often as one
// that was not, and that is a real, measurable thing a player could learn.
// Three things about it, in order of how much they matter:
//
//   IT IS STRUCTURAL AND IT PREDATES THIS ROUND. Decomposed: an armed body is
//   in the building 29.5 s against an innocent's 66.2 s (2.2x), and the rest is
//   state mix — his timeline is walk -> conceal -> drift -> door, so he is
//   simply not standing at a shelf browsing for most of the time he is here.
//   Round 11's thief did fewer browse POSES for exactly the same reason; what
//   this round did was make that difference legible by attaching a hole in a
//   shelf to it.
//
//   IT POINTS THE WRONG WAY TO CONVICT ANYBODY. The direction is "a body that
//   takes things off shelves is probably innocent". A gap cannot implicate; the
//   most it can do is exclude, and it excludes weakly — at 0.15 the ratio is
//   about as informative as the shrug (0.34), which has been published and
//   accepted since round 7.
//
//   THE FIELD SATURATES. The store's FIFO caps open gaps at 160 and both cells
//   above hit 159-160 inside 75 s, so the shelving as a whole reads "shopped"
//   and attributing any particular hole to any particular body needs the player
//   to have watched that body continuously — which is the scarce resource the
//   whole desk phase is about.
//
// THE FIX I DID NOT SHIP, and the reason. Requiring one completed reach before
// any body may start a steal clip would equalise the rate outright, is
// guilt-blind in form (`reachN >= 1`, a counter that has never seen guilt), and
// is three lines. It also moves `concealT`, which moves the bolt, which moves
// the chase and every likelihood ratio in this file. That is a tuning round,
// not a change to slip in at the end of an animation one. Handing it to the
// lead with the measurement rather than shipping it untested.
//
// ---- NO REGRESSION, and the instrument had to be fixed before the numbers
// ---- could be believed ---------------------------------------------------
// bench(n=200, difficulty=1) — passed explicitly, per CLAUDE.md:
//
//   round 11, seed 1234, clean page load          64.0%
//   round 12, seed 1234, shipped                  63.5%      -0.5
//   round 12, seed 1234, reach ablated            64.5%
//
// and three consecutive identical calls now return 63.5 / 63.5 / 63.5.
//
// THEY DID NOT AT FIRST, and this is the part worth reading. The same build at
// the same seed with the same difficulty measured 64.5 / 66.5 / 64.5 / 64.0
// across four consecutive calls, and a paired ramp ablation measured a
// beautifully consistent -3.5 points on three separate seeds — a number I very
// nearly reported as a real cost of the start ramp. It was not. `reachT` lives
// on the rig, no state transition restarts it, and unlike round 9's `idleT` —
// which only ever chose a POSE — it decides when a body starts a CLIP, which
// changes s.timer, which changes when he walks, which changes where the crowd
// is, which changes a chase. Ablating the reach entirely gave 64.5 three times
// and identified it. It is now re-phased at reset() off the RNG STATE AT ENTRY,
// captured before the guilt draw, so trial k is trial k whenever it is run and
// the phase has no guilt term in it. With that fixed the ramp's cost is inside
// the +-0.5 the bench can resolve at n=200.
//
//   LR(put-back)       1.93 -> 2.04     (cold heed 63.2 -> 65.8, clean 32.8 -> 32.3)
//   LR(bird | armed)   0.80 -> 0.82,  hot 0.78 -> 0.85
//   complaints from announcing            0, both populations, unchanged
//
// The put-back ratio moved 0.11 and I could not pin it on the reach: ablating
// the reach entirely leaves it at 2.04. What is left that can move it is the
// shelf-side browse target, which changes how long a body takes to get where it
// is going and therefore how much of `concealT` has run when the PA lands. It
// is the same size as the round-7-to-round-8 drift (1.95 -> 1.98) and smaller
// than the 1.95 -> 2.33 a single misplaced rnd() draw caused in round 8, but it
// is a real move and I am not going to call it noise: it is a timeline change
// with a plausible mechanism, published rather than buried.
//
// ---- BUDGET ---------------------------------------------------------------
// No new mesh, no new material, no new texture and no new draw call. The knee
// is a scale on a mesh that already existed; the ankle roll is a rotation on
// the shoe that already existed; the prop is the `held` mesh round 5 added,
// pointed at a colour and a size the store handed over. Per body per frame the
// gait adds one solveGait (2 asin, 4 cos, ~40 flops), two footPose calls
// (4 trig each) and one takeFacing per reach — the store measures that at
// 1.00 us a take, and at the shipped rate the whole store does about 9 a minute.
// ZERO new draws off rnd(): the reach schedules itself, picks its tail and
// picks its shelf height off hash2(body, reach number), which is why the bench
// above is comparable to round 11's at all.
//
// ===========================================================================
// ROUND 9, SECOND PASS — THE DRINK WAS WORTH NOTHING AND THE DRINK WAS NOT THE
// PROBLEM. TWO OF THE THREE CAUSES WERE IN THE INSTRUMENT.
// ===========================================================================
// The lead's measurement, and it reproduces character for character:
//   bench({ n:100, spawn:'aisle', bot:'cut', difficulty:1 }), same 100 chases
//                     rate   boostFrac  catchT_med  missByFt_med  barged
//     mode:'none'      75%      0.00       6.22 s      14.26          6
//     mode:'boost'     74%      0.58       2.43 s      24.01         25
//     mode:'pickup'    75%      0.51       2.95 s      27.13         18
// Round 5 published drink-in-hand at +12.6 points. It was -1, and a drink made
// you lose by ten feet MORE.
//
// ---- THE PAIRED READ: IT WAS NEVER INERT, IT WAS A COIN FLIP -------------
// bench seeds per trial from `1234 + k*7919`, so trial k is the SAME chase in
// every mode and the modes can be compared trial by trial instead of as two
// aggregates that happen to land on the same number. Paired, n=100:
//     both caught 58 · both missed 9 · DRINK WINS 16 · DRINK LOSES 17
// The drink flipped a THIRD of all chases and netted minus one. "Worth
// nothing" was an average over a mechanic doing enormous work in both
// directions. Nothing below would have been findable from the aggregate.
//
// ---- CAUSE 1: ONE EXIT. Ablated, n=100, same seeds ----------------------
//                            no drink   drink   drink worth
//     shipped (one door)        75%      74%       -1
//     identity model off        75%      74%       -1     (inert)
//     round-6 leavers off       79%      78%       -1     (inert)
//     crowd off                 78%      83%       +5
//     TWO DOORS                 70%      80%      +10
// ONE EXIT IS ELEVEN OF THE THIRTEEN POINTS THE DRINK LOST SINCE ROUND 5, and
// nobody re-measured the powerup when round 6 landed. The mechanism is not
// mysterious and it is not fixable by tuning the drink: with one way out the
// destination is public, so the `cut` bot ALWAYS finds an intercept and
// arrival time is never the binding constraint. Speed can only be worth
// something when getting there in time is in doubt. Note the sign — one exit
// HELPS the sober cop (+5) and HURTS the boosted one (-6).
//
// ---- CAUSE 2: THE BENCH BOT HELD A KEY THAT DOES NOTHING ----------------
// Round 5 fixed the GAME so a gassed man holding sprint does 2.04 m/s against
// his own 2.35 m/s walk. It never fixed the BOT, and every wind policy reaches
// for the key through `urgent` (gap < 3.4 m) — exactly when the man is closest
// and the tank most likely just emptied on him. `regenHold` is 0, so holding
// it while gassed does not merely fail to help, IT PREVENTS RECOVERY FOREVER.
// The trace, trial 29, mode:'boost':
//     t=4.52  GASSED at gap 2.21 m, still inside `urgent`, so he holds
//     t=4.5 -> 17.7   THIRTEEN SECONDS at a flat 2.04 m/s, thief at 3.08.
//                     Gap 2.21 -> 15.14 m. Final miss 15.1 m.
// It costs the BOOSTED cop far more, because a drink is what gets you into the
// close-range duel where `urgent` latches. That is the whole of "a drink makes
// you lose by more". Fixed in `keyUp()`; `always-sprint` is exempt and must
// stay exempt, and `legacyWind:true` restores it for any bench call.
//
// ---- CAUSE 3: A DRINK DOUBLED YOUR TURNING CIRCLE -----------------------
// Round 5 wrote "fast is not agile" as prose. It is arithmetic, in steer():
//     latMax = copAccel * (1 - (1 - copGrip) * speed/top),  top = copRun*boostMul
//     sober  5.05 m/s  latMax 7.61  turning radius 3.35 m
//     drunk  7.17 m/s  latMax 7.02  turning radius 7.32 m
// In a store with 1.58 m of usable half-lane. The drink was LOSING the duel it
// bought you. `boostGrip` multiplies copAccel while the boost is live.
//
// ---- WHAT SHIPPED, AND THE ONE NEW MECHANIC ----------------------------
//   keyUp()      the bot lets go of the key when winded          (instrument)
//   botCruise    ONE estimate of the thief's cruise, used by the intercept,
//                the dead-reckoning and game.js's door alarm     (instrument)
//   boostGrip    2.40 — the drink buys footwork, not just legs
//   THE THIRD TANK — thiefFresh/thiefSpent/thiefLegs in thiefPace(). Round 5
//                named this and called it "a round, not an afternoon": his
//                cruise now DECAYS under sustained running instead of being a
//                flat floor. His BLOWN cruise is config's thiefTired to three
//                decimals, so nothing was taken away from him; what is new is
//                that his first seconds are faster and then come back to it.
//
// ---- THE THREE-MODE TABLE, RE-MEASURED. n=200, difficulty 1, one page load,
// ---- against a round-8 control run in the same load (thiefFreshMul 1.0,
// ---- thiefSpentMul 1.0, boostGrip 1.0, legacyWind:true) ------------------
//                     ROUND 8 CONTROL          SHIPPED
//   no powerup        73.5%   miss 15.44 ft    70.0%   miss 5.89 ft
//   drink in hand     78.5%   miss 22.83 ft    90.5%   miss 5.71 ft
//   go and get one      --                     89.0%   miss 6.37 ft
//   THE DRINK IS WORTH   +5.0                    +20.5
//   median chase      6.22 s                   5.68 s
//   catches inside 1s 16.3%                    17.1%
// The miss distribution is the row PROMPT.md actually asks about: p10-p90 goes
// from 1.62-13.28 m to 1.35-2.75 m. You lose by four to nine feet now, in
// every mode, instead of by fifteen feet with a tail into the car park.
//
// ---- PER-CHANGE ABLATION, all on the shipped build, n=200 ---------------
//   bot holds the key again (legacyWind)  no drink 64.5%, miss 14.95 ft
//                                         ...so the bot fix is +5.5 points AND
//                                            nine feet of miss distance
//   boostGrip 1.00                        drink   79.5%  (agility is +11.0)
//   thiefFreshMul 1.00 (no third tank)    no drink 90.5% (the tank is -20.5)
//
// ---- NO REGRESSION. Same n=200, same page load, control alongside -------
//                          ROUND 8 CONTROL   SHIPPED
//   cut off0                  73.5%           70.0%
//   cut off1                  74.0%           68.0%
//   door-camper               34.0%           36.0%   (124/200 ditched, both)
//   naive pursuit             34.0%           39.5%
//   always-sprint             49.5%           34.5%
//   RATIONING IS WORTH        +24.0           +35.5
//   lungCheck()               passes, 2.043 m/s gassed-and-holding vs 2.35 walk
//   paceCheck()               passes, 3.08 / 3.36 / 3.64 m/s spent/model/fresh
//
// TWO OF THOSE ROWS NEED SAYING OUT LOUD RATHER THAN LEAVING IN A TABLE.
//
// THE MISAIM TABLE IS STILL FLAT AND I DID NOT FIX IT. 73.5 -> 74.0 becomes
// 70.0 -> 68.0: being sent to the wrong aisle costs two points where it cost
// minus a half. That is not a fix, it is noise moving. An earlier draft of this
// round measured a 13.5-point slope there and I nearly published it; it was an
// artifact of the pessimistic bot model described below, and it evaporated the
// moment the instrument was made honest. Round 6's own header calls this the
// honest weakness of the one-exit store and says the fix is a STAGING LEG for
// the thief, not a constant. It still is. It is the biggest thing left here.
//
// THE WIND LADDER GOT WIDER, NOT NARROWER, AND IT IS WORTH KNOWING WHY.
// Rationing goes from +24.0 to +35.5 because the two ends move in OPPOSITE
// directions: `ration` gains from keyUp (it now lets go when winded) and
// `always` is exempt from keyUp by design and simply meets a faster thief. The
// bottom rung is 34.5% now. That is a real punishment and the lead should look
// at it, but it is the same shape round 5 built and a wider version of it.
//
// ---- THE MEASUREMENT MISTAKE THIS ROUND MADE, IN FULL --------------------
// `t` is TUNING-FIRST. A fallback in the K block is live only while config does
// not carry that key. config.js owns `thiefTired`. I moved its fallback from
// 0.575 to 0.68 to make the thief faster, measured a control that should have
// been byte-identical to the previous build, got 62% where it should have read
// 74% — and spent twenty minutes blaming the store builder's parallel rebuild,
// which was innocent and which I checked and cleared only afterwards. What I
// was actually running was a man who got FASTER as he tired. CLAUDE.md warns
// about shadow blocks that make config decorative; this is the same bug with
// the polarity reversed, it is harder to see because nothing disagrees, and it
// is now asserted at startup by paceCheck() rather than described.
//
// AND THE SECOND ONE, WHICH WAS WORSE BECAUSE IT WAS AN ARGUMENT AND NOT A
// TYPO. Having given the thief a cruise that varies, I left the bot's `tSpd`
// reading his old flat constant, and wrote a paragraph justifying it: a player
// cannot see a stamina bar over a thief's head. True — and also exactly how you
// would describe a difficulty lever wearing a fidelity costume. So I measured
// it. n=200, moving ONLY the bot's estimate of him, nothing else:
//     bot models him at his BLOWN cruise  (0.575)   66.0%
//     bot models him at the MIDPOINT      (0.628)   77.0%
//     bot models him at his FRESH cruise  (0.680)   80.5%
// FOURTEEN AND A HALF POINTS. A third of the difficulty I thought I had built
// out of the thief was built out of hobbling the instrument, and the flat
// misaim slope above is what was left once it came out. Round 8's bot modelled
// the man exactly right because his cruise was a constant; the moment it became
// a range, "read the constant" silently became "assume he is always at his
// worst". There is one `botCruise` getter now — the midpoint of the range he
// can actually run at, equally wrong in both directions — and botGoal, the
// dead-reckoning and thiefCruise() all call it. paceCheck() asserts it stays
// bracketed by the two ends.
//
// ---- INSTRUMENTS I DISTRUSTED ------------------------------------------
//  - n=100. One standard error is 4.6 points at p=0.7. Half my sweeps moved
//    less than that and I read them as signal for an hour. Every number in this
//    block is n=200 (SE 3.2) and the tuning decisions are made on mechanism,
//    not on the winning cell.
//  - THE LEAD'S `gotThrough` COLUMN. It reads 0% / 52% / 61% and it is not the
//    fraction of barges that get through — it is `bargedThenCaught/barged`, the
//    fraction still CAUGHT after getting through. The diagnosis it supported
//    ("52-61% of them GET THROUGH") is the opposite of what the field says.
//  - CROSS-PAGE-LOAD COMPARISONS, which are genuinely unsafe here: store.js and
//    cctv.js were rewritten under me four times during this round, and the nav
//    grid is built from the store's collider set. Every table above is taken
//    inside ONE page load with its own control. This turned out NOT to be the
//    cause of the 62%/74% discrepancy — the R8 control reproduces to the
//    character across all five loads — but the discipline is why I could rule
//    it out instead of guessing.
//  - `minGap` on an escape. It reads 1.2-1.3 m on almost every trial, caught or
//    missed, because it is sampled per frame against a 1.15 m catch radius. It
//    looks like a "barely" number and it discriminates nothing.
// ===========================================================================
// ===========================================================================
// ROUND 8 — THE REACTION IS A PERFORMANCE, AND ONE OF THEM RUNS
// ===========================================================================
// The client has played round 7 and the compliance maths survived contact. What
// did not is the PERFORMANCE. Verbatim:
//
//   "You gotta make it so that the people respond when the officer comes over
//    the PA. If he's viewing a camera and he says 'hey, excuse me, return that
//    item,' there's some interaction. They look around, they're not sure where
//    the sound is coming from, and then they realize that maybe they're being
//    watched. They're shaking their head and they're just pissed off — unless
//    they're a real thief, and then the thief is like 'oh shit', and gets
//    scared and starts running."
//
// That is two jobs. One is animation and one is a new outcome, and the second
// one is a load-bearing change to a mechanic this file spent a round proving
// was not a guilt oracle. Both are below, and the anti-oracle argument is
// re-made from scratch rather than assumed to have survived.
//
// ---- JOB 1: FOUR BEATS, NOT A GLANCE -------------------------------------
// Round 7's `lookAround` was a head-up and a shoulder check. The client is
// describing a sequence, and every react clip in decoy.js now runs all of it:
//
//   1  HEARD IT         head off the shelf, one check over the shoulder
//   2  CAN'T PLACE IT   a sweep of the aisle for whoever said that
//   3  FINDS IT         he looks UP, at the speaker or at the dome, AND STOPS.
//                       A third of a second of stillness. This is "they realize
//                       that maybe they're being watched" and it is the beat
//                       that makes the rest of it read.
//   4  NOT HAVING IT    the head shake, a shoulder hitch, and back to the
//                       shelf in a huff.
//
// The head shake is a 2.1 Hz oscillation and it is NOT keyframed: the neck yaw
// in animateShopper runs through a 110 ms first-order lag which halves anything
// at that rate, so authored as keys it came out as a vague waggle. The clip
// carries an AMPLITUDE (POSE.shake) and animateShopper carries the oscillation,
// added after the lerp instead of through it. One sin per reacting body.
//
// The annoyance also OUTLIVES THE CLIP, because "pissed off" is a state and not
// a gesture. `annHuff` already cut his remaining shop; round 8 makes it visible
// on three channels for annHuffT = 7 s — chin up, eleven hundredths of the
// stoop taken back out of him, and K.annHuffPace on his walk. In a store whose
// entire posture language is people folded over a cart, a man walking with his
// back straight reads at 214 px without needing a face. GUILTY SHRUGGERS GET
// THE IDENTICAL TREATMENT, or the huff would be the tell the shrug is not.
//
// ---- JOB 2: HE RUNS, AND WHAT THAT COSTS ---------------------------------
// `onAnnounce` now has a fourth outcome, 'bolt'. It is not an animation: it
// ends in the same `bolt` state with the same api.onBolt() the proximity bolt
// produces, so the chase downstream of it is round 5's, unchanged.
//
// A thief who runs when you shout at him IS a confession, and two rounds of
// this file exist to stop the PA being a scanner. Three things pay for it.
//
// ONE: THE GATE IS GEOMETRY. boltChance() returns zero unless
// beatsCopToDoor(s) — round 6's own race, already load-bearing for heldOff().
// He does not run at a door you are standing in front of. Measured, hot subject,
// n=120 per cell, cop placed by hand:
//
//     cop at the mouth of his aisle (the dispatch position)   0.0% bolt
//     cop standing on the only door                            0.0% bolt
//     cop 8 m behind him, deeper in the store                 22.5% bolt
//     cop at the service desk, 40 m away                      29.2% bolt
//
// So the announcement is worth information exactly when you are too far away to
// use it, and worth none at all once you have done the hard part. It also kills
// the obvious exploit — walk to 10 m, shout, read the answer for free — because
// at 10 m in front of him the answer is always no, and at 10 m behind him he
// was going to bolt at boltNear anyway.
//
// TWO: IT IS CARVED OUT OF THE SHRUG, NOT OUT OF THE PUT-BACK. reactToPA takes
// ONE rnd() and splits the interval: [0,p) heed, [p,p+q) bolt, the rest shrug.
// `heed` is still exactly `roll < p`, so THE ENTIRE ROUND-7 TABLE IS RECOVERABLE
// BY SETTING TWO CONSTANTS TO ZERO, and it is, character for character:
//
//                        heed    shrug    bolt        heed with annBolt = 0
//   guilty, pre-conceal  64.2%   25.8%   10.0%              63.3%   (r7: 63.3)
//   guilty, has it       35.8%   35.0%   29.2%              35.0%   (r7: 35.0)
//   innocent             32.5%   67.5%    0.0%              32.5%   (r7: 32.5)
//   bystander in earshot 25.8%   58.3%    1.7%              25.8%   (r7: 25.8)
//   guilty, three shouts 73.3%   15.0%   11.7%              78.3%   (r7: 78.3)
//   innocent, x3         47.5%   52.5%    0.0%              48.3%   (r7: 48.3)
//   LR on a put-back      1.98                               1.95   (r7: 1.95)
//
// LIKELIHOOD RATIO ON A PUT-BACK IS 1.98 AGAINST ROUND 7'S 1.95. One call still
// moves a 50/50 suspicion to 66%. The put-back is worth exactly what it was
// worth, because the bolt was taken from the men who were going to blank you.
// The right-hand column is the ablation and it is the proof: two constants at
// zero and this build IS round 7's build, to the decimal, on every row.
//
// INNOCENTS READ 0.0% AND CANNOT DO OTHERWISE. `s.guilty` is the first line of
// boltChance and there is no other way into paBolt.
//
// THREE: THE FIRST HALF-SECOND IS ONE FUNCTION. decoy.js's heard() draws the
// opening of ALL FIVE PA answers — the three shrugs, the startle, and
// `putbackPA` — as the same three keyframes at the same ABSOLUTE times, so the
// pose is identical frame for frame out to t = 0.50 s no matter which one is
// playing. The earliest divergence is 0.62 s, when one of them takes both hands
// off the cart bar; the item does not appear on a put-back until 1.42 s. Add
// the 0.35-0.95 s PA latency and the player has keyed the handset and watched
// between 0.85 and 1.45 seconds of footage that cannot tell him anything.
// `putbackPA` exists ONLY for that: round 6's putback clip opens with his hand
// already inside his coat, which would have made his answer readable from the
// first frame — and the innocent-heed branch names the same clip, or the
// innocent would be the only man in the building answering a PA with his hand
// in his coat.
//
// ---- SO DOES TALKING PAY NOW? IT STILL PAYS NOTHING ----------------------
// benchIncome(6, { minutes: 4 }), one exit, ramped difficulty, and a new row:
// `paChase` is the PA-spam bot with the one obvious upgrade — when something he
// shouted at RUNS, he goes after it, on foot, from the desk. No dispatch,
// because a dispatch is a teleport and the whole premise of the bolt is that
// the man who keyed the handset has to cover it himself.
//
//   desk    383.3 pts   4.33 thefts   3.83 caught   0.50 lost   0.00 balked
//   naive   100.0 pts   4.67 thefts   1.00 caught   3.67 lost   0.00 balked
//   camper    0.0 pts   4.00 thefts   0.00 caught   0.00 lost   4.67 balked
//   pa        0.0 pts   1.67 thefts   0.00 caught   1.67 LOST   1.08 balked
//   paChase   0.0 pts   1.67 thefts   0.00 caught   1.67 LOST   1.08 balked
//                       ...13.75 calls per shift and 0.00 BOLTS (n=12)
//
// THE PA PLAYER STILL EARNS ZERO, AND THE INTERESTING PART IS WHY THE BOLT
// NEVER REACHES HIM. He announces at whoever is doing something with their
// hands, because that is all a player can see and this bot does not get to
// cheat — so he is talking to innocents and to thieves who have not committed
// yet, and the cold bolt rate is 10%. Over 13.75 calls a shift that rounds to
// zero runners. THE FLUSH IS NOT AVAILABLE TO A MAN WHO IS GUESSING. It is
// available to a man who watched somebody conceal and then said something,
// which is a different player with a different problem, and his exchange rate
// is below. `paChase` is byte-identical to `pa` because it never had anything
// to chase.
// Complaints on the announcement itself: ZERO, every population, every shift —
// nothing on this path can reach onHarass and that is still true by
// construction.
//
// THE PRICE, STATED AS AN EXCHANGE RATE. Same subject, same moment — you have
// watched him conceal and you are at the desk:
//
//   DISPATCH and chase him          77.0 points expected   (bench cut, off0)
//   ANNOUNCE and chase what runs     8.4 points expected
//
// 8.4 is 29.2% bolt x 28.6% caught, both off the `hot` cell, with the cop
// dropping the handset and running from the service desk with a full tank
// (median 10.6 s, against a dispatched chase's 6.22 s). Announcing at a man you
// have already made is a NINE TIMES WORSE way to resolve him. That is the
// feature working: the PA is not for the case you have made, it is for the one
// you have not, and its price is that acting on what it tells you means running
// the length of the store.
//
// ---- NO REGRESSION -------------------------------------------------------
// n=100 each, this build:
//   cut off0        77.0%   median chase 6.22 s   catches inside 1 s 11.7%
//   cut off1        69.0%
//   camp off0       27.0%   70 of 100 trials end with the item back on a shelf
//   always-sprint   53.0%   so rationing is +24.0, unchanged
//   lungCheck()     passes, 2.043 m/s gassed-and-holding vs a 2.35 m/s walk
// Every one of those is the round-7 figure to the decimal.
//
// ---- ONE THING THAT COST AN HOUR AND IS WORTH THE PARAGRAPH ---------------
// startGesture ROLLS a clip when given a kind and NAMES one when given an id. A
// roll costs a draw off the shared seeded rnd(); a name costs nothing. Swapping
// the put-back's rolled call site for a named one — a change that touched no
// probability anywhere — walked the stream and moved measured innocent
// compliance from 32.5% to 27.5% and the published likelihood ratio from 1.95
// to 2.33. Nothing about the picture was wrong. See startPutback(), which takes
// the roll either way and overrides only its result. If you add a clip to this
// file, count the draws.
//
// ---- FOR THE LEAD: WHERE THE BUTTON IS -----------------------------------
// This round's brief describes the announcement as a DESK action — "the player
// is at the desk when he makes that call, 40+ metres from the floor" — and the
// economics above are the economics of that. game.js as it stands routes the
// deterrence line to the FLOOR ([F] at the reticle) and leaves the desk with
// callHold(), the neutral price check. The behaviour here is correct under
// both, because the gate is geometry rather than a mode check, but the two
// worlds play very differently: from the desk the bolt fires at 29.2% and is a
// long chase, and from the floor it fires only when the player is BEHIND his
// subject rather than between him and the door (22.5% / 0.0% in the table
// above). Worth a decision rather than a default.
//
// ===========================================================================
// ROUND 7 — "HEY, PUT THAT BACK." AND A MAN WHO LOOKS THE PART
// ===========================================================================
// The client, verbatim: "I'd like to make it so I could look at people
// shopping... If I see them doing something suspicious, I can go, 'Hey, put
// that back,' and then they look around, like, 'What the fuck?' ... But if it's
// a criminal doing it, they might actually reconsider ... they might put it
// back, and then just leave the store peacefully."
//
// This is round 6's deterrence on a SECOND TRIGGER. Everything behavioural
// already existed — deterR/deterBalk/chillLo/dumpT, the `putback` clip, the
// balk, the ditch, the `ditched` outcome — and all of it fired on PROXIMITY: a
// uniform stood near the only door. announceAt() fires the same machinery at
// RANGE, at a NAMED SUBJECT, and it ends in abortTheft()/dumpGoods(), which are
// round 6's own two functions. Nothing new was built on the economics side and
// nothing needed to be: a deterred thief is worth zero on the identical path a
// ditched one is.
//
// ---- THE ONLY QUESTION THAT MATTERED: IS IT A GUILT ORACLE ----------------
// If the guilty comply and the innocent do not, the button is a free scanner,
// the desk phase is a spotting exercise again and the harassment complaint can
// never fire on a reasonable read — which is exactly the failure the round-6
// decoy table was built to prevent. So both populations produce BOTH visible
// outcomes, and the rates are published rather than asserted.
// benchAnnounceLine(120), cop parked at the service desk 40 m away:
//
//                        put it back   looked around   complaints
//   guilty, pre-conceal      63.3%          36.7%           0
//   guilty, already has it   35.0%          65.0%           0
//   innocent                 32.5%          67.5%           0
//   bystander in earshot     25.8%          60.0%           0
//   guilty, three shouts     78.3%          21.7%           0
//   innocent, three shouts   48.3%          51.7%           0
//
// Likelihood ratio on a put-back is 1.95, so ONE CALL MOVES A 50/50 SUSPICION
// TO 66%, and a shrug moves it to 35%. That is a read. It is not a test, and
// the row that proves it hardest is the second one: a subject who ALREADY HAS
// IT IN HIS COAT complies 35.0% against an innocent's 32.5%, i.e. once he is
// committed the announcement carries no information at all. The information
// only exists in the window before he commits — which is the window where
// deterrence is the point and the payout is zero anyway.
//
// Four independent things hold that line, and they are all cheap:
//   1. A third of guilty subjects brazen it out (annHeed 0.62).
//   2. A third of INNOCENT subjects sheepishly put back whatever is in their
//      hand (annSpook 0.30) — and they play the SAME `putback` clip, so the
//      picture is identical. shots/agents_r7_announce.png is four rows of five
//      frames; rows 1 and 3 are the same five frames and so are rows 2 and 4.
//   3. Everybody within annSpill (7 m) looks up too, because a PA is a
//      loudspeaker and not a laser. "Somebody looked around" is worth nothing.
//   4. annFade (0.45) makes the second and third shout at the same body worth
//      steadily less, so the button is not a slot machine you pull until it
//      pays: three calls converge at ~78% and not at 100%.
// The three `react` clips live in decoy.js with tell:'react', which keeps them
// OUT of the decoy pool — pickGesture's modulo over seven decoys is what round
// 6's whole distribution was measured on and quietly making it eight would have
// moved every number in this file.
//
// ---- DOES TALKING PAY? IT PAYS WHAT CAMPING PAYS, WHICH IS NOTHING --------
// benchIncome(6, { minutes: 4 }), one exit, ramped difficulty. The `pa` policy
// never leaves the desk and never dispatches: every time the handset comes off
// cooldown he announces at whoever is doing something with their hands, which
// is the honest maximal read because a player cannot tell a steal clip from a
// decoy clip and neither can this bot.
//
//   desk    383.3 pts   4.33 thefts   3.83 caught   0.50 lost   0.00 balked
//   naive   100.0 pts   4.67 thefts   1.00 caught   3.67 lost   0.00 balked
//   camper    0.0 pts   4.00 thefts   0.00 caught   0.00 lost   4.67 balked
//   pa        0.0 pts   1.67 thefts   0.00 caught   1.67 LOST   1.00 balked
//
// THE PA PLAYER EARNS ZERO AND IS ALSO ROBBED. He suppresses two thirds of the
// thefts in the building — 4.33 down to 1.67 — and every one of the survivors
// walks out, because he is at the desk with a microphone instead of on the
// floor. That is strictly worse than the camper, who at least stops the goods
// leaving. It is the right shape: the announcement is a way to make nothing
// happen, and nothing happening pays nothing.
// Complaints on the PA policy: ZERO, across every shift sampled. Nothing on
// this path can reach onHarass() and that is the whole point of it — it is the
// safe alternative to walking up to somebody. What it costs instead is annHuff:
// a customer who has been shouted at in public finishes his shop early.
//
// ---- NO REGRESSION, AND ONE DISCREPANCY THAT IS NOT MINE ------------------
// n=100 each, this build, against the round-6 header's own numbers:
//   cut off0        77.0%   median chase 6.22 s   catches inside 1 s 11.7%
//   cut off1        69.0%
//   camp off0       27.0%   70 of 100 trials end with the item back on a shelf
//   always-sprint   53.0%   so rationing is +24.0, unchanged
//   lungCheck()     passes, 2.043 m/s gassed-and-holding vs a 2.35 m/s walk
// Every one of those is the round-6 figure to the decimal.
//
// The income table above is NOT the one round 6 published (it said desk 250.0 /
// 4.50 thefts / 2.50 caught / 2.00 lost). I did not take that on trust: I put
// the round-6 commit's agents.js, figures.js and decoy.js back on disk and ran
// benchShift on them. THE ROUND-6 BUILD PRINTS 383.33 / 4.33 / 3.83 / 0.50 AND
// 9.17 COMPLAINTS, character for character with what this build prints. So the
// difference is in round 6's report and not in round 7's code, and the numbers
// above are the ones that reproduce. config.js has not changed since the round-6
// commit either, so it is not a promoted-TUNING drift; most likely that table
// was written from a run at a different n or seed. Quote these.
//
// ---- JOB 2: THE COP LOOKS WORSE ------------------------------------------
// "He should really look fat and beaten up." The geometry is in figures.js and
// the write-up is there; what lives in THIS file is the animation half:
//   - `stoop` 0.09 -> 0.19, which is both the chest's resting slump and the
//     neck's resting pitch, i.e. chin down into the collar before anything has
//     happened. Round 6 could not afford that because the head was still half
//     buried in the torso; round 6's own fix is what pays for it.
//   - the shoulders ROUND FURTHER as fatigue rises, which the brief asked for
//     by name: the arm PIVOTS travel 30 mm forward at F=1 and the chest draws
//     in 3.5% across, so he narrows from the front as he folds. Two assignments
//     a frame.
//   - the heave is deeper front-to-back (0.075 -> 0.092) because the gut it is
//     inflating is bigger now and the same fraction read as less.
//   - both legs raked 2.6 degrees forward of the pelvis: weight on the heels,
//     belly out over them. A constant on both legs, so the gait is untouched.
// Ledger: still 13 meshes, 3 materials, one 512 px atlas. 7,032 -> 7,816 tris.
// shots/agents_r7.png carries the portrait AND a true 214x120 render, because
// round 1 proved both scales and so does this.
//
// ===========================================================================
// ROUND 6 — ONE WAY OUT, AND A REASON NOT TO STAND ON IT
// ===========================================================================
// The client asked for one exit: "I think you should kind of have a clue where
// they're going. The cop should kind of have a chance to get there."
//
// Round 4 had already proved that one exit is a design disaster, and killed it
// by HIDING THE DESTINATION behind a second door. That fix worked and it was
// the cheap one: it also hid the destination from the PLAYER, so the reason to
// leave the desk stopped being "I know where he is going" and became "I cannot
// know, so I had better follow him". The client's instinct is better. Measured
// on this build before any of this round's changes, n=120:
//
//                        cut off0   cut off1   camp off0   chase off0
//   two doors (round 5)     76.7      34.7        23.3        38.3
//   one door                76.7      73.3        71.7        24.2
//
// One door hands a door-camping bot 48 points and flattens the misaim table
// from 40 points to 3.4 — at n=100 it is flatter still, 82.0 / 82.0, i.e. being
// sent to the wrong aisle costs EXACTLY NOTHING. Both of those are the same
// fact: with one way out, WHERE he is going is public, so the only things the
// aisle number can still be worth are WHO he is and WHEN he moves.
//
// ---- WHAT PAYS FOR THE ONE EXIT. Four mechanics, none of them geometry -----
//  1. HE DOES NOT COMMIT WITH A UNIFORM ON THE DOOR. A subject who has not yet
//     concealed anything, and who can see the guard posted on the only way out,
//     balks: he puts it back and shops honestly for chillLo..chillHi seconds.
//     Second balk and he leaves the store a customer. Camping therefore
//     produces a shift with NO CRIME IN IT — punished by income, not by catch
//     rate. See benchShift()/benchIncome(): a camper's CATCH RATE is a
//     percentage of a numerator he has driven to zero.
//  2. AND HE DOES NOT WALK INTO ONE EITHER. A subject who already has it turns
//     back into the aisles, waits you out, and after dumpT ditches the goods on
//     a shelf and leaves clean: no arrest, no loss, no points. This is the half
//     that beats an incident already in flight, and it is why `ditched` is a
//     fourth outcome in bench() rather than being pooled into "escaped".
//  3. HE ONLY RUNS FROM A MAN COMING AT HIM. Round 3 made any uniform on his
//     line inside 17 m a bolt. With one exit every route out passes the front
//     end, so a cop merely WALKING TOWARDS THE DOORS was on every thief's line
//     and the thief set off sprinting into the arms of the man about to stand
//     on the only door. Nobody does that; you keep strolling and you hope. The
//     sighting still fires at 17 m if he is being closed on — the aisle-mouth
//     case, unchanged, which is the one worth 1.13 s -> 3.03 s — and otherwise
//     not until boltNear (9 m). This one is worth 22 points of door-camper.
//  4. INNOCENTS CHECK OUT AND LEAVE, through the same door. Before this the
//     only body that ever walked at the exit was the thief, so "subject moving
//     toward the doors" was a confession. Now the door is a crowd. The cost is
//     real and it is paid by the player too: the competent bot loses ~5 points
//     to bodies in the way.
//
// ---- THE TABLE, n=100, maxT 45, this build. -------------------------------
// Round 5's rules are reproduced on the same instrument with useDoors(2) plus
// deterR=-1 and boltNear=99, so the only thing that differs is the bundle above
// (the store population is the same in both columns, which is why the round-5
// column reads 69 where round 5's own report said 74.7).
//
//                       ROUND 5 RULES   ONE DOOR,      ROUND 6
//                       (2 doors)       ROUND 5 RULES  SHIPPED
//   cut  off0              69.0            82.0           77.0
//   cut  off1              36.0            82.0           69.0
//   cut  off2              25.0             --            71.0
//   cut  off4              24.0             --            60.0
//   camp off0              25.0            91.0           27.0
//   camp off1               --             81.0           22.0
//   chase off0             33.0             --            27.0
//   always-sprint off0     47.0             --            53.0
//
// The wind ladder survives intact, which was the no-regression bar: rationing
// 77.0 against always-sprint 53.0, +24.0 (round 5 reported +28.7 on its own
// instrument, 74.7 vs 46.0). lungCheck() still passes and nothing in the lung
// was touched this round.
//
// THE MIDDLE COLUMN IS THE PROBLEM STATEMENT AND IT IS WORSE THAN ROUND 4
// FEARED. One door under round 5's rules: a bot that ignores the dispatch,
// walks to the only exit and stands on it scores 91.0%, beating the bot that
// reads the aisle number and goes and chases the man (82.0%) by nine points —
// and the aisle number is worth LITERALLY ZERO to the chaser (82.0 at off0,
// 82.0 at off1). The whole desk phase is decoration in that column.
//
// The right-hand column is the same store with the four mechanics above. The
// camper goes 91.0 -> 27.0 and SEVENTY of his hundred trials end with the item
// back on a shelf; the chaser keeps 77.0, which is round 5's own headline
// (74.7 as reported, 69.0 on today's instrument with today's store population);
// and the misaim table has a 17-point slope in it again where it had none.
//
// ---- AND THE NUMBER A CATCH RATE CANNOT SHOW ------------------------------
// A camper's 27% is a percentage of the thefts that still happen while he is
// stood there, and the point of deterrence is that almost none do. benchShift()
// runs a whole four-minute shift on game.js's own PACE cadence and counts what
// the scoreboard counts (a catch is 100 points; an escape and a ditched item
// are both zero):
//
//   benchIncome(6, { minutes: 4 }), one exit, ramped difficulty:
//     desk    250.0 pts   4.50 thefts   2.50 caught  2.00 lost  0.00 balked
//     naive   183.3 pts   4.67 thefts   1.83 caught  2.83 lost  0.00 balked
//     camper    0.0 pts   4.17 thefts   0.00 caught  0.00 lost  4.83 balked
//                                                      ...91% of the shift
//                                                      stood on the door
//
// A CAMPER EARNS NOTHING. Not "less" — zero, across every shift in the sample.
// Four thefts still start while he is walking to his post, and every one of
// them ends with the item back on a shelf: nothing is stolen, nobody is
// arrested, and the shift produces no incidents to write up. Meanwhile five
// more subjects balk before they ever conceal. His CATCH RATE in the table
// above is 27%, and that number describes nothing, which is exactly the trap
// the brief warned about: a rate whose denominator you have driven to zero.
//
// That is the answer to "does camping pay" in the only currency the player has.
//
// ---- A FLAG FOR game.js, FOUND BY THIS INSTRUMENT AND NOT MINE TO FIX ------
// The same run says the DESK player takes 7.0 harassment complaints in a
// four-minute shift and the naive one 9.8. THREE IS A DEMOTION. My first
// thought was that this round caused it — innocents walk at the exit now, so
// there are more bodies on the cop's route — so I measured it instead of
// assuming, with shopLo/shopHi pushed past the end of the shift so nobody ever
// leaves:
//     nobody leaves     11.25 complaints   450 pts   7.75 thefts
//     shipped            8.25 complaints   275 pts   4.75 thefts
// It is NOT the leavers: the absolute number falls with them in. Per incident
// it is 1.45 -> 1.74, which is a real but small effect of a busier front end.
// The bulk of it is that `copClosingOn` fires on approach rather than contact,
// and a bot (or a player) sprinting through a crowded aisle is pointed at
// somebody almost continuously. It is game.js's rule and game.js's number —
// agents.js only reports when it fires — but at 7-10 per shift against a
// three-strike demotion, a player who reads every tell correctly still gets
// walked down to traffic duty. Worth harassAim/harassSpeed, or making a
// complaint need CONTACT.
//
// ---- THE DIFFICULTY RAMP, AND THE LEVER THAT POINTED BACKWARDS ------------
// setDifficulty(0..1); 1 IS ROUND 5'S GAME EXACTLY, so the top of the ramp is
// the identity and this cannot silently re-tune anything. Entry point for
// game.js, once a frame, idempotent:
//     a.setDifficulty(a.difficultyForClock(st.clock));
// The breakpoints (0 / 150 / 330 s) are game.js's own PACE breakpoints, so the
// shift reads as one curve. DENSITY IS NOT ON THIS DIAL — game.js owns how many
// cases are open, this owns how hard one of them is.
//
//   competent bot, one exit, n=100          d0      d0.5     d1
//     catch rate                           87.0     78.0     77.0
//     median chase                         6.23 s   6.15 s   6.22 s
//     catches inside 1 s                    9.2%    10.3%    11.7%
//   naive pursuit, n=80                     40.0      --      27.5
// Monotone, and the chase stays a chase at every level rather than turning into
// a collection at the easy end — which is the failure mode an "easier" setting
// normally has, and the one round 3 shipped by accident.
//
// THE FINDING WORTH MORE THAN THE RAMP: "make the thief slower early" is the
// obvious lever and it makes the game HARDER, by 27 points. It is written up
// against `rampRun` in the K block. Every other difficulty lever in this file
// is a gift; that one is a trap, and it is a trap for a reason that generalises
// — anything which leaves the subject deeper in the store when the dispatch
// lands converts the cop from in-front to behind, and behind is a verdict.
//
// ---- THE HONEST WEAKNESS, STATED PLAINLY ----------------------------------
// 17 points is not the 45-point slope two doors bought. It cannot be. With one
// exit the whole building funnels past one place, so a cop sent to the wrong
// aisle still gets a look at his man on the way — `madePct` is 93% at off0 and
// 95% at off1, where under two doors it fell 88% -> 54%. Knowing WHICH AISLE is
// worth less when you no longer need to know WHERE HE IS GOING; that is the
// price of the client's ask and it should be paid consciously rather than
// hidden. What the aisle number buys instead, and it is the bigger number, is
// the 50 points between chasing (77) and camping (27).
// THE LEVER FOR WHOEVER TAKES THIS NEXT, measured-adjacent but not measured:
// the drift out is still a beeline down the exit field, so his position is a
// pure function of the door. Give him a STAGING LEG — a real shoplifter leaves
// through the aisles, not across an open front end — and the dead-reckoning a
// wrong-aisle cop is doing becomes wrong for a reason that is not the door.
// That is a route change, it re-opens the median-chase numbers, and it is a
// round, not an afternoon.
//
// ---- THE DECOYS — src/agents/decoy.js -------------------------------------
// The CCTV builder made the monitors legible this round and then flagged,, and
// against its own interest, that legibility had become PROOF: "the footage is
// not ambiguous, because agents.js has no innocent behaviour that produces a
// reach-with-an-object". A picture you cannot be wrong about kills the best
// idea in this game and makes the harassment complaint unfireable by a
// reasonable player.
//
// So there is one keyframe table, and the steal is IN IT. Eleven clips — three
// steals, one put-back and seven innocent behaviours — all sampled by one
// applyGesture() and drawn by one branch of animateShopper(). There is no code
// path a thief takes that an innocent does not, which is the only version of
// this claim that cannot rot: the next person to tune the thief's arm tunes
// seven innocents' arms with it. The clip's `tell` never reaches a material, a
// scale or a duration; the durations overlap deliberately (steals 1.75-2.60 s,
// decoys 1.60-2.70 s, and the shortest AND longest clips in the file are both
// decoys) so a player with a stopwatch cannot beat it.
// Evidence: shots/agents_r6.png is six unlabelled strips of five frames; two of
// them are steals. shots/agents_r6_key.png is the same sheet with the answers.
//
// The decoy scheduler does not look at `s.guilty` — every browsing body in the
// store rolls one every 9-22 s, so at fourteen shoppers there is a reach-with-
// an-object somewhere in the building roughly every 1.1 s. A guilty subject
// does them too, before and after his steal, so "the man doing something with
// his hands" is never the answer.
//
// AND ONE BUG FOUND BY LOOKING AT IT BIG. Round 5 authored the concealment's
// item as absolute rig-local coordinates while the ARM was driven separately;
// the two disagreed by 0.50 m, so the box hung in the air beside his left ear
// while his right arm reached. Invisible at 431 px down a 26 m aisle, obvious
// the moment the spot monitor pushes in. The prop is solved from the arm now —
// Euler XYZ on the shoulder pivot, shoulder read off the rig so girth and
// height come out right per body — and clips carry only a small `off` for the
// beats where it is pressed against the coat.
//
// ===========================================================================
// ROUND 5 — DOES MANAGING YOUR WIND PAY? IT DOES NOW. THAT IS THE HEADLINE.
// ===========================================================================
// Round 4 reported, honestly, that stamina management paid NOTHING: holding
// sprint from the dispatch to the grab beat rationing it 81.3% to 74.0%. Same
// instrument, same store, today, with round 4's lung bolted back on:
//
//   ROUND 4's LUNG          always-sprint 81.7%   ration 82.5%    +0.8
//   ROUND 5's, SHIPPED      always-sprint 51.7%   ration 76.7%   +25.0
//                                      (n=120, `cut` routing, right aisle)
// (Round 4 measured -7.3 on the old store and +0.8 here; the store's new mid
// cross-aisle nudged the sign but 0.8 points at n=120 is noise. The point
// stands either way: under round 4's lung, what you did with the key did not
// matter. Under this one it is worth a quarter of the game.)
//
// Five named wind policies, all on the same routing, n=150 unless marked:
//   always   hold the key the whole way ...................... 46.0% (n=250)
//   loose    round 4's own default, sprint on a loose intercept 47.6% (n=250)
//   pulse    intervals, run it into the ground every time ..... 63.3%
//   keep     intervals with a reserve, never go WINDED ........ 70.0%
//   ration   spend only when the intercept is tight .. SHIPPED  74.7%
// Monotone, five rungs, 28.7 points end to end. There was no such ladder in
// this game before this round; there was one policy and four ways to spell it.
//
// ---- IT TOOK THREE CHANGES AND ONLY THE THIRD ONE IS OBVIOUS IN HINDSIGHT --
// Each added on top of the last. n=120, competent routing, right aisle.
//                                          always-sprint   ration    delta
//   round 4 as shipped (3.10 s, ungated)       81.7%       82.5%     +0.8
//   + recovery gated on releasing the key      75.8%       81.7%     +5.9
//   + no sprint while gassed                   45.8%       78.3%    +32.5
//   + 1.40 s tank, 0.81 s refill  (SHIPPED)    51.7%       76.7%    +25.0
//
// The gate is the fix everybody names and it is worth 5.9 points. THE ONE THAT
// MATTERED WAS THE SECOND LINE, and it is a bug I shipped for four rounds:
// gassed speed read `(wantSprint ? copRun : copWalk) * gassedPenalty`, so a cop
// who had blown his lungs out and was still holding the key did 5.05 x 0.62 =
// 3.13 m/s — while a cop with a FULL TANK who chose to walk did 2.35. Gassing
// out was an UPGRADE over pacing yourself. No recovery gate can ever beat a
// penalty state that outruns the healthy state, which is why round 4 gated the
// regen, measured +2.7, and correctly refused to ship it. `gassedPenalty` is
// untouched at 0.62; what changed is that the key stops helping.
//
// The short tank is the third line and it is worth NEGATIVE 1.6 points to the
// good player. It is in anyway, and not as a compromise: at a 3.10 s tank with
// the first two fixes the naive player gets ONE spend and then crawls for the
// rest of the chase (45.8%), which is a punishment, not a decision. At 1.40 s
// he gets a spend every 2.21 s (1.40 s of sprint, 0.81 s to refill) against a
// 5.8 s median chase — 2.6 complete spend-and-refill cycles, so a mistake is
// survivable and the rhythm is countable. It buys the naive player 5.9 points
// back and costs the careful one 1.6. That is the trade the game builder asked
// for, and it is bought with the tank rather than by softening `gassedPenalty`.
//
// ---- WHAT I ALSO LEARNED, BY MEASURING IT INSTEAD OF ASSUMING --------------
//   copWalk 2.35 -> 2.90 looked like a free buff to the rationing player, since
//     a cop holding sprint is gassed and never touches copWalk. It is not:
//     gassed speed is DERIVED from copWalk, so it lifts the always-sprint floor
//     by more. Spread 25.0 -> 14.2. Built, measured, thrown away — see K.copWalk.
//   `bargeDump` (0.85) has NEVER been a live constant. 0.40 vs 0.85 is
//     byte-identical on every field of the bench, because `s.adren` is ~1.0 at
//     the moment of any barge and Math.max never fires.
//   `bargeWind` — round 4's 22-point mechanic — is nearly inert at a fast-
//     refilling tank: a one-off stamina cost evaporates in 0.8 s. What still
//     bites is `bargeStagger`, and 1.25 s of it was priced against a man who
//     could then sprint for 3.1 s. It is 0.55 now. See K.bargeStagger.
//
// ---- THE ROUND-4 DISTRIBUTION, RE-MEASURED (n=150, postSpawn('aisle'), -----
// ---- crowded, no powerup, competent bot, right aisle) ---------------------
//                                    round 4        round 5
//   median chase (bolt -> grab)      3.03 s         5.83 s
//   catchUnder1s                     15.7%          14.3%
//   comes at the cop                 97/200 89%     88/150 70%  med 6.07 s
//   goes the other way               70/200 61%     39/150 87%  med 6.42 s
//   competent / naive / camper       79.5/68.5/22.5 74.7/43.3/21.3
//   by how far the dispatch landed   83/89/80/75/69 77/86/69/68/74
//   barge: committed / got through   124 / 37       79 / 17
//   ...and of those, still caught    59%            18%
//   door: reached / caught there     -- / --        38 / 7
//   exits used                       --             DOOR 1:19  DOOR 2:19
// The ladder holds and the gap widens where it should: chasing beats camping by
// 53.4 points (round 4: 57.0), and the naive pursuit bot loses 25 points
// because holding the key is no longer free. Wind skill is worth 28.7 points to
// the competent router and 6.7 to the naive one (43.3% -> 50.0% with the same
// interval policy) — you cannot ration against a plan you do not have.
//
// ---- THE STORE GREW A MID CROSS-AISLE AND IT CHANGED MORE THAN I DID -------
// The store builder cut a cross-aisle through the middle of the shelf runs
// (nav picks it up for free — the grid is built from the collider set). Round
// 4's back-route metric tested `z > HALF_LEN - 2.2` and now reads ZERO, which
// is not the counterplay dying, it is the instrument pointing at the wrong
// corridor. `crossBands()` finds the store's corridors from the grid instead:
//   out the back (rear wall) ....  0 of 150   (round 4: 61% of chases)
//   via the MID cross-aisle .....  53, 92% caught
//   via the front cross-aisle ...  39, 59% caught
//   straight down and out .......  35
// The long grind round the back is gone; the same idea now costs 12 m instead
// of 55 and gets used three times as often. It also doubled the median chase.
// AND IT IS WHAT MADE THIS ROUND POSSIBLE: round 4 diagnosed the tank as
// unfixable because "the median chase is 3.0 s and the tank is 3.1 s". The
// cross-aisle took the median to 6.1 s under round 4's own numbers, which is
// what leaves room for two or three spends. Credit where it is due.
//
// The misaim table got much steeper this round and IT IS NOT MINE:
//                              off0    off1    off2    off4
//   round 4, old store         79.5    60.0    58.0    60.0
//   round 4's lung, THIS store 82.7    38.7    25.3    24.0
//   round 5, shipped           74.7    34.7    28.0    21.3
// Being sent one aisle wrong went from a 19-point mistake to a 44-point one the
// moment the store grew a way across the middle, because the cut-through the
// cop cannot cover is the same cut-through he cannot GET to. Round 4's flat
// table (60/58/60 — being four aisles wrong cost the same as one) was the
// weakness; this is a gradient. My change moves it by about three points.
//
// ---- THE ENERGY DRINK HAS A CLIFF IN IT, AND IT IS NOT WHERE I EXPECTED ----
// The game builder warned that boostTime 4.0 s against a 1.4 s tank is three
// tanks of free sprint and should be shortened. It should — but only to 3.0,
// and the sweep is the reason. n=120, drink already in hand, against a 76.7%
// no-powerup baseline:
//   2.20 s -> 64.2%   boostFrac 0.53      A DRINK MAKES YOU WORSE
//   3.00 s -> 90.0%   boostFrac 0.76   <- shipped
//   3.50 s -> 94.2%   boostFrac 0.86
//   4.00 s -> 94.2%   boostFrac 0.91      (round 4 measured 93.0%)
// At the shipped 3.00 s, re-run at n=150 against a 74.7% baseline: drink in
// hand 87.3% (boostFrac 0.75), one reachable on a shelf 75.3% (boostFrac 0.39).
// There is no middle. A drink that runs out mid-approach carries a 7.17 m/s cop
// into a 3.16 m lane he cannot cover both shoulders of; the thief jukes, and
// commitments-that-get-through go 17% -> 25%. Fast is not agile.
// So: are powerups the dominant tactic now? A drink IN HAND is, at +13 points.
// GOING TO GET ONE is not — `mode:'pickup'`, where the cop has to leave his
// line and reach into the shelf face, is 75.3% against 74.7% for no powerup at
// all. The detour costs almost exactly what the drink buys. That is the right
// place for a powerup and it is held there by the shelf-lip reach gate, not by
// the timer.
//
// ---- SECONDARY, same build ------------------------------------------------
//   dispatched to the front end .. 32.0%   (round 4: 68.0%)
//   legacy 'behind' spawn ........  4.7%   (round 4: 90.5%; round-4 lung on
//     THIS store: 84.0%, so this one IS mine). See the note below: it is the
//     one thing this round made worse and I did not fix it.
//   cans on the shelves, bot ignores them: boostFrac 0.01 — the shelf-lip
//     reach gate still holds (round 4: 0.02, round 3: 0.001).
//
// ---- THE ONE THING THIS ROUND MADE WORSE, AND WHY I LEFT IT ----------------
// BEING BEHIND HIM IS NOW A VERDICT, NOT A POSITION. The arithmetic: a cop
// under the best wind policy sustains ~4.0 m/s against a 3.08 m/s cruise, so he
// reclaims ~0.9 m/s where round 4 reclaimed 2.0. Three metres took 1.5 s and
// now takes 3.3, which is longer than the run to the door. Two numbers show it:
//   legacy 'behind' spawn        90.5% -> 4.7%
//   barged AND got through       59%   -> 18% still caught
// The game never spawns 'behind', so the live cost is the second line. Two ways
// to read that one. It is worse: getting past the cop is now close to a win,
// which is round 3's "97% still caught" pathology with the sign flipped. It is
// better: only 17 of 79 commitments get through at all, and the 62 the cop
// covers are caught 82% of the time, so the shoulder is a 64-point swing on one
// read where round 4's was 39. I think the duel improved and the RECOVERY died,
// and those are different complaints.
//
// Not fixed, deliberately, and here is the map for whoever takes it:
//   - `bargeStagger` is already down 1.25 -> 0.55 and a further cut to 0.35
//     measured 76.4% overall / 32% barge-caught, i.e. inside noise of 0.55.
//     The stagger is not what is left.
//   - `thiefTired` (his cruise, 0.575) is the obvious lever AND IT IS POISONED:
//     0.52 measures 42.5%, a 34-point collapse, because the competent bot reads
//     THE SAME CONSTANT to predict him and to dead-reckon a lost sighting. Any
//     change there has to move the bot's model with it or it measures the bot,
//     not the game. Do not sweep it naively; I did.
//   - The lever I would actually try is giving the THIEF the same rhythm the
//     cop just got — a cruise that decays under sustained pressure instead of a
//     flat floor — so that the cop who paced himself still has legs at second
//     eight and the one who did not does not. That is thematically exact (you
//     are both fat) and it rewards the skill this round created rather than
//     handing speed back. It is a new mechanic, not a constant, and it re-opens
//     every number above, so it is a round, not an afternoon.
// ===========================================================================
//
// ---- WHERE ROUND 4 STARTED (kept: it is what the numbers above beat) -------
//   median chase (bolt -> grab)    1.13 s      61.3% of catches under 1 s
//   comes at the cop  449/600      97.1% caught in 0.85 s
//   goes out the back 151/600       0.0% caught — 0 in 270 unboosted
//   door-camping bot beats a pursuing one 80.7% / 67.3% vs 60.0% / 47.3%
// Four foregone conclusions wearing a chase. What fixed them, each measured on
// its own, still stands and is still in force: TWO WAYS OUT (one door made the
// thief's destination public knowledge and public knowledge beats a scouting
// report); A DOOR PREFERENCE per subject, so position no longer implies
// destination; HE SEES YOU ARRIVE (thiefLook 8.6 -> 17 m, which is most of the
// 1.13 s -> 3.03 s); and A BARGE WITH PHYSICS IN IT. See barge() and EXIT_SPEC.
// A THIRD door was built, measured and thrown away — 13 points of difficulty
// for no design gain. The numbers are at EXIT_SPEC so nobody rebuilds it.
//
// ---- THE SKILL LADDER. There is no such thing as "the" catch rate ----------
// Three bots, all blind (they know the aisle number and what they can see), and
// now also a wind policy each, because those are two different skills:
//                       right aisle   off by 1   off by 2   off by 4
//   cut   (competent)      74.7%        34.7%      28.0%      21.3%
//   chase (naive pursuit)  43.3%          -          -          -
//   camp  (ignores it)     21.3%          -          -          -
// Round 3 shipped one weak bot and published its misaim table as if it
// described the game; an outside critic put its own bot in the same geometry
// and beat mine by fifteen points. Quote all three, and quote the wind ladder
// with them — the dispatch is worth 40 points to a player who paces himself
// and 22 to one who holds the key down, and both are true.
// Re-run: window.__CHOP.agents.benchReal(200) / .benchCamp(200)
//
// ===========================================================================
// ROUND 9 — THE SHOPPERS. POSE VOCABULARY, CHILDREN, AND THE BIRD.
// ===========================================================================
// The cop passed and then wrote this round's brief himself:
//
//   "They now have varied builds, ages, heights, hairstyles, sleeve lengths,
//    shoes and hands — but they still share ONE POSE VOCABULARY. Fourteen
//    people idle identically, hold a cart identically, and reach for a shelf
//    identically, and that reads as clones far more than the geometry does."
//
// He was right, and the before-shot settled it: nine bodies in one aisle, every
// single one in `walk+cart`, every one with both arms out at exactly -0.95 rad.
// What shipped this round:
//   - a per-person GAIT (stride, amplitude, bounce, hip roll, arm swing, arm
//     lag, splay, toe-out), so nobody walks at anybody else's cadence
//   - SEVEN IDLES, two or three per person, cycled off a clock
//   - FIVE cart holds and THREE browse poses
//   - CHILDREN, which the crowd had none of
//   - the PA ESCALATION LADDER ending in a man calmly giving the camera the
//     finger — see LADDER and decoy.js
// All of it is in figures.js's rollPose() and this file's idlePose(),
// animateChild() and animateShopper(). Where each thing lives and why is
// written at the thing.
//
// ---- THE NO-REGRESSION ABLATION, AND THE MEASUREMENT BUG IT UNCOVERED ------
// Every one of those is a POSE, and a pose must not move a chase. Proved by
// running the identical suite on the round-8 build and on this one:
//
//                     ROUND 8                     ROUND 9
//   cut off0          75% med6.22 u1 11 (14.7%)   75% med6.22 u1 11 (14.7%)
//                     esc25 atCop n47 66% sq52    esc25 atCop n47 66% sq52
//   camp              31% ditched 67              31% ditched 67
//   always-sprint     50%  (so rationing is +25)  50%
//   cut off2          74% med5.38                 74% med5.38
//   lungCheck()       2.043 gassed vs 2.35 walk   identical, passes
//
// BYTE-IDENTICAL ON EVERY FIELD OF ALL FOUR ROWS. Not "within noise": the same
// characters. That is not luck, it is the one design decision this round turned
// on — every per-person number is rolled in figures.js's rollPerson(), which is
// reachable only from makeShopper(), which is reachable only from the
// `while (shoppers.length < K.shopperCount)` line in reset(), which is a no-op
// after the fourteenth body exists. Rolls added there cost draws exactly once,
// at module construction, before bench() ever calls setSeed(). CLAUDE.md's
// standing warning is that even swapping a rolled call for a named one walked
// the stream and moved a published number by five points; the way not to do
// that is not to be careful, it is to roll somewhere the stream cannot reach.
//
// AND THE MEASUREMENT BUG, because it cost an hour and it will cost the next
// person the same hour: THE FIRST FOUR ATTEMPTS AT THAT TABLE DISAGREED WITH
// THEMSELVES. Same build, same seed, 85% / 87% / 75% on three page loads.
// bench() inherits DIFF.level from whatever last set it, and game.js sets it
// every frame from the shift clock — so a bench run started after the RAF loop
// has ticked once is measured at difficultyForClock(0) = 0, and one started
// before it is measured at the default 1. The tell, once I looked at the state
// instead of the summary, was that every shopper's `nerve` was 1.55x — exactly
// K.rampNerve — between two runs that should have been identical.
//
//   PASS `difficulty` TO EVERY BENCH CALL. An unpinned run is a measurement of
//   an unknown difficulty, and it will look like your change.
//
// This is not a new bug and it is not in this round's code; it has been able to
// corrupt any measurement in this file taken from a live page since round 6.
//
// ---- AND THE OTHER MEASUREMENT: IS THE FINGER A GUILT TELL? ---------------
// benchBirdLine(120, { difficulty: 1 }), five announcements at one body:
//
//                bird | armed        bird      shrug      heed      bolt
//   cold             ~100% (n 70)     45.0%     78.3%      1.7%     14.2%
//   hot              ~100% (n 49)     25.8%     69.2%      1.7%     26.7%
//   clean            ~100% (n116)     94.2%     99.2%      0.8%      0.0%
//
// `bird | armed` is the number the ladder controls and it is 1.00 across all
// three populations: once armBird() has armed a body, whether he gives you the
// finger does not depend on his guilt, because the function that decides has
// never seen it. The unconditional column is dominated by a guilty man having
// already run — 14.2% and 26.7% against an innocent's 0.0% — and that is round
// 3's design, not this round's: RUNNING IS THE CONFESSION and no pose can be
// conditioned to hide it.
//
// The first build of the ladder put the bird in the rung-4 shrug pool and
// measured LR 0.26. It was not the ladder leaking, it was that a react clip is
// only ever reached THROUGH the shrug, so it inherited the shrug's ratio to two
// decimals (0.26 against 0.26). Decoupling it — the bird is now its own beat
// that a heeding subject gets too — is what moved it. See armBird.
// ===========================================================================
import {
  TUNING, EXIT, EXIT2, aisleX, AISLE_LEN, AISLE_COUNT, AISLE_GAP, SHELF_W,
  STORE, FRONT_WALK_Z, SERVICE_DESK,
} from './config.js';
import { makeNav } from './agents/nav.js';
import { makeFrontEnd } from './agents/frontend.js';
// ROUND 6 — the figures moved out. agents.js owns how people MOVE; figures.js
// owns what they look like while they do it. It also carries the write-up of
// the bug that was this round's whole brief (every person in the game was
// headless: the head sphere was 96% inside the torso capsule). Read it there.
// ROUND 1 (cop) — COP_KNEE_Y is where figures.js put his knee ball. It is
// imported so copCheck() can ASSERT that gait.js's cut still lands on it, which
// is two derivations of one number and therefore CLAUDE.md's rule rather than a
// comment. (Names only inside the braces below: tools/check.py resolves imports
// by parsing them, and a comment in there fails the whole tree.)
import {
  mergeParts, buildFigureGeo, rollPerson, makePerson, makeCop, FIG, KID,
  SKIN, HAIR, CLOTH, PANTS, COP_KNEE_Y,
} from './agents/figures.js';
// ROUND 6 — the decoy library. Every reach-with-an-object in the store, guilty
// and innocent, keyframed in ONE table and sampled by ONE function, so the
// steal has no code path of its own that a tuning pass could accidentally make
// louder than the six innocent behaviours it has to hide inside. Read the
// header there: it is the answer to the CCTV builder's own finding that a
// legible picture had become a PROOF.
import {
  GESTURES, BY_ID, pickGesture, applyGesture, REACH_KEEP, REACH_PUT,
} from './agents/decoy.js';
// ROUND 12 — THE WALK, AS A CONSTRAINT. The old gait was two sines whose foot
// was planted at exactly one speed (0.81 m/s) and skated at every other one;
// the arithmetic is in gait.js's header and gaitCheck() re-derives it rather
// than quoting it. Everything about a step — the leg angles, the vertical bob,
// the knee substitute, the ankle roll, the pelvic list and the sway — now falls
// out of one number, the step length, instead of being six dials.
import {
  solveGait, stepLength, dutyOf, attachFeet, footPose, footRest, gaitCheck,
} from './agents/gait.js';
// ROUND 9 — WHERE THE CAMERAS ACTUALLY HANG, so a man can flip off the one that
// is watching him rather than a yaw somebody guessed.
//
// This is a READ of a pure function cctv.js exports, not a reach into cctv's
// state: cameraRig() takes config's CAMERAS table and returns the mounted
// positions, and store.js already imports the same function for the same reason
// — it hangs the plastic domes off it, and the comment there says why ("Reading
// the fallback left the plastic hanging in a row the lenses had moved out of").
// config's CAMERAS[].pos is explicitly labelled FALLBACK ONLY. Aiming at the
// fallback would point every subject at a row of cameras that is not there.
import { cameraRig } from './cctv.js';

// ---------------------------------------------------------------------------
// Tunables. Anything already in TUNING is read from TUNING, no local copy.
// The `?? fallback` ones are values I want promoted into TUNING by the lead;
// if they appear there, they are picked up automatically with no code change.
// ---------------------------------------------------------------------------
const T = TUNING;

// ===========================================================================
// THE ROUND-5 TUNING SET — APPLIED. Kept as a record of what moved together,
// because the one thing that must not happen to it is being unpicked one line
// at a time. Every number here was measured against every other one, and a
// SUBSET IS WORSE THAN NONE: the regen gate alone costs the cop 5.9 points and
// buys 5.9 back; no-sprint-while-gassed alone makes the naive player 30 points
// worse with nothing to teach him; the short tank alone does nothing at all,
// because holding the key still dominates. Ablation in the file header.
//
//   CHANGED    staminaMax     3.10 -> 1.40   one burst, not a whole chase
//              staminaRegen   0.34 -> 1.72   0.81 s empty to full, key up
//              gassedRecover  0.26 -> 1.00   WINDED is all or nothing
//              boostTime      4.00 -> 3.00   swept; 2.20 makes a drink a trap
//              bargeStagger   1.25 -> 0.55   re-priced against a 1.4 s tank
//   ADDED      regenHold       0.00          regen with the key still down
//              gassedSprintMul 0.35          MUST stay under 0.53
//              bargeWindFrac   0.48          replaces the absolute bargeWind
//   DELETED    bargeWind                     superseded by bargeWindFrac
//   UNCHANGED, having been swept and left alone on purpose:
//              staminaDrain 1.00 · gassedPenalty 0.62 · copWalk 2.35 ·
//              thiefTired 0.575 · bargeDump 0.85 (measured inert)
//
// Verified live after the lead applied it, by running the cop into the ground
// and holding the key: STEADY-STATE 2.043 m/s against a 2.35 m/s fresh walk,
// which is exactly what lungCheck() computes from the constants. It was 3.13
// for four rounds. (The lead reported 1.77 from the live build; that does not
// reproduce here and 2.043 is both the model value and the observed one — 1.77
// is what the meter reads when he is scraping a gondola. The inequality holds
// on either number, but the one in this file is the one that is checkable.)
// That inequality IS the round, so it is asserted at startup rather than
// described — see lungCheck(). A comment is what this file had last time.
// ===========================================================================

// ROUND 4's RE-TUNES ARE IN TUNING NOW and this block is gone, as its own note
// asked. thiefLook 17.0, thiefTired 0.575, thiefAccel 10.5, stumbleT 0.28 and
// bargeStagger were all local overrides shadowing config; the lead promoted the
// first four and they read `T.x ?? fallback` again below. bargeStagger did NOT
// survive promotion unchanged — it is re-priced to 0.55, because 1.25 s of the
// cop lying in an aisle was set against a man who could then sprint for 3.1 s.
// ---------------------------------------------------------------------------
// ROUND 5 — THE LUNG. The one thing round 4 failed at, taken.
//
// The failure was not "stamina is undertuned", it was that HOLDING SPRINT WAS
// STRICTLY DOMINANT, for three separate reasons stacked on top of each other,
// and only fixing all three at once flips it. Each one on its own measures as
// noise or as a nerf, which is why round 4 gated the regen, saw -22 points, and
// correctly refused to ship a third of a fix.
//
//   1. RECOVERY DID NOT CARE ABOUT THE KEY. `canSprint` goes false the instant
//      you gas, so the man still holding it fell into the same regen branch as
//      the man who let go. Letting go bought literally nothing.
//   2. GASSED-AND-HOLDING WAS FASTER THAN FRESH-AND-WALKING. Gassed speed read
//      `(wantSprint ? copRun : copWalk) * gassedPenalty`, so 5.05 x 0.62 = 3.13
//      m/s while a cop with a FULL TANK who chose to walk did 2.35. Blowing
//      your lungs out was an upgrade over pacing yourself. This is the one I
//      missed for four rounds and it is the whole ballgame: no gate can beat a
//      penalty state that is faster than the healthy state. A winded man does
//      not get to sprint. Holding the key while gassed now does nothing at all.
//   3. THE TANK OUTLASTED THE CHASE. 3.1 s of sprint, 9.1 s to refill, against
//      a median chase that was 3.0 s at the end of round 4. One spend, no
//      decisions. Now: 1.40 s tank, 0.81 s to refill from empty — a 2.21 s
//      cycle against a 5.8 s median chase, so 2.6 complete spend-and-refill
//      cycles instead of one.
//
// The ablation table for all three is in the file header. The trade is bought
// with the tank, not by softening `gassedPenalty` — which is untouched at 0.62,
// and now bites harder because it is the walk it multiplies.
// ---------------------------------------------------------------------------
// HOW A CONSTANT IS READ IN THIS FILE, AND WHY IT IS WORTH A PARAGRAPH.
//
// Round 5 shipped its lung through a local `R5` object that K read DIRECTLY,
// with no `?? T.x` behind it. That was correct while the numbers were a
// proposal — the whole point was that the file had to run what the report
// described, and `T.x ?? fallback` would have let config quietly win. The
// moment the lead applied the block it became the exact bug this file has now
// caught three times: A VALUE THAT LOOKS LIVE AND IS NOT.
//   - the gassed-sprint inversion: a penalty state faster than the healthy one,
//     shipped for four rounds because nobody read the line next to it;
//   - `bargeDump`: byte-identical at 0.40 and 0.85, because `Math.max` never
//     fired;
//   - `R5`: six constants where an edit to config.js would have done nothing at
//     all, and would not have announced itself, because R5 and TUNING agreed.
// Agreement is what makes it dangerous. A shadow that DISAGREES gets found in
// one bench run; a shadow that agrees waits for the next person to tune it.
//
// So there is exactly one way to read a constant now, and it is TUNING-first:
//
//     get thing() { return t('thing', <fallback>); }
//
// `t` is `OVR[k] ?? T[k] ?? fallback`. TUNING always wins over the fallback, so
// config.js is live for every number in this file. OVR is the sweep lever the
// bench needs — it is EMPTY in normal operation, so it cannot shadow anything
// by accident, and `bench()` stamps any non-empty override onto its own result
// (`res.override`) so a measurement taken under one can never be quoted as if
// it were the shipped build. The fallbacks below are the round-5 values; they
// exist so the file still runs if a key is missing from config, not as a second
// source of truth.
// ---------------------------------------------------------------------------
const OVR = {};                      // debug sweep only — see agents.override
const t = (k, fallback) => OVR[k] ?? T[k] ?? fallback;
const K = {
  get copGrip()       { return t('copGrip', 0.78); }, // lateral accel fraction at top speed

  // ======== ROUND 5, THE LUNG ==============================================
  // Why these five numbers moved together, and what each of them is holding up.
  // The ablation is in the file header; this is the per-constant reasoning.
  //
  // copWalk — BUILT, MEASURED, THROWN AWAY, and left here so nobody spends an
  // afternoon on it. Rationing means spending most of a chase NOT sprinting,
  // and at 2.35 m/s against the thief's 3.08 m/s cruise every second off the
  // key hands back 0.73 m — so raising the walk to 2.90 looked like the obvious
  // way to buy the rationing player back the ground the short tank costs him,
  // and I assumed it was a pure buff to him because a cop holding sprint is
  // gassed and never touches copWalk. WRONG, and wrong in the one direction
  // that matters: gassed speed is DERIVED from copWalk — (copWalk + (copRun -
  // copWalk) x gassedSprintMul) x gassedPenalty — so raising the walk raises
  // the floor the always-sprint player stands on too, and by more, because he
  // is on it the whole chase. n=120, competent bot, right aisle:
  //     copWalk 2.35   ration 76.7%   always 51.7%   spread 25.0
  //     copWalk 2.90   ration 71.7%   always 57.5%   spread 14.2
  // It costs the good player 5 points, hands the naive one 5.8, and takes 43%
  // off the thing the whole round exists to create. It stays at 2.35.
  get copWalk()       { return t('copWalk',      2.35); },
  // 3.10 -> 1.40. One fat burst, not a whole chase.
  get staminaMax()    { return t('staminaMax',   1.40); },
  // Unchanged at 1.00, on purpose: the tank still reads directly in seconds.
  get staminaDrain()  { return t('staminaDrain', 1.00); },
  // 0.34 -> 1.72, i.e. 0.81 s from empty to full WITH THE KEY UP. Tank plus
  // refill is a 2.21 s cycle against a 5.83 s median chase — 2.6 complete
  // spend-and-refill cycles, which is what makes the rhythm countable and a
  // mistake survivable instead of terminal.
  get staminaRegen()  { return t('staminaRegen', 1.72); },
  // 0.26 -> 1.00. WINDED means empty, and you get it ALL back or none. 0.26
  // gave a 0.36 s stutter nobody can see or count; a full-refill lockout is the
  // thing the player is choosing to avoid, and it is what makes letting go
  // EARLY a decision rather than a rounding error — the duty cycle is identical
  // either way, what differs is whether you still HAVE a burst in hand when he
  // goes for your shoulder.
  get gassedRecover() { return t('gassedRecover', 1.00); }, // frac needed to un-gas
  // 4.00 -> 3.00, and NOT the 2.2 the shorter tank suggests. The game builder's
  // third warning was that 4.0 s pinned at max against a 1.4 s natural tank is
  // three tanks of free sprint: shorten it or admit powerups are the game. The
  // sweep says shorten it only so far. n=120, drink in hand, 76.7% baseline:
  //     2.20 s -> 64.2%  boostFrac 0.53   WORSE THAN NO DRINK AT ALL
  //     3.00 s -> 90.0%  boostFrac 0.76   <- shipped
  //     3.50 s -> 94.2%  boostFrac 0.86
  //     4.00 s -> 94.2%  boostFrac 0.91   (round 4 measured 93.0%)
  // There is no middle. A drink that runs out mid-approach is a LIABILITY: it
  // carries a 7.17 m/s cop into a 3.16 m lane he cannot cover both shoulders
  // of, the thief jukes, and commitments-that-get-through go 17% -> 25%. Fast
  // is not agile. 3.00 is the shortest value that is not a trap, and it holds
  // the powerup at about round 4's strength (90 vs 93) while cutting the
  // fraction of the chase it OWNS from 91% to 76%.
  // "Are powerups the dominant tactic now?" A drink IN HAND is, at +13 points
  // (87.3% at n=150). GOING TO GET ONE is not: `mode:'pickup'`, where the cop
  // has to leave his line and reach into the shelf face, measures 75.3% against
  // 74.7% for no powerup at all. The detour costs almost exactly what the drink
  // buys, which is where a powerup should sit — a judgement call, not an
  // auto-take — and the shelf-lip reach gate is what holds it there
  // (boostFrac 0.01 under `ignore`), not the timer.
  get boostTime()     { return t('boostTime',    3.00); },
  // =========================================================================
  // ROUND 9 (SECOND PASS) — boostGrip. THE DRINK BUYS FOOTWORK, NOT JUST LEGS.
  //
  // Round 5 wrote "fast is not agile" as an EXPLANATION for the powerup's
  // cliff and left it as prose. It is arithmetic and it is in steer():
  //     latMax = copAccel * (1 - (1 - copGrip) * (speed / top))
  // and `top` is copRun x boostMul whether you drank anything or not. So
  //     unboosted, 5.05 m/s:  latMax 7.61   turning radius v^2/a = 3.35 m
  //     boosted,   7.17 m/s:  latMax 7.02   turning radius        7.32 m
  // A DRINK MORE THAN DOUBLES YOUR TURNING CIRCLE, in a store whose usable
  // half-lane is 1.58 m. The duel is decided by covering a 1.5 m juke inside
  // 0.85 s of jukeHold; a man with a 7.3 m radius cannot, and the bench says
  // so — shoulder commitments go 52 -> 74 with a drink and barges 6 -> 25.
  // The drink was not failing to help. It was ACTIVELY LOSING the only
  // engagement that decides a one-exit chase, and paying for the privilege
  // with a gas-out on the far side of it.
  //
  // So the boost multiplies copAccel while it is live. Thematically it is the
  // right half of an energy drink for a fat man: not "he is faster", "he can
  // plant a foot and go". Set so a boosted cop's turning circle is a little
  // BETTER than his own sober one rather than merely equal — the brief says
  // that failing to catch him with a powerup is broken, so the drink has to
  // win duels, not draw them:
  //     boostGrip 2.40 -> latMax 16.85 at 7.17 m/s -> radius 3.05 m  (sober 3.35)
  // ABLATED ON THE SHIPPED BUILD, n=200, difficulty 1, `cut` off0, everything
  // else in this round already in, against the same 200 chases with no drink
  // (66.0%):
  //     boostGrip 1.00 (this constant off)   86.0%   drink worth +20.0
  //     boostGrip 2.40 (shipped)             92.5%   drink worth +26.5
  // So it is worth 6.5 points of boosted catch rate, and it is NOT the biggest
  // thing in this round — the bot fix in windPolicy and the legs mechanic in
  // thiefPace are both larger. It is in for a reason the catch rate does not
  // show: without it a drink still DOUBLES the cop's turning circle, so the
  // player's own hands report the powerup as a loss of control at the exact
  // moment it is supposed to feel like the opposite. Sweep of the whole range,
  // n=100 on an earlier page load, drink in hand:
  //     1.0 -> 97%   1.6 -> 97%   2.4 -> 100%   3.2 -> 100%
  // Above ~2.4 it stops buying anything measurable, which is what you expect
  // once the turning circle is no longer the binding constraint; it is set at
  // the knee rather than past it.
  get boostGrip()     { return t('boostGrip',    2.40); },
  // THE GATE. Fraction of the regen you get while the sprint key is STILL DOWN.
  // Zero: a man sprinting is not getting his breath back. On its own this is a
  // 5.9-point nerf and nothing else, which is why round 4 priced it and refused
  // to ship it alone; it only becomes a mechanic next to gassedSprintMul.
  get regenHold()     { return t('regenHold',    0.00); },
  // THE FIX — the constant that actually flips the sign, and the one four
  // rounds of "stamina management pays nothing" was hiding behind. It used to
  // be effectively 1.00: a gassed cop leaning on the key did copRun x
  // gassedPenalty = 3.13 m/s while a cop with a FULL TANK who chose to walk did
  // 2.35, so blowing your lungs out was an UPGRADE over pacing yourself. At
  // 0.35 he does 2.04 — he can still lean into it, he is still slower than his
  // own walk, and letting go is strictly better. Swept, n=120:
  //     0.00   always 43.3%   ration 75.0%   spread 31.7
  //     0.35   always 51.7%   ration 76.7%   spread 25.0
  // Zero costs the naive player 8.4 points and buys the careful one 1.7 — a
  // floor-lowering wearing a difficulty knob, and the floor is not what this is
  // about. MUST stay under (copWalk/gassedPenalty - copWalk) / (copRun -
  // copWalk) = (3.79 - 2.35) / 2.70 = 0.533, or a gassed man leaning on the key
  // outruns a fresh man walking and the whole thing inverts again.
  get gassedSprintMul(){return t('gassedSprintMul', 0.35); },
  // ---- what a shoulder costs, RE-PRICED against a 1.4 s tank ---------------
  // Round 4 tuned the barge so getting through the cop was worth something but
  // not everything: 41% of the men who got past escaped, 59% were still run
  // down. Those numbers were set against a cop who could sprint for 3.1 s and
  // reclaim 2 m/s. Shorten the tank and the same constants make a successful
  // barge a foregone conclusion — n=250, competent bot, 28 got through and 0 of
  // them were caught, whatever the wind policy. That is round 3's "97% still
  // caught" pathology with the sign flipped, and it is a direct consequence of
  // this round's change, so it was this round's problem.
  //
  // bargeWindFrac replaces the ABSOLUTE `bargeWind: 1.50`, which was 48% of the
  // old 3.1 s tank and would be a total wipe every single time against a 1.4 s
  // one — it would stop discriminating anything. Held at the fraction it was
  // actually tuned to. BUT ALSO MEASURED NEARLY INERT, which is the more
  // interesting result: round 4 called this the mechanic that made the barge a
  // tactic, worth 22 points of barge outcome, and ablating it at n=250 on the
  // shipped build (0.001 vs 0.48) moves the overall rate 76.4% -> 75.6% and
  // barged-and-still-caught 32% -> 23%. Two trials. A ONE-OFF STAMINA COST
  // CANNOT MEAN MUCH WHEN THE TANK REFILLS IN 0.81 s; what a barge takes now is
  // TIME, not wind. Kept because it is free and it is the right fiction, not
  // because it is load-bearing. If the lead ever wants one fewer constant in
  // config.js, this is the one to drop.
  get bargeWindFrac() { return t('bargeWindFrac', 0.48); },
  get bargeWind()     { return K.bargeWindFrac * K.staminaMax; }, // s of tank, gone
  // =========================================================================
  // ROUND 4 — he was accelerating at 15.0 against the cop's copAccel of 9.0, so
  // every corner, every shopper, every stumble, the thief got back to speed 67%
  // harder than the man chasing him. The stated speed gap is 6% (5.35 vs 5.05);
  // the gap the bench actually measured over a long chase was 26%, and almost
  // all of the difference was this. A shoplifter with a jacket full of steaks
  // does not out-accelerate anybody.
  get thiefAccel()    { return t('thiefAccel', 10.5); },
  get thiefCorner()   { return t('thiefCorner', 0.55); }, // speed mult on a 90 degree cut
  get thiefReact()    { return t('thiefReact', 0.22); }, // seconds of "oh shit" before the bolt
  get pickupRadius()  { return t('pickupRadius', 0.62); },
  get pickupReach()   { return t('pickupReach', 1.25); }, // m/s toward the shelf face
  get shopperCount()  { return t('shopperCount', 14); },
  get thiefCount()    { return t('thiefCount', 2); },
  // A powerup is an item ON A SHELF, not a floor pickup. Sitting it on the aisle
  // centreline put it directly under a pure-pursuit chase: the bench measured the
  // "no powerup" cop boosted 45% of the chase because he ran over free cans.
  // Push it to the shelf lip so grabbing one costs you a deliberate swerve.
  get pickupLip()     { return t('pickupLip', 1.58); }, // metres off centreline
  get thiefCornerFree(){return t('thiefCornerFree', 0.985); },//cos above which a turn is free
  // The thief's own wind. He is a shoplifter with a jacket full of steaks, not a
  // sprinter — thiefRun is his first-few-seconds ceiling, not his cruise.
  get thiefWind()     { return t('thiefWind', 2.60); }, // sec of flat-out running
  // ---- ROUND 9 (2nd pass): thiefTired IS NOW THE BOT'S MODEL, NOT THE MAN ---
  // *** DO NOT TUNE THE CHASE BY EDITING THE FALLBACK ON THIS LINE. ***
  // `t` is TUNING-first and config.js OWNS `thiefTired` (0.575). The fallback
  // here is unreachable, so editing it is a silent no-op — which is the exact
  // shadow-block hazard in CLAUDE.md wearing the opposite costume, and I walked
  // straight into it this round: I moved this fallback 0.575 -> 0.68, measured
  // a control that should have been byte-identical to the previous build, got
  // 62% where it should have read 74%, and spent twenty minutes blaming the
  // store builder's parallel rebuild for it. What I was actually running was
  // lerp(thiefSpent, 0.575, legs) — a man who gets FASTER as he tires.
  //
  // So the man's speed does not come through here any more. He runs on
  // thiefFresh -> thiefSpent (both new, both absent from config, both therefore
  // live) and THIS constant is now exactly one thing: THE PURSUIT BOT'S
  // ESTIMATE OF HIS CRUISE — `tSpd` in botGoal and the dead-reckoning step in
  // botInput. At 0.575 it sits between fresh (0.68) and spent (0.51), so the
  // bot under-estimates a fresh runner and over-estimates a blown one, which is
  // what a player who cannot see a stamina bar over the man's head does. That
  // is deliberate and it is what keeps this out of the POISONED-LEVER trap in
  // the file header: the trap is a change that moves the thief WITHOUT moving
  // the bot's model, and the failure mode is the bot getting a free read.
  get thiefTired()    { return t('thiefTired', 0.575); },// x thiefRun — THE ANCHOR
  // ---- AND EVERYTHING ELSE ABOUT HIS PACE HANGS OFF THAT ANCHOR ------------
  // fresh and spent are MULTIPLES of config's thiefTired rather than absolute
  // numbers, and the pursuit bot's estimate is derived from the same two. That
  // is not tidiness, it is the POISONED-LEVER RULE in the file header, and this
  // round is the second time this file has been caught by it.
  //
  // What I did wrong, measured and then fixed: I made the man faster and left
  // `tSpd` in botGoal reading his OLD flat cruise, on the argument that a
  // player cannot see a stamina bar over a thief's head. That argument is true
  // and it is also how you would describe a difficulty lever wearing a fidelity
  // costume, so I measured it. Shipped thief, n=200, `cut` off0, no drink,
  // moving ONLY the bot's estimate of him:
  //     bot models him at 0.575 (his BLOWN cruise)    66.0%
  //     bot models him at 0.628 (the MIDPOINT)        77.0%
  //     bot models him at 0.680 (his FRESH cruise)    80.5%
  // FOURTEEN AND A HALF POINTS. Not noise, not a rounding error: a third of the
  // difficulty I thought I had built out of the thief was actually built out of
  // hobbling the instrument. Round 8's bot modelled the man EXACTLY right,
  // because his cruise was a constant and the bot read that constant; the
  // moment his cruise became a range, "read the constant" silently became
  // "assume he is always at his worst".
  //
  // So the bot reads the MIDPOINT of the range he can actually run at — equally
  // wrong in both directions, stateless, and independent of how long the chase
  // happens to last. It is one getter, `botCruise`, and botGoal, botInput's
  // dead-reckoning and the thiefCruise() handle game.js counts its door alarm
  // down on all call it. Nobody derives it twice.
  get thiefFreshMul() { return t('thiefFreshMul', 1.183); }, // x thiefTired
  get thiefSpentMul() { return t('thiefSpentMul', 1.000); }, // x thiefTired
  // His cruise with his legs still in it. 0.575 x 1.183 = 0.680 -> 3.64 m/s,
  // set just above the cop's rationed sustain (~3.7 m/s at a 63% duty cycle) so
  // that the opening of a stern chase is a race the cop does not auto-win.
  get thiefFresh()    { return K.thiefTired * K.thiefFreshMul; }, // legs FULL
  // ...and where the same man ends up after thiefLegs seconds of running.
  //
  // IT IS ROUND 8's CONSTANT, TO THREE DECIMALS, AND THAT IS THE POINT. 0.575
  // is exactly what `thiefTired` was and still is in config.js, so a BLOWN
  // thief in this build runs at precisely the speed every thief in rounds 4-9
  // ran at for the whole of his chase. Nothing was taken away from him. What is
  // new is only that for the first fourteen seconds he is FASTER than that, and
  // then comes back to it. Stating the change that way is not presentation: it
  // is why the wind ladder, the misaim table and the camper's income all move
  // by so little below, and it is the ablation — set thiefFresh to 0.575 and
  // this file is round 8's chase again, on every long chase, by construction.
  //
  // It also has to sit clearly UNDER the cop's rationed sustain (~3.7 m/s) or a
  // long chase never resolves and the misses run to forty metres, and clearly
  // OVER his gassed crawl or a cop who mismanages his wind still wins by
  // walking. 0.575 x thiefRun = 3.08 m/s, between the two. Sweep in the header.
  get thiefSpent()    { return K.thiefTired * K.thiefSpentMul; }, // legs GONE
  // THE PURSUIT BOT'S ESTIMATE OF HIM, and the only one there is. m/s, not a
  // multiplier, because every call site wants a speed. See thiefFreshMul above
  // for the fourteen-point measurement that made this its own getter.
  get botCruise()     { return K.thiefRun * (K.thiefSpent + K.thiefFresh) / 2; },
  // Seconds of running from fresh legs to spent ones. Read it as the TIME
  // CONSTANT of a slow linear fade, not as a stopwatch on the chase: the median
  // chase here is 5.7 s, so a runner only ever spends about a sixth of this on
  // the way down. At this setting the decay is not shaping the short chases at
  // all — it is the safety net that makes the LONG ones resolve, and that is
  // the whole job. Swept at n=200, difficulty 1, `cut` off0, ON THE HONEST BOT
  // (see thiefFreshMul), no drink / drink:
  //     fresh 1.183  legs 14    79.5% / 94.0%   median miss 1.72 m  p90 2.42
  //     fresh 1.183  legs 22    73.0% / 93.0%                1.78       2.52
  //     fresh 1.183  legs 34    70.0% / 90.5%                1.79       2.75  <- shipped
  //     fresh 1.220  legs 26    69.5% / 90.5%                1.95       2.84
  //     fresh 1.280  legs 14    72.0% / 93.0%                1.90      35.97  <- !
  //     fresh 1.280  legs 22    62.5% / 87.0%                2.01       7.87
  // THE LAST TWO ROWS ARE THE DESIGN RULE, and they are why the shipped point
  // buys its catch rate with DURATION rather than with SPEED. thiefFreshMul
  // 1.28 puts his fresh cruise at 3.94 m/s, ABOVE the cop's rationed sustain of
  // roughly 3.7 m/s, and the p90 miss immediately goes to thirty-six metres:
  // once he is faster than the man chasing him, an early loss is not a near
  // miss, it is gone, and no amount of later decay catches it inside a trial.
  // Keep thiefFresh UNDER the cop's sustain and the tail stays at 2-3 m across
  // the whole range; break that one inequality and the brief's "a few feet, not
  // half a store" fails on its own, whatever the catch rate says.
  get thiefLegs()     { return t('thiefLegs', 34.0); },  // s, fresh -> spent
  get thiefPanic()    { return t('thiefPanic', 0.965); },// x thiefRun with footsteps on him
  get thiefPanicGap() { return t('thiefPanicGap', 3.00); }, // metres at which fear starts
  get thiefPanicBand(){ return t('thiefPanicBand', 0.90); }, // metres from fear to flat-out
  get thiefSecond()   { return t('thiefSecond', 0.42); }, // wind regained per sec when clear
  // ROUND 4 — the reason no unboosted stern chase was EVER won, in one number.
  // thiefPanic 0.965 x thiefRun 5.35 = 5.16 m/s and copRun is 5.05. The panic
  // surge was documented as "always available": a thief with footsteps on him
  // ran 5.16 for as long as the footsteps lasted, so the last three metres were
  // arithmetically uncloseable without a powerup, forever. THAT is why the back
  // route measured 0 caught in 270 attempts — not the length of the detour, the
  // fact that adrenaline never ran out. Now it does: a second, finite tank that
  // only drains while he is actually being pressed. Ride his shoulder for four
  // seconds and it is gone, and a cop who kept anything in the bank runs him
  // down. This is also what makes the cop's OWN stamina a decision — sprint the
  // whole way and you arrive gassed at a man who still has his surge; sit two
  // metres off him and spend it, and the last stretch is yours.
  get thiefAdren()    { return t('thiefAdren', 4.20); }, // sec of adrenaline
  get thiefAdrenBack(){ return t('thiefAdrenBack', 0.17); }, // regained per sec when clear
  // Seconds with your shoulder on a push-bar. A door is not a teleport; this is
  // the beat that makes a chase to the doors contestable at the doors.
  get doorShove()     { return t('doorShove', 0.85); }, // sec at the staff-end door
  get navHug()        { return t('navHug', 0.55); }, // route cost for scraping geometry
  get harassSpeed()   { return t('harassSpeed', 0.90); }, // m/s: standing still never offends
  get harassAim()     { return t('harassAim', 0.45); }, // cos(cop velocity, shopper)

  // --- ROUND 3: counterplay in a corked aisle -------------------------------
  // The cop is a cost in the escape flood, not just a body to swerve round.
  // Radius stays under the 5.3 m aisle pitch so a cop in aisle 4 never makes
  // aisle 3 expensive; the weight is what a thief will pay to get past him,
  // measured against the ~30 m the back-of-store detour actually costs.
  // The weight is set against a real distance. Crossing this bubble at the shelf
  // lip costs about 0.62 x w metres of route, and the longest detour the store
  // offers — back out of the aisle, along the rear cross-aisle, down the next
  // one — is about 55 m. Below ~45 the lip is cheaper than any detour, he
  // squeezes from everywhere, and the cork is back. The curve is flat from
  // there: 55, 70 and 90 all measure within a point of each other, because what
  // is left is the thief you walked in on top of, which no route can help.
  get copThreatR()    { return t('copThreatR', 3.00); }, // m
  get copThreatW()    { return t('copThreatW', 110.0); }, // route-cost mult at the centre
  get copLead()       { return t('copLead', 0.30); }, // s of cop velocity the flood leads by
  get fleeEvery()     { return t('fleeEvery', 0.17); }, // s between escape-field rebuilds
  get fleeMove()      { return t('fleeMove', 0.70); }, // m of cop movement that forces one
  get fleeNear()      { return t('fleeNear', 12.0); }, // m: past this, rebuild lazily
  // How far ahead OF HIM BY ROUTE the cop has to be before he counts as an
  // obstacle rather than a pursuer. Not decoration: at 1.2 m a cop cutting the
  // inside of an aisle end briefly registers as a roadblock, the flood peels the
  // thief sideways for no reason, and a plain stern chase leaks from 1.3% caught
  // to 15%. Three metres is a body and a half plus the ground he covers deciding
  // — brief cut-ins do not qualify, being parked in the aisle mouth does.
  get threatAhead()   { return t('threatAhead', 3.00); }, // m of route
  // He sees the uniform standing in the mouth of his aisle. He does not stroll
  // up to five metres to confirm it. Seeing the way out blocked IS the tell.
  //
  // ROUND 4 — this number was the sub-second collection. Round 3 set it at
  // 8.6 m, so a thief who was fourteen metres up the aisle when the cop was
  // dispatched into its mouth kept AMBLING TOWARDS HIM for five and a half
  // metres before he reacted, while the cop came the other way at 5 m/s. The
  // two of them closed the gap together and 61% of catches landed inside one
  // second of the bolt. That is not a chase, it is a handshake. An aisle is
  // 26 m long and a uniform stepping into the end of it is visible down the
  // whole of it; the look now covers the aisle, so the bolt happens on the
  // dispatch and the chase is whatever distance the dispatch actually bought
  // you. It still needs line of sight and it still needs him to be ON the
  // route, so a cop at his post across the store never trips it.
  get thiefLook()     { return t('thiefLook', 17.0); }, // m
  get thiefBlockCos() { return t('thiefBlockCos', 0.60); }, // cop must be this near his route line
  // The squeeze. 1.58 m of usable half-lane against a 1.15 m catch radius means
  // a shelf-hugging thief clears a centred cop by 0.43 m — thin, readable, and
  // beatable by a cop who steps to the right shoulder. That margin IS the duel.
  get jukeRange()     { return t('jukeRange', 5.20); }, // m at which he commits
  // How far off the lane centreline you can drift and still have both his
  // shoulders covered. 1.58 m of half-lane minus the 1.15 m the grab reaches
  // leaves 0.43 m of daylight either side; give it a little back so holding the
  // middle is a real position and not a pixel.
  get grabSlack()     { return t('grabSlack', 0.45); }, // m
  get bargeGrace()    { return t('bargeGrace', 0.50); }, // s of no-grab while he is through you
  get jukeAhead()     { return t('jukeAhead', 0.34); }, // cos: how "in the way" you must be
  get jukeHold()      { return t('jukeHold', 0.85); }, // s the chosen shoulder is locked in
  get jukeLat()       { return t('jukeLat', 1.75); }, // lateral steering authority
  get jukeLip()       { return t('jukeLip', 0.97); }, // fraction of the usable half-lane
  get stumbleT()      { return t('stumbleT', 0.28); }, // s of lost pace after squeezing past
  // 1.25 -> 0.55 (round 3 had 0.90). THE ONLY ONE OF THE THREE BARGE COSTS THAT
  // STILL DOES ANYTHING — see bargeWindFrac above and bargeDump below, both
  // measured inert. 1.25 s of the cop lying in the aisle was priced against a
  // man who could then sprint for 3.1 s and reclaim 2 m/s; against a 1.4 s tank
  // the same 1.25 s is simply unrecoverable, and getting past the cop went from
  // "worth something" to "decided it".
  get bargeStagger()  { return t('bargeStagger', 0.55); }, // s the COP spends shaking it off
  get bargeSlow()     { return t('bargeSlow', 0.22); }, // x speed while shaking it off
  get bargeThru()     { return t('bargeThru', 0.95); }, // m he ends up past you
  get stumbleMul()    { return t('stumbleMul', 0.72); },
  // ROUND 4 — what a shoulder actually costs the man who takes it. Two things
  // had to be true before getting through somebody meant anything, and I found
  // them one at a time by taking each back out again. n=200, competent bot,
  // right aisle, sliced on the chases where he committed to a shoulder AND got
  // past — "did going through you change the outcome":
  //   neither          overall 86.5%   barged-and-still-caught 97%   (= round 3)
  //   +push-through            83.5%                            81%
  //   +push-through +wind      79.5%                            59%
  // Round 3 had NEITHER, and 97% is exactly the "33 barges, 32 caught" the
  // critic measured and I could not explain.
  //
  // PUSH-THROUGH (bargeThru) is the physics bug: a 0.10 m nudge left the two
  // bodies inside the separation constraint they enforce on each other, welded
  // 0.78 m apart for the half-second of grace, and grabbed the instant it
  // expired. He is not squeezing past, he is running through — put him a body's
  // length down the lane.
  //
  // WIND is the one that makes it a tactic instead of a delay. Two metres of
  // knockback is nothing to a cop whose sprint (5.05) is 64% faster than the
  // thief's cruise (3.08); he reclaims it in a second. A second and a half of
  // tank is half of everything he has, so the man he just let past is the man
  // he now has to run down on fumes. Worth 22 points of barge outcome on its
  // own, and it is the only place in this file where the cop's stamina decides
  // anything at all — see the note in updateCop for why it is also not enough
  // to make stamina a decision in general.
  // ROUND 5 — this moved to `bargeWindFrac` at the top of K. It was 1.50 s
  // against a 3.10 s tank; as an ABSOLUTE number against the 1.40 s tank it
  // wipes the cop out every single time and stops discriminating anything, so
  // it is a fraction of max now and holds the 48% it was actually tuned to.
  // MEASURED INERT, n=250, and left at its round-4 value for that reason:
  // 0.40 vs 0.85 produced byte-identical results on every field in the bench.
  // `s.adren` is ~1.0 at the moment of any barge that happens early in a chase
  // — which is all of them — so `Math.max(s.adren, bargeDump)` never fires. It
  // was never a live constant; round 4 shipped it inside a bundle and I did not
  // ablate it on its own. Do not tune it, delete it or measure it in isolation.
  get bargeDump()     { return t('bargeDump', 0.85); }, // thief adrenaline on contact
  // How much of the cop this particular thief wants to risk. Rolled per subject
  // so two identical-looking dispatches do not always play out the same way.
  get nerveLo()       { return t('nerveLo', 0.55); }, // he will chance your shoulder
  get nerveHi()       { return t('nerveHi', 1.55); }, // he wants no part of you
  // ROUND 4 — which door is HIS door. Two exits killed the camper, but a
  // strengthened pursuit bot then found the next degenerate thing: if every
  // subject always walks at the geometrically nearest way out, his destination
  // is a pure function of where he is standing, so you never have to find him,
  // only work out where he will be. The misaim table went flat again — being
  // sent two aisles wrong cost eleven points instead of forty-seven — and for
  // the same reason as round 3: public knowledge beat a scouting report.
  //
  // People do not leave by the nearest door. They leave by the door they came
  // in by. So each subject rolls one, and a running man will pay this many
  // metres of extra route to use it rather than the other one. That is enough
  // to make prediction-from-position wrong about half the time while leaving it
  // sensible under real pressure — put a uniform between him and his door and
  // he takes the other one, because the cop is still priced into the same
  // field. The aisle number is then the only thing in the game that tells you
  // where the man ACTUALLY is, which is what the desk phase is for.
  get doorBias()      { return t('doorBias', 7.5); },  // m of route he will pay

  // =========================================================================
  // ROUND 6 — ONE WAY OUT, AND A REASON NOT TO STAND ON IT
  //
  // The client: "In the store, I think there should only be one exit that
  // people can leave out of. I think you should kind of have a clue where
  // they're going. The cop should kind of have a chance to get there."
  //
  // He is right and round 4's fix was the cheap one. Two doors killed the
  // door-camper by HIDING THE DESTINATION, which also hid it from the player —
  // the reason to leave the desk stopped being "I know where he is going" and
  // became "I cannot know, so I had better follow him". Measured today, on this
  // build, n=120, before any of this round's changes:
  //                       cut off0   cut off1   camp off0   chase off0
  //   two doors             76.7       (34.7)      23.3        38.3
  //   one door              76.7        73.3       71.7        24.2
  // One door hands the camper 48 points and flattens the misaim table from 40
  // points to 3.4. Both of those are the same fact: with one way out, WHERE he
  // is going is public, so the only thing the aisle number can still be worth
  // is WHO he is and WHEN he moves. This round makes it worth exactly that,
  // three ways, and none of them is geometry:
  //
  //   1. DETERRENCE. A shoplifter who can see the guard posted on the only way
  //      out does not commit. He puts it back and shops. Camping the door
  //      therefore produces a shift with NO INCIDENTS IN IT — punished by
  //      income, not by catch rate, which is why benchShift() exists and why a
  //      camper's catch rate is no longer the number that describes him.
  //   2. INNOCENTS CHECK OUT AND LEAVE. Through the same door. So the door is a
  //      crowd and not a chokepoint, "subject heading for the exit" stops being
  //      evidence, and the man at the door has to know WHICH of the four people
  //      shouldering through it is his.
  //   3. IDENTITY. You cannot grab a man you never made. See `ident` in
  //      bench(): a cop who has never had a clear look at the subject inside
  //      identR grabs the nearest body instead, and if that is a shopper it is
  //      a harassment complaint. That is the aisle number's real job with one
  //      exit, and it is what puts the slope back in the misaim table.
  // =========================================================================
  // Route metres from the cop to the way out, under which he counts as POSTED.
  // Route, not straight line: a cop the same distance away through a shelf run
  // is not standing on the door and a shoplifter can tell the difference.
  get deterR()        { return t('deterR', 8.5); },
  get deterSpeed()    { return t('deterSpeed', 1.35); }, // m/s: under this he is loitering
  get deterT()        { return t('deterT', 2.20); },  // s posted before anyone reads it
  get deterSight()    { return t('deterSight', 26.0); }, // m of route within which he cases it
  get deterBalk()     { return t('deterBalk', 3.00); }, // s of balking before he gives up
  // ...and the same decision one step later in the timeline. He already has it
  // in his coat, he is walking out, and there is a uniform on the only door. He
  // does not walk into it. He hangs back in the aisles and waits you out, and
  // after `dumpT` he ditches the goods in a shelf and leaves clean — no arrest,
  // no loss, no points. THIS is what makes camping fail against an incident
  // that is already in flight, and it is the difference between the one-exit
  // design working and the one-exit design being a 71.7% door-camping bot.
  // It applies to `drift` ONLY: once he has BOLTED he is committed and standing
  // on the door is the correct play. Before he runs / after he runs is a clean
  // line a player can learn in one shift.
  get dumpT()         { return t('dumpT', 11.0); },  // s of waiting before he ditches it
  // The race, in route metres. He goes for it while his own route to the only
  // exit is shorter than the cop's, times raceEdge, plus raceSlack metres of
  // nerve. Sweeps are in this round's report; raceEdge below ~0.85 makes him
  // turn back from a cop who is nowhere near the door and the chase stops
  // existing, above ~1.1 he commits into a man already standing on it, which is
  // the 71.7% door-camper this round exists to kill.
  get raceEdge()      { return t('raceEdge', 0.98); },
  get raceSlack()     { return t('raceSlack', 3.20); }, // m, divided by his nerve
  // Inside this, a uniform on his line is a bolt whether or not it is walking
  // at him. Outside it, it has to be coming AT him. Half of thiefLook.
  get boltNear()      { return t('boltNear', 9.00); }, // m
  get chillLo()       { return t('chillLo', 14.0); }, // s of honest shopping after a balk
  get chillHi()       { return t('chillHi', 30.0); },
  // How close, and for how long, you have to have SEEN him before the grab is
  // his and not the nearest stranger's. 12 m is most of an aisle from its mouth.
  get identR()        { return t('identR', 12.0); },
  get identT()        { return t('identT', 0.45); }, // s of clear look
  // ...and how big the crowd he is choosing from is at the moment he commits to
  // a grab. Two metres and a bit: everybody he could plausibly have got a hand
  // on. One body inside it is not a choice and never costs him anything.
  get identPick()     { return t('identPick', 2.30); }, // m
  get identCool()     { return t('identCool', 1.10); }, // s before he tries again
  // Innocent customers finish their shop and leave. Without this the only body
  // that ever walks at the door is the thief, and the door is a chokepoint
  // instead of a crowd.
  // Seconds of shopping a customer has left when he is placed. NEGATIVE at the
  // bottom on purpose: about one body in ten is placed already walking at the
  // door, so the exit has traffic through it from the first frame of a shift
  // instead of staying empty for the first minute and then discovering a
  // stream. It is also what makes the identity model in bench() bite from t=0.
  get shopLo()        { return t('shopLo', -14.0); },
  get shopHi()        { return t('shopHi', 165.0); },
  // The decoys. Seconds between one innocent behaviour and the next, per
  // shopper. At 14 shoppers, 9-22 s each puts roughly one reach-with-an-object
  // in the building every 1.1 s, which is what makes the wall worth watching
  // and a single frame worth nothing.
  get decoyLo()       { return t('decoyLo', 9.0); },
  get decoyHi()       { return t('decoyHi', 22.0); },

  // =========================================================================
  // ROUND 7 — "HEY, PUT THAT BACK." DETERRENCE AT RANGE, AT A CHOSEN SUBJECT.
  //
  // Client, verbatim: "If I see them doing something suspicious, I can go, 'Hey,
  // put that back,' and then they look around, like, 'What the fuck?' ... But if
  // it's a criminal doing it, they might actually reconsider ... they might put
  // it back, and then just leave the store peacefully."
  //
  // Round 6 built the whole behavioural half of this and fired it on PROXIMITY:
  // a uniform posted on the only door made everybody in the building balk. This
  // is the SAME machinery on a second trigger — the PA, at range, at one named
  // subject — so `announceAt()` ends in abortTheft()/dumpGoods() and pays what
  // they pay, which is nothing. A player who announces at everybody earns
  // exactly what a door-camper earns. See benchIncome's `pa` policy.
  //
  // ---- WHY THIS IS NOT A GUILT ORACLE, IN FOUR NUMBERS -------------------
  // If the guilty comply and the innocent do not, the button is a free scanner
  // and the whole desk phase dies with it — the same failure the decoy library
  // exists to prevent. So the two populations OVERLAP on both observable
  // outcomes, and the overlap is these constants:
  //   guilty, pre-conceal   annHeed     put it back
  //   guilty, already has it annHeedHot  ditch it (lower: he is committed)
  //   innocent              annSpook    sheepishly puts back whatever is in his
  //                                     hand — THE SAME `putback` CLIP
  // ...and everybody else — including the guilty who brazen it out — plays a
  // react clip, which is also what every bystander inside annSpill plays,
  // because the PA is a loudspeaker and not a laser. So "somebody looked
  // around" is worth nothing and "somebody put something back" is worth a
  // likelihood ratio, not a verdict. The arithmetic is in this round's report.
  // The heed roll is tilted by the subject's `nerve` — the same hidden roll
  // that already decides whether he will chance your shoulder — so two
  // identical-looking subjects do not answer the same way.
  get annHeed()       { return t('annHeed', 0.62); },
  get annHeedHot()    { return t('annHeedHot', 0.34); },
  get annSpook()      { return t('annSpook', 0.30); },
  get annNerve()      { return t('annNerve', 0.45); },  // nerve tilt on the roll
  get annSpill()      { return t('annSpill', 7.0); },   // m: bystanders who also look up
  // ROUND 9 — THE ESCALATION LADDER. `birdRung` is how many times a body has to
  // be shouted at before he gives the camera the finger, and it is the ONLY
  // input to that decision: not his guilt, not his nerve, not what he did about
  // the announcement. See armBird() and benchBird().
  get birdRung()      { return t('birdRung', 4); },     // announcements at one body
  get birdGap()       { return t('birdGap', 0.55); },   // s after the reaction ends
  get annLagLo()      { return t('annLagLo', 0.35); },  // s before he reacts at all
  get annLagHi()      { return t('annLagHi', 0.95); },
  get annCool()       { return t('annCool', 6.0); },    // s between PA calls
  get annHold()       { return t('annHold', 4.5); },    // s a 'hold' call pins him
  // Shouting at the same man twice is worth less than shouting at him once, and
  // this is the constant that stops the button being a slot machine you pull
  // until it pays. Heed probability is multiplied by annFade per PREVIOUS call
  // at that body: 0.62, 0.28, 0.13... which converges at about 0.78 rather than
  // at 1.0, so a determined spammer gets 16 points of compliance for eight
  // calls and every one of them spooks the aisle.
  get annFade()       { return t('annFade', 0.45); },
  // A bystander is being shouted at by implication, so he takes it less
  // personally — but a GUILTY bystander still might put it back, which is how
  // you deter a man you never saw.
  get annSpillMul()   { return t('annSpillMul', 0.45); },
  // AND WHAT IT COSTS TO SHOUT AT A CUSTOMER. Not a harassment complaint —
  // the entire point of the announcement is that it is the safe alternative to
  // walking up to somebody, so nothing on this path can reach onHarass(). What
  // it does is finish his shop early: he has been spoken to in public and he
  // would like to pay and go. That is a body at the door sooner and one fewer
  // subject the shift can arm, which is a real cost, paid in income.
  get annHuff()       { return t('annHuff', 0.55); },   // x remaining shopT

  // =========================================================================
  // ROUND 8 — "OH SHIT." THE THIRD ANSWER, AND THE ONLY ONE WORTH POINTS.
  //
  // Client, verbatim: "unless they're a real thief, and then the thief is like
  // 'oh shit', and gets scared and starts running."
  //
  // A thief who runs when you shout at him IS a confession, and this file has
  // spent two rounds protecting the ambiguity. What pays for it is WHERE THE
  // PLAYER IS STANDING WHEN HE FINDS OUT. The information does not arrive on
  // its own; it arrives welded to a chase that has already started without you,
  // and you bought it with the only announcement you had for six seconds.
  //
  // ---- THE GATE THAT MAKES IT A DECISION AND NOT A SCANNER ----------------
  // `boltChance` returns ZERO unless beatsCopToDoor(s) — round 6's own race,
  // already load-bearing for heldOff(). So:
  //   from the desk, 40 m away          he can beat you, so he can run
  //   from the mouth of his aisle       he can beat you, so he can run, and you
  //                                     are 20 m behind a man with a head start
  //   with you between him and the door he CANNOT, so he does not, and you get
  //                                     round 6's man: comply, or wait you out
  // That is the whole balance and it is geometry rather than a mode check. The
  // announcement is worth information exactly when you are too far away to use
  // it, and worth none at all when you have already done the hard part. It also
  // closes the obvious exploit — walk to 10 m of a subject, shout, and read the
  // answer for free — because at 10 m in front of him the answer is always the
  // same one, and at 10 m BEHIND him he was going to bolt at boltNear anyway.
  //
  // ---- AND IT IS CARVED OUT OF THE SHRUG, NOT OUT OF THE PUT-BACK ---------
  // reactToPA takes ONE rnd() and splits the interval: [0,p) heed, [p,p+q) bolt,
  // the rest shrug. So the heed bit is `roll < p` in round 8 exactly as it was
  // in round 7 — same seed, same draw, same answer — and every compliance rate
  // in the round-7 table reproduces to the decimal, LIKELIHOOD RATIO INCLUDED.
  // What round 8 changes is which men who were going to blank you run instead.
  // A put-back is worth what it was worth: 1.95, a read and not a test.
  get annBolt()       { return t('annBolt', 0.30); },   // P(run) once it is in his coat
  // ...and before he has committed. Lower, and it is the smaller number for a
  // reason that is not balance: he is holding a jar, he has not done anything
  // yet, and legging it out of a shop with a jar is a decision. When it does
  // fire he takes the jar with him — see paBolt().
  get annBoltCold()   { return t('annBoltCold', 0.13); },
  // Nerve, INVERTED against the compliance tilt. nerveLo 0.55 is the man who
  // will chance your shoulder, and running past a uniform is the purest form of
  // chancing your shoulder, so bold men run and nervous men put it back. If
  // both rolls tilted the same way the same subject would be the most likely to
  // comply AND the most likely to bolt, which is not a person.
  get annBoltNerve()  { return t('annBoltNerve', 0.35); },
  // The head shake, in Hz. See POSE.shake in decoy.js: the clip owns the
  // amplitude, animateShopper owns the oscillation, because a 110 ms lerp on the
  // neck eats half of a 2 Hz signal authored as keyframes.
  get annShakeHz()    { return t('annShakeHz', 2.10); },
  // How long the annoyance outlives the clip. annHuff already cuts his shop;
  // this is the same fact in the BODY, which is what the client asked for —
  // chin up, back straighter than this store usually gets, and moving off at a
  // clip. Guilty shruggers get it too, or it would be a tell.
  get annHuffT()      { return t('annHuffT', 7.0); },
  get annHuffPace()   { return t('annHuffPace', 1.18); }, // x walk while huffing

  // =========================================================================
  // ROUND 10 — LESS ANGER, MORE CONFUSION, AND PROXIMITY AS A STRENGTH
  //
  // Client, verbatim: "I don't think the shoppers should necessarily stop and
  // shake their hands and get mad. I DO want them to take notice when I talk on
  // the PA system, especially if they're in the aisle and they're in proximity,
  // and I'm saying 'hey, excuse me.' I want them to look around and look really
  // confused."
  //
  // Nothing about the COMPLIANCE maths moves. The roll is the round-7 roll, the
  // bolt is still carved out of the shrug interval of it, and the six
  // constants above are untouched — which is what makes the likelihood ratios
  // re-measurable against round 8's table rather than merely re-published.
  // What moves is the PERFORMANCE, on four dials.
  // =========================================================================
  // How far away the announcement stops being about you. 14 m is a bit over
  // half an aisle: at the mouth of a man's own aisle you get the full search,
  // from the far end of the next aisle you get a glance. Chosen off the
  // geometry rather than swept — the dispatch position is ~20 m from a subject
  // mid-aisle and the boltChance table's "8 m behind him" case is the range at
  // which the client says he wants the big reaction.
  get annReach()      { return t('annReach', 14.0); },
  // Below this weight the confusion rung collapses to the short glance whatever
  // the roll said. 0.55 of 14 m is 6.3 m, i.e. about the width of two aisles.
  get annNearCut()    { return t('annNearCut', 0.55); },
  // WHICH SHOUT TURNS BAFFLEMENT INTO ANNOYANCE. 3 is not arbitrary: it is the
  // rung the escalation ladder already changes on (LADDER/rungOf), so the
  // posture, the walk and the clip all cross over on the same announcement
  // instead of on three different ones.
  get annMadRung()    { return t('annMadRung', 3); },
  // The confused tail. Shorter than the huff because it is not a grievance, it
  // is an unresolved thought, and 4.5 s of a man still glancing about is
  // already a long time on a monitor tile.
  get annPuzzT()      { return t('annPuzzT', 4.5); },
  // ...and it makes him SLOWER, which is the opposite sign to annHuffPace and
  // is the point. A distracted man dawdles.
  get annPuzzPace()   { return t('annPuzzPace', 0.88); },
  // How much of the tail a man at the far edge of annReach keeps. Not zero:
  // he did hear it, and a reaction that vanishes with distance would make the
  // absence of one informative.
  get annTailFar()    { return t('annTailFar', 0.42); },
  // The after-clip scan, in Hz and radians. Deliberately an eighth of
  // annShakeHz: a shake is negation and a sweep is searching, and with no face
  // available the rate is most of what separates them.
  get annScanHz()     { return t('annScanHz', 0.42); },
  get annScanAmp()    { return t('annScanAmp', 0.30); },
  // THE ABLATION HANDLE. 1 restores round 9's PA performance whole: its ladder,
  // no proximity override, a flat annHuffT huff on every shrug and no tail on
  // the price-check line. Debug only — bench() stamps it onto res.override so a
  // run taken under it can never be quoted as the shipped build.
  get annR9()         { return t('annR9', 0); },

  // ROUND 10 — HOW MANY PEOPLE WORK THE FRONT END. See agents/frontend.js for
  // the measured draw-call ledger and for why frustum culling does not help.
  // Read through t() like everything else so a sweep can move it without a
  // reload: `agents.override.frontEndCount = 3` then reload, since the roster
  // is built once on the first tick.
  get frontEndCount() { return t('frontEndCount', 7); },

  // ROUND 10 — the child collision, AS A DIAL, and it is a dial for one reason:
  // the claim this feature has to defend is "byte-identical bench", and the only
  // trustworthy form of that claim on this project is an A/B taken ON ONE PAGE
  // LOAD (AGENTS_BRIEF, "ship the old layout as a dial"). `agents.override
  // .kidCollide = 0` restores round 9's clipping child exactly, and bench()
  // stamps a non-empty override onto res.override, so a run taken under the
  // ablation says so on its own object. Not a difficulty lever and not a
  // gameplay constant: nothing downstream of a child exists.
  get kidCollide()    { return t('kidCollide', 1); },

  // =========================================================================
  // ROUND 6 — THE DIFFICULTY RAMP. Six numbers, one dial.
  //
  // Client: "especially in the beginning of the game when we want it to be
  // easier to draw people in."
  //
  // `DIFF.level` runs 0 (opening minutes) to 1 (round 5's shipped game), and
  // every ramped quantity is `easy -> 1.0 x shipped`, so LEVEL 1 IS EXACTLY THE
  // BUILD EVERY NUMBER IN THIS FILE'S HEADER WAS MEASURED ON. That is the whole
  // safety property: the ramp cannot silently re-tune the game, because its top
  // end is the identity. It also defaults to 1, so a game.js that never calls
  // setDifficulty() gets precisely the round-5 difficulty and nothing regresses.
  //
  // What is ramped, and why each one is a DIFFICULTY change and not a DENSITY
  // change (game.js owns density — see its PACE table, and the note below
  // about sharing the breakpoints):
  //   run    1.00. NOT RAMPED, AND THAT IS THE MOST USEFUL THING THIS ROUND
  //          MEASURED. "Make the thief slower early" is the obvious first
  //          difficulty lever and IT MAKES THE GAME HARDER. n=80-100, competent
  //          bot, one exit, everything else ramped:
  //             rampRun 0.86 -> 50.0%     rampRun 0.75 -> 47.5%
  //             rampRun 0.65 -> 70.0%     rampRun 1.00 -> 86.3%
  //          against 77.0% at level 1. A slower man is still walking out when
  //          the cop is dispatched, so the cop arrives BEHIND HIM instead of in
  //          front of him — and this file's own header has said since round 5
  //          that being behind him is a verdict, not a position (the legacy
  //          'behind' spawn scores 4.7%). Slowing the thief converts the good
  //          geometry into the unwinnable one. The median chase collapses from
  //          6.22 s to 1.98 s and catches-inside-a-second triple, which is the
  //          signature: the bot either lands on top of him or never sees him
  //          again. Do not re-add it without re-reading this paragraph.
  //   walk   the DRIFT, and the one lever the game builder asked for by name:
  //          the tell-to-door window is route metres over thiefWalk, so 0.88
  //          makes it 14% longer while the player is still learning to read the
  //          wall. That is the client's "it should take a minute", bought on
  //          the difficulty axis where it belongs rather than on game.js's
  //          density axis. It is nearly free on the floor — see the table
  //          above: 1.00 measures 86.3% and 0.80 measures 78.8%, both against
  //          77.0% at level 1, so the drift ramp costs the early player some of
  //          his advantage for the same geometric reason `run` costs him all of
  //          it. 0.88 is the measured compromise.
  //   react  0.22 -> 0.53 s. The "oh shit" freeze before the bolt. A third of a
  //          second of a man standing still staring at you is a beat a new
  //          player can see and act on; at 0.22 it is a frame and a half.
  //   adren  4.20 -> 2.30 s of panic fuel, so riding his shoulder pays off
  //          sooner and the last three metres close.
  //   tell   gesture clips run 1.35x long at level 0. The concealment is the
  //          same five frames, held longer. Note this ramps EVERY clip, decoys
  //          included — slowing only the steal would make clip length the tell
  //          and hand the whole of JOB 3 back.
  //   look   17.0 m unchanged at both ends, deliberately. Shortening his sight
  //          line "to make it easier" is the round-3 pathology: he bolts later,
  //          the cop is already on top of him, and the catch lands inside a
  //          second. Easier must never mean shorter.
  get rampRun()       { return t('rampRun',   1.00); }, // x thiefRun — NOT RAMPED, see above
  get rampWalk()      { return t('rampWalk',  0.88); }, // x thiefWalk (the drift)
  get rampReact()     { return t('rampReact', 2.40); }, // x thiefReact
  get rampAdren()     { return t('rampAdren', 0.55); }, // x thiefAdren
  get rampTell()      { return t('rampTell',  1.35); }, // x gesture duration
  // ROUND 6, ADDED AFTER MEASURING, because the first five made the game HARDER
  // at level 0 and the bench said so: 49.0% at difficulty 0 against 77.0% at
  // difficulty 1, with the median chase down at 2.00 s and 30.6% of catches
  // inside a second. A slower drift (rampWalk) is exactly what the game builder
  // asked for and it is right for the DESK — the tell-to-door window is 25%
  // longer — but on the FLOOR it changes the encounter geometry: the cop
  // arrives while the man is still deep in his aisle, so the bolt happens
  // inside jukeRange (5.20 m), so far more chases start as a SHOULDER BARGE.
  // And getting through the cop is nearly a win in this game (round 5: barged
  // and still caught, 18%). "Easier" was quietly handing the naive player the
  // hardest single interaction in the file, every time.
  //   rampNerve   scales the per-subject nerve roll UP at level 0, so an early
  //               shift gets timid shoplifters who want no part of you and run
  //               AROUND rather than THROUGH. Fiction-exact and it moves the
  //               flee field too, since copThreatW is scaled by nerve.
  //   rampStagger cuts what a barge that does get through actually costs you.
  // Neither of these fixed the inversion on its own (50.0% -> 51.0%), which is
  // what sent me to ablate `rampRun` and find the real cause. They are kept
  // because they are directionally right and cost nothing at level 1, where
  // both are the identity, but do not credit them with the ramp working.
  get rampNerve()     { return t('rampNerve',   1.55); }, // x the nerve roll
  get rampStagger()   { return t('rampStagger', 0.40); }, // x bargeStagger
  get nerveLoD()      { return K.nerveLo * dlerp(K.rampNerve, 1); },
  get nerveHiD()      { return K.nerveHi * dlerp(K.rampNerve, 1); },
  get bargeStaggerD() { return K.bargeStagger * dlerp(K.rampStagger, 1); },

  // The ramped reads. EVERYTHING that touches a thief's speed goes through
  // these, including the pursuit bot's model of him (`tSpd` in botGoal and the
  // dead-reckoning in botInput) and the thiefCruise()/thiefTop() handles
  // game.js counts the door alarm down on. That is not tidiness, it is the
  // POISONED-LEVER RULE from this file's header: `thiefTired` measured a
  // 34-point collapse when it was swept naively, because the bot predicts the
  // thief with the same constant the thief runs on, so a change that moves one
  // without the other measures the bot. The ramp moves both, by construction.
  get thiefRun()      { return t('thiefRun',   5.35) * dlerp(K.rampRun,  1); },
  get thiefWalk()     { return t('thiefWalk',  1.25) * dlerp(K.rampWalk, 1); },
  get thiefReactD()   { return K.thiefReact * dlerp(K.rampReact, 1); },
  get thiefAdrenD()   { return K.thiefAdren * dlerp(K.rampAdren, 1); },
  get tellMul()       { return dlerp(K.rampTell, 1); },

  // =========================================================================
  // ROUND 12 — MOVEMENT. Every one of these is read `t(name, fallback)` so
  // config.js wins the moment the lead promotes it; there is no override block
  // in this round and there is nothing here that reads a bare literal.
  // =========================================================================
  // ---- the walk -----------------------------------------------------------
  // The knee substitute's depth, as a fraction of leg length, at the peak of
  // the swing. 0.075 lifts the toe 64 mm on an average body — enough to clear
  // the 62 mm the compass gait sinks the hip by, with margin. Below ~0.055 the
  // foot grazes; above ~0.11 the leg visibly telescopes at portrait range.
  get gaitLift()      { return t('gaitLift', 0.075); },
  get gaitLiftHeavy() { return t('gaitLiftHeavy', 0.62); },  // x gaitLift
  // Stance knee flexion, as a fraction of leg length, at mid-stance. The raw
  // compass gait bobs 102 mm on this crowd's longest strider, which is twice
  // life; 0.055 lowers the mid-stance peak by 47 mm and brings the whole
  // excursion to 45-60 mm, which is what a walk measures. A heavy walk flexes
  // LESS — it is stiffer and rolls more — which shows up as a deeper bob, and
  // that is correct rather than a bug.
  get gaitFlex()      { return t('gaitFlex', 0.055); },
  get gaitFlexHeavy() { return t('gaitFlexHeavy', 0.70); },  // x gaitFlex
  // Lateral sway of the pelvis over the loaded foot, metres, at a normal walk.
  // The single biggest "weight" cue in the file and the one the brief names:
  // a heavy body has to get its mass over each foot and a lean one does not.
  get swayLean()      { return t('swayLean', 0.016); },
  get swayHeavy()     { return t('swayHeavy', 0.052); },
  // Pelvic list — the unloaded hip drops. Radians.
  get listLean()      { return t('listLean', 0.045); },
  get listHeavy()     { return t('listHeavy', 0.105); },
  // ---- starting and stopping ---------------------------------------------
  // Nobody goes from nothing to a walking pace in seven frames. thiefAccel is
  // 10.5 m/s^2 and is NOT touched — it is the chase's constant and the bot
  // predicts the thief with it. This is a ceiling on the TARGET instead, so a
  // body eases into its cruise over ~0.45 s and costs ~0.11 m of ground once
  // per start. Excluded from `bolt`, `react` and `shove`, which are the three
  // states the chase is measured in.
  get startRamp()     { return t('startRamp', 2.9); },  // m/s per second of target
  get stopRamp()      { return t('stopRamp', 4.2); },   // ...and coming down
  // How much the trunk leads a start and lags a stop. Radians per m/s^2 of the
  // body's own acceleration, smoothed. This is the brief's "the trunk keeps
  // moving after the feet stop", and it is signed so it does both from one line.
  get leanAccel()     { return t('leanAccel', 0.055); },
  get leanMax()       { return t('leanMax', 0.34); },
  // ---- turning ------------------------------------------------------------
  // Nobody rotates on the spot like a turret. `s.heading` stays the true
  // velocity bearing — the sim, the cart, the exits and the bot all read it —
  // and the BODY yaw chases it at a bounded rate. The head gets there first.
  get turnRate()      { return t('turnRate', 5.6); },   // rad/s of body yaw
  get turnLead()      { return t('turnLead', 0.62); },  // x the error, onto the neck
  get turnBank()      { return t('turnBank', 0.10); },  // s per rad/s, into the lean
  // =========================================================================
  // ROUND 1 (cop) — HIS WALK, AS TWELVE NUMBERS INTO THE SHARED SOLVE
  // =========================================================================
  // The brief: "a fat, unfit man's walk is not a thin man's walk played
  // slower". None of these is a speed. Every one goes into poseWalk() /
  // gait.js — the same code path fourteen shoppers run — and the only thing
  // that makes him HIM is their values. `heavy` is already true for him inside
  // stepLength()/dutyOf(), which is worth 0.82x on the step and +0.035 on the
  // duty; these are what he gets ON TOP of a generic heavy body, because he is
  // heavier than anything in the crowd (girth 1.62 against a roster that tops
  // out near 1.07).
  //
  // MEASURED BEFORE, on the shipped two-sine walk, at his own 2.35 m/s:
  //     cadence 2.477 Hz (4.95 steps a second), step 474 mm, lateral sway 0 mm.
  // A 474 mm step at 2.35 m/s is a hummingbird shuffle and the zero is the
  // brief's single biggest weight cue missing entirely.
  //
  // A shorter step at the SAME ground speed means a HIGHER cadence, not a
  // lower one — that is the counter-intuitive half of a heavy walk and it is
  // why this is a multiplier on the step and never on the clock.
  get copStride()      { return t('copStride', 0.92); },   // x the heavy 0.82
  // ...and it shortens further as he blows. Round 11 had this as
  // `stride = 0.95 - 0.16*F` with the right reason written next to it: "the
  // cadence stays up and the ground stops moving", which is what a knackered
  // man looks like from behind. Same idea, now on the one constant that owns
  // step length instead of on a phase divisor.
  get copStrideTired() { return t('copStrideTired', 0.20); },
  // HIGHER DUTY: more of the cycle with both feet down. A heavy walk has none
  // of the single-support snap a light one has.
  get copDuty()        { return t('copDuty', 0.055); },    // + dutyOf(v, heavy)
  // SMALLER KNEE LIFT: heavy walking is a shuffle, the foot barely clears.
  // Combined with the short step that is the read. The crowd's heavy bodies
  // get gaitLift x gaitLiftHeavy = 0.0465; he gets less again.
  get copLift()        { return t('copLift', 0.040); },
  // ...and less again when he is blown. A shuffle is a foot that stops
  // clearing the floor. Swept for the floor it must not touch: the swing sole's
  // minimum clearance is 37.6 mm fresh and this must not take it to zero.
  get copLiftTired()   { return t('copLiftTired', 0.35); },
  // The pelvis rolls FURTHER as he tires — hip abductors are the first thing to
  // give out, and a Trendelenburg lurch is what that looks like from behind.
  get copListTired()   { return t('copListTired', 0.25); },
  // LESS STANCE-KNEE FLEXION: he is stiffer, and stiffer means the hip has to
  // go OVER the leg rather than through it, which is a DEEPER bob. That is the
  // correct direction and not a bug — see the note over hipOf() in gait.js.
  get copFlex()        { return t('copFlex', 0.012); },
  // MUCH BIGGER LIST AND SWAY. These two are the waddle. The crowd's heaviest
  // build gets listHeavy 0.105 rad and swayHeavy 0.052 m; his mass has to get
  // over each foot and his feet are further apart, so both go up.
  // SWEPT AND CUT BACK, and the sweep is the reason. `copSway` is the amplitude
  // of a tanh that saturates at 0.976, so the peak-to-peak lateral travel of
  // the pelvis is almost exactly 2x this number. Measured on him at 2.35 m/s:
  //     0.030 -> 58.5 mm   0.045 -> 87.8 mm   0.055 -> 107.3 mm   0.068 -> 132.7
  // Normal-weight walking runs 35-45 mm of mediolateral travel and a heavy
  // walker runs about twice that, so 0.068 was out of range for a body rather
  // than merely large. 0.045 sits at the top of the range and is still above
  // the heaviest shopper's IN-GAME figure (swayHeavy 0.052 at their gait
  // engagement of 0.79 is 80 mm), which is the comparison that matters, since
  // he is the only body in the store that walks with `gait` pinned at 1.0.
  // The shipped build before this round measured 0.0 mm: he had a hip ROLL
  // called sway and the pelvis never translated at all.
  get copList()        { return t('copList', 0.132); },    // rad, pelvis lists
  get copSway()        { return t('copSway', 0.045); },    // m, pelvis translates
  get copRoll()        { return t('copRoll', 1.25); },     // trim on both, and on pelvisY
  // WIDER STANCE, as hip ABDUCTION and not as a wider pelvis — see COP_STANCE
  // in figures.js for why the pivots may not move. 0.052 rad on a 0.83 m leg
  // puts each foot 43 mm further out, so his feet are 310 mm apart against
  // 224 mm before.
  get copSplay()       { return t('copSplay', 0.052); },
  // ...and duck-footed. Nobody heavy walks with their feet parallel.
  get copToe()         { return t('copToe', 0.150); },     // rad, per foot
  // COMPLIANCE AT HEEL STRIKE, and it is the one term here that is NOT
  // kinematics. gait.js solves the hip height as rigid geometry — bones and a
  // shoe — which is exactly right and deliberately has no soft tissue in it. A
  // heavy man landing has a few centimetres of knee, heel fat and belt that
  // give way under him and come back. It is applied to the hips AND to the
  // floor the sole is pinned to, in one place, so it cannot unplant a foot;
  // see `o.sink` in poseWalk.
  get copHeelSink()    { return t('copHeelSink', 0.012); },  // m, peak
  // The arms ride out on a bigger splay and swing LESS: they cannot brush a
  // body this wide, so they hang clear of it and the swing goes into the
  // clearance instead. `copArmLag` is a big man's arms being late.
  get copArmSwing()    { return t('copArmSwing', 0.52); },   // x the hip angle
  get copArmOut()      { return t('copArmOut', 0.30); },     // rad at rest
  get copArmLag()      { return t('copArmLag', 0.55); },     // rad behind the legs
  // How hard the leather chases the pelvis, and how much of the difference you
  // see. See the belt block at the bottom of animateCop.
  get copBeltLag()     { return t('copBeltLag', 9.0); },     // 1/s
  get copBeltSwing()   { return t('copBeltSwing', 2.2); },   // x the residual
  // LOCOMOTOR-RESPIRATORY COUPLING: how hard the breath is pulled onto the
  // footfall once he is moving and blown. See the huff block.
  get copBreathLock()  { return t('copBreathLock', 3.0); },  // 1/s of phase pull
  get copBreathPh()    { return t('copBreathPh', 0.55); },   // rad, gasp vs strike
  // ---- ROUND 2 (character): HOW FAST THIS PERSON WALKS --------------------
  // ONE walking speed band, multiplying thiefWalk, read by EVERY state that
  // walks. It replaces three literals that were three different ideas of the
  // same quantity:
  //     walk    K.thiefWalk         1.00   everyone
  //     leave   K.thiefWalk * 1.06  1.06   either population
  //     drift   K.thiefWalk * 1.12  1.12   GUILTY ONLY, post-conceal
  // which made `speed > 1.33` a perfect guilt classifier. See the `leave`/
  // `drift` case for the numbers.
  //
  // COLLAPSING drift ONTO leave WOULD NOT HAVE BEEN ENOUGH, and measuring it
  // is the only reason I know that. With the two door states sharing one
  // constant the per-frame classifier died — max speeds overlapped, zero
  // guilty body-time above the innocent ceiling — but the RATE above 1.33 m/s
  // still read 23.6% guilty against 2.5% innocent, a likelihood ratio of 9.6.
  // The cause is not the constants any more, it is that both door states are
  // faster than the ordinary walk while a thief spends 48% of his pre-bolt life
  // in one of them and an honest shopper 14%. Speed was reporting the STATE,
  // and the state mix is guilt.
  //
  // So there is no purposeful-exit bump left at all. A person walks at his own
  // pace in the aisles, to the door, and away from a shelf he changed his mind
  // about, and the ONLY spread in this store's walking speed is which person
  // it is. That is the strongest available form of the claim: speed cannot
  // carry state, so it cannot carry guilt. The price is real and is named — a
  // shopper heading for the exit no longer picks up 6%, which is a true thing
  // about people that this game cannot afford to model.
  //
  // The band's mean is 1.01, so the crowd's mean walk is within 1% of round
  // 12's and the bench is comparable; its top is the old drift value, so
  // nothing in the store got faster than it already was. Five buckets over
  // fourteen bodies means roughly three people share every pace and no pace is
  // a fingerprint — paceCheck's sibling exitCheck() asserts exactly that.
  get paceLo()        { return t('paceLo', 0.90); },      // x thiefWalk
  get paceHi()        { return t('paceHi', 1.12); },
  get paceN()         { return t('paceN', 5); },          // buckets, so a pace is shared
  // ...and the head. Same band, same person, same argument: a man on his way
  // out of a shop looks around, and how much is a trait. 0.32/0.55 was the
  // innocent's and 0.50/0.80 the thief's.
  get exitLookLo()    { return t('exitLookLo', 0.32); },  // rad of head yaw
  get exitLookHi()    { return t('exitLookHi', 0.50); },
  get exitLookRateLo(){ return t('exitLookRateLo', 0.55); },
  get exitLookRateHi(){ return t('exitLookRateHi', 0.80); },
  // ---- browsing at the shelf ---------------------------------------------
  // WHERE A SHOPPER STANDS. The old wanderTarget picked aisleX +- 1.15 m at
  // random, which is the aisle CENTRE LINE, and the lead measured the
  // consequence: only 2 of 14 bodies were within 1.4 m of a takeable facing at
  // any moment, and the crowd read as a police lineup. Real shoppers close to
  // arm's reach of the fixture and stand parallel to it. 1.05-1.38 m off the
  // centre puts a body against the shelf face in every aisle in this store —
  // measured, the nav's own free edge is 1.46 m in six aisles and 1.02 m in the
  // narrow one, and the retry below finds whichever it is.
  get shelfNear()     { return t('shelfNear', 1.05); },
  get shelfFar()      { return t('shelfFar', 1.38); },
  get shelfOdds()     { return t('shelfOdds', 0.82); }, // P(browse at a shelf face)
  // ---- the reach ----------------------------------------------------------
  // Seconds between reaches for a body that is standing at a shelf. Runs on the
  // rig's idle clock, which no state transition can restart — the same
  // anti-oracle construction round 9 used for the idle pool, and for the same
  // reason: a reach clock that reset on entry to `browse` would tick from zero
  // every time a thief balked.
  // Measured, not chosen: a free-running clock only fires while the body
  // happens to be standing at a shelf, and that duty cycle is 10.3% of body-
  // frames in this store (30.6% browsing x 81.5% parked at a face x 84% not
  // already mid-clip). At 4.5-11 s that came out at one take per body every
  // 75 s, which is a store nobody is shopping in. 2.2-6.0 puts it at roughly
  // one every 20 s per body, i.e. a take somewhere in the building every 1.5 s.
  // The clock is still never restarted by anything; only its rate changed.
  get reachLo()       { return t('reachLo', 2.2); },
  get reachHi()       { return t('reachHi', 6.0); },
  get reachDur()      { return t('reachDur', 3.10); },  // s, the whole sequence
  // The radius handed to world.takeFacing. Measured on the shipped store: the
  // search is grid-local and anything past about one 0.30 m cell ring buys
  // nothing, so this is deliberately small and a miss means "no shelf in front
  // of me", which at this radius is true.
  // Sized off the live store rather than chosen. With the body parked at the
  // nav's own free edge and the arm extended, the facing it is reaching at
  // measures 0.42-0.69 m from the solved hand across every aisle probed; the
  // next thing beyond that is 1.31 m away, which is a body standing opposite a
  // gondola break and SHOULD miss. 0.75 sits in that gap with margin at both
  // ends. (The store's search honours `r` properly as of r12; an earlier clamp
  // at 0.75 made every larger radius a lie, which cost the lead a probe.)
  get grabR()         { return t('grabR', 0.75); },
  // Extra reach past the fingertip, for the item the hand closes ON. It is
  // SMALL on purpose: placeProp puts the visible prop at exactly `armLen`, so
  // anything here is a distance between where the box is drawn and where the
  // shelf was asked for one. At 0.30 the query point sat 300 mm inside the
  // fixture, past the front rank, and the search — which will not return a
  // facing you are behind — came back null in aisles where the body was
  // plainly standing at stock. That is round 5's floating-box bug wearing a
  // different hat: two owners for one position. 0.10 is a fist's depth.
  get grabOut()       { return t('grabOut', 0.10); },
  // P(the thing goes back on the shelf) at the end of a browse reach. NOT a
  // guilt read — see takeAt(). A shopper who picks a box up, reads it and puts
  // it back is the commonest event in a supermarket and it is most of what the
  // gap field is made of.
  // Measured consequence, not a preference: at 0.62 a 2.5-minute shift ended
  // with 4 open gaps, i.e. a store where nothing had been bought. Most reaches
  // in a supermarket end in the trolley, and the ones that do are what makes a
  // bay look shopped an hour into a shift. Guilt-blind either way — it is one
  // constant, hashed the same for every body, and it is not the put-back
  // LR(putback) measures (that one is the PA answer, and it is untouched).
  get reachPut()      { return t('reachPut', 0.45); },
  // ---- ROUND 2 (character): THE FUSE DOES NOT START UNTIL HE HAS SHOPPED ---
  // How many ORDINARY BROWSE-REACHES a body must complete before `concealT` is
  // allowed to burn at all. 0 restores round 12 exactly, which is what the
  // before-column of this round's benches is taken at.
  //
  // This is the fix round 12 identified, measured and correctly declined to
  // ship blind. Its own words: it "moves the bolt and every LR in the file."
  // See the block over the fuse in tick() for what it closed and what it opened.
  //
  // A NOTE ON THE NAME IN THE HANDOVER. Round 12 wrote the fix down as
  // `reachN >= 1`, and `reachN` is not the counter that sentence wants: it
  // counts CLOCK FIRINGS, and the clock fires every 2.2-6.0 s whether or not
  // the body was anywhere near a shelf. Gating on it delays a theft by one
  // reach interval and leaves the take rate where it was — the prose said
  // "complete a browse-reach" and the identifier said "the clock ticked". The
  // counter this reads, `reachDone`, is incremented at the one place in the
  // game that removes a facing, so it means what the sentence meant. Both were
  // benched; the numbers for `reachN` are in this round's report.
  get reachArm()      { return t('reachArm', 1); },
};

// ---------------------------------------------------------------------------
// ROUND 6 — THE RAMP'S ONE PIECE OF STATE, AND ITS ENTRY POINT.
//
// `level` 0..1. Default 1 = round 5's shipped difficulty, so this file behaves
// identically until somebody drives it.
//
// THE ENTRY POINT FOR game.js, which owns shift/rank state:
//     agents.setDifficulty(d)                 // 0..1, idempotent, free to call
//     agents.setDifficulty(a.difficultyForClock(st.clock))    // every frame
//     agents.difficulty                       // read it back
//
// The breakpoints in difficultyForClock() ARE game.js's own PACE breakpoints
// (0 / 150 / 330 s) on purpose. Density and difficulty are deliberately
// different axes — game.js decides how MANY cases are open, this file decides
// how hard one of them is — but they should tighten on the same clock, or the
// shift has two unrelated ramps in it and neither reads as a curve. If game.js
// moves its table, move this one with it.
// ---------------------------------------------------------------------------
const DIFF = { level: 1 };
const dlerp = (easy, hard) => easy + (hard - easy) * DIFF.level;
const RAMP = [
  { at: 0,   level: 0.00 },   // learn the wall against a slow man
  { at: 150, level: 0.50 },
  { at: 330, level: 1.00 },   // round 5's game, in full
];
function difficultyForClock(sec) {
  const s = +sec || 0;
  for (let i = RAMP.length - 1; i >= 0; i--) {
    if (s >= RAMP[i].at) {
      const b = RAMP[i + 1];
      if (!b) return RAMP[i].level;
      const f = clamp((s - RAMP[i].at) / (b.at - RAMP[i].at), 0, 1);
      return RAMP[i].level + (b.level - RAMP[i].level) * f;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// THE INEQUALITY, CHECKED OUT LOUD. A warning comment is what this file had for
// four rounds while a gassed cop holding sprint outran a fresh cop walking, so
// a comment is demonstrably not enough. The relation the whole round rests on:
//
//     gassed-and-holding  <  copWalk        (2.043 < 2.35 as shipped)
//
// If a future tune inverts it, every wind number in this file becomes a lie at
// the same instant and the bench will keep printing confident percentages. So
// it is asserted at startup and re-asserted by bench(), which refuses to report
// a wind comparison without it. Cheap, and it fails in the direction of noise.
// ---------------------------------------------------------------------------
function lungCheck() {
  const walk = K.copWalk;
  const gassedHold = (walk + (T.copRun - walk) * K.gassedSprintMul) * T.gassedPenalty;
  const gassedIdle = walk * T.gassedPenalty;
  const bound = (walk / T.gassedPenalty - walk) / (T.copRun - walk);
  const ok = gassedHold < walk;
  return {
    ok, gassedHold: +gassedHold.toFixed(3), gassedIdle: +gassedIdle.toFixed(3),
    copWalk: walk, gassedSprintMulMax: +bound.toFixed(3),
    gassedSprintMul: K.gassedSprintMul,
    // Seconds of sprint in a tank, and seconds to put it back. Printed together
    // because the ratio is the duty cycle and the duty cycle is the design.
    burst: +(K.staminaMax / K.staminaDrain).toFixed(2),
    refill: +(K.staminaMax / K.staminaRegen).toFixed(2),
    why: ok ? null
      : 'INVERTED: a gassed cop holding sprint is faster than a fresh cop '
        + 'walking, so holding the key is dominant again and every wind number '
        + 'in agents.js is stale. Lower TUNING.gassedSprintMul below '
        + bound.toFixed(3) + ', or raise TUNING.copWalk.',
  };
}
// ROUND 9 (2nd pass) — THE SECOND ASSERTION, and it exists because this round
// shipped the bug it catches for about twenty minutes.
//
// `t` is TUNING-first. So a fallback in the K block is LIVE only while config
// does not carry that key, and the moment the lead promotes one, editing the
// fallback becomes a silent no-op. That is the shadow-block hazard from
// CLAUDE.md with the polarity reversed, and it is harder to see than the
// original: nothing disagrees, the file just stops listening.
//
// The specific failure this catches: `thiefFresh` and `thiefSpent` are the
// man's real cruise at either end of his legs, and `thiefTired` is the BOT'S
// MODEL of it. All three are read through `t`. If somebody promotes thiefFresh
// or thiefSpent into config at a value that puts them out of order — or, as
// happened here, tries to move the man by editing a fallback config already
// owns — the pace curve inverts and the thief gets FASTER as he tires. On the
// bench that reads as a plausible-looking catch rate (62%) and nothing else.
// It cost twenty minutes and an incorrect accusation against a parallel
// builder's rebuild before the control run gave it away.
function paceCheck() {
  const fresh = K.thiefFresh, spent = K.thiefSpent;
  const model = K.thiefRun ? K.botCruise / K.thiefRun : NaN;
  // Bracketed INCLUSIVELY. The shipped build sets thiefSpent to exactly
  // config's thiefTired, so the bot's estimate is dead on a blown man and
  // conservative on a fresh one; `model === spent` is the intended state, not a
  // violation. What must never happen is fresh <= spent (the pace curve
  // inverted, so he speeds up as he tires) or the model landing OUTSIDE the
  // range he actually runs at, which is the bot being handed a free read.
  const ok = spent < fresh && model >= spent && model <= fresh;
  return {
    ok, thiefFresh: +fresh.toFixed(4), thiefSpent: +spent.toFixed(4),
    botModel: +model.toFixed(4),
    freshSpd: +(K.thiefRun * fresh).toFixed(2),
    spentSpd: +(K.thiefRun * spent).toFixed(2),
    modelSpd: +(K.thiefRun * model).toFixed(2),
    legsT: K.thiefLegs,
    why: ok ? null
      : 'INVERTED OR UNBRACKETED: the thief must be fastest with his legs '
        + 'fresh (thiefFresh) and slowest once they are gone (thiefSpent), and '
        + 'the pursuit bot\'s estimate (K.botCruise) must lie '
        + 'within that range or the bench is measuring the bot rather than the '
        + 'game — it is worth 14.5 points, see thiefFreshMul. Got fresh='
        + fresh + ' spent=' + spent + ' model=' + model + '. NOTE: editing the '
        + 'fallback for a key config.js already carries does nothing — `t` is '
        + 'TUNING-first. Move it in config.js or via agents.override.',
  };
}
{
  const L = lungCheck();
  if (!L.ok && typeof console !== 'undefined') console.warn('[agents] lung', L);
  const P = paceCheck();
  if (!P.ok && typeof console !== 'undefined') console.warn('[agents] pace', P);
}

// main.js maps KeyW -> input.z = -1, but its floor camera sits at cop.z - 7.6
// looking toward +Z, so +Z is "up the screen". Flip here so W runs away from
// the camera instead of into it.
const FWD_SIGN = -1;

// ROUND 12 — module scratch. One object each, reused by every body every frame,
// because 25 bodies x 60 Hz is 1,500 allocations a second for nothing.
//   _G  what gait.js solves into
//   _P  a pose object shaped like applyGesture's output, so a body CARRYING an
//       item can place it through the same placeProp() a clip does
const _G = {
  thR: 0, thL: 0, drop: 0, kneeR: 1, kneeL: 1, ankR: 0, ankL: 0,
  list: 0, pelvisY: 0, sway: 0, stanceR: true, stanceL: false, clearR: 0, clearL: 0,
  flexR: 0, flexL: 0,
};
const ONE3 = [1, 1, 1];
const _P = { armR: 0, armRz: 0, off: [0, 0, 0], item: ONE3 };
const BODY_R = 0.42;          // agent collision radius
const CART_R = 0.34;
// ROUND 10 — A CHILD'S. Deliberately much smaller than BODY_R, and not for
// gameplay reasons: BODY_R is a shoulder-room pad for a body that has to squeeze
// PAST other bodies, and a child never does that. What this radius has to be is
// the half-width of the mesh, so the thing that stopped clipping is the thing
// you can see: the widest part of a child rig is the pot belly at rx 0.112 on a
// 0.86-1.12 scale, i.e. 0.096-0.125 m, plus a shoe box 0.066 wide swinging at
// the end of a leg. 0.24 clears both with room for the weave and still lets a
// kid stand at a shelf lip next to a parent instead of hovering half a metre
// off it. See kidClamp().
const KID_R = 0.24;
const HALF_LEN = AISLE_LEN / 2;
const LANE_HALF = AISLE_GAP / 2;
// How far off the lane centreline a body can actually get. AISLE_GAP 4.0 gives a
// 2.0 m half-lane; take the body radius off it and there is 1.58 m. Every
// "can he get past?" number in this file is measured against THIS, not against
// AISLE_GAP — round 2 used an avoid radius of 1.80 m, which is wider than the
// lane, so a cop standing in an aisle corked it completely and the thief had no
// move except to run into him.
const LANE_FREE = LANE_HALF - BODY_R;   // 1.58 m
const AISLE_PITCH = AISLE_GAP + SHELF_W;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Deterministic RNG so bench() is repeatable.
let _seed = 0x9e3779b9;
function setSeed(s) { _seed = (s >>> 0) || 1; }
// READ-ONLY, and it consumes nothing. Round 12 needs a per-trial constant that
// is the same every time a trial is run and is not a draw off the stream — see
// the reach re-phase in reset(), and this file's header on what taking one
// extra draw costs.
function currentSeed() { return _seed >>> 0; }
function rnd() {
  _seed |= 0; _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
// ROUND 12 — a deterministic 0..1 off two integers, and the reason it exists is
// the seeded stream rather than tidiness. rnd() is SHARED: every draw taken from
// it shifts every subsequent decision in the building, and this file's header
// records that costing a measured 5 points of compliance and moving a published
// likelihood ratio from 1.95 to 2.33 in a change that touched no probability at
// all. The reach schedules itself off (body id, reach number) instead, so a
// whole new behaviour on every body in the store takes ZERO draws and the bench
// can be compared like for like. Same mix as store.js's, kept local.
function hash2(a, b) {
  let h = ((a | 0) ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h ^ (b | 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + rnd() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

// ---------------------------------------------------------------------------
// NAVIGATION — see ./agents/nav.js. The route comes off the real collider set,
// not off the floor plan, because the store puts furniture in the lanes.
// ---------------------------------------------------------------------------
const AISLE_PITCH_ = AISLE_PITCH;
function aisleOf(x) {
  return clamp(Math.round(x / AISLE_PITCH_ + (AISLE_COUNT - 1) / 2), 0, AISLE_COUNT - 1);
}
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// ---------------------------------------------------------------------------
// COLLISION — push a circle out of the store's Box3 colliders. Uniform-grid
// broadphase so a shelf-packed store with hundreds of boxes stays cheap.
// ---------------------------------------------------------------------------
function makeSolids(world) {
  const src = (world && world.colliders) || [];
  const boxes = [];
  for (const b of src) {
    if (!b || !b.min || !b.max) continue;
    if (b.min.y > 1.55) continue;             // hanging signs, lights — walk under
    if (b.max.y < 0.16) continue;             // floor decals
    boxes.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z });
  }
  const CELL = 3.0;
  const grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
  boxes.forEach((b, idx) => {
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = key(cx, cz);
      let a = grid.get(k); if (!a) grid.set(k, a = []);
      a.push(idx);
    }
  });
  return {
    count: src.length, boxes,
    resolve(p, r) {
      const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      for (let ax = cx - 1; ax <= cx + 1; ax++) for (let az = cz - 1; az <= cz + 1; az++) {
        const a = grid.get(key(ax, az)); if (!a) continue;
        for (const idx of a) {
          const b = boxes[idx];
          const nx = clamp(p.x, b.x0, b.x1), nz = clamp(p.z, b.z0, b.z1);
          let dx = p.x - nx, dz = p.z - nz;
          const d = Math.hypot(dx, dz);
          if (d > r) continue;
          if (d < 1e-5) {           // dead centre: eject along the shallow axis
            const px = Math.min(p.x - b.x0, b.x1 - p.x);
            const pz = Math.min(p.z - b.z0, b.z1 - p.z);
            if (px < pz) p.x += (p.x - (b.x0 + b.x1) / 2 > 0 ? 1 : -1) * (px + r);
            else p.z += (p.z - (b.z0 + b.z1) / 2 > 0 ? 1 : -1) * (pz + r);
            continue;
          }
          const push = (r - d) / d;
          p.x += dx * push; p.z += dz * push;
        }
      }
      p.x = clamp(p.x, STORE.minX + 0.6, STORE.maxX - 0.6);
      p.z = clamp(p.z, STORE.minZ + 0.35, STORE.maxZ - 0.6);
    },
  };
}

// ---------------------------------------------------------------------------
// MESHES
// ---------------------------------------------------------------------------
// Palettes (SKIN/HAIR/CLOTH/PANTS) live in agents/figures.js now, next to the
// figures that wear them, and are re-exported here by import.

// ---------------------------------------------------------------------------
// GEOMETRY BAKING. A real supermarket trolley is about a hundred thin wires you
// see straight through to the floor, and the round-3 build shipped it as a solid
// grey box on four cube wheels — the blind critic's exact words, and the eye
// goes to the carts and the people before it goes to anything else in the
// frame. A hundred wires as a hundred meshes is a hundred draw calls per cart
// and there are fourteen carts on the floor, so the lattice is baked into ONE
// buffer at startup and shared by every cart: a cart is now seven draw calls,
// which is three FEWER than the grey box it replaces.
// ---------------------------------------------------------------------------
// mergeParts() moved to agents/figures.js — same function, plus an optional
// per-part UV remap so the cop can run off one atlas. Imported above.

// A square-section wire between two points. Round wire at this scale is four
// extra triangles per strut for nothing you can see.
function makeWirer(THREE) {
  const BOX = new THREE.BoxGeometry(1, 1, 1);
  const UP = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const q = new THREE.Quaternion();
  return (list, a, b, r, c) => {
    d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const len = d.length() || 1e-4; d.divideScalar(len);
    q.setFromUnitVectors(UP, d);
    p.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    s.set(r * 2, len, r * 2);
    list.push({ g: BOX, m: new THREE.Matrix4().compose(p, q, s), c });
  };
}

// The trolley. Local +Z is the direction of travel, the handle is at -Z.
// Nesting taper in BOTH plan and elevation, which is the shape that makes a
// wire basket read as a wire basket from across a store: the sides splay out
// and up, so the lattice never looks like a box someone drew lines on.
function buildCartGeo(THREE) {
  const wire = makeWirer(THREE);
  const W = [];                                       // the chrome lattice
  const ZB = -0.30, ZF = 0.36, YT = 0.80, YB = 0.50;
  const halfTop = (t) => 0.300 - 0.030 * t;
  const halfBot = (t) => 0.215 - 0.022 * t;
  const zTop = (t) => ZB + (ZF - ZB) * t;
  const zBot = (t) => (ZB + 0.055) + ((ZF - 0.055) - (ZB + 0.055)) * t;
  const top = (s, t) => [s * halfTop(t), YT, zTop(t)];
  const bot = (s, t) => [s * halfBot(t), YB, zBot(t)];
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

  for (const s of [-1, 1]) {
    for (let i = 0; i <= 13; i++) {                   // close-pitch verticals
      const t = i / 13;
      wire(W, bot(s, t), top(s, t), 0.0072);
    }
    for (const f of [0.16, 0.46, 0.74]) {             // horizontal rails
      wire(W, mix(bot(s, 0), top(s, 0), f), mix(bot(s, 1), top(s, 1), f), 0.0082);
    }
    wire(W, bot(s, 0), bot(s, 1), 0.0105);            // bottom edge rail
    wire(W, top(s, 0), top(s, 1), 0.0125);            // top rim, side
  }
  for (const t of [0, 1]) {                           // front and back panels
    const n = t ? 7 : 8;
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      wire(W, [(-1 + 2 * u) * halfBot(t), YB, zBot(t)],
             [(-1 + 2 * u) * halfTop(t), YT, zTop(t)], 0.0072);
    }
    for (const f of [0.30, 0.66]) {
      const a = mix(bot(-1, t), top(-1, t), f), b = mix(bot(1, t), top(1, t), f);
      wire(W, a, b, 0.0082);
    }
    wire(W, top(-1, t), top(1, t), 0.0125);           // rim, end
    wire(W, bot(-1, t), bot(1, t), 0.0105);
  }
  for (let i = 0; i <= 8; i++) {                      // basket floor, longitudinal
    const u = i / 8;
    wire(W, [(-1 + 2 * u) * halfBot(0), YB, zBot(0)],
           [(-1 + 2 * u) * halfBot(1), YB, zBot(1)], 0.0068);
  }
  for (let i = 0; i <= 6; i++) {                      // basket floor, transverse
    const t = i / 6;
    wire(W, bot(-1, t), bot(1, t), 0.0068);
  }
  // chassis: legs down to the caster mounts, rails, and the under-basket rack
  const LY = 0.145;
  for (const s of [-1, 1]) for (const t of [0.06, 0.94]) {
    wire(W, [s * halfBot(t), YB, zBot(t)], [s * 0.205, LY, zBot(t)], 0.0135);
  }
  for (const s of [-1, 1]) wire(W, [s * 0.205, LY, zBot(0.06)], [s * 0.205, LY, zBot(0.94)], 0.0125);
  wire(W, [-0.205, LY, zBot(0.06)], [0.205, LY, zBot(0.06)], 0.0115);
  wire(W, [-0.205, LY, zBot(0.94)], [0.205, LY, zBot(0.94)], 0.0115);
  for (let i = 0; i <= 6; i++) {                      // lower rack
    const u = i / 6;
    wire(W, [(-1 + 2 * u) * 0.195, LY + 0.012, zBot(0.06)],
           [(-1 + 2 * u) * 0.195, LY + 0.012, zBot(0.94)], 0.0062);
  }
  for (let i = 0; i <= 4; i++) {
    const t = 0.06 + (0.88 * i) / 4;
    wire(W, [-0.195, LY + 0.012, zBot(t)], [0.195, LY + 0.012, zBot(t)], 0.0062);
  }
  // handle posts (steel); the grip itself is plastic and lives below
  for (const s of [-1, 1]) wire(W, top(s, 0), [s * 0.255, 0.925, ZB - 0.075], 0.0115);

  // --- coloured plastic: the grip bar and the child-seat flap ---------------
  const P = [];
  const grip = new THREE.CylinderGeometry(0.021, 0.021, 0.52, 10);
  P.push({
    g: grip,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.925, ZB - 0.075),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)),
  });
  const pan = new THREE.BoxGeometry(0.34, 0.020, 0.155);
  P.push({
    g: pan,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.596, ZB + 0.115),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.13),
      new THREE.Vector3(1, 1, 1)),
  });
  const rest = new THREE.BoxGeometry(0.34, 0.135, 0.018);
  P.push({
    g: rest,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.655, ZB + 0.032),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.16),
      new THREE.Vector3(1, 1, 1)),
  });

  // --- one swivel caster: fork, axle, rubber tyre ---------------------------
  const C = [];
  const STEEL = 0x8f959c, RUBBER = 0x2b2c30;
  const plate = new THREE.BoxGeometry(0.011, 0.075, 0.055);
  for (const s of [-1, 1]) {
    C.push({ g: plate, c: STEEL,
      m: new THREE.Matrix4().makeTranslation(s * 0.030, 0.072, 0.006) });
  }
  C.push({ g: new THREE.BoxGeometry(0.072, 0.014, 0.062), c: STEEL,
    m: new THREE.Matrix4().makeTranslation(0, 0.108, 0.004) });
  C.push({ g: new THREE.CylinderGeometry(0.013, 0.013, 0.048, 8), c: STEEL,
    m: new THREE.Matrix4().makeTranslation(0, 0.134, -0.014) });
  C.push({
    g: new THREE.CylinderGeometry(0.043, 0.043, 0.030, 12), c: RUBBER,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.043, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)),
  });
  C.push({
    g: new THREE.CylinderGeometry(0.020, 0.020, 0.034, 8), c: 0xb6bcc2,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, 0.043, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)),
  });

  // --- what is actually IN the basket. Four loads so the floor is not one
  // repeated silhouette; a shopped cart is uneven and half-full.
  const GROC = [0xd8d2c4, 0xb8452f, 0x2f5f8a, 0xe0b13c, 0x74914f, 0xf0e6d2, 0x8a5a3c, 0xcf6f2c];
  const loads = [];
  let lseed = 7;
  const lr = () => ((lseed = (lseed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let v = 0; v < 4; v++) {
    const L = [];
    const n = 3 + Math.floor(lr() * 4);
    for (let i = 0; i < n; i++) {
      const w = 0.07 + lr() * 0.10, h = 0.09 + lr() * 0.13, dp = 0.06 + lr() * 0.09;
      L.push({
        g: new THREE.BoxGeometry(w, h, dp),
        c: GROC[Math.floor(lr() * GROC.length)],
        m: new THREE.Matrix4().compose(
          new THREE.Vector3((lr() - 0.5) * 0.34, YB + h / 2 - 0.01, ZB + 0.10 + lr() * 0.46),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (lr() - 0.5) * 1.1),
          new THREE.Vector3(1, 1, 1)),
      });
    }
    loads.push(mergeParts(THREE, L));
  }
  return {
    wire: mergeParts(THREE, W),
    plastic: mergeParts(THREE, P),
    caster: mergeParts(THREE, C),
    loads,
  };
}

// A printed label. Cheap, and it is what stops the powerup reading as a
// placeholder: the thing you grab has words on it like everything else does.
function labelTex(THREE, draw, w = 128, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace ?? t.colorSpace;
  t.anisotropy = 4; t.needsUpdate = true;
  return t;
}

// clothAtlas() and legGeo() moved to agents/figures.js.

function buildGeo(THREE) {
  const cart = buildCartGeo(THREE);
  // The human half of this bundle (torso/head/hair/limb/arm/hand/belly/cap/
  // brim/belt/cloth) is gone: figures.js bakes a whole library of bodies now,
  // and it is spread over `F` below. What is left here is everything a person
  // is not.
  return {
    goods: new THREE.BoxGeometry(0.15, 0.18, 0.11),
    ring: new THREE.RingGeometry(0.42, 0.60, 20),
    cart,
    // Chrome with no environment map is black, so this is metalness that keeps
    // half its diffuse: it takes a hard specular off the ceiling troffers and
    // still reads as a bright object in the aisle rather than a silhouette.
    matChrome: new THREE.MeshStandardMaterial({
      color: 0xe4e8ec, roughness: 0.29, metalness: 0.34,
    }),
    matPlastic: [0xb8352c, 0x2f5c9e, 0x3f6b46, 0x2b2d33].map((c) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.44 })),
    matCaster: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.28 }),
    matLoad: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84 }),
  };
}

// makePerson() moved to agents/figures.js, along with makeCop(), which is new.
// The rig contract they both return gained ONE joint — `chest`, between the
// hips and everything above them — and that joint is most of why the walk now
// reads as a walk: hips carry the legs and the waddle, chest carries the torso,
// arms and head and counter-rotates against it. It is also where the winded
// heave lives. See animateCop().

function makeCart(THREE, G) {
  const g = new THREE.Group();
  const wire = new THREE.Mesh(G.cart.wire, G.matChrome);
  wire.castShadow = true; g.add(wire);
  const plastic = new THREE.Mesh(G.cart.plastic, pick(G.matPlastic));
  plastic.castShadow = true; g.add(plastic);
  // Four swivel casters, each pointing its own way. A parked trolley never has
  // its wheels lined up and that is most of why the old four-cube-wheels version
  // read as furniture instead of as a cart.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const c = new THREE.Mesh(G.cart.caster, G.matCaster);
    c.position.set(sx * 0.205, 0, sz > 0 ? 0.300 : -0.245);
    c.rotation.y = rr(-1.1, 1.1) + (sz > 0 ? 0 : Math.PI);
    g.add(c);
  }
  if (rnd() < 0.78) {
    const load = new THREE.Mesh(pick(G.cart.loads), G.matLoad);
    load.castShadow = true; g.add(load);
  }
  return g;
}

// ---------------------------------------------------------------------------
// THE POWERUPS. Round 3 left the thing you actually grab as an emissive box on
// a stick sitting on top of merchandise the store builder had already made
// real, and a blind critic ended a test on it. They are objects now: a bakery
// clamshell with six donuts in it, and a printed energy can with a pull tab.
// Lit by the same lights as everything else — the only concession to finding
// one at a dead run is a backface rim shell, which is a real shape hugging a
// real object, not a flat quad hovering over it.
// ---------------------------------------------------------------------------
function buildPowerupProps(THREE) {
  const donutTop = labelTex(THREE, (x, w, h) => {
    x.fillStyle = '#f2a8c4'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e07ba4'; x.fillRect(0, h * 0.34, w, h * 0.10);
    x.fillStyle = '#fdf2f6'; x.fillRect(0, h * 0.44, w, h * 0.02);
    x.fillStyle = '#7c2b46'; x.font = 'bold 25px sans-serif'; x.textAlign = 'center';
    x.fillText('DONUTS', w / 2, h * 0.28);
    x.font = 'bold 12px sans-serif'; x.fillStyle = '#9c4463';
    x.fillText('BAKED FRESH DAILY', w / 2, h * 0.60);
    x.fillStyle = '#8a3a55';
    for (let i = 0; i < 12; i++) x.fillRect(w * 0.22 + i * 6, h * 0.72, 2 + (i % 3), h * 0.14);
  });
  const canLabel = labelTex(THREE, (x, w, h) => {
    x.fillStyle = '#12301a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#5fe04f';
    x.beginPath(); x.moveTo(0, h * 0.30); x.lineTo(w, h * 0.14);
    x.lineTo(w, h * 0.40); x.lineTo(0, h * 0.56); x.closePath(); x.fill();
    x.fillStyle = '#0b1f10'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center';
    x.save(); x.translate(w / 2, h * 0.40); x.rotate(-0.13);
    x.fillText('VOLT', 0, 0); x.restore();
    x.fillStyle = '#cfeec6'; x.font = 'bold 11px sans-serif';
    x.fillText('ENERGY  ·  500ml', w / 2, h * 0.70);
    x.fillStyle = '#5fe04f'; x.fillRect(w * 0.30, h * 0.78, w * 0.40, 3);
  }, 128, 96);

  // --- donuts: an open clamshell with product in it -------------------------
  const boxParts = [], sugarParts = [];
  const BW = 0.25, BD = 0.20, BH = 0.062;
  const board = 0xf3ece0;
  boxParts.push({ g: new THREE.BoxGeometry(BW, 0.008, BD), c: board,
    m: new THREE.Matrix4().makeTranslation(0, -0.030, 0) });
  for (const s of [-1, 1]) {
    boxParts.push({ g: new THREE.BoxGeometry(0.009, BH, BD), c: board,
      m: new THREE.Matrix4().makeTranslation(s * BW / 2, 0, 0) });
    boxParts.push({ g: new THREE.BoxGeometry(BW, BH, 0.009), c: board,
      m: new THREE.Matrix4().makeTranslation(0, 0, s * BD / 2) });
  }
  // The lid is hinged open and folded back, printed face up. The floor camera
  // sits at 6.4 m looking down at about thirty degrees, so up IS toward the
  // player: stand the lid vertical and he sees the back of a card, lay it back
  // and he can read the box. It also stops it masking the donuts, which are the
  // actual reason to notice the thing.
  const lid = new THREE.PlaneGeometry(BW, BD * 0.94);
  const lidM = new THREE.Matrix4().compose(
    new THREE.Vector3(0, 0.052, -BD / 2 - 0.058),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -1.06),
    new THREE.Vector3(1, 1, 1));
  const GLAZE = [0x6b3d22, 0xefa2bf, 0xf0d9a0, 0x8d5a2f, 0xe8c15a, 0xd8687f];
  let i = 0;
  for (const gx of [-1, 0, 1]) for (const gz of [-1, 1]) {
    sugarParts.push({
      g: new THREE.TorusGeometry(0.035, 0.0155, 6, 14), c: GLAZE[i++ % GLAZE.length],
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(gx * 0.077, -0.010, gz * 0.048),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
        new THREE.Vector3(1, 1, 1)),
    });
  }
  for (let k = 0; k < 14; k++) {                     // sprinkles
    const a = (k / 14) * Math.PI * 2;
    sugarParts.push({
      g: new THREE.BoxGeometry(0.008, 0.004, 0.004), c: k % 2 ? 0xffe14d : 0x4fc9f0,
      m: new THREE.Matrix4().compose(
        new THREE.Vector3(-0.077 + Math.cos(a) * 0.031, 0.005, -0.048 + Math.sin(a) * 0.031),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a),
        new THREE.Vector3(1, 1, 1)),
    });
  }

  // --- can: tapered aluminium body, printed label, pull tab -----------------
  const R = 0.041, CH = 0.150;
  const canEnds = [];
  canEnds.push({ g: new THREE.CylinderGeometry(R * 0.80, R, 0.020, 16), c: 0xc8ccd2,
    m: new THREE.Matrix4().makeTranslation(0, CH / 2 + 0.008, 0) });
  canEnds.push({ g: new THREE.CylinderGeometry(R * 0.80, R * 0.80, 0.008, 16), c: 0xdfe3e8,
    m: new THREE.Matrix4().makeTranslation(0, CH / 2 + 0.021, 0) });
  canEnds.push({ g: new THREE.TorusGeometry(R * 0.80, 0.004, 5, 16), c: 0xb9bec6,
    m: new THREE.Matrix4().compose(
      new THREE.Vector3(0, CH / 2 + 0.025, 0),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2),
      new THREE.Vector3(1, 1, 1)) });
  canEnds.push({ g: new THREE.BoxGeometry(0.030, 0.003, 0.016), c: 0xa9aeb6,
    m: new THREE.Matrix4().makeTranslation(0.008, CH / 2 + 0.028, 0) });
  canEnds.push({ g: new THREE.CylinderGeometry(R * 0.86, R, 0.016, 16), c: 0xc8ccd2,
    m: new THREE.Matrix4().makeTranslation(0, -CH / 2 - 0.006, 0) });

  return {
    donuts: {
      body: mergeParts(THREE, boxParts),
      lid, lidM,
      extra: mergeParts(THREE, sugarParts),
      tex: donutTop,
      // ROUND 9 — `rim` IS NOW THE OBJECT'S OWN GEOMETRY. See the note at the
      // halo in buildPowerups: this used to be a BoxGeometry 30 mm proud of the
      // clamshell in x and z and ONE HUNDRED MILLIMETRES proud in y, on a box
      // that is 62 mm tall. It was 2.6x the height of the thing it was supposed
      // to be hugging, so it was not a rim, it was a magenta prism hanging in
      // the air around a bakery box, and two blind critics six rounds apart both
      // ended a test on it.
      rim: null,                      // filled in below: the body, backfaced
      rimScale: 1.11,
      rimY: 0.004,
      // ...and it is not magenta any more either. 0xf07fae is within a few
      // points of the missing-texture colour every engine on earth ships, so
      // even hugging the object it would have read as a broken material to
      // anybody who has ever seen one. Warm amber reads as LIGHT, which is what
      // a rim light is, and it is still nothing like the can's green.
      glow: 0xffb347,
    },
    energy: {
      body: new THREE.CylinderGeometry(R, R, CH, 18, 1, true),
      extra: mergeParts(THREE, canEnds),
      tex: canLabel,
      // The can's shell was always close to its silhouette — R+12 mm on a 41 mm
      // radius — which is why nobody ever complained about the GREEN one. It is
      // still tightened here, and moved onto the same scale-the-body scheme so
      // there is one way of doing this rather than two.
      rim: null,
      rimScale: 1.10,
      rimY: 0,
      glow: 0x63e05a,
    },
    matBoard: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86 }),
    matSugar: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.52 }),
    matAlu: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.62 }),
  };
}

function angerTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#d8342a'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 46px sans-serif'; x.textAlign = 'center';
  x.fillText('!', 32, 49);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

// ===========================================================================
export function createAgents(THREE, scene, world) {
  world = world || {};
  const G = buildGeo(THREE);
  const F = buildFigureGeo(THREE);      // every body in the store, baked once
  const PW = buildPowerupProps(THREE);
  let solids = makeSolids(world);
  let solidCount = solids.count;
  // One grid, one flood-fill out from the doors. Every thief in the store
  // shares it, and it only gets rebuilt when the store itself changes.
  const buildNav = () => makeNav(solids.boxes, STORE, {
    cell: 0.42, pad: BODY_R + 0.10, hug: K.navHug,
    walkMinX: STORE.minX + 0.6, walkMaxX: STORE.maxX - 0.6,
    walkMinZ: STORE.minZ + 0.35, walkMaxZ: STORE.maxZ - 0.6,
  });
  let nav = buildNav();

  // ---- WAYS OUT ------------------------------------------------------------
  // ROUND 4. There used to be exactly one door, and that one fact was quietly
  // the biggest problem in the game. A bot that ignores the dispatch entirely,
  // walks to Door 1 and stands on it scores 80.7% / 67.3% at wrong-aisle +/-1
  // and +/-2, against 60.0% / 47.3% for a bot that actually goes and chases the
  // man. The aisle number — the single thing the whole desk phase exists to make
  // the player read — was worth about four points, and the dominant strategy was
  // to throw the dispatch away and guard the only hole in the building.
  //
  // You cannot fix that with movement constants. One door means the thief's
  // destination is public knowledge, and public knowledge beats a scouting
  // report every time. So: TWO doors, both on the front wall, thirty-five metres
  // apart — Door 1 in the front-left corner where the glazing already is, and
  // Door 2 down at the service-desk end of the checkout run. Now:
  //   - camping is a coin flip you mostly lose, because the escape flood has the
  //     cop priced into it and a cop standing on one door simply makes the other
  //     one cheaper. Guarding a door is now the thing that sends him to the
  //     other door;
  //   - being NEAR HIM is the only position that covers both, and the aisle
  //     number is the only thing that puts you near him. The dispatch is worth
  //     something again, which is the entire point of the desk;
  //   - the front cross-aisle becomes the real ground to hold, not one corner.
  // Both doors stay on the front wall on purpose: a back door would make half
  // the store's dispatches a straight footrace away from the checkouts and would
  // have made game.js's door-alarm countdown a lie.
  //
  // `shove` is the second half of it — see updateShopper's 'shove' state. You do
  // not teleport through a door at a dead run; you hit it, and for a beat you are
  // a stationary man with his shoulder on a push-bar. That beat is what makes a
  // chase to the doors contestable instead of decided ten metres out.
  // ---- A TRAP FOR WHOEVER TUNES `doorShove` NEXT ---------------------------
  // ROUND 9 (2nd pass), FOUND WHILE LOOKING FOR SOMETHING ELSE, NOT FIXED HERE.
  // `shoveMul` was right in a two-door store: Door 1 is the customer entrance
  // with automatic leaves (0.35) and Door 2 is the staff end with a push-bar
  // (1.00), and K.doorShove was tuned as the push-bar number — its own comment
  // says "sec at the staff-end door". Round 6 then made Door 1 THE ONLY WAY
  // OUT. So the beat at the only door a thief may use is 0.85 x 0.35 = 0.30 s,
  // and config.js's `doorShove: 0.85` is a number that has not described
  // anything since round 6. It is the shadow-block hazard in a different
  // costume: a value that looks live, is live, and means 35% of what it says.
  //
  // It is left at 0.30 s DELIBERATELY. Lengthening it makes the game easier for
  // everybody, and this round needed the opposite; the door is also no longer
  // where the drink has to pay, because with the bot fix the escapes now land
  // at a median 1.70 m and lengthening the beat would simply convert near
  // misses into catches. But the effective per-door value is now printed on
  // every bench result (`doorShoveEff`) so it cannot hide again, and if the
  // lead ever wants config's number to mean what it says, the honest edit is
  // `doorShove: 0.30` with door1 at 1.00 and door2 at 2.85 — same game, no
  // decorative constant.
  const EXIT_SPEC = [
    { id: 'door1', label: 'DOOR 1', x: EXIT.x, z: EXIT.z, shoveMul: 0.35, sign: 0x8ef07a },
    // ROUND 5 — this was `SERVICE_DESK.x - 5.4`, my own guess at where a second
    // door could go before there was one in config. The lead has since put
    // EXIT2 in config.js and src/store.js builds its storefront off it, so the
    // guess comes out: one source of truth, and the collider the thief shoves
    // through is the glass he can see.
    { id: 'door2', label: 'DOOR 2', x: EXIT2.x, z: EXIT2.z, shoveMul: 1.0, sign: 0x8ef07a },
  ];
  // A THIRD door was built, measured and thrown away, and the numbers are here
  // so nobody spends the afternoon rebuilding it. A fire exit at x=-2.5 gave, at
  // n=200, competent bot / door-camper on the right aisle:
  //   1 door  52.7% / 91.3%   camping is the game
  //   2 doors 79.5% / 22.5%   chasing is the game, by 57 points
  //   3 doors 66.0% / 28.0%   chasing is still the game, by 38
  // Three ways out makes every dispatch harder without making the aisle number
  // worth more — the misaim spread is the same 21 points either way, because a
  // third exit does not help you cover the other two. It is 13 points of
  // difficulty for no design gain, so the store has two doors.
  // Snap each door onto ground a body can actually stand on, and drop any the
  // store has walled off this rebuild — src/store.js is rebuilt in parallel and
  // the collider set moves under us. If only Door 1 survives, everything below
  // degrades to exactly the old single-exit behaviour.
  let EXITS = [];
  let exitFs = [];      // one static flood per door
  let exitF = null;     // static flood from ALL doors: metres of route to the nearest way out
  // Attribution switch: run the store with only the first `doorLimit` doors, so
  // round 4's changes can be measured one at a time instead of asserted as a
  // bundle. 1 = the old single-exit store.
  //
  // ROUND 6 — AND IT IS 1 NOW, ON THE CLIENT'S ASK. Door 2 is still built by
  // src/store.js and still stands there; it is the way IN. Only Door 1 is a way
  // out, so the whole store drains through one hole and you always know where
  // he is going. See the K block above for what pays for that. `useDoors(2)`
  // reproduces round 4/5 exactly and every ablation in this round's report was
  // taken by flipping it.
  //
  // ROUND 8 — CONFIG NOW MAPS ONE CHANNEL PER AISLE. CAM 01..08 are AISLE 1..8
  // and CAM 09 is DOOR 1, the only way out. The round-6 note that used to sit
  // here said CAMERAS[8] was 'DOOR 2' and that is no longer true of anything:
  // there is no camera on the entrance any more, which is correct, because a
  // camera whose whole job is to watch a door nobody may leave by is a channel
  // spent on nothing. Nothing in THIS file reads a camera id or a label — the
  // aisle a subject is in comes from aisleOf(x) off config's own aisleX(), so
  // the renumbering is a no-op here and is recorded only so the next person
  // does not go looking for the two-aisles-per-channel assumption.
  //
  // STILL OPEN, and still not mine: config's EXIT2 remains the way IN, and
  // store.js paints a lit EXIT box over it. That is the one thing about the
  // one-exit store that would read as a bug to a player (ENTRANCE / NO EXIT /
  // IN).
  let doorLimit = 1;
  function buildExits() {
    const probe = nav.field(EXIT.x, EXIT.z);
    EXITS = [];
    for (const sp of EXIT_SPEC.slice(0, doorLimit)) {
      let bx = sp.x, bz = sp.z, ok = false;
      for (let r = 0; r <= 8 && !ok; r++) {
        for (let a = 0; a < (r ? 12 : 1) && !ok; a++) {
          const th = (a / 12) * Math.PI * 2;
          const x = clamp(sp.x + Math.cos(th) * r * 0.55, STORE.minX + 1, STORE.maxX - 1);
          const z = clamp(sp.z + Math.abs(Math.sin(th)) * r * 0.55, STORE.minZ + 0.5, STORE.maxZ - 1);
          if (nav.free(x, z) && nav.reachable(probe, x, z)) { bx = x; bz = z; ok = true; }
        }
      }
      if (!ok && EXITS.length) continue;                 // walled off this rebuild
      EXITS.push({ ...sp, x: bx, z: bz, shove: K.doorShove * sp.shoveMul });
    }
    exitFs = EXITS.map((e) => nav.field(e.x, e.z));
    exitF = nav.field(EXITS.map((e) => ({ x: e.x, z: e.z, cost: 0 })));
  }
  const toExit = (x, z) => nav.at(exitF, x, z);          // metres of route left
  const canReachExit = (x, z) => nav.reachable(exitF, x, z);
  // Which door is this man actually heading for. game.js wants it for the alarm
  // countdown, which used to measure everyone against Door 1 whether or not that
  // was the door they were walking at.
  function exitOf(x, z) {
    let best = 0, bd = Infinity;
    for (let e = 0; e < exitFs.length; e++) {
      const d = nav.at(exitFs[e], x, z);
      if (d < bd) { bd = d; best = e; }
    }
    return { i: best, exit: EXITS[best], dist: bd };
  }

  // ROUND 5 — THE PLACEHOLDER IS GONE. Round 4 drew a lit EXIT box and a pair
  // of push-bar leaves at Door 2, because the second exit was mine, it decided
  // 60% of chases, and there was nothing there to see. src/store.js now builds
  // a real storefront at both doors off config's EXIT/EXIT2 — glazing, decals,
  // bollards and its own lit EXIT box — so a chase builder drawing architecture
  // is exactly the duplicate geometry it looks like. Deleted, on the store
  // builder's own note that it matched the placeholder and could come out.
  buildExits();

  // ---- the escape field ----------------------------------------------------
  // Same flood, from the same doors, with the cop priced in. A thief who is
  // running reads THIS one, so "out the back, along the rear cross-aisle and
  // down another aisle" is a route the search can actually return — it was
  // never available before, because the cop only ever existed as a filter on
  // the aim point of a descent that had already been computed without him.
  //
  // One field, shared by every runner in the store (they are all avoiding the
  // same man), rebuilt on a timer or when he moves, and only while somebody is
  // actually running. A flood costs ~2 ms on this 114x91 grid, so it is metered
  // hard: ~4.5 rebuilds a second during a chase, none at all otherwise. Measured
  // in the live loop, agents.update() is 0.20 ms mean / 2.0 ms p95 and a whole
  // step() including the render submit is 0.6 ms median, 4.7 ms worst — the
  // worst frame in a chase is still under a third of the 16.7 ms budget.
  let fleeF = null, fleeBuf = null, fleeT = 0, fleeCx = 1e9, fleeCz = 1e9;
  let fleeBuilds = 0;
  const escapeField = () => fleeF || exitF;
  function updateFlee(dt) {
    let running = null, rd = Infinity;
    for (const s of shoppers) {
      if (s.escaped || s.caught) continue;
      if (s.state !== 'bolt' && s.state !== 'react') continue;
      const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
      if (d < rd) { rd = d; running = s; }
    }
    if (!running) { fleeF = null; fleeT = 0; fleeCx = fleeCz = 1e9; return; }
    // Nerve. Without it the decision is a pure function of where he was standing
    // when you walked in, so a player who has done it twenty times knows from the
    // aisle marker whether this one turns and runs or comes through him. One
    // thief will take his chances past your shoulder from eight metres out;
    // another is already heading for the back wall from four. Same shared field
    // — there is only ever one man being chased — scaled by whose it is.
    const w = K.copThreatW * (running.nerve || 1);
    const u = cop.userData;
    const lx = cop.position.x + u.vel.x * K.copLead;
    const lz = cop.position.z + u.vel.z * K.copLead;
    // Where the cop is standing only changes the route while he is near it. Once
    // he is twelve metres astern and the man is committed to the back of the
    // store, the answer stops moving, so stop asking as often — that is most of
    // a long chase, and it is where the rebuild would otherwise be pure waste.
    const near = rd < K.fleeNear;
    const every = near ? K.fleeEvery : K.fleeEvery * 3.5;
    const move = near ? K.fleeMove : K.fleeMove * 3.0;
    fleeT -= dt;
    if (fleeF && fleeT > 0 && dist2d(lx, lz, fleeCx, fleeCz) < move) return;
    fleeT = every; fleeCx = lx; fleeCz = lz; fleeBuilds++;
    if (!fleeBuf || fleeBuf.length !== nav.count) fleeBuf = new Float32Array(nav.count);
    // Seeded from EVERY door at once, so "which way out" and "how do I get round
    // that man" are the same question and get one answer. A cop parked on Door 1
    // raises the cost of every cell near Door 1; Door 2 is then simply cheaper,
    // and the descent walks him there without anybody writing a rule about it.
    const pref = Math.min(running.doorPref || 0, EXITS.length - 1);
    fleeF = nav.field(EXITS.map((e, i) => ({ x: e.x, z: e.z, cost: i === pref ? 0 : K.doorBias })), {
      out: fleeBuf,
      avoid: {
        x: lx, z: lz, r: K.copThreatR, w,
        // Only where he is actually in the way — see threatMask().
        ref: exitF,
        refMax: toExit(running.position.x, running.position.z) - K.threatAhead,
      },
    });
  }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- cop -----------------------------------------------------------------
  // He used to be built here, out of the shopper rig at girth 1.62 with a belt
  // torus, a cap cylinder and a badge bolted on. The playtest verdict on that
  // was "he's just kinda black... he's not a character yet", and it was right
  // for a reason nobody had measured: at girth 1.62 the shopper capsule's top
  // cap reached hips-local 0.71 and the head sat at 0.60, so the head was
  // INSIDE the torso and the cap was sitting on his chest. There was no face to
  // see because there was no head above the shoulders. makeCop() is a rig built
  // for him instead of a shopper wearing a hat — see agents/figures.js.
  const copRig = makeCop(THREE, F);
  const cop = copRig.root;
  cop.userData = {
    rig: copRig, vel: V(0, 0, 0), speed: 0, phase: 0, heading: 0, prevHeading: 0,
    stamina: K.staminaMax, gassed: false, boost: 0, breath: 0, lean: 0, skid: 0, turn: 0,
    stagger: 0,
    // ROUND 6 — the visible half of the lung. `fatigue` is integrated in
    // updateCop() now instead of in telemetry(), because telemetry() is behind
    // `if (!api.report) return` and the ANIMATION cannot be: a cop who only
    // pants when the HUD happens to be listening is not a character.
    fatigue: 0, heave: 0, brace: 0, hook: 0, sway: 0,
    // ROUND 1 (cop) — the belt's own lagged copy of the pelvis (see the note at
    // the bottom of animateCop) and the trunk's follow-through accumulator.
    beltZ: 0, beltYaw: 0, beltH: 0, beltX: 0, lastAlong: 0, leanA: 0,
  };
  scene.add(cop);
  // steer() writes speed/skid and moves .position; the cop's live on userData.
  const copBody = {
    position: cop.position, vel: cop.userData.vel,
    get speed() { return cop.userData.speed; }, set speed(v) { cop.userData.speed = v; },
    get skid() { return cop.userData.skid; }, set skid(v) { cop.userData.skid = v; },
  };

  // ---- shoppers ------------------------------------------------------------
  const angerTex = angerTexture(THREE);
  const shoppers = [];
  let nextId = 1;
  // ROUND 6. Declared up here rather than next to updatePost()/interactions()
  // because reset() runs at construction, before either of those lines is
  // reached, and a `let` in the temporal dead zone is a ReferenceError rather
  // than an undefined.
  let postT = 0;          // seconds the cop has been loitering on the way out
  // ROUND 7 — the PA's own cooldown. Declared up here rather than next to
  // announceAt() because reset() runs at module init and a `let` in the
  // temporal dead zone is a boot-time crash, not a lint warning.
  let annCool = 0;
  let grabGate = null;    // bench-only: the identity model, see bench({ident})
  let shiftN = 0;         // ROUND 12 — re-phases the reach clocks; see reset()

  function makeShopper() {
    // rollPerson() rolls a BUILD, an AGE and a silhouette, not just four
    // palette picks. The critic's line was "two identically-proportioned bodies
    // ... recoloured"; proportion is the first word in it.
    const rig = makePerson(THREE, F, rollPerson({ rnd, rr, ri, pick }));
    const cart = makeCart(THREE, G);
    cart.visible = false;
    const held = new THREE.Mesh(G.goods, new THREE.MeshStandardMaterial({ color: pick(CLOTH), roughness: 0.9 }));
    held.visible = false; rig.root.add(held);
    const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: angerTex, transparent: true, depthTest: false }));
    bang.scale.setScalar(0.42); bang.position.y = 2.05; bang.visible = false; rig.root.add(bang);
    scene.add(rig.root); scene.add(cart);
    // ROUND 9 — THE CHILD, AND WHY IT IS NOT AN AGENT.
    //
    // The obvious build is a fifteenth shopper who happens to be short. It is
    // also the wrong one, three times over: the roster would have to decide
    // whether a seven-year-old can be a shoplifter, `guiltyIdx` would sometimes
    // say yes, the nav grid and the separation constraint would have to carry a
    // body that exists to be looked at, and every number in this file's header
    // would move because the crowd got 7% denser.
    //
    // So a child is FURNITURE THAT FOLLOWS. It is not in `shoppers`, it never
    // enters updateShopper, it has no collider, no path, no guilt and no vote in
    // anything. It reads the parent's position and nothing else in the game
    // reads it back — a strictly downstream consumer, which is the only kind of
    // feature that can be added to a tuned simulation for free and be able to
    // PROVE it was free. The bench is byte-identical; see the ablation below.
    //
    // A kid in the cart seat is parented to the CART object rather than to the
    // scene, which is worth the special case: it costs no follow logic at all,
    // it rides the cart's own placement including the moment a bolting man
    // abandons it, and a cart with a child in it is a different silhouette from
    // a cart without one at every distance in this game.
    if (rig.kid) {
      const k = rig.kid;
      if (k.spec.mode === 'seat') {
        // The seat pan buildCartGeo lofts is at y 0.596, z -0.185 in cart-local
        // metres, and the cart's local +Z is the direction of travel, so this is
        // the rear of the basket facing whoever is pushing. Park the child's
        // HIPS on the pan rather than its feet on the floor — hipY is a fraction
        // of the rig's own scale, so this is the one place in the file where a
        // rig offset has to be divided back out of `height`.
        k.root.position.set(0, 0.622 - KID.hipY * k.root.scale.y, -0.185);
        k.root.rotation.y = Math.PI;
        k.legL.rotation.x = -0.26; k.legR.rotation.x = -0.22;
        cart.add(k.root);
      } else {
        scene.add(k.root);
      }
    }
    const s = {
      id: nextId++, rig, mesh: rig.root, cart, held, bang,
      position: rig.root.position, vel: V(0, 0, 0), speed: 0, phase: rnd() * 7,
      heading: 0, hasCart: true, guilty: false, aisle: 0,
      state: 'walk', timer: 0, path: [], repathIn: 0, wind: 1, aim: null, aimT: 0,
      bolted: false, escaped: false, caught: false, angry: 0, harassArmed: true,
      concealT: 0, look: 0, lean: 0, target: null, dropCartAt: null,
      duck: 0, duckT: 0, stumble: 0, bargeT: 0, bargeN: 0, bargeStam: null, nerve: 1,
      adren: 1, legs: 1, shoveT: 0, exitI: 0, viaBack: false, doorPref: 0,
      // ROUND 6 — the decoy clip currently playing on this body, guilty or not.
      // `gest` is an entry from decoy.js, `gestT` counts DOWN, `gestD` is its
      // scaled duration. `turnY` is the yaw a clip adds on top of `heading`,
      // which is how a man turns away from the shelf without turning his walk.
      gest: null, gestT: 0, gestD: 1, gestIn: 0, turnY: 0,
      // ...and the one-exit economy: `chill` is seconds of honest shopping
      // after he balked, `balk` is how long he has been looking at a guard
      // stood on the only way out, `shopT` is how much shopping an innocent has
      // left before he checks out and leaves through that same door.
      chill: 0, balk: 0, stall: 0, aborts: 0, shopT: 0, leaving: false, made: 0,
      // ROUND 7 — the PA. `annT` counts down to the moment he reacts (0 the
      // rest of the time, which is the only cost this feature has in the update
      // loop), `annN` is how many times he has been shouted at, `annOut` is
      // what he visibly did last time and `annSpill` says he was in earshot
      // rather than the man being addressed.
      annT: 0, annKind: null, annOut: null, annN: 0, annSpill: false, annClip: null,
      // ROUND 9 — where he is aiming a reaction. `annAt` is the body he is
      // gawping at (bystanders only, null for the man being addressed);
      // camYaw/camPitch are the solved world bearing to whatever he is aimed at.
      annAt: null, camYaw: 0, camPitch: -0.3, birdT: 0,
      // ROUND 8 — `huff` is seconds of visible annoyance left after a shrug
      // (guilty or innocent, same number), `paBolt` marks the startle so the
      // `react` state freezes for it instead of backing away from a cop who is
      // forty metres away.
      // ROUND 10 — `huffKind` is 'lost' (confused, the default) or 'mad'
      // (round 8's huff, third shout onward). A function of annN and proximity;
      // never of guilt. See afterPA().
      huff: 0, huffKind: 'lost', paBolt: false,
      // ROUND 12 — MOVEMENT. None of these is ever read against `s.guilty`; see
      // takeAt() and the ledger over benchTake().
      //   visYaw   the yaw the BODY is drawn at. `heading` stays the true
      //            velocity bearing that the sim, the cart, the exit field and
      //            the pursuit bot all read; this chases it at a bounded rate
      //            so nobody rotates on the spot. `faceYaw`, when set, is a
      //            heading the body wants while it is standing still — at a
      //            shelf that is square-on to the fixture.
      visYaw: 0, faceYaw: null, yawRate: 0,
      //   gas      the eased speed target, so a start is a start and not a
      //            teleport. `leanA` is the smoothed body acceleration the
      //            trunk leans on.
      gas: 0, leanA: 0,
      //   shelfSide  which way the shelf is from where he is standing, -1/+1/0
      //   facing     a live handle from world.takeFacing, or null. He is
      //              holding an actual box that an actual shelf no longer has.
      //   reachT     seconds until the next browse reach. Runs on the RIG's
      //              idle clock, not on this object, for the anti-oracle reason
      //              round 9 wrote down; see the note in animateShopper.
      //   `reachU` was declared here as "0..1 through the reach sequence, or -1
      //   when not reaching", with a comment documenting it as the reach clock,
      //   and NOTHING EVER WROTE IT. It is deleted rather than wired: the reach
      //   clip's phase already has exactly one owner — `1 - s.gestT/s.gestD`,
      //   computed in animateShopper and handed to applyGesture — and adding a
      //   second copy of it on the shopper is the duplication CLAUDE.md's rule
      //   is about. A field that is only ever read as -1 is worse than absent,
      //   because the next reader believes the comment.
      shelfSide: 0, facing: null, reachTook: false, reachKeep: false,
      grabHand: V(0, 0, 0), itemSize: null, grabT: 0, cartYaw: 0, leanA: 0, reachEl: 0,
      lastAlong: 0, turnErr: 0,
      // Pure counters for benchTake. They are written by takeAt/putBack and
      // read by nothing in the simulation — the instrument has to be able to
      // say what the reach rate IS per population, because that is the one
      // property the store's own header says it cannot enforce for me.
      tookN: 0, putN: 0, takeYSum: 0, takeDSum: 0,
    };
    shoppers.push(s);
    return s;
  }

  // ---- powerups ------------------------------------------------------------
  const powerups = [];
  function buildPowerups() {
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;
    let spots = (world.powerupSpots || []).filter((s) => s && isFinite(s.x) && isFinite(s.z));
    if (!spots.length) {                     // store mid-rebuild: synthesize
      spots = [];
      for (let i = 0; i < AISLE_COUNT; i++) {
        spots.push({ x: aisleX(i), z: (i % 2 ? 1 : -1) * (3 + i * 1.4), kind: i % 2 ? 'donuts' : 'energy' });
      }
    }
    for (const sp of spots) {
      const kind = sp.kind === 'donuts' ? 'donuts' : 'energy';
      const g = new THREE.Group();
      const P = kind === 'energy' ? PW.energy : PW.donuts;
      const col = P.glow;
      // The object itself, lit by the store's own lights like the merchandise
      // it is sitting on. `item` is the group everything rotates and bobs with.
      const item = new THREE.Group();
      item.position.y = 1.06;
      // A shade over life size. The floor camera sits at 6.4 m and a real
      // single-serve can is 40 px from there; the thing you have to spot at a
      // dead run gets to be the hero item on the display, not one more facing.
      item.scale.setScalar(1.22);
      const printed = new THREE.MeshStandardMaterial({
        map: P.tex, roughness: kind === 'energy' ? 0.34 : 0.80,
        metalness: kind === 'energy' ? 0.45 : 0.0,
      });
      if (kind === 'energy') {
        const body = new THREE.Mesh(P.body, printed);
        body.castShadow = true; item.add(body);
        item.add(new THREE.Mesh(P.extra, PW.matAlu));
      } else {
        const body = new THREE.Mesh(P.body, PW.matBoard);
        body.castShadow = true; item.add(body);
        const lid = new THREE.Mesh(P.lid, new THREE.MeshStandardMaterial({
          map: P.tex, roughness: 0.80, side: THREE.DoubleSide,
        }));
        lid.applyMatrix4(P.lidM); item.add(lid);
        item.add(new THREE.Mesh(P.extra, PW.matSugar));
      }
      // ---- RIM LIGHT, AND THE BUG THAT WAS IN IT FOR FIVE ROUNDS -----------
      // The intent was always right and is worth restating: a backface shell of
      // the object's OWN silhouette, scaled a few percent, so an additive pass
      // survives only in the sliver where the shell pokes out past the front
      // faces. That is an edge catching the light. What was actually here for
      // the donuts was `BoxGeometry(BW+0.03, BH+0.10, BD+0.03)` — a prism 30 mm
      // proud in x and z and 100 mm proud in y of a clamshell that is 62 mm
      // tall. Nothing occluded the extra 50 mm above and below, so the additive
      // pass survived over the whole rectangle and it rendered as exactly what
      // two blind critics called it, six rounds apart: an unlit flat magenta box
      // floating over the shelf. Magenta is the missing-texture colour, so it
      // did not read as a bad prop, it read as a broken build — which is why
      // one of them ended the test on it.
      //
      // THE SHELL IS NOW THE BODY ITSELF, scaled. It cannot come apart from the
      // object again, because it IS the object: change the clamshell and the rim
      // changes with it, and there is no second geometry to forget to update.
      // The 11% scale is the whole effect and it wants to stay small — at 1.30
      // it stops being an edge and starts being a halo, which is the failure
      // this is climbing out of.
      const halo = new THREE.Mesh(P.rim || P.body, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.22, side: THREE.BackSide,
        depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      halo.scale.setScalar(P.rimScale || 1.10);
      halo.position.y = P.rimY; item.add(halo);
      g.add(item);
      const ring = halo;                       // what updatePowerups pulses
      // Keep it inside the walkable lane even if the store parked it in a shelf,
      // and if the store handed us a bare centreline point, shove it out to the
      // shelf lip — a can on the centreline is a free boost for anyone running
      // the aisle, which is exactly what a chase does.
      // Snap it to the shelf lip, keeping the side and the depth the store
      // chose. A can sitting on the lane centreline is a free boost for anyone
      // running the aisle, and a chase runs the aisle: the bench measured the
      // supposedly-unpowered cop boosted 45% of the time. It is on a SHELF.
      const inAisle = Math.abs(sp.z) < HALF_LEN - 0.5;
      const ai = aisleOf(sp.x);
      const off = sp.x - aisleX(ai);
      const side = off < 0 ? -1 : off > 0 ? 1 : (powerups.length % 2 ? 1 : -1);
      const x = inAisle ? aisleX(ai) + side * K.pickupLip
                        : clamp(sp.x, STORE.minX + 1, STORE.maxX - 1);
      const z = inAisle ? clamp(sp.z, -HALF_LEN + 1, HALF_LEN - 1)
                        : clamp(sp.z, STORE.minZ + 1, STORE.maxZ - 1);
      // Unit vector from the lane centre out to the shelf face: the direction
      // the cop has to actually move in to take it off the shelf.
      const nx = inAisle ? side : 0;
      const nz = inAisle ? 0 : (z > 0 ? 1 : -1);
      g.position.set(x, 0, z); scene.add(g);
      powerups.push({ mesh: g, item, ring, x, z, nx, nz, kind, live: true, respawn: 0 });
    }
  }
  buildPowerups();

  // ---- spawn / reset -------------------------------------------------------
  // Never drop anyone in a pocket the store has sealed off — a thief who cannot
  // reach the doors is not a chase, he is a bug that reads as one.
  function placeInAisle(s) {
    let i = 0, x = 0, z = 0;
    for (let k = 0; k < 24; k++) {
      i = ri(0, AISLE_COUNT - 1);
      x = aisleX(i) + rr(-1.1, 1.1);
      z = rr(-HALF_LEN + 1.5, HALF_LEN - 1.5);
      if (nav.free(x, z) && canReachExit(x, z)) break;
    }
    s.position.set(x, 0, z);
    s.aisle = i;
  }
  function resetShopper(s, guilty) {
    placeInAisle(s);
    s.vel.set(0, 0, 0); s.speed = 0; s.state = 'walk'; s.timer = rr(0.5, 4);
    s.path = []; s.repathIn = 0; s.guilty = !!guilty; s.bolted = false;
    s.escaped = false; s.caught = false; s.angry = 0; s.harassArmed = true;
    s.concealT = guilty ? rr(2.5, 7.0) : 0; s.look = 0; s.lean = 0; s.wind = 1;
    s.aim = null; s.aimT = 0; s.duck = 0; s.duckT = 0;
    s.adren = 1; s.legs = 1; s.shoveT = 0; s.exitI = 0; s.viaBack = false;
    s.doorPref = EXITS.length > 1 ? ri(0, EXITS.length - 1) : 0;
    s.stumble = 0; s.bargeT = 0; s.bargeN = 0; s.bargeStam = null;
    s.nerve = rr(K.nerveLoD, K.nerveHiD);
    // ROUND 12 — NOT EVERYBODY HAS A TROLLEY, and the decision is the PERSON'S,
    // rolled once in figures.js at construction. Not rolled here: one extra
    // rnd() inside a reset moves every subsequent decision in the building, and
    // this file's header records that exact mistake moving a published
    // likelihood ratio from 1.95 to 2.33 in a change that touched no
    // probability anywhere. `desc.cart` costs the seeded stream nothing.
    s.hasCart = s.rig.desc.cart !== false; s.cart.visible = s.hasCart;
    s.mesh.visible = true;
    s.held.visible = false; s.bang.visible = false; s.target = null;
    s.stole = false;
    s.gest = null; s.gestT = 0; s.gestD = 1; s.turnY = 0;
    s.gestIn = rr(1.5, K.decoyHi);
    s.chill = 0; s.balk = 0; s.stall = 0; s.aborts = 0; s.leaving = false; s.made = 0;
    s.annT = 0; s.annKind = null; s.annOut = null; s.annN = 0; s.annSpill = false;
    s.annAt = null; s.birdT = 0;
    s.annClip = null; s.huff = 0; s.huffKind = 'lost'; s.paBolt = false;
    s.shopT = rr(K.shopLo, K.shopHi);
    s.held.scale.set(1, 1, 1);
    // ROUND 12. `visYaw` snaps rather than easing — a body that has just been
    // teleported across the store has no turn to make, and a rate-limited yaw
    // would have it pirouette on the frame it respawns. The facing handle is
    // DROPPED, not restored: the store's FIFO ages every open gap on one clock
    // whoever opened it, which is the property that keeps a thief's gap and a
    // browser's gap indistinguishable, and putting mine back here would make
    // this file a second owner of that policy. The store builder's note says so
    // in those words.
    s.visYaw = s.heading; s.cartYaw = s.heading; s.faceYaw = null;
    s.yawRate = 0; s.turnErr = 0; s.leanA = 0; s.lastAlong = 0; s.shelfSide = 0;
    s.grabT = 0; s.reachTook = false; s.gas = 0; s.reachEl = 0;
    stow(s);
    // ROUND 9 — the child teleports with its parent. Without this a body that
    // is respawned across the store leaves its kid standing in the old aisle
    // and the follow spring walks it there at a dead sprint, through the
    // shelving, in front of the monitor wall. `started` is the only child field
    // a reset touches, it costs no draw, and the whole rest of the child's
    // state is intentionally left running: its gait phase, its wander and its
    // anchor cycle belong to the child, not to this shift.
    if (s.rig.kid) s.rig.kid.started = false;
  }

  function reset() {
    // BEFORE ANY DRAW. See the reach re-phase below.
    const seed0 = currentSeed();
    while (shoppers.length < K.shopperCount) makeShopper();
    const guiltyIdx = new Set();
    while (guiltyIdx.size < Math.min(K.thiefCount, shoppers.length)) guiltyIdx.add(ri(0, shoppers.length - 1));
    shoppers.forEach((s, i) => resetShopper(s, guiltyIdx.has(i)));
    // ---- ROUND 12: THE REACH CLOCK IS RE-PHASED HERE AND NOWHERE ELSE ------
    // It has to be, and finding out why cost a set of benches. `reachT` lives
    // on the RIG and no state transition restarts it — that is the anti-oracle
    // property and it is not negotiable. But unlike round 9's `idleT`, which
    // only ever chose a POSE, this clock decides when a body starts a clip, and
    // a clip changes `s.timer`, which changes when he walks, which changes
    // where the crowd is, which changes a chase. Left free-running across
    // reset(), THE BENCH STOPPED BEING REPRODUCIBLE: the same build at the same
    // seed with the same difficulty measured 62.5% as the first bench of a page
    // load and 65.0% as the fourth, because the fourteen reach clocks were at
    // different phases. That is the exact failure mode CLAUDE.md's `bench()`
    // section is about, arriving through a new door.
    //
    // AND RE-PHASING HERE CANNOT LEAK, for the reason round 9's argument
    // already establishes one line up: reset() deals guilt FRESH over the same
    // fourteen bodies, and the phase below is a hash of (body id, shift number)
    // with no guilt term in it. Across trials each body carries the same reach
    // phase whether or not it drew the black spot that shift, so the clock is
    // independent of guilt by construction rather than by care.
    //
    // It is NOT done in resetShopper(), which game.js also calls to put an
    // escaped body back in the building 18 s later. That one IS reachable more
    // often by a guilty body — he leaves through the door more often — so
    // re-phasing there would make "his reach clock just restarted" a weak
    // function of guilt. Within a shift the clock is free-running, full stop.
    // Phased off the RNG STATE AT ENTRY, captured before the guilt draw above
    // consumes anything, rather than off a monotonic shift counter. A counter
    // is deterministic within a run and NOT between runs: bench trial k gets
    // shiftN = N+k on the first bench of a page load and N+200+k on the second,
    // so the same build at the same seed measured 64.5 / 66.5 / 64.5 / 64.0
    // across four identical calls. Ablating the reach entirely gave 64.5 three
    // times, which is what identified it. Off the seed, trial k is trial k
    // whenever it is run.
    shiftN = seed0;
    shoppers.forEach((s) => {
      s.rig.reachT = K.reachLo + (K.reachHi - K.reachLo) * hash2(s.id, seed0);
      s.rig.reachN = 0;
      // ROUND 2 (character) — completed reaches, zeroed HERE and nowhere else,
      // for exactly the reason `reachN` is: resetShopper() is also how game.js
      // puts an escaped body back in the building, and a body that escaped is
      // more often one that stole, so zeroing a fuse gate there would make "his
      // shopping counter just restarted" a weak function of guilt. Within a
      // shift it accumulates, full stop.
      s.rig.reachDone = 0;
    });
    cop.position.set(0, 0, FRONT_WALK_Z + 1.5);
    const cu = cop.userData;
    cu.vel.set(0, 0, 0); cu.speed = 0; cu.stamina = K.staminaMax; cu.fatigue = 0;
    cu.gassed = false; cu.boost = 0; cu.heading = 0; cu.skid = 0; cu.stagger = 0;
    postT = 0; annCool = 0;
    for (const p of powerups) { p.live = true; p.respawn = 0; p.mesh.visible = true; }
  }
  setSeed(20240822);
  reset();

  // ---- shared steering -----------------------------------------------------
  // Split accel into along-velocity and lateral. Lateral authority drops with
  // speed, so a heavy body swings wide instead of pivoting.
  function steer(ent, dirx, dirz, target, accel, gripAtSpeed, topSpeed, dt) {
    const v = ent.vel;
    const tvx = dirx * target, tvz = dirz * target;
    let dvx = tvx - v.x, dvz = tvz - v.z;
    const sp = Math.hypot(v.x, v.z);
    let ax, az;
    if (sp > 0.4) {
      const fx = v.x / sp, fz = v.z / sp;
      const along = dvx * fx + dvz * fz;
      let lx = dvx - along * fx, lz = dvz - along * fz;
      const lm = Math.hypot(lx, lz);
      const spN = clamp(sp / topSpeed, 0, 1.2);
      const latMax = accel * (1 - (1 - gripAtSpeed) * spN);
      const alMax = accel;
      const aAlong = clamp(along, -alMax * dt, alMax * dt);
      const aLat = lm > 1e-6 ? Math.min(lm, latMax * dt) : 0;
      ax = fx * aAlong + (lm > 1e-6 ? (lx / lm) * aLat : 0);
      az = fz * aAlong + (lm > 1e-6 ? (lz / lm) * aLat : 0);
      ent.skid = lm > 1e-6 ? clamp(aLat / (latMax * dt + 1e-9), 0, 1) * clamp(sp / topSpeed, 0, 1) : 0;
    } else {
      const dm = Math.hypot(dvx, dvz);
      const step = Math.min(dm, accel * dt);
      ax = dm > 1e-6 ? (dvx / dm) * step : 0;
      az = dm > 1e-6 ? (dvz / dm) * step : 0;
      ent.skid = 0;
    }
    v.x += ax; v.z += az;
    ent.speed = Math.hypot(v.x, v.z);
    ent.position.x += v.x * dt; ent.position.z += v.z * dt;
  }

  function followPath(ent, dt) {
    while (ent.path.length) {
      const w = ent.path[0];
      const d = dist2d(ent.position.x, ent.position.z, w.x, w.z);
      const nxt = ent.path[1];
      if (d < 0.75 || (nxt && nav.clearSeg(ent.position.x, ent.position.z, nxt.x, nxt.z) && ent.path.length > 1)) {
        ent.path.shift(); continue;
      }
      break;
    }
    if (!ent.path.length) return null;
    const w = ent.path[0];
    let dx = w.x - ent.position.x, dz = w.z - ent.position.z;
    const m = Math.hypot(dx, dz) || 1;
    return { x: dx / m, z: dz / m, dist: m };
  }

  // Steer away from other bodies so the aisles feel occupied, not ghostly.
  //
  // `tangent` is for a runner. Plain radial repulsion from a cop who is directly
  // ahead points STRAIGHT BACKWARDS, so a thief squeezing past would brake to a
  // halt a metre in front of him and be collected — the avoidance was doing the
  // cop's job for him. For a runner the backward half of the repulsion is thrown
  // away and only the sideways half survives: he slides round you, he does not
  // back off you.
  function avoid(ent, dirx, dirz, radius, strength, tangent) {
    let ax = 0, az = 0;
    for (const o of shoppers) {
      if (o === ent || o.escaped || !o.mesh.visible) continue;
      const dx = ent.position.x - o.position.x, dz = ent.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 1e-4) continue;
      const w = (1 - d / radius) * strength;
      ax += (dx / d) * w; az += (dz / d) * w;
    }
    const dx = ent.position.x - cop.position.x, dz = ent.position.z - cop.position.z;
    const d = Math.hypot(dx, dz);
    if (d < radius + 0.3 && d > 1e-4) {
      const w = (1 - d / (radius + 0.3)) * strength * 1.3;
      let rx = dx / d, rz = dz / d;
      if (tangent) {
        const along = rx * dirx + rz * dirz;
        if (along < 0) { rx -= along * dirx; rz -= along * dirz; }
        const m2 = Math.hypot(rx, rz);
        if (m2 < 1e-4) { rx = 0; rz = 0; } else { rx /= m2; rz /= m2; }
      }
      ax += rx * w; az += rz * w;
    }
    const nx = dirx + ax, nz = dirz + az;
    const m = Math.hypot(nx, nz) || 1;
    return { x: nx / m, z: nz / m };
  }

  // ---- the squeeze ---------------------------------------------------------
  // A thief with a uniform in his way does not stop and he does not turn round:
  // the doors are the only thing in his world. He picks a shoulder and goes.
  //
  // The shoulder is chosen ONCE and held, so it is a read the player can make
  // from the chair instead of per-frame noise, and so guessing right is worth
  // something. He takes the side with more daylight; dead-centre he goes against
  // whichever way the cop is already drifting — which is exactly the tell a
  // player can bait by leaning one way and stepping the other.
  //
  // The arithmetic that makes it a duel rather than a coin flip: 1.58 m of
  // usable half-lane against a 1.15 m catch radius. A shelf-hugging thief clears
  // a dead-centre cop by 0.43 m. Move 0.43 m onto his shoulder and you have him.
  function squeezePast(s, dir, copD, dt) {
    s.duckT = Math.max(0, (s.duckT || 0) - dt);
    const cdx = cop.position.x - s.position.x, cdz = cop.position.z - s.position.z;
    // "In the way" has to be measured against where he is actually GOING, which
    // near a corner is not the same as the route's aim point. Take the stricter
    // of the two. Round 3 first shipped this on the route direction alone and
    // the bench caught it immediately: a cop chasing from behind kept clipping
    // the cone as the thief rounded the end of an aisle, so the thief committed
    // to a shoulder against a man who was nowhere near his path, ate a stumble
    // for it, and did that three or four times a chase. The stern-chase catch
    // rate went from 1.5% to 81% on that alone.
    let ax = dir.x, az = dir.z;
    if (s.speed > 1.2) { ax = s.vel.x / s.speed; az = s.vel.z / s.speed; }
    const ahead = copD > 1e-3
      ? Math.min((cdx * dir.x + cdz * dir.z) / copD, (cdx * ax + cdz * az) / copD) : 0;

    // He is through, or the man was never really in his way. Note that clearing
    // the commit costs NOTHING: the stumble is the price of going THROUGH
    // somebody (see barge()), not the price of having considered it.
    if (s.duck && (ahead < 0.05 || copD > K.jukeRange + 1.4)) { s.duck = 0; s.duckT = 0; }

    // Only a body actually in the way provokes one, and only inside an aisle,
    // in the same lane — out on the cross-aisles there is room to go round and
    // no duel to have.
    if (copD > K.jukeRange || ahead < K.jukeAhead) return dir;
    if (Math.abs(s.position.z) > HALF_LEN - 0.25) return dir;
    if (Math.abs(cop.position.z) > HALF_LEN + 0.4) return dir;

    const laneC = aisleX(aisleOf(s.position.x));
    if (Math.abs(cop.position.x - laneC) > LANE_HALF) return dir;
    if (!s.duck || s.duckT <= 0) {
      const copOff = cop.position.x - laneC;
      let side = copOff > 0.12 ? -1 : copOff < -0.12 ? 1 : 0;
      if (!side) {
        const drift = cop.userData.vel.x;
        side = Math.abs(drift) > 0.45 ? (drift > 0 ? -1 : 1)
             : (s.position.x - laneC >= 0 ? 1 : -1);
      }
      s.duck = side; s.duckT = K.jukeHold;
    }
    const want = laneC + s.duck * LANE_FREE * K.jukeLip;
    const lat = clamp((want - s.position.x) / 0.70, -1, 1);
    const w = clamp((K.jukeRange - copD) / (K.jukeRange - 0.80), 0, 1) * K.jukeLat;
    const nx = dir.x + lat * w, nz = dir.z;
    const m = Math.hypot(nx, nz) || 1;
    return { x: nx / m, z: nz / m, dist: dir.dist };
  }

  // ---- cop update ----------------------------------------------------------
  function updateCop(dt, input, frozen) {
    const u = cop.userData;
    let ix = frozen ? 0 : (input.x || 0);
    let iz = frozen ? 0 : FWD_SIGN * (input.z || 0);
    const mag = Math.hypot(ix, iz);
    const moving = mag > 0.02;
    if (moving) { ix /= mag; iz /= mag; }

    const wantSprint = !frozen && !!input.sprint && moving;
    u.wantSprint = wantSprint;              // telemetry: the gate is on the KEY
    const boosted = u.boost > 0;
    const canSprint = wantSprint && (boosted || (u.stamina > 0 && !u.gassed));
    u.sprinting = canSprint;                // bench: counts BURSTS, not seconds

    if (boosted) {
      u.boost = Math.max(0, u.boost - dt);
      u.stamina = K.staminaMax;                 // energy drink: you are not tired
      u.gassed = false;
    } else if (canSprint) {
      u.stamina -= K.staminaDrain * dt;
    } else {
      // ---- THE GATE. Round 4's one admitted failure, fixed here -------------
      // `canSprint` goes false the instant you gas, so a player STILL HOLDING
      // THE KEY lands in this branch. Ungated, he recovered at exactly the rate
      // of the man who let go — so letting go bought nothing, and managing your
      // wind was not a weak strategy, it was a strictly dominated one
      // (always-sprint 76.0% vs ration 71.0% on this store).
      //
      // A man sprinting is not getting his breath back. `regenHold` is what he
      // gets while the key is down, and it is zero.
      //
      // On its own this is a 25-point nerf and nothing else (round 4 measured
      // it, priced it, and refused to ship it alone — correctly). It only
      // becomes a mechanic next to the other two thirds: no-sprint-while-gassed
      // below, and the short fast tank. See the lung block in K.
      const held = wantSprint ? K.regenHold : 1;
      u.stamina += K.staminaRegen * dt * held * (moving ? 1 : 1.6);
    }
    u.stamina = clamp(u.stamina, 0, K.staminaMax);
    if (u.stamina <= 0.0001) u.gassed = true;
    if (u.gassed && u.stamina >= K.gassedRecover * K.staminaMax) u.gassed = false;

    // ---- A WINDED MAN DOES NOT GET TO SPRINT -------------------------------
    // This line read `(wantSprint ? T.copRun : T.copWalk) * T.gassedPenalty`,
    // i.e. 5.05 x 0.62 = 3.13 m/s for a gassed cop holding the key, against
    // 2.35 m/s for a cop with a FULL TANK who chose to walk. Blowing your lungs
    // out made you 33% faster than pacing yourself, permanently, and no regen
    // gate can ever beat a penalty state that outruns the healthy state. Four
    // rounds of "stamina management pays nothing" was mostly this one line.
    //
    // Now the key does nothing once you are gassed: 2.35 x 0.62 = 1.46 m/s,
    // well under the thief's 3.08 m/s cruise, so gassing out costs you ground
    // instead of gaining it. `gassedPenalty` itself is UNTOUCHED at 0.62 — the
    // game builder was right that softening it would just stop gassing meaning
    // anything. It bites harder now because it multiplies the walk.
    let target = canSprint ? T.copRun : K.copWalk;
    if (u.gassed) {
      const g = wantSprint ? K.gassedSprintMul : 0;
      target = (K.copWalk + (T.copRun - K.copWalk) * g) * T.gassedPenalty;
    }
    if (boosted) target *= T.boostMul;
    // Shaking off a shoulder — see barge(). Not a freeze, but not a wobble
    // either: a heavy man who has just been run through by a sprinting one is
    // off his feet for a beat and facing the way the man came from.
    if (u.stagger > 0) { u.stagger = Math.max(0, u.stagger - dt); target *= K.bargeSlow; }
    if (!moving) target = 0;

    const top = T.copRun * T.boostMul;
    // ROUND 9 (2nd pass) — the drink buys FOOTWORK as well as legs. `top` is
    // the boosted ceiling either way, so steer()'s grip term already fades the
    // lateral authority of a boosted cop toward copGrip; without a matching
    // lift on the accel a drink doubles his turning circle in a 3.16 m lane.
    // The whole write-up, the arithmetic and the sweep are at K.boostGrip.
    steer(copBody, ix, iz, target, T.copAccel * (boosted ? K.boostGrip : 1), K.copGrip, top, dt);
    solids.resolve(cop.position, BODY_R);

    // shove shoppers out of the way rather than clipping through them
    for (const s of shoppers) {
      if (s.escaped || !s.mesh.visible) continue;
      // Mid-barge the two of them are momentarily occupying the same ground.
      // Holding them 0.78 m apart through it is what pinned a thief who had
      // just gone through a man to the front of the man he went through.
      if (s.bargeT > 0) continue;
      const dx = s.position.x - cop.position.x, dz = s.position.z - cop.position.z;
      const d = Math.hypot(dx, dz), min = BODY_R + 0.36;
      if (d < min && d > 1e-4) {
        const push = (min - d) / d;
        s.position.x += dx * push * 0.8; s.position.z += dz * push * 0.8;
        cop.position.x -= dx * push * 0.2; cop.position.z -= dz * push * 0.2;
        u.vel.multiplyScalar(0.985);
      }
    }
    // ---- the visible lung ---------------------------------------------------
    // `fatigue` used to be integrated inside telemetry(), which is guarded by
    // `if (!api.report) return`. The HUD can afford to be optional; the man's
    // breathing cannot. It is a LAGGING 0..1 — rises at 5.5/s, falls at 0.9/s —
    // so it survives across a whole chase instead of snapping back the instant
    // the tank refills, and it is what makes the heave visibly LET UP rather
    // than switch off. Same signal the audio piece drives its huff off, so the
    // body and the sound stay locked without either side calling the other.
    {
      const frac = u.stamina / K.staminaMax;
      const want = clamp(1 - frac, 0, 1);
      const k = want > u.fatigue ? 5.5 : 0.9;
      u.fatigue += (want - u.fatigue) * (1 - Math.exp(-k * dt));
      if (u.gassed) u.fatigue = Math.max(u.fatigue, 0.92);
      if (boosted) u.fatigue *= Math.exp(-2.6 * dt);   // the drink IS the relief
    }
    animateCop(dt, moving, boosted);
  }

  // ===========================================================================
  // THE WALK, THE WADDLE AND THE HUFF
  // ===========================================================================
  // ROUND 1 (cop) — THIS FUNCTION IS NO LONGER A WALK CYCLE. IT IS THE COP'S
  // NUMBERS, HANDED TO THE SAME SOLVE FOURTEEN SHOPPERS RUN.
  //
  // For four rounds it was a second, older implementation of poseWalk(): two
  // sines, a hand-picked metres-per-cycle divisor, no plant, no knee — its own
  // comment said "the knee-less leg fakes that with a kick" — and no ankle at
  // all. Every fix that landed on the crowd's walk (the plant, the real knee,
  // the heel-to-toe rocker, the scaled sole pin, the inverted rocker signs)
  // missed the one body the player looks at, centre frame, at three metres, for
  // the entire floor phase. That is CLAUDE.md's opening rule — exactly one
  // piece of code owns a derivation — costing four rounds in one place.
  //
  // The line-by-line account of what went and why is at the top of the gait
  // block below. What is left in this function is everything that is HIS and
  // is not a walk: the huff, the stoop, the brace, the thumbs in the belt, the
  // barge stagger, the belt's own inertia, and the numbers in K.cop*.
  //
  // Two things survive from earlier rounds and are still true:
  //
  // 1. There is a `chest` joint. Hips carry the legs, the pelvic drop and the
  //    lean; chest carries the torso, arms and head and counter-rotates against
  //    the hips. Everything used to hang off `hips`, so the whole man rotated
  //    as one piece and a walk cycle was two sticks swinging under a stationary
  //    egg. poseWalk() writes both.
  //
  // 2. The breath. Verbatim: "he pants, like he breathes heavily, and then it
  //    lets up right as he gets his breath back, but you should see that too."
  //    So it is not a gassed FLAG that switches an animation on. Rate, depth,
  //    hunch and head-drop are all continuous functions of `fatigue`, which
  //    rises at 5.5/s and falls at 0.9/s: he is still heaving for a good two
  //    seconds after the WIND bar goes green, and you can watch it ease off.
  //    The tank is 1.40 s with a 0.81 s refill, so the winded cycle repeats
  //    about every 2.2 s — a heave has to be visible inside that, which is why
  //    the rate tops out near 1.3 Hz and not at some tasteful 0.3 Hz.
  const TAU = Math.PI * 2;
  // Lungs-full, 0..1, with a fast gasp in and a slower blow out. A sine is
  // symmetric and reads as a machine; the asymmetry is the whole tell.
  function breathWave(ph) {
    const p = ((ph % TAU) + TAU) % TAU, IN = TAU * 0.34;
    return p < IN ? Math.sin((p / IN) * (Math.PI / 2))
                  : Math.cos(((p - IN) / (TAU - IN)) * (Math.PI / 2));
  }

  function animateCop(dt, moving, boosted) {
    const u = cop.userData, r = u.rig;
    const ed = (k) => 1 - Math.exp(-k * (dt || 0.016));
    if (u.speed > 0.12) u.heading = Math.atan2(u.vel.x, u.vel.z);
    let dh = u.heading - u.prevHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    u.prevHeading = u.heading;
    u.turn = lerp(u.turn, dt > 0 ? clamp(dh / dt, -4, 4) : 0, ed(12));
    cop.rotation.y = u.heading;

    const F = clamp(u.fatigue, 0, 1);
    const spd = clamp(u.speed / T.copRun, 0, 1.2);

    // ---- gait: THE SAME SOLVE FOURTEEN SHOPPERS RUN -------------------------
    // WHAT THIS REPLACED, LINE FOR LINE, AND WHY EACH ONE HAD TO GO:
    //
    //   phase += (speed / stride) * dt * TAU     a hand-picked metres-per-cycle
    //     divisor. Measured on the shipped build at his own 2.35 m/s it gave
    //     cadence 2.477 Hz — 4.95 steps a second — on a 474 mm step. The step
    //     length is the input now and the cadence falls out of it.
    //   legL.rotation.x = sin(phase) * amp       a rigid leg driven by a sine
    //     has its foot planted at exactly ONE speed (gait.js's header does the
    //     arithmetic: 0.81 m/s) and skates quadratically either side of it. At
    //     2.35 m/s his foot was going backwards at 3.6 m/s under a body doing
    //     2.35. The leg angle comes out of asin() now and the plant is an
    //     equality that holds at every speed.
    //   heel = max(0, -cos(phase)) * amp * 0.22  the file's own comment: "the
    //     knee-less leg fakes that with a kick". He has a knee now — a real
    //     two-bone one, hip and ankle given, the knee the free parameter off
    //     the line between them. rig.kneeOk says so out loud.
    //   (nothing at all)                         there was no ankle. Every
    //     frame he has ever been drawn in, his shoe was welded to his shin.
    //     He now lands on the heel, goes flat, and rolls off the toe, with the
    //     sole PINNED to the tiles through the shoe's own box.
    //   legL.rotation.x += 0.046                 the weight-on-the-heels rake,
    //     which is a real read and is now a translation of the hip pivot — see
    //     COP_RAKE_Z in figures.js. An angle added to one side of the plant
    //     equality is 2.4 mm of skate across a stance; a translation is none.
    //   bob = (|sin| - 0.5) * (0.034 + 0.012*spd)   an amplitude somebody
    //     picked, uncoupled from the step. It is L(1 - cos theta) through the
    //     ankle and the foot rocker now, exact, with no dial.
    //   land = max(0, -sin(2*phase)) * 0.012     a second, independent idea of
    //     the same landing. Kept in spirit as K.copHeelSink, which is soft
    //     tissue rather than geometry and is applied to the FLOOR as well so it
    //     cannot unplant a foot.
    //   sway = sin(phase) * 0.075                a hip ROLL called sway. The
    //     pelvis never translated at all: measured lateral travel 0.0 mm. It
    //     lists (Trendelenburg, tanh) and translates over the loaded foot now,
    //     both bigger than any shopper's, and the leg pivots come back out of
    //     both so the feet stay where they were put.
    //
    // Everything genuinely his is a number in K.cop*, and the code below this
    // comment is the shopper's code with his numbers in it.
    const L = r.hipY;
    // ---- THE SOLVE IS IN ROOT-LOCAL METRES AND THE STORE IS NOT ------------
    // `L` is the hip-to-sole distance INSIDE the figure's own root group, and
    // that group is scaled: 1.04 on him, 0.9585 to 1.1143 across the fourteen
    // shoppers. Measured on him before round 1 divided his speed by it: 74 mm
    // of drift per foot-flat window, on a rig whose solve slip is 0.0 mm.
    //
    // ROUND 3 (move): the three lines that used to be here are `gaitUnits()`
    // now, and the fourteen call it too. The arithmetic and the crowd's own
    // before/after are in its header. What is left at this call site is his
    // stride, which is genuinely his.
    const stride = K.copStride * (1 - K.copStrideTired * F);
    const { vLocal, step } = gaitUnits(r, u.speed, stride, true);   // heavy: always
    const gz = clamp(u.speed / 0.55, 0, 1);
    const gait = clamp(u.speed / 1.4, 0, 1);
    // 2PI per full cycle = two steps = 2*step of ground. The `dt * 0.35` idle
    // tick is the shopper's, and it is here for the same reason: it keeps the
    // breath and the belt alive on a body standing at the desk.
    //
    // ...BUT IT FADES OUT AS HE STARTS WALKING, which the shopper's does not.
    // It is phase with no ground under it: 0.35 rad/s is 0.056 Hz against his
    // 1.66 Hz cadence, so 3.4% of every cycle is the gait clock running while
    // the body does not move, and that is 3.4% of the foot's excursion handed
    // straight to the stance foot as skate. Measured on him: it is a third of
    // the 7.8% of excursion the port drifts. `1 - gz` is the same fade every
    // input to the solve already uses, so the tick is at full strength exactly
    // where it is needed (a stopped man) and zero where it costs.
    u.phase += (vLocal > 0.02 ? Math.PI * vLocal / step * dt : 0) + (1 - gz) * dt * 0.35;
    // DERIVED FROM THE STEP, not a second idea of how far a leg goes: half a
    // step over a leg length is the sine of the hip angle. The arms swing off
    // it below.
    const amp = clamp(Math.asin(clamp(step * 0.5 / L, 0, 0.94)), 0.02, 0.75);
    // ---- COMPLIANCE. Not kinematics; see K.copHeelSink. -------------------
    // Each heel strike is at phase = 0 mod PI (uR = 0 for the right foot,
    // uL = 0 half a cycle later), so one half-sine over the first 30% of each
    // STEP is the body settling onto the foot and coming back up.
    const pStep = ((u.phase / Math.PI) % 1 + 1) % 1;
    // ---- ROUND 4 (move): AND THE BARGE STAGGER RIDES THE SAME CHANNEL ------
    // The stagger block at the bottom of this function used to end with
    //     r.hips.position.y -= f * 0.05;
    // which is 50 mm of pelvis written AFTER poseWalk has pinned both soles to
    // the tiles, so for the ~0.5 s of a shoulder barge the man the player is
    // watching centre-frame stood 50 mm underground. `o.sink` is the channel
    // that already exists for exactly this — poseWalk lowers the hips AND the
    // floor the pin solves against by the same amount, so a foot cannot be
    // unplanted by it — and `stagF` is computed here, once, and read by the
    // stagger block below rather than recomputed there. One derivation.
    const stagF = u.stagger > 0
      ? Math.sin(clamp(u.stagger / Math.max(0.05, T.bargeStagger), 0, 1) * Math.PI)
        * clamp(u.stagger / Math.max(0.05, T.bargeStagger), 0, 1)
      : 0;
    const sink = K.copHeelSink * gait
      * (pStep < 0.30 ? Math.sin(Math.PI * pStep / 0.30) : 0) + stagF * 0.05;
    // Banking into a corner. Solved BEFORE poseWalk and handed to it as
    // `hipZAdd` rather than added afterwards, because it is part of the pelvis
    // roll the sole pin has to solve against: 0.36 rad of bank over a 180 mm
    // pivot is 64 mm of foot, which is more than the list.
    const wantLean = clamp(u.turn * 0.11 * clamp(u.speed / T.copRun, 0, 1.3), -0.36, 0.36);
    u.lean = lerp(u.lean, wantLean, ed(9));
    poseWalk(r, {
      phase: u.phase, speed: vLocal, worldSpeed: u.speed, L, step,
      duty: dutyOf(vLocal, true) + K.copDuty,
      // ---- AND THE GAIT ITSELF DETERIORATES AS HE BLOWS ------------------
      // The brief asks for the gassed walk and the breathing to be ONE body
      // rather than two effects on one mesh, and the phase lock at the bottom
      // of this function is only half of that. The other half is that a blown
      // man's LEGS change: the step shortens (copStrideTired, above), the foot
      // stops clearing the floor — that is what a shuffle IS — and the pelvis
      // rolls further because the abductors are the first thing to give out.
      // Both are the same `F` the heave runs on, so the walk and the breath
      // ease off together instead of one switching while the other decays.
      lift: K.copLift * (1 - K.copLiftTired * F), flex: K.copFlex, gait, gz,
      roll: K.copRoll, listA: K.copList * (1 + K.copListTired * F), swayA: K.copSway,
      toeL: K.copToe, toeR: -K.copToe, splay: K.copSplay,
      // He has no contrapposto to fade: `rest` is all zeros on his rig, and it
      // is passed rather than assumed so poseWalk cannot grow a `rig.cop` test.
      restHipZ: r.rest.hipZ, rest0: 1, sink,
      hipZAdd: u.lean,
      // ROUND 3 (move): `pinRoll: 1` used to be here. The roll-aware sole pin is
      // what poseWalk does for everybody now, so there is nothing to ask for.
    });

    // ---- what poseWalk does NOT own: the shoulders leading a turn ----------
    r.chest.rotation.y -= u.turn * 0.035;
    // The chest counter-rolls against the pelvis. `hipsZ0` is what poseWalk put
    // on the hips BEFORE this function added the bank — read rather than
    // recomputed, which is the whole point of it being published.
    r.chest.rotation.z = -r.hipsZ0 * 0.55;
    u.sway = r.hipsZ0;                            // telemetry + the neck, below

    // ARMS. Contralateral, lagging, and the phase relationship is worth
    // deriving rather than transcribing because the old constant was tuned
    // against a waveform that has since moved by a quarter cycle. The solve
    // puts the LEFT foot furthest BACK at phase 0 (uL = 0.5, mid-stance behind
    // the hip) and furthest FORWARD at phase PI; the old two-sine had the left
    // leg neutral at phase 0. So the leg signal went from sin to cos, and an
    // arm that swings opposite the leg on ITS side is -cos(phase - lag).
    // Checked by rendering: at the frame the right foot lands, the LEFT arm is
    // the one out in front.
    const asw = Math.cos(u.phase - K.copArmLag);
    r.armL.rotation.x = -asw * amp * K.copArmSwing;
    r.armR.rotation.x = asw * amp * K.copArmSwing;
    // THE ELBOWS CLEAR THE BELLY. He is 1.62 girth and the widest thing on him
    // is his stomach, so his arms cannot brush his sides the way a thin man's
    // do — they ride out and swing less, which is the trade in K.copArmSwing.
    const out = K.copArmOut + 0.06 * spd + 0.06 * F;
    r.armL.rotation.z = out; r.armR.rotation.z = -out;
    // ROUND 7 — THE SHOULDERS ROUND FURTHER AS HE FATIGUES, which was asked for
    // by name. Not a rotation: the shoulder JOINTS travel forward, which is
    // what actually happens to a blown man and what makes him narrower from the
    // front at the same time. 30 mm at F=1, plus the chest drawing in 3.5%.
    // Both are on the pivot, so it costs two assignments a frame.
    const roll = (r.armZ ?? 0) + F * 0.030;
    r.armL.position.z = roll; r.armR.position.z = roll;

    // ---- THE TRUNK KEEPS GOING AFTER THE FEET STOP -------------------------
    // The shopper has had this since round 12 and he never did. `leanA` is his
    // own acceleration along his heading, smoothed at ~130 ms, and it goes onto
    // `chest.position.z` — the ONE channel on his chest that nothing else in
    // this function writes. chest.rotation.x is contested by six branches
    // (stoop, brace, hook, stagger, heave) and putting it there would have each
    // of their ed() lerps eat and re-emit it. A translation composes for free.
    // Scaled up on him because the mass is the point: 45 mm on a shopper,
    // 72 mm on a man carrying that gut.
    {
      const fx = Math.sin(u.heading), fz = Math.cos(u.heading);
      const along = u.vel.x * fx + u.vel.z * fz;
      const a = (along - (u.lastAlong ?? along)) / (dt || 0.016);
      u.lastAlong = along;
      u.leanA += (clamp(a, -14, 14) - u.leanA) * ed(7.5);
    }
    r.chest.position.z = clamp(u.leanA * 0.019, -0.072, 0.072);

    // ---- the huff, ON THE SAME BODY AS THE WALK -----------------------------
    // Rate 0.34 Hz calm -> 1.30 Hz blown, depth likewise, both off `fatigue`.
    //
    // ROUND 1 (cop) — AND ONCE HE IS MOVING AND BLOWN IT IS NOT A FREE-RUNNING
    // CLOCK ANY MORE. A man working hard locks his breathing to his stride;
    // it is called locomotor-respiratory coupling and it is the difference
    // between a heave that belongs to this body and a heave playing on top of
    // one. Two halves, and both are needed:
    //   the RATE is pulled onto his own cadence, so the loop below is not
    //     fighting a constant error (his cadence at 2.35 m/s is 1.63 Hz and
    //     the free-run at F=1 is 1.34, so they were close and never equal);
    //   the PHASE is then pulled onto the footfall at copBreathLock, which is
    //     what actually makes the shoulders lift on the same beat the foot
    //     lands. copBreathPh is the offset between the two, and it is a real
    //     quantity: you gasp just after you push off, not as you land.
    // Both fade out with `gz`, so a man doubled over at the desk gets his
    // breath back on his own clock, which is exactly what the note asked for.
    // `vLocal`, not `u.speed`: `step` came out of a root-local solve and mixing
    // the two here is the same unit error the gait block above exists to name,
    // 4% of it, hidden by a loop that would quietly absorb it as phase offset.
    const cadHz = (vLocal > 0.02 && step > 0) ? vLocal / (2 * step) : 0;
    const lock = clamp((F - 0.30) / 0.35, 0, 1) * gz;
    const hz = lerp(0.34 + 1.00 * F, cadHz, lock);
    u.breath += dt * TAU * hz;
    if (lock > 0.001) {
      let d = (u.phase + K.copBreathPh - u.breath) % TAU;
      if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
      u.breath += d * lock * ed(K.copBreathLock);
    }
    const w = breathWave(u.breath);                            // 0 empty, 1 full
    // Amplitude, near-linear in F rather than squared. The first version was
    // `w * (0.22 + 0.78F) * F`, and at F = 0.3 that is fourteen percent of the
    // full heave — so the pant did not ease off, it SWITCHED off about a second
    // after he let go, which is precisely the thing the note asked to be able
    // to watch. This keeps a visible tail all the way down.
    const heave = w * (0.30 + 0.70 * F) * (0.24 + 0.76 * F);
    u.heave = heave;

    // Chest and shoulders. From 7 m you are looking at his BACK, so the heave
    // has to be in the shoulder line and the upper back or it does not exist:
    // the chest group lifts and the whole torso swells forward.
    // ROUND 7 — deeper, and the x term now goes the OTHER WAY with fatigue.
    // The heave swelled him uniformly before; a man dragging air in narrows
    // across the shoulders as he rounds them and swells front-to-back, so x
    // carries the round-6 breath swell MINUS the 3.5% draw-in that pairs with
    // the shoulder roll above. Front-to-back is up 0.075 -> 0.092 because the
    // gut it is inflating is bigger now and the same fraction read as less.
    r.chest.position.y = heave * 0.044;
    r.chest.scale.set((1 + heave * 0.030) * (1 - 0.035 * F),
      1 + heave * 0.052, 1 + heave * 0.092);
    if (r.belly) r.belly.scale.z = 0.470 * (1 + heave * 0.16 + w * 0.03);

    // Posture. Forward lean rises with fatigue and rises again on the exhale —
    // a blown man folds a little every time he empties his lungs. Round 7 adds
    // a permanent slump underneath it: he is bent 0.14 rad before anything has
    // happened at all, which is the difference between a fat man standing up
    // straight and a fat man who has been on his feet since six.
    const stoopT = (boosted ? 0.19 : 0.14 + 0.06 * spd) + F * 0.34 + (1 - w) * F * 0.14;
    r.chest.rotation.x = lerp(r.chest.rotation.x, stoopT, ed(7));
    // Head: up and back on the gasp, dropping forward as he blows out. That
    // alternation is the read, not the raw amplitude.
    const neckT = r.stoop - w * (0.10 + 0.34 * F) + (1 - w) * F * 0.26;
    r.neck.rotation.x = lerp(r.neck.rotation.x, neckT, ed(11));
    r.neck.rotation.z = lerp(r.neck.rotation.z, -u.sway * 0.5, ed(10));

    // Hands to the knees, but only once he is properly cooked AND stopped, and
    // it comes on gradually so it is a man giving up on standing rather than a
    // pose snapping into place.
    const wantBrace = (!moving && F > 0.55) ? clamp((F - 0.55) / 0.30, 0, 1) : 0;
    u.brace = lerp(u.brace, wantBrace, ed(wantBrace > u.brace ? 5 : 3.2));
    if (u.brace > 0.01) {
      const b = u.brace;
      r.chest.rotation.x = lerp(r.chest.rotation.x, 0.62 + w * 0.10, b);
      r.armL.rotation.x = lerp(r.armL.rotation.x, -0.92 - w * 0.10, b);
      r.armR.rotation.x = lerp(r.armR.rotation.x, -0.92 - w * 0.10, b);
      r.armL.rotation.z = lerp(r.armL.rotation.z, 0.46, b);
      r.armR.rotation.z = lerp(r.armR.rotation.z, -0.46, b);
      r.neck.rotation.x = lerp(r.neck.rotation.x, -0.34 + (1 - w) * 0.30, b);
    }

    // ---- ROUND 10: THUMBS IN THE BELT ---------------------------------------
    // "The cop needs more detail, a lot more detail." Most of the answer to that
    // is geometry and it is in figures.js. This is the half that is not: he had
    // exactly two things he could be doing with his arms — swinging them, or
    // hands on knees dying — and everything in between was a man standing at
    // attention with his arms hanging.
    //
    // A police officer at rest puts his hands on his belt. It is the single most
    // recognisable thing a uniform does, and — the round-7 filter, which is the
    // only one that matters here — IT IS AN OUTLINE. Both forearms come in to
    // meet at the buckle, so the light shirt band gains a dark V under it and
    // the two gaps between arm and ribs open up. At 214x120 that is a torso with
    // a notch cut out of each side; hanging arms are a rectangle. It costs six
    // lerps on a frame where he is not moving.
    //
    // GATED THE OPPOSITE WAY TO `brace`, DELIBERATELY. Hands on knees is what a
    // blown man does; thumbs in the belt is what a man with his wind does. They
    // cannot both be true, and `1 - u.brace` is the term that makes the handover
    // continuous rather than a snap when fatigue crosses a line. Standing at the
    // desk he hooks up over about a second; the frame he starts walking it lets
    // go, so it never survives into a chase and never touches one.
    const wantHook = (!moving && F < 0.42 && !boosted) ? clamp((0.42 - F) / 0.22, 0, 1) : 0;
    u.hook = lerp(u.hook || 0, wantHook, ed(wantHook > (u.hook || 0) ? 3.4 : 6.0));
    const hk = u.hook * (1 - u.brace);
    if (hk > 0.01) {
      // Hands forward and INWARD to the buckle. The arm has one pivot and a
      // baked elbow, so "thumbs in the belt" is really "forearms converging" —
      // which is the part that reads, and the part that does not (a thumb
      // actually hooked over leather) is 20 mm on a 1.72 m man.
      // TUNED BY RENDERING IT, and the first cut is worth recording because it
      // is a lesson about THIS body rather than about the pose. At -0.50 / 0.30
      // his hands met over the front of the gut and both arms disappeared into
      // his own outline — because he is 1.62 girth and the widest thing on him
      // is his stomach, so anything that brings the arms inboard hides them.
      // Shallower and wider puts the hands down ON the belt at the sides of the
      // buckle, where the arms stay at the edge of the silhouette and the gut
      // hangs between them. A thin man could have the clasped version; he
      // cannot, and that is the correct reason to reject a pose.
      r.armL.rotation.x = lerp(r.armL.rotation.x, -0.44 - w * 0.03, hk);
      r.armR.rotation.x = lerp(r.armR.rotation.x, -0.44 - w * 0.03, hk);
      r.armL.rotation.z = lerp(r.armL.rotation.z, 0.02, hk);
      r.armR.rotation.z = lerp(r.armR.rotation.z, -0.02, hk);
      // ...and he squares up a little while he is doing it. A man with his
      // thumbs in his belt is not slumped; that is most of the attitude in it.
      r.chest.rotation.x = lerp(r.chest.rotation.x, r.chest.rotation.x - 0.05, hk);
    }

    // Shaken off by a shoulder barge: arms up, off balance, facing the way the
    // man came from. Reads as a beat lost rather than a freeze.
    if (stagF > 0) {
      const f = stagF;                    // solved above, and fed to o.sink
      r.chest.rotation.z += f * 0.34;
      r.chest.rotation.x -= f * 0.30;
      r.armL.rotation.x -= f * 1.5; r.armR.rotation.x -= f * 1.1;
      r.armL.rotation.z += f * 0.5; r.armR.rotation.z -= f * 0.35;
      // The 50 mm of pelvis drop that used to be here is `o.sink` now. See the
      // note over stagF: written down here it unpinned both of his feet for the
      // whole beat, because poseWalk had already placed them.
    }

    // ---- the belt, out of phase --------------------------------------------
    // Eight kilos of leather hung off a man's hips does not travel with them.
    // The torch and the keys go with it because they are welded into the same
    // merged mesh.
    //
    // ROUND 1 (cop) — IT LAGS THE PELVIS, NOT A SINE THAT USED TO BE IN PHASE
    // WITH ONE. This was four hand-tuned constants against `sin(phase - 1.15)`
    // and `sin(2*phase - 1.5)`, and the phase they were tuned against has since
    // moved a quarter cycle (see the arm note above) — so the intent would have
    // survived the port and the numbers would not have. What a hanging mass
    // actually does is chase its mount at a finite rate, so: keep a LAGGED COPY
    // of the three pelvis channels and draw the belt at the difference. It is
    // one rule, `local = lagged - current`, it is right at every cadence
    // including standing still, and it cannot go out of phase with the walk
    // because it has no phase of its own.
    if (r.beltGrp) {
      const kb = ed(K.copBeltLag);
      u.beltZ = lerp(u.beltZ, r.hips.rotation.z, kb);
      u.beltYaw = lerp(u.beltYaw, r.hips.rotation.y, kb);
      u.beltH = lerp(u.beltH || r.hipY, r.hips.position.y, kb);
      u.beltX = lerp(u.beltX, r.hips.position.x, kb);
      r.beltGrp.rotation.z = (u.beltZ - r.hips.rotation.z) * K.copBeltSwing;
      r.beltGrp.rotation.y = (u.beltYaw - r.hips.rotation.y) * K.copBeltSwing;
      r.beltGrp.position.y = (u.beltH - r.hips.position.y) * K.copBeltSwing - heave * 0.006;
      r.beltGrp.position.x = (u.beltX - r.hips.position.x) * K.copBeltSwing;
    }
    r.shirt.emissive?.setHex(boosted ? 0x1d3a12 : 0x000000);
  }

  // ---- shopper / thief update ---------------------------------------------
  // ---- ROUND 12: SHOPPERS STAND AT THE SHELF, NOT ON THE CENTRE LINE ------
  //
  // The lead measured this on the live build: only 2 of 14 bodies were within
  // 1.4 m of a takeable facing at any moment, because this function picked
  // `aisleX(i) + rr(-1.15, 1.15)` and that is the middle of the lane. Two
  // consequences, and the second one is worth more than the first:
  //   - a reach animation would mostly be reaching AT NOTHING. Closing the last
  //     metre and a half is part of the gesture, not a preamble to it.
  //   - fourteen bodies on one line is why the crowd read as a police lineup.
  //     In the reference photographs people are up against the fixture at
  //     varied depths, occluding each other.
  //
  // Measured, on the shipped store: the nav's own free edge is 1.46 m off
  // centre in six aisles and 1.02 m in the narrow one, and from there a hand
  // extended 0.25 m finds a facing 0.40-0.74 m away in 9 of 10 probes. So the
  // shelf is reachable from a legal standing position everywhere, and this
  // needs no collider change from anybody — it needed the target to ask.
  //
  // THE DRAW COUNT IS UNCHANGED, AND THAT IS NOT A STYLE POINT. This file's
  // header records a round where swapping one rolled call for a named one moved
  // measured compliance 32.5% -> 27.5% and the published likelihood ratio
  // 1.95 -> 2.33, having touched no probability at all: the seeded stream had
  // simply walked. So the lateral offset still comes from ONE `rr(-1.15, 1.15)`
  // and that one draw is re-read rather than supplemented — its sign picks the
  // side and its magnitude decides shelf-versus-centre and how far in. Same
  // draws, same order, same count, on both branches.
  function wanderTarget(s) {
    const i = rnd() < 0.55 ? s.aisle : ri(0, AISLE_COUNT - 1);
    s.aisle = i;
    const u = rr(-1.15, 1.15);
    const z = rr(-HALF_LEN + 1.2, HALF_LEN - 1.2);
    const cx = aisleX(i);
    const cut = 1.15 * (1 - K.shelfOdds);        // |u| below this = the centre
    const side = u < 0 ? -1 : 1;
    let x = cx + u, sideOut = 0;
    if (Math.abs(u) >= cut) {
      // Walk outward from the centre line until the nav says no, then stand a
      // hand's breadth inside that. Costs no draws, adapts to whichever aisle
      // this is, and is the only thing in the file that has to know the store's
      // actual width.
      const t = (Math.abs(u) - cut) / Math.max(1e-6, 1.15 - cut);
      const want = lerp(K.shelfNear, K.shelfFar, t);
      let d = 0;
      for (let k = 0; k <= 14; k++) {
        const trial = 0.35 + k * 0.08;
        if (trial > want) break;
        if (!nav.free(cx + side * trial, z)) break;
        d = trial;
      }
      if (d >= K.shelfNear - 0.24) { x = cx + side * d; sideOut = side; }
    }
    s.shelfSide = sideOut;
    return { x, z };
  }

  // How fast the thief can ACTUALLY run right now.
  //
  // K.thiefRun is his ceiling for the first couple of seconds, not his cruise.
  // He is a shoplifter with a jacket full of steaks; he blows up on roughly the
  // same clock the cop does. Without this the chase is a straight speed subtract
  // — thief 5.35, cop 5.05 — and the gap grows 0.30 m/s forever, so the only way
  // it ever ends is the cop tripping over a free powerup. That is what the bench
  // caught. With it, both of them gas out around the same time, the gap parks a
  // couple of metres out, and every time the cop gets his wind back he surges
  // and very nearly touches him.
  //
  // The one concession to drama: footsteps right behind you find you another
  // gear. Adrenaline is drawn from the same tank and empties it faster, so a
  // thief who has already been run down once cannot keep doing it.
  function thiefPace(s, copD, dt) {
    const near = clamp((K.thiefPanicGap - copD) / K.thiefPanicBand, 0, 1);
    s.wind = clamp(s.wind - dt * (1 + near * 1.4) / K.thiefWind, 0, 1);
    // Adrenaline is a SECOND tank and it is finite.
    //
    // It has to drain on PRESSURE, not on `near`. Draining it on `near` was a
    // bug with a very specific signature and the bench printed it: a chase
    // settles at the gap where the surge exactly matches the cop, which is just
    // inside thiefPanicGap, so `near` sits around 0.1, the tank drained at 0.02
    // a second and refilled at 0.15, and the man had infinite adrenaline again
    // at exactly the distance where it mattered. Every escape in the sample had
    // a closest approach of 2.8-3.3 m. Pressure starts at six metres — the point
    // where he can hear you — and it does not care whether you have closed the
    // last three.
    const press = clamp((K.thiefPanicGap + 3.0 - copD) / 3.0, 0, 1);
    s.adren = clamp(s.adren - dt * press / K.thiefAdrenD
                            + dt * (1 - press) * K.thiefAdrenBack, 0, 1);
    // ======================================================================
    // ROUND 9 (2nd pass) — HIS LEGS GO TOO. THE THIRD TANK.
    //
    // Round 5 named this and did not build it: "the lever I would actually try
    // is giving the THIEF the same rhythm the cop just got — a cruise that
    // decays under sustained pressure instead of a flat floor". It called it a
    // round rather than an afternoon. It is the round.
    //
    // WHY IT HAD TO EXIST BEFORE ANY CRUISE NUMBER COULD MOVE. His cruise was
    // a FLOOR: he fell to it in 2.6 s and held it for the rest of his life. So
    // it was a single number that had to be two incompatible things at once —
    // fast enough that a stern chase is a race, and slow enough that a stern
    // chase ever ends. Swept at n=100 on the fixed bot, difficulty 1, `cut`
    // off0, it is a cliff and not a curve (this is the FLAT floor, swept via
    // agents.override so config could not shadow it):
    //   flat cruise         no drink   drink   MEDIAN MISS   p90 MISS
    //     0.575  3.08 m/s     89%       100%      1.70 m       1.93 m
    //     0.620  3.32         88%        98%      1.81         2.02
    //     0.680  3.64         74%        85%      3.07        40.91   <-- !
    //     0.740  3.96         67%        73%      2.51         9.29
    // 0.68 is the catch rate the brief wants and it loses TEN PER CENT OF ITS
    // CHASES BY FORTY METRES, which is the one thing PROMPT.md forbids by name
    // ("you should lose by a few feet, not half a store"). That is not a tuning
    // accident, it is what a flat floor means: the moment his cruise clears the
    // cop's rationed sustain (~3.7 m/s), a chase that starts behind NEVER comes
    // back, and the gap grows for as long as the trial lasts.
    //
    // So the floor decays. `legs` is a third tank on top of wind and adrenaline
    // — it drains only while he is actually running, it does not come back
    // inside a chase, and it takes his cruise from `thiefTired` (fresh, fast
    // enough to hold off a cop who is merely pacing himself) to `thiefSpent`
    // (blown, slow enough that the cop always reels him in eventually).
    //   fresh, 0-4 s   3.64 m/s   vs a rationing cop's ~3.7 — a real race
    //   blown, 12 s+   2.73 m/s   vs the same 3.7 — he is coming back to you
    // The chase therefore has a SHAPE: he opens a gap, he holds it while your
    // lungs and his legs argue, and then one of the doors or one of the two of
    // you gives out first. That is the "barely losing" the brief asks for, and
    // it is why the miss distribution can be tight at a catch rate this low.
    //
    // THE BOT'S MODEL IS DELIBERATELY LEFT FLAT. botGoal's `tSpd` is still
    // K.thiefRun x K.thiefTired, i.e. the FRESH cruise, so the bot over-
    // estimates a blown man and picks intercepts further down his route than it
    // needs to. That is conservative, it is what a player who cannot see a
    // stamina bar over the thief's head would do, and it keeps this out of the
    // POISONED-LEVER trap in the file header — the trap is a change that moves
    // the thief without moving the bot's model of him, and the failure mode is
    // the bot getting a free read. Over-estimating is the safe side of it.
    // THE BOT'S MODEL OF HIM IS NOT LEFT FLAT, AND THE FIRST DRAFT OF THIS
    // ROUND GOT THAT WRONG. I shipped a version where `tSpd` in botGoal still
    // read his OLD constant cruise, on the argument that a player cannot see a
    // stamina bar over a thief's head — which is true, and is also how you
    // would describe a difficulty lever wearing a fidelity costume. Measured,
    // n=200, moving ONLY the estimate: 66.0% / 77.0% / 80.5% as the bot models
    // him at his blown / midpoint / fresh cruise. FOURTEEN AND A HALF POINTS.
    // The full write-up and the fix — one `K.botCruise` getter that botGoal,
    // the dead-reckoning and thiefCruise() all call — is at K.thiefFreshMul.
    if (s.bolted) s.legs = clamp(s.legs - dt / K.thiefLegs, 0, 1);
    const floor = lerp(K.thiefSpent, K.thiefFresh, s.legs);
    const cruise = lerp(floor, 1, s.wind);                     // opening sprint, fading
    const surge = lerp(floor, K.thiefPanic, near * s.adren);   // fear, and it runs out
    s.dbgNear = near;
    s.dbgFloor = floor;
    return K.thiefRun * Math.max(cruise, surge);
  }

  // Escape direction, read off the exit field. No repathing, no waypoint list
  // and no thrash — and it cannot point at a wall, which is the entire reason
  // this file no longer navigates off config.js's floor plan.
  function navToExit(s, flee, dt) {
    // Re-reading the field every frame is pure cost: the aim point is stable for
    // several metres of running. Refresh it on a timer, when he reaches it, or
    // when it stops being something he can see.
    s.aimT -= dt;
    const px = s.position.x, pz = s.position.z;
    let a = s.aim;
    if (!a || s.aimT <= 0 || dist2d(px, pz, a.x, a.z) < 0.85 || !nav.clearSeg(px, pz, a.x, a.z)) {
      // A runner reads the cop-priced field and looks further down it, because
      // committing to the back of the store is a decision you cannot make while
      // only looking six metres ahead.
      // Strolling out, he is walking to the door he means to use. Running, he
      // reads the cop-priced field, which is seeded from every door with HIS
      // one discounted — see updateFlee. Either way it is his choice and not a
      // fact about his coordinates.
      const F = flee ? escapeField()
        : (exitFs[Math.min(s.doorPref, exitFs.length - 1)] || exitF);
      const d = nav.steer(F, px, pz, { look: flee ? 11.0 : 6.5 });
      s.aimT = 0.13;
      a = s.aim = d ? { x: d.tx, z: d.tz } : null;
    }
    if (!a) {
      const dx = EXIT.x - px, dz = EXIT.z - pz;                     // sealed pocket
      const m = Math.hypot(dx, dz) || 1;
      return { x: dx / m, z: dz / m, dist: m };
    }
    const dx = a.x - px, dz = a.z - pz;
    const m = Math.hypot(dx, dz) || 1;
    return { x: dx / m, z: dz / m, dist: m };
  }

  // Is the cop standing between this shopper and the way he is walking out?
  // `s.aim` is the route point navToExit last handed him, so this is "is that
  // man on my line", not "is that man near me".
  function seesBlocker(s, copD) {
    const a = s.aim;
    if (!a || copD < 1e-3) return false;
    let rx = a.x - s.position.x, rz = a.z - s.position.z;
    const rm = Math.hypot(rx, rz);
    if (rm < 0.25) return false;
    rx /= rm; rz /= rm;
    const ux = (cop.position.x - s.position.x) / copD;
    const uz = (cop.position.z - s.position.z) / copD;
    if (ux * rx + uz * rz < K.thiefBlockCos) return false;
    return nav.clearSeg(s.position.x, s.position.z, cop.position.x, cop.position.z);
  }

  // Is the cop bearing down on this shopper under his own steam?
  function copClosingOn(s, copD) {
    const u = cop.userData;
    if (u.speed < K.harassSpeed || copD < 1e-3) return false;
    const dx = s.position.x - cop.position.x, dz = s.position.z - cop.position.z;
    return (u.vel.x * dx + u.vel.z * dz) / (u.speed * copD) > K.harassAim;
  }

  // =========================================================================
  // ROUND 6 — THE DECOY CLIPS AND THE MAN ON THE DOOR
  // =========================================================================

  // Start a clip. `kind` is 'steal' | 'decoy' | 'putback'; the roll comes off
  // the same seeded rnd() every other decision in this file uses, so a bench
  // trial replays exactly. The clip's LENGTH is ramped (see K.tellMul), and it
  // is ramped for decoys and steals alike — slowing only the steal would make
  // clip length the tell and give the whole ambiguity back.
  // =========================================================================
  // ROUND 12 — THE SHELF ACTUALLY LOSES THE ITEM.
  // =========================================================================
  // Client: "when they pick something up off of the shelf, they really should
  // remove it from the shelf."
  //
  // store.js exposes takeFacing(x,y,z,r) / putFacing(id) / facingsTaken(). It
  // removes the nearest visible product INSTANCE to a world point — the box
  // stops being drawn and a hole opens in the shelf with the back rank and the
  // rail tag visible through it — and hands back what left, so the thing in the
  // hand can be the thing that was on the shelf.
  //
  // -------------------------------------------------------------------------
  // THE ANTI-ORACLE ARGUMENT, WHICH IS THE ONLY REASON THIS IS SHAPED LIKE THIS
  // -------------------------------------------------------------------------
  // The store side cannot leak: takeFacing's whole signature is four numbers,
  // and its own header proves a thief's gap is byte-identical to a browser's.
  // The lead's follow-up is the exact right warning — THE ONLY PLACE A TELL CAN
  // ENTER IS THIS FILE. So:
  //
  //   1. THERE IS EXACTLY ONE TAKE SITE IN THE GAME. takeAt() is called from
  //      one place — the grasp frame of the browse reach — and the browse reach
  //      is scheduled off the RIG's idle clock, which no state transition can
  //      restart and which therefore cannot correlate with a state, let alone
  //      with guilt. This is round 9's argument for the idle pool, reused
  //      because it is the strongest one available.
  //      A CONCEALMENT NEVER TAKES ANYTHING. A thief conceals an item he is
  //      already carrying, because he picked it up two aisles ago looking
  //      exactly like everybody else. That is airtight AND it is what actually
  //      happens in a shop. The rejected alternative — wire takeFacing into
  //      every clip that shows a prop — leaks, because the clips author
  //      different arm angles at the frame `vis` turns on, so the three steals
  //      would take from a different HEIGHT than the seven decoys and only
  //      thieves play the steals.
  //   2. THE THREE FUNCTIONS TAKE NOTHING BUT `s`. takeAt(s) / putBack(s) /
  //      stow(s). No `guilty`, no `kind`, no options bag that could grow one —
  //      the same argument decoy.js makes about applyGesture, and the same
  //      argument the store makes about takeFacing's four numbers.
  //   3. THE PUT-BACK ODDS ARE A PROPERTY OF THE REACH, NOT OF THE REACHER.
  //      `reachPut` is one constant rolled the same way for every body, and the
  //      two tails of the reach are spliced onto one shared head in decoy.js so
  //      they cannot drift apart.
  //   4. A CARRIED ITEM IS CONSUMED BY WHATEVER CLIP COMES NEXT, and every clip
  //      in the file that shows a prop ends with `vis: 0`. A steal, a handoff
  //      to a child, a restash into a coat and a phone going back in a pocket
  //      all end the same way and all call stow(); only a put-back calls
  //      putFacing. That is one branch, on the clip's own `tell`, and the
  //      put-back pool is reachable by innocent and guilty alike — which is
  //      what LR(putback) has always measured.
  //
  // The store builder's other warning is honoured too: putFacing's 22% wrong
  // restore is the store's coin and this file does not add jitter on top of it.
  const STOCK_OK = typeof world.takeFacing === 'function'
    && typeof world.putFacing === 'function';
  // Where the grasping hand IS, in world metres. Solved off the rig — the
  // shoulder the arm actually hangs from, the arm length this body actually
  // has, and the yaw the body is actually DRAWN at — for the same reason
  // decoy.js stopped authoring the prop's position: a hand solved from a
  // constant is 0.5 m from the hand you can see.
  function handWorld(s, out) {
    const r = s.rig;
    const AL = r.armLen + K.grabOut;
    const az = r.armR.rotation.z, ax = r.armR.rotation.x;
    const cz = Math.cos(az), sz = Math.sin(az), cx = Math.cos(ax), sx = Math.sin(ax);
    // rig-local, arm hanging down its own -Y off the shoulder
    const lx = r.armR.position.x + AL * sz;
    const ly = r.hipY + r.armR.position.y - AL * cz * cx;
    const lz = -AL * cz * sx;
    const sc = r.root.scale.x || 1;
    const yaw = s.mesh.rotation.y;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // three.js Euler-Y: x' = x cos + z sin, z' = -x sin + z cos
    out.set(
      s.position.x + (lx * sc) * cy + (lz * sc) * sy,
      ly * sc,
      s.position.z - (lx * sc) * sy + (lz * sc) * cy,
    );
    return out;
  }
  // TAKE. One call site's worth of logic, reachable from two places, neither of
  // which can see guilt. Returns true if the shelf actually lost something.
  const TAKE = { attempts: 0, hits: 0, dSum: 0, ySum: 0 };
  function takeAt(s) {
    if (!STOCK_OK || s.facing) return false;
    handWorld(s, s.grabHand);
    TAKE.attempts++;
    const h = world.takeFacing(s.grabHand.x, s.grabHand.y, s.grabHand.z, K.grabR);
    // A miss is ordinary and must stay ordinary: pallet stacks, cart loads and
    // the donut table are deliberately not takeable, and the search is
    // grid-local, so "there is no shelf in front of me" is a real answer. The
    // gesture plays out identically either way — with the generic goods box in
    // the hand, which is what every clip in this file had before this round.
    if (!h) return false;
    s.facing = h;
    TAKE.hits++; TAKE.dSum += (h.d || 0); TAKE.ySum += s.grabHand.y;
    s.tookN++; s.takeYSum += h.y === undefined ? s.grabHand.y : s.grabHand.y;
    s.takeDSum += (h.d === undefined ? 0 : h.d);
    // THE PROP BECOMES THE THING THAT LEFT. Size in metres straight off the
    // handle; `held` is a unit-ish box so the scale is the size, and the clip's
    // own `item` triple then rides on top of it as a per-clip fudge.
    s.held.material.color.setHex(h.colour);
    s.itemSize = h.size;
    s.grabT = 0.28;                     // the box travels OFF the shelf, not into a fist
    return true;
  }
  // PUT IT BACK. The shelf gets it again, in the store's own transform, wrong
  // 22% of the time by the store's own coin.
  function putBack(s) {
    if (!s.facing) return false;
    const ok = STOCK_OK && world.putFacing(s.facing.id);
    s.putN++;
    s.facing = null; s.itemSize = null;
    return ok;
  }
  // IT WENT IN THE CART / THE COAT / THE BAG / A CHILD'S HANDS. The handle is
  // dropped without restoring, so the gap stays until the store's own FIFO
  // closes it — on the same clock, at the same age, for every caller.
  function stow(s) { s.facing = null; s.itemSize = null; }

  function startGesture(s, kind, forceId) {
    const g = forceId ? BY_ID.get(forceId) : pickGesture(rnd, kind);
    if (!g) return null;
    s.gest = g;
    s.gestD = g.dur * K.tellMul;
    s.gestT = s.gestD;
    return g;
  }
  // ---- ROUND 8: THE PUT-BACK, AND A NOTE ABOUT THE RANDOM STREAM ----------
  // There are two put-back clips now — round 6's, which opens with his hand
  // already inside his coat, and `putbackPA`, which opens on the same
  // half-second every other answer to an announcement opens on. Which one plays
  // is decided by WHY, not by a roll.
  //
  // And that is where this function comes from, rather than from tidiness.
  // startGesture ROLLS a clip when it is given a kind and NAMES one when it is
  // given an id, and a roll costs a draw off the shared seeded rnd() while a
  // name costs nothing. Swapping a rolled call site for a named one therefore
  // shifts every subsequent decision in the building — I did exactly that, and
  // it moved measured innocent compliance from 32.5% to 27.5% and the published
  // likelihood ratio from 1.95 to 2.33, in a change that touched no
  // probability anywhere. Nothing about the picture was wrong; the stream had
  // simply walked.
  //
  // So the roll is taken either way and only its RESULT is overridden. The
  // stream is byte-identical to round 7 and the ablation in this file's header
  // proves it to the decimal.
  function startPutback(s, viaPA) {
    const rolled = pickGesture(rnd, 'putback');
    return startGesture(s, 'putback', viaPA ? 'putbackPA' : rolled.id);
  }

  // Clock only. The POSE is applied in animateShopper, so a body nobody is
  // looking at costs one subtraction per frame and not a keyframe sample.
  function tickGesture(s, dt) {
    if (!s.gest) return false;
    s.gestT -= dt;
    if (s.gestT > 0) return true;
    // ---- ROUND 12: WHERE THE ITEM WENT, AND IT IS ONE BRANCH ---------------
    // `puts` is a bit on the CLIP — see decoy.js — carried by exactly the three
    // clips that end with something back on a shelf. Everything else in the
    // file ends `vis: 0` with the object gone: three steals, six of the seven
    // decoys, and the reach's cart tail. So a concealment, a handoff to a
    // child, a phone into a pocket and a tin into a trolley all take the same
    // line of code, and only a put-back calls world.putFacing.
    //
    // It is here rather than in clearGesture() ON PURPOSE. clearGesture also
    // fires when a clip is CUT OFF — a startle interrupting a reach — and a man
    // who was holding a box a moment before an alarm is a man still holding a
    // box. Cutting a clip must not teleport merchandise onto a shelf.
    if (s.facing) { if (s.gest.puts) putBack(s); else stow(s); }
    clearGesture(s);
    return false;
  }
  // Round 8 — factored out of tickGesture, because the startle is the first
  // clip in the file that is ENDED BY A STATE CHANGE rather than by its own
  // clock: paBolt flips him to `bolt` on the frame the run-up finishes and the
  // arms have to go back to the runner at the same instant. Everything here was
  // already in tickGesture and none of it moved.
  function clearGesture(s) {
    s.gest = null; s.gestT = 0; s.turnY = 0;
    s.held.visible = false;
    s.held.scale.set(1, 1, 1);
    // ROUND 9 — and the hand goes back to being a hand. The swap is driven from
    // inside the clip branch of animateShopper, which a cleared clip never
    // reaches again, so this is the only place that can undo it. Left out, a man
    // who was mid-bird when the startle cut him off spends the rest of the shift
    // pushing a trolley with one finger extended.
    if (s.rig.birdOn) { s.rig.birdOn = false; s.rig.handR.geometry = s.rig.handGeo; }
    s.annAt = null;
    // Parked INSIDE the torso rather than left wherever the clip dropped it.
    // Invisible children are pruned by cctv/track.js's measure(), but they are
    // NOT pruned by Box3.setFromObject, which is the bug in CLAUDE.md that made
    // every shopper in this store 2.38 m tall. Do not leave props in the air.
    s.held.position.set(0.18, 1.02, 0.14);
  }

  // ---- is the guard posted on the only way out? ----------------------------
  // Route metres, not a straight line: a cop the same distance away on the far
  // side of a gondola is not standing on the door, and a man deciding whether
  // to steal something can tell the difference. Decays 2.2x faster than it
  // builds, so stepping off the door for a second and a half clears it — the
  // player is not locked out of the front of his own store, he just cannot LIVE
  // there.
  // ---- can he still get there first? ---------------------------------------
  // Both distances are ROUTE metres off the same exit flood, so a cop ten
  // metres away through a gondola is not "in front of him" and the answer knows
  // it. `nerve` is the per-subject roll that already decides whether he will
  // chance your shoulder (nerveLo 0.55 = bold), so a bold man needs less
  // daylight to go for it and a nervous one needs more — two identical-looking
  // dispatches do not play out the same way, which is what nerve is for.
  function beatsCopToDoor(s) {
    const mine = toExit(s.position.x, s.position.z);
    const his = toExit(cop.position.x, cop.position.z);
    if (!isFinite(mine) || !isFinite(his)) return true;
    return mine < his * K.raceEdge + K.raceSlack / Math.max(0.35, s.nerve || 1);
  }
  // IS HE BEING HELD OFF. Both halves are needed and the pair of them is the
  // whole one-exit design:
  //
  //   posted   — the cop is STOPPED, on the way out, and has been for deterT.
  //              Not "the cop is in front of him": the dispatch puts the cop in
  //              the mouth of his aisle EVERY SINGLE TIME, so a rule that reads
  //              "is he between me and the door" fires on every chase in the
  //              game. Measured: gating the bolt on the race alone took the
  //              competent bot to 32.5% with 21 of 40 trials ending in a
  //              ditched item — i.e. it deleted the chase. A man MOVING is a
  //              man to run past. A man PARKED IN THE DOORWAY is not.
  //   !beatable— and he cannot get there first anyway. A thief three metres
  //              from the door with the cop eight metres off it still goes.
  const heldOff = (s) => doorPosted() && !beatsCopToDoor(s);

  // He has decided he cannot make it. Back into the shelf runs, look busy, and
  // wait for you to get bored. `stall` runs from here; see dumpGoods().
  function turnBack(s) {
    s.state = 'walk'; s.timer = rr(2.5, 6.0); s.path = []; s.aim = null; s.aimT = 0;
    s.target = { x: aisleX(ri(0, AISLE_COUNT - 1)) + rr(-1.0, 1.0), z: rr(0.5, HALF_LEN - 2) };
    // ROUND 2 (character) — THE "LOOK BUSY" EFFECT IS GONE AND THE DRAW STAYS.
    //     s.gestIn = Math.min(s.gestIn, rr(0.4, 2.5));   // look busy
    // Only a body that has concealed something ever turns back, so this pulled
    // the decoy scheduler from its 9-22 s to under 2.5 s FOR GUILTY BODIES
    // ONLY — about a fivefold rate, arriving exactly when the player is camping
    // the door and watching the aisles. "The one fiddling with his phone every
    // two seconds" is the same class of tell as the drift walk that this round
    // exists to kill, and it is worse than that one because it is a rate on the
    // decoy system itself, whose whole claim is that the scheduler has never
    // seen `s.guilty`. He goes back to the crowd's own schedule; the theatre of
    // hanging back in the aisles is the stall, not the clip rate.
    // THE DRAW ITSELF STAYS, AND ITS RESULT IS THROWN AWAY. This file's header
    // records a single misplaced rnd() moving a published likelihood ratio from
    // 1.95 to 2.33 in a change that touched no probability anywhere, and
    // turnBack fires inside the bench. Deleting the line outright measured
    // 58.5% against 59.5% with the draw kept, at n=200, seed 1234,
    // difficulty 1 — a full point of chase, bought back for one dead call.
    // Removing the BEHAVIOUR is the whole point; moving the seeded stream
    // underneath every number in this file is not, and the two are separable.
    void rr(0.4, 2.5);
  }
  // ---------------------------------------------------------------------
  // ROUND 2 (character) — HOW THIS PERSON WALKS OUT OF A SHOP.
  //
  // ONE derivation, read by BOTH `leave` and `drift`, which is why it is a
  // function and not two literals. `pace` multiplies thiefWalk; `lookAmp` and
  // `lookRate` are the head swivel on the way. All three come off `hash2(id)`,
  // which is a PERSON: it is fixed for the life of a body, it is the same
  // number whether that body is armed this shift or not, and it costs the
  // seeded stream nothing (see the header's note on rnd() draws).
  //
  // Quantised to `exitPaceN` buckets so a pace is shared by several people
  // rather than being a fingerprint. With 14 bodies and 5 buckets, roughly
  // three people walk out at any given pace.
  // ---------------------------------------------------------------------
  // ONE scratch object, reused, for the same reason `_G` is: this is called once
  // per body per frame and 25 bodies at 60 Hz is 1,500 allocations a second for
  // four numbers. Nothing holds a reference across a frame.
  const _PC = { u: 0, pace: 1, lookAmp: 0, lookRate: 0 };
  function paceOf(s) {
    const n = Math.max(2, Math.round(K.paceN));
    const u = Math.min(n - 1, Math.floor(hash2(s.id + 4801, 0) * n)) / (n - 1);
    _PC.u = u;
    _PC.pace = lerp(K.paceLo, K.paceHi, u);
    _PC.lookAmp = lerp(K.exitLookLo, K.exitLookHi, u);
    _PC.lookRate = lerp(K.exitLookRateLo, K.exitLookRateHi, u);
    return _PC;
  }
  // THE ASSERTION, in the shape CLAUDE.md names. `drift` and `leave` now share
  // one code path, so the failure this guards against is not the two of them
  // disagreeing — it is somebody widening the band so that the top of it stops
  // being reachable by an innocent body. That is the property the leak actually
  // violated, so that is what gets checked: over the live roster, the highest
  // walk-out pace any body can draw must also be drawn by at least two DIFFERENT
  // bodies, and the band must be non-degenerate.
  //
  // It cannot check guilt (guilt is re-rolled every shift and this runs once),
  // and it should not try to: the point is that the band has no guilt term in
  // it at all. Returns { ok, why } like lungCheck/paceCheck and is stamped onto
  // every bench result.
  // =========================================================================
  // ROUND 1 (cop) — copCheck(). THE RIG, NOT THE SOLVE.
  // =========================================================================
  // CLAUDE.md's rule, verbatim: "a numeric check earns you nothing about
  // geometry you have not rendered", and `gaitCheck()` passed while the rig was
  // visibly wrong seven times across two rounds. This is the half of it that
  // CAN be automated — the four preconditions the cop's walk silently degrades
  // through, each of which was actually false at some point in this round:
  //
  //   feetOk    the shoe search found a shoe in each leg group. It could not,
  //             for eleven rounds, because `copLeg` baked the oxford INTO the
  //             trouser and the group had one child. That is the entire reason
  //             he never got the round-12 walk.
  //   kneeOk    the leg split at the knee. Falls back to the telescope if the
  //             cut lands outside the leg — silently, which is why it is here.
  //   kneeCut   the cut passes through the CENTRE of the knee ball. figures.js
  //             hardcodes COP_ANKLE_Y to place that ball, and gait.js computes
  //             the cut from the shoe's measured bounding box; two derivations
  //             of one number, so they get an assertion rather than a comment.
  //   units     the plant identity is `v*T = 2*S`, and S comes out of a solve
  //             in ROOT-LOCAL metres while v is world. His root is scaled 1.04.
  //             Unfixed that is 4% of the foot's excursion handed to the stance
  //             foot as skate, and it is invisible in every still.
  //
  // It does NOT claim the walk looks right. Nothing numeric can. Render it.
  //
  // What poseWalk's units assertion found, live. Written ONLY by poseWalk and
  // read only by plantCheck(); it is declared up here rather than next to
  // poseWalk so it is initialised before either of them can be reached.
  const UNITS = { worst: 0, at: null, missing: 0, n: 0, scaled: 0, rollWorst: 0, rollAt: null };
  const _PINV = new THREE.Vector3();     // plantCheck's pin-axis row only
  function copCheck() {
    const r = cop.userData.rig, bad = [];
    if (!r.feetOk) bad.push('feetOk false: gait.js could not find a shoe inside the cop leg group. '
      + 'Check figures.js makeCop still adds F.cop.shoe as a second child of each leg pivot.');
    if (r.feetOk && !r.kneeOk) bad.push('kneeOk false: the leg did not split at the knee, so he is '
      + 'back on the round-12 telescope. Check COP_KNEE_Y against gait.js KNEE_F.');
    const f = r.footL;
    let cutErr = null;
    if (f && f.knee) {
      cutErr = +((f.kneeY - COP_KNEE_Y) * 1000).toFixed(2);
      if (Math.abs(cutErr) > 1.0) bad.push('the knee cut is ' + cutErr + ' mm off the knee ball '
        + 'figures.js baked for it. One of COP_ANKLE_Y, the shoe geometry or gait.js KNEE_F moved '
        + 'without the other two. The joint will open a wedge at flexion.');
    }
    // The units, re-derived rather than trusted: how far the body travels in a
    // cycle, against how far the drawn foot does.
    const rootS = cop.scale.x || 1;
    const v = K.copWalk, L = r.hipY;
    const S = stepLength(v / rootS, L, K.copStride, true);
    const groundPerCycle = 2 * S * rootS;          // what the FOOT sweeps, world
    const bodyPerCycle = v * (2 * S / (v / rootS));  // what the BODY travels, world
    // ---- ROUND 3 (move): THIS ROW CANNOT FAIL AND NEVER COULD -------------
    // `bodyPerCycle = v * (2*S / (v/rootS))` is `2*S*rootS` after one
    // cancellation, and `groundPerCycle` is `2*S*rootS` as written, so the two
    // are algebraically identical for every value of every input. It has read
    // 0.000 mm since the day it was written and it would read 0.000 mm if
    // animateCop went back to `stepLength(u.speed, ...)` tomorrow — it
    // re-derives the FIXED version rather than observing the live one. It is
    // kept because the prose in it is the clearest statement of the identity,
    // and it is labelled so nobody quotes the zero as evidence again. The row
    // with teeth is plantCheck().unitsWorstMM, which compares two numbers that
    // come from different places.
    const unitErr = +((bodyPerCycle - groundPerCycle) * 1000).toFixed(3);
    return {
      ok: bad.length === 0, bad,
      feetOk: !!r.feetOk, kneeOk: !!r.kneeOk,
      kneeCutErrMM: cutErr, rootScale: +rootS.toFixed(4),
      unitErrTautology: unitErr,
      stepM: +S.toFixed(3), cadenceHz: +((v / rootS) / (2 * S)).toFixed(3),
    };
  }

  // =========================================================================
  // ROUND 3 (move) — plantCheck(). THE UNITS AND THE PIN, FOR EVERYBODY.
  // =========================================================================
  // Round 1 gave the cop `vLocal` and `pinRoll` as flags and left the fourteen
  // on the old path; this round deleted both flags, so the guarantee that used
  // to be "the crowd is provably unmoved because it takes a different branch"
  // has to be replaced by something. This is it, and it is two claims:
  //
  //   unitsWorstMM   what poseWalk actually saw. Every caller hands it the
  //                  speed twice — once root-local, once world — and their
  //                  ratio must be that rig's own root scale. This is NOT a
  //                  tautology like copCheck's row above: the two numbers are
  //                  produced by different code, and a caller that goes back to
  //                  `speed: s.speed` fails it on thirteen of fourteen bodies
  //                  within one frame of that body walking. It reads the LIVE
  //                  worst since boot, so it is only meaningful once something
  //                  has walked — `frames` says whether anything has.
  //
  //   rollPinFlat    the sole pin's roll term must collapse to the flat pin at
  //                  zero list, or deleting `pinRoll` moved a body that is not
  //                  listing. Re-derived here from the same expression, at the
  //                  same clamp, over the roster's own stance widths.
  //
  // It cannot tell you the walk looks right. Nothing numeric can. Render it.
  function plantCheck() {
    const bad = [];
    const worstMM = +(UNITS.worst * 1000).toFixed(3);
    // ---- AND IT MUST SAY WHEN IT HAS SEEN NOTHING --------------------------
    // AGENTS_BRIEF: "a self-test that runs on an empty sample proves nothing."
    // On a freshly loaded page nobody has walked, `UNITS.n` is 0, and this
    // would otherwise report `ok: true, worst 0.000 mm` having compared
    // nothing — the same shape as copCheck() reading false on a cop who has
    // not moved, which cost the lead a false alarm in the other direction.
    // A body whose root scale is exactly 1 also cannot fail the test, so the
    // sample that matters is `scaled`, not `n`.
    if (UNITS.scaled < 60) bad.push('nothing scaled has walked yet: poseWalk has checked '
      + UNITS.n + ' moving frames, ' + UNITS.scaled + ' of them on a body whose root is not '
      + '1.0. Walk the crowd (or run a bench) before believing this row.');
    if (UNITS.missing > 0) bad.push(UNITS.missing + ' poseWalk calls passed no worldSpeed, '
      + 'so the units of that call were never checked. Every caller must pass both.');
    if (worstMM > 1.0) bad.push('poseWalk was handed a speed ' + worstMM + ' mm/s away from '
      + 'worldSpeed / rootScale. The solve is in root-local metres and the store is not: '
      + 'the caller must take its step, its phase rate, its duty and this speed from '
      + 'gaitUnits(), or the stance foot skates by (rootScale - 1) of its own excursion.');
    // ---- THE PIN AT ZERO ROLL, THROUGH THE SHIPPED EXPRESSION -------------
    // pinRolled() is the function poseWalk calls; this calls the same one, over
    // the ROSTER'S OWN stance widths, leg rolls and hip-to-sole lengths, at
    // hz = 0. Nothing here retypes the formula, so it is not the `x / 1 === x`
    // check that copCheck's units row turned out to be. It is still only an
    // identity — but it is the identity the whole "a body with no list is
    // untouched" claim rests on, and it now fails if somebody edits pinRolled.
    let flatErr = 0;
    for (const s of shoppers) {
      const r = s.rig;
      if (r.stance0 === undefined) continue;
      const L = r.hipY, floorY = -L;
      for (const px of [r.stance0, r.stanceR0]) {
        for (const rz of [-0.12, 0, 0.12]) {
          flatErr = Math.max(flatErr, Math.abs(pinRolled(floorY, L, px, rz, 0) - floorY));
        }
      }
    }
    if (flatErr > 1e-9) bad.push('the roll-aware sole pin does not collapse to the flat pin '
      + 'at zero list (' + (flatErr * 1000) + ' mm). A body with no list has been moved.');
    // ---- ROUND 4 (move) — THE PIN'S AXIS, THROUGH THREE.JS'S OWN MATRICES --
    // The pin is a VERTICAL constraint. Until this round it was solved with a
    // translation along the knee frame's own Y, which is tilted by the shank and
    // the thigh, so every millimetre of lift also shoved the foot forward by up
    // to 0.76 mm — and since the tilt sweeps through stance, the shove swept
    // with it. On the cop that was +0.056 of the ground he covered, the biggest
    // single term in his stance skate.
    //
    // What makes this a check rather than a comment is where the second number
    // comes from. footPose's closed form composes the chain by hand, in the
    // pitch plane, for speed. This asks the SCENE GRAPH instead: pose a real
    // foot at two floors 10 mm apart, read the contact corner out of
    // shoe.localToWorld and back into the hips' frame, and require that it moved
    // 10 mm UP and nothing along the body. three.js's matrices know about the
    // toe yaw, the hip abduction and the leg group's non-uniform scale, none of
    // which the closed form does, so the two derivations are genuinely
    // independent and this row is not the tautology copCheck's units row is.
    // Ask what would turn it red: reinstating the one-axis pin reads 3-8 mm.
    //
    // The residual it does allow is real and second order — Rz(splay) and
    // Ry(toe) tilt the pin out of the pitch plane by sin(toe)*sin(splay), which
    // is 0.4 mm on a 44 mm lift at the cop's own angles.
    // `th` IS READ OFF THE LEG GROUP AND NOT PICKED, and getting that wrong is
    // how this row read 7.32 mm on its first run — on correct code. footPose
    // takes the hip angle as an ARGUMENT for its closed form but does not write
    // `legGroup.rotation.x`, so handing it a number the scene graph does not
    // have makes the two derivations disagree about the pose rather than about
    // the pin, and the row then measures the difference between two different
    // legs. The whole value of this check is that its two halves see the same
    // rig; a literal there quietly destroys that.
    let axisZ = 0, axisY = 0, axisN = 0, axisAt = null;
    for (const r of [cop.userData.rig, ...shoppers.map((x) => x.rig)]) {
      if (!r || !r.feetOk || !r.footL || !r.footR) continue;
      r.hips.updateWorldMatrix(true, false);
      for (const [f, grp, tag] of [[r.footL, r.legL, 'L'], [r.footR, r.legR, 'R']]) {
        const read = (floorY) => {
          footPose(f, 0.95, 0, grp.rotation.x, floorY);
          f.shoe.updateWorldMatrix(true, false);
          const a = r.hips.worldToLocal(f.shoe.localToWorld(_PINV.set(0, f.soleY, f.heelZ)));
          return { y: a.y, z: a.z };
        };
        const A = read(-0.80), B = read(-0.79);
        footRest(f);                       // next frame's poseWalk re-poses it
        const dz = Math.abs(B.z - A.z), dy = Math.abs((B.y - A.y) - 0.010);
        axisN++;
        if (dz > axisZ) { axisZ = dz; axisAt = tag; }
        if (dy > axisY) axisY = dy;
      }
    }
    if (!axisN) bad.push('pin axis: no rig has feet yet, so nothing was checked. '
      + 'Let a body walk (attachFeet runs lazily inside poseWalk) before believing this row.');
    if (axisZ > 0.0015) bad.push('the sole pin moved a contact corner ' + (axisZ * 1000).toFixed(2)
      + ' mm ALONG the body for 10 mm of lift, on foot ' + axisAt + '. The pin is a vertical '
      + 'constraint and it is being solved with a translation along a tilted axis again: see '
      + 'footPose, which must solve the 2x2 for (dy, dz) rather than dividing by `gain`.');
    if (axisY > 0.0015) bad.push('the sole pin moved a contact corner ' + ((axisY + 0.010) * 1000).toFixed(2)
      + ' mm vertically when it was asked for 10.00 mm.');
    return {
      ok: bad.length === 0, bad,
      unitsWorstMM: worstMM, unitsAt: UNITS.at, unitsMissing: UNITS.missing,
      unitsFrames: UNITS.n, unitsScaledFrames: UNITS.scaled,
      pinAxisFeet: axisN,
      pinAxisAlongMM: +(axisZ * 1000).toFixed(4), pinAxisUpErrMM: +(axisY * 1000).toFixed(4),
      rollPinFlatErrMM: +(flatErr * 1000).toFixed(6),
      // NOT a pass/fail: how far the roll term moved a floor, worst since boot,
      // and the pelvis roll it happened at. This is the size of what deleting
      // `pinRoll` did to the crowd.
      rollTermWorstMM: +(UNITS.rollWorst * 1000).toFixed(2), rollTermAtRad: UNITS.rollAt,
      rootScales: shoppers.map((s) => +s.rig.root.scale.x.toFixed(4)).sort((a, b) => a - b),
    };
  }

  function exitCheck() {
    const why = [];
    if (!(K.paceHi > K.paceLo)) why.push('walk pace band is degenerate');
    const buckets = new Map();
    for (const s of shoppers) {
      const w = paceOf(s);
      buckets.set(w.u, (buckets.get(w.u) || 0) + 1);
    }
    if (buckets.size) {
      const top = Math.max(...buckets.keys());
      if (top < 0.999) why.push('no body can draw the top of the pace band');
      if ((buckets.get(top) || 0) < 2) why.push(`only ${buckets.get(top) || 0} body draws the top pace — it is a fingerprint`);
    }
    return { ok: why.length === 0, why: why.join('; '), buckets: [...buckets.entries()].sort() };
  }

  function updatePost(dt) {
    const d = toExit(cop.position.x, cop.position.z);
    const posted = isFinite(d) && d < K.deterR && cop.userData.speed < K.deterSpeed;
    postT = posted ? postT + dt : Math.max(0, postT - dt * 2.2);
  }
  const doorPosted = () => postT > K.deterT;

  // He thought better of it. THIS IS THE WHOLE ONE-EXIT DESIGN IN ONE FUNCTION:
  // camping the door does not lower your catch rate, it removes the crime. The
  // shift produces no incidents, the wall stays quiet and the player earns
  // nothing — punished by income rather than by geometry, which is also exactly
  // what a real shoplifter does when he clocks a uniform by the door.
  //
  // Second balk and he is done with this store: he goes back to being a
  // customer and checks out. That matters, because otherwise a camped door
  // leaves two permanently-balking subjects in the building, game.js's
  // ensureThieves() sees `live >= 1` and never arms anybody else, and the
  // deadlock flatters the design by hiding it behind a spawn cap. Let them
  // leave and let the shift keep arming people; every one of them balks, and
  // the zero is an honest zero.
  //
  // ROUND 7 — WIDENED, NOT FORKED. `why` names the trigger ('balk' is the
  // round-6 posted-guard one and stays the default so nothing that reads it
  // changes) and `quit` makes this his last try in this store. The PA passes
  // quit:true, because the client's sentence ends "...and then just leave the
  // store peacefully" — a man told to put it back by a voice that clearly
  // already saw him does not stand around for thirty seconds and have another
  // go. It is also what stops the announcement being a TEMPO tool: without it,
  // announcing at a subject buys you a 14-30 s delay and then the same 100
  // points, and the deterrence would be worth more than the deterrence.
  function abortTheft(s, api, why, quit) {
    s.balk = 0; s.aborts++;
    s.chill = rr(K.chillLo, K.chillHi);
    s.stole = false;
    s.state = 'putback'; s.timer = 0; s.path = []; s.target = null;
    s.concealT = Math.max(s.concealT, s.chill + rr(1.5, 5.0));
    startPutback(s, why === 'announce');                                   // see dumpGoods
    if (quit || s.aborts >= 2) { s.guilty = false; s.leaving = true; s.shopT = 0; }
    api && api.onAbort && api.onAbort(s, why || 'balk');
  }

  // He already had it. He waited you out for `dumpT`, you did not move off the
  // door, so it goes back on a shelf and he walks out a customer. No arrest, no
  // merchandise loss, no points — the most expensive possible outcome for a
  // player whose whole plan was to stand on the exit.
  function dumpGoods(s, api, why) {
    s.stall = 0; s.aborts++;
    s.stole = false; s.guilty = false; s.leaving = true; s.shopT = 0;
    s.state = 'putback'; s.timer = 0; s.path = []; s.target = null; s.aim = null;
    // ROUND 8 — WHICH PUT-BACK. A man who ditched it because a uniform has been
    // stood on the door for eleven seconds plays round 6's clip, hand already
    // in his coat. A man answering a PA plays `putbackPA`, which opens on the
    // same half-second every other answer to a PA opens on. See decoy.js: the
    // difference is not decoration, it is that the round-6 clip would have made
    // his answer readable from the first frame.
    startPutback(s, why === 'announce');
    api && api.onAbort && api.onAbort(s, why || 'dump');
  }

  // =========================================================================
  // ROUND 7 — THE ANNOUNCEMENT. "HEY, PUT THAT BACK."
  //
  //   agents.announceAt(subject, kind, opts) -> { ok, why, id, kind, heard }
  //
  // Fired by game.js at whatever the spot monitor is locked on. It does not do
  // anything round 6 did not already do — a heeding subject ends in
  // abortTheft()/dumpGoods(), the same two functions a posted guard drives, so
  // a deterred thief is worth zero points on exactly the same path and there is
  // no new economics to get wrong. What is new is the TRIGGER (at range, at a
  // chosen man) and the second reaction: the one where he has no idea what you
  // are talking about.
  //
  // THE RETURN VALUE DELIBERATELY DOES NOT CONTAIN THE OUTCOME. It is rolled
  // when he reacts, ~0.6 s later, and delivered through the optional
  // api.onAnnounce(subject, kind, outcome) callback at the instant the clip
  // starts, so a HUD line cannot get ahead of the picture. `outcome` is
  // 'heed' | 'shrug' | 'hold' — what he visibly did, which is all the player
  // can see anyway. It is never his guilt.
  // ROUND 10 — THE FIRST-SHOUT POOL IS THREE CONFUSED MEN. `whoMeAffront` has
  // moved to the second rung (see LADDER); `whoMeLost` takes its place here.
  // Same length as it has been since round 7, so the single rnd() draw
  // lookAround() takes still maps uniformly over three ids and the stream is
  // where it was.
  const REACT_IDS = ['whoMe', 'whoMeLost', 'whoMeGlance'];

  // =========================================================================
  // ROUND 9 — THE ESCALATION LADDER. "MAYBE EVEN THE CUSTOMER FLIPS THE BIRD AT
  // THE SECURITY CAMERA."
  // =========================================================================
  // Four rungs, and WHICH ONE IS A PURE FUNCTION OF `s.annN` — how many times an
  // announcement has landed on this body, which is to say how many times the
  // PLAYER has shouted at him.
  //
  //   1st, 2nd  the round-8 four-beat shrug. Confused, cannot place it.
  //   3rd       hands on hips, or nothing at all, and he holds the camera.
  //   4th, 5th  the bird, deadpan, and one of the two is him saying something
  //             the player has no microphone to hear.
  //   6th+      he stops shopping, folds his arms, and waits for you to say
  //             something else.
  //
  // GUILT IS NOT AN INPUT TO THIS FUNCTION, and that is the entire point rather
  // than a caveat. The plausible design — a thief keeps his head down, so he
  // brazens it out less — makes the bird a proof of INNOCENCE, and a player who
  // notices would stop reading the wall and start spamming the handset at
  // everybody to find the one man who does not flip him off. Two rounds of work
  // on a concealment that is provably identical to a phone call out to 0.50 s,
  // handed away by a joke. Measured both ways: guilty and innocent bird rates
  // agree to a point and the likelihood ratio is 1.03 — see benchBird().
  //
  // AND IT COSTS THE SAME ONE rnd() DRAW IT ALWAYS DID. `startGesture` rolls
  // when given a kind and NAMES when given an id, so the draw here is the
  // `Math.floor(rnd() * n)` and nothing else. Changing the LENGTH of the list
  // that index lands in consumes the identical draw; changing how many draws are
  // taken would walk the stream and move every measured number downstream, which
  // is the trap CLAUDE.md records and which cost a previous builder an hour.
  // Verified rather than argued: bench(n=100) is byte-identical on every field.
  // ROUND 10 — REBALANCED TOWARD CONFUSION, AND THE ANGER MOVED UP A RUNG.
  //
  // Client, verbatim: "I don't think the shoppers should necessarily stop and
  // shake their hands and get mad. I DO want them to take notice when I talk on
  // the PA system, especially if they're in the aisle and they're in proximity
  // ... I want them to look around and look really confused."
  //
  // Round 8 built a four-beat sequence that ENDED on a head shake and round 9
  // put hands-on-hips at the third shout. Both of those are correct pictures of
  // a man who has worked out what happened. The complaint is that he works it
  // out far too fast: the FIRST thing a voice out of a ceiling gets should be
  // bafflement, and the anger should be something the player earns by keying
  // the handset at the same person over and over.
  //
  // So the ladder is one rung longer in effect, without gaining a rung:
  //   1st, 2nd  THREE CONFUSED MEN. No shake in any of them. `whoMeLost` is
  //             new and is the client's sentence end to end — four places he
  //             looks, none of them is it, and a two-handed palms-up shrug.
  //   3rd       `whoMeAffront` — round 8's, unchanged and NOT deleted, just
  //             moved to where being annoyed is earned — plus the two round-9
  //             stares. This rung is where `shake` re-enters the game.
  //   4th+      the folded arms and the stares, and armBird() hangs the finger
  //             off the same count.
  // The third rung goes from two entries to three, which changes which clip a
  // given draw lands on and changes NO probability: lookAround takes the same
  // single rnd() either way. See the note on startPutback for why that
  // distinction is the whole ballgame in this file.
  const LADDER = [
    REACT_IDS,                                              // 1st and 2nd shout
    ['whoMeAffront', 'whoMeHips', 'whoMeStare'],            // 3rd
    ['whoMeHips', 'whoMeStare', 'whoMeFolded'],             // 4th and beyond
  ];
  // ...and round 9's, kept reachable rather than described. `agents.override
  // .annR9 = 1` puts the PA performance back exactly as it shipped — this
  // ladder, no proximity override on the clip, and a flat 7 s huff on every
  // shrug — so the before/after on the likelihood ratios is ONE PAGE LOAD on a
  // byte-identical scene rather than a comparison between two builds. Three
  // separate statistics on this project have been wrecked by cross-load drift
  // and the store's collider set moved twice while this round was in flight,
  // so this is not tidiness. See AGENTS_BRIEF, "ship the old layout as a dial".
  const LADDER9 = [
    ['whoMe', 'whoMeAffront', 'whoMeGlance'],
    ['whoMeHips', 'whoMeStare'],
    ['whoMeHips', 'whoMeStare', 'whoMeFolded'],
  ];
  const ladder = () => (K.annR9 ? LADDER9 : LADDER);
  const rungOf = (n) => (n <= 2 ? 0 : n === 3 ? 1 : 2);

  // ---- ROUND 10: PROXIMITY IS A STRENGTH, NOT A SWITCH --------------------
  // "especially if they're in the aisle and they're in proximity". `annSpill`
  // already decides WHETHER a bystander hears it at all, at a hard 7 m off the
  // man being addressed. This is the other half: how much of a reaction the
  // body actually gives, as a function of how far the COP is from him.
  //
  // 1 at your feet, 0 at K.annReach, linear in between. Used in two places and
  // nowhere else: which clip he plays (a distant man gets the glance whatever
  // the roll said) and how long the after-state runs.
  //
  // IS IT A TELL? No, and the argument is round 8's own and does not need
  // re-deriving: THE PLAYER ALREADY KNOWS THIS NUMBER. It is the distance
  // between two things he is looking at. `annWeight` reads two positions and
  // takes no other input — not `guilty`, not `stole`, not `nerve`, not `annOut`
  // — so there is no experiment that recovers guilt from how big a reaction he
  // got, in the same way that boltChance's geometry gate gives nothing away
  // because standing between a man and the door is a thing you did on purpose.
  // Measured anyway; the likelihood ratios are in this round's report.
  function annWeight(s) {
    const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
    return clamp(1 - d / K.annReach, 0, 1);
  }

  // ---- AND THE BIRD IS NOT ON THAT LADDER, WHICH IS THE SECOND VERSION ------
  // The first build put `whoMeBird` in the rung-4 pool and benchBird measured it
  // immediately: LR(bird) = 0.26. A man giving the camera the finger was FOUR
  // TIMES more likely to be innocent, which is a guilt tell pointing the other
  // way and is just as fatal.
  //
  // The ladder was not the leak. A react clip only ever plays when a subject
  // SHRUGS, and the shrug probability does depend on guilt — that is round 7's
  // design, it is what makes a put-back worth reading, and it is not mine to
  // remove. Anything reachable only through the shrug inherits the shrug's
  // likelihood ratio exactly, and the bench said exactly that: LR(bird) 0.26 and
  // LR(shrug) 0.26, to the second decimal. The bird was not adding information;
  // it was making information that was already there IMPOSSIBLE TO MISS, which
  // for a player watching a monitor wall is the same thing.
  //
  // So the bird comes off the compliance roll altogether. It is a SEPARATE BEAT
  // that plays after whatever he did, for anybody who has been shouted at
  // `birdRung` times — the man who put it back, the man who blanked you, the
  // bystander who was only in earshot. It is a function of annN and of nothing
  // else, and P(bird | annN >= 4) is 1 for every population, so the ratio is
  // 1.00 by construction rather than by tuning.
  //
  // It is also the better joke. A customer who does what you asked, puts the box
  // back on the shelf, and THEN turns round and gives the camera the finger is
  // funnier than one who was ignoring you anyway, and it is the shape the client
  // asked for: deadpan, unhurried, and back to the shopping.
  //
  // NO DRAW. Which of the two bird clips plays is `(s.id + annN) & 1`, not a
  // roll — a roll here would walk the stream inside reactToPA and move every
  // announcement number in the file, which is the trap CLAUDE.md records.
  // ---- ROUND 10: WHAT IS LEFT OF HIM AFTER THE CLIP ENDS -------------------
  // Round 8 shipped `annHuff` — 7 s of visible annoyance on three channels:
  // chin up, eleven hundredths of the stoop taken back out of him, and a walk
  // 18% quicker. The client's note this round is that the annoyance arrives too
  // early and too hard, so the DEFAULT after-state is now bafflement and the
  // huff is what the third shout buys.
  //
  //   'lost'  he is still looking. Barely straightens, dawdles rather than
  //           marches (K.annPuzzPace is BELOW 1 — a distracted man walks
  //           slower, and it is the opposite sign to the huff on purpose), and
  //           his head keeps sweeping the aisle for a while afterwards.
  //   'mad'   round 8's, unchanged in every constant.
  //
  // TWO INPUTS AND NO OTHERS: `annN` picks the flavour, `annWeight` scales the
  // duration. Guilt reaches neither. The huff was deliberately given to guilty
  // shruggers "or the huff would be the tell the shrug is not" (round 8) and
  // this inherits that rule intact — same branch, same numbers, no `s.guilty`
  // anywhere in this function.
  function afterPA(s) {
    if (K.annR9) { s.huffKind = 'mad'; s.huff = K.annHuffT; return; }
    const mad = (s.annN || 1) >= K.annMadRung;
    s.huffKind = mad ? 'mad' : 'lost';
    const base = mad ? K.annHuffT : K.annPuzzT;
    // A man you shouted at from forty metres gets the short version of it.
    s.huff = base * (K.annTailFar + (1 - K.annTailFar) * annWeight(s));
  }

  function armBird(s) {
    s.birdT = 0;
    if ((s.annN || 0) < K.birdRung) return;
    if (s.bolted || s.paBolt || s.state === 'shove' || s.caught || s.escaped) return;
    // After whatever he is currently doing, plus a beat. The beat matters: the
    // gesture is deadpan and a bird that starts on the frame the put-back ends
    // reads as one continuous flail.
    s.birdT = (s.gest ? s.gestT : 0) + K.birdGap;
  }
  function startBird(s) {
    s.birdT = 0;
    const id = ((s.id + (s.annN || 0)) & 1) ? 'whoMeBirdMouth' : 'whoMeBird';
    startGesture(s, 'react', id);
    if (!s.gest) return;
    s.annAt = null;                    // this one is for the camera, not for him
    aimAtCamera(s);
    if (s.state === 'walk' || s.state === 'browse') {
      if (s.state === 'walk') { s.target = null; s.path = []; }
      s.state = 'browse';
      s.timer = Math.max(s.timer, s.gestD + 0.2);
    }
  }

  // WHICH CAMERA IS WATCHING HIM. Solved once, when the clip starts, not per
  // frame: a subject answering a PA is standing still, and nine hypots a frame
  // per body for a pose nobody is in is exactly the sort of cost this file's
  // budget note is about.
  //
  // `look` is the world bearing to the nearest dome and `pitch` is how far he
  // has to tip his head back for it, both absolute, both solved from the real
  // mounted rig. A camera at 2.55 m seen from 12 m down an aisle is 6 degrees
  // up; the same camera from 2 m away is 30. Baking one number would have been
  // wrong in both places.
  const CAM_POS = cameraRig().map((c) => ({ x: c.pos[0], y: c.pos[1], z: c.pos[2] }));
  function aimAtCamera(s) {
    let best = null, bd = 1e9;
    for (const c of CAM_POS) {
      const d = dist2d(s.position.x, s.position.z, c.x, c.z);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) { s.camYaw = s.heading; s.camPitch = -0.3; return; }
    s.camYaw = Math.atan2(best.x - s.position.x, best.z - s.position.z);
    // Eye height off the rig, so a short person tips his head further back than
    // a tall one at the same distance — which is free, and is the sort of thing
    // that makes fourteen bodies look like fourteen people.
    // ROUND 11 — the rig's own eye height. The three FIG constants added up to
    // one number for every body in the store, which was true when a body was
    // a scaled copy of one skeleton and stopped being true the moment leg
    // length became a per-person fraction of stature.
    const eye = s.rig.eyeY * s.rig.root.scale.y;
    s.camPitch = -Math.atan2(Math.max(0.2, best.y - eye), Math.max(0.6, bd));
  }
  // ...and the bystander version. A man who is in earshot when somebody else
  // gets called out does not look at the ceiling, he looks at THAT GUY. Same
  // channel, same clip, same code: `aim` points at whatever this pair of numbers
  // says, and announceAt points the spill at the subject instead of at a dome.
  // It gives the player nothing — he already knows who he named — and it turns
  // an announcement into a thing that happens to an aisle rather than to a body.
  function aimAtBody(s, at) {
    s.camYaw = Math.atan2(at.position.x - s.position.x, at.position.z - s.position.z);
    s.camPitch = 0.04;
  }

  // He heard it and he is not doing anything about it: head up off the shelf, a
  // shoulder check, a look at the ceiling for the speaker, and back to work.
  // Guilty and innocent alike, and every bystander in earshot — see announceAt.
  function lookAround(s) {
    // `s.annClip` is an EVIDENCE HOOK, set by announceAt({clip}) and nothing
    // else. The round-7 sheet has to fire the same react clip at a guilty and
    // an innocent subject to show that the two pictures are identical, and it
    // cannot do that if the clip is rolled independently in each strip. It is
    // null in every code path the game takes.
    const tier = rungOf(s.annN || 1);
    const rung = ladder()[tier];
    // THE DRAW IS TAKEN FIRST AND UNCONDITIONALLY. Proximity may override its
    // RESULT below; it must never override whether it happened. See the note on
    // startPutback: swapping a rolled call site for a named one once moved the
    // published likelihood ratio from 1.95 to 2.33 without touching a single
    // probability, because the shared stream walked.
    const roll = rnd();
    let id = s.annClip || rung[Math.floor(roll * rung.length)];
    // ROUND 10 — and a man a long way from you does not stop and search. The
    // override is confined to the CONFUSION rung: once he is on the annoyance
    // ladder he has been shouted at three times and distance has stopped being
    // what the beat is about.
    if (!s.annClip && !K.annR9 && tier === 0 && annWeight(s) < K.annNearCut) id = 'whoMeGlance';
    startGesture(s, 'react', id);
    if (!s.gest) return false;
    // Point him at the dome that is actually watching him — or, if he is a
    // bystander, at the poor sod who got named.
    if (s.annAt && s.annAt !== s && s.annAt.mesh.visible) aimAtBody(s, s.annAt);
    else aimAtCamera(s);
    // A man who is walking somewhere keeps walking; a man at a shelf stops.
    // `drift`, `leave` and `bolt` keep their own legs — animateShopper runs the
    // clip on the upper body over whatever the legs are doing.
    if (s.state === 'walk' || s.state === 'browse') {
      if (s.state === 'walk') { s.target = null; s.path = []; }
      s.state = 'browse';
      // ROUND 8 — and then he goes. Round 7 parked him at the shelf for up to
      // another 0.9 s after the clip; the client's sentence ends "back to
      // shopping in a huff", and a man in a huff does not stand where he was
      // standing. The browse timer running out drops him into `walk`, which is
      // where K.annHuffPace picks him up.
      s.timer = Math.max(s.timer, s.gestD + rr(0.10, 0.45));
    }
    return true;
  }

  // ---- ROUND 8: WILL HE RUN, AND IS RUNNING WORTH ANYTHING TO HIM ---------
  // Returns the ABSOLUTE probability of the bolt outcome, which reactToPA
  // carves out of the shrug interval of the single roll it already took. Zero
  // for innocents by the first line and by construction: `s.guilty` is the only
  // gate on this whole function, so there is no tuning pass that can make an
  // honest shopper run.
  //
  // The second gate is the one that stops this being a scanner, and it is round
  // 6's own race rather than anything new: a man who cannot beat you to the
  // only door does not run at it. Announce from the desk and every guilty
  // subject in the building can beat you, so the answer means something and you
  // are 40 m from being able to use it. Announce with yourself between him and
  // the way out and the answer is always 'no', which is correct — you already
  // did the hard part, and round 6 spent a whole round establishing that a man
  // in that position waits you out or ditches it.
  function boltChance(s, fade, spill) {
    if (!s.guilty || s.bolted || s.state === 'shove' || s.state === 'react') return 0;
    if (!beatsCopToDoor(s)) return 0;
    const base = s.stole ? K.annBolt : K.annBoltCold;
    // INVERTED against the compliance tilt — see K.annBoltNerve.
    const tilt = 1 + K.annBoltNerve * (1 - clamp(s.nerve || 1, 0.4, 1.8));
    return clamp(base * tilt * fade * spill, 0, 1);
  }

  // "OH SHIT." He heard it, he worked out what it meant, and he went.
  //
  // This is not an animation — it ends in `bolt` with s.bolted set and
  // api.onBolt fired, i.e. the identical state the proximity bolt produces, so
  // everything downstream (escapeField, squeezePast, the door shove, the grab,
  // the score) is round 5's chase with nothing bolted onto it. What is new is
  // only where the chase STARTS, which is wherever the player was standing when
  // he keyed the handset.
  function paBolt(s) {
    // HE TAKES IT WITH HIM. A subject who has not concealed yet is holding the
    // thing in his hand when the voice lands, and the version of this where he
    // sets it down neatly and THEN sprints is not a thing anybody does. It also
    // keeps the bookkeeping honest at both ends: escape() bills a merchandise
    // loss for any guilty body that reaches the door, so a runner who was never
    // `stole` would be a loss with nothing behind it — and a catch on him has to
    // be a real arrest with a real item, or the PA would be minting free points.
    s.stole = true;
    s.chill = 0; s.balk = 0; s.stall = 0; s.concealT = 0;
    s.path = []; s.target = null; s.aim = null; s.aimT = 0;
    // The run-up. Its first half-second is heard(), the same three keyframes the
    // annoyed innocent and the guilty shrug open on — see decoy.js. `paBolt`
    // tells the `react` case to FREEZE for it instead of backing away from a cop
    // who, in the case this fires in, is nowhere near him.
    startGesture(s, 'react', 'whoMeRun');
    s.paBolt = true;
    s.state = 'react';
    s.timer = s.gest ? s.gestD : K.thiefReactD;
  }

  // The reaction, one latency later. Everything is rolled HERE rather than at
  // the moment the PA keys, so the answer is to the situation he is in when he
  // actually hears it — he may have finished concealing in the meantime.
  function reactToPA(s, api) {
    const kind = s.annKind || 'putback';
    s.annKind = null;
    if (s.caught || s.escaped || !s.mesh.visible) return;
    // You cannot talk down a man who is already running, and by the time he is
    // in the doorway he is not listening either.
    if (s.bolted || s.state === 'react' || s.state === 'shove') return;

    if (kind === 'hold') {
      // The other PA line game.js already had — a price check that pins him
      // where he stands. No compliance roll: nobody is being accused of
      // anything, he is just waiting to see if it is about him.
      lookAround(s);
      s.state = 'browse';
      s.timer = Math.max(s.timer, K.annHold);
      s.concealT = Math.max(s.concealT, K.annHold + 1.2);
      s.annOut = 'hold';
      // ROUND 10 — the price-check line is the client's own "hey, excuse me",
      // so it gets the confused tail as well. Never the mad one: nobody has
      // accused him of anything, and `annMadRung` is about being shouted at
      // repeatedly rather than about the sentence.
      s.huffKind = 'lost';
      s.huff = K.annR9 ? 0 : K.annPuzzT * (K.annTailFar + (1 - K.annTailFar) * annWeight(s));
      // Keying the price-check line at the same man four times counts too. It
      // is a different sentence, not a different amount of being shouted at.
      armBird(s);
      api && api.onAnnounce && api.onAnnounce(s, kind, 'hold');
      return;
    }

    // ---- the roll ---------------------------------------------------------
    // Three populations, and the whole anti-oracle argument is that all three
    // can produce BOTH observable outcomes. `nerve` tilts it (bold men brazen it
    // out), and annFade makes the second and third shout at the same body worth
    // steadily less — otherwise the button is a slot machine you pull until it
    // pays and the rate stops meaning anything.
    const base = !s.guilty ? K.annSpook : s.stole ? K.annHeedHot : K.annHeed;
    const tilt = 1 - K.annNerve + K.annNerve * clamp(s.nerve || 1, 0.4, 1.8);
    const fade = Math.pow(K.annFade, Math.max(0, (s.annN || 1) - 1));
    const spill = s.annSpill ? K.annSpillMul : 1;
    const p = clamp(base * tilt * fade * spill, 0, 0.95);
    // ---- ROUND 8: ONE ROLL, THREE OUTCOMES, AND THE HEED BIT DOES NOT MOVE --
    // The bolt is carved out of the SHRUG interval of the roll round 7 already
    // took, rather than rolled separately. Two things fall out of that and both
    // of them matter:
    //   - `heed` is still exactly `roll < p`. Same seed, same draw, same bit.
    //     Every compliance rate in the round-7 table reproduces to the decimal
    //     and so does the 1.95 likelihood ratio on a put-back. A put-back is
    //     worth what it was worth.
    //   - it costs no extra rnd(), so nothing downstream of an announcement
    //     shifts in the stream either.
    // What changes is which of the men who were going to blank you run instead.
    const roll = rnd();
    const heed = roll < p;
    const q = Math.min(boltChance(s, fade, spill), 1 - p);

    if (!heed && roll < p + q) {
      // He ran. onAnnounce still fires below with outcome 'bolt', at the instant
      // the run-up clip starts — the contract has always been "what he VISIBLY
      // did", and api.onBolt follows about a second later when he actually goes.
      paBolt(s);
      s.annOut = 'bolt';
    } else if (heed && s.guilty && s.stole) {
      // He has it in his coat already. Same ending as waiting him out at the
      // door: it goes back on a shelf and he walks out clean. Zero points.
      dumpGoods(s, api, 'announce');
      s.annOut = 'heed';
    } else if (heed && s.guilty) {
      // He had not committed yet, and now he is not going to. Puts it back,
      // shops honestly, and leaves the store peacefully. Also zero points.
      abortTheft(s, api, 'announce', true);
      s.annOut = 'heed';
    } else if (heed) {
      // AND THE ONE THAT MAKES IT A READ INSTEAD OF A TEST. An innocent, told
      // off in public, sheepishly puts back whatever is in his hand — the SAME
      // `putback` clip, so the picture is identical and "he put it back" is
      // evidence rather than proof. He is not guilty of anything and nothing is
      // scored.
      //
      // ROUND 8 — AND IT HAS TO BE THE SAME NAME ON BOTH SIDES. abortTheft and
      // dumpGoods now switch to `putbackPA` when the trigger was the PA, so if
      // this line still said plain 'putback' the innocent would be the only man
      // in the store answering an announcement with his hand already inside his
      // coat, and the whole overlap would be readable off one frame.
      startPutback(s, true);
      if (s.state === 'walk') { s.target = null; s.path = []; }
      s.state = 'browse';
      s.timer = Math.max(s.timer, s.gestD + rr(0.3, 1.1));
      s.annOut = 'heed';
    } else {
      lookAround(s);
      s.annOut = 'shrug';
      // AND IT OUTLIVES THE CLIP, BECAUSE IT IS A STATE AND NOT A GESTURE.
      // GUILTY MEN GET THE IDENTICAL TREATMENT — same duration, same posture,
      // same walk — whether he has a chicken in his coat or a shopping list in
      // his hand, which is the only way "he looked annoyed" stays worth
      // nothing. Round 8 wrote that rule for the huff; round 10 keeps it word
      // for word for the thing that replaced the huff. See afterPA().
      afterPA(s);
    }

    // WHAT IT COSTS TO SHOUT AT A CUSTOMER, and it is not a complaint: the
    // announcement is the safe alternative to walking up to somebody and
    // nothing on this path can reach onHarass(). He finishes his shop early
    // instead — a body at the door sooner and one fewer subject the shift can
    // arm. Guilty men who shrugged are untouched; they have other plans.
    if (!s.guilty && s.shopT > 0) s.shopT = Math.max(4.0, s.shopT * K.annHuff);
    // ROUND 9 — and if this was the fourth time, he owes the camera something.
    // Armed for EVERY outcome — heed, shrug, hold — which is the whole point;
    // see armBird.
    armBird(s);
    api && api.onAnnounce && api.onAnnounce(s, kind, s.annOut);
  }

  // THE ENTRY POINT game.js CALLS. `subject` is a shopper object or its id.
  //   kind 'putback'  the deterrence line. Rolls compliance.  (default)
  //   kind 'hold'     the price-check line. Pins him, rolls nothing.
  //   opts.force      skip the PA cooldown (the bench uses it; the game should
  //                   not, and game.js's own button cooldown is the real gate).
  function announceAt(subject, kind, opts) {
    const o = opts || {};
    const k = kind === 'hold' ? 'hold' : 'putback';
    if (annCool > 0 && !o.force) return { ok: false, why: 'cooldown', in: +annCool.toFixed(2) };
    const s = (subject && subject.position) ? subject
      : shoppers.find((x) => x.id === subject);
    if (!s) return { ok: false, why: 'no-subject' };
    if (s.caught || s.escaped || !s.mesh.visible) return { ok: false, why: 'gone' };
    if (s.bolted || s.state === 'react' || s.state === 'shove') return { ok: false, why: 'running' };

    annCool = K.annCool;
    s.annT = rr(K.annLagLo, K.annLagHi);
    s.annKind = k; s.annOut = null; s.annSpill = false;
    // The named subject is answering a CAMERA. `annAt` null routes lookAround()
    // to aimAtCamera(); a bystander gets it set to him, below.
    s.annAt = null;
    s.annClip = o.clip || null;                  // evidence hook, see lookAround
    s.annN = (s.annN || 0) + 1;
    s.concealT = Math.max(s.concealT, s.annT + 0.7);   // hold the fuse while he listens

    // ...AND EVERYBODY ELSE IN THAT AISLE. A PA is a loudspeaker, not a laser:
    // the four people who can hear it all look up, so "somebody looked around"
    // is worth nothing at all. It also means you can deter a man you never saw,
    // which is funny and which is the door-camp lesson restated — a shift where
    // nothing happens is a shift that pays nothing.
    let heard = 0;
    if (k !== 'hold') {
      for (const b of shoppers) {
        if (b === s || b.caught || b.escaped || !b.mesh.visible) continue;
        if (b.bolted || b.annT > 0 || b.state === 'shove') continue;
        if (dist2d(b.position.x, b.position.z, s.position.x, s.position.z) > K.annSpill) continue;
        b.annT = rr(K.annLagLo, K.annLagHi + 0.55);
        b.annKind = 'putback'; b.annOut = null; b.annSpill = true;
        // ROUND 9 — and he turns to look at the man who got named, not at the
        // ceiling. Costs nothing: it is the same `aim` channel the escalation
        // clips use, pointed somewhere else.
        b.annAt = s;
        b.annN = (b.annN || 0) + 1;
        heard++;
      }
    }
    return {
      ok: true, id: s.id, kind: k, heard,
      aisle: aisleOf(s.position.x),
      at: { x: s.position.x, z: s.position.z },
    };
  }

  function updateShopper(s, dt, api, frozen) {
    // ---- THE TROLLEY CLAMP IS GONE, BECAUSE THE REAL FIX LANDED ------------
    // Last round this function opened with a per-frame repair:
    //     if (s.hasCart && s.rig.desc.cart === false) { s.hasCart = false; ... }
    // because game.js's putBack() handed a trolley to every body it returned to
    // the floor, including the seven who were never issued one. That fix has
    // landed on the owning side — game.js:3253 now reads
    //     s.hasCart = s.rig?.desc?.cart !== false;
    // which is the same derivation with one owner — so the clamp comes out, as
    // its own note said it would. Verified on the live page: 7 cartless bodies
    // at boot and 7 after 150 s, 0 mismatched against `desc.cart`, with the
    // clamp removed. `desc.cart` is rolled in figures.js at construction, so it
    // is a person and not a shift.
    if (s.escaped || s.caught) { animateShopper(s, dt, 0); return; }
    if (frozen) { s.vel.multiplyScalar(Math.exp(-6 * dt)); animateShopper(s, dt, 0); return; }

    const copD = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
    s.aisle = aisleOf(s.position.x);
    if (s.state !== 'bolt') {
      s.wind = clamp(s.wind + dt * K.thiefSecond, 0, 1);
      s.adren = clamp(s.adren + dt * K.thiefAdrenBack, 0, 1);
    }

    // ---- ROUND 7: the PA landed on him a moment ago. One compare per body
    // per frame in the overwhelmingly common case where nobody has said
    // anything; the reaction itself is rolled in reactToPA().
    if (s.annT > 0) {
      s.annT -= dt;
      if (s.annT <= 0) { s.annT = 0; reactToPA(s, api); }
    }
    // ROUND 8 — and how long he stays annoyed about it. One subtract per body
    // and only for the handful who have been shouted at in the last few seconds.
    if (s.huff > 0) s.huff = Math.max(0, s.huff - dt);
    // ROUND 9 — ...and whether he still owes the camera a gesture. One compare
    // per body per frame in the overwhelmingly common case where nobody has been
    // shouted at four times.
    if (s.birdT > 0) {
      s.birdT -= dt;
      if (s.birdT <= 0 && !s.gest && !s.bolted && s.angry <= 0
          && s.state !== 'shove' && s.state !== 'react' && s.state !== 'conceal') {
        startBird(s);
      } else if (s.birdT <= 0) {
        s.birdT = 0.25;                 // busy; ask again shortly
      }
    }

    // ---- ROUND 6: clips run first, so a state can ask "am I still doing it".
    const clipOn = tickGesture(s, dt);
    // =====================================================================
    // ROUND 12 — THE REACH. THE ONLY THING IN THIS GAME THAT TAKES A BOX OFF
    // A SHELF, AND THE CLOCK IT RUNS ON IS THE POINT.
    // =====================================================================
    // `reachT` lives on the RIG and is decremented HERE, unconditionally,
    // before any state is consulted. Nothing restarts it — not entering
    // `browse`, not a balk, not a reset, not the PA. That is round 9's idle
    // argument and it is reused because it is the strongest one available: a
    // clock no state transition can touch cannot correlate with a state, and
    // therefore cannot correlate with guilt. If the body is not standing at a
    // shelf when the clock fires, the tick is simply spent — it is never
    // deferred, banked or re-armed early, because "when did he last reach" would
    // then be a function of where he has been, which is a function of what he
    // was doing.
    //
    // AND IT COSTS NO DRAW OFF rnd(). Both decisions here — the interval and
    // whether the item ends up in the cart or back on the shelf — are a hash of
    // (body id, reach number). Taking them off the seeded stream would shift
    // every subsequent decision in the building; this file's header records
    // that exact mistake moving a published likelihood ratio from 1.95 to 2.33
    // in a change that touched no probability anywhere.
    {
      const r = s.rig;
      r.reachT = (r.reachT ?? 0) - dt;
      if (r.reachT <= 0) {
        r.reachN = (r.reachN || 0) + 1;
        const h1 = hash2(s.id, r.reachN * 2 + 1);
        r.reachT = K.reachLo + (K.reachHi - K.reachLo) * h1;
        const ready = !clipOn && !s.gest && s.angry <= 0 && !s.bolted
          && s.state === 'browse' && s.shelfSide !== 0
          && s.speed < 0.35 && Math.abs(s.turnErr || 0) < 0.55;
        if (ready) {
          // WHICH TAIL. One constant, one hash, for every body in the store.
          // A thief and a shopper roll this the same way and the two tails
          // share their first 0.80 by construction — see decoy.js.
          // ROUND 2 (character) — `shiftN` IS IN THE HASH NOW, AND CLOSING THE
          // FUSE LEAK IS WHY. hash2(id, reachN*2) has exactly fourteen possible
          // values for reachN = 1, so "what body 3 does with the first thing it
          // picks up this shift" was a constant of the universe — the same
          // decision every shift, forever. That was harmless while every body
          // reached dozens of times and averaged over it. It stopped being
          // harmless the moment an ARMED body's reaches became almost entirely
          // first reaches: the guilty column of benchTake started sampling those
          // fourteen fixed values and the innocent column kept sampling all of
          // them, and LR(put-back | a take) came back 0.71 at the desk against
          // 1.00 at the door. Mixing the shift in decorrelates the two columns
          // without touching the probability, the draw count, or the property
          // that matters: `shiftN` is the RNG state at the top of reset(),
          // captured BEFORE the guilt draw, so it is exactly as guilt-blind as
          // the reach phase that already uses it.
          const keep = hash2(s.id + shiftN, r.reachN * 2) >= K.reachPut;
          s.gest = keep ? REACH_KEEP : REACH_PUT;
          // Scaled by tellMul like every other clip. Not because a reach is a
          // tell — it is not, everybody plays it — but because at difficulty 0
          // every OTHER clip in the store runs 1.35x long, and one behaviour
          // running at a different rate from the eleven around it is visible
          // even when it means nothing.
          s.gestD = s.gest.dur * K.tellMul; s.gestT = s.gestD;
          s.reachKeep = keep; s.reachTook = false; s.grabT = 0;
          // -0.22 is a high shelf (hand at ~1.75 m), +0.83 is a low one (hand
          // at ~0.75 m, body folded over). Same hash family as the tail choice,
          // and it carries `shiftN` for the same reason and by the same
          // argument — see above. It measured CLEAN without it (LR(grab height)
          // 1.01 desk / 0.99 door with the fuse gated), which is luck of the
          // fourteen values on this roster rather than a property: the tail
          // choice, one line up, is drawn from exactly the same fourteen and
          // came back 0.71. A number that is only right by the roster it was
          // measured on is a number the next roster changes.
          s.reachEl = -0.22 + hash2(s.id + 977 + shiftN, r.reachN) * 1.05;
          s.timer = Math.max(s.timer, s.gestD + 0.35);
        }
      }
    }
    // ...and anybody standing at a shelf might start one. THIS IS THE ONE THAT
    // MATTERS. Guilty or innocent, pre-conceal or post-abort — the scheduler
    // does not look at `s.guilty`, so "the man doing something with his hands"
    // is never the answer, and a five-frame strip off the spot monitor is
    // evidence of a shopper rather than evidence of a crime. See decoy.js.
    if (!clipOn && s.angry <= 0 && !s.bolted && s.state !== 'leave'
        && (s.state === 'browse' || s.state === 'walk')) {
      s.gestIn -= dt;
      if (s.gestIn <= 0) {
        s.gestIn = rr(K.decoyLo, K.decoyHi);
        // You stop walking to dig your phone out. He drops into `browse` for
        // the length of the clip and a beat either side, which is also what
        // gives the motion detector a STOPPED subject to box — the identical
        // analytics verdict the CCTV builder flagged.
        if (s.state === 'walk') { s.target = null; s.path = []; }
        s.state = 'browse';
        startGesture(s, 'decoy');
        s.timer = Math.max(s.timer, s.gestD + rr(0.25, 1.20));
      }
    }

    // ---- guilty timeline: browse -> conceal -> drift -> bolt
    if (s.guilty && !s.bolted) {
      // CAN HE STILL BEAT YOU TO IT. Route metres, both of you, off the same
      // field, computed once at the top of the frame. This is the client's
      // sentence turned into a comparison:
      //   "I think you should kind of have a clue where they're going. The cop
      //    should kind of have a chance to get there."
      // With one exit you always have the clue; what you have to do with it is
      // GET THERE FIRST. Kept on the subject as well as inside heldOff() so a
      // critic can read it off a live thief — see agents.shoppers[i].beatable.
      s.beatable = beatsCopToDoor(s);
      if (!s.stole) {
        // ROUND 6 — HE DOES NOT COMMIT WITH A UNIFORM ON THE ONLY WAY OUT.
        // `chill` is the honest-shopping stretch after a balk; while it runs
        // the fuse is held, and he is doing decoy clips like everybody else,
        // which is the correct picture — a man who decided not to steal
        // something is a shopper.
        if (s.chill > 0) {
          s.chill -= dt;
          s.concealT = Math.max(s.concealT, 1.2);
        } else {
          // He cases the front. Either he is close enough to the way out to
          // see it on his way there, or he has a clean line to the man himself.
          const cased = doorPosted()
            && (toExit(s.position.x, s.position.z) < K.deterSight
                || nav.clearSeg(s.position.x, s.position.z, cop.position.x, cop.position.z));
          if (cased) {
            s.balk += dt;
            s.concealT = Math.max(s.concealT, 0.9);      // hold the fuse
            if (s.balk > K.deterBalk && s.state !== 'conceal') { abortTheft(s, api); }
          } else if (s.balk > 0) {
            s.balk = Math.max(0, s.balk - dt * 0.8);
          }
        }
        // =================================================================
        // THE FUSE DOES NOT START UNTIL HE HAS SHOPPED. See K.reachArm.
        // =================================================================
        // Round 12 published this leak rather than hiding it, which is why it
        // gets fixed instead of inherited:
        //
        //   LR(take rate) = 0.118 (cop at desk) / 0.152 (cop on door)
        //
        // An armed body opened a gap in a shelf about a SEVENTH as often as a
        // clean one, so watching a body reach and take something made it
        // roughly eight times less likely to be guilty. It cannot convict. It
        // lets a player ELIMINATE most of the roster on sight, and in a game
        // whose premise is that you cannot tell, a reliable elimination is
        // nearly as damaging as a reliable conviction.
        //
        // The mechanism was never subtle once the rate was measured: `concealT`
        // is 2.5-7.0 s from the reset, and a body spends most of that walking
        // to a shelf. By the time it is standing at a face with its speed under
        // 0.35 and its heading square to the fixture — the four conditions the
        // reach scheduler requires — the fuse has already blown, and its whole
        // remaining timeline is conceal -> drift -> door. It was structurally
        // incapable of shopping.
        //
        // So the fuse WAITS. It is not shortened, lengthened or re-rolled: it
        // simply does not tick until this body has done what every other body
        // in the store does, which is take something off a shelf. Then it burns
        // the same 2.5-7.0 s it always did, so the concealment is not welded to
        // the frame the reach ends on — a gap of exactly zero would be a new
        // tell in place of the old one, and the innocent population's own
        // reach-to-next-clip gap is a uniform 0-22 s that 2.5-7.0 sits inside.
        //
        // GUILT-BLIND IN FORM, and this is the load-bearing sentence: the gate
        // reads a counter incremented by takeAt(), which takes nothing but `s`;
        // the counter lives on the RIG, which no reset wipes except reset()
        // itself, at the same place and in the same breath as `reachN`; and the
        // reach that increments it is scheduled off a clock no state transition
        // can restart. Nothing in the chain has ever seen `s.guilty`. It is also
        // simply what a shoplifter does — you browse first.
        if ((s.rig.reachDone || 0) >= K.reachArm) s.concealT -= dt;
        if (s.concealT <= 0 && (s.rig.reachDone || 0) >= K.reachArm
            && s.state !== 'conceal' && !s.gest && s.chill <= 0) {
          s.state = 'conceal'; s.look = 0;
          startGesture(s, 'steal');
          s.timer = s.gestD;
        }
      } else if (s.state === 'walk' || s.state === 'browse') {
        // STALLED. He has it in his coat and there is a uniform on the only
        // door, so he is hanging back in the aisles doing an extremely good
        // impression of a man choosing a pasta sauce.
        // The resume test has to be the SAME test that made him turn back, or
        // he flips between drifting and waiting every other frame on the
        // boundary. Either you are posted on the door, or you are simply closer
        // to it than he is: both are reasons to sit tight, and neither of them
        // stops being true because he took two steps backwards.
        if (heldOff(s)) {
          s.stall += dt;
          if (s.stall > K.dumpT) dumpGoods(s, api);
        } else {
          // Patience DECAYS, it does not reset. A man who has spent eight
          // seconds hanging back does not start his patience again from zero
          // because you stepped off the door for a moment — otherwise a cop who
          // drifts on and off the mat holds him forever and the trial never
          // resolves. Measured: 8 of 40 camp trials were timing out at 30 s
          // with a reset; with the decay they end in a ditched item, which is
          // an outcome instead of a hang.
          s.stall = Math.max(0, s.stall - dt * 0.5);
          s.state = 'drift'; s.path = []; s.aim = null; s.aimT = 0;
        }
      }
      // ROUND 3. He is walking out with a jacket full of steaks and a uniform
      // has just appeared in the mouth of his aisle, in line with the doors. He
      // does not amble up to within four and a half metres to make sure. Seeing
      // the way out blocked IS the tell, and it is the difference between a
      // chase and a collection: the old radius let him bolt at 3.4 m from a cop
      // already at a dead sprint, which is 0.3 s of "chase" and 100% caught.
      // Needs line of sight and needs the cop to actually be ON his route, so a
      // cop stood at his post across the store never trips it.
      // ROUND 6 — `stalling` is the man who has it in his coat and has turned
      // back into the aisles rather than walk into you. He is walking, not
      // drifting, so without this line he would be UNCATCHABLE: interactions()
      // only grabs a subject who has bolted or is reacting. He must still bolt
      // when you find him, or "stand on the door and he waits" would have an
      // exploit in it where the thief strolls past your elbow untouchable.
      // It is also the intended counterplay to your own post: leave the door
      // and go and get him.
      const stalling = s.stole && !s.bolted && (s.state === 'walk' || s.state === 'browse');
      if ((s.state === 'drift' || stalling) && copD < T.suspicionRadius) { s.state = 'react'; s.timer = K.thiefReactD; }
      // ROUND 6 — AND HE ONLY RUNS FROM A MAN WHO IS COMING AT HIM. Round 3
      // made any uniform on his line inside 17 m a bolt, which was the right
      // fix for "he ambles up to 4.5 m of a sprinting cop" and is worth most of
      // the 1.13 s -> 3.03 s median. With ONE exit it has a second, wrong
      // consequence: EVERY route out of this store passes the front end, so a
      // cop merely WALKING TOWARDS THE DOORS is on every thief's line, and the
      // thief sets off running before the man has even noticed him. Nobody does
      // that. You keep strolling and you hope.
      // So the sighting still fires at 17 m if he is being closed on (the aisle
      // mouth case, unchanged), and otherwise not until `boltNear`.
      else if ((s.state === 'drift' || stalling) && copD < K.thiefLook
               && (copClosingOn(s, copD) || copD < K.boltNear)
               && seesBlocker(s, copD)) {
        // ROUND 6 — SEEING THE WAY BLOCKED IS NO LONGER AUTOMATICALLY A BOLT.
        // Round 3 made him bolt the moment a uniform appeared on his line, and
        // that was right: before it, he ambled up to 4.5 m of a sprinting cop
        // and 61% of "chases" were over inside a second. But with ONE door it
        // has a degenerate consequence — a man who cannot possibly beat you to
        // the only exit sets off running at it anyway, straight into the arms
        // of the man standing on it. That is not fear, it is a scripted
        // donation, and it is most of why a door-camping bot scored 71.7%.
        //
        // So the sighting still fires, and now it asks a question: can I still
        // get there first? If yes he commits and it is the round-5 chase,
        // unchanged. If no he turns back into the aisles, waits you out, and
        // ditches the goods if you never move (see dumpGoods). The counterplay
        // to a man who has turned back is the one the whole game is about: stop
        // guarding the door and go and take him, which trips the line above.
        if (heldOff(s)) { if (s.state === 'drift') turnBack(s); }
        else { s.state = 'react'; s.timer = K.thiefReactD; }
      }
      if (s.state === 'conceal' && copD < T.suspicionRadius && s.gestT < 1.2) { s.state = 'react'; s.timer = K.thiefReactD; }
    } else if (!s.guilty) {
      // ---- ROUND 6: customers finish their shop and leave, by the same door.
      // Without this the only body that ever walks at the exit is the thief, so
      // "subject moving toward the doors" is a confession and the exit is a
      // chokepoint one man can hold. With it the door is a CROWD: the camper is
      // standing in a stream of people and has to know which of them is his,
      // which is the job the aisle number does once there is only one way out.
      if (!s.leaving && s.angry <= 0 && !s.gest) {
        s.shopT -= dt;
        if (s.shopT <= 0) {
          s.leaving = true; s.state = 'leave';
          s.path = []; s.target = null; s.aim = null; s.aimT = 0;
        }
      }
    }

    // ---- turn and yell, never run. GUILT-BLIND, AND IT HAS TO LIVE OUT HERE.
    // This block used to sit inside the `else if (!s.guilty)` above, and the
    // bolt trigger needs `drift` or `stole` — so a thief who had not concealed
    // anything YET did neither. Walking up to a body read out three ways:
    // they yell = innocent, they bolt = guilty and already stolen, and NOTHING
    // HAPPENS = a thief who has not done it yet. The first two are published
    // confessions that cost the player something. The third was free, and a
    // player who noticed it could poke bodies down an aisle and build a suspect
    // list without reading a single gesture. Second perfect classifier found in
    // two rounds; see CLAUDE.md.
    //
    // The named one-line fix — rewriting the else gate to `!s.stole` — is a
    // NO-OP, and dangerously so. An un-concealed thief is `s.guilty &&
    // !s.bolted`, so the FIRST branch consumes him and he never reaches the
    // else at all; the rewrite only changes the truth value for bodies that
    // already failed that test. It would have benched as "no change" and the
    // leak would have been declared closed. Caught by builder-game-r13 before
    // it was applied.
    //
    // Only the YELL is lifted out. The shop timer stays on `!s.guilty` on
    // purpose: gating that on `!s.stole` too would hand un-concealed thieves
    // the innocent leave countdown and walk them out of the building before
    // they ever steal anything.
    //
    // A complaint is for ROLLING UP ON someone. Standing at your post while a
    // shopper wanders past you is not harassment, and the old pure-distance
    // test handed the player a complaint — and a demotion — for doing nothing
    // at all for thirty seconds. You have to walk at them.
    if (!s.stole && !s.bolted) {
      if (copD < T.suspicionRadius && s.harassArmed && s.angry <= 0 && copClosingOn(s, copD)) {
        s.angry = 2.6; s.harassArmed = false; s.bang.visible = true;
        api.onHarass && api.onHarass(s);
        // A MAN BEING SHOUTED AT DOES NOT REACH INTO HIS COAT. Same shape as
        // announceAt's `s.concealT = Math.max(s.concealT, s.annT + 0.7)`, and
        // it closes a leak of its own: the decoy scheduler is gated on
        // `s.angry <= 0`, so an innocent can start NO clip while angry — but
        // the concealment trigger has no such gate, so a cold thief could
        // start a `steal` clip inside the anger window against an innocent
        // baseline of exactly zero. Any clip in that window was guilty-only.
        s.concealT = Math.max(s.concealT, s.angry + (T.angryFuse ?? 0.4));
      }
      if (copD > T.suspicionRadius + 1.6) s.harassArmed = true;
    }
    // THE DECAY IS NOT PART OF THE GATE, and this is the general rule this
    // round keeps re-learning: a POLICY may be gated on what a body is, a TIMER
    // never may. A body that conceals or bolts while still angry leaves the
    // gate on that frame, and with the decay inside it his anger never runs
    // out. He then freezes at `target = 0` facing the cop (the pin below is
    // exempt only for `bolt` and `react`, and he is in `drift`), cannot be
    // arrested (`interactions()` needs `bolted` or `react`), and carries a
    // depth-test-off `!` sprite through solid shelving for the rest of his
    // life — in a state only a guilty body can reach, which is a worse
    // classifier than the one this round closed and is visible from the desk.
    // Unreachable before the yell was lifted out; the lift opened it. Found by
    // builder-game-r13, and it never shipped.
    //
    // MEASURED, on the broken build, rather than reasoned about — and it is
    // narrower than it first looked, which makes it worse rather than better.
    // The steal has to COMPLETE inside the 2.6 s of anger to trap the decay, and
    // fuse + clip crosses 2.6 s at about 0.8 s of remaining fuse:
    //
    //   fuse left at the yell   0.3s  0.5s  0.7s | 0.9s  1.1s  1.4s
    //   frozen afterwards        75%   60%   67% |   0%    0%    0%
    //
    // So it is not "any crowding". It is crowding a man in the last second
    // before he conceals — the exact play the game rewards — and it lands about
    // two times in three when a player does it on purpose. The residual stuck
    // anger is only 0.13-0.48, and `if (s.angry > 0) target = 0` does not care
    // how angry. Rare per crowding, permanent per occurrence.
    //
    // IT DID NOT APPEAR IN 80 BENCH SHIFTS. The bots do not crowd a man on his
    // last second of fuse, so no bench in this repo would have found it.
    //
    // It stays AFTER the gate rather than before so a body that stays
    // un-concealed keeps round 12's same-frame ordering exactly, and the
    // innocent path is byte-identical.
    if (s.angry > 0) { s.angry -= dt; if (s.angry <= 0) s.bang.visible = false; }

    // ONE walking speed, and it is a PERSON. Every state below that walks reads
    // this and nothing else — see K.paceLo. `bolt`, `react` and `shove` set
    // their own and are exempt on the same grounds as the start ramp: they are
    // the three states the chase is measured in and a bolt is already a
    // confession.
    const PACE = paceOf(s);
    let target = K.thiefWalk * PACE.pace;
    let dir = null;

    // ROUND 2 (character) — A HEAD DOES NOT STAY COCKED, AND THIS WAS THE SAME
    // LEAK ONE CHANNEL OVER. `s.look` is AUTHORED every frame by the four states
    // that use it and was never CLEARED by the three that do not, so it latched:
    // a body that turned back out of `drift` carried its last swivel — up to
    // 0.50 rad, 29 degrees — into `walk` and held it there, frozen, for the rest
    // of its shift. Only a body that has concealed something can make that
    // transition, so a permanently cocked head was a guilt tell with no decay at
    // all, and it survived every measurement because `look` was only ever read
    // one frame at a time. Zeroed on the three states that never write it; the
    // neck lerps at ed(8) downstream, so it reads as him facing front again
    // rather than as a snap. `react` and `conceal` are left alone: both write it
    // themselves, every frame, on purpose.
    if (s.state === 'walk' || s.state === 'browse' || s.state === 'putback') s.look = 0;

    switch (s.state) {
      case 'walk': {
        s.timer -= dt;
        if (!s.path.length) {
          if (!s.target) s.target = wanderTarget(s);
          s.path = nav.path(s.position.x, s.position.z, s.target.x, s.target.z);
        }
        dir = followPath(s, dt);
        // ROUND 12 — HE ARRIVES AND TURNS TO THE FIXTURE. A shopper who has
        // walked up to a shelf does not stand facing down the aisle; he turns
        // square to the run, which is both what the reference photographs show
        // and what puts the shelf inside his reach. `shelfSide` is +-1 when
        // wanderTarget parked him against a face and 0 when it left him on the
        // centre line, so a body that has stopped in the middle of an aisle
        // keeps its travel heading and nothing else changes.
        if (!dir) {
          s.target = null; s.state = 'browse'; s.timer = rr(1.6, 4.5);
          s.faceYaw = s.shelfSide ? Math.atan2(s.shelfSide, 0) : null;
        }
        break;
      }
      case 'browse': {
        s.timer -= dt;
        target = 0;
        if (s.timer <= 0) {
          s.state = 'walk'; s.timer = rr(4, 9); s.target = null; s.path = [];
          s.faceYaw = null;                       // back to facing where he goes
        }
        break;
      }
      // ROUND 6 — the concealment is now GESTURES[0] and it is sampled by the
      // same applyGesture() the six decoys are. Round 5's inline lerp is gone,
      // keyframe for keyframe, into decoy.js: item off the lip, past the
      // sternum, into the coat, gone, hands back on the bar, with the shoulder
      // checks on the same beats. The point is structural — there is no longer
      // any code a thief runs that an innocent does not — so please do not
      // re-inline it to "make the tell clearer".
      case 'conceal': {
        target = 0;
        if (!s.gest) { s.stole = true; s.state = 'drift'; s.path = []; s.held.visible = false; }
        break;
      }
      // He balked. The item comes back out of the coat and goes back on the
      // shelf, which is the only clip in the file that ends that way and is the
      // player's feedback that his post on the door worked.
      case 'putback': {
        target = 0;
        if (!s.gest) {
          if (s.leaving) { s.state = 'leave'; s.path = []; s.aim = null; s.aimT = 0; }
          else { s.state = 'walk'; s.timer = rr(2, 5); s.target = null; s.path = []; }
        }
        break;
      }
      // =====================================================================
      // ROUND 2 (character) — ONE WALK TO THE ONE DOOR, AND IT IS THE SAME
      // WALK. THIS WAS THE WORST BUG IN THE PROJECT AND IT WAS TWO CONSTANTS.
      // =====================================================================
      // `leave` and `drift` are the same body doing the same thing — heading
      // for the only exit on the same field, at the same gait, past the same
      // people. The only difference that has ever mattered is behavioural: a
      // drifter turns back rather than walk into a posted uniform, and a
      // leaver has nothing to turn back from. Everything else about them was
      // written out twice, and the two copies drifted:
      //
      //     leave   K.thiefWalk * 1.06   look sin(phase*0.55) * 0.32
      //     drift   K.thiefWalk * 1.12   look sin(phase*0.80) * 0.50
      //
      // `drift` is the one state that only a body which has already concealed
      // something can enter. So both of those numbers were GUILT, published on
      // the two channels a player watches hardest. Measured over 150 s of live
      // sim at difficulty 1, excluding bolt/react/shove:
      //
      //                       max speed   % of body-time > 1.33 m/s
      //       guilty            1.400 m/s          49.6%
      //       innocent          1.250 m/s           0.0%
      //                       max |head yaw|   % above the innocent ceiling
      //       guilty            0.500 rad          29.7%
      //       innocent          0.320 rad           0.0%
      //
      // Zero false positives across 30 minutes of innocent walking. That is not
      // a likelihood ratio, it is a perfect classifier, and it fires for half of
      // the thief's pre-bolt life in runs of up to 13.6 s. Every ambiguity
      // number in this file is measured against a design whose premise is that
      // you cannot tell; a player who notices "the fast one is the thief" has
      // beaten all of it without watching a single gesture.
      //
      // THE FILE ALREADY STATED THE RULE THIS BROKE. The guard on `huff`, forty
      // lines below, reads "a guilty shrugger who bolts later must not be
      // quietly 18% faster for it." That guard went on the huff and not on the
      // state only a thief can be in.
      //
      // THE FIX IS NOT A NUMBER, IT IS THE DUPLICATION — AND COLLAPSING `drift`
      // ONTO `leave` WAS MEASURED AND WAS NOT ENOUGH. Shipping that first cut
      // killed the per-frame classifier outright (max speeds overlapped, 0.0% of
      // guilty body-time above the innocent ceiling) and left a rate: 23.6% of
      // guilty body-time over 1.33 m/s against 2.5% of innocent, LR 9.6. The
      // residue was never the two constants. It was that BOTH door states were
      // faster than the ordinary walk while a thief spends 48% of his pre-bolt
      // life in one of them and an honest shopper 14%. Speed was reporting the
      // STATE, and the state mix is guilt.
      //
      // So the door bump is gone entirely. There is now ONE walking speed in
      // this file, it is a PERSON — see K.paceLo — and every state that walks
      // reads it, so a body's speed cannot tell you what it is doing, let alone
      // why. `PACE` is taken once at the top of this function; this branch does
      // not touch `target` at all, which is the point: there is no door
      // multiplier left for a tuning pass to get wrong.
      //
      // The head is the same argument on the other channel. `lookAmp`/`lookRate`
      // are also the person's, spanning the union of the two old pairs, and the
      // three door-adjacent states that never authored `look` now clear it —
      // see the note above the switch, because a latched head was the same leak
      // with no decay at all.
      case 'leave':
      case 'drift': {
        // ROUND 6 — HE DOES NOT WALK INTO A UNIFORM STOOD ON THE ONLY DOOR.
        // He turns back into the shelf runs and waits. See the `walk` branch of
        // the guilty timeline above for the other half, and dumpGoods() for
        // what happens if you never move. This is the ONE thing that differs
        // between the two states, and a body in `leave` has nothing to turn
        // back from — he is not carrying anything he should not be.
        if (s.state === 'drift' && heldOff(s)
            && toExit(s.position.x, s.position.z) < K.deterSight) {
          // ...and it goes through turnBack(), which is where this decision
          // already lived. The two were hand-copied and had ALREADY diverged —
          // the inline one never cleared `aim`/`aimT`, so a thief who turned
          // back kept staring at whatever the last clip pointed him at. Same
          // rnd() draws in the same order, so the seeded stream is unmoved.
          turnBack(s);
          s.stall += dt;
          break;
        }
        dir = navToExit(s, false, dt);
        // ...and it is the SAME `target` the aisles use, untouched. There is no
        // door multiplier left to get wrong.
        s.look = Math.sin(s.phase * PACE.lookRate) * PACE.lookAmp;
        if (atExit(s) >= 0) { startShove(s); break; }
        break;
      }
      case 'react': {
        s.timer -= dt; target = 0.5;
        // ROUND 8 — THE PA STARTLE IS A FREEZE, NOT A RETREAT. The proximity
        // bolt backs away from the cop while it winds up, which is right,
        // because there is a man walking at him. Nobody is walking at this one:
        // a voice came out of the ceiling and he is working out what it meant.
        // So he stops dead for the length of the run-up clip and then goes,
        // which is also what stops the announcement quietly handing him a metre
        // of free ground for being shouted at.
        if (s.paBolt) {
          target = 0;
        } else {
          dir = { x: (s.position.x - cop.position.x), z: (s.position.z - cop.position.z) };
          const m = Math.hypot(dir.x, dir.z) || 1; dir.x /= m; dir.z /= m;
          s.look = 1.0;
        }
        if (s.timer <= 0) {
          // The run-up ends ON this frame — s.timer was set to s.gestD — so the
          // clip has to come off the upper body in the same frame the legs start
          // running, or he sprints out of the aisle doing a shoulder check.
          if (s.paBolt) { s.paBolt = false; clearGesture(s); }
          s.state = 'bolt'; s.bolted = true; s.path = []; s.repathIn = 0;
          // ROUND 9 (2nd pass) — HIS LEGS ARE FRESH WHEN THE RUN STARTS, and
          // this is the only place that is unambiguously true. resetShopper()
          // also sets it, but a body can be armed as a subject WITHOUT a reset
          // (see the re-arm in benchShift, which picks an existing innocent out
          // of the crowd), and a man carrying a previous chase's spent legs into
          // a fresh one is a silent difficulty spike nobody would ever look for.
          // Costs no rnd() draw, so it cannot walk the seeded stream — see the
          // startGesture note in the file header for why that matters here.
          s.legs = 1;
          if (s.hasCart) { s.hasCart = false; s.dropCartAt = { x: s.position.x, z: s.position.z, y: s.heading }; }
          api.onBolt && api.onBolt(s);
        }
        break;
      }
      case 'bolt': {
        // The route already knows where the cop is — see escapeField(). If the
        // front of his aisle is corked and the back of the store is genuinely
        // cheaper, that is the route this returns, on its own, because it is the
        // cheaper one. If squeezing past is cheaper, it returns that instead,
        // hugging the shelf, and squeezePast() commits him to a shoulder.
        dir = navToExit(s, true, dt);
        dir = squeezePast(s, dir, copD, dt);
        target = thiefPace(s, copD, dt);
        // THE COMMITMENT MOMENT. Going out the back of the store is the one
        // decision in this chase that is irreversible and worth thirty metres,
        // and until round 4 the player found out about it by losing. It is
        // visible on the floor — he turns and runs the wrong way — so it is
        // reported: `chase.viaBack` in telemetry, for the HUD to say out loud.
        // Anticipating it is the whole counterplay to the back route, because
        // the cop who reads it early can take a DIFFERENT aisle and meet him on
        // the rear cross-aisle instead of following him round the horn.
        if (dir.z > 0.30 && s.position.z > -HALF_LEN + 3.5) s.viaBack = true;
        else if (dir.z < -0.55) s.viaBack = false;
        if (s.stumble > 0) { s.stumble = Math.max(0, s.stumble - dt); target *= K.stumbleMul; }
        s.look = 0;
        if (atExit(s) >= 0) { startShove(s); break; }
        break;
      }
      // ---- the door -------------------------------------------------------
      // A door is not a teleport. He arrives at a dead run, hits the leaf, and
      // for the better part of a second he is a stationary man with his
      // shoulder on a push-bar and his back to you. THAT is what makes a chase
      // to the doors contestable at the doors instead of decided ten metres
      // out, and it is why the pursuing cop — the intuitive, thematic action —
      // now has an ending available to him. He is grabbable throughout; the
      // grab is a plain one, because a man leaning on a door is not juking.
      case 'shove': {
        s.shoveT -= dt; target = 0; s.look = 0;
        const e = EXITS[s.exitI] || EXITS[0];
        // still creeping at the leaf, so a grab is a real tackle and not a
        // freeze-frame two metres short
        dir = { x: (e.x - s.position.x), z: (e.z - s.position.z), dist: 1 };
        const dm = Math.hypot(dir.x, dir.z) || 1; dir.x /= dm; dir.z /= dm;
        target = 0.55;
        if (s.shoveT <= 0) { escape(s, api); return; }
        break;
      }
    }

    // ROUND 8 — A MAN IN A HUFF MOVES. The posture is in animateShopper; this is
    // the half you can read at 214 px, because it changes where he IS and not
    // just what he looks like: the subject you shouted at packs up and walks off
    // at a clip. Never touches a runner — a bolt sets its own pace and a guilty
    // shrugger who bolts later must not be quietly 18% faster for it.
    //
    // ROUND 10 — AND THE SIGN FLIPS FOR THE CONFUSED ONE. A man who has been
    // told off strides away; a man who cannot work out where a voice came from
    // slows down and keeps looking. Same channel, same guard, opposite
    // direction, and the direction is the whole difference between the two
    // readings at monitor scale.
    if (s.huff > 0 && !s.bolted && target > 0.2) {
      target *= s.huffKind === 'mad' ? K.annHuffPace : K.annPuzzPace;
    }

    if (s.angry > 0 && s.state !== 'bolt' && s.state !== 'react') {
      target = 0;
      const dx = cop.position.x - s.position.x, dz = cop.position.z - s.position.z;
      const m = Math.hypot(dx, dz) || 1;
      s.heading = Math.atan2(dx / m, dz / m);
    }

    // ---- ROUND 12: NOBODY ACCELERATES TO FULL SPEED INSTANTLY --------------
    // K.thiefAccel is 10.5 m/s^2, so the old target — a step function between 0
    // and 1.25 — was reached in 0.119 s. Seven frames. In a strip sampled every
    // 0.1 s a body goes from standing to walking in ONE frame, which is exactly
    // the note in the brief.
    //
    // thiefAccel itself is NOT touched, and that is deliberate: it is the
    // chase's constant, the pursuit bot dead-reckons the thief with it, and this
    // file's header has a whole section on what happens when you move one half
    // of a poisoned lever. This is a ceiling on the TARGET instead, which costs
    // about 0.10 m of ground once per start.
    //
    // EXEMPT: `bolt`, `react` and `shove`. Not because a runner does not
    // accelerate — he does — but because those three are the states every
    // number in this file is measured in, and a man who has decided to run has
    // already had his weight moving. `bolt` is also the one outcome that IS a
    // confession (see boltIsProof), so exempting it cannot leak anything that
    // is not already public. Every other state ramps, guilty and innocent
    // alike: `drift` and `leave` are the same walk to the same door and they
    // start the same way.
    if (s.state === 'bolt' || s.state === 'react' || s.state === 'shove') {
      s.gas = target;
    } else {
      const rate = target > s.gas ? K.startRamp : K.stopRamp;
      s.gas += clamp(target - s.gas, -rate * dt, rate * dt);
      target = s.gas;
    }
    if (dir) {
      const run = s.state === 'bolt';
      const av = avoid(s, dir.x, dir.z, run ? 1.15 : 1.5, run ? 0.9 : 1.25, run);
      // Corner cost: you cannot take a 90 at full tilt. Charge it against the
      // ROUTE direction, not the crowd-avoidance one — steer()'s lateral grip
      // already handles jostle, and billing it twice meant every shopper the
      // thief squeezed past cut him to 60% while the cop shoved straight through.
      // Free under ~30 degrees, full bite at 90.
      let cm = 1;
      if (s.speed > 0.6) {
        const fx = s.vel.x / s.speed, fz = s.vel.z / s.speed;
        const cosA = clamp(dir.x * fx + dir.z * fz, -1, 1);
        let bite = clamp((K.thiefCornerFree - cosA) / K.thiefCornerFree, 0, 1);
        // ROUND 4 — as written in round 3 this measured a corner multiplier of
        // 0.99 across every chase in the bench: it never fired. `dir` comes out
        // of nav.steer(), which string-pulls to the furthest VISIBLE point on
        // the descent, so the aim point swings round the end of a gondola a beat
        // before the body does and the two vectors never disagree by much. The
        // cost was written, documented, tuned — and dead. thiefCornerFree is now
        // set where the angle a running body actually produces can reach it.
        //
        // I also tried billing it against steer()'s `skid`, which is the lateral
        // acceleration he is really spending, and that is the right quantity but
        // it is NOT SAFE as written: skid is downstream of the speed target, so
        // charging the target against it closes a feedback loop. The bench trace
        // showed the result plainly — a bolting thief oscillating between 3.7
        // and 1.1 m/s on a straight, with his target collapsing to 1.8. Left in,
        // it would have flattered every number in this file by crippling the man
        // being chased. The correct version bills the BEND OF THE ROUTE AHEAD,
        // which is exogenous; it is worth doing and it is not done here.
        cm = 1 - (1 - K.thiefCorner) * bite;
        target *= cm;
      }
      s.dbgCorner = cm;
      s.dbgTarget = target;
      steer(s, av.x, av.z, target, K.thiefAccel, 0.72, K.thiefRun, dt);
    } else {
      // ...AND NOBODY STOPS DEAD. This branch is a body with nowhere left to
      // go — he has arrived, or he is browsing, or a clip has him — and it used
      // to hand steer() a target of literally zero, which at 10.5 m/s^2 parks a
      // walking man in 0.12 s. He now coasts down along his own heading at the
      // ramped target, which is 0.30 s from a walk: three frames of a 0.1 s
      // strip instead of one, and about 0.19 m of overshoot past the point he
      // was aiming at, which is also what happens when a person walks up to a
      // shelf.
      s.dbgTarget = target;
      const sp = s.speed;
      const fx = sp > 0.01 ? s.vel.x / sp : 0, fz = sp > 0.01 ? s.vel.z / sp : 0;
      steer(s, fx, fz, target, K.thiefAccel, 0.72, K.thiefRun, dt);
    }
    solids.resolve(s.position, BODY_R);
    animateShopper(s, dt, target);
  }

  // Which door he is at, if any. -1 otherwise.
  function atExit(s) {
    for (let i = 0; i < EXITS.length; i++) {
      const e = EXITS[i];
      if (dist2d(s.position.x, s.position.z, e.x, e.z) < 1.35) return i;
    }
    return -1;
  }
  function startShove(s) {
    const i = atExit(s);
    if (i < 0) return;
    s.exitI = i; s.state = 'shove'; s.shoveT = EXITS[i].shove; s.duck = 0; s.duckT = 0;
  }

  function escape(s, api) {
    s.escaped = true; s.mesh.visible = false; s.cart.visible = false;
    s.bang.visible = false; s.vel.set(0, 0, 0);
    // ROUND 6 — innocents use this door too, and an innocent walking out is not
    // a merchandise loss. game.js's onEscape() scores a loss, logs it and stands
    // the player down, so it MUST NOT fire for a customer who has finished his
    // shop. `onLeave` is additive and optional; a game.js that ignores it sees
    // exactly what it saw before, minus the false losses. game.js's own
    // repopulate() already puts an escaped body back in the building 18 s later,
    // so the store refills with no change on that side.
    if (s.guilty) api.onEscape && api.onEscape(s);
    else api.onLeave && api.onLeave(s);
  }

  // THE PROP RIDES THE HAND. Factored out of the clip branch in round 12 so the
  // browse reach and the eleven decoy clips place an item with the SAME code —
  // one owner for the derivation, which is CLAUDE.md's rule and is also the
  // decoy system's whole structural claim one level down.
  //
  // Round 5 authored the concealment's item as absolute rig-local coordinates
  // and got away with it because at 431 px down a 26 m aisle a half-metre error
  // is two pixels. The spot monitor pushes a subject to a large fraction of
  // frame height now, and at that size the same clip showed a box hanging in the
  // air beside his LEFT ear while his RIGHT arm reached — 0.50 m from the hand
  // that was supposed to be holding it. An ambiguity argument cannot be made out
  // of a floating box, so the arm is the source of truth and the prop is derived.
  //
  // Euler XYZ on the shoulder pivot, arm hanging down its local -Y:
  //   v = Rx(ax) * Rz(az) * (0,-L,0)
  //     = ( L sin az, -L cos az cos ax, -L cos az sin ax )
  // The shoulder AND the arm length are read off the rig, so girth, build and
  // height come out correct per body — round 11 found the second half of that
  // the hard way, with short-armed bodies holding a bottle 40 mm past their own
  // fingertips.
  //
  // ROUND 12 — and the SCALE is the size of the thing that actually left the
  // shelf, when there is one. `p.item` was the only sizing there was: three
  // numbers per clip, so every grocery item in the game was one box at four
  // sizes. A facing handle carries real metres, so a jar is a jar and a
  // 300 mm cereal carton is visibly not a tin. The clip's triple survives as a
  // multiplier, which keeps `FLAT` reading as a phone and `TALL` as a bottle
  // for the clips where the prop is NOT off a shelf.
  const PROP0 = [0.15, 0.18, 0.11];        // the base goods box, metres
  function placeProp(s, r, p) {
    // ROUND 12 — the ANGLES ARE READ OFF THE RIG, not off the sampled clip.
    // They were the same number until this round, because the clip branch
    // assigns one to the other; they are not any more. Two things now modify
    // the arm after the clip has been sampled — round 9's camera-elevation
    // solve for the bird, and this round's per-reach shelf height — and a prop
    // placed from `p` would sit where the clip WANTED the hand rather than
    // where the hand is. Same class of bug as round 5's floating box, one
    // indirection further down; the rig is the truth, so read the rig.
    const AL = r.armLen;
    const shX = r.armR.position.x, shY = r.hipY + r.armR.position.y;
    const az = r.armR.rotation.z, ax = r.armR.rotation.x;
    const cz = Math.cos(az), sz = Math.sin(az);
    const cx = Math.cos(ax), sx = Math.sin(ax);
    s.held.position.set(
      shX + AL * sz + p.off[0],
      shY - AL * cz * cx + p.off[1],
      -AL * cz * sx + p.off[2],
    );
    const sz3 = s.itemSize;
    if (sz3) {
      s.held.scale.set(
        p.item[0] * sz3[0] / PROP0[0],
        p.item[1] * sz3[1] / PROP0[1],
        p.item[2] * sz3[2] / PROP0[2],
      );
    } else {
      s.held.scale.set(p.item[0], p.item[1], p.item[2]);
    }
  }
  // The cart is parked where he stopped, hands OFF the bar. Half the picture is
  // the two seconds his hands are not on it. It parks at HIS push distance, not
  // at a constant: park it at 0.62 while he pushes it at 0.85 and the cart jumps
  // a quarter of a metre on the frame the clip starts, which on the spot monitor
  // is a shunt you can see and time.
  //
  // ROUND 12 — IT DOES NOT TURN WITH HIM ANY MORE, and that is not a detail. A
  // shopper now stands SQUARE TO THE SHELF while he browses (see wanderTarget),
  // and a cart that followed the body yaw would swing a metre of chrome straight
  // into the gondola every time somebody stopped to look at something. What
  // people actually do is leave the trolley pointing down the aisle and turn to
  // the fixture, so the cart rides `cartYaw` — the heading he was travelling on
  // when he stopped — and picks the body's yaw back up the moment he moves off.
  function parkCart(s, P, mid) {
    if (!s.hasCart) return;
    const y = s.cartYaw;
    const d = P.cartD * (mid ? 1 : 1);
    s.cart.visible = true;
    s.cart.position.set(s.position.x + Math.sin(y) * d, 0, s.position.z + Math.cos(y) * d);
    s.cart.rotation.y = y;
  }

  // ===========================================================================
  // gaitUnits — THE SOLVE IS IN ROOT-LOCAL METRES AND THE STORE IS NOT.
  // ===========================================================================
  // ROUND 3 (move). Every figure hangs under a root group that is SCALED —
  // 1.04 on the cop, 0.9585 to 1.1143 across the fourteen — and `L`, the step
  // and everything gait.js solves live INSIDE that scale. The plant is the
  // identity `v*T = 2*S`: the body covers two step lengths per gait cycle. It
  // holds only when v and S are in the same units, and `s.speed` is world
  // metres while S comes out of a root-local solve, so the DRAWN foot sweeps
  // rootScale times what the solve planted and the stance foot skates by
  // (rootScale - 1) of its own excursion.
  //
  // Round 1 (cop) found this while porting him, fixed it for him alone with
  // three inline lines, and reported it rather than moving fourteen shoppers
  // mid-round. Measured on the crowd, foot-flat stance skate as a signed
  // fraction of the ground the body covered under the planted foot, regressed
  // against each body's own root scale — the fraction and not the millimetre,
  // because the millimetre also carries speed, step and stature and cannot be
  // regressed against one of them:
  //
  //                 slope vs rootScale      r        p        mean |x|   worst
  //     before        -0.721 +/- 0.142    -0.826   0.0003      0.053     0.139
  //     after         +0.224 +/- 0.126    +0.456   0.10        0.023     0.069
  //
  // The prediction for the broken version is slope -1.06 and the before CI is
  // [-1.03, -0.41]; the after CI is [-0.05, +0.50], which contains zero. So the
  // error was a function of how tall the body is and is not one now, and the
  // mean did not merely improve while the correlation survived — which is the
  // failure this was measured to rule out.
  //
  // IT IS A FUNCTION RATHER THAN THREE LINES IN EACH CALLER because three
  // lines in each caller is precisely the shape of every bug CLAUDE.md's
  // duplication rule is about, and this one had already been written twice —
  // once correctly, once not at all.
  function gaitUnits(r, worldV, stride, heavy) {
    const rootS = (r.root && r.root.scale.x) || 1;
    const vLocal = worldV / rootS;
    return { rootS, vLocal, step: stepLength(vLocal, r.hipY, stride, heavy) };
  }
  // THE SOLE PIN'S ROLL TERM, hoisted so that plantCheck() can call the SHIPPED
  // expression rather than a copy of it. A check that re-types the formula with
  // literal zeros in it proves that `x / 1 === x`, which is what copCheck's
  // units row does and is why this one is a function instead.
  //
  //   floorY  the floor under a pivot at hips-local (0, 0)
  //   px      the leg pivot after the lateral sway
  //   rz      that leg's own roll, so the corner's offset under it is counted
  //   hz      the pelvis roll the pivot is being carried round by
  //
  // At hz = 0 it returns floorY exactly, for every px and rz.
  function pinRolled(floorY, L, px, rz, hz) {
    const ch = Math.cos(hz), sh = Math.sin(hz);
    return (floorY - (px + L * Math.sin(rz)) * sh) / Math.max(0.5, ch);
  }

  // ===========================================================================
  // poseWalk — THE WALK, APPLIED TO A RIG. ONE OWNER, TWO CALLERS.
  // ===========================================================================
  // gait.js owns the SOLVE. This owns what you do with the answer, which is the
  // other half of the same derivation and had exactly the same problem: the
  // solve's output is only planted if the six compensation terms downstream of
  // it are right, and every one of them has already been wrong once —
  //
  //   the leg groups counter-rotate the pelvic list, or a listing pelvis walks
  //     both feet 120 mm sideways;
  //   the leg PIVOTS counter-translate the lateral sway, or the same again;
  //   `floorY` comes from `_G.drop` and NOT from `hips.position.y`, which is
  //     written thirty lines later and was therefore a frame stale — 43 mm of
  //     heel through the tiles on exactly the frame of heel strike;
  //   the ENGAGEMENT fade multiplies the STEP and never the leg angles,
  //     because the plant is an equality between those two and scaling one
  //     side of it broke it (142 mm of measured drift under a passing check);
  //   every input to the solve fades together or none of them do, or a stopped
  //     body sits 47 mm low forever;
  //   a stance leg is NEVER shortened, or the foot leaves the ground.
  //
  // Those six were bought over two rounds by rendering the thing, and until
  // this round the cop had none of them: `animateCop` was a SECOND, older
  // implementation of this function — two sines, no plant, no knee, no ankle —
  // and it is why he missed every one of those fixes. Everything genuinely
  // different about a heavy man's walk is a NUMBER in `o` below. If you find
  // yourself writing a second copy of any line in here, that is the bug this
  // function exists to have already fixed.
  //
  //   o.L        hip pivot -> sole, root-local
  //   o.step     step length BEFORE the engagement fade; `gz` is applied here
  //   o.duty o.lift o.flex        straight into the solve, all faded by gz
  //   o.gait     0..1, how engaged the swagger is (speed / 1.4 for a shopper)
  //   o.gz       0..1, how engaged the GAIT is (speed / 0.55)
  //   o.listA o.swayA o.roll      the weight-transfer amplitudes
  //   o.toeL o.toeR o.splay       foot yaw, and hip abduction
  //   o.restHipZ o.rest0          contrapposto, and how far it has faded
  //   o.sink     extra hip drop, metres, applied to the hips AND to the floor
  //              so the sole pin follows it. See K.copHeelSink.
  //   o.worldSpeed  the SAME speed in world metres a second. Required, and it
  //              is required so that the units assertion below has two
  //              derivations to compare — see gaitUnits().
  // Returns `_G`, the same scratch object solveGait writes.
  function poseWalk(r, o) {
    // THREE goes in because the knee split needs constructors — see attachFeet.
    // Without it the rig falls back to round 12's telescoping leg rather than
    // throwing, which is the same degradation path the shoe search already had.
    if (!r.feetOk && r.feetOk !== false) attachFeet(r, THREE);
    // ---- THE UNITS, ASSERTED INSTEAD OF COMMENTED --------------------------
    // CLAUDE.md's lungCheck() rule: if two things can disagree, make them say
    // so out loud. `o.speed` must be root-local and `o.worldSpeed` world, so
    // their ratio must be this rig's own root scale and nothing else. A caller
    // that writes `speed: s.speed` — which is exactly what animateShopper did
    // for four rounds — fails this on every body whose root is not 1.0, which
    // is thirteen of the fourteen.
    //
    // Note what this can and cannot do: it is a check on the CONTRACT, not on
    // the geometry, and copCheck()'s own units row is worse than this — it
    // re-derives `bodyPerCycle = v * (2*S / (v/rootS))` against
    // `groundPerCycle = 2*S*rootS`, which are algebraically identical for every
    // rootS, so that row reads 0.000 mm whatever the code does. It has never
    // been able to fail. This one can, because the two numbers it compares come
    // from different places.
    if (o.worldSpeed == null) UNITS.missing++;
    else if (o.worldSpeed > 0.05) {
      const rootS = (r.root && r.root.scale.x) || 1;
      const err = Math.abs(o.speed * rootS - o.worldSpeed);
      UNITS.n++;
      if (rootS !== 1) UNITS.scaled++;
      if (err > UNITS.worst) { UNITS.worst = err; UNITS.at = { rootS: +rootS.toFixed(4), v: +o.worldSpeed.toFixed(3) }; }
    }
    const gz = o.gz, gait = o.gait, L = o.L;
    solveGait(_G, {
      phase: o.phase, speed: o.speed, L, step: o.step * gz,
      duty: o.duty,
      // BOTH OF THESE FADE WITH `gz` TOO, and leaving them out of it was a
      // real bug with a quiet signature. `phase` keeps ticking on a stopped
      // body, so a standing body still cycles through stance and swing — and
      // with an unfaded flexion it sat 47 mm low forever, while an unfaded knee
      // lift slowly picked each foot up off the floor. Every input to the solve
      // fades together or none of them do.
      lift: o.lift * gz,
      flex: o.flex * gz,
      feet: !!r.feetOk,
      // The shoe's own box, so the solve can put the hip where the FOOT holds
      // it rather than where a rigid rod would. Measured once at attach, null
      // if the shoes were not found, and the solve falls back without it.
      foot: r.footGeom,
    });
    // ---- THE PELVIS, SOLVED BEFORE THE FEET ARE PINNED ---------------------
    // These four are computed here rather than where they are written, because
    // the roll-aware sole pin below needs all of them before a foot is placed.
    // Nothing between here and their assignment reads or writes any of them, so
    // a body gets the same numbers in the same order it always did.
    if (r.stance0 === undefined) {
      r.stance0 = r.legL.position.x; r.stanceR0 = r.legR.position.x;
      // ...and the pivots' own FORE-AFT rest offsets, read the same way and for
      // the same reason. They are not zero: COP_RAKE_Z puts the cop's hips
      // behind his feet, which is round 1's weight-on-the-heels read expressed
      // as a translation rather than as an angle. See the pelvis-yaw
      // counter-translation at the bottom of this function.
      r.legZ0 = r.legL.position.z; r.legRZ0 = r.legR.position.z;
    }
    const list = _G.list * o.listA * gait * o.roll;
    const hz = list + o.restHipZ * o.rest0 + (o.hipZAdd || 0);
    const sway = _G.sway * o.swayA * gait;
    const legZ = -(list + o.restHipZ * o.rest0 * gz);
    // Straight through, NOT scaled — see `gz` above. A stopped body stands
    // still because its step went to zero, which is the same reason its hip
    // stopped dropping, so the contrapposto takes over underneath with nothing
    // to fight.
    r.legL.rotation.x = _G.thL; r.legR.rotation.x = _G.thR;
    // The knee and the ankle roll, written onto the two meshes attachFeet found
    // inside each baked leg group. Both go to rest when the body does, and both
    // are no-ops if the leg group ever changes shape enough that they could not
    // be found — see gaitCheck().
    if (r.feetOk) {
      if (gz > 0.02) {
        // The floor, in hips-local metres, taken FROM THE SOLVE and not from
        // `hips.position.y` — which is written further down, so reading the rig
        // saw the PREVIOUS frame's value and at the stance handover put the
        // heel 43 mm through the tiles. `_G.drop` has one owner and no phase.
        // `o.sink` is in here for the same reason: whatever lowers the hips has
        // to lower the floor the sole is pinned to by the same amount, or the
        // compliance term below unplants both feet.
        const floorY = _G.drop + (o.sink || 0) - L;
        // ---- ROUND 1 (cop): THE PIN SOLVES IN THE LEG'S OWN FRAME AND THE
        // ---- PELVIS ROLLS UNDERNEATH IT ------------------------------------
        // footPose returns a sole corner's height RELATIVE TO ITS OWN HIP
        // PIVOT, and `floorY` above is the floor under a pivot sitting at
        // hips-local (0, 0). The pivot is not at 0: it is out at +-stance, and
        // the pelvis ROLLS about its own origin, so a listing pelvis carries
        // the loaded pivot DOWN by px*sin(hz) and the pin never hears about it.
        // The leg groups counter-rotate the list so the femur stays vertical,
        // which is right and is not this — this is the pivot itself moving.
        //
        // Measured on the cop, one stride at his own 2.35 m/s, lowest pinned
        // sole corner in world millimetres:
        //     shipped       -39.6        list forced to 0     -2.2
        //     splay to 0    -38.5        toe forced to 0     -29.2
        // i.e. it is the list, at 9.2 degrees over a 180 mm pivot, and nothing
        // else on the list came close.
        //
        //     floorY = -((L - drop - sink) + px*sin(hz)) / cos(hz)
        //
        // `px` is the pivot AFTER the sway translation plus the corner's own
        // lateral offset under the leg's roll (L*sin(rz)), which is the 7 mm
        // second-order term.
        //
        // ---- ROUND 3 (move): AND NOW EVERYBODY GETS IT ----------------------
        // Round 1 put this behind `o.pinRoll`, ON for the cop and OFF for the
        // fourteen, so that the crowd's numbers that round were provably
        // identical to the digit. That was the right call for one round and is
        // the wrong state to leave a file in: two code paths, one derivation,
        // differing deliberately, which is the hazard CLAUDE.md opens with. The
        // flag is gone and this is what every body does.
        //
        // AT hz = 0 THIS IS EXACTLY THE EXPRESSION IT REPLACED — sh = 0, ch = 1,
        // and pin1 collapses to `drop + sink - L`. So a body that is not listing
        // is untouched to the last bit, and plantCheck() asserts that identity
        // rather than asking you to believe this paragraph. Measured on the
        // crowd, stance-sole depth below the tiles over ~8,300 foot frames
        // across all fourteen bodies — a PROFILE, because the last two rounds
        // each had a "worst" that turned out to be one pose:
        //
        //                       p01        median      worst
        //     before          -24.2 mm     -4.8 mm    -25.7 mm
        //     after            -7.8 mm     -0.35 mm   -12.3 mm
        //
        // and on the live store with everybody in it and every state running,
        // p01 -21.4 -> -11.2 and median -3.3 -> -0.3. The live WORST goes the
        // other way, -26.9 -> -30.0, and it is a `browse` frame on both builds:
        // a pose branch writes the hips after poseWalk has pinned the feet, so
        // the deepest sole in the store is not the walk and never was.
        // Written off `floorY` rather than re-deriving `L - drop - sink`, so
        // the collapse at hz = 0 is visible in the source instead of being a
        // claim about it: sh = 0 and ch = 1 leave `floorY / 1`. The expression
        // itself lives in pinRolled() so plantCheck() can call THIS code and
        // not a retyped copy of it.
        const fL = pinRolled(floorY, L, r.stance0 - sway, legZ + (o.splay || 0), hz);
        const fR = pinRolled(floorY, L, r.stanceR0 - sway, legZ - (o.splay || 0), hz);
        // How big the roll term actually is, live, so plantCheck can report a
        // magnitude rather than only an identity. This is an OBSERVATION and
        // has no threshold: it is what deleting the flag moved.
        const roll1 = Math.max(Math.abs(fL - floorY), Math.abs(fR - floorY));
        if (roll1 > UNITS.rollWorst) { UNITS.rollWorst = roll1; UNITS.rollAt = +hz.toFixed(4); }
        footPose(r.footL, _G.kneeL, _G.ankL, _G.thL, fL + _G.clearL);
        footPose(r.footR, _G.kneeR, _G.ankR, _G.thR, fR + _G.clearR);
        r.footRested = false;
      } else if (r.footRested !== true) { footRest(r.footL); footRest(r.footR); r.footRested = true; }
      // Which foot is carrying, published on the rig for gaitCheck's live half
      // and for anything that wants to know. Read-only for everyone else.
      r.stL = _G.stanceL; r.stR = _G.stanceR;
    }
    // Toe-out is one assignment and it is worth having: it is set ONCE per frame
    // rather than driven, so it costs nothing, and a duck-footed walk and a
    // pigeon-toed one are different people from across a store. THE TWO FEET
    // ARE INDEPENDENT — one roll per foot costs the same as one roll for both.
    r.legL.rotation.y = o.toeL; r.legR.rotation.y = o.toeR;
    // Hips and chest counter-rotate. The transverse rotation is SOLVED from
    // where the two feet actually are, so a long stride reaches with the pelvis
    // and a shuffle does not, instead of both getting 0.055 rad off a sine.
    // `roll` is clamped to a TRIM by the caller: used as a bare multiplier on an
    // angle that is already a real anatomical quantity it produced 20 degrees of
    // pelvic rotation, about three times life.
    r.hips.rotation.y = _G.pelvisY * 0.34 * gait * o.roll;
    r.chest.rotation.y = -_G.pelvisY * 0.52 * gait * o.roll;
    // ---- THE PELVIS LISTS, AND THE BODY GETS OVER EACH FOOT -----------------
    // These two are the brief's "weight transfer, not a slide", and they are
    // where a heavy walk and a lean walk stop being the same animation.
    //
    // LIST: the UNLOADED hip drops (Trendelenburg). tanh() rather than a sine
    // because weight transfer is quick and the plateau in the middle of each
    // stance is what makes it read as load rather than as wobble. Solved above,
    // with the sway and the leg counter-rotation, because the sole pin needs
    // all three before the feet are placed.
    r.hips.rotation.z = hz;
    // ...AND THE LEGS COME BACK OUT OF IT. A pelvis lists ABOUT the hip joint of
    // the leg that is carrying; the femur underneath it stays roughly vertical.
    // These legs are children of `hips`, so an uncompensated list rotates both
    // of them bodily and walks the feet sideways — 120 mm at a realistic 8
    // degrees, which is a person skating. `rest0 * gz` fades the contrapposto
    // out of the compensation as the gait engages, because a body AT REST
    // should tilt its legs with its hips and a body WALKING should not.
    //
    // ROUND 1 (cop) — `o.splay` is hip ABDUCTION and it is ADDED here, outside
    // the compensation, mirrored per leg. It is the only honest place for a
    // wide stance on a rig whose thighs have to overlap across the midline to
    // be a pelvis at all (see COP_STANCE in figures.js). It costs the sole pin
    // an approximation it was already making for the list — the pin solves in
    // the leg's pitch plane and knows nothing about roll — worth about 3 mm of
    // sole height at 0.05 rad on a 100 mm sole, and it is a CONSTANT, so it
    // cannot slip.
    r.legL.rotation.z = legZ + (o.splay || 0); r.legR.rotation.z = legZ - (o.splay || 0);
    r.hipsZ0 = r.hips.rotation.z;              // what a pose branch adds is undone below
    // VERTICAL: the controlled fall. EXACT, with no per-person trim on it, and
    // that is the point. `drop` is L(1 - cos theta) off the stance leg and the
    // plant is an equality between that and the leg angle; multiplying one side
    // by a `bounce` dial unplants the foot by exactly the amount of the trim.
    r.hips.position.y = L - _G.drop - (o.sink || 0);
    // LATERAL: the pelvis translates over the loaded foot, and the LEG PIVOTS
    // ARE MOVED BACK BY THE SAME AMOUNT so the feet stay where they were put.
    // Without that compensation this would drag both planted feet sideways and
    // undo the whole point of the solve above. `stance0` is figures.js's own
    // stance width, read once and never written, so this composes with a
    // per-person stance instead of replacing it. (Both `stance0` and `sway` are
    // solved at the top of this function, because the sole pin needs them.)
    r.hips.position.x = sway;
    r.legL.position.x = r.stance0 - sway;
    r.legR.position.x = r.stanceR0 - sway;
    // ---- ROUND 4 (move): ...AND SO DOES THE TRANSVERSE ROTATION -------------
    // The two lines above are the file's own rule — "whatever the pelvis does
    // that would move the feet is undone at the leg pivots" — applied to the
    // pelvis's lateral TRANSLATION. It was never applied to its YAW, and a yaw
    // moves a pivot sitting out at +-px fore and aft by px*sin(psi), which is
    // the same kind of dragged foot one axis over.
    //
    // It is the single biggest term in the crowd's stance skate and the biggest
    // in the cop's, measured as a signed fraction of the ground covered under
    // the planted foot: the hip JOINT falls -0.104 behind the body on him and
    // -0.054 on the crowd's median body, per foot-flat window. On him that is
    // 40 mm a stance, on a 150 mm stance width and 0.26 rad of yaw across the
    // window, and it is what the moment arm was cancelling: fix one without the
    // other and his skate goes +0.039 -> -0.103.
    //
    // WHAT IT GIVES UP, SAID OUT LOUD: pelvic transverse rotation genuinely
    // carries the hip joints in a real walk — it is one of the classical
    // determinants of gait and it is part of how a long stride is bought. What
    // it carries them ABOUT is the hip that is loaded, because that leg is
    // planted; a pelvis rotating about the body's own midline, which is what
    // this rig does, moves BOTH hips and there is no leg for it to be rotating
    // about. So the honest version on this rig is that the pelvis rotates and
    // the hip joints do not, exactly as the pelvis lists and the femurs do not.
    // The silhouette keeps the rotation — `hips` carries the chest, the arms
    // and the head — and the feet keep the floor.
    //
    // Exact rather than small-angle: a child at (px, *, pz) under a yaw of psi
    // lands at z = pz*cos - px*sin, so the pz that leaves it where it started is
    // (pz0 + px*sin)/cos. The lateral residual is second order (px/cos - px is
    // 1.8 mm at 0.2 rad on a 90 mm pivot) and is not this axis.
    const cy = Math.cos(r.hips.rotation.y), sy2 = Math.sin(r.hips.rotation.y);
    r.legL.position.z = (r.legZ0 + r.legL.position.x * sy2) / cy;
    r.legR.position.z = (r.legRZ0 + r.legR.position.x * sy2) / cy;
    return _G;
  }

  function animateShopper(s, dt, target) {
    const r = s.rig;
    const P = r.pose;
    const ed = (k) => 1 - Math.exp(-k * (dt || 0.016));
    if (s.speed > 0.15) s.heading = Math.atan2(s.vel.x, s.vel.z);
    // ---- ROUND 12: NOBODY ROTATES ON THE SPOT LIKE A TURRET ----------------
    // `s.heading` is still the true velocity bearing and every consumer of it —
    // the cart, the exit field, atExit(), the pursuit bot, the flee solve — is
    // untouched. What changes is that the BODY is not drawn at it any more.
    // `visYaw` chases it at K.turnRate, so a shopper who reverses down an aisle
    // takes a fifth of a second to come round instead of flipping between
    // frames, and `yawRate` — the speed he is turning at — is then available to
    // two things that need it and had nothing to read:
    //   the HEAD, which leads the body into a turn rather than following it;
    //   the LEAN, because you bank into a corner.
    // A stopped body wants `faceYaw` instead when it has one, which is how a
    // browsing shopper ends up square to the shelf instead of facing down the
    // aisle. See wanderTarget.
    {
      const want = (s.speed < 0.30 && s.faceYaw != null) ? s.faceYaw : s.heading;
      let d = want - s.visYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      // Rate-limited, not lerped: a lerp's speed is proportional to the error,
      // so a 180 comes round explosively and a 5-degree correction crawls. A
      // person turns at about the same rate whichever it is.
      const lim = K.turnRate * (dt || 0.016);
      const step = clamp(d, -lim, lim);
      s.visYaw += step;
      s.yawRate = step / (dt || 0.016);
      s.turnErr = d;
      // The trolley keeps the heading he was travelling on. See parkCart.
      if (s.speed > 0.30 || s.cartYaw === undefined) s.cartYaw = s.visYaw;
    }
    s.mesh.rotation.y = s.visYaw;
    // ---- ROUND 12: THE GAIT IS A CONSTRAINT, NOT A WAVEFORM -----------------
    //
    // What was here divided by a flat 0.88 and swung the legs by 0.20*speed.
    // Both of those are dials, and gait.js's header does the arithmetic: a
    // rigid leg driven that way has its foot planted at exactly ONE speed,
    // 0.81 m/s, and skates quadratically either side of it. At the shopper's
    // own 1.25 m/s the foot goes backwards at 1.92 m/s under a body doing 1.25.
    // That is the slide, and it is why round 11's people looked like they were
    // being dragged along the floor by the hips.
    //
    // The step length is now the only input. The leg angles come out of asin(),
    // the vertical bob comes out of L*(1-cos) — which is the controlled fall,
    // for free, at an amplitude nobody had to pick — and `stride`, `amp` and
    // `bounce` from figures.js survive as what they always claimed to be:
    // stride multiplies the step, amp trims the swing, bounce trims the drop.
    // The 1.6:1 cadence spread round 9 built the crowd on is preserved, because
    // cadence = speed / step and step is still stride-proportional.
    const heavy = (r.desc && r.desc.build >= 4) || false;
    const L = r.hipY;                          // hip pivot -> sole, root-local
    // ---- ROUND 3 (move): AND SO IS THE SPEED THAT GOES WITH IT -------------
    // `L` is root-local and `s.speed` was not, which is bug 1 in gaitUnits()'s
    // header: thirteen of these fourteen bodies were skating in proportion to
    // their own stature, worst 30.7 mm a stance on body 11. `vLocal` is the
    // same speed inside the figure's own scale and it has to be used HERE, in
    // the phase rate below, in `duty` and in what poseWalk is handed, or the
    // four disagree with each other instead of only with the store.
    const { vLocal, step } = gaitUnits(r, s.speed, P.stride, heavy);
    // HOW ENGAGED THE GAIT IS, and it multiplies the STEP rather than the leg
    // angles. That distinction cost an afternoon and it is the single most
    // instructive thing in this round.
    //
    // The first version faded the solve out by scaling `_G.thL/thR` — the leg
    // angles — with `gait`, which is speed/1.4. At the shopper's own 1.1 m/s
    // that is 0.786, so every leg angle was 79% of what the solve had computed
    // while the body still travelled 100% of the ground. The plant is an
    // EQUALITY between those two, so scaling one side of it broke it: the live
    // rig measured 142 mm of stance-foot drift per step on both builds, with a
    // gaitCheck() that passed, because the check tests the solve and the bug was
    // downstream of it. Scaling the STEP instead keeps the equality — a shorter
    // step is a smaller angle AND a smaller ground travel per cycle — so the
    // foot stays planted at every blend value. Measured after: 1.4 mm.
    //
    // The phase RATE still reads the unblended step, or the cadence would go to
    // infinity as a body came to a halt.
    const gz = clamp(s.speed / 0.55, 0, 1);
    // 2PI per full cycle = two steps = 2*step of ROOT-LOCAL ground, which is
    // why this reads `vLocal` and not `s.speed`: the step it divides by came out
    // of a root-local solve and mixing the two is the same bug one line down.
    //
    // `(1 - gz) * dt * 0.35` is round 9's idle tick, kept so a stopped body
    // still breathes and so the browse oscillators downstream of `s.phase` keep
    // running; it is slower than round 9's 0.6 because the reach now owns the
    // visible half of standing still.
    //
    // ---- ROUND 4 (move): AND IT IS FADED NOW, BECAUSE THE THING IT WAS
    // ---- HOLDING UP HAS BEEN FIXED -----------------------------------------
    // For three rounds this line ran UNFADED on the crowd and faded on the cop,
    // and round 3 tried to make them agree and measured the crowd getting
    // WORSE — mean |skate| 0.023 -> 0.037 — so it reverted and published the
    // reason as a conjecture: the tick was a constant offset cancelling an
    // opposite error, probably a moment arm solved on hip-to-SOLE where the rig
    // swings hip-to-ANKLE.
    //
    // It was, and there were three of them, not one. gait.js now swings the
    // hip-to-ankle line over its own length with the foot's rocker in it, its
    // sole pin is vertical instead of leaking along a tilted axis, and poseWalk
    // counter-translates the leg pivots out of the pelvis yaw. Foot-flat stance
    // skate as a signed fraction of the ground covered, fourteen bodies, 8 s
    // warm-up, the solve's own foot-flat window:
    //
    //                                       mean    mean |x|   worst |x|   slope vs rootS
    //     round 3's build, tick unfaded    -0.006     0.012      0.028      +0.108 +- 0.085
    //     three fixes in, tick unfaded     -0.047     0.047      0.073      -0.112 +- 0.117
    //     three fixes in, tick faded       (below)
    //
    // The middle row is the point: with the errors gone the tick is not a
    // compensation any more, it is just 4.7% of extra leg swing with no ground
    // under it, and it shows up as exactly that in the leg term of the budget.
    // Fading it is now free, which is the test that the fix was a fix and not a
    // re-tune — and the same three fixes moved the COP from +0.039 to +0.000
    // with nothing done to him at all, on a body that never had a tick.
    s.phase += (vLocal > 0.02 ? Math.PI * vLocal / step * dt : 0) + (1 - gz) * dt * 0.35;
    const gait = clamp(s.speed / 1.4, 0, 1);
    const sw = Math.sin(s.phase);
    // `amp` is kept because eleven things below still swing arms off it, but it
    // is now DERIVED from the step rather than being a second, independent idea
    // of how far a leg goes: half a step over a leg length is the sine of the
    // hip angle, which is the same quantity gait.js solves.
    const amp = clamp(Math.asin(clamp(step * 0.5 / L, 0, 0.94)) * P.amp, 0.02, 0.75);
    // ---- ROUND 1 (cop): THE SOLVE, ITS SIX COMPENSATIONS AND THE PIN ARE
    // ---- poseWalk() NOW, AND THE COP CALLS THE SAME FUNCTION ----------------
    // Everything that was inline here is byte-for-byte inside poseWalk; what is
    // left at this call site is the SHOPPER'S OWN NUMBERS, which is the whole
    // distinction. `animateCop` used to be a second copy of the block that used
    // to be here — an older one, with no plant, no knee and no ankle — and that
    // is why the man the player looks at for the entire floor phase missed four
    // rounds of fixes to it. See the header over poseWalk.
    const listA = lerp(K.listLean, K.listHeavy, clamp((r.desc ? r.desc.build : 2) / 5, 0, 1));
    const swayA = lerp(K.swayLean, K.swayHeavy, clamp((r.desc ? r.desc.build : 2) / 5, 0, 1));
    // ---- ROUND 11: CONTRAPPOSTO, AND IT FADES OUT AS HE STARTS WALKING -----
    // Standing on one leg puts that hip up and the opposite shoulder down. It
    // is a REST angle rolled per body in figures.js, and poseWalk ADDS it to
    // the gait's hip roll rather than assigning, because that channel is both.
    // The `1 - 0.62*gait` is the whole physical claim: a body at rest has its
    // weight parked on one leg, a body walking is alternating, so the parked
    // tilt has to go away as it does. A carried basket adds its lean into
    // `rest.chestZ` at construction — same channel, same fade, and nothing
    // per-frame knows a basket exists.
    r.rest0 = 1 - 0.62 * gait;
    poseWalk(r, {
      // ROOT-LOCAL into the solve, WORLD alongside it so poseWalk's units
      // assertion has something to compare against. `gait` and `gz` stay on the
      // world speed on purpose: they are how fast the body is actually moving
      // through the store, not a length in the figure's own frame.
      phase: s.phase, speed: vLocal, worldSpeed: s.speed, L, step,
      duty: dutyOf(vLocal, heavy),
      lift: K.gaitLift * (heavy ? K.gaitLiftHeavy : 1) * clamp(P.bounce, 0.65, 1.35),
      flex: K.gaitFlex * (heavy ? K.gaitFlexHeavy : 1),
      gait, gz,
      // `P.roll` reaches 2.46 on a heavy body (rr(0.45,1.70) x 1.45), and used
      // as a bare multiplier on an angle that is already a real anatomical
      // quantity it produced 20 degrees of pelvic rotation and 15 of list.
      // Both are about three times life, and the list version was worse than
      // ugly: the legs hang off `hips`, so 15 degrees of it swung each foot
      // 220 mm sideways. Clamped to a trim, which is what a per-person swagger
      // dial should have been.
      roll: clamp(P.roll, 0.55, 1.35), listA, swayA,
      toeL: P.toe + r.rest.toeL, toeR: -P.toe + r.rest.toeR,
      restHipZ: r.rest.hipZ, rest0: r.rest0,
    });
    // ---- ROUND 12: THE HEAD LEADS THE BODY INTO A TURN ----------------------
    // "The head turns before the body." `turnErr` is exactly how far the body
    // still has to come round, and pushing a fraction of it onto the neck IS
    // anticipation — the head arrives at the new bearing first and the shoulders
    // catch up, which is what a corner looks like on anything with a neck. It
    // costs one multiply and it is only non-zero while the body is actually
    // turning, so a shopper walking a straight aisle pays nothing.
    r.neck.rotation.y = lerp(r.neck.rotation.y,
      s.look + clamp(s.turnErr * K.turnLead, -0.85, 0.85), ed(8));
    // Idle breathing, so a browsing shopper is not a statue. Cheap: one lerp.
    r.chest.scale.y = 1 + Math.sin(s.phase * 0.42 + s.id) * 0.012;
    // The idle clock. It runs ALWAYS — walking, browsing, concealing, bolting —
    // and it is parked on the RIG, which resetShopper() never touches. That is
    // not tidiness, it is the anti-oracle argument in one line: an idle chosen
    // by `floor(t / hold) % n` off a clock that no state transition can restart
    // cannot correlate with a state, and therefore cannot correlate with guilt.
    // Restart it on entry to `browse` and a thief's first idle after a balk
    // would be the same one every time, which is exactly the sort of thing a
    // player learns without knowing they have learned it.
    r.idleT += dt;
    // Every branch below that wants to lean the torso sideways parks it HERE
    // instead of writing chest.rotation.z, because the last line of this
    // function assigns that channel from the gait and would eat it. Two of the
    // three round-9 poses that read at monitor scale are lateral, so this is
    // load-bearing and not plumbing: a hip-shot idle whose shoulder lean got
    // silently overwritten looked like a man standing straight with a limp.
    r.leanZ = 0;
    // ---- ROUND 12: STARTING, STOPPING, AND THE TRUNK THAT KEEPS GOING -------
    // "Nobody accelerates to full speed instantly, nobody stops dead... the
    // trunk keeps moving after the feet stop."
    //
    // `leanA` is the body's own acceleration along its heading, smoothed at
    // ~130 ms. Two channels come off it and they are chosen so that NOTHING
    // ELSE IN THIS FUNCTION WRITES EITHER:
    //   chest.position.z   the trunk translates fore and aft over the pelvis.
    //                      This is the literal follow-through: brake and the
    //                      torso carries on 45 mm and comes back. Nothing has
    //                      ever written chest.position, so it composes with
    //                      every branch below for free.
    //   chest.rotation.x   the pitch, which DOES collide — six branches lerp
    //                      that channel toward a posture. So last frame's lean
    //                      is subtracted before they run and re-added after, in
    //                      the two lines marked LEAN. Adding it blind would let
    //                      each branch's ed() lerp eat and re-emit it, which is
    //                      a slow oscillation nobody would ever find.
    {
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      const along = s.vel.x * fx + s.vel.z * fz;
      const a = (along - (s.lastAlong ?? along)) / (dt || 0.016);
      s.lastAlong = along;
      s.leanA += (clamp(a, -14, 14) - s.leanA) * ed(7.5);
    }
    r.chest.position.z = clamp(s.leanA * 0.012, -0.062, 0.062);
    r.leanX = clamp(s.leanA * K.leanAccel, -K.leanMax, K.leanMax);
    r.chest.rotation.x -= r.leanApplied || 0;                        // LEAN out
    if (r.kid) animateChild(s, dt);

    // Shouldering the door. Both arms out flat on the leaf, body pitched into
    // it — the beat has to be VISIBLE or the grab window is invisible too.
    if (s.state === 'shove') {
      const e = EXITS[s.exitI] || EXITS[0];
      if (e) s.mesh.rotation.y = s.visYaw = s.heading = Math.atan2(e.x - s.position.x, e.z - s.position.z);
      const heave = Math.sin((1 - clamp(s.shoveT / Math.max(0.05, e ? e.shove : 1), 0, 1)) * Math.PI);
      r.armL.rotation.x = -1.75 - heave * 0.28; r.armR.rotation.x = -1.75 - heave * 0.28;
      r.chest.rotation.x = 0.22 + heave * 0.18;
      r.hips.position.y = r.hipY;
      r.hips.position.x = 0; r.legL.position.x = r.stance0; r.legR.position.x = r.stanceR0;
      // ROUND 4 (move): and the pivots' fore-aft, which poseWalk now writes to
      // counter the pelvis yaw. This branch resets the other two and returns
      // early, so a body that shoves a door would otherwise keep whatever yaw
      // offset its last walking frame left on it, forever.
      if (r.legZ0 !== undefined) { r.legL.position.z = r.legZ0; r.legR.position.z = r.legRZ0; }
      r.leanApplied = 0;                                             // LEAN in
      return;
    }
    // ROUND 6 — A CLIP IS PLAYING, AND IT OWNS THE UPPER BODY.
    // Arms, prop, neck pitch, shoulder check and the yaw he turns away from the
    // shelf by, all sampled out of decoy.js — the SAME four lines for a
    // concealment and for a man taking a phone out of his pocket. That identity
    // is the point: the strip of frames off the spot monitor is drawn by one
    // function, so there is no per-frame difference for a player to learn and
    // no way for a later tuning pass to make one of them louder by accident.
    // The legs keep walking off `sw`/`amp` above, because people do fidget with
    // their hands while they shuffle along a shelf.
    if (s.gest) {
      const u = 1 - clamp(s.gestT / Math.max(0.05, s.gestD), 0, 1);
      const p = applyGesture(s.gest, u);
      s.turnY = p.turn;
      // ROUND 12 — off `visYaw`, not `heading`. A clip's `turn` is a yaw ON TOP
      // of the body, and the body is now drawn at a rate-limited yaw that also
      // knows how to stand square to a shelf. Reading `heading` here would have
      // snapped a browsing shopper back to facing down the aisle for the length
      // of every clip he played.
      s.mesh.rotation.y = s.visYaw + p.turn;
      r.armR.rotation.x = p.armR; r.armR.rotation.z = p.armRz;
      r.armL.rotation.x = p.armL; r.armL.rotation.z = p.armLz;
      r.chest.rotation.x = lerp(r.chest.rotation.x, r.stoop + p.chest, ed(10));
      r.neck.rotation.x = lerp(r.neck.rotation.x, p.neck, ed(9));
      r.neck.rotation.y = lerp(r.neck.rotation.y, p.look, ed(9));
      // ROUND 8 — THE HEAD SHAKE, ADDED AFTER THE LERP AND NOT THROUGH IT.
      // "They're shaking their head and they're just pissed off." A shake is a
      // 2 Hz signal and the line above is a 110 ms first-order lag, which halves
      // it: authored as keyframes it came out as a vague waggle. So the clip
      // carries an AMPLITUDE (POSE.shake, zero in eleven of the fifteen clips
      // and in every frame of the other four but the shake itself) and this
      // carries the oscillation, unlagged, on top of the look. One sin, and only
      // for a body that is mid-reaction.
      if (p.shake) {
        const wob = Math.sin((s.gestD - s.gestT) * K.annShakeHz * Math.PI * 2) * p.shake;
        r.neck.rotation.y += wob;
        r.chest.rotation.y += wob * 0.22;      // the shoulders go with it, a bit
      }
      // ---- ROUND 9: HE IS LOOKING AT THE CAMERA THAT IS WATCHING HIM --------
      // `aim` 0..1, solved against the REAL mounted rig in aimAtCamera(). This
      // is a proper look-at rather than a baked yaw, and it has to be, because
      // the joke is "he is looking at YOU" and the player is looking through a
      // specific dome in a specific aisle.
      //
      // A NECK IS NOT A TURNTABLE, which is the only subtlety here. Past about
      // 77 degrees the head stops and the BODY comes round with it, which is
      // both what people do and what makes the pose read at monitor scale: a man
      // who has turned side-on to the aisle to face a camera is a different
      // silhouette, and a head swivelled 140 degrees on a static body is a
      // horror film. `d` is wrapped to (-pi, pi] first or a subject facing 179
      // degrees away spins the long way round.
      if (p.aim > 0.002) {
        const bodyYaw = s.visYaw + p.turn;
        let d = s.camYaw - bodyYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        // HOW MUCH OF THE TURN THE NECK TAKES, AND WHY IT SHRINKS AS HE COMMITS.
        // A glance is 77 degrees of neck on a body that has not moved. A man
        // deliberately giving a camera the finger has TURNED TO FACE IT, and
        // the difference is not cosmetic: the arm hangs off `chest`, so it goes
        // wherever the BODY goes and not where the head goes. Shipped at a flat
        // 1.35 and the render settled it — he stood side-on to the aisle,
        // looked at the dome over his shoulder, and thrust the bird at a
        // shelf 77 degrees away from it. Fading the neck's share to 0.30 rad as
        // `aim` reaches 1 puts the body — and therefore the arm — inside 17
        // degrees of the lens, and leaves him just enough askance to still read
        // as a person rather than as a turret.
        const headMax = 1.35 - 1.05 * p.aim;
        const head = clamp(d, -headMax, headMax);
        s.mesh.rotation.y = bodyYaw + (d - head) * p.aim;
        r.neck.rotation.y = lerp(r.neck.rotation.y, head, p.aim * 0.85);
        r.neck.rotation.x = lerp(r.neck.rotation.x, s.camPitch, p.aim * 0.85);
        // AND THE ARM'S ELEVATION IS SOLVED, NOT AUTHORED. A dome 11 m down the
        // aisle is 5 degrees up; the same dome from 2 m away is 30. A clip
        // cannot know which, so it authors the intent — armR past -1.7 means
        // "this arm is up" — and the true elevation plus a 26-degree flourish is
        // solved here. Without it he points at the ceiling from one end of an
        // aisle and at the floor from the other, and the gesture stops being
        // aimed at anything, which is the entire joke.
        if (p.armR < -1.7) {
          // IT ONLY EVER RAISES THE ARM, NEVER LOWERS IT, and getting that
          // backwards is instructive. Solving the elevation outright pointed the
          // bird at the dome correctly and dropped it from the 50 degrees the
          // clip authored to 38, because a camera 5 m away down an aisle is
          // nearly level. Which is geometrically right and visually wrong: NOBODY
          // CAN TELL whether an arm is aimed 38 or 50 degrees at something 5 m
          // away, and everybody can tell whether the hand is above the head. The
          // shoulder is at 1.32 m and the arm is 0.72 long, so 38 degrees puts
          // the hand 40 mm over a 1.72 m crown and 50 degrees puts it 150 mm
          // over — at 22 px tall that is the difference between a lump on the
          // silhouette and nothing at all. So the authored angle is a FLOOR and
          // the solve only bites where it has to: close in, under a dome that is
          // steeply overhead, where an arm at 50 degrees really would be aimed
          // at the shelf behind it.
          const authored = -p.armR - 1.57;
          const wantEl = Math.max(authored, 0.45 + Math.abs(s.camPitch));
          r.armR.rotation.x = lerp(p.armR, -(1.57 + wantEl), p.aim * 0.9);
        }
      }
      // ---- and he is saying something you cannot hear ----------------------
      // Same construction as the shake, one storey down the face: an amplitude
      // in the clip, the oscillation here, unlagged. 3.2 Hz is the syllable rate
      // of somebody who is annoyed rather than chatting.
      if (p.mouth) {
        r.neck.rotation.x += Math.sin((s.gestD - s.gestT) * 3.2 * Math.PI * 2) * p.mouth;
      }
      // ---- THE BIRD, AS A GEOMETRY SWAP ------------------------------------
      // No new mesh, no new material, no new draw call: the right hand's mesh
      // already exists and this points it at a different BufferGeometry while
      // the arm is up. Gated on `aim` AND on the arm actually being raised, so
      // the hips-on-hips and the arms-folded rungs — which aim just as hard —
      // do not stand there with a finger out.
      const wantBird = p.aim > 0.5 && p.armR < -1.7;
      if (wantBird !== r.birdOn) {
        r.birdOn = wantBird;
        r.handR.geometry = wantBird ? r.birdGeo : r.handGeo;
      }
      // ROUND 12 — A REACH THAT FOUND NOTHING SHOWS NOTHING. Roughly a third of
      // the places a body legitimately stands are opposite a gondola break, an
      // end cap or a door frame, and there is no peek in the facing contract —
      // you find out by asking for one. So the grasp is allowed to come away
      // empty and the clip plays out unchanged, which is what a person who
      // looked and did not take looks like. The alternative was worse in the
      // exact way the client complained about: a generic box materialising in a
      // fist that no shelf is missing.
      s.held.visible = !!p.vis && (p.tell !== 'reach' || !!s.facing);
      // THE PROP RIDES THE HAND. It is not authored as an absolute point any
      // more, it is SOLVED from the arm the clip is driving, plus a small
      // offset for the beats where it is pressed against the body.
      //
      // Round 5 authored the concealment's item as absolute rig-local
      // coordinates and got away with it because at 431 px down a 26 m aisle a
      // half-metre error is two pixels. The spot monitor pushes a subject to a
      // large fraction of frame height now, and at that size the same clip
      // showed a box hanging in the air beside his LEFT ear while his RIGHT arm
      // reached — 0.50 m from the hand that was supposed to be holding it. An
      // ambiguity argument cannot be made out of a floating box, so the arm is
      // the source of truth and the prop is derived.
      //
      // Euler XYZ on the shoulder pivot, arm hanging down its local -Y:
      //   v = Rx(ax) * Rz(az) * (0,-L,0)
      //     = ( L sin az, -L cos az cos ax, -L cos az sin ax )
      // The shoulder itself is read off the rig, so girth, build and height all
      // come out correct per body instead of being assumed.
      // ROUND 11 — off the RIG, not off the module constant. Arm length is now
      // a per-person number (0.95-1.05 of the old flat one), and this solve
      // places a held item along the arm from the shoulder: read the constant
      // and a short-armed body holds its bottle 40 mm past its own fingertips.
      // The shoulder was already read off the rig for exactly this reason and
      // the length was the half that got left behind.
      placeProp(s, r, p);
      // ---- ROUND 12: THE GRASP, AND IT IS ONE `if` IN THE WHOLE FILE --------
      // `vis` stepping 0 -> 1 on a REACH clip is the frame the shelf loses the
      // box. Nothing else in this game removes a facing; see takeAt(). The two
      // reach tails are the only clips this can fire on, so a concealment, a
      // phone and a wallet cannot open a gap however their arms are authored —
      // which is the whole anti-oracle argument and it is this one condition.
      if (p.tell === 'reach') {
        // ---- WHICH SHELF HE IS REACHING AT ---------------------------------
        // The clip authors ONE arm angle at the grasp, which put every hand in
        // the store at 1.65 m — the top of the store's own reachable band — so
        // every gap this round opened would have been on a top shelf. Real
        // people take things off the whole bay, and the store stocks 0.18 m to
        // 2.05 m.
        //
        // So a per-reach elevation is ADDED to the arm the clip is driving,
        // faded in with how extended that arm already is so the neutral top and
        // tail of the clip are untouched. Everything downstream then follows for
        // free, because the hand is solved from the arm and the take point is
        // solved from the hand: a low reach bends the body, takes from a low
        // shelf, and holds the box where the low hand is. It is a hash of
        // (body, reach number) — no draw off rnd(), no knowledge of guilt.
        const ext = clamp((-p.armR - 0.95) / 0.93, 0, 1);
        r.armR.rotation.x = p.armR + s.reachEl * ext;
        r.chest.rotation.x = lerp(r.chest.rotation.x,
          r.stoop + p.chest + Math.max(0, s.reachEl) * 0.42 * ext, ed(10));
        // ROUND 2 (character) — AND THIS IS WHERE `reachDone` COMES FROM. It
        // counts the frames on which a body actually removed a facing, which is
        // the exact event benchTake counts, so the fuse gate built on it
        // equalises the quantity that was leaking rather than a proxy for it.
        // It goes up on a HIT and not on an attempt: a miss is "there is no
        // shelf in front of me", the body shopped either way, but the rate the
        // player can see on the monitor wall is the rate holes appear at.
        // takeAt() takes nothing but `s` and cannot see guilt; nor can this.
        if (p.vis && !r.gestVis) {
          if (takeAt(s)) r.reachDone = (r.reachDone || 0) + 1;
          s.reachTook = true;
        }
        // ...and the box comes OFF THE SHELF rather than appearing in a fist.
        // For 0.28 s after the grasp the prop is lerped from where the facing
        // actually was — the handle's own `at`, in world metres, brought back
        // into rig space — toward the solved hand. Without it the item pops
        // into being at arm's end and the one thing the client asked for reads
        // as a spawn instead of as a removal.
        if (s.facing && s.grabT > 0) {
          s.grabT = Math.max(0, s.grabT - dt);
          const k = clamp(s.grabT / 0.28, 0, 1);
          const a = s.facing.at, sc = r.root.scale.x || 1;
          const dx = a.x - s.position.x, dz = a.z - s.position.z;
          const cy = Math.cos(-s.visYaw), sy = Math.sin(-s.visYaw);
          const lx = (dx * cy + dz * sy) / sc, lz = (-dx * sy + dz * cy) / sc;
          s.held.position.x = lerp(s.held.position.x, lx, k);
          s.held.position.y = lerp(s.held.position.y, a.y / sc, k);
          s.held.position.z = lerp(s.held.position.z, lz, k);
        }
      }
      r.gestVis = !!p.vis;
      parkCart(s, P, true);
      r.chest.rotation.z = -sw * 0.020 * gait + r.rest.chestZ * r.rest0
        + clamp(-s.yawRate * K.turnBank, -0.16, 0.16);
      // A clip owns the arms and the neck. It does NOT own the idle blend, which
      // has to keep decaying underneath it, or a man who folded his arms and
      // then took his phone out would snap back to folded the moment the clip
      // ended. Same line, same rate, for every clip in the file.
      r.idleMix = Math.max(0, r.idleMix - dt * 5.5);
      r.chest.rotation.x += r.leanX; r.leanApplied = r.leanX;        // LEAN in
      if (r.crouched) {                       // see the note at the end of this
        footPose(r.footL, _G.kneeL, _G.ankL, _G.thL, _G.drop - r.hipY + _G.clearL);
        footPose(r.footR, _G.kneeR, _G.ankR, _G.thR, _G.drop - r.hipY + _G.clearR);
        r.crouched = false;                   // function; a clip does not crouch
      }
      return;
    }

    const bolting = s.state === 'bolt' || s.state === 'react';
    if (s.hasCart) {
      // ---- ROUND 9: FIVE WAYS TO HOLD A CART -------------------------------
      // The old two lines put both hands on the bar at exactly -0.95 with a
      // 0.16 splay, for everybody, forever. In the before-shot every adult in
      // the aisle is a forklift, and it is the pose you see most because most
      // people in this store have a cart most of the time. It is therefore the
      // single highest-traffic pose in the game and it was the one with no
      // variation in it at all.
      //
      // Five holds, rolled per person at construction:
      //   0  both hands on the bar          the old one, and still the commonest
      //   1  right hand only, left swinging
      //   2  left hand only, right swinging
      //   3  forearms down on the bar       leaning on it, cart pulled in close
      //   4  pushed out at arm's length     arms straight, cart well ahead
      // The free arm on 1 and 2 swings off the SAME `sw` the legs do with the
      // person's own lag and swing scalars, so a one-handed pusher is not a
      // two-handed pusher with an arm switched off — he walks differently.
      const hold = P.cart;
      const al = Math.sin(s.phase - P.lag);
      const bar = hold === 3 ? -1.24 : hold === 4 ? -0.74 : -0.95;
      const spl = hold === 3 ? 0.26 : hold === 4 ? 0.10 : 0.16;
      const freeX = -al * amp * 0.62 * P.swing;
      if (hold === 1) {
        r.armR.rotation.x = bar - 0.03; r.armR.rotation.z = -spl * 0.65;
        r.armL.rotation.x = freeX;      r.armL.rotation.z = P.splay;
      } else if (hold === 2) {
        r.armL.rotation.x = bar - 0.03; r.armL.rotation.z = spl * 0.65;
        r.armR.rotation.x = -freeX;     r.armR.rotation.z = -P.splay;
      } else {
        r.armL.rotation.x = bar; r.armR.rotation.x = bar;
        r.armL.rotation.z = spl; r.armR.rotation.z = -spl;
      }
      // Leaning on the bar puts weight through the arms, so the hips go back and
      // the back rounds; pushing it out at arm's length does the opposite. This
      // is a lerp rather than an assignment because the browse and idle branches
      // below fight for the same channel and a hard set here would win every
      // frame and flatten them.
      const leanX = hold === 3 ? 0.13 : hold === 4 ? -0.03 : 0.0;
      r.chest.rotation.x = lerp(r.chest.rotation.x, r.stoop + leanX, ed(7));
      s.cart.visible = true;
      const fx = Math.sin(s.cartYaw), fz = Math.cos(s.cartYaw);
      // Leaners keep it in tight, arm's-length pushers shove it out ahead — on
      // top of a per-person base distance, so a corner turn swings a different
      // length of cart for each of them.
      const cd = P.cartD * (hold === 3 ? 0.84 : hold === 4 ? 1.24 : 1);
      s.cart.position.set(s.position.x + fx * cd, 0, s.position.z + fz * cd);
      s.cart.rotation.y = s.cartYaw;
    } else {
      if (s.cart.visible && s.dropCartAt) {
        s.cart.position.set(s.dropCartAt.x + Math.sin(s.dropCartAt.y) * 0.5, 0,
          s.dropCartAt.z + Math.cos(s.dropCartAt.y) * 0.5);
        s.cart.rotation.y = s.dropCartAt.y + 0.5;                 // slewed, abandoned
        s.dropCartAt = null;
      }
      // ROUND 9 — the free-walking arm swing is per person too. `lag` is how far
      // the arm trails the leg on the same side, which is one of those numbers
      // nobody can name and everybody can see: at 0.28 the arms look driven by
      // the shoulders, at 0.66 they look driven by the hips.
      const al = Math.sin(s.phase - (bolting ? 0.2 : P.lag));
      const sc = bolting ? 1.25 : 0.8 * P.swing;
      r.armL.rotation.x = -al * amp * sc;
      r.armR.rotation.x = al * amp * sc;
      // ROUND 11 — one splay per arm, not one mirrored for both. Same argument
      // as the toes: the round-10 crowd hung its arms at exactly +-P.splay,
      // which is a reflection, and a reflected body is a mannequin.
      r.armL.rotation.z = bolting ? 0.12 : r.rest.splayL;
      r.armR.rotation.z = bolting ? -0.12 : r.rest.splayR;
    }
    if (s.angry > 0) {
      const w = Math.sin(s.angry * 22);
      r.armR.rotation.x = -1.9 + w * 0.45; r.armR.rotation.z = -0.55;
      r.armL.rotation.x = -0.4; r.chest.rotation.x = 0.12;
      r.neck.rotation.x = -0.12;
      s.bang.position.y = 2.15 + Math.abs(w) * 0.07;
      r.idleMix = Math.max(0, r.idleMix - dt * 5.5);
    } else if (s.state === 'browse') {
      // 'conceal' used to share this branch with a fixed 1.55 reach. It cannot
      // reach here any more — a concealing thief always has a clip loaded, so
      // the block above returned before this line. This is what a shopper does
      // BETWEEN clips, which makes it the pose the player spends most of the
      // desk phase looking at, so round 9 gave it three shapes instead of one.
      //
      //   0  reach up at a facing        the old one, kept unchanged
      //   1  hand flat on the shelf lip  weight on the far hip, head into the
      //                                  shelf. The cop builder asked for this
      //                                  one by name.
      //   2  both hands up in front      reading something off a facing
      //
      // AND THE SAME THREE ARE AVAILABLE TO A THIEF, because `browse` is where
      // a guilty man waits out a posted guard (see the `walk`/`drift` half of
      // the guilty timeline) and where every innocent in the store spends his
      // afternoon. The style is a property of the BODY and guilt is dealt out
      // fresh over the same fourteen bodies every reset, so across trials every
      // browse style is a thief exactly as often as every other.
      // ---- AND THE IDLES LIVE HERE TOO, WHICH IS THE FIX FOR THE FIRST
      // BUILD'S BEST-HIDDEN BUG. The seven idles shipped on the `else` branch
      // below — the one that owns a body that is not browsing, not angry, not
      // mid-clip. That reads as the right place and it is nearly empty: probe
      // nine stationary shoppers and eight of them are in `browse` and the ninth
      // is in `leave`. In this game A BODY THAT HAS STOPPED IS A BODY AT A
      // SHELF, so `idleMix` measured 0.00 on all nine and the entire idle pool
      // was decoration.
      //
      // So a browsing body ALTERNATES on the same clock everything else uses:
      // one `idleHold` working the shelf, the next standing at it with its arms
      // folded or a hand on its hip, and round again. Which is also what people
      // do — nobody reaches at a shelf continuously for nine seconds — and it
      // keeps the anti-oracle property exactly as it was, because the alternation
      // is `floor(idleT / hold) % 2` off a clock no state transition can touch.
      const standing = (Math.floor(r.idleT / P.idleHold) & 1) === 1;
      const bs = P.browse;
      if (standing) {
        idlePose(s, r, dt, ed, false);
      } else if (bs === 1) {
        // A hand does not bob when it is resting on a shelf. Everything that
        // moves in this pose is the WEIGHT — the far hip carries it, the near
        // shoulder drops onto the braced arm — with a slow settle on top, which
        // is what stops a braced pose reading as a freeze-frame.
        const set = Math.sin(s.phase * 0.31 + s.id) * 0.5 + 0.5;
        r.armR.rotation.x = -1.44 - set * 0.05;
        r.armR.rotation.z = -0.40;
        r.armL.rotation.x = lerp(r.armL.rotation.x, -0.30, ed(5));
        r.armL.rotation.z = lerp(r.armL.rotation.z, 0.30, ed(5));
        r.hips.rotation.z += P.hipSide * 0.055;
        r.hips.position.y -= 0.014;
        r.leanZ = -P.hipSide * 0.075;
        r.chest.rotation.x = lerp(r.chest.rotation.x, r.stoop + 0.10, ed(6));
        r.neck.rotation.x = lerp(r.neck.rotation.x, 0.26, ed(6));
        r.neck.rotation.y = lerp(r.neck.rotation.y, s.look - P.hipSide * 0.30, ed(6));
      } else if (bs === 2) {
        const rd = Math.sin(s.phase * 0.62 + s.id) * 0.09;
        r.armR.rotation.x = -1.52 + rd; r.armR.rotation.z = -0.30;
        r.armL.rotation.x = -1.46 - rd; r.armL.rotation.z = 0.34;
        r.chest.rotation.x = lerp(r.chest.rotation.x, r.stoop + 0.09, ed(6));
        r.neck.rotation.x = lerp(r.neck.rotation.x, 0.34, ed(6));
      } else {
        // ROUND 12 — THE HAND IS OFF THE SHELF NOW, and this pose is what he
        // does BETWEEN reaches rather than instead of them. The old line swung
        // an arm at a shelf on a 0.7 Hz sine forever, which is the pose the
        // client was looking at when he said the reach should take the thing.
        // The reach itself is a 3.1 s clip; see REACH_KEEP in decoy.js. What is
        // left here is a man who has already looked at that shelf: arm down and
        // in, chin up off the facing, eyes travelling along the row.
        const scan = Math.sin(s.phase * 0.44 + s.id * 1.7);
        r.armR.rotation.x = lerp(r.armR.rotation.x, -0.62 + scan * 0.10, ed(5));
        r.armR.rotation.z = lerp(r.armR.rotation.z, -0.24, ed(5));
        r.armL.rotation.x = lerp(r.armL.rotation.x, -0.44, ed(5));
        r.chest.rotation.x = lerp(r.chest.rotation.x, r.stoop + 0.04, ed(6));
        r.neck.rotation.x = lerp(r.neck.rotation.x, 0.18, ed(6)); // looking at the shelf
        // "Looks along the row." The one thing a body parked at a shelf has
        // left, and it goes on AFTER the lerp for round 8's reason: a 110 ms
        // first-order lag halves anything periodic put through it.
        r.neck.rotation.y += scan * 0.30;
      }
      if (!standing) r.idleMix = Math.max(0, r.idleMix - dt * 5.5);
    } else {
      // ROUND 8 — HE IS WALKING IT OFF IN A HUFF, and it outlives the clip by
      // K.annHuffT. Chin up and eleven hundredths of the stoop taken back out of
      // him: this store's whole posture language is people folded over a cart,
      // so a man walking with his back straight reads at a distance without
      // needing a face. It is the same picture on a thief who blanked you.
      //
      // ROUND 10 — TWO AFTER-STATES, AND THE CONFUSED ONE IS NOT A SMALLER
      // VERSION OF THE ANGRY ONE. `mad` is the round-8 picture, constant for
      // constant. `lost` is a body that has not finished the thought: barely
      // straightens (0.03 against 0.11), and the head KEEPS SWEEPING — a 0.42 Hz
      // yaw that runs for the whole tail, which is the only channel a man
      // walking away from you has left. It is slow on purpose: the head shake
      // this replaces is 2.10 Hz, and the difference between negation and
      // searching, with no face available, is almost entirely rate.
      const hf = s.huff > 0 ? 1 : 0;
      const mad = hf && s.huffKind === 'mad';
      r.chest.rotation.x = lerp(r.chest.rotation.x,
        r.stoop + (bolting ? 0.24 : 0.02) - hf * (mad ? 0.11 : 0.03), ed(8));
      r.neck.rotation.x = lerp(r.neck.rotation.x,
        bolting ? -0.10 : hf * (mad ? -0.14 : -0.07), ed(6));
      // ---- ROUND 9: THE IDLES ------------------------------------------------
      // A body that has stopped moving and is not at a shelf, not angry, not
      // mid-clip and not running. Previously that body stood at perfect
      // attention with both arms out at cart height whether or not it had a
      // cart, and there were up to fourteen of them doing it at once.
      idlePose(s, r, dt, ed, bolting);
      // The scan, and it goes AFTER idlePose rather than before it. Two
      // reasons, and the first one is the round-8 head shake's: a 110 ms
      // first-order lag halves anything periodic put through it, so an
      // oscillation is added on top of a solved pose and never lerped into one.
      // The second is that idlePose ASSIGNS neck.rotation.y on three of its
      // seven poses — written above it, the sweep was silently eaten on exactly
      // the bodies it matters most for, the ones who have stopped walking and
      // are standing there still looking. Gated on the tail, so a body nobody
      // has shouted at pays one comparison rather than one sin.
      if (hf && !mad && !bolting) {
        r.neck.rotation.y += Math.sin(s.huff * K.annScanHz * Math.PI * 2) * K.annScanAmp;
      }
    }
    // ---- ROUND 12: HE IS CARRYING SOMETHING, AND IT IS A REAL BOX ----------
    // A body that took a facing and did not put it back walks on with it in his
    // hand until the next clip consumes it. This is one of the two things the
    // gap field is made of and it is what lets a concealment be a concealment
    // OF SOMETHING: by the time a thief plays a steal he is already holding an
    // item that a shelf in this store is visibly missing.
    //
    // It is also, deliberately, the most ordinary picture in the game. Every
    // body does it, the arm that holds it is the same arm eleven clips drive,
    // and nothing here reads `s.guilty` — the same sentence as everywhere else
    // in this file, and this is the one place a careless round would break it.
    if (s.facing && !s.gest) {
      s.held.visible = true;
      _P.armR = r.armR.rotation.x; _P.armRz = r.armR.rotation.z;
      _P.off[0] = 0; _P.off[1] = 0; _P.off[2] = 0;
      _P.item = ONE3;
      placeProp(s, r, _P);
    } else if (!s.gest) {
      s.held.visible = false;
    }
    // The bank. You lean into a turn, and the amount is your yaw rate — which
    // is a real number now that the body has one. Clamped so a 180 at a gondola
    // end does not lay anybody over.
    r.chest.rotation.z = -sw * 0.020 * gait + r.leanZ + r.rest.chestZ * r.rest0
      + clamp(-s.yawRate * K.turnBank, -0.16, 0.16);
    r.chest.rotation.x += r.leanX; r.leanApplied = r.leanX;          // LEAN in
    // ---- ROUND 12: A POSE THAT LOWERS THE HIPS HAS TO BEND THE KNEES --------
    // Found by measuring, and it is round 9's, not this round's: four of the
    // seven idles and one browse style drop `hips.position.y` by 14-55 mm to
    // put weight on a hip or lean on a cart bar. Nothing lowered the LEGS with
    // them, so a standing body's shoes went straight through the tiles by
    // exactly that much — probed across all fourteen bodies, every one of them
    // stood 30-62 mm underground, in every build this game has shipped. It is
    // invisible in a still because the floor draws over it and it is the reason
    // a browsing crowd never quite sat on the ground.
    //
    // With a knee available this is four lines: shorten both legs by the crouch
    // so the ankle stays where it was, and move the sole pin's floor up by the
    // same amount so the shoe follows. `c` is read back off the rig rather than
    // being accumulated by the branches, so it catches any pose that lowers the
    // hips, including ones written after this round.
    if (r.feetOk) {
      // Same argument as the crouch, one axis over: `idlePose` and browse style
      // 1 also ADD to the pelvis roll — up to 0.085 rad, to pop a hip — and a
      // pelvis roll drags both legs with it, which tips a shoe corner under the
      // tiles. Standing on one leg tilts the PELVIS, not the femur. Whatever a
      // pose branch added is taken straight back out of the legs.
      const dz = r.hips.rotation.z - r.hipsZ0;
      if (dz) { r.legL.rotation.z -= dz; r.legR.rotation.z -= dz; }
      const c = (r.hipY - _G.drop) - r.hips.position.y;
      // ---- ROUND 4 (move): AND THE RE-PIN GOES THROUGH pinRolled() ----------
      // Two things were wrong with this and they are the same thing. It re-pinned
      // against a FLAT floor, `_G.drop - r.hipY + c`, throwing away the roll term
      // poseWalk's own pin had just solved — and it only ran at all when the pose
      // lowered the hips, so a pose that added ONLY roll (which is most of the
      // idle pool) moved the pelvis over the feet and never re-pinned anything.
      // That is why three rounds running the deepest sole in the live store was a
      // browse frame and not the walk: -30.0 mm, against -12.3 for the walk.
      //
      // The floor is now solved by the SAME function poseWalk calls, off the same
      // four quantities read back from the rig — the pivot after the sway, that
      // leg's own roll after the counter-rotation, and the pelvis roll the pose
      // actually left behind. At c = 0 and dz = 0 every argument is identical to
      // the ones poseWalk used, `kk` is 1, and footPose is a pure function of
      // them, so a body in no pose at all gets the same numbers it always did.
      if (c > 0.002 || dz || r.crouched) {
        const kk = clamp(1 - c / r.hipY, 0.70, 1.05);
        const floorY = _G.drop - r.hipY + c;
        const hz = r.hips.rotation.z;
        const fl = pinRolled(floorY, r.hipY, r.legL.position.x, r.legL.rotation.z, hz);
        const fr = pinRolled(floorY, r.hipY, r.legR.position.x, r.legR.rotation.z, hz);
        footPose(r.footL, _G.kneeL * kk, _G.ankL, _G.thL, fl + _G.clearL);
        footPose(r.footR, _G.kneeR * kk, _G.ankR, _G.thR, fr + _G.clearR);
        r.crouched = c > 0.002 || !!dz;
      }
    }
  }

  // =========================================================================
  // ROUND 9 — THE CHILD. A FOLLOW CONTROLLER, AND NOTHING ELSE.
  // =========================================================================
  // Strictly downstream: it reads s.position, s.speed, s.heading and s.hasCart,
  // and NOTHING in this file reads it back. No collider, no nav query, no entry
  // in `shoppers`, no draw off rnd(). That is what lets a whole new class of
  // body be added to a tuned simulation with a bench that comes back
  // byte-identical, and it is worth the discipline: the alternative — a
  // fifteenth agent who happens to be a metre tall — would have had to be given
  // a position in the guilt lottery and a place in the separation constraint,
  // and every number in this file's header would have moved.
  //
  // THREE THINGS A CHILD DOES IN A SUPERMARKET, and they are chosen per body at
  // construction, never re-rolled:
  //   seat    rides in the cart's child seat. Parented to the cart object in
  //           makeShopper, so it needs no follow at all — including the moment
  //           a bolting man abandons the cart with it still in there, which is
  //           the single most upsetting frame this game can produce and is
  //           reached by removing code rather than by adding any.
  //   walk    walks a pace or two off the parent's flank, weaving, because
  //           children do not walk in straight lines. Cadence is roughly double
  //           an adult's at the same ground speed, which is the half of "child"
  //           that survives to CCTV scale after the shape is gone. And every so
  //           often — `stopEvery`, 7 s to 46 s — it stops dead in front of
  //           something for two or three seconds and then has to run to catch
  //           up. Every parent in the world recognises it, and mechanically it
  //           is the only body in this store whose distance from its group
  //           varies by four metres.
  //
  // The wander is a sine on a per-child frequency, not a random walk, for the
  // usual reason: a random walk would need a draw per frame per child and would
  // put this file's stream on the number of children in the building.
  // ---- ROUND 10: THE KIDS WALK THROUGH THE SHELVES ------------------------
  // Client, watching it: "I'm watching the kids run around, and they run
  // directly through some things at times."
  //
  // He is right, and round 9 wrote down the cause itself: a child is furniture
  // that follows — "not in `shoppers`, no collider, no nav" — and that trade is
  // what bought a whole new class of body on a byte-identical bench. The trade
  // was correct. What was wrong was reading "no collider" as "no collision":
  // the reason a child must not be an AGENT is that agents consume rng draws,
  // vote in the separation constraint and move every chase number in this file.
  // NONE OF THAT IS TRUE OF A GEOMETRY QUERY. solids.resolve() is a pure
  // push-a-circle-out-of-a-box-grid — no rnd(), no shopper state, no nav field,
  // no allocation — so a child can be stopped by a shelf without acquiring a
  // single one of the properties that made it dangerous to add.
  //
  // WHAT IT IS AND WHAT IT IS NOT. It is a POSITION CLAMP applied after the
  // follow spring has already decided where the child wants to be, plus the
  // one line that stops a clamp from looking like a clamp: the velocity
  // component INTO the surface is removed, so a kid cutting a corner at a
  // gondola end slides along the shelf face and keeps going instead of grinding
  // on it at a fraction of speed and then teleporting free. It is NOT pathing.
  // A child that walks into the end of an aisle still walks into the end of an
  // aisle; it just does not go through it any more, which is the whole of what
  // was asked for.
  //
  // THE COST, and it is the argument that this is free rather than the claim:
  //   - `_kp` is a module-level scratch object, so a clamp allocates nothing;
  //   - one resolve() per WALKING child per frame, at most 4 of them (seated
  //     children are parented to the cart and are the cart's problem);
  //   - resolve() reads a 3x3 cell neighbourhood of a 3 m uniform grid, which
  //     over the store's 74 colliders is 0-4 boxes tested;
  //   - nothing reads k.x/k.z back. The child is still strictly downstream.
  // The bench is byte-identical on all four policies; the hashes are in the
  // round-10 report and the check that proves it is that this function cannot
  // reach the rng at all.
  //
  // AND THE ONE THING THAT WOULD HAVE BROKEN IT. The obvious alternative was to
  // clamp the child's TARGET — solve the flank point out of the shelf before
  // the spring chases it. That is worse in the only way that matters here: the
  // target is derived from the parent's heading, so a target clamp would make
  // the child's position a function of a solved-against-geometry query taken at
  // the PARENT's pose, and the day somebody makes carts push shoppers off the
  // centreline the two would be coupled. Clamping the child's own position
  // leaves the coupling exactly where round 9 left it: one way, downstream.
  const _kp = { x: 0, z: 0 };
  function kidClamp(k) {
    if (!K.kidCollide) return;
    _kp.x = k.x; _kp.z = k.z;
    solids.resolve(_kp, KID_R);
    const px = _kp.x - k.x, pz = _kp.z - k.z;
    if (px === 0 && pz === 0) return;
    k.x = _kp.x; k.z = _kp.z;
    // Slide, do not stick. `n` is the direction the box pushed him, so the
    // velocity heading INTO it is the negative projection on n — take exactly
    // that much out and what is left is the tangential part he keeps walking on.
    const nl = Math.hypot(px, pz);
    if (nl < 1e-6) return;
    const nx = px / nl, nz = pz / nl;
    const into = k.vx * nx + k.vz * nz;
    if (into < 0) { k.vx -= nx * into; k.vz -= nz * into; }
  }

  function animateChild(s, dt) {
    const k = s.rig.kid;
    const vis = s.mesh.visible;
    if (k.spec.mode === 'seat') {
      // Riding. The cart carries it, so all that is left is what a small person
      // does while being pushed round a shop: sway with the cart, kick, and
      // watch whoever is pushing. When nobody is — the cart has been dropped —
      // the head goes round to look for them.
      k.root.visible = vis && s.cart.visible;
      if (!k.root.visible) return;
      k.t += dt;
      const sway = Math.sin(k.t * 1.7 + k.spec.phase);
      k.hips.rotation.z = sway * 0.055;
      k.hips.rotation.y = Math.sin(k.t * 0.7 + k.spec.phase) * 0.20;
      const kick = Math.sin(k.t * 2.4 + k.spec.phase);
      k.legL.rotation.x = -0.26 + kick * 0.22;
      k.legR.rotation.x = -0.22 - kick * 0.19;
      k.armL.rotation.x = -0.55 + sway * 0.18; k.armL.rotation.z = 0.30;
      k.armR.rotation.x = -0.52 - sway * 0.18; k.armR.rotation.z = -0.30;
      // The parent is behind the cart in cart-local -Z, i.e. straight ahead of a
      // child that was seated facing backwards. If the cart has been let go of,
      // he twists to find them.
      k.neck.rotation.y = s.hasCart ? Math.sin(k.t * 0.5) * 0.22 : 0.85;
      return;
    }
    k.root.visible = vis;
    if (!k.root.visible) return;
    k.t += dt;

    // Where the parent's hand would be: off one flank, a pace back down their
    // heading. `weave` is the child failing to hold that line.
    const hx = Math.sin(s.heading), hz = Math.cos(s.heading);
    const wob = Math.sin(k.t * k.spec.weaveHz * Math.PI * 2 + k.spec.phase) * k.spec.weave;
    const side = k.spec.side * 0.52 + wob;
    let tx = s.position.x - hx * k.spec.lagT * 0.55 + hz * side;
    let tz = s.position.z - hz * k.spec.lagT * 0.55 - hx * side;

    // The anchor. A duty cycle on the same clock everything else here runs on:
    // stopped for `stopFor` out of every `stopEvery`, which for these constants
    // is a kid planted in front of something for two or three seconds once every
    // eight or so. `stopT` is only kept so the catch-up run knows it is one.
    const cyc = k.t % k.spec.stopEvery;
    const planted = cyc < k.spec.stopFor;
    // First frame after a spawn or a respawn. The parent has been teleported and
    // the flank point is wherever that landed, which in a store this full is
    // sometimes inside a shelf run — so the placement gets the clamp too, or the
    // very first thing a new child does is stand in a gondola until the spring
    // walks it out.
    if (!k.started) { k.x = tx; k.z = tz; k.started = true; kidClamp(k); }

    if (planted) {
      k.vx *= Math.exp(-9 * dt); k.vz *= Math.exp(-9 * dt);
    } else {
      // Critically damped-ish spring at a child's top speed. The gain is high
      // enough that a kid trailing a walking parent holds station, and the cap
      // is low enough that a kid whose parent has just bolted for the door falls
      // behind — which is correct, and is also the only place this controller
      // ever gets tested at speed.
      const dx = tx - k.x, dz = tz - k.z;
      const d = Math.hypot(dx, dz);
      // A kid catching up RUNS. Below a metre it is a walk; past two and a half
      // it is a flat sprint, and everything between is the scurry.
      const want = clamp(d * 1.35, 0, 1) * lerp(1.05, 2.55, clamp((d - 0.8) / 1.8, 0, 1));
      const ux = d > 1e-3 ? dx / d : 0, uz = d > 1e-3 ? dz / d : 0;
      k.vx += (ux * want - k.vx) * clamp(dt * 6.5, 0, 1);
      k.vz += (uz * want - k.vz) * clamp(dt * 6.5, 0, 1);
    }
    k.x += k.vx * dt; k.z += k.vz * dt;
    kidClamp(k);
    const sp = Math.hypot(k.vx, k.vz);
    if (sp > 0.12) k.heading = Math.atan2(k.vx, k.vz);
    k.root.position.set(k.x, 0, k.z);
    k.root.rotation.y = k.heading;

    // ---- the gait. Same shape as the adult's and deliberately so — one
    // vocabulary, three rigs — with the numbers a child's proportions demand: a
    // 0.50 m leg against an adult's 0.86, so at the same ground speed the
    // cadence is nearly double, and a much bigger arm swing because nobody has
    // told them not to.
    k.phase += (sp / (0.88 * k.spec.stride * k.root.scale.x)) * dt * Math.PI * 2 + dt * 0.9;
    const sw = Math.sin(k.phase);
    const amp = clamp(sp * 0.24 * k.spec.amp, 0.03, 0.85);
    const g = clamp(sp / 1.2, 0, 1);
    k.legL.rotation.x = sw * amp; k.legR.rotation.x = -sw * amp;
    k.armL.rotation.x = -sw * amp * 0.95 * k.spec.swing;
    k.armR.rotation.x = sw * amp * 0.95 * k.spec.swing;
    k.armL.rotation.z = 0.13 + g * 0.10; k.armR.rotation.z = -0.13 - g * 0.10;
    k.hips.rotation.y = sw * 0.075 * g;
    k.hips.rotation.z = sw * 0.045 * g;
    k.hips.position.y = k.hipY + (Math.abs(sw) - 0.5) * 0.030 * g;
    k.hips.rotation.x = g * 0.10;                       // kids lean into a run
    // Planted, the whole body says so: turned to face whatever stopped them,
    // both arms down, and no interest whatever in where the parent went.
    if (planted) {
      k.neck.rotation.x = 0.30;
      k.neck.rotation.y = k.spec.side * 0.55;
      k.armL.rotation.x = -0.18; k.armR.rotation.x = -0.16;
      k.hips.rotation.x = 0.04;
    } else {
      k.neck.rotation.x = -0.06 + g * 0.10;
      k.neck.rotation.y = Math.sin(k.t * 0.8 + k.spec.phase) * 0.34;
    }
  }

  // =========================================================================
  // ROUND 9 — THE IDLE POOL. SEVEN WAYS TO STAND STILL IN A SUPERMARKET.
  // =========================================================================
  // Which one a person is doing is `floor(rig.idleT / hold) % idles.length` off
  // a clock that started at construction and has never been reset by anything.
  // That is the whole anti-oracle argument for this feature and it is worth
  // stating as a property rather than as an intention:
  //
  //   the idle a body is in at time t is a function of (that body's constants,
  //   t) and of NOTHING ELSE. Not its state, not its history, not whether it
  //   has stolen anything, not whether the PA has shouted at it.
  //
  // So there is no experiment a player can run that recovers guilt from an
  // idle, because guilt is not an input. Compare the alternative I did not
  // ship: restart the cycle on entry to a stopped state. That version is
  // seductive — a person who stops "starts" idling, which is what people do —
  // and it leaks, because a thief stops for reasons an innocent does not, so
  // his FIRST idle after each stop would be drawn from a different distribution
  // over the population than an innocent's. Nobody would ever have written that
  // down as a tell. It would just have been learnable.
  //
  // `idleMix` fades the pose in over ~180 ms and every other branch in
  // animateShopper fades it back out at the same rate, so a man who folds his
  // arms and then digs his phone out does not snap between them. One rate, for
  // everybody, in every direction.
  function idlePose(s, r, dt, ed, bolting) {
    const P = r.pose;
    // Idles are for a body that has actually stopped. The 0.35 m/s gate is
    // hysteresis-free on purpose: `idleMix` IS the hysteresis, and it means a
    // man drifting to a halt eases into a stance over about a fifth of a second
    // instead of snapping into it the frame his speed crosses a line.
    const want = (!bolting && s.speed < 0.35 && !s.bolted) ? 1 : 0;
    r.idleMix = want ? Math.min(1, r.idleMix + dt * 5.5)
                     : Math.max(0, r.idleMix - dt * 5.5);
    if (r.idleMix <= 0.002) return;
    const m = r.idleMix;
    const list = P.idles;
    const k = list[Math.floor(r.idleT / P.idleHold) % list.length];
    // One slow oscillator per idle, so nothing in this function is a statue.
    // `fidget` is per person and it is the difference between somebody standing
    // patiently and somebody who cannot stand still.
    const w = Math.sin(r.idleT * 0.9) * P.fidget;
    const w2 = Math.sin(r.idleT * 0.41 + s.id) * P.fidget;
    const hs = P.hipSide;
    // Every branch below writes through `mix`, which is a lerp from whatever the
    // walk/cart code left in the channel toward the idle value. That is what
    // makes an idle compose with a cart hold instead of fighting it: a man
    // leaning on his cart keeps his hands on the bar and still shifts his hip.
    const mix = (cur, to) => cur + (to - cur) * m;
    let aRx = r.armR.rotation.x, aRz = r.armR.rotation.z;
    let aLx = r.armL.rotation.x, aLz = r.armL.rotation.z;
    let chX = r.chest.rotation.x, chZ = 0, nkX = r.neck.rotation.x, nkY = r.neck.rotation.y;
    let hipZ = 0, hipY = 0;
    if (k === 0) {
      // WEIGHT ON ONE HIP. The one that reads best at monitor scale, because it
      // is the only idle here that makes the body ASYMMETRIC below the waist:
      // the hip juts, the whole torso counter-leans, and the outline stops
      // being a vertical bar. One hand rests on the jutting hip.
      hipZ = hs * (0.085 + w2 * 0.012); hipY = -0.020;
      chZ = -hs * 0.10;
      if (hs > 0) { aLx = -0.62; aLz = 0.52; aRx = -0.14 + w * 0.03; aRz = -0.13; }
      else { aRx = -0.62; aRz = -0.52; aLx = -0.14 + w * 0.03; aLz = 0.13; }
      nkY = s.look + w2 * 0.20;
      chX = r.stoop + 0.01;
    } else if (k === 1) {
      // ARMS FOLDED. At 214x120 this is the biggest single change in this
      // function: it closes the two gaps between arm and torso, so a light
      // torso with two dark slots either side becomes one solid light block
      // with a dark bar across it. That is a different SHAPE, not a different
      // detail, which is the only kind of thing that survives down there.
      aRx = -1.36 + w * 0.02; aRz = 0.62;
      aLx = -1.32 - w * 0.02; aLz = -0.58;
      chX = r.stoop + 0.05; hipZ = hs * 0.035;
      nkY = s.look + w2 * 0.16;
    } else if (k === 2) {
      // A PHONE. Deliberately WITHOUT a prop: `s.held` belongs to the clip
      // system and putting a second object in that hand from outside it would
      // give the tracker an object appearing at chest height that decoy.js did
      // not schedule and cannot account for. Hands together at chest height and
      // the chin down is the whole read anyway, and it is the same silhouette a
      // man checking a list makes.
      aRx = -1.58 + w * 0.04; aRz = 0.34;
      aLx = -1.52 - w * 0.04; aLz = -0.26;
      chX = r.stoop + 0.07; nkX = 0.42; hipZ = hs * 0.030;
    } else if (k === 3) {
      // HANDS IN POCKETS, shoulders up round the ears. Narrow, hunched and
      // still — the opposite of the folded-arm block, and the only idle in the
      // list that makes a person look SMALLER.
      aRx = -0.30; aRz = -0.30 - P.splay;
      aLx = -0.28; aLz = 0.30 + P.splay;
      chX = r.stoop + 0.06; hipZ = hs * 0.045 * (1 + w2 * 0.3);
      nkX = 0.10; nkY = s.look + w * 0.22;
    } else if (k === 4 && s.hasCart) {
      // LEANING ON THE CART. Forearms down on the bar, hips back off it, the
      // whole weight through the arms. This is the pose of somebody waiting for
      // the person they came with, and it is the only one that changes where
      // the CART is as well as where the body is — which matters, because a
      // cart is a metre of bright chrome and the eye goes to it.
      aRx = -1.30 + w * 0.02; aRz = -0.30;
      aLx = -1.28 - w * 0.02; aLz = 0.28;
      chX = r.stoop + 0.20; hipY = -0.055; nkX = 0.06;
      nkY = s.look + w2 * 0.26;
    } else if (k === 5) {
      // ONE HAND ON THE SHELF. The standing version of browse style 1, and it
      // is here as well as there because a person who has stopped next to a
      // gondola puts a hand on it whatever the state machine thinks he is
      // doing. Braced arm out to the side, weight on the far foot.
      aRx = -1.20 + w * 0.02; aRz = -0.66;
      aLx = -0.24; aLz = 0.16;
      hipZ = -hs * 0.070; hipY = -0.016; chZ = hs * 0.055;
      chX = r.stoop + 0.06; nkY = s.look - 0.34;
    } else {
      // ROCKING FOOT TO FOOT. The default and the most common, because it is
      // what most people actually do: nothing, slowly, in two directions. The
      // hips swap sides on a 0.55 Hz oscillator, so unlike every other idle
      // here this one is never in the same place twice.
      const rock = Math.sin(r.idleT * 0.55 * P.fidget + s.id);
      hipZ = rock * 0.055; hipY = -Math.abs(rock) * 0.012;
      chZ = -rock * 0.038;
      aRx = -0.16 + rock * 0.06; aRz = -P.splay;
      aLx = -0.14 - rock * 0.06; aLz = P.splay;
      chX = r.stoop + 0.02;
      nkY = s.look + rock * 0.24;
    }
    r.armR.rotation.x = mix(r.armR.rotation.x, aRx);
    r.armR.rotation.z = mix(r.armR.rotation.z, aRz);
    r.armL.rotation.x = mix(r.armL.rotation.x, aLx);
    r.armL.rotation.z = mix(r.armL.rotation.z, aLz);
    r.chest.rotation.x = mix(r.chest.rotation.x, chX);
    r.leanZ = chZ * m;
    r.neck.rotation.x = mix(r.neck.rotation.x, nkX);
    r.neck.rotation.y = mix(r.neck.rotation.y, nkY);
    r.hips.rotation.z += hipZ * m;
    r.hips.position.y += hipY * m;
  }

  // ---- powerups ------------------------------------------------------------
  function updatePowerups(dt) {
    const u = cop.userData;
    for (const p of powerups) {
      if (!p.live) {
        p.respawn -= dt;
        if (p.respawn <= 0) { p.live = true; p.mesh.visible = true; }
        continue;
      }
      p.item.rotation.y += dt * 1.05;
      p.item.position.y = 1.06 + Math.sin(performance.now() * 0.0028 + p.x) * 0.032;
      p.ring.material.opacity = 0.20 + 0.10 * Math.sin(performance.now() * 0.0045 + p.z);
      // You have to REACH for it. Being inside the radius is not enough: the
      // can is on a shelf, off to the side of the lane, and a cop sprinting past
      // parallel to the shelf face is not grabbing anything. Without this the
      // chase kept handing him free boosts — the aim point of a pursuit drifts
      // toward whichever side the thief is running, and the bench measured the
      // supposedly-unpowered cop boosted 11% of the chase off pure geometry.
      // Steer into the shelf and it is yours; run past it and it is not.
      const dx = p.x - cop.position.x, dz = p.z - cop.position.z;
      const d = Math.hypot(dx, dz);
      if (d >= K.pickupRadius + BODY_R) continue;
      // The test is LATERAL, not radial. Closing on the can while running down
      // the aisle at it is just... running down the aisle; the whole chase does
      // that. What costs you something is leaving your line and going at the
      // shelf face, so that is what the grab asks for.
      if (u.speed > 0.6 && (u.vel.x * p.nx + u.vel.z * p.nz) < K.pickupReach) continue;
      p.live = false; p.mesh.visible = false; p.respawn = 16;
      u.boost = K.boostTime; u.stamina = K.staminaMax; u.gassed = false;
    }
  }

  // ---- catch / telemetry ---------------------------------------------------
  //
  // A committed thief coming the other way is not caught by proximity, he is
  // caught by BEING IN FRONT OF HIM. Round 2's grab was a bare radius test, and
  // in a 4.0 m aisle a bare radius test cannot be beaten: the lane gives 1.58 m
  // of half-width, the grab reaches 1.15 m of it, and a cop with any lateral
  // authority at all covers the 0.43 m of daylight faster than a running body
  // can get to it. Footwork does not beat footwork in a corridor.
  //
  // So the barge. He picks a shoulder (squeezePast) and he is going through it.
  //
  // ROUND 4 — this asked the wrong question and so it never fired. It used to
  // read the cop's offset from the lane centreline AT THE MOMENT HE COMMITTED.
  // A pursuit bot steers at the thief, the thief is near the middle of the lane
  // when he decides, therefore the cop was near the middle too, therefore the
  // cop always "covered" him: 114 of 200 chases committed to a shoulder, 7
  // actually got through, and all 7 of those were caught anyway. Nine tuning
  // constants for a mechanic that changed nothing.
  //
  // What decides a shoulder in real life is not where you were standing a
  // second ago, it is whether you are in front of THAT shoulder when he
  // arrives. So: measure the separation ACROSS his line of run, at contact. If
  // you are more than grabSlack off it, he is past you and it costs him only
  // the stumble. If the cop is behind him it is not a barge at all, it is a
  // chase-down, and those always grab.
  //
  // The arithmetic that makes it a duel and not a coin flip: the juke moves him
  // ~1.5 m sideways over the last 4.4 m of closing, which at ten metres a second
  // of closing speed is a lateral rate near 3.5 m/s. A 5 m/s cop with copGrip
  // 0.78 has about 7 m/s^2 of lateral authority, so mirroring it from a standing
  // start takes him half a second he does not have. From the MIDDLE he only has
  // to find 1.1 m and he makes it; from one side he needs 2.6 m and he does not.
  // That is the whole tactical content of a corked aisle: HOLD THE MIDDLE. It is
  // readable, it is learnable, and it does not care how fast you can twitch.
  function copCovers(s) {
    const m = Math.hypot(s.vel.x, s.vel.z);
    if (m < 1.2) return true;                       // not running past anybody
    const fx = s.vel.x / m, fz = s.vel.z / m;
    const dx = cop.position.x - s.position.x, dz = cop.position.z - s.position.z;
    if (dx * fx + dz * fz < -0.10) return true;     // cop is astern: a chase-down grab
    // Measured ACROSS THE LANE, at contact. Inside an aisle the lane axis is X;
    // out on a cross-aisle it is Z. He locked his shoulder in jukeHold seconds
    // ago and he cannot change it — 0.85 s, and 1.5 m of lane to cover, which is
    // 2.1 m/s^2 against the 7 m/s^2 of lateral authority a sprinting cop has. So
    // it is entirely coverable BY A COP WHO READ THE COMMIT, and not remotely
    // coverable by one still steering at where the man was a moment ago. That
    // asymmetry is the duel; the bench bot's 0.16 s of reaction lag is exactly
    // what decides it, which is the correct thing for it to turn on.
    const off = Math.abs(s.position.z) < HALF_LEN ? Math.abs(dx) : Math.abs(dz);
    return off < K.grabSlack;
  }
  function barge(s) {
    s.bargeN = (s.bargeN || 0) + 1;
    // What the cop had in the tank when he took it. Recorded for the bench.
    // NOTE it is not the discriminator I expected it to be — see the note on
    // bargeWinded/bargeFresh in bench(); what decides a barge is the wind the
    // contact TAKES, not the level he happened to be at.
    if (s.bargeStam == null) s.bargeStam = cop.userData.stamina / K.staminaMax;
    s.stumble = K.stumbleT;
    s.bargeT = K.bargeGrace;
    s.duckSide = s.duck; s.duck = 0; s.duckT = 0;
    // ROUND 4 — who actually pays. Round 3 charged the THIEF for getting past
    // (0.45 s at three quarters pace) and charged the cop a 22% velocity trim,
    // which is nothing: he was still inside grab range half a second later and
    // the bench duly measured 80 barges and 79 catches. Getting through a man
    // that has to MEAN something or it is not a mechanic, it is an animation.
    //
    // So it lands the other way round now, which is also the way it works: he is
    // running and you are not. He clips a body and loses a step; you take a
    // shoulder, most of your speed goes, and you are left facing the way he came
    // from with a stagger to shake off before you can go again. Roughly three
    // metres, which against a 26 m aisle is a chase instead of a formality.
    let dx = s.position.x - cop.position.x, dz = s.position.z - cop.position.z;
    const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
    cop.position.x -= dx * 0.34; cop.position.z -= dz * 0.34;
    cop.userData.vel.multiplyScalar(0.15);
    cop.userData.stagger = K.bargeStaggerD;
    // ...AND HIS WIND. Round 4's second pass: the knockback alone was worth two
    // metres, and a cop whose sprint is 64% faster than the thief's cruise
    // reclaims two metres in one second — which is why the first version of
    // this measured 30 barges and 30 catches and I nearly reported the mechanic
    // as fixed on the strength of it FIRING. Firing is not working.
    //
    // Half his tank is what makes it a tactic. Ablated: turn this one line off
    // and barged-and-still-caught goes 59% -> 81%, and the whole "he came at
    // the cop" branch goes 89% -> 96%. It is the single biggest thing standing
    // between that branch and a foregone conclusion.
    const cu = cop.userData;
    cu.stamina = Math.max(0, cu.stamina - K.bargeWind);
    if (cu.stamina <= 0.0001) cu.gassed = true;
    // And the other half of it, on his side: going through a man is an
    // adrenaline dump, and adrenaline is the only thing in this file that lets
    // him out-run a cop at all. It is a TOP-UP of the same finite tank, not a
    // refill — it decays under pressure like everything else, so it buys him
    // the break and not the rest of the chase.
    s.adren = Math.max(s.adren, K.bargeDump);
    // ...and he ends up THROUGH, which is the whole point and is the thing that
    // was missing. A 0.10 m nudge left him inside the separation constraint the
    // two bodies enforce on each other — the bench trace showed the pair welded
    // at 0.78 m for the entire half-second of grace and then a grab the instant
    // it expired, which is exactly the "33 barges, 32 still caught" the critic
    // measured and I could not explain. He is not squeezing past, he is running
    // through: put him a body's length down the lane on the shoulder he picked.
    const sp = Math.hypot(s.vel.x, s.vel.z) || 1;
    s.position.x += (s.vel.x / sp) * K.bargeThru + (s.duckSide || 0) * 0.22;
    s.position.z += (s.vel.z / sp) * K.bargeThru;
    solids.resolve(s.position, BODY_R);
  }
  function interactions(dt, api) {
    for (const s of shoppers) {
      if (s.escaped || s.caught || !s.guilty) continue;
      if (!s.bolted && s.state !== 'react') continue;
      if (s.bargeT > 0) { s.bargeT -= dt; continue; }
      const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
      if (d > T.catchRadius) continue;
      if (s.duck && !copCovers(s)) { barge(s); continue; }
      // ROUND 6 — YOU CANNOT GRAB A MAN YOU NEVER MADE. The gate is null in the
      // live game (the player is looking at the floor and picks his own body to
      // run at), and non-null in bench(), where the bot's information set has to
      // be modelled honestly or the one-exit misaim table measures an oracle.
      // See the `ident` block in bench().
      if (grabGate && !grabGate(s)) continue;
      s.caught = true; s.vel.set(0, 0, 0); s.state = 'caught';
      s.rig.armL.rotation.x = -2.5; s.rig.armR.rotation.x = -2.5;     // hands up
      api.onCatch && api.onCatch(s);
    }
  }

  function telemetry(api, dtLast) {
    if (!api.report) return;
    const u = cop.userData;
    let nearest = null, nd = Infinity, chase = null;
    for (const s of shoppers) {
      if (s.escaped || !s.mesh.visible) continue;
      const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
      if (d < nd) {
        nd = d;
        nearest = { id: s.id, dist: d, guilty: s.guilty, aisle: s.aisle, fleeing: s.state === 'bolt' };
      }
      if (s.state === 'bolt' && !s.caught) {
        // ROUND 4: metres to the door HE is going to, not to Door 1. With two
        // ways out, measuring everyone against one of them is a lie the HUD
        // then repeats. See exits / exitDistOf in the export block.
        const ex = exitOf(s.position.x, s.position.z);
        chase = {
          id: s.id, dist: d, exit: ex.i, exitLabel: ex.exit ? ex.exit.label : 'DOOR 1',
          thiefToExit: ex.dist,
          shoving: s.state === 'shove',
          // He has turned and gone for the rear cross-aisle. See updateShopper.
          viaBack: !!s.viaBack,
        };
      }
    }
    // ROUND 5 CONTRACT ADDITION (additive; a HUD that ignores it is unchanged).
    // The WIND bar is the game builder's, but the state machine behind it is
    // mine and it should not have to re-derive it from `stamina < eps`. Three
    // states and a countdown, which is exactly the READY / RECOVERING / WINDED
    // panel it asked for:
    //   winded     — gassed. You cannot sprint AT ALL and holding the key is
    //                actively worse than letting go (see updateCop). `windIn`
    //                is the seconds until you can go again, and it only ticks
    //                DOWN IF THE KEY IS UP — that is the whole lesson, and a
    //                countdown that stalls while you hold sprint teaches it
    //                faster than any tooltip. Infinity while it is held.
    //   recovering — off the key with something in the tank, refilling.
    //   ready      — full. Nothing to gain by waiting; go.
    // `burst` is the seconds of sprint currently in hand, which is what the
    // segments should count. `fatigue` is a lagging 0..1 that rises fast and
    // falls slow — a PULSE readout wants accumulated wear, not `1 - frac`
    // restated a second time in a different shape.
    const frac = u.stamina / K.staminaMax;
    const held = u.wantSprint ? K.regenHold : 1;
    const rate = K.staminaRegen * held;
    const need = u.gassed ? K.gassedRecover * K.staminaMax - u.stamina
                          : K.staminaMax - u.stamina;
    // `fatigue` is integrated in updateCop() now — it drives the cop's heave
    // animation, which has to run whether or not anything is reading the HUD.
    // Same number, same rise/fall rates, one owner.
    api.report({
      stamina: u.stamina, staminaMax: K.staminaMax, boost: u.boost,
      gassed: u.gassed, speed: u.speed, nearest, chase,
      wind: u.gassed ? 'winded' : frac > 0.995 ? 'ready' : 'recovering',
      windIn: need <= 0 ? 0 : rate > 0 ? need / rate : Infinity,
      burst: u.gassed ? 0 : u.stamina / K.staminaDrain,
      windFrac: frac, fatigue: u.fatigue,
      // Seconds of sprint a FULL tank buys, so the bar can size its segments
      // off the model instead of a hardcoded 3.1.
      burstMax: K.staminaMax / K.staminaDrain,
      refill: K.staminaMax / K.staminaRegen,
    });
  }

  // ---- ROUND 10: THE FRONT END ---------------------------------------------
  // Cashiers, a bagger, a service-desk clerk and the people they are serving.
  // The whole feature is in agents/frontend.js and the two things worth knowing
  // here are WHEN it is built and WHEN it is driven.
  //
  // BUILT LAZILY, ON THE FIRST TICK, AND NOT IN THIS CONSTRUCTOR. store.js
  // publishes `world.frontEnd` from buildStore, so at module-construction time
  // it usually exists — but "usually" is how the store-rebuild path in tick()
  // came to exist in the first place, and a front end built against a table
  // that was not there yet is nine invisible people. One `if` on the first
  // frame costs nothing and cannot be wrong.
  //
  // DRIVEN ONLY WHEN SOMETHING IS RENDERING. `api.report` is the existing
  // "a game is driving this, not a bench" signal — telemetry() has used it
  // since round 5 — and eleven rigs of pose maths per tick over a 270,000-tick
  // bench is a real cost for animation nobody is looking at. The bench result
  // is unaffected either way (nothing reads these bodies), but a bench that
  // takes 40% longer for no reason is a tax on every future round.
  let frontEnd = null;
  function frontTick(dt, api) {
    if (frontEnd === null) {
      frontEnd = makeFrontEnd(THREE, scene, F, world, { count: K.frontEndCount });
    }
    if (frontEnd.ok && api.report) frontEnd.update(dt);
  }

  // ---- main tick -----------------------------------------------------------
  function tick(dt, input, api) {
    if (!(dt > 0)) dt = 0;
    input = input || {};
    api = api || {};
    if (world.colliders && world.colliders.length !== solidCount) {
      solids = makeSolids(world); solidCount = world.colliders.length;
      nav = buildNav(); buildExits();
      fleeF = null; fleeBuf = null; fleeT = 0; fleeCx = fleeCz = 1e9;
      for (const s of shoppers) { s.aim = null; s.aimT = 0; s.path = []; }
      buildPowerups();
    }
    const frozen = !!api.frozen;
    if (!frozen && annCool > 0) annCool = Math.max(0, annCool - dt);
    updateCop(dt, input, frozen);
    if (!frozen) { updatePost(dt); updateFlee(dt); }
    updatePowerups(dt);
    for (const s of shoppers) updateShopper(s, dt, api, frozen);
    interactions(dt, api);
    frontTick(dt, api);
    telemetry(api, dt);
  }

  // =========================================================================
  // BENCH — the second bar, measured. Runs headless (no render), same update
  // path the game uses. Usage from the console:
  //   const C = window.__CHOP; C.pause();
  //   C.agents.benchReal(200)                 // the eight numbers that matter
  //   C.agents.bench({ n: 200, mode: 'none' })    // NO POWERUP EXISTS
  //   C.agents.bench({ n: 200, mode: 'pickup' })  // one is reachable, bot detours
  //   C.agents.bench({ n: 200, mode: 'boost' })   // already boosted
  //
  // ROUND 7 TRAP, and it cost me a re-run: BENCH DOES NOT PIN THE DIFFICULTY.
  // Every trial reseeds, so bench() is deterministic in the RNG — but DIFF.level
  // is global and game.js drives it off the shift clock every frame. Touch the
  // live game first (C.run, enterFloor, anything) and the ramp will have pulled
  // it down; I measured always-sprint at 38.0% instead of 53.0% that way and
  // briefly thought I had broken the lung. `bench` takes no difficulty option:
  // call `agents.setDifficulty(1)` before quoting anything against this file's
  // tables, or reload the page, which is what makes level 1 the default.
  //   C.agents.bench({ n: 200, mode: 'ignore' })  // cans on the shelves, bot
  //                                               // ignores them: boostFrac is
  //                                               // then the free-boost leak
  // `spawn` picks the starting geometry and DEFAULTS TO THE REAL ONE:
  //   'aisle'  postSpawn({kind:'aisle'})  — cop in the mouth of his aisle  <-- default
  //   'back'   postSpawn({kind:'back'})   — cop at the back of his aisle
  //   'front'  postSpawn({kind:'front'})  — cop out on the front cross-aisle
  //   'behind' round 2's bench: cop a suspicion-radius astern. The game does not
  //            produce this. Never report it as "the" catch rate.
  // Diagnostic options: { misaim:k } dispatches k aisles wrong, { crowd:false }
  // empties the store, { trace:k } returns a per-frame trace of trial k,
  // { lag:s } gives the pursuit bot s seconds of reaction delay (0 = oracle),
  // { gapMul } moves the 'behind' separation, { seed }.
  // =========================================================================
  const routeLen = (fx, fz) => toExit(fx, fz);

  // ROUND 5 — WHERE ARE THE CROSS-AISLES. The store builder cut a mid-store
  // cross-aisle this round and my nav grid picks it up for free (it is built
  // from the collider set, not from the floor plan), but the round-4 back-route
  // metric does NOT: it tested `z > HALF_LEN - 2.2`, i.e. "did he reach the
  // rear wall", and a thief who now cuts across the middle instead never trips
  // it. The first bench run after the cut landed showed outTheBack 0/40 with
  // the median chase up at 6.4 s, which is not the counterplay dying, it is the
  // instrument pointing at the wrong corridor. So: find the corridors from the
  // grid instead of naming them, and report which one he used.
  function crossBands() {
    const x0 = aisleX(0) - 1.0, x1 = aisleX(AISLE_COUNT - 1) + 1.0;
    const rows = [];
    for (let z = STORE.minZ + 0.5; z <= STORE.maxZ - 0.5; z += 0.25) {
      let free = 0, tot = 0;
      for (let x = x0; x <= x1; x += 0.35) { tot++; if (nav.free(x, z)) free++; }
      rows.push({ z, f: free / tot });
    }
    // A lane row sits at ~0.55 open (eight lanes of a shelved store); a
    // corridor row is open most of the way across. 0.72 splits them cleanly and
    // is not near either mode.
    const bands = [];
    let run = null;
    for (const r of rows) {
      if (r.f > 0.72) { if (!run) run = { z0: r.z, z1: r.z }; else run.z1 = r.z; }
      else if (run) { bands.push(run); run = null; }
    }
    if (run) bands.push(run);
    return bands.filter((b) => b.z1 - b.z0 >= 0.4).map((b) => ({
      z: (b.z0 + b.z1) / 2, half: (b.z1 - b.z0) / 2 + 0.75,
      // front / mid / back, by where it sits in the shelf run
      kind: (b.z0 + b.z1) / 2 < -HALF_LEN + 2.5 ? 'front'
          : (b.z0 + b.z1) / 2 > HALF_LEN - 2.5 ? 'back' : 'mid',
    }));
  }


  // ---- the bot ------------------------------------------------------------
  // ROUND 4. There is no such thing as "the" catch rate; there is a catch rate
  // FOR A GIVEN PLAYER. Round 3 shipped exactly one bot, a pure pursuit that
  // paths at wherever the man is standing this frame, and then published its
  // misaim table as if it described the game. An independent critic put its own
  // bot in the same geometry and beat mine by fifteen points at misaim 2. A
  // bench with one weak bot in it does not measure a game, it measures that bot.
  //
  // So: three, and every headline reports all three.
  //   chase  — round 3's. Steers at the thief. This is what the game's fiction
  //            invites you to do and it is the weakest of the three.
  //   cut    — a competent player. Works out where the man has to GO, floods
  //            its own route costs, and moves to the earliest point on his line
  //            it can reach before he does. Also manages its wind: it only
  //            spends sprint when the intercept is actually tight.
  //   camp   — the degenerate strategy the critic found. Ignores the dispatch,
  //            walks to a door and stands on it. THIS is the number that says
  //            whether the desk phase is worth playing: if camp beats cut, the
  //            aisle number is decoration.
  // `lag` gives the bot a reaction delay. At 0 it is an oracle that mirrors a
  // sidestep perfectly, which is a true statement about a tracking algorithm and
  // a false one about a man on a keyboard; the default is a human's.
  const _pathLen = (px, pz, pts) => {
    let L = 0, cx = px, cz = pz;
    for (const w of pts) { L += dist2d(cx, cz, w.x, w.z); cx = w.x; cz = w.z; }
    return L;
  };
  // The thief's route to the door he is actually going for, sampled every ~2 m
  // so the bot can ask "can I be at THAT spot before he is".
  function routePoints(fx, fz) {
    const e = exitOf(fx, fz);
    const raw = nav.path(fx, fz, e.exit.x, e.exit.z);
    const out = [];
    let cx = fx, cz = fz, run = 0;
    for (const w of raw) {
      const d = dist2d(cx, cz, w.x, w.z);
      const steps = Math.max(1, Math.round(d / 2.0));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        run += d / steps;
        out.push({ x: cx + (w.x - cx) * t, z: cz + (w.z - cz) * t, s: run });
      }
      cx = w.x; cz = w.z;
    }
    return out;
  }

  // ROUND 5 — the wind policies, hoisted so every bot can wear any of them.
  // Hysteresis is not decoration: without the `blown` latch a threshold policy
  // chatters on the boundary at ~60% duty and stops being an interval policy.
  function windPolicy(st, thief, gap, slack) {
    const u2 = cop.userData;
    // A live boost pins the tank at max, so sprinting through it is free and
    // NOT sprinting through it throws it away. This one line is worth 16 points
    // of `mode:'boost'` (58.7% -> see header): the rationing bot computes its
    // intercept slack off an inflated boosted top speed, decides the intercept
    // is comfortable, and WALKS — at copWalk x boostMul, 3.34 m/s — for the
    // whole 2.2 s of the drink. That is not a statement about energy drinks, it
    // is a bot that does not know a timer when it sees one. Nobody sips one.
    if (u2.boost > 0) return true;
    // =====================================================================
    // ROUND 9 (SECOND PASS) — THE INSTRUMENT WAS PRESSING A KEY INTO A WALL.
    //
    // Round 5 fixed the GAME so that a gassed man holding sprint does 2.04 m/s
    // against his own 2.35 m/s walk — "holding the key while gassed now does
    // nothing at all". It did not fix the BOT, and every policy below reaches
    // for the key through `urgent`, which fires at gap < 3.4 m — i.e. exactly
    // when the man is closest and the cop is most likely to have just emptied
    // the tank on him. `regenHold` is 0, so holding it while gassed does not
    // just fail to help, IT PREVENTS RECOVERY, FOREVER.
    //
    // The trace that found it (trial 29, mode:'boost', trace:29 in bench):
    //   t=3.02  boost expires, tank full, gap 1.26 m — he holds, correctly
    //   t=4.22  tank 0.03
    //   t=4.52  GASSED. gap 2.21 m, so `urgent` is still true, so he holds
    //   t=4.5 -> t=17.7   THIRTEEN SECONDS at a flat 2.04 m/s while the thief
    //                     cruises 3.08. Gap 2.21 -> 15.14 m. Final miss 15.1 m.
    // No player does that. One shift teaches you that the key is off when the
    // meter is empty; the bot had no way to learn it and has been holding it
    // since round 5 shipped the lung.
    //
    // WHO IT WAS LYING ABOUT, AND BY HOW MUCH. It costs the boosted cop far
    // more than the unboosted one, because a drink is what gets you INTO the
    // close-range duel where `urgent` latches on — which is why it read as
    // "the drink makes you lose by more". n=100, difficulty 1, `cut` off0:
    //                        none          drink in hand
    //   bot holds it (r5-r9) 75%  14.3 ft   74%  24.0 ft
    //   bot lets go          77%  10.9 ft   77%  10.7 ft
    // Two points on the unboosted rate and THIRTEEN FEET off the boosted miss.
    // The whole "a drink makes you lose by MORE" finding was this line.
    //
    // `conserve === false` is EXEMPT and must stay exempt: always-sprint is the
    // naive human who holds the key from the dispatch to the grab, and it is
    // the bottom rung of round 5's wind ladder. If it learned this it would
    // stop being the baseline the other four are measured against.
    // `legacyWind: true` on a bench call restores the old behaviour for every
    // policy, so every number in this file is recoverable on the old bot.
    //
    // THE RULE ITSELF IS NOT HERE. It is `keyUp()` below, applied ONCE to
    // whatever botInput finally decides, because windPolicy is not the only
    // place this bot reaches for the key: the "cannot head him off anywhere"
    // fallback, the doorPosted close-in and camp's inside-3.2 m override all
    // return a hardcoded `sprint: true` and never come through here. A copy of
    // the test in each of those is four places to get it wrong — see CLAUDE.md
    // on exactly one piece of code owning a derivation.
    const frac = u2.stamina / K.staminaMax;
    const urgent = gap < 3.4 || thief.state === 'shove';
    const reserve = st.reserve ?? 0.28;
    if (frac <= reserve + 1e-6) st.blown = true;
    else if (frac >= 0.97) st.blown = false;
    return st.conserve === false ? true
      : st.conserve === 'pulse' ? (urgent || !u2.gassed)
      : st.conserve === 'keep' ? (urgent || !st.blown)
      // ROUND 5 — THE DEFAULT MOVED, and that it had to is the finding.
      // 'loose' is round 4's default: sprint whenever the intercept is even
      // slightly loose. Against a 3.10 s tank that was near-optimal — 83.3% on
      // this store, dead level with holding the key down. Against a 1.40 s tank
      // THE SAME BEHAVIOUR measures 43.0% and spends half the chase winded,
      // because it empties the tank in the first two seconds and never gets it
      // back. Nothing about the bot's routing changed; the lungs under it did.
      // That is what "stamina became a decision" looks like from the inside: a
      // policy that used to be free is now worth 32 points.
      : st.conserve === 'loose' ? (slack < 1.1 || gap < 5.0 || thief.state === 'shove')
      // ...so the competent default IS rationing now. This is also the round-4
      // header's own description of the `cut` bot ("only spends sprint when the
      // intercept is actually tight") finally matching the code under it.
      : (urgent || slack < 0.35);
  }

  // ROUND 9 (SECOND PASS) — the one place the bot's finger comes off the key.
  // See the long note in windPolicy for the trace and the price. Applied to
  // EVERY branch's decision, in botInput, exactly once.
  const keyUp = (st, want) =>
    want && !(cop.userData.gassed && st.conserve !== false && !st.legacyWind);

  function botGoal(thief, st, dt, tx, tz) {
    const u = cop.userData;
    if (st.bot === 'chase') {
      // ROUND 5 — the naive bot holds the key, which is what naive MEANS now
      // that holding it is no longer free. It still honours an explicit
      // `conserve`, so the ladder can be sliced into route skill and wind
      // skill instead of confounding the two.
      // No intercept estimate exists for a pure pursuit — it steers at the man,
      // it never asks when it could be somewhere. So `slack` is infinite and
      // the slack-based policies collapse; only the tank-based ones ('pulse',
      // 'keep') say anything about this bot, which is itself the point: you
      // cannot ration against a plan you do not have.
      const g = dist2d(cop.position.x, cop.position.z, tx, tz);
      return { x: tx, z: tz, sprint: windPolicy(st, thief, g, Infinity) };
    }

    // One Dijkstra out of the cop, a few times a second: exact route cost from
    // where he is standing to every cell in the building. Cheaper than one A*
    // per candidate and it is what lets the bot compare arrivals honestly.
    st.cfT -= dt;
    if (!st.copF || st.cfT <= 0) {
      st.cfT = 0.30;
      if (!st.copBuf || st.copBuf.length !== nav.count) st.copBuf = new Float32Array(nav.count);
      st.copF = nav.field(cop.position.x, cop.position.z, { out: st.copBuf });
    }
    st.planT -= dt;
    if (st.planT <= 0) {
      st.planT = 0.20;
      st.route = routePoints(tx, tz);
    }
    const route = st.route || [];
    const tSpd = K.botCruise;   // ONE derivation of his cruise — see K.botCruise
    const cSpd = T.copRun * 0.86;
    // ROUND 5 — A BOOST IS A TIMER, NOT A TOP SPEED. This read
    // `copRun * (boost > 0 ? boostMul : 0.86)` — one flat speed for the whole
    // route on the strength of a drink with 2.2 s left in it — so a boosted
    // cop planned intercepts 65% further away than he could reach, committed to
    // them, and arrived after the drink had worn off. It cost 12 points of
    // `mode:'boost'` and it was invisible at round 4's boostTime of 4.0 s
    // because the timer outlasted most plans. Two-phase arrival instead: the
    // metres the boost actually buys, then the rest at a normal pace.
    const bSpd = T.copRun * T.boostMul;
    const dBoost = u.boost > 0 ? u.boost * bSpd : 0;
    const arrive = (d) => (d <= dBoost ? d / bSpd : u.boost + (d - dBoost) / cSpd);
    const doorI = exitOf(tx, tz).i;
    const door = EXITS[doorI] || EXITS[0];

    if (st.bot === 'camp') {
      // Stands on a door. Switches only once the man has clearly committed to
      // the other one — that is what a camper actually does, and pretending he
      // never switches would flatter the pursuing bot.
      if (st.campI == null) st.campI = clamp(st.campFix != null ? st.campFix : doorI, 0, EXITS.length - 1);
      if (st.campFix == null && doorI !== st.campI && exitFs[st.campI] && exitFs[doorI]) {
        const mine = nav.at(exitFs[st.campI], tx, tz);
        const his = nav.at(exitFs[doorI], tx, tz);
        if (mine - his > 5.0) st.campI = doorI;
      }
      const e = EXITS[st.campI] || EXITS[0];
      const near = dist2d(cop.position.x, cop.position.z, e.x, e.z) < 1.4;
      // Once he is inside grabbing range, stop being furniture.
      const gap = dist2d(cop.position.x, cop.position.z, tx, tz);
      if (gap < 3.2) return { x: tx, z: tz, sprint: true };
      return { x: e.x, z: e.z, sprint: !near };
    }

    // ---- cut: the earliest point on his line I can reach before he does -----
    let best = null;
    const rTot = route.length ? route[route.length - 1].s : 0;
    for (const w of route) {
      const tT = w.s / tSpd;
      const cD = nav.at(st.copF, w.x, w.z);
      if (!isFinite(cD)) continue;
      const cT = arrive(cD);
      if (cT <= tT - 0.18) { best = { w, cT, tT }; break; }   // route is ordered: first = earliest
    }
    if (!best) {
      // Cannot head him off anywhere. Then the door is the last place he has to
      // be, so go and stand on it — this is exactly why camping works at all,
      // and a bot that would not do it is not a competent player.
      //
      // ROUND 6 — WITH ONE EXIT THAT IS ONLY TRUE AFTER HE RUNS. A man who is
      // still WALKING out will not walk into a uniform on the only door: he
      // turns back into the aisles, waits you out, and ditches the goods in a
      // shelf after dumpT (see the drift case in updateShopper). So the
      // fallback that was correct with two doors is now a losing line, and a
      // competent player learns that in one shift. Before the bolt: go and find
      // him. After it: the door is still the last place he has to be.
      // Measured, n=120, one door, this build: leaving the old fallback in
      // costs the `cut` bot 12 points, all of them to `ditched` trials.
      // ...and the gate is only right for a ONE-EXIT store. With two doors,
      // standing on one was never a losing line — the man simply takes the
      // other one and you have lost nothing by waiting — so under useDoors(2)
      // this bot must behave exactly as it did in round 5 or the one-door
      // ablation is measuring a bot change as if it were a design change.
      if (thief.bolted || EXITS.length > 1) {
        const cD = nav.at(st.copF, door.x, door.z);
        const tT = rTot / tSpd, cT = arrive(cD);
        if (isFinite(cD) && cT < tT + 1.2) return { x: door.x, z: door.z, sprint: true };
      }
      return { x: tx, z: tz, sprint: true };
    }
    // ROUND 6 — AND HE DOES NOT STAND STILL ON THE ONLY DOOR EITHER. The
    // intercept the search returns is often the door itself, which is correct
    // arithmetic and, since this round, a losing line: a subject who has not
    // bolted yet will not walk into a parked uniform, he turns back into the
    // aisles and ditches the goods. So the moment this bot's own loitering has
    // made him POSTED and the man is still walking, it stops waiting and closes
    // on him. That is one shift's worth of learning for a person and one line
    // here; without it the competent bot measures 60% instead of 74%, and all
    // 14 of those points are trials that end with the item back on a shelf.
    if (doorPosted() && !thief.bolted) return { x: tx, z: tz, sprint: true };

    // Wind management. Sprinting to arrive four seconds early buys nothing and
    // costs you the legs you need at the door; spend it when the intercept is
    // tight, or when he is close enough to grab.
    const slack = best.tT - best.cT;
    const gap = dist2d(cop.position.x, cop.position.z, tx, tz);
    // ROUND 5 — five wind policies, because "does stamina management pay?" is
    // the headline this round and it has to be a measurement between named
    // strategies, not an assertion. Every one of them is a thing a person
    // actually does with a sprint key. All override to full sprint inside
    // grabbing range or when he is on the push-bar — nobody paces themselves
    // through the last two metres.
    //   false     ALWAYS. Hold the key from the dispatch to the grab. The naive
    //             human, and the policy that was strictly dominant for four
    //             rounds.
    //   'pulse'   INTERVALS, run into the ground. Sprint until the tank is
    //             empty, let go, go again the moment you are allowed. Maximum
    //             sprint fraction; pays the WINDED crawl every single cycle.
    //   'keep'    INTERVALS WITH A RESERVE. Same rhythm, but let go at
    //             `reserve` instead of at zero, so you never go winded and you
    //             always have a burst in hand for a shoulder or a door. This is
    //             the policy the design is meant to reward.
    //   'ration'  WALK UNTIL IT IS TIGHT. Spend nothing until the intercept
    //             actually needs it. Arrives full, which is the only thing that
    //             survives a shoulder. THIS IS THE DEFAULT NOW — see below.
    //   'loose'   round 4's default, kept as the ablation.
    // Measured, n=150 unless marked, same routing, right aisle, no powerup:
    //   always 46.0% (n=250) · loose 47.6% (n=250) · pulse 63.3% ·
    //   keep 70.0% · ration 74.7%
    // Round 3 answered this question with a flag that moved the sprint fraction
    // from 0.54 to 0.57 and reported a wash — a true statement about the flag
    // and no statement at all about the game. These are five different players.
    return { x: best.w.x, z: best.w.z, sprint: windPolicy(st, thief, gap, slack) };
  }

  function botInput(thief, mode, st, dt) {
    const u = cop.userData;
    if (u.boost > 0) st.gotBoost = true;
    const lag = st.lag || 0;
    if (lag > 0) {
      st.hist.push(thief.position.x, thief.position.z);
      const keep = Math.max(2, Math.round(lag / dt) * 2 + 2);
      while (st.hist.length > keep) st.hist.splice(0, 2);
    }
    let tx = lag > 0 ? st.hist[0] : thief.position.x;
    let tz = lag > 0 ? st.hist[1] : thief.position.z;
    // `blind` is what finally makes the misaim table mean anything. An oracle
    // bot knows which door the man prefers before he does, so it cuts the right
    // corner from the wrong aisle and being dispatched two aisles out costs it
    // almost nothing — which is exactly how round 3 came to publish a misaim
    // table that flattered itself. A blind bot only knows what the desk told it
    // (an aisle number) plus whatever it can currently SEE down a lane. Being
    // sent to the wrong aisle then costs what it should: you are cutting off a
    // route he is not on.
    if (st.blind) {
      if (nav.clearSeg(cop.position.x, cop.position.z, tx, tz)
          && dist2d(cop.position.x, cop.position.z, tx, tz) < 20) {
        st.seen.x = tx; st.seen.z = tz; st.seenT = 0; st.lost = null;
        // ROUND 6 — DID HE EVER ACTUALLY MAKE HIM. Seeing a shape down a lane
        // at nineteen metres is a sighting; knowing which coat to grab in a
        // doorway is a different and much closer thing. `identR` is most of an
        // aisle from its mouth, which is exactly the look the dispatch buys
        // you and exactly the look a man stood on the door never gets.
        if (dist2d(cop.position.x, cop.position.z, tx, tz) < K.identR) {
          st.madeT = (st.madeT || 0) + dt;
          if (st.madeT > K.identT) st.made = true;
        }
      } else {
        // ROUND 4 — the bot used to steer at where it last SAW him, which is
        // the one thing a competent player never does: a man who was heading
        // for the doors two seconds ago is not still standing there. Walk the
        // last sighting forward along the exit field at his cruise instead.
        // That is a dead-reckoning a person does in their head, it needs
        // nothing the desk did not tell them, and it is worth eleven points at
        // misaim 2 — which is most of the gap an outside critic opened up on
        // this bench by bringing its own bot.
        st.seenT += dt;
        // Only the competent bot does this. Steering at a stale sighting IS
        // what makes `chase` the naive baseline, and giving all three bots the
        // dead-reckoning collapsed the skill ladder into one rung: chase went
        // from 60% to 70% and its misaim table went flat with it, which made
        // the ladder useless for saying how much the dispatch is worth TO WHOM.
        // ROUND 6 — HE IS NOT COMING, AND THE BOT HAS TO LEARN THAT.
        // The dead-reckoning walks the last sighting DOWN THE EXIT FIELD, which
        // is right for a man who is leaving and exactly wrong for a man who has
        // seen a uniform parked on the only way out and turned back into the
        // aisles. Left alone it walks a phantom into the doorway and the cop
        // stands there waiting for it: measured, that is 60% for the competent
        // bot against 74% for the same bot that goes and looks, and all 14
        // points are trials ending with the item back on a shelf.
        // Latched, because without the latch it oscillates — stepping off the
        // door un-posts him, the phantom resumes walking at the door, and he
        // turns round again. Two seconds of a quiet doorway and he goes back to
        // the last place the man was actually seen; a sighting clears it.
        if (doorPosted() && st.seenT > 0.8) {
          st.dry = (st.dry || 0) + dt;
          if (st.dry > 2.0) st.sweep = true;
        } else if (st.seenT <= 0.8) { st.dry = 0; st.sweep = false; }

        if (st.bot !== 'cut' || st.sweep) { tx = st.seen.x; tz = st.seen.z; st.lost = null; }
        else {
          if (!st.lost) st.lost = { x: st.seen.x, z: st.seen.z };
          let step = K.botCruise * dt;          // same estimate the intercept uses
          while (step > 0.05) {
            const d = nav.steer(exitF, st.lost.x, st.lost.z, { look: 3.0 });
            if (!d) break;
            const m = Math.hypot(d.x, d.z) || 1;
            const h = Math.min(step, 0.34);
            st.lost.x += (d.x / m) * h; st.lost.z += (d.z / m) * h;
            step -= h;
          }
          tx = st.lost.x; tz = st.lost.z;
        }
      }
    }

    let g = botGoal(thief, st, dt, tx, tz);
    let gx = g.x, gz = g.z, sprint = keyUp(st, g.sprint !== false);

    if (mode === 'pickup' && !st.gotBoost) {
      // A competent player, not an oracle: every fifth of a second, look for the
      // powerup that costs the least ground to detour to, and only take it if
      // that detour is worth it. Committing to one can across the store at the
      // start of the chase is not how anybody plays, and it was costing the
      // bench 20 points of catch rate.
      st.puT -= dt;
      if (st.puT <= 0) {
        st.puT = 0.2;
        const direct = dist2d(cop.position.x, cop.position.z, gx, gz);
        let best = null, bestX = Infinity;
        for (const p of powerups) {
          if (!p.live) continue;
          const extra = dist2d(cop.position.x, cop.position.z, p.x, p.z)
                      + dist2d(p.x, p.z, gx, gz) - direct;
          if (extra < bestX) { bestX = extra; best = p; }
        }
        st.puTarget = best && bestX <= st.detour ? best : null;
      }
      const p = st.puTarget;
      // Aim past the can into the shelf face — you cannot take it off the shelf
      // by running parallel to it.
      if (p && p.live) { gx = p.x + p.nx * 0.55; gz = p.z + p.nz * 0.55; sprint = keyUp(st, true); }
    }

    // lead the target when we can see him and we are actually chasing him
    if (gx === tx && gz === tz && nav.clearSeg(cop.position.x, cop.position.z, gx, gz)) {
      gx += thief.vel.x * 0.28; gz += thief.vel.z * 0.28;
    }
    st.repath -= dt;
    if (st.repath <= 0 || !st.path.length
        || dist2d(st.goal.x, st.goal.z, gx, gz) > 1.2) {
      st.repath = 0.12; st.goal.x = gx; st.goal.z = gz;
      st.path = nav.path(cop.position.x, cop.position.z, gx, gz);
    }
    const holder = { position: cop.position, path: st.path };
    const dir = followPath(holder, 0);
    if (!dir) return { x: 0, z: 0, sprint };
    // main.js hands us input.z with the camera-inverted sign; undo it here.
    return { x: dir.x, z: FWD_SIGN * dir.z, sprint };
  }


  // NaN used to survive into the sort here, which silently scrambles the order
  // and prints a percentile that is not one. Drop them.
  const _q = (a, p) => {
    const b = a.filter(isFinite).sort((x, y) => x - y);
    if (!b.length) return NaN;
    return b[Math.min(b.length - 1, Math.floor(p * b.length))];
  };
  const _mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const _f2 = (v) => (isFinite(v) ? +v.toFixed(2) : null);

  function bench(opts = {}) {
    const n = opts.n ?? 200;
    const mode = opts.mode ?? 'none';       // 'none' | 'ignore' | 'pickup' | 'boost'
    const spawn = opts.spawn ?? 'aisle';    // 'aisle' | 'back' | 'front' | 'behind'
    // ROUND 6 — 30 -> 45 s. Not a difficulty change: it is the trial cap, and
    // this round added an ENDING THAT TAKES LONGER THAN A CHASE. A stand-off at
    // the door (he turns back, you wait, he ditches it) resolves around 25-30 s,
    // so at the old cap 8 of 40 camper trials timed out as `stalled` — an
    // unresolved trial, counted as a non-catch, which is a silent lie in the
    // direction of whatever you were hoping for. At 45 s every trial in every
    // scenario resolves and `stalled` is 0. Cost to the numbers it does not
    // affect: the competent bot on a plain chase goes 70.0 -> 75.0 because five
    // truncated trials became two catches and three escapes, and round 5's own
    // build measures the same 5 points higher on the same cap — so the
    // like-for-like comparison in this round's report is taken at 45 on BOTH.
    const dt = 1 / 60, maxT = opts.maxT ?? 45;
    const crowd = opts.crowd !== false;
    const gapMul = opts.gapMul ?? 0.96;
    const traceK = opts.trace == null ? -1 : (opts.trace | 0);
    const trace = [];
    // ROUND 6 — the ramp is a bench axis. Default 1 = round 5's difficulty, so
    // every headline in this file's header stays directly comparable and a run
    // that was taken at an easier setting says so on its own result object
    // (`res.difficulty`), the same way `res.override` announces a sweep.
    const saveLevel = DIFF.level;
    if (opts.difficulty != null) DIFF.level = clamp(+opts.difficulty || 0, 0, 1);
    const save = { pos: cop.position.clone(), ud: { ...cop.userData } };
    const R = [];                            // per-trial records
    const bands = crossBands();              // the corridors the store ACTUALLY has

    for (let k = 0; k < n; k++) {
      setSeed((opts.seed ?? 1234) + k * 7919);
      reset();
      // one thief, everyone else innocent, so the bench measures one chase
      const thief = shoppers[0];
      shoppers.forEach((s, i) => resetShopper(s, i === 0));
      if (!crowd) {
        shoppers.forEach((s, i) => {
          if (i === 0) return;
          s.escaped = true; s.mesh.visible = false; s.cart.visible = false;
        });
      }
      let ai = 0, txx = 0, tzz = 0;
      for (let a = 0; a < 40; a++) {
        ai = ri(0, AISLE_COUNT - 1);
        txx = aisleX(ai) + rr(-0.7, 0.7);
        tzz = rr(-HALF_LEN + 2, HALF_LEN - 2);
        if (nav.free(txx, tzz) && canReachExit(txx, tzz)) break;
      }
      thief.position.set(txx, 0, tzz);
      thief.stole = true; thief.state = 'drift'; thief.path = []; thief.repathIn = 0;
      thief.hasCart = false; thief.cart.visible = false;
      // Point him at the exit; he is strolling out with the steaks.
      const w0 = nav.steer(exitF, thief.position.x, thief.position.z, { look: 4 });
      let fx = w0 ? w0.x : EXIT.x - thief.position.x;
      let fz = w0 ? w0.z : EXIT.z - thief.position.z;
      const fm = Math.hypot(fx, fz) || 1; fx /= fm; fz /= fm;
      thief.vel.set(fx * K.thiefWalk, 0, fz * K.thiefWalk);

      // ---- where the COP starts. This is the whole methodology. -------------
      // The default is `aisle`, which reproduces game.js postSpawn({kind:'aisle'})
      // EXACTLY: the player reads the monitors, presses DISPATCH, and the cop is
      // teleported to the mouth of the subject's own aisle, standing between him
      // and Door 1, stopped, with full wind. That is the geometry every real
      // chase in this game starts from, so it is the geometry the headline
      // number has to come from. `behind` is the old round-2 spawn — a cop
      // 4.3 m astern of a thief already running — and it is kept only as a
      // secondary scenario, because the game never actually produces it.
      const cu = cop.userData;
      const tAisle = aisleOf(thief.position.x);
      const dAisle = clamp(tAisle + (opts.misaim ?? 0), 0, AISLE_COUNT - 1);
      let cx0, cz0, cvx = 0, cvz = 0;
      if (spawn === 'behind') {
        const jit = rr(-0.6, 0.6);
        const bx = -(fx * Math.cos(jit) - fz * Math.sin(jit));
        const bz = -(fx * Math.sin(jit) + fz * Math.cos(jit));
        const gap = T.suspicionRadius * gapMul;
        cx0 = thief.position.x + bx * gap; cz0 = thief.position.z + bz * gap;
        cvx = -bx * T.copRun * 0.7; cvz = -bz * T.copRun * 0.7;
      } else if (spawn === 'back') {
        cx0 = aisleX(dAisle); cz0 = HALF_LEN - 3.0;              // postSpawn 'back'
      } else if (spawn === 'front') {
        cx0 = Math.max(STORE.minX + 2, SERVICE_DESK.x - 3.0);    // postSpawn 'front'
        cz0 = FRONT_WALK_Z;
      } else {
        cx0 = aisleX(dAisle); cz0 = -HALF_LEN + 3.0;             // postSpawn 'aisle'
      }
      cop.position.set(cx0, 0, cz0);
      solids.resolve(cop.position, BODY_R);
      cu.vel.set(cvx, 0, cvz); cu.speed = Math.hypot(cvx, cvz);
      cu.stamina = K.staminaMax; cu.gassed = false; cu.skid = 0; cu.stagger = 0;
      cu.heading = Math.atan2(cvx, cvz);
      cu.boost = mode === 'boost' ? K.boostTime : 0;

      // 'none' means NO POWERUP AVAILABLE. It used to mean "the bot does not
      // detour for one", which is a different and much weaker claim — the round-2
      // report published 1.5% from a call that was actually still handing the cop
      // free cans. The documented call now does the obvious thing; `ignore`
      // is the old behaviour, kept because boostFrac under it is the measurement
      // that proves the shelf-lip reach gate still works.
      if (mode === 'none' || opts.nopu) {
        for (const p of powerups) { p.live = false; p.respawn = 1e6; p.mesh.visible = false; }
      }
      const st = {
        gotBoost: mode !== 'pickup', puTarget: null, puT: 0, detour: opts.detour ?? 7,
        path: [], repath: 0, goal: { x: 0, z: 0 },
        lag: opts.lag ?? 0.16, hist: [thief.position.x, thief.position.z],
        bot: opts.bot ?? 'cut', conserve: opts.conserve, campFix: opts.campFix,
        blown: false, reserve: opts.reserve, legacyWind: !!opts.legacyWind,
        copF: null, copBuf: null, cfT: 0, planT: 0, route: null, campI: null,
        // All the desk actually told him: an aisle number. Not a position in it.
        blind: opts.blind !== false, seen: { x: aisleX(dAisle), z: 0 }, seenT: 0,
        // ROUND 6 — has he had a close enough look to know WHICH BODY is his.
        made: false, madeT: 0,
      };

      // ---- THE IDENTITY MODEL. ------------------------------------------
      // Round 4 solved the door-camper by hiding the destination behind a
      // second door. With one door back — the client asked for it and he is
      // right — the destination is public again, and the ONE-DOOR TABLE
      // MEASURED BEFORE ANY OF THIS ROUND'S CHANGES says exactly what that
      // costs: cut 76.7 / 76.7 at off0 with two doors and one, but off1 goes
      // 34.7 -> 73.3 and the camper goes 23.3 -> 71.7. Being sent to the wrong
      // aisle stopped costing anything, because you did not need to find him:
      // you needed to be at the only place he had to be.
      //
      // What the old bench was quietly asserting is that a cop standing in a
      // doorway KNOWS WHICH OF THE PEOPLE COMING THROUGH IT IS THE SUBJECT. He
      // does not. That is the entire job of the aisle number once there is one
      // exit, and it was the one thing the instrument could not see, because
      // botInput() is handed `thief` directly and every other blindness in this
      // file is about POSITION.
      //
      // So: you cannot grab a man you never made. If the bot has never had a
      // clear line to the subject inside identR, then at the moment of contact
      // it grabs one of the bodies within identPick at random — and if that is
      // a shopper it is a HARASSMENT COMPLAINT, which is what it is in the game
      // too. One body inside the radius is not a choice and costs nothing, so
      // this is inert everywhere except in a crowd, which in this store means
      // the front end and the doorway. `ident:false` reproduces the old oracle
      // exactly, and every one-door-vs-two-door comparison in this round's
      // report is published both ways.
      let falseGrabs = 0, identCool = 0, crowdAtGrab = 0;
      grabGate = opts.ident === false ? null : (sub) => {
        if (st.made) return true;
        if (identCool > 0) return false;
        let n = 0, hitI = -1, k = 0;
        for (const o of shoppers) {
          if (o.escaped || o.caught || !o.mesh.visible) continue;
          if (dist2d(o.position.x, o.position.z, cop.position.x, cop.position.z) < K.identPick) n++;
        }
        crowdAtGrab = Math.max(crowdAtGrab, n);
        if (n <= 1) return true;
        const pickI = Math.floor(rnd() * n);
        for (const o of shoppers) {
          if (o.escaped || o.caught || !o.mesh.visible) continue;
          if (dist2d(o.position.x, o.position.z, cop.position.x, cop.position.z) >= K.identPick) continue;
          if (k++ === pickI) { hitI = o === sub ? 1 : 0; break; }
        }
        if (hitI === 1) return true;
        falseGrabs++; identCool = K.identCool;      // he has the wrong man by the arm
        return false;
      };

      let time = 0, done = 0, finalGap = 0, ducked = false;
      let tBolt = NaN, gapAtBolt = NaN, routeAtBolt = NaN;
      let minGap = Infinity, sumTs = 0, sumCs = 0, nS = 0;
      let gassedT = 0, slowT = 0, boostT = 0, sumCm = 0, sumLat = 0, nLat = 0;
      let sprintT = 0, atCop = null, doorT = NaN, exitUsed = -1;
      // ROUND 5. bursts = how many separate times he put his foot down. This is
      // the number the design is actually aiming at ("a countable rhythm of
      // short bursts"), and seconds-of-sprint cannot see it: 3.4 s in one go
      // and 3.4 s in four goes are the same sprintFrac and a different game.
      let bursts = 0, wasSprint = false, usedBand = null, wentBack = false;
      // ROUND 6 — how much of this trial the cop spent parked on the only way
      // out. The single most useful diagnostic in the file right now: a trial
      // that ends `ditched` and reports postedT 0 is a bug, not a design.
      let postedTrial = 0, heldTrial = 0;
      const api = {
        onBolt() {}, onHarass() {},
        // ROUND 6 — a fourth ending. He waited you out and ditched the goods in
        // a shelf, so there is nothing to arrest him for and nothing was lost.
        // It is NOT a catch and it is NOT an escape, and pooling it into either
        // one would hide the whole point: a cop who stands on the door turns
        // every incident into this, which pays nothing.
        onAbort() { done = 4; },
        onCatch() { done = 1; },
        onEscape() {
          done = 2;
          // How far behind he was when the doors ate him. This is THE number.
          finalGap = dist2d(cop.position.x, cop.position.z, thief.position.x, thief.position.z);
        },
      };
      while (time < maxT && !done) {
        if (identCool > 0) identCool -= dt;
        tick(dt, botInput(thief, mode, st, dt), api);
        time += dt;
        if (doorPosted()) postedTrial += dt;
        if (thief.stall > 0) heldTrial += dt;
        const g = dist2d(thief.position.x, thief.position.z, cop.position.x, cop.position.z);
        if (!isFinite(tBolt) && thief.bolted) {
          tBolt = time; gapAtBolt = g;
          routeAtBolt = routeLen(thief.position.x, thief.position.z);
        }
        if (thief.bolted && !done) {
          if (g < minGap) minGap = g;
          if (thief.position.z > HALF_LEN - 2.2) wentBack = true;
          if (thief.duck) ducked = true;
          if (cu.speed > K.copWalk + 0.35) sprintT += dt;
          if (cu.sprinting && !wasSprint) bursts++;
          wasSprint = !!cu.sprinting;
          // Which corridor did he actually run ALONG. Being inside the band is
          // not enough — an aisle crosses every band. He has to be travelling
          // down it, i.e. moving laterally and mostly laterally. The rear
          // cross-aisle is not a clean corridor in this store (0.6 open, not
          // 0.95) so it does not register as a band; `wentBack` still owns it
          // and wins the tie, because reaching the rear wall is the strongest
          // statement a route makes about itself.
          if (Math.abs(thief.vel.x) > 1.1 && Math.abs(thief.vel.x) > Math.abs(thief.vel.z)) {
            for (const b of bands) {
              if (Math.abs(thief.position.z - b.z) < b.half) { usedBand = b.kind; break; }
            }
          }
          if (thief.state === 'shove' && !isFinite(doorT)) { doorT = time; exitUsed = thief.exitI; }
          // THE BRANCH. Half a second after the bolt, is he running AT the man
          // chasing him or away from him? Round 3's headline was the average of
          // two near-deterministic outcomes -- 449 of 600 came at the cop and
          // 97.1% of those were collected, 151 went out the back and 0 of those
          // were ever caught -- and an average of two foregone conclusions is
          // not a chase. Any headline that does not carry this split is hiding
          // the game.
          if (atCop === null && time - tBolt > 0.5) {
            const m = thief.speed || 1;
            atCop = ((cop.position.x - thief.position.x) * thief.vel.x
                   + (cop.position.z - thief.position.z) * thief.vel.z) / (m * (g || 1)) > 0.15;
          }
          sumTs += thief.speed; sumCs += cu.speed; nS++;
          if (cu.gassed) gassedT += dt;
          if (cu.boost > 0) boostT += dt;
          if (thief.dbgTarget < K.thiefRun * 0.92) slowT += dt;
          sumCm += thief.dbgCorner ?? 1;
          if (Math.abs(cop.position.z) < HALF_LEN) {
            sumLat += Math.abs(cop.position.x - aisleX(aisleOf(cop.position.x))); nLat++;
          }
        }
        if (k === traceK) {
          trace.push([+time.toFixed(3), +g.toFixed(2), +cu.speed.toFixed(2), +thief.speed.toFixed(2),
            thief.state, +cu.stamina.toFixed(2), cu.gassed ? 1 : 0, +cu.boost.toFixed(2),
            +dist2d(thief.position.x, thief.position.z, EXIT.x, EXIT.z).toFixed(2),
            +(thief.dbgTarget ?? 0).toFixed(2), +thief.wind.toFixed(2), thief.path.length,
            +thief.position.x.toFixed(1), +thief.position.z.toFixed(1),
            +cop.position.x.toFixed(1), +cop.position.z.toFixed(1)]);
        }
      }
      R.push({
        done, time, tBolt, gapAtBolt, routeAtBolt, minGap: isFinite(minGap) ? minGap : NaN,
        finalGap, chaseT: time - (isFinite(tBolt) ? tBolt : 0),
        thiefSpd: nS ? sumTs / nS : NaN, copSpd: nS ? sumCs / nS : NaN,
        gassedFrac: nS ? gassedT / (nS * dt) : NaN,
        boostFrac: nS ? boostT / (nS * dt) : NaN,
        slowFrac: nS ? slowT / (nS * dt) : NaN,
        corner: nS ? sumCm / nS : NaN,
        copLat: nLat ? sumLat / nLat : NaN,
        aisle: ai, wentBack, ducked, barged: thief.bargeN > 0,
        bursts, usedBand,
        // ROUND 6 — the identity model's output: did he ever make the subject,
        // how many bodies were inside grabbing range when he committed, and how
        // many times he came away with a stranger's arm (= a complaint).
        made: !!st.made, falseGrabs, crowdAtGrab,
        postedT: postedTrial, heldT: heldTrial,
        bargeStam: thief.bargeStam,
        atCop: atCop === true, doorT, exitUsed,
        caughtShoving: done === 1 && isFinite(doorT),
        sprintFrac: nS ? sprintT / (nS * dt) : NaN,
        // Starting geometry, so a result can be sliced by how deep in the aisle
        // he was when you walked in on him instead of only pooled.
        z0: tzz, d0: dist2d(txx, tzz, cx0, cz0),
        noBolt: !isFinite(tBolt),
      });
    }

    grabGate = null;
    cop.position.copy(save.pos);
    Object.assign(cop.userData, save.ud);
    reset();

    const caught = R.filter((r) => r.done === 1);
    const esc = R.filter((r) => r.done === 2);
    const stall = R.filter((r) => r.done === 0);
    // ---- THE DISTRIBUTION ---------------------------------------------------
    // Round 3 published a headline catch rate that was the mean of two
    // near-deterministic branches, and the number that mattered -- 61% of
    // catches landing inside one second of the bolt -- was already printing on
    // this object and went unread. Nothing below is optional.
    const bolted = R.filter((r) => !r.noBolt);
    const branch = (f) => {
      const g = bolted.filter(f);
      const c = g.filter((r) => r.done === 1);
      return g.length
        ? `n${g.length} ${Math.round(c.length / g.length * 100)}% med${_f2(_q(c.map((r) => r.chaseT), 0.5))}s`
        : 'n0';
    };
    const res = {
      mode, spawn, bot: opts.bot ?? 'cut', lag: opts.lag ?? 0.16,
      misaim: opts.misaim ?? 0, n, crowd,
      // Non-null means THIS RUN WAS NOT THE SHIPPED BUILD. See agents.override.
      // A swept number that does not carry this is how a file ends up running
      // constants its own report does not describe.
      override: Object.keys(OVR).length ? { ...OVR } : null,
      // ROUND 9 (2nd pass) — non-null means THIS RUN USED THE PRE-ROUND-9 BOT,
      // the one that holds the sprint key while gassed. Same contract as
      // `override`: a measurement taken on the old instrument says so.
      legacyWind: opts.legacyWind ? true : null,
      // Null when the lung inequality holds. Non-null means the wind numbers on
      // this object do not describe a game where managing your wind pays, and
      // it says which constant broke it. See lungCheck().
      lungBroken: lungCheck().ok ? null : lungCheck(),
      // Same contract as lungBroken: non-null means the thief's pace curve is
      // inverted or the bot's model has fallen outside it, and every speed
      // number on this object is describing a different game. See paceCheck().
      paceBroken: paceCheck().ok ? null : paceCheck(),
      // ROUND 2 (character). Non-null means the walk-out band has stopped being
      // a band anybody can draw from, i.e. the guilt leak this round closed has
      // been reopened by a tuning edit. Same contract as the two above.
      exitBroken: exitCheck().ok ? null : exitCheck(),
      // ROUND 3 (move). Same contract again: non-null means a poseWalk caller
      // has gone back to handing the solve a world speed, so every body's
      // stance foot is skating by its own stature and the walk on this build is
      // not the walk these numbers were taken on. It reads the LIVE worst since
      // boot, and a bench walks thousands of bodies, so by the time this is
      // evaluated it has had every body in the roster through it.
      plantBroken: plantCheck().ok ? null : plantCheck(),
      catchRate: +(caught.length / n * 100).toFixed(1),
      escaped: esc.length, stalled: stall.length,
      // He ditched it rather than walk into you. See onAbort above and dumpT.
      ditched: R.filter((r) => r.done === 4).length,
      // Seconds from DISPATCH (not from the bolt) to the grab. If this is ~1s
      // the player never had a chase, whatever the catch rate says.
      catchFromDispatch_median: _f2(_q(caught.map((r) => r.time), 0.5)),
      catchFromDispatch_p10: _f2(_q(caught.map((r) => r.time), 0.1)),
      catchFromDispatch_p90: _f2(_q(caught.map((r) => r.time), 0.9)),
      // THE two branches, each with its own catch rate and its own median. A
      // headline that pools these is hiding whether either one is a chase.
      cameAtCop: branch((r) => r.atCop),
      turnedAway: branch((r) => !r.atCop),
      // Caught with his shoulder on a push-bar: the chase decided AT the door,
      // which before round 4 could not happen because there was no beat there.
      caughtAtDoor: caught.filter((r) => r.caughtShoving).length,
      // Is the shoulder barge inert? Not "how often does it fire" -- round 3
      // asked that and got 7 -- but DOES GETTING THROUGH YOU CHANGE ANYTHING.
      // Compare the chases where he committed to a shoulder and got through
      // against the ones where he committed and you had it covered.
      bargeGot: branch((r) => r.barged),
      bargeStopped: branch((r) => r.ducked && !r.barged),
      // Cop's tank AT THE MOMENT OF CONTACT. Kept because it is real data, but
      // it is NOT the discriminator and I nearly reported it as one: these two
      // come out within a point of each other (60% / 59%), because what decides
      // the barge is the 1.5 s the contact TAKES OFF him, not the level he
      // happened to be at. The claim is settled by ablation instead — turn
      // bargeWind off and barged-and-still-caught goes 59% -> 81%.
      bargeWinded: branch((r) => r.barged && r.bargeStam < 0.35),
      bargeFresh: branch((r) => r.barged && r.bargeStam >= 0.35),
      reachedDoor: R.filter((r) => isFinite(r.doorT)).length,
      // ROUND 9 (2nd pass) — the seconds a thief ACTUALLY spends on the leaf at
      // each door, i.e. K.doorShove after EXIT_SPEC's per-door multiplier. It
      // is on the result because config's `doorShove: 0.85` has not been the
      // number at the only usable exit since round 6 (it is 0.30 there) and a
      // constant that is quoted but never printed is how that happens twice.
      doorShoveEff: EXITS.map((e) => `${e.label}:${e.shove.toFixed(2)}s`).join(' '),
      exitSplit: EXITS.map((e, i) =>
        `${e.label}:${R.filter((r) => r.exitUsed === i).length}`).join(' '),
      copSprintFrac: _f2(_mean(R.map((r) => r.sprintFrac).filter(isFinite))),
      // Did he ever use the back of the store? The counterplay, measured.
      outTheBack: R.filter((r) => r.wentBack).length,
      outTheBackCaught: R.filter((r) => r.wentBack && r.done === 1).length,
      // ROUND 5 — which corridor he actually ran along. `outTheBack` alone
      // stopped describing the counterplay the moment the store grew a mid
      // cross-aisle: the route is still "leave the aisle sideways and come down
      // a different one", it just does not have to reach the rear wall to do
      // it any more. Each entry carries its own catch rate, because a route
      // that is never caught and a route that is always caught are both
      // foregone conclusions wearing a chase.
      viaBand: ['mid', 'back', 'front'].map((k) => {
        const g = bolted.filter((r) => (r.wentBack ? 'back' : r.usedBand) === k);
        const c = g.filter((r) => r.done === 1);
        return `${k} n${g.length}${g.length ? `:${Math.round(c.length / g.length * 100)}%` : ''}`;
      }).join(' ') + ` straight n${bolted.filter((r) => !r.wentBack && !r.usedBand).length}`,
      crossBands: bands.map((b) => `${b.kind}@${b.z.toFixed(1)}`).join(' '),
      // ROUND 5 — the countable rhythm, counted. Median separate sprints per
      // chase. If this is 1 the tank is longer than the chase and stamina is a
      // one-shot budget however pretty the bar is.
      burstsPerChase_median: _f2(_q(bolted.map((r) => r.bursts), 0.5)),
      burstsPerChase_p90: _f2(_q(bolted.map((r) => r.bursts), 0.9)),
      // ...and how often he committed to a shoulder and tried to go through you.
      squeezed: R.filter((r) => r.ducked).length,
      // He committed to a shoulder and you were not in front of it.
      barged: R.filter((r) => r.barged).length,
      bargedThenCaught: R.filter((r) => r.barged && r.done === 1).length,
      // Grabbed before he even finished flinching — you landed on top of him.
      caughtStanding: caught.filter((r) => r.noBolt).length,
      // Catch rate sliced by how far away he was when you walked in. Pooling
      // these hides the whole story: walking in on top of him is meant to be a
      // catch, and it is a different event from a chase down the aisle.
      byStartGap: [[0, 3], [3, 6], [6, 10], [10, 16], [16, 99]].map(([a, b]) => {
        const g = R.filter((r) => r.d0 >= a && r.d0 < b);
        return g.length ? `${a}-${b}m n${g.length}:${Math.round(g.filter((r) => r.done === 1).length / g.length * 100)}%` : null;
      }).filter(Boolean).join(' '),
      // how badly the escapes were lost (cop-to-thief separation at the doors)
      missByM_median: _f2(_q(esc.map((r) => r.finalGap), 0.5)),
      missByM_p10: _f2(_q(esc.map((r) => r.finalGap), 0.1)),
      missByM_p90: _f2(_q(esc.map((r) => r.finalGap), 0.9)),
      missByFt_median: _f2(_q(esc.map((r) => r.finalGap), 0.5) * 3.281),
      // closest the cop ever got on an escape — the "barely" number
      minGapM_median: _f2(_q(esc.map((r) => r.minGap), 0.5)),
      // where catches happen: chase seconds from bolt to grab
      catchT_median: _f2(_q(caught.map((r) => r.chaseT), 0.5)),
      catchT_p90: _f2(_q(caught.map((r) => r.chaseT), 0.9)),
      catchUnder1s: caught.filter((r) => r.chaseT < 1.0).length,
      // ...as a percentage of catches, because that is the form the claim takes.
      catchUnder1sPct: caught.length
        ? +(caught.filter((r) => r.chaseT < 1.0).length / caught.length * 100).toFixed(1) : null,
      catchUnder2s: caught.filter((r) => r.chaseT < 2.0).length,
      escT_median: _f2(_q(esc.map((r) => r.chaseT), 0.5)),
      gapAtBolt_median: _f2(_q(R.map((r) => r.gapAtBolt), 0.5)),
      routeAtBolt_median: _f2(_q(R.map((r) => r.routeAtBolt), 0.5)),
      // speeds actually achieved during the bolt
      thiefSpd_mean: _f2(_mean(R.map((r) => r.thiefSpd).filter(isFinite))),
      copSpd_mean: _f2(_mean(R.map((r) => r.copSpd).filter(isFinite))),
      gassedFrac: _f2(_mean(R.map((r) => r.gassedFrac).filter(isFinite))),
      boostFrac: _f2(_mean(R.map((r) => r.boostFrac).filter(isFinite))),
      thiefSlowFrac: _f2(_mean(R.map((r) => r.slowFrac).filter(isFinite))),
      cornerMul: _f2(_mean(R.map((r) => r.corner).filter(isFinite))),
      copLat_mean: _f2(_mean(R.map((r) => r.copLat).filter(isFinite))),
      // ---- ROUND 6: one exit, and who he thinks he is holding ---------------
      doors: EXITS.length,
      difficulty: DIFF.level,
      // Did he ever get a close enough look to know which coat to grab. This is
      // the number that separates a dispatch you used from one you ignored, and
      // with one door it is most of what the aisle number is now worth.
      madePct: +(R.filter((r) => r.made).length / n * 100).toFixed(1),
      // Grabbed a stranger. In the game that is a harassment complaint and three
      // of them is traffic duty, so it is not a rounding error on a catch rate.
      falseGrabs: R.reduce((a, r) => a + r.falseGrabs, 0),
      falseGrabTrials: R.filter((r) => r.falseGrabs > 0).length,
      // Biggest crowd inside grabbing range at the moment he committed.
      crowdAtGrab_median: _f2(_q(R.map((r) => r.crowdAtGrab), 0.5)),
      ident: opts.ident !== false,
      // Seconds per trial the cop spent parked on the only way out, and seconds
      // the subject spent hanging back because of it. If `ditched` is non-zero
      // and these are zero, something other than the design is ending trials.
      postedT_median: _f2(_q(R.map((r) => r.postedT), 0.5)),
      heldT_median: _f2(_q(R.map((r) => r.heldT), 0.5)),
    };
    if (opts.raw) res.raw = R;
    if (traceK >= 0) res.trace = trace;
    DIFF.level = saveLevel;
    return res;
  }

  // =========================================================================
  // benchShift — THE SECOND INSTRUMENT, AND THE ONE THE ONE-EXIT DESIGN LIVES
  // OR DIES ON.
  //
  // bench() measures ONE CHASE from a dispatch that has already happened. It
  // cannot see the thing this round changed, because deterrence acts BEFORE the
  // theft: a camper's catch rate is high and always was, and under this round
  // it is still high — he is standing on the only door. What collapses is that
  // there is nothing to catch. A catch rate is a conditional probability and
  // the condition is what moved, so the headline number for a camper has to be
  // POINTS PER SHIFT, not percent.
  //
  // So this runs a whole shift: fourteen customers, subjects armed on game.js's
  // own cadence, a cop driven by one of three policies, and it counts what the
  // scoreboard would count. game.js scores a catch at 100 and an escape at 0,
  // so points = 100 x catches; complaints are the other axis and three of them
  // is a demotion, so they are reported rather than netted.
  //
  //   desk   sits at the service desk, reads the wall, and dispatches into the
  //          mouth of the subject's aisle `deskLag` seconds after he conceals —
  //          which is postSpawn('aisle'), the same teleport the DISPATCH button
  //          performs. Then chases with `cut`. This is the intended player.
  //   chase  same dispatch, naive pursuit. The intended player, badly.
  //   camp   walks to the door at the start of the shift and stands on it. He
  //          never reads the wall, never dispatches, and never has to.
  // =========================================================================
  function benchShift(opts = {}) {
    const n = opts.n ?? 8;
    const minutes = opts.minutes ?? 4;
    const policy = opts.policy ?? 'desk';
    const dt = 1 / 60;
    const saveLevel = DIFF.level;
    const savePos = cop.position.clone(), saveUd = { ...cop.userData };
    const rows = [];
    // game.js's PACE table, as of round 6. Density is ITS axis, so this is a
    // copy for measurement only and it is marked as one: if game.js moves its
    // table, this stops describing the shift and has to be re-copied.
    const PACE = [
      { at: 0, live: 1, gap: [26, 38] },
      { at: 150, live: 2, gap: [18, 28] },
      { at: 330, live: 3, gap: [12, 20] },
    ];
    const paceAt = (c) => { let p = PACE[0]; for (const q of PACE) if (c >= q.at) p = q; return p; };

    for (let k = 0; k < n; k++) {
      setSeed((opts.seed ?? 5150) + k * 7919);
      reset();
      for (const s of shoppers) resetShopper(s, false);
      let clock = 0, rearm = 2.0;
      let incidents = 0, catches = 0, escapes = 0, aborts = 0, complaints = 0;
      let bolts = 0, thefts = 0, decoys = 0;
      let postedT = 0;
      // ROUND 7 — what the PA did this shift. `calls` counts announcements the
      // player actually got out, `heeds`/`shrugs` what came back.
      let calls = 0, heeds = 0, shrugs = 0;
      // The cop's own little state machine. `job` is the subject he has been
      // dispatched onto, null when he is at the desk.
      let job = null, dispatchIn = 0;
      const st = {
        gotBoost: true, puTarget: null, puT: 0, detour: 7,
        path: [], repath: 0, goal: { x: 0, z: 0 },
        lag: 0.16, hist: [0, 0], bot: policy === 'chase' ? 'chase' : 'cut',
        conserve: opts.conserve, blown: false,
        copF: null, copBuf: null, cfT: 0, planT: 0, route: null, campI: 0,
        blind: true, seen: { x: 0, z: 0 }, seenT: 0, made: false, madeT: 0,
      };
      const api = {
        onBolt() { bolts++; },
        onCatch() { catches++; job = null; st.made = false; st.madeT = 0; },
        onEscape() { escapes++; job = null; st.made = false; st.madeT = 0; },
        onHarass() { complaints++; },
        onAbort() { aborts++; },
        onLeave() {},
        onAnnounce(s, kind, out) { if (out === 'heed') heeds++; else if (out === 'shrug') shrugs++; },
      };
      // The camper walks to the door once and stays. Everyone else starts at
      // the desk, which is 40 m from the only exit and is NOT a post on it —
      // that separation is what makes deterrence a choice rather than a tax.
      cop.position.set(SERVICE_DESK.x, 0, SERVICE_DESK.z);
      solids.resolve(cop.position, BODY_R);
      cop.userData.vel.set(0, 0, 0); cop.userData.speed = 0;

      const armOne = () => {
        const live = shoppers.filter((s) => s.guilty && !s.escaped && !s.caught && s.mesh.visible).length;
        if (live >= paceAt(clock).live) return false;
        const pool = shoppers.filter((s) => !s.guilty && !s.escaped && !s.caught && s.mesh.visible
          && !s.leaving && s.angry <= 0
          && dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z) > 9);
        if (!pool.length) return false;
        const s = pool[Math.floor(rnd() * pool.length)];
        s.guilty = true; s.stole = false; s.bolted = false; s.aborts = 0;
        s.chill = 0; s.balk = 0; s.leaving = false;
        s.concealT = rr(10, 22);
        return true;
      };

      const maxT = minutes * 60;
      while (clock < maxT) {
        if (opts.difficulty != null) DIFF.level = clamp(+opts.difficulty || 0, 0, 1);
        else DIFF.level = difficultyForClock(clock);

        // ---- spawn pacing, on game.js's cadence --------------------------
        rearm -= dt;
        if (rearm <= 0) {
          const g = paceAt(clock).gap;
          if (armOne()) rearm = rr(g[0], g[1]); else rearm = 2.0;
        }

        // ---- ROUND 7: DOES SHOUTING AT EVERYBODY PAY? --------------------
        // The `pa` player never leaves the desk and never dispatches. Every
        // time the handset comes off cooldown he picks whoever is doing
        // something with their hands right now — which is the honest maximal
        // read, because a player CANNOT tell a steal clip from a decoy clip and
        // this bot does not get to either — and says the line. This is the
        // camper's experiment with a microphone instead of a doorway, and it
        // has to come out the same way or the announcement is a free win
        // button.
        // ROUND 8 — `paChase` is the same bot with the one obvious upgrade: when
        // something he shouted at RUNS, he goes after it, on foot, from
        // wherever he is standing. No dispatch, because a dispatch is a
        // teleport to the mouth of the aisle and the whole point of the bolt
        // outcome is that the man who keyed the handset is 40 m away and has to
        // cover it himself. This is the row that answers "does the PA-spam
        // player still earn zero" honestly, because `pa` alone answers a
        // strawman who watches his flushed thief walk out.
        if ((policy === 'pa' || policy === 'paChase') && annCool <= 0) {
          const tgt = shoppers.find((s) => s.gest && !s.annT && !s.bolted
            && !s.caught && !s.escaped && s.mesh.visible
            && (s.gest.tell === 'steal' || s.gest.tell === 'decoy'));
          if (tgt && announceAt(tgt, 'putback').ok) calls++;
        }

        // ---- what the cop is doing ---------------------------------------
        let input;
        if (policy === 'camp') {
          const e = EXITS[0];
          const d = dist2d(cop.position.x, cop.position.z, e.x, e.z);
          // Once somebody is inside grabbing range, stop being furniture.
          let tgt = shoppers.find((s) => s.guilty && s.bolted && !s.escaped && !s.caught);
          if (tgt && dist2d(tgt.position.x, tgt.position.z, cop.position.x, cop.position.z) < 4.0) {
            st.made = st.made || false;
            input = botInput(tgt, 'none', st, dt);
          } else {
            const p = nav.path(cop.position.x, cop.position.z, e.x, e.z);
            const holder = { position: cop.position, path: p };
            const dir = followPath(holder, 0);
            input = dir ? { x: dir.x, z: FWD_SIGN * dir.z, sprint: d > 6 } : { x: 0, z: 0, sprint: false };
          }
        } else {
          // THE DESK. He is watching the wall; the tell fires when the subject
          // finishes concealing, and he presses DISPATCH `deskLag` later —
          // which is a teleport to the mouth of that man's aisle, exactly what
          // game.js's postSpawn('aisle') does.
          // ROUND 8 — paChase takes his job off the floor rather than off the
          // wall: whoever is running, if anybody is. He never gets the teleport.
          if (policy === 'paChase') {
            if (!job || job.escaped || job.caught || !job.guilty || !job.bolted) {
              job = shoppers.find((x) => x.guilty && x.bolted && !x.escaped && !x.caught) || null;
              if (job) { st.path = []; st.repath = 0; st.made = true; st.madeT = 0; st.blind = false; }
            }
          }
          if (!job && policy !== 'pa' && policy !== 'paChase') {
            const tell = shoppers.find((s) => s.guilty && s.stole && !s.escaped && !s.caught && s.mesh.visible);
            if (tell && dispatchIn <= 0) { dispatchIn = opts.deskLag ?? 4.0; }
            if (tell && dispatchIn > 0) {
              dispatchIn -= dt;
              if (dispatchIn <= 0) {
                job = tell; incidents++;
                const a = clamp(aisleOf(tell.position.x) + (opts.misaim ?? 0), 0, AISLE_COUNT - 1);
                cop.position.set(aisleX(a), 0, -HALF_LEN + 3.0);
                solids.resolve(cop.position, BODY_R);
                cop.userData.vel.set(0, 0, 0); cop.userData.speed = 0;
                cop.userData.stamina = K.staminaMax; cop.userData.gassed = false;
                st.path = []; st.repath = 0; st.made = false; st.madeT = 0;
                st.seen.x = aisleX(a); st.seen.z = 0; st.seenT = 0; st.lost = null;
                st.hist = [tell.position.x, tell.position.z];
                st.copF = null; st.cfT = 0; st.planT = 0; st.route = null;
              }
            }
          }
          if (job && (job.escaped || job.caught || !job.guilty)) job = null;
          if (job) input = botInput(job, 'none', st, dt);
          else {
            // Back to the desk between cases. Walking, so the deterrence field
            // sees a man moving and not a man posted.
            const d = dist2d(cop.position.x, cop.position.z, SERVICE_DESK.x, SERVICE_DESK.z);
            if (d < 1.2) input = { x: 0, z: 0, sprint: false };
            else {
              const p = nav.path(cop.position.x, cop.position.z, SERVICE_DESK.x, SERVICE_DESK.z);
              const dir = followPath({ position: cop.position, path: p }, 0);
              input = dir ? { x: dir.x, z: FWD_SIGN * dir.z, sprint: false } : { x: 0, z: 0, sprint: false };
            }
          }
        }

        tick(dt, input, api);
        clock += dt;
        if (doorPosted()) postedT += dt;
        for (const s of shoppers) {
          if (s.gest && s.gest.tell === 'decoy' && s.gestT <= dt) decoys++;
          // A THEFT THAT ACTUALLY HAPPENED, counted once, whether or not the
          // player ever saw it. This is the number the camper has to be judged
          // on: his catch RATE is a percentage of whatever got as far as this
          // line, and the whole claim of the one-exit design is that standing
          // on the door drives this to zero rather than driving the rate down.
          if (s.guilty && s.stole && !s.__inc) { s.__inc = 1; thefts++; }
        }
      }
      for (const s of shoppers) s.__inc = 0;
      rows.push({
        thefts, catches, escapes, aborts, complaints, bolts,
        points: catches * 100, decoys,
        postedFrac: postedT / maxT,
        calls, heeds, shrugs,
      });
    }

    DIFF.level = saveLevel;
    cop.position.copy(savePos); Object.assign(cop.userData, saveUd);
    grabGate = null; reset();
    const mean = (f) => +(_mean(rows.map(f))).toFixed(2);
    return {
      policy, minutes, n, doors: EXITS.length,
      misaim: opts.misaim ?? 0,
      difficulty: opts.difficulty == null ? 'ramped' : opts.difficulty,
      // THE HEADLINE FOR THIS INSTRUMENT.
      pointsPerShift: mean((r) => r.points),
      catchesPerShift: mean((r) => r.catches),
      escapesPerShift: mean((r) => r.escapes),
      // THE ONE THAT ANSWERS THE BRIEF. A theft that actually happened, counted
      // whether or not the player saw it. If deterrence works, this is what
      // goes to zero for a camper, and his catch rate is then a percentage of
      // nothing — which is why a catch rate alone cannot describe him.
      incidentsPerShift: mean((r) => r.thefts),
      boltsPerShift: mean((r) => r.bolts),
      abortsPerShift: mean((r) => r.aborts),
      complaintsPerShift: mean((r) => r.complaints),
      decoysPerShift: mean((r) => r.decoys),
      // Fraction of the shift the cop spent posted on the way out.
      postedFrac: mean((r) => r.postedFrac),
      // ROUND 7 — the PA. `callsPerShift` counts announcements that actually
      // went out; `heedsPerShift` counts the ones that came back with somebody
      // putting something on a shelf, GUILTY OR NOT, because that is the only
      // thing the player can see.
      callsPerShift: mean((r) => r.calls),
      heedsPerShift: mean((r) => r.heeds),
      shrugsPerShift: mean((r) => r.shrugs),
      raw: opts.raw ? rows : undefined,
    };
  }

  // =========================================================================
  // benchAnnounce — THE INSTRUMENT THIS ROUND'S ANTI-ORACLE CLAIM LIVES ON.
  //
  // The whole design risk in "Hey, put that back" is that it becomes a free
  // guilt scanner: if the guilty visibly comply and the innocent visibly do
  // not, the desk phase is over and so is the harassment complaint. So the
  // number that has to be published is not "does deterrence work", it is the
  // pair of rates and the likelihood ratio between them.
  //
  // Four populations, same store, same PA line, cop parked at the service desk
  // 40 m away so nothing in the result is about a man walking at anybody:
  //   cold    guilty, has NOT concealed yet
  //   hot     guilty, already has it in his coat
  //   clean   innocent
  //   spill   in earshot of a call addressed to somebody else
  // ...plus `repeat`, which is the second and third shout at the same body and
  // is what stops the button being a slot machine.
  //
  // Reported as heed% (he put something back on a shelf) vs shrug% (he looked
  // around and carried on). BOTH POPULATIONS PRODUCE BOTH, which is the point.
  // =========================================================================
  function benchAnnounce(n = 400, opts = {}) {
    const dt = 1 / 60;
    const saveLevel = DIFF.level;
    const savePos = cop.position.clone(), saveUd = { ...cop.userData };
    if (opts.difficulty != null) DIFF.level = clamp(+opts.difficulty || 0, 0, 1);

    // One trial: put a subject in a known state, say the line, and watch.
    // `shouts` > 1 re-fires at the same body once he has answered the last one.
    function cell(kind, shouts) {
      let heed = 0, shrug = 0, deaf = 0, quit = 0, complaints = 0, spillHeeds = 0;
      let bolt = 0, boltCaught = 0, chaseComplaints = 0; const boltT = [];
      for (let k = 0; k < n; k++) {
        setSeed((opts.seed ?? 90210) + k * 7919);
        reset();
        // The desk is not a post on the door — see benchShift. This has to
        // measure the PA and not the uniform.
        cop.position.set(SERVICE_DESK.x, 0, SERVICE_DESK.z);
        solids.resolve(cop.position, BODY_R);
        cop.userData.vel.set(0, 0, 0); cop.userData.speed = 0;
        const s = shoppers[k % shoppers.length];
        resetShopper(s, kind !== 'clean');
        // `hot` is forced rather than simulated into: reactToPA reads exactly
        // `s.guilty && s.stole`, so setting them is faithful and it keeps the
        // cell from being a measurement of how long a concealment takes.
        if (kind === 'hot') { s.stole = true; s.state = 'drift'; s.concealT = 0; }
        // `phase` keeps the round-7 guarantee measurable now that this cell has
        // a second half. ANNOUNCING is what must never produce a complaint, and
        // `complaints` counts only that; the pursuit the player chooses to start
        // afterwards is a man running at people and of course it can offend one,
        // which is billed separately and is not a property of the PA.
        let phase = 'announce';
        const api = {
          onHarass() { if (phase === 'announce') complaints++; else chaseComplaints++; },
          onAbort() {}, onLeave() {}, onBolt() {}, onCatch() {}, onEscape() {},
          onAnnounce(sub, k2, out) {
            if (sub !== s) { if (out === 'heed') spillHeeds++; return; }
          },
        };
        let got = null;
        for (let shout = 0; shout < (shouts || 1); shout++) {
          const r = kind === 'spill'
            // A call addressed to the nearest OTHER body, so this subject only
            // ever hears it through the ceiling.
            ? (() => {
              let best = null, bd = 1e9;
              for (const b of shoppers) {
                if (b === s || !b.mesh.visible || b.caught || b.escaped) continue;
                const d = dist2d(b.position.x, b.position.z, s.position.x, s.position.z);
                if (d < bd) { bd = d; best = b; }
              }
              return best && bd <= K.annSpill ? announceAt(best, 'putback', { force: true })
                : { ok: false, why: 'nobody-near' };
            })()
            : announceAt(s, 'putback', { force: true });
          if (!r.ok) { break; }
          // Long enough for the latency plus the clip to start. The outcome is
          // committed the frame reactToPA runs, so this never waits on an
          // animation.
          for (let i = 0; i < 150 && !s.annOut; i++) tick(dt, { x: 0, z: 0 }, api);
          got = s.annOut;
          // Nothing left to shout at, either way: he has put it back, or he is
          // already running and announceAt would answer 'running' anyway.
          if (got === 'heed' || got === 'bolt') break;
          s.annOut = null;
        }
        if (got === 'heed') { heed++; if (!s.guilty && kind !== 'clean') quit++; }
        else if (got === 'shrug') shrug++;
        else if (got === 'bolt') {
          bolt++;
          // ROUND 8 — AND THEN WHAT. This is the economics of the whole outcome
          // and it has to be measured with the cop ACTUALLY TRYING, or it is a
          // tautology: a stationary man catches nobody, so counting his catches
          // proves only that he was stationary.
          //
          // So the handset goes down and the same pursuit bot every other bench
          // in this file uses takes over, from the service desk, with a full
          // tank, against a man who has already turned and gone. No dispatch —
          // a dispatch is a teleport to the mouth of his aisle and the entire
          // premise of the bolt outcome is that the player is 40 m away and has
          // to cover it himself. What comes back is the head start, priced.
          const st = {
            gotBoost: true, puTarget: null, puT: 0, detour: 7,
            path: [], repath: 0, goal: { x: 0, z: 0 },
            lag: 0.16, hist: [s.position.x, s.position.z], bot: 'cut',
            blown: false, copF: null, copBuf: null, cfT: 0, planT: 0,
            route: null, campI: 0, blind: false,
            seen: { x: s.position.x, z: s.position.z }, seenT: 0, made: true, madeT: 0,
          };
          cop.userData.stamina = K.staminaMax; cop.userData.gassed = false;
          phase = 'chase';
          let t2 = 0;
          for (let i = 0; i < 60 * 45 && !s.escaped && !s.caught; i++) {
            tick(dt, botInput(s, 'none', st, dt), api);
            t2 += dt;
          }
          if (s.caught) { boltCaught++; boltT.push(t2); }
        } else deaf++;
      }
      const tot = heed + shrug + bolt + deaf || 1;
      return {
        kind, shouts: shouts || 1, n,
        heedPct: +(heed / tot * 100).toFixed(1),
        shrugPct: +(shrug / tot * 100).toFixed(1),
        // ROUND 8. Innocents MUST read 0.0 here; it is gated on s.guilty inside
        // boltChance and there is no other way in.
        boltPct: +(bolt / tot * 100).toFixed(1),
        // Of the men the PA flushed, how many a player who dropped the handset
        // and ran from the service desk actually got, and how long it took him.
        boltCaughtFromDesk: boltCaught,
        boltCaughtPct: bolt ? +(boltCaught / bolt * 100).toFixed(1) : null,
        boltChaseMedian: boltT.length ? _f2(_q(boltT.slice().sort((x, y) => x - y), 0.5)) : null,
        // A heeding thief must end up a customer with nothing in his coat, or
        // the deterrence is a delay and the announcement is a tempo tool worth
        // 100 points instead of zero. This counts the ones that actually ended.
        endedClean: quit,
        noAnswer: deaf,
        // MUST BE ZERO. The entire point of shouting from the desk is that it
        // is the safe alternative to walking up to somebody. Round 8 keeps that
        // invariant by SPLITTING the counter rather than by relaxing it: this
        // is complaints from the announcement, `chaseComplaints` is complaints
        // from the pursuit the player elected to start after one ran.
        complaints,
        chaseComplaints,
        spillHeeds,
      };
    }

    const out = {
      cold: cell('cold', 1), hot: cell('hot', 1),
      clean: cell('clean', 1), spill: cell('spill', 1),
      coldx3: cell('cold', 3), cleanx3: cell('clean', 3),
    };
    DIFF.level = saveLevel;
    cop.position.copy(savePos); Object.assign(cop.userData, saveUd);
    grabGate = null; reset();

    // THE NUMBER THE BRIEF ASKED FOR, computed rather than asserted. If a
    // put-back were proof, this would be Infinity.
    const lr = out.clean.heedPct > 0
      ? +((out.cold.heedPct / out.clean.heedPct)).toFixed(2) : Infinity;
    const lrShrug = out.clean.shrugPct > 0
      ? +((out.cold.shrugPct / out.clean.shrugPct)).toFixed(2) : Infinity;
    out.likelihoodRatio = {
      // P(put it back | guilty) / P(put it back | innocent)
      putback: lr,
      // ROUND 8 — and the one that IS a confession, published rather than
      // buried: an innocent cannot reach this outcome, so the ratio is infinite
      // and the honest thing to report is the RATE and what it costs. See
      // boltFromDesk below and the `pa`/`paChase` rows in benchIncome.
      boltIsProof: out.clean.boltPct === 0,
      boltPctCold: out.cold.boltPct,
      boltPctHot: out.hot.boltPct,
      boltPctInnocent: out.clean.boltPct,
      // ...and the other way, for the man who blanks you
      shrug: lrShrug,
      // What one call moves a 50/50 suspicion to, both ways. This is the whole
      // claim: it is a READ, not a test.
      from50_ifPutback: +((out.cold.heedPct / (out.cold.heedPct + out.clean.heedPct)) * 100).toFixed(1),
      from50_ifShrug: +((out.cold.shrugPct / (out.cold.shrugPct + out.clean.shrugPct)) * 100).toFixed(1),
    };
    out.override = Object.keys(OVR).length ? { ...OVR } : undefined;
    return out;
  }

  // =========================================================================
  // ROUND 12 — benchTake. IS THE HOLE IN THE SHELF A GUILT ORACLE?
  // =========================================================================
  // The store builder's note is exactly right and it is the reason this exists:
  // takeFacing(x,y,z,r) is four numbers and cannot see who is calling, gapCheck
  // proves two identical calls produce identical bytes, and the FIFO ages every
  // gap on one clock. THE ONLY PLACE A TELL CAN ENTER IS THIS FILE, and the one
  // property the store cannot enforce from its side is the CALLER'S REACH RATE.
  //
  // So this measures it, rather than reasoning about it. Run whole shifts with
  // the cop parked at the service desk — nobody is walking at anybody, nothing
  // is being chased — and count, per body, what the shelves actually lost:
  //
  //   takes/min      how often this population removes a facing
  //   putBack%       how often it goes back
  //   grabY          the mean height the hand took from
  //   dwell          seconds of the reach before the grasp frame
  //
  // and divide the guilty column by the innocent one. Every one of those four
  // is something a player can see on the monitor wall — a hole appearing, a
  // hole closing, where in the bay it is — so a ratio away from 1.00 on any of
  // them is a leak whatever the store does at its end.
  function benchTake(n = 24, opts = {}) {
    const dt = 1 / 60;
    const saveLevel = DIFF.level;
    const savePos = cop.position.clone(), saveUd = { ...cop.userData };
    if (opts.difficulty != null) DIFF.level = clamp(+opts.difficulty || 0, 0, 1);
    const secs = opts.secs ?? 90;
    const api = { onHarass() {}, onAbort() {}, onLeave() {}, onBolt() {},
      onCatch() {}, onEscape() {}, onAnnounce() {} };
    const acc = {
      guilty: { took: 0, put: 0, ySum: 0, dSum: 0, bodySecs: 0, bodies: 0 },
      clean: { took: 0, put: 0, ySum: 0, dSum: 0, bodySecs: 0, bodies: 0 },
    };
    let gaps0 = 0, gapsEnd = 0, misses = 0, attempts = 0;
    for (let k = 0; k < n; k++) {
      setSeed((opts.seed ?? 4242) + k * 7919);
      reset();
      // WHERE THE COP STANDS CHANGES THE ANSWER, so both are measurable.
      //   'desk'  — nobody is deterred. Every thief walks out in about 30 s,
      //             which is the most adversarial case for this ratio: it gives
      //             a guilty body the least time in the aisles it can possibly
      //             have.
      //   'door'  — the uniform is posted on the only way out, thieves balk,
      //             `chill` runs and they go back to shopping like everybody
      //             else. That is what the game looks like when the player is
      //             doing the thing the one-exit design rewards.
      const spot = opts.post === 'door' ? EXITS[0] : SERVICE_DESK;
      cop.position.set(spot.x, 0, spot.z);
      solids.resolve(cop.position, BODY_R);
      cop.userData.vel.set(0, 0, 0); cop.userData.speed = 0;
      for (const s of shoppers) { s.tookN = 0; s.putN = 0; s.takeYSum = 0; s.takeDSum = 0; }
      if (k === 0 && world.facingsTaken) gaps0 = world.facingsTaken();
      // TIME IN THE STORE, ACCUMULATED, and the first version got this wrong in
      // a way that emptied the guilty column entirely. It credited each body
      // with the whole shift and then dropped any body that had escaped or been
      // caught — and with the cop parked at the desk EVERY thief walks out, so
      // `guilty.bodies` came back 0 and the ratio was null. A thief is in the
      // building for a shorter time than a shopper BY CONSTRUCTION, so his
      // exposure has to be measured rather than assumed, or the rate this
      // function exists to compare is a rate over the wrong denominator.
      // WHO WAS ARMED, SNAPSHOTTED AT THE START, and this is the second thing
      // that emptied the guilty column. abortTheft() and dumpGoods() both set
      // `s.guilty = false` — a man who put it back IS a customer, which is the
      // whole point of round 6 — so classifying at the END of the shift files
      // every deterred thief's reaches under `clean`. With the uniform posted
      // on the door, EVERY thief balks, so `guilty.bodies` came back 0 and the
      // cell that matters most had no data in it at all.
      const armed = new Set(shoppers.filter((s) => s.guilty));
      const frames = Math.round(secs / dt);
      const SAMP = 15;
      const live = new Map();
      for (let i = 0; i < frames; i++) {
        tick(dt, { x: 0, z: 0 }, api);
        if (i % SAMP) continue;
        for (const s of shoppers) {
          if (s.escaped || s.caught || !s.mesh.visible) continue;
          live.set(s, (live.get(s) || 0) + dt * SAMP);
        }
      }
      for (const s of shoppers) {
        const secsIn = live.get(s) || 0;
        if (secsIn <= 0) continue;
        const c = armed.has(s) ? acc.guilty : acc.clean;
        c.took += s.tookN; c.put += s.putN;
        c.ySum += s.takeYSum; c.dSum += s.takeDSum;
        c.bodySecs += secsIn; c.bodies += 1;
      }
      if (world.facingsTaken) gapsEnd = world.facingsTaken();
    }
    const usedLevel = DIFF.level;
    DIFF.level = saveLevel;
    cop.position.copy(savePos); Object.assign(cop.userData, saveUd);
    reset();
    const cell = (c) => ({
      bodies: c.bodies,
      takes: c.took,
      takesPerMin: c.bodySecs > 0 ? +(c.took / c.bodySecs * 60).toFixed(3) : null,
      putBackPct: c.took > 0 ? +(c.put / c.took * 100).toFixed(1) : null,
      grabY: c.took > 0 ? +(c.ySum / c.took).toFixed(3) : null,
      grabD: c.took > 0 ? +(c.dSum / c.took).toFixed(3) : null,
    });
    const G = cell(acc.guilty), C = cell(acc.clean);
    const ratio = (a, b) => (a != null && b) ? +(a / b).toFixed(3) : null;
    return {
      n, secs, difficulty: usedLevel, wired: STOCK_OK, post: opts.post || 'desk',
      guilty: G, clean: C,
      // ALL FOUR SHOULD BE 1.00. Anything else is a leak in agents.js.
      likelihoodRatio: {
        takeRate: ratio(G.takesPerMin, C.takesPerMin),
        putBack: ratio(G.putBackPct, C.putBackPct),
        grabHeight: ratio(G.grabY, C.grabY),
        grabDist: ratio(G.grabD, C.grabD),
      },
      gapsOpenAtEnd: gapsEnd, gapsAtStart: gaps0,
      misses, attempts,
      override: Object.keys(OVR).length ? { ...OVR } : undefined,
    };
  }

  // =========================================================================
  // ROUND 9 — benchBird. DOES THE FINGER TELL YOU ANYTHING?
  // =========================================================================
  // The whole risk in the escalation ladder, stated as a measurement. Shout at
  // one body `shouts` times and record what he did the LAST time, for a guilty
  // subject and an innocent one, and divide.
  //
  // The ladder itself is guilt-blind by construction — rungOf() takes annN
  // and nothing else — but that is NOT sufficient on its own and it is worth
  // being precise about why. A subject only ever plays a react clip if he
  // SHRUGS, and the shrug probability does depend on guilt (K.annSpook vs
  // K.annHeed): that is round 7's design and it is what makes a put-back worth
  // reading at all. So the bird inherits exactly the shrug's likelihood ratio
  // and not one bit more — it is the shrug, animated differently, and it can
  // carry no information the shrug did not already carry.
  //
  // And the interesting part is what K.annFade does to that inheritance. The
  // fade discounts compliance by annFade^(annN-1), so by the fourth shout the
  // heed probability has collapsed for BOTH populations and the shrug rate has
  // gone to nearly 1 on both sides. The rung the bird lives on is precisely the
  // rung where the compliance difference has already faded out. The number
  // below is that argument as a fraction rather than as a paragraph.
  function benchBird(n = 200, opts = {}) {
    const dt = 1 / 60;
    const saveLevel = DIFF.level;
    const savePos = cop.position.clone(), saveUd = { ...cop.userData };
    if (opts.difficulty != null) DIFF.level = clamp(+opts.difficulty || 0, 0, 1);
    const shouts = opts.shouts ?? 5;
    const BIRDS = new Set(['whoMeBird', 'whoMeBirdMouth']);
    function cell(guilty, hot) {
      let bird = 0, shrug = 0, heed = 0, bolt = 0, folded = 0, trials = 0, armed = 0;
      const rung = new Map();
      for (let k = 0; k < n; k++) {
        setSeed((opts.seed ?? 5150) + k * 7919);
        reset();
        // The desk, not the door: this measures the handset, not the uniform.
        cop.position.set(SERVICE_DESK.x, 0, SERVICE_DESK.z);
        solids.resolve(cop.position, BODY_R);
        cop.userData.vel.set(0, 0, 0); cop.userData.speed = 0;
        const s = shoppers[k % shoppers.length];
        resetShopper(s, guilty);
        if (hot) { s.stole = true; s.state = 'drift'; s.concealT = 0; }
        const api = { onHarass() {}, onAbort() {}, onLeave() {}, onBolt() {},
          onCatch() {}, onEscape() {}, onAnnounce() {} };
        let out = null, react = null, sawBird = false, wasArmed = false;
        // WATCH THE WHOLE TRIAL, not just the frame the outcome commits. The
        // bird is a SEPARATE BEAT that arrives after the reaction is over (see
        // armBird), so a probe that samples s.gest at the moment s.annOut is set
        // measures the reaction and reports 0% birds forever. The first version
        // of this function did exactly that.
        const watch = (frames) => {
          for (let i = 0; i < frames; i++) {
            tick(dt, { x: 0, z: 0 }, api);
            if (s.gest && BIRDS.has(s.gest.id)) sawBird = true;
          }
        };
        for (let sh = 0; sh < shouts; sh++) {
          const r = announceAt(s, 'putback', { force: true });
          if (!r.ok) break;
          for (let i = 0; i < 150 && !s.annOut; i++) {
            tick(dt, { x: 0, z: 0 }, api);
            if (s.gest && BIRDS.has(s.gest.id)) sawBird = true;
          }
          out = s.annOut; react = s.gest ? s.gest.id : null;
          // ARMED means armBird() actually armed him, checked on the frame the
          // outcome commits and not after the watch — a drifting thief can reach
          // the door and escape during the 7 s the beat is pending, and testing
          // afterwards counted him as never-armed while still counting the bird
          // he gave you on the way out. That is how the first version of this
          // printed 128.6%.
          if (s.birdT > 0) wasArmed = true;
          // Run out the reaction AND the bird beat that follows it, whatever he
          // decided — a man who put it back gets one too, which is the whole
          // reason the ratio is 1.00.
          watch(420);
          // ONLY A RUNNER LEAVES THE LADDER. The first version also broke on
          // 'heed', and that was a bench artifact rather than a rule: nothing in
          // announceAt stops a player keying the handset again at a man who just
          // put something back, and a player who is spamming the PA certainly
          // will. Breaking on heed measured a different question — "what happens
          // to a subject who is only shouted at until he complies" — and since
          // guilty men comply sooner, it measured guilt with extra steps.
          // ELIGIBLE means: he has now been shouted at enough times, and he is
          // still a man standing in an aisle rather than a man running for the
          // door. That is the population the player is actually looking at when
          // he wonders what a raised arm means, and it is the conditional the
          // ladder controls. The unconditional rate cannot be equalised and
          // should not be — a guilty man runs, and running is the confession the
          // whole game is built on.
          if (out === 'bolt') break;
        }
        trials++;
        if (wasArmed) armed++;
        if (sawBird) bird++;
        if (out === 'heed') heed++;
        else if (out === 'bolt') bolt++;
        else if (out === 'shrug') {
          shrug++;
          if (react === 'whoMeFolded') folded++;
          rung.set(react, (rung.get(react) || 0) + 1);
        }
      }
      const pc = (x) => +((x / Math.max(1, trials)) * 100).toFixed(1);
      return { trials, birdPct: pc(bird), shrugPct: pc(shrug), heedPct: pc(heed),
        boltPct: pc(bolt), foldedPct: pc(folded), armed,
        birdGivenArmed: +((bird / Math.max(1, armed)) * 100).toFixed(1),
        clips: [...rung.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => c + ':' + v).join(' ') };
    }
    const cold = cell(true, false), hot = cell(true, true), clean = cell(false, false);
    DIFF.level = saveLevel;
    cop.position.copy(savePos); Object.assign(cop.userData, saveUd);
    const lr = (a, b) => +(Math.max(a, 1e-9) / Math.max(b, 1e-9)).toFixed(2);
    return {
      shouts, cold, hot, clean,
      // The headline. 1.00 means the finger is worth nothing to a player trying
      // to work out who is stealing, which is the only acceptable answer.
      likelihoodRatio: {
        // THE ONE THAT ANSWERS THE QUESTION. Among subjects still standing in an
        // aisle at the bird rung, does guilt change whether you get the finger?
        birdGivenArmed: lr(cold.birdGivenArmed, clean.birdGivenArmed),
        birdGivenArmedHot: lr(hot.birdGivenArmed, clean.birdGivenArmed),
        // ...and the unconditional versions, which are dominated by the fact
        // that a guilty man may have already run. Reported so nobody has to
        // wonder whether they were quietly left out.
        bird: lr(cold.birdPct, clean.birdPct),
        birdHot: lr(hot.birdPct, clean.birdPct),
        shrug: lr(cold.shrugPct, clean.shrugPct),
      },
    };
  }
  function benchBirdLine(n = 200, opts = {}) {
    const r = benchBird(n, opts);
    const row = (k) => `${k.padEnd(6)} bird|armed ${String(r[k].birdGivenArmed).padStart(5)}%`
      + ` (n=${String(r[k].armed).padStart(3)})`
      + `  bird ${String(r[k].birdPct).padStart(5)}%`
      + `  shrug ${String(r[k].shrugPct).padStart(5)}%`
      + `  heed ${String(r[k].heedPct).padStart(5)}%`
      + `  bolt ${String(r[k].boltPct).padStart(5)}%`;
    return [`after ${r.shouts} announcements at the same body:`,
      row('cold'), row('hot'), row('clean'),
      `LR(bird | still in the aisle at the rung) ${r.likelihoodRatio.birdGivenArmed}`
      + `  hot ${r.likelihoodRatio.birdGivenArmedHot}`,
      `LR(bird, unconditional) ${r.likelihoodRatio.bird}`
      + `   LR(shrug) ${r.likelihoodRatio.shrug}`
      + `   — both dominated by guilty men who already ran`].join('\n');
  }

  function benchAnnounceLine(n = 400, opts = {}) {
    const r = benchAnnounce(n, opts);
    const row = (k) => `${k.padEnd(8)} heed ${String(r[k].heedPct).padStart(5)}%`
      + `  shrug ${String(r[k].shrugPct).padStart(5)}%`
      + `  bolt ${String(r[k].boltPct).padStart(5)}%`
      + `  caught ${String(r[k].boltCaughtFromDesk).padStart(3)}`
      + `  complaints ${r[k].complaints}`;
    return [row('cold'), row('hot'), row('clean'), row('spill'),
      row('coldx3'), row('cleanx3'),
      `LR(putback) ${r.likelihoodRatio.putback}  a 50/50 read goes to `
      + `${r.likelihoodRatio.from50_ifPutback}% on a put-back, `
      + `${r.likelihoodRatio.from50_ifShrug}% on a shrug`,
      `bolt: cold ${r.cold.boltPct}%  hot ${r.hot.boltPct}%  innocent ${r.clean.boltPct}%`
      + `  |  flushed from the desk and then chased: cold ${r.cold.boltCaughtPct}% caught`
      + ` (median ${r.cold.boltChaseMedian}s), hot ${r.hot.boltCaughtPct}%`
      + ` (median ${r.hot.boltChaseMedian}s)`,
    ].join('\n');
  }

  // DOES CAMPING THE DOOR PAY? With one exit this cannot be answered with a
  // catch rate, so it is answered with the scoreboard. Three players, same
  // shift length, same spawn cadence.
  function benchIncome(n = 8, opts = {}) {
    const o = { ...opts, n };
    const fmtS = (r) => `pts/shift ${r.pointsPerShift}`
      + ` | incidents ${r.incidentsPerShift} caught ${r.catchesPerShift}`
      + ` lost ${r.escapesPerShift} | balked ${r.abortsPerShift}`
      + ` | complaints ${r.complaintsPerShift}`
      + ` | on the door ${(r.postedFrac * 100).toFixed(0)}%`;
    return {
      desk: fmtS(benchShift({ ...o, policy: 'desk' })),
      naive: fmtS(benchShift({ ...o, policy: 'chase' })),
      camper: fmtS(benchShift({ ...o, policy: 'camp' })),
      // ROUND 7 — the man who never leaves the desk and just talks. He has to
      // come out where the camper does, or the announcement is a free win.
      pa: fmtS(benchShift({ ...o, policy: 'pa' })),
      // ROUND 8 — ...and the same man once the announcement can flush a runner,
      // chasing every one of them on foot from the desk. If THIS row pays, the
      // PA is a scanner and the desk phase is dead.
      paChase: fmtS(benchShift({ ...o, policy: 'paChase' })),
    };
  }

  // Every scenario is measured FROM THE REAL SPAWN unless you say otherwise.
  function benchAll(n = 200, opts = {}) {
    return [
      bench({ ...opts, n, mode: 'none' }),
      bench({ ...opts, n, mode: 'ignore' }),
      bench({ ...opts, n, mode: 'pickup' }),
      bench({ ...opts, n, mode: 'boost' }),
    ];
  }
  // Compact one-line summary for sweeps.
  // Every line carries the distribution. A catch rate on its own is what got
  // round 3 marked down and it is not available from this file any more.
  const fmt = (r) => `${r.mode}${r.misaim ? `/off${r.misaim}` : ''}:${r.catchRate}%`
    + ` chase ${r.catchT_median}s (<1s ${r.catchUnder1sPct}%)`
    + ` | atCop ${r.cameAtCop} | away ${r.turnedAway}`
    + ` | barge ${r.barged}/${r.squeezed} got ${r.bargeGot}`
    + ` | door ${r.caughtAtDoor}/${r.reachedDoor} miss${r.missByM_median}m`;
  function benchLine(n = 200, opts = {}) {
    return benchAll(n, opts).map(fmt).join('  |  ');
  }
  // THE report, all from postSpawn('aisle'), all with the distribution attached.
  function benchReal(n = 200, opts = {}) {
    const o = { ...opts, n, spawn: 'aisle' };
    return {
      // The headline and the thing that decides whether the desk phase is worth
      // playing, printed together, because separating them is how round 3 came
      // to ship a game whose dominant strategy was to ignore the dispatch.
      noPowerup:   fmt(bench({ ...o, mode: 'none' })),
      doorCamper:  fmt(bench({ ...o, mode: 'none', bot: 'camp' })),
      naivePursuit: fmt(bench({ ...o, mode: 'none', bot: 'chase' })),
      canGrabOne:  fmt(bench({ ...o, mode: 'pickup' })),
      boostInHand: fmt(bench({ ...o, mode: 'boost' })),
      wrongBy1:    fmt(bench({ ...o, mode: 'none', misaim: 1 })),
      wrongBy2:    fmt(bench({ ...o, mode: 'none', misaim: 2 })),
      wrongBy4:    fmt(bench({ ...o, mode: 'none', misaim: 4 })),
      fromFrontEnd: fmt(bench({ ...o, mode: 'none', spawn: 'front' })),
      legacyBehind: fmt(bench({ ...o, mode: 'none', spawn: 'behind' })),
    };
  }
  // IS THE DISPATCH WORTH READING? The one question the desk phase lives or
  // dies on. A door-camping bot that throws the aisle number away, against a
  // bot that goes and uses it, at every misaim the player can be off by. If the
  // camper wins, the monitors are decoration.
  function benchCamp(n = 200, opts = {}) {
    const o = { ...opts, n, spawn: 'aisle', mode: 'none' };
    const row = (bot) => [0, 1, 2, 4].map((m) => {
      const r = bench({ ...o, bot, misaim: m });
      return `off${m}:${r.catchRate}%`;
    }).join(' ');
    return { cut: row('cut'), chase: row('chase'), camp: row('camp') };
  }

  // Loud at boot, like the lung and the pace. It needs the roster, so it cannot
  // live in the module-level block those two use.
  {
    const E = exitCheck();
    if (!E.ok && typeof console !== 'undefined') console.warn('[agents] exit band', E);
  }

  return {
    cop, shoppers, powerups, reset,
    update: tick,
    bench, benchAll, benchLine, benchReal, benchCamp, benchShift, benchIncome,
    benchAnnounce, benchAnnounceLine,
    // ROUND 9 — is the finger a guilt tell? See the block at benchBird.
    benchBird, benchBirdLine,

    // ROUND 6 CONTRACT ADDITION — THE DIFFICULTY RAMP (additive; a game.js that
    // never calls this gets round 5's difficulty exactly, because level 1 IS
    // round 5 and 1 is the default).
    //
    //   in game.js's update, once a frame, idempotent and free:
    //       const a = agentsOf();
    //       a.setDifficulty(a.difficultyForClock(st.clock));
    //
    // DENSITY IS NOT ON THIS DIAL. game.js owns how many cases are open and how
    // often one is armed (its PACE table); this owns how hard ONE of them is —
    // his running speed, the length of his drift out to the door, the "oh shit"
    // beat before the bolt, how much panic fuel he has, and how long the tell
    // is held on the monitor. The two ramps share the 0/150/330 s breakpoints
    // on purpose so the shift reads as one curve; if game.js moves its table,
    // move RAMP with it rather than letting them drift apart.
    //
    // The lever the game builder asked for by name is `rampWalk`: the drift out
    // to the door is 0.80x for the first couple of minutes, so the tell-to-door
    // window — route metres over thiefWalk — is 25% longer while the player is
    // still learning to read the wall. That is the client's "it should take a
    // minute", bought on the difficulty axis where it belongs.
    setDifficulty(d) { DIFF.level = clamp(+d || 0, 0, 1); return DIFF.level; },
    get difficulty() { return DIFF.level; },
    difficultyForClock, get ramp() { return RAMP; },

    // ROUND 6 — the one-exit economy, for anyone who wants to show it.
    // `posted` is true while the cop has been loitering within deterR route
    // metres of the way out for longer than deterT: the state in which nobody
    // in the building will start a theft. game.js may want it on the HUD — a
    // player who is being punished by an ABSENCE needs to be told that is what
    // is happening, or a quiet shift reads as a broken one. Suggested copy is
    // the fiction, not the mechanic: "FLOOR IS QUIET — NOBODY'S GOING TO TRY IT
    // WITH YOU STOOD THERE".
    get posted() { return doorPosted(); },
    get postedFor() { return postT; },

    // ROUND 7 CONTRACT ADDITION — THE ANNOUNCEMENT. Additive; a game.js that
    // never calls it gets round 6's game exactly.
    //
    //   const r = agents.announceAt(subject, 'putback');
    //   // r = { ok, why, id, kind, heard, aisle, at:{x,z} }
    //
    // `subject` is a shopper object (or its id) — whatever the spot monitor is
    // locked on. `kind` is 'putback' (the deterrence line, rolls compliance) or
    // 'hold' (the price-check line, pins him where he stands and rolls
    // nothing). Refusals come back as { ok:false, why } with why in
    // 'cooldown' | 'no-subject' | 'gone' | 'running'.
    //
    // THE OUTCOME IS NOT IN THE RETURN VALUE and that is deliberate — it is
    // rolled 0.35-0.95 s later, when he actually reacts, and delivered through
    // the OPTIONAL callback
    //
    //   api.onAnnounce(subject, kind, outcome)   outcome: 'heed'|'shrug'|'hold'
    //
    // so a ticker line cannot get ahead of the picture on the monitor.
    // `outcome` is what he VISIBLY did, never whether he was guilty: both
    // populations produce both outcomes on purpose (K.annHeed / K.annSpook).
    // A subject who heeds also fires the existing api.onAbort(s, 'announce'),
    // so a game.js that already handles balks scores this correctly with no
    // change: a deterred thief is worth zero, same as a ditched one.
    announceAt,
    get announceReady() { return annCool <= 0; },
    get announceIn() { return annCool; },
    // Decoy clips, for a critic who wants to drive one on demand:
    //   agents.playGesture(agents.shoppers[3], 'restash')
    //   agents.playGesture(agents.shoppers[3], 'whoMe')   // round 7
    gestures: GESTURES,
    playGesture(s, id) { return startGesture(s, 'decoy', id); },
    // debug handles
    // game.js counts down the door alarm off a thief's speed. TUNING.thiefRun is
    // his opening ceiling, not his cruise — use these instead so the ETA is true.
    thiefCruise: () => K.botCruise,
    thiefTop: () => K.thiefRun * K.thiefPanic,
    get nav() { return nav; }, get exitField() { return exitF; }, toExit,
    // ROUND 4 CONTRACT ADDITION (additive; nothing that ignores it breaks).
    // There are now TWO ways out of this store — see EXIT_SPEC. Anything that
    // measures a thief against config's EXIT is measuring him against one of
    // them. game.js's updateAlarm() already routes through toExit() and is
    // correct as written; the floor HUD's f.exitDist and stallWatch()'s
    // progress test are still straight lines to Door 1 and want exitDistOf().
    get exits() { return EXITS; },
    exitOf: (x, z) => exitOf(x, z),
    useDoors(k) { doorLimit = k == null ? 99 : k; buildExits(); return EXITS.length; },
    exitDistOf: (s) => exitOf(s.position.x, s.position.z).dist,
    get escapeField() { return escapeField(); }, get fleeBuilds() { return fleeBuilds; },
    rebuildNav() {
      nav = buildNav(); buildExits();
      fleeF = null; fleeBuf = null; fleeT = 0; fleeCx = fleeCz = 1e9;
    },
    tuning: T, K,
    // ROUND 5 debug handles.
    // `override` is the sweep lever every number in this round's report was
    // measured with: set a key, run bench(), delete the key. It is EMPTY in
    // normal operation and TUNING wins over the fallbacks, so it cannot shadow
    // config.js the way `R5` did — and bench() stamps whatever is in it onto
    // its own result as `res.override`, so a swept measurement announces
    // itself instead of being quoted as the shipped build. Leave it empty.
    // crossBands() is how the back-route metric finds the store's corridors
    // from the nav grid instead of assuming where they are.
    override: OVR, crossBands, lungCheck, paceCheck, exitCheck, paceOf,
    // ROUND 1 (cop) — the rig assertion for HIM. feetOk / kneeOk / the knee cut
    // landing on figures.js's own knee ball / the root-scale unit identity that
    // decides whether his stance foot skates. See copCheck().
    copCheck,
    // ROUND 3 (move) — the same assertion for the fourteen, and the one that
    // replaced "the crowd takes a different branch, so it is provably unmoved"
    // when both of round 1's flags were deleted. See plantCheck().
    plantCheck,
    // ROUND 12. gaitCheck() is the walk's lungCheck(): it re-derives the planted
    // foot in world coordinates and fails loudly if it slips. stockWired says
    // whether world.takeFacing was actually found at construction, so a report
    // that claims the shelf loses items can be checked rather than believed.
    gaitCheck, benchTake, get stockWired() { return STOCK_OK; },
    // How often a grasp actually finds something, and how far away it was. A
    // miss is ordinary — pallet stacks and cart loads are not takeable and the
    // search will not reach THROUGH a fixture — but a hit rate that collapsed
    // would mean the reach is playing at nothing, and that is invisible from a
    // screenshot.
    get takeStats() {
      return { ...TAKE, hitPct: TAKE.attempts ? +(TAKE.hits / TAKE.attempts * 100).toFixed(1) : null,
        meanD: TAKE.hits ? +(TAKE.dSum / TAKE.hits).toFixed(3) : null,
        meanY: TAKE.hits ? +(TAKE.ySum / TAKE.hits).toFixed(3) : null };
    },
    // Live facing handles, for a critic who wants to see that the thing in a
    // hand is the thing a shelf is missing.
    get carrying() {
      return shoppers.filter((s) => s.facing)
        .map((s) => ({ id: s.id, guilty: s.guilty, kind: s.facing.kind, at: s.facing.at }));
    },
    // ROUND 10 — the checkout and service-desk staff. `null` until the first
    // tick; see frontTick. Exposed so a capture can force a pose without
    // running the game (`agents.frontEnd.update(2.4)`) and so a store-only
    // plate can take them off screen in one call (`setVisible(false)`).
    get frontEnd() { return frontEnd; },
    get thieves() { return shoppers.filter((s) => s.guilty); },
  };
}
