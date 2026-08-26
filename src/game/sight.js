// OWNER: builder-game. THE EYE-HEIGHT SIGHTLINE TEST, and the only one there is.
// CONTRACT — must keep exporting exactly this:
//   makeSight(colliders) -> { canSee(ax,az,bx,bz), count, boxes, pad, eye, tgt }
//   EYE_H, TGT_H, VIS_PAD          the three constants, so an assertion can quote them
//   gondolaPairs(cfg)              the fixed cross-aisle probe set, see below
//   openPairs(cfg)                 ...and its mirror, the must-be-CLEAR set
//   END_RULES                      ROUND 15. The shipped end-exemption rule and the
//                                  two REJECTED drafts, named, so a probe can be run
//                                  against the bugs instead of only against the fix.
//                                  makeSight(colliders, {end}) selects one; ship uses
//                                  the default and nothing else may pass this.
//   PAD_PROBES                     ROUND 16. Body-radius values for the same kind of
//                                  injection, selected with makeSight(colliders,{pad}).
//                                  This is the family that reaches openPairs' 'run'
//                                  pairs — no end rule can. Ship passes neither.
//   CAP45_BLIND_ABOVE              the length above which `metres` and `cap45` are
//                                  the same function, so a probe can assert its span
//
// ===========================================================================
// WHY THIS FILE EXISTS: `clearSeg` ANSWERS A DIFFERENT QUESTION
// ===========================================================================
// Round 12 unified the player's HUD and the bench bot's sighting onto
// agents.nav.clearSeg — one owner, everybody calls it, exactly what CLAUDE.md
// prescribes. It was still wrong, because clearSeg is a BODY-PATHING predicate:
// agents' makeSolids() keeps only {x0,z0,x1,z1} from each collider and throws
// the height away, then makeNav inflates every footprint by a 0.52 m body
// radius. Measured on this store, 74 colliders:
//
//     >= 1.6 m tall   22    gondola runs 2.05, walls 7.40, two at 2.10/2.30
//     <  1.6 m tall   52    eight 1.10 checkout stands, the 1.15 service desk,
//                           sixteen at 1.00, 0.77-1.50 bins and produce tables
//
// You cannot WALK through a checkout stand. You can see over one. So for
// pathing clearSeg is right and for vision it is wrong, and 70% of the collider
// set is furniture the player is looking over. shots/critic_game_r12.png is
// SUBJ-09 in frame at 4.2 m with his head and shoulders clearly above a
// checkout stand and the HUD reading LAST SEEN 2.8s, for 170 consecutive
// frames.
//
// ---- SO WHY NOT CALL camera.js, WHICH ALREADY HAS HEIGHTS ----------------
// It does, and its comment says exactly why: "checkout counters, bins, produce
// tables... the camera may fly over them, which it should." But camera.js's
// solids() is a BOOM-COLLISION footprint built for a lens at 2.36 m, and it
// lives in a private closure inside createCamera(). Borrowing it would repeat
// round 12's mistake one file over.
//
// ---- ROUND 14 CORRECTION: RIGHT ANSWER, WRONG REASON ---------------------
// Round 13 justified that with the ~3.8 m gantry inflation, and measured a
// 0.52% difference in pairs when camera.js's heights were substituted. Both
// facts are real and they are not connected. camera.js's rule is
//
//     y1 = y > 2.5 ? y : y > 1.5 ? SHELF_H + 1.75 : y + 0.15
//
// and the middle branch — the gantry inflation, the one round 13 named — is a
// NO-OP FOR SIGHT. A box only occludes here if `y1 >= hMin`, and hMin never
// exceeds EYE_H 1.62. The census at the top of this file says this store has
// nothing between 1.50 and 2.05 m, so every collider that branch touches is
// already at 2.05 or above and already occluding an eye. Raising it to 3.8
// cannot change a single answer. Anything over 1.5 m occludes a 1.62 m eye
// whether it is 2.05 m tall or 3.8 m tall.
//
// The 0.52% is entirely the THIRD branch, the `+0.15` boom clearance, which
// lifts sub-1.5 m furniture across the 1.38-1.62 m band this file sights
// through — a 1.40 m produce table becomes 1.55 m and starts blocking.
//
// So the honest argument for not calling camera.js is not the gantry. It is
// OWNERSHIP: solids() is a private closure with no export, it is authored for a
// boom and not an eye, and its `+0.15` is a clearance margin for a physical
// camera arm that has no meaning for a sightline. Those are reasons that hold
// on any store; the gantry reason only looked like one on this one.
//
// The honest structure is that world.colliders is the ROOT, and three different
// questions each derive their own view of it:
//
//     world.colliders        store.js. The one source of solid geometry.
//       |- agents makeSolids/makeNav   can a BODY walk this line     pad 0.52, no height
//       |- camera.js solids()          can the BOOM swing here       real height, inflated >1.5
//       `- THIS FILE                   can an EYE see along this line real height, pad 0.52
//
// These are siblings, not copies. Nothing here re-derives another one's answer;
// it derives its own from the same root. game.js calls this and hud.js derives
// nothing at all — `canSee` appears in exactly one call site in the whole game
// piece, sightOf() in game.js, and game.js's sightCheck() asserts the rest.
//
// ---- THE CONSTANTS, AND THE FACT THAT TWO OF THEM ARE NOT DIALS -----------
// Measured on the shipped store, front-of-store box, 315 free points / 49,455
// pairs, CONTACT % (pad 0.52):
//
//     eye 1.70 / tgt 1.70    52.65        eye 1.62 / tgt 1.62    52.65
//     eye 1.62 / tgt 1.38    52.65        eye 1.45 / tgt 1.45    52.65
//     eye 1.55 / tgt 1.20    43.92
//
// Byte-identical across the whole head-and-shoulders band, because this store
// has NOTHING between 1.50 and 2.05 m: the answer only moves when the sightline
// is dragged below 1.5 and the four 1.50 m fixtures start cutting it. So EYE_H
// and TGT_H are not tuning knobs on this store and should not be reached for as
// if they were — if a future round wants more or less visibility, the pad is
// the dial and the shelf heights are the world.
export const EYE_H = 1.62;   // the cop's eye, standing
export const TGT_H = 1.38;   // the subject's shoulder line — not the top of his head.
//                       Sighting the last centimetre of somebody's hair is not
//                       seeing him, and the band above says it costs nothing.

