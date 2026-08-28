// OWNER: builder-floor. THE MOVING HALF OF THE WORLD LIGHT FIELD. ROUND 28.
//
// WHY THIS FILE EXISTS, and it is one sentence:
//
//   ./light.js's Field is stamped BY CONSTRUCTION at build time, through
//   kit.js's Batch.push and store.js's solid(). Everything that moves is
//   created after that bake and goes through neither sink, so the field —
//   and therefore every shadow, every contact line and every reflection in
//   this store — is blind to it.
//
// Round 27's critic, HIGH confidence, ten observations across three poses in
// both arms against two reference photographs:
//
//   "NOTHING STANDING ON THE FLOOR DARKENS IT — shoes, all four cart casters,
//    the endcap base, every kick plate. In the matched Ingles reference at the
//    same apparent distance, every caster has a contact shadow."
//
// It offered three alternatives it could not exclude. All three were tested on
// the live build BEFORE a line of this was written, and the results decide the
// shape of the file:
//
//   (1) "the floor is not a shadow RECEIVER."  FALSE.
//       Stamping a synthetic 0.30 m x 1.00 m column straight into the live
//       field texture at the exact spot a cart stands on darkens the floor band
//       0.45-1.05 m in front of it by 0.103 mean linear luma, 0.877 -> 0.776,
//       891 of 891 pixels, max 0.347; a control band 3.0-3.6 m away moves
//       2.8e-5. Undo restores byte-identically over 58,420 px. The floor is a
//       perfect receiver.
//
//   (2) "the cascade does not reach 12 m."  FALSE.
//       chopA.x on the aisle floor measured outward from a gondola kickplate,
//       in world millimetres, at five camera distances:
//                    30mm   80    150    300    550    900   1400
//         camD  4 m  0.058  0.073 0.118  0.224  0.504  0.792  0.871
//         camD  6 m  0.057  0.065 0.120  0.228  0.510  0.830  0.896
//         camD 13 m  0.087  0.157 0.195  0.372  0.612  0.799  0.815
//         camD 16 m  0.062  0.067 0.115  0.268  0.492  0.798  0.880
//         camD 19 m  0.053  0.075 0.128  0.232  0.516  0.816    -
//       The profile at 19 m is the profile at 4 m. The term reaches, it is
//       strong, and the critic's "every kick plate" is wrong: a kickplate takes
//       the floor to 6% of its open-aisle visibility. What has no shadow is
//       everything that MOVES.
//
//   (3) "the swirl is a separate decal cue."  TRUE, and it is a different
//       fault with a different owner — see the note at the end of this header.
//
// SO THE GAP IS EXACTLY ONE THING: the occluder set, not the receiver, not the
// estimator and not the reach. Measured on the live scene graph, every mesh
// whose world AABB touches the floor within 60 mm and whose column in the baked
// field is empty:
//
//     101 of 101 absent.  42 shopper feet, 56 cart casters, 3 on the thief,
//     plus the cop's two. One reads a non-zero field height and only because it
//     is parked inside a gondola's own stamp footprint.
//
// And the literal falsifier the critic asked for, F1: translating a shopping
// cart 1.0 m along the aisle changes ZERO of 880 floor pixels in the band
// 0.45-1.05 m in front of it, zero of 1274 at 1.3-1.9 m and zero of 2829 in a
// control at 3.0-3.6 m. meanAbs 0.0, maxAbs 0.0, linear luma. The floor does
// not know the cart is there.
//
// ===========================================================================
// WHAT THIS IS
//
// A second height field over the same footprint, holding the same quantity —
// how tall the tallest thing standing in each column is — for the things
// light.js cannot see, rebuilt each animation frame.
//
// IT IS POPULATED BY CONSTRUCTION, which is the whole argument of light.js's
// header one structure along. Nothing opts in and nothing is named: `scan()`
// walks the scene and takes every mesh that (a) touches the floor, (b) is small
// enough to be a thing rather than the room, and (c) is NOT already in the
// static field. A prop dropped by a shopper in round 30, by a file that has
// never heard of this one, is an occluder the moment it exists. The scan
// repeats on a slow cadence so objects created after boot are picked up.
//
// THE EXCLUSION IS THE STATIC FIELD ITSELF, and that is deliberate: it is the
// one test that cannot drift, because it asks the artefact rather than a list.
// A gondola is excluded because light.js already stamped it, not because
// somebody remembered gondolas.
//
// ===========================================================================
// THE DERIVATION IS LIGHT.JS'S AND IT IS NOT COPIED TWICE WITHOUT A GUARD
//
// CLAUDE.md's standing rule: exactly one piece of code owns a derivation. The
// estimator below has the same shape as light.js's chopTap / chopCore — the
// same sin^2(theta) horizon, the same five hand-placed radii, the same
// parabola weights, the same radius-matched mip — because two shadows in one
// frame that disagree about what a shadow IS are worse than one.
//
// It could not literally call chopCore: chopCore reads chopFldTop, which reads
// uFld, and there is no sampler parameter to pass. So this is the "genuinely
// unavoidable second copy" case, and it takes the treatment that case requires:
//
//   * every REMAPPING constant is read live off light.js's own uniform bag
//     (uFldCore.x strength, .y bias, .z gain, .w reach). None is retyped here.
//     Change uFldCore in light.js and this term moves with it.
//   * treadSelfTest() stamps one identical box into BOTH fields and asserts the
//     two estimators return the same number on the same input, and is proven
//     against the exact corruption it catches. See the note there.
//
// ===========================================================================
// WHAT THIS ROUND DOES NOT FIX, stated here because the next round will find it
//
// * THE FILAMENTS ARE NOT MINE AND THEY ARE NOT A LIGHTING TERM. Round 27's
//   observation (a) — "an amorphous bright pool with dark curling filaments
//   mid-aisle... they curl, ignore the tile seams' perspective, and subtend the
//   same size at 4 m and 12 m" — is the FLOOR WEAR DECAL, a MultiplyBlending
//   plane 4 mm above the floor built by ../store/tex.js floorWearTex().
//   Ablation, at chase_a4, one change at a time: hide that one mesh and every
//   filament goes with it, while ablating the mirror (uGloss 0) or the burnish
//   (a flat 128 uBurn) leaves them untouched.
//   Its two authoring loops, measured against N = 1024 over spanX 47.7 m, i.e.
//   46.6 mm per canvas pixel:
//     - skid arcs at every lane x cross-aisle corner: radius 0.62-1.55 m,
//       stroke 42-158 mm, alpha to 0.30, 5-11 per corner, four corners. They
//       cluster into a 3 m scribble exactly where the aisle meets the mid-store
//       walkway, which is 9.7 m from the chase_a4 camera and is where the
//       critic drew its box.
//     - "buffer swirls", 420 of them: radius 1.86-12.1 m, stroke 37-121 mm,
//       sweeps up to 10.9 m of arc, and half of them are stroked WHITE into a
//       multiply layer, where white is the identity and they do nothing at all.
//   F2 was run on it and the answer is the opposite of the one the critic
//   expected: over a floor band 5-13 m out, best normalised cross-correlation
//   shift between two cameras 0.5 m apart was albedo (-2,-6) r 0.787, the wear
//   layer alone (-1,-7) r 0.705, the mirror alone (0,-4) r 0.743. The filaments
//   track the tile seams to within one pixel of a six-pixel parallax; it is the
//   MIRROR that slides, by two of six, which is correct for a virtual source
//   2.9 m below the floor. So they are baked — into a decal, not into a
//   lighting term.
// * THE REFLECTION. A shopper standing on a burnished floor still has no mirror
//   image, because the floor's reflected march reads light.js's field and this
//   field carries no colour. Occlusion only, this round, on purpose: one dial.
// * BODIES DO NOT SHADE EACH OTHER OR THE FIXTURES. This term is read by the
//   floor and by nothing else.

