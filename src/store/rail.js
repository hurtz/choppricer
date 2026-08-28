// CHOP PRICER — src/store/rail.js
// ROUND 27. THE PRICE RAIL GETS A CROSS-SECTION, AND THE TAGS GET A DATUM.
//
// EXPORT CONTRACT
//   RAILC                     the dial. `?flatrail` restores round 26 exactly.
//   PROF                      the cross-section constants, one place.
//   profile(h)                -> { pts:[[p,v]...], seat:{...}, span:[v0,v1] }
//   emitChannel(Q, o)         push one section's facets into a Quads soup
//   RailIndex                 what a section was, so a card can register to it
//   channelTex(THREE)         the extrusion's own surface (the ON arm's map)
//   railStats()               live counters for the round report
//
// ---------------------------------------------------------------------------
// WHY
//
// Round 26's critic, HIGH confidence on the observation:
//
//   "shots/blind_8pqtljj5/tile_09.jpg, bare rail at crop (330,495)-(470,545):
//    ONE FLAT PLANE down to a hard black boundary. No upper return, no lower
//    return, no channel, no groove, no shadow line. The 2.39 SUNCREST tag spans
//    y=514..533 while the rail face ends at y=529 — it hangs 4 px below its own
//    holder — and its neighbour starts 5 px higher, with nothing registering
//    either to a datum."
//
// Its MECHANISM was "the rail is a box with no return flanges". Measured before
// building anything (see shots/_probe_r27.js), on the whole store rather than a
// sample:
//
//   rails soup            1,905 quads,  4 DISTINCT NORMALS  (+-X, +-Z)
//   quads with any vertical normal component            0 of 1,905
//   shelfTags soup       15,762 quads, 682 distinct normals, all horizontal
//   quads with any vertical normal component            0 of 15,762
//
// So it is not a box. It is a SINGLE QUAD per section — `qX(Qrail, ...)` — and
// there is not one chamfer, return, groove or ledge on any price rail in the
// building. The mechanism was understated, not wrong.
//
// What a shelf-edge label holder actually is: an extruded C, clipped over the
// front lip of the shelf, leaning back a few degrees so the printed card faces
// up toward a standing shopper. Top to bottom it presents an UP-facing return
// that catches the light run four metres overhead, a short front face on that
// return, a DOWN-facing underside that puts a shadow line across the top edge
// of the card, the card seat itself, the ledge the card rests on, the lower
// return's front, and its own underside. Seven facets, five distinct normals,
// three of which have a vertical component — which is the whole reason a real
// rail is the brightest horizontal line in a supermarket photograph and reads
// as metal rather than as a painted stripe.
//
// The store faked exactly that with two things this file replaces:
//   - `railTex`'s painted top-to-bottom gradient plus a 1.6 px "channel" line;
//   - `signMat`'s `tilt: 0.36`, which tips the SHADING normal up 20 degrees
//     because "the tag channel is extruded 15-20 degrees off vertical ... tilt
//     models that without rebuilding 4,000 quads."
// Both are honest stand-ins and both are named in the comments that carry them.
// This round rebuilds the 4,000 quads.
//
// ---------------------------------------------------------------------------
// THE DIAL, AND WHY IT IS A URL FLAG AND NOT AN RNG DRAW
//
// `?flatrail` is round 26's rail and round 26's tags, byte for byte: one quad
// per section, the painted gradient, the shading tilt, and every card placed at
// `lip + 20 mm` on the deck's comb with its own independent y jitter. It is not
// a different store — every draw off `rng` and off `tagRng` is identical in
// both arms, in the same order, because nothing in this file draws from either
// stream. The card emitters still make every `ragged()` and `tagUV()` call they
// made before, in the same order, whichever arm is running; the ON arm simply
// does not READ two of the values (see NOT READ IN THE ON ARM, below).
//
// That is the round-24 `drawSig` rule and the round-26 matrix-identity rule
// applied to a soup: prove the two arms are the same store before claiming the
// difference between them is the change.

const QS = (() => { try { return location.search || ''; } catch { return ''; } })();
const FLAT = /[?&]flatrail(&|=|$)/i.test(QS);
export const RAILC = {
  on: !FLAT,
  name: FLAT ? 'flatrail(r26)' : 'channel(r27)',
};