// ---- THE PAD IS THE ONE REAL DECISION IN THIS FILE ------------------------
// 0.52 is agents' own body radius, and using the SAME number is the whole
// argument that this round changed one variable. Swept on the shipped store,
// pad against the cross-aisle cliff (aisle band, 769 free points, 1.0 m grid,
// k = how many aisles out the subject is from the cop):
//
//     pad    k0      k1      k2      front-of-store CONTACT
//     0.00   92.18   10.24   4.91    64.63      <- optically pure, and it hands
//     0.15   91.27    7.37   4.01    64.63         the aisle number back: k1
//     0.25   90.48    6.10   3.60    64.63         nearly triples
//     0.35   89.80    5.07   3.16    64.63
//     0.45   84.98    4.22   2.85    64.63
//     0.52   81.10    3.49   2.46    64.63      <- SHIPPED
//     clearSeg today (height-blind, pad 0.52)
//            78.51    3.49   2.46    23.79
//
// CAVEAT ON THE TABLE ABOVE, and it matters: those rows were measured BEFORE
// the end exemption below existed, so they describe an earlier function. They
// are kept because the SHAPE is what the sweep is for — pad is the dial that
// moves the cross-aisle cliff, monotonically, and the front column does not
// move with it at all. The shipped numbers are re-measured further down and in
// the round report; do not quote this table as the current build.
//
// At pad 0.52 the cross-aisle numbers barely move, because every occluder that
// decides a cross-aisle sightline is a 2.05 m gondola and height-awareness
// cannot move a 2.05 m gondola. Re-measured on the shipped predicate, same
// grid: k1 3.62 -> 3.72, k2 2.49 -> 2.61. That is the aisle number staying
// bought. The entire front-of-store gain comes from furniture under 1.6 m, and
// the front of the store is where the chase ends.
//
// Note also that the front column does not move with the pad AT ALL. There is
// nothing over 1.6 m in that strip, so once height is respected there is no
// footprint left for a pad to inflate. The pad buys the aisle cliff and costs
// the endgame nothing, which is the rare case where a constant has no trade in
// it and the sweep is worth printing so nobody re-runs it.
//
// The optical defence of 0.52, since it is not zero: the question is not "does
// a ray reach a mathematical point", it is "can you see the MAN". He is a body
// about a body-radius wide. Requiring the line to clear the shelf by that much
// is requiring you to see him rather than his elbow, and it errs in the honest
// direction — this predicate is a strict subset of the pad-0 optical answer, so
// it never grants sight the geometry does not support.
export const VIS_PAD = 0.52;

