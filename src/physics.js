import { stepMountain } from './mountain-physics.js';
import { updateDaffy } from './daffy.js';
import {
  COURSE,
  groundHeight,
  rampAt,
  JUMPS,
  LENGTH,
  WIDTH,
  centerAt,
} from "./course.js";
const TAU = Math.PI * 2;
const FLIP_SPEED = 4.3;
const SPIN_SPEED = 4.7;
const AIR_SPIN_ACCEL = 4.5;
const AIR_FLIP_ACCEL = 3.2;
const ROTATION_RELEASE_DAMPING = 7;
const TAKEOFF_WINDOW = 0.12;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, rate, dt) =>
  v + (target - v) * (1 - Math.exp(-rate * dt));
const angleError = (v, period) => Math.abs(v - Math.round(v / period) * period);

export function createState() {
  return {
    x: 0,
    s: 0,
    y: groundHeight(0, 0),
    speed: COURSE.openWorld ? 0 : COURSE.natural ? 24 : 14,
    vs: 0,
    started: !COURSE.openWorld,
    distance: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    stanceYaw: 0,
    yawOffset: 0,
    switch: false,
    takeoffSwitch: false,
    steer: 0,
    airborne: false,
    charge: 0,
    spin: 0,
    spinVelocity: 0,
    spinSet: false,
    flip: 0,
    flipVelocity: 0,
    flipSet: false,
    spinTravel: 0,
    flipTravel: 0,
    grab: 0,
    grabTime: 0,
    grabs: new Set(),
    daffyProgress: 0,
    daffyExtended: false,
    daffyCompleted: false,
    airtime: 0,
    airHeight: 0,
    score: 0,
    tucking: false,
    braking: false,
    jumps: 0,
    seenJumps: new Set(),
    time: 0,
    paused: false,
    finished: false,
    bailTimer: 0,
    landingPulse: 0,
    message: "FIND YOUR LINE",
    messageDetail: COURSE.openWorld ? "Choose a direction. Press ↑ to push off." : `${JUMPS.length} jumps. Make them count.`,
    messageTimer: 4,
    lastTrick: "",
    lastPoints: 0,
    combo: 0,
    comboName: "",
    event: 0,
    eventType: "",
    maxHeight: 0,
  };
}
export function respawn(s) {
  Object.assign(s, createState());
}
function event(s, type) {
  s.event++;
  s.eventType = type;
}
function launch(s, vy, flipInput = 0, spinInput = 0) {
  s.takeoffSwitch = s.switch;
  s.airborne = true;
  s.tucking = false;
  s.braking = false;
  s.vy = vy;
  s.airtime = 0;
  s.spin = 0;
  // Preserve a carve even when the arrow is released on the pop frame.
  const turn = clamp(spinInput || s.steer, -1, 1);
  s.spinVelocity = turn * SPIN_SPEED;
  s.spinSet = Math.abs(turn) > 0.01;
  s.flip = 0;
  s.flipVelocity = clamp(flipInput, -1, 1) * FLIP_SPEED;
  s.flipSet = flipInput !== 0;
  s.spinTravel = 0;
  s.flipTravel = 0;
  s.grabTime = 0;
  s.grabs.clear();
  s.daffyProgress = 0;
  s.daffyExtended = false;
  s.daffyCompleted = false;
  s.charge = 0;
  s.maxHeight = 0;
  event(s, "takeoff");
}
export function trickValue(s) {
  const halfTurns = Math.floor((s.spinTravel + 0.18) / Math.PI);
  const flips = Math.floor((s.flipTravel + 0.18) / TAU);
  const grabs = s.grabTime > 0.18 ? s.grabs.size : 0;
  const names = [];
  if (flips)
    names.push(
      `${flips > 1 ? flips + "× " : ""}${s.flip < 0 ? "BACKFLIP" : "FRONTFLIP"}`,
    );
  if (halfTurns) names.push(`${halfTurns * 180}`);
  if (s.daffyCompleted) names.push("DAFFY");
  if (grabs)
    names.push(
      s.grabs.size > 1
        ? "GRAB COMBO"
        : s.grabs.has(1)
          ? "MUTE GRAB"
          : s.grabs.has(5) ? "JAPAN GRAB" : s.grabs.has(4) ? "OCTO GRAB" : s.grabs.has(3) ? "BLUNT GRAB" : "TAIL GRAB",
    );
  const base =
    halfTurns * 180 +
    flips * 600 +
    (s.daffyCompleted ? 400 : 0) +
    (grabs ? Math.floor(s.grabTime * 180) + grabs * 120 : 0);
  return {
    points: Math.round(base * (1 + Math.max(0, names.length - 1) * 0.5)),
    name:
      (s.takeoffSwitch ? "SWITCH " : "") +
      (names.join(" + ") || "STRAIGHT AIR"),
  };
}
export function resolveLanding(s) {
  const landingYaw = s.spin + s.yawOffset;
  // Yaw changes the direction of the skis, not their tilt relative to horizontal.
  // Allow any upright landing; vertical or inverted skis cause a wipeout.
  const daffyRecovered = s.daffyProgress === 0;
  const safe = daffyRecovered && angleError(s.flip, TAU) < Math.PI / 2;
  const trick = trickValue(s);
  if (safe) {
    // Transfer completed half-turns into the riding stance before resetting
    // the per-jump rotation. Keep the remaining angle for a smooth touchdown.
    const landedRotation = Math.round(landingYaw / Math.PI) * Math.PI;
    s.stanceYaw += landedRotation;
    s.yawOffset = landingYaw - landedRotation;
    s.switch = Math.abs(Math.round(s.stanceYaw / Math.PI) % 2) === 1;
    const points = trick.points || (s.airtime > 0.7 ? 100 : 0);
    s.score += points;
    s.lastTrick = trick.name;
    s.lastPoints = points;
    if (s.airtime > 0.5) {
      s.message = points ? `+${points.toLocaleString()}` : "CLEAN LANDING";
      s.messageDetail = trick.name;
      s.messageTimer = 2.4;
    }
    s.landingPulse = clamp(s.airtime * 0.12, 0.1, 0.55);
    event(s, "land");
  } else {
    s.stanceYaw = 0;
    s.yawOffset = 0;
    s.switch = false;
    s.bailTimer = 1.65;
    s.speed = s.speed * 0.38;
    s.message = "WIPED OUT";
    s.messageDetail = daffyRecovered
      ? "Land with your skis less than 90° from horizontal"
      : "Release A early enough to recover from the daffy before landing";
    s.messageTimer = 2;
    event(s, "bail");
  }
  s.airborne = false;
  s.spin = 0;
  s.spinVelocity = 0;
  s.spinSet = false;
  s.flip = 0;
  s.flipVelocity = 0;
  s.flipSet = false;
  s.grab = 0;
  s.daffyProgress = 0;
  s.daffyExtended = false;
  s.daffyCompleted = false;
  s.combo = 0;
  s.comboName = "";
  s.vy = 0;
}

