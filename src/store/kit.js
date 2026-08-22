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

// --- instanced batch -------------------------------------------------------
// Collect transforms first, allocate the InstancedMesh once at build().
export class Batch {
  constructor(THREE, geo, mat) {
    this.THREE = THREE; this.geo = geo; this.mat = mat;
    this.t = []; this.c = []; this.n = 0;
  }
  // p / e(uler) / s(cale) are 3-arrays; col is a THREE.Color (working space).
  push(px, py, pz, ex, ey, ez, sx, sy, sz, col) {
    this.t.push(px, py, pz, ex, ey, ez, sx, sy, sz);
    this.c.push(col.r, col.g, col.b);
    this.n++;
  }
  box(px, py, pz, sx, sy, sz, col) { this.push(px, py, pz, 0, 0, 0, sx, sy, sz, col); }
  build(name) {
    if (!this.n) return null;
    const T = this.THREE;
    const mesh = new T.InstancedMesh(this.geo, this.mat, this.n);
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
  constructor() { this.p = []; this.n = []; this.uv = []; this.idx = []; this.v = 0; }
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
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
