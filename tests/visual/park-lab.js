import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARK_LINE, HANDRAILS, groundHeight } from '../../src/blackridge.js';
import { createWorld } from '../../src/world.js';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,10000);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.03;document.body.append(renderer.domElement);
const world=createWorld(scene),controls=new OrbitControls(camera,renderer.domElement);
let state;
function show(feature,rail=false) {
  const quarter=feature.kind==='quarterpipe';
  const x=feature.x+(rail?feature.length/2:quarter?-25:60),y=groundHeight(x,0),distance=rail?65:quarter?260:230;
  state={x,s:0,y,time:0};world.update(state);
  camera.position.set(x+distance*(quarter?-.8:.1),y+distance*.85,distance);controls.target.set(x,y+15,0);controls.update();
  document.querySelector('#status').textContent=rail?`${feature.name} · ${feature.length}m · 32m entry kicker`:quarter?`${feature.name} · 16 m lip · ${feature.deckLength} m spine · two landing faces · 60 m height ruler`:`${feature.name} · ${feature.gap}m gap · ${feature.landingWidth*2}m × ${feature.landingLength}m landing`;
}
document.querySelector('#jump').onclick=()=>show(PARK_LINE.jumps[0]);
document.querySelector('#rail').onclick=()=>show(HANDRAILS[0],true);
document.querySelector('#last').onclick=()=>show(PARK_LINE.jumps[2]);
document.querySelector('#quarter').onclick=()=>show(PARK_LINE.quarterpipe);
show(PARK_LINE.jumps[0]);
function frame(){world.update(state);renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
