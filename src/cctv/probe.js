// OWNER: builder-cctv. THE BLOWN-HIGHLIGHT INSTRUMENT, AS A MODULE.
//
// NOTHING IMPORTS THIS. It is not in the bundle (tools/bundle.py follows imports
// from the entry only) and it costs the game nothing. Load it from a console:
//
//     const P = await import('/src/cctv/probe.js');
//     const I = P.makeProbe(window.__CHOP);
//     I.setPose(I.POSES[1]);  I.classMap(I.POSES[1]);  I.measure(I.POSES[1]);
//
// ROUND 13 added four, and the first two are the round's whole argument:
//     I.sweepDistance(2)        selectivity over the reachable camera band, and
//                               `separable` per z — whether ANY scalar threshold
//                               works there. Four of sixteen poses: no.
//     I.wallSeparation()        the same question for all nine dome feeds. The
//                               wall had no live check of any kind before this.
//     I.flatGain(pose)          the invariant the round shipped: a source flat
//                               over the kernel must gain nothing from the bloom.
//                               Reports the grain floor next to the lift, because
//                               the verdict is against that, not against zero.
//     numeral() now ablates the macroblocker  — see the note above it. It is
//                               deterministic now; the ratio repeats exactly.
//
// It exists because rounds 10, 11 and 12 each rebuilt the same 150 lines of
// class-map code in a browser console, and three agents' numbers were then only
// comparable if all three had independently avoided the same four traps. They
// are listed here next to the code that avoids them.
//
// ===========================================================================
// THE FOUR TRAPS, AND WHERE EACH ONE IS HANDLED
// ===========================================================================
//
// 1. THE OVERLAY TRAP.  `lightBloom` is an additive, depthWrite:false,
//    renderOrder:5 halo card covering far more area than the fixture it belongs
//    to. A naive material swap makes it OPAQUE, and it then claims every
//    ceiling-tile pixel under the halo as LAMPS — inflating the exact statistic
//    the round is judged on. classMap() HIDES every mesh with a depthWrite:false
//    material, so a pixel's class is the opaque surface that owns it. Seven such
//    overlays exist today: trofferShadows, lightBloom, doorDecals, floorPatches,
//    coolerLed, coolerGlass and 16 anonymous transparent meshes.
//    Prefer exact node names and ANCHORED family regexes to prefixes:
//    /^light/ swallows both `lightLenses` and `lightBloom`.
//
// 2. THE COLOUR-SPACE TRAP.  three.js treats Color(r,g,b) as LINEAR-sRGB
//    working space and converts on output, so an ID authored as 128 reads back
//    as 188 and an exactness audit silently fails at 54%. The palette here is
//    authored with setRGB(..., SRGBColorSpace) so the 8-bit value written IS the
//    value read. classMap() asserts 100% exact and 0 UNKNOWN; if either fails,
//    every number downstream is guesswork and it throws rather than returning.
//    Also: instanceColor multiplies the flat ID (nulled and restored here),
//    scene.fog tints MeshBasicMaterial (nulled and restored here).
//
// 3. THE BARREL TRAP.  The floor grade MOVES PIXELS — up to 31 px at 1280x720.
//    An ID render is a pinhole render, so a class map laid straight over a
//    GRADED frame is misaligned by up to 31 px at 0.6 of the corner radius and
//    by nothing at all at the centre or the corners, which is exactly the shape
//    that survives a casual eyeball check. classMap() returns BOTH: `pin`
//    (pinhole space, the space floorRaw is in) and `warped` (graded screen
//    space), resampled through cctv.unwarpFloor — the ONE JS definition of that
//    map, in cctv/warp.js. Never write a second copy.
//    Alignment is checkable: alignShift() sweeps +/-4 px and the mean graded
//    luma inside the LENS mask must peak at (0,0). It does.
//
// 4. THE ROLL TRAP, and this one is new in round 12 and it is the big one.
//    The grade carries a slow vertical interference band —
//        rb = fract(uv.y + uTime * uRollSpeed);  col *= 1 + band * uRoll
//    — 14% of frame height, amplitude 1.038, sweeping the frame once every
//    1/0.040 = 25 SECONDS on the floor view. Whole-frame blown % is therefore a
//    function of uTime mod 25 s. Measured on ONE unchanged build, aisle-3 pose,
//    25 samples across one full period:
//
//        bloom 0    0.154 -> 0.774   mean 0.229   swing 270% of the mean
//        bloom 12   2.007 -> 2.499   mean 2.089   swing  23.5%
//
//    ROUND 13 CORRECTION: THE 23.5% IS THE r11 DIALS AND IT UNDERSTATES THE
//    SHIPPED BUILD BY 4x. Re-measured with rollCycle(POSES[1], 25, 1.0) at the
//    shipped gain 200: r12 (bloomLocal 0) swings 92.7% of its mean and r13
//    (bloomLocal 1) swings 100.3%. Raising the threshold deleted the large flat
//    blade population, leaving a smaller and more phase-sensitive denominator,
//    so the trap got WORSE in the round that was credited with fixing it. The
//    bloom-0 row still reproduces (281.8%). Anyone quoting 23.5% for a build
//    after round 11 is quoting the wrong build; re-run rollCycle() instead.
//
//    A 6- or 12-frame control at 1/60 s samples 0.2 s out of 25 and reports
//    +/-0.010. THE CONTROL EVERYONE RUNS CANNOT SEE THIS TERM AT ALL, and two
//    honest measurements of the same build minutes apart differ by 60% on the
//    bloom-0 baseline. That baseline is the denominator of every "added by the
//    bloom" figure this project publishes.
//    So: measure with roll ABLATED (setParams('floor',{roll:0}) — one uniform,
//    one page load, restore after), and quote the shipped-roll CYCLE MEAN and
//    range separately when you want the number a player actually sees.
//    rollCycle() below does the second half.
//
// ===========================================================================

// 13 IDs, authored in sRGB so the readback is exact. Index 0 is the cleared
// background and must end up with ZERO pixels — if it does not, geometry is
// missing and the frame is not fully attributed.
export const PALETTE = [
  [0, 0, 0], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255],
  [0, 255, 255], [255, 128, 0], [128, 0, 255], [0, 128, 255], [128, 255, 0],
  [255, 255, 255], [128, 128, 128],
];

// Exact node names and anchored family regexes, in priority order. `store.js`
// owns these names; this list is the only place they are interpreted.
export const TAXONOMY = [
  ['BG', null],
  ['LENS', /^lightLenses$/],
  ['HOUSING', /^trofferHousings$/],
  ['BLADE', /^bladeSigns$/],
  ['SIGN', /^(aisleSigns|laneSigns|promoSigns|couponFlags|wallSigns|danglers|shelfTags|exitSigns|doorDecals)$/],
  ['CEILING', /^(ceilFixtures|ceilPipes)$/],
  ['COOLER', /^(coolerWall\.\d+|cooler\.\d+|coolerBack|coolerLed|coolerGlass)$/],
  ['PRODUCT', /^(run\d+\.\d+|bulk\.\d+|merch\.\d+|wetrack\.\d+|cartload\.\d+|frontend\.\d+|produce)$/],
  ['FIXTURE', /^(fixtures|wood|tubes|drums|casters|rails|uprights|backPanels)$/],
  ['CCTVDOME', /^cctv\.[a-z]+$/],
  ['FRONT', /^(frontWallTrim|outside)$/],
  ['SHELLOTHER', null],   // a store mesh with no name, or a name nothing matched
  ['NONSTORE', null],     // agents, carts, the cop, anything outside the store root
];
export const CLASSES = TAXONOMY.map((t) => t[0]);

const W = 1280, H = 720, N = W * H;

