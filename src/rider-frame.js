import { COURSE, groundHeight } from './course.js';
import { groundFrame } from './ground-frame.js';

// Keep the supporting surface separate from trick rotation and flight velocity.
export function riderFrame(s) {
  if (s.railing) return { pitch: s.railPitch, roll: 0, clearance: 0 };
  if (s.airborne) return s.takeoffFrame ?? { pitch: -0.1, roll: 0, clearance: 0 };
  if (COURSE.openWorld) return groundFrame(s.x, s.s, s.heading, groundHeight);
  return {
    pitch: Math.atan((groundHeight(s.x, s.s + 1) - groundHeight(s.x, s.s - 1)) / 2),
    roll: 0,
    clearance: 0,
  };
}
