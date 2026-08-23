// OWNER: builder-cctv. THE GEOMETRY OF THE GRADE, PUBLISHED.
//
// ===========================================================================
// WHY THIS FILE EXISTS (round 5)
// ===========================================================================
// The floor view is a screen-space post-process over a pinhole render, and one
// term in that post-process MOVES PIXELS: the barrel/fisheye in GradeShader
// (src/cctv/shaders.js, the block marked "2. barrel / fisheye"). Everything
// else in the grade — chroma, bloom, sharpen, scan, vignette, grain — is a
// colour operation and leaves a pixel where it found it. Measured: with every
// round-3 term on and only the two seed-driven ones (grain, macroblocks) held
// still so an on/off difference is readable, 45 known world points across the
// frame land within 0.85 px of the map below, and with the barrel set to zero
// the graded pixel returns to the raw pixel within 0.19 px.
//
// That matters outside this file because src/game/hud.js draws the subject
// brackets, the door markers and the flee chevrons by projecting world
// positions through the live camera (camera.js `projectFromCop`) onto the 2D
// HUD canvas laid over the WebGL canvas. The pinhole is correct for the RAW
// render — measured to 0.37 px mean, 1.95 px worst over those same 45 points —
// and then the grade moves the picture out from under it by up to 31 px. The
// bracket was not on the man.
//
// So the mapping is published rather than removed. The barrel is the lens; a
// security camera that draws straight aisle lines is not a security camera, and
// this project already takes that position on the wall — `boxOf` in cctv.js has
// warped the analytics boxes into feed space since round 4 precisely so "the
// box lands where the man is drawn and not where he would have been through a
// rectilinear lens". The floor view is simply the one surface where the other
// half of that contract was never written down for another owner to call.
//
// THERE IS EXACTLY ONE JS DEFINITION OF THIS MAP AND IT IS HERE. track.js used
// to carry its own `unbarrel`; it now imports this one. CLAUDE.md's rule about
// duplicated derivations is the whole reason this is a module and not a method.
//
// ===========================================================================
// THE MAP
// ===========================================================================
// The shader is a SAMPLING map: for a destination uv it reads the source at
//
//     c    = (uv - 0.5) * (aspect, 1)
//     rmax = 0.25*aspect^2 + 0.25            // |c| at the corner, so corners pin
//     src  = c * (1 + k*|c|^2) / (1 + k*rmax)
//
// which is the INVERSE of what a caller wants. A caller has a source point (the
// pinhole projection) and needs to know where it ended up on screen. Invert it:
// the map is purely radial, so with D = 1 + k*rmax and v = |src| the screen
// radius u is the one real positive root of
//
//     k*u^3 + u = D*v
//
// Cardano, closed form, no iteration. At v -> 0 that gives u -> D*v, so the
// centre of frame magnifies by exactly D and the corners do not move at all:
// k=0.12 at 16:9 is D = 1.1248, which is the "1.12x" the camera builder fitted.
// Their "about x ~= 659" was an artefact of fitting a 1-D affine model to a 2-D
// radial field — a lopsided sample throws the apparent centre a long way (fit
// my right-hand samples alone and it reads 409). Fit symmetrically and it comes
// back to 640.1, the frame centre, to a tenth of a pixel.
//
// The displacement is NOT a uniform scale. It is zero at the centre, peaks near
// 31 px at about 0.6 of the corner radius, and returns to zero at the corners.
// Nothing between here and the corner can be approximated by a constant.
//
// A consequence worth knowing: the map pushes content OFF the frame at the
// edge midlines. Raw (1280, 360) lands at x = 1295. So an off-screen test has
// to be made on the WARPED coordinate, never on the pinhole one.
// ===========================================================================

// --- pure maths, uv in / uv out, y UP (GL convention) ----------------------

// Source uv -> screen uv. This is the direction a HUD needs.
export function barrelFwdUv(ux, uy, aspect, k) {
  if (!(k > 1e-4)) return [ux, uy];
  const lx = (ux - 0.5) * aspect, ly = uy - 0.5;
  const v = Math.hypot(lx, ly);
  if (v < 1e-9) return [ux, uy];
  const rmax = 0.25 * aspect * aspect + 0.25;
  const D = 1 + k * rmax;
  // real root of u^3 + (1/k)u - (D*v/k) = 0; the discriminant is positive for
  // every k > 0, so there is one and Cardano is exact.
  const q2 = D * v / (2 * k), p3 = 1 / (3 * k);
  const s = Math.sqrt(q2 * q2 + p3 * p3 * p3);
  const u = Math.cbrt(q2 + s) + Math.cbrt(q2 - s);
  const g = u / v;
  return [(lx * g) / aspect + 0.5, ly * g + 0.5];
}

// Screen uv -> source uv. The shader's own map, for going the other way: a
// mouse click on the graded picture, or a pick ray.
export function barrelInvUv(ux, uy, aspect, k) {
  if (!(k > 1e-4)) return [ux, uy];
  const lx = (ux - 0.5) * aspect, ly = uy - 0.5;
  const rmax = 0.25 * aspect * aspect + 0.25;
  const g = (1 + k * (lx * lx + ly * ly)) / (1 + k * rmax);
  return [(lx * g) / aspect + 0.5, ly * g + 0.5];
}

