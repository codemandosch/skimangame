import { Euler, Quaternion, Vector3 } from 'three';
import { flightFrame } from './rider-frame.js';

const axis = new Vector3();
const delta = new Quaternion();
const parent = new Quaternion();
const level = new Vector3();
const euler = new Euler(0, 0, 0, 'YXZ');
const up = new Vector3();
const forward = new Vector3();
const TAU = Math.PI * 2;
const unwrap = (angle, previous) => previous + Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));
// Hands-off leveling near the snow: proportional to the remaining tilt, but
// capped well below trick rotation speed so it only nudges a landing.
const LEVEL_GAIN = 1.6;
const LEVEL_MAX_RATE = 1.1;

// The trick frame stays fixed at takeoff. Integrating one angular-velocity
// vector avoids the continually moving flip axis of yaw/pitch Euler stacking.
export function advanceAerialRotation(s, dt, spinScale = 1) {
  if (!s.airRotation) {
    s.airRotation = new Quaternion().setFromEuler(euler.set(-s.flip, -s.spin, 0));
    s.airPitch = s.flip;
    s.airYaw = s.spin;
  }
  axis.set(-s.flipVelocity, -s.spinVelocity * spinScale, 0);
  const speed = axis.length();
  if (speed) {
    delta.setFromAxisAngle(axis.multiplyScalar(1 / speed), speed * dt);
    s.airRotation.premultiply(delta).normalize();
  }
  up.set(0, 1, 0).applyQuaternion(s.airRotation);
  forward.set(0, 0, -1).applyQuaternion(s.airRotation);
  // Track actual pitch excursion: a cork must not earn invisible backflips
  // just because its angular velocity has a horizontal component.
  if (Math.hypot(up.y, up.z) > 1e-6) {
    s.airPitch = unwrap(Math.atan2(-up.z, up.y), s.airPitch);
  }
  if (Math.hypot(forward.x, forward.z) > 1e-6) {
    const yaw = unwrap(Math.atan2(forward.x, -forward.z), s.airYaw);
    // Count visible heading travel, but not a pure flip's apparent half-turn
    // when its ski tips pass through vertical.
    if (Math.abs(s.spinVelocity) > 0.01) s.airSpin += yaw - s.airYaw;
    s.airYaw = yaw;
  }
  s.spinTravel = Math.max(s.spinTravel, Math.abs(s.airSpin));
  s.flipTravel = Math.max(s.flipTravel, Math.abs(s.airPitch));
}

// Swing the body's up axis toward the landing snow's normal without twisting
// about it, so a spin keeps its heading. `ground` is a snow frame (pitch/roll
// along the heading) like the landing check uses; `strength` (0..1) fades
// the assist in and out.
export function levelAerialRotation(s, ground, strength, dt) {
  if (!s.airRotation || strength <= 0) return;
  // The trick rotation sits inside the flight frame and the stance yaw. Both
  // frames share the heading yaw, so it cancels and is left out.
  const frame = flightFrame(s);
  parent.setFromEuler(euler.set(frame.pitch, 0, frame.roll))
    .multiply(delta.setFromEuler(euler.set(0, -(s.stanceYaw + s.yawOffset), 0)));
  level.set(0, 1, 0)
    .applyQuaternion(delta.setFromEuler(euler.set(ground.pitch, 0, ground.roll)))
    .applyQuaternion(parent.invert());
  up.set(0, 1, 0).applyQuaternion(s.airRotation);
  axis.crossVectors(up, level);
  const length = axis.length();
  if (length < 1e-6) return;
  const angle = Math.atan2(length, up.dot(level));
  const step = Math.min(angle, Math.min(LEVEL_MAX_RATE, LEVEL_GAIN * angle) * strength * dt);
  delta.setFromAxisAngle(axis.multiplyScalar(1 / length), step);
  s.airRotation.premultiply(delta).normalize();
}

// Shared by rendering and landing. Also supports authored/static poses that
// set spin and flip directly, before the simulation has integrated a frame.
export function riderRotation(s, target) {
  if(s.railing)return target.setFromEuler(euler.set(0,-s.railYaw,0));
  target.setFromEuler(euler.set(0, -(s.stanceYaw + s.yawOffset), 0));
  if (s.airRotation) return target.multiply(s.airRotation);
  delta.setFromEuler(euler.set(-s.flip, -s.spin, 0));
  return target.multiply(delta);
}

export function aerialLanding(s) {
  if (!s.airRotation) {
    return { upright: Math.abs(s.flip - Math.round(s.flip / TAU) * TAU) < Math.PI / 2,
      yaw: s.spin + s.yawOffset };
  }
  up.set(0, 1, 0).applyQuaternion(s.airRotation);
  return { upright: up.y > 1e-8, yaw: s.airYaw + s.yawOffset };
}
