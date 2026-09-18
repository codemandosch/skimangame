import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, resolveLanding, respawn } from '../src/physics.js';
import { selectCourse, groundHeight } from '../src/course.js';
import { advanceLandingSkid, landingDriftStrength } from '../src/landing-skid.js';
import { landingSprayCount, snowSprayRate } from '../src/effects.js';
import { gradientAt } from '../src/blackridge.js';

function landing(spin, heading = 0) {
  const s = createState();
  Object.assign(s, { s: 30, started: true, airborne: true, airtime: 2,
    spin, heading, speed: 30, vx: -Math.sin(heading) * 30, vs: Math.cos(heading) * 30, vy: -50 });
  s.y = groundHeight(s.x, s.s) + .001;
  return s;
}

test('angled mountain touchdowns skid toward the skis, lose speed and spray more', () => {
  try {
    for (const course of ['blackridge']) {
      selectCourse(course);
      for (const direction of [-1, 1]) {
        const g = gradientAt(0, 30), downhill = -Math.atan2(-g.x, -g.s);
        const clean = landing(0, downhill), angled = landing(direction * .6, downhill);
        step(clean, {}, 1 / 120);
        step(angled, {}, 1 / 120);
        assert.equal(angled.airborne, false);
        assert.equal(angled.bailTimer, 0);
        assert.ok(angled.speed < clean.speed);
        assert.ok(landingSprayCount(angled) > landingSprayCount(clean));
        assert.ok(snowSprayRate(angled) > snowSprayRate(clean));
        assert.ok(Math.abs(angled.yawOffset) > .5, 'touchdown preserves a visible sideways skid');
        for (let i = 0; i < 30; i++) {
          step(clean, {}, 1 / 120);
          step(angled, {}, 1 / 120);
        }
        const across = (angled.x - clean.x) * Math.cos(downhill) + (angled.s - clean.s) * Math.sin(downhill);
        assert.ok(across * direction > .1, `${course}: skis still influence the trajectory against the slope`);
        assert.ok((angled.heading - clean.heading) * direction < 0);
        assert.ok(angled.speed < clean.speed);
        assert.ok(Math.abs(angled.yawOffset) > .08 && Math.abs(angled.yawOffset) < .3,
          'the skid should still be visibly recovering after a quarter second');
      }
    }
  } finally { selectCourse('bluebird'); }
});

test('aligned forward, switch and full-spin landings preserve momentum', () => {
  selectCourse('blackridge');
  try {
    for (const spin of [0, Math.PI, -Math.PI, Math.PI * 2]) {
      const s = landing(spin, 2.7);
      const { speed, vx, vs, heading } = s;
      resolveLanding(s);
      assert.equal(s.speed, speed);
      assert.equal(s.vx, vx);
      assert.equal(s.vs, vs);
      assert.ok(Math.abs(s.heading - heading) < 1e-10);
      assert.ok(s.landingSkid < 1e-10);
      assert.equal(s.switch, Math.abs(spin) === Math.PI);
    }
  } finally { selectCourse('bluebird'); }
});

test('skids use actual incoming momentum and preserve world ski yaw at touchdown', () => {
  selectCourse('blackridge');
  try {
    for (const heading of [-3.1, 0, 3.1, 7]) {
      const s = landing(-.5, heading);
      s.vx = -Math.sin(heading + .2) * 30;
      s.vs = Math.cos(heading + .2) * 30;
      const worldYaw = s.heading - s.stanceYaw - s.spin;
      resolveLanding(s);
      assert.ok(Math.abs(s.heading - s.stanceYaw - s.yawOffset - worldYaw) < 1e-9);
      assert.ok(Math.abs(s.heading - heading - .2) < 1e-9);
      const incoming = s.heading;
      for (let i = 0; i < 240; i++) advanceLandingSkid(s, 1 / 120);
      assert.ok(s.heading > incoming + .2, 'new travel direction persists after the skid settles');
      assert.ok(Math.abs(s.yawOffset) < .003);
    }
  } finally { selectCourse('bluebird'); }
});

test('larger landing angles scrub more speed and skids settle consistently across frame rates', () => {
  const states = [.1, .6, 1.3].map(angle => {
    const s = landing(angle);
    resolveLanding(s);
    return s;
  });
  assert.ok(states[0].speed > states[1].speed && states[1].speed > states[2].speed);
  const runs = [30, 60, 120].map(hz => {
    const s = landing(.7);
    resolveLanding(s);
    for (let i = 0; i < hz; i++) advanceLandingSkid(s, 1 / hz);
    return s;
  });
  for (const s of runs) {
    assert.ok(Math.abs(s.heading - runs[2].heading) < 1e-8);
    assert.ok(Math.abs(s.speed - runs[2].speed) < .25);
  }
  respawn(states[2]);
  assert.equal(states[2].landingSkid, 0);
  assert.equal(states[2].landingRecovery, 0);
});

