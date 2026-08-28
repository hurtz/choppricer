// OWNER: builder-store (builder-fixture, round 20; builder-signage, round 26).
// THE AISLE VOLUME.
//
// Contract — must keep exporting exactly this:
//   INTR_COLS / INTR_ROWS        atlas grid
//   intrusionAtlas(THREE)        16 cells of point-of-purchase artwork
//   makeIntrusions(ctx)          -> { deck(o), face(o), ledger() }
//   lipCensus(THREE, scene, o)   the protrusion profile, read off the SCENE
//   intrusionCheck(THREE, scene) throws if the aisle volume is empty again
//
// =========================================================================
// ROUND 26 — THE CARDS WERE PLANES. See ./card.js for the whole argument; the
// three-line version is that r25's critic called shelf-edge signage "floating
// decals, not physical card", and a census of the LIVE scene before anything
// was built agreed with it completely: 15 printed-surface soups, 21,278 quads,
// ZERO quads with a short edge under 8 mm. No card in this building had a rim.
//
// Round 20 made these objects stand in the aisle volume. Round 26 makes them
// OBJECTS: board with print on it, hooked over something, bent by gravity, and
// tested against what is already standing where they want to go.
//
// THE ABLATION IS `?flatcard`, and it reproduces round 25 byte for byte. Every
// number this round adds — board thickness, curl, how far a card hangs off
// true, how many candidate positions the resolver tries — comes out of a HASH
// of the object's own position, never out of `rng()`, so the two arms consume
// the identical random stream and place the identical objects in the identical
// order. r24's `drawSig` found two arms differing by one instance because a
// gate short-circuited an rng call; the way not to have that bug is not to
// draw.
//
// =========================================================================
// ROUND 20 — WHY THIS FILE EXISTS.
//
// The r20 blind critic scored 12/12, first glance 12/12, and its headline was
// one sentence: THE AISLE VOLUME IS EMPTY. Not the colour, not the lighting,
// not the type — the space between the two shelf faces. Its evidence plate is
// shots/r20_critic_shelfedge.png, four panels, two render two photograph:
//
//   reference/store_03_Food_aisle_at_Publix...  crop (1300,560)-(1900,898)
//     FOUR objects project past the shelf plane in one 600 px crop: a wobbler
//     on a plastic arm, a clip strip hung into the aisle with a hang-tag, a
//     row of EMPTY clipstrip hooks, and a card hanging by one corner.
//   reference/store_02_Langenstein_s...          crop (1180,380)-(1720,684)
//     THREE: wire dividers and peg hooks, a coiled cable hanging off a shelf,
//     peg-hung product overhanging the lip.
//
//   all twelve r20 render plates: ZERO to TWO, and every one of them the same
//     object — a flat, camera-facing, zero-thickness billboard quad with no
//     shadow and no overlap onto the product behind it.
//
// THE CONSEQUENCE IS THE THING, and it is why this is a geometry round and not
// a shading one: every object in this store stopped exactly at the shelf plane,
// so the shelf edge read as an unbroken ruler-straight bar from gondola end to
// gondola end. That silhouette is what the critic called first in ALL SIX
// poses — including the three chase poses where no product text is legible at
// all. A colour statistic cannot move a silhouette. Three rounds were spent
// finding that out.
//
// SO THE FOUR RULES EVERYTHING IN HERE IS BUILT ON:
//
//   1. THICKNESS. These are objects standing in the aisle volume, not decals
//      on the face plane. Every family emits real boxes and real rods through
//      Batch, which is also what puts them into light.js's occupancy field —
//      a camera-facing quad is what the store already had and it is the exact
//      thing being called.
//   2. OVERLAP. They hang IN FRONT of the facings, 55-130 mm proud of the lip,
//      so they cover product in the image. That occlusion is the depth cue and
//      it is free: it is geometry, not shading.
//   3. THEY BREAK THE LIP SILHOUETTE. Every family is authored by how far past
//      the lip plane it reaches, and lipCensus() below measures exactly that,
//      off the instance matrices, after the build.
//   4. EMPTY AND BROKEN STATES COUNT AS MUCH AS FULL ONES. A clip strip with
//      three of twelve pockets filled, a bare hook, a wobbler bent the wrong
//      way, a tag hanging by one corner. Every family here has a broken state
//      and the check asserts the broken states were reached.
//
// AND THE SCALE REALITY CHECK, WHICH DECIDES THE ART: the median can facing is
// 1.5-2.4 px at chase range, 8.5 px at the closest pose the rig can reach,
// 54 px maximum anywhere. At chase range these things are SILHOUETTE against
// the aisle and nothing else. So the artwork is authored coarse and loud — two
// or three elements per card, full-bleed colour, no small copy that would only
// ever be mush — and the geometry is authored by its outline. No per-object
// legibility claim is available at chase range and none is made here.

import { rr, ri, pick, makeRng } from './kit.js';
import { FACE } from './brands.js';
import { VENDORS, vendorMark } from './vendor.js';
import * as CD from './card.js';

// ---------------------------------------------------------------------------
// THE ARTWORK.
//
// Four families in one 4x4 atlas, because these are four different physical
// objects and a store gets all four from four different companies:
//
//   0-5   VIOLATOR   the rigid card that sticks straight out into the aisle,
//                    perpendicular to the shelf. Read walking up the aisle,
//                    which is why it is the loudest thing on this list.
//   6-8   HEADER     the top card of a clip strip. Tall and narrow.
//   9-11  TAPED      a photocopy somebody taped to the shelf edge. White,
//                    marker type, crooked, no design at all — this is the one
//                    that is NOT a design system, and its whole value is that
//                    it looks like nobody designed it.
//   12-15 TAG        a small swing tag, hung by one corner off the rail.
//
// Cells are square in the atlas but the CARDS are not, so each cell is drawn
// through a transform that maps the card's own aspect onto the square. Draw in
// card units, get correct type on a 1.6:1 quad. Without it a violator's type
// comes out stretched 1.6x and the r18 lesson about legibility is undone by
// arithmetic.
export const INTR_COLS = 4, INTR_ROWS = 4;
const CELL = 256;

// how each cell's artwork is proportioned, w:h in card units
const CELL_ASPECT = [
  1.65, 1.65, 1.65, 1.45, 1.45, 1.85,      // violators
  0.62, 0.62, 0.70,                        // clip-strip headers
  0.78, 0.78, 0.86,                        // taped photocopies
  0.72, 0.72, 1.30, 0.66,                  // swing tags
];
export const aspectOf = (cell) => CELL_ASPECT[cell % CELL_ASPECT.length];
export const VIOLATOR_CELLS = [0, 1, 2, 3, 4, 5];
export const HEADER_CELLS = [6, 7, 8];
export const TAPED_CELLS = [9, 10, 11];
export const TAG_CELLS = [12, 13, 14, 15];

// One record per cell actually painted, so intrusionCheck can prove the atlas
// was drawn rather than merely declared. Same contract as pack.js's CELL_LOG.
const DREW = new Set();
export function drawnCells() { return [...DREW].sort((a, b) => a - b); }

const shout = ['#d3181d', '#e8630f', '#1f4f8f', '#2f7d32', '#c8171a', '#7a2478'];

function burst(g, cx, cy, r, n, fill) {
  g.fillStyle = fill;
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const rr2 = i % 2 ? r * 0.72 : r;
    const x = cx + Math.cos(a) * rr2, y = cy + Math.sin(a) * rr2;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.closePath(); g.fill();
}

// type fitted to a box, the one way this project draws display type — the r18
// lesson: guarantee the fit where the type is drawn, not in a table beside it
function fit(g, txt, cx, cy, maxW, size, face, fill, align = 'center') {
  g.font = '900 ' + size + 'px ' + face;
  g.fillStyle = fill;
  g.textAlign = align;
  const w = g.measureText(txt).width || 1;
  g.save();
  g.translate(cx, cy);
  if (w > maxW) g.scale(maxW / w, 1);
  g.fillText(txt, 0, 0);
  g.restore();
}

