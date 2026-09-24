import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, step, resolveLanding, respawn, trickValue } from '../src/physics.js';
import { selectCourse } from '../src/course.js';
import { SLIDE_FEATURES, logPoint } from '../src/log-layout.js';
import { getLiftLayout, cablePoint } from '../src/lift-layout.js';
import { TREES, groundHeight } from '../src/blackridge.js';

const dt = 1 / 120;
function catchRail(kind, tricks = {}) {
  selectCourse('blackridge');
  const s = createState();
  let p, dx, ds, heading;
  if (kind === 'cable') {
    const l = getLiftLayout(), i = Math.floor(l.towers.length / 2);
    p = cablePoint(l, 0, (l.towers[i].u + l.towers[i + 1].u) / 2);
    ({ dx, ds, heading } = l);
  } else {
    const log = SLIDE_FEATURES.find(l => l.kind === 'fallen');
    p = logPoint(log, log.length * .3);
    ({ dx, ds, heading } = log);
    p.grade = log.grade;
  }
  Object.assign(s, { x:p.x, s:p.s, y:p.y + .12, vy:p.grade * 27 - 10,
    speed:27, vx:dx * 27, vs:ds * 27, heading, started:true,
    airborne:true, airtime:.4 }, tricks);
  for (let i = 0; i < 8 && !s.railing; i++) step(s, {}, dt);
  assert.ok(s.railing, `${kind} fixture catches`);
  return s;
}

test('rail distance awards stop at 1000 points for every slide type', () => {
  for (const kind of ['log', 'cable']) {
    const s = catchRail(kind);
    for (const [distance, points] of [[25, 500], [50, 1000], [500, 1000]]) {
      s.trickChain.distance = distance;
      assert.equal(trickValue(s).points, points, `${kind} at ${distance} metres`);
    }
  }
});

test('the rail cap survives continued sliding and cable reconnection until banking', () => {
  const s = catchRail('cable');
  s.trickChain.distance = 49.9;
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  assert.equal(s.combo, 1000);
  step(s, { pop:true }, dt);
  for (let i = 0; i < 600 && !s.railing && s.airborne; i++) step(s, {}, dt);
  assert.ok(s.railing);
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  assert.equal(s.combo, 1000);
  step(s, { pop:true }, dt);
  resolveLanding(s);
  assert.equal(s.score, 1000);
});

test('capped rail distance still combines with flips, spins and grabs', () => {
  const s = catchRail('log', { flipTravel:Math.PI * 2, flip:Math.PI * 2 });
  s.trickChain.distance = 500;
  step(s, { pop:true }, dt);
  Object.assign(s, { spinTravel:Math.PI, grabTime:.5, grabs:new Set([1]) });
  // Capped rail 1000 + flip 600 + spin 180 + grab 210, multiplied by 2.5.
  assert.equal(trickValue(s).points, 4975);
  resolveLanding(s);
  assert.equal(s.score, 4975);
});

for (const kind of ['log', 'cable']) {
  test(`${kind} distance builds points, survives dismount and banks on snow`, () => {
    const s = catchRail(kind);
    for (let i = 0; i < 24; i++) step(s, {}, dt);
    assert.ok(s.combo > 0, 'sliding earns pending points');
    assert.equal(s.score, 0, 'bank only after landing on snow');
    const points = s.combo;
    step(s, { pop:true }, dt);
    assert.equal(s.combo, points, 'dismount retains the rail score');
    resolveLanding(s);
    assert.equal(s.score, points);
    assert.equal(s.lastPoints, points);
    assert.match(s.lastTrick, /SLIDE/);
    assert.equal(s.combo, 0);
  });
}

test('incoming flips and outgoing spins and grabs share the rail combo multiplier', () => {
  const s = catchRail('log', { flipTravel:Math.PI * 2, flip:Math.PI * 2 });
  assert.equal(s.score, 0, 'catching a rail must not bank the incoming flip');
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  const railDistance = s.rail.distance;
  step(s, { pop:true }, dt);
  Object.assign(s, { spinTravel:Math.PI, grabTime:.5, grabs:new Set([1]) });
  const trick = trickValue(s);
  // Flip 600 + spin 180 + grab 210 + 20 points/metre, four categories => 2.5x.
  assert.equal(trick.points, Math.round((990 + Math.floor(railDistance * 20)) * 2.5));
  for (const label of [/FRONTFLIP/, /180/, /MUTE GRAB/, /LOG SLIDE/]) assert.match(trick.name, label);
  resolveLanding(s);
  assert.equal(s.score, trick.points);
  step(s, { pop:true }, dt);
  assert.equal(trickValue(s).points, 0, 'next jump starts fresh');
});

