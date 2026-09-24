import { stepMountain } from './mountain-physics.js';
import { skatingEffort, applySkating } from './skating.js';
import { updateDaffy } from './daffy.js';
import { advanceAerialRotation, aerialLanding } from './aerial-rotation.js';
import { riderFrame } from './rider-frame.js';
import { beginLandingSkid, advanceLandingSkid } from './landing-skid.js';
import { captureLandingImpact } from './landing-impact.js';
import { createScoringState, advanceScoringWindow, bankScore } from './scoring-window.js';
import { catchCable, stepCable } from './cable-physics.js';
import { catchLog, stepLog } from './log-physics.js';
import {
  COURSE,
  groundHeight,
  JUMPS,
  LENGTH,
  WIDTH,
  centerAt,
} from "./course.js";
const TAU = Math.PI * 2;
const FLIP_SPEED = 4.3 * 1.15;
const SPIN_SPEED = 4.7 * 1.15;
const MIXED_FLIP_WEIGHT = 0.6;
const flipSpeed = spin => FLIP_SPEED * (1 - (1 - MIXED_FLIP_WEIGHT) * Math.min(1, Math.abs(spin)));
const AIR_SPIN_ACCEL = 4.5;
const AIR_FLIP_ACCEL = 4;
const ROTATION_RELEASE_DAMPING = 7;
const TAKEOFF_WINDOW = 0.12;
const RAIL_SPIN_WINDOW = 0.35;
// Keep a held charge available briefly after skiing off a ledge.
const LATE_POP_WINDOW = 0.3;
const MAX_TAKEOFF_VY = 15;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, target, rate, dt) =>
  v + (target - v) * (1 - Math.exp(-rate * dt));

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
    quarterpipeFlight: false,
    railing: false,
    rail: null,
    railYaw: 0,
    railPitch: 0,
    railCooldown: 0,
    railCrash: false,
    cableFlight: false,
    charge: 0,
    latePopTimer: 0,
    latePopCharge: 0,
    spin: 0,
    spinVelocity: 0,
    spinSet: false,
    railPop: false,
    railSpinHeld: false,
    flip: 0,
    flipVelocity: 0,
    flipSet: false,
    airRotation: null,
    takeoffFrame: null,
    airPitch: 0,
    airYaw: 0,
    airSpin: 0,
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
    ...createScoringState(),
    tucking: false,
    skating: 0,
    skatePhase: 0,
    braking: false,
    jumps: 0,
    seenJumps: new Set(),
    time: 0,
    paused: false,
    finished: false,
    bailTimer: 0,
    landingPulse: 0,
    landingImpact: null,
    landingSkid: 0,
    landingSkidDirection: 0,
    landingSlopeInfluence: 0,
    landingSlopeHeading: 0,
    landingRecovery: 0,
    message: "FIND YOUR LINE",
    messageDetail: COURSE.openWorld ? "Choose a direction. Hold Ctrl to skate." : `${JUMPS.length} jumps. Make them count.`,
    messageTimer: 4,
    lastTrick: "",
    lastPoints: 0,
    combo: 0,
    comboName: "",
    comboMultiplier: 1,
    trickChain: null,
    event: 0,
    eventType: "",
    maxHeight: 0,
  };
}
export function respawn(s) {
  Object.assign(s, createState());
}
function event(s, type) {
  if (type === 'rail' && s.trickChain) {
    s.trickChain.rails.add(s.rail.kind === 'handrail' ? 'HANDRAIL SLIDE' : s.rail.kind === 'log' ? 'LOG SLIDE' : 'CABLE SLIDE');
    updateCombo(s);
  } else if (type === 'bail') {
    s.trickChain = null;
    s.combo = 0;
    s.comboName = '';
    s.comboMultiplier = 1;
  }
  s.event++;
  s.eventType = type;
}
function launch(s, vy, flipInput = 0, spinInput = 0, frame = riderFrame(s), upwardLimit = MAX_TAKEOFF_VY) {
  s.takeoffFrame = { pitch: frame.pitch, roll: frame.roll, clearance: 0 };
  s.takeoffSwitch = s.switch;
  s.airborne = true;
  s.quarterpipeFlight = false;
  s.takeoffUpwardLimit = upwardLimit;
  s.landingSkid = 0;
  s.landingSkidDirection = 0;
  s.landingSlopeInfluence = 0;
  s.landingPulse = 0;
  s.landingImpact = null;
  s.landingRecovery = 0;
  s.tucking = false;
  s.skating = 0;
  s.braking = false;
  // Ordinary pops are capped; the spine can redirect existing approach momentum.
  s.vy = Math.min(upwardLimit, vy);
  s.airtime = 0;
  s.railPop = false;
  s.railSpinHeld = false;
  s.spin = 0;
  // Preserve a carve even when the arrow is released on the pop frame.
  const turn = clamp(spinInput || s.steer, -1, 1);
  s.spinVelocity = turn * SPIN_SPEED;
  s.spinSet = Math.abs(turn) > 0.01;
  s.flip = 0;
  s.flipVelocity = clamp(flipInput, -1, 1) * flipSpeed(turn);
  s.flipSet = flipInput !== 0;
  s.airRotation = null;
  s.airPitch = 0;
  s.airYaw = 0;
  s.airSpin = 0;
  s.spinTravel = 0;
  s.flipTravel = 0;
  s.grabTime = 0;
  s.grabs.clear();
  s.daffyProgress = 0;
  s.daffyExtended = false;
  s.daffyCompleted = false;
  s.charge = 0;
  s.maxHeight = 0;
  updateCombo(s);
  event(s, "takeoff");
}

