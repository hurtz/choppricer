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
//   active          index of the selected channel
//   params          { wall, floor } live grade strengths, see GRADE_PRESET
//   setParams(view, patch)         dial any effect per view at runtime
//   floorBurnIn     bool, timestamp overlay on the on-foot view
//   panels          physical monitors, including the ones no camera is on
//
// ROUND 3 — THE WALL IS NOW N-CAMERA DRIVEN.
// Nothing here counts to eight any more. `layoutWall(CAMERAS)` in cctv/layout.js
// hands back one physical monitor per slot and one tile per camera, for any
// camera count; per-channel personality tables extend themselves past the end of
// what is hand-authored; render targets are sized per tile instead of from one
// shared FEED_W/FEED_H. Add CAM 09 to config.js and it lights up the panel that
// is currently showing a NO SIGNAL card. The old failure — CHAN[8] undefined,
// `Cannot read properties of undefined (reading 'scan')` — cannot recur: every
// per-channel lookup goes through chanFor(i).
//
// NOTE TO LEAD: vendor/EffectComposer.js cannot load — it imports
// '../shaders/CopyShader.js' and './MaskPass.js', neither of which exists on the
// server (both 404). ShaderPass.js and Pass.js are fine. This file therefore
// runs its own three-target chain built on Pass.js's FullScreenQuad; nothing
// else is needed from the composer. Drop MaskPass.js + shaders/CopyShader.js in
// if you want the real composer available to other pieces.
import { CAMERAS } from './config.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GradeShader, ScreenShader, DeadShader } from './cctv/shaders.js';
import { layoutWall, WALL } from './cctv/layout.js';
import {
  makeCanvas, paintFurniture, paintBurnIn, paintFloorBurnIn, paintDeadCards,
} from './cctv/overlay.js';

