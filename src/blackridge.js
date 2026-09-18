// Blackridge is a continuous, authored mountain. Coordinates are x/east and
// s/north (Three.js z = -s); s is a position, never course progress.
export const OPEN_WORLD = true;
export const RADIUS = 2100;
export const SUMMIT_HEIGHT = 1960;
export const BASE_HEIGHT = 70;
export const LENGTH = RADIUS;
export const WIDTH = RADIUS;
export const centerAt = () => 0;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
const radians = d => d * Math.PI / 180;
export const AREAS = [
  { name: 'THE WALL', angle: 0, description: 'Broken cliffs / steep snow chutes' },
  { name: 'HANGING GLACIER', angle: 60, description: 'Wind lips / wide step-downs' },
  { name: 'SUN BOWL', angle: 120, description: 'Open carving / rolling side hits' },
  { name: 'CATHEDRAL SPINES', angle: 180, description: 'Ridge transfers / connected gullies' },
  { name: 'THUNDER BASIN', angle: 240, description: 'Huge drops / deep catch bowls' },
  { name: 'WINDFIELD', angle: 300, description: 'Fast rollers / forest shoulders' },
];
// angle, radius, lip rise, approach length, half width, cliff depth, assist.
// Deliberately staggered and offset; these are landforms, not course gates.
const placements = [
  ['CROWN FALL', -10, 380, 55, 85, 100, 160, 28],
  ['THE WALL', 13, 910, 68, 100, 140, 210, 30],
  ['WHITE NEEDLE', -24, 1360, 24, 65, 72, 70, 15],
  ['NORTH SHOULDER', 27, 1530, 18, 60, 80, 20, 10],
  ['ICE TOOTH', 3, 1660, 22, 68, 75, 40, 12],
  ['HANG TIME', 52, 420, 70, 95, 120, 160, 32],
  ['GLACIER EXPRESS', 74, 950, 80, 100, 150, 180, 34],
  ['BLUE LIP', 42, 1280, 28, 72, 110, 55, 18],
  ['SNOW PILLOW', 83, 1450, 20, 65, 75, 25, 12],
  ['EAST CORNICE', 61, 1690, 22, 68, 85, 35, 12],
  ['SUNBURST', 114, 490, 62, 100, 150, 130, 30],
  ['SOLAR FLARE', 137, 1040, 74, 105, 165, 150, 31],
  ['BOWL WALL', 99, 1320, 30, 75, 100, 60, 17],
  ['LONG ROLL', 127, 1530, 22, 90, 130, 20, 10],
  ['SIDEWINDER', 147, 1590, 18, 65, 72, 30, 12],
  ['CATHEDRAL', 175, 390, 65, 85, 110, 180, 30],
  ['BELL TOWER', 194, 970, 76, 95, 130, 220, 34],
  ['SPINE TRANSFER', 158, 1280, 32, 72, 80, 60, 18],
  ['LOW SADDLE', 207, 1450, 18, 65, 90, 25, 12],
  ['SOUTH WIND', 180, 1690, 23, 70, 90, 45, 14],
  ['THUNDERHEAD', 232, 440, 95, 105, 150, 220, 38],
  ['THE ABYSS', 254, 1010, 90, 105, 170, 250, 38],
  ['AFTERSHOCK', 215, 1260, 30, 75, 115, 65, 17],
  ['BASIN RIM', 271, 1330, 26, 75, 95, 65, 16],
  ['LAST ECHO', 241, 1690, 22, 70, 110, 40, 14],
  ['WIND SCULPTURE', 297, 430, 65, 90, 130, 160, 30],
  ['SKY BRIDGE', 318, 1000, 72, 100, 140, 190, 32],
  ['DRIFTWOOD', 283, 1260, 28, 80, 110, 35, 15],
  ['POWDER WAVE', 332, 1430, 26, 75, 100, 45, 15],
  ['FOREST EDGE', 301, 1660, 22, 75, 100, 30, 12],
  ['WEST BANK', 264, 760, 20, 62, 65, 40, 14],
  ['EAST BANK', 91, 740, 22, 62, 75, 35, 14],
  ['SOUTH SADDLE', 151, 700, 20, 65, 65, 45, 13],
  ['NORTH SADDLE', 31, 690, 18, 62, 65, 35, 12],
  ['WIND GAP', 343, 730, 22, 65, 70, 50, 15],
  ['THUNDER GAP', 210, 690, 22, 65, 70, 40, 14],
];
// Short, staggered summit cornices give every starting face an early takeoff.
// Short catch/recovery lengths leave space for the larger features below.
const summitLips = [
  ['FIRST LIGHT', 0, 145, 27, 42, 57, 34, 19],
  ['NORTH DRIFT', 30, 205, 30, 45, 70, 38, 20],
  ['ICE CREST', 60, 165, 28, 40, 61, 40, 20],
  ['EAST WIND', 90, 220, 32, 45, 78, 35, 20],
  ['SUN LIP', 120, 170, 29, 42, 64, 38, 20],
  ['HIGH SADDLE', 150, 210, 30, 45, 76, 42, 21],
  ['SUMMIT SPINE', 180, 150, 28, 40, 58, 40, 20],
  ['SOUTH CORNICE', 210, 205, 31, 44, 76, 45, 21],
  ['FIRST THUNDER', 240, 170, 33, 42, 65, 48, 22],
  ['WEST CURL', 270, 225, 30, 44, 80, 38, 20],
  ['HIGH DRIFT', 300, 155, 29, 40, 60, 38, 20],
  ['NORTHWEST LIP', 330, 195, 30, 42, 72, 40, 21],
].map(([name,angle,radius,height,length,width,drop,kick])=>
  [name,angle,radius,height*.72,length,width,drop*.7,kick*.6,70,120]);
