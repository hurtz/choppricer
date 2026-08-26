// builder-cctv r10 measurement harness. Not part of the game. Loaded by eval
// from the agent tab after every reload. Nothing in src/ imports this.
(function () {
  const C = window.__CHOP, c = C.cctv;
  const R = C.renderer.domElement;
  const off = document.createElement('canvas');
  off.width = R.width; off.height = R.height;
  const cx = off.getContext('2d', { willReadFrequently: true });
  const Y8 = (d, k) => (d[k] * 0.2126 + d[k + 1] * 0.7152 + d[k + 2] * 0.0722) / 255;

  function canvas() { C.step(0); cx.clearRect(0, 0, off.width, off.height); cx.drawImage(R, 0, 0); return cx.getImageData(0, 0, off.width, off.height); }
  function tileStats(img, t, inset) {
    const m = inset || 0; let n = 0, b = 0, mx = 0, s = 0; const W = img.width, d = img.data;
    for (let y = t.y + m; y < t.y + t.h - m; y++) for (let x = t.x + m; x < t.x + t.w - m; x++) {
      const Y = Y8(d, (y * W + x) * 4); n++; s += Y; if (Y > mx) mx = Y; if (Y >= 0.98) b++;
    }
    return { pct: b * 100 / n, max: mx, mean: s / n, n };
  }
  function streamStats(i) {
    const p = c.probeStream(i), d = p.data, n = p.w * p.h; let b = 0, mx = 0, s = 0, h1 = 0;
    for (let k = 0; k < d.length; k += 4) { const Y = Y8(d, k); s += Y; if (Y > mx) mx = Y; if (Y >= 0.98) b++; if (Y >= 0.999) h1++; }
    return { w: p.w, h: p.h, pct: b * 100 / n, hit1: h1 * 100 / n, max: mx, mean: s / n };
  }
  function rawStats(i) {
    const p = c.probeRaw(i), d = p.data, n = p.w * p.h, ys = new Float64Array(n);
    for (let k = 0, j = 0; k < d.length; k += 4, j++) ys[j] = d[k] * 0.2126 + d[k + 1] * 0.7152 + d[k + 2] * 0.0722;
    const s = Float64Array.from(ys).sort(); const q = (f) => s[Math.min(n - 1, Math.floor(f * n))];
    let o = 0; for (let j = 0; j < n; j++) if (ys[j] > 1) o++;
    return { w: p.w, h: p.h, ss: p.ss, p50: q(0.5), p99: q(0.99), p999: q(0.999), max: s[n - 1], over1: o * 100 / n };
  }
  // A CONTROL SERIES, because snap() and the grain are not deterministic.
  function series(fn, n) {
    const out = []; for (let k = 0; k < n; k++) { C.step(1 / 60); out.push(fn()); } return out;
  }
  function spread(a) {
    const s = Float64Array.from(a).sort();
    return { min: s[0], med: s[(s.length / 2) | 0], max: s[s.length - 1], mean: a.reduce((x, y) => x + y, 0) / a.length };
  }
  // per-channel panel + stream blown, over N frames
  function wallSeries(n) {
    const per = c.tiles.map(() => ({ panel: [], stream: [] }));
    for (let k = 0; k < n; k++) {
      C.step(1 / 60);
      const img = canvas();
      for (let i = 0; i < c.tiles.length; i++) {
        per[i].panel.push(tileStats(img, c.tiles[i], 0).pct);
        per[i].stream.push(streamStats(i).pct);
      }
    }
    return per.map((p, i) => ({ ch: i + 1, panel: spread(p.panel), stream: spread(p.stream) }));
  }
  // plateau: drive the feed to saturation and read the ceiling each panel reaches
  function plateaus(gain) {
    const old = c.params.wall.gain;
    c.setParams('wall', { gain: gain });
    for (let k = 0; k < 90; k++) C.step(1 / 60);      // let every channel re-render
    const img = canvas();
    const out = c.tiles.map((t, i) => { const s = tileStats(img, t, 3); return { ch: i + 1, max: +s.max.toFixed(4), pct: +s.pct.toFixed(2) }; });
    c.setParams('wall', { gain: old });
    for (let k = 0; k < 90; k++) C.step(1 / 60);
    return out;
  }
  // FLOOR VIEW: thirds of the 1280x720 canvas, sRGB-domain 709 luma, blown >= 0.98.
  // Same definition round 9 used for ceiling 0.996 / mid 0.436 / whole 0.478.
  function floorStats() {
    const img = canvas(), d = img.data, W = img.width, H = img.height, t = (H / 3) | 0;
    const band = (y0, y1) => { let n = 0, b = 0, mn = 1, s = 0;
      for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
        const Y = Y8(d, (y * W + x) * 4); n++; s += Y; if (Y >= 0.98) b++; if (Y < mn) mn = Y; }
      return { pct: b * 100 / n, min: mn, mean: s / n }; };
    return { ceil: band(0, t), mid: band(t, 2 * t), whole: band(0, H) };
  }
  // Darkest pixel inside each wall tile — the backlight leak floor. A screen
  // showing black must not be black.
  function leakFloor() {
    const img = canvas(), d = img.data, W = img.width;
    return c.tiles.map((t, i) => { let mn = 1;
      for (let y = t.y + 4; y < t.y + t.h - 4; y++) for (let x = t.x + 4; x < t.x + t.w - 4; x++) {
        const Y = Y8(d, (y * W + x) * 4); if (Y < mn) mn = Y; }
      return { ch: i + 1, min: +mn.toFixed(4) }; });
  }
  window.__M = { canvas, tileStats, streamStats, rawStats, series, spread, wallSeries, plateaus, floorStats, leakFloor, Y8 };
  return 'probe r10 ready';
})()
