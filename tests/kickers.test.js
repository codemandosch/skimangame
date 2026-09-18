import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCourse, COURSE } from '../src/course.js';
import { KICKERS, SMALL_LIPS, LIFT_KICKERS, SUMMIT_KICKERS, rampAt } from '../src/blackridge.js';
import { getLiftLayout, cablePoint, liftCoordinates } from '../src/lift-layout.js';
import { createState, step } from '../src/physics.js';

test('the upper lift has fewer, larger kickers with open snow between approaches',()=>{
  const layout=getLiftLayout();
  const upper=LIFT_KICKERS.map(f=>liftCoordinates(layout,f.x,f.s).u).filter(u=>u<600);
  assert.ok(upper[0]<=60,'first cable kicker stays close to the summit');
  assert.equal(upper.length,5);
  for(let i=1;i<upper.length;i++)assert.ok(upper[i]-upper[i-1]>=89.99);
  for(const f of LIFT_KICKERS)assert.ok(f.height>=7 && f.length>=20 && f.width>=16);
  for(const side of [-1,1]) {
    const lane=SUMMIT_KICKERS.map(f=>liftCoordinates(layout,f.x,f.s)).filter(p=>Math.sign(p.lateral)===side);
    assert.ok(lane.length<=3,'conflicting summit side hits may be removed');
    for(let i=1;i<lane.length;i++)assert.ok(lane[i].u-lane[i-1].u>=199.99);
  }
});

test('the first lift kicker sits just right of the cables while the rest stay centered',()=>{
  const layout=getLiftLayout();
  const first=liftCoordinates(layout,LIFT_KICKERS[0].x,LIFT_KICKERS[0].s);
  assert.ok(first.lateral>=2 && first.lateral<=3,`first kicker offset is ${first.lateral.toFixed(2)}m`);
  for(const f of LIFT_KICKERS.slice(1)) {
    const {lateral}=liftCoordinates(layout,f.x,f.s);
    assert.ok(Math.abs(lateral)<1e-6,`${f.name} moved ${lateral.toFixed(2)}m off center`);
  }
});

test('lift kickers leave real airtime instead of landing in the next compression',()=>{
  selectCourse('blackridge');
  const layout=getLiftLayout();
  for(const f of LIFT_KICKERS) {
    const u=liftCoordinates(layout,f.x,f.s).u-3;
    const x=layout.top.x+layout.dx*u,s=layout.top.s+layout.ds*u;
    const state=createState();
    Object.assign(state,{x,s,y:COURSE.groundHeight(x,s),heading:layout.heading,
      speed:32,charge:1,started:true});
    step(state,{pop:true},1/120);
    let airtime=0;
    while(state.airborne && airtime<5 && !state.railing) {
      step(state,{},1/120);
      airtime+=1/120;
    }
    assert.ok(airtime>=.35,`${f.name} lands after only ${airtime.toFixed(2)} seconds`);
  }
});

test('the first summit kicker can transfer to either cable',()=>{
  const layout=getLiftLayout();
  for(const hz of [30,60,120])for(const cable of [0,1])for(const f of LIFT_KICKERS.slice(0,1)) {
    const {u}=liftCoordinates(layout,f.x,f.s),p=cablePoint(layout,cable,u-3);
    const state=createState();
    Object.assign(state,{x:p.x,s:p.s,y:COURSE.groundHeight(p.x,p.s),
      heading:layout.heading,speed:32,charge:1,started:true});
    step(state,{pop:true},1/hz);
    for(let i=0;i<hz*8 && state.airborne && !state.railing && !state.railCrash;i++)step(state,{},1/hz);
    assert.ok(state.railing,`${f.name}, cable ${cable}, ${hz}Hz must catch`);
    assert.equal(state.rail.cable,cable);
  }
});

test('small kickers add frequent opportunities on every face and under both lift wires',()=>{
  selectCourse('blackridge');
  assert.ok(KICKERS.length>0);
  assert.equal(new Set([...KICKERS,...SMALL_LIPS].filter(f=>!f.lift).map(f=>Math.floor((f.angle+Math.PI*2)%(Math.PI*2)/(Math.PI/3)))).size,6);
  const layout=getLiftLayout();
  for(const f of LIFT_KICKERS) {
    const {u}=liftCoordinates(layout,f.x,f.s);
    for(const cable of [0,1]) {
      const p=cablePoint(layout,cable,u-3);
      assert.equal(rampAt(p.x,p.s),f,'compact lift lip takes precedence over broad terrain features');
    }
  }
});

test('new lift kickers reach both cables with a normal charged pop at multiple frame rates',()=>{
  selectCourse('blackridge');
  const layout=getLiftLayout();
  for(const hz of [30,60,120])for(const cable of [0,1]) {
    let catches=0;
    for(const f of LIFT_KICKERS) {
      const {u}=liftCoordinates(layout,f.x,f.s),p=cablePoint(layout,cable,u-3);
      const state=createState();
      Object.assign(state,{x:p.x,s:p.s,y:COURSE.groundHeight(p.x,p.s),
        heading:layout.heading,speed:36,charge:1,started:true});
      step(state,{pop:true},1/hz);
      for(let i=0;i<hz*8 && state.airborne && !state.railing && !state.railCrash;i++)step(state,{},1/hz);
      if(state.railing) { assert.equal(state.rail.cable,cable);catches++; }
    }
    assert.ok(catches>=Math.ceil(LIFT_KICKERS.length*.8),`${hz}Hz cable ${cable}: only ${catches} reachable kickers`);
  }
});
