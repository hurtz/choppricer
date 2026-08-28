// OWNER: builder-store. Packaging atlases — the round-2 rewrite.
//
// WHY THIS FILE EXISTS
// A blind critic called 4/4 renders as CG in under a second and said every call
// was made "from the packaging alone". Round-1 facings were a flat colour field
// plus two-to-four grey bars: wrong spatial frequency, nowhere near enough
// contrast. A real carton face is 40-70% white stock carrying a heavy wordmark,
// a serving-suggestion photo, a net-weight line and six-to-ten lines of tiny
// legal type. That is what gets drawn here, with real fillText glyphs.
//
// MASK CHANNEL CONTRACT  (raw texture, NoColorSpace — see chopPackageMat)
//   r  brand-colour amount.  0 = bare white stock, 255 = full per-instance brand
//   g  print brightness.     0 = ink black, 255 = paper white
//   b  food-photo tint. Four 64-wide bands, each ramping 0 -> full strength:
//        0..63 golden (grains, crackers, nuts)   64..127  green (vegetables)
//      128..191 red (tomato, berry, meat)       192..255  cream (corn, cheese)
//      Encoded with foodB(band, amount) below; decoded in chopPackageMat.
//
// One atlas per package family, per-instance UV offset picks the cell. That
// keeps 24 carton designs x unlimited brand colours at ONE draw call per batch
// instead of one geometry clone per design.

import { makeRng, rr, ri } from './kit.js';
import {
  FACE, BRANDS, VALUE_BRANDS, BURST, TAG_DESC,
  LEGAL_SETS, copyFor, copyForSku, copyCheck, displayCheck, SKUS,
} from './brands.js';
// ROUND 17 — the atlas grids and the per-cell product now come from plan.js.
// See its header: the pipe was 48 cells and the deal inside it was a random
// draw with replacement, and widening one without fixing the other buys the
// square root of what you pay for.
import { ATLAS, ATLAS_ORDER, PLAN, planStats } from './plan.js';
export { ATLAS };
// ROUND 16 — WHAT IS PICTURED. See the header of depict.js: r15's critic scored
// 36/36 and said the call was semantic — "every photograph call came off
// recognising something real". foodPhoto() below drew the same heap of ellipses
// on flour, on tuna and on kettle chips, because its only inputs were a layout
// index and a hue band. depict() draws the product.
import { depict, depictCheck, foodB, MOTIF, windowSnapshot } from './depict.js';
// ROUND 22 — THE PRESS. See src/store/press.js: every band, plate, ribbon and
// rule in this file was drawn in ink(r, g), i.e. the ONE per-instance brand
// hue at some brightness, so a face carried exactly one chromatic ink. The
// b-channel spot inks the shader has decoded since round 5 were written only
// inside depict(). PRESS.on is the dial, and it is off-by-default-identical:
// press.js draws from its own per-cell rng so this file's generator stream is
// unmoved either way, which is what makes the A/B a single variable.
import {
  PRESS, setPress, livery, pressCarton, pressPouch, pressCanPanel, pressBandInk,
  inkCensus, decodeSelfTest, cfgCheck, pressInk, pressTone, pressGloss,
} from './press.js';
export { PRESS, setPress };
const MOTIF_OF = (d) => MOTIF[d] || null;

// ROUND 15. Every band of copy on a facing now comes from copyFor(), which is
// the one owner of "what words go on a package" — see the header of brands.js
// for what was wrong (category-, food- and FORM-incoherent copy, three
// independent axes) and what the table replaces. FLASH / SUBDESC / CLAIMS /
// WEIGHTS / NUTRI / PANEL_HEAD are no longer imported here, deliberately: the
// failure mode was that they were reachable, and each atlas reached.
//
// The check runs at module load and THROWS. A silent fallback is exactly how
// the defect survived fourteen rounds, and a package atlas that cannot be built
// correctly should take the page down where the watch will see it, not print
// honey facial tissue.
//
// ROUND 16 — copyCheck() now DRIVES copyFor and reads the printed text back,
// rather than asking whether a SKU has a class. ~31 ms for 3,240 draws at load;
// the exhaustive 169k-tuple form is copyCheck(null, true) and runs from
// tools/copyaudit.mjs, which also runs copyCheckSelfTest(). Deleting one line
// from pickBand — the tag accumulation the whole mechanism turns on — produces
// 116 named complaints here instead of the silence the r15 version gave.
{
  const bad = copyCheck();
  if (bad.length) throw new Error('brands.js copy table: ' + bad.join(' | '));
  // Same contract, same reason: a SKU with no motif would silently fall back to
  // the r15 heap of ellipses, which is the one failure mode that would be
  // invisible in a screenshot and would undo the whole round.
  const nom = depictCheck(SKUS.map((r) => r[0]));
  if (nom.length) throw new Error('depict.js motif table: ' + nom.join(' | '));
  // ROUND 17 — the DISPLAY-TYPE axis, which copyCheck() correctly does not
  // cover. See displayCheck()'s header in brands.js: a flash flag contradicting
  // the product noun is a band clashing with the SKU ROW, not with another
  // band, and r16's critic measured it at 3.04% of facings in the two largest
  // pieces of type on the pack. Same contract as the other two: it throws.
  const dsp = displayCheck();
  if (dsp.bad.length) throw new Error('brands.js display type: ' + dsp.bad.join(' | '));
}

// ROUND 16 — WHAT EACH CELL ACTUALLY DREW.
// The four atlases are built from one seeded rng, so nothing outside this file
// could say which product landed in which cell — which made a facing sheet
// impossible to label, and made "is the picture the right object?" unanswerable
// without reading pixels. Every atlas now records its cells here. It is a debug
// ledger, not a contract: store.js does not read it.
export const CELL_LOG = [];
// ROUND 17 — it RETURNS the entry, and it records the PHOTO BOX.
// Two instrument faults in the r16 ledger, both found by trying to build a
// facing sheet off it. The pouch atlas logged `brand: null` while drawing a
// real brand, so any brand count taken off CELL_LOG under-reported by the whole
// pouch family. And nothing recorded WHERE on the cell the depiction was
// drawn, so a sheet wanting to crop the motif at chase range had to guess the
// box — which is how the r16 sheet came to decode cells with a brand colour
// picked by column index instead of the one the cell is drawn with.
// The brand is filled in after the fact rather than moved earlier, so the rng
// stream — and therefore every cell's artwork — is unchanged by the fix.
// PROBE MODE. sheet.js's ablation re-bakes an atlas twice on a live page to
// diff the depictions in and out. Those bakes must leave NO TRACE: no CELL_LOG
// entries (the ledger describes the store, not the probe) and no re-run of the
// bake check (which would then see 96 carton cells in a 48-cell grid and throw,
// which is exactly what it did the first time this was tried).
const PROBE = { on: false };
export function setPackProbe(on) { PROBE.on = !!on; return PROBE.on; }

const logCell = (atlas, i, cp, brand) => {
  const e = {
    atlas, i, desc: cp.desc, cls: cp.cls, dept: cp.dept, food: cp.food, brand,
    motif: MOTIF_OF(cp.desc), flash: cp.flash, sub: cp.sub, claim: cp.claim,
    wt: cp.wt, badge: cp.badge ? cp.badge.join(' ') : null, panel: cp.panel,
    photo: null,
  };
  if (!PROBE.on) CELL_LOG.push(e); else PROBE_LOG.push(e);
  return e;
};
// ROUND 18 — the PROBE's own ledger. sheet.js re-bakes an atlas to ablate the
// depictions, and may now re-bake it at ANOTHER CELL RESOLUTION to price the
// round's resize as a paired figure. The photo box logged by logPhoto() is in
// CELL-LOCAL PIXELS, so a box recorded during the load-time bake is in the
// wrong units for a canvas baked at a different size — which is precisely the
// defect this whole round is about, appearing in the instrument that measures
// it. The first attempt read rec.photo from CELL_LOG against a 340 px canvas
// and returned 2/113 cells at the coverage clamp instead of 103/113.
export const PROBE_LOG = [];
export function clearProbeLog() { PROBE_LOG.length = 0; }
// Record the depiction's box in CELL-LOCAL pixels, so a sheet can crop exactly
// the region depict() drew into without re-deriving any layout arithmetic.
const logPhoto = (e, cx, cy, rw, rh) => { if (e) e.photo = { cx, cy, rw, rh }; };

// ROUND 17 — THE BAKEDNESS ASSERTION, AND WHY IT LIVES HERE AND NOT IN
// depict.js OR plan.js.
//
// depictCheck() asserted every SKU has a motif and every motif has a SKU, and
// passed at 100% while 51 of 81 motifs were never drawn on anything. plan.js's
// planStats() would have caught THAT — but it is still a check on a table, and
// a table is what round 16 was already checking. The artefact the player sees
// is the four baked canvases, and the only record of what actually went onto
// them is CELL_LOG, written one entry per cell BY THE DRAWING CODE.
//
// So the check reads CELL_LOG, and it fires from inside the atlas builders
// themselves. AGENTS_BRIEF, on the FOOTSTEPS banner: "a helper written to
// prevent a bug does not prevent it; a helper that is CALLED does." An atlas
// that is baked at all is an atlas that has registered; when the last of the
// four registers, bakeCheck() runs and throws. store.js calls packCheck() as
// well, as a belt — but forgetting that call can no longer hide anything.
const BAKED = new Set();
export function bakeCheck() {
  const bad = [];
  const drawn = new Map();          // motif -> cells that drew it
  for (const c of CELL_LOG) {
    if (!c.motif) { bad.push(c.atlas + '#' + c.i + ' "' + c.desc + '" baked with NO motif'); continue; }
    (drawn.get(c.motif) || drawn.set(c.motif, []).get(c.motif)).push(c.atlas + '#' + c.i);
  }
  // (1) BAKEDNESS, and the assertion itself lives in depict.js where the motif
  // table does — this passes it the set of motifs that reached a canvas, which
  // is the argument r16's depictCheck() did not take. One owner for "is every
  // motif accounted for", two stages of evidence fed into it.
  bad.push(...depictCheck(SKUS.map((r) => r[0]), new Set(drawn.keys())));
  // (2) The plan promised a product per cell; the bake has to have honoured it.
  // Catches a builder that goes back to copyFor() and starts drawing at random.
  for (const atlas of ATLAS_ORDER) {
    const A = ATLAS[atlas];
    const got = CELL_LOG.filter((c) => c.atlas === atlas);
    if (got.length !== A.cols * A.rows) {
      bad.push(atlas + ' baked ' + got.length + ' cells, grid is ' + (A.cols * A.rows));
      continue;
    }
    for (const c of got) {
      const p = PLAN[atlas][c.i];
      if (!p) { bad.push(atlas + '#' + c.i + ' has no plan entry'); continue; }
      if (p.desc !== c.desc) {
        bad.push(atlas + '#' + c.i + ' baked "' + c.desc + '", plan says "' + p.desc + '"');
      }
    }
  }
  return bad;
}
// Called at the end of every *Atlas(). The check needs all four, so it only
// bites on the last one — but it cannot be skipped without skipping an atlas.
let CHECKED = false;
function registerBake(name) {
  if (PROBE.on) return;
  BAKED.add(name);
  if (BAKED.size < ATLAS_ORDER.length || CHECKED) return;
  CHECKED = true;
  const bad = bakeCheck();
  if (bad.length) {
    throw new Error('pack.js bake: ' + bad.length + ' fault(s) — ' + bad.slice(0, 8).join(' | '));
  }
}
// The belt. store.js calls this after building all four atlases; it also
// reports, which is what the round quotes. AGENTS_BRIEF: "if you build an
// instrument for your feature, quote its reading in your report."
export function packCheck() {
  const bad = bakeCheck();
  if (bad.length) throw new Error('pack.js bake: ' + bad.join(' | '));
  const motifs = new Set(), descs = new Set(), brands = new Set();
  for (const c of CELL_LOG) { if (c.motif) motifs.add(c.motif); descs.add(c.desc); if (c.brand) brands.add(c.brand); }
  return {
    // The rim telemetry, snapshotted HERE because this runs once directly after
    // the four real bakes. See depict.js's windowSnapshot().
    rims: windowSnapshot(),
    cells: CELL_LOG.length,
    motifsBaked: motifs.size,
    motifsPossible: planStats().motifsPossible,
    nounsBaked: descs.size,
    nounsPossible: SKUS.length,
    brandsBaked: brands.size,
    plan: planStats(),
  };
}
// Proof the check FIRES, run from tools/planaudit.mjs and from the r17 report.
// It orphans one motif by deleting every cell that drew it and asserts the
// complaint names it. AGENTS_BRIEF: "an assertion that has never fired is not
// evidence of correctness — test it by breaking the thing it guards."
export function bakeCheckSelfTest() {
  const out = [];
  const keep = CELL_LOG.slice();
  const clean = bakeCheck();
  out.push(['healthy tree is silent', clean.length === 0, clean.slice(0, 3).join(' | ')]);
  for (const victim of ['peachHalf', 'spaghetti', 'toothpaste', 'babyFace']) {
    CELL_LOG.length = 0;
    for (const c of keep) if (c.motif !== victim) CELL_LOG.push(c);
    const bad = bakeCheck();
    out.push(['orphaning ' + victim + ' fires',
      bad.some((s) => s.includes('"' + victim + '"') && s.includes('ORPHANED')),
      bad.filter((s) => s.includes('ORPHANED')).join(' | ') || '(silent)']);
  }
  // and the plan-drift direction, which is the other way this can go wrong
  CELL_LOG.length = 0;
  for (const c of keep) CELL_LOG.push(c);
  const swap = CELL_LOG[0].desc;
  CELL_LOG[0] = { ...CELL_LOG[0], desc: 'NOT A REAL PRODUCT' };
  const bad2 = bakeCheck();
  out.push(['a cell drifting off the plan fires',
    bad2.some((s) => s.includes('plan says "' + swap + '"')), bad2[0] || '(silent)']);
  CELL_LOG.length = 0;
  for (const c of keep) CELL_LOG.push(c);
  return out;
}

// --- atlas grid descriptors -------------------------------------------------
// MOVED r17 to plan.js and re-exported above, unchanged in shape so store.js
// still reads PK.ATLAS. Round 3's note stands and is why the CELL pixel sizes
// did not move this round: "every cell is 25-33% larger — at 3x zoom on a
// package a metre from camera the round-2 cells ran out of texels below the
// wordmark, and a legible logo over an illegible panel reads as MORE artificial
// than a blank one." Round 17 changed the cell COUNT and nothing about the
// cell SIZE, deliberately: shrinking cells to fit more of them would have
// bought coverage by spending the legibility round 3 paid for.

// Shelf-tag atlas cells 13-15 are ORPHANS: an empty channel, a bleached blank
// and a torn remnant. products.js asks for one wherever it leaves a bare bay.
export const TAG_SKU = 13, TAG_COLS = 4, TAG_ROWS = 4;

// ROUND 19 — every atlas canvas in this file is born audited. Instrumenting the
// four bakes by hand would have covered exactly the four atlases somebody
// remembered, which is precisely the failure r18's critic found one layer up in
// setTypeCtx. Auditing at the one place a drawing surface is created means a
// fifth atlas added next round is inside the count on the day it is written.
// The wrapper is bound to the ctx OBJECT, never the prototype, so it cannot see
// the CCTV wall, the HUD or any other canvas in the page.
function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  armTypeAudit(g);
  return [c, g];
}
const ink = (r, g, b = 0) => `rgb(${r | 0},${g | 0},${b | 0})`;
const rgba = (r, g, b, a) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;
const pk = (rng, a) => a[Math.floor(rng() * a.length) % a.length];

// Pack a food-palette band + strength into one byte for the mask's b channel.
// foodB now lives in depict.js and is imported above — CLAUDE.md's one-owner
// rule. It was defined here and re-derived there while depict.js was being
// written, which is exactly the "deliberate duplication with a comment
// explaining itself" this project has been bitten by twice.
export { foodB };

// RETIRED r16 — foodBand(desc). It classified a product noun into one of the
// four palette bands by regex, and its measurement note stands and is why the
// four bands exist at all: "canned peas coming out green and tomato paste
// coming out red is most of what stops a shelf reading as one repeated brown
// blob." Its regexes routed GREEN|PEAS|BROCCOLI|BEAN|LIME -> green,
// TOMATO|SALSA|BERRY|BEEF|CHILI|PEPPERONI -> red, and
// CORN|CHEESE|LEMON|VANILLA|PEACH|RICE|PASTA -> cream, everything else golden.
//
// It is gone because depict.js chooses a hue PER MARK rather than per facing: a
// peach half is golden with a red hollow and a green leaf, and one band for the
// whole picture was the constraint that made every serving suggestion a
// monochrome smear. Nothing calls it.

// ---------------------------------------------------------------------------
// TYPE HELPERS
// Grocery wordmarks are almost always squeezed to fill the panel width, so
// horizontal-scale-to-fit is the correct behaviour, not a smaller point size.
//
// =========================================================================
// ROUND 18 — THE LEGIBILITY LEDGER, AND WHY IT IS ON THE g CHANNEL ONLY.
//
// Three rounds have now shipped a wordmark that cannot be read:
//
//     r16  CORNERSTONE ALLERGY RELIEF   white caplet on white stock
//     r17  PENNYWHISTLE                 thin cream serif italic on a cream pack
//     r17  WINDROW COUGH SYRUP          ghosted white type inside frosted glass
//     r17  MERRIWEATHER ENERGY DRINK    light orange on orange
//
// Each was found by eye, fixed on that SKU, and reappeared on another. That is
// AGENTS_BRIEF's "an assertion gets written for the bug you just fixed" — the
// fixes were per-cell and the defect is structural.
//
// THE STRUCTURE. chopPackageMat decodes a texel as
//
//     base   = mix( uPkgStock, vColor, chopM.r )        r = how much BRAND
//     albedo = base * ( 0.045 + 0.955 * chopM.g )       g = print BRIGHTNESS
//
// so the r channel only chooses between two colours whose luminances are
// whatever the per-instance brand happens to be, and the g channel is a
// straight multiplier. Type that differs from its ground ONLY in r has a
// contrast of luma(brand)/luma(paper) — which is a real contrast for a navy
// brand and exactly zero for a cream one. Every one of the four failures above
// is that shape: plate ink(255,232) with type ink(14,250) is a 7% luminance
// step in the worst case and a fine one in the best.
//
// So the guarantee has to be taken on g, where it holds for EVERY brand
// colour, and the check has to run over every wordmark rather than over the
// SKUs somebody remembered. fitText samples the ground it is about to draw on
// straight off the canvas — no declared region, no table of what is under what
// — records it with the ink, and typeCheck() reports the worst-case step.
const TYPE_LOG = [];
let TYPE_CTX = null;

// ===========================================================================
// ROUND 19 — `mode`, AND THE AUDIT THAT COUNTS DRAW CALLS.
//
// r18's critic broke this check without touching a pixel: `setTypeCtx` was
// called for four atlases, so the shelf-tag atlas — the price rail, item #4 on
// AGENTS_BRIEF's bar — sat entirely outside the guarantee. Ten raw `fillText`
// sites including the price numerals, and a `fitText('CLEARANCE')` whose
// contrast step silently no-opped because TYPE_CTX was null. It contributed
// 0 of 688 logged runs. The self-test was honest and the coverage was fiction.
//
// TWO CHANGES, AND THE SECOND IS THE ONE THAT GENERALISES.
//
// 1. `mode`. The four mask atlases encode print brightness in the g channel and
//    the shader decodes `albedo = base * (0.045 + 0.955*g)`, so their contrast
//    lives on g and nowhere else. The tag atlas is a PLAIN sRGB CanvasTexture
//    drawn straight — its ink is a literal colour. Running the g-channel
//    formula over it would have been a number about the wrong quantity, which
//    is how this project has retired nine statistics. So the ledger records
//    which contrast model a run belongs to and typeCheck applies that one.
//
// 2. THE AUDIT. Extending coverage by hand fixes today's gap and leaves the
//    next one open: nothing would notice a new atlas, or a new raw fillText in
//    an old one. So the bake now runs inside `withTypeAudit`, which counts
//    every fillText and strokeText THE CANVAS ACTUALLY RECEIVES, on the ctx
//    object itself rather than on the prototype (so it structurally cannot see
//    the CCTV wall or any other canvas), and typeCheck fails when a string was
//    inked that the ledger never saw. Grep finds the sites you can name; a
//    draw-call count finds the ones you cannot — the same argument as r15's
//    ink ledger, applied one surface along.
// AND IT HAS TO KNOW WHAT IT IS LOOKING AT, OR IT CRIES WOLF. These atlases
// deliberately ink hundreds of strings nobody is meant to read: legalBlock's
// ingredients columns at 4-6 px in a 340 px cell, barcode digits, panel rules.
// Guaranteeing contrast on those would be wrong — the whole point of the legal
// block is that it is dense luminance noise, and a check that complains about
// 700 of them is a check people switch off. AGENTS_BRIEF: "a checker that cries
// wolf gets ignored, which is worse than not having one."
//
// So the audit records the SIZE each string was inked at, from the ctx's own
// font string, and only strings at or above DISPLAY_PX are held to the
// guarantee. Everything is counted and reported either way, so the split is
// visible rather than assumed. 10 px in the cell is the line: at the 340 px
// carton cell and the 84-110 px a facing subtends at its very largest
// (aniso.js facingPx), 10 px of cell is under 3 px on screen — the size at
// which a real photograph has already lost the word.
export const DISPLAY_PX = 10;
const AUDIT = { on: false, big: 0, small: 0, viaFit: 0, sites: [], viaFitNow: false };
const fontPx = (f) => { const m = /(\d+(?:\.\d+)?)px/.exec(String(f)); return m ? +m[1] : 0; };

