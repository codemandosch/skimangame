import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import {
  GAMEPLAY_SKI_WIDTH_SCALE,
  GAMEPLAY_SKI_CLEARANCE,
  hideProceduralSkiBoots,
  mountBlackridgeSki,
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
