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
//                   canvas size — the whole desk is scaled to the canvas by its
//                   ortho camera. Place HUD against them directly.
//   active          index of the selected channel
//   params          { wall, floor } live grade strengths, see GRADE_PRESET
//   setParams(view, patch)         dial any effect per view at runtime
//   floorBurnIn     bool, timestamp overlay on the on-foot view
//
// NOTE TO LEAD: vendor/EffectComposer.js cannot load — it imports
// '../shaders/CopyShader.js' and './MaskPass.js', neither of which exists on the
// server (both 404). ShaderPass.js and Pass.js are fine. This file therefore
// runs its own three-target chain built on Pass.js's FullScreenQuad; nothing
// else is needed from the composer. Drop MaskPass.js + shaders/CopyShader.js in
// if you want the real composer available to other pieces.
import { CAMERAS } from './config.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GradeShader, ScreenShader } from './cctv/shaders.js';
import {
  makeCanvas, paintFurniture, paintBurnIn, paintFloorBurnIn,
} from './cctv/overlay.js';

// --- wall layout, in 1280x720 space, TOP-LEFT origin ------------------------
// 4 x 2 grid. The bands above and below are the office wall and the desk; they
// are also where builder-game parks its HUD, so they stay dark and empty.
const L = {
  cols: 4, rows: 2,
  gridX: 12, gridY: 74, gridW: 1256, gridH: 550,
  pad: 6,           // gap between one monitor housing and the next
  bezelX: 11, bezelTop: 12, chin: 41,
  screenW: 280, screenH: 210,       // 4:3 — security cameras are 4:3 sensors
  railY: 62, deskY: 624,
};
// The wall is AUTHORED in this space and only ever drawn in this space. Every
// number in L, every tile rect, and both overlay canvases are design pixels; the
// ortho camera maps the whole design frame to whatever the canvas happens to be.
// Round 1 resized the ortho camera to the real canvas instead, which left the
// hand-placed 1280x720 tile rects sitting in the corner of a larger frustum and
// tore the wall apart on any canvas that was not exactly 1280x720.
const DES_W = 1280, DES_H = 720;
const FEED_W = L.screenW, FEED_H = L.screenH;
const FEED_SS = 2;                  // supersample the feed render, then degrade
const FLOOR_SS = 1.5;

function layoutTiles() {
  const cw = L.gridW / L.cols, ch = L.gridH / L.rows;
  return CAMERAS.map((_, i) => {
    const col = i % L.cols, row = (i / L.cols) | 0;
    const hx = L.gridX + col * cw + L.pad;
    const hy = L.gridY + row * ch + L.pad;
    const hw = cw - L.pad * 2;
    return {
      x: Math.round(hx + (hw - L.screenW) / 2),
      y: Math.round(hy + L.bezelTop),
      w: L.screenW, h: L.screenH,
    };
  });
}

// --- per-channel personality ------------------------------------------------
// Real DVR walls are never uniform: different camera generations, different
// cable runs, one that somebody pointed at a light. Hand-authored, not random,
// so screenshots stay comparable between rounds.
// `gain`, `sharp` and `bloom` multiply the view preset; the rest override it.
// `sharp` is the in-camera edge enhancement — positive is the crunchy halo every
// cheap IP camera puts around a shelf lip. CH04 is negative because somebody
// knocked that dome months ago and nobody ever refocused it.
const CHAN = [
  { fps: 10, gain: 1.00, tint: [1.035, 1.000, 0.955], noise: 0.038, barrel: 0.30, sat: 0.92, scan: 0.062, blocky: 0.16, sharp:  1.00, bloom: 1.00, glitch: 0 },
  { fps: 8,  gain: 0.95, tint: [0.955, 1.030, 0.960], noise: 0.050, barrel: 0.34, sat: 0.84, scan: 0.072, blocky: 0.20, sharp:  1.27, bloom: 1.13, glitch: 0 },
  { fps: 12, gain: 1.10, tint: [1.010, 1.005, 0.990], noise: 0.030, barrel: 0.27, sat: 0.96, scan: 0.052, blocky: 0.12, sharp:  0.73, bloom: 0.87, glitch: 0 },
  { fps: 9,  gain: 0.80, tint: [0.950, 0.985, 1.070], noise: 0.070, barrel: 0.33, sat: 0.72, scan: 0.078, blocky: 0.26, sharp: -1.00, bloom: 1.45, glitch: 0 },
  { fps: 11, gain: 1.02, tint: [1.000, 1.000, 1.000], noise: 0.042, barrel: 0.38, sat: 0.90, scan: 0.068, blocky: 0.18, sharp:  1.09, bloom: 1.00, glitch: 6.5 },
  { fps: 8,  gain: 0.90, tint: [1.045, 0.995, 0.945], noise: 0.058, barrel: 0.30, sat: 0.88, scan: 0.070, blocky: 0.30, sharp:  1.55, bloom: 0.91, glitch: 0 },
  { fps: 12, gain: 1.05, tint: [0.965, 1.020, 0.975], noise: 0.036, barrel: 0.36, sat: 0.92, scan: 0.058, blocky: 0.14, sharp:  0.91, bloom: 1.05, glitch: 11.0 },
  { fps: 10, gain: 0.97, tint: [1.000, 1.010, 1.010], noise: 0.052, barrel: 0.33, sat: 0.86, scan: 0.082, blocky: 0.22, sharp:  1.18, bloom: 0.95, glitch: 0 },
];

