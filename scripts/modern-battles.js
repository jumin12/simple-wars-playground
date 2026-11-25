'use strict';
// The shop's standalone modern missions, rebuilt the way the era battles are (scripts/era-battles.js): small maps drawn
// cell by cell, whole named armies (mission.fullStartingArmy), gold for every army's upkeep and manpower that limits
// recruiting, scripted waves for the formations of the day, and in the attacks a quarter of the usual manpower for the
// defenders (mission.enemyManpowerRate). Their IDs are the ones players bought:
//   el-alamein-1942  attack   break the northern belt between the sea and the Qattara cliffs
//   kursk-citadel    hold     the salient, against Model from the north and Hoth from the south
//   midway-1942      fleet    sink the carrier force and the invasion fleet around the atoll
//   normandy-dday    attack   land on Utah, Omaha and Gold and link them at Carentan and Bayeux
const {catmull,distance}=require('./historical-battlefields');
const {Field,finish,lerpPts,inEllipse,wind,at}=require('./era-battles');
const ADAPTATION='Scaled RTS adaptation: geography, force sizes and time are compressed. Units stand for divisions and brigades; scripted waves stand for the formations of the day rather than exact orders of battle.';

function elAlamein(MapBuilder,ev){
 const f=new Field(MapBuilder,30,1942);
 // The Mediterranean along the north, the cliffs of the Qattara Depression along the south, open desert between them
 // with the Miteirya, Kidney and Ruweisat ridges. The Axis line and its minefields face the Eighth Army in the east.
 f.paint((h,n)=>{
  const coast=-18+wind(h.q,.5,1.5),cliff=15+wind(h.q,1.7,1.5);
  if(h.r<coast)h.type='water';
  else if(h.r<coast+1.3)h.type='sand';
  else if(h.r>cliff+1.4)h.type=f.n(h.q,h.r,3)>.6?'mountain':'swamp';
  else if(h.r>cliff)h.type='mountain';
  else h.type=n<.62?'sand':'grass';
  if(inEllipse(h.q,h.r,-3,-5,7,1.6,1+(n-.5)*.6)||inEllipse(h.q,h.r,-9,-10,2.6,1.3)||inEllipse(h.q,h.r,5,7,9,1.5,1+(n-.5)*.6)||inEllipse(h.q,h.r,17,10,4,2))if(h.type!=='water'&&h.type!=='mountain')h.type='hill';
  h.owner=h.q<1+wind(h.r,2.4,1.4)?2:1;
 });
 const alamein=f.town(17,-13,1,'El Alamein'),halfa=f.town(18,4,1,'Alam Halfa');
 const eisa=f.town(-8,-14,2,'Tel el Eisa'),aqqaqir=f.town(-18,-6,2,'Tel el Aqqaqir'),shein=f.town(-9,7,2,'Deir el Shein');
 for(const [q,r]of[[-3,-6],[-3,3],[-2,11]])f.fort(q,r,2);
 f.road(alamein,eisa,[[5,-15],[-2,-15]]);f.road(eisa,aqqaqir,[[-13,-11]]);f.road(alamein,halfa,[[19,-4]]);f.road(aqqaqir,shein,[[-14,1]]);
 // Eighth Army: the infantry divisions in the line, the armoured brigades behind them
 [['9th Australian Division',9,-14],['51st Highland Division',9,-8],['2nd New Zealand Division',9,-3],['1st South African Division',9,2],['4th Indian Division',9,7],['50th Division',9,11]].forEach(([n,q,r])=>f.unit('light',1,q,r,n));
 [['1st Armoured Division',13,-11],['10th Armoured Division',13,-6],['2nd Armoured Brigade',13,-1],['7th Armoured Division',13,4],['9th Armoured Brigade',13,10]].forEach(([n,q,r])=>f.unit('heavy',1,q,r,n));
 f.unit('motorized',1,12,-14,'Lorried infantry');f.unit('motorized',1,12,0,'Motor brigade');
 // Panzerarmee Afrika: Italian and German infantry in the minefields, armour and motorised units behind
 [['164th Light Division',-5,-14],['Trento Division',-5,-8],['Bologna Division',-6,-1],['Brescia Division',-6,6],['Folgore Division',-5,12]].forEach(([n,q,r])=>f.unit('light',2,q,r,n));
 f.unit('heavy',2,-12,-9,'15th Panzer Division');f.unit('heavy',2,-12,3,'Littorio Division');
 f.unit('motorized',2,-15,-12,'90th Light Division');f.unit('motorized',2,-14,8,'Ariete Division');
 f.label('Mediterranean',2,-21,'water');f.label('Qattara Depression',0,20);f.label('Miteirya Ridge',-3,-7);f.label('Ruweisat Ridge',6,9);f.label('Minefields',-1,0);
 return finish(f,ev,{id:'el-alamein-1942',name:'El Alamein: Breakthrough',era:'modern',date:'23 October–4 November 1942',difficulty:'Standard',
  objective:'Break the northern belt: capture Tel el Eisa and Tel el Aqqaqir.',goal:{type:'capture',towns:['Tel el Eisa','Tel el Aqqaqir']},
  brief:'You command the Eighth Army between the sea and the Qattara cliffs. The Axis line is thick with minefields: the forts slow you and shelter its infantry. Break in at the north with the infantry, keep the armour back until there is a gap, and be ready for the panzers when they come up from the south.',
  history:'At the Second Battle of El Alamein, from 23 October to 4 November 1942, Montgomery\'s Eighth Army broke through the Axis defences between the Mediterranean and the Qattara Depression and drove Rommel\'s army out of Egypt.',
  note:'Open desert between the Mediterranean and the cliffs of the Qattara Depression, with low ridges and the Axis minefields across the middle.',
  sources:['https://www.nam.ac.uk/explore/battle-alamein'],adaptation:ADAPTATION,
  economy:{money:18000,manpower:2500,aiMoney:{2:14000},aiManpower:{2:1000}},enemyManpowerRate:.25,
  events:[
   ev('alamein-lightfoot','Operation Lightfoot',{type:'timer',seconds:15},{title:'Operation Lightfoot',body:'The barrage has lifted. Send the infantry through the northern minefields toward Tel el Eisa while the armour waits for a gap.',style:'briefing'}),
   ev('alamein-panzer','21st Panzer moves north',{type:'timer',seconds:120},{title:'21st Panzer moves north',body:'Rommel is bringing his southern armour up to close the breach. Meet it with your tanks.',style:'alert'},
    [{owner:2,type:'heavy',count:2,anchor:'coords',...at(-14,10)},{owner:2,type:'motorized',count:1,anchor:'coords',...at(-12,12)}],[{owner:2,scope:'reinforcements',...at(-6,-8)}]),
   ev('alamein-supercharge','Operation Supercharge',{type:'timer',seconds:180},{title:'Operation Supercharge',body:'Fresh armour and lorried infantry are ready behind the line for the final break-out.',style:'briefing'},
    [{owner:1,type:'heavy',count:3,anchor:'coords',...at(14,-6)},{owner:1,type:'motorized',count:2,anchor:'coords',...at(15,-9)}]),
   ev('alamein-reserve',"Rommel's last reserves",{type:'timer',seconds:240},{title:"Rommel's last reserves",body:'The last Axis reserves gather at Tel el Aqqaqir.',style:'alert'},
    [{owner:2,type:'light',count:2,anchor:'coords',...at(-18,-8)}])
  ]});
}

