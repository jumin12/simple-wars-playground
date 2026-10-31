/* Procedural total-conversion art. Geometry is shared with the real battlefield. */
(function(root){
 'use strict';
 const packs={
  default:{name:'Default',tag:'THE CLASSIC BATTLEFIELD',surface:'#1563a8',paper:'#eee9dc',ink:'#192f32',muted:'#a7bc7a',water:'#1563a8',grass:'#4ea053',forest:'#2a6b3c',sand:'#c9923a',hill:'#8b6d4e',mountain:'#8a7d6c',urban:'#a1a49a',swamp:'#457a55',blue:'#2ecc71',red:'#e74c3c'},
  atlas_hd:{name:'Atlas HD',tag:'AERIAL COMMAND',surface:'#284d60',paper:'#c4bba2',ink:'#d8d5b8',muted:'#94ab94',water:'#284d60',grass:'#747f53',forest:'#344c35',sand:'#b4aa86',hill:'#8c896d',mountain:'#79796f',urban:'#9c9787',swamp:'#4a6655',blue:'#70ac9e',red:'#cd9279'},
  chalkboard:{name:'Chalkboard',tag:'THE WAR ROOM',surface:'#203d38',paper:'#29473e',ink:'#f0edce',muted:'#aac2ac',water:'#203d38',grass:'#43654c',forest:'#2f523f',sand:'#6b6850',hill:'#5b6653',mountain:'#62665c',urban:'#5a6d60',swamp:'#345653',blue:'#99d7e3',red:'#f4ac97'},
  whiteboard:{name:'Whiteboard',tag:'DRAW UP A PLAN',surface:'#f1f0e9',paper:'#f7f7ef',ink:'#273d4e',muted:'#809795',water:'#f1f0e9',grass:'#e7eedb',forest:'#d5e3ce',sand:'#f3e7ce',hill:'#e6e1d1',mountain:'#dedfdc',urban:'#e0e5df',swamp:'#dbe8e2',blue:'#277da6',red:'#c9534c'}
 };
 const types=['light','motorized','mountaineer','marine','heavy','ship','transport','supply','convoy'];
 const labels={light:'Infantry',motorized:'Motorized',mountaineer:'Mountaineers',marine:'Marines',heavy:'Armor',ship:'Warship',transport:'Transport',supply:'Supply ship',convoy:'Convoy'};
 const textures=new Map(),inks=new Map();
 const hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
 const palette=id=>packs[id]||packs.chalkboard;
 function chalkInk(color){
  if(typeof color!=='string')return color;if(inks.has(color))return inks.get(color);
  const cv=document.createElement('canvas');cv.width=cv.height=64;const g=cv.getContext('2d');g.fillStyle=color;g.fillRect(0,0,64,64);g.globalCompositeOperation='destination-out';
  for(let i=0;i<700;i++){g.fillStyle='rgba(0,0,0,'+(.15+hash(i,9)*.65)+')';g.fillRect(hash(i,1)*64,hash(i,2)*64,.3+hash(i,3)*.8,.4+hash(i,4)*.7);}
  const pattern=g.createPattern(cv,'repeat');if(inks.size>64)inks.clear();inks.set(color,pattern);return pattern;
 }
 function stroke(c,id,path,color,width=1.5){
  const p=palette(id);c.save();c.lineCap='round';c.lineJoin='round';c.strokeStyle=id==='chalkboard'?chalkInk(color||p.ink):(color||p.ink);c.lineWidth=width;
  c.beginPath();path(c);c.stroke();
  if(id==='chalkboard'){
   c.globalAlpha*=.28;c.translate(.5,-.55);c.lineWidth=Math.max(.45,width*.38);c.beginPath();path(c);c.stroke();
  }else{
   c.globalAlpha*=.19;c.translate(.65,.35);c.lineWidth=width*.48;c.beginPath();path(c);c.stroke();
  }c.restore();
 }
 function line(c,id,pts,color,width){stroke(c,id,g=>{g.moveTo(...pts[0]);for(const p of pts.slice(1))g.lineTo(...p);},color,width);}
 function texture(id){
  if(textures.has(id))return textures.get(id);
  const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),p=palette(id);
  g.fillStyle=p.surface;g.fillRect(0,0,256,256);
  if(id==='chalkboard'){
   for(let n=0;n<1700;n++){const x=hash(n,1)*256,y=hash(n,2)*256;g.fillStyle=n%2?'rgba(239,244,213,.035)':'rgba(2,20,17,.045)';g.fillRect(x,y,hash(n,3)*2+.5,.8);}
   for(let n=0;n<15;n++){g.strokeStyle='rgba(224,233,207,.025)';g.lineWidth=8+hash(n,4)*15;g.beginPath();g.moveTo(-10,n*20);g.bezierCurveTo(70,n*20-12,190,n*20+17,266,n*20-3);g.stroke();}
  }else{
   const grad=g.createLinearGradient(0,0,256,256);grad.addColorStop(0,'#ffffff22');grad.addColorStop(.5,'#ffffff00');grad.addColorStop(1,'#7896a409');g.fillStyle=grad;g.fillRect(0,0,256,256);
   for(let n=0;n<20;n++){g.strokeStyle='rgba(73,109,116,.018)';g.lineWidth=1;g.beginPath();g.moveTo(0,n*15);g.lineTo(256,n*15+4);g.stroke();}
  }textures.set(id,c);return c;
 }
 function terrainMark(c,id,type,x,y,r,seed){
  if(id==='whiteboard'){markerTerrain(c,type,x,y,r,seed);return;}
  const p=palette(id),ink=id==='chalkboard'?p.muted:({forest:'#587a57',sand:'#bd9a53',hill:'#91845e',mountain:'#6c797b',water:'#6f9fab',swamp:'#68928a'}[type]||p.muted);
  c.save();c.translate(x,y);c.globalAlpha*=id==='chalkboard'?.72:.67;
  if(type==='forest'){
   for(const [dx,dy,s]of [[-.38,.14,.65],[.32,.29,.62],[0,-.25,.8]])line(c,id,[[dx*r,(dy-.65*s)*r],[(dx-.37*s)*r,(dy+.22*s)*r],[(dx+.37*s)*r,(dy+.22*s)*r],[dx*r,(dy-.65*s)*r]],ink,r*.085);
   line(c,id,[[0,r*.02],[0,r*.55]],ink,r*.07);
  }else if(type==='mountain'||type==='hill'){
   if(type==='hill')stroke(c,id,g=>{g.moveTo(-r*.8,r*.3);g.quadraticCurveTo(-r*.22,-r*.65,r*.3,r*.13);g.quadraticCurveTo(r*.57,-r*.36,r*.94,r*.32);},ink,r*.085);
   else{line(c,id,[[-r*.95,r*.55],[-r*.22,-r*.7],[r*.27,r*.22],[r*.58,-r*.26],[r*.98,r*.55]],ink,r*.09);line(c,id,[[-r*.42,-r*.34],[-r*.21,-r*.14],[-r*.04,-r*.34]],ink,r*.065);line(c,id,[[-r*.22,-r*.7],[-r*.08,r*.3]],ink,r*.055);}
  }else if(type==='water'||type==='deep_water'){
   for(let i=0;i<2;i++)stroke(c,id,g=>{g.moveTo(-r*.8,(i-.5)*r*.38);g.bezierCurveTo(-r*.35,(i-.5)*r*.38-r*.2,r*.3,(i-.5)*r*.38+r*.2,r*.8,(i-.5)*r*.38);},ink,r*.055);
  }else if(type==='urban'){
   for(const [dx,dy]of [[-.45,0],[.2,-.23],[.1,.43]]){line(c,id,[[(dx-.18)*r,(dy+.16)*r],[(dx-.18)*r,(dy-.18)*r],[(dx+.18)*r,(dy-.18)*r],[(dx+.18)*r,(dy+.16)*r],[(dx-.18)*r,(dy+.16)*r]],ink,r*.065);}
  }else if(type==='swamp'){
   for(let n=0;n<3;n++){const xx=(n-1)*r*.5;line(c,id,[[xx-r*.13,r*.25],[xx,-r*.16],[xx+r*.13,r*.25]],ink,r*.065);line(c,id,[[xx-r*.18,r*.4],[xx+r*.18,r*.4]],ink,r*.055);}
  }else if(type==='sand'){
   for(let n=0;n<4;n++){c.fillStyle=ink;c.beginPath();c.arc((hash(seed+n,4)-.5)*r*1.5,(hash(seed+n,5)-.5)*r,Math.max(.55,r*.055),0,Math.PI*2);c.fill();}
  }else if(type==='grass'){
   line(c,id,[[-r*.2,r*.12],[-r*.26,-r*.12],[-r*.05,r*.09],[r*.04,-r*.14],[r*.17,r*.1]],ink,r*.052);
  }c.restore();
 }
 function terrain(c,id,hexes,geometry,trace,sp,ox,oy){
  const p=palette(id),surface=()=>{c.save();c.translate(ox,oy);c.fillStyle=c.createPattern(texture(id),'repeat');c.fillRect(-ox,-oy,c.canvas.width,c.canvas.height);c.restore();};c.save();surface();
  trace(c,geometry.land,sp,ox,oy);c.fillStyle=p.grass;c.fill();c.save();c.clip();
  for(const [type,loops]of geometry.types){if(type==='water'||type==='deep_water'||!p[type])continue;trace(c,loops,sp,ox,oy);c.fillStyle=p[type];c.fill();}
  c.globalAlpha=id==='chalkboard'?.30:.10;surface();c.restore();
  // Faint outlines and marks are clipped to connected terrain, never cell boxes.
  for(const [type,loops]of geometry.types){
   c.save();trace(c,loops,sp,ox,oy);c.clip();
   for(const h of hexes){if(h.type!==type)continue;const n=hash(h.q,h.r);if((type==='grass'&&n<.82)||(type==='sand'&&n<.65)||(type.includes('water')&&n<.80))continue;terrainMark(c,id,type,h.x+ox,h.y+oy,sp*(.28+n*.1),h.q*91+h.r);}
   c.restore();
  }
  stroke(c,id,g=>{trace(g,geometry.land,sp,ox,oy);},id==='chalkboard'?'#b7d0b0':'#668e77',id==='chalkboard'?1.7:1.3);
  c.restore();
 }
 function person(c,id,x,y,r,color,era,marine,mount){
  c.save();c.translate(x,y);stroke(c,id,g=>g.arc(0,-r*.48,r*.18,0,Math.PI*2),color,r*.1);
  if(era==='napoleonic')line(c,id,[[-r*.19,-r*.59],[-r*.19,-r*.83],[r*.16,-r*.83],[r*.16,-r*.59]],color,r*.09);
  if(era==='medieval')line(c,id,[[-r*.18,-r*.5],[r*.18,-r*.5],[r*.13,-r*.31]],color,r*.07);
  line(c,id,[[0,-r*.27],[0,r*.24],[-r*.24,r*.62]],color,r*.13);line(c,id,[[0,r*.2],[r*.24,r*.62]],color,r*.13);
  line(c,id,[[-r*.28,-r*.04],[0,-r*.16],[r*.28,r*.04]],color,r*.1);
  if(era==='medieval'&&mount){stroke(c,id,g=>{g.moveTo(r*.32,-r*.5);g.quadraticCurveTo(r*.75,0,r*.32,r*.44);g.closePath();},color,r*.07);line(c,id,[[r*.1,-r*.04],[r*.79,-r*.04]],color,r*.075);}
  else if(era==='ancient'||era==='medieval'){line(c,id,[[r*.35,-r*.64],[r*.35,r*.41]],color,r*.09);if(!mount)stroke(c,id,g=>g.ellipse(-r*.27,r*.02,r*.17,r*.23,0,0,Math.PI*2),color,r*.08);}
  else line(c,id,[[r*.04,r*.04],[r*.53,-r*.32]],color,r*.1);
  if(marine){line(c,id,[[-r*.41,r*.77],[r*.41,r*.77]],color,r*.07);}
  c.restore();
 }
 function unit(c,id,u,r,color,era='modern'){
  if(id==='whiteboard'){markerUnit(c,u,r,color,era);return;}
  const p=palette(id),ink=id==='chalkboard'?p.ink:p.ink,old=era==='ancient'||era==='medieval',mounted=old||era==='napoleonic';
  c.save();c.lineCap='round';c.lineJoin='round';
  // An irregular hand-drawn label, with faction ink and an open illustration.
  c.fillStyle=id==='chalkboard'?'#243e35ed':'#f8f8f0ee';c.beginPath();c.roundRect(-r*1.15,-r*.93,r*2.3,r*1.88,r*.22);c.fill();
  stroke(c,id,g=>{g.moveTo(-r*.96,-r*.88);g.quadraticCurveTo(0,-r*.95,r*.99,-r*.86);g.lineTo(r*1.1,r*.66);g.quadraticCurveTo(0,r*.83,-r*1.08,r*.72);g.closePath();},color,r*.105);
  c.scale(.92,.92);
  if(u.type==='light'||u.type==='marine'||u.type==='mountaineer'){
   person(c,id,0,-r*.02,r*.9,ink,era,u.type==='marine',u.type==='mountaineer');
   if(u.type==='mountaineer')line(c,id,[[-r*.85,r*.48],[-r*.52,-r*.18],[-r*.23,r*.48]],color,r*.09);
   if(u.type==='marine'){stroke(c,id,g=>{g.moveTo(-r*.7,r*.48);g.quadraticCurveTo(-r*.5,r*.83,0,r*.82);g.quadraticCurveTo(r*.5,r*.83,r*.7,r*.48);g.moveTo(0,r*.82);g.lineTo(0,r*.41);},color,r*.08);}
  }else if(u.type==='heavy'&&era==='ancient'){
   stroke(c,id,g=>g.arc(-r*.5,r*.44,r*.26,0,Math.PI*2),ink,r*.1);line(c,id,[[-r*.86,-r*.02],[-r*.66,r*.25],[r*.04,r*.25],[r*.04,-r*.05]],ink,r*.12);person(c,id,-r*.44,-r*.38,r*.62,ink,era,false,false);
   line(c,id,[[0,r*.19],[r*.45,r*.12],[r*.53,-r*.37],[r*.86,-r*.41],[r*.99,-r*.07],[r*.62,-r*.02],[r*.57,r*.3],[r*.2,r*.3]],ink,r*.1);for(const x of [.29,.59])line(c,id,[[r*x,r*.3],[r*(x-.06),r*.7]],ink,r*.1);
  }else if(u.type==='motorized'&&mounted||u.type==='heavy'&&(old||era==='napoleonic')){
   stroke(c,id,g=>{g.moveTo(-r*.67,r*.19);g.bezierCurveTo(-r*.76,-r*.42,r*.2,-r*.22,r*.37,-r*.5);g.lineTo(r*.67,-r*.53);g.lineTo(r*.83,-r*.12);g.lineTo(r*.47,-r*.05);g.lineTo(r*.39,r*.27);g.lineTo(-r*.67,r*.27);},ink,r*.11);
   for(const x of [-.53,.3])line(c,id,[[x*r,r*.23],[(x-.1)*r,r*.68]],ink,r*.11);
   person(c,id,-r*.1,-r*.34,r*.53,ink,era,false,false);
   if(u.type==='heavy')line(c,id,[[-r*.87,r*.6],[-r*.87,-r*.3]],color,r*.12);
  }else if(u.type==='heavy'){
   stroke(c,id,g=>g.roundRect(-r*.85,-r*.4,r*1.7,r*.95,r*.22),ink,r*.12);stroke(c,id,g=>g.roundRect(-r*.44,-r*.64,r*.84,r*.62,r*.15),ink,r*.11);line(c,id,[[r*.12,-r*.43],[r*.95,-r*.72]],ink,r*.17);
   for(let i=0;i<5;i++)line(c,id,[[(-.61+i*.3)*r,r*.28],[(-.61+i*.3)*r,r*.51]],ink,r*.065);
  }else if(u.type==='convoy'&&!u.convoySeaRoute&&mounted){
   line(c,id,[[-r*.87,-r*.19],[-r*.87,r*.28],[r*.13,r*.28],[r*.13,-r*.19],[-r*.87,-r*.19]],ink,r*.1);
   stroke(c,id,g=>{g.moveTo(-r*.84,-r*.19);g.bezierCurveTo(-r*.72,-r*.77,-r*.02,-r*.77,r*.1,-r*.19);},ink,r*.1);
   for(const x of [-.67,-.03])stroke(c,id,g=>g.arc(x*r,r*.43,r*.19,0,Math.PI*2),ink,r*.1);
   line(c,id,[[r*.12,r*.19],[r*.55,r*.11],[r*.58,-r*.26],[r*.87,-r*.41],[r*1.02,-r*.16],[r*.75,-r*.08],[r*.73,r*.24],[r*.43,r*.24],[r*.4,r*.56]],ink,r*.08);
  }else if(u.type==='motorized'||u.type==='convoy'&&!u.convoySeaRoute){
   line(c,id,[[-r*.83,r*.26],[-r*.83,-r*.4],[r*.24,-r*.4],[r*.24,-r*.13],[r*.63,-r*.13],[r*.86,r*.19],[r*.86,r*.36],[-r*.83,r*.36]],ink,r*.11);
   if(mounted){line(c,id,[[r*.87,r*.2],[r*1.04,-r*.02]],ink,r*.1);}else line(c,id,[[r*.35,-r*.05],[r*.56,-r*.05],[r*.7,r*.14],[r*.35,r*.14],[r*.35,-r*.05]],ink,r*.065);
   for(const x of [-.5,.57])stroke(c,id,g=>g.arc(x*r,r*.41,r*.18,0,Math.PI*2),ink,r*.1);
  }else{
   line(c,id,[[-r*.96,r*.12],[-r*.63,r*.61],[r*.56,r*.61],[r*.97,r*.12],[-r*.96,r*.12]],ink,r*.11);
   if(old||era==='napoleonic'){
    line(c,id,[[0,r*.09],[0,-r*.75],[r*.56,-r*.16],[0,-r*.16]],ink,r*.095);
    if(u.type==='ship')for(let n=0;n<3;n++)line(c,id,[[(-.6+n*.54)*r,r*.48],[(-.84+n*.54)*r,r*.85]],ink,r*.06);
   }else{line(c,id,[[-r*.38,r*.1],[-r*.38,-r*.24],[r*.32,-r*.24],[r*.32,r*.1]],ink,r*.095);line(c,id,[[0,-r*.24],[0,-r*.73],[r*.3,-r*.61]],ink,r*.08);if(u.type==='ship')line(c,id,[[r*.3,-r*.1],[r*.91,-r*.33]],ink,r*.12);}
   if(u.type==='transport'||u.type==='convoy'){line(c,id,[[-r*.65,r*.05],[-r*.65,-r*.29],[-r*.34,-r*.29],[-r*.34,r*.05]],color,r*.1);}
   if(u.type==='supply'){line(c,id,[[r*.59,-r*.43],[r*.59,-r*.02]],color,r*.14);line(c,id,[[r*.39,-r*.23],[r*.79,-r*.23]],color,r*.14);}
  }
  if(u.isGeneral){line(c,id,[[-r*.3,-r*1.03],[0,-r*1.23],[r*.3,-r*1.03]],'#d3b65c',r*.1);}
  c.restore();
 }
 function structure(c,id,kind,x,y,color,scale=1,era='modern'){
  if(id==='whiteboard'){markerStructure(c,kind,x,y,color,scale);return;}
  const p=palette(id);c.save();c.translate(x,y);c.scale(scale,scale);c.fillStyle=p.paper;
  if(kind==='hospital'){
   c.fillRect(-23,-11,46,30);line(c,id,[[-23,19],[-23,-8],[-9,-8],[-9,-22],[9,-22],[9,-8],[23,-8],[23,19],[-23,19]],p.ink,2);line(c,id,[[0,-16],[0,-2]],'#db739e',3);line(c,id,[[-7,-9],[7,-9]],'#db739e',3);
   for(const xx of [-17,13])line(c,id,[[xx,1],[xx+4,1],[xx+4,8],[xx,8],[xx,1]],p.muted,1.3);
  }else if(kind==='fort'){
   c.fillRect(-15,-12,30,27);line(c,id,[[-17,15],[-17,-12],[-11,-12],[-11,-18],[-4,-18],[-4,-12],[4,-12],[4,-18],[11,-18],[11,-12],[17,-12],[17,15],[-17,15]],p.ink,2);line(c,id,[[-5,15],[-5,4],[5,4],[5,15]],color,1.8);
  }else if(kind==='factory'){
   line(c,id,[[-8,6],[-8,-4],[-2,-7],[-2,-3],[4,-7],[4,6],[-8,6],[8,6],[8,-10],[5,-10],[5,-3]],color,1.5);
  }else if(kind==='harbor'){
   stroke(c,id,g=>{g.arc(0,-7,2,0,Math.PI*2);g.moveTo(0,-5);g.lineTo(0,8);g.moveTo(-8,0);g.quadraticCurveTo(-7,10,0,8);g.quadraticCurveTo(7,10,8,0);g.moveTo(-5,-2);g.lineTo(5,-2);},color,1.6);
  }else if(kind==='farm'){
   for(let n=0;n<3;n++)line(c,id,[[n*5-5,8],[n*5-5,-5],[n*5-9,-2],[n*5-5,1],[n*5-1,-3]],color,1.2);
  }else{
   c.fillRect(-17,-9,34,25);line(c,id,[[-19,-8],[0,-23],[19,-8],[-19,-8],[-16,-8],[-16,16],[16,16],[16,-8]],p.ink,1.8);line(c,id,[[-4,16],[-4,4],[4,4],[4,16]],p.ink,1.5);
   for(const xx of [-11,8])line(c,id,[[xx,-2],[xx+3,-2],[xx+3,3],[xx,3],[xx,-2]],p.muted,1.2);
  }
  if(kind==='fort'||kind==='city'){line(c,id,[[20,4],[20,-21],[32,-18],[20,-13]],color,2);}
  c.restore();
 }
 function bridge(c,id,b,alpha=1){c.save();c.globalAlpha*=alpha;c.translate(b.x,b.y);c.rotate(b.angle||0);const w=b.w||65,h=b.h||20,p=palette(id);c.fillStyle=id==='whiteboard'?'#bdcfd2':p.paper;c.fillRect(-w/2,-h/2,w,h);for(const y of [-h/2,h/2])line(c,id,[[-w/2,y],[w/2,y]],p.ink,id==='whiteboard'?3:2);if(id==='whiteboard'){for(let x=-w/2;x<w/2;x+=14){line(c,id,[[x,-h/2],[Math.min(x+14,w/2),h/2]],'#668b9a',1.8);}}else for(let x=-w/2+3;x<w/2;x+=7)line(c,id,[[x,-h/2],[x,h/2]],p.muted,1);c.restore();}
 function arrow(c,id,points,width=2,head=10,color){
  if(!points||points.length<2)return;const p=palette(id),col=color||(id==='chalkboard'?'#f5d888':'#c9534c');
  c.save();c.setLineDash([]);stroke(c,id,g=>{g.moveTo(points[0].x,points[0].y);for(const pt of points.slice(1))g.lineTo(pt.x,pt.y);},col,width*(id==='chalkboard'?1.18:1.1));
  const end=points[points.length-1];let prev=points[points.length-2];for(let i=points.length-2;i>=0;i--)if(Math.hypot(points[i].x-end.x,points[i].y-end.y)>head){prev=points[i];break;}
  const a=Math.atan2(end.y-prev.y,end.x-prev.x);if(id==='whiteboard'){c.fillStyle=col;c.beginPath();c.moveTo(end.x,end.y);c.lineTo(end.x-head*1.25*Math.cos(a-.52),end.y-head*1.25*Math.sin(a-.52));c.lineTo(end.x-head*1.25*Math.cos(a+.52),end.y-head*1.25*Math.sin(a+.52));c.closePath();c.fill();}else line(c,id,[[end.x-head*Math.cos(a-.48),end.y-head*Math.sin(a-.48)],[end.x,end.y],[end.x-head*Math.cos(a+.48),end.y-head*Math.sin(a+.48)]],col,width*1.1);c.restore();
 }
 function frontline(id,spacing,paint){const p=palette(id);if(id==='whiteboard'){paint(8,[],0,'#45558c20');paint(4.2,[],0,'#3e508a');paint(1.2,[],.8,'#869ac070');}else{paint(5,[],0,id==='chalkboard'?chalkInk(p.ink):p.ink);if(id==='chalkboard')paint(1.2,[3.4,2.3],.8,'#fffbe78a');}}
 function markerTerrain(c,type,x,y,r,seed){
  const ink={forest:'#417152',mountain:'#79736e',hill:'#a28c62',water:'#479db7',deep_water:'#479db7',grass:'#789463',swamp:'#529488',sand:'#ba9a62',urban:'#778483'}[type]||'#789463';c.save();c.translate(x,y);c.lineCap='round';c.lineJoin='round';c.strokeStyle=ink;c.lineWidth=r*.11;
  if(type==='forest'){
   c.fillStyle='#668b5b80';c.beginPath();c.moveTo(-r*.8,r*.3);c.bezierCurveTo(-r*1.1,-r*.4,-r*.4,-r*.6,-r*.12,-r*.5);c.bezierCurveTo(r*.13,-r*.95,r*.67,-r*.6,r*.54,-r*.26);c.bezierCurveTo(r*1.13,-r*.19,r*.85,r*.51,r*.45,r*.51);c.bezierCurveTo(r*.16,r*.9,-r*.37,r*.63,-r*.8,r*.3);c.fill();c.stroke();c.beginPath();c.moveTo(-r*.05,r*.2);c.lineTo(r*.05,r*.8);c.stroke();
  }else if(type==='mountain'){
   c.fillStyle='#a9a39c66';c.beginPath();c.moveTo(-r*.8,r*.6);c.lineTo(r*.04,-r*.76);c.lineTo(r*.83,r*.6);c.closePath();c.fill();c.stroke();c.beginPath();c.moveTo(r*.04,-r*.76);c.lineTo(r*.15,r*.55);for(let i=0;i<3;i++){c.moveTo(r*(.2+i*.16),r*(.04+i*.21));c.lineTo(r*(.06+i*.02),r*(.23+i*.13));}c.stroke();
  }else if(type==='hill'){
   for(let i=0;i<3;i++){c.beginPath();c.ellipse(0,r*.14,r*(.85-i*.22),r*(.5-i*.15),-.27,Math.PI*.05,Math.PI*1.9);c.stroke();}
  }else if(type.includes('water')){
   c.globalAlpha*=.53;c.beginPath();c.moveTo(-r*.9,0);c.bezierCurveTo(-r*.46,-r*.3,-r*.17,r*.3,r*.2,0);c.bezierCurveTo(r*.6,-r*.3,r*.7,r*.2,r,0);c.stroke();
  }else if(type==='swamp'){
   for(let i=-1;i<=1;i++){c.beginPath();c.moveTo(i*r*.48,r*.5);c.lineTo(i*r*.48,-r*.22);c.stroke();c.fillStyle=ink;c.fillRect(i*r*.48-r*.075,-r*.48,r*.15,r*.3);}c.beginPath();c.ellipse(0,r*.6,r*.85,r*.13,0,0,Math.PI*2);c.stroke();
  }else if(type==='urban'){
   c.fillStyle='#839b9470';c.fillRect(-r*.7,-r*.48,r*.58,r*.52);c.fillRect(r*.15,-r*.3,r*.62,r*.7);c.strokeRect(-r*.7,-r*.48,r*.58,r*.52);c.strokeRect(r*.15,-r*.3,r*.62,r*.7);
  }else if(type==='grass'){
   c.globalAlpha*=.45;c.beginPath();c.moveTo(-r*.46,r*.16);c.lineTo(-r*.17,-r*.12);c.moveTo(r*.05,r*.22);c.lineTo(r*.4,-r*.17);c.stroke();
  }else{c.globalAlpha*=.55;for(let i=0;i<3;i++){c.beginPath();c.ellipse((i-1)*r*.48,(hash(seed,i)-.5)*r*.6,r*.16,r*.07,-.3,0,Math.PI*2);c.stroke();}}c.restore();
 }
 function markerUnit(c,u,r,color,era){
  const early=era!=='modern',old=era==='ancient'||era==='medieval',naval=['ship','transport','supply'].includes(u.type)||u.type==='convoy'&&u.convoySeaRoute;
  c.save();c.scale(r,r);c.lineCap='round';c.lineJoin='round';c.fillStyle='#fcfcf5ee';c.strokeStyle=color;c.lineWidth=.12;c.beginPath();c.ellipse(0,0,1.13,.96,-.08,0,Math.PI*2);c.fill();c.stroke();c.strokeStyle='#294654';
  const poly=(pts,fill)=>{c.beginPath();pts.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.closePath();if(fill){c.fillStyle=fill;c.fill();}c.stroke();};
  if(naval){
   c.save();c.rotate(-.35);poly([[-.5,.67],[-.52,-.36],[0,-.83],[.52,-.36],[.5,.67]],'#78a4ad');c.lineWidth=.07;poly([[-.28,.42],[-.28,-.35],[.28,-.35],[.28,.42]],'#e7eddf');
   if(early){poly([[0,-.58],[.51,.12],[0,.24]],'#eee1b0');c.beginPath();c.moveTo(0,-.7);c.lineTo(0,.55);c.stroke();}
   else if(u.type==='ship'){c.fillStyle='#3e5b69';for(const y of [-.25,.28]){c.beginPath();c.arc(0,y,.14,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(0,y);c.lineTo(0,y-.33);c.stroke();}}
   else{c.fillStyle=color;for(let i=0;i<3;i++)c.fillRect(-.21,-.36+i*.24,.42,.14);}
   if(u.type==='supply'){c.fillStyle='#e6f5ed';c.fillRect(-.25,-.11,.5,.5);c.strokeStyle='#268c89';c.lineWidth=.15;c.beginPath();c.moveTo(0,-.03);c.lineTo(0,.32);c.moveTo(-.17,.14);c.lineTo(.17,.14);c.stroke();}c.restore();
  }else if((u.type==='heavy'||u.type==='motorized')&&early){
   if(u.type==='heavy'&&era==='ancient'){poly([[-.62,-.2],[.03,-.2],[.03,.5],[-.62,.5]],'#bd956c');c.fillStyle='#354e59';c.fillRect(-.77,-.19,.13,.64);c.fillRect(.05,-.19,.13,.64);poly([[.24,.18],[.3,-.5],[.75,-.65],[.88,-.37],[.61,-.2],[.58,.36]],color);}
   else{poly([[-.76,.33],[-.61,-.28],[-.17,-.15],[.14,-.67],[.62,-.75],[.85,-.41],[.46,-.25],[.37,.37]],'#9f7d5d');c.fillStyle=color;c.beginPath();c.ellipse(-.15,-.1,.29,.32,-.2,0,Math.PI*2);c.fill();c.fillStyle='#f2ddad';c.beginPath();c.arc(-.07,-.49,.16,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(-.52,.31);c.lineTo(-.65,.66);c.moveTo(.23,.3);c.lineTo(.36,.66);c.stroke();if(u.type==='heavy'){c.strokeStyle=color;c.lineWidth=.1;c.beginPath();c.moveTo(.02,-.3);c.lineTo(.18,-.93);c.stroke();}}
  }else if(u.type==='heavy'){
   c.save();c.rotate(.32);c.fillStyle='#294654';c.fillRect(-.69,-.67,.27,1.36);c.fillRect(.42,-.67,.27,1.36);poly([[-.43,-.58],[.43,-.58],[.43,.58],[-.43,.58]],'#96ae82');c.fillStyle='#d2d8aa';c.beginPath();c.ellipse(0,-.08,.32,.39,0,0,Math.PI*2);c.fill();c.stroke();c.lineWidth=.17;c.beginPath();c.moveTo(0,-.16);c.lineTo(0,-.94);c.stroke();c.restore();
  }else if(u.type==='convoy'&&early){
   c.fillStyle='#345362';c.fillRect(-.68,-.62,.15,.81);c.fillRect(.16,-.62,.15,.81);poly([[-.5,-.68],[.13,-.68],[.13,.23],[-.5,.23]],'#dbcba3');c.beginPath();c.moveTo(-.49,-.53);c.quadraticCurveTo(-.18,-.82,.12,-.53);c.moveTo(-.49,.09);c.quadraticCurveTo(-.18,.34,.12,.09);c.stroke();poly([[.35,.47],[.3,-.06],[.59,-.32],[.88,-.24],[.82,.01],[.59,.12],[.6,.57]],'#ac8e6e');c.beginPath();c.moveTo(.1,.13);c.lineTo(.38,.4);c.stroke();
  }else if(u.type==='motorized'||u.type==='convoy'){
   c.save();c.rotate(-.22);c.fillStyle='#294654';for(const y of [-.45,.4]){c.fillRect(-.6,y,.2,.25);c.fillRect(.4,y,.2,.25);}poly([[-.42,-.7],[.42,-.7],[.42,.67],[-.42,.67]],u.type==='convoy'?'#d7b071':'#93afbb');c.fillStyle='#3d6676';c.fillRect(-.32,-.55,.64,.25);c.fillStyle='#eddfb8';c.fillRect(-.3,-.03,.6,.57);if(early){c.beginPath();c.moveTo(-.31,.1);c.lineTo(.31,.1);c.moveTo(-.31,.34);c.lineTo(.31,.34);c.stroke();}c.restore();
  }else{
   // Filled helmet-and-shoulders illustration instead of the chalk stick soldier.
   poly([[-.76,.68],[-.61,.22],[-.24,.08],[.24,.08],[.61,.22],[.76,.68]],color);
   c.fillStyle='#eee0b7';c.beginPath();c.ellipse(0,-.16,.29,.37,0,0,Math.PI*2);c.fill();c.stroke();
   c.fillStyle=old?'#9aafb0':'#698c7a';c.beginPath();c.ellipse(0,-.43,.47,.3,0,Math.PI,Math.PI*2);c.lineTo(.45,-.37);c.lineTo(-.45,-.37);c.closePath();c.fill();c.stroke();
   if(era==='napoleonic'){poly([[-.29,-.4],[-.27,-.82],[.25,-.82],[.29,-.4]],'#344e62');}else if(era==='medieval'){c.beginPath();c.moveTo(0,-.62);c.lineTo(0,.03);c.stroke();}
   if(u.type==='mountaineer'){poly([[.3,.65],[.64,.03],[.98,.65]],'#e7eee7');}else if(u.type==='marine'){c.strokeStyle='#eaf5f0';c.lineWidth=.08;c.beginPath();c.moveTo(0,.28);c.lineTo(0,.65);c.moveTo(-.24,.4);c.quadraticCurveTo(0,.86,.24,.4);c.stroke();}
  }
  if(u.isGeneral){c.fillStyle='#d5b152';c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr=i%2?.13:.26;i?c.lineTo(Math.cos(a)*rr,Math.sin(a)*rr-.94):c.moveTo(Math.cos(a)*rr,Math.sin(a)*rr-.94);}c.closePath();c.fill();}c.restore();
 }
 function markerStructure(c,kind,x,y,color,s=1){
  c.save();c.translate(x,y);c.scale(s,s);c.lineJoin='round';c.lineCap='round';c.lineWidth=2;c.strokeStyle='#34576a';
  if(kind==='city'){
   c.fillStyle='#aac1b3';for(const [xx,yy,w,h]of [[-19,-15,16,15],[4,-10,16,24],[-17,5,13,14]]){c.fillRect(xx,yy,w,h);c.strokeRect(xx,yy,w,h);c.beginPath();c.moveTo(xx,yy);c.lineTo(xx+w/2,yy+h/2);c.lineTo(xx+w,yy);c.stroke();}c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.moveTo(-24,-22);c.lineTo(24,-22);c.stroke();
  }else if(kind==='fort'){
   c.fillStyle='#aab9c3';c.beginPath();c.moveTo(0,-23);c.lineTo(23,0);c.lineTo(0,23);c.lineTo(-23,0);c.closePath();c.fill();c.stroke();c.fillStyle=color;for(const [xx,yy]of [[0,-20],[20,0],[0,20],[-20,0]]){c.beginPath();c.arc(xx,yy,5,0,Math.PI*2);c.fill();c.stroke();}
  }else if(kind==='hospital'){
   c.fillStyle='#f4dde2';c.fillRect(-25,-8,50,19);c.fillRect(-9,-23,18,49);c.strokeRect(-25,-8,50,19);c.strokeRect(-9,-23,18,49);c.strokeStyle='#d66f95';c.lineWidth=5;c.beginPath();c.moveTo(0,-9);c.lineTo(0,11);c.moveTo(-10,1);c.lineTo(10,1);c.stroke();
  }else{c.fillStyle=kind==='farm'?'#b6c88e':kind==='harbor'?'#92c2ca':'#b2bec5';c.fillRect(-8,-7,16,14);c.strokeRect(-8,-7,16,14);c.strokeStyle=color;c.beginPath();if(kind==='farm'){for(let xx=-5;xx<=5;xx+=5){c.moveTo(xx,-5);c.lineTo(xx,5);}}else if(kind==='harbor'){c.moveTo(-10,10);c.lineTo(10,10);c.moveTo(0,0);c.lineTo(0,13);}else{c.moveTo(-3,-7);c.lineTo(-3,-14);c.lineTo(2,-14);c.lineTo(2,-7);}c.stroke();}c.restore();
 }
 const screenshots=new Map();
 function preview(c,id,era='modern'){
  const key=id+'-'+era;c.width=1280;c.height=720;c.dataset.previewKey=key;delete c.dataset.previewReady;delete c.dataset.previewError;
  const g=c.getContext('2d'),p=palette(id);g.fillStyle=p.surface;g.fillRect(0,0,c.width,c.height);
  if(!screenshots.has(key)){
   const img=new Image();img.src='skins/map-packs/'+key+'.webp';screenshots.set(key,img.decode().then(()=>img).catch(e=>{screenshots.delete(key);throw e;}));
  }
  return screenshots.get(key).then(img=>{if(c.dataset.previewKey!==key)return;g.drawImage(img,0,0,c.width,c.height);c.dataset.previewReady=key;}).catch(()=>{if(c.dataset.previewKey!==key)return;g.fillStyle=p.ink;g.font='22px Georgia';g.textAlign='center';g.fillText('Screenshot unavailable',c.width/2,c.height/2);c.dataset.previewError=key;});
 }
 function roster(c,id,era,names,art){
  const g=c.getContext('2d');c.width=1000;c.height=340;const p=palette(id),board=id==='chalkboard'||id==='whiteboard';g.fillStyle=id==='default'?'#c3cfad':p.surface;g.fillRect(0,0,1000,340);
  types.forEach((type,i)=>{const x=56+i*111;g.save();g.translate(x,70);if(board)unit(g,id,{type},31,p.blue,era);else art.unit(g,id,{type,owner:1,x:0,y:0},31,p.blue,era);g.restore();g.font='14px Georgia';g.textAlign='center';g.fillStyle=p.ink;const label=names?.[type]||labels[type],words=label.split(' ');if(label.length>14&&words.length>1){g.fillText(words.slice(0,-1).join(' '),x,131,104);g.fillText(words.at(-1),x,150,104);}else g.fillText(label,x,139,104);});
  for(const [i,kind]of ['city','fort','hospital','factory','harbor','farm','bridge'].entries()){const x=100+i*133;g.save();if(kind==='bridge'){if(board)bridge(g,id,{x,y:230,w:62,h:20});else art.bridge(g,id,x,230,era);}else if(board)structure(g,id,kind,x,230,p.blue,1,era);else art.structure(g,id,kind,x,230,p.blue,1,era);g.restore();g.fillStyle=p.ink;g.font='14px Georgia';g.textAlign='center';g.fillText(kind[0].toUpperCase()+kind.slice(1),x,278);}
  g.font='16px Georgia';g.textAlign='center';g.fillStyle=p.muted;g.fillText('Every unit & structure class · every era · both armies',500,318);
 }
 let modal=null,returnFocus=null,busy=false;
 function close(){if(busy||!modal)return;modal.close();modal.remove();modal=null;returnFocus?.focus();}
 // Keep battlefield shortcuts from consuming Escape or moving the camera while browsing.
 window.addEventListener('keydown',e=>{if(!modal?.open)return;e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();close();}},true);
 function open(id,api){
  if(!packs[id]||busy)return;close();returnFocus=document.activeElement;const p=palette(id);
  modal=document.createElement('dialog');modal.className='board-pack-dialog';modal.setAttribute('aria-labelledby','boardPackTitle');
  const description={default:'Classic illustrated terrain with your selected army styles.',atlas_hd:'Detailed aerial terrain with realistic unit formations included.',chalkboard:'Dusty chalk schematics, sketched soldiers and line drawings on green slate.',whiteboard:'Bold marker illustrations, filled helmet badges, vehicles viewed from above and dry-erase terrain.'}[id];
  modal.innerHTML=`<div class="board-pack-head"><div><span class="board-pack-eyebrow">BATTLEFIELD PACK</span><h2 id="boardPackTitle">${p.name}</h2></div><button type="button" class="board-pack-close" aria-label="Close preview">×</button></div><p class="board-pack-intro">${description} Terrain, units, structures, front lines and orders. All eras, both armies.</p><canvas class="board-pack-scene" aria-label="${p.name} battlefield preview"></canvas><div class="board-pack-detail"><span>Terrain & coastlines</span><span>Units & structures</span><span>Front lines & orders</span></div><div class="board-pack-era"><label for="boardPackEra">Preview era</label><select id="boardPackEra"><option value="ancient">Ancient</option><option value="medieval">Medieval</option><option value="napoleonic">Napoleonic</option><option value="modern">Modern</option></select></div><canvas class="board-pack-roster" aria-label="All unit and structure classes in selected era"></canvas><div class="board-pack-footer"><p class="board-pack-status" aria-live="polite"></p><button type="button" class="board-pack-equip"></button></div>`;
  document.body.append(modal);const scene=modal.querySelector('.board-pack-scene'),army=modal.querySelector('.board-pack-roster'),era=modal.querySelector('select'),button=modal.querySelector('.board-pack-equip'),status=modal.querySelector('.board-pack-status');era.value=api.era();const wrap=document.createElement('div');wrap.className='board-pack-roster-wrap';army.before(wrap);wrap.append(army);
  const caption=document.createElement('p');caption.className='board-pack-caption';caption.textContent='Actual in-game screenshot';scene.after(caption);scene.setAttribute('aria-label',p.name+' in-game screenshot');
  const draw=()=>{preview(scene,id,era.value);roster(army,id,era.value,api.names(era.value),api.art);};
  const sync=message=>{const owned=api.owned(id),on=api.equipped()===id;button.textContent=on?'Equipped':owned?'Equip pack':'Unlock & equip · '+api.price(id).toLocaleString()+' gold';button.disabled=on||busy;status.textContent=message||(owned?'Owned forever. Switch packs whenever you like.':api.price(id).toLocaleString()+' gold · one purchase, all eras. Your balance: '+api.gold().toLocaleString()+' gold.');};
  era.addEventListener('change',draw);modal.querySelector('.board-pack-close').onclick=close;modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  button.onclick=async()=>{if(busy)return;busy=true;button.disabled=true;button.textContent='Equipping…';let message;try{const ok=await api.equip(id);message=ok?'Pack equipped. Both armies now use '+p.name+' artwork.':api.gold()<api.price(id)?'Not enough gold. This pack costs '+api.price(id).toLocaleString()+' gold; your balance is '+api.gold().toLocaleString()+'.':'Could not complete the purchase. Please try again.';}catch(e){message='Could not equip this pack. Please try again.';}finally{busy=false;sync(message);}};
  modal.showModal();draw();sync();
 }
 function thumbnail(c,id){return preview(c,id,'modern');}
 root.WodBoardArt=Object.freeze({packs,palette,terrain,unit,structure,bridge,arrow,frontline,preview,roster,open,thumbnail});
})(globalThis);