// ===========================================================================
// ROUND 20 — THE PLATE LEDGER. TYPESET IS NOT PAINTED, ON THIS SURFACE TOO.
//
// r19 drew the flash line at cx 96 with maxW 0.56 of a 192 px cell and then
// drew the barcode's opaque plate from x 126.72. Measured exactly, off the live
// font metrics rather than off a screenshot: 17 OF 24 can cells ran their flash
// string under that plate, by 4.7 to 23.0 px — FRENCH STYLE, TRADITIONAL,
// HONEY ROASTED, DOUBLE CHOCOLATE — and the plate is drawn last, so the tail of
// the word is gone. shots/r20p_canatlas_g.png is the r19 bake and shows it.
//
// typeCheck() could not see this and never could: it is a CONTRAST check, and
// the contrast of a glyph that has been painted over is not the question.
// AGENTS_BRIEF, on two rounds of HUD width-auditing that missed the same class:
// "what erases words is ctx.fillRect... when you build an instrument to catch a
// class of defect, enumerate every mechanism in that class first."
//
// So this records the RECTANGLES as well as the strings, on the ctx object (so
// it structurally cannot see the CCTV wall, the HUD or the offscreen composite),
// and reports an opaque source-over rect drawn AFTER a display-size string that
// covers part of its box. Effective alpha is globalAlpha TIMES the alpha in the
// fill string — the naive globalAlpha test gets that exactly backwards — and a
// multiply or lighter rect is a shading term, not an eraser.
const PLATE = { rects: new Map(), text: new Map(), seq: 0 };
const bucket = () => (TYPE_CTX ? TYPE_CTX.atlas + '#' + TYPE_CTX.cell : '(none)');
const alphaOfFill = (s) => {
  const t = String(s);
  const m = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([0-9.]+)\s*\)/.exec(t);
  if (m) return +m[1];
  if (/^#[0-9a-f]{8}$/i.test(t)) return parseInt(t.slice(7), 16) / 255;
  if (/^(#|rgb\()/i.test(t)) return 1;
  return 0;                                   // a gradient or a pattern: not a plate
};
const push = (map, key, v) => { const a = map.get(key); if (a) a.push(v); else map.set(key, [v]); };

// THE LEDGER HAS ITS OWN SIZE BAR, AND FINDING OUT WHY IS THIS ROUND'S SECOND
// INSTRUMENT FAULT. The first draft reused DISPLAY_PX (10), and the r19
// reproduction below then returned ZERO: the can flash is drawn at LH * 0.082 =
// 9.27 px, so the ledger built to catch that erasure could not see it. DISPLAY_PX
// is an ABSOLUTE px value applied to cells of 144, 160, 212 and 240 rows — 10 px
// is 2.9% of a carton cell and 6.4% of a can cell, so one number cannot mean the
// same thing on both. It is left alone because typeCheck's contrast population is
// calibrated on it; the plate ledger takes its own bar instead.
//
// 6.0 px is where this file's deliberately-unreadable type stops: the legal block
// runs at 5.2 px on a can and 4.3 on a bottle and the barcode digits at 3.5, all
// of which are dense luminance noise by design, while the flash (9.3) and the
// descriptor (8.1) are words. A word painted out is a defect at any size someone
// was meant to read it at.
export const PLATE_PX = 6.0;

export function plateNoteText(g, txt, cx, y, w, px, align) {
  if (px < PLATE_PX || PROBE.on) return;      // a probe re-bake describes the probe
  const t = g.getTransform();
  const x0 = align === 'left' ? cx : cx - w / 2;
  push(PLATE.text, bucket(), {
    txt, px, seq: PLATE.seq++,
    x0: t.e + x0 * t.a, x1: t.e + (x0 + w) * t.a,
    y0: t.f + (y - px * 0.72) * t.d, y1: t.f + (y + px * 0.08) * t.d,
  });
}

// A rect thinner than this fraction of the glyph box is a RULE, not a plate.
// The first run of this check reported two complaints and the build was right
// both times: the shelf tag's struck-through was-price draws a 52x2 rule across
// a 12.8 px numeral, covers 15.6% of its box, and destroys nothing — a strike is
// SUPPOSED to cross the word. AGENTS_BRIEF, on the critic that killed one of its
// own rules first: "that rule staying silent afterwards is positive evidence the
// gate works." An eraser has to be tall enough to hide a glyph; the r19 barcode
// plate is 0.95 of the flash's box height and still fires.
const RULE_H = 0.30;

export function plateCheck(minCover = 0.02) {
  const bad = [];
  let strings = 0, plates = 0;
  for (const [k, ts] of PLATE.text) {
    const rs = PLATE.rects.get(k) || [];
    strings += ts.length; plates += rs.length;
    for (const s of ts) {
      const bh = Math.max(1e-6, s.y1 - s.y0);
      const area = Math.max(1e-6, (s.x1 - s.x0) * bh);
      let cov = 0, by = null;
      for (const r of rs) {
        if (r.seq < s.seq) continue;                     // painted before: not an eraser
        if ((r.y1 - r.y0) < RULE_H * bh) continue;       // a rule, not a plate
        const ox = Math.min(s.x1, r.x1) - Math.max(s.x0, r.x0);
        const oy = Math.min(s.y1, r.y1) - Math.max(s.y0, r.y0);
        if (ox <= 0 || oy <= 0) continue;
        cov += ox * oy; by = r;
      }
      if (cov / area > minCover) {
        bad.push({ cell: k, txt: s.txt, px: +s.px.toFixed(1), cover: +(cov / area).toFixed(3),
          plate: by ? [Math.round(by.x0), Math.round(by.y0), Math.round(by.x1), Math.round(by.y1)] : null });
      }
    }
  }
  return Object.assign(bad, { strings, plates, buckets: PLATE.text.size });
}
export function plateStats() {
  return { strings: [...PLATE.text.values()].reduce((a, b) => a + b.length, 0),
    plates: [...PLATE.rects.values()].reduce((a, b) => a + b.length, 0),
    buckets: PLATE.text.size };
}
export function resetPlateLedger() { PLATE.rects.clear(); PLATE.text.clear(); PLATE.seq = 0; }

// Three directions, on a canvas made the way the atlases are, because a probe
// that only ever fires on the case you built it for is not calibrated:
//   1. an opaque plate drawn AFTER a display-size string MUST fire
//   2. the same plate at alpha 0.30 must NOT
//   3. the same opaque plate drawn BEFORE the string must NOT
// It puts the ledger back afterwards and re-runs the real check, because an
// instrument left dirty is worse than no instrument.
export function plateCheckSelfTest() {
  const keepR = new Map(PLATE.rects), keepT = new Map(PLATE.text), keepS = PLATE.seq;
  const keepCtx = TYPE_CTX;
  const run = (mode) => {
    PLATE.rects.clear(); PLATE.text.clear(); PLATE.seq = 0;
    const [, g] = cv(256, 128);
    setTypeCtx('(plate-self-test)', mode);
    g.textBaseline = 'alphabetic';
    const paint = () => {
      g.globalAlpha = 1;
      g.fillStyle = mode === 'translucent' ? 'rgba(255,255,255,0.30)' : 'rgb(250,250,250)';
      g.fillRect(60, 40, 90, 30);
    };
    if (mode === 'before') paint();
    g.fillStyle = 'rgb(20,20,20)';
    fitText(g, 'DOUBLE CHOCOLATE', 100, 60, 180, 20, FACE.fat, '900');
    if (mode !== 'before') paint();
    return plateCheck().length;
  };
  // 4. THE ACTUAL r19 BUG, reproduced to its own numbers rather than
  //    synthesised: a 192 px cell, the flash centred at cx 96 with maxW 0.56 of
  //    the cell, and barcode()'s opaque plate from x = 0.66 of the cell.
  //    typeCoverageSelfTest() uses the same discipline for its half.
  const r19 = () => {
    PLATE.rects.clear(); PLATE.text.clear(); PLATE.seq = 0;
    const [, g] = cv(192, 144);
    setTypeCtx('(plate-self-test)', 'r19');
    g.textBaseline = 'alphabetic';
    const LH = (0.915 - 0.130) * 144;
    const yb = 0.130 * 144 + LH * 0.930;
    g.fillStyle = 'rgb(255,240,0)';
    fitText(g, 'DOUBLE CHOCOLATE', 96, yb, 192 * 0.56, LH * 0.082, FACE.fat, '900');
    g.fillStyle = 'rgb(6,252,0)';
    g.fillRect(192 * 0.66, 0.130 * 144 + LH * 0.880, 192 * 0.24, LH * 0.062);
    const out = plateCheck();
    return out.length ? out[0].cover : 0;
  };
  const fires = run('opaque');
  const translucent = run('translucent');
  const before = run('before');
  const rule = (() => {
    PLATE.rects.clear(); PLATE.text.clear(); PLATE.seq = 0;
    const [, g] = cv(256, 128);
    setTypeCtx('(plate-self-test)', 'rule');
    g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgb(20,20,20)';
    fitText(g, '$8.77', 100, 60, 180, 20, FACE.fat, '900');
    g.fillStyle = 'rgb(40,40,40)';
    g.fillRect(60, 54, 90, 2);                  // a strike-through: 2 px on a 16 px box
    return plateCheck().length;
  })();
  const r19cover = r19();
  PLATE.rects.clear(); PLATE.text.clear();
  for (const [k, v] of keepR) PLATE.rects.set(k, v);
  for (const [k, v] of keepT) PLATE.text.set(k, v);
  PLATE.seq = keepS;
  TYPE_CTX = keepCtx;
  return { firesOnOpaquePlate: fires, silentOnAlpha030: translucent, silentWhenPlateFirst: before,
    silentOnStrikeThrough: rule, r19FlashCoveredByBarcode: +r19cover.toFixed(3),
    liveComplaints: plateCheck().length,
    ok: fires > 0 && translucent === 0 && before === 0 && rule === 0 && r19cover > 0.02 };
}

export function armTypeAudit(g) {
  const proto = Object.getPrototypeOf(g);
  const origRect = proto.fillRect;
  g.fillRect = function (x, y, w, h) {
    // Effective alpha is globalAlpha TIMES the alpha in the fill string, and a
    // multiply or lighter composite paints a shading term, not a plate.
    const ea = (this.globalAlpha === undefined ? 1 : this.globalAlpha) * alphaOfFill(this.fillStyle);
    if (!PROBE.on && ea >= 0.90 && this.globalCompositeOperation === 'source-over') {
      const t = this.getTransform();
      push(PLATE.rects, bucket(), {
        seq: PLATE.seq++,
        x0: t.e + Math.min(x, x + w) * t.a, x1: t.e + Math.max(x, x + w) * t.a,
        y0: t.f + Math.min(y, y + h) * t.d, y1: t.f + Math.max(y, y + h) * t.d,
      });
    } else PLATE.seq++;
    return origRect.call(this, x, y, w, h);
  };
  const wrap = (name, kind) => {
    const orig = proto[name];
    g[name] = function (txt, x, y, ...rest) {
      if (AUDIT.viaFitNow) AUDIT.viaFit++;
      else {
        const t = this.getTransform ? this.getTransform() : null;
        const px = fontPx(this.font) * (t ? Math.hypot(t.b, t.d) : 1);
        if (px >= DISPLAY_PX) {
          AUDIT.big++;
          if (AUDIT.sites.length < 40) {
            AUDIT.sites.push(kind + ' ' + px.toFixed(0) + 'px "' + String(txt).slice(0, 28) + '"');
          }
        } else AUDIT.small++;
      }
      return orig.call(this, txt, x, y, ...rest);
    };
  };
  wrap('fillText', 'fillText');
  wrap('strokeText', 'strokeText');
  return g;
}

// Kept for a caller that owns a canvas cv() did not make. Same counter.
export function withTypeAudit(g, fn) {
  const was = { on: AUDIT.on, fill: g.fillText, stroke: g.strokeText };
  AUDIT.on = true;
  const wrap = (orig, kind) => function (txt, x, y, ...rest) {
    if (AUDIT.on) {
      if (AUDIT.viaFitNow) AUDIT.viaFit++;
      else {
        // the transform can scale the type as well as the font string; take the
        // vertical scale off the live matrix so a translated-and-scaled cell
        // reports the size the texel actually gets
        const t = this.getTransform ? this.getTransform() : null;
        const px = fontPx(this.font) * (t ? Math.hypot(t.b, t.d) : 1);
        if (px >= DISPLAY_PX) {
          AUDIT.big++;
          if (AUDIT.sites.length < 40) {
            AUDIT.sites.push(kind + ' ' + px.toFixed(0) + 'px "' + String(txt).slice(0, 28) + '"');
          }
        } else AUDIT.small++;
      }
    }
    return orig.call(this, txt, x, y, ...rest);
  };
  g.fillText = wrap(was.fill, 'fillText');
  g.strokeText = wrap(was.stroke, 'strokeText');
  try { return fn(); } finally {
    AUDIT.on = was.on;
    delete g.fillText; delete g.strokeText;      // back to the prototype methods
  }
}
export function typeAudit() {
  return { unguardedDraws: AUDIT.big, subDisplayDraws: AUDIT.small,
    guardedDraws: AUDIT.viaFit, sites: AUDIT.sites.slice(0, 12) };
}
export function resetTypeAudit() {
  AUDIT.big = 0; AUDIT.small = 0; AUDIT.viaFit = 0; AUDIT.sites.length = 0;
}

// THE PROOF THAT THE COVERAGE HALF FIRES, AND IT REPRODUCES r18's ACTUAL BUG
// RATHER THAN A SYNTHETIC ONE. What r18 shipped on the price rail was
//
//     g.font = `900 ${CH * 0.46}px ${FACE.fat}`;
//     g.fillText(big, 6, py);
//
// — a display-size numeral inked straight at the canvas, contributing nothing
// to the ledger, on the one surface AGENTS_BRIEF calls out as bar item #4. So
// the test draws exactly that, on a canvas made the same way the atlases are,
// and asserts typeCheck() reports it. Then it puts the counters back and
// asserts the complaint is gone, because a test that leaves the instrument
// dirty is worse than no test.
export function typeCoverageSelfTest() {
  const before = { big: AUDIT.big, small: AUDIT.small, viaFit: AUDIT.viaFit,
    sites: AUDIT.sites.slice() };
  const clean = typeCheck().length;
  const [, g] = cv(256, 128);
  g.fillStyle = '#141312';
  g.font = `900 ${128 * 0.46}px ${FACE.fat}`;
  g.textAlign = 'left';
  g.fillText('4', 6, 128 * 0.58);              // the r18 price numeral, verbatim
  const dirty = typeCheck();
  const caught = dirty.find((e) => e.atlas === '(coverage)');
  AUDIT.big = before.big; AUDIT.small = before.small; AUDIT.viaFit = before.viaFit;
  AUDIT.sites.length = 0; AUDIT.sites.push(...before.sites);
  const after = typeCheck().length;
  return {
    cleanBefore: clean,
    firedOnRawNumeral: !!caught,
    complaint: caught ? caught.txt : null,
    restoredClean: after === clean,
    ok: clean === 0 && !!caught && after === clean,
  };
}

export function setTypeCtx(atlas, cell, mode = 'mask') {
  TYPE_CTX = atlas ? { atlas, cell, mode } : null;
}
export function typeLog() { return TYPE_LOG; }

// albedo multiplier for a mask g value, straight out of the shader above
const gMul = (v) => 0.045 + 0.955 * (v / 255);
// Rec.709 relative luminance through the sRGB EOTF. Used only by `direct` mode,
// where the ink is a literal colour rather than a mask channel. AGENTS_BRIEF:
// "state your colour space with every luma threshold" — this one is
// linear-light, computed from sRGB bytes, and it is the only place in this file
// that decodes a transfer function.
const srgbLin = (b) => { const v = b / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const relLuma = (r, g, b) => 0.2126 * srgbLin(r) + 0.7152 * srgbLin(g) + 0.0722 * srgbLin(b);
// Canvas NORMALISES fillStyle on read: an opaque `rgb(255,150,0)` comes back
// as '#ff9600'. The first version of this parser only understood the rgb()
// form, so it matched nothing and the ledger silently logged zero entries —
// a check that passes because it never ran, which is the failure mode this
// whole file's assertions exist to avoid. Both forms, and a null for a
// gradient or a pattern, which is not type and is not checked.
const parseInk = (s) => {
  const t = String(s);
  let m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(t);
  if (m) return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
  m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(t);
  return m ? [+m[1], +m[2], +m[3]] : null;
};

//
// THE GUARANTEE LIVES HERE, NOT IN 143 CALL SITES. sampleGround returns the
// ink the glyphs should actually be drawn in: the one the caller asked for
// when it already clears MIN_STEP against the ground underneath, and otherwise
// the nearest g value that does, moving in the direction the caller was
// already going so a white-on-dark design stays white-on-dark. That is
// CLAUDE.md's one-owner rule applied to contrast — three rounds of fixing this
// per-SKU produced three more ghosted SKUs, because the property being fixed
// is a property of every wordmark and not of any of them.
function fitText(g, txt, cx, y, maxW, px, face, weight = '900', align = 'center') {
  g.font = `${weight} ${px}px ${face}`;
  const w = g.measureText(txt).width || 1;
  const sx = Math.min(1, maxW / w);
  const fix = TYPE_CTX ? sampleGround(g, txt, cx, y, Math.min(w, maxW), px, align) : null;
  // ROUND 20 — the box this string is about to occupy, recorded BEFORE the
  // translate/scale below, in the same device coordinates sampleGround reads its
  // ground in. See the plate ledger above: this is the half typeCheck cannot see.
  plateNoteText(g, txt, cx, y, Math.min(w, maxW), px, align);
  g.save();
  if (fix) g.fillStyle = fix;
  g.translate(cx, y);
  g.scale(sx, 1);
  g.textAlign = align;
  AUDIT.viaFitNow = true;
  try { g.fillText(txt, 0, 0); } finally { AUDIT.viaFitNow = false; }
  g.restore();
  return Math.min(w, maxW);
}

// The nearest g that clears `min` against ground gg, in the direction `up`.
// gMul is affine, so this inverts exactly rather than searching.
//
// ROUND the right way. `Math.round` here left 27 carton and 12 pouch runs at
// step 0.337-0.339 against a 0.340 bar — the correction landed a fraction of
// one g value inside the thing it was correcting for, and typeCheck() then
// complained about the corrector's own output. Ceil going up, floor going
// down: both move AWAY from the ground.
function stepFix(gg, up, min) {
  const b = gMul(gg);
  // want |a - b| / max(a,b) >= min
  const a = up ? b / (1 - min) : b * (1 - min);
  const v = (a - 0.045) / 0.955 * 255;
  return Math.max(0, Math.min(255, up ? Math.ceil(v) : Math.floor(v)));
}

// Read the ground under the glyph box BEFORE the glyphs land on it. The canvas
// transform is read with getTransform() rather than tracked in a variable,
// because every atlas loop translates to its own cell and a tracked copy of
// that offset is the duplicated-derivation hazard CLAUDE.md opens with.
// LEDGER OFF, GUARANTEE ON. A probe re-bake must not write to TYPE_LOG —
// sheet.js re-bakes each atlas three times per ablation — but it must still be
// the SAME ATLAS the store is drawing from, and until round 22 it was not.
//
// FOUND BY pressRestoreCheck(), WHICH IS WHY THAT CHECK EXISTS. The r22 A/B
// bakes its control arm under PROBE, and the restore assertion compares a fresh
// PROBE bake against the live canvas: 10.41% of the carton atlas's texels
// differed, across all 48 cells, max delta 142 levels, 207,947 of them in the
// PRINT-BRIGHTNESS channel. The cause is the line this comment replaces —
// `if (PROBE.on && TYPE_FIX) return null` skipped the contrast correction as
// well as the ledger write, so every probe bake in this repo has carried
// UNCORRECTED type: ghosted wordmarks the shipped atlas does not have.
//
// That contaminates any A/B whose control arm is a probe bake, which is
// endsSwap('r19') and every sheet.js ablation. It did not change round 20's
// conclusion (that comparison is about the end rings, not the type) but the
// control it published was one bug away from the build it was standing in for.
//
// The distinguishing condition is TYPE_FIX, not PROBE: typeCheckSelfTest is the
// only caller that turns the guarantee OFF, and it is the only probe caller
// that needs the ledger. So the guarantee now always runs and the ledger write
// is what is conditional.
function sampleGround(g, txt, cx, y, w, px, align) {
  const LEDGER = !PROBE.on || !TYPE_FIX;
  const ink = parseInk(g.fillStyle);
  if (!ink) return;
  const t = g.getTransform();
  const x0 = align === 'left' ? cx : cx - w / 2;
  const gx = Math.round(t.e + x0), gy = Math.round(t.f + y - px * 0.72);
  const gw = Math.max(1, Math.round(w)), gh = Math.max(1, Math.round(px * 0.80));
  let d;
  try { d = g.getImageData(gx, gy, gw, gh).data; } catch (e) { return; }
  let sr = 0, sg = 0, n = 0;
  for (let o = 0; o < d.length; o += 4 * 7) { sr += d[o]; sg += d[o + 1]; n++; }
  if (!n) return null;
  const gndR = Math.round(sr / n), gndG = Math.round(sg / n);

  // --- DIRECT MODE: a plain sRGB card, where the ink IS a colour ------------
  // The mask atlases carry print brightness in g and nothing else, so their
  // step is computed on g. A shelf tag is drawn straight to an sRGB texture, so
  // its step is a luminance step between two literal colours. Same guarantee,
  // same bar, measured on the quantity that actually exists on that surface.
  if (TYPE_CTX.mode === 'direct') {
    let br = 0, bg = 0, bb = 0, m = 0;
    for (let o = 0; o < d.length; o += 4 * 7) { br += d[o]; bg += d[o + 1]; bb += d[o + 2]; m++; }
    const gy = relLuma(br / m, bg / m, bb / m);
    const iy = relLuma(ink[0], ink[1], ink[2]);
    const dstep = Math.abs(iy - gy) / Math.max(iy, gy, 1e-4);
    let use = ink;
    if (TYPE_FIX && dstep < MIN_STEP) {
      // move the ink AWAY from the ground along its own hue: darker ink goes
      // darker, lighter goes lighter. A price numeral that has to change colour
      // to be read is a design fault, so this is expected to be rare and the
      // ledger records every time it fires.
      const up = iy >= gy;
      const want = up ? gy / (1 - MIN_STEP) : gy * (1 - MIN_STEP);
      const k = want / Math.max(iy, 1e-4);
      use = ink.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
      if (up && relLuma(...use) < want) use = [255, 255, 255];
    }
    const fy = relLuma(use[0], use[1], use[2]);
    if (LEDGER) TYPE_LOG.push({
      atlas: TYPE_CTX.atlas, cell: TYPE_CTX.cell, mode: 'direct', txt, px: +px.toFixed(1),
      inkY: +fy.toFixed(4), gndY: +gy.toFixed(4), askY: +iy.toFixed(4),
      fixed: use !== ink,
    });
    return use === ink ? null : `rgb(${use[0]},${use[1]},${use[2]})`;
  }

  const step = (v) => Math.abs(gMul(v) - gMul(gndG)) / Math.max(gMul(v), gMul(gndG));
  let useG = ink[1];
  if (TYPE_FIX && step(useG) < MIN_STEP) {
    // Both directions, then the better of the two — not "the caller's direction
    // and flip if it fails". The flip-on-failure version drove HOLLOWAY from a
    // requested 150 on a 224 ground UP to 255, because down-to-143 missed the
    // bar by 0.001 and the flip did not check whether it was making things
    // worse: 0.339 became 0.116. A step is monotone away from the ground, so
    // the two clamped candidates ARE the two maxima and picking the larger is
    // the whole search.
    const lo = stepFix(gndG, false, MIN_STEP), hi = stepFix(gndG, true, MIN_STEP);
    const sLo = step(lo), sHi = step(hi);
    const okLo = sLo >= MIN_STEP, okHi = sHi >= MIN_STEP;
    if (okLo && okHi) useG = Math.abs(lo - ink[1]) <= Math.abs(hi - ink[1]) ? lo : hi;
    else if (okLo) useG = lo;
    else if (okHi) useG = hi;
    else useG = sLo >= sHi ? lo : hi;      // unreachable bar: take the best there is
  }
  if (LEDGER) {
    TYPE_LOG.push({
      atlas: TYPE_CTX.atlas, cell: TYPE_CTX.cell, txt, px: +px.toFixed(1),
      inkR: ink[0], askG: ink[1], inkG: useG, gndR, gndG, fixed: useG !== ink[1],
    });
  }
  return useG === ink[1] ? null : `rgb(${ink[0]},${useG},${ink[2]})`;
}

// THE CHECK. `step` is the worst-case luminance step between the ink and its
// ground — worst case because it assumes the brand colour and the paper stock
// have the same luminance, which for a cream or silver brand they very nearly
// do. Below MIN_STEP the wordmark is a ghost on some real instance of that
// cell, whatever it looks like on the one the builder happened to screenshot.
//
// 0.34 is not a taste value: it is the step at which a 13 px cap height at the
// 22-60 px a facing actually gets (aniso.js facingPx) still resolves after the
// mip chain has averaged the glyph with its ground. WINDROW measured 0.07 and
// PENNYWHISTLE 0.05.
export const MIN_STEP = 0.34;
let TYPE_FIX = true;
export function setTypeFix(on) { TYPE_FIX = !!on; return TYPE_FIX; }

export function stepOf(e) {
  if (e.mode === 'direct') {
    return Math.abs(e.inkY - e.gndY) / Math.max(e.inkY, e.gndY, 1e-4);
  }
  const a = gMul(e.inkG), b = gMul(e.gndG);
  return Math.abs(a - b) / Math.max(a, b);
}

// ROUND 19 — THE CHECK NOW HAS A COVERAGE HALF, AND IT IS THE HALF THAT WOULD
// HAVE CAUGHT r18. The per-entry loop below is unchanged in spirit and could
// never have fired for the price rail, because the price rail wrote no
// entries. `unguarded` is the count of strings the canvas actually inked
// outside fitText during the bake — read off the draw calls, not off a list of
// atlases somebody remembered to name.
export function typeCheck(min = MIN_STEP) {
  const bad = [];
  for (const e of TYPE_LOG) {
    const step = stepOf(e);
    if (step < min - 1e-6) bad.push({ ...e, step: +step.toFixed(3) });
  }
  const a = typeAudit();
  if (a.unguardedDraws) {
    bad.push({ atlas: '(coverage)', txt: a.unguardedDraws + ' string(s) inked outside the '
      + 'contrast guarantee during the bake — e.g. ' + a.sites.slice(0, 4).join(', '),
      step: 0, unguarded: a.unguardedDraws });
  }
  if (!TYPE_LOG.length) {
    bad.push({ atlas: '(coverage)', txt: 'the type ledger is EMPTY. Zero is the most '
      + 'suspicious reading an instrument can give — r18 logged zero because its parser only '
      + 'understood rgb() and canvas normalises fillStyle to hex.', step: 0 });
  }
  return bad;
}

// How much work the guarantee is doing. Reported, not asserted: a round that
// drives this to zero by authoring the contrast by hand has genuinely improved
// the atlases, and a round that lets it climb has not broken anything — but
// nobody can tell which without the number.
export function typeStats() {
  const by = {};
  for (const e of TYPE_LOG) {
    const b = (by[e.atlas] = by[e.atlas] || { runs: 0, corrected: 0 });
    b.runs++; if (e.fixed) b.corrected++;
  }
  return by;
}

// A CHECK NOBODY HAS SEEN FIRE IS A CHECK THAT MIGHT NOT WORK. Same pattern as
// bakeCheckSelfTest() below: turn the guarantee off, re-bake the four mask
// atlases into a throwaway ledger, and assert the check complains. It is not
// called at load — run it from tools/ or the console:
//
//   (await import('/src/store/pack.js')).typeCheckSelfTest(THREE)
//
// Round 18 measured, with the guarantee off, 116 of 688 wordmark and
// descriptor runs below MIN_STEP: 93 carton, 23 pouch, 0 can, 0 bottle.
// Worst four: carton#37 "HOLDS A SEAL IN THE FREEZER" 0.066, carton#30
// "LEMON ICED TEA" 0.089, carton#30 "SHAKE WELL BEFORE POURING" 0.094,
// carton#8 "ASHFORD" 0.106.
//
// It read 143 earlier in the same round, and the difference is the point: the
// extra 27 were the bottle atlas's own `plate ink(255,232) / type ink(14,250)`
// pair, which this round rewrote. The 116 that remain are legacy carton and
// pouch sites the guarantee is holding up; a later round that authors them on
// the g channel by hand will drive this number down, and typeStats() reports
// it every load so nobody has to guess whether that happened.
export function typeCheckSelfTest(THREE) {
  const keep = TYPE_LOG.length;
  setTypeFix(false); setPackProbe(true);
  try {
    for (const bake of [cartonAtlas, pouchAtlas, canAtlas, bottleAtlas]) bake(THREE).dispose();
  } finally { setTypeFix(true); setPackProbe(false); }
  const fresh = TYPE_LOG.splice(keep);
  const bad = [];
  for (const e of fresh) if (stepOf(e) < MIN_STEP - 1e-6) bad.push(e);
  const by = {};
  for (const e of bad) by[e.atlas] = (by[e.atlas] || 0) + 1;
  return { runs: fresh.length, complaints: bad.length, byAtlas: by,
    ok: bad.length > 50,
    worst: bad.map((e) => ({ ...e, step: +stepOf(e).toFixed(3) }))
      .sort((a, b) => a.step - b.step).slice(0, 8) };
}

// Tiny legal type. Individually unreadable by design — the job is to make the
// dense luminance noise a photographed package has and a flat fill does not.
// ROUND 15 — the SET is now an argument. An enriched-wheat-flour ingredients
// declaration is legible nonsense on a bottle of bleach at the 3x zoom a critic
// actually uses, and this block is the densest type on the package, so it is
// also the most of it. LEGAL_SETS.food is the round-14 behaviour, kept as the
// default so a caller that forgets is merely unchanged rather than broken.
function legalBlock(g, x, y, w, n, px, rng, style, lines = LEGAL_SETS.food) {
  g.textAlign = 'left';
  g.font = `400 ${px}px ${FACE.grot}`;
  for (let i = 0; i < n; i++) {
    const line = lines[(i + (rng() * 12 | 0)) % lines.length];
    g.fillStyle = style;
    g.save();
    g.translate(x, y + i * (px + 1.1));
    // squeeze the sentence into the column so it terminates at a ragged edge
    const cut = line.slice(0, 30 + (rng() * 34 | 0));
    const mw = g.measureText(cut).width || 1;
    g.scale(Math.min(1, w / mw), 1);
    g.fillText(cut, 0, 0);
    g.restore();
  }
}

function barcode(g, x, y, w, h, rng) {
  g.fillStyle = ink(6, 252);
  g.fillRect(x, y, w, h);
  g.fillStyle = ink(6, 14);
  let bx = x + 2.5;
  while (bx < x + w - 3) {
    const bw = rr(rng, 0.9, 2.6);
    if (rng() < 0.72) g.fillRect(bx, y + 1.5, bw, h - 7);
    bx += bw + rr(rng, 0.8, 2.0);
  }
  g.font = `400 ${Math.max(3.5, h * 0.22)}px ${FACE.mono}`;
  g.textAlign = 'center';
  g.fillStyle = ink(6, 20);
  g.fillText('0 74100 21886 3', x + w / 2, y + h - 1.2);
}

// The black-ruled panel. Almost every package in a US store carries one and
// its hard horizontal rules read at surprisingly small sizes.
// ROUND 15 — the HEAD and the ROWS come from the product's class. The ruled
// panel itself is right on everything: a drug facts panel, a directions panel
// and a nutrition panel are the same black-ruled device and read the same at
// small size. What was wrong was printing Total Fat 2g on a bottle of glass
// cleaner. PANEL_ROWS is keyed by the legal set, which is what the class
// already names, so there is no second taxonomy to keep in sync.
const PANEL_ROWS = {
  food: ['Total Fat 2g', 'Sodium 210mg', 'Total Carb 24g', 'Protein 3g',
    'Dietary Fiber 3g', 'Sugars 9g', 'Calcium 10%', 'Iron 45%'],
  wet: ['Total Fat 0.5g', 'Sodium 480mg', 'Total Carb 19g', 'Protein 5g',
    'Dietary Fiber 4g', 'Sugars 6g', 'Vitamin A 20%', 'Potassium 8%'],
  bev: ['Total Fat 0g', 'Sodium 45mg', 'Total Carb 39g', 'Protein 0g',
    'Sugars 39g', 'Caffeine 34mg', 'Vitamin C 100%', 'Servings 2.5'],
  clean: ['Spray 6 in from surface', 'Let stand 30 seconds', 'Wipe with a dry cloth',
    'Rinse food surfaces', 'Do not mix with bleach', 'Store upright, cool, dry',
    'Test on a hidden area', 'Keep from children'],
  drug: ['Adults: 2 caplets', 'Every 6 hours as needed', 'Do not exceed 6 in 24 hr',
    'Under 12: ask a doctor', 'Store below 25 C (77 F)', 'Do not use with alcohol',
    'Ask a doctor if pregnant', 'Stop use if rash occurs'],
  care: ['Apply to wet hair', 'Lather, rinse, repeat', 'For external use only',
    'Avoid contact with eyes', 'Discontinue if irritated', 'Keep cap closed',
    'Store at room temperature', 'Recycle the empty bottle'],
  paper: ['110 sheets per roll', '2 ply, 11 in x 11 in', 'Septic safe', 'Not a flushable wipe',
    'Store in a dry place', 'Responsibly sourced fiber', 'Recyclable wrap',
    'Made in the U.S.A.'],
};
function nutriPanel(g, x, y, w, h, rng, head = 'NUTRITION FACTS', rows = PANEL_ROWS.food) {
  g.fillStyle = ink(8, 253);
  g.fillRect(x, y, w, h);
  g.strokeStyle = ink(8, 26); g.lineWidth = 1.4;
  g.strokeRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4);
  g.textAlign = 'left';
  g.fillStyle = ink(8, 22);
  fitText(g, head, x + 3, y + h * 0.20, w - 6, h * 0.20, FACE.fat, '900', 'left');
  g.fillRect(x + 3, y + h * 0.25, w - 6, 2.2);
  const n = Math.max(3, Math.floor(h / 7));
  g.font = `400 ${Math.max(3.4, h * 0.085)}px ${FACE.grot}`;
  for (let i = 0; i < n; i++) {
    const ry = y + h * 0.36 + i * ((h * 0.60) / n);
    g.fillStyle = ink(8, 30);
    g.fillText(rows[i % rows.length], x + 3, ry);
    g.fillStyle = ink(8, 60);
    g.fillRect(x + 3, ry + 1.4, w - 6, 0.7);
  }
}

// RETIRED r16 — foodPhoto(g, cx, cy, rw, rh, rng, mode, band). THE DEFECT THIS
// ROUND EXISTS TO FIX, kept here as prose because its own comment is the best
// short statement of what was wrong with it:
//
//     "Serving-suggestion photography. Not one flat ellipse — a set of distinct
//      presentation modes, because 24 cartons that all carry the same plate of
//      brown blobs is the round-1 repetition failure wearing a better hat."
//
// The diagnosis was right and the fix was one level too shallow. It replaced
// one ellipse with five ARRANGEMENTS of the same 26 random ellipses — plate,
// bowl, pile, window, stack — and the arrangement was chosen by the atlas cell
// index, not by the product. So flour, tuna and kettle chips got the same heap
// in a different container, and r15's critic, scoring 36/36 blind, reported the
// facings as "type on flat colour, plus one repeated plated-food oval".
//
// Two mechanical faults worth keeping: it wrote r = 200, so the "food" took 78%
// of the carton's brand hue and a plate of dinner on a blue box came out blue;
// and its only product input was foodBand(desc), one hue for the entire
// picture. See depict.js.

// Satin varnish across the top third. Cartons are coated stock; without this
// they read as matte paper, which nothing in a supermarket is.
// ---------------------------------------------------------------------------
// ROUND 12 — THE MASK IS NOT AN IMAGE, AND FOUR TERMS WERE TREATING IT AS ONE.
//
// This canvas is not a picture; it is three independent channels with a
// contract at the top of the file. r is how much brand ink covers the texel,
// g is print brightness, b is a QUANTISED food-palette band index. So a
// neutral shading term — black under 'multiply', white under 'lighter' — is
// not "darken" or "lighten". It is:
//
//     r  the ink gets more or less coloured        (physically meaningless)
//     g  the print gets darker or brighter         (the only thing intended)
//     b  the serving photo CHANGES HUE             (b is an index, not a level)
//
// The b case is the alarming one. foodB packs band*64 + amt*62, so scaling b
// by 0.48 at a can's edge walks a red band (128-191) down into the green one
// (64-127): the tomato at the edge of the label is a different food from the
// tomato at its centre.
//
// This was already found here TWICE and fixed only where it was found. glint()
// carries the round-3 note ("a real highlight DESATURATES toward the light —
// drop r — and BRIGHTENS — raise g"), and pouchAtlas carries its own ("adding
// white here also pushed r and b, which silently shifted the brand amount and
// the food palette band of every bag in the store"). Both are correct. Neither
// was ever applied to varnish, edgeShade, or the two full-cell curvature
// gradients on the can and the bottle — which are the LARGEST-area terms of
// the four, and the reason the can atlas measured as the least-inked family in
// the store: 41.7% of its printed front below coverage 0.1 and only 13.8%
// above 0.9, against cartons at 18.8%/47.2%.
//
// Curvature is a brightness effect. It belongs in g and nowhere else, and the
// 3D cylinder's own normals already carry most of it. So every one of these
// terms now writes ONE channel:
//     dim  print brightness -> multiply by rgba( 255, 0, 255, a )
//     lift print brightness -> lighter  by rgba(   0, X,   0, a )
// which is exactly the form glint and the pouch streaks already used.
function varnish(g, x, y, w, h) {
  const s = g.createLinearGradient(0, y, 0, y + h);
  s.addColorStop(0, 'rgba(0,0,0,0)');
  s.addColorStop(0.42, 'rgba(0,76,0,1)');
  s.addColorStop(0.62, 'rgba(0,26,0,1)');
  s.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = s; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'source-over';
}

function edgeShade(g, x, y, w, h, strength = 0.38) {
  const e = g.createLinearGradient(x, 0, x + w, 0);
  e.addColorStop(0, `rgba(255,0,255,${strength})`);
  e.addColorStop(0.09, 'rgba(255,0,255,0)');
  e.addColorStop(0.90, 'rgba(255,0,255,0)');
  e.addColorStop(1, `rgba(255,0,255,${strength + 0.06})`);
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = e; g.fillRect(x, y, w, h);
  g.globalCompositeOperation = 'source-over';
}

// A hard vertical specular band cut straight into the MASK channels.
// ROUND-3 BUG FOUND: round 2 drew every sheen as white under 'multiply', and
// multiplying by white is a no-op — so cans, bottles and jugs came out
// perfectly matte no matter what the gradient said. A real highlight does two
// things at once: it DESATURATES toward the light (drop the r = brand-amount
// channel) and it BRIGHTENS (raise the g = print-brightness channel).
function glint(g, W, H, cx, halfW, y0, y1, kill, add) {
  const mk = (fn) => {
    const gr = g.createLinearGradient(cx - halfW, 0, cx + halfW, 0);
    gr.addColorStop(0.00, fn(0));
    gr.addColorStop(0.30, fn(0.35));
    gr.addColorStop(0.50, fn(1));
    gr.addColorStop(0.68, fn(0.30));
    gr.addColorStop(1.00, fn(0));
    return gr;
  };
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = mk((a) => `rgba(${kill},255,255,${a})`);
  g.fillRect(cx - halfW, y0, halfW * 2, y1 - y0);
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = mk((a) => `rgba(0,${add},0,${a})`);
  g.fillRect(cx - halfW, y0, halfW * 2, y1 - y0);
  g.globalCompositeOperation = 'source-over';
}

function maskTex(THREE, canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}

// ---------------------------------------------------------------------------
// CARTON ATLAS — 24 designs. Three families so a shelf has real tonal spread:
//   0..9   white stock, brand-colour header  (crackers, baking, cookies)
//   10..17 full-bleed brand colour, white wordmark plate  (cereal, detergent)
//   18..23 dark rich stock, big photo  (coffee, premium, frozen)
export function cartonAtlas(THREE) {
  const A = ATLAS.carton;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xC4A701);
  const M = A.cw * A.wrap;

  for (let i = 0; i < A.cols * A.rows; i++) {
    g.save();
    g.translate((i % A.cols) * A.cw, Math.floor(i / A.cols) * A.ch);
    setTypeCtx('carton', i);
    g.beginPath(); g.rect(0, 0, A.cw, A.ch); g.clip();
    cartonDesign(g, i, A.cw, A.ch, M, rng);
    g.restore();
  }
  setTypeCtx(null);
  registerBake('carton');
  return maskTex(THREE, c);
}


// RETIRED r16 — heroPanel(). Its round-5 measurement stands and is inherited by
// depict.js's non-food motifs: "Detergent and shampoo cartons are 60-80% one
// saturated colour with the product in white on top; that ratio is the whole
// reason reference/store_02's cleaning aisle measures as the bluest frame in
// the set." Every non-food motif in depict.js keeps that ratio — jugBottle,
// sprayBottle and careBottle are a brand-colour body with a white label and a
// white cap, and the sparkle device moved across intact.
//
// It went because it drew ONE bottle for all of paper, cleaning, health, beauty
// and baby. A pack of diapers with a picture of a spray bottle on it was the
// non-food half of exactly the defect the food half had.

function cartonDesign(g, i, W, H, M, rng) {
  // fam sets the tonal family, arch sets the LAYOUT. 24 cells that share one
  // template read as one product recoloured 24 times, which is exactly the
  // repetition the blind test picked up on.
  const fam = i < 8 ? 0 : (i < 18 ? 1 : 2);
  const arch = i % 7;                       // 0..6, see the switch below
  const x0 = M, fw = W - M;
  const brand = pk(rng, i % 7 === 6 ? VALUE_BRANDS : BRANDS);
  // ROUND 15. One call, one product, every band. 'C' is this atlas's package
  // form and it is not optional: it is what stops a boxed cake mix appearing
  // on the bottle atlas and a loaf of bread appearing on the can atlas.
  // ROUND 17 — the ROW is dealt by plan.js rather than drawn at random from the
  // department pool. Same machinery below the pick; see copyForSku().
  const cp = copyForSku(rng, PLAN.carton[i].row, 'C');
  const desc = cp.desc;
  const LOGE = logCell('carton', i, cp, brand);
  const flash = cp.flash;
  const wt = cp.wt;
  const wmFace = pk(rng, [FACE.fat, FACE.fat, FACE.impact, FACE.geo, FACE.serif,
    FACE.human, FACE.slab, FACE.didone, FACE.plate, FACE.script]);
  // ROUND 5. Cells 6 and 7 mod 8 are the CLEANING and HEALTH & BEAUTY
  // vocabularies. Round 4 put a plate of food on a bottle of bleach, which is
  // both absurd and — because the food palette is warm — most of why the one
  // aisle that should have measured like reference/store_02 (15.4% of frame in
  // the blue band) came out at 1.6%. Non-food packaging gets a hero device: a
  // full-bleed brand field with the product itself reversed out in white.
  //
  // ROUND 15 — this was (i % 8) >= 6, i.e. "cells 6 and 7 of every eight are
  // the non-food departments". True, and true only by the ordering of DEPTS in
  // products.js: reorder that array and round 5's fix silently inverts. It now
  // asks the PRODUCT whether it is food, which is the question it was always
  // trying to ask. Same answer on this build, for a reason that survives an
  // edit elsewhere.
  const nonFood = !cp.food;
  const noPhoto = arch === 3 || nonFood;    // flour / sugar / detergent look
  g.textBaseline = 'alphabetic';

  // ---- ground -------------------------------------------------------------
  if (fam === 0) {
    g.fillStyle = ink(14, 250); g.fillRect(0, 0, W, H);            // white stock
    g.fillStyle = ink(255, 232); g.fillRect(0, 0, W, H * 0.135);
    g.fillStyle = ink(255, 150); g.fillRect(0, H * 0.135, W, H * 0.012);
    g.fillStyle = ink(255, 214); g.fillRect(0, H - H * 0.075, W, H * 0.075);
  } else if (fam === 1) {
    g.fillStyle = ink(255, 224); g.fillRect(0, 0, W, H);           // full bleed
    g.fillStyle = ink(255, 135); g.fillRect(0, 0, W, H * 0.10);
    g.fillStyle = ink(255, 160); g.fillRect(0, H - H * 0.10, W, H * 0.10);
  } else {
    g.fillStyle = ink(255, 92); g.fillRect(0, 0, W, H);            // dark rich
    g.fillStyle = ink(255, 58); g.fillRect(0, 0, W, H * 0.09);
  }

  // decorative ground pattern on some designs — stripes, checks, a burst
  if (arch === 3 || arch === 6) {
    g.save(); g.globalAlpha = 0.5;
    if (rng() < 0.5) {
      for (let k = -H; k < W + H; k += 14) {
        g.fillStyle = ink(255, fam === 0 ? 225 : 130);
        g.save(); g.translate(k, 0); g.rotate(0.5); g.fillRect(0, -H, 6, H * 3); g.restore();
      }
    } else {
      for (let k = 0; k < H; k += 22) {
        g.fillStyle = ink(255, fam === 0 ? 228 : 140);
        g.fillRect(0, k, W, 9);
      }
    }
    g.restore();
  }

  // ---- LAYOUT -------------------------------------------------------------
  // ROUND 16 — THE PICTURE GETS ABOUT A THIRD MORE FACE.
  // Measured off the first r16 facing sheet at the computed chase-range size
  // (84 px across a 0.20 m facing = 1.75 m from this camera): the depictions
  // were landing at 24-38 px across, which is under the size a bold silhouette
  // needs to resolve, and the sheet showed several facings still reading as a
  // colour field with a smudge. photoR goes 0.28-0.44 -> 0.36-0.50 of the face
  // width and the vertical squash goes 0.62/0.80 -> 0.78/0.92, which puts the
  // object at 34-50 px at the same distance.
  //
  // It is not pushed further than that on purpose. A real carton front is
  // 40-70% white stock carrying a heavy wordmark and six-to-ten lines of legal
  // type — the round-2 measurement at the top of this file — and drowning that
  // in photography would trade one blind-test cue for the one before it.
  let wmY, wmPx, wmCx, wmMaxW, photoX, photoY, photoR, plate = true;
  switch (arch) {
    case 0:  // header wordmark, photo centred below
      wmY = H * 0.255; wmPx = H * 0.115; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.88;
      photoX = x0 + fw * 0.52; photoY = H * 0.63; photoR = fw * 0.40; break;
    case 1:  // big photo bottom 55%, wordmark high on colour
      wmY = H * 0.20; wmPx = H * 0.125; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.9;
      photoX = x0 + fw * 0.5; photoY = H * 0.68; photoR = fw * 0.50; plate = false; break;
    case 2:  // wordmark in an oval, photo behind it
      wmY = H * 0.32; wmPx = H * 0.105; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.72;
      photoX = x0 + fw * 0.55; photoY = H * 0.60; photoR = fw * 0.45; break;
    case 3:  // no photo: type-led, big ingredient panel
      wmY = H * 0.30; wmPx = H * 0.155; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.92;
      photoX = 0; photoY = 0; photoR = 0; break;
    case 4:  // wordmark left-aligned, photo to the right
      wmY = H * 0.24; wmPx = H * 0.10; wmCx = x0 + fw * 0.06; wmMaxW = fw * 0.62;
      photoX = x0 + fw * 0.66; photoY = H * 0.58; photoR = fw * 0.36; break;
    case 5:  // narrow tall: stacked wordmark over a small window photo
      wmY = H * 0.22; wmPx = H * 0.13; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.94;
      photoX = x0 + fw * 0.5; photoY = H * 0.56; photoR = fw * 0.38; break;
    default: // 6: banded, wordmark low over a wide photo
      wmY = H * 0.62; wmPx = H * 0.12; wmCx = W * 0.5 + M * 0.35; wmMaxW = fw * 0.86;
      photoX = x0 + fw * 0.5; photoY = H * 0.34; photoR = fw * 0.46; break;
  }
  // ONE OWNER for the flash ribbon's y. It is read twice — once by the press
  // layer, which must not put a keyline through it, and once by the ribbon
  // itself 90 lines below. A second copy of this expression is exactly the
  // hazard CLAUDE.md opens with, and it would rot silently the moment an arch
  // moved.
  const flY = arch === 6 ? H * 0.755 : (arch === 1 ? H * 0.395 : H * 0.455);
  const flH = H * 0.052;

  // ---- THE PRESS ----------------------------------------------------------
  // See src/store/press.js. Every band, plate and rule on this face used to be
  // the ONE per-instance brand hue at a different brightness, and the hue
  // census said so: median 1 distinct hue family per face on all four families,
  // at every delivered size. This paints the face's large structure in the
  // b-channel spot inks the shader has decoded since round 5 and pack.js has
  // only ever written inside depict()'s photo box.
  //
  // It runs AFTER the layout is decided and BEFORE the depiction, so no zone
  // boundary can land on a glyph and the serving suggestion prints over the
  // field rather than under it. Its randomness comes from its own per-cell
  // stream, so with PRESS off this file consumes the identical draws it
  // consumed in r21 and the control atlas is byte-identical.
  const PRESSED = pressCarton(g, x0, fw, H, i, {
    wmTop: wmY - wmPx * 1.05, wmBot: wmY + H * 0.13, flY, flH, fam,
  });

  // ---- serving-suggestion photograph (drawn under the type) ---------------
  // ROUND 16. One call for food and non-food alike: what a package pictures is
  // the product, and a bottle of bleach picturing a spray bottle is no more a
  // special case than a can of peaches picturing a peach. photoMode is gone —
  // it chose between five ways of arranging the SAME ellipses.
  if (photoR > 0 && (!noPhoto || nonFood)) {
    const phH = photoR * (arch === 1 ? 0.78 : 0.92);
    logPhoto(LOGE, photoX, photoY, photoR, phH);
    depict(g, photoX, photoY, photoR, phH, rng, cp);
  }

  // ---- wordmark, roughly a quarter of the face height ---------------------
  // ROUND 12 — REVERSE THE MARK OUT OF THE COLOUR, on half the full-bleed
  // designs. fam 1 is the full-bleed family, and every one of its cells was
  // standing its wordmark on a white plate 92% of the face wide and about 1.5x
  // the cap height tall: a hole punched straight through the middle of the one
  // solid brand block on the package. That is exactly what the "% of blocks
  // over C*34" statistic is counting, and it is the least realistic thing on
  // the face — the standard full-bleed grocery treatment (a cereal, a
  // detergent, a chip bag) reverses the mark out in white ON the colour.
  //
  // Half, not all: a white plate on a coloured ground is also real, and the
  // arch-2 oval is a whole layout archetype built around one. So the plate
  // survives on odd cells and on every arch-2 design, and the even fam-1 cells
  // keep their block intact.
  const reverseMark = fam === 1 && i % 2 === 0 && arch !== 2;
  if (plate && arch !== 4 && !reverseMark) {  // white plate behind the mark
    g.fillStyle = fam === 1 ? ink(14, 250) : ink(255, fam === 2 ? 210 : 245);
    if (arch === 2) {
      g.beginPath();
      g.ellipse(wmCx, wmY - wmPx * 0.30, fw * 0.46, wmPx * 0.86, 0, 0, 6.29);
      g.fill();
    } else if (fam !== 0) {
      g.fillRect(x0 + fw * 0.04, wmY - wmPx * 0.92, fw * 0.92, wmPx * 1.30);
    }
  }
  g.fillStyle = fam === 0 ? ink(255, 120) : (fam === 1 ? ink(255, 150) : ink(10, 250));
  if (arch === 2 || (fam === 1 && plate && !reverseMark)) g.fillStyle = ink(255, 130);
  // bare stock, near-white print: type knocked out of the ink, not printed on it
  if (reverseMark) g.fillStyle = ink(18, 252);
  fitText(g, brand, wmCx, wmY, wmMaxW, wmPx, wmFace, '900', arch === 4 ? 'left' : 'center');
  if (rng() < 0.5) {
    g.fillStyle = fam === 2 ? ink(20, 240) : ink(255, 140);
    g.fillRect(wmCx - (arch === 4 ? 0 : wmMaxW / 2), wmY + wmPx * 0.20, wmMaxW * 0.9, H * 0.006);
  }

  // ---- product descriptor -------------------------------------------------
  g.fillStyle = fam === 2 ? ink(30, 245) : ink(12, 40);
  fitText(g, desc, wmCx, wmY + H * 0.070, wmMaxW * 0.96, H * 0.045,
    pk(rng, [FACE.grot, FACE.human, FACE.geo]), '700', arch === 4 ? 'left' : 'center');
  // sub-descriptor: the second line that has to survive a 3x zoom
  g.fillStyle = fam === 2 ? ink(40, 200) : ink(14, 62);
  fitText(g, cp.sub, wmCx, wmY + H * 0.111, wmMaxW * 0.90, H * 0.030,
    FACE.grot, '600', arch === 4 ? 'left' : 'center');

  // ---- flavour flash ribbon ----------------------------------------------
  // The single largest full-width element on the face, and until r22 it was the
  // brand hue at 47% brightness — i.e. a shadow of the ground rather than a
  // second ink. A real flavour flash is a SPOT: the vendor's other colour,
  // printed edge to edge, with a rule under it.
  g.fillStyle = PRESSED ? PRESSED.L.inkA() : ink(255, fam === 2 ? 210 : 120);
  g.fillRect(0, flY, W, flH);
  if (PRESSED) {
    g.fillStyle = PRESSED.L.aG > 140 ? PRESSED.L.key() : PRESSED.L.lit();
    g.fillRect(0, flY + flH - 3, W, 3);
  }
  g.fillStyle = ink(fam === 2 ? 255 : 10, fam === 2 ? 40 : 250);
  fitText(g, flash, W * 0.5 + M * 0.35, flY + H * 0.040, fw * 0.70, H * 0.038,
    FACE.fat, '900');

  // ---- burst -------------------------------------------------------------
  if (rng() < 0.42) {
    const bx = x0 + fw * (rng() < 0.5 ? 0.19 : 0.80), by = H * 0.545;
    g.fillStyle = ink(255, 235);
    g.beginPath();
    for (let k = 0; k < 20; k++) {
      const a2 = (k / 20) * 6.283, r = (k % 2 ? 0.66 : 1.0) * fw * 0.115;
      g[k ? 'lineTo' : 'moveTo'](bx + Math.cos(a2) * r, by + Math.sin(a2) * r * 0.9);
    }
    g.closePath(); g.fill();
    g.fillStyle = ink(20, 30);
    fitText(g, pk(rng, BURST), bx, by + H * 0.010, fw * 0.17, H * 0.030, FACE.fat, '900');
  }

  // ---- legal type + weight + barcode + nutrition flash --------------------
  // Type-led designs give the panel far more room, the way a flour or a
  // detergent carton does.
  // third readable band: a claim line above the weight, set in caps at a size
  // that survives near-field zoom
  g.fillStyle = fam === 2 ? ink(50, 210) : ink(14, 70);
  fitText(g, cp.claim, x0 + fw * 0.045, noPhoto ? H * 0.532 : H * 0.752,
    fw * 0.54, H * 0.026, FACE.grot, '700', 'left');
  const legN = noPhoto ? 11 : 7;
  legalBlock(g, x0 + fw * 0.045, noPhoto ? H * 0.60 : H * 0.815, fw * 0.52, legN,
    H * 0.0180, rng, fam === 2 ? ink(60, 175) : ink(16, 78), cp.legal);
  g.textAlign = 'left';
  g.fillStyle = fam === 2 ? ink(40, 245) : ink(12, 45);
  fitText(g, wt, x0 + fw * 0.045, noPhoto ? H * 0.565 : H * 0.785, fw * 0.50, H * 0.030,
    FACE.grot, '700', 'left');
  // ROUND 20 — NOT ON arch 6, AND THE PLATE LEDGER IS WHY. arch 6 is the banded
  // layout: wordmark low at H*0.62, sub-descriptor at H*0.731, flash ribbon at
  // H*0.755. This panel is an OPAQUE fillRect over H*0.700-0.875 at x fw*0.62-
  // 0.96, and both of those lines are centred on wmCx with enough width to run
  // under it — measured by plateCheck() on the shipped bake at 29.6-31.1% of the
  // sub's box and 12.3-20.1% of the flash's, on 6 of 48 carton cells. The words
  // are ULTRA STRONG, UNSWEETENED, HOMESTYLE, ORIGINAL: display type, painted
  // out, invisible to typeCheck because a covered glyph's contrast is not the
  // question. A real banded carton puts its facts panel on the SIDE for exactly
  // this reason. The rng() draw is kept so the generator stream is unmoved.
  if (rng() < 0.82 && arch !== 6) {
    nutriPanel(g, x0 + fw * 0.62, H * 0.700, fw * 0.34, H * 0.175, rng,
      cp.panel, PANEL_ROWS[cp.legalKey]);
  }
  barcode(g, x0 + fw * 0.62, H * 0.892, fw * 0.34, H * 0.082, rng);

  // circular claim roundel. cp.badge is NULL for the classes that do not carry
  // one — a coffee tin, a box of foil, a bottle of spring water — and a null
  // badge draws nothing at all rather than falling back to a calorie count.
  if (cp.badge && rng() < 0.5) {
    const nx = x0 + fw * 0.855, ny = H * 0.075, nr = fw * 0.095;
    g.fillStyle = fam === 1 ? ink(14, 250) : ink(255, 175);
    g.beginPath(); g.arc(nx, ny, nr, 0, 6.29); g.fill();
    const nu = cp.badge;
    g.fillStyle = fam === 1 ? ink(255, 130) : ink(12, 250);
    fitText(g, nu[0], nx, ny + nr * 0.10, nr * 1.6, nr * 0.78, FACE.fat, '900');
    fitText(g, nu[1], nx, ny + nr * 0.62, nr * 1.7, nr * 0.34, FACE.grot, '700');
  }

  // ---- plain wrap column: sides / top / bottom of every carton ------------
  g.fillStyle = fam === 0 ? ink(14, 236) : (fam === 1 ? ink(255, 178) : ink(255, 84));
  g.fillRect(0, 0, M, H);
  g.fillStyle = ink(255, fam === 2 ? 54 : 150);
  g.fillRect(0, 0, M, H * (fam === 1 ? 0.10 : 0.135));
  g.fillStyle = ink(255, fam === 2 ? 60 : 165);
  g.fillRect(0, H - H * 0.085, M, H * 0.085);
  g.save();
  g.translate(M * 0.52, H * 0.52); g.rotate(-Math.PI / 2);
  g.fillStyle = fam === 2 ? ink(30, 220) : ink(16, 70);
  fitText(g, brand + '  ' + desc, 0, 0, H * 0.55, M * 0.30, FACE.grot, '700');
  g.restore();
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(M - 3, 0, 3, H);

  varnish(g, 0, 0, W, H * 0.42);
  edgeShade(g, M, 0, W - M, H, 0.34);
}

// ---------------------------------------------------------------------------
// POUCH ATLAS — bags of chips, candy, frozen veg. Film, not board: crinkle
// highlights, a big centred wordmark and a hard specular streak.
export function pouchAtlas(THREE) {
  const A = ATLAS.pouch;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xB0FFE);
  const M = A.cw * A.wrap;

  for (let i = 0; i < A.cols * A.rows; i++) {
    const W = A.cw, H = A.ch;
    g.save();
    g.translate((i % A.cols) * W, Math.floor(i / A.cols) * H);
    setTypeCtx('pouch', i);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.textBaseline = 'alphabetic';

    const dark = i % 3 === 2;
    g.fillStyle = dark ? ink(255, 120) : ink(255, 205);
    g.fillRect(0, 0, W, H);
    // ROUND 22 — the press, before the crinkle so the film reads over the print.
    const PP = pressPouch(g, M, W - M, H, i, { dark });
    // crinkle — film never lies flat
    //
    // ROUND 22 — FOUND, NOT CAUSED: this loop strokes rgba(255,255,255,a) with
    // a up to 0.30, i.e. it writes ALL THREE CHANNELS. That is precisely the
    // round-12 fault this file's own header describes ("a neutral shading term
    // is not darken or lighten — b is an INDEX, not a level"), still live in
    // the one term round 12 did not reach. On the r21 build every bag in the
    // store carries a b-channel wash of 10-76 from it, which the shader decodes
    // as 16% GOLD to 20% GREEN over the whole face; the pouch atlas's measured
    // b-channel occupancy in the r21 arm is quoted in the r22 report.
    //
    // The fix is the form glint() and the specular streaks below already use:
    // raise g, leave r and b alone. It is gated on PRESS so the control arm
    // stays byte-identical to r21 and the A/B keeps one variable — the size of
    // this term alone is measured and reported separately.
    //
    // THE RNG DRAW COUNT IS IDENTICAL IN BOTH ARMS. `a` is drawn once and used
    // by both branches: taking a second draw for the green level would advance
    // the stream and hand the r21 arm different BRANDS, which would make the
    // A/B a comparison of two stores rather than of two inks.
    if (PRESS.on) g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 190; k++) {
      const a = rr(rng, 0.04, 0.30);
      g.strokeStyle = PRESS.on ? rgba(0, 170, 0, a) : rgba(255, 255, 255, a);
      g.lineWidth = rr(rng, 0.5, 2.6);
      g.beginPath();
      let x = rng() * W, y = rng() * H;
      g.moveTo(x, y);
      for (let q = 0; q < 3; q++) g.lineTo(x += rr(rng, -20, 20), y += rr(rng, -20, 20));
      g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    // sealed crimp top and bottom
    g.fillStyle = ink(255, dark ? 78 : 150);
    g.fillRect(0, 0, W, H * 0.085); g.fillRect(0, H - H * 0.10, W, H * 0.10);
    for (let k = 0; k < W; k += 3) {
      g.fillStyle = rgba(255, 255, 255, 0.16);
      g.fillRect(k, 0, 1.3, H * 0.085);
      g.fillRect(k, H - H * 0.10, 1.3, H * 0.10);
    }

    // ROUND 15 — 'P': this atlas is bags and stand-up pouches, so it draws from
    // the products that are actually SOLD in one. Round 14 drew any descriptor
    // from the cell's department, which is how a pouch got a boxed cake mix.
    const cpp = copyForSku(rng, PLAN.pouch[i].row, 'P');
    const pdesc = cpp.desc;
    const LOGE = logCell('pouch', i, cpp, null);
    // no plate of food on a bag of cotton pads — see cartonDesign's nonFood
    logPhoto(LOGE, M + (W - M) * 0.52, H * 0.655, (W - M) * 0.42, H * 0.255);
    depict(g, M + (W - M) * 0.52, H * 0.655, (W - M) * 0.42, H * 0.255, rng, cpp);

    const brand = pk(rng, BRANDS);
    LOGE.brand = brand;
    g.fillStyle = ink(14, 250);
    g.fillRect(M + 3, H * 0.19, W - M - 8, H * 0.155);
    g.fillStyle = ink(255, 130);
    fitText(g, brand, M + (W - M) * 0.5, H * 0.305, (W - M) * 0.86, H * 0.125,
      pk(rng, [FACE.fat, FACE.impact, FACE.geo, FACE.script]), '900');
    g.fillStyle = dark ? ink(20, 245) : ink(12, 40);
    fitText(g, pdesc, M + (W - M) * 0.5, H * 0.395, (W - M) * 0.84, H * 0.055,
      FACE.grot, '800');
    g.fillStyle = ink(255, dark ? 225 : 118);
    g.fillRect(0, H * 0.425, W, H * 0.052);
    g.fillStyle = ink(dark ? 255 : 12, dark ? 45 : 250);
    fitText(g, cpp.flash, M + (W - M) * 0.5, H * 0.466, (W - M) * 0.7,
      H * 0.040, FACE.fat, '900');

    legalBlock(g, M + 4, H * 0.845, (W - M) * 0.5, 4, H * 0.019, rng, ink(20, 92),
      cpp.legal);
    g.fillStyle = ink(14, 245);
    fitText(g, cpp.wt, M + 4, H * 0.825, (W - M) * 0.46, H * 0.036,
      FACE.grot, '700', 'left');
    barcode(g, M + (W - M) * 0.66, H * 0.845, (W - M) * 0.30, H * 0.075, rng);

    // hard specular streaks — this is how a viewer instantly reads "plastic".
    // Only the GREEN channel is raised: adding white here (round 2) also
    // pushed r and b, which silently shifted the brand amount and the food
    // palette band of every bag in the store.
    for (const [ox, ow, amt, rot] of [[0.30, 0.055, 150, -0.34], [0.66, 0.030, 90, 0.28]]) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.translate(W * ox, H * 0.5); g.rotate(rot);
      const st = g.createLinearGradient(-W * ow, 0, W * ow, 0);
      st.addColorStop(0, 'rgba(0,0,0,0)');
      st.addColorStop(0.5, `rgba(0,${amt},0,1)`);
      st.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = st; g.fillRect(-W * ow, -H, W * ow * 2, H * 2);
      g.restore();
    }
    // scattered blown highlights where the film creases — the noise-driven
    // glint that separates a wrapped pack from a printed carton
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 46; k++) {
      const gx = rng() * W, gy = rr(rng, H * 0.06, H * 0.94);
      const gr2 = rr(rng, 2.5, 11);
      const rad = g.createRadialGradient(gx, gy, 0, gx, gy, gr2);
      rad.addColorStop(0, `rgba(0,${ri(rng, 80, 190)},0,1)`);
      rad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rad;
      g.fillRect(gx - gr2, gy - gr2, gr2 * 2, gr2 * 2);
    }
    g.globalCompositeOperation = 'source-over';

    g.fillStyle = dark ? ink(255, 108) : ink(255, 190);
    g.fillRect(0, 0, M, H);
    g.fillStyle = ink(255, dark ? 78 : 150);
    g.fillRect(0, 0, M, H * 0.085); g.fillRect(0, H - H * 0.10, M, H * 0.10);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(M - 3, 0, 3, H);
    edgeShade(g, M, 0, W - M, H, 0.30);
    g.restore();
  }
  setTypeCtx(null);
  registerBake('pouch');
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// CAN ATLAS — one full label per cell. unitCellUV folds the cylinder's u so
// the whole label lands on the front-facing half; the hidden back takes the
// squashed edge. That beats wrapping, which only ever showed a fragment.
//
// =========================================================================
// ROUND 18 — THE CELL IS LAID OUT IN OBJECT HEIGHT NOW, SO IT CAN CARRY A LID.
//
// Until this round the vertical layout below was decorative. LatheGeometry's v
// is a POINT INDEX, so the barrel of a `rim` can carried v 0.445..0.555 and the
// other 89% of this canvas was smeared over the two end discs and the rolled
// rims — see the block above latheBands() and the `barrel` note in plan.js.
// Every symptom round 17's critic named follows from that one fact:
//
//   "not one cylinder carries a readable wordmark"  — it was on the base disc
//   "...a rim ellipse or a lid"                     — they carried the legal
//                                                     block and the barcode
//   "the print collapses into vertical smear"       — a x7.4 vertical stretch
//                                                     divides |dL/dy| by 7.4
//                                                     and leaves |dL/dx| alone
//
// unitCellUV now maps the BARREL to ATLAS.can.barrel = [0.085, 0.870] and
// gives everything above and below it the rest of the cell, so in canvas rows:
//
//     0.000 .. 0.130 H   LID   — centre at the top, rolled rim at the bottom
//     0.130 .. 0.915 H   THE LABEL
//     0.915 .. 1.000 H   BASE  — rolled rim at the top, foot disc at the bottom
//
// The lid and base bands are RADIAL on a lathe: canvas y 0 is the centre of the
// disc and canvas y 0.130H is its outer edge, so a horizontal line drawn in
// that band comes out as a RING. That is where the rim ellipse comes from — it
// is not painted as an ellipse anywhere, it is a straight line through a
// radial unwrap, which is the only way it can be right for all four outlines.
//
// AND THE CURVATURE GRADIENT IS GONE. Round 12 moved it into the print-
// brightness channel, which was right, and left it at alpha 0.52 at both edges
// of every cell — a full-height ramp on both sides of every can in the store,
// i.e. the single largest |dL/dx| term in the class whose defect is that it has
// too much |dL/dx|. It was also a DOUBLE COUNT: the 3D cylinder's own normals
// already darken toward the silhouette, and light.js shades them again. What is
// left here is 0.14, which is the label's own ink losing contrast as it turns
// away, and not the shading.
export function canAtlas(THREE) {
  const A = ATLAS.can;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xCA5);
  const REP = 1;
  // the three bands unitCellUV hands us, as canvas fractions
  const LID = 1 - ATLAS.can.barrel[1];      // 0.130
  const FOOT = 1 - ATLAS.can.barrel[0];     // 0.915

  for (let i = 0; i < A.cols * A.rows; i++) {
    const W = A.cw, H = A.ch, seg = W / REP;
    g.save();
    g.translate((i % A.cols) * W, Math.floor(i / A.cols) * H);
    setTypeCtx('can', i);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.textBaseline = 'alphabetic';

    // ROUND 3: half the cells were bare white stock carrying two thin brand
    // stripes, and after the cylindrical shading multiply they rendered as pale
    // grey tubes with no colour anywhere. Real canned goods are dominated by a
    // full-width brand field. Pale cells keep a white label PANEL but sit it on
    // a coloured ground, top and bottom.
    //
    // ROUND 12 — ROUND 3 MOVED THE RATIO THE RIGHT WAY AND STOPPED TOO EARLY.
    // `i % 3 !== 2` is TWO cans in every THREE carrying a bare-white panel over
    // 44% of the label. Measured over the printed front of the whole can atlas:
    // 41.7% of its area sits below coverage 0.1 and only 13.8% above 0.9 —
    // against cartons at 18.8%/47.2% and pouches at 15.5%/53.0%. The canned
    // aisle was the least-inked family in the store.
    //
    // It should be the MOST inked. reference/store_01_Canned_and_packaged_tuna_
    // on_supermarket_shelves.jpg is a wall of tuna in near-full-bleed blue, red
    // and yellow: measured over the can wall (crop 0.02,0.06-0.98,0.62) it runs
    // C* 17.1 at L* 57.6 with 20.1% of its pixels over C*34. A Campbell's-style
    // white panel is real, but it is one can in three, not two, and it is a
    // panel rather than most of the label.
    //
    // ROUND 18 keeps that ratio and gives the panel a JOB: it is the wordmark
    // plate. The reference frame above is a wall of Bumble Bee — a dark band, a
    // light plate carrying the wordmark, a red accent, a light lower field —
    // and what makes it read as a can from across an aisle is that every one of
    // those edges is a full-width HORIZONTAL line.
    const pale = i % 3 === 2;

    // ---- the label ground -------------------------------------------------
    const L0 = H * LID, L1 = H * FOOT, LH = L1 - L0;
    g.fillStyle = ink(255, pale ? 175 : 150);
    g.fillRect(0, 0, W, H);

    // ---- THE END STRUCTURE -------------------------------------------------
    // ROUND 20. These rows are not chosen; they are READ OFF THE LIVE UNWRAP.
    // With RADIAL_W at 0.10 (see its block above), latheBands hands can/rim:
    //
    //     y 0.0000..0.0445  the recessed end panel, RADIAL (centre -> edge)
    //     y 0.0445..0.0752  the countersink wall the lid sits in
    //     y 0.0752..0.1027  THE ROLLED RIM WALL          <- CAN_RING
    //     y 0.1027..0.1300  the chamfer down onto the label
    //     y 0.9150..0.9347  the chamfer up from the label
    //     y 0.9347..0.9544  the base rolled rim wall     <- CAN_RING_B
    //     y 0.9544..0.9767  the foot chamfer
    //     y 0.9767..1.0000  the base disc, RADIAL
    //
    // can/tub's snap-lid rim lands at 0.0699..0.1142 and can/jar's lug-lid wall
    // at 0.0307..0.0691, so one cell serves all three. endCheck() reads those
    // three numbers off the GPU every load and complains if a future profile
    // change moves a wall out from under the ring drawn for it.
    //
    // AND THE VALUES ARE THE POINT, NOT ONLY THE ROWS. What r19's critic could
    // not find on any cylinder is the thing that identifies a can in
    // reference/store_01_Canned_and_packaged_tuna_on_supermarket_shelves.jpg:
    // between every two stacked cans there is a BRIGHT / DARK / BRIGHT triple —
    // rolled rim, seam shadow, bare tinplate — running the full width. The r19
    // build had that sequence at print brightness 205 / 96 / 150, i.e. albedo
    // 0.81 / 0.40 / 0.61, sitting BETWEEN the label's own dark band (0.40) and
    // its white plate (0.96), across 0.6-1.7 px of a 144 px cell. It is not that
    // the rim was missing; it is that it was mid-grey and sub-texel, so the mip
    // chain had nothing to carry. Bare tinplate is the BRIGHTEST thing on a can,
    // and the seam under it is the darkest.
    //
    // MEASURED, and it is the only cross-mip figure this round quotes. Strongest
    // |d albedo| step inside the end zones (cell rows 0.000-0.145 and 0.900-1.000,
    // averaged over all 24 cells, u 0.30-0.70, g through the shader's own
    // 0.045 + 0.955g, BOX mip down the v axis only because anisotropy 16 keeps u):
    //
    //     mip   cell rows    TOP r19 -> r20      BOTTOM r19 -> r20
    //      0       144       0.337 -> 0.480      0.340 -> 0.478
    //      1        72       0.215 -> 0.429      0.342 -> 0.511
    //      2        36       0.110 -> 0.248      0.242 -> 0.291
    //      3        18       0.021 -> 0.099      0.146 -> 0.186
    //
    // and horizontal steps over 0.15 down a whole cell: 24.6 -> 30.0 at mip 0,
    // 19.2 -> 23.4 at mip 1, 9.6 -> 14.0 at mip 2, 4.1 -> 5.5 at mip 3.
    //
    // THE FIRST DRAFT LOST ROW FOUR AND THE TABLE IS WHY IT WAS CAUGHT. With the
    // base disc at 128 the mip-3 BOTTOM read 0.131 against r19's 0.146 — 11%
    // WORSE — because the bottom zone is 0.085 of the cell, which is 1.5 rows at
    // that level, and four alternating bands average back into one. r19 spent the
    // same band on a single wide bright ring and won there. Darkening the disc
    // and the foot chamfer (the two surfaces on a can that never see a lamp) puts
    // the step back at 0.186. Nothing was retuned to chase the number at mips 0-2;
    // they were already ahead and went further ahead.
    const LG = PACK_ENDS.legacy;
    const ring = (a, b, r, gg) => { g.fillStyle = ink(r, gg); g.fillRect(0, H * a, W, H * (b - a)); };
    if (LG) {
      // ---- r19, kept verbatim as the A/B control --------------------------
      ring(0.000, 0.030, 8, 118);
      ring(0.030, 0.042, 8, 172);
      ring(0.042, 0.070, 8, 128);
      ring(0.070, 0.082, 8, 176);
      ring(0.082, 0.104, 8, 112);
      ring(0.104, LID - 0.006, 8, 205);
      ring(LID - 0.006, LID, 8, 96);
      if (i % 4 !== 3) {
        g.fillStyle = ink(8, 158);
        g.fillRect(W * 0.30, H * 0.012, W * 0.40, H * 0.010);
        g.fillStyle = ink(8, 92);
        g.fillRect(W * 0.30, H * 0.022, W * 0.40, H * 0.005);
      }
      ring(FOOT, FOOT + 0.008, 8, 92);
      ring(FOOT + 0.008, FOOT + 0.030, 8, 198);
      ring(FOOT + 0.030, FOOT + 0.055, 8, 104);
      ring(FOOT + 0.055, 1.000, 8, 132);
    } else {
      ring(0.0000, 0.0180, 8, 116);      // centre of the stamped end panel
      ring(0.0180, 0.0250, 8, 172);      // the first stamped ring, bright
      ring(0.0250, 0.0360, 8, 124);
      ring(0.0360, 0.0445, 8, 152);      // outer end panel, up to the countersink
      ring(0.0445, 0.0752, 8, 72);       // the countersink the lid sits in — deep
      ring(0.0752, 0.1027, 8, 236);      // THE ROLLED RIM. Bright bare steel.
      ring(0.1027, 0.1300, 8, 56);       // the shadow it throws onto the label
      // pull tab: a short bar across the middle of the end panel, so a can seen
      // from slightly above reads as OPENABLE rather than as a disc.
      if (i % 4 !== 3) {
        g.fillStyle = ink(8, 158);
        g.fillRect(W * 0.30, H * 0.0060, W * 0.40, H * 0.0070);
        g.fillStyle = ink(8, 92);
        g.fillRect(W * 0.30, H * 0.0130, W * 0.40, H * 0.0035);
      }
      // ---- BASE: the same, upside down -------------------------------------
      ring(FOOT + 0.0000, FOOT + 0.0197, 8, 60);    // shadow above the base rim
      ring(FOOT + 0.0197, FOOT + 0.0394, 8, 224);   // the base rolled rim
      ring(FOOT + 0.0394, FOOT + 0.0617, 8, 76);    // the foot chamfer
      // The base disc faces the shelf and is the one surface on a can that is
      // never lit. It was 128 and is 100 for a measured reason as well as a
      // physical one: the bottom end zone is 0.085 of the cell, which is 1.5
      // rows at mip 3, so it resolves as ONE step against the tinplate above it
      // — and r19's happened to be slightly larger than r20's first draft.
      // Darkening the disc puts that step at 0.157 modelled against r19's 0.140.
      ring(FOOT + 0.0617, 1.0000, 8, 100);          // the base disc, in shadow
    }

    // ---- THE LABEL, in full-width horizontal bands -------------------------
    // fractions OF THE LABEL BAND, so the layout survives a cell resize.
    //
    // ROUND 20 — THE PAPER DOES NOT REACH THE SEAM. A can's label is a wrapper
    // 5-8% of the body short of the rim at each end, and the tinplate that shows
    // is brighter than any ink on it. r19 gave that 3.0% of the barrel at the
    // top and 4.0% at the bottom, at g 150 and 146 — darker than the label's own
    // white plate, so there was no light band at all. PR0/PR1 below is where the
    // PAPER starts and stops; p() is print space, 0 at the top of the paper and
    // 1 at the bottom, so every position below is a position ON THE LABEL and
    // the tinplate is outside it by construction.
    const y = (f) => L0 + LH * f;
    const PR0 = LG ? 0.030 : 0.076, PR1 = LG ? 0.960 : 0.940;
    const p = (f) => y(PR0 + f * (PR1 - PR0));
    const band = (f0, f1, r, gg, fill) => {
      g.fillStyle = fill || ink(r, gg);
      g.fillRect(0, p(f0), W, (p(f1) - p(f0)));
    };
    const steel = (f0, f1, gg) => {
      g.fillStyle = ink(8, gg);
      g.fillRect(0, y(f0), W, LH * (f1 - f0));
    };
    if (LG) { steel(0.000, 0.030, 150); } else {
      steel(0.000, 0.052, 214);                     // BARE TINPLATE above the paper
      steel(0.052, 0.076, 74);                      // the paper's top edge, in shadow
    }
    // ROUND 22 — THE BANDS WERE ALL ONE INK. Every one of these six was
    // ink(255, g) or ink(~20, g): the same per-instance brand hue at a
    // different brightness, or the paper. A can label in
    // reference/store_01_Canned_and_packaged_tuna is a dark band, a light
    // plate, a RED accent and a light lower field — four inks, not one hue in
    // four values. The band GEOMETRY is untouched (endCheck and latheCheck are
    // written against these rows and the r20 mip table was measured on them);
    // only the fill changes, and only when PRESS is on.
    const CL = PRESS.on ? livery('can', i) : null;
    const cink = (role, r, gv) => (CL ? pressBandInk(CL, role, r, gv) : null) || ink(r, gv);
    band(0.000, 0.237, 255, pale ? 120 : 96, cink('top', 255, pale ? 120 : 96));
    band(0.237, 0.256, 255, 245, cink('lit', 255, 245));            // bright keyline
    band(0.256, 0.570, pale ? 14 : 26, pale ? 252 : 244);   // WORDMARK PLATE — paper
    band(0.570, 0.589, 255, pale ? 96 : 250, cink('key', 255, pale ? 96 : 250));
    band(0.589, 0.876, pale ? 255 : 30, pale ? 132 : 236,
      cink('pict', pale ? 255 : 30, pale ? 132 : 236));             // the picture field
    band(0.876, 1.000, 255, pale ? 108 : 88, cink('bot', 255, pale ? 108 : 88));
    // and the one structure a stack of horizontal bands cannot express: a
    // vertical panel with a hard rule down each side. It frames the PICTURE
    // field rather than the wordmark plate, because the wordmark is typeset at
    // 0.62 of the cell and a panel narrower than that would leave its first and
    // last glyphs on a different ground — which is how sampleGround's average
    // ends up guaranteeing contrast that neither end of the string actually has.
    if (CL) pressCanPanel(g, W, p(0.589), p(0.876), i, CL);
    // and the continuous-tone field over the paper. The cylinder's own normals
    // already shade left-to-right; this is the print's own density and gloss,
    // which a lathe has no more of than a box does.
    if (CL) pressTone(g, 0, p(0), W, p(1) - p(0), CL, 0.8);
    if (LG) { steel(0.960, 1.000, 146); } else {
      steel(0.940, 0.962, 78);                      // the paper's bottom edge
      steel(0.962, 1.000, 206);                     // BARE TINPLATE below
    }

    const brand = pk(rng, BRANDS);
    // ROUND 15 — 'N': a can, a jar, a tub or a canister. Round 14's can atlas
    // printed BRIGHTWATER HAMBURGER BUNS and CALDWELL MILK CHOCOLATE BARS
    // because it asked the department and never the shape.
    const cpn = copyForSku(rng, PLAN.can[i].row, 'N');
    const desc = cpn.desc;
    const LOGE = logCell('can', i, cpn, brand);
    const face = pk(rng, [FACE.fat, FACE.serif, FACE.didone, FACE.plate, FACE.geo]);
    for (let r = 0; r < REP; r++) {
      const cx = seg * (r + 0.5);
      // THE WORDMARK SITS IN THE MIDDLE 62% OF THE CELL, AND THAT IS NOT A
      // MARGIN. frontFold maps u linearly to bearing over +/-90 degrees, so the
      // horizontal scale a texel gets on screen is cos(theta): the outer 19% of
      // the cell lives beyond +/-55 degrees where cos < 0.57 and a glyph there
      // is compressed to nothing. Round 17's wordmark ran to 0.90 of the cell
      // and lost its first and last third to the curve before the resolution
      // ever mattered.
      g.fillStyle = pale ? ink(255, 40) : ink(20, 30);
      // TYPE SIZES STAY IN LH, NOT IN PRINT SPACE. The paper is 7% shorter this
      // round; scaling the wordmark with it would put a second variable in the
      // A/B and would move every step in typeCheck's ledger for no reason. Only
      // the POSITIONS go through p().
      fitText(g, brand, cx, p(0.4731), seg * 0.62, LH * 0.185, face, '900');
      g.fillStyle = pale ? ink(20, 70) : ink(20, 96);
      fitText(g, desc, cx, p(0.5538), seg * 0.60, LH * 0.072, FACE.grot, '700');
      // the food picture that fills the middle of nearly every can label.
      // ROUND 15 — a canister of disinfecting wipes and a jar of multivitamins
      // are both form 'N' and neither wants a plate of food on it.
      logPhoto(LOGE, cx, p(0.7333), seg * 0.30, LH * 0.118);
      depict(g, cx, p(0.7333), seg * 0.30, LH * 0.118, rng, cpn);
      g.fillStyle = ink(255, pale ? 246 : 240);
      // ROUND 20 — 0.56 of the cell, and the barcode plate started at 0.66. The
      // flash and the barcode overlapped by 23 px on EVERY cell in this atlas,
      // and the barcode is drawn last and is opaque, so it took the tail off
      // FRENCH STYLE, TRADITIONAL, ANTIBACTERIAL and BUTTER PECAN. See
      // plateCheck() — the ledger that found it and will find the next one.
      fitText(g, cpn.flash, cx, p(0.9677), seg * 0.50, LH * 0.082, FACE.fat, '900');
      legalBlock(g, cx - seg * 0.30, p(0.1075), seg * 0.60, 2, LH * 0.046, rng,
        ink(255, pale ? 235 : 232), cpn.legal);
    }
    // the barcode is SMALL and it is on the bottom band, which is where a can
    // carries it. Round 17 drew it 55% of the cell wide across the middle of
    // the label: a block of pure vertical rule, in the class whose measured
    // defect is that it has too much vertical rule.
    // NOT UNDER THE DIAL, DELIBERATELY. barcode()'s bar loop runs until it fills
    // its width, so its rng consumption is a function of `w` — putting the width
    // under PACK_ENDS would desynchronise the generator for every cell after the
    // first, and the legacy plate would carry different BRANDS as well as
    // different ends. The A/B has to isolate one variable, so the erasure fix
    // ships in both modes and the evidence for it is the r19 atlas itself
    // (shots/r20p_canatlas_g.png, baked before any edit this round).
    barcode(g, seg * 0.775, p(0.9140), seg * 0.190, LH * 0.062, rng);

    // Curvature at a tenth of round 17's strength — see the header. The
    // silhouette darkening is the geometry's job and it already does it twice.
    const e = g.createLinearGradient(0, 0, W, 0);
    e.addColorStop(0.00, 'rgba(255,0,255,0.14)');
    e.addColorStop(0.22, 'rgba(255,0,255,0.01)');
    e.addColorStop(0.50, 'rgba(255,0,255,0.00)');
    e.addColorStop(0.80, 'rgba(255,0,255,0.03)');
    e.addColorStop(1.00, 'rgba(255,0,255,0.14)');
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = e; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    // ONE narrow specular band on the tinplate, and only over the LABEL. Round
    // 17 ran two of them the full height of the cell, which put a vertical
    // streak through the lid and the base as well as the print.
    // ROUND 20 — over the PAPER only, p(0)..p(1). It used to run y(0.030) to
    // y(0.960), which is now the bare tinplate at either end: g 214 plus this
    // term's +96 clips to 255, and a clipped band across the brightest surface
    // on the can is a bloom source at aisle range for no gain — the metal is
    // already the brightest thing here by its own albedo.
    glint(g, W, H, W * 0.32, W * 0.055, LG ? y(0.030) : p(0), LG ? y(0.960) : p(1), 74, 96);
    g.restore();
  }
  setTypeCtx(null);
  registerBake('can');
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// BOTTLE ATLAS — shrink-film label around a lathe, front-folded like the can.
//
// =========================================================================
// ROUND 18 — THE CAP WAS DRAWN ON THE BOTTOM OF THE BOTTLE.
//
// The round-16 cell carried this comment —
//
//     // v runs 0 = bottom of the lathe profile, 1 = cap
//
// — and then drew the closure and its knurl at canvas y 0.90..1.00, which is
// v 0.00..0.10, which is the FOOT. And the "clear liquid below label" went to
// canvas y 0.00..0.34, i.e. v 0.66..1.00, which is the neck and the cap. The
// prose was right and the drawing was upside down against it, for every bottle,
// jug, jar and trigger spray in the store. Nothing could catch it because
// nothing connected the artwork's rows to the geometry's — the same missing
// contract that let LatheGeometry's point-index v squeeze the whole label onto
// 12.5% of the cell. See the `barrel` note in plan.js.
//
// Both are now one contract. unitCellUV maps the BARREL to
// ATLAS.bottle.barrel = [0.090, 0.660], so in canvas rows:
//
//     0.000 .. 0.075 H   the cap's crown, read RADIALLY (a lathe's top disc)
//     0.075 .. 0.135 H   the closure wall, with its knurl
//     0.135 .. 0.235 H   the neck
//     0.235 .. 0.340 H   the shoulder
//     0.340 .. 0.910 H   THE LABEL
//     0.910 .. 1.000 H   the foot
//
// measured off the soda profile's own arc weights; the jug, jar and spray land
// within a few percent of it, which is what latheCheck() bounds.
//
// AND THE GHOSTED GLASS IS GONE. r17 shipped WINDROW COUGH SYRUP and
// PENNYWHISTLE as light type on light ground; the cause is in the header above
// fitText() — the old plate was ink(255,232) and the wordmark ink(14,250),
// which differ almost entirely in the BRAND channel and so have a contrast of
// luma(brand)/luma(paper): fine on navy, zero on cream. Nine of these eighteen
// cells were that pair. The plate and its type now differ in the PRINT
// BRIGHTNESS channel, where the step holds for every brand colour, and
// fitText() enforces it whatever a future edit here asks for.
export function bottleAtlas(THREE) {
  const A = ATLAS.bottle;
  const [c, g] = cv(A.cw * A.cols, A.ch * A.rows);
  const rng = makeRng(0xB07);
  const REP = 1;
  const CAP = 1 - ATLAS.bottle.barrel[1];    // 0.340 — everything above the label
  const FOOT = 1 - ATLAS.bottle.barrel[0];   // 0.910

  for (let i = 0; i < A.cols * A.rows; i++) {
    const W = A.cw, H = A.ch, seg = W / REP;
    g.save();
    g.translate((i % A.cols) * W, Math.floor(i / A.cols) * H);
    setTypeCtx('bottle', i);
    g.beginPath(); g.rect(0, 0, W, H); g.clip();
    g.textBaseline = 'alphabetic';

    // dark = a solid-colour sleeve (soda, detergent); light = a clear or white
    // bottle with a paper band. Kept at one in two, as before.
    const dark = i % 2 === 0;
    const bar = (a, b, r, gg) => { g.fillStyle = ink(r, gg); g.fillRect(0, H * a, W, H * (b - a)); };

    // ---- the bottle itself, above and below the label ----------------------
    // ROUND 20 — the rows below are READ OFF THE LIVE UNWRAP, not chosen. With
    // RADIAL_W at 0.10 latheBands hands bottle/soda:
    //
    //     y 0.0000..0.0546  the cap crown, RADIAL (centre -> outer edge)
    //     y 0.0546..0.0989  the closure WALL, where the knurl lives
    //     y 0.0989..0.1987  the neck
    //     y 0.1987..0.3400  the shoulder
    //     y 0.9100..1.0000  the base, RADIAL (outer edge at 0.910, centre at 1)
    //
    // jug lands within 0.006 of this and squat within 0.015; spray is a trigger
    // head and cannot match a cap, which endCheck() reports rather than asserts.
    // The r19 artwork put its neck ring at 0.135-0.150 — a full 1.2% of the cell
    // BELOW the cap/neck join at 0.123 — so the one bright line on the closure
    // was painted on the neck.
    const LG = PACK_ENDS.legacy;
    bar(0.000, 1.000, 255, 232);                 // the moulded body
    if (LG) {
      // ---- r19, kept verbatim as the A/B control --------------------------
      bar(0.000, 0.030, 200, 96);
      bar(0.030, 0.075, 200, 132);
      bar(0.075, 0.135, 200, 112);
      for (let k = 0; k < W; k += Math.max(3, W / 44)) {
        g.fillStyle = rgba(0, 0, 0, 0.20); g.fillRect(k, H * 0.078, 1.1, H * 0.055);
      }
      bar(0.135, 0.150, 255, 250);
      bar(0.150, 0.235, 255, 214);
      bar(0.235, CAP, 255, 226);
      bar(FOOT, FOOT + 0.018, 255, 250);
      bar(FOOT + 0.018, 1.000, 255, 196);
    } else {
      bar(0.0000, 0.0230, 200, 92);              // crown of the closure, centre
      bar(0.0230, 0.0546, 200, 138);             // crown, outer
      bar(0.0546, 0.0989, 200, 116);             // THE CLOSURE WALL
      for (let k = 0; k < W; k += Math.max(3, W / 44)) {   // cap knurl
        g.fillStyle = rgba(0, 0, 0, 0.20); g.fillRect(k, H * 0.058, 1.1, H * 0.038);
      }
      bar(0.0989, 0.1120, 255, 250);             // the neck ring under the cap
      bar(0.1120, 0.1987, 255, 210);             // neck
      bar(0.1987, CAP, 255, 228);                // shoulder
      bar(FOOT, FOOT + 0.018, 255, 250);         // the base ring, at the OUTER edge
      bar(FOOT + 0.018, 1.000, 255, 194);        // the punt, in shadow
    }

    // ---- the label ---------------------------------------------------------
    const L0 = H * CAP, L1 = H * FOOT, LH = L1 - L0;
    const y = (f) => L0 + LH * f;
    const band = (f0, f1, r, gg, fill) => {
      g.fillStyle = fill || ink(r, gg);
      g.fillRect(0, y(f0), W, LH * (f1 - f0));
    };
    // ROUND 22 — same one-ink fault as the can, and on the surface that is the
    // whole soda/juice/cleaning aisle. The band GEOMETRY is untouched; only the
    // fill moves, and only with PRESS on.
    const BL = PRESS.on ? livery('bottle', i) : null;
    const bink = (role, r, gv) => (BL ? pressBandInk(BL, role, r, gv) : null) || ink(r, gv);
    band(0.000, 0.030, 255, 252);                            // the film's top edge
    band(0.030, 0.400, dark ? 255 : 20, dark ? 92 : 246,
      bink('pict', dark ? 255 : 20, dark ? 92 : 246));       // picture field
    band(0.400, 0.425, 255, dark ? 236 : 84,
      bink(dark ? 'lit' : 'key', 255, dark ? 236 : 84));     // keyline
    band(0.425, 0.660, dark ? 20 : 20, dark ? 246 : 246);    // WORDMARK PLATE — opaque
    band(0.660, 0.860, dark ? 255 : 255, dark ? 88 : 118,
      bink('top', 255, dark ? 88 : 118));                    // descriptor band
    band(0.860, 0.970, 255, dark ? 132 : 220,
      bink('bot', 255, dark ? 132 : 220));                   // lower band
    band(0.970, 1.000, 255, 252);                            // the film's bottom edge
    if (BL) pressCanPanel(g, W, y(0.030), y(0.400), i, BL);  // the picture window
    if (BL) pressTone(g, 0, y(0), W, y(1) - y(0), BL, 0.8);

    const brand = pk(rng, BRANDS);
    // ROUND 15 — 'B': a bottle, a jug or a spray. Round 14's bottle atlas
    // printed PRAIRIE GOLD YELLOW CAKE MIX and SUMMERLIN CHEESE PUFFS.
    const cpb = copyForSku(rng, PLAN.bottle[i].row, 'B');
    const desc = cpb.desc;
    const LOGE = logCell('bottle', i, cpb, brand);
    const face = pk(rng, [FACE.fat, FACE.script, FACE.geo, FACE.impact]);
    for (let r = 0; r < REP; r++) {
      const cx = seg * (r + 0.5);
      // ROUND 16 — THE BOTTLE ATLAS CARRIED NO PICTURE AT ALL. Eight cells of
      // pure type on a colour band: the flattest, most template-grammar surface
      // in the store, and it is the whole soda/juice/cleaning aisle. A real
      // bottle label is a picture with the wordmark under it, stacked rather
      // than layered — a wordmark over a depiction needs a plate to sit on and
      // the plate then hides the depiction, which is how r16's first draft lost
      // it.
      logPhoto(LOGE, cx, y(0.215), seg * 0.30, LH * 0.150);
      depict(g, cx, y(0.215), seg * 0.30, LH * 0.150, rng, cpb);
      // SOLID, not an alpha wash: chopM.b packs the food hue BAND, and a
      // translucent black over a depiction drags b toward 0, which does not
      // darken a red tomato — it turns it golden. Same trap the shader's
      // unsharp mask sidesteps by sharpening only .rg. Every composite that
      // lands on top of a depiction in this file has to be opaque.
      //
      // ROUND 18 — and the type on it is DARK-ON-LIGHT or LIGHT-ON-DARK in the
      // PRINT channel, never brand-on-brand. The middle 62% of the cell, for
      // the reason in the can atlas: frontFold spreads the cell over +/-90
      // degrees of bearing, so the outer fifth is compressed by cos(theta) to
      // nothing before resolution is even the question.
      g.fillStyle = dark ? ink(255, 30) : ink(20, 34);
      fitText(g, brand, cx, y(0.585), seg * 0.62, LH * 0.155, face, '900');
      g.fillStyle = dark ? ink(20, 250) : ink(20, 248);
      fitText(g, desc, cx, y(0.760), seg * 0.60, LH * 0.088, FACE.grot, '800');
      g.fillStyle = dark ? ink(20, 250) : ink(20, 248);
      fitText(g, cpb.flash, cx, y(0.840), seg * 0.50, LH * 0.062, FACE.fat, '900');
      legalBlock(g, cx - seg * 0.30, y(0.895), seg * 0.60, 2, LH * 0.036, rng,
        dark ? ink(255, 236) : ink(40, 150), cpb.legal);
    }
    barcode(g, seg * 0.68, y(0.880), seg * 0.22, LH * 0.058, rng);

    // Curvature, at a fifth of round 17's strength. It was 0.70 alpha at both
    // edges of every cell — a full-height ramp on both sides of every bottle in
    // the store, in the class whose measured defect is exactly that it carries
    // too much |dL/dx|, and a double count besides: the lathe's own normals
    // darken toward the silhouette and light.js shades them again.
    const e = g.createLinearGradient(0, 0, W, 0);
    e.addColorStop(0.00, 'rgba(255,0,255,0.16)');
    e.addColorStop(0.18, 'rgba(255,0,255,0.01)');
    e.addColorStop(0.55, 'rgba(255,0,255,0.00)');
    e.addColorStop(0.86, 'rgba(255,0,255,0.05)');
    e.addColorStop(1.00, 'rgba(255,0,255,0.16)');
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = e; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
    // ONE hard elongated streak — this is how a viewer reads "PET bottle" in a
    // single glance, and it is the mirror strip down every bleach jug in the
    // reference photography. It runs the FULL height here on purpose: on a
    // moulded bottle the highlight really does cross the cap and the foot,
    // which is not true of a can's paper label.
    glint(g, W, H, W * 0.265, W * 0.055, 0, H, 46, 128);
    g.restore();
  }
  setTypeCtx(null);
  registerBake('bottle');
  return maskTex(THREE, c);
}

