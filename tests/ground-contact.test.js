import test from 'node:test';
import assert from 'node:assert/strict';
import { groundContact } from '../src/ground-contact.js';
import { selectCourse, groundHeight } from '../src/course.js';
import { FEATURES } from '../src/blackridge.js';
import { createState, step } from '../src/physics.js';

test('fast convex crests release while slow skiing and gentle rollers retain grip', () => {
  const crest = (x, s) => -.3 * s - .04 * s * s;
  for (const dt of [1/30, 1/60, 1/120, 1/240]) {
    assert.equal(groundContact(0, 0, 0, 40, dt, crest).release, true);
    assert.equal(groundContact(0, 0, 0, 12, dt, crest).release, false);
    // Gravity alone would release at this curvature; adhesion holds it.
    const roller = (x, s) => -.3 * s - .009 * s * s;
    assert.equal(groundContact(0, 0, 0, 40, dt, roller).release, false);
  }
});

test('steep planar slopes and concave landings keep contact in every direction', () => {
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8;
    const vx = Math.sin(angle) * 56, vs = Math.cos(angle) * 56;
    for (const dt of [1/30, 1/120, 1/240]) {
      assert.equal(groundContact(12, -7, vx, vs, dt, (x, s) => 1.8*x - 2.1*s).release, false);
      assert.equal(groundContact(0, 0, vx, vs, dt, (x, s) => .1*(x*x+s*s)).release, false);
    }
  }
});

test('small convex changes on a very steep descent do not trigger an automatic pop', () => {
  const steepFace = (x, s) => -1.8*s - .04*s*s;
  for (const speed of [24, 40, 56]) for (const dt of [1/30, 1/60, 1/120, 1/240]) {
    assert.equal(groundContact(0, 0, 0, speed, dt, steepFace).release, false);
  }
});

test('leaving a ledge carries the approach momentum instead of following the drop', () => {
  for (const slope of [-.4, 0, .2]) {
    const ledge = (x, s) => slope*s - 1.5*Math.max(0, s);
    for (const dt of [1/30, 1/60, 1/120, 1/240]) {
      const contact = groundContact(0, 0, 0, 40, dt, ledge);
      assert.equal(contact.release, true);
      assert.equal(contact.vy, slope*40);
    }
  }
});

test('stationary skiers cannot launch from a crest', () => {
  assert.deepEqual(groundContact(0, 0, 0, 0, 1/120, (x, s) => -s*s), {release:false, vy:0});
});

test('an unpopped mountain ledge gives sustained flight and a clean landing across frame rates', () => {
  selectCourse('blackridge');
  try {
    const f = FEATURES.find(feature => feature.name === 'FIRST LIGHT');
    const takeoffs = [];
    for (const dt of [1/30, 1/60, 1/120, 1/240]) {
      const s = createState();
      Object.assign(s, {x:f.x-f.dx*15, s:f.s-f.ds*15, heading:-f.angle, speed:40, started:true});
      s.y = groundHeight(s.x, s.s);
      let takeoff = null, maxHeight = 0;
      for (let t = 0; t < 12; t += dt) {
        const wasAirborne = s.airborne;
        step(s, {}, dt);
        if (!wasAirborne && s.airborne && takeoff === null) {
          takeoff = {x:s.x, s:s.s};
          takeoffs.push(s.s);
        }
        maxHeight = Math.max(maxHeight, s.airHeight);
        if (wasAirborne && !s.airborne) break;
      }
      assert.ok(takeoff, 'must leave the ledge without a pop');
      assert.ok(maxHeight > 2, 'must clear the face rather than flicker airborne');
      assert.ok(s.airtime > .5);
      assert.equal(s.airborne, false, 'must land');
      assert.equal(s.bailTimer, 0, 'upright landing must be clean');
    }
    assert.ok(Math.max(...takeoffs)-Math.min(...takeoffs) < 2, 'takeoff positions stay within one ski length');
  } finally {
    selectCourse('bluebird');
  }
});
