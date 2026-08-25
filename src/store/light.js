// OWNER: builder-store. THE WORLD LIGHT FIELD. ROUND 8.
//
// WHY THIS FILE EXISTS — and it is the only thing in this round that matters.
//
// Rounds 3-7 fixed light transport by AUTHORING it. Round 3 drew a multiply
// card across the mouth of every shelf cavity. Round 6 drew a contact ramp at
// every base I could think of and a radial pool under every fixture I could
// think of. Round 7 gave the freezer pane a fresnel curve and a white veil.
// Every one of those was correct where it was placed, and blind test 7 still
// called all four frames in one to two seconds on "nothing in this store
// touches the ground", because:
//
//   an authored occlusion card exists only at the junctions its author
//   remembered. The junction nobody thought of stays at full brightness on
//   BOTH sides, and a frame contains hundreds of junctions.
//
// So the round-8 change is not another card. It is a data structure that every
// junction is in whether or not anyone thought about it:
//
//   ONE top-down field over the whole store footprint, 1024x1024, holding per
//   47 mm column (a) how tall the tallest thing standing there is and (b) what
//   colour it is in the band a floor reflection would see.
//
// It is populated BY CONSTRUCTION: kit.js's Batch.push and store.js's solid()
// are the two funnels every solid in the building already goes through, and
// both now stamp. Nothing has to be remembered. A prop added in round 9 with no
// knowledge of this file is in the field the moment it is pushed.
//
// Two consumers read it and they cannot disagree, because it is one texture:
//
//   AO   — chopAO() walks a golden-angle spiral of 8 taps around the shading
//          point, reads the horizon height in each direction, and converts it
//          to sky occlusion as sin^2(theta) — the analytic cosine-weighted
//          visibility of a hemisphere cut by a horizon at elevation theta. It
//          is injected into EVERY opaque material in the store by walking the
//          tree, so a material nobody thought about gets it too. That single
//          function is barrel-to-pad, pad-to-floor, kick-to-floor,
//          bollard-to-floor and product-to-deck simultaneously, because all
//          five are the same query.
//
//   MIRROR — the floor's and the glass's reflected ray march the same field
//          instead of the round-7 256 px hand-placed prop list, so what a
//          floor reflects is what is standing on it.
//
// The same taps also return a BOUNCE term: the fraction of the LOWER
// hemisphere that is open floor, distance-weighted. That is what lifts the
// bottom shelf out of the pure-black void the blind test measured — a shelf
// 250 mm off a lit floor is not unlit, it is lit from below, and "no light was
// sampled here" is exactly the bug an occlusion-only model has.
//
// CONTRACT
//   makeField(THREE, minX, minZ, spanX, spanZ, N) -> Field
//   field.box(x,z,w,l,y0,y1,r,g,b,round) -> stamp one solid; `round` means the
//                                   footprint is an ELLIPSE, not the AABB
//   field.boxHex(x,z,w,l,y0,y1,hex,round) -> the same, in sRGB swatches
//   field.finish(THREE)          -> the height/low-colour texture; also fills
//                                   field.hiTex, the high colour band
//   fieldUniforms(THREE, field, opts) -> the uniform bag both mirrors and the
//                                   AO patch share
//   applyAO(THREE, root, U)      -> patch every opaque material under root
//   FIELD_GLSL                   -> the shared sampler, chopFldCol(), chopAO()
//   promoDeal(seed)              -> one deal drawn from the promo grammar

import { makeRng } from './kit.js';

// Heights above this saturate. A gondola is 2.05 m, a pallet stack 2.4, a
// promo header 2.6; nothing that matters for ground occlusion is taller, and
// capping keeps the whole range in one byte at 13 mm resolution.
export const FIELD_H = 3.40;
// TWO COLOUR BANDS, ROUND 9. Round 8 stored ONE averaged colour per column,
// over 0.04-1.45 m, and that single decision is most of why blind test 8 said
// "twelve reach-in dairy doors in a row, and not one carries a mirrored image
// of the aisle". A mirror is an image and an image needs vertical structure: a
// pane at chest height looking across an aisle sees a gondola's dark kick, its
// bright mid decks and its promo header as three different things. Averaged
// into one number they are one flat vertical stripe of mud, which is exactly
// what the glass was painting — and it is why "objects contribute nothing"
// while the ceiling strips, which are computed analytically and NOT from this
// field, kept their contrast.
//
// So the column now carries a LOW band and a HIGH band, and the two mirrors
// blend between them at the height their ray actually passes through.
const REFL_LO = 0.04, REFL_MID = 1.30, REFL_HI = 2.70;

export class Field {
  // N is the HEIGHT resolution. Round 9 doubles it to 2048 over a 47.7 m room
  // = 23 mm/texel, and the reason is the contact core below: a two-to-five
  // pixel dark line at the distance a kickplate is photographed from is 25-60
  // mm of floor, so a 47 mm texel could not resolve one however the shader
  // asked. Colour rides at N/2 — a reflection is blurred by its own lobe long
  // before it is texel-limited, and two full-resolution colour bands is 45 MB.
  constructor(minX, minZ, spanX, spanZ, N = 2048) {
    this.N = N;
    this.minX = minX; this.minZ = minZ; this.spanX = spanX; this.spanZ = spanZ;
    this.kx = N / spanX; this.kz = N / spanZ;
    this.top = new Float32Array(N * N);
    const M = N >> 1;
    this.M = M; this.mx = M / spanX; this.mz = M / spanZ;
    this.cr = new Float32Array(M * M);
    this.cg = new Float32Array(M * M);
    this.cb = new Float32Array(M * M);
    this.cw = new Float32Array(M * M);
    this.hr = new Float32Array(M * M);
    this.hg = new Float32Array(M * M);
    this.hb = new Float32Array(M * M);
    this.hw = new Float32Array(M * M);
    this.n = 0;
  }

