import { groundHeight } from './blackridge.js';
import { directionAt } from './mountain-physics.js';
import { getLiftLayout,cablePoint,liftCoordinates } from './lift-layout.js';

function cameraCable(state) {
  if(state.railing ? state.rail.kind==='log' : !state.airborne || !state.cableFlight || state.railCrash)return null;
  const layout=getLiftLayout();
  // A pop clears rail immediately. Track the cable under the airborne skier
  // until recapture or snow landing, rather than changing views on release.
  const u=state.railing ? state.rail.u : liftCoordinates(layout,state.x,state.s).u;
  const {grade}=cablePoint(layout,state.railing ? state.rail.cable : 0,u);
  return {layout,grade};
}

export function mountainCameraTargets(state) {
  const dir=directionAt(state.heading),back=11.25+Math.max(0,Math.min(2,((state.speed ?? 0)-30)/10));
  const x=state.x-dir.x*back,s=state.s-dir.s*back;
  const aheadX=state.x+dir.x*22,aheadS=state.s+dir.s*22;
  const drop=Math.max(0,state.y-groundHeight(aheadX,aheadS));
  const summitView=Math.max(0,1-Math.hypot(state.x,state.s)/60);
  const target = {
    position:{x,y:Math.max(state.y+5.5+summitView*6+state.airHeight*.025,groundHeight(x,s)+4),z:-s},
    look:{x:aheadX,y:state.y+.5-Math.min(18,drop*.45)-summitView*3,z:-aheadS},
  };
  const cable=cameraCable(state);
  if(cable) {
    const {layout,grade}=cable;
    const pitch=Math.atan(grade*(dir.x*layout.dx+dir.s*layout.ds));
    const cos=Math.cos(pitch),sin=Math.sin(pitch);
    // Move the whole follow rig into the cable's slope, preserving its angle
    // to the skier instead of aiming down the wire from underneath it.
    const behind=back*cos+5.5*sin,ahead=22*cos-.5*sin;
    target.position={x:state.x-dir.x*behind,y:state.y+5.5*cos-back*sin,z:-state.s+dir.s*behind};
    target.look={x:state.x+dir.x*ahead,y:state.y+22*sin+.5*cos,z:-state.s-dir.s*ahead};
  }
  constrainMountainCamera(target.position,state);
  return target;
}

export function constrainMountainCamera(position,state) {
  const cable=cameraCable(state);
  if(cable) {
    const {layout,grade}=cable;
    const along=(position.x-state.x)*layout.dx+(-position.z-state.s)*layout.ds;
    // Apply after smoothing too: a capture or pop must not leave the camera
    // lagging below the cable while it catches up with the new follow rig.
    position.y=Math.max(position.y,state.y+grade*along+5.5*Math.hypot(1,grade));
  }
  position.y=Math.max(position.y,groundHeight(position.x,-position.z)+4);
  // Raising only the camera endpoint is insufficient when its sightline cuts
  // through a ridge during a turn. Keep the whole rider-to-camera ray clear.
  for(let i=2;i<=10;i++) {
    const t=i/10,x=state.x+(position.x-state.x)*t,s=state.s+(-position.z-state.s)*t;
    position.y=Math.max(position.y,(groundHeight(x,s)+1.2-(state.y+1.5)*(1-t))/t);
  }
}
