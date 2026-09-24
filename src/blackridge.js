// Blackridge is a continuous, authored mountain. Coordinates are x/east and
// s/north (Three.js z = -s); s is a position, never course progress.
import { liftRoute } from './lift-route.js';
import { createLogLayout } from './log-placement.js';
import { createParkLine, parkWeight, parkReserved } from './park-line.js';
import { blocksNaturalTakeoff } from './kicker-placement.js';
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
  // Broad approach leaves an exit between Crown Fall and Wind Gap.
  ['WIND TRANSFER', 345, 1150, 18, 80, 92, 48, 22],
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
// Keep the signature cliffs, but lower their second ledges and bring the
// landing snow up. Shorter catches free the lower faces for more ridge lines.
// Tune after seeded placement to keep the existing small wind lips in place;
// major remains the landmark classification even with a shallower catch.
for (const f of FEATURES) if (f.major) {
  f.height *= .58;
  // Bell Tower sits on a rising watershed shoulder; its snow lip needs less
  // added rise to keep the second takeoff reachable without a maximum-speed run.
  if (f.name === 'BELL TOWER') f.height *= .8;
  f.drop *= .5;
  f.catchLength = 300;
  f.recovery = Math.max(300, f.drop * 4);
}
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
  // The raised catches can carry mellow rolls through their centers as well
  // as their shoulders. Longer approaches keep the recovery skiable.
  SNOWFIELD_LIPS.push({name:`SNOWFIELD ROLL ${SNOWFIELD_LIPS.length+1}`,index:FEATURES.length+SNOWFIELD_LIPS.length,
    angle,x,s,dx,ds,width:65+lipRandom()*25,length:(24+lipRandom()*8)*(basinExit?1.5:1),height:(11+lipRandom()*5)*(basinExit?.65:1),
    drop:(3+lipRandom()*4)*(basinExit?.5:1),kick:5+lipRandom()*3,catchLength:30,recovery:65,major:false,snowfield:true});
}
FEATURES.push(...SNOWFIELD_LIPS);
// Compact side hits fill the gaps without adding more deep catch basins.
export const KICKERS = [];
for(let face=0;face<12;face++)for(let band=0;band<9;band++) {
  const angle=radians(face*30+(band%2 ? 8 : -8));
  const radius=300+band*170,dx=Math.sin(angle),ds=Math.cos(angle);
  const x=dx*radius,s=ds*radius;
  if(FEATURES.some(f=>{
    const {u,v}=featureCoordinates(f,x,s);
    return u>-f.length-22 && u<45 && Math.abs(v)<f.width+20;
  }))continue;
  KICKERS.push({name:`SIDE KICKER ${KICKERS.length+1}`,x,s,dx,ds,angle,
    height:5.5,length:19,width:20,drop:0,kick:8,catchLength:18,recovery:28,small:true,major:false});
}
// A frequent, straight approach under the wires makes cable transfers easy to
// line up. Leave out the worst sites where the next terrain rise swallowed the
// landing immediately; the remaining lips still cover the full lift corridor.
const lift=liftRoute(true,LENGTH);
// Keep authored snow jumps in place when the summit terminal moves downhill.
const liftSnowOrigin={x:lift.dx*24,s:lift.ds*24};
export const LIFT_KICKERS = [];
const liftKickerPositions=[55,235,325,415,505,695,795,895,995,1195,1295,1395,1495,1595,1695,1795,1895];
for(const u of liftKickerPositions) {
  const lateral=u===liftKickerPositions[0] ? 2.5 : 0;
  LIFT_KICKERS.push({name:`LIFT KICKER ${LIFT_KICKERS.length+1}`,
    x:liftSnowOrigin.x+lift.dx*u+lift.ds*lateral,
    s:liftSnowOrigin.s+lift.ds*u-lift.dx*lateral,dx:lift.dx,ds:lift.ds,
    angle:Math.atan2(lift.dx,lift.ds),height:7,length:u<90 ? 20 : 24,width:16,drop:0,
    kick:11,catchLength:16,recovery:24,small:true,major:false,lift:true});
}
// A few larger side hits leave open snow between the cable approaches.
export const SUMMIT_KICKERS = [];
for(let u=130;u<580;u+=200)for(const lateral of [-28,28]) {
  const along=u+(lateral<0 ? 18 : 0);
  SUMMIT_KICKERS.push({name:`SUMMIT SIDE KICKER ${SUMMIT_KICKERS.length+1}`,
    x:liftSnowOrigin.x+lift.dx*along+lift.ds*lateral,
    s:liftSnowOrigin.s+lift.ds*along-lift.dx*lateral,dx:lift.dx,ds:lift.ds,
    angle:Math.atan2(lift.dx,lift.ds),height:6,length:22,width:15,drop:0,
    kick:10,catchLength:12,recovery:18,small:true,major:false});
}
// Keep the existing north-face snow jumps when relocating the lift. Removing
// those landforms would also change unrelated ski lines across the mountain.
const northLength=Math.hypot(43,LENGTH*1.08-12);
const northDx=-43/northLength,northDs=(LENGTH*1.08-12)/northLength;
for(const f of [...SUMMIT_KICKERS,...LIFT_KICKERS]) {
  const rx=f.x-liftSnowOrigin.x,rs=f.s-liftSnowOrigin.s;
  const u=rx*lift.dx+rs*lift.ds,v=rx*lift.ds-rs*lift.dx;
  KICKERS.push({...f,name:`NORTH FACE ${f.name}`,lift:false,
    x:-22+northDx*u+northDs*v,s:12+northDs*u-northDx*v,
    dx:northDx,ds:northDs,angle:Math.atan2(northDx,northDs)});
}
KICKERS.push(...SUMMIT_KICKERS);
KICKERS.push(...LIFT_KICKERS);
// Enlarge only the smallest discrete hits. Keep candidate generation stable so
// removing a conflict does not shuffle unrelated features around the mountain.
for(const f of [...SMALL_LIPS,...KICKERS])if(f.height<7) {
  f.height*=1.25;f.length*=1.25;f.width*=1.25;f.enlarged=true;
}
const naturalTakeoffs=[...FEATURES,...KICKERS].filter(f=>!f.enlarged);
const blocked=new Set([...SMALL_LIPS,...KICKERS].filter(k=>k.enlarged && naturalTakeoffs.some(f=>blocksNaturalTakeoff(k,f))));
for(const list of [FEATURES,SMALL_LIPS,KICKERS,LIFT_KICKERS,SUMMIT_KICKERS]) {
  for(let i=list.length-1;i>=0;i--)if(blocked.has(list[i]))list.splice(i,1);
}
FEATURES.push(...KICKERS);
FEATURES.forEach((f,index)=>f.index=index);
// No ordered jump list: navigation never points to a mandatory next feature.
export const JUMPS = [];
export function radiusAt(angle) {
  return RADIUS * (1 + .075 * Math.sin(angle * 3 + .4) + .045 * Math.cos(angle * 5 - .8));
}
export function mountainFraction(x, s) {
  return Math.hypot(x, s) / radiusAt(Math.atan2(x, s));
}
export function areaAt(x, s) {
  if (parkWeight(x,s) > .9) return { name: 'EAST FACE PARK LINE', description: 'Groomed snow / big jumps / spine' };
  if (Math.hypot(x, s) < 110) return { name: 'THE SUMMIT', description: 'Choose any face / Ctrl to skate' };
  const angle = (Math.atan2(x, s) * 180 / Math.PI + 360) % 360;
  return AREAS[Math.floor((angle + 30) / 60) % 6];
}
export function featureCoordinates(f, x, s) {
  const ox = x - f.x, os = s - f.s;
  return { u: ox * f.dx + os * f.ds, v: ox * f.ds - os * f.dx };
}
// Natural lips are not ruler-straight: each crest bows forward or back toward
// its ends and wanders a little, seeded by its position so it never changes.
// The offset is zero on the centre line, where authored approaches aim.
// Lift and park kickers stay straight to line up with the cables and park lane.
function lipCurve(f) {
  if (f.lipCurve !== undefined) return f.lipCurve;
  const hash = k => { const n = Math.sin(f.x * 12.9898 + f.s * 78.233 + k * 37.719) * 43758.5453; return n - Math.floor(n); };
  f.lipCurve = f.lift || f.parkLine ? null : {
    bow: (hash(1) - .5) * .24 * f.width,
    wobble: (.012 + hash(2) * .028) * f.width,
    waves: 1.2 + hash(3) * 1.6,
    phase: hash(4) * Math.PI * 2,
  };
  return f.lipCurve;
}
// Feature coordinates measured from the curved crest (u = 0 on the lip).
export function lipCoordinates(f, x, s) {
  const c = featureCoordinates(f, x, s), curve = lipCurve(f);
  if (!curve) return c;
  const a = Math.max(-1, Math.min(1, c.v / f.width));
  c.u -= curve.bow * a * a + curve.wobble * Math.sin(Math.PI * curve.waves * a + curve.phase) * Math.abs(a);
  return c;
}
// Polynomial smooth minimum: rounds the crease where ramp and lip top meet.
const smoothMin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k / 4; };
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
// Seeded placement (park fit, summit deck, trees, logs) searches the terrain
// with rejection tests, so any reshaping would reshuffle it. Placement uses
// the original straight lips; play and rendering switch to the rounded,
// curved lips once everything is placed (see the end of this module).
let placementTerrain = true;
function naturalTerrainHeight(x, s, original = placementTerrain) {
  const r = Math.hypot(x,s), a = Math.atan2(x,s), q = mountainFraction(x,s);
  if (q >= 1.13) return BASE_HEIGHT - 18;
  // The mountain profile outside the compact summit platform.
  const capR = Math.sqrt(r*r + 2*2) - 2;
  const t = clamp(capR / (radiusAt(a) - 2));
  let h = BASE_HEIGHT + (SUMMIT_HEIGHT - BASE_HEIGHT) * Math.pow(1-t, 1.16);
  const envelope = smooth(r / 430) * (1-smooth((q-.72)/.31));
  const liftAngle = Math.atan2(lift.dx,lift.ds);
  const acrossLift = Math.abs(Math.atan2(Math.sin(a-liftAngle),Math.cos(a-liftAngle)));
  const liftShoulder = 1-smooth((acrossLift-radians(4))/radians(24));
  // Meandering watersheds, broad connected bowls and offset secondary ridges.
  const watershed = 92 * Math.sin(a*5 + r*.00085) + 48 * Math.cos(a*3 - r*.0019);
  // Break the long watersheds into staggered 400–800 m shoulders, with
  // shorter secondary spines between them. Fade in below the first summit
  // lips so their familiar approach and takeoff stay intact.
  const ridgeSections = .52 + .38 * Math.cos(r*.008 + a*2);
  const secondary = 34 * Math.sin(a*9-r*.0045) * (.5+.5*Math.cos(r*.008+a*3));
  const ridgeBlend = smooth((r-260)/220)*smooth((acrossLift-radians(28))/radians(18));
  const ridges = watershed*(1-ridgeBlend) + (watershed*ridgeSections+secondary)*ridgeBlend;
  const folds = 24 * Math.sin(x*.007+s*.002) * Math.sin(s*.005-x*.0018);
  const detail = 4 * Math.sin(x*.028+s*.013) * Math.sin(s*.019-x*.012);
  h += (ridges + folds + detail) * envelope;
  // Fill the broad hollow around the lift so traverses toward the neighboring
  // ridges need less climbing. Feather both shoulders and the summit/base ends
  // before adding lips, keeping their shapes on the raised snow surface.
  const liftFill = smooth((r-240)/410) * (1-smooth((q-.55)/.45));
  h += 130 * liftShoulder * liftFill;
  let smallDetail = 0;
  for (const f of nearby(x,s)) {
    const {u,v} = original ? featureCoordinates(f,x,s) : lipCoordinates(f,x,s);
    if(u < -f.length || u > f.catchLength+f.recovery || Math.abs(v) > f.width*1.8) continue;
    const shoulder = smooth((f.width-Math.abs(v))/(f.width*.42));
    let offset;
    if (original) {
      // The original straight, creased lips: see placementTerrain above.
      const t = clamp((u+f.length)/f.length);
      offset = u <= 0 ? f.height*t*t*shoulder : f.height*(1-smooth(u/10))*shoulder;
    } else {
      // The ramp (continued past the crest) and the lip top meet in a crease
      // that the two-metre triangles would chew into teeth. A smooth minimum
      // rounds it over a few metres. Raising the profile by what the rounding
      // removes keeps every crest at its authored height.
      const radius = clamp(f.length*.25, 3, 5), rounding = f.height*2/f.length*radius;
      // Rounding also softens the takeoff slope; steepen the ramp to match.
      const lift = (f.height + rounding/4)*(1 + .3*radius/f.length), t = Math.max(0,(u+f.length)/f.length);
      offset = smoothMin(lift*t*t, lift*(1-smooth(u/14)), rounding)*shoulder;
    }
    if(u > 0) {
      const basinWidth = f.width * (1 + .65 * smooth(u/150));
      const basin = smooth((basinWidth-Math.abs(v))/(basinWidth*.4));
      // These catches lie under the lift. Fill most of their deep bowls as well
      // as the broad fold; otherwise their side walls still block traverses.
      const liftCatch = f.name === 'HANG TIME' || f.name === 'GLACIER DRIFT';
      const drop = f.drop * (liftCatch ? .25 : 1);
      const onset = original ? smooth(u/14) : smooth((u-1)/18);
      offset -= drop*onset*(1-smooth((u-f.catchLength)/f.recovery))*basin;
    }
    if (f.small || f.snowfield) smallDetail += offset;
    else h += offset;
  }
  // Deep overlapping catches must drain onto the apron, never dip below it
  // and then climb back to base elevation. This gently sloped floor also
  // leaves a gravity-driven exit when arriving at the bottom without speed.
  h = Math.max(h, BASE_HEIGHT + (1-q)*180);
  h += smallDetail;
  // The runout becomes one continuous low apron around the entire mountain.
  const slopeHeight=h*(1-smooth((q-.92)/.18)) + (BASE_HEIGHT-18)*smooth((q-.92)/.18);
  // A 3.5 m circular pad leaves just enough room to turn the 2.8 m skis.
  const summitBlend=smooth((r-1.75)/4.25);
  return SUMMIT_HEIGHT*(1-summitBlend)+slopeHeight*summitBlend;
}
const summitTerminalHeight=naturalTerrainHeight(lift.top.x,lift.top.s);
// Timber rests on ledges shaped by the original lips. Within a few metres of
// each log the reshaped lips blend back to that shape, so no trunk is buried.
const logShieldBins = new Map();
function logShield(x,s) {
  let weight=0;
  for(const log of logShieldBins.get(`${Math.floor(x/64)},${Math.floor(s/64)}`) || []) {
    const ox=x-log.x,os=s-log.s,u=ox*log.dx+os*log.ds,v=ox*log.ds-os*log.dx;
    weight=Math.max(weight,(1-smooth((Math.abs(v)-5)/8))*smooth((u+22)/10)*(1-smooth((u-log.length-6)/10)));
  }
  return weight;
}
function terrainHeight(x,s) {
  let native=naturalTerrainHeight(x,s);
  if(!placementTerrain) {
    const shield=logShield(x,s);
    if(shield>0)native+=(naturalTerrainHeight(x,s,true)-native)*shield;
  }
  const ox=x-lift.top.x,os=s-lift.top.s;
  const along=ox*lift.dx+os*lift.ds,across=ox*lift.ds-os*lift.dx;
  // The unloading deck is part of the terrain, so skis, landings and the
  // camera all use its top. Leave a snow margin around its rotated footprint
  // for the two-metre triangles, then blend into the downhill approach/exit.
  const edge=Math.max(Math.abs(along)-9,Math.abs(across)-9);
  const weight=1-smooth(edge/6);
  return native*(1-weight)+summitTerminalHeight*weight;
}
export const PARK_LINE = createParkLine(terrainHeight, FEATURES.length);
FEATURES.push(...PARK_LINE.takeoffs);
// Physics and nearby render tiles share two-metre triangles, refined to 25 cm
// around the tiny summit. A coarser render mesh here would bury the skier.
export const SURFACE_GRID = 2;
export const SUMMIT_SURFACE_GRID = .25;
export const SUMMIT_DETAIL_EXTENT = 8;
const heightCache = new Map();
const logRidgeBins = new Map();
// Broad shoulders and tapered ends make the timber supports part of the same
// two-metre snow surface used by rendering, skis, tracks and the camera.
function ridgeHeight(x,s,base) {
  let height=base;
  for(const log of logRidgeBins.get(`${Math.floor(x/64)},${Math.floor(s/64)}`) || []) {
    const ox=x-log.x,os=s-log.s,u=ox*log.dx+os*log.ds,v=ox*log.ds-os*log.dx;
    // Leave a little grid-sampling margin under sideways ski tips as trunks
    // settle onto the reshaped ridges; keep the same seven-metre outer blend.
    const across=1-smooth((Math.abs(v)-2.2)/4.8);
    const along=smooth((u+16)/16)*(1-smooth((u-log.length)/12));
    const exposed=.08+.52*smooth(u/9);
    const top=log.y+log.grade*u-exposed;
    height=Math.max(height,base+Math.max(0,top-base)*across*along);
  }
  return height;
}
function vertexHeight(ix, iz) {
  const key = (ix*8 + 65536) * 131072 + iz*8 + 65536;
  let value = heightCache.get(key);
  if (value === undefined) {
    const x=ix*SURFACE_GRID,s=iz*SURFACE_GRID;
    // Match the coarse boundary exactly where the little summit patch joins it.
    if(Math.abs(x)===SUMMIT_DETAIL_EXTENT && !Number.isInteger(iz)) {
      const lower=Math.floor(iz),t=iz-lower;
      return vertexHeight(ix,lower)*(1-t)+vertexHeight(ix,lower+1)*t;
    }
    if(Math.abs(s)===SUMMIT_DETAIL_EXTENT && !Number.isInteger(ix)) {
      const lower=Math.floor(ix),t=ix-lower;
      return vertexHeight(lower,iz)*(1-t)+vertexHeight(lower+1,iz)*t;
    }
    const native = ridgeHeight(x,s,terrainHeight(x,s)), weight = parkWeight(x,s);
    value = weight === 0 ? native : native * (1 - weight) + PARK_LINE.surface(x,s) * weight;
    if (heightCache.size > 900000) heightCache.clear();
    heightCache.set(key, value);
  }
  return value;
}
export function groundHeight(x, s) {
  const grid=Math.max(Math.abs(x),Math.abs(s))<SUMMIT_DETAIL_EXTENT ? SUMMIT_SURFACE_GRID : SURFACE_GRID;
  const gx=x/grid,gz=s/grid,step=grid/SURFACE_GRID;
  const ix=Math.floor(gx)*step,iz=Math.floor(gz)*step;
  const u=gx-Math.floor(gx),v=gz-Math.floor(gz);
  const b=vertexHeight(ix+step,iz),c=vertexHeight(ix,iz+step);
  if(u+v<=1) return vertexHeight(ix,iz)*(1-u-v)+b*u+c*v;
  return vertexHeight(ix+step,iz+step)*(u+v-1)+b*(1-v)+c*(1-u);
}
export const sceneryHeight = groundHeight;
export const baseHeight = s => groundHeight(0,s);
export function gradientAt(x,s,epsilon=1) {
  return { x:(groundHeight(x+epsilon,s)-groundHeight(x-epsilon,s))/(epsilon*2),
    s:(groundHeight(x,s+epsilon)-groundHeight(x,s-epsilon))/(epsilon*2) };
}
export function rampAt(x,s) {
  if (parkWeight(x,s) > .5) {
    return PARK_LINE.takeoffs.find(f => x >= f.x - f.length && x <= f.x + 12 && Math.abs(s) < f.width * .9);
  }
  const candidates=nearby(x,s);
  const onRamp=f=>{ const {u,v}=lipCoordinates(f,x,s); return u >= -f.length && u <= 12 && Math.abs(v) < f.width*.9; };
  return candidates.find(f=>f.lift && onRamp(f)) || candidates.find(onRamp);
}
export function atBase(x,s,y) { return mountainFraction(x,s) >= .97 && y < BASE_HEIGHT+95; }
export function getSpawn() { return { x:0, s:0, heading:0 }; }

