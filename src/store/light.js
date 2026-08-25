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
//   makeField(THREE, box)        -> Field
//   field.box(x,z,w,l,y0,y1,hex) -> stamp one solid
//   field.finish(THREE)          -> { tex, uniforms }
//   applyAO(THREE, root, U, opt) -> patch every opaque material under root
//   FIELD_GLSL                   -> the shared sampler + chopAO()

import { makeRng } from './kit.js';

// Heights above this saturate. A gondola is 2.05 m, a pallet stack 2.4, a
// promo header 2.6; nothing that matters for ground occlusion is taller, and
// capping keeps the whole range in one byte at 13 mm resolution.
export const FIELD_H = 3.40;
// The band of an object a floor reflection actually shows. A mirrored ray
// leaving the floor at a few degrees hits whatever is in front of it low down,
// so the colour a column contributes to the mirror is weighted to its shins,
// not to its average.
const REFL_LO = 0.04, REFL_HI = 1.45;

export class Field {
  constructor(minX, minZ, spanX, spanZ, N = 1024) {
    this.N = N;
    this.minX = minX; this.minZ = minZ; this.spanX = spanX; this.spanZ = spanZ;
    this.kx = N / spanX; this.kz = N / spanZ;
    this.top = new Float32Array(N * N);
    this.cr = new Float32Array(N * N);
    this.cg = new Float32Array(N * N);
    this.cb = new Float32Array(N * N);
    this.cw = new Float32Array(N * N);
    this.n = 0;
  }

  // One axis-aligned solid. w/l are FULL extents about (x,z); y0..y1 vertical.
  // r/g/b are LINEAR (three's working space) — everything upstream of here is
  // a THREE.Color, and averaging colour in linear and encoding once at the end
  // is the only order that does not lighten every blend. Pass r < 0 for
  // something that occludes but has no useful colour, e.g. a bare wall volume.
  box(x, z, w, l, y0, y1, r, g, b) {
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
    // colour weight = how much of the reflected band this solid occupies
    let cw = Math.max(0, Math.min(y1, REFL_HI) - Math.max(y0, REFL_LO));
    if (!(r >= 0)) cw = 0;
    const top = this.top, CR = this.cr, CG = this.cg, CB = this.cb, CW = this.cw;
    for (let j = j0; j < j1; j++) {
      const row = j * N;
      for (let i = i0; i < i1; i++) {
        const k = row + i;
        if (h > top[k]) top[k] = h;
        if (cw > 0) { CR[k] += r * cw; CG[k] += g * cw; CB[k] += b * cw; CW[k] += cw; }
      }
    }
    this.n++;
  }

  // sRGB hex convenience for the call sites that still think in swatches.
  boxHex(x, z, w, l, y0, y1, hex) {
    if (hex == null) return this.box(x, z, w, l, y0, y1, -1, 0, 0);
    const d = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return this.box(x, z, w, l, y0, y1,
      d(((hex >> 16) & 255) / 255), d(((hex >> 8) & 255) / 255), d((hex & 255) / 255));
  }

  finish(THREE, emptyHex = 0xbdb3a0) {
    const N = this.N, px = new Uint8Array(N * N * 4);
    const er = (emptyHex >> 16) & 255, eg = (emptyHex >> 8) & 255, eb = emptyHex & 255;
    const top = this.top, CR = this.cr, CG = this.cg, CB = this.cb, CW = this.cw;
    const inv = 255 / FIELD_H;
    // linear -> sRGB, 1024 entries, so the encode is a lookup not 3M pows
    const LUT = new Uint8Array(1025);
    for (let i = 0; i <= 1024; i++) {
      const v = i / 1024;
      LUT[i] = Math.round(255 * (v <= 0.0031308 ? v * 12.92
        : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));
    }
    const enc = (v) => LUT[v <= 0 ? 0 : (v >= 1 ? 1024 : (v * 1024) | 0)];
    for (let k = 0; k < N * N; k++) {
      const o = k * 4, w = CW[k];
      if (w > 0) {
        px[o] = enc(CR[k] / w); px[o + 1] = enc(CG[k] / w); px[o + 2] = enc(CB[k] / w);
      } else { px[o] = er; px[o + 1] = eg; px[o + 2] = eb; }
      px[o + 3] = Math.min(255, top[k] * inv);
    }
    const tex = new THREE.DataTexture(px, N, N, THREE.RGBAFormat);
    // The colour channels are authored sRGB swatches; the height in alpha is
    // linear and three does not touch alpha, so one colourSpace flag is right
    // for both.
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;      // the far AO taps read coarse mips
    tex.needsUpdate = true;
    this.tex = tex;
    return tex;
  }

