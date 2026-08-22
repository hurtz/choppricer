// OWNER: builder-cctv. GLSL for the security-footage grade and the monitor glass.
//
// Target look: a MODERN cheap retail DVR, not VHS. That means fairly sharp and in
// colour, but wide-angle, noisy, contrast-crushed, low-bitrate and juddery. Every
// term below has a strength uniform so the wall and the floor view can be dialled
// independently — the floor view runs at roughly a third of the wall's strength.

export const FS_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// A normal transformed vertex shader (used by the wall's ortho-projected quads).
export const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const COMMON = /* glsl */`
// Hoskins hash12. The obvious fract(sin(dot(...))) / fract(p*127.1) hashes lose
// their conditioning once the input is a four-digit pixel coordinate and the
// "grain" comes out as a visible diagonal weave — which is exactly what a real
// sensor's grain does not do. This one stays white at 1280x720.
float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 lin2srgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(0.4166667)) - 0.055, step(vec3(0.0031308), c));
}`;

// ---------------------------------------------------------------------------
// The grade. Applied to each wall feed at feed resolution (so grain and
// scanlines land at one screen pixel), and to the floor view at full res.
// ---------------------------------------------------------------------------
export const GradeShader = {
  name: 'CCTVGrade',
  uniforms: {
    tDiffuse:   { value: null },
    uRes:       { value: null },   // destination resolution in px
    uAspect:    { value: 4 / 3 },
    uSeed:      { value: 0 },      // bumped only when this feed actually re-renders
    uTime:      { value: 0 },
    uLinearIn:  { value: 1 },      // three writes LinearSRGB into render targets

    uBarrel:    { value: 0.32 },   // wide security lens: straight lines bow
    // Lateral CA, in PIXELS of per-channel shift at the extreme corner. It is
    // zero across the middle 40% of the frame and ramps quadratically after
    // that, because that is where a real lens puts it. Keep this ~1px: a cheap
    // dome camera fringes a hair at the corners, it is not an anaglyph.
    uCA:        { value: 1.1 },
    uChroma:    { value: 0.55 },   // 4:2:0-ish chroma subsampling
    uBlocky:    { value: 0.18 },   // low-bitrate macroblocking, on some blocks only
    uSharp:     { value: 0.55 },   // in-camera edge sharpening; NEGATIVE = soft focus
    uBloom:     { value: 0.85 },   // fluorescent tubes bleed into what is around them
    uBloomThr:  { value: 0.72 },   // LINEAR luma the bleed starts at, so: tubes only

    uGain:      { value: 1.0 },
    uBlack:     { value: 0.055 },  // crush the shadows
    uPivot:     { value: 0.45 },   // contrast pivot; below this goes down, above up
    uContrast:  { value: 1.20 },
    uKnee:      { value: 0.80 },   // where the highlight shoulder starts
    uHighlight: { value: 0.30 },   // and how hard the very top goes to paper white
    uSat:       { value: 0.80 },
    uTint:      { value: null },

    uNoise:     { value: 0.042 },  // luma grain, worse in the darks
    uScan:      { value: 0.07 },
    uRoll:      { value: 0.045 },  // slow vertical interference band
    uRollSpeed: { value: 0.055 },
    uVign:      { value: 0.42 },

    uGlitch:    { value: 0.0 },    // horizontal tear amount
    uGlitchY:   { value: -1.0 },   // tear centre in 0..1, <0 = off
  },
  vertexShader: FS_VERT,
  fragmentShader: /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform vec2  uRes;
uniform float uAspect, uSeed, uTime, uLinearIn;
uniform float uBarrel, uCA, uChroma, uBlocky, uSharp, uBloom;
uniform float uGain, uHighlight, uBlack, uPivot, uContrast, uKnee, uSat, uBloomThr;
uniform vec3  uTint;
uniform float uNoise, uScan, uRoll, uRollSpeed, uVign;
uniform float uGlitch, uGlitchY;
${COMMON}

void main() {
  vec2 uv = vUv;

  // --- 1. rolling horizontal tear ------------------------------------------
  // A band of scanlines that slipped. Only some feeds get one, every few seconds.
  if (uGlitchY >= 0.0) {
    float bar = 1.0 - smoothstep(0.0, 0.040, abs(uv.y - uGlitchY));
    float j = h21(vec2(floor(uv.y * uRes.y), uSeed * 3.7)) - 0.5;
    uv.x += bar * uGlitch * j;
    uv.x = clamp(uv.x, 0.001, 0.999);
  }

  // --- 2. barrel / fisheye --------------------------------------------------
  // Normalised so the corners stay pinned: the centre magnifies instead of the
  // frame shrinking, which is what a wide lens on a small sensor actually does.
  vec2 c = (uv - 0.5) * vec2(uAspect, 1.0);
  float r2 = dot(c, c);
  float rmax = 0.25 * uAspect * uAspect + 0.25;
  vec2 lc = c * (1.0 + uBarrel * r2) / (1.0 + uBarrel * rmax);
  vec2 buv = lc / vec2(uAspect, 1.0) + 0.5;

  // --- 3. chromatic aberration ---------------------------------------------
  // Pixel-anchored and corner-only. rn is 0 in the middle of the frame and 1 at
  // the extreme corner; the ramp is dead flat until 0.42 of that, then squared,
  // so the centre two thirds of the picture is bit-exact and only the corners
  // pick up a fringe. uCA is the shift in destination pixels.
  vec2 px = 1.0 / uRes;
  float rn = sqrt(r2 / rmax);
  float caRamp = smoothstep(0.42, 1.0, rn);
  caRamp *= caRamp;
  vec2 dpx = (buv - 0.5) * uRes;
  vec2 caOff = (dpx / max(1.0, length(dpx))) * (uCA * caRamp) * px;

  vec3 col;
  col.r = texture2D(tDiffuse, clamp(buv + caOff, 0.0008, 0.9992)).r;
  col.g = texture2D(tDiffuse, buv).g;
  col.b = texture2D(tDiffuse, clamp(buv - caOff, 0.0008, 0.9992)).b;

  // one cross tap, reused for both the focus term and the highlight bleed
  vec3 t0 = texture2D(tDiffuse, buv + vec2( px.x, 0.0)).rgb;
  vec3 t1 = texture2D(tDiffuse, buv + vec2(-px.x, 0.0)).rgb;
  vec3 t2 = texture2D(tDiffuse, buv + vec2(0.0,  px.y)).rgb;
  vec3 t3 = texture2D(tDiffuse, buv + vec2(0.0, -px.y)).rgb;
  vec3 blur = (t0 + t1 + t2 + t3) * 0.25;

  // --- 3b. highlight bleed --------------------------------------------------
  // Done in linear, before the transfer curve, because it is light: a ceiling
  // troffer smears into the tile grid around it. This is the single loudest
  // "shot indoors under fluorescents" cue once the store has a ceiling.
  if (uBloom > 0.0) {
    vec2 bo = px * 2.6;
    vec3 g = texture2D(tDiffuse, buv + vec2( bo.x,  bo.y)).rgb
           + texture2D(tDiffuse, buv + vec2(-bo.x,  bo.y)).rgb
           + texture2D(tDiffuse, buv + vec2( bo.x, -bo.y)).rgb
           + texture2D(tDiffuse, buv + vec2(-bo.x, -bo.y)).rgb;
    g = (g + blur * 2.0) * 0.16666667;
    col += uBloom * smoothstep(uBloomThr, uBloomThr + 0.65, luma(g)) * g;
  }

  // --- 4. low bitrate: chroma subsample + partial macroblocking ------------
  if (uChroma > 0.0) {
    vec2 half_ = uRes * 0.5;
    vec3 cs = texture2D(tDiffuse, (floor(buv * half_) + 0.5) / half_).rgb;
    vec3 sub = cs + (luma(col) - luma(cs));   // keep sharp luma, mushy chroma
    col = mix(col, sub, uChroma);
  }
  if (uBlocky > 0.0) {
    vec2 bs = uRes / 8.0;
    vec2 bid = floor(buv * bs);
    vec3 bc = texture2D(tDiffuse, (bid + 0.5) / bs).rgb;
    float m = step(0.66, h21(bid * 0.137 + floor(uSeed * 2.0)));
    col = mix(col, bc, uBlocky * m);
  }

  if (uLinearIn > 0.5) { col = lin2srgb(col); blur = lin2srgb(blur); }

  // --- 4b. focus / in-camera sharpening ------------------------------------
  // Applied in the signal domain, not in linear, because that is where the DSP
  // in these cameras does it. Positive uSharp is the crunchy halo every cheap
  // IP camera puts around a shelf edge; negative is a channel nobody focused.
  col += (col - blur) * uSharp;

  // --- 5. grade: crushed blacks, hard midtones, a shoulder, then paper white
  // Order matters. Crush first so the contrast term works on a signal whose
  // black point is already where the recorder put it.
  col *= uGain;
  col = max(vec3(0.0), col - uBlack) / max(1e-3, 1.0 - uBlack);
  col = max(vec3(0.0), (col - uPivot) * uContrast + uPivot);

  // The shoulder is the difference between "security footage" and "milky".
  // A supermarket is lit to about 800 lux and a $60 camera has maybe six stops:
  // without a rolloff the VCT floor, the ceiling tiles and the troffers all land
  // on 1.0 together and the picture turns into a pale haze. Real footage holds
  // them apart right up to the tubes, and only the tubes actually blow.
  float k = max(1e-3, 1.0 - uKnee);
  vec3 over = max(vec3(0.0), col - uKnee);
  col = min(col, vec3(uKnee)) + k * (over / (over + k));

  // ...and the tubes do blow, all the way to paper.
  float y0 = luma(col);
  col += uHighlight * smoothstep(uKnee + 0.05, 1.0, y0) * (1.0 - col);

  float y1 = luma(col);
  col = mix(vec3(y1), col, uSat);
  col *= uTint;

  // --- 6. sensor noise, animated, heavier in the shadows -------------------
  vec2 np = gl_FragCoord.xy + vec2(uSeed * 37.13, uSeed * 61.77);
  float n  = h21(np) - 0.5;
  float nc = h21(np + 19.73) - 0.5;
  float dark = 1.0 + 2.4 * (1.0 - smoothstep(0.02, 0.45, y1));
  col += n * uNoise * dark;
  col.r += nc * uNoise * 0.30 * dark;
  col.b -= nc * uNoise * 0.26 * dark;

  // --- 7. scanlines + a very slow vertical roll ----------------------------
  col *= 1.0 - uScan * (0.5 + 0.5 * sin(uv.y * uRes.y * 3.14159265));
  float rb = fract(uv.y + uTime * uRollSpeed);
  float band = smoothstep(0.0, 0.05, rb) * (1.0 - smoothstep(0.05, 0.14, rb));
  col *= 1.0 + band * uRoll;

  // --- 8. vignette ---------------------------------------------------------
  col *= 1.0 - uVign * smoothstep(0.34, 1.02, sqrt(r2 / rmax));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
};

// ---------------------------------------------------------------------------
// One monitor on the wall. Samples its own graded feed plus the shared burn-in
// canvas, then adds the things that make it read as a physical panel: a
// backlight black floor, a glass sheen, polariser edge falloff, and the active
// channel's border.
// ---------------------------------------------------------------------------
export const ScreenShader = {
  name: 'CCTVScreen',
  uniforms: {
    tFeed:  { value: null },
    tBurn:  { value: null },
    uRect:  { value: null },   // x,y,w,h in px, TOP-LEFT origin
    uRes:   { value: null },
    uGlass: { value: 0.035 },
    uSheen: { value: 0.05 },
    uPhase: { value: 0.0 },
    uActive:{ value: 0.0 },
    uDim:   { value: 1.0 },
    uScan:  { value: 0.07 },   // see note in the fragment shader
    uPanel: { value: null },   // this panel's white point, see note below
  },
  vertexShader: QUAD_VERT,
  fragmentShader: /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tFeed, tBurn;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uGlass, uSheen, uPhase, uActive, uDim, uScan;
uniform vec3 uPanel;

void main() {
  vec2 l = vUv;

  // faint glass bulge — these are flat panels, so this stays near zero
  float a = uRect.z / uRect.w;
  vec2 c = (l - 0.5) * vec2(a, 1.0);
  float r2 = dot(c, c);
  float rmax = 0.25 * a * a + 0.25;
  vec2 fuv = c * (1.0 + uGlass * r2) / (1.0 + uGlass * rmax) / vec2(a, 1.0) + 0.5;

  vec3 col = texture2D(tFeed, fuv).rgb * uDim;

  // burn-in is composited flat by the recorder, so it does not bow
  vec2 cp = uRect.xy + vec2(l.x, 1.0 - l.y) * uRect.zw;
  vec4 b = texture2D(tBurn, vec2(cp.x / uRes.x, 1.0 - cp.y / uRes.y));
  col = mix(col, b.rgb, b.a);

  // Scanlines live HERE and not in the grade pass on purpose. The burn-in is
  // composited into the recorded stream, so the timestamp has to carry the same
  // line structure as the picture under it. Text that stays perfectly crisp
  // while the video is degraded is the loudest "this is a game HUD" tell there
  // is. uRect.w is the panel height in px, so this lands on exact screen rows.
  col *= 1.0 - uScan * (0.5 + 0.5 * sin(l.y * uRect.w * 3.14159265));

  // LCD backlight leak: a screen showing black is never actually black
  col = col * 0.960 + 0.017;

  // Every panel on a real wall has a different white point — they were bought in
  // different years and the CCFL/LED backlights age at different rates. This is
  // separate from the per-channel tint in the grade: that is the camera, this is
  // the monitor, and it colours the black leak and the sheen too.
  col *= uPanel;

  // glass sheen — a soft off-axis reflection, angled differently per monitor
  float d = l.x * 0.78 + l.y * 0.60;
  float sh = exp(-pow((d - (0.62 + 0.30 * sin(uPhase))) * 2.6, 2.0));
  col += sh * uSheen * vec3(0.82, 0.88, 1.0);

  // polariser darkening right at the panel edge — a thin lip, not a frame
  vec2 e = min(l, 1.0 - l) * uRect.zw;
  float ep = min(e.x, e.y);
  col *= 0.74 + 0.26 * smoothstep(0.0, 4.0, ep);

  // selected channel: brighter panel + a hard bright border
  col *= 1.0 + uActive * 0.13;
  col = mix(col, vec3(0.88, 0.99, 0.92), (1.0 - smoothstep(1.0, 2.6, ep)) * uActive * 0.92);

  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// A monitor with nothing on the other end of the cable. Two flavours:
//   mode 0  analogue snow — an old composite input with no sync. Full-rate
//           white noise, a coarse blotch under it, and a sync bar crawling up.
//   mode 1  the manufacturer's blue NO SIGNAL card on a modern panel.
// Same panel physics tail as ScreenShader so a dark monitor sits in the same
// room as the live ones: backlight leak, white point, sheen, polariser lip.
// ---------------------------------------------------------------------------
export const DeadShader = {
  name: 'CCTVDead',
  uniforms: {
    tCard:  { value: null },
    uRect:  { value: null },
    uRes:   { value: null },
    uMode:  { value: 0.0 },
    uTime:  { value: 0.0 },
    uSeed:  { value: 0.0 },
    uSheen: { value: 0.05 },
    uPhase: { value: 0.0 },
    uScan:  { value: 0.07 },
    uPanel: { value: null },
  },
  vertexShader: QUAD_VERT,
  fragmentShader: /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCard;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uMode, uTime, uSeed, uSheen, uPhase, uScan;
uniform vec3 uPanel;
${COMMON}

void main() {
  vec2 l = vUv;
  vec2 fc = gl_FragCoord.xy;
  vec3 col;

  if (uMode < 0.5) {
    // Snow. Two octaves so it has grain AND blotch — one octave of pure hash
    // reads as a flat grey rectangle once it is 136px wide on the wall.
    float n  = h21(fc * 1.31 + vec2(uSeed * 13.1, uSeed * 7.7));
    float n2 = h21(floor(fc * 0.34) + vec2(uSeed * 3.3, 91.0));
    float s = mix(n, n2, 0.30);
    // A dead composite input on a twelve-year-old CRT in an unlit room is a
    // DIM grey fizz, not a lightbox. Full-amplitude snow out-shone every live
    // feed on the wall and pulled the eye straight to the one panel that has
    // nothing to say.
    col = vec3(s * 0.40 + 0.032);
    col *= 0.86 + 0.30 * n2;
    // the sync bar that never quite locks, crawling up the picture
    float rb = fract(l.y + uTime * 0.21);
    float bar = smoothstep(0.0, 0.018, rb) * (1.0 - smoothstep(0.018, 0.085, rb));
    col *= 1.0 + 0.55 * bar;
    col *= vec3(0.985, 1.0, 1.020);
  } else {
    col = mix(vec3(0.030, 0.049, 0.132), vec3(0.015, 0.026, 0.079), l.y);
    col += 0.008 * (h21(fc * 0.9 + uSeed) - 0.5);
  }

  vec2 cp = uRect.xy + vec2(l.x, 1.0 - l.y) * uRect.zw;
  vec4 c = texture2D(tCard, vec2(cp.x / uRes.x, 1.0 - cp.y / uRes.y));
  col = mix(col, c.rgb, c.a);

  col *= 1.0 - uScan * (0.5 + 0.5 * sin(l.y * uRect.w * 3.14159265));
  col = col * 0.960 + 0.017;
  col *= uPanel;

  float d = l.x * 0.78 + l.y * 0.60;
  col += exp(-pow((d - (0.62 + 0.30 * sin(uPhase))) * 2.6, 2.0)) * uSheen * vec3(0.82, 0.88, 1.0);

  vec2 e = min(l, 1.0 - l) * uRect.zw;
  float ep = min(e.x, e.y);
  col *= 0.74 + 0.26 * smoothstep(0.0, 4.0, ep);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
};