// ---------------------------------------------------------------------------
// CONSTANTS. Height range and grid, and the reasons.
//
// TREAD_H 2.20 m: nothing that walks is taller, and a coarser range would waste
// the 8-bit quantisation on air. One texel of height is 8.6 mm.
//
// TREAD_N 512 over a 47.7 x 38.0 m room is 93 x 74 mm per texel — the same xz
// grid light.js's occupancy volume uses, and chosen for a reason that is worth
// writing down because it looks too coarse: A CASTER IS NOT WHAT SHADOWS A
// CART. A 40 mm caster subtends almost no sky; what darkens the floor under a
// trolley in a photograph is the BASKET, 0.6 x 1.05 m of steel 0.9 m up, and
// that stamps over forty texels. The caster still contributes, at the fractional
// coverage its area earns, exactly as light.js's box() weights a sub-texel
// solid. Going to 1024 quadruples a per-frame upload to buy detail below the
// blur width of the term that reads it.
export const TREAD_H = 2.20;
export const TREAD_N = 1024;

// Collection rules, all properties of the OBJECT rather than of a name.
//
// HANG_TOP. The first version of this admitted only meshes whose world AABB
// TOUCHED the floor, and that was wrong in a way worth writing down because it
// is the obvious rule: a shopper's torso starts at 0.80 m and a cart's basket
// at 0.35 m, so "touches the floor" admitted the legs and the four casters and
// threw away every part of the body that actually blocks the ceiling. Measured
// on that build: one visible contact patch in the whole frame, 913 of 921,600
// pixels changed. What occludes a floor point is the whole column standing over
// it, which is precisely why ../store/light.js's box() stamps y1 and ignores y0
// and rejects only things hanging from the ceiling (its HANG_Y, 2.90 m).
// TREAD_H is used as that line here rather than 2.90 because nothing that walks
// is 2.2 m tall and a stricter line cannot admit a prop light.js would reject.
const HANG_TOP = TREAD_H;    // world AABB min.y at or above this: it hangs
const MIN_TOP = 0.05;        // ...and it has to be something, not a decal
const MAX_FOOT = 6.0;        // m^2. The floor plane, the wear plane and the
                             // ceiling are the room, not props in it.
