// OWNER: builder-store. THE FRONT END — every printed and lit surface that
// belongs to the checkout run and the customer service desk.
//
// ROUND 17. The client, playing it: "We need a fully functional checkout and
// customer service. Those are key elements to this that they're missing... it
// makes it feel a little bit more like an actual functional grocery store."
//
// The geometry lives in ../store.js because it needs that file's closures
// (fix / tube / solid / fillShelf / the field sinks). What lives HERE is the
// same split the rest of the store already uses: tex.js and pack.js paint
// canvases, store.js bolts them onto boxes. Nothing in this file touches THREE
// beyond CanvasTexture.
//
// Contract:
//   laneSignAtlas(THREE)   4x2  lane number lightboxes, 1..8
//   screenAtlas(THREE)     4x4  self-lit screens: till, PIN pad, scale, scanner
//   frontSignAtlas(THREE)  4x4  lit printed plates: CUSTOMER SERVICE, RETURNS,
//                               policy copy, LANE CLOSED, bag-rack cards
//   magAtlas(THREE)        4x4  magazine covers for the impulse rack
//   EXPRESS / CLOSED_AT_START   which lanes are express, and which start shut
//
// WHAT IS DELIBERATELY NOT HERE. The first draft carried a caseAtlas() painting
// the cigarette and lottery cabinet as a texture, and a beltTex() painting the
// checkout belt. Both were deleted before shipping and for the same reason,
// which is worth writing down because it is the opposite of the usual call:
// a NEW MATERIAL COSTS A DRAW CALL AND AN INSTANCED BOX COSTS NOTHING. The
// cabinet is 176 boxes in the fixture batch that already exists, which also
// gives it real depth behind the glass that a printed panel cannot have; and
// the belt is one box through the WOOD material, whose map is a longitudinal
// grain — which is exactly the structure a woven food-grade belt has.
//
// WHY THE MAGAZINE RACK IS IN HERE AND WHY IT HAS FACES ON IT.
// Round 15's critic reduced the blind test to one sentence: "the render
// contains no depicted real-world object... every photograph call came off
// recognising something real — a named brand, an Epson printer, a human face,
// an actual peach." A checkout impulse rack is the one fixture in a
// supermarket that is ENTIRELY made of depicted real objects at eye height:
// magazine covers with a face on them, a named-brand receipt printer, a keypad
// with digits, a lit numeral over the lane. That is why the front end is worth
// more to this render than its floor area suggests.

import { makeRng, rr, ri, pick } from './kit.js';
import { FACE, BRANDS } from './brands.js';

