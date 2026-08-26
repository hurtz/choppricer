// builder-cctv r11 measurement harness. NOT part of the game — nothing in src/
// imports this. Loaded by eval from the agent tab after every reload:
//     await fetch('/shots/_probe_r11.js').then(r=>r.text()).then(eval)
// then everything hangs off window.P.
(function () {
  const C = window.__CHOP, c = C.cctv;
  const R = C.renderer.domElement;
  const THREE = C.THREE;

  // ---- the floor camera, taken without touching main.js --------------------
  // renderFloor's 2nd argument IS floorCam. Intercept one call, put it back.
  // INSTRUMENT VALIDATION: step(0) only reaches renderFloor when the game is in
  // floor mode. Grabbing it from the desk returns null, silently, and then
  // coverage() renders through `null` while hdr() cheerfully reads a STALE
  // floorRaw left over from something else — a plausible non-null answer to a
  // question that was never asked. So: force floor mode, then insist.
  let floorCam = null;
  (function grabCam() {
    const wasDesk = C.game.mode === 'desk';
    if (wasDesk) C.game.enterFloor(1);
    const real = c.renderFloor.bind(c);
    c.renderFloor = function (dt, cam) { floorCam = cam; return real(dt, cam); };
    C.step(0);
    c.renderFloor = real;
    if (wasDesk) C.game.enterDesk();
    if (!floorCam || !floorCam.isCamera) {
      throw new Error('[probe r11] floorCam intercept returned '
        + floorCam + ' — every map below would have been measured on the wrong '
        + 'buffer. Refusing to hand back a probe that cannot work.');
    }
  })();

  const off = document.createElement('canvas');
  off.width = R.width; off.height = R.height;
  const cx = off.getContext('2d', { willReadFrequently: true });
  // sRGB-DOMAIN 709 luma of an 8-bit canvas pixel. Stated because AGENTS_BRIEF
  // says a luma threshold without its colour space is three different numbers.
  const Y8 = (d, k) => (d[k] * 0.2126 + d[k + 1] * 0.7152 + d[k + 2] * 0.0722) / 255;
  const BLOWN = 0.98;                     // same threshold rounds 9/10 published

  function canvas() {
    C.step(0);
    cx.clearRect(0, 0, off.width, off.height);
    cx.drawImage(R, 0, 0);
    return cx.getImageData(0, 0, off.width, off.height);
  }

  // ---- a repeatable floor pose ---------------------------------------------
  // Deterministic: enterFloor, park the cop on the aisle centreline, zero the
  // camera yaw, then settle with fixed-dt steps. Same bytes every reload.
  function pose(opts = {}) {
    const aisle = opts.aisle ?? 3;
    C.pause();
    C.game.enterFloor(aisle);
    if (opts.pos) C.agents.cop.position.set(opts.pos[0], C.agents.cop.position.y, opts.pos[2]);
    C.chaseCam.yaw = opts.yaw ?? 0;
    if ('moveYaw' in C.chaseCam) C.chaseCam.moveYaw = opts.yaw ?? 0;
    for (let k = 0; k < 90; k++) C.step(1 / 60);
    return { mode: C.game.mode, cop: C.agents.cop.position.toArray().map(v => +v.toFixed(2)) };
  }

  // ---- masks ----------------------------------------------------------------
  // A class map is built by VISIBILITY, never by mutating a material. Round 8's
  // note: `m.map = null` drops USE_MAP, recompiles the shader and can return two
  // byte-identical PNGs including the "restored" one. Toggling .visible cannot
  // do that. The mask is rendered PINHOLE (no grade), so it is in the same space
  // as unwarpFloor's output and NOT in canvas space — see classify().
  const maskRT = new THREE.WebGLRenderTarget(R.width, R.height, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    type: THREE.UnsignedByteType, depthBuffer: true,
  });
  function coverage(keep) {
    // keep(mesh) -> true for "this mesh IS the class".
    //
    // FIRST VERSION OF THIS HID THE OTHER MESHES AND IT WAS WRONG. Hiding the
    // occluders removes their depth too, so every shelf tag on the far side of
    // a gondola rendered straight through it and `SIGN` came back as 31.9% of
    // the frame — a confident answer to the question "what would be signage if
    // the store were transparent". What is wanted is "what does the CAMERA see",
    // which needs the occluders' depth and not their colour. So: colorWrite off
    // everywhere, on for the class. That is a gl.colorMask state change, not a
    // shader define, so unlike `m.map = null` it cannot recompile anything.
    //
    // Two passes, and a CONFLICT COUNT. A material shared between a class mesh
    // and a non-class mesh cannot be masked by this method, and would leak the
    // non-class mesh into the class silently — so it is counted and returned
    // rather than assumed not to happen.
    const saved = new Map(), inClass = new Set(), outClass = new Set();
    const mats = (n) => (Array.isArray(n.material) ? n.material : [n.material]).filter(Boolean);
    C.scene.traverse((n) => {
      if (!(n.isMesh || n.isInstancedMesh) || !n.visible) return;
      const on = !!keep(n);
      for (const m of mats(n)) {
        if (!saved.has(m)) saved.set(m, m.colorWrite);
        (on ? inClass : outClass).add(m);
      }
    });
    for (const m of saved.keys()) m.colorWrite = false;
    for (const m of inClass) m.colorWrite = true;
    let conflicts = 0;
    for (const m of inClass) if (outClass.has(m)) conflicts++;
    const hid = [];
    const oldBg = C.scene.background, oldClear = C.renderer.getClearColor(new THREE.Color()).getHex();
    const oldAlpha = C.renderer.getClearAlpha();
    C.scene.background = null;
    C.renderer.setClearColor(0x000000, 0);
    const auto = C.renderer.autoClear; C.renderer.autoClear = true;
    C.renderer.setRenderTarget(maskRT);
    C.renderer.render(C.scene, floorCam);
    const buf = new Uint8Array(R.width * R.height * 4);
    C.renderer.readRenderTargetPixels(maskRT, 0, 0, R.width, R.height, buf);
    C.renderer.setRenderTarget(null);
    C.renderer.autoClear = auto;
    C.scene.background = oldBg;
    C.renderer.setClearColor(oldClear, oldAlpha);
    hid.forEach((n) => { n.visible = true; });
    for (const [m, v] of saved) m.colorWrite = v;      // PROVE THE RESTORE: see restoreCheck()
    // GL read-back is BOTTOM-LEFT origin; flip to top-left to match the canvas.
    const m = new Uint8Array(R.width * R.height);
    for (let y = 0; y < R.height; y++) {
      const sy = R.height - 1 - y;
      for (let x = 0; x < R.width; x++) m[y * R.width + x] = buf[(sy * R.width + x) * 4 + 3] > 8 ? 1 : 0;
    }
    m.conflicts = conflicts;
    return m;
  }

  // ---- HDR floor buffer, in canvas coordinates ------------------------------
  // probeFloorRaw is FLOOR_SS (1.5x) and bottom-left; resample to 1280x720
  // top-left so it indexes the same way every other map here does.
  function hdr() {
    C.step(0);
    const p = c.probeFloorRaw();
    const W = R.width, H = R.height;
    const out = new Float32Array(W * H * 3);
    for (let y = 0; y < H; y++) {
      const by = Math.min(p.h - 1, Math.round((H - 1 - y + 0.5) * p.ss));
      for (let x = 0; x < W; x++) {
        const bx = Math.min(p.w - 1, Math.round((x + 0.5) * p.ss));
        const k = (by * p.w + bx) * 4, o = (y * W + x) * 3;
        out[o] = p.data[k]; out[o + 1] = p.data[k + 1]; out[o + 2] = p.data[k + 2];
      }
    }
    return { w: W, h: H, data: out };
  }

  // ---- connected components over the blown mask ----------------------------
  // 8-connected, iterative flood fill (a recursive one blows the stack on a
  // 1457 px blob). Returns blobs sorted largest first.
  function blobs(mask, W, H, minPx) {
    const lab = new Int32Array(W * H).fill(-1);
    const out = [];
    const stack = new Int32Array(W * H);
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || lab[s] >= 0) continue;
      const id = out.length;
      let sp = 0; stack[sp++] = s; lab[s] = id;
      let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, sx = 0, sy = 0;
      while (sp > 0) {
        const p = stack[--sp], px = p % W, py = (p / W) | 0;
        n++; sx += px; sy += py;
        if (px < x0) x0 = px; if (px > x1) x1 = px;
        if (py < y0) y0 = py; if (py > y1) y1 = py;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const qx = px + dx, qy = py + dy;
          if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
          const q = qy * W + qx;
          if (mask[q] && lab[q] < 0) { lab[q] = id; stack[sp++] = q; }
        }
      }
      out.push({ id, n, x0, y0, x1, y1, cx: sx / n, cy: sy / n });
    }
    return { blobs: out.filter(b => b.n >= (minPx || 1)).sort((a, b) => b.n - a.n), lab };
  }

  // ---- WHAT EACH PIXEL IS ---------------------------------------------------
  // Class names are store.js's own node names, read off the live scene graph,
  // not guessed. LAMPS is the emissive troffer face plus its bloom card; CEIL is
  // the rest of the drop ceiling; SIGN is every unlit MeshBasicMaterial printed
  // card. `store/tubes` is Lambert and spans y 0.10-5.20, i.e. it is conduit and
  // NOT a fluorescent lamp, so it is deliberately in OTHER.
  const CLASS = {
    LAMPS: ['store/store.ceiling/lightLenses', 'store/store.ceiling/lightBloom'],
    CEIL: ['store/store.ceiling', 'store/store.ceiling/trofferHousings',
      'store/store.ceiling/trofferShadows', 'store/store.ceiling/ceilFixtures',
      'store/store.ceiling/ceilPipes'],
    SIGN: ['store/aisleSigns', 'store/wallSigns', 'store/danglers', 'store/promoSigns',
      'store/laneSigns', 'store/bladeSigns', 'store/couponFlags', 'store/shelfTags',
      'store/store.frontwall/exitSigns', 'store/store.frontwall/doorDecals',
      'store/coolerLed'],
  };
  const NAMES = ['OTHER', 'LAMPS', 'CEIL', 'SIGN'];
  function pathOf(n) { const p = []; let a = n; while (a) { if (a.name) p.unshift(a.name); a = a.parent; } return p.join('/'); }
  // CLASS ASSIGNMENT IS EXCLUSIVE AND FIRST-MATCH-WINS, and it has to be:
  // `store/store.ceiling` is a PREFIX of `store/store.ceiling/lightLenses`, so a
  // plain prefix test put every lamp in CEIL and LAMPS came back 0.000% of the
  // frame. That is a perfectly plausible number for this build — the whole gap
  // being investigated is that the lamps do not clip — which is exactly why it
  // had to be caught by validation and not by reading it.
  function classOf(n, table) {
    const T = table || CLASS, N = table ? Object.keys(table) : NAMES.slice(1);
    const p = pathOf(n);
    for (let k = 0; k < N.length; k++) {
      if (T[N[k]].some(w => p === w || p.startsWith(w + '/'))) return k + 1;
    }
    return 0;
  }
  // ---- THE CLASS MAP, AS ONE ORDER-INDEPENDENT ID RENDER --------------------
  // THE SECOND THING THAT WAS WRONG WITH coverage(). Masking by colorWrite keeps
  // the occluders' DEPTH, which is necessary but not sufficient: a depth buffer
  // only occludes what is drawn AFTER it. three.js sorts opaque draws by
  // bounding-sphere distance, so the ceiling tile plane can be issued before the
  // lens that is in front of it, write its colour while the depth is still
  // clear, and keep it. Measured: LAMPS and CEIL overlapped on 20332 of LAMPS's
  // 20332 pixels — every single one — and the composite therefore reported the
  // fluorescent lamps as 0.000% of frame. Which is a NUMBER I WAS PREDISPOSED TO
  // BELIEVE, because "the lamps are not doing anything" is the round-10 gap.
  //
  // One render, every mesh wearing a flat unlit ID colour, ordinary depth test.
  // Draw order cannot matter because every fragment that survives is the nearest
  // one. Colours are pure R/G/B primaries so no colour-space or tone-mapping
  // transform can move them: those are monotonic per channel and fix 0 and 1.
  //
  // TRANSPARENT SURFACES DO NOT GET AN ID, and that is the third thing this
  // instrument got wrong. `lightBloom` is an additive glow card at opacity 0.34
  // whose VISIBLE extent is 9058 px but whose GEOMETRY is a ~66000 px quad; put
  // a flat opaque ID colour on it and LAMPS reads 83059 px, three times the real
  // lens area, every extra pixel stolen from the ceiling tile behind it. The
  // question this map answers is "what solid surface is at this pixel", so a
  // glow card contributes nothing and the tile behind it classifies as CEIL.
  const ID_COL = [0x000000, 0xff0000, 0x00ff00, 0x0000ff];
  const idMat = [];                      // [class]
  for (let k = 0; k < 4; k++) {
    const m = new THREE.MeshBasicMaterial({ color: ID_COL[k], toneMapped: false });
    m.fog = false; idMat.push(m);
  }
  const idSkip = new THREE.MeshBasicMaterial({ toneMapped: false });
  idSkip.colorWrite = false; idSkip.depthWrite = false; idSkip.fog = false;
  // `table` is an optional {name: [paths]} of AT MOST THREE classes. Three,
  // because the encoding is pure R/G/B primaries and that is the only encoding
  // no colour-space or tone-mapping step can perturb — a class id packed into
  // intermediate code values would be at the mercy of both. More than three
  // classes: run it twice and merge, which is what the sign breakdown does.
  function classMap(table) {
    const W = R.width, H = R.height;
    const saved = [];
    C.scene.traverse((n) => {
      if (!(n.isMesh || n.isInstancedMesh) || !n.visible) return;
      const orig = n.material;
      const first = Array.isArray(orig) ? orig[0] : orig;
      if (!first) return;
      saved.push([n, orig]);
      n.material = (first.transparent || !first.depthWrite) ? idSkip : idMat[classOf(n, table)];
    });
    const oldBg = C.scene.background;
    const oldClear = C.renderer.getClearColor(new THREE.Color()).getHex();
    const oldAlpha = C.renderer.getClearAlpha();
    const auto = C.renderer.autoClear;
    C.scene.background = null;
    C.renderer.setClearColor(0x000000, 0);
    C.renderer.autoClear = true;
    C.renderer.setRenderTarget(maskRT);
    C.renderer.render(C.scene, floorCam);
    const buf = new Uint8Array(W * H * 4);
    C.renderer.readRenderTargetPixels(maskRT, 0, 0, W, H, buf);
    C.renderer.setRenderTarget(null);
    C.renderer.autoClear = auto;
    C.scene.background = oldBg;
    C.renderer.setClearColor(oldClear, oldAlpha);
    for (const [n, orig] of saved) n.material = orig;
    const id = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const sy = H - 1 - y;
      for (let x = 0; x < W; x++) {
        const k = (sy * W + x) * 4;
        if (buf[k + 3] <= 8) { id[y * W + x] = 0; continue; }
        const r = buf[k], g = buf[k + 1], b = buf[k + 2];
        id[y * W + x] = (r > g && r > b && r > 40) ? 1 : (g > r && g > b && g > 40) ? 2
          : (b > r && b > g && b > 40) ? 3 : 0;
      }
    }
    return id;
  }
  // PROVE THE RESTORE. AGENTS_BRIEF: an ablation that cannot show its restore is
  // not an ablation. Capture, run every coverage pass, capture again; the two
  // must differ only by the grain (which reseeds per render and moves ~87% of
  // pixels by half a level, so compare MEANS, not pixels).
  function restoreCheck() {
    const mean = () => { const d = canvas().data; let s = 0, n = 0; for (let k = 0; k < d.length; k += 4) { s += Y8(d, k); n++; } return s / n; };
    const a = mean();
    classMap();
    const b = mean();
    return { before: +a.toFixed(6), after: +b.toFixed(6), delta: +(b - a).toFixed(6) };
  }
  // Canvas pixel -> pinhole pixel. The grade MOVES pixels (barrel k=0.12, up to
  // 31 px), the class map is pinhole, so sampling one with the other's index is
  // wrong by up to 31 px — which on a 12 px tube is the whole feature.
  function unwarpMap() {
    const W = R.width, H = R.height, ix = new Int32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const q = c.unwarpFloor({ x: x + 0.5, y: y + 0.5 });
      const sx = Math.min(W - 1, Math.max(0, Math.round(q.x - 0.5)));
      const sy = Math.min(H - 1, Math.max(0, Math.round(q.y - 0.5)));
      ix[y * W + x] = sy * W + sx;
    }
    return ix;
  }

  // ---- THE MEASUREMENT ------------------------------------------------------
  // One capture -> blown mask -> per-class counts + connected components, each
  // blob labelled by the class holding the MOST of its pixels. Region-free:
  // there is no measuring box anywhere in this, only the store's own node names.
  function frameStats(id, uw) {
    const W = R.width, H = R.height, N = W * H;
    const img = canvas(), d = img.data;
    const mask = new Uint8Array(N);
    const cls = new Uint8Array(N);
    const byClass = [0, 0, 0, 0], areaByClass = [0, 0, 0, 0];
    let blown = 0;
    for (let i = 0; i < N; i++) {
      const k = id[uw[i]]; cls[i] = k; areaByClass[k]++;
      if (Y8(d, i * 4) >= BLOWN) { mask[i] = 1; blown++; byClass[k]++; }
    }
    const bl = blobs(mask, W, H, 1);
    const top = bl.blobs.slice(0, 10).map((b) => {
      const c4 = [0, 0, 0, 0];
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
        const i = y * W + x; if (bl.lab[i] === b.id) c4[cls[i]]++;
      }
      let best = 0; for (let k = 1; k < 4; k++) if (c4[k] > c4[best]) best = k;
      return { px: b.n, what: NAMES[best], mix: c4, box: [b.x0, b.y0, b.x1, b.y1] };
    });
    return {
      blown, blownPct: blown * 100 / N, byClass, areaByClass,
      shareOfBlown: byClass.map((v) => blown ? v * 100 / blown : 0),
      nBlobs: bl.blobs.length, top, lab: bl.lab, mask, cls,
    };
  }
  // 12 frames. snap() is not deterministic — the grain reseeds per render — so
  // every figure below is a spread, never a frame.
  function series(n, id, uw) {
    const out = [];
    for (let k = 0; k < n; k++) out.push(frameStats(id, uw));
    const sp = (f) => { const a = out.map(f).sort((x, y) => x - y);
      return { min: +a[0].toFixed(4), med: +a[(a.length / 2) | 0].toFixed(4), max: +a[a.length - 1].toFixed(4),
        spread: +(a[a.length - 1] - a[0]).toFixed(4) }; };
    return {
      n, frames: out,
      blownPct: sp((s) => s.blownPct),
      lampShare: sp((s) => s.shareOfBlown[1]),
      ceilShare: sp((s) => s.shareOfBlown[2]),
      signShare: sp((s) => s.shareOfBlown[3]),
      otherShare: sp((s) => s.shareOfBlown[0]),
      ceilingShare: sp((s) => s.shareOfBlown[1] + s.shareOfBlown[2]),
      // % of each class's OWN area that is blown — the "does this thing clip"
      // question, which share-of-frame cannot answer because the classes differ
      // in size by 25x.
      lampSelf: sp((s) => s.areaByClass[1] ? s.byClass[1] * 100 / s.areaByClass[1] : 0),
      signSelf: sp((s) => s.areaByClass[3] ? s.byClass[3] * 100 / s.areaByClass[3] : 0),
      ceilSelf: sp((s) => s.areaByClass[2] ? s.byClass[2] * 100 / s.areaByClass[2] : 0),
      topLast: out[out.length - 1].top,
    };
  }
  // HDR linear luma per class — what the SHOULDER is actually handed.
  //
  // NO WARP INDEX HERE, DELIBERATELY. `floorRaw` is the buffer the grade READS,
  // so it is PINHOLE: the barrel has not run yet. The class map is rendered
  // through the same pinhole camera, so the two already share a coordinate
  // system and `id[i]` is the right index. Pushing it through unwarpFloor as
  // well — which is correct for the CANVAS, and is what frameStats does —
  // displaces the map by up to 31 px against the buffer, which on a 12 px lens
  // face is the whole feature. I made exactly that mistake first.
  function hdrByClass(id) {
    const h = hdr(), N = R.width * R.height;
    const per = [[], [], [], []];
    for (let i = 0; i < N; i++) {
      const Y = h.data[i * 3] * 0.2126 + h.data[i * 3 + 1] * 0.7152 + h.data[i * 3 + 2] * 0.0722;
      per[id[i]].push(Y);
    }
    return per.map((a, k) => {
      if (!a.length) return { cls: NAMES[k], n: 0 };
      a.sort((x, y) => x - y);
      const q = (f) => +a[Math.min(a.length - 1, Math.floor(f * a.length))].toFixed(4);
      let over = 0; for (const v of a) if (v > 1) over++;
      return { cls: NAMES[k], n: a.length, p50: q(0.5), p90: q(0.9), p99: q(0.99),
        max: +a[a.length - 1].toFixed(4), overFullWellPct: +(over * 100 / a.length).toFixed(3) };
    });
  }

  window.P = {
    C, c, R, THREE, floorCam, canvas, pose, coverage, hdr, blobs, Y8, BLOWN,
    frameStats, series, hdrByClass, idMat, idSkip,
    maskRT, classMap, unwarpMap, CLASS, NAMES, pathOf, classOf, restoreCheck,
    W: R.width, H: R.height,
    // dump a Uint8/Float array to the shot sink as a PNG, for evidence images
    async png(name, draw) {
      const cv = document.createElement('canvas');
      cv.width = R.width; cv.height = R.height;
      draw(cv.getContext('2d'), cv);
      const res = await fetch('/shot?name=' + encodeURIComponent(name), { method: 'POST', body: cv.toDataURL('image/png') });
      return res.text();
    },
  };
  return 'P ready, floorCam fov=' + (floorCam && floorCam.fov);
})()
