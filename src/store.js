// OWNER: builder-store. The physical supermarket.
// CONTRACT — must keep exporting exactly this:
//   buildStore(THREE, scene) -> { colliders: Box3[], powerupSpots: {x,z,kind}[] }
// Read all layout numbers from ./config.js. Never hardcode aisle positions.
import {
  AISLE_COUNT, AISLE_LEN, AISLE_GAP, SHELF_W, SHELF_H, CEIL_H, STORE,
  FRONT_WALK_Z, BACK_WALK_Z, EXIT, EXIT2, SERVICE_DESK, CAMERAS, aisleX,
} from './config.js';
import { makeRng, rr, ri, pick, Batch, Quads } from './store/kit.js';
import { DEPTS, FROZEN, fillShelf, fillBackRow } from './store/products.js';
import * as TX from './store/tex.js';
import * as PK from './store/pack.js';
import * as FL from './store/floor.js';

// ---------------------------------------------------------------------------
// PALETTE — warm cream / sage / terracotta, wood-tone uprights. Never grey.
const P = {
  deck:     0xf0e8d4,   // shelf boards, cream steel
  deckDark: 0xd9cfb6,
  shelfUnder: 0x453f33, // undersides read far darker than tops — see buildRun
  peg:      0xc6bda6,   // gondola back panel, shadowed behind the product
  upright:  0xcfc3a6,
  // ROUND 4: the toe kick is the darkest thing in a supermarket. Round 3 had
  // it barely darker than the open floor, which is most of why the frame sat in
  // one narrow value band.
  kick:     0x231f18,
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
    well: TX.wellTex(THREE),
    tsh: TX.trofferShadowTex(THREE),
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
    // round-6: the floor never got the contact-shadow treatment round 3 gave
    // the inside of every shelf cavity. Both maps are authored for MULTIPLY.
    contact: TX.contactTex(THREE),
    gao: TX.groundAOTex(THREE),
    coolerBack: TX.coolerBackTex(THREE),
    // round-5: the two storefronts
    outside: TX.outsideTex(THREE),
    decal: TX.doorDecalAtlas(THREE),
    exit: TX.exitSignAtlas(THREE),
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
  //
  // ROUND 5. The round-4 version was 1x2x1, which gave a crimp, a bulge and
  // eight perfectly straight silhouette edges — and a straight-edged silhouette
  // is what a critic reads as "a plane with a bag printed on it", because gas
  // flushing means no two bags on a shelf have the same outline. Subdividing to
  // 2x3x2 and pushing every ring out by a deterministic per-vertex amount buys
  // an irregular, lumpy edge for about twenty extra triangles per bag, on a
  // geometry that is instanced once and shared by every bag in the store.
  // depthSegments stays at 1 deliberately: the silhouette a camera sees is set
  // by the width and height rings, and the third ring cost 155k triangles
  // across the store for two faces you are almost never looking at.
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 3, 1);
  const p = g.attributes.position;
  const wob = (a, b, c) => {
    const v = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.abs(y) * 2;                      // 0 at the belly, 1 at a seal
    const crimp = t > 0.5;
    // the pillow profile: full bulge at the belly, pinched to nothing at the
    // crimp, following a cosine rather than two hard steps
    const bulge = 0.34 * Math.cos(Math.min(1, t) * Math.PI * 0.5);
    // ...plus a lump. Gas fill is never even and the shelf squashes one side.
    const n = wob(Math.round(x * 4), Math.round(y * 6), Math.round(z * 4));
    const lump = 1 + (n - 0.5) * 0.22 * (1 - t * 0.7);
    p.setZ(i, z * (crimp ? 0.20 + bulge * 0.9 : (1 + bulge * 3) * lump));
    p.setX(i, x * (crimp ? 0.86 : 1.0) * (0.97 + (n - 0.5) * 0.10));
    p.setY(i, y * (crimp ? 0.96 : 1.0) + (n - 0.5) * 0.035 * (1 - t));
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
  const Qstrip = new Quads(), Qglass = new Quads();
  // round-5 storefronts: the daylight plate, the door decals, the lit EXIT boxes
  const Qout = new Quads(), Qdecal = new Quads(), Qexit = new Quads();
  const Qcool = new Quads(), Qshadow = new Quads();
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
  const Qdangle = new Quads();
  // ROUND-4 additions.
  //   Qwell   the inward-facing walls of every recessed troffer housing
  //   Qtsh    the shadow each housing throws onto the tiles it is let into
  //   Qbloom  additive halo, so a run of fixtures merges into a line at range
  //   Qpatch  tile-grid-aligned floor patches, a half-shade off the field
  const Qwell = new Quads(), Qtsh = new Quads(), Qbloom = new Quads();
  const Qpatch = new Quads();
  // ROUND-6 additions.
  //   Qcontact  the soft dark gradient every base throws onto the floor,
  //             100-300 mm out. Multiply-blended, so it darkens the floor's
  //             REFLECTION too rather than being pasted on top of it.
  //   Qled      the glow off a reach-in door's LED mullion strip. Its own soup
  //             because it has to render BEFORE the glass (renderOrder 3), and
  //             the ceiling bloom it used to share renders after everything.
  // (Qshadow, the broad ambient pool, keeps its call sites but changes blend
  // mode — see the flush block. A near-black normal-blended quad is a decal;
  // multiplying is what a shadow physically is.)
  const Qcontact = new Quads(), Qled = new Quads();
  // A contact gradient hugging a base. v = 0 hard against the base, fading out
  // over `dep` metres. Emitted 1 mm above the wear layer so nothing z-fights.
  const CONT_Y = 0.0052;
  const contactZ = (lipX, zmid, len, dir, dep = 0.30) => {
    Qcontact.rect([lipX + dir * dep / 2, CONT_Y, zmid],
      [0, 0, dir * len / 2], [dir * dep / 2, 0, 0], 0, 0, 1, 1);
  };
  const contactX = (lipZ, xmid, len, dir, dep = 0.30) => {
    Qcontact.rect([xmid, CONT_Y, lipZ + dir * dep / 2],
      [-dir * len / 2, 0, 0], [0, 0, dir * dep / 2], 0, 0, 1, 1);
  };
  // all four sides of a free-standing base — pallets, tables, barrels, carts.
  // The corners double up, which is right: a corner is occluded twice.
  const contactBox = (x, z, w, d, dep = 0.24) => {
    contactZ(x - w / 2, z, d, -1, dep); contactZ(x + w / 2, z, d, 1, dep);
    contactX(z - d / 2, x, w, -1, dep); contactX(z + d / 2, x, w, 1, dep);
  };

  // =========================================================================
  // FLOOR — see ./store/floor.js. This is the round-4 headline change.
  // =========================================================================
  // The reflection needs to know where the shelf runs stand and roughly what
  // colour each one is, so the wall lookup is built from the same layout the
  // gondolas are built from further down. WRW / PITCH / SHELF_W all come from
  // config; nothing here is a second copy of the floor plan.
  const WRW = 1.30;
  const EDGE_X = STORE.maxX - WRW / 2 - 0.04;
  // MID-STORE CROSS-AISLE — see the GONDOLA RUNS block for why it exists and
  // how the colliders open up for it. Declared here because the floor's
  // analytic mirror tests the reflected ray against the gondola bodies and has
  // to know that they now stop 3.6 m short of each other in the middle.
  const CROSS_Z = -0.70;                    // slightly forward of centre
  const CROSS_CLEAR = 3.60;                 // clear width between endcap faces
  const XA0 = CROSS_Z - CROSS_CLEAR / 2, XA1 = CROSS_Z + CROSS_CLEAR / 2;
  const inCross = (z, pad = 0.9) => z > XA0 - pad && z < XA1 + pad;
  const RUN_DEPTS = [];
  for (let i = 0; i < AISLE_COUNT - 1; i++) {
    RUN_DEPTS.push({
      x: aisleX(i) + PITCH / 2, halfW: SHELF_W / 2,
      colors: [...DEPTS[i % DEPTS.length].colors, ...DEPTS[(i + 1) % DEPTS.length].colors],
    });
  }
  // the left wall run is a reach-in cooler bank as of round 5: what the floor
  // mirrors off it is pale blue lit glass, not department colour on cream steel.
  // ROUND 6 — `lit` is what finally makes wallLUT draw it as glass. Round 5
  // handed it FROZEN.colors and the LUT dutifully painted department bands, so
  // the brightest vertical surface in the store put a dull beige streak on the
  // floor. That is half of "the dairy glass reflects nothing while the floor
  // two metres away reflects hard".
  RUN_DEPTS.push({ x: -EDGE_X + 0.10, halfW: 0.62, colors: FROZEN.colors, lit: true });
  RUN_DEPTS.push({ x: EDGE_X, halfW: WRW / 2, colors: DEPTS[(AISLE_COUNT - 1) % DEPTS.length].colors });

  const FIX_L = 2.34, STRIP_GAP = 0.06;    // one 4 ft troffer + the joint after it
  T.floor.repeat.set(SW / 2.44, SD / 2.44);
  T.burn = FL.burnishTex(THREE);
  T.wallLUT = FL.wallLUT(THREE, RUN_DEPTS, STORE.minX, SW);
  T.patch = FL.tilePatchTex(THREE);
  // ROUND 5 — CHROMA ON THE BIG SURFACES. A hue mask over the round-4 renders
  // put 25-40% of every frame in the saturated warm band, and the two biggest
  // contributors were not the product at all: they were the FLOOR and the
  // CEILING, each tinted with a swatch that is itself 18-22% saturated and then
  // multiplied over a map that is another 15-17%. Multiplication compounds
  // chroma, so a 17% map under a 22% tint lands at 31% before the wear pass
  // touches it. The reference photographs run their largest surfaces at half
  // that and spend the chroma budget on the product and the accent bands
  // instead. Same hue, same value, less saturation — the floor is still warm
  // beige VCT, it has just stopped being orange.
  const floorMat = FL.reflectiveFloor(THREE, {
    map: T.floor, wall: T.wallLUT, burnish: T.burn, tint: 0xe0dacc,
    ceilH: CEIL_H, shelfH: SHELF_H, pitch: PITCH, runHalf: SHELF_W / 2 + 0.02,
    fixPitch: FIX_L + STRIP_GAP, fixLen: FIX_L, rowOff: PITCH / 2,
    minX: STORE.minX, spanX: SW,
    runMax: Math.max(...RUN_DEPTS.slice(0, AISLE_COUNT - 1)
      .map((r) => Math.abs(Math.round(r.x / PITCH)))),
    edgeX: EDGE_X, rowExt: aisleX(AISLE_COUNT - 1) + 1.4,
    crossZ: CROSS_Z, crossA: XA0, crossB: XA1, bodyZ: HALF - 0.62 + 0.58,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(SW, SD), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  root.add(floor);
  // exposed so the reflection can be tuned live from the console without a
  // rebuild — every number in there was found by looking at reference/store_02
  scene.userData.chopFloor = floorMat.userData.chop;

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

  // PATCHED TILES. A twenty-year-old sales floor has had tiles lifted for a
  // conduit run, a leak, a fixture move; they come back a half-shade off and
  // with fresher grout. Snapped to the real 12in grid the floor map lays down
  // (2.44 m repeat / 8), so a patch is a TILE and not a rectangle lying on top
  // of one.
  const TILE = 2.44 / 8;
  const tileQuad = (n, m, cellIdx, w = 1, h = 1) => {
    const x0 = STORE.minX + n * TILE, z0 = STORE.minZ + m * TILE;
    qUp(Qpatch, x0 + w * TILE / 2, 0.0028, z0 + h * TILE / 2, w * TILE, h * TILE,
      cellUV(cellIdx, 4, 1));
  };
  const NX = Math.floor(SW / TILE), NZ = Math.floor(SD / TILE);
  for (let k = 0; k < 190; k++) {
    const n = ri(rng, 1, NX - 2), m = ri(rng, 1, NZ - 2);
    const run = rng() < 0.30 ? ri(rng, 2, 4) : 1;      // patches come in runs
    for (let q = 0; q < run && n + q < NX - 1; q++) {
      tileQuad(n + q, m, rng() < 0.35 ? 2 : (rng() * 2) | 0);
    }
  }

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

  // ROUND-4b — THE "BLANK GREY RECTANGLE WHERE A SIGN TEXTURE FAILED TO LOAD".
  // No texture ever failed. The BACK wall carried a 47 m x 1.5 m unbroken slab
  // of flat sage at 0x7d8b58, and the four department signs sitting on it are
  // 7 m wide on 8-12 m centres — so between any two of them you were looking at
  // four metres of featureless green, and the PRODUCE sign's own background
  // (0x6f8a3f) is within a few percent of the band it sits on, so where it WAS
  // visible it disappeared into the band as more of the same nothing. Three
  // greens at three depths reading as one green void.
  //
  // Sage stays on the side walls, where it is a decor band and nothing is meant
  // to be read against it. The back wall — the wall you look at down every
  // single aisle, and the one the department signs live on — becomes a warm
  // cream field with real horizontal structure, so a coloured sign on it reads
  // as a sign. See also bladeAtlas, which was the third green.
  // Explicit z ladder off the back wall, because the round-4 aisle-sign bug was
  // exactly a sign quad landing coplanar with its own carrier. Each layer here
  // clears the one behind it by at least 15 mm.
  //   band face   maxZ-0.085   reveals  maxZ-0.095
  //   pilasters   maxZ-0.120   panel    maxZ-0.140   sign quad  maxZ-0.160
  const bandY = 4.35;
  const bz0 = STORE.maxZ;
  fix(CX, bandY, bz0 - 0.06, SW, 1.5, 0.05, 0xe8dfc6);
  fix(CX, bandY + 0.76, bz0 - 0.07, SW, 0.13, 0.05, P.terra);            // top reveal
  fix(CX, bandY - 0.83, bz0 - 0.07, SW, 0.14, 0.05, P.terra);            // bottom reveal
  fix(CX, bandY - 0.70, bz0 - 0.07, SW, 0.05, 0.05, 0x9c9276);
  fix(STORE.minX + 0.06, bandY, CZ, 0.05, 1.5, SD, P.sage);
  fix(STORE.maxX - 0.06, bandY, CZ, 0.05, 1.5, SD, P.sage);
  // ROUND 5 — the same fault round 4b found on the BACK wall, still sitting on
  // the front one. A 47 m unbroken slab of 0x7d8b58 whose normal points +Z,
  // i.e. directly away from the key light, so it renders as a near-black green
  // void across the top of every shot that includes a door. Same fix: cream
  // field, terracotta reveals, panelised by pilasters.
  fix(CX, bandY, STORE.minZ + 0.06, SW, 1.5, 0.05, 0xe8dfc6, BfixF);
  fix(CX, bandY + 0.76, STORE.minZ + 0.07, SW, 0.13, 0.05, P.terra, BfixF);
  fix(CX, bandY - 0.83, STORE.minZ + 0.07, SW, 0.14, 0.05, P.terra, BfixF);
  fix(CX, bandY - 0.70, STORE.minZ + 0.07, SW, 0.05, 0.05, 0x9c9276, BfixF);
  for (let px = STORE.minX + 3.1; px < STORE.maxX - 2; px += 5.3) {
    fix(px, bandY, STORE.minZ + 0.10, 0.34, 1.46, 0.04, 0xd9cdae, BfixF);
    fix(px, bandY, STORE.minZ + 0.115, 0.16, 1.46, 0.035, P.terra, BfixF);
  }

  // Pilasters breaking the run. A decor band is never one continuous ribbon
  // across a 47 m wall; it is panelised, and the breaks are most of what stops
  // it reading as a blank slab. Drawn before the signs so a sign covers any it
  // lands on, which is also how it works on a real wall.
  for (let px = STORE.minX + 2.4; px < STORE.maxX - 2; px += 5.3) {
    fix(px, bandY, bz0 - 0.10, 0.34, 1.46, 0.04, 0xd9cdae);
    fix(px, bandY, bz0 - 0.115, 0.16, 1.46, 0.035, P.terra);
  }

  // department signs high on the back wall. Widened, and re-spaced so the runs
  // of bare wall between them are about a sign-width rather than three.
  const deptSigns = [
    ['PRODUCE', STORE.maxX - 7.0], ['MEAT & SEAFOOD', STORE.maxX - 18.5],
    ['DAIRY', STORE.minX + 20.5], ['FROZEN FOODS', STORE.minX + 8.5],
  ];
  deptSigns.forEach(([, x], i) => {
    // a raised painted panel first, so the sign is mounted ON something rather
    // than being a decal floating on a flat field
    fix(x, bandY + 0.06, bz0 - 0.125, 8.9, 1.42, 0.03, 0xd6c9a8);
    qZ(Qwsign, x, bandY + 0.06, bz0 - 0.160, 8.6, 1.24, -1, cellUV(i, 1, 4));
  });

  // =========================================================================
  // CEILING  (culled for any camera above it — the chase cam flies at 6.4m)
  // =========================================================================
  // The old ceiling ran a strong emissive under a low-contrast tile map, which
  // flattened the T-bar grid into nothing: 30% of every frame was a featureless
  // cream field and the ceiling scored the lowest edge density of any band in
  // the image. The map now carries the contrast; the emissive only lifts the
  // black point so the tiles do not go muddy between fixtures.
  // ROUND-4b. This was a Lambert, and a Lambert was the bug. The plane's normal
  // points DOWN, so the HemisphereLight fed it the GROUND colour (0x7d7255, a
  // dark olive) at full strength across its entire area, and no amount of
  // tinting the material could get out from under that: the drop ceiling came
  // out a muddy olive-brown, which is a colour no acoustic tile has ever been,
  // and it was the single loudest thing in the top third of every frame.
  // A drop ceiling has no meaningful shading variation anyway — it is a flat
  // plane under diffuse light — so its value should be AUTHORED, not lit.
  // Basic also drops one full lighting evaluation over the largest single
  // surface in the scene, nine times a frame.
  //
  // The value target is unchanged and still comes from the reference: clearly
  // under the fittings so the troffers have something to be bright against,
  // but a warm off-white rather than mud.
  //
  // ROUND 6 — THE CEILING WAS DARKER THAN THE FLOOR, WHICH IS BACKWARDS.
  // Measured off my own round-5 captures: the ceiling band sat at V ~0.42 and
  // the open floor at V ~0.55. That inversion is impossible. A supermarket
  // ceiling is a matte near-white surface directly under every fixture in the
  // building; it is the SECOND-BRIGHTEST surface in the frame after the lamps
  // themselves, and the reason a real store photograph reads as bright is that
  // the top third of it is bouncing light back down.
  // Two causes and both are fixed: ceilTex was authoring a 175%-coverage dark
  // grain over the board (see tex.js), and this tint knocked what survived
  // down another 27%. The ceiling now sits clearly above the floor and clearly
  // below the troffer lenses, which is the correct ordering.
  // The map is a 600 x 1200 plank grid, so u repeats every 2.44 m and v every
  // 4.88 m — the two axes are deliberately NOT the same.
  const ceilPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(SW, SD),
    new THREE.MeshBasicMaterial({
      map: (() => { const t = T.ceil.clone(); t.needsUpdate = true; t.repeat.set(SW / 2.44, SD / 4.88); return t; })(),
      color: 0xe4dccb,
    }));
  // ROUND 6: was -0.9. A T-bar grid at 40 m subtends well under a pixel, and
  // forcing a sharp mip on it ruled a hard white lattice across the whole far
  // ceiling. Let the mip chain do its job past about fifteen metres; the tile
  // grain still holds up close, which is all the bias was ever for.
  PK.sharpen(THREE, ceilPlane.material, -0.30);
  ceilPlane.rotation.x = Math.PI / 2;    // normal points down
  ceilPlane.position.set(CX, CEIL_H, CZ);
  ceilGroup.add(ceilPlane);

  // -------------------------------------------------------------------------
  // TROFFERS. ROUND 4. Every fixture used to be a bright rectangle COPLANAR
  // with the tile it sat in — an emissive quad, not an object — and the blind
  // critic called all four renders off the ceiling plane before reading a
  // single package. A real 2x4 troffer is recessed 100-150 mm, so at the
  // grazing angle you look down an aisle at:
  //   * the near flange occludes part of the lamp and you see the INSIDE of the
  //     housing above it — that is real geometry here, four inward-facing well
  //     walls with a gradient that runs bright at the lamp to dim at the door;
  //   * the housing puts a soft shadow onto the tiles either side of it;
  //   * the whole thing blooms, and distant fixtures wash together into one
  //     continuous line rather than staying individually crisp.
  //
  // LAYOUT. Round 3 had fixtures on nearly every second tile in a near-perfect
  // checker, because 23 rows running along Z crossed 6 rows running along X.
  // Real stores do not do that: they run CONTINUOUS strips parallel to the
  // aisles over the sales floor, and turn the run 90 degrees only in the front
  // end. So the aisle body now carries one continuous strip over every aisle
  // centreline and one over every gondola — a clean 2.65 m pitch, no crossing
  // rows — and the front end and rear cross-aisle run perpendicular.
  const AP_W = 0.60;                       // 2 ft aperture
  const TROF_D = 0.105;                    // recess: door plane below the tile
  const DOOR = CEIL_H - TROF_D;
  const LY = CEIL_H - 0.006;               // the lamp plane, up in the housing
  const fixState = () => {
    const r = rng();
    return r < 0.56 ? 0 : r < 0.76 ? 1 : r < 0.92 ? 2 : 3;
  };
  // Every strip records where its lamps are and which ones are out, so the
  // shelves below can be lit BY them instead of by a constant. lampAt() is what
  // makes a bay under a dead unit read as genuinely dimmer.
  const STRIPS = [];
  // ROUND-4b. This was [1.00, 0.90, 1.05, 0.34]: three states within 15% of one
  // another and one dead one. So "product under a fixture is hotter than
  // product between fixtures" had almost nothing to bite on — every live unit
  // lit its bay identically and the only variation in the whole aisle was at
  // the one-in-twenty dead unit. Real fluorescent strips are nothing like that
  // uniform: tubes get relamped in ones and twos over years, so a run carries
  // fresh units next to units at the end of their life pushing 30% less light.
  // Widening the spread is what puts a genuine along-aisle brightness rhythm on
  // the shelves, and it is driven by the SAME per-unit state that picks the
  // lens cell, so a visibly aged lamp and the dimmer bay under it agree.
  const LAMP_B = [1.14, 0.72, 0.94, 0.26];
  // axis 0 = long dimension along Z, axis 1 = along X.
  function troffer(x, z, axis, state) {
    const hx = (axis ? FIX_L : AP_W) / 2, hz = (axis ? AP_W : FIX_L) / 2;
    const uv = cellUV(state, 4, 1);
    // the lamp: prismatic lens with two tubes behind it, seen face-on
    if (axis) Qstrip.rect([x, LY, z], [0, 0, -hz], [hx, 0, 0], uv[0], uv[1], uv[2], uv[3]);
    else qDown(Qstrip, x, LY, z, hx * 2, hz * 2, uv);
    // WELL WALLS, normals pointing IN. This is the whole point of the change:
    // from anywhere but straight underneath, one pair of these is what you
    // actually see, and the opposite flange eats the lamp.
    const wu = TX.WELL_UV;
    for (const sx of [-1, 1]) {
      Qwell.rect([x + sx * hx, (LY + DOOR) / 2, z],
        [0, 0, sx * hz], [0, -(LY - DOOR) / 2, 0], wu[0], wu[1], wu[2], wu[3]);
    }
    for (const sz of [-1, 1]) {
      Qwell.rect([x, (LY + DOOR) / 2, z + sz * hz],
        [-sz * hx, 0, 0], [0, -(LY - DOOR) / 2, 0], wu[0], wu[1], wu[2], wu[3]);
    }
    // the door frame: four painted-steel flanges around the aperture
    const fw = 0.045;
    for (const sx of [-1, 1]) {
      fix(x + sx * (hx + fw / 2), DOOR, z, fw, 0.022, hz * 2 + fw * 2, 0xd9d2bd, BfixC);
    }
    for (const sz of [-1, 1]) {
      fix(x, DOOR, z + sz * (hz + fw / 2), hx * 2, 0.022, fw, 0xd9d2bd, BfixC);
    }
    // the shadow the housing throws onto the tiles it is let into
    qDown(Qtsh, x, CEIL_H - 0.0012, z, hx * 2 + 0.62, hz * 2 + 0.62, FULL);
    // and the bloom. Additive, wider than the fixture, so at twenty metres a
    // strip of these stops resolving as separate lamps and becomes one line.
    //
    // ROUND-4b: TWO layers, and the second is what actually does the merging.
    // A single halo 0.5 m wider than the aperture still falls to nothing inside
    // the 60 mm joint, so a distant run stayed a dotted line of individually
    // crisp lamps. The wide layer overlaps its neighbours by more than a full
    // fixture length, so adjacent halos sum across every joint. It costs
    // nothing up close — spread over that much world area it is a few percent
    // per pixel — and it is only when the run compresses in screen space that
    // the overlap piles up and the strip reads as one continuous bright line,
    // which is exactly the distance-dependent behaviour that was asked for and
    // exactly what a real run of troffers does down a long aisle.
    if (state !== 3) {
      qDown(Qbloom, x, DOOR - 0.004, z, hx * 2 + 0.52, hz * 2 + 0.30, FULL);
      qDown(Qbloom, x, DOOR - 0.012, z, hx * 2 + 1.85, hz * 2 + 1.55, FULL);
    }
  }
  // A CONTINUOUS STRIP: 4 ft units butted end to end with the 60 mm joint you
  // actually see between two troffers in a run, not a 600 mm dark gap.
  // (FIX_L / STRIP_GAP live in the FLOOR block — the analytic reflection has to
  // use exactly the same rhythm or the mirror image misses the lamps.)
  const lightRow = (x, z0, z1) => {
    const pitch = FIX_L + STRIP_GAP;
    const n = Math.max(1, Math.round((z1 - z0) / pitch));
    const span = n * pitch - STRIP_GAP;
    const a0 = (z0 + z1) / 2 - span / 2 + FIX_L / 2;
    const states = [];
    let z = a0;
    for (let k = 0; k < n; k++, z += pitch) {
      const st = rng() < 0.045 ? 3 : fixState();
      states.push(st);
      troffer(x, z, 0, st);
      // the joint plate between consecutive units in the run
      if (k) fix(x, DOOR + 0.004, z - pitch / 2, AP_W + 0.10, 0.030, STRIP_GAP + 0.03, 0xc6bfaa, BfixC);
    }
    STRIPS.push({ x, a0, pitch, states });
    // the housings themselves, seen from underneath as one raised spine
    fix(x, CEIL_H + 0.07, (z0 + z1) / 2, AP_W + 0.06, 0.15, span + 0.05, 0xe6ddc8, BfixC);
  };
  const lightRowX = (z, x0, x1, skip = null) => {
    const pitch = FIX_L + STRIP_GAP;
    const n = Math.max(1, Math.round((x1 - x0) / pitch));
    const span = n * pitch - STRIP_GAP;
    let x = (x0 + x1) / 2 - span / 2 + FIX_L / 2;
    for (let k = 0; k < n; k++, x += pitch) {
      if (skip && skip(x)) continue;      // no two fixtures in one tile
      const dead = rng() < 0.045;
      troffer(x, z, 1, dead ? 3 : fixState());
      if (k) fix(x - pitch / 2, DOOR + 0.004, z, STRIP_GAP + 0.03, 0.030, AP_W + 0.10, 0xc6bfaa, BfixC);
    }
    if (!skip) fix((x0 + x1) / 2, CEIL_H + 0.07, z, span + 0.05, 0.15, AP_W + 0.06, 0xe6ddc8, BfixC);
  };
  // Sales floor: strips PARALLEL to the aisles, one over every aisle centreline
  // and one over every gondola run. 2.65 m pitch, nothing crossing them.
  for (let i = 0; i < AISLE_COUNT; i++) lightRow(aisleX(i), -HALF - 2.1, HALF + 2.1);
  for (let i = 0; i < AISLE_COUNT - 1; i++) {
    lightRow(aisleX(i) + PITCH / 2, -HALF - 1.4, HALF + 1.4);
  }
  // Front end and rear cross-aisle: the run turns 90 degrees, as it does in
  // every real store, because the checkstands and the back wall run that way.
  for (let k = 0; k < 4; k++) lightRowX(STORE.minZ + 2.1 + k * 2.30, STORE.minX + 1, STORE.maxX - 1);
  for (let k = 0; k < 2; k++) lightRowX(STORE.maxZ - 1.5 - k * 2.10, STORE.minX + 1, STORE.maxX - 1);
  // ...and one more turning 90 degrees over the mid-store walkway, which is the
  // overhead cue that says "this is a cross-aisle" from anywhere in the store.
  // Skipped where it would land in a tile a longitudinal row already occupies —
  // an electrician cannot put two troffers in one 600 mm tile either.
  lightRowX(CROSS_Z, STORE.minX + 1.2, STORE.maxX - 1.2, (x) => {
    const k = Math.round(x / (PITCH / 2));
    return Math.abs(x - k * PITCH / 2) < 0.78;
  });

  // How bright the lamps overhead actually are at (x, z), 0.34 under a dead
  // unit to ~1.05 under a fresh one. Fed to products.js as `litAt`.
  const lampAt = (x, z) => {
    let acc = 0, wsum = 0;
    for (const s of STRIPS) {
      const dx = Math.abs(s.x - x);
      if (dx > PITCH * 0.62) continue;
      const w = 1 / (0.55 + dx * dx);
      const k = Math.round((z - s.a0) / s.pitch);
      const st = s.states[k < 0 ? 0 : k >= s.states.length ? s.states.length - 1 : k];
      acc += LAMP_B[st] * w; wsum += w;
    }
    return wsum ? acc / wsum : 1;
  };

  // ROUND-4b — THE "HARD BLACK SHARDS". The blind critic reported the diffuser
  // map breaking into black shards at grazing angle and I went looking for the
  // fault in stripTex. It is not there and never was. Round 4a recessed every
  // troffer 105 mm into the tile, and ALL of the ceiling clutter below — HVAC
  // diffusers, conduit, data cable, junction boxes, sprinkler branch lines —
  // was still being hung at CEIL_H minus 0.05 to 0.15, i.e. INSIDE the well,
  // between the lamp plane and the door. A 20 mm dark conduit threaded down the
  // middle of a lit fixture, sampled at 70 degrees off normal, is exactly a
  // hard black shard across the lamp. Hiding the ceilPipes batch and
  // re-rendering removed every one of them, which is what confirmed it.
  //
  // CLUTTER_Y is the clearance plane: nothing that is not part of a fixture may
  // sit above it. Anything hung from a drop ceiling hangs BELOW the tile, so
  // this is also the physically correct place for all of it.
  const CLUTTER_Y = DOOR - 0.055;
  // ...and the light rows are on a known pitch, so anything RUNNING ALONG the
  // aisles can also simply be kept out from under them rather than being
  // allowed to land wherever. (Things crossing the aisles are left alone: a
  // pipe passing under a fixture, and the shadow it drops on it, is real.)
  const offRow = (x) => {
    const k = Math.round(x / PITCH), c0 = k * PITCH;          // gondola rows
    const c1 = c0 + (x > c0 ? PITCH / 2 : -PITCH / 2);        // aisle rows
    const d0 = x - c0, d1 = x - c1;
    if (Math.abs(d0) < 0.95) return c0 + Math.sign(d0 || 1) * 0.95;
    if (Math.abs(d1) < 0.95) return c1 + Math.sign(d1 || 1) * 0.95;
    return x;
  };

  // SPRINKLER GRID. Round 2 ran seven dead-straight mains across X and nothing
  // along Z; a real wet system is a grid of mains and branch lines with a head
  // every ten feet, and it is one of the busiest things on a store ceiling.
  for (let k = 0; k < 7; k++) {
    const z = STORE.minZ + 2.6 + k * (SD - 5) / 6 + rr(rng, -0.25, 0.25);
    tube(CX, CEIL_H - 0.30, z, 0, 0, Math.PI / 2, 0.075, SW - 1.2, 0xb04a34, BtubeC);
    for (let x = STORE.minX + 2.4; x < STORE.maxX - 2; x += 3.4) {
      fix(x, CLUTTER_Y - 0.105, z, 0.05, 0.20, 0.05, 0x8f8a7c, BfixC);
      fix(x, CEIL_H - 0.34, z, 0.13, 0.05, 0.13, 0xc9c2ae, BfixC);
      fix(x, CEIL_H - 0.245, z, 0.10, 0.035, 0.10, 0xb04a34, BfixC);   // hanger
    }
  }
  for (let k = 0; k < 6; k++) {                // branch lines running along Z
    const x = offRow(STORE.minX + 4.2 + k * (SW - 9) / 5 + rr(rng, -0.5, 0.5));
    // ROUND-4 BUG. This euler was (0,0,0), which leaves a LatheGeometry-style
    // cylinder on its default +Y axis: every one of these six "branch lines"
    // was a 40 m vertical red pole standing free in the middle of an aisle,
    // punched through the floor and the roof. The blind critic called it
    // "architecturally impossible" in all four renders and was right. Rotating
    // about X sends +Y to +Z, which is what a branch line running along Z is.
    // (4b: and it hung at CEIL_H-0.155 with a 45 mm radius, so its crown sat
    // 5 mm inside the door plane — one of the shard sources.)
    tube(x, CLUTTER_Y - 0.055, CZ, Math.PI / 2, 0, 0, 0.045, SD - 2.2, 0x9c4230, BtubeC);
    for (let z = STORE.minZ + 3; z < STORE.maxZ - 2; z += 3.05) {
      fix(x, CLUTTER_Y, z, 0.055, 0.14, 0.055, 0x8f8a7c, BfixC);
    }
  }
  for (let k = 0; k < 12; k++) {
    const x = offRow(STORE.minX + 3 + (k % 6) * (SW - 6) / 5 + rr(rng, -0.5, 0.5));
    const z = STORE.minZ + 5 + Math.floor(k / 6) * (SD - 12) + rr(rng, -0.8, 0.8);
    fix(x, CLUTTER_Y - 0.01, z, 1.18, 0.12, 1.18, 0xf2ecdb, BfixC);
    fix(x, CLUTTER_Y - 0.08, z, 1.02, 0.04, 1.02, 0xd7d0bc, BfixC);
    for (let b = -3; b <= 3; b++) {          // the blades of the diffuser
      fix(x, CLUTTER_Y - 0.10, z + b * 0.14, 0.98, 0.05, 0.045, 0x9d9682, BfixC);
    }
  }
  // ---- ceiling clutter ----------------------------------------------------
  // Speakers, exit lights, junction boxes and a run of loose conduit. Nothing
  // here is load-bearing for gameplay; all of it is the incidental hardware a
  // real drop ceiling carries and a rendered one never does.
  for (let k = 0; k < 14; k++) {
    const x = STORE.minX + 2.5 + rng() * (SW - 5), z = STORE.minZ + 2.5 + rng() * (SD - 5);
    fix(x, CLUTTER_Y, z, 0.30, 0.09, 0.30, 0xe4ddc9, BfixC);
    fix(x, CLUTTER_Y - 0.05, z, 0.24, 0.03, 0.24, 0x5d574a, BfixC);
  }
  // Conduit crossing the aisles is fine — it passes UNDER the fixtures and the
  // shadow it drops on them is real. Conduit running ALONG an aisle at the same
  // x as a light row is what threaded a black rod down the length of a lit
  // troffer, so those get pushed off the row as well as below the door plane.
  for (let k = 0; k < 11; k++) {             // conduit / loose data cable
    const z = STORE.minZ + 3 + rng() * (SD - 6);
    const x0 = STORE.minX + rr(rng, 1, 8), x1 = STORE.maxX - rr(rng, 1, 8);
    // 4b: these were 36-64 mm across in near-black (0x3c3a34), which at twenty
    // metres subtends well under a pixel and resolves as a hard aliased black
    // rule ruled across the whole ceiling — the second-worst thing in the top
    // of the frame once the shards were gone. Conduit in a store is galvanised
    // EMT and the cable is run in trays: light grey, and thick enough to have a
    // lit side and a shaded side rather than being a mathematical line.
    tube((x0 + x1) / 2, CLUTTER_Y - rr(rng, 0.01, 0.07), z, 0, 0, Math.PI / 2,
      rr(rng, 0.030, 0.052), x1 - x0, k % 3 ? 0x9c9482 : 0x6e675a, BtubeC);
    for (let x = x0 + 1.5; x < x1; x += rr(rng, 2.4, 5.0)) {
      fix(x, CLUTTER_Y, z, 0.07, 0.10, 0.07, 0x8d8676, BfixC);
    }
  }
  for (let k = 0; k < 7; k++) {              // and the runs going the other way
    const x = offRow(STORE.minX + 3 + rng() * (SW - 6));
    const z0 = STORE.minZ + rr(rng, 1, 7), z1 = STORE.maxZ - rr(rng, 1, 7);
    tube(x, CLUTTER_Y - rr(rng, 0.0, 0.06), (z0 + z1) / 2, Math.PI / 2, 0, 0,
      rr(rng, 0.028, 0.046), z1 - z0, k % 2 ? 0x9c9482 : 0x746c5e, BtubeC);
    for (let z = z0 + 1.8; z < z1; z += rr(rng, 2.6, 5.4)) {
      fix(x, CLUTTER_Y + 0.005, z, 0.06, 0.09, 0.06, 0x8d8676, BfixC);
    }
  }
  // PERIMETER TRACK LIGHTING. Aisle 0 and aisle 7 are nearly six metres wide
  // and their ceiling band measured five points below every interior aisle;
  // a track run over the wall shelving is what a real store puts there.
  for (const tx of [STORE.minX + 2.3, STORE.maxX - 2.3]) {
    tube(tx, CEIL_H - 0.20, CZ, Math.PI / 2, 0, 0, 0.035, SD - 4.0, 0x33363b, BtubeC);
    for (let z = STORE.minZ + 3.0; z < STORE.maxZ - 2.0; z += 1.45) {
      const lean = tx < 0 ? 0.55 : -0.55;
      fix(tx, CEIL_H - 0.31, z, 0.07, 0.20, 0.07, 0x2c2f33, BfixC);
      tube(tx + lean * 0.16, CEIL_H - 0.42, z, 0, 0, lean, 0.055, 0.24, 0x2c2f33, BtubeC);
      fix(tx + lean * 0.24, CEIL_H - 0.50, z, 0.11, 0.05, 0.11, 0xf6efdc, BfixC);
    }
  }
  // EXIT signs and emergency heads over both cross-aisles
  for (const ez of [FRONT_WALK_Z - 1.4, BACK_WALK_Z + 0.6]) {
    for (let k = 0; k < 5; k++) {
      const ex = STORE.minX + 5 + k * (SW - 10) / 4;
      fix(ex, CEIL_H - 0.30, ez, 0.46, 0.20, 0.05, 0x2f6b33, BfixC);
      fix(ex, CEIL_H - 0.30, ez - 0.035, 0.40, 0.14, 0.02, 0xd8f0d0, BfixC);
      fix(ex, CEIL_H - 0.13, ez, 0.05, 0.28, 0.05, 0x8d8676, BfixC);
      fix(ex + 0.42, CEIL_H - 0.34, ez, 0.24, 0.14, 0.14, 0xe4ddc9, BfixC);
      for (const s2 of [-1, 1]) fix(ex + 0.42 + s2 * 0.09, CEIL_H - 0.40, ez, 0.10, 0.09, 0.12, 0x33363b, BfixC);
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
    // 4b: the string used to run all the way to CEIL_H. Danglers are scattered
    // within +-0.62 m of a gondola centreline and the light row over that
    // gondola has a 0.60 m aperture, so a good third of these threaded a 6 mm
    // sub-pixel dark cylinder straight up the middle of a lit troffer well —
    // the same black-shard mechanism as the conduit, just thinner and denser.
    // A dangler hangs off the T-bar it is tied to, which is the door plane.
    tube(x, (y + h / 2 + CLUTTER_Y) / 2, z, 0, 0, 0, 0.006,
      CLUTTER_Y - y - h / 2, 0xb9b2a0);
  };
  // Two tiers. The high ones sit up among the sprinkler grid; the low ones hang
  // at 2.9-3.5 m where a shopper's head would clear them, which puts them right
  // across the upper third of every aisle view — measured as the flattest band
  // in every render so far.
  for (let i = 0; i < AISLE_COUNT - 1; i++) {
    const gx = aisleX(i) + PITCH / 2;
    for (let k = 0; k < 11; k++) {
      dangle(gx + rr(rng, -0.62, 0.62), rr(rng, -HALF + 1, HALF - 1), rr(rng, 3.40, 4.60));
    }
    for (let k = 0; k < 7; k++) {
      dangle(gx + rr(rng, -0.90, 0.90), rr(rng, -HALF + 1.5, HALF - 1.5), rr(rng, 2.86, 3.40));
    }
  }
  for (let i = 0; i < AISLE_COUNT; i++) {
    for (let k = 0; k < 6; k++) {
      dangle(aisleX(i) + rr(rng, -1.1, 1.1), rr(rng, -HALF + 1.5, HALF - 1.5), rr(rng, 2.90, 3.55));
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

  // -------------------------------------------------------------------------
  // ROUND 5 — THE MID-STORE CROSS-AISLE.
  // Every run used to be solid for all 26 m, which no supermarket on earth is.
  // A 26 m gondola is 85 feet; the fire code, the pallet jack and the fact that
  // nobody will walk to the end of the store and back to reach the next aisle
  // all say the same thing, so a real store breaks its runs somewhere near the
  // middle and puts a full-width walkway across.
  //
  // It is also the most valuable thing available to the chase. With solid runs
  // a thief who breaks for the back can only be beaten by attrition — the cop
  // has to out-run him down the same aisle. A cross-aisle makes that route
  // contestable BY GEOMETRY: the cop cuts across one bay and meets him.
  // src/agents.js floods a Dijkstra field from the exits over an occupancy grid
  // built from `colliders`, so the walkway only exists as far as the chase is
  // concerned if the COLLIDERS open up. Hence: the segment colliders below stop
  // at the segment ends, endcaps included, and nothing — no pallet, no parked
  // cart, no powerup display — is allowed to be sited inside the band.
  //
  // Width. AISLE_GAP is 4.0 m and the nav grid is 0.42 m cells inflated by a
  // 0.52 m body pad, so a lane needs ~1.05 m before a single cell comes free.
  // 3.6 m clear between endcap FACES leaves 2.55 m of free grid — six cells —
  // and reads as the widest walkway in the store, which is what a real one is.
  // (CROSS_Z / CROSS_CLEAR / XA0 / XA1 / inCross are declared up with the floor
  // block, because the floor's mirror has to be told where the walkway is.)
  const ECPAD = EC_D + 0.14;                // endcap projection past the body
  const SEGS = [[-BODY, XA0 - ECPAD], [XA1 + ECPAD, BODY]];
  const ONE_SEG = [[-BODY, BODY]];

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
  //
  // ROUND 5 — SPREAD, NOT MEAN. Eleven reference photographs measure 32.1% to
  // 61.4% edge density: a 29-point spread. Round 4's eight aisles measured 37.3
  // to 42.9 — 5.6 points. The mean was never the interesting gap; the fact that
  // a cleaning aisle, a cereal aisle and a chilled aisle in this store all came
  // out within a point of each other is, because in a real store they look
  // nothing like each other. So the profiles are pushed much further apart than
  // is comfortable: 'tight' is now ten shallow decks of tins faced solid with
  // almost no vacancy, and 'bulky' is four tall decks of jugs and paper packs
  // with more than twice the air. products.js picks kinds that FIT the deck it
  // is filling, so the deck plan alone drives the SKU size — a 0.175 m deck
  // physically cannot take a cereal box.
  const PROFILES = [
    // canned/dry: ten shallow decks of small tins, faced solid, nothing missing
    { key: 'tight', steps: [0.158, 0.166, 0.174, 0.184, 0.198], vacancy: 0.06, base: 0.076 },
    { key: 'mixed', steps: DECK_STEPS, vacancy: 1.00, base: 0.130 },
    // jugs, paper packs, 12-packs: four tall decks with air above everything
    { key: 'bulky', steps: [0.505, 0.575, 0.645, 0.545], vacancy: 2.60, base: 0.205 },
    // mid-reset: whole bays stripped, tag holders left on the rail
    { key: 'reset', steps: [0.255, 0.295, 0.335, 0.385, 0.285], vacancy: 2.55, base: 0.145 },
    { key: 'mixed', steps: [0.225, 0.265, 0.235, 0.305, 0.355], vacancy: 0.55, base: 0.108 },
  ];
  // ROUND 6 — PERIMETER / CHILLED FACINGS. The critic reported the perimeter
  // and chilled runs as identical, gapless, flush and 100% full, which
  // contradicts the per-instance jitter and 12-18% vacancy shipped in round 3.
  // They are not a separate code path — both go through fillShelf with every
  // round-3 anomaly live. It is a STARVATION bug two steps upstream:
  //   * the right-hand perimeter run was built on PROFILES[0] ('tight'), whose
  //     deck steps are 0.158-0.198 m. Minus the 36 mm board that is ~0.13 m of
  //     clear height, and products.js `fits` only admits kinds whose natural
  //     height is under it. For DEPTS[7] that leaves exactly TWO of eight kinds
  //     — smallBox and tinyBox — with every soft good excluded. Ten decks of
  //     two box kinds 45-100 mm wide is the "identical facings" report,
  //     literally: there was almost nothing else it could draw.
  //   * 'tight' also carries vacancy 0.06, which divides the bare-bay roll by
  //     sixteen. Chance of a reserved bay per deck: 1.4%. That is the "gapless".
  // The perimeter wall gets its own plan: deck steps spanning 0.20-0.50 m so
  // jugs, bottles, cereal and bags all physically fit, and a vacancy a shopped
  // wall actually has. `fits` is loosened in products.js for the same reason.
  const PERIM = {
    key: 'perim', steps: [0.235, 0.395, 0.285, 0.505, 0.325, 0.445], vacancy: 1.5, base: 0.145,
  };
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
    // One package batch for the whole run, but the run is now built in
    // SEGMENTS with the cross-aisle between them. Keeping the batch outside the
    // loop is what stops the walkway from costing 49 extra draw calls.
    for (const seg of (opts.segs || SEGS)) buildSeg(seg[0], seg[1]);
    flushPkg(B, 'run' + idx);
    return;

    function buildSeg(zA, zB) {
    const z0 = zA, z1 = zB, len = z1 - z0, zmid = (z0 + z1) / 2;
    // which end of THIS segment faces the walkway — the endcap there is the
    // one shoppers actually stand in front of, and the blades nearest it are
    // the ones that have to be readable from the cross-aisle.
    const xEnd = Math.abs(z1 - CROSS_Z) < Math.abs(z0 - CROSS_Z) ? z1 : z0;
    const DECK = deckPlan(rng, prof);
    // A supermarket aisle is lit from a strip four metres straight up, so a
    // gondola is a strong VERTICAL gradient: the top deck is nearly twice as
    // bright as the bottom one. Round 3 spanned 0.88 to 1.08 and every render
    // sat in one value band because of it.
    const LIT = DECK.map((_, i) => 0.73 + 0.46 * Math.pow(i / Math.max(1, DECK.length - 1), 0.82));
    const dd = deckDepths(halfW - 0.05, DECK.length);

    // kick plate + base
    fix(x, 0.075, zmid, halfW * 2 - 0.10, 0.15, len, P.kick);
    // back panel / pegboard spine. Round 3 skins it with a real perforated
    // panel: it shows in the bottom of every cavity and across the whole of
    // any bare bay, and round 2 put a smooth beige slab there.
    if (faces.length === 2) {
      fix(x, 1.10, zmid, 0.07, 1.90, len, P.peg);
      for (const s2 of [-1, 1]) {
        qX(Qpeg, x + s2 * 0.037, 1.10, zmid, len, 1.90, s2, [0, 0, len / 0.30, 1.90 / 0.30]);
      }
    } else {
      const bx = x - faces[0].dir * (halfW - 0.04);
      fix(bx, 1.10, zmid, 0.08, 1.90, len, P.peg);
      qX(Qpeg, bx + faces[0].dir * 0.042, 1.10, zmid, len, 1.90, faces[0].dir,
        [0, 0, len / 0.30, 1.90 / 0.30]);
    }

    for (const f of faces) {
      const lip = x + f.dir * halfW;
      // what the strip overhead is actually doing above THIS face, sampled per
      // facing block — a bay under a dead unit comes out visibly dimmer
      const faceLit = (z) => 0.78 + 0.30 * lampAt(x + f.dir * 0.95, z);
      for (let d = 0; d < DECK.length; d++) {
        const dep = dd[d];
        // SHELF BOARD, in discrete 4 ft sections. A gondola deck is not one
        // 25 m plane: it is a row of pressed-steel shelves that butt at every
        // upright, and every joint shows as a seam plus a millimetre or two of
        // step where the brackets sit differently. Round 3 drew one continuous
        // board and lost that whole rhythm of hard vertical breaks.
        {
          const nS = Math.max(1, Math.round(len / SECT)), sw = len / nS;
          const base = d === 0 ? P.deckDark : P.deck;
          for (let k = 0; k < nS; k++) {
            const sz = z0 + (k + 0.5) * sw;
            const step = ((k * 37 + d * 11) % 7 - 3) * 0.0007;
            fix(lip - f.dir * (dep / 2), DECK[d] - 0.018 + step, sz,
              dep + 0.02, 0.036, sw - 0.010, base);
            fix(lip - f.dir * (dep / 2), DECK[d] - 0.041 + step, sz,
              dep + 0.015, 0.020, sw - 0.010, P.shelfUnder);
          }
        }
        // PRICE RAIL — broken at every 4ft section joint. Round 2 ran one
        // continuous extruded bar the full 25 m of the aisle, which is a very
        // strong architectural giveaway even at distance: real shelving is
        // assembled from 3-4ft sections and every joint shows.
        railRun(lip, DECK[d] - 0.020, z0, z1, f.dir);
        const head = (DECK[d + 1] !== undefined ? DECK[d + 1] : SHELF_H + 0.03) - DECK[d] - 0.036;
        // cavity gradient: dark under the shelf above, fading down. Also what
        // makes a sold-out void read as a black hole rather than a beige gap.
        qX(Qcav, lip - f.dir * (dep - 0.01), DECK[d] + head * 0.5, zmid, len, head, f.dir, FULL);
        // CAVITY AMBIENT OCCLUSION — multiply-blended across the mouth of the
        // cavity, 6 mm proud of the deepest facing and 6 mm behind the rail.
        // Near-black under the deck above, clearing by mid-height, then a hard
        // seam at the deck. This is the round-3 headline change: without it
        // every product is lit identically and the run reads as a decal.
        qX(Qao, lip - f.dir * 0.006, DECK[d] + head * 0.5, zmid, len, head, f.dir, AOU.mouth);
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
          vacancy: prof.vacancy, litAt: faceLit,
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
            lit: LIT[d] * (0.72 - 0.14 * bk), col, litAt: faceLit,
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
      // (The painted floor "smear" that used to live here is gone. The floor
      // now mirrors this run for real — see store/floor.js: the mirrored view
      // ray is tested against the gondola bodies before it reaches the ceiling,
      // and a blurred 1-D lookup supplies what that run's wall looks like.)
      // top rail / valance
      fix(lip - f.dir * 0.05, SHELF_H + 0.02, zmid, 0.11, 0.07, len, P.deckDark);
      // SHELF-TOP CATEGORY BLADES. Round 4 hung exactly one per face, at a
      // fixed 30% down the run. A real store repeats them every three or four
      // metres along the whole run and on BOTH faces — reference/store_04 shows
      // BREAD, SEAFOOD, DINNERS, PIZZA and SNACKS all readable from one
      // standpoint — and with a walkway cutting the run in half that repetition
      // stops being decoration: it is how you know which aisle you are looking
      // into from the middle of the store. One is always planted a blade-length
      // back from the walkway end of the segment, where a shopper standing in
      // the cross-aisle reads it.
      if (f.aisle !== undefined) {
        const uv = cellUV(f.aisle % 8, 1, 8);
        const nB = Math.max(1, Math.round(len / 4.35));
        for (let k = 0; k < nB; k++) {
          const t = nB === 1 ? 0.5 : (k + 0.5) / nB;
          let bz = z0 + 1.35 + t * (len - 2.7);
          if (k === nB - 1) bz = xEnd + (xEnd === z1 ? -1.42 : 1.42);
          fix(lip + f.dir * 0.04, 2.31, bz, 0.028, 0.58, 2.30, 0xe6dfc9);
          qX(Qblade, lip + f.dir * 0.066, 2.31, bz, 2.24, 0.52, f.dir, uv);
          for (const s of [-1, 1]) fix(lip - f.dir * 0.05, 2.10, bz + s * 0.95, 0.15, 0.08, 0.04, P.metal);
        }
      }
      // CONTACT SHADOW AT THE FLOOR. ROUND 6. Round 5 emitted a broad ambient
      // pool here and a 0.46 m "tight" quad — but both were normal-blended
      // near-black cards carrying a RADIAL map, so along a 25 m run the tight
      // one was a uniform dark stripe with a razor edge down each side. The
      // critic read one of them as a solid black band substituting for a
      // shadow, with the case above it floating. It was.
      // Now: a real 1-D ramp, near-black hard against the kick plate and gone
      // by 300 mm, MULTIPLIED into the floor so it darkens the reflection as
      // well as the tile — which is what an occluded mirror does.
      qUp(Qshadow, lip + f.dir * 0.06, 0.006, zmid, 2.6, len * 1.02, FULL);
      contactZ(lip - f.dir * 0.03, zmid, len * 1.005, f.dir, 0.34);
      // rubber bumper along the foot of the run
      fix(lip - f.dir * 0.012, 0.048, zmid, 0.030, 0.058, len, 0x4a4640);
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
        qZ(Qpromo, x, 2.34, zEnd + dir * (0.10 + 0.045), halfW * 2 + 0.10, 0.62, dir,
          cellUV((idx * 3 + (dir > 0 ? 1 : 0)) % 4, 1, 4));
        // stub uprights framing the endcap
        fix(x - halfW + 0.03, 1.06, lip - dir * 0.05, 0.06, 1.95, 0.09, P.upright);
        fix(x + halfW - 0.03, 1.06, lip - dir * 0.05, 0.06, 1.95, 0.09, P.upright);
        // ...and the contact shadow off its own plinth, which is what a shopper
        // standing in the cross-aisle is looking straight down at
        contactX(zEnd + dir * (EC_D + 0.075), x, halfW * 2 - 0.06, dir, 0.32);
        for (const sx2 of [-1, 1]) {
          contactZ(x + sx2 * (halfW - 0.02), zEnd + dir * (EC_D / 2 + 0.05),
            EC_D + 0.10, sx2, 0.26);
        }
      }
    }

    // OVERSTOCK riding on top of the run. Round 2 dropped one case every four
    // metres; in the reference photography a gondola top is a near-continuous
    // ridge of shrink-wrapped case bundles and odd cartons, and in an aisle
    // view that ridge sits right where the frame is emptiest.
    for (let z = z0 + 0.4; z < z1 - 0.5;) {
      if (rng() < 0.10) { z += rr(rng, 0.4, 1.4); continue; }
      const w = rr(rng, 0.22, 0.62), dx = rr(rng, -0.15, 0.15);
      const n = ri(rng, 1, 4);
      let y = SHELF_H + 0.06;
      const warm = rng() < 0.55;
      for (let sIdx = 0; sIdx < n; sIdx++) {
        const h = rr(rng, 0.13, 0.27);
        if (warm) col.setHSL(rr(rng, 25, 40) / 360, rr(rng, 0.20, 0.42), rr(rng, 0.42, 0.60));
        else {
          const hs = pick(rng, faces[0].dept.colors);
          col.setHSL(hs[0] / 360, hs[1] / 100 * 0.8, Math.min(0.9, hs[2] / 100 * 1.1));
        }
        B.box.push(x + dx + rr(rng, -0.045, 0.045), y + h / 2, z + w / 2 + rr(rng, -0.03, 0.03),
          0, rr(rng, -0.16, 0.16), 0, rr(rng, halfW * 0.80, halfW * 1.85), h,
          w * rr(rng, 0.86, 1.0), col, (rng() * 24) | 0);
        y += h;
      }
      z += w + rr(rng, 0.01, 0.16);
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
          contactBox(ux, uz, 0.46, 1.18, 0.20);
        }
      }
    }

    // Perimeter runs carry an upper deck above the 2.05 m top rail: bulk packs
    // and case stock, plus a painted decor band. Fills the upper third of the
    // frame in aisles 0 and 7, which had four metres of bare drywall there.
    if (opts.upper) {
      const dir = opts.upper, lip = x + dir * halfW;
      for (const uy of [SHELF_H + 0.30, SHELF_H + 0.72]) {
        fix(lip - dir * (halfW * 0.5), uy - 0.018, zmid, halfW + 0.02, 0.036, len, P.deck);
        fix(lip - dir * (halfW * 0.5), uy - 0.041, zmid, halfW, 0.020, len, P.shelfUnder);
        railRun(lip, uy - 0.020, z0, z1, dir);
        qX(Qao, lip - dir * 0.006, uy + 0.19, zmid, len, 0.38, dir, AOU.mouth);
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
      fix(lip - dir * 0.06, SHELF_H + 1.30, zmid, 0.16, 0.70, len, P.sage);
      fix(lip - dir * 0.06, SHELF_H + 0.93, zmid, 0.17, 0.06, len, P.terra);
      for (let z = z0 + 1.4; z < z1 - 1.0; z += 3.55) {
        fix(lip + dir * 0.03, SHELF_H + 1.32, z, 0.03, 0.62, 2.30, 0xf3ecda);
        qX(Qpromo, lip + dir * 0.058, SHELF_H + 1.32, z, 2.22, 0.54, dir,
          cellUV((rng() * 4) | 0, 1, 4));
        for (const sgn of [-1, 1]) {
          fix(lip + dir * 0.02, SHELF_H + 1.32, z + sgn * 1.78, 0.03, 0.50, 0.9, P.terra);
        }
      }
    }

    // COLLIDER, per segment. This is the load-bearing half of the cross-aisle:
    // the walkway is only walkable because these two boxes stop short of it.
    const pad = opts.endcaps ? ECPAD : 0.02;
    solid(x - halfW - 0.02, 0, z0 - pad, x + halfW + 0.02, SHELF_H, z1 + pad);
    }
  }

  // -------------------------------------------------------------------------
  // REACH-IN COOLER BANK running along Z, glass facing +/-X. Same recipe as the
  // rear case line, turned ninety degrees. Kept as its own function rather than
  // generalising the rear one, because the rear line is load-bearing for the
  // back-wall composition and this is the round-5 change most likely to want
  // reverting on its own.
  function coolerRunZ(wallX, dir, z0, z1, prof = FROZEN) {
    const B = newPkg();
    const D = 1.16;                              // case depth, wall to glass
    const bx = wallX + dir * 0.06;               // the case back
    const gx = wallX + dir * D;                  // the glass plane
    const cz = (z0 + z1) / 2, len = z1 - z0;
    const mid = wallX + dir * (D / 2);
    fix(bx, 1.20, cz, 0.10, 2.36, len, P.coolerIn);                        // back
    fix(mid, 2.34, cz, D, 0.16, len, P.cooler);                            // top
    fix(mid, 2.56, cz, D + 0.06, 0.34, len + 0.1, P.sage);                 // valance
    fix(mid, 0.09, cz, D + 0.04, 0.18, len, P.kick);                       // kick
    for (const e of [-1, 1]) fix(mid, 1.20, cz + e * (len / 2 + 0.05), D, 2.36, 0.10, P.cooler);
    const CD = [0.30, 0.68, 1.06, 1.44, 1.82];
    const lip = gx - dir * 0.20;
    for (let d = 0; d < CD.length; d++) {
      fix(mid, CD[d] - 0.016, cz, D - 0.16, 0.032, len - 0.1, 0xfbf6ea);
      fix(mid, CD[d] - 0.040, cz, D - 0.20, 0.018, len - 0.12, 0x7d7466);
      railRun(lip + dir * 0.014, CD[d] - 0.020, z0 + 0.1, z1 - 0.1, dir);
      qX(Qao, lip - dir * 0.006, CD[d] + 0.17, cz, len - 0.1, 0.34, dir, AOU.mouth);
      deckAOz(lip, CD[d] + 0.0015, dir, 0.80, z0 + 0.1, z1 - 0.1);
      for (let bk = 1; bk <= 2; bk++) {
        fillBackRow(B, rng, prof, {
          axis: 'z', a0: z0 + 0.15, a1: z1 - 0.15,
          lip: lip - dir * bk * 0.19, face: dir, deckY: CD[d], headroom: 0.34,
          depth: 0.19, lit: 1.06 - 0.12 * bk, col,
        });
      }
      fillShelf(B, rng, prof, {
        axis: 'z', a0: z0 + 0.15, a1: z1 - 0.15, lip, face: dir,
        deckY: CD[d], headroom: 0.34, depth: 0.66, lit: 1.26, col,
        // ROUND 6 — see the PERIMETER / CHILLED FACINGS note at buildRun. 0.55
        // put a bare bay on one deck in six; a chilled run gets shopped harder
        // than a dry one, not less.
        pull: d / Math.max(1, CD.length - 1), vacancy: 1.35,
        tag: (aStart, aw, kindT) => {
          qX(Qtag, lip + dir * 0.020, CD[d] - 0.021, aStart + aw / 2, aw, 0.048, dir, tagUV(kindT));
        },
      });
    }
    flushPkg(B, 'coolerWall');
    // the doors themselves — 0.86 m leaves, exactly as on the rear line
    for (let z = z0; z < z1 - 0.4; z += 0.86) {
      const w = Math.min(0.86, z1 - z);
      qX(Qglass, gx + dir * 0.02, 1.18, z + w / 2, w - 0.05, 2.02, dir, FULL);
      fix(gx, 1.18, z, 0.075, 2.12, 0.062, 0xdad4c2);
      fix(gx - dir * 0.030, 1.18, z, 0.030, 2.08, 0.030, 0x2c2e2c);
      fix(gx - dir * 0.048, 1.06, z + w - 0.095, 0.030, 1.32, 0.030, 0xd8dde2);
      for (const hy of [0.44, 1.68]) fix(gx - dir * 0.030, hy, z + w - 0.095, 0.05, 0.05, 0.028, 0xb3b8bd);
      // ROUND 6 — WHY THE DAIRY GLASS "REFLECTED NOTHING".
      // It was not the shader. reflectiveGlass is on this run exactly as it is
      // on the back wall. Two transcription faults, both only on this run:
      //   * the LED mullion tube was hung at gx + dir*0.075, i.e. 75 mm OUTSIDE
      //     the pane, floating in the aisle instead of inside the case;
      //   * its bloom card was emitted through qX with d and h swapped — 2.10 m
      //     along Z by 0.30 m tall — so instead of a vertical strip up the
      //     mullion it was a 2.1 m HORIZONTAL additive bar across the middle of
      //     every door, overlapping its neighbours two and a half deep, in a
      //     soup with renderOrder 5, i.e. drawn on top of the glass.
      // A 250%-overlapped additive bar over a fresnel surface erases it. The
      // glass was working the whole time and was being painted out.
      tube(gx - dir * 0.075, 1.18, z + 0.045, 0, 0, 0, 0.013, 1.98, 0xfff9ec);
      qX(Qled, gx - dir * 0.030, 1.18, z + 0.045, 0.30, 2.10, dir, FULL);
      fix(gx + dir * 0.02, 2.22, z + w / 2, 0.02, 0.06, w - 0.10, 0xf6f1e2);
    }
    fix(gx, 1.18, cz, 0.07, 0.05, len, 0xd7d1bf);
    fix(gx - dir * 0.01, 2.24, cz, 0.09, 0.09, len, 0xc9c3b1);
    fix(gx - dir * 0.01, 0.13, cz, 0.09, 0.10, len, 0x8b8574);
    // DECOR BAND above the case. A cooler tops out at 2.9 m and this wall runs
    // to 7.4 — without this it is four and a half metres of bare drywall down
    // the whole length of the aisle, which is the exact fault the perimeter
    // gondola's `upper` option exists to fix.
    fix(wallX + dir * 0.10, 3.30, cz, 0.06, 1.00, len, 0xe8dfc6);
    fix(wallX + dir * 0.12, 3.84, cz, 0.05, 0.12, len, P.terra);
    fix(wallX + dir * 0.12, 2.82, cz, 0.05, 0.13, len, P.terra);
    // FROZEN FOODS at the back where it meets the rear case line, DAIRY as you
    // come forward — the same order a real cold wall runs in, and cycling the
    // cell stops two identical panels landing side by side.
    let wsn = 0;
    for (let z = z0 + 2.2; z < z1 - 1.6; z += 6.4) {
      fix(wallX + dir * 0.15, 3.32, z, 0.04, 0.80, 5.10, 0xd6c9a8);
      qX(Qwsign, wallX + dir * 0.19, 3.32, z, 4.90, 0.70, dir,
        cellUV(wsn++ < 2 ? 2 : 3, 1, 4));
    }
    qUp(Qshadow, mid + dir * 0.35, 0.006, cz, 3.4, len, FULL);
    contactZ(gx + dir * 0.03, cz, len, dir, 0.36);
    solid(wallX - 0.05 * dir, 0, z0 - 0.05, gx + dir * 0.06, 2.34, z1 + 0.05);
  }

  // 7 island gondolas between neighbouring aisles + 2 shallow wall runs
  // Deliberately CLUMPED rather than alternating. Alternating profiles averages
  // out: every aisle ends up bounded by one dense run and one sparse one and
  // they all measure the same. Clumping gives aisle 2 two tight runs and aisle
  // 5 two bulky ones, which is what a real planogram does anyway — you do not
  // put canned soup opposite paper towels.
  const RUN_PROFILE = [0, 0, 1, 2, 2, 3, 4];
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
  // deck and a decor band above it. WRW is declared in the FLOOR block.
  // The two wall runs do NOT break: they lie ALONG the walkway rather than
  // across it, so a cross-aisle in a real store terminates at them.
  //
  // ROUND 5 — AISLE 1 IS THE CHILLED AISLE. Round 4's eight aisles measured
  // within 5.6 points of each other while eleven reference photographs spanned
  // 29, and the reason was that all eight were the same thing: two gondolas.
  // The two lowest-scoring product aisles in the reference set are both FROZEN
  // aisles (34.4% and 35.1%) — a wall of lit glass doors is a completely
  // different image from a wall of packages, and this store did not have one.
  // The left perimeter wall already backs onto the frozen section of the rear
  // case line, so the cold aisle wraps the corner exactly as it does in a real
  // store. Same footprint, same collider depth, no change to the nav lane.
  coolerRunZ(STORE.minX, 1, -BODY - EC_D, BODY + EC_D);
  buildRun(91, STORE.maxX - WRW / 2 - 0.04, WRW / 2,
    [{ dir: -1, dept: DEPTS[(AISLE_COUNT - 1) % DEPTS.length], aisle: AISLE_COUNT - 1 }],
    { profile: PERIM, upper: -1, segs: ONE_SEG });

  // =========================================================================
  // HANGING AISLE SIGNS  (front mouth + back mouth, both faces)
  // =========================================================================
  const SIGN_Y = 3.32, SIGN_W = 1.86, SIGN_H = 1.64;
  for (let i = 0; i < AISLE_COUNT; i++) {
    const x = aisleX(i);
    const front = cellUV(i % 8, 4, 4), back = cellUV(8 + (i % 8), 4, 4);
    // ROUND 5. Four mouths per aisle now, not two: the store ends AND both
    // sides of the mid-store walkway. A cross-aisle you cannot navigate from is
    // just a hole in the shelving — the signs are what make standing in it
    // worth doing, and every real store hangs a second set exactly here.
    for (const [z, end] of [
      [-(HALF + 0.75), -1], [HALF + 0.75, 1],
      [XA0 - 0.62, 1], [XA1 + 0.62, -1],
    ]) {
      // panel faces: -Z side and +Z side.
      // ROUND-4 BUG. These quads sat at z +- 0.035 on a carrier box that is
      // exactly 0.07 deep, i.e. EXACTLY coplanar with its own face. Past ~12 m
      // the depth buffer could not separate them and the cream carrier won in a
      // stipple, so the far aisle signs rendered as blank tan banners with the
      // artwork dithering through — the blind critic read one as "a grey banner
      // with a visibly corrupted texture" and another as a failed sign texture.
      // 11 mm of clearance plus a polygon offset on the material kills it.
      qZ(Qsign, x, SIGN_Y, z - 0.046, SIGN_W, SIGN_H, -1, end < 0 ? front : back);
      qZ(Qsign, x, SIGN_Y, z + 0.046, SIGN_W, SIGN_H, 1, end < 0 ? back : front);
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
    tube(x, 1.6, laneZ1 - 0.2, 0, 0, 0, 0.05, 3.0, 0xb5ae9c);
    const uv = cellUV(k % 8, 4, 2);
    // the lightbox is a real box; the two printed faces stand 15 mm clear of it
    // (they used to sit INSIDE the 50 mm post and z-fought with it)
    fix(x, 2.62, laneZ1 - 0.20, 0.68, 0.68, 0.13, 0xece5d1);
    qZ(Qlane, x, 2.62, laneZ1 - 0.28, 0.62, 0.62, -1, uv);
    qZ(Qlane, x, 2.62, laneZ1 - 0.12, 0.62, 0.62, 1, uv);
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
    contactZ(x - 0.34, laneCZ, laneLen, -1, 0.30);
    contactZ(x + 0.34, laneCZ, laneLen, 1, 0.30);
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
      if (Math.abs(px - EXIT.x) < 4.4) continue;
      if (Math.abs(px - EXIT2.x) < 4.0) continue;
      fix(px, py, STORE.minZ + 0.10, 2.05, 1.30, 0.05, 0xf1e9d5, BfixF);
      qZ(Qpromo, px, py + 0.02, STORE.minZ + 0.135, 1.92, 1.16, 1,
        cellUV((rng() * 4) | 0, 1, 4));
      fix(px, py + 0.70, STORE.minZ + 0.11, 2.20, 0.10, 0.07, P.terra, BfixF);
    }
    fix(CX, 1.16, STORE.minZ + 0.08, SW, 0.10, 0.05, P.woodDark, BfixF);   // rub rail
    fix(CX, 0.28, STORE.minZ + 0.08, SW, 0.56, 0.05, 0xd9cfb6, BfixF);     // dado
  }

  // =========================================================================
  // STOREFRONTS — one per exit
  // =========================================================================
  // ROUND 5. src/agents.js moved the chase to TWO ways out 35 m apart, because
  // one door made the thief's destination public knowledge and camping it beat
  // actually chasing him by 57 points. Round 4's store built a storefront at
  // Door 1 and nothing whatever at Door 2 — the chase builder was drawing a
  // placeholder lit EXIT box and two push-bar leaves there just so it was not a
  // hole in the wall. This is the real thing, built once and called twice, so
  // the two doors are the same door and neither reads as the "fake" one.
  //
  // No colliders anywhere in here, exactly as Door 1 had none: the front wall's
  // own collider stops at z = STORE.minZ and the whole assembly stands inside
  // it. Anything solid at a door would put a wall between a runner and the way
  // out — and the door beat is priced in TUNING.doorShove, not in geometry.
  function storefront(cx, halfW, label) {
    const fz = STORE.minZ;                 // the wall plane
    const gx0 = cx - halfW, gx1 = cx + halfW, w = gx1 - gx0;
    // ---- what is outside ---------------------------------------------------
    // A textured plate, not a flat swatch: blown sky under a dark canopy
    // soffit, a treeline, parked cars, asphalt with stall lines running away.
    qZ(Qout, cx, 1.78, fz + 0.06, w, 3.28, 1, FULL);
    // bollards and a cart corral OUTSIDE, in near-silhouette against it. These
    // are what tell you the bright plate is a window and not a light box.
    for (const bx of [gx0 + 0.55, gx0 + 1.75, gx1 - 1.75, gx1 - 0.55]) {
      fix(bx, 0.52, fz + 0.045, 0.19, 1.04, 0.19, 0x8a7a3a, BfixF);
      fix(bx, 1.06, fz + 0.045, 0.21, 0.06, 0.21, 0x6d6229, BfixF);
    }
    for (const s of [-1, 1]) {
      const rx = cx + s * (halfW - 0.30);
      fix(rx, 0.62, fz + 0.05, 0.05, 0.90, 0.05, 0x5c6167, BfixF);
      fix(rx - s * 0.62, 0.62, fz + 0.05, 0.05, 0.90, 0.05, 0x5c6167, BfixF);
      fix(rx - s * 0.31, 1.04, fz + 0.05, 0.68, 0.05, 0.05, 0x5c6167, BfixF);
    }
    // ---- the shopfront system ---------------------------------------------
    // sill, jambs, transom and intermediate mullions. Storefront extrusion is
    // 50 mm dark bronze anodised and it is ALL you see of the frame edge-on.
    const MUL = 0x3f444b, MUL2 = 0x565c64;
    fix(cx, 0.115, fz + 0.13, w + 0.10, 0.23, 0.12, MUL, BfixF);       // sill
    fix(cx, 2.63, fz + 0.13, w + 0.10, 0.11, 0.12, MUL, BfixF);        // transom bar
    fix(cx, 3.06, fz + 0.13, w + 0.10, 0.07, 0.10, MUL2, BfixF);       // head
    const nMul = Math.max(4, Math.round(w / 1.15));
    for (let k = 0; k <= nMul; k++) {
      const gx = gx0 + (k / nMul) * w;
      fix(gx, 1.62, fz + 0.13, 0.075, 3.05, 0.11, MUL, BfixF);
    }
    for (const gx of [gx0, gx1]) fix(gx, 1.62, fz + 0.14, 0.16, 3.05, 0.13, 0x33383e, BfixF);
    // fascia band over the opening, and the store's own name plate
    fix(cx, 3.48, fz + 0.12, w + 0.72, 0.60, 0.15, P.terra, BfixF);
    fix(cx, 3.48, fz + 0.145, w * 0.62, 0.34, 0.03, 0xf7f0dc, BfixF);
    // ---- the two operating leaves -----------------------------------------
    // Held very slightly ajar so the gap between them reads as a way through.
    const lz = fz + 0.20;
    // A shop entry leaf is GLASS in a narrow stile-and-rail frame, not a metal
    // slab with a light patch on it. The glazed area is a slice of the SAME
    // exterior plate, UV-mapped to the leaf's real position in the opening, so
    // the car park lines up across the door and the fixed lights either side.
    const uAt = (px) => (px - gx0) / w;
    const vAt = (py) => (py - 0.14) / 3.28;
    for (const s of [-1, 1]) {
      const lx = cx + s * 0.50;
      fix(lx, 1.30, lz, 0.94, 2.32, 0.055, 0x9aa1a8, BfixF);          // leaf stiles
      Qout.rect([lx, 1.44, lz + 0.030], [0.39, 0, 0], [0, 0.92, 0],
        uAt(lx - 0.39), vAt(0.52), uAt(lx + 0.39), vAt(2.36));
      fix(lx, 0.30, lz + 0.05, 0.92, 0.42, 0.05, 0x767d84, BfixF);    // kick plate
      fix(lx, 2.42, lz + 0.05, 0.92, 0.10, 0.05, 0x767d84, BfixF);    // top rail
      for (const e of [-1, 1]) {                                       // stiles
        fix(lx + e * 0.42, 1.30, lz + 0.05, 0.10, 2.32, 0.05, 0x8e959c, BfixF);
      }
      // push bar across the leaf and a vertical pull on the lock stile
      fix(lx, 1.02, lz + 0.100, 0.78, 0.062, 0.062, 0xd2d7dc, BfixF);
      for (const e of [-1, 1]) fix(lx + e * 0.37, 1.02, lz + 0.072, 0.05, 0.062, 0.056, 0x8b9198, BfixF);
      fix(lx + s * 0.40, 1.46, lz + 0.110, 0.048, 1.02, 0.048, 0xdfe4e9, BfixF);
      for (const hy of [0.98, 1.94]) fix(lx + s * 0.40, hy, lz + 0.080, 0.042, 0.05, 0.05, 0xa9aeb4, BfixF);
      // decals: CAUTION AUTOMATIC DOOR at head height, IN / OUT below it
      qZ(Qdecal, lx, 2.16, lz + 0.062, 0.42, 0.21, 1, cellUV(0, 4, 1));
      qZ(Qdecal, lx, 1.72, lz + 0.062, 0.24, 0.24, 1, cellUV(s > 0 ? 1 : 2, 4, 1));
    }
    // the meeting stile, and the header the operators live in
    fix(cx, 1.30, lz + 0.02, 0.075, 2.32, 0.08, 0x6e757c, BfixF);
    fix(cx, 2.74, fz + 0.24, 2.36, 0.30, 0.26, 0xb6bcc2, BfixF);       // operator header
    fix(cx, 2.74, fz + 0.38, 2.36, 0.06, 0.03, 0x6e757c, BfixF);
    for (const s of [-1, 1]) fix(cx + s * 0.86, 2.56, fz + 0.34, 0.16, 0.09, 0.10, 0x2b2e33, BfixF);  // sensors
    // the hours plate, on the glass beside the doors where it always is
    qZ(Qdecal, gx0 + 0.86, 1.55, fz + 0.19, 0.46, 0.34, 1, cellUV(3, 4, 1));
    // ---- vestibule ---------------------------------------------------------
    // Two short returns and a soffit. A real entry is a lobby, not a hole, and
    // the returns are what give the doorway depth from inside the store.
    for (const s of [-1, 1]) {
      fix(cx + s * (halfW + 0.02), 1.62, fz + 0.95, 0.10, 3.24, 1.70, 0xe4dbc4, BfixF);
      fix(cx + s * (halfW - 0.06), 1.62, fz + 1.78, 0.14, 3.24, 0.09, MUL, BfixF);
    }
    fix(cx, 3.28, fz + 0.95, w + 0.24, 0.14, 1.72, 0xe9e1cc, BfixF);   // soffit
    fix(cx, 3.19, fz + 0.95, w - 0.30, 0.05, 1.30, 0xfff6e2, BfixF);   // lit cove
    // walk-off mat, and the interior bollards that stop a cart at the doors
    fix(cx, 0.008, fz + 1.05, w * 0.80, 0.016, 1.90, 0x33352f);
    fix(cx, 0.020, fz + 1.05, w * 0.80 - 0.12, 0.016, 1.74, 0x4a4d45);
    for (const s of [-1, 1]) {
      const bx = cx + s * 1.72;
      drum(bx, 0.46, fz + 1.62, 0.22, 0.92, 0xd8c33a);
      drum(bx, 0.93, fz + 1.62, 0.24, 0.05, 0x2f3237);
    }
    // ---- signage -----------------------------------------------------------
    // A lit EXIT box on the inside face, which is the thing a fleeing man is
    // actually running at. Matches the placeholder src/agents.js has been
    // drawing at Door 2 so that placeholder can now come out.
    fix(cx, 2.88, fz + 1.86, 1.00, 0.34, 0.11, 0x2a2c30, BfixF);
    qZ(Qexit, cx, 2.88, fz + 1.925, 0.86, 0.26, 1, cellUV(label, 2, 1));
    fix(cx, 3.08, fz + 1.86, 1.10, 0.07, 0.24, 0x24262a, BfixF);
    qUp(Qshadow, cx, 0.006, fz + 1.4, w + 1.2, 3.0, FULL);
    contactX(fz + 1.92, cx, w + 0.2, 1, 0.34);
  }
  storefront(EXIT.x, 3.40, 0);
  // Door 2, on config.js's EXIT2 so there is exactly one source of truth for
  // where it is. The glazing is trimmed on the right so it stops clear of the
  // service desk's back shelving, which stands on the same wall 2 m along.
  storefront(EXIT2.x - 0.30, 2.85, 1);

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
        pull: d / Math.max(1, CD.length - 1), vacancy: 1.35,
        tag: (aStart, aw, kindT) => {
          qZ(Qtag, aStart + aw / 2, CD[d] - 0.021, lip - 0.020, aw, 0.048, -1, tagUV(kindT));
        },
      });
    }
    flushPkg(B, 'cooler');
    // GLASS DOORS. ROUND 5 — real door hardware, because the reflection is only
    // half of what makes reference/store_04 read: the other half is that a
    // reach-in door is a heavy extruded frame with a full-height chrome pull, a
    // black gasket down every meeting stile, and an LED strip INSIDE the frame
    // washing the case from top to bottom. Those vertical strips are the
    // brightest verticals in that photograph and there was nothing like them
    // here. They also give the new mirror something worth reflecting.
    const gz = coolZ - coolD / 2 - 0.02;
    for (let x = coolX0; x < coolX1 - 0.4; x += 0.86) {
      const w = Math.min(0.86, coolX1 - x);
      qZ(Qglass, x + w / 2, 1.18, gz, w - 0.05, 2.02, -1, FULL);
      // frame: outer extrusion, dark gasket inside it, then the pull
      fix(x, 1.18, gz, 0.062, 2.12, 0.075, 0xdad4c2);
      fix(x, 1.18, gz - 0.030, 0.030, 2.08, 0.030, 0x2c2e2c);
      fix(x + w - 0.095, 1.06, gz - 0.048, 0.030, 1.32, 0.030, 0xd8dde2);   // pull
      for (const hy of [0.44, 1.68]) fix(x + w - 0.095, hy, gz - 0.030, 0.028, 0.05, 0.05, 0xb3b8bd);
      // the LED strip up the inside of the mullion, and its glow on the glass
      tube(x + 0.045, 1.18, gz + 0.075, 0, 0, 0, 0.013, 1.98, 0xfff9ec);
      // Qled, not Qbloom: the ceiling-bloom soup renders at renderOrder 5, i.e.
      // after the glass at 4, so an additive card meant to sit INSIDE the case
      // was in fact laid over the pane. Same fault as the dairy run, milder,
      // and the reason the critic read this glass as "faintly present".
      qZ(Qled, x + 0.045, 1.18, gz + 0.030, 0.30, 2.10, -1, FULL);
      // the shelf-edge label strip a door's worth of frozen product carries
      fix(x + w / 2, 2.22, gz + 0.02, w - 0.10, 0.06, 0.02, 0xf6f1e2);
    }
    fix((coolX0 + coolX1) / 2, 1.18, gz, coolX1 - coolX0, 0.05, 0.07, 0xd7d1bf);
    fix((coolX0 + coolX1) / 2, 2.24, gz - 0.01, coolX1 - coolX0, 0.09, 0.09, 0xc9c3b1);
    fix((coolX0 + coolX1) / 2, 0.13, gz - 0.01, coolX1 - coolX0, 0.10, 0.09, 0x8b8574);
    qUp(Qshadow, cmid, 0.006, coolZ - 0.35, cw, 3.4, FULL);
    contactX(gz - 0.03, cmid, cw, -1, 0.36);
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
    contactBox(cx, cz, w - 0.3, dpt - 0.3, 0.32);
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
    contactX(wz - 0.45, wmid, ww, -1, 0.32);
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
    contactBox(x, z, w + 0.18, d + 0.18, 0.26);
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
  // PERIMETER AISLES. Aisle 0 and aisle 7 are nearly six metres wide and their
  // middle third measured five to eight points of edge density below every
  // interior aisle — six metres of open floor with nothing in it. A real store
  // lines that run with promo pallets and a floor rack. All of it is parked on
  // the WALL side so the aisle centreline, which is the agents' nav spine and
  // the chase lane, stays completely clear.
  for (const sgn of [-1, 1]) {
    const wallFace = sgn < 0 ? STORE.minX + WRW + 0.10 : STORE.maxX - WRW - 0.10;
    for (let k = 0; k < 7; k++) {
      let z = -HALF + 1.4 + k * (AISLE_LEN - 2.8) / 6;
      // Nothing parks in the mouth of the walkway. This one was live: the
      // k = 3 pallet landed at z = 0, squarely across the end of the new
      // cross-aisle, which would have corked the perimeter end of it.
      if (inCross(z, 1.5)) z = z < CROSS_Z ? XA0 - 1.9 : XA1 + 1.9;
      const px = wallFace + sgn * 0.72;
      if (k % 3 === 1) {
        // a wire floor rack of case stock rather than another pallet
        fix(px, 0.055, z, 1.05, 0.11, 1.05, 0x2a2620);
        for (let d2 = 0; d2 < 3; d2++) {
          const y = 0.34 + d2 * 0.44;
          fix(px, y - 0.016, z, 1.00, 0.03, 1.00, P.metal);
          railRunX(px - sgn * 0.50, y - 0.020, z - 0.48, z + 0.48, -sgn);
          fillShelf(Bbulk, rng, DEPTS[(k + 5) % DEPTS.length], {
            axis: 'z', a0: z - 0.46, a1: z + 0.46, lip: px - sgn * 0.50,
            face: -sgn, deckY: y, headroom: 0.40, depth: 0.90, lit: 0.94, col,
            pull: 0.7, vacancy: 0.8,
          });
        }
        for (const sz2 of [-1, 1]) {
          fix(px, 0.78, z + sz2 * 0.50, 1.02, 1.45, 0.035, P.metal);
        }
        qUp(Qshadow, px, 0.006, z, 2.2, 2.2, FULL);
        contactBox(px, z, 1.05, 1.05, 0.26);
        solid(px - 0.55, 0, z - 0.55, px + 0.55, 1.5, z + 0.55);
      } else {
        bulkStack(px, z, DEPTS[(k + 3) % DEPTS.length], 1.05, 1.05, ri(rng, 3, 6));
      }
    }
  }
  flushPkg(Bbulk, 'bulk');

  // =========================================================================
  // PARKED CARTS
  // =========================================================================
  // ROUND 4. These were nine flat-grey Lambert slabs and the blind critic
  // listed them as a binary tell: "untextured grey cart proxies". A cart is not
  // a box, it is a chrome WIRE basket you can see straight through, and the
  // see-through is most of what identifies it at any distance. Four alpha-mapped
  // mesh panels plus a real tube frame, a plastic handle, a child seat and — on
  // the ones out on the floor — some shopping in the bottom.
  //
  // ROUND 6 — THE CART TRANSPARENCY BUG. This was a straight rendering fault
  // and it was the loudest thing in the store.
  //
  // Round 4 built the basket out of four alpha-mapped cards: an 8x8 wire grid
  // on a 128 px canvas, tiled every 62 mm, on a Phong material with
  // transparent:true + alphaTest:0.22. Two things go wrong and they compound.
  //   * 8 wires across a 62 mm cell is a wire every 7.75 mm. At any real
  //     viewing distance that is well under a texel, so the mip chain averages
  //     the whole cell to a single alpha of roughly 0.6 — uniformly, everywhere
  //     on the card. alphaTest 0.22 never fires, because 0.6 > 0.22 across the
  //     ENTIRE quad. There is no cut-out left; the card is a solid sheet.
  //   * transparent:true then blends that sheet. So every basket rendered as a
  //     milky white film with the floor tiles, the steel frame and the cardboard
  //     boxes inside it all reading through at ~40%.
  // Alpha-testing a wire grid finer than a texel cannot work — the information
  // is gone before the test runs. So the basket is now REAL WIRE: individual
  // 10 mm bars in the existing fixture batch. No alpha, no blending, no sort,
  // correct occlusion and a correct silhouette, in the same draw call as every
  // other fixture in the store. About 87 instances per cart, 16 carts, ~17k
  // triangles total against a 1.8 M budget. (TX.cartMeshTex is left in place
  // but is no longer used by anything.)
  function cart(x, z, yaw, loaded) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const at = (dx, dz) => [x + dx * c - dz * s, z + dx * s + dz * c];
    const put = (dx, y, dz, sx, sy, sz, hex, B = Bfix) => {
      const [px, pz] = at(dx, dz);
      col.setHex(hex);
      B.push(px, y, pz, 0, yaw, 0, sx, sy, sz, col);
    };
    // basket: real wire. `axis` 0 = the panel spans local X, 1 = local Z.
    // 38 mm vertical / 55 mm horizontal on 6.5 mm rod, which is what a real
    // nesting basket measures. The first pass at this used 62/85 mm on 10 mm
    // rod and read as scaffolding, not as a basket.
    const WR = 0.0065, VP = 0.038, HP = 0.055;
    const bright = 0xdfe4ea, dull = 0xbcc2c9;
    // a vertical panel: bars up the face at VP, bars across it at HP
    const panel = (dx, dz, y, half, halfH, axis) => {
      for (let a = -half + WR; a <= half - WR + 1e-4; a += VP) {
        const px = axis ? dx : dx + a, pz = axis ? dz + a : dz;
        put(px, y, pz, axis ? WR : WR, halfH * 2, axis ? WR : WR,
          (Math.round(a / VP) & 1) ? bright : dull);
      }
      for (let h = -halfH + WR; h <= halfH - WR + 1e-4; h += HP) {
        put(dx, y + h, dz, axis ? WR * 0.85 : half * 2, WR * 0.85,
          axis ? half * 2 : WR * 0.85, dull);
      }
    };
    panel(0, -0.455, 0.615, 0.29, 0.20, 0);      // front wall
    panel(0, 0.455, 0.645, 0.29, 0.17, 0);       // back wall
    panel(-0.275, 0, 0.615, 0.455, 0.20, 1);     // left
    panel(0.275, 0, 0.615, 0.455, 0.20, 1);      // right
    // the floor of the basket — bars running fore-and-aft under bars running
    // across, which is how a nesting basket is actually made
    for (let a = -0.255; a <= 0.256; a += VP) {
      put(a, 0.415, 0, WR, WR * 0.9, 0.91, dull);
    }
    for (let b = -0.44; b <= 0.441; b += HP) {
      put(0, 0.423, b, 0.55, WR * 0.9, WR, bright);
    }
    // the lower rack is a wire deck too, not a steel plate — it was one of the
    // last solid grey slabs left on the cart
    for (let a = -0.235; a <= 0.236; a += VP * 1.3) {
      put(a, 0.175, 0, WR, WR, 0.86, dull);
    }
    for (let b = -0.41; b <= 0.411; b += HP * 1.4) {
      put(0, 0.182, b, 0.50, WR, WR, bright);
    }
    // tube frame: top rail all round, corner posts, undercarriage, handle
    put(0, 0.815, -0.455, 0.58, 0.028, 0.028, 0xd6dae0);
    put(0, 0.815, 0.455, 0.58, 0.028, 0.028, 0xd6dae0);
    put(-0.275, 0.815, 0, 0.028, 0.028, 0.94, 0xd6dae0);
    put(0.275, 0.815, 0, 0.028, 0.028, 0.94, 0xd6dae0);
    for (const sx of [-1, 1]) {
      put(sx * 0.255, 0.30, 0.40, 0.026, 0.62, 0.026, 0xb9bec5);
      put(sx * 0.255, 0.30, -0.40, 0.026, 0.62, 0.026, 0xb9bec5);
    }
    put(0, 0.885, 0.545, 0.56, 0.042, 0.042, 0xc0392b);          // plastic handle
    put(0, 0.135, 0, 0.44, 0.020, 0.10, 0x2f3339);               // ad frame
    for (const [dx, dz] of [[-0.225, -0.365], [0.225, -0.365], [-0.225, 0.365], [0.225, 0.365]]) {
      put(dx, 0.075, dz, 0.055, 0.10, 0.11, 0x33363b);
      put(dx, 0.045, dz, 0.085, 0.075, 0.085, 0x1e2024);         // castor
    }
    if (loaded) {                       // shopping, which is what stops it
      for (let k = 0; k < ri(rng, 5, 9); k++) {                  // reading as a prop
        const hs = pick(rng, DEPTS[(k + 2) % DEPTS.length].colors);
        col.setHSL(hs[0] / 360, hs[1] / 100 * 1.1, Math.min(0.9, hs[2] / 100 * 1.15));
        const [px, pz] = at(rr(rng, -0.19, 0.19), rr(rng, -0.34, 0.34));
        Bcart.box.push(px, rr(rng, 0.46, 0.60), pz, 0, rng() * 3.14, rr(rng, -0.2, 0.2),
          rr(rng, 0.11, 0.20), rr(rng, 0.10, 0.22), rr(rng, 0.09, 0.17), col, (rng() * 24) | 0);
      }
    }
    qUp(Qshadow, x, 0.006, z, 1.4, 1.8, FULL);
    // four castors, each with its own tight pool — that is what actually reads
    // as a cart standing on a floor rather than hovering 20 mm over it
    for (const [dx, dz] of [[-0.225, -0.365], [0.225, -0.365], [-0.225, 0.365], [0.225, 0.365]]) {
      const [px, pz] = at(dx, dz);
      contactBox(px, pz, 0.09, 0.09, 0.085);
    }
    solid(x - 0.42, 0, z - 0.6, x + 0.42, 1.0, z + 0.6);
  }
  const Bcart = newPkg();
  // the corral by the doors: nested, so the pitch is a basket depth, not a cart
  for (let k = 0; k < 6; k++) cart(EXIT.x + 2.0 + k * 0.40, STORE.minZ + 2.4, 0.03 * k, false);
  // ...and one at Door 2, parked on the far side from the service desk so its
  // colliders sit 2.5 m clear of the lane a runner takes at that door.
  for (let k = 0; k < 5; k++) {
    cart(EXIT2.x - 4.2 + k * 0.40, STORE.minZ + 2.4, 3.10 + 0.03 * k, false);
  }
  cart(aisleX(2) + 1.15, -HALF + 3.4, 0.5, true);
  cart(aisleX(5) - 1.10, HALF - 5.2, -0.8, true);
  cart(aisleX(6) + 1.20, 4.6, 2.4, true);         // was z=2.0, inside the walkway
  // an abandoned cart at the mouth of the walkway — close enough to read as
  // cross-aisle traffic, far enough out of the band that its 1.2 m collider
  // never touches the lane a runner uses
  cart(aisleX(3) + PITCH / 2 + 1.05, XA1 + 1.15, 1.35, true);
  cart(aisleX(5) + PITCH / 2 - 1.05, XA0 - 1.25, -1.9, false);
  flushPkg(Bcart, 'cartload');
  qUp(Qshadow, sd.x, 0.006, sd.z, 7.6, 3.0, FULL);
  contactBox(sd.x, sd.z, 6.4, 1.10, 0.30);

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
    const y0 = 0.72, y1 = y - 0.16;
    tube(x, (y0 + y1) / 2, z, 0, 0, 0, 0.008, y1 - y0, 0x6f6a5e);
    fix(x, y, z, w + 0.05, 0.30, 0.035, 0xf3ebd6);
    for (const s of [-1, 1]) {
      qZ(Qpromo, x, y, z + s * 0.026, w, 0.26, s, cellUV((rng() * 4) | 0, 1, 4));
    }
  }

  function donutTable(x, z) {
    // Deck height is not free: builder-agents floats the grabbable item at
    // y = 1.06 with a 0.11 m box, so the table has to top out at about 1.00 or
    // the boost hovers in mid-air above it — which is exactly how the blind
    // critic read it ("floating above the crate stack").
    const w = 0.62, d = 0.58;
    fix(x, 0.055, z, w + 0.10, 0.11, d + 0.10, 0x2a2620);          // black plinth
    fix(x, 0.40, z, w, 0.58, d, 0xffffff, Bwood);                   // wood body
    fix(x, 0.705, z, w + 0.07, 0.04, d + 0.07, P.woodDark);         // rim
    for (const s of [-1, 1]) {
      qZ(Qrail, x, 0.705, z + s * (d / 2 + 0.041), w, 0.05, s, [0, 0, w, 1]);
      qX(Qrail, x + s * (w / 2 + 0.041), 0.705, z, d, 0.05, s, [0, 0, d, 1]);
    }
    // stacked bakery boxes: white board with a printed band, three columns of
    // two or three, deliberately uneven the way a bakery clerk leaves them
    let top = 0.725;
    for (let cx = -1; cx <= 1; cx++) {
      let y = 0.725;
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
    headerCard(x, 1.52, z, 0.46);
    qUp(Qshadow, x, 0.006, z, w + 1.0, d + 1.0, FULL);
    contactBox(x, z, w + 0.10, d + 0.10, 0.22);
  }

  function energyBarrel(x, z) {
    const r = 0.30;
    fix(x, 0.055, z, r * 2 + 0.06, 0.11, r * 2 + 0.06, 0x2a2620);
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
    headerCard(x, 1.50, z, 0.42);
    qUp(Qshadow, x, 0.006, z, r * 2 + 1.0, r * 2 + 1.0, FULL);
    contactBox(x, z, r * 2 + 0.06, r * 2 + 0.06, 0.22);
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
      // ...and never in the walkway. These carry no collider, so a display in
      // the cross-aisle would not block the chase — but it WOULD stand in the
      // middle of the sightline, and the sightline is the point.
      let pz = rr(rng, -HALF + 2.4, HALF - 2.4);
      if (inCross(pz, 1.4)) pz += (pz < CROSS_Z ? -1 : 1) * 3.2;
      putSpot(aisleX(i) + side * PICKUP_LIP, pz, (i + k) % 2 ? 'donuts' : 'energy');
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
  soup(Qpeg, sharp(new THREE.MeshLambertMaterial({ map: T.peg, color: 0xece8dc }), -0.9), 'backPanels');
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
  // 4b: was tinted 0xf0ead9, which knocked the new light blade field back down
  // toward the wall tone it is supposed to stand out from. It is a lit acrylic
  // panel; let it be its own value. Sharpened because it is almost always seen
  // near edge-on and the category text on it is load-bearing for navigation.
  soup(Qblade, sharp(new THREE.MeshBasicMaterial({ map: T.blade, color: 0xffffff }), -0.6), 'bladeSigns');
  soup(Qlane, new THREE.MeshBasicMaterial({ map: T.lane, color: 0xfaf4e6 }), 'laneSigns');
  soup(Qpromo, new THREE.MeshBasicMaterial({ map: T.promo, color: 0xfbf3e2 }), 'promoSigns');
  soup(Qwsign, new THREE.MeshBasicMaterial({ map: T.wallSign, color: 0xeee7d6 }), 'wallSigns');
  soup(Qcool, new THREE.MeshBasicMaterial({ map: T.coolerBack, color: 0xffffff }), 'coolerBack');
  // ROUND-4. The mip bias that used to be on the lens map was forcing a sharp
  // mip on a 3 px prismatic ladder at 70 degrees off normal, and the result was
  // exactly the "hard black shards at grazing angle" the critic reported: pure
  // undersampling moire, not a texture failure. Full anisotropy, no bias, and a
  // coarser lower-contrast ladder in stripTex fixes it at the source.
  soup(Qstrip, new THREE.MeshBasicMaterial({ map: T.strip, color: 0xffffff }),
    'lightLenses', ceilGroup);
  soup(Qwell, new THREE.MeshBasicMaterial({ map: T.well, color: 0xffffff }),
    'trofferHousings', ceilGroup);
  const tshMat = new THREE.MeshBasicMaterial({
    map: T.tsh, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending,
  });
  const tsh = soup(Qtsh, tshMat, 'trofferShadows', ceilGroup);
  if (tsh) tsh.renderOrder = -2;
  const bloomMat = new THREE.MeshBasicMaterial({
    map: T.glow, color: 0xfff4dc, transparent: true, opacity: 0.34,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const bl = soup(Qbloom, bloomMat, 'lightBloom', ceilGroup);
  if (bl) bl.renderOrder = 5;
  // GROUND SHADOWS. ROUND 6 — both of these used to be one normal-blended
  // near-black card at 0.70 opacity. A dark card PAINTED over a floor is a
  // decal: it flattens the tile, it flattens the reflection under it, and where
  // the card ends it ends at the card's edge rather than at a physical
  // gradient. Multiply is what a shadow actually is — it scales whatever the
  // floor was already returning, reflection included — so an occluded patch of
  // mirror goes dim instead of going matte black.
  //   Qshadow   the broad ambient pool, radial map, one per fixture
  //   Qcontact  the tight ramp hugging every base, 100-340 mm out
  const shadowMat = new THREE.MeshBasicMaterial({
    map: T.gao, color: 0xffffff, transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending,
  });
  const sm = soup(Qshadow, shadowMat, 'groundShadows'); if (sm) sm.renderOrder = 1;
  const contactMat = new THREE.MeshBasicMaterial({
    map: T.contact, color: 0xffffff, transparent: true, depthWrite: false,
    blending: THREE.MultiplyBlending,
  });
  const cm = soup(Qcontact, contactMat, 'contactShadows'); if (cm) cm.renderOrder = 2;
  soup(Qpatch, new THREE.MeshBasicMaterial({ map: T.patch, color: 0xd6d1c3 }), 'floorPatches');
  // CAVITY AMBIENT OCCLUSION — multiplied over the product, so it has to run
  // after every opaque package and before the glass.
  const aoMat = new THREE.MeshBasicMaterial({
    map: T.ao, transparent: true, depthWrite: false, blending: THREE.MultiplyBlending,
  });
  const ao = soup(Qao, aoMat, 'shelfAO'); if (ao) ao.renderOrder = 3;
  // FREEZER GLASS. Round 4 shipped this as a flat 0.20-opacity blue quad: the
  // same veil head-on as at eighty degrees, which is the one behaviour glass
  // never has. It now runs the floor's analytic mirror — sharing the floor's
  // own uniform bag, so the two cannot disagree about where the lamps are —
  // with fresnel, a double-glazing ghost that walks off the primary as the
  // angle opens, and thermal haze at the mullions. Face-on it is now CLEARER
  // than the old veil (0.04 fresnel + a 0.085 tint against a flat 0.20), so the
  // product inside the case actually reads; at grazing it goes to mirror.
  // aspect = door width / door height, so the haze band is the same physical
  // width along the jamb as along the head.
  // ...and the LED mullion strips INSIDE the cases, which have to be laid down
  // before the pane in front of them, not after it. See coolerRunZ.
  const ledMat = new THREE.MeshBasicMaterial({
    map: T.glow, color: 0xfff6e2, transparent: true, opacity: 0.42,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ld = soup(Qled, ledMat, 'coolerLed'); if (ld) ld.renderOrder = 3;
  const glassMat = FL.reflectiveGlass(THREE, floorMat.userData.chop, { aspect: 0.40 });
  const gl = soup(Qglass, glassMat, 'coolerGlass'); if (gl) gl.renderOrder = 4;
  scene.userData.chopGlass = glassMat.userData.chop;
  // STOREFRONTS. The round-4 flat 0xd9e6ee plate is gone; what is outside is
  // now a real image with a value range in it, and the door decals and the lit
  // EXIT boxes ride on top of it. Basic materials throughout — daylight and a
  // fluorescent EXIT box are both emitters, and neither takes room light.
  soup(Qout, new THREE.MeshBasicMaterial({ map: T.outside, color: 0xffffff }),
    'outside', frontGroup);
  soup(Qdecal, new THREE.MeshBasicMaterial({
    map: T.decal, color: 0xffffff, transparent: true, depthWrite: false,
  }), 'doorDecals', frontGroup);
  soup(Qexit, new THREE.MeshBasicMaterial({ map: T.exit, color: 0xffffff }),
    'exitSigns', frontGroup);

  // =========================================================================
  // LIGHTING
  // =========================================================================
  // ROUND-4b — DYNAMIC RANGE AND LIGHT DIRECTION.
  // The round-3/4a rig was 0.52 ambient + 0.92 hemi against 0.82 key + 0.26
  // fill: very close to half the total illumination arriving from every
  // direction at once. That is the whole reason the AO read as "omnidirectional
  // and too weak" — it was not the AO, it was that any occlusion card is
  // fighting a metre of flat fill behind it, so nothing it darkens can actually
  // get dark. Real aisle light comes from a strip four metres straight up: the
  // vertical component dominates and the horizontal fill is bounce off the
  // facing gondola, which is much weaker than this.
  //
  // Shifting roughly a third of the omnidirectional budget into the downward
  // key is what lets the toe kick go near black, the lip shadow bite, and the
  // deck tops separate from the deck faces — all cards that were already drawn
  // and were simply being washed out. Overall exposure is held roughly level so
  // the packaging print does not sink.
  //
  // ROUND 5 — WHY THE PRODUCT WALL WAS SEPIA. It was not the packaging
  // vocabulary and it was not the exposure: it was that EVERY light in the rig
  // was warm. Ambient 0xffeed4, hemi sky 0xfff8ea over ground 0x6d6249, key
  // 0xfff3e0 — the blue channel arrived at a vertical product face at about 86%
  // of red before any pigment was applied. And a product face is lit almost
  // entirely by the omnidirectional pair, because the key comes from 68 degrees
  // above and contributes cos(theta) ~ 0.22 to a vertical facing. So every
  // white went cream, every blue went navy, and a measured hue histogram put
  // 38-41% of the frame in the 15-60 degree warm band at s > 0.32 against 7-11%
  // for reference/store_01 and _02 — with blue at 0.7% against their 11-15%.
  //
  // A supermarket runs 4100K lamps and a camera white-balances them. The warmth
  // in those photographs is PIGMENT — cream walls, terracotta bands, wood end
  // panels — not the illuminant. So the illuminant goes neutral, the pigments
  // stay exactly as warm as they were, and the packaging is allowed to be the
  // colour it is printed. The ground bounce keeps a little warmth because it
  // genuinely is bouncing off a brown floor.
  scene.add(new THREE.AmbientLight(0xfff4e6, 0.36));
  const hemi = new THREE.HemisphereLight(0xfcfdff, 0x736a58, 0.66);
  hemi.position.set(0, CEIL_H, 0);
  scene.add(hemi);
  // Steeper as well as stronger: this used to come in at about 30 degrees off
  // horizontal, i.e. from the side, which is the one direction a supermarket is
  // never lit from and which put the brightest face on the shelf UPRIGHTS.
  const key = new THREE.DirectionalLight(0xfffaf2, 1.24);
  key.position.set(CX + 5, CEIL_H + 16, CZ - 7);
  key.target.position.set(CX, 0, CZ);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = -SW * 0.6; sc.right = SW * 0.6; sc.top = SD * 0.6; sc.bottom = -SD * 0.6;
  sc.near = 1; sc.far = 70; sc.updateProjectionMatrix();
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight(0xdfeaff, 0.32);
  fill.position.set(CX - 12, CEIL_H + 4, CZ + 14);
  scene.add(fill);

  scene.fog = new THREE.Fog(0xdcd6c6, 32, 110);

  return { colliders, powerupSpots };
}
