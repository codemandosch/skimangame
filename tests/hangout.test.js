import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { keyboardInput, releaseKey } from '../src/controls.js';
import { createState, step, trickValue } from '../src/physics.js';
import { createRiderPose, updateRiderPose } from '../src/rider-pose.js';
import { createSkinnedRiderRig } from '../src/skinned-rider.js';
import { loadRider } from './helpers/load-rider.js';

test('R holds Hang Out during a backflip and releases without popping', () => {
  const keys = new Set(['KeyR', 'ArrowDown']);
  const state = { ...createState(), airborne: true, y: 10000, airtime: 0.7 };
  for (let i = 0; i < 90; i++) step(state, keyboardInput(keys), 1 / 120);
  assert.equal(state.grab, 6);
  assert.equal(keyboardInput(keys).flip, -1);
  assert.match(trickValue(state).name, /HANG OUT/);
  assert.ok(trickValue(state).points > 0);
  assert.equal(releaseKey(keys, 'KeyR'), false);
  step(state, keyboardInput(keys), 1 / 120);
  assert.equal(state.grab, 0);
});

test('Hang Out arches back with open arms, bent legs and crossed ski tips', async () => {
  const state = { ...createState(), airborne: true, airtime: 0.7, grab: 6 };
  const pose = createRiderPose();
  for (let i = 0; i < 240; i++) updateRiderPose(pose, state, 1 / 120);
  assert.ok(pose.torsoRotation.x > 0.4, 'lean back rather than crouch forward');
  const skiDirection = pose.skis.reduce((sum, ski) =>
    sum.add(new Vector3(0, 0, 1).applyQuaternion(ski.quaternion)), new Vector3()).normalize();
  const torsoDirection = new Vector3(0, 1, 0).applyQuaternion(pose.torsoQuaternion);
  assert.ok(torsoDirection.angleTo(skiDirection) < 0.06, 'torso lies parallel to the skis');
  assert.ok(pose.arms[1].hand.x - pose.arms[0].hand.x > 1.6, 'spread both arms');
  for (let i = 0; i < 2; i++) {
    assert.equal(pose.arms[i].grip, 0, 'hands stay free');
    assert.ok(pose.legs[i].hip.distanceTo(pose.legs[i].foot) < 0.7, 'bend knees');
  }
  const tips = pose.skis.map(ski => new Vector3(0, 0, -1.2).applyQuaternion(ski.quaternion).add(ski.position));
  assert.ok(tips[0].x > tips[1].x, 'tips cross');
  const model = await loadRider(), space = new Group();
  space.add(model);
  const rig = createSkinnedRiderRig(model, space);
  let previous;
  for (const grab of [6, 0, 1, 6, 5, 6, 0]) {
    state.grab = grab;
    for (let frame = 0; frame < 120; frame++) {
      updateRiderPose(pose, state, 1 / 120);
      const contacts = rig.update(pose, state);
      for (const foot of contacts.feet)
        assert.ok(foot.bone.getWorldPosition(new Vector3()).distanceTo(foot.target) < 0.003, 'boots stay in bindings');
      const head = rig.bones.Head.getWorldPosition(new Vector3());
      if (previous) assert.ok(head.distanceTo(previous) < 0.12, 'head transitions smoothly');
      previous = head;
    }
  }
  state.airborne = false;
  updateRiderPose(pose, state, 1 / 120);
  for (const ski of pose.skis) assert.equal(ski.position.y, 0);
});
