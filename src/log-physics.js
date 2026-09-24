import { SLIDE_FEATURES as LOGS,logCoordinates,logPoint } from './log-layout.js';
import { groundHeight } from './blackridge.js';
import { aerialLanding } from './aerial-rotation.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Keep enough horizontal momentum for even the shallowest timber takeoffs.
const MIN_LOG_SPEED=32;
function slideVelocity(log,velocity) {
  return (velocity<0?-1:1)*clamp(Math.abs(velocity),MIN_LOG_SPEED*Math.hypot(1,log.grade),56);
}
// Sweep the ski footprint through the trunk's contact area so a fast crossing
// cannot skip capture between physics steps.
function contactTime(ranges) {
  let enter=0,exit=1;
  for(const [start,end,min,max] of ranges) {
    const delta=end-start;
    if(Math.abs(delta)<1e-9) {if(start<min || start>max)return null;continue;}
    const a=(min-start)/delta,b=(max-start)/delta;
    enter=Math.max(enter,Math.min(a,b));exit=Math.min(exit,Math.max(a,b));
    if(enter>exit)return null;
  }
  return enter;
}
function positionOnLog(s) {
  const rail=s.rail,log=LOGS[rail.log],p=logPoint(log,rail.u);
  const horizontal=rail.velocity/Math.hypot(1,log.grade),direction=rail.velocity<0?-1:1;
  s.x=p.x;s.s=p.s;s.y=p.y;
  s.vx=log.dx*horizontal;s.vs=log.ds*horizontal;s.vy=log.grade*horizontal;
  s.speed=Math.abs(horizontal);s.heading=log.heading+(direction<0?Math.PI:0);
  s.railYaw=rail.yaw+(direction<0?Math.PI:0);s.railPitch=Math.atan(log.grade*direction);
  s.airHeight=Math.max(0,s.y-groundHeight(s.x,s.s));
}
function leaveLog(s,api,pop) {
  const log=LOGS[s.rail.log],yaw=s.railYaw,vy=s.vy+(pop?6:0);
  s.railCooldown=.3;s.stanceYaw=0;s.switch=false;s.steer=0;
  s.yawOffset=yaw;
  api.launch(s,vy,0,0);s.spinSet=s.flipSet=true;
  s.railing=false;s.rail=null;
  s.message=pop?'LOG POP':log.kind==='kicker'?'TIMBER TAKEOFF':'OFF THE LOG';
  s.messageDetail='Carry your speed into the landing';s.messageTimer=2;
}
export function stepLog(s,input,dt,api) {
  const rail=s.rail,log=LOGS[rail.log];
  if(input.pop) {leaveLog(s,api,true);return;}
  const turn=Math.sign(input.steer || input.spin || 0);
  if(input.railTurn || (turn && turn!==rail.input))rail.queuedTurn=input.railTurn || turn;
  rail.input=turn;
  if(!rail.turn && rail.queuedTurn) {
    rail.turn={from:rail.yaw,to:rail.yaw+rail.queuedTurn*Math.PI,time:0};rail.queuedTurn=0;
  }
  if(rail.turn) {
    rail.turn.time=Math.min(.38,rail.turn.time+dt);
    const t=rail.turn.time/.38;
    rail.yaw=rail.turn.from+(rail.turn.to-rail.turn.from)*t*t*(3-2*t);
    if(t>=1) {rail.turn=null;rail.turns=(rail.turns || 0)+1;}
  }
  const direction=rail.velocity<0?-1:1;
  // Uphill timber carries entry speed instead of draining it or rolling back.
  // Descending rails still accelerate, in either direction of travel.
  const downhill=-log.grade*direction;
  const acceleration=downhill>0 ? 30.36*downhill/Math.hypot(1,log.grade)-(.55+.0015*rail.velocity**2) : 0;
  rail.velocity=slideVelocity(log,rail.velocity+direction*acceleration*dt);
  const oldU=rail.u;
  rail.u=clamp(rail.u+rail.velocity/Math.hypot(1,log.grade)*dt,0,log.length);
  const distance=Math.abs(rail.u-oldU);
  rail.distance+=distance*Math.hypot(1,log.grade);s.distance+=distance;
  s.tucking=false;s.braking=false;s.steer=0;s.charge=0;
  positionOnLog(s);
  if(rail.u<=0 || rail.u>=log.length)leaveLog(s,api,false);
}
export function catchLog(s,from,input,api) {
  if(s.railCooldown>0 || s.bailTimer>0 || s.railCrash || s.daffyProgress>0)return false;
  if(s.airborne && !aerialLanding(s).upright)return false;
  for(const log of LOGS) {
    if(Math.hypot(s.x-log.x,s.s-log.s)>log.length+5)continue;
    const a=logCoordinates(log,from.x,from.s),b=logCoordinates(log,s.x,s.s);
    const horizontal=s.vx*log.dx+s.vs*log.ds;
    const skiX=-Math.sin(s.heading),skiS=Math.cos(s.heading);
    const along=Math.abs(skiX*log.dx+skiS*log.ds),across=Math.abs(skiX*log.ds-skiS*log.dx);
    const sideReach=log.radius+.5*along+1.25*across,endReach=1.25*along+.5*across;
    let u;
    // Snow-supported skis touching any exposed part of a trunk snap onto it,
    // including side entries, slow traverses and skis already overlapping it.
    // The height limit keeps snow far beneath a projecting log out of reach.
    if(!from.airborne && !input.pop) {
      const endY=s.airborne?s.y:groundHeight(s.x,s.s);
      const t=contactTime([
        [a.u,b.u,-endReach,log.length+endReach],
        [a.lateral,b.lateral,-sideReach,sideReach],
        [from.y-logPoint(log,a.u).y,endY-logPoint(log,b.u).y,-.85,.25],
      ]);
      if(t!==null)u=clamp(a.u+(b.u-a.u)*t,.001,log.length-.001);
    }
    if(u===undefined && s.airborne) {
      const ca=from.y-logPoint(log,a.u).y,cb=s.y-logPoint(log,b.u).y;
      if(ca<-.015 || cb>0 || cb>=ca)continue;
      const t=ca/(ca-cb);u=a.u+(b.u-a.u)*t;
      if(u<-endReach || u>log.length+endReach || Math.abs(a.lateral+(b.lateral-a.lateral)*t)>sideReach)continue;
      u=clamp(u,.001,log.length-.001);
    }
    if(u===undefined)continue;
    // A crosswise entry needs no forward-speed threshold. Favor forward travel
    // for perpendicular/stationary contact, while retaining clear reverse entries.
    const direction=horizontal<-.1?-1:1;
    const velocity=direction*Math.hypot(s.vx,s.vs)*Math.hypot(1,log.grade);
    api.resolveLanding(s);
    s.railing=true;s.airborne=false;s.started=true;s.steer=0;s.charge=0;
    s.stanceYaw=0;s.yawOffset=0;s.switch=false;s.grab=0;
    s.rail={kind:'log',log:log.id,u,velocity:slideVelocity(log,velocity),yaw:Math.PI/2,
      distance:0,input:Math.sign(input.steer || input.spin || 0),turn:null,queuedTurn:0};
    positionOnLog(s);
    s.message='LOG SLIDE';s.messageDetail='Release Space: pop · Left / right: 180';s.messageTimer=3;
    api.event(s,'rail');return true;
  }
  return false;
}