  // One axis-aligned solid. w/l are FULL extents about (x,z); y0..y1 vertical.
  // r/g/b are LINEAR (three's working space) — everything upstream of here is
  // a THREE.Color, and averaging colour in linear and encoding once at the end
  // is the only order that does not lighten every blend. Pass r < 0 for
  // something that occludes but has no useful colour, e.g. a bare wall volume.
  // `round` marks a solid whose footprint is an ELLIPSE, not a rectangle. It is
  // the structural half of the round-9 shadow deletion. The red barrel's placed
  // black slab is gone, but deleting it only helps if what replaces it is the
  // right shape: this field is what the AO reads, and a cylinder stamped as its
  // bounding square casts a SQUARE computed shadow — i.e. it re-creates by
  // arithmetic exactly the hard-edged rectangle under a cylindrical silhouette
  // that the blind test called out. Every cylinder, tube and sphere batch in
  // kit.js now sets it, so this is a property of the primitive rather than of
  // the call site, and a barrel added in round 12 gets it without being told.
  //
  // Edge texels take PARTIAL height by analytic coverage, so the ellipse is
  // antialiased into the field rather than staircased: a boundary texel reports
  // a fraction of the solid's height and the shader's own softness does the
  // rest. That is also what stops a 60 mm can from vanishing between texels.
  box(x, z, w, l, y0, y1, r, g, b, round) {
    if (y1 <= 0.012) return;                  // a floor decal is not an occluder
    // Anything whose UNDERSIDE is already near the ceiling hangs from it: a
    // troffer, a sprinkler main, a dome camera, an aisle sign on two cables.
    // A height field is a model of what STANDS on the floor, so a hanging sign
    // stamped into it would black out the aisle underneath as if it were a
    // pillar. One rule, applied at the sink, covers every ceiling prop anyone
    // ever adds — which is the whole point of doing this at the funnel.
    if (y0 > 2.90) return;
    const N = this.N;
    let i0 = Math.floor((x - w / 2 - this.minX) * this.kx);
    let i1 = Math.ceil((x + w / 2 - this.minX) * this.kx);
    let j0 = Math.floor((z - l / 2 - this.minZ) * this.kz);
    let j1 = Math.ceil((z + l / 2 - this.minZ) * this.kz);
    if (i1 <= 0 || j1 <= 0 || i0 >= N || j0 >= N) return;
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0;
    if (i1 > N) i1 = N; if (j1 > N) j1 = N;
    if (i1 === i0) i1 = i0 + 1;
    if (j1 === j0) j1 = j0 + 1;
    const h = Math.min(y1, FIELD_H);
    // colour weight = how much of each reflected band this solid occupies
    let cwL = Math.max(0, Math.min(y1, REFL_MID) - Math.max(y0, REFL_LO));
    let cwH = Math.max(0, Math.min(y1, REFL_HI) - Math.max(y0, REFL_MID));
    if (!(r >= 0)) { cwL = 0; cwH = 0; }
    const top = this.top;
    // ellipse setup: centre and inverse radii in texel space, plus how many
    // texels one unit of the normalised radius spans (for the coverage ramp)
    const ci = (x - this.minX) * this.kx, cj = (z - this.minZ) * this.kz;
    const ri = Math.max(1e-4, w / 2 * this.kx), rj = Math.max(1e-4, l / 2 * this.kz);
    const featherK = Math.min(ri, rj);
    for (let j = j0; j < j1; j++) {
      const row = j * N;
      const dj = round ? (j + 0.5 - cj) / rj : 0;
      for (let i = i0; i < i1; i++) {
        let cov = 1;
        if (round) {
          const di = (i + 0.5 - ci) / ri;
          const t = Math.sqrt(di * di + dj * dj);
          cov = (1 - t) * featherK + 0.5;
          if (cov <= 0) continue;
          if (cov > 1) cov = 1;
        }
        const k = row + i;
        const hc = h * cov;
        if (hc > top[k]) top[k] = hc;
      }
    }
    if (cwL > 0 || cwH > 0) this.colour(x, z, w, l, cwL, cwH, r, g, b, round);
    this.n++;
  }

  // The colour half, at N/2. Split out because it runs on a different grid and
  // because a solid with no useful colour (a bare wall volume, r < 0) skips it
  // entirely — which is most of the perimeter.
  colour(x, z, w, l, cwL, cwH, r, g, b, round) {
    const M = this.M;
    let i0 = Math.floor((x - w / 2 - this.minX) * this.mx);
    let i1 = Math.ceil((x + w / 2 - this.minX) * this.mx);
    let j0 = Math.floor((z - l / 2 - this.minZ) * this.mz);
    let j1 = Math.ceil((z + l / 2 - this.minZ) * this.mz);
    if (i1 <= 0 || j1 <= 0 || i0 >= M || j0 >= M) return;
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0;
    if (i1 > M) i1 = M; if (j1 > M) j1 = M;
    if (i1 === i0) i1 = i0 + 1;
    if (j1 === j0) j1 = j0 + 1;
    const CR = this.cr, CG = this.cg, CB = this.cb, CW = this.cw;
    const HR = this.hr, HG = this.hg, HB = this.hb, HW = this.hw;
    const ci = (x - this.minX) * this.mx, cj = (z - this.minZ) * this.mz;
    const ri = Math.max(1e-4, w / 2 * this.mx), rj = Math.max(1e-4, l / 2 * this.mz);
    const featherK = Math.min(ri, rj);
    for (let j = j0; j < j1; j++) {
      const row = j * M;
      const dj = round ? (j + 0.5 - cj) / rj : 0;
      for (let i = i0; i < i1; i++) {
        let cov = 1;
        if (round) {
          const di = (i + 0.5 - ci) / ri;
          const t = Math.sqrt(di * di + dj * dj);
          cov = (1 - t) * featherK + 0.5;
          if (cov <= 0) continue;
          if (cov > 1) cov = 1;
        }
        const k = row + i;
        if (cwL > 0) {
          const q = cwL * cov;
          CR[k] += r * q; CG[k] += g * q; CB[k] += b * q; CW[k] += q;
        }
        if (cwH > 0) {
          const q = cwH * cov;
          HR[k] += r * q; HG[k] += g * q; HB[k] += b * q; HW[k] += q;
        }
      }
    }
  }

