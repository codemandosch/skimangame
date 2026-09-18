import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { groundFrame } from '../src/ground-frame.js';
import { groundHeight, FEATURES } from '../src/blackridge.js';
import { buildMountainTile, createMountainWorld } from '../src/mountain-world.js';
import { mountainCameraTargets, constrainMountainCamera } from '../src/mountain-camera.js';

test('turning on a compound slope keeps the ski plane aligned with the snow',()=>{
  const height=(x,s)=>.75*x-.9*s;
  for(let i=0;i<32;i++) {
    const yaw=i*Math.PI/16,frame=groundFrame(0,0,yaw,height);
    const rotation=new THREE.Euler(frame.pitch,yaw,frame.roll,'YXZ');
    for(const x of [-.6,.6])for(const z of [-1.5,1.5]) {
      const p=new THREE.Vector3(x,0,z).applyEuler(rotation);
      assert.ok(Math.abs(p.y-height(p.x,-p.z))<1e-9,`heading ${yaw}`);
    }
  }
});
test('nearby terrain triangles and ski collision use identical heights',()=>{
  const f=FEATURES[6],x0=Math.floor(f.x/256)*256,s0=Math.floor(f.s/256)*256;
  const geometry=buildMountainTile(x0,s0,128),p=geometry.attributes.position;
  assert.ok(geometry.attributes.rockAmount.array.every(amount=>amount===0),'sloped terrain must be entirely snow, including steep cliff ramps');
  for(let z=0;z<128;z+=7)for(let x=0;x<128;x+=9) {
    const a=z*129+x,b=a+1,c=a+129,d=c+1;
    for(const [u,v] of [[.2,.3],[.8,.65]]) {
      const visible=u+v<=1 ? p.getY(a)*(1-u-v)+p.getY(b)*u+p.getY(c)*v : p.getY(d)*(u+v-1)+p.getY(b)*(1-v)+p.getY(c)*(1-u);
      assert.ok(Math.abs(visible-groundHeight(x0+(x+u)*2,s0+(z+v)*2))<.0003);
    }
  }
  geometry.dispose();
});
test('moving or restarting updates every contact tile before rendering',()=>{
  const scene=new THREE.Scene(),material=new THREE.MeshBasicMaterial();
  const world=createMountainWorld(scene,material);
  const terrain=scene.children.filter(m=>m.material===material);
  for(const state of [{x:1535,s:1023},{x:-1793,s:-767},{x:0,s:0}]) {
    world.update(state);
    const nearby=terrain.filter(m=>{
      const p=m.geometry.attributes.position,x=p.getX(0),s=-p.getZ(0);
      return state.x>=x-24 && state.x<=x+280 && state.s>=s-24 && state.s<=s+280;
    });
    assert.equal(nearby.length,4,'all four tiles at a seam must be ready');
    for(const mesh of nearby) assert.equal(mesh.geometry.attributes.position.count,129*129+512);
  }
  scene.traverse(object=>object.geometry?.dispose());material.dispose();
});
test('ski extremities stay above curved terrain through complete turns',()=>{
  for(const f of FEATURES.filter(f=>f.major))for(const distance of [-35,8,80]) {
    const x=f.x+f.dx*distance,s=f.s+f.ds*distance;
    for(let i=0;i<16;i++) {
      const yaw=i*Math.PI/8,frame=groundFrame(x,s,yaw,groundHeight);
      for(const u of [-.65,.65])for(const v of [-1.5,0,1.5]) {
        const p=new THREE.Vector3(u,0,-v).applyEuler(new THREE.Euler(frame.pitch,yaw,frame.roll,'YXZ'));
        assert.ok(groundHeight(x,s)+frame.clearance+p.y>=groundHeight(x+p.x,s-p.z)-.00001);
      }
    }
  }
});
test('orbiting camera stays above terrain and keeps a clear line to the rider',()=>{
  for(const f of FEATURES.filter(f=>f.major))for(let i=0;i<16;i++) {
    const state={x:f.x+f.dx*12,s:f.s+f.ds*12,heading:i*Math.PI/8,airHeight:0};
    state.y=groundHeight(state.x,state.s);
    const {position}=mountainCameraTargets(state);
    position.y-=5;constrainMountainCamera(position,state);
    assert.ok(position.y>=groundHeight(position.x,-position.z)+3.99);
    for(let j=2;j<=10;j++) {
      const t=j/10,x=state.x+(position.x-state.x)*t,s=state.s+(-position.z-state.s)*t;
      const y=(state.y+1.5)*(1-t)+position.y*t;
      assert.ok(y>=groundHeight(x,s)+1.19);
    }
  }
});
