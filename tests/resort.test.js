import test from 'node:test';
import assert from 'node:assert/strict';
import { groundHeight, mountainFraction, TREES } from '../src/blackridge.js';
import { liftRoute } from '../src/lift-route.js';
import * as THREE from 'three';

// Catch misplaced scenery blocking the lift or floating above the lower slopes.
test('base villages fit the terrain and leave the lift arrival clear', async () => {
  const { RESORT } = await import('../src/resort-layout.js');
  assert.ok(RESORT.towns.length >= 3);
  const lift = liftRoute(true, 2100);
  for (const town of RESORT.towns) {
    assert.ok(town.buildings.some(b => b.kind === 'cabin'));
    assert.ok(town.buildings.some(b => b.kind === 'residence'));
    for (const b of town.buildings) {
      assert.ok(mountainFraction(b.x, b.s) > .97, 'buildings stay below the ski faces');
      assert.ok(Math.max(Math.abs(b.x), Math.abs(b.s)) < 2520, 'inside rendered terrain');
      assert.ok(Math.hypot(b.x-lift.bottom.x,b.s-lift.bottom.s) > b.radius+35, 'open lift plaza');
      const along=(b.x-lift.top.x)*lift.dx+(b.s-lift.top.s)*lift.ds;
      const across=Math.abs((b.x-lift.top.x)*lift.ds-(b.s-lift.top.s)*lift.dx);
      assert.ok(along>lift.length+35 || across>b.radius+16,'lift cables have a clear approach');
      for(const road of RESORT.roads)assert.ok(road.points.every(p=>
        Math.hypot(p.x-b.x,p.s-b.s)>b.radius+road.width/2+2),'roads stay clear of buildings');
      assert.ok(TREES.every(t => Math.hypot(t.x-b.x,t.s-b.s)>b.radius+t.radius), 'no trees inside buildings');
      for (const p of b.footprint) {
        const y = groundHeight(p.x,p.s);
        assert.ok(b.floor >= y, 'level foundation covers highest corner');
        assert.ok(b.foundationBottom <= y, 'foundation reaches the snow');
        assert.ok(b.floor-y < 13, 'no excessively tall foundation walls');
      }
    }
    for (const [i,b] of town.buildings.entries()) for (const other of town.buildings.slice(i+1))
      assert.ok(Math.hypot(b.x-other.x,b.s-other.s)>b.radius+other.radius+3,'buildings do not overlap');
  }
});

test('rendered roofs cover their authored footprints on every mountain face', async () => {
  const { RESORT } = await import('../src/resort-layout.js');
  const { createResortWorld, roadGeometry } = await import('../src/resort-world.js');
  const scene=new THREE.Scene(),root=createResortWorld(scene);
  scene.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(const town of RESORT.towns)for(const b of town.buildings) {
    ray.set(new THREE.Vector3(b.x,b.floor+100,-b.s),new THREE.Vector3(0,-1,0));
    const hit=ray.intersectObject(root).at(0);
    assert.ok(hit,`${town.name}: building is present at its map position`);
    assert.ok(hit.point.y>b.floor+b.floors*3.25-2,`${town.name}: upright roof above the foundation`);
  }
  for(const road of RESORT.roads) {
    const geometry=roadGeometry(road),p=geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const clearance=p.getY(i)-groundHeight(p.getX(i),-p.getZ(i));
      assert.ok(clearance>.10 && clearance<.14,'road follows ground without floating or sinking');
    }
    geometry.dispose();
  }
  root.traverse(o=>o.geometry?.dispose());
});

test('roads stay on the snow and form a connected base network', async () => {
  const { RESORT } = await import('../src/resort-layout.js');
  const ring = RESORT.roads[0];
  assert.deepEqual(ring.points[0],ring.points.at(-1));
  for (const road of RESORT.roads) {
    assert.ok(road.points.length>2);
    for (const p of road.points) {
      assert.ok(Number.isFinite(p.x+p.s));
      assert.ok(mountainFraction(p.x,p.s)>.97);
      assert.ok(Math.max(Math.abs(p.x),Math.abs(p.s))<2540);
    }
  }
  for (const town of RESORT.towns) {
    const street=RESORT.roads.find(r=>r.town===town.name);
    assert.ok(street,'each village has an access street');
    assert.ok(ring.points.some(p=>Math.hypot(p.x-street.points.at(-1).x,p.s-street.points.at(-1).s)<.01),'street joins the road');
  }
});
