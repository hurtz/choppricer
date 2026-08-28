// OWNER: builder-mirror. THE COLOUR OF THE MOVING HALF, FOR THE ONE SURFACE
// THAT MIRRORS ANYTHING. ROUND 30.
//
// WHY THIS FILE EXISTS, in round 28's own words, from its "what I did not fix":
//
//   "THE REFLECTION. A shopper standing on a burnished floor still has no
//    mirror image, because the floor's reflected march reads light.js's field
//    and this field carries no colour. Occlusion only, this round, on purpose:
//    one dial."
//
// ../store/tread.js is that field. It is a per-frame HEIGHT over the store
// footprint and it already knows where every shopper, cart, child, the cop and
// the thief are standing — 353 items on this build, collected by construction
// off properties of the object rather than off a list. What it does not know is
// what colour any of them is.
//
// ===========================================================================
// WHY THE COLOUR IS NOT ADDED TO tread.js, WHICH IS THE OBVIOUS PLACE
//
// Two reasons, and the second is the one that matters.
//
// 1. tread's texture is a single-channel R8 read by an occlusion estimator that
//    is a copy of light.js's chopCore, held honest by treadSelfTest(). Widening
//    it to RGBA triples a per-frame upload for a consumer (the shadow) that can
//    never use three of the four channels.
//
// 2. A HEIGHT FIELD AND A COLOUR FIELD WANT OPPOSITE MIP BEHAVIOUR, and getting
//    that wrong is the whole reason this round exists. See below.
//
// So: tread.js keeps sole ownership of "how tall is the moving thing standing
// here", this file owns "what colour is it, at what height", and the floor's
// march asks each of them exactly one question. There is no second scene walk
// and no second collection rule — `sync()` reads tread's OWN item list and its
// OWN worldOf(), so an object this field can see is by construction an object
// tread can see, and the two cannot drift about which half of the world an
// object belongs to.
//
// ===========================================================================
// PREMULTIPLIED, IN LINEAR, AND THAT IS THE ROUND'S ACTUAL MECHANISM
//
// light.js's Field stores the colour of what stands in a cell in RGB and the
// height in A, NOT premultiplied, and — measured on the live artefact —
// 3,104,010 of its empty cells carry (189, 179, 160): the FLOOR's own beige,
// not black. That is harmless when you read the base mip. The floor's mirror
// does not read the base mip: the reflection lobe widens along the ray, so it
// reads a mip whose footprint at the far end of a chase pose is 2.22 m across.
//
// A mip of a non-premultiplied field is the average of the colours in the
// footprint, INCLUDING every empty cell's beige, with no weight for how much of
// the footprint is actually occupied. Measured down aisle 1 at the only sample
// on that ray that hits anything, footprint 2.22 m: the field returns
// (181, 183, 174) — saturation 8 of 255, off a store whose occupied cells
// average 38 and whose displays run to 251. The mirror was not weak. It was
// reading beige.
//
// So this field stores rgb * coverage in RGB and coverage in A, in LINEAR
// bytes, and the shader divides. Then a mip is a coverage-weighted average of
// the colours that are actually there, and a shopper alone in a 2 m footprint
// arrives at full saturation and low alpha — which is exactly right, because
// what falls off with an empty neighbourhood is how MUCH of the lobe they fill,
// not what colour they are.
//
// Linear rather than sRGB for the same reason: glGenerateMipmap on an sRGB
// texture averages the ENCODED values on most desktop drivers, so a
// premultiplied sRGB field would unpremultiply against an alpha that was
// averaged in a different space than its own RGB. 8-bit linear is coarse in the
// darks — a navy shirt at 0.02 linear quantises to 5 — and that is acceptable
// for a term that reaches the frame at about a fifth of its own size.
//
// ===========================================================================
// EXPORT CONTRACT
//   makeMirror(THREE, { minX, minZ, spanX, spanZ, N? })  -> MirrorField
//   MirrorField#uniforms   uMirLo, uMirHi, uMirMap, uMirCfg
//   MirrorField#sync(tread)      rebuild from tread's item list. Returns true
//                                if it rastered.
//   MirrorField#colourAt(x,z,y)  the field's own answer, read back off the
//                                bytes the GPU is bound to, for probes.
//   MirrorField#stats()
//   MIRROR_GLSL                  chopMirCol(p, y, lod), chopMirFill(p, lod)
//   mirrorSelfTest(mirror, env)  see the note at the bottom.

