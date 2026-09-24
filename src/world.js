import * as THREE from "three";
import { createMountainWorld } from './mountain-world.js';
import { createSkiLift } from './lift-world.js';
import { createSnowMaterial } from './snow-surface.js';
import { createAlpineSky, SUN_DIRECTION, SUN_COLOR, SUN_INTENSITY } from './alpine-sky.js';
import { createHaze } from './atmosphere.js';
import { createLandscape } from './landscape.js';
import { createAmbientParticles } from './ambient-particles.js';
import { createCloudBanks, placeCloudBanks, createPlumes, findPeaks, WIND } from './clouds.js';
import { landscapeHeight } from './landscape.js';
import { chimneyTops } from './resort-world.js';
import { LANDSCAPE, VALLEY_FLOOR } from './landscape-layout.js';
import { COURSE, groundHeight } from "./course.js";

function randomGenerator(seed = 7331) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function loadDataTexture(url, onLoad) {
  // Baked lighting data is linear, stored south-to-north by texture row.
  return new THREE.TextureLoader().load(url, texture => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.flipY = false;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    onLoad?.(texture);
  }, undefined, error => console.warn(`Baked terrain lighting unavailable: ${url}`, error));
}

function summitParkSign(scene) {
  const x=-3.8,s=2.5,base=groundHeight(x,s),height=groundHeight(0,0)+2.2-base;
  const sign=new THREE.Group();
  sign.name='Summit sign / East Face Park Line';
  sign.position.set(x,base,-s);
  // Local +X is the arrow tip; aim at the actual park drop-in in world space.
  sign.rotation.y=Math.atan2(-s,COURSE.PARK_LINE.start-x);
  scene.add(sign);
  const grain=document.createElement('canvas');grain.width=1024;grain.height=256;
  const ctx=grain.getContext('2d'),woodRandom=randomGenerator(4207);
  ctx.fillStyle='#80603d';ctx.fillRect(0,0,grain.width,grain.height);
  for(let i=0;i<180;i++) {
    const y=woodRandom()*256,amplitude=1+woodRandom()*5,phase=woodRandom()*6.28;
    ctx.strokeStyle=i%3===0?'#d6af7955':'#38211144';ctx.lineWidth=.5+woodRandom()*2;
    ctx.beginPath();
    for(let x=0;x<=1024;x+=8) {
      const yy=y+Math.sin(x*.014+phase)*amplitude;
      if(x===0)ctx.moveTo(x,yy);else ctx.lineTo(x,yy);
    }
    ctx.stroke();
  }
  for(const [x,y] of [[180,175],[760,65]])for(let r=4;r<28;r+=4) {
    ctx.strokeStyle='#3f291966';ctx.lineWidth=1.4;ctx.beginPath();
    ctx.ellipse(x,y,r*2.7,r,0,0,Math.PI*2);ctx.stroke();
  }
  const woodTexture=new THREE.CanvasTexture(grain);woodTexture.colorSpace=THREE.SRGBColorSpace;
  woodTexture.anisotropy=4;
  const postTexture=woodTexture.clone();postTexture.center.set(.5,.5);postTexture.rotation=Math.PI/2;
  const wood=new THREE.MeshStandardMaterial({map:postTexture,roughness:.96});
  const post=new THREE.Mesh(new THREE.BoxGeometry(.18,height+.4,.22),wood);
  post.position.y=height/2-.2;post.castShadow=true;sign.add(post);
  const plank=new THREE.Group();plank.position.y=height;plank.scale.setScalar(.6);sign.add(plank);
  const shape=new THREE.Shape();
  shape.moveTo(-2.7,-.6);shape.lineTo(1.8,-.6);shape.lineTo(2.8,0);
  shape.lineTo(1.8,.6);shape.lineTo(-2.7,.6);shape.closePath();
  woodTexture.repeat.set(1/5.5,1/1.2);woodTexture.offset.set(2.7/5.5,.5);
  const board=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:false}),
    new THREE.MeshStandardMaterial({map:woodTexture,roughness:.96}));
  board.castShadow=true;plank.add(board);
  const paint=document.createElement('canvas');paint.width=1024;paint.height=256;
  const lettering=paint.getContext('2d');
  lettering.fillStyle='#fff9ed';lettering.font='bold 88px Arial';
  lettering.textAlign='center';lettering.textBaseline='middle';
  lettering.fillText('East Face Park Line',512,128,970);
  // Tiny worn patches let the grain show through the painted lettering.
  lettering.globalCompositeOperation='destination-out';
  for(let i=0;i<650;i++)lettering.fillRect(woodRandom()*1024,woodRandom()*256,1+woodRandom()*3,1+woodRandom()*2);
  const paintTexture=new THREE.CanvasTexture(paint);paintTexture.colorSpace=THREE.SRGBColorSpace;paintTexture.anisotropy=4;
  const label=new THREE.MeshStandardMaterial({map:paintTexture,transparent:true,depthWrite:false,roughness:.9});
  for(const side of [-1,1]) {
    // Separate front/back faces keep the lettering readable from either side.
    const face=new THREE.Mesh(new THREE.PlaneGeometry(4.3,1.05),label);
    face.position.set(-.45,0,side>0?.19:-.01);
    face.rotation.y=side>0?0:Math.PI;plank.add(face);
  }
}

