'use strict';
// Curated RTS roles, not claims about an exact historical order of battle.
// Called before both generators validate and write their authored battlefields.
const LABELS={modern:{motorized:'Motorized detachment',mountaineer:'Mountain assault detachment'},ancient:{motorized:'Cavalry detachment',mountaineer:'Skirmisher detachment'},medieval:{motorized:'Mounted men-at-arms',mountaineer:'Ranger detachment'},napoleonic:{motorized:'Dragoon detachment',mountaineer:'Chasseur detachment'}};
const STATS={motorized:{hp:180,speed:19,damage:12,range:55,attackCooldown:2.3,radius:14},mountaineer:{hp:85,speed:14,damage:6,range:50,attackCooldown:2,radius:12},transport:{hp:50,speed:22,damage:4,range:45,attackCooldown:2.4,radius:15},supply:{hp:50,speed:21,damage:4,range:45,attackCooldown:2.4,radius:15}};
function configure(u,type,era){Object.assign(u,STATS[type],{type,maxHp:STATS[type].hp,manpower:1000,maxManpower:1000,tanks:0,maxTanks:0,name:LABELS[era]?.[type]||({transport:'Landing transport',supply:'Supply ship'})[type]});if(['transport','supply'].includes(type)){u.manpower=500;u.maxManpower=500;}return u;}
function modernizeMissionRoster(m){
 const d=m.data,id=m.entry.id||m.file.replace(/\.json$/,''),era=d.gamePeriod||'modern',by=new Map(d.hexList.map(h=>[h.q+','+h.r,h]));
 const at=u=>by.get(Math.round(u.x/27)+','+Math.round(u.y/27)),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const rough=u=>{const h=at(u);return d.hexList.filter(p=>['hill','mountain'].includes(p.type)&&Math.abs(p.q-h.q)<=4&&Math.abs(p.r-h.r)<=4).length;};
 const mountain=/mountain|winter|shattered|seelow|cherbourg|thermopylae|austerlitz/.test(id);
 const naval=/first_landing|ironshore|normandy-dday|normandy-02|normandy-03/.test(id);
 const airborne=/normandy-01|market-03|market-05/.test(id),fleet=id==='midway-1942';
 const changes=[];
 for(const owner of [...new Set(d.entities.map(u=>u.owner))]){
  const lights=d.entities.filter(u=>u.owner===owner&&u.type==='light');
  // Keep basic town infantry and original named evacuation units intact.
  const candidates=lights.filter(u=>!/^1st Airborne/.test(u.name||''));
  const maxSpecial=Math.max(0,lights.length-Math.max(2,d.cities.filter(c=>c.owner===owner).length));let used=0;
  if(!fleet&&mountain){
   const count=Math.min(maxSpecial,lights.length>=10?3:2);
   for(const u of candidates.slice().sort((a,b)=>rough(b)-rough(a)).slice(0,count)){configure(u,'mountaineer',era);used++;changes.push({owner,type:'mountaineer',uid:u.uid});}
  }
  const mobileAllowed=!fleet&&!(owner===1&&airborne)&&!(era==='ancient'&&id.includes('thermopylae'));
  if(mobileAllowed){
   const count=Math.min(Math.max(0,maxSpecial-used),lights.length>=14?3:lights.length>=6?2:1);
   const rear=d.cities.filter(c=>c.owner===owner);
   const score=u=>rough(u)*50+Math.min(...rear.map(c=>distance(u,c)));
   for(const u of candidates.filter(u=>u.type==='light').sort((a,b)=>score(a)-score(b)).slice(0,count)){configure(u,'motorized',era);changes.push({owner,type:'motorized',uid:u.uid});}
  }
 }
 if(naval){
  const owned=d.cities.filter(c=>c.owner===1),ships=d.entities.filter(u=>u.owner===1&&u.type==='ship'),occupied=new Set(d.entities.map(u=>Math.round(u.x/27)+','+Math.round(u.y/27)));
  const addBoat=type=>{const water=d.hexList.filter(h=>h.type==='water'&&!occupied.has(h.q+','+h.r)&&ships.some(u=>distance(u,h)<27*9)&&owned.some(c=>distance(c,h)<27*28));water.sort((a,b)=>Math.min(...ships.map(u=>distance(a,u)))-Math.min(...ships.map(u=>distance(b,u))));const h=water[0];if(!h)throw Error(id+': no logistical launch water');const u=configure({uid:id+'-logistics-'+type+'-'+d.entities.length,owner:1,x:h.x,y:h.y,morale:100,maxMorale:100,xp:0,kills:0,losses:0,selected:false,target:null},type,era);d.entities.push(u);occupied.add(h.q+','+h.r);changes.push({owner:1,type,uid:u.uid});};
  const ordinary=d.entities.filter(u=>u.owner===1&&!['marine','ship','transport','supply'].includes(u.type));
  if(ordinary.length&&!d.entities.some(u=>u.owner===1&&u.type==='transport')){addBoat('transport');if(ordinary.length>=4)addBoat('transport');}
  if(ordinary.length&&!d.entities.some(u=>u.owner===1&&u.type==='supply'))addBoat('supply');
 }
 // Reserve arrivals continue the scenario's role rather than reverting every
 // later wave to generic infantry. Preserve total counts and objective IDs.
 for(const event of d.mission?.events||[]){const reinforcements=event.reinforcements||[];for(const row of reinforcements.slice()){
  if(row.type!=='light'||row.count<3||fleet||airborne&&row.owner===1)continue;
  const type=mountain?'mountaineer':era!=='ancient'||!id.includes('thermopylae')?'motorized':null;
  if(type){row.count--;reinforcements.push({...row,type,count:1});}
 }}
 d.mission.rosterRevision=2;d.mission.rosterRoles=changes.reduce((n,c)=>(n[c.type]=(n[c.type]||0)+1,n),{});
 const note=fleet?'Naval task groups retain their fleet objective; land specialists and troop transports are not added to this carrier-battle abstraction.':[
 changes.some(c=>c.type==='motorized')?'Mobile detachments use open ground and roads; retain infantry for towns and close terrain.':'',
 changes.some(c=>c.type==='mountaineer')?'Rough-terrain detachments can use mountain routes but are weaker on open ground.':'',
 changes.some(c=>c.type==='supply')?'Transports carry one ordinary land unit each. Keep the supply ship near landed troops until a town supplies their beachhead.':''
 ].filter(Boolean).join(' ');
 d.mission.rosterNote=note;
 const briefing=d.mission.events?.find(e=>e.trigger?.seconds===0);if(briefing?.popup?.body)briefing.popup.body+='\n\nForce roles: '+note;
 return m;
}
module.exports={modernizeMissionRoster};
