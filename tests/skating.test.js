import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardInput, releaseKey } from '../src/controls.js';
import { createState, step } from '../src/physics.js';
import { selectCourse, groundHeight } from '../src/course.js';
import { skatingEffort, applySkating, SKATE_SPEED_LIMIT } from '../src/skating.js';
import { createRiderPose, updateRiderPose } from '../src/rider-pose.js';

test('either Control key skates independently of Space and key release never pops', () => {
  const keys = new Set(['ControlLeft', 'ControlRight']);
  assert.equal(keyboardInput(keys).skate, true);
  assert.equal(keyboardInput(keys).charge, false);
  assert.equal(releaseKey(keys, 'ControlLeft'), false);
  assert.equal(keyboardInput(keys).skate, true);
  assert.equal(releaseKey(keys, 'ControlRight'), false);
  assert.equal(keyboardInput(keys).skate, false);
  keys.add('Space'); keys.add('ControlLeft');
  assert.equal(releaseKey(keys, 'ControlLeft'), false);
  assert.equal(keyboardInput(keys).charge, true);
});

test('skating pushes harder, assists at cruising speeds and fades out at 144 km/h', () => {
  assert.equal(skatingEffort({ speed: 0 }, { skate: true }), 1);
  assert.equal(applySkating(0, 1, 1/30), 60/30, '100% stronger forward push acceleration');
  for (const speed of [5, 15, 25, 35, 39]) {
    const effort = skatingEffort({ speed }, { skate: true });
    assert.ok(effort > 0, `still assists at ${speed*3.6} km/h`);
    assert.ok(applySkating(speed, effort, 1/30) > speed);
  }
  assert.ok(skatingEffort({ speed: 35 }, { skate: true }) > skatingEffort({ speed: 39 }, { skate: true }));
  for (const speed of [40, 45, 56]) {
    assert.equal(skatingEffort({ speed }, { skate: true }), 0);
    assert.equal(applySkating(speed, 1, 1/30), speed);
  }
  for (const dt of [1/30, 1/60, 1/120]) {
    let speed = 0;
    for (let i=0; i<30/dt; i++) {
      speed = applySkating(speed, skatingEffort({ speed }, { skate: true }), dt);
      assert.ok(speed <= SKATE_SPEED_LIMIT);
    }
    assert.ok(speed > SKATE_SPEED_LIMIT * .96);
  }
});

test('Control moves a stopped skier in the chosen heading without charging or launching', () => {
  selectCourse('blackridge');
  try {
    for (const heading of [0, Math.PI/2, Math.PI, -Math.PI/2]) {
      const s = createState(); s.heading = heading;
      step(s, { skate: true }, 1/120);
      assert.equal(s.started, true);
      assert.ok(s.speed > 0 && s.speed < 1, 'gradual push, not the 18 m/s start impulse');
      assert.ok(Math.abs(s.vx + Math.sin(heading)*s.speed) < 1e-8);
      assert.ok(Math.abs(s.vs - Math.cos(heading)*s.speed) < 1e-8);
      assert.equal(s.airborne, false);
      assert.equal(s.charge, 0);
      step(s, {}, 1/120);
      assert.equal(s.skating, 0);
    }
  } finally { selectCourse('bluebird'); }
});

test('skating leaves fast runs and airborne trajectories unchanged on both maps', () => {
  try {
    for (const map of ['bluebird', 'blackridge']) {
      selectCourse(map);
      for (const airborne of [false, true]) {
        const a = createState(), b = createState();
        const speed = airborne ? 15 : 50;
        for (const s of [a,b]) Object.assign(s, { started:true, speed, s:50, y:groundHeight(0,50)+(airborne?30:0), airborne, vs:speed, vx:0 });
        for (let i=0; i<30; i++) {
          step(a, { skate:true }, 1/120); step(b, {}, 1/120);
          for (const key of ['x','s','y','speed','vx','vs','vy']) assert.equal(a[key], b[key], `${map} ${key}`);
        }
      }
    }
  } finally { selectCourse('bluebird'); }
  for (const state of [{airborne:true}, {railing:true}, {bailTimer:1}]) {
    assert.equal(skatingEffort({speed:0, ...state}, {skate:true}), 0);
  }
  assert.equal(skatingEffort({speed:0}, {skate:true, brake:true}), 0);
});

test('skating alternates ski pushes and drives both pole hands together', () => {
  function pose(phase, extra={}) {
    const p=createRiderPose(),s={...createState(),speed:0,skating:1,skatePhase:phase,...extra};
    for (let i=0;i<120;i++) updateRiderPose(p,s,1/120);
    return p;
  }
  const left=pose(-Math.PI/2),right=pose(Math.PI/2),plant=pose(0),drive=pose(Math.PI/2);
  assert.ok(left.skis[0].position.x < right.skis[0].position.x-.15);
  assert.ok(right.skis[1].position.x > left.skis[1].position.x+.15);
  for (let i=0;i<2;i++) {
    assert.ok(drive.arms[i].hand.z > plant.arms[i].hand.z+.4);
    assert.ok(drive.arms[i].polePitch < plant.arms[i].polePitch-.8);
    for (const p of [left,right,plant,drive]) assert.ok(p.legs[i].foot.distanceTo(p.skis[i].boot)<1e-6);
  }
  const air=pose(Math.PI/2,{airborne:true});
  assert.equal(air.skis[0].position.y,0);
  assert.equal(air.skis[1].position.y,0);
});
