import * as THREE from "three";
import { groundHeight } from "./course.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function snowSprayRate(s) {
  if (s.airborne || s.speed <= 0.75) return 0;
  const speed = clamp((s.speed - 0.75) / 36, 0, 1);
  return (10 + speed * 180) * (1 + Math.abs(s.steer) * 0.65);
}

export function landingSprayCount(s) {
  return Math.round(clamp(150 + s.speed * 2.5 + s.landingPulse * 180, 170, 320));
}

export function createEffects(scene) {
  const count = 700,
    positions = new Float32Array(count * 3),
    sizes = new Float32Array(count),
    lives = new Float32Array(count),
    velocity = new Float32Array(count * 3);
  positions.fill(-10000);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("life", new THREE.BufferAttribute(lives, 1));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader:
      "attribute float life;attribute float size;varying float vLife;void main(){vLife=life;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=min(35.0,size*500.0/max(1.0,-mv.z));gl_Position=projectionMatrix*mv;}",
    fragmentShader:
      "varying float vLife;void main(){float d=length(gl_PointCoord-0.5);float a=smoothstep(0.5,0.15,d)*min(vLife,1.0)*0.65;gl_FragColor=vec4(0.92,0.97,1.0,a);}",
  });
  const snow = new THREE.Points(geometry, material);
  snow.frustumCulled = false;
  scene.add(snow);
  let cursor = 0;
  const segments = 2500,
    trailPositions = new Float32Array(segments * 36),
    trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(trailPositions, 3),
  );
  trailGeo.setDrawRange(0, 0);
  const trails = new THREE.Mesh(
    trailGeo,
    new THREE.MeshBasicMaterial({
      color: "#7eacc2",
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  trails.frustumCulled = false;
  scene.add(trails);
  let trailCursor = 0,
    trailCount = 0,
    previous = null,
    eventId = 0,
    sprayCarry = 0;
  function emit(s, n, burst = false) {
    const rightX=Math.cos(s.heading), rightS=Math.sin(s.heading);
    for (let i = 0; i < n; i++) {
      const id = cursor++ % count,
        p = id * 3,
        side = Math.random() < 0.5 ? -1 : 1;
      positions[p] = s.x + rightX * side * 0.32 + Math.sin(s.heading)*.3;
      positions[p + 1] = s.y + 0.12;
      positions[p + 2] = -s.s - rightS * side * .32 + Math.cos(s.heading)*.3;
      velocity[p] = (Math.random() - 0.5) * (burst ? 9 : 3) - s.vx * 0.17;
      velocity[p + 1] = Math.random() * (burst ? 5 : 2.5) + 0.4;
      velocity[p + 2] = (Math.random() * 3 + 1)*Math.cos(s.heading) + (s.vs||0)*.12;
      lives[id] = 0.5 + Math.random() * 0.8;
      sizes[id] = 0.08 + Math.random() * (burst ? 0.28 : 0.17);
    }
  }
  function track(s) {
    if (!previous || Math.hypot(s.x - previous.x, s.s - previous.s) > 3) {
      previous = { x: s.x, s: s.s, heading:s.heading };
      return;
    }
    const offset = trailCursor * 36;
    let k = offset;
    for (const side of [-1, 1]) {
      const point=(state,width)=>{
        const x=state.x+Math.cos(state.heading)*(side*.32+width);
        const z=state.s+Math.sin(state.heading)*(side*.32+width);
        return [x,groundHeight(x,z)+.042,-z];
      };
      const a=point(previous,-.045),b=point(previous,.045),c=point(s,-.045),d=point(s,.045);
      for (const p of [a, b, c, b, d, c])
        for (const v of p) trailPositions[k++] = v;
    }
    trailCursor = (trailCursor + 1) % segments;
    trailCount = Math.min(segments, trailCount + 1);
    trailGeo.setDrawRange(0, trailCount * 12);
    trailGeo.attributes.position.needsUpdate = true;
    previous = { x: s.x, s: s.s, heading:s.heading };
  }
  return {
    reset() {
      previous = null;
      trailCount = 0;
      trailCursor = 0;
      trailGeo.setDrawRange(0, 0);
      lives.fill(0);
      sprayCarry = 0;
    },
    update(s, dt) {
      if (s.event !== eventId) {
        eventId = s.event;
        if (s.eventType === "land") emit(s, landingSprayCount(s), true);
        if (s.eventType === "bail") emit(s, 95, true);
      }
      if (!s.paused && !s.finished) {
        if (!s.airborne) {
          sprayCarry += snowSprayRate(s) * dt;
          const particles = Math.floor(sprayCarry);
          if (particles > 0) {
            emit(s, particles);
            sprayCarry -= particles;
          }
          if (s.speed > 0.75) track(s);
          else previous = null;
        } else {
          previous = null;
          sprayCarry = 0;
        }
        for (let i = 0; i < count; i++)
          if (lives[i] > 0) {
            lives[i] -= dt;
            const p = i * 3;
            positions[p] += velocity[p] * dt;
            positions[p + 1] += velocity[p + 1] * dt;
            positions[p + 2] += velocity[p + 2] * dt;
            velocity[p + 1] -= 5 * dt;
          } else positions[i * 3 + 1] = -10000;
        geometry.attributes.position.needsUpdate = true;
        geometry.attributes.life.needsUpdate = true;
        geometry.attributes.size.needsUpdate = true;
      }
    },
  };
}

export function createAudio() {
  let ctx,
    windGain,
    skiGain,
    filter,
    enabled = false,
    lastEvent = 0;
  function init() {
    if (ctx) return;
    ctx = new AudioContext();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + Math.random() * 0.1 - 0.05) / 1.025;
      data[i] = last * 4;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 650;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    source.connect(filter).connect(windGain).connect(ctx.destination);
    const high = ctx.createBiquadFilter();
    high.type = "highpass";
    high.frequency.value = 1700;
    skiGain = ctx.createGain();
    skiGain.gain.value = 0;
    source.connect(high).connect(skiGain).connect(ctx.destination);
    source.start();
  }
  function tone(freq, duration, volume, type = "sine") {
    const o = ctx.createOscillator(),
      gain = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(
      freq * 0.35,
      ctx.currentTime + duration,
    );
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    o.connect(gain).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + duration);
  }
  return {
    async toggle() {
      init();
      await ctx.resume();
      enabled = !enabled;
      return enabled;
    },
    update(s) {
      if (!ctx) return;
      const active = enabled && !s.paused && !s.finished;
      windGain.gain.setTargetAtTime(
        active ? s.speed * 0.0026 : 0,
        ctx.currentTime,
        0.15,
      );
      skiGain.gain.setTargetAtTime(
        active && !s.airborne ? 0.08 + Math.abs(s.steer) * 0.14 : 0,
        ctx.currentTime,
        0.1,
      );
      filter.frequency.setTargetAtTime(
        350 + s.speed * 18,
        ctx.currentTime,
        0.1,
      );
      if (lastEvent !== s.event) {
        lastEvent = s.event;
        if (active) {
          if (s.eventType === "land") tone(100, 0.2, 0.11);
          if (s.eventType === "takeoff") tone(250, 0.17, 0.035);
          if (s.eventType === "bail") tone(65, 0.4, 0.15, "triangle");
        }
      }
    },
  };
}