// ---------------------------------------------------------------------------
// THE GRID, IN WORLD MILLIMETRES, BECAUSE THIS FILE'S NEIGHBOURS HAVE BEEN
// BITTEN BY TEXTURE-SPACE CONSTANTS FOUR ROUNDS RUNNING.
//
// MIR_N 256 over 47.7 x 38.0 m is 186 x 148 mm per texel. The consumer is a
// reflection whose vertical softness starts at 300 mm (floor.js uFldRefl.y) and
// whose horizontal footprint at the first march sample that can hit anything is
// already 60 mm and grows from there, so a texel finer than about 150 mm buys
// detail below the blur width of the only term that reads it — the same
// argument tread.js makes for 1024 against a shadow, arriving at a different
// number because the blur is an order of magnitude wider.
// A shopper is 3 texels across at this pitch and a cart is 3 x 6.
export const MIR_N = 256;

// THE BAND SPLIT IS light.js's, NOT A NEW ONE. chopFldCol blends its low and
// high bands over smoothstep(1.00, 1.70, y). A mirror that showed a shopper's
// torso at a different height than it shows an endcap's promo header would be
// two mirrors. These two numbers are the same two numbers, carried as a uniform
// so a probe can read what the shader is actually using.
export const MIR_BAND = [1.00, 1.70];
// The high band's own extent, for the raster's overlap weighting. Low band is
// floor to LO_TOP; high band is LO_TOP to tread's own ceiling.
const LO_TOP = 1.00;
const HI_TOP = 2.20;      // == tread.js TREAD_H; nothing that walks is taller

export class MirrorField {
  constructor(THREE, opts) {
    const { minX, minZ, spanX, spanZ } = opts;
    this.THREE = THREE;
    this.N = opts.N ?? MIR_N;
    this.minX = minX; this.minZ = minZ; this.spanX = spanX; this.spanZ = spanZ;
    this.kx = this.N / spanX; this.kz = this.N / spanZ;

    const N = this.N;
    this.lo = new Uint8Array(N * N * 4);
    this.hi = new Uint8Array(N * N * 4);
    // float accumulators, allocated once: sum(col * w) and sum(w)
    this.accLo = new Float32Array(N * N * 4);
    this.accHi = new Float32Array(N * N * 4);

    const mk = (data) => {
      const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
      t.type = THREE.UnsignedByteType;
      t.colorSpace = THREE.NoColorSpace;        // see the header: premultiplied linear
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.unpackAlignment = 1;
      t.needsUpdate = true;
      return t;
    };
    this.texLo = mk(this.lo);
    this.texHi = mk(this.hi);

    this.uniforms = {
      uMirLo: { value: this.texLo },
      uMirHi: { value: this.texHi },
      uMirMap: { value: new THREE.Vector4(1 / spanX, minX, 1 / spanZ, minZ) },
      // x texels per metre, y band lo, z band hi, w the A/B dial (0 = this
      // field contributes nothing, byte-exact, one uniform, no geometry).
      uMirCfg: { value: new THREE.Vector4(N / spanX, MIR_BAND[0], MIR_BAND[1], 1.0) },
    };

    this.colCache = new Map();
    this.rasterN = 0; this.texels = 0; this.rebuilt = 0; this.lastRaster = 0;
    this.lastSync = 0; this.skipped = 0;
    this._bb = new THREE.Box3();
    this._c = new THREE.Color();
  }

  // -------------------------------------------------------------------------
  // ONE OBJECT'S COLOUR, cached by geometry+material, in LINEAR 0..1.
  //
  // Read off the material and the geometry rather than off a name or a list:
  // material.color is three's working-space (linear) colour, and where a mesh
  // is drawn with vertexColors the pigment is in the attribute and the material
  // colour is a white multiplier — 51 of this build's 353 movers are exactly
  // that, so taking material.color alone would paint a third of the store's
  // shoppers white.
  colourOf(obj) {
    const key = (obj.geometry ? obj.geometry.uuid : 'g') + '|'
      + (obj.material ? obj.material.uuid : 'm');
    let c = this.colCache.get(key);
    if (c) return c;
    const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    let r = 0.5, g = 0.5, b = 0.5;
    if (m && m.color) { r = m.color.r; g = m.color.g; b = m.color.b; }
    const at = obj.geometry && obj.geometry.attributes && obj.geometry.attributes.color;
    if (m && m.vertexColors && at && at.count) {
      let sr = 0, sg = 0, sb = 0;
      // stride the attribute: a body part is a few hundred vertices of two or
      // three flat colours, and the mean of 64 of them is the mean of all of
      // them to well inside a quantisation step.
      const step = Math.max(1, Math.floor(at.count / 64));
      let n = 0;
      for (let i = 0; i < at.count; i += step) {
        sr += at.getX(i); sg += at.getY(i); sb += at.getZ(i); n++;
      }
      r *= sr / n; g *= sg / n; b *= sb / n;
    }
    c = [r, g, b];
    this.colCache.set(key, c);
    return c;
  }

