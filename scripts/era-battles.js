'use strict';
// The shop's era battles: four for each older era, fought with that era's own troops (js/eras.js, js/game.js
// WOD_SPECIALIST_ERAS):
//   ancient     Gaugamela (attack)   Thermopylae (hold the pass)   Salamis (fleet)          Cannae (hold the centre)
//   medieval    Hastings (attack)    Agincourt (hold the line)     Stirling Bridge (attack) Hattin (hold the springs)
//   napoleonic  Austerlitz (attack)  Waterloo (hold the ridge)     Borodino (attack)        Trafalgar (fleet)
// One type plays a different part in each era: light = hoplites / men-at-arms / line infantry; motorized = cavalry /
// mounted men-at-arms / dragoons; mountaineer = skirmishers with javelins / rangers with bows / chasseurs; heavy =
// chariots / knights / heavy horse; ship = triremes. The maps are small and drawn cell by cell, the armies start at
// their full strength (mission.fullStartingArmy) and manpower is short, so the battle is fought by the armies on the
// map and the scripted waves, not by whoever buys more. These are RTS adaptations: geography, numbers and time are
// compressed (custom-maps/HISTORICAL-NOTES.md).
const {catmull,distance}=require('./historical-battlefields');
const {terrainNoise}=require('./store-mission-design');
const SP=27;
// The same numbers a unit trained in the game has (js/production.js createUnitAt, WOD_SPECIALIST_UNITS).
const STATS={
 light:{hp:100,speed:15,damage:8,range:50,attackCooldown:2,radius:12},
 heavy:{hp:300,speed:15,damage:18,range:60,attackCooldown:2.8,radius:16,tanks:500,maxTanks:500},
 motorized:{hp:180,speed:15,damage:12,range:55,attackCooldown:2.3,radius:14},
 mountaineer:{hp:85,speed:15,damage:6,range:50,attackCooldown:2,radius:12},
 marine:{hp:100,speed:15,damage:8,range:50,attackCooldown:2,radius:12},
 ship:{hp:300,speed:15,damage:14,range:80,attackCooldown:2.4,radius:16,manpower:5000,maxManpower:5000}
};
const ADAPTATION='Scaled RTS adaptation: geography, force sizes and time are compressed. Each era fights with its own troops; scripted waves stand for the formations of the day rather than exact orders of battle.';

/** Linear interpolation through [x, y] points sorted by x. */
function lerpPts(points,x){if(x<=points[0][0])return points[0][1];for(let i=1;i<points.length;i++)if(x<=points[i][0]){const [x0,y0]=points[i-1],[x1,y1]=points[i];return y0+(y1-y0)*(x-x0)/(x1-x0);}return points.at(-1)[1];}
const inEllipse=(q,r,cq,cr,rq,rr,edge=1)=>((q-cq)/rq)**2+((r-cr)/rr)**2<edge;
/** A gently winding offset along a line (for borders, ridge crests and wood edges): two slow waves of its own phase. */
const wind=(t,phase,amp=1.6)=>amp*(Math.sin(t/6.3+phase)*.65+Math.sin(t/2.9+phase*1.7)*.35);

class Field {
 constructor(MapBuilder,size,seed){
  this.b=new MapBuilder(size,seed);this.b.mapShape='rectangle';this.seed=seed;
  this.occupied=new Set();this.features=[];this.roads=[];this.n=(q,r,s=0)=>terrainNoise(q,r,seed+s);
 }
 /** Sets every cell's terrain and owner: fn(cell, noise) where noise is 0..1, smooth over a few cells. */
 paint(fn){this.b.each(h=>{fn(h,this.n(h.q,h.r));if(h.type==='water')h.owner=0;});}
 /** A stream or river along a smooth curve through [q, r] points; fords are [q, r] cells left dry. */
 river(points,width,fords=[]){
  const samples=catmull(points);
  this.b.each(h=>{const near=distance(h.q,h.r,samples);if(near.d<=width*(1+.12*Math.sin(near.index*.21))&&!fords.some(([q,r])=>Math.abs(h.q-q)<=1.2&&Math.abs(h.r-r)<=1.2)){h.type='water';h.owner=0;}});
  return samples;
 }
 /** A town of nine cells, or a camp of five (blocks 5: quicker to take). */
 town(q,r,owner,name,blocks=9){
  for(let dq=-2;dq<=2;dq++)for(let dr=-2;dr<=2;dr++){const h=this.b.at(q+dq,r+dr);if(h){if(h.type==='water'||h.type==='mountain')h.type='grass';h.owner=owner;}}
  const c=this.b.city(q,r,owner,name,{blocks});return c;
 }
 /** A unit at the nearest free cell around (q, r) it can stand on, with the game's stats for its type. */
 unit(type,owner,q,r,name){
  const naval=type==='ship',afloat=type==='marine'&&this.b.at(Math.round(q),Math.round(r))?.type==='water';
  // (a marine authored on the water starts afloat in its landing craft; anything else on its own dry ground)
  const ok=h=>!this.occupied.has(h.q+','+h.r)&&(naval||afloat?h.type==='water':h.type!=='water'&&h.type!=='mountain'&&h.owner===owner);
  const h=this.b.nearestWhere(Math.round(q),Math.round(r),9,ok);
  if(!h)throw Error('no room for '+name+' near '+q+','+r);
  this.occupied.add(h.q+','+h.r);
  this.b.unitSeq++;
  const s=STATS[type];
  const u={type,owner,name,x:h.x,y:h.y,target:null,hp:s.hp,maxHp:s.hp,manpower:1000,maxManpower:1000,tanks:0,maxTanks:0,
   selected:false,shake:0,activeCombatVisual:0,morale:100,maxMorale:100,moraleBroken:false,xp:0,kills:0,losses:0,tankKills:0,
   tankLosses:0,veteran:false,uid:'eu_'+this.seed+'_'+this.b.unitSeq,...s,
   // (keeps its historical name: the game numbers every other unit by type, js/core.js wodRenumberOwnerUnits)
   nameCustom:true};
  this.b.entities.push(u);return u;
 }
 /** n units of one type evenly along a line from (q0, r0) to (q1, r1); names get a numeral when n > 1. */
 line(type,owner,q0,r0,q1,r1,n,name){
  const roman=['I','II','III','IV','V','VI','VII','VIII','IX','X'];
  for(let i=0;i<n;i++){const t=n===1?.5:i/(n-1);this.unit(type,owner,q0+(q1-q0)*t,r0+(r1-r0)*t,n>1?name+' '+roman[i]:name);}
 }
 /** A bridge over a river drawn with river() (its samples), at the river cell nearest (q, r); the deck cells belong
  *  to owner. Laid the way the campaign maps lay theirs (scripts/historical-battlefields.js applyPlan). */
 bridge(q,r,samples,width,owner){
  const near=distance(q,r,samples),i=near.index,a=samples[Math.max(0,i-2)],z=samples[Math.min(samples.length-1,i+2)],angle=Math.atan2(z[1]-a[1],z[0]-a[0])+Math.PI/2;
  this.b.bridge(q,r,angle,0);const br=this.b.bridges.at(-1);br.w=SP*(width*2+2.4);br.h=SP*1.3;
  this.b.each(h=>{const dx=h.q-q,dy=h.r-r,u=dx*Math.cos(angle)+dy*Math.sin(angle),v=-dx*Math.sin(angle)+dy*Math.cos(angle);if(Math.abs(u)<=br.w/SP/2&&Math.abs(v)<=.66){h.type='bridge';h.owner=owner;}});
 }
 fort(q,r,owner){this.b.fort(q,r,owner);}
 label(name,q,r,kind='land'){this.features.push({name,x:q*SP,y:r*SP,kind});}
 road(from,to,via=[]){this.roads.push({from,to,points:[[from.q,from.r],...via,[to.q,to.r]].map(([q,r])=>({x:q*SP,y:r*SP}))});}
}

const at=(q,r)=>({x:q*SP,y:r*SP});
function finish(f,ev,spec){
 const {id,name,era,date,difficulty,objective,brief,history,note,sources,events,goal,economy,alliances=[],aiCount=1,enemyManpowerRate,adaptation=ADAPTATION}=spec;
 // every dry cell belongs to someone (a neutral pocket reads as a bug); water to nobody
 f.b.each(h=>{if(h.type==='water')h.owner=0;else if(!h.owner)h.owner=1;});
 const towns=goal.towns.map(n=>{const c=f.b.cities.find(c=>c.name===n);if(!c)throw Error(id+': no objective town '+n);return c;});
 const intro=ev(id+'-brief','Battle orders',{type:'timer',seconds:0},{title:name,kicker:date+' · '+difficulty,style:'briefing',
  body:brief+'\n\nObjective: '+objective+'\n\n'+history});
 const data=f.b.export({money:economy.money,manpower:economy.manpower,aiMoney:economy.aiMoney,aiManpower:economy.aiManpower,alliances,
  mission:{version:1,title:name,victoryMode:'domination',fullStartingArmy:true,...(enemyManpowerRate!=null?{enemyManpowerRate}:{}),
   objective:{type:goal.type,label:objective,cityIds:towns.map(c=>c.id),duration:goal.duration||0,owner:2},
   battlefield:{version:1,northUp:true,note,features:f.features},
   events:[intro,...events]}});
 if(f.roads.length)data.roads=f.roads;
 data.gamePeriod=era;data.hexRadius=20;
 for(const c of data.cities){c.hasFactory=false;c.hasHarbor=false;c.hasFarm=false;c.incomeBonus=0;c.manpowerBonus=0;}
 const entry={id,name,description:date+' — '+objective,price:spec.price||150,file:id+'.json',aiCount,packType:'oneshot',gamePeriod:era,date,difficulty,
  objective,sources,history,adaptation,mapNote:note,kind:'mission',authoredBattle:true};
 return {file:id+'.json',entry,data};
}

