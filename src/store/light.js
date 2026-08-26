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
// ROUND 10 — REFL_HI 2.70 -> 3.80, AND HANGING SOLIDS NOW PAINT COLOUR.
// Blind test 9: the freezer glass is "veiling glare, not an image", at 53% of
// the real bay-to-bay variance. I had already found the blocker myself and
// reported it: the `y0 > 2.90` rule below keeps hanging signage out of the
// field entirely, so the one class of object in the store with enough contrast
// to be legible in a reflection was the one class a pane could not reflect.
//
// The rule was doing two jobs at once and only one of them was right. A
// hanging sign must not enter the HEIGHT channel — a height field is a model
// of what stands on the floor, and stamping a sign into it drops a pillar of
// shadow down the middle of the aisle. But it must enter the COLOUR channel,
// because a mirror is not an occluder: it does not care whether the thing it
// reflects is holding itself up. Splitting the rule is one line at the sink
// and it is the whole of the glass fix.
//
// Raising the top of the high band from 2.70 to 3.80 is what lets the band
// actually contain them: aisle blades sit at 2.50-4.14, danglers at 2.86-3.60,
// promo headers at 2.6. Ceiling hardware is unaffected — a troffer at 5.19 m
// and a sprinkler main at 4.85 are both above 3.80 and contribute zero, so
// nothing double-counts against the analytic ceiling the mirrors already
// trace. The alpha normalisation deliberately does NOT follow the band up
// (see finish): dividing the fill fraction by a band 79% taller would have
// quietly weakened every reflected gondola header that already worked.
const REFL_LO = 0.04, REFL_MID = 1.30, REFL_HI = 3.80;
// ...and what the fill fraction is measured against. Round 9's REFL_HI - MID.
const REFL_NORM = 1.40;
// Above this a solid hangs from the ceiling rather than standing on the floor.
const HANG_Y = 2.90;

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
    this.nHang = 0;
    this.nPaint = 0;
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
    // ROUND 10 — colour only, height skipped. See REFL_HI above.
    if (y0 > HANG_Y) {
      if (r >= 0) {
        const cwH = Math.max(0, Math.min(y1, REFL_HI) - Math.max(y0, REFL_MID));
        if (cwH > 0) this.colour(x, z, w, l, 0, cwH, r, g, b, round);
        this.nHang++;
      }
      return;
    }
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

  // COLOUR ONLY, no height. The Quads sink (see kit.js) — a sign, a blade, a
  // dangler, a price rail: things a mirror must see and a shadow must not.
  paint(x, z, w, l, y0, y1, r, g, b) {
    if (!(r >= 0)) return;
    const cwL = Math.max(0, Math.min(y1, REFL_MID) - Math.max(y0, REFL_LO));
    const cwH = Math.max(0, Math.min(y1, REFL_HI) - Math.max(y0, REFL_MID));
    if (cwL <= 0 && cwH <= 0) return;
    this.colour(x, z, w, l, cwL, cwH, r, g, b, false);
    this.nPaint++;
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
        hx[o + 3] = Math.min(255, Math.round(w / REFL_NORM * 255));
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
uniform vec4 uFldCav;      // cavity strength, crevice strength, -, crevice height
uniform vec3 uFldBounce;   // colour of the light coming back off the floor
uniform vec4 uFldSide;     // ROUND 14: aisle-bounce gain, march step, -, -
uniform float uFldDbg;     // 0 off, 1 visibility, 2 bounce, 3 height, 4 core
// PER-MATERIAL, 1 for a lit material and 0 for an unlit one — set by patchAO
// off the material's own type, the way applyAO's skip rules are properties of
// the material rather than a name list. A bounce term is a LIGHT, and a
// MeshBasicMaterial has no lighting to add to: its texel value already IS its
// final colour, so room bounce on one is not dim light arriving, it is the
// print getting brighter than it prints. The hanging aisle-sign faces are
// exactly that material and they already clip at any exposure.
uniform float uFldLit;
// ROUND 13 — THE FIXTURES, AS LIGHT. See chopLamp below.
uniform vec4 uLampGeo;     // row x0, row pitch, lamp plane y, lattice half-span x
uniform vec4 uLampCfg;     // diffuse gain, specular exponent, row half-span z, spec scale
uniform vec3 uLampCol;
uniform float uLampSpec;   // PER-MATERIAL specular gain; 0 = matte, see patchAO
// ROUND 17 — THE ENTRANCE. See chopDay below.
uniform vec4 uDayA;        // door 1: centre x, half width, glass plane z, head y
uniform vec4 uDayB;        // door 2, same four
uniform vec4 uDayCfg;      // gain (0 = off), reach in metres, lateral spread, -
uniform vec3 uDayCol;      // daylight, which is NOT the colour of the lamps
// PER-TEXEL finish, written by whoever knows it. ../store/pack.js sets it from
// the mask's print-brightness channel, which is what makes white shrink film
// and bare tinplate flare while printed ink stays dull — the round-2 argument,
// finally applied to the lamps as well as to the directionals. It is declared
// HERE, defaulting to a flat 1, because this chunk is injected at <common>,
// i.e. ahead of every material's own code: a global that some shaders declare
// and others do not is a compile error waiting for round 14.
float chopGlossX = 1.0;

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
  //
  // ROUND 14 — THAT FLOOR IS A CONSTANT AND IT IS THE BOTTOM OF THE PRODUCT
  // WALL'S WHOLE LIGHTNESS DISTRIBUTION. Round 13 measured the shading factor
  // at p5 0.102, and 0.102 is not a measurement of anything: it is
  // 1 - uFldCfg.z, typed here. One number decides how dark the darkest fifth
  // of every shelf in the building is.
  //
  // ROUND 15 — CORRECTION, AND IT IS WRONG TWICE.
  //
  // First the arithmetic. ../store.js ships ao: 0.88, so uFldCfg.z is 0.88 and
  // the typed floor is 1 - 0.88 = 0.120. Not 0.102, and not the 0.149 that
  // round 14 itself re-measured further down this file. The three numbers were
  // being treated as one.
  //
  // Second, and this is the part that matters: IT IS NOT AN IDENTITY. Tested
  // as a within-run uniform toggle on one page load, byte-identical restore
  // proven by md5, camera at aisleX(3), 1.62, -9.0 looking at aisleX(3), 1.30,
  // 12.0 — swinging the typed floor from 0.120 to 0.320, a change of +0.200,
  // moves shelf-band (y 0.30-0.72, full width) linear-luminance p5 from 0.0308
  // to 0.0333. A swing of +0.0025. The typed constant transmits 1.3% of itself
  // to the statistic it was said to BE. Round 14's critic ran the same test on
  // the shading factor rather than on framebuffer luminance and got +0.067 on
  // the same +0.200; different quantity, same verdict.
  //
  // The reason is geometric and obvious once stated: almost nothing in a shelf
  // band is a sealed point. The p5 pixel is a facing deep in a cavity that
  // still sees a slice of aisle, so it lands on the smooth part of the curve,
  // not on its clamp. A constant that bounds a distribution is not the same
  // object as the distribution's own percentile, and "this measurement is
  // really just that constant" is a claim that has to be swept, not asserted
  // from the shape of the formula.
  //
  // What it stands for is a point that can see none of the ceiling, and the
  // honest value of that is not a constant — it is what the surfaces around it
  // hand back. An enclosure whose walls have reflectance rho and whose opening
  // is a fraction f of its hemisphere settles at E_direct / ( 1 - rho * (1-f) ),
  // the integrating-cavity solution, because the light that fails to leave
  // keeps bouncing. A supermarket shelf is a strong version of that case: a
  // cream-painted steel box, 350 mm tall and 450 mm deep, open along its whole
  // front, packed with coated board and film at rho 0.5-0.7. Nothing about it
  // is sealed.
  //
  // uFldCav.z is that rho, and at 0 this expression is BYTE-IDENTICAL to the
  // round-9 one — the whole measured contact profile is the rho = 0 column, and
  // it is not being re-tuned behind anyone's back. What rho buys, at z = 0.90:
  //
  //     occluded fraction   0.0   0.2   0.4   0.5   0.6   0.8   0.9   1.0
  //     rho 0 (round 9)    1.00  0.82  0.64  0.55  0.46  0.28  0.19  0.10
  //     rho 0.55, inside=1 1.00  0.92  0.83  0.77  0.70  0.50  0.38  0.22
  // AND IT IS GATED ON THERE ACTUALLY BEING A CAVITY, which the first version
  // of this was not, and the lift map caught it: an open aisle floor standing
  // beside a gondola has occluded fraction 0.3-0.5, so the ungated form lifted
  // it 20-30% — and 0.3-0.5 is exactly the range the round-9 and round-10
  // contact profiles were measured in, against reference/store_04's freezer
  // plinth and store_05's end panel. That is measured work and lifting it is
  // not a side effect, it is a regression.
  //
  // The gate is the physics, not a patch. An integrating cavity is a point
  // INSIDE an enclosure. A floor point beside a fixture is not inside anything
  // — it is a half-plane occlusion, open to the whole ceiling on one side, and
  // there is no second wall to trade the light with. inside is already this
  // file's measure of "how much solid is standing over me", 0 in the open aisle
  // and 1 for a facing halfway up a gondola, and it is hoisted above the skirt
  // for that reason. With it, every open-floor contact profile in the building
  // is byte-identical to round 9's.
  float dn = max( 0.0, - N.y );
  float inCol = chopFldTop( Pin.xz, 0.0 );
  float inside = smoothstep( 0.10, 0.45, inCol - Pin.y - 0.02 );
  float ofr = occ / max( wsum, 0.05 );
  float skirt = ( 1.0 - uFldCfg.z * ofr ) / ( 1.0 - uFldCav.z * inside * ofr );
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

  // -------------------------------------------------------------------------
  // ROUND 10, TERM THREE — THE CAVITY. A DOWN-FACING SURFACE TOOK NO
  // OCCLUSION AT ALL, and that is arithmetic rather than a tuning miss.
  //
  // The skirt weights each azimuth by wu = max( 0, dot( vec3( d.x, 0.70, d.y
  // ), N ) ). For N = ( 0, -1, 0 ) that is max( 0, -0.70k ) = 0 in every one
  // of the eight azimuths, so wsum is zero, occ / wsum is zero and a shelf
  // underside comes back at visibility 1.0 however deep inside a gondola it
  // is. Worse, the BOUNCE lobe points down, so the same underside takes the
  // full floor bounce and is actively brightened by it. That is the whole of
  // "the undersides are light grey" against "in a real photo the darkest
  // pixels in the frame are under the shelf lip".
  //
  // The estimator was not wrong about the hemisphere. It is that a shelf
  // underside's hemisphere contains no sky: it is the ceiling of a box open on
  // one side, and the honest measure of a box is how far inside it you are —
  // which the height field already holds, at the shading point itself, for one
  // tap. inCol - Pin.y is the depth of solid standing over this fragment, 1.05
  // m for an underside halfway up a gondola and 0 for anything in the open.
  //
  // The bounce is killed by the same number, and that is the physical half:
  // an underside cannot see the floor because the fixture's own base is
  // between it and the floor. Reflected light does not arrive through a
  // gondola.
  // dn / inCol / inside are computed above the skirt now — round 14 needed
  // inside there to gate the cavity return. One derivation, one place.
  vis *= 1.0 - uFldCav.x * dn * inside;
  b *= 1.0 - dn * inside;

  // TERM FOUR — THE FIXTURE SIDE OF THE CONTACT, i.e. the other arm of the V.
  //
  // Blind test 9 measured an 18-19 px band of near-constant black on our kick
  // plates with a hard step at its top edge, against a REAL kick that is LIT
  // and darkens over only ~6 px into the line: "physically the occlusion is
  // mutual and continuous across the junction — a smooth V, not a black slab
  // followed by a ramp."
  //
  // Two causes and only one of them was the shader. The pigment was the other:
  // P.kick was authored near-black in round 4 as a stand-in for an occlusion
  // model that did not exist yet. It exists now, so the plate goes back to
  // painted steel (see ../store.js) and the darkness is computed.
  //
  // The shader half: chopCore pushes a VERTICAL surface 155 mm out along its
  // own normal, so that a product facing is not occluded by the fixture it is
  // sitting inside. A kick plate is vertical too, so it took no core, and the
  // junction became a step — authored slab above, computed ramp below.
  //
  // A vertical face meeting a floor loses half its hemisphere to the floor at
  // EVERY height; that part is flat and the ambient already carries it. What
  // is not flat is the crevice: in the last few centimetres the two surfaces
  // trade light back and forth and each bounce is absorbed, so both sides go
  // dark together and neither one can be dark on its own. It is short range on
  // BOTH surfaces, which is why the real fixture-side falloff is 6 px when the
  // real floor-side falloff is 48. 90 mm of kick at the distance a kick plate
  // is photographed from is five to seven pixels.
  float crev = ( 1.0 - abs( N.y ) )
             * ( 1.0 - smoothstep( 0.0, uFldCav.w, Pin.y ) );
  vis *= 1.0 - uFldCav.y * crev;

  return vec2( clamp( vis, 0.0, 1.0 ), clamp( b, 0.0, 1.0 ) );
}