// ---------------------------------------------------------------------------
// SHELF-TAG ATLAS — sRGB colour, not a mask. Real tags are dominated by one
// large bold price numeral, black on white, plus a UPC block and a caps
// description. store.js emits ONE tag per SKU run so the rhythm is irregular
// and matches the facing width above it, instead of a moiring ribbon.
// The three orphan states. A bare bay in a real store almost never has a bare
// RAIL — it has the holder still clipped on with nothing, or something curled
// and bleached, or half a tag someone tore off. Round 2 had no vocabulary for
// this at all because round 2 had no bare bays.
function orphanTag(g, variant, CW, CH, rng) {
  if (variant === 0) {                       // empty extruded channel
    const grd = g.createLinearGradient(0, 0, 0, CH);
    grd.addColorStop(0, '#cfc7b2'); grd.addColorStop(0.30, '#8b8371');
    grd.addColorStop(0.55, '#5d5647'); grd.addColorStop(0.80, '#9b9380');
    grd.addColorStop(1, '#6e6757');
    g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(255,252,240,0.45)'; g.fillRect(0, 1, CW, 2.5);
    g.fillStyle = 'rgba(28,25,19,0.55)'; g.fillRect(0, CH * 0.34, CW, 3);
    for (let k = 0; k < 8; k++) {            // adhesive residue and grime
      g.fillStyle = `rgba(${ri(rng, 90, 150)},${ri(rng, 84, 140)},${ri(rng, 70, 120)},${rr(rng, 0.10, 0.30)})`;
      g.fillRect(rr(rng, 0, CW), rr(rng, CH * 0.2, CH * 0.8), rr(rng, 6, 40), rr(rng, 3, 12));
    }
    return;
  }
  if (variant === 1) {                       // bleached blank, curled corner
    g.fillStyle = '#efe9d6'; g.fillRect(0, 0, CW, CH);
    g.fillStyle = 'rgba(196,182,150,0.45)'; g.fillRect(0, 0, CW, CH * 0.16);
    g.strokeStyle = 'rgba(120,110,90,0.5)'; g.lineWidth = 2;
    g.strokeRect(1, 1, CW - 2, CH - 2);
    g.fillStyle = 'rgba(150,138,112,0.30)';
    for (let k = 0; k < 5; k++) {            // ghost of the print that faded
      g.fillRect(CW * 0.08, CH * (0.30 + k * 0.13), rr(rng, CW * 0.18, CW * 0.62), CH * 0.045);
    }
    g.fillStyle = '#ded6c0';                 // the curl
    g.beginPath();
    g.moveTo(CW, CH); g.lineTo(CW - CH * 0.42, CH); g.lineTo(CW, CH * 0.55);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(110,100,82,0.55)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(CW - CH * 0.42, CH); g.lineTo(CW, CH * 0.55); g.stroke();
    g.fillStyle = 'rgba(150,138,112,0.55)'; g.fillRect(0, 0, CW * 0.02, CH);
    return;
  }
  // torn remnant: half a tag left in the channel, ragged edge
  g.fillStyle = '#6b6454'; g.fillRect(0, 0, CW, CH);
  g.fillStyle = 'rgba(28,25,19,0.5)'; g.fillRect(0, CH * 0.34, CW, 3);
  g.fillStyle = '#fdf9ec';
  g.beginPath();
  g.moveTo(0, 0); g.lineTo(CW * 0.40, 0);
  for (let k = 0; k <= 8; k++) {
    g.lineTo(CW * (0.40 + rr(rng, -0.05, 0.05)), CH * (k / 8));
  }
  g.lineTo(0, CH); g.closePath(); g.fill();
  g.fillStyle = '#26241f';
  g.textAlign = 'left';
  fitText(g, String(ri(rng, 1, 9)), 6, CH * 0.62, CW * 0.30, CH * 0.46, FACE.fat, '900', 'left');
  g.fillStyle = 'rgba(120,110,90,0.5)';
  g.fillRect(0, 0, CW * 0.022, CH);
}

