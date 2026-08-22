// OWNER: builder-cctv. The two 2D canvases the wall composites on top of the feeds.
//
//   furniture — static: the dark room, the monitor housings, bezels, chins,
//               power LEDs, the desk and the light each screen spills onto it.
//               Transparent exactly where a screen goes.
//   burn-in   — dynamic (~4 Hz): camera id, label, live timestamp, REC dot.
//               Repainted only when the visible text actually changes.

import { drawText, drawTextR, textW } from './font5x7.js';

const rr = (ctx, x, y, w, h, r) => {
  if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

export function makeCanvas(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  return cv;
}

// Seeded RNG. The furniture used Math.random() for its wall speckle, which made
// every reload a slightly different image and every round-to-round screenshot
// comparison a guess. Same seed, same office, every time.
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Static furniture
// ---------------------------------------------------------------------------
export function paintFurniture(cv, W, H, tiles, L) {
  const ctx = cv.getContext('2d');
  const rnd = rng(0x5eed17);
  ctx.clearRect(0, 0, W, H);

  // --- back wall of the security office ------------------------------------
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0.00, '#0d0e11');
  wall.addColorStop(0.45, '#111318');
  wall.addColorStop(0.86, '#0a0b0e');
  wall.addColorStop(1.00, '#050608');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);

  // faint wall texture so the negative space is not a flat digital black
  ctx.globalAlpha = 0.035;
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * W, y = rnd() * H;
    ctx.fillStyle = rnd() > 0.5 ? '#6f7684' : '#000000';
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }
  ctx.globalAlpha = 1;

  // --- light spilling off every screen onto the wall and desk --------------
  if (ctx.filter !== undefined) ctx.filter = 'blur(26px)';
  ctx.globalCompositeOperation = 'lighter';
  for (const t of tiles) {
    ctx.fillStyle = 'rgba(96,112,130,0.30)';
    ctx.fillRect(t.x - 26, t.y - 22, t.w + 52, t.h + 44);
  }
  // the desk catches a smeared reflection under each column
  const cols = {};
  for (const t of tiles) cols[t.x] = t;
  for (const k in cols) {
    const t = cols[k];
    ctx.fillStyle = 'rgba(70,84,102,0.22)';
    ctx.fillRect(t.x + 26, L.deskY + 6, t.w - 52, 54);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (ctx.filter !== undefined) ctx.filter = 'none';

  // --- desk ----------------------------------------------------------------
  const desk = ctx.createLinearGradient(0, L.deskY, 0, H);
  desk.addColorStop(0.00, '#20222a');
  desk.addColorStop(0.06, '#15171d');
  desk.addColorStop(0.60, '#0e0f13');
  desk.addColorStop(1.00, '#08090c');
  ctx.fillStyle = desk;
  ctx.fillRect(0, L.deskY, W, H - L.deskY);
  ctx.fillStyle = 'rgba(150,166,190,0.30)';   // lit front edge of the desktop
  ctx.fillRect(0, L.deskY, W, 1.5);

  // keyboard silhouette, bottom centre — sells "you are sitting at this desk"
  const kbW = 430, kbH = 46, kbX = (W - kbW) / 2, kbY = H - kbH + 12;
  ctx.fillStyle = '#0b0c0f';
  rr(ctx, kbX, kbY, kbW, kbH, 5); ctx.fill();
  ctx.strokeStyle = 'rgba(140,152,172,0.22)'; ctx.lineWidth = 1;
  rr(ctx, kbX + 0.5, kbY + 0.5, kbW - 1, kbH - 1, 5); ctx.stroke();
  ctx.fillStyle = 'rgba(120,132,152,0.10)';
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 24; c++) {
      ctx.fillRect(kbX + 10 + c * 17.2, kbY + 7 + r * 13, 13, 9);
    }
  }

  // --- monitor mount rail across the top ----------------------------------
  ctx.fillStyle = '#0a0b0e';
  ctx.fillRect(0, L.railY, W, 5);
  ctx.fillStyle = 'rgba(130,142,162,0.16)';
  ctx.fillRect(0, L.railY, W, 1);

  // --- cable runs, drawn BEFORE the monitors so they hang behind them ------
  // Eight monitors is sixteen cables and nobody has ever dressed them. They
  // drop out of the rail, sag, and disappear behind the next housing down.
  const gaps = [];
  for (let c = 0; c <= L.cols; c++) {
    const cw = L.gridW / L.cols;
    gaps.push(L.gridX + c * cw);
  }
  ctx.lineCap = 'round';
  for (const gx of gaps) {
    const n = 1 + ((rnd() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const x0 = gx + (rnd() - 0.5) * 9;
      const sag = 14 + rnd() * 40;
      const yEnd = L.deskY - rnd() * 40;
      ctx.strokeStyle = `rgba(${18 + rnd() * 10 | 0},${19 + rnd() * 10 | 0},24,${0.55 + rnd() * 0.3})`;
      ctx.lineWidth = 1.6 + rnd() * 1.7;
      ctx.beginPath();
      ctx.moveTo(x0, L.railY + 4);
      ctx.bezierCurveTo(x0 + sag * 0.5, L.railY + 120, x0 - sag, yEnd - 150, x0 + (rnd() - 0.5) * 14, yEnd);
      ctx.stroke();
      // the one dull highlight a black cable catches off the screens
      ctx.strokeStyle = 'rgba(120,134,156,0.10)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  }

  // --- the monitors --------------------------------------------------------
  tiles.forEach((t, i) => {
    const hx = t.x - L.bezelX, hy = t.y - L.bezelTop;
    const hw = t.w + L.bezelX * 2, hh = t.h + L.bezelTop + L.chin;

    // neck + foot, peeking out below each housing on the bottom row only
    if (t.y + t.h + L.chin < L.deskY - 4) {
      ctx.fillStyle = '#101116';
      ctx.fillRect(hx + hw / 2 - 9, hy + hh, 18, 10);
    }

    // plastic housing with a top bevel highlight
    const g = ctx.createLinearGradient(0, hy, 0, hy + hh);
    g.addColorStop(0.00, '#2a2d36');
    g.addColorStop(0.03, '#1a1c23');
    g.addColorStop(0.75, '#141519');
    g.addColorStop(1.00, '#0e0f13');
    ctx.fillStyle = g;
    rr(ctx, hx, hy, hw, hh, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(160,172,192,0.13)'; ctx.lineWidth = 1;
    rr(ctx, hx + 0.5, hy + 0.5, hw - 1, hh - 1, 6); ctx.stroke();

    // inner bezel lip, then a near-black ring hugging the glass
    ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
    ctx.strokeRect(t.x - 2.5, t.y - 2.5, t.w + 5, t.h + 5);
    ctx.strokeStyle = 'rgba(150,160,178,0.10)'; ctx.lineWidth = 1;
    ctx.strokeRect(t.x - 4.5, t.y - 4.5, t.w + 9, t.h + 9);

    // chin: channel number, a fake brand, and a power LED
    const cy = t.y + t.h + Math.round((L.chin - 14) / 2);
    drawText(ctx, 'CH' + String(i + 1).padStart(2, '0'), hx + 12, cy, 2,
      'rgba(168,180,198,0.55)', 'rgba(0,0,0,0.55)');
    const brand = 'VIGILANT  DS-816';
    drawTextR(ctx, brand, hx + hw - 26, cy + 2, 1, 'rgba(150,162,180,0.30)', null);
    const ledOn = i !== 3;                       // one monitor's LED is dead
    ctx.fillStyle = ledOn ? 'rgba(120,255,150,0.85)' : 'rgba(90,100,110,0.35)';
    ctx.beginPath(); ctx.arc(hx + hw - 13, cy + 7, 2.4, 0, 7); ctx.fill();
    if (ledOn) {
      ctx.fillStyle = 'rgba(120,255,150,0.16)';
      ctx.beginPath(); ctx.arc(hx + hw - 13, cy + 7, 6.5, 0, 7); ctx.fill();
    }

    // punch the glass out so the feed shows through
    ctx.clearRect(t.x, t.y, t.w, t.h);
  });

  paintClutter(ctx, tiles, L, rnd);

  // --- room vignette, painted last over everything but the glass ----------
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.62)');
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';   // never repaints the punched holes
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  return cv;
}

// ---------------------------------------------------------------------------
// Clutter. Drawn AFTER the glass is punched out, so a note stuck on the corner
// of a panel genuinely covers the feed — which is what the note is for.
//
// This is the cheapest realism per pixel on the whole wall. A monitor bank with
// nothing taped to it has never existed in a loss-prevention office; every real
// one has a shift sheet, a phone extension and somebody's handwriting on it.
// Everything here stays above L.deskY, which belongs to the HUD.
// ---------------------------------------------------------------------------
function stickyNote(ctx, x, y, w, h, rot, face, edge, lines, rnd) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rot);
  ctx.translate(-w / 2, -h / 2);

  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(2.5, 3, w, h);                 // it stands off the glass a little
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, face); g.addColorStop(1, edge);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.16)';         // curled bottom edge
  ctx.fillRect(0, h - 2.5, w, 2.5);

  // biro scribble: broken strokes, not text — you are not meant to read it
  ctx.strokeStyle = 'rgba(28,34,58,0.62)';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < lines; i++) {
    const ly = 6 + i * ((h - 9) / lines);
    let lx = 5;
    ctx.beginPath();
    while (lx < w - 5) {
      const seg = 4 + rnd() * 12;
      ctx.moveTo(lx, ly + (rnd() - 0.5) * 1.6);
      ctx.lineTo(Math.min(w - 5, lx + seg), ly + (rnd() - 0.5) * 1.6);
      lx += seg + 2 + rnd() * 3;
    }
    ctx.stroke();
  }
  ctx.restore();
}