// The wall is AUTHORED in 1280x720 design space and only ever drawn in it. Every
// slot rect, every tile rect, and all three overlay canvases are design pixels;
// the ortho camera maps the whole design frame to whatever the canvas happens to
// be. Round 1 resized the ortho camera to the real canvas instead, which left
// the hand-placed tile rects sitting in the corner of a larger frustum and tore
// the wall apart on any canvas that was not exactly 1280x720.
const DES_W = WALL.W, DES_H = WALL.H;
const FEED_SS = 2;                  // supersample the feed render, then degrade
const FLOOR_SS = 1.5;

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
const CHAN = [
  { fps: 10, hfov: 98,  gain: 1.00, tint: [1.035, 1.000, 0.955], noise: 0.038, barrel: 0.30, sat: 0.92, scan: 0.062, blocky: 0.16, sharp:  1.00, bloom: 1.00, glitch: 0 },
  { fps: 8,  hfov: 97,  gain: 0.95, tint: [0.955, 1.030, 0.960], noise: 0.050, barrel: 0.34, sat: 0.84, scan: 0.072, blocky: 0.20, sharp:  1.27, bloom: 1.13, glitch: 0 },
  { fps: 12, hfov: 99,  gain: 1.10, tint: [1.010, 1.005, 0.990], noise: 0.030, barrel: 0.27, sat: 0.96, scan: 0.052, blocky: 0.12, sharp:  0.73, bloom: 0.87, glitch: 0 },
  { fps: 9,  hfov: 96,  gain: 0.80, tint: [0.950, 0.985, 1.070], noise: 0.070, barrel: 0.33, sat: 0.72, scan: 0.078, blocky: 0.26, sharp: -1.00, bloom: 1.45, glitch: 0 },
  // CAM 05 lands on the big panel, so it is the one channel anybody looks at for
  // more than a second: newest sensor, fastest, cleanest, widest lens.
  { fps: 14, hfov: 102, gain: 1.02, tint: [1.000, 1.000, 1.000], noise: 0.030, barrel: 0.34, sat: 0.93, scan: 0.050, blocky: 0.11, sharp:  1.05, bloom: 1.00, glitch: 5.5 },
  { fps: 8,  hfov: 98,  gain: 0.90, tint: [1.045, 0.995, 0.945], noise: 0.058, barrel: 0.30, sat: 0.88, scan: 0.070, blocky: 0.30, sharp:  1.55, bloom: 0.91, glitch: 0 },
  { fps: 12, hfov: 94,  gain: 1.05, tint: [0.965, 1.020, 0.975], noise: 0.036, barrel: 0.36, sat: 0.92, scan: 0.058, blocky: 0.14, sharp:  0.91, bloom: 1.05, glitch: 11.0 },
  { fps: 10, hfov: 96,  gain: 0.97, tint: [1.000, 1.010, 1.010], noise: 0.052, barrel: 0.33, sat: 0.86, scan: 0.082, blocky: 0.22, sharp:  1.18, bloom: 0.95, glitch: 0 },
  // CAM 09 DOOR 2, if config declares it: bought this year, so it is the sharpest
  // and least noisy thing on the wall and its lens is tighter than the 2011 domes.
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
  wall: {
    barrel: 0.32, ca: 1.15, chroma: 0.74, blocky: 0.23, sharp: 0.55,
    bloom: 1.06, bloomThr: 0.64,
    gain: 1.0, black: 0.072, pivot: 0.50, contrast: 1.35, knee: 0.75,
    highlight: 0.40, sat: 0.82,
    noise: 0.056, scan: 0.070, roll: 0.050, rollSpeed: 0.055, vign: 0.40,
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

// `opts.cameras` is purely additive and exists so the wall can be exercised at a
// camera count config.js does not currently declare — main.js calls this with
// three arguments and gets config.CAMERAS, exactly as before. Use it to satisfy
// yourself that adding CAM 09 will not break anything BEFORE adding it:
//   const t = createCCTV(THREE, renderer, scene,
//     { cameras: [...CAMERAS, { id:'CAM 09', label:'DOOR 2',
//       pos:[EXIT2.x + 1, 4.2, EXIT2.z + 6], look:[EXIT2.x, 1.0, EXIT2.z] }] });
//   t.renderWall(0.016);
export function createCCTV(THREE, renderer, scene, opts = {}) {
  let W = 1280, H = 720;
  const CAMS = opts.cameras || CAMERAS;

  // ---- the physical wall ---------------------------------------------------
  const plan = layoutWall(CAMS);
  const tiles = plan.tiles;

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
  let active = 0;

  // ---- render targets -----------------------------------------------------
  // One PERSISTENT target per channel, at that channel's exact panel size — this
  // is where its last decoded frame lives between re-renders. Plus one TRANSIENT
  // supersampled target per distinct panel size, shared by every channel of that
  // size, which is where the raw 3D render lands before the grade. Sizing off the
  // panel instead of one global FEED_W/FEED_H is what lets nine monitors be nine
  // different shapes.
  const rtOpts = {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
  };
  const rawBySize = new Map();
  function rawFor(w, h) {
    const key = `${w}x${h}`;
    let rt = rawBySize.get(key);
    if (!rt) {
      rt = new THREE.WebGLRenderTarget(
        Math.round(w * FEED_SS), Math.round(h * FEED_SS), rtOpts);
      rawBySize.set(key, rt);
    }
    return rt;
  }
  const feedRT = CAMS.map((_, i) => {
    const t = tiles[i];
    rawFor(t.w, t.h);
    const rt = new THREE.WebGLRenderTarget(t.w, t.h, { ...rtOpts, depthBuffer: false });
    rt.texture.colorSpace = THREE.NoColorSpace;   // we write display-ready sRGB
    return rt;
  });
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

  // ---- the wall scene: N screens + the dark ones + one furniture plate -----
  const wallScene = new THREE.Scene();
  wallScene.background = new THREE.Color(0x040507);
  const wallCam = new THREE.OrthographicCamera(0, DES_W, DES_H, 0, -10, 10);

  const burnCv = makeCanvas(DES_W, DES_H);
  const burnTex = new THREE.CanvasTexture(burnCv);
  burnTex.colorSpace = THREE.SRGBColorSpace;
  burnTex.minFilter = burnTex.magFilter = THREE.NearestFilter;
  burnTex.generateMipmaps = false;

  const deadCv = makeCanvas(DES_W, DES_H);
  paintDeadCards(deadCv, DES_W, DES_H, plan.dead);
  const deadTex = new THREE.CanvasTexture(deadCv);
  deadTex.colorSpace = THREE.SRGBColorSpace;
  deadTex.minFilter = deadTex.magFilter = THREE.NearestFilter;
  deadTex.generateMipmaps = false;

  const furnCv = makeCanvas(DES_W, DES_H);
  paintFurniture(furnCv, DES_W, DES_H, plan.panels, WALL);
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

  const screens = [];                 // index-aligned to CAMERAS
  for (const p of plan.live) {
    const i = p.cam;
    const m = new THREE.ShaderMaterial({
      name: ScreenShader.name,
      uniforms: THREE.UniformsUtils.clone(ScreenShader.uniforms),
      vertexShader: ScreenShader.vertexShader,
      fragmentShader: ScreenShader.fragmentShader,
      depthTest: false, depthWrite: false, transparent: true,
    });
    m.uniforms.tFeed.value = feedRT[i].texture;
    m.uniforms.tBurn.value = burnTex;
    m.uniforms.uRect.value = new THREE.Vector4(p.x, p.y, p.w, p.h);
    m.uniforms.uRes.value = new THREE.Vector2(DES_W, DES_H);
    m.uniforms.uPhase.value = p.slot * 1.37;
    m.uniforms.uSheen.value = p.sheen;
    m.uniforms.uDim.value = 0.93 + (p.slot % 4) * 0.030;
    m.uniforms.uScan.value = chanFor(i).scan;
    m.uniforms.uPanel.value = new THREE.Vector3(...p.white);
    const mesh = new THREE.Mesh(quadGeo, m);
    placeQuad(mesh, p);
    mesh.renderOrder = 1;
    wallScene.add(mesh);
    screens[i] = { mesh, m, p };
  }

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

  // ---- feed scheduling ----------------------------------------------------
  // Every channel at its own 8-14 fps, staggered, at most two re-rendered per
  // frame. Round-robin re-render is the whole judder effect: nothing on this
  // wall is ever in sync with anything else.
  const feeds = CAMS.map((_, i) => {
    const ch = chanFor(i);
    return {
      interval: 1 / ch.fps,
      due: (i * 0.137) % 0.125,
      frames: i * 3,
      glitchAt: ch.glitch ? ch.glitch * (0.3 + 0.1 * i) : -1,
      glitchY: -1,
    };
  });
  let cursor = 0, tWall = 0, tFloor = 0, floorFrames = 0, primed = false;
  let burnKey = '';
  const params = { wall: { ...GRADE_PRESET.wall }, floor: { ...GRADE_PRESET.floor } };

  // Shadow maps cost a full extra pass per renderer.render(); with up to three
  // renders a frame that triples the bill. Update them once per frame instead.
  renderer.shadowMap.autoUpdate = false;
  let shadowTick = -1;
  function frameShadow(t) {
    if (t !== shadowTick) { shadowTick = t; renderer.shadowMap.needsUpdate = true; }
  }

  const tintV = new THREE.Vector3();
  function applyGrade(p, ch, res, seed, time, glitchY) {
    const u = gradeMat.uniforms;
    u.uRes.value.set(res[0], res[1]);
    u.uAspect.value = res[0] / res[1];
    u.uSeed.value = seed;
    u.uTime.value = time;
    u.uLinearIn.value = 1;
    u.uBarrel.value = ch ? ch.barrel : p.barrel;
    u.uCA.value = p.ca;
    u.uChroma.value = p.chroma;
    u.uBlocky.value = ch ? ch.blocky : p.blocky;
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
    u.uNoise.value = ch ? ch.noise : p.noise;
    // wall channels get their scanlines from ScreenShader, over the burn-in too
    u.uScan.value = ch ? 0 : p.scan;
    u.uRoll.value = p.roll;
    u.uRollSpeed.value = p.rollSpeed;
    u.uVign.value = p.vign;
    u.uGlitch.value = glitchY >= 0 ? 0.055 : 0;
    u.uGlitchY.value = glitchY;
  }

  function renderFeed(i) {
    const f = feeds[i];
    const t = tiles[i];
    f.frames++;
    const raw = rawFor(t.w, t.h);
    const auto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(raw);
    renderer.render(scene, cams[i]);

    applyGrade(params.wall, chanFor(i), [t.w, t.h],
      f.frames * 0.6180339 + i * 7.13, tWall, f.glitchY);
    gradeMat.uniforms.tDiffuse.value = raw.texture;
    renderer.setRenderTarget(feedRT[i]);
    gradeQuad.render(renderer);
    renderer.setRenderTarget(null);
    renderer.autoClear = auto;
  }

  function updateBurnIn() {
    const now = new Date();
    const ms = now.getTime();
    const blink = (ms % 1600) < 1000;
    const key = `${(ms / 1000) | 0}|${blink ? 1 : 0}|${active}`;
    if (key === burnKey) return;
    burnKey = key;
    paintBurnIn(burnCv, DES_W, DES_H, tiles, CAMS, active, now, blink);
    burnTex.needsUpdate = true;
  }

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

  const api = {
    cams,
    get tiles() { return tiles; },
    get active() { return active; },
    panels: plan.panels,
    params,
    floorBurnIn: true,
    // Not a channel number any more: config now owns CAM 09, and two things
    // called CAM 09 on the same shift is exactly the kind of thing a roster
    // argument is made of.
    floorLabel: 'BODYCAM  BADGE 1',

    setParams(view, patch) { Object.assign(params[view] || {}, patch || {}); },

    setActiveCam(i) {
      const n = cams.length || 1;
      active = ((i | 0) % n + n) % n;
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

      if (!primed) {                       // first frame: every channel comes up
        for (let i = 0; i < feeds.length; i++) renderFeed(i);
        primed = true;
      } else {
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

      updateBurnIn();
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
      floorRaw.dispose();
      feedRT.forEach((r) => r.dispose());
      gradeQuad.dispose(); quadGeo.dispose();
      burnTex.dispose(); furnTex.dispose(); fBurnTex.dispose(); deadTex.dispose();
    },
  };

  api.setActiveCam(0);
  return api;
}
