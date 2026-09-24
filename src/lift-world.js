import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getLiftLayout,cablePoint,CABLE_RADIUS,CABLE_SPACING } from './lift-layout.js';
import { groundHeight } from './course.js';

// Square steel strut between two points, as a merge-ready geometry.
function strut(a,b,thickness) {
  const direction=new THREE.Vector3().subVectors(b,a),length=direction.length();
  const g=new THREE.BoxGeometry(thickness,length,thickness).toNonIndexed();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
  g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);
  return g;
}
// Four-legged lattice column with rings and cross-bracing on every face.
function latticeColumn(x,bottom,top,width,bay) {
  const parts=[],h=width/2,corners=[[-h,-h],[h,-h],[h,h],[-h,h]];
  const levels=Math.max(2,Math.round((top-bottom)/(width*bay*1.6)));
  const y=k=>bottom+(top-bottom)*k/levels;
  for(const [cx,cz] of corners)parts.push(strut(new THREE.Vector3(x+cx,bottom,cz),new THREE.Vector3(x+cx,top,cz),.16));
  for(let k=0;k<=levels;k++)for(let c=0;c<4;c++) {
    const [ax,az]=corners[c],[bx,bz]=corners[(c+1)%4];
    parts.push(strut(new THREE.Vector3(x+ax,y(k),az),new THREE.Vector3(x+bx,y(k),bz),.09));
    if(k<levels)parts.push(strut(new THREE.Vector3(x+ax,y(k),az),new THREE.Vector3(x+bx,y(k+1),bz),.07));
  }
  return parts;
}
// Horizontal Warren truss across the station between x0 and x1.
function latticeBeam(x0,x1,y,height,depth) {
  const parts=[],bays=Math.round((x1-x0)/height);
  for(const z of [-depth/2,depth/2]) {
    for(const yy of [y,y+height])parts.push(strut(new THREE.Vector3(x0,yy,z),new THREE.Vector3(x1,yy,z),.14));
    for(let k=0;k<bays;k++) {
      const a=x0+(x1-x0)*k/bays,b=x0+(x1-x0)*(k+1)/bays;
      parts.push(strut(new THREE.Vector3(a,k%2?y+height:y,z),new THREE.Vector3(b,k%2?y:y+height,z),.08));
    }
  }
  for(let k=0;k<=bays;k+=2)parts.push(strut(new THREE.Vector3(x0+(x1-x0)*k/bays,y,-depth/2),new THREE.Vector3(x0+(x1-x0)*k/bays,y,depth/2),.08));
  return parts;
}

