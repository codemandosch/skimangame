import * as THREE from 'three';
import { groundHeight, gradientAt, TREES, SUMMIT_SURFACE_GRID, SUMMIT_DETAIL_EXTENT } from './blackridge.js';
import { createAlpineTrees } from './alpine-trees.js';
import { createFallenLogs } from './log-world.js';
import { kickerShadingAt } from './kicker-shading.js';
import { createParkLineWorld } from './park-line-world.js';
import { createResortWorld } from './resort-world.js';
import { LANDSCAPE } from './landscape-layout.js';

const TILE=256, EXTENT=2560;
// Fixed tile edges plus skirts prevent holes where neighboring LODs differ.
export function buildMountainTile(x0,s0,segments) {
  const build=buildMountainTileSteps(x0,s0,segments);
  let result;
  do { result=build.next(); } while(!result.done);
  return result.value;
}

// Yield small batches of terrain samples so a cold height cache cannot hold
// the animation thread for an entire tile. Startup/contact can still drain
// the same builder synchronously when the geometry is needed immediately.
export function* buildMountainTileSteps(x0,s0,segments) {
  const n=segments+1;
  const detail=2/SUMMIT_SURFACE_GRID,refined=new Set();
  if(segments===128)for(let z=0;z<segments;z++)for(let x=0;x<segments;x++) {
    if(Math.abs(x0+x*2+1)<SUMMIT_DETAIL_EXTENT && Math.abs(s0+z*2+1)<SUMMIT_DETAIL_EXTENT)
      refined.add(z*segments+x);
  }
  const vertexCount=n*n+segments*4+refined.size*(detail+1)**2;
  const positions=new Float32Array(vertexCount*3),colors=new Float32Array(vertexCount*3);
  const rock=new Float32Array(vertexCount),normals=new Float32Array(vertexCount*3);
  const IndexArray=vertexCount>65535 ? Uint32Array : Uint16Array;
  const indices=new IndexArray(segments*segments*6+segments*24+refined.size*(detail*detail-1)*6);
  let vertexIndex=0,index=0;
  function vertex(x,s,yOverride) {
    const y=yOverride ?? groundHeight(x,s), g=gradientAt(x,s,Math.hypot(x,s)<8 ? .25 : 2);
    const length=Math.hypot(g.x,1,g.s);
    // Every heightfield triangle is sloped, not vertical: all are skiable snow.
    // Rock belongs only on genuinely vertical geometry, never a slope threshold.
    const exposure=0;
    const variation=.97+.03*Math.sin(x*.012)*Math.sin(s*.018);
    const {shade,crest}=kickerShadingAt(x,s);
    const i=vertexIndex++,p=i*3;
    positions[p]=x;positions[p+1]=y;positions[p+2]=-s;
    normals[p]=-g.x/length;normals[p+1]=1/length;normals[p+2]=g.s/length;
    // Neutral base: the snow shader owns the tint; kicker occlusion stays cool.
    colors[p]=(1-exposure*.34)*variation*(1-shade+crest);
    colors[p+1]=(1-exposure*.34)*variation*(1-shade*.83+crest);
    colors[p+2]=(1-exposure*.33)*variation*(1-shade*.6+crest);
    return i;
  }
  for(let z=0;z<n;z++) for(let x=0;x<n;x++) {
    vertex(x0+x*TILE/segments,s0+z*TILE/segments);
    if(vertexIndex%64===0)yield;
  }
  for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){
    if(refined.has(z*segments+x)) {
      const start=vertexIndex,width=detail+1;
      for(let dz=0;dz<=detail;dz++)for(let dx=0;dx<=detail;dx++)
        vertex(x0+x*2+dx*SUMMIT_SURFACE_GRID,s0+z*2+dz*SUMMIT_SURFACE_GRID);
      for(let dz=0;dz<detail;dz++)for(let dx=0;dx<detail;dx++) {
        const a=start+dz*width+dx,b=a+1,c=a+width,d=c+1;
        indices[index++]=a;indices[index++]=b;indices[index++]=c;
        indices[index++]=b;indices[index++]=d;indices[index++]=c;
      }
      yield;
      continue;
    }
    const a=z*n+x,b=a+1,c=a+n,d=c+1;
    indices[index++]=a;indices[index++]=b;indices[index++]=c;
    indices[index++]=b;indices[index++]=d;indices[index++]=c;
    if(index%384===0)yield;
  }
  const edge=[];
  for(let x=0;x<n;x++)edge.push(x);
  for(let z=1;z<n;z++)edge.push(z*n+segments);
  for(let x=segments-1;x>=0;x--)edge.push(segments*n+x);
  for(let z=segments-1;z>0;z--)edge.push(z*n);
  const bottoms=[];
  for(const i of edge) {
    bottoms.push(vertex(positions[i*3],-positions[i*3+2],positions[i*3+1]-100));
    if(vertexIndex%64===0)yield;
  }
  for(let i=0;i<edge.length;i++){
    const j=(i+1)%edge.length;
    // All summit contact tiles share the fine surface. Coarse skirt chords
    // here would stick up through its curved edge as non-collidable fins.
    if(refined.size && [edge[i],edge[j]].every(k=>
      Math.max(Math.abs(positions[k*3]),Math.abs(positions[k*3+2]))<=SUMMIT_DETAIL_EXTENT))continue;
    indices[index++]=edge[i];indices[index++]=bottoms[i];indices[index++]=edge[j];
    indices[index++]=edge[j];indices[index++]=bottoms[i];indices[index++]=bottoms[j];
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
  geometry.setAttribute('rockAmount',new THREE.BufferAttribute(rock,1));
  geometry.setIndex(new THREE.BufferAttribute(indices.subarray(0,index),1));geometry.computeBoundingSphere();
  return geometry;
}

