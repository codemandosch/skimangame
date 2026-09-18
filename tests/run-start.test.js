import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCourse, groundHeight } from '../src/course.js';
import { createState, respawn, step } from '../src/physics.js';
import { prepareRun } from '../src/run-start.js';
import { keyboardInput } from '../src/controls.js';
import { mountainCameraTargets } from '../src/mountain-camera.js';

test('new runs and respawns wait at the centre of the flat summit', () => {
  for (const map of ['blackridge', 'bluebird']) {
    selectCourse(map);
    const state = createState();
    for (let run = 0; run < 3; run++) {
      respawn(state);
      prepareRun(state);
      assert.equal(state.x, 0);
      assert.equal(state.s, 0);
      assert.equal(state.y, groundHeight(0, 0));
      assert.equal(state.speed, 0);
      assert.equal(state.awaitingStart, true);
      for (let i = 0; i < 120; i++) step(state, { tuck: true, pop: true, charge: true }, 1/120);
      assert.equal(state.time, 0);
      assert.equal(state.charge, 0);
      assert.equal(state.airborne, false);
      assert.equal(state.started, false);
      assert.equal(state.x, 0);
      assert.equal(state.s, 0);
    }
  }
});

test('waiting skier can turn a full circle both ways without moving or starting the clock', () => {
  for (const code of ['ArrowLeft', 'ArrowRight', 'KeyJ', 'KeyL']) {
    const state = createState();
    prepareRun(state);
    const initial = mountainCameraTargets(state);
    for (let i = 0; i < 120; i++) step(state, keyboardInput(new Set([code])), 1/120);
    const turned = mountainCameraTargets(state);
    assert.ok(Math.hypot(turned.position.x-initial.position.x, turned.position.z-initial.position.z)>5);
    assert.ok(turned.position.y >= groundHeight(turned.position.x, -turned.position.z)+4);
    for (let i = 0; i < 480; i++) step(state, keyboardInput(new Set([code])), 1/120);
    assert.ok(Math.abs(state.heading)>Math.PI*2);
    assert.equal(state.x, 0);
    assert.equal(state.s, 0);
    assert.equal(state.speed, 0);
    assert.equal(state.time, 0);
    assert.equal(state.awaitingStart, true);
  }
});

test('either Ctrl key starts a gradual grounded skate in any selected direction', () => {
  for (const code of ['ControlLeft', 'ControlRight']) for (let k = 0; k < 16; k++) {
    const state = createState();
    prepareRun(state);
    state.heading = k*Math.PI/8;
    const dx=-Math.sin(state.heading), ds=Math.cos(state.heading);
    const input=keyboardInput(new Set([code]));
    step(state, input, 1/120);
    assert.equal(state.awaitingStart, false);
    assert.equal(state.started, true);
    assert.ok(state.speed > 0 && state.speed < 1);
    assert.ok(state.x*dx+state.s*ds>0);
    assert.ok(Math.abs(state.x*ds-state.s*dx)<1e-8);
    assert.equal(state.airborne, false);
    assert.equal(state.charge, 0);
    for (let i=0; i<90; i++) step(state, input, 1/120);
    assert.ok(Math.hypot(state.x,state.s)>8, 'skating leaves the small starting square');
    assert.ok(state.y<groundHeight(0,0), 'each direction leads downhill');
    assert.equal(state.bailTimer, 0);
  }
});

test('paused start selection ignores steering and skating', () => {
  const state=createState();
  prepareRun(state);
  state.paused=true;
  step(state,{steer:1,skate:true},1/30);
  assert.equal(state.heading,0);
  assert.equal(state.awaitingStart,true);
  assert.equal(state.time,0);
});

test('the summit is a ski-sized round pad with downhill exits on every side', () => {
  const top=groundHeight(0,0);
  for(let k=0;k<32;k++) {
    const angle=k*Math.PI/16;
    assert.ok(Math.abs(groundHeight(Math.sin(angle)*1.5,Math.cos(angle)*1.5)-top)<.005, 'skis fit while rotating');
    assert.ok(groundHeight(Math.sin(angle)*2.3,Math.cos(angle)*2.3)<top-.02, 'flat pad ends just beyond the skis');

    const dx=Math.sin(k*Math.PI/16),ds=Math.cos(k*Math.PI/16);
    let last=top;
    for(let r=1;r<=8;r++) {
      const height=groundHeight(dx*r,ds*r);
      assert.ok(height<=last+1e-8,'no uphill lip around the platform');
      last=height;
    }
    assert.ok(last<top-3,'flat area stays compact');
  }
});
