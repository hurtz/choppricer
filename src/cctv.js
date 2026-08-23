// OWNER: builder-cctv. Security-footage look + the monitor wall.
// CONTRACT — must keep exporting exactly this:
//   createCCTV(THREE, renderer, scene) -> {
//     renderWall(dt),                 // draw the multi-monitor desk view
//     renderFloor(dt, camera),        // draw the on-foot view, CCTV-graded
//     setActiveCam(i), resize(w,h)
//   }
// Also exposed (additive, for builder-game — safe to ignore):
//   cams            PerspectiveCamera[] , index-aligned to CAMERAS
//   tiles           [{x,y,w,h}]  screen rect of each feed, TOP-LEFT origin, in a
//                   FIXED 1280x720 design space. These never change, at any
//                   canvas size and at any selection — the whole desk is scaled
//                   to the canvas by its ortho camera. Place HUD against them
//                   directly. tiles.length === CAMERAS.length, ALWAYS.
//                   ROUND 4 KEEPS THIS PROMISE: tiles are the THUMBNAILS. The
//                   new big monitor is a separate physical panel (`spot`) and no
//                   tile ever migrates onto it, so click regions, the active
//                   channel chrome and the subject badges all still land on the
//                   monitor the player actually clicks.
//   active          index of the selected channel
//   params          { wall, spot, floor } live grade strengths, see GRADE_PRESET
//   setParams(view, patch)         dial any effect per view at runtime
//   floorBurnIn     bool, timestamp overlay on the on-foot view
//   panels          physical monitors, including the ones no camera is on
//   spot            { panel, cam, zoom, track, stream } the big monitor's state
//   setSubjects(list)              OPTIONAL cross-reference from builder-game,
//                   [{code,x,z,flagged}]. Renames a detected blob from T04 to
//                   SUBJ-04 so the box on the picture and the roster row agree.
//                   Detection does not depend on it; without it you get T-codes.
//   cycleTrack()    step the spot monitor's auto-track onto the next subject
//   tracks          the motion detector's live blobs (see cctv/track.js)
//   detector        the detector itself, for critics and the harness
//   channelsFor(x,z,h)             which channels can ACTUALLY see that point,
//                   nearest first — frustum plus line of sight through the
//                   store's colliders. Offered to builder-game to replace the
//                   zone table in camFor(); see the note on the method.
//   stats           { renders, spotRenders, thumbRenders } counters, for budget
//
// ===========================================================================
// ROUND 4 — THE MONITORS ARE THE GAME AGAIN
// ===========================================================================
// The playtest note: "the effect of all the CCTV cameras is cool, but you can't
// really look at them and determine crime is going on." Correct, and structural.
// The player identified thieves by READING THE ROSTER, and the wall was scenery.
//
// Three things had to change and none of them is a filter.
//
// 1. SIZE. A subject 12 m down an aisle through a 98-degree dome is 8.3 degrees
//    tall — fourteen pixels on a 190px panel. There is no grade, no sharpening
//    and no colour that makes fourteen pixels legible. So one monitor is now
//    766x431 and the eight others are explicitly demoted to motion detectors.
//
// 2. LENS. Even at 431px a wide dome puts a man at 55 px. The spot monitor is
//    therefore a PTZ: selecting a channel walks the dome onto the strongest
//    motion and pushes in until the subject is ~22% of frame height, which is
//    95-130 px — a person whose ARM you can see move. The push-in is announced
//    on the OSD ("PTZ 2.1X") because a picture that silently crops is a picture
//    you cannot trust.
//
// 3. ANALYTICS THAT SAY WHERE, NOT WHO. Every blob gets a box and a token, and
//    the tokens are pure kinematics — MOTION, STOPPED 0:04, LOITER. A guilty
//    concealment and an innocent reading a label BOTH produce "a subject who
//    stopped", because to a motion detector they are the same event. The wall
//    tells you where to point the good monitor. Only your eyes tell you what
//    happened. See cctv/track.js — it is handed `scene` and never sees agents.js.
//
// THE MEASUREMENT THAT UNLOCKED IT: a scene render into this store costs
// ~2.0-2.7 ms at EVERY resolution from 190x143 to 1664x936 (bench in the round-4
// report). The store is draw-call bound, not fill bound, so a four-times-bigger
// picture is free and the only real budget is renders per second. That is why
// the mosaic now runs a slow SUBSTREAM (5-9 fps, heavy macroblocking) and the
// spot monitor runs a MAINSTREAM (15 fps, clean) — which is both what a real DVR
// does and what keeps the total under the old one.
//
// NOTE TO LEAD: vendor/EffectComposer.js cannot load — it imports
// '../shaders/CopyShader.js' and './MaskPass.js', neither of which exists on the
// server (both 404). ShaderPass.js and Pass.js are fine. This file therefore
// runs its own three-target chain built on Pass.js's FullScreenQuad; nothing
// else is needed from the composer.
import { CAMERAS } from './config.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GradeShader, ScreenShader, DeadShader } from './cctv/shaders.js';
import { layoutWall, WALL } from './cctv/layout.js';
import { createTracker, project } from './cctv/track.js';
import {
  makeCanvas, paintFurniture, paintFloorBurnIn, paintDeadCards,
  paintThumbOsd, paintSpotOsd,
} from './cctv/overlay.js';

// The wall is AUTHORED in 1280x720 design space and only ever drawn in it. Every
// slot rect, every tile rect, and all three overlay canvases are design pixels;
// the ortho camera maps the whole design frame to whatever the canvas happens to
// be. Round 1 resized the ortho camera to the real canvas instead, which left
// the hand-placed tile rects sitting in the corner of a larger frustum and tore
// the wall apart on any canvas that was not exactly 1280x720.
const DES_W = WALL.W, DES_H = WALL.H;
const FEED_SS = 2;                  // supersample the substream render
const SPOT_SS = 1.5;                // ...and the mainstream
const FLOOR_SS = 1.5;

// The spot monitor's encoded stream. Decoupled from the panel size ON PURPOSE:
// a DVR feeding a 766px monitor from a 768x432 mainstream is exactly what the
// hardware does, it means the grain and the scanlines land on STREAM rows rather
// than panel rows, and it is why the big picture still reads as footage instead
// of turning into a clean 3D render the moment it got big.
const SPOT_W = 768, SPOT_H = 432, SPOT_FPS = 15;

