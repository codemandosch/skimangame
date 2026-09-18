import * as THREE from 'three';
import { groundHeight, gradientAt, TREES } from './blackridge.js';

const TILE=256, EXTENT=2560;
// Fixed tile edges plus skirts prevent holes where neighboring LODs differ.
export function buildMountainTile(x0,s0,segments) {
  const positions=[],colors=[],rock=[],normals=[],indices=[];
  const n=segments+1;
  function vertex(x,s,yOverride) {
    const y=yOverride ?? groundHeight(x,s), g=gradientAt(x,s,2);
    const length=Math.hypot(g.x,1,g.s);
    // Every heightfield triangle is sloped, not vertical: all are skiable snow.
    // Rock belongs only on genuinely vertical geometry, never a slope threshold.
    const exposure=0;
    const variation=.97+.03*Math.sin(x*.012)*Math.sin(s*.018);
    positions.push(x,y,-s); normals.push(-g.x/length,1/length,g.s/length);
    colors.push((.90-exposure*.34)*variation,(.95-exposure*.34)*variation,(.99-exposure*.33)*variation);
    rock.push(exposure);
    return positions.length/3-1;
  }
  for(let z=0;z<n;z++) for(let x=0;x<n;x++) vertex(x0+x*TILE/segments,s0+z*TILE/segments);
  for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){
    const a=z*n+x,b=a+1,c=a+n,d=c+1;indices.push(a,b,c,b,d,c);
  }
  const edge=[];
  for(let x=0;x<n;x++)edge.push(x);
  for(let z=1;z<n;z++)edge.push(z*n+segments);
  for(let x=segments-1;x>=0;x--)edge.push(segments*n+x);
  for(let z=segments-1;z>0;z--)edge.push(z*n);
  const bottoms=edge.map(i=>vertex(positions[i*3],-positions[i*3+2],positions[i*3+1]-100));
  for(let i=0;i<edge.length;i++){
    const j=(i+1)%edge.length;indices.push(edge[i],bottoms[i],edge[j],edge[j],bottoms[i],bottoms[j]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('rockAmount',new THREE.Float32BufferAttribute(rock,1));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  return geometry;
}

function forest(scene) {
  const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.25,.48,6,6),new THREE.MeshStandardMaterial({color:'#5e605a',roughness:1}),TREES.length);
  const green=new THREE.InstancedMesh(new THREE.ConeGeometry(2.7,9,7),new THREE.MeshStandardMaterial({color:'#304e4b',roughness:1}),TREES.length);
  const snow=new THREE.InstancedMesh(new THREE.ConeGeometry(2.3,7.9,7),new THREE.MeshStandardMaterial({color:'#e2edf1',roughness:.95}),TREES.length);
  const d=new THREE.Object3D();
  TREES.forEach((tree,i)=>{
    d.scale.setScalar(tree.scale);d.rotation.y=tree.x;
    for(const [m,offset] of [[trunk,2],[green,5],[snow,6.1]]) {
      d.position.set(tree.x,tree.y+offset*tree.scale,-tree.s);d.updateMatrix();m.setMatrixAt(i,d.matrix);
    }
  });
  for(const m of [trunk,green,snow]) {m.castShadow=true;m.receiveShadow=true;scene.add(m);}
}

function horizon(scene) {
  const p=[],c=[],ix=[];const angular=240,bands=15;
  for(let r=0;r<=bands;r++)for(let a=0;a<=angular;a++){
    const theta=a/angular*Math.PI*2,radius=3100+r*230;
    const profile=Math.sin(r/bands*Math.PI);
    const height=40+profile*(580+450*Math.sin(theta*5+1)**2+430*Math.cos(theta*9-.4)**2);
    p.push(Math.sin(theta)*radius,height,-Math.cos(theta)*radius);
    const light=.68+.20*Math.sin(theta*5+.5);
    c.push(.52*light,.66*light,.76*light);
  }
  for(let r=0;r<bands;r++)for(let a=0;a<angular;a++){
    const i=r*(angular+1)+a,j=i+angular+1;ix.push(i,j,i+1,i+1,j,j+1);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setIndex(ix);g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide}));scene.add(m);
}

export function createMountainWorld(scene,material) {
  const tiles=[];
  for(let s=-EXTENT;s<EXTENT;s+=TILE) for(let x=-EXTENT;x<EXTENT;x+=TILE) {
    const distance=Math.hypot(x+TILE/2,s+TILE/2);
    const segments=distance<350?128:distance<850?64:distance<1250?32:16;
    const mesh=new THREE.Mesh(buildMountainTile(x,s,segments),material);
    mesh.receiveShadow=true;scene.add(mesh);
    tiles.push({x,s,segments,mesh});
  }
  forest(scene);horizon(scene);
  let lastX=Infinity,lastS=Infinity,queue=[];
  function rebuild(tile,segments) {
    const next=buildMountainTile(tile.x,tile.s,segments);
    tile.mesh.geometry.dispose();tile.mesh.geometry=next;tile.segments=segments;
  }
  return {
    update(state) {
      // Contact cannot wait for the scenery queue, especially after restarting.
      // Include neighboring tiles so skis and the close camera cross seams safely.
      const contactTiles=new Set(tiles.filter(tile=>
        state.x>=tile.x-24 && state.x<=tile.x+TILE+24 &&
        state.s>=tile.s-24 && state.s<=tile.s+TILE+24));
      for(const tile of contactTiles) if(tile.segments!==128) rebuild(tile,128);
      if(Math.hypot(state.x-lastX,state.s-lastS)>90) {
        lastX=state.x;lastS=state.s;
        queue=tiles.map(tile=>{
          const distance=Math.hypot(state.x-tile.x-TILE/2,state.s-tile.s-TILE/2);
          const segments=distance<350?128:distance<850?64:distance<1250?32:16;
          return {tile,segments,distance};
        }).filter(job=>job.segments!==job.tile.segments).sort((a,b)=>a.distance-b.distance);
      }
      // One bounded rebuild per frame; retired buffers are actually disposed.
      queue=queue.filter(job=>!contactTiles.has(job.tile) && job.segments!==job.tile.segments);
      if(queue.length) {
        const {tile,segments}=queue.shift();
        rebuild(tile,segments);
      }
    },
  };
}