// ROUND 19 — THE PRICE RAIL JOINS THE GUARANTEE.
//
// AGENTS_BRIEF lists price-tag rails as bar item #4 — "a huge density cue,
// almost always missing in game supermarkets" — and this atlas is what is
// printed on every one of them. r18 shipped a contrast guarantee, a self-test
// proving it fires, and a ledger, and this file wrote 0 of the 688 logged runs:
// `setTypeCtx` was called for the four mask atlases and never here. The price
// numeral, the cents, the currency mark, the struck-through was-price, the
// marker date and the UPC digits were ten raw `fillText` calls, and the one
// `fitText('CLEARANCE')` in the file no-opped its contrast step because
// TYPE_CTX was null.
//
// Every readable string on a tag now goes through fitText in `direct` mode, and
// the whole bake runs inside withTypeAudit so any string added later that
// bypasses it is COUNTED rather than merely unnoticed.
export function tagAtlas(THREE) {
  const COLS = TAG_COLS, ROWS = TAG_ROWS, CW = 256, CH = 128;
  const [c, g] = cv(CW * COLS, CH * ROWS);
  const rng = makeRng(0x7A65);
  tagCells(g, COLS, ROWS, CW, CH, rng);
  setTypeCtx(null);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function tagCells(g, COLS, ROWS, CW, CH, rng) {
  for (let i = 0; i < COLS * ROWS; i++) {
    setTypeCtx('tag', i, 'direct');
    g.save();
    g.translate((i % COLS) * CW, Math.floor(i / COLS) * CH);
    g.beginPath(); g.rect(0, 0, CW, CH); g.clip();
    g.textBaseline = 'alphabetic';

    if (i >= TAG_SKU) { orphanTag(g, i - TAG_SKU, CW, CH, rng); g.restore(); continue; }
    // ROUND 9 — CLEARANCE. Blind test 8 named the missing third state by
    // name: "white, yellow sale, orange clearance". A clearance card is not a
    // recolour of a sale card — it is a different DOCUMENT: full-bleed orange,
    // no unit price (the item is going away), the old price struck through,
    // and a hand-written reduction date because a department manager wrote it
    // on with a marker at 6 a.m.
    const clear = i === 2 || i === 9;
    const sale = !clear && i % 5 === 4, yellow = !clear && i % 7 === 3;
    g.fillStyle = clear ? '#f07018' : (sale ? '#ffe418' : (yellow ? '#fff6b0' : '#ffffff'));
    g.fillRect(0, 0, CW, CH);
    g.strokeStyle = 'rgba(70,64,54,0.55)'; g.lineWidth = 2;
    g.strokeRect(1, 1, CW - 2, CH - 2);
    if (sale) {
      g.fillStyle = '#d21f16'; g.fillRect(0, 0, CW, CH * 0.20);
      g.fillStyle = '#fffdf2'; g.textAlign = 'left';
      fitText(g, 'SALE PRICE', 5, CH * 0.16, CW * 0.5, CH * 0.15, FACE.fat, '900', 'left');
    }
    if (clear) {
      g.fillStyle = '#1d1a16'; g.fillRect(0, 0, CW, CH * 0.24);
      g.fillStyle = '#ffd9a8'; g.textAlign = 'left';
      fitText(g, 'CLEARANCE', 5, CH * 0.19, CW * 0.62, CH * 0.18, FACE.fat, '900', 'left');
      // struck-through was-price, top right
      g.fillStyle = '#7a3a12';
      const was = `$${ri(rng, 2, 9)}.${String(ri(rng, 10, 99))}`;
      const ww = fitText(g, was, CW * 0.70, CH * 0.41, CW * 0.28, CH * 0.15,
        FACE.grot, '800', 'left');
      g.fillStyle = '#7a3a12';
      g.fillRect(CW * 0.70 - 2, CH * 0.36, ww + 4, 2.4);
      // the marker date somebody wrote on it
      g.save();
      g.translate(CW * 0.71, CH * 0.92); g.rotate(rr(rng, -0.10, 0.05));
      g.fillStyle = 'rgba(28,24,20,0.72)';
      fitText(g, `${ri(rng, 1, 12)}/${ri(rng, 10, 28)}`, 0, 0, CW * 0.24, CH * 0.12,
        FACE.mono, '700', 'left');
      g.restore();
    }

    // the big numeral — this is what a shopper's eye locks onto and it is
    // the dominant mark on every tag in every reference photo
    // grocery prices cluster at 99/49/29 cents and rarely start at zero
    const dollars = rng() < 0.16 ? 0 : ri(rng, 1, 9);
    const cents = rng() < 0.55 ? pk(rng, [99, 49, 29, 79, 19, 89, 59, 39]) : ri(rng, 0, 99);
    // The dominant mark on the tag, and — until this round — the single largest
    // piece of type in the store standing outside the contrast guarantee.
    const ink = (sale || clear) ? '#1b1a17' : '#141312';
    g.textAlign = 'left';
    const py = (sale || clear) ? CH * 0.70 : CH * 0.58;
    const big = `${dollars}`;
    g.fillStyle = ink;
    const bw = fitText(g, big, 6, py, CW * 0.40, CH * 0.46, FACE.fat, '900', 'left');
    g.fillStyle = ink;
    fitText(g, String(cents).padStart(2, '0'), 6 + bw + 3, py - CH * 0.15, CW * 0.30,
      CH * 0.30, FACE.fat, '900', 'left');
    g.fillStyle = ink;
    fitText(g, '$', 6 + bw + 3, py, CW * 0.10, CH * 0.13, FACE.grot, '900', 'left');

    // caps description + unit price. A clearance card carries neither: the
    // item is being run out, so the only things on it are the reduction and
    // what it used to cost.
    if (!clear) {
      g.fillStyle = '#26241f';
      fitText(g, pk(rng, BRANDS), CW * 0.45, CH * 0.26, CW * 0.52, CH * 0.16,
        FACE.grot, '800', 'left');
      g.fillStyle = '#3b382f';
      fitText(g, pk(rng, TAG_DESC), CW * 0.45, CH * 0.42, CW * 0.50, CH * 0.125,
        FACE.grot, '600', 'left');
      g.fillStyle = '#55503f';
      fitText(g, `UNIT ${ri(rng, 1, 9)}.${ri(rng, 10, 99)} PER LB`, CW * 0.45, CH * 0.56,
        CW * 0.48, CH * 0.10, FACE.grot, '400', 'left');
    }

    // UPC block bottom-right
    g.fillStyle = '#1a1917';
    let bx = clear ? CW * 1.5 : CW * 0.50;
    while (bx < CW - 8) {
      const w = rr(rng, 0.8, 2.2);
      if (rng() < 0.7) g.fillRect(bx, CH * 0.66, w, CH * 0.20);
      bx += w + rr(rng, 0.7, 1.9);
    }
    g.fillStyle = '#2a2824';
    fitText(g, `${ri(rng, 10000, 99999)} ${ri(rng, 10000, 99999)}`, CW * 0.50, CH * 0.955,
      CW * 0.46, CH * 0.085, FACE.mono, '400', 'left');
    // coloured spine down the left edge, the way ESL-style tags print
    g.fillStyle = clear ? '#8c3a08' : (sale ? '#b8190f' : (yellow ? '#c8a41c' : '#8d8676'));
    g.fillRect(0, 0, CW * 0.022, CH);
    g.restore();
  }
}

// ---------------------------------------------------------------------------
// SHELF-CAVITY GRADIENT — a vertical ramp, near-opaque at the top where the
// shelf above casts, clearing toward the deck. Sold-out voids read as dark
// holes with this behind them instead of beige gaps.
// cavityTex — DELETED IN ROUND 8. It painted the back of every shelf cavity
// with a multiply gradient, neutral rather than brown because (round 5) stacked
// multiply layers compound chroma as well as value. light.js darkens the same
// cavity from the height field instead, per fragment, with each facing's actual
// depth in the hole accounted for, which the card never could.

// ---------------------------------------------------------------------------
// PACKAGE MATERIAL — one mask atlas + a per-instance brand colour + a
// per-instance atlas cell. See the channel contract at the top of the file.
// Sharpen a mapped material by biasing it toward a finer mip level.
//
// WHY. Edge maps of a round-3 render against the reference photography showed
// the deficit precisely: my facings are clean OUTLINES with blank interiors
// past about five metres, while every package in a photograph stays covered in
// internal detail at any distance. That is mipmapping doing exactly what it is
// designed to do — averaging the print away — where a camera's optics do not.
// A negative LOD bias plus the anisotropy already in place puts the printed
// detail back. It costs some shimmer, which a real photograph also has.
export function sharpen(THREE, m, bias = -0.8) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.fragmentShader = sh.fragmentShader.replace(
      'texture2D( map, vMapUv )', `texture2D( map, vMapUv, ${bias.toFixed(2)} )`);
  };
  // the stock implementation reads `this.onBeforeCompile`, so it has to be
  // called bound or it throws inside the renderer's program cache
  const k = m.customProgramCacheKey;
  m.customProgramCacheKey = function () { return k.call(this) + 'sharp' + bias; };
  return m;
}

