import { groundHeight } from './blackridge.js';
import { directionAt } from './mountain-physics.js';
export function mountainCameraTargets(state) {
  const dir=directionAt(state.heading),back=11.25+Math.max(0,Math.min(2,((state.speed ?? 0)-30)/10));
  const x=state.x-dir.x*back,s=state.s-dir.s*back;
  const aheadX=state.x+dir.x*22,aheadS=state.s+dir.s*22;
  const drop=Math.max(0,state.y-groundHeight(aheadX,aheadS));
  const target = {
    position:{x,y:Math.max(state.y+5.5+state.airHeight*.025,groundHeight(x,s)+4),z:-s},
    look:{x:aheadX,y:state.y+.5-Math.min(18,drop*.45),z:-aheadS},
  };
  constrainMountainCamera(target.position,state);
  return target;
}

export function constrainMountainCamera(position,state) {
  position.y=Math.max(position.y,groundHeight(position.x,-position.z)+4);
  // Raising only the camera endpoint is insufficient when its sightline cuts
  // through a ridge during a turn. Keep the whole rider-to-camera ray clear.
  for(let i=2;i<=10;i++) {
    const t=i/10,x=state.x+(position.x-state.x)*t,s=state.s+(-position.z-state.s)*t;
    position.y=Math.max(position.y,(groundHeight(x,s)+1.2-(state.y+1.5)*(1-t))/t);
  }
}
