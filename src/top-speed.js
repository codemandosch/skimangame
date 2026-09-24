// Snow speed builds freely to cruising pace, then eases into a ceiling so
// long or steep lines level off instead of hitting a wall.
export const TOP_SPEED = 50; // m/s (180 km/h)
export const TOP_SPEED_EASE_START = 36; // m/s (130 km/h)
const OVERSPEED_BLEED = 1.2; // 1/s, relaxes launch or landing surplus back to the cap

export function easeTopSpeed(speed, accel) {
  if (speed > TOP_SPEED) return Math.min(accel, (TOP_SPEED - speed) * OVERSPEED_BLEED);
  if (accel <= 0 || speed <= TOP_SPEED_EASE_START) return accel;
  const t = (speed - TOP_SPEED_EASE_START) / (TOP_SPEED - TOP_SPEED_EASE_START);
  return accel * (1 - t * t * (3 - 2 * t));
}
