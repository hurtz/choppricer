// OWNER: builder-pack. THE PRESS — how many inks a package face is printed in.
//
// Contract:
//   PRESS                 { on, ink, tone }  the A/B dial. off = r21 exactly.
//   setPress(mode)        'r21' | 'r22' | 'ink' | 'tone'
//   livery(atlas, i)      the ink assignment for atlas cell i
//   pressInk(base, spot, s, gv)         one mask-space fill
//   pressCarton / pressPouch            paint one face's structure
//   pressBandInk / pressCanPanel        re-ink the lathe families' bands
//   pressTone / pressGloss              the continuous-tone half
//   inkCensus(data, w, h, br, cfg, N)   flat / cover50 / hues / inks
//   decodeTexel(r, g, b, br, cfg)       the shader's decode, on the CPU
//   decodeSelfTest(cfg) / cfgCheck(src) both THROW
//
// CONTRACT REQUESTS THIS ROUND DID NOT MAKE, enumerated from the source rather
// than from the ones this file touched (AGENTS_BRIEF: "the request named six
// constants; there were seven"):
//
//   1. depict.js — A LOAD-TIME BAKE AND A RE-BAKE ARE NOT THE SAME ATLAS.
//      Measured live: of 48 carton cells, all 7 that draw no depiction are
//      byte-identical between the load-time bake and a re-bake, and all 41
//      that draw one differ (median 2,712 texels, max delta 101). Two
//      successive re-bakes agree exactly, so the state is set during bake 1
//      and stable after. The three module-level scratch canvases —
//      SCRATCH (scratchCtx), RIM (rimCtx), SIL (silCtx) — grow monotonically
//      and are shared across bakes, so bake 1 sees them at their growing sizes
//      and bake N at their maximum. The one-line fix is to size all three at a
//      fixed maximum on first use, or to reset .width/.height every call.
//      Until then every probe-baked control arm in this repo — endsSwap('r19'),
//      every sheet.js ablation, and pressSwap here — differs from the shipped
//      atlas by that amount. pressSwap works around it by re-baking BOTH arms.
//
//   2. A FIFTH, COOL SPOT BAND. FOUR files and SIX sites, enumerated by grep
//      rather than from memory — the first draft of this list said "three
//      files" and was wrong, which is the r21 failure repeating inside the
//      note that cites it:
//        depict.js:71   foodB = band * 64 + round(clamp(amt) * 62)   [writer]
//        depict.js:95   F(band, amt, tone) = rgb(0, tone, foodB(...)) [writer]
//        pack.js:2514   float scaled = chopM.b * 4.0;
//                       float band = min(3.0, floor(scaled));        [decode]
//        pack.js:2535   the f01 / f23 / food mix of the four swatches
//        vendor.js:107  const FOOD = [...]                           [decode]
//        vendor.js:122  const scaled = b * 4; Math.min(3, floor)     [decode]
//        press.js       FOODS + pressInk + decodeTexel               [this file]
//      cfgCheck() already asserts this file's copy against pack.js's source
//      text; nothing asserts vendor.js's, and that is worth adding with the
//      band change rather than before it. Without a fifth band a warm-branded
//      carton cannot carry a cool panel, which is what every reference
//      photograph's faces do.
//
// =========================================================================
// ROUND 22 — EVERY FACE IN THIS STORE IS PRINTED IN ONE COLOUR.
//
// r21's blind critic called all eighteen renders in about a second each and
// named one cue: product faces are flat-shaded proxies, not printed packaging.
// Its crops:
//
//   near_a4 190,115-400,210   repeated facings of one case design, each face a
//                             flat crimson field carrying a grey vector bottle
//   near_a7 222,120-330,185   every carton face one flat grey field with a dark
//                             rectangle standing in for a label
//   store_01_Langenstein 0,20-210,115 and store_01_canned_tuna 0,140-210,235
//                             every box and bag face full-bleed print with
//                             internal structure: brand mark, illustration,
//                             colour bands, a white legal panel
//
// THE MECHANISM, and it is one line of the mask contract rather than a matter
// of degree. pack.js draws every band, plate, ribbon, rule and roundel with
// `ink(r, g)` — r = how much of the ONE per-instance brand colour covers the
// texel, g = print brightness. b, the four-band spot-ink channel the shader has
// decoded since round 5, is written ONLY inside depict()'s photo box. So the
// whole chromatic vocabulary of a face is:
//
//     the paper stock, ONE brand hue, and whatever depict() painted.
//
// Everything that looks like structure — the masthead, the keyline, the flash
// ribbon, the can's six horizontal bands — is that same hue at a different
// brightness. Measured on the live atlases, decoded through the package
// shader's own arithmetic, box-downsampled to the size a facing is delivered
// at, quantized to 12 L* x 16 a* x 16 b* and counting bins over 6% of the face:
//
//     distinct HUE families per face      carton 1   pouch 1   can 1   bottle 1
//                                         (median, at 8x8, 16x16 and 32x32)
//
// A photograph's face carries three to five. That is the difference between a
// slab and a mosaic, and no brightness statistic can express it because the
// missing thing is not brightness.
//
// WHAT THIS FILE DOES. The b channel already carries four spot inks — golden
// (0.92,0.58,0.17), green (0.34,0.64,0.14), red (0.80,0.115,0.065) and cream
// (0.95,0.735,0.255) — at any strength, and the g channel scales all of them,
// so gold at g 0.25 is a brown, red at g 0.30 is a maroon and cream at s 0.35
// over stock is a pale buff. Combined with the brand hue and the stock that is
// a six-ink press with a full value range, and it costs nothing: no new
// channel, no new texture, no shader edit, and vendor.js's CPU transcription of
// that shader stays correct by construction because the decode is unchanged.
//
// WHAT IT DELIBERATELY DOES NOT DO, stated here so the next round does not have
// to rediscover it. There is NO COOL SPOT INK. Three of the four bands are
// warm and the fourth is a leaf green, so a red carton cannot carry a blue
// panel — only a cool BRAND can put a cool hue on a face, and 35.4% of the
// 42,966 package instances in this store have one (hue histogram in the r22
// report). Fixing that needs a fifth band, which means changing the decode in
// pack.js AND the transcription in vendor.js together, and that is a contract
// change this round did not make.
//
// AND THE OTHER HALF, WHICH IS NOT ABOUT COLOUR. r21's crops show the render's
// structure is at the WRONG SPATIAL SCALE, not merely the wrong hue. A carton
// face carries eleven elements — wordmark, descriptor, sub, claim, flash,
// burst, weight, legal, panel, barcode, badge — but nine of them are small, and
// the two large ones are the ground and the depiction. A facing is 2.8 px wide
// at p50 and 7.4 at p90 (aniso.js facingPx, 15,537 can facings over six poses),
// so everything under about 30 atlas px has averaged into the ground before the
// player sees it. What survives is what is LARGE. So the structure below is
// deliberately coarse: three to five zones, each 10-45% of the face, each with
// a hard keyline at its boundary — and the fine work goes on top of that rather
// than instead of it.
//
// THE RNG IS SEPARATE, ON PURPOSE. Every random draw here comes from a
// per-cell stream seeded off the cell index, never from the atlas's own
// generator. That is what makes PRESS.on the single variable in the A/B: with
// it off, pack.js consumes exactly the draws it consumed in r21, so the same
// brand lands on the same cell with the same layout and the same copy, and the
// control canvas is byte-identical to the shipped r21 build.
//
// =========================================================================
// RESULTS, AND THE REFUTATION NEXT TO THEM.
//
// ONE RULE, BOTH SIDES (tools/r22_ink.py). A face window is one package front,
// brought to 22 px — the render's own median delivered facing width — with
// BOX. On the render side the window comes from the live instance matrices and
// survives only if 90% of it is package by PKG_STAGE 7, the shader's own
// product mask; on the photograph side it is one cell of a declared shelf-row
// grid, coordinates published in the tool and drawn on
// shots/r22_ref_regions.png. 144 render windows over six poses, 96 photograph
// windows over six of the fourteen reference files.
//
//                      flat p10/p50/p90        cover50 p10/p50/p90
//     photographs      0.052 0.103 0.308         3   10   23
//     render r21       0.085 0.223 0.479         2    3   11
//     render r22       0.081 0.192 0.436         2    5   12
//
// flat improves on 5 of 6 poses (chase_a4 0.103 -> 0.134 is the exception);
// cover50 improves on 5 and holds on 1. Roughly a quarter of the flat gap and
// three tenths of the cover50 gap.
//
// THE CONTROL THAT MAKES THOSE NUMBERS MEAN ANYTHING: windows on manifestly
// FLAT regions — ceiling tile, plain shelf front — read cover50 2 / flat 0.465
// on the photographs and 2 / 0.403 on the render. The statistic is not
// counting sensor noise or JPEG texture; a blank tile scores the same on both
// sides. A render package face sat at 3, one step above a blank ceiling tile.
//
// AND THE REFUTATION, PUBLISHED NEXT TO THE HEADLINE. At 45x32, with every
// glyph destroyed — r21's critic's own test, reproduced in
// shots/r22_blur45.png — the classes are STILL trivially separable by eye. The
// render tiles read as large flat slabs and the photographs as a fine
// saturated mosaic, in the r22 arm as in the r21 one. This round moved the cue.
// It did not close it.
//
// The second refutation is sharper because it is on the critic's own crop.
// Reproducing near_a4 at plate (890,355)-(1100,450) at 4x
// (shots/r22_facing_crops.png), TWO OF THE THREE FACINGS ARE MATERIALLY
// UNCHANGED. The press's structure is at the top, the bottom and one edge of a
// cell; a crop of the middle of a 0.89-1.20 m top-stock case sees the brand
// field and the edge column and nothing else.
// =========================================================================

