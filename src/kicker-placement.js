export const KICKER_CLEARANCE = 80;

// Project the complete snow footprint, including the tail of wind-lip bowls,
// into the larger feature's frame. Use a conservative bound for rotated hits
// so an outside edge cannot slip into the protected uphill half-radius.
export function blocksNaturalTakeoff(kicker, feature) {
  if(feature.height<=kicker.height && feature.drop<=kicker.height)return false;
  const tail=kicker.drop>0 ? kicker.catchLength+kicker.recovery : 10;
  const width=kicker.width*(kicker.drop>0 ? 1.65 : 1);
  let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
  for(const along of [-kicker.length,tail])for(const across of [-width,width]) {
    const x=kicker.x+kicker.dx*along+kicker.ds*across-feature.x;
    const s=kicker.s+kicker.ds*along-kicker.dx*across-feature.s;
    const u=x*feature.dx+s*feature.ds,v=x*feature.ds-s*feature.dx;
    minU=Math.min(minU,u);maxU=Math.max(maxU,u);
    minV=Math.min(minV,v);maxV=Math.max(maxV,v);
  }
  if(minU>0)return false;
  const uphill=Math.max(0,-maxU);
  const sideways=Math.max(0,minV-feature.width,-feature.width-maxV);
  return Math.hypot(uphill,sideways)<KICKER_CLEARANCE;
}
