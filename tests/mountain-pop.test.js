import test from 'node:test';
import assert from 'node:assert/strict';
import { selectCourse, groundHeight, JUMPS } from '../src/course.js';
import { FEATURES, LIFT_KICKERS, rampAt, gradientAt } from '../src/blackridge.js';
import { createState, step } from '../src/physics.js';
import { groundContact } from '../src/ground-contact.js';

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
    for(const speed of [20,38,56,69]) {
      const s=atFeature(f,u,speed);
      step(s,{pop:true},1/120);
      assert.ok(s.airborne,`${f.name}: release must take off`);
      const limit=s.quarterpipeFlight ? speed+9.25 : 15;
      assert.ok(Number.isFinite(s.vy) && s.vy<=limit,`${f.name}: ${s.vy} m/s`);
      if(s.quarterpipeFlight)assert.ok(Math.hypot(s.speed,s.vy)<=speed+9.25,'spine launch adds only the normal charged pop impulse');
    }
  }
});

mountainTest('the first lift kicker adds only the normal charged impulse to terrain momentum',()=>{
  const f=LIFT_KICKERS[0];
  for(const hz of [30,60,120]) for(const u of [-12,-8,-4,0,4,8]) {
    const s=atFeature(f,u,36,1),unreleased=atFeature(f,u,36,1);
    const g=gradientAt(s.x,s.s);
    step(unreleased,{},1/hz);
    const tangent=Math.max(-unreleased.speed,Math.min(10,g.x*unreleased.vx+g.s*unreleased.vs));
    step(s,{pop:true},1/hz);
    assert.ok(Math.abs(s.vy-Math.min(15,tangent+9.25))<1e-8,
      `${hz}Hz at ${u}m added artificial kicker lift`);
  }
});

mountainTest('the first lift kicker cannot stack a late charged pop into a giant launch',()=>{
  const f=LIFT_KICKERS[0],s=atFeature(f,-.2,36,1);
  step(s,{charge:true},1/120);
  for(let i=0;i<6;i++)step(s,{charge:true},1/120);
  const before=s.vy;
  step(s,{pop:true},1/120);
  assert.ok(s.vy>before && s.vy-before<=9.25 && s.vy<=15,
    `late release must add only the stored charge, got ${s.vy-before} m/s`);
});

mountainTest('snow pops give a little more lift for both taps and full charge',()=>{
  const f=FEATURES.find(f=>f.name==='FIRST LIGHT');
  for(const charge of [0,1]) {
    const s=atFeature(f,-20,0,charge);
    // Face uphill so acceleration cannot add terrain momentum to the impulse.
    s.heading+=Math.PI;
    step(s,{pop:true},1/120);
    assert.ok(s.airborne);
    const oldImpulse=5+charge*3.25;
    assert.ok(s.vy>oldImpulse+.5 && s.vy<oldImpulse+1.5,
      'both quick and charged pops get a modest increase');
  }
});

mountainTest('crossing either lip trigger boundary does not abruptly amplify a pop',()=>{
  for(const f of FEATURES) for(const boundary of [-12,8]) {
    const a=atFeature(f,boundary-.01,38),b=atFeature(f,boundary+.01,38);
    step(a,{pop:true},1/120);step(b,{pop:true},1/120);
    assert.ok(Math.abs(a.vy-b.vy)<1,`${f.name} at ${boundary}: ${a.vy} vs ${b.vy}`);
  }
});

mountainTest('turning and holding charge preserve terrain momentum without adding a pop',()=>{
  let falls=0;
  for(const f of FEATURES) {
    for(const u of [-12,-2,2,6]) for(const steer of [-1,0,1]) {
      const s=atFeature(f,u,38,1);
      step(s,{charge:true,steer},1/120);
      if(s.airborne && !s.railCrash) {
        falls++;
        const contact=groundContact(f.x+f.dx*u,f.s+f.ds*u,s.vx,s.vs,1/120,groundHeight);
        assert.ok(Math.abs(s.vy-contact.vy)<1e-9,`${f.name}: takeoff must carry the incoming tangent`);
        assert.ok(s.vy<=10,`${f.name}: terrain momentum remains bounded`);
      }
    }
  }
  assert.ok(falls>0,'cliff drops still allow falling');
});

