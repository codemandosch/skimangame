import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { keyboardInput, releaseKey } from '../src/controls.js';
import { createState, step, trickValue, resolveLanding } from '../src/physics.js';
import { createRiderPose, updateRiderPose } from '../src/rider-pose.js';
import { createSkinnedRiderRig } from '../src/skinned-rider.js';
import { loadRider } from './helpers/load-rider.js';

test('F holds Bow and Arrow, earns trick credit, and releases without popping', () => {
  const state = { ...createState(), airborne: true, y: 10000, airtime: 0.7 };
  const keys = new Set(['KeyF']);
  for (let i = 0; i < 90; i++) step(state, keyboardInput(keys), 1 / 120);
  assert.equal(state.grab, 7);
  assert.match(trickValue(state).name, /BOW AND ARROW/);
  assert.equal(releaseKey(keys, 'KeyF'), false);
  step(state, keyboardInput(keys), 1 / 120);
  assert.equal(state.grab, 0);
  resolveLanding(state);
  assert.equal(state.eventType, 'land');
  assert.match(state.lastTrick, /BOW AND ARROW/);
  assert.ok(state.lastPoints > 0);
});

test('Bow and Arrow extends sideways, tucks the opposite leg inward and holds both skis', async () => {
  const state = { ...createState(), airborne: true, airtime: 0.7, grab: 7 };
  const pose = createRiderPose();
  for (let i = 0; i < 240; i++) updateRiderPose(pose, state, 1 / 120);
  const [extended, tucked] = pose.legs;
  assert.ok(extended.foot.x < extended.hip.x - 0.65, 'extend sideways');
  assert.ok(extended.hip.distanceTo(extended.foot) > 0.8, 'straighten extended leg');
  assert.ok(tucked.hip.distanceTo(tucked.foot) < 0.6, 'fold opposite knee');
  assert.ok(tucked.foot.x < 0, 'bring tucked foot toward opposite knee');
  const model = await loadRider(), space = new Group();
  space.add(model);
  const rig = createSkinnedRiderRig(model, space);
  const contacts = rig.update(pose, state);
  for (let i = 0; i < 2; i++) {
    assert.ok(pose.arms[i].grip > 0.99);
    assert.ok(pose.arms[i].hand.distanceTo(pose.arms[i].grabAnchor) < 0.012, `procedural hand ${i} misses ski`);
    assert.ok(contacts.hands[i].actual.distanceTo(pose.arms[i].grabAnchor) < 0.025, `skinned hand ${i} misses ski`);
    assert.ok(contacts.feet[i].bone.getWorldPosition(new Vector3()).distanceTo(contacts.feet[i].target) < 0.003, `boot ${i} misses binding`);
    const anchor = pose.arms[i].grabAnchor.clone().sub(pose.skis[i].position)
      .applyQuaternion(pose.skis[i].quaternion.clone().invert());
    assert.ok(Math.abs(anchor.x) < 0.1 && Math.abs(anchor.z) < 1.25, 'each hand holds its own ski');
  }
  let previous;
  for (const grab of [0, 7, 5, 7, 6, 7, 4, 7, 0]) {
    state.grab = grab;
    for (let frame = 0; frame < 120; frame++) {
      updateRiderPose(pose, state, 1 / 120);
      const c = rig.update(pose, state);
      for (const foot of c.feet)
        assert.ok(foot.bone.getWorldPosition(new Vector3()).distanceTo(foot.target) < 0.003, 'keep boots attached during transitions');
      const head = rig.bones.Head.getWorldPosition(new Vector3());
      if (previous) assert.ok(head.distanceTo(previous) < 0.12, 'smooth head movement');
      previous = head;
    }
  }
  state.grab = 7;
  for (let i = 0; i < 120; i++) updateRiderPose(pose, state, 1 / 120);
  state.airborne = false;
  updateRiderPose(pose, state, 1 / 120);
  for (const ski of pose.skis) assert.equal(ski.position.y, 0);
});
