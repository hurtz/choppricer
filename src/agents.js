// OWNER: builder-agents. Cop, shoppers, thieves, stamina, powerups. The chase feel.
// CONTRACT — must keep exporting exactly this:
//   createAgents(THREE, scene, world) -> {
//     cop, shoppers, update(dt, input, api), reset()
//   }
// `api` provides: api.onBolt(shopper), api.onCatch(shopper),
//                 api.onEscape(shopper), api.onHarass(shopper)
// All movement constants come from TUNING in ./config.js.
import { TUNING, EXIT, aisleX, AISLE_LEN } from './config.js';

export function createAgents(THREE, scene, world) {
  const mk = (color) => {
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 1.0, 4, 8),
      new THREE.MeshStandardMaterial({ color }));
    m.position.y = 0.85; scene.add(m); return m;
  };
  const cop = mk(0x2a3550);
  cop.position.set(0, 0.85, -8);
  cop.userData = { stamina: TUNING.staminaMax, boost: 0, vel: new THREE.Vector3() };
  const shoppers = [];
  return {
    cop, shoppers,
    reset() {},
    update(dt, input) {
      const s = input.sprint && cop.userData.stamina > 0 ? TUNING.copRun : TUNING.copWalk;
      cop.position.x += (input.x || 0) * s * dt;
      cop.position.z += (input.z || 0) * s * dt;
      cop.userData.stamina = Math.max(0, Math.min(TUNING.staminaMax,
        cop.userData.stamina + (input.sprint ? -TUNING.staminaDrain : TUNING.staminaRegen) * dt));
    },
  };
}
