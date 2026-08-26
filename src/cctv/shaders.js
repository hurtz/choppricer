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
    // LATERAL CA, in DESTINATION PIXELS OF R-TO-B TAP SEPARATION AT THE EXTREME
    // CORNER. Not half-separation: the R tap goes out by uCA/2 and the B tap in
    // by uCA/2.
    //
    // ROUND 9 CORRECTION. This used to end "...so this number is the fringe
    // width you can measure on the picture". IT IS NOT. uChroma's tent in
    // section 4 runs after these taps and low-passes most of a lateral fringe
    // back out, because a lateral fringe IS a chroma signal. Measured on the
    // picture the shipped floor view carries 0.293 px, not 0.70. This is the
    // separation the SAMPLER IS ASKED FOR; see section 4 for what happens to it
    // and CA_TAP_CORNER_720 in cctv.js for why the number is not compensated.
    uCA:        { value: 0.70 },
    uChroma:    { value: 0.55 },   // 4:2:0-ish chroma subsampling
    // Chroma sensor noise, as a fraction of uNoise. Split out of the shader
    // body in round 8 so it can be swept: it was 0.30/0.26 hardcoded, and it
    // was the term that made the shadows sparkle.
    uCNoise:    { value: 0.16 },
    uBlocky:    { value: 0.18 },   // low-bitrate macroblocking, on some blocks only
    // NON-NEGATIVE BY CONTRACT since round 10. This is the DSP's edge
    // enhancement and it lives in the signal domain (section 4b). The other
    // sign is a LENS and it is uDefocus, in linear, in section 3c. applyGrade
    // splits one authored number across the two so CHAN[i].sharp keeps meaning
    // what it says.
    uSharp:     { value: 0.55 },
    uDefocus:   { value: 0.0 },    // soft focus, in LIGHT, before the sensor
    uBloom:     { value: 0.85 },   // fluorescent tubes bleed into what is around them
    uBloomThr:  { value: 0.72 },   // LINEAR luma the bleed starts at
    // ROUND 14: this is now HALF the selector. It answers 'is this bright
    // enough to be a highlight'; uBloomWarm answers 'is this an emitter or a
    // reflector'. The floor view could drop this 1.27 -> 1.15 only because the
    // second question took over the job of protecting the printed numeral.
    // ROUND 13. 1 = the bleed is the neighbourhood's excess OVER THE CENTRE, so
    // a flat surface contributes exactly zero to itself at any brightness.
    // 0 = the round-12 absolute form, kept ONLY so the A/B runs on one page
    // load. Shipped value is 1 on all three views; see section 3b.
    uBloomLocal: { value: 1.0 },
    // ROUND 14. THE WARM CUT: the largest (R-B)/L a source may have and still
    // enter the bloom. 9.0 is OFF (nothing in a real frame is that warm), and
    // that is the ablation lever -- one uniform, one page load. See section 3b.
    uBloomWarm: { value: 9.0 },

    uGain:      { value: 1.0 },
    uBlack:     { value: 0.055 },  // crush the shadows
    uPivot:     { value: 0.45 },   // contrast pivot; below this goes down, above up
    uContrast:  { value: 1.20 },
    uKnee:      { value: 0.80 },   // where the highlight shoulder starts
    // ...and where it ENDS. Same units as uKnee (signal domain, after contrast).
    // The shoulder reaches exactly 1.0 here and the final clamp hard-clips it,
    // so uWhite IS the sensor's full well expressed on the graded signal.
    // ROUND 9 REPLACED uHighlight WITH THIS. See section 5.
    uWhite:     { value: 1.80 },
    uSat:       { value: 0.80 },
    uTint:      { value: null },

    uNoise:     { value: 0.042 },  // luma grain, worse in the darks
    // (no uScan here. Scanlines belong to the MONITOR, so they live in
    // ScreenShader/DeadShader below — see the note in section 7.)
    uRoll:      { value: 0.045 },  // slow vertical interference band
    uRollSpeed: { value: 0.055 },
    uVign:      { value: 0.42 },

    // BLACK PEDESTAL. The signal floor, applied last, after the vignette. See
    // the note in section 9: a recorder does not output absolute zero and the
    // reference photographs do not contain it either.
    uPed:       { value: 0.016 },

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
uniform float uBarrel, uCA, uChroma, uCNoise, uBlocky, uSharp, uDefocus, uBloom;
uniform float uGain, uWhite, uBlack, uPivot, uContrast, uKnee, uSat, uBloomThr;
uniform float uBloomLocal, uBloomWarm;
uniform vec3  uTint;
uniform float uNoise, uRoll, uRollSpeed, uVign, uPed;
uniform float uGlitch, uGlitchY;
${COMMON}

