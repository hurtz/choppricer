// OWNER: builder-agents. Cop, shoppers, thieves, stamina, powerups. The chase feel.
// CONTRACT — must keep exporting exactly this:
//   createAgents(THREE, scene, world) -> {
//     cop, shoppers, update(dt, input, api), reset()
//   }
// `api` provides: api.onBolt(shopper), api.onCatch(shopper),
//                 api.onEscape(shopper), api.onHarass(shopper)
// All movement constants come from TUNING in ./config.js.
//
// Also (additive, all optional — nothing breaks if the other side is absent):
//   we CALL   api.report({stamina,staminaMax,boost,gassed,speed,nearest,chase})
//   we READ   api.mode / api.aisle / api.frozen / api.wantSuspect
//   we EXPOSE agents.bench(opts) — deterministic chase harness, see bottom of file.
import {
  TUNING, EXIT, aisleX, AISLE_LEN, AISLE_COUNT, AISLE_GAP, SHELF_W,
  STORE, FRONT_WALK_Z,
} from './config.js';
import { makeNav } from './agents/nav.js';

// ---------------------------------------------------------------------------
// Tunables. Anything already in TUNING is read from TUNING, no local copy.
// The `?? fallback` ones are values I want promoted into TUNING by the lead;
// if they appear there, they are picked up automatically with no code change.
// ---------------------------------------------------------------------------
const T = TUNING;
const K = {
  get copGrip()       { return T.copGrip       ?? 0.78; }, // lateral accel fraction at top speed
  get gassedRecover() { return T.gassedRecover ?? 0.26; }, // stamina frac needed to un-gas
  get thiefAccel()    { return T.thiefAccel    ?? 15.0; },
  get thiefCorner()   { return T.thiefCorner   ?? 0.60; }, // speed mult on a 90 degree cut
  get thiefReact()    { return T.thiefReact    ?? 0.22; }, // seconds of "oh shit" before the bolt
  get pickupRadius()  { return T.pickupRadius  ?? 0.30; },
  get shopperCount()  { return T.shopperCount  ?? 14; },
  get thiefCount()    { return T.thiefCount    ?? 2; },
  // A powerup is an item ON A SHELF, not a floor pickup. Sitting it on the aisle
  // centreline put it directly under a pure-pursuit chase: the bench measured the
  // "no powerup" cop boosted 45% of the chase because he ran over free cans.
  // Push it to the shelf lip so grabbing one costs you a deliberate swerve.
  get pickupLip()     { return T.pickupLip     ?? 1.58; }, // metres off centreline
  get thiefCornerFree(){return T.thiefCornerFree?? 0.86; },// cos above which a turn is free
  // The thief's own wind. He is a shoplifter with a jacket full of steaks, not a
  // sprinter — thiefRun is his first-few-seconds ceiling, not his cruise.
  get thiefWind()     { return T.thiefWind     ?? 2.60; }, // sec of flat-out running
  get thiefTired()    { return T.thiefTired    ?? 0.620; },// x thiefRun once blown
  get thiefPanic()    { return T.thiefPanic    ?? 0.965; },// x thiefRun with footsteps on him
  get thiefPanicGap() { return T.thiefPanicGap ?? 3.00; }, // metres at which fear starts
  get thiefPanicBand(){ return T.thiefPanicBand?? 0.90; }, // metres from fear to flat-out
  get thiefSecond()   { return T.thiefSecond   ?? 0.42; }, // wind regained per sec when clear
};

// main.js maps KeyW -> input.z = -1, but its floor camera sits at cop.z - 7.6
// looking toward +Z, so +Z is "up the screen". Flip here so W runs away from
// the camera instead of into it.
const FWD_SIGN = -1;

const BODY_R = 0.42;          // agent collision radius
const CART_R = 0.34;
const HALF_LEN = AISLE_LEN / 2;
const LANE_HALF = AISLE_GAP / 2;
const AISLE_PITCH = AISLE_GAP + SHELF_W;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

// Deterministic RNG so bench() is repeatable.
let _seed = 0x9e3779b9;
function setSeed(s) { _seed = (s >>> 0) || 1; }
function rnd() {
  _seed |= 0; _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const rr = (a, b) => a + rnd() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length];

// ---------------------------------------------------------------------------
// NAVIGATION — see ./agents/nav.js. The route comes off the real collider set,
// not off the floor plan, because the store puts furniture in the lanes.
// ---------------------------------------------------------------------------
const AISLE_PITCH_ = AISLE_PITCH;
function aisleOf(x) {
  return clamp(Math.round(x / AISLE_PITCH_ + (AISLE_COUNT - 1) / 2), 0, AISLE_COUNT - 1);
}
const dist2d = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// ---------------------------------------------------------------------------
// COLLISION — push a circle out of the store's Box3 colliders. Uniform-grid
// broadphase so a shelf-packed store with hundreds of boxes stays cheap.
// ---------------------------------------------------------------------------
function makeSolids(world) {
  const src = (world && world.colliders) || [];
  const boxes = [];
  for (const b of src) {
    if (!b || !b.min || !b.max) continue;
    if (b.min.y > 1.55) continue;             // hanging signs, lights — walk under
    if (b.max.y < 0.16) continue;             // floor decals
    boxes.push({ x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z });
  }
  const CELL = 3.0;
  const grid = new Map();
  const key = (cx, cz) => cx * 4096 + cz;
  boxes.forEach((b, idx) => {
    const cx0 = Math.floor(b.x0 / CELL), cx1 = Math.floor(b.x1 / CELL);
    const cz0 = Math.floor(b.z0 / CELL), cz1 = Math.floor(b.z1 / CELL);
    for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
      const k = key(cx, cz);
      let a = grid.get(k); if (!a) grid.set(k, a = []);
      a.push(idx);
    }
  });
  return {
    count: src.length, boxes,
    resolve(p, r) {
      const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
      for (let ax = cx - 1; ax <= cx + 1; ax++) for (let az = cz - 1; az <= cz + 1; az++) {
        const a = grid.get(key(ax, az)); if (!a) continue;
        for (const idx of a) {
          const b = boxes[idx];
          const nx = clamp(p.x, b.x0, b.x1), nz = clamp(p.z, b.z0, b.z1);
          let dx = p.x - nx, dz = p.z - nz;
          const d = Math.hypot(dx, dz);
          if (d > r) continue;
          if (d < 1e-5) {           // dead centre: eject along the shallow axis
            const px = Math.min(p.x - b.x0, b.x1 - p.x);
            const pz = Math.min(p.z - b.z0, b.z1 - p.z);
            if (px < pz) p.x += (p.x - (b.x0 + b.x1) / 2 > 0 ? 1 : -1) * (px + r);
            else p.z += (p.z - (b.z0 + b.z1) / 2 > 0 ? 1 : -1) * (pz + r);
            continue;
          }
          const push = (r - d) / d;
          p.x += dx * push; p.z += dz * push;
        }
      }
      p.x = clamp(p.x, STORE.minX + 0.6, STORE.maxX - 0.6);
      p.z = clamp(p.z, STORE.minZ + 0.35, STORE.maxZ - 0.6);
    },
  };
}

