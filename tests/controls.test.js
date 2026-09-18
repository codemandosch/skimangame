import test from "node:test";
import assert from "node:assert/strict";
import * as controls from "../src/controls.js";
import { createState, step } from "../src/physics.js";
import { selectCourse } from "../src/course.js";
import { prepareRun, startRun } from "../src/run-start.js";

const { keyboardInput } = controls;

test("S selects Octo without charging, steering, or popping", () => {
  const keys = new Set(["KeyS"]);
  const input = keyboardInput(keys);
  assert.equal(input.grab, 4);
  assert.equal(input.charge, false);
  assert.equal("boost" in input, false);
  assert.equal(input.steer, 0);
  assert.equal(input.flip, 0);
  assert.equal(controls.releaseKey(keys, "KeyS"), false);
});

test("releasing steering or grab keys never pops while Space remains held", () => {
  for (const code of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyQ", "KeyW", "KeyE"]) {
    const keys = new Set(["Space", code]);
    assert.equal(controls.releaseKey(keys, code), false);
    assert.equal(keyboardInput(keys).charge, true);
    assert.equal(controls.releaseKey(keys, "Space"), true);
    assert.equal(controls.releaseKey(keys, "Space"), false);
  }
});

test("arrow keys steer on snow and control spins and flips at takeoff", () => {
  for (const [horizontal, vertical, direction] of [
    ["ArrowRight", "ArrowUp", 1], ["ArrowLeft", "ArrowDown", -1],
  ]) {
    const input = keyboardInput(new Set([horizontal, vertical]), true);
    assert.equal(input.steer, direction);
    assert.equal(input.spin, direction);
    assert.equal(input.flip, direction);
    assert.equal(input.tuck, false);
    assert.equal(input.brake, false);
    const s = createState();
    step(s, input, 1 / 120);
    assert.ok(s.vx * direction > 0);
    assert.ok(s.flipVelocity * direction > 2);
    assert.ok(Math.abs(s.spinVelocity) > Math.abs(s.flipVelocity) * 1.7);
    step(s, { ...input, pop: false }, 1 / 120);
    assert.ok(s.spin * direction > 0);
    assert.ok(s.flip * direction > 0);
  }
});

test("IJKL mirrors the arrow controls", () => {
  for (const [horizontal, vertical, direction] of [
    ["KeyL", "KeyI", 1], ["KeyJ", "KeyK", -1],
  ]) {
    const input = keyboardInput(new Set([horizontal, vertical]));
    assert.equal(input.steer, direction);
    assert.equal(input.spin, direction);
    assert.equal(input.flip, direction);
    assert.equal(input.tuck, false);
    assert.equal(input.brake, false);
  }
});

test("Space charges and tucks for slightly more speed without starting a rotation", () => {
  for (const code of ["Space"]) {
    const input = keyboardInput(new Set([code]));
    assert.equal(input.charge, true);
    assert.equal(input.tuck, true);
    assert.equal("boost" in input, false);
    assert.equal(input.flip, 0);
    assert.equal(input.spin, 0);
    const s = createState(), coasting = createState();
    for (let i = 0; i < 90; i++) step(s, input, 1 / 120);
    assert.ok(s.charge > 0.9);
    for (let i = 0; i < 90; i++) step(coasting, {}, 1 / 120);
    assert.ok(s.tucking);
    assert.ok(s.speed > coasting.speed);
    assert.ok(s.speed < coasting.speed * 1.1);
  }
});

test('holding either flip direction preserves approach speed and rotates immediately on pop', () => {
  try {
    for (const map of ['bluebird', 'blackridge']) {
      selectCourse(map);
      for (const [code, direction] of [['ArrowUp', 1], ['ArrowDown', -1], ['KeyI', 1], ['KeyK', -1]]) {
        for (const tuck of [false, true]) {
          const s = createState(), reference = createState();
          for (const state of [s, reference]) {
            prepareRun(state, () => 0);
            startRun(state);
          }
          const keys = new Set(tuck ? ['Space', code] : [code]);
          const referenceKeys = new Set(tuck ? ['Space'] : []);
          for (let i = 0; i < 60; i++) {
            step(s, keyboardInput(keys), 1 / 120);
            step(reference, keyboardInput(referenceKeys), 1 / 120);
          }
          assert.equal(s.airborne, false);
          assert.equal(s.speed, reference.speed);
          assert.equal(s.tucking, tuck);
          assert.equal(s.braking, false);
          keys.delete('Space');
          step(s, keyboardInput(keys, true), 1 / 120);
          assert.equal(s.airborne, true);
          assert.ok(s.flipVelocity * direction > 4);
          assert.equal(s.tucking, false);
        }
      }
    }
  } finally {
    selectCourse('bluebird');
  }
});

test("releasing Space launches the charged jump", () => {
  assert.equal(typeof controls.releaseKey, "function");
  for (const code of ["Space"]) {
    const keys = new Set([code]);
    const s = createState();
    for (let i = 0; i < 120; i++) step(s, keyboardInput(keys), 1 / 120);
    const pop = controls.releaseKey(keys, code);
    step(s, keyboardInput(keys, pop), 1 / 120);
    assert.equal(s.airborne, true);
    assert.ok(s.vy > 8 && s.vy < 9);
    assert.equal(s.charge, 0);
    assert.equal(controls.releaseKey(keys, code), false, "duplicate releases do not jump");
  }
});

test("W grabs mute without charging or popping, independently of Space", () => {
  const keys = new Set(["KeyW"]);
  assert.equal(keyboardInput(keys).grab, 1);
  assert.equal(keyboardInput(keys).charge, false);
  assert.equal("boost" in keyboardInput(keys), false);
  assert.equal(controls.releaseKey(keys, "KeyW"), false);
  keys.add("KeyW"); keys.add("Space");
  assert.equal(controls.releaseKey(keys, "KeyW"), false);
  assert.equal(keyboardInput(keys).charge, true);
  keys.add("KeyW");
  assert.equal(controls.releaseKey(keys, "Space"), true);
  assert.equal(keyboardInput(keys).grab, 1);
  assert.equal(keyboardInput(keys).charge, false);
});

test("charging and popping need no resource meter", () => {
  assert.equal(typeof controls.releaseKey, "function");
  const keys = new Set(["Space"]);
  const s = createState();
  for (let i = 0; i < 120; i++) step(s, keyboardInput(keys), 1 / 120);
  assert.equal("boost" in s, false);
  assert.equal(s.charge, 1);
  step(s, keyboardInput(keys, controls.releaseKey(keys, "Space")), 1 / 120);
  assert.equal(s.airborne, true);
  assert.ok(s.vy > 8 && s.vy < 9);
});

test("Japan and Shift do not affect steering or charge", () => {
  const input = keyboardInput(new Set(["KeyD", "ShiftLeft", "ShiftRight"]));
  assert.equal(input.grab, 5);
  assert.equal(input.steer, 0);
  assert.equal(input.spin, 0);
  assert.equal(input.flip, 0);
  assert.equal("boost" in input, false);
  assert.equal(input.brake, false);
  assert.equal(input.daffy, false);
});