// ---- WHAT THE SHIPPED PREDICATE ACTUALLY MEASURES -------------------------
// FRONT-OF-STORE BOX, coordinates published so this is reproducible:
//   x [-23.55, +23.55], z [-19.70, -13.50], 0.8 m grid, nav-free points only.
// The top edge is held 0.5 m clear of z = -13.00 deliberately: that line IS the
// aisle mouth, and a box including it measures gondola ends rather than the
// front of the store. Including it was worth 2,572 spurious reversals.
//   257 points, 32,896 pairs, of which 11,355 (34.5%) are beyond SIGHT_R and
//   therefore NOT recoverable by anything in this file — that population is the
//   20 m sighting limit, it is deliberate, and the bot shares it.
//
//   band        pairs    clearSeg (r12)   this file
//   0-4 m       4,116        71.26%         100%
//   4-8 m       5,674        27.26%         100%
//   8-12 m      4,430        12.33%         100%
//   12-20 m     7,321        10.46%         100%
//
// 100% is not a bug and not a tuned result: there is nothing over 1.6 m tall in
// that strip at all, so once height is respected there is no occluder left. The
// reversed-pair count — clearSeg grants, this file refuses — is 0 of 21,541.
//
// ---- ROUND 14 CORRECTION: "STRICT SUPERSET" IS FRONT-BOX-ONLY ------------
// Round 13 wrote "the shipped predicate is a strict superset of the one it
// replaces" off that 0-of-21,541, with no scope on it. The 0 is real and the
// sentence is not, because the box it was measured in is the box with no tall
// furniture in it. Re-measured in the AISLE BAND, where the gondolas are:
//
//     147 reversals in 140,566 pairs   0.105%     clearSeg grants, this refuses
//     against gains of                 0.973%
//
// The reversals come from `clearSeg`'s grid quantisation, not from height — a
// padded footprint rounded onto its grid can clear a corner this file's
// continuous slab sweep still catches. So the claim that survives is the
// narrow one: a strict superset IN THE FRONT-OF-STORE BOX, and a 9:1 net gain
// in the aisle band with a real 0.105% tail going the other way. The 9:1 is
// the argument. "Strict superset" was a claim about one box wearing the
// clothes of a claim about the store.
//
// THE CLIFF, aisle band, 769 points, 1.0 m grid, 290,972 samples, k = aisles out:
//   k0 85.53 -> 85.17     k1 3.62 -> 3.72     k2 2.49 -> 2.61
// The aisle number is not given back. What movement there is (+0.10, +0.12) is
// the end exemption below, not height.

// Anything whose collider top is below this cannot occlude at eye height, and
// this is the number the census above is quoted against.
const LOOK_OVER = 1.55;

// ===========================================================================
// ROUND 15 — THE END EXEMPTION, AS A NAMED RULE AND ITS TWO REJECTED DRAFTS
// ===========================================================================
// canSee() exempts a bit of the segment at EACH END, and the whole of round 13
// turned on getting that rule right (the argument is in makeSight below). Three
// versions have existed. Until this round only the shipped one was executable,
// so `openPairs` below was validating the fix against nothing — a guard whose
// alternatives cannot be run is a guard that has never been shown to fail.
//
// So the rejected drafts live here, as functions, next to the probe that has to
// catch them. Each returns the fraction of the segment exempt at each end.
//
//   metres   SHIPPED. `pad` metres at each end regardless of length, so the
//            shorter the segment the LARGER the fraction, and at len <= 2*pad
//            the two exemptions meet and nothing can be between the two people.
//   cap45    round 13's first attempt: the same pad/len, CAPPED at 0.45 of the
//            segment. The cap is exactly backwards — it bites hardest on the
//            SHORT segments, which are the ones where nothing can be in the way.
//   none     round 13's other draft, no exemption at all: the pad applies over
//            the endpoints themselves, so a cop standing beside a gondola is
//            inside its padded shell and blind in every direction.
//
// THE ALGEBRA THAT MADE THE OLD PROBE BLIND, stated so it cannot happen twice:
// `metres` and `cap45` are IDENTICAL wherever pad/len <= 0.45, i.e. for every
// segment of len >= pad/0.45 = 1.156 m. The old openPairs' shortest pair was
// 1.5 m, so cap45 scored a perfect 0/208 on it. See openPairs' own note.
export const END_RULES = {
  metres: (pad, len) => pad / len,
  cap45: (pad, len) => Math.min(pad / len, 0.45),
  none: () => 0,
};
// Above pad/0.45 the shipped rule and cap45 are the same function. Published so
// the probe set can assert its own span covers the band where they differ.
export const CAP45_BLIND_ABOVE = VIS_PAD / 0.45;

