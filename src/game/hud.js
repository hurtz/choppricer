// OWNER: builder-game. The HUD is a 1280x720 2D canvas laid over the WebGL canvas
// with identical `object-fit: contain` scaling, so it lines up pixel-for-pixel with
// the 3D view at any window size and composites cleanly into screenshots.
//
// Look: 1990s in-store DVR. Blocky monospace, amber + phosphor green, hard-edged
// boxes with filled title tabs, scanlines, burn-in ghosts, a clock that is wrong.

export const W = 1280, H = 720;

// Projection is owned by src/camera.js and read off the LIVE camera. This file used
// to carry a hand-copied duplicate of the rig, correct only while the camera never
// moved; see CLAUDE.md on derivation duplication.
// NB: `export {x} from` re-exports WITHOUT creating a local binding, and this file
// calls projectFromCop itself — so import it, then re-export the binding.
import { projectFromCop } from '../camera.js';
export { projectFromCop };
// ...AND THE LENS THE GRADE PUTS IN FRONT OF IT (round 8, cctv's contract).
// projectFromCop is a PINHOLE projection and it is correct for the raw render.
// It is not correct for what the player is looking at: cctv.js's floor grade
// ends in a barrel/fisheye that MOVES PIXELS — zero at the centre, ~31 px at
// about 0.6 of the corner radius, back to zero at the corners — so a marker
// drawn at the pinhole pixel sits beside the man rather than on him, and does
// so worst exactly where a mid-glance subject is. Same class of bug as the
// hand-copied camera rig this file used to carry, and it survived four rounds
// for the same reason: it is only ever a few pixels wrong in the middle of the
// frame, which is where you look when you are checking.
//
// One definition of the map, owned by the file that owns the shader. Never
// re-derive it here; if the barrel changes, warp.js changes with it in the same
// commit and this file is correct for free.
import { warpFloor, floorMagAt } from '../cctv/warp.js';
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

