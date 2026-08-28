// OWNER: builder-store. WITHIN-FRAME CLASS CONTRAST, BY ABLATION.
//
// NOT IMPORTED BY THE GAME. Nothing in src/ imports this file, so the bundler
// never sees it and it costs the shipped build zero bytes. Load it from the
// console:  const A = await import('/src/store/aniso.js');
//
// =========================================================================
// ROUND 19 — K IS RETIRED. READ THIS BEFORE QUOTING ANYTHING BELOW.
//
// The header that follows is r18's and it is left intact, because the reasoning
// that built K is worth keeping and the ablation machinery under it is still
// the right way to mask a class. But **K itself must not be quoted again**, and
// the round-18 headline it carried — a "+46% residual" against the reference
// photographs — does not survive. Three findings, all from r18's critic:
//
//   1. THE RULE IS ASYMMETRIC AND THE ASYMMETRY DOES THE WORK. The render side
//      is masked by ABLATION and the photograph side by RECTANGLES. Run the
//      crop rule on both sides and the render is **not quotable at 6 of 6
//      poses by this file's own refusal test** — the densest round window
//      reachable on a render frame is 10-35% round pixels, so no rectangle can
//      isolate the class at all. AGENTS_BRIEF calls this the asymmetric-rule
//      trap and says it is "the easiest way on this project to manufacture a
//      gap that does not exist".
//
//   2. K MEASURES ARRANGEMENT, NOT PACKAGING SHAPE. store_01_Langenstein's
//      reads K = 2.034, sweep [1.559, 2.208], **0.0% of a 675-crop sweep below
//      1.0** — fully quotable, and pointing the OTHER way — because it is
//      bottles standing in vertical rows against boxes in horizontal shelf
//      bands. The statistic cannot tell a body of revolution from a planogram.
//      Ninth region-dependent metric retired on this project.
//
//   3. THE FIX WAS NEVER RESTING ON IT. The unwrap is verified **off the
//      geometry**: barrel v-span 0.099-0.248 -> 0.570-0.745 with r = 0.992-0.998
//      on all 51 lathes. That is the evidence, it is a direct reading of the
//      artefact, and round 19 turned it into a live assertion — pack.js's
//      latheCheck(scene) now recovers each profile from POSITIONS and reads the
//      v the GPU is holding, so the same measurement runs on every page load
//      instead of once in a transcript.
//
// WHAT IN THIS FILE IS STILL GOOD: `ablate` / `uvAB` (the mask-by-ablation
// method and the within-run swap), `facingPx` (how many pixels a facing gets,
// projected off the live camera), `atlasBytes`, and POSES. What is dead is the
// ratio-of-ratios K and every number derived from it.
//
// AND THE LEGIBILITY CLAIM THAT GOES WITH IT. r18's "7.40x" was the EXTREME of
// the stretch distribution, not its middle — the median was 3.39x. And facingPx
// says the median can facing is **1.5-2.4 px at chase range**, 8.5 px at the
// nearest pose the rig can reach and 54 px maximum anywhere, so **no per-can
// legibility claim is available at all.** What improved is the aggregate
// banding of the shelf. Say it that way.
// =========================================================================
//
// =========================================================================
// ROUND 18 — WHY THIS EXISTS, AND WHAT ROUND 17'S CRITIC PROVED AGAINST ITS
// OWN HEADLINE.
//
// The r17 critic's finding: 23.0% of every package in the store is a lathe or
// a cylinder, the atlas cell wraps round a body of revolution, and the print
// collapses into vertical smear. Gradient anisotropy
//
//     A = mean|dL/dx| / mean|dL/dy|
//
// read 1.490 +/- 0.372 on the render's round class against 0.730 / 0.783 /
// 1.033 on real photographs. A real can is banded HORIZONTALLY — label, rim,
// lid — so its anisotropy sits UNDER a carton's; the render's sat OVER.
//
// It then published two refutations of its own framing, and both of them are
// constraints on this instrument:
//
//   1. Round facings carry MORE gradient energy, not less. "Less ink" is
//      false. The defect is DIRECTIONAL, not quantitative. So the headline
//      here is a RATIO OF RATIOS and never a magnitude.
//
//   2. WHOLE-FRAME ANISOTROPY DOES NOT SEPARATE AT ALL — the render's 0.706
//      median sits inside the references' 0.617-1.164. Measuring A over a
//      frame measures the frame's shelf edges, rails and uprights, which are
//      the same in both populations. The separation lives in the WITHIN-FRAME
//      CLASS CONTRAST:
//
//          K = A(round) / A(box),   both masks from ONE frame
//
//      K cancels exposure, codec, pose and the fixture grammar term for term,
//      because both masks come out of the same photograph or the same render.
//      K < 1 is the real world. K > 1 is the defect.
//
// THE MASKS ARE ABLATIONS, NOT DECLARED REGIONS. AGENTS_BRIEF has retired
// eight metrics for their measuring boxes, most recently one whose near box
// reached over an endcap base and halved its own denominator, and which swung
// 0.031 -> 0.242 when the box slid 120 px. So on the render side no box is
// declared anywhere: a class's mask is the set of pixels that CHANGE when that
// class is hidden, i.e. the pixels where that class is the frontmost visible
// surface. That definition makes the two masks disjoint by construction —
// a round in front of a box belongs to round and to nothing else — and the
// overlap is computed and asserted rather than assumed.
//
// THE RESTORE IS PROVEN, NOT CLAIMED. Four renders per pose: full, roundOff,
// boxOff, restore. `restore` must be byte-identical to `full`. An unproven
// restore has returned two byte-identical PNGs on this project before,
// including the restored one — so the identity is checked on the PNG bytes
// that land in shots/, by tools/aniso.py, not on a boolean in here.
//
// THE PHOTOGRAPH SIDE CANNOT BE ABLATED and that asymmetry is not hidden:
// tools/aniso.py takes declared crops on the references, prints a LOUD banner
// saying so, and sweeps every crop +/-6% of frame in x and y so the reader
// sees how much of the number is the box. See its header.
// =========================================================================

