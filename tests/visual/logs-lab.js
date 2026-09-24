import * as THREE from 'three';
import { createRenderPipeline } from '../../src/render-pipeline.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { selectCourse,groundHeight } from '../../src/course.js';
import { createState,step } from '../../src/physics.js';
import { LOGS,logPoint } from '../../src/log-layout.js';
import { createWorld } from '../../src/world.js';
import { createSkier } from '../../src/skier.js';
import { createEffects } from '../../src/effects.js';

selectCourse('blackridge');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,innerWidth/innerHeight,.5,30000);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.append(renderer.domElement);
const pipeline=createRenderPipeline(renderer,scene,camera);
const world=createWorld(scene),rider=createSkier(scene),effects=createEffects(scene),controls=new OrbitControls(camera,renderer.domElement);
let state,log=LOGS[0],review='slide',pop=false,spaceHeld=false,turn=0,accumulator=0;
function reset(next=log) {
  log=next;const p=logPoint(log,-4),speed=28;
  state=createState();Object.assign(state,{x:p.x,s:p.s,y:groundHeight(p.x,p.s),speed,
    vx:log.dx*speed,vs:log.ds*speed,heading:log.heading,started:true});
  review='slide';accumulator=0;pop=false;spaceHeld=false;turn=0;effects.reset();world.update(state,camera);
  const center=logPoint(log,log.length*.5);
  camera.position.set(center.x+log.ds*log.length*.95-log.dx*log.length*.55,center.y+log.length*.42,-center.s+log.dx*log.length*.95+log.ds*log.length*.55);
  controls.target.set(center.x,center.y-1,-center.s);controls.update();
}
document.querySelector('#fallen').onclick=()=>reset(LOGS.find(l=>l.kind==='fallen' && l.grade>-.5));
document.querySelector('#kicker').onclick=()=>reset(LOGS[0]);
document.querySelector('#ride').onclick=()=>{reset();review='takeoff';};
document.querySelector('#pause').onclick=()=>{state.paused=!state.paused;review=null;};
window.addEventListener('keydown',e=>{
  if(['Space','ArrowLeft','ArrowRight'].includes(e.code)) {
    e.preventDefault();state.paused=false;review=null;
    if(!e.repeat) {if(e.code==='Space')spaceHeld=true;else turn=e.code==='ArrowLeft'?-1:1;}
  }
  if(e.code==='KeyR')reset();
});
window.addEventListener('keyup',e=>{
  if(e.code==='Space') {if(spaceHeld)pop=true;spaceHeld=false;}
});
reset();let previous=performance.now();
function frame(now) {
  const dt=Math.min((now-previous)/1000,.05);previous=now;
  if(!state.paused) {
    accumulator+=dt;
    while(accumulator>=1/120) {
      step(state,{pop:pop,railTurn:turn},1/120);pop=false;turn=0;accumulator-=1/120;
      if((review==='slide' && state.railing && state.rail.u>log.length*.45) ||
        (review==='takeoff' && state.airborne && state.airtime>.35)) {
        state.paused=true;review=null;accumulator=0;break;
      }
    }
  }
  world.update(state,camera);rider.update(state,dt);effects.update(state,dt);pipeline.render();
  document.querySelector('#pause').textContent=state.paused?'Resume':'Pause';
  document.querySelector('#status').textContent=`${log.name} · ${log.length.toFixed(0)} m · ${state.railing?'LOG SLIDE':state.airborne?'AIRBORNE':'ON SNOW'}${state.paused?' · PAUSED':''}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();pipeline.setSize(innerWidth,innerHeight);});
