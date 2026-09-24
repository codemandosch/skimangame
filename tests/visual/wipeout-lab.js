import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { groundHeight } from '../../src/course.js';
import { createState, resolveLanding } from '../../src/physics.js';
import { createSkier } from '../../src/skier.js';

const scene = new THREE.Scene();
const X = 100, S = 300;
scene.background = new THREE.Color('#bbd2e3');
scene.add(new THREE.HemisphereLight('#e5f3ff', '#6c8292', 2));
const sun = new THREE.DirectionalLight('#fff6e9', 2.5);
sun.position.set(-20, 40, 20); scene.add(sun);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, .1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const terrain = new THREE.PlaneGeometry(80, 80, 160, 160);
terrain.rotateX(-Math.PI / 2); terrain.translate(X, 0, -S);
const p = terrain.attributes.position;
for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(p.getX(i), -p.getZ(i)));
terrain.computeVertexNormals();
scene.add(new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ color: '#eff6fc', roughness: .9 })));
const rider = createSkier(scene);
const controls = new OrbitControls(camera, renderer.domElement);
const params = new URLSearchParams(location.search);
let crash = params.get('crash') || 'back';
// Aerial attitude at impact as [pitch (+ = backflip), roll (+ = left), yaw].
const attitudes = {
  back: [1.4, 0, 0], front: [-2.1, 0, 0], left: [0, 1.4, 0], right: [0, -1.4, 0],
  'head-back': [2.7, 0.2, 0], 'head-front': [-3.1, -0.2, 0], 'head-side': [0.2, 2.6, 0],
  sideways: [1.3, 0, Math.PI / 2],
};
const age = document.querySelector('#age');
let state, playing = false;
const fall = (() => {
  const gx = (groundHeight(X + 1, S) - groundHeight(X - 1, S)) / 2, gs = (groundHeight(X, S + 1) - groundHeight(X, S - 1)) / 2;
  return Math.atan2(gx, -gs);
})();
function start() {
  state = createState();
  const [pitch, roll, yaw] = attitudes[crash];
  Object.assign(state, { x: X, s: S, y: groundHeight(X, S), time: 10, started: true, heading: fall,
    airborne: true, airtime: 2, flightSettle: 2, speed: 14, vs: 14, vy: -12 });
  state.airRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, -yaw, roll, 'YXZ'));
  resolveLanding(state);
}
function advance(dt) {
  state.time += dt; state.bailTimer = Math.max(0, state.bailTimer - dt);
  state.speed *= Math.exp(-1.2 * dt);
  state.x -= Math.sin(fall) * state.speed * dt; state.s += Math.cos(fall) * state.speed * dt;
  state.y = groundHeight(state.x, state.s);
  rider.update(state, dt);
}
function show() {
  playing = false; start();
  const steps = Math.round(Number(age.value) * 120);
  for (let i = 0; i < steps; i++) advance(1 / 120);
}
let view = params.get('view') || 'side';
function frameCamera() {
  // Side: profile across the fall line. Front: downhill, looking back up at the rider.
  const [dx, ds] = view === 'front' ? [-Math.sin(fall), Math.cos(fall)] : [Math.cos(fall), Math.sin(fall)];
  const y = groundHeight(state.x + dx * 7, state.s + ds * 7);
  camera.position.set(state.x + dx * 7, Math.max(y, state.y) + 1.4, -state.s - ds * 7);
  controls.target.set(state.x, state.y + .5, -state.s); controls.update();
}
for (const b of document.querySelectorAll('[data-crash]')) b.onclick = () => {
  crash = b.dataset.crash; history.replaceState(null, '', `?crash=${crash}`); show(); frameCamera();
};
age.oninput = show;
document.querySelector('#replay').onclick = () => { start(); age.value = 0; playing = true; };
await Promise.all([rider.ready, rider.skiReady]); show(); frameCamera();
window.lab = { view: v => { view = v; frameCamera(); }, get state() { return state; }, set: t => { age.value = t; show(); frameCamera(); }, pick: c => { crash = c; show(); frameCamera(); } };
let previous = performance.now();
function frame(now) {
  const dt = Math.min((now - previous) / 1000, .033); previous = now;
  if (playing) { advance(dt); age.value = state.time - 10; if (state.bailTimer <= 0) playing = false; }
  document.querySelector('#status').textContent = `${state.message} · ${state.crash?.kind ?? '—'} · ${(state.time - 10).toFixed(2)} s`;
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
