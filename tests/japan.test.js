import test from "node:test";
import assert from "node:assert/strict";
import { createState, step, resolveLanding, trickValue } from "../src/physics.js";
import { createRiderPose, updateRiderPose } from "../src/rider-pose.js";
import { keyboardInput, releaseKey } from "../src/controls.js";

test("Japan extends one leg and grips underneath the opposite tucked ski behind the hips", () => {
  const state = { ...createState(), airborne: true, airtime: 0.7, grab: 5 };
  const pose = createRiderPose();
  for (let frame = 0; frame < 240; frame++) updateRiderPose(pose, state, 1 / 120);
  const [extended, tucked] = pose.legs;
  assert.ok(extended.hip.distanceTo(extended.foot) > 0.8);
  assert.ok(tucked.hip.distanceTo(tucked.foot) < 0.5);
  const hand = pose.arms[0];
  assert.ok(hand.hand.distanceTo(hand.grabAnchor) < 0.012);
  assert.ok(hand.hand.z > pose.hips.z + 0.3, "opposite hand must reach behind");
  const localGrip = hand.grabAnchor.clone().sub(pose.skis[1].position)
    .applyQuaternion(pose.skis[1].quaternion.clone().invert());
  assert.ok(localGrip.y < 0, "hold the underside of the ski");
  assert.ok(Math.abs(localGrip.z) < 0.05, "hold beneath the binding, not the tail");
  for (let i = 0; i < 2; i++) assert.ok(pose.legs[i].foot.distanceTo(pose.skis[i].boot) < 1e-6);
  state.grab = 0;
  const previousHand = hand.hand.clone();
  updateRiderPose(pose, state, 1 / 120);
  assert.ok(pose.arms[0].hand.distanceTo(previousHand) < 0.08);
  state.airborne = false;
  updateRiderPose(pose, state, 1 / 120);
  for (const ski of pose.skis) assert.equal(ski.position.y, 0);
});

test("holding D scores and lands as JAPAN GRAB; releasing D does not pop", () => {
  const state = { ...createState(), airborne: true, y: 10000, airtime: 0.7 };
  const keys = new Set(["KeyD"]);
  for (let i = 0; i < 60; i++) step(state, keyboardInput(keys), 1 / 120);
  assert.equal(state.grab, 5);
  assert.equal(trickValue(state).name, "JAPAN GRAB");
  assert.equal(releaseKey(keys, "KeyD"), false);
  step(state, keyboardInput(keys), 1 / 120);
  assert.equal(state.grab, 0);
  resolveLanding(state);
  assert.equal(state.eventType, "land");
  assert.equal(state.lastTrick, "JAPAN GRAB");
  assert.ok(state.lastPoints > 0);
});

test("Japan cannot bypass Daffy recovery", () => {
  const state = { ...createState(), airborne: true, y: 10000, daffyProgress: 1 };
  step(state, keyboardInput(new Set(["KeyD"])), 1 / 120);
  assert.equal(state.grab, 0);
  resolveLanding(state);
  assert.equal(state.eventType, "bail");
});
