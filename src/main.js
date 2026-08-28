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
// Everything in the scene at THIS instant is store. agents.js adds the cop, each
// shopper rig, each cart, each child and the powerup props DIRECTLY to the scene at
// five separate sites with no common group — so name- and material-based hide lists
// kept missing one and leaking a character into a blind test. This is exact.
const STORE_NODES = new Set(scene.children);
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
  // Steer by moveYaw, NOT yaw: moveYaw is the corridor bearing with the player's
  // mouse-look taken out. Reading `yaw` here re-opens the feedback loop round 1
  // closed, by a longer path — mouse turns camera, camera-relative W drives the cop
  // diagonally, the camera's axis latch sees the cross-axis dominate, and the
  // corridor bearing flips 90 degrees on its own. A glance would whip the view.
  // Decoupling also matches what was actually asked for: "turn and look down those
  // aisles as I'm walking" is a head turn, not a change of course.
  const y = (chaseCam.moveYaw ?? chaseCam.yaw) || 0;
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
  // A capture failure must never look like a success. This returned a reassuring
  // "no shot sink (hosted build)" for ANY error, so when the server's /shot handler
  // broke, every agent's snap() silently no-op'd while reporting something benign.
  // Hosted builds (no server) are the only case allowed to be quiet.
  let res;
  try {
    res = await fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
  } catch (e) {
    if (location.protocol === 'file:' || !location.port) return 'no shot sink (static host) — ' + name;
    throw new Error('SNAP FAILED (' + name + '): ' + e.message);
  }
  const txt = await res.text();
  if (!res.ok) throw new Error('SNAP FAILED (' + name + '): HTTP ' + res.status + ' ' + txt.slice(0, 120));
  if (!/^shots\//.test(txt)) throw new Error('SNAP FAILED (' + name + '): unexpected reply ' + txt.slice(0, 120));
  return txt;
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
// storeOnly: hide everything the store did not build. Used for blind A/B captures,
// where a stray character or placeholder prop hands the critic a free call.
async function snapClean(name, pose, opts = {}) {
  const reHide = [];
  if (opts.storeOnly) {
    for (const o of scene.children) {
      if (!STORE_NODES.has(o) && o.visible && !o.isLight && !o.isCamera) {
        o.visible = false; reHide.push(o);
      }
    }
  }
  if (pose) {
    probeCam.fov = pose.fov ?? 52;
    probeCam.position.set(...pose.pos);
    probeCam.lookAt(...pose.look);
    probeCam.updateProjectionMatrix();
  }
  const hidden = hud.style.display;
  hud.style.display = 'none';
  let url;
  try {
    renderer.render(scene, probeCam);
    url = renderer.domElement.toDataURL('image/png');
  } finally {
    // RESTORE. `reHide` was collected and then never consumed, so ONE storeOnly
    // capture hid every cart, shopper and child FOR THE REST OF THE PAGE LOAD.
    // That is not a cosmetic leak: it put an empty, tidy corridor in every
    // render tile of every blind A/B this project has run, while every
    // photograph it was scored against has people, carts and pulled-forward
    // stock in it — a symmetry tell handed to the render by the harness, which
    // AGENTS_BRIEF spent several rounds attributing to the test design. It also
    // silently emptied any GRADED capture taken later in the same load.
    // Found by builder-store-r19 and fixed here; `finally` so a throwing render
    // cannot leave the scene half-hidden either.
    for (const o of reHide) o.visible = true;
    hud.style.display = hidden;
  }
  const res = await fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
  return res.text();
}
// ---- MUTE FOR AUTOMATED TESTING -----------------------------------------
// Every agent driving this page clicks and presses keys, and those are exactly
// the gestures a browser requires before it will start an AudioContext — so a
// tab being tested plays the store's full ambience, PA and foley out of the
// machine's speakers, at whoever is sitting there. Opt-in, persisted per
// browser profile, and OFF by default so a real player is unaffected:
//
//     ?mute  in the URL          one page load
//     __CHOP.mute(true)          persists via localStorage until mute(false)
//
// When muted the resume() listeners are never wired at all — the context stays
// in its default suspended state rather than being started and then turned
// down, which is both quieter and cheaper.
const MUTED = (() => {
  try {
    if (/[?&]mute(&|=|$)/.test(location.search)) return true;
    return localStorage.getItem('chopMute') === '1';
  } catch { return false; }          // private mode / storage blocked
})();
function setMuted(on) {
  try { localStorage.setItem('chopMute', on ? '1' : '0'); } catch { /* ignore */ }
  try {
    if (audio.master && audio.master.gain) audio.master.gain.value = on ? 0 : 1;
    ['ambience', 'pa', 'foley', 'ui'].forEach((n) => audio.setMix && audio.setMix(n, on ? 0 : 1));
    if (on) { audio.talkStop && audio.talkStop(); audio.ctx && audio.ctx.suspend && audio.ctx.suspend(); }
  } catch { /* audio may not be up yet; the flag still persists */ }
  return on;
}
if (MUTED) {
  setMuted(true);
} else {
  addEventListener('pointerdown', () => audio.resume(), { once: true });
  addEventListener('keydown', () => audio.resume(), { once: true });
}

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
  mute: setMuted, get muted() { return MUTED; },
};
