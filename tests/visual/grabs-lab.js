import * as THREE from "three";
import { createSkier } from "../../src/skier.js";
import { createState } from "../../src/physics.js";

// Every held grab from five angles: ?grabs=mute,japan&views=front,side&size=260 narrows the sheet.
// The snow stances neutral, charge (Space held), carve-left and carve-right can be listed too.
const params = new URLSearchParams(location.search);
const grabs = { mute: 1, safety: 2, blunt: 3, octo: 4, japan: 5, hangout: 6, bow: 7, daffy: 0 };
const stances = { neutral: {}, charge: { tucking: true, charge: 1 }, "carve-left": { steer: -1 }, "carve-right": { steer: 1 } };
const names = (params.get("grabs") || Object.keys(grabs).join(",")).split(",");
const views = { front: Math.PI, "front-3/4": Math.PI * .75, side: Math.PI / 2, "rear-3/4": Math.PI * .25, rear: 0, "left-3/4": -Math.PI * .75, left: -Math.PI / 2 };
const angles = (params.get("views") || "front,front-3/4,side,rear-3/4,rear").split(",").map(view => [view, views[view]]);
const size = Number(params.get("size") || 220);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#344958");
scene.add(new THREE.HemisphereLight("#eef7ff", "#8b9295", 2.2));
const sun = new THREE.DirectionalLight("#fff2d7", 3);
sun.position.set(-3, 185, 3);
scene.add(sun);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(size, size);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
const skier = createSkier(scene), state = createState();
const sheet = document.getElementById("sheet");
sheet.width = size * angles.length;
sheet.height = size * names.length;
const context = sheet.getContext("2d");

await Promise.all([skier.ready, skier.skiReady]);
// Distance between each skinned palm and its target, in metres: a grab that
// looks right but floats off the ski shows up here first.
const report = {};
// lab.joints() lists the skinned joints in rider space after the sheet renders.
const bones = {};
scene.traverse(object => { if (object.isBone) bones[object.name] = object; });
const joints = () => {
  const format = point => [point.x, point.y, point.z].map(value => +value.toFixed(2)).join(", ");
  let model = bones.Root;
  while (model.parent.type !== "Group") model = model.parent;
  const space = model.parent.parent;
  return Object.fromEntries([
    ...Object.entries(bones).map(([name, bone]) => [name, format(space.worldToLocal(bone.getWorldPosition(new THREE.Vector3())))]),
    ["targets", skier.contacts.hands.map(hand => format(hand.target)).join(" | ")],
  ]);
};
window.lab = { scene, skier, state, report, joints };
names.forEach((name, row) => {
  const onSnow = name in stances;
  Object.assign(state, createState(), onSnow ? { y: 180, speed: 20, ...stances[name] } : {
    airborne: true, airtime: .65, y: 180.45, speed: 20,
    grab: grabs[name], daffyProgress: name === "daffy" ? 1 : 0,
  });
  for (let i = 0; i < 240; i++) {
    state.time += 1 / 120;
    skier.update(state, 1 / 120);
  }
  report[name] = skier.contacts?.hands.map(hand => +hand.actual.distanceTo(hand.target).toFixed(3));
  angles.forEach(([label, angle], column) => {
    const lift = onSnow ? -0.45 : 0;
    camera.position.set(Math.sin(angle) * 4.2, 182.15 + lift, Math.cos(angle) * 4.2);
    camera.lookAt(0, 181.7 + lift, 0);
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, column * size, row * size);
    context.fillStyle = "#e0ef61";
    context.fillText(column ? label : `${name} · hand miss ${report[name]?.join(" / ")}`, column * size + 8, row * size + 16);
  });
});
document.title = "grabs ready";
