import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, resolveLanding, respawn } from '../src/physics.js';
import { selectCourse } from '../src/course.js';
import { SLIDE_FEATURES, logPoint } from '../src/log-layout.js';
import { getLiftLayout, cablePoint, RAIL_HEIGHT } from '../src/lift-layout.js';

function popRail(kind, hz, input = {}) {
  selectCourse('blackridge');
  const s = createState();
  if (kind === 'cable') {
    const layout = getLiftLayout(), u = (layout.towers[1].u + layout.towers[2].u) / 2;
    Object.assign(s, cablePoint(layout, 0, u));
    s.y += RAIL_HEIGHT;
    s.heading = layout.heading;
    s.rail = { cable: 0, u, velocity: 32, yaw: Math.PI / 2, distance: 0 };
  } else {
    const log = SLIDE_FEATURES.find(log => kind === 'handrail' ? log.kind === kind : log.kind === 'fallen');
    Object.assign(s, logPoint(log, log.length / 2));
    s.heading = log.heading;
    s.rail = { kind, log: log.id, u: log.length / 2, velocity: 32, yaw: Math.PI / 2, distance: 0 };
  }
  Object.assign(s, { railing: true, started: true, railYaw: Math.PI / 2, speed: 32 });
  step(s, { pop: true, ...input }, 1 / hz);
  assert.ok(s.airborne && !s.railing);
  // Keep the flight clear of terrain/cables while checking input timing.
  s.y += 1000;
  return s;
}

function fly(s, seconds, hz, input = {}) {
  for (let i = 0; i < Math.round(seconds * hz); i++) step(s, input, 1 / hz);
}

test('rail pops allow pitching first and starting a full spin a quarter-second later', () => {
  for (const kind of ['cable', 'handrail', 'log']) for (const hz of [30, 60, 120]) for (const spin of [-1, 1]) {
    const s = popRail(kind, hz);
    fly(s, .25, hz, { flip: 1 });
    assert.ok(s.flip > 0, 'can adjust ski pitch before starting the spin');
    assert.equal(s.spinVelocity, 0);
    step(s, { spin }, 1 / hz);
    assert.ok(s.spinVelocity * spin > 5, `${kind} at ${hz} Hz: delayed spin gets full start speed`);
  }
});

test('a held rail-turn key needs release before it can trigger the delayed spin start', () => {
  for (const kind of ['cable', 'handrail', 'log']) for (const spin of [-1, 1]) {
    const s = popRail(kind, 120, { spin, steer: spin });
    fly(s, .2, 120, { spin, steer: spin });
    assert.ok(Math.abs(s.spinVelocity) < 1, 'held rail turn only gets normal air correction');
    step(s, {}, 1 / 120);
    step(s, { spin }, 1 / 120);
    assert.ok(s.spinVelocity * spin > 5, 'fresh press can start a spin within the rail window');
    step(s, { spin: -spin }, 1 / 120);
    assert.ok(s.spinVelocity * spin > 4, 'the start impulse cannot be reused to reverse instantly');
  }
});

test('the longer rail spin-start window expires and does not carry into snow jumps or respawns', () => {
  for (const kind of ['cable', 'handrail', 'log']) {
    const s = popRail(kind, 120);
    fly(s, .4, 120);
    step(s, { spin: 1 }, 1 / 120);
    assert.ok(s.spinVelocity < .1, 'late rail input only gets normal air correction');
    for (const reset of [resolveLanding, respawn]) {
      const next = popRail(kind, 120);
      reset(next);
      selectCourse('bluebird');
      Object.assign(next, { x: 0, s: 0, started: true });
      step(next, { pop: true }, 1 / 120);
      assert.ok(next.airborne);
      next.y += 1000;
      fly(next, .25, 120);
      step(next, { spin: 1 }, 1 / 120);
      assert.ok(next.spinVelocity < .1, 'ordinary jump keeps its shorter start window');
    }
  }
});
