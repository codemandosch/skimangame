import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createAlpineTrees } from '../../src/alpine-trees.js';
import { createWorld } from '../../src/world.js';
import { createEffects } from '../../src/effects.js';
import { selectCourse,groundHeight } from '../../src/course.js';
import { TREES } from '../../src/blackridge.js';

selectCourse('blackridge');
const view=new URLSearchParams(location.search).get('view') || 'trees';
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,10000);
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;
document.body.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);
let world,effects,state,elapsed=0;
if(view==='trees') {
  scene.background=new THREE.Color('#b2cbdc');
  scene.add(new THREE.HemisphereLight('#c5ddf5','#778e9d',1.25));
  const sun=new THREE.DirectionalLight('#fff0d9',2.7);sun.position.set(-12,22,12);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-20,right:20,top:20,bottom:-20});
  scene.add(sun);
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:'#eff6fc',roughness:.9}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
  createAlpineTrees(scene,[-8,0,8].map(x=>({x,s:0,y:0,scale:1})));
  camera.position.set(19,12,31);controls.target.set(0,4,0);
} else {
  const tree=TREES[14];
  state={x:tree.x,s:tree.s,y:tree.y,time:0,heading:0,speed:18,steer:.6,event:0,airborne:false};
  world=createWorld(scene);world.update(state);
  camera.position.set(tree.x+24,tree.y+18,-tree.s+32);controls.target.set(tree.x,tree.y+4,-tree.s);
  if(view==='snow') {
    effects=createEffects(scene);
    camera.position.set(tree.x+18,tree.y+30,-tree.s+24);
  }
}
controls.update();
document.querySelector('#status').textContent=view==='trees'?'Three Blender fir variants · drag to orbit':view==='mountain'?'Sparse firs below 50% elevation · drag to inspect':'Continuous carving powder and compressed ski tracks';
let previous=performance.now();
function frame(now) {
  const dt=Math.min((now-previous)/1000,.04);previous=now;elapsed+=dt;
  if(view==='snow') {
    const tree=TREES[14],a=elapsed*.6;
    state.x=tree.x+Math.cos(a)*12;state.s=tree.s+Math.sin(a)*12;
    state.y=groundHeight(state.x,state.s);state.vx=-Math.sin(a)*7.2;state.vs=Math.cos(a)*7.2;
    state.heading=a;state.speed=7.2;state.braking=true;state.time=elapsed;
    world.update(state);effects.update(state,dt);
  }
  renderer.render(scene,camera);requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
