import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { createState, step, resolveLanding, trickValue } from "../src/physics.js";
import { createRiderPose, updateRiderPose } from "../src/rider-pose.js";
import { keyboardInput } from "../src/controls.js";

test("Octo grips the front and tail of different crossed skis simultaneously", () => {
  const s = { ...createState(), airborne: true, airtime: 0.7, grab: 4 };
  const p = createRiderPose();
  for (let i = 0; i < 180; i++) updateRiderPose(p, s, 1 / 120);
  for (const [hand, skiIndex, front] of [[0, 1, true], [1, 0, false]]) {
    const arm = p.arms[hand], ski = p.skis[skiIndex];
    assert.ok(arm.grip > 0.99);
    assert.ok(arm.hand.distanceTo(arm.grabAnchor) < 0.012);
    const local = arm.grabAnchor.clone().sub(ski.position).applyQuaternion(ski.quaternion.clone().invert());
    assert.ok(front ? local.z < -1 : local.z > 1, "grip must be beyond the binding at the correct end");
  }
  const directions = p.skis.map(ski => new Vector3(0, 0, 1).applyQuaternion(ski.quaternion));
  assert.ok(Math.abs(directions[0].dot(directions[1])) < 0.4, "skis must form a pronounced cross");
  s.airborne = false;
  s.grab = 0;
  updateRiderPose(p, s, 1 / 120);
  for (const ski of p.skis) assert.equal(ski.position.y, 0);
});

test("holding S in flight scores and lands as OCTO GRAB", () => {
  const s = { ...createState(), airborne: true, y: 10000, airtime: 0.7 };
  const input = keyboardInput(new Set(["KeyS"]));
  for (let i = 0; i < 60; i++) step(s, input, 1 / 120);
  assert.equal(s.grab, 4);
  assert.equal(trickValue(s).name, "OCTO GRAB");
  resolveLanding(s);
  assert.equal(s.eventType, "land");
  assert.equal(s.lastTrick, "OCTO GRAB");
  assert.ok(s.lastPoints > 0);
});

test("Octo cannot cancel an unfinished Daffy to avoid a wipeout", () => {
  const s = { ...createState(), airborne: true, y: 10000, airtime: 0.7, daffyProgress: 1 };
  step(s, keyboardInput(new Set(["KeyS"])), 1 / 120);
  assert.equal(s.grab, 0);
  resolveLanding(s);
  assert.equal(s.eventType, "bail");
});