// ---------------------------------------------------------------------------
// ROUND 15 — CORRECTION TO HOW THE TERM BELOW WAS REPORTED, kept here because
// this is the term the claim was made about.
//
// Round 14 headlined a median gain of +0.41 across six poses. The spread on
// that was +/- 0.57. It straddles zero and it should have been reported as
// indistinguishable from zero rather than as a gain. Its %chr and p25 gains
// were real and were not reported with their spreads either: +1.31 +/- 0.49
// and +1.30 +/- 0.29, both 6 of 6 poses.
//
// Also corrected: round 14 said the term cost "+0.00 open floor in both
// poses". That is not exact. The innermost skirt lifts +0.015 / +0.037 /
// +0.027 at 0 / 4 / 8 px and the contact profile's MAE against the reference
// goes 0.152 -> 0.155. A wash, and not a regression — but "+0.00" was a
// rounding presented as an identity, which is the same mistake as the one
// corrected above chopAO's floor, one decimal smaller.
//
// The rule this file now follows: quote the spread with every paired
// statistic, and if it straddles zero, say so instead of quoting the mean.
// Every paired figure in round 15's own notes is written that way — see the
// side sweep in ../store.js and the mirror statistic in ../store.js buildSeg.
//
// ---------------------------------------------------------------------------
// ROUND 14 — THE RUN ACROSS THE AISLE. THE OTHER HALF OF A VERTICAL FACING'S
// HEMISPHERE, WHICH THIS FILE HAS NEVER SAMPLED.
//
// WHAT WAS MEASURED. Under one symmetric rule — chromatic = C* > 20, whole
// frame, no mask, identical on render and photograph — the render's chromatic
// population sits about 8 L* below the reference set's:
//
//                        %chr    p25    med    p75    p95   %>80
//     render, 6 poses    24.5   31.9   41.7   52.4   75.0   3.02
//     reference, 14      32.8   34.4   50.3   62.6   77.4   2.96
//
// ROUND 15 — CORRECTION. "p95 AND %>80 ALREADY AGREE" WAS NOT MEASURED
// SYMMETRICALLY, AND IT IS NOT A SAFE PREMISE.
//
// The table above put the RENDER through the references' q87 4:2:0 encode and
// left the photographs alone, and round 14 read the resulting move as "under
// 1 L*". Round 14's critic measured that same move at +1.98 median / +4.36
// p95, and then found the reason: re-encoding an ALREADY-q87 photograph moves
// the median +0.095 and the render's SECOND encode moves +0.18, so the large
// first move is a one-time PNG->JPEG transition the photographs had already
// made and the render had not. It is a transition artefact, not a codec
// correction. Measured symmetrically on the r14 build the critic read p95
// 80.38 render against 77.49 reference and %>80 5.21 against 2.97 — the
// bright end HOT, not level.
//
// Re-measured this round with both sides through one further q87 4:2:0 encode
// and the second pass shown to be small first (render at most +0.19 median,
// photographs at most -0.08, both sides checked before any number was used),
// whole frame, no mask, C* > 20, six aisle poses against all 14 reference
// files: render p95 77.37 against a reference median of 77.59, and %>L*80 3.93
// against 3.07. On THIS build the bright end is a little hot rather than a lot.
//
// The correction that matters is not the decimal, it is the reasoning. p95 and
// %>80 were used as a PREMISE — "the peak is right, therefore no global lever
// can be right" — and the reference range for those two statistics is p95
// 65.3 to 93.1 and %>80 0.5 to 18.3 across the fourteen files. A statistic
// whose reference band is that wide cannot carry a kill argument for a whole
// class of levers, whichever side of its median the render lands on.
//
// The individual measurements below stand and are worth keeping: on the
// captured frames exposure x1.35 puts the median at 48.7 and p95 at 83.8; a
// luminance-preserving warm cast puts the median at 50.4 and %>80 at 11.1;
// saturation x1.6 puts %chr at 63.9. Each fixes the body by wrecking the top,
// and each is a reason to prefer a term to a gain. What does not stand is
// "and therefore the top is already right".
//
// WHERE THE DEFICIT ACTUALLY IS. Split the frame by (L*, C*) on the same crop
// both sides (shelf band y 0.25-0.72), as % of the cropped frame:
//
//        C* > 20 area       L*20-40   L*40-50   L*50-60   L*60-70   L*70-80
//     render                  12.35      5.98      3.88      1.75      1.16
//     reference                8.64      6.35      5.45      4.31      2.32
//
// The render has the RIGHT TOTAL chromatic area (28.1% against 30.2%) and the
// wrong lightness for it: a surplus of dark chroma and a 2.5x deficit from
// L* 50 to 80. Its chroma is product print, and its product print is dark.
//
// WHY IT IS DARK, AS GEOMETRY RATHER THAN AS A GAIN. Take a product facing
// 1.2 m up on a gondola, normal across a 4.0 m aisle. The form factor from a
// differential vertical surface to an infinite strip subtending elevations
// a1..a2 is ( sin a2 - sin a1 ) / 2, so its hemisphere divides as
//
//     ceiling, +12 deg to +90      ( 1.000 - 0.208 ) / 2  =  0.396
//     the run across the aisle,
//       -16.7 deg to +12 deg       ( 0.208 + 0.287 ) / 2  =  0.248
//     floor, -90 deg to -16.7 deg  ( 1.000 - 0.287 ) / 2  =  0.354
//
// A QUARTER of what a facing sees is the run on the other side of the aisle,
// and it is the highest-cosine quarter, because a vertical surface weights its
// own horizon most. Round 13's per-light ablation measured where a facing's
// light actually comes from: 32.2% ambient, 30.4% hemisphere, 9.8% key, 0.0%
// fill, 8.3% floor bounce — and 0.0% from the opposite run, because until this
// function there was nothing in the file that looked sideways. chopAO's spiral
// weights a cone 35 degrees UP; a run whose top subtends 12 degrees barely
// registers in it, which is why the missing light did not show up as
// occlusion either.
//
// Solving the two facings together at rho = 0.5 gives E = E0 / ( 1 - 0.248 *
// 0.5 ) = 1.14 x E0. Adding the floor's own physical share on top — 0.354 x
// rho_floor against the 8.3% the render collects — puts a facing about 1.3x
// under, which is the same factor the L* deficit above asks for by a
// completely independent route. That agreement is the reason this term is a
// term and not a gain.
//
// WHAT IT DELIBERATELY DOES NOT TOUCH, and this is what protects p95:
//   * anything horizontal. lat = |N.xz| is 0 for the floor, the ceiling, deck
//     tops and shelf undersides, so the term is exactly zero there.
//   * anything unlit. uFldLit is 0 on a MeshBasicMaterial — the hanging sign
//     faces, which already clip.
//   * the lamps and the lens, which are chopNoAO and never patched at all.
// The bright end of this frame is ceiling, lamps, sign faces and deck tops.
// None of them is in that list.
//
// THE COLOUR IS NOT A CONSTANT. uFldBounce is one swatch for the whole floor,
// which is right for a floor because a floor is one material. The run across
// the aisle is a wall of packaging and it is a different colour every metre,
// so the term reads chopFldCol at the point it actually hit — the same two-band
// sampler the mirrors use, at the fragment's own height. Light coming off a
// wall of cereal boxes is the colour of cereal boxes.
vec3 chopAisle( vec3 P, vec3 N ) {
  float lat = length( N.xz );
  if ( lat < 0.06 || uFldSide.x <= 0.0 ) return vec3( 0.0 );
  vec2 dir = N.xz / lat;
  // FOUR HEIGHT TAPS AND ONE COLOUR TAP, in that order and not interleaved.
  // chopFldCol costs two fetches, so reading it inside the march would be
  // twelve fetches against chopAO's forty for a term worth an eighth of the
  // light. March the cheap channel to find WHERE the blocker is, then read its
  // colour once, at the distance the march actually found.
  //
  // rem is how much of the horizon is still unaccounted for, so a run 1.0 m
  // away hides the one 4.2 m behind it instead of both contributing. An aisle
  // is not transparent, and summing every hit is how a bounce term becomes fog.
  float rem = 1.0, F = 0.0, rw = 0.0, w = 0.0;
  for ( int i = 0; i < 4; i ++ ) {
    float r = uFldSide.y * ( 0.25 + 0.40 * float( i ) );
    vec2 q = P.xz + dir * r;
    float lod = log2( max( 1.0, r * uFldCfg.y * 0.5 ) );
    float top = chopFldTop( q, lod );
    // The strip it subtends from here: base on the floor, top at that height.
    float dy = top - P.y;
    float f = max( 0.0, 0.5 * ( dy / sqrt( dy * dy + r * r )
                              + P.y / sqrt( P.y * P.y + r * r ) ) );
    // ...and how much of the horizon this hit actually claims. A column that
    // does not reach the fragment's own height is not across the aisle from it.
    float take = smoothstep( P.y - 0.55, P.y + 0.10, top ) * rem;
    F += f * take; rw += r * take; w += take;
    rem -= take;
  }
  if ( F <= 0.0 ) return vec3( 0.0 );
  float rc = rw / max( w, 1e-3 );
  vec3 col = chopFldCol( P.xz + dir * rc, P.y,
                         log2( max( 1.0, rc * uFldCfg.y * 0.5 ) ) );
  return col * ( F * uFldSide.x * lat * uFldLit );
}

