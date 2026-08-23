// OWNER: builder-cctv. The DVR's motion analytics — the honest version.
//
// ===========================================================================
// WHY THIS IS DELIBERATELY IGNORANT
// ===========================================================================
// The whole game is the ambiguity between a guilty concealment and an innocent
// shopper doing something that looks like one. The instant the box on the screen
// is drawn from `shopper.guilty`, that ambiguity is dead and the monitors become
// a guilt oracle with a CRT filter on it.
//
// So this file NEVER touches agents.js and never sees a shopper. It is handed
// `scene` and nothing else, and it does what a $400 recorder's video-motion
// detector does: it looks for things that MOVED. A tracked blob is a blob. It
// has a position, a speed, a bounding box, a stopwatch, and no opinion.
//
// Everything the wall says about a subject is derived from that and only that:
//   MOTION      it is moving
//   STOPPED m:ss it stopped, and this is how long ago
//   LOITER      it has spent most of the last twenty seconds not moving
//   CART        the blob is short and wide
// A shoplifter concealing a steak and a woman reading the sodium content on a
// jar of sauce produce the SAME token, because they are the same event to a
// motion detector: a person who stopped. Which of them you spend your one big
// monitor on is the game.
//
// The one privileged thing here is the scene graph itself, and it is used the
// way a camera uses light: shelves never move, people do. Powerups spin their
// CHILD group and so are correctly invisible to this; carts move with their
// owner and are correctly visible, which is how "he left his cart" becomes a
// thing you can see rather than a thing you are told.

const MOVE_EPS = 0.018;      // metres between samples that counts as movement
const SAMPLE_HZ = 15;        // detector frame rate; a cheap DVR runs VMD slow
const TRAIL_HZ = 7;          // path samples kept for the on-screen trail
const TRAIL_T = 3.6;         // seconds of path drawn behind a subject
const DROP_T = 26;           // a blob that has not moved this long is furniture
const STOP_SPEED = 0.30;     // m/s under which the detector calls it stationary
const STOP_ARM = 0.85;       // ...for this long before it fires a STOPPED event
const LOITER_WIN = 20;       // window the loiter fraction is measured over
const LOITER_FRAC = 0.55;

// Lights, cameras and the store shell are never subjects. `store` is the one
// named group; the rest is caught by "it has never moved".
const SKIP_TYPES = new Set([
  'AmbientLight', 'HemisphereLight', 'DirectionalLight', 'PointLight',
  'SpotLight', 'RectAreaLight', 'LightProbe', 'Camera', 'PerspectiveCamera',
  'OrthographicCamera', 'AudioListener',
]);

