// OWNER: builder-store. The physical supermarket.
// CONTRACT — must keep exporting exactly this:
//   buildStore(THREE, scene) -> { colliders: Box3[], powerupSpots: {x,z,kind}[] }
// Read all layout numbers from ./config.js. Never hardcode aisle positions.
import {
  AISLE_COUNT, AISLE_LEN, AISLE_GAP, SHELF_W, SHELF_H, CEIL_H, STORE,
  FRONT_WALK_Z, BACK_WALK_Z, EXIT, SERVICE_DESK, CAMERAS, aisleX,
} from './config.js';
import { makeRng, rr, ri, pick, Batch, Quads } from './store/kit.js';
import { DEPTS, FROZEN, fillShelf, fillBackRow } from './store/products.js';
import * as TX from './store/tex.js';
import * as PK from './store/pack.js';

// ---------------------------------------------------------------------------
// PALETTE — warm cream / sage / terracotta, wood-tone uprights. Never grey.
const P = {
  deck:     0xf0e8d4,   // shelf boards, cream steel
  deckDark: 0xd9cfb6,
  shelfUnder: 0x6f6656, // undersides read far darker than tops — see buildRun
  peg:      0xb3a992,   // gondola back panel, shadowed behind the product
  upright:  0xcfc3a6,
  kick:     0x5c5445,
  wood:     0xc9a878,   // end panels
  woodDark: 0x8a6b45,
  metal:    0xb9b3a4,
  counter:  0xe7dfcd,
  belt:     0x2b2b2e,
  cooler:   0xdcd6c4,
  coolerIn: 0x9fb3ba,
  sage:     0x7d8b58,
  terra:    0xc26333,
  cart:     0xa9adb2,
};

// Atlas cell i is drawn with department i%8's vocabulary — see products.js.
const DEPT_KEYS = DEPTS.map((d) => d.key);

let TEX = null;
function textures(THREE) {
  if (TEX) return TEX;
  TEX = {
    floor: TX.floorTex(THREE),
    ceil: TX.ceilTex(THREE),
    strip: TX.stripTex(THREE),
    rail: TX.railTex(THREE),
    wood: TX.woodTex(THREE, [30, 40, 60], 77),
    wall: TX.wallTex(THREE),
    // round-2 packaging: real printed type, one atlas per package family
    boxA: PK.cartonAtlas(THREE, DEPT_KEYS),
    bagA: PK.pouchAtlas(THREE, DEPT_KEYS),
    can: PK.canAtlas(THREE, DEPT_KEYS),
    bottle: PK.bottleAtlas(THREE, DEPT_KEYS),
    tag: PK.tagAtlas(THREE),
    cavity: PK.cavityTex(THREE),
    // round-3: ambient occlusion, gondola hardware, floor wear, ceiling clutter
    ao: TX.shelfAOTex(THREE),
    slot: TX.slotTex(THREE),
    smear: TX.smearTex(THREE),
    peg: TX.pegTex(THREE),
    wear: TX.floorWearTex(THREE),
    dangle: TX.danglerAtlas(THREE),
    sign: TX.signAtlas(THREE, DEPTS),
    blade: TX.bladeAtlas(THREE, DEPTS),
    lane: TX.laneAtlas(THREE),
    promo: TX.promoAtlas(THREE),
    glow: TX.glowTex(THREE),
    coolerBack: TX.coolerBackTex(THREE),
    wallSign: TX.wallSignAtlas(THREE, [
      { t: 'PRODUCE', bg: '#6f8a3f', fg: '#fdf7e6' },
      { t: 'MEAT & SEAFOOD', bg: '#a3402c', fg: '#fdf7e6' },
      { t: 'DAIRY', bg: '#2f6d8c', fg: '#fdf7e6' },
      { t: 'FROZEN FOODS', bg: '#3d5a86', fg: '#fdf7e6' },
    ]),
  };
  return TEX;
}

// atlas UV helpers (canvas rows run top->bottom, texture v runs bottom->top)
const cellUV = (i, cols, rows) => {
  const cx = i % cols, cy = Math.floor(i / cols) % rows;
  return [cx / cols, 1 - (cy + 1) / rows, (cx + 1) / cols, 1 - cy / rows];
};

// quad helpers — winding chosen so the texture reads unmirrored from the front
const qZ = (Q, x, y, z, w, h, dir, uv) =>
  Q.rect([x, y, z], [dir > 0 ? w / 2 : -w / 2, 0, 0], [0, h / 2, 0], uv[0], uv[1], uv[2], uv[3]);
const qX = (Q, x, y, z, d, h, dir, uv) =>
  Q.rect([x, y, z], [0, 0, dir > 0 ? -d / 2 : d / 2], [0, h / 2, 0], uv[0], uv[1], uv[2], uv[3]);
const qDown = (Q, x, y, z, w, l, uv) =>
  Q.rect([x, y, z], [w / 2, 0, 0], [0, 0, l / 2], uv[0], uv[1], uv[2], uv[3]);
const qUp = (Q, x, y, z, w, l, uv) =>
  Q.rect([x, y, z], [w / 2, 0, 0], [0, 0, -l / 2], uv[0], uv[1], uv[2], uv[3]);
const FULL = [0, 0, 1, 1];

// The package shader, the atlas-cell UV remap and the mask channel contract
// all live in ./store/pack.js now.

function pillowGeo(THREE) {
  // A bag is not a box. The sealed crimps at top and bottom pinch to almost
  // nothing while the middle bulges past the nominal footprint — without that
  // silhouette a chip bag just reads as a carton with a crinkle texture on it.
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const crimp = Math.abs(y) > 0.25;
    p.setZ(i, z * (crimp ? 0.20 : 1.34));
    p.setX(i, x * (crimp ? 0.86 : 1.0));
    if (crimp) p.setY(i, y * 0.96);
  }
  g.computeVertexNormals();
  return g;
}

// Four lathe profiles. A cleaning or HBA shelf in a real store is a row of
// obviously DIFFERENT silhouettes — trigger sprays next to gallon jugs next to
// squat jars — and one repeated soda-bottle shape is spotted immediately.
// Kept coarse: these are instanced ~5000 times and the scene renders 9x a frame.
const BOTTLE_PROFILES = {
  soda: [
    [0.03, -0.50], [0.44, -0.50], [0.47, -0.44], [0.47, 0.06],
    [0.44, 0.19], [0.24, 0.32], [0.18, 0.42], [0.23, 0.462], [0.03, 0.50],
  ],
  jug: [                       // detergent / juice: wide, square-shouldered
    [0.03, -0.50], [0.49, -0.50], [0.50, -0.42], [0.50, 0.18],
    [0.46, 0.28], [0.22, 0.36], [0.20, 0.44], [0.26, 0.47], [0.03, 0.50],
  ],
  squat: [                     // jar: short, wide, big lid
    [0.03, -0.50], [0.47, -0.50], [0.50, -0.40], [0.50, 0.12],
    [0.44, 0.24], [0.38, 0.30], [0.40, 0.46], [0.36, 0.50], [0.03, 0.50],
  ],
  spray: [                     // trigger cleaner: slim body, long neck, head
    [0.03, -0.50], [0.40, -0.50], [0.42, -0.42], [0.42, 0.10],
    [0.30, 0.20], [0.13, 0.26], [0.13, 0.36], [0.30, 0.40],
    [0.30, 0.50], [0.03, 0.50],
  ],
};
function bottleGeo(THREE, key) {
  const pts = BOTTLE_PROFILES[key].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 9);
}