// ---------------------------------------------------------------- ancient
function thermopylae(MapBuilder,ev){
 const f=new Field(MapBuilder,30,480);
 // North: the Malian Gulf. South: the Kallidromos massif. Between them the coast road narrows to a pass four cells
 // wide at the Hot Gates; the Anopaia path climbs through the mountains behind it.
 const coast=[[-30,-13],[-17,-12],[-9,-6],[-5,-3],[5,-3],[9,-6],[17,-9],[30,-10]];
 const cliffs=[[-30,9],[-17,8],[-9,4],[-5,2],[5,2],[9,4],[17,5],[30,6]];
 const trail=catmull([[-19,9],[-13,13],[-5,15],[3,14],[9,11],[13,7],[15,3]]);
 f.paint((h,n)=>{
  const sea=lerpPts(coast,h.q)+(n-.5)*1.6,rock=lerpPts(cliffs,h.q)+(n-.5)*1.8;
  if(h.r<sea)h.type='water';
  else if(h.r>=rock)h.type=distance(h.q,h.r,trail).d<1.15?'hill':'mountain';
  else if(h.r>=rock-1.6)h.type='hill';
  else if(h.r<sea+1.2)h.type='sand';
  else if(h.q<-15&&h.r<sea+5&&f.n(h.q,h.r,7)>.55)h.type='swamp';
  else if(h.q>9&&n>.66)h.type='forest';
  else h.type='grass';
  h.owner=h.q<-4+wind(h.r,1.1,1.2)?2:1;
 });
 // the narrows themselves are open ground: no wood or marsh in the pass
 f.b.each(h=>{if(Math.abs(h.q)<=5&&h.type==='forest')h.type='grass';});
 const gates=f.town(2,-1,1,'Hot Gates'),alpenoi=f.town(21,-5,1,'Alpenoi'),trachis=f.town(-22,-4,2,'Trachis'),pathCamp=f.town(-21,5,2,'Persian camp');
 f.fort(-1,0,1);f.fort(18,-3,1);
 f.road(trachis,gates,[[-12,-5],[-5,-1]]);f.road(gates,alpenoi,[[9,-3],[15,-5]]);
 // Greeks: the hoplite line in the narrows, the Phocians on the mountain path, a squadron of the fleet offshore
 f.line('light',1,-3,-2,-3,1,4,'Spartan hoplites');
 f.line('light',1,-1,-2,-1,1,3,'Allied hoplites');
 f.line('light',1,20,-7,22,-7,2,'Thespian hoplites');
 f.unit('mountaineer',1,6,0,'Locrian javelinmen');
 f.unit('mountaineer',1,5,14,'Phocian guard');f.unit('mountaineer',1,8,12,'Phocian guard II');
 f.line('ship',1,3,-9,8,-10,2,'Greek trireme');
 // Persians: the army of Xerxes on the plain of Trachis, its fleet in the gulf
 f.line('light',2,-13,-7,-13,3,5,'Median spearmen');
 f.line('light',2,-16,-7,-16,3,5,'Cissian infantry');
 f.line('mountaineer',2,-19,-6,-19,2,3,'Persian archers');
 f.line('motorized',2,-24,-9,-24,1,3,'Persian cavalry');
 f.line('ship',2,-18,-17,-10,-17,3,'Persian trireme');
 f.label('Malian Gulf',-4,-14,'water');f.label('Kallidromos',-6,19);f.label('The narrows',-2,-4);f.label('Anopaia path',-9,16);f.label('Plain of Trachis',-16,0);
 return finish(f,ev,{id:'thermopylae-480',name:'Thermopylae: The Hot Gates',era:'ancient',date:'480 BCE',difficulty:'Standard',
  objective:'Hold the Hot Gates for 5:00.',goal:{type:'hold',towns:['Hot Gates'],duration:300},
  brief:'You command the Greek defenders where the coast road runs between the sea and the cliffs. The pass is only four men wide: hold it with your hoplites and the Persian numbers count for little. Persian ships will try to shoot into your flank from the gulf, so keep your triremes between them and the shore. A shepherd\'s path climbs through the mountains behind you; the Phocians are guarding it.',
  history:'In 480 BCE a Greek army led by Leonidas of Sparta held the pass of Thermopylae against Xerxes for three days, until a local guide led the Persians over the mountain path behind them.',
  note:'A narrow coast road between the Malian Gulf and the Kallidromos cliffs, with the Anopaia path winding through the mountains to the Greek rear.',
  sources:['https://www.livius.org/sources/content/herodotus/herodotus-on-thermopylae/'],
  economy:{money:8000,manpower:2500,aiMoney:{2:16000},aiManpower:{2:1500}},
  events:[
   ev('thermo-medes','The Medes attack',{type:'timer',seconds:20},{title:'The Medes attack',body:'Xerxes sends his Median spearmen into the pass. Hold the line at the narrows; the Persian archers will shoot over their heads.',style:'alert'},[],[{owner:2,scope:'all',x:at(1,-1).x,y:at(1,-1).y}]),
   ev('thermo-immortals','The Immortals',{type:'timer',seconds:150},{title:'The Immortals',body:'The Persian king\'s own guard, the Ten Thousand Immortals, marches into the pass.',style:'alert'},
    [{owner:2,type:'light',count:5,anchor:'coords',...at(-18,-3)},{owner:2,type:'mountaineer',count:2,anchor:'coords',...at(-20,-1)}],[{owner:2,scope:'reinforcements',...at(1,-1)}]),
   ev('thermo-path','The mountain path',{type:'timer',seconds:110},{title:'Betrayed: the mountain path',body:'A local man has shown the Persians the Anopaia path. A column is climbing through the mountains to come down behind the Hot Gates. Hold it on the path with the Phocians, or turn part of your line to meet it.',style:'alert'},
    [{owner:2,type:'light',count:6,anchor:'coords',...at(-17,9)},{owner:2,type:'mountaineer',count:2,anchor:'coords',...at(-18,7)}],[{owner:2,scope:'reinforcements',...at(7,-1)}]),
   ev('thermo-allies','Allied contingents',{type:'timer',seconds:200},{title:'Allied contingents',body:'Hoplites from the allied cities reach Alpenoi. Send them to wherever the line is weakest.',style:'briefing'},
    [{owner:1,type:'light',count:2,anchor:'coords',...at(20,-6)}]),
   ev('thermo-last','The last assault',{type:'timer',seconds:240},{title:'The last assault',body:'Xerxes throws everything he has left at the pass. One more minute.',style:'alert'},
    [{owner:2,type:'light',count:5,anchor:'coords',...at(-18,-3)},{owner:2,type:'motorized',count:2,anchor:'coords',...at(-20,-6)}],[{owner:2,scope:'all',...at(1,-1)}])
  ]});
}

function gaugamela(MapBuilder,ev){
 const f=new Field(MapBuilder,30,331);
 // A broad, dry plain that Darius had levelled for his chariots, the Bumodus river on the west edge and the hills of
 // Jebel Maqlub in the north-east. Macedonians in the south, the Persian centre in the north, Bessus's wing north-east.
 const river=catmull([[-25,-24],[-24,-10],[-27,4],[-25,24]]);
 f.paint((h,n)=>{
  const levelled=Math.abs(h.q)<16&&h.r>-16&&h.r<-1;
  h.type=n<.36?'sand':'grass';
  if(!levelled&&n>.72)h.type='hill';
  if(!levelled&&f.n(h.q,h.r,9)>.78)h.type='forest';
  if(inEllipse(h.q,h.r,22,-19,9,5,1+(n-.5)*.6))h.type=inEllipse(h.q,h.r,23,-20,5,2.5)?'mountain':'hill';
  const near=distance(h.q,h.r,river);
  if(near.d<.95&&!(Math.abs(h.r+6)<=1||Math.abs(h.r-11)<=1))h.type='water';
  h.owner=h.r<-1+wind(h.q,.4,1.4)?(h.q>9+wind(h.r,2.2,1.5)?3:2):1;
 });
 const camp=f.town(0,-17,2,"Darius's camp",5),gaug=f.town(-13,-12,2,'Gaugamela'),bactra=f.town(19,-11,3,'Bactrian camp');
 const mac=f.town(0,18,1,'Macedonian camp'),ford=f.town(-17,14,1,'Bumodus ford');
 f.road(mac,camp,[[0,4],[0,-6]]);f.road(gaug,camp);f.road(ford,mac);
 // Macedonians: the phalanx in the centre, the hypaspists and Companions on the right, Parmenion's Thessalians left
 f.line('light',1,-11,6,9,6,8,'Phalanx');
 f.line('light',1,10,5,13,5,3,'Hypaspists');
 f.line('motorized',1,10,8,16,8,4,'Companion cavalry');
 f.unit('motorized',1,-14,7,'Thessalian cavalry');
 f.unit('mountaineer',1,13,4,'Agrianian javelinmen');f.unit('mountaineer',1,-11,4,'Cretan archers');
 // Persians: a long line of infantry with archers in front, cavalry on both wings, the guard at the camp
 f.line('light',2,-8,-8,8,-8,4,'Persian infantry');
 f.line('mountaineer',2,-8,-6,8,-6,3,'Persian archers');
 f.unit('motorized',2,-15,-6,"Mazaeus's cavalry");
 f.unit('light',2,0,-14,'Immortals');
 // Bessus: Bactrian and Scythian horse on the Persian left
 f.line('motorized',3,12,-6,18,-4,2,'Bactrian cavalry');
 f.unit('light',3,18,-8,'Bactrian infantry');
 f.label('Gaugamela plain',-3,-3);f.label('Bumodus',-25,-14,'water');f.label('Jebel Maqlub',22,-21);f.label('Levelled ground',4,-11);
 return finish(f,ev,{id:'gaugamela-331',name:'Gaugamela: Alexander Charges',era:'ancient',date:'1 October 331 BCE',difficulty:'Hard',
  objective:"Capture Darius's camp.",goal:{type:'capture',towns:["Darius's camp"]},
  brief:'You command Alexander\'s army on the plain that Darius levelled for his scythed chariots. Your phalanx can stand against the chariots; your javelinmen and archers can break them. The Persian line is longer than yours: wait for it to stretch and swing onto your left, then drive the Companion cavalry through the gap to Darius\'s camp.',
  history:'At Gaugamela in 331 BCE Alexander the Great beat a much larger Persian army under Darius III. When the Persian left followed his move to the right, a gap opened and Alexander charged through it toward Darius, who fled.',
  note:'An open plain levelled for chariots, the Bumodus river with two fords on the west and the hills of Jebel Maqlub in the north-east.',
  sources:['https://www.livius.org/articles/battle/gaugamela-331-bce/'],
  economy:{money:12000,manpower:2500,aiMoney:{2:14000,3:8000},aiManpower:{2:1000,3:500}},alliances:[[2,3]],aiCount:2,enemyManpowerRate:.25,
  events:[
   ev('gaug-chariots','The scythed chariots',{type:'timer',seconds:12},{title:'The scythed chariots',body:'Darius sends his scythed chariots at your phalanx. Meet them with the javelinmen and archers, and let the phalanx stand.',style:'alert'},
    [{owner:2,type:'heavy',count:2,anchor:'coords',...at(0,-4)}],[{owner:2,scope:'reinforcements',...at(0,7)}]),
   ev('gaug-bessus','Bessus rides around the flank',{type:'timer',seconds:60},{title:'Bessus rides around the flank',body:'The Bactrian horse is swinging wide around your right. Hold them off with part of your force; the Persian line is stretching to follow.',style:'alert'},
    [],[{owner:3,scope:'all',...at(27,18)}]),
   ev('gaug-mazaeus','Mazaeus attacks Parmenion',{type:'timer',seconds:120},{title:'The gap opens',body:'The whole Persian line is swinging onto Parmenion and the Bumodus ford, and the centre in front of Darius\'s camp is opening. Hold the ford with the left wing and charge the gap with the Companions.',style:'alert'},
    [{owner:2,type:'motorized',count:1,anchor:'coords',...at(-18,-6)}],[{owner:2,scope:'all',...at(-15,10)}]),
   ev('gaug-reserve','The Greek allies',{type:'timer',seconds:150},{title:'The Greek allies',body:'The allied Greek infantry of the second line comes up behind the phalanx.',style:'briefing'},
    [{owner:1,type:'light',count:2,anchor:'coords',...at(0,12)}]),
   ev('gaug-guard',"The King's Kinsmen",{type:'timer',seconds:300},{title:"The King's Kinsmen",body:"Darius's guard gathers at the camp for a last stand.",style:'alert'},
    [{owner:2,type:'light',count:1,anchor:'coords',...at(0,-19)}])
  ]});
}