  // -------------------------------------------------------------------------
  // REBUILD, off tread's item list. `tread` is the TreadField the floor already
  // owns; nothing here traverses the scene.
  //
  // THE DIRTY CHECK IS TREAD'S, NOT A SECOND ONE. tread.tick() returns true iff
  // its own FNV over the occluders' world translations changed, i.e. iff
  // something moved. Two hashes over the same 353 translations that could
  // disagree is the shape of bug this project's brief spends a page on.
  sync(tread, moved) {
    this.lastSync++;
    if (this.frozen) return false;
    if (moved === false && this.rebuilt > 0) { this.skipped++; return false; }
    this.raster(tread);
    return true;
  }

  raster(tread) {
    const t0 = (typeof performance !== 'undefined') ? performance.now() : 0;
    const N = this.N, bb = this._bb;
    const aL = this.accLo, aH = this.accHi;
    aL.fill(0); aH.fill(0);
    let n = 0;
    for (const it of tread.items) {
      bb.copy(it.local).applyMatrix4(tread.worldOf(it));
      if (!isFinite(bb.min.y) || bb.max.y <= 0.012) continue;
      const y0 = Math.max(0, bb.min.y), y1 = Math.min(HI_TOP, bb.max.y);
      if (y1 <= y0) continue;
      // how much of each band this object's own vertical extent covers
      const wLo = Math.max(0, Math.min(y1, LO_TOP) - Math.min(y0, LO_TOP)) / LO_TOP;
      const wHi = Math.max(0, y1 - Math.max(y0, LO_TOP)) / (HI_TOP - LO_TOP);
      if (wLo <= 0 && wHi <= 0) continue;
      const c = this.colourOf(it.obj);
      const ax = (bb.min.x - this.minX) * this.kx, bx = (bb.max.x - this.minX) * this.kx;
      const az = (bb.min.z - this.minZ) * this.kz, bz = (bb.max.z - this.minZ) * this.kz;
      let i0 = Math.floor(ax), i1 = Math.ceil(bx);
      let j0 = Math.floor(az), j1 = Math.ceil(bz);
      if (i1 <= 0 || j1 <= 0 || i0 >= N || j0 >= N) continue;
      if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0;
      if (i1 > N) i1 = N; if (j1 > N) j1 = N;
      if (i1 === i0) i1 = i0 + 1;
      if (j1 === j0) j1 = j0 + 1;
      for (let j = j0; j < j1; j++) {
        const covZ = Math.min(1, Math.min(bz, j + 1) - Math.max(az, j));
        if (covZ <= 0) continue;
        const row = j * N;
        for (let i = i0; i < i1; i++) {
          const covX = Math.min(1, Math.min(bx, i + 1) - Math.max(ax, i));
          if (covX <= 0) continue;
          const cov = covX * covZ, k = (row + i) * 4;
          if (wLo > 0) {
            const w = cov * wLo;
            aL[k] += c[0] * w; aL[k + 1] += c[1] * w; aL[k + 2] += c[2] * w; aL[k + 3] += w;
          }
          if (wHi > 0) {
            const w = cov * wHi;
            aH[k] += c[0] * w; aH[k + 1] += c[1] * w; aH[k + 2] += c[2] * w; aH[k + 3] += w;
          }
        }
      }
      n++;
    }
    this.texels = this.pack(aL, this.lo) + this.pack(aH, this.hi);
    this.texLo.needsUpdate = true;
    this.texHi.needsUpdate = true;
    this.rasterN = n; this.rebuilt++;
    this.lastRaster = ((typeof performance !== 'undefined') ? performance.now() : 0) - t0;
  }