// --- how hard the dome pushes in --------------------------------------------
// SUBJ_FRAC is the fraction of frame height a tracked person is driven to. The
// numbers behind the choice, for a 431px panel, all built and looked at:
//   0.10  43 px — the round-3 primary. You can see a man. Not what he is doing.
//   0.22  95 px — the first thing I shipped this round, and it is NOT ENOUGH.
//                 The body reads; the arm is a quarter of the body, so the part
//                 that carries the whole tell is 24 px against a store whose
//                 every shelf is printed card at the same scale. It disappears.
//   0.32 138 px — SHIPPED. The arm is ~35 px, which is enough travel to see a
//                 hand leave a shelf and arrive at a chest, and enough to see
//                 the head turn. You can still tell which aisle he is in.
//   0.45 194 px — the arm is unmissable and so is the loss: no aisle, no
//                 neighbours, no "he is drifting toward the front". The picture
//                 stops being surveillance and becomes a cutscene.
// MAX_ZOOM caps it so a subject at the far end of a 26 m aisle does not turn the
// dome into a telescope with a two-metre field of view.
const SUBJ_FRAC = 0.32, MIN_ZOOM = 1.0, MAX_ZOOM = 3.4;
const HOLD_T = 2.2;                 // seconds before the tracker may switch lock
const ZOOM_TAU = 0.45, AIM_TAU = 0.22;

// --- per-channel personality ------------------------------------------------
// Real DVR walls are never uniform: different camera generations, different
// cable runs, one that somebody pointed at a light. Hand-authored, not random,
// so screenshots stay comparable between rounds.
// `gain`, `sharp` and `bloom` multiply the view preset; the rest override it.
// `sharp` is the in-camera edge enhancement — positive is the crunchy halo every
// cheap IP camera puts around a shelf lip. CH04 is negative because somebody
// knocked that dome months ago and nobody ever refocused it.
// `hfov` is the LENS, in degrees horizontal, and the vertical is derived from
// whatever monitor the channel lands on. That is the right way round: a camera
// does not change what it sees because you plugged it into a widescreen.
//
// ROUND 4: `fps` is now the MAINSTREAM rate. The mosaic runs `fps * SUB_FPS` —
// a real substream is slower as well as smaller, and a mosaic that judders while
// the spot monitor is smooth is both true and the clearest possible statement of
// which picture you are supposed to be reading.
const SUB_FPS = 0.62;
const CHAN = [
  { fps: 10, hfov: 98,  gain: 1.00, tint: [1.035, 1.000, 0.955], noise: 0.038, barrel: 0.30, sat: 0.92, scan: 0.062, blocky: 0.16, sharp:  1.00, bloom: 1.00, glitch: 0 },
  { fps: 8,  hfov: 97,  gain: 0.95, tint: [0.955, 1.030, 0.960], noise: 0.050, barrel: 0.34, sat: 0.84, scan: 0.072, blocky: 0.20, sharp:  1.27, bloom: 1.13, glitch: 0 },
  { fps: 12, hfov: 99,  gain: 1.10, tint: [1.010, 1.005, 0.990], noise: 0.030, barrel: 0.27, sat: 0.96, scan: 0.052, blocky: 0.12, sharp:  0.73, bloom: 0.87, glitch: 0 },
  { fps: 9,  hfov: 96,  gain: 0.80, tint: [0.950, 0.985, 1.070], noise: 0.070, barrel: 0.33, sat: 0.72, scan: 0.078, blocky: 0.26, sharp: -1.00, bloom: 1.45, glitch: 0 },
  { fps: 14, hfov: 102, gain: 1.02, tint: [1.000, 1.000, 1.000], noise: 0.030, barrel: 0.34, sat: 0.93, scan: 0.050, blocky: 0.11, sharp:  1.05, bloom: 1.00, glitch: 5.5 },
  { fps: 8,  hfov: 98,  gain: 0.90, tint: [1.045, 0.995, 0.945], noise: 0.058, barrel: 0.30, sat: 0.88, scan: 0.070, blocky: 0.30, sharp:  1.55, bloom: 0.91, glitch: 0 },
  { fps: 12, hfov: 94,  gain: 1.05, tint: [0.965, 1.020, 0.975], noise: 0.036, barrel: 0.36, sat: 0.92, scan: 0.058, blocky: 0.14, sharp:  0.91, bloom: 1.05, glitch: 11.0 },
  { fps: 10, hfov: 96,  gain: 0.97, tint: [1.000, 1.010, 1.010], noise: 0.052, barrel: 0.33, sat: 0.86, scan: 0.082, blocky: 0.22, sharp:  1.18, bloom: 0.95, glitch: 0 },
  // CAM 09 DOOR 2: bought this year, so it is the sharpest and least noisy thing
  // on the wall and its lens is tighter than the 2011 domes.
  { fps: 13, hfov: 90,  gain: 1.04, tint: [0.992, 1.000, 1.008], noise: 0.026, barrel: 0.22, sat: 0.95, scan: 0.046, blocky: 0.09, sharp:  1.34, bloom: 0.94, glitch: 0 },
];

// Past the authored table, vary deterministically off the index instead of
// falling off the end. A tenth camera gets a plausible personality, not a crash.
const derived = [];
function chanFor(i) {
  if (CHAN[i]) return CHAN[i];
  if (derived[i]) return derived[i];
  const base = CHAN[i % CHAN.length];
  const k = ((i * 2654435761) >>> 0) / 4294967296;
  derived[i] = {
    ...base,
    fps: 8 + ((i * 5) % 5),
    hfov: 92 + ((i * 7) % 11),
    gain: 0.88 + k * 0.24,
    tint: [1 + (k - 0.5) * 0.08, 1 + (0.5 - k) * 0.04, 1 + (k - 0.5) * -0.06],
    noise: 0.030 + k * 0.036,
    sat: 0.78 + k * 0.20,
    scan: 0.050 + k * 0.032,
    glitch: k > 0.78 ? 7 + k * 8 : 0,
  };
  return derived[i];
}