// THE BLOOM SELECTOR. ONE DEFINITION, CALLED NINE TIMES -- eight taps and the
// centre. It used to be nine copies of the same smoothstep written inline, and
// the round-13 self-subtraction is only exact while the centre is weighted by
// EXACTLY the expression the taps are weighted by, so this is the CLAUDE.md
// one-owner rule applied to four lines of GLSL. Full argument in section 3b.
vec3 bloomSel(vec3 v) {
  float L = luma(v);
  float s = smoothstep(uBloomThr, uBloomThr + 0.65, L);
  // ROUND 14 -- THE SECOND AXIS. An emitter shows its OWN spectrum; a reflector
  // shows lamp spectrum times albedo, so it cannot be COOLER than the light
  // that lit it. (R-B)/L is that colour temperature, from three channels
  // already in this register -- ZERO extra texture fetches. The soft band sits
  // BELOW the cut, so a source at or above uBloomWarm contributes exactly
  // zero: the 'no printed card enters the selector' claim is by construction,
  // not by margin. Measured populations and the live check are in cctv.js.
  float warm = (v.r - v.b) / max(L, 1e-4);
  return s * (1.0 - smoothstep(uBloomWarm - 0.02, uBloomWarm, warm)) * v;
}

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
  //
  // ###  THIS IS THE ONLY BLOCK IN THE GRADE THAT MOVES A PIXEL.  ###
  // Its inverse is PUBLISHED as warpFloor() in src/cctv/warp.js, and
  // src/game/hud.js draws every world-locked marker on the on-foot view through
  // it - bracket, door tag, chevron. cctv.js's own analytics boxes go through
  // the same map (unbarrel -> boxOf). Change these four lines and warp.js is
  // wrong in the same commit, and the brackets come off the men again. Measured
  // at k=0.12, 16:9: centre magnifies 1.1248x, worst displacement 31 px at ~0.6
  // of the corner radius, zero at the corners.
  // (No backticks in here, ever: this whole shader is a JS template literal.)
  vec2 c = (uv - 0.5) * vec2(uAspect, 1.0);
  float r2 = dot(c, c);
  float rmax = 0.25 * uAspect * uAspect + 0.25;
  vec2 lc = c * (1.0 + uBarrel * r2) / (1.0 + uBarrel * rmax);
  vec2 buv = lc / vec2(uAspect, 1.0) + 0.5;

  // --- 3. lateral chromatic aberration -------------------------------------
  // ROUND 8. Lateral (transverse) CA is a per-channel MAGNIFICATION difference
  // about the optical centre: red and blue land at slightly different image
  // heights, so the fringe is zero at the centre and grows monotonically with
  // radius. Brown-Conrady's first two radial terms, normalised so that uCA IS
  // the R-to-B separation in destination pixels at the extreme corner:
  //
  //     d(rn) = uCA * (CA_LIN * rn + (1 - CA_LIN) * rn^3)
  //
  // WHAT WAS WRONG WITH THE OLD ONE, AND IT WAS THE SHAPE, NOT THE SIZE. Round
  // 3 wrote smoothstep(0.42, 1.0, rn) squared, i.e. BIT-EXACT ZERO across the
  // inner 42% of the radius and then a fourth-power-ish ramp. No lens does
  // that. Two things follow. It leaves a visible ONSET RING where the term
  // switches on, and to get any fringe at all at the corner the corner value
  // has to be pushed to where it reads as an anaglyph. Measured on the shipped
  // floor view: 0.00 px of R-B separation out to rn 0.45, then 1.03 px at
  // rn 0.85 and 1.38 px at rn 0.95. The reference photographs whose cameras
  // did NOT correct their TCA (reference/store_01_Canned_and_packaged_tuna,
  // reference/store_02_Langenstein_s) rise smoothly from the centre and reach
  // 0.31-0.49 px at 1920 wide, which de-attenuates through their own 4:2:0 to
  // roughly 0.5-0.8 px expressed at 1280x720. Half the reference set is at
  // zero, because their cameras corrected it. Full profile in the round-8
  // report; instrument is a (R-B) vs radial-dG/du regression with a TANGENTIAL
  // null control.
  //
  // CA_LIN 0.62 splits it mostly-linear with enough cube to keep the corner
  // emphasis a cheap wide lens has. At uCA 0.70 that is 0.11 px at rn 0.25,
  // 0.25 px at mid-frame and 0.70 px in the corner — inside the reference
  // envelope everywhere, and nonzero everywhere, which is the point.
  vec2 px = 1.0 / uRes;
  float rn = sqrt(r2 / rmax);
  float caD = uCA * (0.62 * rn + 0.38 * rn * rn * rn);
  // lc is already the aspect-corrected barrel-warped offset, and because
  // uAspect is exactly uRes.x/uRes.y, (buv - 0.5) * uRes IS lc * uRes.y. So
  // normalize(lc) is the unit RADIAL direction in PIXEL space and needs no
  // aspect fix-up; multiplying by px turns a one-pixel step into uv.
  vec2 caDir = lc / max(1e-5, length(lc));
  vec2 caOff = caDir * (0.5 * caD) * px;

  vec3 col;
  col.r = texture2D(tDiffuse, clamp(buv + caOff, 0.0008, 0.9992)).r;
  col.g = texture2D(tDiffuse, buv).g;
  col.b = texture2D(tDiffuse, clamp(buv - caOff, 0.0008, 0.9992)).b;

  // Two rings of taps. The cross at 1 px and the diagonals at 2.6 px. Round 7
  // computed the diagonals INSIDE the bloom branch and used them once; round 8
  // hoists them because the chroma path needs exactly the same low-pass and
  // there is no reason to pay for it twice. Every shipped preset has bloom and
  // chroma both non-zero, so nothing is fetched here that was not fetched
  // before — and the half-res point sample this replaces is one fetch GONE.
  vec3 t0 = texture2D(tDiffuse, buv + vec2( px.x, 0.0)).rgb;
  vec3 t1 = texture2D(tDiffuse, buv + vec2(-px.x, 0.0)).rgb;
  vec3 t2 = texture2D(tDiffuse, buv + vec2(0.0,  px.y)).rgb;
  vec3 t3 = texture2D(tDiffuse, buv + vec2(0.0, -px.y)).rgb;
  vec3 blur = (t0 + t1 + t2 + t3) * 0.25;

  vec2 bo = px * 2.6;
  vec3 d0 = texture2D(tDiffuse, buv + vec2( bo.x,  bo.y)).rgb;
  vec3 d1 = texture2D(tDiffuse, buv + vec2(-bo.x,  bo.y)).rgb;
  vec3 d2 = texture2D(tDiffuse, buv + vec2( bo.x, -bo.y)).rgb;
  vec3 d3 = texture2D(tDiffuse, buv + vec2(-bo.x, -bo.y)).rgb;
  vec3 diag = (d0 + d1 + d2 + d3) * 0.25;

  // --- 3b. highlight bleed --------------------------------------------------
  // Done in linear, before the transfer curve, because it is light: a ceiling
  // troffer smears into the tile grid around it. This is the single loudest
  // "shot indoors under fluorescents" cue once the store has a ceiling.
  //
  // ROUND 11 — THIS SELECTOR WAS BACKWARDS AND IT IS WHY PRINTED CARD BLEW AND
  // THE FLUORESCENTS DID NOT. It used to read
  //
  //     vec3 g = (diag * 4.0 + blur * 2.0) * 0.16666667;
  //     col += uBloom * smoothstep(uBloomThr, uBloomThr + 0.65, luma(g)) * g;
  //
  // i.e. AVERAGE THE TAPS, THEN THRESHOLD. Averaging first is the thing that
  // decides which highlights survive, and it decides it in favour of AREA over
  // INTENSITY: a large flat sheet of white card has every tap equal to itself,
  // so the average IS its own value and it passes any threshold it would pass on
  // its own; a troffer lens a few pixels wide has most of its taps sitting on
  // dark ceiling tile, so the average lands far below the lens and it fails
  // thresholds the card sails through. Measured on the shipped floor buffer,
  // 9503 lamp pixels and 238848 sign pixels, reproducing this exact kernel in JS:
  //
  //                     source p99   blurred p99   mean weight src -> blurred
  //     LAMPS              1.5842       1.1774        0.1856 -> 0.0657   -65%
  //     SIGN               1.0133       0.9076        0.0470 -> 0.0306   -35%
  //
  // The blur costs the LAMP 65% of its bloom and the CARD only 35%, so the
  // lamp-to-card bloom ratio falls from 3.95x to 2.15x before any threshold is
  // even chosen. That is the same Jensen inversion round 10 found in the wall's
  // clip-then-downscale, one term over: a convex selector applied to a mean is
  // not the mean of the selector, and the direction of the error depends on
  // whether the bright thing is big or small.
  //
  // THRESHOLD EACH TAP, THEN AVERAGE. Identical for a large flat source (every
  // tap equal, so nothing moves), strictly larger for a small intense one. No
  // extra texture fetches — the eight taps are already in registers for the
  // sharpener and the chroma tent, and this is arithmetic on what is there.
  //
  // And that is what makes uBloomThr usable at all. Round 9 recorded thr
  // 0.80-1.15 as a lever that "drives the sign to 0.000% clipped"; it does not,
  // and I measured that before I believed it — at thr 1.15 under the OLD kernel
  // signage still owned 83.8% of the frame's blown pixels while the lamps' own
  // blown fraction halved, 9.18% to 4.37%. The old threshold could not select,
  // only attenuate, because by the time it ran the lamp and the card had already
  // been made to look alike. Under this kernel they are 1.58 against 1.01 at p99
  // and a threshold in between actually separates them.
  //
  // ROUND 12 — AND THE GAIN THAT FIX REQUIRED IS ONLY VALID WHERE THE TAPS ARE
  // SPARSE. Thresholding each tap zeroes most taps around a SMALL source, so the
  // same visible bleed needs a big uBloom. Around a LARGE FLAT source nothing is
  // zeroed: every tap equals the centre, hDiag and hBlur both equal it, and the
  // line below degenerates to
  //
  //     col += uBloom * s * col        i.e. col *= (1 + uBloom * s)
  //
  // which is not a halo at all, it is a MULTIPLY on the whole surface. At the
  // round-11 dials (uBloom 12, uBloomThr 0.95) a printed blade card sat at s
  // about 0.135, so every one of its 148,334 pixels was multiplied by 2.6 and the
  // card blew flat — 11,712 blown pixels against the lamps' 5,517 on the same
  // frame, on a term that exists to bleed lamps. The selector was fixed and the
  // COMPENSATION then reintroduced the same asymmetry one step later.
  //
  // Nothing in this block changes for that. The fix is the threshold: put
  // uBloomThr above the brightest FLAT printed white in the scene so a card never
  // enters the selector, and a card's self-multiply is exactly zero. Numbers,
  // poses and the live check are in the ROUND 12 block above GRADE_PRESET.floor
  // in cctv.js.
  //
  // ROUND 13 — AND A THRESHOLD CANNOT DO THAT JOB, BECAUSE THE POPULATIONS
  // CROSS. Round 12 chose 1.27 from four poses that all sat at camera z = -11.6.
  // Swept over DISTANCE in the same aisle, signMat's fresnel glare grows as a
  // blade turns edge-on and printed p99 climbs 1.126 -> 1.314 while lens p90
  // falls 1.467 -> 1.064. At z = -17, -16, -15 and -2 the printed p99 sits ABOVE
  // the lens p90, so the interval a threshold would have to live in is EMPTY —
  // no constant separates them, not 1.27 and not a better one. Full table in
  // cctv.js; probe.sweepDistance() reproduces it live.
  //
  // So the term below stops asking about the LEVEL and asks about the GRADIENT.
  // hc is what this pixel would contribute to its own neighbourhood under the
  // identical selector, and it is subtracted. Three consequences:
  //
  //   1. On a source flat over the 5.2 px kernel every tap equals the centre, so
  //      h == hc BIT-FOR-BIT and the contribution is exactly zero — at any
  //      brightness. The degenerate multiply is not attenuated, it is removed.
  //      A glare can fake amplitude. It cannot fake a gradient it does not have.
  //   2. Just outside a small source hc is zero and h is not, so the halo — the
  //      thing this term exists for — is untouched.
  //   3. Inside a large source the self-multiply goes too. That is the cost, it
  //      is paid mostly by the troffer lens interiors, and it is why whole-frame
  //      blown falls 2-12% on every pose. Measured, in cctv.js.
  //
  // NO EXTRA TEXTURE FETCH. col is the centre texel, already in a register: the
  // fetch count on the floor view stays at 12. It uses the CA-shifted centre
  // rather than a fresh tap, which is deliberate — on a flat source the three CA
  // samples are equal too, so the cancellation in (1) is still exact.
  //
  // uBloomLocal 0 restores the round-12 form on one page load, which is how the
  // A/B above was run. THE WALL AND SPOT PRESETS SHIP IT AT 0 ON PURPOSE and
  // that is not an oversight — on the wall the flat multiply is what produces
  // CH09's blown storefront daylight, and switching it off costs that feed 28x
  // its blown pixels. The reason it is safe there and not here is size, not
  // brightness: see the wall preset in cctv.js.
  //
  // ROUND 14 — AND THE SELECTOR HAS A SECOND AXIS, WHICH WAS IN THE REGISTER
  // ALL ALONG. Round 13 finished the paragraph above with 'no luminance-domain
  // selector of any shape can separate them'. True of LUMA. But this function
  // is handed a vec3, and (R-B)/L is a colour temperature that costs no fetch
  // and no tap. bloomSel() above now multiplies the level term by a warm cut,
  // and the physics is round 13's own argument one axis over: an emitter shows
  // its own spectrum, a reflector shows lamp spectrum times albedo, so it
  // cannot be COOLER than the light that lit it.
  //
  //   1. The flat-source cancellation is UNTOUCHED and still exact. On a source
  //      flat over the kernel every tap equals the centre, so the warm factor is
  //      equal too and h == hc bit-for-bit, exactly as before. The new term
  //      cannot break that property because it is a function of the same texel.
  //   2. The soft band sits BELOW the cut, not above it: full weight under
  //      uBloomWarm - 0.02, exactly zero at uBloomWarm and beyond. That is
  //      deliberate. The claim this round rests on is that 0.000% of printed
  //      card enters the selector, and a band straddling the cut would turn
  //      that into a small number instead of a zero.
  //   3. uBloomWarm 9.0 is OFF and nothing in a real frame reaches it — the
  //      warmest texel measured on five poses across the band is 5.65 — so the A/B is
  //      one uniform on one page load, and at 9.0 the extra factor is exactly
  //      1.0 and the term is bit-identical to the round-13 form.
  //
  // THE LIMIT OF THE PHYSICS, BECAUSE THE DATA FOUND IT: the cut does not test
  // emitter-versus-reflector, it tests 'no warmer than the illuminant'. A
  // blue-PIGMENTED surface is genuinely cooler than the lamp that lit it and
  // would pass. This store's blade minimum is 0.1561 against an illuminant of
  // 0.2448, i.e. the print itself is already cooler than white, so the shipped
  // margin is 0.006 and empirical, not 0.095 and physical. It is guarded by
  // probe.lampWarm(), which reads the live lamp colour out of store.js and
  // throws. Numbers, the band sweep and the coupling argument are in the ROUND
  // 14 block in cctv.js.
  //
  // WHAT YOU CANNOT DO HERE, AND IT IS THE THING YOU WILL WANT TO DO. Raising
  // the threshold costs lamp bleed, and gain does not buy it back: the reach is
  // fixed at 1 px and 2.6 px of DESTINATION resolution, so the halo is about
  // 3.7 px wide and past a knee near uBloom 200 a further +50% of gain buys under
  // 3% more blown lamp pixels. Widening 'bo' is NOT the fix, because d0..d3 are
  // the same four texels the 4:2:0 chroma tent reads in section 4, and the tent's
  // published response and the whole CA_TAP_CORNER_720 derivation are stated
  // against 2.6 px. Moving it invalidates both silently. A wider lamp halo needs
  // its own ring: +4 texture fetches per pixel, 12 -> 16 on the floor view.
  if (uBloom > 0.0) {
    vec3 hBlur = (bloomSel(t0) + bloomSel(t1) + bloomSel(t2) + bloomSel(t3)) * 0.25;
    vec3 hDiag = (bloomSel(d0) + bloomSel(d1) + bloomSel(d2) + bloomSel(d3)) * 0.25;
    vec3 h  = (hDiag * 4.0 + hBlur * 2.0) * 0.16666667;
    // ROUND 13 — THE BLEED IS A GRADIENT, NOT A LEVEL. hc is what this pixel
    // would contribute to its OWN neighbourhood under the identical selector.
    // Where the source is flat over the 5.2 px kernel every tap equals the
    // centre, so h == hc BIT-FOR-BIT and the term is exactly zero no matter how
    // bright the surface is. Where it is a small source against dark ceiling,
    // hc is 0 outside it and h is not, so the halo is untouched. No extra
    // texture fetch: col is the centre texel, already in a register.
    vec3 hc = bloomSel(col);
    col += uBloom * max(h - uBloomLocal * hc, vec3(0.0));
  }

  // --- 3c. FOCUS. A LENS TERM, SO IT IS IN LINEAR AND BEFORE THE SENSOR -----
  // ROUND 10. uSharp used to carry BOTH signs and both meanings: positive was
  // the DSP's edge enhancement, which belongs in the signal domain after the
  // transfer and is still down in 4b; negative was "a channel nobody focused",
  // which is a LENS, and a lens does its work in light. Defocus in the signal
  // domain is the round-9 vignette bug one term over — sRGB is compressive, so
  // blurring a lamp there costs it far more than blurring it in linear does,
  // and it happened BEFORE the shoulder, so what it took off never came back.
  //
  // Measured, one page load, wall preset: CHAN[3] (uSharp -1.00, the soft
  // camera) read 0.000% blown in its decoded stream at EVERY white point from
  // 1.72 down to 1.05, while the other seven moved monotonically — the only
  // channel in the sweep that was flat, and the one with the MOST energy in its
  // raw buffer (max 2.677 linear, 0.744% of photosites over 1.0). A defocused
  // fluorescent tube in a real store is a big soft blown blob, not an absent
  // one: the lens spreads the light, it does not destroy it.
  //
  // Same authored magnitude, correct domain. applyGrade splits the sign, so
  // CHAN[3].sharp stays -1.00 and reads as what it means.
  if (uDefocus > 0.0) col = mix(col, blur * 0.55 + diag * 0.45, uDefocus);

  // --- 4. low bitrate: chroma subsample + partial macroblocking ------------
  // ROUND 8. THIS WAS A POINT SAMPLE, WHICH IS THE ONE THING AN ENCODER NEVER
  // DOES. The old line read one texel of a half-resolution grid
  // (floor(buv*half_)+0.5)/half_ and mixed its chroma in. Point-sampling a
  // half-res grid does not remove any chroma detail, it ALIASES it — every bit
  // of per-pixel colour noise in the render survives, lands on a 2 px grid, and
  // gains a hard block edge it did not have. A 4:2:0 encoder AVERAGES the 2x2
  // and the decoder upsamples it smoothly; what you get is soft chroma, not
  // blocky chroma. The 8 px blocking is a separate artefact and uBlocky below
  // already models it.
  //
  // Measured on flat shadow tiles of the shipped floor view: chroma HF was
  // 2.17 levels RMS against a reference-set median of 0.48, and the
  // chroma:luma HF ratio was 0.381 against a reference median of 0.204 — i.e.
  // the noise in the shadows was almost twice as COLOURED as any real store
  // photograph's. Ablating the grade's own noise term only moved that to 0.39,
  // which is how I found out the aliased chroma path, not the noise, was
  // carrying most of it.
  //
  // The carrier is a two-ring tent over taps we already have. Its response is
  // 1.00 at DC, 0.21 at horizontal or vertical Nyquist and -0.07 on the
  // diagonal checkerboard, so it keeps the colour of a red sleeve and throws
  // away the single-pixel confetti.
  //
  // ROUND 9 — AND IT ALSO EATS ABOUT HALF THE CHROMATIC ABERRATION, WHICH
  // NOBODY WROTE DOWN. Section 3 offsets the R and B taps to make a lateral
  // fringe. A lateral fringe is almost pure chroma by construction — R out, B
  // in, luma essentially unmoved — so it is precisely the signal this tent is
  // built to remove, and it removes a good deal of it. uCA 0.70 measures 0.293
  // px on the shipped floor view: the sampler is asked for 0.70 and the picture
  // keeps roughly 0.4 of it.
  //
  // That is not a bug in either term. Both are real: a cheap lens does have
  // lateral CA and a 4:2:0 encoder does low-pass chroma, and in a real camera
  // the encoder genuinely does attenuate the lens's fringe in exactly this way.
  // The bug was that uCA upstream CLAIMED to be the on-picture fringe width
  // while this line quietly spent half of it, so the documented derivation and
  // the shipped behaviour disagreed and nothing failed. Two stages, one
  // silently invalidating the other's published contract — the CLAUDE.md hazard.
  // The constant is renamed rather than compensated; see CA_TAP_CORNER_720.
  //
  // How much survives is CONTENT-DEPENDENT, so there is no single factor to
  // quote. In x the tent is 0.50 at the centre tap, 0.10 at each of +-1 px and
  // 0.15 at each of +-2.6 px; the fringe is derivative-shaped and broadband, so
  // what it loses depends on the edge underneath it. Do not turn 0.4 into a
  // constant and divide by it.
  if (uChroma > 0.0) {
    vec3 cs = col * 0.30 + blur * 0.40 + diag * 0.30;
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

  // --- 4c. optical vignette. IN THE LIGHT DOMAIN, BEFORE THE SENSOR ---------
  // ROUND 9. This used to be the second-to-last line of the shader, applied to
  // the finished signal after the transfer curve. That is backwards, and not as
  // a matter of taste: it let the vignette UN-BLOW A BLOWN HIGHLIGHT. Relative
  // illumination is a property of the aperture — it attenuates the light
  // arriving at the photosite, and the photosite saturates afterwards. A tube
  // at twice full well, vignetted by thirty per cent, is still 1.4x full well
  // and still clips to paper white. There is no order of operations in a real
  // camera in which shading the corner of the frame rescues detail in a lamp.
  //
  // Measured, one page load, shipped grade, ceiling third above 0.98 luma:
  // ablating this single term recovered 6.3x (0.055% -> 0.343%), entirely by no
  // longer dragging clipped pixels back down. It was the second largest of the
  // two terms holding the highlights down and the only one that was in the
  // wrong PLACE rather than the wrong shape.
  //
  // It multiplies blur as well as col. blur is only ever consumed as
  // (col - blur) by the sharpener in 4b, so vignetting one and not the other
  // injects a DC step into the edge enhancement everywhere off axis.
  //
  // ONSET 0.34 -> 0.46, and that is the second half of the critic's note. The
  // ceiling run recedes up the frame, and at 16:9 the top-centre of the picture
  // sits at rn 0.49 — barely past the old onset, so the old curve had already
  // begun shading exactly the band the far tubes occupy. 0.46 spends the
  // falloff on the CORNERS, which is where a lens loses illumination fastest
  // anyway, and leaves the top of frame alone.
  //
  // The strength is a bigger number than the old one and means the same thing.
  // Signal x (1 - 0.37) at the corner is linear x 0.63^2.4 = 0.33, so a
  // signal-domain 0.37 is a light-domain 0.67; the shipped floor value is
  // pulled back from there because the corner shadows now crush through it
  // rather than after it.
  //
  // ROUND 11 — RETIRED AS A LEVER FOR THE CEILING. The obvious next suspect for
  // "the lamps do not clip and they live at the top of frame" is this term, and
  // it is NOT guilty. Evaluated exactly as written here, per store.js node
  // class, over the aisle-3 floor pose:
  //
  //     mean vg on troffer lens faces   0.8819
  //     mean vg on printed card         0.8803
  //
  // 0.2% apart. Round 10's onset move already spent this term on the corners,
  // and there is no ceiling-vs-signage discrimination left in it to recover.
  // Anyone reaching for uVign to make the fluorescents blow will move the whole
  // frame and buy nothing: the selectivity they want is in section 3b.
  float vg = 1.0 - uVign * smoothstep(0.46, 1.06, rn);
  col *= vg;
  blur *= vg;

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
  //
  // ROUND 9 — AND UNTIL THIS ROUND THE TUBES COULD NOT BLOW, BECAUSE THIS CURVE
  // HAD NO WHITE POINT. It read
  //
  //     float k = 1.0 - uKnee;
  //     col = min(col, uKnee) + k * (over / (over + k));
  //
  // whose asymptote is exactly uKnee + k = 1.0. over/(over+k) is strictly less
  // than one for every finite input, so the curve APPROACHES paper white and
  // never arrives: feed it a value ten times full well and it returns 0.9987.
  // Every pixel in the picture was therefore strictly below 1.0 by construction,
  // and no amount of gain, contrast or highlight lift could change that — the
  // limit is in the algebra, not in the dials. That is the whole reason round 8
  // measured 0.028% blown, decided the energy "is not in the frame", and handed
  // a bug in this line off to store.js as an emissive level. The energy was in
  // the frame. This function was throwing it away.
  //
  // uHighlight, which used to sit under here as
  //     col += uHighlight * smoothstep(uKnee + 0.05, 1.0, luma(col)) * (1.0 - col)
  // was round 8 trying to buy back the top of the range with a second term, and
  // it is DELETED rather than left at zero. It could not work and it is the fix
  // the round-9 critic explicitly warned against: being a function of luma
  // alone, it lifts a sheet of white card exactly as hard as it lifts a lamp.
  // Pushed far enough to put the ceiling in band it took mid-frame blown pixels
  // from 0.039% to 3.872%, past the largest value in the whole reference set.
  //
  // WHAT IS HERE NOW is the same hyperbolic, given a finite white point. Let
  //     hk = 1 - uKnee          the output headroom above the knee
  //     Wo = uWhite - uKnee     the INPUT range the shoulder is given to spend
  //     s  = hk * Wo / (Wo - hk)
  // then  f(o) = s * o / (o + s)  has f'(0) = 1 exactly (so it is C1 with the
  // linear segment below the knee — no visible crease at the knee) and
  // f(Wo) = hk exactly, so the curve passes through 1.0 AT uWhite and keeps
  // climbing past it. The clamp at the bottom of this shader then hard-clips.
  // Values above uWhite are all one colour, which is what "blown" means: a
  // photosite at full well returns full well whatever else lands on it.
  //
  // Wo > hk is required or the asymptote falls back below 1.0 and nothing can
  // clip again; the max() enforces it. uWhite < 1 would ask for a white point
  // below the knee, which is the same clamp seen from the other side.
  float hk = max(1e-3, 1.0 - uKnee);
  float Wo = max(uWhite - uKnee, hk * 1.02);
  float sh = hk * Wo / max(1e-4, Wo - hk);
  vec3 over = max(vec3(0.0), col - uKnee);
  col = min(col, vec3(uKnee)) + sh * (over / (over + sh));

  // Per channel, deliberately. A warm tube runs its red into the clip first,
  // then green, then blue, so a blowing highlight desaturates towards white as
  // it goes — which is what a Bayer sensor does at full well and is half of why
  // a blown fluorescent in a photograph reads as white and not as cream.
  float y1 = luma(col);
  col = mix(vec3(y1), col, uSat);
  col *= uTint;

  // --- 6. sensor noise, animated, heavier in the shadows -------------------
  vec2 np = gl_FragCoord.xy + vec2(uSeed * 37.13, uSeed * 61.77);
  float n  = h21(np) - 0.5;
  float dark = 1.0 + 2.4 * (1.0 - smoothstep(0.02, 0.45, y1));
  col += n * uNoise * dark;
  // ...and the chroma part of it lives on the CHROMA PLANE, which in 4:2:0 is
  // half resolution. Round 7 drew it on the pixel grid, so every second pixel
  // of a shadow got an independent red/blue kick — a per-pixel colour speckle
  // that neither the sensor's own denoiser nor the encoder is able to deliver,
  // and which no reference photograph has. Same hash, quantised to the 2x2
  // chroma texel, and the amplitude is a uniform now so it can be swept.
  // Measured effect in the round-8 report; the pair (grid + amplitude) is what
  // takes flat-shadow chroma:luma HF from 0.381 to inside the reference band.
  vec2 cnp = floor(gl_FragCoord.xy * 0.5) * 2.0
           + vec2(uSeed * 23.71 + 19.73, uSeed * 41.13);
  float nc = h21(cnp) - 0.5;
  col.r += nc * uNoise * uCNoise * dark;
  col.b -= nc * uNoise * uCNoise * 0.87 * dark;

  // --- 7. a very slow vertical roll ----------------------------------------
  // THE SCANLINE TERM USED TO BE THE FIRST LINE OF THIS BLOCK AND IT IS GONE.
  // ROUND 8. A scanline is a property of a CATHODE RAY TUBE. This shader is the
  // camera and the encoder; ScreenShader is the monitor, and ScreenShader has
  // had its own uScan the whole time, driven per panel off CHAN[i].scan and
  // banded to the STREAM's rows rather than the panel's. So the wall and the
  // spot monitor never used this line: applyGrade in cctv.js reads
  //     u.uScan.value = ch ? 0 : p.scan
  // and both of those paths pass a channel. The ONE view it fired on was the
  // on-foot view — the one picture in this game that is NOT being shown on a
  // monitor. It is a bodycam on a fat cop.
  //
  // It was also, by a very long way, the loudest thing separating that picture
  // from the reference photographs. Scoring the floor view against all 14 files
  // in reference/ on fifteen statistics at once (harness in the round-8 report),
  // every single one landed inside or within half a band-width of the reference
  // p10..p90 range except this:
  //
  //     statistic                 REF p10   REF med   REF p90   floor view
  //     period-2 row modulation    0.020     0.039     0.110      8.39   levels
  //     share of vertical AC       0.0000    0.0000    0.0000     0.079
  //
  // 8.4 levels of every-other-row darkening, carrying 7.9% of the entire
  // vertical AC energy of the frame, against a reference set where the same
  // number is two hundredths of a level and rounds to zero. Nothing else was
  // above 0.41 band-widths out. A 1 px period is also the exact frequency that
  // moires the moment the canvas is not displayed 1:1.
  //
  // The roll band below STAYS, and the difference is not taste. A slow bright
  // stripe crawling up the frame is what a rolling shutter does under mains
  // flicker, which is a real thing that happens to a real digital camera in a
  // fluorescent-lit store. A scanline is not.
  float rb = fract(uv.y + uTime * uRollSpeed);
  float band = smoothstep(0.0, 0.05, rb) * (1.0 - smoothstep(0.05, 0.14, rb));
  col *= 1.0 + band * uRoll;

  // --- 8. (the vignette used to be here. It is now section 4c, in linear,
  // before the transfer curve, because that is where a lens applies it and
  // because down here it was able to pull a clipped highlight back off the
  // clip. Nothing replaces it in the signal domain.)

  // --- 9. black pedestal ---------------------------------------------------
  // ROUND 8. The floor view reached ABSOLUTE ZERO: its 1st-percentile luma was
  // 0.0000 in every frame measured, and 2.8-3.4% of the picture sat under
  // 2/255. Across all 14 files in reference/ the 1st percentile runs 0.005 to
  // 0.073 (median 0.0155 = 4/255) and the sub-2/255 fraction runs 0.02% to
  // 2.5%. Nothing in the chain a DVR actually has produces a true zero: the
  // sensor carries a black offset, and the encoder is limited-range Y'CbCr,
  // where black IS 16 and the codeword below it does not exist.
  //
  // It goes AFTER the vignette on purpose. The pedestal is a signal level, so
  // it is the same in the corners as in the middle; putting it before the
  // vignette would let the corners fall back through it to zero, which is the
  // bug it exists to fix.
  col = uPed + (1.0 - uPed) * col;

  // AND THE CLAMP IS AT THE PEDESTAL, NOT AT ZERO, WHICH IS THE HALF OF THIS
  // THAT ACTUALLY MATTERED. Lifting the black floor on its own did almost
  // nothing, because section 6's grain is boosted 3.4x in the deep shadows and
  // swings +-0.095 there against a 0.016 floor: it just punched back through to
  // zero and 2.1% of the picture piled up on it again. Measured, at pedestal
  // 0.016: grain ON, p01 = 0.0000 and 2.07% at absolute zero; grain OFF, p01 =
  // 4/255 = 0.0157, which IS the reference median to three decimals. The grain
  // was the whole of it.
  //
  // Clipping shadow grain is not the error - real crushed footage does that,
  // and the reference set carries 0.02%-2.5% of its pixels under 2/255. The
  // error is clipping it at a codeword the recorder cannot emit. In a
  // limited-range stream black IS the pedestal and there is nothing below it,
  // so that is where the noise piles up.
  gl_FragColor = vec4(clamp(col, vec3(uPed), vec3(1.0)), 1.0);
}`,
};

// ---------------------------------------------------------------------------
// THE PANEL, AS ONE PIECE OF CODE, BECAUSE THERE USED TO BE TWO COPIES OF IT.
//
// ScreenShader and DeadShader both end with the same four things — stream
// scanlines, the backlight transfer, the glass sheen, the polariser lip — and
// until round 10 they ended with two hand-kept copies of them under a comment
// saying "Same panel physics tail as ScreenShader so a dark monitor sits in the
// same room as the live ones". That is the CLAUDE.md hazard verbatim:
// deliberate duplication with a comment explaining itself. It is one function
// now and neither shader has a second copy.
//
// ROUND 10 — AND THE TRANSFER IN THOSE COPIES COULD NOT SHOW A BLOWN LAMP ON
// SIX PANELS OUT OF EIGHT, BY ALGEBRA. Both copies read
//
//     col = col * 0.960 + 0.017;      // LCD backlight leak
//
// and the comment above it is correct physics — a screen showing black is not
// black, the backlight leaks through a closed cell. But a leak raises the
// FLOOR. That affine raises the floor AND drops the ceiling: its output for a
// full-white input is 0.977, so 2.3% of the range was gone before any
// panel-specific term ran. uPanel (0.990-1.003 in luma) and uDim (0.93-1.02)
// then multiplied on top, and the ceiling a panel could reach came out
//
//   plateau = ((uDim*0.960 + 0.017)*lumaPanel + 0.876*sheen) * (1 + 0.13*uActive)
//
// = 0.947 to 1.038 across the wall. CH04, CH05 and CH08 could not reach 0.98
// for ANY input; only the two panels that happened to land over 1.0 ever
// clipped, plus whichever one was selected and got the 13%. That closed form
// reproduces the critic's independently measured gain-6.0 plateau table to
// +-0.0013 on all eight channels, so this is the whole mechanism and not a
// contributor to it. uDim is the largest of the three multiplies and was not
// named in the gap note at all.
//
// WHAT IS HERE NOW is the same three facts in the shape they actually have.
//
//   LEAK   emitted = leak + (peak - leak) * signal. Same shape as the grade's
//          black pedestal (GradeShader section 9), one stage downstream, for
//          the same reason: a floor is a floor, not a squeeze. Black is still
//          not black — panelTail(0) is peak*uLeak, and uLeak is a uniform now
//          rather than a constant buried mid-expression, so it can be swept.
//
//   GAMMA  a panel's brightness/contrast setting and the age of its backlight
//          move the MIDTONES. uDim spent that as a linear multiply, which is
//          the one form of it that also moves the white point. gamma =
//          1 - log2(dim) puts the same spread in the transfer instead: at
//          signal 0.5 it reproduces the old level to the third decimal
//          (0.93 -> 1.1047 -> 0.4650 against 0.4650), and 1.0 still maps to 1.0.
//          The dim panels are still the dim panels; they are no longer capped.
//
//   PEAK   the panel's white, as a chromaticity at pinned luminance times one
//          shared observer headroom. THE NORMALISATION IS A PROPERTY OF THE
//          OBSERVER. The brightest thing in a security office is the monitor
//          wall, so the eye reading it is adapted to the wall, and no panel's
//          white can sit below the white point of an observer with nothing
//          brighter to look at. See panelPeak() in cctv.js for why it is
//          normalised on LUMA and not on the dimmest primary, and for
//          PANEL_HEADROOM.
//
// The sheen is ADDITIVE and sits after the transfer on purpose: it is room
// light bouncing off the front glass, not something the backlight emits, so it
// can and does push a panel past the clip on its own. The polariser lip is
// multiplicative and sits last because it is the cell, in front of everything.
// ---------------------------------------------------------------------------
const PANEL = /* glsl */`
float panelEdge(vec2 l, vec2 wh) {
  vec2 e = min(l, 1.0 - l) * wh;
  return min(e.x, e.y);
}
vec3 panelTail(vec3 sig, vec2 l, float lines, float scan, vec3 peak,
               float gamma, float leak, float sheen, float phase, float ep) {
  // Scanlines are the STREAM's rows, not the panel's — see the note in
  // ScreenShader. They are a modulation of the emitted picture, so they go in
  // front of the transfer, and half the rows still pass at full amplitude.
  sig *= 1.0 - scan * (0.5 + 0.5 * sin(l.y * lines * 3.14159265));
  sig = peak * (leak + (1.0 - leak) * pow(max(sig, vec3(0.0)), vec3(gamma)));
  float d = l.x * 0.78 + l.y * 0.60;
  sig += exp(-pow((d - (0.62 + 0.30 * sin(phase))) * 2.6, 2.0))
       * sheen * vec3(0.82, 0.88, 1.0);
  return sig * (0.74 + 0.26 * smoothstep(0.0, 4.0, ep));
}`;

// ---------------------------------------------------------------------------
// One monitor on the wall. Samples its own graded feed plus the shared burn-in
// canvas, then hands it to panelTail above.
// ---------------------------------------------------------------------------
export const ScreenShader = {
  name: 'CCTVScreen',
  uniforms: {
    tFeed:  { value: null },
    tOsd:   { value: null },   // THIS PANEL's own overlay, in panel uv. See note.
    uRect:  { value: null },   // x,y,w,h in px, TOP-LEFT origin
    uLines: { value: 104.0 },  // scanline pitch: rows of the STREAM, not the panel
    uGlass: { value: 0.035 },
    uSheen: { value: 0.05 },
    uPhase: { value: 0.0 },
    uActive:{ value: 0.0 },
    // ROUND 10: uDim IS GONE, replaced by uGamma. It was a linear multiply
    // 0.93-1.02 on the finished picture and it was the largest of the three
    // terms capping this panel's white point. See the PANEL note above.
    uGamma: { value: 1.0 },
    uLeak:  { value: 0.017 },  // LCD backlight leak: black is not black
    uScan:  { value: 0.07 },   // see note in the fragment shader
    uPanel: { value: null },   // this panel's PEAK white, see note above
  },
  vertexShader: QUAD_VERT,
  fragmentShader: /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tFeed, tOsd;
uniform vec4 uRect;
uniform float uLines;
uniform float uGlass, uSheen, uPhase, uActive, uGamma, uLeak, uScan;
uniform vec3 uPanel;
${PANEL}

void main() {
  vec2 l = vUv;

  // faint glass bulge — these are flat panels, so this stays near zero
  float a = uRect.z / uRect.w;
  vec2 c = (l - 0.5) * vec2(a, 1.0);
  float r2 = dot(c, c);
  float rmax = 0.25 * a * a + 0.25;
  vec2 fuv = c * (1.0 + uGlass * r2) / (1.0 + uGlass * rmax) / vec2(a, 1.0) + 0.5;

  vec3 col = texture2D(tFeed, fuv).rgb;

  // ROUND 4. The OSD is now PER PANEL, in the panel's own uv, and sampled
  // through the SAME glass bulge as the picture. Two reasons, and the second is
  // the one that mattered:
  //   1. one shared 1280x720 overlay meant every channel's text was drawn at
  //      wall scale, so a 138px thumbnail carried a channel id a third of its
  //      width. Per-panel canvases let a thumbnail print 5px type and the spot
  //      monitor print a real timestamp.
  //   2. the analytics boxes live in here, and a box that does not sit through
  //      the same glass as the man it is drawn around is not a box round a man.
  vec4 b = texture2D(tOsd, fuv);
  col = mix(col, b.rgb, b.a);

  // Scanlines live HERE and not in the grade pass on purpose. The OSD is
  // composited into the recorded stream, so the timestamp has to carry the same
  // line structure as the picture under it. Text that stays perfectly crisp
  // while the video is degraded is the loudest "this is a game HUD" tell there
  // is. uLines is the STREAM's row count rather than the panel's: a 432-line
  // substream blown up onto a 431px spot monitor has 432 lines, and a 768x432
  // mainstream on the same glass has 432 too — but a 104-line thumbnail
  // upscaled has 104, and pretending otherwise is what made every panel on the
  // round-3 wall read as the same panel.
  // Scanlines, the backlight transfer, the sheen and the polariser lip are all
  // panelTail() now — one owner, shared with DeadShader. Every panel on a real
  // wall has a different white point (bought in different years, backlights age
  // at different rates) and a different brightness setting; those are uPanel
  // and uGamma, and neither of them is allowed to cap the white any more.
  float ep = panelEdge(l, uRect.zw);
  col = panelTail(col, l, uLines, uScan, uPanel, uGamma, uLeak,
                  uSheen, uPhase, ep);

  // selected channel: brighter panel + a hard bright border
  col *= 1.0 + uActive * 0.13;
  col = mix(col, vec3(0.88, 0.99, 0.92), (1.0 - smoothstep(1.0, 2.6, ep)) * uActive * 0.92);

  gl_FragColor = vec4(col, 1.0);
}`,
};