export function createTracker(THREE, scene, opts = {}) {
  const V = new THREE.Vector3();
  const box = new THREE.Box3();
  const tracks = new Map();          // uuid -> track
  const seen = new Map();            // uuid -> last sampled position
  let t = 0, lastSample = 0, nextSample = 0, nextTrail = 0, seq = 0;
  // Optional cross-reference from builder-game: [{code,x,z,flagged}]. Purely
  // cosmetic — it renames a blob from T04 to SUBJ-04 so the picture and the
  // roster row agree about who is who. Nothing about detection depends on it.
  let labels = [];

  function candidate(o) {
    if (!o.visible || SKIP_TYPES.has(o.type)) return false;
    if (o.name === 'store') return false;
    if (o.isLight || o.isCamera) return false;
    return true;
  }

  // Measured once, on first detection, and kept. A rig's box breathes as its
  // arms swing; re-measuring every frame costs a full subtree walk per subject
  // per frame and buys a box that jitters. One measurement, held.
  //
  // THIS IS NOT Box3.setFromObject, AND THE DIFFERENCE COST ME AN HOUR.
  // setFromObject walks INVISIBLE children too. Every shopper rig carries a
  // hidden anger sprite parked at y=2.05 with a 0.42 scale, so every person in
  // the store measured 2.38 m tall instead of 1.75, and that one number was
  // wrong in three places at once:
  //   * the analytics box stood 35% too tall, so it floated off the head;
  //   * the PTZ framed a 2.38 m man, so every push-in under-zoomed;
  //   * worst, the occlusion test asked "can the camera see his head at 0.93 h"
  //     = 2.21 m, which clears a 2.05 m gondola — so subjects standing behind
  //     shelving were ruled VISIBLE and got bright boxes drawn over empty shelf
  //     tops. See shots/cctv_r4_desk_occlusion.png. A box with nothing in it is
  //     worse than no box: it teaches the player the boxes are decoration.
  // So: walk it by hand, prune at anything invisible, and ignore sprites — a
  // billboard is not a body and a detector would never see one anyway.
  const _b = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, any: false };
  function walk(o) {
    if (!o.visible) return;
    if (!o.isSprite && !o.isPoints && !o.isLine && o.geometry) {
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const bb = g.boundingBox;
      if (bb) {
        box.copy(bb).applyMatrix4(o.matrixWorld);
        if (!_b.any) {
          _b.any = true;
          _b.minX = box.min.x; _b.maxX = box.max.x;
          _b.minY = box.min.y; _b.maxY = box.max.y;
          _b.minZ = box.min.z; _b.maxZ = box.max.z;
        } else {
          _b.minX = Math.min(_b.minX, box.min.x); _b.maxX = Math.max(_b.maxX, box.max.x);
          _b.minY = Math.min(_b.minY, box.min.y); _b.maxY = Math.max(_b.maxY, box.max.y);
          _b.minZ = Math.min(_b.minZ, box.min.z); _b.maxZ = Math.max(_b.maxZ, box.max.z);
        }
      }
    }
    for (let i = 0; i < o.children.length; i++) walk(o.children[i]);
  }
  function measure(o) {
    try {
      o.updateWorldMatrix(true, true);
      _b.any = false;
      walk(o);
      if (!_b.any || !isFinite(_b.maxY)) return { h: 1.75, r: 0.36 };
      const h = Math.max(0.2, _b.maxY - Math.min(0, _b.minY));
      const r = Math.max(0.12, Math.max(_b.maxX - _b.minX, _b.maxZ - _b.minZ) * 0.5);
      return { h: Math.min(2.4, h), r: Math.min(1.2, r) };
    } catch (e) {
      return { h: 1.75, r: 0.36 };
    }
  }

  function update(dt) {
    t += Math.min(0.1, dt || 0);
    if (t < nextSample) return;
    const step = Math.min(0.5, Math.max(1 / 120, t - lastSample));
    lastSample = t;
    nextSample = t + 1 / SAMPLE_HZ;

    for (const o of scene.children) {
      if (!candidate(o)) { seen.delete(o.uuid); continue; }
      const p = o.position;
      const was = seen.get(o.uuid);
      if (!was) { seen.set(o.uuid, { x: p.x, y: p.y, z: p.z }); continue; }
      const d = Math.hypot(p.x - was.x, p.z - was.z);
      was.x = p.x; was.y = p.y; was.z = p.z;

      let tr = tracks.get(o.uuid);
      if (!tr) {
        if (d < MOVE_EPS) continue;               // still furniture as far as we know
        const m = measure(o);
        tr = {
          key: o.uuid, obj: o, n: ++seq,
          code: 'T' + String(seq % 100).padStart(2, '0'),
          kind: m.h > 1.35 ? 'person' : 'cart',
          h: m.h, r: m.r,
          x: p.x, y: p.y, z: p.z, speed: 0,
          moving: true, stillT: 0, moveT: 0, stoppedAt: -1, born: t, lastMove: t,
          stillHist: [], trail: [], flag: 0,
        };
        tracks.set(o.uuid, tr);
      }

      tr.x = p.x; tr.y = p.y; tr.z = p.z;
      // Speed is smoothed: a detector reading raw frame-to-frame deltas at 15 Hz
      // calls a browsing shopper "moving" every time an arm swings the root a
      // centimetre, and then nothing ever reads as stopped.
      const inst = d / step;
      tr.speed += (inst - tr.speed) * 0.42;
      if (d >= MOVE_EPS) tr.lastMove = t;

      const stopped = tr.speed < STOP_SPEED;
      if (stopped) {
        tr.stillT += step; tr.moveT = 0;
        if (tr.moving && tr.stillT > STOP_ARM) {
          // Fresh STOPPED event. It DECAYS rather than being cleared by the
          // renderer: the detector runs at 15 Hz and a mosaic thumbnail only
          // repaints five to nine times a second, so a one-frame flag was being
          // missed by almost every panel it was meant to light up.
          tr.moving = false; tr.stoppedAt = t; tr.flag = 1;
        }
      } else {
        tr.moveT += step; tr.stillT = 0;
        if (!tr.moving && tr.moveT > 0.30) { tr.moving = true; tr.stoppedAt = -1; }
      }

      if (tr.flag > 0) tr.flag = Math.max(0, tr.flag - step * 0.8);

      // rolling window of stationary-ness, for LOITER
      tr.stillHist.push([t, stopped ? 1 : 0]);
      while (tr.stillHist.length && t - tr.stillHist[0][0] > LOITER_WIN) tr.stillHist.shift();
    }

    // trail samples, at their own slower rate
    if (t >= nextTrail) {
      nextTrail = t + 1 / TRAIL_HZ;
      for (const tr of tracks.values()) {
        tr.trail.push({ x: tr.x, z: tr.z, t });
        while (tr.trail.length && t - tr.trail[0].t > TRAIL_T) tr.trail.shift();
      }
    }

    for (const [k, tr] of tracks) {
      if (!tr.obj.parent || !tr.obj.visible || t - tr.lastMove > DROP_T) tracks.delete(k);
    }
  }

  function loiterFrac(tr) {
    if (tr.stillHist.length < 6) return 0;
    let s = 0;
    for (const e of tr.stillHist) s += e[1];
    return s / tr.stillHist.length;
  }

  // What the recorder is willing to print next to the box. Kinematics only.
  function tokensFor(tr) {
    if (tr.kind === 'cart') return tr.moving ? 'CART' : 'CART IDLE';
    if (tr.moving) return 'MOTION';
    const held = tr.stoppedAt >= 0 ? t - tr.stoppedAt : tr.stillT;
    const mm = Math.floor(held / 60), ss = Math.floor(held % 60);
    const clock = `${mm}:${String(ss).padStart(2, '0')}`;
    return (loiterFrac(tr) > LOITER_FRAC ? 'LOITER ' : 'STOPPED ') + clock;
  }

  // Priority for the spot monitor's auto-track. Guilt-blind by construction:
  // every term is something a motion detector can measure. A subject who just
  // stopped outranks one who never started, and a big near blob outranks a
  // distant one because you can actually resolve it.
  function score(tr, camPos) {
    const d = Math.hypot(tr.x - camPos.x, tr.z - camPos.z);
    let s = 0;
    if (tr.kind === 'cart') s -= 30;
    if (!tr.moving) {
      const held = tr.stoppedAt >= 0 ? t - tr.stoppedAt : tr.stillT;
      s += 46 - Math.min(30, Math.abs(held - 2.4) * 6);   // peaks just after the stop
      s += loiterFrac(tr) * 12;
    } else {
      s += 8 + Math.min(10, tr.speed * 4);
    }
    s += Math.max(0, 26 - d);                              // resolvable beats distant
    return s;
  }

  // ---- line of sight -------------------------------------------------------
  // A detector works on PIXELS, so it cannot see a man standing behind a
  // gondola — and the first build of this file could, which put bright green
  // boxes around empty shelf tops on every aisle camera (shots/
  // cctv_r4_desk_occlusion.png). That is not a cosmetic problem: a box with
  // nothing in it teaches the player to stop believing the boxes, and then the
  // whole instrument is dead.
  //
  // The occluders are the store's own collider set — the same boxes agents.js
  // navigates around, so the shelf runs, their real lengths, and the cross-aisle
  // the store builder cut through the middle of them all come for free and stay
  // correct if the store is rebuilt.
  //
  // Slab test, camera to CHEST, and only the chest. The first version also
  // allowed a clear line to the head and called that a sighting, on the theory
  // that seeing someone's head over a gondola one aisle over is a real thing. It
  // is, and it is still wrong here, for two reasons that a screenshot settles
  // faster than an argument (shots/cctv_r4_desk_occlusion.png): the aisle domes
  // sit at 4.4 m and graze the 2.05 m shelf tops, so "the head clears it" came
  // out true by FOURTEEN CENTIMETRES for a man who is completely hidden behind a
  // wall of product; and the tell this whole screen exists to show — a hand
  // going from a shelf to a coat — happens at chest height. A subject whose
  // chest you cannot see is not evidence, so he does not get a box.
  //
  // LIFT is the product, the price rails and the shelf-talkers standing above
  // the collider box. The collider stops at the steel; the picture does not.
  const LIFT = 0.25;
  let occ = [];
  function setOccluders(boxes) {
    occ = (boxes || []).filter((b) => b && b.min && b.max
      && b.max.y > 0.5 && b.min.y < 2.6 && b.max.y < 6)
      .map((b) => ({
        min: { x: b.min.x, y: b.min.y, z: b.min.z },
        max: { x: b.max.x, y: b.max.y + LIFT, z: b.max.z },
      }));
  }
  const losCache = new Map();
  let losTick = -1;

  function segClear(ox, oy, oz, tx, ty, tz) {
    const dx = tx - ox, dy = ty - oy, dz = tz - oz;
    for (let i = 0; i < occ.length; i++) {
      const b = occ[i], mn = b.min, mx = b.max;
      let t0 = 0, t1 = 1;
      // x slab
      if (Math.abs(dx) < 1e-9) { if (ox < mn.x || ox > mx.x) continue; }
      else {
        let a = (mn.x - ox) / dx, bb = (mx.x - ox) / dx;
        if (a > bb) { const s = a; a = bb; bb = s; }
        if (a > t0) t0 = a; if (bb < t1) t1 = bb;
        if (t0 > t1) continue;
      }
      if (Math.abs(dy) < 1e-9) { if (oy < mn.y || oy > mx.y) continue; }
      else {
        let a = (mn.y - oy) / dy, bb = (mx.y - oy) / dy;
        if (a > bb) { const s = a; a = bb; bb = s; }
        if (a > t0) t0 = a; if (bb < t1) t1 = bb;
        if (t0 > t1) continue;
      }
      if (Math.abs(dz) < 1e-9) { if (oz < mn.z || oz > mx.z) continue; }
      else {
        let a = (mn.z - oz) / dz, bb = (mx.z - oz) / dz;
        if (a > bb) { const s = a; a = bb; bb = s; }
        if (a > t0) t0 = a; if (bb < t1) t1 = bb;
        if (t0 > t1) continue;
      }
      // hit inside the segment, with a little slack at the subject end so a man
      // pressed against a shelf face is not occluded by the shelf he is at
      if (t1 > 0.02 && t0 < 0.94) return false;
    }
    return true;
  }

  function sees(ci, camPos, tr) {
    if (!occ.length) return true;
    if (losTick !== nextSample) { losCache.clear(); losTick = nextSample; }
    const key = ci + '|' + tr.key;
    const hit = losCache.get(key);
    if (hit !== undefined) return hit;
    const ok = segClear(camPos[0], camPos[1], camPos[2], tr.x, tr.h * 0.55, tr.z);
    losCache.set(key, ok);
    return ok;
  }

  function setLabels(list) { labels = Array.isArray(list) ? list : []; }
  function labelFor(tr) {
    if (!labels.length) return null;
    let best = null, bd = 2.2 * 2.2;
    for (const L of labels) {
      if (L == null || L.x == null) continue;
      const d = (L.x - tr.x) * (L.x - tr.x) + (L.z - tr.z) * (L.z - tr.z);
      if (d < bd) { bd = d; best = L; }
    }
    return best;
  }

  return {
    update, tokensFor, score, setLabels, labelFor, loiterFrac,
    setOccluders, sees,
    // Uncached line of sight to an arbitrary point. Used by cctv.channelsFor,
    // which is how builder-game can ask "which monitor is this man ACTUALLY on"
    // instead of deciding it from a zone table.
    clear: (camPos, x, y, z) => (!occ.length
      || segClear(camPos[0], camPos[1], camPos[2], x, y, z)),
    get occluders() { return occ.length; },
    get now() { return t; },
    get tracks() { return [...tracks.values()]; },
    clearFlags() { for (const tr of tracks.values()) tr.flag = 0; },
  };
}