// ---------------------------------------------------------------------------
// MESHES
// ---------------------------------------------------------------------------
const SKIN = [0xf0c8a0, 0xe0ab84, 0xc68f68, 0x8d5a3b, 0x62402c, 0xf7d7b8];
const HAIR = [0x2b2118, 0x120e0b, 0x6b4a2a, 0x9c8b6e, 0xa8a8a8, 0x4a3320, 0x7d2f16];
const CLOTH = [
  0x9aa7b4, 0x6d7f8c, 0xb8574a, 0x4a6b52, 0xd6c07a, 0x8a6f92, 0x3f4a5c,
  0xc98a4b, 0x7d8f6b, 0xa8b6c4, 0x5c4a3f, 0xbfa89b, 0x2f4858, 0xd9b8a0,
];
const PANTS = [0x2f3a4a, 0x3d3d42, 0x5a4738, 0x1f2733, 0x6b6b70, 0x4a3f52];

function buildGeo(THREE) {
  return {
    torso: new THREE.CapsuleGeometry(0.19, 0.42, 3, 7),
    head: new THREE.SphereGeometry(0.135, 10, 8),
    hair: new THREE.SphereGeometry(0.142, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.62),
    limb: new THREE.BoxGeometry(0.135, 0.56, 0.16),
    arm: new THREE.BoxGeometry(0.11, 0.50, 0.13),
    belly: new THREE.SphereGeometry(0.25, 12, 9),
    cap: new THREE.CylinderGeometry(0.145, 0.155, 0.09, 12),
    brim: new THREE.BoxGeometry(0.30, 0.025, 0.16),
    belt: new THREE.TorusGeometry(0.235, 0.035, 5, 14),
    basket: new THREE.BoxGeometry(0.54, 0.30, 0.72),
    bar: new THREE.BoxGeometry(0.56, 0.035, 0.035),
    post: new THREE.BoxGeometry(0.035, 0.44, 0.035),
    wheel: new THREE.CylinderGeometry(0.045, 0.045, 0.03, 6),
    goods: new THREE.BoxGeometry(0.15, 0.18, 0.11),
    can: new THREE.CylinderGeometry(0.062, 0.062, 0.19, 10),
    dbox: new THREE.BoxGeometry(0.34, 0.11, 0.26),
    ring: new THREE.RingGeometry(0.42, 0.60, 20),
  };
}

function makePerson(THREE, G, o) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshStandardMaterial({ color: o.shirt, roughness: 0.92 });
  const pants = new THREE.MeshStandardMaterial({ color: o.pants, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: o.skin, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 1.0 });

  const hips = new THREE.Group(); hips.position.y = 0.62; g.add(hips);

  const torso = new THREE.Mesh(G.torso, shirt);
  torso.position.y = 0.31; torso.scale.set(o.girth, 1, o.girth * 0.84);
  torso.castShadow = true; hips.add(torso);

  let belly = null;
  if (o.girth > 1.25) {
    belly = new THREE.Mesh(G.belly, shirt);
    belly.position.set(0, 0.20, 0.10);
    belly.scale.set(o.girth * 0.82, 0.78, o.girth * 0.62);
    hips.add(belly);
  }

  const neck = new THREE.Group(); neck.position.y = 0.60; hips.add(neck);
  const head = new THREE.Mesh(G.head, skin); neck.add(head);
  const hairM = new THREE.Mesh(G.hair, hair); hairM.position.y = 0.012; neck.add(hairM);

  const mkLimb = (geo, mat, x, y) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0);
    const m = new THREE.Mesh(geo, mat); m.position.y = -geo.parameters.height / 2;
    piv.add(m); hips.add(piv); return piv;
  };
  const legL = mkLimb(G.limb, pants, -0.11 * o.girth, 0.02);
  const legR = mkLimb(G.limb, pants, 0.11 * o.girth, 0.02);
  const armL = mkLimb(G.arm, shirt, -0.20 * o.girth - 0.03, 0.53);
  const armR = mkLimb(G.arm, shirt, 0.20 * o.girth + 0.03, 0.53);

  g.scale.setScalar(o.height);
  return { root: g, hips, torso, belly, neck, head, legL, legR, armL, armR, shirt, pants };
}

function makeCart(THREE, G) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.45, metalness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x39393d, roughness: 0.85 });
  const b = new THREE.Mesh(G.basket, steel);
  b.position.set(0, 0.62, 0.05); b.rotation.x = -0.10; b.castShadow = true; g.add(b);
  const bar = new THREE.Mesh(G.bar, dark); bar.position.set(0, 0.86, -0.30); g.add(bar);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(G.post, steel); p.position.set(s * 0.24, 0.24, 0.30); g.add(p);
    const q = new THREE.Mesh(G.post, steel); q.position.set(s * 0.24, 0.24, -0.26); g.add(q);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(G.wheel, dark);
    w.position.set(sx * 0.22, 0.045, sz * 0.28); w.rotation.z = Math.PI / 2; g.add(w);
  }
  return g;
}

function angerTexture(THREE) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#d8342a'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill();
  x.fillStyle = '#fff'; x.font = 'bold 46px sans-serif'; x.textAlign = 'center';
  x.fillText('!', 32, 49);
  const t = new THREE.CanvasTexture(c); t.needsUpdate = true; return t;
}

