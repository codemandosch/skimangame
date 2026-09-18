const GRAVITY = 30.36;
// A modest extra pull into the snow keeps shallow rollers forgiving.
const ADHESION = 18;
const CONTACT_LENGTH = 2;
const GRIP_SPEED = 26;
// Very steep downhill heightfield faces can contain small triangle-to-triangle
// changes that look like convex takeoff crests. Keep the skis planted there;
// real lips are launched explicitly by mountain-physics and Space still pops.
const STEEP_FACE_GRADE = 1.25;

export function groundContact(x, s, vx, vs, dt, height) {
  const speed = Math.hypot(vx, vs);
  if (speed === 0 || dt <= 0) return { release: false, vy: 0 };
  const dx = vx / speed, ds = vs / speed;
  // Measure over a ski-length footprint, not a frame-length gap. This also
  // filters the tiny slope changes between the terrain mesh's triangles.
  const distance = Math.max(CONTACT_LENGTH, speed * dt);
  const y = height(x, s);
  const behind = height(x - dx * distance, s - ds * distance);
  const ahead = height(x + dx * distance, s + ds * distance);
  const slope = (y - behind) / distance;
  const curvature = (ahead - 2 * y + behind) / (distance * distance);
  const normalScale = Math.hypot(1, slope);
  const requiredPull = -curvature * speed * speed / normalScale;
  // Blend in stronger assistance at low speed, then fade it out smoothly.
  // There is no hard speed cutoff: a sufficiently sharp drop can still release.
  const slowGrip = 8 * Math.max(0, GRIP_SPEED - speed) ** 2;
  const availablePull = GRAVITY / normalScale + ADHESION + slowGrip;
  // Carry the incoming tangent across the crest rather than steering the
  // velocity down the face ahead. Match the existing terrain-launch limits
  // so near-vertical heightfield walls cannot create enormous velocities.
  const vy = Math.max(-speed, Math.min(10, slope * speed));
  const nextFloor = height(x + vx * dt, s + vs * dt);
  const clearance = y + vy * dt - .5 * GRAVITY * dt * dt - nextFloor;
  const steepDownhillFace = slope < -STEEP_FACE_GRADE;
  return { release: !steepDownhillFace && requiredPull > availablePull && clearance > 1e-6, vy };
}