import { ATLAS } from './plan.js';

// --- which meshes are which class -------------------------------------------
// Read off the artefact: an InstancedMesh belongs to atlas k if its map image
// has k's declared canvas dimensions, exactly as store.js's chopShelfCheck()
// recovers a cell. No name matching, no material identity, no convention — all
// three of those have gone wrong in this repo. The dimension map is asserted
// unique so a future grid change that collides two families fails loudly.
const ROUND_ATLASES = new Set(['can', 'bottle']);

export function classify(scene) {
  const byDims = new Map();
  for (const k of Object.keys(ATLAS)) {
    const A = ATLAS[k];
    const key = (A.cols * A.cw) + 'x' + (A.rows * A.ch);
    if (byDims.has(key)) {
      throw new Error('aniso.js: atlas grids collide at ' + key + ' — '
        + byDims.get(key) + ' and ' + k + '. The class split would be silently wrong.');
    }
    byDims.set(key, k);
  }
  const out = { round: [], box: [], counts: {}, instances: { round: 0, box: 0 } };
  scene.traverse((o) => {
    if (!o.isInstancedMesh) return;
    const im = o.material && o.material.map && o.material.map.image;
    const k = im && byDims.get(im.width + 'x' + im.height);
    if (!k) return;
    const cls = ROUND_ATLASES.has(k) ? 'round' : 'box';
    out[cls].push(o);
    out.instances[cls] += o.count;
    const tag = k + '/' + o.geometry.type;
    out.counts[tag] = (out.counts[tag] || 0) + o.count;
  });
  return out;
}

// --- THE PUBLISHED CAMERA ---------------------------------------------------
// AGENTS_BRIEF: "Pose is ~150x the noise. A single-pose figure is not
// restatable." These are world metres, they are in this file rather than in a
// transcript, and every figure this round quotes names the pose it came from.
//
// Eye height 1.55 m is the cop's. The three `near` poses stand 1.55 m off a
// shelf face, which is as close as the chase rig can get (AISLE_GAP is 4.0, so
// the corridor half-width is 2.0 m and the body takes the rest). The three
// `chase` poses look down an aisle from 13 m out, which is where the player
// spends the chase.
//
// THE FACING PLANES ARE MEASURED, NOT ASSUMED. The first draft of this list put
// three cameras INSIDE a gondola, because it placed them at aisleX(i) +/-
// (AISLE_GAP + SHELF_W)/2 — the run CENTRELINE — instead of at the run's front
// FACE. Recovered from the artefact instead: a histogram of every package
// instance's world x puts the aisle-1 runs at -10.60 and -15.90 spanning
// +/-0.65, so the faces bounding that corridor are -11.25 and -15.25 and the
// corridor between them is exactly AISLE_GAP wide. Same construction on 4 and 7.
export const POSES = [
  { tag: 'near_a1', pos: [-12.80, 1.55, -6.0], look: [-11.25, 1.30, -6.0] },
  { tag: 'near_a4', pos: [  2.20, 1.55,  5.0], look: [  0.65, 1.30,  5.0] },
  { tag: 'near_a7', pos: [ 18.10, 1.55, -3.0], look: [ 16.55, 1.30, -3.0] },
  { tag: 'chase_a1', pos: [-13.25, 1.55, -11.0], look: [-13.25, 1.35, 2.0] },
  { tag: 'chase_a4', pos: [  2.65, 1.55,   9.0], look: [  2.65, 1.35, -4.0] },
  { tag: 'chase_a6', pos: [ 13.25, 1.55, -11.0], look: [ 13.85, 1.35, 2.0] },
];