function salamis(MapBuilder,ev){
 const f=new Field(MapBuilder,28,480920);
 // Attica across the north and east, the island of Salamis in the south-west, and between them the strait, six or seven
 // cells wide, opening onto the Saronic Gulf in the south-east past the islet of Psyttaleia. A narrow channel runs west
 // round the north of the island. The Greek fleet waits in the strait, the Persian fleet comes in from the open gulf.
 f.paint((h,n)=>{
  const attica=lerpPts([[-28,-9],[-20,-9],[-12,-8],[-4,-6],[4,-6],[10,-3],[18,-1],[28,0]],h.q)+(n-.5)*1.4;
  const island=inEllipse(h.q,h.r,-15,10,13,10,1+(n-.5)*.3)||inEllipse(h.q,h.r,-22,-1,6,4,1+(n-.5)*.3);
  if(h.r<attica){
   h.owner=3;
   h.type=inEllipse(h.q,h.r,-10,-18,4,1.6)?'mountain':inEllipse(h.q,h.r,-10,-17,9,4,1+(n-.5)*.5)?'hill':h.r>attica-1.3?'sand':n>.68?'forest':'grass';
  }else if(island){h.owner=1;h.type=n>.7?'hill':n<.3?'sand':'grass';}
  else if(inEllipse(h.q,h.r,4,5,2.4,1.5)){h.owner=3;h.type='hill';}
  else h.type='water';
 });
 const sal=f.town(-18,11,1,'Salamis'),amb=f.town(-6,8,1,'Ambelaki'),throne=f.town(-8,-13,3,"Xerxes' throne"),phal=f.town(18,-5,3,'Phaleron');
 f.road(sal,amb,[[-12,10]]);f.road(throne,phal,[[2,-11],[10,-7]]);
 // Greeks: the allied fleet in line across the strait, Aristides' hoplites on the island
 // (the Greek crews know these waters and fight in close order: veterans)
 const veteran=u=>Object.assign(u,{veteran:true,xp:100});
 veteran(f.unit('ship',1,-10,-5,"Themistocles' flagship"));
 for(const [q,r,n] of [[-15,-3,'Athenian triremes I'],[-11.7,-2.7,'Athenian triremes II'],[-8.3,-2.3,'Athenian triremes III'],[-5,-2,'Athenian triremes IV'],[-18,-5,'Corinthian triremes'],[-13,-6,'Spartan triremes'],[-7,-4,'Megarian triremes']])veteran(f.unit('ship',1,q,r,n));
 f.line('light',1,-9,5,-9,10,2,"Aristides' hoplites");f.unit('mountaineer',1,-16,14,'Athenian archers');
 // Persians: the fleet in the gulf, Phoenicians in front; the army watching from the shore of Attica
 f.line('ship',2,6,12,20,6,3,'Phoenician squadron');
 f.line('ship',2,8,16,20,11,2,'Ionian squadron');
 f.unit('ship',2,2,18,"Artemisia's squadron");
 f.line('light',3,-11,-10,-5,-10,2,'Immortals');f.line('mountaineer',3,-2,-8,4,-8,2,'Persian archers');f.unit('motorized',3,15,-8,'Persian cavalry');
 f.label('Strait of Salamis',-9,-4,'water');f.label('Salamis',-20,16);f.label('Mount Aigaleos',-15,-20);f.label('Psyttaleia',4,2);
 f.label('Saronic Gulf',12,20,'water');f.label('Western channel',-25,-7,'water');f.label('Bay of Phaleron',23,3,'water');
 return finish(f,ev,{id:'salamis-480',name:'Salamis: The Narrow Strait',era:'ancient',date:'September 480 BCE',difficulty:'Standard',
  objective:'Sink the Persian fleet.',goal:{type:'fleet',towns:[]},
  brief:'You command the allied Greek fleet in the strait between Salamis and Attica. The Persians have more ships, coming in line after line, but in the narrows they cannot spread out or turn: keep your triremes together, beat each squadron before the next arrives, and keep clear of the Attic shore, where Persian archers are watching. Your crews know these waters. Ship counters stand for squadrons.',
  history:'In September 480 BCE Themistocles lured the Persian fleet into the strait of Salamis, where the Greek triremes, fewer but better handled in the narrow water, broke it while Xerxes watched from the shore. The defeat ended the Persian invasion by sea.',
  note:'The strait between the island of Salamis and the coast of Attica, the islet of Psyttaleia at its mouth, a narrow channel round the north of the island and Mount Aigaleos above the shore.',
  sources:['https://www.livius.org/articles/battle/salamis-480-bce/'],
  // (the Persian fleet holds no town and earns nothing: its gold pays its upkeep for well over the battle)
  economy:{money:14000,manpower:2500,aiMoney:{2:40000,3:8000},aiManpower:{2:500,3:800}},alliances:[[2,3]],aiCount:2,
  events:[
   ev('salamis-dawn','Into the strait',{type:'timer',seconds:12},{title:'The Persians row into the strait',body:'At dawn the Persian fleet comes into the narrows in long columns. Here their numbers cannot spread out: meet the leading squadrons together and ram them as their lines bunch up.',style:'alert'},[],[{owner:2,scope:'all',...at(-8,-3)}]),
   ev('salamis-egypt','The Egyptian squadron',{type:'timer',seconds:55},{title:'The Egyptian squadron',body:'Ships sent round Salamis in the night are coming down the western channel behind you. Turn part of your line to meet them.',style:'alert'},
    [{owner:2,type:'ship',count:2,anchor:'coords',...at(-26,-7)}],[{owner:2,scope:'reinforcements',...at(-12,-3)}]),
   ev('salamis-second','The second line',{type:'timer',seconds:110},{title:'The second line',body:'More Persian squadrons are pushing in behind the first and fouling one another in the narrows.',style:'alert'},
    [{owner:2,type:'ship',count:3,anchor:'coords',...at(24,16)}],[{owner:2,scope:'reinforcements',...at(-6,-1)}]),
   ev('salamis-aegina','The Aeginetans',{type:'timer',seconds:150},{title:'The Aeginetan ambush',body:'The Aeginetan squadron has been waiting at the mouth of the strait. Persian ships that turn back for the open gulf will run into it.',style:'briefing'},
    [{owner:1,type:'ship',count:2,anchor:'coords',...at(-2,19)}]),
   ev('salamis-xerxes','Xerxes watches',{type:'timer',seconds:230},{title:'Xerxes watches',body:'From his throne on Mount Aigaleos the king is watching his fleet break up. Sink what is left of it.',style:'briefing'})
  ]});
}

function cannae(MapBuilder,ev){
 const f=new Field(MapBuilder,30,216);
 // The open plain south of the Aufidus. The river runs down the west side; the Romans face south with their right on it,
 // the larger Roman camp behind them in the north and the smaller one across the river. Hannibal's line faces north:
 // the Gauls and Spaniards bowed forward in a crescent, the Libyans held back on both flanks, the hill town of Cannae
 // behind them.
 const course=catmull([[-30,-20],[-22,-13],[-19,-6],[-18,2],[-21,10],[-17,17],[-12,24]]);
 const bankAt=lerpPts.bind(null,course.map(([q,r])=>[r,q]).sort((a,b)=>a[0]-b[0]));
 f.paint((h,n)=>{
  h.type=n<.3?'sand':'grass';
  if(inEllipse(h.q,h.r,-3,18,7,3.5,1+(n-.5)*.5))h.type='hill';
  if(inEllipse(h.q,h.r,14,20,6,3,1+(n-.5)*.5)||h.r>21&&n>.6)h.type='hill';
  const near=distance(h.q,h.r,course);
  if(near.d<2.3&&f.n(h.q,h.r,4)>.55)h.type='forest';
  if(near.d<.95&&!(Math.abs(h.r+6)<=1.2||Math.abs(h.r-12)<=1.2))h.type='water';
  h.owner=h.q<bankAt(h.r)?(h.r<8?2:1):h.r<-3+wind(h.q,.6,1)?2:1;
 });
 const cannaeTown=f.town(-3,16,1,'Cannae'),camp=f.town(12,19,1,"Hannibal's camp"),roman=f.town(4,-18,2,'Roman camp'),small=f.town(-26,-6,2,'Small Roman camp',5);
 f.fort(-6,14,1);
 f.road(cannaeTown,camp,[[5,19]]);f.road(roman,cannaeTown,[[2,-8],[-1,6]]);f.road(small,roman,[[-19,-7],[-8,-14]]);
 // Carthaginians: the crescent, the Libyans on its wings, Hasdrubal's horse by the river, the Numidians on the right
 [['Gallic warriors I',-8,3],['Spanish infantry I',-5,1],['Gallic warriors II',-2,0],['Spanish infantry II',2,0],['Gallic warriors III',5,1],['Spanish infantry III',8,3]].forEach(([n,q,r])=>f.unit('light',1,q,r,n));
 f.line('light',1,-11,5,-11,8,2,'Libyan infantry');f.line('light',1,11,5,11,8,2,'Libyan infantry (right)');
 f.line('mountaineer',1,-3,-1,3,-1,2,'Balearic slingers');
 f.line('motorized',1,-15,2,-14,8,3,"Hasdrubal's horse");
 f.line('motorized',1,16,3,16,6,2,'Numidian horse');
 // Romans: the legions in a deep block, velites in front, cavalry on both wings, the triarii and a camp guard behind
 f.line('mountaineer',2,-6,-5,6,-5,3,'Velites');
 f.line('light',2,-8,-7,8,-7,5,'Roman legion');
 f.line('light',2,-8,-10,8,-10,5,'Allied legion');
 f.line('motorized',2,-16,-8,-13,-8,2,'Roman cavalry');f.line('motorized',2,13,-8,16,-8,2,'Allied cavalry');
 f.line('light',2,2,-14,6,-14,2,'Triarii');f.unit('light',2,-26,-3,'Small camp guard');
 f.label('Aufidus',-20,-2,'water');f.label('Hill of Cannae',-11,19);f.label('Plain of Cannae',6,-2);f.label('Larger Roman camp',10,-20);
 return finish(f,ev,{id:'cannae-216',name:'Cannae: The Double Envelopment',era:'ancient',date:'2 August 216 BCE',difficulty:'Hard',
  objective:'Hold Cannae for 5:00.',goal:{type:'hold',towns:['Cannae'],duration:300},
  brief:'You command Hannibal\'s army on the plain below Cannae. The Romans have nearly twice your infantry and mean to smash straight through your centre. Let them: the Gauls and Spaniards in the crescent give ground slowly while the Libyans on the flanks wait. When the legions are packed deep in the pocket, turn the Libyans inward and bring the cavalry round behind them. Hold Cannae until the trap closes.',
  history:'On 2 August 216 BCE Hannibal let a much larger Roman army push into the centre of his line at Cannae, then closed his African infantry on its flanks and his cavalry on its rear. Most of the Roman army was killed or captured.',
  note:'The plain of Cannae south of the Aufidus, with the river and its two fords on the west, the Roman camps north and across the river, and the hill of Cannae in the south.',
  sources:['https://en.wikipedia.org/wiki/Battle_of_Cannae'],
  economy:{money:12000,manpower:2500,aiMoney:{2:22000},aiManpower:{2:1500}},
  events:[
   ev('cannae-advance','The legions advance',{type:'timer',seconds:15},{title:'The legions advance',body:'Varro sends the legions straight at your centre, packed deep and narrow. Let the crescent bend back slowly, and keep the Libyans out of the fight until the Romans are deep inside it.',style:'alert'},[],[{owner:2,scope:'all',...at(-2,14)}]),
   ev('cannae-hasdrubal','Hasdrubal by the river',{type:'timer',seconds:70},{title:'Hasdrubal by the river',body:'Hasdrubal\'s Spanish and Gallic horse have the Roman cavalry pinned against the Aufidus, and fresh squadrons are coming up. Break the Roman horse, then ride round behind the legions.',style:'briefing'},
    [{owner:1,type:'motorized',count:2,anchor:'coords',...at(-15,12)}]),
   ev('cannae-reserve','The Roman reserves',{type:'timer',seconds:120},{title:'The Roman reserves',body:'The last legions leave the Roman camp to push the attack through your centre.',style:'alert'},
    [{owner:2,type:'light',count:4,anchor:'coords',...at(4,-16)}],[{owner:2,scope:'reinforcements',...at(-2,14)}]),
   ev('cannae-trap','The trap closes',{type:'timer',seconds:180},{title:'The trap closes',body:'The legions are deep inside the crescent and packed too tight to fight. Turn the Libyans inward on their flanks. The Numidians are back from chasing the allied horse.',style:'briefing'},
    [{owner:1,type:'motorized',count:2,anchor:'coords',...at(20,8)}]),
   ev('cannae-last','The last push',{type:'timer',seconds:240},{title:'The garrison breaks out',body:'The guard of the small camp crosses the Aufidus to break through to Cannae.',style:'alert'},
    [{owner:2,type:'light',count:3,anchor:'coords',...at(-25,-8)},{owner:2,type:'motorized',count:1,anchor:'coords',...at(-27,-9)}],[{owner:2,scope:'reinforcements',...at(-3,15)}])
  ]});
}

