import { groundHeight, gradientAt, rampAt, featureCoordinates, atBase, treeCollision } from './blackridge.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth = value => { const t=clamp(value,0,1); return t*t*(3-2*t); };

// A ground heading is world yaw, independent of aerial trick yaw.
export const directionAt = heading => ({ x:-Math.sin(heading), s:Math.cos(heading) });
export function stepMountain(s,input,dt,{launch,resolveLanding,updateAerial,event}) {
  const disabled=s.bailTimer>0;
  const oldX=s.x, oldS=s.s;
  let fallVy=0;
  if (!s.airborne) {
    s.heading -= s.steer * (s.speed < 8 ? 1.85 : 1.05) * dt;
    const dir=directionAt(s.heading);
    if (!s.started && (!disabled && (input.tuck || input.pop))) { s.started=true; s.speed=18; }
    const g=gradientAt(s.x,s.s);
    const grade=-(g.x*dir.x+g.s*dir.s);
    const gravity=25*grade/Math.hypot(1,g.x,g.s);
    // Tucking reduces air resistance; only the slope supplies acceleration.
    const drag=s.tucking ? .0045 : .006;
    const accel=gravity - s.speed*s.speed*drag
      - (s.braking ? 30 : .8) - Math.abs(s.steer)*1.5;
    if(s.started) s.speed=clamp(s.speed+accel*dt,0,56);
    s.vx=dir.x*s.speed; s.vs=dir.s*s.speed;
    if(input.charge && !disabled) s.charge=clamp(s.charge+dt*1.25,0,1);
    const tangentVy=g.x*s.vx+g.s*s.vs;
    fallVy=clamp(tangentVy,-s.speed,0);
    const feature=rampAt(s.x,s.s);
    const aligned=feature && dir.x*feature.dx+dir.s*feature.ds>.55;
    const local=feature && featureCoordinates(feature,s.x,s.s);
    const lip=aligned && local.u > -12 && local.u < 8;
    const lipWeight=lip ? smooth((local.u+12)/6)*smooth((8-local.u)/6) : 0;
    // Horizontal speed times a near-vertical heightfield gradient is not a
    // usable launch velocity (it can reach hundreds of metres per second).
    const tangent=clamp(tangentVy,-s.speed,10);
    const assisted=lip ? Math.max(tangent,Math.min(18,feature.kick)*clamp(s.speed/38,0,1)) : tangent;
    const terrainVy=tangent+(assisted-tangent)*lipWeight;
    if (!disabled && input.pop && s.started) {
      const charge=s.charge;
      // Blend the crest assistance at both boundaries. The previous formula
      // replaced downhill momentum with +10 and stacked the entire feature
      // kick on top, producing abrupt 60–100 m/s vertical launches.
      // Keep downhill momentum for natural drops, but limit upward terrain
      // energy independently of the player's small, explicit release impulse.
      const pop=5+charge*3.25;
      const vy=Math.min(20,terrainVy+pop);
      launch(s,vy,input.flip||0,input.spin||0);
      s.y += s.vy * dt;
      if(lip && !s.seenJumps.has(feature.index)) { s.seenJumps.add(feature.index); s.jumps++; }
    }
  } else {
    // A little trajectory correction, relative to the launch heading. Spin is
    // visual trick rotation; it must never rotate flight velocity or camera.
    const dir=directionAt(s.heading), correction=(input.steer||0)*2.2*dt;
    s.vx += dir.s*correction; s.vs -= dir.x*correction;
    updateAerial(s,input,dt);
    s.speed=Math.hypot(s.vx,s.vs);
  }
  s.x+=s.vx*dt; s.s+=s.vs*dt;
  const floor=groundHeight(s.x,s.s);
  // Follow ordinary snow through turns and convex rollers. Only lose contact
  // when a real drop opens beneath the next foot position; never add lift.
  if(!s.airborne && s.started && s.speed>0 && s.y+fallVy*dt-floor>.25) {
    launch(s,fallVy,input.flip||0,input.spin||0);
    s.y+=fallVy*dt;
    const feature=rampAt(s.x,s.s);
    if(feature && !s.seenJumps.has(feature.index)) {
      s.seenJumps.add(feature.index);s.jumps++;
    }
  }
  if(s.airborne) {
    s.airHeight=Math.max(0,s.y-floor);
    s.maxHeight=Math.max(s.maxHeight,s.airHeight);
    if(s.y<=floor && s.airtime>0) {
      s.y=floor;
      resolveLanding(s);
      s.airHeight=0;
      // Landing faces the flight direction, regardless of which side of the
      // summit we are on. Switch stays a separate rider stance.
      if(s.speed>.2) s.heading=-Math.atan2(s.vx,s.vs);
    }
    if(s.airborne && s.airtime===0) s.y=Math.max(s.y,floor);
  } else { s.y=floor; s.airHeight=0; }
  if(!s.airborne && !disabled && treeCollision(s.x,s.s)) {
    s.x=oldX; s.s=oldS; s.y=groundHeight(oldX,oldS);
    s.speed=Math.min(s.speed,3); s.vx=0; s.vs=0; s.bailTimer=1.2;
    s.message='TREE STRIKE';s.messageDetail='Turn away and find fresh snow';s.messageTimer=2;
    event(s,'bail');
  }
  s.distance += Math.hypot(s.x-oldX,s.s-oldS);
  if(s.started && !s.airborne && atBase(s.x,s.s,s.y)) {
    s.finished=true; s.message='MOUNTAIN COMPLETE'; event(s,'finish');
  }
}
