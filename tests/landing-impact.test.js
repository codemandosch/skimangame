import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createState, resolveLanding, step, respawn } from '../src/physics.js';
import { groundHeight } from '../src/course.js';
import { captureLandingImpact, landingSink } from '../src/landing-impact.js';
import { createEffects, landingSprayCount } from '../src/effects.js';
import { snowLaunch } from '../src/snow-dynamics.js';

function touchdown(airtime = 3) {
  const s = createState();
  Object.assign(s, { x: 0, s: 30, y: groundHeight(0, 30), time: 10,
    started: true, airborne: true, airtime, speed: 30, vs: 30, vy: -30 });
  resolveLanding(s);
  return s;
}

test('big-air powder compression sinks and recovers without affecting simulation motion', () => {
  const s = touchdown(), control = structuredClone(s);
  control.landingImpact = null;
  assert.ok(landingSink(s) > .1);
  assert.ok(landingSink({ ...s, time: 10.065 }) > .25);
  assert.equal(landingSink({ ...s, time: 11 }), 0);
  for (const flag of ['airborne', 'railing']) assert.equal(landingSink({ ...s, [flag]: true }), 0);
  assert.equal(landingSink({ ...s, bailTimer: 1 }), 0);
  for (let i = 0; i < 120; i++) {
    step(s, {}, 1 / 120); step(control, {}, 1 / 120);
    for (const key of ['x', 'y', 's', 'speed', 'vx', 'vy', 'vs', 'heading']) assert.equal(s[key], control[key], key);
  }
  respawn(s);
  assert.equal(s.landingImpact, null);
});

test('small hops stay light; big airs throw more, higher and wider powder', () => {
  const hop = touchdown(.6), big = touchdown();
  assert.equal(landingSink(hop), 0);
  assert.ok(landingSprayCount(big) > landingSprayCount(hop) * 2);
  const a = snowLaunch(hop, 1, true, () => .5), b = snowLaunch(big, 1, true, () => .5);
  assert.ok(b.vx > a.vx && b.vy > a.vy && b.life > a.life && b.size > a.size);
  assert.ok(captureLandingImpact(big, 1).strength < captureLandingImpact(big, 0).strength);
});

test('landing stamps one persistent crater at touchdown, follows the slope and clears on reset', () => {
  const scene = new THREE.Scene(), effects = createEffects(scene), s = touchdown();
  // Rendering can happen several physics steps after actual touchdown.
  const rendered = Object.freeze({ ...s, s: s.s + 1, time: s.time + .033 });
  effects.update(rendered, 1 / 60);
  const craters = () => scene.children.filter(o => o.name.startsWith('Landing crater'));
  assert.equal(craters().length, 1);
  const crater = craters()[0], p = crater.geometry.attributes.position;
  assert.ok(Math.abs(p.getZ(0) + s.s) < .001);
  let highest = 0;
  for (let i = 0; i < p.count; i++) {
    const offset = p.getY(i) - groundHeight(p.getX(i), -p.getZ(i));
    assert.ok(offset > .01 && offset < .3);
    highest = Math.max(highest, offset);
  }
  assert.ok(highest > .2, 'powder rim rises above the packed center');
  effects.update({ ...rendered, time: 12, s: 60 }, .016);
  assert.equal(craters().length, 1, 'same event must not stamp twice or erase the crater');
  const next = touchdown(); next.event++; next.s += 10; next.landingImpact = captureLandingImpact(next);
  effects.update(next, .016);
  assert.equal(craters().length, 2);
  let disposed = false;
  crater.geometry.addEventListener('dispose', () => { disposed = true; });
  effects.reset();
  assert.equal(craters().length, 0); assert.ok(disposed);
  effects.update(touchdown(.6), .016);
  assert.equal(craters().length, 0, 'small hops do not gouge a crater');
});