// ---------------------------------------------------------------- THE CENSUS
// ROUND 9 — HOW MUCH OF THE TIME IS EACH THING ON SCREEN.
//
// The client's note is "there is way too much going on on the screen", and the
// only number that answers it is the fraction of a shift each element is drawn.
// Round 7 measured exactly one element that way (the alarm bar, lit 52% of an
// idle shift) and that one number decided this round, so the instrument is now
// permanent and covers everything.
//
// It counts DRAWS, not predicates. Every mark() below sits at the point the
// element actually paints, so a census cannot drift away from the screen the
// way a re-derived "would this be visible" test would — which is the same class
// of mistake as the hand-copied camera rig this file used to carry.
let census = null;
function mark(k, n = 1) { if (census) census[k] = (census[k] || 0) + n; }

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
  // Width of a string as tx() will actually draw it. ctx.measureText does NOT
  // account for ctx.letterSpacing, which is how the round-9 alarm chip first
  // shipped with its countdown printed on top of the word VESTIBULE.
  function advance(str, size = 12, wt = '', ls = 0.7) {
    ctx.font = `${wt || ''} ${size}px ${MONO}`.trim();
    return ctx.measureText(str).width + str.length * ls;
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
  // ROUND 9. Elements that used to sit inside a panel and now sit on the 3D
  // view need the panel's one load-bearing property back: contrast. A dim grey
  // line over a lit supermarket floor is not a subtle readout, it is an
  // invisible one. This is the ticker's backing plate, made shareable.
  function plate(x, y, w, h, a = 0.86) {
    ctx.fillStyle = `rgba(2,4,3,${a})`; ctx.fillRect(x, y, w, h);
  }
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
  // THE SECOND CLOCK. For five rounds this band read a shift clock forty-three
  // minutes fast off a fixed 08/22/26 — a nice joke about a power outage, and
  // harmless while nothing else on screen printed a time. cctv.js now puts a
  // 766px spot monitor next to it with the recorder's own OSD stamp burnt into
  // it, straight off new Date(). shots/game_r6_before.png has the band saying
  // 08/22/26 14:13:43 and the glass saying 08/23/2026 10:40:01, twenty hours
  // apart, on one desk, in one photograph. Two clocks disagreeing is the roster
  // bug again in a smaller font.
  //
  // The band is the one that moved, because the burn-in is ON THE FOOTAGE and
  // footage is not a thing a terminal gets to overrule. `clockBase` is set once
  // a frame from the live shift clock, so dvrClock(t) is exact wall time for the
  // band and correct RELATIVE time for a log line stamped seconds ago.
  let clockBase = Date.now();
  function wallClock(t) { return new Date(clockBase + t * 1000); }
  function dvrTime(t) {
    const d = wallClock(t);
    return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  }
  function dvrClock(t) {
    const d = wallClock(t);
    return `${two(d.getMonth() + 1)}/${two(d.getDate())}/${d.getFullYear()} ${dvrTime(t)}`;
  }
  function burnIn() {
    mark('burnIn');
    // Ghosts of a channel layout this DVR has not used since 2019.
    ctx.globalAlpha = 0.055;
    tx('CH 04  LIQUOR', 24, 700, { s: 30, w: 'bold', c: '#ffffff', ls: 4 });
    tx('REC', 1256, 60, { s: 26, w: 'bold', c: '#ffffff', a: 'right', ls: 4 });
    ctx.globalAlpha = 1;
  }
  function topBand(G, h, label) {
    mark('band');
    ctx.fillStyle = 'rgba(2,4,3,0.93)'; ctx.fillRect(0, 0, W, h);
    ctx.fillStyle = LINE; ctx.fillRect(0, h - 1, W, 1);
    const blink = (G.now % 1) < 0.6;
    if (blink) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(24, h / 2 - 5, 5.5, 0, 7); ctx.fill(); }
    tx('REC', 36, h / 2 - 1, { s: 12, w: 'bold', c: blink ? RED : RED_D, ls: 1.6 });
    tx(label, 82, h / 2 - 1, { s: 14, w: 'bold', c: AMB, ls: 2.2 });
    tx(dvrClock(G.st.clock), W - 14, h / 2 - 2, { s: 16, w: 'bold', c: GRN, a: 'right', ls: 1.4 });
  }
  // ---- ROUND 9: THE STATUS ROW ATE A PANEL --------------------------------
  // What used to be here: `16-CH DVR / 9 CH ACTIVE / MOTION ANALYTICS: ON`,
  // which never changes and which no player has ever done anything about, and
  // `SHIFT 2ND · 04:12 ELAPSED`, which is a SECOND CLOCK on a screen whose own
  // note four rounds ago was about two clocks disagreeing. Both deleted.
  //
  // What is here instead is the OFFICER — BADGE 1 panel, which was 330x88 px of
  // permanent real estate at 100% duty cycle carrying three facts that change
  // between zero and three times in a shift: your rank, your points, and your
  // complaints. Rank and points do not alter one decision the player is about
  // to make at this desk. They are a record, so they get a line, not a panel.
  //
  // AND THE PIPS ARE ONLY THERE ONCE YOU HAVE ONE. A clean record shows
  // nothing at all, which is the whole idea: the first time a red square
  // appears on this row it means something, because the row was empty a second
  // ago. Three grey squares that are grey all shift teach the player to stop
  // seeing that corner of the screen, and then the third one lands unnoticed.
  function statusRow(G, y) {
    mark('bandRow2');
    const adv = (str) => advance(str, 11, 'bold', 1);
    let x = 82;
    tx(G.rankName, x, y, { s: 11, w: 'bold', c: AMB, ls: 1 });
    x += adv(G.rankName) + 14;
    tx(`${G.st.points} PTS`, x, y, { s: 11, c: DIM });
    x += adv(`${G.st.points} PTS`) + 16;
    if (G.st.complaints > 0) {
      mark('complaintPips');
      for (let i = 0; i < 3; i++) {
        const on = i < G.st.complaints;
        ctx.fillStyle = on ? RED : 'rgba(255,255,255,0.10)';
        ctx.fillRect(x + i * 13, y - 9, 9, 9);
        box(x + i * 13, y - 9, 9, 9, on ? RED : LINE);
      }
      tx(`${G.st.complaints}/3 COMPLAINTS`, x + 44, y, { s: 11, w: 'bold', c: RED, ls: 0.8 });
    }
  }
  // ---- ROUND 9: ONE ALARM, AND IT DOES NOT FLASH --------------------------
  // The client: "the flashing red bar that happens at the top ... is obnoxious
  // and too much." He is right twice over. It was full-width, it strobed at
  // 1.1 Hz, and it was LIT 40.5% OF AN IDLE SHIFT (censused this round; round 7
  // had it at 52% under the old pacing). Something that is on half the time
  // cannot be an alarm, and something that strobes cannot be ignored, so the
  // player was being made to fight it several times a minute for nothing.
  //
  // game.js deleted every soft source. What arrives here now is one thing: a
  // man in the doorway and the seconds until he is through it. It is drawn as a
  // CHIP in the status row — sized to its own sentence, on the row that was
  // already carrying status, with no animation whatsoever. It has to earn
  // attention by APPEARING on a row that is otherwise calm, which is the only
  // way an alert works on a screen that is up for four minutes at a time.
  //
  // The countdown is the loud part, because the countdown is the part that
  // expires. It brightens under three seconds instead of the whole plate
  // blinking, which reads as urgency without reading as a fault light.
  function alarmChip(G, y) {
    const a = G.alarm; if (!a) return;
    mark('alarm'); mark(a.count != null ? 'alarmHard' : 'alarmSoft');
    const cd = a.count != null ? `T-${a.count.toFixed(1)}s` : '';
    const label = `▲ ${a.text}`;
    const hot = a.count != null && a.count < 3;
    const wLbl = advance(label, 12, 'bold', 0.9);
    const wCd = cd ? advance(cd, 12, 'bold', 0.9) + 16 : 0;
    const w = wLbl + wCd + 22;
    const x = W - 14 - w;
    ctx.fillStyle = 'rgba(58,10,7,0.95)'; ctx.fillRect(x, y - 13, w, 18);
    box(x, y - 13, w, 18, hot ? RED : RED_D);
    ctx.fillStyle = hot ? RED : RED_D; ctx.fillRect(x, y - 13, 3, 18);
    tx(label, x + 10, y, { s: 12, w: 'bold', c: RED, ls: 0.9 });
    if (cd) tx(cd, x + w - 8, y, { s: 12, w: 'bold', c: hot ? '#ffd9d3' : RED, a: 'right', ls: 0.9 });
  }
  function ticker(G, x, y, w, back) {
    // Last few system log lines, newest first, fading out. Bottom of the wall.
    if (!G.log.length || G.now - G.log[0].t > 8) return;
    mark('ticker');
    if (back) { ctx.fillStyle = 'rgba(2,4,3,0.86)'; ctx.fillRect(x - 8, y - 12, w + 16, 16); }
    for (let i = 0; i < Math.min(3, G.log.length); i++) {
      const e = G.log[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, (8 - (G.now - e.t)) / 2.5)) * (1 - i * 0.28);
      tx(`${dvrTime(e.clock)}  ${e.text}`, x, y + i * 15,
        { s: 11, c: e.bad ? RED : DIM, max: w });
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ DESK
  function drawDesk(G) {
    const tiles = G.tiles;
    // ------------------------------------------------------------------------
    // PER-TILE OVERLAY, RESIZED FOR A BANK OF MOTION DETECTORS
    // ------------------------------------------------------------------------
    // These rects used to be 190-416 px wide and this overlay was written for
    // that. Round 4 demoted them to 138x104 and everything here became furniture
    // sitting on the picture: a `0 SUBJ` badge fifty pixels wide is 36% of the
    // tile, the active tile's 15px amber footer plus 16px corner brackets left a
    // 106px-wide hole to see an aisle through, and the `[7]` key hint duplicated
    // a channel number cctv.js already burns into the top-left corner AND the
    // one silkscreened on the chin below.
    //
    // The bank's job is now "something moved over there". Everything that is not
    // that comes off the small tiles. What survives, and why:
    //   ACTIVE FRAME  which monitor the spot is showing. Non-negotiable.
    //   FLAG PIP      a 7px blinking square, top-right, where cctv.js leaves a
    //                 gap between its channel number and its REC dot. It replaces
    //                 a 44px word. It is still guilt-blind: traps flag too.
    //   COUNT         on the ACTIVE tile only, because that is the one whose
    //                 roster is open underneath. On the other eight, the count
    //                 was answering a question the pictures now answer better.
    // Sizes are derived from the rect, so a wall that changes again scales.
    tiles.forEach((t, i) => {
      if (!t) return;
      reg('cam', t.x, t.y, t.w, t.h, i);
      const subs = G.desk.subjects.filter((s) => s.cam === i);
      // The pip fires on the subject's PRIMARY channel only — see updateSubjects.
      // A man in the middle of the store is genuinely on four monitors and gets
      // four rows, but only one of them is the one to switch to.
      const flagged = subs.some((s) => s.flagged && s.primary !== false);
      // ROUND 9. Blink is for a flag that has JUST appeared; see stampFlag()
      // in game.js. Censused at 1.8 of nine monitors carrying a pip at any
      // instant of an idle shift, at least one lit 89% of the time — a light
      // that waves at you nine tenths of a shift is the alarm bar again with a
      // smaller footprint. The pip itself is the pointer and it stays; what it
      // stops doing is moving, except in the three seconds where the movement
      // is reporting a change rather than restating a state.
      const fresh = subs.some((s) => s.fresh && s.primary !== false);
      const act = i === G.desk.cam;
      const small = t.w < 200;
      box(t.x, t.y, t.w, t.h, act ? AMB : 'rgba(120,170,130,0.16)', act ? 2 : 1);
      if (act) {
        const k = Math.max(7, Math.min(16, t.w * 0.085));
        ctx.strokeStyle = AMB; ctx.lineWidth = small ? 2 : 3;
        [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]].forEach(([cx, cy, sx, sy]) => {
          const px = t.x + cx * t.w, py = t.y + cy * t.h;
          ctx.beginPath(); ctx.moveTo(px + sx * k, py); ctx.lineTo(px, py);
          ctx.lineTo(px, py + sy * k); ctx.stroke();
        });
        // ROUND 9 — THE COUNT BADGE IS GONE FROM EVERY TILE.
        // On the active tile it was a number telling you how many rows are in
        // the roster panel directly underneath it, which is a list you can see.
        // On the others it answered a question the pictures answer better, and
        // it was doing it on 100% of frames. What a tile has to say is "the
        // spot monitor is on me" and "something in here is flagged"; a large
        // wall still gets its channel name burnt on the chin, because at that
        // size the name is the picture's own label rather than furniture.
        if (!small) {
          ctx.fillStyle = AMB; ctx.fillRect(t.x, t.y + t.h - 15, t.w, 15);
          tx(`▶ ${G.cams[i]?.label || G.cams[i]?.id || 'CAM'}`,
            t.x + 6, t.y + t.h - 4, { s: 10, w: 'bold', c: '#07100a', ls: 1.1, max: t.w - 12 });
        }
      }
      if (flagged) mark('pipTiles');
      if (fresh) mark('pipFresh');
      if (flagged && (!fresh || (G.now % 0.8) < 0.5)) {
        if (small) {
          ctx.fillStyle = fresh ? RED : '#c3382c';
          ctx.fillRect(t.x + t.w - 11, t.y + 4, 7, 7);
        } else {
          ctx.fillStyle = fresh ? RED : '#c3382c'; ctx.fillRect(t.x + 4, t.y + 4, 44, 15);
          tx('FLAG', t.x + 8, t.y + 15, { s: 10, w: 'bold', c: '#1a0402' });
        }
      }
    });
    // The spot monitor is cctv.js's panel and its chrome, but it is the thing the
    // player is looking at, so clicking it has to do something. It steps the PTZ
    // lock to the next subject on this channel — the same thing [C] does.
    const spot = G.spot;
    if (spot) reg('track', spot.x, spot.y, spot.w, spot.h, 1);

    topBand(G, 74, 'CHOP FOODS #4417  ·  LOSS PREVENTION TERMINAL');
    // The status row and the one remaining alarm share the band. Neither of
    // them covers a feed, which is the rule the old full-width bar was written
    // to obey and then broke by being on half the time anyway.
    statusRow(G, 60);
    alarmChip(G, 60);
    ticker(G, 14, 616, 700, true);

    const by = 624, bh = 88;
    // --- analytics roster
    // ROUND 9: this starts at x=10 now, in the 330 px the OFFICER panel was
    // holding. The width buys 300 px of behaviour text, which is the ONE thing
    // on this desk the player has to read word by word — round 8 clipped it at
    // 306 px with an ellipsis, on a 12 px monospace, as the price of a panel
    // that printed a number nobody acts on.
    const ax = 10, aw = 896;
    const cam = G.cams[G.desk.cam];
    mark('roster');
    // ONE CHANNEL PER AISLE, so the header names the aisle and stops there.
    // `CAM 03 / AISLE 3` was the same number twice as soon as config.js made
    // channel N aisle N, and `CAM 04 / AISLE 7-8` — which is what it said last
    // round — was the thing the client asked to have taken away.
    panel(ax, by, aw, bh, `MOTION ANALYTICS — ${cam?.label || cam?.id || 'CAM'}`);
    const all = G.desk.subjects.filter((s) => s.cam === G.desk.cam);
    const top = Math.min(G.desk.scroll || 0, Math.max(0, all.length - 3));
    const subs = all.slice(top, top + 3);
    if (!subs.length) {
      mark('rosterEmpty');
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
      // He is on more than one monitor. Worth two characters, because a second
      // angle on a man you cannot read is the cheapest thing this desk sells.
      if (s.chans > 1) tx(`·${s.chans}`, ax + 84, ry + 15, { s: 11, c: GRN_D, ls: 0 });
      // ROUND 9 — THE WHERE COLUMN ONLY SPEAKS WHEN IT DISAGREES.
      // With one channel per aisle, `A3` under a panel titled AISLE 3 is the
      // header restated on every row. It is worth real ink in exactly one
      // case: the man is on a cross-aisle, i.e. he can be seen from this
      // camera but he is NOT in the aisle it is named after — which is also
      // the case where dispatch is about to send you somewhere else.
      const where = shortWhere(s, G.cams[s.cam]);
      if (where) tx(where, ax + 100, ry + 15, { s: 12, w: 'bold', c: AMB });
      // A row for a man no camera can currently see. He is in one of this
      // store's blind spots — 13% of subject-seconds are — and the last channel
      // that had him is the last channel that had him, which is a different
      // claim from "he is in this picture". The behaviour text goes with the
      // signal, because everything in that column is something a motion
      // detector reported and no detector is reporting anything.
      //
      // The FLAG does not go with it. Losing the picture does not un-log the
      // event: a recorder that dropped its alarm the moment a man stepped behind
      // an end-cap would be worse than useless, and the player would watch his
      // one open case turn into a beige row for no reason he could see. So the
      // row stays red and stays the one you are chasing; it just stops
      // pretending to know what he is doing right now.
      const lx = ax + 152, lw = aw - 152 - 116;
      if (s.running) {
        // ROUND 9 — WHERE THE ALARM BAR WENT.
        // A man who has broken into a run has no behaviour left to report: the
        // analytics text is about somebody browsing and he is not browsing. So
        // his row becomes the thing the deleted bar used to shout — how much
        // of his run to the way out is left — attached to the man it is about,
        // on the channel he is on, in the list the player is already reading.
        // Guilt-blind by construction: 'bolt' and 'react' are a body sprinting
        // through the middle of the picture, not a hidden flag. A DRIFTING
        // thief, who is the whole reading puzzle, still gets a behaviour line
        // like everybody else.
        mark('rowRunning');
        tx(s.toDoor != null ? `RUNNING — ${Math.round(s.toDoor)} M FROM THE DOOR` : 'RUNNING',
          lx, ry + 15, { s: 12, w: 'bold', c: RED, max: lw });
      } else if (s.lost > 0) {
        ctx.globalAlpha = s.flagged ? 0.8 : 0.55;
        tx(`SIGNAL LOST — LAST SEEN ${s.lost.toFixed(1)}s`, lx, ry + 15,
          { s: 12, c: s.flagged ? RED : AMB, max: lw, w: s.flagged ? 'bold' : '' });
        ctx.globalAlpha = 1;
      } else {
        tx(s.line, lx, ry + 15,
          { s: 12, c: s.flagged ? RED : (sel ? '#e9f6ec' : DIM), max: lw, w: s.flagged ? 'bold' : '' });
      }
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
    mark('dispatch'); mark(can ? 'dispatchArmed' : 'dispatchIdle');
    panel(dx, by, dw, bh, 'DISPATCH', { accent: can ? AMB : '#4d5f52' });
    // ROUND 9: `POST UNMANNED` used to sit here in red on the title row, on
    // every frame a row was selected — which is 82% of a competent player's
    // desk time. It is a good line and it is not information: nothing the
    // player can do makes it go away, and a permanent red string next to a
    // blinking red flag pip is two reds competing to be the one that matters.
    // The joke still lands where it is actually true — the write-up header
    // opens DO NOT LEAVE POST (POST IS ALREADY UNMANNED) — and the dispatch
    // radio chatter says LEAVING POST. POST IS UNMANNED. NOTED.
    if (can) {
      const hot = (G.now % 1.1) < 0.75;
      const bw = 212;
      reg('dispatch', dx + 8, by + 22, bw, 40, sel.aisle);
      ctx.fillStyle = hot ? AMB : AMB_D; ctx.fillRect(dx + 8, by + 22, bw, 40);
      const dest = sel.where || `AISLE ${sel.aisle + 1}`;
      tx('▶ DISPATCH', dx + 8 + bw / 2, by + 41, { s: 15, w: 'bold', c: '#07100a', a: 'center', ls: 1.4 });
      tx(dest, dx + 8 + bw / 2, by + 57, { s: 13, w: 'bold', c: '#07100a', a: 'center', ls: 1.2, max: bw - 12 });
      keyRow(G, dx + 12, by + 78, dw - 24, ['dispatch', 'roster', 'pa', 'track']);
    } else {
      tx('SELECT A SUBJECT ROW', dx + 12, by + 42, { s: 14, w: 'bold', c: '#6f8a77', max: 212 });
      // ONE CHANNEL PER AISLE, said in the only place it needs saying: the key
      // you press IS the aisle number over the shelving. Derived, so a wall
      // that grows a channel cannot make this line a lie.
      const nA = G.cams.filter((c) => /AISLE/.test(c.label || '')).length || G.cams.length;
      tx(nA < G.cams.length ? `[1]-[${nA}] AISLE  ·  [${nA + 1}] DOOR` : `[1]-[${nA}] CHANNEL`,
        dx + 12, by + 62, { s: 11, c: '#5d7364', max: 212 });
      keyRow(G, dx + 12, by + 78, dw - 24, ['roster', 'pa', 'track']);
    }
    // ---- ROUND 8: THE PA BUTTON LIVES OUTSIDE THE `if (can)` -----------------
    // It used to be drawn inside the branch above, i.e. ONLY WHEN A SUBJECT ROW
    // WAS SELECTED. Press [F] with nothing selected — which game.js explicitly
    // supports and calls "both correct and funnier", because a PA is a
    // microphone — and the channel opened, audio.js took the capture device,
    // the browser lit its recording dot, and there was NOTHING WHATSOEVER on
    // screen about it. No button, no ON AIR, no level meter. That is the most
    // literal available reading of the client's "it looks like it's recording,
    // but it doesn't do anything", and it was mine.
    //
    // One handset, one readout, drawn on every frame the desk is up. What it
    // says varies; whether it is there does not.
    holdBtn(G, dx + 230, by + 22, dw - 238, 40);
    burnIn();
  }

  // ==========================================================================
  // ROUND 9 — THE LEGEND ERODES
  // ==========================================================================
  // Round 8's version of this line had to describe the two PA clocks, because
  // it was the only place that could. That is no longer true: the button two
  // rows up says ON AIR / PRICE CHK / MIC ONLY / 3s RECHARGING in its own
  // colours on every frame, which is where a STATE belongs. What is left for a
  // hint row is the one thing a state readout cannot do, which is tell a
  // player who has never pressed [F] that [F] exists.
  //
  // That is a job with an end. Each clause below names a key the player has
  // not used yet; game.js flips the flag the first time he presses it (see
  // `taught`), the clause goes, and when the last one goes so does the row.
  // Measured at 100% of desk frames before this; a legend for a six-key game
  // does not get to be permanent furniture on top of a roster you have to read
  // word by word.
  //
  // NOT ERODED, deliberately: anything that reports what is happening rather
  // than what a key is called. The PA button's four words, WIND's KEY HELD —
  // NO RECOVERY, and the stand-down prompt's [Q] all stay forever, because a
  // player who has learned a key has not thereby learned the state it is in.
  function keyRow(G, x, y, w, want, opt) {
    const t = G.taught || {};
    const H2 = G.hold || {};
    const parts = [];
    for (const k of want) {
      if (t[k]) continue;
      if (k === 'dispatch') parts.push('[SPACE] DISPATCH');
      else if (k === 'roster') parts.push('[↑/↓] ROSTER');
      else if (k === 'track') parts.push('[C] TRACK');
      else if (k === 'pa') parts.push(H2.can ? '[F] HOLD TO TALK' : '[F] PA');
      else if (k === 'sprint') parts.push('[SHIFT] SPRINT   [WASD] MOVE');
      else if (k === 'post') parts.push('[Q] RETURN TO POST');
    }
    if (!parts.length) return false;
    mark((opt && opt.mark) || 'deskKeyHint');
    if (opt && opt.plate) {
      const str = parts.slice(0, 2).join('   ');
      plate(x - 6, y - 12, advance(str, 11, '', 0.7) + 12, 17);
    }
    // TWO AT A TIME. Four clauses is 58 characters and this row is 45 wide, so
    // the old line ellipsed at `[F] HOLD T…` — a hint that names a key and then
    // cuts the key off. The list is in the order a player needs them, and the
    // third only appears once the first has been learned, which is also how
    // somebody would teach it out loud.
    tx(parts.slice(0, 2).join('   '), x, y, { s: 11, c: '#5d7364', max: w });
    return true;
  }

  // The one power this job actually confers. Ready / counting down / live.
  function holdBtn(G, x, y, w, h) {
    const H2 = G.hold || {};
    if (!H2.on) return;
    mark('paBtn');
    const live = H2.live, cool = H2.cool || 0;
    // ROUND 8 — TWO CLOCKS, AND THE BUTTON HAS TO STOP CONFLATING THEM.
    // `charged` is the handset's recharge; `armed` additionally means there is a
    // roster row for an announcement to go to. Round 7 drew one `ready` off the
    // recharge alone, and because the whole button was hidden without a
    // selection the difference never showed. It shows now: the button is always
    // up, so it has to be honest about which of the two is missing.
    const charged = !live && cool <= 0;
    const armed = charged && H2.ann !== false;
    const ready = armed;
    // ROUND 7 — THE CHANNEL IS OPEN AND THAT HAS TO BE UNMISTAKABLE.
    // An open microphone is the one piece of state in this game that exists
    // outside the game, so it gets the treatment a real desk gives it: the
    // button goes hot red, it says ON AIR rather than anything about a price
    // check, and a level meter moves with the player's own voice. The meter is
    // the part that matters — it is the only proof he has that the store can
    // hear him, and without it a quiet mic is indistinguishable from a broken
    // feature.
    const air = !!H2.talk;
    const RED_AIR = '#ff4a3a';
    ctx.fillStyle = air ? 'rgba(255,74,58,0.24)'
      : live ? 'rgba(255,227,106,0.22)' : armed ? 'rgba(255,180,58,0.14)'
      : charged ? 'rgba(125,253,160,0.07)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(x, y, w, h);
    box(x, y, w, h, air ? RED_AIR : live ? '#ffe36a' : armed ? AMB
      : charged ? GRN_D : '#3c4a40', air ? 2 : 1);
    // Only the ARMED button is a button. A charged handset with nothing selected
    // is a readout — clicking it would call callHold(), which correctly refuses,
    // and a control that refuses a click is the thing this round is fixing.
    if (ready) reg('hold', x, y, w, h, 1);
    const c = air ? RED_AIR : live ? '#ffe36a' : armed ? AMB
      : charged ? DIM : '#5d7364';
    if (air) {
      // blinking ON AIR pip, the way every studio on earth does it
      const blink = (G.now % 0.9) < 0.55;
      ctx.fillStyle = blink ? RED_AIR : 'rgba(255,74,58,0.35)';
      ctx.beginPath(); ctx.arc(x + 11, y + 12, 4, 0, 7); ctx.fill();
      tx('ON AIR', x + w / 2 + 6, y + 16, { s: 11, w: 'bold', c, a: 'center', ls: 1.4 });
      // level meter — 12 cells, so it reads as a meter and not as a progress bar
      const mx = x + 8, mw = w - 16, cells = 12;
      const lit = Math.round(clampN(H2.talkLevel || 0, 0, 1) * cells);
      for (let i = 0; i < cells; i++) {
        const cw = mw / cells;
        ctx.fillStyle = i < lit
          ? (i > cells - 3 ? RED_AIR : i > cells - 6 ? '#ffb43a' : '#7fe0a0')
          : 'rgba(255,255,255,0.09)';
        ctx.fillRect(mx + i * cw, y + 23, cw - 1.5, 9);
      }
      // how long he has been rambling, because the ramble is worth something
      tx(`${(H2.talkFor || 0).toFixed(1)}s`, x + w - 6, y + h - 3,
        { s: 10, w: 'bold', c: 'rgba(255,138,124,0.8)', a: 'right' });
      return;
    }
    tx('PA', x + w / 2, y + 17, { s: 12, w: 'bold', c, a: 'center', ls: 1.6 });
    // ROUND 8 — FOUR STATES, AND THE TWO NEW ONES ARE THE POINT. `MIC ONLY` is
    // a charged handset with no roster row to announce at: the key works, the
    // channel opens, and there is simply nobody selected to stall. `RECHARGING`
    // over the count is there because a bare `3s` never said 3 s of WHAT — and
    // the answer used to be "of your microphone", which was the bug.
    // The COUNT is the one thing on this button a player has to be able to read,
    // because it is the answer to "why did nothing happen". Everything else in
    // the recharging state is deliberately grey — the button is unavailable and
    // should look it — but the number itself is warmed off that grey, or the
    // state reads as DISABLED rather than as COMING BACK. Those are different
    // sentences and only one of them is true.
    const cc = (!charged && !live) ? '#c08a3e' : c;
    tx(live ? 'HOLDING' : armed ? 'PRICE CHK' : charged ? 'MIC ONLY' : `${Math.ceil(cool)}s`,
      x + w / 2, y + 32, { s: 11, w: 'bold', c: cc, a: 'center', max: w - 6 });
    if (!charged && !live && H2.max) {                   // cooldown drains left to right
      tx('RECHARGING', x + w / 2, y + h - 5, { s: 8, c: '#6b7d70', a: 'center', ls: 0.8 });
      ctx.fillStyle = 'rgba(255,180,58,0.35)';
      ctx.fillRect(x, y + h - 3, w * (1 - cool / H2.max), 3);
    }
  }
  const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
  // "A4" / "FRONT" / "BACK" — where the terminal will send you, not where he is.
  // ROUND 9: silent when it agrees with the channel header. The rule is "a
  // column that prints A3 on every row of a panel titled AISLE 3 is a margin,
  // not a column" — and I expected that to delete most of it. Measured over 160
  // shift-seconds, 4210 rows, it deletes 45.7%: the OTHER 54.3% of rows are a
  // subject the channel can see who is not in the aisle the channel is named
  // after, and 16.6% are more than one aisle away. That is not a HUD problem
  // and this column is not the fix for it — see the note to cctv in the round-9
  // report: the domes sit at 4.35 m over 2.05 m gondolas, so every one of them
  // sees across the tops of the shelving into its neighbours. Until the sight
  // lines are cut, this column is the only thing on the desk that says so.
  function shortWhere(s, cam) {
    if (!s.where) return '';
    if (cam && s.where === cam.label) return '';
    if (s.aisle != null) return `A${s.aisle + 1}`;
    return s.where === 'FRONT END' ? 'FRONT' : s.where === 'BACK WALL' ? 'BACK' : s.where;
  }

  // ------------------------------------------------------------------ FLOOR
  function drawFloor(G) {
    const f = G.floor;
    // objective / subject marker, projected onto the world
    if (f && f.target && f.target.state !== 'gone' && G.cop) {
      // Pinhole first, then through the grade's lens. Both are needed: `raw` is
      // where the marker's SIZE heuristic is evaluated, `p` is where it is
      // drawn. Everything downstream of here reads the warped point — including
      // the off-screen test, because warp.js is explicit that the map pushes
      // content off the frame at the edge midlines (raw x=1280 lands at 1295),
      // so testing the pinhole would call a man on screen who is not.
      mark('brackets');
      const raw = projectFromCop(G.cop, f.target.x, 1.75, f.target.z);
      const p = warpFloor(raw);
      const d = Math.hypot(f.target.x - G.cop.x, f.target.z - G.cop.z);
      const off = p.behind || p.x < 26 || p.x > W - 26;
      // ROUND 8: the off-screen cluster is pulled further inboard than the
      // round-1 clamp put it. That clamp centred a ~90 px subject label 40 px
      // from the edge, i.e. with half of it off canvas — survivable while the
      // marker was a 26 px bracket and nothing else was competing for the edge,
      // and not survivable now that the chevron below wants the edge itself.
      const edge = off ? 104 : 40;
      const cl = { x: Math.max(edge, Math.min(W - edge, p.x)), y: Math.max(96, Math.min(560, p.y)) };
      // Orange brackets = he has broken for the rear. The cue that a man has
      // turned round belongs ON the man, not in a panel the player is not
      // looking at while chasing one.
      const c = f.target.state === 'flee' ? (f.viaBack ? '#ff7a2e' : RED)
        : (f.confronted ? '#8fa8ff' : AMB);
      ctx.strokeStyle = c; ctx.lineWidth = 2;
      // The bracket is a one-point marker with a size heuristic, which is the
      // exact case warp.js publishes floorMagAt for: the lens does not scale a
      // small square evenly, so the box round a man 2 m away at the centre of
      // frame is 1.12x the box round the same man at the corner. Width takes
      // the tangential factor and height the radial one, per its note.
      const mag = off ? { tangential: 1, radial: 1 } : floorMagAt(raw.x, raw.y);
      const bw0 = off ? 26 : Math.max(26, Math.min(150, 380 / Math.max(1.2, d)));
      const bw = bw0 * mag.tangential;
      const bh2 = bw0 * 1.9 * mag.radial;
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
      // ---- ROUND 8: OFF-SCREEN IS A DIFFERENT PROBLEM NOW ------------------
      // Round 1's off-screen treatment was a 26 px bracket with an arrow glyph
      // in its label, and it was sized for a camera that could not be turned.
      // With 110 degrees of mouse look the player can now put the subject off
      // frame with his wrist, and the thing he has lost is not the man — it is
      // which way round he is. So the edge marker is a real chevron, big enough
      // to be caught in peripheral vision, and when the head is meaningfully
      // deflected it says so, because "I cannot see him" and "my head is turned
      // 70 degrees" are the same fact and the player has no other way to
      // connect them mid-glance.
      if (off) {
        const left = p.x < W / 2;
        const ex = left ? 24 : W - 24;
        const tip = left ? ex - 13 : ex + 13, base = left ? ex + 13 : ex - 13;
        const pulse = 0.55 + 0.45 * Math.sin(G.now * 6);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(tip, cl.y);
        ctx.lineTo(base, cl.y - 20);
        ctx.lineTo(base, cl.y + 20);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        // ...and whether his head is why. "I cannot see him" and "I am looking
        // seventy degrees off my own course" are one fact, and mid-chase the
        // player has no way to put the two together — the view simply does not
        // contain the man any more. Only past a third of the budget, because
        // under that the glance is not what lost him and saying so would be
        // blaming the mouse for a wall.
        const LK = G.look;
        if (LK) {
          const dg = Math.round(Math.abs(LK.yaw * 180 / Math.PI));
          if (dg > Math.max(1, LK.max * 180 / Math.PI) * 0.33) {
            tx(`HEAD ${dg}°`, left ? ex - 14 : ex + 14, cl.y + 38,
              { s: 10, w: 'bold', c: '#ff9a2e', a: left ? 'left' : 'right', ls: 0.6 });
          }
        }
      }
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
      mark('doorTags');
      const dr = f.door;
      dr.all.forEach((e, i) => {
        const his = i === dr.i;
        if (!his && dr.sure) return;
        // Through the lens, same as the brackets. These land forty metres away
        // on the front wall, i.e. usually near the middle of frame where the
        // barrel's displacement is smallest — which is why the door tags never
        // looked obviously wrong and the subject brackets did.
        const p = warpFloor(projectFromCop(G.cop, e.x, 2.62, e.z));
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
    // The complaint pips follow the officer out onto the floor and nothing else
    // does — see the RECORD panel's grave below. They are still only drawn once
    // there is something to draw.
    if (G.st.complaints > 0) {
      mark('complaintPips');
      for (let i = 0; i < 3; i++) {
        const on = i < G.st.complaints;
        ctx.fillStyle = on ? RED : 'rgba(255,255,255,0.10)';
        ctx.fillRect(300 + i * 13, 19, 9, 9);
        box(300 + i * 13, 19, 9, 9, on ? RED : LINE);
      }
      tx(`${G.st.complaints}/3 COMPLAINTS`, 344, 28, { s: 11, w: 'bold', c: RED, ls: 0.8 });
    }

    // ---- DISPATCHED TO — A DESTINATION IS NOT A PERMANENT FACT -------------
    // ROUND 9. Drawn on 100% of floor frames before this, including every frame
    // of every chase, where the biggest amber text on the screen named the
    // aisle the man had just left. It answers exactly one question — "where am
    // I walking" — and that question has an end: he starts running (the
    // pursuit panel and the brackets are the objective now, and they are on
    // HIM rather than on a place), or the case closes (the prompt band says
    // SUBJECT GONE — [Q] RETURN TO POST, which is the same sentence better
    // aimed). Both endings used to leave this panel up saying something stale
    // or something already said one band lower.
    //
    // The CAM 04 in its corner went with it: under one channel per aisle, a
    // panel reading AISLE 4 with CAM 04 beside it is the number twice.
    const chasing = !!(f && f.target && f.target.state === 'flee');
    if (f && !chasing && !f.closed) {
      mark('dispatched');
      panel(10, 62, 262, 54, 'DISPATCHED TO');
      const dest = f.where || `AISLE ${(f.aisle ?? 0) + 1}`;
      tx(dest, 20, 104, {
        s: dest.length > 9 ? 21 : 28, w: 'bold', c: AMB, ls: 2, max: 244,
      });
    }

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
      mark('pursuit');
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
      // ROUND 9: silent when there is only one way out. `ROUTE COMMITTED` is
      // the answer to "can his door preference still overrule the geometry",
      // and with a single exit that question does not exist — it was printing
      // a certainty about a choice nobody was making, every frame of every
      // chase. The moment agents.js opens a second door it speaks again.
      const twoDoors = !!dr && dr.all.length > 1;
      tx(twoDoors ? (dr.sure ? 'ROUTE COMMITTED' : 'BOTH DOORS LIVE') : '', tx0 + tw, bar - 6,
        { s: 10, w: 'bold', c: dr && dr.sure ? RED : AMB, a: 'right' });
      tx(`GAP ${f.dist.toFixed(1)}m`, tx0 + 2, bar + 34, { s: 13, w: 'bold', c: AMB });
      tx(f.eta ? `OUT IN ${f.eta.toFixed(1)}s` : '', tx0 + tw, bar + 34,
        { s: 13, w: 'bold', c: back ? '#ff9a2e' : RED, a: 'right' });

      // --- THE COMMITMENT MOMENT ---------------------------------------------
      // He has turned and broken for the rear cross-aisle. It is the one
      // irreversible decision in this chase and it is worth thirty metres, and
      // until now the player found out about it by losing. Say it out loud.
      if (back) {
        mark('backBanner');
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
    // ROUND 9 took the fifth element off this panel — see PULSE's grave below —
    // and the movement keys off the bottom row once they have been used. What
    // is left is four things, all of which change during a chase.
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
    const held = t.windIn === Infinity;           // key still down: nothing is coming back
    const boost = t.boost > 0;
    const lvl = frac < 0.34 ? '#ff9a2e' : GRN;
    const col = boost ? '#ffe36a' : gassed ? RED : t.wind === 'ready' ? GRN : lvl;
    const state = boost ? 'SUGAR' : gassed ? 'WINDED'
      : t.sprint ? 'SPRINTING' : t.wind === 'ready' ? 'READY' : 'RECOVERING';

    mark('wind');
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

    // Bottom row: what the key is doing, and a pulse that remembers. The held
    // line states the mechanic rather than instructing — the headline next to it
    // already says LET GO, and this is a DVR, not a coach.
    const hint = gassed && held ? 'KEY HELD — NO RECOVERY'
      : gassed ? 'WIND RETURNING'
      : t.sprint ? '[SHIFT] SPRINTING'
      : null;
    if (hint) {
      tx(hint, sx + 16, sy + 92,
        { s: 12, w: gassed ? 'bold' : '', c: gassed && held ? RED : gassed ? '#ff9a2e' : DIM, ls: 1 });
    } else {
      // ...and when there is no state to report, the movement keys, until he
      // has used them. See keyRow: the words that teach WASD are worth printing
      // once and worth nothing on the four hundredth frame of a chase.
      keyRow(G, sx + 16, sy + 92, sw - 40, ['sprint'], { mark: 'floorKeyHint' });
    }
    // ---- PULSE, RETIRED IN ROUND 9 ---------------------------------------
    // `PULSE 148` in the corner of this panel, on 100% of floor frames, for
    // three rounds. Round 6 defended it as the lagging signal that carries a
    // whole chase's worth of wear where a bar this fast cannot — which was true
    // and still is, and is an argument for the SIGNAL rather than for a number.
    //
    // agents.js integrates `fatigue` once and the cop's own body is driven off
    // that same value: at 0.55 he starts putting his hands on his knees, which
    // is exactly the threshold this readout was tuned to turn red at. The lag
    // was therefore already on screen, 1.75 m tall, in the middle of the frame
    // the player is staring at. Restating it as three digits is the fourth
    // telling again, in the one panel that IS read under pressure — and it was
    // the only element on it that never changed a decision. If the heave ever
    // stops reading, the fix goes on the BODY and not back into this corner.

    if (gassed) { mark('gassedFrame'); // red frame creep, so you feel it without reading anything
      const a = 0.12 + 0.1 * Math.sin(G.now * 8);
      ctx.strokeStyle = `rgba(255,74,58,${a})`; ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, W - 14, H - 14);
    }

    // ---- THE RECORD PANEL, RETIRED IN ROUND 9 ----------------------------
    // 270x104 px, bottom right, 100% of floor frames: rank, points, three
    // complaint pips and a key hint. On the floor the player is doing exactly
    // one thing — catching a man — and not one of those four facts changes
    // anything he is about to do about it. Points and rank are a RECORD: they
    // are settled at the write-up, full screen, with a progress bar and a
    // manager who cannot stop talking, which is the correct and much funnier
    // place for them. The pips moved into the band and only appear once you
    // have earned one; [Q] moved into keyRow and erodes after the first press.
    keyRow(G, 1126, 700, 150, ['post'], { plate: true, mark: 'floorKeyHint' });

    // --- centre prompt / dialogue
    // ROUND 7 — THE WARNING HAS TO SURVIVE THE THING THAT CAUSED IT.
    // The guest yelling at you IS a dialogue, and the dialogue panel occupies
    // exactly the band the prompt uses, so the first cut of the back-off
    // warning was drawn and then immediately hidden behind the shout that
    // triggered it — a countdown nobody could see. They are two different
    // messages: the yell is him, the warning is the game, and during the grace
    // window BOTH are on screen with the warning parked above the panel.
    let promptY = 540;
    if (f && f.dialogue) {
      mark('dialogue');
      const d = f.dialogue, bx = 300, bw = 680, bhh = 34 + d.shown.length * 26;
      const byy = 590 - bhh;
      panel(bx, byy, bw, bhh, d.speaker, { accent: d.bad ? RED : '#9bb9a4' });
      d.shown.forEach((ln, i) => tx(ln, bx + 16, byy + 40 + i * 26,
        { s: 17, c: '#e8f4ea', ls: 0.4, max: bw - 32 }));
      promptY = byy - 44;
    }
    if (f && f.prompt && (!f.dialogue || f.backOff)) {
      // ROUND 7: the quiet line is the one prompt in the game that is not an
      // instruction, and an amber alert box reading NOTHING IS HAPPENING is a
      // contradiction in its own frame. Same band, same place, no border, and
      // the store's own dim green — it has to look like the absence of an
      // order rather than another one.
      mark('prompt'); if (f.backOff) mark('backOff');
      const q = f.promptQuiet;
      // ROUND 7: the back-off warning is the only prompt in the game with a
      // clock on it, so it is the only one that is red and the only one that
      // draws the clock. Everything else here is advice; this one expires.
      const bo = f.backOff;
      const w2 = f.prompt.length * (q ? 8.2 : 9) + 40;
      const x2 = W / 2 - w2 / 2;
      const py = bo ? promptY : 540;
      const flash = bo && (G.now % 0.5) < 0.3;
      ctx.fillStyle = bo ? (flash ? 'rgba(90,12,8,0.92)' : 'rgba(48,8,6,0.9)')
        : q ? 'rgba(3,7,4,0.62)' : 'rgba(3,7,4,0.86)';
      ctx.fillRect(x2, py, w2, 34);
      if (bo) box(x2, py, w2, 34, RED, 2);
      else if (!q) box(x2, py, w2, 34, AMB);
      tx(f.prompt, W / 2, py + 23, {
        s: q ? 14 : 15, w: q ? '' : 'bold',
        c: bo ? (flash ? '#ffd9d3' : RED) : q ? '#8fae97' : AMB,
        a: 'center', ls: q ? 1 : 1.4,
      });
      if (bo) {                       // the deadline, draining right to left
        ctx.fillStyle = RED;
        ctx.fillRect(x2, py + 34, w2 * (f.backOffLeft || 0), 3);
      }
    }
    if (f && f.stampT > 0) {
      mark('stamp');
      ctx.globalAlpha = Math.min(1, f.stampT * 2.2);
      const sc = f.stampTone === 'flat' ? AMB : RED;
      stamp(f.stampText, W / 2, 236, { s: 38, c: sc });
      if (f.stampSub) {
        const sw2 = f.stampSub.length * 9 + 28;
        ctx.fillStyle = 'rgba(3,6,4,0.82)'; ctx.fillRect(W / 2 - sw2 / 2, 268, sw2, 22);
        tx(f.stampSub, W / 2, 284, { s: 13, w: 'bold', c: sc, a: 'center', ls: 1 });
      }
      ctx.globalAlpha = 1;
    }
    // 80 high, not 84: the ticker's backing plate starts at y=688 and the
    // panel's bottom border was landing inside it.
    paFloor(G, f, 492, 606, 498, 80);
    lookGauge(G, 1090, 62, 180, 50);
    ticker(G, 500, 700, 480, true);
    burnIn();
  }

  // ==========================================================================
  // ROUND 8 — THE HANDSET, ON THE FLOOR
  // ==========================================================================
  // There was no PA readout on this screen at all, because until this round
  // there was no PA on this screen: [F] was gated on `mode === 'desk'`. It is
  // not any more — a man who has walked into the aisle and can see what the
  // subject's hands are doing is the man with something to say — so the state
  // has to be visible here for the same reason it has to be visible at the
  // desk. An open microphone with nothing on screen is the client's complaint.
  //
  // ALWAYS DRAWN, in all three of its states, which is the actual lesson of
  // this round: the desk button was hidden whenever no subject was selected and
  // that is how a live capture device ended up with no pixels anywhere.
  function paFloor(G, f, x, y, w, h) {
    if (!f) return;
    const H2 = G.hold || {};
    const air = !!H2.talk;
    const RED_AIR = '#ff4a3a';
    const a = f.annAt;
    const held = a && !a.out;                 // keyed, and he has not reacted yet
    // ---- ROUND 9: THE IDLE PANEL COLLAPSES TO ONE LINE --------------------
    // Round 8 put this panel up on every floor frame and the reasoning was
    // right for the case it was reasoning about: a live capture device with no
    // pixels anywhere is the client's "it looks like it's recording but it
    // doesn't do anything". That argument covers ON AIR, and it covers an
    // announcement in flight. It does not cover the third state, which is
    // NOTHING IS HAPPENING — and nothing was happening on 100% of the floor
    // frames of a competent shift, because a player who never keys the handset
    // still got 498x80 px of panel, a title tab, and the permanent footnote
    // SAYS IT OUT LOUD. EVERYONE HEARS IT.
    //
    // So the readout is now exactly as big as the situation. Idle: one dim
    // line naming who the handset is pointed at, with the key in front of it
    // until he has pressed it once. Live or announcing: the whole panel,
    // unchanged, meter and all.
    if (!air && !a) {
      mark('paIdle');
      const cd = !H2.pbReady && H2.pbIn > 0;
      const key = (G.taught && G.taught.pa) ? '' : '[F] ';
      const line = cd ? `PA BUSY — ${H2.pbIn.toFixed(1)}s` : key + (f.paLabel || 'PA');
      plate(x - 6, y + 24, Math.min(w + 12, advance(line, 12, cd ? 'bold' : '', 1) + 24), 19);
      tx(line, x + 2, y + 38,
        { s: 12, w: cd ? 'bold' : '', c: cd ? '#ff9a2e' : '#9fbfa8', ls: 1, max: w });
      return;
    }
    mark('paPanel');
    const acc = air ? RED_AIR : a ? (a.out === 'heed' ? GRN : AMB) : '#4d5f52';
    panel(x, y, w, h, 'PA HANDSET', { accent: acc, line: air ? RED_D : LINE });

    // Line 1 — WHO, or ON AIR. The two can be true together: keying the handset
    // fires the announcement and opens the channel on the same keydown.
    if (air) {
      const blink = (G.now % 0.9) < 0.55;
      ctx.fillStyle = blink ? RED_AIR : 'rgba(255,74,58,0.35)';
      ctx.beginPath(); ctx.arc(x + 20, y + 34, 5, 0, 7); ctx.fill();
      tx('ON AIR', x + 34, y + 39, { s: 16, w: 'bold', c: RED_AIR, ls: 1.8 });
      // The level meter is the only proof the player has that the store can
      // hear him. It is worth more than any label on this panel.
      const mx = x + 130, mw = w - 200, cells = 16;
      const lit = Math.round(clampN(H2.talkLevel || 0, 0, 1) * cells);
      for (let i = 0; i < cells; i++) {
        const cw = mw / cells;
        ctx.fillStyle = i < lit
          ? (i > cells - 4 ? RED_AIR : i > cells - 8 ? '#ffb43a' : '#7fe0a0')
          : 'rgba(255,255,255,0.09)';
        ctx.fillRect(mx + i * cw, y + 26, cw - 2, 16);
      }
      tx(`${(H2.talkFor || 0).toFixed(1)}s`, x + w - 14, y + 39,
        { s: 13, w: 'bold', c: 'rgba(255,138,124,0.85)', a: 'right' });
    } else {
      tx(a ? a.label : (f.paLabel || 'PA'), x + 14, y + 39,
        { s: 15, w: 'bold', c: a ? AMB : (f.paAim ? AMB : DIM), ls: 1, max: w - 28 });
    }

    // Line 2 — WHAT HE DID, and it is allowed to say "nothing yet".
    //
    // THE WAIT STATE IS NOT A GAP TO BE FILLED. agents.js rolls the reaction
    // 0.35-0.95 s after the handset is keyed and delivers it through
    // onAnnounce, explicitly so that no HUD line can get ahead of the picture.
    // The honest readout for that second is that he has not reacted yet, and
    // anything cleverer here — a prediction, an optimistic label, a probability
    // — would be this file quietly answering a question the whole mechanic is
    // built to make the player answer with his eyes.
    if (a) {
      const oc = a.out === 'heed' ? GRN : a.out === 'shrug' ? AMB : DIM;
      const dots = held ? '.'.repeat(1 + (Math.floor(G.now * 3) % 3)) : '';
      tx((a.line || '') + dots, x + 14, y + 62, { s: 13, w: 'bold', c: oc, ls: 0.8, max: w - 150 });
      // ...AND EVERYBODY ELSE. The footnote is on the panel every single time,
      // because it is the sentence that stops this being a guilt scanner: you
      // did not speak to him, you spoke to the shop, and the four people who
      // looked up are four people who looked up.
      tx(a.sub || '', x + w - 14, y + 62, { s: 10, c: '#5d7364', a: 'right' });
    }
  }

  // ==========================================================================
  // ROUND 8 — WHICH WAY IS HE FACING (JOB 3)
  // ==========================================================================
  // camera.js landed 110 degrees of mouse look and main.js steers by `moveYaw`,
  // so the head and the course have come apart deliberately: turning to look
  // down a cross-aisle no longer changes where W walks you. That is the right
  // decision and it introduces the one failure it implies — the player can now
  // be walking one way and looking another, and the camera builder's standing
  // caveat is that a thief who leaves your aisle is invisible about 89% of the
  // time. Being turned the wrong way on top of that is disorienting rather than
  // difficult, and disorienting is not a difficulty setting.
  //
  // So: a PAN readout, in the fiction the rest of this HUD is already in. Every
  // dome in this store is a PTZ and every PTZ has one. Centre notch is the
  // corridor — where your feet are going — and the tick is your head. It is
  // drawn at all times rather than only when deflected, because a gauge that
  // appears when you are already lost teaches nothing; this one is sitting
  // there at zero, so the first time it moves the player knows what moved.
  //
  // NB the numbers are read off camera.js's live rig via game.js's G.look and
  // nothing here re-derives them. This file has form on exactly that mistake —
  // it used to carry its own hand-copied projection of a camera it did not own,
  // correct only for as long as that camera never moved.
  function lookGauge(G, x, y, w, h) {
    const L2 = G.look;
    if (!L2) return;                       // no camera to ask: round 7's HUD
    mark('pan');
    const deg = L2.yaw * 180 / Math.PI;
    const mag = Math.abs(deg);
    const max = Math.max(1, L2.max * 180 / Math.PI);
    // Amber past a third of the budget, red past two thirds. The thresholds are
    // the point at which the aisle you walked in from has left the frame.
    const c = mag > max * 0.66 ? '#ff9a2e' : mag > max * 0.33 ? AMB : DIM;
    // ---- ROUND 9: THE GAUGE KEPT ITS SWEEP AND LOST ITS BOX --------------
    // Round 8's argument for drawing this at all times is still the right one
    // and is not touched: a gauge that appears once you are already lost
    // teaches nothing, so it has to be sitting there at zero the first time it
    // moves. That argument is about the TICK. It was never an argument for a
    // 274x50 titled panel with a scanline fill and a COURSE caption under it,
    // which is what carried the tick on 100% of floor frames.
    //
    // What is left is the instrument: a sweep, a notch at the corridor, a tick
    // at his head, and a number that appears only once the head is actually
    // off the corridor. At rest it is a thin dark line in the top right that
    // costs the player nothing to ignore, and it still moves the instant he
    // moves the mouse, which is the whole of what it was for.
    const gx = x + 12, gw = w - 24, gy = y + 14, mid = gx + gw / 2;
    plate(gx, gy, gw, 12, 0.92);
    box(gx, gy, gw, 12, mag > max * 0.33 ? c : LINE);
    ctx.fillStyle = 'rgba(125,253,160,0.35)'; ctx.fillRect(mid - 1, gy - 3, 2, 18);
    const tick = mid + clampN(deg / max, -1, 1) * (gw / 2);
    ctx.fillStyle = c;
    ctx.fillRect(Math.min(mid, tick), gy + 3, Math.abs(tick - mid), 6);
    ctx.fillRect(tick - 1.5, gy - 4, 3, 20);
    if (mag >= 1) {
      tx(`${Math.round(mag)}° ${deg < 0 ? 'LEFT' : 'RIGHT'}`, x + w - 12, gy + 30,
        { s: 11, w: 'bold', c, a: 'right', ls: 0.8 });
    }
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
    // Re-anchor the DVR stamp to wall time, once, before anything prints it.
    clockBase = Date.now() - G.st.clock * 1000;
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

  // The clock cctv.setClock() is handed, if it ever ships. Same function the
  // band prints from, so there is exactly one clock on this desk.
  hud.wallClock = wallClock;

  // ROUND 9. One frame, drawn for real, with every mark() recorded. ./eval.js
  // calls this at 10 Hz through a shift and divides — see the census block in
  // its report. It renders to the same canvas the player sees, which is the
  // point: the answer is what was painted, not what the code thinks it paints.
  hud.sample = function (G) {
    census = {};
    hud.render(G);
    const c = census; census = null;
    return c;
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
