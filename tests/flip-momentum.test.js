import test from "node:test";
import assert from "node:assert/strict";
import { createState, step, respawn, resolveLanding } from "../src/physics.js";
import { groundHeight, JUMPS } from "../src/course.js";

function tick(s, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 120); i++) step(s, input, 1 / 120);
}

function launchAloft(s, flip = 0) {
  s.charge = 1;
  step(s, { flip, pop: true }, 1 / 120);
  // Rotation checks need sustained airtime, independent of course fixtures.
  s.y += 1000;
}

test("takeoff flip momentum resists immediate opposite input in both directions", () => {
  for (const direction of [-1, 1]) {
    const s = createState();
    launchAloft(s, direction);
    assert.ok(s.flipVelocity * direction > 4);
    tick(s, 0.3, { flip: -direction });
    assert.ok(s.flip * direction > 0.8);
    assert.ok(s.flipVelocity * direction > 2);
    // The faster launch needs longer to reverse with the same air control.
    tick(s, 1.5, { flip: -direction });
    assert.ok(s.airborne);
    assert.ok(s.flipVelocity * direction < 0, "sustained opposite input can reverse the flip after slowing its momentum");
  }
});

test("automatic ramp takeoff captures the direction held at the lip", () => {
  const s = createState(), ramp = JUMPS[0];
  s.s = ramp.lip - 0.05;
  s.x = ramp.x;
  s.y = groundHeight(s.x, s.s);
  step(s, { flip: -1 }, 1 / 120);
  assert.ok(s.airborne);
  assert.ok(s.flipVelocity < -4);
});

test("early takeoff input is stronger than a flip started well into the jump", () => {
  const early = createState(), late = createState();
  for (const s of [early, late]) {
    s.charge = 1;
    step(s, { pop: true }, 1 / 120);
  }
  tick(early, 0.1, { flip: 1 });
  tick(late, 0.3);
  tick(late, 0.1, { flip: 1 });
  assert.ok(early.flipVelocity > late.flipVelocity * 5);
});

test("releasing flip coasts smoothly to rest without seeking a level angle", () => {
  const s = createState();
  launchAloft(s, 1);
  tick(s, 0.15, { flip: 1 });
  const angle = s.flip, velocity = s.flipVelocity;
  step(s, {}, 1 / 120);
  assert.ok(s.flip > angle);
  assert.ok(s.flipVelocity > 0 && s.flipVelocity < velocity);
  tick(s, 0.95);
  const held = s.flip;
  assert.ok(held > 0.8 && held < 1.5);
  tick(s, 0.25, { spin: 1, grab: 1 });
  assert.equal(s.flip, held);
});

test("pause preserves momentum, and landing and respawn clear it", () => {
  const s = createState();
  step(s, { pop: true, flip: -1 }, 1 / 120);
  s.paused = true;
  const velocity = s.flipVelocity;
  tick(s, 0.5, { flip: 1 });
  assert.equal(s.flipVelocity, velocity);
  s.paused = false;
  resolveLanding(s);
  assert.equal(s.flipVelocity, 0);
  step(s, { pop: true, flip: 1 }, 1 / 120);
  respawn(s);
  assert.equal(s.flipVelocity, 0);
});