function kursk(MapBuilder,ev){
 const f=new Field(MapBuilder,30,1943);
 // The Kursk salient: steppe cut by wooded ravines, the Olkhovatka heights in the north, the Psel river across the
 // middle with three fords, the open ground at Prokhorovka. Model attacks from Orel in the north, Hoth from Belgorod.
 const psel=catmull([[-30,4],[-15,2],[0,5],[14,3],[30,6]]);
 f.paint((h,n)=>{
  h.type=n>.7?'forest':f.n(h.q,h.r,5)>.74?'hill':'grass';
  if(inEllipse(h.q,h.r,-3,-11,7,2.5,1+(n-.5)*.5)||inEllipse(h.q,h.r,-2,12,6,2,1+(n-.5)*.5))h.type='hill';
  if(inEllipse(h.q,h.r,13,8,6,4))h.type='grass';
  const near=distance(h.q,h.r,psel);
  if(near.d<.95&&![-14,0,13].some(q=>Math.abs(h.q-q)<=1))h.type='water';
  h.owner=h.r<-15+wind(h.q,.8,1.5)?2:h.r>16+wind(h.q,2.1,1.5)?3:1;
 });
 const orel=f.town(0,-21,2,'Orel'),ponyri=f.town(-6,-10,1,'Ponyri'),kursk=f.town(2,-2,1,'Kursk'),oboyan=f.town(-4,10,1,'Oboyan'),prok=f.town(12,9,1,'Prokhorovka'),belgorod=f.town(2,21,3,'Belgorod');
 for(const [q,r]of[[-9,-13],[4,-13],[-9,13],[-2,13],[6,14]])f.fort(q,r,1);
 f.road(orel,ponyri,[[-3,-16]]);f.road(ponyri,kursk,[[-2,-6]]);f.road(kursk,oboyan,[[0,4]]);f.road(oboyan,belgorod,[[-1,16]]);f.road(prok,oboyan,[[4,9]]);
 // Soviets: rifle divisions in the two defensive belts, tank brigades and guards in reserve
 [['13th Army rifle division',-12,-12],['70th Army rifle division',-4,-12],['48th Army rifle division',4,-12],['Guards rifle division',9,-11]].forEach(([n,q,r])=>f.unit('light',1,q,r,n));
 [['6th Guards Army rifle division',-12,12],['7th Guards Army rifle division',-4,13],['69th Army rifle division',4,12],['Guards airborne division',9,13]].forEach(([n,q,r])=>f.unit('light',1,q,r,n));
 [['T-34 tank brigade',0,-6],['1st Tank Army brigade',-8,3],['Guards tank brigade',8,3]].forEach(([n,q,r])=>f.unit('heavy',1,q,r,n));
 f.unit('motorized',1,5,0,'Guards motor brigade');f.unit('motorized',1,-5,0,'Anti-tank brigade');
 f.unit('light',1,2,-2,'Kursk garrison');f.unit('light',1,-4,10,'Oboyan garrison');
 // Model's Ninth Army from the north
 [['Tiger battalion',-6,-19],['Ferdinand battalion',0,-19],['2nd Panzer Division',6,-19]].forEach(([n,q,r])=>f.unit('heavy',2,q,r,n));
 f.line('light',2,-8,-17,8,-17,3,'Ninth Army infantry');f.unit('motorized',2,-10,-20,'Panzergrenadiers');
 // Hoth's Fourth Panzer Army from the south
 [['Leibstandarte',-8,19],['Das Reich',-2,19],['Totenkopf',4,19],['Grossdeutschland',10,19]].forEach(([n,q,r])=>f.unit('heavy',3,q,r,n));
 f.line('light',3,-6,18,6,18,2,'Fourth Panzer Army infantry');f.unit('motorized',3,12,20,'SS Panzergrenadiers');
 f.label('Olkhovatka heights',-3,-14);f.label('Psel',-22,4,'water');f.label('Prokhorovka field',15,11);f.label('Kursk salient',-14,-3);
 return finish(f,ev,{id:'kursk-citadel',name:'Kursk: Operation Citadel',era:'modern',date:'5–12 July 1943',difficulty:'Hard',price:200,
  objective:'Hold Kursk and Oboyan for 5:00.',goal:{type:'hold',towns:['Kursk','Oboyan'],duration:300},
  brief:'You command the Soviet fronts in the Kursk salient. German armour is coming at both shoulders at once: Model from Orel in the north and Hoth from Belgorod in the south. Let the defensive belts and their forts wear the Tigers down, keep your tank brigades back to plug breakthroughs, and hold Kursk and Oboyan.',
  history:'Operation Citadel opened on 5 July 1943 with German attacks on the Kursk salient from north and south. The Soviet defences, prepared for months, held; at Prokhorovka on 12 July the 5th Guards Tank Army met the II SS Panzer Corps, and the offensive was called off.',
  note:'A steppe salient cut by wooded ravines, with the Olkhovatka heights in the north, the Psel river across the middle and the open field at Prokhorovka.',
  sources:['https://tankmuseum.org/article/background-battle-kursk'],adaptation:ADAPTATION,
  economy:{money:18000,manpower:2500,aiMoney:{2:14000,3:16000},aiManpower:{2:1500,3:1500}},alliances:[[2,3]],aiCount:2,
  events:[
   ev('kursk-model','Model attacks',{type:'timer',seconds:20},{title:'Model attacks in the north',body:'The Ninth Army is driving on Ponyri. Hold the northern belt.',style:'alert'},[],[{owner:2,scope:'all',...at(-6,-10)}]),
   ev('kursk-hoth','Hoth attacks',{type:'timer',seconds:40},{title:'Hoth attacks in the south',body:'The SS panzer divisions are driving on Oboyan.',style:'alert'},[],[{owner:3,scope:'all',...at(-4,10)}]),
   ev('kursk-prok','To Prokhorovka',{type:'timer',seconds:130},{title:'The SS turn on Prokhorovka',body:'The II SS Panzer Corps is swinging east toward Prokhorovka.',style:'alert'},
    [{owner:3,type:'heavy',count:3,anchor:'coords',...at(10,19)}],[{owner:3,scope:'reinforcements',...at(12,9)}]),
   ev('kursk-guards','5th Guards Tank Army',{type:'timer',seconds:170},{title:'5th Guards Tank Army',body:'The Steppe Front\'s tank army has arrived north of Prokhorovka. Throw it at the SS.',style:'briefing'},
    [{owner:1,type:'heavy',count:4,anchor:'coords',...at(16,0)}]),
   ev('kursk-model2',"Model's last push",{type:'timer',seconds:230},{title:"Model's last push",body:'The Ninth Army makes a last attempt to break through to Kursk.',style:'alert'},
    [{owner:2,type:'heavy',count:2,anchor:'coords',...at(0,-21)},{owner:2,type:'light',count:2,anchor:'coords',...at(-3,-21)}],[{owner:2,scope:'reinforcements',...at(2,-2)}])
  ]});
}