const STATIC_H = 0.25;       // if light.js already reads this tall here, it is
                             // stamped and stamping it twice double-darkens
// INSTANCED MESHES. Every solid ../store/kit.js batches is an InstancedMesh
// whose own matrixWorld is the identity — the transforms live in
// instanceMatrix — so reading geometry.boundingBox through matrixWorld puts all
// 17,648 fixtures in one 300 mm box at the origin. That is not a rounding
// error, it is a different object. Instances are read individually.
// A mesh whose sampled instances are already in the static field is skipped
// whole rather than iterated: the store's own batches are stamped by
// construction through Batch.push, and this is that fact measured rather than
// remembered.
const INST_SAMPLE = 32;      // instances probed before deciding
const INST_STATIC_FRAC = 0.75;
const RESCAN_MS = 2000;      // Picks up anything created after boot. Wall clock,
                             // not ticks: ../cctv.js renders the scene ten
                             // times per animation frame, so a tick count would
                             // put a full scene traverse in every fifth frame.

// ---------------------------------------------------------------------------
export class TreadField {
  constructor(THREE, opts) {
    const { minX, minZ, spanX, spanZ } = opts;
    this.THREE = THREE;
    this.N = opts.N ?? TREAD_N;
    this.minX = minX; this.minZ = minZ; this.spanX = spanX; this.spanZ = spanZ;
    this.kx = this.N / spanX; this.kz = this.N / spanZ;
    this.data = new Uint8Array(this.N * this.N);
    const t = new THREE.DataTexture(this.data, this.N, this.N, THREE.RedFormat);
    t.type = THREE.UnsignedByteType;
    // LINEAR, not sRGB. This is a height, the same as light.js's alpha channel,
    // and three does not touch alpha there for exactly this reason. Encoding it
    // would bend the one quantity the estimator is a function of.
    t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;      // the wide taps read coarse mips, same as chopTap
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    this.tex = t;

    this.uniforms = {
      uTread: { value: t },
      uTreadMap: { value: new THREE.Vector4(1 / spanX, minX, 1 / spanZ, minZ) },
      // x height range, y texels per metre, z the A/B dial, w the gain
      uTreadCfg: { value: new THREE.Vector4(TREAD_H, this.N / spanX, 1.0, 1.0) },
    };

    this.items = [];             // { obj, box: Box3 (local) }
    this.ticks = 0;
    this.hash = 0;
    this.lastRaster = 0;         // ms
    this.rasterN = 0;            // occluders stamped last raster
    this.texels = 0;             // texels written last raster
    this.skipped = 0;            // ticks that found nothing moved
    this.rebuilt = 0;
    this._b3 = new THREE.Box3();
    this._v3 = new THREE.Vector3();
    this._scratch = new THREE.Box3();
  }

