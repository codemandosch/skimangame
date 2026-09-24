import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOGS,logPoint } from './log-layout.js';

// Original procedural timber: longitudinal bark ridges, tapered broken ends,
// exposed growth rings and snapped branch stubs. No external asset download.
export function buildLogGeometry(log) {
  const positions=[],colors=[],indices=[],rings=40,sides=20;
  for(let i=0;i<=rings;i++) {
    const u=i/rings*log.length,p=logPoint(log,u);
    const radius=log.radius*(1-.24*i/rings);
    for(let j=0;j<=sides;j++) {
      const a=j/sides*Math.PI*2;
      const ridge=1+.065*Math.sin(j*7.31+log.id)+.025*Math.sin(i*2+j*4);
      // Keep the upper contact line exact, with irregularity on the flanks.
      const lateral=Math.sin(a)*radius*ridge;
      const y=p.y-radius+Math.cos(a)*radius*(1+(ridge-1)*Math.sin(a)**2);
      positions.push(p.x+log.ds*lateral,y,-p.s+log.dx*lateral);
      const shade=.72+.16*Math.sin(j*7.31+log.id)+.1*Math.sin(i*.75+j*2.3);
      colors.push(.29*shade,.185*shade,.105*shade);
    }
  }
  for(let i=0;i<rings;i++)for(let j=0;j<sides;j++) {
    const a=i*(sides+1)+j,b=a+sides+1;indices.push(a,b,a+1,a+1,b,b+1);
  }
  // End grain follows the same oblique section as the bark shell.
  for(const end of [0,rings]) {
    const u=end/rings*log.length,p=logPoint(log,u),r=log.radius*(1-.24*end/rings);
    const center=positions.length/3;positions.push(p.x,p.y-r,-p.s);colors.push(.51,.32,.16);
    let previous=null;
    for(let ring=1;ring<=8;ring++) {
      const start=positions.length/3;
      for(let j=0;j<=sides;j++) {
        const a=j/sides*Math.PI*2,rr=r*ring/8*(1+.02*Math.sin(j*4.1));
        positions.push(p.x+log.ds*Math.sin(a)*rr,p.y-r+Math.cos(a)*rr,-p.s+log.dx*Math.sin(a)*rr);
        const shade=ring%2?.72:1;colors.push(.62*shade,.40*shade,.22*shade);
        if(j<sides) {
          if(previous===null)indices.push(center,start+j,start+j+1);
          else indices.push(previous+j,start+j,previous+j+1,previous+j+1,start+j,start+j+1);
        }
      }
      previous=start;
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
  return geometry;
}
export function createFallenLogs(scene) {
  const root=new THREE.Group();root.name='Rideable fallen timber';scene.add(root);
  const bark=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide});
  const branchMaterial=new THREE.MeshStandardMaterial({color:0x493121,roughness:1});
  const snowMaterial=new THREE.MeshStandardMaterial({color:0xe6eef5,roughness:.92});
  // Trunks are merged per mountain sector (cullable, few draw calls); the
  // snapped branches and snow remnants are instanced across all logs.
  const sectors=new Map();
  for(const log of LOGS) {
    const key=Math.floor(((Math.atan2(log.x,log.s)/(Math.PI*2))+1)%1*12);
    if(!sectors.has(key))sectors.set(key,[]);
    sectors.get(key).push(buildLogGeometry(log));
  }
  for(const [key,parts] of sectors) {
    const mesh=new THREE.Mesh(mergeGeometries(parts),bark);parts.forEach(g=>g.dispose());
    mesh.name=`Rideable logs sector ${key}`;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
  }
  const branches=new THREE.InstancedMesh(new THREE.CylinderGeometry(.055,.17,1,7),branchMaterial,LOGS.length*5);
  const snow=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),snowMaterial,LOGS.length*3);
  branches.name='Snapped log branches';snow.name='Snow on logs';
  const dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0);
  LOGS.forEach((log,index)=>{
    for(let i=0;i<5;i++) {
      const u=log.length*(.12+i*.17),p=logPoint(log,u),side=i%2?1:-1;
      const start=new THREE.Vector3(p.x+log.ds*log.radius*.6*side,p.y-log.radius*.9,-p.s+log.dx*log.radius*.6*side);
      const end=start.clone().add(new THREE.Vector3(log.ds*side*.75,-.35,log.dx*side*.75));
      dummy.position.copy(start).lerp(end,.5);dummy.scale.set(1,start.distanceTo(end),1);
      dummy.quaternion.setFromUnitVectors(up,end.clone().sub(start).normalize());
      dummy.updateMatrix();branches.setMatrixAt(index*5+i,dummy.matrix);
    }
    // Small snow remnants sit on the shoulders, leaving a readable dark rail.
    for(let i=0;i<3;i++) {
      const u=log.length*(.23+i*.27),p=logPoint(log,u);
      dummy.position.set(p.x+log.ds*log.radius*.58,p.y-.13,-p.s+log.dx*log.radius*.58);
      dummy.scale.set(.16,.07,1.4);dummy.rotation.set(Math.atan(log.grade),log.heading,0,'YXZ');
      dummy.updateMatrix();snow.setMatrixAt(index*3+i,dummy.matrix);
    }
  });
  branches.castShadow=true;snow.receiveShadow=true;
  branches.computeBoundingSphere();snow.computeBoundingSphere();
  root.add(branches,snow);
  root.userData.update=()=>{};
  return root;
}
