import { Euler, Quaternion, Vector3 } from 'three';
import { riderRotation } from './aerial-rotation.js';
import { flightFrame } from './rider-frame.js';

// Beyond this angle between the body's axis and the snow normal the skis
// cannot bite. Yaw never counts: sideways skis are still flat on the snow.
export const LANDING_TILT_LIMIT = 65 * Math.PI / 180;
// Past this, against the snow, the rider arrives head-first and tumbles.
const TUMBLE_TILT = 125 * Math.PI / 180;

const euler = new Euler(0, 0, 0, 'YXZ');
const frame = new Quaternion();
const world = new Quaternion();
const normal = new Vector3();
const up = new Vector3();
const angle = cos => Math.acos(Math.max(-1, Math.min(1, cos)));

// The visible rider attitude against the landing snow. `ground` is the snow
// frame the renderer switches to on contact; `bodyNormal` is the snow normal
// seen from the rider's body: -z is toward the chest, +x toward the right.
export function landingAttitude(s, ground) {
  const flight = s.airborne ? flightFrame(s) : ground;
  world.setFromEuler(euler.set(flight.pitch, s.heading || 0, flight.roll))
    .multiply(riderRotation(s, new Quaternion()));
  frame.setFromEuler(euler.set(ground.pitch, s.heading || 0, ground.roll));
  normal.set(0, 1, 0).applyQuaternion(frame);
  up.set(0, 1, 0).applyQuaternion(world);
  return {
    tilt: angle(up.dot(normal)),
    bodyNormal: normal.clone().applyQuaternion(world.clone().invert()),
    // What was on screen at impact, expressed in the snow frame, so the fall
    // starts from it instead of snapping upright.
    relative: frame.clone().invert().multiply(world),
  };
}

// Pick the fall that matches where the body was leaning when it hit.
export function chooseWipeout(attitude) {
  const { tilt, bodyNormal: n } = attitude;
  const across = Math.abs(n.x), along = Math.abs(n.z);
  // The body falls away from the snow normal: normal toward the chest means
  // the rider was leaning back; toward the right side means leaning left.
  const pitch = n.z < 0 ? 'back' : 'front';
  const side = n.x > 0 ? -1 : 1;
  if (tilt > TUMBLE_TILT) {
    return { kind: across > along * 1.4 ? 'cartwheel' : 'tomahawk', side, direction: pitch === 'back' ? -1 : 1 };
  }
  if (across > along * 1.25) return { kind: 'sideslam', side, direction: 0 };
  // Nearly level but still a crash (daffy, tree, rail tower): sit back.
  if (tilt < .2 || pitch === 'back') return { kind: 'backseat', side, direction: -1 };
  return { kind: 'faceplant', side, direction: 1 };
}

export const WIPEOUT_DURATION = { backseat: 1.65, faceplant: 1.8, sideslam: 1.7, tomahawk: 2.2, cartwheel: 2.2 };