function cv(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(THREE, canvas, { srgb = true, rx = 1, ry = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// Shrink-to-fit, so a long word never runs out of its plate. Same job as
// tex.js's private fitText; duplicated deliberately rather than exported from
// there, because tex.js has no reason to grow an API surface for this.
function fit(g, txt, cx, y, maxW, px, weight = '700', face = FACE.grot) {
  let s = px;
  for (; s > 5; s -= 1) {
    g.font = weight + ' ' + s + 'px ' + face;
    if (g.measureText(txt).width <= maxW) break;
  }
  g.fillText(txt, cx, y);
  return s;
}
// A line of illegible small print: real policy plates are 90% grey texture and
// 10% readable heading, and drawing every word costs a hundred times more than
// it is worth at the distance one is ever seen from.
function greeked(g, x, y, w, lh, lines, col = 'rgba(30,28,24,0.62)') {
  g.fillStyle = col;
  for (let i = 0; i < lines; i++) {
    const ww = w * (0.72 + 0.28 * ((i * 7919) % 97) / 97);
    g.fillRect(x, y + i * lh, ww, Math.max(1, lh * 0.34));
  }
}

// Which lanes are express. Exported so ../store.js and the anchor table agree
// instead of each deciding for itself — the CLAUDE.md rule, at the smallest
// scale it applies at.
export const EXPRESS = [0, 1];
// Lanes that are shut when the store opens the shift. agents.js may re-open one
// live through setLaneOpen(); this is only the starting state.
export const CLOSED_AT_START = [3, 6];

// ---------------------------------------------------------------------------
// LANE NUMBER LIGHTBOXES. 4x2 of 256 px. Cell i is lane i+1.
//
// A real one is an acrylic box lit from inside with a black numeral silkscreen
// and a coloured cap band; express lanes carry a second line under the number.
// The lane's OPEN state is NOT drawn here — it is the lamp on top of the box,
// which is a separate mesh so agents.js can switch it at run time.
export function laneSignAtlas(THREE) {
  const S = 256;
  const [c, g] = cv(S * 4, S * 2);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    const ox = (i % 4) * S, oy = Math.floor(i / 4) * S;
    g.save(); g.translate(ox, oy);
    // the diffuser, hot in the middle where the lamp is
    const lg = g.createLinearGradient(0, 0, 0, S);
    lg.addColorStop(0, '#f4eedf'); lg.addColorStop(0.44, '#fffdf6');
    lg.addColorStop(1, '#eee7d5');
    g.fillStyle = lg; g.fillRect(0, 0, S, S);
    const exp = EXPRESS.includes(i);
    g.fillStyle = exp ? '#1d7a3e' : '#c8402c';
    g.fillRect(0, 0, S, 30); g.fillRect(0, S - 30, S, 30);
    g.fillStyle = '#fdf8ea';
    fit(g, exp ? 'EXPRESS' : 'CHOP PRICER', S / 2, 16, S - 22, 20, '800', FACE.geo);
    g.fillStyle = '#20242c';
    fit(g, String(i + 1), S / 2, S / 2 - (exp ? 14 : 2), S - 88, 168, '800', FACE.fat);
    if (exp) {
      g.fillStyle = '#1d7a3e';
      fit(g, '10 ITEMS OR FEWER', S / 2, S - 58, S - 26, 26, '700', FACE.grot);
    }
    // the acrylic is screwed to the box at four corners and they show
    g.fillStyle = 'rgba(60,56,48,0.35)';
    for (const px of [16, S - 16]) for (const py of [16, S - 16]) {
      g.beginPath(); g.arc(px, py, 3.6, 0, 6.284); g.fill();
    }
    g.restore();
  }
  return tex(THREE, c, { aniso: 16 });
}

// ---------------------------------------------------------------------------
// SCREENS. 4x4 of 256x192. MeshBasic in ../store.js: a lit LCD is its own
// light source and taking room shading off it is what makes a monitor read as
// a monitor rather than a painted rectangle.
//
//  0 till, mid-transaction     4 PIN pad: INSERT CHIP     8  scale 0.00 lb
//  1 till, mid-transaction     5 PIN pad: APPROVED        9  scale 1.86 lb
//  2 till, sign-on screen      6 PIN pad: keypad face     10 scanner glass
//  3 screen off (dark)         7 PIN pad: TOTAL           11 scanner glass, red
//  12 service desk: lottery terminal    14 money order terminal
//  13 service desk: returns POS         15 CCTV thumbnail (the desk monitor)
export function screenAtlas(THREE) {
  const W = 256, H = 192;
  const [c, g] = cv(W * 4, H * 4);
  const rng = makeRng(0x51d3);
  const at = (i) => { g.save(); g.translate((i % 4) * W, Math.floor(i / 4) * H); };
  const money = (v) => '$' + v.toFixed(2);

  // --- the till: a dark UI chrome with a scrolling item list ----------------
  const till = (i, items, signOn) => {
    at(i);
    g.fillStyle = '#0d1b2a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#15406b'; g.fillRect(0, 0, W, 22);
    g.fillStyle = '#cfe6ff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = '700 13px ' + FACE.grot;
    g.fillText(signOn ? 'CHOP PRICER  POS 7.4' : 'SALE', 8, 11);
    g.textAlign = 'right';
    g.fillText(signOn ? 'SIGN ON' : 'OPERATOR 214', W - 8, 11);
    if (signOn) {
      g.textAlign = 'center'; g.fillStyle = '#8fc3ff';
      g.font = '700 22px ' + FACE.grot;
      g.fillText('ENTER OPERATOR ID', W / 2, H / 2 - 14);
      g.strokeStyle = '#3d7dbd'; g.lineWidth = 2;
      g.strokeRect(W / 2 - 62, H / 2 + 4, 124, 26);
      g.restore(); return;
    }
    let total = 0;
    g.textBaseline = 'middle';
    for (let k = 0; k < items; k++) {
      const y = 34 + k * 17;
      const p = rr(rng, 0.99, 9.49);
      total += p;
      g.fillStyle = k % 2 ? '#12253a' : '#0f2033'; g.fillRect(4, y - 8, W - 8, 16);
      g.fillStyle = '#dfeeff'; g.textAlign = 'left';
      g.font = '400 12px ' + FACE.grot;
      const nm = pick(rng, BRANDS).slice(0, 12);
      g.fillText(nm, 10, y);
      g.textAlign = 'right';
      g.fillText(money(p), W - 10, y);
    }
    g.fillStyle = '#1d7a3e'; g.fillRect(0, H - 42, W, 42);
    g.fillStyle = '#f2fff5'; g.textAlign = 'left';
    g.font = '800 20px ' + FACE.grot; g.fillText('TOTAL', 10, H - 21);
    g.textAlign = 'right'; g.font = '800 28px ' + FACE.fat;
    g.fillText(money(total), W - 10, H - 20);
    g.restore();
  };
  till(0, 7, false); till(1, 5, false); till(2, 0, true);
  // 3 — a dark screen. Not black: an LCD that is off still reflects the room.
  at(3);
  const og = g.createLinearGradient(0, 0, W, H);
  og.addColorStop(0, '#23262b'); og.addColorStop(0.5, '#171a1e'); og.addColorStop(1, '#2a2e34');
  g.fillStyle = og; g.fillRect(0, 0, W, H);
  g.restore();

  // --- the customer-facing PIN pad -----------------------------------------
  const pad = (i, mode) => {
    at(i);
    g.fillStyle = '#e9eef2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#0e5aa7'; g.fillRect(0, 0, W, 26);
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '800 15px ' + FACE.grot; g.fillText('CHOP PRICER', W / 2, 13);
    g.fillStyle = '#16202a';
    if (mode === 'chip') {
      g.font = '800 26px ' + FACE.grot; g.fillText('$47.13', W / 2, 62);
      g.font = '600 17px ' + FACE.grot; g.fillText('INSERT OR TAP CARD', W / 2, 96);
      g.fillStyle = '#0e5aa7'; g.fillRect(W / 2 - 66, 118, 132, 34);
      g.fillStyle = '#fff'; g.font = '700 15px ' + FACE.grot;
      g.fillText('CANCEL', W / 2, 135);
    } else if (mode === 'ok') {
      g.fillStyle = '#1d7a3e'; g.fillRect(0, 26, W, H - 26);
      g.fillStyle = '#f4fff7'; g.font = '800 30px ' + FACE.grot;
      g.fillText('APPROVED', W / 2, 84);
      g.font = '600 17px ' + FACE.grot; g.fillText('REMOVE CARD', W / 2, 120);
    } else if (mode === 'total') {
      g.font = '600 15px ' + FACE.grot; g.fillText('AMOUNT DUE', W / 2, 54);
      g.font = '800 46px ' + FACE.fat; g.fillText('$12.68', W / 2, 96);
      g.fillStyle = '#5b6570'; g.font = '600 12px ' + FACE.grot;
      g.fillText('DEBIT / CREDIT / EBT ACCEPTED', W / 2, 146);
    } else {
      // the physical keypad face, not a screen — 12 keys and three colours
      const kw = 44, kh = 30;
      for (let r = 0; r < 4; r++) for (let cc = 0; cc < 3; cc++) {
        const kx = 34 + cc * (kw + 8), ky = 36 + r * (kh + 6);
        g.fillStyle = '#f7f9fa'; g.fillRect(kx, ky, kw, kh);
        g.fillStyle = '#cdd4d9'; g.fillRect(kx, ky + kh - 4, kw, 4);
        g.fillStyle = '#20262c'; g.font = '700 17px ' + FACE.grot;
        const lbl = r === 3 ? ['*', '0', '#'][cc] : String(r * 3 + cc + 1);
        g.fillText(lbl, kx + kw / 2, ky + kh / 2);
      }
      const side = [['#c02b1e', 'X'], ['#e8b400', '<'], ['#1d7a3e', 'OK']];
      for (let r = 0; r < 3; r++) {
        g.fillStyle = side[r][0]; g.fillRect(190, 44 + r * 40, 44, 30);
        g.fillStyle = '#fff'; g.font = '800 15px ' + FACE.grot;
        g.fillText(side[r][1], 212, 59 + r * 40);
      }
    }
    g.restore();
  };
  pad(4, 'chip'); pad(5, 'ok'); pad(6, 'keys'); pad(7, 'total');

  // --- scale LCD and scanner glass -----------------------------------------
  const scale = (i, s) => {
    at(i);
    g.fillStyle = '#9fb08a'; g.fillRect(0, 0, W, H);   // backlit STN green
    g.fillStyle = '#2a3320'; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.font = '700 74px ' + FACE.mono; g.fillText(s, W - 46, H / 2);
    g.font = '700 26px ' + FACE.grot; g.fillText('lb', W - 8, H / 2 + 20);
    g.textAlign = 'left'; g.font = '700 16px ' + FACE.grot;
    g.fillText('NET WEIGHT', 10, 20);
    g.restore();
  };
  scale(8, '0.00'); scale(9, '1.86');
  for (const [i, hot] of [[10, false], [11, true]]) {
    at(i);
    g.fillStyle = '#141719'; g.fillRect(0, 0, W, H);
    // the sapphire window has a grid of reflected room highlights in it
    g.strokeStyle = 'rgba(210,225,235,0.10)'; g.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      g.beginPath(); g.moveTo(0, k * 26); g.lineTo(W, k * 26 - 40); g.stroke();
    }
    if (hot) {
      const rg = g.createLinearGradient(0, H / 2 - 12, 0, H / 2 + 12);
      rg.addColorStop(0, 'rgba(255,40,30,0)');
      rg.addColorStop(0.5, 'rgba(255,60,40,0.85)');
      rg.addColorStop(1, 'rgba(255,40,30,0)');
      g.fillStyle = rg; g.fillRect(0, H / 2 - 12, W, 24);
    }
    g.restore();
  }

  // --- service desk terminals ----------------------------------------------
  at(12);
  g.fillStyle = '#101b3a'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#e8b400'; g.fillRect(0, 0, W, 30);
  g.fillStyle = '#151004'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 20px ' + FACE.fat; g.fillText('STATE LOTTERY', W / 2, 15);
  g.fillStyle = '#cfd8ff'; g.font = '700 15px ' + FACE.grot;
  g.fillText('DRAW  TUE  FRI', W / 2, 52);
  g.font = '800 40px ' + FACE.mono; g.fillStyle = '#ffe27a';
  g.fillText('$186M', W / 2, 96);
  g.fillStyle = '#8f9ac9'; g.font = '600 12px ' + FACE.grot;
  g.fillText('PLAY RESPONSIBLY  ·  18+', W / 2, 150);
  g.restore();
  at(13);
  g.fillStyle = '#123020'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#9fe6bd'; g.textAlign = 'left'; g.textBaseline = 'middle';
  g.font = '700 14px ' + FACE.grot; g.fillText('RETURNS / EXCHANGE', 8, 16);
  greeked(g, 8, 34, W - 16, 15, 7, 'rgba(160,235,190,0.45)');
  g.fillStyle = '#1d7a3e'; g.fillRect(6, H - 40, W - 12, 30);
  g.fillStyle = '#eafff2'; g.font = '800 18px ' + FACE.grot;
  g.fillText('REFUND  $8.24', 14, H - 25);
  g.restore();
  at(14);
  g.fillStyle = '#2b2f36'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#f2c94c'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 22px ' + FACE.fat; g.fillText('MONEY ORDER', W / 2, 34);
  g.fillStyle = '#cdd3da'; g.font = '600 14px ' + FACE.grot;
  g.fillText('AMOUNT', W / 2, 78);
  g.fillStyle = '#12161a'; g.fillRect(W / 2 - 70, 92, 140, 34);
  g.fillStyle = '#7dffb0'; g.font = '700 26px ' + FACE.mono;
  g.fillText('250.00', W / 2, 110);
  g.restore();
  at(15);
  g.fillStyle = '#1a1d1a'; g.fillRect(0, 0, W, H);
  for (let k = 0; k < 4; k++) {
    const qx = (k % 2) * (W / 2) + 3, qy = Math.floor(k / 2) * (H / 2) + 3;
    g.fillStyle = ['#3a4238', '#333b34', '#414a3e', '#2f362f'][k];
    g.fillRect(qx, qy, W / 2 - 6, H / 2 - 6);
    g.fillStyle = 'rgba(190,210,180,0.30)';
    g.fillRect(qx + 6, qy + H / 4, W / 2 - 40, 4);
    g.fillStyle = '#b7c3ae'; g.textAlign = 'left'; g.textBaseline = 'top';
    g.font = '700 9px ' + FACE.mono;
    g.fillText('CH0' + (k + 1), qx + 5, qy + 4);
  }
  g.restore();
  return tex(THREE, c, { aniso: 8 });
}

// ---------------------------------------------------------------------------
// PRINTED PLATES AT THE FRONT. 4x4 of 512x256. Lit, through signs.js.
//
//  0 CUSTOMER SERVICE (the big hanging box)   8  LANE CLOSED
//  1 RETURNS & EXCHANGES                      9  PLEASE USE NEXT LANE
//  2 LOTTERY / MONEY ORDERS                   10 RING BELL FOR SERVICE
//  3 WESTERN UNION-ish money services         11 THANK YOU FOR SHOPPING
//  4 returned-check policy, dense copy        12 PAPER OR PLASTIC card
//  5 alcohol / tobacco ID policy              13 bag rack header
//  6 no checks over $50                       14 20 ITEMS OR FEWER
//  7 security notice / camera warning         15 CUSTOMER SERVICE, small
export function frontSignAtlas(THREE) {
  const W = 512, H = 256;
  const [c, g] = cv(W * 4, H * 4);
  const at = (i) => { g.save(); g.translate((i % 4) * W, Math.floor(i / 4) * H); };
  const plate = (bg) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); };

  const band = (i, txt, sub, bg, fg, accent) => {
    at(i); plate(bg);
    if (accent) { g.fillStyle = accent; g.fillRect(0, H - 22, W, 22); g.fillRect(0, 0, W, 10); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, txt, W / 2, sub ? H / 2 - 26 : H / 2, W - 44, 92, '800', FACE.geo);
    if (sub) {
      g.font = '700 34px ' + FACE.grot;
      fit(g, sub, W / 2, H / 2 + 46, W - 60, 34, '700', FACE.grot);
    }
    g.restore();
  };
  band(0, 'CUSTOMER SERVICE', 'RETURNS · LOTTERY · MONEY ORDERS', '#f6f0dd', '#20242c', '#7d8b58');
  band(1, 'RETURNS', 'AND EXCHANGES', '#f6f0dd', '#a3402c', '#c26333');
  band(2, 'LOTTERY', 'SCRATCH-OFFS · POWER DRAW', '#12204a', '#ffe27a', '#e8b400');
  band(3, 'MONEY SERVICES', 'MONEY ORDERS · WIRE · BILL PAY', '#1d5b3a', '#f2fff5', '#e8b400');
  band(8, 'ICE COLD', 'GRAB & GO', '#1a6ea8', '#f2fbff', '#0e4d78');
  band(9, 'THIS LANE', 'CLOSED', '#20242c', '#fdf8ea', '#c8402c');
  band(10, 'RING BELL', 'FOR SERVICE', '#f6f0dd', '#20242c', '#7d8b58');
  band(11, 'THANK YOU', 'FOR SHOPPING CHOP PRICER', '#7d8b58', '#fdf8ea', '#5f6c40');
  band(13, 'BAG YOUR OWN', 'AND SAVE 5¢', '#f6f0dd', '#1d7a3e', '#1d7a3e');
  band(14, '20 ITEMS', 'OR FEWER', '#f6f0dd', '#1d7a3e', '#1d7a3e');
  band(15, 'CUSTOMER SERVICE', null, '#7d8b58', '#fdf8ea', '#5f6c40');

  // the dense-copy plates. A shopper never reads one; what they see is a slab
  // of grey type with two lines of heading in it, which is exactly what these
  // draw. Copy that IS legible is the round-15 tell, so the headings are real
  // and the body is texture on purpose.
  const policy = (i, head, subs) => {
    at(i); plate('#1c1f24');
    g.fillStyle = '#f2eee2'; g.textAlign = 'left'; g.textBaseline = 'middle';
    fit(g, head, 22, 34, W - 44, 34, '800', FACE.grot);
    g.textAlign = 'left';
    let y = 68;
    for (const s of subs) {
      g.fillStyle = '#e6c98a'; g.font = '700 17px ' + FACE.grot;
      g.fillText(s, 22, y); y += 16;
      greeked(g, 22, y, W - 60, 11, 4, 'rgba(214,210,198,0.42)');
      y += 56;
    }
    g.fillStyle = '#c8402c'; g.fillRect(0, H - 14, W, 14);
    g.restore();
  };
  policy(4, 'RETURNED CHECK POLICY',
    ['FACE AMOUNT OF CHECK', 'PURCHASES OF ALCOHOL AND TOBACCO']);
  policy(5, 'AGE-RESTRICTED PRODUCTS',
    ['PROOF OF AGE IS REQUIRED', 'WE ID EVERYONE UNDER 40']);
  policy(6, 'CHECK CASHING',
    ['NO CHECKS OVER $50.00', 'TWO FORMS OF ID REQUIRED']);
  policy(7, 'NOTICE TO CUSTOMERS',
    ['THESE PREMISES ARE UNDER', 'SHOPLIFTERS WILL BE PROSECUTED']);

  // 12 — the little card clipped to a bag rack. Yellow, tiny, and the one
  // piece of front-end signage that is always crooked in a real store.
  at(12); plate('#e8c53a');
  g.fillStyle = '#221c06'; g.textAlign = 'center'; g.textBaseline = 'middle';
  fit(g, 'PAPER', W / 2, 74, W - 80, 84, '800', FACE.fat);
  fit(g, 'OR PLASTIC?', W / 2, 168, W - 60, 60, '800', FACE.fat);
  g.restore();
  return tex(THREE, c, { aniso: 8 });
}

