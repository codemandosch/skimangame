import { Euler, Quaternion, Vector3 } from 'three';

const axis = new Vector3();
const delta = new Quaternion();
const euler = new Euler(0, 0, 0, 'YXZ');
const up = new Vector3();
const forward = new Vector3();
const TAU = Math.PI * 2;
const unwrap = (angle, previous) => previous + Math.atan2(Math.sin(angle - previous), Math.cos(angle - previous));

// The trick frame stays fixed at takeoff. Integrating one angular-velocity
// vector avoids the continually moving flip axis of yaw/pitch Euler stacking.
export function advanceAerialRotation(s, dt) {
  if (!s.airRotation) {
    s.airRotation = new Quaternion().setFromEuler(euler.set(-s.flip, -s.spin, 0));
    s.airPitch = s.flip;
    s.airYaw = s.spin;
  }
  axis.set(-s.flipVelocity, -s.spinVelocity, 0);
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