// ---------------------------------------------------------------------------
// THE CROSS-SECTION. Every number in one table, in metres, so that a later
// round can move one of them and know it moved.
//
// `p` is measured OUTWARD from the caller's `lip` datum along the face normal,
// `v` upward from the section's own centre y. A section of height h spans
// v = -h/2 .. +h/2, and the profile is defined against that so the 45 / 62 /
// 74 mm rails of RAIL_H all come out as the same extrusion in three lengths —
// which is what three buyers ordering over ten years actually produces.
export const PROF = {
  // NOTHING IS BEHIND lip+12 mm, AND THAT IS DELIBERATE. The flat quad sat at
  // exactly lip+12 mm; the shelf board's front face is at lip+10 mm. A web at
  // +10 mm is coplanar with the board (z-fight) and it also reaches BACK past
  // where the plane used to be, which adds package overlaps rather than
  // removing them. Measured: back at 0.010 gave 1,009 of 1,905 sections
  // overlapping a package against the flat arm's 980. See the pierce table in
  // the round report.
  back: 0.0120,      // the web, 2 mm clear of the shelf board's front face
  seatP: 0.0130,     // where the card seat starts, 1 mm proud of the web
  topRet: 0.0090,    // upper return, vertical height
  botRet: 0.0070,    // lower return, vertical height
  proj: 0.0060,      // how far the returns stand out past the seat
  topFace: 0.0040,   // where the upper return's front face ends, below the top
  botFace: 0.0030,   // where the lower return's ledge sits, above the bottom
  lipEdge: 0.0010,   // and where its front face ends, above the bottom
  crown: 0.0014,     // the top surface falls this much toward the aisle: it is
                     // the facet that catches the light run, so it has to be
                     // tipped enough to be seen from standing height as well
                     // as lit — 1.4 mm over 6 mm of depth is 13 degrees.
  tilt: 0.16,        // radians. The seat leans BACK at the top: 9.2 degrees.
  card: 0.0012,      // card thickness — how far the print floats off the seat
  // ROUND 17's RAIL_H lives in store.js and is NOT duplicated here. This file
  // is handed `h` and derives everything from it; one owner per derivation.
};

// A rail shorter than this cannot hold a card at all — both returns plus a
// usable opening will not fit — so it is emitted as hardware and skipped by
// the tag datum rather than being given a 2 mm card.
export const MIN_OPEN = 0.018;

// profile(h) -> the polyline, TOP to BOTTOM, in (p, v).
//
// Traversal order matters: the outward normal of a segment is the travel
// direction rotated 90 degrees counter-clockwise in the (out, up) plane, and
// emitChannel relies on that to get its winding right without a special case
// per facet. Verified facet by facet in the round report.
export function profile(h) {
  const H = h / 2, P = PROF;
  const openV = Math.max(0, h - P.topRet - P.botRet);   // the opening, vertically
  const dp = openV * Math.tan(P.tilt);                  // how far the seat leans
  const s1 = [P.seatP, H - P.topRet];                   // seat top  = THE DATUM
  const s0 = [P.seatP + dp, -H + P.botRet];             // seat bottom
  // EVERY CONSTANT IN PROF IS READ HERE. That is not a boast, it is the check
  // this project has lost four rounds to the absence of: the first draft of
  // this table declared `topFace` and `botFace` and then wrote 0.005 and 0.0010
  // inline, which is a `config.js` made decorative in miniature.
  const pts = [
    [P.back, H],                                    // 0 web top
    [P.seatP + P.proj, H - P.crown],                // 1 upper return, top surface
    [P.seatP + P.proj - 0.0005, H - P.topFace],     // 2 its front face
    s1,                                             // 3 its underside -> the datum
    s0,                                             // 4 the seat
    [s0[0] + P.proj, -H + P.botFace],               // 5 the ledge the card rests on
    [s0[0] + P.proj, -H + P.lipEdge],               // 6 lower return front
    [P.back, -H],                                   // 7 its underside, back to the shelf
  ];
  return {
    pts,
    openV,
    seat: {
      // the card plane, in the section's own frame
      topV: s1[1], botV: s0[1], topP: s1[0], botP: s0[0],
      midV: (s1[1] + s0[1]) / 2, midP: (s1[0] + s0[0]) / 2,
      tilt: P.tilt, openV,
    },
    span: [-H, H],
  };
}