// ---------------------------------------------------------------------------
// ROUND 13 — THE LAMPS ARE WHERE THE LAMPS ARE.
//
// WHAT WAS MEASURED. Per-light ablation on the stage-7 product mask, one page
// load, byte-identical restore: a vertical gondola facing collects 32.2% of its
// light from AmbientLight, 30.4% from HemisphereLight, 9.8% from the key
// directional and 0.0% from the fill. The aisle floor in the same frame
// collects 35.4% from the key. So two thirds of a facing's light arrives from
// the two terms that are CONSTANT over a vertical plane — ambient is constant
// everywhere, and a hemisphere light at N.y = 0 is a fixed 50/50 sky/ground mix
// whichever way the facing points — and the resulting shading factor
// (framebuffer luminance / albedo luminance) is flat: p5 0.102, p50 0.353,
// p95 0.450. p95/p50 = 1.27. The lighting adds almost no variance of its own.
//
// WHY THAT IS FATAL RATHER THAN MERELY DULL. A constant shading factor k maps
// the albedo's (L* + 16) to k^(1/3) * (L* + 16) — the cube root is the whole of
// the CIE lightness curve. k = 0.353 gives 0.707, so an albedo of L* 93, the
// brightest bare-stock texel in the building, could then only ever arrive at
// L* 62.
//
// ROUND 14 — THAT LAST SENTENCE IS STALE AND MUST NOT BE CARRIED FORWARD. The
// algebra is right; its premise is not, because k is no longer that constant.
// Re-measured this round on the product mask over six named poses, albedo from
// PKG_STAGE 4 against the lit plate: k runs p5 0.149, p50 0.407, p95 0.913,
// p95/p50 = 2.24. An albedo of L* 93 arrives at L* 78, not 62, and the cap
// argument no longer describes this build.
// Measured on the mask: 1.2% of facings above L* 65 and 0.0% above L* 80,
// against 15.0% and 3.8% over five declared reference regions. Everything
// bright in the render's shelf band is therefore FIXTURE — deck edges, rails
// and price tags, which are near-neutral — and everything chromatic is dark.
// In the same rectangle: 62% product at median L* 37.0 / C* 14.6, 38% fixture
// at median L* 50.8 / C* 12.3 with a quarter of it over L* 65. That is the
// L* 50-65 chroma hole exactly, and it is why whole-frame % (L* > 50 & C* > 25)
// is 3.90 against a 4.06-25.33 range over all fourteen reference files.
//
// AND THE SPECULAR PATH CANNOT HELP, GEOMETRICALLY. pack.js has had a real
// per-texel specular since round 2. It has nothing to reflect: both directional
// lights sit at 66.8 and 26.6 degrees of elevation, so the mirror direction off
// a VERTICAL facing — or off a vertical can, whose normal sweeps the horizontal
// azimuths and nothing else — points into the floor. A camera at aisle height
// can never see it. No gain on any directional light changes that; it is a
// statement about where the light is, not how much of it there is.
//
// WHAT THE STORE ACTUALLY BUILDS. ../store.js runs continuous troffer strips
// PARALLEL to the aisles, one over every aisle centreline and one over every
// gondola run, interleaving to a lattice of pitch PITCH/2 at y = CEIL_H - 0.006.
// The far end of such a row is a nearly HORIZONTAL source — 11 degrees of
// elevation at twenty metres — and its reflection off a vertical cylinder does
// reach a camera looking down the aisle. That is the bright vertical band down
// every can in reference/store_00_Drinks and every bottle in store_05_Ingles,
// and it is the one light in the room a directional can not stand in for.
//
// So this is not another light. It is the fixtures that are already up there,
// evaluated per fragment:
//
//   ONE ROW, as an infinite Lambertian line at ( xr, lampY ) running along Z.
//   Integrating I0 * cos(emit) * max( 0, N . u ) / r^2 along it, with the N.z
//   term vanishing by symmetry and  integral dz / r^4 = pi / ( 2 d^3 ):
//
//       E  =  G * H * max( 0, N.x * a + N.y * H ) / d^3
//       a = xr - P.x,  H = lampY - P.y,  d^2 = a^2 + H^2
//
//   Check it against the trivial case: a floor point directly under a row,
//   a = 0, N = ( 0, 1, 0 ), gives G/H — inverse first power of the height, which
//   is what a line source does and what a point source does not.
//
// WHAT THIS TERM DOES NOT DO, MEASURED, SO ROUND 14 DOES NOT SPEND ITSELF ON IT.
// The DIFFUSE half of this is exposure-equivalent. Control, on one page load:
// turn the lamp term off entirely and scale all four store lights by 1.17 /
// 1.25 / 1.35 instead, then compare at matched whole-frame median L*:
//
//                        frame  prod  %>65  medC*  %L50C25  p90C*  C*|50-65
//     round 12            51.6  39.6   1.2   16.0     2.10   27.4      11.5
//     EXPOSURE x1.25      55.2  43.3   7.3   17.1     5.23   29.0      13.2
//     LAMP DIFFUSE        55.3  42.3   5.8   16.8     4.91   28.9      14.5
//
// A plain exposure lift matches or beats it on every column but one. The reason
// is geometric and it retires the idea rather than the tuning: a 2.65 m row
// pitch under a 5.2 m ceiling IS a uniform luminous plane at shelf range, so no
// arrangement of it can put variance on a shelf face that a constant did not
// already have. The shading factor's p95/p50 is 1.28 with the term and 1.28
// without it.
//
// ROUND 14 — THE REASON THIS TERM STAYS WAS WRITTEN DOWN WRONG, AND A WRONG
// REASON ABOVE WORKING CODE IS HOW THE NEXT ROUND TALKS ITSELF OUT OF A CORRECT
// CHANGE. It said the diffuse stays because "it is what the specular hangs
// off". It is not. chopLampRow computes dif and spec from the same a / H / d
// and then returns them as INDEPENDENT components; uLampCfg.x scales only .x.
// Re-verified this round on one page load, debug channel 6, three captures:
//
//     lampGain 0.45  md5 ef0c5a8c...     0.00  md5 ef0c5a8c...     0.45  same
//     0 pixels differ, 0 levels, on a 1280x720 plate
//
// The specular is byte-identical with the diffuse switched off entirely. Set
// this gain to 0 and every lamp highlight in the building is still there.
//
// So the honest reasons, and they are enough: it is the real source geometry —
// the light is emitted where the fixtures actually hang, which is what let
// round 13 take the key down from a sun to something a drop ceiling could be —
// and it is not free, it is worth a mean +5.7 levels and a p95 of +20 on a lit
// aisle plate. It is simply EXPOSURE-EQUIVALENT, which is a statement about
// what could stand in for it, not a statement that it does nothing. Round 13's
// actual gain was PKG_SAT and this function's .y, not its .x.
//
// EVERY CONSTANT IS PASSED IN, NONE IS COPIED. uLampGeo/uLampCfg are filled from
// ../store.js's own ROW_X0, ROW_P, ROW_HX, ROW_HZ, LY and AP_W — the same
// variables lightRow() is called with. Moving an aisle moves the geometry, the
// ceiling's row lift, the floor's reflection and this light together, because
// there is one set of numbers and four readers. That is the CLAUDE.md rule, and
// the ceiling row-lift block sixty lines above lightRow() is the precedent.

