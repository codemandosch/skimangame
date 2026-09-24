import { COURSE, groundHeight } from './course.js';
import { getLiftLayout, cablePoint } from './lift-layout.js';
import { PARK_LINE } from './blackridge.js';

export function prepareParkRun(state) {
  Object.assign(state, { x: PARK_LINE.start, s: 0, y: groundHeight(PARK_LINE.start, 0),
    heading: -Math.PI / 2, speed: 0, started: false, awaitingStart: true,
    messageDetail: 'East Face Park Line: four big airs and a final spine jump.' });
}

export function prepareRun(state) {
  const lift=getLiftLayout();
  if (COURSE.openWorld) {
    state.x=0;
    state.s=0;
  } else {
    state.x=cablePoint(lift,1,0).x;
    state.s=0;
  }
  const target=cablePoint(lift,1,90);
  state.heading=COURSE.openWorld ? 0 : -Math.atan2(target.x-state.x,target.s-state.s);
  state.y=groundHeight(state.x,state.s);
  state.messageDetail='Turn with ← / → to choose your line. Hold Ctrl to skate.';
  state.speed = 0;
  state.started = false;
  state.awaitingStart = true;
}

export function startRun(state) {
  if (!state.awaitingStart) return;
  state.awaitingStart = false;
  state.started = true;
  state.speed = COURSE.openWorld ? 18 : COURSE.natural ? 24 : 14;
}