function latePop(s, input) {
  const pop = 6 + s.latePopCharge * 3.25;
  const frame = s.takeoffFrame || riderFrame(s);
  const across = -Math.sin(frame.roll), along = -Math.sin(frame.pitch) * Math.cos(frame.roll);
  s.vx += pop * .15 * (Math.cos(s.heading) * across - Math.sin(s.heading) * along);
  s.vs += pop * .15 * (Math.sin(s.heading) * across + Math.cos(s.heading) * along);
  s.speed = Math.hypot(s.vx, s.vs);
  // A delayed release must obey the same limit as the initial takeoff.
  s.vy = Math.min(s.takeoffUpwardLimit ?? MAX_TAKEOFF_VY, s.vy + pop);
  const turn = clamp(input.spin || s.steer, -1, 1);
  s.spinVelocity = turn * SPIN_SPEED;
  s.spinSet = Math.abs(turn) > .01;
  s.flipVelocity = clamp(input.flip || 0, -1, 1) * flipSpeed(turn);
  s.flipSet = !!input.flip;
  s.latePopTimer = 0;
  s.latePopCharge = 0;
  s.charge = 0;
}
function aerialTrick(s) {
  const halfTurns = Math.floor((s.spinTravel + 0.18) / Math.PI);
  const flips = Math.floor((s.flipTravel + 0.18) / TAU);
  const grabs = s.grabTime > 0.18 ? s.grabs.size : 0;
  const names = [];
  if (flips)
    names.push(
      `${flips > 1 ? flips + "× " : ""}${(s.airRotation ? s.airPitch : s.flip) < 0 ? "BACKFLIP" : "FRONTFLIP"}`,
    );
  if (halfTurns) names.push(`${halfTurns * 180}`);
  if (s.daffyCompleted) names.push("DAFFY");
  if (grabs)
    names.push(
      s.grabs.size > 1
        ? "GRAB COMBO"
        : s.grabs.has(1)
          ? "MUTE GRAB"
          : s.grabs.has(7) ? "BOW AND ARROW" : s.grabs.has(6) ? "HANG OUT" : s.grabs.has(5) ? "JAPAN GRAB" : s.grabs.has(4) ? "OCTO GRAB" : s.grabs.has(3) ? "BLUNT GRAB" : "SAFETY GRAB",
    );
  const base =
    halfTurns * 180 +
    flips * 600 +
    (s.daffyCompleted ? 400 : 0) +
    (grabs ? Math.floor(s.grabTime * 180) + grabs * 120 : 0);
  const categories = [flips && 'flip', halfTurns && 'spin', s.daffyCompleted && 'daffy', grabs && 'grab'].filter(Boolean);
  return { base, categories, names: names.map(name => (s.takeoffSwitch ? 'SWITCH ' : '') + name) };
}