import { makeRng, rr, ri } from './kit.js';
import { foodB, GOLD, GREEN, RED, CREAM } from './depict.js';

// TWO HALVES, TWO FLAGS, so the report can price them apart. `ink` is the spot
// structure; `tone` is the continuous-tone field described above pressTone().
// PRESS.on gates both, which keeps the headline A/B a single variable.
export const PRESS = { on: true, ink: true, tone: true };
export function setPress(mode) {
  if (mode === 'ink') { PRESS.on = true; PRESS.ink = true; PRESS.tone = false; return 'ink'; }
  if (mode === 'tone') { PRESS.on = true; PRESS.ink = false; PRESS.tone = true; return 'tone'; }
  PRESS.on = mode !== 'r21' && mode !== false && mode !== 'off';
  PRESS.ink = true; PRESS.tone = true;
  return PRESS.on ? 'r22' : 'r21';
}

// --- the ink box ------------------------------------------------------------
// A mask-space fill. `base` is how much of the per-instance brand colour is
// under the spot (0 = paper stock, 255 = full brand); `spot` is a b-channel
// band or null; `s` is the spot's strength over that base; `gv` is print
// brightness. Every colour in this file goes through here, so there is one
// place that knows the channel contract and no call site encodes it.
export const SPOT = { GOLD, GREEN, RED, CREAM };
export const SPOT_KEYS = [GOLD, GREEN, RED, CREAM];
export function pressInk(base, spot, s, gv) {
  const b = spot === null || spot === undefined ? 0 : foodB(spot, s);
  return `rgb(${Math.round(Math.max(0, Math.min(255, base)))},`
    + `${Math.round(Math.max(0, Math.min(255, gv)))},${b})`;
}

