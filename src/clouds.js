import * as THREE from 'three';
import { NOISE_GLSL } from './shader-noise.js';
import { SUN_VECTOR } from './sun.js';
import { LANDSCAPE } from './landscape-layout.js';

// Shared wind (Three.js x/z): from the west-northwest toward the east-southeast,
// matching the sastrugi carved into Blackridge's snow.
export const WIND = new THREE.Vector2(.8, .6).normalize();
const sun = new THREE.Vector3(...SUN_VECTOR).normalize();

// Procedural billow for camera-facing cloud cards: fbm-eroded edges and a
// density gradient toward the (screen-space) sun for volumetric shading.
const BILLOW_GLSL = /* glsl */`
  ${NOISE_GLSL}
  float billowDensity(vec2 p, float seed) {
    float r = length(p * vec2(1.0, 1.35));
    float n = fbm3(p * 3.6 + seed * 17.0) * .8 + vNoise(p * 11.0 - seed * 9.0) * .2;
    return n - r * 1.45 + .12;
  }
  vec4 billow(vec2 p, float seed, vec2 sunDir, vec3 shadow, vec3 light) {
    float d = billowDensity(p, seed);
    float alpha = smoothstep(.0, .16, d);
    if (alpha < .003) return vec4(0.0);
    float toward = billowDensity(p + sunDir * .06, seed);
    float lit = clamp(.55 + (d - toward) * 5.0 + p.y * .6, 0.0, 1.0);
    // Thin edges scatter light: a silver lining around the billow.
    lit = max(lit, (1.0 - smoothstep(.0, .12, d)) * .9);
    return vec4(mix(shadow, light, lit), alpha);
  }
`;

// A patchy sea of cloud fills the distant valleys; peaks and ridges rise out
// of it. Hundreds of large, flattened, camera-facing billows give the tops a
// lumpy silhouette even at the grazing angles seen from Blackridge's summit.
export function placeCloudBanks(data, heightAt) {
  const banks = [], step = 380;
  let seed = 4242;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const noise = (x, s) => Math.sin(x * .00041 + Math.sin(s * .00033) * 2.1) * Math.cos(s * .00037 - Math.sin(x * .00029) * 1.7);
  for (let s = -LANDSCAPE.outerRadius; s <= LANDSCAPE.outerRadius; s += step)
    for (let x = -LANDSCAPE.outerRadius; x <= LANDSCAPE.outerRadius; x += step) {
      const px = x + (rand() - .5) * step, ps = s + (rand() - .5) * step, r = Math.hypot(px, ps);
      if (r < 4600 || r > LANDSCAPE.outerRadius - 700) continue;
      const top = 1040 + 180 * noise(ps * 1.7, px * 1.3);
      // Only where the valley floor lies well below the cloud tops.
      let floor = 0;
      for (const [dx, ds] of [[0, 0], [260, 0], [-260, 0], [0, 260], [0, -260]]) floor = Math.max(floor, heightAt(px + dx, ps + ds));
      if (floor > top - 260) continue;
      if (noise(px, ps) + (rand() - .5) * .5 < -.05) continue;
      for (let k = 0; k < 3; k++) {
        const bx = px + (rand() - .5) * 260, bs = ps + (rand() - .5) * 260, y = top - k * 70 - rand() * 60;
        const size = 420 + rand() * 380, seed = rand();
        // Each billow's base must clear the ground right beneath it.
        if (heightAt(bx, bs) < y - 150) banks.push({ x: bx, y, z: -bs, size, seed });
      }
    }
  return banks;
}

