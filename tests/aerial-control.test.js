import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, resolveLanding, respawn } from '../src/physics.js';
import { selectCourse, groundHeight, JUMPS } from '../src/course.js';

function fly(s, seconds, input = {}, hz = 120) {
  for (let i = 0; i < Math.round(seconds * hz); i++) step(s, input, 1 / hz);
}

test('turning into a pop carries spin immediately, including releasing the turn at takeoff', () => {
  try {
    for (const course of ['bluebird', 'blackridge']) {
      selectCourse(course);
      for (const direction of [-1, 1]) for (const released of [false, true]) {
        const s = createState();
        s.steer = direction;
        step(s, { pop: true, steer: released ? 0 : direction }, 1 / 120);
        assert.ok(s.airborne);
        assert.ok(s.spinVelocity * direction > 4);
        s.y += 100;
        step(s, {}, 1 / 120);
        assert.ok(s.spin * direction > 0);
      }
    }
  } finally { selectCourse('bluebird'); }
});

test('automatic ramp takeoff captures spin in both directions', () => {
  for (const direction of [-1, 1]) {
    const s = createState(), ramp = JUMPS[0];
    s.s = ramp.lip - 0.05;
    s.x = ramp.x;
    s.y = groundHeight(s.x, s.s);
    step(s, { spin: direction, steer: direction }, 1 / 120);
    assert.ok(s.airborne);
    assert.ok(s.spinVelocity * direction > 4);
  }
});

test('spin, flip and pitch authority progressively fade over the same input interval', () => {
  for (const input of ['spin', 'flip', 'pitch']) for (const direction of [-1, 1]) {
    const velocities = [0.02, 0.3, 1, 3].map(airtime => {
      const s = createState();
      s.airborne = true;
      s.y += 1000;
      s.airtime = airtime;
      fly(s, 0.1, { [input]: direction });
      return Math.abs(input === 'spin' ? s.spinVelocity : s.flipVelocity);
    });
    for (let i = 1; i < velocities.length; i++) assert.ok(velocities[i] < velocities[i - 1]);
    assert.ok(velocities[3] < velocities[0] * (input === 'spin' ? 0.1 : 0.2));
  }
});

test('vertical corrections retain 15 percent authority late in long jumps', () => {
  for (const input of ['flip', 'pitch']) for (const direction of [-1, 1]) {
    const acceleration = input === 'flip' ? 3.2 : 1.2;
    for (const airtime of [5, 12, 30]) {
      const s = createState();
      s.airborne = true;
      s.y += 1000;
      s.airtime = airtime;
      fly(s, 0.25, { [input]: direction });
      const authority = s.flipVelocity * direction / (acceleration * 0.25);
      assert.ok(authority >= 0.15 - 1e-10 && authority < 0.151);
    }
  }
});

test('late opposite spin cannot instantly reverse takeoff momentum', () => {
  for (const direction of [-1, 1]) {
    const s = createState();
    step(s, { pop: true, spin: direction }, 1 / 120);
    s.y += 1000;
    fly(s, 1, { spin: direction });
    fly(s, 1, { spin: -direction });
    assert.ok(s.spinVelocity * direction > 4);
  }
});

test('spin momentum freezes on pause and clears on landing and restart', () => {
  const s = createState();
  step(s, { pop: true, spin: 1 }, 1 / 120);
  const velocity = s.spinVelocity;
  s.paused = true;
  fly(s, 0.5, { spin: -1 });
  assert.equal(s.spinVelocity, velocity);
  s.paused = false;
  resolveLanding(s);
  assert.equal(s.spinVelocity, 0);
  assert.equal(s.spinSet, false);
  step(s, { pop: true, spin: -1 }, 1 / 120);
  respawn(s);
  assert.equal(s.spinVelocity, 0);
  assert.equal(s.spinSet, false);
});

test('fading rotation remains consistent across simulation step sizes', () => {
  const results = [30, 60, 120].map(hz => {
    const s = createState();
    step(s, { pop: true, spin: 1, flip: -1 }, 1 / 120);
    s.y += 1000;
    fly(s, 1, { spin: -1, flip: 1 }, hz);
    return s;
  });
  for (const s of results) {
    assert.ok(Math.abs(s.spinVelocity - results[2].spinVelocity) < 0.01);
    assert.ok(Math.abs(s.flipVelocity - results[2].flipVelocity) < 0.01);
    assert.ok(Math.abs(s.spin - results[2].spin) < 0.04);
  }
});
