import { KICKERS, PARK_LINE, lipCoordinates } from './blackridge.js';
import { parkWeight } from './park-line.js';

const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const cells=new Map(),cellSize=64;
for(const f of KICKERS) {
  const radius=f.length+f.width+20;
  for(let x=Math.floor((f.x-radius)/cellSize);x<=Math.floor((f.x+radius)/cellSize);x++)
    for(let s=Math.floor((f.s-radius)/cellSize);s<=Math.floor((f.s+radius)/cellSize);s++) {
      const key=`${x},${s}`;
      if(!cells.has(key))cells.set(key,[]);
      cells.get(key).push(f);
    }
}

// Broad, softly blended snow occlusion survives distant terrain LODs. Keep
// the lip bright and the shoulders/back face cool so the takeoff reads ahead.
export function kickerShadingAt(x,s) {
  let shade=0,crest=0;
  const features=parkWeight(x,s)>.5 ? PARK_LINE.jumps : cells.get(`${Math.floor(x/cellSize)},${Math.floor(s/cellSize)}`) || [];
  for(const f of features) {
    const {u,v}=lipCoordinates(f,x,s),across=Math.abs(v)/f.width;
    if(u<-f.length || u>20 || across>1.15)continue;
    const approach=smooth(-f.length,-3,u),end=1-smooth(10,20,u);
    const shoulder=smooth(.45,.85,across)*(1-smooth(.85,1.15,across));
    const back=smooth(0,5,u)*(1-smooth(9,20,u))*(1-smooth(.55,1,across));
    shade=Math.max(shade,.16*shoulder*approach*end+.24*back);
    crest=Math.max(crest,(1-smooth(0,5,Math.abs(u+1)))*(1-smooth(.5,.95,across))*.055);
  }
  return {shade,crest};
}
