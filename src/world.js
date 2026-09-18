import * as THREE from "three";
import { createMountainWorld } from './mountain-world.js';
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

function snowMaterial() {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.91,
    vertexColors: true,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.graniteTexture = { value: graniteTexture };
    shader.vertexShader = shader.vertexShader.replace(
      "#include <common>",
      "#include <common>\nattribute float rockAmount; varying float vRock; varying vec3 vRockNormal; varying vec3 vSnowWorld;",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvSnowWorld = (modelMatrix * vec4(transformed,1.0)).xyz; vRock=rockAmount; vRockNormal=normalize(mat3(modelMatrix)*normal);",
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec3 vSnowWorld;
      varying float vRock;
      varying vec3 vRockNormal;
      uniform sampler2D graniteTexture;
      float hashSnow(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float snowNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashSnow(i),hashSnow(i+vec2(1,0)),f.x),mix(hashSnow(i+vec2(0,1)),hashSnow(i+vec2(1,1)),f.x),f.y);}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float n=snowNoise(vSnowWorld.xz*2.8)*0.5+snowNoise(vSnowWorld.xz*0.17)*0.5;
      float groom=sin(vSnowWorld.x*24.0+sin(vSnowWorld.z*0.02))*0.025;
      vec3 weights=pow(abs(vRockNormal),vec3(4.0));weights/=max(dot(weights,vec3(1.0)),0.001);
      vec3 cliff=texture2D(graniteTexture,vSnowWorld.yz*.09).rgb*weights.x+texture2D(graniteTexture,vSnowWorld.xz*.09).rgb*weights.y+texture2D(graniteTexture,vSnowWorld.xy*.09).rgb*weights.z;
      diffuseColor.rgb=mix(diffuseColor.rgb*(0.85+n*0.22+groom),cliff*.85,vRock);
      float terrainBump=mix(snowNoise(vSnowWorld.xz*3.0)*.022+groom*.06,dot(cliff,vec3(.333))*.28,vRock);
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      `#include <normal_fragment_begin>
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
      vec3 rx=cross(sy,normal),ry=cross(normal,sx);
      float determinant=dot(sx,rx)*faceDirection;
      vec3 gradient=sign(determinant)*(dFdx(terrainBump)*rx+dFdy(terrainBump)*ry);
      normal=normalize(abs(determinant)*normal-gradient);
    `,
    );
  };
  return m;
}

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
  const greenParts = [],
    whiteParts = [];
  for (let tier = 0; tier < 7; tier++) {
    const radius = (1 - tier / 8) * 2.5,
      y = 1.7 + tier * 0.98;
    const core = new THREE.ConeGeometry(radius * 0.55, 2.2, 7);
    core.translate(0, y + 0.4, 0);
    greenParts.push(core);
    for (let branch = 0; branch < 7; branch++) {
      const angle = (branch / 7) * Math.PI * 2 + tier * 2.1;
      const length = radius * (0.85 + random() * 0.3);
      const dir = new THREE.Vector3(
        Math.cos(angle),
        -0.17,
        Math.sin(angle),
      ).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        dir,
      );
      const b = new THREE.ConeGeometry(0.47 * (1 - tier * 0.08), length, 6);
      b.applyQuaternion(q);
      b.translate(dir.x * length * 0.43, y, dir.z * length * 0.43);
      greenParts.push(b);
      const cap = new THREE.SphereGeometry(1, 6, 4);
      cap.scale(
        length * 0.52,
        0.15 * (1 - tier * 0.06),
        0.3 * (1 - tier * 0.08),
      );
      cap.rotateY(-angle);
      cap.translate(dir.x * length * 0.44, y + 0.19, dir.z * length * 0.44);
      whiteParts.push(cap);
    }
  }
  const tip = new THREE.ConeGeometry(0.42, 1.7, 7);
  tip.translate(0, 8.3, 0);
  whiteParts.push(tip);
  const count = COURSE.natural ? 160 : 1000;
  const green = new THREE.InstancedMesh(
    mergeGeometries(greenParts),
    mat("#214c48"),
    count,
  );
  const white = new THREE.InstancedMesh(
    mergeGeometries(whiteParts),
    mat("#ecf4f8"),
    count,
  );
  const trunks = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.15, 0.29, 4, 6),
    mat("#605d56"),
    count,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const s = COURSE.natural ? LENGTH * (0.67 + random() * 0.35) : -100 + random() * 1600,
      side = random() < 0.5 ? -1 : 1;
    const x = centerAt(s) + side * ((COURSE.natural ? 100 : 42) + Math.pow(random(), 1.8) * 235);
    const scale = 0.6 + random() * 1.2;
    dummy.position.set(x, sceneryHeight(x, s), -s);
    dummy.scale.setScalar(scale);
    dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.05);
    dummy.updateMatrix();
    green.setMatrixAt(i, dummy.matrix);
    white.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 2 * scale;
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
  }
  for (const m of [green, white, trunks]) {
    m.castShadow = true;
    m.receiveShadow = true;
    scene.add(m);
  }
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
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, c.width / 2, c.height / 2);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
    [-14, "SKIMANGAME"],
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

