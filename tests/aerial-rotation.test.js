import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { createState, step, resolveLanding, respawn, trickValue } from '../src/physics.js';
import { selectCourse } from '../src/course.js';
import { aerialLanding, riderRotation } from '../src/aerial-rotation.js';

function launch(spin, flip) {
  const s = createState();
  step(s, { pop: true, spin, flip }, 1 / 120);
  s.y += 10000;
  return s;
}
function fly(s, time, input, hz = 120) {
  for (let i = 0; i < Math.round(time * hz); i++) step(s, input, 1 / hz);
}

test('all diagonal takeoffs follow one spin-dominant axis on both courses', () => {
  try {
    for (const course of ['bluebird', 'blackridge']) {
      selectCourse(course);
      for (const spin of [-1, 1]) for (const flip of [-1, 1]) {
        const s = launch(spin, flip);
        assert.ok(Math.abs(s.spinVelocity) > Math.abs(s.flipVelocity) * 1.7);
        const axis = new Vector3(-s.flipVelocity, -s.spinVelocity, 0).normalize();
        const speed = Math.hypot(s.flipVelocity, s.spinVelocity);
        for (let i = 1; i <= 240; i++) {
          step(s, { spin, flip }, 1 / 120);
          const expected = new Quaternion().setFromAxisAngle(axis, speed * i / 120);
          assert.ok(s.airRotation.angleTo(expected) < 1e-6, 'no Euler wobble through multiple revolutions');
          assert.ok(new Vector3(0, 1, 0).applyQuaternion(s.airRotation).y > 0.5,
            'diagonal input produces a cork instead of repeated somersaults');
        }
        assert.ok(s.flipTravel < Math.PI / 2);
        assert.doesNotMatch(trickValue(s).name, /FLIP/);
      }
    }
  } finally { selectCourse('bluebird'); }
});

test('a full cork returns upright, counts 360, and lands in its actual stance', () => {
  for (const spin of [-1, 1]) for (const flip of [-1, 1]) for (const backwards of [false, true]) {
    const s = launch(spin, flip);
    s.stanceYaw = backwards ? Math.PI : 0;
    s.switch = s.takeoffSwitch = backwards;
    const period = Math.PI * 2 / Math.hypot(s.flipVelocity, s.spinVelocity);
    fly(s, period, { spin, flip });
    assert.ok(s.airRotation.angleTo(new Quaternion()) < 0.03);
    assert.match(trickValue(s).name, /360/);
    assert.doesNotMatch(trickValue(s).name, /FLIP/);
    resolveLanding(s);
    assert.equal(s.bailTimer, 0);
    assert.equal(s.switch, backwards);
    assert.equal(s.airRotation, null);
  }
});

test('landing uses visible tilt and heading instead of accumulated input angles', () => {
  const s = launch(1, -1);
  fly(s, 1.3, { spin: 1, flip: -1 });
  assert.ok(Math.cos(s.flip) < 0, 'old independent flip counter would reject this landing');
  const before = riderRotation(s, new Quaternion());
  const forward = new Vector3(0, 0, -1).applyQuaternion(before);
  const visibleYaw = Math.atan2(forward.x, -forward.z);
  const worldYaw = s.heading - visibleYaw;
  assert.ok(aerialLanding(s).upright);
  resolveLanding(s);
  assert.equal(s.bailTimer, 0);
  // A directional pop can change the travel heading adopted on landing.
  // Compare the visible world orientation across that heading change.
  assert.ok(Math.abs(Math.sin(s.heading - s.stanceYaw - s.yawOffset - worldYaw)) < 1e-8);

  const inverted = launch(0, 1);
  fly(inverted, Math.PI / inverted.flipVelocity, { flip: 1 });
  assert.ok(!aerialLanding(inverted).upright);
  resolveLanding(inverted);
  assert.ok(inverted.bailTimer > 0);
});

test('staggered diagonal inputs during the grace window use the same launch rates', () => {
  for (const spin of [-1, 1]) for (const flip of [-1, 1]) {
    const together = launch(spin, flip);
    for (const initial of [{ spin }, { flip }, {}]) {
      const s = launch(initial.spin || 0, initial.flip || 0);
      fly(s, 0.05, initial);
      step(s, { spin, flip }, 1 / 120);
      assert.ok(Math.abs(s.flipVelocity - together.flipVelocity) < 1e-8);
      assert.ok(Math.abs(s.spinVelocity - together.spinVelocity) < 1e-8);
    }
  }
});

test('releasing a cork coasts to rest, preserves orientation, and resets on respawn', () => {
  const s = launch(-1, -1);
  fly(s, 0.3, { spin: -1, flip: -1 });
  const before = s.airRotation.clone();
  step(s, {}, 1 / 120);
  assert.ok(s.airRotation.angleTo(before) > 0.01);
  assert.ok(s.airRotation.angleTo(before) < 0.05);
  fly(s, 1.5, {});
  const stopped = s.airRotation.clone();
  fly(s, 1, {});
  assert.ok(s.airRotation.angleTo(stopped) < 1e-7);
  assert.ok(s.airRotation.angleTo(new Quaternion()) > 1);
  s.paused = true;
  fly(s, 1, { spin: 1, flip: 1 });
  assert.ok(s.airRotation.angleTo(stopped) < 1e-7);
  respawn(s);
  assert.equal(s.airRotation, null);
});

test('releasing only the flip preserves tilt while continuing the spin', () => {
  const s = launch(1, -1);
  fly(s, 0.4, { spin: 1, flip: -1 });
  fly(s, 1.2, { spin: 1 });
  const tilt = new Vector3(0, 1, 0).applyQuaternion(s.airRotation).y;
  fly(s, 0.5, { spin: 1 });
  assert.ok(Math.abs(new Vector3(0, 1, 0).applyQuaternion(s.airRotation).y - tilt) < 1e-8);
});

test('mixed reversals and releases remain smooth and independent of frame rate', () => {
  const results = [30, 60, 120].map(hz => {
    const s = launch(1, -1);
    fly(s, 0.5, { spin: 1, flip: -1 }, hz);
    fly(s, 0.5, { spin: -1, flip: 1 }, hz);
    fly(s, 0.5, {}, hz);
    return s.airRotation;
  });
  // Preserve the relative integration tolerance at the 15% higher speed.
  for (const rotation of results) assert.ok(rotation.angleTo(results[2]) < 0.07 * 1.15);
});

test('pure flips and spins retain full speed without introducing the other rotation', () => {
  for (const direction of [-1, 1]) for (const type of ['flip', 'spin']) {
    const s = launch(type === 'spin' ? direction : 0, type === 'flip' ? direction : 0);
    assert.equal(Math.abs(s[`${type}Velocity`]), (type === 'spin' ? 4.7 : 4.3) * 1.15);
    fly(s, 2, { [type]: direction });
    assert.equal(s[type === 'spin' ? 'flipTravel' : 'spinTravel'], 0);
    assert.ok(s[type === 'spin' ? 'spinTravel' : 'flipTravel'] > Math.PI * 2);
  }
});
