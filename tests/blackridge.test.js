import test from 'node:test';
import assert from 'node:assert/strict';
import * as mountain from '../src/blackridge.js';
import { selectCourse, COURSE, LENGTH, JUMPS, groundHeight } from '../src/course.js';
import { createState, step, respawn } from '../src/physics.js';

function mountainTest(name, run) { test(name, () => { selectCourse('blackridge'); try { run(); } finally { selectCourse('bluebird'); } }); }
mountainTest('the summit allows choosing a full-circle heading before pushing off', () => {
  const s=createState();
  for(let i=0;i<120*5;i++) step(s,{steer:1},1/120);
  assert.ok(Math.abs(s.heading)>Math.PI*2);
  assert.equal(s.x,0); assert.equal(s.s,0); assert.equal(s.speed,0);
  step(s,{tuck:true},1/120);
  assert.ok(s.speed>17);
});
mountainTest('every compass face supports a substantial gravity-driven descent', () => {
  for(let k=0;k<16;k++) {
    const s=createState(); s.heading=k*Math.PI/8;
    for(let i=0;i<120*150&&!s.finished;i++) {
      if(s.started && !s.airborne && s.speed<8) {
        const g=mountain.gradientAt(s.x,s.s);
        s.heading=-Math.atan2(-g.x,-g.s);
      }
      step(s,{tuck:!s.airborne},1/120);
      assert.ok(Number.isFinite(s.y));
      assert.ok(s.y>=groundHeight(s.x,s.s)-.01);
    }
    assert.ok(Math.hypot(s.x,s.s)>1000,`face ${k} descends the mountain`);
    assert.ok(s.y<1000,`face ${k} loses substantial altitude`);
  }
});
mountainTest('the opening face is steep in every direction immediately beyond the summit tip', () => {
  for(let k=0;k<64;k++) {
    const a=k*Math.PI/32,dx=Math.sin(a),ds=Math.cos(a);
    for(let r=4;r<=80;r+=2) {
      const grade=(groundHeight(dx*(r-1),ds*(r-1))-groundHeight(dx*(r+1),ds*(r+1)))/2;
      assert.ok(grade>.6,`heading ${k}, radius ${r}: ${grade}`);
    }
  }
});
mountainTest('all starting headings reach early and further takeoffs without powered acceleration', () => {
  for(let k=0;k<32;k++) {
    const s=createState();s.heading=-k*Math.PI/16;
    const flights=[];let start=0;
    for(let i=0;i<120*150&&!s.finished;i++) {
      const air=s.airborne;
      // Smaller launches can land on an uphill shoulder previously overflown.
      // Turn out if stalled, as a player choosing a line would do.
      if(s.started&&!s.airborne&&s.speed<8) {
        const g=mountain.gradientAt(s.x,s.s);
        s.heading=-Math.atan2(-g.x,-g.s);
      }
      step(s,{tuck:!s.airborne,steer:0},1/120);
      const radius=Math.hypot(s.x,s.s);
      if(radius<10) assert.equal(s.airborne,false,'push-off must stay on snow');
      if(!air&&s.airborne)start=radius;
      if(air&&!s.airborne&&s.airtime>1)flights.push(start);
    }
    assert.ok(flights.some(r=>r>80&&r<250),`early takeoff on heading ${k}`);
    assert.ok(flights.some(r=>r>250),`further takeoffs on heading ${k}`);
  }
});
mountainTest('steering can cross the former corridor, reverse direction and traverse faces', () => {
  const s=createState(); s.heading=-Math.PI/2;
  for(let i=0;i<120*15;i++) step(s,{tuck:!s.airborne},1/120);
  assert.ok(s.x>350,'east face must be reachable');
  s.airborne=false; s.y=groundHeight(s.x,s.s); s.heading=Math.PI/2; s.speed=30;
  const before=s.x;
  for(let i=0;i<120;i++) step(s,{},1/120);
  assert.ok(s.x<before-5,'rider can travel back toward the summit');
});
mountainTest('cliff shelves and snow lips are finite and join their surrounding terrain', () => {
  assert.equal(mountain.FEATURES.length,172+mountain.SNOWFIELD_LIPS.length);
  assert.ok(mountain.FEATURES.filter(f=>f.major).length>=10);
  for(const f of mountain.FEATURES) {
    for(const u of [-f.length,0,14,f.catchLength+f.recovery]) {
      const x=f.x+f.dx*u, z=f.s+f.ds*u;
      assert.ok(Math.abs(groundHeight(x+.001,z)-groundHeight(x-.001,z))<.5, f.name);
      assert.ok(Math.abs(groundHeight(x,z+.001)-groundHeight(x,z-.001))<.5, f.name);
    }
  }
});
mountainTest('snowfields have a nearby takeoff across the entire skiable mountain', () => {
  for(let x=-2300;x<=2300;x+=45)for(let s=-2300;s<=2300;s+=45) {
    if(Math.hypot(x,s)<280||mountain.mountainFraction(x,s)>.92)continue;
    const distance=Math.min(...mountain.FEATURES.map(f=>{
      const {u,v}=mountain.featureCoordinates(f,x,s);
      return Math.hypot(u,Math.max(0,Math.abs(v)-f.width*.65));
    }));
    assert.ok(distance<200,`empty snowfield at ${x}, ${s}: nearest lip ${distance.toFixed(1)} m away`);
  }
});
mountainTest('one hundred small wind lips cover every face and produce usable Space-release jumps', () => {
  assert.equal(mountain.SMALL_LIPS.length,100);
  const areas=new Set(),bands=[0,0,0];
  for(const f of mountain.SMALL_LIPS) {
    areas.add(mountain.areaAt(f.x,f.s).name);
    const radius=Math.hypot(f.x,f.s);
    bands[radius<700?0:radius<1300?1:2]++;
    const s=createState();
    Object.assign(s,{x:f.x,s:f.s,heading:-f.angle,speed:32,charge:1,started:true});
    s.y=groundHeight(s.x,s.s);
    step(s,{pop:true},1/120);
    let landed=false;
    for(let i=0;i<120*20;i++) {
      const air=s.airborne;
      step(s,{},1/120);
      if(s.seenJumps.has(f.index)&&air&&!s.airborne){landed=true;break;}
    }
    assert.ok(landed,`${f.name} must launch from its own lip and land`);
    assert.ok(s.airtime>1,`${f.name} must give useful airtime`);
    assert.equal(s.bailTimer,0,`${f.name} must have a clean landing`);
  }
  assert.equal(areas.size,6);
  assert.deepEqual(bands,[20,35,45]);
});
mountainTest('Space release at signature lips produces long flights and grounded landings', () => {
  const times=[];
  for(const f of mountain.FEATURES.filter(f=>f.major)) {
    const s=createState();
    Object.assign(s,{x:f.x,s:f.s,heading:-f.angle,speed:50,charge:1,started:true});
    s.y=groundHeight(s.x,s.s);
    step(s,{pop:true,tuck:true},1/120);
    let launched=false;
    for(let i=0;i<120*30;i++) {
      const air=s.airborne;
      step(s,{tuck:!s.airborne},1/120);
      launched ||= s.airborne;
      if(launched&&air&&!s.airborne)break;
    }
    assert.ok(launched,f.name);
    assert.equal(s.airborne,false,f.name);
    assert.equal(s.bailTimer,0,f.name);
    assert.ok(s.airtime>6,`${f.name}: ${s.airtime}`);
    assert.ok(s.airtime<12,`${f.name}: ${s.airtime}`);
    times.push(s.airtime);
  }
  assert.ok(Math.max(...times)>=8,'large drops still provide extended airtime with bounded launch speed');
});
mountainTest('base completion requires the outer runout and ground contact', () => {
  assert.equal(mountain.atBase(0,0,50),false);
  const s=createState();
  Object.assign(s,{x:2300,s:0,y:500,airborne:true,started:true,speed:0});
  step(s,{},1/120); assert.equal(s.finished,false);
  s.airborne=false; s.y=groundHeight(s.x,s.s);
  step(s,{},1/120); assert.equal(s.finished,true);
  respawn(s); assert.equal(s.started,false); assert.equal(s.finished,false); assert.equal(s.distance,0);
});
test('Bluebird and invalid map links retain a playable original course', () => {
  for(const id of ['bluebird','missing','toString','__proto__']) {
    selectCourse(id); const s=createState();step(s,{},1/120);
    assert.equal(COURSE.id,'bluebird');assert.equal(LENGTH,1180);assert.equal(JUMPS.length,5);
    assert.ok(s.s>0);
  }
});