// The recessed troffer's photometric cutoff: how much of the lamp is still
// visible at a ray whose cosine to the fixture's own downward normal is ct.
// This is the SAME curve as floor.js's chopLensCut and the same one the lens
// material in ../store.js applies to the fixture itself. A prismatic lens goes
// to grazing transmission past about 60 degrees off nadir and then the door
// flange takes the far tube. Round 10 established it; a second copy of it that
// could drift is exactly what this file is not allowed to grow.
float chopLampCut( float ct ) {
  return 0.145 + 0.855 * smoothstep( 0.055, 0.62, clamp( ct, 0.0, 1.0 ) );
}

// One row. .x = diffuse irradiance, .y = specular lobe about R.
vec2 chopLampRow( float xr, vec3 P, vec3 N, vec3 R, float wantSpec ) {
  float a = xr - P.x;
  float H = uLampGeo.z - P.y;
  if ( H <= 0.05 ) return vec2( 0.0 );
  float d2 = a * a + H * H;
  float d = sqrt( d2 );
  // IS THE ROW EVEN VISIBLE FROM HERE. One mip-2 tap at 60% of the way across,
  // against the height the ray to the lamp has reached by then. Without it the
  // bottom deck of a gondola is lit by rows three aisles away that its own
  // opposite gondola is standing in front of — which is the same class of
  // mistake as the round-7 prop list, made in the other direction.
  float sx = clamp( a, -3.2, 3.2 ) * 0.6;
  float hb = chopFldTop( P.xz + vec2( sx, 0.0 ), 2.0 );
  float rayY = P.y + H * ( abs( sx ) / max( abs( a ), 1e-3 ) );
  float open = 1.0 - smoothstep( rayY - 0.12, rayY + 0.26, hb );

  float dif = H * max( 0.0, N.x * a + N.y * H ) / ( d2 * d );
  dif *= chopLampCut( H / d );

  float spec = 0.0;
  if ( wantSpec > 0.0 ) {
    // Where along an infinite line does the reflection vector come closest?
    // With A = ( a, H, 0 ) and the line running along +Z, maximising
    // ( R.A + t R.z ) / sqrt( |A|^2 + t^2 ) gives t* = R.z |A|^2 / ( R.A ).
    // A row BEHIND the reflection ( R.A <= 0 ) simply has no highlight.
    float RA = R.x * a + R.y * H;
    if ( RA > 0.0 ) {
      float t = R.z * d2 / RA;
      float r = sqrt( d2 + t * t );
      float ct = ( RA + t * R.z ) / r;
      spec = pow( clamp( ct, 0.0, 1.0 ), uLampCfg.y ) * chopLampCut( H / r );
    }
  }
  return vec2( dif, spec ) * open;
}

