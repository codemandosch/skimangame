// Offline bake for the scenery around and on Blackridge.
//
//   node scripts/bake-landscape.mjs [--preview <dir>] [--droplets N]
//
// Writes public/terrain/:
//   ranges-height.png    RGB  16-bit height (R high, G low byte, 0.1 m) + B snow gullies
//   ranges-light.png     RGB  R sun visibility, G sky visibility
//   blackridge-light.png RGB  R sun visibility, G sky visibility, B curvature
//   landscape.json       layout, sun and terrain signature used by the tests
// The sun is fixed, so long cast shadows (including Blackridge's own shadow
// across the valley) are baked instead of rendered every frame.
import { mkdir, writeFile } from 'node:fs/promises';
import { encodePNG } from './lib/png.mjs';
import { createNoise, baseHeight, erode, thermal } from './lib/ranges.mjs';
import { LANDSCAPE, BLACKRIDGE_LIGHT, VALLEY_FLOOR, gridCoordinate, sampleGrid } from '../src/landscape-layout.js';
import { SUN_VECTOR } from '../src/sun.js';
import { groundHeight, TREES } from '../src/blackridge.js';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : fallback; };
const previewDir = option('--preview', null);
const droplets = Number(option('--droplets', 900000));
// Iterating on the ranges alone: keep the existing Blackridge lighting.
const skipBlackridge = args.includes('--ranges-only');
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const time = label => { const start = performance.now(); return () => console.log(`${label}: ${((performance.now() - start) / 1000).toFixed(1)} s`); };

const N = LANDSCAPE.resolution, SIZE = LANDSCAPE.size, CELL = SIZE / N;
const worldX = i => ((i + .5) / N - .5) * SIZE;

// 1. Ranges heightfield.
let done = time('ranges base');
const noise = createNoise(20260924);
let ranges = new Float32Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) ranges[j * N + i] = baseHeight(noise, worldX(i), worldX(j));
done();
done = time(`erosion (${droplets} droplets)`);
const center = (N - 1) / 2, protectRadius = (LANDSCAPE.flatRadius - 200) / CELL;
ranges = erode(ranges, N, CELL, { droplets, seed: 7, protect: (x, y) => Math.hypot(x - center, y - center) < protectRadius });
thermal(ranges, N, CELL, { iterations: 10, talus: 1.3 });
done();
// Keep the resort valley exactly flat and level with Blackridge's apron.
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const r = Math.hypot(worldX(i), worldX(j)), k = j * N + i;
  const blend = smooth(LANDSCAPE.flatRadius, LANDSCAPE.flatRadius + 260, r);
  ranges[k] = VALLEY_FLOOR + Math.max(0, ranges[k] - VALLEY_FLOOR) * blend;
}

// Snow gullies: log flow accumulation marks couloirs that hold snow on rock.
done = time('flow accumulation');
const order = Array.from({ length: N * N }, (_, i) => i).sort((a, b) => ranges[b] - ranges[a]);
const flow = new Float32Array(N * N).fill(1);
for (const k of order) {
  const i = k % N, j = (k - i) / N;
  if (i === 0 || j === 0 || i === N - 1 || j === N - 1) continue;
  let best = -1, drop = 0;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj) continue;
    const n = k + dj * N + di, d = (ranges[k] - ranges[n]) / Math.hypot(di, dj);
    if (d > drop) { drop = d; best = n; }
  }
  if (best >= 0) flow[best] += flow[k];
}
done();

// 2. Blackridge heights at the lighting resolution (5 m).
done = time('blackridge heights');
const BN = BLACKRIDGE_LIGHT.resolution, BSIZE = BLACKRIDGE_LIGHT.size, BCELL = BSIZE / BN;
const bx = i => ((i + .5) / BN - .5) * BSIZE;
const ridge = new Float32Array(BN * BN);
for (let j = 0; j < BN; j++) for (let i = 0; i < BN; i++) {
  const x = bx(i), s = bx(j);
  ridge[j * BN + i] = Math.hypot(x, s) < LANDSCAPE.innerRadius + 20 ? groundHeight(x, s) : VALLEY_FLOOR;
}
done();

// Unified height: Blackridge detail inside its ring, eroded ranges outside.
function heightAt(x, s) {
  if (Math.abs(x) < BSIZE / 2 - BCELL && Math.abs(s) < BSIZE / 2 - BCELL && x * x + s * s < LANDSCAPE.innerRadius ** 2)
    return sampleGrid(ridge, BN, gridCoordinate(x, BSIZE, BN), gridCoordinate(s, BSIZE, BN));
  return sampleGrid(ranges, N, gridCoordinate(x, SIZE, N), gridCoordinate(s, SIZE, N));
}
let maxHeight = 0;
for (const h of ranges) maxHeight = Math.max(maxHeight, h);
for (const h of ridge) maxHeight = Math.max(maxHeight, h);

