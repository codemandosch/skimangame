import test from 'node:test';
import assert from 'node:assert/strict';
import * as mountain from '../src/blackridge.js';
import { createState, step } from '../src/physics.js';
import { prepareParkRun, startRun } from '../src/run-start.js';
import { keyboardInput } from '../src/controls.js';

function park() {
  assert.ok(mountain.PARK_LINE, 'Blackridge exposes its groomed park line');
  return mountain.PARK_LINE;
}
function rider(x, s = 0, speed = 30) {
  const state = createState();
  Object.assign(state, { x, s, y: mountain.groundHeight(x, s), heading: -Math.PI / 2,
    speed, vx: speed, vs: 0, started: true });
  return state;
}

test('skiing into the park from the summit stays grounded across the old ledge', () => {
  for (const hz of [30, 120]) for (const offset of [-30, 0, 30]) for (const speed of [30, 50]) {
    // Start below the optional lift kicker and cross the park entrance ledge.
    const state = rider(100, offset, speed);
    const approachEnd=mountain.PARK_LINE.jumps[0].x-mountain.PARK_LINE.jumps[0].length-5;
    for (let i = 0; i < hz * 15 && state.x < approachEnd; i++) {
      step(state, {}, 1 / hz);
      assert.equal(state.airborne, false, `unwanted hop at ${state.x.toFixed(1)}, ${state.s.toFixed(1)} (${hz}Hz, ${speed}m/s)`);
      assert.equal(state.bailTimer, 0);
    }
    assert.ok(state.x >= approachEnd, 'the approach flows into the park without stalling');
  }
});

test('the park has a wide even pitch between its authored features', () => {
  const p = park();
  assert.ok(p.width >= 160);
  assert.ok(p.grade > .6 && p.grade < 1.2);
  for (const x of [230, 560, 940, 1330, 1740]) {
    const center = mountain.groundHeight(x, 0);
    for (const s of [-65, -30, 30, 65]) assert.ok(Math.abs(mountain.groundHeight(x, s) - center) < .01, `flat across at ${x}, ${s}`);
    assert.ok(Math.abs(mountain.gradientAt(x, 0).x + p.grade) < .01, `even slope at ${x}`);
  }
  for (const object of [...mountain.TREES, ...mountain.LOGS]) {
    assert.ok(!(object.x > 240 && object.x < 1900 && Math.abs(object.s) < 95), 'the line is clear of trees and timber');
  }
});

test('four growing jumps sit in sequence with short even runouts and no rails', () => {
  const p = park();
  assert.equal(p.jumps.length, 4);
  assert.equal(p.rails, undefined);
  p.jumps.slice(1).forEach((j, i) => {
    const before = p.jumps[i], runout = j.x - j.length - (before.x + before.gap + before.landingLength);
    assert.ok(j.height > before.height, `${j.name} is bigger than ${before.name}`);
    assert.ok(runout > 80 && runout < 100, `${before.name} to ${j.name} runout: ${runout}`);
  });
  assert.deepEqual(p.jumps.map(j => j.landingLength), [96, 102, 105, 108]);
  assert.ok(p.jumps.every(j => j.landingWidth * 2 >= 140));
});

test('each landing follows the mountain pitch for 35 percent before its steeper descent', () => {
  const p=park();
  for(const j of p.jumps) {
    const start=j.x+j.gap,plateau=j.landingLength*.35,end=start+j.landingLength;
    // Stay inside the deck when sampling the shared two-metre terrain triangles.
    for(const offset of [2,plateau/2,plateau-2])for(const side of [-30,0,30])
      assert.ok(Math.abs(mountain.groundHeight(start+offset,side)-p.heightAt(start+offset)-j.landingHeight)<.001,`${j.name}: plateau follows the mountain pitch`);
    assert.ok(Math.abs(p.surface(start+plateau,0)-p.heightAt(start+plateau)-j.landingHeight)<.001,'the authored plateau spans 35 percent');
    const slopeStart=p.heightAt(start+plateau)+j.landingHeight;
    assert.ok(mountain.groundHeight(start+plateau+5,0)<slopeStart-p.grade*5-1,'the steeper descent begins after the plateau');
    assert.ok(Math.abs(p.surface(end,0)-p.heightAt(end))<.001,'the landing rejoins the runout at its endpoint');
    assert.ok(Math.abs(mountain.groundHeight(end+2,0)-p.heightAt(end+2))<.001,'the terrain triangles rejoin the runout');
  }
});

test('park starts wait for input and point down the groomed strip', () => {
  const s=createState();prepareParkRun(s);
  assert.equal(s.x,park().start);assert.equal(s.s,0);
  const before={x:s.x,s:s.s,y:s.y};
  step(s,{tuck:true,pop:true},1/30);
  assert.deepEqual({x:s.x,s:s.s,y:s.y},before);
  startRun(s);step(s,{},1/30);
  assert.ok(s.x>before.x && Math.abs(s.s)<.001);
});