// ---------------------------------------------------------------------------
// MAGAZINE COVERS. 4x4 of 192x256 — a 3:4 cover, which is what a checkout rack
// holds. Every cell is: a masthead, a photographic block with a FACE in it,
// three cover lines and a barcode. The face is the point; see the header.
export function magAtlas(THREE) {
  const W = 192, H = 256;
  const [c, g] = cv(W * 4, H * 4);
  const rng = makeRng(0x9a17c3);
  const MASTS = ['HEARTH', 'REAL LIFE', 'SKILLET', 'PARADE', 'THE WEEKLY',
    'HOMESTEAD', 'GARDEN & GATE', 'MOTOR', 'FIELD DAY', 'SOAP DIGEST',
    'CROSSWORD', 'QUICK FIX', 'STAR NEWS', 'COUNTRY', 'BAKE', 'TV GUIDE'];
  const LINES = ['30 MINUTE DINNERS', 'THE TRUTH AT LAST', 'LOSE 10 LBS',
    'BEST OF FALL', 'SECRET RECIPE', 'WHO WORE IT', 'INSIDE THE SPLIT',
    '101 EASY IDEAS', 'HER NEW LIFE', 'ONE POT SUPPERS', 'AMERICA VOTES',
    'BUDGET MAKEOVER', 'THE COMEBACK', 'GROW IT YOURSELF'];
  const SKIN = ['#e8c39a', '#d8a173', '#c58b5f', '#8d5c3b', '#6a4229', '#f0d3b4'];
  const HAIR = ['#2b1d13', '#4a3020', '#7a5330', '#c8a45a', '#1b1512', '#9a9a9a'];
  const MAST_COL = ['#c8202a', '#f2f2f2', '#ffd400', '#1a4fa0', '#0f7a3d', '#e0640f'];

  for (let i = 0; i < 16; i++) {
    g.save(); g.translate((i % 4) * W, Math.floor(i / 4) * H);
    // the photographic field behind everything
    const bg = ['#7ea5c4', '#c98d63', '#8fae72', '#c9c0ad', '#a4778f', '#6f8fa0'][i % 6];
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // vignette, so the cover is not a flat swatch
    const vg = g.createRadialGradient(W / 2, H * 0.44, 8, W / 2, H * 0.44, W * 0.92);
    vg.addColorStop(0, 'rgba(255,255,255,0.20)'); vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    if (i % 4 === 3) {
      // a food cover: a plated dish, seen from above, on a board
      g.fillStyle = '#e8e2d2';
      g.beginPath(); g.arc(W / 2, H * 0.55, W * 0.31, 0, 6.284); g.fill();
      g.fillStyle = ['#c4451f', '#d98a1c', '#5f8a33'][i % 3];
      g.beginPath(); g.arc(W / 2, H * 0.55, W * 0.22, 0, 6.284); g.fill();
      for (let k = 0; k < 26; k++) {
        const a = rng() * 6.284, r = rr(rng, 0, W * 0.20);
        g.fillStyle = ['#f2e6c2', '#7a3a12', '#3f6b22', '#e8c34a'][(k + i) % 4];
        g.beginPath();
        g.arc(W / 2 + Math.cos(a) * r, H * 0.55 + Math.sin(a) * r, rr(rng, 3, 8), 0, 6.284);
        g.fill();
      }
    } else {
      // a portrait: shoulders, neck, head, hair, and the two eyes and mouth
      // that make a human read as a human at forty pixels.
      const cxp = W * 0.5, hy = H * 0.42, hw = W * 0.235, hh = H * 0.155;
      const skin = SKIN[i % SKIN.length], hair = HAIR[(i * 3) % HAIR.length];
      g.fillStyle = hair;
      g.beginPath(); g.ellipse(cxp, hy - hh * 0.20, hw * 1.30, hh * 1.28, 0, 0, 6.284); g.fill();
      g.fillStyle = skin;
      g.beginPath(); g.moveTo(cxp - hw * 2.1, H);
      g.quadraticCurveTo(cxp, H * 0.60, cxp + hw * 2.1, H); g.fill();
      g.beginPath(); g.ellipse(cxp, hy, hw, hh, 0, 0, 6.284); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.beginPath(); g.ellipse(cxp - hw * 0.62, hy + hh * 0.1, hw * 0.30, hh * 0.55, 0, 0, 6.284); g.fill();
      g.fillStyle = hair;
      g.beginPath();
      g.ellipse(cxp, hy - hh * 0.62, hw * 1.06, hh * 0.62, 0, Math.PI, 6.284); g.fill();
      g.fillStyle = '#20181a';
      for (const s of [-1, 1]) {
        g.beginPath();
        g.ellipse(cxp + s * hw * 0.38, hy - hh * 0.06, hw * 0.115, hh * 0.085, 0, 0, 6.284);
        g.fill();
      }
      g.strokeStyle = 'rgba(40,24,24,0.55)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cxp - hw * 0.22, hy + hh * 0.52);
      g.quadraticCurveTo(cxp, hy + hh * 0.70, cxp + hw * 0.22, hy + hh * 0.52); g.stroke();
    }

    // masthead
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = MAST_COL[i % MAST_COL.length];
    const mast = MASTS[i];
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 6;
    fit(g, mast, W / 2, 26, W - 12, 44, '800', i % 3 ? FACE.fat : FACE.didone);
    g.restore();
    // cover lines, left and right, small and stacked the way they always are
    g.textAlign = 'left'; g.font = '800 13px ' + FACE.grot;
    for (let k = 0; k < 3; k++) {
      const t = LINES[(i * 3 + k) % LINES.length];
      g.fillStyle = 'rgba(0,0,0,0.42)';
      g.fillRect(6, 62 + k * 22 - 8, Math.min(W - 12, t.length * 7 + 8), 17);
      g.fillStyle = '#fff8e6';
      g.fillText(t, 10, 62 + k * 22);
    }
    // the price flash and a barcode block: every cover has both
    g.fillStyle = '#ffd400';
    g.beginPath(); g.arc(W - 26, H - 44, 20, 0, 6.284); g.fill();
    g.fillStyle = '#1a1408'; g.textAlign = 'center'; g.font = '800 15px ' + FACE.fat;
    g.fillText('$' + ri(rng, 2, 7) + '.99', W - 26, H - 44);
    g.fillStyle = '#fbfbf6'; g.fillRect(8, H - 36, 66, 28);
    g.fillStyle = '#15120c';
    for (let k = 0, x = 11; x < 70; k++) {
      const bw = 1 + (k % 3);
      g.fillRect(x, H - 33, bw, 20); x += bw + 1 + (k % 2);
    }
    g.restore();
  }
  return tex(THREE, c, { aniso: 8 });
}
