import test from 'node:test';
import assert from 'node:assert/strict';
import { FEATURES, KICKERS, SMALL_LIPS, featureCoordinates } from '../src/blackridge.js';

test('the smallest discrete kickers have larger takeoffs',()=>{
  const sides=KICKERS.filter(f=>f.name.startsWith('SIDE KICKER'));
  assert.ok(sides.length>0);
  for(const f of sides) {
    assert.ok(f.height>=6.875,`${f.name}: height ${f.height}`);
    assert.ok(f.length>=23.75 && f.width>=25,`${f.name}: approach was not enlarged`);
  }
  for(const f of SMALL_LIPS)assert.ok(f.height>=7,`${f.name}: still a tiny wind lip`);
});

test('enlarged kicker footprints leave 80 metres before larger natural takeoffs',()=>{
  for(const k of FEATURES.filter(f=>f.enlarged))for(const f of FEATURES.filter(f=>!f.enlarged && !f.parkLine)) {
    if(f.height<=k.height && f.drop<=k.height)continue;
    const end=k.drop>0 ? k.catchLength+k.recovery : 10;
    const width=k.width*(k.drop>0 ? 1.65 : 1);
    // Sample the complete approach and tail, including both outside edges.
    for(let i=0;i<=8;i++)for(let j=0;j<=8;j++) {
      const along=-k.length+(k.length+end)*i/8,across=width*(j/4-1);
      const x=k.x+k.dx*along+k.ds*across,s=k.s+k.ds*along-k.dx*across;
      const {u,v}=featureCoordinates(f,x,s);
      if(u>0)continue;
      const distance=Math.hypot(-u,Math.max(0,Math.abs(v)-f.width));
      assert.ok(distance>=80-1e-6,`${k.name} footprint is ${distance.toFixed(1)}m before ${f.name}`);
    }
  }
});
