// OWNER: builder-game. The HUD is a 1280x720 2D canvas laid over the WebGL canvas
// with identical `object-fit: contain` scaling, so it lines up pixel-for-pixel with
// the 3D view at any window size and composites cleanly into screenshots.
//
// Look: 1990s in-store DVR. Blocky monospace, amber + phosphor green, hard-edged
// boxes with filled title tabs, scanlines, burn-in ghosts, a clock that is wrong.

export const W = 1280, H = 720;
const MONO = 'ui-monospace, SFMono-Regular, Menlo, "DejaVu Sans Mono", monospace';

export const AMB = '#ffb43a';
export const AMB_D = '#7a5312';
export const GRN = '#7dfda0';
export const GRN_D = '#1d5c31';
export const RED = '#ff4a3a';
export const RED_D = '#5e1610';
export const DIM = '#83a58c';
export const INK = 'rgba(4,8,5,0.88)';
export const LINE = '#3c6244';

// The wall grid I assume when cctv.js does not publish `tiles`. Top band 0..74 and
// bottom band 624..720 are reserved for HUD chrome.
export function fallbackTiles(n = 8) {
  const cols = 4, rows = Math.ceil(n / cols), gap = 8;
  const x0 = 10, y0 = 74, x1 = 1270, y1 = 624;
  const tw = (x1 - x0 - gap * (cols - 1)) / cols;
  const th = (y1 - y0 - gap * (rows - 1)) / rows;
  return Array.from({ length: n }, (_, i) => ({
    x: x0 + (i % cols) * (tw + gap), y: y0 + Math.floor(i / cols) * (th + gap), w: tw, h: th,
  }));
}

// --- The floor camera rig is fixed relative to the cop (see main.js): eye at
// cop+(0,6.4,-7.6) looking at cop+(0,1.0,2.5), 58deg vertical FOV. Reproduced here
// so HUD markers can sit on world positions without needing the camera object.
const F = (() => {
  const dy = 1.0 - 6.4, dz = 2.5 + 7.6, l = Math.hypot(dy, dz);
  const f = [0, dy / l, dz / l];
  return { f, right: [1, 0, 0], up: [0, f[2], -f[1]] };
})();
const TAN = Math.tan((58 * Math.PI / 180) / 2), ASP = W / H;
export function projectFromCop(cop, x, y, z) {
  const v = [x - cop.x, y - 6.4, z - (cop.z - 7.6)];
  const zc = v[0] * F.f[0] + v[1] * F.f[1] + v[2] * F.f[2];
  const xc = v[0] * F.right[0] + v[1] * F.right[1] + v[2] * F.right[2];
  const yc = v[0] * F.up[0] + v[1] * F.up[1] + v[2] * F.up[2];
  if (zc <= 0.25) return { x: xc > 0 ? W + 90 : -90, y: H / 2, behind: true };
  return {
    x: ((xc / zc) / (TAN * ASP) * 0.5 + 0.5) * W,
    y: (0.5 - (yc / zc) / TAN * 0.5) * H, behind: false,
  };
}