// --- the four renders -------------------------------------------------------
// snapClean() poses a dedicated camera, hides everything the store did not
// build and renders with no CCTV grade and no HUD, so the numbers are about
// the packaging and not about the post chain.
export async function ablate(tag, pose, prefix = 'r18a') {
  const C = window.__CHOP;
  const cls = classify(C.scene);
  const set = (arr, v) => arr.forEach((o) => { o.visible = v; });
  const name = (s) => prefix + '_' + tag + '_' + s;
  const paths = {};
  paths.full = await C.snapClean(name('full'), pose, { storeOnly: true });
  set(cls.round, false);
  paths.rndoff = await C.snapClean(name('rndoff'), pose, { storeOnly: true });
  set(cls.round, true);
  set(cls.box, false);
  paths.boxoff = await C.snapClean(name('boxoff'), pose, { storeOnly: true });
  set(cls.box, true);
  paths.restore = await C.snapClean(name('restore'), pose, { storeOnly: true });
  return {
    tag, paths,
    meshes: { round: cls.round.length, box: cls.box.length },
    instances: cls.instances,
    counts: cls.counts,
  };
}

export async function ablateAll(prefix = 'r18a', poses = POSES) {
  const out = [];
  for (const p of poses) out.push(await ablate(p.tag, p, prefix));
  return out;
}

// --- THE UNWRAP A/B, WITHIN ONE PAGE LOAD -----------------------------------
// Every cross-build figure in this round spans a reload, and the tree is not
// quiet: the store's own instance census read 44710, 44863 and 45151 on
// different loads with no edit of mine in between, because other agents are
// live in these files. AGENTS_BRIEF's rule for that situation is to make the
// comparison a WITHIN-RUN SWAP, so this is one.
//
// It puts LatheGeometry's original index-based v back on the live geometries —
// same instances, same placement, same atlases, same lighting, same camera —
// renders, and swaps back. The only thing that differs between the two arms is
// the unwrap this round replaced. The restore is proven on the PNG bytes by
// tools/aniso.py, not asserted here.
//
// The old v is RECOVERED, not remembered: latheBands() is monotone in the
// profile index by construction, so sorting the distinct current v values
// recovers the original point order, and the r17 mapping was exactly
// 0.004 + k/(n-1) * 0.992 over that order.
export async function uvAB(prefix = 'r18uv', poses = POSES) {
  const C = window.__CHOP;
  const cls = classify(C.scene);
  const geos = new Map();
  for (const o of cls.round) if (!geos.has(o.geometry.uuid)) geos.set(o.geometry.uuid, o.geometry);
  const saved = [];
  for (const g of geos.values()) {
    const uv = g.attributes.uv;
    if (g.type !== 'LatheGeometry') continue;      // the cylinder has groups, not a profile
    saved.push({ g, arr: Float32Array.from(uv.array) });
    const keys = [...new Set(Array.from({ length: uv.count }, (_, i) => uv.getY(i)))].sort((a, b) => a - b);
    const n = keys.length;
    const idx = new Map(keys.map((v, k) => [v, 0.004 + (k / (n - 1)) * 0.992]));
    for (let i = 0; i < uv.count; i++) uv.setY(i, idx.get(uv.getY(i)));
    uv.needsUpdate = true;
  }
  // Arm A: r17's index-based v, four renders per pose so the class masks are
  // ablations here too. The masks are identical between the arms by
  // construction — a UV change moves no vertex — and aniso.py checks that.
  for (const p of poses) await ablate(p.tag, p, prefix + 'A');
  for (const s of saved) { s.g.attributes.uv.array.set(s.arr); s.g.attributes.uv.needsUpdate = true; }
  for (const p of poses) await ablate(p.tag, p, prefix + 'B');
  return { geometriesSwapped: saved.length, poses: poses.length };
}

