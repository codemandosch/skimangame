import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FEATURES, groundHeight } from '../../src/blackridge.js';
import { createWorld } from '../../src/world.js';

const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(52,innerWidth/innerHeight,.1,30000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
document.body.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement),world=createWorld(scene);
let state;
function show(name) {
  const f=FEATURES.find(feature=>feature.name===name),u=120;
  const x=f.x+f.dx*u,s=f.s+f.ds*u,y=groundHeight(x,s);
  state={x,s,y,time:0};
  const cx=f.x-f.dx*160+f.ds*420,cs=f.s-f.ds*160-f.dx*420;
  camera.position.set(cx,Math.max(groundHeight(cx,cs),groundHeight(f.x,f.s))+400,-cs);
  controls.target.set(x,y+30,-s);controls.update();
  document.querySelector('#status').textContent=`${name} · approach, raised catch bowl and rolling exit · drag to orbit`;
}
document.querySelector('#crown').onclick=()=>show('CROWN FALL');
document.querySelector('#bell').onclick=()=>show('BELL TOWER');
document.querySelector('#wide').onclick=()=>{
  state={x:0,s:0,y:1960,time:0};camera.position.set(-3000,3400,3400);
  controls.target.set(0,950,0);controls.update();
  document.querySelector('#status').textContent='Shorter, staggered ridges across the mountain · drag to orbit';
};
show('CROWN FALL');
function frame(){world.update(state);renderer.render(scene,camera);requestAnimationFrame(frame);}frame();
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
