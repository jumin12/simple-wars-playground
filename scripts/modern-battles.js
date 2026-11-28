'use strict';
// The shop's standalone modern missions, rebuilt the way the era battles are (scripts/era-battles.js): small maps drawn
// cell by cell, whole named armies (mission.fullStartingArmy), gold for every army's upkeep and manpower that limits
// recruiting, scripted waves for the formations of the day, and in the attacks a quarter of the usual manpower for the
// defenders (mission.enemyManpowerRate). Their IDs are the ones players bought:
//   el-alamein-1942  attack   break the northern belt between the sea and the Qattara cliffs
//   kursk-citadel    hold     the salient, against Model from the north and Hoth from the south
//   midway-1942      fleet    sink the carrier force and the invasion fleet around the atoll
//   normandy-dday    attack   land on Utah, Omaha and Gold and link them at Carentan and Bayeux
//   stalingrad-1942  hold     Mamayev Kurgan and the central landing, with the Volga at your back
//   bastogne-1944    attack   relieve the surrounded town: take Assenois while the perimeter holds
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

function stalingrad(MapBuilder,ev){
 const f=new Field(MapBuilder,28,1942913);
 // The city strings out along the west bank of the Volga: the Tractor Factory in the north, Mamayev Kurgan over the
 // centre, the central landing on the river, and the Tsaritsa gorge to the south, beyond which the Germans have reached
 // the water. West of the city is open steppe; across the Volga the east bank, where the Soviet guns and reserves wait.
 const bank=r=>15+wind(r,.9,1.4),far=r=>bank(r)+6+wind(r,2.2,.8);
 const gorge=catmull([[-28,9],[-14,8],[-2,10],[8,9],[15,9]]);
 f.paint((h,n)=>{
  const b=bank(h.r),e=far(h.r);
  h.type=n<.35?'sand':'grass';
  // (the ruined city: blocks of rubble with streets between them, cover for whoever holds them; only the town cores are
  // streets that must be taken)
  if(h.q>-7+wind(h.r,1.7,1.5)&&h.q<b-.5&&f.n(h.q,h.r,5)>.42&&(h.q+80)%5&&(h.r+80)%6)h.type='urban';
  if(inEllipse(h.q,h.r,2,-6,4.5,3.2,1+(n-.5)*.4))h.type='hill';
  if(distance(h.q,h.r,gorge).d<1.1)h.type='swamp';
  if(h.q>=b&&h.q<e)h.type='water';else if(h.q>=e)h.type=n>.62?'forest':'grass';
  h.owner=h.q>=e?1:h.q<-3+wind(h.r,2.6,1.4)||h.r>9.5?2:1;
 });
 const kurgan=f.town(2,-6,1,'Mamayev Kurgan'),landing=f.town(12,1,1,'Central landing'),tractor=f.town(6,-16,1,'Tractor Factory'),sloboda=f.town(25,3,1,'Krasnaya Sloboda');
 const gumrak=f.town(-18,-5,2,'Gumrak'),gorod=f.town(-14,-17,2,'Gorodishche'),elshanka=f.town(3,16,2,'Elshanka');
 f.road(gumrak,kurgan,[[-8,-6]]);f.road(kurgan,landing,[[7,-2]]);f.road(kurgan,tractor,[[4,-11]]);f.road(gorod,tractor,[[-4,-17]]);f.road(gumrak,elshanka,[[-8,12]]);
 // 62nd Army: rifle divisions through the city, two tank brigades, the Volga flotilla's gunboats, guns on the east bank
 [['284th Rifle Division',2,-6],['95th Rifle Division',0,-10],['308th Rifle Division',3,-14],['37th Guards Rifle Division',9,-19],['138th Rifle Division',8,-10],['10th NKVD Division',12,1]].forEach(([n,q,r])=>f.unit('light',1,q,r,n));
 f.unit('heavy',1,6,-2,'84th Tank Brigade');f.unit('heavy',1,10,-13,'137th Tank Brigade');
 f.unit('mountaineer',1,2,2,'Sniper group');f.unit('motorized',1,6,6,'42nd Rifle Brigade');
 f.unit('ship',1,18,-4,'Volga flotilla');f.unit('ship',1,18,6,'Volga flotilla II');f.unit('light',1,24,7,'Front artillery group');
 // Sixth Army: infantry divisions on the edge of the city, panzers and motorised divisions behind, assault pioneers
 [['71st Infantry Division',-2,12],['94th Infantry Division',8,13],['76th Infantry Division',-7,-2],['295th Infantry Division',-7,-8],['389th Infantry Division',-6,-15],['305th Infantry Division',-10,-19]].forEach(([n,q,r])=>f.unit('light',2,q,r,n));
 [['14th Panzer Division',-12,-3],['24th Panzer Division',-10,12],['16th Panzer Division',-12,-13]].forEach(([n,q,r])=>f.unit('heavy',2,q,r,n));
 f.unit('motorized',2,-15,1,'3rd Motorized Division');f.unit('motorized',2,-16,-11,'60th Motorized Division');f.unit('mountaineer',2,-8,4,'Pioneer battalions');
 f.label('Volga',18,-14,'water');f.label('Tsaritsa gorge',-10,7);f.label('Factory district',10,-21);f.label('East bank',25,-12);f.label('Steppe',-21,-14);
 return finish(f,ev,{id:'stalingrad-1942',name:'Stalingrad: The Volga Bank',era:'modern',date:'September–November 1942',difficulty:'Hard',price:200,
  objective:'Hold Mamayev Kurgan and the central landing for 5:00.',goal:{type:'hold',towns:['Mamayev Kurgan','Central landing'],duration:300},
  brief:'You command the 62nd Army in the ruins of Stalingrad with the Volga at your back. The Sixth Army will throw division after division at Mamayev Kurgan, the hill that looks down on the whole river bank, and at the central landing, where every reinforcement comes across. Fight for each block: the rubble shelters the defender. The gunboats on the river can reach the streets near the bank.',
  history:'From September 1942 the German Sixth Army fought its way into Stalingrad and pushed the 62nd Army back to a strip of the Volga bank, but never took the whole city. On 19 November the Soviet counter-offensive, Operation Uranus, broke through on both sides of the city and encircled the Sixth Army, which surrendered in February 1943.',
  note:'A strip of ruined city along the west bank of the Volga, from the Tractor Factory past Mamayev Kurgan to the Tsaritsa gorge, with the steppe to the west and the east bank across the river.',
  sources:['https://en.wikipedia.org/wiki/Battle_of_Stalingrad'],adaptation:ADAPTATION,
  economy:{money:18000,manpower:2500,aiMoney:{2:20000},aiManpower:{2:1000}},
  events:[
   ev('stal-assault','The assault on the city',{type:'timer',seconds:15},{title:'Paulus attacks',body:'The Sixth Army is storming into the city, and its first blow is falling on Mamayev Kurgan. Hold the hill and the landing.',style:'alert'},[],[{owner:2,scope:'all',...at(2,-6)}]),
   ev('stal-guards','13th Guards',{type:'timer',seconds:70},{title:'The 13th Guards cross the Volga',body:'General Rodimtsev\'s 13th Guards Rifle Division has crossed the river under fire and is coming up from the central landing.',style:'briefing'},
    [{owner:1,type:'light',count:3,anchor:'coords',...at(11,4)}]),
   ev('stal-gorge','Through the gorge',{type:'timer',seconds:130},{title:'Drive on the landing',body:'German armour and infantry are pushing along the Tsaritsa gorge toward the central landing. If it falls, nothing more can cross.',style:'alert'},
    [{owner:2,type:'heavy',count:1,anchor:'coords',...at(-12,11)},{owner:2,type:'light',count:2,anchor:'coords',...at(-10,13)}],[{owner:2,scope:'reinforcements',...at(12,1)}]),
   ev('stal-factories','The factory district',{type:'timer',seconds:190},{title:'The factory district',body:'Fresh German divisions are attacking from the north, past the Tractor Factory, toward Mamayev Kurgan.',style:'alert'},
    [{owner:2,type:'light',count:2,anchor:'coords',...at(-12,-18)},{owner:2,type:'heavy',count:1,anchor:'coords',...at(-10,-20)}],[{owner:2,scope:'reinforcements',...at(2,-6)}]),
   ev('stal-uranus','Operation Uranus',{type:'timer',seconds:255},{title:'Operation Uranus',body:'Far out on the steppe the Soviet fronts have broken through on both sides of the city, and the Sixth Army is being encircled. Hold on through its last attacks.',style:'briefing'})
  ]});
}

