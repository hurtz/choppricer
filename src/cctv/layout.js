// OWNER: builder-cctv. The PHYSICAL wall: what monitors are screwed to it, what
// size they are, what generation of plastic they are wrapped in, and which
// channel ends up on which one.
//
// Everything here is in the fixed 1280x720 DESIGN SPACE, top-left origin, the
// same space cctv.js draws the wall in and the space builder-game places its HUD
// in. Nothing in this file depends on the canvas size.
//
// ===========================================================================
// ROUND 6 — THE WALL IS A MAP OF THE STORE
// ===========================================================================
// config.js now declares CAM 01 = AISLE 1 ... CAM 08 = AISLE 8, CAM 09 = DOOR 1.
// The client asked for it in as many words: "maybe each channel is an aisle,
// like 1, 2, 3, 4, 5, whatever, would just correspond to the screen."
//
// A 3x3 bank cannot say that. Three rows of three means channel 7 is bottom-left
// and channel 3 is top-right, so the player still has to hold a lookup table in
// his head — and that table is one more thing competing for attention on a
// screen the client has already told us has too much on it.
//
// So the aisle channels are now ONE ROW, ordered by the camera's own world X.
// Aisle 1 is the leftmost panel, aisle 8 the rightmost, and the Nth panel from
// the left IS aisle N. The row is not a bank of monitors any more; it is a plan
// of the store, drawn at the top of the wall where an operator scans first. That
// is worth more than any overlay this round deleted, because it removes the
// lookup instead of decorating it.
//
// THE DOOR IS DELIBERATELY NOT IN THE ROW. It is not an aisle, there is only one
// of it, and putting it in the run would push aisle N to the (N+1)th panel and
// break the one property the row exists to have. It gets its own panel, four
// times the glass of an aisle tile, because it is where a theft becomes a loss.
//
// The accretion survives — it is what makes this read as a room somebody works
// in rather than a UI. It just moved to where it costs no attention: mismatched
// housing generations and chin depths along the run, one taped-over LED, the
// crooked dead test monitor on the equipment shelf, the paper, the coax and the
// clipboard. All of it STATIC. See the round-6 note in cctv.js for the split:
// set dressing you look at once is free, an indicator that repaints every frame
// is not.
//
// ROUND 4's promise is kept unchanged: `tiles` is one FIXED rect per camera and
// they are always the small panels, never the spot monitor, so builder-game's
// click regions, active-channel chrome and subject pips all still land on the
// monitor the player actually clicks.

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
    lip: 'rgba(160,172,192,0.13)', ink: 'rgba(168,180,198,0.62)',
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
    lip: 'rgba(196,206,220,0.18)', ink: 'rgba(210,218,232,0.58)',
    sub: 'rgba(186,196,212,0.28)', led: 'amber',
  },
  // The new widescreens. Thin gloss black, barely any chin.
  black: {
    top: '#1c1e24', body: '#101116', low: '#0b0c10', foot: '#08090c',
    lip: 'rgba(150,164,186,0.15)', ink: 'rgba(164,176,194,0.58)',
    sub: 'rgba(140,152,172,0.28)', led: 'green',
  },
};

// --- the spot monitor -------------------------------------------------------
// 676x380 of glass. Round 4 shipped 766x431 and this is 12% shorter, which is
// the price of the aisle row above it. It is paid back in cctv.js by taking
// SUBJ_FRAC from 0.32 to 0.36, so the tracked subject still lands at 137 px of
// panel — one pixel off round 4's 138, and the number that whole round turned on.
//
// It carries no camera of its own — `cam` is -2, meaning "whatever is selected".
const SPOT = {
  x: 16, y: 198, w: 676, h: 380, bx: 11, bt: 8, chin: 20,
  s: 'black', brand: 'CHROMA-VU 32W SPOT', white: [0.978, 0.992, 1.000], sheen: 0.022,
};

// --- the door monitor -------------------------------------------------------
// 320x180. Four times the glass of an aisle tile, because ONE channel decides
// whether the shift was a write-up or a loss, and because at 320px you can see a
// man reach the mat rather than merely see that a blob moved.
const DOOR = {
  x: 716, y: 198, w: 320, h: 180, bx: 10, bt: 10, chin: 22,
  s: 'silver', brand: 'ACOM 19HD', white: [0.986, 0.996, 0.992], sheen: 0.028,
};

