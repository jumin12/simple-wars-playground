'use strict';
// Historical facts/sources live beside the scenarios. These are scaled tactical
// vignettes, not a claim that one division fought every sector in a campaign.
const SP=27,DIRS=[[1,0],[-1,0],[0,1],[0,-1]];
const {terrainNoise}=require('./store-mission-design');
const SOURCE={
 berlin:['https://www.dhm.de/lemo/kapitel/der-zweite-weltkrieg/kriegsverlauf/schlacht-um-berlin-1945','https://www.bundesarchiv.de/themen-entdecken/online-entdecken/dokumente-zur-zeitgeschichte/lagekarte-zur-schlacht-um-berlin/','https://www.berlin.de/landesdenkmalamt/denkmale/highlight-denkmale-der-alliierten/die-alliierten-in-berlin/berlin-unter-verwaltung-der-vier-maechte-1945-1948-646239.php'],
 normandy:['https://www.nam.ac.uk/explore/d-day','https://www.army.mod.uk/news/by-air-to-battle-on-d-day/','https://www.abmc.gov/history/discover-the-history-of-utah-beach-american-memorial/','https://carentanlesmarais.fr/decouvrir/dday/'],
 market:['https://www.nam.ac.uk/explore/market-garden','https://assets.publishing.service.gov.uk/government/uploads/system/uploads/attachment_data/file/30056/ww2_market_garden.pdf','https://www.nimh.nl/militaire-geschiedenis-van-nederland/webthemas/bevrijding-van-nederland-1944-1945/grote-lijnen/operatie-market-garden']
};
const PACKS=[
 {id:'berlin-1945-campaign',name:'Berlin 1945: The Final Offensive',price:350,date:'16 April–2 May 1945',difficulty:'Hard',theme:'berlin',description:'Seven linked Soviet assault sectors, from the Oder heights through Berlin’s outer districts to the government quarter. Different formations and overlapping battles form one ordered campaign.',stages:[
  {id:'berlin-01-seelow',name:'Seelow Heights',date:'16–19 April 1945',kind:'heights',towns:['Oder bridgehead','Seelow','Müncheberg'],history:'The Soviet offensive began on 16 April. German positions on the Seelow Heights delayed the advance before the front broke open.',brief:'Advance west from the Oderbruch. Infantry should secure the high-ground approaches before armor crosses the exposed fields.',objective:'Capture Seelow and the Müncheberg approach.'},
  {id:'berlin-02-northeast',name:'The northeastern districts',date:'21–23 April 1945',kind:'urban',towns:['Eastern assembly area','Weißensee','Lichtenberg','Pankow'],history:'Soviet forces entered Berlin from several directions. This sector follows the northeastern approach, rather than the route of every Soviet army.',brief:'Open the street corridors through Weißensee and Lichtenberg, then secure Pankow. Keep infantry beside armor in the urban approaches.',objective:'Secure the three northeastern district objectives.'},
  {id:'berlin-03-southeast',name:'Köpenick to Neukölln',date:'23–26 April 1945',kind:'canal',towns:['Southeastern assembly area','Köpenick','Treptow','Neukölln'],history:'The southeastern approach brought fighting through the Spree-side districts while other Soviet armies pressed toward central Berlin.',brief:'Use the river crossings to link Köpenick, Treptow and Neukölln. Hold both bridge approaches before committing the next assault group.',objective:'Capture the southeastern district objectives.'},
  {id:'berlin-04-south',name:'The southern ring',date:'26–28 April 1945',kind:'urban',towns:['Southern assembly area','Tempelhof','Schöneberg','Kreuzberg'],history:'Fighting moved through the southern districts toward the central defensive area. Airfield ground and canal crossings shaped the approaches.',brief:'Clear Tempelhof’s open approaches, then keep a screened route through Schöneberg and Kreuzberg. Districts are scaled capture sectors.',objective:'Secure Tempelhof, Schöneberg and Kreuzberg.'},
  {id:'berlin-05-spree',name:'Moabit and the Spree',date:'28–29 April 1945',kind:'canal',towns:['Moabit assembly area','Moltkebrücke approach','Government quarter'],history:'Assaults from Moabit crossed the Spree toward the government quarter before the attack on the Reichstag.',brief:'Take the bridge approaches and establish a supported bridgehead. Reinforce the crossing instead of sending armor ahead alone.',objective:'Capture the Spree crossing and government-quarter approach.'},
  {id:'berlin-06-reichstag',name:'The Reichstag sector',date:'30 April–1 May 1945',kind:'urban',towns:['Spree bridgehead','Königsplatz','Reichstag','Tiergarten approach'],history:'The assault on the Reichstag began on 30 April, with fighting continuing into 1 May. The building’s capture did not end all fighting in Berlin.',brief:'Clear the Königsplatz approach, secure every Reichstag objective cell and protect the flank toward the Tiergarten.',objective:'Secure the Reichstag sector and its approaches.'},
  {id:'berlin-07-center',name:'The final central sectors',date:'1–2 May 1945',kind:'urban',towns:['Government-quarter bridgehead','Mitte sector','Potsdamer Platz','Reich Chancellery sector'],history:'Berlin’s garrison surrendered on 2 May. This is distinct from the later surrender of all German armed forces.',brief:'Link the remaining central capture sectors. Completing these objectives represents the end of the battle, not a requirement to destroy every defender.',objective:'Secure the central sectors and conclude the Berlin campaign.'}
 ]},
 {id:'normandy-1944-campaign',name:'Normandy: D-Day to Cherbourg',price:300,date:'6–26 June 1944',difficulty:'Standard',theme:'normandy',description:'Five connected perspectives: the airborne bridges, Omaha, the eastern beaches, Carentan and Cherbourg. The missions follow historical milestones rather than a single unit’s march.',stages:[
  {id:'normandy-01-tonga',name:'Operation Tonga',date:'6 June 1944 · before dawn',kind:'canal',towns:['Landing Zone N','Bénouville bridge sector','Ranville bridge sector','Merville battery sector'],history:'British 6th Airborne troops seized the Caen Canal and Orne bridges and attacked the Merville battery before the beach landings.',brief:'Your airborne infantry begins on land. Secure the two bridge sectors and the battery approach; this game represents airborne deployment with pre-positioned infantry.',objective:'Secure the bridge sectors and Merville objective.'},
  {id:'normandy-02-omaha',name:'Omaha Beach',date:'6 June 1944',kind:'beach',towns:['Off-map embarkation depot','Vierville-sur-Mer','Saint-Laurent-sur-Mer','Colleville-sur-Mer'],history:'The US 1st and 29th Infantry Divisions landed at Omaha. The difficult exits from the beach had to be opened under strong resistance.',brief:'Assault infantry uses marine rules to represent landing craft, not US Marine Corps formations. Establish a foothold and secure the three inland exit sectors.',objective:'Open the Omaha exits and capture the inland objectives.'},
  {id:'normandy-03-east',name:'Gold, Juno and Sword',date:'6–7 June 1944',kind:'beach',towns:['Off-map embarkation depot','Arromanches sector','Courseulles-sur-Mer','Hermanville-sur-Mer'],history:'British forces landed at Gold and Sword; Canadian forces landed at Juno. Caen was not captured on D-Day.',brief:'Connect the three eastern beach sectors. Naval support and assault boats are abstracted by the existing ship and marine unit types.',objective:'Link the eastern beachheads through all three sector objectives.'},
  {id:'normandy-04-carentan',name:'Carentan: link the beaches',date:'10–13 June 1944',kind:'marsh',towns:['Utah approach','Carentan','Brévands approach','Southern causeway'],history:'The capture of Carentan connected the Utah and Omaha beachheads. German counterattacks followed the capture of the town.',brief:'Use the causeways through the flooded low ground. Secure Carentan and keep the links to the neighboring beach sectors open.',objective:'Capture Carentan and link the causeway objectives.'},
  {id:'normandy-05-cherbourg',name:'Cherbourg',date:'22–26 June 1944',kind:'port',towns:['VII Corps approach','Fort du Roule sector','Cherbourg center','Harbor approach'],history:'US VII Corps fought into Cherbourg in late June; the city surrendered on 26 June. Its port facilities were badly damaged.',brief:'Break the inland defensive sectors before securing the center and harbor approach. Capturing the port does not imply that its facilities are immediately usable.',objective:'Secure Fort du Roule, the center and the harbor approach.'}
 ]},
 {id:'market-garden-1944-campaign',name:'Market Garden: Bridges and Withdrawal',price:300,date:'17–26 September 1944',difficulty:'Hard',theme:'market',description:'Five linked missions follow the ground corridor, Son, Arnhem, Nijmegen and the Oosterbeek withdrawal. Parallel battles overlap in time; the final objective is evacuation, reflecting the operation’s failure to secure the Arnhem crossing.',stages:[
  {id:'market-01-corridor',name:'The ground corridor',date:'17 September 1944',kind:'heights',towns:['Joe’s Bridge assembly area','Valkenswaard','Eindhoven approach'],history:'British XXX Corps advanced from its bridgehead toward the airborne forces. The narrow road corridor was vulnerable to delay and counterattack.',brief:'Concentrate the Guards Armoured advance along the road, but keep infantry on the flanks and at the rear crossing.',objective:'Open the corridor through Valkenswaard toward Eindhoven.'},
  {id:'market-02-son',name:'Son: the broken bridge',date:'18–19 September 1944',kind:'broken',towns:['Eindhoven','Son south bank','Son north bank'],history:'The bridge at Son was destroyed before the 101st Airborne could seize it intact. Engineers provided a replacement crossing for the ground advance.',brief:'Secure the banks and build a bridge over the canal at the road gap. Ordinary land units should use the crossing while infantry screens the banks.',objective:'Link and secure both Son bank objectives.'},
  {id:'market-03-arnhem',name:'Arnhem: hold the north end',date:'19–21 September 1944',kind:'hold',towns:['Arnhem north-end perimeter','Eastern approach','Western approach'],history:'Only part of the British 1st Airborne Division reached Arnhem’s road bridge. The isolated north-end defenders were eventually overwhelmed.',brief:'Hold the north-end perimeter for four simulated minutes. Completing this tactical stand does not turn Market Garden into a historical Allied victory.',objective:'Hold the Arnhem perimeter for 4:00.',duration:240},
  {id:'market-04-nijmegen',name:'Nijmegen: across the Waal',date:'20 September 1944',kind:'river',towns:['Groesbeek assembly area','Nijmegen south approach','Waal north bank'],history:'US 82nd Airborne troops crossed the Waal in assault boats while Allied forces fought for Nijmegen’s bridges.',brief:'Use assault boats, represented by marines, to support the crossing. Secure both bridge approaches; the wider Arnhem situation remains unresolved.',objective:'Secure Nijmegen’s crossing and the north-bank objective.'},
  {id:'market-05-oosterbeek',name:'Oosterbeek: Operation Berlin',date:'25–26 September 1944',kind:'evacuate',towns:['Oosterbeek perimeter','South-bank evacuation area','Eastern blocking position'],history:'Survivors of the 1st Airborne Division withdrew across the Lower Rhine on the night of 25–26 September. Operation Berlin was the withdrawal’s codename.',brief:'Protect the perimeter until nightfall at 3:00, then ferry at least three original 1st Airborne formations to the south-bank area and unload them. Newly trained troops do not count as evacuees.',objective:'After 3:00, evacuate three 1st Airborne units to the south bank.',duration:180}
 ]}
];
function noise(q,r,seed){return terrainNoise(q,r,1944+seed);}
function buildHistoricalCampaigns({MapBuilder,ev}) {
 const missions=[],packs=[];
 for(const [pi,pack]of PACKS.entries()){
  const stages=[];
  for(const [si,s]of pack.stages.entries()){
   const b=new MapBuilder(34,194400+pi*100+si),seed=pi*100+si,berlin=pack.theme==='berlin';b.mapShape='rectangle';
   b.each(h=>{const n=noise(h.q,h.r,seed);h.type=n>.57?'forest':n<.27?'hill':'grass';h.owner=berlin?(h.q>12?1:2):(h.r>7?1:2);});
   if(s.kind==='heights')b.each(h=>{if(Math.abs(h.q+5)<5)h.type='hill';if(berlin&&h.q>19&&h.q<22)h.type='water';});
   if(['canal','broken','river','hold','evacuate','marsh'].includes(s.kind))b.each(h=>{
    const river=s.kind==='evacuate'?5:0;
    if(Math.abs(h.r-river)<=1)h.type='water';else if(s.kind==='marsh'&&Math.abs(h.r)<9&&Math.abs(h.q)>5)h.type='swamp';
   });
   if(s.id==='normandy-01-tonga')b.each(h=>{if(h.type==='water')h.type='grass';if(Math.abs(h.q+8)<=1||Math.abs(h.q-8)<=1)h.type='water';});
   if(['beach','port'].includes(s.kind))b.each(h=>{const coast=-5+Math.round(Math.sin(h.q*.12));h.type=h.r<coast?'water':h.r<coast+3?'sand':noise(h.q,h.r,seed)>.52?'forest':'grass';h.owner=2;});
   const city=(q,r,owner,name)=>{b.ensureLand(q,r,4);const c=b.city(q,r,owner,name,{blocks:s.kind==='urban'?13:9});for(const h of b.hexes.values())if(Math.max(Math.abs(h.q-q),Math.abs(h.r-r))<5&&h.type!=='water')h.owner=owner;return c;};
   let towns=[];
   if(s.kind==='beach'){
    b.blob(-25,-22,6,'grass',{noise:.05});towns=[city(-25,-22,1,s.towns[0]),...s.towns.slice(1).map((n,i)=>city(-20+i*20,5+i%2*10,2,n))];
   }else if(s.kind==='port')towns=[city(0,23,1,s.towns[0]),city(-16,9,2,s.towns[1]),city(4,3,2,s.towns[2]),city(23,-3,2,s.towns[3])];
   else if(s.id==='normandy-01-tonga')towns=[city(0,20,1,s.towns[0]),city(-14,-4,2,s.towns[1]),city(14,-4,2,s.towns[2]),city(25,-20,2,s.towns[3])];
   else if(s.kind==='hold'){
    b.each(h=>h.owner=2);towns=[city(0,-7,1,s.towns[0]),city(22,-15,2,s.towns[1]),city(-22,-15,2,s.towns[2])];
   }else if(s.kind==='evacuate'){
    b.each(h=>h.owner=h.r>6?1:2);towns=[city(-8,-9,1,s.towns[0]),city(-8,19,1,s.towns[1]),city(22,-12,2,s.towns[2])];
   }else if(s.kind==='broken')towns=[city(-12,20,1,s.towns[0]),city(0,9,1,s.towns[1]),city(0,-10,2,s.towns[2])];
   else if(berlin)towns=[city(27,14,1,s.towns[0]),...s.towns.slice(1).map((n,i)=>city(3-i*13,-8+(i%2)*21,2,n))];
   else towns=[city(-12,20,1,s.towns[0]),...s.towns.slice(1).map((n,i)=>city(-17+i*18,-12+(i%2)*3,2,n))];
   if(s.kind==='broken'){towns[1].owner=1;for(const h of b.hexes.values())if(h.cityId===towns[1].id)h.owner=1;}
   if(s.kind==='evacuate')b.each(h=>{if(h.q>=-25&&h.q<=7&&h.r>=-12&&h.r<=3&&h.type!=='water')h.owner=1;});
   // Berlin's inner stages are districts, with substantial rounded urban
   // footprints and park gaps, rather than tiny rural villages in open fields.
   if(berlin&&s.kind==='urban')for(const c of towns.filter(c=>c.owner===2))b.each(h=>{
    const reach=5.6+(noise(h.q,h.r,seed)-.5)*2;
    if(!h.cityId&&h.type!=='water'&&Math.hypot(h.q-c.q,h.r-c.r)<reach){h.type='urban';h.cityId=c.id;h.owner=c.owner;h.urbanVariant=Math.floor(noise(h.q*3,h.r*3,seed)*5);}
   });
   const bridge=(q,r,vertical=true)=>{b.bridge(q,r,vertical?Math.PI/2:0,0);for(let i=-2;i<=2;i++){const h=b.at(q+(vertical?0:i),r+(vertical?i:0));if(h){h.type='bridge';h.owner=1;}}};
   if(s.id==='normandy-01-tonga'){bridge(-8,-4,false);bridge(8,-4,false);}
   else if(['canal','river','hold','marsh'].includes(s.kind))for(const q of[-20,0,20])bridge(q,0);
   if(s.kind==='heights'&&berlin)for(const r of[-15,4,22])bridge(20,r,false);
   if(s.kind==='broken')for(const q of[-29,29])bridge(q,0); // Long detours remain available; the road bridge is broken.
   // Spaced defenses support the main axes rather than solid fort walls.
   for(const c of towns.filter(c=>c.owner===2))b.fort(c.q+4,c.r+4,2);
   const add=(type,owner,q,r,name)=>{
    const wanted=b.nearestWhere(q,r,12,h=>type==='ship'||type==='transport'?h.type==='water':type==='marine'&&s.kind==='beach'&&owner===1?h.type==='water':h.type!=='water'&&h.type!=='mountain'&&h.owner===owner);
    if(!wanted)throw Error(s.id+': no '+type+' spawn');
    const afloatMarine=type==='marine'&&wanted.type==='water',origin=afloatMarine?towns.find(c=>c.owner===owner):wanted;
    const u=b.unit(type==='transport'?'ship':type,owner,origin.q,origin.r,name);u.x=wanted.x;u.y=wanted.y;if(type==='transport')Object.assign(u,{type:'transport',hp:50,maxHp:50,damage:4,manpower:500,maxManpower:500,tanks:0,maxTanks:0,speed:28,radius:17});return u;
   };
   if(s.kind==='beach'){
    for(let i=0;i<12;i++)add('marine',1,-24+i*4,-10,'Landing infantry '+(i+1));
    for(let i=0;i<4;i++){add('ship',1,-17+i*10,-17,'Naval support '+(i+1));add('transport',1,-27+i*3,-17,'Landing transport '+(i+1));}
    for(let i=0;i<4;i++)add(i<2?'heavy':'light',1,-27+i*2,-22,'Follow-up formation '+(i+1));
   }else if(s.kind==='evacuate'){
    for(let i=0;i<10;i++)add('light',1,-22+i*3,-6,'1st Airborne '+(i+1));
    for(let i=0;i<6;i++)add('transport',1,-14+i*3,5,'Royal Engineers ferry '+(i+1));
   }else{
    const airborne=s.id==='normandy-01-tonga'||s.kind==='hold';
    const c=towns[0];for(let i=0;i<14;i++)add(airborne||i<10?'light':'heavy',1,c.q-3+(i%4)*2,c.r-3+Math.floor(i/4)*2,(s.kind==='hold'?'2nd Battalion':s.id==='normandy-01-tonga'?'6th Airborne':'Assault formation')+' '+(i+1));
    if(s.kind==='river')for(let i=0;i<6;i++)add('marine',1,-22+i*3,5,'504th PIR assault boats '+(i+1));
   }
   for(const [ci,c]of towns.filter(c=>c.owner===2).entries())for(let i=0;i<8;i++)add(s.id==='normandy-01-tonga'||i<6?'light':'heavy',2,c.q-3+(i%4)*2,c.r-2+Math.floor(i/4)*2,'Defending formation '+ci+'-'+i);
   const mode=s.kind==='hold'?'hold':s.kind==='evacuate'?'evacuate':'capture';
   const objective={type:mode,label:s.objective,cityIds:mode==='hold'?[towns[0].id]:towns.filter(c=>c.owner===2).map(c=>c.id),duration:s.duration||0};
   if(s.kind==='broken')objective.cityIds=towns.slice(1).map(c=>c.id);
   if(mode==='evacuate')Object.assign(objective,{minUnits:3,unitPrefix:'1st Airborne',zone:{x:towns[1].x,y:towns[1].y,radius:SP*4}});
   const adaptation='Scaled RTS adaptation: terrain, distances, forces and battle time are compressed. Generic unit classes represent formations; supplied assembly areas are gameplay logistics anchors.';
   const events=[ev(s.id+'-brief','Historical briefing',{type:'timer',seconds:0},{title:s.name,kicker:s.date,body:s.history+'\n\n'+s.brief+'\n\nObjective: '+s.objective+'\n\n'+adaptation,style:'briefing'}),ev(s.id+'-pressure','Enemy pressure',{type:'timer',seconds:90},{title:'Local counterattack',body:'Enemy reserves are approaching the active sector. Keep a defense group behind your assault and protect your supply route.',style:'alert'},[{owner:2,type:'light',count:3,anchor:'enemy_city'}])];
   if(mode!=='evacuate')events.push(ev(s.id+'-reserve','Reserve formations',{type:'timer',seconds:150},{title:'Reserves available',body:'A fresh infantry reserve reaches your supplied assembly area. Use it to support the next objective or defend your rear.',style:'briefing'},[{owner:1,type:'light',count:2,anchor:'player_city'}]));
   const data=b.export({money:26000,manpower:24000,aiMoney:{2:19000},aiManpower:{2:20000},mission:{version:1,title:s.name,victoryMode:'domination',objective,events}});data.gamePeriod='modern';data.hexRadius=20;
   const sources=[...SOURCE[pack.theme]];
   if(s.id==='normandy-05-cherbourg')sources.push('https://history.army.mil/Publications/Publications-Catalog/Utah-Beach-to-Cherbourg/','https://www.nationalww2museum.org/war/articles/assault-on-fortress-cherbourg-june-1944');
   if(s.id==='berlin-01-seelow')sources.push('https://www.politische-bildung-brandenburg.de/lexikon/schlacht-um-die-seelower-hoehen');
   const entry={id:s.id,name:s.name,file:s.id+'.json',date:s.date,description:s.history,objective:s.objective,history:s.history,adaptation,sources,gamePeriod:'modern',difficulty:pack.difficulty,aiCount:1,packId:pack.id,packName:pack.name,stageIndex:si,stageCount:pack.stages.length,packType:'campaign'};
   missions.push({file:entry.file,entry,data});stages.push(entry);
  }
  packs.push({id:pack.id,name:pack.name,description:pack.description,objective:'Complete '+stages.length+' linked stages in order. Replay unlocked stages or resume your next battle.',price:pack.price,date:pack.date,gamePeriod:'modern',difficulty:pack.difficulty,file:stages[0].file,aiCount:1,packType:'campaign',stages,sources:SOURCE[pack.theme]});
 }
 return{missions,packs};
}
module.exports={buildHistoricalCampaigns,SOURCE};
