import * as THREE from "three";
import "./style.css";
import { createState, step, respawn } from "./physics.js";
import { keyboardInput, releaseKey } from "./controls.js";
import { prepareRun, prepareParkRun, startRun } from './run-start.js';
import { createWorld } from "./world.js";
import { createRenderPipeline } from "./render-pipeline.js";
import { createSkier } from "./skier.js";
import { createEffects, createAudio } from "./effects.js";
import { createRadio } from "./radio.js";
import { mountainCameraTargets, constrainMountainCamera } from './mountain-camera.js';
import { COURSE, selectCourse, groundHeight } from "./course.js";
import { formatScoringTime } from './scoring-window.js';
import { createLeaderboardFlow } from './leaderboard-client.js';


const $ = (id) => document.getElementById(id);
selectCourse(new URLSearchParams(location.search).get('map'));
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
const bestKey = 'skimangame-best-blackridge-open';
const leaderboardFlow = createLeaderboardFlow();
let finishGeneration = 0;
document.querySelector('.location').textContent = `${COURSE.region} / ${COURSE.name}`;
document.body.classList.toggle('open-mountain', !!COURSE.openWorld);
const state = createState();
prepareRun(state);
const keys = new Set();
let startSpaceHeld = false;
let parkStart = false;
let pendingRailTurn = 0;
let pendingPop = false,
  pendingSkate = false,
  accumulator = 0,
  previousTime = 0,
  lastUi = 0,
  finishShown = false;
