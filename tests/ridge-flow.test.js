import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, groundHeight } from '../src/blackridge.js';
import { createState, step } from '../src/physics.js';
import { selectCourse } from '../src/course.js';

test('signature ridge takeoffs avoid steep uphill walls and oversized catch drops', () => {
  for (const f of FEATURES.filter(f => f.major)) {
    const height = u => groundHeight(f.x + f.dx*u, f.s + f.ds*u);
    for (let u = -f.length + 2; u <= -2; u += 2) {
      const grade = (height(u) - height(u-2))/2;
      assert.ok(grade < .4, `${f.name}: uphill approach grade ${grade.toFixed(2)}`);
    }
    const drop = height(0) - height(40);
    assert.ok(drop > 65 && drop < 225, `${f.name}: drop over first 40m is ${drop.toFixed(1)}m`);
  }
});

test('a moderate-speed skier can approach, jump and land each large ridge', () => {
  selectCourse('blackridge');
  for (const f of FEATURES.filter(f => f.major)) {
    const state = createState();
    Object.assign(state, {x:f.x-f.dx*f.length, s:f.s-f.ds*f.length,
      // Isolate the snow approach from optional log/cable auto-capture.
      heading:-f.angle, speed:26, started:true, railCooldown:30});
    state.y = groundHeight(state.x,state.s);
    let reached = false;
    for (let i=0; i<120*15; i++) {
      step(state, {tuck:!state.airborne, charge:true}, 1/120);
      const u = (state.x-f.x)*f.dx + (state.s-f.s)*f.ds;
      if (u >= -2) { reached=true; break; }
    }
    assert.ok(reached && state.speed > 18, `${f.name}: stalled before the lip at ${state.speed.toFixed(1)}m/s`);
    // Release at the crest; the short grace window also supports a natural
    // release just before crossing it on the triangulated snow surface.
    for (let i=0; i<120*2; i++) {
      step(state, {tuck:!state.airborne, charge:true}, 1/120);
      if ((state.x-f.x)*f.dx + (state.s-f.s)*f.ds >= 0) break;
    }
    step(state, {pop:true}, 1/120);
    let landed=false;
    for (let i=0; i<120*20; i++) {
      const airborne=state.airborne;
      step(state, {}, 1/120);
      if (airborne && !state.airborne) { landed=true; break; }
    }
    assert.ok(landed && state.airtime>2, `${f.name}: needs a usable jump and catch landing`);
    assert.equal(state.bailTimer, 0, `${f.name}: landing must remain skiable`);
  }
});
