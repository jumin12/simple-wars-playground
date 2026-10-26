'use strict';
// Preserve purchased IDs while giving the original scenarios dated, bounded
// objectives. Historical outcomes are context, never invented player results.
function refineHistoricalMission(m,ev){
 const d=m.data,e=m.entry,id=e.id;
 const city=name=>{const c=d.cities.find(c=>c.name===name);if(!c)throw Error(id+': missing objective '+name);return c;};
 const rename=(from,to)=>{city(from).name=to;};
 let type='capture',targets=d.cities.filter(c=>c.owner!==1).map(c=>c.name),duration=0,history='',brief='';
 if(id==='thermopylae-480'){
  type='hold';duration=240;targets=['Hot Gates'];
  history='In 480 BCE the Greek defenders resisted at Thermopylae before a Persian flanking movement made the position untenable. The historical battle ended in Greek defeat.';
  brief='Hold the pass for four simulated minutes and screen the mountain trail. Tactical success represents a delaying action; conquest of Persia is not an objective.';
 }else if(id==='hastings-1066'){
  rename('Battle','Senlac ridge');targets=['Senlac ridge','Caldbec Hill'];
  history='On 14 October 1066 William’s Norman army defeated Harold’s English army near Hastings. Battle Abbey and the town of Battle developed after the battle.';
  brief='Pin the English shield wall with infantry and use the open approaches for cavalry. Secure the ridge and rear position.';
 }else if(id==='austerlitz-1805'){
  targets=['Pratzen','Sokolnitz rear'];history='On 2 December 1805 Napoleon defeated the Russian and Austrian armies at Austerlitz. The French attack on the Pratzen Heights was central to the battle.';
  brief='Cross the Goldbach and concentrate on Pratzen while protecting the southern approaches. Heavy units abstract the period’s mounted and supporting formations.';
 }else if(id==='el-alamein-1942'){
  rename('El Daba','Axis rear position');rename('Tell el Eisa','Northern defensive belt');targets=['Northern defensive belt','Axis rear position'];
  history='The Second Battle of El Alamein lasted from 23 October to 4 November 1942. Eighth Army attacked the Axis defenses between the Mediterranean and the Qattara Depression.';
  brief='Concentrate infantry and armor on a breach, then secure the rear objective. Spaced forts represent defensive belts and minefields; the map does not date the later capture of El Daba to the opening attack.';
 }else if(id==='normandy-dday'){
  e.name='Normandy: Link the Beachheads';targets=['Sainte-Mère-Église','Carentan','Isigny-sur-Mer','Bayeux','Ouistreham'];
  history='The Normandy landings began on 6 June 1944. Linking the beachheads took further fighting; Carentan was captured on 12 June. Caen and Cherbourg fell later.';
  brief='Land the assault waves and link the five marked town objectives. Other towns provide regional context and are not required captures. Marines represent assault infantry in landing craft, not US Marine Corps formations.';
 }else if(id==='kursk-citadel'){
  type='hold';duration=300;targets=['Kursk','Oboyan'];history='Operation Citadel opened on 5 July 1943 with German attacks against the Kursk salient from north and south. Soviet defenses and reserves contained the offensive; wider counteroffensives followed.';
  brief='Hold both objective sectors for five simulated minutes. This defensive vignette does not require capturing Orel or Kharkov and does not compress later counteroffensives into the opening day.';
 }else if(id==='midway-1942'){
  type='fleet';targets=[];history='The Battle of Midway was fought on 4–7 June 1942. Carrier aircraft were decisive; four Japanese fleet carriers were lost.';
  brief='Defeat the opposing naval formations while protecting your atoll. Ship counters abstract task groups and their air power: this is not a reconstruction of a direct surface duel. No enemy-owned town is required.';
 }
 e.history=history;e.adaptation='Scaled RTS adaptation: geography, force sizes and time are compressed. Generic units and scripted reserves represent formations rather than exact historical orders of battle.';
 e.description=e.date+' — '+e.objective;
 d.mission.title=e.name;d.mission.objective={type,label:e.objective,cityIds:targets.map(n=>city(n).id),duration,owner:2};
 d.mission.events=[ev(id+'-orders','Historical briefing',{type:'timer',seconds:0},{title:e.name,kicker:e.date,body:history+'\n\n'+brief+'\n\nObjective: '+e.objective+'\n\n'+e.adaptation,style:'briefing'})];
 if(id==='midway-1942')d.mission.events.push(ev('midway-context','Carrier battle',{type:'timer',seconds:90},{title:'Protect the task groups',body:'Historically, reconnaissance and carrier air strikes determined the battle. Keep your naval formations together; their combat power includes an abstracted air component.',style:'briefing'}));
 else{
  d.mission.events.push(ev(id+'-counter','Local enemy reserve',{type:'timer',seconds:100},{title:'Enemy reserves',body:'Enemy formations are reinforcing the active sector. Protect your supply route and retain a defense group.',style:'alert'},[{owner:2,type:'light',count:3,anchor:'enemy_city'}]));
  d.mission.events.push(ev(id+'-support','Friendly reserve',{type:'timer',seconds:170},{title:'Supporting formations',body:'Fresh infantry reaches your supplied rear area. Reinforce an objective or protect your assault’s flank.',style:'briefing'},[{owner:1,type:'light',count:3,anchor:'player_city'}]));
 }
 return m;
}
module.exports={refineHistoricalMission};
