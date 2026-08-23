// OWNER: builder-cctv. The PHYSICAL wall: what monitors are screwed to it, what
// size they are, what generation of plastic they are wrapped in, and which
// channel ends up on which one.
//
// Everything here is in the fixed 1280x720 DESIGN SPACE, top-left origin, the
// same space cctv.js draws the wall in and the space builder-game places its HUD
// in. Nothing in this file depends on the canvas size.
//
// ===========================================================================
// ROUND 4 — WHY THE ACCRETED WALL WAS TORN DOWN AND REBUILT
// ===========================================================================
// Round 3's wall was nine mismatched monitors spread across the whole frame, and
// it photographed beautifully. It was also unplayable, and the playtest note is
// unarguable: "you can't really look at them and determine crime is going on."
//
// The arithmetic says why. A subject 12 m down an aisle, seen through a 98-degree
// dome, is 8.3 degrees tall. On a 190x143 panel that is FOURTEEN PIXELS. On the
// 416x234 primary it was thirty. Nothing a body does — a hand going to a coat, a
// shoulder check, a reach held a half-second too long — survives at fourteen
// pixels. So the player read the roster text instead, and the entire surveillance
// premise was carried by a list with the monitors as wallpaper behind it.
//
// Nine EQUAL feeds cannot fix that, because 1280x720 does not contain nine
// readable feeds. Neither does a real LP office: an operator SCANS the mosaic and
// then PULLS ONE UP. So the wall is now built the way a real desk is —
//
//   ONE SPOT MONITOR, big, showing whichever channel is selected, at a stream
//   resolution and a lens the operator can actually read a person on;
//   NINE THUMBNAILS, deliberately small, whose only job is to catch MOTION,
//   which is the one thing that survives being 138 pixels wide.
//
// The spot monitor is a SEPARATE physical panel, not a slot a channel migrates
// into. That matters for the contract: `tiles` still has exactly one FIXED rect
// per camera and they are still the thumbnails, so builder-game's click regions,
// its active-channel chrome and its subject badges all keep working untouched
// and keep pointing at the monitor you actually click. The spot panel is
// additive — `plan.spot` — and cctv.js draws its own chrome on it.
//
// The accretion survives, it just moved: the mismatched generations, the crooked
// unwired test monitor, the label-maker strips and the paper are now in the
// bank and on the equipment deck under the spot monitor, which is where that
// stuff lives in the photographs anyway.

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

// --- the spot monitor -------------------------------------------------------
// 766x431 of glass, 16:9. This is the whole reason the layout changed, so the
// number that matters is what it buys: a subject 12 m out is 55 px tall here
// against 14 px on a thumbnail, and the PTZ push-in in cctv.js takes that to
// ~95 px. That is a person whose ARMS you can see, which is the entire ask.
//
// It carries no camera of its own — `cam` is -2, meaning "whatever is selected".
const SPOT = {
  x: 18, y: 90, w: 766, h: 431, bx: 12, bt: 12, chin: 30,
  s: 'black', brand: 'CHROMA-VU 32W SPOT', white: [0.978, 0.992, 1.000], sheen: 0.022,
};

