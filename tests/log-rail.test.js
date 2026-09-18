import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGS,logPoint } from '../src/log-layout.js';
import { groundHeight } from '../src/blackridge.js';
import { selectCourse } from '../src/course.js';
import { createState,step,respawn } from '../src/physics.js';
import { keyboardInput,releaseKey } from '../src/controls.js';
import { buildLogGeometry } from '../src/log-world.js';
import { mountainCameraTargets } from '../src/mountain-camera.js';

function approach(log,hz=120,input={},start=-4) {
  selectCourse('blackridge');
  const p=logPoint(log,start),s=createState(),speed=28;
  Object.assign(s,{x:p.x,s:p.s,y:groundHeight(p.x,p.s),speed,vx:log.dx*speed,vs:log.ds*speed,
    heading:log.heading,started:true});
  for(let i=0;i<hz*2 && !s.railing;i++)step(s,input,1/hz);
  return s;
}
function drop(log,overrides={}) {
  selectCourse('blackridge');
  const p=logPoint(log,log.length*.6),s=createState(),speed=20;
  Object.assign(s,{x:p.x,s:p.s,y:p.y+.12,vy:log.grade*speed-10,speed,
    vx:log.dx*speed,vs:log.ds*speed,heading:log.heading,started:true,airborne:true,airtime:.4},overrides);
  for(let i=0;i<4 && !s.railing;i++)step(s,{},1/120);
  return s;
}
function onSnow(log,u,lateral=0,speed=0,turn=0) {
  const p=logPoint(log,u),s=createState(),heading=log.heading+turn;
  const x=p.x+log.ds*lateral,north=p.s-log.dx*lateral;
  Object.assign(s,{x,s:north,y:groundHeight(x,north),speed,heading,started:true,
    vx:-Math.sin(heading)*speed,vs:Math.cos(heading)*speed});
  return s;
}

test('90 long logs have accessible butts and rendered top lines matching contact',()=>{
  assert.equal(LOGS.filter(l=>l.kind==='kicker').length,30);
  assert.equal(LOGS.filter(l=>l.kind==='fallen').length,60);
  for(const log of LOGS) {
    assert.ok(log.length>=(log.kind==='fallen'?38:30));
    assert.ok(Math.abs(log.y-groundHeight(log.x,log.s))<.3,`${log.id} accessible ridge entry`);
    const geometry=buildLogGeometry(log),positions=geometry.getAttribute('position');
    for(let i=0;i<=40;i++) {
      const p=logPoint(log,i/40*log.length),index=i*21;
      assert.ok(Math.hypot(positions.getX(index)-p.x,positions.getY(index)-p.y,positions.getZ(index)+p.s)<.0003);
      assert.ok(p.y>=groundHeight(p.x,p.s)-.025);
    }
    geometry.dispose();
  }
});
test('every log can be entered from snow, slid fully and exited at 30/60/120 Hz',()=>{
  for(const hz of [30,60,120])for(const log of LOGS) {
    const s=approach(log,hz);
    assert.equal(s.rail?.log,log.id,`${log.id} approach at ${hz} Hz`);
    for(let i=0;i<hz*4 && s.railing;i++) {
      step(s,{},1/hz);
      if(s.railing)assert.ok(Math.abs(s.y-logPoint(log,s.rail.u).y)<1e-8);
    }
    assert.equal(s.railing,false);assert.ok(s.airborne);assert.ok(s.railCooldown>0);
    assert.ok(s.vy<=15,`${log.id}: log exit exceeds the upward launch limit`);
    if(log.kind==='kicker')assert.ok(s.vy>3,`${log.id} launches upward`);
    for(let i=0;i<hz*18 && s.airborne;i++)step(s,{},1/hz);
    assert.equal(s.airborne,false,`${log.id} returns to snow`);assert.equal(s.bailTimer,0);
  }
});
test('long snow-ridge approaches feed onto raised timber at every frame rate',()=>{
  for(const log of LOGS.filter(l=>l.kind==='fallen')) {
    for(let u=10;u<log.length-3;u+=2) {
      const p=logPoint(log,u),exposed=p.y-groundHeight(p.x,p.s);
      assert.ok(exposed>.3 && exposed<.65,`${log.id} supported, exposed trunk at ${u}`);
    }
    for(const hz of [30,60,120]) {
      const s=approach(log,hz,{},-20);
      assert.equal(s.rail?.log,log.id,`${log.id} full ridge approach at ${hz} Hz`);
    }
  }
});
test('top landings catch; misses, underside, inverted and daffy approaches do not',()=>{
  const log=LOGS[0],p=logPoint(log,log.length*.6);
  assert.equal(drop(log).rail?.kind,'log');
  assert.equal(drop(log,{x:p.x+log.ds*2,s:p.s-log.dx*2}).railing,false);
  assert.equal(drop(log,{y:p.y-1,vy:12}).railing,false);
  assert.equal(drop(log,{flip:Math.PI}).railing,false);
  assert.equal(drop(log,{daffyProgress:1}).railing,false);
});
test('Space only pops on release, including when held before log capture',()=>{
  for(const heldAtCapture of [false,true]) {
    const keys=new Set(heldAtCapture?['Space']:[]);
    const s=approach(LOGS[0],120,keyboardInput(keys));assert.ok(s.railing);
    keys.add('Space');
    for(let i=0;i<30;i++) {
      step(s,keyboardInput(keys),1/120);
      assert.ok(s.railing,'pressing and holding Space must keep sliding');
    }
    const vy=s.vy;
    step(s,keyboardInput(keys,releaseKey(keys,'Space')),1/120);
    assert.equal(s.railing,false);assert.ok(s.airborne);assert.ok(s.vy>=vy+5 && s.vy<vy+7);
    assert.equal(releaseKey(keys,'Space'),false,'duplicate release does not pop');
  }
});