// ---------------------------------------------------------------- medieval
function hastings(MapBuilder,ev){
 const f=new Field(MapBuilder,30,1066);
 // Senlac ridge across the middle, the English on top of it; woods on both flanks, a marshy brook along its foot,
 // Telham Hill and the Normans to the south, the harbour of Hastings in the south-west corner.
 f.paint((h,n)=>{
  const crest=-6+wind(h.q,.3,1.8),half=2.3+wind(h.q,2.5,.9)+(n-.5)*1.2,ends=17+wind(h.r,1.4,2.5);
  const brook=1.5+wind(h.q,4.1,1.3);
  h.type='grass';
  if(Math.abs(h.q)<=ends&&Math.abs(h.r-crest)<=half)h.type='hill';
  if(Math.abs(h.q)>ends+1&&h.r<6+wind(h.q,3,2)&&n>.36)h.type='forest';
  if(h.r<-15+wind(h.q,5,2)&&f.n(h.q,h.r,3)>.5)h.type='forest';
  if(Math.abs(h.r-brook)<1.2+(f.n(h.q,h.r,5)-.5)*1.6&&Math.abs(h.q)>4)h.type='swamp';
  if(inEllipse(h.q,h.r,0,17,7,3.5))h.type='hill';
  if(inEllipse(h.q,h.r,-31,25,11,7,1+(n-.5)*.4))h.type='water';
  h.owner=h.r<-2+wind(h.q,1.9,1.2)?(h.q<-8+wind(h.r,.7,1.5)?3:2):1;
 });
 const senlac=f.town(2,-7,2,'Senlac ridge'),caldbec=f.town(6,-19,2,'Caldbec Hill'),fyrd=f.town(-17,-14,3,'Fyrd camp');
 const telham=f.town(0,16,1,'Telham Hill'),hast=f.town(-17,16,1,'Hastings');
 f.fort(3,-5,2);
 f.road(telham,senlac,[[1,8],[2,0]]);f.road(senlac,caldbec,[[4,-13]]);f.road(hast,telham,[[-8,18]]);
 // English: housecarls in a shield wall along the crest, the king's guard at the standard, the fyrd on the right
 f.line('light',2,-4,-4,9,-4,5,'Housecarls');
 f.unit('light',2,2,-10,"Harold's household");
 f.line('light',3,-15,-4,-9,-5,4,'Fyrd levy');
 f.unit('light',3,-17,-11,'Fyrd reserve');
 f.unit('mountaineer',3,-12,-7,'Fyrd archers');
 // Normans: archers in front, foot behind them, knights and mounted men-at-arms ready on the wings
 f.line('mountaineer',1,-8,7,8,7,5,'Norman archers');
 f.line('light',1,-10,10,10,10,6,'Norman foot');
 f.line('heavy',1,-10,12,10,12,3,'Norman knights');
 f.line('motorized',1,-13,11,13,11,2,'Mounted men-at-arms');f.unit('motorized',1,0,13,"Duke William's horse");
 f.label('Senlac ridge',8,-8);f.label('Caldbec Hill',12,-20);f.label('Marshy brook',-11,2);f.label('Telham Hill',6,18);
 return finish(f,ev,{id:'hastings-1066',name:'Hastings: Senlac Ridge',era:'medieval',date:'14 October 1066',difficulty:'Standard',
  objective:'Break the shield wall: capture Senlac ridge and Caldbec Hill.',goal:{type:'capture',towns:['Senlac ridge','Caldbec Hill']},
  brief:'You command Duke William\'s Normans below the English shield wall. Charging uphill into the housecarls is costly: let your archers wear the wall down from the slope, and watch the fyrd on the English right. If they leave the ridge to chase your men, your knights can cut them off in the open.',
  history:'On 14 October 1066 William of Normandy defeated King Harold\'s English army on Senlac ridge near Hastings. Parts of the English line broke ranks to pursue retreating Normans and were cut down; Harold was killed late in the day.',
  note:'Senlac ridge across the middle with woods on both flanks, a marshy brook at its foot, Caldbec Hill behind it and Telham Hill to the south.',
  sources:['https://www.english-heritage.org.uk/visit/places/1066-battle-of-hastings-abbey-and-battlefield/history-and-stories/what-happened-battle-hastings/'],
  economy:{money:16000,manpower:2500,aiMoney:{2:12000,3:5000},aiManpower:{2:1000,3:400}},alliances:[[2,3]],aiCount:2,enemyManpowerRate:.25,
  events:[
   ev('hastings-fyrd','The fyrd breaks ranks',{type:'timer',seconds:100},{title:'The fyrd breaks ranks',body:'Your Breton wing falls back and the English fyrd rushes down the ridge after it. Turn your knights on them in the open, then climb into the gap they leave.',style:'alert'},[],[{owner:3,scope:'all',...at(-7,9)}]),
   ev('hastings-knights','Norman reserve',{type:'timer',seconds:160},{title:'Norman reserve',body:'Fresh knights reach Telham Hill.',style:'briefing'},[{owner:1,type:'heavy',count:2,anchor:'coords',...at(2,14)}]),
   ev('hastings-brothers',"Harold's brothers",{type:'timer',seconds:210},{title:"Harold's brothers rally the line",body:'English reserves are coming down from Caldbec Hill to close the gaps in the wall.',style:'alert'},
    [{owner:2,type:'light',count:3,anchor:'coords',...at(6,-16)}],[{owner:2,scope:'reinforcements',...at(2,-5)}])
  ]});
}

function agincourt(MapBuilder,ev){
 const f=new Field(MapBuilder,28,1415);
 // A field between Agincourt wood (west) and Tramecourt wood (east) that narrows toward the English line on a low
 // rise in the south; it had been ploughed and soaked by rain, so the middle of it is deep mud.
 f.paint((h,n)=>{
  const west=lerpPts([[-22,-17],[-8,-8],[12,-6],[22,-12]],h.r)+(n-.5)*3,east=lerpPts([[-22,17],[-8,9],[12,7],[22,12]],h.r)+(n-.5)*3;
  h.type='grass';
  const rise=9.5+wind(h.q,1.2,.8);
  if(h.q<west||h.q>east)h.type=f.n(h.q,h.r,4)>.3?'forest':'grass';
  else if(h.r>-12+wind(h.q,.6,2)&&h.r<rise-1&&f.n(h.q,h.r,6)>.42)h.type='swamp';
  if(h.r>=rise&&h.r<=rise+3&&h.q>=west-1&&h.q<=east+1&&h.type!=='forest')h.type='hill';
  h.owner=h.r<6+wind(h.q,2.7,1.2)?2:1;
 });
 const mais=f.town(0,17,1,'Maisoncelle'),baggage=f.town(-13,18,1,'English baggage'),az=f.town(-13,-17,2,'Azincourt'),ru=f.town(11,-17,2,'Ruisseauville');
 f.fort(-5,9,1);f.fort(5,9,1);
 f.road(az,mais,[[-6,-6],[0,6]]);f.road(ru,mais,[[5,-5],[0,6]]);f.road(baggage,mais);
 // English: longbowmen on both flanks of the line, men-at-arms in the middle, the king's household behind
 f.line('mountaineer',1,-8,11,-4,11,3,'English longbowmen');
 f.line('light',1,-2,11,2,11,3,'Men-at-arms');
 f.line('mountaineer',1,4,11,8,11,3,'English longbowmen (right)');
 f.line('light',1,-1,14,1,14,2,"King Henry's household");
 f.unit('light',1,-13,15,'Baggage guard');
 // French: three battles of men-at-arms, crossbowmen, mounted knights on the wings
 f.line('light',2,-8,-12,8,-12,7,'Dismounted men-at-arms');
 f.line('mountaineer',2,-6,-9,6,-9,3,'French crossbowmen');
 f.line('heavy',2,-10,-14,10,-14,2,'Mounted knights');
 f.line('motorized',2,-4,-16,4,-16,2,'Mounted men-at-arms');
 f.unit('light',2,-13,-14,'Azincourt garrison');f.unit('light',2,11,-14,'Ruisseauville garrison');
 f.label('Agincourt wood',-16,-2);f.label('Tramecourt wood',16,-2);f.label('Ploughed mud',0,-2);f.label('Stakes',-5,7);
 return finish(f,ev,{id:'agincourt-1415',name:'Agincourt: The Muddy Field',era:'medieval',date:'25 October 1415',difficulty:'Standard',
  objective:'Hold Maisoncelle for 5:00.',goal:{type:'hold',towns:['Maisoncelle'],duration:300},
  brief:'You command King Henry V\'s small, tired army at the narrow end of a ploughed field between two woods. The rain has turned the field to mud: French knights and men-at-arms will be slow and clumsy in it. Keep your longbowmen on the low rise behind the stakes and shoot every wave as it struggles through the mud.',
  history:'On 25 October 1415 Henry V\'s outnumbered English army defeated the French at Agincourt. The French attacked across a muddy, narrowing field and were shot down by English archers before they reached the line.',
  note:'A ploughed field narrowing between Agincourt and Tramecourt woods, deep mud in the middle and the English line on a low rise with its stakes.',
  sources:['https://www.britannica.com/event/Battle-of-Agincourt'],
  economy:{money:8000,manpower:2500,aiMoney:{2:22000},aiManpower:{2:1500}},
  events:[
   ev('agin-charge','The French knights charge',{type:'timer',seconds:18},{title:'The French knights charge',body:'Mounted knights are charging from both wings to ride down your archers. The mud will slow them: shoot, and let the stakes do the rest.',style:'alert'},
    [{owner:2,type:'heavy',count:2,anchor:'coords',...at(-9,-12)},{owner:2,type:'heavy',count:2,anchor:'coords',...at(9,-12)}],[{owner:2,scope:'reinforcements',...at(0,11)}]),
   ev('agin-vanguard','The vanguard advances',{type:'timer',seconds:75},{title:'The vanguard advances',body:'The first French battle of dismounted men-at-arms is wading through the mud toward you.',style:'alert'},[],[{owner:2,scope:'all',...at(0,11)}]),
   ev('agin-second','The second battle',{type:'timer',seconds:160},{title:'The second battle',body:'More French men-at-arms follow the first wave into the field.',style:'alert'},
    [{owner:2,type:'light',count:5,anchor:'coords',...at(0,-17)},{owner:2,type:'heavy',count:2,anchor:'coords',...at(-6,-17)}],[{owner:2,scope:'reinforcements',...at(0,11)}]),
   ev('agin-baggage','The baggage is raided',{type:'timer',seconds:200},{title:'The baggage is raided',body:'French riders have slipped around Agincourt wood and are falling on the English baggage. Send help, but don\'t weaken the line.',style:'alert'},
    [{owner:2,type:'motorized',count:2,anchor:'coords',...at(-22,12)}],[{owner:2,scope:'reinforcements',...at(-13,18)}]),
   ev('agin-rear','The rearguard',{type:'timer',seconds:245},{title:'The last French charge',body:'The French rearguard makes a final mounted charge.',style:'alert'},
    [{owner:2,type:'heavy',count:3,anchor:'coords',...at(0,-18)},{owner:2,type:'motorized',count:2,anchor:'coords',...at(6,-18)}],[{owner:2,scope:'reinforcements',...at(0,11)}])
  ]});
}