// White point of each MONITOR, as opposed to CHAN[].tint which is the camera.
// Eight panels bought over eight years: two of them have gone warm and yellow,
// one is a newer cold-LED unit, the rest are somewhere in between. Hand-authored
// so the wall never reads as eight copies of one screen.
const PANEL = [
  [1.000, 0.994, 0.968],   // slightly warm
  [0.978, 0.990, 1.000],
  [1.000, 1.000, 1.000],
  [1.010, 0.980, 0.930],   // the old yellowed one
  [0.968, 0.988, 1.000],   // newer cold LED
  [1.000, 0.986, 0.952],
  [0.988, 1.000, 0.990],
  [1.006, 0.992, 0.958],
];

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
const GRADE_PRESET = {
  wall: {
    barrel: 0.32, ca: 1.15, chroma: 0.60, blocky: 0.18, sharp: 0.55,
    bloom: 0.85, bloomThr: 0.72,
    gain: 1.0, black: 0.055, pivot: 0.50, contrast: 1.26, knee: 0.80,
    highlight: 0.30, sat: 0.88,
    noise: 0.042, scan: 0.070, roll: 0.050, rollSpeed: 0.055, vign: 0.36,
  },
  floor: {
    barrel: 0.11, ca: 0.85, chroma: 0.35, blocky: 0.07, sharp: 0.34,
    bloom: 0.55, bloomThr: 0.78,
    gain: 1.0, black: 0.026, pivot: 0.48, contrast: 1.14, knee: 0.86,
    highlight: 0.19, sat: 0.94,
    noise: 0.034, scan: 0.040, roll: 0.030, rollSpeed: 0.040, vign: 0.26,
  },
};