// ===========================================================================
// ROUND 16 — PAD_PROBES: THE INJECTION FAMILY THAT REACHES THE 'run' PAIRS
// ===========================================================================
// openPairs() carries 112 'run' pairs — straight down the middle of an open
// aisle — and its own comment says what they are for: "a pad grown past the
// half-gap, an inverted height test, or a slab interval with its sense reversed
// all land here first."
//
// NONE OF THOSE WAS EVER INJECTED. Every variant sightVariants() ran was an END
// RULE, and an end rule can only change the answer near an endpoint, which is
// the 'step' geometry. So every caught row in the shipped table was `step`, and
// 112 of the 592 pairs — 19% of the probe set — had never once been shown
// capable of firing. That is the round-15 lesson ("guard the guard's coverage")
// with the coverage hole in the OTHER family: an end-rule-only injection cannot
// distinguish a live run probe from 112 pairs that would pass anything.
//
// The pad is the cheapest of the three shapes to make executable, because it is
// already a NUMBER this file reads and the table in makeSight() below already
// lists four alternative values as measured variants. Round 15's own verdict on
// the end rules applies verbatim: a table in a comment is not a guard.
//
// THE CROSSOVER IS ALGEBRA, NOT A SWEEP, which is what makes this a probe and
// not a fishing trip. A 'run' pair sits on the aisle centre line, AISLE_GAP/2 =
// 2.0 m from either shelf face, so a pad blocks it exactly when
//
//     pad >= AISLE_GAP / 2 = 2.0 m
//
// and a 'step' pair's near end is 0.15 m off the face, so it is inside the
// padded shell from 0.15 m upward and is held clear only by the end exemption.
// The two families therefore separate on this axis by construction, and the
// measured table in sightVariants() must reproduce the 2.0 m boundary. If it
// ever does not, the pad has stopped meaning "inflate the occluder by a body
// radius" and the model is not what this file documents.
//
// 0.25 and 0.00 are the two UNDER-padded rows from makeSight()'s measured table
// (97.53 and 98.25 near-range CONTACT against the shipped 96.22). They are not
// expected to be caught by either probe — an under-padded model sees MORE, and
// openPairs asks for clear — so they are the rows that keep this family honest:
// an injection list in which every row is caught is testing nothing.
export const PAD_PROBES = [0, 0.25, 1.0, 1.9, 2.1, 3.0];