function updateAerial(s, input, dt) {
    // Full authority at the lip, then progressively smaller corrections.
    // Neutral input still lets the rider check rotation for the landing.
    const correctionTime = Math.max(0, s.airtime + dt / 2 - TAKEOFF_WINDOW);
    const control = 0.06 + 0.94 * Math.exp(-2.8 * correctionTime);
    // Pitch corrections fade gently and retain 15% authority for landing.
    const flipControl = 0.15 + 0.85 * Math.exp(-1.5 * correctionTime);
    const inTakeoffWindow = s.airtime < TAKEOFF_WINDOW;
    s.airtime += dt;
    const spinInput = clamp(input.spin || 0, -1, 1);
    if (!s.spinSet && inTakeoffWindow && spinInput) {
      s.spinVelocity = spinInput * SPIN_SPEED;
      s.spinSet = true;
    }
    if (spinInput) {
      const acceleration = AIR_SPIN_ACCEL * control * dt;
      s.spinVelocity += clamp(spinInput * SPIN_SPEED - s.spinVelocity, -acceleration, acceleration);
    } else {
      s.spinVelocity *= Math.exp(-ROTATION_RELEASE_DAMPING * dt);
      if (Math.abs(s.spinVelocity) < 0.01) s.spinVelocity = 0;
    }
    s.spin += s.spinVelocity * dt;
    const flipInput = clamp(input.flip || 0, -1, 1);
    const pitchInput = clamp(input.pitch || 0, -1, 1);
    // A small takeoff grace window accommodates a key pressed just after
    // leaving the lip. Once set, even an immediate reversal uses air torque.
    if (!s.flipSet && inTakeoffWindow && flipInput) {
      s.flipVelocity = flipInput * FLIP_SPEED;
      s.flipSet = true;
    }
    if (flipInput || pitchInput) {
      const target = flipInput ? flipInput * FLIP_SPEED : pitchInput * 0.85;
      const acceleration = (flipInput ? AIR_FLIP_ACCEL : 1.2) * flipControl;
      s.flipVelocity += clamp(target - s.flipVelocity, -acceleration * dt, acceleration * dt);
    } else {
      // Brake angular velocity, never seek an angle or a level orientation.
      s.flipVelocity *= Math.exp(-ROTATION_RELEASE_DAMPING * dt);
      if (Math.abs(s.flipVelocity) < 0.01) s.flipVelocity = 0;
    }
    s.flip += s.flipVelocity * dt;
    // Score rotations the player actually performed, without auto-completion.
    // Maximum excursion prevents oscillating left/right from farming rotations.
    s.spinTravel = Math.max(s.spinTravel, Math.abs(s.spin));
    s.flipTravel = Math.max(s.flipTravel, Math.abs(s.flip));
    const wasInDaffy = s.daffyProgress > 0;
    updateDaffy(s, !!input.daffy, dt);
    s.grab = input.daffy || wasInDaffy ? 0 : input.grab || 0;
    if (s.grab) {
      s.grabTime += dt;
      s.grabs.add(s.grab);
    }
      s.vy -= (COURSE.openWorld ? 22 : 18) * dt;
    s.y += s.vy * dt;
    const trick = trickValue(s);
    s.combo = trick.points;
    s.comboName = trick.name;
}