const sun = { x: SUN_VECTOR[0], y: SUN_VECTOR[1], s: -SUN_VECTOR[2] };
const horizontal = Math.hypot(sun.x, sun.s);
// Soft terrain shadow: the smallest angular clearance of the sun ray over the
// terrain, spread across a ~1.3 degree penumbra (sun disc plus sky blur).
function sunVisibility(x, s, y, maxDistance = 14000) {
  const penumbra = .023;
  let clearance = 1, t = 1.5;
  while (t < maxDistance) {
    const py = y + sun.y * t;
    if (py > maxHeight + 5) break;
    const h = heightAt(x + sun.x * t, s + sun.s * t);
    clearance = Math.min(clearance, (py - h) / t);
    if (clearance < -penumbra) return 0;
    t += Math.max(1.5, t * .025);
  }
  return smooth(-penumbra, penumbra, clearance);
}
// Horizon-based sky visibility relative to the local tangent plane.
const DIRECTIONS = Array.from({ length: 12 }, (_, k) => [Math.sin(k * Math.PI / 6), Math.cos(k * Math.PI / 6)]);
function skyVisibility(x, s, y, radius, first) {
  let sum = 0;
  for (const [dx, ds] of DIRECTIONS) {
    const tangent = (heightAt(x + dx * first, s + ds * first) - heightAt(x - dx * first, s - ds * first)) / (2 * first);
    let horizon = -Infinity;
    for (let t = first; t < radius; t *= 1.35) horizon = Math.max(horizon, (heightAt(x + dx * t, s + ds * t) - y) / t);
    const occluded = Math.max(0, Math.atan(horizon) - Math.atan(tangent));
    sum += 1 - Math.sin(occluded);
  }
  return sum / DIRECTIONS.length;
}

// 3. Ranges lighting (skip the flat valley interior Blackridge's map covers).
done = time('ranges lighting');
const rangeSun = new Uint8Array(N * N).fill(255), rangeSky = new Uint8Array(N * N).fill(255);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  const x = worldX(i), s = worldX(j), r = Math.hypot(x, s);
  if (r > LANDSCAPE.outerRadius + 300 || r < LANDSCAPE.innerRadius - 300) continue;
  const y = ranges[j * N + i];
  rangeSun[j * N + i] = Math.round(255 * sunVisibility(x, s, y + 4));
  rangeSky[j * N + i] = Math.round(255 * skyVisibility(x, s, y, 3200, CELL));
}
done();

// 4. Blackridge lighting and curvature.
done = time('blackridge lighting');
const light = new Uint8Array(BN * BN * 3);
if (!skipBlackridge) for (let j = 0; j < BN; j++) for (let i = 0; i < BN; i++) {
  const x = bx(i), s = bx(j), k = j * BN + i, y = ridge[k];
  const lap = (d) => (heightAt(x + d, s) + heightAt(x - d, s) + heightAt(x, s + d) + heightAt(x, s - d)) / 4 - y;
  const curvature = lap(8) / 8 * .55 + lap(30) / 30 * .45;
  light[k * 3] = Math.round(255 * sunVisibility(x, s, y + 1.2));
  light[k * 3 + 1] = Math.round(255 * skyVisibility(x, s, y, 900, 6));
  light[k * 3 + 2] = Math.round(255 * clamp(.5 + curvature * 2.2));
}
done();