// Deterministic lower-mountain tree islands. Clear approaches and catch bowls
// remain open; each rendered trunk has a matching small collision circle.
let treeSeed=271828;
const rand=()=>{treeSeed=(treeSeed*1664525+1013904223)>>>0;return treeSeed/4294967296;};
export const TREES=[];
export const TREE_LINE = BASE_HEIGHT + (SUMMIT_HEIGHT - BASE_HEIGHT) * .5;
// Small rollers cover nearly the entire mountain. Only authored jump corridors
// reserve tree-free space; using every roller here used to reject every tree.
for(let i=0;i<12000 && TREES.length<150;i++) {
  const island=Math.floor(rand()*24),a=island/24*Math.PI*2+(rand()-.5)*.12;
  const r=radiusAt(a)*(.53+(island%4)*.085+(rand()-.5)*.1);
  const x=Math.sin(a)*r,s=Math.cos(a)*r,y=groundHeight(x,s);
  if (parkReserved(x,s)) continue;
  const g=gradientAt(x,s);
  if(y>TREE_LINE-12 || y<120 || Math.hypot(g.x,g.s)>1.05)continue;
  if(nearby(x,s).some(f=>{if(f.small || f.snowfield)return false;const {u,v}=featureCoordinates(f,x,s);return u > -f.length-25 && u < f.catchLength+75 && Math.abs(v)<f.width+18;}))continue;
  if(TREES.some(t=>Math.hypot(t.x-x,t.s-s)<17))continue;
  const scale=.7+rand()*.75;
  TREES.push({x,s,y,scale,radius:.55*scale});
}
export function treeCollision(x,s) {
  return TREES.find(t=>Math.abs(x-t.x)<t.radius+.4 && Math.abs(s-t.s)<t.radius+.4 && Math.hypot(x-t.x,s-t.s)<t.radius+.4);
}