// The five nearest rows. Beyond +-2 pitches a row is either behind the shading
// point's own gondola or behind the one across the aisle, and the open test
// would zero it anyway at four times the cost.
vec2 chopLamp( vec3 P, vec3 N, vec3 V ) {
  float k0 = floor( ( P.x - uLampGeo.x ) / uLampGeo.y + 0.5 );
  vec3 R = reflect( -V, N );
  float cx = uLampGeo.x + uLampGeo.w;          // lattice centre, derived not typed
  vec2 acc = vec2( 0.0 );
  for ( int i = -2; i <= 2; i ++ ) {
    float xr = uLampGeo.x + ( k0 + float( i ) ) * uLampGeo.y;
    float inX = 1.0 - smoothstep( uLampGeo.w, uLampGeo.w + 1.1, abs( xr - cx ) );
    if ( inX <= 0.0 ) continue;
    acc += chopLampRow( xr, P, N, R, uLampSpec ) * inX;
  }
  // ...and the rows stop before the front and back walls, the same
  // HALF + 2.1 lightRow() is called with.
  acc *= 1.0 - smoothstep( uLampCfg.z, uLampCfg.z + 1.4, abs( P.z ) );
  return acc;
}

// The mirror's view of the same field. Returns rgb = what stands at p in the
// band a reflection sees, a = how much of the ray's lobe that column fills at
// height y. One function so the floor and the glass cannot disagree about what
// is standing in the room, the way the analytic gondola test and the
// hand-placed prop list used to.
// ROUND 10 — OCCUPANCY AS A MIRROR SEES IT, which is not the same question as
// occupancy as the FLOOR sees it, and conflating the two is what kept the
// freezer glass at half the real bay-to-bay variance.
//
// The height channel deliberately does not carry hanging signage (see box()),
// so a reflected ray climbing toward an aisle blade finds height 0 at that
// column, registers no hit, and falls through to the analytic room average —
// a wash. But the HIGH COLOUR BAND does carry it now, and its alpha is exactly
// "how much of 1.30-3.80 m is filled here", which is the occupancy a mirror
// wants. The two populations separate cleanly on that number: an aisle sign
// fills 1.30 m of the 1.40 m normalisation and reads ~0.93, a gondola tops out
// at 2.05 m and reads ~0.54, so the gate sits between them and a header is
// never mistaken for a sign hanging over the aisle in front of it.
// ---------------------------------------------------------------------------
// THE ENTRANCE, AS A LIGHT SOURCE. ROUND 17.
//
// Blind test 9, still open going into this round: "a 4 m glass wall on a lit
// exterior contributes ZERO light to the floor in front of it." Exactly true,
// and the reason is structural rather than a missed constant — the storefront
// is a textured PLATE. tex.js paints blown sky, a treeline and a car park onto
// it, signs.js gives it a gloss, and not one photon of it reaches anything,
// because a MeshBasic quad has no more effect on the room than a poster does.
//
// WHY THIS IS NOT A three.js LIGHT. Two reasons, and the second is the one
// that decides it:
//
//   * A PointLight or a SpotLight at the door adds a light-loop iteration to
//     EVERY lit fragment in a 47 x 38 m building to illuminate the eight
//     metres in front of two doors. This term costs one compare outside its
//     reach — P.z > plane + reach is spatially coherent, so the branch is
//     free where the light is not.
//   * Neither of them is occluded by anything. The checkout run stands 1.4 m
//     from Door 1 and a real doorway wash stops dead at it. The field ALREADY
//     holds every stand, cart and bollard in the building at 23 mm, so three
//     taps up the ray toward the aperture buy a shadow the light loop cannot
//     have without a shadow map.
//
// THE FALL-OFF IS A WINDOW'S, NOT A POINT'S. A source of finite height h seen
// from distance d subtends an angle that goes as h/(h+d), and irradiance as
// the square of it — so it is flat within a metre of the glass and down to a
// quarter of that at d = h. An inverse-square from a point at the door plane
// would instead be singular at the threshold, which is the wrong shape at
// exactly the distance the player stands.
float chopDayOne( vec4 A, vec3 P, vec3 N ) {
  float d = P.z - A.z;
  float dz = max( d, 0.30 );
  float k = A.w / ( A.w + dz );
  // lateral: full strength inside the opening, with a shoulder that widens as
  // the wash spreads into the room
  float lat = 1.0 - smoothstep( A.y, A.y + 0.85 + dz * uDayCfg.z, abs( P.x - A.x ) );
  if ( lat <= 0.0 ) return 0.0;
  vec3 C = vec3( A.x, A.w * 0.55, A.z );
  vec3 L = normalize( C - P );
  float nl = max( 0.0, dot( N, L ) );
  if ( nl <= 0.0 ) return 0.0;
  float vis = 1.0;
  for ( int i = 0; i < 3; i++ ) {
    vec3 Q = mix( P, C, ( float( i ) + 0.6 ) * 0.28 );
    float h = chopFldTop( Q.xz, 2.0 );
    vis *= 1.0 - 0.62 * smoothstep( Q.y - 0.28, Q.y + 0.12, h );
  }
  return k * k * lat * nl * vis;
}
vec3 chopDay( vec3 P, vec3 N ) {
  if ( uDayCfg.x <= 0.0 ) return vec3( 0.0 );
  float d = P.z - uDayA.z;
  if ( d < -0.6 || d > uDayCfg.y ) return vec3( 0.0 );
  return uDayCol * ( uDayCfg.x
    * ( chopDayOne( uDayA, P, N ) + chopDayOne( uDayB, P, N ) ) );
}

