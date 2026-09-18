import { groundHeight, gradientAt, SUMMIT_HEIGHT, BASE_HEIGHT, RADIUS, areaAt, AREAS } from './blackridge.js';
export function createMountainMap(canvas) {
  const size=320,extent=RADIUS*1.18;
  canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d');
  const background=document.createElement('canvas');background.width=background.height=size;
  const bg=background.getContext('2d'),image=bg.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const wx=(x/size*2-1)*extent,ws=(1-y/size*2)*extent;
    const h=groundHeight(wx,ws),g=gradientAt(wx,ws,10);
    const altitude=Math.max(0,Math.min(1,(h-BASE_HEIGHT)/(SUMMIT_HEIGHT-BASE_HEIGHT)));
    const shade=Math.max(.35,Math.min(1,(1-g.x*.4-g.s*.3)/Math.hypot(1,g.x,g.s)));
    const contour=h>100&&h%100<10?.68:1;
    const i=(y*size+x)*4;
    image.data[i]=(35+altitude*139)*(.62+shade*.38)*contour;
    image.data[i+1]=(66+altitude*135)*(.62+shade*.38)*contour;
    image.data[i+2]=(80+altitude*137)*(.62+shade*.38)*contour;
    image.data[i+3]=245;
  }
  bg.putImageData(image,0,0);
  bg.font='bold 13px Arial';bg.textAlign='center';bg.fillStyle='#f1f4e8';
  bg.fillText('N',size/2,17);bg.fillText('S',size/2,size-8);bg.fillText('W',12,size/2);bg.fillText('E',size-12,size/2);
  bg.beginPath();bg.arc(size/2,size/2,3,0,Math.PI*2);bg.fill();
  return {update(state){
    ctx.clearRect(0,0,size,size);ctx.drawImage(background,0,0);
    const x=(state.x/extent+1)*size/2,y=(1-state.s/extent)*size/2;
    ctx.save();ctx.translate(x,y);ctx.rotate(-state.heading);
    ctx.fillStyle='#e5ff64';ctx.strokeStyle='#102533';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(6,7);ctx.lineTo(0,4);ctx.lineTo(-6,7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    canvas.setAttribute('aria-label',`Mountain map: ${areaAt(state.x,state.s).name}, ${Math.round(state.y-BASE_HEIGHT)} metres above base`);
  }};
}