// FACET NAMES, in emit order. Used by the report and by railCheck so a count
// and a picture can be talked about with the same words.
export const FACETS = ['topSurface', 'topFront', 'topUnder', 'seat', 'ledge', 'botFront', 'botUnder'];

// ---------------------------------------------------------------------------
// emitChannel(Q, o) — one section.
//
//   o.ax    0 = the rail runs along Z and faces +-X   (the qX case)
//           2 = the rail runs along X and faces +-Z   (the qZ case)
//   o.plane the world coordinate, on axis `ax`, of the caller's `lip` datum
//   o.sgn   +1 / -1, the outward direction on that axis
//   o.mid   centre of the section along the run axis
//   o.len   its length
//   o.y     its centre height
//   o.h     its height
//
// Returns the section record RailIndex stores.
export function emitChannel(Q, o) {
  const { ax, plane, sgn, mid, len, y, h } = o;
  const pr = profile(h);
  // out-hat and run-hat. run = out x up, which is what makes R = +len/2 * run
  // the correct winding for every one of the four facings — derived once here
  // rather than four times at the call sites.
  const ox = ax === 0 ? sgn : 0, oz = ax === 2 ? sgn : 0;
  const rx = -oz, rz = ox;
  const [vLo, vHi] = pr.span;
  // texture v across the profile, so the extrusion's map still reads
  // top-to-bottom however many facets the section is cut into. Canvas row 0 is
  // texture v = 1 (flipY), which is why the top of the profile maps to 1.
  const tv = (vv) => (vv - vLo) / (vHi - vLo);
  let n = 0;
  const put = (a, b) => {
    const dp = b[0] - a[0], dv = b[1] - a[1];
    if (Math.abs(dp) < 1e-6 && Math.abs(dv) < 1e-6) return;
    const cp = (a[0] + b[0]) / 2, cv = (a[1] + b[1]) / 2;
    const C = [
      ax === 0 ? plane + ox * cp : mid,
      y + cv,
      ax === 0 ? mid : plane + oz * cp,
    ];
    // U points from a toward b, so the -U corners are `a` and take v = tv(a).
    const U = [ox * dp / 2, dv / 2, oz * dp / 2];
    const R = [rx * len / 2, 0, rz * len / 2];
    Q.rect(C, R, U, 0, tv(a[1]), len, tv(b[1]));
    n++;
  };
  for (let i = 0; i + 1 < pr.pts.length; i++) put(pr.pts[i], pr.pts[i + 1]);
  // FACETS names the seven segments and this is what makes the names binding:
  // if a later round adds or collapses one and does not update the list, the
  // build stops here instead of the report quietly saying "seven facets".
  if (n !== FACETS.length) {
    throw new Error('rail.js: profile emitted ' + n + ' facets, FACETS names '
      + FACETS.length + ' (' + FACETS.join(', ') + ')');
  }
  S.sections++; S.facets += n;
  return { ax, plane, sgn, mid, len, y, h, seat: pr.seat, openV: pr.openV, facets: n };
}

