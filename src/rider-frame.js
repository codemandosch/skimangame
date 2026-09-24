import { COURSE, groundHeight } from './course.js';
import { groundFrame } from './ground-frame.js';

// The snow under the skis, in the same frame the renderer uses on the ground.
export function snowFrame(s) {
  if (COURSE.openWorld) return groundFrame(s.x, s.s, s.heading, groundHeight);
  return {
    pitch: Math.atan((groundHeight(s.x, s.s + 1) - groundHeight(s.x, s.s - 1)) / 2),
    roll: 0,
    clearance: 0,
  };
}

// Seconds of hands-off air for the body to settle from the lip's attitude to level.
export const FLIGHT_LEVEL_TIME = 1.1;

// Leave the lip in its attitude, then ease level with no jolt at either end.
// Holding up or down pauses the settle, so the player owns the attitude.
export function flightFrame(s) {
  const takeoff = s.takeoffFrame ?? { pitch: -0.1, roll: 0 };
  const t = Math.min(1, Math.max(0, (s.flightSettle || 0) / FLIGHT_LEVEL_TIME));
  const hold = 1 - t * t * (3 - 2 * t);
  return { pitch: takeoff.pitch * hold, roll: takeoff.roll * hold, clearance: 0 };
}

// Keep the supporting surface separate from trick rotation and flight velocity.
export function riderFrame(s) {
  if (s.railing) return { pitch: s.railPitch, roll: 0, clearance: 0 };
  if (s.airborne) return flightFrame(s);
  return snowFrame(s);
}