// Side hits occupy gaps between the big drops, with offset positions and broad
// shoulders so they remain optional from a traverse or a different approach.
const linkingLips = [
  ['NORTH ROLL', 28, 470, 32, 46, 68, 48, 21],
  ['GLACIER SHOULDER', 86, 530, 30, 44, 72, 42, 20],
  ['SUN RIDGE', 146, 485, 34, 46, 68, 50, 22],
  ['CATHEDRAL SHOULDER', 207, 500, 32, 44, 70, 48, 21],
  ['THUNDER CURL', 273, 545, 35, 46, 74, 56, 23],
  ['WEST ROLL', 337, 490, 31, 44, 70, 45, 21],
  ['WALL TRANSFER', -9, 735, 33, 46, 80, 52, 22],
  ['GLACIER DRIFT', 57, 760, 34, 48, 85, 48, 22],
  ['SUN SWELL', 118, 785, 32, 46, 85, 42, 21],
  ['SPINE LIP', 180, 735, 35, 46, 78, 52, 23],
  ['BASIN WAVE', 236, 790, 37, 48, 90, 60, 24],
  ['WIND CURL', 300, 745, 32, 44, 82, 46, 21],
  ['NORTH ESCARPMENT', 37, 1080, 35, 48, 90, 56, 23],
  ['EAST SHELF', 97, 1120, 32, 46, 95, 48, 22],
  ['SUN TRANSFER', 155, 1070, 34, 48, 88, 50, 22],
  ['SOUTH SHELF', 213, 1115, 36, 48, 90, 58, 23],
  ['WEST SHELF', 277, 1090, 34, 46, 95, 52, 22],
  ['WIND TRANSFER', 345, 1150, 33, 48, 92, 48, 22],
  ['LOW NORTH LIP', 11, 1460, 26, 42, 82, 38, 19],
  ['LOW GLACIER LIP', 66, 1550, 28, 44, 86, 40, 20],
  ['LOW SUN LIP', 110, 1675, 27, 44, 90, 36, 19],
  ['LOW SPINE LIP', 168, 1510, 28, 44, 82, 42, 20],
  ['LOW THUNDER LIP', 257, 1530, 30, 46, 90, 45, 21],
  ['LOW WIND LIP', 321, 1650, 26, 44, 86, 35, 19],
].map(p=>[...p,120,180]);
export const FEATURES = [...placements,...summitLips,...linkingLips].map(([name, angle, radius, height, length, width, drop, kick, catchLength, recovery=300], index) => {
  const a = radians(angle), dx = Math.sin(a), ds = Math.cos(a);
  return { name, index, angle: a, x: dx * radius, s: ds * radius, dx, ds,
    height, length, width, drop, kick, major: drop >= 130, catchLength: catchLength ?? (drop >= 130 ? 480 : 190), recovery };
});
// Stable, scattered wind lips fill the spaces between the authored landmarks.
// Reserve each existing approach and landing before placing these smaller hits.
export const SMALL_LIPS = [];
let lipSeed = 194729;
const lipRandom = () => { lipSeed=(lipSeed*1664525+1013904223)>>>0;return lipSeed/4294967296; };
for(let attempt=0;SMALL_LIPS.length<100 && attempt<30000;attempt++) {
  const angle=lipRandom()*Math.PI*2;
  const band=SMALL_LIPS.length<20?[260,700]:SMALL_LIPS.length<55?[700,1300]:[1300,radiusAt(angle)*.88];
  const radius=Math.sqrt(band[0]**2+lipRandom()*(band[1]**2-band[0]**2));
  const dx=Math.sin(angle),ds=Math.cos(angle),x=dx*radius,s=ds*radius;
  const width=16+lipRandom()*10,length=13+lipRandom()*7;
  if(FEATURES.some(f=>{
    const {u,v}=featureCoordinates(f,x,s);
    const landingEnd=f.major?f.catchLength+f.recovery+60:f.catchLength+60;
    const landingWidth=f.width*(f.major?1.2:.9)+width+12;
    return u>-f.length-35 && u<landingEnd && Math.abs(v)<landingWidth;
  }))continue;
  if(SMALL_LIPS.some(f=>Math.hypot(x-f.x,s-f.s)<115))continue;
  SMALL_LIPS.push({name:`WIND LIP ${SMALL_LIPS.length+1}`,index:FEATURES.length+SMALL_LIPS.length,
    angle,x,s,dx,ds,width,length,height:6+lipRandom()*4,drop:3+lipRandom()*5,
    kick:4+lipRandom()*3,catchLength:35,recovery:70,major:false,small:true});
}
if(SMALL_LIPS.length!==100)throw new Error('Blackridge needs space for all 100 small wind lips');
FEATURES.push(...SMALL_LIPS);
// Broad, connected wind rolls cover the snowfields between isolated jumps.
// Protect takeoff crests, not entire 800 m catch basins: that old exclusion
// left kilometer-long stretches without anything to jump from.
export const SNOWFIELD_LIPS = [];
const coverageStep=145;
for(let row=-15;row<=15;row++)for(let column=-15;column<=15;column++) {
  // Per-cell seeds keep other rolls fixed when a single location is rejected.
  lipSeed=(((row+16)*73856093)^((column+16)*19349663)^92741)>>>0;
  const x=(column+(row%2)*.5)*coverageStep+(lipRandom()-.5)*44;
  const s=row*coverageStep+(lipRandom()-.5)*44;
  const radius=Math.hypot(x,s),angle=Math.atan2(x,s);
  if(radius<280 || radius>radiusAt(angle)*.93)continue;
  if(FEATURES.some(f=>{
    const {u,v}=featureCoordinates(f,x,s);
    return u>-f.length-28 && u<40 && Math.abs(v)<f.width+45;
  }))continue;
  const dx=Math.sin(angle),ds=Math.cos(angle);
  const basinExit=FEATURES.some(f=>{
    const {u,v}=featureCoordinates(f,x,s);
    return f.major && u>f.catchLength-40 && u<f.catchLength+f.recovery+100 && Math.abs(v)<f.width*1.8;
  });
  // Keep the uphill center of a deep catch basin smooth enough to carry speed
  // out; nearby shoulder rolls remain reachable with a short traverse.
  if(FEATURES.some(f=>{
    const {u,v}=featureCoordinates(f,x,s);
    return f.major && u>f.catchLength-40 && u<f.catchLength+f.recovery+100 && Math.abs(v)<f.width*.9;
  }))continue;
  SNOWFIELD_LIPS.push({name:`SNOWFIELD ROLL ${SNOWFIELD_LIPS.length+1}`,index:FEATURES.length+SNOWFIELD_LIPS.length,
    angle,x,s,dx,ds,width:65+lipRandom()*25,length:(24+lipRandom()*8)*(basinExit?1.5:1),height:(11+lipRandom()*5)*(basinExit?.3:1),
    drop:(3+lipRandom()*4)*(basinExit?.5:1),kick:5+lipRandom()*3,catchLength:30,recovery:65,major:false,snowfield:true});
}
FEATURES.push(...SNOWFIELD_LIPS);
// No ordered jump list: navigation never points to a mandatory next feature.
export const JUMPS = [];
export function radiusAt(angle) {
  return RADIUS * (1 + .075 * Math.sin(angle * 3 + .4) + .045 * Math.cos(angle * 5 - .8));
}
export function mountainFraction(x, s) {
  return Math.hypot(x, s) / radiusAt(Math.atan2(x, s));
}
export function areaAt(x, s) {
  if (Math.hypot(x, s) < 110) return { name: 'THE SUMMIT', description: 'Choose any face / ↑ to push off' };
  const angle = (Math.atan2(x, s) * 180 / Math.PI + 360) % 360;
  return AREAS[Math.floor((angle + 30) / 60) % 6];
}
export function featureCoordinates(f, x, s) {
  const ox = x - f.x, os = s - f.s;
  return { u: ox * f.dx + os * f.ds, v: ox * f.ds - os * f.dx };
}
// Spatial bins keep terrain generation and physics proportional to local detail.
const bins = new Map();
const BIN = 320;
for (const f of FEATURES) {
  const extent = f.catchLength + f.recovery;
  const cx = f.x + f.dx * extent / 2, cs = f.s + f.ds * extent / 2;
  const bound = extent / 2 + f.width * 1.8 + f.length;
  for (let ix = Math.floor((cx - bound) / BIN); ix <= Math.floor((cx + bound) / BIN); ix++)
    for (let iz = Math.floor((cs - bound) / BIN); iz <= Math.floor((cs + bound) / BIN); iz++) {
      const key = `${ix},${iz}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key).push(f);
    }
}
const nearby = (x,s) => bins.get(`${Math.floor(x / BIN)},${Math.floor(s / BIN)}`) || [];
function terrainHeight(x, s) {
  const r = Math.hypot(x,s), a = Math.atan2(x,s), q = mountainFraction(x,s);
  if (q >= 1.13) return BASE_HEIGHT - 18;
  // A tiny rounded tip retains stationary heading selection, then immediately
  // falls away on every face instead of starting on a broad, shallow dome.
  const capR = Math.sqrt(r*r + 2*2) - 2;
  const t = clamp(capR / (radiusAt(a) - 2));
  let h = BASE_HEIGHT + (SUMMIT_HEIGHT - BASE_HEIGHT) * Math.pow(1-t, 1.16);
  const envelope = smooth(r / 430) * (1-smooth((q-.72)/.31));
  // Meandering watersheds, broad connected bowls and offset secondary ridges.
  const ridges = 92 * Math.sin(a*5 + r*.00085) + 48 * Math.cos(a*3 - r*.0019);
  const folds = 24 * Math.sin(x*.007+s*.002) * Math.sin(s*.005-x*.0018);
  const detail = 4 * Math.sin(x*.028+s*.013) * Math.sin(s*.019-x*.012);
  h += (ridges + folds + detail) * envelope;
  for (const f of nearby(x,s)) {
    const {u,v} = featureCoordinates(f,x,s);
    if(u < -f.length || u > f.catchLength+f.recovery || Math.abs(v) > f.width*1.8) continue;
    const shoulder = smooth((f.width-Math.abs(v))/(f.width*.42));
    if(u <= 0) {
      const t = clamp((u+f.length)/f.length);
      h += f.height*t*t*shoulder;
    } else {
      const basinWidth = f.width * (1 + .65 * smooth(u/150));
      const basin = smooth((basinWidth-Math.abs(v))/(basinWidth*.4));
      h += f.height*(1-smooth(u/10))*shoulder;
      h -= f.drop*smooth(u/14)*(1-smooth((u-f.catchLength)/f.recovery))*basin;
    }
  }
  // The runout becomes one continuous low apron around the entire mountain.
  return h*(1-smooth((q-.92)/.18)) + (BASE_HEIGHT-18)*smooth((q-.92)/.18);
}
// Physics and the nearest render tiles use the very same two-metre triangles.
// Sampling an analytic surface beneath a coarser render mesh can bury the skier.
export const SURFACE_GRID = 2;
const heightCache = new Map();
function vertexHeight(ix, iz) {
  const key = (ix + 8192) * 16384 + iz + 8192;
  let value = heightCache.get(key);
  if (value === undefined) {
    value = terrainHeight(ix * SURFACE_GRID, iz * SURFACE_GRID);
    if (heightCache.size > 900000) heightCache.clear();
    heightCache.set(key, value);
  }
  return value;
}
export function groundHeight(x, s) {
  const gx=x/SURFACE_GRID,gz=s/SURFACE_GRID,ix=Math.floor(gx),iz=Math.floor(gz);
  const u=gx-ix,v=gz-iz;
  const b=vertexHeight(ix+1,iz),c=vertexHeight(ix,iz+1);
  if(u+v<=1) return vertexHeight(ix,iz)*(1-u-v)+b*u+c*v;
  return vertexHeight(ix+1,iz+1)*(u+v-1)+b*(1-v)+c*(1-u);
}
export const sceneryHeight = groundHeight;
export const baseHeight = s => groundHeight(0,s);
export function gradientAt(x,s,epsilon=1) {
  return { x:(groundHeight(x+epsilon,s)-groundHeight(x-epsilon,s))/(epsilon*2),
    s:(groundHeight(x,s+epsilon)-groundHeight(x,s-epsilon))/(epsilon*2) };
}
export function rampAt(x,s) {
  return nearby(x,s).find(f => { const {u,v}=featureCoordinates(f,x,s); return u >= -f.length && u <= 12 && Math.abs(v) < f.width*.9; });
}
export function atBase(x,s,y) { return mountainFraction(x,s) >= .97 && y < BASE_HEIGHT+95; }
export function getSpawn() { return { x:0, s:0, heading:0 }; }

// Deterministic lower-mountain tree islands. Clear approaches and catch bowls
// remain open; each rendered trunk has a matching small collision circle.
let treeSeed=271828;
const rand=()=>{treeSeed=(treeSeed*1664525+1013904223)>>>0;return treeSeed/4294967296;};
export const TREES=[];
for(let i=0;i<1800 && TREES.length<260;i++) {
  const a=rand()*Math.PI*2,r=radiusAt(a)*(.66+rand()*.27);
  const x=Math.sin(a)*r,s=Math.cos(a)*r,y=groundHeight(x,s);
  const g=gradientAt(x,s);
  if(y>500 || y<120 || Math.hypot(g.x,g.s)>.85)continue;
  if(nearby(x,s).some(f=>{const {u,v}=featureCoordinates(f,x,s);return u > -f.length-35 && u < f.catchLength+260 && Math.abs(v)<f.width*1.8+25;}))continue;
  const scale=.7+rand()*.75;
  TREES.push({x,s,y,scale,radius:.55*scale});
}
export function treeCollision(x,s) {
  return TREES.find(t=>Math.abs(x-t.x)<t.radius+.4 && Math.abs(s-t.s)<t.radius+.4 && Math.hypot(x-t.x,s-t.s)<t.radius+.4);
}
