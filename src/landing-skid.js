const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Small terrain hops should not steer or brake the skier on contact. Ease
// into the full landing response over the next second, with no threshold snap.
export function landingDriftStrength(airtime = 0) {
  const t = clamp(airtime - .7, 0, 1);
  return t * t * (3 - 2 * t);
}

// Heading follows travel; yawOffset is the remaining ski angle against it.
// Keep some sideways momentum while the edges gradually redirect the skier.
export function beginLandingSkid(s, landingYaw, openWorld, gradient) {
  const strength = landingDriftStrength(s.airtime);
  const incomingHeading = openWorld && Math.hypot(s.vx, s.vs) > .2
    ? s.heading + Math.atan2(Math.sin(-Math.atan2(s.vx, s.vs) - s.heading),
      Math.cos(-Math.atan2(s.vx, s.vs) - s.heading)) : s.heading;
  let slopeSkid = 0;
  let slopeLoss = 0;
  s.landingSlopeInfluence = 0;
  s.landingSlopeHeading = incomingHeading;
  if (openWorld && gradient && s.speed > .2) {
    const slope = Math.hypot(gradient.x, gradient.s);
    // The slope wins the eventual line, but redirect over the skid instead
    // of rotating the velocity instantly on the contact frame.
    const t = clamp((Math.atan(slope) * 180 / Math.PI - 8) / 20, 0, 1);
    const dx = -Math.sin(incomingHeading), ds = Math.cos(incomingHeading);
    const downX = slope > 0 ? -gradient.x / slope : 0;
    const downS = slope > 0 ? -gradient.s / slope : 0;
    const alignment = dx * downX + ds * downS;
    const weight = .9 * t * t * (3 - 2 * t) * strength;
    const mismatch = clamp((1 - alignment) / 2, 0, 1);
    s.landingSlopeInfluence = weight;
    if (weight > 0) s.landingSlopeHeading = -Math.atan2(
      dx * (1 - weight) + downX * weight,
      ds * (1 - weight) + downS * weight);
    slopeSkid = weight * Math.sqrt(mismatch);
    slopeLoss = .42 * weight * mismatch;
  }
  const relativeYaw = landingYaw + incomingHeading - s.heading;
  const halfTurns = Math.round(relativeYaw / Math.PI) * Math.PI;
  s.stanceYaw += halfTurns;
  s.yawOffset = relativeYaw - halfTurns;
  const downhillHeading = gradient ? -Math.atan2(-gradient.x, -gradient.s) : incomingHeading;
  const downhillTurn = Math.atan2(Math.sin(downhillHeading - incomingHeading), Math.cos(downhillHeading - incomingHeading));
  s.landingSkidDirection = slopeSkid > .1 && Math.abs(downhillTurn) > .01
    ? -Math.sign(downhillTurn) : Math.sign(s.yawOffset);
  s.heading = incomingHeading;
  s.landingRecovery = strength;
  s.landingSkid = Math.max(slopeSkid, Math.abs(Math.sin(s.yawOffset)) * strength) * clamp(s.speed / 8, 0, 1);
  const retention = 1 - .24 * s.landingSkid ** 2 - slopeLoss;
  s.speed *= retention;
  s.vx *= retention;
  s.vs *= retention;
}

export function advanceLandingSkid(s, dt, gradient) {
  const strength = landingDriftStrength(s.airtime);
  const recovering = s.landingRecovery > 0;
  const slope = gradient && strength > 0 ? Math.hypot(gradient.x, gradient.s) : 0;
  const slip = s.yawOffset;
  // On little hops, realign the pose without dragging the trajectory with it.
  const recovered = slip * (1 - Math.exp(-(12 - 7 * strength) * dt));
  // Steep snow offers less edge authority during touchdown: the skis wash
  // toward momentum instead of redirecting all of it across/up the slope.
  let turn = clamp(-.75 * recovered * strength / (1 + slope * 2),
    -2.2 * strength * dt, 2.2 * strength * dt);
  s.heading += turn;
  s.yawOffset -= recovered;
  let slopeSkid = 0;
  if (slope > 1e-6 && recovering) {
    const gravity = 31.05 / Math.hypot(1, slope);
    const ax = -gradient.x * gravity, as = -gradient.s * gravity;
    const dx = -Math.sin(s.heading), ds = Math.cos(s.heading);
    const rightX = ds, rightS = -dx;
    const downhill = ax * dx + as * ds;
    const grip = clamp(s.landingRecovery / .35, 0, 1);
    // Ground acceleration already includes gravity along travel. Add only
    // the missing cross-slope component, so downhill acceleration isn't doubled.
    const lateral = (ax * rightX + as * rightS) * dt * grip * strength;
    let vx = dx * s.speed + rightX * lateral;
    let vs = ds * s.speed + rightS * lateral;
    if (s.speed < .05 && downhill < 0 && !s.braking) {
      // Once uphill momentum runs out, slide back down rather than clamping
      // permanently to zero while the skis still point uphill.
      vx = ax * dt * strength;
      vs = as * dt * strength;
    }
    const speed = Math.hypot(vx, vs);
    if (speed > 1e-6) {
      let heading = -Math.atan2(vx, vs);
      const fallLine = -Math.atan2(-gradient.x, -gradient.s);
      // Recover toward the line chosen at contact. Following every tiny
      // terrain-gradient change would keep steering the skid into hollows.
      const target = s.landingSlopeHeading ?? fallLine;
      const difference = Math.atan2(Math.sin(target - heading), Math.cos(target - heading));
      const influence = (s.landingSlopeInfluence || 0) * grip * clamp(slope / .5, 0, 1);
      heading += difference * (1 - Math.exp(-3 * influence * dt));
      // Cap the whole ground redirection, including the gravity correction,
      // so even opposite/uphill arrivals visibly drift through the turn.
      const desired = Math.atan2(Math.sin(heading - s.heading), Math.cos(heading - s.heading));
      const slopeTurn = clamp(desired, -2.2 * strength * dt - turn, 2.2 * strength * dt - turn);
      s.heading += slopeTurn;
      s.yawOffset += slopeTurn;
      turn += slopeTurn;
      // Preserve visible ski yaw if the slide reverses into a switch stance.
      const halfTurns = Math.round(s.yawOffset / Math.PI) * Math.PI;
      s.stanceYaw += halfTurns;
      s.yawOffset -= halfTurns;
      s.switch = Math.abs(Math.round(s.stanceYaw / Math.PI) % 2) === 1;
      const mismatch = (1 - Math.cos(fallLine - s.heading)) / 2;
      slopeSkid = influence * Math.sqrt(mismatch);
      s.speed = speed;
    } else {
      s.speed = speed;
    }
    s.speed = Math.min(56, s.speed);
    // Keep slope recovery alive while still travelling uphill, including
    // straight landings with no yaw error, until gravity wins back the line.
    if (downhill < 0) s.landingRecovery = Math.max(.35 + dt, s.landingRecovery);
  }
  s.landingRecovery = Math.max(0, (s.landingRecovery || 0) - dt);
  if (s.landingRecovery === 0) s.landingSlopeInfluence = 0;
  s.landingSkid = Math.max(slopeSkid, Math.abs(Math.sin(s.yawOffset)) * strength) * clamp(s.speed / 8, 0, 1);
  if (Math.abs(turn) > 1e-6) s.landingSkidDirection = -Math.sign(turn);
  if (s.landingSkid < .001) s.landingSkidDirection = 0;
  s.speed *= Math.exp(-1.4 * s.landingSkid ** 2 * dt);
  return turn;
}
