import { groundHeight } from './course.js';
import { aerialLanding } from './aerial-rotation.js';
import { getLiftLayout,liftCoordinates,cablePoint,cableTowerHit,RAIL_HEIGHT,CABLE_SPACING } from './lift-layout.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t);
const snapshot=s=>({x:s.x,s:s.s,y:s.y});
export const CABLE_CATCH_RADIUS=1.5;

function positionOnCable(s,layout) {
  const rail=s.rail,p=cablePoint(layout,rail.cable,rail.u);
  const direction=rail.velocity<0 ? -1 : 1;
  const horizontal=rail.velocity/Math.hypot(1,p.grade);
  s.x=p.x;s.s=p.s;s.y=p.y+RAIL_HEIGHT;
  s.vx=layout.dx*horizontal;s.vs=layout.ds*horizontal;s.vy=p.grade*horizontal;
  s.speed=Math.abs(horizontal);s.heading=layout.heading+(direction<0 ? Math.PI : 0);
  s.railYaw=rail.yaw+(direction<0 ? Math.PI : 0);
  s.railPitch=Math.atan(p.grade*direction);
  s.airHeight=Math.max(0,s.y-groundHeight(s.x,s.s));
}

function leaveCable(s,api,pop=false) {
  const yaw=s.railYaw,layout=getLiftLayout(),point=cablePoint(layout,s.rail.cable,s.rail.u);
  const impulse=pop ? 11/Math.hypot(1,point.grade) : 0;
  // Push away from the cable's sloping surface, retaining incoming momentum.
  // On steep wires the normal also pushes outward, allowing a tower clearance
  // without artificially cancelling the skier's downward velocity.
  s.vx-=layout.dx*point.grade*impulse;s.vs-=layout.ds*point.grade*impulse;
  const vy=s.vy+impulse;s.speed=Math.hypot(s.vx,s.vs);
  s.railCooldown=.2;
  s.stanceYaw=0;s.yawOffset=yaw;s.switch=false;s.steer=0;
  api.launch(s,vy,0,0);
  s.railing=false;s.rail=null;
  s.cableFlight=true;
  // A held 180 key must not start a second, unintended aerial spin on dismount.
  s.spinSet=s.flipSet=true;
  s.message=pop ? 'CABLE POP' : 'END OF THE LINE';
  s.messageDetail=pop ? 'Clear the tower and land back on the cable' : 'Land back on the snow';
  s.messageTimer=2;
}

function towerWipeout(s,api,layout,tower,from) {
  const approach=liftCoordinates(layout,from.x,from.s);
  const position=liftCoordinates(layout,s.x,s.s);
  const across=s.vx*layout.ds-s.vs*layout.dx;
  const along=s.vx*layout.dx+s.vs*layout.ds;
  const side=Math.sign(approach.lateral) || -Math.sign(across) || 1;
  const atHead=s.y>=tower.y-2.7;
  // Separate immediately from the mast/head. A velocity kick alone is lost
  // on snow contact and can leave the skier inside the collider at recovery.
  const clearance=(atHead ? 6.2 : 1.1)+.4;
  const push=side*Math.max(0,clearance-side*position.lateral);
  s.x+=layout.ds*push;s.s-=layout.dx*push;
  s.y=Math.max(s.y,groundHeight(s.x,s.s));
  if(s.railing)leaveCable(s,api);
  else if(!s.airborne)api.launch(s,0,0,0);
  s.railing=false;s.rail=null;s.railCrash=true;s.railCooldown=1.5;
  s.bailTimer=1.65;s.charge=0;s.grab=0;s.spinVelocity=0;s.flipVelocity=0;
  // Deflect sideways off the contacted side, reversing travel into the front
  // or back of the support. Keep enough recoil to visibly bounce away.
  const intoTower=(tower.u-approach.u)*along>0;
  const reboundAlong=along*(intoTower ? -.35 : .3);
  const reboundAcross=side*Math.max(4,Math.abs(across)*.45);
  s.vx=layout.dx*reboundAlong+layout.ds*reboundAcross;
  s.vs=layout.ds*reboundAlong-layout.dx*reboundAcross;
  s.vy=Math.min(s.vy,-1);s.speed=Math.hypot(s.vx,s.vs);
  s.heading=-Math.atan2(s.vx,s.vs);s.steer=0;s.cableFlight=true;
  s.message='TOWER STRIKE';s.messageDetail='Pop before the support; clear its top to reconnect';s.messageTimer=2.5;
  api.event(s,'bail');
}

export function stepCable(s,input,dt,api) {
  const layout=getLiftLayout(),rail=s.rail,from=snapshot(s);
  if(input.pop) {
    leaveCable(s,api,true);
    // Aim the jump with the travel-relative controls, even when sliding uphill.
    const side=clamp(input.steer || 0,-1,1)*6;
    s.vx+=Math.cos(s.heading)*side;s.vs+=Math.sin(s.heading)*side;
    s.speed=Math.hypot(s.vx,s.vs);
    return;
  }
  const turn=Math.sign(input.steer || input.spin || 0);
  if(input.railTurn || (turn && turn!==rail.input))rail.queuedTurn=input.railTurn || turn;
  rail.input=turn;
  if(!rail.turn && rail.queuedTurn) {
    rail.turn={from:rail.yaw,to:rail.yaw+rail.queuedTurn*Math.PI,time:0};rail.queuedTurn=0;
  }
  if(rail.turn) {
    rail.turn.time=Math.min(.38,rail.turn.time+dt);
    rail.yaw=rail.turn.from+(rail.turn.to-rail.turn.from)*smooth(rail.turn.time/.38);
    if(rail.turn.time>=.38) {rail.turn=null;rail.turns=(rail.turns || 0)+1;}
  }
  const p=cablePoint(layout,rail.cable,rail.u);
  // Constrained gravity follows the sagging wire. The rail cannot eject the
  // skier at a convex crest; only Space, a tower or a terminal ends a slide.
  const gravity=-30.36*p.grade/Math.hypot(1,p.grade);
  const friction=Math.abs(rail.velocity)>.2 ? Math.sign(rail.velocity)*(.5+.0015*rail.velocity**2) : 0;
  rail.velocity=clamp(rail.velocity+(gravity-friction)*dt,-52,52);
  rail.u+=rail.velocity/Math.hypot(1,p.grade)*dt;
  rail.distance+=Math.abs(rail.velocity)*dt;
  s.tucking=false;s.braking=false;s.steer=0;s.charge=0;
  positionOnCable(s,layout);
  s.distance+=Math.hypot(s.x-from.x,s.s-from.s);
  const tower=cableTowerHit(layout,from,s);
  if(tower)towerWipeout(s,api,layout,tower,from);
  else if(rail.u<=0 || rail.u>=layout.length)leaveCable(s,api);
}

