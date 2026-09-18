import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSkiLift } from '../src/lift-world.js';
import { getLiftLayout, liftCoordinates } from '../src/lift-layout.js';
import { createState, step } from '../src/physics.js';
import { prepareRun } from '../src/run-start.js';
import { mountainCameraTargets } from '../src/mountain-camera.js';
import { groundHeight } from '../src/blackridge.js';

test('skating from the summit toward the park clears the terminal without a hop', () => {
  for (const hz of [30, 60, 120]) for (const angle of [80, 85, 90, 95, 100]) {
    const state=createState();prepareRun(state);state.heading=-angle*Math.PI/180;
    for (let i=0;i<hz*12 && state.x<60;i++) {
      step(state,{skate:true},1/hz);
      assert.equal(state.airborne,false,`terminal ledge at ${state.x.toFixed(2)}, ${state.s.toFixed(2)} (${angle}°, ${hz}Hz)`);
      assert.equal(state.bailTimer,0);
    }
    assert.ok(state.x>=60,'the summit exit keeps moving toward the park');
  }
});

test('summit view is raised and looks down the selected face', () => {
  const state=createState();prepareRun(state);
  for(let i=0;i<16;i++) {
    state.heading=i*Math.PI/8;
    const {position,look}=mountainCameraTargets(state);
    assert.ok(position.y>=state.y+10, 'elevated view over the summit');
    assert.ok(look.y<state.y-5, 'look down into the chosen slope');
  }
});

test('summit terminal roof clears the skier and camera when skating down the lift side', () => {
  const scene=new THREE.Scene();createSkiLift(scene);
  const station=scene.getObjectByName('Summit lift terminal');
  scene.updateMatrixWorld(true);
  const roof=station.children.find(m=>m.geometry?.type==='BoxGeometry' && m.geometry.parameters.width===12.6);
  const box=new THREE.Box3().setFromObject(roof);
  assert.ok(box.min.y>groundHeight(0,0)+12, 'ceiling above summit arrivals');
  const layout=getLiftLayout();let underRoof=false;
  for(const offset of [-.08,0,.08]) {
    const state=createState();prepareRun(state);state.heading=layout.heading+offset;
    for(let i=0;i<400;i++) {
      step(state,{skate:true},1/120);
      const {u,lateral}=liftCoordinates(layout,state.x,state.s);
      if(Math.abs(u)<6 && Math.abs(lateral)<6.5) {
        underRoof=true;
        assert.ok(state.y+3<box.min.y,'head stays beneath the roof');
        const {position}=mountainCameraTargets(state);
        assert.ok(position.y+1<box.min.y,'follow camera clears the ceiling');
      }
      if(u>10)break;
    }
  }
  assert.equal(underRoof,true);
  scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});

test('the summit unloading floor is the same solid surface the skier rides', () => {
  const scene=new THREE.Scene();createSkiLift(scene);scene.updateMatrixWorld(true);
  const station=scene.getObjectByName('Summit lift terminal');
  const floor=station.children.find(m=>m.geometry?.type==='BoxGeometry' && m.geometry.parameters.width===13);
  for(let x=-6.5;x<=6.5;x+=.5)for(let z=-6;z<=6;z+=.5) {
    const top=floor.localToWorld(new THREE.Vector3(x,.25,z));
    assert.ok(Math.abs(groundHeight(top.x,-top.z)-top.y)<.001,'rendered floor and ski contact have identical height');
  }
  const layout=getLiftLayout(),state=createState();prepareRun(state);state.heading=layout.heading;
  let crossings=0;
  for(let i=0;i<600;i++) {
    step(state,{skate:true},1/120);
    const p=liftCoordinates(layout,state.x,state.s);
    if(Math.abs(p.u)<6 && Math.abs(p.lateral)<6.5) {
      crossings++;
      assert.ok(state.y>=floor.getWorldPosition(new THREE.Vector3()).y+.25-.001,'never sinks through the unloading deck');
    }
    if(p.u>8)break;
  }
  assert.ok(crossings>0);
  scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
});