// --- HOW MANY PIXELS DOES A FACING ACTUALLY GET? ----------------------------
// The third deliverable of the round. This does NOT use the trigonometry of the
// projection matrix on a declared facing width — that is a derivation nobody
// can check. It projects every instance's own world-space bounding sphere
// through the LIVE camera and reports the distribution of screen widths, which
// is the artefact.
//
// AND IT MEASURES THE PRINTED FRONT, NOT A WORLD AXIS. The first draft here
// projected each instance's world x extent, which on this floor is the package's
// DEPTH: products.js turns every facing to look down the corridor, and the
// corridors run along Z, so a facing on an aisle-1 run is rotated 90 degrees
// about Y and its world-x span is how deep the box is. That draft read a can at
// 144 px. What is wanted is the span of the printed face itself, so the two
// front-face edges — local (-0.5, 0, +0.5) and (+0.5, 0, +0.5) — are pushed
// through the instance matrix and projected, and the answer is rotation-proof.
export function facingPx(pose, w = 1280) {
  const C = window.__CHOP, T = C.THREE;
  const cam = C.probeCam;
  cam.fov = pose.fov ?? 52;
  cam.position.set(...pose.pos);
  cam.lookAt(...pose.look);
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld();
  const cls = classify(C.scene);
  const m = new T.Matrix4(), v = new T.Vector3();
  const eL = new T.Vector3(), eR = new T.Vector3(), c = new T.Vector3();
  const pL = new T.Vector3(), pR = new T.Vector3();
  const byAtlas = {};
  const all = [...cls.round, ...cls.box];
  for (const o of all) {
    o.updateMatrixWorld();
    const im = o.material.map.image;
    let k = null;
    for (const kk of Object.keys(ATLAS)) {
      const A = ATLAS[kk];
      if (A.cols * A.cw === im.width && A.rows * A.ch === im.height) k = kk;
    }
    if (!k) continue;
    const arr = (byAtlas[k] = byAtlas[k] || []);
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m); m.premultiply(o.matrixWorld);
      v.setFromMatrixPosition(m);
      c.copy(v).project(cam);
      if (c.z <= -1 || c.z >= 1 || Math.abs(c.x) > 1.1 || Math.abs(c.y) > 1.1) continue;
      eL.set(-0.5, 0, 0.5).applyMatrix4(m); eR.set(0.5, 0, 0.5).applyMatrix4(m);
      pL.copy(eL).project(cam); pR.copy(eR).project(cam);
      if (pL.z <= -1 || pR.z <= -1) continue;
      arr.push(Math.abs(pR.x - pL.x) * w / 2);
    }
  }
  const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  const out = {};
  for (const k of Object.keys(byAtlas)) {
    const a = byAtlas[k].sort((p, r) => p - r);
    if (!a.length) continue;
    out[k] = {
      n: a.length,
      p50: +q(a, 0.50).toFixed(1), p90: +q(a, 0.90).toFixed(1),
      p99: +q(a, 0.99).toFixed(1), max: +a[a.length - 1].toFixed(1),
    };
  }
  return out;
}

export function facingPxAll(poses = POSES) {
  const acc = {};
  for (const p of poses) {
    const r = facingPx(p);
    for (const k of Object.keys(r)) {
      const e = (acc[k] = acc[k] || { n: 0, p50: 0, p90: 0, p99: 0, max: 0, poses: 0 });
      e.n += r[k].n; e.poses++;
      e.p50 += r[k].p50; e.p90 += r[k].p90; e.p99 += r[k].p99;
      e.max = Math.max(e.max, r[k].max);
    }
  }
  for (const k of Object.keys(acc)) {
    const e = acc[k];
    e.p50 = +(e.p50 / e.poses).toFixed(1);
    e.p90 = +(e.p90 / e.poses).toFixed(1);
    e.p99 = +(e.p99 / e.poses).toFixed(1);
  }
  return acc;
}

