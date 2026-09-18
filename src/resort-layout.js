import { groundHeight, radiusAt, TREES } from './blackridge.js';
import { liftRoute } from './lift-route.js';

// Shared, deterministic layout in mountain coordinates (Three.js z = -s).
const TAU = Math.PI * 2;
const ringPoint = angle => {
  const r = Math.min(radiusAt(angle) * (1.115 + .008 * Math.sin(angle * 9)),
    2525 / Math.max(Math.abs(Math.sin(angle)),Math.abs(Math.cos(angle))));
  return { x: Math.sin(angle) * r, s: Math.cos(angle) * r };
};
export function townPoint(town, u, v) {
  return { x: town.x + Math.cos(town.angle)*u + Math.sin(town.angle)*v,
    s: town.s - Math.sin(town.angle)*u + Math.cos(town.angle)*v };
}
export const promenadeOffset = (town,u) => 10*Math.sin(u*.011+town.angle);

function createLayout() {
  const ring = { name: 'Valley road', width: 12, points: [] };
  for (let i=0;i<720;i++) ring.points.push(ringPoint(i/720*TAU));
  ring.points.push({...ring.points[0]});
  const roads=[ring],towns=[],lift=liftRoute(true,2100);
  for (const [index,[name,degrees]] of [
    ['GLACIER VILLAGE',54],['SUN TERRACE',120],['LES AROLLES',180],
    ['THUNDER HAMLET',240],['CEDAR RIDGE',300],['NORTH VILLAGE',0],
  ].entries()) {
    const angle=degrees*Math.PI/180,r=radiusAt(angle)*1.065;
    const town={name,angle,x:Math.sin(angle)*r,s:Math.cos(angle)*r,buildings:[]};
    for (let row=0;row<2;row++) for(let column=0;column<9;column++) {
      const seed=index*37+row*17+column*11;
      const u=(column-4)*57+Math.sin(seed*2.7)*5;
      const v=promenadeOffset(town,u)+(row ? 1 : -1)*(45+seed%17);
      const p=townPoint(town,u,v);
      const cabin=column===0 || column===8 || (index>0 && column%4===1);
      const width=cabin?13+seed%4:23+seed%6,depth=cabin?12:24+seed%5;
      const radius=Math.hypot(width,depth)/2+3;
      if(Math.hypot(p.x-lift.bottom.x,p.s-lift.bottom.s)<radius+40)continue;
      const along=(p.x-lift.top.x)*lift.dx+(p.s-lift.top.s)*lift.ds;
      const across=Math.abs((p.x-lift.top.x)*lift.ds-(p.s-lift.top.s)*lift.dx);
      if(along<lift.length+35 && across<radius+16)continue;
      if(TREES.some(t=>Math.hypot(p.x-t.x,p.s-t.s)<radius+t.radius+3))continue;
      const footprint=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([x,z])=>townPoint(town,u+x*width/2,v+z*depth/2));
      const heights=footprint.map(p=>groundHeight(p.x,p.s));
      if(Math.max(...heights)-Math.min(...heights)>11)continue;
      town.buildings.push({...p,kind:cabin?'cabin':'residence',width,depth,radius,footprint,
        angle,seed,floors:cabin?2:5+seed%8,floor:Math.max(...heights)+.35,
        foundationBottom:Math.min(...heights)-1});
    }
    const points=[];
    for(let u=-265;u<=265;u+=5)points.push(townPoint(town,u,promenadeOffset(town,u)));
    const end=points.at(-1);
    const join=ring.points[Math.round(((Math.atan2(end.x,end.s)+TAU)%TAU)/TAU*720)%720];
    const distance=Math.hypot(join.x-end.x,join.s-end.s),steps=Math.ceil(distance/5);
    for(let i=1;i<=steps;i++)points.push({x:end.x+(join.x-end.x)*i/steps,s:end.s+(join.s-end.s)*i/steps});
    roads.push({name:`${name} promenade`,town:name,width:10,points});
    towns.push(town);
  }
  // The perimeter follows an irregular mountain outline; reserve its actual
  // route rather than assuming every town has the same distance to the road.
  for(const town of towns)town.buildings=town.buildings.filter(b=>roads.every(road=>
    road.points.every(p=>Math.hypot(p.x-b.x,p.s-b.s)>b.radius+road.width/2+3)));
  return {towns,roads};
}

export const RESORT=createLayout();