// --- the livery -------------------------------------------------------------
// What inks THIS cell is printed in. Deterministic in (atlas, i) so a cell's
// identity does not depend on when it was baked, and so pressCheck() can
// re-derive it without a ledger — the r18 lesson about assertions that read a
// log written at bake time instead of the artefact.
//
// The two spots are drawn WITHOUT REPLACEMENT so no face gets the same ink
// twice, and the second is biased away from the first's neighbour in the
// warm ramp so a gold/cream pairing (which reads as one ink at 8 px) is rare.
const PAIRS = [
  [GOLD, RED], [RED, CREAM], [GREEN, CREAM], [RED, GREEN], [GOLD, GREEN],
  [CREAM, RED], [GREEN, GOLD], [CREAM, GREEN], [RED, GOLD], [GOLD, CREAM],
];
export function livery(atlas, i) {
  const seed = (atlas.charCodeAt(0) * 7127 + atlas.charCodeAt(1) * 613 + i * 2654435761) >>> 0;
  const rng = makeRng(seed || 1);
  const pr = PAIRS[Math.floor(rng() * PAIRS.length) % PAIRS.length];
  // BASE: is the big field the brand colour or the paper? Kept at the r21
  // ratio per family by the caller; this only decides the SPOTS.
  const dark = rng() < 0.34;          // the spot fields are deep rather than bright
  const L = {
    rng,
    a: pr[0], b: pr[1],
    // print brightness for each spot field. Two decades apart so the two zones
    // separate in VALUE as well as in hue — at 8 px the value step is what
    // survives, the hue is what makes it read as ink rather than as shading.
    aG: dark ? ri(rng, 62, 108) : ri(rng, 188, 246),
    bG: dark ? ri(rng, 196, 250) : ri(rng, 58, 104),
    // A SPOT IS PRINTED AT FULL STRENGTH OR IT IS NOT A SPOT. The first draft
    // ran 0.55-1.0 and the census said so: at 0.55 over a brand base the zone
    // is 45% brand and reads as a shade of it, not as a second ink. What makes
    // the brand field survive is that the spot zones are SMALL, not that they
    // are weak — which is also what a real carton does with a gold band.
    aS: rr(rng, 0.86, 1.0),
    bS: rr(rng, 0.82, 1.0),
    // the KEY: the dark rule ink every zone boundary is drawn in. Paper at a
    // low g is a warm near-black, which is what a keyline actually is.
    keyG: ri(rng, 18, 46),
    // the LIGHT: a paper-white rule, for boundaries against a dark field.
    litG: ri(rng, 236, 254),
    // WHICH ARCHETYPE. 2 (the framed paper panel) is drawn twice as often as
    // the others: it is the only one whose structure reaches the MIDDLE rows of
    // a tall facing, which is what r21's critic's own crop was showing.
    plate: [0, 1, 2, 2, 3, 4, 5][Math.floor(rng() * 7)],
    tint: rr(rng, 0.22, 0.44),         // strength of a screened field
  };
  // THE BASE UNDER A SPOT IS THE BRAND, NOT THE PAPER, and getting that wrong
  // cost this round its first draft. `pressInk(0, spot, s, g)` prints the spot
  // on bare stock, so a zone at s = 0.3 is a PALE TINT ON WHITE — and the first
  // build replaced whole crimson fields with dusty pink, taking the store's
  // chroma down with it. That is trading this round's gap for round 13's.
  //
  // On the brand base a partial spot is a SHIFTED BRAND (still saturated) and a
  // full spot is a true second ink (brand-independent to within foodB's 0.97
  // clamp). The only zone that prints on bare paper is the one that is supposed
  // to be paper: a white panel, which is a real device and a large light block
  // rather than a washed-out field.
  L.inkA = (gv) => pressInk(255, L.a, L.aS, gv === undefined ? L.aG : gv);
  L.inkB = (gv) => pressInk(255, L.b, L.bS, gv === undefined ? L.bG : gv);
  // a shifted brand: chromatic, not washed
  L.inkAt = (gv) => pressInk(255, L.a, L.tint, gv === undefined ? 214 : gv);
  L.inkBt = (gv) => pressInk(255, L.b, L.tint, gv === undefined ? 208 : gv);
  // genuine coated stock, no spot at all — the white legal panel every
  // photograph in reference/ has and every render face in r21 did not
  L.paper = (gv) => pressInk(0, null, 0, gv === undefined ? 244 : gv);
  L.key = () => pressInk(0, null, 0, L.keyG);
  L.lit = () => pressInk(0, null, 0, L.litG);
  return L;
}

// --- painters ---------------------------------------------------------------
// All of them take mask-space fills from the livery. None draws text, so the
// type audit's unguarded-fillText count cannot move.
const RULE_PX = 3;                     // a keyline at atlas resolution

function zone(g, x, y, w, h, fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }

function rule(g, x, y, w, h, fill) {
  g.fillStyle = fill;
  g.fillRect(x, y, Math.max(w >= h ? w : RULE_PX, 1), Math.max(h >= w ? h : RULE_PX, 1));
}

function poly(g, pts, fill) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath(); g.fill();
}

// A screened tint: fine rules at a pitch that survives one mip and averages to
// a tint after two. This is what stops a large zone reading as a vinyl sticker
// at close range while still delivering a flat block at chase range.
function screen(g, x, y, w, h, fill, pitch, vert) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = fill;
  if (vert) for (let k = x; k < x + w; k += pitch) g.fillRect(k, y, pitch * 0.45, h);
  else for (let k = y; k < y + h; k += pitch) g.fillRect(x, k, w, pitch * 0.45);
  g.restore();
}

// A row of small colour chips — the icon strip along the bottom of a real
// promo panel, the flavour swatches on a carton masthead.
function chips(g, x, y, w, h, n, fills) {
  const gap = w / n;
  for (let k = 0; k < n; k++) {
    zone(g, x + k * gap + gap * 0.12, y, gap * 0.76, h, fills[k % fills.length]);
  }
}

