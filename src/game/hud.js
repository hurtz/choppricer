// OWNER: builder-game. The HUD is a 1280x720 2D canvas laid over the WebGL canvas
// with identical `object-fit: contain` scaling, so it lines up pixel-for-pixel with
// the 3D view at any window size and composites cleanly into screenshots.
//
// Look: 1990s in-store DVR. Blocky monospace, amber + phosphor green, hard-edged
// boxes with filled title tabs, scanlines, burn-in ghosts, a clock that is wrong.

export const W = 1280, H = 720;

// Projection is owned by src/camera.js and read off the LIVE camera. This file used
// to carry a hand-copied duplicate of the rig, correct only while the camera never
// moved; see CLAUDE.md on derivation duplication.
// NB: `export {x} from` re-exports WITHOUT creating a local binding, and this file
// calls projectFromCop itself — so import it, then re-export the binding.
import { projectFromCop } from '../camera.js';
export { projectFromCop };
// ...AND THE LENS THE GRADE PUTS IN FRONT OF IT (round 8, cctv's contract).
// projectFromCop is a PINHOLE projection and it is correct for the raw render.
// It is not correct for what the player is looking at: cctv.js's floor grade
// ends in a barrel/fisheye that MOVES PIXELS — zero at the centre, ~31 px at
// about 0.6 of the corner radius, back to zero at the corners — so a marker
// drawn at the pinhole pixel sits beside the man rather than on him, and does
// so worst exactly where a mid-glance subject is. Same class of bug as the
// hand-copied camera rig this file used to carry, and it survived four rounds
// for the same reason: it is only ever a few pixels wrong in the middle of the
// frame, which is where you look when you are checking.
//
// One definition of the map, owned by the file that owns the shader. Never
// re-derive it here; if the barrel changes, warp.js changes with it in the same
// commit and this file is correct for free.
import { warpFloor, floorMagAt } from '../cctv/warp.js';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, "DejaVu Sans Mono", monospace';

// ROUND 15. The pursuit panel's rectangle, hoisted out of drawFloor because a
// SECOND element has to know where it is. The subject bracket's readout is
// clamped to `cl.y + 22` with cl.y >= 96, so on a subject near the top of frame
// it lands at y 118-140 — inside this panel, which is drawn after it and paints
// 88% over it. The ink ledger caught `LAST SEEN 3.4s ±5m` bleeding through
// behind `OUT IN ~11.8s` at 100 px overlap; shots/game_r15_overprint_panel.png.
// Unlike the FOOTSTEPS banner nothing is misread — the panel wins cleanly — but
// a red smear under amber type reads as a rendering fault, which is the exact
// complaint the burnIn() note above records a critic filing about a ghost in a
// panel. One rect, declared once, and the bracket steps around it.
const PURSUIT_RECT = { x: 300, y: 62, w: 680, h: 78 };
// Height of the floor screen's top band (topBand(G, 52, 'ON FOOT — UNIT 1')).
// A second element has to know where its bottom edge is; see the bracket label.
const FLOOR_BAND = 52;

export const AMB = '#ffb43a';
export const AMB_D = '#7a5312';
export const GRN = '#7dfda0';
export const GRN_D = '#1d5c31';
export const RED = '#ff4a3a';
export const RED_D = '#5e1610';
export const DIM = '#83a58c';
export const INK = 'rgba(4,8,5,0.88)';
export const LINE = '#3c6244';

// The wall grid I assume when cctv.js does not publish `tiles`. Top band 0..74 and
// bottom band 624..720 are reserved for HUD chrome.
export function fallbackTiles(n = 8) {
  const cols = 4, rows = Math.ceil(n / cols), gap = 8;
  const x0 = 10, y0 = 74, x1 = 1270, y1 = 624;
  const tw = (x1 - x0 - gap * (cols - 1)) / cols;
  const th = (y1 - y0 - gap * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + (i % cols) * (tw + gap), y: y0 + Math.floor(i / cols) * (th + gap), w: tw, h: th,
  }));
}

// ---------------------------------------------------------------- THE CENSUS
// ROUND 9 — HOW MUCH OF THE TIME IS EACH THING ON SCREEN.
//
// The client's note is "there is way too much going on on the screen", and the
// only number that answers it is the fraction of a shift each element is drawn.
// Round 7 measured exactly one element that way (the alarm bar, lit 52% of an
// idle shift) and that one number decided this round, so the instrument is now
// permanent and covers everything.
//
// It counts DRAWS, not predicates. Every mark() below sits at the point the
// element actually paints, so a census cannot drift away from the screen the
// way a re-derived "would this be visible" test would — which is the same class
// of mistake as the hand-copied camera rig this file used to carry.
let census = null;
function mark(k, n = 1) { if (census) census[k] = (census[k] || 0) + n; }