export function step(s, input, dt) {
  if (s.paused || s.finished || dt <= 0) return;
  dt = Math.min(dt, 1 / 30);
  s.time += dt;
  if (!s.airborne) s.yawOffset = approach(s.yawOffset, 0, 12, dt);
  s.messageTimer = Math.max(0, s.messageTimer - dt);
  s.landingPulse = approach(s.landingPulse, 0, 9, dt);
  s.bailTimer = Math.max(0, s.bailTimer - dt);
  const disabled = s.bailTimer > 0;
  s.tucking = !!input.tuck && !disabled && !s.airborne;
  s.braking = !!input.brake && !disabled && !s.airborne;
  const steer = disabled ? 0 : input.steer || 0;
  s.steer = approach(s.steer, steer, 9, dt);
  if (COURSE.openWorld) {
    stepMountain(s, input, dt, { launch, resolveLanding, updateAerial, event });
    return;
  }
  if (!s.airborne) {
    // Sample the actual snow surface along the skier's travel direction.
    const dx = -Math.sin(s.heading), ds = Math.cos(s.heading);
    const grade = (groundHeight(s.x - dx * 0.5, s.s - ds * 0.5) -
      groundHeight(s.x + dx * 0.5, s.s + ds * 0.5));
    const downhillPull = 25 * grade / Math.hypot(1, grade);
    const drag = s.tucking ? 0.0045 : 0.0065;
    const accel = downhillPull - s.speed * s.speed * drag -
      (s.braking ? 30 : 0.8) - Math.abs(s.steer) * 2.1;
    s.speed = clamp(s.speed + accel * dt, 0, 56);
    s.vx = approach(s.vx, s.steer * s.speed * 0.56, 6, dt);
    s.heading = approach(s.heading, -Math.atan2(s.vx, s.speed), 8, dt);
    if (input.charge && !disabled) s.charge = clamp(s.charge + dt * 1.25, 0, 1);
    if (input.pop && !disabled) {
      const ramp = rampAt(s.x, s.s);
      const rampKick =
        ramp && s.s <= ramp.lip
          ? ramp.kick *
            clamp((s.s - ramp.lip + ramp.length) / ramp.length, 0, 1)
          : 0;
      launch(s, Math.max(5, rampKick) + s.charge * 3.25, input.flip || 0, input.spin || 0);
    }
  } else {
    s.vx = approach(s.vx, steer * 3, 0.7, dt);
    updateAerial(s, input, dt);
  }
  const prev = s.s;
  s.s += s.speed * dt;
  s.x += s.vx * dt;
  const center = centerAt(s.s),
    limit = WIDTH + 9;
  if (Math.abs(s.x - center) > limit) {
    s.x = center + Math.sign(s.x - center) * limit;
    s.vx *= -0.25;
    s.speed = Math.max(0, s.speed - 15 * dt);
  }
  for (const j of JUMPS) {
    if (COURSE.natural && prev <= j.lip && s.s > j.lip &&
        Math.abs(s.x - j.x) >= j.width - 1 && !s.airborne) {
      // The cliff spans the bowl. Missing the kicker means a free fall,
      // not adhesion to the cliff face and not credit for a jump hit.
      s.y = groundHeight(s.x, j.lip);
      launch(s, 0, input.flip || 0, input.spin || 0);
    }
    if (
      prev <= j.lip &&
      s.s > j.lip &&
      Math.abs(s.x - j.x) < j.width - 1 &&
      !s.seenJumps.has(j.index)
    ) {
      s.seenJumps.add(j.index);
      s.jumps++;
      if (!s.airborne && !disabled) {
        s.y = groundHeight(s.x, j.lip);
        // Riding off the lip is a fall. Only Space release adds upward pop.
        launch(s, 0, input.flip || 0, input.spin || 0);
      }
    }
  }
  const floor = groundHeight(s.x, s.s);
  if (s.airborne) {
    s.airHeight = Math.max(0, s.y - floor);
    s.maxHeight = Math.max(s.maxHeight, s.airHeight);
    if (s.y <= floor && s.airtime > 0.08) {
      s.y = floor;
      resolveLanding(s);
    }
  } else {
    s.y = floor;
    s.airHeight = 0;
  }
  if (s.s >= LENGTH && !s.airborne) {
    s.finished = true;
    s.message = "RUN COMPLETE";
    event(s, "finish");
  }
}