  // Texels per metre, averaged. Drives the LOD the spiral asks for.
  get density() { return (this.kx + this.kz) * 0.5; }

  // Debug: the field as a data URL, height in luminance. Not shipped; called
  // from the console when a stamp looks like it is missing.
  debugURL(mode = 'h') {
    const N = this.N, c = document.createElement('canvas');
    c.width = c.height = N;
    const g = c.getContext('2d'), im = g.createImageData(N, N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i, o = ((N - 1 - j) * N + i) * 4, w = this.cw[k];
        if (mode === 'h') {
          const v = Math.min(255, this.top[k] / FIELD_H * 255);
          im.data[o] = im.data[o + 1] = im.data[o + 2] = v;
        } else {
          im.data[o] = w > 0 ? this.cr[k] / w * 255 : 0;
          im.data[o + 1] = w > 0 ? this.cg[k] / w * 255 : 0;
          im.data[o + 2] = w > 0 ? this.cb[k] / w * 255 : 0;
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
uniform vec4 uFldMap;      // 1/spanX, minX, 1/spanZ, minZ
uniform vec4 uFldCfg;      // FIELD_H, texels/m, aoStrength, bounceStrength
uniform vec3 uFldBounce;   // colour of the light coming back off the floor
uniform float uFldDbg;     // 0 off, 1 visibility, 2 bounce, 3 raw height

vec2 chopFldUV( vec2 p ) {
  return vec2( ( p.x - uFldMap.y ) * uFldMap.x, ( p.y - uFldMap.w ) * uFldMap.z );
}
vec4 chopFldAt( vec2 p, float lod ) {
  return textureLod( uFld, chopFldUV( p ), lod );
}
float chopFldTop( vec2 p, float lod ) {
  return chopFldAt( p, lod ).a * uFldCfg.x;
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
const int CHOP_AZ = 6;
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
  // World-space rotation of the fan, quantised to ~0.35 m. It is a function of
  // POSITION, not of screen space, so it is rock steady under camera motion;
  // quantising it coarsely means it varies slowly across a surface, which
  // turns the six-fold banding into a soft wobble instead of per-pixel noise.
  float rot = fract( sin( dot( floor( P.xz * 2.9 ), vec2( 12.9898, 78.233 ) ) )
    * 43758.5453 ) * 6.28318;
  for ( int a = 0; a < CHOP_AZ; a ++ ) {
    float ang = rot + float( a ) * ( 6.28318 / float( CHOP_AZ ) );
    vec2 d = vec2( cos( ang ), sin( ang ) );
    float horizon = 0.0;                    // max sin^2(theta) along this ray
    float open = 0.0;                       // mean "lit floor visible" along it
    float ow = 0.0;
    for ( int s = 0; s < 4; s ++ ) {
      float rad = 0.080 * pow( 3.20, float( s ) );      // 0.08 .. 2.62 m
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
  float vis = 1.0 - uFldCfg.z * ( occ / max( wsum, 0.05 ) );
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
  // 1 = visibility, 2 = bounce, 3 = field height under the fragment. Driven
  // from the console: __CHOP.scene.userData.chopField.uniforms.uFldDbg.value=1
  if ( uFldDbg > 0.5 ) gl_FragColor.rgb = uFldDbg < 1.5 ? vec3( chopA.x )
    : ( uFldDbg < 2.5 ? vec3( chopA.y ) : vec3( chopFldTop( vAoW.xz, 0.0 ) / uFldCfg.x ) );
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
    uFldMap: {
      value: new THREE.Vector4(1 / field.spanX, field.minX, 1 / field.spanZ, field.minZ),
    },
    uFldCfg: {
      value: new THREE.Vector4(FIELD_H, field.density,
        opts.ao ?? 0.90, opts.bounce ?? 0.34),
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