// Baseline strengths. Wall feeds get the full treatment; the floor view is the
// same recorder but a lot lighter — you still have to be able to play on it.
//
// `ca` is now in PIXELS of red/blue separation at the extreme corner, and the
// ramp is flat across the middle of the frame (see shaders.js). ~1px is what a
// cheap dome lens actually does. Anything past 2 reads as a broken anaglyph.
//
// `scan` on the wall is NOT consumed here: the wall's scanlines are applied by
// ScreenShader instead, so they land on the burnt-in timestamp too. The per
// channel value is forwarded to that material in the screens loop below.
//
// ROUND 3 RE-JUDGEMENT. These were dialled when the store was grey boxes, and
// they have been too polite ever since the shelves filled up. Against dense
// printed packaging, recessed troffers and a reflective floor, the round-2
// numbers left a clean render with a timestamp on it:
//   * chroma/blocky UP — colour packaging is what makes 4:2:0 subsampling and
//     macroblocking visible at all. On grey boxes there was nothing to smear.
//   * bloom UP and its threshold DOWN — the ceiling now HAS troffers, and a
//     $60 camera cannot hold them. They have to bleed into the tile grid.
//   * contrast/black/knee UP — a reflective floor was landing in the same milky
//     band as the ceiling. Crushing the shadows is what separates them.
//   * noise UP — grain has to survive being seen next to detailed content.
const GRADE_PRESET = {
  // the MOSAIC. Small, slow, heavily compressed — a substream, and it looks it.
  wall: {
    barrel: 0.32, ca: 1.15, chroma: 0.74, blocky: 0.26, sharp: 0.55,
    bloom: 1.06, bloomThr: 0.64,
    gain: 1.0, black: 0.072, pivot: 0.50, contrast: 1.35, knee: 0.75,
    highlight: 0.40, sat: 0.82,
    noise: 0.060, scan: 0.070, roll: 0.050, rollSpeed: 0.055, vign: 0.40,
  },
  // THE SPOT MONITOR — the mainstream, and the one picture in this game that has
  // to hold evidence. Everything that costs a READ is pulled back and everything
  // that only costs prettiness is kept, because "is that his hand or his bag" is
  // decided here:
  //   blocky 0.26 -> 0.09  macroblocks are 8px of the STREAM, which is 14px of
  //                        this panel. At 0.26 a whole forearm lands in one flat
  //                        block and the concealment is gone.
  //   chroma 0.74 -> 0.42  a red sleeve against a red shelf is the exact case
  //                        4:2:0 destroys, and half this store is printed card.
  //   noise  0.060 -> 0.036  grain at 431px is grain over the subject, not over
  //                        a thumbnail. Still visibly noisy; no longer a snowfall.
  //   vign   0.40 -> 0.26  the corners of a wide dome are where a man leaves.
  // Sharpening goes UP, not down: a real DVR mainstream has MORE edge
  // enhancement than its substream, and the halo it puts on a shoulder is the
  // single most useful artefact on this wall.
  spot: {
    barrel: 0.32, ca: 0.95, chroma: 0.42, blocky: 0.09, sharp: 0.68,
    bloom: 1.00, bloomThr: 0.66,
    gain: 1.0, black: 0.062, pivot: 0.50, contrast: 1.30, knee: 0.77,
    highlight: 0.36, sat: 0.86,
    noise: 0.036, scan: 0.052, roll: 0.040, rollSpeed: 0.045, vign: 0.26,
  },
  // The floor view was the piece I flagged in round 2 as "a clean 3D render with
  // a timestamp on it", and it still was. The constraint is that you have to be
  // able to PLAY on it, so the terms that got pushed are the ones that read as
  // "recorded" at a glance without eating a shelf edge or a price tag:
  // scanlines, vignette, highlight bleed off the troffers, the roll band, and
  // colour. Sharpening and macroblocking stayed low on purpose — those are the
  // two that would actually cost you a read on a subject at twenty metres.
  floor: {
    barrel: 0.12, ca: 0.90, chroma: 0.62, blocky: 0.13, sharp: 0.34,
    bloom: 1.00, bloomThr: 0.63,
    gain: 1.0, black: 0.052, pivot: 0.48, contrast: 1.27, knee: 0.78,
    highlight: 0.33, sat: 0.855,
    noise: 0.056, scan: 0.078, roll: 0.038, rollSpeed: 0.040, vign: 0.37,
  },
};

const DEG = Math.PI / 180;
// A camera has one lens. Give it the horizontal field it actually has and let
// the monitor's aspect decide how much vertical you get.
const vfovFor = (hfov, aspect) =>
  2 * Math.atan(Math.tan(hfov * DEG / 2) / aspect) / DEG;
const hfovFor = (vfov, aspect) =>
  2 * Math.atan(Math.tan(vfov * DEG / 2) * aspect) / DEG;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// `opts.cameras` is purely additive and exists so the wall can be exercised at a
