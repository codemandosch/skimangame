import { readFile } from "node:fs/promises";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// Load the real shipped skeleton and skin in Node without browser image decoding.
export async function loadRider() {
  const bytes = await readFile(new URL("../../public/models/freestyle-skier.glb", import.meta.url));
  const jsonSize = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
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
  return (await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "")).scene;
}