// =========================================================================
// CONTINUOUS TONE, AND WHY A SECOND HALF WAS NEEDED AT ALL.
//
// The ink structure above was built, measured, and found to move the cue by
// about a tenth of the distance to a photograph. The face-window census
// (tools/r22_ink.py, one rule both sides, every window normalised to 22 px —
// the render's own median delivered facing width):
//
//                       flat p10/p50/p90        cover50 p10/p50/p90
//     photographs      0.052 0.099 0.223          5   11   26
//     render r21       0.116 0.246 0.574          1    3    7
//     render, ink only 0.110 0.231 0.545          1    3    8
//
// AND THE CONTROL THAT MAKES THOSE NUMBERS MEAN SOMETHING. Windows on
// manifestly FLAT regions — ceiling tile, plain shelf front — read cover50 2
// on the photographs and 2 on the render, flat 0.465 against 0.403. So the
// statistic is not counting sensor noise or JPEG texture: a blank tile scores
// the same on both sides. A render PACKAGE FACE sits at 3, one step above a
// blank ceiling tile, while a photographed one sits at 11.
//
// WHAT IS MISSING IS NOT MORE ZONES, IT IS TONE INSIDE THEM. A rendered box
// face has ONE normal, so Lambert gives it exactly ONE illumination value from
// edge to edge, and every fill under that is a single exact byte. A real box
// face is board that bows, printed with screens and gradients and photography,
// varnished so it catches the troffer above it at a different angle at every
// point, and lit by an extended source with falloff across the facing. None of
// that is information the player reads — it is why the surface does not look
// die-cut.
//
// So this writes a smooth low-frequency field into the PRINT-BRIGHTNESS
// channel and nothing else. One channel, the form glint() and the pouch
// streaks already use, for the reason this file's round-12 header gives: b is
// an INDEX and a neutral shading term walks a red band into the green one.
//
// It is a separate flag from the ink so the report can price the two halves
// apart, and so a critic can turn either off on one page load.
// =========================================================================
// =========================================================================
// AND THE NEGATIVE RESULT, WRITTEN ABOVE THE TERM IT UNDERCUTS.
//
// The tone half is nearly REDUNDANT with the ink half. Measured on one page
// load, four arms, 144 product-mask-gated face windows over six poses, every
// window normalised to 22 px:
//
//                     flat p50    cover50 p50    da* p50    db* p50
//     r21 control       0.223          3          10.4       19.2
//     TONE only         0.219          4          15.5       21.0
//     INK only          0.194          5          17.7       26.1
//     both (shipped)    0.192          5          17.5       25.8
//     photographs       0.103         10          22.7       30.7
//
// Ink alone reaches the shipped figure on every column, and on da* it is
// fractionally AHEAD of the pair. The tone term moves the cue on its own and
// adds essentially nothing on top of the ink.
//
// IT SHIPS ANYWAY, for stated reasons rather than measured ones, and this is
// the round-13 pattern rather than an excuse. It is bake-time only: draw calls
// 176 and 1,926,636 triangles identical with it on and off, no texture, no
// runtime cost. It costs 0.35-0.73% of product-mask luma across three poses,
// against the ink half's +4.6%, so the wall is brighter either way and nothing
// round 13 or 14 closed is disturbed. And it is the honest model: a rendered
// box face has ONE normal and therefore ONE Lambert value from edge to edge,
// which no printed board under a troffer row has ever had.
//
// WHAT THE NEXT ROUND SHOULD NOT DO: reach for a bigger tone amplitude. The
// axis it moves is already the one the render is LEAST short on — see the
// spread table above, where dL* runs 29.3 against a photograph's 44.2 while
// da* runs 10.4 against 22.7. And note that a pure print-brightness multiply
// moves Lab a* as well, because a* is not exposure-invariant (AGENTS_BRIEF's
// C*/(L*+16) entry), so part of TONE-only's da* 10.4 -> 15.5 is L* coupling
// and not chroma at all.
// =========================================================================
export function pressTone(g, x, y, w, h, L, amp = 1.0) {
  if (!PRESS.on || !PRESS.tone) return;
  const R = L.rng;
  // A coarse field drawn small and scaled up with smoothing: 7x9 cells over the
  // face, so one cell is about 3 px of a 22 px delivered facing — coarse enough
  // to survive the mip chain, fine enough not to read as a vignette.
  const CX = 7, CY = 9;
  const t = document.createElement('canvas');
  t.width = CX; t.height = CY;
  const tg = t.getContext('2d');
  // two smooth lobes plus a shallow plane: board bow, gloss sweep, lamp falloff
  const ax = rr(R, -1, 1), ay = rr(R, -1, 1);
  const px1 = rr(R, 0.1, 0.9), py1 = rr(R, 0.1, 0.9), s1 = rr(R, 0.25, 0.55);
  const px2 = rr(R, 0.1, 0.9), py2 = rr(R, 0.1, 0.9), s2 = rr(R, 0.15, 0.40);
  const A = rr(R, 0.10, 0.19) * amp;
  for (let j = 0; j < CY; j++) {
    for (let i2 = 0; i2 < CX; i2++) {
      const u = (i2 + 0.5) / CX, v = (j + 0.5) / CY;
      let f = ax * (u - 0.5) + ay * (v - 0.5);
      f += 1.1 * Math.exp(-(((u - px1) ** 2 + (v - py1) ** 2) / (2 * s1 * s1)));
      f -= 0.9 * Math.exp(-(((u - px2) ** 2 + (v - py2) ** 2) / (2 * s2 * s2)));
      const k = Math.max(0, Math.min(1, 0.5 + f * 0.45));
      // multiply factor in [1-A, 1]: darken only, so nothing clips the top of
      // the print channel and the round-11 Jensen trap (a term that degenerates
      // to a pure multiply on a flat source) cannot brighten a plate past 255.
      const mul = 1 - A * (1 - k);
      tg.fillStyle = `rgba(255,${Math.round(255 * mul)},255,1)`;
      tg.fillRect(i2, j, 1, 1);
    }
  }
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.globalCompositeOperation = 'multiply';
  g.imageSmoothingEnabled = true;
  g.drawImage(t, x, y, w, h);
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

// A GLOSS SWEEP. One broad diagonal band of lift in the print channel — the
// troffer row reflected in the varnish. Same single-channel rule: `lighter`
// with rgba(0,X,0,a), which is what glint() below in pack.js already does for
// the cylinder families and what nothing on a carton has ever had.
export function pressGloss(g, x, y, w, h, L) {
  if (!PRESS.on || !PRESS.tone) return;
  const R = L.rng;
  const cx = x + w * rr(R, 0.18, 0.72), halfW = w * rr(R, 0.16, 0.34);
  const add = ri(R, 16, 40);
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.translate(cx, y + h * 0.5);
  g.rotate(rr(R, -0.42, 0.42));
  const gr = g.createLinearGradient(-halfW, 0, halfW, 0);
  gr.addColorStop(0.00, 'rgba(0,0,0,0)');
  gr.addColorStop(0.50, `rgba(0,${add},0,1)`);
  gr.addColorStop(1.00, 'rgba(0,0,0,0)');
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr;
  g.fillRect(-halfW, -h, halfW * 2, h * 2);
  g.globalCompositeOperation = 'source-over';
  g.restore();
}

// --- CARTON -----------------------------------------------------------------
// `A` is the layout the caller has already decided, so the structure cannot
// land on the type: { wmTop, wmBot, flY, flH, footY, fam }. Every measurement
// is a fraction of the printed front, so a cell resize carries it.
//
// The six archetypes are the ones a supermarket carton actually uses. Each puts
// three to five zones on the face, each zone at least a tenth of it, with a
// hard keyline at every boundary — which is the edge that survives the mip
// chain when the type does not.
export function pressCarton(g, x0, fw, H, i, A) {
  if (!PRESS.on) return null;
  const L = livery('carton', i);
  const R = L.rng;
  const zones = [];
  const zi = (name, x, y, w, h, fill) => {
    if (!PRESS.ink) { zones.push({ name, x, y, w, h }); return; }
    zone(g, x, y, w, h, fill); zones.push({ name, x, y, w, h });
  };
  if (!PRESS.ink) { pressTone(g, x0, 0, fw, H, L); pressGloss(g, x0, 0, fw, H, L); return { L, zones }; }
  // THE ZONE BUDGET. Every archetype below leaves a majority of the face as the
  // ground cartonDesign already painted — the brand field — and spends the rest
  // on two spots, a paper panel and rules. That is not a style preference: it is
  // what stops this round undoing round 13's chroma work, and pressCheck()
  // asserts it per cell off the canvas rather than trusting the arithmetic here.
  //
  // The masthead runs from the top of the face to just above the wordmark, so
  // no glyph ever straddles its keyline. Floored at 0.09 of the face because a
  // band thinner than that is one texel at mip 4 and delivers nothing; capped
  // at 0.22 so it cannot eat the field.
  const mastH = Math.max(H * 0.09, Math.min(H * 0.22, A.wmTop - H * 0.02));
  const footY = Math.min(H * 0.90, Math.max(A.flY + A.flH + H * 0.02, H * 0.72));

  switch (L.plate) {
    case 0: {   // MASTHEAD + FOOT FIELD. The commonest grocery carton there is.
      zi('mast', x0, 0, fw, mastH, L.inkA());
      rule(g, x0, mastH - RULE_PX, fw, RULE_PX, L.aG > 140 ? L.key() : L.lit());
      zi('foot', x0, footY, fw, H - footY, L.inkB());
      rule(g, x0, footY, fw, RULE_PX, L.key());
      screen(g, x0, 0, fw, mastH * 0.55, L.inkB(L.aG > 140 ? 90 : 232), 9, false);
      break;
    }
    case 1: {   // SHOULDER + SKIRT, with a chip row. Two spots, field between.
      const sy = Math.min(H * 0.80, Math.max(H * 0.62, A.flY + A.flH + H * 0.04));
      zi('shoulder', x0, 0, fw, mastH, L.inkAt());
      zi('skirt', x0, sy, fw, H - sy, L.inkB());
      rule(g, x0, sy - RULE_PX * 0.5, fw, RULE_PX * 1.6, L.key());
      chips(g, x0 + fw * 0.06, H - H * 0.048, fw * 0.42, H * 0.028, 4,
        [L.inkA(), L.lit(), L.inkA(232), L.key()]);
      break;
    }
    case 2: {   // PANEL. A framed PAPER plate — the white legal block every
                // photograph has and no r21 face carried at this size.
      const px = x0 + fw * 0.185, py = Math.max(H * 0.035, A.wmTop - H * 0.055);
      const pw = fw * 0.76, ph = Math.min(H * 0.70, Math.max(H * 0.44, (A.flY - py) + A.flH * 3.2));
      zi('panel', px, py, pw, ph, L.paper(246));
      g.strokeStyle = L.key(); g.lineWidth = RULE_PX;
      g.strokeRect(px, py, pw, ph);
      zi('cap', px, py, pw, Math.min(H * 0.062, ph * 0.26), L.inkA());
      zi('foot', x0, H * 0.90, fw, H * 0.10, L.inkB());
      break;
    }
    case 3: {   // WEDGE. A diagonal, which no rectangle grammar can produce.
      const dy = H * rr(R, 0.66, 0.80), dr = H * rr(R, 0.06, 0.14);
      poly(g, [[x0, dy + dr], [x0 + fw, dy - dr], [x0 + fw, H], [x0, H]], L.inkB());
      poly(g, [[x0, dy + dr - RULE_PX * 2], [x0 + fw, dy - dr - RULE_PX * 2],
        [x0 + fw, dy - dr], [x0, dy + dr]], L.key());
      zones.push({ name: 'wedge', x: x0, y: dy - dr, w: fw, h: H - (dy - dr) });
      zi('mast', x0, 0, fw, mastH * 0.86, L.inkA());
      break;
    }
    case 4: {   // ARC. A sweep across the lower third, the juice-carton device.
      const cy = H * rr(R, 1.30, 1.58), rad = H * rr(R, 0.60, 0.82);
      g.save();
      g.beginPath(); g.rect(x0, 0, fw, H); g.clip();
      g.fillStyle = L.inkB();
      g.beginPath(); g.ellipse(x0 + fw * 0.5, cy, fw * 0.95, rad, 0, 0, 6.2832); g.fill();
      g.strokeStyle = L.key(); g.lineWidth = RULE_PX * 1.4;
      g.beginPath(); g.ellipse(x0 + fw * 0.5, cy, fw * 0.95, rad, 0, 0, 6.2832); g.stroke();
      g.restore();
      zones.push({ name: 'arc', x: x0, y: cy - rad, w: fw, h: H - (cy - rad) });
      zi('mast', x0, 0, fw, mastH, L.inkA());
      rule(g, x0, mastH - RULE_PX, fw, RULE_PX, L.lit());
      break;
    }
    default: {  // 5: BANDED. Masthead, brand field, foot — the cereal device.
      const b1 = mastH, b2 = Math.min(H * 0.86, Math.max(H * 0.74, A.flY + A.flH + H * 0.06));
      zi('mast', x0, 0, fw, b1, L.inkA());
      zi('foot', x0, b2, fw, H - b2, L.inkB());
      rule(g, x0, b1 - RULE_PX, fw, RULE_PX, L.key());
      rule(g, x0, b2 - RULE_PX, fw, RULE_PX, L.key());
      screen(g, x0, b2, fw, H - b2, L.lit(), 13, true);
      break;
    }
  }
  // A FULL-HEIGHT EDGE COLUMN, and it exists because of a crop rather than a
  // number. Reproducing r21's critic's own region — near_a4, plate coordinates
  // (890,355)-(1100,450) — showed the first draft of this file changing almost
  // nothing there: the masthead is rows 0-27 of a 240-row cell and the foot
  // starts at row 173, so a crop of the MIDDLE of a tall top-stock case sees
  // pure brand field and no press at all. 42% of the face was untouched, and it
  // is the 42% a chase-range crop of a 1.2 m case actually shows.
  //
  // A colour column down one edge is what a real carton puts there, and unlike a
  // band it intersects EVERY horizontal slice of the face. It sits outside the
  // wordmark's own box: the marks are centred at 0.86-0.94 of the printed front,
  // so a column at the outer 16% overlaps their last glyph at worst, and
  // fitText's contrast guarantee measures the ground it actually lands on.
  // On the panel archetype the column takes the strip the panel leaves, so
  // every archetype has SOMETHING that crosses every row of the face.
  if (R() < 0.86) {
    const cwid = fw * (L.plate === 2 ? rr(R, 0.10, 0.16) : rr(R, 0.13, 0.20));
    const right = L.plate === 2 ? false : R() < 0.62;
    const cx0 = right ? x0 + fw - cwid : x0;
    zi('column', cx0, 0, cwid, H, L.inkB());
    rule(g, right ? cx0 - RULE_PX : cx0 + cwid, 0, RULE_PX, H, L.key());
    // a stack of ticks down it: a real edge column carries a repeat, and at
    // 22 px delivered the repeat is what keeps the column from being a slab.
    const step = H / ri(R, 7, 12);
    for (let ty = step * 0.5; ty < H; ty += step) {
      g.fillStyle = L.lit();
      g.fillRect(cx0 + cwid * 0.22, ty, cwid * 0.56, Math.max(2, step * 0.16));
    }
  }

  // A CORNER DEVICE on a third of faces: a small saturated block in the second
  // ink, top-left or bottom-right, where a real carton puts its NEW or its
  // fraction-of-a-dollar flag.
  if (R() < 0.34) {
    const cw = fw * rr(R, 0.16, 0.28), ch = H * rr(R, 0.05, 0.09);
    const left = R() < 0.5;
    zi('flag', left ? x0 : x0 + fw - cw, left ? H * 0.012 : H - ch - H * 0.012, cw, ch,
      left ? L.inkB() : L.inkA());
  }
  // TONE LAST, over every zone: it is a property of the printed SHEET, not of
  // one panel, so a zone boundary must not show through it as a seam.
  pressTone(g, x0, 0, fw, H, L);
  pressGloss(g, x0, 0, fw, H, L);
  return { L, zones };
}

// --- POUCH ------------------------------------------------------------------
// A bag is film, so its structure is a printed field under a crinkle, and the
// crimp at top and bottom is a real physical band. The r21 face was one
// brightness of brand for the whole bag with a darker crimp.
export function pressPouch(g, x0, fw, H, i, A) {
  if (!PRESS.on) return null;
  const L = livery('pouch', i);
  const R = L.rng;
  const zones = [];
  const zi = (name, x, y, w, h, fill) => {
    if (!PRESS.ink) { zones.push({ name, x, y, w, h }); return; }
    zone(g, x, y, w, h, fill); zones.push({ name, x, y, w, h });
  };
  if (!PRESS.ink) { pressTone(g, x0, H * 0.085, fw, H * 0.815, L); return { L, zones }; }
  if (L.plate < 2) {
    // a printed band across the shoulder plus a deep foot
    zi('shoulder', x0, H * 0.085, fw, H * rr(R, 0.10, 0.15), L.inkA());
    zi('foot', x0, H * 0.755, fw, H * 0.145, L.inkB());
    rule(g, x0, H * 0.755, fw, RULE_PX, L.key());
  } else if (L.plate < 4) {
    // a lower field with an arc top — the chip-bag device
    g.save();
    g.beginPath(); g.rect(x0, H * 0.085, fw, H * 0.815); g.clip();
    g.fillStyle = L.inkB();
    g.beginPath();
    g.ellipse(x0 + fw * 0.5, H * rr(R, 1.42, 1.62), fw * 0.92, H * rr(R, 0.62, 0.78), 0, 0, 6.2832);
    g.fill();
    g.restore();
    zones.push({ name: 'arc', x: x0, y: H * 0.70, w: fw, h: H * 0.20 });
    zi('mast', x0, H * 0.085, fw, H * 0.090, L.inkA());
  } else {
    // vertical split — two inks side by side, which no shelf in this store has.
    // The right half only, so the wordmark plate at 0.19-0.345 keeps a single
    // ground under it and the field stays the brand's.
    const sx = x0 + fw * rr(R, 0.58, 0.74);
    zi('right', sx, H * 0.085, x0 + fw - sx, H * 0.815, L.inkB());
    g.fillStyle = L.key(); g.fillRect(sx - RULE_PX * 0.5, H * 0.085, RULE_PX, H * 0.815);
    zi('mast', x0, H * 0.085, sx - x0, H * 0.090, L.inkA());
  }
  pressTone(g, x0, H * 0.085, fw, H * 0.815, L);
  return { L, zones };
}

// --- CAN / BOTTLE -----------------------------------------------------------
// The lathe families are laid out in horizontal bands already — the r20 end
// structure and the label bands below it — and every one of those bands is the
// same brand hue at a different g. `pressBands` re-inks them: the caller passes
// the band table it was going to draw, and gets back a fill per band. That
// keeps the GEOMETRY of the r20 layout (which endCheck and latheCheck are
// written against) and changes only the ink.
export function pressBandInk(L, role, fallbackR, fallbackG) {
  if (!PRESS.on) return null;
  switch (role) {
    case 'top': return L.inkA();
    case 'bot': return L.inkB();
    // the picture field keeps the BRAND as its base and takes a light dusting
    // of the second spot, so a can's biggest band stays chromatic rather than
    // going pastel — the fault that killed this round's first draft.
    case 'pict': return L.inkBt(fallbackG > 160 ? 226 : 150);
    case 'key': return L.key();
    case 'lit': return L.lit();
    default: return null;
  }
}

// A vertical wordmark PANEL on a lathe: the one structure a can label has that
// a stack of horizontal bands cannot express, and the thing that makes the
// Bumble Bee wall in store_01 read as designed rather than as striped. It is
// drawn in the middle 62% of the cell because frontFold maps u to bearing over
// +/-90 degrees and anything outside that is compressed into the silhouette.
export function pressCanPanel(g, W, y0, y1, i, L) {
  if (!PRESS.on) return null;
  const R = L.rng;
  if (R() < 0.42) return null;
  const pw = W * rr(R, 0.44, 0.60), px = (W - pw) / 2;
  g.fillStyle = R() < 0.5 ? L.paper(246) : L.inkA();
  g.fillRect(px, y0, pw, y1 - y0);
  g.fillStyle = L.key();
  g.fillRect(px - RULE_PX, y0, RULE_PX, y1 - y0);
  g.fillRect(px + pw, y0, RULE_PX, y1 - y0);
  return { x: px, w: pw };
}

// =========================================================================
// THE ASSERTION. It reads the LIVE atlas canvas — the pixels the CanvasTexture
// is bound to — decodes them through the package shader's own arithmetic, and
// counts inks. It does not read a ledger written while baking, which is the
// failure mode AGENTS_BRIEF records six times on this project.
//
// It is a RELATIVE promise, deliberately, for the reason round 20's subjCheck
// gives: an absolute floor would be a constant shaved to clear its own gate.
// The promise is that every face carries strictly more distinct hue families
// than the same cell carries with PRESS off — which is a claim about the
// change, and it is false the moment a livery stops reaching a face.
// =========================================================================
// THE FOOD SWATCHES. These four vectors are the only part of the shader's
// decode transcribed here rather than passed in, and they are transcribed
// because they are literals in the GLSL string with no JS binding to read.
// vendor.js's decodeMask carries the same four for the same reason; three
// copies of a constant is two too many, so cfgCheck() below asserts this copy
// against the shader SOURCE TEXT at run time rather than trusting it.
const FOODS = [[0.92, 0.58, 0.17], [0.34, 0.64, 0.14], [0.80, 0.115, 0.065], [0.95, 0.735, 0.255]];

// The shader's own decode, on the CPU.
//
// `cfg` IS REQUIRED AND IS NOT DEFAULTED. uPkgStock and uPkgSat are live
// uniforms owned by pack.js; a default here would be a second copy of two
// constants that a later round would tune in one place and not the other,
// which is the hazard CLAUDE.md opens with and which has cost this project two
// rounds already. There is no fallback to rot: pack.js reads its own uniform
// bag and passes it in, and cfgCheck() proves what it passed is live.
export function decodeTexel(r8, g8, b8, br, cfg) {
  const stock = cfg.stock, sat = cfg.sat;
  const r = r8 / 255, gg = g8 / 255, b = b8 / 255;
  const scaled = b * 4;
  const band = Math.min(3, Math.floor(scaled));
  const amt = Math.max(0, Math.min(1, scaled - band));
  const f = FOODS[band];
  const k = 0.045 + 0.955 * gg;
  const o = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const base = stock[c] * (1 - r) + br[c] * r;
    o[c] = base * (1 - amt) + f[c] * amt;
  }
  const lum = 0.2126 * o[0] + 0.7152 * o[1] + 0.0722 * o[2];
  for (let c = 0; c < 3; c++) o[c] = Math.max(0, Math.min(1, lum + (o[c] - lum) * sat)) * k;
  return o;
}