export function trickValue(s) {
  if (s.railCrash) return { points: 0, name: '', multiplier: 1 };
  const air = aerialTrick(s), chain = s.trickChain;
  const names = [...(chain?.names || []), ...air.names];
  const categories = new Set([...(chain?.categories || []), ...air.categories]);
  let base = air.base + (chain?.base || 0);
  if (chain) {
    const railPoints = Math.min(1000, Math.floor(chain.distance * 20));
    base += railPoints + chain.turns * 180;
    if (railPoints) { categories.add('rail'); names.push(...chain.rails); }
    if (chain.turns) {
      categories.add('spin');
      names.push(`${chain.turns > 1 ? chain.turns + '× ' : ''}RAIL 180`);
    }
  }
  const multiplier = 1 + Math.max(0, categories.size - 1) * .5;
  return { points: Math.round(base * multiplier), multiplier,
    name: [...new Set(names)].join(' + ') || (s.takeoffSwitch ? 'SWITCH STRAIGHT AIR' : 'STRAIGHT AIR') };
}

function updateCombo(s) {
  const trick = trickValue(s);
  s.combo = trick.points;
  s.comboName = trick.name;
  s.comboMultiplier = trick.multiplier;
}
export function resolveLanding(s, gradient, { railCatch = false, collision = false } = {}) {
  const landing = aerialLanding(s);
  const landingYaw = landing.yaw;
  // Yaw changes the direction of the skis, not their tilt relative to horizontal.
  // Allow any upright landing; vertical or inverted skis cause a wipeout.
  const daffyRecovered = s.daffyProgress === 0;
  const safe = daffyRecovered && landing.upright && !s.railCrash && !collision;
  const trick = trickValue(s);
  if (safe && railCatch) {
    const chain = s.trickChain ??= { base:0, names:[], categories:new Set(), rails:new Set(), distance:0, turns:0 };
    if (s.airborne) {
      const air = aerialTrick(s);
      chain.base += air.base;
      chain.names = [...new Set([...chain.names, ...air.names])];
      for (const category of air.categories) chain.categories.add(category);
    }
  } else if (safe) {
    beginLandingSkid(s, landingYaw, COURSE.openWorld, gradient);
    s.switch = Math.abs(Math.round(s.stanceYaw / Math.PI) % 2) === 1;
    const points = trick.points || (s.airtime > 0.7 ? 100 : 0);
    const awarded = bankScore(s, points);
    s.lastTrick = trick.name;
    s.lastPoints = awarded;
    if (s.airtime > 0.5 || s.trickChain) {
      s.message = s.scoreLocked ? "SCORE LOCKED" : awarded ? `+${awarded.toLocaleString()}` : "CLEAN LANDING";
      s.messageDetail = trick.name;
      s.messageTimer = 2.4;
    }
    // Longer drops compress the legs more; a steep landing absorbs the fall
    // along the snow instead of delivering the full impact into the knees.
    const slope = gradient ? Math.hypot(gradient.x, gradient.s) : 0;
    s.landingPulse = clamp(s.airtime * .18, .1, .65) / Math.hypot(1, slope * 1.6);
    s.landingImpact = captureLandingImpact(s, slope);
    event(s, "land");
  } else {
    s.stanceYaw = 0;
    s.yawOffset = 0;
    s.landingSkid = 0;
    s.landingSkidDirection = 0;
    s.landingSlopeInfluence = 0;
    s.landingPulse = 0;
    s.landingImpact = null;
    s.landingRecovery = 0;
    s.switch = false;
    s.bailTimer = 1.65;
    s.speed = s.speed * 0.38;
    s.message = "WIPED OUT";
    s.messageDetail = s.railCrash ? 'Pop earlier to clear the lift tower' : daffyRecovered
      ? "Land with your skis less than 90° from horizontal"
      : "Release A early enough to recover from the daffy before landing";
    s.messageTimer = 2;
    event(s, "bail");
  }
  s.airborne = false;
  s.latePopTimer = 0;
  s.latePopCharge = 0;
  s.takeoffFrame = null;
  s.railCrash = false;
  s.cableFlight = false;
  s.spin = 0;
  s.spinVelocity = 0;
  s.spinSet = false;
  s.railPop = false;
  s.railSpinHeld = false;
  s.flip = 0;
  s.flipVelocity = 0;
  s.flipSet = false;
  s.airRotation = null;
  s.airPitch = 0;
  s.airYaw = 0;
  s.airSpin = 0;
  s.spinTravel = 0;
  s.flipTravel = 0;
  s.grab = 0;
  s.grabTime = 0;
  s.grabs.clear();
  s.daffyProgress = 0;
  s.daffyExtended = false;
  s.daffyCompleted = false;
  s.combo = 0;
  s.comboName = "";
  s.comboMultiplier = 1;
  if (!railCatch || !safe) s.trickChain = null;
  else updateCombo(s);
  s.vy = 0;
}

