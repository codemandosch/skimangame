import * as THREE from 'three';

export function createSnowMaterial(graniteTexture, natural = true) {
  const material = new THREE.MeshStandardMaterial({ color: '#f5f9fc', roughness: .87, vertexColors: true });
  material.onBeforeCompile = shader => {
    shader.uniforms.graniteTexture = { value: graniteTexture };
    shader.uniforms.naturalSnow = { value: natural ? 1 : 0 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute float rockAmount;
      varying float vRock;
      varying vec3 vRockNormal;
      varying vec3 vSnowWorld;`);
    shader.vertexShader = shader.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vSnowWorld=(modelMatrix*vec4(transformed,1.0)).xyz;
      vRock=rockAmount; vRockNormal=normalize(mat3(modelMatrix)*normal);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vSnowWorld;
      varying float vRock;
      varying vec3 vRockNormal;
      uniform sampler2D graniteTexture;
      uniform float naturalSnow;
      float hashSnow(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float snowNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hashSnow(i),hashSnow(i+vec2(1,0)),f.x),mix(hashSnow(i+vec2(0,1)),hashSnow(i+vec2(1,1)),f.x),f.y);}`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 p=vSnowWorld.xz;
      float distanceFade=1.0-smoothstep(35.0,180.0,length(vViewPosition));
      float drift=snowNoise(p*.023);
      float windPhase=dot(p,vec2(.8,.6))*2.4+snowNoise(p*.16)*5.0;
      float ripple=sin(windPhase)*(.5+.5*sin(windPhase*.47));
      float windDetail=ripple*(1.0-smoothstep(.4,2.0,fwidth(windPhase)));
      float grain=snowNoise(p*7.0);
      float groomPhase=p.x*24.0;
      float groom=sin(groomPhase)*(1.0-smoothstep(.4,2.0,fwidth(groomPhase)));
      float relief=mix(groom*.006,windDetail*.038,naturalSnow);
      vec3 weights=pow(abs(vRockNormal),vec3(4.0));weights/=max(dot(weights,vec3(1.0)),.001);
      vec3 cliff=texture2D(graniteTexture,vSnowWorld.yz*.09).rgb*weights.x+texture2D(graniteTexture,p*.09).rgb*weights.y+texture2D(graniteTexture,vSnowWorld.xy*.09).rgb*weights.z;
      vec3 powder=mix(vec3(.86,.92,.98),vec3(1.0,.995,.98),drift);
      diffuseColor.rgb=mix(diffuseColor.rgb*powder*(.98+relief*.3+(grain-.5)*.035*distanceFade),cliff*.85,vRock);
      float terrainBump=mix((relief+(grain-.5)*.008)*distanceFade,dot(cliff,vec3(.333))*.28,vRock);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor=mix(.76+drift*.18,.96,vRock);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);
      vec3 rx=cross(sy,normal),ry=cross(normal,sx);
      float determinant=dot(sx,rx)*faceDirection;
      vec3 gradient=sign(determinant)*(dFdx(terrainBump)*rx+dFdy(terrainBump)*ry);
      normal=normalize(abs(determinant)*normal-gradient);`);
  };
  material.customProgramCacheKey = () => 'alpine-snow-v2';
  return material;
}
