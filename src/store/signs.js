// OWNER: builder-store. PRINTED SURFACES — how type behaves when it is
// photographed rather than blitted.
//
// ROUND 7. Round 2's win was putting real printed type on every sign, tag and
// package. Blind test 6 says that type is now the single loudest tell in the
// store, and the reason is worth stating precisely because it is the opposite
// of the usual fault:
//
//   "In img_03 a 4-inch 99c tag at ~20 m is perfectly legible. In img_08
//    'SALE 2 FOR $5' has razor edges and a dead-flat fill. In a real photo
//    that tag is 3 pixels tall and gone, and even a near sign carries a
//    specular glare band from the ceiling strips across its plastic face."
//
// Three separate things are wrong and each has its own mechanism.
//
// 1. FALL-OFF. The tag soup was built with sharpen(-1.0) and the blades with
//    sharpen(-0.6). A negative LOD bias is a deliberate instruction to the
//    hardware to sample a mip level finer than the pixel footprint, i.e. to
//    UNDO exactly the distance blur we now want. It was added in round 3 for
//    the packages, where it is right — a package face is a big surface whose
//    print survives to five or six metres in a photograph — and it was then
//    copied onto the tags, where it is wrong, because a 100 mm tag at twenty
//    metres subtends three pixels and there is nothing left to sharpen.
//    A LOD bias alone would not do it either: the anisotropic filter is fed
//    the MINOR axis of the footprint, and a tag rail seen down an aisle has a
//    tiny minor axis, so aniso 16 keeps pulling near-full-resolution texels
//    along the rail whatever the bias is. So the fall-off is EXPLICIT: a
//    second tap at a fixed coarse LOD, mixed in on view distance. Past uFar a
//    tag is literally the low-frequency colour blocks of its own artwork — a
//    red header over a white field with a dark smudge where the numeral was —
//    which is what a real three-pixel tag is.
//
// 2. GLARE. Every one of these surfaces is glossy: laminated card, acrylic
//    lightbox, polypropylene tag, PVC blade. Under a ceiling of continuous
//    strip fixtures they all carry a moving specular band, and its absence is
//    what makes the fills read "dead flat". This is a real mirror, not a
//    painted gradient: reflect the view ray about the panel normal, intersect
//    the ceiling plane, and ask the SAME analytic light field the floor and
//    the freezer glass ask. It therefore cannot disagree with the fixtures
//    overhead, it tracks the camera, and it lands as a BAND because the
//    reflected ceiling point sweeps across the fixture rows as you run up the
//    face — a hanging sign at 3.32 m has only 1.9 m of headroom, so a few
//    centimetres of face covers metres of ceiling.
//
//    Shelf-edge rails get a normal tilted up by uSignTilt. That is not a
//    fudge: a real price-tag channel is extruded at 10-20 degrees off vertical
//    so the tag faces the shopper's eye, which is exactly why the rails are
//    the brightest horizontal lines in a supermarket photograph.
//
// 3. SELF-SHADOW. Every hanging sign has a top rail or a return that stands
//    proud of its face and shades the top of it, and every panel is lit from a
//    strip directly above so its foot is dimmer than its middle. Both are a
//    couple of smoothsteps over the in-cell v coordinate.
//
// Contract: signMat(THREE, map, U, opts) -> THREE.MeshBasicMaterial.
//   U    the floor's shared uniform bag (uCeilH / uPitch / uFixPitch / ...).
//   opts { color, grid:[cols,rows], near, far, lod, gloss, tilt, top, foot,
//          side, glare, name }
//        grid [0,0] means "this quad's v is already 0..1 over the panel"
//        (the rails, whose u is a running length in metres).

import { CHOP_SCENE_GLSL } from './floor.js';

