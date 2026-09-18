// Shared horizontal route, independent of terrain and cable support heights.
export function liftRoute(openWorld, length) {
  // Follow the Hanging Glacier fall line instead of traversing the Wall's
  // steep ridge flank. Keep the snow approaches on this same shared route.
  const angle=54*Math.PI/180,dx=Math.sin(angle),ds=Math.cos(angle);
  // Leave the summit-to-park traverse outside the terminal's flat snow pad.
  const top=openWorld ? {x:dx*48,s:ds*48} : {x:-17,s:0};
  const bottom=openWorld ? {x:dx*length*1.08,s:ds*length*1.08} : {x:-17,s:length+8};
  const distance=Math.hypot(bottom.x-top.x,bottom.s-top.s);
  return {top,bottom,length:distance,dx:(bottom.x-top.x)/distance,ds:(bottom.s-top.s)/distance};
}
