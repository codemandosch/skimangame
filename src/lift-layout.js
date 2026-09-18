import { COURSE } from './course.js';
import { liftRoute } from './lift-route.js';

export const CABLE_RADIUS = .095;
export const RAIL_HEIGHT = CABLE_RADIUS;
export const CABLE_SPACING = 4.5;
export const TOWER_TOP = 1.25;
export const MIN_TOWER_SPACING = 180;
const layouts=new Map();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

// Distances run from the summit terminal to the base terminal. Rendering and
// collision both sample these exact support heights and parabolic cable spans.
export function getLiftLayout(course=COURSE) {
  if(layouts.has(course.id))return layouts.get(course.id);
  const {top,bottom,length,dx,ds}=liftRoute(course.openWorld,course.LENGTH);
  const sag=2.2;
  const floorAt=u=>{
    let floor=-Infinity;
    for(const offset of [-CABLE_SPACING,0,CABLE_SPACING])
      floor=Math.max(floor,course.sceneryHeight(top.x+dx*u+ds*offset,top.s+ds*u-dx*offset));
    return floor;
  };
  // Pick crests within long spans rather than inserting supports on every
  // ridge. The shorter summit approach keeps the first cable easy to reach;
  // every subsequent support has at least 180 m of uninterrupted wire.
  const positions=[0];
  while(length-positions.at(-1)>330) {
    const previous=positions.at(-1),start=previous+(previous===0 ? 80 : MIN_TOWER_SPACING);
    const end=Math.min(previous+330,length-MIN_TOWER_SPACING);
    const low=floorAt(start),high=floorAt(end);
    let best=-Infinity,u=start;
    for(let candidate=start;candidate<=end;candidate+=2) {
      const crest=floorAt(candidate)-(low+(high-low)*(candidate-start)/(end-start));
      if(crest>best){best=crest;u=candidate;}
    }
    positions.push(u);
  }
  positions.push(length);
  const span=length/(positions.length-1);
  const towers=positions.map((u,index)=>{
    const terminal=index===0 || index===positions.length-1;
    const x=top.x+dx*u,s=top.s+ds*u,ground=course.sceneryHeight(x,s);
    return {index,u,x,s,ground,y:Math.max(ground,floorAt(u))+(terminal ? 7 : 13)};
  });
  // Raise supports only where necessary to keep the chair seats above every
  // intervening ridge, including both sides of the cable loop.
  for(let pass=0;pass<3;pass++) for(let i=0;i<towers.length-1;i++) {
    const a=towers[i],b=towers[i+1],width=b.u-a.u;
    // An oblique route crosses the two-metre terrain triangles between grid
    // vertices. Sub-metre samples also catch narrow lips under either wire.
    const samples=Math.ceil(width/.5);
    for(let j=1;j<samples;j++) {
      const t=j/samples,u=a.u+width*t;
      const floor=floorAt(u);
      const deficit=floor+6-(a.y*(1-t)+b.y*t-4*sag*t*(1-t));
      if(deficit>0) {
        const weight=(1-t)**2+t*t;
        a.y+=deficit*(1-t)/weight;b.y+=deficit*t/weight;
      }
    }
  }
  const layout={id:course.id,top,bottom,length,dx,ds,span,sag,towers,heading:-Math.atan2(dx,ds)};
  layouts.set(course.id,layout);return layout;
}

export function liftCoordinates(layout,x,s) {
  const rx=x-layout.top.x,rs=s-layout.top.s;
  return {u:rx*layout.dx+rs*layout.ds,lateral:rx*layout.ds-rs*layout.dx};
}

export function cablePoint(layout,cable,u) {
  u=clamp(u,0,layout.length);
  let index=0,hi=layout.towers.length-1;
  while(hi-index>1){const mid=(index+hi)>>1;if(layout.towers[mid].u<=u)index=mid;else hi=mid;}
  const a=layout.towers[index],b=layout.towers[index+1],width=b.u-a.u,t=(u-a.u)/width;
  const lateral=cable===0 ? -CABLE_SPACING : CABLE_SPACING;
  return {x:layout.top.x+layout.dx*u+layout.ds*lateral,
    s:layout.top.s+layout.ds*u-layout.dx*lateral,
    y:a.y*(1-t)+b.y*t-4*layout.sag*t*(1-t),
    grade:(b.y-a.y-4*layout.sag*(1-2*t))/width,
    u,index};
}

// Swept point vs expanded boxes: the moving point is the skier's ski plane.
// This catches a tower even when a fast frame crosses it completely.
function segmentBox(a,b,min,max) {
  let enter=0,exit=1;
  for(const axis of ['u','lateral','y']) {
    const d=b[axis]-a[axis];
    if(Math.abs(d)<1e-9) {if(a[axis]<min[axis] || a[axis]>max[axis])return false;}
    else {
      const t0=(min[axis]-a[axis])/d,t1=(max[axis]-a[axis])/d;
      enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));
      if(enter>exit)return false;
    }
  }
  return true;
}

export function cableTowerHit(layout,from,to) {
  const a={...liftCoordinates(layout,from.x,from.s),y:from.y};
  const b={...liftCoordinates(layout,to.x,to.s),y:to.y};
  for(const tower of layout.towers) {
    if(tower.index===0 || tower.index===layout.towers.length-1)continue;
    if(tower.u<Math.min(a.u,b.u)-2 || tower.u>Math.max(a.u,b.u)+2)continue;
    if(segmentBox(a,b,{u:tower.u-1.5,lateral:-6.2,y:tower.y-2.7},
      {u:tower.u+1.5,lateral:6.2,y:tower.y+TOWER_TOP}) ||
      segmentBox(a,b,{u:tower.u-1,lateral:-1.1,y:tower.ground-1.7},
      {u:tower.u+1,lateral:1.1,y:tower.y}))return tower;
  }
  return null;
}