// Summit Express: tapered steel towers with sheave trains, bullwheel
// terminals and a loop of four-seat chairs. Every visible part stays inside
// the collision volumes of lift-layout.js (crossarm band and column).
export function createSkiLift(scene) {
  const layout=getLiftLayout(),group=new THREE.Group();
  group.name='Summit Express / rideable ski lift';scene.add(group);
  const steel=new THREE.MeshStandardMaterial({name:'Lift tower paint',color:'#39424a',metalness:.45,roughness:.48});
  const galvanised=new THREE.MeshStandardMaterial({name:'Galvanised steel',color:'#8d979e',metalness:.8,roughness:.36});
  const rubber=new THREE.MeshStandardMaterial({color:'#15191c',roughness:.8});
  const red=new THREE.MeshStandardMaterial({name:'Summit Express red',color:'#c63a2e',metalness:.2,roughness:.5});
  const cream=new THREE.MeshStandardMaterial({color:'#e9e4da',roughness:.7});
  const concrete=new THREE.MeshStandardMaterial({color:'#b9bfc2',roughness:.95});
  const glass=new THREE.MeshStandardMaterial({color:'#1d2a33',metalness:.3,roughness:.12});
  const deckMaterial=concrete.clone();
  // The deck shares the snow's collision plane; offset depth to avoid flicker.
  deckMaterial.polygonOffset=true;deckMaterial.polygonOffsetFactor=-1;deckMaterial.polygonOffsetUnits=-1;
  const cableMaterial=new THREE.MeshStandardMaterial({color:'#2b2f33',metalness:.75,roughness:.38});
  const dummy=new THREE.Object3D();
  function batch(geometry,material,poses,name) {
    const mesh=new THREE.InstancedMesh(geometry,material,poses.length);mesh.name=name;
    poses.forEach((p,i)=>{
      dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(...(p.rotation || [0,layout.heading,0]));
      dummy.scale.set(...(p.scale || [1,1,1]));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
    });
    mesh.castShadow=mesh.receiveShadow=true;mesh.computeBoundingSphere();group.add(mesh);return mesh;
  }
  const part=(list,geometry,x=0,y=0,z=0)=>{geometry.translate(x,y,z);list.push(geometry);return geometry;};
  const supports=layout.towers.slice(1,-1);
  // Unit-height tapered column with flanged joints; scaled per tower.
  const column=new THREE.CylinderGeometry(.34,.56,1,14,1);column.translate(0,.5,0);
  batch(column,steel,supports.map(t=>({x:t.x,y:t.ground-.3,z:-t.s,scale:[1,t.y-.9-t.ground+.3,1]})),'Lift support columns');
  const flanges=[];
  for(const t of supports)for(let y=t.ground+5;y<t.y-3;y+=6.5)flanges.push({x:t.x,y,z:-t.s});
  batch(new THREE.CylinderGeometry(.62,.62,.16,14),steel,flanges,'Tower flanges');
  batch(new THREE.BoxGeometry(2.3,1.2,2.3),concrete,supports.map(t=>({x:t.x,y:t.ground+.1,z:-t.s})),'Concrete tower feet');
  batch(new THREE.CylinderGeometry(.82,.82,1.6,14),red,supports.map(t=>({x:t.x,y:t.ground+1.35,z:-t.s})),'Tower safety padding');
  // Crossarm: a tapered steel beam with a lower brace, spanning both cables.
  const armParts=[];
  part(armParts,new THREE.BoxGeometry(11.8,.5,.55),0,0,0);
  part(armParts,new THREE.BoxGeometry(6.2,.22,.3),0,-.9,0);
  for(const x of [-2.9,2.9]) {
    const brace=new THREE.BoxGeometry(.2,1.3,.26);brace.rotateZ(x>0?-.6:.6);part(armParts,brace,x*.75,-.5,0);
  }
  part(armParts,new THREE.BoxGeometry(1.2,1.4,.8),0,-.2,0);
  const arm=mergeGeometries(armParts.map(g=>g.toNonIndexed()));armParts.forEach(g=>g.dispose());
  batch(arm,steel,supports.map(t=>({x:t.x,y:t.y-.6,z:-t.s})),'Tower crossarms');
  // Sheave trains: six wheels in a rocking frame under each cable.
  const wheels=[],frames=[],guards=[],rungs=[];
  for(const t of supports) {
    for(const side of [-1,1]) {
      const x=t.x+layout.ds*side*CABLE_SPACING,s=t.s-layout.dx*side*CABLE_SPACING;
      guards.push({x,y:t.y+.15,z:-s});
      frames.push({x,y:t.y-.55,z:-s});
      for(let k=0;k<6;k++) {
        const along=(k-2.5)*.46;
        wheels.push({x:x+layout.dx*along,y:t.y-.36,z:-s-layout.ds*along,rotation:[0,layout.heading,Math.PI/2]});
      }
    }
    for(let y=t.ground+2.2;y<t.y-1.4;y+=.45)rungs.push({x:t.x+layout.ds*.62,y,z:-t.s+layout.dx*.62});
  }
  batch(new THREE.CylinderGeometry(.21,.21,.2,14),rubber,wheels,'Cable sheave wheels');
  batch(new THREE.BoxGeometry(.5,.3,2.9),galvanised,frames,'Sheave train frames');
  // Service guards stand above each cable: these are the visible rail obstacles.
  // Open steel side plates keep the sheaves visible; a red bar marks the top.
  const guardParts=[];
  for(const x of [-.42,.42]) {
    part(guardParts,new THREE.BoxGeometry(.08,2.1,.16),x,-.1,-.64);
    part(guardParts,new THREE.BoxGeometry(.08,2.1,.16),x,-.1,.64);
    part(guardParts,new THREE.BoxGeometry(.08,.14,1.45),x,-.95,0);
    part(guardParts,new THREE.BoxGeometry(.08,.14,1.45),x,.3,0);
  }
  batch(mergeGeometries(guardParts),galvanised,guards,'Tower cable guards / jump obstacles');
  guardParts.forEach(g=>g.dispose());
  batch(new THREE.BoxGeometry(.96,.16,1.45),red,guards.map(g=>({...g,y:g.y+1.02})),'Tower guard caps');
  batch(new THREE.BoxGeometry(.3,.045,.06),galvanised,rungs,'Service ladder rungs');

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
    // Bullwheel: rim, spokes and hub instead of a solid disc.
    const wheel=new THREE.Group();wheel.name='Bullwheel';station.add(wheel);
    const rim=new THREE.Mesh(new THREE.TorusGeometry(CABLE_SPACING,.16,8,64),galvanised);rim.rotation.x=Math.PI/2;wheel.add(rim);
    for(let k=0;k<8;k++) {
      const spoke=new THREE.Mesh(new THREE.BoxGeometry(CABLE_SPACING*2-.2,.12,.18),galvanised);
      spoke.rotation.y=k*Math.PI/8;spoke.castShadow=true;wheel.add(spoke);
    }
    const hub=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,.9,20),steel);hub.castShadow=true;wheel.add(hub);
    wheel.position.y=-.3;
    // Portal station: two lattice pylons stand outside the 13 m deck, so the
    // ski path through the station is open. A slim truss yoke just above the
    // cable carries the bullwheel shaft and a compact drive head; nothing
    // else spans the path, so the follow camera never meets a ceiling.
    const span=8.6,yoke=1.1,depth=1.4;
    station.updateMatrixWorld(true);
    for(const side of [-1,1]) {
      const foot=station.localToWorld(new THREE.Vector3(side*span,0,0));
      const bottom=groundHeight(foot.x,-foot.z)-t.y-.4;
      const parts=latticeColumn(side*span,bottom,yoke+1.6,1.4,.9);
      const pylon=add(mergeGeometries(parts),red,0,0,0);pylon.name='Station pylon';parts.forEach(g=>g.dispose());
      add(new THREE.BoxGeometry(2.4,1,2.4),concrete,side*span,bottom+.3,0);
      // Pylon cap lamp.
      add(new THREE.BoxGeometry(1.8,.35,1.8),steel,side*span,yoke+1.78,0);
    }
    const beam=latticeBeam(-span,span,yoke,1.3,depth);
    const yokeMesh=add(mergeGeometries(beam),red,0,0,0);yokeMesh.name='Station yoke';beam.forEach(g=>g.dispose());
    const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,yoke+.3,12),galvanised);
    shaft.position.y=yoke/2-.15;shaft.castShadow=true;station.add(shaft);
    // Drive head: gearbox and motor housing sitting on the yoke.
    const head=new THREE.Group();head.name='Drive head';station.add(head);
    const part=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;head.add(m);return m;};
    part(new THREE.BoxGeometry(3,1.5,2.2),cream,0,yoke+2.05,0);
    part(new THREE.CylinderGeometry(.55,.55,2.4,16).rotateZ(Math.PI/2),steel,0,yoke+1.95,1.4);
    part(new THREE.BoxGeometry(3.3,.18,2.5),red,0,yoke+2.88,0);
    add(new THREE.BoxGeometry(13,.5,12),deckMaterial,0,t.ground-t.y-.25,0);
    const points=[];
    for(let i=0;i<=32;i++) {
      const angle=i/32*Math.PI;
      points.push(new THREE.Vector3(Math.cos(angle)*CABLE_SPACING,0,(index ? -1 : 1)*Math.sin(angle)*CABLE_SPACING));
    }
    const arc=new THREE.CatmullRomCurve3(points);
    add(new THREE.TubeGeometry(arc,48,CABLE_RADIUS,6,false),cableMaterial,0,0,0);
    if(index) {
      // Operator hut beside the base terminal, clear of the loading area.
      const hut=new THREE.Group();hut.position.set(13,t.ground-t.y,2);station.add(hut);
      const box=(w,h,d,m,x,y,z)=>{const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);b.position.set(x,y,z);b.castShadow=b.receiveShadow=true;hut.add(b);return b;};
      box(3.4,2.7,3,cream,0,1.35,0);
      box(3.2,1.1,.06,glass,0,1.75,1.52);box(.06,1.1,2.6,glass,1.72,1.75,0);
      box(3.9,.25,3.5,red,0,2.8,0);box(3.9,.12,3.5,cream,0,2.98,0);
    }
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
  // Four-seat chair: grip, curved hanger, bench, backrest, bar and footrest.
  const chairCount=Math.ceil(loopLength/65),frameParts=[],seatParts=[];
  part(frameParts,new THREE.BoxGeometry(.22,.3,.34),0,-.12,0);
  part(frameParts,new THREE.CylinderGeometry(.055,.055,2.5,6),0,-1.45,-.12);
  part(frameParts,new THREE.CylinderGeometry(.05,.05,.7,6).rotateX(-.55),0,-2.85,.05);
  part(frameParts,new THREE.BoxGeometry(2.9,.1,.1),0,-3.22,.28);
  for(const x of [-1.4,1.4])part(frameParts,new THREE.BoxGeometry(.08,.9,.08),x,-3.2,.4);
  part(frameParts,new THREE.BoxGeometry(2.7,.07,.07),0,-2.62,-.62);
  part(frameParts,new THREE.BoxGeometry(2.6,.06,.34),0,-3.98,-.75);
  for(const x of [-1.25,1.25])part(frameParts,new THREE.BoxGeometry(.06,1.35,.06),x,-3.3,-.68);
  for(let k=0;k<4;k++) {
    const x=(k-1.5)*.7;
    part(seatParts,new THREE.BoxGeometry(.64,.16,.72),x,-3.52,.02);
    part(seatParts,new THREE.BoxGeometry(.64,.72,.12).rotateX(-.18),x,-3.08,.42);
  }
  const frame=batch(mergeGeometries(frameParts.map(g=>g.index ? g.toNonIndexed() : g)),galvanised,Array.from({length:chairCount},()=>({x:0,y:0,z:0})),'Moving lift chair frames');
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