  // sRGB hex convenience for the call sites that still think in swatches.
  boxHex(x, z, w, l, y0, y1, hex, round) {
    if (hex == null) return this.box(x, z, w, l, y0, y1, -1, 0, 0, round);
    const d = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return this.box(x, z, w, l, y0, y1,
      d(((hex >> 16) & 255) / 255), d(((hex >> 8) & 255) / 255), d((hex & 255) / 255),
      round);
  }

  finish(THREE, emptyHex = 0xbdb3a0) {
    const N = this.N, M = this.M;
    const px = new Uint8Array(N * N * 4);
    const hx = new Uint8Array(M * M * 4);
    const er = (emptyHex >> 16) & 255, eg = (emptyHex >> 8) & 255, eb = emptyHex & 255;
    const top = this.top;
    const CR = this.cr, CG = this.cg, CB = this.cb, CW = this.cw;
    const HR = this.hr, HG = this.hg, HB = this.hb, HW = this.hw;
    const inv = 255 / FIELD_H;
    // linear -> sRGB, 1024 entries, so the encode is a lookup not 12M pows
    const LUT = new Uint8Array(1025);
    for (let i = 0; i <= 1024; i++) {
      const v = i / 1024;
      LUT[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92
        : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    }
    const enc = (v) => LUT[v <= 0 ? 0 : (v >= 1 ? 1024 : (v * 1024) | 0)];
    // HEIGHT + LOW BAND. The height is what the contact core resolves, so it
    // rides at full N; the low colour band is upsampled from the M grid when
    // the mirror reads it, which costs nothing because both live in the same
    // sampler call.
    const SH = Math.round(Math.log2(N));
    for (let k = 0; k < N * N; k++) {
      const o = k * 4;
      const i = k & (N - 1), j = k >> SH;
      const km = (j >> 1) * M + (i >> 1);
      const w = CW[km];
      if (w > 0) {
        px[o] = enc(CR[km] / w); px[o + 1] = enc(CG[km] / w); px[o + 2] = enc(CB[km] / w);
      } else { px[o] = er; px[o + 1] = eg; px[o + 2] = eb; }
      px[o + 3] = Math.min(255, top[k] * inv);
    }
    // HIGH BAND, 1.30 - 2.70 m. Alpha carries how much of that band is actually
    // filled, so a mirror can tell "a gondola header stands here" from "nothing
    // stands here above waist height" instead of blending toward an empty
    // column's fallback colour and washing every reflected object pale.
    for (let k = 0; k < M * M; k++) {
      const o = k * 4, w = HW[k];
      if (w > 0) {
        hx[o] = enc(HR[k] / w); hx[o + 1] = enc(HG[k] / w); hx[o + 2] = enc(HB[k] / w);
        hx[o + 3] = Math.min(255, Math.round(w / (REFL_HI - REFL_MID) * 255));
      } else { hx[o] = er; hx[o + 1] = eg; hx[o + 2] = eb; hx[o + 3] = 0; }
    }
    const mk = (data, n) => {
      const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
      // The colour channels are authored sRGB swatches; the height in alpha is
      // linear and three does not touch alpha, so one colourSpace flag is right
      // for both.
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;      // the far AO taps read coarse mips
      t.needsUpdate = true;
      return t;
    };
    this.tex = mk(px, N);
    this.hiTex = mk(hx, M);
    return this.tex;
  }

  // Texels per metre, averaged. Drives the LOD the spiral asks for.
  get density() { return (this.kx + this.kz) * 0.5; }

  // Debug: the field as a data URL, height in luminance. Not shipped; called
  // from the console when a stamp looks like it is missing.
  debugURL(mode = 'h') {
    const hi = mode === 'hi';
    const N = mode === 'h' ? this.N : this.M, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d'), im = g.createImageData(N, N);
    const R = hi ? this.hr : this.cr, G = hi ? this.hg : this.cg;
    const B = hi ? this.hb : this.cb, W = hi ? this.hw : this.cw;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i, o = ((N - 1 - j) * N + i) * 4, w = W[k];
        if (mode === 'h') {
          const v = Math.min(255, this.top[k] / FIELD_H * 255);
          im.data[o] = im.data[o + 1] = im.data[o + 2] = v;
        } else {
          im.data[o] = w > 0 ? R[k] / w * 255 : 0;
          im.data[o + 1] = w > 0 ? G[k] / w * 255 : 0;
          im.data[o + 2] = w > 0 ? B[k] / w * 255 : 0;
        }
        im.data[o + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  }
}

export function makeField(THREE, minX, minZ, spanX, spanZ, N) {
  return new Field(minX, minZ, spanX, spanZ, N);
}

// ---------------------------------------------------------------------------
// THE SHARED GLSL.
//
// Names are prefixed `chopF`/`vAo` on purpose: this chunk is concatenated into
// shaders that ALREADY carry floor.js's CHOP_SCENE_GLSL and signs.js's varying
// block, and a duplicate declaration is a silent all-black material.
//
// The whole chunk is #ifndef-guarded so it can be included by the floor, by
// the glass and by the generic AO patch in any order and any number of times.
// Three consumers each needing to know whether one of the others already
// declared the sampler is exactly the kind of coupling that turns into a
// shadow block two rounds later.
export const FIELD_GLSL = `
#ifndef CHOP_FIELD
#define CHOP_FIELD
uniform sampler2D uFld;
uniform sampler2D uFldHi;  // the 1.30-2.70 m colour band; a = how filled it is
uniform vec4 uFldMap;      // 1/spanX, minX, 1/spanZ, minZ
uniform vec4 uFldCfg;      // FIELD_H, texels/m, aoStrength, bounceStrength
uniform vec4 uFldCore;     // coreStrength, coreBias, coreGain, coreReach
uniform vec4 uFldSk;       // skirt near radius, radius ratio, -, -
uniform vec3 uFldBounce;   // colour of the light coming back off the floor
uniform float uFldDbg;     // 0 off, 1 visibility, 2 bounce, 3 height, 4 core

vec2 chopFldUV( vec2 p ) {
  return vec2( ( p.x - uFldMap.y ) * uFldMap.x, ( p.y - uFldMap.w ) * uFldMap.z );
}
vec4 chopFldAt( vec2 p, float lod ) {
  return textureLod( uFld, chopFldUV( p ), lod );
}
float chopFldTop( vec2 p, float lod ) {
  return chopFldAt( p, lod ).a * uFldCfg.x;
}
// What stands at p, AS SEEN AT HEIGHT y. Two bands, blended across the split,
// with the high band's fill fraction deciding how much of it there is to see —
// so a mirror looking at head height across an aisle gets the promo header
// where there is one and the low band where there is not, instead of one
// column-averaged mud colour for every object in the building.
vec3 chopFldCol( vec2 p, float y, float lod ) {
  vec2 uv = chopFldUV( p );
  vec3 lo = textureLod( uFld, uv, lod ).rgb;
  vec4 hi = textureLod( uFldHi, uv, max( 0.0, lod - 1.0 ) );
  float k = smoothstep( 1.00, 1.70, y ) * hi.a;
  return mix( lo, hi.rgb, k );
}

// Sky visibility and floor bounce in one walk.
//   .x  visibility  1 = open sky, 0 = sealed
//   .y  bounce      how much of the lower hemisphere is open lit floor
//
// Eight taps on a golden-angle spiral, radius 0.09 m to 2.6 m, each reading a
// mip whose footprint matches its own radius — so the near taps resolve a
// 47 mm contact and the far taps read a smoothed horizon instead of aliasing
// off individual cans. The occlusion a horizon at elevation theta casts on a
// cosine-weighted hemisphere is exactly sin^2(theta), which is why a barrel
// 90 mm away goes almost black at its foot and the same barrel 2 m away
// barely registers, with no falloff constant anywhere.
// SIX AZIMUTHS, FOUR RADII EACH, MAX PER AZIMUTH. The first version of this
// walked one golden-angle spiral — one sample per direction, radius growing
// with the index — and it measured almost nothing: a 2.05 m gondola standing
// 2.0 m from the middle of an aisle was only ever seen by whichever single tap
// happened to be BOTH pointed at it AND far enough out, so the aisle floor
// came back at 0.94 visibility instead of 0.86 and the whole term was a
// rounding error. That is not a tuning miss, it is the wrong estimator: theta
// has to be the HORIZON in a direction, i.e. the max elevation over the whole
// ray, and one sample cannot be a max. Four radii per azimuth, geometric from
// 80 mm to 2.4 m, each read at the mip that matches its own footprint.
// ---------------------------------------------------------------------------
// TWO TERMS, ROUND 9. THE ONE THING BLIND TEST 8 MEASURED FOR US.
//
// The critic ran luminance profiles perpendicular to fixture bases in the
// reference photographs and in our renders, and the finding was a SHAPE, not a
// level:
//
//   REAL, gondola kickplate   floor bottoms at  49   ramps over ~35 px
//   REAL, shelf base          floor bottoms at 3-7   ramps over ~40 px
//   RENDER, endcap            floor bottoms at  93   ramps over  60 px, never
//                                                    leaving mid-grey
//   RENDER, dairy             floor bottoms at  18   full brightness in 8 px,
//                                                    then dead flat
//
// "A skirt with no core, and a core with no skirt. Real contact is both."
//
// One horizon walk cannot be both, and the reason is structural rather than a
// tuning miss. Round 8's estimator is cosine-weighted SKY VISIBILITY. For a
// floor point standing against a wall the honest answer is 0.5 — half the
// hemisphere is wall — and it stays near 0.5 for metres, because what changes
// as you walk away is not the horizon ELEVATION (still ~90 degrees, so still
// sin^2 ~ 1) but the AZIMUTHAL COVERAGE, which is a half-plane either way. So
// the term saturates within about a hundred millimetres, then decays over
// metres. Measured on the round-8 build at the dairy base: 0.37 at the line,
// 0.65 six pixels out, 0.80 at 45 px, 0.87 at 93. That is a room-scale ambient
// term. It is a good one. It is not contact, and no gain applied to it can be,
// because gain cannot move a knee.
//
// Contact is a different physical quantity. The last few millimetres of the
// crevice where two surfaces meet lose light to repeated bounces between two
// absorbers, and single-bounce visibility does not model that at all. It is
// short-range, it is far deeper than any visibility number, and it is what
// makes the line where an object meets the floor read as a LINE. So it gets
// its own walk, at its own scale, at lod 0 on a 23 mm field, and the two
// multiply:
//
//     vis = ( 1 - aoSkirt * skirt ) * ( 1 - aoCore * core )
//
// which is the only combination that produces both numbers at once.
//
// SELF-EXCLUSION IS THE WHOLE DIFFICULTY. A height field holds the tallest
// thing in a column, so a shelf deck 900 mm up inside a 2.05 m gondola reads
// "1.15 m of occluder directly overhead" in every direction and a naive core
// paints the entire product wall black. The skirt dodges this by pushing its
// sample origin 145 mm out along the normal — but a core that resolves
// millimetres cannot be pushed 145 mm anywhere. So instead the core measures
// height relative to the column the shading point is ALREADY PART OF:
//
//     rise = tapHeight - max( P.y, heightOfMyOwnColumn )
//
// A deck inside a gondola sees rise = 0 in every direction and takes no core.
// A floor point beside a barrel has its own column at zero, sees 0.9 m of
// barrel 40 mm away, and goes black. One line, and it is the difference
// between a contact term and a bug.
const int CHOP_AZ = 8;

// One contact tap: how much of the sky in direction d is cut off by whatever
// stands at radius r, as sin^2 of its elevation. The mip is matched at 0.55 of
// the radius rather than 0.50 on purpose — the sampled footprint has to be
// WIDER than the gap between consecutive radii or the sum of five discrete
// taps reads as five discrete steps walking away from a base, which is what
// the first build of this measured as a staircase in the profile.
float chopTap( vec2 p, vec2 d, float r, float base ) {
  float h = chopFldTop( p + d * r, log2( max( 1.0, r * uFldCfg.y * 0.55 ) ) );
  float e = max( 0.0, h - base ) / r;
  return e * e / ( 1.0 + e * e );
}

// Coverage of the immediate neighbourhood, in the hemisphere this surface
// faces. Returns 0..~0.5 raw — 0.5 being a flat wall standing beside a floor
// point, which is the geometric maximum a half-plane can ever produce.
float chopCore( vec3 Pin, vec3 N, float rot ) {
  // The core origin is pushed out along the normal only as far as the surface
  // is VERTICAL. A floor or a deck top gets 6 mm and can resolve its own
  // contact line; a product facing gets 160 mm, which clears both the 90 mm it
  // stands inside its gondola's stamp and the 100 mm of collider padding on
  // the perimeter cases, so a facing is never occluded by the fixture it is
  // sitting in. Vertical surfaces therefore take their darkening from the
  // skirt, which is correct: a shelf cavity is a cavity, not a contact.
  vec3 P = Pin + N * ( 0.006 + 0.155 * ( 1.0 - abs( N.y ) ) );
  float hSelf = chopFldTop( P.xz, 0.0 );
  // ...and the self-clamp only applies to surfaces that are actually up INSIDE
  // something. Measured, because it showed up as an inversion: the first six
  // pixels of floor at the dairy base came back BRIGHTER than the six after
  // them — 83, 56, 44, 56, 65, then 27 — which is a shadow with a hole punched
  // through its own contact line. Cause: colliders are padded outward (the
  // cooler's by 100 mm) and the field takes the collider, so the floor for the
  // first four texels outside a fixture is still inside that fixture's STAMP.
  // hSelf reads 2.3 m there, the clamp says "you are part of this column, take
  // no contact", and the darkest part of the shadow is deleted.
  //
  // The clamp exists for a shelf deck 900 mm up inside a 2.05 m gondola. A
  // floor fragment is at y = 0 and is never part of the column of whatever is
  // standing on it, however far that thing's stamp is padded — so height is
  // the discriminator, and it is a good one because the two cases are 900 mm
  // apart. Below 50 mm the clamp is off entirely.
  float selfW = smoothstep( 0.05, 0.19, P.y );
  float base = max( P.y, ( hSelf - 0.02 ) * selfW );
  float acc = 0.0, wsum = 0.0;
  for ( int a = 0; a < CHOP_AZ; a ++ ) {
    float ang = rot + float( a ) * ( 6.28318 / float( CHOP_AZ ) );
    vec2 d = vec2( cos( ang ), sin( ang ) );
    // A crevice occludes from the SIDE at least as much as from above, so this
    // lobe is much flatter than the skirt's 35-degree cone — 17 degrees up.
    float wc = max( 0.0, dot( vec3( d.x, 0.30, d.y ) * 0.95783, N ) );
    // THE RADIUS WEIGHTS ARE THE DERIVATIVE OF THE PROFILE WE ARE AIMING AT.
    //
    // This went through three wrong estimators before it went through the
    // right one, and all three failures are the same failure: they answer a
    // question about REACH when the profile is a question about SHAPE.
    //   * max() over radii -> full strength everywhere inside the outermost
    //     radius and nothing outside it. Measured 36 at 8 px, 95 at 16 px: a
    //     cliff, i.e. the round-8 fault at a smaller scale.
    //   * 1/(1+(r/r0)^2) weights -> monotone decreasing, so the near radii
    //     dominate and the term dies inside 120 mm however far the taps reach.
    //
    // What a term built as "sum over the radii that reach past x" actually is,
    // is the survival function of a distribution over radii. So its derivative
    // x is the weight at radius x, and if the target profile is known the
    // weights are not free parameters at all — they are read off it.
    //
    // The target is measured, off reference/store_05's gondola end panel, and
    // corrected into linear light because a 35-pixel ramp in an 8-bit sRGB
    // image is a much longer ramp in radiance than it looks:
    //
    //     V(x) = 0.08 + 0.92 * smoothstep( 0.02, 0.58, x )
    //
    // d/dx of a smoothstep is 6t(1-t), a parabola peaking at the MIDDLE of its
    // span — so the weights peak at 300 mm and fall away on both sides, and
    // the 26 mm tap, the one that feels like it should matter most, carries
    // 1.5% of the term. That is the whole reason every monotone-decreasing
    // weighting failed: it puts its mass where the profile is flat.
    //
    // Radii hand-placed on that parabola rather than geometric, because a
    // geometric ladder bunches its samples exactly where the weight is
    // smallest. Unrolled: five different constants, no array indexing.
    float o = chopTap( P.xz, d, 0.026 * uFldCore.w, base ) * 0.0147
            + chopTap( P.xz, d, 0.085 * uFldCore.w, base ) * 0.1422
            + chopTap( P.xz, d, 0.175 * uFldCore.w, base ) * 0.2778
            + chopTap( P.xz, d, 0.300 * uFldCore.w, base ) * 0.3467
            + chopTap( P.xz, d, 0.470 * uFldCore.w, base ) * 0.2186;
    acc += o * wc; wsum += wc;
  }
  return acc / max( wsum, 0.05 );
}

vec2 chopAO( vec3 Pin, vec3 N ) {
  // SELF-OCCLUSION BIAS. The field is a height field of SOLID volumes and a
  // gondola is stamped as one: 1.34 m deep, 2.05 m tall, opaque all the way
  // through. A facing faced to the lip stands about 90 mm INSIDE that volume,
  // so a tap taken from its own surface lands in its own fixture and reports
  // a sealed horizon in every direction — which is exactly what happened: the
  // whole product wall came back at the cavity's darkness with no front-to-
  // back gradient at all. Pushing the sample origin out along the normal is
  // the standard fix and it is the honest one, because the hemisphere a
  // vertical facing can see is the hemisphere in FRONT of the facing. Scaled
  // by (1 - |N.y|) so an up-facing deck or the floor itself barely moves and
  // keeps its tight contact line.
  vec3 P = Pin + N * ( 0.145 * ( 1.0 - abs( N.y ) * 0.78 ) );
  float occ = 0.0, wsum = 0.0, bnc = 0.0, bsum = 0.0;
  // World-space rotation of the fan. It is a function of POSITION, not of
  // screen space, so it is rock steady under camera motion.
  //
  // ROUND 9 — CONTINUOUS, NOT A QUANTISED HASH. Round 8 hashed floor(P.xz*2.9),
  // i.e. one random angle per 345 mm cell, and with the contact core added on
  // top the seams between those cells showed up in the measured profile as
  // genuine non-monotonicity: 30, 18, 18, 26, 32, 54, 33, 37 reading OUTWARD
  // from a base, which is a floor that gets brighter and darker and brighter
  // again as you walk away from a wall. A hash is discontinuous by
  // construction, so the cell boundary is a step in the estimator however
  // coarsely it is quantised. A plain linear ramp is continuous everywhere,
  // the estimator has period 2*pi/8 in it so the ramp never needs to wrap, and
  // it turns the eight-fold aliasing into a slow smooth wobble with a 190 mm
  // period instead of a lattice of steps.
  float rot = ( P.x * 1.7 + P.z * 2.3 ) * 2.4;
  for ( int a = 0; a < CHOP_AZ; a ++ ) {
    float ang = rot + float( a ) * ( 6.28318 / float( CHOP_AZ ) );
    vec2 d = vec2( cos( ang ), sin( ang ) );
    float horizon = 0.0;                    // max sin^2(theta) along this ray
    float open = 0.0;                       // mean "lit floor visible" along it
    float ow = 0.0;
    for ( int s = 0; s < 4; s ++ ) {
      // ROUND 9 — 0.080 -> 0.30 for the first radius, and five radii instead of
      // four. THE SMALLEST SKIRT RADIUS IS THE ENTIRE FALLOFF WIDTH, which is
      // not obvious and is why the round-8 skirt was 10 px wide when the
      // reference is 35. horizon is a max() over the ray, so the far radii see
      // the same 2.3 m wall from 0.1 m out as from 1 m out and contribute a
      // nearly constant term; the only thing that CHANGES as you walk away
      // from a base is which azimuths the NEAREST radius still reaches. Move
      // that radius and the whole skirt moves with it.
      //
      // Measured, not guessed. reference/store_05 at the black gondola end
      // panel, floor luminance as a fraction of the open-aisle asymptote:
      //   0.07 at the line, 0.16 at 6 px, 0.26 at 12, 0.37 at 18, 0.51 at 20,
      //   0.79 at 24, 0.90 at 34, 0.98 at 60.
      // Round 8 hit 0.50 at 7 px and 0.90 at 12 — the right shape at a third
      // of the right SIZE. The core covers 0 to 280 mm and the skirt now
      // starts at 300, so between them they tile 0 to 2.7 m continuously
      // instead of both crowding into the first 120.
      float rad = uFldSk.x * pow( uFldSk.y, float( s ) );   // 0.34 .. 2.52 m
      float lod = log2( max( 1.0, rad * uFldCfg.y * 0.50 ) );
      float h = chopFldTop( P.xz + d * rad, lod );
      float e = max( 0.0, h - P.y - 0.015 ) / rad;      // tan(theta)
      horizon = max( horizon, e * e / ( 1.0 + e * e ) ); // sin^2(theta)
      // ...and the same tap read downward: is there open floor out there for
      // light to come back off? Near samples count for more, because bounce
      // falls off with distance twice — once going down, once coming back.
      float seen = 1.0 - clamp( ( h - 0.05 ) / max( 0.22, rad * 0.55 ), 0.0, 1.0 );
      float sw = 1.0 / ( 1.0 + rad * 1.6 );
      open += seen * sw; ow += sw;
    }
    // cosine weight of a cone about 35 degrees up in this azimuth, against the
    // shading normal — so a vertical facing is occluded by what is in FRONT of
    // it and not by the shelf behind its own back panel
    float wu = max( 0.0, dot( vec3( d.x, 0.70, d.y ) * 0.81922, N ) );
    occ += horizon * wu; wsum += wu;
    float wd = max( 0.0, dot( vec3( d.x, -0.55, d.y ) * 0.87619, N ) );
    bnc += ( open / ow ) * wd; bsum += wd;
  }
  // uFldCfg.z is BOTH the strength and the ceiling on how dark occlusion can
  // get. A sealed point returns 1 - strength rather than 0, which is the
  // difference between a shadow and "no light was sampled here" — the flat
  // black the blind test measured on every bottom deck.
  float skirt = 1.0 - uFldCfg.z * ( occ / max( wsum, 0.05 ) );
  // ...and the core, remapped. A half-plane occluder saturates the raw
  // coverage at 0.5 — that is what a half-plane IS — so uFldCore.y is the
  // noise floor and uFldCore.z the gain that puts a wall standing beside a
  // floor point at full strength. The bias matters as much as the gain: below
  // it, nothing happens, which is what keeps the open aisle clean and stops
  // the term from reading as a general dirtiness.
  float core = clamp( ( chopCore( Pin, N, rot ) - uFldCore.y ) * uFldCore.z, 0.0, 1.0 );
  float vis = skirt * ( 1.0 - uFldCore.x * core );
  float b = bnc / max( bsum, 0.30 );
  // floor bounce falls off hard with height: it is light that has already lost
  // most of its energy to one diffuse reflection.
  b *= 1.0 / ( 1.0 + P.y * P.y * 0.80 );
  return vec2( clamp( vis, 0.0, 1.0 ), clamp( b, 0.0, 1.0 ) );
}

// The mirror's view of the same field. Returns rgb = what stands at p in the
// band a reflection sees, a = how much of the ray's lobe that column fills at
// height y. One function so the floor and the glass cannot disagree about what
// is standing in the room, the way the analytic gondola test and the
// hand-placed prop list used to.
vec4 chopFldHit( vec3 Q, float lod, float soft ) {
  vec4 s = chopFldAt( Q.xz, lod );
  float h = s.a * uFldCfg.x;
  float o = 1.0 - smoothstep( h - soft, h + soft * 0.55, Q.y );
  return vec4( s.rgb, o * step( 0.012, s.a ) );
}
#endif
`;

// The fragment code that consumes it. Applied AFTER <opaque_fragment>, so it
// scales everything the material returned — including any reflection the floor
// or the glass already put there, which is what a shadow physically does.
const AO_FRAG = `
{
  vec2 chopA = chopAO( vAoW, normalize( vAoN ) );
  gl_FragColor.rgb *= chopA.x;
  gl_FragColor.rgb += diffuseColor.rgb * uFldBounce * ( chopA.y * uFldCfg.w );
  // 1 = visibility, 2 = bounce, 3 = field height under the fragment, 4 = the
  // contact core on its own, which is the term round 9 added and the one worth
  // being able to look at in isolation. Driven from the console:
  //   __CHOP.scene.userData.chopField.uniforms.uFldDbg.value = 1
  if ( uFldDbg > 0.5 ) {
    vec3 nn = normalize( vAoN );
    gl_FragColor.rgb = uFldDbg < 1.5 ? vec3( chopA.x )
      : ( uFldDbg < 2.5 ? vec3( chopA.y )
      : ( uFldDbg < 3.5 ? vec3( chopFldTop( vAoW.xz, 0.0 ) / uFldCfg.x )
      : vec3( 1.0 - clamp( ( chopCore( vAoW, nn, 0.7 ) - uFldCore.y )
          * uFldCore.z, 0.0, 1.0 ) ) ) );
  }
}
`;

const AO_VERT_HEAD = `
varying vec3 vAoW;
varying vec3 vAoN;`;

// instanceMatrix is declared by three's prefix whenever USE_INSTANCING is set,
// and modelMatrix alone does NOT carry it — three applies it in
// <project_vertex>, after <begin_vertex>. Every product in this store is an
// InstancedMesh, so getting this wrong puts the entire product wall's AO at
// the origin.
const AO_VERT_BODY = `
#ifdef USE_INSTANCING
  vAoW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
  vAoN = normalize( mat3( modelMatrix ) * mat3( instanceMatrix ) * normal );
#else
  vAoW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vAoN = normalize( mat3( modelMatrix ) * normal );
#endif`;

let AO_SERIAL = 0;

// Patch one material. Chains whatever onBeforeCompile it already had — pack.js,
// signs.js and floor.js all use theirs — and appends to its cache key so three
// does not hand back the unpatched program.
export function patchAO(THREE, m, U) {
  if (!m || m.userData.chopAOd) return false;
  m.userData.chopAOd = true;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (sh, renderer) => {
    if (prev) prev.call(m, sh, renderer);
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>' + AO_VERT_HEAD)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + AO_VERT_BODY);
    // ANCHORED AT TONEMAPPING, NOT AT opaque_fragment. Three of the materials
    // this patches — the floor, the freezer glass, every signMat — already
    // append their own code to <opaque_fragment>, and because patchAO chains
    // the previous hook FIRST, a second replace of that same token inserts
    // BEFORE their code, not after it. That put the occlusion underneath the
    // floor's reflection mix, so the mirror was unshadowed: a barrel got a
    // dark ring on the matte tile and none at all on the reflective part of
    // the same tile. <tonemapping_fragment> is the next include after
    // <opaque_fragment> in every one of three's lit and unlit shaders, so it
    // is after everything anybody appended, and still before fog — which is
    // correct, because fog is in front of the surface, not on it.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>' + AO_VERT_HEAD + FIELD_GLSL)
      .replace('#include <tonemapping_fragment>', AO_FRAG + '#include <tonemapping_fragment>');
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : (m.type + AO_SERIAL)) + '|chopAO8';
  m.needsUpdate = true;
  return true;
}

// Walk everything under `root` and patch every material that should take
// occlusion. The skip rules are properties of the MATERIAL, not a name list:
//   * anything not normal-blended is already a multiply or additive card, and
//     occluding an occlusion card double-counts
//   * anything flagged userData.chopNoAO — emitters (lamp lenses, EXIT boxes,
//     the daylight plate outside the doors) and the glass, which does its own
//   Returns a census so the round report can state coverage rather than hope.
export function applyAO(THREE, root, U) {
  const seen = new Set();
  let patched = 0, skipped = 0;
  root.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh && !o.isPoints) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || seen.has(m.uuid)) continue;
      seen.add(m.uuid);
      if (m.userData.chopNoAO) { skipped++; continue; }
      if (m.blending !== THREE.NormalBlending) { skipped++; continue; }
      if (patchAO(THREE, m, U)) patched++;
    }
  });
  return { patched, skipped, materials: seen.size };
}

