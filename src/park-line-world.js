import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PARK_LINE, HANDRAILS, groundHeight } from './blackridge.js';
import { logPoint } from './log-layout.js';

// An oblique box keeps the metal's top plane exactly on the ski-contact line.
export function buildHandrailGeometry(rail) {
  const p=[],indices=[];
  for(const u of [0,rail.length]) {
    const top=logPoint(rail,u);
    for(const [side,down] of [[-1,0],[1,0],[-1,.85],[1,.85]])
      p.push(top.x+rail.ds*side*rail.radius,top.y-down,-top.s+rail.dx*side*rail.radius);
  }
  for(const [a,b,c,d] of [[0,4,1,5],[2,3,6,7],[0,2,4,6],[1,5,3,7],[0,1,2,3],[4,6,5,7]])
    indices.push(a,b,c,c,b,d);
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(indices);g.computeVertexNormals();
  return g;
}

// Hundreds of posts, ticks and flags share a handful of materials: bake their
// transforms and draw one merged mesh per material instead.
function batchByMaterial(group) {
  const byMaterial=new Map();
  group.updateMatrixWorld(true);
  for(const child of [...group.children]) {
    if(!child.isMesh || child.userData.keep)continue;
    const geometry=child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    geometry.applyMatrix4(child.matrix);
    for(const name of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(name))geometry.deleteAttribute(name);
    if(!byMaterial.has(child.material))byMaterial.set(child.material,[]);
    byMaterial.get(child.material).push(geometry);
    group.remove(child);child.geometry.dispose();
  }
  for(const [material,parts] of byMaterial) {
    const mesh=new THREE.Mesh(mergeGeometries(parts),material);parts.forEach(g=>g.dispose());
    mesh.name=`${group.name} / ${material.name || 'batched'}`;
    mesh.castShadow=mesh.receiveShadow=material!==undefined && !material.transparent;
    group.add(mesh);
  }
}

export function createParkLineWorld(scene) {
  const group=new THREE.Group();group.name='East Face Park Line';scene.add(group);
  const metal=new THREE.MeshStandardMaterial({color:0x263f50,metalness:.55,roughness:.4,side:THREE.DoubleSide});
  const orange=new THREE.MeshStandardMaterial({color:0xf57525,roughness:.65});
  // Lit dye, so the blue markings darken with the snow in shadow.
  const dye=new THREE.MeshStandardMaterial({name:'Blue snow dye',color:0x2f86b8,roughness:.9,transparent:true,opacity:.68,depthWrite:false,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  for(const rail of HANDRAILS) {
    const mesh=new THREE.Mesh(buildHandrailGeometry(rail),metal);mesh.name=rail.name;mesh.userData.keep=true;
    mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    for(let u=4;u<rail.length;u+=8) {
      const p=logPoint(rail,u),base=groundHeight(p.x,p.s),height=Math.max(.1,p.y-.85-base);
      const post=new THREE.Mesh(new THREE.BoxGeometry(.45,height,.55),orange);
      post.position.set(p.x,base+height/2,-p.s);post.castShadow=true;group.add(post);
    }
  }
  function stripe(x,s,width,length) {
    const nx=Math.max(1,Math.ceil(length/2)),ns=Math.ceil(width/2),p=[],ix=[];
    for(let i=0;i<=nx;i++)for(let j=0;j<=ns;j++) {
      const xx=x+length*i/nx,ss=s+width*(j/ns-.5);
      p.push(xx,groundHeight(xx,ss)+.14,-ss);
    }
    for(let i=0;i<nx;i++)for(let j=0;j<ns;j++) {
      const a=i*(ns+1)+j,b=a+ns+1;ix.push(a,a+1,b,a+1,b+1,b);
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setIndex(ix);
    g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,dye);mesh.name='Blue snow dye';group.add(mesh);
  }
  for(const j of PARK_LINE.jumps) {
    stripe(j.x-4,0,j.width*2-12,2);
    stripe(j.x+j.gap+2,0,j.landingWidth*2-12,2);
    for(const side of [-1,1])stripe(j.x+j.gap,side*(j.landingWidth-8),2,j.landingLength);
  }
  for(const r of HANDRAILS)stripe(r.x-r.entryLength,0,12,2);
  const q=PARK_LINE.quarterpipe;
  stripe(q.x-2,0,q.width*2-12,2);
  stripe(q.x,0,q.takeoffWidth,1);
  for(const side of [-1,1])stripe(q.x+8,side*q.crestWidth/2,1,q.deckLength-8);
  // Meter ruler embedded in the deck, clear of the center riding line.
  // Zero is the snow lip rather than the ground underneath the quarterpipe.
  const ruler=new THREE.Group();ruler.name='Quarterpipe height measurement pole';
  const lipY=groundHeight(q.x,0),rulerX=q.x+q.deckLength/2,rulerS=0;
  const white=new THREE.MeshBasicMaterial({color:0xf4f7fa});
  const dark=new THREE.MeshBasicMaterial({color:0x162b3b});
  for(let h=-8;h<60;h+=2) {
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.45,.45,2,10),h%4===0?orange:white);
    shaft.position.set(rulerX,lipY+h+1,-rulerS);ruler.add(shaft);
  }
  function rulerLabel(text,h,width=8) {
    // Terrain geometry can also be built without a browser for collision checks.
    const canvas=globalThis.document?.createElement('canvas');
    if(!canvas)return;
    canvas.width=512;canvas.height=160;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#142c3e';ctx.fillRect(0,0,512,160);
    ctx.fillStyle='#f4fbff';ctx.font='bold 100px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(text,256,82,480);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture}));
    label.name=`Quarterpipe ruler ${text}`;
    label.position.set(rulerX-.7,lipY+h,-rulerS-3-width/2);label.scale.set(width,width*160/512,1);ruler.add(label);
  }
  for(let h=0;h<=60;h++) {
    const major=h%10===0,medium=h%5===0;
    const length=major?3:medium?2:1;
    const tick=new THREE.Mesh(new THREE.BoxGeometry(.3,major?.22:.12,length),dark);
    tick.name=`${h} metre mark`;
    tick.position.set(rulerX-.5,lipY+h,-rulerS-length/2);ruler.add(tick);
    if(major)rulerLabel(`${h} m`,h);
  }
  rulerLabel('ABOVE LIP',64,14);
  group.add(ruler);
  // Edge flags make the broad groomed lane easy to find from the rest of the mountain.
  for(let x=PARK_LINE.start;x<=PARK_LINE.end;x+=100)for(const s of [-78,78]) {
    const y=groundHeight(x,s);
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.13,.13,4,6),metal);pole.position.set(x,y+2,-s);group.add(pole);
    const flag=new THREE.Mesh(new THREE.BoxGeometry(.12,1.4,2),orange);flag.position.set(x,y+3.2,-s+1);group.add(flag);
  }
  batchByMaterial(group);
  batchByMaterial(ruler);
  return group;
}