export function intrusionAtlas(THREE) {
  const c = document.createElement('canvas');
  c.width = CELL * INTR_COLS; c.height = CELL * INTR_ROWS;
  const g = c.getContext('2d');
  const rng = makeRng(0x1A15E);
  g.textBaseline = 'alphabetic';

  // draw cell i in card units (W x H), mapped onto the square atlas cell
  const cell = (i, draw) => {
    const A = aspectOf(i);
    const W = 100 * A, H = 100;
    g.save();
    g.translate((i % INTR_COLS) * CELL, Math.floor(i / INTR_COLS) * CELL);
    g.beginPath(); g.rect(0, 0, CELL, CELL); g.clip();
    g.scale(CELL / W, CELL / H);
    draw(W, H);
    g.restore();
    DREW.add(i);
  };

  // ---- VIOLATORS ---------------------------------------------------------
  // Two-sided in the world, so the artwork has to work read from either side;
  // it is one flat card, which is what a real violator is.
  for (const i of VIOLATOR_CELLS) {
    cell(i, (W, H) => {
      const v = VENDORS[i % VENDORS.length];
      const hue = shout[i % shout.length];
      const style = i % 3;
      g.fillStyle = style === 1 ? '#fffbe8' : hue;
      g.fillRect(0, 0, W, H);
      if (style === 0) {
        // a starburst with a price in it, and the vendor's mark under it
        burst(g, W * 0.30, H * 0.46, H * 0.40, 12, '#ffdf1a');
        fit(g, ri(rng, 1, 4) + '/$' + ri(rng, 3, 9), W * 0.30, H * 0.58,
          H * 0.62, H * 0.34, FACE.fat, '#1c1a15');
        vendorMark(g, W * 0.72, H * 0.30, W * 0.44, H * 0.34, v, rng);
        fit(g, 'SAVE NOW', W * 0.72, H * 0.86, W * 0.46, H * 0.20, FACE.grot, '#fffdf2');
      } else if (style === 1) {
        // a plain card with a red band and an arrow pointing at the shelf
        g.fillStyle = hue; g.fillRect(0, 0, W, H * 0.30);
        fit(g, 'NEW', W * 0.50, H * 0.24, W * 0.86, H * 0.26, FACE.fat, '#fffdf2');
        vendorMark(g, W * 0.50, H * 0.46, W * 0.80, H * 0.30, v, rng);
        g.fillStyle = hue;
        g.beginPath();
        g.moveTo(W * 0.18, H * 0.78); g.lineTo(W * 0.62, H * 0.78);
        g.lineTo(W * 0.62, H * 0.68); g.lineTo(W * 0.86, H * 0.88);
        g.lineTo(W * 0.62, H * 1.02); g.lineTo(W * 0.62, H * 0.94);
        g.lineTo(W * 0.18, H * 0.94); g.closePath(); g.fill();
      } else {
        // full-bleed colour, one enormous word, a yellow foot band
        fit(g, pick(rng, ['LOW PRICE', 'ROLLBACK', 'MANAGER SPECIAL', 'CLEARANCE']),
          W * 0.50, H * 0.46, W * 0.92, H * 0.30, FACE.fat, '#fffdf2');
        g.fillStyle = '#ffdf1a'; g.fillRect(0, H * 0.62, W, H * 0.38);
        fit(g, '$' + ri(rng, 1, 9) + '.' + ri(rng, 10, 99), W * 0.50, H * 0.93,
          W * 0.80, H * 0.30, FACE.fat, '#1c1a15');
      }
      g.strokeStyle = 'rgba(30,26,20,0.40)'; g.lineWidth = 1.6;
      g.strokeRect(0.8, 0.8, W - 1.6, H - 1.6);
    });
  }

  // ---- CLIP-STRIP HEADERS -------------------------------------------------
  for (const i of HEADER_CELLS) {
    cell(i, (W, H) => {
      const v = VENDORS[(i * 2) % VENDORS.length];
      g.fillStyle = v.bg; g.fillRect(0, 0, W, H);
      g.fillStyle = '#fffbe8'; g.fillRect(W * 0.06, H * 0.30, W * 0.88, H * 0.44);
      vendorMark(g, W * 0.50, H * 0.44, W * 0.80, H * 0.22, v, rng);
      fit(g, 'GRAB', W * 0.50, H * 0.20, W * 0.86, H * 0.17, FACE.fat, '#fffdf2');
      fit(g, '& GO', W * 0.50, H * 0.90, W * 0.86, H * 0.17, FACE.fat, '#fffdf2');
      // the punched slot the strip hangs by
      g.fillStyle = 'rgba(20,18,14,0.75)';
      g.fillRect(W * 0.36, H * 0.045, W * 0.28, H * 0.030);
    });
  }

  // ---- TAPED PHOTOCOPIES --------------------------------------------------
  // THE POINT OF THESE IS THAT THEY ARE NOT DESIGNED. r18's critic called 13
  // of 14 render tiles off the store's ONE design system; a laser-printed
  // sheet in a hand-lettered marker face, crooked, with tape on it, belongs to
  // no system at all, which is the only reason it is here.
  for (const i of TAPED_CELLS) {
    cell(i, (W, H) => {
      g.fillStyle = i === 10 ? '#f6ea9a' : '#fbfaf4';
      g.fillRect(0, 0, W, H);
      const txt = [
        ['PLEASE', 'DO NOT', 'REMOVE'],
        ['LIMIT 4', 'PER', 'CUSTOMER'],
        ['SEE TAG', 'BELOW', 'FOR PRICE'],
      ][i - 9];
      for (let k = 0; k < txt.length; k++) {
        fit(g, txt[k], W * 0.50, H * (0.34 + k * 0.24), W * 0.86, H * 0.19,
          FACE.grot, '#23201a');
      }
      g.strokeStyle = 'rgba(40,36,28,0.30)'; g.lineWidth = 1.2;
      g.strokeRect(1, 1, W - 2, H - 2);
      // two strips of tape, one at each top corner, at different angles
      for (const s of [0, 1]) {
        g.save();
        g.translate(W * (s ? 0.84 : 0.16), H * 0.055);
        g.rotate((s ? -1 : 1) * 0.55);
        g.fillStyle = 'rgba(226,222,206,0.72)';
        g.fillRect(-W * 0.14, -H * 0.035, W * 0.28, H * 0.070);
        g.restore();
      }
    });
  }

  // ---- SWING TAGS ---------------------------------------------------------
  for (const i of TAG_CELLS) {
    cell(i, (W, H) => {
      const hue = shout[(i + 2) % shout.length];
      g.fillStyle = i === 14 ? '#fffbe8' : hue;
      g.fillRect(0, 0, W, H);
      if (i === 14) {
        // a recipe card: a rule pattern and a headline, nothing legible small
        g.fillStyle = hue; g.fillRect(0, 0, W, H * 0.26);
        fit(g, 'RECIPE', W * 0.50, H * 0.20, W * 0.84, H * 0.19, FACE.serif, '#fffdf2');
        g.fillStyle = 'rgba(40,36,28,0.34)';
        for (let k = 0; k < 5; k++) g.fillRect(W * 0.10, H * (0.40 + k * 0.12), W * 0.80, H * 0.035);
      } else {
        fit(g, pick(rng, ['TRY ME', 'NEW', 'BOGO', '2 FOR']), W * 0.50, H * 0.56,
          W * 0.86, H * 0.30, FACE.fat, '#fffdf2');
        fit(g, '$' + ri(rng, 1, 6) + '.' + ri(rng, 10, 99), W * 0.50, H * 0.86,
          W * 0.72, H * 0.20, FACE.grot, '#ffdf1a');
      }
      // the punched hole it hangs by, top-left, because it hangs by ONE corner
      g.fillStyle = 'rgba(20,18,14,0.70)';
      g.beginPath(); g.arc(W * 0.16, H * 0.10, Math.min(W, H) * 0.055, 0, 6.2832); g.fill();
    });
  }

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 16;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// THE GEOMETRY.
//
// ctx is the small slice of store.js this file needs, handed in rather than
// imported, so store.js keeps ownership of every batch and every soup and this
// file adds no draw call of its own beyond the one card soup:
//
//   rng                     the store's own deterministic rng
//   boxE(x,y,z,ex,ey,ez,sx,sy,sz,hex)   a box with a full euler
//   rod(x,y,z,ex,ey,ez,dia,len,hex)     a cylinder with a full euler
//   Q                       the intrusion card soup (DoubleSide)
//   cellUV(i, cols, rows)   the atlas UV helper
//
// EVERY family takes `lip` and `dir` and is authored by how far past the lip
// it reaches. That number is the round.
// THE ABLATION SWITCH, and why it is a switch and not two git checkouts.
//
// AGENTS_BRIEF: "the strongest evidence came from changing a single dial on a
// byte-identical scene and re-capturing, never from comparing two builds."
// A geometry round cannot literally do that — the geometry IS the change — but
// it can get within one step of it, and the step that decides whether it does
// is THE RANDOM STREAM. store.js runs one rng for the whole building, so a
// round that adds four calls to it re-rolls every facing, every notch and every
// tag downstream: the first before/after plate this round captured had a
// completely different planogram in it and was worthless as evidence.
//
// So the intrusion layer draws from its OWN stream. Nothing it does perturbs a
// single number in the rest of the store, and `?noIntrude` in the URL suppresses
// the whole layer while leaving the store's stream untouched — two page loads of
// the same seed that differ by exactly this file and nothing else.
//
// (What is NOT controlled, and must not be claimed as controlled: the r20 BASELINE
// plates in shots/r20_base_* predate the removal of the old flush wobbler and the
// old in-cavity clip strip, both of which drew from the shared stream. Against
// those plates the planogram moved. Against `?noIntrude` on this build it did not.)
const QS = (() => { try { return location.search || ''; } catch { return ''; } })();
const OFF = /[?&]noIntrude(&|=|$)/i.test(QS);
export const suppressed = () => OFF;
// ROUND 26's dial. `?flatcard` = round 25, byte for byte: zero-thickness print
// quads, no board, no hook, no curl, no collision resolution. It is a SEPARATE
// flag from ?noIntrude because the two answer different questions — noIntrude
// asks "is the aisle volume worth anything", flatcard asks "is a card worth
// being a solid" — and a round that conflates them cannot attribute either.
const FLAT = /[?&]flatcard(&|=|$)/i.test(QS);
export const flatCards = () => FLAT;

// A CONTROL BUILD IS A BUILD SOMEBODY DELIBERATELY MADE WORSE, AND AN
// ASSERTION MUST NOT FIRE ON ONE.
//
// This gate throws when the aisle volume goes flat, which is the r20 fault.
// builder-store-r20's `?lipflat` reproduces round-19 lip behaviour on purpose
// so a critic can load the before-column of ITS comparison, and that build
// reads f100 = 0.157 — i.e. the gate turned another builder's control into an
// unloadable page. An assertion that cannot tell a regression from a control is
// not measuring the build, it is measuring who reached the flag first.
//
// So: named control flags downgrade the census threshold to a WARNING and leave
// every other assertion armed. What is NOT done here is lowering the constant to
// squeeze past 0.157 — that would disarm the check for real regressions too,
// which is the kind of fix this project retires a round later.
//
// The list is open: any file can push its own flag name onto
// window.__CHOP_CONTROL_FLAGS before the store builds and this will honour it,
// so a future control does not need an edit to this file to stay loadable.
const BUILTIN_CONTROLS = ['noIntrude', 'lipflat', 'flatcard'];
export function activeControls() {
  let extra = [];
  try { extra = window.__CHOP_CONTROL_FLAGS || []; } catch { extra = []; }
  return [...BUILTIN_CONTROLS, ...extra]
    .filter((f) => new RegExp('[?&]' + f + '(&|=|$)', 'i').test(QS));
}

let LAST_SLABS = null;

export function makeIntrusions(ctx) {
  const { boxE, rod, Q, cellUV } = ctx;
  const rng = makeRng(ctx.seed || 0x20A15E);
  // The ledger is a build-time record of what was ASKED for. It is not the
  // evidence — lipCensus() reading instance matrices off the scene is. Its job
  // is to catch a family that was never reached at all, which a census cannot
  // distinguish from a family that was reached and is flush.
  const L = {
    violator: 0, violatorBent: 0,
    wobbler: 0, wobblerBent: 0,
    clipStrip: 0, hooks: 0, hooksEmpty: 0,
    hangTag: 0, taped: 0, cable: 0, stray: 0,
    maxReach: 0,
    // ROUND 26
    anchors: 0,                     // attachments that actually grip a fixture
    resolved: 0, unresolved: 0,     // cards moved out of a solid / left in one
    strayCapped: 0, straySeated: 0, // strays clamped off the talker plane / seated
    strayCapMax: 0, straySeatMax: 0,
  };
  const reach = (r) => { if (r > L.maxReach) L.maxReach = r; return r; };

  // ---- CARD STOCK, AND THE VOLUME IT HAS TO FIT IN -----------------------
  //
  // THICKNESS IS PER FAMILY, because these are five different materials and a
  // single global number would be authoring none of them:
  //
  //   violator      3-4 mm   corrugated or foam POP board on a stem. The
  //                          thickest thing on this list and the one seen
  //                          closest, so it is the one the rim can be seen on.
  //   wobbler       2-3 mm   foam board, same stock, smaller card
  //   header      0.8-1.4 mm folding boxboard, printed one side
  //   swing tag   0.6-1.0 mm tag board with a punched hole
  //   photocopy   0.2-0.4 mm PAPER, and it stays paper. At the 2.1 mm-per-pixel
  //                          the near poses actually resolve, that is a fifth
  //                          of a pixel and it is meant to be — the reason the
  //                          taped sheet reads is the curl, not the edge.
  //
  // AND THE SCALE ARITHMETIC, STATED RATHER THAN HOPED: aniso.js's near poses
  // stand 1.55 m off the face at a 52 degree vertical fov over 720 px, so one
  // pixel is 2.1 mm of card at the closest range this rig can reach. A 3.5 mm
  // violator rim is 1.7 px there and nothing at all by chase range. The rim is
  // a NEAR-POSE cue and a thin one; what the board actually buys at every range
  // is the four things a plane cannot have — a bend, a hook, a collision volume
  // and a squared-up outline.
  const THICK = {
    violator: [0.0030, 0.0040], wobbler: [0.0022, 0.0032], header: [0.0008, 0.0014],
    tag: [0.0006, 0.0010], paper: [0.0002, 0.0004],
  };
  const thickOf = (k, h, i) => (FLAT ? undefined : CD.hjit(h, i, THICK[k][0], THICK[k][1]));
  const CS = CD.makeCardStock({ boxE, Q, flat: () => FLAT });
  // store.js calls intrusionCheck(THREE, scene, INTR.ledger()) with three
  // arguments and that call site is lead-owned, so the boards are handed to the
  // check through the module instead of through a contract change. One store is
  // built per page load; the makeIntrusions call is what defines "this build",
  // so the reference is refreshed there and nowhere else.
  LAST_SLABS = CS.slabs;

  // THE COLLISION INDEX, AND WHY IT CAN ONLY SEE WHAT IT CAN SEE.
  //
  // store.js's per-face build order is: for each deck, INTR.deck() and THEN
  // fillShelf(); after every deck, INTR.face(); after that, the aisle blades
  // and the vendor shelf-talker. So at the moment this file places anything it
  // can see every package pushed so far — read straight out of Batch.t, which
  // is the live transform list of the store being built — and it CANNOT see
  // the facings of the deck it is standing on, or the talker.
  //
  // What is unseeable is handled by CONSTRUCTION instead of by search, and the
  // talker is the one that matters: it is a 0.30 x 0.24 m card at exactly
  // `lip + dir * 0.052`, on some deck, at some z this file is never told. A
  // solid that lies wholly in front of that plane, or wholly behind it, cannot
  // pierce it whatever z it is at — so TALKER_X is a hard clamp, not a test.
  // See stray() and clipStrip(). The residual, and the two-line contract change
  // that would remove the guesswork, are in the round report.
  const TALKER_X = 0.052, TALKER_MARGIN = 0.004;
  const vols = new WeakMap();
  const volFor = (B) => {
    let e = vols.get(B);
    if (!e) vols.set(B, e = { V: new CD.Vol(0.25), mark: [] });
    if (B && B._all) e.V.soakBatches(B._all, e.mark);
    return e.V;
  };
  // Try a card where it was asked for; if it is inside something, walk it out
  // into the aisle in 6 mm steps, which is what a stocker does with a card that
  // fouls the stock. Returns the offset actually used along +dir*x, and counts
  // the ones it could not clear rather than pretending they cleared.
  //
  // `boxesAt(d)` is PURE — it returns the boxes the card would occupy at offset
  // d and emits nothing. The emit happens once, afterwards, at the offset this
  // returns. A resolver that emitted while probing would have drawn the store
  // eight times.
  const RESOLVE_STEP = 0.006, RESOLVE_MAX = 7;
  function resolve(V, boxesAt) {
    if (FLAT || !V) return 0;
    for (let k = 0; k <= RESOLVE_MAX; k++) {
      const d = k * RESOLVE_STEP;
      let hit = false;
      for (const b of boxesAt(d)) { if (V.pen(b, 0.002) > 0) { hit = true; break; } }
      if (!hit) { if (k) L.resolved++; return d; }
    }
    L.unresolved++;
    return 0;
  }
  const keep = (V, boxes) => { if (V && !FLAT) for (const b of boxes) V.add(b); };

  const CARD = (uvCell) => cellUV(uvCell, INTR_COLS, INTR_ROWS);
  // the v-window of a card between fractions a and b of its HEIGHT, measured
  // from the bottom. cellUV's v runs bottom-to-top, so v1 is the top of the
  // drawn cell and a sheet split into a flat half and a curled half takes
  // [1-f,1] for the flat one.
  const bandUV = (uvC, a, b) => {
    const u = CARD(uvC);
    return [u[0], u[1] + (u[3] - u[1]) * a, u[2], u[1] + (u[3] - u[1]) * b];
  };

  // A flat card standing in the aisle. Two forms, and NEITHER of them takes a
  // camera: a card's plane is decided by the fixture it is clipped to, which is
  // the whole difference between this file and the billboard quads the r20
  // critic called. cardC is centre + half-extents; cardR grows a card of width
  // w out of a root point along a direction D.
  //
  // `both` emits the card BACK TO BACK rather than relying on the soup's
  // DoubleSide. DoubleSide draws the reverse face with the same UVs, so its
  // type reads MIRRORED — which is what the first build of this file shipped,
  // and PLEASE DO NOT REMOVE reversed on a shelf edge is a worse tell than the
  // empty aisle it replaced. A violator sticks straight out into the aisle and
  // is genuinely read from both sides, so it gets two quads with opposite
  // winding, 1.5 mm apart, the way the danglers have always been built. A card
  // whose back is against a shelf (the taped sheet, the clip-strip header) does
  // not need it and does not pay for it.
  //
  // ROUND 26 — and the `both` argument survives unchanged, because the reason
  // for it survives unchanged. What is different is that there is now a BOARD
  // between the two prints instead of 1.5 mm of nothing, so the reverse face is
  // the back of a piece of card rather than a second decal at the same place.
  // See card.js. `o` carries the curl and the segment count; with `?flatcard`
  // the call collapses to exactly the two Q.rect calls above it.
  const cardC = (C, R, U, uv, both, o = {}) => CS.card(C, R, U, uv, { ...o, both });
  const cardR = (root, D, w, U, uv, both, o) => cardC(
    [root[0] + D[0] * w / 2, root[1] + D[1] * w / 2, root[2] + D[2] * w / 2],
    [D[0] * w / 2, D[1] * w / 2, D[2] * w / 2], U, uv, both, o);

  // ---- THE ATTACHMENTS ---------------------------------------------------
  // r25's critic, on tile_02 at (430,150)-(540,270): "the NEW $4.27 dangler's
  // hanger wire terminates in empty space, attached to nothing." That is this
  // file's swing tag, and the criticism was exact — measured live before the
  // fix, 184 of 184 hang-tag strings had NO solid within a 12 mm cube of their
  // upper end, and 168 of 184 had none within 24 mm. The string started 6 mm
  // in FRONT of the price rail and 26 mm in front of the shelf board, in air.
  //
  // A shelf hook grips two things: it hangs over the top of the price-rail
  // channel and its inner leg lands on the deck board's front face, which is at
  // `lip + dir*0.010` (store.js: the board is `dep + 0.02` wide centred at
  // `lip - dir*dep/2`). Both legs are real boxes in the lit fixture batch, so
  // the grip is a thing you can see as well as a thing that measures.
  //
  // Returns the point the card hangs FROM, so no caller ever picks that point
  // itself and the string cannot drift off the hook again.
  function railHook(lip, dir, y, z, out) {
    if (FLAT) return [lip + dir * out, y - 0.014, z];
    const inX = lip + dir * 0.013;            // 8..18 mm: overlaps the board face
    boxE(inX, y - 0.009, z, 0, 0, 0, 0.010, 0.024, 0.0045, 0xc3bcab);
    const mid = (0.013 + out) / 2;
    boxE(lip + dir * mid, y + 0.0015, z, 0, 0, 0, Math.abs(out - 0.013), 0.0045, 0.0045, 0xc3bcab);
    boxE(lip + dir * out, y - 0.004, z, 0, 0, 0, 0.0045, 0.013, 0.0045, 0xc3bcab);
    L.anchors++;
    return [lip + dir * out, y - 0.009, z];
  }
  // A clip strip hangs off a tongue that goes over the shelf edge the same way.
  // The old strip's spine simply began 45 mm below a deck with nothing above it.
  function stripHanger(lip, dir, y, z, out) {
    if (FLAT) return;
    boxE(lip + dir * 0.013, y - 0.011, z, 0, 0, 0, 0.012, 0.030, 0.020, 0xd4cdbb);
    const mid = (0.013 + out) / 2;
    boxE(lip + dir * mid, y + 0.002, z, 0, 0, 0, Math.abs(out - 0.013), 0.005, 0.020, 0xd4cdbb);
    L.anchors++;
  }
  // THE HALF-WIDTH VECTOR OF A CARD THAT FACES THE AISLE, yawed by `a`.
  // store.js's qX() is the one owner of this convention — "winding chosen so
  // the texture reads unmirrored from the front", R = [0,0,-dir*d/2] — and this
  // is that vector rotated about +y, rather than a second guess at the sign.
  // The first build guessed and got it backwards on all four families.
  const faceR = (dir, w, a) => [-dir * w * 0.5 * Math.sin(a), 0,
    -dir * w * 0.5 * Math.cos(a)];

  // ---- 1. THE AISLE VIOLATOR --------------------------------------------
  // A rigid card clipped to the price rail and sticking STRAIGHT OUT into the
  // aisle, perpendicular to the shelf face. It is the single biggest silhouette
  // break available on a shelf edge, and it is the one object on the critic's
  // list that is read FACE-ON from a chase pose — a chase pose looks down the
  // aisle, which is exactly the direction a violator faces.
  function violator(lip, dir, y, z, V) {
    const uvC = pick(rng, VIOLATOR_CELLS);
    const h = rr(rng, 0.085, 0.150);
    const w = h * aspectOf(uvC);                       // reach into the aisle
    // Nothing about a hand-clipped violator is square: the stem twists in the
    // clip and the card droops on its own weight. A bent one has been caught by
    // a cart and swung back nearly flat along the face.
    const bent = rng() < 0.14;
    const yaw = (bent ? rr(rng, 0.85, 1.40) : rr(rng, -0.34, 0.34)) * (rng() < 0.5 ? 1 : -1);
    const droop = bent ? rr(rng, 0.30, 0.75) : rr(rng, -0.10, 0.16);
    const cd = Math.cos(droop), sd = Math.sin(droop);
    const D = [dir * Math.cos(yaw) * cd, -sd, Math.sin(yaw) * cd];
    // ROUND 26 — the twist, hash-derived so it costs no rng draw. A violator is
    // die-cut board in a sprung clip and it is never square to anything; this
    // is the sideways lean the clip lets it take, and it is what puts the two
    // bands of the card on two different planes.
    const hk = CD.hash32(lip, y, z, 26);
    const curl = FLAT ? 0 : CD.hjit(hk, 1, -0.16, 0.16) + (bent ? CD.hjit(hk, 2, 0.10, 0.34) : 0);
    const U = [dir * sd * h * 0.5, cd * h * 0.5, 0];
    const at = (d) => [lip + dir * (0.026 + d), y + 0.038, z];
    const geo = (d) => {
      const root = at(d);
      return [[root[0] + D[0] * w / 2, root[1] + D[1] * w / 2, root[2] + D[2] * w / 2],
        [D[0] * w / 2, D[1] * w / 2, D[2] * w / 2], U];
    };
    const CO = { segs: 2, curl, key: 1, thick: thickOf('violator', hk, 8) };
    const push = resolve(V, (d) => { const g = geo(d); return CS.cardBoxes(g[0], g[1], g[2], CO); });
    const g = geo(push);
    keep(V, cardC(g[0], g[1], g[2], CARD(uvC), true, CO));
    const root = at(push);
    // the clip on the rail, and the stem between clip and card. A box's long
    // axis is +x, and a yaw of ey maps +x to (cos ey, 0, -sin ey), so ey is
    // -dir*yaw for the stem to lie along D.
    // The clip spans lip+0.000 to lip+0.028 and the deck board's front face is
    // at lip+0.010, so it has always gripped something — it is the one family
    // on this list that was already attached. ROUND 26 adds the top return that
    // makes the grip visible and counts it, so "attached" is a number and not
    // an assertion in a comment.
    boxE(lip + dir * (0.014 + push / 2), y - 0.002, z, 0, 0, 0, 0.028 + push, 0.030, 0.026, 0xd8d1be);
    if (!FLAT) { boxE(lip + dir * 0.006, y + 0.015, z, 0, 0, 0, 0.020, 0.006, 0.026, 0xcbc4b1); L.anchors++; }
    boxE(root[0] + D[0] * 0.020, root[1] + D[1] * 0.020 - 0.006, root[2] + D[2] * 0.020,
      0, -dir * yaw, 0, 0.044, 0.007, 0.006, 0xcfc7b4);
    L.violator++; if (bent) L.violatorBent++;
    reach(0.026 + push + Math.abs(D[0]) * w);
  }

  // ---- 2. THE WOBBLER ----------------------------------------------------
  // A card on a springy plastic arm. The store already had one of these and it
  // was a 75 mm flat quad on a 55 mm clip: no arm, no thickness, and nothing
  // for a shadow to hang off. This is the arm.
  function wobbler(lip, dir, y, z, V) {
    const bent = rng() < 0.16;
    // two segments: out, then out-and-up. A bent one has been knocked and
    // droops down the face instead, which is what half of them look like.
    const t1 = bent ? rr(rng, 2.05, 2.55) : rr(rng, 1.05, 1.35);
    const t2 = bent ? t1 + rr(rng, 0.15, 0.45) : t1 - rr(rng, 0.30, 0.62);
    const l1 = rr(rng, 0.055, 0.085), l2 = rr(rng, 0.050, 0.080);
    let px = lip + dir * 0.026, py = y + 0.012;
    const seg = (t, len) => {
      const dx = dir * Math.sin(t) * len, dy = Math.cos(t) * len;
      rod(px + dx / 2, py + dy / 2, z, 0, 0, -dir * t, 0.0055, len, 0xdcd6c4);
      px += dx; py += dy;
    };
    seg(t1, l1); seg(t2, l2);
    const uvC = pick(rng, TAG_CELLS);
    const w = rr(rng, 0.075, 0.125), h = w / aspectOf(uvC);
    // the card hangs off the tip, tipped in two axes. It is NOT parallel to the
    // shelf: a wobbler that hung flat to the face would be a billboard again.
    const sw = rr(rng, -0.55, 0.55), tp = rr(rng, -0.35, 0.35);
    const hk = CD.hash32(lip, y, z, 27);
    keep(V, cardC([px + dir * 0.004, py - h * 0.42, z], faceR(dir, w, sw),
      [dir * Math.sin(tp) * h * 0.5, Math.cos(tp) * h * 0.5, 0], CARD(uvC), true,
      { segs: 1, curl: 0, key: 2, thick: thickOf('wobbler', hk, 3) }));
    boxE(lip + dir * 0.014, y + 0.004, z, 0, 0, 0, 0.026, 0.024, 0.030, 0xd0c9b6);
    if (!FLAT) { boxE(lip + dir * 0.005, y + 0.019, z, 0, 0, 0, 0.018, 0.006, 0.030, 0xc4bda9); L.anchors++; }
    L.wobbler++; if (bent) L.wobblerBent++;
    reach(dir * (px - lip) + Math.abs(Math.sin(sw)) * w * 0.5);
  }

  // ---- 3. THE CLIP STRIP -------------------------------------------------
  // A plastic ladder of hooks hung off a shelf lip carrying a column of
  // single-serve pouches. The store already had these and they hung at
  // lip + 36 mm — INSIDE the cavity, behind the lip plane, which is to say not
  // in the aisle at all. This one hangs 55-85 mm proud with its product at
  // 100-145 mm, so it covers the facings behind it in the image.
  //
  // AND MOST OF THEM ARE HALF EMPTY. That is not decoration. The clearest
  // single object in the reference crop is a row of BARE hooks with nothing on
  // them, and a full strip is the rarer state in a real store.
  function clipStrip(o) {
    const { lip, dir, top, z, B, dept, col, deckY, V } = o;
    // ROUND 26 — THE OUT DISTANCE IS NOW A CONSTRUCTION GUARANTEE, not a taste
    // number. The vendor shelf-talker is a 300x240 mm card at exactly
    // lip + dir*0.052, on a deck and at a z this file is never told. A solid
    // that lies WHOLLY IN FRONT of that plane cannot pierce it at any z — so
    // the strip's nearest face is held at TALKER_X + margin + its own half
    // width, and the old 55-85 mm range becomes 62-90 mm. Six millimetres of
    // authoring bought a class of collision that no search could have found,
    // because the thing being collided with does not exist yet.
    const outD = FLAT ? rr(rng, 0.055, 0.085)
      : Math.max(TALKER_X + TALKER_MARGIN + 0.0055, rr(rng, 0.055, 0.085) + 0.007);
    const out = lip + dir * outD;
    const len = rr(rng, 0.30, 0.62);
    const lean = rr(rng, -0.09, 0.09);                 // it hangs off true
    // ...AND THE LEAN PIVOTS AT THE TOP. It used to roll the spine about its own
    // CENTRE, which swings the top of the strip back INTO the shelf by as much
    // as it swings the foot out — up to 28 mm at a 620 mm strip, which is what
    // put half of these through the talker plane in the first place. A strip
    // hanging on a hook can only pivot at the hook, and it can only fall
    // outward, so the sign is dir and the pivot is `top`.
    const ez = FLAT ? lean : dir * Math.abs(lean);
    const cx = FLAT ? out : out + (len / 2) * Math.sin(ez);
    const cy = FLAT ? top - len / 2 : top - (len / 2) * Math.cos(ez);
    // the spine is 11 mm of clear polypropylene, not the 16 mm bar the first
    // build drew — at 1.55 m that bar was the widest thing on the strip and it
    // read as a grey stick with product hidden behind it
    boxE(cx, cy, z, 0, 0, ez, 0.011, len, 0.018, 0xdcd6c6);
    // THE HANGER. The strip used to start 45 mm below a deck with nothing at
    // all above it — a plastic ladder of hooks floating in the cavity mouth.
    // This is the tongue that goes over the shelf edge, and the drop between
    // the tongue and the spine.
    if (!FLAT && deckY !== undefined) {
      stripHanger(lip, dir, deckY, z, outD);
      boxE(out, (deckY + top) / 2, z, 0, 0, 0, 0.009, Math.max(0.004, deckY - top), 0.016, 0xd4cdbb);
    }
    {
      const uvC = pick(rng, HEADER_CELLS);
      const hw = rr(rng, 0.058, 0.078), hh = hw / aspectOf(uvC);
      const hkey = CD.hash32(out, top, z, 29);
      keep(V, cardC([out + dir * 0.010, top + hh * 0.42, z], faceR(dir, hw, 0),
        [0, hh / 2, 0], CARD(uvC), false,
        { segs: 2, curl: FLAT ? 0 : CD.hjit(hkey, 6, -0.20, 0.06), key: 4, thick: thickOf('header', hkey, 10) }));
    }
    const n = ri(rng, 4, 12);
    const fillP = rng() < 0.34 ? rr(rng, 0.12, 0.42) : rr(rng, 0.62, 1.0);
    const hsl = pick(rng, dept.colors);
    const pitch = (len - 0.05) / n;
    for (let k = 0; k < n; k++) {
      const hy = top - 0.045 - k * pitch;
      // the hook: a wire stub out of the strip with a turned-up tip. A square
      // 4 mm section reads identically to a round one at four pixels and it is
      // a CLOSED primitive, which the shared open-ended cylinder is not.
      boxE(out + dir * 0.016, hy, z, 0, 0, 0, 0.030, 0.004, 0.004, 0xb9b2a2);
      boxE(out + dir * 0.029, hy + 0.006, z, 0, 0, 0, 0.004, 0.016, 0.004, 0xb9b2a2);
      L.hooks++;
      if (rng() > fillP) { L.hooksEmpty++; continue; }
      col.setHSL((hsl[0] + k * 11) % 360 / 360, Math.min(1, hsl[1] / 100 * 1.12),
        Math.min(0.9, hsl[2] / 100 * rr(rng, 0.92, 1.16)));
      B.bag.push(out + dir * rr(rng, 0.046, 0.068), hy - 0.034,
        z + rr(rng, -0.008, 0.008),
        rr(rng, -0.07, 0.07), (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + rr(rng, -0.16, 0.16),
        0, rr(rng, 0.062, 0.086), rr(rng, 0.052, 0.070), 0.020, col, (rng() * 8) | 0);
    }
    L.clipStrip++;
    reach(outD + 0.068 + 0.035);
  }

  // ---- 4. THE HANG TAG ---------------------------------------------------
  // A card hanging BY ONE CORNER off the rail on a short loop, swinging. It is
  // the cheapest break of the horizontal line there is, because it hangs BELOW
  // the lip rather than in front of it — and the unbroken lip line is the thing
  // the critic named in all six poses.
  function hangTag(lip, dir, y, z, V) {
    const uvC = pick(rng, TAG_CELLS);
    const h = rr(rng, 0.070, 0.115), w = h * aspectOf(uvC);
    const sw = rr(rng, 0.20, 0.85) * (rng() < 0.5 ? 1 : -1);   // off vertical
    const sl = rr(rng, 0.030, 0.070);
    // ROUND 26 — THE HOOK. This is the object in the critic's tile_02: a swing
    // tag on a wire whose upper end stopped 6 mm in front of the price rail and
    // 16 mm in front of the shelf board, holding on to nothing. 184 of 184 of
    // them did. railHook returns the point the string is tied to, and that
    // point is now the outer end of a hook whose inner leg lands on the board.
    const anchor = railHook(lip, dir, y, z, 0.026);
    const ax = anchor[0], ay = anchor[1];
    rod(ax, ay - sl / 2, z, 0, 0, 0.12 * dir, 0.0026, sl, 0xcdc6b2);
    // hung by one corner: the card's up-vector is rotated well off vertical and
    // its centre is offset from the string, which is what a punched hole in a
    // corner does.
    const cs = Math.cos(sw), sn = Math.sin(sw);
    const hk = CD.hash32(lip, y, z, 28);
    // and it curls: a 100 mm swing tag hanging free by one corner is the most
    // reliably bent piece of card on a shelf edge.
    const curl = FLAT ? 0 : CD.hjit(hk, 4, 0.10, 0.42) * (CD.hjit(hk, 5, 0, 1) < 0.5 ? -1 : 1);
    const at = (d) => [ax + dir * (0.010 + d), ay - sl - cs * h * 0.5,
      z + sn * h * 0.5 - dir * w * 0.42];
    const R = faceR(dir, w, 0), U = [0, cs * h * 0.5, -sn * h * 0.5];
    const CO = { segs: 2, curl, key: 3, thick: thickOf('tag', hk, 9) };
    const push = resolve(V, (d) => CS.cardBoxes(at(d), R, U, CO));
    keep(V, cardC(at(push), R, U, CARD(uvC), true, CO));
    L.hangTag++;
    reach(0.026 + 0.010 + push);
  }

  // ---- 5. THE TAPED PHOTOCOPY --------------------------------------------
  // Taped over the shelf edge so it hangs down across the cavity mouth and
  // CURLS out at the bottom. The curl is the whole reason it is two quads: a
  // flat sheet taped to a vertical face is a decal, and a decal is the thing
  // this round is about.
  function taped(lip, dir, y, z, V) {
    const uvC = pick(rng, TAPED_CELLS);
    // SIZE, AND IT MOVED. The first build ran these at 130-200 mm at a 0.20
    // family weight and put FOUR of them in one near-pose frame — each one a
    // white slab larger than the facings behind it. A photocopy taped to a
    // shelf is a rare object in a real aisle and a small one; the reference
    // crops carry at most one. 85-135 mm at a 0.06 weight is about one per
    // aisle, which is what store_03 actually shows.
    const h = rr(rng, 0.085, 0.135), w = h * aspectOf(uvC);
    const f = rr(rng, 0.55, 0.78);                     // fraction still stuck
    // the foot curl, capped so the sheet cannot reach the talker plane. 55 mm
    // put it at lip+0.062, seven millimetres past a card it cannot see.
    const kRaw = rr(rng, 0.022, 0.055);
    const k = FLAT ? kRaw : Math.min(kRaw, TALKER_X - TALKER_MARGIN - 0.007);
    const yaw = rr(rng, -0.26, 0.26);                  // taped on crooked
    const hkT = CD.hash32(lip, y, z, 30);
    const R = faceR(dir, w, yaw);
    const yTop = y - 0.020;
    const x0 = lip + dir * 0.007;
    // the flat part, hugging the face, top f of the sheet
    keep(V, cardC([x0, yTop - h * f * 0.5, z], R, [0, h * f * 0.5, 0],
      bandUV(uvC, 1 - f, 1), false, { key: 5, thick: thickOf('paper', hkT, 11) }));
    // ...and the foot, which has come away and kicked out into the aisle
    const hc = h * (1 - f);
    keep(V, cardC([x0 + dir * k * 0.5, yTop - h * f - hc * 0.5, z], R,
      [dir * k * 0.5, hc * 0.5, 0], bandUV(uvC, 0, 1 - f), false,
      { segs: 2, curl: FLAT ? 0 : 0.22, key: 6, thick: thickOf('paper', hkT, 12) }));
    // the tape, two little bright squares at the top corners. Pushed back 3 mm
    // so it actually lands ON the shelf board's front face at lip + 0.010
    // rather than hovering 1.5 mm off it, which is the same defect as the
    // hang-tag wire at a scale nobody would have noticed.
    for (const s of [-1, 1]) {
      boxE(lip + dir * (FLAT ? 0.004 : 0.008), yTop + 0.008, z + s * w * 0.36, 0, 0, 0,
        0.005, 0.018, 0.028, 0xeceadd);
    }
    if (!FLAT) L.anchors += 2;
    L.taped++;
    reach(0.007 + k);
  }

  // ---- 6. THE COILED CABLE -----------------------------------------------
  // reference/store_02 has a black cable coiled and hooked over a shelf edge,
  // hanging into the aisle. It is nobody's design and nobody put it there on
  // purpose, which is the only reason a render never has one.
  function cable(lip, dir, y, z) {
    // A CONTIGUOUS COIL, and the first build was not one. It scattered 14
    // independent 20 mm bricks around a circle at a pitch wider than the
    // bricks, which rendered as a spray of disconnected black shards floating
    // in front of the shelf — visible in shots/r20i_near_a1_so.png before this
    // fix, and exactly the "black shard" failure the dangler strings hit in
    // round 4b. A cable is a POLYLINE: place a segment BETWEEN consecutive
    // points and orient it along the chord, never at a point along a tangent.
    const R = rr(rng, 0.035, 0.058);
    const cx = lip + dir * (0.026 + 0.010);
    const cy = y - 0.030 - R;
    const turns = rr(rng, 1.35, 1.9);
    const n = 22;
    // The box's local long axis is +x and three.js composes an XYZ euler as
    // Rx*Ry*Rz, so local +x lands on (cos ez cos ey, sin ez, -cos ez sin ey).
    // Inverting that for a target direction is exact and is why this is two
    // angles rather than a guess:  ez = asin(dy),  ey = atan2(-dz, dx).
    const link = (a, b, dia, hex) => {
      const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
      const len = Math.hypot(vx, vy, vz);
      if (len < 1e-5) return;
      const ez = Math.asin(Math.max(-1, Math.min(1, vy / len)));
      const ey = Math.atan2(-vz, vx);
      boxE((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2,
        0, ey, ez, len + dia * 0.6, dia, dia, hex);
    };
    const pt = (i) => {
      const t = i / n;
      const a = -Math.PI / 2 + t * Math.PI * 2 * turns;
      const rk = R * (0.86 + 0.20 * Math.sin(a * 1.7 + 0.6));
      // the coil hangs in the y-z plane, so it reads as a LOOP from the aisle,
      // and drifts a little in x because a coil of cable is not planar
      return [cx + dir * Math.sin(a * 0.9) * R * 0.22,
        cy + Math.sin(a) * rk, z + Math.cos(a) * rk];
    };
    for (let i = 0; i < n; i++) link(pt(i), pt(i + 1), 0.0072, 0x211e1a);
    // the loose end, hooked over the shelf lip and running back to the coil
    link([lip - dir * 0.010, y + 0.012, z], [lip + dir * 0.026, y + 0.006, z],
      0.0072, 0x211e1a);
    link([lip + dir * 0.026, y + 0.006, z], pt(0), 0.0072, 0x211e1a);
    L.cable++;
    reach(0.026 + R * 0.25);
  }

  // ---- 7. THE STRAY FACING -----------------------------------------------
  // One unit pushed right to the lip and tipped, half off the edge. This is
  // the ONE member of the list that is product rather than paper, and it is
  // deliberately the smallest intervention available: arrangement belongs to
  // products.js and is another builder's file this round. It reuses the same
  // B.bag call the clip strips have always used, so no facing logic is copied.
  function stray(o) {
    const { lip, dir, y, z, B, dept, col } = o;
    const hsl = pick(rng, dept.colors);
    col.setHSL(hsl[0] / 360, Math.min(1, hsl[1] / 100 * 1.05),
      Math.min(0.92, hsl[2] / 100 * rr(rng, 0.95, 1.15)));
    const over = rr(rng, 0.020, 0.048);                // how far past the lip
    const ex = rr(rng, -0.18, 0.18);
    const ey = (dir > 0 ? Math.PI / 2 : -Math.PI / 2) + rr(rng, -0.3, 0.3);
    const ez = rr(rng, -0.35, 0.35);
    const sx = rr(rng, 0.075, 0.110), sy = rr(rng, 0.062, 0.095), sz = 0.045;
    // THIS IS THE OBJECT IN THE CRITIC'S CROP. tile_11 (350,290)-(560,470),
    // reproduced at near_a1 in shots/r26_before_near_a1.png: a green pouch
    // "hovering unsupported and tilted in mid-air, clipping straight through
    // the red SALE banner". Traced to run1.2 instance 9 at
    // (-11.2914, 1.3429, -6.4044) — lip + 41.4 mm, this family's own 45 mm
    // depth, 17.0 mm inside the vendor shelf-talker. Two separate faults:
    //
    // 1. IT REACHED PAST A CARD IT CANNOT SEE. Its half-extent along world x is
    //    not sz/2: the yaw is only NEAR a right angle, so up to 0.30 rad of it
    //    leaks sx and sy into x and the real reach was up to 100 mm against a
    //    talker plane at 52. Charged properly off the composed rotation — the
    //    same row-0 arithmetic facet.js owns for products.js — and clamped so
    //    the NOSE stops at 48 mm. A solid wholly behind that plane cannot pierce
    //    it at any z, which is the only guarantee available for a card this file
    //    is never told the position of.
    // 2. IT WAS NOT SEATED. y + 0.035 with a 95 mm unit rolled 0.35 rad buries
    //    the low corner up to 26 mm in the shelf board. That is round 24's
    //    `seat` fault in a second file, and it is half of why the thing reads as
    //    floating: what you see above the card has no visible support under it
    //    because the support is inside the board.
    //
    // sx is the pre-clamp value and that is SAFE HERE, which is worth saying
    // rather than assuming: store.js's router runs products.js's clampAspect
    // between this call and the batch, and that function can GROW sx — but only
    // when the requested aspect exceeds the band's top, and the pouch band tops
    // out at 3.10 while these scales ask for 0.56-1.27. The only clamp a stray
    // can ever trip is the bottom one, which SHRINKS sx, so the half-extent
    // computed here is exact or conservative and never short.
    const M = CD.basisOf(ex, ey, ez);
    const halfX = Math.abs(M[0][0]) * sx / 2 + Math.abs(M[1][0]) * sy / 2 + Math.abs(M[2][0]) * sz / 2;
    const halfY = Math.abs(M[0][1]) * sx / 2 + Math.abs(M[1][1]) * sy / 2 + Math.abs(M[2][1]) * sz / 2;
    let ov = over, py = y + 0.035;
    if (!FLAT) {
      const cap = TALKER_X - TALKER_MARGIN - halfX;
      if (ov > cap) { L.strayCapped++; L.strayCapMax = Math.max(L.strayCapMax, ov - cap); ov = cap; }
      const seat = y + halfY;
      if (seat > py) { L.straySeated++; L.straySeatMax = Math.max(L.straySeatMax, seat - py); py = seat; }
    }
    B.bag.push(lip + dir * ov, py, z, ex, ey, ez, sx, sy, sz, col, (rng() * 8) | 0);
    L.stray++;
    reach(ov + halfX);
  }

  // ---- placement ---------------------------------------------------------
  // WHAT THE RATE IS AND WHERE IT COMES FROM. The critic counted four objects
  // projecting past the shelf plane in one 600 px crop of store_03. At
  // aniso.js's near pose — 1.55 m off the face, 52 deg vertical fov — 600 px of
  // a 1280 px frame is 1.26 m of shelf and 338 px is 0.71 m of height, so the
  // reference density is about ONE INTRUSION PER 0.25 sq m of shelf face. This
  // file runs at roughly one per 0.5, which is half the reference and four
  // times the render's r20 baseline; the reference number is a single crop of
  // a single promotional aisle and matching it exactly would be reading four
  // objects as a store-wide constant.
  // WEIGHTS, and the two that moved after the first look at a rendered frame.
  // The violator is the family that reads FACE-ON from a chase pose, which is
  // three of the six published poses and the half of the critique with no
  // legible product text in it at all, so it carries the most weight. The
  // taped photocopy went the other way — see the size note in taped().
  const FAMILIES = [
    ['violator', 0.38], ['wobbler', 0.32], ['hangTag', 0.24], ['taped', 0.06],
  ];
  function pickFamily() {
    let r = rng();
    for (const [k, w] of FAMILIES) { r -= w; if (r <= 0) return k; }
    return 'violator';
  }

  // one deck of one face
  function deck(o) {
    if (OFF) return;
    const { lip, dir, y, z0, z1, B, dept, col } = o;
    if (y < 0.40) return;                              // a bottom deck is kicked
    const len = z1 - z0;
    if (len < 0.9) return;
    // Everything the store has pushed into this run's package batches SO FAR —
    // read live off Batch.t, per run, forward only. See volFor.
    const V = FLAT ? null : volFor(B);
    const n = Math.round(len / rr(rng, 1.10, 2.20));
    for (let k = 0; k < n; k++) {
      const z = z0 + 0.35 + ((k + rr(rng, 0.15, 0.85)) / Math.max(1, n)) * (len - 0.7);
      if (z < z0 + 0.25 || z > z1 - 0.25) continue;
      switch (pickFamily()) {
        case 'violator': violator(lip, dir, y, z, V); break;
        case 'wobbler': wobbler(lip, dir, y, z, V); break;
        case 'hangTag': hangTag(lip, dir, y, z, V); break;
        default: taped(lip, dir, y, z, V); break;
      }
    }
    // a unit pushed to the lip, one per 2.5-5 m of deck
    for (let z = z0 + rr(rng, 0.6, 3.0); z < z1 - 0.4; z += rr(rng, 2.5, 5.0)) {
      stray({ lip, dir, y, z, B, dept, col });
    }
  }

  // one whole face: the things that hang off a deck rather than sit on one
  function face(o) {
    if (OFF) return;
    const { lip, dir, DECK, z0, z1, B, dept, col } = o;
    const hi = DECK.filter((d) => d > 0.55);
    if (!hi.length) return;
    const V = FLAT ? null : volFor(B);
    for (let s = 0, n = ri(rng, 4, 8); s < n; s++) {
      const deckY = pick(rng, hi);
      clipStrip({ lip, dir, top: deckY - 0.045, deckY, z: rr(rng, z0 + 0.9, z1 - 0.9), B, dept, col, V });
    }
    if (rng() < 0.38) {
      cable(lip, dir, pick(rng, hi), rr(rng, z0 + 1.0, z1 - 1.0));
    }
  }

  return {
    deck, face,
    ledger: () => ({ ...L, ...CS.stats(), flatCards: FLAT }),
    slabs: () => CS.slabs,
  };
}

// ---------------------------------------------------------------------------
// THE MEASUREMENT, AND IT READS THE SCENE.
//
// AGENTS_BRIEF: "assertions must read the LIVE artefact (actual instance
// matrices, actual buffers), not a log or table written alongside, and must be
// proven against the exact corruption they are meant to catch. Round 18 shipped
// three assertions that were all vacuous."
//
// The corruption this one is built to catch is the r20 fault itself: an aisle
// whose objects are all flush with the shelf plane. So it walks every
// InstancedMesh's instanceMatrix and every quad soup's position buffer, and for
// each gondola face plane it records, per 20 mm of z, how far the FURTHEST
// thing standing within 400 mm of that plane reaches into the aisle. That
// profile is the shelf-edge silhouette.
//
// It is proven, not asserted: set every intrusion offset in this file to zero
// and f100 collapses to the pre-round baseline, which is below THRESH. The
// numbers for both states are in the round report.
//
// It also has the one property AGENTS_BRIEF demands of a region statistic — it
// is not a pixel row scanned across a receding perspective. Both retired lip
// statistics ("along-lip variability", "shelf-lip continuity") scanned image
// rows while real shelf lips recede, which is why they smeared. This is metres,
// in world space, off the geometry, and the same number for any camera.
const AISLE_GAP = 4.0, PITCH = 5.3, NA = 8;
const aisleX = (i) => (i - (NA - 1) / 2) * PITCH;
export function aisleFaces(list) {
  const out = [];
  for (const i of (list || [0, 1, 2, 3, 4, 5, 6, 7])) {
    out.push({ tag: 'a' + i + 'L', F: aisleX(i) - AISLE_GAP / 2, dir: +1 });
    out.push({ tag: 'a' + i + 'R', F: aisleX(i) + AISLE_GAP / 2, dir: -1 });
  }
  return out;
}

export function lipCensus(THREE, scene, opts = {}) {
  const band = opts.band || [0.35, 2.05];
  const zR = opts.z || [-11, 11];
  const dz = opts.dz || 0.02;
  // MAXP: past this it is not an intrusion, it is the far side of the aisle.
  // Without it the census saturates at 12-40 m, which is what the first run of
  // this probe actually returned.
  const MAXP = opts.maxp || 0.40;
  const F = opts.faces || aisleFaces([1, 2, 4, 5, 7]);
  const nz = Math.round((zR[1] - zR[0]) / dz);
  const prof = F.map(() => new Float32Array(nz));
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const skip = /^(cop|shopper|cart|child|thief|helper)/i;

  const hit = (fi, p, z) => {
    if (p <= 0 || p > MAXP) return;
    if (z < zR[0] || z >= zR[1]) return;
    const k = ((z - zR[0]) / dz) | 0;
    if (p > prof[fi][k]) prof[fi][k] = p;
  };

  const visit = (o) => {
    if (!o.visible) return;
    if (skip.test(o.name || '')) return;
    if (o.isInstancedMesh) {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox, cor = [];
      for (const sx of [bb.min.x, bb.max.x]) {
        for (const sy of [bb.min.y, bb.max.y]) {
          for (const sz of [bb.min.z, bb.max.z]) cor.push([sx, sy, sz]);
        }
      }
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m);
        let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
        const wx = [];
        for (const c of cor) {
          v.set(c[0], c[1], c[2]).applyMatrix4(m).applyMatrix4(o.matrixWorld);
          wx.push(v.x);
          if (v.y < y0) y0 = v.y; if (v.y > y1) y1 = v.y;
          if (v.z < z0) z0 = v.z; if (v.z > z1) z1 = v.z;
        }
        if (y1 < band[0] || y0 > band[1]) continue;
        for (let fi = 0; fi < F.length; fi++) {
          const f = F[fi];
          let bx = -1e9;
          for (const x of wx) { const p = f.dir * (x - f.F); if (p > bx) bx = p; }
          if (bx <= 0 || bx > MAXP) continue;
          for (let z = Math.max(zR[0], z0); z < Math.min(zR[1], z1) + dz; z += dz) hit(fi, bx, z);
        }
      }
    } else if (o.isMesh && o.geometry && o.geometry.attributes
               && o.geometry.attributes.position) {
      const pa = o.geometry.attributes.position;
      o.updateWorldMatrix(true, false);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld);
        if (v.y < band[0] || v.y > band[1]) continue;
        for (let fi = 0; fi < F.length; fi++) {
          hit(fi, F[fi].dir * (v.x - F[fi].F), v.z);
        }
      }
    }
    for (const c of o.children) visit(c);
  };
  for (const r of scene.children) visit(r);

  const faces = F.map((f, i) => {
    const a = Array.from(prof[i]);
    const frac = (t) => a.filter((x) => x > t).length / a.length;
    const s = a.slice().sort((p, q) => p - q);
    return {
      face: f.tag,
      mean: +(a.reduce((p, q) => p + q, 0) / a.length).toFixed(4),
      p90: +s[Math.round(0.9 * (s.length - 1))].toFixed(4),
      f60: +frac(0.060).toFixed(3), f100: +frac(0.100).toFixed(3),
      f150: +frac(0.150).toFixed(3),
    };
  }).filter((r) => r.mean > 0);            // a plane with no run behind it
  const mean = (k) => +(faces.reduce((p, q) => p + q[k], 0) / Math.max(1, faces.length)).toFixed(3);
  return { faces, f60: mean('f60'), f100: mean('f100'), f150: mean('f150'), bins: nz };
}

