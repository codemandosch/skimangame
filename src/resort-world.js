import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { groundHeight } from './blackridge.js';
import { RESORT, townPoint, promenadeOffset } from './resort-layout.js';

const material=(color,other={})=>new THREE.MeshStandardMaterial({color,roughness:.88,...other});

// Batch repeated architectural details by material, keeping the entire village
// skyline visible without hundreds of individual building/window draw calls.
function village(town,materials) {
  const root=new THREE.Group();root.name=town.name;
  root.position.set(town.x,0,-town.s);root.rotation.y=-town.angle;
  const batches=new Map(),matrix=new THREE.Matrix4(),q=new THREE.Quaternion();
  const add=(geometry,key,x=0,y=0,z=0,rotation=0)=>{
    q.setFromAxisAngle(new THREE.Vector3(0,0,1),rotation);
    matrix.compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(1,1,1));
    geometry.applyMatrix4(matrix);
    if(!batches.has(key))batches.set(key,[]);
    batches.get(key).push(geometry);
  };
  const box=(key,x,y,z,w,h,d,rotation=0)=>add(new THREE.BoxGeometry(w,h,d).toNonIndexed(),key,x,y,z,rotation);
  const prism=(points,depth,key,x,y,z)=>{
    const shape=new THREE.Shape();shape.moveTo(...points[0]);
    for(const p of points.slice(1))shape.lineTo(...p);
    shape.closePath();
    add(new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1}),key,x,y,z-depth/2);
  };
  for(const b of town.buildings) {
    const dx=b.x-town.x,ds=b.s-town.s;
    const x=dx*Math.cos(town.angle)-ds*Math.sin(town.angle);
    const z=-(dx*Math.sin(town.angle)+ds*Math.cos(town.angle));
    const w=b.width,d=b.depth,y=b.floor,h=b.floors*3.25;
    const wood=`wood${b.seed%3}`;
    box('stone',x,(b.foundationBottom+y)/2,z,w+.6,y-b.foundationBottom,d+.6);
    if(b.kind==='cabin') {
      prism([[-w/2,0],[w/2,0],[w/2,h],[0,h+4],[-w/2,h]],d,wood,x,y,z);
      // Continuous thick gabled snow cap with generous chalet eaves.
      const roofW=w+2.6;
      prism([[-roofW/2,h-.5],[0,h+4.5],[roofW/2,h-.5],[roofW/2,h+.15],[0,h+5.15],[-roofW/2,h+.15]],d+2.6,'snow',x,y,z);
      box('stone',x+w*.27,y+h+2,z+d*.15,1.3,4,1.3);
      box('snow',x+w*.27,y+h+4.1,z+d*.15,1.65,.3,1.65);
      for(let level=0;level<2;level++)for(const side of [-1,1])for(const offset of [-.27,.27]) {
        box('trim',x+w*offset,y+1.8+level*3,z+side*(d/2+.09),2.15,2.05,.2);
        box('glass',x+w*offset,y+1.8+level*3,z+side*(d/2+.21),1.6,1.55,.08);
        box('wood2',x+w*offset,y+1.8+level*3,z+side*(d/2+.28),.12,1.6,.08);
      }
      for(let line=1;line<h;line+=.65)for(const side of [-1,1])
        box('trim',x,y+line,z+side*(d/2+.025),w,.045,.06);
      box('trim',x,y+1.3,z+d/2+.12,1.5,2.6,.2);
      box('wood1',x,y+1.3,z+d/2+.24,1.2,2.35,.1);
    } else {
      // Three unequal cedar fins form the folded, mountain-like roofline.
      for(let wing=0;wing<3;wing++) {
        const ww=w/3,wx=x+(wing-1)*ww,wh=h-(wing===1?0:wing===0?5:9);
        const peak=wh+4+(b.seed%3),low=wh-1;
        const wz=z+(wing===1?-1.8:0),wd=d+(wing===1?3.6:0);
        prism([[-ww/2,0],[ww/2,0],[ww/2,low],[-ww/2,peak]],wd,wood,wx,y,wz);
        prism([[-ww/2-.7,peak],[ww/2+.7,low],[ww/2+.7,low+.7],[-ww/2-.7,peak+.7]],wd+1.4,'snow',wx,y,wz);
        // Recessed dark glazing, warm occupied apartments and snowy balconies.
        for(let floor=0;floor<Math.floor((low-1)/3.25);floor++)for(const side of [-1,1]) {
          const fy=y+2+floor*3.25,fz=wz+side*(wd/2+.13);
          box('trim',wx,fy,fz,ww-1.15,2.4,.18);
          for(let col=0;col<2;col++)
            box((floor+col+wing+b.seed)%7===0?'warm':'glass',wx+(col-.5)*(ww-1.5)/2,fy,fz+side*.12,(ww-2.1)/2,1.95,.08);
          box('wood2',wx,fy-1.25,fz+side*.8,ww-.25,.22,1.8);
          box('snow',wx,fy-1.09,fz+side*.8,ww-.25,.1,1.8);
          box('trim',wx,fy-.68,fz+side*1.65,ww-.25,.65,.12);
          for(const offset of [-.34,0,.34])box('trim',wx+ww*offset,fy-.65,fz+side*1.65,.09,.95,.12);
        }
        for(const side of [-1,1])for(let fin=-ww/2+.4;fin<ww/2;fin+=.7) {
          const finH=peak+(low-peak)*(fin+ww/2)/ww;
          box('wood2',wx+fin,y+finH/2,wz+side*(wd/2+.04),.07,finH,.08);
        }
      }
      // Ground floor glazing and a covered timber entrance.
      box('trim',x,y+1.5,z+d/2+1,3.8,3,1.8);
      box('glass',x,y+1.4,z+d/2+1.95,2.9,2.6,.12);
      box('snow',x,y+3.1,z+d/2+1.3,5,.35,3.4);
      // End elevations also have apartments, breaking up the tall cedar walls.
      for(const side of [-1,1]) {
        const endHeight=h-(side===-1?5:9);
        for(let floor=0;floor<Math.floor((endHeight-2)/3.25);floor++)for(const offset of [-.29,0,.29]) {
          const fy=y+2+floor*3.25;
          box('trim',x+side*(w/2+.1),fy,z+d*offset,.18,2.4,3.2);
          box('glass',x+side*(w/2+.22),fy,z+d*offset,.08,1.9,2.6);
          box('snow',x+side*(w/2+.35),fy-1.1,z+d*offset,.7,.12,3.4);
        }
      }
    }
  }
  // Human-scale promenade: lamps, timber benches and snow-topped planters.
  for(let u=-245;u<=245;u+=35)for(const side of [-1,1]) {
    const v=promenadeOffset(town,u)+side*10,p=townPoint(town,u,v),y=groundHeight(p.x,p.s);
    box('trim',u,y+2.8,-v,.18,5.6,.18);
    box('trim',u,y+5.5,-v,.85,.15,.85);
    box('warm',u,y+5.15,-v,.46,.55,.46);
    box('snow',u,y+5.64,-v,1,.12,1);
    if(Math.round(u)%2===0) {
      box('wood1',u+4,y+.75,-v,3,.24,.85);
      box('wood1',u+4,y+1.3,-v+side*.35,3,.7,.12);
      for(const dx of [-1,1])box('trim',u+4+dx,y+.35,-v,.15,.7,.65);
    }
  }
  for(const [key,parts] of batches) {
    // Extrusions have the same attributes as non-indexed boxes.
    const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
    geometry.computeBoundingSphere();
    const mesh=new THREE.Mesh(geometry,materials[key]);mesh.name=`${town.name} / ${key}`;
    mesh.castShadow=key!=='glass' && key!=='warm';mesh.receiveShadow=true;root.add(mesh);
  }
  return root;
}