function bastogne(MapBuilder,ev){
 const f=new Field(MapBuilder,28,19441226);
 // Wooded, hilly Ardennes country. The town of Bastogne and its perimeter sit in the north-middle, ringed by the
 // besieging German divisions; south of the ring a German blocking force holds the villages of Assenois and Sibret on
 // the roads up from the south, where Patton's Third Army has arrived.
 f.paint((h,n)=>{
  const ring=inEllipse(h.q,h.r,0,-6,8.5,7,1+(n-.5)*.35);
  h.type=n>.62?'forest':f.n(h.q,h.r,4)>.7?'hill':'grass';
  if(ring&&inEllipse(h.q,h.r,0,-6,3.5,3))h.type='grass';
  h.owner=ring||h.r>15+wind(h.q,1.4,1.2)?1:h.r>2.5+wind(h.q,3.1,1.5)?3:2;
 });
 const bast=f.town(0,-6,1,'Bastogne'),vaux=f.town(-9,19,1,'Vaux-lez-Rosières'),mart=f.town(9,19,1,'Martelange');
 const assenois=f.town(1,6,3,'Assenois'),sibret=f.town(-12,6,3,'Sibret'),noville=f.town(5,-19,2,'Noville'),champs=f.town(-17,-8,2,'Champs');
 f.road(mart,assenois,[[4,13]]);f.road(assenois,bast,[[0,0]]);f.road(vaux,sibret,[[-11,13]]);f.road(sibret,bast,[[-6,-1]]);f.road(bast,noville,[[3,-13]]);f.road(champs,bast,[[-9,-7]]);
 // the 101st Airborne and Combat Command B inside the perimeter; the 4th Armored Division in the south
 [['501st Parachute Infantry',-4,-9],['502nd Parachute Infantry',-5,-3],['506th Parachute Infantry',3,-11],['327th Glider Infantry',4,-2],['326th Airborne Engineers',5,-8]].forEach(([n,q,r])=>f.unit('light',1,q,r,n));
 f.unit('heavy',1,1,-2,'Combat Command B');f.unit('motorized',1,-2,-11,'705th Tank Destroyer Battalion');
 [['37th Tank Battalion',-1,19],['8th Tank Battalion',4,20],['35th Tank Battalion',-6,20]].forEach(([n,q,r])=>f.unit('heavy',1,q,r,n));
 f.unit('motorized',1,1,21,'53rd Armored Infantry Battalion');f.unit('motorized',1,-3,18,'10th Armored Infantry Battalion');f.unit('light',1,13,18,'318th Infantry Regiment');
 // the besiegers round the ring, and the blocking force on the southern roads
 [['26th Volksgrenadier Division',-11,-5],['Volksgrenadier Regiment 77',9,-11],['Volksgrenadier Regiment 78',-7,-16]].forEach(([n,q,r])=>f.unit('light',2,q,r,n));
 f.unit('heavy',2,11,-3,'Panzer Lehr Division');f.unit('heavy',2,8,-19,'2nd Panzer Division');f.unit('motorized',2,-16,-12,'15th Panzergrenadier Division');
 [['5th Fallschirmjäger Division',-3,8],['Fallschirmjäger Regiment 14',-11,10],['Fallschirmjäger Regiment 15',9,7],['Assenois garrison',1,10]].forEach(([n,q,r])=>f.unit('light',3,q,r,n));
 f.unit('heavy',3,5,12,'Assault gun brigade');f.unit('mountaineer',3,-8,5,'Fallschirmjäger pioneers');
 // (dug in on the road to Assenois)
 f.fort(-2,10,3);f.fort(4,11,3);
 f.label('Bastogne perimeter',6,-14);f.label('Ardennes forest',-20,-18);f.label('Road from Arlon',8,15);f.label('Third Army',-14,21);
 return finish(f,ev,{id:'bastogne-1944',name:'Bastogne: Break the Ring',era:'modern',date:'19–26 December 1944',difficulty:'Hard',
  objective:'Break through to Bastogne: capture Assenois and keep Bastogne.',goal:{type:'capture',towns:['Assenois','Bastogne']},
  brief:'You command both the surrounded 101st Airborne in Bastogne and the 4th Armored Division south of it. Inside the ring, hold the perimeter: the Germans will attack it from every side. In the south, fight up the road through the woods, take Assenois and open the way into the town. Bastogne must still be yours when Assenois falls.',
  history:'In the Battle of the Bulge the 101st Airborne Division and part of the 10th Armored Division were surrounded at Bastogne from 20 December 1944. Their commander answered a German demand to surrender with "Nuts!". On 26 December tanks of the 4th Armored Division broke through at Assenois and reached the perimeter.',
  note:'Wooded Ardennes hills around Bastogne and its perimeter, with the villages of Assenois and Sibret on the roads from the south.',
  sources:['https://en.wikipedia.org/wiki/Siege_of_Bastogne'],adaptation:ADAPTATION,
  economy:{money:22000,manpower:2500,aiMoney:{2:20000,3:12000},aiManpower:{2:1500,3:800}},alliances:[[2,3]],aiCount:2,enemyManpowerRate:.25,
  events:[
   ev('bast-nuts','Nuts!',{type:'timer',seconds:15},{title:'"Nuts!"',body:'The Germans have surrounded Bastogne and demanded its surrender. General McAuliffe has answered in one word: "Nuts!". Hold the perimeter while the 4th Armored fights its way up from the south.',style:'alert'},[],[{owner:2,scope:'all',...at(0,-6)}]),
   ev('bast-air','Supplies from the air',{type:'timer',seconds:70},{title:'Supplies from the air',body:'The skies have cleared. Supplies are coming down by parachute over Bastogne, and gliders have brought in fresh troops.',style:'briefing'},
    [{owner:1,type:'light',count:2,anchor:'coords',...at(-1,-7)}]),
   ev('bast-champs','The Christmas attack',{type:'timer',seconds:130},{title:'The Christmas attack',body:'Panzers and Volksgrenadiers are attacking the west of the perimeter from Champs.',style:'alert'},
    [{owner:2,type:'heavy',count:1,anchor:'coords',...at(-17,-12)},{owner:2,type:'light',count:2,anchor:'coords',...at(-19,-10)}],[{owner:2,scope:'reinforcements',...at(0,-6)}]),
   ev('bast-cobra','Cobra King',{type:'timer',seconds:160},{title:'Cobra King',body:'Fresh tanks of the 37th Tank Battalion are ready to dash up the road through Assenois to the perimeter.',style:'briefing'},
    [{owner:1,type:'heavy',count:2,anchor:'coords',...at(0,20)}]),
   ev('bast-last','The last assault',{type:'timer',seconds:250},{title:'The last assault on the perimeter',body:'The Germans make one more attempt to break into Bastogne from the north.',style:'alert'},
    [{owner:2,type:'light',count:2,anchor:'coords',...at(6,-20)},{owner:2,type:'heavy',count:1,anchor:'coords',...at(4,-21)}],[{owner:2,scope:'reinforcements',...at(0,-6)}])
  ]});
}

function buildModernBattles({MapBuilder,ev}){
 return [normandy,kursk,midway,elAlamein,stalingrad,bastogne].map(build=>build(MapBuilder,ev));
}
module.exports={buildModernBattles};
