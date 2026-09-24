import * as THREE from 'three';
import { SUN_VECTOR } from './sun.js';

// Physically inspired aerial perspective shared by every lit material, the
// sky dome and particles. Haze thickens toward the valley floor, shifts
// distant ridges toward blue and glows warm around the sun. Three's fog
// chunks are replaced once, so FogExp2 supplies the colour and density.
export const HAZE = {
  color: new THREE.Color().setRGB(.50, .66, .88),  // linear in-scatter colour
  sunColor: new THREE.Color().setRGB(1.0, .76, .52),
  density: .92e-4,    // extinction per metre at the valley floor
  falloff: 1 / 2500,  // exponential scale height
  floor: 52,
};
const glsl = n => Number(n).toFixed(7);
const vec3 = v => `vec3(${glsl(v[0])},${glsl(v[1])},${glsl(v[2])})`;
const sun = new THREE.Vector3(...SUN_VECTOR).normalize();

export const AERIAL_PERSPECTIVE_GLSL = /* glsl */`
  const vec3 AP_SUN = ${vec3(sun.toArray())};
  const vec3 AP_SUN_COLOR = ${vec3(HAZE.sunColor.toArray())};
  const float AP_FALLOFF = ${glsl(HAZE.falloff)};
  const float AP_FLOOR = ${glsl(HAZE.floor)};
  // Optical depth of an exponential atmosphere from the eye along dir.
  float apOpticalDepth(vec3 eye, vec3 dir, float dist, float density) {
    float h0 = max(eye.y - AP_FLOOR, -200.0);
    float dy = dir.y * dist * AP_FALLOFF;
    float path = abs(dy) > 1e-4 ? (1.0 - exp(-dy)) / dy : 1.0 - .5 * dy;
    return density * exp(-h0 * AP_FALLOFF) * dist * path;
  }
  vec3 apInscatter(vec3 dir, vec3 haze) {
    float mu = max(dot(dir, AP_SUN), 0.0);
    return haze + AP_SUN_COLOR * (.22 * pow(mu, 5.0) + .55 * pow(mu, 36.0));
  }
  vec3 apApply(vec3 color, vec3 dir, float optical, vec3 haze) {
    // Short wavelengths scatter first: far ridges turn blue before they fade.
    vec3 transmittance = exp(-optical * vec3(.62, .82, 1.18));
    return color * transmittance + apInscatter(dir, haze) * (1.0 - transmittance);
  }
`;

let installed = false;
export function installAerialPerspective() {
  if (installed) return;
  installed = true;
  const chunks = THREE.ShaderChunk;
  chunks.fog_pars_vertex = `#ifdef USE_FOG
    varying vec3 vFogWorld;
  #endif`;
  // World position from the view-space vertex; works for instanced meshes,
  // sprites and points without touching their individual shaders.
  chunks.fog_vertex = `#ifdef USE_FOG
    vFogWorld = cameraPosition + mvPosition.xyz * mat3( viewMatrix );
  #endif`;
  chunks.fog_pars_fragment = `#ifdef USE_FOG
    uniform vec3 fogColor;
    varying vec3 vFogWorld;
    #ifdef FOG_EXP2
      uniform float fogDensity;
    #else
      uniform float fogNear;
      uniform float fogFar;
    #endif
    ${AERIAL_PERSPECTIVE_GLSL}
  #endif`;
  chunks.fog_fragment = `#ifdef USE_FOG
    {
      vec3 apRay = vFogWorld - cameraPosition;
      float apDist = length(apRay);
      vec3 apDir = apRay / max(apDist, 1e-3);
      #ifdef FOG_EXP2
        float apOptical = apOpticalDepth(cameraPosition, apDir, apDist, fogDensity);
      #else
        float apOptical = smoothstep(fogNear, fogFar, apDist) * 4.0;
      #endif
      gl_FragColor.rgb = apApply(gl_FragColor.rgb, apDir, apOptical, fogColor);
    }
  #endif`;
}

export function createHaze() {
  installAerialPerspective();
  return new THREE.FogExp2(HAZE.color.clone(), HAZE.density);
}