test('tucking without pops clears all four landings', () => {
  const p=park();
  const last=p.jumps.at(-1),runout=last.x+last.gap+last.landingLength+4;
  for (const hz of [30, 60, 120]) {
    const state = createState(), jumps = new Set();
    prepareParkRun(state);startRun(state);
    for (let i = 0; i < hz * 70 && state.x < runout; i++) {
      const airborne = state.airborne;
      step(state, {tuck:true}, 1 / hz);
      if (airborne && !state.airborne && state.maxHeight > 25) {
        const landing=p.jumps.find(j=>state.x>=j.x+j.gap && state.x<=j.x+j.gap+j.landingLength);
        assert.ok(landing,`land on a catch slope, not its front wall: ${state.x}`);
        jumps.add(landing.index);
      }
      if(!airborne && state.airborne && p.jumps.some(j=>Math.abs(j.x-state.x)<2))
        assert.ok(state.vy>5,'the lip carries an upward approach tangent at every frame rate');
      assert.equal(state.bailTimer, 0, `clean run at ${state.x}`);
      assert.ok(state.y >= mountain.groundHeight(state.x, state.s) - .01);
    }
    assert.ok(state.x >= runout, 'the run keeps moving downhill');
    assert.equal(jumps.size, 4, `four big airs at ${hz}Hz`);
  }
});

test('the kickers and landings keep their layout', () => {
  const p=park();
  assert.equal(p.start,180);
  assert.deepEqual(p.jumps.map(j=>j.x),[330,708,1100,1500]);
  assert.deepEqual(p.jumps.map(j=>[j.gap,j.landingLength,j.landingHeight]),[[95,96,24],[92.65,102,28],[86,105,30],[79.3,108,32]]);
});

test('the final quarterpipe has a clear run-in, a forward lip and a narrow level crest', () => {
  const p=park(),q=p.quarterpipe;
  assert.ok(q,'the park ends with a quarterpipe');
  const last=p.jumps.at(-1);
  assert.ok(q.x-q.length>last.x+last.gap+last.landingLength+40);
  assert.ok(q.height>20 && q.height<30 && q.width*2>=120,'a low takeoff with broad side landings');
  for(const side of [-8,-4,4,8])
    assert.ok(Math.abs(mountain.groundHeight(q.x,side)-mountain.groundHeight(q.x,0))<.01,'straight horizontal takeoff edge');
  const slope=(mountain.groundHeight(q.x,0)-mountain.groundHeight(q.x-2,0))/2;
  const angle=Math.atan(slope)*180/Math.PI;
  assert.ok(angle>60 && angle<70,`forward rendered/contact lip: ${angle}`);
  assert.equal(mountain.rampAt(q.x-1,0),q);
  assert.ok(q.crestWidth<=4,'only a thin plateau separates the left and right faces');
  assert.ok(Math.abs(mountain.groundHeight(q.x,0)-mountain.groundHeight(q.x+q.deckLength,0))<.01,'level crest');
  for(const side of [-1,1]) {
    assert.ok(mountain.groundHeight(q.x+12,side*16)<mountain.groundHeight(q.x+12,0)-6,'left and right faces descend from the spine');
    assert.ok(Math.abs(mountain.groundHeight(q.x+12,side*16)-mountain.groundHeight(q.x+12,-side*16))<.01,'symmetric side landings');
  }
});

test('the quarterpipe launches mostly upward at every supported frame rate', () => {
  const q=park().quarterpipe;
  assert.ok(q);
  for(const hz of [30,60,120]) {
    const state=rider(q.x-q.length-30,0,60);
    for(let i=0;i<hz*15 && !state.airborne;i++)
      step(state,{tuck:true},1/hz);
    assert.equal(state.airborne,true,`${hz}Hz reaches the lip`);
    assert.ok(state.x>=q.x-2.1,'stay attached through the curved transition');
    assert.ok(state.vy>5 && state.speed>4 && state.vy>state.speed,'takeoff carries both forward and upward');
    assert.ok(state.takeoffFrame.pitch>1 && state.takeoffFrame.pitch<1.25,'skis align with the eased lip');
    for(let i=0;i<hz/4;i++)step(state,{},1/hz);
    assert.ok(state.airborne && state.airHeight>1,'clear the lip without clipping the deck');
    assert.equal(state.bailTimer,0);
  }
});

test('the low spine preserves enough approach speed for substantial air without a pop', () => {
  const q=park().quarterpipe;
  for(const hz of [30,60,120]) {
    const state=rider(q.x-74,0,40);
    for(let i=0;i<hz*20 && !state.airborne;i++)step(state,{tuck:true},1/hz);
    assert.ok(state.airborne && state.x>=q.x-2.1,'reach the takeoff');
    assert.ok(Math.hypot(state.vx,state.vy,state.vs)>38,'retain momentum through the climb');
    let apex=state.y;
    for(let i=0;i<hz*10 && state.airborne;i++) {
      step(state,{},1/hz);apex=Math.max(apex,state.y);
    }
    assert.ok(apex-mountain.groundHeight(q.x,0)>20,'rise more than twenty metres above the lip without a pop');
  }
});

