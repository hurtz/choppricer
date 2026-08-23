// OWNER: LEAD. Bootstrap + wiring only. Builders should not need to edit this.
import * as THREE from 'three';
import { buildStore } from './store.js';
import { createCCTV } from './cctv.js';
import { createAgents } from './agents.js';
import { createGame } from './game.js';
import { createAudio } from './audio.js';
import { createCamera } from './camera.js';

const app = document.getElementById('app');
const hud = document.getElementById('hud');

// Fixed internal resolution: a security feed has a fixed resolution, screenshots
// stay byte-comparable between agents, and it survives a 0x0 backgrounded tab.
export const RENDER_W = 1280, RENDER_H = 720;
const renderer = new THREE.WebGLRenderer({
  antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true,
});
renderer.setPixelRatio(1);
renderer.setSize(RENDER_W, RENDER_H, false);
renderer.shadowMap.enabled = true;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0b0c);

const world = buildStore(THREE, scene);
const cctv = createCCTV(THREE, renderer, scene);
const agents = createAgents(THREE, scene, world);
const game = createGame(hud, { cctv, agents, world, THREE });


const floorCam = new THREE.PerspectiveCamera(58, RENDER_W / RENDER_H, 0.1, 160);
// Audio is created after floorCam so it can position its listener from the real camera.
const audio = createAudio(THREE, floorCam);
const chaseCam = createCamera(THREE, floorCam);

const input = { x: 0, z: 0, sprint: false };
const keys = new Set();
addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Tab') { e.preventDefault(); game.mode === 'desk' ? game.enterFloor(0) : game.enterDesk(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
// Internal resolution never changes; CSS scales the canvas to the viewport.
addEventListener('resize', () => cctv.resize(RENDER_W, RENDER_H));

function readInput() {
  // Screen-space intent first: right-handed, +sx = screen right, +sz = away from camera.
  const sx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const sz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const l = Math.hypot(sx, sz) || 1;
  // Rotate into world by the camera's own yaw, so WASD always means what the player
  // SEES no matter where the camera builder puts it. The base camera looks down +Z,
  // whose screen-right is world -X — the sign below is that, generalised.
  const y = chaseCam.yaw || 0;
  const cs = Math.cos(y), sn = Math.sin(y);
  // World basis for what the player sees. At yaw 0 the camera sits behind the cop
  // looking down +Z, so screen-forward is world +Z and screen-right is world -X.
  const fwdX = -sn, fwdZ = cs;
  const rgtX = -cs, rgtZ = -sn;
  const wx = (sx / l) * rgtX + (sz / l) * fwdX;
  const wz = (sx / l) * rgtZ + (sz / l) * fwdZ;
  // agents.js consumes x directly but NEGATES z, so convert into its convention here
  // rather than leaving a sign trap for whoever moves this camera next.
  input.x = wx;
  input.z = -wz;
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
}

// One simulation + render step. Never depends on requestAnimationFrame, so it
// still runs when the tab is backgrounded — critics rely on this.
function step(dt) {
  agents.update(dt, input, game.api || {});
  game.update(dt);
  audio.update(dt, {
    mode: game.mode, cop: agents.cop, shoppers: agents.shoppers,
    chasing: !!(game.st && game.st.chasing), report: agents.report && agents.report(),
  });
  if (game.mode === 'desk') {
    cctv.renderWall(dt);
  } else {
    chaseCam.update(dt, {
      cop: agents.cop, chasing: !!(game.st && game.st.chasing),
      report: agents.report && agents.report(), dt,
    });
    cctv.renderFloor(dt, floorCam);
  }
  game.render();
}

let last = performance.now();
let rafOn = true;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  readInput();
  step(dt);
  if (rafOn) requestAnimationFrame(frame);
}
document.getElementById('boot')?.remove();
requestAnimationFrame(frame);

// --- Agent-facing test surface -------------------------------------------
// Composites the 3D frame AND the HUD canvas, because a game screenshot without
// its HUD is not the thing being judged. Pass {raw:true} for 3D only.
async function post(name, url) {
  try {
    const res = await fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
    return res.text();
  } catch (e) {
    return 'no shot sink (hosted build) — ' + name;   // artifact/static host has no server
  }
}
async function snap(name, opts = {}) {
  step(0);                                   // guarantee a fresh frame, no RAF needed
  if (opts.raw) return post(name, renderer.domElement.toDataURL('image/png'));
  const hudCv = hud.querySelector('canvas');
  if (!hudCv) return post(name, renderer.domElement.toDataURL('image/png'));
  const off = document.createElement('canvas');
  off.width = RENDER_W; off.height = RENDER_H;
  const o = off.getContext('2d');
  o.drawImage(renderer.domElement, 0, 0, RENDER_W, RENDER_H);
  o.drawImage(hudCv, 0, 0, RENDER_W, RENDER_H);
  return post(name, off.toDataURL('image/png'));
}
// Advance the sim deterministically: run(3, {sprint:true}) = 3 simulated seconds.
function run(seconds, opts = {}) {
  const dt = 1 / 60;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) {
    if (opts.keys) { keys.clear(); opts.keys.forEach((k) => keys.add(k)); }
    readInput();
    if (opts.input) Object.assign(input, opts.input);
    step(dt);
  }
  return { cop: agents.cop.position.toArray().map((v) => +v.toFixed(2)), state: game.st };
}
// Clean capture: raw scene through a posable camera, NO cctv grade and NO HUD.
// Used to judge the store on its own merits against real photography.
const probeCam = new THREE.PerspectiveCamera(52, RENDER_W / RENDER_H, 0.1, 200);
async function snapClean(name, pose) {
  if (pose) {
    probeCam.fov = pose.fov ?? 52;
    probeCam.position.set(...pose.pos);
    probeCam.lookAt(...pose.look);
    probeCam.updateProjectionMatrix();
  }
  const hidden = hud.style.display;
  hud.style.display = 'none';
  renderer.render(scene, probeCam);
  const url = renderer.domElement.toDataURL('image/png');
  hud.style.display = hidden;
  const res = await fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
  return res.text();
}
addEventListener('pointerdown', () => audio.resume(), { once: true });
addEventListener('keydown', () => audio.resume(), { once: true });

// Record the LIVE audio graph — same idea as snap(), for ears instead of eyes.
// Taps audio.master so it captures exactly what a player hears, not a special path.
async function recordAudio(seconds = 12, name = 'clip') {
  audio.resume();
  const dest = audio.ctx.createMediaStreamDestination();
  audio.master.connect(dest);
  const mr = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
  const chunks = [];
  mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  mr.start();
  const wasPaused = !rafOn;
  if (wasPaused) resumeLoop();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  mr.stop();
  await new Promise((r) => (mr.onstop = r));
  if (wasPaused) rafOn = false;
  audio.master.disconnect(dest);
  const blob = new Blob(chunks, { type: 'audio/webm' });
  const res = await fetch('/audio?name=' + encodeURIComponent(name), { method: 'POST', body: blob });
  return res.text();
}
function resumeLoop() { if (!rafOn) { rafOn = true; last = performance.now(); requestAnimationFrame(frame); } }

window.__CHOP = {
  audio, recordAudio, chaseCam,
  THREE, scene, renderer, agents, game, cctv, world, input, keys, snap, run, step,
  snapClean, probeCam,
  pause() { rafOn = false; }, resume() { if (!rafOn) { rafOn = true; last = performance.now(); requestAnimationFrame(frame); } },
};
