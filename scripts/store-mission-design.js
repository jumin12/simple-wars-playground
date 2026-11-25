'use strict';
// Cleanup shared by the store mission generators: terrainNoise (smooth value noise for authored maps) and
// polishStoreMission, which every campaign stage passes through before validation.
const SP=27,DIRS=[[1,0],[-1,0],[0,1],[0,-1]];

function terrainNoise(q,r,seed=1) {
 const hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7+seed*.017)*43758.5453123;return v-Math.floor(v);};
 const sample=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,u=a*a*(3-2*a),v=b*b*(3-2*b);return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;};
 return sample(q*.085,r*.085)*.62+sample(q*.19+31,r*.19-17)*.27+sample(q*.42-7,r*.42+11)*.11;
}
function polishStoreMission(m) {
 const d=m.data,meta=m.entry;d.gamePeriod=meta.gamePeriod;d.hexRadius=20;
 const cells=new Map(d.hexList.map(h=>[`${h.q},${h.r}`,h])),wet=h=>h?.type==='water'||h?.type==='deep_water';
 // Restore a continuous-looking coast/steppe without damaging cities, islands,
 // bridges or deliberate strategic water barriers.
 const protectedKeys=new Set(d.cities.map(c=>`${c.q},${c.r}`));
 for(const u of d.entities)protectedKeys.add(`${Math.round(u.x/SP)},${Math.round(u.y/SP)}`);
 for(let pass=0;pass<(d.mission?.battlefield?0:2);pass++){
  const changes=[];for(const h of d.hexList){if(h.cityId||protectedKeys.has(`${h.q},${h.r}`))continue;const ns=DIRS.map(([q,r])=>cells.get(`${h.q+q},${h.r+r}`)).filter(Boolean);if(ns.length<4)continue;
   if(wet(h)&&ns.every(n=>!wet(n)&&n.type!=='mountain'))changes.push([h,ns[0].type]);
   else if(h.type!=='mountain'&&!wet(h)&&ns.every(wet))changes.push([h,'water']);
  }for(const [h,type]of changes)h.type=type;
 }
 for(const c of d.cities){c.hasFactory=false;c.hasHarbor=false;c.hasFarm=false;c.incomeBonus=0;c.manpowerBonus=0;for(const h of d.hexList)if(h.cityId===c.id)h.owner=c.owner;}
 // Ordinary formations start in their own town-supplied land component. Marines
 // retain authored beach approaches; all ships remain afloat.
 const supply=new Map();
 for(const c of d.cities){if(!supply.has(c.owner))supply.set(c.owner,new Set());const seen=supply.get(c.owner),queue=[cells.get(`${c.q},${c.r}`)];for(const h of queue)if(h)seen.add(`${h.q},${h.r}`);
  for(let i=0;i<queue.length;i++){const h=queue[i];if(!h)continue;for(const [q,r]of DIRS){const n=cells.get(`${h.q+q},${h.r+r}`),k=n&&`${n.q},${n.r}`;if(n&&!wet(n)&&n.type!=='mountain'&&n.owner===c.owner&&!seen.has(k)){seen.add(k);queue.push(n);}}}
 }
 const occupied=new Set();
 for(const u of d.entities){let h=cells.get(`${Math.round(u.x/SP)},${Math.round(u.y/SP)}`);
  const usable=n=>['ship','transport'].includes(u.type)?wet(n):u.type==='marine'&&wet(h)?wet(n):!wet(n)&&n.type!=='mountain'&&supply.get(u.owner)?.has(`${n.q},${n.r}`);
  if(!h||!usable(h)||occupied.has(`${h.q},${h.r}`)){
   let best=null,score=Infinity;for(const n of d.hexList)if(usable(n)&&!occupied.has(`${n.q},${n.r}`)){const dist=(n.x-u.x)**2+(n.y-u.y)**2;if(dist<score){score=dist;best=n;}}
   if(!best)throw Error(m.file+': no supplied spawn for '+u.name);h=best;
  }
  u.x=h.x;u.y=h.y;occupied.add(`${h.q},${h.r}`);
 }
 const forts=[];for(const f of d.forts){const h=cells.get(`${f.q},${f.r}`);if(!h||wet(h)||h.type==='mountain'||forts.some(n=>n.owner===f.owner&&Math.hypot(n.q-f.q,n.r-f.r)<5))continue;forts.push(f);}d.forts=forts;
 const byId=new Map(d.cities.map(c=>[c.id,c]));d.roads=(d.roads||[]).filter(r=>byId.has(r.from?.id)&&byId.has(r.to?.id));
 return m;
}
module.exports={polishStoreMission,terrainNoise};
