import * as THREE from 'three';
import { groundHeight } from './course.js';

// A terrain-following impact impression: shaded packed snow inside a raised,
// broken powder rim. It never changes the collision surface.
export function createLandingCrater(impact, material) {
  const positions = [], colors = [], indices = [], steps = 64;
  const width = .7 + impact.strength * .85;
  const length = 1.55 + impact.strength * 1.15;
  const rings = [
    [0, .028, [.39, .53, .64, .8]],
    [.53, .03, [.49, .63, .73, .74]],
    [.76, .045, [.64, .75, .83, .85]],
    [.9, .1 + impact.strength * .17, [.96, .98, 1, .98]],
    [1.03, .055 + impact.strength * .065, [.88, .94, 1, .8]],
    [1.23, .018, [.94, .97, 1, 0]],
  ];
  const rightX = Math.cos(impact.heading), rightS = Math.sin(impact.heading);
  for (const [radius, height, color] of rings) for (let i = 0; i <= steps; i++) {
    const angle = i / steps * Math.PI * 2;
    const roughness = 1 + .045 * Math.sin(angle * 7) + .025 * Math.cos(angle * 13);
    const across = Math.cos(angle) * width * radius * roughness;
    const forward = Math.sin(angle) * length * radius * roughness;
    const x = impact.x + rightX * across - rightS * forward;
    const s = impact.s + rightS * across + rightX * forward;
    // Flatten the exit lip where the skis plough out of the landing pocket.
    const exit = 1 - Math.max(0, Math.sin(angle)) ** 8 * .75;
    positions.push(x, groundHeight(x, s) + .018 + (height - .018) * exit, -s);
    colors.push(...color);
  }
  for (let ring = 0; ring < rings.length - 1; ring++) for (let i = 0; i < steps; i++) {
    const a = ring * (steps + 1) + i, b = a + steps + 1;
    indices.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  // Bowl-shaped normals let the packed pocket and rim catch the light.
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Landing crater / packed bowl and displaced powder rim';
  return mesh;
}
