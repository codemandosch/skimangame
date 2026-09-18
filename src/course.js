import * as bluebird from './bluebird.js';
import * as blackridge from './blackridge.js';

export const COURSES = {
  bluebird: { ...bluebird, id: 'bluebird', name: 'BLUEBIRD RUN', region: 'NORTH PEAK', style: 'SLOPESTYLE', summit: 2840, natural: false },
  blackridge: { ...blackridge, id: 'blackridge', name: 'BLACKRIDGE', region: 'OPEN MOUNTAIN', style: 'FREERIDE / CHOOSE YOUR LINE', summit: 3840, natural: true, openWorld: true },
};

// Shared live bindings keep terrain consumers on the same selected course.
// Select before constructing the run. The map picker reloads the whole world.
export let COURSE, LENGTH, WIDTH, JUMPS, centerAt, baseHeight, groundHeight, sceneryHeight, rampAt;
export function selectCourse(id) {
  COURSE = Object.hasOwn(COURSES, id) ? COURSES[id] : COURSES.bluebird;
  ({ LENGTH, WIDTH, JUMPS, centerAt, baseHeight, groundHeight, sceneryHeight, rampAt } = COURSE);
  return COURSE;
}
selectCourse('bluebird');