  // acc -> premultiplied bytes. Where the accumulated weight exceeds one texel
  // (two shoppers in one 186 mm cell) BOTH the colour sum and the weight are
  // divided by it, so rgb/a is still the weighted mean colour and a still means
  // "how full is this texel".
  pack(acc, out) {
    let touched = 0;
    for (let k = 0; k < out.length; k += 4) {
      const w = acc[k + 3];
      if (w <= 0) { out[k] = out[k + 1] = out[k + 2] = out[k + 3] = 0; continue; }
      const s = 1 / Math.max(1, w);
      const a = Math.min(1, w);
      out[k] = Math.min(255, Math.round(acc[k] * s * 255));
      out[k + 1] = Math.min(255, Math.round(acc[k + 1] * s * 255));
      out[k + 2] = Math.min(255, Math.round(acc[k + 2] * s * 255));
      out[k + 3] = Math.round(a * 255);
      touched++;
    }
    return touched;
  }

  // -------------------------------------------------------------------------
  // READBACK, off the bytes the GPU is bound to and not off the accumulator, so
  // a probe asks the artefact. Returns { rgb (linear, unpremultiplied), fill }.
  colourAt(x, z, y) {
    const u = (x - this.minX) * this.kx, v = (z - this.minZ) * this.kz;
    if (u < 0 || v < 0 || u >= this.N || v >= this.N) return { rgb: [0, 0, 0], fill: 0 };
    const k = ((Math.floor(v) * this.N) + Math.floor(u)) * 4;
    const band = (d) => {
      const a = d[k + 3] / 255;
      return a > 0 ? { rgb: [d[k] / 255 / a, d[k + 1] / 255 / a, d[k + 2] / 255 / a], fill: a }
        : { rgb: [0, 0, 0], fill: 0 };
    };
    const lo = band(this.lo), hi = band(this.hi);
    if (y == null) return { lo, hi };
    const t = Math.max(0, Math.min(1, (y - MIR_BAND[0]) / (MIR_BAND[1] - MIR_BAND[0])));
    const s = t * t * (3 - 2 * t) * hi.fill;
    return {
      rgb: [lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * s,
        lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * s,
        lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * s],
      fill: Math.max(lo.fill, hi.fill),
    };
  }

  // A block written straight into the live textures, outside the raster path,
  // for the self-test. Returns an undo that restores byte-identically.
  stampManual(x, z, r, rgb, fill) {
    const N = this.N, saved = [];
    const a = Math.round(Math.max(0, Math.min(1, fill)) * 255);
    const px = [Math.round(rgb[0] * fill * 255), Math.round(rgb[1] * fill * 255),
      Math.round(rgb[2] * fill * 255)];
    const i0 = Math.max(0, Math.floor((x - r - this.minX) * this.kx));
    const i1 = Math.min(N, Math.ceil((x + r - this.minX) * this.kx));
    const j0 = Math.max(0, Math.floor((z - r - this.minZ) * this.kz));
    const j1 = Math.min(N, Math.ceil((z + r - this.minZ) * this.kz));
    for (let j = j0; j < j1; j++) {
      const wz = this.minZ + (j + 0.5) / this.kz;
      for (let i = i0; i < i1; i++) {
        const wx = this.minX + (i + 0.5) / this.kx;
        if ((wx - x) ** 2 + (wz - z) ** 2 > r * r) continue;
        const k = (j * N + i) * 4;
        for (const d of [this.lo, this.hi]) {
          saved.push(d, k, d[k], d[k + 1], d[k + 2], d[k + 3]);
          d[k] = px[0]; d[k + 1] = px[1]; d[k + 2] = px[2]; d[k + 3] = a;
        }
      }
    }
    this.texLo.needsUpdate = true; this.texHi.needsUpdate = true;
    this.frozen = true;
    const self = this;
    return {
      texels: saved.length / 6,
      undo() {
        for (let q = 0; q < saved.length; q += 6) {
          const d = saved[q], k = saved[q + 1];
          d[k] = saved[q + 2]; d[k + 1] = saved[q + 3];
          d[k + 2] = saved[q + 4]; d[k + 3] = saved[q + 5];
        }
        self.texLo.needsUpdate = true; self.texHi.needsUpdate = true;
        self.frozen = false;
      },
    };
  }

  stats() {
    let filled = 0, sumSat = 0;
    for (let k = 0; k < this.lo.length; k += 4) {
      const a = this.lo[k + 3]; if (!a) continue;
      filled++;
      const r = this.lo[k] / a, g = this.lo[k + 1] / a, b = this.lo[k + 2] / a;
      sumSat += Math.max(r, g, b) - Math.min(r, g, b);
    }
    return {
      grid: this.N,
      mmPerTexelX: +(this.spanX / this.N * 1000).toFixed(1),
      mmPerTexelZ: +(this.spanZ / this.N * 1000).toFixed(1),
      itemsStamped: this.rasterN, texelsWritten: this.texels,
      loFilled: filled, loMeanSat255: +(sumSat / Math.max(1, filled) * 255).toFixed(1),
      rebuilt: this.rebuilt, skippedSyncs: this.skipped,
      lastRasterMs: +this.lastRaster.toFixed(3),
      uploadKB: +(this.N * this.N * 4 * 2 / 1024).toFixed(0),
      cachedColours: this.colCache.size,
    };
  }
}

