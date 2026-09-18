import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3, Scene } from 'three';
import { selectCourse, COURSE } from '../src/course.js';
import { getLiftLayout,cablePoint,liftCoordinates,RAIL_HEIGHT,cableTowerHit } from '../src/lift-layout.js';
import { createState,step,respawn } from '../src/physics.js';
import { keyboardInput,releaseKey } from '../src/controls.js';
import { riderRotation } from '../src/aerial-rotation.js';
import { createEffects,snowSprayRate } from '../src/effects.js';
import { createSkiLift } from '../src/lift-world.js';
import { catchCable } from '../src/cable-physics.js';
const dt=1/120;

function drop(u,options={}) {
  const layout=getLiftLayout(),p=cablePoint(layout,options.cable || 0,u),speed=options.speed ?? 27;
  const state=createState();
  Object.assign(state,{x:p.x,s:p.s,y:p.y+.2,speed:Math.abs(speed),vx:layout.dx*speed,vs:layout.ds*speed,
    vy:p.grade*speed-10,heading:layout.heading,airborne:true,airtime:1,started:true},options.state);
  for(let i=0;i<8&&!state.railing;i++)step(state,options.input || {},dt);
  return state;
}
function middle(index) {
  const layout=getLiftLayout();index ??= Math.floor((layout.towers.length-1)/2);
  return (layout.towers[index].u+layout.towers[index+1].u)/2;
}

