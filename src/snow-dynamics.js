const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// World coordinates: travel is (-sin heading, -cos heading) in X/Z.
export function snowLaunch(state, side, burst, random = Math.random) {
  const heading=state.heading || 0, rightX=Math.cos(heading), rightZ=-Math.sin(heading);
  const speed=clamp(state.speed || 0,0,56), carve=Math.abs(state.steer || 0)+(state.landingSkid || 0)*1.5;
  const impact=burst ? state.landingImpact?.strength || 0 : 0;
  const outward=(burst ? (1.4+random()*4.5)*(1+impact*.85) : .45+random()*(1+carve*3)) * side;
  const back=burst ? .4+random()*2.4+(random()-.5)*impact*7 : .4+random()*1.1;
  const fine=random()>.28;
  return {
    vx:(state.vx || 0)*.22 + rightX*outward + Math.sin(heading)*back,
    vy:(burst ? (1.5+random()*4)*(1+impact*.65) : .55+random()*(1.3+carve)) + speed*.012,
    vz:-(state.vs ?? speed*Math.cos(heading))*.22 + rightZ*outward + Math.cos(heading)*back,
    life:(fine ? .9+random()*.8 : .45+random()*.4)*(1+impact*.3),
    size:(fine ? .16+random()*.28 : .045+random()*.085)*(1+impact*.4),
    drag:fine ? 2.2 : .55,
  };
}

// Closed-form drag + gravity keeps particle motion stable across frame rates.
export function advanceSnow(p, dt, heightAt) {
  const drag=p.drag, decay=Math.exp(-drag*dt), integral=(1-decay)/drag;
  const terminalY=-9.81/drag;
  p.x+=.65*dt+(p.vx-.65)*integral;
  p.y+=terminalY*dt+(p.vy-terminalY)*integral;
  p.z+=.18*dt+(p.vz-.18)*integral;
  p.vx=.65+(p.vx-.65)*decay;
  p.vy=terminalY+(p.vy-terminalY)*decay;
  p.vz=.18+(p.vz-.18)*decay;
  p.life-=dt;
  const ground=heightAt(p.x,-p.z)+.025;
  if(p.y<=ground) {
    // Deposited powder stays on the surface, rather than falling through it.
    p.y=ground; p.vx=0; p.vy=0; p.vz=0;
    p.life=Math.min(p.life,.12); p.settled=true;
  }
  return p;
}
