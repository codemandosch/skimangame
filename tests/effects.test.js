import test from "node:test";
import assert from "node:assert/strict";
import { landingSprayCount, snowSprayRate } from "../src/effects.js";

test("snow spray stops at rest and rises with speed and carving", () => {
  assert.equal(snowSprayRate({ speed: 0, steer: 1, airborne: false }), 0);
  const slow = snowSprayRate({ speed: 8, steer: 0, airborne: false });
  const fast = snowSprayRate({ speed: 32, steer: 0, airborne: false });
  const carving = snowSprayRate({ speed: 32, steer: 1, airborne: false });
  assert.ok(slow > 0);
  assert.ok(fast > slow);
  assert.ok(carving > fast);
  assert.equal(snowSprayRate({ speed: 32, steer: 1, airborne: true }), 0);
});

test("clean landings produce a large speed-sensitive burst", () => {
  const slow = landingSprayCount({ speed: 8, landingPulse: 0.15 });
  const fast = landingSprayCount({ speed: 38, landingPulse: 0.5 });
  assert.ok(slow >= 170);
  assert.ok(fast > slow);
  assert.ok(fast >= 300);
});
