const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// Presentation only: keep the contact position and momentum in physics intact.
export function captureLandingImpact(s, slope = 0) {
  const size = clamp(((s.airtime || 0) - .7) / 2.3, 0, 1);
  return {
    x: s.x, s: s.s, heading: s.heading || 0, time: s.time || 0,
    strength: size / Math.hypot(1, slope * .65),
  };
}

export function landingPowderPressure(s) {
  if (!s.landingImpact || s.airborne || s.railing || s.bailTimer > 0) return 0;
  const age = Math.max(0, (s.time || 0) - s.landingImpact.time);
  return s.landingImpact.strength * Math.pow(Math.max(0, 1 - age / .85), 2);
}

export function landingSink(s) {
  if (!s.landingImpact) return 0;
  const age = Math.max(0, (s.time || 0) - s.landingImpact.time);
  // Punch into the powder over the first few frames, then rise out smoothly.
  return .38 * landingPowderPressure(s) * (.45 + .55 * Math.min(1, age / .065));
}
