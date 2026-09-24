import * as THREE from "three";
import { createSkier } from "../../src/skier.js";
import { createState } from "../../src/physics.js";

// Close views of the skis resting on flat, level snow, lit like the slope.
// ?view=rear|side|front|top|chase  &steer=-1..1  &speed=m/s
const params = new URLSearchParams(location.search);
const views = {
  chase: [0, 2.6, 5.2, 0, 0.7, -1.5],
  rear: [0.9, 0.55, 3.4, 0, 0.12, 0],
  side: [3.6, 0.45, 0.2, 0, 0.1, 0],
  front: [-0.7, 0.5, -3.6, 0, 0.12, 0],
  top: [0.01, 4.2, 0.01, 0, 0, 0],
  // Straight down with the near plane cutting the rider off at the shins.
  feet: [0, 1.3, 0.25, 0, 0, 0],
  above: [0, 3.2, 2.2, 0, 0.3, -0.2],
  boot: [1.1, 0.22, 0.05, 0, 0.14, 0],
  "above-left": [-1.6, 2.8, 1.8, 0, 0.3, -0.2],
};
const [cx, cy, cz, tx, ty, tz] = views[params.get("view")] || views.rear;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#9fb9cc");
scene.add(new THREE.HemisphereLight("#dcecff", "#9aa6ad", 1.6));
const sun = new THREE.DirectionalLight("#fff2d7", 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -3;
sun.shadow.camera.right = sun.shadow.camera.top = 3;
sun.shadow.bias = -0.0004;
scene.add(sun, sun.target);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.append(renderer.domElement);

const skier = createSkier(scene);
const state = createState();
state.x = 0;
state.s = 0;
state.y = 180;
state.speed = Number(params.get("speed") ?? 12);
state.steer = Number(params.get("steer") ?? 0);
state.airborne = false;

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: "#eef3f7", roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, params.get("view") === "feet" ? 1.02 : 0.05, 200);
window.lab = { skier, state, scene, THREE };
let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.033);
  last = t;
  state.time += dt;
  skier.update(state, dt);
  // Snow sits exactly at the physics floor under the rider.
  const { x, z } = skier.root.position;
  ground.position.set(x, state.y, z);
  camera.position.set(x + cx, state.y + cy, z + cz);
  camera.lookAt(x + tx, state.y + ty, z + tz);
  sun.position.set(x - 4, state.y + 6, z + 3);
  sun.target.position.set(x, state.y, z);
  document.getElementById("readout").textContent = skier.assetStatus;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
