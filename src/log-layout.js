import { LOGS } from './blackridge.js';
export { LOGS };
export const SLIDE_FEATURES = LOGS;

export function logCoordinates(log,x,s) {
  return {u:(x-log.x)*log.dx+(s-log.s)*log.ds,lateral:(x-log.x)*log.ds-(s-log.s)*log.dx};
}
// y is the top of the wood, shared by the mesh and ski contact.
export function logPoint(log,u) {
  return {x:log.x+log.dx*u,s:log.s+log.ds*u,y:log.y+log.grade*u,grade:log.grade};
}