function stirlingBridge(MapBuilder,ev){
 const f=new Field(MapBuilder,28,1297);
 // The Forth winds west to east across the middle. Its one bridge is narrow; north of it a causeway runs through the
 // soft carse to Causewayhead below the Abbey Craig, where the Scots wait. Stirling and its castle crag are on the south
 // bank, with the English camp east of them. Far upstream the ford at Drip is the only other crossing.
 const points=[[-28,3],[-20,0],[-12,2],[-5,0],[0,-2],[5,1],[9,5],[14,2],[17,-3],[22,0],[28,-2]];
 const riverAt=lerpPts.bind(null,catmull(points).slice().sort((a,b)=>a[0]-b[0]));
 const causeway=catmull([[-5,-1],[-5,-6],[-6,-10],[-7,-13]]);
 f.paint((h,n)=>{
  const fr=riverAt(h.q),north=h.r<fr;
  h.type=n>.7?'forest':'grass';
  if(north&&h.r>fr-5.5+wind(h.q,1.1,1.2)&&f.n(h.q,h.r,4)>.5)h.type='swamp';
  if(inEllipse(h.q,h.r,9,-14,6,4.5,1+(n-.5)*.5))h.type=n>.55?'forest':'hill';
  if(h.r<-18+wind(h.q,2,1.5))h.type=f.n(h.q,h.r,6)>.55?'mountain':'hill';
  if(inEllipse(h.q,h.r,-14,11,4.5,3.2,1+(n-.5)*.4))h.type='hill';
  // (the English vanguard is already across, on the causeway at the north end of the bridge)
  if(distance(h.q,h.r,causeway).d<1.2)h.type='grass';
  h.owner=north?(inEllipse(h.q,h.r,-5,-3.5,4.2,3)?2:1):2;
 });
 const forth=f.river(points,.9,[[-22,1]]);
 f.bridge(-5,0,forth,.9,2);
 const craig=f.town(9,-13,1,'Abbey Craig'),cwh=f.town(-7,-14,1,'Causewayhead'),stirling=f.town(-14,11,2,'Stirling'),camp=f.town(6,12,2,'English camp');
 f.road(cwh,craig,[[1,-15]]);f.road(cwh,stirling,[[-5,-6],[-5,0],[-6,5],[-10,9]]);f.road(stirling,camp,[[-4,10]]);
 // Scots: Wallace's and Moray's spearmen on the slopes and at Causewayhead, archers from Selkirk forest, a few horse
 f.line('light',1,3,-10,13,-10,5,"Wallace's spearmen");
 f.line('light',1,-13,-9,-9,-9,3,"Moray's spearmen");f.unit('heavy',1,8,-12,'Scottish nobles');f.unit('light',1,-7,-11,'Causewayhead levy');
 f.line('mountaineer',1,6,-16,10,-16,2,'Selkirk archers');
 f.line('motorized',1,13,-15,15,-13,2,'Scottish horse');
 // English: the vanguard across the bridge, the rest of the army forming up on the south bank
 f.unit('heavy',2,-6,-3,'English knights');f.unit('light',2,-4,-2,'Vanguard foot');f.unit('light',2,-4,-5,'Vanguard foot II');
 f.line('light',2,-8,5,-2,5,2,'English foot');
 f.unit('mountaineer',2,-9,7,'Welsh archers');
 f.unit('motorized',2,3,8,"Surrey's horse");
 f.unit('light',2,-15,7,'Stirling Castle garrison');f.unit('light',2,6,15,'Camp guard');
 f.label('River Forth',-14,1,'water');f.label('Abbey Craig',10,-19);f.label('Stirling Castle',-14,15);f.label('The carse',2,-6);f.label('Stirling Bridge',-1,2);f.label('Ford of Drip',-22,-2);
 return finish(f,ev,{id:'stirling-bridge-1297',name:'Stirling Bridge: Catch Them Crossing',era:'medieval',date:'11 September 1297',difficulty:'Standard',
  objective:'Capture Stirling and the English camp.',goal:{type:'capture',towns:['Stirling','English camp']},
  brief:'You command the Scots under William Wallace and Andrew Moray on the Abbey Craig. The English must cross the Forth by one narrow bridge and a causeway through soft ground. Let their vanguard come over, then charge before the rest can follow: cut it off at the bridge foot, then cross yourself and take Stirling and the English camp. The ford at Drip, far upstream, is a long way round.',
  history:'On 11 September 1297 the English army of the Earl of Surrey began crossing the narrow bridge over the Forth at Stirling. When about half of it was over, Wallace and Moray charged, seized the bridge end and destroyed the vanguard; the rest of the English army fell back.',
  note:'The winding Forth with its single narrow bridge, the causeway through the carse to the Abbey Craig, Stirling Castle on its crag on the south bank and the ford at Drip upstream.',
  sources:['https://en.wikipedia.org/wiki/Battle_of_Stirling_Bridge'],
  economy:{money:14000,manpower:2500,aiMoney:{2:14000},aiManpower:{2:600}},enemyManpowerRate:.25,
  events:[
   ev('stirling-crossing','The vanguard crosses',{type:'timer',seconds:8},{title:'The vanguard crosses',body:'More of Surrey\'s vanguard is filing over the bridge two abreast onto the causeway. Let them come, but not too many: when the bridge is crowded, charge down and cut them off from it.',style:'alert'},
    [{owner:2,type:'light',count:2,anchor:'coords',...at(-6,5)},{owner:2,type:'mountaineer',count:1,anchor:'coords',...at(-4,5)}],[{owner:2,scope:'reinforcements',...at(-5,-6)}]),
   ev('stirling-charge','Charge',{type:'timer',seconds:60},{title:'Charge!',body:'Half the vanguard is across and the bridge is jammed. Send the spearmen down the causeway to seize the bridge foot, and let the carse swallow the English horse. Moray\'s men are coming down from Causewayhead.',style:'briefing'},
    [{owner:1,type:'light',count:2,anchor:'coords',...at(-2,-12)}]),
   ev('stirling-cressingham',"Cressingham's knights",{type:'timer',seconds:110},{title:"Cressingham's knights",body:'Hugh de Cressingham is leading more knights onto the bridge to rescue the vanguard.',style:'alert'},
    [{owner:2,type:'heavy',count:1,anchor:'coords',...at(4,10)},{owner:2,type:'light',count:1,anchor:'coords',...at(2,10)}],[{owner:2,scope:'reinforcements',...at(-5,-4)}]),
   ev('stirling-drip','The ford at Drip',{type:'timer',seconds:160},{title:'The ford at Drip',body:'Scots horse have reached the ford at Drip upstream. Cross there and ride on Stirling from the west while the English are held at the bridge.',style:'briefing'},
    [{owner:1,type:'motorized',count:2,anchor:'coords',...at(-24,-6)}]),
   ev('stirling-surrey','Surrey falls back',{type:'timer',seconds:170},{title:'Surrey falls back',body:'The Earl of Surrey has lost heart and is marching the English army away south, leaving Stirling and the camp to their guards. Cross now and take both.',style:'briefing'},
    [],[{owner:2,scope:'all',...at(0,21)}]),
   ev('stirling-guard','The camp guard',{type:'timer',seconds:175},{title:'',body:''},[{owner:2,type:'light',count:1,anchor:'coords',...at(6,15)},{owner:2,type:'light',count:1,anchor:'coords',...at(-14,13)}])
  ]});
}

