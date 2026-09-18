import test from 'node:test';
import assert from 'node:assert/strict';
import { mountainCameraTargets,constrainMountainCamera } from '../src/mountain-camera.js';
import { getLiftLayout,cablePoint,liftCoordinates,RAIL_HEIGHT } from '../src/lift-layout.js';
import { groundHeight } from '../src/blackridge.js';
import { createState,step } from '../src/physics.js';
import { Vector3 } from 'three';

function railState(cable,u,direction) {
  const layout=getLiftLayout(),p=cablePoint(layout,cable,u);
  return {x:p.x,s:p.s,y:p.y+RAIL_HEIGHT,heading:layout.heading+(direction<0?Math.PI:0),
    speed:30,airHeight:p.y-groundHeight(p.x,p.s),railing:true,rail:{cable,u,velocity:direction*30}};
}

test('lift follow view stays above and behind the skier at a consistent angle to every cable span',()=>{
  const layout=getLiftLayout();
  for(let i=0;i<layout.towers.length-1;i++)for(const cable of [0,1])for(const direction of [-1,1]) {
    const u=(layout.towers[i].u+layout.towers[i+1].u)/2,state=railState(cable,u,direction);
    const {position,look}=mountainCameraTargets(state),{grade}=cablePoint(layout,cable,u);
    const length=Math.hypot(1,grade);
    const along=((position.x-state.x)*layout.dx+(-position.z-state.s)*layout.ds);
    const height=position.y-state.y;
    const behind=-direction*(along+height*grade)/length;
    const above=(height-grade*along)/length;
    assert.ok(behind>8,'camera remains behind the skier along the rail');
    assert.ok(above>=5.5-1e-8,'camera clears the rail plane');
    const angle=Math.atan2(above,behind)*180/Math.PI;
    assert.ok(angle>25 && angle<35,`span ${i}, direction ${direction}: follow angle ${angle}`);
    const lookAlong=(look.x-state.x)*layout.dx+(-look.z-state.s)*layout.ds;
    const lookAbove=(look.y-state.y-grade*lookAlong)/length;
    assert.ok(lookAbove>.4 && lookAbove<.6,'view aims just above the rail ahead');
  }
});

test('camera smoothing cannot leave the view below the rail on capture or uphill travel',()=>{
  const layout=getLiftLayout();
  for(const direction of [-1,1]) {
    const state=railState(0,layout.length*.5,direction);
    const {position}=mountainCameraTargets(state);
    position.y-=30;
    constrainMountainCamera(position,state);
    const {grade}=cablePoint(layout,0,state.rail.u);
    const along=(position.x-state.x)*layout.dx+(-position.z-state.s)*layout.ds;
    assert.ok((position.y-state.y-grade*along)/Math.hypot(1,grade)>=5.5-1e-8);
    const once={...position};constrainMountainCamera(position,state);
    assert.deepEqual(position,once,'clearance settles without repeated camera drift');
  }
});

test('popping off either cable preserves the view through flight and recapture at different frame rates',()=>{
  const layout=getLiftLayout(),index=Math.floor((layout.towers.length-1)/2);
  const u=(layout.towers[index].u+layout.towers[index+1].u)/2;
  for(const cable of [0,1])for(const direction of [-1,1])for(const hz of [30,60,120]) {
    const p=cablePoint(layout,cable,u),speed=direction*27;
    const state=Object.assign(createState(),{x:p.x,s:p.s,y:p.y+.2,
      vx:layout.dx*speed,vs:layout.ds*speed,vy:p.grade*speed-10,speed:27,
      heading:layout.heading+(direction<0?Math.PI:0),started:true,airborne:true,airtime:1});
    for(let i=0;i<8&&!state.railing;i++)step(state,{},1/120);
    assert.ok(state.railing,'setup captures the cable');
    const captured={...state},before=mountainCameraTargets(state);
    const position=new Vector3(before.position.x,before.position.y,before.position.z);
    step(state,{pop:true},1/hz);
    assert.ok(state.airborne && state.cableFlight && !state.railing);
    const after=mountainCameraTargets(state);
    // The pop adds horizontal speed; allow its usual speed-based pullback.
    const expected=mountainCameraTargets({...captured,speed:state.speed});
    for(const part of ['position','look']) {
      const a=expected[part],b=after[part];
      assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<.25,`${part} must not jump when Space releases`);
    }
    let flightFrames=0;
    while(!state.railing && flightFrames<hz*3) {
      const target=mountainCameraTargets(state).position;
      position.lerp(new Vector3(target.x,target.y,target.z),1-Math.exp(-8/hz));
      constrainMountainCamera(position,state);
      const cameraU=liftCoordinates(layout,position.x,-position.z).u;
      assert.ok(position.y>cablePoint(layout,cable,cameraU).y+4,'smoothed camera stays above the wire throughout the pop');
      step(state,{},1/hz);flightFrames++;
    }
    assert.ok(flightFrames>hz*.2,'exercise the airborne transition');
    assert.ok(state.railing,'pop reconnects to the cable');
  }
});

test('ordinary jumps, ground landings and tower crashes use the normal camera',()=>{
  const state=railState(0,getLiftLayout().length*.5,1);
  for(const flags of [
    {airborne:true,cableFlight:false},
    {airborne:false,cableFlight:true},
    {airborne:true,cableFlight:true,railCrash:true},
  ]) {
    const s={...state,...flags,railing:false,rail:null};
    assert.deepEqual(mountainCameraTargets(s),mountainCameraTargets({...s,cableFlight:false}));
  }
});
