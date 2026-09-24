import * as THREE from 'three';
import { NOISE_GLSL } from './shader-noise.js';
import { SUN_VECTOR } from './sun.js';
import { BLACKRIDGE_LIGHT, LANDSCAPE } from './landscape-layout.js';

// Blackridge snow. Every heightfield triangle is skiable snow; everything
// here is shading only and never changes the collision surface.
//  - baked sun/sky visibility carries ridge shadows across the whole mountain
//  - real-time shadows add the rider, trees and props on top
//  - flutes (spine walls) streak the steepest faces along the fall line
//  - wind crust, sastrugi, ripples and grain add scale at every distance
//  - sparkle: world-anchored ice facets glint toward the sun
//  - a soft, blue-tinted terminator mimics light scattering in snow
// Until the bake loads: full sun, open sky, flat curvature.
const neutralLight = new THREE.DataTexture(new Uint8Array([255, 255, 128, 255]), 1, 1);
neutralLight.needsUpdate = true;

export function patchDirectionalLight(chunk, before, after) {
  const dirBlock = chunk.indexOf('getDirectionalLightInfo( directionalLight, directLight );');
  const call = chunk.indexOf('RE_Direct(', dirBlock);
  const end = chunk.indexOf(';', call) + 1;
  if (dirBlock < 0 || call < 0) throw new Error('Unexpected lights_fragment_begin chunk');
  return chunk.slice(0, call) + before + chunk.slice(call, end) + after + chunk.slice(end);
}