// --- the aisle run ----------------------------------------------------------
// Sized from the camera count, not hand-authored, so the row survives config
// growing a ninth aisle. At eight the glass comes out 142x78.
const RUN = {
  x: 10, y: 76, w: 1260, gap: 6,
  // wMax stops a three-camera store from turning the run into three 400px
  // letterbox slits: the panel is capped and the row is centred instead. wMin is
  // the other end of the same guard — below it the run wraps to a second row.
  bx: 5, bt: 5, aspect: 16 / 9, hMax: 84, wMin: 84, wMax: 236,
};
// Per-position plastic. The 2011 install was eight identical VIGILANTs; three
// were replaced after the 2016 water leak and one of those is the beige unit
// that came out of the stockroom. Authored, not random, so screenshots stay
// comparable between rounds.
// The beige one sits in the MIDDLE of the run, not on the end: its silkscreen is
// dark ink on light plastic, and the room vignette is deepest in the corners.
const RUN_STYLE = ['gunmetal', 'gunmetal', 'silver', 'putty', 'gunmetal',
  'silver', 'gunmetal', 'gunmetal'];
const RUN_CHIN = { gunmetal: 20, silver: 18, black: 18, putty: 22 };
// Model numbers only on the run: a 152px housing has room for the channel id OR
// a brand name, not both, and the id is the one the player needs.
const RUN_BRAND = { gunmetal: 'DS-816', silver: '19HD', black: 'CV-17', putty: 'S-400' };
// Bracket sag, in pixels. Nobody levelled these; column 3 and column 6 sit low.
const RUN_DY = [0, 2, 3, 0, 1, 3, 1, 2];

// --- the dead test monitor --------------------------------------------------
// The installer's 5" analogue test set, stood on the equipment shelf in 2014 and
// never taken away. ROUND 6 SWITCHED IT OFF. It used to show full-rate analogue
// snow, which is an animating rectangle 100% of a shift that never once means
// anything — the single worst thing on this wall by that measure. The plastic,
// the crooked stand, the TEST silkscreen and the tape over its dead LED all
// stay; only the moving picture went. See DeadShader mode 0 in shaders.js.
const TEST = {
  x: 734, y: 430, w: 116, h: 87, bx: 13, bt: 13, chin: 24,
  s: 'putty', brand: 'SENTRELL 5T', white: [1.020, 0.972, 0.902], sheen: 0.060,
  rot: -0.05, deadMode: 0, stand: 12, ledDead: true,
};

// Two pieces of bare wall the composition leaves behind, handed to overlay.js so
// the gear can be placed against them instead of at coordinates somebody has to
// re-find by hand every time a panel moves.
//   DECK   the equipment shelf under the door monitor — recorder, test set.
//   POCKET the corner beside the door monitor — paper, coax, the clipboard.
const DECK = { x: 706, y: 408, w: 566, h: 192 };
const POCKET = { x: 1054, y: 190, w: 218, h: 210 };

const p2 = (v) => String(v).padStart(2, '0');
const isDoor = (c) => /DOOR|EXIT/.test(`${c.id || ''} ${c.label || ''}`.toUpperCase());
const camX = (c) => (c && c.pos ? c.pos[0] : 0);

function panelFrom(slot, cam, i, role) {
  const rot = cam >= 0 ? 0 : (slot.rot || 0);   // a live channel is never crooked
  return {
    slot: i, cam, role: role || 'aisle',
    // silkscreen on the chin. ROUND 6: this is now the ONLY channel number on a
    // panel. The thumbnail OSD used to burn a second one into the top-left
    // corner of the glass, which meant every tile carried the same digit twice —
    // once on the picture, where pixels are scarce, and once on the plastic,
    // where they are free. The plastic won.
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
    // Which no-signal picture a dark panel shows. 0 = switched off at the mains
    // (the old test set). 1 = a modern panel that knows there is no source and
    // paints the manufacturer's blue card.
    deadMode: slot.deadMode != null ? slot.deadMode : 1,
  };
}

// --- the run, generated -----------------------------------------------------
// One row while the panels stay above `wMin` wide; two rows past that, which is
// what a fourteen-camera store would need and what stops this file from being a
// crash waiting for a config change. `rows` is reported back so the spot monitor
// can give up the height the second row costs.
function runPlan(n) {
  let rows = 1, cols = n;
  let pitch = (RUN.w + RUN.gap) / cols;
  while (pitch - RUN.gap - RUN.bx * 2 < RUN.wMin && rows < 3) {
    rows++; cols = Math.ceil(n / rows);
    pitch = (RUN.w + RUN.gap) / cols;
  }
  const gw = Math.min(RUN.wMax, Math.round(pitch - RUN.gap) - RUN.bx * 2);
  const hw = gw + RUN.bx * 2;
  const gh = Math.round(Math.min(RUN.hMax, gw / RUN.aspect));
  const rowH = RUN.bt + gh + 22 + 8;             // deepest chin + a little air
  pitch = Math.min(pitch, hw + RUN.gap);
  // centre whatever the row actually came out as
  const x0 = RUN.x + (RUN.w + RUN.gap - Math.min(cols, n) * pitch) / 2;
  return { rows, cols, pitch, hw, gw, gh, rowH, x0 };
}

