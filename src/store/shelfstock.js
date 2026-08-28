// OWNER: builder-store.  THE FACING LEDGER.
//
// ROUND 12, and it is the client's sentence: "when they pick something up off
// of the shelf, they really should remove it from the shelf."
//
// The store draws ~44,000 packages through twelve InstancedMeshes. Taking one
// facing has to mean that instance stops being drawn — not a duplicate hidden
// under it, not a decal, not a second copy of the shelf with a hole in it — and
// it has to cost about nothing, because 25 bodies reach for something every few
// seconds and this runs on the same thread as everything else.
//
// =============================================================================
// WHY THE LEDGER IS BUILT BY WALKING THE SCENE AND NOT BY HOOKING THE PUSH PATH
// =============================================================================
// The obvious shape is a third sink in kit.js's Batch.push next to FIELD_SINK
// and FIELD_PAINT. Three reasons it is not:
//
//   * Batch.push is the one function every solid in the building goes through,
//     and `?flat`, `?flatyaw` and `?lipflat` are controls only because the fill
//     loop makes byte-identical draws between arms. products.js's own r24 note
//     records a round where five of 814 fill calls changed their draw count and
//     two arms came back with different instance totals. A new argument on that
//     path is a new way for that to happen.
//   * r19's lesson, twice over in this codebase: Batch CLONES each geometry to
//     hang `aCell` on it, so the objects a build-time hook sees are not the ones
//     the GPU draws. A check that read the seven authored buffers passed while
//     the 51 real ones were corrupt.
//   * A scene walk works for every facing however it got there — gondola decks,
//     the reach-in coolers, the frozen wall, the wet rack, the checkout candy —
//     without twelve call sites having to remember to opt in.
//
// So this runs once, after the last flushPkg(), against the artefact.
//
// =============================================================================
// REMOVAL IS SWAP-AND-SHRINK, NOT A ZEROED MATRIX
// =============================================================================
// The cheap way to hide an instance is to zero the basis of its matrix: twelve
// float writes, one buffer, done. It draws nothing, because three vertices at
// one clip position is a zero-area triangle and a zero-area triangle covers no
// samples.
//
// It is still wrong here, and the reason is this project's own instruments.
// aspectCheck(), lipCheck() and columnCheck() all walk `for (i < o.count)` and
// read the scale straight out of instanceMatrix. A zeroed instance gives
// aspectCheck a 0/0 and lipCheck a zero-extent package sitting at the lip, so
// the first critic to re-run them after a shift has started gets garbage from
// three separate instruments and no error anywhere. `?flat` arms would not
// match either.
//
// Swap-and-shrink instead: swap the doomed instance with the last live one and
// decrement mesh.count. The instance is genuinely not drawn AND genuinely not
// counted, every existing `i < o.count` loop stays exactly correct with no edit,
// and the GPU issues fewer instances rather than rasterising degenerate ones.
// The price is that three buffers move instead of one and the ledger has to keep
// a slot<->facing map both ways. That is 21 float swaps and six update ranges;
// see the cost table in the report.
//
// THE UPLOAD IS THE PART THAT WOULD HAVE BEEN EXPENSIVE. `needsUpdate = true`
// on an InstancedMesh re-uploads the WHOLE matrix buffer — 2.8 MB across the
// package meshes — and at six takes a second that is 17 MB/s of bus traffic for
// two moved instances. three r169 has BufferAttribute.addUpdateRange(), which
// turns each take into two 64-byte bufferSubData calls instead. Ranges
// accumulate and merge if a mesh is not rendered for a frame, so a batch that is
// off-camera when it is picked from still gets every edit when it comes back.
//
// =============================================================================
// THE GAP MUST NOT BE A GUILT TELL
// =============================================================================
// A gap in a shelf is legible on the monitor wall. If a thief's gap looked
// different from an innocent's, or if only thieves left gaps, the player would
// read guilt off the shelving instead of off the person and the decoy system —
// which is the best idea in this game — would be dead.
//
// Three things enforce it, and none of them is a promise about the caller:
//
//   1. THE SIGNATURE CANNOT CARRY GUILT. takeFacing(x, y, z, r) takes four
//      numbers. There is no actor argument, no id, no channel, no options bag
//      that could grow one, and nothing in this file reads anything about who is
//      calling. Two calls with the same arguments produce the same bytes; see
//      gapCheck(), which proves it by taking the same facing twice around a
//      putFacing and comparing the buffers.
//   2. GAPS AGE ON ONE CLOCK. The FIFO below closes the OLDEST open gap when the
//      store is holding more than `maxGaps`, whoever opened it and whether or not
//      anybody ever puts anything back. A thief who never returns an item and a
//      shopper who wandered off with one in their hand leave a gap with exactly
//      the same half-life. Without this the store would slowly accumulate
//      permanent gaps at precisely the places thefts happened, which is the tell
//      arrived at by arithmetic instead of by design.
//   3. THE PUT-BACK IS NOT TIDIER FOR ONE CLASS. putFacing() restores the exact
//      transform 78% of the time and a deliberately wrong one otherwise — cocked,
//      shoved back, sometimes turned around. Which of the two you get is a hash
//      of (facing, take sequence), so it is decided before anybody knows what the
//      caller was going to do with the item, and it is the same distribution for
//      every caller.
//
// The one thing this file cannot enforce is the caller's REACH RATE. If thieves
// took things twice as often as shoppers the gap field would leak that, and no
// amount of care here would help. That belongs to agents.js and to the eleven
// gestures on one code path.
// =============================================================================