// ---------------------------------------------------------------------------
// RailIndex — the datum.
//
// A card is not a decal placed near a rail; it is a piece of board slid into a
// channel, so its top edge is the channel's top edge, its height is the
// channel's opening, its plane is the channel's seat, and where there is no
// channel there is no card. All four of those need the section, and the section
// is emitted 60 lines and one call frame away from the card. So the emitter
// records what it built and the card emitter asks.
//
// Sections along one run are disjoint and are pushed in increasing order, so
// `at` is a binary search. It returns null in a gap, which is the 4.5% of
// sections railSeg deliberately leaves out plus the 11 mm trim at each end.
export class RailIndex {
  constructor() { this.s = []; }
  push(sec) { this.s.push(sec); return sec; }
  at(pos) {
    const s = this.s;
    let lo = 0, hi = s.length - 1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1, k = s[m];
      if (pos < k.mid - k.len / 2) hi = m - 1;
      else if (pos > k.mid + k.len / 2) lo = m + 1;
      else return k;
    }
    return null;
  }
  // the card frame for a section, at along-run position `pos`, half-width hw.
  //   C  centre, R half-width vector, U half-height vector, N seat normal
  // U and N carry the seat tilt, so Quads.rect derives a normal that points out
  // AND UP — which is the thing `signMat`'s uSignTilt was faking.
  frame(sec, pos, hw) {
    const { ax, plane, sgn, seat } = sec;
    const ox = ax === 0 ? sgn : 0, oz = ax === 2 ? sgn : 0;
    // NOTE THE SIGN, AND WHY IT IS THE OPPOSITE OF emitChannel's.
    // emitChannel walks the profile TOP TO BOTTOM, so its U points DOWN and the
    // right-handed run vector `out x up` gives the outward normal. A card's U
    // points UP, so R flips with it. The first build had this wrong and the
    // symptom was diagnostic rather than subtle: every card came out with
    // normal y = -0.16 instead of +0.16 — leaning forward rather than back —
    // and the 5,658 on the -X faces were BACK-FACING and culled outright.
    // Caught by reading the built soup's normal histogram, not by looking.
    const rx = oz, rz = -ox;
    const c = Math.cos(seat.tilt), s = Math.sin(seat.tilt);
    // half-height ALONG the seat, so the card's VERTICAL extent is exactly the
    // opening. There is no short-card case and no `lift` parameter: the first
    // draft carried one that every call site left at 0, which is a dial nobody
    // turns pretending to be a feature. Card height variety comes from RAIL_H's
    // three profiles, which is where a real store's variety comes from.
    const L = seat.openV / (2 * c);
    const cv = seat.midV;
    const cp = seat.midP + PROF.card;
    const C = [0, sec.y + cv, 0];
    C[0] = ax === 0 ? plane + ox * cp : pos;
    C[2] = ax === 2 ? plane + oz * cp : pos;
    return {
      C,
      R: [rx * hw, 0, rz * hw],
      U: [-ox * s * L, c * L, -oz * s * L],
      N: [ox * c, s, oz * c],
      topV: seat.topV, openV: seat.openV,
    };
  }
}

