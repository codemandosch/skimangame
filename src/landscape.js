import * as THREE from 'three';
import { LANDSCAPE, TREE_LINE_ALTITUDE, gridCoordinate, sampleGrid } from './landscape-layout.js';
import { loadPNGData } from './png-data.js';
import { NOISE_GLSL } from './shader-noise.js';
import { SUN_VECTOR } from './sun.js';
import { patchDirectionalLight } from './snow-surface.js';
import { groundHeight, mountainFraction, TREES } from './blackridge.js';
import { RESORT } from './resort-layout.js';
import { getLiftLayout } from './lift-layout.js';

// The valley and eroded ranges that surround Blackridge. Heights, sun and
// sky visibility come from scripts/bake-landscape.mjs; everything else
// (normals, forest cover, tree placement) is derived here at load time.
const N = LANDSCAPE.resolution, SIZE = LANDSCAPE.size, CELL = SIZE / N;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
// Geometric trees stop here; the landscape shader paints canopy beyond.
export const FOREST_GEOMETRY_RADIUS = 3350;

export function decodeLandscape(height, light) {
  const heights = new Float32Array(N * N), flow = new Uint8Array(N * N);
  const sun = new Uint8Array(N * N), sky = new Uint8Array(N * N);
  for (let k = 0; k < N * N; k++) {
    heights[k] = (height.pixels[k * 3] * 256 + height.pixels[k * 3 + 1]) * LANDSCAPE.heightUnit;
    flow[k] = height.pixels[k * 3 + 2];
    sun[k] = light.pixels[k * 3];
    sky[k] = light.pixels[k * 3 + 1];
  }
  return { heights, flow, sun, sky };
}

export function landscapeHeight(data, x, s) {
  if (x * x + s * s < LANDSCAPE.flatRadius ** 2) return groundHeight(x, s);
  return sampleGrid(data.heights, N, gridCoordinate(x, SIZE, N), gridCoordinate(s, SIZE, N));
}

function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
}
const fbm = (x, y) => valueNoise(x, y) * .5 + valueNoise(x * 2.03 + 7, y * 2.03 - 3) * .3 + valueNoise(x * 4.1 + 1, y * 4.1 + 5) * .2;

// Conifer cover: below the tree line, on moderate slopes, in clumps; open
// meadows, avalanche paths (snow gullies) and the resort are left clear.
export function forestCover(x, s, h, slope, gully) {
  const r = Math.hypot(x, s);
  const line = TREE_LINE_ALTITUDE + (fbm(x * .0011, s * .0011) - .5) * 420;
  // Dense stands low down, thinning into ragged groves toward the tree line.
  const altitude = 1 - smooth(line - 420, line + 40, h);
  const stands = fbm(x * .0019 + 3.3, s * .0019 - 1.1) * .75 + fbm(x * .009, s * .009) * .25;
  const clumps = smooth(.62 - altitude * .22, .7 - altitude * .2, stands);
  const valley = smooth(LANDSCAPE.innerRadius - 380, LANDSCAPE.flatRadius + 150, r);
  // Only the major avalanche paths stay clear through the trees.
  return altitude * clumps * (1 - smooth(.42, .6, slope)) * (1 - smooth(.68, .92, gully)) * valley;
}

function buildTextures(data) {
  const a = new Uint8Array(N * N * 4), b = new Uint8Array(N * N * 4);
  const at = (i, j) => data.heights[Math.max(0, Math.min(N - 1, j)) * N + Math.max(0, Math.min(N - 1, i))];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    const dhdx = (at(i + 1, j) - at(i - 1, j)) / (2 * CELL), dhds = (at(i, j + 1) - at(i, j - 1)) / (2 * CELL);
    const length = Math.hypot(dhdx, 1, dhds), nx = -dhdx / length, nz = dhds / length, ny = 1 / length;
    a[k * 4] = Math.round((nx * .5 + .5) * 255);
    a[k * 4 + 1] = Math.round((nz * .5 + .5) * 255);
    a[k * 4 + 2] = data.sun[k];
    a[k * 4 + 3] = data.sky[k];
    const x = ((i + .5) / N - .5) * SIZE, s = ((j + .5) / N - .5) * SIZE;
    b[k * 4] = data.flow[k];
    b[k * 4 + 1] = Math.round(255 * forestCover(x, s, data.heights[k], 1 - ny, data.flow[k] / 255));
    // Coarse altitude lets the cloud sea fade softly where it meets the ranges.
    b[k * 4 + 2] = Math.round(clamp(data.heights[k] / 4000) * 255);
    b[k * 4 + 3] = 255;
  }
  const texture = pixels => {
    const t = new THREE.DataTexture(pixels, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  };
  return { surface: texture(a), cover: texture(b) };
}