// `spec` turns the material Phong instead of Lambert. Round-2 shaded cans,
// glossy bottles, foil bags and coated board with one identical matte diffuse,
// and a real aisle is DOMINATED by specular events: the bright vertical band
// down every can, the blown white glint on shrink film, the mirror strip on a
// bleach jug. `gloss` is a GLSL expression over `chopM` (the mask sample) that
// drives per-texel specular strength — feeding it the print-brightness channel
// makes white film crinkle flare while the printed ink stays dull.
// ---------------------------------------------------------------------------
// STAGE PROBE, ROUND 12. One uniform object SHARED by all four package
// materials, so flipping it moves the whole product wall at once and no
// material can be left behind in a different stage than its neighbours.
//
// It exists because round 11's gap — "albedo C*41 arrives as C*15" — is a
// question about a PIPELINE, and the only honest way to answer "where does it
// drop" is to be able to look at each intermediate value in the framebuffer.
// Every stage below is written into gl_FragColor at <colorspace_fragment>, so
// each one is encoded by exactly the same output transform as the shipped
// frame and the numbers are comparable down the column.
//
// UNIFORM-ONLY. AGENTS_BRIEF's instrument-hygiene note is specifically about
// this: stripping a map to ablate a layer drops USE_MAP, breaks the injected
// shader and can hand you two identical PNGs including the "restored" one.
// Nothing here changes a define, a texture binding or a program — only a float
// — so stage 0 is bit-for-bit the shipped path and the restore is free.
//
//   0  shipped render
//   1  vColor                      per-instance brand swatch, linear
//   2  mix( white, vColor, mask.r )   after the ink-coverage mask
//   3  ...after the food-photo overlay
//   4  diffuseColor                after print-brightness = the FULL albedo
//   5  outgoing light, pre-AO      albedo x (key + fill + ambient + hemi)
//   6  post-AO, post-bounce        what light.js hands to the output transform
//   7  flat green                  the product-facing MASK, for region evidence
export const PKG_STAGE = { value: 0 };