// The floor is set BELOW what this round measures and ABOVE what the r20
// baseline measured, so it fires on a regression to flush and does not fire on
// ordinary drift. Both numbers are in the round report.
export const LIP_F100_MIN = 0.16;
export function intrusionCheck(THREE, scene, ledger, slabs) {
  slabs = slabs || LAST_SLABS;
  const c = lipCensus(THREE, scene);
  const bad = [];
  const warn = [];
  const ctl = activeControls();
  // ROUND 26 — THE BOARD BEHIND EVERY CARD, CHECKED AGAINST THE BUILT MESH.
  //
  // The corruption: card.js converts a card's (width, height, normal) frame
  // into the three euler angles Batch.push wants, and getting that wrong puts a
  // board at a plausible WRONG angle behind every card in the store while
  // nothing throws and every count stays right. cardCheck does not re-run that
  // conversion — it finds each recorded board's instance in the live `fixtures`
  // InstancedMesh by position and compares THAT matrix's axes with the frame
  // the print was drawn on. cardSelfTest fires the same comparison on the ZYX
  // reading of the same matrix, which is the mistake that would actually have
  // been made and which agrees with XYZ on every axis-aligned card in the
  // building — so a low `bad` there means the test is not discriminating, and
  // it is reported next to the result rather than assumed.
  let card = null;
  if (!OFF && !FLAT && slabs && slabs.length) {
    card = CD.cardCheck(THREE, scene, slabs);
    card.self = CD.cardSelfTest(slabs);
    card.euler = CD.eulerSelfTest(1024);
    if (card.bad) {
      bad.push('card board misaligned with its print on ' + card.bad + ' of ' + card.matched
        + ' worst ' + card.worst.toExponential(2) + ' at ' + JSON.stringify(card.worstAt)
        + ' e.g. ' + JSON.stringify(card.badAt && card.badAt[0]));
    }
    if (card.missing) bad.push('card board never reached the fixtures mesh: ' + card.missing + ' of ' + card.recorded);
    if (!card.euler.ok) bad.push('basis->euler self-test failed: ' + JSON.stringify(card.euler));
    if (card.self.bad < card.recorded * 0.2) {
      bad.push('cardCheck is not discriminating: the wrong euler convention would have '
        + 'been caught on only ' + card.self.bad + ' of ' + card.recorded);
    }
  }
  // ?noIntrude is this round's own ablation control: the families are legitimately
  // absent, so every family assertion below would fire and the control would be a
  // crash rather than a control.
  if (OFF) return { census: c, bad, warn, controls: ctl, suppressed: true };
  if (c.f100 < LIP_F100_MIN) {
    (ctl.length ? warn : bad).push('aisle volume empty: f100 ' + c.f100
      + ' < ' + LIP_F100_MIN + (ctl.length ? ' (control build: ' + ctl.join(',') + ')' : ''));
  }
  if (ledger) {
    for (const k of ['violator', 'wobbler', 'clipStrip', 'hangTag', 'taped', 'cable', 'stray']) {
      if (!ledger[k]) bad.push('family never placed: ' + k);
    }
    // the broken states are half the brief; an authored state nothing reaches
    // is r17's baked-but-never-placed wearing different clothes
    for (const k of ['violatorBent', 'wobblerBent', 'hooksEmpty']) {
      if (!ledger[k]) bad.push('broken state never reached: ' + k);
    }
  }
  const missing = [];
  for (let i = 0; i < INTR_COLS * INTR_ROWS; i++) if (!DREW.has(i)) missing.push(i);
  if (missing.length) bad.push('atlas cells never drawn: ' + missing.join(','));
  // ...and the attachments. Round 26's second half: 184 of 184 hang-tag strings
  // used to end in air. Every one now starts at the outer end of a railHook, so
  // the ledger's `anchors` must at least cover the families that grow one.
  if (!OFF && !FLAT && ledger) {
    const want = ledger.violator + ledger.wobbler + ledger.hangTag + ledger.clipStrip + ledger.taped * 2;
    if (ledger.anchors < want) {
      bad.push('attachments missing: ' + ledger.anchors + ' anchors for ' + want + ' mounted objects');
    }
  }
  if (warn.length && typeof console !== 'undefined') {
    console.warn('[intrusions] ' + warn.join(' | '));
  }
  return { census: c, bad, warn, controls: ctl, card };
}