function lift(scene) {
  const steel = mat("#48626e", { metalness: 0.6, roughness: 0.43 }),
    seats = mat("#172f3a"),
    chairs = [];
  for (let s = -100; s <= 1450; s += 155) {
    const x = -64,
      y = sceneryHeight(x, s);
    mesh(
      new THREE.CylinderGeometry(0.35, 0.65, 16, 10),
      steel,
      scene,
      x,
      y + 8,
      -s,
    );
    mesh(new THREE.BoxGeometry(11, 0.5, 0.65), steel, scene, x, y + 16, -s);
    for (const offset of [-4.5, 4.5])
      mesh(
        new THREE.BoxGeometry(1.2, 0.8, 1.9),
        seats,
        scene,
        x + offset,
        y + 15.9,
        -s,
      );
  }
  for (const offset of [-4.5, 4.5]) {
    const points = [];
    for (let s = -100; s <= 1450; s += 5)
      points.push(
        new THREE.Vector3(
          -64 + offset,
          sceneryHeight(-64, s) +
            16 -
            Math.sin((((s + 100) % 155) / 155) * Math.PI) * 2,
          -s,
        ),
      );
    line(scene, points, "#304551");
    for (let s = -80; s < 1430; s += 44) {
      const group = new THREE.Group();
      scene.add(group);
      mesh(
        new THREE.CylinderGeometry(0.045, 0.045, 2.4, 6),
        steel,
        group,
        0,
        -1.2,
        0,
      );
      mesh(new THREE.BoxGeometry(2.5, 0.16, 0.95), seats, group, 0, -3, 0);
      mesh(new THREE.BoxGeometry(2.5, 0.65, 0.12), seats, group, 0, -2.6, 0.4);
      for (const x of [-1.2, 1.2])
        mesh(
          new THREE.CylinderGeometry(0.045, 0.045, 1.2, 5),
          steel,
          group,
          x,
          -2.4,
          0.3,
        );
      chairs.push({ group, s, offset });
    }
  }
  return (time) => {
    for (const c of chairs) {
      const s = ((c.s + time * (c.offset > 0 ? 2 : -2) + 2000) % 1510) - 100;
      c.group.position.set(
        -64 + c.offset,
        sceneryHeight(-64, s) +
          16 -
          Math.sin((((s + 100) % 155) / 155) * Math.PI) * 2,
        -s,
      );
    }
  };
}

function sky(scene) {
  const g = new THREE.SphereGeometry(8500, 40, 24);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color("#367da9") },
      bottom: { value: new THREE.Color("#d4e6e9") },
    },
    vertexShader:
      "varying vec3 vWorld; void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:
      "varying vec3 vWorld;uniform vec3 top;uniform vec3 bottom;void main(){float t=pow(max(normalize(vWorld).y,0.0),0.6);gl_FragColor=vec4(mix(bottom,top,t),1.0);}",
  });
  const dome = new THREE.Mesh(g, m);
  scene.add(dome);
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,253,222,1)");
  grad.addColorStop(0.13, "rgba(255,249,218,.95)");
  grad.addColorStop(0.25, "rgba(255,239,194,.22)");
  grad.addColorStop(1, "rgba(255,234,186,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const sun = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c),
      transparent: true,
      depthWrite: false,
      fog: false,
    }),
  );
  sun.position.set(-850, 1250, -1600);
  sun.scale.set(850, 850, 1);
  scene.add(sun);
  return dome;
}

export function createWorld(scene) {
  scene.fog = new THREE.Fog("#b7d3df", COURSE.openWorld ? 900 : 180, COURSE.openWorld ? 6200 : 1350);
  const dome = sky(scene);
  scene.add(new THREE.HemisphereLight("#d2eaff", "#7b97a3", 2.1));
  const sun = new THREE.DirectionalLight("#fff3d9", 3.1);
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
  let mountain;
  if (COURSE.openWorld) mountain = createMountainWorld(scene, snowMaterial());
  else {
    terrain(scene);
    distantPeaks(scene);
    trees(scene);
    rocks(scene);
    gates(scene);
  }
  const updateLift = COURSE.natural ? () => {} : lift(scene);
  return {
    update(s) {
      mountain?.update(s);
      sun.position.set(s.x - 90, s.y + 150, -s.s - 100);
      sun.target.position.set(s.x, s.y, -s.s - 20);
      dome.position.set(s.x, s.y, -s.s);
      updateLift(s.time);
    },
  };
}
