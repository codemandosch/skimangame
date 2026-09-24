// One groomed east-face strip, integrated into Blackridge's terrain surface.
const clamp = t => Math.max(0, Math.min(1, t));
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
export const PARK_START = 180;
export const PARK_END = 2140;
export const PARK_WIDTH = 160;
export function parkWeight(x, s) {
  // Groom the summit approach before the East Wind cornice at x=220.
  // Finishing the blend at the entrance removes both its drop and takeoff
  // trigger, while the broad shoulders merge into the neighboring snow.
  return smooth((x - 60) / (PARK_START - 60)) * (1 - smooth((x - 1960) / (PARK_END - 1960)))
    * (1 - smooth((Math.abs(s) - PARK_WIDTH / 2) / 65));
}
export function parkReserved(x, s) {
  return x > PARK_START - 30 && x < PARK_END + 30 && Math.abs(s) < PARK_WIDTH / 2 + 70;
}
export function createParkLine(nativeHeight, firstIndex) {
  // Fit the local mountain's average fall line; discard its bumps and gullies.
  const average = x => [-80, -40, 0, 40, 80].reduce((h, s) => h + nativeHeight(x, s), 0) / 5;
  const top = average(240), bottom = average(1940), grade = (top - bottom) / 1700;
  const heightAt = x => top - grade * (x - 240);
  // Four airs climb in size down the strip, separated by short runouts. Landings
  // sit close enough that the eased top speed still reaches each deck.
  const jumps = [
    { name: 'EAST FACE AIR', x: 330, height: 32, length: 77, width: 24, gap: 95, landingHeight: 24, landingLength: 96, landingWidth: 70 },
    { name: 'LONG SHOT', x: 708, height: 40, length: 99, width: 28, gap: 92.65, landingHeight: 28, landingLength: 102, landingWidth: 72 },
    { name: 'BIG SKY', x: 1100, height: 44, length: 110, width: 30, gap: 86, landingHeight: 30, landingLength: 105, landingWidth: 73 },
    { name: 'HOME STRETCH', x: 1500, height: 48, length: 121, width: 32, gap: 79.3, landingHeight: 32, landingLength: 108, landingWidth: 74 },
  ].map((j, i) => ({ ...j, s: 0, dx: 1, ds: 0, angle: Math.PI / 2, index: firstIndex + i,
    kick: 12, drop: 0, catchLength: j.gap + j.landingLength, recovery: 0, parkLine: true, major: false }));
  // A low circular transition saves approach speed for the air while retaining
  // the roughly 65-degree forward lip and straight horizontal takeoff edge.
  const lipAngle=72*Math.PI/180, curveLength=18, radius=curveLength/Math.sin(lipAngle);
  const curvedHeight=radius*(1-Math.cos(lipAngle));
  const quarterpipe={name:'EAST FACE SPINE',kind:'quarterpipe',
    x:1840,s:0,dx:1,ds:0,angle:Math.PI/2,index:firstIndex+jumps.length,
    length:22,width:28,deckWidth:70,height:curvedHeight+4*Math.tan(lipAngle),
    lipSlope:Math.tan(lipAngle)-grade,takeoffWidth:16,crestWidth:4,deckLength:112,backLength:120,
    kick:0,drop:0,catchLength:232,recovery:0,parkLine:true,major:false};
  const takeoffs=[...jumps,quarterpipe];
  function surface(x, s) {
    let height = heightAt(x);
    for (const j of jumps) {
      const u = x - j.x;
      let rise = 0, width = j.width;
      if (u >= -j.length && u <= 0) rise = j.height * ((u + j.length) / j.length) ** 3.5;
      else if (u > 0 && u < 14) rise = j.height * (1 - smooth(u / 14));
      else if (u >= j.gap - 12 && u < j.gap) {
        rise = j.landingHeight * smooth((u - j.gap + 12) / 12); width = j.landingWidth;
      } else if (u >= j.gap && u <= j.gap + j.landingLength) {
        const along=u-j.gap,plateau=j.landingLength*.35;
        // A constant rise lets the deck follow the groomed mountain pitch.
        rise = along<=plateau ? j.landingHeight
          : j.landingHeight*(1-(along-plateau)/(j.landingLength-plateau))**2;
        width = j.landingWidth;
      }
      height += rise * (1 - smooth((Math.abs(s) - width + 6) / 6));
    }
    const q=quarterpipe,u=x-(q.x-q.length);
    let wall=0;
    if(u>=0 && u<=curveLength) wall=radius-Math.sqrt(Math.max(0,radius*radius-u*u));
    else if(u>curveLength && u<=q.length) wall=curvedHeight+(u-curveLength)*Math.tan(lipAngle);
    // A narrow level spine runs downhill between the left and right landings.
    else if(u>q.length && u<=q.length+q.deckLength) wall=q.height+grade*(u-q.length);
    else if(u>q.length+q.deckLength && u<q.length+q.deckLength+q.backLength)
      wall=(q.height+grade*q.deckLength)*(1-(u-q.length-q.deckLength)/q.backLength)**2;
    // A horizontal lip, not a pointed apex; narrow into the spine after takeoff.
    const halfTop=q.crestWidth/2+(q.takeoffWidth-q.crestWidth)/2*(1-smooth((u-q.length)/8));
    // The takeoff wall stays narrow; the spine's landing shoulders flare out past the lip.
    const base=q.width+(q.deckWidth-q.width)*smooth((u-q.length)/12);
    const across=1-clamp((Math.abs(s)-halfTop)/(base-halfTop));
    height+=wall*across;
    return height;
  }
  return { name: 'EAST FACE PARK LINE', width: PARK_WIDTH, start: 180, end: 1960,
    grade, heightAt, surface, jumps, quarterpipe, takeoffs };
}
