import * as THREE from "three";
import "./style.css";
import { createState, step, respawn } from "./physics.js";
import { keyboardInput, releaseKey } from "./controls.js";
import { createWorld } from "./world.js";
import { createSkier } from "./skier.js";
import { createEffects, createAudio } from "./effects.js";
import { createRadio } from "./radio.js";
import { mountainCameraTargets, constrainMountainCamera } from './mountain-camera.js';
import { createMountainMap } from './mountain-map.js';
import { areaAt, SUMMIT_HEIGHT, BASE_HEIGHT } from './blackridge.js';
import { JUMPS, LENGTH, COURSE, COURSES, selectCourse, groundHeight, baseHeight } from "./course.js";

selectCourse(new URLSearchParams(location.search).get('map') || 'blackridge');

const $ = (id) => document.getElementById(id);
const radio = createRadio($('radio-audio'), status => {
  const active = status === 'LIVE' || status === 'CONNECTING';
  $('radio-status').textContent = status;
  $('radio-toggle').textContent = active ? '■ STOP' : status === 'UNAVAILABLE' ? '↻ RETRY' : '▶ PLAY';
  $('radio-toggle').setAttribute('aria-pressed', String(active));
  $('radio-toggle').setAttribute('aria-label', active ? 'Stop rock radio' : 'Play rock radio');
});
$('radio-toggle').addEventListener('click', () => radio.toggle());
$('radio-volume').addEventListener('input', event => {
  $('radio-audio').volume = Number(event.target.value) / 100;
});
const bestKey = COURSE.id === 'bluebird' ? 'skimangame-best' : `skimangame-best-${COURSE.id}-open`;
const picker = $('map-select');
for (const map of Object.values(COURSES)) {
  const option = document.createElement('option');
  option.value = map.id;
  option.textContent = map.openWorld ? `${map.name} / OPEN MOUNTAIN` : `${map.name} / ${map.JUMPS.length} JUMPS`;
  picker.append(option);
}
picker.value = COURSE.id;
picker.addEventListener('change', () => {
  const url = new URL(location.href);
  url.searchParams.set('map', picker.value);
  location.assign(url);
});
document.querySelector('.location').textContent = `${COURSE.region} / ${COURSE.name}`;
document.querySelector('.run-info h1').innerHTML = COURSE.natural ? 'THE EDGE.<br /><em>AND BEYOND.</em>' : 'DROP IN.<br /><em>STAND OUT.</em>';
document.querySelector('.run-info p').textContent = COURSE.openWorld ? 'One summit. Every direction. Find your own way down.' : '1,180 m of freedom. Five chances to fly.';
document.querySelector('.run-tag').textContent = COURSE.openWorld ? '← → CHOOSE YOUR FACE · ↑ PUSH OFF' : `${COURSE.style} / ${JUMPS.length} JUMPS`;
document.querySelector('.course-caption').firstElementChild.innerHTML = `SUMMIT <b>${COURSE.summit.toLocaleString()} m</b>`;
document.querySelector('.course-caption').lastElementChild.innerHTML = `BASE <b>${Math.round(COURSE.summit + (COURSE.openWorld ? BASE_HEIGHT-SUMMIT_HEIGHT : baseHeight(LENGTH)-baseHeight(0))).toLocaleString()} m</b>`;
document.body.classList.toggle('open-mountain', !!COURSE.openWorld);
$('mountain-nav').classList.toggle('hidden', !COURSE.openWorld);
const mountainMap = COURSE.openWorld ? createMountainMap($('mountain-map')) : null;
const state = createState();
const keys = new Set();
let pendingPop = false,
  accumulator = 0,
  previousTime = 0,
  lastUi = 0,
  finishShown = false;
let best = 0;
try {
  best =
    Number(
      localStorage.getItem(bestKey) ??
        (COURSE.id === 'bluebird' ? localStorage.getItem("summit-sessions-best") : 0),
    ) || 0;
} catch {}
$("best").textContent = best.toLocaleString();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  64,
  innerWidth / innerHeight,
  0.1,
  10000,
);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas: $("game"),
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  $("loading").innerHTML =
    "<h2>WEBGL IS UNAVAILABLE</h2><p>Enable hardware acceleration in your browser, then reload.</p>";
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
const world = createWorld(scene),
  skier = createSkier(scene),
  effects = createEffects(scene),
  audio = createAudio();