// THE POSES, PUBLISHED. Pose is ~150x the measurement noise on every blown
// statistic (AGENTS_BRIEF), so a single-pose figure is not restatable by anyone
// and every number taken here must name its pose. The rig geometry is the live
// chase camera's, measured off it rather than invented: y 2.36, lateral -0.90 m
// from the aisle centre line, direction (0, -0.143, 0.990), fov 57.
const AISLE_X = (i) => (i - 3.5) * 5.3;      // = config.aisleX, 8 aisles, gap+shelf 5.3
const PITCH = Math.asin(-0.143);
function poseFor(name, aisleIdx, z) {
  const x = AISLE_X(aisleIdx) - 0.90;
  return {
    name, aisle: aisleIdx + 1, fov: 57, pos: [x, 2.36, z],
    look: [x, 2.36 + Math.tan(PITCH) * 10, z + 10],
  };
}
export const POSES = [
  poseFor('P1_aisle1_downZ', 0, -11.6), poseFor('P3_aisle3_downZ', 2, -11.6),
  poseFor('P5_aisle5_downZ', 4, -11.6), poseFor('P7_aisle7_downZ', 6, -11.6),
];

export function makeProbe(CHOP) {
  const { THREE, scene, renderer, cctv } = CHOP;
  const storeRoot = scene.getObjectByName('store');
  const idMats = PALETTE.map((c) => {
    const m = new THREE.MeshBasicMaterial({ toneMapped: false, fog: false, side: THREE.DoubleSide });
    m.color.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
    return m;
  });
  const key = new Map();
  PALETTE.forEach((c, i) => key.set((c[0] << 16) | (c[1] << 8) | c[2], i));

  // The floor camera is a module-local in main.js. Borrow it once by watching a
  // single renderFloor call rather than building a second camera that would
  // drift from the real one.
  let FC = null;
  function grabCam() {
    if (FC) return FC;
    const orig = cctv.renderFloor.bind(cctv);
    cctv.renderFloor = (dt, cam) => { FC = cam; return orig(dt, cam); };
    CHOP.step(0);
    cctv.renderFloor = orig;
    if (!FC) throw new Error('[probe] could not capture the floor camera — is the game on the floor? call game.enterFloor(3)');
    return FC;
  }
  function setPose(p) {
    const c = grabCam();
    c.fov = p.fov; c.position.set(...p.pos); c.up.set(0, 1, 0); c.lookAt(...p.look);
    c.updateProjectionMatrix(); c.updateMatrixWorld(true);
  }
  function renderPose(p, dt = 0.016) { setPose(p); cctv.renderFloor(dt, grabCam()); }

  function classOf(o) {
    const n = o.name || '';
    for (let i = 1; i < TAXONOMY.length - 2; i++) {
      if (TAXONOMY[i][1] && TAXONOMY[i][1].test(n)) return i;
    }
    for (let p = o; p; p = p.parent) if (p === storeRoot) return 11;
    return 12;
  }

  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  function readCanvas() { ctx.drawImage(renderer.domElement, 0, 0); return ctx.getImageData(0, 0, W, H).data; }

  function classMap(pose) {
    const saveMat = [], saveVis = [], saveIC = [];
    scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh)) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((m) => m && m.depthWrite === false)) { saveVis.push([o, o.visible]); o.visible = false; return; }
      if (o.instanceColor) { saveIC.push([o, o.instanceColor]); o.instanceColor = null; }
      saveMat.push([o, o.material]);
      o.material = idMats[classOf(o)];
    });
    const fog = scene.fog; scene.fog = null;
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    const auto = renderer.autoClear;
    renderer.setClearColor(0x000000, 1); renderer.autoClear = true;
    setPose(pose); renderer.setRenderTarget(null); renderer.render(scene, grabCam());
    const src = readCanvas();
    renderer.autoClear = auto; renderer.setClearColor(cc, ca); scene.fog = fog;
    for (const [o, m] of saveMat) o.material = m;
    for (const [o, ic] of saveIC) o.instanceColor = ic;
    for (const [o, v] of saveVis) o.visible = v;

    const pin = new Uint8Array(N);
    let exact = 0, bg = 0;
    for (let i = 0, p = 0; i < src.length; i += 4, p++) {
      const k = key.get((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]);
      if (k === undefined) continue;            // left as 0 == BG, counted below
      exact++; pin[p] = k; if (k === 0) bg++;
    }
    if (exact !== N) throw new Error(`[probe] ID render is not exact: ${N - exact} off-palette pixels. Colour space or a material escaped the swap.`);
    if (bg !== 0) throw new Error(`[probe] ${bg} UNKNOWN (background) pixels — the frame is not 100% attributed.`);
    // pinhole -> graded screen space, nearest (IDs are categorical)
    const warped = new Uint8Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const s = cctv.unwarpFloor({ x: x + 0.5, y: y + 0.5 });
        const sx = Math.floor(s.x), sy = Math.floor(s.y);
        warped[y * W + x] = (sx < 0 || sx >= W || sy < 0 || sy >= H) ? 0 : pin[sy * W + sx];
      }
    }
    return { pin, warped, exactPct: 100, unknown: 0 };
  }

  function gradedY(pose) {
    renderPose(pose);
    const d = readCanvas(); const Y = new Float32Array(N);
    for (let i = 0, p = 0; i < d.length; i += 4, p++) Y[p] = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return Y;
  }

  // Trap 3's check: the mean graded luma inside the LENS mask must peak at zero
  // shift. Run it once on any new pose before believing a class split.
  function alignShift(pose, cm) {
    const Y = gradedY(pose); let best = [0, 0, -1];
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        let s = 0, n = 0;
        for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
          if (cm[y * W + x] !== 1) continue; s += Y[(y + dy) * W + (x + dx)]; n++;
        }
        if (s / n > best[2]) best = [dx, dy, s / n];
      }
    }
    return { dx: best[0], dy: best[1], mean: +best[2].toFixed(4) };
  }

  // Blown = sRGB-DOMAIN 709 luma >= 0.98. The colour space is stated because
  // AGENTS_BRIEF records a 10x swing on an unstated one; this is the same
  // definition rounds 9-12 used, so the numbers are comparable.
  function measure(pose, cm, frames = 4) {
    const per = {}; let tot = 0; const pcts = [];
    for (let f = 0; f < frames; f++) {
      renderPose(pose); const d = readCanvas(); let n = 0;
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        if ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255 < 0.98) continue;
        n++; const k = CLASSES[cm[p]]; per[k] = (per[k] || 0) + 1;
      }
      tot += n; pcts.push(+(100 * n / N).toFixed(4));
    }
    const out = {}; for (const k in per) out[k] = Math.round(per[k] / frames);
    const mean = tot / frames;
    return {
      blownPct: +(100 * mean / N).toFixed(4), pcts,
      spread: +(Math.max(...pcts) - Math.min(...pcts)).toFixed(4), per: out,
      lampShare: +(100 * ((out.LENS || 0) + (out.HOUSING || 0)) / mean).toFixed(2),
      signShare: +(100 * ((out.BLADE || 0) + (out.SIGN || 0)) / mean).toFixed(2),
    };
  }

  // Blown in a majority of `frames` — the grade reseeds its grain per render, so
  // a single frame's mask is 86.8%-of-pixels noisy and a blob taken off one is
  // not reproducible.
  function majorityMask(pose, frames = 5) {
    const cnt = new Uint8Array(N);
    for (let f = 0; f < frames; f++) {
      renderPose(pose); const d = readCanvas();
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        if ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255 >= 0.98) cnt[p]++;
      }
    }
    const need = Math.floor(frames / 2) + 1; const m = new Uint8Array(N);
    for (let p = 0; p < N; p++) if (cnt[p] >= need) m[p] = 1;
    return m;
  }

  // 8-connected components, largest first, each labelled with the class that
  // owns most of it. `purity` is that class's share — a blob at purity 1.000 is
  // one surface, not a merger.
  function blobs(mask, cm) {
    const lab = new Int32Array(N).fill(-1), st = new Int32Array(N), out = [];
    for (let s = 0; s < N; s++) {
      if (!mask[s] || lab[s] >= 0) continue;
      const id = out.length; let sp = 0; st[sp++] = s; lab[s] = id;
      let n = 0, sx = 0, sy = 0, x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; const c = {};
      while (sp > 0) {
        const p = st[--sp], y = (p / W) | 0, x = p - y * W;
        n++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        c[cm[p]] = (c[cm[p]] || 0) + 1;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
          const q = ny * W + nx; if (mask[q] && lab[q] < 0) { lab[q] = id; st[sp++] = q; }
        }
      }
      let bk = 0, bv = -1; for (const k in c) if (c[k] > bv) { bv = c[k]; bk = +k; }
      out.push({ n, cx: +(sx / n).toFixed(1), cy: +(sy / n).toFixed(1), cyN: +(sy / n / H).toFixed(3),
        bbox: [x0, y0, x1, y1], cls: CLASSES[bk], purity: +(bv / n).toFixed(3) });
    }
    out.sort((a, b) => b.n - a.n);
    return out;
  }

  // Trap 4: the shipped roll band's own contribution, sampled across one full
  // 25 s period. Returns what a player actually sees, which is the cycle mean
  // and range, not the value at whatever phase you happened to capture.
  function rollCycle(pose, samples = 25, step = 1.0) {
    const s = [];
    for (let k = 0; k < samples; k++) {
      renderPose(pose); const d = readCanvas(); let n = 0;
      for (let i = 0; i < d.length; i += 4) if ((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255 >= 0.98) n++;
      s.push(+(100 * n / N).toFixed(4));
      const reps = Math.round(step / 0.1);          // renderFloor clamps dt to 0.1
      for (let i = 0; i < reps; i++) { setPose(pose); cctv.renderFloor(0.1, grabCam()); }
    }
    return { series: s, min: Math.min(...s), max: Math.max(...s),
      mean: +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(4) };
  }

  // THE CHECK THE BLOOM THRESHOLD DEPENDS ON, CALLABLE. See the ROUND 12 block
  // in cctv.js: uBloomThr must sit ABOVE the brightest flat printed white in the
  // store and BELOW the troffer lens's working range. Both sides are properties
  // of store.js, which another agent owns and edits every round, so this returns
  // the live margin rather than a number somebody wrote down once.
  function bloomSeparation(pose) {
    const cm = classMap(pose).pin;
    renderPose(pose);
    const r = cctv.probeFloorRaw();               // linear, bottom-left origin, ss scale
    const acc = {};
    for (let by = 0; by < r.h; by++) {
      for (let bx = 0; bx < r.w; bx++) {
        const px = Math.min(W - 1, Math.floor(bx / r.ss));
        const py = Math.min(H - 1, Math.floor((r.h - 1 - by) / r.ss));
        const k = CLASSES[cm[py * W + px]];
        const i = (by * r.w + bx) * 4;
        (acc[k] || (acc[k] = [])).push(0.2126 * r.data[i] + 0.7152 * r.data[i + 1] + 0.0722 * r.data[i + 2]);
      }
    }
    const thr = cctv.params.floor.bloomThr;
    const st = {};
    for (const k in acc) {
      const a = Float64Array.from(acc[k]); a.sort();
      const q = (f) => +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(4);
      // ROUND 13: `clears` is the fraction of the class that actually enters the
      // selector. Quantiles alone hid the inversion — at z = -16 BLADE p99 and
      // LENS p90 are both near 1.2, which reads as "close", while the shares
      // clearing 1.27 are 2.93% and 2.39%, i.e. the lamp is LESS likely to bloom
      // than the card. The ratio of these two is the thing being bought.
      let c = 0; for (let i = 0; i < a.length; i++) if (a[i] >= thr) c++;
      st[k] = { n: a.length, p50: q(0.5), p90: q(0.9), p99: q(0.99),
        max: +a[a.length - 1].toFixed(4), clears: +(100 * c / a.length).toFixed(4) };
    }
    // ROUND 14 — WHAT THIS FUNCTION ASKS IS NO LONGER WHAT THE SHADER ASKS.
    // The shipped selector is TWO terms (luma AND a warm cut) and everything
    // below is the luma half alone, so `separable` answers a question the build
    // stopped asking. It is kept, because the luma half is still a real
    // property and because the round-13 table is stated in it — but it is
    // labelled, and the two-term share is returned next to it so nobody reads a
    // false negative off the old column. This is the same staleness the file
    // keeps catching: a check that goes on returning a number after the thing
    // it guards has changed shape.
    const warmCut = cctv.params.floor.bloomWarm != null ? cctv.params.floor.bloomWarm : 9.0;
    const v = verdict(st, thr);
    return { thr, warmCut, stat: st, ...v,
      separableNote: 'separable/selectivity are the LUMA-ONLY verdict. The shipped '
        + 'gate is two-term; call warmStat()/warmSweep() for the gate that runs.' };
  }

  // ROUND 13. The two margins above are the same question asked twice, and the
  // question they do NOT ask is whether ANY threshold works at this pose. That
  // is decidable: a scalar threshold separates the two populations only if the
  // interval [printed p99, lens p90] is non-empty. At aisle 3, z = -16 it is
  // EMPTY — printed p99 1.3135 sits ABOVE lens p90 1.0640 — so the round-12
  // number was not merely mis-chosen there, no number exists. `separable`
  // reports that directly instead of leaving it to be inferred from two signs.
  function verdict(st, thr) {
    const B = st.BLADE, L = st.LENS;
    const lo = B ? B.p99 : null, hi = L ? L.p90 : null;
    return {
      printedP99: lo, lensP90: hi,
      printedClearsPct: B ? B.clears : null, lensClearsPct: L ? L.clears : null,
      // the lever the whole term exists for: how much likelier a lamp texel is
      // to enter the selector than a printed one. Below 1 the bloom is
      // preferentially bleeding printed card.
      selectivity: (B && L && B.clears > 0) ? +(L.clears / B.clears).toFixed(2) : null,
      marginBelowLensP90: hi != null ? +(hi - thr).toFixed(4) : null,
      marginAbovePrintedP99: lo != null ? +(thr - lo).toFixed(4) : null,
      separable: (lo == null || hi == null) ? null : lo < hi,
      window: (lo == null || hi == null) ? null : [lo, hi],
    };
  }

  // ROUND 13 — SWEEP THE AXIS THE THRESHOLD IS USED ON, NOT THE ONE THAT IS
  // CONVENIENT. Round 12 chose bloomThr 1.27 from four poses that all sat at
  // z = -11.6 and validated it across AISLE. Selectivity is a function of
  // DISTANCE, because signMat's fresnel glare grows as a blade turns edge-on:
  // over the reachable band the same constant reads 156x at z = -6 and 0.82x —
  // inverted — at z = -16, and there are four poses in the band where no scalar
  // threshold separates at all. THE CAMERA REALLY GOES THERE: chaseCam is
  // height 2.36, dist 5.55 behind the cop and clamps at z = -18.9 against the
  // front wall, so walking one aisle end to end sweeps the lens continuously
  // through z = -18.9 .. +9.5 and the player crosses the inverted band every
  // time they step onto the floor.
  const AISLE_Z = [-18.9, -18, -17, -16, -15, -14, -13, -11.6, -10, -8, -6, -4, -2, 0, 4, 9];
  function sweepDistance(aisleIdx = 2, zs = AISLE_Z) {
    return zs.map((z) => {
      const p = poseFor('a' + (aisleIdx + 1) + 'z' + z, aisleIdx, z);
      const s = bloomSeparation(p);
      return { z, thr: s.thr, bladeN: s.stat.BLADE ? s.stat.BLADE.n : 0,
        lensN: s.stat.LENS ? s.stat.LENS.n : 0,
        printedP99: s.printedP99, lensP90: s.lensP90,
        printedClearsPct: s.printedClearsPct, lensClearsPct: s.lensClearsPct,
        selectivity: s.selectivity, separable: s.separable };
    });
  }

  // ROUND 13 — THE INVARIANT THAT REPLACED THE CONSTANT, AND IT IS CHECKABLE.
  // The round-12 defect was never really the threshold's value. It was that on
  // a source flat over the 5.2 px kernel every tap equals the centre, the
  // kernel degenerates to the identity and `col += uBloom * s * col` becomes a
  // pure multiply of the surface by (1 + uBloom*s) — so ANY surface that gets
  // over the line gets multiplied, and a fresnel glare can put a printed sign
  // over any line you pick. Section 3b now subtracts what the pixel would
  // contribute to its own neighbourhood, so on a locally flat source the term
  // is zero identically, at any brightness.
  //
  // This measures that claim on the shipped build rather than asserting it:
  // pixels whose eight taps sit within `eps` of the centre IN THE RAW LINEAR
  // BUFFER are locally flat, and the graded frame must not move at all between
  // bloom 0 and bloom on. Restricted to flat pixels that are INSIDE the
  // selector (raw luma >= bloomThr), because a flat pixel below the threshold
  // is trivially unchanged and would dilute the test to nothing.
  //
  // The tap offsets are the shader's 1 px and 2.6 px of DESTINATION resolution
  // scaled by ss. THE FIRST DRAFT OF THIS FUNCTION SKIPPED THE BARREL WARP, on
  // the argument that a smooth sub-31 px displacement cannot destroy local
  // flatness. That argument is true and irrelevant: it is not the flatness that
  // moves, it is WHICH raw texel the graded pixel sampled, by up to 31 px. The
  // broken draft reported the local kernel lifting a flat blade by +0.062 and
  // the round-12 kernel by +0.056 — indistinguishable, and contradicted by a
  // blown-pixel A/B on the same two builds that read 3160 against 2444. That is
  // trap 3 in this file's own header, walked into by the person who wrote it.
  // Every screen pixel goes through cctv.unwarpFloor, the one JS definition.
  function flatGain(pose, eps = 0.01) {
    const cm = classMap(pose).warped;
    const p = cctv.params.floor, b0 = p.bloom, thr = p.bloomThr;
    renderPose(pose);
    const r = cctv.probeFloorRaw(), ss = r.ss;
    const rl = (bx, by) => {
      const x = Math.max(0, Math.min(r.w - 1, bx)), y = Math.max(0, Math.min(r.h - 1, by));
      const i = (y * r.w + x) * 4;
      return 0.2126 * r.data[i] + 0.7152 * r.data[i + 1] + 0.0722 * r.data[i + 2];
    };
    const o1 = Math.round(ss), o2 = Math.round(2.6 * ss);
    const flat = [];
    for (let y = 4; y < H - 4; y++) {
      for (let x = 4; x < W - 4; x++) {
        const s = cctv.unwarpFloor({ x: x + 0.5, y: y + 0.5 });
        if (s.x < 4 || s.x >= W - 4 || s.y < 4 || s.y >= H - 4) continue;
        const bx = Math.min(r.w - 1, Math.round(s.x * ss));
        const by = Math.min(r.h - 1, Math.round((H - s.y) * ss));
        const c = rl(bx, by); if (c < thr) continue;
        let lo = c, hi = c;
        for (const [dx, dy] of [[o1, 0], [-o1, 0], [0, o1], [0, -o1],
          [o2, o2], [-o2, o2], [o2, -o2], [-o2, -o2]]) {
          const v = rl(bx + dx, by + dy); if (v < lo) lo = v; if (v > hi) hi = v;
        }
        if (hi - lo <= eps) flat.push(y * W + x);
      }
    }
    const lum = (d, q) => (0.2126 * d[q * 4] + 0.7152 * d[q * 4 + 1] + 0.0722 * d[q * 4 + 2]) / 255;
    cctv.setParams('floor', { bloom: 0 });
    renderPose(pose); const dOff = readCanvas();
    cctv.setParams('floor', { bloom: b0 });
    renderPose(pose); const dOn = readCanvas();
    const per = {};
    let worst = 0, worstCls = null, sum = 0;
    for (const q of flat) {
      const d = lum(dOn, q) - lum(dOff, q);
      const k = CLASSES[cm[q]];
      const a = per[k] || (per[k] = { n: 0, sum: 0, max: 0 });
      a.n++; a.sum += d; if (Math.abs(d) > a.max) a.max = Math.abs(d);
      sum += Math.abs(d);
      if (Math.abs(d) > worst) { worst = Math.abs(d); worstCls = k; }
    }
    const out = {};
    for (const k in per) out[k] = { n: per[k].n, meanLift: +(per[k].sum / per[k].n).toFixed(5), maxAbs: +per[k].max.toFixed(5) };
    // The grain reseeds every render, so two bloom-0 frames of the same pose do
    // not agree either. GRAIN is that floor, measured the same way, and the
    // verdict is the flat lift against it — not against zero.
    cctv.setParams('floor', { bloom: 0 });
    renderPose(pose); const dA = readCanvas(); renderPose(pose); const dB = readCanvas();
    cctv.setParams('floor', { bloom: b0 });
    let gsum = 0; for (const q of flat) gsum += Math.abs(lum(dA, q) - lum(dB, q));
    const grain = flat.length ? gsum / flat.length : 0;
    return { nFlat: flat.length, thr, bloom: b0,
      bloomLocal: cctv.params.floor.bloomLocal != null ? cctv.params.floor.bloomLocal : 1,
      meanAbsLift: +(flat.length ? sum / flat.length : 0).toFixed(5),
      grainFloor: +grain.toFixed(5), worst: +worst.toFixed(5), worstCls, per: out };
  }

  // =========================================================================
  // ROUND 14 — THE SECOND AXIS. WHEN LUMA CANNOT SEPARATE, ENUMERATE THE
  // CHANNELS YOU ALREADY HAVE.
  // =========================================================================
  // Round 13 proved no scalar LUMA threshold separates lamp from printed card
  // at four poses in the reachable band, and then wrote down a stronger claim
  // than it had measured: "no luminance-domain selector of any shape can
  // separate them". The selector reads only luma, from a buffer where R and B
  // are already in the same register. (R-B)/L is a colour temperature, costs
  // ZERO extra texture fetches, and it separates the two populations at every
  // pose in the band.
  //
  // THE PHYSICS, WHICH IS ROUND 13'S OWN ARGUMENT ON A SECOND AXIS. An emitter
  // shows its own spectrum. A reflector shows lamp spectrum times albedo, so it
  // cannot be COOLER than the light that lit it. A fresnel glare can fake
  // amplitude and it cannot fake a gradient; it also cannot fake a colour
  // temperature below its source.
  //
  // AND THE HONEST LIMIT OF THAT SENTENCE, MEASURED NOT ASSUMED: the gate does
  // NOT test emitter-versus-reflector. It tests "as cool as, or cooler than,
  // the illuminant". A blue-PIGMENTED surface reflects less red than blue and
  // is genuinely cooler than the lamp that lit it, so a bright enough one would
  // pass. warmStat() prints EVERY class that clears either gate for exactly
  // that reason — do not read only the two rows the argument is about.
  //
  // lthr / cthr default to the live preset. Returns, per class: the luma
  // profile, the chroma profile OF THE PIXELS INSIDE THE LUMA GATE, and the
  // share of the class clearing the shipped one-term gate against the share
  // clearing the two-term gate.
  function warmStat(pose, lthr = null, cthr = null) {
    const fp = cctv.params.floor;
    const LT = lthr != null ? lthr : fp.bloomThr;
    const CT = cthr != null ? cthr : (fp.bloomWarm != null ? fp.bloomWarm : 9.0);
    const cm = classMap(pose).pin;
    renderPose(pose);
    const r = cctv.probeFloorRaw();
    const acc = {};
    for (let by = 0; by < r.h; by++) {
      for (let bx = 0; bx < r.w; bx++) {
        const px = Math.min(W - 1, Math.floor(bx / r.ss));
        const py = Math.min(H - 1, Math.floor((r.h - 1 - by) / r.ss));
        const k = CLASSES[cm[py * W + px]];
        const i = (by * r.w + bx) * 4;
        const R0 = r.data[i], G0 = r.data[i + 1], B0 = r.data[i + 2];
        const L = 0.2126 * R0 + 0.7152 * G0 + 0.0722 * B0;
        (acc[k] || (acc[k] = [])).push([L, (R0 - B0) / Math.max(L, 1e-4)]);
      }
    }
    const st = {};
    for (const k in acc) {
      const a = acc[k];
      const Ls = Float64Array.from(a.map((v) => v[0])); Ls.sort();
      const inSel = a.filter((v) => v[0] >= LT);
      const cs = Float64Array.from(inSel.map((v) => v[1])); cs.sort();
      const q = (arr, f) => (arr.length ? +arr[Math.min(arr.length - 1, Math.floor(f * arr.length))].toFixed(4) : null);
      let one = 0, two = 0;
      for (const v of a) {
        if (v[0] >= fp.bloomThr) one++;
        if (v[0] >= LT && v[1] < CT) two++;
      }
      st[k] = { n: a.length, Lp90: q(Ls, 0.9), Lp99: q(Ls, 0.99), Lmax: +Ls[Ls.length - 1].toFixed(4),
        selN: inSel.length,
        // cMin is the statistic the gate actually rests on. p01 is quoted in the
        // report because it is stable; the CLAIM is about the minimum, because a
        // hard cut admits every texel below it and one texel is enough to lose
        // the word "zero".
        cMin: inSel.length ? +cs[0].toFixed(4) : null,
        cP01: q(cs, 0.01), cP50: q(cs, 0.5), cP99: q(cs, 0.99),
        oneTermPct: +(100 * one / a.length).toFixed(4),
        twoTermPct: +(100 * two / a.length).toFixed(4) };
    }
    return { lumaThr: LT, warmCut: CT, stat: st };
  }

  // The same question over the band the camera can reach, which is the axis
  // round 12 failed to sweep and round 13 found the inversion on. Only the rows
  // that clear something are returned; a class with nothing in the selector has
  // nothing to say about a selector.
  function warmSweep(aisleIdx = 2, zs = AISLE_Z, lthr = null, cthr = null) {
    return zs.map((z) => {
      const p = poseFor('a' + (aisleIdx + 1) + 'z' + z, aisleIdx, z);
      const w = warmStat(p, lthr, cthr);
      const cls = {};
      for (const k in w.stat) {
        const v = w.stat[k];
        if (v.oneTermPct > 0 || v.twoTermPct > 0) {
          cls[k] = { n: v.n, cMin: v.cMin, cP50: v.cP50, one: v.oneTermPct, two: v.twoTermPct };
        }
      }
      return { z, lumaThr: w.lumaThr, warmCut: w.warmCut, cls };
    });
  }

  // ---- THE COUPLING, MADE EXPLICIT ----------------------------------------
  // The warm cut is a statement about THIS STORE'S ILLUMINANT, and the
  // illuminant is not in this file. src/store.js hands src/store/light.js a
  // lampCol, light.js keeps it in the shared uniform bag, and store.js
  // publishes that bag at scene.userData.chopField.uniforms — so the live value
  // is READABLE and there is no reason for this file to carry a copy of it.
  //
  // Note what a copy would have cost already: light.js DEFAULTS to 0xfff6ea and
  // store.js passes 0xfff4e4, so the number quoted in the round-13 critique is
  // the default and not the value in the building. A constant transcribed into
  // this file would have been wrong the day it was written.
  //
  // The reflector floor is derived, not typed: a perfectly white lambertian
  // surface lit only by this lamp reads back the lamp's own (R-B)/L. Nothing
  // reflective can sit below that except by being pigmented COOLER than the
  // lamp, which is a real hole and is why this reports the measured BLADE
  // minimum next to the theoretical floor rather than instead of it.
  //
  // THIS THROWS. An assertion that returns a number is an assertion nobody
  // reads — see the round-12 exactness audit that read 54% for a year while
  // being right. If a store round warms or cools the lamps past the cut, the
  // next person to call this gets an exception naming both numbers.
  function lampWarm(pose = POSES[1]) {
    const cf = scene.userData.chopField;
    if (!cf || !cf.uniforms || !cf.uniforms.uLampCol) {
      throw new Error('[probe] scene.userData.chopField.uniforms.uLampCol is gone — '
        + 'store.js moved the lamp colour. The warm cut is calibrated against it; '
        + 'find where it lives now rather than hardcoding one here.');
    }
    const c = cf.uniforms.uLampCol.value;          // THREE.Color, linear working space
    const L = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const lampWarmth = (c.r - c.b) / Math.max(L, 1e-4);
    const cut = cctv.params.floor.bloomWarm != null ? cctv.params.floor.bloomWarm : 9.0;
    // THE OFF SENTINEL IS NOT A FAILURE. bloomWarm >= 1.0 cannot be reached by
    // any real surface, which is what makes it the ablation lever; a check that
    // threw there would cry wolf on every A/B control run. It still reports the
    // live illuminant, because knowing what the cut WOULD have to clear is the
    // reason to call this with the gate off.
    const enabled = cut < 1.0;
    const w = warmStat(pose);
    const B = w.stat.BLADE, LN = w.stat.LENS;
    const out = {
      lampLinear: [+c.r.toFixed(4), +c.g.toFixed(4), +c.b.toFixed(4)],
      lampHexApprox: '#' + [c.r, c.g, c.b].map((v) => Math.round(255 * Math.pow(Math.max(0, Math.min(1, v)), 1 / 2.2)).toString(16).padStart(2, '0')).join(''),
      lampWarmth: +lampWarmth.toFixed(4),
      warmCut: cut,
      // how far under the illuminant the cut sits. A white reflector cannot get
      // below lampWarmth, so this is the design margin.
      marginBelowIlluminant: +(lampWarmth - cut).toFixed(4),
      pose: pose.name, enabled,
      bladeSelN: B ? B.selN : 0, bladeCMin: B ? B.cMin : null,
      lensSelN: LN ? LN.selN : 0, lensCP50: LN ? LN.cP50 : null,
      marginBelowMeasuredBlade: (B && B.cMin != null) ? +(B.cMin - cut).toFixed(4) : null,
    };
    if (enabled && out.marginBelowIlluminant <= 0) {
      throw new Error('[probe] THE WARM CUT IS AT OR ABOVE THIS STORE\'S ILLUMINANT. '
        + 'lamp (R-B)/L = ' + out.lampWarmth + ', bloomWarm = ' + cut + '. Every white '
        + 'surface in the building now enters the bloom selector, which is the '
        + 'round-11 defect with a different name. Move bloomWarm, or find out why '
        + 'the lamps changed colour.');
    }
    if (enabled && out.bladeCMin != null && out.marginBelowMeasuredBlade <= 0) {
      throw new Error('[probe] PRINTED CARD IS INSIDE THE WARM CUT at ' + pose.name
        + ': BLADE minimum (R-B)/L in the luma gate is ' + out.bladeCMin
        + ' against bloomWarm ' + cut + '. Something in the store is now printing '
        + 'cool white, or the lamps cooled. Re-run warmSweep() before changing the cut.');
    }
    return out;
  }

  // ---- THE RENDERED CONSEQUENCE, NOT THE PREDICTED ONE ---------------------
  // Everything above is raw-domain arithmetic: it says what the SELECTOR does.
  // It does not say what the picture does, and the round-13 critique was
  // explicit that it had not edited the shader. This toggles the live uniform
  // on ONE page load, byte-identical scene, and reads blown pixels off the
  // graded canvas both ways.
  //
  // roll is ablated here and restored on exit — THE ROLL TRAP is not optional
  // on a graded A/B and leaving it to the caller is how round 12 lost a
  // measurement. Grain is deliberately NOT ablated: the blown statistic the
  // r12 and r13 tables publish includes it, and the mask is majority-of-N for
  // exactly that reason.
  // ONE A/B, THREE CALLERS. Every graded comparison on this view has the same
  // three obligations -- ablate roll (THE ROLL TRAP), majority-filter the mask
  // (the grain reseeds per render), and restore every uniform it touched -- and
  // the round-13 file had them copy-pasted per experiment. This is the single
  // owner; warmAB and bloomOffBlobs are two calls to it with different patches.
  //
  // Grain is deliberately NOT ablated: the blown statistic the r12 and r13
  // tables publish includes it, and the mask is majority-of-N for that reason.
  // Roll IS, because a 25 s band under a 0.2 s control is the trap this project
  // has lost two measurements to.
  function gradeAB(pose, patchA, patchB, frames = 5) {
    const fp = cctv.params.floor;
    const keys = new Set([...Object.keys(patchA || {}), ...Object.keys(patchB || {}), 'roll']);
    const save = {}; for (const k of keys) save[k] = fp[k];
    const cm = classMap(pose).warped;
    const shot = () => {
      const m = majorityMask(pose, frames);
      const per = {}; let tot = 0;
      for (let q = 0; q < N; q++) if (m[q]) { tot++; const k = CLASSES[cm[q]]; per[k] = (per[k] || 0) + 1; }
      const bl = blobs(m, cm);
      // BOTH SUMMARIES, ALWAYS. "Largest blob" and "largest class" are two
      // defensible reductions of the same pixels and they DISAGREE at z = -17,
      // where one edge-on blade is a single long sliver and a distant troffer
      // row is many small ones. Publishing only the one that agrees with you is
      // the round-13 centroid-y mistake wearing a different proxy.
      let topCls = null, topN = -1;
      for (const k in per) if (per[k] > topN) { topN = per[k]; topCls = k; }
      const lamp = (per.LENS || 0) + (per.HOUSING || 0), sign = (per.BLADE || 0) + (per.SIGN || 0);
      return { blownPct: +(100 * tot / N).toFixed(4), blown: tot, per,
        lampShare: tot ? +(100 * lamp / tot).toFixed(2) : null,
        signShare: tot ? +(100 * sign / tot).toFixed(2) : null,
        largestBlob: bl.length ? { n: bl[0].n, cls: bl[0].cls, cyN: bl[0].cyN, purity: bl[0].purity } : null,
        largestClass: { cls: topCls, n: topN },
        top3: bl.slice(0, 3).map((b) => ({ n: b.n, cls: b.cls, cyN: b.cyN })) };
    };
    let a, b;
    try {
      cctv.setParams('floor', { roll: 0 });
      cctv.setParams('floor', patchA || {}); a = shot();
      cctv.setParams('floor', save);
      cctv.setParams('floor', { roll: 0 });
      cctv.setParams('floor', patchB || {}); b = shot();
    } finally { cctv.setParams('floor', save); }
    return { pose: pose.name, frames, a, b };
  }

  // ---- THE RENDERED CONSEQUENCE, NOT THE PREDICTED ONE ---------------------
  // warmStat above is raw-domain arithmetic: it says what the SELECTOR does.
  // It does not say what the PICTURE does, and those are not the same claim --
  // measured, the two-term gate more than doubles the share of LENS entering
  // the selector at z = -16 and changes the blown lamp pixels there from 11 to
  // 9, because a troffer at p90 1.06 has nothing to give a halo no matter how
  // sure the selector is about it. Anyone quoting a clears% as if it were a
  // result is quoting the wrong domain. This one toggles the live uniform on
  // ONE page load, byte-identical scene, and reads the canvas both ways.
  function warmAB(pose, frames = 5, cut = null) {
    const fp = cctv.params.floor;
    const CUT = cut != null ? cut : (fp.bloomWarm != null ? fp.bloomWarm : 9.0);
    const r = gradeAB(pose, { bloomWarm: 9.0 }, { bloomWarm: CUT }, frames);
    return { pose: r.pose, cut: CUT, frames, off: r.a, on: r.b };
  }

  // THE STRUCTURAL LIMIT, PROVED BY ABLATING TO ZERO RATHER THAN BY COMPARING
  // POPULATIONS. Round 13 argued that the blade wins at z -17/-16/-2 because
  // the troffers are dimmer in the raw buffer than the numeral. That is true
  // and it is not the proof: with the bloom switched OFF ENTIRELY the blade is
  // already the largest blown blob at those poses, so no bloom-side selector of
  // any shape can flip a class the bloom is not producing. One measurement, no
  // comparison, and it lands the fix in the same place.
  function bloomOffBlobs(pose, frames = 5) {
    const r = gradeAB(pose, { bloom: 0 }, {}, frames);
    return { pose: r.pose, bloomOff: r.a, bloomOn: r.b };
  }


  // ROUND 14 — flatGain SELECTS 22-26 PIXELS ON A SHIPPED BUILD, AND A SIGNED
  // MEAN OFF 26 SAMPLES IS NOT A RESULT. The population is small for a reason
  // that is not fixable by asking harder: it is the intersection of "inside the
  // luma gate" with "eight taps within eps in the raw buffer", and on this view
  // almost everything inside the gate is a small structured highlight, which is
  // the opposite of flat. So the honest form is a PROFILE over eps with n at
  // every step — AGENTS_BRIEF's own rule about extrema — and the verdict is the
  // lift against the grain floor measured on the SAME set, never against zero.
  //
  // Read it as: if the invariant were broken, widening eps would grow n and the
  // lift together, because a larger flat neighbourhood is exactly what the
  // degenerate multiply feeds on. A profile that grows n by two orders of
  // magnitude and leaves the lift under the grain is the claim.
  function flatProfile(pose, epsList = [0.005, 0.01, 0.02, 0.04, 0.08, 0.16]) {
    return epsList.map((e) => {
      const g = flatGain(pose, e);
      return { eps: e, nFlat: g.nFlat, meanAbsLift: g.meanAbsLift, grainFloor: g.grainFloor,
        liftOverGrain: g.grainFloor ? +(g.meanAbsLift / g.grainFloor).toFixed(3) : null,
        worst: g.worst, worstCls: g.worstCls,
        classes: Object.fromEntries(Object.entries(g.per).map(([k, v]) => [k, v.n])) };
    });
  }

  // ---- THE WALL, WHICH HAD NO LIVE CHECK AT ALL UNTIL NOW ------------------
  // The nine dome feeds run the SAME grade shader and the same selector as the
  // floor view, on their own preset (bloom 1.06, bloomThr 0.64), and nothing
  // has ever measured the separation there. Round 11's preset comment claims
  // "SIGN 0.0%" — a figure that predates both the round-11 kernel fix and the
  // round-12 gain change, so it describes a build that no longer exists.
  //
  // The measured reason SIGN was 0.0% is not that the wall is selective. It is
  // that LENS is ABSENT FROM ALL NINE FEEDS: the domes sit at y 2.5-3.6 and
  // look along and down the aisles, so a ceiling troffer is never in shot and
  // there is no lamp for the bloom to favour. The bloom's counterparty on this
  // view is not the lamps, it is CH09's front-door daylight.
  //
  // Method note: this does NOT rebuild the wall's render path. It swaps the
  // scene to ID materials and calls cctv.probeRaw(i) — the same function the
  // real feed reads — so the class map and the light values are the same
  // pixels by construction and cannot be misaligned. The IDs come back in
  // LINEAR working space (probeRaw's target is RGBA16F, no tone map), so the
  // key is built from the material colours themselves rather than from the
  // 8-bit palette, which is the round-12 colour-space trap one buffer over.
  function wallClassRaw(i) {
    const saveMat = [], saveVis = [], saveIC = [];
    scene.traverse((o) => {
      if (!(o.isMesh || o.isInstancedMesh)) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      if (ms.some((m) => m && m.depthWrite === false)) { saveVis.push([o, o.visible]); o.visible = false; return; }
      if (o.instanceColor) { saveIC.push([o, o.instanceColor]); o.instanceColor = null; }
      saveMat.push([o, o.material]);
      o.material = idMats[classOf(o)];
    });
    const fog = scene.fog; scene.fog = null;
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 1);
    const raw = cctv.probeRaw(i);
    renderer.setClearColor(cc, ca); scene.fog = fog;
    for (const [o, m] of saveMat) o.material = m;
    for (const [o, ic] of saveIC) o.instanceColor = ic;
    for (const [o, v] of saveVis) o.visible = v;
    const lin = idMats.map((m) => [m.color.r, m.color.g, m.color.b]);
    const n = raw.w * raw.h, cls = new Uint8Array(n);
    let off = 0;
    for (let p = 0; p < n; p++) {
      const r = raw.data[p * 4], g = raw.data[p * 4 + 1], b = raw.data[p * 4 + 2];
      let bk = -1, bd = 1e9;
      for (let k = 0; k < lin.length; k++) {
        const d = Math.abs(lin[k][0] - r) + Math.abs(lin[k][1] - g) + Math.abs(lin[k][2] - b);
        if (d < bd) { bd = d; bk = k; }
      }
      if (bd > 0.02) off++;
      cls[p] = bk;
    }
    if (off > n * 0.001) throw new Error(`[probe] wall ID render: ${off}/${n} texels off-palette on ch${i}`);
    return { cls, w: raw.w, h: raw.h, offPalette: off };
  }

  function wallSeparation(chans = null) {
    const list = chans || cctv.lineup.map((_, i) => i);
    const thr = cctv.params.wall.bloomThr;
    const rows = list.map((i) => {
      const cmap = wallClassRaw(i);
      const raw = cctv.probeRaw(i);
      const acc = {};
      for (let p = 0; p < cmap.cls.length; p++) {
        const k = CLASSES[cmap.cls[p]];
        (acc[k] || (acc[k] = [])).push(0.2126 * raw.data[p * 4] + 0.7152 * raw.data[p * 4 + 1] + 0.0722 * raw.data[p * 4 + 2]);
      }
      const st = {};
      for (const k in acc) {
        const a = Float64Array.from(acc[k]); a.sort();
        const q = (f) => +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(4);
        let c = 0; for (let j = 0; j < a.length; j++) if (a[j] >= thr) c++;
        st[k] = { n: a.length, p50: q(0.5), p90: q(0.9), p99: q(0.99),
          max: +a[a.length - 1].toFixed(4), clears: +(100 * c / a.length).toFixed(4) };
      }
      const v = verdict(st, thr);
      // ROUND 14 — THE MULTIPLY, WHICH IS WHAT bloomLocal 0 ACTUALLY DOES HERE.
      // On the old kernel a source flat over the tap radius multiplies itself by
      // (1 + uBloom * s), s being the same smoothstep the selector uses. The
      // wall keeps that bug on purpose for CH09's daylight, and the reason
      // written in cctv.js was SIZE rather than brightness — but nobody had ever
      // printed the multiply itself, so "safe" was an argument and not a number.
      // It is a number now, per class, at that class's own p90.
      const bl = cctv.params.wall.bloom;
      const mult = (L) => +(1 + bl * Math.min(1, Math.max(0, (L - thr) / 0.65)) ** 2
        * (3 - 2 * Math.min(1, Math.max(0, (L - thr) / 0.65)))).toFixed(4);
      const mults = {};
      for (const k in st) mults[k] = mult(st[k].p90);
      // ...and the class actually carrying the feed's brightest surface, by
      // measurement rather than by eye. CH09's blown daylight has been
      // attributed in this file's comments to FRONT (the storefront glazing);
      // the class map disagrees and the class map is the instrument.
      let topK = null, topMax = -1, biggestK = null, biggestN = -1;
      for (const k in st) {
        if (st[k].max > topMax) { topMax = st[k].max; topK = k; }
        if (st[k].n > biggestN) { biggestN = st[k].n; biggestK = k; }
      }
      const totalN = Object.values(st).reduce((a, b) => a + b.n, 0);
      return { ch: i, id: cctv.lineup[i].id, label: cctv.lineup[i].label,
        offPalette: cmap.offPalette, thr,
        brightestClass: topK, brightestMax: topMax,
        brightestMult: mults[topK] != null ? mults[topK] : null,
        largestClass: biggestK, largestClassPct: +(100 * biggestN / totalN).toFixed(1),
        bladeMult: st.BLADE ? mults.BLADE : null,
        mults,
        lensN: st.LENS ? st.LENS.n : 0,
        bladeN: st.BLADE ? st.BLADE.n : 0, bladeP90: st.BLADE ? st.BLADE.p90 : null,
        bladeClearsPct: st.BLADE ? st.BLADE.clears : null,
        signClearsPct: st.SIGN ? st.SIGN.clears : null,
        frontClearsPct: st.FRONT ? st.FRONT.clears : null,
        separable: v.separable, selectivity: v.selectivity, stat: st };
    });
    // THE VERDICT, STATED RATHER THAN LEFT TO THE READER. On this view the
    // lamp population is empty, so "selectivity" is undefined and the question
    // that matters is the other one: can a printed surface be MULTIPLIED here.
    // Under the round-13 kernel it cannot, whatever clears the threshold —
    // which is why this returns bloomLocal alongside the shares.
    const anyLens = rows.some((r) => r.lensN > 0);
    return { thr, bloomLocal: cctv.params.wall.bloomLocal != null ? cctv.params.wall.bloomLocal : 1,
      lensPresentOnAnyFeed: anyLens,
      worstBladeClearsPct: Math.max(...rows.map((r) => r.bladeClearsPct || 0)),
      rows };
  }

  // ---- THE NUMERAL, WHICH IS THE ONE PART OF THIS THAT IS GAMEPLAY ----------
  // The dispatch gives the player an aisle NUMBER, so the reversed-out white
  // numeral on a blade sign is the one glyph the game requires to be readable.
  // Dark type on white ("PASTA / SAUCE") survives anything; a white glyph
  // reversed out of an orange panel does not, because it is the brightest
  // printed thing in frame and it is what a bloom eats first.
  //
  // The panel is found rather than typed: the largest orange 8-connected
  // component inside the BLADE class, located on a BLOOM-0 frame so no bleed can
  // move its edges. Publishing a hand-drawn box would prove things about the box
  // (AGENTS_BRIEF), and a box that moves with the pose is not restatable.
  // ROUND 13: majority-of-N, for the same reason the glyph mask is. The box is
  // the DENOMINATOR's domain, so grain moving its edges moves nGlyph even when
  // the glyph mask itself is stable — measured 786 / 816 / 836 across three
  // calls at one pose on one build, 6%, against a 1-4% effect. Both halves have
  // to be majority-filtered or the ratio still floats.
  function numeralBox(pose, cm, frames = 5) {
    const p = cctv.params.floor, b0 = p.bloom;
    cctv.setParams('floor', { bloom: 0 });
    const cnt = new Uint8Array(N);
    for (let f = 0; f < frames; f++) {
      renderPose(pose); const d = readCanvas();
      for (let q = 0; q < N; q++) {
        if (CLASSES[cm[q]] !== 'BLADE') continue;
        const r = d[q * 4], g = d[q * 4 + 1], b = d[q * 4 + 2];
        if (r > 110 && r - g > 45 && r - b > 60) cnt[q]++;
      }
    }
    cctv.setParams('floor', { bloom: b0 });
    const need = (frames >> 1) + 1;
    const m = new Uint8Array(N);
    for (let q = 0; q < N; q++) if (cnt[q] >= need) m[q] = 1;
    const bl = blobs(m, cm);
    if (!bl.length) return null;
    const [x0, y0, x1, y1] = bl[0].bbox;
    return { box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1], n: bl[0].n };
  }

  // GLYPH AREA RATIO: the area of the numeral's white stroke against the shape
  // the sign was drawn with (its bloom-0 shape), inside that panel. 1.000 is the
  // drawn glyph; above 1 the stroke has fattened and the counters are closing.
  // MICHELSON CONTRAST IS USELESS HERE and is returned only so nobody re-derives
  // it and believes it: the bloom lifts the glyph AND the panel behind it, so the
  // ratio moves by about 0.005 while the stroke fattens 40%. It reports no defect
  // where a large one exists.
  // ROUND 13 — WHAT WAS ACTUALLY MOVING THIS NUMBER, AND IT IS NOT THE GRAIN.
  // Every earlier version frame-averaged to see through the noise and never got
  // there: majority-of-21 still left glyphArea spreading 0.033 against a
  // round-12 control band 0.076 wide, and ablating noise AND cnoise did not
  // help at all (nGlyph still read 845 / 843 / 850). The dominant term is
  // section 4b's MACROBLOCKER: it replaces step(0.66, hash) — about a third —
  // of the 8x8 blocks with their block mean, and reseeds WHICH THIRD every
  // other frame off floor(uSeed*2.0). The numeral box is ~5x15 blocks, so a
  // different five of them are flattened on every render and the glyph's pixel
  // membership is resampled, not merely noised. Averaging cannot converge that,
  // because it is not zero-mean noise on a fixed geometry.
  //
  // So the measurement ablates blocky as well as the two noises (all restored
  // on exit; roll is deliberately left alone, THE ROLL TRAP is the caller's
  // job). The question this function asks is whether the BLOOM fattens the
  // stroke, and all three of those terms are downstream of the bloom and in the
  // way of it. NOTE WHAT THIS COSTS: a legibility claim about what the PLAYER
  // sees may not be made from these numbers, because the player gets the
  // macroblocker. That is a different statistic and it needs its own function.
  function numeral(pose, cm, frames = 4) {
    const gp = cctv.params.floor;
    const s = { noise: gp.noise, cnoise: gp.cnoise, blocky: gp.blocky };
    cctv.setParams('floor', { noise: 0, cnoise: 0, blocky: 0 });
    try { return numeralInner(pose, cm, frames); }
    finally { cctv.setParams('floor', s); }
  }
  function numeralInner(pose, cm, frames = 4) {
    const nb = numeralBox(pose, cm, frames); if (!nb) return null;
    const [bx, by, bw, bh] = nb.box; const idx = [];
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) idx.push(y * W + x);
    const p = cctv.params.floor, b0 = p.bloom;
    const lum = (d, q) => (0.2126 * d[q * 4] + 0.7152 * d[q * 4 + 1] + 0.0722 * d[q * 4 + 2]) / 255;
    // ROUND 13 — THE DENOMINATOR WAS NOISIER THAN THE EFFECT IT MEASURED.
    // `glyph` used to be taken off a SINGLE bloom-0 frame. The grade reseeds its
    // grain every render, so at the 0.75 cut the membership of that set moves:
    // the same pose, same build, two runs, read nGlyph 794 then 852 — 7%, while
    // the fattening it is asked to detect is 1-4%. majorityMask()'s own argument
    // ("a blob taken off one frame is not reproducible") applies verbatim to the
    // reference shape, and this is the round-12 A/B's own instrument.
    // Majority-of-N bloom-0 frames instead: N=5 reads the same nGlyph on repeat
    // runs, and the ratio it feeds stops moving with the grain.
    cctv.setParams('floor', { bloom: 0 });
    const gc = new Uint16Array(idx.length), fc = new Uint16Array(idx.length);
    for (let f = 0; f < frames; f++) {
      renderPose(pose); const dz = readCanvas();
      for (let j = 0; j < idx.length; j++) {
        const L = lum(dz, idx[j]); if (L >= 0.75) gc[j]++; if (L <= 0.55) fc[j]++;
      }
    }
    cctv.setParams('floor', { bloom: b0 });
    const need = (frames >> 1) + 1;
    const glyph = idx.filter((q, j) => gc[j] >= need);
    const gset = new Set(glyph);
    const field = idx.filter((q, j) => fc[j] >= need);
    // A panel too small to resolve a stroke has no ratio to report. Returning a
    // number here would be the round-11 "probe that returns zeros without
    // throwing": the caller must see nGlyph, not a 1.000 it can quote.
    if (glyph.length < 24 || field.length < 24) {
      return { box: nb.box, nGlyph: glyph.length, nField: field.length,
        glyphArea: null, glyphIoU: null, tooSmall: true };
    }
    // ROUND 13 — glyphMass, and why it exists. glyphArea counts pixels over a
    // HARD 0.75 cut, and a numeral stroke at this scale is mostly soft edge, so
    // a large minority of the box sits within grain of the cut and its
    // membership is a coin flip that majority-filtering cannot settle. Measured
    // at aisle 3, three repeats per setting: glyphArea spreads 0.059 at 5
    // frames and still 0.017-0.033 at 11-21, against a round-12 control BAND of
    // 0.964-1.040 that is 0.076 wide. The instrument's own noise is a third of
    // the band it is read against. glyphMass integrates a SOFT membership
    // instead — clamp((L-0.55)/0.20) — so a pixel near the cut contributes
    // proportionally rather than flipping, and nothing is thresholded twice.
    const soft = (L) => (L <= 0.55 ? 0 : L >= 0.75 ? 1 : (L - 0.55) / 0.20);
    let mOff = 0;
    cctv.setParams('floor', { bloom: 0 });
    for (let f = 0; f < frames; f++) {
      renderPose(pose); const dz = readCanvas();
      for (const q of idx) mOff += soft(lum(dz, q));
    }
    cctv.setParams('floor', { bloom: b0 });
    let grow = 0, inter = 0, uni = 0, gs = 0, fs = 0, mOn = 0;
    for (let f = 0; f < frames; f++) {
      renderPose(pose); const d = readCanvas();
      for (const q of idx) {
        const L = lum(d, q); const hot = L >= 0.75, was = gset.has(q);
        if (hot) grow++; if (hot && was) inter++; if (hot || was) uni++;
        mOn += soft(L);
      }
      for (const q of glyph) gs += lum(d, q);
      for (const q of field) fs += lum(d, q);
    }
    const g = gs / frames / glyph.length, fl = fs / frames / field.length;
    return { box: nb.box, nGlyph: glyph.length, nField: field.length,
      glyphMass: +(mOn / mOff).toFixed(3),
      glyphArea: +(grow / frames / glyph.length).toFixed(3),
      glyphIoU: +(inter / uni).toFixed(3),
      glyphY: +g.toFixed(4), fieldY: +fl.toFixed(4),
      michelson: +((g - fl) / (g + fl)).toFixed(4) };
  }

  return { POSES, CLASSES, PALETTE, setPose, renderPose, classOf, classMap, gradedY,
    alignShift, measure, majorityMask, blobs, rollCycle, bloomSeparation,
    sweepDistance, flatGain, wallClassRaw, wallSeparation,
    warmStat, warmSweep, lampWarm, gradeAB, warmAB, bloomOffBlobs, poseFor, AISLE_Z,
    flatProfile,
    numeralBox, numeral, get cam() { return grabCam(); } };
}