export function signMat(THREE, map, U, opts = {}) {
  const {
    color = 0xffffff, grid = [0, 0], near = 3.0, far = 11.0, lod = 5.0,
    gloss = 0.55, tilt = 0.0, top = 0.30, foot = 0.13, side = null,
    glare = [1.0, 0.97, 0.88], name = 'sign', lambert = false, emissive = 0x000000,
    glareMax = 0.42,
  } = opts;

  const m = lambert
    ? new THREE.MeshLambertMaterial({ map, color, emissive })
    : new THREE.MeshBasicMaterial({ map, color });
  if (side) m.side = side;

  const P = {
    uSignGrid: { value: new THREE.Vector2(grid[0], grid[1]) },
    uSignFade: { value: new THREE.Vector2(near, far) },
    uSignLod: { value: lod },
    uSignGloss: { value: gloss },
    uSignTilt: { value: tilt },
    uSignEdge: { value: new THREE.Vector2(top, foot) },
    uSignGlare: { value: new THREE.Color(glare[0], glare[1], glare[2]) },
    // A laminated blade seen at 5 degrees off edge-on genuinely whites out, but
    // it whites out TOWARD the fixture that is lighting it, not past it. The
    // first pass had no ceiling on the term and the near blades came back at
    // 1.5x the lamps themselves, which erased the type they exist to carry.
    uSignMax: { value: glareMax },
  };
  m.userData.chop = P;

  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, P);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vChopW;
varying vec3 vChopN;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vChopW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  vChopN = normalize( mat3( modelMatrix ) * normal );`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vChopW;
varying vec3 vChopN;
uniform vec2 uSignGrid, uSignFade, uSignEdge;
uniform float uSignLod, uSignGloss, uSignTilt, uSignMax;
uniform vec3 uSignGlare;
vec3 chopGlare = vec3( 0.0 );
` + CHOP_SCENE_GLSL)
      .replace('#include <map_fragment>', `
{
  vec3 Vv = vChopW - cameraPosition;
  float camD = length( Vv );
  Vv /= camD;

  // ---- PHOTOGRAPHIC FALL-OFF -------------------------------------------
  float t = smoothstep( uSignFade.x, uSignFade.y, camD );
  vec4 sN = texture2D( map, vMapUv, t * uSignLod * 0.45 );
  vec4 sF = texture2D( map, vMapUv, uSignLod );
  diffuseColor *= mix( sN, sF, t * t );

  // ---- SELF SHADOW ------------------------------------------------------
  float vc = uSignGrid.y > 0.0 ? fract( vMapUv.y * uSignGrid.y ) : vMapUv.y;
  float shade = 1.0 - uSignEdge.x * smoothstep( 0.855, 1.0, vc );
  shade *= mix( 1.0 - uSignEdge.y, 1.0, smoothstep( 0.0, 0.62, vc ) );
  diffuseColor.rgb *= shade;

  // ---- SPECULAR GLARE OFF THE CEILING STRIPS ----------------------------
  vec3 Nn = normalize( vChopN );
  if ( dot( Nn, Vv ) > 0.0 ) Nn = -Nn;
  Nn = normalize( Nn + vec3( 0.0, uSignTilt, 0.0 ) );
  vec3 Rr = reflect( Vv, Nn );
  float ct = clamp( - dot( Vv, Nn ), 0.0, 1.0 );
  float fres = 0.042 + 0.958 * pow( 1.0 - ct, 5.0 );
  if ( Rr.y > 0.02 && vChopW.y < uCeilH - 0.05 ) {
    float tC = min( ( uCeilH - vChopW.y ) / Rr.y, 40.0 );
    vec2 Q = ( vChopW + Rr * tC ).xz;
    float b = 0.11 + 0.075 * tC;
    float g = chopLight( Q, b, b * 1.45 ) * 0.5 + chopCeilTile( Q, b ) * 0.16;
    chopGlare = uSignGlare * min( g * fres * uSignGloss, uSignMax );
  }
}
`)
      // A specular reflection is ADDED to whatever the surface transmits; it is
      // not modulated by the diffuse light on it. Adding it after the lighting
      // pass is the only way both a Basic sign and a Lambert rail get the same
      // glare for the same geometry.
      .replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\n\tgl_FragColor.rgb += chopGlare;');
  };
  const key = 'chopSignR7:' + grid[0] + 'x' + grid[1] + ':' + (tilt > 0 ? 'T' : 'F')
    + (lambert ? 'L' : 'B');
  m.customProgramCacheKey = () => key;
  m.name = name;
  return m;
}