function midway(MapBuilder,ev){
 const f=new Field(MapBuilder,28,1942606);
 // Open Pacific with Midway atoll: Sand Island and Eastern Island inside their reef. The Japanese carriers come from
 // the north-west, the invasion fleet from the west; the American task forces wait to the north-east.
 f.paint((h,n)=>{
  h.type='water';
  const sand=inEllipse(h.q,h.r,6,4,4.4,3.2,1+(n-.5)*.3),east=inEllipse(h.q,h.r,15,5,3.4,2.6,1+(n-.5)*.3);
  if(sand||east)h.type=inEllipse(h.q,h.r,6,4,3,2)||inEllipse(h.q,h.r,15,5,2.2,1.6)?'grass':'sand';
  h.owner=h.type==='water'?0:1;
 });
 const sand=f.town(6,4,1,'Sand Island'),east=f.town(15,5,1,'Eastern Island');
 f.fort(5,6,1);f.fort(15,3,1);
 // the American side: two carrier task forces and their screen to the north-east, submarines off the atoll, the island garrison
 // (the American carrier groups are veterans: their experienced air groups strike harder)
 [['Enterprise task group',19,-8],['Hornet task group',22,-6],['Cruiser screen',20,-3],['Destroyer screen',24,-9]].forEach(([n,q,r])=>Object.assign(f.unit('ship',1,q,r,n),{veteran:true,xp:100}));
 f.unit('ship',1,4,-1,'Submarine Nautilus');f.unit('ship',1,10,9,'PT boat squadron');
 f.unit('marine',1,5,3,'6th Marine Defense Battalion');f.unit('marine',1,7,5,'Marine raiders');f.unit('light',1,15,5,'Eastern Island airfield crews');
 // Kido Butai: four carriers and their battleship and cruiser escort
 [['Akagi',-18,-14],['Kaga',-15,-16],['Soryu',-20,-11],['Hiryu',-13,-12],['Kirishima',-16,-9],['Haruna',-11,-15]].forEach(([n,q,r])=>f.unit('ship',2,q,r,n));
 f.label('Sand Island',6,0);f.label('Eastern Island',16,1);f.label('Pacific Ocean',-6,14,'water');f.label('Kido Butai',-16,-19,'water');
 return finish(f,ev,{id:'midway-1942',name:'Midway',era:'modern',date:'4–7 June 1942',difficulty:'Standard',price:200,
  objective:'Sink the Japanese carriers, their escorts and the invasion fleet\'s warship.',goal:{type:'fleet',towns:[]},
  brief:'You command the American task forces and the Midway garrison. Four Japanese carriers are coming for the atoll from the north-west, and an invasion fleet will follow. Keep your ships together and strike the carriers while the island\'s guns and garrison hold their fire on anything that comes close. Ship counters stand for task groups and their aircraft.',
  history:'At Midway, from 4 to 7 June 1942, American carrier aircraft sank the four Japanese fleet carriers that had attacked Pearl Harbor, and the planned invasion of the atoll was abandoned.',
  note:'Open Pacific around Midway atoll, with Sand Island and Eastern Island inside their reef.',
  sources:['https://www.history.navy.mil/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1942/midway.html'],adaptation:ADAPTATION,
  // (the Japanese hold no town and earn nothing: their gold pays the fleet's upkeep for well over the battle)
  economy:{money:16000,manpower:2500,aiMoney:{2:40000},aiManpower:{2:1000}},
  events:[
   ev('midway-kido','Kido Butai',{type:'timer',seconds:20},{title:'Carriers sighted',body:'A scout plane has found the Japanese carriers north-west of the atoll. They are heading for Midway.',style:'alert'},[],[{owner:2,scope:'all',...at(4,-2)}]),
   ev('midway-yorktown','Yorktown',{type:'timer',seconds:100},{title:'Yorktown arrives',body:'Task Force 17 and the repaired Yorktown join the fight from the east.',style:'briefing'},
    [{owner:1,type:'ship',count:2,anchor:'coords',...at(26,-14)}]),
   ev('midway-invasion','The invasion fleet',{type:'timer',seconds:160},{title:'The invasion fleet',body:'Transports and their escort are coming from the west to land troops on Midway. Sink the escort, and keep the transports off the beaches.',style:'alert'},
    [{owner:2,type:'ship',count:1,anchor:'coords',...at(-25,16)},{owner:2,type:'transport',count:2,anchor:'coords',...at(-24,18)}],[{owner:2,scope:'reinforcements',...at(2,6)}])
  ]});
}