float chopFldFill( vec2 p, float y, float lod ) {
  vec4 s = chopFldAt( p, lod );
  float h = s.a * uFldCfg.x;
  float solid = ( 1.0 - smoothstep( h - 0.10, h + 0.06, y ) ) * step( 0.012, s.a );
  float hi = textureLod( uFldHi, chopFldUV( p ), max( 0.0, lod - 1.0 ) ).a;
  float hang = smoothstep( 0.66, 0.88, hi )
             * smoothstep( 2.25, 2.95, y ) * ( 1.0 - smoothstep( 3.70, 4.30, y ) );
  return max( solid, hang );
}

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
  vec3 chopN = normalize( vAoN );
  vec2 chopA = chopAO( vAoW, chopN );
  vec2 chopLp = chopLamp( vAoW, chopN, normalize( cameraPosition - vAoW ) );
  gl_FragColor.rgb *= chopA.x;
  // The fixtures. Diffuse takes the surface's own pigment; the specular is the
  // lamp's own colour, because a highlight is an image of the source and not of
  // the paint under it. Both ride the same visibility the rest of the shading
  // does — a facing sealed inside a cavity does not get lit by a troffer.
  gl_FragColor.rgb += diffuseColor.rgb * uLampCol * ( chopLp.x * uLampCfg.x * chopA.x );
  gl_FragColor.rgb += uLampCol * ( chopLp.y * uLampSpec * uLampCfg.w * chopGlossX * chopA.x );
  gl_FragColor.rgb += diffuseColor.rgb * uFldBounce * ( chopA.y * uFldCfg.w );
  // ROUND 14 — the run across the aisle. It rides chopA.x for the same reason
  // the lamp terms do: a facing sealed inside a cavity is not lit by anything
  // out in the aisle. It does NOT ride chopA.y, which is the floor, nor is it
  // any part of it: chopAO's bounce lobe points DOWN at open floor and this
  // one points sideways at what is standing. Different hemisphere, different
  // source, no double count.
  gl_FragColor.rgb += diffuseColor.rgb * chopAisle( vAoW, chopN ) * chopA.x;
  // The doorway. uFldLit for the same reason the aisle bounce is not on a
  // MeshBasic: daylight arriving is light, and a printed sign face has no
  // lighting to add it to.
  gl_FragColor.rgb += diffuseColor.rgb * chopDay( vAoW, chopN ) * uFldLit;
  // 1 = visibility, 2 = bounce, 3 = field height under the fragment, 4 = the
  // contact core on its own, which is the term round 9 added and the one worth
  // being able to look at in isolation, 5 = the lamp diffuse, 6 = the lamp
  // specular, 7 = the round-14 aisle bounce. Driven from the console:
  //   __CHOP.scene.userData.chopField.uniforms.uFldDbg.value = 1
  if ( uFldDbg > 0.5 ) {
    gl_FragColor.rgb = uFldDbg < 1.5 ? vec3( chopA.x )
      : ( uFldDbg < 2.5 ? vec3( chopA.y )
      : ( uFldDbg < 3.5 ? vec3( chopFldTop( vAoW.xz, 0.0 ) / uFldCfg.x )
      : ( uFldDbg < 4.5 ? vec3( 1.0 - clamp( ( chopCore( vAoW, chopN, 0.7 ) - uFldCore.y )
          * uFldCore.z, 0.0, 1.0 ) )
      : ( uFldDbg < 5.5 ? vec3( chopLp.x * uLampCfg.x )
      : ( uFldDbg < 6.5 ? vec3( chopLp.y )
      : ( uFldDbg < 7.5 ? chopAisle( vAoW, chopN ) * chopA.x
                        : chopDay( vAoW, chopN ) ) ) ) ) ) );
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
    // PER-MATERIAL, and deliberately not in the shared bag. A lamp highlight is
    // a property of the finish — shrink film, a coated carton, a can, a PET
    // bottle — not of the room, and the floor and the freezer glass already
    // trace the same rows themselves (floor.js chopLight), so handing them a
    // second copy would double the one thing in the frame that is easiest to
    // over-cook. Assigning AFTER the shared bag gives this material its own
    // uniform object rather than aliasing everybody else's.
    sh.uniforms.uLampSpec = { value: m.userData.chopLampSpec ?? 0 };
    m.userData.chopLampU = sh.uniforms.uLampSpec;
    // ROUND 14, same reasoning and the same per-material scope. Read off the
    // material's TYPE, not off a name list: an unlit material's texel value is
    // already its final colour, so a bounce term on one is not light arriving,
    // it is the print getting brighter than it prints. applyAO's skip rules are
    // properties of the material for the same reason.
    sh.uniforms.uFldLit = { value: m.isMeshBasicMaterial ? 0 : 1 };
    m.userData.chopLitU = sh.uniforms.uFldLit;
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
      // ROUND 10 — reach 1.0 -> 1.90, and skirtR 0.34 -> 0.46 with it, because
      // the two have to tile or a gap opens between them. Swept live against
      // reference/store_04's freezer plinth, both images at 1280 px so the
      // pixel counts are comparable, contact row snapped to the local minimum
      // in BOTH so the two are measured the same way:
      //   px from the line      0     4     8    12    16    24    32    48
      //   REAL store_04       0.02  0.08  0.16  0.15  0.17  0.34  0.39  0.65
      //   round 9             0.02  0.07  0.10  0.21  0.39  0.60  0.73  0.90
      //   reach 1.0           0.02  0.13  0.11  0.14  0.26  0.42  0.61  0.89
      //   reach 1.90          0.02  0.12  0.09  0.10  0.18  0.31  0.46  0.81
      // r90 47 -> 62 against a real 68. 1.90 with skirtR 0.58 gets the cooler
      // to 66 but costs the GONDOLA four pixels, and the gondola class was
      // already at parity, so 0.46 is the pair that improves one without
      // paying for it out of the other.
      value: new THREE.Vector4(opts.core ?? 0.84, opts.coreBias ?? 0.020,
        opts.coreGain ?? 2.20, opts.coreReach ?? 1.90),
    },
    uFldSk: {
      value: new THREE.Vector4(opts.skirtR ?? 0.46, opts.skirtRatio ?? 1.95, 0, 0),
    },
    // ROUND 10. cavity strength / crevice strength / - / crevice height.
    // cav 0.78: a shelf underside 1 m up inside a 2.05 m gondola lands at
    // 0.22 of open, which is what puts the darkest pixels in an aisle frame
    // under the shelf lip where the reference has them. Swept at 0.60 / 0.78 /
    // 0.90 — 0.90 closes the bottom two decks into a single black band and
    // loses the deck edges with them, which is the round-8 fault coming back.
    // crev 0.72 over 0.090 m: measured against reference/store_04's freezer
    // sill, which is LIT cream to within about 12 mm of the floor and then
    // falls to the darkest value in the frame.
    uFldCav: {
      // .z is ROUND 14's cavity reflectance — the rho in the integrating-cavity
      // lift above chopAO's skirt. 0 reproduces round 9 exactly; it is a
      // reflectance, so the only defensible range is what shelf steel and
      // coated board actually reflect.
      value: new THREE.Vector4(opts.cav ?? 0.78, opts.crev ?? 0.72,
        opts.cavRho ?? 0, opts.crevH ?? 0.090),
    },
    uFldBounce: { value: new THREE.Color(opts.bounceCol ?? 0xb9a887) },
    // ROUND 17 — the entrance. Defaults are a NO-OP (gain 0), on the same
    // principle as uLampGeo above: a default aperture here would be a second
    // copy of where the doors are, and ../store.js is the only file that knows
    // what it actually built. `day` is [cx, halfW, planeZ, headY] per door.
    uDayA: { value: new THREE.Vector4(...((opts.day && opts.day[0]) ?? [0, 0, 0, 1])) },
    uDayB: { value: new THREE.Vector4(...((opts.day && opts.day[1]) ?? [0, 0, 0, 1])) },
    uDayCfg: {
      value: new THREE.Vector4(opts.day ? (opts.dayGain ?? 1.0) : 0,
        opts.dayReach ?? 9.5, opts.daySpread ?? 0.42, 0),
    },
    uDayCol: { value: new THREE.Color(opts.dayCol ?? 0xbcd2f0) },
    // ROUND 13 — THE FIXTURES. Every one of these six numbers is handed in by
    // ../store.js from the variables lightRow() is actually called with; there
    // is no default row plan here on purpose, because a default is a second
    // copy that cannot be told when the first one moves. lampGeo missing means
    // "no lamps", not "assume the round-13 layout".
    uLampGeo: { value: new THREE.Vector4(...(opts.lampGeo ?? [0, 1, -1, 0])) },
    uLampCfg: {
      // gain / specular exponent / row half-span z / -
      //
      // GAIN. Calibrated, not chosen: the term is switched on with the key and
      // the ambient held, the product mask's shading factor is read off the
      // stage ladder, and the key is then taken down until whole-frame median
      // L* returns to where it was. See the round-13 note in ../store.js for
      // the sweep and what each step cost.
      //
      // EXPONENT. Not free either. The aperture is 0.60 m wide (AP_W) and a
      // facing sits about 4 m from the row over the aisle, so the source
      // subtends 8.6 degrees. pow( cos, n ) falls to half at
      // acos( 0.5^(1/n) ), which is 8.7 degrees at n = 60. A tighter lobe
      // draws a lamp narrower than the lamp is.
      // .w is a GLOBAL scale on every material's specular gain, and it exists
      // because the per-material one is not a usable control surface: the
      // package materials are cloned per batch, so walking the scene and
      // writing each clone's own uniform silently misses most of them. That
      // cost an hour of this round — two sweep rows came back byte-identical
      // and a "specular off" control was not off. One scalar everybody
      // multiplies by cannot have that failure mode.
      value: new THREE.Vector4(opts.lampGain ?? 0, opts.lampExp ?? 60,
        opts.lampSpanZ ?? 1e-3, opts.lampSpecScale ?? 1),
    },
    uLampCol: { value: new THREE.Color(opts.lampCol ?? 0xfff6ea) },
    // Shared DEFAULT only. patchAO overwrites this per material — see there.
    uLampSpec: { value: 0 },
    // ROUND 14 — THE RUN ACROSS THE AISLE. See chopAisle for the form-factor
    // derivation; these are the two numbers it needs and neither is a taste
    // value.
    //
    // .x is the room's irradiance at facing height, in the same units the rest
    // of this shader adds in — the term computes form factor x the blocker's
    // own albedo (read from the field, not typed) and this is the third factor,
    // how brightly that blocker is lit. It is ONE global scalar and that is
    // deliberate: the round-13 note above uLampCfg.w records an hour lost to
    // per-material uniforms on materials three clones per batch, where a
    // "specular off" control was not off. A single scalar everybody multiplies
    // cannot have that failure mode, so `= 0` here really is the ablation.
    //
    // .y is the march scale and ../store.js hands it AISLE_GAP itself, so the
    // four taps land at 0.25 / 0.65 / 1.05 / 1.45 of an aisle width — a shelf
    // back right behind the facing, two inside the aisle, one exactly on the
    // opposite run, one past it. Widen the aisle in config.js and the march
    // widens with it; there is no 4.0 typed anywhere in this file.
    uFldSide: {
      value: new THREE.Vector4(opts.side ?? 0, opts.sideStep ?? 1.5, 0, 0),
    },
    // Shared DEFAULT only, same as uLampSpec. 1 so that a material which somehow
    // reaches this shader without going through patchAO behaves like a lit one;
    // the unlit case is the exception and it is stated explicitly there.
    uFldLit: { value: 1 },
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
// ROUND 16 — THE SIGNAGE HAD THE SAME BUG THE PACKAGING HAD, AND IT WAS
// CALLED BLIND BEFORE THE CRITIC OPENED ANY SOURCE.
//
// The r16 brief: "promoDeal(seed) and promoCard(g, W, H, seed, opts) take NO
// DEPARTMENT. The `save` branch fires on 16% of all deals and prints
// SAVE $D.CC PER LB — a weighed-goods price — over SNACKS / CHIPS. FROZEN ONLY
// and PLUS DEPOSIT sit in the qualifier pool with no department gate."
//
// Which is exactly the r15 packaging defect one surface along: a correct
// grammar sampled without reference to what it is describing. And it is the
// worse half of the cue — eleven of the r15 critic's eighteen render calls came
// off a hanging sign or promo tag.
//
// Qualifiers split into ones any department can print and ones that are a claim
// about the goods. A gate here is a physical fact, not a taste call:
//   PLUS DEPOSIT   only where there is a deposit container   -> soda
//   FROZEN ONLY    only where the goods are frozen           -> frozen
//   PER LB         only where the goods are sold by weight   -> nothing here
const QUAL_ANY = [
  'WITH CARD', 'LIMIT 4', 'LIMIT 2', 'MIX OR MATCH', 'SELECT VARIETIES',
  'WHILE SUPPLIES LAST', 'MEMBER PRICE', 'EVERY DAY', 'SAVE MORE',
  'LIMIT 6 PER VISIT', 'ASSORTED SIZES', 'THIS WEEK ONLY', 'NO CARD NEEDED',
  'SELECT SIZES', 'IN STORE ONLY',
];
const QUAL_DEPT = {
  soda:   ['PLUS DEPOSIT', 'PLUS CRV', 'SINGLES ONLY'],
  frozen: ['FROZEN ONLY', 'KEEP FROZEN'],
  paper:  ['BULK PACK ONLY'],
  health: ['SEE PHARMACIST', 'ADULT USE ONLY'],
};

