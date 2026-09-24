// Shared layout for the baked scenery around Blackridge. Runtime rendering and
// the offline bake (scripts/bake-landscape.mjs) must agree on these numbers.
export const VALLEY_FLOOR = 52;
export const LANDSCAPE = {
  // Square of eroded ranges centred on the summit, in metres.
  size: 24576,
  resolution: 1024,
  // Blackridge's own terrain tiles stop here and the landscape takes over.
  innerRadius: 2540,
  // The resort's ring road reaches ~2640 m; keep the valley flat beyond it.
  flatRadius: 2780,
  // Meshes stop inside the square so every vertex has height data.
  outerRadius: 12100,
  heightUnit: .1,
};
// Blackridge lighting covers the whole 5.12 km tile square at 5 m per texel.
export const BLACKRIDGE_LIGHT = { size: 5120, resolution: 1024 };
export const TREE_LINE_ALTITUDE = 1250;

// Texel-centre sampling helpers shared by bakes, runtime decoding and tests.
export function gridCoordinate(value, size, resolution) {
  return (value / size + .5) * resolution - .5;
}
export function sampleGrid(data, resolution, u, v) {
  const x = Math.max(0, Math.min(resolution - 1.001, u)), y = Math.max(0, Math.min(resolution - 1.001, v));
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, i = iy * resolution + ix;
  return (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) +
    (data[i + resolution] * (1 - fx) + data[i + resolution + 1] * fx) * fy;
}
