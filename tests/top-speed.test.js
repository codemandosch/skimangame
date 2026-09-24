import test from 'node:test';
import assert from 'node:assert/strict';
import { easeTopSpeed, TOP_SPEED, TOP_SPEED_EASE_START } from '../src/top-speed.js';

// Integrate a steep tucked descent: strong pull, tuck drag, snow friction.
function descend(seconds, speed = 18, dt = 1 / 120) {
  const trace = [];
  for (let t = 0; t < seconds; t += dt) {
    speed += easeTopSpeed(speed, 26 - speed * speed * .0045 - .8) * dt;
    trace.push(speed);
  }
  return trace;
}

test('acceleration is untouched below the easing band', () => {
  assert.equal(easeTopSpeed(TOP_SPEED_EASE_START, 12), 12);
  assert.equal(easeTopSpeed(20, 12), 12);
  assert.equal(easeTopSpeed(45, -8), -8, 'braking and uphill drag still bite');
});

test('acceleration fades smoothly to nothing at top speed', () => {
  let previous = 1;
  for (let v = TOP_SPEED_EASE_START; v <= TOP_SPEED; v += .5) {
    const scale = easeTopSpeed(v, 1);
    assert.ok(scale <= previous + 1e-12 && previous - scale < .08, `no sudden step at ${v} m/s`);
    previous = scale;
  }
  assert.equal(easeTopSpeed(TOP_SPEED, 20), 0);
});

test('long steep runs level off below top speed instead of hitting a wall', () => {
  const trace = descend(40);
  assert.ok(trace[120 * 2] > 30, 'early pickup stays quick');
  assert.ok(Math.max(...trace) < TOP_SPEED);
  assert.ok(trace.at(-1) > TOP_SPEED - 2, 'still reaches near the cap');
  const last = trace.at(-1) - trace.at(-121);
  assert.ok(last >= 0 && last < .2, 'settles instead of oscillating');
});

test('surplus speed from a landing relaxes back to the cap', () => {
  let speed = 62;
  for (let i = 0; i < 120 * 4; i++) speed += easeTopSpeed(speed, 10) * (1 / 120);
  assert.ok(speed > TOP_SPEED && speed < TOP_SPEED + .2);
});