// Geometry name -> what the caller should put in a hand. The names are the ones
// store.js hands unitCellUV(); a shape that grows a new outline lands in the
// default rather than throwing, because a wrong-but-plausible prop in a fist at
// 30 px is a smaller error than a crash mid-shift.
const KIND_OF = {
  'carton/box': 'carton',
  'carton/wrap': 'wrap',
  'pouch/bag': 'bag',
  'pouch/gusset': 'bag',
  'can/cylinder': 'can',
  'can/rim': 'can',
  'can/jar': 'jar',
  'can/tub': 'tub',
  'bottle/soda': 'bottle',
  'bottle/jug': 'jug',
  'bottle/squat': 'bottle',
  'bottle/spray': 'bottle',
};

export const STOCK = {
  // The band a standing body can actually reach. Below 180 mm is the kick
  // plate's shadow and above 2.05 m is the top-stock shelf nobody touches; both
  // are also the two places a missing facing would never be seen.
  yLo: 0.18,
  yHi: 2.05,

  // FRONT RANK ONLY, and the discriminator is lipCheck()'s, not a new one: how
  // far the package's own FRONT FACE sits behind the shelf plane. Centre-based
  // depth cannot separate the two ranks — the cooler stacks them 96 mm apart and
  // a deep carton's centre is 80 mm behind its own front face, so the front
  // rank's centres and the back rank's centres overlap. Front faces do not: a
  // fronted slot is +22 mm proud, an ordinary one is flush, a shopped-back one is
  // -40 mm, and rank two starts at -96 mm.
  proud: -0.075,

  // ...and a ceiling on the same number, which the first build did not have and
  // needed. Without it anything standing in FRONT of a shelf plane and inside
  // the plane's own run gets ranked against it, and the census duly registered
  // seven facings out of the CART LOADS parked in the aisles: a shopper reaching
  // at a shelf would have made a box vanish out of a stranger's trolley. r20's
  // fronted slots reach +22 mm proud and the two soft bag families reach +105 mm
  // by construction (pillowGeo's belly ring is 2.02 deep in a unit cube, which
  // lipCheck reports as a permanent crossing in every build); a parked cart is
  // 250-400 mm out. 130 mm separates them with room on both sides.
  overHi: 0.13,

  cell: 0.30,          // spatial hash cell, metres
  maxR: 0.75,          // hard cap on the search radius, so the scan is bounded
  maxGaps: 160,        // see (2) above. ~27 s of gap at the shipped reach rate.
  wrongBack: 0.22,     // fraction of put-backs that land wrong
};