function runSlots(cams, plan) {
  return cams.map((c, i) => {
    const col = i % plan.cols, row = (i / plan.cols) | 0;
    const s = RUN_STYLE[i % RUN_STYLE.length];
    return {
      x: Math.round(plan.x0 + col * plan.pitch) + RUN.bx,
      y: RUN.y + RUN.bt + row * plan.rowH + RUN_DY[i % RUN_DY.length],
      w: plan.gw, h: plan.gh,
      bx: RUN.bx, bt: RUN.bt, chin: RUN_CHIN[s],
      s, brand: RUN_BRAND[s],
      white: [1 + ((i % 3) - 1) * 0.014, 1 - (i % 2) * 0.008, 1 - ((i + 1) % 3) * 0.022],
      sheen: 0.026 + (i % 4) * 0.009,
      ledDead: i === 5,          // somebody taped over this one years ago
    };
  });
}

/**
 * @param {{id:string,label:string,pos:number[]}[]} cams  config.CAMERAS, any length
 * @returns {{
 *   panels: object[],            every physical monitor, live, dark and spot
 *   tiles:  {x,y,w,h}[],         glass rect per CAMERA index (the export).
 *                                ALWAYS a small panel, never the spot monitor,
 *                                and never changes with selection.
 *   live:   object[],            panels with cam >= 0
 *   dead:   object[],            panels with cam < 0
 *   spot:   object,              the big monitor (cam === -2)
 *   deck:   {x,y,w,h},           the equipment shelf, for overlay.js
 *   pocket: {x,y,w,h},           the paper/coax corner, for overlay.js
 * }}
 */
export function layoutWall(cams) {
  const n = cams.length;
  const spotSlot = { ...SPOT };

  if (!n) {
    const spot = panelFrom(spotSlot, -2, -1, 'spot');
    return {
      panels: [spot], tiles: [], live: [], dead: [], spot,
      deck: DECK, pocket: POCKET,
    };
  }

  // WHO GOES WHERE. The first door camera takes the door panel; everything else
  // — aisles, and any second door — goes in the run, sorted by the camera's own
  // world X so the row reads left to right exactly as the store does.
  const idx = cams.map((c, i) => i);
  const doorI = idx.find((i) => isDoor(cams[i]));
  const runI = idx.filter((i) => i !== doorI)
    .sort((a, b) => (camX(cams[a]) - camX(cams[b])) || (a - b));

  const plan = runPlan(runI.length);
  const slots = runSlots(runI.map((i) => cams[i]), plan);
  const panels = slots.map((s, k) => panelFrom(s, runI[k], k, 'aisle'));

  // The run's real depth decides where the spot monitor starts, so a two-row
  // wall shortens the big picture instead of overlapping it.
  const runBottom = RUN.y + RUN.bt + plan.rows * plan.rowH;
  const drop = Math.max(0, runBottom - (RUN.y + RUN.bt + plan.rowH));
  spotSlot.y = SPOT.y + drop;
  spotSlot.h = Math.max(180, SPOT.h - drop);
  spotSlot.w = Math.round(spotSlot.h * (SPOT.w / SPOT.h));
  const spot = panelFrom(spotSlot, -2, -1, 'spot');

  const doorSlot = { ...DOOR, y: DOOR.y + drop };
  // No door camera in this config? The panel stays mounted and dark — a wall
  // does not lose a monitor because a camera was unplugged.
  const door = panelFrom(doorSlot, doorI == null ? -1 : doorI,
    slots.length, 'door');
  panels.push(door);
  panels.push(panelFrom({ ...TEST, y: TEST.y + drop }, -1, slots.length + 1, 'test'));

  const tiles = new Array(n).fill(null);
  for (const p of panels) {
    if (p.cam >= 0) tiles[p.cam] = { x: p.x, y: p.y, w: p.w, h: p.h };
  }
  // A camera with no panel would be a channel builder-game can select and never
  // see. Keep the contract honest by parking it off-wall rather than handing
  // back undefined.
  for (let i = 0; i < n; i++) if (!tiles[i]) tiles[i] = { x: 0, y: WALL.top, w: 2, h: 2 };

  return {
    panels: [...panels, spot],
    tiles,
    live: panels.filter((p) => p.cam >= 0),
    dead: panels.filter((p) => p.cam < 0),
    spot,
    deck: { ...DECK, y: DECK.y + drop, h: Math.max(60, DECK.h - drop) },
    pocket: { ...POCKET, y: POCKET.y + drop },
  };
}