const desiredCamera = new THREE.Vector3(),
  look = new THREE.Vector3(),
  desiredLook = new THREE.Vector3();
const markerEls = JUMPS.map((j) => {
  const el = document.createElement("i");
  el.style.left = `${(j.lip / LENGTH) * 100}%`;
  $("jump-markers").append(el);
  return el;
});

function input() {
  return keyboardInput(keys, pendingPop);
}
function reset() {
  respawn(state);
  keys.clear();
  pendingPop = false;
  effects.reset();
  accumulator = 0;
  finishShown = false;
  $("finish-panel").classList.add("hidden");
  $("pause-panel").classList.add("hidden");
  document.querySelector(".run-info").classList.remove("riding");
  snapCamera();
  updateUI();
}
function pause(value = !state.paused) {
  if (state.finished) return;
  state.paused = value;
  keys.clear();
  pendingPop = false;
  accumulator = 0;
  $("pause-panel").classList.toggle("hidden", !value);
  if (value) $("resume").focus();
  else $("resume").blur();
  updateUI();
}
async function toggleSound() {
  try {
    const enabled = await audio.toggle();
    $("sound-status").textContent = enabled ? "ON" : "OFF";
    $("sound").setAttribute(
      "aria-label",
      enabled ? "Mute sound" : "Enable sound",
    );
  } catch {
    $("sound-status").textContent = "UNAVAILABLE";
  }
}
const controlled = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyI",
  "KeyJ",
  "KeyK",
  "KeyL",
  "Space",
  "KeyW",
  "KeyQ",
  "KeyE",
  "KeyA",
  "KeyS",
  "KeyD",
]);
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLElement && e.target.closest('select, input, textarea, #radio-player')) return;
  if (controlled.has(e.code)) e.preventDefault();
  if (!e.repeat) {
    if (e.code === "Escape" || e.code === "KeyP") pause();
    if (e.code === "KeyR") reset();
    if (e.code === "KeyM") toggleSound();
  }
  if (!state.paused && !state.finished) keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  if (e.target instanceof HTMLElement && e.target.closest('select, input, textarea, #radio-player')) {
    keys.delete(e.code);
    return;
  }
  if (releaseKey(keys, e.code) && !state.paused && !state.finished && !state.airborne)
    pendingPop = true;
});
window.addEventListener("blur", () => pause(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause(true);
});
$("pause").onclick = () => pause();
$("resume").onclick = () => pause(false);
$("restart").onclick = reset;
$("pause-restart").onclick = reset;
$("again").onclick = reset;
$("sound").onclick = toggleSound;
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function cameraTargets() {
  if(COURSE.openWorld) {
    const target=mountainCameraTargets(state);
    desiredCamera.set(target.position.x,target.position.y,target.position.z);
    desiredLook.set(target.look.x,target.look.y,target.look.z);
    return;
  }
  const pullback = Math.max(0, Math.min(2, (state.speed - 30) / 10));
  desiredCamera.set(
    state.x - state.vx * 0.1,
    state.y + (COURSE.natural ? 5.5 : 4) + state.airHeight * 0.025,
    -state.s + (COURSE.natural ? 11.25 : 8) + pullback,
  );
  desiredLook.set(state.x + state.vx * 0.21, state.y + 0.4, -state.s - 14);
  if (COURSE.natural) {
    // Look down into the catch bowl while airborne, keeping the skier in frame.
    desiredLook.y -= Math.min(13, state.airHeight * 0.11 + 3);
    desiredLook.z -= 10;
    desiredCamera.y = Math.max(desiredCamera.y, groundHeight(desiredCamera.x, -desiredCamera.z) + 4);
  }
}
function snapCamera() {
  cameraTargets();
  camera.position.copy(desiredCamera);
  look.copy(desiredLook);
  camera.lookAt(look);
}
function timeString(t) {
  const minutes = Math.floor(t / 60),
    seconds = Math.floor(t % 60),
    hundredths = Math.floor(t * 100) % 100;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

function updateUI() {
  $("stance").classList.toggle("hidden", !state.switch);
  $("speed").textContent = Math.round(state.speed * 3.6);
  $("score").textContent = String(state.score).padStart(6, "0");
  $("timer").textContent = timeString(state.time);
  $("charge-wrap").style.opacity = state.charge > 0 ? 1 : 0;
  $("charge-fill").style.width = `${state.charge * 100}%`;
  const percent = Math.min(100, (state.s / LENGTH) * 100);
  $("course-fill").style.width = `${percent}%`;
  $("course-rider").style.left = `${percent}%`;
  const next = JUMPS.find((j) => j.lip > state.s);
  $("next-jump").textContent = next
    ? `${String(next.index + 1).padStart(2, "0")} / ${next.name}`
    : "BRING IT HOME";
  $("jump-distance").textContent =
    `${Math.max(0, Math.round((next ? next.lip : LENGTH) - state.s))} m`;
  $("jump-count").textContent = `${state.jumps} / ${JUMPS.length} JUMPS`;
  markerEls.forEach((el, i) =>
    el.classList.toggle("passed", state.seenJumps.has(i)),
  );
  if(COURSE.openWorld) {
    const area=areaAt(state.x,state.s);
    $('next-jump').textContent=area.name;
    $('jump-distance').textContent=`${Math.max(0,Math.round(state.y-BASE_HEIGHT))} m ABOVE BASE`;
    $('jump-count').textContent=`${state.jumps} FEATURES HIT`;
    $('mountain-area').textContent=area.name;
    $('mountain-hint').textContent=state.started ? 'BASE IN EVERY DIRECTION' : '← → TURN · ↑ PUSH OFF';
    mountainMap.update(state);
  }
  const showAir = state.airborne && state.airtime > 0.18;
  const showMessage = state.messageTimer > 0 && state.time > 4;
  $("trick-display").classList.toggle("hidden", !showAir && !showMessage);
  $("trick-display").classList.toggle("bail", state.bailTimer > 0);
  if (showAir) {
    $("trick-kicker").textContent = "MAKE IT COUNT";
    $("trick-title").textContent = state.combo
      ? state.combo.toLocaleString()
      : "AIR TIME";
    $("trick-detail").textContent = state.comboName;
  } else if (showMessage) {
    $("trick-kicker").textContent =
      state.bailTimer > 0 ? "SHAKE IT OFF" : "LANDED / BANKED";
    $("trick-title").textContent = state.message;
    $("trick-detail").textContent = state.messageDetail;
  }
  $("air-info").classList.toggle("hidden", !showAir);
  $("air-height").textContent = state.airHeight.toFixed(1);
  $("air-time").textContent = state.airtime.toFixed(1);
  $("speed-lines").style.opacity = Math.max(0, Math.min(0.4, (state.speed - 30) * 0.02));
  if (state.time > 7 && (!COURSE.openWorld || state.started))
    document.querySelector(".run-info").classList.add("riding");
  if (state.finished && !finishShown) {
    finishShown = true;
    best = Math.max(best, state.score);
    try {
      localStorage.setItem(bestKey, String(best));
    } catch {}
    $("best").textContent = best.toLocaleString();
    $("final-score").textContent = state.score.toLocaleString();
    $("final-detail").textContent =
      `${state.jumps} jumps hit · ${timeString(state.time)} · Best ${best.toLocaleString()}`;
    $("finish-panel").classList.remove("hidden");
    $("again").focus();
  }
}

function frame(time) {
  const dt = Math.min((time - previousTime) / 1000 || 0, 0.06);
  previousTime = time;
  if (!state.paused && !state.finished) {
    accumulator += dt;
    while (accumulator >= 1 / 120) {
      step(state, input(), 1 / 120);
      pendingPop = false;
      accumulator -= 1 / 120;
    }
    cameraTargets();
    camera.position.lerp(desiredCamera, 1 - Math.exp(-8 * dt));
    if(COURSE.openWorld) constrainMountainCamera(camera.position,state);
    if (COURSE.natural) {
      camera.position.y = Math.max(camera.position.y, groundHeight(camera.position.x, -camera.position.z) + 4);
    }
    look.lerp(desiredLook, 1 - Math.exp(-10 * dt));
    camera.fov = THREE.MathUtils.lerp(
      camera.fov,
      64 + (state.speed - 14) * 0.21,
      1 - Math.exp(-3 * dt),
    );
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    camera.rotateZ(-state.steer * 0.016);
  }
  skier.update(state, dt);
  world.update(state);
  effects.update(state, dt);
  audio.update(state);
  if (time - lastUi > 50) {
    updateUI();
    lastUi = time;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
snapCamera();
updateUI();
renderer.render(scene, camera);
$("loading").classList.add("hidden");
requestAnimationFrame(frame);