test('popping below the quarterpipe crest does not teleport up the wall', () => {
  const q=park().quarterpipe;
  const state=rider(q.x-3.9,0,30),before={x:state.x,y:state.y};
  step(state,{pop:true},1/120);
  assert.ok(state.x-before.x<.3,'an early pop cannot skip to the lip');
  assert.ok(state.y-before.y<4,'rise is limited to this frame of travel');
});

test('the spine redirects approach momentum without discarding speed at the lip', () => {
  const q=park().quarterpipe;
  for(const hz of [30,60,120])for(const speed of [30,45,60]) {
    const state=rider(q.x-.1,0,speed);
    step(state,{tuck:true},1/hz);
    assert.ok(state.airborne);
    const flightSpeed=Math.hypot(state.vx,state.vs,state.vy);
    assert.ok(flightSpeed>speed*.9 && flightSpeed<=speed,'carry the incoming speed through takeoff, with only normal drag');
  }
});

test('spine pop timing stays continuous across the old four-metre boundary', () => {
  const q=park().quarterpipe;
  const states=[-4.01,-3.99].map(u=>{
    const state=rider(q.x+u,0,45);state.charge=1;
    step(state,{pop:true},1/120);return state;
  });
  for(const state of states)assert.ok(state.airborne && state.quarterpipeFlight);
  // The shorter curved transition changes the tangent slightly over these 2 cm.
  // Keep both components within 1%, guarding against the old abrupt pop switch.
  assert.ok(Math.abs(states[0].vx-states[1].vx)<Math.abs(states[0].vx)*.01);
  assert.ok(Math.abs(states[0].vy-states[1].vy)<Math.abs(states[0].vy)*.01);
});

test('spine ground travel joins its airborne velocity without an abrupt slowdown', () => {
  const q=park().quarterpipe;
  for(const hz of [30,60,120]) {
    const state=rider(q.x-5,0,45);
    let groundSpeed=0;
    for(let i=0;i<hz*2 && !state.airborne;i++) {
      const before={x:state.x,y:state.y,s:state.s};
      step(state,{tuck:true},1/hz);
      if(!state.airborne)groundSpeed=Math.hypot(state.x-before.x,state.y-before.y,state.s-before.s)*hz;
    }
    assert.ok(state.airborne && groundSpeed>0);
    const flightSpeed=Math.hypot(state.vx,state.vy,state.vs);
    assert.ok(Math.abs(flightSpeed-groundSpeed)<groundSpeed*.1,'visible travel speed stays continuous at takeoff');
  }
});

test('a held spine pop still works just after crossing the lip without cutting upward momentum', () => {
  const q=park().quarterpipe;
  const state=rider(q.x-.05,0,45);state.charge=1;
  step(state,{charge:true},1/120);
  const before=state.vy;
  assert.ok(state.airborne && before>15);
  step(state,{pop:true},1/120);
  assert.ok(state.vy>before+5,'late Space release adds lift instead of imposing the ordinary pop cap');
});

test('the extended spine keeps fast flights over the side landing faces', () => {
  const q=park().quarterpipe;
  assert.ok(q.deckLength>=100,'a long ridge above the side landing faces');
  for(const hz of [30,60,120])for(const side of [-1,1]) {
    const state=rider(q.x-.05,side*3,60);
    step(state,{},1/hz);
    for(let i=0;i<hz*12 && state.airborne;i++)step(state,{steer:side<0?1:-1},1/hz);
    assert.equal(state.airborne,false);
    assert.ok(state.x>q.x+40 && state.x<q.x+q.deckLength,'land alongside the ridge, before the tail');
    assert.ok(state.s*side>q.crestWidth/2 && Math.abs(state.s)<q.width);
    assert.equal(state.bailTimer,0);
  }
});

test('left and right controls choose the two spine landing faces', () => {
  const q=park().quarterpipe;
  for(const hz of [30,60,120])for(const [key,side] of [['ArrowLeft',1],['ArrowRight',-1]]) {
    const state=rider(q.x-q.length-30,0,60);
    for(let i=0;i<hz*15 && !state.airborne;i++)step(state,{tuck:true},1/hz);
    assert.ok(state.airborne,'reach the spine takeoff');
    for(let i=0;i<hz*10 && state.airborne;i++)step(state,keyboardInput(new Set([key])),1/hz);
    assert.equal(state.airborne,false,'touch down on the spine');
    assert.ok(state.s*side>q.crestWidth/2,`${key} lands on its side of the plateau at ${hz}Hz`);
    assert.ok(state.x>q.x+4 && state.x<q.x+q.catchLength,'carry forward onto a side face');
    assert.equal(state.bailTimer,0,'a controlled side landing');
  }
});

test('crossing the downhill outer spine does not trigger an uphill launch', () => {
  const q=park().quarterpipe;
  for(const side of [-60,60]) {
    const state=rider(q.x-.1,side,30);
    assert.ok(mountain.gradientAt(state.x-2,side).x<0,'the outer approach runs downhill');
    step(state,{},1/30);
    assert.ok(state.vy<=0,'follow the local slope instead of the central lip');
    assert.ok(state.takeoffFrame.pitch<=0,'departure frame follows the outer surface');
  }
});
