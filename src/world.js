import * as THREE from "three";
import { createMountainWorld } from './mountain-world.js';
import { createSkiLift } from './lift-world.js';
import { createSnowMaterial } from './snow-surface.js';
import { createAlpineSky } from './alpine-sky.js';
import { createAlpineTrees } from './alpine-trees.js';
import {
  COURSE,
  JUMPS,
  LENGTH,
  baseHeight,
  groundHeight,
  sceneryHeight,
  centerAt,
} from "./course.js";

function randomGenerator(seed = 7331) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
const random = randomGenerator();
const graniteTexture = new THREE.TextureLoader().load(
  "/textures/alpine-granite.png",
);
graniteTexture.colorSpace = THREE.SRGBColorSpace;
graniteTexture.wrapS = graniteTexture.wrapT = THREE.RepeatWrapping;
graniteTexture.anisotropy = 8;
const mat = (color, other = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...other });
function mesh(geometry, material, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const snowMaterial = () => createSnowMaterial(graniteTexture, COURSE.natural);

function terrain(scene) {
  const xs = [];
  const detailWidth = COURSE.natural ? 90 : 50;
  for (let x = -1000; x < -detailWidth; x += 12) xs.push(x);
  for (let x = -detailWidth; x <= detailWidth; x += 2) xs.push(x);
  for (let x = detailWidth + 12; x <= 1010; x += 12) xs.push(x);
  const samples = [];
  for (let s = -320; s <= LENGTH + 620; s += COURSE.natural ? 4 : 3) samples.push(s);
  for (const j of JUMPS) {
    samples.push(j.lip, j.lip - j.length, j.lip + (COURSE.natural ? 18 : 14));
    if (COURSE.natural) for (let t = -60; t <= 18; t += 2) samples.push(j.lip + t);
  }
  const ss = [...new Set(samples)].sort((a, b) => a - b);
  const positions = [],
    colors = [],
    rockAmounts = [],
    indices = [];
  const snow = new THREE.Color(),
    rock = new THREE.Color("#697f8e");
  for (const s of ss)
    for (const x of xs) {
      const y = sceneryHeight(x, s);
      positions.push(x, y, -s);
      const edge = Math.max(0, Math.abs(x - centerAt(s)) - 70);
      const steep = Math.hypot(
        sceneryHeight(x + 3, s) - sceneryHeight(x - 3, s),
        COURSE.natural ? sceneryHeight(x, s + 3) - sceneryHeight(x, s - 3) : 0,
      ) / 6;
      const vein =
        (Math.sin(x * 0.18 + s * 0.13) + Math.sin(s * 0.047 - x * 0.04)) * 0.5;
      const exposed =
        Math.max(0, Math.min(0.94, (steep - 0.36) * 2.0 + vein * 0.24)) *
        (COURSE.natural ? Math.max(Math.min(1, edge / 35), steep > 1.5 ? 0.9 : 0) : Math.min(1, edge / 90));
      rockAmounts.push(exposed);
      snow.setRGB(0.91, 0.965, 1).lerp(rock, exposed);
      const shade = 1 - Math.max(0, Math.sin(s * 0.02 + x * 0.008)) * 0.045;
      snow.multiplyScalar(shade);
      colors.push(snow.r, snow.g, snow.b);
    }
  const nx = xs.length;
  for (let z = 0; z < ss.length - 1; z++)
    for (let x = 0; x < nx - 1; x++) {
      const a = z * nx + x,
        b = a + 1,
        c = a + nx,
        d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute(
    "rockAmount",
    new THREE.Float32BufferAttribute(rockAmounts, 1),
  );
  g.setIndex(indices);
  g.computeVertexNormals();
  const m = mesh(g, snowMaterial(), scene);
  m.castShadow = false;
}

function trees(scene) {
  const trees = [];
  const treeLine = (baseHeight(0) + baseHeight(LENGTH)) * .5;
  for (let i=0; i<2400 && trees.length<100; i++) {
    const s=LENGTH*(.5+random()*.48), side=random()<.5?-1:1;
    const x=centerAt(s)+side*(45+Math.pow(random(),1.8)*150);
    const y=sceneryHeight(x,s);
    if(y>treeLine-10 || trees.some(t=>Math.hypot(t.x-x,t.s-s)<14)) continue;
    trees.push({x,s,y,scale:.65+random()*.7});
  }
  return createAlpineTrees(scene,trees);
}

function rocks(scene) {
  const material = mat("#b1b5b5", {
    map: graniteTexture,
    bumpMap: graniteTexture,
    bumpScale: 0.2,
    roughness: 0.95,
  });
  const g = new THREE.IcosahedronGeometry(1, 2);
  const r = new THREE.InstancedMesh(g, material, 210),
    caps = new THREE.InstancedMesh(
      g,
      mat("#e7f1f5", { flatShading: true }),
      210,
    );
  const d = new THREE.Object3D();
  for (let i = 0; i < 210; i++) {
    const s = random() * (LENGTH + 270) - 80,
      x = (random() < 0.5 ? -1 : 1) * ((COURSE.natural ? 95 : 43) + random() * 270),
      size = COURSE.natural ? 5 + random() * 22 : 1 + random() * 6;
    d.position.set(x, sceneryHeight(x, s) + size * 0.15, -s);
    d.rotation.set(random() * 0.4, random() * 6, random() * 0.4);
    d.scale.set(size * 1.4, size, size);
    d.updateMatrix();
    r.setMatrixAt(i, d.matrix);
    d.position.y += size * 0.46;
    d.scale.set(size * 1.2, size * 0.63, size * 0.92);
    d.updateMatrix();
    caps.setMatrixAt(i, d.matrix);
  }
  r.castShadow = true;
  caps.castShadow = true;
  r.receiveShadow = true;
  caps.receiveShadow = true;
  scene.add(r, caps);
}

function distantPeaks(scene) {
  // A separate massif closes the valley; no collision geometry is needed here.
  const peaks = [
    [-1250, 2050, 1250, 850],
    [-590, 2450, 1450, 940],
    [80, 2330, 1100, 740],
    [700, 2600, 1570, 1000],
    [1420, 2200, 1280, 850],
  ];
  function noise(x, z) {
    const ix = Math.floor(x),
      iz = Math.floor(z),
      fx = x - ix,
      fz = z - iz;
    const hash = (a, b) => {
      const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return n - Math.floor(n);
    };
    const u = fx * fx * (3 - 2 * fx),
      v = fz * fz * (3 - 2 * fz);
    return (
      (hash(ix, iz) * (1 - u) + hash(ix + 1, iz) * u) * (1 - v) +
      (hash(ix, iz + 1) * (1 - u) + hash(ix + 1, iz + 1) * u) * v
    );
  }
  function height(x, s) {
    let h = 0;
    const warp = (noise(x * 0.004, s * 0.004) - 0.5) * 110;
    for (const [px, ps, ph, r] of peaks) {
      const d = Math.hypot((x - px + warp) * 0.86, s - ps);
      h = Math.max(h, ph * 0.72 * Math.pow(Math.max(0, 1 - d / r), 1.04));
    }
    const detail =
      (noise(x * 0.012, s * 0.012) - 0.5) * 130 +
      (noise(x * 0.031, s * 0.031) - 0.5) * 47 +
      (noise(x * 0.079, s * 0.079) - 0.5) * 20;
    return -430 + h + detail * Math.min(1, h / 150);
  }
  const p = [],
    c = [],
    ix = [],
    nx = 181,
    nz = 91;
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const wx = (x / (nx - 1) - 0.5) * 4300,
        s = 1570 + (z / (nz - 1)) * 2100,
        y = height(wx, s);
      p.push(wx, y, -s);
      const slope =
        Math.hypot(
          height(wx + 5, s) - height(wx - 5, s),
          height(wx, s + 5) - height(wx, s - 5),
        ) / 10;
      const exposed = Math.max(
        0,
        Math.min(
          1,
          (slope - 0.6) * 0.8 +
            (Math.sin(wx * 0.035 + s * 0.06) * 0.5 + 0.5) * 0.36,
        ),
      );
      const normal = new THREE.Vector3(
        -(height(wx + 5, s) - height(wx - 5, s)) / 10,
        1,
        (height(wx, s + 5) - height(wx, s - 5)) / 10,
      ).normalize();
      const light =
        0.67 +
        0.33 *
          Math.max(
            0,
            normal.dot(new THREE.Vector3(-0.55, 0.8, -0.23).normalize()),
          );
      const color = new THREE.Color("#d8e6ed")
        .lerp(new THREE.Color("#7793a6"), exposed)
        .multiplyScalar(light);
      color.lerp(new THREE.Color("#aecddd"), 0.36 + (z / (nz - 1)) * 0.3);
      c.push(color.r, color.g, color.b);
    }
  for (let z = 0; z < nz - 1; z++)
    for (let x = 0; x < nx - 1; x++) {
      const a = z * nx + x;
      ix.push(a, a + 1, a + nx, a + 1, a + nx + 1, a + nx);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  g.setIndex(ix);
  g.computeVertexNormals();
  const m = mesh(
    g,
    new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }),
    scene,
  );
  if (COURSE.natural) {
    m.position.z -= LENGTH - 1180;
    m.position.y += baseHeight(LENGTH) - (-132.7);
  }
  m.castShadow = false;
}

