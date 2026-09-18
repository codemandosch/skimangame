import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { groundHeight, COURSE } from "./course.js";
import { groundFrame } from './ground-frame.js';
import { createRiderPose, updateRiderPose } from "./rider-pose.js";
import { createRiderMaterials } from "./rider-materials.js";
import { loadSkinnedRider } from "./skinned-rider.js";
import {
  hideProceduralSkiBoots,
  loadBlackridgeSkis,
} from "./blackridge-ski.js";
const up = new THREE.Vector3(0, 1, 0);
function skiGeometry() {
  const p = [],
    uv = [],
    ix = [],
    steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      z = -1.62 + t * 2.82,
      width =
        (0.075 + 0.033 * Math.pow(Math.abs(t - 0.53) * 2, 1.4)) *
        Math.sqrt(Math.min(1, t / 0.045, (1 - t) / 0.045)),
      curve =
        z < -1.15
          ? Math.pow((-z - 1.15) / 0.47, 2) * 0.21
          : z > 0.95
            ? Math.pow((z - 0.95) / 0.25, 2) * 0.045
            : 0;
    for (const [x, y] of [
      [-width, 0.075],
      [width, 0.075],
      [-width, 0.108],
      [width, 0.108],
    ]) {
      p.push(x, y + curve, z);
      uv.push(x < 0 ? 0 : 1, t);
    }
    if (i < steps) {
      const a = i * 4,
        b = a + 4;
      ix.push(
        a + 2,
        b + 2,
        a + 3,
        a + 3,
        b + 2,
        b + 3,
        a,
        a + 1,
        b,
        a + 1,
        b + 1,
        b,
        a,
        b,
        a + 2,
        a + 2,
        b,
        b + 2,
        a + 1,
        a + 3,
        b + 1,
        a + 3,
        b + 3,
        b + 1,
      );
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ix);
  g.computeVertexNormals();
  return g;
}
export function createSkier(scene) {
  const root = new THREE.Group(),
    heading = new THREE.Group(),
    spin = new THREE.Group(),
    body = new THREE.Group(),
    torso = new THREE.Group();
  root.add(heading);
  heading.add(spin);
  spin.add(body);
  body.add(torso);
  scene.add(root);
  spin.position.y = 1;
  body.position.y = -1;
  const pose = createRiderPose(),
    m = createRiderMaterials();
  function mesh(g, material, parent, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(g, material);
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function box(w, h, d, material, parent, x, y, z) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  }
  function capsule(r, l, material, parent, x = 0, y = 0, z = 0) {
    return mesh(
      new THREE.CapsuleGeometry(r, l, 5, 12),
      material,
      parent,
      x,
      y,
      z,
    );
  }
  function segment(r, material) {
    return capsule(r, 1 - 2 * r, material, body);
  }
  function fit(o, a, b) {
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.scale.y = a.distanceTo(b);
    o.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
  }
  const profile = [
    [0, 0.03],
    [0.26, 0.03],
    [0.31, 0.1],
    [0.335, 0.3],
    [0.345, 0.48],
    [0.3, 0.66],
    [0.2, 0.73],
    [0, 0.73],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const coat = mesh(new THREE.LatheGeometry(profile, 24), m.jacket, torso);
  coat.scale.z = 0.77;
  const hem = mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.1, 24),
    m.dark,
    torso,
    0,
    0.04,
    0,
  );
  hem.scale.z = 0.78;
  const hood = mesh(
    new THREE.TorusGeometry(0.18, 0.07, 8, 20),
    m.jacket,
    torso,
    0,
    0.72,
    0.025,
  );
  hood.rotation.x = Math.PI / 2;
  box(0.032, 0.58, 0.025, m.black, torso, 0, 0.39, -0.266);
  box(0.085, 0.03, 0.045, m.metal, torso, 0.022, 0.61, -0.28);
  for (const side of [-1, 1]) {
    box(
      0.135,
      0.21,
      0.03,
      m.orange,
      torso,
      side * 0.205,
      0.28,
      -0.242,
    ).rotation.z = side * 0.16;
    box(
      0.1,
      0.013,
      0.033,
      m.dark,
      torso,
      side * 0.205,
      0.35,
      -0.26,
    ).rotation.z = side * 0.16;
    box(
      0.055,
      0.54,
      0.035,
      m.dark,
      torso,
      side * 0.185,
      0.4,
      -0.25,
    ).rotation.z = side * 0.11;
  }
  const pack = capsule(0.225, 0.2, m.dark, torso, 0, 0.38, 0.22);
  pack.scale.set(1, 0.97, 0.58);
  box(0.36, 0.32, 0.04, m.black, torso, 0, 0.4, 0.365);
  mesh(new THREE.PlaneGeometry(0.3, 0.2), m.badge, torso, 0, 0.43, 0.39);
  for (const side of [-1, 1])
    box(0.024, 0.4, 0.02, m.orange, torso, side * 0.14, 0.39, 0.39);
  mesh(
    new THREE.PlaneGeometry(0.14, 0.1),
    m.badge,
    torso,
    -0.15,
    0.51,
    -0.27,
  ).rotation.y = Math.PI;
  capsule(0.09, 0.09, m.black, torso, 0, 0.8, -0.01);
  const head = new THREE.Group();
  head.position.set(0, 0.97, -0.015);
  torso.add(head);
  const helmet = mesh(new THREE.SphereGeometry(0.222, 28, 20), m.dark, head);
  helmet.scale.set(1, 1.02, 1.05);
  const stripe = mesh(
    new THREE.SphereGeometry(0.225, 28, 16, 0, Math.PI * 2, 0, 0.68),
    m.orange,
    head,
  );
  stripe.scale.z = 1.04;
  for (const x of [-0.115, -0.07, 0.07, 0.115])
    box(0.022, 0.017, 0.09, m.black, head, x, 0.205, -0.03);
  box(0.39, 0.125, 0.08, m.black, head, 0, -0.015, -0.197);
  box(0.34, 0.09, 0.025, m.lens, head, 0, -0.01, -0.242);
  const band = mesh(
    new THREE.TorusGeometry(0.215, 0.026, 6, 28),
    m.black,
    head,
    0,
    -0.02,
    0,
  );
  band.rotation.x = Math.PI / 2;
  capsule(0.12, 0.025, m.black, head, 0, -0.12, -0.09);
  const skis = [],
    skiBoots = [],
    legs = [],
    arms = [],
    skiGeo = skiGeometry();
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1,
      ski = new THREE.Group();
    body.add(ski);
    skis.push(ski);
    mesh(skiGeo, m.ski, ski);
    // Boots and bindings share the ski frame throughout every trick.
    box(0.17, 0.045, 0.43, m.metal, ski, 0, 0.135, 0);
    mesh(new RoundedBoxGeometry(0.19, 0.08, 0.11, 2, 0.024), m.dark, ski, 0, 0.18, -0.19);
    mesh(new RoundedBoxGeometry(0.16, 0.09, 0.12, 2, 0.02), m.dark, ski, 0, 0.185, 0.17);
    box(0.23, 0.075, 0.43, m.black, ski, 0, 0.175, -0.055);
    const foot = capsule(0.12, 0.16, m.white, ski, 0, 0.265, -0.06);
    foot.rotation.x = Math.PI / 2;
    foot.scale.z = 0.85;
    mesh(
      new THREE.CylinderGeometry(0.11, 0.115, 0.23, 14),
      m.white,
      ski,
      0,
      0.33,
      0.035,
    ).rotation.x = -0.11;
    for (const y of [0.26, 0.34, 0.41]) {
      box(0.245, 0.026, 0.12, m.dark, ski, 0, y, -0.055);
      box(0.055, 0.038, 0.045, m.metal, ski, side * 0.13, y, -0.08);
    }
    box(0.2, 0.05, 0.06, m.orange, ski, 0, 0.31, -0.16);
    skiBoots.push(ski.children.slice(4));
    const upper = segment(0.16, m.pants),
      lower = segment(0.135, m.pants),
      knee = capsule(0.148, 0.015, m.pants, body),
      cuff = mesh(
        new THREE.CylinderGeometry(0.14, 0.15, 0.13, 12),
        m.dark,
        body,
      );
    legs.push({ upper, lower, knee, cuff });
    const armUpper = segment(0.135, m.jacket),
      armLower = segment(0.108, m.sleeve),
      elbow = capsule(0.12, 0.01, m.sleeve, body),
      glove = new THREE.Group();
    body.add(glove);
    capsule(0.078, 0.085, m.black, glove).rotation.z = Math.PI / 2;
    capsule(
      0.032,
      0.07,
      m.dark,
      glove,
      side * 0.015,
      -0.045,
      -0.055,
    ).rotation.x = 0.55;
    box(0.09, 0.045, 0.1, m.white, glove, 0, 0.042, 0);
    const pole = new THREE.Group();
    glove.add(pole);
    pole.position.set(side * 0.04, -0.02, 0.04);
    mesh(
      new THREE.CylinderGeometry(0.011, 0.016, 1.15, 7),
      m.metal,
      pole,
      0,
      -0.57,
      0.05,
    );
    capsule(0.023, 0.12, m.black, pole, 0, -0.03, 0.05);
    mesh(
      new THREE.TorusGeometry(0.045, 0.011, 5, 10),
      m.black,
      pole,
      0,
      -1.06,
      0.05,
    ).rotation.x = Math.PI / 2;
    arms.push({ upper: armUpper, lower: armLower, elbow, glove, pole });
  }
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d"),
    gradient = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  gradient.addColorStop(0, "rgba(26,51,68,.35)");
  gradient.addColorStop(0.4, "rgba(26,51,68,.2)");
  gradient.addColorStop(1, "rgba(26,51,68,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 64, 64);
  const shadow = mesh(
    new THREE.PlaneGeometry(3, 4.2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
    scene,
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  let previousTime = 0;
  let skinnedRig = null;
  let riderStatus = "loading freestyle skier";
  let skiStatus = "loading BLACKRIDGE skis";
  const rider = {
    root,
    get assetStatus() {
      return `${riderStatus} · ${skiStatus}`;
    },
    update(s, dt) {
      if (s.time < previousTime) Object.assign(pose, createRiderPose());
      previousTime = s.time;
      updateRiderPose(pose, s, s.paused || s.finished ? 0 : dt);
      root.position.set(s.x, s.y + 0.03, -s.s);
      const dx = COURSE.openWorld ? -Math.sin(s.heading) : 0;
      const ds = COURSE.openWorld ? Math.cos(s.heading) : 1;
      const tilt = Math.atan((groundHeight(s.x+dx, s.s+ds)-groundHeight(s.x-dx,s.s-ds))/2);
      const frame = COURSE.openWorld && !s.airborne ? groundFrame(s.x,s.s,s.heading,groundHeight) : null;
      if(frame) root.position.y += frame.clearance + .06;
      heading.rotation.set(s.airborne ? -0.1 : (frame?.pitch ?? tilt), s.heading, frame?.roll ?? 0, "YXZ");
      spin.rotation.set(
        -s.flip,
        -(s.stanceYaw + s.spin + s.yawOffset),
        0,
        "YXZ",
      );
      torso.position.copy(pose.hips);
      torso.quaternion.copy(pose.torsoQuaternion);
      head.rotation.y = -pose.lean * 0.22;
      for (let i = 0; i < 2; i++) {
        const ski = pose.skis[i],
          leg = pose.legs[i],
          arm = pose.arms[i];
        skis[i].position.copy(ski.position);
        skis[i].quaternion.copy(ski.quaternion);
        fit(legs[i].upper, leg.hip, leg.knee);
        fit(legs[i].lower, leg.knee, leg.foot);
        legs[i].knee.position.copy(leg.knee);
        legs[i].cuff.position.copy(leg.foot).lerp(leg.knee, 0.13);
        legs[i].cuff.quaternion.copy(legs[i].lower.quaternion);
        fit(arms[i].upper, arm.shoulder, arm.elbow);
        fit(arms[i].lower, arm.elbow, arm.hand);
        arms[i].elbow.position.copy(arm.elbow);
        arms[i].glove.position.copy(arm.hand);
        arms[i].glove.quaternion
          .copy(ski.quaternion)
          .slerp(arm.gripQuaternion, arm.grip);
        arms[i].pole.rotation.x = -0.6 - arm.grip * 0.8;
      }
      if (skinnedRig) {
        const contacts = skinnedRig.update(pose, s);
        for (let i = 0; i < 2; i++) arms[i].glove.position.copy(contacts.hands[i].actual);
      }
      shadow.position.set(s.x, groundHeight(s.x, s.s) + 0.045, -s.s);
      shadow.material.opacity = Math.max(0.13, 1 - s.airHeight / 24);
      shadow.scale.setScalar(1 + s.airHeight * 0.035);
    },
  };
  rider.ready = loadSkinnedRider(body).then(rig => {
    skinnedRig = rig;
    torso.visible = false;
    for (const leg of legs) for (const part of Object.values(leg)) part.visible = false;
    for (const arm of arms) {
      arm.upper.visible = arm.lower.visible = arm.elbow.visible = false;
      for (const child of arm.glove.children) if (child !== arm.pole) child.visible = false;
      arm.pole.position.set(0, 0, -0.05);
    }
    // Retain skis and bindings, replacing the procedural boots with the skinned ones.
    for (const boots of skiBoots) hideProceduralSkiBoots(boots);
    riderStatus = "Tripo / Blender skinned rider";
    return true;
  }).catch(error => {
    riderStatus = "procedural rider fallback";
    console.warn("Freestyle skier could not load; keeping the procedural rider.", error);
    return false;
  });
  rider.skiReady = loadBlackridgeSkis(skis).then(() => {
    skiStatus = "BLACKRIDGE skis";
    return true;
  }).catch(error => {
    skiStatus = "procedural ski fallback";
    console.warn("BLACKRIDGE skis could not load; keeping the procedural skis.", error);
    return false;
  });
  return rider;
}
