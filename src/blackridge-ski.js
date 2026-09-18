import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// The physically narrow asset loses its silhouette when the chase camera looks
// almost straight down the ski. Give it a little more cross-slope presence
// without changing its length, thickness, binding position, or side profile.
export const GAMEPLAY_SKI_WIDTH_SCALE = 1.6;
export const GAMEPLAY_SKI_CLEARANCE = 0.12;

export function hideProceduralSkiBoots(parts) {
  for (const part of parts) part.visible = false;
}

export function mountBlackridgeSki(model, parent) {
  for (const fallbackPart of parent.children.slice(0, 4)) {
    fallbackPart.visible = false;
  }
  model.name = "BLACKRIDGE ski";
  model.position.y = GAMEPLAY_SKI_CLEARANCE;
  model.scale.x *= GAMEPLAY_SKI_WIDTH_SCALE;
  model.traverse((object) => {
    if (object.isMesh) {
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
  return parents.map((parent, index) => {
    const model = index === 0 ? gltf.scene : gltf.scene.clone(true);
    return mountBlackridgeSki(model, parent);
  });
}