export function roadGeometry(road,width=road.width,lift=.12) {
  const positions=[],indices=[];
  for(let i=0;i<road.points.length;i++) {
    const p=road.points[i],a=road.points[Math.max(0,i-1)],b=road.points[Math.min(road.points.length-1,i+1)];
    const length=Math.hypot(b.x-a.x,b.s-a.s)||1,nx=-(b.s-a.s)/length,ns=(b.x-a.x)/length;
    // Across-width subdivisions follow curved terrain instead of bridging it.
    for(let j=0;j<=4;j++) {
      const offset=(j/4-.5)*width,x=p.x+nx*offset,s=p.s+ns*offset;
      positions.push(x,groundHeight(x,s)+lift,-s);
    }
    if(i)for(let j=0;j<4;j++) {
      const a=(i-1)*5+j,b=i*5+j;indices.push(a,b,a+1,a+1,b,b+1);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// World positions of the cabin chimneys, for wood-smoke plumes.
export function chimneyTops() {
  const tops=[];
  for(const town of RESORT.towns)for(const b of town.buildings) {
    if(b.kind!=='cabin')continue;
    const dx=b.x-town.x,ds=b.s-town.s;
    const x=dx*Math.cos(town.angle)-ds*Math.sin(town.angle);
    const z=-(dx*Math.sin(town.angle)+ds*Math.cos(town.angle));
    const lx=x+b.width*.27,lz=z+b.depth*.15,y=b.floor+b.floors*3.25+4.3;
    // Inverse of the village root's rotation.y = -angle, then its translation.
    const c=Math.cos(-town.angle),sn=Math.sin(-town.angle);
    tops.push({x:town.x+lx*c+lz*sn,y,z:-town.s-lx*sn+lz*c});
  }
  return tops;
}

export function createResortWorld(scene) {
  const root=new THREE.Group();root.name='Mountain base ski villages';
  const materials={wood0:material('#735047'),wood1:material('#947057'),wood2:material('#584339'),
    stone:material('#727d84'),snow:material('#e6eff4'),trim:material('#393e43'),
    glass:material('#72939e',{roughness:.3,metalness:.25}),
    warm:material('#ffd391',{emissive:'#ffc17b',emissiveIntensity:.3})};
  // A fixed depth bias also works on flat valley snow, where slope-only
  // polygon offset is zero and distant road/shoulder surfaces can flicker.
  const road=material('#8997a0',{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const street=material('#bfccd4',{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const bank=material('#edf3f6',{side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  for(const r of RESORT.roads) {
    for(const [width,height,mat] of [[r.width+3,.1,bank],[r.width,.2,r.town?street:road]]) {
      const mesh=new THREE.Mesh(roadGeometry(r,width,height),mat);mesh.name=r.name;
      mesh.receiveShadow=true;root.add(mesh);
    }
  }
  for(const town of RESORT.towns)root.add(village(town,materials));
  scene.add(root);return root;
}