test('lift spans summit to base, clears ridges, and renders the collision cables exactly',()=>{
  for(const map of ['blackridge','bluebird']) {
    selectCourse(map);const layout=getLiftLayout();
    assert.ok(layout.length>=COURSE.LENGTH*.99);
    assert.ok(layout.towers[0].ground>layout.towers.at(-1).ground);
    for(let cable=0;cable<2;cable++)for(let u=0;u<=layout.length;u+=1.1) {
      const p=cablePoint(layout,cable,u);
      assert.ok(p.y-COURSE.sceneryHeight(p.x,p.s)>5.6,`${map} ${u}: buried cable`);
    }
    const scene=new Scene(),lift=createSkiLift(scene);lift.update(40);
    for(let cable=0;cable<2;cable++) {
      const mesh=scene.getObjectByName(`Rideable lift cable ${cable}`);
      for(const t of [.12,.43,.82]) {
        const rendered=mesh.geometry.parameters.path.getPoint(t),physical=cablePoint(layout,cable,t*layout.length);
        assert.ok(rendered.distanceTo(new Vector3(physical.x,physical.y,-physical.s))<1e-8);
      }
    }
    scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
});

test('landing snaps onto either cable and stays attached through changing cable slope',()=>{
  selectCourse('blackridge');
  for(const cable of [0,1]) {
    const state=drop(middle(),{cable});assert.ok(state.railing);assert.equal(state.rail.cable,cable);
    const start=state.rail.u;
    for(let i=0;i<40;i++) {
      step(state,{},dt);assert.ok(state.railing);
      const p=cablePoint(getLiftLayout(),cable,state.rail.u);
      assert.ok(Math.abs(state.y-p.y-RAIL_HEIGHT)<1e-8);
      assert.ok(Math.hypot(state.x-p.x,state.s-p.s)<1e-8);
    }
    assert.ok(state.rail.u>start);assert.equal(state.airborne,false);
    const skis=new Vector3(0,0,-1).applyQuaternion(riderRotation(state,new Quaternion()));
    assert.ok(Math.abs(skis.z)<1e-8,'skis perpendicular to travel');
  }
});

test('sparse ridge supports leave long uninterrupted rails without oversized towers',()=>{
  selectCourse('blackridge');const layout=getLiftLayout();
  assert.ok(layout.towers.length-2<=10,'keep the support count low');
  for(const tower of layout.towers)assert.ok(tower.y-tower.ground<75,'support should sit near a ridge');
  for(let index=1;index<layout.towers.length-1;index++) {
    const start=layout.towers[index],end=layout.towers[index+1];
    assert.ok(end.u-start.u>=180-1e-8,'no clusters after the summit approach');
    for(const cable of [0,1]) {
      const s=drop(start.u+8,{cable,speed:45});
      for(let frame=0;frame<180;frame++) {
        step(s,{},1/60);
        assert.ok(s.railing,`span ${index}: at least three seconds of fast railing without a pop`);
      }
    }
  }
});

test('magnetic capture catches close side and rising underside approaches on either wire',()=>{
  selectCourse('blackridge');const u=middle(),layout=getLiftLayout();
  for(const cable of [0,1])for(const offset of [-1.2,1.2]) {
    const p=cablePoint(layout,cable,u);
    const s=drop(u,{cable,state:{x:p.x+layout.ds*offset,s:p.s-layout.dx*offset,y:p.y-.3,vy:12}});
    assert.ok(s.railing);assert.equal(s.rail.cable,cable);
    for(let i=0;i<30;i++)step(s,{},dt);
    assert.ok(s.railing,'magnetic capture stays attached');
  }
});

test('cable capture waits for contact height and sweeps fast landings on sloping wires',()=>{
  const api={resolveLanding(){},event(){}};
  for(const map of ['blackridge','bluebird']) {
    selectCourse(map);const layout=getLiftLayout();
    for(const index of [0,Math.floor(layout.towers.length/2)])for(const cable of [0,1]) {
      const u=middle(index),p=cablePoint(layout,cable,u),q=cablePoint(layout,cable,u+2);
      for(const clearance of [.01,.2,.7]) {
        const from={...p,y:p.y+RAIL_HEIGHT+clearance+.1};
        const s=Object.assign(createState(),{x:q.x,s:q.s,y:q.y+RAIL_HEIGHT+clearance,
          airborne:true,heading:layout.heading,vx:layout.dx*30,vs:layout.ds*30,vy:-30});
        assert.equal(catchCable(s,from,{},api),false,`${map}: still ${clearance}m above wire`);
      }
      for(const fall of [.2,4]) {
        const from={...p,y:p.y+RAIL_HEIGHT+.1};
        const s=Object.assign(createState(),{x:q.x,s:q.s,y:q.y+RAIL_HEIGHT-fall,
          airborne:true,heading:layout.heading,vx:layout.dx*30,vs:layout.ds*30,vy:-120});
        assert.equal(catchCable(s,from,{},api),true,`${map}: swept landing`);
        assert.equal(s.rail.cable,cable);
        assert.ok(s.rail.u>=u && s.rail.u<=u+2);
        assert.ok(Math.abs(s.y-cablePoint(layout,cable,s.rail.u).y-RAIL_HEIGHT)<1e-8);
      }
    }
  }
});

test('cable capture rejects wide lateral misses, including a crossing that ends near the wire',()=>{
  selectCourse('blackridge');const layout=getLiftLayout(),u=middle();
  const api={resolveLanding(){},event(){}};
  for(const cable of [0,1])for(const side of [-1,1])for(const offset of [2.1,2.5]) {
    const p=cablePoint(layout,cable,u);
    const from={x:p.x+layout.ds*side*offset,s:p.s-layout.dx*side*offset,y:p.y+RAIL_HEIGHT+.2};
    const s=Object.assign(createState(),from,{y:p.y+RAIL_HEIGHT-.6,airborne:true,vy:-30});
    assert.equal(catchCable(s,from,{},api),false,'distant side approach');
    s.x=p.x;s.s=p.s;
    assert.equal(catchCable(s,from,{},api),false,'outside reach when crossing the cable height');
  }
});

test('magnetic capture rejects distant, grounded and inverted skiers',()=>{
  selectCourse('blackridge');const u=middle(),p=cablePoint(getLiftLayout(),0,u);
  assert.equal(drop(u,{state:{x:p.x-5}}).railing,false);
  assert.equal(drop(u,{state:{y:p.y+7}}).railing,false);
  assert.equal(drop(u,{state:{y:COURSE.groundHeight(p.x,p.s),airborne:false}}).railing,false);
  assert.equal(drop(u,{state:{flip:Math.PI}}).railing,false);
  assert.equal(drop(u,{state:{daffyProgress:1}}).railing,false);
});

test('authored snow jumps can actually reach the lift cables during ordinary gameplay',()=>{
  selectCourse('blackridge');const layout=getLiftLayout();
  for(const index of [0,2,5,10,16])for(const cable of [0,1]) {
    const f=COURSE.LIFT_KICKERS[index],u=liftCoordinates(layout,f.x,f.s).u-3;
    const p=cablePoint(layout,cable,u),s=createState();
    Object.assign(s,{x:p.x,s:p.s,y:COURSE.groundHeight(p.x,p.s),heading:layout.heading,
      speed:36,vx:layout.dx*36,vs:layout.ds*36,started:true,charge:1});
    step(s,{pop:true},dt);
    for(let i=0;i<900 && !s.railing && s.airborne && !s.railCrash;i++)step(s,{},dt);
    assert.ok(s.railing,`snow takeoff at ${u}m did not reach a cable`);
  }
});

test('the lift follows a gentle cross-slope corridor with clear snow approaches',()=>{
  const layout=getLiftLayout(),slopes=[];
  for(let u=40;u<2000;u+=8)for(const lateral of [-6,0,6]) {
    const x=layout.top.x+layout.dx*u+layout.ds*lateral;
    const s=layout.top.s+layout.ds*u-layout.dx*lateral;
    const g=COURSE.gradientAt(x,s);
    slopes.push(Math.abs(g.x*layout.ds-g.s*layout.dx));
  }
  slopes.sort((a,b)=>a-b);
  assert.ok(slopes.reduce((a,b)=>a+b)/slopes.length<.2,'average sideways grade stays under 20%');
  assert.ok(slopes[Math.floor(slopes.length*.9)]<.3,'90% of the corridor has less than 30% sideways grade');
  for(const log of COURSE.LOGS)for(let u=0;u<=log.length;u+=1) {
    const p=liftCoordinates(layout,log.x+log.dx*u,log.s+log.ds*u);
    assert.ok(p.u<=-20 || p.u>=layout.length+20 || Math.abs(p.lateral)>=18,'timber stays clear of lift approaches');
  }
});

test('each left/right press spins exactly 180 in the requested direction without leaving the wire',()=>{
  selectCourse('blackridge');
  for(const direction of [-1,1]) {
    const s=drop(middle()),start=s.railYaw;
    let prior=start;
    for(let i=0;i<70;i++) {
      step(s,{steer:direction,spin:direction},dt);
      assert.ok(s.railing);assert.ok((s.railYaw-prior)*direction>=-1e-9);prior=s.railYaw;
    }
    assert.ok(Math.abs(s.railYaw-start-direction*Math.PI)<1e-8,'holding does not repeat');
    step(s,{},dt);
    for(let i=0;i<48;i++)step(s,{steer:-direction},dt);
    assert.ok(Math.abs(s.railYaw-start)<1e-8,'opposite press reverses the 180 direction');
  }
});

test('Space only pops on release, including when held before cable capture',()=>{
  selectCourse('blackridge');
  for(const heldAtCapture of [false,true]) {
    const keys=new Set(heldAtCapture?['Space']:[]);
    const s=drop(middle(),{input:keyboardInput(keys)});assert.ok(s.railing);
    keys.add('Space');
    for(let i=0;i<30;i++) {
      step(s,keyboardInput(keys),dt);
      assert.ok(s.railing,'pressing and holding Space must keep sliding');
    }
    step(s,keyboardInput(keys,releaseKey(keys,'Space')),dt);
    assert.equal(s.railing,false);assert.ok(s.airborne);assert.ok(s.railCooldown>0);
    assert.equal(releaseKey(keys,'Space'),false,'duplicate release does not pop');
  }
});

test('quick release pops survive capture cooldown, and pause/restart reset rail state',()=>{
  selectCourse('blackridge');
  const tapped=drop(middle()),incoming={vx:tapped.vx,vy:tapped.vy,vs:tapped.vs};
  step(tapped,{pop:true},dt);
  const impulse=Math.hypot(tapped.vx-incoming.vx,tapped.vy-incoming.vy,tapped.vs-incoming.vs);
  assert.ok(impulse>=10 && impulse<12,'rail pop stays below the old 12.5 m/s impulse');
  assert.ok(tapped.airborne);assert.equal(tapped.railing,false);
  for(let i=0;i<36;i++) {
    step(tapped,{},dt);
    assert.equal(tapped.railing,false,'magnet must not cancel an outgoing pop');
  }
  const paused=drop(middle()),u=paused.rail.u;paused.paused=true;
  step(paused,{pop:true,steer:1},dt);assert.equal(paused.rail.u,u);assert.ok(paused.railing);
  respawn(paused);assert.equal(paused.rail,null);assert.equal(paused.railing,false);assert.equal(paused.railCooldown,0);
});

test('holding left or right on a cable pop gives an immediate sideways exit',()=>{
  selectCourse('blackridge');
  for(const cable of [0,1])for(const direction of [-1,1])for(const steer of [-1,1]) {
    const neutral=drop(middle(),{cable,speed:direction*27});
    const aimed=drop(middle(),{cable,speed:direction*27});
    const heading=aimed.heading;
    step(neutral,{pop:true},dt);
    step(aimed,keyboardInput(new Set([steer>0?'ArrowRight':'ArrowLeft']),true),dt);
    const dx=aimed.vx-neutral.vx,ds=aimed.vs-neutral.vs;
    assert.ok(steer*(dx*Math.cos(heading)+ds*Math.sin(heading))>=5,
      'the pop immediately carries the skier toward the pressed direction');
    assert.ok(Math.abs(-dx*Math.sin(heading)+ds*Math.cos(heading))<1e-8,'retain travel along the cable');
    assert.equal(aimed.vy,neutral.vy,'retain the normal pop height');
    assert.equal(aimed.heading,heading,'steering does not snap the camera heading');
    assert.ok(aimed.airborne && !aimed.railing);
  }
});

test('steering after a cable pop clears the snap range at different frame rates',()=>{
  selectCourse('blackridge');
  for(const cable of [0,1])for(const direction of [-1,1])for(const steer of [-1,1]) {
    const offsets=[];
    for(const hz of [30,60,120]) {
      const s=drop(middle(),{cable,speed:direction*27}),heading=s.heading;
      const start={x:s.x,s:s.s};
      step(s,{pop:true},1/hz);
      for(let i=0;i<hz*.1;i++)step(s,{},1/hz);
      const input=keyboardInput(new Set([steer>0?'ArrowRight':'ArrowLeft']));
      for(let i=0;i<hz*.5;i++)step(s,input,1/hz);
      const offset=steer*((s.x-start.x)*Math.cos(heading)+(s.s-start.s)*Math.sin(heading));
      assert.ok(offset>2,`${hz}Hz: steering must move clear of the 1.5m snap range`);
      assert.ok(s.airborne && !s.railing,'directional pop remains clear of the wire');
      const lateral=steer*(s.vx*Math.cos(heading)+s.vs*Math.sin(heading));
      assert.ok(lateral>7 && lateral<=12.01,'strong sideways control with bounded speed');
      offsets.push(offset);
    }
    assert.ok(Math.max(...offsets)-Math.min(...offsets)<.3,'similar steering across frame rates');
  }
});

test('cable flight steering can reverse direction and stops accelerating on release',()=>{
  selectCourse('blackridge');
  const s=drop(middle()),heading=s.heading;
  step(s,{pop:true,steer:1},dt);
  for(let i=0;i<36;i++)step(s,{steer:1},dt);
  const lateral=()=>s.vx*Math.cos(heading)+s.vs*Math.sin(heading);
  assert.ok(lateral()>10 && lateral()<=12.01);
  const before=lateral();
  for(let i=0;i<12;i++)step(s,{},dt);
  assert.ok(Math.abs(lateral()-before)<1e-8,'release preserves momentum without adding sideways speed');
  for(let i=0;i<108;i++)step(s,{steer:-1},dt);
  assert.ok(lateral()<-3,'opposite input can steer the flight back');
});

test('tower hits wipe out, including a fast sweep through the whole support',()=>{
  selectCourse('blackridge');const l=getLiftLayout(),tower=l.towers.at(-3);
  const s=drop(tower.u-9);
  for(let i=0;i<120 && s.railing;i++)step(s,{},dt);
  assert.equal(s.railing,false);assert.ok(s.airborne);assert.ok(s.railCrash);assert.equal(s.eventType,'bail');
  assert.equal(cableTowerHit(l,s,s),null,'rail impact also pushes clear of the tower head');
  for(let i=0;i<30;i++)step(s,{},dt);assert.equal(s.railing,false,'no instant resnap after a crash');
  const a=cablePoint(l,0,tower.u-5),b=cablePoint(l,0,tower.u+5);
  assert.equal(cableTowerHit(l,{...a,y:tower.y},{...b,y:tower.y}),tower);
  assert.equal(cableTowerHit(l,{...a,y:tower.y+3},{...b,y:tower.y+3}),null);
});

test('timed pops clear steep and shallow towers and reconnect beyond them at multiple frame rates',()=>{
  selectCourse('blackridge');
  for(const hz of [30,60,120])for(let index=1;index<getLiftLayout().towers.length-1;index++) {
    const tower=getLiftLayout().towers[index],s=drop(tower.u-6);
    assert.ok(s.railing);step(s,{pop:true},1/hz);
    let reconnected=false;
    for(let i=0;i<hz*8;i++) {
      step(s,{},1/hz);
      assert.equal(s.railCrash,false,`tower ${index}, ${hz}Hz`);
      if(s.railing && s.rail.u>tower.u+2){reconnected=true;break;}
    }
    assert.ok(reconnected,`tower ${index}, ${hz}Hz did not reconnect`);
  }
});

test('skiing into a tower bounces clear, changes heading and recovers without another strike',()=>{
  for(const map of ['blackridge','bluebird'])for(const hz of [30,60,120])for(const side of [-1,1])for(const speed of [0,1,18]) {
    selectCourse(map);const l=getLiftLayout(),tower=l.towers.at(-3),s=createState();
    // A slow, nearly head-on impact used to stop inside the mast and repeat.
    Object.assign(s,{x:tower.x+l.ds*side*.1-l.dx*.95,
      s:tower.s-l.dx*side*.1-l.ds*.95,heading:l.heading,speed,started:true});
    s.y=COURSE.groundHeight(s.x,s.s);
    step(s,{},1/hz);
    assert.ok(s.railCrash,`${map}: impact causes a wipeout`);
    assert.equal(cableTowerHit(l,s,s),null,'impact pushes the skier outside the tower');
    assert.ok((s.vx*l.ds-s.vs*l.dx)*side>=4-1e-9,'recoil moves away from the contacted side');
    assert.ok(Math.abs(s.heading-l.heading)>.3,'impact changes the travel heading');
    assert.ok(s.bailTimer>0);
    let strikes=1,wasCrash=true;
    for(let i=0;i<hz*6;i++) {
      step(s,{},1/hz);
      if(s.railCrash && !wasCrash)strikes++;
      wasCrash=s.railCrash;
    }
    assert.equal(strikes,1,`${map} ${hz}Hz: no repeated tower strike`);
    assert.equal(s.bailTimer,0,'recovery completes');
    assert.equal(s.railCrash,false);
    const heading=s.heading;
    for(let i=0;i<hz/2;i++)step(s,{steer:side,skate:true},1/hz);
    assert.notEqual(s.heading,heading,'steering works after recovery');
  }
});

test('reverse cable travel survives a pop and wire slides do not paint snow tracks below the lift',()=>{
  selectCourse('bluebird');const l=getLiftLayout(),s=drop(middle(),{speed:-18});
  assert.ok(s.railing);assert.ok(s.rail.velocity<0);
  const scene=new Scene(),effects=createEffects(scene);
  for(let i=0;i<10;i++){step(s,{},dt);effects.update(s,dt);}
  assert.equal(snowSprayRate(s),0);
  for(const m of scene.children.filter(o=>o.name.startsWith('Ski tracks')))assert.equal(m.geometry.drawRange.count,0);
  const start=s.s;step(s,{pop:true},dt);step(s,{},dt);assert.ok(s.s<start,'uphill flight keeps its direction');
  selectCourse('bluebird');
});