// --- THE MEMORY BILL, READ OFF THE LIVE TEXTURES ----------------------------
// AGENTS_BRIEF: round 17 quoted RGBA8 with no mipmaps while all four atlases
// have generateMipmaps: true, and understated its own bill by a third. This
// reads `generateMipmaps` and `minFilter` off the LIVE texture objects and
// applies the 4/3 mip tail only when the texture really has one, so the figure
// cannot go stale against a change in pack.js.
export function atlasBytes(scene = window.__CHOP.scene) {
  const seen = new Map();
  let storeTotal = 0;
  scene.traverse((o) => {
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const mt of mats) {
      for (const slot of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'alphaMap', 'aoMap']) {
        const t = mt && mt[slot];
        if (!t || !t.image || seen.has(t.uuid)) continue;
        const w = t.image.width, h = t.image.height;
        // A mip chain only exists if the texture asked for one AND the
        // minFilter samples it. Both are read, neither is assumed.
        const mipped = !!t.generateMipmaps && /Mipmap/.test(String(t.minFilter === 1008 ? 'LinearMipmapLinear' : t.minFilter));
        const tail = t.generateMipmaps ? 4 / 3 : 1;
        const bytes = w * h * 4 * tail;
        seen.set(t.uuid, { w, h, mip: !!t.generateMipmaps, bytes, slot, mipped });
        storeTotal += bytes;
      }
    }
  });
  const pkgKeys = new Set();
  for (const k of Object.keys(ATLAS)) pkgKeys.add((ATLAS[k].cols * ATLAS[k].cw) + 'x' + (ATLAS[k].rows * ATLAS[k].ch));
  let pkg = 0; const rows = [];
  for (const [, v] of seen) {
    const key = v.w + 'x' + v.h;
    if (pkgKeys.has(key)) { pkg += v.bytes; rows.push({ dims: key, mip: v.mip, mb: +(v.bytes / 1048576).toFixed(2) }); }
  }
  return {
    packageAtlasesMB: +(pkg / 1048576).toFixed(1),
    storeTexturesMB: +(storeTotal / 1048576).toFixed(1),
    textures: seen.size,
    rows,
  };
}

// --- DRAW CALLS AND TRIANGLES, AS A WITHIN-RUN TOGGLE -----------------------
//
// AGENTS_BRIEF is unusually specific about this one, because two rounds got it
// wrong: `renderer.info` read 129 calls / 2,511,402 tris and 135 /2,513,886 on
// THE SAME BUILD AT THE SAME POSE minutes apart, so "naming the pose is not
// enough — the probe's own hide-set moves it. The only trustworthy comparison
// is a toggle within a single run: capture, flip, capture again, without
// reloading or re-deriving the hide-set."
//
// So: the hide-set is established ONCE by a single snapClean(storeOnly) call,
// and then both arms are plain renderer.render() calls into that same state
// with nothing between them but `visible` on the three round-19 sign nodes.
// No reload, no second derivation, no material swap — a `visible` flag cannot
// drop a shader define or invalidate a program, which is the failure mode
// AGENTS_BRIEF records for map-stripping ablations.
//
// It reports the pose because the ABSOLUTE numbers are still pose-dependent and
// nobody should restate them. The DELTA is the quantity that means something.
export const DRAW_POSE = { tag: 'draw_chaseOut_a1', pos: [-13.25, 1.55, -2.0],
  look: [-13.25, 1.55, -15.0] };

export async function drawAB(pose = DRAW_POSE) {
  const C = window.__CHOP;
  const R = C.renderer;
  const names = ['lightboxes', 'vendorPOS', 'categoryHangers'];
  const nodes = [];
  C.scene.traverse((o) => { if (names.includes(o.name)) nodes.push(o); });
  if (nodes.length !== names.length) {
    throw new Error('drawAB: expected ' + names.length + ' round-19 sign nodes, found '
      + nodes.length + ' (' + nodes.map((o) => o.name).join(',') + '). A probe that '
      + 'silently measures nothing is worse than no probe.');
  }
  // ONE derivation of the hide-set and one camera pose, both from snapClean.
  await C.snapClean(pose.tag + '_on', pose, { storeOnly: true });
  const read = () => {
    R.info.reset();
    R.render(C.scene, C.probeCam);
    return { calls: R.info.render.calls, tris: R.info.render.triangles };
  };
  const on = read();
  const wasVisible = nodes.map((o) => o.visible);
  nodes.forEach((o) => { o.visible = false; });
  const off = read();
  nodes.forEach((o, i) => { o.visible = wasVisible[i]; });
  const back = read();
  return {
    pose: pose.tag, camera: { pos: pose.pos, look: pose.look, fov: pose.fov ?? 52 },
    on, off,
    delta: { calls: on.calls - off.calls, tris: on.tris - off.tris },
    restored: back.calls === on.calls && back.tris === on.tris,
    nodes: nodes.map((o) => o.name + ':' + (o.geometry && o.geometry.index
      ? o.geometry.index.count / 3 : 0) + 'tri'),
  };
}