export function fieldUniforms(THREE, field, opts = {}) {
  // finish() is idempotent-by-caller but the tex must exist NOW: a uniform
  // holding `undefined` binds no texture at all, every tap returns black, the
  // height field reads as zero everywhere and the AO comes out as a perfectly
  // uniform 1.0 — which looks exactly like "the shader is not running".
  if (!field.tex) field.finish(THREE);
  return {
    uFld: { value: field.tex },
    uFldHi: { value: field.hiTex },
    uFldMap: {
      value: new THREE.Vector4(1 / field.spanX, field.minX, 1 / field.spanZ, field.minZ),
    },
    uFldCfg: {
      value: new THREE.Vector4(FIELD_H, field.density,
        opts.ao ?? 0.90, opts.bounce ?? 0.34),
    },
    // strength, bias, gain, reach. Swept live against the dairy-base profile
    // with the console loop open; see the note above chopCore for what each
    // one is doing and why the bias is not optional.
    uFldCore: {
      // 0.84 was swept against the dairy-base profile at 0.78 / 0.85 / 0.92.
      // 0.92 sits eight to fifteen counts UNDER the reference all the way out
      // to 40 px; 0.78 is over it by about the same; 0.84 tracks it to within
      // the width of a grout line. See the round-9 report for the numbers.
      value: new THREE.Vector4(opts.core ?? 0.84, opts.coreBias ?? 0.020,
        opts.coreGain ?? 2.20, opts.coreReach ?? 1.0),
    },
    uFldSk: {
      value: new THREE.Vector4(opts.skirtR ?? 0.34, opts.skirtRatio ?? 1.95, 0, 0),
    },
    uFldBounce: { value: new THREE.Color(opts.bounceCol ?? 0xb9a887) },
    uFldDbg: { value: 0 },
  };
}

