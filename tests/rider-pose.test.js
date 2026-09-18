import test from "node:test";
import assert from "node:assert/strict";
import { Euler } from "three";
import { createRiderPose, updateRiderPose } from "../src/rider-pose.js";
import { createState, step } from "../src/physics.js";

test("tuck input lowers the hips and brings hands forward while skiing", () => {
  const s = createState();
  const neutral = settle(s);
  step(s, { tuck: true }, 1 / 120);
  const tucked = settle(s);
  assert.equal(s.tucking, true);
  assert.ok(tucked.hips.y < neutral.hips.y - 0.14);
  assert.ok(tucked.arms[0].hand.z < neutral.arms[0].hand.z - 0.05);
  step(s, {}, 1 / 120);
  assert.equal(s.tucking, false);
});

test("takeoff extends the legs before settling into a compact airborne stance", () => {
  const s = { ...createState(), airborne: true, airtime: 0.08 };
  const extension = settle(s);
  s.airtime = 0.65;
  const flight = settle(s);
  assert.ok(extension.hips.y > flight.hips.y + 0.06);
});

test("switch carving reverses local lean so the rider still leans into the downhill turn", () => {
  const p = settle({ ...createState(), steer: 1, switch: true });
  assert.ok(p.hips.x < -0.2);
  assert.ok(p.torsoRotation.z > 0.25);
});

function settle(s) {
  const p = createRiderPose();
  for (let i = 0; i < 120; i++) updateRiderPose(p, s, 1 / 120);
  return p;
}

test("fast carves bank both skis into the turn and load the legs more than slow turns", () => {
  for (const steer of [-1, 1]) for (const switched of [false, true]) {
    const state = { ...createState(), steer, switch: switched };
    const slow = settle({ ...state, speed: 2 });
    const fast = settle({ ...state, speed: 30 });
    const direction = steer * (switched ? -1 : 1);
    assert.ok(fast.hips.x * direction > 0.44);
    assert.ok(fast.hips.y < slow.hips.y - 0.04);
    assert.ok(fast.torsoRotation.z * direction < -0.5);
    for (const ski of fast.skis) {
      const roll = new Euler().setFromQuaternion(ski.quaternion, "YXZ").z;
      assert.ok(roll * direction < -0.65, "both ski edges must bank into the turn");
    }
  }
});
for (const grab of [1, 2, 3, 4])
  test(`grab ${grab} keeps the glove on its ski and boots on their bindings`, () => {
    const s = { ...createState(), airborne: true, grab };
    const p = settle(s);
    const arm = p.arms[grab === 1 || grab === 4 ? 0 : 1];
    const hand = arm.hand;
    assert.ok(
      hand.distanceTo(arm.grabAnchor) < 0.012,
      `hand misses ski by ${hand.distanceTo(arm.grabAnchor)}`,
    );
    for (let i = 0; i < 2; i++) {
      assert.ok(p.legs[i].foot.distanceTo(p.skis[i].boot) < 1e-6);
      assert.ok(
        Math.abs(p.arms[i].shoulder.distanceTo(p.arms[i].elbow) - 0.42) < 1e-5,
      );
      assert.ok(
        Math.abs(p.arms[i].elbow.distanceTo(p.arms[i].hand) - 0.4) < 1e-5,
      );
    }
  });
test("carving leans the torso into the turn while both skis retain snow contact", () => {
  const s = { ...createState(), steer: 1, vx: 9 };
  const p = settle(s);
  assert.ok(p.hips.x > 0.2);
  assert.ok(p.torsoRotation.z < -0.25);
  for (const ski of p.skis) assert.equal(ski.position.y, 0);
});
test("turn reversals and grab releases blend without snapping", () => {
  const s = { ...createState(), steer: 1, airborne: true, grab: 1 };
  const p = settle(s);
  const hand = p.arms[0].hand.clone(),
    lean = p.lean;
  s.steer = -1;
  s.grab = 0;
  updateRiderPose(p, s, 1 / 120);
  assert.ok(p.lean > 0 && p.lean < lean);
  assert.ok(p.arms[0].hand.distanceTo(hand) < 0.08);
  for (let i = 0; i < 120; i++) updateRiderPose(p, s, 1 / 120);
  assert.ok(p.mute < 0.001);
  assert.ok(p.lean < -0.9);
});

test("landing from a held grab returns both skis to the snow immediately", () => {
  const s = { ...createState(), airborne: true, grab: 2 };
  const p = settle(s);
  s.airborne = false;
  s.grab = 0;
  s.landingPulse = 0.5;
  updateRiderPose(p, s, 1 / 120);
  for (const ski of p.skis) assert.equal(ski.position.y, 0);
});

test("taking off during a carve blends out body lean instead of snapping upright", () => {
  const s = { ...createState(), steer: 1 };
  const p = settle(s);
  const x = p.hips.x,
    roll = p.torsoRotation.z;
  s.airborne = true;
  updateRiderPose(p, s, 1 / 120);
  assert.ok(Math.abs(p.hips.x - x) < 0.03);
  assert.ok(Math.abs(p.torsoRotation.z - roll) < 0.04);
});