export function createMountainWorld(scene,material,{now=()=>performance.now(),budgetMs=2}={}) {
  const tiles=[];
  for(let s=-EXTENT;s<EXTENT;s+=TILE) for(let x=-EXTENT;x<EXTENT;x+=TILE) {
    // Corner tiles lie wholly on the valley floor the baked landscape draws.
    const nearestX=Math.max(x,Math.min(0,x+TILE)),nearestS=Math.max(s,Math.min(0,s+TILE));
    if(Math.hypot(nearestX,nearestS)>LANDSCAPE.innerRadius)continue;
    const distance=Math.hypot(x+TILE/2,s+TILE/2);
    const segments=distance<350?128:distance<850?64:distance<1250?32:16;
    const mesh=new THREE.Mesh(buildMountainTile(x,s,segments),material);
    // Terrain shadows come only from the baked sun visibility, so they never
    // shift with the rider; the real-time map carries object shadows.
    mesh.castShadow=false;mesh.receiveShadow=true;scene.add(mesh);
    tiles.push({x,s,segments,mesh});
  }
  const forest=createAlpineTrees(scene,TREES);
  const logs=createFallenLogs(scene);
  createParkLineWorld(scene);
  createResortWorld(scene);
  let lastX=Infinity,lastS=Infinity,queue=[],active=null;
  function replace(tile,segments,next) {
    tile.mesh.geometry.dispose();tile.mesh.geometry=next;tile.segments=segments;
  }
  return {
    update(state) {
      forest.userData.update(state);
      logs.userData.update(state);
      // Contact cannot wait for the scenery queue, especially after restarting.
      // Include neighboring tiles so skis and the close camera cross seams safely.
      const contactTiles=new Set(tiles.filter(tile=>
        state.x>=tile.x-24 && state.x<=tile.x+TILE+24 &&
        state.s>=tile.s-24 && state.s<=tile.s+TILE+24));
      for(const tile of contactTiles) if(tile.segments!==128)
        replace(tile,128,buildMountainTile(tile.x,tile.s,128));
      if(Math.hypot(state.x-lastX,state.s-lastS)>90) {
        lastX=state.x;lastS=state.s;
        queue=tiles.map(tile=>{
          const distance=Math.hypot(state.x-tile.x-TILE/2,state.s-tile.s-TILE/2);
          const segments=distance<350?128:distance<850?64:distance<1250?32:16;
          return {tile,segments,distance};
        }).filter(job=>job.segments!==job.tile.segments).sort((a,b)=>a.distance-b.distance);
      }
      // A whole tile can take 100+ ms with uncached terrain. Keep its old mesh
      // visible while building the replacement across frames, then swap once.
      queue=queue.filter(job=>!contactTiles.has(job.tile) && job.segments!==job.tile.segments);
      if(active && !queue.some(job=>job.tile===active.tile && job.segments===active.segments)) {
        active.build.return();active=null;
      }
      const deadline=now()+budgetMs;
      if(!active && queue.length) {
        const job=queue[0];
        active={...job,build:buildMountainTileSteps(job.tile.x,job.tile.s,job.segments)};
      }
      while(active && now()<deadline) {
        const result=active.build.next();
        if(result.done) {
          replace(active.tile,active.segments,result.value);
          active=null;
        }
      }
    },
  };
}