export function createCCTV(THREE, renderer, scene) {
  let W = 1280, H = 720;
  const tiles = layoutTiles();

  // ---- cameras ------------------------------------------------------------
  // Wide (96 degrees horizontal at 4:3) because the barrel term magnifies the
  // centre back out; shoot narrow and the distortion just looks like a zoom.
  const cams = CAMERAS.map((c) => {
    const cam = new THREE.PerspectiveCamera(82, FEED_W / FEED_H, 0.1, 140);
    cam.position.set(...c.pos);
    cam.lookAt(new THREE.Vector3(...c.look));
    cam.updateProjectionMatrix();
    return cam;
  });
  let active = 0;

  // ---- render targets -----------------------------------------------------
  const rtOpts = {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    depthBuffer: true, stencilBuffer: false, generateMipmaps: false,
  };
  const feedRaw = new THREE.WebGLRenderTarget(FEED_W * FEED_SS, FEED_H * FEED_SS, rtOpts);
  const feedRT = cams.map(() => {
    const rt = new THREE.WebGLRenderTarget(FEED_W, FEED_H, { ...rtOpts, depthBuffer: false });
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
  gradeMat.uniforms.uRes.value = new THREE.Vector2(FEED_W, FEED_H);
  const gradeQuad = new FullScreenQuad(gradeMat);

  // ---- the wall scene: 8 screens + one furniture plate ---------------------
  const wallScene = new THREE.Scene();
  wallScene.background = new THREE.Color(0x040507);
  const wallCam = new THREE.OrthographicCamera(0, DES_W, DES_H, 0, -10, 10);

  const burnCv = makeCanvas(DES_W, DES_H);
  const burnTex = new THREE.CanvasTexture(burnCv);
  burnTex.colorSpace = THREE.SRGBColorSpace;
  burnTex.minFilter = burnTex.magFilter = THREE.NearestFilter;
  burnTex.generateMipmaps = false;

  const furnCv = makeCanvas(DES_W, DES_H);
  paintFurniture(furnCv, DES_W, DES_H, tiles, L);
  const furnTex = new THREE.CanvasTexture(furnCv);
  furnTex.colorSpace = THREE.SRGBColorSpace;
  furnTex.minFilter = furnTex.magFilter = THREE.LinearFilter;
  furnTex.generateMipmaps = false;

  const quadGeo = new THREE.PlaneGeometry(1, 1);
  const screens = tiles.map((t, i) => {
    const m = new THREE.ShaderMaterial({
      name: ScreenShader.name,
      uniforms: THREE.UniformsUtils.clone(ScreenShader.uniforms),
      vertexShader: ScreenShader.vertexShader,
      fragmentShader: ScreenShader.fragmentShader,
      depthTest: false, depthWrite: false, transparent: true,
    });
    m.uniforms.tFeed.value = feedRT[i].texture;
    m.uniforms.tBurn.value = burnTex;
    m.uniforms.uRect.value = new THREE.Vector4(t.x, t.y, t.w, t.h);
    m.uniforms.uRes.value = new THREE.Vector2(DES_W, DES_H);
    m.uniforms.uPhase.value = i * 1.37;
    m.uniforms.uSheen.value = 0.030 + (i % 3) * 0.016;
    m.uniforms.uDim.value = 0.93 + (i % 4) * 0.030;
    m.uniforms.uScan.value = CHAN[i].scan;
    m.uniforms.uPanel.value = new THREE.Vector3(...PANEL[i]);
    const mesh = new THREE.Mesh(quadGeo, m);
    mesh.position.set(t.x + t.w / 2, DES_H - (t.y + t.h / 2), 0);
    mesh.scale.set(t.w, t.h, 1);
    mesh.renderOrder = 1;
    wallScene.add(mesh);
    return { mesh, m };
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
  // 8 feeds at 8-12 fps each, staggered, at most two re-rendered per frame.
  // Round-robin re-render is the whole judder effect: nothing on this wall is
  // ever in sync with anything else.
  const feeds = CAMERAS.map((_, i) => ({
    interval: 1 / CHAN[i].fps,
    due: (i * 0.137) % 0.125,
    frames: i * 3,
    glitchAt: CHAN[i].glitch ? CHAN[i].glitch * (0.3 + 0.1 * i) : -1,
    glitchY: -1,
  }));
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
    f.frames++;
    const auto = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(feedRaw);
    renderer.render(scene, cams[i]);

    applyGrade(params.wall, CHAN[i], [FEED_W, FEED_H],
      f.frames * 0.6180339 + i * 7.13, tWall, f.glitchY);
    gradeMat.uniforms.tDiffuse.value = feedRaw.texture;
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
    paintBurnIn(burnCv, DES_W, DES_H, tiles, CAMERAS, active, now, blink);
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
    params,
    floorBurnIn: true,
    floorLabel: 'CAM 09  FLOOR PATROL',

    setParams(view, patch) { Object.assign(params[view] || {}, patch || {}); },

    setActiveCam(i) {
      active = ((i | 0) % cams.length + cams.length) % cams.length;
      screens.forEach((s, k) => { s.m.uniforms.uActive.value = k === active ? 1 : 0; });
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
              f.glitchAt = tWall + CHAN[i].glitch * (0.7 + 0.6 * ((f.frames * 0.11) % 1));
            }
          }
          renderFeed(i);
          // jittered interval: a DVR's frame pacing is never clean
          f.due = tWall + f.interval * (0.82 + 0.36 * ((f.frames * 0.7548) % 1));
          cursor = i + 1;
          budget--;
        }
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
      feedRaw.dispose(); floorRaw.dispose();
      feedRT.forEach((r) => r.dispose());
      gradeQuad.dispose(); quadGeo.dispose();
      burnTex.dispose(); furnTex.dispose(); fBurnTex.dispose();
    },
  };

  api.setActiveCam(0);
  return api;
}