function hattin(MapBuilder,ev){
 const f=new Field(MapBuilder,30,1187);
 // A dry plateau falling east to the Sea of Galilee. The crusaders come from the springs of Sephoria and Turan in the west;
 // Saladin's army blocks the road to the water: the village of Lubiya, the springs of Kafr Hattin below the twin peaks of
 // the Horns of Hattin, and Tiberias on the lake shore.
 const shore=r=>lerpPts([[-24,26],[-14,23],[-4,22],[6,23],[14,21],[24,24]],r);
 f.paint((h,n)=>{
  const s=shore(h.r);
  h.type=n<.42?'sand':'grass';
  if(f.n(h.q,h.r,7)>.6&&h.q>-6)h.type='hill';
  if(h.q>s-6&&h.q<=s-2&&f.n(h.q,h.r,2)>.45)h.type='hill';
  if(inEllipse(h.q,h.r,2,-2,2.6,2,1+(n-.5)*.3)||inEllipse(h.q,h.r,7,-3,2.4,1.8,1+(n-.5)*.3))h.type=inEllipse(h.q,h.r,2,-2,1.1,.9)||inEllipse(h.q,h.r,7,-3,1,.8)?'mountain':'hill';
  if(h.q>s+(n-.5)*1.4)h.type='water';else if(h.q>s-1.2)h.type='sand';
  h.owner=h.q<-9+wind(h.r,.8,1.6)?2:1;
 });
 const kafr=f.town(5,-10,1,'Kafr Hattin'),lubiya=f.town(-2,9,1,'Lubiya'),tiberias=f.town(19,4,1,'Tiberias'),turan=f.town(-18,3,2,'Turan'),sephoria=f.town(-25,-14,2,'Sephoria');
 f.road(sephoria,turan,[[-22,-5]]);f.road(turan,lubiya,[[-10,6]]);f.road(lubiya,tiberias,[[8,7]]);f.road(kafr,tiberias,[[12,-4]]);
 // Saladin: archers across the road, foot behind them, the two wings of horse, his own mamluks in reserve
 f.line('mountaineer',1,-5,-8,-5,6,4,'Ayyubid archers');
 f.line('light',1,-2,-6,-2,6,3,'Ayyubid foot');
 f.line('motorized',1,1,-13,4,-14,2,"Taqi al-Din's horse");f.line('motorized',1,1,12,4,13,2,"Gokbori's horse");
 f.unit('heavy',1,10,1,"Saladin's mamluks");f.unit('light',1,6,-7,'Kafr Hattin guard');f.unit('light',1,16,4,'Tiberias garrison');
 // Crusaders: the knights of the military orders and the kingdom, the foot around them, crossbowmen and turcopoles
 f.unit('heavy',2,-13,-3,'Templar knights');f.unit('heavy',2,-13,1,'Hospitaller knights');f.unit('heavy',2,-15,-1,"King Guy's knights");f.unit('heavy',2,-15,-7,"Count Raymond's knights");
 f.line('light',2,-11,-7,-11,5,5,'Crusader foot');
 f.line('mountaineer',2,-13,-9,-13,7,2,'Crossbowmen');
 f.unit('motorized',2,-17,8,'Turcopoles');f.unit('light',2,-18,-1,'Guard of the True Cross');f.unit('light',2,-24,-10,'Sephoria garrison');
 f.label('Horns of Hattin',5,1);f.label('Sea of Galilee',26,-8,'water');f.label('Dry plateau',-12,-14);f.label('Springs of Kafr Hattin',8,-17);
 return finish(f,ev,{id:'hattin-1187',name:'Hattin: The Springs',era:'medieval',date:'4 July 1187',difficulty:'Standard',
  objective:'Hold Kafr Hattin and Tiberias for 5:00.',goal:{type:'hold',towns:['Kafr Hattin','Tiberias'],duration:300},
  brief:'You command Saladin\'s army between the crusaders and the water. King Guy\'s knights and foot have marched all night across the dry plateau and must reach the springs of Kafr Hattin or the lake at Tiberias. Hold both. Let your archers shoot into the column, keep your horse ready for the knights\' charges, and do not let anyone break through to the lake.',
  history:'On 4 July 1187 Saladin trapped the army of the Kingdom of Jerusalem, exhausted by thirst, on the plateau below the Horns of Hattin. Count Raymond of Tripoli broke out with a few knights; the rest of the army was destroyed or captured, and Jerusalem fell that autumn.',
  note:'A dry plateau falling to the Sea of Galilee, with the twin peaks of the Horns of Hattin, the springs of Kafr Hattin below them and Tiberias on the shore.',
  sources:['https://en.wikipedia.org/wiki/Battle_of_Hattin'],
  economy:{money:12000,manpower:2500,aiMoney:{2:24000},aiManpower:{2:1500}},
  events:[
   ev('hattin-march','March to the water',{type:'timer',seconds:15},{title:'March to the water',body:'The crusaders have spent the night on the plateau without water and are marching for the springs of Kafr Hattin. Shoot into the column, and hold the springs.',style:'alert'},[],[{owner:2,scope:'all',...at(5,-10)}]),
   ev('hattin-fire','The brush fires',{type:'timer',seconds:60},{title:'The brush fires',body:'Your men have set the dry scrub alight upwind of the crusaders, and smoke and thirst are breaking their foot. Fresh archers have come up from Lubiya.',style:'briefing'},
    [{owner:1,type:'mountaineer',count:2,anchor:'coords',...at(3,12)}]),
   ev('hattin-raymond',"Raymond's charge",{type:'timer',seconds:100},{title:"Count Raymond's charge",body:'Count Raymond of Tripoli is charging your line to break through to the lake. Let him pass if you must, but do not lose Tiberias.',style:'alert'},
    [{owner:2,type:'heavy',count:2,anchor:'coords',...at(-12,-9)}],[{owner:2,scope:'reinforcements',...at(19,4)}]),
   ev('hattin-horns','The Horns of Hattin',{type:'timer',seconds:160},{title:'The Horns of Hattin',body:'The king has pitched his red tent on the Horns of Hattin, and his foot is gathering for another push to the springs.',style:'alert'},
    [{owner:2,type:'light',count:3,anchor:'coords',...at(-12,0)},{owner:2,type:'mountaineer',count:1,anchor:'coords',...at(-13,2)}],[{owner:2,scope:'reinforcements',...at(5,-10)}]),
   ev('hattin-last','The last charges',{type:'timer',seconds:230},{title:'The last charges',body:'The king\'s knights charge twice more toward your guard. Hold them, and the day is yours.',style:'alert'},
    [{owner:2,type:'heavy',count:3,anchor:'coords',...at(-14,2)}],[{owner:2,scope:'reinforcements',...at(5,-10)}])
  ]});
}

// ---------------------------------------------------------------- napoleonic
function austerlitz(MapBuilder,ev){
 const f=new Field(MapBuilder,30,1805);
 // The Goldbach stream runs north to south with fords at its villages; east of it the Pratzen plateau, the Satschan
 // ponds to the south-east and the town of Austerlitz beyond. The French hold the west bank.
 const brook=catmull([[-6,-24],[-4,-12],[-7,0],[-5,10],[-8,24]]);
 f.paint((h,n)=>{
  h.type=n>.72?'forest':'grass';
  if(inEllipse(h.q,h.r,8,-3,11,8,1+(n-.5)*.5))h.type=f.n(h.q,h.r,2)>.74?'forest':'hill';
  if(inEllipse(h.q,h.r,-19,-16,4,3))h.type='hill';
  if(inEllipse(h.q,h.r,-21,0,4,3))h.type='hill';
  if(inEllipse(h.q,h.r,14,18,5,2.4)||inEllipse(h.q,h.r,5,21,3.5,1.8))h.type='water';
  const near=distance(h.q,h.r,brook);
  if(near.d<.9&&![-15,-5,5,16].some(r=>Math.abs(h.r-r)<=1))h.type='water';
  const westBank=h.q<lerpPts([[-24,-6],[-12,-4],[0,-7],[10,-5],[24,-8]],h.r);
  h.owner=westBank?1:h.r<7+wind(h.q,3.3,1.3)?2:3;
 });
 const hq=f.town(-22,-3,1,'French headquarters'),santon=f.town(-18,-16,1,'Santon'),telnitz=f.town(-13,16,1,'Telnitz');
 const pratzen=f.town(8,-4,2,'Pratzen'),aust=f.town(24,-11,2,'Austerlitz'),augezd=f.town(8,13,3,'Augezd');
 f.fort(-17,-13,1);
 f.road(hq,pratzen,[[-12,-4],[-5,-5],[2,-4]]);f.road(pratzen,aust,[[16,-7]]);f.road(hq,telnitz,[[-18,8]]);f.road(augezd,pratzen,[[8,4]]);
 // French: Soult's corps hidden in the valley, Murat's cavalry north, Legrand holding Telnitz
 f.line('light',1,-11,-10,-11,4,6,'Line infantry');
 f.line('light',1,-14,-7,-14,1,3,'Line infantry (Saint-Hilaire)');
 f.line('mountaineer',1,-9,-7,-9,1,3,'Chasseurs');
 f.line('motorized',1,-20,-9,-16,-9,2,'Dragoons');
 f.line('heavy',1,-15,-18,-12,-18,2,'Cuirassiers');
 f.line('light',1,-13,13,-11,13,2,'Legrand division');
 // Allies: Kutuzov's centre on the plateau, the Russian Guard at Austerlitz, Buxhowden's column in the south
 f.line('light',2,5,-9,11,-9,2,'Russian infantry');
 f.unit('light',2,8,0,'Russian grenadiers');
 f.unit('mountaineer',2,2,-3,'Russian jaegers');
 f.unit('motorized',2,17,-2,'Cossacks');
 f.unit('heavy',2,22,-8,'Imperial Guard cavalry');f.unit('light',2,24,-14,'Guard grenadiers');
 f.line('light',3,2,9,14,9,6,'Allied column');
 f.unit('mountaineer',3,5,11,'Austrian grenzers');f.unit('motorized',3,13,12,'Austrian cavalry');
 f.label('Goldbach',-6,-20,'water');f.label('Pratzen Heights',13,-6);f.label('Santon hill',-19,-20);f.label('Satschan ponds',14,21,'water');f.label('Zuran hill',-21,3);
 return finish(f,ev,{id:'austerlitz-1805',name:'Austerlitz: The Pratzen Heights',era:'napoleonic',date:'2 December 1805',difficulty:'Hard',
  objective:'Seize the Pratzen Heights, then take Austerlitz.',goal:{type:'capture',towns:['Pratzen','Austerlitz']},
  brief:'You command Napoleon\'s army behind the Goldbach stream. The Allies mean to turn your right at Telnitz; let them. When their southern column comes down off the plateau, cross the fords and storm the Pratzen Heights with Soult\'s infantry, then march on Austerlitz through the Russian Guard. Line infantry fires in volleys: keep it in formation and let the chasseurs skirmish ahead.',
  history:'On 2 December 1805 Napoleon drew the Russian and Austrian armies into attacking his weakened right, then broke their centre on the Pratzen Heights. Austerlitz ended the War of the Third Coalition.',
  note:'The Goldbach valley with four fords, the Pratzen plateau east of it, the Satschan ponds in the south and the town of Austerlitz beyond.',
  sources:['https://www.napoleon.org/en/history-of-the-two-empires/articles/the-battle-of-austerlitz-and-the-principles-of-war/'],
  economy:{money:14000,manpower:2500,aiMoney:{2:14000,3:8000},aiManpower:{2:1000,3:500}},alliances:[[2,3]],aiCount:2,enemyManpowerRate:.25,
  events:[
   ev('aust-column','The Allies leave the plateau',{type:'timer',seconds:30},{title:'The Allies take the bait',body:'The Allied southern column is marching off the plateau toward Telnitz. Hold Telnitz with Legrand; your main blow lands on the Pratzen.',style:'alert'},[],[{owner:3,scope:'all',...at(-13,16)}]),
   ev('aust-davout','Davout arrives',{type:'timer',seconds:70},{title:'Davout arrives',body:'Marshal Davout\'s corps has marched through the night and reaches Telnitz.',style:'briefing'},
    [{owner:1,type:'light',count:3,anchor:'coords',...at(-20,15)},{owner:1,type:'motorized',count:1,anchor:'coords',...at(-21,13)}]),
   ev('aust-sun','The sun of Austerlitz',{type:'timer',seconds:90},{title:'The sun of Austerlitz',body:'The morning fog lifts over the plateau. The Pratzen is thinly held: attack now.',style:'briefing'}),
   ev('aust-guard','The Russian Guard',{type:'timer',seconds:220},{title:'The Russian Guard counterattacks',body:'The Russian Imperial Guard is coming from Austerlitz to retake the heights.',style:'alert'},
    [{owner:2,type:'heavy',count:2,anchor:'coords',...at(22,-6)},{owner:2,type:'light',count:2,anchor:'coords',...at(21,-9)}],[{owner:2,scope:'reinforcements',...at(8,-4)}])
  ]});
}