// ---------------------------------------------------------------------------
// makeSight(colliders) — the model. Rebuild it when the store changes shape;
// game.js does that off `count` disagreeing with world.colliders.length, the
// same trigger agents.js uses for its own solids.
// ---------------------------------------------------------------------------
export function makeSight(colliders, opts) {
  const boxes = [];
  const src = colliders || [];
  for (const b of src) {
    if (!b || !b.min || !b.max) continue;
    if (b.max.y < 0.16) continue;        // floor decals — you do not look at the floor
    if (b.min.y > EYE_H) continue;       // hanging signs, light troffers — you look UNDER
    boxes.push({
      x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z,
      y0: b.min.y, y1: b.max.y,
    });
  }
  // ROUND 16 — the pad is selectable, for the same reason round 15 made the end
  // rule selectable: the table 40 lines below lists five measured variants and
  // four of them were prose. `VIS_PAD` is what ships and nothing on the hot path
  // passes this; the ONLY caller is game.js's sightVariants() injection, which
  // is where the probe set is proved capable of failing. See PAD_PROBES.
  const pad = (opts && isFinite(opts.pad)) ? opts.pad : VIS_PAD;

  // Slab sweep, the same shape as camera.js's boomClear and for the same reason:
  // 74 boxes is nothing per frame and a grid would put a discretisation between
  // this answer and the geometry it is supposed to be about. Continuous is also
  // what makes the pad sweep above mean something — on a 0.42 m grid a 0.15 m
  // pad change is mostly a rounding artefact.
  //
  // The height test: the segment runs from EYE_H down to TGT_H, so its height
  // over the crossing interval [t0,t1] is monotone decreasing and its MINIMUM is
  // at t1. A box occludes iff its top reaches that minimum and its bottom is
  // under the maximum — i.e. iff it actually intersects the beam, rather than
  // merely standing under it.
  // ---- AND THE PAD MUST NOT APPLY AT THE ENDS -----------------------------
  // The first version of this had a real bug, and it took a LIVE measurement to
  // find because the geometric sample structurally could not contain it. A pad
  // of 0.52 inflates every occluder by a body radius in all directions — including
  // backwards, over the eye itself. So a cop standing within half a metre of a
  // gondola had that gondola's padded shell covering his own position, the
  // crossing interval started at t=0, and the model called him blind in every
  // direction. He is not blind; the shelf is BESIDE him, not between them.
  //
  // The geometric sweep never saw it because it samples nav.free() points, and a
  // point inside a padded footprint is by definition not nav-free. The cop is
  // there constantly — nav's pad is for ROUTING, while the collision resolver
  // clamps him against the real box — so this was invisible in geometry and
  // everywhere in play. Measured on the live paired ablation, near-range frames:
  //
  //     clearSeg (round 12)      66.39
  //     eye-height, pad at ends  64.30      <- WORSE than the bug it replaced
  //     eye-height, ends exempt  see the round report
  //
  // A predicate that scored under the thing it was fixing is the whole reason
  // this file carries a live paired counter and not just a geometry table.
  //
  // The exemption is METRES, not a fraction, and getting that wrong cost a
  // measurement. The first attempt exempted `pad/len` capped at 0.45 of the
  // segment, and the cap is exactly backwards: the shorter the segment, the LESS
  // of it got exempted, when a short segment is the case where nothing can be
  // between the two at all. Live diagnosis, one shift, every frame where the old
  // predicate granted CONTACT and this one refused — 695 frames, and the blocker
  // was a 2.05 m gondola run in 695 of 695, with 515 of them under 4 m and the
  // padded shell reaching t1 = 1.00. In plain terms: the subject standing beside
  // a shelf, 0.8 m from the cop, was being hidden BY THE SHELF HE WAS STANDING
  // NEXT TO, at the exact moment of the catch.
  //
  // So: exempt `pad` metres at each end, and if the whole segment is shorter than
  // two of those, return true — two people inside two body radii of each other
  // have nothing between them by definition. Measured live, one shift, 19,511
  // frames inside SIGHT_R, all four variants evaluated on the SAME frames:
  //
  //                                     all <20 m   near <8 m
  //     clearSeg (round 12)               87.51       88.11
  //     pad 0.52, fractional cap 0.45     89.76       89.05   <- the bug above
  //     pad 0.52, 0.52 m at each end      96.22       95.96   <- SHIPPED
  //     pad 0.25, 0.52 m at each end      97.53       97.36
  //     pad 0.00                          98.25       98.13
  //
  // The last two rows are why the pad stays at 0.52: dropping it buys two more
  // points of endgame and costs 3x on the cross-aisle cliff (see the sweep
  // above). The end exemption buys eight, and costs the cliff almost nothing.
  // ROUND 15: the rule is a named function now, so the two rejected drafts above
  // are executable and openPairs can be shown catching them. Ship passes nothing
  // and gets `metres`; the ONLY other caller is the injection in game.js's
  // clearProbe/evasionProbe verification. It is not a tuning dial and there is
  // no TUNING entry for it — one owner, three named values, selected by name.
  const endRule = (opts && opts.end && END_RULES[opts.end]) || END_RULES.metres;
  const endName = (opts && opts.end && END_RULES[opts.end]) ? opts.end : 'metres';
  function canSee(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const len = Math.hypot(dx, dz) || 1e-6;
    // The fraction exempt at EACH end. At e >= 0.5 the two exemptions meet and
    // there is no live interval left, which is the same statement as the old
    // `len <= 2 * pad` short-circuit and is now where it belongs: a property of
    // the rule, not a second special case beside it. It has to be an explicit
    // return — with e >= 0.5 the interval test below reads (e, 1-e) backwards
    // and starts granting occlusion again, which is how a "shorter is safer"
    // rule would have quietly inverted itself.
    const e = endRule(pad, len);
    if (e >= 0.5) return true;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      let t0 = 0, t1 = 1;
      if (dx > -1e-9 && dx < 1e-9) {
        if (ax < b.x0 - pad || ax > b.x1 + pad) continue;
      } else {
        let p = (b.x0 - pad - ax) / dx, q = (b.x1 + pad - ax) / dx;
        if (p > q) { const s = p; p = q; q = s; }
        if (p > t0) t0 = p;
        if (q < t1) t1 = q;
        if (t0 > t1) continue;
      }
      if (dz > -1e-9 && dz < 1e-9) {
        if (az < b.z0 - pad || az > b.z1 + pad) continue;
      } else {
        let p = (b.z0 - pad - az) / dz, q = (b.z1 + pad - az) / dz;
        if (p > q) { const s = p; p = q; q = s; }
        if (p > t0) t0 = p;
        if (q < t1) t1 = q;
        if (t0 > t1) continue;
      }
      if (!(t1 > e && t0 < 1 - e)) continue;   // beside an endpoint, not between
      const hMin = EYE_H + (TGT_H - EYE_H) * t1;
      const hMax = EYE_H + (TGT_H - EYE_H) * t0;
      if (b.y1 >= hMin && b.y0 <= hMax) return false;
    }
    return true;
  }

  let tall = 0;
  for (const b of boxes) if (b.y1 >= LOOK_OVER) tall++;
  return {
    canSee, boxes, pad, eye: EYE_H, tgt: TGT_H,
    end: endName,                 // which end rule this model was built with
    padded: pad !== VIS_PAD,      // ...and whether it is the shipped body radius
    count: src.length,            // colliders IN, so a store edit is detectable
    occluders: boxes.length,      // colliders that can occlude anything
    tall,                         // ...of which are tall enough to occlude an EYE
  };
}