function updateAerial(s, input, dt) {
    if(s.railCrash) input={};
    // Full authority at the lip, then progressively smaller corrections.
    // Neutral input still lets the rider check rotation for the landing.
    const correctionTime = Math.max(0, s.airtime + dt / 2 - TAKEOFF_WINDOW);
    const control = 0.06 + 0.94 * Math.exp(-2.8 * correctionTime);
    // Keep up/down useful throughout a long flight without changing the
    // takeoff impulse or the spin-first axis of a held diagonal input.
    const flipControl = 0.55 + 0.45 * Math.exp(-correctionTime);
    const inTakeoffWindow = s.airtime < TAKEOFF_WINDOW;
    const inSpinWindow = s.airtime < (s.railPop ? RAIL_SPIN_WINDOW : TAKEOFF_WINDOW);
    s.airtime += dt;
    const spinInput = clamp(input.spin || 0, -1, 1);
    // Release a held rail-turn key before allowing a fresh spin-start impulse.
    if (s.railSpinHeld && !spinInput && !input.steer) {
      s.railSpinHeld = false;
      s.spinSet = false;
    }
    if (!s.spinSet && inSpinWindow && spinInput) {
      s.spinVelocity = spinInput * SPIN_SPEED;
      // Give staggered diagonal key presses the same spin-first launch as
      // holding both keys on the pop frame; never snap the rider's orientation.
      if (s.flipSet) s.flipVelocity *= flipSpeed(spinInput) / FLIP_SPEED;
      s.spinSet = true;
    }
    if (spinInput) {
      const acceleration = AIR_SPIN_ACCEL * control * dt;
      s.spinVelocity += clamp(spinInput * SPIN_SPEED - s.spinVelocity, -acceleration, acceleration);
    } else {
      s.spinVelocity *= Math.exp(-ROTATION_RELEASE_DAMPING * dt);
      if (Math.abs(s.spinVelocity) < 0.01) s.spinVelocity = 0;
    }
    const flipInput = clamp(input.flip || 0, -1, 1);
    const pitchInput = clamp(input.pitch || 0, -1, 1);
    const targetFlipSpeed = flipSpeed(Math.max(Math.abs(spinInput), Math.abs(s.spinVelocity) / SPIN_SPEED));
    // A small takeoff grace window accommodates a key pressed just after
    // leaving the lip. Once set, even an immediate reversal uses air torque.
    if (!s.flipSet && inTakeoffWindow && flipInput) {
      s.flipVelocity = flipInput * targetFlipSpeed;
      s.flipSet = true;
    }
    if (flipInput || pitchInput) {
      const target = flipInput ? flipInput * targetFlipSpeed : pitchInput * 0.85;
      const acceleration = (flipInput ? AIR_FLIP_ACCEL : 1.2) * flipControl;
      s.flipVelocity += clamp(target - s.flipVelocity, -acceleration * dt, acceleration * dt);
    } else {
      // Brake angular velocity, never seek an angle or a level orientation.
      s.flipVelocity *= Math.exp(-ROTATION_RELEASE_DAMPING * dt);
      if (Math.abs(s.flipVelocity) < 0.01) s.flipVelocity = 0;
    }
    advanceAerialRotation(s, dt);
    s.spin += s.spinVelocity * dt;
    s.flip += s.flipVelocity * dt;
    const wasInDaffy = s.daffyProgress > 0;
    updateDaffy(s, !!input.daffy, dt);
    s.grab = input.daffy || wasInDaffy ? 0 : input.grab || 0;
    if (s.grab) {
      s.grabTime += dt;
      s.grabs.add(s.grab);
    }
      s.vy -= (COURSE.openWorld ? 30.36 : 25.08) * dt;
    s.y += s.vy * dt;
    updateCombo(s);
}

