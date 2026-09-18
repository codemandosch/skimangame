import test from 'node:test';
import assert from 'node:assert/strict';
import { groundHeight } from '../src/blackridge.js';

test('the lift hollow has a manageable elevation gap to the neighboring ridge', () => {
  // Equal-radius traverses from the lift toward the north ridge used to face
  // a 270–350 m climb. Keep the broad connection below a 55% average grade.
  for (const radius of [600, 800, 1000]) {
    const point = degrees => {
      const angle = degrees * Math.PI / 180;
      return { x: Math.sin(angle) * radius, s: Math.cos(angle) * radius };
    };
    const lift = point(54), ridge = point(30);
    const distance = Math.hypot(ridge.x - lift.x, ridge.s - lift.s);
    const climb = groundHeight(ridge.x, ridge.s) - groundHeight(lift.x, lift.s);
    assert.ok(climb < distance * .55, `radius ${radius}: ${climb.toFixed(1)} m climb over ${distance.toFixed(1)} m`);
  }
});

test('crossing from the lift to the left ridge avoids short cliff-like climbs', () => {
  for (const radius of [600, 800, 1000]) {
    const height = angle => groundHeight(Math.sin(angle) * radius, Math.cos(angle) * radius);
    // Twenty metres resolves the basin wall hidden by an endpoint-only check.
    for (let angle = 54 * Math.PI / 180; angle - 20 / radius >= Math.PI / 6; angle -= .2 * Math.PI / 180) {
      const grade = (height(angle - 20 / radius) - height(angle)) / 20;
      assert.ok(grade < .9, `radius ${radius}, angle ${angle * 180 / Math.PI}: ${grade.toFixed(2)} uphill grade`);
    }
  }
});
