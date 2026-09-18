import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import {
  GAMEPLAY_SKI_WIDTH_SCALE,
  GAMEPLAY_SKI_CLEARANCE,
  hideProceduralSkiBoots,
  measureSkiYaw,
  mountBlackridgeSki,
  straightenSkiGeometry,
} from "../src/blackridge-ski.js";

const part = (name) => {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  mesh.name = name;
  return mesh;
};

test("mounting a BLACKRIDGE ski replaces the procedural deck but keeps rider boots", () => {
  const parent = new Group();
  const fallback = ["deck", "plate", "toe", "heel", "boot", "cuff"].map(part);
  parent.add(...fallback);
  const generated = new Group();
  const generatedMesh = part("generated");
  generated.add(generatedMesh);

  const mounted = mountBlackridgeSki(generated, parent);

  assert.equal(mounted, generated);
  assert.equal(parent.children.at(-1), generated);
  assert.deepEqual(fallback.map((child) => child.visible), [false, false, false, false, true, true]);
  assert.equal(generated.position.y, GAMEPLAY_SKI_CLEARANCE);
  assert.equal(generated.scale.x, GAMEPLAY_SKI_WIDTH_SCALE);
  assert.equal(generated.scale.y, 1);
  assert.equal(generated.scale.z, 1);
  assert.equal(generatedMesh.castShadow, true);
  assert.equal(generatedMesh.receiveShadow, true);
});

test("hiding procedural boots after async loads does not hide the generated ski", () => {
  const parent = new Group();
  const fallback = ["deck", "plate", "toe", "heel", "boot", "cuff"].map(part);
  parent.add(...fallback);
  const proceduralBoots = fallback.slice(4);
  const generated = mountBlackridgeSki(new Group(), parent);

  hideProceduralSkiBoots(proceduralBoots);

  assert.deepEqual(proceduralBoots.map((child) => child.visible), [false, false]);
  assert.equal(generated.visible, true);
});

// A 2.8 m ski deck baked a few degrees off its Z axis, like the shipped asset.
function crookedSki(yaw = 0.05, offset = 0.02) {
  const geometry = new BoxGeometry(0.05, 0.02, 2.8, 1, 1, 28);
  geometry.rotateY(yaw);
  geometry.translate(offset, 0, 0);
  return geometry;
}

test("measuring a baked yaw recovers the angle and the lateral offset", () => {
  const { yaw, offset } = measureSkiYaw(crookedSki(0.05, 0.02));
  // A yaw of +a rotates the +Z tail toward -X, so the fitted slope is negative.
  assert.ok(Math.abs(Math.abs(yaw) - 0.05) < 1e-3, `yaw is ${yaw}`);
  assert.ok(Math.abs(offset - 0.02) < 1e-3, `offset is ${offset}`);
});

test("straightening aligns the ski centerline with its local Z axis, once", () => {
  const geometry = straightenSkiGeometry(crookedSki());
  const { yaw, offset } = measureSkiYaw(geometry);
  assert.ok(Math.abs(yaw) < 1e-4, `residual yaw is ${yaw}`);
  assert.ok(Math.abs(offset) < 1e-4, `residual offset is ${offset}`);
  const box = geometry.boundingBox;
  assert.ok(box.max.x - box.min.x < 0.051, "straightened deck is no wider than the ski");
  const before = geometry.getAttribute("position").array.slice();
  straightenSkiGeometry(geometry);
  assert.deepEqual(geometry.getAttribute("position").array, before);
});

test("mounting straightens the mesh and cloning a mounted ski keeps one width scale", () => {
  const first = new Group();
  first.add(new Mesh(crookedSki(), new MeshBasicMaterial()));
  const mounted = mountBlackridgeSki(first, new Group());
  const tipsSharedGeometry = mounted.children[0].geometry;
  assert.ok(Math.abs(measureSkiYaw(tipsSharedGeometry).yaw) < 1e-4);

  const second = mountBlackridgeSki(mounted.clone(true), new Group());
  assert.equal(second.scale.x, GAMEPLAY_SKI_WIDTH_SCALE);
  assert.equal(mounted.scale.x, GAMEPLAY_SKI_WIDTH_SCALE);
});
