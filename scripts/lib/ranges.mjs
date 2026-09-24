// Procedural alpine ranges around Blackridge: warped ridged noise for sharp
// aretes, radial drainage valleys, then droplet hydraulic erosion.
import { LANDSCAPE, VALLEY_FLOOR } from '../../src/landscape-layout.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export function createNoise(seed) {
  const perm = new Uint8Array(512), grad = new Float32Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; grad[i] = rand() * Math.PI * 2; }
  // Gradient noise, roughly in [-1, 1].
  function noise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const X = ix & 255, Y = iy & 255;
    const dot = (hx, hy, dx, dy) => { const a = grad[perm[perm[hx] + hy]]; return Math.cos(a) * dx + Math.sin(a) * dy; };
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const a = dot(X, Y, fx, fy), b = dot(X + 1, Y, fx - 1, fy);
    const c = dot(X, Y + 1, fx, fy - 1), d = dot(X + 1, Y + 1, fx - 1, fy - 1);
    return 1.41 * ((a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v);
  }
  function fbm(x, y, octaves = 5, lacunarity = 2.03, gain = .5) {
    let sum = 0, amp = 1, norm = 0;
    for (let o = 0; o < octaves; o++) { sum += noise(x, y) * amp; norm += amp; amp *= gain; x *= lacunarity; y *= lacunarity; }
    return sum / norm;
  }
  // Ridged multifractal: sharp crests whose detail concentrates on the ridges.
  function ridged(x, y, octaves = 7) {
    let sum = 0, amp = .5, weight = 1, freq = 1;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(noise(x * freq + o * 17.1, y * freq - o * 9.7));
      n *= n;
      n *= weight;
      weight = clamp(n * 1.9);
      sum += n * amp;
      freq *= 2.07;
      amp *= .52;
    }
    return sum;
  }
  return { noise, fbm, ridged, rand };
}

// Azimuths in degrees clockwise from north. Major valleys drain outward from
// the resort basin and give long, layered views between the ranges.
const VALLEYS = [
  { azimuth: 62, width: 2600, depth: .78 },   // toward the sun: keeps Blackridge lit
  { azimuth: 148, width: 1700, depth: .62 },
  { azimuth: 231, width: 2000, depth: .68 },
  { azimuth: 322, width: 1500, depth: .55 },
];
// Named massifs: the tallest summits sit behind the starting view (north).
const MASSIFS = [
  { azimuth: 350, distance: 6400, radius: 2900, height: 3650 },
  { azimuth: 20, distance: 8800, radius: 3200, height: 3300 },
  { azimuth: 110, distance: 7600, radius: 2600, height: 2900 },
  { azimuth: 190, distance: 6000, radius: 2800, height: 3450 },
  { azimuth: 268, distance: 7000, radius: 3300, height: 3550 },
  { azimuth: 300, distance: 5200, radius: 1800, height: 2650 },
];

export function baseHeight(noise, x, s) {
  const r = Math.hypot(x, s), azimuth = (Math.atan2(x, s) * 180 / Math.PI + 360) % 360;
  const edge = LANDSCAPE.flatRadius;
  if (r < edge) return VALLEY_FLOOR;
  // Domain warp gives the ranges curving, branching crests instead of rings.
  const wx = x + noise.fbm(x * .00019 + 3.1, s * .00019 - 7.4, 4) * 1700;
  const ws = s + noise.fbm(x * .00019 - 5.2, s * .00019 + 1.3, 4) * 1700;
  const crest = noise.ridged(wx * .00017, ws * .00017, 8);
  const rounded = noise.fbm(x * .00055, s * .00055, 5) * .5 + .5;
  // Forested foothills rise straight out of the valley; the glaciated high
  // ranges start 1-2.5 km further out depending on direction.
  const foothill = smooth(edge - 100, edge + 1100, r);
  const highStart = edge + 350 + 1300 * (noise.fbm(azimuth * .018, 4.2, 3) * .5 + .5);
  const high = smooth(highStart, highStart + 2300, r);
  let massif = 0;
  for (const m of MASSIFS) {
    const a = m.azimuth * Math.PI / 180, mx = Math.sin(a) * m.distance, ms = Math.cos(a) * m.distance;
    const d = Math.hypot(wx - mx, ws - ms) / m.radius;
    massif = Math.max(massif, (m.height - 2300) * Math.exp(-d * d * 1.3));
  }
  const hills = 200 + 700 * rounded * rounded + 520 * crest * crest;
  const alpine = 520 + 1900 * Math.pow(crest, 1.5) + massif * (.35 + .75 * crest) + 180 * rounded;
  let h = VALLEY_FLOOR + foothill * (hills * (1 - high) + alpine * high);
  // Drainage valleys: soft U-shaped troughs whose floors climb outward.
  for (const v of VALLEYS) {
    const angle = Math.abs(((azimuth - v.azimuth + 540) % 360) - 180) * Math.PI / 180;
    const meander = noise.fbm(r * .00035, v.azimuth * .1, 3) * 900;
    const d = Math.abs(angle * r + meander), width = v.width * (1 + r / 7000);
    const cut = v.depth * (1 - smooth(0, 1, d / width)) * smooth(edge, edge + 1200, r);
    const floor = VALLEY_FLOOR + Math.max(0, r - edge) * .045 + 90 * rounded;
    if (h > floor) h = floor + (h - floor) * (1 - cut);
  }
  return h;
}

