import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createWorld } from '../../src/world.js';
import { RESORT, townPoint } from '../../src/resort-layout.js';
import { groundHeight, selectCourse } from '../../src/course.js';

selectCourse('blackridge');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,30000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
document.body.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement),world=createWorld(scene);
let state;
const selector=document.querySelector('#town');
RESORT.towns.forEach((town,i)=>selector.add(new Option(town.name,i)));
function show(street=false) {
  scene.fog.near=1200;scene.fog.far=6800;
  const town=RESORT.towns[Number(selector.value)],p=townPoint(town,street?-245:320,street?0:-380);
  const target=street?townPoint(town,-40,0):town;
  const y=groundHeight(p.x,p.s);
  state={x:p.x,s:p.s,y,time:0};
  camera.position.set(p.x,y+(street?2.5:190),-p.s);
  controls.target.set(target.x,groundHeight(target.x,target.s)+(street?8:12),-target.s);controls.update();
  document.querySelector('#status').textContent=`${town.name} · ${street?'Promenade':'Ski approach'} · drag to orbit`;
}
selector.onchange=()=>show();
document.querySelector('#approach').onclick=()=>show();
document.querySelector('#street').onclick=()=>show(true);
document.querySelector('#wide').onclick=()=>{
  // The review camera sits outside the normal play area.
  scene.fog.near=6500;scene.fog.far=18000;
  state={x:0,s:0,y:1960,time:0};camera.position.set(4000,4200,4300);
  controls.target.set(0,650,0);controls.update();
  document.querySelector('#status').textContent='Six villages and their connected valley road · drag to orbit';
};
show();
function frame(){world.update(state);renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