export function createHUD(hudEl) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  Object.assign(cv.style, {
    position: 'absolute', inset: '0', width: '100%', height: '100%',
    objectFit: 'contain', pointerEvents: 'auto', cursor: 'crosshair',
  });
  hudEl.appendChild(cv);
  const ctx = cv.getContext('2d');
  let regions = [];
  const hud = { canvas: cv, ctx, regions: () => regions };

  // ---------------------------------------------------------------- primitives
  function tx(s, x, y, o = {}) {
    ctx.font = `${o.w || ''} ${o.s || 12}px ${MONO}`.trim();
    ctx.fillStyle = o.c || DIM;
    ctx.textAlign = o.a || 'left';
    ctx.textBaseline = 'alphabetic';
    try { ctx.letterSpacing = (o.ls == null ? 0.7 : o.ls) + 'px'; } catch { /* older engine */ }
    if (o.max) s = clip(s, o.max, o.s || 12, o.w);
    ctx.fillText(s, x, y);
    try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
    return s;
  }
  function clip(s, max, size, wt) {
    ctx.font = `${wt || ''} ${size}px ${MONO}`.trim();
    if (ctx.measureText(s).width <= max) return s;
    while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1);
    return s + '…';
  }
  function scan(x, y, w, h, a = 0.3) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    for (let i = 0; i < h; i += 3) ctx.fillRect(x, y + i, w, 1);
  }
  function box(x, y, w, h, c, lw = 1) {
    ctx.strokeStyle = c; ctx.lineWidth = lw;
    ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  }
  function panel(x, y, w, h, title, o = {}) {
    ctx.fillStyle = o.bg || INK; ctx.fillRect(x, y, w, h);
    scan(x, y, w, h, o.scan == null ? 0.3 : o.scan);
    box(x, y, w, h, o.line || LINE);
    if (title) {
      const tw = Math.min(w, 16 + title.length * 8.0);
      ctx.fillStyle = o.accent || AMB; ctx.fillRect(x, y, tw, 16);
      tx(title, x + 8, y + 12, { s: 11, w: 'bold', c: '#07100a', ls: 1.3, max: tw - 14 });
    }
  }
  function segbar(x, y, w, h, frac, o = {}) {
    const n = o.seg || 24, gap = 2, sw = (w - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      const on = (i + 0.999) / n <= frac;
      ctx.fillStyle = on ? (o.on || GRN) : (o.off || 'rgba(255,255,255,0.07)');
      ctx.fillRect(x + i * (sw + gap), y, sw, h);
    }
    box(x - 3, y - 3, w + 6, h + 6, o.line || LINE);
  }
  function reg(id, x, y, w, h, data) { regions.push({ id, x, y, w, h, data }); }
  function stamp(text, x, y, o = {}) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate((o.rot == null ? -7 : o.rot) * Math.PI / 180);
    ctx.font = `bold ${o.s || 40}px ${MONO}`;
    const w = ctx.measureText(text).width + 34;
    ctx.globalAlpha = o.a == null ? 0.92 : o.a;
    // Ink plate: the stamp has to read over a lit supermarket floor.
    ctx.fillStyle = 'rgba(3,6,4,0.78)';
    ctx.fillRect(-w / 2, -(o.s || 40) * 0.9, w, (o.s || 40) * 1.35);
    ctx.strokeStyle = o.c || RED; ctx.lineWidth = 4;
    ctx.strokeRect(-w / 2, -(o.s || 40) * 0.9, w, (o.s || 40) * 1.35);
    tx(text, 0, 0, { s: o.s || 40, w: 'bold', c: o.c || RED, a: 'center', ls: 3 });
    ctx.restore(); ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- shared chrome
  const two = (n) => String(n | 0).padStart(2, '0');
  function dvrClock(t) {
    // The DVR clock has been forty-three minutes fast since the power outage.
    const s = 51123 + t;
    return `08/22/26 ${two((s / 3600) % 24)}:${two((s / 60) % 60)}:${two(s % 60)}`;
  }
  function burnIn() {
    // Ghosts of a channel layout this DVR has not used since 2019.
    ctx.globalAlpha = 0.055;
    tx('CH 04  LIQUOR', 24, 700, { s: 30, w: 'bold', c: '#ffffff', ls: 4 });
    tx('REC', 1256, 60, { s: 26, w: 'bold', c: '#ffffff', a: 'right', ls: 4 });
    ctx.globalAlpha = 1;
  }
  function topBand(G, h, label) {
    ctx.fillStyle = 'rgba(2,4,3,0.93)'; ctx.fillRect(0, 0, W, h);
    ctx.fillStyle = LINE; ctx.fillRect(0, h - 1, W, 1);
    const blink = (G.now % 1) < 0.6;
    if (blink) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(24, h / 2 - 5, 5.5, 0, 7); ctx.fill(); }
    tx('REC', 36, h / 2 - 1, { s: 12, w: 'bold', c: blink ? RED : RED_D, ls: 1.6 });
    tx(label, 82, h / 2 - 1, { s: 14, w: 'bold', c: AMB, ls: 2.2 });
    tx(dvrClock(G.st.clock), W - 14, h / 2 - 2, { s: 16, w: 'bold', c: GRN, a: 'right', ls: 1.4 });
    if (h > 60) {
      tx('16-CH DVR / 8 CH ACTIVE / MOTION ANALYTICS: ON', 82, h - 14, { s: 11, c: DIM });
      tx(`SHIFT ${G.st.shift}  ·  ${two(G.st.clock / 60)}:${two(G.st.clock % 60)} ELAPSED`,
        W - 14, h - 14, { s: 11, c: DIM, a: 'right' });
    }
  }
  function alarmBar(G, y) {
    const a = G.alarm; if (!a) return;
    const flash = (G.now % 0.9) < 0.55;
    ctx.fillStyle = flash ? 'rgba(120,16,10,0.94)' : 'rgba(64,10,7,0.94)';
    ctx.fillRect(0, y, W, 30);
    box(0, y, W, 30, flash ? RED : RED_D);
    tx('▲ ' + a.text, 18, y + 20, { s: 14, w: 'bold', c: flash ? '#ffd9d3' : RED, ls: 1.8 });
    if (a.count != null) {
      tx(`T-${a.count.toFixed(1)}s`, W - 18, y + 20,
        { s: 15, w: 'bold', c: flash ? '#ffd9d3' : RED, a: 'right', ls: 1.5 });
    }
  }
  function ticker(G, x, y, w, back) {
    // Last few system log lines, newest first, fading out. Bottom of the wall.
    if (back) { ctx.fillStyle = 'rgba(2,4,3,0.86)'; ctx.fillRect(x - 8, y - 12, w + 16, 16); }
    for (let i = 0; i < Math.min(3, G.log.length); i++) {
      const e = G.log[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, (8 - (G.now - e.t)) / 2.5)) * (1 - i * 0.28);
      tx(`${dvrClock(e.clock).slice(9)}  ${e.text}`, x, y + i * 15,
        { s: 11, c: e.bad ? RED : DIM, max: w });
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ DESK
  function drawDesk(G) {
    const tiles = G.tiles;
    // Per-tile overlay only — cctv.js owns the bezels and the picture.
    tiles.forEach((t, i) => {
      if (!t) return;
      reg('cam', t.x, t.y, t.w, t.h, i);
      const subs = G.desk.subjects.filter((s) => s.cam === i);
      const flagged = subs.some((s) => s.flagged);
      const act = i === G.desk.cam;
      box(t.x, t.y, t.w, t.h, act ? AMB : 'rgba(120,170,130,0.16)', act ? 2 : 1);
      if (act) {
        const k = 16;
        ctx.strokeStyle = AMB; ctx.lineWidth = 3;
        [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(([cx, cy, sx, sy]) => {
          const px = t.x + cx * t.w, py = t.y + cy * t.h;
          ctx.beginPath(); ctx.moveTo(px + sx * k, py); ctx.lineTo(px, py);
          ctx.lineTo(px, py + sy * k); ctx.stroke();
        });
        ctx.fillStyle = AMB; ctx.fillRect(t.x, t.y + t.h - 15, t.w, 15);
        tx(`▶ ${G.cams[i]?.id || 'CAM'} — ${G.cams[i]?.label || ''}`,
          t.x + 6, t.y + t.h - 4, { s: 10, w: 'bold', c: '#07100a', ls: 1.1, max: t.w - 60 });
        tx(`${subs.length} SUBJ`, t.x + t.w - 6, t.y + t.h - 4,
          { s: 10, w: 'bold', c: '#07100a', a: 'right' });
      } else {
        ctx.fillStyle = 'rgba(2,5,3,0.7)'; ctx.fillRect(t.x + t.w - 54, t.y + 4, 50, 14);
        tx(`${subs.length} SUBJ`, t.x + t.w - 7, t.y + 15, { s: 10, c: DIM, a: 'right' });
      }
      if (flagged && (G.now % 0.8) < 0.5) {
        ctx.fillStyle = RED; ctx.fillRect(t.x + 4, t.y + 4, 44, 15);
        tx('FLAG', t.x + 8, t.y + 15, { s: 10, w: 'bold', c: '#1a0402' });
      }
      tx(`[${i + 1}]`, t.x + 5, t.y + t.h - (i === G.desk.cam ? 21 : 6),
        { s: 10, c: 'rgba(190,230,200,0.45)' });
    });

    topBand(G, 74, 'CHOP FOODS #4417  ·  LOSS PREVENTION TERMINAL');
    // The alarm eats the DVR status line rather than the top row of monitors —
    // covering the feeds is exactly what you must not do to a guard.
    alarmBar(G, 44);
    ticker(G, 14, 616, 700, true);

    const by = 624, bh = 88;
    // --- officer
    panel(10, by, 330, bh, 'OFFICER — BADGE 1');
    tx(G.rankName, 18, by + 40, { s: 19, w: 'bold', c: AMB, ls: 1.6, max: 314 });
    tx(`${G.st.points}`, 18, by + 70, { s: 22, w: 'bold', c: GRN, ls: 1 });
    tx('PTS', 18 + String(G.st.points).length * 14 + 8, by + 70, { s: 11, c: DIM });
    for (let i = 0; i < 3; i++) {
      const on = i < G.st.complaints;
      ctx.fillStyle = on ? RED : 'rgba(255,255,255,0.10)';
      ctx.fillRect(232 + i * 20, by + 56, 15, 15);
      box(232 + i * 20, by + 56, 15, 15, on ? RED : LINE);
    }
    tx('COMPLAINTS', 232, by + 48, { s: 10, c: DIM });

    // --- analytics roster
    const ax = 348, aw = 558;
    const cam = G.cams[G.desk.cam];
    panel(ax, by, aw, bh, `MOTION ANALYTICS — ${cam?.id || 'CAM'} / ${cam?.label || ''}`);
    const all = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
    const top = Math.min(G.desk.scroll || 0, Math.max(0, all.length - 3));
    const subs = all.slice(top, top + 3);
    if (!subs.length) {
      tx('NO SUBJECTS IN FRAME.', ax + 12, by + 44, { s: 13, c: DIM });
      tx('ANALYTICS IS STILL BILLED MONTHLY.', ax + 12, by + 64, { s: 11, c: 'rgba(131,165,140,0.5)' });
    }
    // The window is three rows deep because three rows is what fits. Say so,
    // and give the rest of the list somewhere to be — a hidden row used to mean
    // the analytics had flagged somebody the terminal would never show you.
    if (all.length > 3) {
      const more = all.length - top - 3;
      reg('scroll', ax + aw - 96, by + 1, 92, 15, more > 0 ? 1 : -(top || 0));
      tx(more > 0 ? `▼ ${more} MORE  [↓]` : `▲ TOP  [↑]`, ax + aw - 8, by + 12,
        { s: 10, w: 'bold', c: AMB, a: 'right', ls: 0.6 });
    }
    subs.forEach((s, i) => {
      const ry = by + 22 + i * 22, sel = G.desk.sel === s.id;
      reg('subj', ax + 4, ry, aw - 8, 21, s.id);
      if (sel) {
        ctx.fillStyle = 'rgba(255,180,58,0.20)'; ctx.fillRect(ax + 4, ry, aw - 8, 21);
        ctx.fillStyle = AMB; ctx.fillRect(ax + 4, ry, 4, 21);
      }
      tx(sel ? '▶' : ' ', ax + 11, ry + 15, { s: 12, w: 'bold', c: AMB });
      tx(s.code, ax + 24, ry + 15, { s: 12, w: 'bold', c: sel ? AMB : GRN });
      tx(shortWhere(s), ax + 100, ry + 15, { s: 12, c: s.aisle == null ? AMB : DIM });
      tx(s.line, ax + 152, ry + 15,
        { s: 12, c: s.flagged ? RED : (sel ? '#e9f6ec' : DIM), max: 306, w: s.flagged ? 'bold' : '' });
      if (s.held) {
        ctx.fillStyle = 'rgba(255,227,106,0.16)'; ctx.fillRect(ax + aw - 96, ry + 3, 44, 15);
        tx('HOLD', ax + aw - 92, ry + 15, { s: 10, w: 'bold', c: '#ffe36a' });
      }
      tx(`${two(s.dwell / 60)}:${two(s.dwell % 60)}`, ax + aw - 12, ry + 15,
        { s: 11, c: DIM, a: 'right' });
    });

    // --- dispatch + the PA
    const dx = 914, dw = 356;
    const sel = G.desk.subjects.find((s) => s.id === G.desk.sel);
    const can = sel && (sel.post || sel.aisle != null);
    panel(dx, by, dw, bh, 'DISPATCH', { accent: can ? AMB : '#4d5f52' });
    if (can) {
      const hot = (G.now % 1.1) < 0.75;
      const bw = 212;
      reg('dispatch', dx + 8, by + 22, bw, 40, sel.aisle);
      ctx.fillStyle = hot ? AMB : AMB_D; ctx.fillRect(dx + 8, by + 22, bw, 40);
      const dest = sel.where || `AISLE ${sel.aisle + 1}`;
      tx('▶ DISPATCH', dx + 8 + bw / 2, by + 41, { s: 15, w: 'bold', c: '#07100a', a: 'center', ls: 1.4 });
      tx(dest, dx + 8 + bw / 2, by + 57, { s: 13, w: 'bold', c: '#07100a', a: 'center', ls: 1.2, max: bw - 12 });
      holdBtn(G, dx + 230, by + 22, dw - 238, 40);
      tx('[SPACE] DISPATCH   [F] PA', dx + 12, by + 78, { s: 11, c: DIM });
      tx('POST UNMANNED', dx + dw - 12, by + 78, { s: 11, c: 'rgba(255,74,58,0.75)', a: 'right' });
    } else {
      tx('SELECT A SUBJECT ROW', dx + 12, by + 42, { s: 14, w: 'bold', c: '#6f8a77' });
      tx('CLICK A MONITOR OR PRESS [1]-[8]', dx + 12, by + 62, { s: 11, c: '#5d7364' });
      tx('[↑/↓] ROSTER   [TAB] LEAVE POST', dx + 12, by + 78, { s: 11, c: '#5d7364' });
    }
    burnIn();
  }

  // The one power this job actually confers. Ready / counting down / live.
  function holdBtn(G, x, y, w, h) {
    const H2 = G.hold || {};
    if (!H2.on) return;
    const live = H2.live, cool = H2.cool || 0;
    const ready = !live && cool <= 0;
    ctx.fillStyle = live ? 'rgba(255,227,106,0.22)' : ready ? 'rgba(255,180,58,0.14)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, w, h);
    box(x, y, w, h, live ? '#ffe36a' : ready ? AMB : '#3c4a40');
    if (ready) reg('hold', x, y, w, h, 1);
    const c = live ? '#ffe36a' : ready ? AMB : '#5d7364';
    tx('PA', x + w / 2, y + 17, { s: 12, w: 'bold', c, a: 'center', ls: 1.6 });
    tx(live ? 'HOLDING' : ready ? 'PRICE CHK' : `${Math.ceil(cool)}s`,
      x + w / 2, y + 32, { s: 11, w: 'bold', c, a: 'center', max: w - 6 });
    if (!ready && !live && H2.max) {                     // cooldown drains left to right
      ctx.fillStyle = 'rgba(255,180,58,0.35)';
      ctx.fillRect(x, y + h - 3, w * (1 - cool / H2.max), 3);
    }
  }
  // "A4" / "FRONT" / "BACK" — where the terminal will send you, not where he is.
  function shortWhere(s) {
    if (s.aisle != null) return `A${s.aisle + 1}`;
    if (!s.where) return '—';
    return s.where === 'FRONT END' ? 'FRONT' : s.where === 'BACK WALL' ? 'BACK' : s.where;
  }

  // ------------------------------------------------------------------ FLOOR
  function drawFloor(G) {
    const f = G.floor;
    // objective / subject marker, projected onto the world
    if (f && f.target && f.target.state !== 'gone' && G.cop) {
      const p = projectFromCop(G.cop, f.target.x, 1.75, f.target.z);
      const d = Math.hypot(f.target.x - G.cop.x, f.target.z - G.cop.z);
      const cl = { x: Math.max(40, Math.min(W - 40, p.x)), y: Math.max(96, Math.min(560, p.y)) };
      const off = p.behind || p.x < 26 || p.x > W - 26;
      // Orange brackets = he has broken for the rear. The cue that a man has
      // turned round belongs ON the man, not in a panel the player is not
      // looking at while chasing one.
      const c = f.target.state === 'flee' ? (f.viaBack ? '#ff7a2e' : RED)
        : (f.confronted ? '#8fa8ff' : AMB);
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      const bw = off ? 26 : Math.max(26, Math.min(150, 380 / Math.max(1.2, d))) ;
      const bh2 = bw * 1.9;
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sy]) => {
        const px = cl.x + sx * bw / 2, py = cl.y + sy * bh2 / 2;
        ctx.beginPath(); ctx.moveTo(px - sx * bw * 0.28, py); ctx.lineTo(px, py);
        ctx.lineTo(px, py - sy * bh2 * 0.24); ctx.stroke();
      });
      // Off-screen, this used to print the DISPATCHED aisle no matter where the
      // man had got to — so a subject twenty metres up the front walk was
      // labelled with an aisle he had left. Off-screen or on, the tag names who
      // it is pointing at; only a plain zone sweep names the zone.
      const zone = f.where || `AISLE ${f.aisle + 1}`;
      const who = f.target.code || zone;
      const lbl = off ? (p.x < W / 2 ? '◀ ' : '') + who : who;
      const lw = lbl.length * 8 + 18;
      ctx.fillStyle = 'rgba(3,7,4,0.85)'; ctx.fillRect(cl.x - lw / 2, cl.y - bh2 / 2 - 24, lw, 18);
      box(cl.x - lw / 2, cl.y - bh2 / 2 - 24, lw, 18, c);
      tx(lbl + (off && p.x >= W / 2 ? ' ▶' : ''), cl.x, cl.y - bh2 / 2 - 10,
        { s: 12, w: 'bold', c, a: 'center' });
      const dl = `${d.toFixed(1)}m`, dw = dl.length * 9 + 14;
      const dy2 = Math.min(cl.y + bh2 / 2 + 4, 516);   // stay clear of the prompt band
      ctx.fillStyle = 'rgba(3,7,4,0.85)'; ctx.fillRect(cl.x - dw / 2, dy2, dw, 18);
      box(cl.x - dw / 2, dy2, dw, 18, c);
      tx(dl, cl.x, dy2 + 14, { s: 13, w: 'bold', c, a: 'center' });
    }

    // --- THE DOORS, ON THE FLOOR ----------------------------------------------
    // The panel above tells you which door in words. This puts the word on the
    // actual door, forty metres away down the front wall, so "cut across" has
    // somewhere to point. Both are drawn while both are still live; once the
    // geometry has locked him into one, the other stops mattering and goes.
    if (f && f.door && f.target && f.target.state === 'flee' && G.cop) {
      const dr = f.door;
      dr.all.forEach((e, i) => {
        const his = i === dr.i;
        if (!his && dr.sure) return;
        const p = projectFromCop(G.cop, e.x, 2.62, e.z);
        const off = p.behind || p.x < 60 || p.x > W - 60;
        const cx = Math.max(56, Math.min(W - 56, p.x));
        const cy = Math.max(92, Math.min(524, p.y));
        const c = his ? (dr.sure ? RED : AMB) : DIM;
        const lbl = (off && p.x < W / 2 ? '◀ ' : '') + e.label + (off && p.x >= W / 2 ? ' ▶' : '');
        const bw = lbl.length * 8 + 20;
        // These land on packed shelving forty metres away, which is the busiest
        // surface in the game. The plate has to be near-opaque or the tag is
        // just texture; the unchosen door is dimmed by colour, not by alpha.
        ctx.globalAlpha = his ? 1 : 0.85;
        ctx.fillStyle = 'rgba(3,7,4,0.94)'; ctx.fillRect(cx - bw / 2, cy - 9, bw, 20);
        box(cx - bw / 2, cy - 9, bw, 20, c);
        tx(lbl, cx, cy + 6, { s: 12, w: 'bold', c, a: 'center' });
        // a stem down to the threshold, so the tag reads as attached to a door
        ctx.strokeStyle = c; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy + 11); ctx.lineTo(cx, cy + 26); ctx.stroke();
        ctx.globalAlpha = 1;
      });
    }

    topBand(G, 52, 'ON FOOT — UNIT 1');

    // dispatched-to callout
    panel(10, 62, 262, 54, 'DISPATCHED TO');
    // A closed case has no destination. Leaving the aisle number up here is half
    // of the stale-objective bug: the biggest text on the screen kept naming a
    // place the player had no reason to be.
    const dest = f && f.closed ? (f.standDown || 'STAND DOWN')
      : ((f && f.where) || `AISLE ${(f?.aisle ?? 0) + 1}`);
    tx(dest, 20, 104, {
      s: dest.length > 9 ? 21 : 28, w: 'bold',
      c: f && f.closed ? DIM : AMB, ls: 2, max: 200,
    });
    tx(G.cams[G.desk.cam]?.id || '', 252, 104, { s: 11, c: DIM, a: 'right' });

    // --- pursuit panel --------------------------------------------------------
    // TWO DOORS, 35 m apart, and he is going to exactly one of them. Everything
    // in here is the same question asked twice: can you get to that door before
    // he does, or do you have to run him down on the way? So each door carries
    // both halves of the race — his route metres and yours — and YOUR number
    // goes green on the door you would win. That is the whole decision.
    if (f && f.target && f.target.state === 'flee') {
      const px = 300, pw = 680, py = 62;
      const dr = f.door;
      const back = !!f.viaBack;
      panel(px, py, pw, 78, 'PURSUIT — SUBJECT FLEEING',
        { accent: back ? '#ff7a2e' : RED, line: RED_D });

      // door chips, laid out left-to-right by where the doors actually are
      const chips = dr ? dr.all.map((e, i) => ({ e, i })).sort((a, b) => a.e.x - b.e.x) : [];
      const cw = 106, chh = 56, cy = py + 20;
      const cx0 = px + pw - 12 - chips.length * cw - (chips.length - 1) * 8;
      chips.forEach(({ e, i }, k) => {
        const x = cx0 + k * (cw + 8);
        const his = i === dr.i;
        const c = his ? (dr.sure ? RED : AMB) : LINE;
        ctx.fillStyle = his ? 'rgba(52,10,7,0.75)' : 'rgba(255,255,255,0.03)';
        ctx.fillRect(x, cy, cw, chh);
        box(x, cy, cw, chh, his ? c : LINE);
        // title strip: filled when this is the one he is running at
        ctx.fillStyle = his ? c : 'rgba(255,255,255,0.06)';
        ctx.fillRect(x, cy, cw, 15);
        tx(e.label + (his && !dr.sure ? ' ?' : ''), x + 6, cy + 12,
          { s: 11, w: 'bold', c: his ? '#07100a' : DIM, ls: 1.1 });
        const him = dr.him[i], you = dr.you[i];
        const win = you < him - 0.5;              // you would be standing there first
        tx('HIM', x + 6, cy + 31, { s: 9, c: DIM });
        tx(isFinite(him) ? `${him.toFixed(1)}m` : '—', x + cw - 6, cy + 31,
          { s: 13, w: 'bold', c: his ? c : DIM, a: 'right' });
        tx('YOU', x + 6, cy + 49, { s: 9, c: DIM });
        tx(isFinite(you) ? `${you.toFixed(1)}m` : '—', x + cw - 6, cy + 49,
          { s: 13, w: 'bold', c: win ? GRN : '#ff9a2e', a: 'right' });
      });

      // his run to that door, as a track
      const tx0 = px + 12, tw = Math.max(120, cx0 - 16 - tx0), bar = py + 38;
      const prog = 1 - Math.min(1, f.exitDist / Math.max(0.001, f.exitDist0));
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(tx0, bar, tw, 16);
      ctx.fillStyle = back ? '#7a3a12' : RED; ctx.fillRect(tx0, bar, tw * prog, 16);
      box(tx0, bar, tw, 16, RED_D);
      const mx = tx0 + tw * prog;
      ctx.fillStyle = '#fff'; ctx.fillRect(mx - 1, bar - 4, 3, 24);
      tx(f.subjCode || 'SUBJECT', tx0 + 2, bar - 6, { s: 10, c: DIM });
      tx(dr ? (dr.sure ? 'ROUTE COMMITTED' : 'BOTH DOORS LIVE') : '', tx0 + tw, bar - 6,
        { s: 10, w: 'bold', c: dr && dr.sure ? RED : AMB, a: 'right' });
      tx(`GAP ${f.dist.toFixed(1)}m`, tx0 + 2, bar + 34, { s: 13, w: 'bold', c: AMB });
      tx(f.eta ? `OUT IN ${f.eta.toFixed(1)}s` : '', tx0 + tw, bar + 34,
        { s: 13, w: 'bold', c: back ? '#ff9a2e' : RED, a: 'right' });

      // --- THE COMMITMENT MOMENT ---------------------------------------------
      // He has turned and broken for the rear cross-aisle. It is the one
      // irreversible decision in this chase and it is worth thirty metres, and
      // until now the player found out about it by losing. Say it out loud.
      if (back) {
        const fl = (G.now % 0.8) < 0.5;
        ctx.fillStyle = fl ? 'rgba(128,44,8,0.95)' : 'rgba(58,20,4,0.95)';
        ctx.fillRect(px, 146, pw, 34);
        box(px, 146, pw, 34, fl ? '#ff7a2e' : '#7a3a12');
        tx('▲ ' + (f.backLine || 'SUBJECT BREAKING FOR THE REAR'), px + 16, 169,
          { s: 15, w: 'bold', c: fl ? '#ffd9b3' : '#ff9a2e', ls: 1.8 });
        tx(f.backSub || '', px + pw - 16, 169,
          { s: 11, w: 'bold', c: fl ? '#ffb98a' : '#a3521c', a: 'right' });
      }
    }

    // --- WIND: A CADENCE INSTRUMENT, NOT A BUDGET ----------------------------
    // ROUND 5. This panel used to be a 22-segment bar draining a 3.10 s tank
    // that took 9.1 s to refill, against a 3.0 s median chase — an honest
    // picture of a one-shot resource, and a resource is not a decision. The
    // tank is 1.40 s now and comes back in 0.81 s off the key, so a 5.8 s chase
    // holds 2.6 complete spend-and-refill cycles and the question stops being
    // "how much is left" and becomes "do I go NOW or in half a second". Four
    // changes, all of them the same change:
    //   * SEGMENTS ARE BURSTS. Sized off burstMax rather than a hardcoded 22 —
    //     at a 1.40 s tank, 22 segments is one every 64 ms, which is noise. Fat
    //     and countable, because "I have two left" has to land in peripheral
    //     vision during a chase.
    //   * THREE STATES, NOT TWO. READY / RECOVERING / WINDED, off the state
    //     machine agents.js reports, instead of re-deriving it from stamina<eps.
    //   * THE HEADLINE IS THE DECISION. With wind in hand it is the seconds of
    //     run you are holding; winded, it is the seconds until you can go —
    //     and that countdown ONLY MOVES WITH THE KEY UP. agents.js hands it
    //     over as Infinity while it is held, so the panel says LET GO instead
    //     of a number. That is the whole lesson of the round, on a readout.
    //   * THE FLASH MOVED FROM SPENDING TO READY. Pulsing while you sprint
    //     tells a man holding a key that he is holding a key; flaring the
    //     instant the tank returns is what a rhythm is cued off. See report().
    // PULSE runs off `fatigue`, a lagging accumulation, rather than 1-frac
    // restated — with a tank this fast the bar bounces, and PULSE is the only
    // element left that can carry a whole chase's worth of wear.
    //
    // NOT HERE, DELIBERATELY: anything pointing at a powerup. A drink in hand
    // is worth +13 points and going to fetch one is worth nothing, because the
    // detour costs what the drink buys. Opportunism is a reward; a HUD that
    // sent players shopping mid-chase would be selling a losing plan.
    const t = G.tel, sx = 10, sy = 606, sw = 470, sh = 104;
    const bMax = t.burstMax || (t.staminaMax || 1);
    const frac = Math.max(0, Math.min(1, t.windFrac != null ? t.windFrac
      : t.stamina / (t.staminaMax || 1)));
    const gassed = t.wind === 'winded' || t.gassed;
    const burst = gassed ? 0 : (t.burst != null ? t.burst : frac * bMax);
    const held = !(t.windIn < Infinity);          // key still down: nothing is coming back
    const boost = t.boost > 0;
    const lvl = frac < 0.34 ? '#ff9a2e' : GRN;
    const col = boost ? '#ffe36a' : gassed ? RED : t.wind === 'ready' ? GRN : lvl;
    const state = boost ? 'SUGAR' : gassed ? 'WINDED'
      : t.sprint ? 'SPRINTING' : t.wind === 'ready' ? 'READY' : 'RECOVERING';

    panel(sx, sy, sw, sh, 'WIND', { accent: col, line: gassed ? RED_D : LINE });
    // the tank just came back — go
    const flare = t.readyAt != null && G.now - t.readyAt < 0.4;
    if (flare) {
      ctx.globalAlpha = 0.85 * (1 - (G.now - t.readyAt) / 0.4);
      box(sx - 3, sy - 3, sw + 6, sh + 6, GRN, 3); ctx.globalAlpha = 1;
    }

    // segments = bursts. Countable, sized off the model.
    const segs = Math.max(2, Math.min(6, Math.round(bMax / 0.45)));
    const bw2 = sw - 148;
    segbar(sx + 16, sy + 28, bw2, 32, boost ? 1 : burst / bMax,
      { on: col, seg: segs, line: gassed ? RED_D : LINE });
    // Winded is a full-refill lockout, so the segments stay dark for the whole
    // 0.81 s. The tank IS filling though, and watching it fill is the thing
    // that teaches the rhythm — so it gets its own strip rather than nothing.
    if (gassed) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(sx + 16, sy + 66, bw2, 6);
      ctx.fillStyle = held ? RED_D : RED; ctx.fillRect(sx + 16, sy + 66, bw2 * frac, 6);
      box(sx + 16, sy + 66, bw2, 6, RED_D);
    }

    // state + the one number that is a decision
    tx(state, sx + sw - 14, sy + 44, { s: 15, w: 'bold', c: col, a: 'right', ls: 1.6 });
    const flash = (G.now % 0.66) < 0.40;
    let head, hc = col;
    if (boost) head = `${t.boost.toFixed(1)}s`;
    else if (gassed && held) { head = flash ? 'LET GO' : ' '; hc = RED; }
    else if (gassed) head = `${Math.max(0, t.windIn || 0).toFixed(1)}s`;
    else head = `${burst.toFixed(1)}s`;
    tx(head, sx + sw - 14, sy + 78, { s: 26, w: 'bold', c: hc, a: 'right', ls: 1 });

    // bottom row: what the key does, and a pulse that remembers
    const hint = gassed && held ? 'RELEASE [SHIFT] TO GET IT BACK'
      : t.sprint ? '[SHIFT] SPRINTING'
      : '[SHIFT] SPRINT   [WASD] MOVE';
    tx(hint, sx + 16, sy + 92, { s: 12, w: gassed && held ? 'bold' : '', c: gassed && held ? RED : DIM, ls: 1 });
    const fat = Math.max(0, Math.min(1, t.fatigue == null ? 1 - frac : t.fatigue));
    tx(`PULSE ${Math.round(96 + fat * 88)}`, sx + 16 + bw2, sy + 92,
      { s: 12, w: 'bold', c: fat > 0.66 ? RED : fat > 0.33 ? '#ff9a2e' : DIM, a: 'right' });

    if (gassed) { // red frame creep, so you feel it without reading anything
      const a = 0.12 + 0.1 * Math.sin(G.now * 8);
      ctx.strokeStyle = `rgba(255,74,58,${a})`; ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, W - 14, H - 14);
    }

    // --- score block
    panel(1000, 606, 270, 104, 'RECORD');
    tx(G.rankName, 1010, 646, { s: 16, w: 'bold', c: AMB, ls: 1.2, max: 250 });
    tx(`${G.st.points}`, 1010, 678, { s: 22, w: 'bold', c: GRN });
    tx('PTS', 1010 + String(G.st.points).length * 14 + 8, 678, { s: 11, c: DIM });
    for (let i = 0; i < 3; i++) {
      const on = i < G.st.complaints;
      ctx.fillStyle = on ? RED : 'rgba(255,255,255,0.10)';
      ctx.fillRect(1198 + i * 20, 664, 15, 15);
      box(1198 + i * 20, 664, 15, 15, on ? RED : LINE);
    }
    tx('COMPLAINTS', 1258, 656, { s: 10, c: DIM, a: 'right' });
    tx('[Q] RETURN TO POST', 1010, 700, { s: 11, c: '#5d7364' });

    // --- centre prompt / dialogue
    if (f && f.dialogue) {
      const d = f.dialogue, bx = 300, bw = 680, bhh = 34 + d.shown.length * 26;
      const byy = 590 - bhh;
      panel(bx, byy, bw, bhh, d.speaker, { accent: d.bad ? RED : '#9bb9a4' });
      d.shown.forEach((ln, i) => tx(ln, bx + 16, byy + 40 + i * 26,
        { s: 17, c: '#e8f4ea', ls: 0.4, max: bw - 32 }));
    } else if (f && f.prompt) {
      const w2 = f.prompt.length * 9 + 40;
      ctx.fillStyle = 'rgba(3,7,4,0.86)'; ctx.fillRect(W / 2 - w2 / 2, 540, w2, 34);
      box(W / 2 - w2 / 2, 540, w2, 34, AMB);
      tx(f.prompt, W / 2, 563, { s: 15, w: 'bold', c: AMB, a: 'center', ls: 1.4 });
    }
    if (f && f.stampT > 0) {
      ctx.globalAlpha = Math.min(1, f.stampT * 2.2);
      stamp(f.stampText, W / 2, 236, { s: 38, c: RED });
      if (f.stampSub) {
        const sw2 = f.stampSub.length * 9 + 28;
        ctx.fillStyle = 'rgba(3,6,4,0.82)'; ctx.fillRect(W / 2 - sw2 / 2, 268, sw2, 22);
        tx(f.stampSub, W / 2, 284, { s: 13, w: 'bold', c: RED, a: 'center', ls: 1 });
      }
      ctx.globalAlpha = 1;
    }
    ticker(G, 500, 700, 480, true);
    burnIn();
  }

  // --------------------------------------------------------------- WRITE-UP
  function drawWriteup(G) {
    const w = G.wu;
    ctx.fillStyle = 'rgba(2,4,3,0.86)'; ctx.fillRect(0, 0, W, H);
    scan(0, 0, W, H, 0.22);
    topBand(G, 52, 'INCIDENT IN PROGRESS — DO NOT LEAVE POST (POST IS ALREADY UNMANNED)');

    const px = 150, py = 92, pw = 980, ph = 520;
    panel(px, py, pw, ph, `INCIDENT REPORT  ${w.caseNo}`, { bg: 'rgba(3,7,4,0.96)' });

    const rows = [
      ['SUBJECT', w.name], ['SUBJECT ID', w.code], ['LOCATION', `AISLE ${w.aisle + 1}`],
      ['MERCHANDISE', w.item], ['VALUE', `$${w.value.toFixed(2)}`],
      ['RECOVERED', 'YES'], ['POLICE CALLED', 'NO'], ['REPORTING LP', 'UNIT 1 (SELF)'],
    ];
    const shown = Math.min(rows.length, Math.floor(w.t * 7) + (w.stage > 0 ? rows.length : 0));
    rows.slice(0, shown).forEach(([k, v], i) => {
      const ry = py + 44 + i * 26;
      tx(k, px + 22, ry, { s: 12, c: DIM, ls: 1.2 });
      ctx.fillStyle = 'rgba(125,253,160,0.10)'; ctx.fillRect(px + 190, ry - 15, 500, 21);
      tx(v, px + 198, ry, { s: 14, w: 'bold', c: GRN, max: 490 });
    });
    if (w.stage === 0 && (G.now % 0.7) < 0.4 && shown < rows.length) {
      ctx.fillStyle = GRN; ctx.fillRect(px + 198, py + 30 + shown * 26, 9, 15);
    }

    const dy = py + 280;
    if (w.stage >= 1) {
      ctx.fillStyle = LINE; ctx.fillRect(px + 22, dy - 22, pw - 44, 1);
      tx('VERBAL TRESPASS WARNING — DELIVERED', px + 22, dy - 30, { s: 11, c: DIM, ls: 1.4 });
    }
    if (w.stage === 1) {
      panel(px + 22, dy, pw - 44, 34 + w.lines.length * 27, 'YOU');
      w.lines.forEach((ln, i) => tx(ln, px + 38, dy + 42 + i * 27,
        { s: 18, c: '#e8f4ea', max: pw - 76 }));
    }
    if (w.stage === 2) {
      panel(px + 22, dy, pw - 44, 34 + w.lines.length * 24, 'SYSTEM LOG');
      w.lines.forEach((ln, i) => tx(ln, px + 38, dy + 40 + i * 24,
        { s: 14, w: 'bold', c: GRN, max: pw - 76 }));
    }
    if (w.stage === 3) {
      panel(px + 22, dy - 8, pw - 44, 34 + w.lines.length * 28, 'DALE M. — STORE MANAGER',
        { accent: '#ffe36a' });
      w.lines.forEach((ln, i) => {
        const fresh = i === w.lines.length - 1;
        tx(ln, px + 38, dy + 34 + i * 28, {
          s: 18, c: fresh ? '#fff6d6' : 'rgba(232,244,234,0.62)', max: pw - 76,
        });
      });
    }
    if (w.stage === 4) {
      const k = Math.min(1, w.t * 3);
      ctx.globalAlpha = k;
      stamp(`+${w.award} PTS`, W / 2, dy + 32, { s: 46, c: GRN, rot: -4 });
      ctx.globalAlpha = 1;
      const barY = dy + 94, bw2 = pw - 200;
      tx(`${G.rankName}`, px + 100, barY - 12, { s: 13, w: 'bold', c: AMB, ls: 1.2 });
      tx(w.nextLabel, px + 100 + bw2, barY - 12, { s: 12, c: DIM, a: 'right' });
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(px + 100, barY, bw2, 16);
      ctx.fillStyle = AMB; ctx.fillRect(px + 100, barY, bw2 * w.rankFrac, 16);
      box(px + 100, barY, bw2, 16, LINE);
      const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
      tx(`SHIFT TOTAL — ${G.st.points} PTS · ${pl(G.st.caught, 'RECOVERY', 'RECOVERIES')}`
        + ` · ${pl(G.st.escaped, 'LOSS', 'LOSSES')} · ${pl(G.st.complaints, 'COMPLAINT', 'COMPLAINTS')}`,
      W / 2, barY + 32, { s: 12, c: DIM, a: 'center', ls: 0.8 });
      if (w.promo) {
        ctx.globalAlpha = Math.min(1, Math.max(0, w.t - 0.7) * 2.5);
        stamp(`PROMOTED — ${G.rankName.toUpperCase()}`, W / 2, dy + 180, { s: 24, c: AMB, rot: -5 });
        tx(w.promoSub, W / 2, dy + 222, { s: 13, w: 'bold', c: AMB, a: 'center', ls: 1 });
        ctx.globalAlpha = 1;
      }
    }
    ctx.fillStyle = 'rgba(2,4,3,0.9)'; ctx.fillRect(W - 176, H - 36, 164, 22);
    tx('[SPACE] CONTINUE', W - 26, H - 22, { s: 12, c: DIM, a: 'right', ls: 1.4 });
    burnIn();
  }

  // ---------------------------------------------------------------- DEMOTED
  function drawDemoted(G) {
    ctx.fillStyle = 'rgba(1,3,2,0.965)'; ctx.fillRect(0, 0, W, H);
    scan(0, 0, W, H, 0.24);
    const px = 236, py = 44, pw = 808, ph = 636;
    const LH = 22, y0 = py + 152;
    panel(px, py, pw, ph, 'PERSONNEL — CONFIDENTIAL', { bg: 'rgba(4,9,5,0.98)', accent: '#c9cfc9' });
    G.hr.head.forEach((s, i) => tx(s, px + 40, py + 62 + i * 26,
      { s: i === 0 ? 17 : 14, w: 'bold', c: i === 0 ? '#e6efe7' : DIM, ls: 1.6 }));
    ctx.fillStyle = LINE; ctx.fillRect(px + 40, py + 122, pw - 80, 1);
    const n = Math.min(G.hr.body.length, Math.floor(G.hr.t * 9));
    G.hr.body.slice(0, n).forEach((s, i) => tx(s, px + 40, y0 + i * LH, { s: 15, c: '#cfe0d3', ls: 0.3 }));
    const end = y0 + G.hr.body.length * LH;
    if (n >= G.hr.body.length) {
      tx(G.hr.sign, px + 40, end + 22, { s: 13, c: DIM, ls: 0.6 });
      ctx.fillStyle = LINE; ctx.fillRect(px + 40, end + 44, pw - 80, 1);
      tx(`FINAL: ${G.st.points} PTS · ${G.st.caught} RECOVERIES · ${G.st.escaped} LOSSES`,
        px + 40, end + 68, { s: 12, c: DIM });
      if ((G.now % 1.2) < 0.8) {
        tx('[R] REPORT TO TRAFFIC DUTY', px + pw / 2, py + ph - 22,
          { s: 16, w: 'bold', c: AMB, a: 'center', ls: 2 });
      }
    } else if ((G.now % 0.6) < 0.35) {
      ctx.fillStyle = '#cfe0d3'; ctx.fillRect(px + 40, y0 - 12 + n * LH, 10, 16);
    }
    if (G.hr.t > 2.2) {
      ctx.globalAlpha = Math.min(0.94, (G.hr.t - 2.2) * 1.6);
      stamp('REASSIGNED', 878, 500, { s: 46, c: RED, rot: -9 });
      ctx.globalAlpha = 1;
    }
    burnIn();
  }

  // ------------------------------------------------------------------ render
  hud.render = function render(G) {
    regions = [];
    ctx.clearRect(0, 0, W, H);
    try {
      if (G.st.mode === 'desk') drawDesk(G);
      else if (G.st.mode === 'floor') drawFloor(G);
      else if (G.st.mode === 'writeup') drawWriteup(G);
      else if (G.st.mode === 'demoted') drawDemoted(G);
    } catch (e) {
      ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, 40);
      tx('HUD: ' + (e && e.message), 12, 26, { s: 13, c: RED });
      if (!render._logged) { render._logged = 1; console.error('[game/hud]', e); }
    }
  };

  // Viewport px -> 1280x720 HUD space, matching object-fit: contain.
  hud.toLocal = function (ev) {
    const r = cv.getBoundingClientRect();
    const s = Math.min(r.width / W, r.height / H);
    return { x: (ev.clientX - r.left - (r.width - W * s) / 2) / s,
      y: (ev.clientY - r.top - (r.height - H * s) / 2) / s };
  };
  hud.hit = function (x, y) {
    for (let i = regions.length - 1; i >= 0; i--) {
      const r = regions[i];
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r;
    }
    return null;
  };
  // Composite 3D + HUD and POST it to the shot sink, so screenshots show the HUD.
  hud.shot = async function (name) {
    const src = window.__CHOP && window.__CHOP.renderer && window.__CHOP.renderer.domElement;
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const o = off.getContext('2d');
    o.fillStyle = '#000'; o.fillRect(0, 0, W, H);
    if (src) { try { o.drawImage(src, 0, 0, W, H); } catch { /* tainted */ } }
    o.drawImage(cv, 0, 0);
    const res = await fetch('/shot?name=' + encodeURIComponent(name),
      { method: 'POST', body: off.toDataURL('image/png') });
    return res.text();
  };
  return hud;
}
