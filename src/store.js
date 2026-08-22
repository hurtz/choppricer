// OWNER: builder-store. The physical supermarket.
// CONTRACT — must keep exporting exactly this:
//   buildStore(THREE, scene) -> { colliders: Box3[], powerupSpots: {x,z,kind}[] }
// Read all layout numbers from ./config.js. Never hardcode aisle positions.
import {
  AISLE_COUNT, AISLE_LEN, AISLE_GAP, SHELF_W, SHELF_H, CEIL_H, STORE,
  FRONT_WALK_Z, BACK_WALK_Z, EXIT, SERVICE_DESK, CAMERAS, aisleX,
} from './config.js';
import { makeRng, rr, ri, pick, Batch, Quads } from './store/kit.js';
import { DEPTS, FROZEN, fillShelf } from './store/products.js';
import * as TX from './store/tex.js';

// ---------------------------------------------------------------------------
// PALETTE — warm cream / sage / terracotta, wood-tone uprights. Never grey.
const P = {
  deck:     0xf0e8d4,   // shelf boards, cream steel
  deckDark: 0xd9cfb6,
  peg:      0xe4dcc6,   // gondola back panel
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
    box: TX.boxMask(THREE),
    can: TX.canMask(THREE),
    bottle: TX.bottleMask(THREE),
    bag: TX.bagMask(THREE),
    carton: TX.cartonMask(THREE),
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

// ---------------------------------------------------------------------------
// PACKAGE SHADER — one greyscale mask + a per-instance brand colour.
//   mask.r = how much brand colour bleeds through (0 = white label stock)
//   mask.g = print brightness (barcodes, shadow gradients, edge shading)
function chopPackageMat(THREE, mask, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ map: mask, color: 0xffffff, ...extra });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `
        vec4 chopM = texture2D( map, vMapUv );
        diffuseColor.rgb *= mix( vec3( 1.0 ), vColor, chopM.r ) * ( 0.26 + 0.74 * chopM.g );
      `)
      .replace('#include <color_fragment>', '');
  };
  m.customProgramCacheKey = () => 'chopPkg';
  return m;
}

function pillowGeo(THREE) {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 2, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const t = Math.abs(y) > 0.25 ? 0.42 : 1.0;      // pinch the sealed top/bottom
    p.setZ(i, z * t);
    p.setX(i, x * (Math.abs(y) > 0.25 ? 0.93 : 1.0));
  }
  g.computeVertexNormals();
  return g;
}