export function createWorld(scene) {
  scene.fog = createHaze();
  const sky = createAlpineSky(scene);
  // Sky lighting comes from the pre-filtered environment (render-pipeline).
  // The long shadow frustum follows the rider but reaches kilometres toward
  // the sun, so distant ridges still shade the snow around the skier.
  const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
  sun.name = 'Sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowRadius = 70;
  Object.assign(sun.shadow.camera, { left: -shadowRadius, right: shadowRadius, top: shadowRadius, bottom: -shadowRadius, near: 10, far: 4200 });
  sun.shadow.bias = -0.00003;
  sun.shadow.normalBias = 0.4;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);
  const snow = createSnowMaterial();
  const lighting = typeof document === 'undefined' ? Promise.resolve() : new Promise(resolve => {
    loadDataTexture('/terrain/blackridge-light.png', texture => { snow.userData.uniforms.snowLightMap.value = texture; resolve(); });
    setTimeout(resolve, 8000);
  });
  const mountain = createMountainWorld(scene, snow);
  const landscape = createLandscape(scene);
  summitParkSign(scene);
  const skiLift = createSkiLift(scene);
  const particles = createAmbientParticles(scene);
  // Faint spindrift streams off the summit; banner clouds and the cloud sea
  // arrive with the landscape data.
  const summit = groundHeight(0, 0);
  const plumeSets = [createPlumes(scene, [
    { x: 0, y: summit - 10, z: 0, length: 360, size: 30, puffs: 30, opacity: .1, rise: 24 },
    // Wood smoke drifting from the village cabins.
    ...chimneyTops().map(c => ({ ...c, length: 46, size: 3.2, puffs: 7, opacity: .32, rise: 26 })),
  ])];
  let cloudSea = null;
  landscape.ready.then(result => {
    if (!result) return;
    cloudSea = createCloudBanks(scene, placeCloudBanks(result.data, (x, s) => landscapeHeight(result.data, x, s)));
    plumeSets.push(createPlumes(scene, findPeaks(result.data).map(p =>
      ({ x: p.x + WIND.x * 250, y: p.h - 300, z: -p.s + WIND.y * 250, length: 1500, size: 520, puffs: 44, opacity: .55, rise: -60 }))));
  });
  const focus = new THREE.Vector3(), ahead = new THREE.Vector3(), sunPoint = new THREE.Vector3();
  // Axes of the shadow camera's image plane (perpendicular to the sun).
  const lightRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIRECTION).normalize();
  const lightUp = new THREE.Vector3().crossVectors(SUN_DIRECTION, lightRight).normalize();
  let landscapeData = null;
  landscape.ready.then(result => { landscapeData = result?.data ?? null; });
  const terrainAt = (x, s) => x * x + s * s < LANDSCAPE.innerRadius ** 2 ? groundHeight(x, s)
    : landscapeData ? landscapeHeight(landscapeData, x, s) : VALLEY_FLOOR;
  // How much of the sun disc clears the terrain, marching toward it.
  function sunVisibility(eye) {
    let clearance = 1;
    for (let t = 20; t < 14000; t *= 1.25) {
      const x = eye.x + SUN_DIRECTION.x * t, s = -(eye.z + SUN_DIRECTION.z * t);
      clearance = Math.min(clearance, (eye.y + SUN_DIRECTION.y * t - terrainAt(x, s)) / t);
      if (clearance < -.02) return 0;
    }
    return THREE.MathUtils.smoothstep(clearance, -.004, .012);
  }
  return {
    sun,
    snow,
    landscape,
    // Resolves once the baked lighting, ranges, forests and clouds exist.
    ready: Promise.all([lighting, landscape.ready]),
    // Sun position on screen (uv) and its visibility, for the lens flare.
    sunFlare(camera) {
      sunPoint.copy(camera.position).addScaledVector(SUN_DIRECTION, 1000).project(camera);
      const facing = camera.getWorldDirection(ahead).dot(SUN_DIRECTION);
      const onScreen = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(sunPoint.x), Math.abs(sunPoint.y)), .95, 1.25);
      const visibility = facing > 0 && sunPoint.z < 1 ? onScreen * sunVisibility(camera.position) : 0;
      return [sunPoint.x * .5 + .5, sunPoint.y * .5 + .5, visibility];
    },
    update(s, camera, dt = 1 / 60) {
      mountain.update(s);
      // Centre the shadow box on the snow a little ahead of the rider, at
      // ground level so a big air does not swing it off the visible slope.
      focus.set(s.x, 0, -s.s);
      if (camera) {
        camera.getWorldDirection(ahead);
        ahead.y = 0;
        if (ahead.lengthSq() > 1e-6) focus.addScaledVector(ahead.normalize(), shadowRadius * .35);
      }
      focus.y = groundHeight(focus.x, -focus.z);
      // Snap across the light's view plane to whole texels, so shadow edges
      // stay put instead of crawling as the box follows the rider.
      const texel = shadowRadius * 2 / sun.shadow.mapSize.x;
      const u = focus.dot(lightRight), v = focus.dot(lightUp);
      focus.addScaledVector(lightRight, Math.round(u / texel) * texel - u)
        .addScaledVector(lightUp, Math.round(v / texel) * texel - v);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(SUN_DIRECTION, 2600);
      sky.update(s, camera);
      landscape.update(s, camera);
      particles.update(s, camera, dt);
      for (const plume of plumeSets) plume.update(dt);
      if (camera) cloudSea?.update(camera, dt);
      skiLift?.update(s.time);
    },
  };
}
