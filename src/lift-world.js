import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getLiftLayout,cablePoint,CABLE_RADIUS,CABLE_SPACING } from './lift-layout.js';
import { groundHeight } from './course.js';

export function createSkiLift(scene) {
  const layout=getLiftLayout(),group=new THREE.Group();
  group.name='Summit Express / rideable ski lift';scene.add(group);
  const steel=new THREE.MeshStandardMaterial({color:'#526675',metalness:.72,roughness:.4});
  const rubber=new THREE.MeshStandardMaterial({color:'#172732',roughness:.82});
  const red=new THREE.MeshStandardMaterial({color:'#b95035',metalness:.25,roughness:.55});
  const concrete=new THREE.MeshStandardMaterial({color:'#c6cecf',roughness:.98});
  const deckMaterial=concrete.clone();
  // The deck shares the snow's collision plane; offset depth to avoid flicker.
  deckMaterial.polygonOffset=true;deckMaterial.polygonOffsetFactor=-1;deckMaterial.polygonOffsetUnits=-1;
  const cableMaterial=new THREE.MeshStandardMaterial({color:'#38464e',metalness:.8,roughness:.48});
  const dummy=new THREE.Object3D();
  function batch(geometry,material,poses,name) {
    const mesh=new THREE.InstancedMesh(geometry,material,poses.length);mesh.name=name;
    poses.forEach((p,i)=>{
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(...(p.rotation || [0,layout.heading,0]));
      dummy.scale.set(...(p.scale || [1,1,1]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);return mesh;
  }
  const supports=layout.towers.slice(1,-1);
  batch(new THREE.CylinderGeometry(.46,.7,1,10),steel,supports.map(t=>({x:t.x,y:(t.y+t.ground)/2,z:-t.s,
    scale:[1,t.y-t.ground,1]})),'Lift support columns');
  batch(new THREE.BoxGeometry(2.1,1.1,2.1),concrete,supports.map(t=>({x:t.x,y:t.ground+.25,z:-t.s})),'Concrete tower feet');
  batch(new THREE.BoxGeometry(11.8,.55,.85),steel,supports.map(t=>({x:t.x,y:t.y-.6,z:-t.s})),'Tower crossarms');
  batch(new THREE.BoxGeometry(1.35,1.5,1.35),red,supports.map(t=>({x:t.x,y:t.ground+1.2,z:-t.s})),'Tower safety padding');
  const wheels=[],brackets=[],rungs=[];
  for(const t of supports) {
    for(const side of [-1,1]) {
      const x=t.x+layout.ds*side*CABLE_SPACING,s=t.s-layout.dx*side*CABLE_SPACING;
      brackets.push({x,y:t.y+.15,z:-s});
      for(const along of [-.7,0,.7])wheels.push({x:x+layout.dx*along,y:t.y-.38,z:-s-layout.ds*along,
        rotation:[0,layout.heading,Math.PI/2]});
    }
    for(let y=t.ground+1;y<t.y-.7;y+=.55)rungs.push({x:t.x+layout.ds*.67,y,z:-t.s+layout.dx*.67});
  }
  batch(new THREE.CylinderGeometry(.4,.4,.24,12),rubber,wheels,'Cable sheave wheels');
  // Service guards stand above each cable: these are the visible rail obstacles.
  const guardParts=[];
  for(const x of [-.42,.42]) {
    const post=new THREE.BoxGeometry(.12,2.1,1.45);post.translate(x,-.1,0);guardParts.push(post);
  }
  const bridge=new THREE.BoxGeometry(.96,.16,1.45);bridge.translate(0,1.02,0);guardParts.push(bridge);
  batch(mergeGeometries(guardParts),steel,brackets,'Tower cable guards / jump obstacles');
  guardParts.forEach(g=>g.dispose());
  batch(new THREE.BoxGeometry(.3,.045,.52),steel,rungs,'Service ladder rungs');

  class Wire extends THREE.Curve {
    constructor(cable){super();this.cable=cable;}
    getPoint(t,target=new THREE.Vector3()) {const p=cablePoint(layout,this.cable,t*layout.length);return target.set(p.x,p.y,-p.s);}
  }
  for(let cable=0;cable<2;cable++) {
    const wire=new THREE.Mesh(new THREE.TubeGeometry(new Wire(cable),Math.ceil(layout.length/1.5),CABLE_RADIUS,6,false),cableMaterial);
    wire.name=`Rideable lift cable ${cable}`;wire.castShadow=true;group.add(wire);
  }
  for(const [index,t] of [layout.towers[0],layout.towers.at(-1)].entries()) {
    const station=new THREE.Group();station.position.set(t.x,t.y,-t.s);station.rotation.y=layout.heading;
    group.add(station);station.name=index ? 'Base lift terminal' : 'Summit lift terminal';
    const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;station.add(m);return m;};
    add(new THREE.CylinderGeometry(CABLE_SPACING,CABLE_SPACING,.4,32),rubber,0,-.3,0);
    // Summit arrivals can still be near summit altitude above the downhill
    // terminal. Clear both the skier and the raised follow camera.
    const roof=index ? 2.1 : Math.max(8,groundHeight(0,0)+15-t.y);
    add(new THREE.BoxGeometry(12.6,1.2,11),red,0,roof,0);
    add(new THREE.BoxGeometry(12.9,.22,11.3),concrete,0,roof+.72,0);
    add(new THREE.BoxGeometry(13,.5,12),deckMaterial,0,t.ground-t.y-.25,0);
    for(const x of [-5.6,5.6])for(const z of [-3.8,3.8])
      add(new THREE.CylinderGeometry(.2,.3,t.y-t.ground+roof,8),steel,x,(t.ground-t.y+roof)/2,z);
    const points=[];
    for(let i=0;i<=32;i++) {
      const angle=i/32*Math.PI;
      points.push(new THREE.Vector3(Math.cos(angle)*CABLE_SPACING,0,(index ? -1 : 1)*Math.sin(angle)*CABLE_SPACING));
    }
    const arc=new THREE.CatmullRomCurve3(points);
    add(new THREE.TubeGeometry(arc,48,CABLE_RADIUS,6,false),cableMaterial,0,0,0);
  }
  // Both directions and terminal turns form one continuously moving chair loop.
  const table=[{u:0,d:0}];let length=0,prev=cablePoint(layout,0,0);
  for(let u=2;u<layout.length+2;u+=2) {
    const p=cablePoint(layout,0,Math.min(u,layout.length));
    length+=Math.hypot(p.x-prev.x,p.s-prev.s,p.y-prev.y);table.push({u:p.u,d:length});prev=p;
  }
  const turnLength=Math.PI*CABLE_SPACING,loopLength=length*2+turnLength*2;
  function uAt(d) {
    let lo=0,hi=table.length-1;
    while(hi-lo>1){const m=(lo+hi)>>1;if(table[m].d<d)lo=m;else hi=m;}
    const a=table[lo],b=table[hi];return a.u+(b.u-a.u)*(d-a.d)/(b.d-a.d);
  }
  function chairAt(d) {
    if(d<length)return {...cablePoint(layout,0,uAt(d)),heading:layout.heading};
    if(d<length+turnLength) {
      const theta=Math.PI-(d-length)/turnLength*Math.PI,t=layout.towers.at(-1);
      const across=Math.cos(theta)*CABLE_SPACING,along=Math.sin(theta)*CABLE_SPACING;
      return {x:t.x+layout.ds*across+layout.dx*along,s:t.s-layout.dx*across+layout.ds*along,y:t.y,heading:layout.heading+theta-Math.PI};
    }
    if(d<length*2+turnLength)return {...cablePoint(layout,1,uAt(length-(d-length-turnLength))),heading:layout.heading+Math.PI};
    const theta=(d-length*2-turnLength)/turnLength*Math.PI,t=layout.towers[0];
    const across=Math.cos(theta)*CABLE_SPACING,along=-Math.sin(theta)*CABLE_SPACING;
    return {x:t.x+layout.ds*across+layout.dx*along,s:t.s-layout.dx*across+layout.ds*along,y:t.y,heading:layout.heading+Math.PI+theta};
  }
  const chairCount=Math.ceil(loopLength/65),frameParts=[],seatParts=[];
  const part=(list,geo,x,y,z)=>{geo.translate(x,y,z);list.push(geo);};
  part(frameParts,new THREE.CylinderGeometry(.055,.055,2.6,6),0,-1.4,0);
  part(frameParts,new THREE.BoxGeometry(2.8,.12,.12),0,-2.65,0);
  for(const x of [-1.3,1.3])part(frameParts,new THREE.CylinderGeometry(.04,.04,.9,6),x,-3.1,0);
  part(frameParts,new THREE.BoxGeometry(2.7,.09,.09),0,-3,.65);
  part(seatParts,new THREE.BoxGeometry(2.85,.18,.95),0,-3.5,.05);
  part(seatParts,new THREE.BoxGeometry(2.85,.65,.15),0,-3.12,.47);
  const frame=batch(mergeGeometries(frameParts),steel,Array.from({length:chairCount},()=>({x:0,y:0,z:0})),'Moving lift chair frames');
  const seats=batch(mergeGeometries(seatParts),red,Array.from({length:chairCount},()=>({x:0,y:0,z:0})),'Moving lift chair seats');
  [...frameParts,...seatParts].forEach(g=>g.dispose());
  frame.frustumCulled=seats.frustumCulled=false;
  return {update(time) {
    for(let i=0;i<chairCount;i++) {
      const p=chairAt((i*loopLength/chairCount+time*4)%loopLength);
      dummy.position.set(p.x,p.y,-p.s);dummy.rotation.set(0,p.heading,0);dummy.scale.setScalar(1);dummy.updateMatrix();
      frame.setMatrixAt(i,dummy.matrix);seats.setMatrixAt(i,dummy.matrix);
    }
    frame.instanceMatrix.needsUpdate=seats.instanceMatrix.needsUpdate=true;
  }};
}
