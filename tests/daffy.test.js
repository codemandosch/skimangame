import test from "node:test";
import assert from "node:assert/strict";
import { Group, Vector3 } from "three";
import { createState, step, resolveLanding, respawn, trickValue } from "../src/physics.js";
import { keyboardInput, releaseKey } from "../src/controls.js";
import { createRiderPose, updateRiderPose } from "../src/rider-pose.js";
import { createSkinnedRiderRig } from "../src/skinned-rider.js";
import { loadRider } from "./helpers/load-rider.js";
import { selectCourse, groundHeight } from "../src/course.js";

const flight = () => ({ ...createState(), airborne: true, y: 10000, airtime: 0.7 });
function advance(s, held, frames, fps = 120) {
  for (let i = 0; i < frames; i++) step(s, { daffy: held }, 1 / fps);
}

test("A controls Daffy independently of Space and has no ground effect", () => {
  const keys = new Set(["KeyA"]), input = keyboardInput(keys), s = createState();
  assert.equal(input.daffy, true);
  assert.equal(input.steer, 0);
  assert.equal(input.charge, false);
  assert.equal(releaseKey(keys, "KeyA"), false);
  step(s, input, 1 / 120);
  assert.equal(s.daffyProgress, 0);
});

for (const fps of [30, 60, 120]) {
  test(`extension and recovery each take half a second at ${fps} Hz`, () => {
    const s = flight();
    advance(s, true, fps / 2 - 1, fps);
    assert.ok(s.daffyProgress > 0 && s.daffyProgress < 1);
    advance(s, true, 1, fps);
    assert.equal(s.daffyProgress, 1);
    advance(s, true, fps, fps);
    assert.equal(s.daffyProgress, 1, "holding A keeps the daffy extended");
    advance(s, false, fps / 2 - 1, fps);
    assert.ok(s.daffyProgress > 0);
    assert.equal(s.daffyCompleted, false);
    advance(s, false, 1, fps);
    assert.equal(s.daffyProgress, 0);
    assert.equal(s.daffyCompleted, true);
    assert.match(trickValue(s).name, /DAFFY/);
    resolveLanding(s);
    assert.equal(s.eventType, "land");
    assert.ok(s.lastPoints >= 400);
  });
}

for (const phase of ["extension", "held", "recovery"]) {
  test(`landing during ${phase} wipes out even with level skis`, () => {
    const s = flight();
    advance(s, true, phase === "extension" ? 20 : 60);
    if (phase === "recovery") advance(s, false, 59);
    resolveLanding(s);
    assert.equal(s.eventType, "bail");
    assert.ok(s.bailTimer > 0);
    assert.equal(s.score, 0);
    assert.match(s.messageDetail, /recover/);
    assert.equal(s.daffyProgress, 0);
  });
}

test("pause freezes the sequence, early release reverses it, and respawn clears it", () => {
  const s = flight();
  advance(s, true, 30);
  const progress = s.daffyProgress;
  s.paused = true;
  advance(s, false, 60);
  assert.equal(s.daffyProgress, progress);
  s.paused = false;
  advance(s, false, 30);
  assert.equal(s.daffyProgress, 0);
  assert.equal(s.daffyCompleted, false, "partial extension must not score");
  advance(s, true, 60);
  respawn(s);
  assert.equal(s.daffyProgress, 0);
  assert.equal(s.daffyExtended, false);
});

test("grabs cannot bypass an unfinished Daffy landing check", () => {
  const s = flight();
  advance(s, true, 60);
  step(s, { grab: 1 }, 1 / 120);
  assert.equal(s.grab, 0);
  resolveLanding(s);
  assert.equal(s.eventType, "bail");
});

for (const course of ["bluebird", "blackridge"]) {
  test(`${course} terrain contact checks recovery on the touchdown frame`, () => {
    selectCourse(course);
    try {
      for (const remainingFrames of [1, 2]) {
        const s = flight();
        s.speed = s.vx = s.vs = 0;
        s.daffyProgress = remainingFrames / 60;
        s.daffyExtended = true;
        s.y = groundHeight(0, 0) - 0.01;
        s.vy = -1;
        step(s, {}, 1 / 120);
        assert.equal(s.airborne, false);
        assert.equal(s.eventType, remainingFrames === 1 ? "land" : "bail");
      }
    } finally {
      selectCourse("bluebird");
    }
  });
}

test("daffy splits fore/aft with both hands on the ski ends and returns smoothly", async () => {
  const space = new Group(), model = await loadRider();
  space.add(model);
  const rig = createSkinnedRiderRig(model, space), pose = createRiderPose(), s = flight();
  for (let i = 0; i < 120; i++) updateRiderPose(pose, s, 1 / 120);
  let previous;
  for (let frame = 0; frame < 120; frame++) {
    step(s, { daffy: frame < 60 }, 1 / 120);
    updateRiderPose(pose, s, 1 / 120);
    const contacts = rig.update(pose, s);
    for (let i = 0; i < 2; i++) {
      assert.ok(pose.legs[i].foot.distanceTo(pose.skis[i].boot) < 1e-6);
      const foot = contacts.feet[i];
      assert.ok(foot.bone.getWorldPosition(new Vector3()).distanceTo(foot.target) < 0.003);
    }
    const points = Object.values(rig.bones).map(b => b.getWorldPosition(new Vector3()));
    if (previous) points.forEach((p, i) => assert.ok(p.distanceTo(previous[i]) < 0.09, "limb snaps"));
    previous = points;
    assert.ok(pose.skis[0].boot.x < pose.skis[1].boot.x, "legs must never cross sides");
    if (frame === 59) {
      assert.ok(pose.skis[1].boot.z - pose.skis[0].boot.z > 0.8, "legs must split fore/aft");
      for (let i = 0; i < 2; i++) {
        assert.ok(pose.arms[i].hand.distanceTo(pose.arms[i].grabAnchor) < 0.012, "procedural hand misses ski end");
        const error = contacts.hands[i].actual.distanceTo(pose.arms[i].grabAnchor);
        assert.ok(error < 0.025, `hand ${i} misses ski end by ${error}`);
      }
    }
  }
  assert.ok(Math.abs(pose.skis[0].boot.z - pose.skis[1].boot.z) < 0.001, "feet return before safe landing");
});
