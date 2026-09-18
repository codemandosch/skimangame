import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { groundHeight } from '../../src/course.js';
import { createState, resolveLanding } from '../../src/physics.js';
import { createSkier } from '../../src/skier.js';
import { createEffects } from '../../src/effects.js';
import { landingSink } from '../../src/landing-impact.js';

const scene = new THREE.Scene();
const landingS = 300;
const landingX = 100;
scene.background = new THREE.Color('#bbd2e3');
scene.add(new THREE.HemisphereLight('#e5f3ff', '#6c8292', 2));
const sun = new THREE.DirectionalLight('#fff6e9', 2.5);
sun.position.set(-20, 40, 20); scene.add(sun);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const terrain = new THREE.PlaneGeometry(100, 100, 200, 200);
terrain.rotateX(-Math.PI / 2); terrain.translate(landingX, 0, -landingS);
const p = terrain.attributes.position;
for (let i = 0; i < p.count; i++) p.setY(i, groundHeight(p.getX(i), -p.getZ(i)));
terrain.computeVertexNormals();
scene.add(new THREE.Mesh(terrain, new THREE.MeshStandardMaterial({ color: '#eff6fc', roughness: .9 })));
const rider = createSkier(scene), effects = createEffects(scene);
const controls = new OrbitControls(camera, renderer.domElement);
camera.position.set(landingX + 8, Math.max(groundHeight(landingX, landingS), groundHeight(landingX + 8, landingS + 11)) + 8, -landingS - 11);
controls.target.set(landingX, groundHeight(landingX, landingS + 1.5), -landingS - 1.5); controls.update();
const age = document.querySelector('#age'), jump = document.querySelector('#jump');
let state, playing = false;
function start() {
  effects.reset(); state = createState();
  Object.assign(state, { x: landingX, s: landingS, y: groundHeight(landingX, landingS), time: 10, started: true,
    airborne: true, airtime: Number(jump.value), speed: 16, vs: 16, vy: -30 });
  resolveLanding(state); effects.update(state, .001);
}
function advance(dt) {
  state.time += dt; state.s += state.vs * dt; state.y = groundHeight(state.x, state.s);
  state.landingPulse *= Math.exp(-3.2 * dt);
  rider.update(state, dt); effects.update(state, dt);
}
function show() {
  playing = false; start();
  const steps = Math.round(Number(age.value) * 120);
  for (let i = 0; i < steps; i++) advance(1 / 120);
  rider.update(state, 1 / 120);
}
age.oninput = show; jump.onchange = show;
document.querySelector('#replay').onclick = () => { start(); age.value = 0; playing = true; };
await Promise.all([rider.ready, rider.skiReady]); show();
let previous = performance.now();
function frame(now) {
  const dt = Math.min((now - previous) / 1000, .033); previous = now;
  if (playing) { advance(dt); age.value = state.time - 10; if (state.time >= 11.5) playing = false; }
  document.querySelector('#status').textContent = `${(state.time - 10).toFixed(2)} s · sink ${(landingSink(state) * 100).toFixed(0)} cm · unchanged speed ${(state.speed * 3.6).toFixed(0)} km/h`;
  renderer.render(scene, camera); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
