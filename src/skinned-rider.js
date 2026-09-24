import { Vector3, Quaternion, Euler } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { solveLimb } from "./rider-pose.js";

const vector = (x = 0, y = 0, z = 0) => new Vector3(x, y, z);

/** Pose the Blender deform rig in the rider body's space, preserving limb lengths. */
export function createSkinnedRiderRig(model, space) {
  space.updateWorldMatrix(true, true);
  const bones = {}, rest = {};
  const spaceRotation = space.getWorldQuaternion(new Quaternion());
  const inverseSpaceRotation = spaceRotation.clone().invert();
  model.traverse(object => {
    if (object.isBone) {
      bones[object.name] = object;
      rest[object.name] = {
        position: object.position.clone(),
        quaternion: object.quaternion.clone(),
        point: space.worldToLocal(object.getWorldPosition(vector())),
        rotation: inverseSpaceRotation.clone().multiply(object.getWorldQuaternion(new Quaternion())),
      };
    }
    if (object.isSkinnedMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
      // The animated limbs leave the imported bind-pose bounds during grabs.
      object.frustumCulled = false;
    }
  });
  for (const name of ["Hip", "Spine01", "Spine02", "Head", ...["L", "R"].flatMap(side =>
    ["Thigh", "Calf", "Foot", "ToeBase", "Upperarm", "Forearm", "Hand"].map(part => `${side}_${part}`))]) {
    if (!bones[name]) throw new Error(`Skier skeleton is missing ${name}`);
  }
  const sides = ["L", "R"].sort((a, b) => rest[`${a}_Thigh`].point.x - rest[`${b}_Thigh`].point.x);
  const limb = (side, parts) => {
    const names = parts.map(part => `${side}_${part}`);
    return {
      names,
      upper: rest[names[0]].point.distanceTo(rest[names[1]].point),
      lower: rest[names[1]].point.distanceTo(rest[names[2]].point),
    };
  };
  const legs = sides.map(side => limb(side, ["Thigh", "Calf", "Foot"]));
  const arms = sides.map(side => limb(side, ["Upperarm", "Forearm", "Hand"]));
  const point = name => space.worldToLocal(bones[name].getWorldPosition(vector()));

  function rotate(name, rotation) {
    const bone = bones[name];
    const world = space.getWorldQuaternion(new Quaternion()).multiply(rotation);
    bone.quaternion.copy(bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world));
    bone.updateWorldMatrix(false, true);
  }
  function aim(name, child, destination) {
    const direction = destination.clone().sub(point(name)).normalize();
    const bindDirection = rest[child].point.clone().sub(rest[name].point).normalize();
    const rotation = new Quaternion().setFromUnitVectors(bindDirection, direction).multiply(rest[name].rotation);
    rotate(name, rotation);
    return rotation;
  }
  function solve(chain, target, pole) {
    const [upper, lower, end] = chain.names;
    const solution = solveLimb(point(upper), target, pole, chain.upper, chain.lower);
    aim(upper, lower, solution.joint);
    return aim(lower, end, solution.end);
  }

  return {
    model,
    bones,
    update(pose, state) {
      // Reset before solving so frames and rest axes cannot accumulate drift.
      for (const [name, bone] of Object.entries(bones)) {
        bone.position.copy(rest[name].position);
        bone.quaternion.copy(rest[name].quaternion);
      }
      space.updateWorldMatrix(true, true);
      bones.Hip.position.copy(bones.Hip.parent.worldToLocal(space.localToWorld(pose.hips.clone())));
      rotate("Hip", pose.torsoQuaternion.clone().multiply(rest.Hip.rotation));
      // Curl the spine over the hips so a reaching grab bends the back
      // instead of stretching a rigid torso toward the ski.
      for (const [name, share] of [["Spine01", 0.5], ["Spine02", 1]]) {
        rotate(name, pose.torsoQuaternion.clone()
          .multiply(new Quaternion().setFromEuler(new Euler(pose.spineCurl * share, 0, pose.spineBend * share)))
          .multiply(rest[name].rotation));
      }

      const feet = [], hands = [];
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        const prefix = sides[i];
        const ski = pose.skis[i];
        const footName = `${prefix}_Foot`;
        const footTarget = vector(0, rest[footName].point.y + 0.17, 0.045)
          .applyQuaternion(ski.quaternion).add(ski.position);
        const kneePole = vector(side * 0.55 + pose.hips.x * 0.9,
          0.6 + pose.blunt * 0.9, -1.1);
        // Shaped grabs aim the knees themselves; the rest keep the rig's stance.
        kneePole.lerp(pose.legs[i].kneePole,
          Math.min(1, pose.mute + pose.safety + pose.octo + pose.daffy + pose.japan + pose.bow
            + pose.crash.face + pose.crash.tuck));
        solve(legs[i], footTarget, kneePole);
        const toeDirection = rest[`${prefix}_ToeBase`].point.clone().sub(rest[footName].point);
        const footYaw = Math.atan2(toeDirection.x, -toeDirection.z);
        const footRotation = ski.quaternion.clone()
          .multiply(new Quaternion().setFromAxisAngle(vector(0, 1, 0), footYaw))
          .multiply(rest[footName].rotation);
        rotate(footName, footRotation);
        feet.push({ bone: bones[footName], target: footTarget });

        const handName = `${prefix}_Hand`;
        const grip = pose.arms[i].grip;
        const palmOffset = vector(side * 0.055, -0.035, -0.015)
          .lerp(vector(side * 0.055, 0.015, 0), grip)
          .applyQuaternion(pose.torsoQuaternion.clone().slerp(pose.arms[i].gripQuaternion, grip));
        const targetPalm = pose.arms[i].hand.clone();
        const targetWrist = targetPalm.clone().sub(palmOffset);
        const forearmRotation = solve(arms[i], targetWrist, pose.arms[i].elbowPole);
        const bindPalm = rest[handName].point.clone().sub(rest[`${prefix}_Forearm`].point).normalize();
        const handRotation = new Quaternion().setFromUnitVectors(bindPalm, palmOffset.clone().normalize())
          .multiply(rest[handName].rotation);
        rotate(handName, handRotation);
        hands.push({ bone: bones[handName], actual: point(handName).add(palmOffset),
          target: targetPalm, rotation: forearmRotation });
      }
      // Counter-flex the neck to keep the gaze ahead; glance over a shoulder in switch.
      const headYaw = pose.lookBack * 0.85 - (1 - pose.lookBack) * pose.lean * 0.22;
      rotate("Head", pose.torsoQuaternion.clone()
        .multiply(new Quaternion().setFromEuler(new Euler(pose.tuck * 0.28 + pose.crouch * 0.18 + pose.mute * 0.16, headYaw, 0)))
        .multiply(rest.Head.rotation));
      model.updateMatrixWorld(true);
      return { feet, hands };
    },
  };
}

export async function loadSkinnedRider(space) {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/freestyle-skier.glb`);
  space.add(gltf.scene);
  try {
    return createSkinnedRiderRig(gltf.scene, space);
  } catch (error) {
    space.remove(gltf.scene);
    throw error;
  }
}
