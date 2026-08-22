// OWNER: builder-agents. Grid navigation for the chase.
//
// Why this exists. agents.js used to route off a "ladder" graph derived from
// config.js: eight aisle lanes joined by a front and a back cross-aisle. That
// graph describes the FLOOR PLAN, not the STORE. The store builder fills the
// walkable lanes with produce tables, dump bins, checkout lanes and a cart
// corral, and the ladder cheerfully routed thieves straight through them. They
// ground along the geometry at a fraction of running speed while the cop — who
// only ever steers at the thief and so never gets stuck on anything — strolled
// up and collected them. The bench caught it cleanly: 74% catch with no
// powerup, and escapes ONLY ever from aisles 0 and 1, the two the store had
// left clean. No movement constant fixes that; the route was the bug.
//
// So: navigate off the actual collider set. A uniform occupancy grid, inflated
// by the body radius, and a Dijkstra distance field flooded out from the exit.
// The thief's escape direction is then a downhill walk on that field, string-
// pulled against real line-of-sight — it cannot route into a dead end, it costs
// nothing per frame, and it re-derives itself whenever the store changes shape.
//
//   makeNav(boxes, bounds, opt) -> {
//     free(x,z), clearSeg(ax,az,bx,bz), snap(x,z),
//     field(gx,gz) -> Float32Array,
//     steer(F, x, z, opt) -> {x,z,tx,tz,dist} | null,
//     path(ax,az,bx,bz) -> [{x,z}],
//     nx, nz, cell, blocked, openFrac,
//   }
// `boxes` are {x0,z0,x1,z1} footprints; `bounds` is {minX,minZ,maxX,maxZ} plus
// optional walk* clamps matching whatever the collision resolver enforces.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const R2 = Math.SQRT2;