function bottleGeo(THREE) {
  const pts = [
    [0.02, -0.50], [0.40, -0.50], [0.47, -0.455], [0.47, -0.30], [0.47, -0.10],
    [0.47, 0.10], [0.45, 0.20], [0.31, 0.30], [0.19, 0.36], [0.18, 0.44],
    [0.23, 0.458], [0.23, 0.50], [0.02, 0.50],
  ].map(([r, y]) => new THREE.Vector2(r, y));
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
    bottle: bottleGeo(THREE),
    bag: pillowGeo(THREE),
    tube: new THREE.CylinderGeometry(0.5, 0.5, 1, 7, 1, true),
    orb: new THREE.SphereGeometry(0.5, 7, 5),
    dome: new THREE.SphereGeometry(0.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  };

  // ---- shared materials ---------------------------------------------------
  const M = {
    pkgBox: chopPackageMat(THREE, T.box),
    pkgCan: chopPackageMat(THREE, T.can),
    pkgBottle: chopPackageMat(THREE, T.bottle),
    pkgBag: chopPackageMat(THREE, T.bag),
    fix: new THREE.MeshLambertMaterial({ color: 0xffffff }),
    wood: new THREE.MeshLambertMaterial({ map: T.wood, color: 0xffffff }),
    dark: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  };

  const newPkg = () => ({
    box: new Batch(THREE, G.box, M.pkgBox),
    can: new Batch(THREE, G.can, M.pkgCan),
    bottle: new Batch(THREE, G.bottle, M.pkgBottle),
    bag: new Batch(THREE, G.bag, M.pkgBag),
  });
  const flushPkg = (B, name, parent = root) => {
    for (const k of ['box', 'can', 'bottle', 'bag']) {
      const m = B[k].build(name + '.' + k);
      if (m) parent.add(m);
    }
  };

  // global fixture batches (uprights, boards, counters, carts…)
  const Bfix = new Batch(THREE, G.box, M.fix);
  const Bwood = new Batch(THREE, G.box, M.wood);
  const Btube = new Batch(THREE, G.tube, M.fix);
  const Borb = new Batch(THREE, G.orb, M.fix);
  // everything at ceiling height lives in its own batch so the whole lot can be
  // culled for the chase camera, which flies ABOVE the drop ceiling.
  const BfixC = new Batch(THREE, G.box, M.fix);
  const BtubeC = new Batch(THREE, G.tube, M.fix);
  const BfixF = new Batch(THREE, G.box, M.fix);
  const fix = (x, y, z, sx, sy, sz, hex, B = Bfix) => { col.setHex(hex); B.box(x, y, z, sx, sy, sz, col); };
  const tube = (x, y, z, ex, ey, ez, r, len, hex, B = Btube) => { col.setHex(hex); B.push(x, y, z, ex, ey, ez, r, len, r, col); };

  // quad soups
  const Qrail = new Quads(), Qsign = new Quads(), Qblade = new Quads();
  const Qlane = new Quads(), Qpromo = new Quads(), Qwsign = new Quads();
  const Qstrip = new Quads(), Qglow = new Quads(), Qglass = new Quads();
  const Qcool = new Quads(), Qbright = new Quads(), Qshadow = new Quads();

  // =========================================================================
  // FLOOR
  // =========================================================================
  T.floor.repeat.set(SW / 2.44, SD / 2.44);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(SW, SD),
    new THREE.MeshStandardMaterial({ map: T.floor, color: 0xfdf6e8, roughness: 0.26, metalness: 0.10 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(CX, 0, CZ);
  floor.receiveShadow = true;
  root.add(floor);

  // long specular smear of the light rows down each aisle
  for (let i = 0; i < AISLE_COUNT; i++) {
    qUp(Qglow, aisleX(i), 0.012, 0, AISLE_GAP * 0.92, AISLE_LEN * 1.02, FULL);
    qUp(Qglow, aisleX(i), 0.018, 0, AISLE_GAP * 0.30, AISLE_LEN * 0.94, FULL);
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
  const ceilPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(SW, SD),
    new THREE.MeshLambertMaterial({ map: (() => { const t = T.ceil.clone(); t.needsUpdate = true; t.repeat.set(SW / 2.44, SD / 2.44); return t; })(), color: 0xf6efdd }));
  ceilPlane.rotation.x = Math.PI / 2;    // normal points down
  ceilPlane.position.set(CX, CEIL_H, CZ);
  ceilGroup.add(ceilPlane);

  const LY = CEIL_H - 0.045;
  const lightRow = (x, z0, z1) => {
    const len = z1 - z0;
    qDown(Qstrip, x, LY, (z0 + z1) / 2, 0.44, len, [0, 0, len / 2.44, 1]);
    fix(x, LY + 0.09, (z0 + z1) / 2, 0.56, 0.16, len, 0xefe7d4, BfixC);
  };
  const lightRowX = (z, x0, x1) => {
    const len = x1 - x0;
    Qstrip.rect([(x0 + x1) / 2, LY, z], [0, 0, -0.22], [len / 2, 0, 0], 0, 0, len / 2.44, 1);
    fix((x0 + x1) / 2, LY + 0.09, z, len, 0.16, 0.56, 0xefe7d4, BfixC);
  };
  for (let i = 0; i < AISLE_COUNT; i++) {
    lightRow(aisleX(i) - 0.95, -HALF - 1.6, HALF + 1.6);
    lightRow(aisleX(i) + 0.95, -HALF - 1.6, HALF + 1.6);
  }
  for (let k = 0; k < 4; k++) lightRowX(STORE.minZ + 1.9 + k * 1.75, STORE.minX + 1, STORE.maxX - 1);
  for (let k = 0; k < 2; k++) lightRowX(STORE.maxZ - 1.5 - k * 1.9, STORE.minX + 1, STORE.maxX - 1);

  // sprinkler main + drops, HVAC diffusers
  for (let k = 0; k < 7; k++) {
    const z = STORE.minZ + 2.6 + k * (SD - 5) / 6;
    tube(CX, CEIL_H - 0.30, z, 0, 0, Math.PI / 2, 0.075, SW - 1.2, 0xb04a34, BtubeC);
    for (let x = STORE.minX + 2.4; x < STORE.maxX - 2; x += 3.4) {
      fix(x, CEIL_H - 0.20, z, 0.05, 0.20, 0.05, 0x8f8a7c, BfixC);
      fix(x, CEIL_H - 0.34, z, 0.13, 0.05, 0.13, 0xc9c2ae, BfixC);
    }
  }
  for (let k = 0; k < 12; k++) {
    const x = STORE.minX + 3 + (k % 6) * (SW - 6) / 5;
    const z = STORE.minZ + 5 + Math.floor(k / 6) * (SD - 12);
    fix(x, CEIL_H - 0.06, z, 1.18, 0.12, 1.18, 0xf2ecdb, BfixC);
    fix(x, CEIL_H - 0.13, z, 1.02, 0.04, 1.02, 0xd7d0bc, BfixC);
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
  const DECK = [0.17, 0.555, 0.94, 1.325, 1.71];
  const LIT = [0.70, 0.80, 0.90, 1.00, 1.08];
  const BODY = HALF - 0.62;                 // gondola body half-length in Z
  const EC_D = 0.44;                        // endcap shelf depth
  const ECDECK = [0.22, 0.68, 1.14, 1.60];

  function deckDepths(halfDepth) {
    const f = [1.0, 0.96, 0.91, 0.85, 0.78];
    return f.map((v) => halfDepth * v);
  }

  function buildRun(idx, x, halfW, faces, opts = {}) {
    const B = newPkg();
    const z0 = -BODY, z1 = BODY, len = z1 - z0;
    const dd = deckDepths(halfW - 0.05);

    // kick plate + base
    fix(x, 0.075, 0, halfW * 2 - 0.10, 0.15, len, P.kick);
    // back panel / pegboard spine
    if (faces.length === 2) {
      fix(x, 1.10, 0, 0.07, 1.90, len, P.peg);
    } else {
      fix(x - faces[0].dir * (halfW - 0.04), 1.10, 0, 0.08, 1.90, len, P.peg);
    }

    for (const f of faces) {
      const lip = x + f.dir * halfW;
      for (let d = 0; d < DECK.length; d++) {
        const dep = dd[d];
        // shelf board
        fix(lip - f.dir * (dep / 2), DECK[d] - 0.018, 0, dep + 0.02, 0.036, len, d === 0 ? P.deckDark : P.deck);
        // price rail on the lip
        qX(Qrail, lip + f.dir * 0.012, DECK[d] - 0.020, 0, len, 0.062, f.dir, [0, 0, len / 1.0, 1]);
        const head = (DECK[d + 1] !== undefined ? DECK[d + 1] : SHELF_H + 0.03) - DECK[d] - 0.036;
        fillShelf(B, rng, f.dept, {
          axis: 'z', a0: z0 + 0.05, a1: z1 - 0.05, lip, face: f.dir,
          deckY: DECK[d], headroom: head, depth: dep, lit: LIT[d], col,
        });
      }
      // uprights every 4ft section
      for (let z = z0; z <= z1 + 0.01; z += 1.22) {
        fix(lip - f.dir * 0.05, 1.10, z, 0.10, 1.95, 0.055, P.upright);
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
      // that anything in this store is actually sitting on the ground
      qUp(Qshadow, lip + f.dir * 0.06, 0.006, 0, 1.8, len * 1.02, FULL);
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
          qZ(Qrail, x, ECDECK[d] - 0.020, lip + dir * 0.012, halfW * 2 - 0.04, 0.062, dir,
            [0, 0, (halfW * 2) / 1.0, 1]);
          const head = (ECDECK[d + 1] !== undefined ? ECDECK[d + 1] : 2.02) - ECDECK[d] - 0.036;
          fillShelf(B, rng, faces[0].dept, {
            axis: 'x', a0: x - halfW + 0.04, a1: x + halfW - 0.04, lip, face: dir,
            deckY: ECDECK[d], headroom: head, depth: EC_D * 0.92, lit: 1.05, col,
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

    // overstock cases riding on top of the run
    for (let z = z0 + 1.0; z < z1 - 1.0; z += rr(rng, 2.2, 6.5)) {
      if (rng() < 0.45) continue;
      const n = ri(rng, 1, 2);
      for (let s = 0; s < n; s++) {
        const h = rr(rng, 0.22, 0.30), w = rr(rng, 0.5, 0.85);
        col.setHSL(rr(rng, 25, 38) / 360, rr(rng, 0.22, 0.4), rr(rng, 0.42, 0.58));
        B.box.push(x + rr(rng, -0.1, 0.1), SHELF_H + 0.06 + h / 2 + s * h, z,
          0, rr(rng, -0.06, 0.06), 0, halfW * 1.5, h, w, col);
      }
    }

    flushPkg(B, 'run' + idx);
    const zc = opts.endcaps ? BODY + EC_D + 0.14 : BODY;
    solid(x - halfW - 0.02, 0, -zc, x + halfW + 0.02, SHELF_H, zc);
  }

  // 7 island gondolas between neighbouring aisles + 2 shallow wall runs
  for (let i = 0; i < AISLE_COUNT - 1; i++) {
    buildRun(i, aisleX(i) + PITCH / 2, SHELF_W / 2, [
      { dir: -1, dept: DEPTS[i % DEPTS.length], aisle: i },
      { dir: 1, dept: DEPTS[(i + 1) % DEPTS.length], aisle: i + 1 },
    ], { endcaps: true });
  }
  const WRW = 0.78;
  buildRun(90, STORE.minX + WRW / 2 + 0.04, WRW / 2, [{ dir: 1, dept: DEPTS[0], aisle: 0 }]);
  buildRun(91, STORE.maxX - WRW / 2 - 0.04, WRW / 2,
    [{ dir: -1, dept: DEPTS[(AISLE_COUNT - 1) % DEPTS.length], aisle: AISLE_COUNT - 1 }]);

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
    const B = newPkg();
    for (let d = 0; d < 4; d++) {
      const y = 0.42 + d * 0.34;
      fix(x - 0.42, y - 0.015, laneCZ + 0.4, 0.28, 0.03, 2.0, P.deck);
      qX(Qrail, x - 0.42 - 0.15, y - 0.018, laneCZ + 0.4, 2.0, 0.05, -1, [0, 0, 2.0, 1]);
      fillShelf(B, rng, DEPTS[3], {
        axis: 'z', a0: laneCZ - 0.6, a1: laneCZ + 1.4, lip: x - 0.42 - 0.14, face: -1,
        deckY: y, headroom: 0.30, depth: 0.26, lit: 1.02, col,
      });
    }
    flushPkg(B, 'lane' + k);
    qUp(Qshadow, x + 0.05, 0.006, laneCZ, 2.4, laneLen + 1.4, FULL);
    solid(x - 0.62, 0, laneZ0 - 0.1, x + 0.82, 1.1, laneZ1 + 0.1);
  }

  // storefront: bright glazing + entry doors near EXIT
  const gx0 = EXIT.x - 3.4, gx1 = EXIT.x + 3.4;
  Qbright.rect([(gx0 + gx1) / 2, 1.7, STORE.minZ + 0.09], [(gx1 - gx0) / 2, 0, 0], [0, 1.55, 0], 0, 0, 1, 1);
  fix((gx0 + gx1) / 2, 3.45, STORE.minZ + 0.12, gx1 - gx0 + 0.6, 0.55, 0.14, P.terra, BfixF);
  for (const gx of [gx0, EXIT.x, gx1]) fix(gx, 1.7, STORE.minZ + 0.13, 0.14, 3.2, 0.10, 0x4a4f57, BfixF);
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
      fillShelf(B, rng, FROZEN, {
        axis: 'x', a0: coolX0 + 0.15, a1: coolX1 - 0.15, lip, face: -1,
        deckY: CD[d], headroom: 0.34, depth: 0.68, lit: 1.22, col,
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
      qZ(Qrail, wmid, RD[d] - 0.02, wz - 0.32, ww - 0.1, 0.055, -1, [0, 0, ww, 1]);
      fillShelf(B, rng, DEPTS[7], {
        axis: 'x', a0: wx0 + 0.1, a1: wx1 - 0.1, lip: wz - 0.31, face: -1,
        deckY: RD[d], headroom: 0.40, depth: 0.60, lit: 1.0, col,
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
  // POWERUP SPOTS — grab points scattered down the aisle floors
  // =========================================================================
  for (let i = 0; i < AISLE_COUNT; i++) {
    const n = 1 + (i % 2);
    for (let k = 0; k < n; k++) {
      powerupSpots.push({
        x: aisleX(i) + rr(rng, -1.1, 1.1),
        z: rr(rng, -HALF + 2, HALF - 2),
        kind: (i + k) % 2 ? 'donuts' : 'energy',
      });
    }
  }

  // =========================================================================
  // FLUSH BATCHES + QUAD SOUPS
  // =========================================================================
  for (const [b, n] of [[Bfix, 'fixtures'], [Bwood, 'wood'], [Btube, 'tubes'], [Borb, 'produce']]) {
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
  soup(Qrail, new THREE.MeshLambertMaterial({ map: T.rail, color: 0xfffdf4, emissive: 0x2a2620 }), 'rails');
  soup(Qsign, new THREE.MeshBasicMaterial({ map: T.sign, color: 0xf2ecdd }), 'aisleSigns');
  soup(Qblade, new THREE.MeshBasicMaterial({ map: T.blade, color: 0xf0ead9 }), 'bladeSigns');
  soup(Qlane, new THREE.MeshBasicMaterial({ map: T.lane, color: 0xfaf4e6 }), 'laneSigns');
  soup(Qpromo, new THREE.MeshBasicMaterial({ map: T.promo, color: 0xfbf3e2 }), 'promoSigns');
  soup(Qwsign, new THREE.MeshBasicMaterial({ map: T.wallSign, color: 0xeee7d6 }), 'wallSigns');
  soup(Qcool, new THREE.MeshBasicMaterial({ map: T.coolerBack, color: 0xffffff }), 'coolerBack');
  soup(Qstrip, new THREE.MeshBasicMaterial({ map: T.strip, color: 0xffffff }), 'lightStrips', ceilGroup);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: T.glow, color: 0x1c1710, transparent: true, opacity: 0.46, depthWrite: false,
  });
  const sm = soup(Qshadow, shadowMat, 'contactShadows'); if (sm) sm.renderOrder = 1;
  const glowMat = new THREE.MeshBasicMaterial({
    map: T.glow, transparent: true, opacity: 0.17, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const gm = soup(Qglow, glowMat, 'floorGlow'); if (gm) gm.renderOrder = 2;
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
  const hemi = new THREE.HemisphereLight(0xfff5e4, 0x9c8b6e, 0.72);
  hemi.position.set(0, CEIL_H, 0);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff3e0, 0.42);
  key.position.set(CX + 9, CEIL_H + 7, CZ - 12);
  key.target.position.set(CX, 0, CZ);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera;
  sc.left = -SW * 0.6; sc.right = SW * 0.6; sc.top = SD * 0.6; sc.bottom = -SD * 0.6;
  sc.near = 1; sc.far = 70; sc.updateProjectionMatrix();
  scene.add(key); scene.add(key.target);
  const fill = new THREE.DirectionalLight(0xe8f0ff, 0.16);
  fill.position.set(CX - 12, CEIL_H + 4, CZ + 14);
  scene.add(fill);

  scene.fog = new THREE.Fog(0xe0d5bd, 30, 105);

  return { colliders, powerupSpots };
}