export function step(s, input, dt) {
  if (s.paused || s.finished || dt <= 0) return;
  dt = Math.min(dt, 1 / 30);
  if (s.awaitingStart) {
    if (!input.skate) {
      s.steer=approach(s.steer,clamp(input.steer || 0,-1,1),9,dt);
      s.heading-=s.steer*1.85*dt;
      return;
    }
    s.awaitingStart=false;
    s.started=true;
    // The first push comes from skating; pre-start Space never charges a pop.
    input={...input,tuck:false,charge:false,pop:false};
  }
  s.time += dt;
  advanceScoringWindow(s, dt);
  s.railCooldown=Math.max(0,(s.railCooldown || 0)-dt);
  s.messageTimer = Math.max(0, s.messageTimer - dt);
  s.landingPulse = approach(s.landingPulse, 0, 3.2, dt);
  s.bailTimer = Math.max(0, s.bailTimer - dt);
  if (s.airborne && s.latePopTimer > 0) {
    if (input.pop) latePop(s, input);
    else {
      s.latePopTimer = Math.max(0, s.latePopTimer - dt);
      if (!s.latePopTimer) s.latePopCharge = 0;
    }
  }
  s.skating = skatingEffort(s, input);
  if (s.skating > 0) s.skatePhase += dt * Math.PI * 2 * 1.15;
  const cableApi={launch,resolveLanding:state=>resolveLanding(state,undefined,{railCatch:true}),event};
  if(s.railing) {
    const rail=s.rail, distance=rail.distance, turns=rail.turns || 0;
    (rail.kind==='log'||rail.kind==='handrail'?stepLog:stepCable)(s,input,dt,cableApi);
    if (input.pop && s.airborne && !s.railing && !s.railCrash) {
      // Rail pops need time to aim the skis before committing to a spin.
      s.railPop = true;
      s.railSpinHeld = !!(input.spin || input.steer);
      s.spinSet = s.railSpinHeld;
    }
    if (s.trickChain) {
      s.trickChain.distance += rail.distance-distance;
      s.trickChain.turns += (rail.turns || 0)-turns;
    }
    updateCombo(s);
    return;
  }
  const before={x:s.x,s:s.s,y:s.y,airborne:s.airborne};
  const disabled = s.bailTimer > 0;
  s.tucking = !!input.tuck && !disabled && !s.airborne;
  s.braking = !!input.brake && !disabled && !s.airborne;
  const steer = disabled ? 0 : input.steer || 0;
  s.steer = approach(s.steer, steer, 9, dt);
  if (COURSE.openWorld) {
    stepMountain(s, input, dt, { launch, resolveLanding, updateAerial, event,
      latePopWindow:LATE_POP_WINDOW,
      catchCable:(state,from)=>catchCable(state,from,input,cableApi) || catchLog(state,from,input,cableApi) });
    return;
  }
  if (!s.airborne) {
    // Sample the actual snow surface along the skier's travel direction.
    const dx = -Math.sin(s.heading), ds = Math.cos(s.heading);
    const grade = (groundHeight(s.x - dx * 0.5, s.s - ds * 0.5) -
      groundHeight(s.x + dx * 0.5, s.s + ds * 0.5));
    const downhillPull = 31.05 * grade / Math.hypot(1, grade);
    const drag = s.tucking ? 0.0045 : 0.0065;
    const accel = downhillPull - s.speed * s.speed * drag -
      (s.braking ? 30 : 0.8) - Math.abs(s.steer) * 2.1;
    s.speed = clamp(applySkating(s.speed, s.skating, dt) + accel * dt, 0, 69);
    s.vx = approach(s.vx, s.steer * s.speed * 0.56, 6 / (1 + s.landingSkid * 12), dt);
    s.heading = approach(s.heading, -Math.atan2(s.vx, s.speed), 8, dt);
    const skidTurn = advanceLandingSkid(s, dt);
    s.vx -= Math.sin(skidTurn) * s.speed;
    if (input.charge && !disabled) s.charge = clamp(s.charge + dt * 1.25, 0, 1);
    if (input.pop && !disabled) {
      launch(s, 5 + s.charge * 3.25, input.flip || 0, input.spin || 0);
    }
  } else {
    s.vx = approach(s.vx, steer * 3, 0.7, dt);
    updateAerial(s, input, dt);
  }
  const prev = s.s;
  if(!s.cableFlight && (!s.airborne || s.vs>=0))s.vs=s.speed;
  s.s += s.vs * dt;
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
  if(catchCable(s,before,input,cableApi))return;
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