  // -------------------------------------------------------------------------
  // COLLECT. Properties of the object, never a name list — see the header.
  // `staticTop(x, z)` is light.js's own baked height, passed in rather than
  // imported so this file has no opinion about how that field is addressed.
  scan(scene, staticTop) {
    const T = this.THREE;
    const items = [];
    const seen = { candidates: 0, hanging: 0, room: 0, inStatic: 0, movedInStatic: 0,
      instMeshes: 0, instMeshesSkipped: 0, instancesRead: 0, taken: 0 };
    const nextPos = new Map();
    const bb = this._b3;
    const m4 = this._m4 || (this._m4 = new T.Matrix4());
    const im = this._im || (this._im = new T.Matrix4());

    // one candidate, with its world AABB already computed
    const take = (o, local, inst) => {
      if (!isFinite(bb.min.y)) return;
      if (bb.min.y >= HANG_TOP) { seen.hanging++; return; }
      if (bb.max.y < MIN_TOP) return;
      seen.candidates++;
      const foot = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
      if (foot > MAX_FOOT) { seen.room++; return; }
      const cx = (bb.min.x + bb.max.x) * 0.5, cz = (bb.min.z + bb.max.z) * 0.5;
      // ...AND THE STATIC TEST NEEDS A SECOND OPINION, because it is a question
      // about a COLUMN and the subject is an OBJECT. Colliders are padded
      // outward — ../store.js pads the coolers by 100 mm — so a cart parked
      // against a shelf face, or a shopper reaching into one, stands inside
      // that fixture's stamp and would be thrown away as "already in the static
      // field" when the static field has never heard of it.
      // The discriminator is the one thing that cannot be wrong about which
      // half of the world an object belongs to: DID IT MOVE. Positions are
      // carried from the previous scan, so anything that has shifted more than
      // 5 mm in the last two seconds is admitted whatever column it is in.
      const key = o.uuid + (inst == null ? '' : '#' + inst);
      const now = [cx, bb.max.y, cz];
      const was = this.prevPos && this.prevPos.get(key);
      const moved = was && (Math.abs(was[0] - cx) > 0.005 || Math.abs(was[2] - cz) > 0.005
        || Math.abs(was[1] - bb.max.y) > 0.005);
      nextPos.set(key, now);
      if (staticTop(cx, cz) > STATIC_H && !moved) { seen.inStatic++; return; }
      if (moved) seen.movedInStatic += (staticTop(cx, cz) > STATIC_H) ? 1 : 0;
      items.push({ obj: o, local, inst });
      seen.taken++;
    };

    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh && !o.isPoints) return;
      let p = o;
      while (p) { if (p.userData && p.userData.chopNoTread) return; p = p.parent; }
      if (!o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const local = o.geometry.boundingBox;
      if (!local) return;

      if (o.isInstancedMesh && o.instanceMatrix) {
        seen.instMeshes++;
        const n = o.count;
        if (!n) return;
        // Is this batch already in the static field? Sample rather than trust.
        let hit = 0, tried = 0;
        const step = Math.max(1, Math.floor(n / INST_SAMPLE));
        for (let i = 0; i < n; i += step) {
          o.getMatrixAt(i, im);
          m4.multiplyMatrices(o.matrixWorld, im);
          const e = m4.elements;
          if (staticTop(e[12], e[14]) > STATIC_H) hit++;
          tried++;
        }
        if (tried && hit / tried >= INST_STATIC_FRAC) { seen.instMeshesSkipped++; seen.inStatic += n; return; }
        for (let i = 0; i < n; i++) {
          o.getMatrixAt(i, im);
          m4.multiplyMatrices(o.matrixWorld, im);
          bb.copy(local).applyMatrix4(m4);
          seen.instancesRead++;
          take(o, local, i);
        }
        return;
      }
      bb.copy(local).applyMatrix4(o.matrixWorld);
      take(o, local, null);
    });
    // `local` is shared with the geometry, never mutated: raster() copies it
    // into its own Box3 before transforming. Cloning 240 boxes per scan would
    // be 240 allocations every two seconds for nothing.
    this.items = items;
    this.census = seen;
    this.prevPos = nextPos;
    this.hash = 0;               // force a raster on the next tick
    return seen;
  }

  // -------------------------------------------------------------------------
  // ONE FRAME.
  //
  // THE DIRTY CHECK IS NOT AN OPTIMISATION, IT IS A CORRECTNESS GUARD. This is
  // driven off the floor MATERIAL's onBeforeRender, and ../cctv.js renders the
  // whole scene nine more times per animation frame for the monitor wall. Ten
  // rasters and ten uploads per frame for one set of positions is the cost of
  // not asking whether anything moved. An FNV-1a over the occluders' world
  // translations is 3 floats per item and answers it exactly.
  tick(scene, staticTop) {
    this.ticks++;
    if (this.frozen) return false;       // a self-test owns the texture
    const now = (typeof performance !== 'undefined') ? performance.now() : 0;
    if (staticTop && (this.lastScan === undefined || now - this.lastScan > RESCAN_MS)) {
      this.lastScan = now;
      this.scan(scene, staticTop);
    }
    const items = this.items;
    let h = 0x811c9dc5;
    for (let i = 0; i < items.length; i++) {
      const e = this.worldOf(items[i]).elements;
      // translation only: an occluder that rotates in place moves its own AABB
      // by less than a texel, and a rotation without translation is a shopper
      // turning on the spot.
      h = fnvF(h, e[12]); h = fnvF(h, e[13]); h = fnvF(h, e[14]);
    }
    if (h === this.hash && this.hash !== 0) { this.skipped++; return false; }
    this.hash = h;
    this.raster();
    return true;
  }

  // The world matrix of one item, instanced or not. ONE OWNER for the
  // composition, called by the raster, by the dirty hash and by any probe, so
  // the three cannot disagree about where an instance is.
  worldOf(it) {
    if (it.inst == null) return it.obj.matrixWorld;
    const T = this.THREE;
    const im = this._imW || (this._imW = new T.Matrix4());
    const out = this._m4W || (this._m4W = new T.Matrix4());
    it.obj.getMatrixAt(it.inst, im);
    return out.multiplyMatrices(it.obj.matrixWorld, im);
  }

  raster() {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const N = this.N, D = this.data, bb = this._scratch;
    D.fill(0);
    let texels = 0, n = 0;
    for (const it of this.items) {
      bb.copy(it.local).applyMatrix4(this.worldOf(it));
      if (bb.max.y <= 0.012) continue;          // a floor decal is not an occluder
      // Same quantity light.js's box() stamps: the TOP of the solid, clamped to
      // the range this texture encodes, weighted by how much of each texel the
      // footprint actually covers. y0 is deliberately not consulted — a cart
      // basket 0.9 m up with air under it occludes the ceiling exactly as much
      // as a box on the floor does, and the ceiling is where this floor's light
      // comes from.
      const hgt = Math.min(bb.max.y, TREAD_H) / TREAD_H * 255;
      const ax = (bb.min.x - this.minX) * this.kx, bx2 = (bb.max.x - this.minX) * this.kx;
      const az = (bb.min.z - this.minZ) * this.kz, bz2 = (bb.max.z - this.minZ) * this.kz;
      let i0 = Math.floor(ax), i1 = Math.ceil(bx2);
      let j0 = Math.floor(az), j1 = Math.ceil(bz2);
      if (i1 <= 0 || j1 <= 0 || i0 >= N || j0 >= N) continue;
      if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0;
      if (i1 > N) i1 = N; if (j1 > N) j1 = N;
      if (i1 === i0) i1 = i0 + 1;
      if (j1 === j0) j1 = j0 + 1;
      for (let j = j0; j < j1; j++) {
        const covZ = Math.min(bz2, j + 1) - Math.max(az, j);
        if (covZ <= 0) continue;
        const row = j * N;
        for (let i = i0; i < i1; i++) {
          const covX = Math.min(bx2, i + 1) - Math.max(ax, i);
          if (covX <= 0) continue;
          const v = hgt * Math.min(1, covX) * Math.min(1, covZ);
          const k = row + i;
          if (v > D[k]) { if (D[k] === 0) texels++; D[k] = v; }
        }
      }
      n++;
    }
    this.tex.needsUpdate = true;
    this.rasterN = n; this.texels = texels; this.rebuilt++;
    this.lastRaster = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
  }

  // Height at a world point, off the texture the GPU is bound to — not off a
  // source array. Used by the self-test and by any probe that wants a number.
  topAt(x, z) {
    const u = (x - this.minX) * this.kx, v = (z - this.minZ) * this.kz;
    if (u < 0 || v < 0 || u >= this.N || v >= this.N) return 0;
    return this.data[(Math.floor(v) * this.N + Math.floor(u))] / 255 * TREAD_H;
  }

  // A cylinder written straight into the live texture, outside the scan/raster
  // path, for the self-test. Returns an undo that restores byte-identically —
  // proven, not asserted: the caller diffs the restored frame against the
  // baseline and requires zero.
  stampManual(x, z, r, h) {
    const N = this.N, D = this.data, saved = [];
    const enc = Math.min(255, Math.round(Math.min(h, TREAD_H) / TREAD_H * 255));
    const i0 = Math.max(0, Math.floor((x - r - this.minX) * this.kx));
    const i1 = Math.min(N, Math.ceil((x + r - this.minX) * this.kx));
    const j0 = Math.max(0, Math.floor((z - r - this.minZ) * this.kz));
    const j1 = Math.min(N, Math.ceil((z + r - this.minZ) * this.kz));
    for (let j = j0; j < j1; j++) {
      const wz = this.minZ + (j + 0.5) / this.kz;
      for (let i = i0; i < i1; i++) {
        const wx = this.minX + (i + 0.5) / this.kx;
        if ((wx - x) ** 2 + (wz - z) ** 2 > r * r) continue;
        const k = j * N + i;
        saved.push(k, D[k]);
        if (D[k] < enc) D[k] = enc;
      }
    }
    this.tex.needsUpdate = true;
    // the raster would overwrite this on the next tick; hold it off
    this.frozen = true;
    const self = this;
    return { texels: saved.length / 2,
      undo() { for (let q = 0; q < saved.length; q += 2) D[saved[q]] = saved[q + 1];
        self.tex.needsUpdate = true; self.frozen = false; } };
  }

  stats() {
    return {
      items: this.items.length, census: this.census,
      ticks: this.ticks, rebuilt: this.rebuilt, skippedTicks: this.skipped,
      lastRasterMs: +this.lastRaster.toFixed(3),
      occludersStamped: this.rasterN, texelsWritten: this.texels,
      grid: this.N, mmPerTexelX: +(this.spanX / this.N * 1000).toFixed(1),
      mmPerTexelZ: +(this.spanZ / this.N * 1000).toFixed(1),
    };
  }
}

