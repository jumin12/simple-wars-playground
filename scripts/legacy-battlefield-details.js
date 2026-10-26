'use strict';
const {catmull,distance}=require('./historical-battlefields');
const SP=27;
// Preserve existing scenario IDs, towns and scripted goals while refining their
// distinctive terrain. No generic river template or offshore depot is added.
function refineLegacyBattlefield(m){
 const d=m.data,id=m.entry.id,byKey=new Map(d.hexList.map(h=>[h.q+','+h.r,h]));
 const features=[],label=(name,q,r,kind='land')=>features.push({name,x:q*SP,y:r*SP,kind});let note='';
 const protectedCells=new Set(d.hexList.filter(h=>h.cityId).map(h=>h.q+','+h.r));
 const addRiver=(name,points,width=1)=>{const samples=catmull(points);for(const h of d.hexList)if(!protectedCells.has(h.q+','+h.r)&&distance(h.q,h.r,samples).d<width){h.type='water';h.owner=0;}const p=points[Math.floor(points.length/2)];label(name,...p,'water');};
 if(id==='thermopylae-480'){
  label('Malian Gulf',-2,-16,'water');label('Kallidromos',0,22);label('Mountain trail',25,24);
  note='The narrow coast road, southern mountain wall and separate high flanking trail form a deliberately compressed version of the pass.';
 }else if(id==='hastings-1066'){
  // Senlac was an inland battlefield, not an island with sea on every edge.
  for(const h of d.hexList)if(h.type==='water')h.type=Math.abs(h.q)>35?'forest':'grass';
  label('Senlac ridge',-8,-12);label('Caldbec Hill',24,-29);label('Norman approach',-4,15);
  note='An inland ridge battlefield with wooded flanks and open Norman approaches; water at the old artificial map edges has been removed.';
 }else if(id==='austerlitz-1805'){
  for(const h of d.hexList)if(h.type==='water'&&Math.abs(h.q)<23)h.type='grass';
  const points=[[-17,-39],[-12,-20],[-7,-2],[-11,17],[-6,39]];addRiver('Goldbach',points,1.05);
  d.bridges=[];for(const [i,[q,r]]of[[-12,-20],[-7,-2],[-11,17]].entries()){
   d.bridges.push({id:'goldbach_'+i,owner:0,x:q*SP,y:r*SP,w:SP*5.2,h:SP*1.3,angle:0});
   for(let dx=-2;dx<=2;dx++){const h=byKey.get((q+dx)+','+r);if(h){h.type='bridge';h.owner=q+dx< -5?1:r<8?2:3;}}
  }
  label('Pratzen Heights',17,-8);label('Southern ponds',19,32);label('Goldbach valley',-17,4);
  note='A winding Goldbach valley leads through three separately placed crossings to the central plateau and the southern pond ground.';
 }else if(id==='el-alamein-1942'){
  label('Mediterranean',1,-34,'water');label('Qattara Depression',-5,31);label('Northern breach',-6,-16);label('Defensive belt',-11,8);
  note='A coastal desert front pinched between the Mediterranean and the depression, with spaced defensive positions and an open northern breakthrough lane.';
 }else if(id==='normandy-dday'){
  label('English Channel',-5,-11,'water');label('Cotentin',-39,1);label('Normandy',7,23);label('Beachhead link',-10,9);
  note='A regional Channel-and-Normandy overview, distinct from the close beach, bridge, marsh and harbor maps in the ordered campaign.';
 }else if(id==='kursk-citadel'){
  addRiver('Seim',[[-55,9],[-34,14],[-20,12],[-5,9],[7,6],[24,12],[55,14]],.9);
  for(const [i,[q,r]]of[[-5,9],[8,6],[24,12]].entries()){d.bridges.push({id:'seim_'+i,owner:1,x:q*SP,y:r*SP,w:SP*4.8,h:SP*1.3,angle:Math.PI/2});for(let dr=-2;dr<=2;dr++){const h=byKey.get(q+','+(r+dr));if(h){h.type='bridge';h.owner=1;}}}
  label('Northern shoulder',-2,-23);label('Southern shoulder',19,28);label('Kursk salient',-4,-4);
  note='An operational salient with northern and southern approaches, a meandering Seim valley and separated town sectors rather than a mirrored river crossing.';
 }else if(id==='midway-1942'){
  d.roads=[];
  // Two elongated inhabited islands frame a lagoon; no fictional enemy island.
  for(const h of d.hexList)if(!h.cityId){const west=((h.q-14)/6)**2+((h.r-6)/3.6)**2,east=((h.q-28)/4.7)**2+((h.r-6)/3.1)**2;h.type=west<1||east<1?(west<.55||east<.5?'grass':'sand'):'water';if(h.type==='water')h.owner=0;else h.owner=1;}
  label('Midway lagoon',20,-2,'water');label('Pacific',-19,13,'water');
  note='A naval battlefield centered on the separate Sand and Eastern islands and their lagoon, with broad open water for task-group maneuver.';
 }
 if(!note)return m;
 d.mission.battlefield={version:1,northUp:true,note,features};m.entry.mapNote=note;
 return m;
}
module.exports={refineLegacyBattlefield};
