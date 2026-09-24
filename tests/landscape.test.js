import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { encodePNG, decodePNG } from '../scripts/lib/png.mjs';
import { LANDSCAPE, BLACKRIDGE_LIGHT, VALLEY_FLOOR } from '../src/landscape-layout.js';
import { SUN_VECTOR } from '../src/sun.js';
import { groundHeight, mountainFraction, TREES } from '../src/blackridge.js';
import { decodeLandscape, landscapeHeight, placeForest, FOREST_GEOMETRY_RADIUS } from '../src/landscape.js';
import { placeCloudBanks, findPeaks } from '../src/clouds.js';
import { RESORT } from '../src/resort-layout.js';
import { getLiftLayout } from '../src/lift-layout.js';

const terrain = name => readFile(new URL(`../public/terrain/${name}`, import.meta.url));
let cached;
async function landscape() {
  cached ??= decodeLandscape(decodePNG(await terrain('ranges-height.png')), decodePNG(await terrain('ranges-light.png')));
  return cached;
}

test('baked PNG data round-trips exactly through the shared decoder', () => {
  const pixels = Uint8Array.from({ length: 7 * 5 * 3 }, (_, i) => (i * 37 + (i >> 3) * 11) & 255);
  const decoded = decodePNG(encodePNG(7, 5, 3, pixels));
  assert.equal(decoded.width, 7);
  assert.equal(decoded.height, 5);
  assert.deepEqual(decoded.pixels, pixels);
});

test('baked lighting matches the current sun and Blackridge terrain', async () => {
  const meta = JSON.parse(await terrain('landscape.json'));
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(meta.sun[i] - SUN_VECTOR[i]) < 1e-5, 're-run scripts/bake-landscape.mjs after moving the sun');
  assert.deepEqual(meta.landscape, LANDSCAPE);
  for (const [x, s, h] of meta.signature)
    assert.ok(Math.abs(groundHeight(x, s) - h) < .06, `terrain changed at ${x},${s}: re-run the bake`);
  const light = decodePNG(await terrain('blackridge-light.png'));
  assert.equal(light.width, BLACKRIDGE_LIGHT.resolution);
  // The face turned away from the sun sits in the mountain's own shadow.
  const texel = (x, s) => {
    const i = Math.floor((x / BLACKRIDGE_LIGHT.size + .5) * light.width), j = Math.floor((s / BLACKRIDGE_LIGHT.size + .5) * light.height);
    return light.pixels[(j * light.width + i) * 3];
  };
  const lee = Math.atan2(-SUN_VECTOR[0], SUN_VECTOR[2]), windward = lee + Math.PI;
  let shaded = 0, lit = 0;
  for (let r = 500; r < 1600; r += 100) {
    shaded += texel(Math.sin(lee) * r, Math.cos(lee) * r) < 60;
    lit += texel(Math.sin(windward) * r, Math.cos(windward) * r) > 180;
  }
  assert.ok(shaded >= 8, `${shaded} shaded samples on the lee face`);
  assert.ok(lit >= 8, `${lit} lit samples on the sunward face`);
});

test('the valley floor meets Blackridge seamlessly and the ranges rise beyond it', async () => {
  const data = await landscape();
  for (let a = 0; a < Math.PI * 2; a += .05) {
    const x = Math.sin(a), s = Math.cos(a);
    const r = LANDSCAPE.innerRadius;
    assert.ok(Math.abs(landscapeHeight(data, x * r, s * r) - groundHeight(x * r, s * r)) < 1e-6, 'seam uses the collision surface');
    const flat = landscapeHeight(data, x * (LANDSCAPE.flatRadius - 30), s * (LANDSCAPE.flatRadius - 30));
    assert.ok(Math.abs(flat - VALLEY_FLOOR) < .5, 'resort road ring stays level');
  }
  let highest = 0;
  for (const h of data.heights) highest = Math.max(highest, h);
  assert.ok(highest > 2800 && highest < 4300, `${highest} m summits`);
  assert.ok(findPeaks(data).length >= 3, 'banner-cloud peaks exist');
});

test('valley forests stay off the ski terrain, roads, buildings and the lift plaza', async () => {
  const data = await landscape();
  const trees = placeForest(data);
  assert.ok(trees.length > 5000 && trees.length < 80000, `${trees.length} trees`);
  const lift = getLiftLayout(), buildings = RESORT.towns.flatMap(t => t.buildings);
  for (const [i, t] of trees.entries()) {
    if (i % 7) continue;
    assert.ok(mountainFraction(t.x, t.s) >= 1.045, 'never on Blackridge\'s ski faces');
    assert.ok(Math.hypot(t.x, t.s) <= FOREST_GEOMETRY_RADIUS);
    assert.ok(Math.abs(t.y - landscapeHeight(data, t.x, t.s)) < 1e-6, 'rooted on the ground');
    assert.ok(Math.hypot(t.x - lift.bottom.x, t.s - lift.bottom.s) >= 70);
    assert.ok(buildings.every(b => Math.hypot(b.x - t.x, b.s - t.s) >= b.radius + 10));
    assert.ok(TREES.every(o => Math.hypot(o.x - t.x, o.s - t.s) >= 12));
  }
  for (const road of RESORT.roads) for (const p of road.points.filter((_, k) => k % 3 === 0))
    assert.ok(!trees.some(t => Math.abs(t.x - p.x) < 20 && Math.abs(t.s - p.s) < 20 && Math.hypot(t.x - p.x, t.s - p.s) < road.width / 2 + 8), `${road.name} is clear`);
});

test('the cloud sea floats above the valleys it fills', async () => {
  const data = await landscape();
  const banks = placeCloudBanks(data, (x, s) => landscapeHeight(data, x, s));
  assert.ok(banks.length > 150, `${banks.length} billows`);
  for (const b of banks) {
    assert.ok(b.y - landscapeHeight(data, b.x, -b.z) > 100, 'cloud base clears the ground beneath it');
    assert.ok(Math.hypot(b.x, b.z) > 4000, 'keeps the resort valley clear');
  }
});
