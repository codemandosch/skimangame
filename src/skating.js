// Strong forward pushes taper smoothly as the skier reaches cruising speed.
export const SKATE_SPEED_LIMIT = 40; // m/s (144 km/h)
export function skatingEffort(state, input) {
  if (!input.skate || state.airborne || state.railing || state.bailTimer > 0 || input.brake) return 0;
  const t = Math.max(0, Math.min(1, state.speed / SKATE_SPEED_LIMIT));
  return 1 - t*t*(3-2*t);
}

export function applySkating(speed, effort, dt) {
  return speed + Math.min(Math.max(0, SKATE_SPEED_LIMIT-speed), effort * 60 * dt);
}
