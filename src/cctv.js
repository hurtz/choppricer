// OWNER: builder-cctv. Security-footage look + the monitor wall.
// CONTRACT — must keep exporting exactly this:
//   createCCTV(THREE, renderer, scene) -> {
//     renderWall(dt),                 // draw the multi-monitor desk view
//     renderFloor(dt, camera),        // draw the on-foot view, CCTV-graded
//     setActiveCam(i), resize(w,h)
//   }
import { CAMERAS } from './config.js';

export function createCCTV(THREE, renderer, scene) {
  const cams = CAMERAS.map(c => {
    const cam = new THREE.PerspectiveCamera(72, 4 / 3, 0.1, 120);
    cam.position.set(...c.pos);
    cam.lookAt(new THREE.Vector3(...c.look));
    return cam;
  });
  let active = 0;
  return {
    cams,
    setActiveCam(i) { active = i % cams.length; },
    resize() {},
    renderWall() { renderer.render(scene, cams[active]); },
    renderFloor(dt, camera) { renderer.render(scene, camera); },
  };
}
