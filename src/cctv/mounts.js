// OWNER: builder-cctv. THE PLASTIC — what each camera is actually screwed into.
// CONTRACT:
//   buildMounts(THREE, scene, cams) -> { group, sync(cams), dispose() }
//     `cams` is cctv.js's merged lineup: {pos, look, mount} per channel.
//
// ===========================================================================
// WHY THIS FILE EXISTS
// ===========================================================================
// The client's note about the wall was not really about camera height. It was:
// "the old wall had corner-mounted domes, high awkward vantages, fisheye, feeds
// that framed different kinds of space." Three of those are pose and lens and
// live in cctv.js's cameraRig(). The fourth is this: A REAL DVR SHOWS YOU THE
// OTHER CAMERAS. Look at any store's monitor wall and half the frames have a
// dome or a bullet hanging in a corner of somebody else's shot. It costs almost
// nothing and it is the difference between "eight renders of a shop" and "eight
// cameras in a shop".
//
// MEASURED, because "you can see the other cameras" is the kind of claim that is
// easy to write and easy to be wrong about. Frustum plus the detector's own line
// of sight, every housing against every channel:
//     CH01 [2,4,7]  CH02 [1,3,5,6,9]  CH03 [2,4,7]  CH04 [1,3,5,6,8,9]
//     CH05 [2,4,7]  CH06 [2,4,7]      CH07 [5,6,8]  CH08 [2,4,7]  CH09 []
// Three to six each, and the pattern is not an accident: the gondolas that keep
// channel N pure also hide aisle N+1's dome, so what a camera can see is the
// housings at the FAR end of its own shot, across the open cross-aisle. Which is
// exactly where you notice one in real footage. The door camera faces into the
// corner and sees none, and that is correct too.
//
// store.js already hangs a dome at every CAMERAS[i].pos, but config's pos is the
// FALLBACK now, so that plastic sits in the old flat row at the aisle mouths.
// Leaving it there is fine and even correct — a discount grocery has three times
// as many domes as it has monitors, and half of them are dummies — but the
// cameras that are actually recording need to be somewhere you can see, so they
// get their own housings here, at the rig pose.
//
// THE ONE TRICK: A CAMERA MUST NOT FILM ITS OWN HOUSING.
// No layers, no per-camera render masks — just geometry. Every aisle lens is
// pitched 7 to 15 degrees DOWN, so with a thumbnail's 35-degree half-vertical
// the top of frame is around +25 degrees above horizontal. Park the housing at
// +0.26 m directly over the optical centre and its lowest forward silhouette
// sits at 54 degrees of elevation — thirty degrees clear of the top of frame,
// on the widest lens on the wall, and further clear on every other one and on
// every zoom step of the PTZ. The drop pipe above it is at 90 degrees and can
// never be in shot at all.
// The honest cost: the lens is modelled 0.11 m below the bottom of its own
// bubble rather than inside it. At the four metres minimum anything ever views
// one of these from, that is a third of a pixel.
//
// SIX DRAW CALLS, NOT FIFTY-FOUR. This store is draw-call bound (round 4's
// bench: a scene render costs ~2.0-2.7 ms at EVERY resolution from 190x143 to
// 1664x936), and it is rendered up to three times a frame. Nine housings of six
// parts each as separate meshes would be 54 calls on top of the store, on every
// one of those passes. One InstancedMesh per PART, nine instances each, is six —
// and unused parts (a dome has no barrel) collapse to a zero-scale matrix, which
// costs a vertex shader that outputs a degenerate triangle and no fill.

import { CEIL_H } from '../config.js';

// Cream housings with smoked bubbles, which is what the cheap 2011 domes in the
// reference photographs are, and NOT the black plastic a game reaches for. The
// store's palette is warm — see the brief's point 6 — and a black dome on a
// cream ceiling reads as a prop bolted on afterwards.
const COL = {
  shell: 0xd8d2c2,      // housing plastic, sun-faded cream
  smoke: 0x1c1f25,      // the bubble. Nearly black, slightly blue.
  pipe: 0xb3ac9c,       // conduit and drop pipe
  ring: 0x9aa0a6,       // the trim ring where the bubble meets the base
};

