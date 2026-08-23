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
export function paintFurniture(cv, W, H, panels, wall, deck, pocket) {
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
  paintFixtures(ctx, panels, wall, rnd, deck, pocket);

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
  // No silkscreen under a label-maker strip: the strip is going to be stuck
  // straight over the model number, which is where people actually put them.
  if (hw > 190 && !labelFor(p)) {
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
  // Where the coax runs disappear behind something. Two at the outer edges of
  // the wall, one down the seam between the spot monitor and the bank.
  const trunks = [10, 400, 800, 1276];
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

}

// --- shelves, the DVR itself, and the paper on the wall ---------------------
// ROUND 4: everything here used to be hand-placed at coordinates that are now
// underneath the spot monitor. It is placed off `deck` — the strip of bare wall
// layout.js hands back — so the gear follows the composition instead of being
// re-found by hand every time a panel moves.
function paintFixtures(ctx, panels, wall, rnd, deck, pocket) {
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

  const D = deck || { x: 6, y: 553, w: 790, h: 51 };
  // --- the recorder, on the equipment deck under the spot monitor ---------
  const sx = D.x + 10, sy = D.y + D.h - 4, sw = 262;
  ctx.fillStyle = '#191b21'; ctx.fillRect(sx, sy, sw, 8);
  ctx.fillStyle = 'rgba(168,182,204,0.16)'; ctx.fillRect(sx, sy, sw, 1.4);

  const dx = D.x + 22, dy = D.y + 6, dw = 238, dh = 44;
  const dg = ctx.createLinearGradient(0, dy, 0, dy + dh);
  dg.addColorStop(0, '#232630'); dg.addColorStop(0.15, '#15171d'); dg.addColorStop(1, '#0b0c10');
  ctx.fillStyle = dg;
  rr(ctx, dx, dy, dw, dh, 3); ctx.fill();
  ctx.strokeStyle = 'rgba(150,164,186,0.14)'; ctx.lineWidth = 1;
  rr(ctx, dx + 0.5, dy + 0.5, dw - 1, dh - 1, 3); ctx.stroke();
  ctx.fillStyle = '#07080a';                                   // optical drive slot
  ctx.fillRect(dx + 10, dy + 7, 92, 7);
  // dymo strip on the front, the way every rack box in every back office is
  ctx.fillStyle = 'rgba(186,188,178,0.62)';
  ctx.fillRect(dx + 10, dy + 22, 80, 11);
  drawText(ctx, 'DO NOT REBOOT', dx + 13, dy + 24, 1, 'rgba(18,20,24,0.9)', null);
  drawText(ctx, 'VIGILANT DVR-16', dx + 100, dy + 9, 1, 'rgba(158,170,190,0.42)', null);
  drawText(ctx, 'STORE 4417 A', dx + 100, dy + 22, 1, 'rgba(158,170,190,0.24)', null);
  ctx.fillStyle = 'rgba(120,134,156,0.10)';                    // vent slots
  for (let i = 0; i < 5; i++) ctx.fillRect(dx + dw - 46 + i * 6, dy + 8, 3, 28);
  // status LEDs, stacked down the right edge. One is amber and nobody knows why.
  const leds = ['#6cff9a', '#6cff9a', '#ffb04a', '#6cff9a', '#4ab4ff'];
  leds.forEach((c, i) => {
    ctx.fillStyle = c; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(dx + dw - 12, dy + 9 + i * 7, 2.0, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.13;
    ctx.beginPath(); ctx.arc(dx + dw - 12, dy + 9 + i * 7, 5.5, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
  });

  // --- shift schedule, camera map and the extension card, along the deck --
  paperNote(ctx, D.x + 280, D.y + 4, 104, 44, -0.015, rnd, 'SHIFT');
  paperNote(ctx, D.x + 396, D.y + 6, 92, 42, 0.022, rnd, 'MAP');
  paperNote(ctx, D.x + 500, D.y + 4, 96, 44, 0.008, rnd, 'EXT');

  // --- the pocket under the thumbnail bank --------------------------------
  // A hank of unused coax on a nail, a spare bracket, and the clipboard. This
  // corner exists because nine 16:9 thumbnails do not fill a 526px column, and
  // a rectangle of empty wall is the one thing no photograph of a real LP office
  // has in it — there is always a hank of cable and somebody's paperwork.
  const K = pocket || { x: 806, y: 470, w: 318, h: 132 };
  ctx.lineCap = 'round';
  for (let i = 0; i < 6; i++) {
    ctx.strokeStyle = `rgba(${20 + rnd() * 8 | 0},22,28,${0.78 + rnd() * 0.18})`;
    ctx.lineWidth = 2.2 + rnd() * 0.9;
    ctx.beginPath();
    ctx.ellipse(K.x + 56 + i * 1.6 + (rnd() - 0.5) * 5, K.y + 62 + i * 3.0 + (rnd() - 0.5) * 5,
      30 - i * 1.6 + (rnd() - 0.5) * 4, 27 - i * 2.0 + (rnd() - 0.5) * 4,
      0.20 + (rnd() - 0.5) * 0.16, 0, 7);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(126,140,164,0.10)'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.ellipse(K.x + 56, K.y + 62, 30, 27, 0.24, 0, 7); ctx.stroke();
  // the nail it is hung on, and a spare VESA bracket leaning under it
  ctx.fillStyle = '#3d434e'; ctx.fillRect(K.x + 54, K.y + 28, 4, 4);
  ctx.fillStyle = '#15171c';
  ctx.fillRect(K.x + 108, K.y + 78, 46, 30);
  ctx.fillStyle = 'rgba(150,164,186,0.10)'; ctx.fillRect(K.x + 108, K.y + 78, 46, 1.4);
  ctx.fillStyle = '#0a0b0e';
  ctx.fillRect(K.x + 118, K.y + 86, 8, 8); ctx.fillRect(K.x + 136, K.y + 86, 8, 8);

  // --- clipboard hanging on a nail, in the pocket -------------------------
  const cbx = K.x + 176, cby = K.y + 26;
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

// Which chins carry a label-maker strip, and what it says. Keyed on the SLOT —
// the physical monitor — not on the channel, because the strip is stuck to the
// plastic and stays there whatever gets plugged in behind it. Slot 8's strip is
// the exception and reads off the wiring, because that is the whole story of
// that panel.
export function labelFor(p) {
  switch (p.slot) {
    case -1: return ['MAIN / CH SELECT', 1];   // the spot monitor
    case 0: return ['X241', 1];
    case 1: return [p.cam >= 0 ? 'NEW' : 'NOT WIRED', 0];
    case 2: return ['PUBLIC', 1];
    case 6: return ['FOCUS', 1];
    case 7: return ['GHOST', 1];
    default: return null;
  }
}

// Right-aligned to just inside the power LED, which is where the model number
// was, which is what a strip gets stuck over. Computed rather than hand-placed:
// the chins are now five different heights and widths.
function chinStrip(ctx, p, txt, age) {
  const idS = p.chin >= 30 ? 2 : 1;
  const w = textW(txt, 1) + 12;
  const x = p.hx + p.hw - (p.chin >= 30 ? 13 : 10) - 10 - w;
  const y = p.y + p.h + Math.round((p.chin - 14) / 2);
  const idRight = p.hx + Math.max(8, p.bx) + textW(p.chinId, idS);
  if (x < idRight + 8) return;                      // no room; leave it bare
  strip(ctx, x, y, txt, age);
}

function paintClutter(ctx, panels, wall, rnd) {
  // Every piece of clutter below is stuck to a NAMED monitor, so a wall that was
  // built with fewer slots than the table declares simply does not get that
  // piece. Nothing here is allowed to relocate itself onto a substitute panel —
  // "BAD FOCUS" taped to the channel that is in focus is worse than no label.
  const bySlot = (i) => panels.find((p) => p.slot === i);
  if (!panels.length) return;

  // Yellow note stuck across the seam between two thumbnails. It covers a
  // corner of a 138px picture, which is a real cost and is why it is on a
  // thumbnail: NOTHING is allowed onto the spot monitor's glass. That panel is
  // the one the player reads a person on, and a sticky note on it would be the
  // same mistake as the giant burnt-in channel id it replaced.
  const a = bySlot(5);
  if (a) {
    stickyNote(ctx, a.x + a.w - 26, a.y + a.h - 30, 44, 40, -0.09,
      'rgba(220,208,122,0.94)', 'rgba(192,176,92,0.94)', 3, rnd);
  }

  // pink one taped along the top bezel of the spot monitor, ON THE PLASTIC,
  // hanging clear of the glass by a couple of pixels
  const b = bySlot(-1);
  if (b) {
    stickyNote(ctx, b.x + b.w - 150, b.hy - 4, 38, 34, 0.13,
      'rgba(220,146,158,0.93)', 'rgba(192,118,132,0.93)', 2, rnd);
  }

  // every chin that carries a strip, including the one whose text is decided by
  // whether config wired the second door camera or not
  for (const p of panels) {
    const l = labelFor(p);
    if (l) chinStrip(ctx, p, l[0], l[1]);
  }

  const knocked = panels.find((p) => p.ledDead);
  if (knocked) {
    // masking tape over the dead power LED, because that is what people do
    // instead of fixing it
    ctx.save();
    ctx.translate(knocked.hx + knocked.hw - 24,
      knocked.y + knocked.h + Math.round((knocked.chin - 14) / 2) + 2);
    ctx.rotate(-0.07);
    ctx.fillStyle = 'rgba(206,190,150,0.55)';
    ctx.fillRect(0, 0, 30, 9);
    ctx.restore();
  }

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

// The two colours the analytics is allowed to speak in. GREEN is "this blob is
// moving", AMBER is "this blob stopped". There is deliberately no RED and no
// third state, because a third state would be a verdict and the recorder does
// not have one — see track.js.
const VMD = (a) => `rgba(126,240,158,${a})`;
const VMD_A = (a) => `rgba(255,186,72,${a})`;

// ===========================================================================
// PER-PANEL OSD — the round-4 rewrite, and the whole readability fix
// ===========================================================================
// Round 3 painted ONE 1280x720 overlay for the whole wall and let each screen
// shader cut its own rect out of it. That is what forced every channel's text to
// be drawn at WALL scale, which is why a 190px monitor carried a channel id a
// third of its width and a timestamp across most of the rest. Look at
// shots/cctv_r4_before.png: on CAM 01 the burn-in occupies more pixels than the
// aisle does.
//
// Now every panel gets its own small canvas in its own uv, so a thumbnail can
// print 5-pixel type at the very edge and the spot monitor can print a real
// timestamp, and the analytics boxes have somewhere to live that is measured in
// the same pixels as the picture they are drawn on.
//
// `boxes` entries are already in PANEL PIXELS — cctv.js does the projection,
// including undoing the lens barrel, because it is the only place that knows
// the camera. Each is { x,y,w,h, moving, code, token, tracked }.

const PAD = 8;
const p2s = (n) => String(n).padStart(2, '0');

// --- a thumbnail. 138x104 of glass, and its only job is "something moved". ---
// No timestamp, no camera label, no analytics text: at this size those cost more
// picture than they return. What it does carry is the three things that survive
// being small — a box round each blob, a motion meter, and an alarm frame when
// the detector fires — plus the channel number, which gameplay needs.
export function paintThumbOsd(cv, o) {
  const W = cv.width, H = cv.height;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  // motion boxes: 1px, no label. At 138px a box round a 10px man is the
  // difference between "grey blur" and "four people, one of them stopped".
  for (const b of o.boxes || []) {
    const x = Math.round(b.x) + 0.5, y = Math.round(b.y) + 0.5;
    const w = Math.max(3, Math.round(b.w)), h = Math.max(4, Math.round(b.h));
    ctx.strokeStyle = b.moving ? VMD(0.62) : VMD_A(0.85);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
  }

  // the alarm frame a cheap DVR throws round the whole picture when its video
  // motion detector trips. It is what pulls your eye across the bank.
  if (o.alarm > 0) {
    ctx.strokeStyle = VMD_A(0.30 + 0.55 * o.alarm);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  // channel number, top-left, small and burnt in
  drawText(ctx, p2s(o.chan), 4, 3, 1, TXT, SHA);

  // motion meter up the left edge — a VU meter for movement. Reads at a glance
  // from the far side of the wall, which is the point of it.
  const mh = Math.round((H - 26) * Math.min(1, o.energy || 0));
  if (mh > 0) {
    ctx.fillStyle = VMD(0.55);
    ctx.fillRect(2, H - 5 - mh, 3, mh);
  }
  ctx.fillStyle = 'rgba(120,150,130,0.20)';
  ctx.fillRect(2, H - 5 - (H - 26), 3, H - 26);

  // record pip, bottom-right, clear of builder-game's subject badge
  ctx.fillStyle = o.blink ? 'rgba(255,58,48,0.92)' : 'rgba(112,34,30,0.45)';
  ctx.beginPath(); ctx.arc(W - 7, H - 7, 2.6, 0, 7); ctx.fill();
  return cv;
}

// --- the spot monitor. 766x431, and the only place a person is legible. -----
export function paintSpotOsd(cv, o) {
  const W = cv.width, H = cv.height;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const cam = o.cam || { id: 'CAM', label: '' };

  // ---- trails ------------------------------------------------------------
  // Three and a half seconds of where each blob has been. This is the cheapest
  // readability win on the whole wall, because DIRECTION and RHYTHM survive
  // downscaling when a face does not: a knot of dots is a man who has not moved,
  // a straight run of them pointing off-frame is a man leaving, and an even
  // spacing that suddenly bunches is a man who slowed down to do something.
  for (const b of o.boxes || []) {
    const tr = b.trail;
    if (!tr || tr.length < 2) continue;
    for (let i = 0; i < tr.length; i++) {
      const a = (i / tr.length) * (b.tracked ? 0.42 : 0.20);
      ctx.fillStyle = b.moving ? VMD(a) : VMD_A(a);
      ctx.fillRect(tr[i].x - 1, tr[i].y - 1, 2.5, 2.5);
    }
  }

  // ---- analytics boxes ---------------------------------------------------
  for (const b of o.boxes || []) {
    const x = Math.round(b.x) + 0.5, y = Math.round(b.y) + 0.5;
    const w = Math.max(8, Math.round(b.w)), h = Math.max(10, Math.round(b.h));
    const col = b.moving ? VMD : VMD_A;
    ctx.lineWidth = b.tracked ? 2 : 1;
    ctx.strokeStyle = col(b.tracked ? 0.95 : 0.5);
    ctx.strokeRect(x, y, w, h);
    if (b.tracked) {
      // corner ticks, brighter, the way a tracker marks its lock
      ctx.strokeStyle = col(1.0); ctx.lineWidth = 3;
      const k = Math.min(14, w * 0.35);
      for (const [cx, cy, sx, sy] of [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]]) {
        const px = x + cx * w, py = y + cy * h;
        ctx.beginPath();
        ctx.moveTo(px + sx * k, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * k);
        ctx.stroke();
      }
    }
    // the label goes ABOVE the head, never over the body — the body is the
    // evidence and the recorder is not allowed to print on it
    if (!b.token) continue;
    const s = b.tracked ? 2 : 1;
    const txt = `${b.code} ${b.token}`;
    const tw = textW(txt, s), th = s * 7;
    let ly = y - th - 5;
    if (ly < 2) ly = y + h + 4;
    let lx = x;
    if (lx + tw > W - 4) lx = W - 4 - tw;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(lx - 3, ly - 2, tw + 6, th + 4);
    drawText(ctx, txt, lx, ly, s, col(b.tracked ? 1.0 : 0.72), SHA);
  }

  // ---- DVR chrome --------------------------------------------------------
  const { date, time } = stampParts(o.now);
  drawText(ctx, cam.id, PAD + 2, PAD + 1, 3, TXT, SHA);
  drawText(ctx, cam.label, PAD + 2, PAD + 26, 2, DIM, SHA);

  const rx = W - PAD - 2;
  drawTextR(ctx, 'REC', rx, PAD + 1, 2,
    o.blink ? 'rgba(255,120,110,0.92)' : 'rgba(150,84,80,0.45)', SHA);
  const dotX = rx - textW('REC', 2) - 11;
  ctx.fillStyle = o.blink ? 'rgba(255,58,48,0.95)' : 'rgba(112,34,30,0.5)';
  ctx.beginPath(); ctx.arc(dotX, PAD + 8, 4.5, 0, 7); ctx.fill();
  if (o.blink) {
    ctx.fillStyle = 'rgba(255,58,48,0.18)';
    ctx.beginPath(); ctx.arc(dotX, PAD + 8, 9.5, 0, 7); ctx.fill();
  }

  // The lens state, said out loud, because a picture that silently pushes in is
  // a picture the player cannot trust. WIDE means you are seeing the channel;
  // PTZ means the dome has walked onto a subject and there is more frame than
  // you can see.
  const ptz = o.zoom > 1.06 ? `PTZ  ${o.zoom.toFixed(1)}X` : 'WIDE  1.0X';
  drawTextR(ctx, ptz, rx, PAD + 20, 2, o.zoom > 1.06 ? VMD_A(0.92) : DIM, SHA);
  if (o.trackN) {
    drawTextR(ctx, `TRACK ${o.trackI + 1} OF ${o.trackN}`, rx, PAD + 41, 1, DIM, SHA);
  }

  // bottom-left: the stream the spot monitor is actually being fed. A DVR shows
  // you this and it is how you know why the mosaic looks worse than this does.
  drawText(ctx, o.stream || '', PAD + 2, H - PAD - 8, 1, 'rgba(200,214,196,0.42)', SHA);
  drawTextR(ctx, `${date} ${time}`, rx, H - PAD - 16, 2, TXT, SHA);
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
