// One fixed sun drives the sky, real-time light, baked terrain shadows and
// aerial haze. Plain numbers keep this usable by the Node bake scripts.
const degrees = Math.PI / 180;
export const SUN_AZIMUTH = 62 * degrees;   // clockwise from north (+s) toward east (+x)
export const SUN_ELEVATION = 34 * degrees;
// Three.js world direction toward the sun (z = -s).
export const SUN_VECTOR = [
  Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  -Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
];