// Sebastian Lague-style droplet erosion on a heightmap of metres.
export function erode(height, resolution, cellSize, { droplets, seed = 99, protect }) {
  const noise = createNoise(seed), rand = noise.rand;
  const scale = 1 / 1000; // Work in kilometres so gradients stay small.
  const map = Float32Array.from(height, h => h * scale);
  const radius = 4, brush = [];
  let total = 0;
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++) {
    const d = Math.hypot(x, y);
    if (d <= radius) { const w = 1 - d / radius; brush.push([x, y, w]); total += w; }
  }
  for (const b of brush) b[2] /= total;
  const inertia = .06, capacityFactor = 5, minCapacity = .002, erodeSpeed = .32, depositSpeed = .24;
  const evaporate = .012, gravity = 4, lifetime = 48;
  const N = resolution;
  function sample(px, py) {
    const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy, i = iy * N + ix;
    const a = map[i], b = map[i + 1], c = map[i + N], d = map[i + N + 1];
    return {
      h: (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy,
      gx: (b - a) * (1 - fy) + (d - c) * fy,
      gy: (c - a) * (1 - fx) + (d - b) * fx,
    };
  }
  for (let n = 0; n < droplets; n++) {
    let px = 2 + rand() * (N - 5), py = 2 + rand() * (N - 5);
    if (protect?.(px, py)) continue;
    let dx = 0, dy = 0, speed = 1, water = 1, sediment = 0;
    for (let step = 0; step < lifetime; step++) {
      const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
      const here = sample(px, py);
      dx = dx * inertia - here.gx * (1 - inertia);
      dy = dy * inertia - here.gy * (1 - inertia);
      const len = Math.hypot(dx, dy);
      if (len < 1e-9) break;
      dx /= len; dy /= len;
      px += dx; py += dy;
      if (px < 2 || py < 2 || px > N - 3 || py > N - 3) break;
      const dh = sample(px, py).h - here.h;
      const capacity = Math.max(-dh * speed * water * capacityFactor, minCapacity);
      const i = iy * N + ix;
      if (sediment > capacity || dh > 0) {
        const amount = dh > 0 ? Math.min(dh, sediment) : (sediment - capacity) * depositSpeed;
        sediment -= amount;
        map[i] += amount * (1 - fx) * (1 - fy);
        map[i + 1] += amount * fx * (1 - fy);
        map[i + N] += amount * (1 - fx) * fy;
        map[i + N + 1] += amount * fx * fy;
      } else {
        const amount = Math.min((capacity - sediment) * erodeSpeed, -dh);
        for (const [bx, by, w] of brush) {
          const x = ix + bx, y = iy + by;
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          const j = y * N + x, take = Math.min(map[j] - VALLEY_FLOOR * scale, amount * w);
          if (take <= 0) continue;
          map[j] -= take;
          sediment += take;
        }
      }
      speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
      water *= 1 - evaporate;
    }
  }
  return Float32Array.from(map, h => h / scale);
}

// Talus relaxation softens erosion spikes without flattening the aretes.
export function thermal(height, resolution, cellSize, { iterations = 6, talus = 1.25 } = {}) {
  const N = resolution, limit = talus * cellSize;
  for (let it = 0; it < iterations; it++) {
    const delta = new Float32Array(height.length);
    for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
      const i = y * N + x;
      for (const j of [i + 1, i - 1, i + N, i - N]) {
        const d = height[i] - height[j];
        if (d > limit) { const move = (d - limit) * .12; delta[i] -= move; delta[j] += move; }
      }
    }
    for (let i = 0; i < height.length; i++) height[i] += delta[i];
  }
  return height;
}
