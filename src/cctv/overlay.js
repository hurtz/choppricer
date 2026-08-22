// OWNER: builder-cctv. The 2D canvases the wall composites on top of the feeds.
//
//   furniture — static: the dark room, every monitor housing, the equipment
//               shelves, the DVR, the cable runs, the paper taped to the wall,
//               the desk and the light each screen spills onto it.
//               Transparent exactly where a piece of glass goes.
//   burn-in   — dynamic (~4 Hz): camera id, label, live timestamp, REC dot.
//               Repainted only when the visible text actually changes.
//   dead card — static: the NO SIGNAL card a wired-but-unconnected panel shows.
//
// Everything is authored in the fixed 1280x720 design space. All geometry comes
// in as PANELS from layout.js — nothing here assumes a grid, a count, or that
// two monitors are the same size.

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

// Every panel is drawn in its own frame, rotated about the centre of its glass
// so the housing and the 3D quad that fills it agree. Live channels always have
// rot === 0 — see layout.js for why.
function inPanel(ctx, p, fn) {
  if (!p.rot) { fn(); return; }
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate(p.rot);
  ctx.translate(-(p.x + p.w / 2), -(p.y + p.h / 2));
  fn();
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Static furniture
// ---------------------------------------------------------------------------
export function paintFurniture(cv, W, H, panels, wall) {
  const ctx = cv.getContext('2d');
  const rnd = rng(0x5eed17);
  ctx.clearRect(0, 0, W, H);

  // --- back wall of the security office ------------------------------------
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0.00, '#0d0e11');
  bg.addColorStop(0.45, '#111318');
  bg.addColorStop(0.86, '#0a0b0e');
  bg.addColorStop(1.00, '#050608');
  ctx.fillStyle = bg;
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
  // This is ADDITIVE, so its budget is per-wall and not per-monitor. Round 2's
  // 0.30 was tuned for eight well-spaced panels; ten panels packed this close
  // stacked their haloes and lifted the wall between them to a milky grey that
  // was LIGHTER than the bezels in front of it. A dark room is the whole reason
  // the pictures read as bright.
  if (ctx.filter !== undefined) ctx.filter = 'blur(26px)';
  ctx.globalCompositeOperation = 'lighter';
  for (const p of panels) {
    ctx.fillStyle = p.cam >= 0 ? 'rgba(92,108,128,0.115)' : 'rgba(84,94,112,0.075)';
    ctx.fillRect(p.x - 14, p.y - 12, p.w + 28, p.h + 24);
  }
  // the desk catches a smeared reflection under whatever is above it
  for (const p of panels) {
    if (p.y + p.h > wall.bottom - 40) continue;
    ctx.fillStyle = 'rgba(70,84,102,0.09)';
    ctx.fillRect(p.x + 20, wall.deskY + 6, p.w - 40, 54);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (ctx.filter !== undefined) ctx.filter = 'none';

  // --- desk ----------------------------------------------------------------
  const desk = ctx.createLinearGradient(0, wall.deskY, 0, H);
  desk.addColorStop(0.00, '#20222a');
  desk.addColorStop(0.06, '#15171d');
  desk.addColorStop(0.60, '#0e0f13');
  desk.addColorStop(1.00, '#08090c');
  ctx.fillStyle = desk;
  ctx.fillRect(0, wall.deskY, W, H - wall.deskY);
  ctx.fillStyle = 'rgba(150,166,190,0.30)';   // lit front edge of the desktop
  ctx.fillRect(0, wall.deskY, W, 1.5);

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

  paintCables(ctx, panels, wall, rnd);
  paintFixtures(ctx, panels, wall, rnd);

  // --- the monitors --------------------------------------------------------
  for (const p of panels) inPanel(ctx, p, () => paintHousing(ctx, p, rnd));
  // ...and punch every piece of glass out afterwards, so a housing drawn later
  // can overlap a neighbour's case without eating its picture.
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  for (const p of panels) {
    inPanel(ctx, p, () => { ctx.fillStyle = '#000'; ctx.fillRect(p.x, p.y, p.w, p.h); });
  }
  ctx.restore();

  paintClutter(ctx, panels, wall, rnd);

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

// --- one monitor ------------------------------------------------------------
function paintHousing(ctx, p, rnd) {
  const { hx, hy, hw, hh } = p;
  const st = p.style;

  // stand + foot for the one that sits on the shelf instead of a bracket
  if (p.stand) {
    ctx.fillStyle = st.low;
    ctx.fillRect(hx + hw / 2 - 13, hy + hh, 26, p.stand - 6);
    ctx.fillStyle = st.foot;
    rr(ctx, hx + hw / 2 - 44, hy + hh + p.stand - 7, 88, 8, 3); ctx.fill();
    ctx.fillStyle = 'rgba(180,192,210,0.10)';
    ctx.fillRect(hx + hw / 2 - 44, hy + hh + p.stand - 7, 88, 1);
  } else {
    // a stub of bracket peeking out from behind the case
    ctx.fillStyle = '#0d0e12';
    ctx.fillRect(hx + hw / 2 - 8, hy + hh - 2, 16, 9);
  }

  const g = ctx.createLinearGradient(0, hy, 0, hy + hh);
  g.addColorStop(0.00, st.top);
  g.addColorStop(0.04, st.body);
  g.addColorStop(0.74, st.low);
  g.addColorStop(1.00, st.foot);
  ctx.fillStyle = g;
  rr(ctx, hx, hy, hw, hh, Math.min(7, p.bx * 0.6 + 2)); ctx.fill();
  ctx.strokeStyle = st.lip; ctx.lineWidth = 1;
  rr(ctx, hx + 0.5, hy + 0.5, hw - 1, hh - 1, Math.min(7, p.bx * 0.6 + 2)); ctx.stroke();

  // Ageing: the putty cases have gone blotchy and the old graphite ones have a
  // dust line along the top edge. Cheap, and it is the thing that stops four
  // identical housings from reading as four instances of one mesh.
  if (p.styleName === 'putty') {
    ctx.globalAlpha = 0.10;
    for (let i = 0; i < 90; i++) {
      const bxp = hx + rnd() * hw, byp = hy + rnd() * hh;
      ctx.fillStyle = rnd() > 0.4 ? '#8d8468' : '#3a3428';
      ctx.fillRect(bxp | 0, byp | 0, 1 + ((rnd() * 3) | 0), 1);
    }
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(190,200,216,0.05)';
  ctx.fillRect(hx + 3, hy + 1, hw - 6, 1);

  // inner bezel lip, then a near-black ring hugging the glass
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
  ctx.strokeRect(p.x - 2.5, p.y - 2.5, p.w + 5, p.h + 5);
  ctx.strokeStyle = p.styleName === 'putty'
    ? 'rgba(190,178,148,0.14)' : 'rgba(150,160,178,0.10)';
  ctx.lineWidth = 1;
  ctx.strokeRect(p.x - 4.5, p.y - 4.5, p.w + 9, p.h + 9);

  // chin: channel number, a fake brand, and a power LED
  const cy = p.y + p.h + Math.round((p.chin - 14) / 2);
  const idS = p.chin >= 30 ? 2 : 1;
  drawText(ctx, p.chinId, hx + Math.max(8, p.bx), cy + (idS === 1 ? 4 : 0), idS,
    st.ink, 'rgba(0,0,0,0.45)');
  if (hw > 190) {
    drawTextR(ctx, p.brand, hx + hw - (p.chin >= 30 ? 26 : 20), cy + 2, 1, st.sub, null);
  }
  const on = p.cam >= 0 && !p.ledDead;
  const lx = hx + hw - (p.chin >= 30 ? 13 : 10), ly = cy + 7;
  const hue = st.led === 'amber' ? [255, 176, 74] : [120, 255, 150];
  ctx.fillStyle = on ? `rgba(${hue[0]},${hue[1]},${hue[2]},0.85)` : 'rgba(90,100,110,0.35)';
  ctx.beginPath(); ctx.arc(lx, ly, 2.4, 0, 7); ctx.fill();
  if (on) {
    ctx.fillStyle = `rgba(${hue[0]},${hue[1]},${hue[2]},0.16)`;
    ctx.beginPath(); ctx.arc(lx, ly, 6.5, 0, 7); ctx.fill();
  }
}

// --- cable runs -------------------------------------------------------------
// Two per monitor — power and video — dropping out of the back, sagging to
// whichever side is nearer, and disappearing behind the desk. Drawn before the
// housings so they only show in the gaps, which is where you actually see them.
function paintCables(ctx, panels, wall, rnd) {
  ctx.lineCap = 'round';
  const trunks = [8, 468, 918, 1258];
  const near = (x) => trunks.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));

  for (const p of panels) {
    const tx = near(p.hx + p.hw / 2);
    const n = 2 + ((rnd() * 2) | 0);
    for (let k = 0; k < n; k++) {
      const x0 = p.hx + p.hw * (0.25 + rnd() * 0.5);
      const y0 = p.hy + p.hh - 4;
      const yEnd = wall.deskY - rnd() * 30;
      const sag = 40 + rnd() * 90;
      ctx.strokeStyle = `rgba(${16 + rnd() * 12 | 0},${17 + rnd() * 12 | 0},23,${0.62 + rnd() * 0.28})`;
      ctx.lineWidth = 1.5 + rnd() * 1.9;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(x0 + (tx - x0) * 0.2, y0 + sag,
        tx + (rnd() - 0.5) * 26, yEnd - sag * 1.4,
        tx + (rnd() - 0.5) * 18, yEnd);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(126,140,164,0.15)';   // the one dull highlight black PVC catches
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }
  }

  // a hank of unused coax, coiled and hung on a nail in the bottom-right pocket
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(${20 + rnd() * 8 | 0},22,28,${0.78 + rnd() * 0.18})`;
    ctx.lineWidth = 2.2 + rnd() * 0.8;
    ctx.beginPath();
    ctx.ellipse(994 + i * 1.6 + (rnd() - 0.5) * 5, 554 + i * 3.4 + (rnd() - 0.5) * 5,
      26 - i * 1.4 + (rnd() - 0.5) * 4, 30 - i * 2.0 + (rnd() - 0.5) * 4,
      0.18 + (rnd() - 0.5) * 0.16, 0, 7);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(126,140,164,0.10)'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.ellipse(994, 554, 26, 30, 0.22, 0, 7); ctx.stroke();
}

// --- shelves, the DVR itself, and the paper on the wall ---------------------
function paintFixtures(ctx, panels, wall, rnd) {
  // steel shelf under whichever panel is standing on one
  for (const p of panels) {
    if (!p.shelf) continue;
    const [sx, sy, sw] = p.shelf;
    ctx.fillStyle = '#191b21';
    ctx.fillRect(sx, sy, sw, 9);
    ctx.fillStyle = 'rgba(168,182,204,0.16)';
    ctx.fillRect(sx, sy, sw, 1.4);
    ctx.fillStyle = '#0e1013';                       // L-brackets underneath
    ctx.fillRect(sx + 14, sy + 9, 7, 22);
    ctx.fillRect(sx + sw - 21, sy + 9, 7, 22);
  }

  // --- the recorder, on its own shelf bottom-left -------------------------
  const sx = 198, sy = 556, sw = 258;
  ctx.fillStyle = '#191b21'; ctx.fillRect(sx, sy, sw, 9);
  ctx.fillStyle = 'rgba(168,182,204,0.16)'; ctx.fillRect(sx, sy, sw, 1.4);
  ctx.fillStyle = '#0e1013';
  ctx.fillRect(sx + 12, sy + 9, 7, 26); ctx.fillRect(sx + sw - 19, sy + 9, 7, 26);

  const dx = 208, dy = 508, dw = 238, dh = 48;
  const dg = ctx.createLinearGradient(0, dy, 0, dy + dh);
  dg.addColorStop(0, '#232630'); dg.addColorStop(0.15, '#15171d'); dg.addColorStop(1, '#0b0c10');
  ctx.fillStyle = dg;
  rr(ctx, dx, dy, dw, dh, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(150,164,186,0.14)'; ctx.lineWidth = 1;
  rr(ctx, dx + 0.5, dy + 0.5, dw - 1, dh - 1, 3); ctx.stroke();
  ctx.fillStyle = '#07080a';                                   // optical drive slot
  ctx.fillRect(dx + 10, dy + 9, 92, 7);
  // dymo strip on the front, the way every rack box in every back office is
  ctx.fillStyle = 'rgba(186,188,178,0.62)';
  ctx.fillRect(dx + 10, dy + 24, 80, 11);
  drawText(ctx, 'DO NOT REBOOT', dx + 13, dy + 26, 1, 'rgba(18,20,24,0.9)', null);
  drawText(ctx, 'VIGILANT DVR-16', dx + 100, dy + 11, 1, 'rgba(158,170,190,0.42)', null);
  drawText(ctx, 'STORE 4417 A', dx + 100, dy + 24, 1, 'rgba(158,170,190,0.24)', null);
  ctx.fillStyle = 'rgba(120,134,156,0.10)';                    // vent slots
  for (let i = 0; i < 5; i++) ctx.fillRect(dx + dw - 46 + i * 6, dy + 9, 3, 30);
  // status LEDs, stacked down the right edge. One is amber and nobody knows why.
  const leds = ['#6cff9a', '#6cff9a', '#ffb04a', '#6cff9a', '#4ab4ff'];
  leds.forEach((c, i) => {
    ctx.fillStyle = c; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(dx + dw - 12, dy + 11 + i * 7, 2.0, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.13;
    ctx.beginPath(); ctx.arc(dx + dw - 12, dy + 11 + i * 7, 5.5, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  });

  // --- shift schedule taped to the wall above the recorder ----------------
  paperNote(ctx, 214, 452, 116, 50, -0.015, rnd, 'SHIFT');
  // --- camera map, curling, next to it ------------------------------------
  paperNote(ctx, 342, 456, 100, 44, 0.022, rnd, 'MAP');

  // --- clipboard hanging on a nail, bottom right --------------------------
  const cbx = 1176, cby = 520;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(cbx + 3, cby + 4, 66, 78);
  ctx.fillStyle = '#3b2f22'; ctx.fillRect(cbx, cby, 66, 78);          // masonite
  ctx.fillStyle = 'rgba(180,181,172,0.70)'; ctx.fillRect(cbx + 4, cby + 9, 58, 65);
  ctx.fillStyle = '#7e8794'; ctx.fillRect(cbx + 18, cby - 3, 30, 12); // the clip
  ctx.fillStyle = 'rgba(170,182,198,0.35)'; ctx.fillRect(cbx + 18, cby - 3, 30, 2);
  ctx.strokeStyle = 'rgba(40,46,66,0.45)'; ctx.lineWidth = 1;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(cbx + 9, cby + 18 + i * 7.6);
    ctx.lineTo(cbx + 9 + 20 + rnd() * 26, cby + 18 + i * 7.6);
    ctx.stroke();
  }

  // --- index card of extensions, taped flat ------------------------------
  paperNote(ctx, 1052, 536, 96, 52, 0.008, rnd, 'EXT');
}

function paperNote(ctx, x, y, w, h, rot, rnd, kind) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.rotate(rot); ctx.translate(-w / 2, -h / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(2, 3, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(176,176,166,0.72)');
  g.addColorStop(1, 'rgba(136,137,128,0.72)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // tape at the corners
  ctx.fillStyle = 'rgba(214,206,180,0.34)';
  ctx.fillRect(-6, -4, 22, 9); ctx.fillRect(w - 16, h - 5, 22, 9);

  ctx.fillStyle = 'rgba(40,46,62,0.55)';
  if (kind === 'SHIFT') {
    ctx.fillRect(6, 5, w - 12, 4);                       // header band
    for (let r = 0; r < 5; r++) {
      ctx.fillStyle = 'rgba(40,46,62,0.30)';
      ctx.fillRect(6, 14 + r * 7, w - 12, 1);
    }
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = 'rgba(40,46,62,0.22)';
      ctx.fillRect(6 + c * ((w - 12) / 4), 12, 1, h - 18);
    }
  } else if (kind === 'MAP') {
    ctx.strokeStyle = 'rgba(40,46,62,0.42)'; ctx.lineWidth = 1;
    ctx.strokeRect(8, 7, w - 16, h - 14);                // store outline
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(12 + i * ((w - 24) / 6), 11);
      ctx.lineTo(12 + i * ((w - 24) / 6), h - 11);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(170,40,30,0.7)';               // camera pips in red biro
    for (let i = 0; i < 7; i++) {
      ctx.beginPath();
      ctx.arc(12 + rnd() * (w - 24), 11 + rnd() * (h - 22), 1.8, 0, 7);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = 'rgba(28,34,58,0.55)'; ctx.lineWidth = 1.1;
    for (let r = 0; r < 5; r++) {
      let lx = 7;
      ctx.beginPath();
      while (lx < w - 26) {
        const seg = 4 + rnd() * 10;
        ctx.moveTo(lx, 9 + r * 9); ctx.lineTo(Math.min(w - 26, lx + seg), 9 + r * 9);
        lx += seg + 2 + rnd() * 3;
      }
      ctx.moveTo(w - 22, 9 + r * 9); ctx.lineTo(w - 9, 9 + r * 9);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Clutter. Drawn AFTER the glass is punched out, so a note stuck on the corner
// of a panel genuinely covers the feed — which is what the note is for.
//
// This is the cheapest realism per pixel on the whole wall. A monitor bank with
// nothing taped to it has never existed in a loss-prevention office; every real
// one has a shift sheet, a phone extension and somebody's handwriting on it.
// Everything here stays above WALL.bottom, which belongs to the HUD.
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

// A P-touch strip is the one kind of handwriting a 5x7 bitmap font can honestly
// stand in for. `age` 0 is a fresh white strip, 1 is a decade of nicotine.
function strip(ctx, x, y, txt, age = 1) {
  const sw = textW(txt, 1) + 12, sh = 13;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(x + 1, y + 1, sw, sh);
  ctx.fillStyle = age > 0.5 ? 'rgba(196,192,170,0.82)' : 'rgba(226,228,224,0.92)';
  ctx.fillRect(x, y, sw, sh);
  drawText(ctx, txt, x + 6, y + 3, 1, 'rgba(16,18,22,0.88)', null);
  return sw;
}

// Where a label-maker strip goes on a given chin: after the silkscreened channel
// number, before the brand. Computed rather than hand-placed, because the chins
// are now five different heights and the strips used to land on top of the
// brand text.
function chinStrip(ctx, p, txt, age) {
  const idS = p.chin >= 30 ? 2 : 1;
  const x = p.hx + Math.max(8, p.bx) + textW(p.chinId, idS) + 14;
  const y = p.y + p.h + Math.round((p.chin - 14) / 2);
  const brandLeft = p.hx + p.hw - (p.chin >= 30 ? 26 : 20) - textW(p.brand, 1);
  if (x + textW(txt, 1) + 12 > brandLeft - 6 && p.hw > 190) return;   // no room
  strip(ctx, x, y, txt, age);
}

function paintClutter(ctx, panels, wall, rnd) {
  const bySlot = (i) => panels.find((p) => p.slot === i) || panels[i] || panels[0];
  if (!panels.length) return;

  // yellow note on the bottom-left corner of a top-left monitor's glass
  const a = bySlot(2);
  stickyNote(ctx, a.x - 6, a.y + a.h - 40, 46, 42, -0.09,
    'rgba(220,208,122,0.94)', 'rgba(192,176,92,0.94)', 3, rnd);

  // pink one taped along the top bezel of the big door monitor, dipping just
  // onto the glass. Kept clear of the camera id and the REC dot.
  const b = bySlot(7);
  stickyNote(ctx, b.x + b.w - 116, b.y - 26, 38, 34, 0.13,
    'rgba(220,146,158,0.93)', 'rgba(192,118,132,0.93)', 2, rnd);

  // label-maker strips on the chins
  chinStrip(ctx, b, 'DOORS X241', 1);
  const knocked = bySlot(4);
  chinStrip(ctx, knocked, 'BAD FOCUS', 1);
  chinStrip(ctx, bySlot(0), 'PUBLIC VIEW', 1);
  chinStrip(ctx, bySlot(5), 'CH6 GHOST', 1);

  // The second door monitor. Its strip says what the install actually is: a
  // fresh white label if the channel is wired, and the truth if it is not.
  const d2 = bySlot(8);
  if (d2) chinStrip(ctx, d2, d2.cam >= 0 ? 'DOOR 2  NEW' : 'DOOR 2  NOT WIRED', 0);

  // masking tape over the dead power LED, because that is what people do
  // instead of fixing it
  ctx.save();
  ctx.translate(knocked.hx + knocked.hw - 24,
    knocked.y + knocked.h + Math.round((knocked.chin - 14) / 2) + 2);
  ctx.rotate(-0.07);
  ctx.fillStyle = 'rgba(206,190,150,0.55)';
  ctx.fillRect(0, 0, 30, 9);
  ctx.restore();

  // dust and thumbprints along the bottom bezel lip of every panel
  for (const p of panels) {
    const n = Math.max(10, (p.w * p.h) / 1500) | 0;
    for (let i = 0; i < n; i++) {
      const x = p.x + rnd() * p.w;
      const y = p.y + p.h - rnd() * rnd() * 10;
      ctx.fillStyle = `rgba(196,204,216,${0.03 + rnd() * 0.05})`;
      ctx.fillRect(x | 0, y | 0, 1 + ((rnd() * 2) | 0), 1);
    }
  }
}

// ---------------------------------------------------------------------------
// The card a dark panel shows. Painted in design space at the panel's UNROTATED
// glass rect; the quad's own rotation carries it round with the housing.
// ---------------------------------------------------------------------------
export function paintDeadCards(cv, W, H, dead) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  for (const p of dead) {
    if (p.deadMode === 0) {
      // Analogue snow. Ten years of the same dead input has ghosted the last
      // thing this tube ever displayed into the top-left corner.
      drawText(ctx, 'AUX 1', p.x + 6, p.y + 5, 1, 'rgba(226,232,222,0.20)', null);
      continue;
    }
    const cw = Math.min(p.w - 24, 172), ch = 52;
    const cx = p.x + (p.w - cw) / 2, cy = p.y + (p.h - ch) / 2;
    ctx.fillStyle = 'rgba(6,10,26,0.45)';
    ctx.fillRect(cx, cy, cw, ch);
    ctx.strokeStyle = 'rgba(140,164,222,0.48)'; ctx.lineWidth = 1;
    ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
    const t1 = 'NO SIGNAL';
    drawText(ctx, t1, cx + (cw - textW(t1, 2)) / 2, cy + 11, 2,
      'rgba(206,220,250,0.86)', 'rgba(0,0,0,0.5)');
    const t2 = 'CHECK VIDEO INPUT';
    drawText(ctx, t2, cx + (cw - textW(t2, 1)) / 2, cy + 33, 1,
      'rgba(158,178,224,0.62)', null);
  }
  return cv;
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
const PAD = 8, LINE = 16;
// The channel id has to stay readable — gameplay depends on it — but the
// timestamp does not, and a stamp that spans 80% of the tile is the thing that
// makes a mosaic read as a game HUD. Real DVR OSD in a multiplexed view is small
// enough that you can only just make it out. So: id big, stamp small.
//
// The OSD is burnt into the RECORDED stream, so a bigger panel showing the same
// stream shows bigger text. Scale therefore tracks panel width — the 416px
// primary gets scale 3, everything else gets 2 — instead of being one constant,
// which is what made every monitor read as the same monitor.
const STAMP_S = 1, STAMP_H = STAMP_S * 7 + 1, STAMP_UP = PAD + STAMP_H;
const idScale = (w) => (w >= 380 ? 3 : 2);

export function paintBurnIn(cv, W, H, tiles, cams, active, now, blink) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const { date, time } = stampParts(now);
  const oneLine = `${date} ${time}`;

  tiles.forEach((t, i) => {
    if (!t || t.w < 8) return;
    const cam = cams[i] || { id: 'CAM ' + p2(i + 1), label: '' };
    const s = idScale(t.w);
    const row2 = s * 7 + 3;
    const px = t.x + PAD, py = t.y + PAD;
    const rx = t.x + t.w - PAD;

    // top-left: channel identity, burnt in over years of the same overlay
    drawText(ctx, cam.id, px, py, s, TXT, SHA);
    drawText(ctx, cam.label, px, py + row2, s, DIM, SHA);

    // top-right: the blinking record indicator
    drawTextR(ctx, 'REC', rx, py, s, blink ? 'rgba(255,120,110,0.92)' : 'rgba(150,84,80,0.45)', SHA);
    const dotX = rx - textW('REC', s) - 9;
    ctx.fillStyle = blink ? 'rgba(255,58,48,0.95)' : 'rgba(112,34,30,0.5)';
    ctx.beginPath(); ctx.arc(dotX, py + s * 3, 2 + s, 0, 7); ctx.fill();
    if (blink) {
      ctx.fillStyle = 'rgba(255,58,48,0.18)';
      ctx.beginPath(); ctx.arc(dotX, py + s * 3, 4.5 + s * 2, 0, 7); ctx.fill();
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
      drawTextR(ctx, 'LIVE', rx, py + row2, s, 'rgba(158,232,172,0.88)', SHA);
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