test('landing recovery pulls cross-slope momentum downhill on every compass face', () => {
  for (const heading of [-3, -1, 0, 2, 7]) {
    // Downhill is to the skier's right on this constant test slope.
    const g = { x: -Math.cos(heading), s: -Math.sin(heading) };
    const run = (gradient, hz) => {
      const s = landing(0, heading);
      resolveLanding(s);
      for (let i = 0; i < hz / 2; i++) advanceLandingSkid(s, 1 / hz, gradient);
      return s;
    };
    const flat = run({ x: 0, s: 0 }, 120);
    const shallow = run({ x: g.x * .2, s: g.s * .2 }, 120);
    const steep = run(g, 120);
    assert.ok(Math.abs(flat.heading - heading) < 1e-9);
    assert.ok(shallow.heading < flat.heading - .03);
    assert.ok(steep.heading < shallow.heading - .1, 'steeper slopes pull the landing line harder');
    for (const hz of [30, 60]) {
      const s = run(g, hz);
      assert.ok(Math.abs(s.heading - steep.heading) < .015);
      assert.ok(Math.abs(s.speed - steep.speed) < .15);
    }
  }
});

test('slope recovery adds no second forward gravity impulse to a downhill landing', () => {
  const s = landing(0);
  resolveLanding(s);
  const speed = s.speed;
  advanceLandingSkid(s, 1 / 60, { x: 0, s: -1 });
  assert.equal(s.speed, speed);
  assert.equal(s.heading, 0);
  assert.equal(s.landingSkid, 0);
});

test('fast uphill arrivals scrub speed and drift smoothly toward downhill through recovery', () => {
  selectCourse('blackridge');
  try {
    const g = gradientAt(0, 50);
    const downhill = -Math.atan2(-g.x, -g.s);
    for (const speed of [12, 30, 56]) for (const hz of [30, 60, 120]) for (const spin of [-.7, 0, .7]) {
      const s = landing(spin, downhill + Math.PI);
      Object.assign(s, { s: 50, speed,
        vx: -Math.sin(s.heading) * speed, vs: Math.cos(s.heading) * speed });
      s.y = groundHeight(0, 50) + .001;
      step(s, {}, 1 / hz);
      assert.equal(s.airborne, false);
      assert.ok(s.speed < speed * .65, 'an uphill arrival must lose substantial speed');
      assert.ok(Math.abs(s.heading - downhill - Math.PI) < 1e-8, 'contact must not snap the trajectory');
      for (let i = 0; i < hz * 1.5; i++) {
        const heading = s.heading;
        step(s, {}, 1 / hz);
        assert.ok(Math.abs(s.heading - heading) <= 2.2 / hz + 1e-8, 'ground redirection has a bounded angular speed');
      }
      const local = gradientAt(s.x, s.s);
      assert.ok(local.x * s.vx + local.s * s.vs < 0, 'the longer skid still recovers downhill');
      assert.equal(s.bailTimer, 0);
    }
  } finally { selectCourse('bluebird'); }
});

test('slope recovery turns toward downhill over time while touchdown preserves visible ski yaw', () => {
  for (const angle of [20, 28, 45, 60]) for (const downhill of [-3, -1, 0, 2, 7]) {
    const grade = Math.tan(angle * Math.PI / 180);
    const g = { x: Math.sin(downhill) * grade, s: -Math.cos(downhill) * grade };
    for (const offset of [-Math.PI, -Math.PI / 2, Math.PI / 2, Math.PI]) {
      const s = landing(.4, downhill + offset);
      const yaw = s.heading - s.stanceYaw - s.spin;
      resolveLanding(s, g);
      assert.ok(s.speed <= 30 && s.speed > 0, 'redirection scrubs speed without adding energy');
      assert.ok(Math.abs(s.heading - s.stanceYaw - s.yawOffset - yaw) < 1e-9);
      assert.ok(Math.abs(Math.hypot(s.vx, s.vs) - s.speed) < 1e-9);
      assert.ok(s.landingSkid > 0, 'strong redirection should spray powder');
      for (let i = 0; i < 240; i++) advanceLandingSkid(s, 1 / 120, g);
      assert.ok(Math.cos(s.heading - downhill) > 0, `${angle} degree slope should finish the shorter skid with downhill travel`);
    }
  }
});

test('landing farther from downhill loses progressively more speed', () => {
  const speeds = [0, Math.PI / 4, Math.PI / 2, Math.PI].map(heading => {
    const s = landing(0, heading);
    resolveLanding(s, { x: 0, s: -1 });
    return s.speed;
  });
  assert.equal(speeds[0], 30);
  for (let i = 1; i < speeds.length; i++) assert.ok(speeds[i] < speeds[i - 1]);
  assert.ok(speeds[2] < 24 && speeds[3] < 18);
});

test('slope weighting preserves aligned downhill and nearly flat landings', () => {
  for (const grade of [0, .05, 1, 3]) {
    const s = landing(0);
    resolveLanding(s, { x: 0, s: -grade });
    assert.equal(s.speed, 30);
    assert.equal(s.heading, 0);
    assert.equal(s.landingSkid, 0);
  }
  const s = landing(0, Math.PI);
  resolveLanding(s, { x: 0, s: -.05 });
  assert.equal(s.speed, 30);
  assert.equal(s.heading, Math.PI);
  const hop = landing(0, Math.PI);
  hop.airtime = .08;
  resolveLanding(hop, { x: 0, s: -1 });
  assert.equal(hop.speed, 30, 'tiny contact hops retain the current carve');
  assert.equal(hop.heading, Math.PI);
});

