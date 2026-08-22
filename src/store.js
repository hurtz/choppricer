// OWNER: builder-store. The physical supermarket.
// CONTRACT — must keep exporting exactly this:
//   buildStore(THREE, scene) -> { colliders: Box3[], powerupSpots: {x,z,kind}[] }
// Read all layout numbers from ./config.js. Never hardcode aisle positions.
import { AISLE_COUNT, AISLE_LEN, SHELF_W, SHELF_H, CEIL_H, STORE, aisleX } from './config.js';

export function buildStore(THREE, scene) {
  const colliders = [];
  const powerupSpots = [];

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(STORE.maxX - STORE.minX, STORE.maxZ - STORE.minZ),
    new THREE.MeshStandardMaterial({ color: 0xdedad0, roughness: 0.35, metalness: 0.0 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((STORE.minX + STORE.maxX) / 2, 0, (STORE.minZ + STORE.maxZ) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x8d8d92, roughness: 0.8 });
  for (let i = 0; i < AISLE_COUNT; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(SHELF_W, SHELF_H, AISLE_LEN), shelfMat);
    g.position.set(aisleX(i) + (SHELF_W + 4.0) / 2, SHELF_H / 2, 0);
    g.castShadow = g.receiveShadow = true;
    scene.add(g);
    colliders.push(new THREE.Box3().setFromObject(g));
    powerupSpots.push({ x: aisleX(i), z: (Math.random() - 0.5) * AISLE_LEN * 0.7, kind: i % 2 ? 'donuts' : 'energy' });
  }

  scene.add(new THREE.AmbientLight(0xfff4e0, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(6, CEIL_H, 4);
  scene.add(key);

  return { colliders, powerupSpots };
}
