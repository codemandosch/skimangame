// Small GLSL noise library shared by the terrain, landscape and effects shaders.
export const NOISE_GLSL = /* glsl */`
  float nHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 nHash2(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  vec3 nHash3(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
  float vNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3. - 2. * f);
    return mix(mix(nHash(i), nHash(i + vec2(1, 0)), u.x), mix(nHash(i + vec2(0, 1)), nHash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm3(vec2 p) { return .5 * vNoise(p) + .25 * vNoise(p * 2.03 + 7.1) + .125 * vNoise(p * 4.07 - 3.3); }
  float fbm5(vec2 p) {
    float s = 0., a = .5;
    for (int i = 0; i < 5; i++) { s += a * vNoise(p); p = p * 2.03 + vec2(7.1, -3.7); a *= .5; }
    return s;
  }
  // Fade a periodic detail layer once its features get smaller than ~2 px.
  float detailFade(float phase) { return 1. - smoothstep(.35, 1.1, fwidth(phase)); }
`;