// --- the thumbnail bank -----------------------------------------------------
// 3x3 on the right, plus a tenth panel on the shelf below it. 138x104 of glass
// is NOT enough to read a person on and is not trying to be: it is enough to see
// that something moved, which is what cctv.js's per-thumbnail motion meter and
// alarm frame are for. Fill order is slot order, so the tenth — the installer's
// crooked test monitor — is the one that goes dark on a nine-camera store.
//
// The bank is NOT a clean grid. Column 2 was rebracketed in 2016 and sits 3 px
// high; the bottom row is a different generation of plastic on the same holes.
const SLOTS = [
  // row A — the doors. Top of the bank because that is where the job ends.
  { x: 814, y: 86, w: 138, h: 104, bx: 8, bt: 8, chin: 20,
    s: 'gunmetal', brand: 'VIGILANT DS-816', white: [1.000, 0.994, 0.968], sheen: 0.038 },
  { x: 970, y: 83, w: 138, h: 104, bx: 8, bt: 8, chin: 20,
    s: 'silver', brand: 'ACOM 19HD', white: [0.986, 0.996, 0.992], sheen: 0.030 },
  { x: 1126, y: 86, w: 138, h: 104, bx: 8, bt: 8, chin: 20,
    s: 'gunmetal', brand: 'VIGILANT DS-816', white: [1.006, 0.988, 0.958], sheen: 0.042 },

  // row B — the aisles.
  { x: 814, y: 222, w: 138, h: 104, bx: 8, bt: 8, chin: 20,
    s: 'gunmetal', brand: 'VIGILANT DS-816', white: [0.994, 1.000, 0.986], sheen: 0.034 },
  { x: 970, y: 219, w: 138, h: 104, bx: 8, bt: 8, chin: 20,
    s: 'silver', brand: 'ACOM 19HD', white: [0.978, 0.992, 1.000], sheen: 0.044 },
  { x: 1126, y: 222, w: 138, h: 104, bx: 8, bt: 8, chin: 20,
    s: 'gunmetal', brand: 'VIGILANT DS-816', white: [1.008, 0.984, 0.940], sheen: 0.030,
    ledDead: true },

  // row C — the rest of the floor. Newer plastic, thinner chins.
  { x: 814, y: 358, w: 138, h: 104, bx: 7, bt: 7, chin: 18,
    s: 'black', brand: 'CHROMA-VU 17', white: [0.972, 0.990, 1.000], sheen: 0.026 },
  { x: 970, y: 355, w: 138, h: 104, bx: 7, bt: 7, chin: 18,
    s: 'black', brand: 'CHROMA-VU 17', white: [0.990, 0.996, 0.998], sheen: 0.028 },
  { x: 1126, y: 358, w: 138, h: 104, bx: 7, bt: 7, chin: 18,
    s: 'putty', brand: 'SENTRELL 400', white: [1.014, 0.978, 0.922], sheen: 0.052 },

  // 9 — the installer's 5" test monitor, standing on the shelf under the bank,
  //     screwed to nothing and levelled by nobody. Analogue input, no source.
  //     A tenth camera lands here and the rotation is dropped.
  { x: 1148, y: 502, w: 98, h: 74, bx: 13, bt: 13, chin: 26,
    s: 'putty', brand: 'SENTRELL 5T', white: [1.020, 0.972, 0.902], sheen: 0.060,
    rot: -0.05, deadMode: 0, stand: 14, shelf: [1108, 616, 156] },
];

// The strip of bare wall left under the spot monitor. The recorder, the paper
// and the coax hank live here now — see paintFixtures. Exported through the plan
// so overlay.js never has to know a slot number to find the free wall.
const DECK = { x: 6, y: 553, w: 790, h: 51 };

// Which camera each slot WANTS, by label. First match by camera index wins, so
// EXIT DOORS takes the first door slot and DOOR 2 the second rather than the
// other way round. Empty string = "whatever is left".
//
// The ORDER is the composition: doors on top, aisles in the middle, the rest of
// the floor at the bottom. An operator's eye goes top-right first and the doors
// are where a theft becomes a loss, so that is what is parked there.
const PREF = [
  'DOOR|EXIT', 'DOOR|EXIT', 'FRONT',
  'AISLE', 'AISLE', 'AISLE',
  'AISLE', 'BACK|PRODUCE|DAIRY|FROZEN|DELI', 'BACK|PRODUCE|DAIRY|FROZEN|DELI',
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
    // installer wrote on it; the test monitor never had one; the spot monitor
    // is not a channel at all, it is the thing you switch channels ONTO.
    chinId: cam === -2 ? 'SPOT'
      : cam >= 0 ? 'CH' + p2(cam + 1)
        : (slot.deadMode === 0 ? 'TEST' : 'CH' + p2(i + 1)),
    x: slot.x, y: slot.y, w: slot.w, h: slot.h,
    hx: slot.x - slot.bx, hy: slot.y - slot.bt,
    hw: slot.w + slot.bx * 2, hh: slot.h + slot.bt + slot.chin,
    bx: slot.bx, bt: slot.bt, chin: slot.chin,
    style: STYLE[slot.s] || STYLE.gunmetal, styleName: slot.s,
    brand: slot.brand, white: slot.white, sheen: slot.sheen,
    stand: slot.stand || 0, shelf: slot.shelf || null,
    fresh: !!slot.fresh, ledDead: !!slot.ledDead,
    rot, spot: cam === -2,
    // Which no-signal picture a dark panel shows. The old test monitor has an
    // analogue input with nothing on it, so: snow. The modern panel knows there
    // is no source and paints the manufacturer's blue card.
    deadMode: slot.deadMode != null ? slot.deadMode : 1,
  };
}

