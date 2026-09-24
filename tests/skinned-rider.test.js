import test from "node:test";
import assert from "node:assert/strict";
import { Group, Quaternion, Vector3 } from "three";
import { loadRider } from "./helpers/load-rider.js";
import { createRiderPose, updateRiderPose } from "../src/rider-pose.js";
import { createState } from "../src/physics.js";
import { createSkinnedRiderRig } from "../src/skinned-rider.js";


for (const scenario of [
  { name: "neutral" },
  { name: "tuck", tucking: true },
  { name: "skate plant", skating: 1, skatePhase: 0, speed: 0 },
  { name: "left skate push", skating: 1, skatePhase: -Math.PI/2, speed: 2 },
  { name: "right skate push", skating: 1, skatePhase: Math.PI/2, speed: 2 },
  { name: "carve", steer: 1 },
  { name: "opposite carve", steer: -1 },
  { name: "fast carve", steer: 1, speed: 40 },
  { name: "fast opposite carve", steer: -1, speed: 40 },
  { name: "fast switch carve", steer: 1, speed: 40, switch: true },
  { name: "fast tucked carve", steer: 1, speed: 40, tucking: true, charge: 1 },
  { name: "charged tuck", tucking: true, charge: 1 },
  { name: "takeoff", airborne: true, airtime: 0.08 },
  { name: "switch carve", switch: true, steer: 1 },
  { name: "landing", landingPulse: 0.4 },
  { name: "hard landing", landingPulse: .65 },
  { name: "left landing skid", landingPulse: .65, landingSkid: .9, landingSkidDirection: -1, speed: 35 },
  { name: "right landing skid", landingPulse: .65, landingSkid: .9, landingSkidDirection: 1, speed: 35 },
  { name: "switch landing skid", landingPulse: .65, landingSkid: .9, landingSkidDirection: -1, speed: 35, switch: true },
  { name: "mute", airborne: true, grab: 1 },
  { name: "safety", airborne: true, grab: 2 },
  { name: "blunt", airborne: true, grab: 3 },
  { name: "octo", airborne: true, grab: 4 },
  { name: "japan", airborne: true, grab: 5 },
]) {
  test(`the shipped skinned rider keeps boot contact during ${scenario.name}`, async () => {
    const model = await loadRider();
    const space = new Group();
    space.add(model);
    // Parent transforms must not leak into local IK; gameplay translates/rotates every frame.
    space.position.set(7, 180, -130);
    space.rotation.set(0.23, 1.2, -0.1);
    space.updateMatrixWorld(true);
    const rig = createSkinnedRiderRig(model, space);
    const p = createRiderPose();
    const s = { ...createState(), airtime: 0.7, ...scenario };
    for (let i = 0; i < 120; i++) updateRiderPose(p, s, 1 / 120);
    const contacts = rig.update(p, s);
    for (const foot of contacts.feet) {
      const actual = space.worldToLocal(foot.bone.getWorldPosition(new Vector3()));
      assert.ok(actual.distanceTo(foot.target) < 0.003, `boot misses binding by ${actual.distanceTo(foot.target)}`);
    }
    if (s.grab) {
      for (const i of s.grab === 4 ? [0, 1] : [s.grab === 1 || s.grab === 5 ? 0 : 1]) {
        const miss = contacts.hands[i].actual.distanceTo(p.arms[i].grabAnchor);
        assert.ok(miss < 0.025, `hand ${i} misses ski by ${miss}`);
      }
    }
    let count = 0;
    model.traverse(o => {
      if (o.isSkinnedMesh) {
        count++;
        o.skeleton.update();
        assert.ok(o.skeleton.boneMatrices.every(Number.isFinite));
      }
    });
    assert.ok(count > 0, "asset must contain an actual deforming skinned mesh");
  });
}

test("pose transitions keep the real skeleton continuous and boots attached", async () => {
  const model = await loadRider(), space = new Group();
  space.add(model);
  const rig = createSkinnedRiderRig(model, space), pose = createRiderPose();
  const state = { ...createState(), airtime: 0.7 };
  for (let i = 0; i < 120; i++) updateRiderPose(pose, state, 1 / 60);
  rig.update(pose, state);
  let previous = Object.fromEntries(Object.entries(rig.bones).map(([name, bone]) =>
    [name, { position: bone.getWorldPosition(new Vector3()), rotation: bone.getWorldQuaternion(new Quaternion()) }]));
  for (const flags of [
    { steer: 1 }, { steer: -1 }, { steer: 0, tucking: true },
    { tucking: false, airborne: true }, { grab: 1 }, { grab: 0 },
    { grab: 2 }, { grab: 3 }, { grab: 4 }, { grab: 5 }, { grab: 0 }, { switch: true },
  ]) {
    Object.assign(state, flags);
    for (let frame = 0; frame < 90; frame++) {
      updateRiderPose(pose, state, 1 / 60);
      const contacts = rig.update(pose, state);
      for (const foot of contacts.feet)
        assert.ok(foot.bone.getWorldPosition(new Vector3()).distanceTo(foot.target) < 0.003, "transition lost boot contact");
      for (const [name, bone] of Object.entries(rig.bones)) {
        const position = bone.getWorldPosition(new Vector3()), rotation = bone.getWorldQuaternion(new Quaternion());
        assert.ok(position.distanceTo(previous[name].position) < 0.15, `${name} jumps ${position.distanceTo(previous[name].position)}m at frame ${frame} during ${JSON.stringify(flags)}`);
        if (name === "Head") assert.ok(rotation.angleTo(previous[name].rotation) < 0.18, "head snaps during a stance change");
        previous[name] = { position, rotation };
      }
    }
  }
});

for (const duration of [1.2, 1.65]) {
  test(`wipeout folds back onto the snow and rises with boots attached (${duration}s)`, async () => {
    const model = await loadRider(), space = new Group();
    space.add(model);
    const rig = createSkinnedRiderRig(model, space), pose = createRiderPose();
    const state = createState();
    updateRiderPose(pose, state, 1 / 120);
    const standingHeight = pose.hips.y;
    let previousHead = null, touchedDown = false;
    for (let frame = 0; frame <= Math.ceil(duration * 120); frame++) {
      state.bailTimer = Math.max(0, duration - frame / 120);
      updateRiderPose(pose, state, 1 / 120);
      const contacts = rig.update(pose, state);
      for (const foot of contacts.feet) {
        assert.ok(foot.bone.getWorldPosition(new Vector3()).distanceTo(foot.target) < 0.003,
          "wipeout pulls a boot out of its binding");
      }
      const head = rig.bones.Head.getWorldPosition(new Vector3());
      if (previousHead) assert.ok(head.distanceTo(previousHead) < 0.13, "wipeout snaps between frames");
      previousHead = head;
      assert.equal(pose.torsoRotation.z, 0, "wipeout rolls sideways");
      if (pose.wipeout > 0.99) {
        touchedDown = true;
        assert.ok(head.y < 0.4 && head.y > 0.1, `head must lie near snow, got ${head.y}`);
        assert.ok(head.z > pose.hips.z + 0.5, "torso must fold backward");
        for (const leg of pose.legs) assert.ok(leg.knee.z < leg.hip.z, "knees must bend forward");
      }
    }
    assert.ok(touchedDown, "wipeout must reach the snow before rising");
    assert.ok(Math.abs(pose.hips.y - standingHeight) < 0.001, "rider must stand up again");
    assert.equal(pose.wipeout, 0);
  });
}
