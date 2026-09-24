import test from 'node:test';
import assert from 'node:assert/strict';
import { Euler, Quaternion, Vector3 } from 'three';
import { selectCourse, groundHeight } from '../src/course.js';
import { FEATURES } from '../src/blackridge.js';
import { createState, step, resolveLanding, respawn, trickValue } from '../src/physics.js';
import { riderFrame, FLIGHT_LEVEL_TIME } from '../src/rider-frame.js';
import { riderRotation } from '../src/aerial-rotation.js';

function orientation(s) {
  const frame = riderFrame(s);
  return new Quaternion().setFromEuler(new Euler(frame.pitch, s.heading, frame.roll, 'YXZ'))
    .multiply(riderRotation(s, new Quaternion()));
}

test('sidehill pops keep the ski attitude through takeoff, then settle level in neutral flight', () => {
  selectCourse('blackridge');
  try {
    const f = FEATURES.find(f => f.name === 'FIRST LIGHT');
    for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
      for (const side of [-1, 1]) for (const stanceYaw of [0, Math.PI]) {
        const s = createState();
        Object.assign(s, { x: f.x - f.dx * 20, s: f.s - f.ds * 20,
          heading: -f.angle + side * Math.PI / 2, speed: 18, started: true, stanceYaw });
        s.y = groundHeight(s.x, s.s);
        assert.ok(Math.abs(riderFrame(s).roll) > .1, 'exercise a visibly banked slope');
        const before = orientation(s);
        const underside = new Vector3(0, -1, 0).applyQuaternion(before);
        step(s, { pop: true }, dt);
        assert.ok(s.airborne);
        assert.ok(orientation(s).angleTo(before) < 1e-7, 'takeoff must not level the body');
        s.y += 100;
        let previous = orientation(s);
        for (let t = 0; t < FLIGHT_LEVEL_TIME + .1; t += dt) {
          step(s, {}, dt);
          const current = orientation(s);
          assert.ok(current.angleTo(previous) < 2.5 * dt, 'settling must not jolt the body');
          previous = current;
        }
        assert.ok(s.airborne);
        assert.ok(new Vector3(0, -1, 0).applyQuaternion(orientation(s)).distanceTo(new Vector3(0, -1, 0)) < 1e-8,
          'a neutral rider arrives level');
        assert.equal(trickValue(s).points, 0, 'slope tilt must not count as trick rotation');
        resolveLanding(s);
        assert.equal(s.takeoffFrame, null);
        respawn(s);
        assert.equal(s.takeoffFrame, null);
      }
    }
  } finally { selectCourse('bluebird'); }
});

test('charged slope pops add lift and push along the tilted body up axis in either stance', () => {
  selectCourse('blackridge');
  try {
    const f = FEATURES.find(f => f.name === 'FIRST LIGHT');
    for (const side of [-1, 1]) for (const stanceYaw of [0, Math.PI]) for (const dt of [1/30,1/60,1/120]) {
      const states = [0, 1].map(charge => {
        const s = createState();
        Object.assign(s, { x: f.x - f.dx * 20, s: f.s - f.ds * 20,
          heading: -f.angle + side * Math.PI / 2, speed: 18, started: true, charge, stanceYaw });
        s.y = groundHeight(s.x, s.s);
        step(s, { pop: true }, dt);
        return s;
      });
      const [tap, charged] = states;
      const up = new Vector3(0, 1, 0).applyQuaternion(orientation(tap));
      const push = new Vector3(charged.vx-tap.vx, 0, -(charged.vs-tap.vs));
      const tiltedUp = new Vector3(up.x, 0, up.z);
      assert.ok(push.length() > .1, 'charge adds a noticeable lateral impulse on a bank');
      assert.ok(push.clone().normalize().dot(tiltedUp.normalize()) > .999999,
        'the push follows the body tilt, including switch riding');
      assert.ok(Math.abs(charged.vy - Math.min(15, tap.vy + 3.25)) < 1e-8,
        'charge adds lift until the shared upward launch limit is reached');
    }
  } finally { selectCourse('bluebird'); }
});

test('holding up or down freezes the flight attitude instead of levelling it', () => {
  selectCourse('blackridge');
  try {
    const f = FEATURES.find(f => f.name === 'FIRST LIGHT');
    for (const flip of [-1, 1]) {
      const s = createState();
      Object.assign(s, { x: f.x - f.dx * 20, s: f.s - f.ds * 20,
        heading: -f.angle + Math.PI / 2, speed: 18, started: true });
      s.y = groundHeight(s.x, s.s);
      step(s, { pop: true }, 1 / 60);
      s.y += 100;
      const takeoff = riderFrame(s);
      for (let i = 0; i < 60; i++) step(s, { flip }, 1 / 60);
      assert.ok(Math.abs(riderFrame(s).roll - takeoff.roll) < 1e-12, 'held pitch keeps the lip attitude');
      for (let i = 0; i < 90; i++) step(s, {}, 1 / 60);
      assert.ok(Math.abs(riderFrame(s).roll) < 1e-12, 'released, the body settles level');
    }
  } finally { selectCourse('bluebird'); }
});
