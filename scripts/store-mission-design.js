'use strict';
// Authored, deliberately scaled battlefields. Dates/terrain references are in
// custom-maps/HISTORICAL-NOTES.md; these are RTS adaptations, not reconstructions.
const SP=27,DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const notes={
 'thermopylae-480':{gamePeriod:'ancient',date:'480 BCE',difficulty:'Hard',objective:'Hold the Hot Gates for 4:00 and watch the mountain trail.',sources:['https://www.livius.org/sources/content/herodotus/herodotus-on-thermopylae/']},
 'hastings-1066':{gamePeriod:'medieval',date:'14 October 1066',difficulty:'Standard',objective:'Break the shield wall on Senlac Ridge and secure the English rear.',sources:['https://www.english-heritage.org.uk/visit/places/1066-battle-of-hastings-abbey-and-battlefield/history-and-stories/what-happened-battle-hastings/']},
 'austerlitz-1805':{gamePeriod:'napoleonic',date:'2 December 1805',difficulty:'Hard',objective:'Cross the Goldbach, seize the Pratzen Heights and split the allied armies.',sources:['https://www.defense.gouv.fr/terre/mieux-nous-connaitre/histoire-larmee-terre/larmee-terre-travers-ses-batailles/2-decembre-1805-bataille','https://www.napoleon.org/en/history-of-the-two-empires/articles/the-battle-of-austerlitz-and-the-principles-of-war/']},
 'el-alamein-1942':{gamePeriod:'modern',date:'23 October–4 November 1942',difficulty:'Standard',objective:'Break the northern defensive belt and secure the Axis rear position.',sources:['https://www.nam.ac.uk/explore/battle-alamein']},
 'normandy-dday':{gamePeriod:'modern',date:'6–12 June 1944',difficulty:'Hard',objective:'Link the beachheads through Sainte-Mère-Église, Carentan, Isigny, Bayeux and Ouistreham.',sources:['https://www.nam.ac.uk/explore/d-day','https://carentanlesmarais.fr/decouvrir/dday/']},
 'kursk-citadel':{gamePeriod:'modern',date:'5–12 July 1943',difficulty:'Hard',objective:'Hold Kursk and the Oboyan sector for 5:00.',sources:['https://tankmuseum.org/article/background-battle-kursk']},
 'midway-1942':{gamePeriod:'modern',date:'4–7 June 1942',difficulty:'Standard',objective:'Defeat the approaching Japanese naval force.',sources:['https://www.history.navy.mil/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1942/midway.html']}
};
function terrainNoise(q,r,seed=1) {
 const hash=(x,y)=>{const v=Math.sin(x*127.1+y*311.7+seed*.017)*43758.5453123;return v-Math.floor(v);};
 const sample=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y),a=x-ix,b=y-iy,u=a*a*(3-2*a),v=b*b*(3-2*b);return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;};
 return sample(q*.085,r*.085)*.62+sample(q*.19+31,r*.19-17)*.27+sample(q*.42-7,r*.42+11)*.11;
}
function buildHistoricalMissions({MapBuilder,ev}) {
 const result=[];
 const start=(size,seed,shape)=>{const b=new MapBuilder(size,seed);b.generateBase(shape,seed,{biomeAccent:'balanced',mountainStyle:'low'});return b;};
 const town=(b,q,r,owner,name)=>{b.ensureLand(q,r,4);return b.city(q,r,owner,name,{blocks:9});};
 const army=(b,owner,q,r,infantry,heavy=0)=>{
  for(let i=0;i<infantry+heavy;i++)b.unit(i<infantry?'light':'heavy',owner,q+(i%4)*3,r+Math.floor(i/4)*3,owner===1?'Field regiment '+(i+1):'Opposing regiment '+(i+1));
 };
 const finish=(b,id,name,brief,events,aiCount=1,alliances=[])=>{
  const n=notes[id];b.each(h=>{if(!h.owner)h.owner=1;});
  const data=b.export({money:24000,manpower:22000,aiMoney:{2:22000,3:18000},aiManpower:{2:20000,3:16000},alliances,mission:{version:1,title:name,victoryMode:'domination',events:[ev(id+'-brief','Battle orders',{type:'timer',seconds:0},{title:name,kicker:n.date+' · '+n.difficulty,style:'briefing',body:brief+'\n\nObjective: '+n.objective+'\n\nHistorically inspired RTS scenario. Geography, timescale and unit roles are adapted for Simple Wars.'}),...events]}});
  result.push({file:id+'.json',entry:{id,name,description:n.date+' — '+n.objective,price:150,file:id+'.json',aiCount,packType:'oneshot',...n},data});
 };
 {
  const b=start(48,480,'island');
  b.each(h=>{
   const n=terrainNoise(h.q,h.r,480),coast=-6+Math.sin(h.q/13)*2.5+(n-.5)*5;
   const ridge=13+Math.sin(h.q/16)*3.5+(n-.5)*8;
   h.type=h.r<coast?'water':h.r>ridge?(n>.57?'hill':'mountain'):n>.65?'forest':n<.27?'hill':'grass';
   h.owner=h.q<(-7+Math.sin(h.r/12)*1.4)?2:1;
  });
  b.landCorridor(-42,3,40,3,3);b.landCorridor(-34,22,32,23,1);
  for(const h of b.hexes.values())if(h.type==='grass'&&h.r>12)h.type=terrainNoise(h.q,h.r,480)>.5?'forest':'hill';
  b.blob(-30,8,4,'forest',{onlyType:'grass'});b.blob(24,9,4,'forest',{onlyType:'grass'});b.coastSand(.7);
  town(b,24,4,1,'Hot Gates');town(b,36,22,1,'Greek rear camp');town(b,-34,1,2,'Persian coastal camp');town(b,-34,23,2,'Mountain approach');
  b.each(h=>{if(h.type==='grass'&&h.r>14&&!h.cityId)h.type=terrainNoise(h.q,h.r,480)>.52?'forest':'hill';});
  b.fort(1,3,1);b.fort(26,23,1);
  army(b,1,1,1,10);army(b,1,24,21,4);army(b,2,-25,0,12);army(b,2,-28,22,4);
  finish(b,'thermopylae-480','Thermopylae: The Hot Gates','Lead the Greek defenders between the mountains and the sea. The main road is narrow, but a hill trail reaches your rear. Keep a reserve near that trail while the pass garrison holds.',[
   ev('thermo-flank','The mountain trail',{type:'timer',seconds:120},{title:'Watch the high path',body:'Persian scouts are taking the hill trail. Defend the eastern exit while your main force holds the coast.',style:'alert'},[{owner:2,type:'light',count:3,anchor:'coords',x:-25*SP,y:23*SP}],[{owner:2,scope:'reinforcements',x:30*SP,y:23*SP}]),
   ev('thermo-reserve','Greek reserves',{type:'timer',seconds:210},{title:'A chance to counterattack',body:'Fresh Greek troops reach the rear camp. Keep the supply route open, then push west toward the Persian camps.',style:'briefing'},[{owner:1,type:'light',count:3,anchor:'player_city'}])
  ]);
 }
 {
  const b=start(48,10661014,'forest');
  b.each(h=>{h.type=Math.abs(h.q)>46||Math.abs(h.r)>35?'water':'grass';h.owner=h.r>Math.sin(h.q/16)*1.7?1:2;});
  for(const h of b.hexes.values())if(h.type==='grass'){
   const n=terrainNoise(h.q,h.r,1066),ridge=(h.q/30)**2+((h.r+11)/8)**2;
   if(ridge<1+(n-.5)*1.1)h.type='hill';
   if((Math.abs(h.q)>22&&n>.4)||n>.7)h.type='forest';
  }
  b.blob(-28,-20,9,'forest',{onlyType:'grass'});b.blob(30,14,7,'forest',{onlyType:'grass'});
  town(b,-18,25,1,'Hastings');town(b,18,23,1,'Norman camp');town(b,-8,-20,2,'Battle');town(b,23,-26,2,'Caldbec Hill');
  army(b,1,-14,8,8,4);army(b,2,-14,-12,12);army(b,2,20,-20,4);
  finish(b,'hastings-1066','Hastings: Senlac Ridge','Command the Norman army below the English shield wall. Infantry can pin the ridge while cavalry uses the clear approaches on either side. Woods constrain wide flanking moves.',[
   ev('hastings-rally','English rally',{type:'timer',seconds:130},{title:'The shield wall reforms',body:'English reserves are gathering behind the ridge. Use your infantry and cavalry together rather than sending isolated charges uphill.',style:'alert'},[{owner:2,type:'light',count:3,anchor:'enemy_city'}]),
   ev('hastings-cavalry','Norman cavalry reserve',{type:'timer',seconds:210},{title:'Reserve horsemen arrive',body:'Fresh Norman cavalry is ready at your rear. Exploit a gap after the infantry establishes a foothold.',style:'briefing'},[{owner:1,type:'heavy',count:2,anchor:'player_city'}])
  ]);
 }
 {
  const b=start(52,18051202,'rectangle');
  b.each(h=>{h.type=Math.abs(h.q)>49||Math.abs(h.r)>37?'water':'grass';h.owner=h.q<(-5+Math.sin(h.r/13)*1.4)?1:h.r<(8+Math.sin(h.q/16))?2:3;});
  for(const h of b.hexes.values())if(h.type==='grass'){const n=terrainNoise(h.q,h.r,1805),plateau=((h.q-10)/22)**2+((h.r+2)/18)**2;if(plateau<1+(n-.5)*1.3)h.type=n>.62?'forest':'hill';else if(n>.66)h.type='forest';}
  b.blob(18,29,8,'swamp',{onlyType:'grass'});b.blob(33,-20,7,'forest',{onlyType:'grass'});b.blob(-34,-23,6,'forest',{onlyType:'grass'});
  for(let r=-32;r<=30;r++){const q=-10+Math.round(Math.sin(r/12));b.set(q,r,'water');}
  for(const r of [-19,0,20]){const q=-10+Math.round(Math.sin(r/12));b.bridge(q,r,0,1);}
  town(b,-31,-17,1,'French headquarters');town(b,-29,22,1,'Telnitz approach');town(b,12,-5,2,'Pratzen');town(b,34,-24,2,'Austerlitz');town(b,28,22,3,'Sokolnitz rear');
  army(b,1,-26,-10,8,4);army(b,1,-25,15,4);army(b,2,12,-14,6,2);army(b,3,17,15,6,2);
  finish(b,'austerlitz-1805','Austerlitz: The Pratzen Heights','Lead the French army west of the Goldbach. Three crossings lead toward the heights. The Russian and Austrian forces support each other; use a concentrated central attack while guarding your southern approaches.',[
   ev('austerlitz-south','Allied southern pressure',{type:'timer',seconds:120},{title:'Pressure on the right',body:'Allied troops are moving toward the southern crossing. Keep a screen there while your main force advances toward Pratzen.',style:'alert'},[{owner:3,type:'light',count:3,anchor:'enemy_city'}],[{owner:3,scope:'reinforcements',x:-18*SP,y:20*SP}]),
   ev('austerlitz-reserve','French reserves',{type:'timer',seconds:210},{title:'Commit the reserve',body:'Fresh French troops can support the central attack or rescue an exposed crossing.',style:'briefing'},[{owner:1,type:'light',count:3,anchor:'player_city'}])
  ],2,[[2,3]]);
 }
 {
  const b=start(52,19421023,'desert');
  b.each(h=>{const n=terrainNoise(h.q,h.r,1942),north=-27+Math.sin(h.q/11)*2+(n-.5)*5,south=25+Math.sin(h.q/14)*3+(n-.5)*7;h.type=h.r<north?'water':h.r>south?(n>.5?'mountain':'swamp'):n>.62?'hill':'sand';h.owner=h.q>Math.sin(h.r/14)*1.6?1:2;});
  for(const h of b.hexes.values())if(h.type==='sand'&&terrainNoise(h.q+20,h.r-7,1942)>.66)h.type='hill';b.blob(8,29,9,'swamp',{onlyType:'mountain'});
  town(b,31,-13,1,'El Alamein');town(b,33,17,1,'Alexandria road');town(b,-32,-12,2,'El Daba');town(b,-30,17,2,'Axis supply camp');town(b,-12,-21,2,'Tell el Eisa');
  for(const r of [-15,-3,10,22])b.fort(-9,r,2);
  army(b,1,12,-15,6,6);army(b,1,13,13,4);army(b,2,-24,-12,8,4);army(b,2,-23,15,4);
  finish(b,'el-alamein-1942','El Alamein: Breakthrough','Command the Eighth Army between the Mediterranean coast and the southern depression. The defensive belts are represented by spaced forts. Pin the center, concentrate infantry and armor on one lane, and keep the approach behind your assault secure.',[
   ev('alamein-counter','Axis reserve',{type:'timer',seconds:150},{title:'Armored counterattack',body:'Axis armor is entering from its rear supply camp. Keep infantry with your tanks and protect the breach.',style:'alert'},[{owner:2,type:'heavy',count:2,anchor:'enemy_city'}]),
   ev('alamein-push','Fresh infantry',{type:'timer',seconds:230},{title:'Infantry reserves arrive',body:'Fresh infantry can widen your breakthrough or guard the route back to El Alamein.',style:'briefing'},[{owner:1,type:'light',count:3,anchor:'player_city'}])
  ]);
 }
 return result;
}
function polishStoreMission(m) {
 const d=m.data,meta=notes[m.entry.id]||m.entry;Object.assign(m.entry,meta);d.gamePeriod=meta.gamePeriod;d.hexRadius=20;
 const cells=new Map(d.hexList.map(h=>[`${h.q},${h.r}`,h])),wet=h=>h?.type==='water'||h?.type==='deep_water';
 // Reduce the Normandy objective clutter: beach batteries remain represented by
 // forts, while distinct inland towns are the actual capture objectives.
 if(m.entry.id==='normandy-dday'){
  const removed=new Set(d.cities.filter(c=>['Valognes','Arromanches','Courseulles-sur-Mer','Longues-sur-Mer','Vierville-sur-Mer'].includes(c.name)).map(c=>c.id));
  d.cities=d.cities.filter(c=>!removed.has(c.id));for(const h of d.hexList)if(removed.has(h.cityId)){h.type='grass';delete h.cityId;delete h.urbanVariant;}
 }
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
  if(m.entry.id==='normandy-dday'&&u.owner===1&&u.type==='light'&&wet(h))u.type='marine';
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
module.exports={buildHistoricalMissions,polishStoreMission,terrainNoise};
