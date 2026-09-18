import * as THREE from "three";
import { createSkier } from "../../src/skier.js";
import { createState, step } from "../../src/physics.js";
import { advanceAerialRotation } from "../../src/aerial-rotation.js";
import { updateDaffy } from "../../src/daffy.js";
const scene = new THREE.Scene();
scene.background = new THREE.Color("#344958");
scene.add(new THREE.HemisphereLight("#eef7ff", "#8b9295", 2.2));
const sun = new THREE.DirectionalLight("#fff2d7", 3);
sun.position.set(-3, 185, 3);
scene.add(sun);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const camera = new THREE.PerspectiveCamera(
    35,
    innerWidth / innerHeight,
    0.1,
    1000,
  ),
  target = new THREE.Vector3(0, 181.05, 0);
const params = new URLSearchParams(location.search);
let angle = Number(params.get("angle") ?? 0.8);
let poseName = params.get("pose") || "neutral";
let sequenceTime = -1;
let daffyTime = 0;
let landingTime = 0;
const rotations = {
  'back-left': { spin: -1, flip: -1 },
  'back-right': { spin: 1, flip: -1 },
  'front-left': { spin: -1, flip: 1 },
  'front-right': { spin: 1, flip: 1 },
  'backflip': { flip: -1 },
  'hangout-backflip': { flip: -1 },
  'frontflip': { flip: 1 },
};
let rotationPaused = false;
function remember() {
  history.replaceState(null, "", `?pose=${poseName}&angle=${angle}`);
}
function view() {
  const lift = rotations[poseName] || ["takeoff", "air", "mute", "tail", "blunt", "octo", "japan", "hangout", "bow", "daffy"].includes(poseName) ? 0.35 : 0;
  target.y = 181.05 + lift;
  camera.position.set(Math.sin(angle) * 5.2, 182.4 + lift, Math.cos(angle) * 5.2);
  camera.lookAt(target);
}
view();
const skier = createSkier(scene),
  state = createState();
state.speed = 20;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.MeshStandardMaterial({ color: "#bdcbd1", roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2 - 0.26;
ground.position.y = 179.99;
scene.add(ground);
function selectPose(p) {
    poseName = p;
    daffyTime = 0;
    landingTime = 0;
    state.daffyProgress = 0;
    state.daffyExtended = state.daffyCompleted = false;
    state.grab = p === "bow" ? 7 : p === "mute" ? 1 : p === "tail" ? 2 : p === "blunt" ? 3 : p === "octo" ? 4 : p === "japan" ? 5 : p === "hangout" || p === "hangout-backflip" ? 6 : 0;
    state.steer = p === "left" ? -1 : p === "right" ? 1 : 0;
    state.tucking = p === "tuck";
    state.skating = p === "skate" ? 1 : 0;
    state.skatePhase = 0;
    state.speed = p === "skate" ? 2 : 20;
    state.charge = p === "charge" ? 1 : 0;
    state.landingPulse = p === "landing" ? 0.4 : 0;
    if (p === 'landing-hard') state.landingPulse = .65;
    state.landingSkid = p.startsWith('skid-') ? .9 : 0;
    state.landingSkidDirection = p === 'skid-left' ? -1 : p === 'skid-right' ? 1 : 0;
    state.airRotation = null;
    state.airPitch = state.airYaw = state.airSpin = 0;
    state.spin = state.flip = state.spinTravel = state.flipTravel = 0;
    state.spinVelocity = state.flipVelocity = 0;
    rotationPaused = false;
    if (rotations[p]) {
      const launch = createState();
      step(launch, { ...rotations[p], pop: true }, 1 / 120);
      state.spinVelocity = launch.spinVelocity;
      state.flipVelocity = launch.flipVelocity;
    }
    state.airborne = !!rotations[p] || state.grab > 0 || p === "air" || p === "takeoff" || p === "daffy";
    state.airtime = p === "takeoff" ? 0.08 : state.airborne ? 0.65 : 0;
    state.y = state.airborne ? 180.45 : 180;
    document.getElementById("readout").textContent = p;
    view();
    remember();
}
selectPose(poseName);
for (const b of document.querySelectorAll("[data-pose]"))
  b.onclick = () => { sequenceTime = -1; selectPose(b.dataset.pose); };
document.getElementById("view").onclick = () => {
  angle += Math.PI / 2;
  view();
  remember();
};
for (const b of document.querySelectorAll("[data-angle]"))
  b.onclick = () => { angle = Number(b.dataset.angle); view(); remember(); };
document.getElementById("sequence").onclick = () => { sequenceTime = sequenceTime < 0 ? 0 : -1; };
document.getElementById("rotation-pause").onclick = () => { rotationPaused = !rotationPaused; };
document.getElementById("rotation-phase").oninput = event => {
  if (!rotations[poseName]) return;
  rotationPaused = true;
  state.airRotation = null;
  state.airPitch = state.airYaw = state.airSpin = 0;
  state.spin = state.flip = 0;
  const period = Math.PI * 2 / Math.hypot(state.spinVelocity, state.flipVelocity);
  advanceAerialRotation(state, period * Number(event.target.value));
};
document.getElementById("stance-toggle").onclick = () => {
  state.switch = !state.switch;
  state.stanceYaw = state.switch ? Math.PI : 0;
  document.getElementById("readout").textContent = state.switch
    ? "SWITCH"
    : "FORWARD";
};
let last = performance.now();
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.033);
  last = t;
  state.time += dt;
  if (poseName === "skate") state.skatePhase += dt * Math.PI * 2 * 1.15;
  if (sequenceTime >= 0) {
    const names = ["neutral", "left", "right", "tuck", "charge", "air", "mute", "tail", "blunt", "octo", "japan", "hangout", "bow", "daffy", "landing"];
    sequenceTime = (sequenceTime + dt) % (names.length * 2);
    const next = names[Math.floor(sequenceTime / 2)];
    if (next !== poseName) selectPose(next);
  }
  if (poseName === "daffy") {
    daffyTime = (daffyTime + dt) % 2;
    updateDaffy(state, daffyTime < 1, dt);
  }
  if (poseName === 'landing-replay') {
    landingTime = (landingTime + dt) % 3;
    state.airborne = landingTime < .6;
    state.airtime = 3;
    state.y = state.airborne ? 180.3 : 180;
    const age = Math.max(0, landingTime - .6);
    state.landingPulse = state.airborne ? 0 : .65 * Math.exp(-3.2 * age);
    state.landingSkid = state.airborne ? 0 : .85 * Math.exp(-1.8 * age);
    state.landingSkidDirection = -1;
  }
  if (rotations[poseName] && !rotationPaused) advanceAerialRotation(state, dt);
  skier.update(state, dt);
  document.getElementById("readout").textContent =
    `${poseName.toUpperCase()} · ${state.switch ? "SWITCH" : "FORWARD"} · ${skier.assetStatus || "procedural rider"}`;
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