test('completed rail 180s add spin credit but partial turns do not', () => {
  const s = catchRail('cable');
  step(s, { steer:1 }, dt);
  assert.doesNotMatch(s.comboName, /RAIL 180/);
  for (let i = 0; i < 55; i++) step(s, { steer:1 }, dt);
  assert.match(s.comboName, /RAIL 180/);
  assert.equal(s.combo, Math.round((Math.floor(s.rail.distance * 20) + 180) * 1.5));
});

test('wipeouts discard the whole rail chain and respawn clears pending points', () => {
  const s = catchRail('log');
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  assert.ok(s.combo > 0);
  step(s, { pop:true }, dt);
  s.flip = Math.PI;
  resolveLanding(s);
  assert.equal(s.score, 0);
  assert.equal(s.combo, 0);
  assert.equal(trickValue(s).points, 0);
  const reset = catchRail('cable');
  for (let i = 0; i < 24; i++) step(reset, {}, dt);
  respawn(reset);
  assert.equal(reset.combo, 0);
  assert.equal(trickValue(reset).points, 0);
});

test('popping and reconnecting a cable preserves the chain without banking or duplicating tricks', () => {
  const s = catchRail('cable', { flipTravel:Math.PI * 2, flip:Math.PI * 2 });
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  const points = s.combo;
  step(s, { pop:true }, dt);
  for (let i = 0; i < 600 && !s.railing && s.airborne; i++) step(s, {}, dt);
  assert.ok(s.railing, 'pop reconnects with the cable');
  assert.equal(s.score, 0);
  assert.equal(s.combo, points, 'incoming flip and distance counted once');
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  assert.ok(s.combo > points);
  assert.equal(s.comboMultiplier, 1.5, 'reconnection alone does not inflate multiplier');
});

test('natural log exits count the final slide step and bank through real snow contact', () => {
  for (const hz of [30, 60, 120]) {
    const s = catchRail('log'), rail = s.rail;
    for (let i = 0; i < hz * 4 && s.railing; i++) step(s, {}, 1 / hz);
    assert.ok(s.airborne && !s.railing);
    const points = Math.floor(rail.distance * 20);
    assert.equal(s.combo, points);
    for (let i = 0; i < hz * 12 && s.airborne; i++) step(s, {}, 1 / hz);
    assert.equal(s.airborne, false);
    assert.equal(s.bailTimer, 0);
    assert.equal(s.score, points);
    assert.match(s.messageDetail, /LOG SLIDE/);
  }
});

test('tower strikes immediately discard rail points and cannot bank them later', () => {
  const s = catchRail('cable');
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  assert.ok(s.combo > 0);
  for (let i = 0; i < 2400 && s.railing; i++) step(s, {}, dt);
  assert.ok(s.railCrash);
  assert.equal(s.combo, 0);
  assert.equal(s.score, 0);
  for (let i = 0; i < 2400 && s.airborne; i++) step(s, {}, dt);
  assert.equal(s.airborne, false);
  assert.equal(s.score, 0);
});

test('landing on a tree loses the pending rail combo instead of banking before the strike', () => {
  const s = catchRail('log', { flipTravel:Math.PI * 2, flip:Math.PI * 2 });
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  step(s, { pop:true }, dt);
  const tree = TREES[0];
  Object.assign(s, { x:tree.x, s:tree.s, y:groundHeight(tree.x, tree.s) + .01,
    vx:0, vs:0, vy:-10, airtime:1 });
  step(s, {}, dt);
  assert.equal(s.eventType, 'bail');
  assert.equal(s.score, 0);
  assert.equal(s.combo, 0);
});

test('snow entry onto a log starts fresh after a previously banked trick', () => {
  selectCourse('blackridge');
  const s = createState();
  Object.assign(s, { airborne:true, flipTravel:Math.PI * 2, flip:Math.PI * 2, airtime:1 });
  resolveLanding(s);
  assert.equal(s.score, 600);
  const log = SLIDE_FEATURES.find(l => l.kind === 'fallen'), p = logPoint(log, log.length * .3);
  Object.assign(s, { x:p.x, s:p.s, y:groundHeight(p.x,p.s), heading:log.heading,
    speed:1, vx:log.dx, vs:log.ds, started:true });
  step(s, {}, dt);
  assert.ok(s.railing);
  for (let i = 0; i < 24; i++) step(s, {}, dt);
  assert.equal(s.score, 600);
  assert.equal(s.combo, Math.floor(s.rail.distance * 20));
  assert.equal(s.comboMultiplier, 1);
  assert.doesNotMatch(s.comboName, /FLIP/);
});