// ---------------------------------------------------------------------------
// BARE STOCK, ROUND 12. The colour the un-inked part of a package is mixed
// toward, and until this round it was vec3( 1.0 ) — a PERFECT REFLECTOR, the
// brightest thing physically possible, standing in for coated carton board.
//
// It is set as a uniform, not a constant, so it can be swept and ablated live
// without a recompile:  __CHOP.scene.userData.chopPkgStock.value.setRGB(1,1,1)
// puts round 11 back in one line and proves the restore.
//
// WHY IT MATTERS MORE THAN ITS SIZE SUGGESTS. Mixing a brand swatch toward a
// substrate is how the ink-coverage mask works, and Lab chroma through that
// mix is violently superlinear in coverage. Measured, on four brand swatches,
// as the fraction of the swatch's own C*/L* that survives:
//
//     coverage   0.44   0.66   0.74   0.90   1.00
//     survives    8-14%  18-28% 24-36% 50-62% 100%
//
// So the last tenth of coverage is worth more than the first six.
//
// THAT ARITHMETIC PREDICTED THIS CHANGE WOULD BE WORTH +17% AND IT IS WORTH
// +2%. Measured by uniform ablation on the live page — shipped 0.311, stock
// forced back to (1,1,1) 0.305, restored 0.311 byte-identical to shipped — the
// substrate is one of the SMALLEST terms in the round-12 recovery, not one of
// the largest. Keep the number that was measured, not the one that was
// derived.
//
// The model was wrong because it assumed a facing sits at a UNIFORM 0.66
// coverage. The real atlas is bimodal: 26% of a carton's front is below
// coverage 0.1 and 56% is above 0.9. Pixels at ~0 are bare stock and have
// almost no chroma to lose, so darkening them 15% barely moves C*; pixels at
// ~1.0 never touch the substrate at all. The superlinear payoff is real but it
// only pays where coverage is genuinely mid-range, and hardly any texel is.
//
// It stays in anyway, on physical grounds rather than measured ones: real
// coated SBS board reflects about 0.84 and is faintly warm, and nothing on a
// shelf is a perfect reflector. It is a correction worth 2%, not a dial.
export const PKG_STOCK = { value: null };   // filled with a THREE.Vector3 below

// ---------------------------------------------------------------------------
// PRINT SATURATION, ROUND 13. A LUMA-PRESERVING chroma scale on the package
// artwork, and the only lever in this round that moves the number it is aimed
// at, because that number is exposure-invariant and everything else is not.
//
// WHAT WAS MEASURED. AGENTS_BRIEF retires C*/L* and replaces it with
// C*/(L* + 16), because L* = 116f - 16 means it is (L* + 16) that scales under
// a neutral exposure change, not L*. Run the render's four store lights at
// x1.17, x1.25 and x1.35 on one page load and read the product mask:
//
//     frame median L*   51.6   54.1   55.2   56.4
//     mask C*/(L*+16)  0.322  0.322  0.322  0.322      <- does not move, at all
//
// That is the corrected instrument behaving exactly as advertised, and it is
// also the whole argument for this uniform: the render's printed packaging
// sits at 0.322 lit and 0.290 as pure albedo, against a photo-face median of
// 0.394 over five declared regions of reference/. Under a neutral illuminant
// C*/(L*+16) of a lit diffuse surface IS the albedo's, so those numbers are
// directly comparable — and no lighting change in this round moved it by one
// part in a thousand.
//
// WHY THIS IS NOT THE THING ROUND 13 WAS TOLD NOT TO DO. The instruction was
// "do not simply raise product albedo to fake it", and it is about LIGHTNESS:
// the albedo's L* distribution is already photographic at a median of 65.5 and
// must not be pushed. This scales chroma about the pixel's own luma, so L* is
// held by construction and only a* and b* move. It is the one axis the
// measurement says is short and the one axis that instruction does not cover.
//
// A uniform, not a constant, so it sweeps and ablates live with a byte-exact
// restore:  __CHOP.scene.userData.chopPkgSat.value = 1.0
// 1.22 is not a taste value. It is where the LIT product mask's C*/(L*+16)
// lands on the five-region photo median of 0.394 (measured 0.379 in the
// shipped combination, 0.397 with the lighting held) and where whole-frame
// p90 block-free pixel C* lands on the fourteen-file reference median of 32.6
// (measured 31.8). Swept at 1.10 / 1.25 / 1.40 / 1.60 on one page load with a
// byte-identical restore; 1.40 overshoots the photo median by 17% and 1.60
// puts the aisle past every reference file in the set.
export const PKG_SAT = { value: 1.22 };

// The fragment source that ACTUALLY COMPILED, kept so press.js's transcription
// of the four food swatches can be checked against it rather than against a
// comment. AGENTS_BRIEF has three entries about a second copy of a derivation
// held in sync by coincidence; this is the cheapest available assertion that
// the copy is still true, and it reads the artefact rather than a table.
export const PKG_FRAG = { src: '' };

// THE INJECTED MAP FRAGMENT, hoisted to module scope so press.js's CPU
// transcription of the four food swatches can be checked against the SOURCE
// TEXT rather than against a comment. onBeforeCompile does not run until a
// material is first rendered, so a check that waited for the compiled string
// would be silent on a page that has not yet drawn a package -- which is a
// check that passes because it never runs.
const PKG_MAP_FRAG = (gloss) => `
        vec2 chopUv = vCell + clamp( vMapUv, 0.0015, 0.9985 ) * uCell;
        vec4 chopM = texture2D( map, chopUv, -0.85 );
        // ---- ROUND 7: MAGNIFICATION ------------------------------------
        // "Product blur is depth-independent: a pack half a metre away is as
        // unreadable as one six metres away. That is a magnified low-res atlas
        // behaving as the inverse of a lens."
        //
        // Exactly right, and the number is easy to check. A carton cell is 340
        // px wide and the printed front face gets 85% of it, so a 200 mm facing
        // carries 289 texels. At 600 mm from a 40-degree lens that facing
        // covers 586 pixels. Two screen pixels per texel — the bilinear filter
        // is interpolating, so the near shelf is soft for the same reason a
        // scaled-up JPEG is, and no amount of LOD bias touches it because we are
        // MAGNIFYING, not minifying. Bias only ever selects a mip.
        //
        // Quadrupling every atlas is 55 MB of texture for one shelf's worth of
        // near field. An unsharp mask is the honest alternative: it restores the
        // acutance the sampler threw away, it costs four taps, and it is gated
        // on the actual magnification ratio so it does nothing at all past about
        // a metre and a half — which is where the atlas genuinely does have more
        // texels than the screen has pixels. Only the ink channels are
        // sharpened; chopM.b packs the food-palette band and an over/undershoot
        // there would flip a swatch to a different colour entirely.
        {
          vec2 dpx = fwidth( vMapUv ) * uCell * uAtlasPx;
          float mag = clamp( 1.0 - max( dpx.x, dpx.y ), 0.0, 1.0 );
          if ( mag > 0.04 ) {
            vec2 o = 1.0 / uAtlasPx;
            vec4 lo = texture2D( map, chopUv + vec2( o.x, 0.0 ), -0.85 )
                    + texture2D( map, chopUv - vec2( o.x, 0.0 ), -0.85 )
                    + texture2D( map, chopUv + vec2( 0.0, o.y ), -0.85 )
                    + texture2D( map, chopUv - vec2( 0.0, o.y ), -0.85 );
            chopM.rg = clamp( chopM.rg + ( chopM.rg - lo.rg * 0.25 ) * ( 1.45 * mag ),
                              0.0, 1.0 );
          }
        }
        float scaled = chopM.b * 4.0;
        float band = min( 3.0, floor( scaled ) );
        float amt = clamp( scaled - band, 0.0, 1.0 );
        // ROUND 5. These four swatches are the serving-suggestion photography on
        // every carton, and three of the four were warm and DARK: golden at
        // (0.80,0.52,0.17) is a mud brown and olive at (0.34,0.50,0.15) is army
        // green. A hue mask over a shelf close-up showed the photo ovals were
        // the single biggest remaining source of the sepia cast — a blue
        // detergent carton with a khaki blob over half its face reads khaki.
        // Food photography on packaging is lit hard and reproduces BRIGHT.
        // Same four hues, opened up about two stops.
        //
        // ROUND 12 — THE TWO STOPS WENT ONE STOP TOO FAR, and the stage table
        // caught it: the food overlay costs 34% of the >C*34 tail (33.4% of
        // product pixels before it, 22.1% after) while moving the median by 1%.
        // A term that only removes the top of the distribution is a bleach.
        //
        // The cream band was the whole of it. At sRGB (252,245,215) it measured
        // C* 15.3 at L* 96.3 — C*/L* 0.159, which is paper, not food — and
        // foodBand routes CORN, CHEESE, LEMON, BUTTER, VANILLA, MILK, BANANA,
        // HONEY, PEACH, ORANGE, POTATO, RICE, PASTA and NOODLE into it. A
        // seventh of the store was having a near-white oval painted over its
        // face. Corn is not paper-coloured.
        //
        // Re-authored to keep round 5's lightness — every one stays at L* 78-89,
        // still lit hard, still nothing like the round-4 mud — and put the
        // chroma back:
        //     golden  C* 30.8 -> 49.0   (L* 86.2 -> 83.1)
        //     green   C* 43.9 -> 57.6   (L* 81.9 -> 78.5)
        //     red     C* 51.2 -> 64.9   (L* 63.9 -> 57.8)
        //     cream   C* 15.3 -> 44.7   (L* 96.3 -> 89.2)
        vec3 f01 = mix( vec3( 0.92, 0.58, 0.17 ), vec3( 0.34, 0.64, 0.14 ), step( 0.5, band ) );
        vec3 f23 = mix( vec3( 0.80, 0.115, 0.065 ), vec3( 0.95, 0.735, 0.255 ), step( 2.5, band ) );
        vec3 food = mix( f01, f23, step( 1.5, band ) );
        // ROUND 12 — uPkgStock, not vec3( 1.0 ). The un-inked stock was a
        // perfect reflector. Worth a MEASURED +2% on product C*/L*, not the
        // +17% the two-colour model predicted — see PKG_STOCK above for why
        // the model overpromised and why the line stays anyway.
        vec3 base = mix( uPkgStock, vColor, chopM.r );
        chopSt1 = vColor; chopSt2 = base;
        base = mix( base, food, amt );
        // PRINT SATURATION — see PKG_SAT. About the pixel's own luma, so the
        // stage-4 albedo's L* histogram is invariant and only a*/b* move. It
        // sits AFTER the food overlay because the serving-suggestion ovals are
        // print too, and before chopSt3 so the stage ladder measures it.
        base = mix( vec3( dot( base, vec3( 0.2126, 0.7152, 0.0722 ) ) ), base, uPkgSat );
        chopSt3 = base;
        diffuseColor.rgb *= base * ( 0.045 + 0.955 * chopM.g );
        chopSt4 = diffuseColor.rgb;
        chopGloss = ${gloss || '1.0'};
        // ...and hand the same per-texel finish to light.js's lamp specular.
        // chopGlossX is declared by FIELD_GLSL with a default of 1, so this is
        // an opt-in with no coupling in the other direction: a material that
        // never writes it simply flares uniformly. See chopLamp in light.js.
        chopGlossX = chopGloss;
      `;

export function chopPackageMat(THREE, mask, grid, extra = {}) {
  // LINEAR, set directly — a THREE.Color built from a hex would be converted
  // out of sRGB and land somewhere else entirely. Built here rather than in
  // onBeforeCompile so the handle is live before the first material compiles.
  if (!PKG_STOCK.value) PKG_STOCK.value = new THREE.Vector3(0.855, 0.845, 0.822);
  const { spec = null, gloss = null, ...rest } = extra;
  const m = spec
    ? new THREE.MeshPhongMaterial({
      map: mask, color: 0xffffff, shininess: spec.shininess,
      specular: new THREE.Color(spec.specular), ...rest,
    })
    : new THREE.MeshLambertMaterial({ map: mask, color: 0xffffff, ...rest });
  const cell = new THREE.Vector2(1 / grid.cols, 1 / grid.rows);
  const px = new THREE.Vector2(grid.cw * grid.cols, grid.ch * grid.rows);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uCell = { value: cell };
    sh.uniforms.uAtlasPx = { value: px };
    sh.uniforms.uPkgStage = PKG_STAGE;
    sh.uniforms.uPkgStock = PKG_STOCK;
    sh.uniforms.uPkgSat = PKG_SAT;
    sh.vertexShader = 'attribute vec2 aCell;\nvarying vec2 vCell;\n' + sh.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvCell = aCell;');
    sh.fragmentShader = 'uniform vec2 uCell;\nuniform vec2 uAtlasPx;\nvarying vec2 vCell;\nfloat chopGloss;\n'
      + 'uniform float uPkgStage;\nuniform vec3 uPkgStock;\nuniform float uPkgSat;\n'
      + 'vec3 chopSt1, chopSt2, chopSt3, chopSt4, chopSt5;\n'
      + sh.fragmentShader
        .replace('#include <map_fragment>', PKG_MAP_FRAG(gloss || '1.0'))
        .replace('#include <color_fragment>', '')
        .replace('#include <specularmap_fragment>', 'float specularStrength = chopGloss;')
        // BEFORE light.js's AO_FRAG. patchAO chains this hook first and then
        // replaces the same token, so the emitted order is capture, AO, tonemap.
        .replace('#include <tonemapping_fragment>',
          'chopSt5 = gl_FragColor.rgb;\n#include <tonemapping_fragment>')
        // AFTER the AO/bounce term and after tone mapping, so every stage goes
        // through one identical output transform on its way to the framebuffer.
        .replace('#include <colorspace_fragment>', `
        if ( uPkgStage > 0.5 ) {
          gl_FragColor.rgb =
              uPkgStage < 1.5 ? chopSt1
            : uPkgStage < 2.5 ? chopSt2
            : uPkgStage < 3.5 ? chopSt3
            : uPkgStage < 4.5 ? chopSt4
            : uPkgStage < 5.5 ? chopSt5
            : uPkgStage < 6.5 ? gl_FragColor.rgb
            : vec3( 0.0, 1.0, 0.0 );
        }
        #include <colorspace_fragment>`);
    PKG_FRAG.src = sh.fragmentShader;
  };
  m.customProgramCacheKey = () => 'chopPkgR12' + grid.cols + 'x' + grid.rows
    + (spec ? 'P' + (gloss ? gloss.length : 0) : 'L');
  return m;
}

// ---------------------------------------------------------------------------
// Rewrite a geometry's UVs into UNIT-CELL space: the printed front face gets
// [wrap..1] x [0..1], every other face gets the narrow plain-wrap column on the
// left. The shader then offsets by the per-instance cell origin, so one
// geometry + one draw call serves every design in the atlas.
// Re-derive u from each vertex's bearing around Y so that local +Z — the face
// products.js always turns toward the aisle — sits at the middle of the label.
function frontFold(g, uv, lo, hi, v0, v1) {
  const pos = g.attributes.position;
  for (let i = lo; i <= hi; i++) {
    const th = Math.atan2(pos.getX(i), pos.getZ(i));
    const u = 0.5 + Math.max(-Math.PI / 2, Math.min(Math.PI / 2, th)) / Math.PI;
    uv.setXY(i, 0.004 + u * 0.992, v0 + uv.getY(i) * (v1 - v0));
  }
}

// ---------------------------------------------------------------------------
// ROUND 18 — THE LATHE'S v IS A POINT INDEX, AND EVERY ROUND PACKAGE IN THE
// STORE WAS PRINTED THROUGH IT.
//
// THREE.LatheGeometry sets uv.y = i / (points - 1). It is an INDEX, not a
// height and not an arc length, so a profile that spends three of its ten
// points on a rolled rim gives that rim 33% of the label. Measured off the
// live geometry before this change (see the `barrel` note in plan.js):
//
//     rim  barrel 81.6% of the can, carried v 0.445..0.555   -> x7.4 stretch
//     jar  barrel 59.5%,            carried v 0.202..0.302   -> x6.0
//     tub  barrel 79.5%,            carried v 0.252..0.376   -> x6.4
//     soda barrel 50.0%,            carried v 0.250..0.375   -> x4.0
//
// So 88-90% of every can, jar, tub and bottle artwork landed on the two end
// discs and the rims, and the barrel showed an 11% slice blown up sevenfold.
// Nothing asserted that the atlas's vertical layout and the geometry's v meant
// the same thing, and for eighteen rounds they did not.
//
// THE REPARAMETERISATION. Recover the profile from the geometry itself — the
// original uv.y identifies the profile point, the position gives (r, y) — then
// lay v out so that:
//
//   * the BARREL, the longest near-vertical run at large radius, maps to the
//     `barrel` window the atlas declares. That is the contract: pack.js draws
//     the label between those two v and the geometry puts it on the body.
//   * everything above the barrel shares [barrel[1], 1] and everything below
//     shares [0, barrel[0]], distributed by an arc length that counts radial
//     travel at HALF weight. A can's top disc is 0.4 units of radius and 0 of
//     height; at full arc weight it would take a quarter of the cell for a
//     surface seen almost edge-on, and at zero weight it would collapse to a
//     line and the lid could not be drawn at all.
//
// It is derived from the geometry and nothing else, so a new profile needs no
// table entry and cannot fall out of sync with one. latheCheck() below asserts
// the result against the artefact.
//
// ===========================================================================
// ROUND 20 — RADIAL_W WAS 0.5, AND IT IS THE SAME BUG ONE SEGMENT ALONG.
//
// r18 fixed the BARREL and r19 turned that fix into a live assertion. Neither
// looked at what the rest of the profile got, and r19's critic filed the
// symptom without the cause: "no cylinder carries a rim ellipse or a lid".
// Read off the LIVE uv buffers (endCheck() below prints this table), rows of
// cell per unit of object height, where 1.00 is a carton:
//
//     outline        segment                       hFrac    dv     rows/H
//     can/rim        BARREL                        0.816   0.785    0.96
//     can/rim        top rolled rim WALL           0.034   0.0118   0.35
//     can/rim        bottom rolled rim WALL        0.034   0.0080   0.24
//     can/rim        top end disc                  0.015   0.0743   4.96
//     can/tub        snap-lid rim WALL             0.057   0.0187   0.33
//     can/tub        lid top disc                  0.000   0.0722    inf
//     can/jar        lug-lid WALL                  0.090   0.0207   0.23
//     bottle/soda    closure WALL (the knurl)      0.100   0.0782   0.78
//     bottle/soda    cap crown disc                0.038   0.0830   2.19
//     bottle/jug     cap crown disc                0.030   0.0996   3.32
//
// Every WALL above or below the barrel is squeezed to 0.23-0.44x while every
// end DISC is pulled 2.2x to infinity. The rolled rim -- which CAN_PROFILES in
// store.js describes, correctly, as "the two bright rings that identify a can
// across an aisle" -- is allocated 1.7 px of a 144 px cell, so it cannot exist
// in the mip chain, and the recessed end panel nobody can see from a shelf gets
// 10.7 px.
//
// WHERE 0.10 COMES FROM, AND IT IS NOT TASTE. RADIAL_W trades cell rows between
// surfaces that face UP (discs) and surfaces that face OUT (walls). A disc
// projects |sin e| of its area and a wall |cos e|, where e is the elevation of
// the view ray, so the ratio the player actually receives is |tan e|. Measured
// off the rig -- all 10,234 round instances in the scene against the six
// aniso.js POSES, horizontal range 0.6-14 m, 20,102 pairs:
//
//     |tan e|   p10 0.010   p25 0.030   median 0.071   MEAN 0.0995   p90 0.224
//
// So 0.5 over-serves the discs by 5x against the mean and by 2.2x against the
// p90. The mean is used rather than the median because the distribution is
// long-tailed toward knocked-over facings in the promo bins, where a can's end
// IS the facing, and because the discs must not collapse: the flat base of
// can/rim and the lid of can/tub have dy EXACTLY ZERO, so RADIAL_W is the only
// thing that gives them any rows at all. At 0.10 they still take 3.4 and 4.9 px
// of the cell; at 0 they would be a single texel and the lid could not be drawn.
//
// WHAT IT BOUGHT, read off the live uv after the change (endCheck().rows, one
// row per profile segment; texels are of the 144-row can cell / 212-row bottle):
//
//     outline        segment                 hFrac    dv      rows/H   was
//     can/rim        top rolled rim WALL     0.034   0.0275    0.81    0.35
//     can/rim        bottom rolled rim WALL  0.034   0.0198    0.58    0.24
//     can/tub        snap-lid rim WALL       0.057   0.0433    0.76    0.33
//     can/jar        lug-lid WALL            0.090   0.0384    0.43    0.23
//     bottle/soda    closure WALL            0.100   0.0998    1.00    0.78
//     bottle/jug     neck WALL               0.080   0.1014    1.27    0.77
//     can/rim        top end disc            0.015   0.0445    2.97    4.96
//
// and the flat end discs, whose dy is exactly zero and which RADIAL_W alone
// keeps alive, still take 3.4 px (can/rim base), 4.8 px (can/tub lid) and 6.4 px
// (can/rim top) of the cell. Every wall moved 1.6-2.3x; nothing collapsed.
//
// This changes NOTHING about the barrel -- latheBands maps it linearly onto the
// declared window whatever the weights are, so latheCheck()'s v-span and stretch
// are untouched by construction. Verified live rather than argued: with the
// allocation swapped to 0.5 and back on one page load, latheCheck() returns []
// in both modes and endCheck() returns 47 complaints against 18.
const RADIAL_W = 0.10;
const LEGACY_RADIAL_W = 0.5;

