/* Smooth aerial elevation and biome margins. Rendering only; terrain rules stay on cells. */
(function(root){
 'use strict';
 const size=512,pathCache=new WeakMap();let heights=null;
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 function heightField(hash,noise){
  if(heights)return heights;
  const peaks=[];
  // Broad, overlapping massifs have curved shoulders, rather than a graph of straight ridges.
  for(let y=0;y<3;y++)for(let x=0;x<4;x++){
   const n=y*4+x,angle=-.65+(hash(n,81)-.5)*1.1;
   const p={x:(x+.2+hash(n,82)*.65)*128,y:(y+.2+hash(n,83)*.65)*size/3,ca:Math.cos(angle),sa:Math.sin(angle),major:85+hash(n,84)*55,minor:13+hash(n,85)*18,peak:.48+hash(n,86)*.50};
   for(let oy=-1;oy<=1;oy++)for(let ox=-1;ox<=1;ox++)peaks.push({...p,x:p.x+ox*size,y:p.y+oy*size});
  }
  const field=new Float32Array(size*size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const warpX=(noise(x/64+3,y/64+7,8)-.5)*18,warpY=(noise(x/64+9,y/64+5,8)-.5)*18;let sum=0;
   for(const p of peaks){const dx=x+warpX-p.x,dy=y+warpY-p.y,u=(dx*p.ca+dy*p.sa)/p.major,v=(-dx*p.sa+dy*p.ca)/p.minor,d2=u*u+v*v;if(d2<24)sum+=p.peak*Math.exp(-.5*d2);}
   const erosion=(noise(x/16+5,y/16+1,32)-.5)*.038+(noise(x/8,y/8,64)-.5)*.012;
   field[y*size+x]=Math.max(0,Math.min(1,(1-Math.exp(-sum*1.3))**1.4+erosion));
  }
  heights=field;return heights;
 }
 function texture(type,hash,noise){
  const field=heightField(hash,noise),cv=document.createElement('canvas');cv.width=cv.height=size;
  const c=cv.getContext('2d'),im=c.createImageData(size,size),hill=type==='hill',at=(x,y)=>field[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const h=at(x,y),dx=(at(x+2,y)-at(x-2,y))*(hill?9:28),dy=(at(x,y+2)-at(x,y-2))*(hill?9:28);
   const light=(-dx*.52-dy*.67+1)/Math.sqrt((dx*dx+dy*dy+1)*1.72);
   const rock=smooth((h-.20)/.55)*(hill?.12:1),valley=Math.max(0,(at(x+8,y)+at(x-8,y)+at(x,y+8)+at(x,y-8))*.25-h);
   const shade=(light-.73)*(hill?55:100)+(h-.5)*12-valley*18+(hash(x+19,y+7)-.5)*2.4;
   const low=hill?[123,133,98]:[119,129,125],high=hill?[163,159,140]:[163,171,168],i=(y*size+x)*4;
   for(let ch=0;ch<3;ch++)im.data[i+ch]=Math.max(0,Math.min(255,low[ch]+(high[ch]-low[ch])*rock+shade));
   im.data[i+3]=255;
  }
  c.putImageData(im,0,0);return cv;
 }
 function blendMargins(ctx,geometry,sp,trace){
  let cached=pathCache.get(geometry);
  if(!cached||cached.sp!==sp){
   cached={sp,paths:{}};
   for(const type of ['hill','mountain']){const loops=geometry.types.get(type);if(!loops)continue;const path=new Path2D(),proxy={beginPath(){}};for(const method of ['moveTo','lineTo','quadraticCurveTo','closePath'])proxy[method]=(...args)=>path[method](...args);trace(proxy,loops,sp);cached.paths[type]=path;}
   pathCache.set(geometry,cached);
  }
  for(const type of ['hill','mountain']){
   const path=cached.paths[type];if(!path)continue;
   // Continuous rounded contour bands avoid individual square transition stamps.
   ctx.save();ctx.clip(path);ctx.lineJoin='round';ctx.strokeStyle=type==='mountain'?'#7d896c':'#77835c';
   for(let i=18;i>=1;i--){ctx.lineWidth=sp*(type==='mountain'?.78:.8)*i/18;ctx.globalAlpha=.02+.18*(1-i/18);ctx.stroke(path);}
   ctx.restore();
  }
 }
 root.WodHdRelief=Object.freeze({texture,blendMargins});
})(globalThis);
