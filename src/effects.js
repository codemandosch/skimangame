import * as THREE from 'three';
import { groundHeight } from './course.js';
import { snowLaunch, advanceSnow } from './snow-dynamics.js';
import { landingPowderPressure } from './landing-impact.js';
import { createLandingCrater } from './landing-crater.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function snowSprayRate(s) {
  if (s.airborne || s.railing || s.speed <= .75 || s.awaitingStart || s.bailTimer > 0) return 0;
  const speed=clamp((s.speed-.75)/36,0,1);
  return (8+speed*125)*(1+Math.abs(s.steer || 0)*1.2+(s.braking ? 1.1 : 0)+(s.landingSkid || 0)*3+landingPowderPressure(s)*3);
}
export function landingSprayCount(s) {
  return Math.round(clamp(150+s.speed*2.5+(s.landingPulse || 0)*180,170,320)
    +(s.landingSkid || 0)*220+(s.landingImpact?.strength || 0)*380);
}

export function createEffects(scene) {
  const count=1600, particles=Array.from({length:count},()=>({life:0}));
  const positions=new Float32Array(count*3), sizes=new Float32Array(count), lives=new Float32Array(count);
  positions.fill(-10000);
  const geometry=new THREE.BufferGeometry();
  for(const [name,data,size] of [['position',positions,3],['life',lives,1],['size',sizes,1]])
    geometry.setAttribute(name,new THREE.BufferAttribute(data,size).setUsage(THREE.DynamicDrawUsage));
  const snow=new THREE.Points(geometry,new THREE.ShaderMaterial({
    transparent:true,depthWrite:false,
    uniforms:THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),fog:true,
    vertexShader:`attribute float life;attribute float size;varying float vLife;
      #include <fog_pars_vertex>
      void main(){vLife=life;vec4 mvPosition=modelViewMatrix*vec4(position,1.0);
      gl_PointSize=min(52.0,size*650.0/max(1.0,-mvPosition.z));gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`varying float vLife;
      #include <fog_pars_fragment>
      void main(){float d=length(gl_PointCoord-.5);float a=exp(-d*d*18.)*smoothstep(.5,.34,d)*vLife*.5;
      gl_FragColor=vec4(.85,.92,1.,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
      }`,
  }));
  snow.name='Powder / airborne crystals and mist'; snow.frustumCulled=false; scene.add(snow);
  // Three strips per ski: blue compressed groove flanked by small white berms.
  const segments=1024, verticesPerSegment=36, trailChunks=[];
  const trailMaterial=new THREE.MeshBasicMaterial({
    vertexColors:true,transparent:true,opacity:.42,depthWrite:false,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
  });
  const craters=[];
  const craterMaterial=new THREE.MeshBasicMaterial({
    vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,
    polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
  });
  function newTrailChunk() {
    const positions=new Float32Array(segments*verticesPerSegment*3);
    const colors=new Float32Array(positions.length), geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0,0);
    const mesh=new THREE.Mesh(geometry,trailMaterial);
    mesh.name='Ski tracks / compressed grooves and powder edges';mesh.frustumCulled=false;scene.add(mesh);
    const chunk={mesh,geometry,positions,colors,count:0};trailChunks.push(chunk);return chunk;
  }
  // Append chunks as the skier travels: early tracks never get overwritten.
  // Completed chunks are static GPU buffers; restart disposes the whole run.
  let trail=newTrailChunk();
  let cursor=0, previous=null, eventId=0, sprayCarry=0;
  function emit(s,n,burst=false) {
    const heading=s.heading || 0, rightX=Math.cos(heading), rightS=Math.sin(heading);
    for(let i=0;i<n;i++) {
      const id=cursor++%count;
      const side=!burst && Math.abs(s.steer)>.12 && Math.random()<.8 ? -Math.sign(s.steer) : Math.random()<.5?-1:1;
      const launch=snowLaunch(s,side,burst);
      const x=s.x+rightX*side*.32+Math.sin(heading)*.6;
      const z=-s.s-rightS*side*.32+Math.cos(heading)*.6;
      particles[id]={...launch,x,y:Math.max(s.y,groundHeight(x,-z))+.12,z,
        duration:launch.life,initialSize:launch.size,settled:false};
    }
  }
  function segment(from,to,s) {
    if(trail.count===segments) {
      trail.geometry.computeBoundingSphere();trail.mesh.frustumCulled=true;
      trail=newTrailChunk();
    }
    let k=trail.count*verticesPerSegment*3;
    const start=k;
    const pressure=landingPowderPressure(s);
    const halfWidth=.045+Math.abs(s.steer || 0)*.04+(s.braking ? .025 : 0)+(s.landingSkid || 0)*.1+pressure*.23;
    const bermWidth=.042+pressure*.14;
    for(const side of [-1,1]) for(const strip of [-1,0,1]) {
      const lower=strip===-1 ? -halfWidth-bermWidth : strip===0 ? -halfWidth : halfWidth;
      const upper=strip===-1 ? -halfWidth : strip===0 ? halfWidth : halfWidth+bermWidth;
      const point=(state,w)=>{
        const x=state.x+Math.cos(state.heading)*(side*.32+w);
        const z=state.s+Math.sin(state.heading)*(side*.32+w);
        return [x,groundHeight(x,z)+(strip===0 ? .025 : .047+pressure*.07),-z];
      };
      const a=point(from,lower),b=point(from,upper),c=point(to,lower),d=point(to,upper);
      const color=strip===0?[.36,.51,.63]:[.91,.96,1.];
      for(const v of [a,b,c,b,d,c]) for(let axis=0;axis<3;axis++) {
        trail.positions[k]=v[axis]; trail.colors[k++]=color[axis];
      }
    }
    trail.count++;
    trail.geometry.setDrawRange(0,trail.count*verticesPerSegment);
    for(const name of ['position','color']) {
      trail.geometry.attributes[name].addUpdateRange(start,k-start);
      trail.geometry.attributes[name].needsUpdate=true;
    }
  }
  function track(s) {
    const now={x:s.x,s:s.s,heading:s.heading || 0};
    if(!previous) { previous=now;return; }
    const distance=Math.hypot(now.x-previous.x,now.s-previous.s);
    if(distance>6) {previous=now;return;}
    if(distance<.24)return;
    const steps=Math.ceil(distance/.65);
    const angle=Math.atan2(Math.sin(now.heading-previous.heading),Math.cos(now.heading-previous.heading));
    let from=previous;
    for(let i=1;i<=steps;i++) {
      const t=i/steps,to={x:previous.x+(now.x-previous.x)*t,s:previous.s+(now.s-previous.s)*t,heading:previous.heading+angle*t};
      segment(from,to,s);from=to;
    }
    previous=now;
  }
  return {
    reset() {
      previous=null;sprayCarry=0;eventId=0;
      for(const chunk of trailChunks){scene.remove(chunk.mesh);chunk.geometry.dispose();}
      trailChunks.length=0;trail=newTrailChunk();particles.forEach(p=>p.life=0);
      for(const crater of craters){scene.remove(crater);crater.geometry.dispose();}
      craters.length=0;
      positions.fill(-10000);lives.fill(0);
      geometry.attributes.position.needsUpdate=true;geometry.attributes.life.needsUpdate=true;
    },
    update(s,dt) {
      if(s.paused || s.finished || s.awaitingStart || dt<=0)return;
      if(s.event!==eventId) {
        eventId=s.event;
        if(s.eventType==='land') {
          const impact=s.landingImpact;
          // The physics snapshot keeps the crater at touchdown even when
          // several simulation steps run before the next rendered frame.
          const touchdown=impact ? {...s,x:impact.x,s:impact.s,y:groundHeight(impact.x,impact.s),heading:impact.heading} : s;
          emit(touchdown,landingSprayCount(s),true);
          previous=null;
          if(impact?.strength>.04) {
            const crater=createLandingCrater(impact,craterMaterial);
            scene.add(crater);craters.push(crater);
            previous={x:impact.x,s:impact.s,heading:impact.heading};
          }
        }
        if(s.eventType==='bail' && !s.airborne)emit(s,95,true);
      }
      if(!s.airborne && !s.railing && !(s.bailTimer>0)) {
        sprayCarry+=snowSprayRate(s)*dt;
        const n=Math.floor(sprayCarry);if(n) {emit(s,n);sprayCarry-=n;}
        if(s.speed>.05)track(s);else previous=null;
      } else {previous=null;sprayCarry=0;}
      for(let i=0;i<count;i++) {
        const p=particles[i];
        if(p.life>0) {
          if(p.settled)p.life-=dt;else advanceSnow(p,dt,groundHeight);
          positions[i*3]=p.x;positions[i*3+1]=p.y;positions[i*3+2]=p.z;
          lives[i]=clamp(p.life/.25,0,1)*Math.min(1,(p.duration-p.life)*18);
          sizes[i]=p.initialSize*(1+(1-p.life/p.duration)*(p.drag>1?1.3:.1));
        } else {positions[i*3+1]=-10000;lives[i]=0;}
      }
      for(const name of ['position','life','size'])geometry.attributes[name].needsUpdate=true;
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
        active && !s.airborne ? (s.railing ? .16 : 0.08 + Math.abs(s.steer) * 0.14) : 0,
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