function waterloo(MapBuilder,ev){
 const f=new Field(MapBuilder,30,1815);
 // Wellington's ridge at Mont-Saint-Jean across the north, the forest of Soignes behind it, Hougoumont and La Haye
 // Sainte forward of the ridge, a muddy valley, and the French on the facing rise at La Belle Alliance.
 f.paint((h,n)=>{
  const crest=-5+wind(h.q,.9,1.6),half=2+wind(h.q,3.1,.8)+(n-.5),rise=10.5+wind(h.q,2.2,1.4);
  h.type='grass';
  if(Math.abs(h.r-crest)<=half)h.type='hill';
  if(Math.abs(h.r-rise)<=1.6+(n-.5))h.type='hill';
  if(h.r<-17+wind(h.q,4,2.5))h.type='forest';
  if(inEllipse(h.q,h.r,-15,3,6,4,1+(n-.5)*.5))h.type='forest';
  if(inEllipse(h.q,h.r,27,4,5,6,1+(n-.5)*.5))h.type='forest';
  if(inEllipse(h.q,h.r,-1,3.5,13,3.5,1+(f.n(h.q,h.r,8)-.5)*1.4)&&f.n(h.q,h.r,8)>.5)h.type='swamp';
  h.owner=h.r<-1+wind(h.q,1.3,1.2)?1:2;
 });
 const msj=f.town(0,-12,1,'Mont-Saint-Jean'),hougo=f.town(-13,-3,1,'Hougoumont'),lhs=f.town(1,0,1,'La Haye Sainte'),pap=f.town(15,-1,1,'Papelotte');
 const lba=f.town(0,13,2,'La Belle Alliance'),planc=f.town(17,17,2,'Plancenoit');
 f.fort(-6,-5,1);f.fort(7,-5,1);f.fort(-13,0,1);
 f.road(msj,lhs,[[0,-6]]);f.road(lhs,lba,[[0,7]]);f.road(msj,hougo,[[-8,-6]]);f.road(lba,planc,[[9,15]]);
 // Allies: the line along the crest, Guards in Hougoumont, the King's German Legion in La Haye Sainte, riflemen
 // forward, heavy cavalry behind the ridge
 f.line('light',1,-9,-6,9,-6,7,'British line');
 f.line('light',1,-16,-1,-11,-1,4,'Coldstream Guards');f.unit('mountaineer',1,-16,-4,'Brunswick jaegers');
 f.unit('light',1,1,2,'King\'s German Legion');
 f.unit('light',1,15,1,'Nassau infantry');
 f.line('mountaineer',1,-3,-3,3,-3,2,'95th Rifles');
 f.unit('heavy',1,-4,-9,'Household Brigade');f.unit('motorized',1,4,-9,'Union Brigade');
 // French: Reille's, d'Erlon's and Lobau's corps on the facing rise, cuirassiers and lancers behind them
 f.line('light',2,-10,9,10,9,7,'French line');
 f.line('mountaineer',2,-6,7,6,7,2,'Voltigeurs');
 f.unit('heavy',2,0,15,'Cuirassiers');
 f.unit('motorized',2,6,13,'Lancers');
 f.unit('light',2,17,14,'Young Guard');
 f.label('Mont-Saint-Jean ridge',-17,-7);f.label('Forest of Soignes',8,-20);f.label('Hougoumont wood',-18,8);f.label('Muddy valley',-6,4);f.label('Bois de Paris',26,9);
 return finish(f,ev,{id:'waterloo-1815',name:'Waterloo: Hold the Ridge',era:'napoleonic',date:'18 June 1815',difficulty:'Standard',
  objective:'Hold Mont-Saint-Jean for 5:00 until the Prussians arrive.',goal:{type:'hold',towns:['Mont-Saint-Jean'],duration:300},
  brief:'You command Wellington\'s army on the ridge of Mont-Saint-Jean. Napoleon will throw corps after corps at you across the muddy valley: first at Hougoumont, then at your centre, then with his cavalry and finally the Imperial Guard. Keep your line on the crest, where the slope and the volleys give it the advantage; Hougoumont and La Haye Sainte are forward posts that cost the French time and men. Blücher\'s Prussians are coming from the east; hold Mont-Saint-Jean until they arrive.',
  history:'On 18 June 1815 Wellington\'s Anglo-allied army held the ridge at Mont-Saint-Jean against repeated French attacks until Blücher\'s Prussians arrived on Napoleon\'s flank. The defeat of the Imperial Guard ended Napoleon\'s rule.',
  note:'The ridge of Mont-Saint-Jean with the forest of Soignes behind it, Hougoumont and La Haye Sainte forward, a muddy valley and La Belle Alliance on the French rise.',
  sources:['https://www.nam.ac.uk/explore/battle-waterloo'],
  economy:{money:12000,manpower:2500,aiMoney:{2:22000},aiManpower:{2:1500}},
  events:[
   ev('water-hougoumont','Reille attacks Hougoumont',{type:'timer',seconds:20},{title:'Reille attacks Hougoumont',body:'French infantry is advancing through the wood on Hougoumont. The Guards must hold the château.',style:'alert'},
    [{owner:2,type:'light',count:3,anchor:'coords',...at(-15,10)},{owner:2,type:'mountaineer',count:1,anchor:'coords',...at(-12,11)}],[{owner:2,scope:'reinforcements',...at(-13,-3)}]),
   ev('water-derlon',"D'Erlon's corps",{type:'timer',seconds:80},{title:"D'Erlon's grand attack",body:'A whole French corps is crossing the valley toward La Haye Sainte and your centre.',style:'alert'},
    [{owner:2,type:'light',count:7,anchor:'coords',...at(2,11)}],[{owner:2,scope:'reinforcements',...at(1,-4)}]),
   ev('water-ney','Ney\'s cavalry',{type:'timer',seconds:150},{title:'The cavalry charges',body:'Marshal Ney leads the French cavalry against your line. Hold the crest; infantry in good order can see them off.',style:'alert'},
    [{owner:2,type:'heavy',count:4,anchor:'coords',...at(-4,10)},{owner:2,type:'motorized',count:3,anchor:'coords',...at(4,10)}],[{owner:2,scope:'reinforcements',...at(0,-5)}]),
   ev('water-guard','The Imperial Guard',{type:'timer',seconds:200},{title:'The Imperial Guard',body:'Napoleon commits the Imperial Guard against Mont-Saint-Jean. This is the last French attack.',style:'alert'},
    [{owner:2,type:'light',count:6,anchor:'coords',...at(0,12)},{owner:2,type:'heavy',count:2,anchor:'coords',...at(-2,13)}],[{owner:2,scope:'reinforcements',...at(0,-11)}]),
   ev('water-prussians','The Prussians',{type:'timer',seconds:270},{title:'The Prussians arrive',body:'Blücher\'s Prussians are coming out of the Bois de Paris onto the French flank.',style:'briefing'},
    [{owner:1,type:'light',count:4,anchor:'coords',...at(24,-6)},{owner:1,type:'motorized',count:2,anchor:'coords',...at(26,-8)}])
  ]});
}

