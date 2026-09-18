import * as THREE from 'three';
import { createState,step } from '../../src/physics.js';
import { selectCourse } from '../../src/course.js';
import { getLiftLayout,cablePoint } from '../../src/lift-layout.js';
import { createWorld } from '../../src/world.js';
import { createSkier } from '../../src/skier.js';
import { createEffects } from '../../src/effects.js';

selectCourse('blackridge');
const layout=getLiftLayout(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.1,10000);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;document.body.append(renderer.domElement);
const world=createWorld(scene),rider=createSkier(scene),effects=createEffects(scene);
const keys=new Set();let state,auto=false,pop=false,turn=0,cleared=false,accumulator=0,review='landing';
const tower=layout.towers.at(-3);
function reset(mode='drop') {
  const u=tower.u-(mode==='crash'?13:mode==='clear'?27:68),p=cablePoint(layout,0,u),speed=27;
  state=createState();Object.assign(state,{x:p.x,s:p.s,y:p.y+1.2,speed,vx:layout.dx*speed,vs:layout.ds*speed,
    vy:p.grade*speed-2,heading:layout.heading,airborne:true,airtime:.3,started:true});
  auto=mode==='clear';cleared=false;pop=false;turn=0;accumulator=0;keys.clear();effects.reset();world.update(state);
  review=mode==='drop'?'landing':mode;
}
document.querySelector('#drop').onclick=()=>reset();document.querySelector('#crash').onclick=()=>reset('crash');
document.querySelector('#clear').onclick=()=>reset('clear');document.querySelector('#pause').onclick=()=>state.paused=!state.paused;
window.addEventListener('keydown',event=>{
  if(['ArrowLeft','ArrowRight','Space'].includes(event.code))event.preventDefault();
  if(!event.repeat) {
    if(state.paused && ['ArrowLeft','ArrowRight','Space'].includes(event.code)) {
      state.paused=false;review=event.code==='Space'?null:'turn';
    }
    if(event.code==='ArrowLeft')turn=-1;if(event.code==='ArrowRight')turn=1;
    if(event.code==='KeyR')reset();
  }
  keys.add(event.code);
});window.addEventListener('keyup',event=>{
  if(event.code==='Space' && keys.has('Space'))pop=true;
  keys.delete(event.code);
});
reset();let previous=performance.now();
function frame(now) {
  const dt=Math.min((now-previous)/1000,.05);previous=now;
  if(!state.paused) {
    accumulator+=dt;
    while(accumulator>=1/120) {
      if(auto && !cleared && state.railing && tower.u-state.rail.u<=6) {pop=true;cleared=true;}
      step(state,{pop:pop,railTurn:turn,steer:Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'))},1/120);
      pop=false;turn=0;accumulator-=1/120;
      if((review==='landing' && state.railing && state.rail.distance>.5) ||
        (review==='turn' && state.railing && !state.rail.turn) ||
        (review==='clear' && cleared && state.railing && state.rail.u>tower.u+3) ||
        (review==='crash' && state.railCrash && state.bailTimer<1.4)) {
        state.paused=true;review=null;accumulator=0;break;
      }
    }
  }
  world.update(state);rider.update(state,dt);effects.update(state,dt);
  // Side/rear view shows the ski/cable contact and the full support clearance.
  camera.position.set(state.x+layout.ds*10-layout.dx*15,state.y+6.5,-state.s+layout.dx*10+layout.ds*15);
  camera.lookAt(state.x+layout.dx*5,state.y+.3,-state.s-layout.ds*5);
  renderer.render(scene,camera);
  document.querySelector('#pause').textContent=state.paused?'Resume':'Pause';
  document.querySelector('#status').textContent=state.railing ? `CABLE SLIDE · ${state.rail.distance.toFixed(1)} m · ${Math.round(state.railYaw*180/Math.PI)}° · ${state.paused?'PAUSED':'Release Space to pop'}` :
    state.railCrash ? 'TOWER STRIKE · wipeout' : state.airborne ? `${cleared?'POPPED OVER TOWER':'AIRBORNE'} · ${state.airHeight.toFixed(1)} m above snow` : 'ON SNOW · choose a demo to try again';
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
