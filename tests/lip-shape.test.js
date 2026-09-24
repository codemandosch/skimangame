import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, LOGS, groundHeight, lipCoordinates, featureCoordinates } from '../src/blackridge.js';

const natural = FEATURES.filter(f => !f.lift && !f.parkLine);
// Walk along a lip's curved crest: points where lip u = 0 at lateral offset v.
function crestPoint(f, v) {
  let x = f.x + f.ds * v, s = f.s - f.dx * v;
  for (let i = 0; i < 4; i++) {
    const { u } = lipCoordinates(f, x, s);
    x -= f.dx * u; s -= f.ds * u;
  }
  return { x, s };
}

test('natural lips keep their centre-line crest, and lift kickers stay straight', () => {
  for (const f of natural) assert.ok(Math.abs(lipCoordinates(f, f.x, f.s).u) < 1e-9, f.name);
  for (const f of FEATURES.filter(f => f.lift)) {
    const x = f.x + f.ds * f.width * .8, s = f.s - f.dx * f.width * .8;
    assert.equal(lipCoordinates(f, x, s).u, featureCoordinates(f, x, s).u, f.name);
  }
});

test('lip lines curve differently from one natural lip to the next', () => {
  const ends = natural.map(f => lipCoordinates(f, f.x + f.ds * f.width * .8, f.s - f.dx * f.width * .8).u / f.width);
  assert.ok(ends.some(e => e > .03) && ends.some(e => e < -.03), 'some lips bow forward, some back');
  const distinct = new Set(ends.map(e => e.toFixed(6)));
  assert.ok(distinct.size > natural.length * .9, 'each lip has its own shape');
});

test('lip crests are smooth along their length instead of saw-toothed', () => {
  // Second difference of crest height at 1 m spacing; the old hard crease
  // measured up to 1.9 m on the big cliffs and 1.35 m on small lips.
  // Ledges carrying timber deliberately keep their original shape.
  const nearLog = p => LOGS.some(log => {
    const ox = p.x - log.x, os = p.s - log.s, u = ox * log.dx + os * log.ds, v = ox * log.ds - os * log.dx;
    return Math.abs(v) < 16 && u > -34 && u < log.length + 18;
  });
  const sample = natural.filter((_, i) => i % 4 === 0);
  let worst = 0, name = '';
  for (const f of sample) for (let v = -f.width * .55; v <= f.width * .55; v += .5) {
    if ([v - 1, v, v + 1].some(w => nearLog(crestPoint(f, w)))) continue;
    const [a, b, c] = [v - 1, v, v + 1].map(w => { const p = crestPoint(f, w); return groundHeight(p.x, p.s); });
    const bump = Math.abs(a - 2 * b + c);
    if (bump > worst) { worst = bump; name = f.name; }
  }
  assert.ok(worst < 1, `crest roughness ${worst.toFixed(2)} m at ${name}`);
});