// ===========================================================================
export function createAgents(THREE, scene, world) {
  world = world || {};
  const G = buildGeo(THREE);
  let solids = makeSolids(world);
  let solidCount = solids.count;
  // One grid, one flood-fill out from the doors. Every thief in the store
  // shares it, and it only gets rebuilt when the store itself changes.
  const buildNav = () => makeNav(solids.boxes, STORE, {
    cell: 0.42, pad: BODY_R + 0.10,
    walkMinX: STORE.minX + 0.6, walkMaxX: STORE.maxX - 0.6,
    walkMinZ: STORE.minZ + 0.35, walkMaxZ: STORE.maxZ - 0.6,
  });
  let nav = buildNav();
  let exitF = nav.field(EXIT.x, EXIT.z);
  const toExit = (x, z) => nav.at(exitF, x, z);          // metres of route left
  const canReachExit = (x, z) => nav.reachable(exitF, x, z);

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ---- cop -----------------------------------------------------------------
  const copRig = makePerson(THREE, G, {
    shirt: 0x2c3a56, pants: 0x22252c, skin: 0xe2b48c, hair: 0x50412e,
    girth: 1.62, height: 1.06,
  });
  {
    const duty = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.7 });
    const belt = new THREE.Mesh(G.belt, duty);
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.06;
    belt.scale.set(1.42, 1.42, 1.0); copRig.hips.add(belt);
    const cap = new THREE.Mesh(G.cap, new THREE.MeshStandardMaterial({ color: 0x1e2a44, roughness: 0.8 }));
    cap.position.y = 0.10; copRig.neck.add(cap);
    const brim = new THREE.Mesh(G.brim, new THREE.MeshStandardMaterial({ color: 0x16203a, roughness: 0.8 }));
    brim.position.set(0, 0.075, 0.145); copRig.neck.add(brim);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.045, 8),
      new THREE.MeshStandardMaterial({ color: 0xd9c169, roughness: 0.3, metalness: 0.8 }));
    badge.position.set(-0.13, 0.42, 0.20 * 1.62); copRig.hips.add(badge);
  }
  const cop = copRig.root;
  cop.userData = {
    rig: copRig, vel: V(0, 0, 0), speed: 0, phase: 0, heading: 0, prevHeading: 0,
    stamina: T.staminaMax, gassed: false, boost: 0, breath: 0, lean: 0, skid: 0, turn: 0,
  };
  scene.add(cop);
  // steer() writes speed/skid and moves .position; the cop's live on userData.
  const copBody = {
    position: cop.position, vel: cop.userData.vel,
    get speed() { return cop.userData.speed; }, set speed(v) { cop.userData.speed = v; },
    get skid() { return cop.userData.skid; }, set skid(v) { cop.userData.skid = v; },
  };

  // ---- shoppers ------------------------------------------------------------
  const angerTex = angerTexture(THREE);
  const shoppers = [];
  let nextId = 1;

  function makeShopper() {
    const rig = makePerson(THREE, G, {
      shirt: pick(CLOTH), pants: pick(PANTS), skin: pick(SKIN), hair: pick(HAIR),
      girth: rr(0.86, 1.30), height: rr(0.94, 1.10),
    });
    const cart = makeCart(THREE, G);
    cart.visible = false;
    const held = new THREE.Mesh(G.goods, new THREE.MeshStandardMaterial({ color: pick(CLOTH), roughness: 0.9 }));
    held.visible = false; rig.root.add(held);
    const bang = new THREE.Sprite(new THREE.SpriteMaterial({ map: angerTex, transparent: true, depthTest: false }));
    bang.scale.setScalar(0.42); bang.position.y = 2.05; bang.visible = false; rig.root.add(bang);
    scene.add(rig.root); scene.add(cart);
    const s = {
      id: nextId++, rig, mesh: rig.root, cart, held, bang,
      position: rig.root.position, vel: V(0, 0, 0), speed: 0, phase: rnd() * 7,
      heading: 0, hasCart: true, guilty: false, aisle: 0,
      state: 'walk', timer: 0, path: [], repathIn: 0, wind: 1, aim: null, aimT: 0,
      bolted: false, escaped: false, caught: false, angry: 0, harassArmed: true,
      concealT: 0, look: 0, lean: 0, target: null, dropCartAt: null,
    };
    shoppers.push(s);
    return s;
  }

  // ---- powerups ------------------------------------------------------------
  const powerups = [];
  function buildPowerups() {
    for (const p of powerups) scene.remove(p.mesh);
    powerups.length = 0;
    let spots = (world.powerupSpots || []).filter((s) => s && isFinite(s.x) && isFinite(s.z));
    if (!spots.length) {                     // store mid-rebuild: synthesize
      spots = [];
      for (let i = 0; i < AISLE_COUNT; i++) {
        spots.push({ x: aisleX(i), z: (i % 2 ? 1 : -1) * (3 + i * 1.4), kind: i % 2 ? 'donuts' : 'energy' });
      }
    }
    for (const sp of spots) {
      const kind = sp.kind === 'donuts' ? 'donuts' : 'energy';
      const g = new THREE.Group();
      const col = kind === 'energy' ? 0x63e05a : 0xf07fae;
      const item = new THREE.Mesh(kind === 'energy' ? G.can : G.dbox,
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.35, emissive: col, emissiveIntensity: 0.55 }));
      item.position.y = 1.06; g.add(item);
      const ring = new THREE.Mesh(G.ring, new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false,
      }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; g.add(ring);
      // Keep it inside the walkable lane even if the store parked it in a shelf,
      // and if the store handed us a bare centreline point, shove it out to the
      // shelf lip — a can on the centreline is a free boost for anyone running
      // the aisle, which is exactly what a chase does.
      // Snap it to the shelf lip, keeping the side and the depth the store
      // chose. A can sitting on the lane centreline is a free boost for anyone
      // running the aisle, and a chase runs the aisle: the bench measured the
      // supposedly-unpowered cop boosted 45% of the time. It is on a SHELF.
      const inAisle = Math.abs(sp.z) < HALF_LEN - 0.5;
      const ai = aisleOf(sp.x);
      const off = sp.x - aisleX(ai);
      const side = off < 0 ? -1 : off > 0 ? 1 : (powerups.length % 2 ? 1 : -1);
      const x = inAisle ? aisleX(ai) + side * K.pickupLip
                        : clamp(sp.x, STORE.minX + 1, STORE.maxX - 1);
      const z = inAisle ? clamp(sp.z, -HALF_LEN + 1, HALF_LEN - 1)
                        : clamp(sp.z, STORE.minZ + 1, STORE.maxZ - 1);
      g.position.set(x, 0, z); scene.add(g);
      powerups.push({ mesh: g, item, ring, x, z, kind, live: true, respawn: 0 });
    }
  }
  buildPowerups();

  // ---- spawn / reset -------------------------------------------------------
  // Never drop anyone in a pocket the store has sealed off — a thief who cannot
  // reach the doors is not a chase, he is a bug that reads as one.
  function placeInAisle(s) {
    let i = 0, x = 0, z = 0;
    for (let k = 0; k < 24; k++) {
      i = ri(0, AISLE_COUNT - 1);
      x = aisleX(i) + rr(-1.1, 1.1);
      z = rr(-HALF_LEN + 1.5, HALF_LEN - 1.5);
      if (nav.free(x, z) && canReachExit(x, z)) break;
    }
    s.position.set(x, 0, z);
    s.aisle = i;
  }
  function resetShopper(s, guilty) {
    placeInAisle(s);
    s.vel.set(0, 0, 0); s.speed = 0; s.state = 'walk'; s.timer = rr(0.5, 4);
    s.path = []; s.repathIn = 0; s.guilty = !!guilty; s.bolted = false;
    s.escaped = false; s.caught = false; s.angry = 0; s.harassArmed = true;
    s.concealT = guilty ? rr(2.5, 7.0) : 0; s.look = 0; s.lean = 0; s.wind = 1;
    s.aim = null; s.aimT = 0;
    s.hasCart = true; s.cart.visible = true; s.mesh.visible = true;
    s.held.visible = false; s.bang.visible = false; s.target = null;
    s.stole = false;
  }

  function reset() {
    while (shoppers.length < K.shopperCount) makeShopper();
    const guiltyIdx = new Set();
    while (guiltyIdx.size < Math.min(K.thiefCount, shoppers.length)) guiltyIdx.add(ri(0, shoppers.length - 1));
    shoppers.forEach((s, i) => resetShopper(s, guiltyIdx.has(i)));
    cop.position.set(0, 0, FRONT_WALK_Z + 1.5);
    const cu = cop.userData;
    cu.vel.set(0, 0, 0); cu.speed = 0; cu.stamina = T.staminaMax;
    cu.gassed = false; cu.boost = 0; cu.heading = 0; cu.skid = 0;
    for (const p of powerups) { p.live = true; p.respawn = 0; p.mesh.visible = true; }
  }
  setSeed(20240822);
  reset();

  // ---- shared steering -----------------------------------------------------
  // Split accel into along-velocity and lateral. Lateral authority drops with
  // speed, so a heavy body swings wide instead of pivoting.
  function steer(ent, dirx, dirz, target, accel, gripAtSpeed, topSpeed, dt) {
    const v = ent.vel;
    const tvx = dirx * target, tvz = dirz * target;
    let dvx = tvx - v.x, dvz = tvz - v.z;
    const sp = Math.hypot(v.x, v.z);
    let ax, az;
    if (sp > 0.4) {
      const fx = v.x / sp, fz = v.z / sp;
      const along = dvx * fx + dvz * fz;
      let lx = dvx - along * fx, lz = dvz - along * fz;
      const lm = Math.hypot(lx, lz);
      const spN = clamp(sp / topSpeed, 0, 1.2);
      const latMax = accel * (1 - (1 - gripAtSpeed) * spN);
      const alMax = accel;
      const aAlong = clamp(along, -alMax * dt, alMax * dt);
      const aLat = lm > 1e-6 ? Math.min(lm, latMax * dt) : 0;
      ax = fx * aAlong + (lm > 1e-6 ? (lx / lm) * aLat : 0);
      az = fz * aAlong + (lm > 1e-6 ? (lz / lm) * aLat : 0);
      ent.skid = lm > 1e-6 ? clamp(aLat / (latMax * dt + 1e-9), 0, 1) * clamp(sp / topSpeed, 0, 1) : 0;
    } else {
      const dm = Math.hypot(dvx, dvz);
      const step = Math.min(dm, accel * dt);
      ax = dm > 1e-6 ? (dvx / dm) * step : 0;
      az = dm > 1e-6 ? (dvz / dm) * step : 0;
      ent.skid = 0;
    }
    v.x += ax; v.z += az;
    ent.speed = Math.hypot(v.x, v.z);
    ent.position.x += v.x * dt; ent.position.z += v.z * dt;
  }

  function followPath(ent, dt) {
    while (ent.path.length) {
      const w = ent.path[0];
      const d = dist2d(ent.position.x, ent.position.z, w.x, w.z);
      const nxt = ent.path[1];
      if (d < 0.75 || (nxt && nav.clearSeg(ent.position.x, ent.position.z, nxt.x, nxt.z) && ent.path.length > 1)) {
        ent.path.shift(); continue;
      }
      break;
    }
    if (!ent.path.length) return null;
    const w = ent.path[0];
    let dx = w.x - ent.position.x, dz = w.z - ent.position.z;
    const m = Math.hypot(dx, dz) || 1;
    return { x: dx / m, z: dz / m, dist: m };
  }

  // Steer away from other bodies so the aisles feel occupied, not ghostly.
  function avoid(ent, dirx, dirz, radius, strength) {
    let ax = 0, az = 0;
    for (const o of shoppers) {
      if (o === ent || o.escaped || !o.mesh.visible) continue;
      const dx = ent.position.x - o.position.x, dz = ent.position.z - o.position.z;
      const d = Math.hypot(dx, dz);
      if (d > radius || d < 1e-4) continue;
      const w = (1 - d / radius) * strength;
      ax += (dx / d) * w; az += (dz / d) * w;
    }
    const dx = ent.position.x - cop.position.x, dz = ent.position.z - cop.position.z;
    const d = Math.hypot(dx, dz);
    if (d < radius + 0.3 && d > 1e-4) {
      const w = (1 - d / (radius + 0.3)) * strength * 1.3;
      ax += (dx / d) * w; az += (dz / d) * w;
    }
    const nx = dirx + ax, nz = dirz + az;
    const m = Math.hypot(nx, nz) || 1;
    return { x: nx / m, z: nz / m };
  }

  // ---- cop update ----------------------------------------------------------
  function updateCop(dt, input, frozen) {
    const u = cop.userData;
    let ix = frozen ? 0 : (input.x || 0);
    let iz = frozen ? 0 : FWD_SIGN * (input.z || 0);
    const mag = Math.hypot(ix, iz);
    const moving = mag > 0.02;
    if (moving) { ix /= mag; iz /= mag; }

    const wantSprint = !frozen && !!input.sprint && moving;
    const boosted = u.boost > 0;
    const canSprint = wantSprint && (boosted || (u.stamina > 0 && !u.gassed));

    if (boosted) {
      u.boost = Math.max(0, u.boost - dt);
      u.stamina = T.staminaMax;                 // energy drink: you are not tired
      u.gassed = false;
    } else if (canSprint) {
      u.stamina -= T.staminaDrain * dt;
    } else {
      u.stamina += T.staminaRegen * dt * (moving ? 1 : 1.6);
    }
    u.stamina = clamp(u.stamina, 0, T.staminaMax);
    if (u.stamina <= 0.0001) u.gassed = true;
    if (u.gassed && u.stamina >= K.gassedRecover * T.staminaMax) u.gassed = false;

    // Gassed = a wheezing labored jog, not a dead stop: run speed x penalty.
    let target = canSprint ? T.copRun : T.copWalk;
    if (u.gassed) target = (wantSprint ? T.copRun : T.copWalk) * T.gassedPenalty;
    if (boosted) target *= T.boostMul;
    if (!moving) target = 0;

    const top = T.copRun * T.boostMul;
    steer(copBody, ix, iz, target, T.copAccel, K.copGrip, top, dt);
    solids.resolve(cop.position, BODY_R);

    // shove shoppers out of the way rather than clipping through them
    for (const s of shoppers) {
      if (s.escaped || !s.mesh.visible) continue;
      const dx = s.position.x - cop.position.x, dz = s.position.z - cop.position.z;
      const d = Math.hypot(dx, dz), min = BODY_R + 0.36;
      if (d < min && d > 1e-4) {
        const push = (min - d) / d;
        s.position.x += dx * push * 0.8; s.position.z += dz * push * 0.8;
        cop.position.x -= dx * push * 0.2; cop.position.z -= dz * push * 0.2;
        u.vel.multiplyScalar(0.985);
      }
    }
    animateCop(dt, moving, boosted);
  }

  function animateCop(dt, moving, boosted) {
    const u = cop.userData, r = u.rig;
    if (u.speed > 0.12) u.heading = Math.atan2(u.vel.x, u.vel.z);
    let dh = u.heading - u.prevHeading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    u.prevHeading = u.heading;
    u.turn = lerp(u.turn, dt > 0 ? clamp(dh / dt, -4, 4) : 0, 1 - Math.exp(-12 * (dt || 0.016)));
    cop.rotation.y = u.heading;
    const stride = 0.95;
    u.phase += (u.speed / stride) * dt * Math.PI * 2;
    const amp = clamp(u.speed * 0.17, 0.04, 0.62);
    const sw = Math.sin(u.phase);
    r.legL.rotation.x = sw * amp; r.legR.rotation.x = -sw * amp;
    r.armL.rotation.x = -sw * amp * 0.85; r.armR.rotation.x = sw * amp * 0.85;
    r.armL.rotation.z = 0.30; r.armR.rotation.z = -0.30;   // arms out over the gut

    // lean into the turn — sells the skid
    const wantLean = clamp(u.turn * 0.11 * clamp(u.speed / T.copRun, 0, 1.3), -0.36, 0.36);
    u.lean = lerp(u.lean, wantLean, 1 - Math.exp(-9 * (dt || 0.016)));
    r.hips.rotation.z = u.lean;

    u.breath += dt * (u.gassed ? 7.4 : 2.2);
    const puff = Math.sin(u.breath);
    if (u.gassed) {
      r.hips.rotation.x = lerp(r.hips.rotation.x, 0.34, 1 - Math.exp(-7 * dt));   // hunched
      r.neck.rotation.x = lerp(r.neck.rotation.x, -0.30, 1 - Math.exp(-7 * dt));  // head up, gasping
      if (r.belly) r.belly.scale.z = 1.0 * (1 + puff * 0.10);
      r.hips.position.y = 0.62 + puff * 0.022;
      if (!moving) { r.armL.rotation.x = -1.15; r.armR.rotation.x = -1.15; }      // hands on knees
    } else {
      const t = boosted ? 0.20 : 0.06 + clamp(u.speed * 0.03, 0, 0.12);
      r.hips.rotation.x = lerp(r.hips.rotation.x, t, 1 - Math.exp(-7 * dt));
      r.neck.rotation.x = lerp(r.neck.rotation.x, 0, 1 - Math.exp(-7 * dt));
      if (r.belly) r.belly.scale.z = 1.0 * (1 + puff * 0.035);
      r.hips.position.y = 0.62 + Math.abs(Math.sin(u.phase)) * 0.028;
    }
    r.shirt.emissive?.setHex(boosted ? 0x1d3a12 : 0x000000);
  }

  // ---- shopper / thief update ---------------------------------------------
  function wanderTarget(s) {
    const i = rnd() < 0.55 ? s.aisle : ri(0, AISLE_COUNT - 1);
    s.aisle = i;
    return { x: aisleX(i) + rr(-1.15, 1.15), z: rr(-HALF_LEN + 1.2, HALF_LEN - 1.2) };
  }

  // How fast the thief can ACTUALLY run right now.
  //
  // T.thiefRun is his ceiling for the first couple of seconds, not his cruise.
  // He is a shoplifter with a jacket full of steaks; he blows up on roughly the
  // same clock the cop does. Without this the chase is a straight speed subtract
  // — thief 5.35, cop 5.05 — and the gap grows 0.30 m/s forever, so the only way
  // it ever ends is the cop tripping over a free powerup. That is what the bench
  // caught. With it, both of them gas out around the same time, the gap parks a
  // couple of metres out, and every time the cop gets his wind back he surges
  // and very nearly touches him.
  //
  // The one concession to drama: footsteps right behind you find you another
  // gear. Adrenaline is drawn from the same tank and empties it faster, so a
  // thief who has already been run down once cannot keep doing it.
  function thiefPace(s, copD, dt) {
    const near = clamp((K.thiefPanicGap - copD) / K.thiefPanicBand, 0, 1);
    s.wind = clamp(s.wind - dt * (1 + near * 1.4) / K.thiefWind, 0, 1);
    const cruise = lerp(K.thiefTired, 1, s.wind);           // opening sprint, fading
    const surge = lerp(K.thiefTired, K.thiefPanic, near);   // fear, always available
    s.dbgNear = near;
    return T.thiefRun * Math.max(cruise, surge);
  }

  // Escape direction, read off the exit field. No repathing, no waypoint list
  // and no thrash — and it cannot point at a wall, which is the entire reason
  // this file no longer navigates off config.js's floor plan.
  function navToExit(s, avoidCop, dt) {
    // Re-reading the field every frame is pure cost: the aim point is stable for
    // several metres of running. Refresh it on a timer, when he reaches it, or
    // when it stops being something he can see.
    s.aimT -= dt;
    const px = s.position.x, pz = s.position.z;
    let a = s.aim;
    if (!a || s.aimT <= 0 || dist2d(px, pz, a.x, a.z) < 0.85 || !nav.clearSeg(px, pz, a.x, a.z)) {
      const d = nav.steer(exitF, px, pz, { avoid: avoidCop, look: 6.5 });
      s.aimT = 0.13;
      a = s.aim = d ? { x: d.tx, z: d.tz } : null;
    }
    if (!a) {
      const dx = EXIT.x - px, dz = EXIT.z - pz;                     // sealed pocket
      const m = Math.hypot(dx, dz) || 1;
      return { x: dx / m, z: dz / m, dist: m };
    }
    const dx = a.x - px, dz = a.z - pz;
    const m = Math.hypot(dx, dz) || 1;
    return { x: dx / m, z: dz / m, dist: m };
  }

  function updateShopper(s, dt, api, frozen) {
    if (s.escaped || s.caught) { animateShopper(s, dt, 0); return; }
    if (frozen) { s.vel.multiplyScalar(Math.exp(-6 * dt)); animateShopper(s, dt, 0); return; }

    const copD = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
    s.aisle = aisleOf(s.position.x);
    if (s.state !== 'bolt') s.wind = clamp(s.wind + dt * K.thiefSecond, 0, 1);

    // ---- guilty timeline: browse -> conceal -> drift -> bolt
    if (s.guilty && !s.bolted) {
      if (!s.stole) {
        s.concealT -= dt;
        if (s.concealT <= 0 && s.state !== 'conceal') {
          s.state = 'conceal'; s.timer = 1.9; s.look = 0;
          s.held.visible = true;
          s.held.position.set(0.22, 1.02, 0.24);
        }
      }
      if (s.state === 'drift' && copD < T.suspicionRadius) { s.state = 'react'; s.timer = K.thiefReact; }
      if (s.state === 'conceal' && copD < T.suspicionRadius && s.timer < 1.2) { s.state = 'react'; s.timer = K.thiefReact; }
    } else if (!s.guilty) {
      // ---- innocent: turn and yell, never run
      if (copD < T.suspicionRadius && s.harassArmed && s.angry <= 0) {
        s.angry = 2.6; s.harassArmed = false; s.bang.visible = true;
        api.onHarass && api.onHarass(s);
      }
      if (copD > T.suspicionRadius + 1.6) s.harassArmed = true;
      if (s.angry > 0) { s.angry -= dt; if (s.angry <= 0) s.bang.visible = false; }
    }

    let target = T.thiefWalk;
    let dir = null;

    switch (s.state) {
      case 'walk': {
        s.timer -= dt;
        if (!s.path.length) {
          if (!s.target) s.target = wanderTarget(s);
          s.path = nav.path(s.position.x, s.position.z, s.target.x, s.target.z);
        }
        dir = followPath(s, dt);
        if (!dir) { s.target = null; s.state = 'browse'; s.timer = rr(1.6, 4.5); }
        break;
      }
      case 'browse': {
        s.timer -= dt;
        target = 0;
        if (s.timer <= 0) { s.state = 'walk'; s.timer = rr(4, 9); s.target = null; s.path = []; }
        break;
      }
      case 'conceal': {
        s.timer -= dt; target = 0;
        const t = 1 - clamp(s.timer / 1.9, 0, 1);
        // item arcs from the shelf lip into the jacket, then is gone
        const ax = lerp(0.30, 0.02, clamp(t * 1.6, 0, 1));
        const ay = lerp(1.02, 1.12, clamp(t * 1.6, 0, 1)) + Math.sin(clamp(t * 1.6, 0, 1) * Math.PI) * 0.16;
        const az = lerp(0.28, 0.13, clamp(t * 1.6, 0, 1));
        s.held.position.set(ax, ay, az);
        s.held.visible = t < 0.62;
        s.look = Math.sin(t * Math.PI * 3.2) * 0.85;              // shoulder checks
        if (s.timer <= 0) { s.stole = true; s.state = 'drift'; s.path = []; s.held.visible = false; }
        break;
      }
      case 'drift': {
        dir = navToExit(s, null, dt);
        target = T.thiefWalk * 1.12;
        s.look = Math.sin(s.phase * 0.8) * 0.5;
        if (dist2d(s.position.x, s.position.z, EXIT.x, EXIT.z) < 1.4) { escape(s, api); return; }
        break;
      }
      case 'react': {
        s.timer -= dt; target = 0.5;
        dir = { x: (s.position.x - cop.position.x), z: (s.position.z - cop.position.z) };
        const m = Math.hypot(dir.x, dir.z) || 1; dir.x /= m; dir.z /= m;
        s.look = 1.0;
        if (s.timer <= 0) {
          s.state = 'bolt'; s.bolted = true; s.path = []; s.repathIn = 0;
          if (s.hasCart) { s.hasCart = false; s.dropCartAt = { x: s.position.x, z: s.position.z, y: s.heading }; }
          api.onBolt && api.onBolt(s);
        }
        break;
      }
      case 'bolt': {
        // Aim point comes off the exit field, held clear of the cop where there
        // is a choice. He will still run straight at you if you have properly
        // cut him off — getting in front of him is supposed to be how you win.
        dir = navToExit(s, {
          x: cop.position.x + cop.userData.vel.x * 0.35,
          z: cop.position.z + cop.userData.vel.z * 0.35, r: 1.8,
        }, dt);
        target = thiefPace(s, copD, dt);
        s.look = 0;
        if (dist2d(s.position.x, s.position.z, EXIT.x, EXIT.z) < 1.35) { escape(s, api); return; }
        break;
      }
    }

    if (s.angry > 0 && s.state !== 'bolt' && s.state !== 'react') {
      target = 0;
      const dx = cop.position.x - s.position.x, dz = cop.position.z - s.position.z;
      const m = Math.hypot(dx, dz) || 1;
      s.heading = Math.atan2(dx / m, dz / m);
    }

    if (dir) {
      const av = avoid(s, dir.x, dir.z, s.state === 'bolt' ? 1.15 : 1.5, s.state === 'bolt' ? 0.9 : 1.25);
      // Corner cost: you cannot take a 90 at full tilt. Charge it against the
      // ROUTE direction, not the crowd-avoidance one — steer()'s lateral grip
      // already handles jostle, and billing it twice meant every shopper the
      // thief squeezed past cut him to 60% while the cop shoved straight through.
      // Free under ~30 degrees, full bite at 90.
      let cm = 1;
      if (s.speed > 0.6) {
        const fx = s.vel.x / s.speed, fz = s.vel.z / s.speed;
        const cosA = clamp(dir.x * fx + dir.z * fz, -1, 1);
        const bite = clamp((K.thiefCornerFree - cosA) / K.thiefCornerFree, 0, 1);
        cm = 1 - (1 - K.thiefCorner) * bite;
        target *= cm;
      }
      s.dbgCorner = cm;
      s.dbgTarget = target;
      steer(s, av.x, av.z, target, K.thiefAccel, 0.72, T.thiefRun, dt);
    } else {
      s.dbgTarget = 0;
      steer(s, 0, 0, 0, K.thiefAccel, 0.72, T.thiefRun, dt);
    }
    solids.resolve(s.position, BODY_R);
    animateShopper(s, dt, target);
  }

  function escape(s, api) {
    s.escaped = true; s.mesh.visible = false; s.cart.visible = false;
    s.bang.visible = false; s.vel.set(0, 0, 0);
    api.onEscape && api.onEscape(s);
  }

  function animateShopper(s, dt, target) {
    const r = s.rig;
    if (s.speed > 0.15) s.heading = Math.atan2(s.vel.x, s.vel.z);
    s.mesh.rotation.y = s.heading;
    s.phase += (s.speed / (0.88 * r.root.scale.x)) * dt * Math.PI * 2 + dt * 0.6;
    const amp = clamp(s.speed * 0.20, 0.02, 0.66);
    const sw = Math.sin(s.phase);
    r.legL.rotation.x = sw * amp; r.legR.rotation.x = -sw * amp;
    r.neck.rotation.y = lerp(r.neck.rotation.y, s.look, 1 - Math.exp(-8 * dt));
    r.hips.position.y = 0.62 + Math.abs(sw) * 0.022;

    const bolting = s.state === 'bolt' || s.state === 'react';
    if (s.hasCart) {
      // both hands on the bar, cart pushed out front
      r.armL.rotation.x = -0.95; r.armR.rotation.x = -0.95;
      r.armL.rotation.z = 0.16; r.armR.rotation.z = -0.16;
      s.cart.visible = true;
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      s.cart.position.set(s.position.x + fx * 0.62, 0, s.position.z + fz * 0.62);
      s.cart.rotation.y = s.heading;
    } else {
      if (s.cart.visible && s.dropCartAt) {
        s.cart.position.set(s.dropCartAt.x + Math.sin(s.dropCartAt.y) * 0.5, 0,
          s.dropCartAt.z + Math.cos(s.dropCartAt.y) * 0.5);
        s.cart.rotation.y = s.dropCartAt.y + 0.5;                 // slewed, abandoned
        s.dropCartAt = null;
      }
      r.armL.rotation.x = -sw * amp * (bolting ? 1.25 : 0.8);
      r.armR.rotation.x = sw * amp * (bolting ? 1.25 : 0.8);
      r.armL.rotation.z = bolting ? 0.10 : 0.06;
      r.armR.rotation.z = bolting ? -0.10 : -0.06;
    }
    if (s.angry > 0) {
      const w = Math.sin(s.angry * 22);
      r.armR.rotation.x = -1.9 + w * 0.45; r.armR.rotation.z = -0.55;
      r.armL.rotation.x = -0.4; r.hips.rotation.x = 0.12;
      r.neck.rotation.x = -0.12;
      s.bang.position.y = 2.05 + Math.abs(w) * 0.07;
    } else if (s.state === 'browse' || s.state === 'conceal') {
      const reach = s.state === 'conceal' ? 1.55 : 1.05 + Math.sin(s.phase * 0.7) * 0.25;
      r.armR.rotation.x = -reach; r.armR.rotation.z = -0.22;
      r.hips.rotation.x = 0.05;
    } else {
      r.hips.rotation.x = bolting ? 0.26 : lerp(r.hips.rotation.x, 0.04, 1 - Math.exp(-8 * dt));
    }
    r.hips.rotation.z = 0;
  }

  // ---- powerups ------------------------------------------------------------
  function updatePowerups(dt) {
    const u = cop.userData;
    for (const p of powerups) {
      if (!p.live) {
        p.respawn -= dt;
        if (p.respawn <= 0) { p.live = true; p.mesh.visible = true; }
        continue;
      }
      p.item.rotation.y += dt * 2.1;
      p.item.position.y = 1.06 + Math.sin(performance.now() * 0.003 + p.x) * 0.05;
      p.ring.material.opacity = 0.40 + 0.22 * Math.sin(performance.now() * 0.005 + p.z);
      if (dist2d(cop.position.x, cop.position.z, p.x, p.z) < K.pickupRadius + BODY_R) {
        p.live = false; p.mesh.visible = false; p.respawn = 16;
        u.boost = T.boostTime; u.stamina = T.staminaMax; u.gassed = false;
      }
    }
  }

  // ---- catch / telemetry ---------------------------------------------------
  function interactions(api) {
    for (const s of shoppers) {
      if (s.escaped || s.caught || !s.guilty) continue;
      if (!s.bolted && s.state !== 'react') continue;
      const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
      if (d <= T.catchRadius) {
        s.caught = true; s.vel.set(0, 0, 0); s.state = 'caught';
        s.rig.armL.rotation.x = -2.5; s.rig.armR.rotation.x = -2.5;   // hands up
        api.onCatch && api.onCatch(s);
      }
    }
  }

  function telemetry(api) {
    if (!api.report) return;
    const u = cop.userData;
    let nearest = null, nd = Infinity, chase = null;
    for (const s of shoppers) {
      if (s.escaped || !s.mesh.visible) continue;
      const d = dist2d(s.position.x, s.position.z, cop.position.x, cop.position.z);
      if (d < nd) {
        nd = d;
        nearest = { id: s.id, dist: d, guilty: s.guilty, aisle: s.aisle, fleeing: s.state === 'bolt' };
      }
      if (s.state === 'bolt' && !s.caught) {
        chase = { id: s.id, dist: d, thiefToExit: dist2d(s.position.x, s.position.z, EXIT.x, EXIT.z) };
      }
    }
    api.report({
      stamina: u.stamina, staminaMax: T.staminaMax, boost: u.boost,
      gassed: u.gassed, speed: u.speed, nearest, chase,
    });
  }

  // ---- main tick -----------------------------------------------------------
  function tick(dt, input, api) {
    if (!(dt > 0)) dt = 0;
    input = input || {};
    api = api || {};
    if (world.colliders && world.colliders.length !== solidCount) {
      solids = makeSolids(world); solidCount = world.colliders.length;
      nav = buildNav(); exitF = nav.field(EXIT.x, EXIT.z);
      buildPowerups();
    }
    const frozen = !!api.frozen;
    updateCop(dt, input, frozen);
    updatePowerups(dt);
    for (const s of shoppers) updateShopper(s, dt, api, frozen);
    interactions(api);
    telemetry(api);
  }

  // =========================================================================
  // BENCH — the second bar, measured. Runs headless (no render), same update
  // path the game uses. Usage from the console:
  //   const C = window.__CHOP; C.pause();
  //   C.agents.bench({ n: 200, mode: 'none' })
  //   C.agents.bench({ n: 200, mode: 'boost' })
  //   C.agents.bench({ n: 200, mode: 'pickup' })
  //   C.agents.benchAll()
  // Diagnostic options: { crowd:false } empties the store, { trace:k } returns a
  // per-frame trace of trial k, { gapMul } moves the starting separation.
  // =========================================================================
  const routeLen = (fx, fz) => toExit(fx, fz);

  function botInput(thief, mode, st, dt) {
    const u = cop.userData;
    let gx, gz;
    if (mode === 'pickup' && !st.gotBoost) {
      const p = st.puTarget;
      if (p && p.live) { gx = p.x; gz = p.z; }
      else { st.gotBoost = true; }
    }
    if (gx === undefined) { gx = thief.position.x; gz = thief.position.z; }
    if (u.boost > 0) st.gotBoost = true;

    // lead the target when we can see him
    if (gx === thief.position.x && nav.clearSeg(cop.position.x, cop.position.z, gx, gz)) {
      gx += thief.vel.x * 0.28; gz += thief.vel.z * 0.28;
    }
    st.repath -= dt;
    if (st.repath <= 0 || !st.path.length
        || dist2d(st.goal.x, st.goal.z, gx, gz) > 1.2) {
      st.repath = 0.12; st.goal.x = gx; st.goal.z = gz;
      st.path = nav.path(cop.position.x, cop.position.z, gx, gz);
    }
    const holder = { position: cop.position, path: st.path };
    const dir = followPath(holder, 0);
    if (!dir) return { x: 0, z: 0, sprint: true };
    // main.js hands us input.z with the camera-inverted sign; undo it here.
    return { x: dir.x, z: FWD_SIGN * dir.z, sprint: true };
  }

  const _q = (a, p) => {
    if (!a.length) return NaN;
    const b = [...a].sort((x, y) => x - y);
    return b[Math.min(b.length - 1, Math.floor(p * b.length))];
  };
  const _mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const _f2 = (v) => (isFinite(v) ? +v.toFixed(2) : null);

  function bench(opts = {}) {
    const n = opts.n ?? 200;
    const mode = opts.mode ?? 'none';       // 'none' | 'boost' | 'pickup'
    const dt = 1 / 60, maxT = opts.maxT ?? 30;
    const crowd = opts.crowd !== false;
    const gapMul = opts.gapMul ?? 0.96;
    const traceK = opts.trace == null ? -1 : (opts.trace | 0);
    const trace = [];
    const save = { pos: cop.position.clone(), ud: { ...cop.userData } };
    const R = [];                            // per-trial records

    for (let k = 0; k < n; k++) {
      setSeed((opts.seed ?? 1234) + k * 7919);
      reset();
      // one thief, everyone else innocent, so the bench measures one chase
      const thief = shoppers[0];
      shoppers.forEach((s, i) => resetShopper(s, i === 0));
      if (!crowd) {
        shoppers.forEach((s, i) => {
          if (i === 0) return;
          s.escaped = true; s.mesh.visible = false; s.cart.visible = false;
        });
      }
      let ai = 0, txx = 0, tzz = 0;
      for (let a = 0; a < 40; a++) {
        ai = ri(0, AISLE_COUNT - 1);
        txx = aisleX(ai) + rr(-0.7, 0.7);
        tzz = rr(-HALF_LEN + 2, HALF_LEN - 2);
        if (nav.free(txx, tzz) && canReachExit(txx, tzz)) break;
      }
      thief.position.set(txx, 0, tzz);
      thief.stole = true; thief.state = 'drift'; thief.path = []; thief.repathIn = 0;
      thief.hasCart = false; thief.cart.visible = false;
      // point him at the exit, then drop the cop a suspicion-radius behind him
      const w0 = nav.steer(exitF, thief.position.x, thief.position.z, { look: 4 });
      let fx = w0 ? w0.x : EXIT.x - thief.position.x;
      let fz = w0 ? w0.z : EXIT.z - thief.position.z;
      const fm = Math.hypot(fx, fz) || 1; fx /= fm; fz /= fm;
      thief.vel.set(fx * T.thiefWalk, 0, fz * T.thiefWalk);
      const jit = rr(-0.6, 0.6);
      const bx = -(fx * Math.cos(jit) - fz * Math.sin(jit));
      const bz = -(fx * Math.sin(jit) + fz * Math.cos(jit));
      const gap = T.suspicionRadius * gapMul;
      cop.position.set(thief.position.x + bx * gap, 0, thief.position.z + bz * gap);
      solids.resolve(cop.position, BODY_R);
      const cu = cop.userData;
      cu.vel.set(-bx * T.copRun * 0.7, 0, -bz * T.copRun * 0.7);
      cu.stamina = T.staminaMax; cu.gassed = false;
      cu.boost = mode === 'boost' ? T.boostTime : 0;

      if (opts.nopu) for (const p of powerups) { p.live = false; p.respawn = 1e6; p.mesh.visible = false; }
      const st = { gotBoost: mode !== 'pickup', puTarget: null, path: [], repath: 0, goal: { x: 0, z: 0 } };
      if (mode === 'pickup') {
        let best = null, bestC = Infinity;
        for (const p of powerups) {
          if (!p.live) continue;
          const c = dist2d(cop.position.x, cop.position.z, p.x, p.z)
                  + dist2d(p.x, p.z, thief.position.x, thief.position.z) * 0.55;
          if (c < bestC) { bestC = c; best = p; }
        }
        st.puTarget = best;
      }

      let time = 0, done = 0, finalGap = 0;
      let tBolt = NaN, gapAtBolt = NaN, routeAtBolt = NaN;
      let minGap = Infinity, sumTs = 0, sumCs = 0, nS = 0;
      let gassedT = 0, slowT = 0, boostT = 0, sumCm = 0;
      const api = {
        onBolt() {}, onHarass() {},
        onCatch() { done = 1; },
        onEscape() {
          done = 2;
          // How far behind he was when the doors ate him. This is THE number.
          finalGap = dist2d(cop.position.x, cop.position.z, thief.position.x, thief.position.z);
        },
      };
      while (time < maxT && !done) {
        tick(dt, botInput(thief, mode, st, dt), api);
        time += dt;
        const g = dist2d(thief.position.x, thief.position.z, cop.position.x, cop.position.z);
        if (!isFinite(tBolt) && thief.bolted) {
          tBolt = time; gapAtBolt = g;
          routeAtBolt = routeLen(thief.position.x, thief.position.z);
        }
        if (thief.bolted && !done) {
          if (g < minGap) minGap = g;
          sumTs += thief.speed; sumCs += cu.speed; nS++;
          if (cu.gassed) gassedT += dt;
          if (cu.boost > 0) boostT += dt;
          if (thief.dbgTarget < T.thiefRun * 0.92) slowT += dt;
          sumCm += thief.dbgCorner ?? 1;
        }
        if (k === traceK) {
          trace.push([+time.toFixed(3), +g.toFixed(2), +cu.speed.toFixed(2), +thief.speed.toFixed(2),
            thief.state, +cu.stamina.toFixed(2), cu.gassed ? 1 : 0, +cu.boost.toFixed(2),
            +dist2d(thief.position.x, thief.position.z, EXIT.x, EXIT.z).toFixed(2),
            +(thief.dbgTarget ?? 0).toFixed(2), +thief.wind.toFixed(2), thief.path.length,
            +thief.position.x.toFixed(1), +thief.position.z.toFixed(1),
            +cop.position.x.toFixed(1), +cop.position.z.toFixed(1)]);
        }
      }
      R.push({
        done, time, tBolt, gapAtBolt, routeAtBolt, minGap: isFinite(minGap) ? minGap : NaN,
        finalGap, chaseT: time - (isFinite(tBolt) ? tBolt : 0),
        thiefSpd: nS ? sumTs / nS : NaN, copSpd: nS ? sumCs / nS : NaN,
        gassedFrac: nS ? gassedT / (nS * dt) : NaN,
        boostFrac: nS ? boostT / (nS * dt) : NaN,
        slowFrac: nS ? slowT / (nS * dt) : NaN,
        corner: nS ? sumCm / nS : NaN,
        aisle: ai,
      });
    }

    cop.position.copy(save.pos);
    Object.assign(cop.userData, save.ud);
    reset();

    const caught = R.filter((r) => r.done === 1);
    const esc = R.filter((r) => r.done === 2);
    const stall = R.filter((r) => r.done === 0);
    const res = {
      mode, n, crowd,
      catchRate: +(caught.length / n * 100).toFixed(1),
      escaped: esc.length, stalled: stall.length,
      // how badly the escapes were lost (cop-to-thief separation at the doors)
      missByM_median: _f2(_q(esc.map((r) => r.finalGap), 0.5)),
      missByM_p10: _f2(_q(esc.map((r) => r.finalGap), 0.1)),
      missByM_p90: _f2(_q(esc.map((r) => r.finalGap), 0.9)),
      missByFt_median: _f2(_q(esc.map((r) => r.finalGap), 0.5) * 3.281),
      // closest the cop ever got on an escape — the "barely" number
      minGapM_median: _f2(_q(esc.map((r) => r.minGap), 0.5)),
      // where catches happen: chase seconds from bolt to grab
      catchT_median: _f2(_q(caught.map((r) => r.chaseT), 0.5)),
      catchT_p90: _f2(_q(caught.map((r) => r.chaseT), 0.9)),
      catchUnder1s: caught.filter((r) => r.chaseT < 1.0).length,
      catchUnder2s: caught.filter((r) => r.chaseT < 2.0).length,
      escT_median: _f2(_q(esc.map((r) => r.chaseT), 0.5)),
      gapAtBolt_median: _f2(_q(R.map((r) => r.gapAtBolt), 0.5)),
      routeAtBolt_median: _f2(_q(R.map((r) => r.routeAtBolt), 0.5)),
      // speeds actually achieved during the bolt
      thiefSpd_mean: _f2(_mean(R.map((r) => r.thiefSpd).filter(isFinite))),
      copSpd_mean: _f2(_mean(R.map((r) => r.copSpd).filter(isFinite))),
      gassedFrac: _f2(_mean(R.map((r) => r.gassedFrac).filter(isFinite))),
      boostFrac: _f2(_mean(R.map((r) => r.boostFrac).filter(isFinite))),
      thiefSlowFrac: _f2(_mean(R.map((r) => r.slowFrac).filter(isFinite))),
      cornerMul: _f2(_mean(R.map((r) => r.corner).filter(isFinite))),
    };
    if (opts.raw) res.raw = R;
    if (traceK >= 0) res.trace = trace;
    return res;
  }

  function benchAll(n = 200, opts = {}) {
    return [
      bench({ ...opts, n, mode: 'none' }),
      bench({ ...opts, n, mode: 'pickup' }),
      bench({ ...opts, n, mode: 'boost' }),
    ];
  }
  // Compact one-line summary for sweeps.
  function benchLine(n = 200, opts = {}) {
    const a = benchAll(n, opts);
    return a.map((r) => `${r.mode}:${r.catchRate}% miss${r.missByM_median}m near${r.minGapM_median}m`).join('  |  ');
  }

  return {
    cop, shoppers, powerups, reset,
    update: tick,
    bench, benchAll, benchLine,
    // debug handles
    nav, get exitField() { return exitF; }, toExit,
    tuning: T, K,
    get thieves() { return shoppers.filter((s) => s.guilty); },
  };
}
