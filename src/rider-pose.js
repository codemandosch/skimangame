import { Vector3, Quaternion, Euler, MathUtils } from "three";
import { wipeoutMotion } from "./wipeout-pose.js";
const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const damp = (a, b, k, dt) => MathUtils.lerp(a, b, 1 - Math.exp(-k * dt));
// Each ski's distance from the rider's centreline in the relaxed on-snow stance.
export const SNOW_SKI_OFFSET = 0.16;

// Two-bone IK: preserve limb lengths, bend toward a pole, and clamp unreachable targets.
export function solveLimb(start, target, pole, upper, lower) {
  const direction = target.clone().sub(start),
    distance = MathUtils.clamp(
      direction.length(),
      Math.abs(upper - lower) + 1e-5,
      upper + lower - 1e-5,
    );
  direction.normalize();
  const along =
    (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const perpendicular = pole
    .clone()
    .sub(start)
    .addScaledVector(direction, -pole.clone().sub(start).dot(direction));
  if (perpendicular.lengthSq() < 1e-8)
    perpendicular.set(0, 0, -1).addScaledVector(direction, direction.z);
  perpendicular.normalize();
  const elbow = start
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(
      perpendicular,
      Math.sqrt(Math.max(0, upper * upper - along * along)),
    );
  return {
    joint: elbow,
    end: start.clone().addScaledVector(direction, distance),
  };
}

export function createRiderPose() {
  return {
    lean: 0,
    edge: 0,
    carveSpeed: 0,
    mute: 0,
    safety: 0,
    blunt: 0,
    octo: 0,
    japan: 0,
    hangout: 0,
    bow: 0,
    muteBlend: 0,
    safetyBlend: 0,
    bluntBlend: 0,
    octoBlend: 0,
    japanBlend: 0,
    hangoutBlend: 0,
    bowBlend: 0,
    raiseBlend: 0,
    // Per-arm blend toward trailing behind the hip on the inside of a turn.
    trail: [0, 0],
    crouch: 0,
    skid: 0,
    tuck: 0,
    extension: 0,
    lookBack: 0,
    grounded: 1,
    skate: 0,
    bailDuration: 0,
    previousBailTimer: 0,
    wipeout: 0,
    // Wipeout body shapes (back, face, slam, tuck) and the whole-body motion
    // that replaces the aerial rotation while the rider is down.
    crash: { back: 0, face: 0, slam: 0, tuck: 0, limp: 0, side: 1 },
    crashActive: false,
    crashQuaternion: new Quaternion(),
    crashPosition: v(0, 1, 0),
    daffy: 0,
    hips: v(),
    torsoRotation: new Euler(),
    torsoQuaternion: new Quaternion(),
    // Extra forward curl and sideways bend through the spine, in radians.
    spineCurl: 0,
    spineBend: 0,
    // How much of the relaxed, narrow on-snow stance applies (0 in the air).
    snowStance: 0,
    // How much of the default in-air tuck applies (grabs take over from it).
    airTuck: 0,
    skis: [],
    legs: [],
    arms: [],
    grabAnchor: v(),
  };
}

export function updateRiderPose(p, s, dt) {
  const remaining = s.bailTimer || 0;
  if (remaining > p.previousBailTimer) p.bailDuration = remaining;
  p.previousBailTimer = remaining;
  // Drop back quickly, rest on the snow, then take longer to stand up.
  p.wipeout = remaining > 0
    ? MathUtils.smoothstep(p.bailDuration - remaining, 0, 0.28)
      * MathUtils.smoothstep(remaining, 0, 0.7)
    : 0;
  const motion = wipeoutMotion(p, s, remaining);
  const crash = p.crash = motion.shape;
  p.crashActive = motion.active;
  if (motion.active) {
    p.crashQuaternion.copy(motion.quaternion);
    p.crashPosition.copy(motion.position);
  }
  const onSnow = !s.airborne && !s.railing && !remaining;
  const skid = onSnow ? MathUtils.clamp((s.landingSkid || 0) * 1.5, 0, 1) : 0;
  p.skid = damp(p.skid, skid, skid > p.skid ? 14 : 7, dt);
  const stance = s.switch ? -1 : 1;
  const skidDirection = (s.landingSkidDirection || Math.sign(s.yawOffset || 0))
    * stance * Math.cos(s.yawOffset || 0);
  const carve = (s.steer || 0) * stance;
  // Follow the actual skid, even with neutral or opposite steering input.
  // Reverse local lean in switch so the world-space direction stays correct.
  const leanTarget = carve * (1 - skid) + skidDirection * skid * 1.15;
  p.lean = damp(p.lean, s.railing ? 0 : leanTarget, skid > 0 ? 12 : 6, dt);
  // The edges engage first, then the skier's weight follows into the arc.
  p.edge = damp(p.edge, s.railing ? 0 : carve * (1 - skid) + skidDirection * skid * .45, 11, dt);
  p.carveSpeed = damp(p.carveSpeed, MathUtils.smoothstep(s.speed, 0, 24), 5, dt);
  p.grounded = damp(p.grounded, s.airborne ? 0 : 1, 7, dt);
  p.skate = damp(p.skate, !s.airborne && !s.railing && !remaining ? (s.skating || 0) : 0, 10, dt);
  const skate = !s.airborne && !s.railing && !remaining ? p.skate : 0;
  const stride = Math.sin(s.skatePhase || 0);
  // Alternate ski pushes; both hands plant and drive back together each beat.
  const poleStroke = (1 - Math.cos((s.skatePhase || 0) * 2)) * .5;
  p.lookBack = damp(p.lookBack, s.switch ? 1 : 0, 7, dt);
  const grabRate = s.grab === 4 || s.grab === 5 ? 5 : 7;
  p.muteBlend = damp(p.muteBlend, s.airborne && s.grab === 1 ? 1 : 0, grabRate, dt);
  p.safetyBlend = damp(p.safetyBlend, s.airborne && s.grab === 2 ? 1 : 0, grabRate, dt);
  p.bluntBlend = damp(p.bluntBlend, s.airborne && s.grab === 3 ? 1 : 0, grabRate, dt);
  p.octoBlend = damp(p.octoBlend, s.airborne && s.grab === 4 ? 1 : 0, 5, dt);
  p.japanBlend = damp(p.japanBlend, s.airborne && s.grab === 5 ? 1 : 0, 3.5, dt);
  p.hangoutBlend = damp(p.hangoutBlend, s.airborne && s.grab === 6 ? 1 : 0, 5, dt);
  p.bowBlend = damp(p.bowBlend, s.airborne && s.grab === 7 ? 1 : 0, 4, dt);
  // Ease the beginning and end of a reach so a grab does not start at peak speed.
  p.mute = MathUtils.smoothstep(p.muteBlend, 0, 1);
  p.safety = MathUtils.smoothstep(p.safetyBlend, 0, 1);
  p.blunt = MathUtils.smoothstep(p.bluntBlend, 0, 1);
  p.octo = MathUtils.smoothstep(p.octoBlend, 0, 1);
  p.japan = MathUtils.smoothstep(p.japanBlend, 0, 1);
  p.hangout = MathUtils.smoothstep(p.hangoutBlend, 0, 1);
  p.bow = MathUtils.smoothstep(p.bowBlend, 0, 1);
  // Mute and Japan throw the free hand up; it rises and settles more slowly
  // than the grab so switching grabs does not yank the arm across the body.
  p.raiseBlend = damp(p.raiseBlend, s.airborne && (s.grab === 1 || s.grab === 5) ? 1 : 0, s.airborne ? 4 : 10, dt);
  const raise = MathUtils.smoothstep(p.raiseBlend, 0, 1);
  const rearGrab = p.blunt;
  p.tuck = damp(p.tuck, s.tucking ? 1 : 0, 9, dt);
  p.extension = damp(
    p.extension,
    s.airborne && !s.grab
      ? 0.14 * Math.exp(-Math.pow(((s.airtime || 0) - 0.08) / 0.15, 2))
      : 0,
    18,
    dt,
  );
  const crouchTarget = s.railing ? .23 : s.airborne ? .06
    // Holding Space (tuck + charge) only softens the knees a little more; the
    // chest does the work by folding further forward over the skis.
    : Math.min(.52, s.charge * .05 + p.tuck * .09 + (s.landingPulse || 0) + p.skid * .28);
  p.crouch = damp(
    p.crouch,
    crouchTarget,
    crouchTarget > p.crouch ? 18 : 7,
    dt,
  );
  const grab = p.mute + p.safety + rearGrab,
    ground = p.grounded,
    lean = p.lean * ground * (1 - p.wipeout) * (0.65 + p.carveSpeed * 0.35),
    edge = p.edge * ground * (1 - p.wipeout) * (0.55 + p.carveSpeed * 0.45),
    pressure = Math.min(1, Math.abs(lean));
  // On snow the rider stands relaxed: knees soft, chest forward, skis narrow.
  const snow = p.snowStance = ground * (1 - p.wipeout);
  // Contact wins over the trailing grab blend on the landing frame.
  const skiMute = s.airborne ? p.mute : 0;
  const skiRear = s.airborne ? rearGrab : 0;
  const skiBlunt = s.airborne ? p.blunt : 0;
  const skiSafety = s.airborne ? p.safety : 0;
  const skiOcto = s.airborne ? p.octo : 0;
  const skiJapan = s.airborne ? p.japan : 0;
  const skiHangout = s.airborne ? p.hangout : 0;
  const skiBow = s.airborne ? p.bow : 0;
  // Physics owns the clock, so the rendered legs and the landing rule agree.
  p.daffy = s.airborne ? MathUtils.smoothstep(s.daffyProgress || 0, 0, 1) : 0;
  // In the air without a grab the rider folds at the hips with the skis
  // together; any grab or daffy takes over from it completely.
  const grabbing = Math.min(1, p.mute + p.safety + p.blunt + p.octo + p.japan + p.hangout + p.bow + p.daffy);
  // The legs reach back down for the snow in the last moments before touchdown,
  // so landing does not snap the boots back under the hips.
  const secondsToSnow = (s.airHeight ?? Infinity) / Math.max(1, -(s.vy || 0));
  const reachForSnow = (s.vy || 0) < 0 ? 1 - MathUtils.smoothstep(secondsToSnow, 0.1, 0.35) : 0;
  const air = p.airTuck = s.airborne ? (1 - ground) * (1 - grabbing) * (1 - reachForSnow) : 0;
  const chatter =
    (s.railing ? 0 : ground) * Math.sin(s.time * 17) * Math.min(0.013, s.speed * 0.00045);
  p.hips.set(
    lean * 0.46 + p.mute * 0.04,
    0.99 -
      p.crouch -
      pressure * 0.17 +
      p.mute * 0.02 +
      rearGrab * 0.02 +
      p.extension +
      chatter -
      snow * 0.05,
    0.03 + p.mute * 0.02 + rearGrab * 0.03,
  );
  p.torsoRotation.set(
    -0.12 - snow * 0.16 - air * 0.3 - p.crouch * 0.5 - p.tuck * 0.6 - p.octo * 0.25,
    rearGrab * -0.62 + lean * 0.1 - p.octo * 0.3,
    -lean * (0.52 + p.skid * .16),
  );
  // Mute curls the chest over the tucked knees and turns it toward the grabbed
  // ski, dropping the reaching shoulder instead of stretching the arm.
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -0.46, p.mute);
  p.torsoRotation.y = MathUtils.lerp(p.torsoRotation.y, -0.42, p.mute);
  p.torsoRotation.z = MathUtils.lerp(p.torsoRotation.z, 0.3, p.mute);
  // Open the shoulders along the split so each hand can reach its ski end.
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -0.05, p.daffy);
  p.torsoRotation.y = MathUtils.lerp(p.torsoRotation.y, -0.9, p.daffy);
  p.torsoRotation.z *= 1 - p.daffy;
  // Japan turns the chest toward the tucked ski and drops the reaching shoulder.
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -0.6, p.japan);
  p.torsoRotation.y = MathUtils.lerp(p.torsoRotation.y, -0.35, p.japan);
  p.torsoRotation.z = MathUtils.lerp(p.torsoRotation.z, 0.25, p.japan);
  // Safety bows the body sideways: hips out to the left, chest leaning over
  // toward the skis that hang off the right side.
  p.hips.x -= 0.14 * p.safety;
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -0.2, p.safety);
  p.torsoRotation.y = MathUtils.lerp(p.torsoRotation.y, 0, p.safety);
  p.torsoRotation.z = MathUtils.lerp(p.torsoRotation.z, -0.45, p.safety);
  p.spineCurl = -0.15 * air - 0.25 * p.mute - 0.1 * p.safety - 0.4 * p.japan;
  p.spineBend = -0.35 * p.safety - 0.1 * p.japan + 0.3 * p.bow;
  // Relax into an open, arched posture; aerial rotation remains physics-owned.
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, Math.PI / 2 + 0.15, p.hangout);
  p.torsoRotation.y *= 1 - p.hangout;
  p.torsoRotation.z *= 1 - p.hangout;
  // Lean toward the extended leg to keep both ski grips within reach.
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -0.35, p.bow);
  p.torsoRotation.y = MathUtils.lerp(p.torsoRotation.y, -0.15, p.bow);
  p.torsoRotation.z = MathUtils.lerp(p.torsoRotation.z, 0.6, p.bow);
  p.hips.x += stride * skate * .12;
  p.hips.y -= skate * (.06 + poleStroke * .09);
  p.torsoRotation.x -= skate * (.12 + poleStroke * .22);
  // Boots stay in their bindings while the knees fold and the back meets the snow.
  p.hips.lerp(v(0, 0.3, 0.48), crash.back);
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, 1.62, crash.back);
  // Faceplant: kneel over the skis and lay the chest down ahead of the boots.
  p.hips.lerp(v(0, 0.36, -0.3), crash.face);
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -1.55, crash.face);
  // Side slam: sit low on the downhill hip and lay the shoulder on the snow.
  p.hips.lerp(v(crash.side * 0.2, 0.55, 0.12), crash.slam);
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -0.25, crash.slam);
  p.torsoRotation.z = MathUtils.lerp(p.torsoRotation.z, -crash.side * 0.2, crash.slam);
  // Tumbling: balled up with the knees pulled in.
  p.hips.lerp(v(0, 0.62, 0.05), crash.tuck);
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -0.95, crash.tuck);
  p.torsoRotation.y *= 1 - p.wipeout;
  if (!crash.slam) p.torsoRotation.z *= 1 - p.wipeout;
  p.spineCurl *= 1 - p.wipeout;
  p.spineBend *= 1 - p.wipeout;
  p.torsoQuaternion.setFromEuler(p.torsoRotation);
  p.skis = [];
  p.legs = [];
  p.arms = [];
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const position = v(
      side * (MathUtils.lerp(0.34, SNOW_SKI_OFFSET, snow) + Math.abs(lean) * 0.035),
      // Leave room below the pelvis for a squat instead of folding boots
      // up to hip height and forcing the knees out beside the torso.
      skiRear * (i ? 0.5 : 0.44),
      skiRear * 0.04 - side * lean * 0.1,
    );
    const rotation = new Euler(
      -skiRear * (i ? 1.05 : 0.58),
      // Blunt crosses the skis at the tips while reaching for the tail's end.
      skiRear * side * 0.06 + skiBlunt * side * 0.59,
      -edge * 0.68,
      "YXZ",
    );
    // Freestyle air: fold at the hips with the thighs up toward the chest and
    // the knees only half bent, boots out ahead and tips up, rather than a
    // ski jumper kneeling with the chest over the knees.
    position.lerp(v(side * 0.15, 0.5, -0.74), air);
    rotation.x = MathUtils.lerp(rotation.x, 0.5, air);
    // Safety: both skis parallel and close together, tweaked out to the right
    // of the tucked knees and rolled onto their sides, bases facing out.
    position.lerp(i ? v(0.6, 0.6, -0.12) : v(0.44, 0.56, -0.08), skiSafety);
    rotation.x = MathUtils.lerp(rotation.x, 0.1, skiSafety);
    rotation.y = MathUtils.lerp(rotation.y, 0, skiSafety);
    rotation.z = MathUtils.lerp(rotation.z, 1.5, skiSafety);
    // Mute pulls both knees up together and crosses the skis in an X just in
    // front of the boots; the grabbed ski rides on top, rolled toward the hand.
    position.lerp(i ? v(0.08, 0.56, -0.24) : v(-0.1, 0.46, -0.16), skiMute);
    rotation.x = MathUtils.lerp(rotation.x, i ? 0.3 : 0.18, skiMute);
    rotation.y = MathUtils.lerp(rotation.y, i ? 0.6 : -0.45, skiMute);
    rotation.z = MathUtils.lerp(rotation.z, i ? 0.3 : -0.12, skiMute);
    // Octo tucks both knees together like a mute, then lifts the nose of one
    // ski and the tail of the other so the pair crosses in an X. Rotations
    // add on top of a fading blunt so its held tail is not whipped away.
    position.lerp(i ? v(0.08, 0.5, -0.2) : v(-0.1, 0.46, -0.04), skiOcto);
    rotation.x += skiOcto * (i ? 0.7 : -0.9);
    rotation.y += skiOcto * (i ? 0.55 : 0.6);
    rotation.z += skiOcto * (i ? 0.2 : -0.1);
    // Daffy splits the legs fore/aft without swapping sides: front nose up,
    // rear tail up, with a straighter front leg and a folded rear knee.
    position.lerp(v(side * 0.25, i ? 0.55 : 0.16, i ? 0.62 : -0.7), p.daffy);
    rotation.x = MathUtils.lerp(rotation.x, i ? -1.4 : 1.4, p.daffy);
    rotation.y *= 1 - p.daffy;
    rotation.z *= 1 - p.daffy;
    // Japan: poke leg 0 long, forward and down while leg 1 folds knee-down,
    // pulling its boot up under the seat so that ski runs fore-aft at hip
    // height behind the poked leg.
    position.lerp(i ? v(-0.06, 0.6, 0.22) : v(-0.23, 0.05, -0.74), skiJapan);
    rotation.x = MathUtils.lerp(rotation.x, i ? 0.12 : 0.35, skiJapan);
    rotation.y = MathUtils.lerp(rotation.y, i ? -0.05 : -0.25, skiJapan);
    rotation.z = MathUtils.lerp(rotation.z, i ? -0.35 : 0.2, skiJapan);
    position.lerp(v(side * 0.24, i ? 0.36 : 0.28, -0.1), skiHangout);
    rotation.x = MathUtils.lerp(rotation.x, 0.15, skiHangout);
    rotation.y = MathUtils.lerp(rotation.y, side * 0.35, skiHangout);
    rotation.z = MathUtils.lerp(rotation.z, 0, skiHangout);
    // Bow and Arrow extends one boot sideways and folds the other inward.
    position.lerp(i ? v(-0.2, 0.68, -0.12) : v(-1.16, 0.85, -0.24), skiBow);
    rotation.x = MathUtils.lerp(rotation.x, i ? 0.9 : 0.1, skiBow);
    rotation.y = MathUtils.lerp(rotation.y, i ? -0.25 : 0, skiBow);
    rotation.z = MathUtils.lerp(rotation.z, i ? 0.1 : -1.25, skiBow);
    // Side slam: the top leg goes slack and drops over beside the bottom
    // one, knee drawn forward, instead of staying stacked in the air.
    if (side !== crash.side) {
      const slack = crash.slam * crash.limp;
      position.x = MathUtils.lerp(position.x, crash.side * 0.24, slack);
      position.y += 0.12 * slack;
      position.z -= 0.42 * slack;
    }
    // Faceplant: the tips dig in and the tails kick up behind the rider.
    rotation.x -= 0.3 * crash.face;
    position.y += 0.44 * crash.face;
    position.z -= 0.07 * crash.face;
    const push = Math.max(0, stride * side), recover = Math.max(0, -stride * side);
    position.x += side * push * skate * .22;
    position.z += side * stride * skate * .22;
    position.y += recover * skate * .07;
    rotation.y += side * skate * (.12 + push * .25);
    rotation.z += side * push * skate * .12;
    const quaternion = new Quaternion().setFromEuler(rotation);
    const boot = v(0, 0.22, -0.02).applyQuaternion(quaternion).add(position);
    p.skis.push({ position, quaternion, boot });
    const hip = v(side * 0.18, 0, 0)
      .applyQuaternion(p.torsoQuaternion)
      .add(p.hips);
    const kneePole = v(side * MathUtils.lerp(0.45, 0.18, snow) + lean * 0.42, 0.6 + rearGrab * 0.9, -1.1);
    kneePole.lerp(v(side * 0.14, 1.6, -1.0), air);
    // Knees stay together and drive up toward the chest.
    kneePole.lerp(v(side * 0.12, 1.35, -1.2), skiMute + skiOcto);
    // Safety knees fold up together and point forward toward the skis' side.
    kneePole.lerp(v(side * 0.1 + 0.4, 1.2, -1.1), skiSafety);
    kneePole.lerp(v(side * 0.3, i ? 0.35 : 0.65, i ? 0.05 : -1.1), p.daffy);
    kneePole.lerp(i ? v(0.25, -0.5, -0.6) : v(-0.3, 1.2, -1.2), skiJapan);
    kneePole.lerp(i ? v(0.35, 0.65, -0.9) : v(-0.7, 0.95, -0.5), skiBow);
    kneePole.lerp(v(side * 0.3, -1, 0.3), crash.face);
    kneePole.lerp(v(side * 0.15, 1.3, -1.2), crash.tuck);
    // Both slam knees sag toward the snow side, the top one resting on the bottom.
    kneePole.lerp(v(crash.side * (side === crash.side ? 0.25 : 0.6), 0.5, -1.1), crash.slam);
    const leg = solveLimb(
      hip,
      boot,
      kneePole,
      0.51,
      0.5,
    );
    p.legs.push({ hip, knee: leg.joint, foot: leg.end, kneePole });
  }
  // Just in front of the toe piece on the outside edge, not out at the tip.
  const muteAnchor = v(0.06, 0.115, -0.34)
    .applyQuaternion(p.skis[1].quaternion)
    .add(p.skis[1].position);
  // Outside edge of the right ski, directly under the boot.
  const safetyAnchor = v(0.07, 0.1, 0.02)
    .applyQuaternion(p.skis[1].quaternion)
    .add(p.skis[1].position);
  // Cap the very end of the same-side ski for blunt.
  const bluntAnchor = v(0, 0.115, 1.2)
    .applyQuaternion(p.skis[1].quaternion)
    .add(p.skis[1].position);
  const octoAnchors = [
    v(-0.065, 0.115, -1.05).applyQuaternion(p.skis[1].quaternion).add(p.skis[1].position),
    v(0.065, 0.115, 1.15).applyQuaternion(p.skis[0].quaternion).add(p.skis[0].position),
  ];
  const daffyAnchors = p.skis.map((ski, i) =>
    v(0, 0.115, i ? 1.2 : -1.2).applyQuaternion(ski.quaternion).add(ski.position));
  const bowAnchors = p.skis.map((ski, i) =>
    v(0, 0.115, i ? -0.65 : -0.05).applyQuaternion(ski.quaternion).add(ski.position));
  // Inside edge of the tucked ski, just in front of the toe piece.
  const japanAnchor = v(-0.07, 0.1, -0.35)
    .applyQuaternion(p.skis[1].quaternion).add(p.skis[1].position);
  p.grabAnchor.copy(s.grab === 5 ? japanAnchor : s.grab === 3 ? bluntAnchor : s.grab === 2 ? safetyAnchor : muteAnchor);
  // A free hand thrown up beside the helmet, relative to the chest.
  const raisedHand = v(0.6, 0.66, 0.08).applyQuaternion(p.torsoQuaternion).add(p.hips);
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const shoulder = v(side * 0.32, 0.61, -0.045)
      .applyQuaternion(p.torsoQuaternion)
      .add(p.hips);
    // Relaxed hands ride ahead of the hips. In a turn the inside hand drops
    // back behind the hip while the outside hand stays low and close, just
    // ahead of the body.
    const inside = MathUtils.clamp(side * lean, 0, 1), outside = MathUtils.clamp(-side * lean, 0, 1);
    // The arm swings between leading and trailing over a few frames so a quick
    // edge change does not whip the hand from behind the hip to the front.
    p.trail[i] = damp(p.trail[i], MathUtils.smoothstep(inside, 0, 0.6), 8, dt);
    const trailing = MathUtils.smoothstep(p.trail[i], 0, 1) * snow;
    const normal = v(
      side * (0.59 - snow * 0.14 + (1 - ground) * 0.13 - outside * 0.12)
        + lean * (0.4 + snow * 0.45),
      1.1 - snow * 0.06 - p.crouch * 0.55 - p.tuck * 0.12 + (1 - ground) * 0.13 - pressure * 0.12
        - outside * 0.1,
      -0.4 - snow * 0.1 - p.tuck * 0.12 + outside * 0.1,
    );
    // Tucked in the air, the hands sit forward over the knees.
    normal.lerp(v(side * 0.45, 0.32, -0.42).add(p.hips), air);
    // Crouched to pop, the arms hang nearly straight in front of the knees.
    const crouchedArms = p.tuck * snow;
    normal.lerp(v(side * 0.3 + lean * 0.3, -0.24, -0.6).add(p.hips), crouchedArms);
    // The inside arm hangs almost straight, down and back beside the hip.
    normal.lerp(v(side * 0.37, 0.03, 0.26).applyQuaternion(p.torsoQuaternion).add(p.hips), trailing);
    const target = normal.clone();
    target.lerp(v(side*.53, 1.3-poleStroke*.5, -.65+poleStroke*.96), skate);
    if(s.railing)target.set(side*.86,1.23,-.16);
    if (i === 0) target.lerp(muteAnchor, p.mute);
    // The free hand rises beside the head for balance and style.
    else target.lerp(raisedHand, raise);
    if (i === 1) target.lerp(bluntAnchor, rearGrab);
    if (i === 1) target.lerp(safetyAnchor, p.safety);
    // The free hand trails out and back, relative to the chest.
    else target.lerp(v(-0.62, 0.38, 0.1).applyQuaternion(p.torsoQuaternion).add(p.hips), p.safety);
    target.lerp(octoAnchors[i], p.octo);
    target.lerp(daffyAnchors[i], p.daffy);
    if (i === 0) target.lerp(japanAnchor, p.japan);
    target.lerp(v(side * 0.96, 0.52, 0).applyQuaternion(p.torsoQuaternion).add(p.hips), p.hangout);
    target.lerp(bowAnchors[i], p.bow);
    target.lerp(v(side * 0.64, 0.24, 0.93), crash.back);
    // Brace on the snow ahead of the face.
    target.lerp(v(side * 0.5, 0.05, -1.25), crash.face);
    // One arm catches the fall on the slam side; the other flails overhead.
    target.lerp(side === crash.side ? v(side * 0.45, 0.9, -0.3) : v(side * 0.35, 1.45, 0.25), crash.slam);
    // Then the free arm flops down across the chest onto the snow.
    if (side !== crash.side) target.lerp(v(crash.side * 0.32, 0.55, -0.5), crash.slam * crash.limp);
    target.lerp(v(side * 0.3, 0.55, -0.5), crash.tuck);
    const elbowPole = v(side * 1.1 + lean * 0.15, 1.3, 0.3);
    // Crouched or trailing arms bend their elbows backward, not out to the side.
    elbowPole.lerp(v(side * 0.3, -0.3, 1).applyQuaternion(p.torsoQuaternion).add(shoulder), crouchedArms);
    elbowPole.lerp(v(side * 0.3, -0.3, 1).applyQuaternion(p.torsoQuaternion).add(shoulder), trailing);
    // A raised free arm keeps its elbow out and back rather than flipping.
    if (i === 1) elbowPole.lerp(v(1.4, 0.6, 0.2), raise);
    // Slam elbows fold along the snow rather than digging into it.
    elbowPole.lerp(side === crash.side ? v(side * 0.2, 2, 0.3) : v(crash.side * 0.2, 1, -0.8), crash.slam);
    const limb = solveLimb(shoulder, target, elbowPole, 0.42, 0.4);
    p.arms.push({
      shoulder,
      elbow: limb.joint,
      elbowPole,
      hand: limb.end,
      // Poles sweep further back while crouched to pop.
      polePitch: MathUtils.lerp(-.6 - crouchedArms * .6, -.12-poleStroke*.95, skate),
      grip: Math.min(1, (i === 0 ? p.mute + p.japan : rearGrab + p.safety) + p.octo + p.daffy + p.bow),
      grabAnchor: s.grab === 7 ? bowAnchors[i] : i === 0 && s.grab === 5 ? japanAnchor : p.daffy > 0 ? daffyAnchors[i] : s.grab === 4 ? octoAnchors[i] : i === 0 ? muteAnchor : s.grab === 2 ? safetyAnchor : bluntAnchor,
      // Octo's rear hand holds ski 0; every other grab holds ski 1.
      gripQuaternion: p.skis[1].quaternion.clone().slerp(p.skis[i === 0 ? 1 : 0].quaternion, p.octo)
        .slerp(p.skis[i].quaternion, p.daffy).slerp(p.skis[i].quaternion, p.bow),
    });
  }
  return p;
}