// ---------------------------------------------------------------------------
// A monitor with nothing on the other end of the cable. Two flavours:
//   mode 0  SWITCHED OFF — a dead tube, so a dark grey mirror with the room's
//           own gradient in it and a whisper of static dust. Nothing moves.
//   mode 1  the manufacturer's blue NO SIGNAL card on a modern panel.
// It calls the SAME panelTail as ScreenShader so a dark monitor sits in the same
// room as the live ones. Round 10: it used to be a hand-kept copy of that tail,
// under a comment saying so, and it carried the same white-point bug — which is
// exactly what CLAUDE.md says a comment explaining a duplication is worth.
//
// ROUND 6 REPLACED MODE 0's ANALOGUE SNOW. The snow was a full-rate animated
// noise field on a 116x87 panel, running 100% of every shift and quantised to
// 30 Hz so it flickered rather than crawled. Measured against the round-6
// question — "what fraction of a shift is this element animating, and what does
// it say?" — it scored 100% and nothing. A switched-off tube keeps every bit of
// the character (the crooked bracket, the beige plastic, the TEST silkscreen,
// the tape over the LED) and costs the eye one glance instead of all of them.
// It is also what actually happens to a test set nobody has used since 2014.
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
    uLeak:  { value: 0.017 },
  },
  vertexShader: QUAD_VERT,
  fragmentShader: /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tCard;
