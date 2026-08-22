// OWNER: builder-cctv. The PHYSICAL wall: what monitors are screwed to it, what
// size they are, what generation of plastic they are wrapped in, and which
// channel ends up on which one.
//
// Everything here is in the fixed 1280x720 DESIGN SPACE, top-left origin, the
// same space cctv.js draws the wall in and the space builder-game places its HUD
// in. Nothing in this file depends on the canvas size.
//
// WHY THIS FILE EXISTS
// Round 2's wall was a hand-placed 4x2 of eight identical monitors. Adding a
// ninth camera to config.js hard-broke boot, and even when it did not, "eight
// copies of one monitor in a perfect grid" was the loudest remaining tell that
// this is a render and not a photograph of a loss-prevention office. Real DVR
// walls are ACCRETED: the original install, one pair replaced after a lightning
// strike, a big widescreen the DM bought for the front end, an ancient putty
// beige unit nobody will throw away, a little test monitor with nothing plugged
// into it, and cables nobody has ever dressed.
//
// So: a table of PHYSICAL SLOTS (real monitors, authored, mismatched), and an
// assignment pass that puts whatever CAMERAS config declares onto them by role.
// Slots that no camera claims are still monitors — they just show snow or a
// NO SIGNAL card, which is exactly what an unwired panel does.

export const WALL = {
  // Bands owned by builder-game's HUD. Nothing physical may enter them.
  top: 74,          // topBand + alarm bar live above this
  bottom: 604,      // the log ticker paints an opaque strip from here
  deskY: 624,       // front edge of the desk
  W: 1280, H: 720,
};

// --- housing plastic, by generation ----------------------------------------
// `ink` is the silkscreen on the chin; `lip` is the bevel highlight the screens
// throw onto the top edge of the case.
export const STYLE = {
  // 2011 original install: graphite ABS, chunky chin, green power LED.
  gunmetal: {
    top: '#2b2e37', body: '#1a1c23', low: '#141519', foot: '#0d0e12',
    lip: 'rgba(160,172,192,0.13)', ink: 'rgba(168,180,198,0.55)',
    sub: 'rgba(150,162,180,0.30)', led: 'green',
  },
  // The oldest thing on the wall. Putty-beige, sun-yellowed, fat bezel.
  putty: {
    top: '#6a6350', body: '#524b3c', low: '#403a2e', foot: '#2c2820',
    lip: 'rgba(222,210,178,0.18)', ink: 'rgba(58,52,38,0.72)',
    sub: 'rgba(58,52,38,0.42)', led: 'amber',
  },
  // ~2016 replacement pair: silver-grey, thinner, amber standby LED.
  silver: {
    top: '#50535b', body: '#3a3d44', low: '#2c2e34', foot: '#1d1f24',
    lip: 'rgba(196,206,220,0.18)', ink: 'rgba(206,214,228,0.50)',
    sub: 'rgba(186,196,212,0.28)', led: 'amber',
  },
  // The new widescreens. Thin gloss black, barely any chin.
  black: {
    top: '#1c1e24', body: '#101116', low: '#0b0c10', foot: '#08090c',
    lip: 'rgba(150,164,186,0.15)', ink: 'rgba(160,172,190,0.52)',
    sub: 'rgba(140,152,172,0.28)', led: 'green',
  },
};