// ---------------------------------------------------------------------------
// PROMO COPY. ROUND 8 — the other half of the entropy fault.
//
// "Promo signage is about six unique assets — SAVE $1.50 appears in three of
// four frames, twice in one."  True, and the cause is that the promo atlas is
// a hand-written list of six strings. Six strings tiled over forty sign sites
// repeats by arithmetic; no amount of care in the artwork changes that.
//
// A supermarket's promo copy is not a list, it is a GRAMMAR: a deal shape
// (BOGO / multibuy / price point / percent / member), a price drawn from a
// psychological ladder that never lands on a round number, and a qualifier
// line. Generating from the grammar means the fortieth sign is as unlikely to
// repeat as the second, which is a property of the production rather than of
// the asset count.
const CENTS = [9, 19, 25, 29, 33, 39, 44, 49, 50, 59, 66, 69, 77, 79, 88, 89, 97, 99];
const DOLLARS = [1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 5, 6, 7, 8, 9, 10, 12, 15];
const QUAL = [
  'WITH CARD', 'LIMIT 4', 'LIMIT 2', 'MIX OR MATCH', 'SELECT VARIETIES',
  'WHILE SUPPLIES LAST', 'MEMBER PRICE', 'EVERY DAY', 'SAVE MORE',
  'LIMIT 6 PER VISIT', 'ASSORTED SIZES', 'THIS WEEK ONLY', 'NO CARD NEEDED',
  'SELECT SIZES', 'IN STORE ONLY', 'FROZEN ONLY', 'PLUS DEPOSIT',
];
const HEADS = [
  'LOW PRICE', 'HOT BUY', 'SAVE', 'DEAL', 'PRICE DROP', 'MANAGER SPECIAL',
  'ROLLBACK', 'CLUB DEAL', 'FRESH DEAL', 'MARKDOWN', 'VALUE PICK', 'BIG SAVE',
  'WEEKLY WIN', 'STOCK UP', 'BUY MORE SAVE', 'CLEARANCE', 'NEW LOW', 'BONUS BUY',
];