// Safety net for a camera count this file was never authored for. Never pretty,
// never overlapping, never crashes — which is the whole point of having it. The
// spot monitor keeps its place; only the bank is regenerated, inside the bank's
// own rectangle, so a twenty-camera store still has something to read a subject
// on instead of twenty postage stamps.
const BANK = { x: 806, y: 78, w: 466, h: 526 };
function genericBank(cams) {
  const n = cams.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.25)));
  const rows = Math.ceil(n / cols);
  const cw = BANK.w / cols, ch = BANK.h / rows;
  const bx = 5, bt = 5, chin = Math.min(18, Math.max(9, ch * 0.14)) | 0;
  const panels = [], tiles = [];
  const NAMES = ['gunmetal', 'silver', 'black', 'putty'];
  for (let i = 0; i < n; i++) {
    const col = i % cols, row = (i / cols) | 0;
    const w = Math.max(24, Math.round(cw - 8 - bx * 2));
    const h = Math.max(18, Math.round(ch - 8 - bt - chin));
    const x = Math.round(BANK.x + col * cw + 4 + bx);
    const y = Math.round(BANK.y + row * ch + 4 + bt);
    const s = NAMES[(i * 3 + row) % 4];
    const p = panelFrom({
      x, y, w, h, bx, bt, chin, s,
      brand: 'VIGILANT DS-816',
      white: [1 + ((i % 3) - 1) * 0.012, 1 - (i % 2) * 0.006, 1 - ((i + 1) % 3) * 0.020],
      sheen: 0.026 + (i % 4) * 0.010,
    }, i, i);
    panels.push(p); tiles.push({ x: p.x, y: p.y, w: p.w, h: p.h });
  }
  return { panels, tiles };
}

/**
 * @param {{id:string,label:string}[]} cams  config.CAMERAS, any length
 * @returns {{
 *   panels: object[],            every physical monitor, live, dark and spot
 *   tiles:  {x,y,w,h}[],         glass rect per CAMERA index (the export).
 *                                ALWAYS the thumbnail, never the spot monitor,
 *                                and never changes with selection.
 *   live:   object[],            thumbnail panels with cam >= 0
 *   dead:   object[],            thumbnail panels with cam < 0
 *   spot:   object,              the big monitor (cam === -2)
 *   deck:   {x,y,w,h},           bare wall under the spot, for the equipment
 * }}
 */
export function layoutWall(cams) {
  const spot = panelFrom(SPOT, -2, -1);
  const n = cams.length;
  if (!n) return { panels: [spot], tiles: [], live: [], dead: [], spot, deck: DECK };

  let panels, tiles;
  if (n > SLOTS.length) {
    ({ panels, tiles } = genericBank(cams));
  } else {
    const live = Math.min(n, SLOTS.length);
    const slotCam = assign(cams, live);
    // One dark panel on a nine-channel wall is an install with history. Nine
    // dark panels on a two-channel wall is a mistake, so the surplus slots are
    // simply not mounted.
    const mounted = Math.min(SLOTS.length, live + 1);
    panels = SLOTS.slice(0, mounted).map((s, i) => panelFrom(s, slotCam[i], i));
    tiles = new Array(n).fill(null);
    for (const p of panels) {
      if (p.cam >= 0) tiles[p.cam] = { x: p.x, y: p.y, w: p.w, h: p.h };
    }
    // A camera with no slot would be a channel builder-game can select and never
    // see. Can only happen if SLOTS shrinks below the camera count; keep the
    // contract honest by parking it off-wall rather than handing back undefined.
    for (let i = 0; i < n; i++) if (!tiles[i]) tiles[i] = { x: 0, y: WALL.top, w: 2, h: 2 };
  }

  return {
    panels: [...panels, spot],
    tiles,
    live: panels.filter((p) => p.cam >= 0),
    dead: panels.filter((p) => p.cam < 0),
    spot, deck: DECK,
  };
}