export function makeMirror(THREE, opts) { return new MirrorField(THREE, opts); }

// ---------------------------------------------------------------------------
// THE SHADER.
//
// #ifndef-guarded for the same reason FIELD_GLSL and TREAD_GLSL are: this chunk
// is concatenated after both, and a duplicate declaration is a silent all-black
// material.
//
// chopMirCol UNPREMULTIPLIES. That single divide is the whole difference
// between this and light.js's field under a wide mip, and it is why the header
// spends a paragraph on it.
export const MIRROR_GLSL = `
#ifndef CHOP_MIRROR
#define CHOP_MIRROR
uniform sampler2D uMirLo, uMirHi;
uniform vec4 uMirMap;    // 1/spanX, minX, 1/spanZ, minZ
uniform vec4 uMirCfg;    // texels per metre, band lo, band hi, dial

vec2 chopMirUV( vec2 p ) {
  return vec2( ( p.x - uMirMap.y ) * uMirMap.x, ( p.y - uMirMap.w ) * uMirMap.z );
}

// How much of this footprint is filled by something that moves. Reads the LOW
// band, which is the one every floor point close enough to matter can see.
float chopMirFill( vec2 p, float lod ) {
  vec2 uv = chopMirUV( p );
  return max( textureLod( uMirLo, uv, lod ).a, textureLod( uMirHi, uv, lod ).a );
}

// The colour of what moves at p, AS SEEN AT HEIGHT y. Two bands blended over
// uMirCfg.yz, which are light.js chopFldCol's own 1.00 / 1.70 -- see the header.
// Returned in LINEAR, unpremultiplied, and zero where nothing stands.
// ...AND THE FILL COMES BACK WITH IT, IN .a, BECAUSE UNPREMULTIPLYING WITHOUT
// RETURNING THE COVERAGE IS HALF A FIX AND THE HALF THAT BLOWS UP.
//
// light.js's field gets its coverage for free and by accident: it is not
// premultiplied, so a mip of a shopper alone in a 2 m footprint returns mostly
// the floor's beige, and the reflection is weak because the COLOUR was diluted.
// Premultiplying removes that dilution — correctly, the colour of a body is the
// colour of a body however much of the lobe it fills — and therefore removes
// the only thing that was scaling the term down. Measured: a 0.7 m body four
// metres in front of the chase_a4 camera took 58,000 floor pixels to pure white
// and held them there whatever colour it was painted.
//
// So the caller multiplies its occlusion by .a. That is the physically right
// split and it is the one the whole file is arguing for: coverage decides HOW
// MUCH of the lobe the object fills, and the unpremultiplied rgb decides what
// colour that part of it is. Neither question is allowed to answer the other.
vec4 chopMirColF( vec2 p, float y, float lod ) {
  vec2 uv = chopMirUV( p );
  vec4 lo = textureLod( uMirLo, uv, lod );
  vec4 hi = textureLod( uMirHi, uv, lod );
  // UNPREMULTIPLY, AND CLAMP, AND THE CLAMP IS NOT DEFENSIVE PROGRAMMING.
  // What comes back is an ALBEDO and an albedo cannot exceed 1. The divide can:
  // 8-bit rgb and 8-bit alpha are quantised independently, so a texel whose
  // true alpha is 0.002 stores a = 1 and rgb = 1 and the ratio is 255. That is
  // not a bright object, it is a rounding step, and the floor's own composite
  // multiplies it by uFldGain 3.05 and hands it to an 8-bit framebuffer — which
  // is exactly what turned the floor pure white under a stamped body during
  // this round's self-test, at pcol reading 0 in the debug channel because the
  // debug encode of a number that large is not the number.
  vec3 cl = min( lo.rgb / max( lo.a, 1.0 / 255.0 ), vec3( 1.0 ) );
  vec3 ch = min( hi.rgb / max( hi.a, 1.0 / 255.0 ), vec3( 1.0 ) );
  float k = smoothstep( uMirCfg.y, uMirCfg.z, y ) * hi.a;
  return vec4( mix( cl, ch, k ), mix( lo.a, hi.a, k ) );
}
vec3 chopMirCol( vec2 p, float y, float lod ) { return chopMirColF( p, y, lod ).rgb; }
#endif
`;