function paintClutter(ctx, tiles, L, rnd) {
  // 1. yellow note on the bottom-left corner of CH02's glass
  const a = tiles[1];
  stickyNote(ctx, a.x - 6, a.y + a.h - 40, 46, 42, -0.09,
    'rgba(226,214,126,0.96)', 'rgba(198,182,96,0.96)', 3, rnd);

  // 2. smaller pink one taped along the top bezel of the exit-door monitor,
  //    dipping just onto the glass. Kept clear of the id and the REC dot.
  const b = tiles[6];
  stickyNote(ctx, b.x + 132, b.y - 26, 38, 34, 0.13,
    'rgba(226,150,162,0.95)', 'rgba(198,122,136,0.95)', 2, rnd);

  // 3. label-maker strips on two chins. A P-touch strip is the one kind of
  //    handwriting a 5x7 bitmap font can honestly stand in for.
  const strip = (t, txt, dx) => {
    const sx = t.x + dx, sy = t.y + t.h + 9, sw = textW(txt, 1) + 12, sh = 13;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(sx + 1, sy + 1, sw, sh);
    ctx.fillStyle = 'rgba(214,216,206,0.80)';
    ctx.fillRect(sx, sy, sw, sh);
    drawText(ctx, txt, sx + 6, sy + 3, 1, 'rgba(16,18,22,0.88)', null);
  };
  strip(tiles[6], 'DOORS X241', 92);
  strip(tiles[3], 'BAD FOCUS', 58);

  // 4. a strip of masking tape over CH04's dead power LED, because that is what
  //    people do instead of fixing it
  const d = tiles[3];
  ctx.save();
  ctx.translate(d.x + d.w - 26, d.y + d.h + 16);
  ctx.rotate(-0.07);
  ctx.fillStyle = 'rgba(206,190,150,0.55)';
  ctx.fillRect(0, 0, 30, 9);
  ctx.restore();

  // 5. dust and thumbprints along the bottom bezel lip of every panel
  for (const t of tiles) {
    for (let i = 0; i < 26; i++) {
      const x = t.x + rnd() * t.w;
      const y = t.y + t.h - rnd() * rnd() * 10;
      ctx.fillStyle = `rgba(196,204,216,${0.03 + rnd() * 0.05})`;
      ctx.fillRect(x | 0, y | 0, 1 + ((rnd() * 2) | 0), 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Live burn-in
// ---------------------------------------------------------------------------
const p2 = (n) => String(n).padStart(2, '0');

/** DVR stamp: MM/DD/YYYY HH:MM:SS, 24h, exactly what these boxes print. */
export function stampParts(d) {
  return {
    date: `${p2(d.getMonth() + 1)}/${p2(d.getDate())}/${d.getFullYear()}`,
    time: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`,
  };
}

const TXT = 'rgba(232,238,228,0.86)';
const DIM = 'rgba(214,226,208,0.60)';
// The overlay has to survive being printed over a blown-out ceiling, which is
// where half of these cameras point. That is what the keyline is for.
const SHA = 'rgba(0,0,0,0.80)';

// Vertical geometry of one tile's overlay, all measured from the tile edges.
// A glyph at scale s occupies s*7 rows plus one row of drop shadow, so a scale-2
// line is 16px tall. ROW2 puts the second line one glyph-height plus 3px below
// the first. STAMP_UP is measured so the bottom line's LAST row lands 9px above
// the bottom edge — the round-1 bug was two 16px-tall lines anchored 21 and 6
// from the bottom, which put the time half outside the panel and printed its top
// three rows over the date's descenders.
const PAD = 8, ROW2 = 17, LINE = 16;
// The channel id has to stay readable at 280px wide — gameplay depends on it —
// but the timestamp does not, and a stamp that spans 80% of the tile is the
// thing that makes a mosaic read as a game HUD. Real DVR OSD in an 8-up view is
// small enough that you can only just make it out. So: id big, stamp small.
const STAMP_S = 1, STAMP_H = STAMP_S * 7 + 1, STAMP_UP = PAD + STAMP_H;

export function paintBurnIn(cv, W, H, tiles, cams, active, now, blink) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const { date, time } = stampParts(now);
  const oneLine = `${date} ${time}`;

  tiles.forEach((t, i) => {
    const cam = cams[i] || { id: 'CAM ' + p2(i + 1), label: '' };
    const px = t.x + PAD, py = t.y + PAD;
    const rx = t.x + t.w - PAD;

    // top-left: channel identity, burnt in over years of the same overlay
    drawText(ctx, cam.id, px, py, 2, TXT, SHA);
    drawText(ctx, cam.label, px, py + ROW2, 2, DIM, SHA);

    // top-right: the blinking record indicator
    drawTextR(ctx, 'REC', rx, py, 2, blink ? 'rgba(255,120,110,0.92)' : 'rgba(150,84,80,0.45)', SHA);
    const dotX = rx - textW('REC', 2) - 9;
    ctx.fillStyle = blink ? 'rgba(255,58,48,0.95)' : 'rgba(112,34,30,0.5)';
    ctx.beginPath(); ctx.arc(dotX, py + 6, 4, 0, 7); ctx.fill();
    if (blink) {
      ctx.fillStyle = 'rgba(255,58,48,0.18)';
      ctx.beginPath(); ctx.arc(dotX, py + 6, 8.5, 0, 7); ctx.fill();
    }

    // bottom-right: MM/DD/YYYY HH:MM:SS on one line, which is what these boxes
    // print. Only if it actually fits — a narrower tile stacks it instead, and
    // the two lines are then a full line-height apart, never overlapping.
    if (textW(oneLine, STAMP_S) + PAD * 2 <= t.w) {
      drawTextR(ctx, oneLine, rx, t.y + t.h - STAMP_UP, STAMP_S, TXT, SHA);
    } else {
      drawTextR(ctx, date, rx, t.y + t.h - STAMP_UP - STAMP_H - 3, STAMP_S, TXT, SHA);
      drawTextR(ctx, time, rx, t.y + t.h - STAMP_UP, STAMP_S, TXT, SHA);
    }

    // the selected channel gets a tag under REC; the bottom strip is the
    // timestamp's and nothing else is allowed to share it.
    if (i === active) {
      drawTextR(ctx, 'LIVE', rx, py + ROW2, 2, 'rgba(158,232,172,0.88)', SHA);
    }
  });
  return cv;
}

/** Much lighter stamp for the on-foot view — it is still recorded footage. */
export function paintFloorBurnIn(cv, W, H, now, blink, label) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const { date, time } = stampParts(now);
  const rx = W - 22;

  drawTextR(ctx, 'REC', rx, 20, 2, blink ? 'rgba(255,120,110,0.9)' : 'rgba(150,84,80,0.4)', SHA);
  const dotX = rx - textW('REC', 2) - 10;
  ctx.fillStyle = blink ? 'rgba(255,58,48,0.92)' : 'rgba(112,34,30,0.45)';
  ctx.beginPath(); ctx.arc(dotX, 26, 4.5, 0, 7); ctx.fill();

  drawText(ctx, label, 22, 20, 2, 'rgba(232,238,228,0.80)', SHA);
  drawTextR(ctx, `${date} ${time}`, rx, H - 20 - LINE, 2, 'rgba(232,238,228,0.80)', SHA);
  return cv;
}
