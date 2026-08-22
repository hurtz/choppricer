// CHOP PRICER — shared world contract.
// OWNED BY LEAD. Builders read from here; do not redefine these numbers locally.

export const UNIT = 1;                 // 1 world unit = 1 meter
export const AISLE_COUNT = 8;
export const AISLE_LEN = 26;           // meters, running along +Z
export const AISLE_GAP = 4.0;          // walkable width between shelf runs
export const SHELF_W = 1.3;            // depth of one shelf run
export const SHELF_H = 2.05;           // top of shelf (gondola) height
export const CEIL_H = 5.2;             // drop ceiling height

// Aisle i centerline X. Aisle numbers shown to the player are i+1.
export const aisleX = (i) => (i - (AISLE_COUNT - 1) / 2) * (AISLE_GAP + SHELF_W);

export const STORE = {
  minX: aisleX(0) - (AISLE_GAP + SHELF_W),
  maxX: aisleX(AISLE_COUNT - 1) + (AISLE_GAP + SHELF_W),
  minZ: -AISLE_LEN / 2 - 7,   // front of store (checkouts, entrance, service desk)
  maxZ: AISLE_LEN / 2 + 5,    // back of store (dairy/frozen wall)
};

export const FRONT_WALK_Z = STORE.minZ + 3.5; // cross-aisle in front of checkouts
export const BACK_WALK_Z  = STORE.maxZ - 2.5; // cross-aisle along the back wall
export const EXIT = { x: STORE.minX + 3.0, z: STORE.minZ + 0.4 };
export const SERVICE_DESK = { x: STORE.maxX - 4.0, z: STORE.minZ + 2.0 };

// --- Chase tuning. The second bar lives in these numbers. ---
export const TUNING = {
  copWalk: 2.35,
  copRun: 5.05,          // thief is slightly faster; you lose without a powerup
  thiefWalk: 1.25,
  thiefRun: 5.35,
  copAccel: 9.0,
  staminaMax: 3.1,       // seconds of sprint from full
  staminaDrain: 1.0,
  staminaRegen: 0.34,
  gassedPenalty: 0.62,   // speed multiplier while winded
  boostMul: 1.42,
  boostTime: 4.0,
  suspicionRadius: 4.5,  // thief bolts when cop closes inside this
  catchRadius: 1.15,
};

export const CAMERAS = [
  { id: 'CAM 01', label: 'AISLE 1-2',   pos: [aisleX(0) - 2, 4.4, -AISLE_LEN / 2 - 1], look: [aisleX(1), 1.0, 4] },
  { id: 'CAM 02', label: 'AISLE 3-4',   pos: [aisleX(2) - 2, 4.4, -AISLE_LEN / 2 - 1], look: [aisleX(3), 1.0, 4] },
  { id: 'CAM 03', label: 'AISLE 5-6',   pos: [aisleX(4) - 2, 4.4, -AISLE_LEN / 2 - 1], look: [aisleX(5), 1.0, 4] },
  { id: 'CAM 04', label: 'AISLE 7-8',   pos: [aisleX(6) - 2, 4.4, -AISLE_LEN / 2 - 1], look: [aisleX(7), 1.0, 4] },
  { id: 'CAM 05', label: 'FRONT END',   pos: [0, 4.6, STORE.minZ + 1],  look: [0, 1.0, STORE.minZ + 9] },
  { id: 'CAM 06', label: 'BACK WALL',   pos: [0, 4.6, STORE.maxZ - 1],  look: [0, 1.0, STORE.maxZ - 9] },
  { id: 'CAM 07', label: 'EXIT DOORS',  pos: [EXIT.x - 1, 4.2, EXIT.z + 6], look: [EXIT.x, 1.0, EXIT.z] },
  { id: 'CAM 08', label: 'PRODUCE',     pos: [STORE.maxX - 1, 4.6, STORE.maxZ - 6], look: [STORE.maxX - 9, 1.0, STORE.maxZ - 10] },
];