export function createHUD(hudEl) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  Object.assign(cv.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    objectFit: 'contain', pointerEvents: 'auto', cursor: 'crosshair',
  });
  hudEl.appendChild(cv);
  const ctx = cv.getContext('2d');
  let regions = [];
  const hud = { canvas: cv, ctx, regions: () => regions };

  // ---------------------------------------------------------------- primitives
  function tx(s, x, y, o = {}) {
    ctx.font = `${o.w || ''} ${o.s || 12}px ${MONO}`.trim();
    ctx.fillStyle = o.c || DIM;
    ctx.textAlign = o.a || 'left';
    ctx.textBaseline = 'alphabetic';
    try { ctx.letterSpacing = (o.ls == null ? 0.7 : o.ls) + 'px'; } catch { /* older engine */ }
    if (o.max) s = clip(s, o.max, o.s || 12, o.w);
    ctx.fillText(s, x, y);
    try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
    if (inked) inkOne(s, x, y, o);
    return s;
  }
  // Width of a string as tx() will actually draw it. ctx.measureText does NOT
  // account for ctx.letterSpacing, which is how the round-9 alarm chip first
  // shipped with its countdown printed on top of the word VESTIBULE.
  function advance(str, size = 12, wt = '', ls = 0.7) {
    ctx.font = `${wt || ''} ${size}px ${MONO}`.trim();
    return ctx.measureText(str).width + str.length * ls;
  }
  // The same width, taken off a tx() options bag, so a call site never has to
  // restate `s`/`w`/`ls` in a second place and get one of them wrong. THIS IS
  // THE FUNCTION EVERY PLATE AND EVERY BOX AROUND TEXT MUST USE.
  const advOf = (str, o) => advance(str, o.s || 12, o.w || '', o.ls == null ? 0.7 : o.ls);

  // ===========================================================================
  // ROUND 15 — THE INK LEDGER. A HELPER NOBODY CALLS IS NOT A GUARD.
  // ===========================================================================
  // `advance()` above was written in round 9 to stop the alarm chip printing its
  // countdown on top of the word VESTIBULE, and its comment says so. Round 14
  // then added the FOOTSTEPS banner 1,360 lines below it, laid the two lines out
  // with a hand-picked `W/2 - 34` against a hardcoded 420 px box, and shipped a
  // deterministic 28.6 px overprint whose casualty was the word NOT — so the one
  // new player-facing channel of that round rendered THE OPPOSITE OF ITS
  // MEANING on 3.7% of floor frames.
  //
  // That is the second time on this project a correct warning failed to travel
  // inside a single file (the first was shaders.js's no-backticks note, 130
  // lines from where four agents then put backticks). AGENTS_BRIEF's conclusion
  // from the first one is the right one here too: DO NOT WRITE A THIRD COPY OF
  // THE WARNING, SHIP A CHECK THAT RUNS.
  //
  // So every string this file draws is recorded with the box it ACTUALLY
  // occupies — advance(), letter-spacing and all — and `overprints()` reports
  // any two that collide. It rides on hud.sample(), the census frame ./eval.js
  // already renders at 10 Hz through every shift, so it costs one extra
  // measureText per string on frames that were being drawn anyway and it covers
  // every screen the bot reaches without anybody remembering to run it.
  //
  // Two things it is deliberately NOT: it is not a static grep (grep cannot see
  // `W/2 - 34`), and it is not an assertion that fires on the player's frames
  // (a HUD that throws mid-chase is worse than a HUD that overprints).
  //
  // ---- AND THE INSTRUMENT'S OWN FALSE POSITIVE, FOUND ON ITS FIRST FRAME ---
  // Its very first run reported a 205 px collision between the wind gauge's
  // `[SHIFT] SPRINT   [WASD] MOVE` hint and `CH 04  LIQUOR`. That one is NOT a
  // bug: the second string is the CRT burn-in ghost, drawn at globalAlpha 0.055
  // and designed to sit under everything on the screen. A geometry-only overlap
  // test cannot tell a defect from a deliberate ghost.
  //
  // So alpha is recorded and a collision is only a DEFECT when both strings are
  // drawn legibly. The under-alpha pairs are still returned, as `ghosted`, and
  // never silently dropped — AGENTS_BRIEF's rule is that a checker that cries
  // wolf gets ignored, and the matching failure is a checker that quietly
  // learns to stay silent. 0.2 is well under anything the player is meant to
  // read and well over the 0.055 ghost.
  //
  // ---- AND ITS SECOND FALSE POSITIVE: THE CANVAS TRANSFORM ----------------
  // stamp() does `translate(x,y); rotate(-7deg)` and then draws at (0,0), so a
  // naive record files `+114 PTS` at y = 0 with a negative x0 — and it duly
  // collided with the write-up screen's top band, 40.8 px, twice in seven seeds,
  // for a stamp that is actually 300 px further down the screen. The coordinates
  // tx() is handed are in USER space; what collides is DEVICE space. So the box
  // is pushed through ctx.getTransform() and reduced to its axis-aligned bound,
  // which is conservative for a rotated stamp (it over-reports, never under).
  const INK_LEGIBLE = 0.2;
  let inked = null;
  // ROUND 16. The user->device reduction, ONCE. Both the glyph ledger and the
  // plate ledger below need it and it was inline in inkOne(); a second
  // hand-copy of a transform is the hazard CLAUDE.md opens with.
  //
  // ---- ROUND 17: "CONSERVATIVE" WAS DOING REAL DAMAGE --------------------
  // Round 16 reduced a rotated rectangle to its axis-aligned bound and called
  // that conservative, which it is — and conservative here means WRONG BY
  // 32 PIXELS IN THE ONE DIRECTION THAT MATTERS. stamp() is -7 degrees over a
  // ~520 px plate: half the width times sin 7 is 32 px, so the reported top
  // edge climbs 32 px out of the plate and into the row above it, which on the
  // write-up screen is the top band's row. Every erasure the shipped ledger
  // reported against a stamp is that artefact and not a defect — six of them on
  // the build round 16 shipped, i.e. ALL of the residual it published.
  //
  // A bound that over-reports is not free. It is a checker crying wolf, and
  // AGENTS_BRIEF's standing rule is that one of those gets switched off. So the
  // quad is KEPT, and coveredFrac() below tests against the real rotated
  // polygon; the AABB survives as the cheap candidate filter it always was.
  // `quad` is null for the identity and for pure translation/scale, so the
  // exact axis-aligned path stays exact and costs nothing.
  function devBox(x0, y0, x1, y1) {
    try {
      const m = ctx.getTransform();
      if (m && (m.a !== 1 || m.b !== 0 || m.c !== 0 || m.d !== 1 || m.e !== 0 || m.f !== 0)) {
        // Wound TL -> TR -> BR -> BL. Round 16's order was TL,TR,BL,BR, which is
        // fine for a min/max and is a bowtie if you ever treat it as a polygon.
        const q = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
          .map(([px, py]) => [m.a * px + m.c * py + m.e, m.b * px + m.d * py + m.f]);
        const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
        const rot = Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9;
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys),
          rot ? q : null];
      }
    } catch { /* engine without getTransform: identity is the common case */ }
    return [x0, y0, x1, y1, null];
  }
  // Point in a convex quad, by sign consistency of the four edge cross products.
  function inQuad(q, x, y) {
    let pos = 0, neg = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) & 3];
      const cr = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (cr > 1e-9) pos++; else if (cr < -1e-9) neg++;
    }
    return pos === 0 || neg === 0;
  }
  const inRect = (r, x, y) => (r.quad ? inQuad(r.quad, x, y)
    : (x > r.x0 && x < r.x1 && y > r.top && y < r.bot));
  function inkOne(s, x, y, o) {
    if (!s) return;
    const w = advOf(s, o);
    const a = o.a || 'left';
    const x0 = a === 'center' ? x - w / 2 : a === 'right' ? x - w : x;
    const sz = o.s || 12;
    // ROUND 16: the ledger recorded a BASELINE and a font size, which is what
    // you need to pair two strings on one row and NOT what you need to ask
    // whether a plate covered the letters. Real ascent/descent, from the same
    // measureText the advance comes off, so `top`/`bot` are the rows the glyphs
    // actually occupy. The fallback is the old 0.8/0.2 guess, and it is only
    // reached on an engine without the metrics.
    let asc = sz * 0.8, dsc = sz * 0.2;
    try {
      const mm = ctx.measureText(s);
      if (mm && isFinite(mm.actualBoundingBoxAscent)) {
        asc = mm.actualBoundingBoxAscent; dsc = Math.max(0, mm.actualBoundingBoxDescent);
      }
    } catch { /* keep the guess */ }
    const b = devBox(x0, y - asc, x0 + w, y + dsc);
    const by = devBox(x0 + w / 2, y, x0 + w / 2, y)[1];
    inked.push({ s, y: by, size: sz, alpha: ctx.globalAlpha, x0: b[0], x1: b[2],
      top: b[1], bot: b[3], quad: b[4], seq: seq++ });
  }
  // Two strings collide when their drawn boxes overlap horizontally AND their
  // baselines are close enough to share a line. The vertical test is 0.6x the
  // larger type size — tight enough that stacked rows at 17-26 px pitch do not
  // pair up, loose enough that the FOOTSTEPS case (13 px and 11 px on the SAME
  // baseline) is caught. Sub-pixel touches are ignored: a 0.5 px threshold, so
  // a right-aligned string ending exactly where the next begins is not a hit.
  // ---- ROUND 17: THE BASELINE RULE HAS A HOLE, AND IT IS TYPE-SIZE SHAPED --
  // `0.6 x the larger size` was calibrated on 11-13 px type sharing a row. This
  // screen now runs 21-46 px headline numerals over 11-12 px labels, and a 46 px
  // string has ~34 px of ascent: its glyphs reach a row and a half ABOVE its own
  // baseline, so it can be printed straight through a small string while the
  // baseline test says the two are nowhere near each other. That is an opaque
  // `fillText` over a word — the mechanism round 16 listed as still live and
  // unmeasured — and it is invisible to both ledgers: the plate ledger hooks
  // fills, not text.
  //
  // It is NOT folded into `overprints`. Two strings whose BOXES intersect are
  // not necessarily two strings you cannot read — glyphs are mostly gaps, and an
  // ascender box clearing the line below it is the normal case in type. So it is
  // its own channel, `crossRow`, with its own count, and it earns promotion by
  // being looked at rather than by being asserted. Same discipline as `ghosted`
  // and `near`: reported separately, never dropped, never silently escalated.
  const CROSS_MIN = 2;      // px of intersection in EACH axis before it counts
  function overprints(list) {
    const out = []; const ghosted = []; const crossRow = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
        if (Math.abs(a.y - b.y) >= Math.max(a.size, b.size) * 0.6) {
          if (ov < CROSS_MIN) continue;
          if (Math.min(a.alpha, b.alpha) < INK_LEGIBLE) continue;
          const vov = Math.min(a.bot, b.bot) - Math.max(a.top, b.top);
          if (vov < CROSS_MIN) continue;
          crossRow.push({ a: a.s, b: b.s, overlapPx: +ov.toFixed(1),
            vPx: +vov.toFixed(1), size: [a.size, b.size],
            y: [+a.y.toFixed(1), +b.y.toFixed(1)] });
          continue;
        }
        if (ov <= 0.5) continue;
        const hit = { a: a.s, b: b.s, overlapPx: +ov.toFixed(1), y: a.y,
          alpha: [+a.alpha.toFixed(3), +b.alpha.toFixed(3)] };
        (Math.min(a.alpha, b.alpha) < INK_LEGIBLE ? ghosted : out).push(hit);
      }
    }
    out.ghosted = ghosted;
    out.crossRow = crossRow;
    return out;
  }

  // ===========================================================================
  // ROUND 16 — THE PLATE LEDGER. TYPESET IS NOT PAINTED.
  // ===========================================================================
  // Round 15's ledger above has one slogan, MEASURE WHAT IS ACTUALLY INKED, and
  // it measures what is actually TYPESET. Every entry in it is a string; every
  // collision it can report is string-versus-string. The thing that removes
  // words from this HUD is not a second string, it is `ctx.fillRect`:
  //
  //     the door tag        fillRect(cx - bw/2, cy - 9, bw, 20)   opaque 0.94
  //     the subject label   fillRect(cl.x - lw/2, ly, lw, 18)     opaque 0.85
  //     the readout         fillRect(dcx - dw/2, dy2, dw, 18)     opaque 0.94
  //     the top band        fillRect(0, 0, 1280, FLOOR_BAND)      opaque 0.93
  //
  // A 20 px plate anchored at `cy - 9` reaches 15 px ABOVE the baseline the old
  // ledger recorded at `cy + 6`, so a plate can sit squarely on the row above
  // and the string ledger sees two elements that never touch. The residual
  // round 15 published as "one class, a close subject putting its label
  // off-canvas" is three on-canvas classes, and the loudest of them takes the
  // top half of `AISLE 3` — the one string the game exists to deliver.
  //
  // So: every fill this context performs is recorded with the box it covers and
  // a DRAW ORDER, and a string is erased when a legible plate lands on its
  // glyphs LATER in the frame. Order is the whole content of the claim — the
  // same two rectangles in the other order are a backing plate, which is what
  // every one of these elements is for.
  //
  // ---- THE TRAP THE FIRST DRAFT OF THIS WALKED INTO -----------------------
  // OPACITY DOES NOT LIVE IN `globalAlpha`. It lives in the rgba() fill string:
  // `topBand` sets globalAlpha 1 and fills 'rgba(2,4,3,0.93)'; `scan()` sets
  // globalAlpha 1 and fills 'rgba(0,0,0,0.3)'. A `globalAlpha >= 0.8` filter
  // therefore counts every scanline stripe as an eraser and files the four real
  // ones as innocent. The effective alpha is the PRODUCT, and the fill-string
  // half of it has to be parsed back out of the serialised colour.
  //
  // ---- AND WHAT BINDS IT TO THIS CANVAS -----------------------------------
  // This patches `ctx`, the context created in this closure, and nothing else.
  // A probe that hooks CanvasRenderingContext2D.prototype instead sees the CCTV
  // wall, the offscreen composite in hud.shot() and any canvas another agent
  // owns, interleaved into one array whose length can coincidentally match the
  // string ledger's while every index is a different element. The binding is
  // structural here: there is one ctx in this file and the ledger cannot reach
  // a second one.
  //
  // ---- WHAT IT DELIBERATELY DOES NOT COVER --------------------------------
  // Strokes. `box()` is lineWidth 1 and stamp()'s frame is 4; a stroke can nick
  // a glyph edge, it cannot paint out a word, and treating outlines as erasers
  // would fire on every plate's own border. Stated rather than assumed: if a
  // stroke ever gets wide enough to erase, this is where it goes.
  const ERASE_ALPHA = 0.5;    // a fill at least this opaque removes what is under it
  const ERASE_FRAC = 0.05;    // ... over at least this much of a glyph box
  let painted = null;
  let seq = 0;
  // The serialised fill colour's own alpha. Canvas normalises whatever was
  // assigned, so the cases are 'rgba(r, g, b, a)', 'rgb(r, g, b)', '#rrggbb',
  // '#rrggbbaa', and a gradient/pattern object. An object is assumed OPAQUE,
  // which biases this instrument towards reporting erasures it cannot prove
  // rather than hiding them — the direction AGENTS_BRIEF asks for.
  function fillAlpha() {
    const f = ctx.fillStyle;
    if (typeof f !== 'string') return 1;
    if (f[0] === '#') {
      if (f.length === 9) return parseInt(f.slice(7, 9), 16) / 255;
      if (f.length === 5) return parseInt(f[4] + f[4], 16) * 17 / 255;
      return 1;
    }
    const m = /^rgba?\(([^)]*)\)/i.exec(f);
    if (!m) return 1;
    const parts = m[1].split(/[,/]/);
    if (parts.length < 4) return 1;
    const a = parseFloat(parts[3]);
    return isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
  }
  // Where a plate came from. Only taken for fills that could actually erase
  // something, because a stack capture per scanline stripe is ~300 per census
  // frame for no information — the translucent ones are counted, not traced.
  function siteOf() {
    try {
      const st = new Error().stack || '';
      const m = st.match(/hud\.js:(\d+):/g);
      // [0] is siteOf, [1] is paintOne, [2] is the patched primitive, [3] is the caller.
      if (m && m.length > 3) return 'hud.js:' + m[3].slice(7).replace(/:$/, '');
      if (m && m.length) return 'hud.js:' + m[m.length - 1].slice(7).replace(/:$/, '');
    } catch { /* no stacks on this engine */ }
    return '?';
  }
  let plateSkipped = 0;
  // ROUND 17 — AND THE 0.5 IS A CLIFF, NOT A MEASUREMENT.
  // ERASE_ALPHA is a hard threshold and nothing on this screen was ever tuned
  // against it: an effective 0.490 is filed as innocent and a 0.518 as an
  // eraser, and the difference between those two on a lit supermarket floor is
  // nothing a player could name. A threshold that cannot be validated on its own
  // axis (AGENTS_BRIEF) at least has to declare how close it came, so plates in
  // [CLIFF_ALPHA, ERASE_ALPHA) are kept in their own list and `erasures()`
  // reports what the count WOULD be at the lower threshold. If those two numbers
  // ever separate, the constant is load-bearing and has to be measured; while
  // they agree, it is not, and that is worth knowing without changing anything.
  const CLIFF_ALPHA = 0.35;
  let dimmed = null;
  // ---- ROUND 17: WHOSE PLATE IS IT ----------------------------------------
  // The first subject-coverage numbers off this ledger were 28% at 10-20 m on
  // 100% of frames, and reading the site list showed most of it was the MARKER
  // CLUSTER'S OWN plates — his label and his distance readout, which are meant
  // to be next to him and which at 14 m are two 18 px bars against a man who
  // draws 68 px tall. Folding those in with the pursuit panel makes one number
  // out of two different facts, and the one this round is about is the chrome.
  //
  // So a plate records who drew it. Set at the two blocks that draw ON the
  // subject and nowhere else, which keeps it a two-line mechanism rather than a
  // taxonomy: everything unlabelled is chrome, which is the safe default —
  // a new band added by a later round counts against the chrome number without
  // anybody remembering to tag it.
  let plateTag = null;
  function paintOne(x, y, w, h) {
    if (!(w > 0) || !(h > 0)) return;
    const a = ctx.globalAlpha * fillAlpha();
    if (a < ERASE_ALPHA) {
      plateSkipped++;
      if (a >= CLIFF_ALPHA && dimmed) {
        const d = devBox(x, y, x + w, y + h);
        dimmed.push({ x0: d[0], top: d[1], x1: d[2], bot: d[3], quad: d[4],
          alpha: a, seq, site: siteOf() });
      }
      seq++; return;
    }
    const b = devBox(x, y, x + w, y + h);
    painted.push({ x0: b[0], top: b[1], x1: b[2], bot: b[3], quad: b[4],
      alpha: a, seq: seq++, site: siteOf(), tag: plateTag });
  }
  // The four fill primitives this file uses. `fillRect` is 53 of the 57 sites;
  // the other four are `fill()` on a path (the REC blip, two status dots, and
  // the edge chevron, which is a 26x40 opaque triangle and unquestionably an
  // eraser if it lands on a word). Path bounds are accumulated conservatively:
  // arcs and ellipses contribute their full bounding square whatever sweep was
  // asked for, which over-reports a partial arc and never under-reports one.
  const rawFillRect = ctx.fillRect.bind(ctx);
  ctx.fillRect = function (x, y, w, h) {
    rawFillRect(x, y, w, h);
    if (painted) paintOne(x, y, w, h);
  };
  let pb = null;
  const grow = (x, y) => {
    if (!pb) pb = [x, y, x, y];
    else { if (x < pb[0]) pb[0] = x; if (y < pb[1]) pb[1] = y;
      if (x > pb[2]) pb[2] = x; if (y > pb[3]) pb[3] = y; }
  };
  for (const [fn, take] of [
    ['beginPath', () => { pb = null; }],
    ['moveTo', (x, y) => grow(x, y)],
    ['lineTo', (x, y) => grow(x, y)],
    ['rect', (x, y, w, h) => { grow(x, y); grow(x + w, y + h); }],
    ['arc', (x, y, r) => { grow(x - r, y - r); grow(x + r, y + r); }],
    ['ellipse', (x, y, rx, ry) => { grow(x - rx, y - ry); grow(x + rx, y + ry); }],
  ]) {
    const raw = ctx[fn].bind(ctx);
    ctx[fn] = function (...args) { raw(...args); if (painted) take(...args); };
  }
  const rawFill = ctx.fill.bind(ctx);
  ctx.fill = function (...args) {
    rawFill(...args);
    if (painted && pb) paintOne(pb[0], pb[1], pb[2] - pb[0], pb[3] - pb[1]);
  };
  // ---- ROUND 17: THE THREE ERASERS THAT ARE LATENT RATHER THAN ABSENT -----
  // `clearRect`, `drawImage` and a destructive `globalCompositeOperation` all
  // remove pixels and NONE of them is a fill. Round 16 enumerated them and left
  // them unhooked because this file uses none of them — which is true today and
  // is a fact about the current copy of the file, not a property of the ledger.
  // Both of the erasure classes that have cost a round here arrived as a new
  // draw site somebody added later (the FOOTSTEPS banner, backRect), so the
  // cheap thing is to hook them now while the count is provably zero: any
  // number these produce is a real change, because the baseline is 0 sites.
  //
  // clearRect is alpha 1 by definition. drawImage is assumed opaque, the same
  // bias fillAlpha() takes for a gradient — over-report rather than hide.
  //
  // ---- AND HOOKING IT FOUND A SITE THE ENUMERATION SAID WAS NOT THERE -----
  // "latent, unhooked" was wrong on its first run: `render()` opens with
  // clearRect(0, 0, W, H), so there has always been exactly one clear per frame.
  // It is not an eraser of the WORLD — this canvas sits OVER the WebGL one, so a
  // clear REVEALS the store rather than hiding it, and counted naively it scored
  // the subject at 100% covered on every frame of every chase. Flagged `clear`
  // and excluded from coverOf() for that reason. It stays in the string ledger,
  // where a clear genuinely does remove earlier ink — and where it can never
  // fire, because every string is drawn after it.
  const rawClearRect = ctx.clearRect.bind(ctx);
  ctx.clearRect = function (x, y, w, h) {
    rawClearRect(x, y, w, h);
    if (painted && w > 0 && h > 0) {
      const b = devBox(x, y, x + w, y + h);
      painted.push({ x0: b[0], top: b[1], x1: b[2], bot: b[3], quad: b[4],
        alpha: 1, clear: true, seq: seq++, site: siteOf(), tag: plateTag });
    }
  };
  const rawDrawImage = ctx.drawImage.bind(ctx);
  ctx.drawImage = function (...a) {
    rawDrawImage(...a);
    if (!painted) return;
    // (img,dx,dy) | (img,dx,dy,dw,dh) | (img,sx,sy,sw,sh,dx,dy,dw,dh)
    const im = a[0] || {};
    const x = a.length >= 9 ? a[5] : a[1], y = a.length >= 9 ? a[6] : a[2];
    const w = a.length >= 9 ? a[7] : a.length >= 5 ? a[3] : (im.width || 0);
    const h = a.length >= 9 ? a[8] : a.length >= 5 ? a[4] : (im.height || 0);
    if (!(w > 0) || !(h > 0)) return;
    const al = ctx.globalAlpha;
    if (al < ERASE_ALPHA) { plateSkipped++; return; }
    const b = devBox(x, y, x + w, y + h);
    painted.push({ x0: b[0], top: b[1], x1: b[2], bot: b[3], quad: b[4],
      alpha: al, seq: seq++, site: siteOf(), tag: plateTag });
  };
  // A destructive composite mode does not paint a rectangle you can record — it
  // changes what every LATER fill means, so the honest response is for the
  // instrument to say it cannot answer rather than to answer wrongly. This is
  // the guard-the-guard shape: `_composite` rides out on the census, and any
  // value in it invalidates the erasure numbers on that frame out loud.
  let compositeSeen = null;
  try {
    const pd = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx),
      'globalCompositeOperation');
    if (pd && pd.set && pd.get) {
      Object.defineProperty(ctx, 'globalCompositeOperation', {
        configurable: true,
        get() { return pd.get.call(ctx); },
        set(v) { if (v && v !== 'source-over') compositeSeen = String(v); pd.set.call(ctx, v); },
      });
    }
  } catch { /* engine without the descriptor: the census reports null */ }

  // Exact area of the union of `rects` inside `box`, by coordinate compression.
  // Not a sampled estimate: two plates that each cover half a word must not
  // add up to 100% coverage, and a grid sampler at any practical resolution
  // gets 8 px type wrong. The candidate list is 1-3 rectangles in practice.
  function coveredFrac(t, rects) {
    const bw = t.x1 - t.x0, bh = t.bot - t.top;
    if (!(bw > 0) || !(bh > 0)) return 0;
    // ROUND 17: the exact path below is exact for axis-aligned rectangles and
    // only for those. The moment a rotated quad is involved (see devBox) it has
    // to be sampled, so that case is split off rather than quietly answered with
    // the wrong bound. It is the rare case: one element on this screen rotates.
    if (t.quad || rects.some((r) => r.quad)) return coveredFracRot(t, rects);
    const xs = new Set([t.x0, t.x1]), ys = new Set([t.top, t.bot]);
    for (const r of rects) {
      if (r.x0 > t.x0 && r.x0 < t.x1) xs.add(r.x0);
      if (r.x1 > t.x0 && r.x1 < t.x1) xs.add(r.x1);
      if (r.top > t.top && r.top < t.bot) ys.add(r.top);
      if (r.bot > t.top && r.bot < t.bot) ys.add(r.bot);
    }
    const X = [...xs].sort((a, b) => a - b), Y = [...ys].sort((a, b) => a - b);
    let area = 0;
    for (let i = 0; i < X.length - 1; i++) {
      for (let j = 0; j < Y.length - 1; j++) {
        const cx = (X[i] + X[i + 1]) / 2, cy = (Y[j] + Y[j + 1]) / 2;
        for (const r of rects) {
          if (cx > r.x0 && cx < r.x1 && cy > r.top && cy < r.bot) {
            area += (X[i + 1] - X[i]) * (Y[j + 1] - Y[j]); break;
          }
        }
      }
    }
    return area / (bw * bh);
  }
  // ROUND 17. The same question when a rotated quad is in play. Coordinate
  // compression cannot answer it — the breakpoints of a -7 degree edge are not
  // four numbers — so this samples cell centres over the target's own bound and
  // divides by the samples that are actually INSIDE the target. On the boxes
  // this runs against (a glyph box is ~100x14 px, a stamp plate ~520x50) the
  // grid is finer than 0.7 px in both axes, which is two orders of magnitude
  // under the 32 px error it exists to remove. Stated as an approximation
  // because it is one; the axis-aligned path above stays exact and unchanged, so
  // no number published before this round moves unless a rotation was involved.
  const ROT_NX = 160, ROT_NY = 40;
  function coveredFracRot(t, rects) {
    let inT = 0, cov = 0;
    for (let i = 0; i < ROT_NX; i++) {
      const x = t.x0 + (i + 0.5) * (t.x1 - t.x0) / ROT_NX;
      for (let j = 0; j < ROT_NY; j++) {
        const y = t.top + (j + 0.5) * (t.bot - t.top) / ROT_NY;
        if (t.quad && !inQuad(t.quad, x, y)) continue;
        inT++;
        for (const r of rects) if (inRect(r, x, y)) { cov++; break; }
      }
    }
    return inT ? cov / inT : 0;
  }
  // A string is ERASED when legible plates drawn after it cover ERASE_FRAC of
  // its glyph box. Illegible strings are skipped for the same reason the
  // overprint test skips them: the CRT burn-in ghost at alpha 0.055 is meant to
  // be sat on, and a checker that reports it will be switched off.
  // A stable key for a string whose text carries live numbers. `AISLE 3`,
  // `AISLE 7` and `LAST SEEN 7.4s +-11m` are one site each, not eighty, so the
  // census tally names classes instead of instances.
  function siteWordOf(str) {
    return String(str).replace(/[0-9]+(\.[0-9]+)?/g, '#').slice(0, 22);
  }
  // `near` collects the sites of plates that land on a glyph box WITHOUT
  // covering enough of it to count — a band grazing a word today is a band on
  // the word after the next copy change. It is the early-warning half, reported
  // separately for the same reason `ghosted` is: a checker that folds a
  // near-miss into a failure gets switched off, and one that drops it silently
  // is worse.
  // ---- ROUND 17: AND IT HAS NO SEVERITY -----------------------------------
  // The ledger answers "were these glyphs covered". The player's question is
  // "can I still read the word", and those come apart in one specific way that
  // this HUD does on purpose: an element paints its own backing plate over
  // whatever was there and then prints THE SAME STRING on top of it. The word is
  // not destroyed, it is REPRINTED — and the ledger scores that at 100% and
  // sends the next round after a non-bug. `DOOR 1` is the live case.
  //
  // So a covered string is checked for a REPRINT: a later, legible string with
  // the same text (numbers normalised, so `HIM 17.2m` and `HIM 17.3m` are one
  // word) whose own box lands on the same rows and covers most of the same
  // columns. When one exists the entry is filed under `reprinted` — never
  // dropped, because the layout is still doing something worth knowing about,
  // and a checker that silently swallows a case is the failure mode this file's
  // `ghosted` note is about. It just is not an erasure.
  const REPRINT_OVERLAP = 0.6;
  function reprintOf(t, list) {
    const key = siteWordOf(t.s);
    const tw = t.x1 - t.x0;
    if (!(tw > 0)) return null;
    for (const u of list) {
      if (u === t || u.seq <= t.seq || u.alpha < INK_LEGIBLE) continue;
      if (siteWordOf(u.s) !== key) continue;
      // same row: the baselines have to be within a line of each other, the
      // same test overprints() uses to decide two strings share a row.
      if (Math.abs(u.y - t.y) >= Math.max(u.size, t.size) * 0.6) continue;
      const ov = Math.min(u.x1, t.x1) - Math.max(u.x0, t.x0);
      if (ov / tw >= REPRINT_OVERLAP) return u;
    }
    return null;
  }
  function erasures(list, plates, near = [], out2 = {}) {
    const out = [];
    const reprinted = out2.reprinted || (out2.reprinted = []);
    const cliff = out2.cliff || (out2.cliff = []);
    const dim = out2.dim || [];
    for (const t of list) {
      if (t.alpha < INK_LEGIBLE) continue;
      const hitting = (rs) => rs.filter((r) => r.seq > t.seq
        && r.x0 < t.x1 && r.x1 > t.x0 && r.top < t.bot && r.bot > t.top);
      const over = hitting(plates);
      if (!over.length) {
        // ROUND 17: nothing opaque landed on it — but did something just under
        // the 0.5 cliff? See CLIFF_ALPHA. Counted, not promoted.
        if (dim.length) {
          const d = hitting(dim);
          if (d.length && coveredFrac(t, d) >= ERASE_FRAC) cliff.push(siteWordOf(t.s));
        }
        continue;
      }
      const frac = coveredFrac(t, over);
      if (frac < ERASE_FRAC) { near.push(over[0].site); continue; }
      let worst = over[0];
      for (const r of over) if (coveredFrac(t, [r]) > coveredFrac(t, [worst])) worst = r;
      const rec = { s: t.s, pct: +(frac * 100).toFixed(1), by: worst.site,
        y: +t.y.toFixed(1), x0: +t.x0.toFixed(1), x1: +t.x1.toFixed(1),
        alpha: +worst.alpha.toFixed(3) };
      const rp = reprintOf(t, list);
      if (rp) { rec.reprint = +(rp.x0).toFixed(1); reprinted.push(rec); continue; }
      out.push(rec);
    }
    return out;
  }
  function clip(s, max, size, wt) {
    ctx.font = `${wt || ''} ${size}px ${MONO}`.trim();
    if (ctx.measureText(s).width <= max) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }
  function scan(x, y, w, h, a = 0.3) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    for (let i = 0; i < h; i += 3) ctx.fillRect(x, y + i, w, 1);
  }
  function box(x, y, w, h, c, lw = 1) {
    ctx.strokeStyle = c; ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  }
  function panel(x, y, w, h, title, o = {}) {
    ctx.fillStyle = o.bg || INK; ctx.fillRect(x, y, w, h);
    scan(x, y, w, h, o.scan == null ? 0.3 : o.scan);
    box(x, y, w, h, o.line || LINE);
    if (title) {
      // ROUND 15 (width audit): was `16 + title.length * 8.0`. A per-character
      // guess never overflowed here — `max` clips — but it clipped titles that
      // fit, and it is the same class of arithmetic that put the word NOT under
      // the word BY in the FOOTSTEPS banner. Measured, not estimated.
      const TO = { s: 11, w: 'bold', ls: 1.3 };
      const tw = Math.min(w, advOf(title, TO) + 14);
      ctx.fillStyle = o.accent || AMB; ctx.fillRect(x, y, tw, 16);
      tx(title, x + 8, y + 12, { ...TO, c: '#07100a', max: tw - 14 });
    }
  }
  function segbar(x, y, w, h, frac, o = {}) {
    const n = o.seg || 24, gap = 2, sw = (w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const on = (i + 0.999) / n <= frac;
      ctx.fillStyle = on ? (o.on || GRN) : (o.off || 'rgba(255,255,255,0.07)');
      ctx.fillRect(x + i * (sw + gap), y, sw, h);
    }
    box(x - 3, y - 3, w + 6, h + 6, o.line || LINE);
  }
  function reg(id, x, y, w, h, data) { regions.push({ id, x, y, w, h, data }); }
  // ROUND 15 — see PURSUIT_RECT. Move a plate clear of the pursuit panel, and
  // ONLY when it would really land on it: the panel has to be up (the player is
  // in a chase), and the two rectangles have to genuinely overlap in x. It
  // resolves DOWNWARD because the panel's top edge is 62 px from the ceiling and
  // there is nothing under it but floor.
  //
  // This is a keep-out, not a layout engine. Two elements on this screen collide
  // and one of them is allowed to move; if a third ever joins them the answer is
  // a reserved band, not a third special case here.
  function pursuitUp(f) { return !!(f && f.target && f.target.state === 'flee'); }

  // ===========================================================================
  // ROUND 17 — THE SUBJECT IS NOT A STRING
  // ===========================================================================
  // Two rounds of erasure work, an ink ledger and then a plate ledger, and the
  // worst thing on this screen was never in either of them. At a measured 3.8 m
  // gap — the moment the chase is decided — the fleeing man renders from the
  // KNEES UP behind the pursuit panel: legs and shoes below it, torso a dark
  // smear through it, the bracket sitting on the floor at his feet.
  // shots/critic_r16_erasure_door1.png.
  //
  // Both ledgers are HUD-versus-HUD BY CONSTRUCTION. Every target in them is a
  // string this file typeset, so no amount of refining them can ever reach a
  // HUD-over-world defect, and the thing being covered is the one thing
  // PROMPT.md's second bar is about: seeing the man you are a few feet from.
  //
  // The fix to the INSTRUMENT is one object. A body is a rectangle on this
  // canvas exactly like a word is, so it goes into the SAME plate ledger as a
  // target and `coveredFrac` answers the same question about it. What was
  // missing was never the machinery; it was one box.
  //
  // ---- AND IT IS DERIVED FROM THE WORLD, NOT FROM THE MARKER --------------
  // Round 16's proxy for this was the bracket chip's position, and it fires on
  // 169 of 397 chase frames while UNDER-counting: in the photographed frame the
  // chip sat at y = 205 and the man's body spanned y = 40..190, so the proxy was
  // testing a rectangle the man is not in. A marker is a claim ABOUT the
  // subject; it is not his silhouette. So this projects the silhouette: four
  // corners at his shoulders' width, from the floor to the crown of his head,
  // through the same projectFromCop + warpFloor pair every marker on this screen
  // goes through. If the lens changes, this changes with it for free.
  //
  // ---- AND IT IS CHECKED AGAINST PIXELS, NOT AGAINST ITSELF ---------------
  // Every number this round publishes is a fraction OF this rectangle, so a
  // rectangle that is not on the man is a confident fiction — six checks on this
  // project have already certified a stage earlier than the defect. So it was
  // ablated: hide the fleeing man's body group, re-render the SAME frame, diff
  // the graded, barrel-warped output and erode by 2 px to kill the grade's
  // grain. On the shipped build at 4.44 m with 95.8% of him on canvas:
  //
  //     null (nothing changed, same frame twice)      0 eroded px
  //     his silhouette                            8,904 eroded px
  //     of which INSIDE this rectangle            8,827  -> containment 0.991
  //     the 77 outside                            1-3 px past the shoulders,
  //                                               at his swinging arms
  //     his pixels as a share of the rectangle    44.7%
  //
  // Evidence image: shots/r17_instrument_evidence.png. A zero noise floor is
  // what makes the 77 readable as arms rather than as grain.
  //
  // ONE TRAP FOUND DOING IT, WORTH KNOWING: hiding `s.mesh` — the shopper's ROOT
  // group — also removes a second figure elsewhere on the frame, so containment
  // reads 0.427 and the box looks wrong. Hiding `s.mesh.children[0]`, the body
  // group, is the clean ablation. An ablation that removes more than it names is
  // the "region split that does not split what it claims" from AGENTS_BRIEF.
  //
  // ---- WHAT IT IS ALLOWED TO KNOW -----------------------------------------
  // `f.target` is the PUBLISHED BELIEF, which is what the brackets are drawn on
  // and all this file is ever permitted to see. On a `contact` frame game.js's
  // own sightCheck() identity makes belief and man the same point, which is why
  // every headline this round quotes is taken on contact frames. On a cold frame
  // this box is where the HUD THINKS he is — still the right thing for the panel
  // to dodge, and not a measurement of where the man was.
  const BODY_H = 1.78;      // crown of a standing shopper, metres
  const BODY_W = 0.55;      // shoulder to shoulder, the same figure the COLD
                            // ring's pxPerM is derived from — one number, once.
  // A frame is scored as COVERING him at a fifth of his silhouette. That is not
  // a calibrated threshold and is not presented as one: the census carries the
  // mean fraction as well, so anybody who disagrees with the cut can read the
  // number it was cut from. `NEAR` is the range PROMPT.md's second bar lives at
  // — round 16's hand-played chases oscillated between 3.3 and 5.0 m and ended
  // at 4.4 / 8.1 / 4.7 m, so 8 m is the band where the man's body is the
  // information and the door race has stopped being it.
  const SUBJ_HIT = 0.20;
  const SUBJ_NEAR_M = 8.0;
  function subjectBox(G, f) {
    if (!(G && G.cop && f && f.target)) return null;
    const sx = f.target.x, sz = f.target.z;
    const dx = sx - G.cop.x, dz = sz - G.cop.z;
    const d = Math.hypot(dx, dz);
    if (!(d > 0.05)) return null;
    // Shoulders lie across the line of sight, so the widest he can look from
    // here is BODY_W perpendicular to it. At the ranges this matters (2-25 m)
    // the difference from a true billboard is under a pixel.
    const ox = (-dz / d) * (BODY_W / 2), oz = (dx / d) * (BODY_W / 2);
    let x0 = Infinity, x1 = -Infinity, top = Infinity, bot = -Infinity;
    for (const s of [1, -1]) {
      for (const h of [0.02, BODY_H]) {
        const raw = projectFromCop(G.cop, sx + s * ox, h, sz + s * oz);
        if (raw.behind) return null;
        const q = warpFloor(raw);
        if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x;
        if (q.y < top) top = q.y; if (q.y > bot) bot = q.y;
      }
    }
    const full = Math.max(1e-6, (x1 - x0) * (bot - top));
    // Off-canvas is not occlusion. Only the part of him that is ON the frame can
    // be covered by a panel, so the box is clipped and `vis` records how much of
    // him the frame holds — a man half off the left edge is the chevron's
    // problem and must not be counted as the panel's.
    const cx0 = Math.max(0, x0), cx1 = Math.min(W, x1);
    const cy0 = Math.max(0, top), cy1 = Math.min(H, bot);
    if (!(cx1 - cx0 > 0) || !(cy1 - cy0 > 0)) return null;
    return { x0: cx0, x1: cx1, top: cy0, bot: cy1, d, full,
      vis: ((cx1 - cx0) * (cy1 - cy0)) / full, px: (x1 - x0) * (bot - top) };
  }
  // How much of the man the chrome is standing on, on THIS frame. `plates` is
  // the plate ledger's own list, so an element added to this file lands in this
  // number without anybody adding it to a list — which is the property the
  // enumerated keep-out list below explicitly does not have.
  //
  // Every plate counts, with no draw-order filter: the HUD is a separate canvas
  // laid over the WebGL one, so EVERYTHING on it is "later" than the world.
  // `only` is null for everything, 'chrome' for everything the subject cluster
  // did not draw, or ANY plate tag for exactly that element. The tag arm is not
  // a convenience: subjCheck() below has to ask about the pursuit panel's own
  // plates and nothing else, and the alternative is matching `site` against a
  // line number, which is a transcription of a position in this file — the
  // hazard CLAUDE.md opens with, in its cheapest form.
  //
  // ---- ROUND 21: "OFF-CANVAS IS NOT OCCLUSION" WAS ONLY HALF IMPLEMENTED ---
  // subjectBox() clips in BOTH axes, so the comment above is true of the box.
  // It was not true of the FRACTION, because `coveredFrac` divides by the
  // CLIPPED area — so a man 90% off an edge has a denominator that is 10% of
  // him, and any panel sitting on the sliver that is left reads as most of him.
  // Round 20's chrome headline is 73% one bottom panel on exactly those frames
  // (his box top y601-624, `vis` 0.07-0.13), and my own baseline sweep found the
  // MIRROR of it at the top: the top band reads 98.3 / 100 / 100 percent on
  // three frames whose `vis` is 0.263 / 0.116 / 0.009 — a man three pixels from
  // gone off the top of the screen, with the band standing on those three
  // pixels. Both readings are the same arithmetic and both are wrong in the same
  // direction.
  //
  // So the denominator is HIS WHOLE SILHOUETTE, on canvas or not:
  //
  //     covered_area / full_area  =  (covered_area / clipped_area) * vis
  //
  // which is what the sentence "the chrome covers n% of him" has always claimed
  // to mean. A man wholly on canvas is unaffected (`vis` = 1) — every frame that
  // decides this round's headline is a `vis` >= 0.98 frame — and a man who has
  // left the frame can no longer contribute a large number for a panel standing
  // on his last three pixels. THIS DEFLATES NUMBERS THIS ROUND WOULD RATHER
  // QUOTE, and it is applied before the fix it scores; see the report.
  //
  // The scaling lives HERE, in the one function every caller goes through, and
  // not at the call sites — the site tally in hud.cover() below had its own copy
  // of the division and got the same treatment by calling `fracOf`.
  function fracOf(box, rects) {
    return rects.length ? coveredFrac(box, rects) * (box.vis == null ? 1 : box.vis) : 0;
  }
  function coverOf(box, plates, only) {
    if (!box) return 0;
    const over = plates.filter((r) => !r.clear && r.x0 < box.x1 && r.x1 > box.x0
      && r.top < box.bot && r.bot > box.top
      && (only == null ? true : only === 'chrome' ? r.tag !== 'subj' : r.tag === only));
    return fracOf(box, over);
  }

  // ===========================================================================
  // ROUND 16 — THE RESERVED BANDS. THE THIRD ELEMENT JOINED.
  // ===========================================================================
  // The note above says: "This is a keep-out, not a layout engine. Two elements
  // on this screen collide and one of them is allowed to move; if a third ever
  // joins them the answer is a reserved band, not a third special case here."
  //
  // Three joined, and the plate ledger named all three rather than an eye:
  //
  //     hud.js panel()     the DISPATCHED TO panel, INK 0.88
  //     hud.js topBand()   the floor band, rgba(2,4,3,0.93), full width
  //     hud.js plate()     the look gauge's backing plate, 0.92
  //
  // AND THE CASUALTY IS NOT WHAT ANYONE THOUGHT. Every one of these is drawn
  // AFTER the subject cluster, so the chrome wins and THE MARKER'S OWN LABEL is
  // what gets painted out — `SUBJ-02 ?` at 100%, three separate poses, each
  // reproducible from a fixed target position. What the player is left with is
  // an orphan `?` and a stub of bracket outline sitting on the panel, which
  // reads as a broken widget: the same complaint burnIn() records a critic
  // filing about a ghost in a panel, and shots/crop_r16_before_panel.png is it.
  //
  // What is NOT happening, contrary to the round's brief: `AISLE n` is never
  // destroyed. It cannot be — it is drawn inside the panel that is drawn after
  // the whole cluster. Swept over 4,864 marker layouts, the only rectangle that
  // ever overlaps that string is the panel's OWN backing plate, drawn before
  // it. See shots/crop_r16_before_panel.png, where AISLE 5 is untouched and the
  // subject label is gone. The collision is real and the direction is inverted.
  //
  // ---- ONE OWNER PER RECTANGLE, WHICH IS THE WHOLE POINT ------------------
  // A keep-out list is a SECOND COPY of four rectangles, and CLAUDE.md opens
  // with what happens to those (hud.js's own hand-copied camera rig, correct
  // only while the camera never moved). So the drawing sites READ these; there
  // is no transcribed 10/62/262 anywhere below. Change a panel's box and the
  // keep-out follows, because it is the same object.
  const LOOK_RECT = { x: 1090, y: 62, w: 180, h: 50 };
  // The DISPATCHED TO panel's box, or null on the frames it is not drawn. Its
  // gate lives here too, for the same reason: a keep-out reserved on a frame
  // where nothing is painted would push the label off a man for no reason.
  function dispatchRect(f) {
    if (!f || pursuitUp(f) || f.closed) return null;
    return { x: 10, y: 62, w: 262, h: (f.odds && f.odds.long) ? 68 : 54 };
  }
  // ---- AND THE PREVIOUS LAYOUT IS EXECUTABLE, NOT DESCRIBED ---------------
  // Round 15 made its two rejected end rules selectable by name so the probe
  // could be run against the bugs instead of only against the fix, and this
  // brief calls that the pattern to copy. Same here: 'r15' rebuilds the exact
  // layout that shipped last round — pursuit keep-out only, no flip, and the
  // `dy2 === ly` special case instead of a label keep-out — so the before and
  // the after are one page load and one byte-identical scene apart, which is
  // the only ablation form this project trusts. Ship is 'r16' and the ONLY
  // caller of the other is a capture or a critic.
  // ROUND 17 ships 'r17' and keeps 'r16' as the executable before. Everything
  // round 16 built stays on under both — only the pursuit panel's shape, its
  // slot and the door tags' keep-out differ, which is what makes the A/B one
  // hud.bands() call on a byte-identical frame instead of two builds.
  // ---- ROUND 21: THE LAYOUT NAMES ARE AN ORDER, NOT A SET -----------------
  // Every gate that had accumulated here was written `BANDS === 'r17'` or
  // `BANDS !== 'r17'`. That reads as "is this the shipped layout" and MEANS "is
  // this exactly r17", and the two stop being the same sentence the moment a
  // round ships a new name. Adding 'r21' would have turned three of them off
  // with no error and no output: `pursuitRect` would have returned the WIDE
  // rectangle on every frame — round 20's fix, the one this round was told not
  // to undo, disabled by a string comparison — and the door tag's dodge and its
  // subject keep-out with it.
  //
  // Found by grepping the constant before shipping the name, not by a check.
  // A layout name is a POINT ON A TIMELINE: r21 has everything r17 had, plus
  // the band. So the gates ask `from('r17')`, and the next round's name costs
  // one entry in this array instead of three silent regressions.
  const BAND_ORDER = ['r15', 'r16', 'r17', 'r21'];
  const from = (n) => BAND_ORDER.indexOf(BANDS) >= BAND_ORDER.indexOf(n);
  let BANDS = 'r21';
  hud.bands = function (mode) {
    if (mode) {
      if (BAND_ORDER.indexOf(mode) < 0) {
        // A typo'd layout name used to be indistinguishable from the oldest
        // layout, because every gate in the file failed its equality test. An
        // A/B run against a name nobody implements is a measured comparison of
        // one build with itself, which is the "empty sample" this project has
        // retired two metrics over.
        throw new Error(`hud.bands: unknown layout "${mode}" — one of ${BAND_ORDER.join(', ')}`);
      }
      BANDS = mode;
    }
    return BANDS;
  };

  // ===========================================================================
  // ROUND 17 — THE PANEL YIELDS TO THE MAN
  // ===========================================================================
  // MEASURED FIRST. 12 chases, 1,300 census frames at 20 Hz on the LIVE camera,
  // two driver policies x two glance conditions, the man's silhouette scored
  // against every legible plate this file paints (see subjectBox):
  //
  //     all frames                  chrome covers 4.0% of him, >=20% on 7.9%
  //     <=8 m and CONTACT           5.1%,  >=20% on 10.6% of 870 frames
  //     his box reaching above y200 21.1%, on 118 frames — 9.1% of the chase
  //
  // and the site tally names the culprit without an argument:
  //
  //     hud.js:674   panel() body    117 frames   mean 30.0%   worst 87.9%
  //     hud.js:1180  topBand()        41 frames   mean 28.6%   worst  100%
  //
  // At d = 3.24 m the pursuit panel alone takes 28.1% of him and the top band a
  // further 18.7% — 46.9% of the man, at the range the chase is decided. That is
  // shots/critic_r16_erasure_door1.png, reproduced as a number.
  //
  // ---- WHAT MOVES, AND WHY IT IS THE PANEL AND NOT THE MARKER -------------
  // The top band is the frame's title bar and a man whose head is off the top of
  // the screen is a man you are on top of; there is nothing to move there.
  //
  //   ROUND 21: THAT ARGUMENT IS WRONG AND ITS OWN POPULATION SAYS SO. The band
  //   fires at 5.40 m with the whole man on canvas. It moved; see THE BAND
  //   YIELDS TO THE MAN at topBand(). The sentence is left standing because the
  //   reasoning in it is the reasoning that had to be refuted.
  //
  // The panel is 680x78 of chrome sitting exactly where a man 3-6 m ahead renders,
  // and MOST OF WHAT IS IN IT HAS STOPPED BEING A QUESTION at that range. So the
  // panel gets out of the way, and pays for the room by dropping the one thing
  // that decides nothing: the chip for the door he is NOT running at.
  //
  // NOTHING ELSE IS HIDDEN. Tight still carries the sight-state title, his door,
  // his metres, your metres, the verdict, the gap, the ETA and the run track.
  // The complaint this answers is that the panel ranked its numbers wrong and
  // stood on the subject — not that it said too much.
  //
  // ---- THE TRIGGER IS IN THE UNITS OF THE DEFECT --------------------------
  // Not a distance, and not a guess at one: the panel goes tight when the WIDE
  // rectangle would cover TIGHT_ON of his silhouette, and comes back when it
  // would cover under TIGHT_OFF. The fix is therefore defined by the same
  // quantity the round is measured in, and a later change to the camera or the
  // lens moves both together instead of stranding a hand-picked 9 m.
  //
  // ---- THE RESULT, MATCHED FRAME FOR FRAME --------------------------------
  // 7 chases (4 straight, 3 with a 35 degree glance sweep), 838 sampled frames,
  // BOTH layouts scored on the SAME frame via hud.bands() — no cross-load
  // comparison, which is the only ablation form this project trusts:
  //
  //                              r16 (wide)        r17 (ship)
  //     chrome on him, mean        4.27%             2.91%
  //     chrome >= 20% of him    64 frames          37 frames
  //     <=8 m and CONTACT, mean    4.14%             2.73%   (554 frames)
  //     THE PANEL'S OWN PLATES     1.19% mean        0.04% mean
  //       >= 20% of him         25 frames           0 frames
  //       worst single frame        47.8%             7.1%
  //
  // Restricted to the 56 frames (6.7%) where the wide rect really does land on
  // him, the panel takes 17.8% of him and the shipped one 0.6%, and 0 of 56 are
  // worse. Both extremes stay at 100% because the TOP BAND can cover a man whose
  // head is off the top of the frame, and nothing about this round moves that.
  //   ROUND 21: two things move it. The band chips (topBand), and the
  //   denominator — a "100%" reached on a man 99% off the top of the screen was
  //   coverOf() dividing by the CLIPPED box, not by him.
  //
  // Decisive-frame pair, one frame, one hud.bands() call apart:
  // shots/r17_final_r16.png (chrome 54.9%, panel 32.9%, legs and shoes below the
  // band and a dark smear through it) against shots/r17_final_r17.png (22.0% /
  // 0.0%, the whole man) at a 4.44 m gap on CONTACT.
  const PURSUIT_TIGHT = { w: 330, h: 72 };
  const TIGHT_ON = 0.06, TIGHT_OFF = 0.02;
  // Two slots, not a slide. A panel the player looks for has to be in a place he
  // can look; sliding it continuously along x would keep it off the man and make
  // it impossible to find. LEFT is free during a chase by construction —
  // dispatchRect() returns null while pursuitUp(). RIGHT is hard against the
  // look gauge, read off LOOK_RECT rather than transcribed.
  const SIDE_HYST = 0.08;
  let tightOn = false, tightSide = 'left', prCache, prFrame = -1, renderSeq = 0;
  // Fraction of the subject's box that a rectangle covers. Plain rectangle
  // intersection — this is a layout question, not an ink question, so it does
  // not go through the plate ledger.
  function boxOn(sb, R) {
    if (!sb || !R) return 0;
    const w = Math.min(sb.x1, R.x + R.w) - Math.max(sb.x0, R.x);
    const h = Math.min(sb.bot, R.y + R.h) - Math.max(sb.top, R.y);
    if (!(w > 0) || !(h > 0)) return 0;
    return (w * h) / Math.max(1e-6, (sb.x1 - sb.x0) * (sb.bot - sb.top));
  }
  function tightSlots() {
    const { w, h } = PURSUIT_TIGHT;
    return { left: { x: 10, y: PURSUIT_RECT.y, w, h },
      right: { x: LOOK_RECT.x - 8 - w, y: PURSUIT_RECT.y, w, h } };
  }
  // ONE OWNER, MEMOISED PER FRAME. floorKeepOuts(), backRect(), doorTagBoxes()
  // and the drawing site all ask for this rectangle, and the hysteresis above is
  // state — so four calls in one frame would step it four times. `prFrame` is
  // the render counter, bumped once in render().
  function pursuitRect(G, f) {
    if (!pursuitUp(f)) { tightOn = false; return null; }
    if (!from('r17')) return PURSUIT_RECT;
    if (prFrame === renderSeq) return prCache;
    prFrame = renderSeq;
    const sb = subjectBox(G, f);
    const onMan = boxOn(sb, PURSUIT_RECT);
    if (!tightOn && onMan >= TIGHT_ON) tightOn = true;
    else if (tightOn && onMan <= TIGHT_OFF) tightOn = false;
    if (!tightOn) { prCache = PURSUIT_RECT; return prCache; }
    const S = tightSlots();
    const lo = boxOn(sb, S.left), ro = boxOn(sb, S.right);
    const cur = tightSide === 'left' ? lo : ro;
    const oth = tightSide === 'left' ? ro : lo;
    if (oth + SIDE_HYST < cur) tightSide = tightSide === 'left' ? 'right' : 'left';
    prCache = tightSide === 'left' ? S.left : S.right;
    return prCache;
  }
  // The two LOWER bands, same deal. These are the ones the readout runs into:
  // it clamps its own bottom at 516 and the heard banner starts at 496, so the
  // clamp was never a clearance. Their widths come off the strings they hold —
  // which is round 15's own fix for the FOOTSTEPS banner — so the box cannot be
  // guessed at from here; it is derived by the same call the drawing site makes.
  const HEARD_MO = { s: 13, w: 'bold', ls: 1.2 };
  const HEARD_SO = { s: 11, ls: 0.8 };
  const HEARD_PAD = 14, HEARD_GAP = 22;
  function heardRect(f) {
    if (!f || !(f.heardLeft > 0)) return null;
    const hw = Math.max(420, HEARD_PAD + advOf(f.heardLine || '', HEARD_MO)
      + HEARD_GAP + advOf(f.heardSub || '', HEARD_SO) + HEARD_PAD);
    return { x: W / 2 - hw / 2, y: 496, w: hw, h: 30 };
  }
  // The shout panel, which is also what MOVES the prompt band — so hoisting it
  // gives both rectangles and the coupling between them in one place, instead
  // of a `promptY` threaded through the keep-out list from 500 lines below.
  function dialogueRect(f) {
    if (!f || !f.dialogue) return null;
    const h = 34 + f.dialogue.shown.length * 26;
    return { x: 300, y: 590 - h, w: 680, h };
  }
  function promptYOf(f) { const d = dialogueRect(f); return d ? d.y - 44 : 540; }
  function promptOpts(f) { return { s: f.promptQuiet ? 14 : 15, w: f.promptQuiet ? '' : 'bold',
    ls: f.promptQuiet ? 1 : 1.4 }; }
  function promptRect(f) {
    if (!f || !f.prompt || (f.dialogue && !f.backOff)) return null;
    const w2 = advOf(f.prompt, promptOpts(f)) + 40;
    return { x: W / 2 - w2 / 2, y: f.backOff ? promptYOf(f) : 540, w: w2, h: 34 };
  }
  // The rear-break banner. It only paints on the frames a subject turns for the
  // back of the store, which is why no synthetic sweep in this round produced
  // it and why the ledger found it instead — see the note at the end of this
  // block. Its box is PURSUIT_RECT's x and width, because it hangs off that
  // panel; only the row is its own.
  // The door tags on the floor. They are drawn AFTER the subject cluster and
  // their plate is the same 20 px `cy - 9` box the round-15 note describes, so
  // they erase the subject's label exactly the way the chrome does — 7 of them
  // in one 9,600-frame bench, worst 44.1% of `◀ SUBJ-07`. Geometry hoisted so
  // the cluster can reserve the rows and the drawing loop below reads the same
  // boxes; the numbers appear once.
  //
  // ---- ROUND 17: A RESERVER THAT WAS NEVER A RESERVEE ---------------------
  // These rectangles go INTO the keep-out list above and were never resolved
  // AGAINST it. The pursuit panel is drawn after them and paints over them, so a
  // `DOOR 1` tag that lands in the panel's rows renders as a dark ghost box on
  // the progress bar and the word inside it is gone — which is "a broken
  // widget", the phrase round 16 used for the defect it fixed one element along.
  // shots/critic_r16_erasure_door1.png has it, at x 555-605, sitting on the red
  // track. The tag was the only element on this screen contributing a keep-out
  // and obeying none.
  //
  // So it takes a row instead of clamping to one, exactly as the subject's label
  // learned to in round 16. It resolves DOWNWARD for the same reason everything
  // else here does: the bands hang from the ceiling. And the STEM follows it —
  // the tag's whole claim is "this word is attached to that door", so the stem is
  // now drawn to the door's own threshold rather than a fixed 15 px, and it is
  // suppressed entirely if the tag has been pushed past the threshold, because a
  // stem pointing up at nothing is the false precision round 15 retired for the
  // chevron.
  const DOORTAG_O = { s: 12, w: 'bold' };
  // The bottom of the tag's own clamp (`cy` is clamped to 524 and the plate is
  // 20 px), read here so the dodge below cannot invent a second copy of it.
  const TAG_MAX_Y = 524 - 9;
  // Round 16's lesson, applied to this round's own regression: the previous
  // behaviour stays executable so the A/B is one hud.tagDodge() call on a
  // byte-identical frame rather than two builds. Ship is ON; the only caller of
  // the other is a capture or a critic.
  let TAG_DODGE = true;
  hud.tagDodge = function (v) { if (v != null) TAG_DODGE = !!v; return TAG_DODGE; };
  function doorTagBoxes(G, f) {
    if (!(f && f.door && f.target && f.target.state === 'flee' && G.cop)) return [];
    const dr = f.door;
    const out = [];
    // The bands a floor tag has to clear. Deliberately NOT floorKeepOuts() —
    // that list calls this function, and these three are the ones drawn after it.
    const ko = [];
    if (from('r17')) {
      for (const r of bandRects(G, f)) ko.push(r);
      const PR = pursuitRect(G, f); if (PR) ko.push(PR);
      const BK = backRect(G, f); if (BK) ko.push(BK);
    }
    // ---- AND THE COST OF THE LINE ABOVE, MEASURED AND THEN PAID -----------
    // Making the tag step out of the pursuit panel moved it onto the MAN on 5
    // extra frames of a 612-frame matched sweep (14 -> 19, mean 2.2% of him,
    // worst 6.1%). Small, and it is the round's own defect one element along:
    // the reserver that was never a reservee became a reserver that reserves
    // around chrome and not around the subject.
    //
    // So the man is a keep-out too — but ONLY WHERE IT HELPS. rowBelow()
    // resolves downward without a ceiling, and his box is 150-500 px tall at
    // chase range, so stepping around him can park a door tag below its own
    // clamp, off the bottom of the floor view, pointing at nothing. That is
    // round 15's clamp regression exactly ("a clamp does not find free space,
    // it finds the panel that is already there"), and it is a worse defect than
    // the one being fixed. The rule is therefore: take the subject-aware row if
    // it still lands inside the tag's own clamp, otherwise keep the row the
    // chrome-only pass gave and let the tag sit on him. Prefer not to move over
    // moving somewhere worse.
    const sbTag = TAG_DODGE && from('r17') ? subjectBox(G, f) : null;
    dr.all.forEach((e, i) => {
      const his = i === dr.i;
      if (!his && dr.sure) return;
      const p = warpFloor(projectFromCop(G.cop, e.x, 2.62, e.z));
      const off = p.behind || p.x < 60 || p.x > W - 60;
      const cx = Math.max(56, Math.min(W - 56, p.x));
      const cy = off ? 560 : Math.max(92, Math.min(524, p.y));
      const lbl = (off && p.x < W / 2 ? '◀ ' : '') + e.label + (off && p.x >= W / 2 ? ' ▶' : '');
      const bw = advOf(lbl, DOORTAG_O) + 20;
      const x0 = cx - bw / 2;
      let ty = ko.length ? rowBelow(cy - 9, 20, x0, bw, ko) : cy - 9;
      if (sbTag) {
        const man = { x: sbTag.x0, y: sbTag.top,
          w: sbTag.x1 - sbTag.x0, h: sbTag.bot - sbTag.top };
        const alt = rowBelow(ty, 20, x0, bw, ko.concat([man]));
        if (alt <= TAG_MAX_Y) ty = alt;
      }
      // Where the door actually meets the floor, so the stem points at the thing
      // the tag names. Same projection, same lens, one height lower.
      const thr = warpFloor(projectFromCop(G.cop, e.x, 0, e.z));
      out.push({ e, i, his, off, cx, cy, lbl, bw, ty,
        thr: thr.behind ? null : thr.y,
        rect: { x: x0, y: ty, w: bw, h: 20 } });
    });
    return out;
  }
  const BACK_BANNER_Y = 146, BACK_BANNER_H = 34, BACK_BANNER_H2 = 50;
  const BACK_MO = { s: 15, w: 'bold', ls: 1.8 };
  const BACK_SO = { s: 11, w: 'bold' };
  const BACK_PAD = 16, BACK_GAP = 14;
  // ---- THE BANNER THE TIGHT PANEL BROKE, AND HOW IT WAS FOUND -------------
  // Making the panel narrow made this banner narrow with it — 680 px -> 330 —
  // and its two strings are laid out left-flush and right-flush on ONE
  // baseline. At 330 px they print through each other and the player reads
  // `SUBJEGTiNgBREAKlNGtFOR THEsREAR`: the FOOTSTEPS bug of round 14, in the
  // code of the round that cites it, three hundred lines below the note that
  // says a helper nobody calls is not a guard. shots/r17_panel_r17.png is it.
  //
  // It was NOT found by the ledger that was built for it. `_overprints` reports
  // this pair correctly — same baseline, 15 px and 11 px, overlapping — and
  // nobody had run a census on a frame where a subject breaks for the rear
  // WHILE the panel is tight. That combination did not exist before this round.
  // So the instrument was right and unread, which is this project's other
  // recurring failure ("ship an instrument, then READ it").
  //
  // The layout is now DERIVED rather than assumed: measure both strings with
  // advOf — THE function this file's own history says must be called — and if
  // they do not fit side by side, stack them and shrink each to its row. One
  // owner, so the keep-out rectangle and the drawing site cannot disagree about
  // how tall the banner is.
  function backLayout(G, f) {
    if (!f || !f.viaBack || !pursuitUp(f)) return null;
    // ROUND 17: hangs off the LIVE panel rect, not the wide constant. A banner
    // 680 px wide under a 330 px panel is two elements that used to be one. `G`
    // is threaded rather than reaching for a memo, because a rectangle that is
    // right only when somebody called something else first is the class of bug
    // CLAUDE.md opens with.
    const PR = pursuitRect(G, f) || PURSUIT_RECT;
    const main = '▲ ' + (f.backLine || 'SUBJECT BREAKING FOR THE REAR');
    const sub = f.backSub || '';
    const inner = PR.w - 2 * BACK_PAD;
    const oneRow = advOf(main, BACK_MO) + (sub ? BACK_GAP + advOf(sub, BACK_SO) : 0);
    const stacked = oneRow > inner;
    // Shrink-to-fit, per row, off the measured advance. A clip would eat the
    // tail of `SUBJECT BREAKING FOR THE REAR`, which is where the sentence
    // keeps its verb; a smaller size keeps every word.
    const fit = (s, o) => {
      const w = advOf(s, o);
      return w <= inner ? o.s : Math.max(9, Math.floor(o.s * inner / w));
    };
    return { main, sub, stacked, pad: BACK_PAD,
      mo: { ...BACK_MO, s: stacked ? fit(main, BACK_MO) : BACK_MO.s },
      so: { ...BACK_SO, s: stacked ? fit(sub, BACK_SO) : BACK_SO.s },
      rect: { x: PR.x, y: BACK_BANNER_Y, w: PR.w,
        h: stacked ? BACK_BANNER_H2 : BACK_BANNER_H } };
  }
  function backRect(G, f) { const b = backLayout(G, f); return b ? b.rect : null; }
  // Everything that paints over the floor's marker cluster, on THIS frame.
  //
  // ---- THIS LIST IS ENUMERATED. THE LEDGER IS WHAT GUARDS IT. -------------
  // Nothing here is structural: it is six rectangles somebody had to notice,
  // and this round's whole lesson is that enumerating a class by eye is how you
  // miss the member that matters. Four of these came out of the plate ledger's
  // site tally and two came out of reading the file, and the SIXTH — backRect
  // above — was missed by both and then caught by the ledger on the very next
  // bench, at 16 erasures naming `hud.js:1896` in one line.
  //
  // So do not trust this list; trust `_erasures` and `_eraseSites` in
  // ./eval.js's census, which report the file and line of any band that lands
  // on a word. A new band added without a rect here does not fail silently — it
  // fails with its own line number in the report. That is the arrangement this
  // file's INK LEDGER note argues for: not a third copy of the warning, a check
  // that runs.
  function floorKeepOuts(G, f) {
    const out = [];
    if (from('r16')) {
      // ROUND 21: the band's LIVE rectangles, not a transcription of its widest
      // shape. Same object identity the pursuit panel already had — bandCheck()
      // asserts it with ===, so a future copy of `{0,0,W,FLOOR_BAND}` typed back
      // in here fails loudly instead of agreeing until the band moves.
      for (const r of bandRects(G, f)) out.push(r);
      out.push(LOOK_RECT);
      // ROUND 12: the SEVENTH and EIGHTH. The stamp's rotated plate and its
      // sub-line's bar, both off stampLayout(), because the plate ledger caught
      // them painting out `SUBJ-12` at 100%. See the note there — the plate half
      // predates this round and nobody had measured it.
      const SL = stampLayout(f);
      for (const r of [dispatchRect(f), heardRect(f), dialogueRect(f), promptRect(f),
        backRect(G, f), SL && SL.plate, SL && SL.sub]) {
        if (r) out.push(r);
      }
      for (const t of doorTagBoxes(G, f)) out.push(t.rect);
    }
    // Round 15 had this one already; round 17 makes it the LIVE rectangle, so
    // the cluster reserves the panel that is actually going to be painted rather
    // than the widest one it could have been.
    const PR = pursuitRect(G, f);
    if (PR) out.push(PR);
    return out;
  }
  const hits = (y, h, x0, w, R) => !(x0 + w <= R.x || x0 >= R.x + R.w
    || y + h <= R.y || y >= R.y + R.h);
  // ---- ROUND 21: NO KEEP-OUT IS THE CANVAS EDGE ---------------------------
  // Round 20 shipped the subject label typeset off the top of the screen on 34
  // of 500 chase frames (6.8%) — `SUBJ-07` at top -20 to -40, so the marker
  // printed a bracket with no identity, which is the player-visible outcome
  // round 16 existed to fix, arriving by a different road.
  //
  // ONE PREDICATE CAUSES IT, and it is this one. `rowFree` asks whether any
  // keep-out RECTANGLE intersects the row — and the list is six pieces of
  // chrome, none of which is the edge of the canvas. So y = -40 reads FREE,
  // round 16's flip is gated on `!rowFree(above)`, and the flip never fires on
  // exactly the frames the label has left the screen. The label was not losing
  // a fight with a band; nobody had told the test the screen has edges.
  //
  // A row off the top is not free and a row off the bottom is not free. That is
  // the whole fix, in the predicate every caller already goes through, rather
  // than a seventh rectangle in a list whose own comment says not to trust it.
  // `rowBelow` gets the matching half: it resolves DOWNWARD, so it starts from
  // the canvas rather than from wherever the caller's arithmetic landed, and
  // then chains through the bands as before. Deliberately NOT the round-15
  // clamp that regressed 25 -> 261 overprints — that clamp had no keep-out list
  // and parked the label on the DISPATCHED TO panel; this one starts at 0 and
  // then steps out of everything, which is the difference.
  const onCanvasRow = (y, h) => y >= 0 && y + h <= H;
  const rowFree = (y, h, x0, w, ko) => (!from('r21') || onCanvasRow(y, h))
    && !ko.some((R) => hits(y, h, x0, w, R));
  // Push a row down until it is clear of every band. It resolves DOWNWARD for
  // round 15's reason — the bands hang from the ceiling and there is nothing
  // under the lowest of them but floor — and it iterates because clearing the
  // top band can land you on the panel below it. The guard is a loop bound, not
  // a belief: four bands can chain at most four times.
  function rowBelow(y, h, x0, w, ko) {
    let yy = from('r21') ? Math.max(0, y) : y;    // see rowFree: the canvas has edges
    for (let pass = 0; pass < ko.length + 1; pass++) {
      let moved = false;
      for (const R of ko) if (hits(yy, h, x0, w, R)) { yy = R.y + R.h + 4; moved = true; }
      if (!moved) break;
    }
    return yy;
  }
  // ROUND 9. Elements that used to sit inside a panel and now sit on the 3D
  // view need the panel's one load-bearing property back: contrast. A dim grey
  // line over a lit supermarket floor is not a subtle readout, it is an
  // invisible one. This is the ticker's backing plate, made shareable.
  function plate(x, y, w, h, a = 0.86) {
    ctx.fillStyle = `rgba(2,4,3,${a})`; ctx.fillRect(x, y, w, h);
  }
  // ===========================================================================
  // ROUND 12 — THE STAMP'S PLATE WAS NEVER ON ITS TYPE
  // ===========================================================================
  // The client, looking at the screen that reads SUBJECT GONE — [Q] RETURN TO
  // POST: "the box isn't even drawn correctly." It is NOT the prompt band. That
  // one measures, on the real capture, 20.0 / 21.4 px of side padding and
  // 11.6 / 8.9 above and below the ink — level to within 2.7 px. What is wrong
  // is the STAMP hanging over it, and there are two faults with one cause.
  //
  // The plate was `-(s*0.9)` high by `s*1.35` — two guesses at where the type
  // sits, made when the only stamp in the game was one short word. Measured on
  // the shipped frame at s = 38, ascent 28.2 / descent 0.5:
  //
  //     above the caps       6.0 px
  //     below the baseline  16.6 px      <- 32% of the plate, empty
  //
  // So the words are jammed against the top rule and hang over a gutter. That
  // is the fault you see. The second is what the gutter then DOES: the plate is
  // rotated -7 degrees, so its lower-left corner drops by half the plate width
  // times sin 7 PLUS that dead 16.6 — while the sub-line's bar is horizontal at
  // a hardcoded y = 268. On `SUBJECT LOST` the corner lands at y = 274 and has
  // its border chopped. On the 27-character `GUEST COMPLAINT FILED (2ND)` it
  // lands at 294 and THE SUB-BAR IS DRAWN STRAIGHT THROUGH THE STAMP, cutting
  // the bottom rule in half and blacking out the inside of the plate. That is
  // shots/game_r12_stamp_before.png and it is on screen 2.5 s per complaint.
  //
  // ---- AND THE LEDGER IS RIGHT NOT TO SEE IT ------------------------------
  // The plate ledger reports a fill over a GLYPH. What is erased here is a
  // STROKE, which the note at ERASE_ALPHA excludes deliberately and correctly —
  // "a stroke can nick a glyph edge, it cannot paint out a word" — and which
  // ends with "if a stroke ever gets wide enough to erase, this is where it
  // goes." This is that case: the stroke is 4 px and it IS the element. Not
  // widening the ledger for it; a border that gets painted over is a LAYOUT bug
  // and the fix is the layout, exactly as with the FOOTSTEPS banner.
  //
  // Both halves go the same way: measure instead of guessing, and let the
  // caller READ the footprint instead of restating it. 268 was a transcription
  // of a geometry that lives in here, which is CLAUDE.md's opening hazard —
  // correct only while every stamp was short. stamp() returns the bottom of its
  // own rotated, stroked footprint and the sub-line hangs off that number, so a
  // longer stamp pushes its own sub-line down and cannot collide with it.
  const STAMP_LS = 3;
  // The plate a stamp needs, in the stamp's own rotated frame. Split out
  // because stampSpan() needs the same rectangle and a second copy of it is
  // how the 268 happened in the first place.
  function stampBox(text, o = {}) {
    const s = o.s || 40;
    // ROUND 15 (width audit): was a bare `ctx.measureText(text).width + 34`,
    // which is the ORIGINAL bug advance() was written to prevent — the stamp is
    // drawn at ls 3, so the ink is `3 * text.length` px wider than measureText
    // says. Past eleven characters the padding is gone and the plate is narrower
    // than the word on it.
    //
    // ROUND 12: and the ADVANCE is still not the INK. Canvas letter-spacing
    // emits one trailing space after the LAST glyph, and textAlign 'center'
    // centres the advance — so a plate sized and centred on advance() sits
    // STAMP_LS/2 to the right of its own type. 17.05 left, 19.95 right, on the
    // shipped frame. One subtraction here and one nudge at the draw.
    const ink = advance(text, s, 'bold', STAMP_LS) - STAMP_LS;
    // advance() has just set the font, so these are the metrics that will be
    // drawn — same source inkOne() takes its ascent from. The fallback is the
    // old shape's proportions, for an engine without the bounding box.
    let asc = s * 0.74, dsc = s * 0.02;
    try {
      const mm = ctx.measureText(text);
      if (mm && isFinite(mm.actualBoundingBoxAscent)) {
        asc = mm.actualBoundingBoxAscent; dsc = Math.max(0, mm.actualBoundingBoxDescent);
      }
    } catch { /* keep the guess */ }
    // 0.30 each side reproduces the shipped plate height (1.35 s at s = 38)
    // almost exactly — the weight of the element does not change, only where
    // the type sits inside it. This is a centring fix, not a restyle.
    const padY = s * 0.30;
    return { w: ink + 34, h: asc + dsc + padY * 2, top: -asc - padY };
  }
  // The axis-aligned span of a drawn stamp INCLUDING its 4 px frame, in the
  // stamp's own translated frame. One derivation; everything that has to stack
  // under a stamp or step around one reads it.
  function stampSpan(b, rot) {
    const hw = b.w / 2 + 2, y0 = b.top - 2, y1 = b.top + b.h + 2;
    const c = Math.cos(rot), sn = Math.sin(rot);
    let x0 = Infinity, x1 = -Infinity, t0 = Infinity, t1 = -Infinity;
    for (const [cx, cy] of [[-hw, y0], [hw, y0], [-hw, y1], [hw, y1]]) {
      const px = cx * c - cy * sn, py = cx * sn + cy * c;
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < t0) t0 = py; if (py > t1) t1 = py;
    }
    return { x0, x1, t0, t1 };
  }
  // ---- ROUND 12: AND THE PLATE LEDGER FOUND THE OTHER HALF OF IT -----------
  // With the CUT label gone the ledgers went to zero, and then the next bench
  // put them back: 16 erasures and 3 overprints, every one of them the SUBJECT
  // MARKER'S LABEL — `SUBJ-12` at 100% — painted out by the stamp's own plate
  // (hud.js:744) and by the sub-line's bar. The stamp is drawn after the
  // cluster and should win; the label should not be under it in the first
  // place, which is precisely what the RESERVED BANDS block below is for.
  //
  // The stamp's plate rows barely moved this round (-34.2..17.1 became
  // -39.6..11.9, i.e. 5 px up at both ends), so the plate half of this is
  // OLDER than the centring fix and nobody had measured it. The sub-line's bar
  // genuinely did move down — 11 px on SUBJECT LOST, 39 px on the 27-character
  // complaint stamp — so that half is this round's, and both are fixed the same
  // way. Round 16's note is exact about the alternative: a keep-out list is a
  // second copy of a rectangle, so the drawing site READS this rather than
  // restating a y.
  const STAMP_Y = 236, STAMP_S = 38, STAMP_ROT = -7;
  const STAMP_SUB_O = { s: 13, w: 'bold', ls: 1 };
  const STAMP_SUB_GAP = 8;
  function stampLayout(f) {
    if (!f || !(f.stampT > 0) || !f.stampText) return null;
    const b = stampBox(f.stampText, { s: STAMP_S });
    const sp = stampSpan(b, STAMP_ROT * Math.PI / 180);
    const out = {
      plate: { x: W / 2 + sp.x0, y: STAMP_Y + sp.t0, w: sp.x1 - sp.x0, h: sp.t1 - sp.t0 },
      sub: null,
    };
    if (f.stampSub) {
      const sw2 = advOf(f.stampSub, STAMP_SUB_O) + 28;
      const sy = Math.round(STAMP_Y + sp.t1 + STAMP_SUB_GAP);
      out.sub = { x: W / 2 - sw2 / 2, y: sy, w: sw2, h: 22 };
    }
    return out;
  }
  function stamp(text, x, y, o = {}) {
    const s = o.s || 40;
    const rot = (o.rot == null ? -7 : o.rot) * Math.PI / 180;
    const b = stampBox(text, o);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalAlpha = o.a == null ? 0.92 : o.a;
    // Ink plate: the stamp has to read over a lit supermarket floor.
    ctx.fillStyle = 'rgba(3,6,4,0.78)';
    ctx.fillRect(-b.w / 2, b.top, b.w, b.h);
    ctx.strokeStyle = o.c || RED; ctx.lineWidth = 4;
    ctx.strokeRect(-b.w / 2, b.top, b.w, b.h);
    tx(text, STAMP_LS / 2, 0, { s, w: 'bold', c: o.c || RED, a: 'center', ls: STAMP_LS });
    ctx.restore();
    // NOT `ctx.globalAlpha = 1` any more. restore() has already put the
    // caller's fade back, and forcing it to 1 is why the sub-line under the
    // floor stamp popped in at full opacity while the stamp above it was still
    // ramping up — a fade that only applied to half of a two-part element.
  }

  // ------------------------------------------------------------- shared chrome
  const two = (n) => String(n | 0).padStart(2, '0');
  // THE SECOND CLOCK. For five rounds this band read a shift clock forty-three
  // minutes fast off a fixed 08/22/26 — a nice joke about a power outage, and
  // harmless while nothing else on screen printed a time. cctv.js now puts a
  // 766px spot monitor next to it with the recorder's own OSD stamp burnt into
  // it, straight off new Date(). shots/game_r6_before.png has the band saying
  // 08/22/26 14:13:43 and the glass saying 08/23/2026 10:40:01, twenty hours
  // apart, on one desk, in one photograph. Two clocks disagreeing is the roster
  // bug again in a smaller font.
  //
  // The band is the one that moved, because the burn-in is ON THE FOOTAGE and
  // footage is not a thing a terminal gets to overrule. `clockBase` is set once
  // a frame from the live shift clock, so dvrClock(t) is exact wall time for the
  // band and correct RELATIVE time for a log line stamped seconds ago.
  let clockBase = Date.now();
  function wallClock(t) { return new Date(clockBase + t * 1000); }
  function dvrTime(t) {
    const d = wallClock(t);
    return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  }
  function dvrClock(t) {
    const d = wallClock(t);
    return `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()} ${dvrTime(t)}`;
  }
  // ---- WHERE THE GHOST IS ALLOWED TO BE -----------------------------------
  // Ghosts of a channel layout this DVR has not used since 2019. The comment
  // above says the burn-in is ON THE FOOTAGE, and that is not decoration — it
  // decides where it may be drawn. At a fixed (24,700) it landed inside the
  // MOTION ANALYTICS panel, in the empty third roster slot, at 30 px against a
  // 12 px list: shots/critic_cctv_r10.png reads as a half-drawn `CH 04 LIQUOR`
  // roster row cut off by the panel edge, and a critic judging something else
  // entirely stopped to report it as a rendering bug. It is not clipped —
  // baseline 700 with the panel border at 712 — but "is it clipped" was never
  // the question. A ghost sitting in a data panel's row slot reads as a broken
  // row whether or not a pixel is missing.
  //
  // So the desk passes the spot monitor's own rect and the ghost goes on the
  // glass, which is the one surface on that screen that is actually footage and
  // the one place a CRT burn-in belongs. It cannot drift back into a panel,
  // because it is now positioned off the monitor rather than off the canvas.
  // Screens with no glass on them keep the old corner, where nothing is.
  function burnIn(glass) {
    mark('burnIn');
    ctx.globalAlpha = 0.055;
    if (glass && glass.w > 260 && glass.h > 120) {
      mark('burnInGlass');
      tx('CH 04  LIQUOR', glass.x + 18, glass.y + glass.h - 26,
        { s: 26, w: 'bold', c: '#ffffff', ls: 4 });
    } else {
      tx('CH 04  LIQUOR', 24, 700, { s: 30, w: 'bold', c: '#ffffff', ls: 4 });
    }
    tx('REC', 1256, 60, { s: 26, w: 'bold', c: '#ffffff', a: 'right', ls: 4 });
    ctx.globalAlpha = 1;
  }
  // ===========================================================================
  // ROUND 21 — THE BAND YIELDS TO THE MAN
  // ===========================================================================
  // Round 17 moved the pursuit panel off him and argued for leaving this: "the
  // top band is the frame's title bar and a man whose head is off the top of the
  // screen is a man you are on top of; there is nothing to move there."
  //
  // ITS OWN POPULATION REFUTES IT, and my own baseline sweep reproduces that —
  // 6 chases, 389 census frames, oracle driver, the shipped r17 build:
  //
  //     site                       frames  mean   worst  points of the 4.11
  //     hud.js:674  WIND panel        28   33.8%   85.2%   2.43   (59%)
  //     hud.js:1439 THIS BAND          8   60.3%   100%    1.24   (30%)
  //     pursuit:*   the panel          0      —      —     0.00   (round 20 holds)
  //
  // The band is the largest occluder of a man you can still see. It fires at
  // 5.40 m with `vis` 1.0 — the whole man on canvas, at the range PROMPT.md's
  // second bar is written about — and it is 52 px of title strip carrying REC, a
  // store name and a wall clock. NONE OF IT CHANGES DURING A CHASE.
  //
  // ---- AND WHAT MY OWN INSTRUMENT SAYS AGAINST THAT ------------------------
  // Published next to the headline rather than under it. The three worst band
  // frames in that sweep read 98.3 / 100 / 100 percent at `vis` 0.263 / 0.116 /
  // 0.009 — a man who is 74%, 88% and 99% off the TOP of the screen, with the
  // band standing on the sliver that is left. Under the corrected denominator
  // (see coverOf) those are 25.9 / 11.6 / 0.9 percent, and the band's real
  // remaining bite is the 28-30% it takes on the `vis` 0.48-1.0 frames beside
  // them. The defect is smaller than round 20's critic measured it and it is
  // still the biggest one left; both halves are the finding.
  //
  // ---- THE FIX IS THE ROUND'S OWN LEVER, APPLIED ONE ELEMENT ALONG ---------
  // Not a shrink — a 26 px strip across his head is the same defect at half
  // price. The band keeps every word and gives up the AREA BETWEEN THEM: two
  // chips sized by advOf() off the strings they hold, at the two ends where the
  // strings already were, and 778 px of open canvas across the middle where his
  // head is. Same shape as the panel's tight slot, same trigger units (the
  // fraction of his silhouette the FULL band would take), same hysteresis.
  //
  // The 1 px rule at the foot of the band stays full width and is deliberately
  // not exempted from the ledger: it is the line that still reads as a title bar
  // when the fill is gone. ITS WHOLE MEASURED COST, quoted rather than argued
  // away — 3 shifts x 240 s, 7,200 census frames, 142,143 strings, 114,098
  // plates:
  //
  //     chrome statistic          0.3% of him on the frames the band is chipped
  //     plate ledger              1 erasure, `9.5% "SUBJ-11" by hud.js:1696`
  //
  // One label in 7,200 frames loses a twentieth of its glyph box to a hairline.
  // The fix for that would be to reserve the rule as a keep-out, which pushes
  // every label below y 56 and hands back the 778 px of free top-of-frame this
  // round just bought — a bad trade for one erasure, made explicitly rather than
  // by not looking.
  //
  // ---- ONE OWNER, AND AN ASSERTION THAT SAYS SO ---------------------------
  // CLAUDE.md opens with this file's hand-copied camera rig, "correct only while
  // the camera never moved and held in sync purely by coincidence". A band that
  // paints two rectangles while floorKeepOuts() reserves one is that bug exactly.
  // So bandRects() is the only place the shape exists, the drawing site iterates
  // what it returns, floorKeepOuts() and doorTagBoxes() push THE SAME OBJECTS,
  // and bandCheck() asserts both — the painted rectangles against the live plate
  // ledger, and the reserved ones by `===` identity, which is what fails when
  // somebody types `{0,0,W,FLOOR_BAND}` back in rather than calling this.
  //
  // ---- AND THE RESIDUAL THE FIRST CUT LEFT, MEASURED AND THEN PAID --------
  // Chips alone took the band from 0.87% of him to 0.17% over 602 matched
  // frames, and the leftover is a shape: 16 of those 602 frames (2.7%) have him
  // at the far LEFT or far RIGHT of frame, x0 20-155 or 1094-1128, i.e. UNDER A
  // CHIP. Worst 11.7% at 3.42 m on CONTACT with 81% of him on canvas — the same
  // defect as the strip, in a tenth of the area.
  //
  // So the chips yield too, and the thing they give up is the thing that does
  // not change: the left chip drops the unit name (a constant, and it is on the
  // desk screen as well) and keeps the blinking REC; the right chip drops the
  // DATE and keeps the running time. Same trigger shape as the band's, tested
  // against the FULL chip rectangle in both directions so the hysteresis has one
  // frame of reference.
  const BAND_ON = 0.06, BAND_OFF = 0.02;    // TIGHT_ON/TIGHT_OFF, same units
  const CHIP_ON = 0.03, CHIP_OFF = 0.01;
  const BAND_LO = { s: 14, w: 'bold', ls: 2.2 };
  const BAND_CO = { s: 16, w: 'bold', ls: 1.4 };
  const BAND_PIP_O = { s: 11, w: 'bold', ls: 0.8 };
  // The floor screen's own title. It is a constant and the chips are sized off
  // it, so it lives here rather than at the call site: a chip measured from one
  // string and painted under another is this file's hand-copied camera rig in
  // its cheapest form. Chip mode exists on the floor only — the desk band and
  // the outro band never see a fleeing man.
  const FLOOR_LABEL = 'ON FOOT — UNIT 1';
  let bandTight = false, minL = false, minR = false, brCache = null, brFrame = -1;
  // What each chip actually says. ONE OWNER for the string as well as the box —
  // the chip is sized from exactly the string the drawing site prints, so the
  // two cannot drift the way a chip measured off one label and painted with
  // another would.
  // They take the RECTANGLE LIST, not the module state, because the drawing site
  // must print what bandRects() actually returned for THIS render. The `r17`
  // ablation returns the full strip and carries no flags, and reading module
  // state here would have let the shipped layout's hysteresis reach into the
  // before it is being compared against.
  const bandLabel = (R) => (R && R.minL ? '' : FLOOR_LABEL);
  const bandClock = (G, R) => (R && R.minR ? dvrTime(G.st.clock) : dvrClock(G.st.clock));
  // The two chips, derived from the strings that are about to be drawn into
  // them. The label starts at x 82 and the clock is right-aligned at W-14; both
  // numbers are read from the drawing site below rather than restated.
  function bandChips(G, wantMinL, wantMinR) {
    const h = FLOOR_BAND;
    const lbl = wantMinL ? '' : FLOOR_LABEL;
    // With no label the chip has to hold the REC blip (centred x 24) and the
    // word REC (x 36), and nothing else.
    let lw = lbl ? 82 + advOf(lbl, BAND_LO) + 12 : 36 + advOf('REC', { s: 12, w: 'bold', ls: 1.6 }) + 12;
    // The complaint pips ride this band on the floor (see the drawing site) and
    // they are the one thing on it that DOES change during a shift, so they
    // cannot be dropped. They are at x 300 and their sentence runs from 344, so
    // when they are up the left chip grows to hold them rather than leaving
    // three red squares floating on the shelving with no plate under them —
    // and it cannot go minimal either, which is why `minL` is gated on them.
    if (G.st.complaints > 0) {
      lw = Math.max(lw, 344 + advOf(`${G.st.complaints}/3 COMPLAINTS`, BAND_PIP_O) + 10);
    }
    const clk = wantMinR ? dvrTime(G.st.clock) : dvrClock(G.st.clock);
    const cw = advOf(clk, BAND_CO) + 26;
    return [{ x: 0, y: 0, w: lw, h }, { x: W - cw, y: 0, w: cw, h }];
  }
  // ONE OWNER, MEMOISED PER FRAME — pursuitRect()'s note applies verbatim: the
  // hysteresis is state, and three callers in one frame would step it three
  // times. `renderSeq` is bumped once in render().
  function bandRects(G, f) {
    if (brFrame === renderSeq) return brCache;
    brFrame = renderSeq;
    const full = [{ x: 0, y: 0, w: W, h: FLOOR_BAND }];
    if (!pursuitUp(f) || !G.cop) {
      bandTight = minL = minR = false; brCache = full; return full;
    }
    // THE ABLATION MUST NOT MOVE THE SHIPPED STATE. `hud.bands('r17')` renders
    // the executable before, and a `bandTight = false` on this path would mean
    // that measuring the old layout resets the new one's hysteresis — so a frame
    // sitting between BAND_OFF and BAND_ON would come back full-width after
    // every A/B call, and the instrument would be changing the artefact it
    // measures. That is snap()'s step(0) in a different costume, and subjCheck()
    // renders the r16 layout on every census frame now. So the before returns
    // the full strip and touches nothing.
    if (!from('r21')) { brCache = full; return full; }
    // Idempotent: the trigger is a pure function of this frame, so the extra
    // renders the instruments take re-apply the same threshold to the same
    // value and cannot walk the hysteresis.
    const sb = subjectBox(G, f);
    const on = boxOn(sb, full[0]);
    if (!bandTight && on >= BAND_ON) bandTight = true;
    else if (bandTight && on <= BAND_OFF) bandTight = false;
    if (!bandTight) { minL = minR = false; brCache = full; return full; }
    // Second stage. Both tests are taken against the FULL chip rectangle, in
    // both directions, so the hysteresis has one frame of reference and a chip
    // cannot oscillate by changing the box its own test is run against.
    const F2 = bandChips(G, false, false);
    const lo = boxOn(sb, F2[0]), ro = boxOn(sb, F2[1]);
    if (!minL && lo >= CHIP_ON) minL = true; else if (minL && lo <= CHIP_OFF) minL = false;
    if (!minR && ro >= CHIP_ON) minR = true; else if (minR && ro <= CHIP_OFF) minR = false;
    if (G.st.complaints > 0) minL = false;    // the pips need their plate
    brCache = bandChips(G, minL, minR);
    brCache.minL = minL; brCache.minR = minR;   // carried ON the array, so there
    return brCache;                             // is one return value and one owner
  }
  function topBand(G, h, label, rects) {
    mark('band');
    const t0 = plateTag;
    // Tagged, so the census can name this element instead of matching a line
    // number out of a site string — which is how round 20's chrome statistic
    // came to be 73% one panel nobody had named.
    plateTag = 'band';
    const R = rects || [{ x: 0, y: 0, w: W, h }];
    if (R.length > 1) mark('bandYield');
    ctx.fillStyle = 'rgba(2,4,3,0.93)';
    for (const r of R) ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = LINE; ctx.fillRect(0, h - 1, W, 1);
    const blink = (G.now % 1) < 0.6;
    if (blink) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(24, h / 2 - 5, 5.5, 0, 7); ctx.fill(); }
    tx('REC', 36, h / 2 - 1, { s: 12, w: 'bold', c: blink ? RED : RED_D, ls: 1.6 });
    // The strings come off the same two functions the chips are SIZED from, so a
    // chip measured for `HH:MM:SS` can never be printed with the date in it.
    const lbl = rects ? bandLabel(rects) : label;
    if (lbl) tx(lbl, 82, h / 2 - 1, { ...BAND_LO, c: AMB });
    tx(rects ? bandClock(G, rects) : dvrClock(G.st.clock), W - 14, h / 2 - 2,
      { ...BAND_CO, c: GRN, a: 'right' });
    plateTag = t0;
  }
  // ---- ROUND 9: THE STATUS ROW ATE A PANEL --------------------------------
  // What used to be here: `16-CH DVR / 9 CH ACTIVE / MOTION ANALYTICS: ON`,
  // which never changes and which no player has ever done anything about, and
  // `SHIFT 2ND · 04:12 ELAPSED`, which is a SECOND CLOCK on a screen whose own
  // note four rounds ago was about two clocks disagreeing. Both deleted.
  //
  // What is here instead is the OFFICER — BADGE 1 panel, which was 330x88 px of
  // permanent real estate at 100% duty cycle carrying three facts that change
  // between zero and three times in a shift: your rank, your points, and your
  // complaints. Rank and points do not alter one decision the player is about
  // to make at this desk. They are a record, so they get a line, not a panel.
  //
  // AND THE PIPS ARE ONLY THERE ONCE YOU HAVE ONE. A clean record shows
  // nothing at all, which is the whole idea: the first time a red square
  // appears on this row it means something, because the row was empty a second
  // ago. Three grey squares that are grey all shift teach the player to stop
  // seeing that corner of the screen, and then the third one lands unnoticed.
  function statusRow(G, y) {
    mark('bandRow2');
    const adv = (str) => advance(str, 11, 'bold', 1);
    let x = 82;
    tx(G.rankName, x, y, { s: 11, w: 'bold', c: AMB, ls: 1 });
    x += adv(G.rankName) + 14;
    tx(`${G.st.points} PTS`, x, y, { s: 11, c: DIM });
    x += adv(`${G.st.points} PTS`) + 16;
    if (G.st.complaints > 0) {
      mark('complaintPips');
      for (let i = 0; i < 3; i++) {
        const on = i < G.st.complaints;
        ctx.fillStyle = on ? RED : 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + i * 13, y - 9, 9, 9);
        box(x + i * 13, y - 9, 9, 9, on ? RED : LINE);
      }
      tx(`${G.st.complaints}/3 COMPLAINTS`, x + 44, y, { s: 11, w: 'bold', c: RED, ls: 0.8 });
    }
  }
  // ---- ROUND 9: ONE ALARM, AND IT DOES NOT FLASH --------------------------
  // The client: "the flashing red bar that happens at the top ... is obnoxious
  // and too much." He is right twice over. It was full-width, it strobed at
  // 1.1 Hz, and it was LIT 40.5% OF AN IDLE SHIFT (censused this round; round 7
  // had it at 52% under the old pacing). Something that is on half the time
  // cannot be an alarm, and something that strobes cannot be ignored, so the
  // player was being made to fight it several times a minute for nothing.
  //
  // game.js deleted every soft source. What arrives here now is one thing: a
  // man in the doorway and the seconds until he is through it. It is drawn as a
  // CHIP in the status row — sized to its own sentence, on the row that was
  // already carrying status, with no animation whatsoever. It has to earn
  // attention by APPEARING on a row that is otherwise calm, which is the only
  // way an alert works on a screen that is up for four minutes at a time.
  //
  // The countdown is the loud part, because the countdown is the part that
  // expires. It brightens under three seconds instead of the whole plate
  // blinking, which reads as urgency without reading as a fault light.
  function alarmChip(G, y) {
    const a = G.alarm; if (!a) return;
    mark('alarm'); mark(a.count != null ? 'alarmHard' : 'alarmSoft');
    const cd = a.count != null ? `T-${a.count.toFixed(1)}s` : '';
    const label = `▲ ${a.text}`;
    const hot = a.count != null && a.count < 3;
    const wLbl = advance(label, 12, 'bold', 0.9);
    const wCd = cd ? advance(cd, 12, 'bold', 0.9) + 16 : 0;
    const w = wLbl + wCd + 22;
    const x = W - 14 - w;
    ctx.fillStyle = 'rgba(58,10,7,0.95)'; ctx.fillRect(x, y - 13, w, 18);
    box(x, y - 13, w, 18, hot ? RED : RED_D);
    ctx.fillStyle = hot ? RED : RED_D; ctx.fillRect(x, y - 13, 3, 18);
    tx(label, x + 10, y, { s: 12, w: 'bold', c: RED, ls: 0.9 });
    if (cd) tx(cd, x + w - 8, y, { s: 12, w: 'bold', c: hot ? '#ffd9d3' : RED, a: 'right', ls: 0.9 });
  }
  // ==========================================================================
  // ROUND 11 — THIS ELEMENT HAS BEEN DRAWING THREE LINES AND SHOWING ONE
  // ==========================================================================
  // Found by writing a two-line beat for the ticker (game.js's Dale M. block)
  // and reading the capture back: the second line was 60% behind the MOTION
  // ANALYTICS panel and the third was entirely behind it. The arithmetic is
  // unambiguous once you look — the desk calls this at y=616 with 15 px
  // leading, so the baselines are 616 / 631 / 646, and the roster panel is
  // drawn AFTER it starting at y=624. On the floor it is worse and quieter:
  // baselines 700 / 715 / 730 on a canvas that is 720 tall, so the third line
  // has never been on screen at all.
  //
  // Two lines a frame, in both modes, painted under furniture or off the
  // bottom of the world, for as long as this function has existed. That is not
  // a layout to fix by moving something — the roster is the thing you read and
  // the canvas is the size it is — it is ink to stop spending, which is what
  // rounds 9 and 10 were about.
  //
  // So the caller says where the floor of its space is and this counts how
  // many baselines actually fit above it, with 4 px of descender margin.
  // Derived rather than passed as a literal, so a layout that moves gets the
  // right answer instead of an out-of-date comment: desk 1, floor 2 today.
  //
  // AND IT IS A CONSTRAINT ON THE WRITING, which is the more valuable half.
  // Anything that needs two log lines to land does not land. See the note at
  // L.MANAGER_PA, which was two lines until this measurement and is one now.
  const TICK_LEAD = 15;
  function ticker(G, x, y, w, back, bottom) {
    // Last few system log lines, newest first, fading out. Bottom of the wall.
    if (!G.log.length || G.now - G.log[0].t > 8) return;
    mark('ticker');
    if (back) { ctx.fillStyle = 'rgba(2,4,3,0.86)'; ctx.fillRect(x - 8, y - 12, w + 16, 16); }
    const fits = bottom == null ? 3
      : clampN(Math.floor((bottom - y - 4) / TICK_LEAD) + 1, 1, 3);
    for (let i = 0; i < Math.min(fits, G.log.length); i++) {
      const e = G.log[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, (8 - (G.now - e.t)) / 2.5)) * (1 - i * 0.28);
      tx(`${dvrTime(e.clock)}  ${e.text}`, x, y + i * TICK_LEAD,
        { s: 11, c: e.bad ? RED : DIM, max: w });
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ DESK
  function drawDesk(G) {
    const tiles = G.tiles;
    // ------------------------------------------------------------------------
    // PER-TILE OVERLAY, RESIZED FOR A BANK OF MOTION DETECTORS
    // ------------------------------------------------------------------------
    // These rects used to be 190-416 px wide and this overlay was written for
    // that. Round 4 demoted them to 138x104 and everything here became furniture
    // sitting on the picture: a `0 SUBJ` badge fifty pixels wide is 36% of the
    // tile, the active tile's 15px amber footer plus 16px corner brackets left a
    // 106px-wide hole to see an aisle through, and the `[7]` key hint duplicated
    // a channel number cctv.js already burns into the top-left corner AND the
    // one silkscreened on the chin below.
    //
    // The bank's job is now "something moved over there". Everything that is not
    // that comes off. What survives, and why:
    //   ACTIVE FRAME  which monitor the spot is showing. Non-negotiable.
    //   FLAG PIP      a blinking square in the top-right corner, where cctv.js
    //                 used to burn a REC dot and no longer does. It replaces a
    //                 44px word. It is still guilt-blind: traps flag too.
    // Sizes are derived from the rect, so a wall that changes again scales.
    //
    // ---- ROUND 10: `small` IS GONE, AND THE DOOR TILE IS WHY ----------------
    // Round 9 kept a second, heavier overlay behind `t.w < 200` — a full-width
    // amber footer naming the channel, and the word FLAG in a 44px plate — on
    // the reasoning that a large panel has room for a label. cctv.js then
    // rebuilt the wall as a map: eight 142x80 aisle tiles in world-X order, and
    // the DOOR on its own 320x180 panel. 320 is not "small", so the heavy
    // branch landed on the second most important picture in the room. See
    // shots/game_r10_before_door.png: select channel 9 and a solid amber bar
    // sits across the bottom of the doorway, over the mat, which is the exact
    // strip of pixels where you find out whether he is through it. Under a chin
    // that already reads CH09, beside a spot monitor whose own OSD already
    // reads CAM 09 DOOR 1.
    //
    // So there is one overlay now and every tile gets it. The premise of the
    // branch was never true anyway: a bigger picture is a better picture to
    // leave alone, not a bigger canvas to write on.
    tiles.forEach((t, i) => {
      if (!t) return;
      reg('cam', t.x, t.y, t.w, t.h, i);
      const subs = G.desk.subjects.filter((s) => s.cam === i);
      // The pip fires on the subject's PRIMARY channel only — see updateSubjects.
      // A man in the middle of the store is genuinely on four monitors and gets
      // four rows, but only one of them is the one to switch to.
      const flagged = subs.some((s) => s.flagged && s.primary !== false);
      // ROUND 9. Blink is for a flag that has JUST appeared; see stampFlag()
      // in game.js. Censused at 1.8 of nine monitors carrying a pip at any
      // instant of an idle shift, at least one lit 89% of the time — a light
      // that waves at you nine tenths of a shift is the alarm bar again with a
      // smaller footprint. The pip itself is the pointer and it stays; what it
      // stops doing is moving, except in the three seconds where the movement
      // is reporting a change rather than restating a state.
      const fresh = subs.some((s) => s.fresh && s.primary !== false);
      const act = i === G.desk.cam;
      box(t.x, t.y, t.w, t.h, act ? AMB : 'rgba(120,170,130,0.16)', act ? 2 : 1);
      if (act) {
        const k = Math.max(7, Math.min(16, t.w * 0.085));
        ctx.strokeStyle = AMB; ctx.lineWidth = 2;
        [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(([cx, cy, sx, sy]) => {
          const px = t.x + cx * t.w, py = t.y + cy * t.h;
          ctx.beginPath(); ctx.moveTo(px + sx * k, py); ctx.lineTo(px, py);
          ctx.lineTo(px, py + sy * k); ctx.stroke();
        });
      }
      if (flagged) mark('pipTiles');
      if (fresh) mark('pipFresh');
      if (flagged && (!fresh || (G.now % 0.8) < 0.5)) {
        // Scaled off the rect for the same reason the brackets are: a 7px
        // square is a pip on 142px of glass and a speck on 320.
        const p = Math.max(7, Math.round(t.w * 0.045));
        ctx.fillStyle = fresh ? RED : '#c3382c';
        ctx.fillRect(t.x + t.w - p - 4, t.y + 4, p, p);
      }
    });
    // The spot monitor is cctv.js's panel and its chrome, but it is the thing the
    // player is looking at, so clicking it has to do something. It steps the PTZ
    // lock to the next subject on this channel — the same thing [C] does.
    const spot = G.spot;
    if (spot) reg('track', spot.x, spot.y, spot.w, spot.h, 1);

    topBand(G, 74, 'CHOP FOODS #4417  ·  LOSS PREVENTION TERMINAL');
    // The status row and the one remaining alarm share the band. Neither of
    // them covers a feed, which is the rule the old full-width bar was written
    // to obey and then broke by being on half the time anyway.
    statusRow(G, 60);
    alarmChip(G, 60);
    const by = 624, bh = 88;
    // `by` is where the roster panel starts and the panel is drawn after this,
    // so that is the floor of the ticker's space. See the note on ticker().
    ticker(G, 14, 616, 700, true, by);

    // --- analytics roster
    // ROUND 9: this starts at x=10 now, in the 330 px the OFFICER panel was
    // holding. The width buys 300 px of behaviour text, which is the ONE thing
    // on this desk the player has to read word by word — round 8 clipped it at
    // 306 px with an ellipsis, on a 12 px monospace, as the price of a panel
    // that printed a number nobody acts on.
    const ax = 10, aw = 896;
    const cam = G.cams[G.desk.cam];
    mark('roster');
    // ONE CHANNEL PER AISLE, so the header names the aisle and stops there.
    // `CAM 03 / AISLE 3` was the same number twice as soon as config.js made
    // channel N aisle N, and `CAM 04 / AISLE 7-8` — which is what it said last
    // round — was the thing the client asked to have taken away.
    panel(ax, by, aw, bh, `MOTION ANALYTICS — ${cam?.label || cam?.id || 'CAM'}`);
    const all = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
    const top = Math.min(G.desk.scroll || 0, Math.max(0, all.length - 3));
    const subs = all.slice(top, top + 3);
    if (!subs.length) {
      mark('rosterEmpty');
      tx('NO SUBJECTS IN FRAME.', ax + 12, by + 44, { s: 13, c: DIM });
      tx('ANALYTICS IS STILL BILLED MONTHLY.', ax + 12, by + 64, { s: 11, c: 'rgba(131,165,140,0.5)' });
    }
    // The window is three rows deep because three rows is what fits. Say so,
    // and give the rest of the list somewhere to be — a hidden row used to mean
    // the analytics had flagged somebody the terminal would never show you.
    if (all.length > 3) {
      const more = all.length - top - 3;
      reg('scroll', ax + aw - 96, by + 1, 92, 15, more > 0 ? 1 : -(top || 0));
      tx(more > 0 ? `▼ ${more} MORE  [↓]` : `▲ TOP  [↑]`, ax + aw - 8, by + 12,
        { s: 10, w: 'bold', c: AMB, a: 'right', ls: 0.6 });
    }
    subs.forEach((s, i) => {
      const ry = by + 22 + i * 22, sel = G.desk.sel === s.id;
      reg('subj', ax + 4, ry, aw - 8, 21, s.id);
      if (sel) {
        ctx.fillStyle = 'rgba(255,180,58,0.20)'; ctx.fillRect(ax + 4, ry, aw - 8, 21);
        ctx.fillStyle = AMB; ctx.fillRect(ax + 4, ry, 4, 21);
      }
      tx(sel ? '▶' : ' ', ax + 11, ry + 15, { s: 12, w: 'bold', c: AMB });
      tx(s.code, ax + 24, ry + 15, { s: 12, w: 'bold', c: sel ? AMB : GRN });
      // He is on more than one monitor. Worth two characters, because a second
      // angle on a man you cannot read is the cheapest thing this desk sells.
      if (s.chans > 1) tx(`·${s.chans}`, ax + 84, ry + 15, { s: 11, c: GRN_D, ls: 0 });
      // ROUND 9 — THE WHERE COLUMN ONLY SPEAKS WHEN IT DISAGREES.
      // With one channel per aisle, `A3` under a panel titled AISLE 3 is the
      // header restated on every row. It is worth real ink in exactly one
      // case: the man is on a cross-aisle, i.e. he can be seen from this
      // camera but he is NOT in the aisle it is named after — which is also
      // the case where dispatch is about to send you somewhere else.
      const where = shortWhere(s, G.cams[s.cam]);
      if (where) { mark('rowWhere'); tx(where, ax + 100, ry + 15, { s: 12, w: 'bold', c: AMB }); }
      mark('rosterRow');
      // A row for a man no camera can currently see. He is in one of this
      // store's blind spots — 13% of subject-seconds are — and the last channel
      // that had him is the last channel that had him, which is a different
      // claim from "he is in this picture". The behaviour text goes with the
      // signal, because everything in that column is something a motion
      // detector reported and no detector is reporting anything.
      //
      // The FLAG does not go with it. Losing the picture does not un-log the
      // event: a recorder that dropped its alarm the moment a man stepped behind
      // an end-cap would be worse than useless, and the player would watch his
      // one open case turn into a beige row for no reason he could see. So the
      // row stays red and stays the one you are chasing; it just stops
      // pretending to know what he is doing right now.
      const lx = ax + 152, lw = aw - 152 - 116;
      if (s.running) {
        // ROUND 9 — WHERE THE ALARM BAR WENT.
        // A man who has broken into a run has no behaviour left to report: the
        // analytics text is about somebody browsing and he is not browsing. So
        // his row becomes the thing the deleted bar used to shout — how much
        // of his run to the way out is left — attached to the man it is about,
        // on the channel he is on, in the list the player is already reading.
        // Guilt-blind by construction: 'bolt' and 'react' are a body sprinting
        // through the middle of the picture, not a hidden flag. A DRIFTING
        // thief, who is the whole reading puzzle, still gets a behaviour line
        // like everybody else.
        mark('rowRunning');
        tx(s.toDoor != null ? `RUNNING — ${Math.round(s.toDoor)} M FROM THE DOOR` : 'RUNNING',
          lx, ry + 15, { s: 12, w: 'bold', c: RED, max: lw });
      } else if (s.pa) {
        // ROUND 10 — THE ANNOUNCEMENT'S WHOLE READOUT, and it is not a panel.
        // The floor gets a chip because the floor has no list. This is a list
        // of sentences about what bodies are doing, and what this body just
        // did is answer a PA — so the line is replaced for three seconds and
        // then the row goes back to being a row. Every man in earshot gets one,
        // which is the bystander footnote shown instead of counted.
        //
        // Amber rather than red on a flagged row, deliberately: a reaction is
        // not a flag. It is the one thing on this desk the player asked for by
        // pressing a key, and it reads as an answer to that key.
        mark('rowPA');
        tx(s.pa, lx, ry + 15, { s: 12, w: 'bold', c: AMB, max: lw });
      } else if (s.lost > 0) {
        ctx.globalAlpha = s.flagged ? 0.8 : 0.55;
        tx(`SIGNAL LOST — LAST SEEN ${s.lost.toFixed(1)}s`, lx, ry + 15,
          { s: 12, c: s.flagged ? RED : AMB, max: lw, w: s.flagged ? 'bold' : '' });
        ctx.globalAlpha = 1;
      } else {
        tx(s.line, lx, ry + 15,
          { s: 12, c: s.flagged ? RED : (sel ? '#e9f6ec' : DIM), max: lw, w: s.flagged ? 'bold' : '' });
      }
      if (s.held) {
        ctx.fillStyle = 'rgba(255,227,106,0.16)'; ctx.fillRect(ax + aw - 96, ry + 3, 44, 15);
        tx('HOLD', ax + aw - 92, ry + 15, { s: 10, w: 'bold', c: '#ffe36a' });
      }
      tx(`${two(s.dwell / 60)}:${two(s.dwell % 60)}`, ax + aw - 12, ry + 15,
        { s: 11, c: DIM, a: 'right' });
    });

    // --- dispatch + the PA
    const dx = 914, dw = 356;
    const sel = G.desk.subjects.find((s) => s.id === G.desk.sel);
    const can = sel && (sel.post || sel.aisle != null);
    mark('dispatch'); mark(can ? 'dispatchArmed' : 'dispatchIdle');
    panel(dx, by, dw, bh, 'DISPATCH', { accent: can ? AMB : '#4d5f52' });
    // ROUND 9: `POST UNMANNED` used to sit here in red on the title row, on
    // every frame a row was selected — which is 82% of a competent player's
    // desk time. It is a good line and it is not information: nothing the
    // player can do makes it go away, and a permanent red string next to a
    // blinking red flag pip is two reds competing to be the one that matters.
    // The joke still lands where it is actually true — the write-up header
    // opens DO NOT LEAVE POST (POST IS ALREADY UNMANNED) — and the dispatch
    // radio chatter says LEAVING POST. POST IS UNMANNED. NOTED.
    if (can) {
      const hot = (G.now % 1.1) < 0.75;
      const bw = 212;
      reg('dispatch', dx + 8, by + 22, bw, 40, sel.aisle);
      ctx.fillStyle = hot ? AMB : AMB_D; ctx.fillRect(dx + 8, by + 22, bw, 40);
      const dest = sel.where || `AISLE ${sel.aisle + 1}`;
      tx('▶ DISPATCH', dx + 8 + bw / 2, by + 41, { s: 15, w: 'bold', c: '#07100a', a: 'center', ls: 1.4 });
      tx(dest, dx + 8 + bw / 2, by + 57, { s: 13, w: 'bold', c: '#07100a', a: 'center', ls: 1.2, max: bw - 12 });
      paCost(G, dx + 12, by + 78, dw - 24, ['dispatch', 'roster', 'pa', 'track']);
    } else {
      tx('SELECT A SUBJECT ROW', dx + 12, by + 42, { s: 14, w: 'bold', c: '#6f8a77', max: 212 });
      // ONE CHANNEL PER AISLE, said in the only place it needs saying: the key
      // you press IS the aisle number over the shelving. Derived, so a wall
      // that grows a channel cannot make this line a lie.
      const nA = G.cams.filter((c) => /AISLE/.test(c.label || '')).length || G.cams.length;
      tx(nA < G.cams.length ? `[1]-[${nA}] AISLE  ·  [${nA + 1}] DOOR` : `[1]-[${nA}] CHANNEL`,
        dx + 12, by + 62, { s: 11, c: '#5d7364', max: 212 });
      paCost(G, dx + 12, by + 78, dw - 24, ['roster', 'pa', 'track']);
    }
    // ---- ROUND 8: THE PA BUTTON LIVES OUTSIDE THE `if (can)` -----------------
    // It used to be drawn inside the branch above, i.e. ONLY WHEN A SUBJECT ROW
    // WAS SELECTED. Press [F] with nothing selected — which game.js explicitly
    // supports and calls "both correct and funnier", because a PA is a
    // microphone — and the channel opened, audio.js took the capture device,
    // the browser lit its recording dot, and there was NOTHING WHATSOEVER on
    // screen about it. No button, no ON AIR, no level meter. That is the most
    // literal available reading of the client's "it looks like it's recording,
    // but it doesn't do anything", and it was mine.
    //
    // One handset, one readout, drawn on every frame the desk is up. What it
    // says varies; whether it is there does not.
    holdBtn(G, dx + 230, by + 22, dw - 238, 40);
    burnIn(G.spot);
  }

  // ==========================================================================
  // ROUND 9 — THE LEGEND ERODES
  // ==========================================================================
  // Round 8's version of this line had to describe the two PA clocks, because
  // it was the only place that could. That is no longer true: the button two
  // rows up says ON AIR / PRICE CHK / MIC ONLY / 3s RECHARGING in its own
  // colours on every frame, which is where a STATE belongs. What is left for a
  // hint row is the one thing a state readout cannot do, which is tell a
  // player who has never pressed [F] that [F] exists.
  //
  // That is a job with an end. Each clause below names a key the player has
  // not used yet; game.js flips the flag the first time he presses it (see
  // `taught`), the clause goes, and when the last one goes so does the row.
  // Measured at 100% of desk frames before this; a legend for a six-key game
  // does not get to be permanent furniture on top of a roster you have to read
  // word by word.
  //
  // NOT ERODED, deliberately: anything that reports what is happening rather
  // than what a key is called. The PA button's four words, WIND's KEY HELD —
  // NO RECOVERY, and the stand-down prompt's [Q] all stay forever, because a
  // player who has learned a key has not thereby learned the state it is in.
  function keyRow(G, x, y, w, want, opt) {
    const t = G.taught || {};
    const H2 = G.hold || {};
    const parts = [];
    for (const k of want) {
      if (t[k]) continue;
      if (k === 'dispatch') parts.push('[SPACE] DISPATCH');
      else if (k === 'roster') parts.push('[↑/↓] ROSTER');
      else if (k === 'track') parts.push('[C] TRACK');
      else if (k === 'pa') parts.push(H2.can ? '[F] HOLD TO TALK' : '[F] PA');
      else if (k === 'sprint') parts.push('[SHIFT] SPRINT   [WASD] MOVE');
      else if (k === 'post') parts.push('[Q] RETURN TO POST');
    }
    if (!parts.length) return false;
    mark((opt && opt.mark) || 'deskKeyHint');
    if (opt && opt.plate) {
      const str = parts.slice(0, 2).join('   ');
      plate(x - 6, y - 12, advance(str, 11, '', 0.7) + 12, 17);
    }
    // TWO AT A TIME. Four clauses is 58 characters and this row is 45 wide, so
    // the old line ellipsed at `[F] HOLD T…` — a hint that names a key and then
    // cuts the key off. The list is in the order a player needs them, and the
    // third only appears once the first has been learned, which is also how
    // somebody would teach it out loud.
    tx(parts.slice(0, 2).join('   '), x, y, { s: 11, c: '#5d7364', max: w });
    return true;
  }

  // ---- ROUND 10: WHAT THE PA WOULD COST, ON THE ROW THE LEGEND VACATES ----
  // The only line of new ink this round, and it is drawn on the row above:
  // round 9's legend deletes each clause the first time its key is pressed, so
  // within about thirty seconds this strip of the dispatch panel is empty on
  // every frame forever. That makes it the right home for something the player
  // is told once — it competes with nothing, because there is nothing there.
  //
  // WHAT IT IS ABOUT. The handset is pointed at a FLAGGED row, which is the one
  // configuration where pressing it costs something: the box has already
  // flagged this man, DISPATCH is armed on him, and this file's own bench
  // measured a bot that announces at the tells it has read instead of walking
  // at them at 307 points a shift against 373 for the identical reads
  // (./game/eval.js, `tattle` vs `observer`, 8x240s; 251 vs 397 at 5x240s).
  // The line does not say any of that — the DVR does not know about points and
  // would not editorialise if it did. It says the fact the terminal knows.
  //
  // AND IT IS SAID ONCE PER SESSION. Drawn on every frame the predicate held it
  // censused at 63.1% of desk frames, and stamping it per aim-landing measured
  // the same 59% because the aim does not sit still. game.js's tickCost() puts
  // it on the same footing as the key legend — teaching, spent once, 0.2% —
  // and hands the permanent half to the button's colour. See the note there.
  //
  // The legend gets the row on every other frame, so nothing round 9 measured
  // is undone: this can only draw over an empty strip, or over a hint the
  // player has not needed since his first dispatch.
  function paCost(G, x, y, w, want, opt) {
    const cost = (G.hold || {}).annCost;
    if (!cost) return keyRow(G, x, y, w, want, opt);
    mark('paCost');
    tx(cost, x, y, { s: 11, w: 'bold', c: '#c08a3e', max: w });
    return true;
  }

  // The one power this job actually confers. Ready / counting down / live.
  function holdBtn(G, x, y, w, h) {
    const H2 = G.hold || {};
    if (!H2.on) return;
    mark('paBtn');
    const live = H2.live;
    // ROUND 8 — TWO CLOCKS, AND THE BUTTON HAS TO STOP CONFLATING THEM.
    // `charged` is the handset's recharge; `armed` additionally means there is a
    // roster row for an announcement to go to. Round 7 drew one `ready` off the
    // recharge alone, and because the whole button was hidden without a
    // selection the difference never showed. It shows now: the button is always
    // up, so it has to be honest about which of the two is missing.
    //
    // ROUND 10 — AND THERE ARE TWO VERBS NOW, WITH A CLOCK EACH. [F] at the
    // desk speaks to the man on the spot monitor: the deterrence line if the
    // wall can see him, the round-7 price check if it has lost him. Those
    // answer to agents' recharge and to mine respectively, so the button asks
    // game.js which verb is up and then reports THAT verb's clock. Deriving one
    // from the other is exactly the round-8 bug and it is not repeated here.
    const warn = H2.annVerb === 'putback';
    const cool = (warn ? H2.pbIn : H2.cool) || 0;
    const coolMax = (warn ? H2.pbMax : H2.max) || 0;
    const charged = warn ? !!H2.pbReady : (!live && cool <= 0);
    const armed = charged && !!H2.annVerb;
    const ready = armed;
    // ROUND 7 — THE CHANNEL IS OPEN AND THAT HAS TO BE UNMISTAKABLE.
    // An open microphone is the one piece of state in this game that exists
    // outside the game, so it gets the treatment a real desk gives it: the
    // button goes hot red, it says ON AIR rather than anything about a price
    // check, and a level meter moves with the player's own voice. The meter is
    // the part that matters — it is the only proof he has that the store can
    // hear him, and without it a quiet mic is indistinguishable from a broken
    // feature.
    const air = !!H2.talk;
    const RED_AIR = '#ff4a3a';
    ctx.fillStyle = air ? 'rgba(255,74,58,0.24)'
      : live ? 'rgba(255,227,106,0.22)' : armed ? 'rgba(255,180,58,0.14)'
      : charged ? 'rgba(125,253,160,0.07)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, w, h);
    box(x, y, w, h, air ? RED_AIR : live ? '#ffe36a' : armed ? AMB
      : charged ? GRN_D : '#3c4a40', air ? 2 : 1);
    // Only the ARMED button is a button. A charged handset with nothing selected
    // is a readout — clicking it would call callHold(), which correctly refuses,
    // and a control that refuses a click is the thing this round is fixing.
    if (ready) reg('hold', x, y, w, h, 1);
    const c = air ? RED_AIR : live ? '#ffe36a' : armed ? AMB
      : charged ? DIM : '#5d7364';
    if (air) {
      // blinking ON AIR pip, the way every studio on earth does it
      const blink = (G.now % 0.9) < 0.55;
      ctx.fillStyle = blink ? RED_AIR : 'rgba(255,74,58,0.35)';
      ctx.beginPath(); ctx.arc(x + 11, y + 12, 4, 0, 7); ctx.fill();
      tx('ON AIR', x + w / 2 + 6, y + 16, { s: 11, w: 'bold', c, a: 'center', ls: 1.4 });
      // level meter — 12 cells, so it reads as a meter and not as a progress bar
      const mx = x + 8, mw = w - 16, cells = 12;
      const lit = Math.round(clampN(H2.talkLevel || 0, 0, 1) * cells);
      for (let i = 0; i < cells; i++) {
        const cw = mw / cells;
        ctx.fillStyle = i < lit
          ? (i > cells - 3 ? RED_AIR : i > cells - 6 ? '#ffb43a' : '#7fe0a0')
          : 'rgba(255,255,255,0.09)';
        ctx.fillRect(mx + i * cw, y + 23, cw - 1.5, 9);
      }
      // how long he has been rambling, because the ramble is worth something
      tx(`${(H2.talkFor || 0).toFixed(1)}s`, x + w - 6, y + h - 3,
        { s: 10, w: 'bold', c: 'rgba(255,138,124,0.8)', a: 'right' });
      return;
    }
    tx('PA', x + w / 2, y + 17, { s: 12, w: 'bold', c, a: 'center', ls: 1.6 });
    // ROUND 8 — FOUR STATES, AND THE TWO NEW ONES ARE THE POINT. `MIC ONLY` is
    // a charged handset with no roster row to announce at: the key works, the
    // channel opens, and there is simply nobody selected to stall. `RECHARGING`
    // over the count is there because a bare `3s` never said 3 s of WHAT — and
    // the answer used to be "of your microphone", which was the bug.
    // The COUNT is the one thing on this button a player has to be able to read,
    // because it is the answer to "why did nothing happen". Everything else in
    // the recharging state is deliberately grey — the button is unavailable and
    // should look it — but the number itself is warmed off that grey, or the
    // state reads as DISABLED rather than as COMING BACK. Those are different
    // sentences and only one of them is true.
    // ---- ROUND 10: THE COUNT AND THE WORD WERE ON TOP OF EACH OTHER --------
    // Round 8 printed the count on the baseline at y+32 and RECHARGING at
    // y+h-5 — three pixels apart on a 40 px button, overlapping, on the one
    // number this file's own comment calls "the thing a player has to be able
    // to read, because it is the answer to why did nothing happen". It hardly
    // ever showed: the only way to spend the handset at the desk was a price
    // check, and neither bench bot made many. The desk announcement spends it
    // every single time, so the state is on screen constantly now and the
    // overlap had to go. One line, number then word, measured rather than
    // centred twice.
    if (!charged && !live) {
      const num = `${Math.ceil(cool)}s`;
      const wN = advance(num, 11, 'bold'), wW = advance('RECHARGING', 9);
      const x0 = x + Math.max(3, (w - (wN + 6 + wW)) / 2);
      tx(num, x0, y + 32, { s: 11, w: 'bold', c: '#c08a3e' });
      tx('RECHARGING', x0 + wN + 6, y + 32, { s: 9, c: '#6b7d70', max: w - (x0 - x) - wN - 9 });
      if (coolMax) {                                     // cooldown drains left to right
        ctx.fillStyle = 'rgba(255,180,58,0.35)';
        ctx.fillRect(x, y + h - 3, w * (1 - cool / coolMax), 3);
      }
      return;
    }
    // ROUND 10: `PRICE CHK` was hardcoded here, which was fine while it was the
    // only thing the desk could say. The armed word is now WARN SUBJ-07 or
    // PRICE CHK depending on whether the wall can see the man it is pointed
    // at, and it is composed in game.js — see deskReadout(). HOLDING sits
    // behind it rather than in front: a pinned man already carries a HOLD chip
    // on his own roster row, and what the button is for is what it would DO.
    //
    // AND THE PRICE IS IN THE WEIGHT. `annHot` means the man this key is
    // pointed at is a man DISPATCH is armed on, which is the one configuration
    // where pressing it costs something — 397 points a shift down to 251 on
    // this file's own bench. It is true on most of a competent player's desk
    // frames, so it cannot be a sentence; it is the difference between the
    // armed word being full amber and being the recharge's warm grey-amber,
    // next to a DISPATCH button that is pulsing. The loud control is the one
    // worth pressing. game.js says the sentence out loud once, the first time
    // it is ever true — see tickCost().
    tx(armed ? (H2.annLabel || 'PRICE CHK') : live ? 'HOLDING' : 'MIC ONLY',
      x + w / 2, y + 32,
      { s: 11, w: 'bold', c: (armed && H2.annHot) ? '#c08a3e' : c, a: 'center', max: w - 6 });
  }
  const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
  // "A4" / "FRONT" / "BACK" — where the terminal will send you, not where he is.
  // ROUND 9: silent when it agrees with the channel header. The rule is "a
  // column that prints A3 on every row of a panel titled AISLE 3 is a margin,
  // not a column" — and I expected that to delete most of it. Measured over 160
  // shift-seconds, 4210 rows, it deleted 45.7%: the other 54.3% were a subject
  // the channel could see who was not in the aisle the channel is named after,
  // and 16.6% were more than one aisle away. I said then that this was not a
  // HUD problem and that this column was the only thing on the desk admitting
  // it — the domes sat at 4.35 m over 2.05 m gondolas and saw across the tops
  // of the shelving into their neighbours.
  //
  // ---- ROUND 10: THE SIGHT LINES GOT CUT, AND I RE-MEASURED BEFORE CUTTING
  // cctv dropped the aisle domes to 2.62 m so the gondolas mask across-aisle
  // views. Same instrument, 300 shift-seconds, cycling channels every 3 s,
  // 4019 drawn rows:
  //
  //                        speaks   >1 aisle out
  //     round 9            54.3%       16.6%
  //     round 10            6.7%        0.0%
  //
  // So the column stopped being a margin without being touched, and the honest
  // move is to leave it exactly where it is. 65.7% of the 6.7% is FRONT END —
  // a man out on the cross-aisle, seen by his own aisle's dome, whom DISPATCH
  // is about to send you to the front of the store for rather than into an
  // aisle. That is the one case round 9 kept it for, and it is now the only
  // case it fires in. The rest are ±1 aisle, i.e. a man standing in a mouth,
  // which is also a different destination. Cutting a 6.7% column that only
  // speaks when the destination is not the header would save nothing and would
  // cost the player the one warning that dispatch is not going where he thinks.
  function shortWhere(s, cam) {
    if (!s.where) return '';
    if (cam && s.where === cam.label) return '';
    if (s.aisle != null) return `A${s.aisle + 1}`;
    return s.where === 'FRONT END' ? 'FRONT' : s.where === 'BACK WALL' ? 'BACK' : s.where;
  }

  // ===========================================================================
  // ROUND 12 — ARROWS ON THE GROUND
  // ===========================================================================
  // The client asked for "arrows on the ground that help sort of indicate where
  // you should run to have your best chances of catching the suspect", and the
  // whole design decision is in the word SHOULD. Every other marker on this
  // screen answers "where is he"; this one answers "where do I go", and the two
  // are different directions the moment there is a gondola between you.
  //
  // WHAT THIS FILE DOES AND DOES NOT KNOW. game.js hands over `f.cut` — a list
  // of world points along the route YOU should run, the point at the end of it,
  // whether a cut exists at all, and a 1 -> 0 fade. Nothing here solves
  // anything; there is no second intercept model to disagree with the first.
  //
  // THROUGH THE LENS, LIKE EVERY OTHER FLOOR MARKER. projectFromCop is a
  // pinhole and the grade ends in a barrel, so a decal drawn at the pinhole
  // pixel lies beside the tile it belongs to. warpFloor() moves it; floorMagAt
  // takes the PINHOLE point, per warp.js's contract and this file's header.
  //
  // IT IS STROKED, NOT FILLED, AND THAT IS ON PURPOSE. Filled glyphs enter the
  // plate ledger as erasers and a marching row of eighteen of them across the
  // middle of the frame would light it up on every chase frame. A stroked
  // chevron genuinely cannot paint out a word — which is the same argument the
  // note at ERASE_ALPHA makes for excluding strokes, applied honestly rather
  // than as a way round the instrument. Contrast comes from an under-stroke.
  //
  // NOT A SECOND ALARM BAR. Round 9 measured the old alarm plate at 41% of an
  // idle shift and deleted it, and that is the standard this has to clear. It
  // is gated four ways and every one of them is somebody else's decision: a
  // chase must be live (game.js nulls `cut` the frame a case closes), the
  // belief must be CONTACT or SOFT, the shift must still be early, and the
  // route must project to at least two points in front of the camera.
  //
  // ---- IT DRAWS THROUGH SHELVING, AND THAT IS THE DELIBERATE CHOICE --------
  // A route that goes round a gondola spends most of its length behind one, so
  // some chevrons land on a shelf face rather than on the floor —
  // shots/game_r12_cut_zoom.png. Two existing elements already do exactly this
  // and say so: the door tags ("these land on packed shelving forty metres
  // away, which is the busiest surface in the game") and the subject bracket.
  //
  // The obvious fix is to cull the samples the cop cannot see, and the ONLY
  // occlusion predicate reachable from here is agents' `nav.clearSeg` —
  // which AGENTS_BRIEF retires for this exact question by name. It is a
  // BODY-PATHING test: makeSolids() throws the heights away and inflates every
  // footprint by a 0.52 m body radius, and 52 of the 74 colliders in this store
  // are under 1.6 m. Measured in the front-of-store box it calls 76.3% of pairs
  // blocked that a height-aware model calls clear. Culling on it would delete
  // most of a route the player can see over, to fix an aesthetic complaint. The
  // brief's rule is that a single owner does not make the answer right; the
  // owner has to be answering YOUR question, and clearSeg is not.
  //
  // So it draws through, like the two markers beside it, and the near-field
  // turn arrow — which is on real floor at the cop's feet — carries the reading.
  const CUT_COL = '#7dfda0', CUT_TAIL = '#ff9a2e';
  // ---- AND THE HALF OF IT THAT IS NOT ON THE SCREEN ------------------------
  // Measured on the first working capture, chasing a man who had turned right
  // and gone behind the camera: of 20 route samples, THREE projected in front
  // of the lens and two of those were in the bottom-right corner. The whole
  // route was off frame — and that is not the rare case, it is the case the aid
  // exists for. If the route were ahead of you the man would be ahead of you
  // and you would not need telling which way to run.
  //
  // So the aid needs a direction it can draw when the destination is behind the
  // player. `projectFromCop` is the only handle this file has on the live
  // camera (see the header, and CLAUDE.md on why there is no second copy of the
  // rig in here) — so the local mapping is READ OFF IT rather than
  // reconstructed from a yaw this file would then own: project the cop and two
  // 2 m probes, and you have the linear map from world (x,z) to screen (x,y) at
  // his feet. The chase rig sits several metres behind and above him, so all
  // three probes are well in front of the near plane even when the route is not.
  // Is a glyph anchored here actually on the picture. 24 px of slack so a mark
  // whose head is a few pixels past the edge still counts as seen.
  const onFrame = (x, y) => x > -24 && x < W + 24 && y > -24 && y < H + 24;
  function copFrame(G) {
    const c = G.cop;
    const o = projectFromCop(c, c.x, 0.06, c.z);
    if (o.behind) return null;
    const px = projectFromCop(c, c.x + 2, 0.06, c.z);
    const pz = projectFromCop(c, c.x, 0.06, c.z + 2);
    if (px.behind || pz.behind) return null;
    return { o,
      ax: (px.x - o.x) / 2, ay: (px.y - o.y) / 2,
      bx: (pz.x - o.x) / 2, by: (pz.y - o.y) / 2 };
  }
  function drawCut(G, f) {
    const cut = f && f.cut;
    const fade = (f && f.cutFade) || 0;
    // game.js's reason column, marked here because the census is a HUD frame.
    // `late` and `cold` are its decisions and not this file's; see cutWhy.
    if (f && f.cutWhy === 'late') mark('cutLate');
    else if (f && f.cutWhy === 'cold') mark('cutCold');
    if (!cut || fade <= 0 || !G.cop) return;
    // Asked for and nothing to draw: the route collapsed to a single point,
    // which is the last stride of a chase. Marked rather than returned
    // silently — the first cut of this returned here without a mark and the
    // census could not tell it from a frame the aid was never asked about.
    if (!cut.pts || cut.pts.length < 2) { mark('cutBlind'); return; }
    const col = cut.tail ? CUT_TAIL : CUT_COL;
    // Project once. `behind` is projectFromCop's own sentinel and warpFloor
    // passes it through; a sample behind the lens breaks the run rather than
    // clamping to an edge, because a chevron clamped to the frame edge is
    // pointing at a piece of floor that is not on this screen.
    const scr = cut.pts.map((p) => {
      const raw = projectFromCop(G.cop, p.x, 0.06, p.z);
      if (raw.behind) return null;
      const q = warpFloor(raw);
      return { x: q.x, y: q.y, raw, d: Math.hypot(p.x - G.cop.x, p.z - G.cop.z) };
    });
    let drawn = 0;
    // save/restore rather than resetting by hand at the end: this is the only
    // element on the screen that wants round caps and a dash pattern, and an
    // early return out of the middle of it would otherwise leave both set for
    // everything drawn after.
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 1; i < scr.length; i++) {
      const a = scr[i - 1], b = scr[i];
      if (!a || !b) continue;
      // The first metre and a half is under the cop's own feet and off the
      // bottom of the frame; drawing it adds ink and says nothing.
      if (b.d < 1.6) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const m = Math.hypot(dx, dy);
      if (m < 3) continue;                       // a sample that went nowhere on screen
      const ux = dx / m, uy = dy / m;
      // Same metres-to-pixels heuristic the bracket uses, so the chevrons and
      // the box round the man shrink together with range instead of at two
      // different rates.
      const sz = Math.max(4.5, Math.min(26, 260 / Math.max(1.2, b.d)));
      // A slow crawl TOWARDS the point, so the row reads as a direction rather
      // than as a dotted line. 0.55 -> 1.0, never off: this is a floor decal in
      // the lower half of a lit supermarket, not a warning light, and the one
      // thing round 9 established about this HUD is that flashing full-width
      // red is what the client called obnoxious.
      const ph = ((i * 0.42) - G.now * 1.5) % 1;
      const bright = 0.55 + 0.45 * (ph < 0 ? ph + 1 : ph);
      // ...and the far end of the run is dimmer than the near end, because the
      // near end is the bit you act on in the next half second.
      const tail = 1 - 0.45 * Math.min(1, i / Math.max(6, scr.length - 1));
      const nx = -uy, ny = ux;
      const hx = b.x, hy = b.y;
      // ---- A CHEVRON DRAWN OFF THE CANVAS IS NOT A CHEVRON -----------------
      // Found on the round's own headline capture. `projectFromCop` returns
      // real coordinates for anything in front of the lens, including points
      // at y = 1975 — so the first draft counted 12 chevrons and drew none the
      // player could see, and `drawn` then suppressed the turn arrow that was
      // the whole fallback. shots/game_r12.png (first take) is a chase with the
      // prompt band saying CUT HIM OFF AT THE MARK and nothing on the floor.
      //
      // `behind` was the only cull, and behind-the-lens is a much smaller set
      // than off-the-canvas. So the frame test is here, and it decides BOTH
      // whether to draw and whether it counts — those must be the same
      // decision or the fallback is gated on ink that does not exist.
      if (!onFrame(hx, hy)) continue;
      const p1x = hx - ux * sz + nx * sz * 0.66, p1y = hy - uy * sz + ny * sz * 0.66;
      const p2x = hx - ux * sz - nx * sz * 0.66, p2y = hy - uy * sz - ny * sz * 0.66;
      for (const [lw, c, al] of [[Math.max(3, sz * 0.34), 'rgba(2,7,4,0.8)', 0.9],
        [Math.max(1.4, sz * 0.16), col, 1]]) {
        ctx.globalAlpha = fade * bright * tail * al;
        ctx.strokeStyle = c; ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(p1x, p1y); ctx.lineTo(hx, hy); ctx.lineTo(p2x, p2y);
        ctx.stroke();
      }
      drawn++;
    }
    // The ring at the point, and ONLY when there is a point — on a tail chase
    // the destination is the man and he already has a bracket on him. A second
    // ring round the same body is the thing this project keeps calling a third
    // telling.
    if (!cut.tail && cut.at) {
      const raw = projectFromCop(G.cop, cut.at.x, 0.06, cut.at.z);
      const q0 = raw.behind ? null : warpFloor(raw);
      if (q0 && onFrame(q0.x, q0.y)) {
        const q = q0;
        // floorMagAt takes the PINHOLE point. See warp.js.
        const mag = floorMagAt(raw.x, raw.y);
        const d = Math.hypot(cut.at.x - G.cop.x, cut.at.z - G.cop.z);
        const r = Math.max(9, Math.min(110, 230 / Math.max(1.2, d)));
        ctx.globalAlpha = fade;
        ctx.strokeStyle = col; ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        // Flattened, because it is lying on the floor and not standing on it.
        ctx.ellipse(q.x, q.y, r * mag.tangential, r * mag.radial * 0.40, 0, 0, 7);
        ctx.stroke();
        ctx.setLineDash([]);
        drawn++;
        // ---- THE WORD THAT USED TO BE HERE, AND WHY IT IS NOT ---------------
        // The first cut of this printed `CUT HIM OFF` on a plate under the
        // ring, gated on the same fade, to teach the ring. The ledgers found it
        // on the first bench and they were right: 4 overprints and 9 erasures
        // across 9,600 census frames, and EVERY ONE OF THEM was that string —
        // worst 51 px against `SUBJ-14`, and 61.8% of it painted out by the
        // subject label's own plate at hud.js:1911.
        //
        // That is the correct priority (the cluster is drawn after this and
        // should win) and the wrong element. Every fix available here is a
        // second copy of the cluster's geometry in a file that has spent four
        // rounds deleting those: a keep-out for a marker that ROAMS is not a
        // reserved band, it is the cluster's box transcribed.
        //
        // So the teaching moved to the one band that is already reserved,
        // already up on 100% of floor frames, and already owned by lines.js:
        // the prompt says PURSUE — CUT HIM OFF AT THE MARK while the aid is at
        // teaching strength, and PURSUE — DO NOT LOSE HIM after. Nought new ink
        // for the same sentence. See L.ORDER_CUT and the latch in game.js.
      }
    }
    // ---- THE TURN, WHEN THE ROUTE IS NOT IN FRONT OF YOU -------------------
    // Two chevrons on screen is not a direction, and every chase where the aid
    // matters starts with the route leaving the frame. One arrow at the cop's
    // own feet, rotated to the route's first leg — the leg AFTER the pathing
    // has decided which end of the gondola to go round, which is the whole
    // question. It is drawn in the same warped frame as the chevrons: the
    // anchor is stepped off in pinhole space and BOTH ends are pushed through
    // warpFloor, so the arrow's angle is the angle after the barrel rather than
    // before it.
    if (drawn < 3) {
      const fr = copFrame(G);
      // Skip the first metre and a half for the same reason the chevrons do:
      // the route's first sample is under his own shoes and its bearing is
      // noise. This is the leg, not the step.
      const leg = cut.pts.find((p) => Math.hypot(p.x - G.cop.x, p.z - G.cop.z) > 2.2)
        || cut.pts[cut.pts.length - 1];
      if (fr && leg) {
        const dx = leg.x - G.cop.x, dz = leg.z - G.cop.z;
        const sx = fr.ax * dx + fr.bx * dz, sy = fr.ay * dx + fr.by * dz;
        const m = Math.hypot(sx, sy);
        if (m > 1e-6) {
          const R = 120;
          const a0 = warpFloor({ x: fr.o.x, y: fr.o.y, behind: false });
          const a1 = warpFloor({ x: fr.o.x + (sx / m) * R, y: fr.o.y + (sy / m) * R,
            behind: false });
          const wdx = a1.x - a0.x, wdy = a1.y - a0.y;
          const wm = Math.hypot(wdx, wdy);
          if (wm > 8) {
            mark('cutTurn');
            const ux = wdx / wm, uy = wdy / wm;
            // The ANGLE is taken before this clamp and the POSITION after it, so
            // an arrow whose anchor is off the bottom of the frame — the "he has
            // gone behind you" case, which is most of them — still points the
            // right way. The window is the one strip of this screen that is
            // reliably nobody's: under the rear-break banner (146+34) and above
            // the prompt band (540). The first cut clamped to 600 and the shaft
            // of a down-pointing arrow ran up into the band and was painted out,
            // which is game_r12_cut_a.png.
            const hx = Math.max(70, Math.min(W - 70, a1.x));
            const hy = Math.max(300, Math.min(512, a1.y));
            const sz = 34;
            const nx2 = -uy, ny2 = ux;
            const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(G.now * 3.4));
            for (const [lw, c2] of [[10, 'rgba(2,7,4,0.82)'], [4, col]]) {
              ctx.globalAlpha = fade * pulse;
              ctx.strokeStyle = c2; ctx.lineWidth = lw;
              ctx.beginPath();
              ctx.moveTo(hx - ux * sz + nx2 * sz * 0.7, hy - uy * sz + ny2 * sz * 0.7);
              ctx.lineTo(hx, hy);
              ctx.lineTo(hx - ux * sz - nx2 * sz * 0.7, hy - uy * sz - ny2 * sz * 0.7);
              ctx.stroke();
              // a short shaft, so it reads as an arrow rather than as a corner
              ctx.beginPath();
              ctx.moveTo(hx - ux * sz * 1.9, hy - uy * sz * 1.9);
              ctx.lineTo(hx - ux * sz * 0.35, hy - uy * sz * 0.35);
              ctx.stroke();
            }
            drawn++;
          }
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    if (drawn) mark('cutPath');
    // The aid was asked for and had nothing to put on the screen — every route
    // sample behind the lens AND no usable frame at the cop's feet. Marked so
    // the difference between "gated off" and "drew nothing" is a number in the
    // census rather than a subtraction somebody has to do by hand; a feature
    // whose own telemetry cannot tell those apart is the shape AGENTS_BRIEF
    // retires. Read it against `cutPath`.
    else mark('cutBlind');
  }

  // ------------------------------------------------------------------ FLOOR
  function drawFloor(G) {
    const f = G.floor;
    // ---- ROUND 12: THE MARKER IS NOW GRADED, AND THE OLD GUARD WAS A GHOST --
    // What used to be here was `f.target.state !== 'gone'`. Nothing in game.js
    // or in this file has ever assigned the string 'gone' to a subject state —
    // grep it: zero writes — so that clause was always true and this block drew
    // the subject's exact live position, gap and door ETA every frame, through
    // however many gondolas were in the way. shots/critic_agents_r9.png is the
    // bracket reading SUBJ-01 · 3.1m through a shelf.
    //
    // game.js's sight model replaces it. `f.sight.grade` is a word, computed
    // once there off agents' own nav.clearSeg, and NOTHING is re-derived here:
    // this file gets a point, a grade and an age, and draws them. The rule that
    // matters for whoever edits this next is that f.target.x/z is the PURSUIT'S
    // BELIEF, not the man — it is his real position only while grade is
    // 'contact'. If you find yourself wanting his real position in this file,
    // that is the bug coming back.
    //
    //   contact  solid brackets, exact gap. What always shipped.
    //   soft     dashed, gap as a ~band. Under two seconds stale.
    //   cold     no box, no number. A bearing tick and how long ago.
    const sg = (f && f.sight && f.sight.grade) || (f && f.target ? 'contact' : 'none');
    const stale = sg === 'soft' || sg === 'cold';
    // Function-scoped because the pursuit panel below reads them too. Both are
    // read off f.sight and neither is computed here — see the note above.
    const age = (f && f.sight && isFinite(f.sight.age)) ? f.sight.age : 0;
    const hold = (f && f.sight && f.sight.hold) || 2.0;
    // ---- ROUND 12: THE CUT, ON THE FLOOR -----------------------------------
    // Drawn FIRST, under everything. It is the only element on this screen that
    // is about the floor rather than about a person, and the brackets, the door
    // tags and the chrome all have a better claim to the pixels they share with
    // it. game.js owns the route, the point and the fade; this owns the glyphs
    // and nothing else — same contract as `grade`.
    drawCut(G, f);
    // objective / subject marker, projected onto the world
    if (f && f.target && sg !== 'none' && G.cop) {
      // Pinhole first, then through the grade's lens. Both are needed: `raw` is
      // where the marker's SIZE heuristic is evaluated, `p` is where it is
      // drawn. Everything downstream of here reads the warped point — including
      // the off-screen test, because warp.js is explicit that the map pushes
      // content off the frame at the edge midlines (raw x=1280 lands at 1295),
      // so testing the pinhole would call a man on screen who is not.
      mark('brackets');
      // ROUND 17: everything from here to the readout's plate is drawn ON the
      // subject deliberately. Tagged so the coverage ledger can separate "his
      // own label is over his chest" from "a panel is over his chest" — see
      // plateTag. Cleared at the end of the block, unconditionally.
      plateTag = 'subj';
      const raw = projectFromCop(G.cop, f.target.x, 1.75, f.target.z);
      const p = warpFloor(raw);
      const d = Math.hypot(f.target.x - G.cop.x, f.target.z - G.cop.z);
      const off = p.behind || p.x < 26 || p.x > W - 26;
      // ROUND 8: the off-screen cluster is pulled further inboard than the
      // round-1 clamp put it. That clamp centred a ~90 px subject label 40 px
      // from the edge, i.e. with half of it off canvas — survivable while the
      // marker was a 26 px bracket and nothing else was competing for the edge,
      // and not survivable now that the chevron below wants the edge itself.
      const edge = off ? 104 : 40;
      const cl = { x: Math.max(edge, Math.min(W - edge, p.x)), y: Math.max(96, Math.min(560, p.y)) };
      // Orange brackets = he has broken for the rear. The cue that a man has
      // turned round belongs ON the man, not in a panel the player is not
      // looking at while chasing one.
      const c = f.target.state === 'flee' ? (f.viaBack ? '#ff7a2e' : RED)
        : (f.confronted ? '#8fa8ff' : AMB);
      // A dashed, thinner, part-transparent bracket is the whole visual grammar
      // of "this is an estimate". It has to survive being glanced at during a
      // sprint, so it is three cues at once rather than one subtle one — and
      // the alpha ramps with age, so a marker that is nearly cold LOOKS nearly
      // cold instead of switching states without warning.
      const fade = sg === 'contact' ? 1 : sg === 'soft' ? 1 - 0.45 * Math.min(1, age / hold) : 0.45;
      ctx.strokeStyle = c; ctx.lineWidth = stale ? 1.5 : 2;
      ctx.globalAlpha = fade;
      if (stale) ctx.setLineDash([5, 4]);
      // The bracket is a one-point marker with a size heuristic, which is the
      // exact case warp.js publishes floorMagAt for: the lens does not scale a
      // small square evenly, so the box round a man 2 m away at the centre of
      // frame is 1.12x the box round the same man at the corner. Width takes
      // the tangential factor and height the radial one, per its note.
      const mag = off ? { tangential: 1, radial: 1 } : floorMagAt(raw.x, raw.y);
      const bw0 = off ? 26 : Math.max(26, Math.min(150, 380 / Math.max(1.2, d)));
      const bw = bw0 * mag.tangential;
      const bh2 = bw0 * 1.9 * mag.radial;
      // COLD gets no box at all. A four-corner bracket is a claim to have
      // something framed, and you do not — what you have is a direction and a
      // staleness, so that is what is drawn: a bearing tick, and the seconds
      // under it. Anything more would be the old lie in a lighter colour.
      //
      // ---- ROUND 13: AND THE TICK WAS STILL CLAIMING TOO MUCH -------------
      // A tick is a POINT. On real shifts COLD ran with a belief error of
      // 18.6-28.6 m, and a bearing that may be 28 m wrong was drawn with the
      // same 26 px cross as one that is 2 m wrong — the player had no way to
      // tell those apart, so the honest ones were as untrustworthy as the bad
      // ones. Withholding the number did not make the marker modest; it made
      // it unfalsifiable.
      //
      // So the tick widens. `f.sight.spread` is game.js's uncertainty radius in
      // metres (staleness x the same cruise estimate the reckoning walks at),
      // and this converts it to the angle it actually subtends at the range the
      // marker is drawn at — so the wedge is wide when he could be anywhere and
      // narrow when the reckoning is still tight, which is the same information
      // the metres are, put where the eye already is.
      //
      // Past game.js's BEARING_MAX the direction has stopped being a direction:
      // a 90-degree wedge is the screen. At that point the bearing is RETIRED —
      // the mark becomes a plain diamond meaning "somewhere over there, and I
      // am not going to pretend to be more precise than that". Nothing on this
      // screen is allowed to look confident on that evidence.
      // Both come off game.js. The half-angle and the retirement threshold are
      // NOT recomputed here — `f.sight.bearing` is a word from the owner, the
      // same way `f.sight.grade` is, and the moment this file starts deriving
      // either of them there are two sight models again.
      const spread = (f.sight && isFinite(f.sight.spread)) ? f.sight.spread : 0;
      const halfW = (f.sight && isFinite(f.sight.halfWedge)) ? f.sight.halfWedge : 0;
      const lost = f.sight ? f.sight.bearing === false : false;
      if (sg === 'cold') {
        mark(lost ? 'coldNoBearing' : 'coldWedge');
        if (lost) {
          // no direction claimed: an open diamond, and the label says so
          ctx.beginPath();
          ctx.moveTo(cl.x, cl.y - 11); ctx.lineTo(cl.x + 11, cl.y);
          ctx.lineTo(cl.x, cl.y + 11); ctx.lineTo(cl.x - 11, cl.y);
          ctx.closePath(); ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.moveTo(cl.x, cl.y - 13); ctx.lineTo(cl.x, cl.y + 13); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cl.x - 9, cl.y); ctx.lineTo(cl.x + 9, cl.y); ctx.stroke();
          // ---- AND IT IS A RING, NOT A WEDGE ---------------------------------
          // The first version of this drew a wedge opening by the angle the
          // spread subtends. It looked like a bearing cone and it was not one:
          // canvas angles are screen angles, so the wedge always opened straight
          // UP the frame regardless of where the man might be. It carried
          // exactly zero directional information while looking like it carried
          // some, which is the same sin as the tick it replaced.
          //
          // What `spread` actually is, is a RADIUS — he is somewhere within N
          // metres of this point. So draw that: a dashed ring at the projected
          // size of N metres. It reads as "somewhere in here", which is the true
          // content, and it grows visibly as the sighting ages.
          //
          // Sized off `bw0`, the bracket's own metres-to-pixels heuristic, so
          // there is one projection guess on this screen and not two: bw0 is how
          // wide a man draws at this range, and a man is about 0.55 m across.
          const pxPerM = bw0 / 0.55;
          const rad = Math.max(14, Math.min(300, spread * pxPerM));
          ctx.globalAlpha = fade * 0.75;
          ctx.beginPath();
          ctx.ellipse(cl.x, cl.y, rad * mag.tangential, rad * mag.radial * 0.62, 0, 0, 7);
          ctx.stroke();
          ctx.globalAlpha = fade;
        }
      } else {
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
          const px = cl.x + sx * bw / 2, py = cl.y + sy * bh2 / 2;
          ctx.beginPath(); ctx.moveTo(px - sx * bw * 0.28, py); ctx.lineTo(px, py);
          ctx.lineTo(px, py - sy * bh2 * 0.24); ctx.stroke();
        });
      }
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      // Off-screen, this used to print the DISPATCHED aisle no matter where the
      // man had got to — so a subject twenty metres up the front walk was
      // labelled with an aisle he had left. Off-screen or on, the tag names who
      // it is pointing at; only a plain zone sweep names the zone.
      const zone = f.where || `AISLE ${f.aisle + 1}`;
      // The `?` is the cheapest possible admission that the tag is pointing at
      // a guess, and it rides on the name rather than in a second element,
      // because the one place the player is definitely looking mid-chase is the
      // thing with his subject's code on it.
      const who = (f.target.code || zone) + (stale ? ' ?' : '');
      // ---- ROUND 14: `lost` HAS TO SILENCE THE ARROWS TOO -------------------
      // Round 13 retired the bearing in words and in the mark, and left three
      // direction claims standing on top of it: this `◀`, the `▶` below, and
      // the big pulsing edge chevron. shots/critic_r13_c5_d.png is all three at
      // once over the words LAST SEEN 2.8s · BEARING GONE — an arrow the size
      // of a thumb pointing right, above a sentence saying there is no
      // direction to point. Whichever of the two the player believes, the HUD
      // told him the other one in the same glance.
      //
      // `lost` is game.js's word (`f.sight.bearing === false`), the same one the
      // diamond and the readout already switch on; nothing is re-derived here.
      const arrows = off && !lost;
      const lbl = arrows && p.x < W / 2 ? '◀ ' + who : who;
      // ---- ROUND 8: OFF-SCREEN IS A DIFFERENT PROBLEM NOW ------------------
      // Round 1's off-screen treatment was a 26 px bracket with an arrow glyph
      // in its label, and it was sized for a camera that could not be turned.
      // With 110 degrees of mouse look the player can now put the subject off
      // frame with his wrist, and the thing he has lost is not the man — it is
      // which way round he is. So the edge marker is a real chevron, big enough
      // to be caught in peripheral vision, and when the head is meaningfully
      // deflected it says so, because "I cannot see him" and "my head is turned
      // 70 degrees" are the same fact and the player has no other way to
      // connect them mid-glance.
      //
      // ROUND 14: ...and all of that is true while the marker still HAS a
      // direction. Once `f.sight.bearing` is false it does not, so the chevron
      // goes with the rest of the arrows — see `arrows` above. The HEAD note
      // stays either way, because it is a fact about the PLAYER'S OWN NECK and
      // not a claim about where the subject is; it is the one thing at this
      // edge that is still true when the bearing is gone.
      if (off) {
        const left = p.x < W / 2;
        const ex = left ? 24 : W - 24;
        if (arrows) {
          const tip = left ? ex - 13 : ex + 13, base = left ? ex + 13 : ex - 13;
          const pulse = 0.55 + 0.45 * Math.sin(G.now * 6);
          ctx.globalAlpha = pulse;
          ctx.fillStyle = c;
          ctx.beginPath();
          ctx.moveTo(tip, cl.y);
          ctx.lineTo(base, cl.y - 20);
          ctx.lineTo(base, cl.y + 20);
          ctx.closePath(); ctx.fill();
          ctx.globalAlpha = 1;
        }
        // ...and whether his head is why. "I cannot see him" and "I am looking
        // seventy degrees off my own course" are one fact, and mid-chase the
        // player has no way to put the two together — the view simply does not
        // contain the man any more. Only past a third of the budget, because
        // under that the glance is not what lost him and saying so would be
        // blaming the mouse for a wall.
        const LK = G.look;
        if (LK) {
          const dg = Math.round(Math.abs(LK.yaw * 180 / Math.PI));
          if (dg > Math.max(1, LK.max * 180 / Math.PI) * 0.33) {
            tx(`HEAD ${dg}°`, left ? ex - 14 : ex + 14, cl.y + 38,
              { s: 10, w: 'bold', c: '#ff9a2e', a: left ? 'left' : 'right', ls: 0.6 });
          }
        }
      }
      // ROUND 15 (width audit): was `lbl.length * 8 + 18`, measured off `lbl`
      // while the string DRAWN is `lbl + ' ▶'` — so on a subject off the right
      // of frame the plate was two characters short and the chevron hung over
      // the shelving with no plate under it. Build the drawn string once, then
      // measure that.
      const LO = { s: 12, w: 'bold' };
      const lbl2 = lbl + (arrows && p.x >= W / 2 ? ' ▶' : '');
      const lw = advOf(lbl2, LO) + 18;
      // ROUND 15: and the same dodge as the readout below — see PURSUIT_RECT.
      //
      // ---- A TOP CLAMP WAS TRIED HERE AND MADE IT WORSE. NEGATIVE RESULT ----
      // `cl.y` is clamped to 96 but this plate sits `bh2 / 2 + 24` above it, and
      // `bh2` reaches 285 px on a subject at arm's length — so a close man high
      // in frame puts his own label at y = -70, through the top band. The
      // obvious fix is `Math.max(FLOOR_BAND + 2, ...)`, and I shipped it and
      // measured it: overprints across seven pooled seeds went 25 -> 261. The
      // clamp does not find free space, it finds the DISPATCHED TO panel, whose
      // title sits at y 74 x 18-121 — so a label parked at y 68 lands on it
      // 52.7 px wide, and it does so on far more frames than the rare huge
      // bracket it was for. The top-left of this screen has no free row.
      //
      // The right fix is to flip the label BELOW the marker when there is no
      // room above, and stack the readout under it — but that is a three-plate
      // stacker and this round has already changed four things in this file, so
      // it is left as a measured, reproducible 25-collision residual rather than
      // a fifth untested layout change. The ink ledger will keep reporting it.
      //
      // ---- ROUND 16: IT DID, AND THIS IS THAT FLIP -------------------------
      // The ledger reported it as an ERASURE rather than an overprint, which is
      // why round 15 could not see the size of it: the plate ledger (see THE
      // RESERVED BANDS above) says the label is painted out at 100% by three
      // different pieces of chrome. So the label picks a row instead of taking
      // one: above the marker if that row is free, below the marker if it is
      // not, and only if BOTH are occupied does it resolve downward out of the
      // bands. That ordering is what keeps the label ON the man — a clamp finds
      // the panel, and round 15 measured what that costs (25 -> 261).
      const KO = floorKeepOuts(G, f);
      const lx0 = cl.x - lw / 2;
      const above = cl.y - bh2 / 2 - 24;
      const below = cl.y + bh2 / 2 + 6;
      const flipped = from('r16') && !rowFree(above, 18, lx0, lw, KO)
        && below + 18 < H - 44 && rowFree(below, 18, lx0, lw, KO);
      const ly = flipped ? below
        : rowFree(above, 18, lx0, lw, KO) ? above : rowBelow(above, 18, lx0, lw, KO);
      ctx.fillStyle = 'rgba(3,7,4,0.85)'; ctx.fillRect(cl.x - lw / 2, ly, lw, 18);
      box(cl.x - lw / 2, ly, lw, 18, c);
      tx(lbl2, cl.x, ly + 14, { ...LO, c, a: 'center' });
      // ---- THE NUMBER, AND THE THREE THINGS IT IS ALLOWED TO SAY -----------
      // A gap printed to a tenth of a metre is a measurement, and you only have
      // one of those while you are looking at him. SOFT rounds to the nearest
      // two metres and wears a tilde, which is honest about a reckoning that
      // drifts at the thief's cruise. COLD does not print a distance at all —
      // it prints how stale the bearing is, because that is the only quantity
      // still in your possession. Same slot, same size, three different claims.
      //
      // ---- ROUND 13: WHAT COLD SAYS INSTEAD OF NOTHING --------------------
      // `LAST SEEN 3.4s` is true and it is only half the sentence. Staleness is
      // not the quantity the player is trying to act on — DISTANCE HE COULD BE
      // OFF BY is, and 3.4 s means something different in a store this size than
      // it does in a corridor. So COLD prints the radius as well: `3.4s ±11m`
      // is the same claim the wedge is making, in the units a player thinks in.
      // It is a falsifiable promise, and sightLedger()'s `coldCoveredPct`
      // measures how often the game keeps it.
      //
      // Two states override it, and both are the marker admitting something:
      //   lost   the spread has swallowed the bearing (see the ring above), so
      //          the readout stops printing a radius that is bigger than the
      //          store and says the direction is gone.
      //   sweep  game.js's un-learn has FALSIFIED the reckoning — either you are
      //          looking straight at where you thought he was, or the phantom
      //          walked out of the door and he did not come with it. The marker
      //          has fallen back to the last real sighting, and that is a
      //          different and much more useful thing to be told than a number.
      const swept = !!(f.sight && f.sight.sweep);
      const dl = sg === 'contact' ? `${d.toFixed(1)}m`
        : sg === 'soft' ? `~${(Math.round(d / 2) * 2)}m`
          : swept ? (f.sight.sweepWhy === 'arrived' ? 'NEVER MADE THE DOOR' : 'NOT WHERE I LOOKED')
            : lost ? `LAST SEEN ${age.toFixed(1)}s · BEARING GONE`
              : `LAST SEEN ${age.toFixed(1)}s ±${Math.round(spread)}m`;
      // ROUND 15 (width audit): was `dl.length * (cold ? 7 : 9) + 14`. 7 px a
      // character is under the real 11 px bold advance, so the longest of these
      // strings ate its own padding — and the round-14 comment below sizes the
      // canvas clamp off this same number, so the guess was propagating.
      const DO = { s: sg === 'cold' ? 11 : 13, w: 'bold' };
      const dw = advOf(dl, DO) + 14;
      // ROUND 15: ...and out from under the pursuit panel. See PURSUIT_RECT.
      // The readout is already a detached, separately-clamped plate — it is the
      // one part of this cluster that is allowed to move, because the BRACKET
      // has to stay on the man and the panel has to stay where the player looks
      // for it. Applied only while the panel is actually up and only where the
      // two boxes really overlap in x, so a subject at the edge of frame keeps
      // its readout beside him.
      //
      // ROUND 14: keep the plate inside the canvas. Centred on `cl.x`, the
      // widest of these strings — `LAST SEEN 17.3s · BEARING GONE`, 30 chars —
      // is 224 px against an off-screen clamp of W-104, so it ran 8 px off the
      // right edge and the sentence about not knowing where he is lost its last
      // letter. Caught in shots/game_r14_bearing_gone_after.png. The marker
      // stays where it is; only the readout slides back inboard.
      const dcx = Math.max(dw / 2 + 4, Math.min(W - dw / 2 - 4, cl.x));
      // ROUND 16: same bands as the label, and it yields the row under the
      // marker when the label has already taken it. `dodgePursuit` is gone —
      // it was this, with a one-rectangle keep-out list.
      // ...and the LABEL'S OWN ROW is a keep-out for the readout. It always was
      // — the special case below did it for the one configuration where the two
      // dodged to an identical y — but `rowBelow` can now land the label on a
      // row the readout merely OVERLAPS, and `dy2 === ly` is blind to that.
      // Measured: the first cut of this fix cleared all three chrome classes
      // and opened a fourth, 116 erasures of `SUBJ-nn ▶` by the readout plate
      // with 106 matching overprints. One list, not two rules.
      const KO2 = from('r16') ? KO.concat([{ x: lx0, y: ly, w: lw, h: 18 }]) : KO;
      let dy2 = rowBelow(
        flipped ? ly + 20 : Math.min(cl.y + (sg === 'cold' ? 22 : bh2 / 2 + 4), 516),
        18, dcx - dw / 2, dw, KO2);
      // Round 15's special case, kept ONLY for the 'r15' ablation above. KO2
      // covers every configuration it covered on the shipped path.
      if (!from('r16') && dy2 === ly && lw > 0 && !(dcx - dw / 2 + dw <= lx0
        || dcx - dw / 2 >= lx0 + lw)) dy2 = ly + 20;
      // ROUND 15's special case lived here: "Both plates dodge to the same row
      // when the marker sits in a narrow band (cl.y 111-118 at the minimum
      // bracket size), so the readout takes the row under the label." It was
      // correct and it was one rule for one configuration; KO2 above is the
      // same statement for every configuration, so the special case is gone
      // rather than sitting beside a mechanism that already covers it.
      // The GEOMETRY fades with age; the WORDS do not. `fade` is 0.45 at COLD,
      // and shots/game_r13_cold_wedge.png caught `LAST SEEN 2.0s ±7m` rendered
      // at 0.45 over a blown-out yellow promo sign, where it is simply not
      // readable. Fading the marker says "this is stale"; fading the sentence
      // that says HOW stale just deletes it. Opaque plate, near-full text.
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(3,7,4,0.94)'; ctx.fillRect(dcx - dw / 2, dy2, dw, 18);
      box(dcx - dw / 2, dy2, dw, 18, c);
      tx(dl, dcx, dy2 + 14, { ...DO, c, a: 'center' });
      plateTag = null;
    }

    // --- THE DOORS, ON THE FLOOR ----------------------------------------------
    // The panel above tells you which door in words. This puts the word on the
    // actual door, forty metres away down the front wall, so "cut across" has
    // somewhere to point. Both are drawn while both are still live; once the
    // geometry has locked him into one, the other stops mattering and goes.
    // ROUND 16: the boxes come off doorTagBoxes() so the subject cluster's
    // keep-out and this fill are the same rectangles. Everything from the
    // projection down to the plate width is computed once, up there.
    const TAGS = doorTagBoxes(G, f);
    if (TAGS.length) {
      mark('doorTags');
      plateTag = 'door';
      const dr = f.door;
      TAGS.forEach(({ e, i, his, off, cx, cy, lbl, bw, ty, thr }) => {
        // Through the lens, same as the brackets. These land forty metres away
        // on the front wall, i.e. usually near the middle of frame where the
        // barrel's displacement is smallest — which is why the door tags never
        // looked obviously wrong and the subject brackets did.
        //
        // ---- ROUND 15: AN EDGE-CLAMPED TAG WAS ERASING THE COLD READOUT ----
        // Found by the ink ledger above on its second run, not by anybody
        // reading this code: with the subject off the left of frame and a door
        // off the left of frame, the bracket's readout clamps to `dw/2 + 4` and
        // this tag clamps to 56 — the same edge, the same rows — and this tag is
        // drawn LAST. `LAST SEEN 7.4s ±11m` came out as `◀ DOOR 1] 7.4s ±11m`,
        // with the words LAST SEEN painted out entirely by the tag's plate, so
        // the number lost the sentence that says what it counts. 53.3 px, on 25
        // census frames of one seed. shots/game_r15_overprint_cold_crop.png.
        //
        // Same family as the FOOTSTEPS banner and NOT the same mechanism: both
        // boxes are correctly measured, and they collide because two elements
        // clamp independently to one edge. So advance() cannot fix it and no
        // width audit would have found it.
        //
        // The fix follows what the clamp already means. Once this tag is
        // off-screen its `p.y` is not information — it is the projection of a
        // door that is behind you, and round 8's note two blocks up says the
        // edge belongs to the subject cluster. So an off-screen tag stops
        // pretending to have a vertical position and parks in one reserved row
        // under the subject's readout (which is clamped to 516 + 18 high). An
        // on-screen tag is untouched: it is attached to a real door by a stem
        // and its y is the door.
        const c = his ? (dr.sure ? RED : AMB) : DIM;
        const BO = DOORTAG_O;
        // These land on packed shelving forty metres away, which is the busiest
        // surface in the game. The plate has to be near-opaque or the tag is
        // just texture; the unchosen door is dimmed by colour, not by alpha.
        ctx.globalAlpha = his ? 1 : 0.85;
        // ROUND 17: `ty` is the row this tag actually gets, after stepping out
        // of the pursuit panel and the top band — see doorTagBoxes(). It equals
        // `cy - 9` on every frame where nothing was in the way, which is most of
        // them, so this is the same tag it always was until it would have been
        // painted out.
        ctx.fillStyle = 'rgba(3,7,4,0.94)'; ctx.fillRect(cx - bw / 2, ty, bw, 20);
        box(cx - bw / 2, ty, bw, 20, c);
        tx(lbl, cx, ty + 15, { ...BO, c, a: 'center' });
        // a stem down to the threshold, so the tag reads as attached to a door.
        // ROUND 15: not when the tag is off-screen — the stem would be pointing
        // at a patch of floor that has nothing to do with the door, which is the
        // same false-precision the chevron block above retires for `lost`.
        // ROUND 17: to the door's own threshold rather than a fixed 15 px, so a
        // tag that had to move down still points at the thing it names — and
        // NOT AT ALL once it has been pushed past the threshold, because a stem
        // pointing up at a patch of floor is the false precision round 15
        // retired for the chevron, in a shorter line.
        if (!off) {
          const y0 = ty + 21;
          const y1 = Math.min(thr == null ? y0 + 15 : thr, y0 + 30);
          if (y1 > y0 + 4) {
            ctx.strokeStyle = c; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y1); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      });
      plateTag = null;
    }

    topBand(G, FLOOR_BAND, FLOOR_LABEL, bandRects(G, f));
    // The complaint pips follow the officer out onto the floor and nothing else
    // does — see the RECORD panel's grave below. They are still only drawn once
    // there is something to draw.
    if (G.st.complaints > 0) {
      mark('complaintPips');
      for (let i = 0; i < 3; i++) {
        const on = i < G.st.complaints;
        ctx.fillStyle = on ? RED : 'rgba(255,255,255,0.10)';
        ctx.fillRect(300 + i * 13, 19, 9, 9);
        box(300 + i * 13, 19, 9, 9, on ? RED : LINE);
      }
      tx(`${G.st.complaints}/3 COMPLAINTS`, 344, 28, { s: 11, w: 'bold', c: RED, ls: 0.8 });
    }

    // ---- DISPATCHED TO — A DESTINATION IS NOT A PERMANENT FACT -------------
    // ROUND 9. Drawn on 100% of floor frames before this, including every frame
    // of every chase, where the biggest amber text on the screen named the
    // aisle the man had just left. It answers exactly one question — "where am
    // I walking" — and that question has an end: he starts running (the
    // pursuit panel and the brackets are the objective now, and they are on
    // HIM rather than on a place), or the case closes (the prompt band says
    // SUBJECT GONE — [Q] RETURN TO POST, which is the same sentence better
    // aimed). Both endings used to leave this panel up saying something stale
    // or something already said one band lower.
    //
    // The CAM 04 in its corner went with it: under one channel per aisle, a
    // panel reading AISLE 4 with CAM 04 beside it is the number twice.
    // ROUND 16: the gate and the box both live in dispatchRect() now, because
    // the marker cluster above has to reserve this rectangle and a second copy
    // of it here is how CLAUDE.md's opening hazard starts. `chasing` stays as
    // the word the rest of this function reads.
    const chasing = pursuitUp(f);
    const DR = dispatchRect(f);
    if (DR) {
      mark('dispatched');
      // ---- ROUND 11's OPEN GAP: NOT EVERY DISPATCH IS A DISPATCH YOU CAN WIN
      // The critic's finding was that a front-end call is drawn in exactly the
      // confident amber of a winnable aisle call while being, in its words,
      // almost always a losing move: the cop lands ~20 m behind a subject who
      // is 10 m from the door.
      //
      // The cure is NOT to withhold the dispatch or to grey it into
      // illegibility — a long shot you take anyway is a real decision and the
      // fiction is that the radio sends you regardless. It is to price it.
      // game.js publishes f.odds off the same route flood the pursuit panel
      // uses: metres from the zone they are sending you to, against metres from
      // where you will be standing. When the zone is closer to a door than you
      // are, this drops out of amber into a flat sand colour, says LONG SHOT,
      // and prints both numbers so the claim is auditable rather than a vibe.
      // Everything the player needs to disagree with it is on the panel.
      const odds = f.odds;
      const long = !!(odds && odds.long);
      panel(DR.x, DR.y, DR.w, DR.h, 'DISPATCHED TO');
      const dest = f.where || `AISLE ${(f.aisle ?? 0) + 1}`;
      tx(dest, DR.x + 10, 104, {
        s: dest.length > 9 ? 21 : 28, w: 'bold', c: long ? '#9a8a5e' : AMB, ls: 2,
        max: DR.w - 18,
      });
      if (long) {
        tx('LONG SHOT', DR.x + 10, 121, { s: 10, w: 'bold', c: '#ff9a2e', ls: 1.2 });
        tx(`DOOR ${Math.round(odds.him)}m / YOU ${Math.round(odds.you)}m`, DR.x + DR.w - 10, 121,
          { s: 10, w: 'bold', c: DIM, a: 'right' });
      }
    }

    // ---- THE ASSERTION, WHERE IT CAN BE SEEN --------------------------------
    // game.js's sightCheck() is the lungCheck() of this round, and a returned
    // { ok:false } that only ever reaches a console is an assertion nobody
    // runs. If the sight model ever breaks, every catch rate measured on the
    // build is describing a different game, so it says so on the screen the
    // measurement was taken from. It cannot fire on a correct build: nothing
    // sets f.sightBroken unless the published marker and the pursuit's belief
    // have actually diverged.
    if (f && f.sightBroken) {
      ctx.fillStyle = 'rgba(120,10,8,0.94)'; ctx.fillRect(0, 0, W, 22);
      tx('SIGHT MODEL BROKEN — HUD IS NOT THE PURSUIT\'S INFORMATION — see game.sightCheck()',
        W / 2, 16, { s: 12, w: 'bold', c: '#ffd9b3', a: 'center', ls: 0.6 });
    }

    // --- pursuit panel --------------------------------------------------------
    // TWO DOORS, 35 m apart, and he is going to exactly one of them. Everything
    // in here is the same question asked twice: can you get to that door before
    // he does, or do you have to run him down on the way? So each door carries
    // both halves of the race — his route metres and yours — and YOUR number
    // goes green on the door you would win. That is the whole decision.
    if (f && f.target && f.target.state === 'flee') {
      // ROUND 17: the panel's box comes off pursuitRect(), which is the same
      // object floorKeepOuts() reserved and doorTagBoxes() stepped around this
      // frame — memoised, so all four agree by construction rather than by three
      // of them recomputing the same hysteresis.
      const PR = pursuitRect(G, f) || PURSUIT_RECT;
      const { x: px, y: py, w: pw } = PR;
      const tight = PR.w < PURSUIT_RECT.w;
      const dr = f.door;
      const back = !!f.viaBack;
      mark('pursuit');
      if (tight) mark('pursuitTight');
      // ROUND 17 (second pass): every plate this block paints is the pursuit
      // panel's, and subjCheck() below has to be able to say "the PANEL is
      // standing on him" rather than "some chrome is". Same two-line mechanism
      // the subject cluster and the door tags already use; cleared before the
      // rear banner, which is a different element that happens to hang off this
      // rectangle. Everything still counts towards `chrome` — the tag narrows a
      // question, it does not exempt anybody.
      plateTag = 'pursuit';
      // ROUND 12: the panel's own title carries the sight state, because every
      // number underneath it — his route metres to each door, the progress
      // track, the ETA — is computed from the belief. While the belief IS him
      // the panel is a measurement and says nothing extra; the moment it is not,
      // the loudest text on the panel says so and starts a clock. This is the
      // difference between a HUD that is wrong and a HUD that is guessing out
      // loud, and only one of those is fair.
      // ROUND 13 adds the third title. Once the un-learn has fired, every door
      // number under this panel is computed from a belief that has been
      // FALSIFIED and rolled back to the last real sighting — so the panel is
      // not merely guessing, it is guessing again after being wrong once, and
      // saying "CONTACT LOST 9.4s" over the top of that understates it.
      const swept = !!(f.sight && f.sight.sweep);
      // ROUND 17: the long sweep title is 59 characters and the tight panel is
      // 330 px wide, so panel()'s `max` would clip it to `PURSUIT — REVERTED TO
      // LAS…` — a sentence whose whole content is in the half that gets cut. A
      // short form for the narrow box rather than a clipped long one. (These
      // three live here as literals, which round 12's copy sweep argues against;
      // the fourth is beside them rather than in a second place.)
      panel(px, py, pw, PR.h,
        swept ? (tight ? 'PURSUIT — WRONG WAY, REVERTED'
          : 'PURSUIT — REVERTED TO LAST SIGHTING · HE DID NOT GO THAT WAY')
          : stale ? `PURSUIT — CONTACT LOST ${age.toFixed(1)}s` : 'PURSUIT — SUBJECT FLEEING',
        { accent: swept ? '#b06a2e' : stale ? '#8a6a2e' : back ? '#ff7a2e' : RED, line: RED_D });

      // door chips, laid out left-to-right by where the doors actually are.
      // ROUND 17: not in the tight panel. A chip is 106x56 and there are two of
      // them; the one for the door he is NOT running at is the clearest case on
      // this screen of a number that decides nothing, and it is the room the man
      // needs. His own door keeps both halves of its race, one row down.
      const chips = !tight && dr ? dr.all.map((e, i) => ({ e, i })).sort((a, b) => a.e.x - b.e.x) : [];
      const cw = 106, chh = 56, cy = py + 20;
      const cx0 = tight ? px + pw - 10
        : px + pw - 12 - chips.length * cw - (chips.length - 1) * 8;
      chips.forEach(({ e, i }, k) => {
        const x = cx0 + k * (cw + 8);
        const his = i === dr.i;
        const c = his ? (dr.sure ? RED : AMB) : LINE;
        ctx.fillStyle = his ? 'rgba(52,10,7,0.75)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(x, cy, cw, chh);
        box(x, cy, cw, chh, his ? c : LINE);
        // title strip: filled when this is the one he is running at
        ctx.fillStyle = his ? c : 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, cy, cw, 15);
        tx(e.label + (his && !dr.sure ? ' ?' : ''), x + 6, cy + 12,
          { s: 11, w: 'bold', c: his ? '#07100a' : DIM, ls: 1.1 });
        const him = dr.him[i], you = dr.you[i];
        const win = you < him - 0.5;              // you would be standing there first
        // ROUND 16: three states, not two. `cut[i]` is game.js's word for
        // whether you can still be standing at this door first AT YOUR BEST —
        // see doorRead(). A door that is gone prints its metres exactly as
        // before, in the sand colour LONG SHOT already uses for "you may take
        // this, it is not free", with the word for it on the row. NOTHING IS
        // HIDDEN: the complaint this answers is that the panel took four
        // seconds to say something it knew, not that it said too much.
        const gone = dr.cut ? !dr.cut[i] : false;
        tx('HIM', x + 6, cy + 31, { s: 9, c: DIM });
        tx(isFinite(him) ? `${him.toFixed(1)}m` : '—', x + cw - 6, cy + 31,
          { s: 13, w: 'bold', c: his ? c : DIM, a: 'right' });
        tx(gone ? 'NO CUT' : 'YOU', x + 6, cy + 49,
          { s: 9, w: gone ? 'bold' : '', c: gone ? '#9a8a5e' : DIM });
        tx(isFinite(you) ? `${you.toFixed(1)}m` : '—', x + cw - 6, cy + 49,
          { s: 13, w: 'bold', c: gone ? '#9a8a5e' : win ? GRN : '#ff9a2e', a: 'right' });
      });

      // his run to that door, as a track
      //
      // ---- ROUND 17: THE ROWS ARE IN READING ORDER NOW ---------------------
      // Round 16 put GAP at 13 px (19 on NO CUT) on the BOTTOM row, under two
      // 106x56 chips whose HIM/YOU numerals were 13 px bold and colour-coded in
      // the top right. The critic's photograph of a 2.3 m gap is the argument:
      //
      //     GAP 2.3m                 small, left
      //     HIM 16.7 / YOU 15.1      LARGE, top-right, colour-coded
      //
      // "The two numbers that decide nothing are the two that read first."
      // Round 16's fix was honest and it was a SIZE SWAP on one condition
      // (`noCut`); this is the ranking. GAP is the interception race — it moves
      // with every stride and every powerup and it is undecided until the last
      // metre — so it takes the top-left of the body at 26 px, twice the height
      // of anything else on the panel, in every state rather than in one. The
      // door race keeps its numbers and loses the argument about which is
      // bigger, which is all the complaint was ever about.
      //
      // MEASURED OFF THE INK LEDGER, at the gap the complaint was filed at —
      // every string this file drew above y 200 on a live 2.41 m CONTACT frame,
      // sorted by the size it was actually typeset at:
      //
      //     GAP 2.4m                 26 px      <- the race that is still open
      //     REC                      26 px         (the recording blip)
      //     08/27/2026 23:13:24      16 px
      //     ON FOOT — UNIT 1         14 px
      //     OUT IN 17.7s             14 px
      //     59.6m  /  60.8m          13 px      <- HIM / YOU, half the height
      //
      // The critic's frame carried `GAP 2.3m` small and left against
      // `HIM 16.7 / YOU 15.1` LARGE and colour-coded. shots/r17_rank_r17.png.
      //
      // ---- ROUND 21 CORRECTS THIS CLAIM, AGAINST THE OLD SOURCE -----------
      // What used to be written here was "it is now exactly 2:1 the other way".
      // The SHIPPED half of that is true and reproduces on the pixels — round
      // 20's critic re-read the live ink ledger at 3.17 m CONTACT and got GAP 26
      // px against HIM/YOU 13 px. The COMPARISON is not.
      //
      //     git show HEAD:src/game/hud.js
      //       GAP        s: noCut ? 19 : 13
      //       HIM / YOU  s: 13   (inside a 106x56 filled chip)
      //
      // So the TYPE ratio went 1.00 -> 2.00 in the ordinary state and 1.46 ->
      // 2.00 on `noCut`. It was never 1:2. What round 16 inverted was
      // PROMINENCE — a filled, colour-coded 106x56 chip in the top right against
      // a bare left-aligned string — and prominence and point size are two
      // different claims. "Exactly 2:1 the other way" was inferred from the
      // complaint about the old layout rather than read off the old layout.
      // WHEN YOU CLAIM A REVERSAL, DIFF THE OLD SOURCE.
      //
      // HONEST LIMIT: this is the one part of the round with NO executable
      // before. `hud.bands('r16')` restores the round-16 RECTANGLE, not the
      // round-16 type scale, so the ranking cannot be A/B'd on one page load the
      // way the panel's shape can. The evidence for it is the ledger table above
      // and the diff, not an ablation — which is exactly why the sentence that
      // had no ablation behind it is the one that turned out to be wrong.
      const barH = tight ? 8 : 14;
      const tx0 = px + (tight ? 10 : 12);
      const tw = Math.max(120, cx0 - (tight ? 0 : 16) - tx0);
      const bar = py + (tight ? 52 : 46);
      const gapY = py + (tight ? 46 : 40);       // baseline of the headline row
      const footY = py + PR.h - 4;               // baseline of the small row
      const prog = 1 - Math.min(1, f.exitDist / Math.max(0.001, f.exitDist0));
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(tx0, bar, tw, barH);
      ctx.fillStyle = back ? '#7a3a12' : RED; ctx.fillRect(tx0, bar, tw * prog, barH);
      box(tx0, bar, tw, barH, RED_D);
      const mx = tx0 + tw * prog;
      ctx.fillStyle = '#fff'; ctx.fillRect(mx - 1, bar - 4, 3, barH + 8);
      // ROUND 9: silent when there is only one way out. `ROUTE COMMITTED` is
      // the answer to "can his door preference still overrule the geometry",
      // and with a single exit that question does not exist — it was printing
      // a certainty about a choice nobody was making, every frame of every
      // chase. The moment agents.js opens a second door it speaks again.
      // ROUND 16: this row is ABOUT the door race, so it is the row that gets to
      // say the door race is finished. `RUN HIM DOWN` is not advice the HUD
      // invented — it is the only remaining way to win, stated once, on the
      // line that already carried the other verdict about the same question.
      const twoDoors = !!dr && dr.all.length > 1;
      const noCut = !!(dr && dr.noCut);
      if (noCut) mark('pursuitNoCut');
      // =====================================================================
      // ROUND 21 — FOUR ELEMENTS, ONE ROW, ONE CURSOR
      // =====================================================================
      // Round 20 shipped a live overprint here and it is the class that round
      // cites. The row typeset `YOU 40m` at x 208 w 47 and the verdict at x 202
      // w 128 — the verdict starting SIX PIXELS LEFT of the number and drawn
      // after it, rendering `NIOU40m`. shots/r20c_crop_overprint.png.
      //
      // BOTH BOXES WERE MEASURED CORRECTLY. `advOf` had the width of every
      // string on the row and the layout was still wrong, because four elements
      // clamped INDEPENDENTLY into the same 310 px span: three at fixed
      // fractions (0.02 / 0.30 / 0.60 of `tw`) and one right-aligned at the far
      // end, each with its own `max`, none of them aware of a neighbour.
      // Measuring a string is not laying out a row. Four correct measurements
      // and no cursor is a collision waiting for the longest verdict.
      //
      // So there is a cursor, and the invariant is one sentence: NO CELL'S
      // RIGHT EDGE PASSES THE VERDICT'S LEFT EDGE. The verdict is placed first
      // because it is the only element here that is a sentence rather than a
      // number, every other cell's width is `min(its advance, its cap, the room
      // the cursor has left)`, and a cell squeezed under FOOT_MIN is dropped
      // rather than printed as a two-letter stub.
      //
      // ---- AND ONE THING IS DROPPED OUTRIGHT FROM THE TIGHT PANEL ---------
      // Four cells do not fit in 310 px however they are laid out — measured:
      // subj 47 + door 74 + you 47 + verdict 128 + three gaps = 320. Something
      // gives, and the tight panel already has the rule for choosing what: it
      // dropped the chip for the door he is NOT running at, as "the clearest
      // case on this screen of a number that decides nothing". The case number
      // is a DUPLICATE — `f.subjCode` and the bracket's own `f.target.code` are
      // the same string out of game.js:3496, and the bracket prints it over his
      // head on every chase frame. The wide panel keeps it; it has the room.
      //
      // ---- AND THE BUG IS EXECUTABLE, WHICH IS HOW IT IS SCORED -----------
      // Round 15's rule: make the rejected layout selectable by name so the
      // probe runs against the bug and not only against the fix. `hud.bands`
      // below 'r21' rebuilds round 20's four independent clamps exactly, so the
      // overprint and its absence are one hud.bands() call apart on a
      // byte-identical frame — the only ablation form this project trusts.
      if (!from('r21')) {
        tx(f.subjCode || 'SUBJECT', tx0 + 2, footY, { s: 10, c: DIM, max: tw * 0.42 });
        if (tight && dr && dr.all[dr.i] && isFinite(dr.him[dr.i])) {
          const gone0 = dr.cut ? !dr.cut[dr.i] : false;
          tx(`${dr.all[dr.i].label}${dr.sure ? '' : ' ?'}  ${dr.him[dr.i].toFixed(0)}m`,
            tx0 + 2 + tw * 0.30, footY,
            { s: 10, w: 'bold', c: dr.sure ? RED : AMB, max: tw * 0.30 });
          tx(`YOU ${isFinite(dr.you[dr.i]) ? dr.you[dr.i].toFixed(0) + 'm' : '—'}`,
            tx0 + 2 + tw * 0.60, footY,
            { s: 10, w: 'bold', max: tw * 0.24,
              c: gone0 ? '#9a8a5e' : dr.you[dr.i] < dr.him[dr.i] - 0.5 ? GRN : '#ff9a2e' });
        }
        tx(noCut ? (f.doorNoCut || 'NO CUT — RUN HIM DOWN')
          : twoDoors ? (dr.sure ? (f.doorLock || 'ROUTE COMMITTED')
            : (f.doorOpen || 'BOTH DOORS LIVE')) : '',
        tx0 + tw, footY,
        { s: 10, w: 'bold', c: noCut ? '#9a8a5e' : dr && dr.sure ? RED : AMB, a: 'right',
          max: tw * (tight ? 0.42 : 0.6) });
      } else {
      const FOOT_O = { s: 10, w: 'bold' };
      const FOOT_GAP = 8, FOOT_MIN = 16;
      const verdict = noCut ? (f.doorNoCut || 'NO CUT — RUN HIM DOWN')
        : twoDoors ? (dr.sure ? (f.doorLock || 'ROUTE COMMITTED')
          : (f.doorOpen || 'BOTH DOORS LIVE')) : '';
      const vW = verdict ? Math.min(advOf(verdict, FOOT_O), tw * (tight ? 0.44 : 0.6)) : 0;
      const vX0 = tx0 + tw - vW;               // the verdict's left edge, and the wall
      const cells = [];
      if (!tight) {
        cells.push({ s: f.subjCode || 'SUBJECT', o: { s: 10, c: DIM }, cap: tw * 0.42 });
      }
      // his door's own race, off the same dr.him/dr.you the chips read — not a
      // summary of them, the numbers themselves.
      if (tight && dr && dr.all[dr.i] && isFinite(dr.him[dr.i])) {
        const gone = dr.cut ? !dr.cut[dr.i] : false;
        cells.push({ s: `${dr.all[dr.i].label}${dr.sure ? '' : ' ?'}  ${dr.him[dr.i].toFixed(0)}m`,
          o: { ...FOOT_O, c: dr.sure ? RED : AMB }, cap: tw * 0.34 });
        cells.push({ s: `YOU ${isFinite(dr.you[dr.i]) ? dr.you[dr.i].toFixed(0) + 'm' : '—'}`,
          o: { ...FOOT_O,
            c: gone ? '#9a8a5e' : dr.you[dr.i] < dr.him[dr.i] - 0.5 ? GRN : '#ff9a2e' },
          cap: tw * 0.28 });
      }
      let footX = tx0 + 2;
      for (const c of cells) {
        const room = (verdict ? vX0 - FOOT_GAP : tx0 + tw) - footX;
        const w = Math.min(advOf(c.s, c.o), c.cap, Math.max(0, room));
        if (w < FOOT_MIN) break;               // no room left: stop, do not stub
        tx(c.s, footX, footY, { ...c.o, max: w });
        footX += w + FOOT_GAP;
      }
      // ROUND 12 (copy sweep): these three were string literals HERE while
      // ./game/lines.js exported DOOR_OPEN and DOOR_LOCK that nothing read. Two
      // owners of four words, and the dead half is the one a writer would have
      // edited. Off `f` now, same as backLine/backSub two blocks down.
      if (verdict) {
        tx(verdict, tx0 + tw, footY,
          { ...FOOT_O, c: noCut ? '#9a8a5e' : dr && dr.sure ? RED : AMB, a: 'right', max: vW });
      }
      }
      // Same rule as the bracket's number: a tenth of a metre is a measurement
      // and only CONTACT has one. The ETA is a prediction either way, but a
      // prediction off a reckoned position is a prediction about a guess, so it
      // gets the tilde too rather than quietly staying crisp.
      // ---- AND THE RACE THAT IS STILL LIVE GETS THE TYPE --------------------
      // The whole of the round-16 design decision is these two lines. GAP is
      // the interception race: it moves with every stride and every powerup and
      // it is undecided until the last metre, and it was 13 px underneath two
      // chips carrying a race that had been over for four seconds. When the
      // door race ends, the size follows the question that is still open. It is
      // the same number in the same slot — only the emphasis moves, because the
      // problem was never that the panel said too much, it was that the loudest
      // thing on it had stopped changing.
      tx(sg === 'contact' ? `GAP ${f.dist.toFixed(1)}m` : `GAP ~${Math.round(f.dist / 2) * 2}m`,
        tx0 + 2, gapY,
        { s: 26, w: 'bold', c: stale ? '#8a7a4a' : noCut ? '#ffd08a' : AMB, ls: 1.2 });
      tx(f.eta ? `${stale ? 'OUT IN ~' : 'OUT IN '}${f.eta.toFixed(1)}s` : '', tx0 + tw, gapY,
        { s: tight ? 12 : 14, w: 'bold', c: stale ? '#8a6a2e' : back ? '#ff9a2e' : RED,
          a: 'right' });

      // --- THE COMMITMENT MOMENT ---------------------------------------------
      // He has turned and broken for the rear cross-aisle. It is the one
      // irreversible decision in this chase and it is worth thirty metres, and
      // until now the player found out about it by losing. Say it out loud.
      plateTag = null;                    // the banner is not the panel
      const BL = backLayout(G, f);
      if (BL) {
        const BK = BL.rect;
        mark('backBanner');
        if (BL.stacked) mark('backBannerStacked');
        const fl = (G.now % 0.8) < 0.5;
        ctx.fillStyle = fl ? 'rgba(128,44,8,0.95)' : 'rgba(58,20,4,0.95)';
        ctx.fillRect(BK.x, BK.y, BK.w, BK.h);
        box(BK.x, BK.y, BK.w, BK.h, fl ? '#ff7a2e' : '#7a3a12');
        // One row while both strings fit side by side; two when they do not.
        // Every number here comes off BL, so the box drawn above and the rows
        // drawn into it are the same derivation — see backLayout().
        tx(BL.main, BK.x + BL.pad, BK.y + (BL.stacked ? 19 : 23),
          { ...BL.mo, c: fl ? '#ffd9b3' : '#ff9a2e' });
        if (BL.sub) {
          tx(BL.sub,
            BL.stacked ? BK.x + BL.pad : BK.x + BK.w - BL.pad,
            BK.y + (BL.stacked ? 39 : 23),
            { ...BL.so, c: fl ? '#ffb98a' : '#a3521c', a: BL.stacked ? 'left' : 'right' });
        }
      }
    }

    // --- WIND: A CADENCE INSTRUMENT, NOT A BUDGET ----------------------------
    // ROUND 5. This panel used to be a 22-segment bar draining a 3.10 s tank
    // that took 9.1 s to refill, against a 3.0 s median chase — an honest
    // picture of a one-shot resource, and a resource is not a decision. The
    // tank is 1.40 s now and comes back in 0.81 s off the key, so a 5.8 s chase
    // holds 2.6 complete spend-and-refill cycles and the question stops being
    // "how much is left" and becomes "do I go NOW or in half a second". Four
    // changes, all of them the same change:
    //   * SEGMENTS ARE BURSTS. Sized off burstMax rather than a hardcoded 22 —
    //     at a 1.40 s tank, 22 segments is one every 64 ms, which is noise. Fat
    //     and countable, because "I have two left" has to land in peripheral
    //     vision during a chase.
    //   * THREE STATES, NOT TWO. READY / RECOVERING / WINDED, off the state
    //     machine agents.js reports, instead of re-deriving it from stamina<eps.
    //   * THE HEADLINE IS THE DECISION. With wind in hand it is the seconds of
    //     run you are holding; winded, it is the seconds until you can go —
    //     and that countdown ONLY MOVES WITH THE KEY UP. agents.js hands it
    //     over as Infinity while it is held, so the panel says LET GO instead
    //     of a number. That is the whole lesson of the round, on a readout.
    //   * THE FLASH MOVED FROM SPENDING TO READY. Pulsing while you sprint
    //     tells a man holding a key that he is holding a key; flaring the
    //     instant the tank returns is what a rhythm is cued off. See report().
    // ROUND 9 took the fifth element off this panel — see PULSE's grave below —
    // and the movement keys off the bottom row once they have been used. What
    // is left is four things, all of which change during a chase.
    //
    // NOT HERE, DELIBERATELY: anything pointing at a powerup. A drink in hand
    // is worth +13 points and going to fetch one is worth nothing, because the
    // detour costs what the drink buys. Opportunism is a reward; a HUD that
    // sent players shopping mid-chase would be selling a losing plan.
    const t = G.tel, sx = 10, sy = 606, sw = 470, sh = 104;
    const bMax = t.burstMax || (t.staminaMax || 1);
    const frac = Math.max(0, Math.min(1, t.windFrac != null ? t.windFrac
      : t.stamina / (t.staminaMax || 1)));
    const gassed = t.wind === 'winded' || t.gassed;
    const burst = gassed ? 0 : (t.burst != null ? t.burst : frac * bMax);
    const held = t.windIn === Infinity;           // key still down: nothing is coming back
    const boost = t.boost > 0;
    const lvl = frac < 0.34 ? '#ff9a2e' : GRN;
    const col = boost ? '#ffe36a' : gassed ? RED : t.wind === 'ready' ? GRN : lvl;
    const state = boost ? 'SUGAR' : gassed ? 'WINDED'
      : t.sprint ? 'SPRINTING' : t.wind === 'ready' ? 'READY' : 'RECOVERING';

    mark('wind');
    // ROUND 21: tagged. 59% of my baseline chrome statistic (2.43 of 4.11
    // points) is THIS panel, and round 20's critic found the same thing at 73%
    // — every one of those frames a frame where the man is 87-93% off the
    // BOTTOM of the screen. It is named now, so the next round can decompose
    // the number without grepping a line number out of a site string. Tagging
    // exempts nobody: `only === 'chrome'` is `tag !== 'subj'`, so this still
    // counts towards every chrome figure this file publishes.
    plateTag = 'wind';
    panel(sx, sy, sw, sh, 'WIND', { accent: col, line: gassed ? RED_D : LINE });
    // the tank just came back — go
    const flare = t.readyAt != null && G.now - t.readyAt < 0.4;
    if (flare) {
      ctx.globalAlpha = 0.85 * (1 - (G.now - t.readyAt) / 0.4);
      box(sx - 3, sy - 3, sw + 6, sh + 6, GRN, 3); ctx.globalAlpha = 1;
    }

    // segments = bursts. Countable, sized off the model.
    const segs = Math.max(2, Math.min(6, Math.round(bMax / 0.45)));
    const bw2 = sw - 148;
    segbar(sx + 16, sy + 28, bw2, 32, boost ? 1 : burst / bMax,
      { on: col, seg: segs, line: gassed ? RED_D : LINE });
    // Winded is a full-refill lockout, so the segments stay dark for the whole
    // 0.81 s. The tank IS filling though, and watching it fill is the thing
    // that teaches the rhythm — so it gets its own strip rather than nothing.
    if (gassed) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(sx + 16, sy + 66, bw2, 6);
      ctx.fillStyle = held ? RED_D : RED; ctx.fillRect(sx + 16, sy + 66, bw2 * frac, 6);
      box(sx + 16, sy + 66, bw2, 6, RED_D);
    }

    // state + the one number that is a decision
    tx(state, sx + sw - 14, sy + 44, { s: 15, w: 'bold', c: col, a: 'right', ls: 1.6 });
    const flash = (G.now % 0.66) < 0.40;
    let head, hc = col;
    if (boost) head = `${t.boost.toFixed(1)}s`;
    else if (gassed && held) { head = flash ? 'LET GO' : ' '; hc = RED; }
    else if (gassed) head = `${Math.max(0, t.windIn || 0).toFixed(1)}s`;
    else head = `${burst.toFixed(1)}s`;
    tx(head, sx + sw - 14, sy + 78, { s: 26, w: 'bold', c: hc, a: 'right', ls: 1 });

    // Bottom row: what the key is doing, and a pulse that remembers. The held
    // line states the mechanic rather than instructing — the headline next to it
    // already says LET GO, and this is a DVR, not a coach.
    const hint = gassed && held ? 'KEY HELD — NO RECOVERY'
      : gassed ? 'WIND RETURNING'
      : t.sprint ? '[SHIFT] SPRINTING'
      : null;
    if (hint) {
      tx(hint, sx + 16, sy + 92,
        { s: 12, w: gassed ? 'bold' : '', c: gassed && held ? RED : gassed ? '#ff9a2e' : DIM, ls: 1 });
    } else {
      // ...and when there is no state to report, the movement keys, until he
      // has used them. See keyRow: the words that teach WASD are worth printing
      // once and worth nothing on the four hundredth frame of a chase.
      keyRow(G, sx + 16, sy + 92, sw - 40, ['sprint'], { mark: 'floorKeyHint' });
    }
    plateTag = null;
    // ---- PULSE, RETIRED IN ROUND 9 ---------------------------------------
    // `PULSE 148` in the corner of this panel, on 100% of floor frames, for
    // three rounds. Round 6 defended it as the lagging signal that carries a
    // whole chase's worth of wear where a bar this fast cannot — which was true
    // and still is, and is an argument for the SIGNAL rather than for a number.
    //
    // agents.js integrates `fatigue` once and the cop's own body is driven off
    // that same value: at 0.55 he starts putting his hands on his knees, which
    // is exactly the threshold this readout was tuned to turn red at. The lag
    // was therefore already on screen, 1.75 m tall, in the middle of the frame
    // the player is staring at. Restating it as three digits is the fourth
    // telling again, in the one panel that IS read under pressure — and it was
    // the only element on it that never changed a decision. If the heave ever
    // stops reading, the fix goes on the BODY and not back into this corner.

    if (gassed) { mark('gassedFrame'); // red frame creep, so you feel it without reading anything
      const a = 0.12 + 0.1 * Math.sin(G.now * 8);
      ctx.strokeStyle = `rgba(255,74,58,${a})`; ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, W - 14, H - 14);
    }

    // ---- THE RECORD PANEL, RETIRED IN ROUND 9 ----------------------------
    // 270x104 px, bottom right, 100% of floor frames: rank, points, three
    // complaint pips and a key hint. On the floor the player is doing exactly
    // one thing — catching a man — and not one of those four facts changes
    // anything he is about to do about it. Points and rank are a RECORD: they
    // are settled at the write-up, full screen, with a progress bar and a
    // manager who cannot stop talking, which is the correct and much funnier
    // place for them. The pips moved into the band and only appear once you
    // have earned one; [Q] moved into keyRow and erodes after the first press.
    keyRow(G, 1126, 700, 150, ['post'], { plate: true, mark: 'floorKeyHint' });

    // --- centre prompt / dialogue
    // ROUND 7 — THE WARNING HAS TO SURVIVE THE THING THAT CAUSED IT.
    // The guest yelling at you IS a dialogue, and the dialogue panel occupies
    // exactly the band the prompt uses, so the first cut of the back-off
    // warning was drawn and then immediately hidden behind the shout that
    // triggered it — a countdown nobody could see. They are two different
    // messages: the yell is him, the warning is the game, and during the grace
    // window BOTH are on screen with the warning parked above the panel.
    // ROUND 16: box and offset both off dialogueRect()/promptYOf(). See the
    // RESERVED BANDS block — the marker cluster reserves this rectangle, so it
    // has to be the same one that gets painted.
    const DG = dialogueRect(f);
    if (DG) {
      mark('dialogue');
      const d = f.dialogue;
      panel(DG.x, DG.y, DG.w, DG.h, d.speaker, { accent: d.bad ? RED : '#9bb9a4' });
      d.shown.forEach((ln, i) => tx(ln, DG.x + 16, DG.y + 40 + i * 26,
        { s: 17, c: '#e8f4ea', ls: 0.4, max: DG.w - 32 }));
    }
    // ---- ROUND 14: THE BLIND BOLT ------------------------------------------
    // `TUNING.suspicionRadius` is raw 2D distance, so a man bolts at 4.5 m
    // through a 2.05 m gondola and the sight model — correctly — has nothing to
    // draw. game.js hears it instead: see its onBolt() and L.HEARD_BOLT for why
    // a footfall at that range is honest evidence and a bearing is not.
    //
    // The whole design of this element is what it REFUSES to do. It is centred,
    // so it points nowhere. It carries no code, no aisle, no distance and no
    // chevron, because sound through a shelf gives you none of those. It sits
    // ABOVE the prompt band rather than replacing it, because the player's
    // standing order has not changed — he has just been told the store made a
    // noise. `heardLeft` is a 1 -> 0 ramp computed in game.js; this file does
    // not know how long the cue lasts and must not.
    const hl = f ? (f.heardLeft || 0) : 0;
    if (hl > 0) {
      mark('heard');
      // ---- ROUND 15: AND IT PRINTED THE OPPOSITE OF ITS MEANING ------------
      // This banner shipped with `hw = 420` and the main line centred on a
      // hand-picked `W/2 - 34`. Measured: the main line spans 434.5 -> 777.5 and
      // the right-aligned sub spans 748.9 -> 838, so they overprint by a
      // deterministic 28.6 px and the characters destroyed are `NOT`. The player
      // reads FOOTSTEPS — SOMEONE JUST RAN, CLOSE[BY/NOT] IN SIGHT. No seed, no
      // pose, no frame dependence — pure layout arithmetic, on every firing.
      //
      // advance() has been in this file since round 9 and exists for exactly
      // this. It was 1,360 lines above and it did not travel. The check that
      // does travel is the ink ledger next to it — this box is now laid out FROM
      // the measured strings, so the numbers cannot go stale when lines.js
      // rewrites the copy, and the ledger fails loudly if anybody lays out the
      // next one by eye.
      const MO = { s: 13, w: 'bold', ls: 1.2 };
      const SO = { s: 11, ls: 0.8 };
      const main = f.heardLine || '', sub = f.heardSub || '';
      const wMain = advOf(main, MO), wSub = advOf(sub, SO);
      // PAD each side, GAP between the two. The box takes whatever that needs
      // and never less than the 420 it used to be, so a short line still reads
      // as a banner rather than shrink-wrapping to its text.
      // ROUND 16: the box comes off heardRect() so the marker cluster's keep-out
      // and this fill are one rectangle, not two that agree today.
      const PAD = HEARD_PAD, GAP = HEARD_GAP;
      const HR = heardRect(f);
      const hw = HR.w, hx = HR.x, hy = HR.y;
      const bl = 0.45 + 0.55 * Math.min(1, hl * 2.2);   // loudest at the instant
      ctx.globalAlpha = Math.min(1, hl * 3);
      ctx.fillStyle = 'rgba(6,10,6,0.88)'; ctx.fillRect(hx, hy, hw, 30);
      box(hx, hy, hw, 30, '#8fae97');
      // The words come off `f`, like every other line on this screen —
      // ./game/lines.js owns them and this file owns the pixels.
      //
      // The main line stays CENTRED, because the element's whole design is that
      // it points nowhere (see the ROUND 14 note above) — but centred in the
      // space the sub does not occupy, not on a guess at where that space ends.
      const subX0 = hx + hw - PAD - wSub;
      tx(main, (hx + PAD + (subX0 - GAP)) / 2, hy + 20,
        { ...MO, c: `rgba(190,222,198,${bl.toFixed(2)})`, a: 'center' });
      tx(sub, hx + hw - PAD, hy + 20, { ...SO, c: '#6f8a77', a: 'right' });
      ctx.globalAlpha = 1;
    }
    if (f && f.prompt && (!f.dialogue || f.backOff)) {
      // ROUND 7: the quiet line is the one prompt in the game that is not an
      // instruction, and an amber alert box reading NOTHING IS HAPPENING is a
      // contradiction in its own frame. Same band, same place, no border, and
      // the store's own dim green — it has to look like the absence of an
      // order rather than another one.
      mark('prompt'); if (f.backOff) mark('backOff');
      const q = f.promptQuiet;
      // ROUND 7: the back-off warning is the only prompt in the game with a
      // clock on it, so it is the only one that is red and the only one that
      // draws the clock. Everything else here is advice; this one expires.
      const bo = f.backOff;
      // ROUND 15 (width audit): was `f.prompt.length * (q ? 8.2 : 9) + 40`, and
      // this is the one that was actually short — the band is drawn at ls 1.4,
      // so 9 px a character under-counts by 1.4 px a character and a long prompt
      // ran out of its own amber box. Measured off the same options bag the text
      // is drawn with, so the two cannot drift.
      // ROUND 16: same as the heard banner — one owner, promptRect().
      const PO = promptOpts(f);
      const PR = promptRect(f);
      const w2 = PR.w, x2 = PR.x, py = PR.y;
      const flash = bo && (G.now % 0.5) < 0.3;
      ctx.fillStyle = bo ? (flash ? 'rgba(90,12,8,0.92)' : 'rgba(48,8,6,0.9)')
        : q ? 'rgba(3,7,4,0.62)' : 'rgba(3,7,4,0.86)';
      ctx.fillRect(x2, py, w2, 34);
      if (bo) box(x2, py, w2, 34, RED, 2);
      else if (!q) box(x2, py, w2, 34, AMB);
      tx(f.prompt, W / 2, py + 23, {
        ...PO,
        c: bo ? (flash ? '#ffd9d3' : RED) : q ? '#8fae97' : AMB,
        a: 'center',
      });
      if (bo) {                       // the deadline, draining right to left
        ctx.fillStyle = RED;
        ctx.fillRect(x2, py + 34, w2 * (f.backOffLeft || 0), 3);
      }
    }
    if (f && f.stampT > 0) {
      mark('stamp');
      ctx.globalAlpha = Math.min(1, f.stampT * 2.2);
      const sc = f.stampTone === 'flat' ? AMB : RED;
      stamp(f.stampText, W / 2, STAMP_Y, { s: STAMP_S, c: sc, rot: STAMP_ROT });
      // ROUND 15 (width audit): was `f.stampSub.length * 9 + 28`.
      // ROUND 12: ...and its y was a hardcoded 268, a transcription of the
      // stamp's geometry into a second file position — right for a short stamp
      // and 26 px INSIDE a long one. Both the box and the row come off
      // stampLayout() now, which is also what the marker cluster reserves.
      const SL = stampLayout(f);
      if (SL && SL.sub) {
        ctx.fillStyle = 'rgba(3,6,4,0.82)';
        ctx.fillRect(SL.sub.x, SL.sub.y, SL.sub.w, SL.sub.h);
        tx(f.stampSub, W / 2, SL.sub.y + 16, { ...STAMP_SUB_O, c: sc, a: 'center' });
      }
      ctx.globalAlpha = 1;
    }
    // 80 high, not 84: the ticker's backing plate starts at y=688 and the
    // panel's bottom border was landing inside it.
    paFloor(G, f, 492, 606, 498, 80);
    lookGauge(G, LOOK_RECT.x, LOOK_RECT.y, LOOK_RECT.w, LOOK_RECT.h);
    ticker(G, 500, 700, 480, true, H);   // nothing below the canvas, see ticker()
    burnIn();
  }

  // ==========================================================================
  // ROUND 8 — THE HANDSET, ON THE FLOOR
  // ==========================================================================
  // There was no PA readout on this screen at all, because until this round
  // there was no PA on this screen: [F] was gated on `mode === 'desk'`. It is
  // not any more — a man who has walked into the aisle and can see what the
  // subject's hands are doing is the man with something to say — so the state
  // has to be visible here for the same reason it has to be visible at the
  // desk. An open microphone with nothing on screen is the client's complaint.
  //
  // ALWAYS DRAWN, in all three of its states, which is the actual lesson of
  // this round: the desk button was hidden whenever no subject was selected and
  // that is how a live capture device ended up with no pixels anywhere.
  function paFloor(G, f, x, y, w, h) {
    if (!f) return;
    const H2 = G.hold || {};
    const air = !!H2.talk;
    const RED_AIR = '#ff4a3a';
    const a = H2.pbAt;                        // ROUND 10: was f.annAt; see game.js `ann`
    const held = a && !a.out;                 // keyed, and he has not reacted yet
    // ---- ROUND 9: THE IDLE PANEL COLLAPSES TO ONE LINE --------------------
    // Round 8 put this panel up on every floor frame and the reasoning was
    // right for the case it was reasoning about: a live capture device with no
    // pixels anywhere is the client's "it looks like it's recording but it
    // doesn't do anything". That argument covers ON AIR, and it covers an
    // announcement in flight. It does not cover the third state, which is
    // NOTHING IS HAPPENING — and nothing was happening on 100% of the floor
    // frames of a competent shift, because a player who never keys the handset
    // still got 498x80 px of panel, a title tab, and the permanent footnote
    // SAYS IT OUT LOUD. EVERYONE HEARS IT.
    //
    // So the readout is now exactly as big as the situation. Idle: one dim
    // line naming who the handset is pointed at, with the key in front of it
    // until he has pressed it once. Live or announcing: the whole panel,
    // unchanged, meter and all.
    if (!air && !a) {
      mark('paIdle');
      const cd = !H2.pbReady && H2.pbIn > 0;
      const key = (G.taught && G.taught.pa) ? '' : '[F] ';
      const line = cd ? `PA BUSY — ${H2.pbIn.toFixed(1)}s` : key + (f.paLabel || 'PA');
      plate(x - 6, y + 24, Math.min(w + 12, advance(line, 12, cd ? 'bold' : '', 1) + 24), 19);
      tx(line, x + 2, y + 38,
        { s: 12, w: cd ? 'bold' : '', c: cd ? '#ff9a2e' : '#9fbfa8', ls: 1, max: w });
      return;
    }
    mark('paPanel');
    const acc = air ? RED_AIR : a ? (a.out === 'heed' ? GRN : AMB) : '#4d5f52';
    panel(x, y, w, h, 'PA HANDSET', { accent: acc, line: air ? RED_D : LINE });

    // Line 1 — WHO, or ON AIR. The two can be true together: keying the handset
    // fires the announcement and opens the channel on the same keydown.
    if (air) {
      const blink = (G.now % 0.9) < 0.55;
      ctx.fillStyle = blink ? RED_AIR : 'rgba(255,74,58,0.35)';
      ctx.beginPath(); ctx.arc(x + 20, y + 34, 5, 0, 7); ctx.fill();
      tx('ON AIR', x + 34, y + 39, { s: 16, w: 'bold', c: RED_AIR, ls: 1.8 });
      // The level meter is the only proof the player has that the store can
      // hear him. It is worth more than any label on this panel.
      const mx = x + 130, mw = w - 200, cells = 16;
      const lit = Math.round(clampN(H2.talkLevel || 0, 0, 1) * cells);
      for (let i = 0; i < cells; i++) {
        const cw = mw / cells;
        ctx.fillStyle = i < lit
          ? (i > cells - 4 ? RED_AIR : i > cells - 8 ? '#ffb43a' : '#7fe0a0')
          : 'rgba(255,255,255,0.09)';
        ctx.fillRect(mx + i * cw, y + 26, cw - 2, 16);
      }
      tx(`${(H2.talkFor || 0).toFixed(1)}s`, x + w - 14, y + 39,
        { s: 13, w: 'bold', c: 'rgba(255,138,124,0.85)', a: 'right' });
    } else {
      tx(a ? a.label : (f.paLabel || 'PA'), x + 14, y + 39,
        { s: 15, w: 'bold', c: a ? AMB : (f.paAim ? AMB : DIM), ls: 1, max: w - 28 });
    }

    // Line 2 — WHAT HE DID, and it is allowed to say "nothing yet".
    //
    // THE WAIT STATE IS NOT A GAP TO BE FILLED. agents.js rolls the reaction
    // 0.35-0.95 s after the handset is keyed and delivers it through
    // onAnnounce, explicitly so that no HUD line can get ahead of the picture.
    // The honest readout for that second is that he has not reacted yet, and
    // anything cleverer here — a prediction, an optimistic label, a probability
    // — would be this file quietly answering a question the whole mechanic is
    // built to make the player answer with his eyes.
    if (a) {
      const oc = a.out === 'heed' ? GRN : a.out === 'shrug' ? AMB : DIM;
      const dots = held ? '.'.repeat(1 + (Math.floor(G.now * 3) % 3)) : '';
      tx((a.line || '') + dots, x + 14, y + 62, { s: 13, w: 'bold', c: oc, ls: 0.8, max: w - 150 });
      // ...AND EVERYBODY ELSE. The footnote is on the panel every single time,
      // because it is the sentence that stops this being a guilt scanner: you
      // did not speak to him, you spoke to the shop, and the four people who
      // looked up are four people who looked up.
      tx(a.sub || '', x + w - 14, y + 62, { s: 10, c: '#5d7364', a: 'right' });
    }
  }

  // ==========================================================================
  // ROUND 8 — WHICH WAY IS HE FACING (JOB 3)
  // ==========================================================================
  // camera.js landed 110 degrees of mouse look and main.js steers by `moveYaw`,
  // so the head and the course have come apart deliberately: turning to look
  // down a cross-aisle no longer changes where W walks you. That is the right
  // decision and it introduces the one failure it implies — the player can now
  // be walking one way and looking another, and the camera builder's standing
  // caveat is that a thief who leaves your aisle is invisible about 89% of the
  // time. Being turned the wrong way on top of that is disorienting rather than
  // difficult, and disorienting is not a difficulty setting.
  //
  // So: a PAN readout, in the fiction the rest of this HUD is already in. Every
  // dome in this store is a PTZ and every PTZ has one. Centre notch is the
  // corridor — where your feet are going — and the tick is your head. It is
  // drawn at all times rather than only when deflected, because a gauge that
  // appears when you are already lost teaches nothing; this one is sitting
  // there at zero, so the first time it moves the player knows what moved.
  //
  // NB the numbers are read off camera.js's live rig via game.js's G.look and
  // nothing here re-derives them. This file has form on exactly that mistake —
  // it used to carry its own hand-copied projection of a camera it did not own,
  // correct only for as long as that camera never moved.
  function lookGauge(G, x, y, w, h) {
    const L2 = G.look;
    if (!L2) return;                       // no camera to ask: round 7's HUD
    mark('pan');
    const deg = L2.yaw * 180 / Math.PI;
    const mag = Math.abs(deg);
    const max = Math.max(1, L2.max * 180 / Math.PI);
    // Amber past a third of the budget, red past two thirds. The thresholds are
    // the point at which the aisle you walked in from has left the frame.
    const c = mag > max * 0.66 ? '#ff9a2e' : mag > max * 0.33 ? AMB : DIM;
    // ---- ROUND 9: THE GAUGE KEPT ITS SWEEP AND LOST ITS BOX --------------
    // Round 8's argument for drawing this at all times is still the right one
    // and is not touched: a gauge that appears once you are already lost
    // teaches nothing, so it has to be sitting there at zero the first time it
    // moves. That argument is about the TICK. It was never an argument for a
    // 274x50 titled panel with a scanline fill and a COURSE caption under it,
    // which is what carried the tick on 100% of floor frames.
    //
    // What is left is the instrument: a sweep, a notch at the corridor, a tick
    // at his head, and a number that appears only once the head is actually
    // off the corridor. At rest it is a thin dark line in the top right that
    // costs the player nothing to ignore, and it still moves the instant he
    // moves the mouse, which is the whole of what it was for.
    const gx = x + 12, gw = w - 24, gy = y + 14, mid = gx + gw / 2;
    plate(gx, gy, gw, 12, 0.92);
    box(gx, gy, gw, 12, mag > max * 0.33 ? c : LINE);
    ctx.fillStyle = 'rgba(125,253,160,0.35)'; ctx.fillRect(mid - 1, gy - 3, 2, 18);
    const tick = mid + clampN(deg / max, -1, 1) * (gw / 2);
    ctx.fillStyle = c;
    ctx.fillRect(Math.min(mid, tick), gy + 3, Math.abs(tick - mid), 6);
    ctx.fillRect(tick - 1.5, gy - 4, 3, 20);
    if (mag >= 1) {
      tx(`${Math.round(mag)}° ${deg < 0 ? 'LEFT' : 'RIGHT'}`, x + w - 12, gy + 30,
        { s: 11, w: 'bold', c, a: 'right', ls: 0.8 });
    }
  }

  // --------------------------------------------------------------- WRITE-UP
  function drawWriteup(G) {
    const w = G.wu;
    ctx.fillStyle = 'rgba(2,4,3,0.86)'; ctx.fillRect(0, 0, W, H);
    scan(0, 0, W, H, 0.22);
    topBand(G, 52, 'INCIDENT IN PROGRESS — DO NOT LEAVE POST (POST IS ALREADY UNMANNED)');

    const px = 150, py = 92, pw = 980, ph = 520;
    panel(px, py, pw, ph, `INCIDENT REPORT  ${w.caseNo}`, { bg: 'rgba(3,7,4,0.96)' });

    const rows = [
      ['SUBJECT', w.name], ['SUBJECT ID', w.code], ['LOCATION', `AISLE ${w.aisle + 1}`],
      ['MERCHANDISE', w.item], ['VALUE', `$${w.value.toFixed(2)}`],
      ['RECOVERED', 'YES'], ['POLICE CALLED', 'NO'], ['REPORTING LP', 'UNIT 1 (SELF)'],
    ];
    const shown = Math.min(rows.length, Math.floor(w.t * 7) + (w.stage > 0 ? rows.length : 0));
    rows.slice(0, shown).forEach(([k, v], i) => {
      const ry = py + 44 + i * 26;
      tx(k, px + 22, ry, { s: 12, c: DIM, ls: 1.2 });
      ctx.fillStyle = 'rgba(125,253,160,0.10)'; ctx.fillRect(px + 190, ry - 15, 500, 21);
      tx(v, px + 198, ry, { s: 14, w: 'bold', c: GRN, max: 490 });
    });
    if (w.stage === 0 && (G.now % 0.7) < 0.4 && shown < rows.length) {
      ctx.fillStyle = GRN; ctx.fillRect(px + 198, py + 30 + shown * 26, 9, 15);
    }

    const dy = py + 280;
    if (w.stage >= 1) {
      ctx.fillStyle = LINE; ctx.fillRect(px + 22, dy - 22, pw - 44, 1);
      tx('VERBAL TRESPASS WARNING — DELIVERED', px + 22, dy - 30, { s: 11, c: DIM, ls: 1.4 });
    }
    if (w.stage === 1) {
      panel(px + 22, dy, pw - 44, 34 + w.lines.length * 27, 'YOU');
      w.lines.forEach((ln, i) => tx(ln, px + 38, dy + 42 + i * 27,
        { s: 18, c: '#e8f4ea', max: pw - 76 }));
    }
    if (w.stage === 2) {
      panel(px + 22, dy, pw - 44, 34 + w.lines.length * 24, 'SYSTEM LOG');
      w.lines.forEach((ln, i) => tx(ln, px + 38, dy + 40 + i * 24,
        { s: 14, w: 'bold', c: GRN, max: pw - 76 }));
    }
    if (w.stage === 3) {
      panel(px + 22, dy - 8, pw - 44, 34 + w.lines.length * 28, 'DALE M. — STORE MANAGER',
        { accent: '#ffe36a' });
      w.lines.forEach((ln, i) => {
        const fresh = i === w.lines.length - 1;
        tx(ln, px + 38, dy + 34 + i * 28, {
          s: 18, c: fresh ? '#fff6d6' : 'rgba(232,244,234,0.62)', max: pw - 76,
        });
      });
    }
    if (w.stage === 4) {
      const k = Math.min(1, w.t * 3);
      ctx.globalAlpha = k;
      stamp(`+${w.award} PTS`, W / 2, dy + 32, { s: 46, c: GRN, rot: -4 });
      ctx.globalAlpha = 1;
      const barY = dy + 94, bw2 = pw - 200;
      tx(`${G.rankName}`, px + 100, barY - 12, { s: 13, w: 'bold', c: AMB, ls: 1.2 });
      tx(w.nextLabel, px + 100 + bw2, barY - 12, { s: 12, c: DIM, a: 'right' });
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(px + 100, barY, bw2, 16);
      ctx.fillStyle = AMB; ctx.fillRect(px + 100, barY, bw2 * w.rankFrac, 16);
      box(px + 100, barY, bw2, 16, LINE);
      const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      tx(`SHIFT TOTAL — ${G.st.points} PTS · ${pl(G.st.caught, 'RECOVERY', 'RECOVERIES')}`
        + ` · ${pl(G.st.escaped, 'LOSS', 'LOSSES')} · ${pl(G.st.complaints, 'COMPLAINT', 'COMPLAINTS')}`,
      W / 2, barY + 32, { s: 12, c: DIM, a: 'center', ls: 0.8 });
      if (w.promo) {
        ctx.globalAlpha = Math.min(1, Math.max(0, w.t - 0.7) * 2.5);
        stamp(`PROMOTED — ${G.rankName.toUpperCase()}`, W / 2, dy + 180, { s: 24, c: AMB, rot: -5 });
        tx(w.promoSub, W / 2, dy + 222, { s: 13, w: 'bold', c: AMB, a: 'center', ls: 1 });
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = 'rgba(2,4,3,0.9)'; ctx.fillRect(W - 176, H - 36, 164, 22);
    tx('[SPACE] CONTINUE', W - 26, H - 22, { s: 12, c: DIM, a: 'right', ls: 1.4 });
    burnIn();
  }

  // ---------------------------------------------------------------- DEMOTED
  function drawDemoted(G) {
    ctx.fillStyle = 'rgba(1,3,2,0.965)'; ctx.fillRect(0, 0, W, H);
    scan(0, 0, W, H, 0.24);
    const px = 236, py = 44, pw = 808, ph = 636;
    const LH = 22, y0 = py + 152;
    panel(px, py, pw, ph, 'PERSONNEL — CONFIDENTIAL', { bg: 'rgba(4,9,5,0.98)', accent: '#c9cfc9' });
    G.hr.head.forEach((s, i) => tx(s, px + 40, py + 62 + i * 26,
      { s: i === 0 ? 17 : 14, w: 'bold', c: i === 0 ? '#e6efe7' : DIM, ls: 1.6 }));
    ctx.fillStyle = LINE; ctx.fillRect(px + 40, py + 122, pw - 80, 1);
    const n = Math.min(G.hr.body.length, Math.floor(G.hr.t * 9));
    G.hr.body.slice(0, n).forEach((s, i) => tx(s, px + 40, y0 + i * LH, { s: 15, c: '#cfe0d3', ls: 0.3 }));
    const end = y0 + G.hr.body.length * LH;
    if (n >= G.hr.body.length) {
      tx(G.hr.sign, px + 40, end + 22, { s: 13, c: DIM, ls: 0.6 });
      ctx.fillStyle = LINE; ctx.fillRect(px + 40, end + 44, pw - 80, 1);
      tx(`FINAL: ${G.st.points} PTS · ${G.st.caught} RECOVERIES · ${G.st.escaped} LOSSES`,
        px + 40, end + 68, { s: 12, c: DIM });
      if ((G.now % 1.2) < 0.8) {
        tx('[R] REPORT TO TRAFFIC DUTY', px + pw / 2, py + ph - 22,
          { s: 16, w: 'bold', c: AMB, a: 'center', ls: 2 });
      }
    } else if ((G.now % 0.6) < 0.35) {
      ctx.fillStyle = '#cfe0d3'; ctx.fillRect(px + 40, y0 - 12 + n * LH, 10, 16);
    }
    if (G.hr.t > 2.2) {
      ctx.globalAlpha = Math.min(0.94, (G.hr.t - 2.2) * 1.6);
      stamp('REASSIGNED', 878, 500, { s: 46, c: RED, rot: -9 });
      ctx.globalAlpha = 1;
    }
    burnIn();
  }

  // ------------------------------------------------------------------ render
  hud.render = function render(G) {
    regions = [];
    plateTag = null;                    // never let a throw leak a tag forward
    renderSeq++;                        // see pursuitRect(): one resolve per frame
    ctx.clearRect(0, 0, W, H);
    // Re-anchor the DVR stamp to wall time, once, before anything prints it.
    clockBase = Date.now() - G.st.clock * 1000;
    try {
      if (G.st.mode === 'desk') drawDesk(G);
      else if (G.st.mode === 'floor') drawFloor(G);
      else if (G.st.mode === 'writeup') drawWriteup(G);
      else if (G.st.mode === 'demoted') drawDemoted(G);
    } catch (e) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, 40);
      tx('HUD: ' + (e && e.message), 12, 26, { s: 13, c: RED });
      if (!render._logged) { render._logged = 1; console.error('[game/hud]', e); }
    }
  };

  // The clock cctv.setClock() is handed, if it ever ships. Same function the
  // band prints from, so there is exactly one clock on this desk.
  hud.wallClock = wallClock;

  // ROUND 9. One frame, drawn for real, with every mark() recorded. ./eval.js
  // calls this at 10 Hz through a shift and divides — see the census block in
  // its report. It renders to the same canvas the player sees, which is the
  // point: the answer is what was painted, not what the code thinks it paints.
  hud.sample = function (G) {
    census = {};
    inked = []; painted = []; dimmed = []; seq = 0; plateSkipped = 0;
    compositeSeen = null;
    hud.render(G);
    const c = census; census = null;
    // ---- ROUND 17: THE SUBJECT, MEASURED THE SAME WAY A WORD IS ------------
    // See subjectBox(). Recorded only on the frames the question exists: the
    // player is on foot and a man is running from him. `_subjOn` is the
    // population; everything else divides by it. `_subjNear*` is the same thing
    // restricted to decisive range and to CONTACT, which is the only sight state
    // where the box is provably the man and not a belief about him.
    const F = G && G.st && G.st.mode === 'floor' ? G.floor : null;
    if (F && pursuitUp(F)) {
      const sb = subjectBox(G, F);
      if (sb) {
        const cov = coverOf(sb, painted, 'chrome');
        c._subjOn = 1;
        c._subjCovSum = cov;
        if (cov >= SUBJ_HIT) c._subjHit = 1;
        c._subjPxSum = sb.px;
        c._subjCovAllSum = coverOf(sb, painted);
        // The panel's own share, attributed by plate tag rather than by line
        // number, so a chase bench reports the quantity subjCheck() promises
        // about instead of only the chrome total it is one term of.
        c._subjPanelCovSum = coverOf(sb, painted, 'pursuit');
        const near = sb.d <= SUBJ_NEAR_M && F.sight && F.sight.grade === 'contact';
        if (near) {
          c._subjNear = 1;
          c._subjNearCovSum = cov;
          if (cov >= SUBJ_HIT) c._subjNearHit = 1;
          c._subjNearWorst = cov;
        }
      } else {
        c._subjOff = 1;                 // behind the lens or wholly off canvas
      }
    }
    if (compositeSeen) c._composite = compositeSeen;
    // ROUND 15 — see the INK LEDGER block above. Reported on the census object
    // because that is what ./eval.js already pools across a whole shift; the
    // worst pair is carried so a non-zero count names the two strings rather
    // than only counting them.
    const bad = overprints(inked);
    // ROUND 16 — the plate ledger. Same frame, same canvas, same pooling path.
    const near = [];
    const out2 = { dim: dimmed };
    const era = erasures(inked, painted, near, out2);
    c._plates = painted.length; c._platesTranslucent = plateSkipped;
    c._erasures = era.length;
    // ROUND 17 — the three channels that stop this instrument over-reporting or
    // under-reporting, each counted on its own so promotion is a decision and
    // not an accident. See erasures(), overprints() and CLIFF_ALPHA.
    c._eraseReprint = out2.reprinted.length;
    for (const e of out2.reprinted) {
      const k = 'ERZR ' + e.by + ' > ' + siteWordOf(e.s);
      c[k] = (c[k] || 0) + 1;
    }
    c._eraseCliff = out2.cliff.length;
    c._crossRow = bad.crossRow.length;
    if (bad.crossRow.length) {
      let cw = bad.crossRow[0];
      for (const p of bad.crossRow) if (p.overlapPx > cw.overlapPx) cw = p;
      c._crossRowWorst = `${cw.overlapPx}x${cw.vPx}px  "${cw.a}"(${cw.size[0]}) x "${cw.b}"(${cw.size[1]})`;
      c._crossRowPx = cw.overlapPx;
      for (const p of bad.crossRow) {
        const k = 'XRW ' + siteWordOf(p.a) + ' x ' + siteWordOf(p.b);
        c[k] = (c[k] || 0) + 1;
      }
    }
    // The early-warning half: bands that touched a glyph box without covering
    // enough of it to count. Named by site so a graze can be reserved before it
    // becomes an erasure — backRect() was a graze on nobody's list until it
    // covered `SUBJ-03` at 100%.
    c._eraseNear = near.length;
    for (const st of near) { const k = 'ERZN ' + st; c[k] = (c[k] || 0) + 1; }
    if (era.length) {
      let w2 = era[0];
      for (const e of era) if (e.pct > w2.pct) w2 = e;
      // Same STRING-not-object discipline as the overprint pair below, and for
      // the same reason: ./eval.js pools this census by adding every key.
      c._eraseWorst = `${w2.pct}% "${w2.s}" by ${w2.by}`;
      c._erasePct = w2.pct;
      // The site tally is what turns 94 erasures into three fixable classes.
      // A key per painting site, so the pooler adds them like any other count.
      //
      // NOT via mark(): `census` was set to null four lines up, so mark() is a
      // no-op here and the first run of this ledger reported an empty site list
      // beside 68 erasures. An instrument whose own output says "none" while its
      // count says 68 is the shape AGENTS_BRIEF keeps retiring — read what you
      // ship. Written onto `c` directly, which is the object being returned.
      for (const e of era) {
        const k = 'ERZ ' + e.by + ' > ' + siteWordOf(e.s);
        c[k] = (c[k] || 0) + 1;
      }
    }
    c._strings = inked.length; inked = null; painted = null; dimmed = null;
    c._overprints = bad.length;
    c._overprintsGhosted = bad.ghosted.length;
    if (bad.length) {
      let w = bad[0];
      for (const p of bad) if (p.overlapPx > w.overlapPx) w = p;
      // A STRING, not an object: ./eval.js pools the census by adding every key
      // across shifts, and an object on that path silently becomes "0[object
      // Object]". The pixel count rides alongside as a NUMBER so the pooler can
      // pick a genuine worst-of instead of concatenating examples — which is
      // what the first run of this instrument actually did.
      c._overprintWorst = `${w.overlapPx}px  "${w.a}" x "${w.b}"`;
      c._worstPx = w.overlapPx;
    }
    // =======================================================================
    // ROUND 21 — THE GUARD GETS A CALLER
    // =======================================================================
    // `subjCheck` and `subjSelfTest` were built in round 20 to protect round
    // 20's own fix, validated in three directions, proven to throw on an empty
    // sample — and had NO CALLER anywhere in src, tools or docs. They ran only
    // when a human typed them. AGENTS_BRIEF already carries "a check that passes
    // because it never runs"; that entry recurred inside the round that cited
    // it, one file away from the ink ledger it sits beside, which IS counted on
    // every census frame and pooled into the bench.
    //
    // This is the caller. Same frame, same census, same pooling path as
    // `_overprints` — so a layout change that undoes round 20 or round 21 shows
    // up as a non-zero number in a bench nobody had to remember to run.
    //
    // COST, MEASURED, NOT ASSUMED: subjCheck renders three times (shipped,
    // wide, and the restore that leaves the canvas as the player's), so a census
    // frame with a chase on it costs 4 renders instead of 1. It is gated to the
    // frames the guard can speak about at all — floor mode, a man fleeing — and
    // `hud.guard(false)` turns it off for a bench that is timing something else.
    // A default of OFF would be this entry again.
    if (GUARD_ON && F && pursuitUp(F)) {
      const g = hud.subjCheck(G, GUARD_INJECT ? { inject: GUARD_INJECT } : {});
      if (g.on) {
        c._subjGuard = 1;
        if (!g.ok) {
          c._subjGuardFail = 1;
          c._subjGuardWorst = g.why;
          // Named to end in `Worst` on purpose: ./eval.js pools numeric keys
          // with that suffix by maximum (see isWorstNum). `_subjGuardWorst`
          // beside it is a STRING and pools first-wins, which is the same
          // limitation the two legacy worst-of pairs have.
          c._subjGuardDeltaWorst = g.panelPct - g.widePct;
        }
        if (!g.bandOk) {
          c._bandGuardFail = 1;
          c._bandGuardWorst = g.bandWhy;
        }
        // The separable population, so a zero can be told from an instrument
        // that never had a frame it could speak about — round 15's lampWarm()
        // reported agreement having compared nothing.
        if (g.widePct > 100 * SUBJ_EPS) c._subjGuardSeparable = 1;
        if (g.wideBandPct > 100 * SUBJ_EPS) c._bandGuardSeparable = 1;
      }
    }
    return c;
  };
  // The same check on demand, for a console or a critic: render one frame, get
  // every drawn string and every collision back. Does not disturb the census.
  hud.inkAudit = function (G) {
    inked = []; painted = []; dimmed = []; seq = 0; plateSkipped = 0;
    compositeSeen = null;
    hud.render(G);
    const list = inked, plates = painted, dim = dimmed;
    inked = null; painted = null; dimmed = null;
    const bad = overprints(list);
    const near = [];
    const out2 = { dim };
    const era = erasures(list, plates, near, out2);
    // ROUND 17 — the man, on the same frame, off the same plate list. See
    // subjectBox(): `subject` is his silhouette in canvas pixels and `cover` is
    // the fraction of it this HUD is standing on.
    const F = G && G.st && G.st.mode === 'floor' ? G.floor : null;
    const sb = F && pursuitUp(F) ? subjectBox(G, F) : null;
    const worst = [];
    if (sb) {
      for (const r of plates) {
        if (r.clear) continue;
        const one = fracOf(sb, [r]);          // ROUND 21: same denominator as coverOf
        if (one > 0.01) worst.push({ site: (r.tag ? r.tag + ':' : '') + r.site,
          pct: +(one * 100).toFixed(1) });
      }
      worst.sort((a, b) => b.pct - a.pct);
    }
    return { strings: list.length, overprints: bad, ghosted: bad.ghosted,
      crossRow: bad.crossRow, boxes: list,
      plates: plates.length, platesTranslucent: plateSkipped, dim: dim.length,
      erasures: era, reprinted: out2.reprinted, cliff: out2.cliff,
      near, rects: plates, composite: compositeSeen,
      subject: sb, cover: sb ? +(coverOf(sb, plates, 'chrome') * 100).toFixed(1) : null,
      coverAll: sb ? +(coverOf(sb, plates) * 100).toFixed(1) : null,
      coverBy: worst.slice(0, 8) };
  };
  // The subject-coverage half on its own, for a driver that wants it every frame
  // of a chase without the string work. Same box, same plates, one owner.
  hud.cover = function (G) {
    inked = []; painted = []; dimmed = []; seq = 0; plateSkipped = 0;
    hud.render(G);
    const plates = painted;
    inked = null; painted = null; dimmed = null;
    const F = G && G.st && G.st.mode === 'floor' ? G.floor : null;
    if (!F || !pursuitUp(F)) return null;
    const sb = subjectBox(G, F);
    if (!sb) return { off: true, d: F.dist, grade: F.sight && F.sight.grade };
    // Named by site, because a coverage number nobody can attribute is a number
    // nobody can fix — the ERZ tally is what turned 94 erasures into three
    // classes and this is the same trick one target along.
    const sites = [];
    for (const r of plates) {
      if (r.clear) continue;
      if (!(r.x0 < sb.x1 && r.x1 > sb.x0 && r.top < sb.bot && r.bot > sb.top)) continue;
      const one = fracOf(sb, [r]);          // ROUND 21: same denominator as coverOf
      if (one > 0.005) sites.push([(r.tag ? r.tag + ':' : '') + r.site, +(one * 100).toFixed(1)]);
    }
    sites.sort((a, b) => b[1] - a[1]);
    return { cover: coverOf(sb, plates, 'chrome'), all: coverOf(sb, plates),
      own: coverOf(sb, plates, 'subj'),
      // ROUND 21: named by TAG, not by line number. Round 20's chrome statistic
      // could only be decomposed by grepping `hud.js:674` out of a site string,
      // which is a transcription of a position in this file. The two elements
      // that own the statistic now answer to their own names.
      band: coverOf(sb, plates, 'band'), wind: coverOf(sb, plates, 'wind'),
      panelOn: coverOf(sb, plates, 'pursuit'),
      // ROUND 21: the SAME numbers under the pre-round denominator (the clipped
      // box), carried on the same frame so "how much of the old headline was the
      // denominator" is a subtraction and not a cross-load comparison. `vis` is
      // the whole difference; both are published because a round that deflates
      // its own gap has to show the deflation, not just the new level.
      coverRaw: sb.vis > 0 ? coverOf(sb, plates, 'chrome') / sb.vis : 0,
      bandRaw: sb.vis > 0 ? coverOf(sb, plates, 'band') / sb.vis : 0,
      // The trigger quantity itself: what the WIDE panel would take of him on
      // this frame, whatever shape the panel is actually in. Reported so the
      // threshold in pursuitRect() can be argued with off the same number.
      wideOn: boxOn(sb, PURSUIT_RECT), tight: (pursuitRect(G, F) || {}).w < PURSUIT_RECT.w,
      d: sb.d, px: sb.px, vis: sb.vis,
      grade: F.sight && F.sight.grade, box: sb, sites,
      x0: +sb.x0.toFixed(1), x1: +sb.x1.toFixed(1),
      top: +sb.top.toFixed(1), bot: +sb.bot.toFixed(1) };
  };

  // ===========================================================================
  // ROUND 17 — THE GUARD, AND WHY IT IS NOT A CEILING
  // ===========================================================================
  // Six checks on this project have certified something they could not see, and
  // the pattern in every one is a check that guards an EARLIER STAGE than the
  // defect: a table, a bake log, a layout intention. So this one reads the frame
  // — the live plate list off the live render, and the man's silhouette off the
  // live camera and the live lens.
  //
  // ---- THE PROMISE, WRITTEN AS THE THING THAT CAN BE FALSE -----------------
  // The obvious guard is a CEILING: "the panel never covers more than X% of
  // him." Measured over 7 chases and 612 matched frames, the shipped tight
  // panel still reaches 34.8% of him on its worst frame — a man close enough to
  // span both slots has nowhere for the panel to go. So a ceiling set from that
  // measurement sits above every value it will ever see and can never fire,
  // which is the vacuous check this file's own history keeps producing.
  //
  // The promise the round actually makes is RELATIVE, so that is what is
  // checked: THE SHIPPED LAYOUT MUST NOT STAND ON MORE OF HIM THAN THE WIDE
  // PANEL WOULD HAVE. That is falsifiable on every frame with a subject on it,
  // it needs no constant chosen after the fact, and it fires on exactly the
  // change that would undo this round — a tight slot moved inward, the side
  // flip removed, or a new element parked in the slot the panel moved into.
  //
  // ---- AND IT IS PROVEN IN THREE DIRECTIONS, NOT ASSERTED ------------------
  // subjSelfTest() runs an opaque plate over his box (must fail), the same
  // plate off him (must pass), and — on any frame where the wide panel really
  // does land on him — the round-16 layout itself (must fail). The third is the
  // exact corruption this guard exists to catch, executed rather than described,
  // and the first two make the check provably able to fire on a frame where the
  // third cannot separate the layouts.
  const SUBJ_EPS = 0.005;      // half a percent of him: below the plate ledger's
                               // own 0.005 site cut, so it cannot manufacture a
                               // complaint out of a rounding difference.
  // ROUND 21 — the switch and the corruption hook for the census caller in
  // hud.sample(). ON by default: a guard that has to be switched on is the
  // guard that had no caller. `GUARD_INJECT` is the SAME opaque plate
  // subjSelfTest() uses, reachable from the census path, so the wiring itself
  // can be proven to fire on a real bench instead of only in a console.
  let GUARD_ON = true, GUARD_INJECT = null;
  hud.guard = function (on, inject) {
    if (on != null) GUARD_ON = !!on;
    if (inject !== undefined) GUARD_INJECT = inject;
    return { on: GUARD_ON, inject: GUARD_INJECT };
  };
  function subjMeasure(G, inject) {
    inked = []; painted = []; dimmed = []; seq = 0; plateSkipped = 0;
    hud.render(G);
    if (inject) {
      // Inside the same ledger: `painted` is still open here and closes below,
      // so an injected plate is indistinguishable from one this file drew. It
      // is tagged 'pursuit' because that is the population under test.
      const t = plateTag; plateTag = 'pursuit';
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(0,0,0,0.95)';
      ctx.fillRect(inject.x, inject.y, inject.w, inject.h);
      plateTag = t;
    }
    const plates = painted;
    inked = null; painted = null; dimmed = null;
    const F = G && G.st && G.st.mode === 'floor' ? G.floor : null;
    if (!F || !pursuitUp(F)) return { on: false, why: 'no pursuit this frame' };
    const sb = subjectBox(G, F);
    if (!sb) return { on: false, why: 'subject off canvas or behind the lens' };
    return { on: true, sb, plates,
      panel: coverOf(sb, plates, 'pursuit'),
      band: coverOf(sb, plates, 'band'),        // ROUND 21, same promise
      chrome: coverOf(sb, plates, 'chrome'),
      wideOn: boxOn(sb, PURSUIT_RECT),
      tight: (pursuitRect(G, F) || {}).w < PURSUIT_RECT.w,
      chips: bandRects(G, F).length > 1,
      d: sb.d, bands: BANDS };
  }
  // What the panel takes of him under the SHIPPED layout, against what the wide
  // rectangle would have taken, on ONE frame. `ok` is the promise above.
  //
  // `opts.inject` goes into the SHIPPED measurement ONLY, and that asymmetry is
  // the whole point: it simulates the corruption this guard exists to catch —
  // a new opaque element parked in the slot the panel moved into. The first
  // draft injected into both sides, both went to 100%, `ship <= wide` held, and
  // the self-test passed having proved nothing. Round 14's "empty sample" in a
  // new costume, and it took the guard's own output to see it.
  hud.subjCheck = function (G, opts = {}) {
    const was = BANDS;
    let ship, wide;
    try {
      ship = subjMeasure(G, opts.inject);
      if (!ship.on) return { on: false, why: ship.why, ok: true };
      BANDS = 'r16';                     // the executable wide layout
      wide = subjMeasure(G, null);
    } finally {
      BANDS = was;
      // LEAVE THE CANVAS AS THE PLAYER'S. This renders twice and the second
      // render is the WIDE layout, so without this the visible HUD — and any
      // hud.shot() taken afterwards — would be the layout under test rather
      // than the one that ships. A measurement that changes the artefact it
      // measured is how snap()'s step(0) corrupted this round's first evidence.
      // Swallowed deliberately: a throw HERE would replace whatever real error
      // put us in this finally with a second, less informative one.
      try { hud.render(G); } catch { /* the original throw is the useful one */ }
    }
    const panelOk = ship.panel <= wide.panel + SUBJ_EPS;
    // ROUND 21 — THE SAME PROMISE, ONE ELEMENT ALONG. The chipped top band must
    // not stand on more of him than the full-width band would have. It is not a
    // tautology: the chips are derived from string advances, so a longer store
    // name, a wider clock format or a chip nudged outside the strip breaks it,
    // and those are exactly the edits that would undo this round without
    // touching a line of layout code.
    const bandOk = ship.band <= wide.band + SUBJ_EPS;
    const ok = panelOk && bandOk;
    return { on: true, ok, panelOk, bandOk, bands: was,
      d: +ship.d.toFixed(2), tight: ship.tight, chips: ship.chips,
      panelPct: +(100 * ship.panel).toFixed(1),
      widePct: +(100 * wide.panel).toFixed(1),
      bandPct: +(100 * ship.band).toFixed(1),
      wideBandPct: +(100 * wide.band).toFixed(1),
      chromePct: +(100 * ship.chrome).toFixed(1),
      wideChromePct: +(100 * wide.chrome).toFixed(1),
      wideOnPct: +(100 * ship.wideOn).toFixed(1),
      visPct: +(100 * ship.sb.vis).toFixed(1),
      box: [Math.round(ship.sb.x0), Math.round(ship.sb.top),
        Math.round(ship.sb.x1), Math.round(ship.sb.bot)],
      why: panelOk ? null : `the shipped panel covers ${(100 * ship.panel).toFixed(1)}% of the `
        + `subject where the wide panel covers ${(100 * wide.panel).toFixed(1)}%`,
      bandWhy: bandOk ? null : `the chipped band covers ${(100 * ship.band).toFixed(1)}% of the `
        + `subject where the full band covers ${(100 * wide.band).toFixed(1)}%` };
  };
  // THROWS. Run it on a chase frame; it needs a subject on canvas and says so
  // rather than passing on an empty sample, which is how round 15's lampWarm()
  // first reported agreement having compared nothing.
  hud.subjSelfTest = function (G) {
    const base = hud.subjCheck(G);
    if (!base.on) throw new Error('subjSelfTest: EMPTY SAMPLE — ' + base.why
      + '. Run this on a frame where a subject is fleeing and on canvas.');
    const sb = subjMeasure(G).sb;
    const w = sb.x1 - sb.x0, h = sb.bot - sb.top;
    // 1. ON HIM. An opaque plate over his whole box, tagged as the panel's and
    //    added to the SHIPPED layout only, must break the promise.
    const on = hud.subjCheck(G, { inject: { x: sb.x0, y: sb.top, w, h } });
    if (on.ok) throw new Error('subjSelfTest: THE GUARD DID NOT FIRE on an opaque '
      + 'plate covering the whole subject box — it is not watching the frame. '
      + JSON.stringify(on));
    // 2. OFF HIM. The same plate somewhere he is not must leave it silent.
    const off = hud.subjCheck(G, { inject: { x: 0, y: 0, w: 24, h: 24 } });
    if (!off.ok) throw new Error('subjSelfTest: the guard fired on a plate that is '
      + 'nowhere near the subject — it is reporting something other than coverage. '
      + JSON.stringify(off));
    // 3. THE REAL CORRUPTION, where this frame can express it. `separable` is
    //    reported rather than assumed: most frames of a chase have the man
    //    nowhere near the panel, and a self-test that quietly passes on those
    //    would be measuring nothing.
    const separable = base.widePct > 100 * SUBJ_EPS;
    if (separable && base.panelPct > base.widePct + 100 * SUBJ_EPS) {
      throw new Error('subjSelfTest: THE SHIPPED LAYOUT IS WORSE THAN THE ONE IT '
        + 'REPLACED on this frame — ' + base.why);
    }
    return { ok: true, separable, d: base.d, tight: base.tight, chips: base.chips,
      shipPanelPct: base.panelPct, widePanelPct: base.widePct,
      shipBandPct: base.bandPct, wideBandPct: base.wideBandPct,
      shipChromePct: base.chromePct, wideChromePct: base.wideChromePct,
      injectedOnHimPct: on.panelPct, injectedOffHimPct: off.panelPct };
  };

  // ===========================================================================
  // ROUND 21 — ONE OWNER PER RECTANGLE, AND AN ASSERTION THAT SAYS SO
  // ===========================================================================
  // CLAUDE.md opens with this file's hand-copied camera rig: "reproduced here so
  // HUD markers can sit on world positions without needing the camera object" —
  // correct only while the camera never moved, held in sync purely by
  // coincidence, and its rule is that a second copy needs an assertion that
  // fails loudly when the two disagree (`lungCheck()` in agents.js).
  //
  // The band now has THREE readers of one shape: the drawing site, the subject
  // cluster's keep-out list, and the door tags' keep-out list. Nothing stops a
  // future round typing `{ x: 0, y: 0, w: W, h: FLOOR_BAND }` back into one of
  // them — it is one line, it is obviously right, and it stays right until the
  // day the band chips. That is the bug, written out in advance.
  //
  // So this asserts BOTH halves off the live frame:
  //   PAINTED   the band-tagged, full-height plates in the plate ledger match
  //             bandRects() rectangle for rectangle.
  //   RESERVED  floorKeepOuts() contains those rectangles BY `===` IDENTITY.
  //             Not by value — a transcribed copy is value-equal on the very
  //             frames it is correct on, and identity is the property that
  //             actually distinguishes one owner from two.
  const BAND_TOL = 1.0;         // px; the ledger stores device-space bounds
  hud.bandCheck = function (G, opts = {}) {
    inked = []; painted = []; dimmed = []; seq = 0; plateSkipped = 0;
    hud.render(G);
    if (opts.inject) {
      const t = plateTag; plateTag = 'band';
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(2,4,3,0.95)';
      ctx.fillRect(opts.inject.x, opts.inject.y, opts.inject.w, opts.inject.h);
      plateTag = t;
    }
    const plates = painted;
    inked = null; painted = null; dimmed = null;
    const F = G && G.st && G.st.mode === 'floor' ? G.floor : null;
    if (!F) return { on: false, ok: true, why: 'not on the floor screen' };
    const want = bandRects(G, F);
    const drawn = plates.filter((r) => r.tag === 'band'
      && r.bot - r.top > FLOOR_BAND - BAND_TOL);
    const fmt = (r) => `[${Math.round(r.x0 != null ? r.x0 : r.x)},`
      + `${Math.round(r.top != null ? r.top : r.y)},`
      + `${Math.round(r.x1 != null ? r.x1 : r.x + r.w)},`
      + `${Math.round(r.bot != null ? r.bot : r.y + r.h)}]`;
    const why = [];
    if (drawn.length !== want.length) {
      why.push(`painted ${drawn.length} full-height band plates, bandRects() says `
        + `${want.length}: painted ${drawn.map(fmt).join(' ')} vs ${want.map(fmt).join(' ')}`);
    } else {
      const byX = [...drawn].sort((a, b) => a.x0 - b.x0);
      const wX = [...want].sort((a, b) => a.x - b.x);
      for (let i = 0; i < wX.length; i++) {
        const a = byX[i], b = wX[i];
        if (Math.abs(a.x0 - b.x) > BAND_TOL || Math.abs(a.top - b.y) > BAND_TOL
          || Math.abs(a.x1 - (b.x + b.w)) > BAND_TOL
          || Math.abs(a.bot - (b.y + b.h)) > BAND_TOL) {
          why.push(`band plate ${fmt(a)} is not the rectangle bandRects() owns, ${fmt(b)}`);
        }
      }
    }
    // The identity half. `bandRects` is memoised on renderSeq, so the objects it
    // returns here are the very objects the render above used.
    const ko = floorKeepOuts(G, F);
    for (const r of want) {
      if (ko.indexOf(r) < 0) {
        why.push('floorKeepOuts() does not hold bandRects()\'s own object for '
          + fmt(r) + ' — a second copy of the band\'s shape exists');
      }
    }
    return { on: true, ok: why.length === 0, chips: want.length > 1,
      painted: drawn.map(fmt), want: want.map(fmt), why: why.join('; ') || null };
  };
  // THROWS. Proven in three directions on a live floor frame, and the third is
  // the one that matters: a rectangle that is value-equal to the band's but is
  // not the band's object must be REJECTED, or the identity test above is an
  // equality test wearing its clothes.
  hud.bandSelfTest = function (G) {
    const base = hud.bandCheck(G);
    if (!base.on) throw new Error('bandSelfTest: EMPTY SAMPLE — ' + base.why
      + '. Run this on a floor frame.');
    if (!base.ok) throw new Error('bandSelfTest: THE SHIPPED BAND ALREADY FAILS — ' + base.why);
    // 1. AN UNAUTHORISED BAND PLATE. Same size as the strip, somewhere it is
    //    not, tagged as the band's. The check must see it.
    const bad = hud.bandCheck(G, { inject: { x: 400, y: 0, w: 200, h: FLOOR_BAND } });
    if (bad.ok) throw new Error('bandSelfTest: THE CHECK DID NOT FIRE on an extra '
      + 'full-height band plate — it is not reading the frame. ' + JSON.stringify(bad));
    // 2. AND IT IS NOT MERELY COUNTING PLATES: a plate that is not the band's
    //    height is the rule line and the REC blip, which are the band's and are
    //    not its shape. A 2 px one must leave it silent.
    const thin = hud.bandCheck(G, { inject: { x: 400, y: 10, w: 200, h: 2 } });
    if (!thin.ok) throw new Error('bandSelfTest: the check fired on a 2 px plate — '
      + 'it is counting band-tagged fills, not band rectangles. ' + JSON.stringify(thin));
    // 3. THE IDENTITY TEST IS AN IDENTITY TEST. A structural copy of the band's
    //    own rectangle is what a transcription looks like, and `indexOf` must
    //    reject it. Asserted directly rather than assumed of the language.
    const F = G && G.st && G.st.mode === 'floor' ? G.floor : null;
    const want = bandRects(G, F);
    const copy = { ...want[0] };
    if (want.indexOf(copy) >= 0) {
      throw new Error('bandSelfTest: a VALUE-EQUAL COPY of the band rectangle passed '
        + 'the identity test — the one-owner assertion is an equality assertion.');
    }
    return { ok: true, chips: base.chips, want: base.want, painted: base.painted,
      injectedExtraFired: !bad.ok, thinPlateSilent: thin.ok };
  };

  // Viewport px -> 1280x720 HUD space, matching object-fit: contain.
  hud.toLocal = function (ev) {
    const r = cv.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H);
    return { x: (ev.clientX - r.left - (r.width - W * s) / 2) / s,
      y: (ev.clientY - r.top - (r.height - H * s) / 2) / s };
  };
  hud.hit = function (x, y) {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  };
  // Composite 3D + HUD and POST it to the shot sink, so screenshots show the HUD.
  hud.shot = async function (name) {
    const src = window.__CHOP && window.__CHOP.renderer && window.__CHOP.renderer.domElement;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const o = off.getContext('2d');
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    if (src) { try { o.drawImage(src, 0, 0, W, H); } catch { /* tainted */ } }
    o.drawImage(cv, 0, 0);
    const res = await fetch('/shot?name=' + encodeURIComponent(name),
      { method: 'POST', body: off.toDataURL('image/png') });
    return res.text();
  };
  return hud;
}
