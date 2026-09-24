import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorld } from '../../src/world.js';
import { createSkier } from '../../src/skier.js';
import { createEffects } from '../../src/effects.js';
import { createRenderPipeline } from '../../src/render-pipeline.js';
import { createState, step } from '../../src/physics.js';
import { prepareRun, prepareParkRun, startRun } from '../../src/run-start.js';
import { mountainCameraTargets } from '../../src/mountain-camera.js';
import { selectCourse, groundHeight } from '../../src/course.js';
import { FEATURES } from '../../src/blackridge.js';
import { getLiftLayout } from '../../src/lift-layout.js';

// Art-direction review: the real game renderer from fixed, repeatable views.
selectCourse('blackridge');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .5, 30000);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);
const pipeline = createRenderPipeline(renderer, scene, camera);
const world = createWorld(scene), skier = createSkier(scene), effects = createEffects(scene);
const controls = new OrbitControls(camera, renderer.domElement);
const state = createState();
prepareRun(state);

const rider = (x, s, heading) => Object.assign(state, { x, s, y: groundHeight(x, s), heading, awaitingStart: false, started: true, speed: 16, airborne: false, airHeight: 0 });
const chase = () => {
  const t = mountainCameraTargets(state);
  camera.position.set(t.position.x, t.position.y, t.position.z);
  controls.target.set(t.look.x, t.look.y, t.look.z);
};
const on = (angle, radius) => ({ x: Math.sin(angle * Math.PI / 180) * radius, s: Math.cos(angle * Math.PI / 180) * radius });
const faceHeading = angle => -angle * Math.PI / 180;  // directionAt(heading) points outward
const VIEWS = {
  summit() { prepareRun(state); state.awaitingStart = false; chase(); },
  summitEast() { prepareRun(state); state.heading = faceHeading(90); state.awaitingStart = false; chase(); },
  summitSouthWest() { prepareRun(state); state.heading = faceHeading(225); state.awaitingStart = false; chase(); },
  northFace() { const p = on(8, 700); rider(p.x, p.s, faceHeading(8)); chase(); },
  shadowFace() { const p = on(230, 800); rider(p.x, p.s, faceHeading(230)); chase(); },
  glacier() { const p = on(60, 1150); rider(p.x, p.s, faceHeading(75)); chase(); },
  park() { prepareParkRun(state); state.awaitingStart = false; chase(); },
  kicker() { const f = FEATURES.find(f => f.name === 'THE WALL'); rider(f.x - f.dx * 60, f.s - f.ds * 60, -Math.atan2(f.dx, f.ds)); chase(); },
  lowerForest() { const p = on(300, 1500); rider(p.x, p.s, faceHeading(300)); chase(); },
  base() { const p = on(120, 2250); const y = groundHeight(p.x, p.s); camera.position.set(p.x, y + 6, -p.s); controls.target.set(0, 900, 0); },
  valley() { const p = on(200, 2200); const y = groundHeight(p.x, p.s); camera.position.set(p.x, y + 30, -p.s); controls.target.set(p.x * 3, 900, -p.s * 3); },
  lift() { const l = getLiftLayout(); const t = l.towers[3]; camera.position.set(t.x + 40, t.y + 10, -t.s + 30); controls.target.set(t.x, t.y, -t.s); state.x = t.x; state.s = t.s; state.y = t.y; },
  aerial() { camera.position.set(-5200, 3600, 4800); controls.target.set(0, 700, 0); state.x = 0; state.s = 0; state.y = 1960; },
  aerialSun() { camera.position.set(5200, 3000, -3600); controls.target.set(0, 800, 0); state.x = 0; state.s = 0; state.y = 1960; },
  horizon() { prepareRun(state); state.awaitingStart = false; camera.position.set(0, 1985, 12); controls.target.set(0, 1900, -1000); },
};
const nav = document.querySelector('#views');
for (const name of Object.keys(VIEWS)) {
  const b = document.createElement('button'); b.textContent = name; b.onclick = () => show(name); nav.append(b);
}
const status = document.createElement('p'); status.id = 'status'; nav.append(status);
function show(name) {
  VIEWS[name]();
  controls.update();
  status.textContent = `${name} · drag to orbit`;
  history.replaceState(null, '', `?view=${name}`);
}
// Deterministic gameplay review: step the real simulation, then frame the
// chase camera. lab.ride(4, t => ({ skate: t < 1.5, left: t > 2 })) etc.
function ride(seconds, input = () => ({})) {
  if (state.awaitingStart) startRun(state);
  const dt = 1 / 120;
  for (let t = 0; t < seconds; t += dt) {
    step(state, { ...input(t), railTurn: 0 }, dt);
    if (Math.round(t / dt) % 2 === 0) { effects.update(state, dt * 2); skier.update(state, dt * 2); }
  }
  chase();
  controls.update();
  world.update(state, camera, dt);
  return { x: state.x, s: state.s, y: state.y, speed: state.speed, airborne: state.airborne, finished: state.finished };
}
window.lab = {
  ride,
  reset() { prepareRun(state); effects.reset(); },
  // Full-resolution crop of the current view: lab.crop(x, y, w, h) in CSS px; lab.crop() resets.
  crop(x, y, w, h) { if (x === undefined) camera.clearViewOffset(); else camera.setViewOffset(innerWidth, innerHeight, x, y, w, h); camera.updateProjectionMatrix(); },
  toneMap(name) { pipeline.grade.material.defines.TONE_MAPPER = name; pipeline.grade.material.needsUpdate = true; }, show, camera, controls, state, world, scene, renderer, pipeline, VIEWS };
show(new URLSearchParams(location.search).get('view') || 'summit');
let previous = performance.now(), frames = 0, fpsTime = previous;
function frame(now) {
  const dt = Math.min((now - previous) / 1000, .05); previous = now;
  state.time = (state.time || 0) + dt;
  skier.update(state, dt);
  world.update(state, camera, dt);
  pipeline.setSun(...world.sunFlare(camera));
  pipeline.render(dt);
  frames++;
  if (now - fpsTime > 1000) { window.lab.fps = frames * 1000 / (now - fpsTime); frames = 0; fpsTime = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); pipeline.setSize(innerWidth, innerHeight); });
