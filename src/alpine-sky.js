import * as THREE from 'three';

// The sun disk and directional illumination share the same world-space heading.
export const SUN_DIRECTION = new THREE.Vector3(-90, 150, -80).normalize();
export function createAlpineSky(scene) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { sunDirection: { value: SUN_DIRECTION }, time: { value: 0 } },
    vertexShader: `varying vec3 ray;void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `
      varying vec3 ray;uniform vec3 sunDirection;uniform float time;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      void main(){
        vec3 d=normalize(ray);
        float h=max(d.y,0.0);
        vec3 sky=mix(vec3(.66,.79,.86),vec3(.105,.31,.51),pow(h,.45));
        float sun=max(dot(d,sunDirection),0.0);
        sky+=vec3(1.,.78,.47)*(pow(sun,14.)*.13+pow(sun,180.)*.5);
        sky=mix(sky,vec3(4.,3.6,2.7),smoothstep(.99989,.99996,sun));
        vec2 p=d.xz/max(.12,d.y)*vec2(1.6,5.)+vec2(time*.001,0.);
        float cloud=noise(p)*.55+noise(p*2.3)*.28+noise(p*5.7)*.17;
        float veil=smoothstep(.5,.78,cloud)*smoothstep(.04,.22,h)*(1.-smoothstep(.65,.95,h));
        sky=mix(sky,vec3(.88,.91,.92),veil*.54);
        gl_FragColor=vec4(sky,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8500,32,16),material);
  dome.name='Alpine sky / high cloud and sun'; scene.add(dome);
  return { update(state) {
    dome.position.set(state.x,state.y,-state.s);
    material.uniforms.time.value=state.time || 0;
  }};
}
