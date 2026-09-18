import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { TREES,TREE_LINE,BASE_HEIGHT,SUMMIT_HEIGHT,FEATURES,treeCollision } from '../src/blackridge.js';
import { selectCourse,groundHeight } from '../src/course.js';
import { createEffects } from '../src/effects.js';
import { snowLaunch,advanceSnow } from '../src/snow-dynamics.js';

test('sparse firs exist only below half elevation, separated and clear of authored jump corridors',()=>{
  assert.equal(TREE_LINE,BASE_HEIGHT+(SUMMIT_HEIGHT-BASE_HEIGHT)*.5);
  assert.ok(TREES.length>=80 && TREES.length<=160,`${TREES.length} trees`);
  for(const [i,t] of TREES.entries()) {
    assert.ok(t.y<TREE_LINE);
    assert.equal(treeCollision(t.x,t.s),t);
    for(const other of TREES.slice(i+1))assert.ok(Math.hypot(t.x-other.x,t.s-other.s)>=17);
    for(const f of FEATURES.filter(f=>!f.small && !f.snowfield)) {
      const x=t.x-f.x,s=t.s-f.s,u=x*f.dx+s*f.ds,v=x*f.ds-s*f.dx;
      assert.ok(!(u > -f.length-25 && u < f.catchLength+75 && Math.abs(v)<f.width+18),f.name);
    }
  }
});

test('shipped Blender firs have three upright, game-scale variants with bark, needles and snow',async()=>{
  const bytes=await readFile(new URL('../public/models/snow-firs.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  for(let i=0;i<3;i++) {
    const tree=gltf.scene.getObjectByName(`AlpineFir_${i}`);assert.ok(tree);
    const size=new THREE.Box3().setFromObject(tree).getSize(new THREE.Vector3());
    assert.ok(size.y>8 && size.y<12,`${size.y}m tall`);
    assert.ok(size.x>3 && size.x<9);
    assert.equal(tree.children.length,3);
    for(const mesh of tree.children)assert.ok(mesh.geometry.attributes.color,'vertex-colored boughs');
    const low=gltf.scene.getObjectByName(`AlpineFir_${i}_LOD`);assert.ok(low);
    const triangles=root=>root.children.reduce((sum,m)=>sum+m.geometry.index.count/3,0);
    assert.ok(triangles(low)<triangles(tree)*.3,'distant meshes reduce rendering cost');
  }
});

test('powder launch follows travel heading on every mountain face',()=>{
  const launch=heading=>snowLaunch({heading,speed:24,steer:.4,vx:-Math.sin(heading)*24,vs:Math.cos(heading)*24},1,false,()=>.5);
  const a=launch(0),b=launch(Math.PI/2),c=launch(Math.PI);
  assert.ok(Math.abs(a.vx+b.vz)<1e-9);assert.ok(Math.abs(a.vz-b.vx)<1e-9);
  assert.ok(Math.abs(a.vx+c.vx)<1e-9);assert.ok(Math.abs(a.vz+c.vz)<1e-9);
});

test('powder drag is frame-rate independent and crystals settle above terrain',()=>{
  const start={x:0,y:20,z:0,vx:8,vy:3,vz:-10,drag:2.2,life:3};
  const a={...start},b={...start};
  advanceSnow(a,.5,()=>-100);
  for(let i=0;i<30;i++)advanceSnow(b,1/60,()=>-100);
  for(const key of ['x','y','z','vx','vy','vz'])assert.ok(Math.abs(a[key]-b[key])<1e-9,key);
  const p={...start,y:.03,vy:-3};advanceSnow(p,.1,()=>0);
  assert.equal(p.y,.025);assert.equal(p.settled,true);assert.ok(p.life<=.12);
});

test('ski tracks follow both terrains, survive long runs, break over jumps and clear on restart',()=>{
  for(const course of ['blackridge','bluebird']) {
    selectCourse(course);
    const scene=new THREE.Scene(),effects=createEffects(scene);
    const state={x:0,s:0,y:groundHeight(0,0),heading:0,speed:.8,steer:0,event:0};
    const tracks=()=>scene.children.filter(m=>m.name.startsWith('Ski tracks'));
    // Slow-speed path deliberately exceeds one GPU chunk, with no rendering.
    for(let i=0;i<1100;i++) {state.s=i*.5;state.y=groundHeight(0,state.s);effects.update(state,.001);}
    assert.equal(tracks().length,2);
    const first=tracks()[0],position=first.geometry.attributes.position;
    const start=position.getZ(0),count=tracks().reduce((n,t)=>n+t.geometry.drawRange.count,0);
    for(let i=0;i<position.count;i+=43) {
      const offset=position.getY(i)-groundHeight(position.getX(i),-position.getZ(i));
      assert.ok(offset>.02 && offset<.052,`${course} ${offset}`);
    }
    effects.update({...state,s:state.s+1,airborne:true},.016);
    effects.update({...state,s:state.s+2},.016);
    assert.equal(tracks().reduce((n,t)=>n+t.geometry.drawRange.count,0),count,'landing does not bridge the flight');
    effects.update({...state,s:state.s+3},.016);
    assert.equal(position.getZ(0),start,'earliest tracks remain intact');
    effects.update({...state,s:state.s+4,paused:true},.016);
    effects.reset();assert.equal(tracks().length,1);assert.equal(tracks()[0].geometry.drawRange.count,0);
    scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  }
  selectCourse('bluebird');
});