// camera count config.js does not currently declare — main.js calls this with
// three arguments and gets config.CAMERAS, exactly as before.
export function createCCTV(THREE, renderer, scene, opts = {}) {
  let W = 1280, H = 720;
  const CAMS = opts.cameras || CAMERAS;

  // ---- the physical wall ---------------------------------------------------
  const plan = layoutWall(CAMS);
  const tiles = plan.tiles;
  const spotP = plan.spot;
  const spotAspect = spotP.w / spotP.h;

  // ---- cameras ------------------------------------------------------------
  const cams = CAMS.map((c, i) => {
    const t = tiles[i];
    const aspect = t.w / t.h;
    const cam = new THREE.PerspectiveCamera(
      vfovFor(chanFor(i).hfov, aspect), aspect, 0.1, 140);
    cam.position.set(...c.pos);
    cam.lookAt(new THREE.Vector3(...c.look));
    cam.updateProjectionMatrix();
    return cam;
  });
  // The dome, as the operator drives it. Same body as the selected channel — it
  // is the SAME CAMERA, pointed — so it inherits that channel's position, its
  // lens personality and its grain, and only the pan/tilt/zoom differ.
  const spotCam = new THREE.PerspectiveCamera(60, spotAspect, 0.1, 140);
  let active = 0;

  // ---- render targets -----------------------------------------------------
  // One PERSISTENT target per channel, at that channel's exact panel size — this
  // is where its last decoded frame lives between re-renders. Plus one TRANSIENT
  // supersampled target per distinct panel size, shared by every channel of that
  // size, which is where the raw 3D render lands before the grade.
  const rtOpts = {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
  };
  const rawBySize = new Map();
  function rawFor(w, h, ss) {
    const key = `${w}x${h}`;
    let rt = rawBySize.get(key);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(
        Math.round(w * ss), Math.round(h * ss), rtOpts);
      rawBySize.set(key, rt);
    }
    return rt;
  }
  const streamRT = (w, h) => {
    const rt = new THREE.WebGLRenderTarget(w, h, { ...rtOpts, depthBuffer: false });
    rt.texture.colorSpace = THREE.NoColorSpace;   // we write display-ready sRGB
    return rt;
  };
  const feedRT = CAMS.map((_, i) => {
    const t = tiles[i];
    rawFor(t.w, t.h, FEED_SS);
    return streamRT(t.w, t.h);
  });
  rawFor(SPOT_W, SPOT_H, SPOT_SS);
  const spotRT = streamRT(SPOT_W, SPOT_H);
  let floorRaw = new THREE.WebGLRenderTarget(
    Math.round(W * FLOOR_SS), Math.round(H * FLOOR_SS), rtOpts);

  // ---- the grade pass -----------------------------------------------------
  const gradeMat = new THREE.ShaderMaterial({
    name: GradeShader.name,
    uniforms: THREE.UniformsUtils.clone(GradeShader.uniforms),
    vertexShader: GradeShader.vertexShader,
    fragmentShader: GradeShader.fragmentShader,
    depthTest: false, depthWrite: false,
  });
  gradeMat.uniforms.uTint.value = new THREE.Vector3(1, 1, 1);
  gradeMat.uniforms.uRes.value = new THREE.Vector2(320, 240);
  const gradeQuad = new FullScreenQuad(gradeMat);

  // ---- the wall scene: N screens + the spot + the dark ones + furniture ----
  const wallScene = new THREE.Scene();
  wallScene.background = new THREE.Color(0x040507);
  const wallCam = new THREE.OrthographicCamera(0, DES_W, DES_H, 0, -10, 10);

  const deadCv = makeCanvas(DES_W, DES_H);
  paintDeadCards(deadCv, DES_W, DES_H, plan.dead);
  const deadTex = new THREE.CanvasTexture(deadCv);
  deadTex.colorSpace = THREE.SRGBColorSpace;
  deadTex.minFilter = deadTex.magFilter = THREE.NearestFilter;
  deadTex.generateMipmaps = false;

  const furnCv = makeCanvas(DES_W, DES_H);
  paintFurniture(furnCv, DES_W, DES_H, plan.panels, WALL, plan.deck, plan.pocket);
  const furnTex = new THREE.CanvasTexture(furnCv);
  furnTex.colorSpace = THREE.SRGBColorSpace;
  furnTex.minFilter = furnTex.magFilter = THREE.LinearFilter;
  furnTex.generateMipmaps = false;

  const quadGeo = new THREE.PlaneGeometry(1, 1);

  // Design space has y down; the ortho camera has y up. A panel screwed to the
  // wall crooked therefore rotates the opposite way here than it does on the
  // furniture canvas, and both rotate about the centre of the glass so the case
  // and the picture inside it stay locked together.
  function placeQuad(mesh, p) {
    mesh.position.set(p.x + p.w / 2, DES_H - (p.y + p.h / 2), 0);
    mesh.scale.set(p.w, p.h, 1);
    mesh.rotation.z = -(p.rot || 0);
  }

  // Each live panel now owns its OSD canvas, at the resolution of its own
  // stream, so the text on a 138px thumbnail is 138px text. See overlay.js.
  function makeScreen(p, feedTex, osdW, osdH, lines, scan) {
    const cv = makeCanvas(osdW, osdH);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const m = new THREE.ShaderMaterial({
      name: ScreenShader.name,
      uniforms: THREE.UniformsUtils.clone(ScreenShader.uniforms),
      vertexShader: ScreenShader.vertexShader,
      fragmentShader: ScreenShader.fragmentShader,
      depthTest: false, depthWrite: false, transparent: true,
    });
    m.uniforms.tFeed.value = feedTex;
    m.uniforms.tOsd.value = tex;
    m.uniforms.uRect.value = new THREE.Vector4(p.x, p.y, p.w, p.h);
    m.uniforms.uLines.value = lines;
    m.uniforms.uPhase.value = (p.slot + 1) * 1.37;
    m.uniforms.uSheen.value = p.sheen;
    m.uniforms.uDim.value = 0.93 + ((p.slot + 1) % 4) * 0.030;
    m.uniforms.uScan.value = scan;
    m.uniforms.uPanel.value = new THREE.Vector3(...p.white);
    const mesh = new THREE.Mesh(quadGeo, m);
    placeQuad(mesh, p);
    mesh.renderOrder = 1;
    wallScene.add(mesh);
    return { mesh, m, p, cv, tex };
  }

  const screens = [];                 // index-aligned to CAMERAS
  for (const p of plan.live) {
    const i = p.cam;
    screens[i] = makeScreen(p, feedRT[i].texture, p.w, p.h, p.h, chanFor(i).scan);
  }
  // The spot monitor's OSD is drawn at STREAM resolution, not panel resolution:
  // the analytics box and the timestamp are composited by the recorder into the
  // 768x432 stream, so they get upscaled onto the glass with the picture. That
  // one decision is why the big monitor still reads as footage.
  const spot = makeScreen(spotP, spotRT.texture, SPOT_W, SPOT_H, SPOT_H, 0.052);
  spot.m.uniforms.uDim.value = 1.0;
  spot.m.uniforms.uActive.value = 1.0;

  const deads = plan.dead.map((p) => {
    const m = new THREE.ShaderMaterial({
      name: DeadShader.name,
      uniforms: THREE.UniformsUtils.clone(DeadShader.uniforms),
      vertexShader: DeadShader.vertexShader,
      fragmentShader: DeadShader.fragmentShader,
      depthTest: false, depthWrite: false,
    });
    m.uniforms.tCard.value = deadTex;
    m.uniforms.uRect.value = new THREE.Vector4(p.x, p.y, p.w, p.h);
    m.uniforms.uRes.value = new THREE.Vector2(DES_W, DES_H);
    m.uniforms.uMode.value = p.deadMode;
    m.uniforms.uSheen.value = p.sheen;
    m.uniforms.uPhase.value = p.slot * 1.37;
    m.uniforms.uScan.value = p.deadMode === 0 ? 0.10 : 0.05;
    m.uniforms.uPanel.value = new THREE.Vector3(...p.white);
    const mesh = new THREE.Mesh(quadGeo, m);
    placeQuad(mesh, p);
    mesh.renderOrder = 1;
    wallScene.add(mesh);
    return { mesh, m, p };
  });

  const furnMesh = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({
    map: furnTex, transparent: true, depthTest: false, depthWrite: false,
  }));
  furnMesh.position.set(DES_W / 2, DES_H / 2, 0);
  furnMesh.scale.set(DES_W, DES_H, 1);
  furnMesh.renderOrder = 2;
  wallScene.add(furnMesh);

  // ---- floor overlay (timestamp on the on-foot view) ----------------------
  const fBurnCv = makeCanvas(DES_W, DES_H);
  const fBurnTex = new THREE.CanvasTexture(fBurnCv);
  fBurnTex.colorSpace = THREE.SRGBColorSpace;
  fBurnTex.minFilter = fBurnTex.magFilter = THREE.NearestFilter;
  fBurnTex.generateMipmaps = false;
  const floorScene = new THREE.Scene();
  const floorCamOrtho = new THREE.OrthographicCamera(0, DES_W, DES_H, 0, -10, 10);
  const floorOverlay = new THREE.Mesh(quadGeo, new THREE.MeshBasicMaterial({
    map: fBurnTex, transparent: true, depthTest: false, depthWrite: false,
  }));
  floorOverlay.position.set(DES_W / 2, DES_H / 2, 0);
  floorOverlay.scale.set(DES_W, DES_H, 1);
  floorScene.add(floorOverlay);

  // ---- the motion detector ------------------------------------------------
  const tracker = createTracker(THREE, scene);
  const _p = new THREE.Vector3();
  const _feet = {}, _head = {};

  // The detector needs to know what it CANNOT see through — see track.js. The
  // store's own collider set is exactly that list. main.js constructs us with
  // three arguments today, so this is resolved lazily from the same
  // window.__CHOP fallback builder-game already uses for `cctv`; pass
  // { world } in opts and it is picked up immediately instead.
  //
  // LEAD: the one-word version of this is `createCCTV(THREE, renderer, scene,
  // { world })` in main.js. Nothing breaks without it — occlusion simply stays
  // off until the fallback resolves on the first wall frame.
  let occluded = false;
  function ensureOccluders() {
    if (occluded) return;
    const w = opts.world
      || (typeof window !== 'undefined' && window.__CHOP && window.__CHOP.world);
    if (!w || !w.colliders) return;
    tracker.setOccluders(w.colliders);
    occluded = true;
  }

  // Project a blob into a panel. `k` is the barrel the grade will apply to that
  // feed, so the box lands where the man is drawn and not where he would have
  // been through a rectilinear lens.
  function boxOf(cam, tr, pw, ph, k, aspect) {
    _p.set(tr.x, 0.02, tr.z);
    const f = project(cam, _p, aspect, k, _feet);
    if (!f) return null;
    _p.set(tr.x, tr.h, tr.z);
    const hd = project(cam, _p, aspect, k, _head);
    if (!hd) return null;
    const y0 = hd.y * ph, y1 = f.y * ph;
    const hpx = Math.max(4, y1 - y0);
    const wpx = Math.max(4, hpx * (2.1 * tr.r / tr.h));
    const cx = ((f.x + hd.x) * 0.5) * pw;
    const b = { x: cx - wpx / 2, y: y0 - hpx * 0.10, w: wpx, h: hpx * 1.14 };
    // reject anything whose box is entirely off the glass; a box clinging to the
    // edge of a frame the subject already left is worse than no box
    if (b.x + b.w < 2 || b.x > pw - 2 || b.y + b.h < 2 || b.y > ph - 2) return null;
    return b;
  }

  // ---- feed scheduling ----------------------------------------------------
  // Every channel at its own substream rate, staggered. Round-robin re-render is
  // the whole judder effect: nothing in this mosaic is ever in sync with
  // anything else. The spot monitor is scheduled FIRST and separately, because
  // the one picture you are reading evidence off must not lose its slot to a
  // thumbnail.
  const feeds = CAMS.map((_, i) => {
    const ch = chanFor(i);
    return {
      interval: 1 / (ch.fps * SUB_FPS),
      due: (i * 0.137) % 0.2,
      frames: i * 3,
      glitchAt: ch.glitch ? ch.glitch * (0.3 + 0.1 * i) : -1,
      glitchY: -1,
      energy: 0, alarm: 0, osdKey: '',
    };
  });
  const spotFeed = { interval: 1 / SPOT_FPS, due: 0, frames: 0 };
  let cursor = 0, tWall = 0, tFloor = 0, floorFrames = 0, primed = false;
  const params = {
    wall: { ...GRADE_PRESET.wall },
    spot: { ...GRADE_PRESET.spot },
    floor: { ...GRADE_PRESET.floor },
  };
  const stats = { renders: 0, spotRenders: 0, thumbRenders: 0 };

  // ---- PTZ state ----------------------------------------------------------
  const aim = new THREE.Vector3();          // where the dome is looking, smoothed
  const aimWant = new THREE.Vector3();
  let zoom = 1, zoomWant = 1;
  let lock = null, lockAt = -99, trackI = 0, trackN = 0;

  // Shadow maps cost a full extra pass per renderer.render(); with up to three
  // renders a frame that triples the bill. Update them once per frame instead.
  renderer.shadowMap.autoUpdate = false;
  let shadowTick = -1;
  function frameShadow(t) {
    if (t !== shadowTick) { shadowTick = t; renderer.shadowMap.needsUpdate = true; }
  }

  const tintV = new THREE.Vector3();
  function applyGrade(p, ch, res, seed, time, glitchY, over) {
    const u = gradeMat.uniforms;
    const o = over || {};
    u.uRes.value.set(res[0], res[1]);
    u.uAspect.value = res[0] / res[1];
    u.uSeed.value = seed;
    u.uTime.value = time;
    u.uLinearIn.value = 1;
    u.uBarrel.value = o.barrel != null ? o.barrel : (ch ? ch.barrel : p.barrel);
    u.uCA.value = p.ca;
    u.uChroma.value = p.chroma;
    u.uBlocky.value = o.blocky != null ? o.blocky : (ch ? ch.blocky : p.blocky);
    u.uSharp.value = p.sharp * (ch ? ch.sharp : 1);
    u.uBloom.value = p.bloom * (ch ? ch.bloom : 1);
    u.uBloomThr.value = p.bloomThr;
    u.uGain.value = p.gain * (ch ? ch.gain : 1);
    u.uBlack.value = p.black;
    u.uPivot.value = p.pivot;
    u.uContrast.value = p.contrast;
    u.uKnee.value = p.knee;
    u.uHighlight.value = p.highlight;
    u.uSat.value = ch ? ch.sat : p.sat;
    tintV.set(...(ch ? ch.tint : [1, 1, 1]));
    u.uTint.value.copy(tintV);
    u.uNoise.value = o.noise != null ? o.noise : (ch ? ch.noise : p.noise);
    // wall channels get their scanlines from ScreenShader, over the OSD too
    u.uScan.value = ch ? 0 : p.scan;
    u.uRoll.value = p.roll;
    u.uRollSpeed.value = p.rollSpeed;
    u.uVign.value = p.vign;
    u.uGlitch.value = glitchY >= 0 ? 0.055 : 0;
    u.uGlitchY.value = glitchY;
  }

  function renderThrough(cam, raw, out, grade, ch, res, seed, glitchY, over) {
    const auto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(raw);
    renderer.render(scene, cam);
    applyGrade(grade, ch, res, seed, tWall, glitchY, over);
    gradeMat.uniforms.tDiffuse.value = raw.texture;
    renderer.setRenderTarget(out);
    gradeQuad.render(renderer);
    renderer.setRenderTarget(null);
    renderer.autoClear = auto;
    stats.renders++;
  }

  // THE OSD IS PAINTED IN LOCKSTEP WITH THE STREAM IT BELONGS TO, and that is
  // both a correctness fix and the whole budget story of this round.
  //
  // The first build repainted the spot monitor's 768x432 analytics canvas every
  // frame and re-uploaded it: 1.33 MB at 60 Hz, 80 MB/s of texture traffic for a
  // picture that only changes fifteen times a second. It cost 2.2 ms a frame,
  // which was ALL of this round's regression — scene renders were down, not up.
  // Painting the box at the instant the frame it belongs to is decoded costs a
  // quarter of that AND is more honest: the analytics overlay is composited into
  // the recorded stream, so the box judders with the video instead of sliding
  // smoothly over a picture that is standing still.
  function renderFeed(i) {
    const f = feeds[i];
    const t = tiles[i];
    f.frames++;
    renderThrough(cams[i], rawFor(t.w, t.h, FEED_SS), feedRT[i],
      params.wall, chanFor(i), [t.w, t.h],
      f.frames * 0.6180339 + i * 7.13, f.glitchY);
    paintThumb(i, osdCommon());
    stats.thumbRenders++;
  }

  function renderSpot() {
    spotFeed.frames++;
    const ch = chanFor(active);
    renderThrough(spotCam, rawFor(SPOT_W, SPOT_H, SPOT_SS), spotRT,
      params.spot, ch, [SPOT_W, SPOT_H],
      spotFeed.frames * 0.6180339, -1,
      // A zoomed dome is a LONGER lens, so it bows less. Barrel that does not
      // fall off with the zoom is the tell that this is a crop and not a camera.
      { barrel: ch.barrel / (0.55 + 0.45 * zoom),
        blocky: params.spot.blocky, noise: params.spot.noise });
    paintSpot(osdCommon());
    stats.spotRenders++;
  }

  // ---- what the recorder is willing to draw a box round -------------------
  // FIRST VERSION OF THIS BOXED EVERYTHING THAT MOVED AND IT WAS UNUSABLE. See
  // shots/cctv_r4_desk_boxspam.png: twenty-eight blobs, every parked trolley
  // among them, each with a label, over a store that is already dense printed
  // card. The picture went from "too little information" to "no information",
  // which is the same failure wearing a different coat.
  //
  // A real DVR's VMD has exactly these knobs and they are the right ones:
  //   minimum object size — a blob eight pixels tall is noise, not a subject
  //   maximum objects     — the box has a fixed number of tracker slots
  //   object filter       — trolleys are furniture UNLESS they have been left
  // The last one is not a cheat, it is a tell: a cart standing on its own with
  // nobody near it is the classic "he abandoned it to walk out" and it is
  // ALSO what a shopper who wandered two aisles down to compare prices leaves
  // behind. Ambiguous, observable, worth boxing.
  const CART_IDLE = 6.0, CART_ALONE = 3.2;
  let dispTick = -1, dispList = [];
  function displayable() {
    if (dispTick === tWall) return dispList;
    dispTick = tWall;
    const all = tracker.tracks;
    const out = [];
    for (const tr of all) {
      if (tr.kind === 'person') { out.push(tr); continue; }
      if (tr.moving || tracker.now - tr.lastMove < CART_IDLE) continue;
      let alone = true;
      for (const o of all) {
        if (o.kind !== 'person') continue;
        if (Math.hypot(o.x - tr.x, o.z - tr.z) < CART_ALONE) { alone = false; break; }
      }
      if (alone) out.push(tr);
    }
    dispList = out;
    return out;
  }

  // ---- the dome, driven --------------------------------------------------
  // `minH` is the object-size filter, in panel pixels. `cap` is the tracker's
  // slot count; the biggest boxes win, which is also the nearest and therefore
  // the ones you could actually read something off.
  function visibleOn(i, minH, cap) {
    const cam = cams[i], t = tiles[i], k = chanFor(i).barrel, a = t.w / t.h;
    const pos = CAMS[i].pos;
    const out = [];
    for (const tr of displayable()) {
      if (!tracker.sees(i, pos, tr)) continue;
      const b = boxOf(cam, tr, t.w, t.h, k, a);
      if (b && b.h >= (minH || 0)) out.push({ tr, b });
    }
    if (cap && out.length > cap) {
      out.sort((p, q) => q.b.h - p.b.h);
      out.length = cap;
    }
    return out;
  }

  function driveSpot(dt) {
    const camDef = CAMS[active];
    const ch = chanFor(active);
    const here = visibleOn(active, 0, 0);
    trackN = here.filter((e) => e.tr.kind === 'person').length;

    // keep the lock if it is still in frame and nothing is much better
    const camPos = { x: camDef.pos[0], z: camDef.pos[2] };
    let best = null, bestS = -1e9;
    for (const e of here) {
      const s = tracker.score(e.tr, camPos);
      if (s > bestS) { bestS = s; best = e.tr; }
    }
    const stillHere = lock && here.some((e) => e.tr.key === lock.key);
    if (!stillHere) { lock = best; lockAt = tWall; }
    else if (best && best.key !== lock.key && tWall - lockAt > HOLD_T) {
      const cur = tracker.score(lock, camPos);
      if (bestS > cur * 1.25 + 4) { lock = best; lockAt = tWall; }
    }
    trackI = Math.max(0, here.filter((e) => e.tr.kind === 'person')
      .findIndex((e) => lock && e.tr.key === lock.key));

    // where to point, and how tight
    if (lock) {
      aimWant.set(lock.x, lock.h * 0.56, lock.z);
      const d = Math.hypot(lock.x - camDef.pos[0], lock.z - camDef.pos[2],
        lock.h * 0.56 - camDef.pos[1]);
      const theta = 2 * Math.atan((lock.h * 0.5) / Math.max(1, d)) / DEG;
      const wantH = hfovFor(theta / SUBJ_FRAC, spotAspect);
      zoomWant = clamp(ch.hfov / Math.max(4, wantH), MIN_ZOOM, MAX_ZOOM);
    } else {
      aimWant.set(...camDef.look);
      zoomWant = 1;
    }

    const ka = 1 - Math.exp(-dt / AIM_TAU), kz = 1 - Math.exp(-dt / ZOOM_TAU);
    aim.lerp(aimWant, ka);
    zoom += (zoomWant - zoom) * kz;

    spotCam.position.set(...camDef.pos);
    spotCam.fov = vfovFor(ch.hfov / zoom, spotAspect);
    spotCam.aspect = spotAspect;
    spotCam.lookAt(aim);
    spotCam.updateProjectionMatrix();
  }

  function snapSpot() {
    const camDef = CAMS[active];
    lock = null; lockAt = -99; zoom = 1; zoomWant = 1;
    aim.set(...camDef.look); aimWant.copy(aim);
    spotCam.position.set(...camDef.pos);
    spotCam.fov = vfovFor(chanFor(active).hfov, spotAspect);
    spotCam.lookAt(aim);
    spotCam.updateProjectionMatrix();
  }

  // ---- OSD ----------------------------------------------------------------
  function osdCommon() {
    const now = new Date();
    return { now, blink: (now.getTime() % 1600) < 1000 };
  }

  // The spot monitor's tracker slots. SIX, which is what a picture this dense
  // will carry, and the six biggest — the ones near enough to be worth a box.
  const SPOT_SLOTS = 6, SPOT_MIN_H = 18;
  function paintSpot(common) {
    const k = chanFor(active).barrel / (0.55 + 0.45 * zoom);
    const pos = CAMS[active].pos;
    const found = [];
    for (const tr of displayable()) {
      if (!tracker.sees(active, pos, tr)) continue;
      const b = boxOf(spotCam, tr, SPOT_W, SPOT_H, k, spotAspect);
      if (b && b.h >= SPOT_MIN_H) found.push({ tr, b });
    }
    found.sort((p, q) => q.b.h - p.b.h);
    if (found.length > SPOT_SLOTS) found.length = SPOT_SLOTS;

    const boxes = found.map(({ tr, b }) => {
      const tracked = !!(lock && lock.key === tr.key);
      const trail = [];
      // A trail on a man who is walking is the useful one; on six of them at
      // once it is a bowl of spaghetti. Only the locked subject gets a path.
      if (tracked) {
        for (const s of tr.trail) {
          _p.set(s.x, 0.05, s.z);
          const q = project(spotCam, _p, spotAspect, k, {});
          if (q) trail.push({ x: q.x * SPOT_W, y: q.y * SPOT_H });
        }
      }
      const L = tracker.labelFor(tr);
      return {
        ...b, moving: tr.moving, tracked, trail,
        code: (L && L.code) || tr.code,
        // "MOTION" over a man who is visibly walking is the recorder telling
        // you what you can already see. Text is spent only where it says
        // something: on the lock, and on anyone who has STOPPED.
        token: (tracked || !tr.moving) ? tracker.tokensFor(tr) : '',
      };
    });
    paintSpotOsd(spot.cv, {
      ...common, cam: CAMS[active], zoom, trackI, trackN, boxes,
      stream: `MAIN  ${SPOT_W}X${SPOT_H}  ${SPOT_FPS}FPS  H264`,
    });
    spot.tex.needsUpdate = true;
  }

  function paintThumb(i, common) {
    const s = screens[i];
    if (!s) return;
    const f = feeds[i];
    const here = visibleOn(i, 4, 8);
    let energy = 0, fresh = 0;
    const boxes = here.map((e) => {
      energy += Math.min(1, e.tr.speed / 1.6);
      if (e.tr.flag) fresh = 1;
      return { x: e.b.x, y: e.b.y, w: e.b.w, h: e.b.h, moving: e.tr.moving };
    });
    f.energy += (Math.min(1, energy * 0.5) - f.energy) * 0.25;
    if (fresh) f.alarm = 1;
    paintThumbOsd(s.cv, {
      ...common, chan: i + 1, boxes, energy: f.energy, alarm: f.alarm,
    });
    s.tex.needsUpdate = true;
  }

  const api = {
    cams,
    get tiles() { return tiles; },
    get active() { return active; },
    panels: plan.panels,
    params, stats,
    floorBurnIn: true,
    // Not a channel number any more: config now owns CAM 09, and two things
    // called CAM 09 on the same shift is exactly the kind of thing a roster
    // argument is made of.
    floorLabel: 'BODYCAM  BADGE 1',

    spot: {
      panel: spotP, cam: spotCam,
      get zoom() { return zoom; },
      get track() { return lock; },
      stream: [SPOT_W, SPOT_H, SPOT_FPS],
    },
    get tracks() { return tracker.tracks; },
    // The detector itself, for critics and for the harness: detector.sees(i,
    // CAMERAS[i].pos, track) is the same line-of-sight test the boxes use, so a
    // test can ask "is this subject actually on a monitor" without guessing.
    detector: tracker,
    setSubjects(list) { tracker.setLabels(list); },

    // WHICH MONITORS DOES THIS POINT ACTUALLY APPEAR ON, biggest first.
    // Frustum test plus the same line-of-sight test the analytics boxes use, so
    // a man standing behind a gondola is not on that channel even though he is
    // inside its cone. Returns camera indices, [] if nothing sees him.
    //
    // FOR BUILDER-GAME. Right now the roster decides a subject's channel from a
    // zone table in camFor(), and the two disagree on screen: see
    // shots/cctv_r4_conceal_2.png, where the spot monitor is showing a man in
    // the middle of CAM 06's picture while the roster panel underneath it says
    // "NO SUBJECTS IN FRAME" for CAM 06. Every one of those is the player being
    // taught that the pictures and the list are unrelated, which is the same
    // complaint that started this round wearing different clothes.
    channelsFor(x, z, h = 1.7) {
      ensureOccluders();
      const y = h * 0.55;
      const out = [];
      for (let i = 0; i < cams.length; i++) {
        const pos = CAMS[i].pos;
        if (!tracker.clear(pos, x, y, z)) continue;
        _p.set(x, y, z).project(cams[i]);
        if (_p.z > 1 || Math.abs(_p.x) > 0.94 || Math.abs(_p.y) > 0.94) continue;
        const d = Math.hypot(pos[0] - x, pos[1] - y, pos[2] - z);
        out.push({ i, d });
      }
      out.sort((a, b) => a.d - b.d);
      return out.map((e) => e.i);
    },
    // Hand the dome to the next subject on this channel. Bound to nothing yet —
    // builder-game owns input — but the wall is ready for a key.
    cycleTrack() {
      const here = visibleOn(active, 0, 0).filter((e) => e.tr.kind === 'person');
      if (!here.length) { lock = null; return null; }
      const at = here.findIndex((e) => lock && e.tr.key === lock.key);
      lock = here[(at + 1) % here.length].tr;
      lockAt = tWall + 1e6;                 // manual pick sticks until it leaves
      return lock;
    },

    setParams(view, patch) { Object.assign(params[view] || {}, patch || {}); },

    setActiveCam(i) {
      const n = cams.length || 1;
      const next = ((i | 0) % n + n) % n;
      if (next !== active) { active = next; snapSpot(); }
      active = next;
      screens.forEach((s, k) => {
        if (s) s.m.uniforms.uActive.value = k === active ? 1 : 0;
      });
    },

    // Only the 3D floor buffer is resolution-dependent. The wall and both
    // overlays live in design space and are mapped to the canvas by their ortho
    // cameras, so a different canvas size scales the whole desk uniformly
    // instead of scattering its parts. Non-16:9 canvases stretch; the harness
    // renders 16:9 and the game is built for it.
    resize(w, h) {
      if (!w || !h || (w === W && h === H)) return;
      W = w; H = h;
      floorRaw.setSize(Math.round(W * FLOOR_SS), Math.round(H * FLOOR_SS));
    },

    renderWall(dt) {
      dt = Math.min(0.1, dt || 0);
      tWall += dt;
      frameShadow(tWall);
      ensureOccluders();
      tracker.update(dt);
      driveSpot(dt);

      if (!primed) {                       // first frame: every channel comes up
        for (let i = 0; i < feeds.length; i++) renderFeed(i);
        renderSpot();
        spotFeed.due = tWall + spotFeed.interval;
        primed = true;
      } else {
        // The spot monitor gets the first slot, every time.
        if (spotFeed.due <= tWall) {
          renderSpot();
          spotFeed.due = tWall + spotFeed.interval;
        }
        let budget = 2;
        for (let k = 0; k < feeds.length && budget > 0; k++) {
          const i = (cursor + k) % feeds.length;
          const f = feeds[i];
          if (f.due > tWall) continue;
          // occasional torn band, a few frames long, on the channels that get one
          if (f.glitchAt > 0 && tWall >= f.glitchAt) {
            f.glitchY = 0.12 + 0.76 * ((f.frames * 0.37) % 1);
            if (tWall >= f.glitchAt + 0.22) {
              f.glitchY = -1;
              f.glitchAt = tWall + chanFor(i).glitch * (0.7 + 0.6 * ((f.frames * 0.11) % 1));
            }
          }
          renderFeed(i);
          // jittered interval: a DVR's frame pacing is never clean
          f.due = tWall + f.interval * (0.82 + 0.36 * ((f.frames * 0.7548) % 1));
          cursor = i + 1;
          budget--;
        }
      }

      // Snow is a field-rate thing, so the dark panels are the one part of this
      // wall that is NOT juddering — quantised to 30 Hz so it flickers rather
      // than crawls.
      const snowSeed = Math.floor(tWall * 30);
      for (const d of deads) {
        d.m.uniforms.uSeed.value = snowSeed;
        d.m.uniforms.uTime.value = tWall;
      }

      // Every OSD is painted by the render that produced its frame — see the
      // note above renderFeed. All that is left here is the alarm decay and
      // clearing the detector's one-shot STOPPED flags.
      for (const f of feeds) if (f.alarm > 0) f.alarm = Math.max(0, f.alarm - dt * 0.5);

      const auto = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(null);
      renderer.render(wallScene, wallCam);
      renderer.autoClear = auto;
    },

    renderFloor(dt, camera) {
      dt = Math.min(0.1, dt || 0);
      tFloor += dt; floorFrames++;
      frameShadow(tFloor + 1e6);

      const auto = renderer.autoClear;
      renderer.autoClear = true;
      renderer.setRenderTarget(floorRaw);
      renderer.render(scene, camera);

      applyGrade(params.floor, null, [W, H], floorFrames * 0.6180339, tFloor, -1);
      gradeMat.uniforms.tDiffuse.value = floorRaw.texture;
      renderer.setRenderTarget(null);
      gradeQuad.render(renderer);

      if (api.floorBurnIn) {
        updateFloorBurnIn(api.floorLabel);
        renderer.autoClear = false;
        renderer.render(floorScene, floorCamOrtho);
      }
      renderer.autoClear = auto;
    },

    dispose() {
      rawBySize.forEach((r) => r.dispose());
      floorRaw.dispose(); spotRT.dispose();
      feedRT.forEach((r) => r.dispose());
      gradeQuad.dispose(); quadGeo.dispose();
      furnTex.dispose(); fBurnTex.dispose(); deadTex.dispose();
      spot.tex.dispose();
      screens.forEach((s) => s && s.tex.dispose());
    },
  };

  let fBurnKey = '';
  function updateFloorBurnIn(label) {
    const now = new Date();
    const ms = now.getTime();
    const blink = (ms % 1600) < 1000;
    const key = `${(ms / 1000) | 0}|${blink ? 1 : 0}|${label}`;
    if (key === fBurnKey) return;
    fBurnKey = key;
    paintFloorBurnIn(fBurnCv, DES_W, DES_H, now, blink, label);
    fBurnTex.needsUpdate = true;
  }

  snapSpot();
  api.setActiveCam(0);
  return api;
}