// THE r19 END LAYOUT, REACHABLE AS A DIAL. AGENTS_BRIEF, on round 16's
// hud.bands('r15'): "on a project where three separate statistics have been
// wrecked by cross-load drift, making the previous behaviour a runtime option is
// the cheapest trustworthy control available." It is not a luxury here — the
// store's planogram is decided in products.js and store.js, another builder is
// live in both this round, and a plate taken before their save and one taken
// after are of DIFFERENT SHELVES. Measured: two reloads of one build give an
// identical round-instance signature (53 meshes, checksum -49892.142, twice),
// and a plate from either side of a neighbouring builder's save does not.
//
// So the A/B is one page load, one flag: endsAB() re-bakes the two round
// atlases and re-writes the lathe v in this mode and back, and proves the
// restore byte-identical on both the uv buffers and the canvases.
export const PACK_ENDS = { legacy: false };
export function setPackEnds(mode) {
  PACK_ENDS.legacy = mode === 'r19';
  return PACK_ENDS.legacy ? 'r19' : 'r20';
}

function profileOf(g) {
  // vertices at bearing 0 (local +Z, x ~ 0, z > 0) are one copy of the profile;
  // the original uv.y is exactly the point index / (n-1), so it orders them.
  const pos = g.attributes.position, uv = g.attributes.uv;
  const m = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = uv.getY(i).toFixed(5);
    if (m.has(key)) continue;
    m.set(key, { v0: +key, r: Math.hypot(pos.getX(i), pos.getZ(i)), y: pos.getY(i) });
  }
  return [...m.values()].sort((a, b) => a.v0 - b.v0);
}

// `rw` is RADIAL_W by default and an argument ONLY so endCheckSelfTest can push
// the r19 weighting through the same owner on the same live profiles. There is
// no caller in the store that passes it; a second copy of this arithmetic is
// exactly the duplication CLAUDE.md opens with.
function latheBands(P, band, rw = (PACK_ENDS.legacy ? LEGACY_RADIAL_W : RADIAL_W)) {
  const n = P.length;
  // segment weights: height, plus radial travel at RADIAL_W
  const w = [];
  for (let i = 0; i + 1 < n; i++) {
    w.push(Math.abs(P[i + 1].y - P[i].y) + rw * Math.abs(P[i + 1].r - P[i].r));
  }
  // THE BARREL. A WALL is a segment that travels further in y than in r. The
  // barrel is the single longest wall, GROWN outward through adjacent walls
  // that are still fat.
  //
  // "Still fat" is measured against the seed wall's own radius, not against
  // rMax, and that is the whole reason this rule is shaped like this. The first
  // draft thresholded on 0.70 * rMax and it broke in BOTH directions on real
  // profiles already in the file: the tub's barrel bottom is 0.385 against an
  // rMax of 0.52 set by its overhanging snap lid, so a global threshold either
  // cut the tub's barrel off at the ankles or swallowed the squat jar's lug
  // lid and neck into the label — which is exactly what latheCheck() caught,
  // at stretch 1.68. Seeding from the dominant wall makes the rule a property
  // of the silhouette rather than of whatever happens to be widest.
  let seed = -1, seedH = -1;
  for (let k = 0; k + 1 < n; k++) {
    const dy = Math.abs(P[k + 1].y - P[k].y);
    if (dy <= Math.abs(P[k + 1].r - P[k].r)) continue;
    if (dy > seedH) { seedH = dy; seed = k; }
  }
  let best;
  if (seed < 0) {
    best = { a: 0, b: n - 1, h: 1 };            // degenerate: no wall at all
  } else {
    const thr = 0.82 * Math.min(P[seed].r, P[seed + 1].r);
    const wall = (k) => k >= 0 && k + 1 < n
      && Math.abs(P[k + 1].y - P[k].y) > Math.abs(P[k + 1].r - P[k].r)
      && P[k].r >= thr && P[k + 1].r >= thr;
    let a = seed, b = seed + 1, h = seedH;
    while (wall(a - 1)) { h += Math.abs(P[a].y - P[a - 1].y); a--; }
    while (wall(b)) { h += Math.abs(P[b + 1].y - P[b].y); b++; }
    best = { a, b, h };
  }
  const [vb0, vb1] = band;
  const out = new Array(n).fill(0);
  // barrel: linear in HEIGHT across the declared window
  const y0 = P[best.a].y, y1 = P[best.b].y, dy = (y1 - y0) || 1;
  for (let k = best.a; k <= best.b; k++) out[k] = vb0 + (P[k].y - y0) / dy * (vb1 - vb0);
  // below the barrel: share [0, vb0] by weight, walking down from the barrel
  let tot = 0;
  for (let k = 0; k < best.a; k++) tot += w[k];
  let acc = 0;
  for (let k = best.a - 1; k >= 0; k--) { acc += w[k]; out[k] = vb0 * (1 - acc / (tot || 1)); }
  // above the barrel: share [vb1, 1] by weight
  tot = 0;
  for (let k = best.b; k + 1 < n; k++) tot += w[k];
  acc = 0;
  for (let k = best.b + 1; k < n; k++) { acc += w[k - 1]; out[k] = vb1 + (1 - vb1) * (acc / (tot || 1)); }
  return { out, best };
}

// The measurement latheCheck() reports and the store asserts on.
export const LATHE_LOG = [];

function latheFold(g, band, tag) {
  const uv = g.attributes.uv, pos = g.attributes.position;
  const P = profileOf(g);
  const { out, best } = latheBands(P, band);
  const byKey = new Map(P.map((p, k) => [p.v0.toFixed(5), out[k]]));
  for (let i = 0; i < uv.count; i++) {
    const th = Math.atan2(pos.getX(i), pos.getZ(i));
    const u = 0.5 + Math.max(-Math.PI / 2, Math.min(Math.PI / 2, th)) / Math.PI;
    const nv = byKey.get(uv.getY(i).toFixed(5));
    uv.setXY(i, 0.004 + u * 0.992, nv === undefined ? uv.getY(i) : nv);
  }
  const yTot = Math.max(...P.map((p) => p.y)) - Math.min(...P.map((p) => p.y));
  LATHE_LOG.push({
    tag,
    barrelHeightFrac: +(best.h / (yTot || 1)).toFixed(3),
    barrelVSpan: +(Math.abs(out[best.b] - out[best.a])).toFixed(3),
    band: band.slice(),
    // the number the whole change is about: texture height per unit of object
    // height on the body, relative to a flat facing. 1.00 is a carton.
    stretch: +((best.h / (yTot || 1)) / (Math.abs(out[best.b] - out[best.a]) || 1e-6)).toFixed(2),
  });
  return g;
}

// ===========================================================================
// ROUND 19 — THE ASSERTION NOW READS THE GPU, NOT THE LOG.
//
// r18 shipped this as a loop over LATHE_LOG, which latheFold() writes ONCE at
// bake time. r18's critic broke it in one line: aniso.js's uvAB() puts
// LatheGeometry's index-based v back on the live geometries, and latheCheck()
// went on returning [] while all 51 lathes in the scene carried the old unwrap
// — worst stretch 6.0x, barrel v-span 0.099. The check certified a store it
// could not see, and it certified it while the round's own tool was corrupting
// it. That is the fourth instance of this failure on this project and the
// brief's words for it are exact: "a self-test that passes proves the check can
// fire; it does not prove the check is WATCHING the artefact".
//
// Three properties of the rewrite, and each one is there because of a specific
// way the old one could be fooled:
//
//   1. IT TAKES A SCENE AND HAS NO OTHER MODE. There is no argument-less form
//      that falls back to the log, because a fallback is how the log got
//      trusted in the first place. Called with no scene it THROWS.
//   2. IT RE-DERIVES THE PROFILE FROM POSITIONS, not from uv. The old v was
//      the point index, so r18's recovery could read the ordering out of uv.y;
//      a check that did that would be reading the very attribute under test.
//      LatheGeometry emits the profile as its first `points` vertices and then
//      repeats it once per azimuth segment, so the profile is recovered from
//      the position buffer and verified to repeat before anything is measured.
//   3. IT ASKS latheBands() WHERE THE BARREL IS. One owner: the same function
//      the unwrap uses decides which profile points are the body, so the check
//      cannot disagree with the fold about what a barrel is. What it reads
//      independently is the LIVE v on those points.
//
// The declared window comes from the atlas the mesh ACTUALLY SAMPLES — matched
// by its map's canvas dimensions, exactly as chopShelfCheck() recovers a cell —
// so a mesh re-pointed at another atlas is measured against that atlas's
// contract and not against the one its geometry was built for.
//
// `stretch` = (barrel's share of the object's height) / (barrel's share of the
// cell). 1.00 is a carton. Below 1 the label is squeezed, above 1 it is pulled.
// The window is deliberately wide — one cell serves a squat tub and a tall
// jug, and a real shrink label is drawn for its own bottle — but 6-7x is not a
// label at all, which is where this file was.
//
// LATHE_LOG survives as TELEMETRY ONLY. Nothing asserts on it any more; it
// records what the fold believed at bake time, which is useful when the live
// reading disagrees with it and worthless as evidence on its own.

// Recover the lathe profile from POSITIONS. Returns null for a geometry whose
// vertex layout does not repeat a profile — a cylinder, a box, anything else —
// so the caller can route it to the cap/side test instead of guessing.
function profileFromPositions(g) {
  const pos = g.attributes.position;
  const n = pos.count;
  const ry = (i) => [Math.hypot(pos.getX(i), pos.getZ(i)), pos.getY(i)];
  // The period is the first p > 1 with position[p] == position[0] in (r, y)
  // AND which divides the vertex count. LatheGeometry's grid is
  // (segments + 1) x points, so the profile is exactly the first `points`.
  let P = -1;
  const [r0, y0] = ry(0);
  for (let p = 2; p <= n / 2; p++) {
    if (n % p) continue;
    const [r, y] = ry(p);
    if (Math.abs(r - r0) > 1e-6 || Math.abs(y - y0) > 1e-6) continue;
    P = p; break;
  }
  if (P < 3) return null;
  // verify EVERY repeat, not just the first — a shape that happens to return
  // to its starting radius mid-profile would otherwise cut the profile short
  for (let k = 0; k < n; k++) {
    const [ra, ya] = ry(k), [rb, yb] = ry(k % P);
    if (Math.abs(ra - rb) > 1e-6 || Math.abs(ya - yb) > 1e-6) return null;
  }
  const out = [];
  for (let k = 0; k < P; k++) { const [r, y] = ry(k); out.push({ r, y, i: k }); }
  return out;
}

// The v the LIVE geometry carries on profile point k, averaged over its azimuth
// copies. They must agree — the fold writes one value per profile point — and a
// spread means something has rewritten part of the buffer, which is reported
// rather than averaged away.
function liveV(g, P, k) {
  const uv = g.attributes.uv, n = uv.count, step = P.length;
  let lo = Infinity, hi = -Infinity;
  for (let i = k; i < n; i += step) {
    const v = uv.getY(i);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { v: (lo + hi) / 2, spread: hi - lo };
}

// A cylinder has no profile to recover: its side wall is the vertices whose
// normal is radial. Same question asked of it — what v does the printed body
// carry, live.
function cylBodyV(g) {
  const nrm = g.attributes.normal, uv = g.attributes.uv;
  if (!nrm) return null;
  let lo = Infinity, hi = -Infinity, n = 0;
  for (let i = 0; i < uv.count; i++) {
    if (Math.abs(nrm.getY(i)) > 0.5) continue;         // a cap, not the wall
    const v = uv.getY(i);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    n++;
  }
  return n ? { v0: lo, v1: hi, n } : null;
}

export function latheCheck(scene, atlases) {
  if (!scene || typeof scene.traverse !== 'function') {
    throw new Error('latheCheck(scene, ATLAS): r18 read a bake-time log and certified a store '
      + 'carrying the old index-based v. There is no log-reading form of this check.');
  }
  const A = atlases || ATLAS;
  const byDims = new Map();
  for (const k of Object.keys(A)) {
    if (!A[k].barrel) continue;                         // flat families: no body
    byDims.set((A[k].cols * A[k].cw) + 'x' + (A[k].rows * A[k].ch), k);
  }
  const bad = [];
  const rows = [];
  const seen = new Set();
  let meshes = 0;
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count) return;
    const im = o.material && o.material.map && o.material.map.image;
    const k = im && byDims.get(im.width + 'x' + im.height);
    if (!k) return;
    meshes++;
    const g = o.geometry;
    if (seen.has(g.uuid)) return;                       // one reading per buffer
    seen.add(g.uuid);
    const [vb0, vb1] = A[k].barrel;
    const want = vb1 - vb0;
    const tag = (g.name || g.type) + ' [' + k + ']';
    const P = profileFromPositions(g);
    if (!P) {
      const b = cylBodyV(g);
      if (!b) { bad.push(tag + ': neither a lathe profile nor a cylinder wall — unmeasurable'); return; }
      const span = b.v1 - b.v0;
      rows.push({ tag, kind: 'cylinder', vSpan: +span.toFixed(3), want: +want.toFixed(3) });
      if (Math.abs(span - want) > 0.02) {
        bad.push(tag + ': wall carries v-span ' + span.toFixed(3) + ' but the atlas declares '
          + want.toFixed(3) + ' — the artwork does not land on the body');
      }
      return;
    }
    const { out, best } = latheBands(P, A[k].barrel);
    const a = liveV(g, P, best.a), b = liveV(g, P, best.b);
    const vSpan = Math.abs(b.v - a.v);
    const yTot = Math.max(...P.map((p) => p.y)) - Math.min(...P.map((p) => p.y));
    const hFrac = Math.abs(P[best.b].y - P[best.a].y) / (yTot || 1);
    const stretch = hFrac / (vSpan || 1e-6);
    // What the fold BELIEVED, for the report only. A disagreement between this
    // and the live reading is the exact shape of the r18 failure.
    const believed = Math.abs(out[best.b] - out[best.a]);
    rows.push({
      tag, kind: 'lathe', points: P.length, vSpan: +vSpan.toFixed(3),
      want: +want.toFixed(3), stretch: +stretch.toFixed(2),
      barrelHeightFrac: +hFrac.toFixed(3), believed: +believed.toFixed(3),
      instances: o.count,
    });
    if (Math.max(a.spread, b.spread) > 1e-4) {
      bad.push(tag + ': the barrel edge carries ' + Math.max(a.spread, b.spread).toFixed(4)
        + ' of v spread across its azimuth copies — the uv buffer is not one value per profile point');
    } else if (Math.abs(vSpan - want) > 0.02) {
      bad.push(tag + ': barrel carries v-span ' + vSpan.toFixed(3) + ' LIVE but the atlas declares '
        + want.toFixed(3) + ' — the artwork does not land on the body'
        + (Math.abs(believed - want) <= 0.02 ? ' (the bake-time log says ' + believed.toFixed(3)
          + ', so something rewrote the buffer after the fold)' : ''));
    } else if (stretch < 0.55 || stretch > 1.60) {
      bad.push(tag + ': label stretch ' + stretch.toFixed(2) + 'x LIVE (barrel is '
        + hFrac.toFixed(3) + ' of the height and ' + vSpan.toFixed(3) + ' of the cell)');
    }
  });
  if (!meshes) {
    bad.push('latheCheck saw ZERO meshes drawing from a round atlas. Zero is the most '
      + 'suspicious reading an instrument can give — the dimension match is broken, not the store.');
  }
  // ROUND 20 — the END STRUCTURE rides along, because store.js already publishes
  // this call as scene.userData.chopLatheCheck() and pack.js cannot add a second
  // one from its own side. It is a SEPARATE property and never folded into
  // `bad`: store.js's own uv-corruption self-test asserts complaintsAfterRestore
  // === 0, and two of endCheck's complaints are structural and standing (see
  // MIN_WALL_TEXELS). Reported, not thrown, and named so nobody has to grep.
  let ends = null;
  try { ends = endCheck(scene, atlases); } catch (e) { ends = [String(e.message)]; }
  return Object.assign(bad, {
    rows, meshes, buffers: seen.size,
    ends: { complaints: ends.length, first: ends.slice(0, 4), rows: ends.rows },
  });
}

// ===========================================================================
// ROUND 20 — endCheck(). latheCheck() STOPS AT THE BARREL, AND SO DID THE FIX.
//
// latheCheck asks one question — does the LABEL land on the BODY — and answers
// it correctly on all 56 round meshes. r19's critic then reported that no
// cylinder in the store carries a rim ellipse or a lid, and both statements are
// true at once, because the barrel is 60-89% of the profile and nothing had
// ever looked at the rest of it. Read off the live uv, the r19 build gave every
// WALL above or below the barrel 0.23-0.44 rows of cell per unit of object
// height and every end DISC 2.2x to infinity. AGENTS_BRIEF, on r17: "each new
// assertion moved the defect one stage downstream rather than removing it."
// This is that, one SEGMENT downstream.
//
// WHAT IT ASSERTS, and it is deliberately about texels rather than about the
// weighting constant. A band narrower than a texel cannot survive the filter: it
// is averaged into its neighbours before it is ever a pixel, and no amount of
// contrast in the artwork recovers a row the mip chain has already folded away.
//
// THE SIZE THIS IS SET AGAINST, measured rather than assumed. aniso.js's
// facingPx over the six POSES, 15,537 can facings: WIDTH p50 2.8 px, p90 7.4,
// p99 19.8, max 77.1. can/rim is 2.00:1, so the facing HEIGHT is p50 5.6 px,
// p90 14.8, p99 39.6, max 154. The barrel carries 113 of the cell's 144 rows, so
// the mip actually sampled runs level 0 at the largest facing, ~1.8 at p99, ~3.2
// at p90 and ~4.6 at the median. MIN_WALL_TEXELS is stated at MIP 0 and scaled by
// the atlas's own cell height, so a future cell resize moves it with the cell.
//
// AND THE CLAIM THIS DOES NOT SUPPORT. At the median facing a can is 5.6 px tall
// and its rolled rim is 3.4% of that — 0.19 px. There is no per-can rim claim
// available at chase range and this file does not make one. What the check
// protects is the AGGREGATE: the end structure is 18.4% of a can's height, a
// stacked column puts two of them adjacent at every seam, and it is the pitch and
// contrast of that repeat the eye integrates. Same discipline AGENTS_BRIEF asks
// for after r18: "verify a legibility claim against the pixels the player gets."
//
// It asserts on WALLS only. A disc's rows-per-height is infinite by
// construction (dy is exactly zero on a flat can base) and there is no defect
// in that; the fault this round is about is the wall the disc was taking the
// rows FROM. Discs are reported, never asserted.
export const MIN_WALL_TEXELS = 3.0;

// One row per profile segment, with the v read LIVE off the buffer. `believed`
// is what latheBands would allocate; a disagreement is the r18 failure shape.
function endRows(g, P, band) {
  const ys = P.map((q) => q.y);
  const yTot = (Math.max(...ys) - Math.min(...ys)) || 1;
  const { out, best } = latheBands(P, band);
  const rows = [];
  for (let i = 0; i + 1 < P.length; i++) {
    const dy = Math.abs(P[i + 1].y - P[i].y), dr = Math.abs(P[i + 1].r - P[i].r);
    const a = liveV(g, P, i), b = liveV(g, P, i + 1);
    const dv = Math.abs(b.v - a.v);
    const hFrac = dy / yTot;
    rows.push({
      i,
      zone: i < best.a ? 'below' : i >= best.b ? 'above' : 'barrel',
      kind: dy > dr ? 'wall' : 'disc',
      r0: +P[i].r.toFixed(3), y0: +P[i].y.toFixed(3),
      hFrac: +hFrac.toFixed(4), dv: +dv.toFixed(4),
      rowsPerH: hFrac > 1e-6 ? +(dv / hFrac).toFixed(2) : null,
      v0: +Math.min(a.v, b.v).toFixed(4), v1: +Math.max(a.v, b.v).toFixed(4),
      believed: +Math.abs(out[i + 1] - out[i]).toFixed(4),
    });
  }
  return rows;
}

export function endCheck(scene, atlases, minTexels = MIN_WALL_TEXELS) {
  if (!scene || typeof scene.traverse !== 'function') {
    throw new Error('endCheck(scene, ATLAS): there is no log-reading form. r18 shipped one '
      + 'and it certified a store carrying the old unwrap.');
  }
  const A = atlases || ATLAS;
  const byDims = new Map();
  for (const k of Object.keys(A)) {
    if (!A[k].barrel) continue;
    byDims.set((A[k].cols * A[k].cw) + 'x' + (A[k].rows * A[k].ch), k);
  }
  const bad = [];
  const rows = [];
  const seen = new Set();
  let meshes = 0;
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count) return;
    const im = o.material && o.material.map && o.material.map.image;
    const k = im && byDims.get(im.width + 'x' + im.height);
    if (!k) return;
    meshes++;
    const g = o.geometry;
    if (seen.has(g.uuid)) return;
    seen.add(g.uuid);
    const P = profileFromPositions(g);
    if (!P) return;                              // a cylinder: latheCheck owns it
    const tag = (g.name || g.type) + ' [' + k + ']';
    const need = minTexels / A[k].ch;            // texels -> cell fraction
    for (const s of endRows(g, P, A[k].barrel)) {
      rows.push(Object.assign({ tag }, s));
      if (s.zone === 'barrel' || s.kind !== 'wall') continue;
      if (s.dv < need) {
        bad.push(tag + ' seg' + s.i + ' (' + s.zone + '-barrel wall, ' + (s.hFrac * 100).toFixed(1)
          + '% of the object height) carries ' + (s.dv * A[k].ch).toFixed(1) + ' texels of the '
          + A[k].ch + '-row cell, under the ' + minTexels + ' a band needs to survive the mip chain'
          + ' — rows/height ' + (s.rowsPerH === null ? 'n/a' : s.rowsPerH.toFixed(2)));
      }
    }
  });
  if (!meshes) {
    bad.push('endCheck saw ZERO meshes drawing from a round atlas. Zero is the most suspicious '
      + 'reading an instrument can give — the dimension match is broken, not the store.');
  }
  return Object.assign(bad, { rows, meshes, buffers: seen.size, minTexels });
}

