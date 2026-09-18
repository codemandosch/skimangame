import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCourse, groundHeight, JUMPS } from '../src/course.js';
import { FEATURES } from '../src/blackridge.js';
import { createState, step } from '../src/physics.js';

function atFeature(f,u,speed,charge=1) {
  const s=createState();
  Object.assign(s,{x:f.x+f.dx*u,s:f.s+f.ds*u,heading:-f.angle,speed,charge,started:true});
  s.y=groundHeight(s.x,s.s);
  return s;
}
function mountainTest(name, run) {
  test(name,()=>{selectCourse('blackridge');try {run();} finally {selectCourse('bluebird');}});
}

test('Bluebird ramp edges never add lift while Space is held',()=>{
  selectCourse('bluebird');
  for(const f of JUMPS) {
    const s=createState();
    Object.assign(s,{x:f.x,s:f.lip-.01,speed:32,charge:1});
    s.y=groundHeight(s.x,s.s);
    step(s,{charge:true,steer:1},1/120);
    assert.ok(s.airborne,'skiing off the edge permits a fall');
    assert.equal(s.vy,0,'only a release can add lift');
  }
});

mountainTest('charged pops cannot produce excessive upward velocity on any mountain feature',()=>{
  for(const f of FEATURES) for(const u of [-12.01,-11.99,-6,-2,0,4,7.99,8.01]) {
    for(const speed of [20,38,56]) {
      const s=atFeature(f,u,speed);
      step(s,{pop:true},1/120);
      assert.ok(s.airborne,`${f.name}: release must take off`);
      assert.ok(Number.isFinite(s.vy) && s.vy<=20,`${f.name}: ${s.vy} m/s`);
    }
  }
});

mountainTest('crossing either lip trigger boundary does not abruptly amplify a pop',()=>{
  for(const f of FEATURES) for(const boundary of [-12,8]) {
    const a=atFeature(f,boundary-.01,38),b=atFeature(f,boundary+.01,38);
    step(a,{pop:true},1/120);step(b,{pop:true},1/120);
    assert.ok(Math.abs(a.vy-b.vy)<1,`${f.name} at ${boundary}: ${a.vy} vs ${b.vy}`);
  }
});

mountainTest('turning and holding charge never add upward lift without Space release',()=>{
  let falls=0;
  for(const f of FEATURES) {
    for(const u of [-12,-2,0,2,6]) for(const steer of [-1,0,1]) {
      const s=atFeature(f,u,38,1);
      step(s,{charge:true,steer},1/120);
      if(s.airborne) {
        falls++;
        assert.ok(s.vy<=0,`${f.name}: unsolicited upward launch ${s.vy}`);
      }
    }
  }
  assert.ok(falls>0,'cliff drops still allow falling');
});