// FNV-1a over a float's bits. One shared scratch view; no allocation per call.
const _fb = new Float32Array(1);
const _fi = new Int32Array(_fb.buffer);
function fnvF(h, f) {
  _fb[0] = f;
  let x = _fi[0];
  for (let b = 0; b < 4; b++) {
    h ^= (x >>> (b * 8)) & 0xff;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function makeTread(THREE, opts) { return new TreadField(THREE, opts); }

// ---------------------------------------------------------------------------
// THE SHADER.
//
// Declared #ifndef-guarded for the same reason FIELD_GLSL is: this chunk is
// concatenated after light.js's, and a duplicate declaration is a silent
// all-black material.
//
// It reads uFldCore from FIELD_GLSL, which floor.js already includes ahead of
// this. That is the point — the strength, the bias and the gain that turn a raw
// coverage into a darkening are light.js's numbers and are read, never typed.
export const TREAD_GLSL = `
#ifndef CHOP_TREAD
#define CHOP_TREAD
uniform sampler2D uTread;
uniform vec4 uTreadMap;   // 1/spanX, minX, 1/spanZ, minZ
uniform vec4 uTreadCfg;   // height range, texels per metre, strength, -

float chopTreadTop( vec2 p, float lod ) {
  vec2 uv = vec2( ( p.x - uTreadMap.y ) * uTreadMap.x,
                  ( p.y - uTreadMap.w ) * uTreadMap.z );
  return textureLod( uTread, uv, lod ).r * uTreadCfg.x;
}

// THE SAME TAP AS ../store/light.js chopTap, ON A DIFFERENT SAMPLER. Same
// sin^2(theta), same 0.55-of-radius mip match, and the same reason for the
// 0.55: the sampled footprint has to be wider than the gap between consecutive
// radii or the sum reads as discrete steps walking away from a base.
// treadSelfTest() asserts the two agree on identical input.
float chopTreadTap( vec2 p, vec2 d, float r, float base ) {
  float h = chopTreadTop( p + d * r, log2( max( 1.0, r * uTreadCfg.y * 0.55 ) ) );
  float e = max( 0.0, h - base ) / r;
  return e * e / ( 1.0 + e * e );
}

// chopCore's estimator for the floor, against the moving field.
//
// TWO THINGS ARE DELIBERATELY DIFFERENT FROM chopCore AND BOTH ARE BECAUSE THE
// CALLER IS ALWAYS THE FLOOR:
//
//   * no normal. chopCore weights each azimuth by dot( vec3(d.x,0.30,d.y)
//     *0.95783, N ); for N = (0,1,0) that is 0.2873 in every azimuth, i.e. a
//     constant that cancels in acc/wsum. Carrying it would be arithmetic that
//     does nothing and a varying this shader does not need.
//   * no self-clamp. chopCore's base = max(P.y, (hSelf-0.02)*selfW) exists so a
//     shelf deck 900 mm up inside a gondola does not take contact from its own
//     column. A floor point is never inside a shopper; the floor UNDER a cart
//     basket is in that basket's shadow and should read it. selfW is already
//     zero at y = 0.006 in chopCore for the same reason, so this is the same
//     behaviour with the dead branch removed rather than a different rule.
// The skirt's tap differs from the core's in exactly the two ways chopAO's
// does: a 15 mm bias instead of the core's 6 mm push, and a 0.50 mip match
// instead of 0.55.
float chopTreadTapSk( vec2 p, vec2 d, float r, float y ) {
  float h = chopTreadTop( p + d * r, log2( max( 1.0, r * uTreadCfg.y * 0.50 ) ) );
  float e = max( 0.0, h - y - 0.015 ) / r;
  return e * e / ( 1.0 + e * e );
}

// It returns BOTH of chopAO's terms and they are both needed, which is the one
// thing the first build of this got wrong. A tread core alone put a 7% patch
// under a shopper where the reference photograph carries 27%, because
//
//   chopA.x = skirt * ( 1 - uFldCore.x * core )
//
// and the SKIRT is the half that reaches. The core covers 0 to 0.9 m and is the
// tight contact line; the skirt runs 0.46 to 3.41 m at a 35-degree cone and is
// the broad soft pool a body standing under a ceiling of area sources actually
// casts. Building the core and not the skirt is the round-8 fault — "the right
// shape at a third of the right SIZE" — one field along.
//
// .x is the core coverage, .y the skirt's occluded fraction.
// TWO SCALES, AND THE SECOND ONE IS THE CONTACT LINE.
//
// chopCore's five radii are hand-placed on the derivative of a profile that was
// MEASURED, off reference/store_05's gondola end panel — a 2.05 m fixture. Its
// weights peak at 0.300 * uFldCore.w = 570 mm and put 56% of the term beyond
// half a metre. That is right for a 2 m wall and wrong for a shoe: every tap
// carrying weight overshoots a 90 mm occluder entirely, so what comes back is
// the wall's profile with nothing in it. Measured on the first build of this
// file, remapped core 0.5 m from a standing shopper: 0.127, against a gondola
// kickplate that saturates the same estimator.
//
// A smaller object casts the same profile at its own scale, so the term runs at
// two scales and takes the larger: uFldCore.w, which is the fixture the profile
// was measured against, and CONTACT_K of it, which is a shoe, a caster or a
// plinth. Both reaches are that one light.js constant; neither is typed.
//
// A SINGLE ADAPTIVE REACH WAS TRIED FIRST AND IS WRONG, which is worth the two
// lines because it looks obviously better: driving the reach off the tallest
// thing within 220 mm deepens the contact line to 51/255 but COLLAPSES the term
// half a metre out, where nothing is within 220 mm, the reach clamps to its
// floor and a shopper two steps away stops casting anything. The measurement
// that caught it: pixels changed at chase_a4 fell from 2204 to 829 while the
// maximum deepened. A max over two fixed scales cannot do that to itself.
const float CONTACT_K = 0.16;      // 0.16 * 1.9 = 0.30 m: foot and caster scale

vec2 chopTreadRaw( vec3 Pw ) {
  // the fan rotation is light.js's, position-derived and continuous, so the
  // two terms wobble in phase instead of beating against each other
  float rot = ( Pw.x * 1.7 + Pw.z * 2.3 ) * 2.4;
  float base = Pw.y + 0.006;
  float reach = uFldCore.w;
  float tight = uFldCore.w * CONTACT_K;
  float acc = 0.0, occ = 0.0, tot = 0.0;
  for ( int a = 0; a < 8; a ++ ) {
    float ang = rot + float( a ) * 0.7853981634;
    vec2 d = vec2( cos( ang ), sin( ang ) );
    // CORE. Radii and weights are chopCore's, hand-placed on the derivative of
    // the measured profile V(x) = 0.08 + 0.92*smoothstep(0.02,0.58,x) off
    // reference/store_05's end panel. uFldCore.w is light.js's, read live.
    acc += chopTreadTap( Pw.xz, d, 0.026 * reach, base ) * 0.0147
         + chopTreadTap( Pw.xz, d, 0.085 * reach, base ) * 0.1422
         + chopTreadTap( Pw.xz, d, 0.175 * reach, base ) * 0.2778
         + chopTreadTap( Pw.xz, d, 0.300 * reach, base ) * 0.3467
         + chopTreadTap( Pw.xz, d, 0.470 * reach, base ) * 0.2186;
    // THE SAME PROFILE AT THE CONTACT SCALE. Three radii, not five: at
    // CONTACT_K the two innermost land at 8 and 26 mm, which is inside one
    // texel of a 46.6 mm grid, so they would be reading the same texel three
    // times and calling it a profile. The three that survive carry 0.8431 of
    // the weight and are renormalised to it.
    tot += ( chopTreadTap( Pw.xz, d, 0.175 * tight, base ) * 0.2778
           + chopTreadTap( Pw.xz, d, 0.300 * tight, base ) * 0.3467
           + chopTreadTap( Pw.xz, d, 0.470 * tight, base ) * 0.2186 ) * 1.18610;
    // SKIRT. chopAO's geometric ladder off uFldSk, and a max() over radii
    // rather than a weighted sum, because the skirt asks how high the horizon
    // gets in this direction and the core asks how much of the neighbourhood is
    // covered. Same two questions, same two answers, same file.
    float r0 = uFldSk.x, k = uFldSk.y;
    float horizon = 0.0;
    for ( int s = 0; s < 4; s ++ ) {
      float rad = r0;
      horizon = max( horizon, chopTreadTapSk( Pw.xz, d, rad, Pw.y ) );
      r0 *= k;
    }
    occ += horizon;
  }
  return vec2( max( acc, tot ), occ ) * 0.125;
}

// Visibility, on the same scale chopAO returns and through the same remap, so a
// caster's shadow and a kickplate's shadow are the same kind of number.
//
// uFldCfg.z and uFldCore.x are BOTH strengths and BOTH ceilings, exactly as
// they are in chopAO: a sealed point returns 1 - strength rather than 0, which
// is the difference between a shadow and "no light was sampled here".
// chopAO's skirt denominator ( 1 - uFldCav.z * inside * ofr ) is omitted and
// that is not a simplification: "inside" is smoothstep(0.10,0.45, static column
// height over the fragment) and a floor point is never inside a shopper, so the
// branch is dead here for the same reason chopCore's self-clamp is.
//
// uTreadCfg.z is the A/B dial: 0 is a byte-exact ablation of this whole file.
// uTreadCfg.w is the gain, and it is 1.0 — see the calibration note in the
// round report before moving it.
float chopTread( vec3 Pw ) {
  if ( uTreadCfg.z < 0.0005 ) return 1.0;
  vec2 raw = chopTreadRaw( Pw );
  float core = clamp( ( raw.x - uFldCore.y ) * uFldCore.z * uTreadCfg.w, 0.0, 1.0 );
  float skirt = 1.0 - uFldCfg.z * clamp( raw.y * uTreadCfg.w, 0.0, 1.0 );
  float vis = skirt * ( 1.0 - uFldCore.x * core );
  return mix( 1.0, vis, uTreadCfg.z );
}
#endif
`;

// ---------------------------------------------------------------------------
// THE ASSERTION, AND WHAT IT IS PROVEN AGAINST.
//
// CLAUDE.md: a second copy of a derivation needs an assertion that fails loudly
// when the two disagree. The second copy here is chopTreadCore against
// light.js's chopCore, so the assertion has to compare THOSE TWO NUMBERS on
// IDENTICAL INPUT, not compare either of them to a re-derivation of itself —
// which is the vacuous form round 25's finCheck note calls out.
//
// So: stamp one identical box into the static field's live texture and into
// this one, read light.js's chopCore through its own debug channel (uFldDbg 4,
// which renders 1 - the remapped core) and chopTread through uTreadCfg.z at
// full strength, at the same declared world points, and require them equal
// within a tolerance sized for the two grids' different texel sizes.
//
// It is DRIVEN, not just written: the caller corrupts chopTreadCore by the
// margin the test claims to catch and confirms the count goes from 0 to all,
// then restores and confirms it returns to 0. See shots/_probe_r28.js.
//
// `read(mode, pts)` is supplied by the caller because rendering belongs to the
// probe, not to this file: it returns, for each world point, the shaded value
// at that pixel with uFldDbg set to `mode`.
// THE PROTOCOL. One synthetic box, two fields, one number each:
//
//   STATIC ARM   stamp the box into light.js's own baked texture, render
//                uFldDbg = 1 (which is vec3(chopA.x) and carries no mirror and
//                no albedo), divide by the same render without the box. That
//                ratio is the visibility the box contributes THROUGH chopAO.
//   MOVING ARM   stamp the identical box into this field, render normally, and
//                divide the tread-on frame by the tread-off frame. That ratio
//                is the visibility the box contributes THROUGH chopTread.
//
// Two ratios of two renders each, so the floor's albedo, its wear decal, its
// mirror and its exposure all cancel and what is left is the two estimators on
// the same geometry. They must agree.
//
// The caller supplies `env`:
//   stampStatic(x,z,r,h) -> {undo()}   write into light.js's live texture
//   render(pts)          -> [luma]     one render, read at world points
//   dbg(v)                            set uFldDbg
// and drives the CALIBRATION: corrupt the moving arm by uTreadCfg.w and confirm
// the count goes 0 -> all -> 0.
export function treadSelfTest(tread, env, pts, opts = {}) {
  const { x = 0, z = 0, r = 0.35, h = 1.20, tol = 0.06 } = opts;
  const cfg = tread.uniforms.uTreadCfg.value;
  const prevZ = cfg.z;
  const rows = [];
  // --- static arm ---
  env.dbg(1);
  const sOff = env.render(pts);
  const sBox = env.stampStatic(x, z, r, h);
  const sOn = env.render(pts);
  sBox.undo();
  env.dbg(0);
  // --- moving arm ---
  const mBox = tread.stampManual(x, z, r, h);
  cfg.z = 1; const mOn = env.render(pts);
  cfg.z = 0; const mOff = env.render(pts);
  mBox.undo();
  cfg.z = prevZ;
  for (let i = 0; i < pts.length; i++) {
    const a = (sOff[i] && sOn[i] != null) ? sOn[i] / sOff[i] : null;
    const b = (mOff[i] && mOn[i] != null) ? mOn[i] / mOff[i] : null;
    if (a == null || b == null || !isFinite(a) || !isFinite(b)) {
      rows.push({ i, ok: false, why: 'offscreen or black' }); continue;
    }
    rows.push({ i, staticVis: +a.toFixed(4), treadVis: +b.toFixed(4),
      d: +(b - a).toFixed(4), ok: Math.abs(b - a) <= tol });
  }
  const bad = rows.filter((rr) => !rr.ok);
  return { n: rows.length, disagreements: bad.length, tol, box: { x, z, r, h }, rows, pass: bad.length === 0 };
}

// COVERAGE, the other half. The estimator being right is worth nothing if the
// occluder set is empty, and an empty set is exactly what a scan that silently
// stopped matching would produce. States its denominator.
// The subject is GROUND CONTACTS, and it is deliberately a different question
// from the one scan() asks. scan() takes every part of a body that stands over
// the floor; this counts the parts that TOUCH it — shoes, casters, plinths —
// because that is the set the critic named, and reports how many of them the
// moving field now darkens. States its denominator.
export function treadCoverage(tread, scene, staticTop, THREE) {
  const bb = new THREE.Box3();
  const m4 = new THREE.Matrix4(), im = new THREE.Matrix4();
  let touching = 0, inStatic = 0, room = 0, covered = 0;
  const missed = [];
  const have = new Map();
  for (const it of tread.items) have.set(it.obj.uuid + '#' + (it.inst == null ? '-' : it.inst), it);
  const one = (o, lb, mat, inst) => {
    bb.copy(lb).applyMatrix4(mat);
    if (!isFinite(bb.min.y) || bb.min.y > 0.06 || bb.max.y < MIN_TOP) return;
    touching++;
    const foot = (bb.max.x - bb.min.x) * (bb.max.z - bb.min.z);
    if (foot > MAX_FOOT) { room++; return; }
    const cx = (bb.min.x + bb.max.x) * 0.5, cz = (bb.min.z + bb.max.z) * 0.5;
    if (staticTop(cx, cz) > STATIC_H) { inStatic++; return; }
    // does the moving field actually stand over this contact?
    if (tread.topAt(cx, cz) > 0.02) covered++;
    else missed.push({ name: o.name || '(unnamed)', inst, top: +bb.max.y.toFixed(3), x: +cx.toFixed(2), z: +cz.toFixed(2) });
  };
  scene.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isPoints) return;
    if (!o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const lb = o.geometry.boundingBox; if (!lb) return;
    if (o.isInstancedMesh && o.instanceMatrix) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, im); m4.multiplyMatrices(o.matrixWorld, im);
        one(o, lb, m4, i);
      }
      return;
    }
    one(o, lb, o.matrixWorld, null);
  });
  return { groundContacts: touching, room, alreadyStatic: inStatic,
    eligible: covered + missed.length, darkened: covered, missed: missed.length,
    missedRows: missed.slice(0, 12) };
}
