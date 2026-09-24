import * as THREE from 'three';
import { SUN_VECTOR } from './sun.js';
import { AERIAL_PERSPECTIVE_GLSL, HAZE } from './atmosphere.js';

// The sun disk, directional light, baked terrain shadows and haze glow all
// share one world-space heading.
export const SUN_DIRECTION = new THREE.Vector3(...SUN_VECTOR).normalize();
export const SUN_COLOR = new THREE.Color().setRGB(1.0, .9, .78);
export const SUN_INTENSITY = 4.2;

const SKY_GLSL = /* glsl */`
  uniform vec3 sunDirection;
  uniform vec3 hazeColor;
  uniform float hazeDensity;
  uniform float time;
  uniform float showSun;
  uniform float groundBounce;
  ${AERIAL_PERSPECTIVE_GLSL}
  float hashSky(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float noiseSky(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(hashSky(i), hashSky(i + vec2(1, 0)), f.x), mix(hashSky(i + vec2(0, 1)), hashSky(i + vec2(1, 1)), f.x), f.y);
  }
  float fbmSky(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 6; i++){ s += a * noiseSky(p); p = p * 2.03 + 17.1; a *= .5; } return s; }
  vec3 skyRadiance(vec3 d, vec3 eye){
    float h = max(d.y, 0.0);
    // Deep alpine blue overhead, pale and luminous toward the horizon.
    vec3 zenith = vec3(.030, .105, .36);
    vec3 horizon = vec3(.42, .58, .86);
    vec3 sky = mix(horizon, zenith, pow(h, .48));
    float mu = dot(d, sunDirection);
    float sunward = max(mu, 0.0);
    // Mie forward scattering: a soft warm aureole and a brighter core.
    sky += vec3(1.0, .80, .58) * (.10 * pow(sunward, 3.0) + .45 * pow(sunward, 42.0) + 2.2 * pow(sunward, 700.0));
    // Opposite the sun the sky deepens slightly (Rayleigh anisotropy).
    sky *= 1.0 - .12 * pow(max(-mu, 0.0), 2.0) * (1.0 - h);

    // High cirrus and scattered altocumulus on a curved 7 km cloud deck.
    if (d.y > .015) {
      float dist = (7000.0 - eye.y) / (d.y + .06);
      vec2 p = (eye.xz + d.xz * dist) * .00011 + vec2(time * .0009, time * .0004);
      float cirrus = fbmSky(p * vec2(1.0, 4.2) + fbmSky(p * 2.1) * 1.4);
      cirrus = smoothstep(.52, .86, cirrus) * .75;
      float puffs = fbmSky(p * 3.4 + 5.2);
      puffs = smoothstep(.62, .80, puffs) * smoothstep(.35, .7, fbmSky(p * .7 - 3.1));
      float cover = clamp(cirrus + puffs, 0.0, 1.0) * smoothstep(.015, .16, d.y);
      float lit = .85 + .6 * pow(sunward, 5.0) + 1.4 * pow(sunward, 40.0);
      vec3 cloud = vec3(.92, .95, 1.0) * lit * mix(1.0, .78, puffs) + vec3(.06, .08, .12);
      sky = mix(sky, cloud, cover * .85);
    }
    if (d.y < 0.0) {
      // Below the horizon: sunlit snowfields bounce bright, cool light.
      vec3 ground = vec3(.8, .84, .9) * groundBounce;
      sky = mix(sky, ground, smoothstep(0.0, -.08, d.y));
    }
    // Ambient light is less saturated than the sky looks: multiple
    // scattering between snow and air greys it a little.
    sky = mix(sky, vec3(dot(sky, vec3(.2126, .7152, .0722))), .28 * groundBounce);
    // The same haze integral as the terrain, extended to infinity.
    float optical = d.y > 0.0 ? hazeDensity * exp(-max(eye.y - AP_FLOOR, 0.0) * AP_FALLOFF) / (AP_FALLOFF * max(d.y, .012)) : 12.0;
    sky = apApply(sky, d, min(optical, 12.0) * mix(1.0, .6, groundBounce), hazeColor);
    // Sun disc with gentle limb darkening; HDR so bloom picks it up.
    float disc = smoothstep(.99994, .99997, mu);
    sky += showSun * disc * vec3(1.0, .93, .82) * 90.0 * (.75 + .25 * smoothstep(.99994, 1.0, mu));
    return sky;
  }
`;

function skyMaterial({ environment = false } = {}) {
  return new THREE.ShaderMaterial({
    name: environment ? 'Sky environment' : 'Alpine sky',
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      sunDirection: { value: SUN_DIRECTION },
      hazeColor: { value: HAZE.color },
      hazeDensity: { value: HAZE.density },
      time: { value: 0 },
      showSun: { value: environment ? 0 : 1 },
      groundBounce: { value: environment ? 1 : 0 },
      eyeOverride: { value: new THREE.Vector3(0, 1400, 0) },
      useEyeOverride: { value: environment ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vRay;
      void main(){
        vRay = (modelMatrix * vec4(position, 1.0)).xyz - (modelMatrix * vec4(0, 0, 0, 1)).xyz;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // Always at the far plane.
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vRay;
      uniform vec3 eyeOverride;
      uniform float useEyeOverride;
      ${SKY_GLSL}
      void main(){
        vec3 eye = mix(cameraPosition, eyeOverride, useEyeOverride);
        gl_FragColor = vec4(skyRadiance(normalize(vRay), eye), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function createAlpineSky(scene) {
  const material = skyMaterial();
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), material);
  dome.name = 'Alpine sky / high cloud and sun';
  dome.frustumCulled = false;
  // Drawn after opaque scenery so early depth rejection skips hidden sky.
  dome.renderOrder = 1e6;
  dome.scale.setScalar(20000);
  scene.add(dome);
  return {
    material,
    update(state, camera) {
      dome.position.copy(camera?.position ?? new THREE.Vector3(state.x, state.y, -state.s));
      material.uniforms.time.value = state.time || 0;
    },
  };
}

// Pre-filtered sky lighting for every PBR material: blue sky overhead,
// warm around the sun and bright snow bounce from below.
export function createSkyEnvironment(renderer) {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), skyMaterial({ environment: true })));
  const generator = new THREE.PMREMGenerator(renderer);
  const target = generator.fromScene(scene, 0, .1, 1000);
  generator.dispose();
  scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
  return target.texture;
}