// How a saving is quoted, per department. THE POINT OF THE WHOLE GATE:
// `PER LB` is a weighed-goods unit and this store has no weighed department —
// no butcher, no produce scale, no deli counter — so it is unreachable, and
// SIGN_GAPS below says so out loud rather than leaving it to be discovered.
// If a future round adds a service counter, mark it weighed and PER LB is
// live again for that department and only that department.
const DEPT_UNIT = {
  soda:      ['ON 2', 'PER 12 PK', 'EACH'],
  frozen:    ['ON 2', 'EACH', 'PER PKG'],
  paper:     ['ON 2', 'EACH', 'PER PACK'],
  health:    ['ON 2', 'EACH'],
  bakery:    ['ON 2', 'EACH', 'PER PKG'],
  canned:    ['ON 2', 'EACH', 'ON 4'],
  pasta:     ['ON 2', 'EACH', 'ON 4'],
  snacks:    ['ON 2', 'EACH', 'PER BAG'],
  breakfast: ['ON 2', 'EACH', 'PER BOX'],
};
const WEIGHED = {};           // dept -> true. Empty on purpose; see above.
const UNIT_ANY = ['ON 2', 'EACH'];
const HEADS = [
  'LOW PRICE', 'HOT BUY', 'SAVE', 'DEAL', 'PRICE DROP', 'MANAGER SPECIAL',
  'ROLLBACK', 'CLUB DEAL', 'FRESH DEAL', 'MARKDOWN', 'VALUE PICK', 'BIG SAVE',
  'WEEKLY WIN', 'STOCK UP', 'BUY MORE SAVE', 'CLEARANCE', 'NEW LOW', 'BONUS BUY',
];

