import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// The physically narrow asset loses its silhouette when the chase camera looks
// almost straight down the ski. Give it a little more cross-slope presence
// without changing its length, thickness, binding position, or side profile.
export const GAMEPLAY_SKI_WIDTH_SCALE = 1.6;
export const GAMEPLAY_SKI_CLEARANCE = 0.12;

export function hideProceduralSkiBoots(parts) {
  for (const part of parts) part.visible = false;
}

/**
 * Measure how far the mesh centerline yaws off its local Z axis.
 * Returns the least-squares yaw (radians) and the lateral offset at the binding.
 */
export function measureSkiYaw(geometry) {
  const position = geometry.getAttribute("position");
  let n = 0, sumX = 0, sumZ = 0, sumXZ = 0, sumZZ = 0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), z = position.getZ(i);
    n++;
    sumX += x;
    sumZ += z;
    sumXZ += x * z;
    sumZZ += z * z;
  }
  const meanX = sumX / n, meanZ = sumZ / n;
  const varianceZ = sumZZ / n - meanZ * meanZ;
  const slope = varianceZ > 0 ? (sumXZ / n - meanX * meanZ) / varianceZ : 0;
  return { yaw: Math.atan(slope), offset: meanX - slope * meanZ };
}

/**
 * The exported ski mesh is baked a few degrees off its own Z axis, so every
 * ski points slightly to the rider's right. Combined with the V stance and the
 * width scale, one ski then aims straight under its leg (its front half hides)
 * while the other pokes out as a thin sliver. Rotate and recentre the mesh once
 * so both skis share the pose's symmetric yaw. Cloned skis share geometry, so
 * the correction is tracked on the geometry itself.
 */
export function straightenSkiGeometry(geometry) {
  if (geometry.userData.skiStraightened) return geometry;
  const { yaw, offset } = measureSkiYaw(geometry);
  geometry.translate(-offset, 0, 0);
  geometry.rotateY(-yaw);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.skiStraightened = true;
  return geometry;
}

export function mountBlackridgeSki(model, parent) {
  for (const fallbackPart of parent.children.slice(0, 4)) {
    fallbackPart.visible = false;
  }
  model.name = "BLACKRIDGE ski";
  model.position.y = GAMEPLAY_SKI_CLEARANCE;
  // Set, not multiplied: a clone of an already mounted ski must not compound.
  model.scale.set(GAMEPLAY_SKI_WIDTH_SCALE, 1, 1);
  model.traverse((object) => {
    if (object.isMesh) {
      straightenSkiGeometry(object.geometry);
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  parent.add(model);
  return model;
}

export async function loadBlackridgeSkis(parents) {
  const base = import.meta.env?.BASE_URL ?? "/";
  const gltf = await new GLTFLoader().loadAsync(`${base}models/blackridge-ski.glb`);
  // Clone from the untouched template every time: mounting mutates the model,
  // and cloning the first mounted ski used to double its width scale.
  return parents.map((parent) => mountBlackridgeSki(gltf.scene.clone(true), parent));
}
