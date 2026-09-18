import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, groundHeight, mountainFraction } from '../src/blackridge.js';
import { selectCourse } from '../src/course.js';
import { createState, step } from '../src/physics.js';

test('stopped skiers can leave Thunder Basin and every major catch bowl', () => {
  selectCourse('blackridge');
  try {
    const starts=FEATURES.filter(f=>f.major).map(f=>({
      name:f.name,x:f.x+f.dx*(f.catchLength+80),s:f.s+f.ds*(f.catchLength+80),heading:-f.angle,
    }));
    // Approximate world positions from the supplied southwest minimap marker.
    for (const [x,s] of [[-680,-725],[-660,-710],[-745,-610]]) starts.push({name:'reported Thunder Basin pocket',x,s,heading:-240*Math.PI/180});
    for (const start of starts) {
      const s=createState();Object.assign(s,start,{started:true,speed:0});s.y=groundHeight(s.x,s.s);
      for (let i=0;i<120*120&&!s.finished;i++) step(s,{skate:true},1/120);
      assert.equal(s.finished,true,`${start.name} trapped at ${s.x}, ${s.s}`);
    }
  } finally { selectCourse('bluebird'); }
});

test('sampled snowfields have a route to the runout with no steep uphill barrier', () => {
  // Reverse flood from the runout. An edge may climb at most 25%, a grade
  // the low-speed skating force can overcome. Downhill travel is unrestricted.
  // This checks routes, not just whether one radial line can retain momentum.
  const spacing=8,n=601,extent=(n-1)*spacing/2;
  const heights=new Float64Array(n*n),seen=new Uint8Array(n*n),queue=[];
  for(let row=0;row<n;row++)for(let col=0;col<n;col++) {
    const i=row*n+col,x=col*spacing-extent,s=row*spacing-extent;
    heights[i]=groundHeight(x,s);
    if(mountainFraction(x,s)>=.96){seen[i]=1;queue.push(i);}
  }
  for(let head=0;head<queue.length;head++) {
    const i=queue[head],row=Math.floor(i/n),col=i%n;
    for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++) {
      if((!dr&&!dc)||row+dr<0||row+dr>=n||col+dc<0||col+dc>=n)continue;
      const j=i+dr*n+dc;
      if(!seen[j]&&heights[i]-heights[j]<=.25*spacing*Math.hypot(dr,dc)) {seen[j]=1;queue.push(j);}
    }
  }
  const trapped=seen.findIndex(value=>!value);
  assert.equal(trapped,-1,`no exit near ${trapped%n*spacing-extent}, ${Math.floor(trapped/n)*spacing-extent}`);
});