function normandy(MapBuilder,ev){
 const f=new Field(MapBuilder,32,19440606);
 // The Channel coast of Normandy: Utah beach west of the Vire estuary and its marshes, the bluffs above Omaha, the
 // cliffs at Port-en-Bessin, Gold beach to the east, and the hedgerow country inland toward Carentan, Bayeux and
 // Saint-Lo. The landings start on the beaches and in the landing craft offshore.
 const vire=catmull([[-18,-13],[-17,-7],[-19,-2],[-17,4]]);
 const coastAt=q=>-10+wind(q,.7,1.2);
 f.paint((h,n)=>{
  const coast=coastAt(h.q),cliffs=h.q>=-3&&h.q<=5;
  if(h.r<coast)h.type='water';
  else if(cliffs&&h.r<coast+1.3)h.type='mountain';
  else if(h.r<coast+1.6)h.type='sand';
  else if(h.q>=-15&&h.q<=-4&&h.r<coast+3.2)h.type='hill';
  else if(h.r>coast+4&&n>.63)h.type='forest';
  else h.type='grass';
  if(inEllipse(h.q,h.r,-21,-4,5,4,1+(n-.5)*.6)&&h.type!=='water')h.type='swamp';
  if(distance(h.q,h.r,vire).d<1.2&&h.r<coast+14)h.type='water';
  const beach=h.r<coast+2.8&&(h.q<=-20||(h.q>=-15&&h.q<=-5)||(h.q>=6&&h.q<=17));
  h.owner=h.type==='water'?0:beach?1:2;
 });
 const utah=f.town(-25,-7,1,'Utah beachhead'),omaha=f.town(-10,-7,1,'Omaha beachhead'),gold=f.town(11,-7,1,'Gold beachhead');
 const carentan=f.town(-24,2,2,'Carentan'),vier=f.town(-9,1,2,'Vierville'),port=f.town(1,-3,2,'Port-en-Bessin'),bayeux=f.town(12,4,2,'Bayeux'),stlo=f.town(-6,16,2,'Saint-Lo');
 for(const [q,r]of[[-13,-3],[-6,-3],[9,-3],[16,-3],[-27,-8]])f.fort(q,r,2);
 f.road(omaha,vier,[[-9,-3]]);f.road(vier,port,[[-4,-1]]);f.road(port,bayeux,[[7,1]]);f.road(gold,bayeux,[[12,-1]]);f.road(utah,carentan,[[-25,-2]]);f.road(vier,stlo,[[-8,8]]);f.road(carentan,vier,[[-17,3]]);
 // the landings: troops ashore at each beachhead, assault companies still in their landing craft, the bombardment fleet
 f.unit('light',1,-26,-8,'4th Infantry Division');f.unit('light',1,-23,-6,'101st Airborne Division');f.unit('light',1,-28,-6,'82nd Airborne Division');
 f.unit('marine',1,-26,-13,'Utah assault wave');f.unit('marine',1,-23,-13,'Utah assault wave II');
 f.unit('light',1,-12,-7,'1st Infantry Division');f.unit('light',1,-8,-8,'29th Infantry Division');f.unit('heavy',1,-10,-9,'743rd Tank Battalion');
 f.unit('marine',1,-14,-13,'Omaha assault wave');f.unit('marine',1,-10,-13,'Omaha assault wave II');f.unit('marine',1,-6,-13,'Rangers');
 f.unit('light',1,9,-8,'50th Northumbrian Division');f.unit('light',1,13,-7,'47 Royal Marine Commando');
 f.unit('heavy',1,10,-9,'8th Armoured Brigade');f.unit('heavy',1,14,-9,'Sherwood Rangers');
 f.unit('marine',1,9,-13,'Gold assault wave');f.unit('marine',1,14,-13,'Gold assault wave II');
 [['USS Nevada',-25,-17],['USS Texas',-12,-17],['USS Arkansas',-7,-17],['HMS Ajax',10,-17],['HMS Argonaut',15,-17]].forEach(([n,q,r])=>f.unit('ship',1,q,r,n));
 // the German defenders: static divisions in the coastal positions, paratroopers at Carentan, armour behind
 [['709th Static Division',-28,-5],['6th Fallschirmjager Regiment',-24,4],['352nd Division',-12,-4],['352nd Division II',-7,-4],['726th Grenadier Regiment',1,-1],['716th Division',12,-4],['915th Grenadier Regiment',12,6]].forEach(([n,q,r])=>f.unit('light',2,q,r,n));
 f.unit('heavy',2,-6,13,'Panzer Lehr Division');f.unit('heavy',2,20,16,'12th SS Panzer Division');f.unit('motorized',2,6,8,'Kampfgruppe Meyer');
 f.label('English Channel',0,-20,'water');f.label('Omaha',-10,-11,'water');f.label('Gold',12,-11,'water');f.label('Utah',-25,-11,'water');f.label('Vire estuary',-17,-8,'water');f.label('Bocage',2,10);
 return finish(f,ev,{id:'normandy-dday',name:'Normandy: Link the Beachheads',era:'modern',date:'6–12 June 1944',difficulty:'Hard',price:200,
  objective:'Link the beachheads: capture Carentan and Bayeux.',goal:{type:'capture',towns:['Carentan','Bayeux']},
  brief:'You command the Allied landings on three beaches. Get the assault waves ashore, use the warships offshore against the bunkers on the bluffs, then push inland through the hedgerows. Utah links to Omaha at Carentan, beyond the Vire marshes; Omaha links to Gold at Bayeux. Expect the panzers from Saint-Lo. Marines stand for assault infantry in landing craft.',
  history:'The Normandy landings began on 6 June 1944. The beachheads were linked in the following days: Bayeux was taken on 7 June and Carentan on 12 June, joining Utah to Omaha.',
  note:'The Channel coast from Utah beach and the Vire estuary to the bluffs above Omaha, the cliffs at Port-en-Bessin and Gold beach, with hedgerow country inland.',
  sources:['https://www.nam.ac.uk/explore/d-day','https://carentanlesmarais.fr/decouvrir/dday/'],adaptation:ADAPTATION,
  economy:{money:20000,manpower:3000,aiMoney:{2:16000},aiManpower:{2:1500}},enemyManpowerRate:.25,
  events:[
   ev('dday-second','Second wave',{type:'timer',seconds:60},{title:'The second wave',body:'More landing craft are coming in off Omaha.',style:'briefing'},
    [{owner:1,type:'marine',count:3,anchor:'coords',...at(-10,-14)}]),
   ev('dday-panzer','Panzer counterattack',{type:'timer',seconds:130},{title:'Panzer counterattack',body:'German armour and infantry are moving up from Saint-Lo toward Omaha.',style:'alert'},
    [{owner:2,type:'heavy',count:1,anchor:'coords',...at(-6,15)},{owner:2,type:'light',count:2,anchor:'coords',...at(-4,16)}],[{owner:2,scope:'reinforcements',...at(-9,1)}]),
   ev('dday-armour','Follow-up armour',{type:'timer',seconds:190},{title:'Follow-up armour',body:'British armour and infantry come ashore at Gold for the push on Bayeux.',style:'briefing'},
    [{owner:1,type:'heavy',count:2,anchor:'coords',...at(11,-9)},{owner:1,type:'light',count:2,anchor:'coords',...at(13,-8)}]),
   ev('dday-carentan','Carentan reinforced',{type:'timer',seconds:250},{title:'Carentan reinforced',body:'German paratroopers are reinforcing Carentan.',style:'alert'},
    [{owner:2,type:'light',count:1,anchor:'coords',...at(-24,5)}])
  ]});
}

function buildModernBattles({MapBuilder,ev}){
 return [normandy,kursk,midway,elAlamein].map(build=>build(MapBuilder,ev));
}
module.exports={buildModernBattles};