function borodino(MapBuilder,ev){
 const f=new Field(MapBuilder,30,1812);
 // The Kolocha runs along the north with fords at Borodino village and upstream. South of it the Russians hold a line of
 // earthworks: the Great Redoubt on the Kurgan height, Bagration's flèches on a low rise to the south, the Semyonovka
 // ravine between the flèches and the village behind them, and the Utitsa woods on the far left. The French are in the
 // west around the captured Shevardino redoubt.
 const kolocha=catmull([[-30,-14],[-20,-12],[-10,-10],[-2,-13],[6,-16],[14,-15],[22,-19],[30,-21]]);
 const ravine=catmull([[3,-9],[1,-2],[2,5],[5,12],[8,20]]);
 f.paint((h,n)=>{
  h.type=n>.74?'forest':'grass';
  if(h.r>12&&h.q>-14&&h.q<6&&f.n(h.q,h.r,3)>.38)h.type='forest';
  if(inEllipse(h.q,h.r,4,-4,4,3,1+(n-.5)*.5)||inEllipse(h.q,h.r,-3,8,4,2.6,1+(n-.5)*.5)||inEllipse(h.q,h.r,-21,6,3.5,2.5)||inEllipse(h.q,h.r,18,-9,4,3,1+(n-.5)*.5))h.type='hill';
  if(distance(h.q,h.r,ravine).d<1.1)h.type='swamp';
  if(distance(h.q,h.r,kolocha).d<.95&&Math.abs(h.q+10)>1.2&&Math.abs(h.q-10)>1.2)h.type='water';
  h.owner=h.q<-8+wind(h.r,.4,1.5)?1:2;
 });
 const shev=f.town(-21,6,1,'Shevardino'),boro=f.town(-10,-5,1,'Borodino');
 const redoubt=f.town(4,-4,2,'Great Redoubt'),fleches=f.town(-2,8,2,'Bagration flèches'),semy=f.town(8,8,2,'Semyonovskaya'),gorki=f.town(18,-8,2,'Gorki');
 f.fort(-5,8,2);f.fort(1,-4,2);
 f.road(shev,fleches,[[-12,6]]);f.road(boro,redoubt,[[-3,-5]]);f.road(fleches,semy);f.road(redoubt,gorki,[[11,-7]]);f.road(shev,boro,[[-16,0]]);
 // French: Davout and Ney against the flèches, Eugène by Borodino, voltigeurs ahead, Murat's cavalry, the Poles in the
 // south and the Guard held back at Shevardino
 f.line('light',1,-11,5,-11,12,4,"Davout's infantry");
 f.line('light',1,-11,0,-11,3,2,"Ney's infantry");
 f.line('light',1,-13,-6,-13,-2,2,"Eugène's infantry");
 f.line('mountaineer',1,-9,-1,-9,10,3,'Voltigeurs');
 f.line('heavy',1,-16,1,-16,5,2,'Cuirassiers');f.line('motorized',1,-17,-3,-17,-1,2,'Dragoons');
 f.line('light',1,-15,15,-12,17,2,'Polish infantry');
 f.line('light',1,-24,2,-24,4,2,'Imperial Guard');
 // Russians: Raevsky at the Great Redoubt, Bagration's grenadiers at the flèches, jaegers forward, cavalry behind,
 // Tuchkov in the Utitsa woods and the Guard at Gorki
 f.unit('light',2,4,-8,"Raevsky's infantry");f.unit('light',2,7,-2,'Great Redoubt garrison');
 f.line('light',2,-5,5,-5,11,2,"Bagration's grenadiers");
 f.line('mountaineer',2,-6,-3,-6,2,2,'Russian jaegers');
 f.unit('light',2,10,11,'Semyonovskaya garrison');f.unit('heavy',2,11,2,'Russian cuirassiers');f.unit('motorized',2,13,-6,'Cossacks');
 f.line('light',2,-1,17,3,17,2,"Tuchkov's corps");f.unit('light',2,18,-5,'Russian Guard');
 f.label('Kolocha',-20,-15,'water');f.label('Kurgan height',9,-1);f.label('Semyonovka ravine',4,15);f.label('Utitsa woods',-8,20);f.label('Shevardino redoubt',-22,10);
 return finish(f,ev,{id:'borodino-1812',name:'Borodino: The Great Redoubt',era:'napoleonic',date:'7 September 1812',difficulty:'Hard',
  objective:'Capture the Bagration flèches and the Great Redoubt.',goal:{type:'capture',towns:['Bagration flèches','Great Redoubt']},
  brief:'You command Napoleon\'s Grand Army in front of the Russian earthworks on the road to Moscow. Send Davout and Ney at Bagration\'s flèches and Eugène across from Borodino at the Great Redoubt, with the voltigeurs ahead and the cuirassiers ready to ride into any gap. The forts and the ravine favour the defender: attack together, not one corps at a time.',
  history:'At Borodino on 7 September 1812 Napoleon\'s army stormed the Russian earthworks after a day of repeated assaults: Bagration\'s flèches fell in the morning and the Great Redoubt in the afternoon, at terrible cost on both sides. Kutuzov withdrew in good order, and a week later the French entered Moscow.',
  note:'The Kolocha along the north, the Great Redoubt on the Kurgan height, Bagration\'s flèches on a low rise, the Semyonovka ravine and the Utitsa woods to the south.',
  sources:['https://en.wikipedia.org/wiki/Battle_of_Borodino'],
  economy:{money:20000,manpower:2500,aiMoney:{2:16000},aiManpower:{2:1000}},enemyManpowerRate:.25,
  events:[
   ev('boro-battery','The grand battery',{type:'timer',seconds:12},{title:'The grand battery',body:'A hundred French guns open fire on the flèches at dawn. Send Davout and Ney at the flèches, and Eugène at the Great Redoubt.',style:'briefing'}),
   ev('boro-bagration','Bagration counterattacks',{type:'timer',seconds:70},{title:'Bagration counterattacks',body:'Russian grenadiers and cuirassiers are coming forward from Semyonovskaya to retake the flèches.',style:'alert'},
    [{owner:2,type:'light',count:2,anchor:'coords',...at(10,7)},{owner:2,type:'heavy',count:1,anchor:'coords',...at(11,9)}],[{owner:2,scope:'reinforcements',...at(-2,8)}]),
   ev('boro-raid','Platov and Uvarov',{type:'timer',seconds:130},{title:'The Cossack raid',body:'Platov\'s Cossacks and Uvarov\'s cavalry have crossed the Kolocha upstream and are riding on Borodino behind your left. Turn something to meet them.',style:'alert'},
    [{owner:2,type:'motorized',count:2,anchor:'coords',...at(2,-20)}],[{owner:2,scope:'reinforcements',...at(-10,-5)}]),
   ev('boro-caulaincourt',"Caulaincourt's cuirassiers",{type:'timer',seconds:120},{title:"Caulaincourt's cuirassiers",body:'General Caulaincourt\'s cuirassiers are ready to ride into the back of the Great Redoubt while the infantry storms it from the front.',style:'briefing'},
    [{owner:1,type:'heavy',count:2,anchor:'coords',...at(-18,-3)}]),
   ev('boro-reserve','The Russian reserves',{type:'timer',seconds:240},{title:'The Russian reserves',body:'Kutuzov sends his last reserves from Gorki to retake the Great Redoubt.',style:'alert'},
    [{owner:2,type:'light',count:2,anchor:'coords',...at(18,-4)}],[{owner:2,scope:'reinforcements',...at(4,-4)}])
  ]});
}

function trafalgar(MapBuilder,ev){
 const f=new Field(MapBuilder,30,1021);
 // Open Atlantic off the Spanish coast: Cádiz in the north-east, Cape Trafalgar to the east, and Gibraltar (drawn much
 // closer than it is) across the approach to the strait in the south-east. The Combined Fleet is strung out north to
 // south across the middle; Nelson's two columns come at it from the west.
 const coast=r=>lerpPts([[-24,21],[-17,17],[-11,22],[-4,23],[1,20],[5,18],[9,22],[11,31],[16,31],[18,23],[24,23]],r);
 f.paint((h,n)=>{
  const c=coast(h.r)+(n-.5)*1.2;
  if(h.q<c)h.type='water';
  else h.type=h.q<c+1.2?'sand':f.n(h.q,h.r,3)>.6?'hill':'grass';
  h.owner=h.r>13?1:3;
 });
 const cadiz=f.town(20,-17,3,'Cádiz'),cape=f.town(21,5,3,'Cape Trafalgar'),gib=f.town(26,20,1,'Gibraltar');
 f.fort(23,2,3);f.fort(25,17,1);
 f.road(cadiz,cape,[[22,-6]]);
 // British: the weather column under Nelson in the north, the lee column under Collingwood in the south
 // (the Royal Navy's crews are veterans: their gunnery is faster and surer)
 const veteran=u=>Object.assign(u,{veteran:true,xp:100});
 [['HMS Victory',-12,-6],['HMS Téméraire',-15,-7],['HMS Neptune',-18,-8],['HMS Leviathan',-21,-9],['HMS Conqueror',-24,-10],['HMS Britannia',-27,-11]].forEach(([n,q,r])=>veteran(f.unit('ship',1,q,r,n)));
 [['HMS Royal Sovereign',-10,6],['HMS Belleisle',-13,7],['HMS Mars',-16,8],['HMS Tonnant',-19,9],['HMS Bellerophon',-22,10],['HMS Colossus',-25,11]].forEach(([n,q,r])=>veteran(f.unit('ship',1,q,r,n)));
 f.unit('light',1,27,23,'Gibraltar garrison');f.unit('marine',1,24,18,'Royal Marines');
 // the Combined Fleet of France and Spain, in a long ragged line
 // (its van, under Dumanoir, sails on north and only comes back later: the event below)
 ['Héros','Santísima Trinidad','Bucentaure','Redoutable','Santa Ana','Fougueux','Monarca','Pluton','Algésiras','Bahama','Príncipe de Asturias']
  .forEach((n,i)=>{const r=-14+i*2.8;f.unit('ship',2,6+2.5*(r/16)**2,r,n);});
 f.line('light',3,23,-13,25,-15,2,'Cádiz garrison');f.unit('light',3,23,8,'Trafalgar battery');
 f.label('Atlantic Ocean',-14,-18,'water');f.label('Cape Trafalgar',26,9);f.label('Cádiz',25,-21);f.label('Approach to the strait',20,14,'water');f.label('Gibraltar',27,16);
 return finish(f,ev,{id:'trafalgar-1805',name:'Trafalgar: Break the Line',era:'napoleonic',date:'21 October 1805',difficulty:'Hard',
  objective:'Sink the Combined Fleet.',goal:{type:'fleet',towns:[]},
  brief:'You command the British fleet in two columns west of Cape Trafalgar. The French and Spanish ships outnumber yours, but they are strung out in a long line. Drive both columns through it, break it into pieces and fight each piece ship against ship before the far end can turn back to help. Your crews are veterans; keep your ships together and let the broadsides do the work. Ship counters stand for ships of the line and their consorts.',
  history:'On 21 October 1805 Nelson\'s fleet attacked the Franco-Spanish Combined Fleet off Cape Trafalgar in two columns, broke its line and captured or destroyed eighteen ships without losing one. Nelson was killed in the battle.',
  note:'The Atlantic west of Cape Trafalgar, with Cádiz to the north-east and Gibraltar, drawn much closer than it is, in the south-east.',
  sources:['https://en.wikipedia.org/wiki/Battle_of_Trafalgar'],
  // (the Combined Fleet holds no town and earns nothing: its gold pays its upkeep for well over the battle)
  economy:{money:20000,manpower:2500,aiMoney:{2:45000,3:6000},aiManpower:{2:500,3:600}},alliances:[[2,3]],aiCount:2,
  events:[
   ev('traf-signal','England expects',{type:'timer',seconds:12},{title:'England expects',body:'Signal from the flagship: England expects that every man will do his duty. The Combined Fleet is turning to meet you. Break its line in two places and fight it ship against ship.',style:'briefing'},[],[{owner:2,scope:'all',...at(-4,0)}]),
   ev('traf-rear',"Collingwood's rear",{type:'timer',seconds:70},{title:"Collingwood's rear",body:'The last ships of the lee column are coming up from the south-west.',style:'briefing'},
    [{owner:1,type:'ship',count:2,anchor:'coords',...at(-28,14)}]),
   ev('traf-dumanoir',"Dumanoir's van",{type:'timer',seconds:120},{title:"Dumanoir's van turns back",body:'Admiral Dumanoir has brought the van round at last and is coming back down the line to rescue the flagship.',style:'alert'},
    [{owner:2,type:'ship',count:3,anchor:'coords',...at(12,-22)}],[{owner:2,scope:'reinforcements',...at(-2,-4)}]),
   ev('traf-gravina',"Gravina's squadron",{type:'timer',seconds:170},{title:"Gravina's squadron",body:'Admiral Gravina\'s squadron of observation turns into the fight from the south.',style:'alert'},
    [{owner:2,type:'ship',count:2,anchor:'coords',...at(14,14)}],[{owner:2,scope:'reinforcements',...at(0,4)}]),
   ev('traf-storm','The storm',{type:'timer',seconds:240},{title:'A storm is coming',body:'The swell is rising from the west and a storm is on its way. Finish the Combined Fleet before it breaks.',style:'briefing'})
  ]});
}

function buildEraBattles({MapBuilder,ev}){
 return [gaugamela,thermopylae,salamis,cannae,hastings,agincourt,stirlingBridge,hattin,austerlitz,waterloo,borodino,trafalgar].map(build=>build(MapBuilder,ev));
}
module.exports={buildEraBattles,Field,finish,lerpPts,inEllipse,wind,at,SP,STATS};