// A deal, drawn from the grammar. `seed` makes it deterministic per site.
export function promoDeal(seed) {
  const rng = makeRng(seed * 2654435761 + 0x9e37);
  const P = (a) => a[Math.floor(rng() * a.length) % a.length];
  const money = (d, c) => '$' + d + '.' + String(c).padStart(2, '0');
  const roll = rng();
  const head = P(HEADS);
  const qual = P(QUAL);
  if (roll < 0.16) {
    const n = rng() < 0.7 ? 2 : 3;
    return { head: 'BUY ' + n, big: 'GET 1', sub: 'FREE', qual, kind: 'bogo' };
  }
  if (roll < 0.36) {
    const n = 2 + Math.floor(rng() * 4);
    const d = P(DOLLARS);
    return { head, big: n + ' FOR', sub: '$' + d, qual, kind: 'multi' };
  }
  if (roll < 0.50) {
    const p = [10, 15, 20, 25, 30, 33, 40, 50][Math.floor(rng() * 8)];
    return { head, big: p + '%', sub: 'OFF', qual, kind: 'pct' };
  }
  if (roll < 0.70) {
    const c = P(CENTS);
    return { head, big: c + '¢', sub: 'EACH', qual, kind: 'cents' };
  }
  if (roll < 0.86) {
    const d = P(DOLLARS), c = P(CENTS);
    return { head: 'SAVE', big: money(d, c), sub: 'PER LB', qual, kind: 'save' };
  }
  const d = P(DOLLARS), c = P(CENTS);
  return { head, big: money(d, c), sub: rng() < 0.5 ? 'EACH' : 'EA', qual, kind: 'price' };
}
