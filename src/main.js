// OWNER: LEAD. Bootstrap + wiring only. Builders should not need to edit this.
import * as THREE from 'three';
import { buildStore } from './store.js';
import { createCCTV } from './cctv.js';
import { createAgents } from './agents.js';
import { createGame } from './game.js';

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
const game = createGame(hud);

const floorCam = new THREE.PerspectiveCamera(58, RENDER_W / RENDER_H, 0.1, 160);

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
  input.x = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  input.z = (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0);
  input.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
  const l = Math.hypot(input.x, input.z) || 1;
  input.x /= l; input.z /= l;
}

// One simulation + render step. Never depends on requestAnimationFrame, so it
// still runs when the tab is backgrounded — critics rely on this.
function step(dt) {
  agents.update(dt, input, game.api || {});
  game.update(dt);
  if (game.mode === 'desk') {
    cctv.renderWall(dt);
  } else {
    const c = agents.cop.position;
    floorCam.position.set(c.x, 6.4, c.z - 7.6);
    floorCam.lookAt(c.x, 1.0, c.z + 2.5);
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
async function snap(name) {
  step(0);                                   // guarantee a fresh frame, no RAF needed
  const url = renderer.domElement.toDataURL('image/png');
  const res = await fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
  return res.text();
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
window.__CHOP = {
  THREE, scene, renderer, agents, game, cctv, world, input, keys, snap, run, step,
  pause() { rafOn = false; }, resume() { if (!rafOn) { rafOn = true; last = performance.now(); requestAnimationFrame(frame); } },
};