// Polar mesh: fine rings next to the valley, widening toward the horizon.
function buildGeometry(data) {
  const segments = 1536, radii = [];
  for (let r = LANDSCAPE.innerRadius; r < LANDSCAPE.outerRadius; r += Math.max(9, r * .0085)) radii.push(r);
  radii.push(LANDSCAPE.outerRadius);
  const rings = radii.length, count = (segments + 1) * rings;
  const positions = new Float32Array(count * 3);
  for (let ring = 0; ring < rings; ring++) for (let a = 0; a <= segments; a++) {
    const angle = a / segments * Math.PI * 2, r = radii[ring];
    const x = Math.sin(angle) * r, s = Math.cos(angle) * r, k = (ring * (segments + 1) + a) * 3;
    positions[k] = x;
    positions[k + 1] = landscapeHeight(data, x, s);
    positions[k + 2] = -s;
  }
  const index = new Uint32Array((rings - 1) * segments * 6);
  let n = 0;
  for (let ring = 0; ring < rings - 1; ring++) for (let a = 0; a < segments; a++) {
    const i = ring * (segments + 1) + a, j = i + segments + 1;
    index[n++] = i; index[n++] = i + 1; index[n++] = j;
    index[n++] = i + 1; index[n++] = j + 1; index[n++] = j;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

// Beyond the baked square, lower-detail ranges continue to 30 km so no
// viewpoint ever sees the edge of the world; haze does the rest.
function buildFarRing(data) {
  const segments = 1800, radii = [];
  for (let r = LANDSCAPE.outerRadius - 60; r < 30000; r *= 1.045) radii.push(r);
  const positions = new Float32Array((segments + 1) * radii.length * 3);
  for (let ring = 0; ring < radii.length; ring++) for (let a = 0; a <= segments; a++) {
    const angle = a / segments * Math.PI * 2, r = radii[ring], x = Math.sin(angle) * r, s = Math.cos(angle) * r;
    const edge = landscapeHeight(data, Math.sin(angle) * LANDSCAPE.outerRadius, Math.cos(angle) * LANDSCAPE.outerRadius);
    const t = smooth(0, 5000, r - LANDSCAPE.outerRadius);
    const ridge = f => 1 - Math.abs(fbm(x * f, s * f) * 2 - 1);
    const crest = ridge(.00022);
    const ridges = 450 + 1500 * Math.pow(crest, 2.4) + 650 * Math.pow(ridge(.00071), 2) * crest
      + 150 * Math.pow(ridge(.0011), 2) * crest + 60 * fbm(x * .004, s * .004);
    const k = (ring * (segments + 1) + a) * 3;
    positions[k] = x;
    positions[k + 1] = ring === 0 ? edge - 40 : edge * (1 - t) + ridges * t - 60 * (1 - t);
    positions[k + 2] = -s;
  }
  const index = [];
  for (let ring = 0; ring < radii.length - 1; ring++) for (let a = 0; a < segments; a++) {
    const i = ring * (segments + 1) + a, j = i + segments + 1;
    index.push(i, i + 1, j, i + 1, j + 1, j);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  // Forested, darker lower slopes; snow above a ragged snow line, broken by
  // dark rock on the steepest faces. Haze turns it all blue at this range.
  const normals = geometry.attributes.normal, colors = new Float32Array(normals.count * 3);
  for (let i = 0; i < normals.count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], s = -positions[i * 3 + 2];
    const snowLine = 1250 + 350 * fbm(x * .0004, s * .0004);
    const snow = smooth(snowLine - 150, snowLine + 150, y) * (1 - smooth(.8, .7, normals.getY(i)) * .8);
    colors.set([.14 + .62 * snow, .17 + .63 * snow, .2 + .66 * snow], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function landscapeMaterial(textures) {
  const granite = new THREE.TextureLoader().load('/textures/alpine-granite.png');
  granite.colorSpace = THREE.SRGBColorSpace;
  granite.wrapS = granite.wrapT = THREE.RepeatWrapping;
  granite.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .9 });
  const uniforms = {
    landSurface: { value: textures.surface },
    landCover: { value: textures.cover },
    landGranite: { value: granite },
    landSize: { value: SIZE },
    forestGeometryRadius: { value: FOREST_GEOMETRY_RADIUS },
  };
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLandWorld;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvLandWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLandWorld;
        uniform sampler2D landSurface, landCover, landGranite;
        uniform float landSize, forestGeometryRadius;
        ${NOISE_GLSL}
        float landSun = 1.0, landSky = 1.0, landRock = 0.0, landForest = 0.0, landIce = 0.0;
        vec3 landNormal = vec3(0, 1, 0);
        vec3 triplanar(sampler2D map, vec3 p, vec3 n, float scale) {
          vec3 w = pow(abs(n), vec3(4.0)); w /= dot(w, vec3(1.0));
          return texture2D(map, p.zy * scale).rgb * w.x + texture2D(map, p.xz * scale).rgb * w.y + texture2D(map, p.xy * scale).rgb * w.z;
        }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 landUV = vec2(vLandWorld.x, -vLandWorld.z) / landSize + .5;
        vec4 surface = texture2D(landSurface, landUV);
        vec4 cover = texture2D(landCover, landUV);
        vec2 nxz = surface.rg * 2.0 - 1.0;
        landNormal = normalize(vec3(nxz.x, sqrt(max(1.0 - dot(nxz, nxz), .02)), nxz.y));
        landSun = surface.b;
        landSky = mix(.5, 1.0, surface.a);
        float h = vLandWorld.y;
        float slope = 1.0 - landNormal.y;
        float dist = length(vViewPosition);
        vec2 xz = vLandWorld.xz;
        float n1 = fbm3(xz * .0021);
        float n2 = fbm3(xz * .013);
        float gully = cover.r;
        // Bare rock on steep faces; snow still plasters ledges, couloirs and
        // anything under ~48 degrees. Wind strips more rock on the high crests.
        float ledges = fbm3(xz * .026 + vec2(0.0, h * .02));
        float rockSlope = .31 - .05 * smoothstep(2300.0, 3400.0, h) + (n1 - .5) * .14 + (ledges - .5) * .16;
        landRock = smoothstep(rockSlope, rockSlope + .06, slope) * (1.0 - smoothstep(.4, .75, gully)) * smoothstep(120.0, 420.0, h);
        // Glaciers: gentle high bowls, faintly blue with crevasse streaks.
        landIce = smoothstep(2150.0, 2500.0, h + (n1 - .5) * 400.0) * (1.0 - smoothstep(.1, .2, slope)) * (1.0 - landRock);
        // Painted canopy where no individual trees are placed.
        float r = length(xz);
        landForest = cover.g * smoothstep(forestGeometryRadius - 160.0, forestGeometryRadius + 120.0, r);
        vec3 snow = vec3(.9, .93, .97) * (.95 + .08 * n2);
        vec3 granite = triplanar(landGranite, vLandWorld, landNormal, .013) * 1.2;
        // Warm gneiss and cool dark granite, banded by altitude like strata.
        float strata = vNoise(vec2(h * .018 + n1 * 5.0, n2 * 2.5));
        vec3 rockTone = mix(vec3(.12, .12, .13), vec3(.2, .18, .165), smoothstep(.35, .8, strata) * .7);
        rockTone = mix(rockTone, vec3(.075, .08, .09), smoothstep(.55, .8, n2) * .6);
        vec3 rock = rockTone * mix(vec3(1.0), granite * 1.6, .55 * (1.0 - smoothstep(900.0, 3500.0, dist)));
        // Snow plastered onto ledges and down narrow runnels on the faces.
        float plaster = smoothstep(.56, .7, fbm3(xz * .045 + h * .015) * .6 + fbm3(xz * .012 - h * .03) * .4);
        rock = mix(rock, snow * .92, plaster * .85);
        vec3 ice = vec3(.74, .86, .96);
        float speckle = vNoise(xz * .21);
        vec3 canopy = mix(vec3(.028, .05, .045), vec3(.62, .68, .74), smoothstep(.45, .85, speckle) * .55);
        // Needle litter and canopy shade beneath the individually placed trees.
        snow *= 1.0 - .5 * cover.g * (1.0 - smoothstep(forestGeometryRadius - 160.0, forestGeometryRadius + 120.0, r));
        vec3 albedo = mix(snow, ice, landIce * .6);
        albedo = mix(albedo, rock, landRock);
        albedo = mix(albedo, canopy, landForest * .92);
        diffuseColor.rgb = albedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(mix(.84, .45, landIce), .93, max(landRock, landForest));`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
        normal = normalize((viewMatrix * vec4(landNormal, 0.0)).xyz);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // Crags and canopy texture below the heightmap's 24 m resolution.
          float crag = fbm3(xz * .045 + vec2(h * .012)) * landRock * 9.0;
          float tops = (vNoise(xz * .09) - .5) * 6.0 * landForest;
          float drift = (fbm3(xz * .03) - .5) * 2.0 * (1.0 - landRock) * (1.0 - landForest);
          float bump = (crag + tops + drift) * (1.0 - smoothstep(2500.0, 9000.0, dist));
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 rx = cross(sy, normal), ry = cross(normal, sx);
          float determinant = dot(sx, rx) * faceDirection;
          vec3 gradient = sign(determinant) * (dFdx(bump) * rx + dFdy(bump) * ry);
          normal = normalize(abs(determinant) * normal - gradient);
        }`)
      .replace('#include <lights_fragment_begin>', patchDirectionalLight(THREE.ShaderChunk.lights_fragment_begin,
        'directLight.color *= landSun;\n', ''))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= landSky * mix(1.0, .55, landForest);
        reflectedLight.indirectSpecular *= landSky;`);
  };
  material.customProgramCacheKey = () => 'alpine-landscape-v1';
  return material;
}

// Low-poly spruce for the valley forests: five narrow, drooping tiers of
// dark needles with thin snow caps, readable as forest from kilometres away.
export function buildForestFir() {
  const positions = [], colors = [], index = [];
  const sides = 6;
  const bark = [.04, .03, .022], needle = [.014, .03, .024], tip = [.022, .045, .034], snow = [.62, .67, .74];
  const push = (x, y, z, c) => { positions.push(x, y, z); colors.push(...c); return positions.length / 3 - 1; };
  const t0 = positions.length / 3;
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2; push(Math.cos(a) * .4, 0, Math.sin(a) * .4, bark); push(Math.cos(a) * .3, 3, Math.sin(a) * .3, bark); }
  for (let i = 0; i < 4; i++) { const a = t0 + i * 2, b = t0 + ((i + 1) % 4) * 2; index.push(a, a + 1, b, b, a + 1, b + 1); }
  const tiers = 5;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers, radius = 3.6 * (1 - f * .82), y0 = 2.2 + f * 15.5, height = 5.4 - f * 1.4;
    const apex = push(0, y0 + height, 0, t === tiers - 1 ? snow : tip);
    const ring = [], cap = [];
    for (let i = 0; i < sides; i++) {
      const a = (i + t * .5) / sides * Math.PI * 2, jag = 1 + .18 * Math.sin(i * 2.7 + t * 1.9);
      ring.push(push(Math.cos(a) * radius * jag, y0 - .35 * jag, Math.sin(a) * radius * jag, needle));
    }
    // Snow settles on the upper half of each tier's boughs.
    for (let i = 0; i < sides; i++) {
      const a = (i + t * .5) / sides * Math.PI * 2;
      cap.push(push(Math.cos(a) * radius * .5, y0 + height * .48, Math.sin(a) * radius * .5, t % 2 ? snow : tip));
    }
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      index.push(ring[i], cap[i], ring[j], ring[j], cap[i], cap[j]);
      index.push(cap[i], apex, cap[j]);
    }
    const under = push(0, y0 + .4, 0, needle);
    for (let i = 0; i < sides; i++) index.push(ring[i], ring[(i + 1) % sides], under);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// Deterministic tree positions in the valley and on the first foothills.
export function placeForest(data) {
  const lift = getLiftLayout();
  const roadCells = new Map();
  for (const road of RESORT.roads) for (const p of road.points) {
    const key = `${Math.floor(p.x / 50)},${Math.floor(p.s / 50)}`;
    if (!roadCells.has(key)) roadCells.set(key, []);
    roadCells.get(key).push({ ...p, clear: road.width / 2 + 9 });
  }
  const nearRoad = (x, s) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
      for (const p of roadCells.get(`${Math.floor(x / 50) + i},${Math.floor(s / 50) + j}`) || [])
        if (Math.hypot(p.x - x, p.s - s) < p.clear) return true;
    return false;
  };
  const buildings = RESORT.towns.flatMap(t => t.buildings);
  const trees = [], step = 13;
  for (let s = -FOREST_GEOMETRY_RADIUS; s <= FOREST_GEOMETRY_RADIUS; s += step)
    for (let x = -FOREST_GEOMETRY_RADIUS; x <= FOREST_GEOMETRY_RADIUS; x += step) {
      const jx = x + (hash(x, s) - .5) * step * .9, js = s + (hash(s, x) - .5) * step * .9;
      const r = Math.hypot(jx, js);
      if (r > FOREST_GEOMETRY_RADIUS || r < 1900 || mountainFraction(jx, js) < 1.045) continue;
      // Cheap heightmap-only screening first; exact apron heights come last.
      const u = gridCoordinate(jx, SIZE, N), v = gridCoordinate(js, SIZE, N);
      const at = (du, dv) => sampleGrid(data.heights, N, u + du, v + dv);
      const h = at(0, 0), slope = Math.hypot(at(.5, 0) - at(-.5, 0), at(0, .5) - at(0, -.5)) / CELL;
      const gully = sampleGrid(data.flow, N, u, v) / 255;
      const cover = forestCover(jx, js, h, 1 - 1 / Math.hypot(slope, 1), gully);
      if (hash(jx * .37, js * .71) > cover * 1.15) continue;
      if (nearRoad(jx, js)) continue;
      if (buildings.some(b => Math.hypot(b.x - jx, b.s - js) < b.radius + 10)) continue;
      if (Math.hypot(lift.bottom.x - jx, lift.bottom.s - js) < 70) continue;
      if (TREES.some(t => Math.hypot(t.x - jx, t.s - js) < 12)) continue;
      trees.push({ x: jx, s: js, y: landscapeHeight(data, jx, js), scale: .55 + Math.pow(hash(jx, js * 1.3), .7) * .95, yaw: hash(js, jx) * 6.28 });
    }
  return trees;
}

// Painted spruce for distant trees: drooping, snow-laden tiers on a dark
// silhouette. Drawn as camera-facing cards, one draw call for the valley.
function impostorTexture() {
  const width = 128, height = 256, canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  let seed = 91;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  ctx.fillStyle = '#2b2119';
  ctx.fillRect(width / 2 - 4, height - 34, 8, 34);
  const tiers = 9;
  for (let t = 0; t < tiers; t++) {
    const f = t / tiers, y = height - 22 - f * (height - 40), half = (1 - f * .88) * width * .47, drop = 26 - f * 12;
    // Needle mass: a jagged, drooping skirt.
    ctx.beginPath();
    ctx.moveTo(width / 2, y - drop * 1.6);
    for (let k = 0; k <= 12; k++) {
      const u = k / 12, x = width / 2 - half + u * half * 2;
      const sag = Math.sin(u * Math.PI) * -4 + (k % 2 ? rand() * 7 : 0);
      ctx.lineTo(x, y + sag);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, y - drop * 1.6, 0, y);
    g.addColorStop(0, '#1d3528');
    g.addColorStop(1, '#0c1812');
    ctx.fillStyle = g;
    ctx.fill();
    // Snow resting on the upper surface of the tier.
    ctx.fillStyle = 'rgba(232,240,248,.92)';
    for (let k = 0; k < 7; k++) {
      const u = .12 + rand() * .76, x = width / 2 - half + u * half * 2;
      const yy = y - drop * (1 - Math.abs(u - .5) * 1.7) * 1.1;
      ctx.beginPath();
      ctx.ellipse(x, yy + 3, 4 + rand() * half * .16, 2 + rand() * 2.5, (u - .5) * .9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Trees swap between full geometry and cards between these distances with a
// complementary screen-space dither, so no tree is ever doubled or missing.
const LOD_NEAR = 520, LOD_FAR = 620;
const DITHER_GLSL = 'float forestDither(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(.06711056, .00583715)))); }';

function createForest(group, data) {
  const trees = placeForest(data);
  const dummy = new THREE.Object3D(), tint = new THREE.Color();
  const tints = trees.map(t => {
    // Mixed spruce and fir: some bluer, some warmer.
    const v = hash(t.s * 1.7, t.x * .3);
    return [.8 + .22 * v, .92 + .26 * hash(t.x * .9, t.s), .78 + .22 * (1 - v)];
  });
  const shapes = trees.map(t => { const slender = .85 + .3 * hash(t.x, t.s); return [t.scale * slender, t.scale * (1.9 - slender)]; });

  // Near: full geometry in 400 m cells, shown only around the camera.
  const geometry = buildForestFir();
  const near = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .92 });
  near.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vTreeFade;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 treeRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vTreeFade = smoothstep(${LOD_NEAR.toFixed(1)}, ${LOD_FAR.toFixed(1)}, distance(treeRoot, cameraPosition));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vTreeFade;\n${DITHER_GLSL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (forestDither(gl_FragCoord.xy) < vTreeFade) discard;');
  };
  near.customProgramCacheKey = () => 'forest-near-v1';
  const cells = new Map(), CELL_SIZE = 400;
  trees.forEach((t, i) => {
    const key = `${Math.floor(t.x / CELL_SIZE)},${Math.floor(t.s / CELL_SIZE)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  });
  const nearCells = [];
  for (const [key, members] of cells) {
    const mesh = new THREE.InstancedMesh(geometry, near, members.length);
    mesh.name = `Valley forest ${key}`;
    members.forEach((i, k) => {
      const t = trees[i];
      dummy.position.set(t.x, t.y - .4, -t.s);
      dummy.rotation.set(0, t.yaw, 0);
      dummy.scale.set(shapes[i][0], shapes[i][1], shapes[i][0]);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      mesh.setColorAt(k, tint.setRGB(...tints[i]));
    });
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.visible = false;
    const [cx, cs] = key.split(',').map(Number);
    nearCells.push({ mesh, minX: cx * CELL_SIZE, minS: cs * CELL_SIZE });
    group.add(mesh);
  }

  // Far: one instanced batch of cards.
  const base = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0);
  const cards = new THREE.InstancedBufferGeometry();
  cards.index = base.index;
  cards.setAttribute('position', base.getAttribute('position'));
  cards.setAttribute('uv', base.getAttribute('uv'));
  const root = new Float32Array(trees.length * 4), color = new Float32Array(trees.length * 4);
  trees.forEach((t, i) => {
    root.set([t.x, t.y - .4, -t.s, shapes[i][0]], i * 4);
    color.set([...tints[i], shapes[i][1]], i * 4);
  });
  cards.setAttribute('root', new THREE.InstancedBufferAttribute(root, 4));
  cards.setAttribute('tint', new THREE.InstancedBufferAttribute(color, 4));
  cards.instanceCount = trees.length;
  const far = new THREE.ShaderMaterial({
    name: 'Forest cards', fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      map: { value: null },
      sunWorld: { value: new THREE.Vector3(...SUN_VECTOR).normalize() },
    }]),
    vertexShader: /* glsl */`
      attribute vec4 root;  // base position, width scale
      attribute vec4 tint;  // colour tint, height scale
      uniform vec3 sunWorld;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vFade;
      varying float vSunSide;
      #include <fog_pars_vertex>
      void main() {
        vec3 toCamera = cameraPosition - root.xyz;
        vFade = smoothstep(${LOD_NEAR.toFixed(1)}, ${LOD_FAR.toFixed(1)}, length(toCamera));
        // Cylindrical billboard: upright, turned toward the camera.
        vec3 side = normalize(cross(vec3(0, 1, 0), toCamera));
        vec3 world = root.xyz + side * position.x * 8.6 * root.w + vec3(0, position.y * 19.2 * tint.w, 0);
        vSunSide = dot(side, sunWorld) * position.x * 2.0;
        vUv = uv;
        vTint = tint.rgb;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map;
      varying vec2 vUv;
      varying vec3 vTint;
      varying float vFade;
      varying float vSunSide;
      ${DITHER_GLSL}
      #include <fog_pars_fragment>
      void main() {
        vec4 texel = texture2D(map, vUv);
        if (texel.a < .45 || forestDither(gl_FragCoord.xy) >= vFade) discard;
        // Sunlit flank and snow crowns, cool sky light elsewhere.
        float light = .55 + .5 * clamp(vSunSide + .25, 0.0, 1.0) + .25 * vUv.y;
        vec3 color = texel.rgb * vTint * light * vec3(1.35, 1.32, 1.28);
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }`,
  });
  far.uniforms.map.value = impostorTexture();
  const farMesh = new THREE.Mesh(cards, far);
  farMesh.name = 'Valley forest / distant trees';
  farMesh.frustumCulled = false;
  group.add(farMesh);
  const update = camera => {
    const x = camera.position.x, s = -camera.position.z;
    for (const cell of nearCells) {
      const dx = Math.max(cell.minX - x, 0, x - cell.minX - CELL_SIZE), ds = Math.max(cell.minS - s, 0, s - cell.minS - CELL_SIZE);
      cell.mesh.visible = Math.hypot(dx, ds, camera.position.y - 60) < LOD_FAR + 40;
    }
  };
  return { count: trees.length, update };
}

export function createLandscape(scene) {
  const group = new THREE.Group();
  group.name = 'Valley and surrounding ranges';
  scene.add(group);
  let ready = Promise.resolve(null), forest = null;
  // Node tests build the world without fetch/DOM: keep it inert there.
  if (typeof document !== 'undefined') {
    ready = Promise.all([loadPNGData('/terrain/ranges-height.png'), loadPNGData('/terrain/ranges-light.png')])
      .then(([height, light]) => {
        const data = decodeLandscape(height, light);
        const textures = buildTextures(data);
        const mesh = new THREE.Mesh(buildGeometry(data), landscapeMaterial(textures));
        mesh.name = 'Eroded ranges and valley floor';
        mesh.receiveShadow = true;
        group.add(mesh);
        const far = new THREE.Mesh(buildFarRing(data), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }));
        far.name = 'Distant ranges beyond the valley';
        group.add(far);
        forest = createForest(group, data);
        group.userData.trees = forest.count;
        group.userData.data = data;
        group.userData.textures = textures;
        return { data, textures };
      })
      .catch(error => { console.warn('Landscape data unavailable', error); return null; });
  }
  return {
    group,
    ready,
    update(state, camera) { if (camera) forest?.update(camera); },
  };
}
