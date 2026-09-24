import test from "node:test";
import assert from "node:assert/strict";
import { Euler, Vector3 } from "three";
import { createRiderPose, updateRiderPose } from "../src/rider-pose.js";
import { createState, step, resolveLanding } from "../src/physics.js";

test("tuck input softens the knees, folds the chest forward and drops the hands", () => {
  const s = createState();
  const neutral = settle(s);
  step(s, { tuck: true }, 1 / 120);
  const tucked = settle(s);
  assert.equal(s.tucking, true);
  assert.ok(tucked.hips.y < neutral.hips.y - 0.06, "knees bend a little more");
  assert.ok(tucked.hips.y > neutral.hips.y - 0.2, "not a deep squat");
  assert.ok(tucked.torsoRotation.x < neutral.torsoRotation.x - 0.4, "the chest folds forward");
  assert.ok(tucked.arms[0].hand.y < neutral.arms[0].hand.y - 0.2, "arms hang low");
  assert.ok(tucked.arms[0].hand.z < neutral.arms[0].hand.z, "hands stay ahead of the body");
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

test('landing squats deepen with airtime, soften on steep snow, and recover smoothly', () => {
  function touchdown(airtime, grade, hz = 120) {
    const s = { ...createState(), airborne: true, airtime };
    const p = settle(s);
    resolveLanding(s, { x: 0, s: -grade });
    const impact = s.landingPulse;
    let deepest = 0, peakTime = 0, previous = p.hips.y;
    for (let i = 0; i < hz * 2; i++) {
      step(s, {}, 1 / hz);
      updateRiderPose(p, s, 1 / hz);
      if (p.crouch > deepest) { deepest = p.crouch; peakTime = i / hz; }
      assert.ok(Math.abs(p.hips.y - previous) < .23, 'compression must blend over frames');
      for (let leg = 0; leg < 2; leg++)
        assert.ok(p.legs[leg].foot.distanceTo(p.skis[leg].boot) < 1e-6);
      previous = p.hips.y;
    }
    assert.ok(p.crouch < .02, 'rider stands back up after absorbing the impact');
    return { deepest, peakTime, impact };
  }
  const soft = touchdown(.4, 0), hard = touchdown(4, 0), steep = touchdown(4, 1.5);
  assert.ok(hard.deepest > soft.deepest + .25);
  assert.ok(steep.deepest < hard.deepest * .6);
  assert.ok(hard.peakTime > .05 && hard.peakTime < .25);
  for (const hz of [30, 60]) assert.ok(Math.abs(touchdown(4, 0, hz).deepest - hard.deepest) < .035);
});

test('skids hold a deep squat and strong directional lean without steering, including switch', () => {
  for (const direction of [-1, 1]) for (const switched of [false, true]) {
    const s = { ...createState(), speed: 35, landingSkid: .9,
      landingSkidDirection: direction, switch: switched };
    const p = settle(s), local = direction * (switched ? -1 : 1);
    assert.ok(p.crouch > .26, 'skid maintains its squat after the impact pulse fades');
    assert.ok(p.hips.x * local > .45);
    assert.ok(p.torsoRotation.z * local < -.7);
    assert.ok(p.hips.y < .6);
    for (let i = 0; i < 2; i++) {
      assert.equal(p.skis[i].position.y, 0);
      assert.ok(p.legs[i].foot.distanceTo(p.skis[i].boot) < 1e-6);
    }
    const previous = p.hips.clone();
    s.landingSkidDirection = -direction;
    updateRiderPose(p, s, 1 / 120);
    assert.ok(p.hips.distanceTo(previous) < .12, 'a skid reversal should not snap the body');
    s.landingSkid = 0;
    for (let i = 0; i < 240; i++) updateRiderPose(p, s, 1 / 120);
    assert.ok(Math.abs(p.hips.x) < .001 && p.crouch < .001);
  }
});

test('airborne and rail poses ignore stale landing impact and skid signals', () => {
  for (const flags of [{ airborne: true }, { railing: true }]) {
    const s = { ...createState(), ...flags };
    const baseline = settle(s);
    const stale = settle({ ...s, landingPulse: .65, landingSkid: 1, landingSkidDirection: 1 });
    assert.ok(stale.hips.distanceTo(baseline.hips) < 1e-8);
    assert.equal(stale.torsoRotation.z, baseline.torsoRotation.z);
  }
});

test("safety grab rolls both parallel skis onto their sides and holds the right one under the boot", () => {
  const p = settle({ ...createState(), airborne: true, grab: 2 });
  const [left, right] = p.skis;
  const directions = p.skis.map(ski => new Vector3(0, 0, 1).applyQuaternion(ski.quaternion));
  assert.ok(directions[0].dot(directions[1]) > 0.99, "skis stay parallel");
  assert.ok(left.position.distanceTo(right.position) < 0.3, "skis stay close together");
  for (const ski of p.skis) {
    const base = new Vector3(0, -1, 0).applyQuaternion(ski.quaternion);
    assert.ok(base.x > 0.9, "bases face out to the side, not the ground");
    assert.ok(ski.position.x > p.hips.x + 0.4, "skis are tweaked out to the right");
  }
  const arm = p.arms[1];
  assert.ok(arm.grip > 0.99);
  const local = arm.grabAnchor.clone().sub(right.position).applyQuaternion(right.quaternion.clone().invert());
  assert.ok(local.x > 0 && Math.abs(local.z) < 0.1, "hold the outside edge under the boot");
  assert.ok(p.torsoRotation.z < -0.3 && p.hips.x < -0.1, "the body bows sideways over the skis");
});