test('log controls support a single held 180, pop, cooldown, pause and respawn',()=>{
  const s=approach(LOGS[0],120,{charge:true}),yaw=s.railYaw;
  step(s,{charge:true},1/120);assert.ok(s.railing,'held approach Space is consumed');
  for(let i=0;i<50;i++)step(s,{charge:true,steer:1},1/120);
  assert.ok(Math.abs(s.railYaw-yaw-Math.PI)<1e-8);
  s.paused=true;const u=s.rail.u;step(s,{pop:true},1/120);assert.equal(s.rail.u,u);
  s.paused=false;const vy=s.vy;step(s,{pop:true},1/120);
  assert.ok(s.airborne);assert.equal(s.railing,false);assert.ok(s.vy>=vy+5 && s.vy<vy+7);
  step(s,{},1/120);assert.equal(s.railing,false);
  respawn(s);assert.equal(s.rail,null);assert.equal(s.railCooldown,0);
});
test('reverse landings preserve travel and exit the entry end',()=>{
  const log=LOGS[0],s=drop(log,{vx:-log.dx*18,vs:-log.ds*18,vy:-log.grade*18-10});
  assert.ok(s.railing);assert.ok(s.rail.velocity<0);
  const u=s.rail.u;step(s,{},1/120);assert.ok(s.rail.u<u);
  for(let i=0;i<1200 && s.railing;i++)step(s,{},1/120);
  assert.equal(s.railing,false);assert.ok(s.airborne);assert.ok(s.vx*log.dx+s.vs*log.ds<0);
});

test('ski overlap anywhere along a snowy trunk immediately snaps into railing',()=>{
  for(const hz of [30,60,120])for(const log of LOGS.filter(l=>l.kind==='fallen')) {
    for(const fraction of [.15,.5,.85])for(const speed of [0,1,56])for(const side of [-1,1]) {
      // Ski tips overlap the side even while the boots are outside the bark.
      const s=onSnow(log,log.length*fraction,side*(log.radius+1),speed,side*Math.PI/2);
      step(s,{},1/hz);
      assert.equal(s.rail?.log,log.id,`${log.id} side ${side}, speed ${speed}, ${hz} Hz`);
      assert.ok(s.speed>=32-1e-8);
    }
    for(const turn of [0,Math.PI]) {
      const s=onSnow(log,log.length*.5,0,1,turn);
      step(s,{},1/hz);
      assert.equal(s.rail?.log,log.id,'already-overlapping skis attach at low speed');
      assert.equal(Math.sign(s.rail.velocity),turn===0?1:-1);
    }
  }
});

test('snow capture stays local and respects pop cooldown and recovery',()=>{
  const log=LOGS.find(l=>l.kind==='fallen');
  for(const overrides of [{railCooldown:.3},{bailTimer:1},{railCrash:true},{daffyProgress:1}]) {
    const s=Object.assign(onSnow(log,log.length*.5),overrides);
    step(s,{},1/120);assert.equal(s.railing,false);
  }
  const miss=onSnow(log,log.length*.5,4,1,Math.PI/2);
  step(miss,{},1/120);assert.equal(miss.railing,false);
  const kicker=LOGS.find(l=>l.kind==='kicker'),under=onSnow(kicker,kicker.length*.7,0,1);
  assert.ok(logPoint(kicker,kicker.length*.7).y-under.y>2);
  step(under,{},1/120);assert.equal(under.railing,false,'cannot snap from far below a ledge log');
});

test('trunk capture, rail turns and release keep the normal follow camera',()=>{
  for(const log of LOGS) {
    const s=approach(log);
    assert.ok(s.railing);
    const normal=()=>mountainCameraTargets({...s,railing:false,rail:null});
    assert.deepEqual(mountainCameraTargets(s),normal(),`${log.id} capture camera`);
    for(let i=0;i<48;i++)step(s,{steer:1},1/120);
    assert.ok(s.railing);
    assert.deepEqual(mountainCameraTargets(s),normal(),`${log.id} 180 camera`);
    step(s,{pop:true},1/120);
    assert.deepEqual(mountainCameraTargets(s),normal(),`${log.id} release camera`);
  }
});

test('uphill timber preserves fast entries and gives slow entries a strong automatic launch',()=>{
  for(const hz of [30,60,120])for(const log of LOGS.filter(l=>l.kind==='kicker')) {
    for(const speed of [5,40]) {
      const s=drop(log,{vx:log.dx*speed,vs:log.ds*speed,speed,vy:log.grade*speed-10});
      assert.ok(s.railing,`${log.id} captures at ${speed}`);
      const entrySpeed=s.speed;
      assert.ok(entrySpeed>=32-1e-8);
      for(let i=0;i<hz*3 && s.railing;i++) {
        step(s,{},1/hz);
        assert.ok(Math.abs(s.speed-entrySpeed)<1e-8,`${log.id} carries uphill speed`);
      }
      assert.equal(s.railing,false);
      assert.ok(s.airborne);
      assert.ok(s.vy>=7,`${log.id} launches upward without Space`);
      assert.ok(s.vx*log.dx+s.vs*log.ds>=32-1e-8);
    }
  }
});