test('a later uphill shoulder cannot strand the skier after the recovery timer expires', () => {
  const g = gradientAt(0, 50), downhill = -Math.atan2(-g.x, -g.s);
  const s = landing(0, downhill + Math.PI);
  Object.assign(s, { airborne: false, s: 50, speed: 1, landingRecovery: 0 });
  s.y = groundHeight(0, 50);
  for (let i = 0; i < 120; i++) step(s, { skate: true }, 1 / 120);
  const local = gradientAt(s.x, s.s);
  assert.ok(local.x * s.vx + local.s * s.vs < -1);
  assert.ok(s.speed > 1);
});

test('flat landings keep the existing skid and a new takeoff clears slope recovery', () => {
  const a = landing(.6), b = landing(.6);
  resolveLanding(a); resolveLanding(b);
  for (let i = 0; i < 60; i++) {
    advanceLandingSkid(a, 1 / 120);
    advanceLandingSkid(b, 1 / 120, { x: 0, s: 0 });
  }
  assert.equal(a.heading, b.heading);
  assert.equal(a.speed, b.speed);
  assert.ok(a.landingRecovery > 0);
  step(a, { pop: true }, 1 / 120);
  assert.equal(a.airborne, true);
  assert.equal(a.landingRecovery, 0);
});

test('airs up to 0.7 seconds have no landing drift, speed penalty, or skid spray on any slope', () => {
  for (const airtime of [.05, .2, .5, .69, .7]) for (const spin of [-1.4, -.6, 0, .6, 1.4]) {
    for (const g of [{ x: 0, s: 0 }, { x: 2, s: 0 }, { x: 0, s: -3 }]) {
      const s = landing(spin);
      s.airtime = airtime;
      resolveLanding(s, g);
      assert.equal(s.speed, 30);
      assert.equal(s.heading, 0);
      assert.equal(s.landingSkid, 0);
      assert.equal(s.landingRecovery, 0);
      assert.equal(s.landingSlopeInfluence, 0);
      // Even stale/rearmed recovery must not bypass the airtime gate.
      s.landingRecovery = 1;
      for (let i = 0; i < 120; i++) advanceLandingSkid(s, 1 / 120, g);
      assert.equal(s.heading, 0);
      assert.equal(s.speed, 30);
      assert.equal(s.landingSkid, 0);
      assert.ok(Math.abs(s.yawOffset) < .00002, 'only the visual ski alignment recovers');
    }
  }
});

test('small-air touchdown stays as controllable as an aligned landing through normal ground updates', () => {
  for (const hz of [30, 60, 120]) for (const speed of [2, 20, 50]) {
    const clean = landing(0), angled = landing(1.2);
    for (const s of [clean, angled]) {
      Object.assign(s, { airtime: .5, speed, vs: speed });
      step(s, {}, 1 / hz);
      assert.equal(s.airborne, false);
      assert.equal(s.landingSkid, 0);
    }
    for (let i = 0; i < hz / 2; i++) {
      step(clean, { steer: .3 }, 1 / hz);
      step(angled, { steer: .3 }, 1 / hz);
      for (const key of ['x', 's', 'speed', 'heading']) assert.equal(angled[key], clean[key], key);
    }
  }
});

test('drift ramps smoothly above 0.7 seconds and reaches full strength only for larger airs', () => {
  const times = [.7, .71, .8, 1, 1.3, 1.7, 3];
  const states = times.map(airtime => {
    const s = landing(1.1, Math.PI / 2);
    s.airtime = airtime;
    resolveLanding(s, { x: 0, s: -1 });
    return s;
  });
  assert.ok(states[1].speed > 29.99 && states[1].landingSkid < .001, 'no sudden penalty just above the threshold');
  for (let i = 1; i < states.length - 1; i++) {
    assert.ok(states[i].speed < states[i - 1].speed);
    assert.ok(states[i].landingSkid > states[i - 1].landingSkid);
  }
  assert.equal(states.at(-1).speed, states.at(-2).speed);
  assert.ok(landingDriftStrength(1) < .25);
});

test('large-air skids settle in about a second without snapping the trajectory', () => {
  for (const hz of [30, 60, 120]) {
    const s = landing(1.2);
    resolveLanding(s, { x: 0, s: -1 });
    for (let i = 0; i < Math.ceil(hz * 1.1); i++) {
      const heading = s.heading;
      advanceLandingSkid(s, 1 / hz, { x: 0, s: -1 });
      assert.ok(Math.abs(s.heading - heading) <= 2.2 / hz + 1e-8);
    }
    assert.equal(s.landingRecovery, 0);
    assert.ok(s.landingSkid < .04, 'the large-air skid should not linger');
  }
});
