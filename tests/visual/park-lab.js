import * as THREE from 'three';
import { createRenderPipeline } from '../../src/render-pipeline.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARK_LINE, groundHeight } from '../../src/blackridge.js';
import { createWorld } from '../../src/world.js';
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.5,30000);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));document.body.append(renderer.domElement);
const pipeline=createRenderPipeline(renderer,scene,camera);
const world=createWorld(scene),controls=new OrbitControls(camera,renderer.domElement);
let state;
function show(feature) {
  const quarter=feature.kind==='quarterpipe';
  const x=feature.x+(quarter?-25:60),y=groundHeight(x,0),distance=quarter?260:230;
  state={x,s:0,y,time:0};world.update(state,camera);
  camera.position.set(x+distance*(quarter?-.8:.1),y+distance*.85,distance);controls.target.set(x,y+15,0);controls.update();
  document.querySelector('#status').textContent=quarter?`${feature.name} · 16 m lip · ${feature.deckLength} m spine · two landing faces · 60 m height ruler`:`${feature.name} · ${feature.gap}m gap · ${feature.landingWidth*2}m × ${feature.landingLength}m landing`;
}
document.querySelector('#jump').onclick=()=>show(PARK_LINE.jumps[0]);
document.querySelector('#last').onclick=()=>show(PARK_LINE.jumps.at(-1));
document.querySelector('#quarter').onclick=()=>show(PARK_LINE.quarterpipe);
show(PARK_LINE.jumps[0]);
function frame(){world.update(state,camera);pipeline.render();requestAnimationFrame(frame);}frame();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();pipeline.setSize(innerWidth,innerHeight);});
