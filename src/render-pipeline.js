import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { createSkyEnvironment } from './alpine-sky.js';

// Final HDR -> display pass: exposure, filmic tone mapping, a gentle alpine
// grade (cool shadows, warm highlights, extra vibrance), vignette and
// blue-noise-free dithering so the sky gradient never bands.
class GradePass extends Pass {
  constructor() {
    super();
    // Swap the curve for comparisons: AgXToneMapping, ACESFilmicToneMapping...
    this.uniforms = {
      tDiffuse: { value: null },
      toneMappingExposure: { value: 1 },
      vignette: { value: .22 },
      resolution: { value: new THREE.Vector2(1, 1) },
      frame: { value: 0 },
      sunScreen: { value: new THREE.Vector3(0, 0, 0) }, // uv position, visibility
    };
    this.material = new THREE.RawShaderMaterial({
      name: 'Alpine grade',
      uniforms: this.uniforms,
      defines: { TONE_MAPPER: 'NeutralToneMapping' },
      vertexShader: /* glsl */`
        precision highp float;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        attribute vec3 position;
        attribute vec2 uv;
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float vignette;
        uniform vec2 resolution;
        uniform float frame;
        uniform vec3 sunScreen;
        varying vec2 vUv;
        // Subtle lens response to the sun: veiling glare, an anamorphic
        // streak and a few tinted ghosts mirrored through the frame centre.
        vec3 lensFlare(vec2 uv) {
          if (sunScreen.z <= 0.0) return vec3(0.0);
          float aspect = resolution.x / resolution.y;
          vec2 sun = sunScreen.xy;
          vec2 d = (uv - sun) * vec2(aspect, 1.0);
          vec3 flare = vec3(1.0, .82, .6) * .5 * exp(-length(d) * 5.5);
          flare += vec3(.7, .8, 1.0) * .35 * exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 2.6);
          vec2 axis = vec2(.5) - sun;
          for (int i = 0; i < 4; i++) {
            float t = float(i) * .55 + .45;
            vec2 ghost = (uv - (sun + axis * t * 2.0)) * vec2(aspect, 1.0);
            float size = .025 + float(i) * .018;
            float ring = smoothstep(size, size * .75, length(ghost));
            vec3 tint = i == 0 ? vec3(.45, .7, 1.0) : i == 1 ? vec3(1.0, .6, .35) : i == 2 ? vec3(.5, 1.0, .7) : vec3(.8, .6, 1.0);
            flare += tint * ring * .05;
          }
          return flare * sunScreen.z;
        }
        #include <tonemapping_pars_fragment>
        #include <colorspace_pars_fragment>
        float luma(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
        void main() {
          vec3 hdr = texture2D(tDiffuse, vUv).rgb + lensFlare(vUv);
          // Split-tone in linear light before the curve: shadows lean blue,
          // highlights lean warm, as in bright snow photography.
          float l = luma(hdr);
          float shadow = 1.0 - smoothstep(.02, .35, l);
          hdr *= mix(vec3(1.0), vec3(.98, .995, 1.02), shadow * .5);
          hdr *= mix(vec3(1.0), vec3(1.03, 1.0, .965), smoothstep(.5, 2.0, l));
          vec3 color = TONE_MAPPER(hdr);
          // Vibrance: lift muted colours more than saturated ones.
          float g = luma(color);
          float sat = max(color.r, max(color.g, color.b)) - min(color.r, min(color.g, color.b));
          color = mix(vec3(g), color, 1.0 + .2 * (1.0 - sat));
          // Soft contrast S-curve around mid grey.
          color = mix(color, color * color * (3.0 - 2.0 * color), .22);
          vec2 q = vUv - .5;
          q.x *= resolution.x / resolution.y;
          color *= 1.0 - vignette * smoothstep(.35, 1.05, length(q));
          vec4 outColor = sRGBTransferOETF(vec4(clamp(color, 0.0, 1.0), 1.0));
          // Triangular dither across 8-bit output steps.
          vec2 p = gl_FragCoord.xy + frame * vec2(5.3, 7.1);
          float n = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453) + fract(sin(dot(p, vec2(39.3468, 11.135))) * 24634.6345) - 1.0;
          outColor.rgb += n / 255.0;
          gl_FragColor = outColor;
        }`,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  setSize(width, height) { this.uniforms.resolution.value.set(width, height); }
  render(renderer, writeBuffer, readBuffer) {
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    this.uniforms.frame.value = (this.uniforms.frame.value + 1) % 64;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() { this.material.dispose(); this.quad.dispose(); }
}

export function configureRenderer(renderer) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Tone mapping happens once, in the grade pass.
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = .85;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
}

export function createRenderPipeline(renderer, scene, camera, { bloom = true } = {}) {
  configureRenderer(renderer);
  scene.environment = createSkyEnvironment(renderer);
  scene.environmentIntensity = 1.0;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: Math.min(4, renderer.capabilities.maxSamples || 0),
  });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  let bloomPass = null;
  if (bloom) {
    // High threshold: only the sun, glints and sunlit cloud rims bloom, not snow.
    bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), .3, .55, 2.6);
    composer.addPass(bloomPass);
  }
  const grade = new GradePass();
  composer.addPass(grade);
  // Size every buffer from CSS pixels and the renderer's pixel ratio.
  const css = renderer.getSize(new THREE.Vector2());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(css.x, css.y);
  return {
    composer,
    grade,
    bloom: bloomPass,
    render(dt) { composer.render(dt); },
    // Screen position (0..1 uv) and visibility of the sun for the lens flare.
    setSun(u, v, visibility) { grade.uniforms.sunScreen.value.set(u, v, visibility); },
    setSize(width, height) {
      renderer.setSize(width, height);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
  };
}