// --- the slots --------------------------------------------------------------
// x,y,w,h is the GLASS (this becomes the exported tile). bx/bt/chin are the
// bezel widths that grow the housing around it. Authored so that no two rows
// line up and no two blocks share a bottom edge.
//
// FILL ORDER IS SLOT ORDER. Cameras claim slots 0..n-1, so the slots that go
// dark when the store has fewer cameras are the last ones: slot 8 (the second
// door monitor) and slot 9 (the test monitor). That is deliberate — with the
// 8-camera config the DOOR 2 panel is mounted, wired to nothing, and shows a
// NO SIGNAL card, which is exactly the state the real install is in.
const SLOTS = [
  // 0 — PRIMARY. The big one the DM signed off on. 16:9, thin gloss black,
  //     wall bracket, dead centre. Whatever runs here is what you actually see.
  { x: 486, y: 88, w: 416, h: 234, bx: 10, bt: 10, chin: 28,
    s: 'black', brand: 'CHROMA-VU 24W', white: [0.972, 0.990, 1.000], sheen: 0.026 },

  // 1,2 — top left. Two of the four original 4:3 panels from the 2011 install.
  { x: 26, y: 90, w: 190, h: 143, bx: 12, bt: 12, chin: 34,
    s: 'gunmetal', brand: 'VIGILANT DS-816', white: [1.000, 0.994, 0.968], sheen: 0.038 },
  { x: 250, y: 90, w: 190, h: 143, bx: 12, bt: 12, chin: 34,
    s: 'gunmetal', brand: 'VIGILANT DS-816', white: [0.986, 0.996, 0.992], sheen: 0.030 },

  // 3,4 — bottom left. The other two died; these are 16:10 replacements on the
  //       same brackets, which is why they do not line up with the row above.
  //       Slot 4 was knocked in 2019 and sits 4px low and 2px right of true.
  { x: 24, y: 287, w: 198, h: 124, bx: 10, bt: 10, chin: 30,
    s: 'silver', brand: 'ACOM 19HD', white: [0.978, 0.992, 1.000], sheen: 0.044 },
  { x: 253, y: 291, w: 198, h: 124, bx: 10, bt: 10, chin: 30,
    s: 'silver', brand: 'ACOM 19HD', white: [1.008, 0.984, 0.940], sheen: 0.034,
    ledDead: true },

  // 5 — under the primary, left. The putty-beige antique. Fat bezel, deep chin.
  { x: 492, y: 382, w: 186, h: 140, bx: 16, bt: 16, chin: 42,
    s: 'putty', brand: 'SENTRELL 400', white: [1.014, 0.978, 0.922], sheen: 0.052 },

  // 6 — under the primary, right. NOT on a bracket: it sits on the equipment
  //     shelf on a desk stand, which is why its bottom edge is nowhere near
  //     anything else's.
  { x: 713, y: 411, w: 188, h: 106, bx: 9, bt: 9, chin: 24,
    s: 'black', brand: 'CHROMA-VU 17', white: [0.994, 1.000, 0.986], sheen: 0.030,
    stand: 25, shelf: [696, 566, 218] },

  // 7 — right column, top. Big 4:3, graphite, the one everybody stares at.
  { x: 966, y: 92, w: 250, h: 188, bx: 14, bt: 14, chin: 36,
    s: 'gunmetal', brand: 'VIGILANT DS-816', white: [1.000, 0.988, 0.956], sheen: 0.040 },

  // 8 — right column, bottom. Newest panel on the wall. Mounted 14px right of
  //     the one above it because the new bracket would not reach the old holes.
  { x: 974, y: 338, w: 262, h: 147, bx: 8, bt: 8, chin: 24,
    s: 'silver', brand: 'ACOM 24W', white: [0.964, 0.986, 1.000], sheen: 0.022,
    fresh: true },

  // 9 — the installer's 5" test monitor, screwed to the wall crooked in 2014 and
  //     never levelled. Nothing is plugged into it. If the store ever gets a
  //     tenth camera it lands here and the rotation is dropped.
  { x: 41, y: 466, w: 136, h: 102, bx: 15, bt: 15, chin: 34,
    s: 'putty', brand: 'SENTRELL 5T', white: [1.020, 0.972, 0.902], sheen: 0.060,
    rot: -0.056, deadMode: 0 },
];

// Which camera each slot WANTS, by label. First match by camera index wins, so
// EXIT DOORS takes slot 7 and DOOR 2 takes slot 8 rather than the other way
// round. Empty string = "whatever is left".
const PREF = [
  'FRONT',
  'AISLE', 'AISLE', 'AISLE', 'AISLE',
  'BACK|PRODUCE|DAIRY|FROZEN|DELI', 'BACK|PRODUCE|DAIRY|FROZEN|DELI',
  'DOOR|EXIT', 'DOOR|EXIT',
  '',
];

function assign(cams, live) {
  const slotCam = new Array(SLOTS.length).fill(-1);
  const used = new Set();
  for (let s = 0; s < live; s++) {
    if (!PREF[s]) continue;
    const re = new RegExp(PREF[s]);
    for (let c = 0; c < cams.length; c++) {
      if (used.has(c)) continue;
      const t = `${cams[c].id || ''} ${cams[c].label || ''}`.toUpperCase();
      if (re.test(t)) { slotCam[s] = c; used.add(c); break; }
    }
  }
  let c = 0;
  for (let s = 0; s < live; s++) {
    if (slotCam[s] >= 0) continue;
    while (used.has(c)) c++;
    if (c >= cams.length) break;
    slotCam[s] = c; used.add(c);
  }
  return slotCam;
}

