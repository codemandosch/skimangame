import * as blackridge from './blackridge.js';

export const COURSES = {
  blackridge: { ...blackridge, id: 'blackridge', name: 'BLACKRIDGE', region: 'OPEN MOUNTAIN', style: 'FREERIDE / CHOOSE YOUR LINE', summit: 3840, natural: true, openWorld: true },
};
export let COURSE = COURSES.blackridge;
export let { LENGTH, WIDTH, JUMPS, centerAt, baseHeight, groundHeight, sceneryHeight, rampAt } = COURSE;

// Retired and unknown map links continue to resolve to Blackridge.
export function selectCourse(id) {
  COURSE = Object.hasOwn(COURSES, id) ? COURSES[id] : COURSES.blackridge;
  ({ LENGTH, WIDTH, JUMPS, centerAt, baseHeight, groundHeight, sceneryHeight, rampAt } = COURSE);
  return COURSE;
}