// Soft shadows of Blackridge's firs (~10 m cones) so distant trees sit on
// the snow instead of floating; the real-time map handles nearby ones.
if (!skipBlackridge) for (const tree of TREES) {
  const height = 10 * tree.scale, radius = 2.6 * tree.scale, base = tree.y;
  const reach = height / Math.tan(Math.asin(sun.y)) + radius + 5;
  const i0 = Math.floor((tree.x - reach) / BCELL + BN / 2), i1 = Math.ceil((tree.x + reach) / BCELL + BN / 2);
  const j0 = Math.floor((tree.s - reach) / BCELL + BN / 2), j1 = Math.ceil((tree.s + reach) / BCELL + BN / 2);
  for (let j = Math.max(0, j0); j <= Math.min(BN - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(BN - 1, i1); i++) {
    const k = j * BN + i, x = bx(i), s = bx(j), y = ridge[k] + .5;
    // Closest approach of the sun ray to the trunk axis, then the cone radius there.
    const t = ((tree.x - x) * sun.x + (tree.s - s) * sun.s) / (horizontal * horizontal);
    if (t <= 0) continue;
    const d = Math.hypot(x + sun.x * t - tree.x, s + sun.s * t - tree.s), ry = y + sun.y * t;
    const along = (ry - base) / height;
    if (along < 0 || along > 1) continue;
    const cover = smooth(radius * (1 - along) + 1.2, radius * (1 - along) - 1.2, d);
    light[k * 3] = Math.round(light[k * 3] * (1 - .8 * cover));
  }
}

// 5. Encode.
const heightPixels = new Uint8Array(N * N * 3), lightPixels = new Uint8Array(N * N * 3);
let maxFlow = 0;
for (const f of flow) maxFlow = Math.max(maxFlow, f);
for (let k = 0; k < N * N; k++) {
  const q = Math.round(clamp(ranges[k] / LANDSCAPE.heightUnit, 0, 65535));
  heightPixels[k * 3] = q >> 8;
  heightPixels[k * 3 + 1] = q & 255;
  heightPixels[k * 3 + 2] = Math.round(255 * clamp(Math.log(flow[k]) / Math.log(maxFlow) * 1.6 - .25));
  lightPixels[k * 3] = rangeSun[k];
  lightPixels[k * 3 + 1] = rangeSky[k];
  lightPixels[k * 3 + 2] = 255;
}
const out = new URL('../public/terrain/', import.meta.url);
await mkdir(out, { recursive: true });
await writeFile(new URL('ranges-height.png', out), encodePNG(N, N, 3, heightPixels));
await writeFile(new URL('ranges-light.png', out), encodePNG(N, N, 3, lightPixels));
if (!skipBlackridge) await writeFile(new URL('blackridge-light.png', out), encodePNG(BN, BN, 3, light));
// A sparse terrain signature lets tests detect a stale Blackridge bake.
const signature = [];
for (let k = 0; k < 64; k++) {
  const a = k * 2.399963, r = 90 + k * 34;
  const x = Math.sin(a) * r, s = Math.cos(a) * r;
  signature.push([Math.round(x), Math.round(s), Math.round(groundHeight(Math.round(x), Math.round(s)) * 10) / 10]);
}
await writeFile(new URL('landscape.json', out), `${JSON.stringify({
  sun: SUN_VECTOR.map(v => Math.round(v * 1e6) / 1e6), landscape: LANDSCAPE, blackridge: BLACKRIDGE_LIGHT,
  maxHeight: Math.round(maxHeight), droplets, signature,
}, null, 1)}\n`);

if (previewDir) {
  // Shaded-relief review images for tuning the ranges without the game.
  const shade = new Uint8Array(N * N * 3);
  for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
    const k = j * N + i, gx = (ranges[k + 1] - ranges[k - 1]) / (2 * CELL), gs = (ranges[k + N] - ranges[k - N]) / (2 * CELL);
    const len = Math.hypot(gx, gs, 1), nx = -gx / len, ns = -gs / len, ny = 1 / len;
    const lambert = clamp(nx * sun.x + ns * sun.s + ny * sun.y) * rangeSun[k] / 255;
    const h = ranges[k], steep = 1 - ny, snow = h > 900 && steep < .55 ? 1 : h > 900 ? .35 : .15;
    const g = flow[k] > 60 ? .2 : 0;
    const base = [.35 + .6 * (snow + g), .38 + .58 * (snow + g), .42 + .56 * (snow + g)];
    const lit = .25 * rangeSky[k] / 255 + .85 * lambert;
    // Flip vertically so north is up in the image.
    const o = ((N - 1 - j) * N + i) * 3;
    for (let c = 0; c < 3; c++) shade[o + c] = Math.round(255 * clamp(base[c] * lit));
  }
  await mkdir(previewDir, { recursive: true });
  await writeFile(`${previewDir}/ranges-relief.png`, encodePNG(N, N, 3, shade));
  const b = new Uint8Array(BN * BN * 3);
  for (let j = 0; j < BN; j++) for (let i = 0; i < BN; i++) {
    const k = j * BN + i, o = ((BN - 1 - j) * BN + i) * 3;
    b[o] = light[k * 3]; b[o + 1] = light[k * 3 + 1]; b[o + 2] = light[k * 3 + 2];
  }
  await writeFile(`${previewDir}/blackridge-light.png`, encodePNG(BN, BN, 3, b));
}
console.log(`max height ${maxHeight.toFixed(0)} m`);