// ---------------------------------------------------------------------------
// gondolaPairs(cfg) — THE UNCONDITIONAL EVASION PROBE'S INPUT
// ---------------------------------------------------------------------------
// Round 12 shipped an always-true guard that was conditional on the shape of
// the bug: `sight.contactPct` reading 100.0 was supposed to be the tell for a
// predicate edited into always-true. Its first unseeded always-true run read
// 79.5% — indistinguishable from a healthy build — because CONTACT is
// `predicate && d < SIGHT_R` and the RANGE TERM alone holds it off 100. A guard
// that only fires when a second, unrelated term happens not to mask it is not a
// guard.
//
// So probe the predicate directly, on geometry whose answer is known from the
// floor plan rather than from a measurement: put the two endpoints in ADJACENT
// AISLES at the same z, mid-run. Between them is a full 2.05 m gondola, which
// is over eye height under every constant in this file, so the honest answer is
// BLOCKED for every pair and any build that clears one has a broken predicate.
//
// The z values matter and are the reason this list is hand-built rather than
// swept. Every cross-aisle sighting in this store comes from ONE place: hits by
// cop-z at k=1 are 238 at z = -0.70 and 28 at z = +2, and zero anywhere else;
// at k=2, 161 at z = -0.70 and zero elsewhere. That is MID_WALK_Z, the mid-store
// cross-aisle — the 2.4% is not diffuse leakage through shelving, it is one
// doorway. A probe that sampled z uniformly would therefore be sampling the one
// legitimate hole and calling a healthy build broken, so these z values are
// chosen to sit clear of the mid walk and of both end mouths.
export function gondolaPairs(cfg) {
  const { aisleX, AISLE_COUNT, AISLE_LEN, MID_WALK_Z } = cfg;
  const half = AISLE_LEN / 2;
  const out = [];
  // Well inside the run at both ends, and never within 2.5 m of the mid walk.
  const zs = [-half + 3.0, -half + 6.5, -half + 9.5, MID_WALK_Z - 4.0,
    MID_WALK_Z + 4.0, half - 9.5, half - 6.5, half - 3.0];
  for (let i = 0; i + 1 < AISLE_COUNT; i++) {
    for (const z of zs) {
      if (Math.abs(z - MID_WALK_Z) < 2.5) continue;
      if (Math.abs(z) > half - 1.0) continue;
      out.push({ ax: aisleX(i), az: z, bx: aisleX(i + 1), bz: z, k: 1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// openPairs(cfg) — THE PROBE FOR THE OTHER DIRECTION
// ---------------------------------------------------------------------------
// gondolaPairs() above catches a predicate edited into ALWAYS-TRUE: pairs whose
// honest answer is BLOCKED, so any that come back clear condemn the build. It
// is a good guard and it is only half of one, and the missing half is not
// hypothetical — IT IS THE FAILURE THAT ACTUALLY HAPPENED IN ROUND 13.
//
// The pad-at-the-endpoints draft documented in makeSight() below scored 64.30
// against the 66.39 of the predicate it was replacing: a cop standing within a
// body radius of a gondola had that gondola's padded shell over his own
// position and was called blind IN EVERY DIRECTION. Nothing in this file would
// have said a word. gondolaPairs() passes an over-blocking build perfectly —
// every pair is blocked, which is exactly what it demands. The round's own
// note says assertions get written for the bug you just fixed; this is the one
// that was missing, written for the bug that was actually had.
//
// So: pairs whose honest answer is CLEAR, off the floor plan, in the two shapes
// an over-blocking predicate breaks.
//
//   'run'    down the middle of an aisle. AISLE_GAP is 4.0 m, so the centre
//            line is 2.0 m from either shelf face and the shipped 0.52 m pad
//            leaves 2.96 m of corridor. Nothing in this store stands in an
//            aisle. If a sightline straight down an open aisle comes back
//            blocked, the predicate has stopped being about geometry — a pad
//            grown past the half-gap, an inverted height test, or a slab
//            interval with its sense reversed all land here first.
//
//   'step'   across the aisle with ONE END 0.15 m off the shelf face, i.e. a man
//            standing against the shelving looking out into his own aisle. This
//            is the endpoint case precisely: the near end sits INSIDE the padded
//            shell, and it is clear only because the END exemption releases
//            `pad` metres at each end. Remove that exemption and every one of
//            these blocks. It is the round-13 bug's own geometry, and it is the
//            reason this list is not just centre lines.
//
// ===========================================================================
// ROUND 15 — THIS PROBE WAS BLIND EXACTLY WHERE THE PREDICATE DECIDES
// ===========================================================================
// The step family used to be ONE separation, 1.5 m, and that made the whole
// probe blind to the very draft it is written about. `metres` and `cap45` are
// the SAME FUNCTION for every segment of len >= pad/0.45 = 1.156 m (see
// END_RULES). The shortest pair in either probe set was 1.5 m, so:
//
//     cap45 — the over-blocking bug this file documents at greatest length —
//     scored 0 of 208 on openPairs and 0 of 56 on gondolaPairs. It passed
//     both guards perfectly. NOT ONE PAIR IN THE REPO COULD SEPARATE IT.
//
// And the band it was blind in is not an edge case: pad/0.45 = 1.156 m sits
// INSIDE the 1.15 m catch radius. The guard stopped looking at the arrest.
//
// So the step family is now swept over separation, deliberately spanning the
// crossover. Measured on the shipped store (the numbers are re-measured live in
// game.js's sightVariants() and reported every round, not left to this comment):
//
//     step d    shipped   cap45      what the two rules do at that length
//     0.4 m     clear     BLOCKED    e: 1.30 vs 0.45 — exemptions meet vs 10%
//     0.6 m     clear     BLOCKED    e: 0.87 vs 0.45   of the segment live
//     0.8 m     clear     BLOCKED    e: 0.65 vs 0.45
//     1.0 m     clear     clear      e: 0.52 vs 0.45 — differs, but the padded
//                                    shell no longer reaches the live interval
//     1.5 m     clear     clear      e: 0.347 — IDENTICAL rules from here up
//
// 1.0 m is kept precisely because it is the row where the two rules still
// differ and the answer does not: a probe that spans a crossover should contain
// the point where the difference stops mattering, or the next reader cannot
// tell a real boundary from the edge of the sample.
//
// ---- AND IT IS VERIFIED UNDER INJECTION, NOT ASSUMED ---------------------
// A probe nobody has seen fail is not a guard. Round 13's endpoint bug was
// rebuilt against the shipped box set (same boxes, same pad, END forced to 0)
// and both probes run against all three builds:
//
//     build                        openPairs blocked   gondolaPairs clear
//                                  (must be 0)         (must be 0)
//     SHIPPED, END = pad                  0                   0
//     round 13's END = 0                 84  <- all 'step'    0  <- PASSES
//     predicate forced always-true        0                  56  <- CAUGHT
//
// The middle row is the whole argument. The over-blocking draft that actually
// shipped-and-was-reverted scores PERFECTLY on the evasion probe — of course it
// does, that probe asks for blocking and an over-blocker blocks — and this one
// catches 84 of 208. The two are complementary and neither substitutes for the
// other: each is blind to precisely the failure the other is for. All 84 are
// 'step' pairs, which is the geometry the bug lived in.
//
// What is deliberately NOT in here: a long pair hugging a shelf face for its
// whole length. That one is BLOCKED on a healthy build and legitimately so —
// the pad's stated meaning is that you must clear the shelf by a body radius to
// have seen the man rather than his elbow — and a probe demanding it be clear
// would be asserting the pad away. The exemption is metres at the ENDS; it is
// not a licence to see along a shelf face.
// Step separations, in metres. Three under CAP45_BLIND_ABOVE (1.156), one just
// over it, and the original 1.5. openPairs asserts the span itself rather than
// trusting this list to stay right — see spanOK on the returned array.
const STEP_D = [0.4, 0.6, 0.8, 1.0, 1.5];

export function openPairs(cfg) {
  const { aisleX, AISLE_COUNT, AISLE_LEN, AISLE_GAP, MID_WALK_Z } = cfg;
  const half = AISLE_LEN / 2;
  const halfGap = AISLE_GAP / 2;
  const out = [];
  const zs = [-half + 3.5, -half + 8.0, MID_WALK_Z - 4.5, MID_WALK_Z + 4.5,
    half - 8.0, half - 3.5];
  for (let i = 0; i < AISLE_COUNT; i++) {
    const cx = aisleX(i);
    // 'run': straight down the open corridor, at three separations.
    for (const z of zs) {
      for (const d of [2.5, 5.0, 9.0]) {
        const z2 = z + d;
        if (Math.abs(z2) > half - 1.0) continue;
        out.push({ ax: cx, az: z, bx: cx, bz: z2, kind: 'run' });
      }
    }
    // 'step': off the shelf face, out into the aisle, both sides, swept over
    // separation so the set spans pad/0.45 — see the ROUND 15 note above. The
    // near end is always 0.15 m off the face; `d` is how far out the other man
    // is standing. Two people 0.4 m apart in an open aisle have nothing between
    // them under any reading of a floor plan.
    for (const z of zs) {
      for (const s of [-1, 1]) {
        for (const d of STEP_D) {
          out.push({ ax: cx + s * (halfGap - 0.15), az: z,
            bx: cx + s * (halfGap - 0.15 - d), bz: z, kind: 'step', d });
        }
      }
    }
  }
  // ---- AND THE PROBE STATES ITS OWN SPAN -----------------------------------
  // The defect this round fixed was not a wrong pair, it was a MISSING RANGE,
  // and nothing in the file said what range it needed to cover. So the set
  // carries its own shortest segment and game.js's sightCheck() asserts that it
  // still reaches under CAP45_BLIND_ABOVE. Trim STEP_D and the assertion fires;
  // a comment saying "keep some short ones" would not have.
  out.minLen = out.reduce((m, p) =>
    Math.min(m, Math.hypot(p.bx - p.ax, p.bz - p.az)), Infinity);
  return out;
}
