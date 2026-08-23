// OWNER: builder-camera. The on-foot chase camera.
//
// CONTRACT — must keep exporting exactly this:
//   createCamera(THREE, cam) -> { update(dt, state), yaw }
//     cam    : the THREE.PerspectiveCamera to drive (already in the scene)
//     state  : { cop, chasing, gassed, boost, speed, report, dt }
//     yaw    : CURRENT camera yaw in radians about +Y. main.js rotates the player's
//              input by this every frame, so WASD always means what the player sees.
//              If you swing the camera and do not keep `yaw` truthful, the controls
//              mirror — which is exactly the bug a playtest just caught.
//
// THE BRIEF: the player said walking through this store is the best thing in the game,
// and then that he is "not seeing the angles I wanted from within the store". This
// camera has been a fixed 6.4m-high, 7.6m-back, dead-flat follow since the first hour
// of the project. It has never been designed.

export function createCamera(THREE, cam) {
  const api = {
    yaw: 0,
    update(dt, state) {
      const c = state.cop.position;
      cam.position.set(c.x, 6.4, c.z - 7.6);
      cam.lookAt(c.x, 1.0, c.z + 2.5);
      api.yaw = 0;              // looking down +Z
    },
  };
  return api;
}