let EPOCH = 0;

// deterministic 32-bit mix — same shape as products.js's h32/mix2, kept local so
// this file does not import from the fill path it deliberately does not touch
const mix32 = (a, b) => {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = (h ^ b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * Build the ledger over everything the scene is already drawing.
 *
 * @param THREE   the module
 * @param scene   walked for InstancedMeshes carrying an `aCell` attribute; that
 *                attribute is what makes a mesh a PACKAGE mesh and not a fixture
 * @param planes  products.js facePlanes(). Taken as an argument rather than
 *                imported, for the reason orient.js states: this file must not
 *                be able to grow a second idea of where a shelf plane is.
 */
export function buildStock(THREE, scene, planes) {
  const epoch = ++EPOCH;
  const idBase = epoch * 10000000;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);

  // ---- 1. the package meshes --------------------------------------------
  const MESH = [];
  scene.traverse((o) => {
    if (!o.isInstancedMesh || !o.count || !o.geometry) return;
    const g = o.geometry;
    const cellAttr = g.attributes && g.attributes.aCell;
    if (!cellAttr) return;                       // fixture batch, not product
    if (!o.instanceColor) return;                // Batch always sets one
    if (!g.boundingBox) g.computeBoundingBox();
    const bb = g.boundingBox;
    MESH.push({
      mesh: o,
      mAttr: o.instanceMatrix, cAttr: o.instanceColor, eAttr: cellAttr,
      mat: o.instanceMatrix.array,
      col: o.instanceColor.array,
      cell: cellAttr.array,
      n0: o.count,
      slot: new Int32Array(o.count).fill(-1),    // instance slot -> facing index
      kind: KIND_OF[g.name || ''] || 'carton',
      lw: bb.max.x - bb.min.x, lh: bb.max.y - bb.min.y, ld: bb.max.z - bb.min.z,
    });
  });

  // ---- 2. the shelf planes, bucketed ------------------------------------
  // lipCheck walks every group for every instance. That is 44k x ~200 and it is
  // fine once, at build, for a report. Here it would be 8.8 M iterations inside
  // the store build, so the groups go into a 0.25 m bucket on their own cross
  // coordinate first and each instance probes three buckets. Same match, same
  // acceptance test, ~1/60th of the work.
  const GB = new Map();
  const G = [];
  for (const p of planes || []) {
    const gi = G.length;
    G.push({
      axis: p.axis, face: p.face, plane: p.plane, a0: p.a0, a1: p.a1,
      dept: p.dept,
      // outward normal of the face, in world x/z. Used to reject a facing that
      // is on the FAR side of a gondola from the hand asking for it — the runs
      // are back to back and a 0.5 m reach passes clean through one.
      nx: p.axis === 'z' ? p.face : 0,
      nz: p.axis === 'z' ? 0 : p.face,
      n: 0,
    });
    const k = (p.axis === 'z' ? 'z' : 'x') + Math.round(p.plane * 4);
    let b = GB.get(k); if (!b) GB.set(k, (b = []));
    b.push(gi);
  }
  const probe = (axis, cross, out) => {
    out.length = 0;
    const c = Math.round(cross * 4);
    for (let d = -1; d <= 1; d++) {
      const b = GB.get(axis + (c + d));
      if (b) for (let i = 0; i < b.length; i++) out.push(b[i]);
    }
    return out;
  };

  // ---- 3. the facings ----------------------------------------------------
  const fx = [], fy = [], fz = [], fmi = [], fsl = [], fgr = [], fov = [];
  const bag = [];
  const AXES = ['z', 'x'];
  let scanned = 0, offBand = 0, unmatched = 0, backRank = 0, inFront = 0;
  for (let mi = 0; mi < MESH.length; mi++) {
    const M = MESH[mi];
    const A = M.mat;
    const hx = M.lw / 2, hy = M.lh / 2, hz = M.ld / 2;
    for (let i = 0; i < M.n0; i++) {
      scanned++;
      const b = i * 16;
      const cy = A[b + 13];
      if (cy < STOCK.yLo || cy > STOCK.yHi) { offBand++; continue; }
      const cx = A[b + 12], cz = A[b + 14];
      // world half-extent of the rotated box along x and along z — lipCheck's
      // expression, unchanged, because the two must agree about what "the front
      // face" means or the population this ledger holds is not the population
      // that instrument reports on.
      const ex = Math.abs(A[b]) * hx + Math.abs(A[b + 4]) * hy + Math.abs(A[b + 8]) * hz;
      const ez = Math.abs(A[b + 2]) * hx + Math.abs(A[b + 6]) * hy + Math.abs(A[b + 10]) * hz;
      // Which shelf plane is this instance ranked against? The one its own
      // front face is CLOSEST to, searched over a window wide enough to hold
      // rank two so a back row is classified rather than silently unmatched —
      // the two rejections mean different things and the report separates them.
      let best = -1, bestAbs = 1e9, bestOver = 0;
      for (let ai = 0; ai < 2; ai++) {
        const axis = AXES[ai];
        const cross = axis === 'z' ? cx : cz;
        const along = axis === 'z' ? cz : cx;
        const ext = axis === 'z' ? ex : ez;
        probe(axis, cross, bag);
        for (let k = 0; k < bag.length; k++) {
          const gr = G[bag[k]];
          if (gr.axis !== axis) continue;
          if (along < gr.a0 || along > gr.a1) continue;
          const over = (cross + gr.face * ext - gr.plane) * gr.face;
          if (over < -0.42 || over > 0.42) continue;
          const ab = Math.abs(over);
          if (ab < bestAbs) { bestAbs = ab; bestOver = over; best = bag[k]; }
        }
      }
      if (best < 0) {
        // Nothing registered a plane here: a pallet stack, a cart load, the
        // inside of a bulk block. Correct to leave out — pulling a case out of
        // the middle of a stack would leave the stack standing on nothing.
        unmatched++;
        continue;
      }
      if (bestOver < STOCK.proud) {
        // rank two or deeper. Taking one leaves a gap behind a facing, which is
        // a gap nobody can see and a draw call spent on nothing.
        backRank++;
        continue;
      }
      if (bestOver > STOCK.overHi) { inFront++; continue; }
      const f = fx.length;
      fx.push(cx); fy.push(cy); fz.push(cz);
      fmi.push(mi); fsl.push(i); fgr.push(best); fov.push(bestOver);
      M.slot[i] = f;
      G[best].n++;
    }
  }
  const F = fx.length;
  const FX = Float32Array.from(fx), FY = Float32Array.from(fy), FZ = Float32Array.from(fz);
  const FM = Uint16Array.from(fmi), FG = Int16Array.from(fgr);
  const FO = Float32Array.from(fov);        // front-face offset from the plane
  const FS = Int32Array.from(fsl);          // facing -> its CURRENT instance slot
  const FL = new Uint8Array(F).fill(1);     // 1 = on the shelf

  // ---- 4. the spatial hash ----------------------------------------------
  // Plain uniform grid in CSR form: counts, prefix sums, one index array. Built
  // twice over F rather than with 90,000 pushed arrays, because the empty cells
  // outnumber the full ones fifteen to one and an array-of-arrays would be most
  // of a megabyte of headers holding nothing.
  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (let i = 0; i < F; i++) {
    if (FX[i] < x0) x0 = FX[i]; if (FX[i] > x1) x1 = FX[i];
    if (FY[i] < y0) y0 = FY[i]; if (FY[i] > y1) y1 = FY[i];
    if (FZ[i] < z0) z0 = FZ[i]; if (FZ[i] > z1) z1 = FZ[i];
  }
  const CS = STOCK.cell, INV = 1 / CS;
  const NX = F ? Math.max(1, Math.ceil((x1 - x0) * INV) + 1) : 1;
  const NY = F ? Math.max(1, Math.ceil((y1 - y0) * INV) + 1) : 1;
  const NZ = F ? Math.max(1, Math.ceil((z1 - z0) * INV) + 1) : 1;
  const NC = NX * NY * NZ;
  const cellOf = (i) => (
    Math.min(NX - 1, Math.max(0, ((FX[i] - x0) * INV) | 0)) * NY * NZ
    + Math.min(NY - 1, Math.max(0, ((FY[i] - y0) * INV) | 0)) * NZ
    + Math.min(NZ - 1, Math.max(0, ((FZ[i] - z0) * INV) | 0))
  );
  const START = new Int32Array(NC + 1);
  for (let i = 0; i < F; i++) START[cellOf(i) + 1]++;
  for (let c = 0; c < NC; c++) START[c + 1] += START[c];
  const IDX = new Int32Array(F);
  {
    const cur = START.slice(0, NC);
    for (let i = 0; i < F; i++) IDX[cur[cellOf(i)]++] = i;
  }

  // ---- 5. mutation -------------------------------------------------------
  function swapSlots(M, p, q) {
    if (p === q) return;
    const A = M.mat, C = M.col, E = M.cell;
    let a = p * 16, b = q * 16;
    for (let k = 0; k < 16; k++) { const t = A[a + k]; A[a + k] = A[b + k]; A[b + k] = t; }
    a = p * 3; b = q * 3;
    for (let k = 0; k < 3; k++) { const t = C[a + k]; C[a + k] = C[b + k]; C[b + k] = t; }
    a = p * 2; b = q * 2;
    for (let k = 0; k < 2; k++) { const t = E[a + k]; E[a + k] = E[b + k]; E[b + k] = t; }
    const fp = M.slot[p], fq = M.slot[q];
    M.slot[p] = fq; M.slot[q] = fp;
    if (fp >= 0) FS[fp] = q;
    if (fq >= 0) FS[fq] = p;
    M.mAttr.addUpdateRange(p * 16, 16); M.mAttr.addUpdateRange(q * 16, 16);
    M.cAttr.addUpdateRange(p * 3, 3); M.cAttr.addUpdateRange(q * 3, 3);
    M.eAttr.addUpdateRange(p * 2, 2); M.eAttr.addUpdateRange(q * 2, 2);
    M.mAttr.needsUpdate = true; M.cAttr.needsUpdate = true; M.eAttr.needsUpdate = true;
  }

  const open = new Map();               // handle id -> facing index
  const order = [];                     // handle ids, oldest first
  let head = 0;                         // consumed prefix of `order`
  let seq = 0;
  const LOG = { taken: 0, put: 0, evicted: 0, miss: 0, wrong: 0 };
  const _c = new THREE.Color();

  function evictOldest() {
    while (head < order.length) {
      const id = order[head++];
      if (open.has(id)) { restore(id, true); LOG.evicted++; return; }
    }
  }

  function restore(id, aged) {
    const f = open.get(id);
    if (f === undefined) return false;
    open.delete(id);
    const M = MESH[FM[f]];
    const n = M.mesh.count;
    swapSlots(M, FS[f], n);
    M.mesh.count = n + 1;
    FL[f] = 1;
    // WHERE IT LANDS. The transform that comes back is the one that left, which
    // is what a shopper who was only reading the label does. `wrongBack` of the
    // time it comes back badly instead — turned, shoved off the line, sometimes
    // reversed. The coin is mix32(facing, sequence): fixed at the moment the item
    // was TAKEN, so it cannot correlate with what the caller decided to do while
    // holding it, and identical for every caller.
    if (!aged && mix32(f * 2654435761, id) < STOCK.wrongBack) {
      const p = FS[f] * 16, A = M.mat;
      const gr = G[FG[f]];
      const r1 = mix32(id, 0x51ed) * 2 - 1;
      const r2 = mix32(id, 0x9e37) * 2 - 1;
      const r3 = mix32(id, 0x27d4);
      // yaw about Y, applied to the two horizontal basis columns
      const ang = r1 * 0.30 + (r3 < 0.09 ? Math.PI : 0);
      const cs = Math.cos(ang), sn = Math.sin(ang);
      for (const c of [0, 4, 8]) {
        const ax = A[p + c], az = A[p + c + 2];
        A[p + c] = ax * cs + az * sn;
        A[p + c + 2] = -ax * sn + az * cs;
      }
      // and off the line: sideways along the run, and proud of where it was,
      // because a shopper putting something back does it at arm's length.
      //
      // THE LEDGER'S OWN COPY OF THE POSITION IS NOT UPDATED, deliberately. FX/
      // FY/FZ seed a CSR spatial hash built once — moving an entry would need the
      // grid rebuilt or would strand it in the wrong cell. The drift is bounded
      // by hypot(35, 22) = 41 mm against a 300 mm cell and a 350-500 mm reach, so
      // the search is unaffected; and the handle's `at` is read out of the LIVE
      // matrix, so what a caller is told is always where the thing actually is.
      const sx = gr.axis === 'z' ? 0 : 1, sz = gr.axis === 'z' ? 1 : 0;
      A[p + 12] += sx * r2 * 0.035 + gr.nx * r3 * 0.022;
      A[p + 14] += sz * r2 * 0.035 + gr.nz * r3 * 0.022;
      M.mAttr.addUpdateRange(p, 16);
      M.mAttr.needsUpdate = true;
      LOG.wrong++;
    }
    return true;
  }

  /**
   * Take the nearest visible product facing to a world point.
   * @returns null, or { id, at:{x,y,z}, size:[w,h,d], colour, kind, cell, dept }
   */
  function takeFacing(x, y, z, r) {
    const R = Math.min(Math.max(+r || 0, 0), STOCK.maxR);
    if (!(R > 0) || !F) { LOG.miss++; return null; }
    const R2 = R * R;
    const ix0 = Math.max(0, (((x - R) - x0) * INV) | 0), ix1 = Math.min(NX - 1, (((x + R) - x0) * INV) | 0);
    const iy0 = Math.max(0, (((y - R) - y0) * INV) | 0), iy1 = Math.min(NY - 1, (((y + R) - y0) * INV) | 0);
    const iz0 = Math.max(0, (((z - R) - z0) * INV) | 0), iz1 = Math.min(NZ - 1, (((z + R) - z0) * INV) | 0);
    let best = -1, bd = R2;
    for (let a = ix0; a <= ix1; a++) {
      for (let b = iy0; b <= iy1; b++) {
        const base = a * NY * NZ + b * NZ;
        for (let c = iz0; c <= iz1; c++) {
          const s = START[base + c], e = START[base + c + 1];
          for (let k = s; k < e; k++) {
            const f = IDX[k];
            if (!FL[f]) continue;
            const dx = FX[f] - x, dy = FY[f] - y, dz = FZ[f] - z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= bd) continue;
            // must be reachable from where the hand IS. Gondola runs stand back
            // to back with 0.7 m between opposing lips, so without this a 0.5 m
            // reach in aisle 3 takes a facing off aisle 4 straight through the
            // fixture, and a gap opens in an aisle nobody is standing in.
            const gr = G[FG[f]];
            if (-dx * gr.nx - dz * gr.nz < -0.02) continue;
            bd = d2; best = f;
          }
        }
      }
    }
    if (best < 0) { LOG.miss++; return null; }

    const f = best;
    const M = MESH[FM[f]];
    const p = FS[f], A = M.mat, o = p * 16;
    // read the handle off the live buffer BEFORE the swap moves it
    const sx = Math.hypot(A[o], A[o + 1], A[o + 2]);
    const sy = Math.hypot(A[o + 4], A[o + 5], A[o + 6]);
    const sz = Math.hypot(A[o + 8], A[o + 9], A[o + 10]);
    const ax = A[o + 12], ay = A[o + 13], az = A[o + 14];
    const co = p * 3;
    _c.setRGB(M.col[co], M.col[co + 1], M.col[co + 2]);
    const grid = M.eAttr;
    const cell = [grid.array[p * 2], grid.array[p * 2 + 1]];

    const n = M.mesh.count - 1;
    swapSlots(M, p, n);
    M.mesh.count = n;
    FL[f] = 0;

    const id = idBase + (++seq);
    open.set(id, f);
    order.push(id);
    LOG.taken++;
    if (open.size > STOCK.maxGaps) evictOldest();
    // `order` is append-only and `head` only advances when the FIFO fires, so a
    // long quiet shift would grow it without bound. Compact the consumed prefix
    // and the handles that were put back by hand; both are already closed.
    if (order.length - head > 4 * STOCK.maxGaps) {
      const keep = [];
      for (let k = head; k < order.length; k++) if (open.has(order[k])) keep.push(order[k]);
      order.length = 0; order.push(...keep); head = 0;
    }

    return {
      id,
      at: { x: ax, y: ay, z: az },
      size: [sx * M.lw, sy * M.lh, sz * M.ld],
      // instanceColor is stored in WORKING space; getHex converts back out to
      // sRGB, so a caller doing new Color().setHex(h) gets the tint that left
      // the shelf and not a gamma-shifted cousin of it.
      colour: _c.getHex(THREE.SRGBColorSpace),
      kind: M.kind,
      // extras, additive: the atlas cell so a caller that wants the actual
      // artwork can have it, and which run it came off
      cell,
      dept: G[FG[f]].dept,
    };
  }

  function putFacing(id) {
    // A handle from a previous build, or one already closed by the FIFO, simply
    // is not in the map. Nothing throws and nothing is put back twice.
    if (!restore(id, false)) return false;
    LOG.put++;
    return true;
  }

  function facingsTaken() { return open.size; }

  // Put EVERYTHING back. Every outstanding handle is dead afterwards and
  // putFacing() on one returns false — the item it named is already on the shelf.
  function restockShelves() {
    let n = 0;
    for (const id of [...open.keys()]) { restore(id, true); n++; }
    order.length = 0; head = 0;
    return n;
  }

  // ---- 6. the checks -----------------------------------------------------
  //
  // gapCheck() is the one that matters for the decoy system. It takes a facing,
  // hashes the three instance buffers of the mesh it came off, puts it back,
  // takes it AGAIN, and compares. Same arguments, same bytes, both times — which
  // is the whole of "a thief's gap is indistinguishable from an innocent's",
  // because the arguments are all there is.
  const hashMesh = (M) => {
    let h = 2166136261 >>> 0;
    const n = M.mesh.count;
    const bump = (v) => {
      h ^= (Math.round(v * 100000) | 0) >>> 0;
      h = Math.imul(h, 16777619) >>> 0;
    };
    for (let i = 0; i < n * 16; i++) bump(M.mat[i]);
    for (let i = 0; i < n * 3; i++) bump(M.col[i]);
    for (let i = 0; i < n * 2; i++) bump(M.cell[i]);
    return (h >>> 0).toString(16) + ':' + n;
  };

  function gapCheck(n = 24) {
    const bad = [];
    let tried = 0, refound = 0, identical = 0, drew = 0, hidden = 0;
    const before = MESH.map((M) => M.mesh.count);
    for (let k = 0; k < n && F; k++) {
      const seed = ((k * 7919) % F + F) % F;
      if (!FL[seed]) continue;
      const gr = G[FG[seed]];
      // stand where a hand would be: 0.22 m out into the aisle from the facing
      const qx = FX[seed] + gr.nx * 0.22, qy = FY[seed], qz = FZ[seed] + gr.nz * 0.22;
      const a = takeFacing(qx, qy, qz, 0.35);
      if (!a) continue;
      tried++;
      // WHICH facing came out is the ledger's business, not the caller's — the
      // nearest to the point may sit on a different package mesh than the one
      // the point was derived from. The first version of this check hashed the
      // mesh it EXPECTED and reported two false "the take changed nothing"s.
      const fa = open.get(a.id);
      const M = MESH[FM[fa]];
      if (M.mesh.count !== before[FM[fa]] - 1) bad.push('#' + k + ' count did not drop by one');
      if (FS[fa] < M.mesh.count) bad.push('#' + k + ' taken instance still inside the draw range');
      else hidden++;
      const gapA = hashMesh(M);
      if (!putFacing(a.id)) { bad.push('#' + k + ' put refused a live handle'); continue; }
      if (M.mesh.count !== before[FM[fa]]) bad.push('#' + k + ' put did not restore the count');
      if (FS[fa] >= M.mesh.count) bad.push('#' + k + ' restored instance is outside the draw range');
      else drew++;
      const b = takeFacing(qx, qy, qz, 0.35);
      if (!b) { bad.push('#' + k + ' second take found nothing'); continue; }
      if (b.id === a.id) bad.push('#' + k + ' handle reissued');
      const fb = open.get(b.id);
      if (fb === fa) {
        // SAME FACING, SAME ARGUMENTS, TWICE. The drawn set has to be identical
        // down to the byte. That is the whole of "every take leaves the same
        // evidence" — there is nothing else a take can depend on.
        refound++;
        if (hashMesh(M) === gapA) identical++;
        else bad.push('#' + k + ' same facing, two takes, different bytes');
      }
      putFacing(b.id);
    }
    for (let i = 0; i < MESH.length; i++) {
      if (MESH[i].mesh.count !== before[i]) bad.push('mesh ' + i + ' left short');
    }
    return {
      bad, tried,
      // the take actually left the draw range, and the put actually re-entered it
      hidden, drew,
      // the second take found the same facing (the other case is a put-back that
      // deliberately landed wrong and moved the item), and when it did, the
      // drawn bytes matched
      refound, identical,
      // fields on a take handle that could name a caller. Structurally zero:
      // takeFacing's whole signature is four numbers.
      actorFields: 0,
      gapsOpen: open.size,
    };
  }

  function stockStats() {
    const byKind = {};
    const byMesh = {};
    for (let i = 0; i < F; i++) {
      const M = MESH[FM[i]];
      byKind[M.kind] = (byKind[M.kind] || 0) + 1;
      const nm = (M.mesh.name || '?').replace(/\.\d+$/, '');
      byMesh[nm] = (byMesh[nm] || 0) + 1;
    }
    let live = 0, cap = 0;
    for (const M of MESH) { live += M.mesh.count; cap += M.n0; }
    // THE POPULATION, AS A PROFILE. AGENTS_BRIEF's rule: report the distribution
    // against a named reference, not the extremes. The reference here is
    // lipCheck()'s own `over` — same expression, same face registry — so the two
    // numbers are comparable by construction and a divergence means one of them
    // has grown a second idea of where the shelf plane is.
    const s = Array.from(FO).sort((a, b) => a - b);
    const q = (p) => (s.length ? +s[Math.min(s.length - 1, Math.floor(s.length * p))].toFixed(4) : null);
    return {
      epoch,
      meshes: MESH.length,
      instances: cap,
      instancesDrawn: live,
      facings: F,
      scanned, offBand, unmatched, backRank, inFront,
      overMm: { p01: q(0.01), p25: q(0.25), p50: q(0.5), p75: q(0.75), p99: q(0.99) },
      byKind,
      byMesh,
      planes: G.length,
      planesStocked: G.filter((g) => g.n).length,
      cells: NC, gridBytes: START.byteLength + IDX.byteLength,
      // FROZEN AT THE END OF THE BUILD, not computed here. The first version
      // subtracted t0 inside this function, so it reported the age of the
      // ledger rather than the cost of making it — 74,490 ms on a page that had
      // been open 74 seconds, and it looked exactly like a plausible number
      // until it did not.
      buildMs,
      gapsOpen: open.size,
      maxGaps: STOCK.maxGaps,
      log: { ...LOG },
    };
  }

  const buildMs = +(((typeof performance !== 'undefined' ? performance.now() : 0) - t0)).toFixed(2);

  return {
    epoch,
    takeFacing, putFacing, facingsTaken,
    restockShelves, stockStats, gapCheck,
    // exposed for instruments only; do not mutate
    _meshes: MESH, _F: F,
  };
}
