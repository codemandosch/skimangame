import * as THREE from 'three';
import { SUN_VECTOR } from './sun.js';

// Diamond dust: a few thousand ice crystals hang in the cold air around the
// camera, drifting with the wind and flashing when they catch the sun.
// Positions wrap inside a box that travels with the camera, so the field is
// endless without per-frame CPU work.
export function createAmbientParticles(scene, { count = 2600, box = 70 } = {}) {
  const geometry = new THREE.BufferGeometry();
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = Math.random();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 },
    center: { value: new THREE.Vector3() },
    box: { value: box },
    sunWorld: { value: new THREE.Vector3(...SUN_VECTOR).normalize() },
    pixelScale: { value: 1 },
  }]);
  const material = new THREE.ShaderMaterial({
    name: 'Diamond dust',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    uniforms,
    vertexShader: /* glsl */`
      attribute vec4 seed;
      uniform float time, box, pixelScale;
      uniform vec3 center, sunWorld;
      varying float vGlint;
      varying float vAlpha;
      #include <fog_pars_vertex>
      void main() {
        vec3 drift = vec3(1.6, -.35 - seed.w * .3, .9) * time;
        drift.x += sin(time * .7 + seed.x * 40.0) * .6;
        drift.z += cos(time * .5 + seed.y * 40.0) * .6;
        vec3 p = seed.xyz * box + drift;
        p = mod(p - center + box * .5, box) + center - box * .5;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        // Plate crystals tumble: each one flashes when its face meets the sun.
        vec3 toCamera = normalize(cameraPosition - p);
        float facing = dot(normalize(sunWorld + toCamera), normalize(vec3(sin(time * (1.0 + seed.x) + seed.y * 30.0), 1.2, cos(time * (.8 + seed.z) + seed.w * 30.0))));
        vGlint = pow(max(facing, 0.0), 60.0);
        float dist = -mvPosition.z;
        vAlpha = smoothstep(1.5, 5.0, dist) * (1.0 - smoothstep(box * .3, box * .5, dist));
        gl_PointSize = pixelScale * (1.2 + vGlint * 5.0) * clamp(18.0 / dist, .35, 2.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      varying float vGlint;
      varying float vAlpha;
      #include <fog_pars_fragment>
      void main() {
        vec2 c = gl_PointCoord - .5;
        float d = length(c);
        float star = exp(-d * d * 30.0) + vGlint * .6 * exp(-abs(c.x * c.y) * 900.0) * (1.0 - smoothstep(.2, .5, d));
        vec3 color = vec3(.8, .88, 1.0) * (.12 + vGlint * 9.0);
        gl_FragColor = vec4(color * star * vAlpha, 1.0);
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = 'Diamond dust / ice crystals';
  points.frustumCulled = false;
  scene.add(points);
  let elapsed = 0;
  return {
    points,
    update(state, camera, dt = 1 / 60) {
      elapsed += Math.min(dt, .1);
      uniforms.time.value = elapsed;
      if (camera) uniforms.center.value.copy(camera.position);
      else uniforms.center.value.set(state.x, state.y, -state.s);
      uniforms.pixelScale.value = typeof devicePixelRatio === 'number' ? Math.min(devicePixelRatio, 2) : 1;
    },
  };
}