// ---------------------------------------------------------------------------
// Projection, and the reason it is not just camera.project()
// ---------------------------------------------------------------------------
// The grade pass BENDS the picture: every wall feed is sampled through the same
// barrel term a wide dome lens has, `lc = c*(1+k r^2)/(1+k rmax)`. camera.project
// gives the point's position in the RAW render, which is the picture BEFORE that
// bend, so a box drawn there sits up to a dozen pixels off its subject at the
// edges of a wide feed — worst exactly where a thief walking out of frame is.
//
// The shader maps screen -> source. Placing an overlay needs the inverse, source
// -> screen, and the forward map is a scalar function of radius along a fixed
// ray, so four Newton steps invert it to well under a pixel.
export function unbarrel(ux, uy, aspect, k) {
  if (!(k > 1e-4)) return [ux, uy];
  const lx = (ux - 0.5) * aspect, ly = uy - 0.5;
  const L = Math.hypot(lx, ly);
  if (L < 1e-6) return [ux, uy];
  const rmax = 0.25 * aspect * aspect + 0.25;
  const denom = 1 + k * rmax;
  let s = L;
  for (let i = 0; i < 4; i++) {
    const f = s * (1 + k * s * s) / denom - L;
    const df = (1 + 3 * k * s * s) / denom;
    s -= f / df;
    if (s < 0) s = L * 0.5;
  }
  const g = s / L;
  return [(lx * g) / aspect + 0.5, ly * g + 0.5];
}

/**
 * World point -> panel-local uv (origin top-left, y DOWN, 0..1 across the glass),
 * with the feed's barrel applied so the result lands on the subject.
 * `v` is a THREE.Vector3 and IS CONSUMED — pass a scratch vector.
 * Returns null when the point is behind the camera.
 */
export function project(cam, v, aspect, k, out) {
  const t = v.project(cam);
  if (t.z > 1 || !isFinite(t.x)) return null;
  const [ux, uy] = unbarrel(t.x * 0.5 + 0.5, t.y * 0.5 + 0.5, aspect, k);
  const p = out || {};
  p.x = ux; p.y = 1 - uy; p.z = t.z;
  return p;
}