// A deal, drawn from the grammar. `seed` makes it deterministic per site.
// `dept` is a DEPTS key or null. Null means a genuinely department-free site —
// the front-of-store wall boards and the perimeter decor band advertise the
// whole shop — and it draws only from the ungated pools, which is the honest
// behaviour rather than a fallback.
export function promoDeal(seed, dept) {
  const rng = makeRng(seed * 2654435761 + 0x9e37);
  const P = (a) => a[Math.floor(rng() * a.length) % a.length];
  const money = (d, c) => '$' + d + '.' + String(c).padStart(2, '0');
  const roll = rng();
  const head = P(HEADS);
  const dq = (dept && QUAL_DEPT[dept]) || [];
  // department qualifiers are a third of the pool where they exist, so they
  // read as characteristic of that aisle rather than as a rare curiosity
  const qual = (dq.length && rng() < 0.34) ? P(dq) : P(QUAL_ANY);
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
    const unit = WEIGHED[dept] ? 'PER LB'
      : P((dept && DEPT_UNIT[dept]) || UNIT_ANY);
    return { head: 'SAVE', big: money(d, c), sub: unit, qual, kind: 'save' };
  }
  const d = P(DOLLARS), c = P(CENTS);
  return { head, big: money(d, c), sub: rng() < 0.5 ? 'EACH' : 'EA', qual, kind: 'price' };
}

// The signage half of copyCheck(): exhaustively sweep the grammar and report any
// gated string reaching a department it does not belong to. Named departments
// only — a null-dept site can never emit one by construction, which this also
// proves rather than assuming.
export function signCheck(depts, n = 4000) {
  const bad = [];
  const gated = new Map();
  for (const d of Object.keys(QUAL_DEPT)) for (const q of QUAL_DEPT[d]) gated.set(q, d);
  const seen = new Set();
  for (const dept of [...depts, null]) {
    for (let i = 0; i < n; i++) {
      const deal = promoDeal(i * 7919 + 13, dept);
      const owner = gated.get(deal.qual);
      if (owner && owner !== dept) {
        bad.push('"' + deal.qual + '" belongs to ' + owner + ' but reached '
          + (dept || 'a department-free site'));
      }
      if (deal.sub === 'PER LB' && !WEIGHED[dept]) {
        bad.push('"SAVE ' + deal.big + ' PER LB" — a weighed-goods price — reached '
          + (dept || 'a department-free site') + ', which sells nothing by weight');
      }
      if (owner) seen.add(deal.qual);
    }
  }
  // ...and the other direction: a gated string nothing can print is dead copy.
  for (const q of gated.keys()) {
    if (!seen.has(q) && depts.includes(gated.get(q))) bad.push('unreachable qualifier: ' + q);
  }
  return bad;
}

// Stated, not discovered. Round 15's copyGaps() is the pattern: a gap that is
// WRITTEN DOWN is a decision, and a gap that is found later is a bug.
export function signGaps() {
  return {
    weighedDepartments: Object.keys(WEIGHED),
    perLbReachable: Object.keys(WEIGHED).length > 0,
    gatedQualifiers: Object.fromEntries(Object.entries(QUAL_DEPT)),
    note: 'PER LB is unreachable because this store has no scale — no butcher, '
        + 'produce or deli counter. Mark a department in WEIGHED to bring it back.',
  };
}
