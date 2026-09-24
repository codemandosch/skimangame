import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Quaternion, Vector3 } from 'three';
import { createState, resolveLanding, step } from '../src/physics.js';
import { createRiderPose, updateRiderPose } from '../src/rider-pose.js';

// Grounded test states use the snow itself as the flight frame, so the
// aerial rotation is exactly the rider's tilt against the landing slope.
function crashWith(pitch, roll = 0, yaw = 0) {
  const s = createState();
  s.time = 10;
  s.speed = 14;
  s.stanceYaw = yaw;
  s.airRotation = new Quaternion().setFromEuler(new Euler(pitch, 0, roll, 'YXZ'));
  resolveLanding(s);
  return s;
}

const falls = {
  'leaning back': [1.3, 0, 'backseat'],
  'leaning forward': [-1.3, 0, 'faceplant'],
  'leaning left': [0, 1.3, 'sideslam', -1],
  'leaning right': [0, -1.3, 'sideslam', 1],
  'head-first backward': [2.6, 0, 'tomahawk'],
  'head-first forward': [-2.6, 0, 'tomahawk'],
  'head-first sideways': [0, 2.6, 'cartwheel'],
};

test('the wipeout follows the direction the body leans against the snow', () => {
  for (const [name, [pitch, roll, kind, side]] of Object.entries(falls)) {
    const s = crashWith(pitch, roll);
    assert.ok(s.bailTimer > 0, `${name} must wipe out`);
    assert.equal(s.eventType, 'bail');
    assert.equal(s.crash.kind, kind, name);
    if (side) assert.equal(s.crash.side, side, name);
  }
});

test('the fall is judged in the rider body frame, so landing switch or sideways still reads correctly', () => {
  for (const yaw of [Math.PI / 2, Math.PI, -Math.PI / 2]) {
    assert.equal(crashWith(1.3, 0, yaw).crash.kind, 'backseat');
    assert.equal(crashWith(-1.3, 0, yaw).crash.kind, 'faceplant');
  }
});

test('every wipeout starts from the impact attitude, moves without snapping and stands back up', () => {
  const spinOrigin = new Vector3(0, 1, 0);
  // Standing back up means returning to the normal relaxed ski stance.
  const standing = createRiderPose(), still = { ...createState(), speed: 14 };
  for (let i = 0; i < 240; i++) updateRiderPose(standing, still, 1 / 120);
  const up = new Vector3(0, 1, 0).applyQuaternion(standing.torsoQuaternion);
  for (const [name, [pitch, roll, kind]] of Object.entries(falls)) {
    const s = crashWith(pitch, roll), pose = createRiderPose(), dt = 1 / 120;
    const impact = new Quaternion().fromArray(s.crash.impact);
    // Snow-frame position of a body-space point, as the renderer places it.
    const place = point => point.clone().sub(spinOrigin)
      .applyQuaternion(pose.crashActive ? pose.crashQuaternion : new Quaternion())
      .add(pose.crashActive ? pose.crashPosition : spinOrigin);
    const head = () => place(new Vector3(0, 0.97, 0).applyQuaternion(pose.torsoQuaternion).add(pose.hips));
    updateRiderPose(pose, s, dt);
    assert.ok(pose.crashQuaternion.angleTo(impact) < 0.05, `${name}: no snap upright at impact`);
    let previous = head(), lowest = Infinity, restHeight = null;
    while (s.bailTimer > 0) {
      s.time += dt;
      s.bailTimer = Math.max(0, s.bailTimer - dt);
      updateRiderPose(pose, s, dt);
      const current = head();
      assert.ok(current.distanceTo(previous) < 0.15, `${name}: head jumps ${current.distanceTo(previous)} m`);
      previous = current;
      lowest = Math.min(lowest, current.y);
      if (pose.wipeout > 0.99 && (kind === 'tomahawk' || kind === 'cartwheel' ? pose.crash.back > 0.99 : true))
        restHeight = current.y;
    }
    assert.ok(restHeight !== null && restHeight < 0.7, `${name}: the rider must end up down on the snow`);
    assert.ok(lowest > -0.05, `${name}: the head must not sink through the snow`);
    assert.equal(pose.crashActive, false);
    assert.equal(pose.wipeout, 0);
    assert.ok(new Vector3(0, 1, 0).applyQuaternion(pose.torsoQuaternion).angleTo(up) < 0.2, `${name}: stands up`);
  }
});

test('a takeoff clears the previous wipeout so it can never replay mid-air', () => {
  const s = crashWith(1.3);
  assert.ok(s.crash);
  Object.assign(s, { bailTimer: 0, started: true, speed: 10 });
  step(s, { pop: true }, 1 / 60);
  assert.ok(s.airborne);
  assert.equal(s.crash, null);
});
