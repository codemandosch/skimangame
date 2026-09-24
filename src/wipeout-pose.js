import { MathUtils, Quaternion, Vector3 } from 'three';

// Seconds a head-first rider spends tumbling over before settling on the snow.
export const TUMBLE_TIME = 0.9;
// Impact attitude hands over to the fall within this time.
const IMPACT_BLEND = 0.22;
const Y = new Vector3(0, 1, 0);
const SPIN_ORIGIN = new Vector3(0, 1, 0);
const TUMBLE_CENTER = new Vector3(0, 0.85, 0);

// Whole-body motion and pose weights for the wipeout the physics chose.
// Pose weights are body-space shapes; `quaternion` and `position` replace the
// rider's spin group (pivot at y=1) so the body can roll and tumble on the snow.
export function wipeoutMotion(p, s, remaining) {
  const crash = remaining > 0 ? s.crash : null;
  const kind = crash?.kind ?? 'backseat';
  const elapsed = Math.max(0, p.bailDuration - remaining);
  const weight = p.wipeout;
  const tumbling = kind === 'tomahawk' || kind === 'cartwheel';
  const tumble = tumbling ? MathUtils.clamp(elapsed / TUMBLE_TIME, 0, 1) : 1;
  const settled = tumbling ? MathUtils.smoothstep(tumble, 0.55, 1) : 1;
  const shape = {
    // Every tumble finishes flat on the back before the rider gets up.
    back: weight * (kind === 'backseat' || tumbling ? settled : 0),
    face: kind === 'faceplant' ? weight : 0,
    slam: kind === 'sideslam' ? weight : 0,
    tuck: tumbling ? weight * (1 - settled) : 0,
    // Limbs go slack a beat after the body hits and flop onto the snow.
    limp: weight * MathUtils.smoothstep(elapsed, 0.1, 0.45),
    side: crash?.side || 1,
  };
  if (!crash) return { shape, active: false };

  const impact = new Quaternion().fromArray(crash.impact);
  // Split the impact into the tilt away from the snow normal and the heading
  // twist left over, so the rider lies down facing the way they came in.
  const up = Y.clone().applyQuaternion(impact);
  const tilt = Math.acos(MathUtils.clamp(up.y, -1, 1));
  const axis = up.clone().cross(Y);
  if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
  axis.normalize();
  const upright = new Quaternion().setFromAxisAngle(axis, tilt).multiply(impact);
  const forward = new Vector3(0, 0, -1).applyQuaternion(upright);
  // Turn back toward the travel line only while standing up again.
  const rise = MathUtils.smoothstep(remaining, 0, 0.7);
  const yaw = new Quaternion().setFromAxisAngle(Y, Math.atan2(-forward.x, -forward.z) * rise);

  // Rest attitude: a hip slam rolls the whole body over onto the ski edges.
  const pivot = new Vector3(), lie = new Quaternion();
  if (shape.slam) {
    pivot.set(shape.side * 0.45, 0, 0);
    lie.setFromAxisAngle(new Vector3(0, 0, 1), -shape.side * 1.5 * shape.slam);
  }
  const rest = yaw.clone().multiply(lie);
  const restPosition = pivot.clone().add(SPIN_ORIGIN.clone().sub(pivot).applyQuaternion(lie))
    .applyQuaternion(yaw);

  const quaternion = new Quaternion(), position = new Vector3();
  if (tumbling && tumble < 1) {
    // Keep going over the head: the long way round to upright, easing out of
    // the rotation already carried into the snow, with a bounce off the impact.
    const eased = 1 - (1 - tumble) ** 1.4;
    quaternion.setFromAxisAngle(axis, (tilt - Math.PI * 2) * eased).multiply(impact);
    const hop = new Vector3(0, 2.8 * tumble * (1 - tumble), 0);
    const rolled = TUMBLE_CENTER.clone().add(hop)
      .add(SPIN_ORIGIN.clone().sub(TUMBLE_CENTER).applyQuaternion(quaternion));
    position.copy(SPIN_ORIGIN).lerp(rolled, MathUtils.smoothstep(tumble, 0, 0.12));
  } else {
    const blend = tumbling ? 1 : MathUtils.smoothstep(elapsed, 0, IMPACT_BLEND);
    quaternion.copy(impact).slerp(rest, blend);
    position.copy(SPIN_ORIGIN).lerp(restPosition, blend);
  }
  return { shape, active: true, quaternion, position };
}
