// Ground frame and foot clearance work in any heading, including traverses.
export function groundFrame(x,s,heading,heightAt) {
  const dx=-Math.sin(heading),ds=Math.cos(heading),rx=ds,rs=-dx;
  const forward=(heightAt(x+dx,s+ds)-heightAt(x-dx,s-ds))/2;
  const across=(heightAt(x+rx,s+rs)-heightAt(x-rx,s-rs))/2;
  const pitch=Math.atan(forward),roll=Math.atan(across*Math.cos(pitch));
  const cp=Math.cos(pitch),sp=Math.sin(pitch),cr=Math.cos(roll),sr=Math.sin(roll);
  let clearance=0;
  const y=heightAt(x,s);
  for(const u of [-.65,.65])for(const v of [-1.5,0,1.5]) {
    const localX=u*cr,localZ=u*sr*sp-v*cp;
    const wx=Math.cos(heading)*localX+Math.sin(heading)*localZ;
    const ws=Math.sin(heading)*localX-Math.cos(heading)*localZ;
    const wy=u*sr*cp+v*sp;
    clearance=Math.max(clearance,heightAt(x+wx,s+ws)-y-wy);
  }
  return {pitch,roll,clearance};
}