export function makeNav(boxes, bounds, opt = {}) {
  const cell = opt.cell ?? 0.42;
  const pad = opt.pad ?? 0.52;              // body radius + a little shoulder room
  const minX = bounds.minX, minZ = bounds.minZ;
  const nx = Math.max(2, Math.ceil((bounds.maxX - minX) / cell));
  const nz = Math.max(2, Math.ceil((bounds.maxZ - minZ) / cell));
  const N = nx * nz;
  const blocked = new Uint8Array(N);

  const NI0 = [1, -1, 0, 0, 1, 1, -1, -1];
  const NJ0 = [0, 0, 1, -1, 1, -1, 1, -1];
  const cxOf = (x) => clamp(Math.floor((x - minX) / cell), 0, nx - 1);
  const czOf = (z) => clamp(Math.floor((z - minZ) / cell), 0, nz - 1);
  const wx = (i) => minX + (i + 0.5) * cell;
  const wz = (j) => minZ + (j + 0.5) * cell;
  const idx = (i, j) => j * nx + i;

  // ---- mark solids ---------------------------------------------------------
  for (const b of boxes) {
    const ax = b.x0 - pad, bx = b.x1 + pad, az = b.z0 - pad, bz = b.z1 + pad;
    if (bx < minX || ax > bounds.maxX || bz < minZ || az > bounds.maxZ) continue;
    for (let i = cxOf(ax); i <= cxOf(bx); i++) {
      const px = wx(i);
      if (px <= ax || px >= bx) continue;
      for (let j = czOf(az); j <= czOf(bz); j++) {
        const pz = wz(j);
        if (pz > az && pz < bz) blocked[idx(i, j)] = 1;
      }
    }
  }
  // ...and the same box the collision resolver clamps everyone into.
  const wMinX = opt.walkMinX ?? minX, wMaxX = opt.walkMaxX ?? bounds.maxX;
  const wMinZ = opt.walkMinZ ?? minZ, wMaxZ = opt.walkMaxZ ?? bounds.maxZ;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const px = wx(i), pz = wz(j);
    if (px < wMinX || px > wMaxX || pz < wMinZ || pz > wMaxZ) blocked[idx(i, j)] = 1;
  }

  let open = 0;
  for (let k = 0; k < N; k++) if (!blocked[k]) open++;

  // ---- clearance -----------------------------------------------------------
  // Cells from the nearest solid, capped. Routes get a mild extra cost for
  // scraping along geometry, which keeps runners down the middle of the aisle
  // instead of hugging a shelf lip. That is how people actually run, and it
  // stops the cop from hoovering up shelf powerups he never steered at: with
  // the lane free width at ~3m and the cans on the lip, anything off-centre was
  // an accidental boost, and the bench saw the "unpowered" cop boosted 16% of
  // the chase because of it.
  const CLEARCAP = 4;
  const clr = new Uint8Array(N);
  {
    const q = new Int32Array(N);
    let head = 0, tail = 0;
    for (let k = 0; k < N; k++) if (blocked[k]) { clr[k] = 0; q[tail++] = k; } else clr[k] = 255;
    while (head < tail) {
      const u = q[head++];
      const d = clr[u];
      if (d >= CLEARCAP) continue;
      const ui = u % nx, uj = (u / nx) | 0;
      for (let n = 0; n < 8; n++) {
        const vi = ui + NI0[n], vj = uj + NJ0[n];
        if (vi < 0 || vj < 0 || vi >= nx || vj >= nz) continue;
        const v = idx(vi, vj);
        if (clr[v] !== 255) continue;
        clr[v] = d + 1; q[tail++] = v;
      }
    }
    for (let k = 0; k < N; k++) if (clr[k] === 255) clr[k] = CLEARCAP;
  }
  // Baked once. This is read eight times per popped cell inside the flood, which
  // now runs several times a second during a chase; as a function call with a
  // divide in it, it was a measurable slice of the frame.
  const hug = opt.hug ?? 0.55;
  const mul = new Float32Array(N);
  for (let k = 0; k < N; k++) mul[k] = 1 + hug * (1 - clr[k] / CLEARCAP);

  // ---- line of sight -------------------------------------------------------
  // Supercover walk: any cell the segment touches must be free. Conservative on
  // purpose — a "clear" segment is one a body can actually be dragged along.
  function clearSeg(ax, az, bx, bz) {
    let i = cxOf(ax), j = czOf(az);
    const i1 = cxOf(bx), j1 = czOf(bz);
    if (blocked[idx(i, j)] || blocked[idx(i1, j1)]) return false;
    const dx = bx - ax, dz = bz - az;
    const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const invX = dx !== 0 ? 1 / Math.abs(dx) : Infinity;
    const invZ = dz !== 0 ? 1 / Math.abs(dz) : Infinity;
    // parametric distance to the next cell boundary on each axis
    let tX = dx !== 0 ? (minX + (i + (dx > 0 ? 1 : 0)) * cell - ax) / dx : Infinity;
    let tZ = dz !== 0 ? (minZ + (j + (dz > 0 ? 1 : 0)) * cell - az) / dz : Infinity;
    const dX = cell * invX, dZ = cell * invZ;
    for (let guard = 0; guard < 4096; guard++) {
      if (i === i1 && j === j1) return true;
      if (tX < tZ) { i += si; tX += dX; } else { j += sj; tZ += dZ; }
      if (i < 0 || j < 0 || i >= nx || j >= nz) return false;
      if (blocked[idx(i, j)]) return false;
      if (tX > 1 && tZ > 1) return true;
    }
    return false;
  }

  // Nearest free cell to a world point (agents get shoved inside geometry).
  function snapCell(x, z) {
    const i0 = cxOf(x), j0 = czOf(z);
    if (!blocked[idx(i0, j0)]) return idx(i0, j0);
    for (let r = 1; r <= 12; r++) {
      let best = -1, bd = Infinity;
      for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
        if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r) continue;
        const k = idx(i, j);
        if (blocked[k]) continue;
        const d = (wx(i) - x) ** 2 + (wz(j) - z) ** 2;
        if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // ---- binary heap ---------------------------------------------------------
  // Typed and preallocated. This runs a few times a second during a chase (the
  // escape field is re-flooded whenever the cop moves) and the JS-array version
  // cost 2.4 ms a flood, which is a visible hitch inside a 16 ms frame. Same
  // algorithm, no allocation, no push/pop: ~0.6 ms.
  let hI = new Int32Array(1024), hC = new Float64Array(1024), hN = 0;
  function hClear() { hN = 0; }
  function hGrow() {
    const i2 = new Int32Array(hI.length * 2); i2.set(hI); hI = i2;
    const c2 = new Float64Array(hC.length * 2); c2.set(hC); hC = c2;
  }
  function hPush(k, c) {
    if (hN === hI.length) hGrow();
    let n = hN++;
    hI[n] = k; hC[n] = c;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hC[p] <= hC[n]) break;
      const ti = hI[p]; hI[p] = hI[n]; hI[n] = ti;
      const tc = hC[p]; hC[p] = hC[n]; hC[n] = tc;
      n = p;
    }
  }
  function hPop() {
    const top = hI[0], n = --hN;
    hI[0] = hI[n]; hC[0] = hC[n];
    let p = 0;
    for (;;) {
      const l = p * 2 + 1, r = l + 1;
      let s = p;
      if (l < n && hC[l] < hC[s]) s = l;
      if (r < n && hC[r] < hC[s]) s = r;
      if (s === p) break;
      const ti = hI[p]; hI[p] = hI[s]; hI[s] = ti;
      const tc = hC[p]; hC[p] = hC[s]; hC[s] = tc;
      p = s;
    }
    return top;
  }

  // Neighbour offsets: 4 orthogonal then 4 diagonal (diagonals need both
  // orthogonals free, so a body never clips a corner it could not fit past).
  const NI = NI0, NJ = NJ0;
  const NC = [1, 1, 1, 1, R2, R2, R2, R2];
  const NCC = NC.map((c) => c * cell);   // step length, baked

  // ---- threat ---------------------------------------------------------------
  // A soft, finite cost bubble the flood has to pay to cross. This is the whole
  // reason a cornered thief has anywhere to go.
  //
  // ROUND 3 — why this had to move into the COST FUNCTION. steer()'s `avoid` is
  // an aim-point filter applied to one greedy descent of the field. The descent
  // is computed first and the filter runs second, so the only thing `avoid` can
  // ever do is pick a nearer point on the SAME line. When a cop stands in an
  // aisle, every point on that line is fouled, `got` comes back false, and the
  // routine falls back to the furthest visible point — which is the far side of
  // the cop. The thief then sprints into him. No radius fixes that; a filter
  // cannot invent a route the descent never offered. The threat has to be in
  // the flood, so that "out the back and round" is a cost the search can weigh
  // against "squeeze past him" and pick the cheaper one on its own.
  //
  // Deliberately soft, never blocking: a hard block can strand a thief in a
  // pocket with an infinite field and no gradient at all, and being properly
  // cornered should mean a desperate squeeze, not a freeze.
  let _th = null, _tbox = null;
  function threatMask(av) {
    if (!_th) _th = new Float32Array(N);
    if (_tbox) {                                   // clear last frame's bubble
      for (let i = _tbox[0]; i <= _tbox[1]; i++)
        for (let j = _tbox[2]; j <= _tbox[3]; j++) _th[idx(i, j)] = 0;
    }
    const r = av.r, w = av.w ?? 20;
    const i0 = cxOf(av.x - r), i1 = cxOf(av.x + r);
    const j0 = czOf(av.z - r), j1 = czOf(av.z + r);
    _tbox = [i0, i1, j0, j1];
    for (let i = i0; i <= i1; i++) {
      const ddx = wx(i) - av.x;
      for (let j = j0; j <= j1; j++) {
        const ddz = wz(j) - av.z;
        const d = Math.hypot(ddx, ddz);
        if (d >= r) continue;
        const t = 1 - d / r;
        _th[idx(i, j)] = w * t * t;
      }
    }
    return _th;
  }

  // ---- distance field ------------------------------------------------------
  // Flood costs out from a goal. Every agent heading for the same place shares
  // one of these; it only has to be rebuilt when the store changes shape — or,
  // with opt.avoid, when the thing being avoided has moved.
  function field(gx, gz, o = {}) {
    const D = o.out && o.out.length === N ? o.out : new Float32Array(N);
    D.fill(Infinity);
    const g = snapCell(gx, gz);
    if (g < 0) return D;
    const av = o.avoid;
    const TH = av && av.r > 0 ? threatMask(av) : null;
    hClear(); D[g] = 0; hPush(g, 0);
    while (hN) {
      const u = hPop();
      const du = D[u];
      const ui = u % nx, uj = (u / nx) | 0;
      for (let n = 0; n < 8; n++) {
        const vi = ui + NI[n], vj = uj + NJ[n];
        if (vi < 0 || vj < 0 || vi >= nx || vj >= nz) continue;
        const v = idx(vi, vj);
        if (blocked[v]) continue;
        if (n >= 4 && (blocked[idx(ui, vj)] || blocked[idx(vi, uj)])) continue;
        const nd = du + NCC[n] * (TH ? mul[v] + TH[v] : mul[v]);
        if (nd < D[v]) { D[v] = nd; hPush(v, nd); }
      }
    }
    return D;
  }

  // ---- steering ------------------------------------------------------------
  // Walk downhill on F, then string-pull: aim at the FURTHEST point on that
  // descent we can actually see. That turns a grid staircase back into the
  // clean diagonal a running body would take.
  //
  // opt.avoid = {x,z,r} keeps the aim point off someone (the cop). If every
  // visible point is fouled we still return the nearest one — running at him is
  // better than standing still, and getting cut off should cost you.
  const _pts = new Int32Array(48);
  function steer(F, x, z, o = {}) {
    let cur = snapCell(x, z);
    if (cur < 0 || !isFinite(F[cur])) return null;
    const look = o.look ?? 7.0;
    const start = F[cur];
    let n = 0;
    while (n < _pts.length) {
      const ui = cur % nx, uj = (cur / nx) | 0;
      let best = -1, bd = F[cur];
      for (let k = 0; k < 8; k++) {
        const vi = ui + NI[k], vj = uj + NJ[k];
        if (vi < 0 || vj < 0 || vi >= nx || vj >= nz) continue;
        const v = idx(vi, vj);
        if (blocked[v] || !isFinite(F[v])) continue;
        if (k >= 4 && (blocked[idx(ui, vj)] || blocked[idx(vi, uj)])) continue;
        if (F[v] < bd) { bd = F[v]; best = v; }
      }
      if (best < 0) break;
      _pts[n++] = best; cur = best;
      if (start - bd > look) break;
    }
    if (!n) return null;

    const av = o.avoid;
    let tx = 0, tz = 0, got = false, fallbackX = 0, fallbackZ = 0, gotAny = false;
    for (let k = n - 1; k >= 0; k--) {
      const px = wx(_pts[k] % nx), pz = wz((_pts[k] / nx) | 0);
      if (!clearSeg(x, z, px, pz)) continue;
      if (!gotAny) { fallbackX = px; fallbackZ = pz; gotAny = true; }
      if (av && segNear(x, z, px, pz, av.x, av.z) < av.r) continue;
      tx = px; tz = pz; got = true; break;
    }
    if (!got) {
      if (!gotAny) {
        tx = wx(_pts[0] % nx); tz = wz((_pts[0] / nx) | 0);
      } else { tx = fallbackX; tz = fallbackZ; }
    }
    const dx = tx - x, dz = tz - z;
    const m = Math.hypot(dx, dz);
    if (m < 1e-6) return null;
    return { x: dx / m, z: dz / m, tx, tz, dist: F[snapCell(x, z)] };
  }

  function segNear(ax, az, bx, bz, px, pz) {
    const dx = bx - ax, dz = bz - az;
    const l = dx * dx + dz * dz;
    if (l < 1e-9) return Math.hypot(px - ax, pz - az);
    let t = ((px - ax) * dx + (pz - az) * dz) / l;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }

  // ---- A* ------------------------------------------------------------------
  // For one-off goals (a shopper picking a new spot to browse, the bench's
  // pursuit bot when it loses sight of the thief).
  const _g = new Float32Array(N);
  const _from = new Int32Array(N);
  const _mark = new Int32Array(N);
  let _epoch = 0;
  function path(ax, az, bx, bz) {
    if (clearSeg(ax, az, bx, bz)) return [{ x: bx, z: bz }];
    const s = snapCell(ax, az), t = snapCell(bx, bz);
    if (s < 0 || t < 0) return [{ x: bx, z: bz }];
    const ti = t % nx, tj = (t / nx) | 0;
    const h = (k) => {
      const dx = Math.abs((k % nx) - ti), dz = Math.abs(((k / nx) | 0) - tj);
      return (Math.max(dx, dz) + (R2 - 1) * Math.min(dx, dz)) * cell;
    };
    const ep = ++_epoch;
    hClear(); _mark[s] = ep; _g[s] = 0; _from[s] = -1; hPush(s, h(s));
    let found = false;
    let guard = N * 2;
    while (hN && guard-- > 0) {
      const u = hPop();
      if (u === t) { found = true; break; }
      const gu = _g[u];
      const ui = u % nx, uj = (u / nx) | 0;
      for (let n = 0; n < 8; n++) {
        const vi = ui + NI[n], vj = uj + NJ[n];
        if (vi < 0 || vj < 0 || vi >= nx || vj >= nz) continue;
        const v = idx(vi, vj);
        if (blocked[v]) continue;
        if (n >= 4 && (blocked[idx(ui, vj)] || blocked[idx(vi, uj)])) continue;
        const nd = gu + NCC[n] * mul[v];
        if (_mark[v] === ep && _g[v] <= nd) continue;
        _mark[v] = ep; _g[v] = nd; _from[v] = u;
        hPush(v, nd + h(v));
      }
    }
    if (!found) return [{ x: bx, z: bz }];
    const chain = [];
    for (let k = t; k >= 0; k = _from[k]) {
      chain.push({ x: wx(k % nx), z: wz((k / nx) | 0) });
      if (k === s) break;
    }
    chain.reverse();
    chain.push({ x: bx, z: bz });
    // string-pull
    const out = [];
    let cx = ax, cz = az;
    for (let i = 0; i < chain.length; i++) {
      const nxt = chain[i + 1];
      if (nxt && clearSeg(cx, cz, nxt.x, nxt.z)) continue;
      out.push(chain[i]); cx = chain[i].x; cz = chain[i].z;
    }
    return out.length ? out : [{ x: bx, z: bz }];
  }

  return {
    nx, nz, cell, pad, blocked, clr, count: N,
    openFrac: open / N,
    free: (x, z) => !blocked[idx(cxOf(x), czOf(z))],
    reachable: (F, x, z) => { const k = snapCell(x, z); return k >= 0 && isFinite(F[k]); },
    at: (F, x, z) => { const k = snapCell(x, z); return k < 0 ? Infinity : F[k]; },
    clearSeg, field, steer, path, snap: snapCell,
    world: (k) => ({ x: wx(k % nx), z: wz((k / nx) | 0) }),
  };
}