const p2 = (v) => String(v).padStart(2, '0');

function panelFrom(slot, cam, i) {
  const rot = cam >= 0 ? 0 : (slot.rot || 0);   // a live channel is never crooked
  return {
    slot: i, cam,
    // silkscreen on the chin. A dark panel still carries the number the
    // installer wrote on it; the test monitor never had one.
    chinId: cam >= 0 ? 'CH' + p2(cam + 1)
      : (slot.deadMode === 0 ? 'TEST' : 'CH' + p2(i + 1)),
    x: slot.x, y: slot.y, w: slot.w, h: slot.h,
    hx: slot.x - slot.bx, hy: slot.y - slot.bt,
    hw: slot.w + slot.bx * 2, hh: slot.h + slot.bt + slot.chin,
    bx: slot.bx, bt: slot.bt, chin: slot.chin,
    style: STYLE[slot.s] || STYLE.gunmetal, styleName: slot.s,
    brand: slot.brand, white: slot.white, sheen: slot.sheen,
    stand: slot.stand || 0, shelf: slot.shelf || null,
    fresh: !!slot.fresh, ledDead: !!slot.ledDead,
    rot,
    // Which no-signal picture a dark panel shows. The old test monitor has an
    // analogue input with nothing on it, so: snow. The modern panel knows there
    // is no source and paints the manufacturer's blue card.
    deadMode: slot.deadMode != null ? slot.deadMode : 1,
  };
}

// Safety net for a camera count this file was never authored for. Never pretty,
// never overlapping, never crashes — which is the whole point of having it.
function genericGrid(cams) {
  const n = cams.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.7)));
  const rows = Math.ceil(n / cols);
  const x0 = 14, x1 = 1266, y0 = WALL.top + 6, y1 = WALL.bottom - 4;
  const cw = (x1 - x0) / cols, chh = (y1 - y0) / rows;
  const bx = 8, bt = 8, chin = Math.min(26, Math.max(14, chh * 0.13)) | 0;
  const panels = [], tiles = [];
  const NAMES = ['gunmetal', 'silver', 'black', 'putty'];
  for (let i = 0; i < n; i++) {
    const col = i % cols, row = (i / cols) | 0;
    const w = Math.round(cw - 10 - bx * 2), h = Math.round(chh - 10 - bt - chin);
    const x = Math.round(x0 + col * cw + 5 + bx);
    const y = Math.round(y0 + row * chh + 5 + bt);
    const s = NAMES[(i * 3 + row) % 4];
    const p = panelFrom({
      x, y, w, h, bx, bt, chin, s,
      brand: 'VIGILANT DS-816',
      white: [1 + ((i % 3) - 1) * 0.012, 1 - (i % 2) * 0.006, 1 - ((i + 1) % 3) * 0.020],
      sheen: 0.026 + (i % 4) * 0.010,
    }, i, i);
    panels.push(p); tiles.push({ x: p.x, y: p.y, w: p.w, h: p.h });
  }
  return { panels, tiles, live: panels.slice(), dead: [], generic: true };
}

/**
 * @param {{id:string,label:string}[]} cams  config.CAMERAS, any length
 * @returns {{
 *   panels: object[],            every physical monitor, live and dark
 *   tiles:  {x,y,w,h}[],         glass rect per CAMERA index (the export)
 *   live:   object[],            panels with cam >= 0
 *   dead:   object[],            panels with cam < 0
 * }}
 */
export function layoutWall(cams) {
  const n = cams.length;
  if (!n) return { panels: [], tiles: [], live: [], dead: [] };
  if (n > SLOTS.length) return genericGrid(cams);

  const live = Math.min(n, SLOTS.length);
  const slotCam = assign(cams, live);
  const panels = SLOTS.map((s, i) => panelFrom(s, slotCam[i], i));
  const tiles = new Array(n).fill(null);
  for (const p of panels) {
    if (p.cam >= 0) tiles[p.cam] = { x: p.x, y: p.y, w: p.w, h: p.h };
  }
  // A camera with no slot would be a channel builder-game can select and never
  // see. Can only happen if SLOTS shrinks below the camera count; keep the
  // contract honest by parking it off-wall rather than handing back undefined.
  for (let i = 0; i < n; i++) if (!tiles[i]) tiles[i] = { x: 0, y: WALL.top, w: 2, h: 2 };

  return {
    panels, tiles,
    live: panels.filter((p) => p.cam >= 0),
    dead: panels.filter((p) => p.cam < 0),
  };
}