export function createSnowMaterial({ lightMap = neutralLight } = {}) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .8, vertexColors: true });
  const uniforms = {
    snowLightMap: { value: lightMap },
    snowLightSize: { value: BLACKRIDGE_LIGHT.size },
    clipRadius: { value: LANDSCAPE.innerRadius },
    sunWorld: { value: new THREE.Vector3(...SUN_VECTOR).normalize() },
  };
  material.userData.uniforms = uniforms;
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSnowWorld;
        varying vec3 vSnowNormal;`)
      .replace('#include <fog_vertex>', `#include <fog_vertex>
        vSnowWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vSnowNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSnowWorld;
        varying vec3 vSnowNormal;
        uniform sampler2D snowLightMap;
        uniform float snowLightSize;
        uniform float clipRadius;
        uniform vec3 sunWorld;
        ${NOISE_GLSL}
        float snowSun = 1.0, snowSky = 1.0, snowCurv = 0.0, snowCrust = 0.0, snowSparkle = 0.0, snowOcclusion = 1.0;
        vec3 snowSunLight = vec3(0.0), snowSparkleTint = vec3(1.0);
        // Flutes: ridged noise in polar coordinates around the summit, so the
        // grooves follow the mountain's radial fall lines and fan out downhill.
        float fluteNoise(float angle, float radius) {
          // Meander the grooves and let them start/stop along the fall line.
          vec2 q = vec2(angle * 170.0 + (vNoise(vec2(angle * 22.0, radius * .02)) - .5) * 3.0, radius * .024);
          float a = 1.0 - abs(vNoise(q) * 2.0 - 1.0);
          float b = 1.0 - abs(vNoise(q * vec2(2.2, 1.6) + 9.1) * 2.0 - 1.0);
          float fade = smoothstep(.25, .6, vNoise(q * vec2(.3, .8) + 3.7));
          return (a * a * .6 + b * b * .4) * fade * detailFade(q.x * 2.2);
        }`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        // Beyond this circle the baked landscape continues the valley floor.
        if (dot(vSnowWorld.xz, vSnowWorld.xz) > clipRadius * clipRadius) discard;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 snowXZ = vSnowWorld.xz;
        float snowDistance = length(vViewPosition);
        vec3 baked = texture2D(snowLightMap, vec2(vSnowWorld.x, -vSnowWorld.z) / snowLightSize + .5).rgb;
        // The real-time map (which also sees distant ridges) owns the area
        // around the rider; the baked map covers everything beyond it.
        // Terrain shadow is always the baked map (static, like the sun); the
        // real-time map only adds the rider, trees, logs and lift on top.
        snowSun = baked.r;
        snowSky = mix(.72, 1.0, baked.g);
        snowCurv = baked.b - .5;
        vec3 snowN = normalize(vSnowNormal);
        float steep = 1.0 - snowN.y;
        float macro = fbm3(snowXZ * .0031);
        float patches = fbm3(snowXZ * .021 + 11.0);
        // Wind-packed crust on exposed convex ground; deep powder in hollows.
        snowCrust = smoothstep(.5, .78, patches + max(-snowCurv, 0.0) * 2.4 + steep * .25) * (1.0 - smoothstep(.06, .2, snowCurv));
        vec3 albedo = mix(vec3(.94, .96, .985), vec3(.86, .9, .955), snowCrust * .7);
        albedo *= .955 + .07 * macro;
        albedo *= .975 + .05 * fbm3(snowXZ * .16 - 2.0);
        albedo *= 1.0 + clamp(snowCurv * 1.2, -.035, .03);
        diffuseColor.rgb *= albedo;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(.86, .5, snowCrust) - .06 * patches;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec2 wind = vec2(.8, .6);
          vec2 across = vec2(-wind.y, wind.x);
          float gentle = 1.0 - smoothstep(.18, .42, steep);
          // Sastrugi: long wind-carved ribs, and small ripples over them.
          float sastrugi = fbm3(vec2(dot(snowXZ, wind) * .45, dot(snowXZ, across) * .07));
          float ripplePhase = dot(snowXZ, wind) * 2.6 + fbm3(snowXZ * .14) * 6.0 + fbm3(snowXZ * .6) * 3.0;
          float bump = (sastrugi - .5) * .16 * gentle * (1.0 - smoothstep(80.0, 320.0, snowDistance));
          bump += sin(ripplePhase) * .004 * detailFade(ripplePhase) * gentle * smoothstep(.35, .65, fbm3(snowXZ * .09 - 7.0));
          bump += (vNoise(snowXZ * 7.0) - .5) * .008 * (1.0 - smoothstep(8.0, 30.0, snowDistance));
          // Soft powder lumps and broad undulations read at every distance.
          float lumps = fbm3(snowXZ * .55);
          float swell = fbm3(snowXZ * .07 + 4.0);
          bump += (lumps - .5) * .09 * (1.0 - smoothstep(30.0, 120.0, snowDistance));
          bump += (swell - .5) * .55 * (1.0 - smoothstep(250.0, 900.0, snowDistance));
          // Sky light alone hardly reveals shape, so hollows also hold less of it.
          snowOcclusion = 1.0 - (.5 - lumps) * .16 * (1.0 - smoothstep(20.0, 90.0, snowDistance)) - (.5 - swell) * .1;
          // Flutes on faces steeper than ~40 degrees.
          float radius = length(snowXZ);
          float angle = atan(snowXZ.x, -snowXZ.y);
          float wrapped = angle < 0.0 ? angle + 6.2831853 : angle;
          float flute = mix(fluteNoise(angle, radius), fluteNoise(wrapped, radius), smoothstep(2.7, 3.05, abs(angle)));
          float steepMask = smoothstep(.2, .38, steep) * smoothstep(40.0, 140.0, radius);
          bump += flute * .28 * steepMask;
          snowOcclusion *= 1.0 - (.55 - flute) * .1 * steepMask;
          // Park corduroy: fine grooming lines down the East Face Park Line.
          float park = smoothstep(150.0, 200.0, vSnowWorld.x) * (1.0 - smoothstep(1990.0, 2120.0, vSnowWorld.x))
            * (1.0 - smoothstep(80.0, 120.0, abs(vSnowWorld.z)));
          float cord = vSnowWorld.z * 18.0;
          bump = mix(bump, sin(cord) * .008 * detailFade(cord * 2.0) + bump * .25, park);
          snowCrust *= 1.0 - park * .6;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 rx = cross(sy, normal), ry = cross(normal, sx);
          float determinant = dot(sx, rx) * faceDirection;
          vec3 gradient = sign(determinant) * (dFdx(bump) * rx + dFdy(bump) * ry);
          normal = normalize(abs(determinant) * normal - gradient);
          // Ice-crystal glints: sparse random facets in 6 cm world cells.
          vec3 worldNormal = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          vec3 viewWorld = normalize(cameraPosition - vSnowWorld);
          vec3 cellId = floor(vSnowWorld * 16.0);
          vec3 h = nHash3(cellId);
          vec3 facet = normalize(worldNormal * 1.4 + (h - .5) * 2.0);
          float pixelsPerCell = 1.0 / max(length(fwidth(vSnowWorld * 16.0)), 1e-4);
          float glint = pow(max(dot(facet, normalize(sunWorld + viewWorld)), 0.0), 1400.0);
          // Ice prisms: mostly cold white, some faintly coloured.
          snowSparkleTint = mix(vec3(.88, .95, 1.1), .5 + .5 * cos(6.2831 * (h.z + vec3(0.0, .33, .67))), .18);
          snowSparkle = glint * step(.78, h.y) * 4.5 * smoothstep(.55, 1.4, pixelsPerCell) * (1.0 - smoothstep(25.0, 60.0, snowDistance));
        }`)
      .replace('#include <lights_fragment_begin>', patchDirectionalLight(THREE.ShaderChunk.lights_fragment_begin,
        'directLight.color *= snowSun;\n',
        `\nsnowSunLight = directLight.color;
        {
          // Light diffuses through snow: a soft, cool glow wraps the terminator.
          float snowNdotL = dot(geometryNormal, directLight.direction);
          float wrap = pow(saturate(snowNdotL * .5 + .5), 3.0) * (1.0 - saturate(snowNdotL));
          reflectedLight.directDiffuse += directLight.color * BRDF_Lambert(material.diffuseColor) * vec3(.42, .62, .95) * .55 * wrap;
        }`))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
        float snowCavity = clamp(1.0 - snowCurv * 1.6, .72, 1.08);
        reflectedLight.indirectDiffuse *= snowSky * snowCavity * snowOcclusion;
        // From afar, front-lit snow loses its form: let ridges catch a little
        // more light and hollows hold a little less, as a painter would.
        float relief = 1.0 + clamp(-snowCurv * 2.6, -.2, .16) * smoothstep(250.0, 1400.0, snowDistance);
        reflectedLight.directDiffuse *= mix(1.0, snowOcclusion, .4) * relief;
        reflectedLight.indirectDiffuse *= relief;
        // Sunlit slopes all around bounce light into the shade: without it the
        // lee faces read far darker than snow in shadow really looks.
        reflectedLight.indirectDiffuse += material.diffuseColor * vec3(.36, .39, .44) * snowSky;
        reflectedLight.indirectSpecular *= snowSky;
        reflectedLight.directSpecular += snowSunLight * snowSparkle * snowSparkleTint;`);
  };
  material.customProgramCacheKey = () => 'blackridge-snow-v3';
  return material;
}