// Local magnification at a SOURCE uv, split into its two axes — the map is
// radial, so a small square does not scale evenly. `tangential` is the factor
// across the radius (u/v) and `radial` the factor along it (du/dv). Offered so
// a caller with a one-point marker and a size heuristic can scale the heuristic
// without projecting a second point; a caller that can project two points
// should warp both instead and get this for free.
export function barrelMagUv(ux, uy, aspect, k) {
  if (!(k > 1e-4)) return { radial: 1, tangential: 1 };
  const lx = (ux - 0.5) * aspect, ly = uy - 0.5;
  const v = Math.hypot(lx, ly);
  const rmax = 0.25 * aspect * aspect + 0.25;
  const D = 1 + k * rmax;
  if (v < 1e-9) return { radial: D, tangential: D };
  const [fx, fy] = barrelFwdUv(ux, uy, aspect, k);
  const u = Math.hypot((fx - 0.5) * aspect, fy - 0.5);
  // differentiate v = u(1+k u^2)/D  ->  dv/du = (1+3k u^2)/D
  return { radial: D / (1 + 3 * k * u * u), tangential: u / v };
}

// track.js's historical name for barrelInvUv's opposite. Kept as the export it
// already used so the detector's call site does not change: `unbarrel` has
// always meant "undo the lens, i.e. go source -> screen".
export const unbarrel = barrelFwdUv;

// ---------------------------------------------------------------------------
// THE FLOOR LENS — bound to the live on-foot view.
//
// cctv.js pushes the live barrel strength and the live render size in here from
// createCCTV, from setParams, from resize and from every renderFloor, so a
// caller never has to know either number and can never read a stale one. Until
// createCCTV runs the lens is identity, so importing this module on its own is
// harmless rather than wrong.
// ---------------------------------------------------------------------------
const lens = { k: 0, w: 1280, h: 720, aspect: 1280 / 720 };

export function setFloorLens(k, w, h) {
  lens.k = k > 0 ? k : 0;
  if (w > 0 && h > 0) { lens.w = w; lens.h = h; lens.aspect = w / h; }
}

export function floorLens() { return { ...lens }; }

// ---------------------------------------------------------------------------
// warpFloor — THE CALL. Pinhole pixel in, graded pixel out.
//
// Takes what camera.js `projectFromCop` returns, or a bare (x, y) pair, in the
// fixed 1280x720 design space with a TOP-LEFT origin — the same space the HUD
// canvas is drawn in. Returns a NEW object of the same shape; nothing is
// mutated, so the caller can keep the pinhole value if it wants both.
//
//   const p = warpFloor(projectFromCop(cop, x, 1.75, z));
//
// `behind` is passed through UNTOUCHED and its x/y are not warped: those are
// off-screen sentinels (-90 / W+90), not positions, and bending a sentinel just
// moves the edge arrow.
// ---------------------------------------------------------------------------
export function warpFloor(p, maybeY) {
  const bare = typeof p === 'number';
  const x = bare ? p : p.x, y = bare ? maybeY : p.y;
  const out = bare ? { x, y, behind: false } : { ...p, x, y };
  if (!bare && p.behind) return out;
  if (!(lens.k > 1e-4)) return out;
  const [ux, uy] = barrelFwdUv(x / lens.w, 1 - y / lens.h, lens.aspect, lens.k);
  out.x = ux * lens.w;
  out.y = (1 - uy) * lens.h;
  return out;
}

// The other direction: a pixel on the graded picture (a mouse position, say)
// back to where the pinhole would have put it, so a pick ray can be built.
export function unwarpFloor(p, maybeY) {
  const bare = typeof p === 'number';
  const x = bare ? p : p.x, y = bare ? maybeY : p.y;
  const out = bare ? { x, y, behind: false } : { ...p, x, y };
  if (!(lens.k > 1e-4)) return out;
  const [ux, uy] = barrelInvUv(x / lens.w, 1 - y / lens.h, lens.aspect, lens.k);
  out.x = ux * lens.w;
  out.y = (1 - uy) * lens.h;
  return out;
}

// Local magnification at a PINHOLE pixel — i.e. the point BEFORE warpFloor, not
// after. `tangential` scales a marker's WIDTH and `radial` its HEIGHT, near the
// horizontal and vertical axes respectively; at the centre both are 1.1248 and at
// the corners both fall to 1.
//
// The parameters are named for what they must be because a comment four lines above
// a function does not travel with a copy-pasted call: a handoff snippet passed the
// WARPED point here and it took a second builder reading this file to catch it.
// Passing the warped point silently double-applies the forward map.
export function floorMagAt(pinholeX, pinholeY) {
  return barrelMagUv(pinholeX / lens.w, 1 - pinholeY / lens.h, lens.aspect, lens.k);
}