// ---------------------------------------------------------------------------
export function buildStore(THREE, scene) {
  const colliders = [];
  const powerupSpots = [];
  const rng = makeRng(0x5f0c1a);
  const col = new THREE.Color();
  const T = textures(THREE);

  const PITCH = AISLE_GAP + SHELF_W;
  const SW = STORE.maxX - STORE.minX, SD = STORE.maxZ - STORE.minZ;
  const CX = (STORE.minX + STORE.maxX) / 2, CZ = (STORE.minZ + STORE.maxZ) / 2;
  const HALF = AISLE_LEN / 2;
  const WALL_H = 7.4;

  const root = new THREE.Group(); root.name = 'store';
  // Two cutaway groups. The chase camera rides at 6.4 m — above the drop ceiling
  // — and slides 7.6 m behind the cop, which can put it outside the front wall.
  // Both walls are single-sided so they vanish on their own; anything BOLTED to
  // them has to be hidden explicitly or it floats in front of the whole store.
  const ceilGroup = new THREE.Group(); ceilGroup.name = 'store.ceiling';
  const frontGroup = new THREE.Group(); frontGroup.name = 'store.frontwall';
  root.add(ceilGroup); root.add(frontGroup);
  scene.add(root);

  const solid = (x0, y0, z0, x1, y1, z1) => {
    colliders.push(new THREE.Box3(
      new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1))));
  };

  // ---- shared geometry ----------------------------------------------------
  const G = {
    box: new THREE.BoxGeometry(1, 1, 1),
    can: new THREE.CylinderGeometry(0.5, 0.5, 1, 9, 1, false),
    bottle: bottleGeo(THREE, 'soda'),
    bJug: bottleGeo(THREE, 'jug'),
    bSquat: bottleGeo(THREE, 'squat'),
    bSpray: bottleGeo(THREE, 'spray'),
    bag: pillowGeo(THREE),
    tube: new THREE.CylinderGeometry(0.5, 0.5, 1, 7, 1, true),
    drum: new THREE.CylinderGeometry(0.5, 0.5, 1, 18, 1, true),
    orb: new THREE.SphereGeometry(0.5, 7, 5),
    dome: new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  };

  // ---- shared materials ---------------------------------------------------
  // MATERIAL VARIETY. Round 2 shaded every package family with one matte
  // Lambert, so a can, a PET bottle, a foil bag and a coated carton all read as
  // the same painted cardboard. Coated board stays Lambert — it genuinely is
  // near-matte — and everything with a gloss gets Phong, with the per-texel
  // specular strength driven off the mask's print-brightness channel so white
  // film and bare tinplate flare while printed ink stays dull.
  const M = {
    pkgBox: PK.chopPackageMat(THREE, T.boxA, PK.ATLAS.carton, {
      spec: { shininess: 14, specular: 0x2b2924 },
      gloss: '0.16 + 0.42 * chopM.g * chopM.g',
    }),
    pkgCan: PK.chopPackageMat(THREE, T.can, PK.ATLAS.can, {
      spec: { shininess: 58, specular: 0x8c8880 },
      gloss: '0.45 + 0.95 * pow( chopM.g, 2.2 )',
    }),
    pkgBottle: PK.chopPackageMat(THREE, T.bottle, PK.ATLAS.bottle, {
      spec: { shininess: 96, specular: 0xa39f95 },
      gloss: '0.50 + 1.25 * pow( chopM.g, 2.6 )',
    }),
    pkgBag: PK.chopPackageMat(THREE, T.bagA, PK.ATLAS.pouch, {
      spec: { shininess: 34, specular: 0x8e8a80 },
      gloss: '0.28 + 1.35 * pow( chopM.g, 3.2 )',
    }),
    fix: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    wood: new THREE.MeshLambertMaterial({ map: T.wood, color: 0xffffff }),
    steel: new THREE.MeshPhongMaterial({
      color: 0xffffff, shininess: 42, specular: 0x6a665c,
    }),
  };

  // ONE geometry per package family, UVs normalised into unit-cell space. The
  // per-instance aCell attribute offsets into the atlas, so 24 carton designs
  // cost the same single draw call that 1 design used to.
  const PG = {
    box: PK.unitCellUV(THREE, G.box, 'box', PK.ATLAS.carton.wrap),
    bag: PK.unitCellUV(THREE, G.bag, 'box', PK.ATLAS.pouch.wrap),
    can: PK.unitCellUV(THREE, G.can, 'can', 0),
    soda: PK.unitCellUV(THREE, G.bottle, 'lathe', 0),
    jug: PK.unitCellUV(THREE, G.bJug, 'lathe', 0),
    squat: PK.unitCellUV(THREE, G.bSquat, 'lathe', 0),
    spray: PK.unitCellUV(THREE, G.bSpray, 'lathe', 0),
  };
  const BSHAPES = ['soda', 'jug', 'squat', 'spray'];

  const newPkg = () => {
    const box = new Batch(THREE, PG.box, M.pkgBox, PK.ATLAS.carton);
    const bag = new Batch(THREE, PG.bag, M.pkgBag, PK.ATLAS.pouch);
    const can = new Batch(THREE, PG.can, M.pkgCan, PK.ATLAS.can);
    const bs = {};
    for (const k of BSHAPES) bs[k] = new Batch(THREE, PG[k], M.pkgBottle, PK.ATLAS.bottle);
    // products.js pushes bottles with a `shape` key; route to that lathe.
    const bottle = {
      push(px, py, pz, ex, ey, ez, sx, sy, sz, c, cell, shape) {
        (bs[shape] || bs.soda).push(px, py, pz, ex, ey, ez, sx, sy, sz, c, cell);
      },
    };
    return { box, bag, can, bottle, _all: [box, bag, can, ...BSHAPES.map((k) => bs[k])] };
  };
  const flushPkg = (B, name, parent = root) => {
    B._all.forEach((b, i) => { const m = b.build(name + '.' + i); if (m) parent.add(m); });
  };

  // global fixture batches (uprights, boards, counters, carts…)
  const Bfix = new Batch(THREE, G.box, M.fix);
  const Bwood = new Batch(THREE, G.box, M.wood);
  const Btube = new Batch(THREE, G.tube, M.fix);
  const Bdrum = new Batch(THREE, G.drum, M.steel);
  const Borb = new Batch(THREE, G.orb, M.fix);
  // everything at ceiling height lives in its own batch so the whole lot can be
  // culled for the chase camera, which flies ABOVE the drop ceiling.
  const BfixC = new Batch(THREE, G.box, M.fix);
  const BtubeC = new Batch(THREE, G.tube, M.fix);
  const BfixF = new Batch(THREE, G.box, M.fix);
  const fix = (x, y, z, sx, sy, sz, hex, B = Bfix) => { col.setHex(hex); B.box(x, y, z, sx, sy, sz, col); };
  const tube = (x, y, z, ex, ey, ez, r, len, hex, B = Btube) => { col.setHex(hex); B.push(x, y, z, ex, ey, ez, r, len, r, col); };
  const drum = (x, y, z, r, len, hex) => { col.setHex(hex); Bdrum.push(x, y, z, 0, 0, 0, r, len, r, col); };

  // quad soups
  const Qrail = new Quads(), Qsign = new Quads(), Qblade = new Quads();
  const Qlane = new Quads(), Qpromo = new Quads(), Qwsign = new Quads();
  const Qstrip = new Quads(), Qglow = new Quads(), Qglass = new Quads();
  const Qcool = new Quads(), Qbright = new Quads(), Qshadow = new Quads();
  // Qtag: one shelf-edge tag per SKU run, width keyed to that SKU's facing.
  // Qcav: the gradient that darkens the back of every shelf cavity.
  const Qtag = new Quads(), Qcav = new Quads();
  // ROUND-3 additions.
  //   Qao     one multiply-blended AO card across the MOUTH of every shelf
  //           cavity — near-black under the deck above, hard seam at the deck
  //   Qslot   punched-slot gondola uprights at every 4ft section joint
  //   Qsmear  the polished-floor reflection streak under each gondola face,
  //           tinted per streak with the colour of the product above it
  //   Qdangle cardboard promo danglers hanging on strings from the ceiling
  const Qao = new Quads(), Qslot = new Quads(), Qpeg = new Quads();
  const Qsmear = new Quads(true), Qdangle = new Quads();

  // =========================================================================
  // FLOOR
  // =========================================================================
  T.floor.repeat.set(SW / 2.44, SD / 2.44);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(SW, SD),
    PK.sharpen(THREE, new THREE.MeshStandardMaterial({
      map: T.floor, color: 0xe9dcc4, roughness: 0.24, metalness: 0.05 }), -0.9));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  root.add(floor);

  // WEAR LAYER. One non-repeating multiply pass over the whole sales floor:
  // years of black scuffing concentrated in the traffic lanes, cart-wheel arcs
  // and buffer swirl. The tile map repeats every 2.44 m; this breaks that
  // period and is the difference between "a tiled plane" and "a floor".
  {
    const wear = new THREE.Mesh(
      new THREE.PlaneGeometry(SW, SD),
      new THREE.MeshBasicMaterial({
        map: T.wear, transparent: true, depthWrite: false,
        blending: THREE.MultiplyBlending,
      }));
    wear.rotation.x = -Math.PI / 2;
    wear.position.set(CX, 0.004, CZ);
    wear.renderOrder = 0;
    root.add(wear);
  }

  // long specular smear of the light rows down each aisle
  for (let i = 0; i < AISLE_COUNT; i++) {
    for (const s of [-1, 1]) {
      qUp(Qglow, aisleX(i) + s * 0.95, 0.012, 0, 1.5, AISLE_LEN * 1.04, FULL);
      qUp(Qglow, aisleX(i) + s * 0.95, 0.018, 0, 0.42, AISLE_LEN * 0.96, FULL);
    }
  }
  qUp(Qglow, CX, 0.012, FRONT_WALK_Z + 0.6, SW * 0.9, 7.0, FULL);
  qUp(Qglow, CX, 0.012, BACK_WALK_Z, SW * 0.9, 6.0, FULL);

  // =========================================================================
  // WALLS
  // =========================================================================
  const wallMat = (rx, ry) => {
    const t = T.wall.clone();
    t.needsUpdate = true; t.repeat.set(rx, ry);
    return new THREE.MeshLambertMaterial({ map: t, color: 0xf3ead4 });
  };
  const mkWall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat(w / 3.2, h / 3.2));
    m.position.set(x, y, z); m.rotation.y = ry;
    root.add(m);
  };
  mkWall(SW, WALL_H, CX, WALL_H / 2, STORE.maxZ, Math.PI);      // back  (faces -Z)
  mkWall(SW, WALL_H, CX, WALL_H / 2, STORE.minZ, 0);            // front (faces +Z)
  mkWall(SD, WALL_H, STORE.minX, WALL_H / 2, CZ, Math.PI / 2);  // left  (faces +X)
  mkWall(SD, WALL_H, STORE.maxX, WALL_H / 2, CZ, -Math.PI / 2); // right (faces -X)
  solid(STORE.minX - 0.6, 0, STORE.minZ - 0.6, STORE.minX, WALL_H, STORE.maxZ + 0.6);
  solid(STORE.maxX, 0, STORE.minZ - 0.6, STORE.maxX + 0.6, WALL_H, STORE.maxZ + 0.6);
  solid(STORE.minX - 0.6, 0, STORE.minZ - 0.6, STORE.maxX + 0.6, WALL_H, STORE.minZ);
  solid(STORE.minX - 0.6, 0, STORE.maxZ, STORE.maxX + 0.6, WALL_H, STORE.maxZ + 0.6);

  // sage band + terracotta pinstripe around the upper wall
  const bandY = 4.35;
  fix(CX, bandY, STORE.maxZ - 0.06, SW, 1.5, 0.05, P.sage);
  fix(CX, bandY - 0.83, STORE.maxZ - 0.07, SW, 0.14, 0.05, P.terra);
  fix(STORE.minX + 0.06, bandY, CZ, 0.05, 1.5, SD, P.sage);
  fix(STORE.maxX - 0.06, bandY, CZ, 0.05, 1.5, SD, P.sage);
  fix(CX, bandY, STORE.minZ + 0.06, SW, 1.5, 0.05, P.sage, BfixF);
  fix(CX, bandY - 0.83, STORE.minZ + 0.07, SW, 0.14, 0.05, P.terra, BfixF);

  // department signs high on the back wall
  const deptSigns = [
    ['PRODUCE', STORE.maxX - 8.5], ['MEAT & SEAFOOD', STORE.maxX - 20],
    ['DAIRY', STORE.minX + 19], ['FROZEN FOODS', STORE.minX + 7],
  ];
  deptSigns.forEach(([, x], i) => {
    qZ(Qwsign, x, bandY + 0.06, STORE.maxZ - 0.10, 7.0, 1.20, -1, cellUV(i, 1, 4));
  });

  // =========================================================================
  // CEILING  (culled for any camera above it — the chase cam flies at 6.4m)
  // =========================================================================
  // The old ceiling ran a strong emissive under a low-contrast tile map, which
  // flattened the T-bar grid into nothing: 30% of every frame was a featureless
  // cream field and the ceiling scored the lowest edge density of any band in
  // the image. The map now carries the contrast; the emissive only lifts the
  // black point so the tiles do not go muddy between fixtures.
  const ceilPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(SW, SD),
    new THREE.MeshLambertMaterial({
      map: (() => { const t = T.ceil.clone(); t.needsUpdate = true; t.repeat.set(SW / 4.88, SD / 4.88); return t; })(),
      color: 0xf2ead6, emissive: 0x6c6656, emissiveIntensity: 1.0,
    }));
  PK.sharpen(THREE, ceilPlane.material, -0.9);
  ceilPlane.rotation.x = Math.PI / 2;    // normal points down
  ceilPlane.position.set(CX, CEIL_H, CZ);
  ceilGroup.add(ceilPlane);

  const LY = CEIL_H - 0.045;
  // Discrete 4ft fixtures with a real dark gap between them. Round 1 ran one
  // continuous 100%-white ribbon the length of the store, which is the single
  // most obviously synthetic thing about a CG ceiling.
  const FIX_L = 2.34, FIX_GAP = 0.62;
  // A perfect grid of identically bright fixtures is a two-second CG tell. Real
  // rows are hung off whatever the deck allowed: the pitch wanders, tubes age
  // to different colour temperatures, and there is always at least one fixture
  // with a dead lamp and one missing altogether. The atlas carries four states;
  // this picks one per fixture and jitters the position.
  const fixState = () => {
    const r = rng();
    return r < 0.58 ? 0 : r < 0.78 ? 1 : r < 0.93 ? 2 : 3;
  };
  const lightRow = (x, z0, z1) => {
    const pitch = FIX_L + FIX_GAP;
    const n = Math.max(1, Math.round((z1 - z0) / pitch));
    const span = n * pitch - FIX_GAP;
    let z = (z0 + z1) / 2 - span / 2 + FIX_L / 2;
    for (let k = 0; k < n; k++, z += pitch) {
      const jz = z + rr(rng, -0.16, 0.16), jx = x + rr(rng, -0.05, 0.05);
      const dead = rng() < 0.055;
      if (!dead) {
        qDown(Qstrip, jx, LY, jz, 0.44, FIX_L, cellUV(fixState(), 4, 1));
        // and its own reflection on the polished floor five metres below. The
        // long continuous smear round 2 drew had no rhythm; a real floor
        // mirrors DISCRETE fixtures with dark gaps between them.
        qUp(Qglow, jx, 0.020, jz, 0.62, FIX_L * 1.75, FULL);
      } else fix(jx, LY + 0.012, jz, 0.44, 0.03, FIX_L, 0x8a8578, BfixC);
      fix(jx, LY + 0.085, jz, 0.54, 0.15, FIX_L + 0.04, 0xe6ddc8, BfixC);
      // the door frame around the lens, and the trim at the two ends
      fix(jx, LY + 0.006, jz, 0.50, 0.012, FIX_L + 0.05, 0xb6af9c, BfixC);
    }
  };
  const lightRowX = (z, x0, x1) => {
    const pitch = FIX_L + FIX_GAP;
    const n = Math.max(1, Math.round((x1 - x0) / pitch));
    const span = n * pitch - FIX_GAP;
    let x = (x0 + x1) / 2 - span / 2 + FIX_L / 2;
    for (let k = 0; k < n; k++, x += pitch) {
      const jx = x + rr(rng, -0.16, 0.16), jz = z + rr(rng, -0.05, 0.05);
      const dead = rng() < 0.055;
      const uv = cellUV(fixState(), 4, 1);
      if (!dead) {
        Qstrip.rect([jx, LY, jz], [0, 0, -0.22], [FIX_L / 2, 0, 0], uv[0], uv[1], uv[2], uv[3]);
        qUp(Qglow, jx, 0.020, jz, FIX_L * 1.75, 0.62, FULL);
      } else fix(jx, LY + 0.012, jz, FIX_L, 0.03, 0.44, 0x8a8578, BfixC);
      fix(jx, LY + 0.085, jz, FIX_L + 0.04, 0.15, 0.54, 0xe6ddc8, BfixC);
    }
  };
  for (let i = 0; i < AISLE_COUNT; i++) {
    lightRow(aisleX(i) - 0.95, -HALF - 1.6, HALF + 1.6);
    lightRow(aisleX(i) + 0.95, -HALF - 1.6, HALF + 1.6);
  }
  for (let i = 0; i < AISLE_COUNT - 1; i++) {
    lightRow(aisleX(i) + PITCH / 2, -HALF - 1.2, HALF + 1.2);
  }
  for (let k = 0; k < 4; k++) lightRowX(STORE.minZ + 1.9 + k * 1.75, STORE.minX + 1, STORE.maxX - 1);
  for (let k = 0; k < 2; k++) lightRowX(STORE.maxZ - 1.5 - k * 1.9, STORE.minX + 1, STORE.maxX - 1);

  // SPRINKLER GRID. Round 2 ran seven dead-straight mains across X and nothing
  // along Z; a real wet system is a grid of mains and branch lines with a head
  // every ten feet, and it is one of the busiest things on a store ceiling.
  for (let k = 0; k < 7; k++) {
    const z = STORE.minZ + 2.6 + k * (SD - 5) / 6 + rr(rng, -0.25, 0.25);
    tube(CX, CEIL_H - 0.30, z, 0, 0, Math.PI / 2, 0.075, SW - 1.2, 0xb04a34, BtubeC);
    for (let x = STORE.minX + 2.4; x < STORE.maxX - 2; x += 3.4) {
      fix(x, CEIL_H - 0.20, z, 0.05, 0.20, 0.05, 0x8f8a7c, BfixC);
      fix(x, CEIL_H - 0.34, z, 0.13, 0.05, 0.13, 0xc9c2ae, BfixC);
      fix(x, CEIL_H - 0.245, z, 0.10, 0.035, 0.10, 0xb04a34, BfixC);   // hanger
    }
  }
  for (let k = 0; k < 6; k++) {                // branch lines running along Z
    const x = STORE.minX + 4.2 + k * (SW - 9) / 5 + rr(rng, -0.5, 0.5);
    tube(x, CEIL_H - 0.155, CZ, 0, 0, 0, 0.045, SD - 2.2, 0x9c4230, BtubeC);
    for (let z = STORE.minZ + 3; z < STORE.maxZ - 2; z += 3.05) {
      fix(x, CEIL_H - 0.10, z, 0.055, 0.14, 0.055, 0x8f8a7c, BfixC);
    }
  }
  for (let k = 0; k < 12; k++) {
    const x = STORE.minX + 3 + (k % 6) * (SW - 6) / 5 + rr(rng, -0.5, 0.5);
    const z = STORE.minZ + 5 + Math.floor(k / 6) * (SD - 12) + rr(rng, -0.8, 0.8);
    fix(x, CEIL_H - 0.06, z, 1.18, 0.12, 1.18, 0xf2ecdb, BfixC);
    fix(x, CEIL_H - 0.13, z, 1.02, 0.04, 1.02, 0xd7d0bc, BfixC);
    for (let b = -3; b <= 3; b++) {          // the blades of the diffuser
      fix(x, CEIL_H - 0.15, z + b * 0.14, 0.98, 0.05, 0.045, 0x9d9682, BfixC);
    }
  }
  // ---- ceiling clutter ----------------------------------------------------
  // Speakers, exit lights, junction boxes and a run of loose conduit. Nothing
  // here is load-bearing for gameplay; all of it is the incidental hardware a
  // real drop ceiling carries and a rendered one never does.
  for (let k = 0; k < 14; k++) {
    const x = STORE.minX + 2.5 + rng() * (SW - 5), z = STORE.minZ + 2.5 + rng() * (SD - 5);
    fix(x, CEIL_H - 0.05, z, 0.30, 0.09, 0.30, 0xe4ddc9, BfixC);
    fix(x, CEIL_H - 0.10, z, 0.24, 0.03, 0.24, 0x5d574a, BfixC);
  }
  for (let k = 0; k < 9; k++) {              // conduit / loose data cable
    const z = STORE.minZ + 3 + rng() * (SD - 6);
    const x0 = STORE.minX + rr(rng, 1, 8), x1 = STORE.maxX - rr(rng, 1, 8);
    tube((x0 + x1) / 2, CEIL_H - rr(rng, 0.06, 0.12), z, 0, 0, Math.PI / 2,
      rr(rng, 0.018, 0.032), x1 - x0, k % 3 ? 0x8d8676 : 0x3c3a34, BtubeC);
    for (let x = x0 + 1.5; x < x1; x += rr(rng, 2.4, 5.0)) {
      fix(x, CEIL_H - 0.05, z, 0.07, 0.10, 0.07, 0x8d8676, BfixC);
    }
  }
  // ---- hanging promo danglers ---------------------------------------------
  // Cardboard cards on string at wildly varying heights. They cost almost
  // nothing and they put genuine detail into the top third of the frame, which
  // measured as the single flattest region in every round-2 render.
  const dangle = (x, z, y) => {
    const uv = cellUV((rng() * 8) | 0, 4, 2);
    const w = rr(rng, 0.26, 0.40), h = w * rr(rng, 0.68, 0.86);
    const yaw = rr(rng, -0.5, 0.5);
    const cs = Math.cos(yaw) * w / 2, sn = Math.sin(yaw) * w / 2;
    for (const s of [1, -1]) {
      Qdangle.rect([x, y, z + s * 0.004], [s * cs, 0, -s * sn], [0, h / 2, 0],
        uv[0], uv[1], uv[2], uv[3]);
    }
    tube(x, (y + h / 2 + CEIL_H) / 2, z, 0, 0, 0, 0.006,
      CEIL_H - y - h / 2, 0xb9b2a0);
  };
  for (let i = 0; i < AISLE_COUNT - 1; i++) {
    const gx = aisleX(i) + PITCH / 2;
    for (let k = 0; k < 9; k++) {
      dangle(gx + rr(rng, -0.62, 0.62), rr(rng, -HALF + 1, HALF - 1), rr(rng, 3.40, 4.60));
    }
  }
  for (let k = 0; k < 22; k++) {
    dangle(STORE.minX + 3 + rng() * (SW - 6), FRONT_WALK_Z + rr(rng, -2.6, 1.8),
      rr(rng, 3.2, 4.5));
  }
  for (let k = 0; k < 12; k++) {
    dangle(STORE.minX + 3 + rng() * (SW - 6), BACK_WALK_Z + rr(rng, -1.6, 1.6),
      rr(rng, 3.3, 4.5));
  }
  scene.onBeforeRender = (r, sc, cam) => {
    const p = cam && cam.position;
    const v = !p || p.y < CEIL_H - 0.15;
    if (ceilGroup.visible !== v) ceilGroup.visible = v;
    const f = !p || p.z > STORE.minZ + 0.05;
    if (frontGroup.visible !== f) frontGroup.visible = f;
  };

  // dome cameras (below the ceiling — visible from every view)
  const domeMat = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
  for (const c of CAMERAS) {
    const d = new THREE.Mesh(G.dome, domeMat);
    d.scale.set(0.34, 0.24, 0.34);
    d.rotation.x = Math.PI;
    d.position.set(c.pos[0], c.pos[1], c.pos[2]);
    root.add(d);
    fix(c.pos[0], c.pos[1] + 0.06, c.pos[2], 0.40, 0.09, 0.40, 0xe8e1cd);
    fix(c.pos[0], (c.pos[1] + CEIL_H) / 2 + 0.05, c.pos[2], 0.07, CEIL_H - c.pos[1], 0.07, 0xbdb6a4);
  }

  // =========================================================================
  // GONDOLA RUNS
  // =========================================================================
  const BODY = HALF - 0.62;                 // gondola body half-length in Z
  const EC_D = 0.44;                        // endcap shelf depth
  const ECDECK = [0.22, 0.68, 1.14, 1.60];

  // A real gondola is set to whatever is on it: an 8in clear deck for canned
  // goods, 15in for cereal. Uniform spacing all the way down every run was
  // forcing every SKU to the same height and undoing the size variety — so
  // each run gets its own irregular deck plan, and products.js then picks
  // kinds that actually fit the deck it is filling.
  const DECK_STEPS = [0.215, 0.245, 0.275, 0.315, 0.365, 0.425];
  // ROUND-3 MERCHANDISING PROFILES. Round-2's four renders spanned 0.4
  // percentage points of edge density where six real photographs spanned 15 —
  // that tightness IS the artefact, and it comes from every run being set to
  // the same deck plan and stocked to the same fullness. A real store's canned
  // aisle and its paper aisle do not look remotely alike: one is eight tight
  // decks of small tins packed solid, the other is four tall decks of jugs and
  // paper packs with air everywhere.
  const PROFILES = [
    // canned/dry: nine shallow decks of small tins, faced solid
    { key: 'tight', steps: [0.190, 0.195, 0.205, 0.215, 0.235], vacancy: 0.22, base: 0.095 },
    { key: 'mixed', steps: DECK_STEPS, vacancy: 1.00, base: 0.130 },
    // jugs, paper packs, 12-packs: four tall decks with air above everything
    { key: 'bulky', steps: [0.395, 0.445, 0.500, 0.445], vacancy: 1.55, base: 0.165 },
    // mid-reset: whole bays stripped, tag holders left on the rail
    { key: 'reset', steps: [0.245, 0.275, 0.315, 0.365, 0.275], vacancy: 1.80, base: 0.140 },
    { key: 'mixed', steps: [0.235, 0.275, 0.245, 0.315, 0.365], vacancy: 0.70, base: 0.115 },
  ];
  function deckPlan(r, prof) {
    const ys = [];
    let y = prof.base + rr(r, -0.012, 0.030);
    let guard = 0;
    while (y < SHELF_H - 0.235 && guard++ < 14) {
      ys.push(y);
      y += pick(r, prof.steps) + 0.036;
    }
    return ys;
  }
  function deckDepths(halfDepth, n) {
    return Array.from({ length: n }, (_, i) => halfDepth * (1.0 - 0.22 * (i / Math.max(1, n - 1))));
  }

  // ---- gondola hardware ---------------------------------------------------
  const SECT = 1.22;                         // one 4ft shelving section
  // A price rail is an extruded C-channel screwed to a 4ft shelf, so it stops
  // at every section joint and starts again 20 mm later with a visible end.
  // Emitting one 25 m quad instead was worth ~90 hard vertical edges per aisle.
  function railRun(lip, y, a0, a1, dir) {
    const n = Math.max(1, Math.round((a1 - a0) / SECT));
    const w = (a1 - a0) / n;
    for (let k = 0; k < n; k++) {
      const s = a0 + k * w + 0.011, e = a0 + (k + 1) * w - 0.011;
      qX(Qrail, lip + dir * 0.012, y, (s + e) / 2, e - s, 0.062, dir, [0, 0, (e - s), 1]);
    }
  }
  function railRunX(cz, y, a0, a1, dir) {
    const n = Math.max(1, Math.round((a1 - a0) / SECT));
    const w = (a1 - a0) / n;
    for (let k = 0; k < n; k++) {
      const s = a0 + k * w + 0.011, e = a0 + (k + 1) * w - 0.011;
      qZ(Qrail, (s + e) / 2, y, cz, e - s, 0.062, dir, [0, 0, (e - s), 1]);
    }
  }
  // The AO card lying ON a shelf deck, gradient running lip -> back panel.
  // qUp/qDown map u across the run, and this needs v along the DEPTH, so the
  // half-extents are built by hand.
  const AOU = TX.AO_UV;
  function deckAOz(lip, y, dir, dep, a0, a1) {
    const L = (a1 - a0) / 2;
    Qao.rect([lip - dir * dep / 2, y, (a0 + a1) / 2],
      [0, 0, -dir * L], [-dir * dep / 2, 0, 0], AOU.deck[0], AOU.deck[1], AOU.deck[2], AOU.deck[3]);
  }
  function deckAOx(lipZ, y, dir, dep, a0, a1) {
    const L = (a1 - a0) / 2;
    Qao.rect([(a0 + a1) / 2, y, lipZ - dir * dep / 2],
      [dir * L, 0, 0], [0, 0, -dir * dep / 2], AOU.deck[0], AOU.deck[1], AOU.deck[2], AOU.deck[3]);
  }

  // 13 printed tag designs then 3 orphan states — see pack.js TAG_SKU.
  const tagUV = (kindT) => (kindT === 'orphan'
    ? cellUV(PK.TAG_SKU + ((rng() * (16 - PK.TAG_SKU)) | 0), 4, 4)
    : cellUV((rng() * PK.TAG_SKU) | 0, 4, 4));

  function buildRun(idx, x, halfW, faces, opts = {}) {
    const B = newPkg();
    const prof = opts.profile || PROFILES[idx % PROFILES.length];
    const z0 = -BODY, z1 = BODY, len = z1 - z0;
    const DECK = deckPlan(rng, prof);
    const LIT = DECK.map((_, i) => 0.88 + 0.20 * (i / Math.max(1, DECK.length - 1)));
    const dd = deckDepths(halfW - 0.05, DECK.length);

    // kick plate + base
    fix(x, 0.075, 0, halfW * 2 - 0.10, 0.15, len, P.kick);
    // back panel / pegboard spine. Round 3 skins it with a real perforated
    // panel: it shows in the bottom of every cavity and across the whole of
    // any bare bay, and round 2 put a smooth beige slab there.
    if (faces.length === 2) {
      fix(x, 1.10, 0, 0.07, 1.90, len, P.peg);
      for (const s2 of [-1, 1]) {
        qX(Qpeg, x + s2 * 0.037, 1.10, 0, len, 1.90, s2, [0, 0, len / 0.30, 1.90 / 0.30]);
      }
    } else {
      const bx = x - faces[0].dir * (halfW - 0.04);
      fix(bx, 1.10, 0, 0.08, 1.90, len, P.peg);
      qX(Qpeg, bx + faces[0].dir * 0.042, 1.10, 0, len, 1.90, faces[0].dir,
        [0, 0, len / 0.30, 1.90 / 0.30]);
    }

    for (const f of faces) {
      const lip = x + f.dir * halfW;
      for (let d = 0; d < DECK.length; d++) {
        const dep = dd[d];
        // shelf board
        fix(lip - f.dir * (dep / 2), DECK[d] - 0.018, 0, dep + 0.02, 0.036, len, d === 0 ? P.deckDark : P.deck);
        // UNDERSIDE — markedly darker than the top. This is what makes an
        // aisle wall read as alternating bright and dark horizontal bands
        // instead of one evenly lit slab.
        fix(lip - f.dir * (dep / 2), DECK[d] - 0.041, 0, dep + 0.015, 0.020, len, P.shelfUnder);
        // PRICE RAIL — broken at every 4ft section joint. Round 2 ran one
        // continuous extruded bar the full 25 m of the aisle, which is a very
        // strong architectural giveaway even at distance: real shelving is
        // assembled from 3-4ft sections and every joint shows.
        railRun(lip, DECK[d] - 0.020, z0, z1, f.dir);
        const head = (DECK[d + 1] !== undefined ? DECK[d + 1] : SHELF_H + 0.03) - DECK[d] - 0.036;
        // cavity gradient: dark under the shelf above, fading down. Also what
        // makes a sold-out void read as a black hole rather than a beige gap.
        qX(Qcav, lip - f.dir * (dep - 0.01), DECK[d] + head * 0.5, 0, len, head, f.dir, FULL);
        // CAVITY AMBIENT OCCLUSION — multiply-blended across the mouth of the
        // cavity, 6 mm proud of the deepest facing and 6 mm behind the rail.
        // Near-black under the deck above, clearing by mid-height, then a hard
        // seam at the deck. This is the round-3 headline change: without it
        // every product is lit identically and the run reads as a decal.
        qX(Qao, lip - f.dir * 0.006, DECK[d] + head * 0.5, 0, len, head, f.dir, AOU.mouth);
        // ...and the deck surface itself, which is the biggest flat region in
        // the frame on every shelf below eye level.
        deckAOz(lip, DECK[d] + 0.0015, f.dir, dep, z0, z1);
        // deck brackets at the section joints, seen from below on high decks
        for (let z = z0 + 0.61; z < z1; z += 1.22) {
          fix(lip - f.dir * (dep * 0.30), DECK[d] - 0.056, z,
            dep * 0.56, 0.032, 0.020, 0x847c6b);
        }
        // SHELF DIVIDERS. Clear acrylic fins between facing blocks — standard
        // on about half the decks in a modern store, and a whole extra rhythm
        // of hard vertical edges right where the frame is largest.
        // WIRE dividers, not solid fins: a front post and a top rail. A solid
        // acrylic fin looks right side-on but presents its whole face to a
        // camera looking DOWN the aisle, and a run of them walls the shelf off
        // behind a repeating cream slab — measured as a 3-point edge-density
        // LOSS in the long aisle view.
        if (rng() < 0.40) {
          const dh = Math.min(head * 0.62, 0.16);
          for (let z = z0 + rr(rng, 0.2, 0.7); z < z1 - 0.1; z += rr(rng, 0.34, 0.92)) {
            fix(lip - f.dir * (dep * 0.14), DECK[d] + dh / 2, z, 0.008, dh, 0.008, 0xd9d2c0);
            fix(lip - f.dir * (dep * 0.30), DECK[d] + dh, z, dep * 0.42, 0.008, 0.008, 0xd9d2c0);
          }
        }
        // SHELF-EDGE WOBBLERS. A printed flag on a springy stem clipped to the
        // rail, sticking out into the aisle at an angle. Every store has them,
        // no rendered store does, and they are the highest-contrast small
        // object available at exactly eye level.
        if (DECK[d] > 0.42 && rng() < 0.52) {
          for (let k = 0, n = ri(rng, 1, 3); k < n; k++) {
            const wz = rr(rng, z0 + 0.6, z1 - 0.6);
            const tilt = rr(rng, -0.45, 0.45);
            fix(lip + f.dir * 0.035, DECK[d] - 0.006, wz, 0.055, 0.020, 0.006, P.metal);
            const wy = DECK[d] + 0.075, w = rr(rng, 0.085, 0.115);
            const uv = cellUV((rng() * 8) | 0, 4, 2);
            for (const sgn of [1, -1]) {
              Qdangle.rect([lip + f.dir * 0.075, wy, wz + sgn * 0.003],
                [0, 0, sgn * f.dir * (w / 2) * Math.cos(tilt)],
                [Math.sin(tilt) * w * 0.30, w * 0.36, 0],
                uv[0], uv[1], uv[2], uv[3]);
            }
            fix(lip + f.dir * 0.055, DECK[d] + 0.030, wz, 0.045, 0.062, 0.004, P.metal);
          }
        }
        // pull: top decks are faced right up to the lip, bottom decks sink back
        const pull = d / (DECK.length - 1);
        fillShelf(B, rng, f.dept, {
          axis: 'z', a0: z0 + 0.05, a1: z1 - 0.05, lip, face: f.dir,
          deckY: DECK[d], headroom: head, depth: dep, lit: LIT[d], col, pull,
          vacancy: prof.vacancy,
          tag: (aStart, aw, kindT) => {
            qX(Qtag, lip + f.dir * 0.020, DECK[d] - 0.021, aStart + aw / 2, aw, 0.050,
              f.dir, tagUV(kindT));
          },
        });
        // BACK ROWS behind the facings, on every deck. See fillBackRow.
        for (let bk = 1; 0.10 + bk * 0.175 < dep; bk++) {
          fillBackRow(B, rng, f.dept, {
            axis: 'z', a0: z0 + 0.05, a1: z1 - 0.05,
            lip: lip - f.dir * (0.045 + bk * 0.175), face: f.dir,
            deckY: DECK[d], headroom: head, depth: 0.175,
            lit: LIT[d] * (0.80 - 0.11 * bk), col,
          });
        }
      }
      // UPRIGHTS every 4ft section. Round 2 drew a plain smooth 42 mm post;
      // real gondola uprights are 3in wide and carry a column of punched slots
      // at ~1in pitch all the way up. The slot column is the strongest small
      // vertical rhythm in an aisle and it was completely missing.
      const UPW = 0.072;
      for (let z = z0; z <= z1 + 0.01; z += SECT) {
        fix(lip - f.dir * 0.026, 1.06, z, 0.052, 2.00, UPW, P.upright);
        qX(Qslot, lip + f.dir * 0.004, 1.06, z, UPW, 2.00, f.dir, [0, 0, 1, 2.00 / 0.05]);
        // the two flanges that catch the shelf brackets
        fix(lip - f.dir * 0.058, 1.06, z, 0.045, 2.00, UPW * 0.55, 0x9d9583);
      }
      // CLIP STRIPS. A plastic ladder of hooks hung off a shelf lip carrying a
      // column of single-serve pouches — cross-merchandising, in every real
      // aisle, and about the densest small detail available at eye level. They
      // hang PROUD of the cavity AO card, so they catch the light and read as
      // bright clutter against the shadowed facings behind them.
      for (let s = 0; s < ri(rng, 3, 6); s++) {
        const d0 = ri(rng, Math.min(2, DECK.length - 1), DECK.length - 1);
        const zc = rr(rng, z0 + 1.0, z1 - 1.0);
        const top = DECK[d0] - 0.045;
        const nHook = ri(rng, 4, 7);
        fix(lip + f.dir * 0.020, top - 0.20, zc, 0.016, 0.42, 0.028, 0xe4dece);
        const hsl = pick(rng, f.dept.colors);
        for (let k = 0; k < nHook; k++) {
          col.setHSL((hsl[0] + k * 9) % 360 / 360, Math.min(1, hsl[1] / 100 * 1.1),
            Math.min(0.9, hsl[2] / 100 * rr(rng, 0.95, 1.15)));
          B.bag.push(lip + f.dir * 0.036, top - 0.055 - k * 0.058, zc + rr(rng, -0.006, 0.006),
            rr(rng, -0.05, 0.05), (f.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + rr(rng, -0.12, 0.12),
            0, 0.062, 0.052, 0.018, col, (rng() * 8) | 0);
        }
      }
      // FLOOR REFLECTION. A polished VCT floor carries a soft vertical smear of
      // the whole gondola run. Each streak is tinted with a colour lifted from
      // the department palette above it, so the reflection is a band of blurred
      // product colour rather than a grey wash.
      for (let z = z0; z < z1; z += 0.26) {
        const hsl = pick(rng, f.dept.colors);
        col.setHSL(hsl[0] / 360, hsl[1] / 100 * 0.34,
          Math.min(0.80, hsl[2] / 100 * rr(rng, 0.9, 1.35)));
        Qsmear.tint = col;
        // streaks are far WIDER than the step so they overlap three deep and
        // average into a soft sheen; discrete streaks read as painted stripes
        const w = rr(rng, 0.70, 1.15), out = rr(rng, 1.20, 2.30);
        Qsmear.rect(
          [lip + f.dir * (out / 2), 0.010, z + w / 2],
          [0, 0, f.dir * w / 2], [f.dir * out / 2, 0, 0], 0, 0, 1, 1);
      }
      // top rail / valance
      fix(lip - f.dir * 0.05, SHELF_H + 0.02, 0, 0.11, 0.07, len, P.deckDark);
      // one shelf-top category blade per face, thin so it never reads as a slab
      if (f.aisle !== undefined) {
        const uv = cellUV(f.aisle % 8, 1, 8);
        const bz = -BODY * 0.30;
        fix(lip + f.dir * 0.04, 2.31, bz, 0.028, 0.58, 2.30, 0xe6dfc9);
        qX(Qblade, lip + f.dir * 0.056, 2.31, bz, 2.24, 0.52, f.dir, uv);
        for (const s of [-1, 1]) fix(lip - f.dir * 0.05, 2.10, bz + s * 0.95, 0.15, 0.08, 0.04, P.metal);
      }
      // contact shadow where the run meets the floor — the single cheapest cue
      // that anything in this store is actually sitting on the ground. Two
      // passes: a wide soft ambient one and a tight near-black line right at
      // the kick plate, which is what actually sells the contact.
      qUp(Qshadow, lip + f.dir * 0.06, 0.006, 0, 2.6, len * 1.02, FULL);
      qUp(Qshadow, lip + f.dir * 0.02, 0.007, 0, 0.46, len * 1.01, FULL);
      // rubber bumper along the foot of the run
      fix(lip - f.dir * 0.012, 0.048, 0, 0.030, 0.058, len, 0x4a4640);
    }

    // wood end panels + endcaps
    if (opts.endcaps) {
      for (const dir of [-1, 1]) {
        const zEnd = dir > 0 ? z1 : z0;
        fix(x, 1.06, zEnd + dir * 0.03, halfW * 2, 2.06, 0.07, 0xffffff, Bwood);
        const lip = zEnd + dir * (EC_D + 0.06);
        fix(x, 0.075, zEnd + dir * (EC_D / 2 + 0.05), halfW * 2 - 0.08, 0.15, EC_D + 0.1, P.kick);
        for (let d = 0; d < ECDECK.length; d++) {
          fix(x, ECDECK[d] - 0.018, lip - dir * (EC_D / 2), halfW * 2 - 0.04, 0.036, EC_D, P.deck);
          fix(x, ECDECK[d] - 0.041, lip - dir * (EC_D / 2), halfW * 2 - 0.05, 0.020, EC_D, P.shelfUnder);
          railRunX(lip + dir * 0.012, ECDECK[d] - 0.020, x - halfW + 0.02, x + halfW - 0.02, dir);
          const head = (ECDECK[d + 1] !== undefined ? ECDECK[d + 1] : 2.02) - ECDECK[d] - 0.036;
          qZ(Qcav, x, ECDECK[d] + head * 0.5, lip - dir * (EC_D - 0.01),
            halfW * 2 - 0.04, head, dir, FULL);
          qZ(Qao, x, ECDECK[d] + head * 0.5, lip - dir * 0.006,
            halfW * 2 - 0.04, head, dir, AOU.mouth);
          deckAOx(lip, ECDECK[d] + 0.0015, dir, EC_D, x - halfW + 0.02, x + halfW - 0.02);
          fillBackRow(B, rng, faces[0].dept, {
            axis: 'x', a0: x - halfW + 0.04, a1: x + halfW - 0.04,
            lip: lip - dir * 0.20, face: dir, deckY: ECDECK[d],
            headroom: head, depth: 0.16, lit: 0.82, col,
          });
          fillShelf(B, rng, faces[0].dept, {
            axis: 'x', a0: x - halfW + 0.04, a1: x + halfW - 0.04, lip, face: dir,
            deckY: ECDECK[d], headroom: head, depth: EC_D * 0.92, lit: 1.05, col,
            pull: d / (ECDECK.length - 1), vacancy: 0.4,
            tag: (aStart, aw, kindT) => {
              qZ(Qtag, aStart + aw / 2, ECDECK[d] - 0.021, lip + dir * 0.020, aw, 0.050,
                dir, tagUV(kindT));
            },
          });
        }
        // promo header
        fix(x, 2.34, zEnd + dir * 0.10, halfW * 2 + 0.18, 0.70, 0.06, 0xf4ecd8);
        qZ(Qpromo, x, 2.34, zEnd + dir * (0.10 + 0.035), halfW * 2 + 0.10, 0.62, dir,
          cellUV((idx * 3 + (dir > 0 ? 1 : 0)) % 4, 1, 4));
        // stub uprights framing the endcap
        fix(x - halfW + 0.03, 1.06, lip - dir * 0.05, 0.06, 1.95, 0.09, P.upright);
        fix(x + halfW - 0.03, 1.06, lip - dir * 0.05, 0.06, 1.95, 0.09, P.upright);
      }
    }

    // OVERSTOCK riding on top of the run. Round 2 dropped one case every four
    // metres; in the reference photography a gondola top is a near-continuous
    // ridge of shrink-wrapped case bundles and odd cartons, and in an aisle
    // view that ridge sits right where the frame is emptiest.
    for (let z = z0 + 0.4; z < z1 - 0.5;) {
      if (rng() < 0.16) { z += rr(rng, 0.5, 2.0); continue; }
      const w = rr(rng, 0.34, 0.80), dx = rr(rng, -0.13, 0.13);
      const n = ri(rng, 1, 3);
      let y = SHELF_H + 0.06;
      const warm = rng() < 0.55;
      for (let sIdx = 0; sIdx < n; sIdx++) {
        const h = rr(rng, 0.13, 0.27);
        if (warm) col.setHSL(rr(rng, 25, 40) / 360, rr(rng, 0.20, 0.42), rr(rng, 0.42, 0.60));
        else {
          const hs = pick(rng, faces[0].dept.colors);
          col.setHSL(hs[0] / 360, hs[1] / 100 * 0.8, Math.min(0.9, hs[2] / 100 * 1.1));
        }
        B.box.push(x + dx + rr(rng, -0.035, 0.035), y + h / 2, z + w / 2 + rr(rng, -0.03, 0.03),
          0, rr(rng, -0.12, 0.12), 0, rr(rng, halfW * 1.05, halfW * 1.8), h,
          w * rr(rng, 0.88, 1.0), col, (rng() * 24) | 0);
        y += h;
      }
      z += w + rr(rng, 0.02, 0.28);
    }

    // A run mid-reset is not just empty — a real one has the crew's U-boat
    // parked against it, loaded with case stock, and cut cases on the deck.
    // Round 3 added the bare bays without adding the WORK that creates them,
    // which made the stripped aisle read as neglected rather than as busy.
    if (prof.key === 'reset') {
      for (const f of faces) {
        for (let k = 0, n = ri(rng, 2, 3); k < n; k++) {
          const uz = rr(rng, z0 + 2.0, z1 - 2.0);
          const ux = x + f.dir * (halfW + 0.30);
          fix(ux, 0.10, uz, 0.44, 0.08, 1.15, 0x4a4640);            // deck
          for (const e of [-1, 1]) {
            fix(ux, 0.80, uz + e * 0.56, 0.42, 1.32, 0.05, 0x8d8676); // end frames
            for (let b = 0; b < 4; b++) {
              fix(ux, 0.30 + b * 0.33, uz + e * 0.56, 0.40, 0.035, 0.06, 0xb9b3a4);
            }
          }
          fix(ux, 0.62, uz, 0.42, 0.035, 1.10, 0x9d9583);            // mid shelf
          for (const [by, bn] of [[0.14, 3], [0.655, 3]]) {
            let cz = uz - 0.50;
            for (let c = 0; c < bn && cz < uz + 0.42; c++) {
              const cw = rr(rng, 0.24, 0.36), ch = rr(rng, 0.16, 0.24);
              const hs = pick(rng, f.dept.colors);
              col.setHSL(hs[0] / 360, hs[1] / 100 * 0.55,
                Math.min(0.75, hs[2] / 100 * rr(rng, 0.9, 1.25)));
              B.box.push(ux + rr(rng, -0.02, 0.02), by + ch / 2, cz + cw / 2,
                0, rr(rng, -0.10, 0.10), 0, 0.40, ch, cw * 0.96, col, (rng() * 24) | 0);
              cz += cw + rr(rng, 0.005, 0.03);
            }
          }
          for (const [dx, dz] of [[-0.15, -0.48], [0.15, -0.48], [-0.15, 0.48], [0.15, 0.48]]) {
            fix(ux + dx, 0.04, uz + dz, 0.07, 0.08, 0.08, 0x2f3237);
          }
          qUp(Qshadow, ux, 0.006, uz, 1.3, 2.0, FULL);
        }
      }
    }

    // Perimeter runs carry an upper deck above the 2.05 m top rail: bulk packs
    // and case stock, plus a painted decor band. Fills the upper third of the
    // frame in aisles 0 and 7, which had four metres of bare drywall there.
    if (opts.upper) {
      const dir = opts.upper, lip = x + dir * halfW;
      for (const uy of [SHELF_H + 0.30, SHELF_H + 0.72]) {
        fix(lip - dir * (halfW * 0.5), uy - 0.018, 0, halfW + 0.02, 0.036, len, P.deck);
        fix(lip - dir * (halfW * 0.5), uy - 0.041, 0, halfW, 0.020, len, P.shelfUnder);
        railRun(lip, uy - 0.020, z0, z1, dir);
        qX(Qao, lip - dir * 0.006, uy + 0.19, 0, len, 0.38, dir, AOU.mouth);
        deckAOz(lip, uy + 0.0015, dir, halfW, z0, z1);
        fillBackRow(B, rng, faces[0].dept, {
          axis: 'z', a0: z0 + 0.05, a1: z1 - 0.05, lip: lip - dir * 0.22,
          face: dir, deckY: uy, headroom: 0.38, depth: 0.19, lit: 0.78, col,
        });
        fillShelf(B, rng, faces[0].dept, {
          axis: 'z', a0: z0 + 0.05, a1: z1 - 0.05, lip, face: dir,
          deckY: uy, headroom: 0.38, depth: halfW * 0.9, lit: 0.96, col,
          pull: 0.8, vacancy: 1.1,
          tag: (aStart, aw, kindT) => {
            qX(Qtag, lip + dir * 0.020, uy - 0.021, aStart + aw / 2, aw, 0.050,
              dir, tagUV(kindT));
          },
        });
      }
      for (let z = z0; z <= z1 + 0.01; z += SECT) {
        fix(lip - dir * 0.026, SHELF_H + 0.55, z, 0.052, 1.10, 0.072, P.upright);
        qX(Qslot, lip + dir * 0.004, SHELF_H + 0.55, z, 0.072, 1.10, dir, [0, 0, 1, 22]);
      }
      // decor band with framed department panels along it — round 2 left four
      // metres of flat painted drywall above the perimeter run
      fix(lip - dir * 0.06, SHELF_H + 1.30, 0, 0.16, 0.70, len, P.sage);
      fix(lip - dir * 0.06, SHELF_H + 0.93, 0, 0.17, 0.06, len, P.terra);
      for (let z = z0 + 1.4; z < z1 - 1.0; z += 3.55) {
        fix(lip + dir * 0.03, SHELF_H + 1.32, z, 0.03, 0.62, 2.30, 0xf3ecda);
        qX(Qpromo, lip + dir * 0.048, SHELF_H + 1.32, z, 2.22, 0.54, dir,
          cellUV((rng() * 4) | 0, 1, 4));
        for (const sgn of [-1, 1]) {
          fix(lip + dir * 0.02, SHELF_H + 1.32, z + sgn * 1.78, 0.03, 0.50, 0.9, P.terra);
        }
      }
    }

    flushPkg(B, 'run' + idx);
    const zc = opts.endcaps ? BODY + EC_D + 0.14 : BODY;
    solid(x - halfW - 0.02, 0, -zc, x + halfW + 0.02, SHELF_H, zc);
  }

  // 7 island gondolas between neighbouring aisles + 2 shallow wall runs
  const RUN_PROFILE = [1, 0, 4, 2, 2, 1, 3];      // matched to each run's departments
  for (let i = 0; i < AISLE_COUNT - 1; i++) {
    buildRun(i, aisleX(i) + PITCH / 2, SHELF_W / 2, [
      { dir: -1, dept: DEPTS[i % DEPTS.length], aisle: i },
      { dir: 1, dept: DEPTS[(i + 1) % DEPTS.length], aisle: i + 1 },
    ], { endcaps: true, profile: PROFILES[RUN_PROFILE[i % RUN_PROFILE.length]] });
  }
  // PERIMETER RUNS. Aisles 0 and 7 are 4.5 m from centreline to the wall — far
  // wider than the 2.0 m of an interior aisle — and round 2 filled that side
  // with a 0.78 m shelf and four metres of bare painted drywall, which is why
  // those two aisles measured 5-7 points of edge density below every other one.
  // A real perimeter wall carries full-depth shelving with an upper overstock
  // deck and a decor band above it.
  const WRW = 1.30;
  buildRun(90, STORE.minX + WRW / 2 + 0.04, WRW / 2,
    [{ dir: 1, dept: DEPTS[0], aisle: 0 }], { profile: PROFILES[2], upper: 1 });
  buildRun(91, STORE.maxX - WRW / 2 - 0.04, WRW / 2,
    [{ dir: -1, dept: DEPTS[(AISLE_COUNT - 1) % DEPTS.length], aisle: AISLE_COUNT - 1 }],
    { profile: PROFILES[0], upper: -1 });

  // =========================================================================
  // HANGING AISLE SIGNS  (front mouth + back mouth, both faces)
  // =========================================================================
  const SIGN_Y = 3.32, SIGN_W = 1.86, SIGN_H = 1.64;
  for (let i = 0; i < AISLE_COUNT; i++) {
    const x = aisleX(i);
    const front = cellUV(i % 8, 4, 4), back = cellUV(8 + (i % 8), 4, 4);
    for (const end of [-1, 1]) {
      const z = end * (HALF + 0.75);
      // panel faces: -Z side and +Z side
      qZ(Qsign, x, SIGN_Y, z - 0.035, SIGN_W, SIGN_H, -1, end < 0 ? front : back);
      qZ(Qsign, x, SIGN_Y, z + 0.035, SIGN_W, SIGN_H, 1, end < 0 ? back : front);
      fix(x, SIGN_Y, z, SIGN_W + 0.06, SIGN_H + 0.06, 0.07, 0xe9e1cc);
      fix(x, SIGN_Y + SIGN_H / 2 + 0.04, z, SIGN_W + 0.16, 0.09, 0.13, P.terra);
      for (const s of [-1, 1]) {
        tube(x + s * (SIGN_W / 2 - 0.16), (SIGN_Y + SIGN_H / 2 + CEIL_H) / 2, z, 0, 0, 0,
          0.035, CEIL_H - SIGN_Y - SIGN_H / 2, 0xa8a294);
      }
    }
  }

  // =========================================================================
  // CHECKOUT LANES
  // =========================================================================
  const Bfront = newPkg();
  const LANE_N = Math.min(8, 10);
  const laneZ0 = STORE.minZ + 0.6, laneZ1 = FRONT_WALK_Z - 0.9;
  const laneLen = laneZ1 - laneZ0, laneCZ = (laneZ0 + laneZ1) / 2;
  const laneX0 = STORE.minX + 6.2, lanePitch = 3.34;
  for (let k = 0; k < LANE_N; k++) {
    const x = laneX0 + k * lanePitch;
    // belt counter
    fix(x, 0.46, laneCZ, 0.66, 0.92, laneLen, P.counter);
    fix(x, 0.94, laneCZ, 0.60, 0.05, laneLen - 0.5, P.belt);
    fix(x, 0.55, laneCZ, 0.70, 0.07, laneLen, P.terra);
    // register + scanner tower
    fix(x + 0.52, 0.52, laneZ1 - 0.9, 0.5, 1.04, 0.7, P.counter);
    fix(x + 0.52, 1.16, laneZ1 - 0.9, 0.34, 0.26, 0.30, 0x33383f);
    // bagging carousel
    fix(x - 0.55, 0.50, laneZ0 + 0.9, 0.52, 1.00, 0.8, P.metal);
    // lane number lightbox on a post
    tube(x, 1.6, laneZ1 - 0.2, 0, 0, 0, 0.05, 3.0, 0xb5aE9c);
    const uv = cellUV(k % 8, 4, 2);
    qZ(Qlane, x, 2.62, laneZ1 - 0.24, 0.62, 0.62, 1, uv);
    qZ(Qlane, x, 2.62, laneZ1 - 0.16, 0.62, 0.62, -1, uv);
    // candy rack facing the lane
    const B = Bfront;
    for (let d = 0; d < 4; d++) {
      const y = 0.42 + d * 0.34;
      fix(x - 0.42, y - 0.015, laneCZ + 0.4, 0.28, 0.03, 2.0, P.deck);
      fix(x - 0.42, y - 0.036, laneCZ + 0.4, 0.26, 0.016, 1.98, P.shelfUnder);
      railRun(x - 0.42 - 0.15, y - 0.018, laneCZ - 0.6, laneCZ + 1.4, -1);
      qX(Qao, x - 0.42 - 0.146, y + 0.15, laneCZ + 0.4, 2.0, 0.30, -1, AOU.mouth);
      deckAOz(x - 0.42 - 0.14, y + 0.0015, -1, 0.26, laneCZ - 0.6, laneCZ + 1.4);
      fillShelf(B, rng, DEPTS[3], {
        axis: 'z', a0: laneCZ - 0.6, a1: laneCZ + 1.4, lip: x - 0.42 - 0.14, face: -1,
        deckY: y, headroom: 0.30, depth: 0.26, lit: 1.02, col, pull: 0.9, vacancy: 0.5,
        tag: (aStart, aw, kindT) => {
          qX(Qtag, x - 0.42 - 0.132, y - 0.019, aStart + aw / 2, aw, 0.044, -1, tagUV(kindT));
        },
      });
    }
    qUp(Qshadow, x + 0.05, 0.006, laneCZ, 2.4, laneLen + 1.4, FULL);
    solid(x - 0.62, 0, laneZ0 - 0.1, x + 0.82, 1.1, laneZ1 + 0.1);
  }

  flushPkg(Bfront, 'frontend');

  // FRONT WALL DRESSING. Looking down any aisle toward the front you end up on
  // four metres of bare painted drywall above the checkouts; a real front wall
  // carries a poster run, a rub rail and department signage. No colliders — it
  // is all flat against a wall the chase never touches.
  {
    const py = 2.55;
    for (let px = STORE.minX + 9; px < STORE.maxX - 5; px += 3.15) {
      if (Math.abs(px - EXIT.x) < 4.2) continue;
      fix(px, py, STORE.minZ + 0.10, 2.05, 1.30, 0.05, 0xf1e9d5, BfixF);
      qZ(Qpromo, px, py + 0.02, STORE.minZ + 0.135, 1.92, 1.16, 1,
        cellUV((rng() * 4) | 0, 1, 4));
      fix(px, py + 0.70, STORE.minZ + 0.11, 2.20, 0.10, 0.07, P.terra, BfixF);
    }
    fix(CX, 1.16, STORE.minZ + 0.08, SW, 0.10, 0.05, P.woodDark, BfixF);   // rub rail
    fix(CX, 0.28, STORE.minZ + 0.08, SW, 0.56, 0.05, 0xd9cfb6, BfixF);     // dado
  }

  // storefront: bright glazing + entry doors near EXIT
  const gx0 = EXIT.x - 3.4, gx1 = EXIT.x + 3.4;
  Qbright.rect([(gx0 + gx1) / 2, 1.7, STORE.minZ + 0.09], [(gx1 - gx0) / 2, 0, 0], [0, 1.55, 0], 0, 0, 1, 1);
  fix((gx0 + gx1) / 2, 3.45, STORE.minZ + 0.12, gx1 - gx0 + 0.6, 0.55, 0.14, P.terra, BfixF);
  // mullions, transom bar, push bars and a poster on the glass — a single flat
  // bright plate is one of the loudest CG shapes in the whole front of store
  for (let gx = gx0; gx <= gx1 + 0.01; gx += 1.13) {
    fix(gx, 1.7, STORE.minZ + 0.13, 0.10, 3.2, 0.10, 0x4a4f57, BfixF);
  }
  for (const gx of [gx0, EXIT.x, gx1]) fix(gx, 1.7, STORE.minZ + 0.135, 0.16, 3.2, 0.12, 0x3c4149, BfixF);
  fix((gx0 + gx1) / 2, 2.62, STORE.minZ + 0.13, gx1 - gx0, 0.11, 0.10, 0x4a4f57, BfixF);
  fix((gx0 + gx1) / 2, 1.05, STORE.minZ + 0.15, gx1 - gx0, 0.06, 0.08, 0xb9b3a4, BfixF);
  fix((gx0 + gx1) / 2, 0.22, STORE.minZ + 0.14, gx1 - gx0, 0.44, 0.10, 0x4a4f57, BfixF);
  for (const px of [gx0 + 1.7, gx1 - 1.7]) {
    fix(px, 1.75, STORE.minZ + 0.16, 0.70, 0.95, 0.03, 0xf3ecd9, BfixF);
    qZ(Qpromo, px, 1.75, STORE.minZ + 0.178, 0.64, 0.88, 1, cellUV((rng() * 4) | 0, 1, 4));
  }
  fix((gx0 + gx1) / 2, 0.10, STORE.minZ + 1.1, gx1 - gx0, 0.02, 2.2, 0x3b3f45);

  // service desk
  const sd = SERVICE_DESK;
  fix(sd.x, 0.55, sd.z, 6.4, 1.10, 1.10, 0xffffff, Bwood);
  fix(sd.x, 1.13, sd.z, 6.6, 0.08, 1.26, P.counter);
  fix(sd.x, 2.55, sd.z - 0.2, 5.2, 0.62, 0.10, P.sage);
  solid(sd.x - 3.2, 0, sd.z - 0.6, sd.x + 3.2, 1.15, sd.z + 0.6);
  // a couple of tall shelves behind the desk
  fix(sd.x, 1.05, STORE.minZ + 0.5, 6.4, 2.1, 0.5, P.deckDark);

  // =========================================================================
  // BACK WALL — refrigerated glass cases
  // =========================================================================
  const coolZ = STORE.maxZ - 0.62, coolD = 1.10;
  const coolX0 = STORE.minX + 1.2, coolX1 = STORE.minX + SW * 0.56;
  {
    const B = newPkg();
    const cw = coolX1 - coolX0, cmid = (coolX0 + coolX1) / 2;
    // shell only — a solid body would swallow every package inside the case
    fix(cmid, 1.20, coolZ + coolD / 2 - 0.04, cw, 2.36, 0.08, P.coolerIn);   // back
    fix(cmid, 2.34, coolZ, cw, 0.16, coolD, P.cooler);                        // top
    fix(cmid, 2.56, coolZ, cw + 0.1, 0.34, coolD + 0.06, P.sage);             // valance
    fix(cmid, 0.09, coolZ, cw, 0.18, coolD + 0.04, P.kick);                   // kick
    fix(coolX0 - 0.05, 1.20, coolZ, 0.10, 2.36, coolD, P.cooler);
    fix(coolX1 + 0.05, 1.20, coolZ, 0.10, 2.36, coolD, P.cooler);
    const CD = [0.30, 0.68, 1.06, 1.44, 1.82];
    const lip = coolZ - coolD / 2 + 0.16;
    for (let d = 0; d < CD.length; d++) {
      fix(cmid, CD[d] - 0.016, coolZ + 0.06, cw - 0.1, 0.032, 0.86, 0xfbf6ea);
      fix(cmid, CD[d] - 0.040, coolZ + 0.06, cw - 0.12, 0.018, 0.84, 0x7d7466);
      railRunX(lip - 0.014, CD[d] - 0.020, coolX0 + 0.1, coolX1 - 0.1, -1);
      qZ(Qao, cmid, CD[d] + 0.17, lip + 0.006, cw - 0.1, 0.34, -1, AOU.mouth);
      deckAOx(lip, CD[d] + 0.0015, -1, 0.80, coolX0 + 0.1, coolX1 - 0.1);
      for (let bk = 1; bk <= 2; bk++) {
        fillBackRow(B, rng, FROZEN, {
          axis: 'x', a0: coolX0 + 0.15, a1: coolX1 - 0.15,
          lip: lip + bk * 0.19, face: -1, deckY: CD[d], headroom: 0.34,
          depth: 0.19, lit: 1.0 - 0.12 * bk, col,
        });
      }
      fillShelf(B, rng, FROZEN, {
        axis: 'x', a0: coolX0 + 0.15, a1: coolX1 - 0.15, lip, face: -1,
        deckY: CD[d], headroom: 0.34, depth: 0.68, lit: 1.22, col,
        pull: d / Math.max(1, CD.length - 1), vacancy: 0.7,
        tag: (aStart, aw, kindT) => {
          qZ(Qtag, aStart + aw / 2, CD[d] - 0.021, lip - 0.020, aw, 0.048, -1, tagUV(kindT));
        },
      });
    }
    flushPkg(B, 'cooler');
    // glass doors + mullions
    const gz = coolZ - coolD / 2 - 0.02;
    for (let x = coolX0; x < coolX1 - 0.4; x += 0.86) {
      const w = Math.min(0.86, coolX1 - x);
      qZ(Qglass, x + w / 2, 1.18, gz, w - 0.05, 2.02, -1, FULL);
      fix(x, 1.18, gz, 0.06, 2.10, 0.06, 0xd7d1bf);
      fix(x + w - 0.10, 1.02, gz - 0.03, 0.035, 0.55, 0.05, 0xe8e3d2);
    }
    fix((coolX0 + coolX1) / 2, 1.18, gz, coolX1 - coolX0, 0.05, 0.07, 0xd7d1bf);
    qUp(Qshadow, cmid, 0.006, coolZ - 0.35, cw, 3.4, FULL);
    solid(coolX0, 0, coolZ - coolD / 2 - 0.1, coolX1, 2.3, coolZ + coolD / 2);
  }

  // =========================================================================
  // PRODUCE — low wood tables with mounded fruit, back right
  // =========================================================================
  const prodX0 = STORE.minX + SW * 0.62;
  const PROD_COLS = [0xc8341f, 0xe07b12, 0x5d8f22, 0xd7bb15, 0x7d3f6b, 0xd4562a,
    0x35701f, 0xe8b21a, 0xa8232a, 0x9fbf35];
  function produceTable(cx, cz, w, dpt, seedIdx) {
    fix(cx, 0.34, cz, w, 0.68, dpt, 0xffffff, Bwood);            // wood base
    fix(cx, 0.70, cz, w + 0.10, 0.08, dpt + 0.10, P.woodDark);   // rim
    fix(cx, 0.735, cz, w - 0.10, 0.02, dpt - 0.10, 0x2c3327);    // dark liner
    fix(cx, 0.08, cz, w - 0.3, 0.16, dpt - 0.3, P.kick);
    qX(Qrail, cx - w / 2 - 0.055, 0.70, cz, dpt, 0.055, -1, [0, 0, dpt, 1]);
    qX(Qrail, cx + w / 2 + 0.055, 0.70, cz, dpt, 0.055, 1, [0, 0, dpt, 1]);
    qZ(Qrail, cx, 0.70, cz - dpt / 2 - 0.055, w, 0.055, -1, [0, 0, w, 1]);
    qZ(Qrail, cx, 0.70, cz + dpt / 2 + 0.055, w, 0.055, 1, [0, 0, w, 1]);
    const bays = Math.max(2, Math.round(w / 1.35));
    for (let m = 0; m < bays; m++) {
      const bw = w / bays;
      const mx = cx - w / 2 + (m + 0.5) * bw;
      const hex = PROD_COLS[(seedIdx * 3 + m) % PROD_COLS.length];
      fix(mx, 0.78, cz, bw - 0.05, 0.09, dpt - 0.14, 0x1f2a1c);  // bin
      // heaped, tightly packed — a real display has no visible liner
      for (let n = 0; n < 190; n++) {
        const u = (rng() - 0.5) * 2, v = (rng() - 0.5) * 2;
        const rad = Math.max(Math.abs(u), Math.abs(v));
        const px = mx + u * (bw / 2 - 0.07);
        const pz = cz + v * (dpt / 2 - 0.13);
        const dome = Math.max(0, 1 - rad * rad);
        const py = 0.82 + dome * 0.17 + rr(rng, -0.02, 0.06);
        const s = rr(rng, 0.070, 0.105);
        col.setHex(hex);
        col.offsetHSL(rr(rng, -0.035, 0.035), rr(rng, -0.12, 0.06), rr(rng, -0.09, 0.09));
        Borb.push(px, py, pz, rng() * 3, rng() * 6.28, 0, s, s * rr(rng, 0.78, 1.06), s, col);
      }
    }
    qUp(Qshadow, cx, 0.006, cz, w + 1.6, dpt + 1.6, FULL);
    solid(cx - w / 2, 0, cz - dpt / 2, cx + w / 2, 0.8, cz + dpt / 2);
  }
  produceTable(prodX0 + 2.6, STORE.maxZ - 3.2, 5.6, 2.0, 0);
  produceTable(prodX0 + 9.2, STORE.maxZ - 3.2, 5.6, 2.0, 1);
  produceTable(prodX0 + 2.6, STORE.maxZ - 6.4, 4.2, 1.7, 2);
  produceTable(prodX0 + 9.2, STORE.maxZ - 6.4, 4.2, 1.7, 3);

  // wet rack against the back wall behind produce
  {
    const wx0 = prodX0 - 0.4, wx1 = STORE.maxX - 1.4, wmid = (wx0 + wx1) / 2, ww = wx1 - wx0;
    const wz = STORE.maxZ - 0.75;
    const B = newPkg();
    fix(wmid, 1.05, wz + 0.30, ww, 2.10, 0.12, P.deckDark);
    fix(wmid, 0.09, wz, ww, 0.18, 0.9, P.kick);
    fix(wmid, 2.22, wz + 0.1, ww, 0.26, 0.7, 0x6f8a3f);
    const RD = [0.42, 0.86, 1.30, 1.74];
    for (let d = 0; d < RD.length; d++) {
      fix(wmid, RD[d] - 0.016, wz + 0.05, ww - 0.1, 0.032, 0.72, 0xfbf6ea);
      fix(wmid, RD[d] - 0.040, wz + 0.05, ww - 0.12, 0.018, 0.70, 0x7d7466);
      railRunX(wz - 0.32, RD[d] - 0.020, wx0 + 0.1, wx1 - 0.1, -1);
      qZ(Qao, wmid, RD[d] + 0.20, wz - 0.316, ww - 0.1, 0.40, -1, AOU.mouth);
      deckAOx(wz - 0.31, RD[d] + 0.0015, -1, 0.68, wx0 + 0.1, wx1 - 0.1);
      for (let bk = 1; bk <= 2; bk++) {
        fillBackRow(B, rng, DEPTS[7], {
          axis: 'x', a0: wx0 + 0.1, a1: wx1 - 0.1,
          lip: wz - 0.31 + bk * 0.18, face: -1, deckY: RD[d], headroom: 0.40,
          depth: 0.18, lit: 0.86 - 0.10 * bk, col,
        });
      }
      fillShelf(B, rng, DEPTS[7], {
        axis: 'x', a0: wx0 + 0.1, a1: wx1 - 0.1, lip: wz - 0.31, face: -1,
        deckY: RD[d], headroom: 0.40, depth: 0.60, lit: 1.0, col,
        pull: d / Math.max(1, RD.length - 1),
        tag: (aStart, aw, kindT) => {
          qZ(Qtag, aStart + aw / 2, RD[d] - 0.021, wz - 0.31 - 0.020, aw, 0.048,
            -1, tagUV(kindT));
        },
      });
    }
    flushPkg(B, 'wetrack');
    qUp(Qshadow, wmid, 0.006, wz, ww, 2.6, FULL);
    solid(wx0, 0, wz - 0.45, wx1, 2.1, wz + 0.45);
  }

  // ---- bulk pallet stacks out on the sales floor --------------------------
  const Bbulk = newPkg();
  function bulkStack(x, z, dept, w, d, layers) {
    fix(x, 0.07, z, w + 0.18, 0.14, d + 0.18, 0x6b5a44);
    const nx = 3, nz = 2, cw = w / nx, cd = d / nz;
    let y = 0.14;
    for (let L = 0; L < layers; L++) {
      const h = rr(rng, 0.19, 0.25);
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        const hsl = pick(rng, dept.colors);
        col.setHSL(hsl[0] / 360, hsl[1] / 100 * 1.05, hsl[2] / 100 * 1.02);
        Bbulk.box.push(x - w / 2 + (a + 0.5) * cw, y + h / 2, z - d / 2 + (b + 0.5) * cd,
          0, rr(rng, -0.03, 0.03), 0, cw * 0.97, h, cd * 0.96, col);
      }
      y += h;
    }
    qUp(Qshadow, x, 0.006, z, w + 1.3, d + 1.3, FULL);
    solid(x - w / 2 - 0.1, 0, z - d / 2 - 0.1, x + w / 2 + 0.1, Math.min(y, 1.3), z + d / 2 + 0.1);
  }
  // parked clear of x = aisleX(i): that centreline is the agents' nav spine
  for (let i = 0; i < AISLE_COUNT; i++) {
    if (i % 3 === 2) continue;
    bulkStack(aisleX(i) + (i % 2 ? 1.35 : -1.35), -HALF - 2.2,
      DEPTS[(i + 4) % DEPTS.length], 1.15, 1.15, ri(rng, 3, 5));
  }
  for (let i = 0; i < AISLE_COUNT; i++) {
    if (i % 3 !== 1) continue;
    bulkStack(aisleX(i) + (i % 2 ? -1.35 : 1.35), HALF + 1.5,
      DEPTS[(i + 2) % DEPTS.length], 1.15, 1.15, ri(rng, 2, 4));
  }
  flushPkg(Bbulk, 'bulk');

  // =========================================================================
  // PARKED CARTS
  // =========================================================================
  function cart(x, z, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (dx, dz) => [x + dx * c - dz * s, z + dx * s + dz * c];
    const put = (dx, y, dz, sx, sy, sz, hex) => {
      const [px, pz] = at(dx, dz);
      col.setHex(hex);
      Bfix.push(px, y, pz, 0, yaw, 0, sx, sy, sz, col);
    };
    // open wire basket: four walls + a floor, never a solid block — from the
    // chase camera a solid box just reads as a crate parked in the aisle
    put(0, 0.60, -0.46, 0.56, 0.40, 0.04, P.cart);
    put(0, 0.66, 0.46, 0.56, 0.28, 0.04, P.cart);
    put(-0.27, 0.60, 0, 0.04, 0.40, 0.92, P.cart);
    put(0.27, 0.60, 0, 0.04, 0.40, 0.92, P.cart);
    put(0, 0.41, 0, 0.54, 0.035, 0.90, P.cart);
    put(0, 0.86, 0.50, 0.56, 0.05, 0.05, 0xd23a2c);
    put(0, 0.63, 0.52, 0.05, 0.46, 0.05, P.cart);
    put(0, 0.19, 0, 0.44, 0.04, 0.70, P.cart);
    for (const [dx, dz] of [[-0.22, -0.36], [0.22, -0.36], [-0.22, 0.36], [0.22, 0.36]]) {
      put(dx, 0.07, dz, 0.09, 0.13, 0.13, 0x3a3d42);
    }
    qUp(Qshadow, x, 0.006, z, 1.5, 1.9, FULL);
    solid(x - 0.42, 0, z - 0.6, x + 0.42, 1.0, z + 0.6);
  }
  for (let k = 0; k < 6; k++) cart(EXIT.x + 2.0 + k * 0.42, STORE.minZ + 2.4, 0.04 * k);
  cart(aisleX(2) + 1.15, -HALF + 3.4, 0.5);
  cart(aisleX(5) - 1.10, HALF - 5.2, -0.8);
  cart(aisleX(6) + 1.20, 2.0, 2.4);
  qUp(Qshadow, sd.x, 0.006, sd.z, 7.6, 3.0, FULL);

  // =========================================================================
  // POWERUP SPOTS — REAL MERCHANDISING, not markers
  // =========================================================================
  // Round 2 shipped these as unlit flat-shaded slabs hovering in front of the
  // shelf faces with no attachment point and no supporting geometry, and the
  // blind critic's very first tell on one image was exactly that. The fix is at
  // the source: every boost is now a piece of store furniture a player learns
  // to recognise — a bakery dump table of donut boxes, or an iced barrel cooler
  // of energy cans — sited so the grabbable item sits ON it.
  //
  // The contract is unchanged: {x, z, kind}. The x values here are the exact
  // positions the chase snaps to (aisle centreline +- TUNING.pickupLip), so the
  // furniture and the pickup point cannot drift apart.
  // NOTE: deliberately NO colliders. These are small, they sit at the very edge
  // of the walkable lane, and a solid body here would put a wall between the
  // cop and the thing he is running for.
  const Bmerch = newPkg();
  const PICKUP_LIP = 1.58;                   // == TUNING.pickupLip

  function headerCard(x, y, z, w) {
    // a wire stem and a printed riser card — what actually labels a display,
    // and what makes a boost findable without an unlit overlay quad
    const y0 = 0.52, y1 = y - 0.16;
    tube(x, (y0 + y1) / 2, z, 0, 0, 0, 0.011, y1 - y0, P.metal);
    fix(x, y, z, w + 0.05, 0.30, 0.035, 0xf3ebd6);
    for (const s of [-1, 1]) {
      qZ(Qpromo, x, y, z + s * 0.026, w, 0.26, s, cellUV((rng() * 4) | 0, 1, 4));
    }
  }

  function donutTable(x, z) {
    const w = 0.62, d = 0.58;
    fix(x, 0.055, z, w + 0.10, 0.11, d + 0.10, 0x3a3630);          // black plinth
    fix(x, 0.30, z, w, 0.38, d, 0xffffff, Bwood);                   // wood body
    fix(x, 0.505, z, w + 0.07, 0.04, d + 0.07, P.woodDark);         // rim
    for (const s of [-1, 1]) {
      qZ(Qrail, x, 0.505, z + s * (d / 2 + 0.041), w, 0.05, s, [0, 0, w, 1]);
      qX(Qrail, x + s * (w / 2 + 0.041), 0.505, z, d, 0.05, s, [0, 0, d, 1]);
    }
    // stacked bakery boxes: white board with a printed band, three columns of
    // two or three, deliberately uneven the way a bakery clerk leaves them
    let top = 0.525;
    for (let cx = -1; cx <= 1; cx++) {
      let y = 0.525;
      const n = ri(rng, 2, 3);
      for (let k = 0; k < n; k++) {
        const h = rr(rng, 0.085, 0.105);
        col.setHSL(rr(rng, 328, 344) / 360, rr(rng, 0.30, 0.62), rr(rng, 0.72, 0.88));
        Bmerch.box.push(x + cx * 0.20 + rr(rng, -0.014, 0.014), y + h / 2, z + rr(rng, -0.03, 0.03),
          0, rr(rng, -0.16, 0.16), 0, 0.19, h, 0.185, col, 4 + ((rng() * 3) | 0) * 8);
        y += h;
      }
      top = Math.max(top, y);
    }
    // one box open on top, and a couple of loose donuts in it
    for (let k = 0; k < 7; k++) {
      col.setHSL(rr(rng, 24, 38) / 360, rr(rng, 0.42, 0.66), rr(rng, 0.45, 0.62));
      Borb.push(x + rr(rng, -0.16, 0.16), top + 0.035, z + rr(rng, -0.14, 0.14),
        Math.PI / 2, rng() * 6.28, 0, 0.052, 0.052, 0.030, col);
    }
    headerCard(x, 1.34, z, 0.46);
    qUp(Qshadow, x, 0.006, z, w + 1.0, d + 1.0, FULL);
  }

  function energyBarrel(x, z) {
    const r = 0.30;
    fix(x, 0.055, z, r * 2 + 0.06, 0.11, r * 2 + 0.06, 0x3a3630);
    drum(x, 0.52, z, r * 2, 0.82, 0xc0392b);                        // painted tub
    drum(x, 0.30, z, r * 2 + 0.012, 0.07, 0x8e2a1e);                // lower hoop
    drum(x, 0.70, z, r * 2 + 0.012, 0.05, 0x8e2a1e);                // upper hoop
    drum(x, 0.90, z, r * 2 + 0.05, 0.07, 0xe8e2d0);                 // rolled rim
    for (const sgn of [-1, 1]) {                                    // printed band
      qZ(Qpromo, x, 0.52, z + sgn * (r + 0.004), r * 1.4, 0.30, sgn,
        cellUV((rng() * 4) | 0, 1, 4));
    }
    fix(x, 0.885, z, r * 1.7, 0.02, r * 1.7, 0x33454e);             // dark interior
    // a heap of ice and slim cans breaking the rim
    for (let k = 0; k < 26; k++) {
      const a = rng() * 6.283, rad = Math.sqrt(rng()) * r * 0.80;
      col.setHSL(rr(rng, 80, 155) / 360, rr(rng, 0.55, 0.85), rr(rng, 0.40, 0.56));
      Bmerch.can.push(x + Math.cos(a) * rad, rr(rng, 0.90, 0.99), z + Math.sin(a) * rad,
        rr(rng, -0.35, 0.35), rng() * 6.28, rr(rng, -0.3, 0.3),
        0.062, rr(rng, 0.14, 0.17), 0.062, col, (rng() * 8) | 0);
    }
    for (let k = 0; k < 20; k++) {
      const a = rng() * 6.283, rad = Math.sqrt(rng()) * r * 0.88;
      col.setHSL(0.55, 0.10, rr(rng, 0.80, 0.95));
      Borb.push(x + Math.cos(a) * rad, rr(rng, 0.89, 0.93), z + Math.sin(a) * rad,
        rng() * 3, rng() * 6.28, 0, 0.036, 0.030, 0.036, col);
    }
    headerCard(x, 1.36, z, 0.42);
    qUp(Qshadow, x, 0.006, z, r * 2 + 1.0, r * 2 + 1.0, FULL);
  }

  const putSpot = (x, z, kind) => {
    powerupSpots.push({ x, z, kind });
    if (kind === 'donuts') donutTable(x, z); else energyBarrel(x, z);
  };

  for (let i = 0; i < AISLE_COUNT; i++) {
    const n = 1 + (i % 2);
    for (let k = 0; k < n; k++) {
      // aisle 0's left side and aisle 7's right side are shallow wall runs, so
      // keep those on the island-gondola side or the display sits in a wall
      let side = (i + k) % 2 ? 1 : -1;
      if (i === 0) side = 1;
      if (i === AISLE_COUNT - 1) side = -1;
      putSpot(aisleX(i) + side * PICKUP_LIP,
        rr(rng, -HALF + 2.4, HALF - 2.4),
        (i + k) % 2 ? 'donuts' : 'energy');
    }
  }
  // FRONT CROSS-AISLE. Most of a chase actually runs along here, not down an
  // aisle, so aisle-only spots left the cop unable to reach a boost in about a
  // quarter of chases. A checkout barrel cooler and a bakery table on the front
  // end are both completely natural placements. Kept clear of the lanes and the
  // exit run so nothing here narrows the walkable route to the doors.
  putSpot(aisleX(1) + PITCH / 2, FRONT_WALK_Z + 0.6, 'energy');
  putSpot(aisleX(4) + PITCH / 2, FRONT_WALK_Z + 0.6, 'donuts');
  putSpot(aisleX(6) + PITCH / 2, FRONT_WALK_Z - 0.9, 'energy');
  flushPkg(Bmerch, 'merch');

  // =========================================================================
  // FLUSH BATCHES + QUAD SOUPS
  // =========================================================================
  for (const [b, n] of [[Bfix, 'fixtures'], [Bwood, 'wood'], [Btube, 'tubes'], [Borb, 'produce'], [Bdrum, 'drums']]) {
    const m = b.build(n); if (m) root.add(m);
  }
  for (const [b, n] of [[BfixC, 'ceilFixtures'], [BtubeC, 'ceilPipes']]) {
    const m = b.build(n); if (m) ceilGroup.add(m);
  }
  { const m = BfixF.build('frontWallTrim'); if (m) frontGroup.add(m); }

  const soup = (Q, mat, name, parent = root) => {
    const g = Q.build(THREE); if (!g) return null;
    const m = new THREE.Mesh(g, mat); m.name = name; m.frustumCulled = false;
    parent.add(m); return m;
  };
  const sharp = (m, b) => PK.sharpen(THREE, m, b);
  soup(Qrail, sharp(new THREE.MeshLambertMaterial({ map: T.rail, color: 0xfffdf4, emissive: 0x2a2620 }), -0.7), 'rails');
  soup(Qslot, sharp(new THREE.MeshLambertMaterial({ map: T.slot, color: 0xf6f0dd }), -0.9), 'uprights');
  soup(Qpeg, sharp(new THREE.MeshLambertMaterial({ map: T.peg, color: 0xf0e9d6 }), -0.9), 'backPanels');
  soup(Qdangle, new THREE.MeshBasicMaterial({
    map: T.dangle, color: 0xeae3d2, side: THREE.DoubleSide,
  }), 'danglers');
  // shelf cavities: dark under the shelf above, clearing toward the deck
  const cavMat = new THREE.MeshBasicMaterial({
    map: T.cavity, transparent: true, depthWrite: false,
  });
  const cv2 = soup(Qcav, cavMat, 'shelfCavities'); if (cv2) cv2.renderOrder = -1;
  // one tag per SKU run — irregular rhythm, keyed to the facing above it
  soup(Qtag, sharp(new THREE.MeshBasicMaterial({ map: T.tag, color: 0xf6f1e4 }), -1.0), 'shelfTags');
  soup(Qsign, new THREE.MeshBasicMaterial({ map: T.sign, color: 0xf2ecdd }), 'aisleSigns');
  soup(Qblade, new THREE.MeshBasicMaterial({ map: T.blade, color: 0xf0ead9 }), 'bladeSigns');
  soup(Qlane, new THREE.MeshBasicMaterial({ map: T.lane, color: 0xfaf4e6 }), 'laneSigns');
  soup(Qpromo, new THREE.MeshBasicMaterial({ map: T.promo, color: 0xfbf3e2 }), 'promoSigns');
  soup(Qwsign, new THREE.MeshBasicMaterial({ map: T.wallSign, color: 0xeee7d6 }), 'wallSigns');
  soup(Qcool, new THREE.MeshBasicMaterial({ map: T.coolerBack, color: 0xffffff }), 'coolerBack');
  soup(Qstrip, sharp(new THREE.MeshBasicMaterial({ map: T.strip, color: 0xffffff }), -0.9), 'lightStrips', ceilGroup);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: T.glow, color: 0x1c1710, transparent: true, opacity: 0.55, depthWrite: false,
  });
  const sm = soup(Qshadow, shadowMat, 'contactShadows'); if (sm) sm.renderOrder = 1;
  const glowMat = new THREE.MeshBasicMaterial({
    // 0.42 blew the near floor to clipped white under every fixture, which
    // DESTROYED the VCT chip detail there — the aisle-6 view lost 7 points of
    // edge density in the bottom band to exactly that. A reflection should
    // brighten the floor, not erase it.
    map: T.glow, transparent: true, opacity: 0.24, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const gm = soup(Qglow, glowMat, 'floorGlow'); if (gm) gm.renderOrder = 2;
  // the polished-floor smear of the gondola run, tinted per streak
  const smearMat = new THREE.MeshBasicMaterial({
    map: T.smear, transparent: true, opacity: 0.30, depthWrite: false,
    vertexColors: true, blending: THREE.AdditiveBlending,
  });
  const sr = soup(Qsmear, smearMat, 'floorSmear'); if (sr) sr.renderOrder = 2;
  // CAVITY AMBIENT OCCLUSION — multiplied over the product, so it has to run
  // after every opaque package and before the glass.
  const aoMat = new THREE.MeshBasicMaterial({
    map: T.ao, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending,
  });
  const ao = soup(Qao, aoMat, 'shelfAO'); if (ao) ao.renderOrder = 3;
  const glassMat = new THREE.MeshBasicMaterial({
    color: 0xcfe4ee, transparent: true, opacity: 0.20, depthWrite: false,
  });
  const gl = soup(Qglass, glassMat, 'coolerGlass'); if (gl) gl.renderOrder = 4;
  const brightMat = new THREE.MeshBasicMaterial({ color: 0xd9e6ee });
  soup(Qbright, brightMat, 'storefront');

  // =========================================================================
  // LIGHTING
  // =========================================================================
  scene.add(new THREE.AmbientLight(0xffeed4, 0.52));
  const hemi = new THREE.HemisphereLight(0xfff8ea, 0x7d7255, 0.92);
  hemi.position.set(0, CEIL_H, 0);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff3e0, 0.82);
  key.position.set(CX + 9, CEIL_H + 7, CZ - 12);
  key.target.position.set(CX, 0, CZ);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = -SW * 0.6; sc.right = SW * 0.6; sc.top = SD * 0.6; sc.bottom = -SD * 0.6;
  sc.near = 1; sc.far = 70; sc.updateProjectionMatrix();
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.26);
  fill.position.set(CX - 12, CEIL_H + 4, CZ + 14);
  scene.add(fill);

  scene.fog = new THREE.Fog(0xe0d5bd, 30, 105);

  return { colliders, powerupSpots };
}
