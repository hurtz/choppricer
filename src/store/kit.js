// OWNER: builder-store. Small building helpers used by ../store.js.
// Deterministic RNG, instanced-mesh batching, and a hand-rolled quad soup so a
// few hundred decal-ish surfaces (price rails, aisle signs, light strips, floor
// reflections) collapse into single draw calls.

// --- deterministic rng -----------------------------------------------------
export function makeRng(seed) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
export const rr = (rng, a, b) => a + (b - a) * rng();
export const ri = (rng, a, b) => Math.floor(a + (b - a + 1) * rng());
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];

// --- the occupancy sink ----------------------------------------------------
// ROUND 8. Every solid in this building — every product, every deck, every
// kick plate, every bollard, every cart — reaches the GPU through Batch.push.
// That makes push the one place a world occupancy field can be filled without
// anybody having to remember to fill it. See ../store/light.js for what reads
// it and why authoring occlusion at remembered junctions could never work.
//
// The sink is a plain function so kit.js keeps no dependency on light.js:
//   sink(x, z, w, l, y0, y1, r, g, b, round)
//     footprint + vertical span + LINEAR rgb + "this footprint is an ellipse"
//
// ROUND 9 — `round`. Blind test 8's first call was a hard-edged black
// rectangle under a cylindrical barrel. The authored quad that caused it is
// gone, but a cylinder stamped into the occupancy field as its BOUNDING SQUARE
// casts a square computed shadow, which is the same tell arrived at by
// arithmetic instead of by hand. It is a property of the PRIMITIVE — a batch
// built on a CylinderGeometry or a SphereGeometry is round, always, whoever
// pushes into it — so it is set once on the batch and never at a call site.
let FIELD_SINK = null;
export function setFieldSink(fn) { FIELD_SINK = fn; }

// ROUND 10 — THE SECOND SINK, AND WHY THERE HAS TO BE ONE.
//
// Batch.push is the funnel every SOLID goes through, which is why the round-8
// field fills itself. It is not the funnel every SURFACE goes through: the
// price rails, the aisle blades, the promo boards, the hanging danglers and the
// wall signs are all quad soups, and a quad soup has never touched the field at
// all. That was invisible for two rounds because those things are decals on
// solids that are themselves stamped — until blind test 9 asked why the freezer
// glass reflects no image, and the answer turned out to be that the one class
// of object in the store with enough contrast to be legible in a reflection is
// the class that goes through Quads rather than Batch.
//
// So Quads gets a sink too, and it is deliberately COLOUR ONLY. A sign is not
// an occluder: it has no thickness worth modelling, it is usually hanging in
// mid-air, and stamping one into the height channel would drop a pillar of
// shadow onto the aisle floor underneath it. What a mirror needs from it is
// what colour is standing there, at what height — which is exactly the two
// colour bands and nothing else.
//   paint(x, z, w, l, y0, y1, r, g, b)
let FIELD_PAINT = null;
export function setFieldPaint(fn) { FIELD_PAINT = fn; }