// ---------------------------------------------------------------------------
// THE SELF-TEST, CALIBRATED TO THE DEFECT IT REPLACES.
//
// The defect this round exists to remove is not "no reflection" — the march has
// reflected light.js's field since round 8 — it is a reflection whose COLOUR
// arrives desaturated. So an injection at an arbitrary magnitude would prove
// nothing. The number this stamps is the one measured on the shipped r29 build:
// the only sample on the aisle-1 ray that hit anything came back at
// SATURATION 8 of 255 through a 2.22 m footprint, off a store whose occupied
// field cells average 38 and whose displays reach 251.
//
// So it stamps a fully saturated primary at a fill that a single shopper
// actually produces in a 186 mm grid, renders, and requires that the floor's
// own chroma moves by more than the r29 build's whole-floor p99. It reports
// rather than throws: a control has to stay loadable, which is leak 8's lesson
// applied two rounds later.
//
// IT TAKES THE TREAD FIELD TOO, AND ITS FIRST VERSION DID NOT — recorded rather
// than quietly fixed, because the failure is the design working. Stamping a
// saturated primary into the colour field alone moved 0 of 174,166 floor pixels
// at three positions in front of the chase_a4 camera. That is the RIGHT answer:
// tread.js owns "is anything standing here" and this file owns "what colour is
// it", so a colour with no height is a colour nobody is looking at. An object
// is both, and the test has to stamp both.
//
//   env.render()   -> render one frame at the probe pose and return RGBA bytes
//   env.mask       -> Uint8Array, 1 where the floor is the nearest surface
//   env.lab(r,g,b) -> CIELAB
export function mirrorSelfTest(mirror, tread, env, opt = {}) {
  const at = opt.at || [0, 0];
  const r = opt.r ?? 0.35;                    // a shopper's own footprint radius
  const fill = opt.fill ?? 0.55;              // what one body fills of a 186 mm texel
  const rgb = opt.rgb || [0.80, 0.02, 0.02];  // saturated primary, linear
  const need = opt.need ?? 6.0;               // r29's whole-floor p99 chroma delta
  // THE CONTROL IS A GREY OF THE SAME LUMINANCE, NOT AN ABSENT OBJECT. Stamping
  // an object where there was none also switches on round 28's contact shadow,
  // and a darker floor has a slightly different chroma — the first version of
  // this scored 58,372 "moved" pixels for one 0.7 m body, which is a third of
  // the visible floor and is the SHADOW being counted. Both arms here carry the
  // identical occluder at the identical height with the identical reflected
  // luminance; the only thing that differs between them is hue.
  const lum = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  const grey = [lum, lum, lum];
  const chroma = (a, b) => {
    let n = 0, sum = 0, mx = 0;
    for (let i = 0; i < env.mask.length; i++) {
      if (!env.mask[i]) continue;
      const A = env.lab(a[i * 4], a[i * 4 + 1], a[i * 4 + 2]);
      const B = env.lab(b[i * 4], b[i * 4 + 1], b[i * 4 + 2]);
      const d = Math.hypot(A[1] - B[1], A[2] - B[2]);
      if (d > 0) { n++; sum += d; if (d > mx) mx = d; }
    }
    return { px: n, mean: +(sum / Math.max(1, n)).toFixed(3), max: +mx.toFixed(2) };
  };
  const clean = env.render();
  const sh = tread.stampManual(at[0], at[1], r, opt.h ?? 1.70);   // a shopper
  const g0 = mirror.stampManual(at[0], at[1], r, grey, fill);
  const base = env.render();
  g0.undo();
  const st = mirror.stampManual(at[0], at[1], r, rgb, fill);
  const hot = env.render();
  const on = chroma(base, hot);
  st.undo(); sh.undo();
  const back = env.render();
  let diff = 0;
  for (let i = 0; i < clean.length; i++) if (clean[i] !== back[i]) diff++;
  return {
    stampedTexels: st.texels, treadTexels: sh.texels, at, r, fill, rgb,
    chromaMovedPx: on.px, chromaMean: on.mean, chromaMax: on.max,
    threshold: need, pass: on.max >= need,
    restoreByteIdentical: diff === 0, restoreDiffBytes: diff,
  };
}