function textTexture(text, bg = "#dfff66", color = "#162d3b", size = 256) {
  const c = document.createElement("canvas");
  c.width = size * 4;
  c.height = size;
  const ctx = c.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = color;
  ctx.font = `italic 900 ${size * 0.47}px Arial`;
  const textWidth = ctx.measureText(text).width;
  if (textWidth > c.width * .92) ctx.font = `italic 900 ${size * .47 * c.width * .92 / textWidth}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
  const label=new THREE.MeshBasicMaterial({map:paintTexture,transparent:true,depthWrite:false,toneMapped:false});
  for(const side of [-1,1]) {
    // Separate front/back faces keep the lettering readable from either side.
    const face=new THREE.Mesh(new THREE.PlaneGeometry(4.3,1.05),label);
    face.position.set(-.45,0,side>0?.19:-.01);
    face.rotation.y=side>0?0:Math.PI;plank.add(face);
  }
}

function line(scene, points, color, opacity = 1) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = new THREE.Line(
    g,
    new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
  );
  scene.add(m);
  return m;
}
function gates(scene) {
  const pole = mat("#273d47"),
    blue = new THREE.MeshBasicMaterial({
      color: "#219ec8",
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
    });
  for (const j of JUMPS) {
    for (const side of [-1, 1]) {
      const x = j.x + side * (j.width + 1.4),
        s = j.lip - 5,
        y = groundHeight(x, s);
      mesh(
        new THREE.CylinderGeometry(0.075, 0.075, 5, 7),
        pole,
        scene,
        x,
        y + 2.5,
        -s,
      );
      const flag = mesh(
        new THREE.PlaneGeometry(1.45, 3.9),
        new THREE.MeshBasicMaterial({
          map: textTexture(
            String(j.index + 1).padStart(2, '0'),
            j.index % 2 ? "#e5ff64" : "#e9703f",
          ),
          side: THREE.DoubleSide,
        }),
        scene,
        x + side * 0.75,
        y + 3.05,
        -s,
      );
      flag.rotation.y = side * 0.2;
      flag.castShadow = false;
    }
    // Blue-dyed snow makes the lip and landing readable at speed.
    for (const s of [j.lip - 0.55, j.lip + 63]) {
      const positions = [];
      for (let i = 0; i <= 24; i++) {
        const x = j.x - j.width + 1 + (i * (j.width * 2 - 2)) / 24;
        positions.push(
          x,
          groundHeight(x, s) + 0.07,
          -s,
          x,
          groundHeight(x, s + 1) + 0.07,
          -s - 1,
        );
      }
      const indices = [];
      for (let i = 0; i < 24; i++) {
        let a = i * 2;
        indices.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      g.setIndex(indices);
      g.computeVertexNormals();
      mesh(g, blue, scene).castShadow = false;
    }
    const signS = j.lip - j.length - 12,
      x = j.x - 18,
      y = groundHeight(x, signS);
    mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 3.5, 6),
      pole,
      scene,
      x,
      y + 1.75,
      -signS,
    );
    mesh(
      new THREE.PlaneGeometry(5.4, 1.35),
      new THREE.MeshBasicMaterial({
        map: textTexture(`${String(j.index + 1).padStart(2, "0")} / ${j.name}`),
        side: THREE.DoubleSide,
      }),
      scene,
      x,
      y + 3.3,
      -signS,
    );
  }
  // Boundary stakes and lightly sagging red safety ropes.
  const safety = mat("#e76c45");
  for (const side of [-1, 1]) {
    let points = [];
    for (let s = -25; s < LENGTH + 45; s += 8) {
      const x = centerAt(s) + side * 34,
        y = groundHeight(x, s);
      points.push(
        new THREE.Vector3(x, y + 1.1 - (s % 24 === 0 ? 0 : 0.18), -s),
      );
      if ((s + 25) % 24 === 0)
        mesh(
          new THREE.CylinderGeometry(0.035, 0.04, 1.5, 5),
          safety,
          scene,
          x,
          y + 0.75,
          -s,
        );
    }
    line(scene, points, "#dd735c", 0.8);
  }
  for (const [s, text] of [
    [-14, "MAD STEEZ"],
    [LENGTH, "FINISH / NORTH PEAK"],
  ]) {
    const y = baseHeight(s);
    for (const x of [-15, 15])
      mesh(
        new THREE.CylinderGeometry(0.3, 0.4, 9, 8),
        pole,
        scene,
        x,
        y + 4.5,
        -s,
      );
    mesh(
      new THREE.BoxGeometry(31, 2.7, 0.4),
      new THREE.MeshStandardMaterial({
        map: textTexture(text),
        roughness: 0.8,
      }),
      scene,
      0,
      y + 8,
      -s,
    );
  }
}

function naturalMarkers(scene) {
  const pole = mat('#e77846');
  for (const j of JUMPS) {
    // Small expedition markers leave the natural silhouette unobstructed.
    for (const side of [-1, 1]) {
      const x = j.x + side * (j.width + 3), s = j.lip - 14;
      const y = groundHeight(x, s);
      mesh(new THREE.CylinderGeometry(0.09, 0.12, 3.8, 6), pole, scene, x, y + 1.9, -s);
      mesh(new THREE.PlaneGeometry(1.2, 0.85), new THREE.MeshBasicMaterial({
        map: textTexture(String(j.index + 1).padStart(2, '0'), '#e77846', '#182c39', 64),
        side: THREE.DoubleSide,
      }), scene, x, y + 3.25, -s);
    }
    const signS = j.lip - j.length - 20, x = j.x - 29;
    const y = groundHeight(x, signS);
    mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.8, 6), pole, scene, x, y + 1.4, -signS);
    mesh(new THREE.PlaneGeometry(6, 1.3), new THREE.MeshBasicMaterial({
      map: textTexture(`${String(j.index + 1).padStart(2, '0')} / ${j.name}`, '#213744', '#f0f4df', 128),
      side: THREE.DoubleSide,
    }), scene, x, y + 2.7, -signS);
  }
  for (const x of [-23, 23]) {
    const y = groundHeight(x, LENGTH);
    mesh(new THREE.CylinderGeometry(0.2, 0.3, 8, 8), pole, scene, x, y + 4, -LENGTH);
  }
  mesh(new THREE.PlaneGeometry(46, 3), new THREE.MeshBasicMaterial({
    map: textTexture('BLACKRIDGE / FINISH', '#e77846', '#182c39'), side: THREE.DoubleSide,
  }), scene, 0, baseHeight(LENGTH) + 7, -LENGTH);
}

export function createWorld(scene) {
  scene.fog = new THREE.Fog("#c2d5df", COURSE.openWorld ? 1200 : 220, COURSE.openWorld ? 6800 : 1900);
  const sky = createAlpineSky(scene);
  scene.add(new THREE.HemisphereLight("#c5ddf5", "#778e9d", 1.25));
  const sun = new THREE.DirectionalLight("#fff0d9", 2.7);
  sun.position.set(-90, 150, -100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -65,
    right: 65,
    top: 65,
    bottom: -65,
    near: 1,
    far: 420,
  });
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.12;
  scene.add(sun, sun.target);
  let mountain,forest;
  if (COURSE.openWorld) {
    mountain = createMountainWorld(scene, snowMaterial());
    summitParkSign(scene);
  }
  else {
    terrain(scene);
    distantPeaks(scene);
    forest=trees(scene);
    rocks(scene);
    gates(scene);
  }
  const skiLift = createSkiLift(scene);
  return {
    update(s) {
      mountain?.update(s);
      forest?.userData.update(s);
      sun.position.set(s.x - 90, s.y + 150, -s.s - 100);
      sun.target.position.set(s.x, s.y, -s.s - 20);
      sky.update(s);
      skiLift?.update(s.time);
    },
  };
}