// --- instanced batch -------------------------------------------------------
// Collect transforms first, allocate the InstancedMesh once at build().
export class Batch {
  // `grid` (optional) = { cols, rows } of a package atlas. When present the
  // batch also carries a per-instance `aCell` attribute holding that instance's
  // atlas-cell UV origin, so one geometry + one draw call serves every design
  // in the atlas instead of one geometry clone per design.
  // `round` = this batch's primitive has a circular cross-section, so its
  // footprint in the occupancy field is an ellipse rather than its AABB.
  constructor(THREE, geo, mat, grid = null, round = false) {
    this.THREE = THREE; this.geo = geo; this.mat = mat; this.grid = grid;
    this.round = round;
    this.t = []; this.c = []; this.cells = []; this.n = 0;
  }
  // p / e(uler) / s(cale) are 3-arrays; col is a THREE.Color (working space).
  push(px, py, pz, ex, ey, ez, sx, sy, sz, col, cell = 0) {
    this.t.push(px, py, pz, ex, ey, ez, sx, sy, sz);
    this.c.push(col.r, col.g, col.b);
    if (this.grid) this.cells.push(cell);
    this.n++;
    if (FIELD_SINK && !this.noField) {
      // Conservative world AABB of a yaw+roll'd box. Yaw spreads sx/sz into
      // each other; roll about Z tips sy into x and sx into y. Anything the
      // approximation over-covers is inside the softness of the term that
      // reads it — a 47 mm field texel under a 2.6 m occlusion cone.
      const cy = Math.abs(Math.cos(ey)), sy2 = Math.abs(Math.sin(ey));
      const cr = Math.abs(Math.cos(ez)), sr = Math.abs(Math.sin(ez));
      const hy = cr * sy + sr * sx;                 // effective vertical extent
      const wx = cr * sx + sr * sy;                 // roll widens the footprint
      // A rolled cylinder is no longer round in plan, so the ellipse only
      // holds while it is standing up.
      FIELD_SINK(px, pz, cy * wx + sy2 * sz, sy2 * wx + cy * sz,
        py - hy / 2, py + hy / 2, col.r, col.g, col.b,
        this.round && cr > 0.985);
    }
  }
  box(px, py, pz, sx, sy, sz, col) { this.push(px, py, pz, 0, 0, 0, sx, sy, sz, col); }
  build(name) {
    if (!this.n) return null;
    const T = this.THREE;
    let geo = this.geo;
    if (this.grid) {
      // instanced attributes live on the geometry, so a batch that carries them
      // needs its own clone — these are 24-120 vert primitives, so it is cheap
      geo = this.geo.clone();
      const { cols, rows } = this.grid;
      const arr = new Float32Array(this.n * 2);
      for (let i = 0; i < this.n; i++) {
        const c = this.cells[i] | 0;
        arr[i * 2] = (c % cols) / cols;
        arr[i * 2 + 1] = 1 - (Math.floor(c / cols) % rows + 1) / rows;
      }
      geo.setAttribute('aCell', new T.InstancedBufferAttribute(arr, 2));
    }
    const mesh = new T.InstancedMesh(geo, this.mat, this.n);
    const m = new T.Matrix4(), q = new T.Quaternion(), eu = new T.Euler();
    const v = new T.Vector3(), sc = new T.Vector3(), col = new T.Color();
    for (let i = 0; i < this.n; i++) {
      const o = i * 9;
      v.set(this.t[o], this.t[o + 1], this.t[o + 2]);
      eu.set(this.t[o + 3], this.t[o + 4], this.t[o + 5]);
      q.setFromEuler(eu);
      sc.set(this.t[o + 6], this.t[o + 7], this.t[o + 8]);
      mesh.setMatrixAt(i, m.compose(v, q, sc));
      col.r = this.c[i * 3]; col.g = this.c[i * 3 + 1]; col.b = this.c[i * 3 + 2];
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.computeBoundingSphere();
    mesh.name = name || 'batch';
    return mesh;
  }
}

// --- quad soup -------------------------------------------------------------
export class Quads {
  // `colored` adds a per-vertex colour attribute. Used by the floor-reflection
  // smear, where every streak under a gondola carries the colour of whatever is
  // on the shelf above it — one draw call, hundreds of different tints.
  constructor(colored = false) {
    this.p = []; this.n = []; this.uv = []; this.idx = []; this.v = 0;
    this.colored = colored; this.c = colored ? [] : null;
    this.tint = { r: 1, g: 1, b: 1 };
    // Set to a THREE.Color (working space) to paint every quad pushed into
    // this soup into the field's colour bands. See setFieldPaint.
    this.field = null;
  }
  // a,b,c,d world-space corners, CCW seen from the visible side.
  // uv corners map a->(u0,v0) b->(u1,v0) c->(u1,v1) d->(u0,v1)
  quad(a, b, c, d, u0, v0, u1, v1) {
    const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
    const fx = d[0] - a[0], fy = d[1] - a[1], fz = d[2] - a[2];
    let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2], d[0], d[1], d[2]);
    for (let i = 0; i < 4; i++) this.n.push(nx, ny, nz);
    this.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    if (this.colored) {
      const t = this.tint;
      for (let i = 0; i < 4; i++) this.c.push(t.r, t.g, t.b);
    }
    const o = this.v;
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    this.v += 4;
    if (FIELD_PAINT && this.field) {
      const xs = [a[0], b[0], c[0], d[0]], ys = [a[1], b[1], c[1], d[1]];
      const zs = [a[2], b[2], c[2], d[2]];
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      const z0 = Math.min(...zs), z1 = Math.max(...zs);
      const f = this.field;
      // A pane-thin quad has no footprint to speak of, so it is given the
      // 60 mm a signboard actually is; without it a sign seen edge-on lands
      // between texels and paints nothing.
      FIELD_PAINT((x0 + x1) / 2, (z0 + z1) / 2,
        Math.max(0.06, x1 - x0), Math.max(0.06, z1 - z0),
        Math.min(...ys), Math.max(...ys), f.r, f.g, f.b);
    }
  }
  // axis-aligned-ish rect from a centre + half-extent vectors R and U.
  rect(c, R, U, u0, v0, u1, v1) {
    const A = [c[0] - R[0] - U[0], c[1] - R[1] - U[1], c[2] - R[2] - U[2]];
    const B = [c[0] + R[0] - U[0], c[1] + R[1] - U[1], c[2] + R[2] - U[2]];
    const C = [c[0] + R[0] + U[0], c[1] + R[1] + U[1], c[2] + R[2] + U[2]];
    const D = [c[0] - R[0] + U[0], c[1] - R[1] + U[1], c[2] - R[2] + U[2]];
    this.quad(A, B, C, D, u0, v0, u1, v1);
  }
  build(THREE) {
    if (!this.v) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.colored) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
