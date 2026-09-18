import { writeFile } from 'node:fs/promises';
import { Group } from 'three';
import { loadRider } from '../../../tests/helpers/load-rider.js';
import { createSkinnedRiderRig } from '../../../src/skinned-rider.js';
import { createRiderPose, updateRiderPose } from '../../../src/rider-pose.js';
import { createState } from '../../../src/physics.js';

const model = await loadRider(), space = new Group();
space.add(model);
space.updateMatrixWorld(true);
const rest = {};
model.traverse(o => { if (o.isBone) rest[o.name] = o.matrixWorld.toArray(); });
const rig = createSkinnedRiderRig(model, space);
const motions = {
  Neutral: {}, CarveLeft: {steer:-1}, CarveRight: {steer:1},
  Tuck: {tucking:true}, Charge: {charge:1},
  Takeoff: {airborne:true,airtime:.08},
  Airborne: {airborne:true,airtime:.7},
  MuteGrab: {airborne:true,airtime:.7,grab:1},
  TailGrab: {airborne:true,airtime:.7,grab:2},
  Landing: {landingPulse:.4}, Switch: {switch:true},
};
const sample = pose => ({
  bones: Object.fromEntries(Object.entries(rig.bones).map(([name,bone]) => [name,bone.matrixWorld.toArray()])),
  skis: pose.skis.map(ski => ({position: ski.position.toArray(), quaternion: ski.quaternion.toArray()})),
});
const snapshots = {}, actions = {};
for (const [name, flags] of Object.entries(motions)) {
  const state = {...createState(),...flags,speed:20};
  const pose = createRiderPose();
  for (let i=0;i<240;i++) updateRiderPose(pose,state,1/120);
  rig.update(pose,state);
  snapshots[name] = sample(pose);
  const start = {...createState(),speed:20};
  if (flags.airborne) Object.assign(start,{airborne:true,airtime:.7});
  const moving = createRiderPose();
  for (let i=0;i<240;i++) updateRiderPose(moving,start,1/120);
  const frames=[];
  for (let f=0;f<49;f++) {
    const t=f/24;
    Object.assign(start,flags);
    start.time=t;
    if(name==='Takeoff') start.airtime=t;
    if(name==='Landing') start.landingPulse=.4*Math.exp(-t*7);
    for(let sub=0;sub<5;sub++) updateRiderPose(moving,start,1/120);
    rig.update(moving,start);
    frames.push(sample(moving).bones);
  }
  actions[name]=frames;
}
await writeFile(new URL('./game/poses.json',import.meta.url),JSON.stringify({fps:24,rest,snapshots,actions}));
console.log(`Captured ${Object.keys(snapshots).length} poses and their transitions on the shipped skeleton.`);