uniform vec4 uRect;
uniform vec2 uRes;
uniform float uMode, uTime, uSeed, uSheen, uPhase, uScan, uLeak;
uniform vec3 uPanel;
${COMMON}
${PANEL}

void main() {
  vec2 l = vUv;
  vec2 fc = gl_FragCoord.xy;
  vec3 col;

  if (uMode < 0.5) {
    // Switched off. A dead tube is a slightly green-grey mirror: it reflects the
    // room, so it is darkest at the top where the wall is and lifts a little at
    // the bottom where the desk lamp is. uSeed is deliberately NOT used — the
    // dust speckle is a function of position alone, so this panel is bit-identical
    // from frame to frame and your eye parks it after one look.
    float dust = h21(floor(fc * 0.5)) * 0.5 + h21(fc) * 0.5;
    col = mix(vec3(0.020, 0.023, 0.026), vec3(0.041, 0.045, 0.047), l.y);
    col += (dust - 0.5) * 0.010;
    // the faint band of room light the curved glass gathers across its middle
    col += 0.010 * exp(-pow((l.y - 0.42) * 3.4, 2.0));
  } else {
    col = mix(vec3(0.030, 0.049, 0.132), vec3(0.015, 0.026, 0.079), l.y);
    col += 0.008 * (h21(fc * 0.9 + uSeed) - 0.5);
  }

  vec2 cp = uRect.xy + vec2(l.x, 1.0 - l.y) * uRect.zw;
  vec4 c = texture2D(tCard, vec2(cp.x / uRes.x, 1.0 - cp.y / uRes.y));
  col = mix(col, c.rgb, c.a);

  // A dark panel has no brightness setting worth varying, so gamma is 1. Its
  // scanline pitch is the PANEL's rows, not a stream's — there is no stream.
  col = panelTail(col, l, uRect.w, uScan, uPanel, 1.0, uLeak,
                  uSheen, uPhase, panelEdge(l, uRect.zw));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`,
};
