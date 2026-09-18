import { groundHeight, gradientAt, rampAt, featureCoordinates, atBase, treeCollision } from './blackridge.js';
import { groundContact } from './ground-contact.js';
import { applySkating } from './skating.js';
import { riderFrame } from './rider-frame.js';
import { advanceLandingSkid, landingDriftStrength } from './landing-skid.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// A ground heading is world yaw, independent of aerial trick yaw.
export const directionAt = heading => ({ x:-Math.sin(heading), s:Math.cos(heading) });
export function stepMountain(s,input,dt,{launch,resolveLanding,updateAerial,event,catchCable,latePopWindow=0}) {
  const disabled=s.bailTimer>0;
  const oldX=s.x, oldS=s.s,oldY=s.y;
  const wasAirborne=s.airborne;
  let contact;
  let departureFrame;
  let moveDt=dt;
  if (!s.airborne) {
    s.heading -= s.steer * (s.speed < 8 ? 1.85 : 1.05) * dt;
    let dir=directionAt(s.heading);
    if (!s.started && (!disabled && (input.tuck || input.pop))) { s.started=true; s.speed=18; }
    if (s.skating > 0) s.started=true;
    const g=gradientAt(s.x,s.s);
    const grade=-(g.x*dir.x+g.s*dir.s);
    const gravity=31.05*grade/Math.hypot(1,g.x,g.s);
    // Tucking reduces air resistance; only the slope supplies acceleration.
    const drag=s.tucking ? .0045 : .006;
    const accel=gravity - s.speed*s.speed*drag
      - (s.braking ? 30 : .8) - Math.abs(s.steer)*1.5;
    if(s.started) s.speed=clamp(applySkating(s.speed, s.skating, dt)+accel*dt,0,69);
    // Recovery can outlast its initial timer if the landing line reaches an
    // uphill shoulder. Don't strand a slow skier pointing into that slope.
    if(s.started && landingDriftStrength(s.airtime)>0 && s.speed<8 && gravity<0 && !s.braking)
      s.landingRecovery=Math.max(s.landingRecovery,.35+dt);
    advanceLandingSkid(s,dt,g);
    dir=directionAt(s.heading);
    const feature=rampAt(s.x,s.s);
    const aligned=feature && dir.x*feature.dx+dir.s*feature.ds>.55;
    const local=feature && featureCoordinates(feature,s.x,s.s);
    const onSpine=feature?.kind==='quarterpipe' && aligned && local.u<=0;
    const incomingSlope=onSpine && local.u>-6
      ? (oldY-groundHeight(s.x-dir.x*2,s.s-dir.s*2))/2 : g.x*dir.x+g.s*dir.s;
    // On the curved spine, speed means travel along the snow. Project it onto
    // the ground continuously, rather than slowing horizontal motion at the lip.
    const planarSpeed=onSpine && incomingSlope>0 ? s.speed/Math.hypot(1,incomingSlope) : s.speed;
    s.vx=dir.x*planarSpeed; s.vs=dir.s*planarSpeed;
    if(input.charge && !disabled) s.charge=clamp(s.charge+dt*1.25,0,1);
    const tangentVy=g.x*s.vx+g.s*s.vs;
    contact=groundContact(s.x,s.s,s.vx,s.vs,dt,groundHeight);
    if (contact.release) departureFrame = riderFrame(s);
    const lip=aligned && local.u > -12 && local.u < 8;
    // Horizontal speed times a near-vertical heightfield gradient is not a
    // usable launch velocity (it can reach hundreds of metres per second).
    // On the park's sharp lips, centered slope samples include the back wall.
    // Use the incoming two metres of snow for both momentum and body alignment.
    const parkLip=feature?.parkLine && aligned && local.u>-6 && local.u<=0;
    const departure=parkLip ? {...s,x:s.x-dir.x*2,s:s.s-dir.s*2} : s;
    const incomingVy=parkLip ? (oldY-groundHeight(s.x-dir.x*2,s.s-dir.s*2))*planarSpeed/2 : tangentVy;
    const terrainVy=clamp(incomingVy,-s.speed,10);
    const quarterLip=feature?.kind==='quarterpipe' && aligned && local.u<=0;
    const quarterSlope=quarterLip ? incomingVy/Math.max(planarSpeed,.001) : 0;
    // Redirect speed along the wall instead of launching horizontally off it.
    // Normalize the tangent to preserve approach speed without adding energy.
    const alongSpeed=feature ? s.vx*feature.dx+s.vs*feature.ds : 0;
    const quarterCrossing=quarterLip && quarterSlope>0 && local.u+alongSpeed*dt>0;
    const quarterPop=quarterLip && quarterSlope>0 && !disabled && input.pop;
    if(s.started && (quarterCrossing || quarterPop)) {
      const slope=quarterSlope;
      const approachSpeed=s.speed;
      const heldCharge=input.charge ? s.charge : 0;
      const pop=quarterPop ? 6+s.charge*3.25 : 0;
      const vy=approachSpeed*slope/Math.hypot(1,slope)+pop;
      // A pop below the lip pushes away from the wall at the current position.
      // Only an actual crest crossing may advance the skier to the lip.
      if(quarterCrossing) {
        const toLip=Math.max(0,-local.u/alongSpeed);
        s.x=feature.x;s.s+=s.vs*toLip;s.y=groundHeight(s.x,s.s);
        moveDt=Math.max(0,dt-toLip);
      }
      const horizontal=approachSpeed/Math.hypot(1,slope)-pop*.15;
      s.vx=dir.x*horizontal;s.vs=dir.s*horizontal;s.speed=Math.abs(horizontal);
      const frame=riderFrame(departure);
      launch(s,vy,input.flip||0,input.spin||0,{pitch:Math.atan(slope),roll:frame.roll},approachSpeed+9.25);
      s.quarterpipeFlight=true;
      s.y+=s.vy*moveDt;
      if(quarterCrossing && input.charge && !quarterPop) {
        s.latePopTimer=latePopWindow;s.latePopCharge=heldCharge;
      }
      contact=null;
      if(!s.seenJumps.has(feature.index)) {s.seenJumps.add(feature.index);s.jumps++;}
    }
    if (!s.airborne && !disabled && input.pop && s.started) {
      const charge=s.charge;
      // Space adds only the player's impulse to the actual terrain momentum.
      const pop=6+charge*3.25;
      const frame=riderFrame(departure);
      // Follow the body's tilted up axis a little while keeping full vertical
      // lift. The supporting frame also handles sidehills and switch riding.
      const across=-Math.sin(frame.roll),along=-Math.sin(frame.pitch)*Math.cos(frame.roll);
      s.vx+=pop*.15*(Math.cos(s.heading)*across-Math.sin(s.heading)*along);
      s.vs+=pop*.15*(Math.sin(s.heading)*across+Math.cos(s.heading)*along);
      s.speed=Math.hypot(s.vx,s.vs);
      launch(s,terrainVy+pop,input.flip||0,input.spin||0,frame);
      s.y += s.vy * dt;
      if(lip && !s.seenJumps.has(feature.index)) { s.seenJumps.add(feature.index); s.jumps++; }
    }
    // Authored lips and kickers are deliberate takeoffs. Once the skis cross
    // their crest, stop terrain adhesion from bending the skier down the back
    // face. The ramp's real approach tangent supplies the natural launch.
    if(!s.airborne && s.started && aligned && local.u<=0 && local.u+alongSpeed*dt>0) {
      const heldCharge=input.charge ? s.charge : 0;
      const frame=riderFrame(departure);
      launch(s,terrainVy,input.flip||0,input.spin||0,frame);
      if(input.charge) {
        s.latePopTimer=latePopWindow;
        s.latePopCharge=heldCharge;
      }
      if(!s.seenJumps.has(feature.index)) { s.seenJumps.add(feature.index);s.jumps++; }
    }
  } else {
    // A little trajectory correction, relative to the launch heading. Spin is
    // visual trick rotation; it must never rotate flight velocity or camera.
    const dir=directionAt(s.heading),steer=disabled || s.railCrash ? 0 : clamp(input.steer||0,-1,1);
    let correction=steer*2.2*dt;
    if(s.cableFlight && steer) {
      // Cable exits need enough authority to clear the snap range quickly.
      // Keep the takeoff frame fixed and cap sideways speed while holding a key.
      const lateral=s.vx*dir.s-s.vs*dir.x;
      correction=clamp(steer*12-lateral,-18*dt,18*dt);
    }
    s.vx += dir.s*correction; s.vs -= dir.x*correction;
    updateAerial(s,input,dt);
    s.speed=Math.hypot(s.vx,s.vs);
  }
  s.x+=s.vx*moveDt; s.s+=s.vs*moveDt;
  const floor=groundHeight(s.x,s.s);
  // Gravity plus a little adhesion can follow gentle rolls, but cannot pull
  // a fast skier around a sharp convex crest. Preserve the incoming momentum.
  if(!s.airborne && s.started && contact?.release) {
    const heldCharge=input.charge ? s.charge : 0;
    launch(s,contact.vy,input.flip||0,input.spin||0,departureFrame);
    if(input.charge) {
      s.latePopTimer=latePopWindow;
      s.latePopCharge=heldCharge;
    }
    s.y+=contact.vy*dt;
    const feature=rampAt(s.x,s.s);
    if(feature && !s.seenJumps.has(feature.index)) {
      s.seenJumps.add(feature.index);s.jumps++;
    }
  }
  if(catchCable?.(s,{x:oldX,s:oldS,y:oldY,airborne:wasAirborne})) {
    s.distance+=Math.hypot(s.x-oldX,s.s-oldS);return;
  }
  if(s.airborne) {
    s.airHeight=Math.max(0,s.y-floor);
    s.maxHeight=Math.max(s.maxHeight,s.airHeight);
    if(s.y<=floor && s.airtime>0) {
      s.y=floor;
      resolveLanding(s,gradientAt(s.x,s.s),{collision:!disabled && !!treeCollision(s.x,s.s)});
      s.airHeight=0;
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