// PROOF THAT IT DISCRIMINATES, on the LIVE geometry, in ONE page load.
//
// A synthetic break would prove the code path runs. What has to be proved here
// is that the check would have caught the SHIPPED r19 store — so the test pushes
// the r19 weighting (RADIAL_W 0.5) through latheBands on the same live profiles
// and applies the same complaint rule to the result. It reads positions only and
// writes nothing, so it cannot leave the buffers dirty; the third return field
// is the live check re-run afterwards, which must still agree with itself.
export function endCheckSelfTest(scene, atlases, minTexels = MIN_WALL_TEXELS) {
  const A = atlases || ATLAS;
  const byDims = new Map();
  for (const k of Object.keys(A)) {
    if (!A[k].barrel) continue;
    byDims.set((A[k].cols * A[k].cw) + 'x' + (A[k].rows * A[k].ch), k);
  }
  const seen = new Set();
  const old = [], now = [];
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count) return;
    const im = o.material && o.material.map && o.material.map.image;
    const k = im && byDims.get(im.width + 'x' + im.height);
    if (!k) return;
    const g = o.geometry;
    if (seen.has(g.uuid)) return;
    seen.add(g.uuid);
    const P = profileFromPositions(g);
    if (!P) return;
    const ys = P.map((q) => q.y);
    const yTot = (Math.max(...ys) - Math.min(...ys)) || 1;
    const need = minTexels / A[k].ch;
    const tag = (g.name || g.type) + ' [' + k + ']';
    for (const rw of [0.5, RADIAL_W]) {
      const { out, best } = latheBands(P, A[k].barrel, rw);
      for (let i = 0; i + 1 < P.length; i++) {
        const dy = Math.abs(P[i + 1].y - P[i].y), dr = Math.abs(P[i + 1].r - P[i].r);
        if (dy <= dr) continue;                        // disc: never asserted
        if (i >= best.a && i < best.b) continue;       // barrel: latheCheck owns it
        const dv = Math.abs(out[i + 1] - out[i]);
        if (dv >= need) continue;
        (rw === 0.5 ? old : now).push(tag + ' seg' + i + ' ' + (dv * A[k].ch).toFixed(1) + 'px'
          + ' (' + (100 * dy / yTot).toFixed(1) + '% of height)');
      }
    }
  });
  const live = endCheck(scene, atlases, minTexels);
  // `ok` is DISCRIMINATION, not silence, and the difference is the honest part
  // of this round. Two complaints survive on the shipped build and both are
  // structural — can/rim's BOTTOM rolled rim at 2.9 of 3.0 texels, and
  // can/jar's neck at 2.1 — because ATLAS.can.barrel is [0.085, 0.870] while
  // can/rim is geometrically SYMMETRIC (9.2% of its height above the barrel and
  // 9.2% below), so the top band gets 1.53x the rows of the bottom for the same
  // amount of object. The one-line fix is a symmetric window, [0.107, 0.893],
  // and that table lives in plan.js, not here. Lowering MIN_WALL_TEXELS to 2.9
  // to make this read clean would be the rubber stamp AGENTS_BRIEF warns about
  // four separate times, so it is reported instead.
  return {
    firedOnR19Weighting: old.length,
    firesOnShipped: now.length,
    liveComplaints: live.length,
    agreesWithLive: now.length === live.length,
    r19Examples: old.slice(0, 8),
    stillFiring: live.slice(0, 2),
    ok: old.length > now.length && now.length === live.length,
  };
}

// ===========================================================================
// ROUND 20 — THE A/B, ON ONE PAGE LOAD.
//
// Cross-load plates are not available this round and the reason is worth
// writing down: the planogram is decided in products.js and store.js, another
// builder is live in both, and products.js was saved between this round's
// "before" and "after" captures. Two reloads of ONE tree are byte-stable (53
// round meshes, position checksum -49892.142, twice), and two reloads across a
// neighbouring save are of different shelves entirely.
//
// endsSwap() therefore does what round 16 did with hud.bands('r15'): it puts the
// previous behaviour behind a flag and moves the whole comparison inside one
// load. It re-bakes the two round atlases in the requested mode, swaps them onto
// every material that draws from one, and rewrites the lathe v to the matching
// allocation. Going back to 'r20' restores the ORIGINAL texture objects and the
// ORIGINAL uv arrays, so the restore is byte-exact by construction rather than
// by re-derivation — endsRestoreCheck() asserts it anyway, because AGENTS_BRIEF
// records a restore on this project that returned two identical PNGs including
// the one that was supposed to have changed.
//
// The atlas is swapped by ASSIGNING ANOTHER TEXTURE, never by nulling `map`:
// dropping USE_MAP recompiles the injected shader away and has produced exactly
// that false-negative here before.
const AB = { base: null };

export function endsSwap(THREE, scene, mode, atlases) {
  const A = atlases || ATLAS;
  const byDims = new Map();
  for (const k of Object.keys(A)) {
    if (!A[k].barrel) continue;
    byDims.set((A[k].cols * A[k].cw) + 'x' + (A[k].rows * A[k].ch), k);
  }
  if (!AB.base) {
    AB.base = { uv: [], mats: [] };
    const seenG = new Set(), seenM = new Set();
    scene.traverse((o) => {
      if (!o.isInstancedMesh || !o.count) return;
      const m = o.material, im = m && m.map && m.map.image;
      const k = im && byDims.get(im.width + 'x' + im.height);
      if (!k) return;
      if (!seenM.has(m.uuid)) { seenM.add(m.uuid); AB.base.mats.push({ m, k, tex: m.map }); }
      const g = o.geometry;
      if (seenG.has(g.uuid)) return;
      seenG.add(g.uuid);
      AB.base.uv.push({ g, k, arr: Float32Array.from(g.attributes.uv.array) });
    });
  }
  const want = mode === 'r19';
  setPackEnds(mode);
  const baked = {};
  if (want) {
    setPackProbe(true);                       // no CELL_LOG writes, no re-check
    try {
      for (const k of new Set(AB.base.mats.map((e) => e.k))) {
        baked[k] = k === 'can' ? canAtlas(THREE) : bottleAtlas(THREE);
      }
    } finally { setPackProbe(false); }
  }
  for (const e of AB.base.mats) e.m.map = want ? baked[e.k] : e.tex;
  let folded = 0, restored = 0;
  for (const e of AB.base.uv) {
    const uv = e.g.attributes.uv;
    if (want) {
      const P = profileFromPositions(e.g);
      if (!P) continue;                       // a cylinder: its caps are remapped, not folded
      const { out } = latheBands(P, A[e.k].barrel);
      const step = P.length;
      for (let i = 0; i < uv.count; i++) uv.setY(i, out[i % step]);
      folded++;
    } else {
      uv.array.set(e.arr);
      restored++;
    }
    uv.needsUpdate = true;
  }
  return { mode, materials: AB.base.mats.length, buffers: AB.base.uv.length, folded, restored };
}

export function endsRestoreCheck() {
  if (!AB.base) return { armed: false };
  let dirty = 0, floats = 0;
  for (const e of AB.base.uv) {
    const a = e.g.attributes.uv.array;
    floats += a.length;
    for (let i = 0; i < a.length; i++) if (a[i] !== e.arr[i]) { dirty++; break; }
  }
  const mapsBack = AB.base.mats.every((e) => e.m.map === e.tex);
  return {
    armed: true, buffers: AB.base.uv.length, floatsCompared: floats,
    dirtyBuffers: dirty, mapsBack, legacyFlag: PACK_ENDS.legacy,
    ok: dirty === 0 && mapsBack && !PACK_ENDS.legacy,
  };
}

// ===========================================================================
// ROUND 22 — THE PRESS A/B, ON ONE PAGE LOAD.
//
// Same reason as endsSwap above and it has not got weaker: the planogram is
// decided in store.js and products.js, and a plate taken either side of a
// neighbouring builder's save is of a different shelf. So the r21 ink is a
// runtime flag and the whole comparison happens inside one load.
//
// THE RESTORE IS THE ORIGINAL TEXTURE OBJECT, not a re-bake — a re-bake would
// prove that the baker is deterministic, which is not the question. What IS
// re-baked and hashed is the r22 arm, and pressRestoreCheck() asserts that
// hash equals the hash of the atlas the store has been drawing from since load.
// If those differ, press.js has picked up state from somewhere it should not
// have and every number in the round is void.
//
// `map` is ASSIGNED, never nulled. AGENTS_BRIEF: dropping USE_MAP recompiles
// the injected shader away and has returned two byte-identical PNGs on this
// project including the one that was supposed to have changed.
const PAB = { base: null, hash: null, held: {} };

function canvasHash(cv) {
  const g = cv.getContext('2d', { willReadFrequently: true });
  const d = g.getImageData(0, 0, cv.width, cv.height).data;
  let h = 0x811c9dc5;
  for (let i = 0; i < d.length; i += 4) {
    h ^= d[i] + d[i + 1] * 257 + d[i + 2] * 65537 + d[i + 3] * 16777259;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const BAKERS = { carton: cartonAtlas, pouch: pouchAtlas, can: canAtlas, bottle: bottleAtlas };

export function pressSwap(THREE, scene, mode) {
  const byDims = new Map();
  for (const k of ATLAS_ORDER) {
    const A = ATLAS[k];
    byDims.set((A.cols * A.cw) + 'x' + (A.rows * A.ch), k);
  }
  if (!PAB.base) {
    PAB.base = [];
    const seen = new Set();
    scene.traverse((o) => {
      const m = o.material, im = m && m.map && m.map.image;
      const k = im && byDims.get(im.width + 'x' + im.height);
      if (!k || seen.has(m.uuid)) return;
      seen.add(m.uuid);
      PAB.base.push({ m, k, tex: m.map });
    });
    PAB.hash = {};
    for (const e of PAB.base) if (!PAB.hash[e.k]) PAB.hash[e.k] = canvasHash(e.tex.image);
  }
  const want = mode === 'r21' || mode === 'ink' || mode === 'tone' ? mode : 'r22';
  // BOTH ARMS ARE PROBE RE-BAKES, and that is not tidiness — it is the only
  // way this comparison is single-variable. A LOAD-TIME bake and a re-bake of
  // the SAME code are not byte-identical on this tree: measured live, all 7
  // carton cells that draw no depiction are identical and all 41 that do draw
  // one differ, median 2,712 texels, and two successive re-bakes agree
  // exactly. The state is inside depict()'s three module-level scratch
  // canvases, which grow monotonically and are shared across bakes, so bake 1
  // sees them at their growing sizes and bake N sees them at their maximum.
  // Comparing the LIVE atlas against a re-baked control would therefore have
  // charged the press with a warm-cache artefact worth 5.59% of the carton
  // atlas. See the r22 report's contract request against depict.js.
  //
  // The RESTORE is still the original texture object, never a re-bake, so it
  // is byte-exact by construction rather than by re-derivation.
  setPress(want);
  const baked = {};
  setPackProbe(true);                       // no CELL_LOG writes, no re-check
  try {
    for (const k of new Set(PAB.base.map((e) => e.k))) baked[k] = BAKERS[k](THREE);
  } finally { setPackProbe(false); setPress('r22'); }
  for (const e of PAB.base) {
    if (PAB.held[e.k]) PAB.held[e.k].dispose();
    e.m.map = baked[e.k];
  }
  PAB.held = baked;
  return { mode: want, materials: PAB.base.length, armsAreBothRebakes: true,
    atlases: [...new Set(PAB.base.map((e) => e.k))] };
}

// Put the store back on the textures it was built with. Separate from
// pressSwap so a restore is never a re-bake: assigning the original object is
// byte-exact by construction, and the whole point of the r18 warning about
// nulling `map` is that a restore you have to re-derive is a restore you have
// to trust.
export function pressUnswap() {
  if (!PAB.base) return { armed: false };
  for (const e of PAB.base) e.m.map = e.tex;
  for (const k of Object.keys(PAB.held)) PAB.held[k].dispose();
  PAB.held = {};
  setPress('r22');
  return { armed: true, restored: PAB.base.length };
}

// THE RESTORE ASSERTION, and it is two claims rather than one. AGENTS_BRIEF:
// "a restore assertion and an it-still-works assertion are two different
// tests." So this checks that (1) every material is back on the texture object
// it was built with, and (2) a FRESH r22 bake is byte-identical to that object
// — i.e. the shipped atlas really is what press.js produces, rather than the
// two having drifted apart through some hidden state.
export function pressRestoreCheck(THREE) {
  if (!PAB.base) return { armed: false, ok: false, why: 'pressSwap never ran' };
  const mapsBack = PAB.base.every((e) => e.m.map === e.tex);
  const ks = [...new Set(PAB.base.map((e) => e.k))];
  setPackProbe(true);
  const a = {}, b = {};
  try {
    for (const k of ks) { const t = BAKERS[k](THREE); a[k] = canvasHash(t.image); t.dispose(); }
    for (const k of ks) { const t = BAKERS[k](THREE); b[k] = canvasHash(t.image); t.dispose(); }
  } finally { setPackProbe(false); }
  // (1) the store is back on the objects it was built with, by identity;
  // (2) the re-bake the A/B arms are made of is itself stable, so an arm is a
  //     property of the mode and not of when it was baked;
  // (3) and the LIVE-vs-rebake residue is reported rather than asserted away,
  //     because it is depict.js's warm-cache effect and not this round's.
  const stable = ks.filter((k) => a[k] !== b[k]);
  const vsLive = ks.filter((k) => a[k] !== PAB.hash[k]);
  return {
    armed: true, mapsBack, pressOn: PRESS.on,
    liveHash: PAB.hash, rebakeHash: a, rebakeHash2: b,
    rebakeUnstable: stable, differsFromLoadTimeBake: vsLive,
    ok: mapsBack && PRESS.on && stable.length === 0,
  };
}

// AND THE PROOF THAT THE DIAL DOES ANYTHING. A swap that silently no-ops is
// indistinguishable from a swap that works, and this project has shipped
// exactly that twice. Bakes both arms into throwaway canvases and reports the
// fraction of texels that differ, per atlas.
export function pressDialCheck(THREE) {
  setPackProbe(true);
  const out = {};
  try {
    for (const k of ATLAS_ORDER) {
      setPress('r22'); const a = BAKERS[k](THREE);
      setPress('r21'); const b = BAKERS[k](THREE);
      setPress('r22');
      const ga = a.image.getContext('2d', { willReadFrequently: true });
      const gb = b.image.getContext('2d', { willReadFrequently: true });
      const da = ga.getImageData(0, 0, a.image.width, a.image.height).data;
      const db = gb.getImageData(0, 0, b.image.width, b.image.height).data;
      let diff = 0, bDiff = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (da[i] !== db[i] || da[i + 1] !== db[i + 1] || da[i + 2] !== db[i + 2]) diff++;
        if (da[i + 2] !== db[i + 2]) bDiff++;
      }
      out[k] = { texels: da.length / 4, movedPct: +(100 * diff / (da.length / 4)).toFixed(2),
        spotChannelPct: +(100 * bDiff / (da.length / 4)).toFixed(2) };
      a.dispose(); b.dispose();
    }
  } finally { setPackProbe(false); setPress('r22'); }
  return out;
}

// ===========================================================================
// ROUND 22 — THE HUE CENSUS, READ OFF THE LIVE ATLAS THE GPU IS BOUND TO.
//
// The gap this round is aimed at is SEMANTIC and the critic proved no
// photometric statistic separates the classes, so this is deliberately not one:
// it is a census of MY OWN ARTEFACT, in the units the defect was stated in.
// "A face is printed in one ink" is a countable property of the atlas, and it
// is countable identically with the press on and off.
//
// It reads the canvas the CanvasTexture is bound to, decodes through the
// package shader's arithmetic (press.js decodeTexel, self-tested against the
// shader source it transcribes), box-downsamples each printed FRONT to the
// size a facing is actually delivered at, and counts quantized Lab bins.
//
// The brand colour is a per-INSTANCE attribute, so a cell has no single
// decoded colour. Every cell is therefore censused against a fixed ladder of
// eight brand swatches spanning the store's own hue histogram, and the
// reported figure is the MEDIAN over those eight — not one hand-picked swatch,
// which is how a per-cell number here could otherwise be steered.
const CENSUS_BRANDS = [
  [0.62, 0.09, 0.11], [0.85, 0.42, 0.06], [0.90, 0.76, 0.14], [0.20, 0.44, 0.16],
  [0.09, 0.33, 0.58], [0.33, 0.16, 0.48], [0.86, 0.85, 0.83], [0.16, 0.16, 0.18],
];
// THE DECODE CONFIG IS READ OFF THE LIVE UNIFORMS, not copied. PKG_STOCK and
// PKG_SAT are the objects the shader is bound to, so a sweep of either — which
// is exactly what they exist for — moves the census with it instead of leaving
// press.js measuring a store nobody is looking at.
function censusCfg() {
  if (!PKG_STOCK.value) throw new Error('hueCensus: PKG_STOCK is not built yet — '
    + 'chopPackageMat has not run, so there is no live uniform to read.');
  const s = PKG_STOCK.value;
  return { stock: [s.x, s.y, s.z], sat: PKG_SAT.value };
}

export function hueCensus(scene, N = 16) {
  const cfg = censusCfg();
  const byDims = new Map();
  for (const k of ATLAS_ORDER) {
    const A = ATLAS[k];
    byDims.set((A.cols * A.cw) + 'x' + (A.rows * A.ch), k);
  }
  const imgs = {};
  scene.traverse((o) => {
    const m = o.material, im = m && m.map && m.map.image;
    const k = im && byDims.get(im.width + 'x' + im.height);
    if (k && !imgs[k]) imgs[k] = im;
  });
  const med = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const out = {};
  for (const k of Object.keys(imgs)) {
    const A = ATLAS[k], im = imgs[k];
    const cv2 = document.createElement('canvas');
    cv2.width = im.width; cv2.height = im.height;
    const g2 = cv2.getContext('2d', { willReadFrequently: true });
    g2.drawImage(im, 0, 0);
    const rows = [];
    for (let i = 0; i < A.cols * A.rows; i++) {
      const mx = Math.round(A.cw * A.wrap);
      const x0 = (i % A.cols) * A.cw + mx, w = A.cw - mx;
      const y0 = Math.floor(i / A.cols) * A.ch + (A.barrel ? Math.round(A.ch * (1 - A.barrel[1])) : 0);
      const h = A.barrel ? Math.round(A.ch * (A.barrel[1] - A.barrel[0])) : A.ch;
      const d = g2.getImageData(x0, y0, w, h).data;
      const per = CENSUS_BRANDS.map((br) => inkCensus(d, w, h, br, cfg, N));
      // THE BRAND-FIELD SHARE, and it is a guard rather than a headline.
      // r22's first draft printed its spot zones on the PAPER base, replacing
      // whole brand fields with pale tints — this round's gap traded for round
      // 13's. `r >= 200` is the shader's own brand-coverage channel at 78% or
      // more, i.e. a texel where the per-instance colour is what you see.
      let brandPx = 0;
      for (let q = 0; q < w * h; q++) if (d[q * 4] >= 200) brandPx++;
      rows.push({ i,
        inks: med(per.map((p) => p.inks)),
        hues: med(per.map((p) => p.hues)),
        cover50: med(per.map((p) => p.cover50)),
        brandField: brandPx / (w * h),
        flat: med(per.map((p) => p.flat)) });
    }
    out[k] = {
      n: rows.length,
      hues: [Math.min(...rows.map((r) => r.hues)), med(rows.map((r) => r.hues)), Math.max(...rows.map((r) => r.hues))],
      inks: [Math.min(...rows.map((r) => r.inks)), med(rows.map((r) => r.inks)), Math.max(...rows.map((r) => r.inks))],
      cover50: [Math.min(...rows.map((r) => r.cover50)), med(rows.map((r) => r.cover50)), Math.max(...rows.map((r) => r.cover50))],
      flat: [+Math.min(...rows.map((r) => r.flat)).toFixed(3), +med(rows.map((r) => r.flat)).toFixed(3),
        +Math.max(...rows.map((r) => r.flat)).toFixed(3)],
      oneInk: rows.filter((r) => r.hues <= 1).length,
      brandField: [+Math.min(...rows.map((r) => r.brandField)).toFixed(3),
        +med(rows.map((r) => r.brandField)).toFixed(3),
        +Math.max(...rows.map((r) => r.brandField)).toFixed(3)],
      cells: rows,
    };
  }
  return out;
}

// THE ASSERTION. Relative, for the reason round 20's subjCheck gives: an
// absolute floor on hue count would be a constant shaved to clear its own gate,
// and this project has retired four of those. The promise is that the press
// leaves NO face carrying fewer hue families than it carried in r21, and that
// it strictly raises the median on every family it touches. It reads the live
// canvases in both arms; it does not read a ledger written while baking.
export function pressCheck(THREE, scene) {
  decodeSelfTest(censusCfg());
  // and the four food swatches against the shader that actually compiled
  // Against the SOURCE TEXT this file hands three.js, not against the compiled
  // string: onBeforeCompile does not run until a package is first drawn, and a
  // check that is silent on a page that has not drawn one is not a check.
  cfgCheck(PKG_MAP_FRAG('1.0'));
  // BOTH ARMS RE-BAKED, for the reason in pressSwap: a load-time bake and a
  // re-bake of identical code differ on this tree inside depict().
  pressSwap(THREE, scene, 'r22');
  const on = hueCensus(scene, 16);
  pressSwap(THREE, scene, 'r21');
  let off;
  try { off = hueCensus(scene, 16); } finally { pressUnswap(); }
  const bad = [];
  const table = {};
  for (const k of Object.keys(on)) {
    if (!off[k]) continue;
    const a = on[k].cells, b = off[k].cells;
    let worse = 0, same = 0, better = 0, washed = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i].hues < b[i].hues) { worse++; }
      else if (a[i].hues > b[i].hues) better++;
      else same++;
      // THE WASH GUARD. A face may lose at most a third of the brand-covered
      // area it had in r21. Relative, like every other assertion in this file:
      // an absolute floor would be a constant shaved to clear its own gate, and
      // fam-0 cartons legitimately start near zero because they are white stock.
      if (b[i].brandField > 0.10 && a[i].brandField < b[i].brandField * 0.667) {
        washed++;
        bad.push(k + '#' + i + ' brand field ' + b[i].brandField.toFixed(3)
          + ' -> ' + a[i].brandField.toFixed(3) + ' (the press painted out the brand)');
      }
    }
    table[k] = { medOff: off[k].hues[1], medOn: on[k].hues[1], better, same, worse, washed,
      flatOff: off[k].flat[1], flatOn: on[k].flat[1],
      cover50Off: off[k].cover50[1], cover50On: on[k].cover50[1],
      oneInkOff: off[k].oneInk, oneInkOn: on[k].oneInk,
      brandFieldOff: off[k].brandField[1], brandFieldOn: on[k].brandField[1] };
    if (on[k].hues[1] < off[k].hues[1]) bad.push(k + ' median hue families fell ' + off[k].hues[1] + ' -> ' + on[k].hues[1]);
  }
  return { bad, table, on, off };
}

export function unitCellUV(THREE, base, kind, wrap, band = null, tag = '') {
  const g = base.clone();
  // The geometry carries its own name to the scene. BufferGeometry.clone()
  // copies `name`, and Batch clones once more to hang aCell on it, so the label
  // survives to the artefact and latheCheck can say which outline it read
  // without a table mapping meshes to shapes.
  if (tag) g.name = tag;
  const uv = g.attributes.uv, idx = g.index;
  const span = (gr) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = gr.start; i < gr.start + gr.count; i++) {
      const v = idx.getX(i);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return [lo, hi];
  };
  const remap = (lo, hi, a, b, c, d) => {
    for (let i = lo; i <= hi; i++) {
      uv.setXY(i, a + uv.getX(i) * (b - a), c + uv.getY(i) * (d - c));
    }
  };
  if (kind === 'box') {
    // BoxGeometry group order: px, nx, py, ny, pz, nz
    const su0 = 0.012, su1 = wrap * 0.80;
    for (let k = 0; k < 6; k++) {
      const [lo, hi] = span(g.groups[k]);
      if (k === 4) remap(lo, hi, wrap, 0.999, 0.001, 0.999);        // printed front
      else if (k === 2) remap(lo, hi, su0, su1, 0.86, 0.995);       // top
      else if (k === 3) remap(lo, hi, su0, su1, 0.005, 0.14);       // bottom
      else remap(lo, hi, su0, su1, 0.02, 0.98);                     // sides + back
    }
  } else if (kind === 'can') {
    // Cylinder: [0] side, [1] top cap, [2] bottom cap.
    // Do NOT wrap the label around the full circumference — that shows a
    // FRAGMENT of the wordmark at every viewing angle, which is the single
    // most obviously wrong thing a canned-goods shelf can do. Instead fold u
    // around the front: the whole label lands on the half we can actually see
    // and the unseen back half takes the squashed edge.
    //
    // ROUND 18 — the side now spans the DECLARED BARREL WINDOW and the two
    // caps get the lid and base bands above and below it, so a drawn can and a
    // lathed can read the same artwork off the same rows of the cell. Before
    // this the side took 0.012..0.988 and the top cap took 0.905..0.985, i.e.
    // the cap sat ON TOP OF the top of the label and the two disagreed about
    // what that band of the cell was for.
    const [s0, s1] = span(g.groups[0]);
    const [vb0, vb1] = band || [0.012, 0.988];
    frontFold(g, uv, s0, s1, vb0, vb1);
    // caps take a RADIAL ramp: the outer edge of the disc sits at the rim end
    // of its band and the centre at the far end, so a drawn lid ring lands on
    // the lid's outer ring. remap()'s uv.y on a cylinder cap is 1 at the far
    // edge and 0 at the near one, which is why the top band is written
    // inverted here and the bottom is not.
    if (g.groups[1]) { const [a, b] = span(g.groups[1]); remap(a, b, 0.30, 0.70, 1.0, vb1); }
    if (g.groups[2]) { const [a, b] = span(g.groups[2]); remap(a, b, 0.30, 0.70, 0.0, vb0); }
  } else {
    // Lathe: front-fold in u, and v RE-DERIVED FROM THE PROFILE. See the block
    // above latheBands() — reading LatheGeometry's own v here is what put 89%
    // of every can label on its end discs.
    latheFold(g, band || [0.012, 0.988], tag);
  }
  uv.needsUpdate = true;
  g.clearGroups();
  return g;
}

// UV origin of atlas cell `i` (canvas rows run top->bottom, texture v bottom->top)
export function cellOrigin(i, cols, rows) {
  const cx = i % cols, cy = Math.floor(i / cols) % rows;
  return [cx / cols, 1 - (cy + 1) / rows];
}
