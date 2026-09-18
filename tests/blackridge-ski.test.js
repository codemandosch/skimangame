import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Box3, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

async function readGlb() {
  const bytes = await readFile(
    new URL("../public/models/blackridge-ski.glb", import.meta.url),
  );
  assert.equal(bytes.subarray(0, 4).toString(), "glTF");
  const jsonSize = bytes.readUInt32LE(12);
  return { bytes, jsonSize, json: JSON.parse(bytes.subarray(20, 20 + jsonSize).toString()) };
}

async function readGlbScene() {
  const { bytes, jsonSize, json } = await readGlb();
  for (const mesh of json.meshes)
    for (const primitive of mesh.primitives) delete primitive.material;
  json.materials = [];
  json.images = [];
  json.textures = [];
  const encoded = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(encoded.length / 4) * 4, 32);
  encoded.copy(padded);
  const binChunk = bytes.subarray(20 + jsonSize);
  const glb = Buffer.alloc(20 + padded.length + binChunk.length);
  bytes.copy(glb, 0, 0, 20);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  padded.copy(glb, 20);
  binChunk.copy(glb, 20 + padded.length);
  return (
    await new GLTFLoader().parseAsync(
      glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
      "",
    )
  ).scene;
}

test("the shipped BLACKRIDGE ski is game-scale and centered on its binding", async () => {
  const bounds = new Box3().setFromObject(await readGlbScene());
  const min = bounds.min.toArray();
  const max = bounds.max.toArray();
  const size = bounds.getSize(new Vector3()).toArray();

  assert.ok(size[0] > 0.12 && size[0] < 0.32, `ski width is ${size[0]}`);
  assert.ok(size[1] > 0.08 && size[1] < 0.5, `ski/binding height is ${size[1]}`);
  assert.ok(size[2] > 2.75 && size[2] < 2.9, `ski length is ${size[2]}`);
  assert.ok(Math.abs((min[0] + max[0]) / 2) < 0.015, "ski is not laterally centered");
  assert.ok(Math.abs((min[2] + max[2]) / 2) < 0.12, "binding origin is too far from ski center");
  assert.ok(min[1] >= -0.002, "ski sits below its local snow-contact plane");
});

test("the shipped BLACKRIDGE ski keeps its game-ready mesh and textured material", async () => {
  const { json: gltf } = await readGlb();
  let triangles = 0;
  let vertices = 0;
  for (const mesh of gltf.meshes) {
    for (const primitive of mesh.primitives) {
      const position = gltf.accessors[primitive.attributes.POSITION];
      assert.ok(primitive.attributes.TEXCOORD_0 !== undefined, "mesh is missing UVs");
      vertices += position.count;
      const indices = gltf.accessors[primitive.indices];
      triangles += indices.count / 3;
    }
  }

  assert.ok(vertices > 3000 && vertices < 12000, `vertex count is ${vertices}`);
  assert.ok(triangles > 5000 && triangles < 20000, `triangle count is ${triangles}`);
  assert.ok(gltf.images?.some((image) => image.mimeType === "image/jpeg"));
  assert.ok(gltf.images?.some((image) => image.mimeType === "image/png"));
  assert.ok(
    gltf.materials?.some(
      (material) =>
        material.pbrMetallicRoughness?.baseColorTexture && material.normalTexture,
    ),
    "ski material must include embedded base color and normal textures",
  );
});
