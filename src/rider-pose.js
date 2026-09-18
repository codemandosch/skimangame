import { Vector3, Quaternion, Euler, MathUtils } from "three";
const v = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);
const damp = (a, b, k, dt) => MathUtils.lerp(a, b, 1 - Math.exp(-k * dt));

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
    tail: 0,
    blunt: 0,
    octo: 0,
    japan: 0,
    muteBlend: 0,
    tailBlend: 0,
    bluntBlend: 0,
    octoBlend: 0,
    japanBlend: 0,
    crouch: 0,
    tuck: 0,
    extension: 0,
    lookBack: 0,
    grounded: 1,
    bailDuration: 0,
    previousBailTimer: 0,
    wipeout: 0,
    daffy: 0,
    hips: v(),
    torsoRotation: new Euler(),
    torsoQuaternion: new Quaternion(),
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
  // Local lean reverses when the rider faces uphill; controls stay downhill-relative.
  p.lean = damp(p.lean, s.steer * (s.switch ? -1 : 1), 6, dt);
  // The edges engage first, then the skier's weight follows into the arc.
  p.edge = damp(p.edge, s.steer * (s.switch ? -1 : 1), 11, dt);
  p.carveSpeed = damp(p.carveSpeed, MathUtils.smoothstep(s.speed, 0, 24), 5, dt);
  p.grounded = damp(p.grounded, s.airborne ? 0 : 1, 7, dt);
  p.lookBack = damp(p.lookBack, s.switch ? 1 : 0, 7, dt);
  const grabRate = s.grab === 4 || s.grab === 5 ? 5 : 7;
  p.muteBlend = damp(p.muteBlend, s.airborne && s.grab === 1 ? 1 : 0, grabRate, dt);
  p.tailBlend = damp(p.tailBlend, s.airborne && s.grab === 2 ? 1 : 0, grabRate, dt);
  p.bluntBlend = damp(p.bluntBlend, s.airborne && s.grab === 3 ? 1 : 0, grabRate, dt);
  p.octoBlend = damp(p.octoBlend, s.airborne && s.grab === 4 ? 1 : 0, 5, dt);
  p.japanBlend = damp(p.japanBlend, s.airborne && s.grab === 5 ? 1 : 0, 3.5, dt);
  // Ease the beginning and end of a reach so a grab does not start at peak speed.
  p.mute = MathUtils.smoothstep(p.muteBlend, 0, 1);
  p.tail = MathUtils.smoothstep(p.tailBlend, 0, 1);
  p.blunt = MathUtils.smoothstep(p.bluntBlend, 0, 1);
  p.octo = MathUtils.smoothstep(p.octoBlend, 0, 1);
  p.japan = MathUtils.smoothstep(p.japanBlend, 0, 1);
  const rearGrab = p.tail + p.blunt;
  p.tuck = damp(p.tuck, s.tucking ? 1 : 0, 9, dt);
  p.extension = damp(
    p.extension,
    s.airborne && !s.grab
      ? 0.14 * Math.exp(-Math.pow(((s.airtime || 0) - 0.08) / 0.15, 2))
      : 0,
    18,
    dt,
  );
  p.crouch = damp(
    p.crouch,
    s.airborne
      ? 0.06
      : Math.min(0.42, s.charge * 0.24 + p.tuck * 0.2 + s.landingPulse),
    15,
    dt,
  );
  const grab = p.mute + rearGrab,
    ground = p.grounded,
    lean = p.lean * ground * (1 - p.wipeout) * (0.65 + p.carveSpeed * 0.35),
    edge = p.edge * ground * (1 - p.wipeout) * (0.55 + p.carveSpeed * 0.45),
    pressure = Math.abs(lean);
  // Contact wins over the trailing grab blend on the landing frame.
  const skiMute = s.airborne ? p.mute : 0;
  const skiTail = s.airborne ? rearGrab : 0;
  const skiOcto = s.airborne ? p.octo : 0;
  const skiJapan = s.airborne ? p.japan : 0;
  // Physics owns the clock, so the rendered legs and the landing rule agree.
  p.daffy = s.airborne ? MathUtils.smoothstep(s.daffyProgress || 0, 0, 1) : 0;
  const chatter =
    ground * Math.sin(s.time * 17) * Math.min(0.013, s.speed * 0.00045);
  p.hips.set(
    lean * 0.46 + p.mute * 0.14,
    0.99 -
      p.crouch -
      pressure * 0.17 +
      p.mute * 0.02 +
      rearGrab * 0.02 +
      p.extension +
      chatter,
    0.03 - p.mute * 0.05 + rearGrab * 0.03,
  );
  p.torsoRotation.set(
    -0.12 - p.crouch * 0.5 - p.tuck * 0.28 - p.mute * 0.3 - p.octo * 0.25,
    rearGrab * -0.62 - p.mute * 0.18 + lean * 0.1 - p.octo * 0.3,
    -lean * 0.52 + p.mute * 0.2,
  );
  // Open the shoulders along the split so each hand can reach its ski end.
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, -0.05, p.daffy);
  p.torsoRotation.y = MathUtils.lerp(p.torsoRotation.y, -0.9, p.daffy);
  p.torsoRotation.z *= 1 - p.daffy;
  // Open the opposite shoulder toward the folded ski behind the hips.
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, 0.15, p.japan);
  p.torsoRotation.y = MathUtils.lerp(p.torsoRotation.y, 0.85, p.japan);
  p.torsoRotation.z = MathUtils.lerp(p.torsoRotation.z, -0.12, p.japan);
  // Boots stay in their bindings while the knees fold and the back meets the snow.
  p.hips.lerp(v(0, 0.3, 0.48), p.wipeout);
  p.torsoRotation.x = MathUtils.lerp(p.torsoRotation.x, 1.62, p.wipeout);
  p.torsoRotation.y *= 1 - p.wipeout;
  p.torsoRotation.z *= 1 - p.wipeout;
  p.torsoQuaternion.setFromEuler(p.torsoRotation);
  p.skis = [];
  p.legs = [];
  p.arms = [];
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const position = v(
      side * (0.34 + Math.abs(lean) * 0.035),
      // Leave room below the pelvis for a squat instead of folding boots
      // up to hip height and forcing the knees out beside the torso.
      skiMute * (i ? 0.4 : 0.28) + skiTail * (i ? 0.5 : 0.44),
      skiMute * -0.12 + skiTail * 0.04 - side * lean * 0.1,
    );
    const rotation = new Euler(
      skiMute * 0.55 - skiTail * (i ? 1.05 : 0.58),
      // Mute and blunt cross at the tips; blunt still reaches for the tail.
      -side * 0.08 * ground + skiMute * side * 0.65 + skiTail * side * 0.06 + (s.airborne ? p.blunt : 0) * side * 0.59,
      -edge * 0.68 + skiMute * side * 0.06,
      "YXZ",
    );
    // Raise the front of one ski and the tail of the other into a crossed
    // two-hand reach, keeping the bindings below the pelvis.
    position.x += -side * skiOcto * 0.1;
    position.y += skiOcto * (i ? 0.36 : 0.42);
    position.z += skiOcto * (i ? -0.16 : -0.12);
    rotation.x += skiOcto * (i ? 0.7 : -1.0);
    rotation.y += skiOcto * (i ? 0.6 : 1.0);
    // Daffy splits the legs fore/aft without swapping sides: front nose up,
    // rear tail up, with a straighter front leg and a folded rear knee.
    position.lerp(v(side * 0.25, i ? 0.55 : 0.16, i ? 0.62 : -0.7), p.daffy);
    rotation.x = MathUtils.lerp(rotation.x, i ? -1.4 : 1.4, p.daffy);
    rotation.y *= 1 - p.daffy;
    rotation.z *= 1 - p.daffy;
    // Japan: extend leg 0 down/out while folding leg 1 back under the seat.
    position.lerp(i ? v(0.16, 1.12, 0.38) : v(-0.5, 0.03, -0.28), skiJapan);
    rotation.x = MathUtils.lerp(rotation.x, i ? -1.1 : 0.25, skiJapan);
    rotation.y = MathUtils.lerp(rotation.y, -0.3, skiJapan);
    rotation.z = MathUtils.lerp(rotation.z, i ? -0.2 : 0.05, skiJapan);
    const quaternion = new Quaternion().setFromEuler(rotation);
    const boot = v(0, 0.22, -0.02).applyQuaternion(quaternion).add(position);
    p.skis.push({ position, quaternion, boot });
    const hip = v(side * 0.18, 0, 0)
      .applyQuaternion(p.torsoQuaternion)
      .add(p.hips);
    const kneePole = v(side * (0.45 - p.mute * 0.2) + lean * 0.42,
      0.6 + p.mute * 0.2 + rearGrab * 0.9, -1.1);
    kneePole.lerp(v(side * 0.3, i ? 0.35 : 0.65, i ? 0.05 : -1.1), p.daffy);
    kneePole.lerp(v(side * 0.35, 0.5, -0.8), skiJapan);
    const leg = solveLimb(
      hip,
      boot,
      kneePole,
      0.51,
      0.5,
    );
    p.legs.push({ hip, knee: leg.joint, foot: leg.end, kneePole });
  }
  const muteAnchor = v(-0.075, 0.115, -1.0)
    .applyQuaternion(p.skis[1].quaternion)
    .add(p.skis[1].position);
  const tailAnchor = v(0.065, 0.115, 1.05)
    .applyQuaternion(p.skis[1].quaternion)
    .add(p.skis[1].position);
  // Cap the very end of the same-side ski for blunt.
  const bluntAnchor = v(0, 0.115, 1.2)
    .applyQuaternion(p.skis[1].quaternion)
    .add(p.skis[1].position);
  const rearAnchor = tailAnchor.clone().lerp(bluntAnchor, rearGrab > 0 ? p.blunt / rearGrab : 0);
  const octoAnchors = [
    v(-0.065, 0.115, -1.05).applyQuaternion(p.skis[1].quaternion).add(p.skis[1].position),
    v(0.065, 0.115, 1.15).applyQuaternion(p.skis[0].quaternion).add(p.skis[0].position),
  ];
  const daffyAnchors = p.skis.map((ski, i) =>
    v(0, 0.115, i ? 1.2 : -1.2).applyQuaternion(ski.quaternion).add(ski.position));
  const japanAnchor = v(0, -0.035, 0)
    .applyQuaternion(p.skis[1].quaternion).add(p.skis[1].position);
  p.grabAnchor.copy(s.grab === 5 ? japanAnchor : s.grab === 3 ? bluntAnchor : s.grab === 2 ? tailAnchor : muteAnchor);
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const shoulder = v(side * 0.32, 0.61, -0.045)
      .applyQuaternion(p.torsoQuaternion)
      .add(p.hips);
    const normal = v(
      side * (0.59 + (1 - ground) * 0.13 - p.tuck * 0.15) + lean * 0.4,
      1.1 - p.crouch * 0.55 - p.tuck * 0.1 + (1 - ground) * 0.13 - pressure * 0.12 - side * lean * 0.12,
      -0.4 - Math.abs(lean) * 0.08 - p.tuck * 0.16,
    );
    const target = normal.clone();
    if (i === 0) target.lerp(muteAnchor, p.mute);
    if (i === 1) target.lerp(rearAnchor, rearGrab);
    target.lerp(octoAnchors[i], p.octo);
    target.lerp(daffyAnchors[i], p.daffy);
    if (i === 0) target.lerp(japanAnchor, p.japan);
    target.lerp(v(side * 0.64, 0.24, 0.93), p.wipeout);
    const limb = solveLimb(
      shoulder,
      target,
      v(side * 1.1 + lean * 0.2, 1.25, 0.25),
      0.42,
      0.4,
    );
    p.arms.push({
      shoulder,
      elbow: limb.joint,
      hand: limb.end,
      grip: Math.min(1, (i === 0 ? p.mute + p.japan : rearGrab) + p.octo + p.daffy),
      grabAnchor: i === 0 && s.grab === 5 ? japanAnchor : p.daffy > 0 ? daffyAnchors[i] : s.grab === 4 ? octoAnchors[i] : i === 0 ? muteAnchor : rearAnchor,
      // Octo's rear hand holds ski 0; every other grab holds ski 1.
      gripQuaternion: p.skis[1].quaternion.clone().slerp(p.skis[i === 0 ? 1 : 0].quaternion, p.octo)
        .slerp(p.skis[i].quaternion, p.daffy),
    });
  }
  return p;
}