export function catchCable(s,from,input,api) {
  if(s.railCrash || s.bailTimer>0)return false;
  const layout=getLiftLayout();
  // Collide before checking for a snap, so jumping into the side of a support
  // cannot magnetize the skier through it. Also covers the exposed tower stem.
  const tower=cableTowerHit(layout,from,s);
  if(tower) {towerWipeout(s,api,layout,tower,from);return true;}
  if(!s.airborne || s.railCooldown>0 || !aerialLanding(s).upright || s.daffyProgress>0)return false;
  const a=liftCoordinates(layout,from.x,from.s),b=liftCoordinates(layout,s.x,s.s);
  if(Math.max(a.u,b.u)<0 || Math.min(a.u,b.u)>layout.length)return false;
  let nearest=null;
  const samples=Math.max(1,Math.ceil(Math.hypot(s.x-from.x,s.s-from.s,s.y-from.y)/.75));
  for(let cable=0;cable<2;cable++) {
    const side=cable===0 ? -CABLE_SPACING : CABLE_SPACING;
    if(Math.min(a.lateral,b.lateral)>side+CABLE_CATCH_RADIUS || Math.max(a.lateral,b.lateral)<side-CABLE_CATCH_RADIUS)continue;
    const heightAt=t=>from.y+(s.y-from.y)*t-cablePoint(layout,cable,a.u+(b.u-a.u)*t).y-RAIL_HEIGHT;
    const fromAbove=heightAt(0)>0;
    for(let i=0;i<=samples;i++) {
      let t=i/samples;
      // An approach from above must cross the ski contact height before it
      // can attach. Refine that crossing so fast falls cannot skip the wire.
      if(heightAt(t)>0)continue;
      const crossed=i>0 && heightAt((i-1)/samples)>0;
      if(fromAbove && !crossed)continue;
      if(crossed) {
        let lo=(i-1)/samples,hi=t;
        for(let j=0;j<24;j++) {
          const mid=(lo+hi)/2;
          if(heightAt(mid)>0)lo=mid;else hi=mid;
        }
        t=hi;
      }
      const along=a.u+(b.u-a.u)*t,y=from.y+(s.y-from.y)*t;
      if(along<0 || along>layout.length)continue;
      // Project onto the local cable tangent: distance is measured across the
      // wire, so steep sections are just as forgiving as shallow ones.
      let u=along;
      for(let j=0;j<4;j++) {
        const p=cablePoint(layout,cable,u);
        u=clamp(u+(along-u+(y-p.y-RAIL_HEIGHT)*p.grade)/(1+p.grade*p.grade),0,layout.length);
      }
      const p=cablePoint(layout,cable,u);
      const distance=Math.hypot(along-u,a.lateral+(b.lateral-a.lateral)*t-side,y-p.y-RAIL_HEIGHT);
      if(distance>CABLE_CATCH_RADIUS || (nearest && distance>=nearest.distance))continue;
      // After an intentional pop, let the skier move away freely. Reconnect
      // on the return toward the wire, after clearing the support.
      const horizontal=s.vx*layout.dx+(s.vs ?? s.speed)*layout.ds;
      if(s.cableFlight && s.vy-p.grade*horizontal>0)continue;
      if(cableTowerHit(layout,s,{...p,y:p.y+RAIL_HEIGHT}))continue;
      nearest={cable,u,distance};
    }
  }
  if(nearest) {
    const {cable,u}=nearest;
    const worldYaw=s.heading-(s.stanceYaw+aerialLanding(s).yaw);
    const angle=layout.heading-worldYaw;
    const yaw=Math.PI/2+Math.round((angle-Math.PI/2)/Math.PI)*Math.PI;
    const p=cablePoint(layout,cable,u),horizontal=s.vx*layout.dx+(s.vs ?? s.speed)*layout.ds;
    // Preserve downhill/uphill travel separately from the sideways ski stance.
    const velocity=Math.abs(horizontal)>.5 ? clamp(horizontal*Math.hypot(1,p.grade),-52,52) : 6;
    api.resolveLanding(s);
    s.railing=true;s.started=true;s.airborne=false;s.steer=0;s.charge=0;
    s.stanceYaw=0;s.yawOffset=0;s.switch=false;s.grab=0;
    s.rail={cable,u,velocity,yaw,distance:0,input:Math.sign(input.steer || input.spin || 0),
      turn:null,queuedTurn:0};
    positionOnCable(s,layout);
    s.message='CABLE SLIDE';s.messageDetail='Release Space: pop off · Left / right: 180 · Clear the towers';s.messageTimer=3;
    api.event(s,'rail');return true;
  }
  return false;
}