// ---------------------------------------------------------------------------
// channelTex — the extrusion's own surface.
//
// `railTex` is a PAINTED cross-section: a five-stop vertical gradient from
// "top return, catching the light run" to "shadowed underside of the lip", plus
// a 1.6 px line labelled "the extruded channel that the tag strip slides into".
// Every one of those is now geometry, and leaving the painting under it would
// double-count the same cue twice — the mistake round 8 recorded when it found
// a hand-authored vertical ramp stacked on top of a computed one and drove the
// aisle to a mean luminance of 83 against a reference band of 94-154.
//
// So this map is nearly flat: an anodised off-white with a fine longitudinal
// grain (extrusions are drawn, so their scratches run along the run, never
// across it) and the scuffing a channel at cart-bumper height actually carries.
// What is left of the gradient is a HALF-STOP, not a stop: real aluminium is
// slightly dirtier low down where hands and cartons touch it, and that is a
// soiling gradient rather than a lighting one.
export function channelTex(THREE) {
  const N = 512, H = 64;
  const c = document.createElement('canvas');
  c.width = N; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#f4efe2'; g.fillRect(0, 0, N, H);
  // soiling, low: half a stop over the bottom third, not five stops over all
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(255,253,246,0.30)');
  grd.addColorStop(0.55, 'rgba(255,253,246,0.00)');
  grd.addColorStop(1, 'rgba(150,142,126,0.24)');
  g.fillStyle = grd; g.fillRect(0, 0, N, H);
  // drawn grain — along the extrusion, never across it
  let sd = 20270411;
  const rnd = () => { sd = (sd * 1103515245 + 12345) & 0x7fffffff; return sd / 0x7fffffff; };
  for (let i = 0; i < 260; i++) {
    const y = rnd() * H, a = 0.03 + rnd() * 0.06;
    g.strokeStyle = rnd() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(120,112,98,${a})`;
    g.lineWidth = 0.6 + rnd() * 1.1;
    g.beginPath(); g.moveTo(0, y); g.lineTo(N, y + (rnd() - 0.5) * 1.2); g.stroke();
  }
  // scuffs: short, horizontal, clustered — a cart corner, not a scratch pattern
  for (let i = 0; i < 34; i++) {
    const x = rnd() * N, y = rnd() * H, w = 4 + rnd() * 26;
    g.strokeStyle = `rgba(${140 + rnd() * 60 | 0},${132 + rnd() * 60 | 0},118,${0.05 + rnd() * 0.10})`;
    g.lineWidth = 0.8 + rnd() * 2.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + (rnd() - 0.5) * 2); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// NOT READ IN THE ON ARM — stated here rather than discovered in round 29.
//
// `ragged()` in store.js draws five to seven numbers per card off `tagRng`.
// The ON arm still MAKES every one of those draws, in the same order, so the
// two arms are the same store — but it deliberately does not READ two of them,
// and a value that is drawn and not read is exactly the shape of the shadow
// blocks this project has lost four rounds to. So:
//
//   g.h    the card's own height, 0.68-1.05 x a hard-coded 50 mm. NOT READ.
//          A card in a channel is cut to the channel; its height is the
//          opening. The height VARIETY that g.h was providing now comes from
//          RAIL_H's 45 / 62 / 74 mm profiles, which is where it belongs,
//          because the thing that varies in a real store is which extrusion
//          the buyer ordered and not how tall this particular card was cut.
//          railCheck asserts card height == opening, so if a later round
//          re-reads g.h the assertion fires rather than the cue quietly dying.
//
//   g.tilt the in-plane rotation, +-0.105 rad for one card in six. READ, but
//          CLAMPED to SLOP. A card that fills its opening cannot rotate 6
//          degrees without buckling. What is crooked on a real shelf is the
//          sale card somebody stapled OVER the SKU card, and `g.over` keeps
//          its full rotation. So the crooked-card cue survives; it moves onto
//          the object that is actually free to be crooked.
//
//   g.dy   the +-4 mm vertical jitter. RE-AIMED, not dropped: it becomes a
//          slide ALONG the channel, which is the one direction a card in a
//          C-section is free to move.
export const SLOP = 0.004;      // radians a card can rock inside its opening

// ---------------------------------------------------------------------------
// live counters, for the report
const S = { sections: 0, facets: 0, cards: 0, orphans: 0, shortRails: 0 };
export function railStats() { return Object.assign({ arm: RAILC.name }, S); }
export function bump(k, n = 1) { S[k] += n; }

// ---------------------------------------------------------------------------
// railCheck — READ THE LIVE ARTEFACT.
//
// The rule this file is written under, from four rounds of this project's own
// wreckage: existence in the source is not delivery to the pixel, and a guard
// that asserts a property of the build TABLE certifies nothing. So this reads
// the geometry buffers off the meshes that were actually added to the scene.
//
// Two halves, and BOTH have been proven against the corruption they catch:
//
//   STRUCTURE  the rails soup must carry at least 5 distinct normals and at
//              least 3 with a vertical component. Derived, not invented: the
//              profile is a 7-segment polyline of which 5 segments have a
//              vertical component by construction. Proof it is not vacuous:
//              on `?flatrail` it reads 4 and 0 and reports.
//
//   DATUM      every card the seat emitter placed must have its top edge on
//              its channel line. The bound is not a round number somebody
//              liked — the emitter RECORDS the channel line and the rotation
//              it used, and the tolerance is the exact lift that rotation can
//              produce on that card:
//                  tol = (openV/2) * (2*sin|t| + cos|t| - 1) + 1e-5
//              where t is clamped to SLOP. Peel tails and stapled overlays are
//              recorded and EXCLUDED by name, because a corner out of the
//              channel and a card stapled over the top are the two states that
//              are supposed to break the line; their counts are reported so a
//              later round can see how many were let through.
//
// A CONTROL BUILD IS A BUILD SOMEBODY DELIBERATELY MADE WORSE, so `?flatrail`
// downgrades a failure to a returned report instead of a throw — the rule
// intrusions.js wrote after the r20 gate made another builder's control
// unloadable. The caller throws; this function only ever returns.
const REC = [];
export function note(r) { REC.push(r); }
export function railCheck(scene) {
  const quadsOf = (mesh) => {
    const p = mesh.geometry.attributes.position.array;
    const n = mesh.geometry.attributes.normal.array;
    const out = [];
    for (let q = 0; q * 12 + 11 < p.length; q++) {
      const o = q * 12;
      let lo = Infinity, hi = -Infinity;
      for (let k = 0; k < 4; k++) { const y = p[o + k * 3 + 1]; if (y < lo) lo = y; if (y > hi) hi = y; }
      out.push({ y0: lo, y1: hi, n: [n[o], n[o + 1], n[o + 2]] });
    }
    return out;
  };
  let rails = null, tags = null;
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    if (o.name === 'rails') rails = o;
    if (o.name === 'shelfTags') tags = o;
  });
  const out = { arm: RAILC.name, ok: true, notes: [] };
  if (!rails || !tags) { out.ok = false; out.notes.push('rails/shelfTags soup missing from the scene'); return out; }
  const rq = quadsOf(rails);
  const set = new Set(); let vert = 0;
  for (const q of rq) {
    set.add(q.n.map((v) => v.toFixed(3)).join(','));
    if (Math.abs(q.n[1]) > 0.05) vert++;
  }
  out.railQuads = rq.length;
  out.distinctNormals = set.size;
  out.verticalFacetQuads = vert;
  if (set.size < 5 || vert < 3) {
    out.ok = false;
    out.notes.push('rail has no cross-section: ' + set.size + ' distinct normals, '
      + vert + ' quads with a vertical normal component');
  }
  const tq = quadsOf(tags);
  out.recorded = REC.length;
  out.tagQuads = tq.length;
  out.peelTails = REC.filter((r) => r.peel).length;
  out.overlays = REC.filter((r) => r.over).length;
  let bad = 0, worst = 0, checked = 0, missing = 0;
  for (const r of REC) {
    const q = tq[r.q0];
    if (!q) { missing++; continue; }
    const t = Math.abs(r.t);
    const tol = (r.openV / 2) * (2 * Math.sin(t) + Math.cos(t) - 1) + 1e-5;
    const e = Math.abs(q.y1 - r.datum);
    checked++;
    if (e > worst) worst = e;
    if (e > tol) bad++;
  }
  out.datumChecked = checked;
  out.datumMissing = missing;
  out.datumBad = bad;
  out.datumWorst_mm = +(worst * 1000).toFixed(3);
  if (missing || bad) {
    out.ok = false;
    out.notes.push('card datum: ' + bad + ' of ' + checked + ' off the channel line (worst '
      + (worst * 1000).toFixed(2) + ' mm), ' + missing + ' recorded cards missing from the soup');
  }
  return out;
}

// railSelfTest — FIRE THE GUARD ON PURPOSE.
//
// "An assertion must be proven against the exact corruption it catches." The
// structure half proves itself every time anybody loads `?flatrail`. The datum
// half would otherwise be vacuous on a build that passes, so this corrupts the
// LIVE BUFFER — the same artefact the check reads — with the exact fault it
// exists to catch, confirms it fires, restores the buffer and confirms it
// passes again. Same shape as pack.js's latheCheck self-test.
//
// The corruption is not an arbitrary nudge: it is 8.24 mm, the MEASURED median
// magnitude of the flat arm's card-top-to-rail-top error. If the guard cannot
// see round 26's own mis-registration it is not worth having.
export function railSelfTest(scene) {
  const out = { corruption_mm: 8.24, ok: false };
  if (!RAILC.on) { out.note = 'flat arm: nothing seated to corrupt'; return out; }
  let tags = null;
  scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.name === 'shelfTags') tags = o; });
  if (!tags) { out.note = 'shelfTags soup missing'; return out; }
  const before = railCheck(scene);
  const pos = tags.geometry.attributes.position.array;
  const n = Math.min(500, REC.length);
  const touched = [];
  for (let i = 0; i < n; i++) {
    const q = REC[(i * 7) % REC.length].q0;
    if (touched.includes(q)) continue;
    touched.push(q);
    for (let k = 0; k < 4; k++) pos[q * 12 + k * 3 + 1] += 0.00824;
  }
  const fired = railCheck(scene);
  for (const q of touched) for (let k = 0; k < 4; k++) pos[q * 12 + k * 3 + 1] -= 0.00824;
  const after = railCheck(scene);
  out.corrupted = touched.length;
  out.caughtBefore = before.datumBad;
  out.caughtWhileCorrupt = fired.datumBad;
  out.caughtAfterRestore = after.datumBad;
  out.ok = before.datumBad === 0 && fired.datumBad === touched.length && after.datumBad === 0;
  return out;
}