mountainTest('authored lips release naturally at the crest instead of magnetizing to the back face',()=>{
  let checked=0;
  for(const f of FEATURES) {
    const s=atFeature(f,-.2,38,1);
    if(rampAt(s.x,s.s)!==f)continue;
    const g=gradientAt(s.x,s.s);
    const incoming=f.parkLine ? (groundHeight(s.x,s.s)-groundHeight(s.x-f.dx*2,s.s-f.ds*2))/2 : null;
    step(s,{charge:true},1/30);
    if(s.railCrash)continue;
    checked++;
    assert.ok(s.airborne,`${f.name}: must leave the crest`);
    const tangent=Math.max(-s.speed,Math.min(10,incoming===null ? g.x*s.vx+g.s*s.vs : incoming*s.speed));
    if(f.kind==='quarterpipe') {
      assert.ok(Math.abs(s.vy/s.speed-f.lipSlope)<1e-8,`${f.name}: redirect velocity along the upright wall`);
      assert.ok(Math.hypot(s.speed,s.vy)<=38,`${f.name}: redirect without adding speed`);
    } else assert.ok(Math.abs(s.vy-tangent)<1e-8,`${f.name}: must carry terrain momentum without a boost`);
    assert.ok(s.vy<=(s.quarterpipeFlight?38:15),`${f.name}: automatic takeoff exceeds incoming momentum or the normal pop limit`);
  }
  assert.ok(checked>500,'the regression covers the bulk of authored takeoffs');
});

mountainTest('a held Space charge can pop shortly after leaving a lip',()=>{
  const f=FEATURES.find(feature=>feature.name==='FIRST LIGHT');
  const s=atFeature(f,-.2,38,1);
  step(s,{charge:true},1/120);
  for(let i=0;i<6;i++)step(s,{charge:true},1/120);
  const before=s.vy;
  step(s,{pop:true,flip:1},1/120);
  assert.ok(s.vy>before && s.vy<=15,'late release adds lift within the upward limit');
  assert.ok(s.flipVelocity>0,'late release keeps takeoff trick input');
  const after=s.vy;
  step(s,{pop:true},1/120);
  assert.ok(s.vy<after,'the grace pop is consumed only once');
});

mountainTest('the after-lip pop window expires',()=>{
  const f=FEATURES.find(feature=>feature.name==='FIRST LIGHT');
  const s=atFeature(f,-.2,38,1);
  step(s,{charge:true},1/120);
  for(let i=0;i<48;i++)step(s,{charge:true},1/120);
  const before=s.vy;
  step(s,{pop:true},1/120);
  assert.ok(s.vy<before,'a late release outside the grace window adds no impulse');
});

mountainTest('releasing Space a quarter-second after a ledge still adds the stored pop and height',()=>{
  const f=FEATURES.find(feature=>feature.name==='FIRST LIGHT');
  for(const hz of [30,60,120]) for(const charge of [.2,1]) {
    const s=atFeature(f,-.2,38,charge),held=atFeature(f,-.2,38,charge),dt=1/hz;
    for(const state of [s,held]) {
      step(state,{charge:true},dt);
      assert.ok(state.airborne,'fixture must ski off the ledge');
      for(let i=0;i<Math.round(.25*hz);i++)step(state,{charge:true},dt);
      assert.ok(state.airborne,'release must happen before landing');
    }
    step(s,{pop:true,flip:1},dt);
    step(held,{charge:true},dt);
    assert.ok(s.vy>held.vy+6 && s.vy<=15,`${hz}Hz: late release adds the normal bounded impulse`);
    assert.ok(s.y>held.y,`${hz}Hz: release gains height over holding Space`);
    assert.ok(s.flipVelocity>0,'release still sets takeoff trick momentum');
    const after=s.vy;
    step(s,{pop:true},dt);
    assert.ok(s.vy<after,'a second release cannot stack another pop');
  }
});

mountainTest('a late release cannot add a pop unless Space was held over the ledge',()=>{
  const f=FEATURES.find(feature=>feature.name==='FIRST LIGHT');
  const s=atFeature(f,-.2,38,0);
  step(s,{},1/120);
  assert.ok(s.airborne);
  for(let i=0;i<12;i++)step(s,{charge:true},1/120);
  const before=s.vy;
  step(s,{pop:true},1/120);
  assert.ok(s.vy<before,'charging only in the air must not enable a jump');
});