export function createCloudBanks(scene, banks) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  const data = new Float32Array(banks.length * 4), seeds = new Float32Array(banks.length);
  const attribute = new THREE.InstancedBufferAttribute(data, 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('bank', attribute);
  geometry.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.instanceCount = banks.length;
  const material = new THREE.ShaderMaterial({
    name: 'Cloud sea billows',
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 },
      sunWorld: { value: sun },
    }]),
    vertexShader: /* glsl */`
      attribute vec4 bank; // xyz centre, size
      attribute float seed;
      uniform float time;
      uniform vec3 sunWorld;
      varying vec2 vUv;
      varying float vSeed;
      varying float vSunSide;
      varying vec2 vSunScreen;
      #include <fog_pars_vertex>
      void main() {
        vec3 center = bank.xyz + vec3(sin(time * .02 + seed * 40.0), 0, cos(time * .017 + seed * 30.0)) * 40.0;
        vec4 mvCenter = viewMatrix * vec4(center, 1.0);
        // Wide and low, like a bank of stratocumulus.
        vec4 mvPosition = mvCenter + vec4(position.x * bank.w * 1.5, position.y * bank.w * .62, 0.0, 0.0);
        vec3 toCamera = normalize(cameraPosition - center);
        vSunSide = dot(normalize(sunWorld.xz), -toCamera.xz) * .5 + .5;
        vec3 sunView = mat3(viewMatrix) * sunWorld;
        vSunScreen = normalize(sunView.xy + vec2(0.0, .001));
        vUv = uv;
        vSeed = seed;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying float vSeed;
      varying float vSunSide;
      varying vec2 vSunScreen;
      ${BILLOW_GLSL}
      #include <fog_pars_fragment>
      void main() {
        vec2 c = vUv - .5;
        vec4 cloud = billow(c, vSeed, vSunScreen, vec3(.46, .54, .68), vec3(1.16, 1.14, 1.1) * (.9 + .16 * vSunSide));
        // Flat undersides, as on a stratocumulus deck.
        cloud.a *= smoothstep(-.4, -.08, c.y);
        if (cloud.a < .004) discard;
        gl_FragColor = vec4(cloud.rgb, cloud.a * .95);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Sea of clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  scene.add(mesh);
  let elapsed = 0, sortTimer = 0;
  const order = banks.map((b, i) => i), eye = new THREE.Vector3();
  function sort(camera) {
    // Back-to-front so overlapping billows blend correctly.
    eye.copy(camera.position);
    const distance = banks.map(b => (b.x - eye.x) ** 2 + (b.y - eye.y) ** 2 + (b.z - eye.z) ** 2);
    order.sort((a, b) => distance[b] - distance[a]);
    order.forEach((i, k) => { const b = banks[i]; data.set([b.x, b.y, b.z, b.size], k * 4); seeds[k] = b.seed; });
    attribute.needsUpdate = true;
    geometry.attributes.seed.needsUpdate = true;
  }
  return {
    mesh,
    update(camera, dt) {
      elapsed += dt;
      material.uniforms.time.value = elapsed;
      sortTimer -= dt;
      if (sortTimer <= 0) { sort(camera); sortTimer = .5; }
    },
  };
}

// Wind-blown plumes: banner clouds on the highest peaks and spindrift off
// Blackridge's summit. Camera-facing puffs stream downwind and loop.
export function createPlumes(scene, plumes) {
  const count = plumes.reduce((n, p) => n + p.puffs, 0);
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('uv', base.getAttribute('uv'));
  const origin = new Float32Array(count * 3), params = new Float32Array(count * 4), shape = new Float32Array(count * 4);
  let k = 0, seed = 11;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const p of plumes) for (let i = 0; i < p.puffs; i++, k++) {
    origin.set([p.x, p.y, p.z], k * 3);
    params.set([i / p.puffs + rand() * .03, p.length, p.size, p.opacity], k * 4);
    shape.set([rand() - .5, rand() - .5, rand(), p.rise], k * 4);
  }
  geometry.setAttribute('origin', new THREE.InstancedBufferAttribute(origin, 3));
  geometry.setAttribute('params', new THREE.InstancedBufferAttribute(params, 4));
  geometry.setAttribute('shape', new THREE.InstancedBufferAttribute(shape, 4));
  geometry.instanceCount = count;
  const material = new THREE.ShaderMaterial({
    name: 'Wind plumes',
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      time: { value: 0 },
      wind: { value: new THREE.Vector3(WIND.x, 0, WIND.y) },
      sunWorld: { value: sun },
    }]),
    vertexShader: /* glsl */`
      attribute vec3 origin;
      attribute vec4 params; // phase, length, size, opacity
      attribute vec4 shape;  // lateral, vertical, spin seed, rise
      uniform float time;
      uniform vec3 wind, sunWorld;
      varying vec2 vUv;
      varying float vAlpha;
      varying float vLit;
      varying float vSpin;
      varying vec2 vSunScreen;
      #include <fog_pars_vertex>
      void main() {
        float t = fract(params.x + time / (params.y * .045));
        vec3 sunView = mat3(viewMatrix) * sunWorld;
        vSunScreen = normalize(sunView.xy + vec2(0.0, .001));
        vec3 side = normalize(cross(wind, vec3(0, 1, 0)));
        float spread = .15 + t * .85;
        vec3 center = origin + wind * params.y * t
          + side * shape.x * params.z * 1.6 * spread
          + vec3(0, 1, 0) * (shape.y * params.z * .7 * spread + shape.w * t);
        float size = params.z * (.45 + t * 1.1);
        vec4 mvCenter = viewMatrix * vec4(center, 1.0);
        vec4 mvPosition = mvCenter + vec4(position.xy * size, 0.0, 0.0);
        vAlpha = params.w * smoothstep(0.0, .12, t) * (1.0 - smoothstep(.45, 1.0, t));
        // Puffs nearer the sun side of the plume are brighter.
        vLit = .7 + .3 * dot(normalize(sunWorld), normalize(center - origin + vec3(0, params.z, 0)));
        vSpin = shape.z * 6.2831;
        vUv = uv;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      varying float vAlpha;
      varying float vLit;
      varying float vSpin;
      varying vec2 vSunScreen;
      ${BILLOW_GLSL}
      #include <fog_pars_fragment>
      void main() {
        vec4 cloud = billow(vUv - .5, vSpin, vSunScreen, vec3(.5, .58, .72), vec3(1.25, 1.2, 1.1) * vLit);
        float a = cloud.a * vAlpha;
        if (a < .003) discard;
        gl_FragColor = vec4(cloud.rgb, a);
        #include <fog_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Banner clouds and summit spindrift';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  scene.add(mesh);
  let elapsed = 0;
  return { mesh, update(dt) { elapsed += dt; material.uniforms.time.value = elapsed; } };
}

// The highest summits, well separated, for banner clouds.
export function findPeaks(data, { minHeight = 2900, spacing = 2600, limit = 4 } = {}) {
  const N = LANDSCAPE.resolution, SIZE = LANDSCAPE.size, peaks = [];
  const order = [];
  for (let j = 2; j < N - 2; j += 2) for (let i = 2; i < N - 2; i += 2) {
    const h = data.heights[j * N + i];
    if (h > minHeight) order.push([h, i, j]);
  }
  order.sort((a, b) => b[0] - a[0]);
  for (const [h, i, j] of order) {
    const x = ((i + .5) / N - .5) * SIZE, s = ((j + .5) / N - .5) * SIZE;
    if (Math.hypot(x, s) > LANDSCAPE.outerRadius - 1500) continue;
    if (peaks.some(p => Math.hypot(p.x - x, p.s - s) < spacing)) continue;
    peaks.push({ x, s, h });
    if (peaks.length === limit) break;
  }
  return peaks;
}