mountainTest('speed follows the signed slope in the direction of travel', () => {
  function skier(heading, x=0, position=50) {
    const s=createState();
    Object.assign(s,{x,s:position,heading,started:true,speed:20});
    s.y=groundHeight(x,position);
    return s;
  }
  const g=mountain.gradientAt(0,50);
  const downhill=-Math.atan2(-g.x,-g.s);
  const down=skier(downhill),up=skier(downhill+Math.PI),across=skier(downhill+Math.PI/2);
  for(const s of [down,up,across]) step(s,{},1/120);
  assert.ok(down.speed>20,'gravity accelerates downhill');
  assert.ok(up.speed<across.speed,'uphill loses more speed than a traverse');
  assert.ok(across.speed<20,'traversing sheds speed through drag');
  const flat=skier(0,3000,0),tucked=skier(0,3000,0);
  step(flat,{},1/120);step(tucked,{tuck:true},1/120);
  assert.ok(flat.speed<tucked.speed && tucked.speed<20,'tuck reduces drag without powering flat terrain');
  const charged=skier(downhill),braking=skier(downhill);
  step(charged,{charge:true},1/120);step(braking,{brake:true},1/120);
  assert.equal(charged.speed,down.speed,'jump charging adds no acceleration');
  assert.ok(braking.speed<down.speed,'braking still sheds speed');
  const stopped=skier(downhill+Math.PI);stopped.speed=0;
  step(stopped,{tuck:true},1/120);
  assert.equal(stopped.speed,0,'tuck cannot drive uphill from rest');
});