// ---------------------------------------------------------------------------
// CONTRACT REQUEST r26 -> store.js OWNER. THE RESERVATION HANDSHAKE.
//
// Round 21's request named six constants and there were seven, and the seventh
// was the exact defect the request existed to close; round 25's enumerated all
// 26 and marked requested-versus-named. This is the same standard: everything
// in src/store.js that puts a SOLID or a PRINTED SURFACE into the aisle volume
// this file also occupies, marked REQUESTED or NAMED-NOT-REQUESTED, with line
// numbers as of this round.
//
// THE PROBLEM, IN ONE SENTENCE: store.js builds a gondola face in the order
// railRun -> INTR.deck -> fillShelf (per deck), then INTR.face, then the blades,
// then the vendor shelf-talker. So at the moment intrusions.js chooses where to
// stand something, the talker and that deck's own facings DO NOT EXIST YET, and
// the coupon flags exist only inside a soup and a batch this file is not handed.
// Everything this round could fix by search, it fixed by search; everything it
// could not, it fixed by CLAMP — a solid held wholly on one side of the talker's
// plane cannot pierce it at any z — and the residual is 1 talker of 76 and 45
// coupon flags of 914, both of them store-side.
//
// REQUESTED — one argument, and it is the whole request:
//
//   1  2652-2660  The vendor shelf-talker loop. Split it: compute nP, d0, pz
//                 and py ABOVE the deck loop into an array of
//                     { x: lip + f.dir * 0.052, y: py, z: pz, w: 0.30, h: 0.24 }
//                 and pass that array as `reserve` in the object handed to
//                 INTR.deck (2538) and INTR.face (2594). Emission stays exactly
//                 where it is; only the position arithmetic moves earlier. This
//                 file already holds the machinery — CD.Vol takes an OBB and
//                 resolve() already walks a card out of one — so the change on
//                 this side is `for (const r of o.reserve || []) V.add(...)`.
//                 Cost: the rng draws at 2654-2655 move earlier in the stream,
//                 which re-rolls the planogram once. It is a one-round cost and
//                 it should be taken on a round that is not measuring anything
//                 else, for the same reason r24 and r25 both declined the kit.js
//                 euler fix.
//
//   2  2093-2105  couponFlag(). Same shape, smaller: 914 quads at
//                 lip + dir*(0.030 + w/2) with w 0.070-0.105, i.e. reaching
//                 lip+0.030 to lip+0.135, straight through the band this file's
//                 clip strips and strays occupy. They are emitted from railRun
//                 (2166-2181), which runs BEFORE INTR.deck for the same deck, so
//                 unlike the talker these could be handed over with no change to
//                 the rng order at all — collect the same rects couponFlag
//                 already computes and pass them in `reserve`.
//
// NAMED, NOT REQUESTED — reached, or measured inert, or not worth a re-roll:
//
//   3  2660  qX(Qpos, lip + f.dir * 0.052, ...)  the 52 mm the clamp is built
//            against. TALKER_X above is a copy of this number and it is the one
//            piece of duplication this round could not avoid; if it moves, the
//            clamp is wrong and nothing throws. It is the first thing a
//            reservation argument would delete.
//   4  2662  fix(lip + f.dir*0.030, py-0.125, pz, 0.030, 0.026, 0.30)  the
//            talker's own wire clip. Already a solid, already gripping.
//   5  2664  fix(lip + f.dir*0.040, py-0.02, pz +- 0.142, 0.020, 0.20, 0.010)
//            the two clip arms. Also already solid.
//   6  2620  fix(lip + f.dir*0.04, by, bz, 0.028, 0.58, 2.30)  the aisle blade's
//            BOARD — a 28 mm solid — with its printed quad at lip + 0.066, i.e.
//            12 mm in front of the board it is supposed to be printed on. Not
//            requested: 0 of 70 blade quads are pierced by anything, and the
//            offset reads as a card in a frame rather than as a fault. Recorded
//            because a reader looking for the store's one already-thick sign
//            will find it here.
//   7  2481  the shelf board, dep+0.02 wide centred at lip - f.dir*dep/2, so its
//            FRONT FACE is at lip + f.dir*0.010. Every hook this round adds
//            lands on that plane. If the board narrows, the hooks let go.
//   8  2491  railRun(lip, DECK[d] - 0.020, ...) and the 0.050 m tag height, so
//            the rail face spans DECK-0.046 to DECK+0.004 at lip + 0.020. The
//            hang-tag hook is sized to clear it.
//   9  4686  soup(Qintr, SM(T.intrude, {...}))  MeshBasicMaterial. The PRINT on
//            a card is unlit by authoring and stays that way; only the board is
//            lit. Not requested — the r7 acuity argument for that material still
//            holds and a lit print would undo it.
//  10  589   M.fix = MeshLambertMaterial({ color: 0xffffff }), the batch every
//            board goes into. Round 25's derived finish gives it a lobe, which
//            is why a card rim shades at all. Unchanged.
//
// AND ONE HARNESS DEFECT, WHICH IS NOT store.js's: tools/r24_blindset.py's
// main() seeds with random.Random(seed) while tools/r22_blindset.py's main()
// seeds with Random('%s|%s' % (seed, arm)). LEAK 7's fix went into the function
// the r24/r25/r26 wrappers do not call, so it was still live: this round's first
// pair came back 9 of 18 tiles byte-identical and they were exactly the 9
// photographs. Closed locally in tools/r26_blindset.py rather than by editing a
// shared module mid-round; the one-line fix belongs in r24_blindset.main.