// Place against unmodified terrain, then install the low snow supports once.
// Keeping this initialization here gives every terrain consumer the same map.
export const LOGS=createLogLayout({groundHeight,gradientAt,FEATURES,TREES,radiusAt,lift,reserved:parkReserved});
for(const log of LOGS.filter(log=>log.kind==='fallen')) {
  const x1=log.x-log.dx*16,s1=log.s-log.ds*16;
  const x2=log.x+log.dx*(log.length+12),s2=log.s+log.ds*(log.length+12);
  for(let ix=Math.floor((Math.min(x1,x2)-7)/64);ix<=Math.floor((Math.max(x1,x2)+7)/64);ix++)
    for(let iz=Math.floor((Math.min(s1,s2)-7)/64);iz<=Math.floor((Math.max(s1,s2)+7)/64);iz++) {
      const key=`${ix},${iz}`;
      if(!logRidgeBins.has(key))logRidgeBins.set(key,[]);
      logRidgeBins.get(key).push(log);
    }
}
for(const log of LOGS) {
  const reach=log.length+30,x1=log.x-log.dx*32,s1=log.s-log.ds*32,x2=log.x+log.dx*reach,s2=log.s+log.ds*reach;
  for(let ix=Math.floor((Math.min(x1,x2)-14)/64);ix<=Math.floor((Math.max(x1,x2)+14)/64);ix++)
    for(let iz=Math.floor((Math.min(s1,s2)-14)/64);iz<=Math.floor((Math.max(s1,s2)+14)/64);iz++) {
      const key=`${ix},${iz}`;
      if(!logShieldBins.has(key))logShieldBins.set(key,[]);
      logShieldBins.get(key).push(log);
    }
}
// Placement is done: from here on, terrain uses the rounded, curved lips.
placementTerrain = false;
heightCache.clear();
// Trees stand on the snow as it is now rendered and ridden.
for (const tree of TREES) tree.y = groundHeight(tree.x, tree.s);

