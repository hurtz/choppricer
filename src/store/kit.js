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
//   sink(x, z, w, l, y0, y1, r, g, b)   footprint + vertical span + LINEAR rgb
let FIELD_SINK = null;
export function setFieldSink(fn) { FIELD_SINK = fn; }

// --- instanced batch -------------------------------------------------------
// Collect transforms first, allocate the InstancedMesh once at build().
export class Batch {
  // `grid` (optional) = { cols, rows } of a package atlas. When present the
  // batch also carries a per-instance `aCell` attribute holding that instance's
  // atlas-cell UV origin, so one geometry + one draw call serves every design
  // in the atlas instead of one geometry clone per design.
  constructor(THREE, geo, mat, grid = null) {
    this.THREE = THREE; this.geo = geo; this.mat = mat; this.grid = grid;
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
      FIELD_SINK(px, pz, cy * wx + sy2 * sz, sy2 * wx + cy * sz,
        py - hy / 2, py + hy / 2, col.r, col.g, col.b);
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