let best = 0;
try {
  best =
    Number(
      localStorage.getItem(bestKey),
    ) || 0;
} catch {}
$("best").textContent = best.toLocaleString();
const scene = new THREE.Scene();
// A 0.5 m near plane keeps depth precision for the kilometre-scale scenery.
const camera = new THREE.PerspectiveCamera(
  64,
  innerWidth / innerHeight,
  0.5,
  30000,
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
const pipeline = createRenderPipeline(renderer, scene, camera);
const world = createWorld(scene),
  skier = createSkier(scene),
  effects = createEffects(scene),
  audio = createAudio();
const desiredCamera = new THREE.Vector3(),
  look = new THREE.Vector3(),
  desiredLook = new THREE.Vector3();
function input() {
  const current=keyboardInput(keys, pendingPop);
  return {...current,skate:current.skate || pendingSkate,railTurn:pendingRailTurn};
}
function reset() {
  finishGeneration += 1;
  leaderboardFlow.reset();
  respawn(state);
  (parkStart ? prepareParkRun : prepareRun)(state);
  startSpaceHeld = false;
  keys.clear();
  pendingPop = false;
  pendingSkate = false;
  pendingRailTurn=0;
  effects.reset();
  accumulator = 0;
  finishShown = false;
  $("finish-panel").classList.add("hidden");
  renderLeaderboard();
  $("pause-panel").classList.add("hidden");
  snapCamera();
  updateUI();
}
function pause(value = !state.paused) {
  if (state.awaitingStart || state.finished) {
    keys.clear();
    pendingPop=false;
    pendingSkate=false;
    return;
  }
  state.paused = value;
  startSpaceHeld = false;
  keys.clear();
  pendingPop = false;
  pendingSkate = false;
  pendingRailTurn=0;
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
function startOrResume() {
  if (state.awaitingStart) {
    keys.clear();
    pendingPop = false;
    startRun(state);
    accumulator = 0;
    updateUI();
  } else if (state.paused) {
    pause(false);
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
  "Backspace",
  "ControlLeft",
  "ControlRight",
  "KeyW",
  "KeyQ",
  "KeyE",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyR",
  "KeyF",
]);
window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLElement && e.target.closest('select, input, textarea, #radio-player')) return;
  if (controlled.has(e.code)) e.preventDefault();
  if (e.code === 'Backspace') {
    if (!e.repeat) reset();
    return;
  }
  // Consume the entire start/resume press, including repeat and release.
  if (e.code === 'Space' && startSpaceHeld) return;
  if (e.code === 'Space' && state.paused) {
    if (!e.repeat) {
      startOrResume();
      startSpaceHeld = true;
    }
    return;
  }
  if (state.awaitingStart) {
    // Keep a quick Ctrl tap until the next simulation tick consumes the push.
    if (e.code==='ControlLeft' || e.code==='ControlRight') pendingSkate=true;
    if (['ArrowLeft','ArrowRight','KeyJ','KeyL','ControlLeft','ControlRight'].includes(e.code)) keys.add(e.code);
    return;
  }
  if (!e.repeat) {
    if(state.railing && !state.paused && !state.finished) {
      if(e.code==='ArrowLeft' || e.code==='KeyJ')pendingRailTurn=-1;
      if(e.code==='ArrowRight' || e.code==='KeyL')pendingRailTurn=1;
    }
    if (e.code === "Escape" || e.code === "KeyP") pause();
    if (e.code === "KeyM") toggleSound();
  }
  if (!state.paused && !state.finished) keys.add(e.code);
});
window.addEventListener("keyup", (e) => {
  if (e.code === 'Space' && startSpaceHeld) {
    startSpaceHeld = false;
    keys.delete('Space');
    return;
  }
  if (e.target instanceof HTMLElement && e.target.closest('select, input, textarea, #radio-player')) {
    keys.delete(e.code);
    return;
  }
  if (releaseKey(keys, e.code) && !state.awaitingStart && !state.paused && !state.finished && !state.airborne)
    pendingPop = true;
});
window.addEventListener("blur", () => pause(true));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause(true);
});
$("pause").onclick = () => pause();
$("resume").onclick = () => pause(false);
$("pause-restart").onclick = () => { parkStart = false; reset(); };
document.querySelectorAll('[data-park-start]').forEach(button => {
  button.onclick = () => { parkStart = true; reset(); startOrResume(); button.blur(); };
});
$("again").onclick = reset;
$("leaderboard-form").addEventListener('submit', async event => {
  event.preventDefault();
  const save = leaderboardFlow.save($("leaderboard-username").value);
  renderLeaderboard();
  try { await save; } catch {}
  renderLeaderboard();
});
$("leaderboard-skip").onclick = () => {
  leaderboardFlow.skip();
  renderLeaderboard();
  $("again").focus();
};
$("sound").onclick = toggleSound;
document.addEventListener('click', (event) => {
  if (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, label, [role="button"], #radio-player, #loading')) return;
  if (state.paused) startOrResume();
});
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipeline.setSize(innerWidth, innerHeight);
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

function renderLeaderboard() {
  const flow = leaderboardFlow.state;
  const formVisible = flow.phase === 'qualifying' || flow.phase === 'saving';
  $("leaderboard-form").classList.toggle('hidden', !formVisible);
  $("leaderboard-save").disabled = flow.phase === 'saving';
  $("leaderboard-save").textContent = flow.phase === 'saving' ? 'SAVING…' : 'SAVE SCORE';
  $("leaderboard-error").textContent = flow.error;
  $("leaderboard-status").textContent = ({
    idle: '', loading: 'CHECKING THE MOUNTAIN…', qualifying: 'TOP-TEN RUN',
    saving: 'SAVING…', leaderboard: '', unavailable: 'UNAVAILABLE',
  })[flow.phase] ?? '';
  const list = $("leaderboard-list");
  list.replaceChildren();
  flow.entries.forEach(entry => {
    const item = document.createElement('li');
    const isCurrent = flow.rank === entry.rank && flow.username.localeCompare(entry.username, undefined, { sensitivity: 'base' }) === 0;
    if (isCurrent) item.className = 'current';
    const rank = document.createElement('span');
    rank.textContent = String(entry.rank).padStart(2, '0');
    const name = document.createElement('b');
    name.textContent = entry.username;
    const score = document.createElement('strong');
    score.textContent = entry.score.toLocaleString();
    item.append(rank, name);
    if (isCurrent) {
      const marker = document.createElement('em');
      marker.textContent = 'YOU';
      item.append(marker);
    }
    item.append(score);
    list.append(item);
  });
}

async function showFinish() {
  const generation = ++finishGeneration;
  best = Math.max(best, state.score);
  try { localStorage.setItem(bestKey, String(best)); } catch {}
  $("best").textContent = best.toLocaleString();
  $("final-score").textContent = state.score.toLocaleString();
  $("final-detail").textContent = `${state.jumps} jumps hit · ${timeString(state.time)} · Best ${best.toLocaleString()}`;
  $("finish-panel").classList.remove("hidden");
  renderLeaderboard();
  await leaderboardFlow.evaluate(state.score);
  if (generation !== finishGeneration) return;
  renderLeaderboard();
  if (leaderboardFlow.state.phase === 'qualifying') $("leaderboard-username").focus();
  else $("again").focus();
}

function updateUI() {
  $('start-panel').classList.toggle('hidden', !state.awaitingStart);
  $('keyboard-guide').classList.toggle('hidden', !state.awaitingStart);
  $('hud').classList.toggle('awaiting-start', !!state.awaitingStart);
  $("stance").classList.toggle("hidden", !state.switch);
  $("score").textContent = String(state.score).padStart(6, "0");
  $("score").classList.toggle('locked', state.scoreLocked);
  $("score-timer").textContent = formatScoringTime(state.scoringTimeRemaining);
  $("score-lock-status").classList.toggle('hidden', !state.scoreLocked);
  $("charge-wrap").style.opacity = state.charge > 0 ? 1 : 0;
  $("charge-fill").style.width = `${state.charge * 100}%`;
  const showAir = state.airborne && (state.airtime > 0.18 || state.combo > 0);
  const showMessage = state.messageTimer > 0 && state.time > 4;
  $("trick-display").classList.toggle("hidden", !state.railing && !showAir && !showMessage);
  $("trick-display").classList.toggle("bail", state.bailTimer > 0);
  if(state.railing) {
    const log=state.rail.kind==='log';
    $('trick-kicker').textContent=log?'FALLEN TIMBER':'SUMMIT EXPRESS';
    $('trick-title').textContent=state.scoreLocked ? 'SCORE LOCKED' : state.combo ? `${state.combo.toLocaleString()} · ×${state.comboMultiplier}` : log?'LOG SLIDE':'CABLE SLIDE';
    $('trick-detail').textContent=`${state.combo ? state.comboName + ' · ' : ''}${Math.round(state.rail.distance)} m · SPACE: POP · ← / →: 180${log?'':' · CLEAR THE TOWERS'}`;
  } else if (showAir) {
    $("trick-kicker").textContent = "MAKE IT COUNT";
    $("trick-title").textContent = state.scoreLocked ? 'SCORE LOCKED' : state.combo
      ? `${state.combo.toLocaleString()} · ×${state.comboMultiplier}`
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
  if (state.finished && !finishShown) {
    finishShown = true;
    void showFinish();
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
      pendingSkate = false;
      pendingRailTurn=0;
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
  world.update(state, camera, dt);
  pipeline.setSun(...world.sunFlare(camera));
  effects.update(state, dt);
  audio.update(state);
  if (time - lastUi > 50) {
    updateUI();
    lastUi = time;
  }
  pipeline.render(dt);
  requestAnimationFrame(frame);
}
snapCamera();
updateUI();
world.update(state, camera, 0);
// Reveal the mountain once its scenery and shaders are ready, so the ranges
// and forests never pop in behind the menu. A slow network still gets in.
Promise.race([
  world.ready.then(() => renderer.compileAsync(scene, camera)),
  new Promise(resolve => setTimeout(resolve, 9000)),
]).catch(() => {}).finally(() => {
  world.update(state, camera, 0);
  pipeline.render(0);
  $("loading").classList.add("leaving");
  setTimeout(() => $("loading").classList.add("hidden"), 750);
});
requestAnimationFrame(frame);
