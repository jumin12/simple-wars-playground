'use strict';
function wodCampaignDifficultyCopy(key){
 const d=WOD_ROGUE_DIFF_PRESETS[key]||WOD_ROGUE_DIFF_PRESETS.normal;
 return `${d.label}: ${d.startPoints.toLocaleString()} opening requisition. Enemy opening forces, battle money and manpower ×${d.mult.toFixed(2)}. Battle rewards ×${d.rewardMult.toFixed(2)}. After turn 2, eligible turns have a ${Math.round(d.counterChance*100)}% counterattack chance; ${Math.round(d.blockChance*100)}% of these can block your advance. Defense battles always last 10 minutes. Unit combat stats follow the same rules on every difficulty.`;
}
function wodCampaignPaintAtlas(ctx,c,W,H,cells,nodes,edges,cw,ch){
 const palettes={water:[24,66,80],grass:[115,128,90],forest:[57,86,65],hill:[147,141,112],mountain:[175,173,153],sand:[193,172,124],swamp:[80,111,99],urban:[155,153,135]};
 const heights={water:-.2,grass:.1,forest:.18,hill:.58,mountain:1,sand:.04,swamp:0,urban:.12};
 const im=ctx.createImageData(cw,ch),data=im.data,at=(x,y)=>cells[Math.max(0,Math.min(H-1,y))*W+Math.max(0,Math.min(W-1,x))]||'grass';
 for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){
  const gx=x/cw*(W-1),gy=y/ch*(H-1),ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
  const ts=[at(ix,iy),at(ix+1,iy),at(ix,iy+1),at(ix+1,iy+1)],ws=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
  const noise=((Math.imul(x+17,374761393)^Math.imul(y+71,668265263))>>>0)%101/100-.5;
  const elev=t=>heights[t]??.1,light=1+(elev(at(ix-1,iy))-elev(at(ix+1,iy)))*.16+(elev(at(ix,iy-1))-elev(at(ix,iy+1)))*.1+noise*.035;
  let water=0;for(let j=0;j<4;j++)if(ts[j]==='water')water+=ws[j];
  const edge=Math.max(0,1-Math.abs(water-.5)*2),vignette=1-Math.min(.16,Math.hypot(x/cw-.5,y/ch-.5)*.15),k=(y*cw+x)*4;
  for(let channel=0;channel<3;channel++){let value=0;for(let j=0;j<4;j++)value+=(palettes[ts[j]]||palettes.grass)[channel]*ws[j];data[k+channel]=Math.max(0,Math.min(255,value*light*vignette+edge*(channel===2?13:19)));}data[k+3]=255;
 }
 ctx.putImageData(im,0,0);
 // Quiet survey grid and hand-drawn relief contours, cached with the terrain.
 ctx.save();ctx.strokeStyle='#d8d0a614';ctx.lineWidth=.6;
 for(let x=0;x<cw;x+=cw/12){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,ch);ctx.stroke();}
 for(let y=0;y<ch;y+=ch/8){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(cw,y);ctx.stroke();}
 for(let y=2;y<H-2;y+=3)for(let x=2;x<W-2;x+=3){
  const t=at(x,y),px=x/W*cw,py=y/H*ch,hash=((x*73856093)^(y*19349663))>>>0;
  if(t==='mountain'||t==='hill'){
   const size=t==='mountain'?9:5;ctx.strokeStyle='#eee8ce47';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px-size,py+size*.5);ctx.lineTo(px-1,py-size*.65);ctx.lineTo(px+size*.7,py+size*.4);ctx.stroke();ctx.strokeStyle='#35413a70';ctx.beginPath();ctx.moveTo(px,py-size*.5);ctx.lineTo(px+2,py+size*.8);ctx.stroke();
  }else if(t==='forest'&&hash%3===0){ctx.fillStyle='#283e3560';ctx.beginPath();ctx.arc(px,py,1.3,0,Math.PI*2);ctx.fill();}
  else if(t==='water'&&hash%11===0){ctx.strokeStyle='#b5dddc18';ctx.beginPath();ctx.moveTo(px-4,py);ctx.quadraticCurveTo(px,py-2,px+4,py);ctx.stroke();}
 }
 // Voronoi provinces give every region a legible footprint on the atlas.
 const points=nodes.map(n=>({n,x:n.x*cw,y:n.y*ch}));
 for(const a of points){
  let poly=[{x:0,y:0},{x:cw,y:0},{x:cw,y:ch},{x:0,y:ch}];
  for(const b of points){if(a===b)continue;const nx=b.x-a.x,ny=b.y-a.y,limit=(b.x*b.x+b.y*b.y-a.x*a.x-a.y*a.y)/2,out=[];
   for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=p.x*nx+p.y*ny-limit,dq=q.x*nx+q.y*ny-limit;if(dp<=0)out.push(p);if((dp<=0)!==(dq<=0)){const f=dp/(dp-dq);out.push({x:p.x+(q.x-p.x)*f,y:p.y+(q.y-p.y)*f});}}poly=out;if(!poly.length)break;
  }
  if(!poly.length)continue;const own=c?.nodesState[a.n.id]?.owner||(a.n.hq?'player':'enemy');
  ctx.beginPath();poly.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.fillStyle=own==='player'?'#5ac5a11a':'#ba796712';ctx.fill();ctx.strokeStyle='#e9dfb92b';ctx.lineWidth=1;ctx.setLineDash([2,5]);ctx.stroke();
 }
 ctx.setLineDash([]);
 for(const [idA,idB]of edges){const a=points.find(p=>p.n.id===idA),b=points.find(p=>p.n.id===idB);if(!a||!b)continue;
  const ownA=c?.nodesState[idA]?.owner||(a.n.hq?'player':'enemy'),ownB=c?.nodesState[idB]?.owner||(b.n.hq?'player':'enemy');
  const front=ownA!==ownB,bend=((idA+idB)%2?1:-1)*14,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
  ctx.lineWidth=front?3:2;ctx.strokeStyle=front?'#e7c57cbb':'#eee3b86b';ctx.setLineDash(front?[]:[5,5]);ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(mx+bend,my-bend,b.x,b.y);ctx.stroke();
 }
 ctx.setLineDash([]);const shade=ctx.createRadialGradient(cw*.5,ch*.45,ch*.25,cw*.5,ch*.5,cw*.7);shade.addColorStop(0,'#07141b00');shade.addColorStop(1,'#07141b9c');ctx.fillStyle=shade;ctx.fillRect(0,0,cw,ch);
 ctx.fillStyle='#e5dcc09c';ctx.font='600 10px sans-serif';ctx.textAlign='left';ctx.fillText('THE ASHEN FRONT  /  THEATER OF OPERATIONS',18,23);
 ctx.textAlign='right';ctx.fillText('N',cw-25,30);ctx.strokeStyle='#e5dcc077';ctx.beginPath();ctx.moveTo(cw-29,51);ctx.lineTo(cw-25,35);ctx.lineTo(cw-21,51);ctx.stroke();ctx.restore();
}
function wodCampaignPaintMarkers(ctx,c,nodes,cw,ch){
 const cv=document.getElementById('wodCampMapCanvas'),scale=Math.min(2.25,Math.max(1,cw/(cv?.clientWidth||cw))),labels=[];
 for(const n of nodes){
  const x=n.x*cw,y=n.y*ch,own=c?.nodesState[n.id]?.owner||(n.hq?'player':'enemy'),playable=!!c&&wodRogueNodePlayable(n.id),selected=n.id===_wodRogueSelectedNode,alert=!!c?.alerts[n.id],r=(n.capital||n.hq?11:8)*scale;
  ctx.save();ctx.shadowColor='#000b';ctx.shadowBlur=7;ctx.shadowOffsetY=3;
  ctx.fillStyle=own==='player'?'#173f39':'#4a3031';ctx.strokeStyle=selected?'#fff1bc':playable?'#e7bf71':'#acaaa0';ctx.lineWidth=(selected?2.8:1.4)*scale;
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  if(selected||alert){ctx.beginPath();ctx.arc(x,y,r+5*scale,0,Math.PI*2);ctx.strokeStyle=alert?'#f4a47b':'#f2cd7e9c';ctx.lineWidth=1.3*scale;ctx.stroke();}
  ctx.fillStyle=own==='player'?'#9cdbc3':'#e8b3a0';ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1.4*scale;
  if(n.capital){ctx.font=`${12*scale}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('★',x,y+.5);}
  else if(n.hq){ctx.beginPath();ctx.moveTo(x-2*scale,y+5*scale);ctx.lineTo(x-2*scale,y-5*scale);ctx.lineTo(x+4*scale,y-3*scale);ctx.lineTo(x-2*scale,y);ctx.stroke();}
  else if(n.industry){ctx.fillRect(x-4*scale,y-2*scale,8*scale,6*scale);ctx.fillRect(x-3*scale,y-5*scale,2*scale,4*scale);}
  else{ctx.beginPath();ctx.arc(x,y,2.3*scale,0,Math.PI*2);ctx.fill();}
  if(scale<1.5||selected||playable||n.hq||n.capital){
   ctx.font=`${selected?'700':'500'} ${11*scale}px sans-serif`;const width=ctx.measureText(n.name).width+12*scale,height=19*scale;
   let ly=y+r+5*scale,lx=Math.max(4,Math.min(cw-width-4,x-width/2));
   for(let tries=0;tries<3&&labels.some(b=>lx<b.x+b.w&&lx+width>b.x&&ly<b.y+b.h&&ly+height>b.y);tries++)ly-=height+r;
   ly=Math.max(28,Math.min(ch-height-5,ly));ctx.fillStyle=selected?'#17302cef':'#0d2027dd';ctx.beginPath();ctx.roundRect(lx,ly,width,height,4*scale);ctx.fill();ctx.fillStyle=selected?'#ffe2a0':'#ede9d8';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n.name,lx+width/2,ly+height/2);labels.push({x:lx,y:ly,w:width,h:height});
  }ctx.restore();
 }
}
function wodCampaignMapPoint(event,canvas){
 const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/canvas.width,r.height/canvas.height),left=r.left+(r.width-canvas.width*scale)/2,top=r.top+(r.height-canvas.height*scale)/2;
 return{x:(event.clientX-left)/scale,y:(event.clientY-top)/scale};
}