// The four food swatches, checked against the fragment source that actually
// compiled. It reads the material's own shader string, so a round that
// re-authors those literals in pack.js and forgets this file gets a throw at
// the first census rather than a silently wrong hue count.
export function cfgCheck(fragSource) {
  const nums = [];
  const re = /vec3\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g;
  let m;
  while ((m = re.exec(fragSource))) nums.push([+m[1], +m[2], +m[3]]);
  const missing = FOODS.filter((f) => !nums.some((n) =>
    Math.abs(n[0] - f[0]) < 1e-6 && Math.abs(n[1] - f[1]) < 1e-6 && Math.abs(n[2] - f[2]) < 1e-6));
  if (missing.length) {
    throw new Error('press.js FOODS no longer match the compiled shader: '
      + missing.map((f) => f.join(',')).join(' | ')
      + ' — chopPackageMat has been re-authored and this transcription was not.');
  }
  return true;
}

// Linear RGB -> CIE Lab, so the census is in a space where a hue family means
// something. The atlas is authored in mask space, not sRGB, so there is no
// transfer function to undo here: decodeTexel returns linear light.
function toLab(c) {
  const f = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
  const X = (0.4124 * c[0] + 0.3576 * c[1] + 0.1805 * c[2]) / 0.95047;
  const Y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const Z = (0.0193 * c[0] + 0.1192 * c[1] + 0.9505 * c[2]) / 1.08883;
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

// THE CENSUS RULE. Box-downsample the face to NxN — the size a facing is
// actually delivered at, not the size the cell is authored at — quantize Lab,
// and count bins over `minShare`. A square window on one face, box-filtered:
// not an image row across a receding surface.
export function inkCensus(data, w, h, br, cfg, N = 16, minShare = 0.06) {
  const acc = new Float64Array(N * N * 3);
  const cnt = new Float64Array(N * N);
  for (let y = 0; y < h; y++) {
    const by = Math.min(N - 1, Math.floor(y * N / h));
    for (let x = 0; x < w; x++) {
      const bx = Math.min(N - 1, Math.floor(x * N / w));
      const p = (y * w + x) * 4;
      const c = decodeTexel(data[p], data[p + 1], data[p + 2], br, cfg);
      const j = (by * N + bx) * 3;
      acc[j] += c[0]; acc[j + 1] += c[1]; acc[j + 2] += c[2];
      cnt[by * N + bx]++;
    }
  }
  const QL = 12, QA = 16;
  const bins = new Map(); const n = N * N;
  for (let k = 0; k < n; k++) {
    const c = [acc[k * 3] / cnt[k], acc[k * 3 + 1] / cnt[k], acc[k * 3 + 2] / cnt[k]];
    const L = toLab(c);
    const key = (Math.min(QL - 1, Math.max(0, Math.floor(L[0] / (100 / QL)))) * QA * QA)
      + (Math.min(QA - 1, Math.max(0, Math.floor((L[1] + 80) / (160 / QA)))) * QA)
      + Math.min(QA - 1, Math.max(0, Math.floor((L[2] + 80) / (160 / QA))));
    bins.set(key, (bins.get(key) || 0) + 1);
  }
  let inks = 0, flat = 0; const hues = new Set();
  for (const [key, v] of bins) {
    const sh = v / n;
    if (sh > flat) flat = sh;
    if (sh < minShare) continue;
    inks++;
    const ai = Math.floor((key % (QA * QA)) / QA), bi = key % QA;
    const a = (ai + 0.5) * (160 / QA) - 80, b2 = (bi + 0.5) * (160 / QA) - 80;
    if (Math.hypot(a, b2) > 12) hues.add(Math.round(Math.atan2(b2, a) * 3 / Math.PI));
  }
  // COVER50: how many distinct colours it takes to cover half the face.
  //
  // `inks` — bins over a fixed 6% share — is the WRONG SHAPE for this round and
  // measured it backwards on its first run: breaking one slab into four patches
  // drops all four below the threshold, so the carton read 5 -> 4 while `flat`
  // (the largest patch) fell 0.230 -> 0.129. A fixed-threshold count penalises
  // exactly the fragmentation it is supposed to detect. cover50 does not: a
  // face that is one slab needs 1, a mosaic needs many, and nothing about it
  // depends on where a threshold is put. Both are reported; the round leads
  // with flat and cover50 and says why `inks` is kept and not used.
  const sorted = [...bins.values()].sort((a, b2) => b2 - a);
  let acc2 = 0, cover50 = 0;
  for (const v of sorted) { acc2 += v; cover50++; if (acc2 >= n * 0.5) break; }
  return { inks, flat, hues: hues.size, cover50 };
}

// Self-test for decodeTexel against the shader source it transcribes. Called by
// pressCheck; it throws rather than returning a number, because a census run
// through a decode nobody checked is the "assertion that was silently broken
// while its numbers were right" entry in AGENTS_BRIEF.
// EVERY CLAIM HERE IS NON-CIRCULAR. The first draft asserted that bare stock
// decodes to the stock vector times g — and it FIRED, correctly, because the
// print-saturation step scales chroma about luma and the stock is not neutral
// (0.855, 0.845, 0.822). The assertion was wrong and the code was right, which
// is the cheapest possible version of AGENTS_BRIEF's "test a new guard in both
// directions". What replaces it are four properties that hold whatever
// uPkgSat and uPkgStock are set to, so tuning either cannot make this lie.
const sat0 = (cfg) => cfg.sat;
export function decodeSelfTest(cfg) {
  const hue = (c) => Math.atan2(c[2] - c[1], c[1] - c[0]);
  // 1. b = 0 CARRIES NO FOOD. The saturation step scales chroma about luma, so
  //    it preserves hue angle exactly; a bare-stock texel must come out on the
  //    stock's own hue line whatever the sat constant is.
  const a = decodeTexel(0, 255, 0, [1, 0, 0], cfg);
  if (Math.abs(hue(a) - hue(cfg.stock)) > 0.02) {
    throw new Error('press decodeTexel: b = 0 is not on the stock hue line, '
      + a.join(',') + ' vs stock ' + cfg.stock.join(','));
  }
  // 2. g IS AFFINE AND IS THE ONLY BRIGHTNESS TERM. Two g values must differ by
  //    exactly the ratio of their gMul, on every channel.
  const g1 = decodeTexel(0, 255, 0, [1, 0, 0], cfg);
  const g2 = decodeTexel(0, 128, 0, [1, 0, 0], cfg);
  const kr = (0.045 + 0.955 * 128 / 255) / (0.045 + 0.955);
  for (let c = 0; c < 3; c++) {
    if (Math.abs(g2[c] - g1[c] * kr) > 1e-9) {
      throw new Error('press decodeTexel: g is not affine at channel ' + c);
    }
  }
  // 3. A FULL SPOT IS BRAND-INDEPENDENT TO THE LIMIT foodB ALLOWS, and the
  //    limit is derived rather than tolerated. foodB clamps its amount to 0.97
  //    and quantizes to 62 steps, so the strongest spot this palette can encode
  //    is band*64 + 60 — an amt of 0.949, NOT 1.0. Five percent of the base
  //    always shows through, amplified by the print-saturation step. The bound
  //    below is that arithmetic; if it is ever exceeded the mix has changed,
  //    and if foodB's clamp changes the bound moves with it.
  //
  //    (This assertion fired on its first run at a hand-picked 0.02 and the
  //    code was right: the leak is real and it is 4.5% on the worst pair of
  //    brands in the store. A tolerance nobody derived is not an assertion.)
  const B1 = [0.1, 0.9, 0.1], B2 = [0.9, 0.1, 0.9];
  const code = foodB(RED, 1.0);
  const amt = code / 255 * 4 - 2;
  const bound = (1 - amt) * Math.max(...B1.map((v, c) => Math.abs(v - B2[c]))) * sat0(cfg) * 1.05;
  const r1 = decodeTexel(255, 255, code, B1, cfg);
  const r2 = decodeTexel(0, 255, code, B2, cfg);
  for (let c = 0; c < 3; c++) {
    if (Math.abs(r1[c] - r2[c]) > bound) {
      throw new Error('press decodeTexel: a full spot leaks ' + Math.abs(r1[c] - r2[c]).toFixed(4)
        + ' of the brand at channel ' + c + ', past the ' + bound.toFixed(4)
        + ' foodB\'s 0.97 clamp allows');
    }
  }
  // 4. AND THE FOUR SPOTS ARE FOUR DIFFERENT HUES. A palette whose members
  //    collapse onto each other is a one-ink press wearing four names.
  const hs = SPOT_KEYS.map((s) => hue(decodeTexel(0, 255, foodB(s, 1.0), [1, 1, 1], cfg)));
  for (let x = 0; x < hs.length; x++) {
    for (let y2 = x + 1; y2 < hs.length; y2++) {
      if (Math.abs(hs[x] - hs[y2]) < 0.15) {
        throw new Error('press decodeTexel: spots ' + x + ' and ' + y2
          + ' decode to the same hue (' + hs[x].toFixed(3) + ')');
      }
    }
  }
  return true;
}