export function buildMounts(THREE, scene, cams) {
  const n = Math.max(1, cams.length);
  const group = new THREE.Group();
  group.name = 'store.cctv.mounts';

  // --- part geometries, each baked into the orientation the instance wants ---
  // A cylinder is Y-up by default. The bullet body is baked onto -Z so that a
  // plain Object3D.lookAt() — which points -Z at the target — aims the camera
  // body down the same line the lens is looking. Doing it in the geometry means
  // the per-instance work is one lookAt and no quaternion algebra.
  const gBubble = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  gBubble.rotateX(Math.PI);                       // flat side up: it hangs
  const gRing = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false);
  const gPipe = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
  const gBody = new THREE.CylinderGeometry(1, 1, 1, 10, 1, false);
  gBody.rotateX(-Math.PI / 2);                    // axis onto -Z
  const gShade = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
  gShade.rotateX(-Math.PI / 2);
  const gPlate = new THREE.BoxGeometry(1, 1, 1);

  const mat = (color) => new THREE.MeshLambertMaterial({ color });
  const mShell = mat(COL.shell), mSmoke = mat(COL.smoke);
  const mPipe = mat(COL.pipe), mRing = mat(COL.ring);

  const parts = {};
  const add = (key, geo, material) => {
    const m = new THREE.InstancedMesh(geo, material, n);
    m.frustumCulled = false;              // nine tiny objects; culling them costs more
    m.castShadow = false; m.receiveShadow = false;
    m.name = 'cctv.' + key;
    group.add(m);
    parts[key] = m;
    return m;
  };
  add('bubble', gBubble, mSmoke);
  add('ring', gRing, mRing);
  add('body', gBody, mShell);
  add('shade', gShade, mRing);
  add('pipe', gPipe, mPipe);
  add('plate', gPlate, mShell);

  const dummy = new THREE.Object3D();
  const HIDE = new THREE.Matrix4().makeScale(0, 0, 0);
  const look = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  function put(key, i, px, py, pz, sx, sy, sz, target) {
    dummy.position.set(px, py, pz);
    dummy.scale.set(sx, sy, sz);
    if (target) dummy.lookAt(target); else dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    parts[key].setMatrixAt(i, dummy.matrix);
  }

  function sync(list) {
    const L = list || cams;
    for (const k of Object.keys(parts)) {
      for (let i = 0; i < n; i++) parts[k].setMatrixAt(i, HIDE);
    }
    for (let i = 0; i < L.length && i < n; i++) {
      const c = L[i];
      const [x, y, z] = c.pos;
      look.set(...c.look);
      const kind = c.mount || 'dome';
      // Cream canopy at the ceiling, and a pipe down to the housing. Same on
      // every mount type; what differs is where the pipe lands.
      let pipeX = x, pipeZ = z, pipeTop = y + 0.45;
      if (kind === 'dome' || kind === 'pendant') {
        put('bubble', i, x, y + 0.26, z, 0.19, 0.155, 0.19);
        put('ring', i, x, y + 0.40, z, 0.205, 0.075, 0.205);
      } else {
        // Bullet: body sits BEHIND and above the optical centre, pointed the way
        // the lens is. A `corner` is the same camera on a longer bracket — the
        // two on this wall are bolted to the ends of the outermost gondola runs
        // where there is a wall behind them, which is why they can be higher
        // than anything else in the store.
        const backOff = kind === 'corner' ? 0.20 : 0.145;
        fwd.set(look.x - x, look.y - y, look.z - z).normalize();
        const bx = x - fwd.x * backOff, by = y + 0.115 - fwd.y * backOff;
        const bz = z - fwd.z * backOff;
        put('body', i, bx, by, bz, 0.072, 0.072, 0.30, look);
        put('shade', i, bx - fwd.x * 0.02, by + 0.055, bz - fwd.z * 0.02,
          0.088, 0.088, 0.24, look);
        const armBack = kind === 'corner' ? 0.42 : 0.29;
        pipeX = x - fwd.x * armBack; pipeZ = z - fwd.z * armBack;
        pipeTop = y + 0.14;
      }
      const top = CEIL_H - 0.06;
      const len = Math.max(0.12, top - pipeTop);
      put('pipe', i, pipeX, pipeTop + len / 2, pipeZ, 0.028, len, 0.028);
      put('plate', i, pipeX, top + 0.03, pipeZ, 0.30, 0.06, 0.30);
    }
    for (const k of Object.keys(parts)) parts[k].instanceMatrix.needsUpdate = true;
  }

  sync(cams);
  scene.add(group);

  return {
    group,
    sync,
    dispose() {
      scene.remove(group);
      for (const k of Object.keys(parts)) parts[k].dispose();
      [gBubble, gRing, gPipe, gBody, gShade, gPlate].forEach((g) => g.dispose());
      [mShell, mSmoke, mPipe, mRing].forEach((m) => m.dispose());
    },
  };
}
