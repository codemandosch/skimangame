// Deterministic placement against the mountain before its supporting snow ridges.
export function createLogLayout({groundHeight,gradientAt,FEATURES,TREES,radiusAt,lift,reserved=()=>false}) {
  const LOGS=[];
  function place(x,s,dx,ds,length,kind,name) {
    for (let u = -20; u <= length + 12; u += 2) if (reserved(x + dx*u, s + ds*u)) return false;
    if(LOGS.some(log=>Math.hypot(log.x-x,log.s-s)<80))return false;
    const y=groundHeight(x,s)+(kind==='fallen' ? 1.05 : .08);
    let grade=kind==='kicker'?.22:-2;
    for(let u=.1;u<=length+.1;u+=.1) {
      const sample=Math.min(u,length);
      grade=Math.max(grade,(groundHeight(x+dx*sample,s+ds*sample)+.04-y)/sample);
    }
    // Let the trunk emerge from its buried entry so the bark stays visible above
    // the snow instead of reducing a shallow log to a thin brown seam.
    if(kind==='fallen')grade+=.028;
    if(kind==='kicker' ? grade>.42 : grade>-.08 || grade<-.95)return false;
    let maxGap=0;
    for(let u=0;u<=length;u+=.5) {
      const px=x+dx*u,ps=s+ds*u,gap=y+grade*u-groundHeight(px,ps);
      maxGap=Math.max(maxGap,gap);
      if(gap<-.02 || (kind==='fallen' && gap>3.2) || (kind==='kicker' && u<4 && gap>1.2))return false;
      // Terrain edits can move a trunk onto a cross-slope. Its supporting ridge
      // only raises snow, so reject sites whose uphill side buries ski contact.
      if(kind==='fallen' && u>=4 && u<=length-3)for(const side of [-1,1]) {
        const lateral=side*(.58+(LOGS.length%4)*.055+1);
        if(groundHeight(px+ds*lateral,ps-dx*lateral)>y+grade*u+.15)return false;
      }
      const rx=px-lift.top.x,rs=ps-lift.top.s;
      const along=rx*lift.dx+rs*lift.ds,across=rx*lift.ds-rs*lift.dx;
      if(along>-20 && along<lift.length+20 && Math.abs(across)<18)return false;
      if(TREES.some(t=>Math.hypot(t.x-px,t.s-ps)<4))return false;
    }
    if(kind==='kicker' && maxGap<3)return false;
    if(kind==='fallen')for(let u=-20;u<0;u+=2) {
      // Avoid a cliff immediately before the ridge that would launch over its entry.
      if(groundHeight(x+dx*u,s+ds*u)>y+grade*u+.15)return false;
    }
    // The last few metres of snow must feed into the buried butt smoothly.
    const approach=gradientAt(x-dx*2,s-ds*2);
    if(Math.abs(approach.x*dx+approach.s*ds-grade)>.65)return false;
    LOGS.push({id:LOGS.length,x,s,y,dx,ds,length,grade,kind,name,
      heading:-Math.atan2(dx,ds),radius:.58+(LOGS.length%4)*.055});
    return true;
  }
  // Five ledge logs per face. Search real terrain crests, including their shoulders,
  // rather than floating a prop above an arbitrary feature marker.
  for(let sector=0;sector<6;sector++) {
    let count=0;
    const features=FEATURES.filter(f=>!f.lift && Math.hypot(f.x,f.s)>300 && Math.hypot(f.x,f.s)<1850 &&
      Math.floor(((f.angle*180/Math.PI+390)%360)/60)===sector);
    for(const f of features) {
      if(count>=5)break;
      let placed=false;
      for(const side of [-.45,.45,0]) {
        for(let offset=-18;offset<=3;offset+=1) {
          if(place(f.x+f.dx*offset+f.ds*f.width*side,f.s+f.ds*offset-f.dx*f.width*side,
            f.dx,f.ds,30+count*2,'kicker',`${f.name} LOG`)) {placed=true;break;}
        }
        if(placed)break;
      }
      if(placed)count++;
    }
  }
  let seed=71843;
  const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let sector=0;sector<6;sector++) {
    let count=0;
    for(let attempt=0;attempt<2400 && count<10;attempt++) {
      const a=(sector*60-24+random()*48)*Math.PI/180;
      const r=radiusAt(a)*(.48+random()*.35),x=Math.sin(a)*r,s=Math.cos(a)*r;
      const g=gradientAt(x,s),heading=Math.atan2(-g.x,-g.s)+(random()-.5)*.55;
      if(place(x,s,Math.sin(heading),Math.cos(heading),38+random()*18,'fallen',`FALLEN TIMBER ${sector+1}.${count+1}`))count++;
    }
  }
  return LOGS;
}
