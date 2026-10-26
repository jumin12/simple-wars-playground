'use strict';
// Individually laid-out, north-up tactical maps. Coordinates are deliberately
// compressed for RTS play, but rivers, relief and approaches have distinct plans.
const SP=27;
const river=(name,points,width=1.25)=>({name,points,width});
const patch=(type,ellipse,name)=>({type,ellipse,name});
const road=(from,to,via=[])=>({from,to,via});
const PLANS={
 'berlin-01-seelow':{
  size:44,towns:[[19,19,1],[-3,-5,2],[-27,14,2]],front:['x',12,1],
  rivers:[river('Oder',[[29,-36],[25,-23],[29,-8],[24,5],[26,18],[21,36]],1.9),river('Alte Oder',[[13,-36],[11,-22],[16,-10],[12,3],[16,10]],.7)],
  patches:[patch('swamp',[20,-13,5,14],'Oderbruch'),patch('swamp',[20,10,4,8]),patch('hill',[-5,-18,5,19],'Seelow Heights'),patch('hill',[-10,13,7,16]),patch('forest',[-30,-22,14,10]),patch('forest',[-31,26,15,7])],
  bridges:[[26,-19],[25,15]],roads:[road(0,1,[[10,10],[6,-4]]),road(1,2,[[-14,3]])],forts:[[0,-13],[-7,2],[-13,19]],
  labels:[['Oderbruch',18,-3,'land'],['Seelow Heights',-10,-18,'land']],note:'The Oderbruch floodplain lies east of the heights; the Soviet bridgehead attacks west toward Seelow and Müncheberg.'
 },
 'berlin-02-northeast':{
  size:40,towns:[[31,17,1],[3,-8,2],[13,18,2],[-19,-22,2]],front:['x',26,1],
  rivers:[river('Panke',[[-25,-33],[-26,-22],[-21,-12],[-23,0],[-17,12],[-22,32]],.65)],lakes:[[-1,-19,3.8,2.4,'Weißensee']],
  patches:[patch('urban',[-15,-20,12,8]),patch('urban',[5,-7,18,12]),patch('urban',[14,17,15,10]),patch('forest',[-4,8,7,5],'Friedrichshain'),patch('forest',[-32,-24,8,8]),patch('forest',[31,-22,9,7])],
  roads:[road(0,2,[[25,19]]),road(2,1,[[11,7],[6,0]]),road(1,3,[[-9,-12]])],bridges:[[-21,-12]],forts:[[19,6],[-9,-13]],
  labels:[['Weißensee lake',-1,-24,'water'],['Friedrichshain',-3,8,'land']],note:'Three different northeastern approaches surround Weißensee, with the Panke on the western edge and distinct built-up districts.'
 },
 'berlin-03-southeast':{
  size:42,towns:[[30,27,1],[16,3,2],[-3,10,2],[-27,18,2]],front:['y',22,1],
  rivers:[river('Spree',[[44,16],[30,15],[19,10],[8,1],[-4,-3],[-19,-8],[-44,-15]],1.7),river('Dahme',[[20,36],[16,25],[20,17],[19,10]],1.25),river('Landwehrkanal',[[-44,5],[-30,2],[-16,3],[-4,-3]],.65)],
  lakes:[[31,15,9,5,'Müggelsee']],patches:[patch('forest',[28,-11,11,12]),patch('forest',[35,29,9,7]),patch('forest',[2,9,5,8],'Treptower Park'),patch('urban',[-26,18,12,10]),patch('urban',[-3,10,8,8]),patch('urban',[15,2,8,6])],
  bridges:[[18,10],[17,25],[-2,-3],[-21,2]],roads:[road(0,1,[[22,26],[17,25],[12,17],[18,10]]),road(1,2,[[7,4]]),road(2,3,[[-15,14]])],forts:[[8,13],[-18,11]],
  labels:[['Müggelsee',31,13,'water'],['Treptower Park',1,17,'land']],note:'The Spree and Dahme meet by Köpenick; Müggelsee, wooded banks and the southwest approach toward Neukölln shape this sector.'
 },
 'berlin-04-south':{
  size:40,towns:[[-5,27,1],[17,6,2],[-24,1,2],[2,-14,2]],front:['y',22,1],
  rivers:[river('Landwehrkanal',[[-42,-6],[-27,-9],[-16,-7],[-4,-7],[7,-4],[22,-8],[42,-6]],.8)],
  patches:[patch('urban',[-24,0,12,17]),patch('urban',[15,2,15,12]),patch('urban',[0,-17,17,10]),patch('forest',[-30,-23,10,7]),patch('grass',[15,19,16,8],'Tempelhof airfield'),patch('grass',[-7,10,4,9])],
  bridges:[[-18,-7],[5,-5],[25,-8]],roads:[road(0,1,[[1,22],[13,13]]),road(0,2,[[-15,17],[-23,10]]),road(1,3,[[7,0],[5,-5]]),road(2,3,[[-18,-7],[-8,-12]])],forts:[[8,0],[-17,-1]],
  labels:[['Tempelhof airfield',16,20,'land'],['Landwehrkanal',-29,-12,'water']],note:'A broad airfield apron south of Tempelhof contrasts with Schöneberg street blocks and the canal separating the northern approaches.'
 },
 'berlin-05-spree':{
  size:36,towns:[[-23,-20,1],[0,-4,2],[20,17,2]],front:['y',-15,-1],
  rivers:[river('Spree',[[-38,10],[-28,9],[-19,2],[-15,-7],[-6,-11],[3,-8],[6,1],[15,7],[28,5],[38,10]],1.6),river('Humboldthafen',[[-2,-10],[-2,-18],[-1,-28]],.9)],
  patches:[patch('urban',[-24,-15,13,8]),patch('urban',[5,-1,12,10]),patch('urban',[23,15,11,10]),patch('forest',[-12,19,16,9],'Tiergarten'),patch('grass',[0,14,5,7])],
  bridges:[[1,-9],[-17,-3],[22,6]],roads:[road(0,1,[[-15,-17],[-4,-15],[1,-9]]),road(1,2,[[7,3],[13,10]])],forts:[[11,12],[0,3]],
  labels:[['Humboldthafen',-7,-24,'water'],['Tiergarten',-13,20,'land']],note:'Moabit lies across a tight Spree bend from the government-quarter approach, with the harbor channel and Tiergarten limiting flanks.'
 },
 'berlin-06-reichstag':{
  size:35,towns:[[-15,-24,1],[-8,-5,2],[10,-7,2],[-21,16,2]],front:['y',-21,-1],
  rivers:[river('Spree',[[-37,-4],[-27,-7],[-17,-15],[-5,-18],[8,-13],[22,-12],[37,-17]],1.25)],
  patches:[patch('urban',[17,3,16,21]),patch('urban',[-14,-24,14,7]),patch('forest',[-19,15,16,12],'Tiergarten'),patch('urban',[-11,-5,7,5]),patch('grass',[-6,-3,7,5],'Königsplatz'),patch('grass',[-21,16,7,2])],
  bridges:[[-15,-16],[10,-13]],roads:[road(0,1,[[-17,-20],[-15,-16],[-13,-10]]),road(1,2,[[0,-5]]),road(1,3,[[-16,4],[-21,9]])],forts:[[15,-1],[-12,7]],
  labels:[['Tiergarten',-22,23,'land'],['Königsplatz',-7,1,'land']],note:'A close assault sector around the Spree bridgehead, open Königsplatz, the Reichstag and the wooded Tiergarten rather than a rural district template.'
 },
 'berlin-07-center':{
  size:37,towns:[[-28,-22,1],[15,-13,2],[-16,17,2],[4,7,2]],front:['x',-24,-1],
  rivers:[river('Spree',[[-39,2],[-29,-5],[-23,-17],[-12,-22],[1,-23],[15,-21],[28,-18],[39,-20]],1.3),river('Landwehrkanal',[[-39,25],[-27,23],[-12,27],[2,25],[17,26],[39,14]],.65)],
  patches:[patch('urban',[9,-5,25,21]),patch('urban',[-14,14,15,9]),patch('urban',[-28,-22,8,6]),patch('forest',[-28,7,10,12],'Western Tiergarten'),patch('grass',[1,9,3,5])],
  bridges:[[-26,-10],[15,-21],[-15,26],[27,21]],roads:[road(0,1,[[-22,-25],[-3,-26],[15,-21]]),road(1,3,[[11,-2]]),road(3,2,[[-5,10]])],forts:[[11,4],[-8,12]],
  labels:[['Central Berlin',20,3,'land']],note:'The final center is a continuous urban sector between the Spree and Landwehrkanal, with the Tiergarten to the west and separate central objectives.'
 },
 'normandy-01-tonga':{
  size:40,towns:[[22,13,1],[-15,-5,2],[15,-5,2],[27,-23,2]],front:['y',9,1],
  sea:{axis:'y',side:-1,points:[[-42,-30],[-20,-31],[0,-28],[20,-30],[42,-27]]},
  rivers:[river('Caen Canal',[[-11,-34],[-11,-15],[-9,2],[-10,18],[-12,34]],.8),river('Orne',[[4,-34],[7,-23],[5,-13],[9,-3],[5,8],[10,20],[11,34]],1.25),river('Dives',[[35,-34],[32,-20],[36,-5],[31,11],[35,34]],.65)],
  patches:[patch('forest',[24,21,9,6]),patch('forest',[-27,15,9,12]),patch('swamp',[26,-20,4,7]),patch('hill',[26,-5,5,10]),patch('urban',[-15,-5,3,3]),patch('urban',[15,-5,3,3])],
  bridges:[[-10,-6],[7,-6]],roads:[road(0,2,[[23,4],[20,-1]]),road(2,1,[[7,-6],[-1,-6],[-10,-6]]),road(2,3,[[22,-13]])],forts:[[26,-20]],
  labels:[['Caen Canal',-18,23,'water'],['Orne',6,26,'water'],['Dives',31,23,'water']],note:'The relatively straight man-made Caen Canal contrasts with the meandering Orne; the airborne landing zone is east of both bridge objectives.'
 },
 'normandy-02-omaha':{
  size:42,towns:[[-33,-1,1],[-22,9,2],[0,12,2],[24,11,2]],front:['beachhead',0,0],
  sea:{axis:'y',side:-1,points:[[-44,-1],[-31,-6],[-19,-10],[-5,-12],[8,-11],[23,-7],[44,0]]},
  patches:[patch('hill',[-26,2,10,3],'Western bluffs'),patch('hill',[0,1,12,4],'Omaha bluffs'),patch('hill',[27,4,11,4]),patch('forest',[-22,24,13,6]),patch('forest',[11,26,19,5]),patch('grass',[-22,5,2,6]),patch('grass',[0,6,2,7]),patch('grass',[24,7,2,7])],
  roads:[road(0,1,[[-30,3],[-25,5]]),road(1,2,[[-13,13]]),road(2,3,[[12,14]])],forts:[[-24,0],[-4,0],[26,5]],
  landing:[[-28,-13],[-14,-17],[4,-18],[24,-13]],fleet:[[-28,-23],[-10,-27],[8,-25],[29,-20]],
  labels:[['Omaha Beach',0,-6,'land'],['Bocage',9,26,'land']],note:'A concave beach, bluff line and three inland exit valleys lead into hedgerow country. The small western foothold replaces the old artificial offshore depot island.'
 },
 'normandy-03-east':{
  size:44,towns:[[-34,1,1],[-19,-2,2],[4,0,2],[28,10,2]],front:['beachhead',0,0],
  sea:{axis:'y',side:-1,points:[[-46,-5],[-33,-11],[-17,-12],[-3,-9],[10,-11],[24,-6],[36,-3],[46,4]]},
  rivers:[river('Seulles',[[1,35],[-2,22],[3,13],[5,3],[4,-10]],.7),river('Orne',[[39,35],[33,24],[36,13],[33,3],[37,-3]],1.05)],
  patches:[patch('hill',[-24,12,10,4]),patch('forest',[-16,24,13,7]),patch('forest',[22,25,12,6]),patch('urban',[5,0,5,3]),patch('urban',[28,10,5,5]),patch('grass',[18,6,8,5])],
  bridges:[[4,2],[34,20]],roads:[road(0,1,[[-28,0]]),road(1,2,[[-9,2],[4,2]]),road(2,3,[[18,7]])],forts:[[-25,-5],[15,1],[30,5]],
  landing:[[-26,-18],[-10,-16],[10,-18],[30,-9]],fleet:[[-31,-26],[-12,-26],[9,-26],[33,-20]],
  labels:[['Gold',-23,-7,'land'],['Juno',4,-5,'land'],['Sword',29,0,'land']],note:'Three different coastal sectors are separated by the Seulles and the Orne estuary, with open landing grounds giving way to villages inland.'
 },
 'normandy-04-carentan':{
  size:41,towns:[[-14,-23,1],[-5,8,2],[20,-3,2],[2,25,2]],front:['y',-17,-1],
  sea:{axis:'x',side:1,points:[[-34,40],[-20,35],[-8,32],[5,37],[34,44]]},
  rivers:[river('Douve',[[-43,-3],[-31,0],[-17,-7],[-4,-8],[8,-13],[22,-11],[31,-18],[43,-18]],1.15),river('Merderet',[[-22,-35],[-26,-24],[-21,-14],[-17,-7]],.7)],
  patches:[patch('swamp',[-18,-5,16,6],'Flooded meadows'),patch('swamp',[6,-8,14,7]),patch('forest',[-27,19,10,11]),patch('forest',[24,20,11,9]),patch('urban',[-5,8,5,4]),patch('grass',[-8,-4,2,17]),patch('grass',[16,0,7,2])],
  bridges:[[-7,-8],[-24,-21]],roads:[road(0,1,[[-10,-15],[-7,-8],[-7,0]]),road(1,2,[[8,4],[16,0]]),road(1,3,[[-2,18]])],forts:[[-10,2],[9,12]],
  labels:[['Flooded Douve valley',-22,-4,'land'],['Carentan causeway',-12,-13,'land']],note:'The Douve and Merderet join in low flooded meadows, with a narrow northern causeway and the estuary opening east of Carentan.'
 },
 'normandy-05-cherbourg':{
  size:40,towns:[[-7,25,1],[-4,8,2],[-6,-9,2],[20,-15,2]],front:['y',20,1],
  sea:{axis:'y',side:-1,points:[[-42,-19],[-31,-25],[-22,-22],[-14,-14],[-5,-12],[5,-13],[15,-18],[27,-25],[42,-22]]},
  rivers:[river('Divette',[[-17,34],[-13,21],[-16,11],[-10,1],[-8,-11]],.65)],
  patches:[patch('hill',[-2,12,6,10],'Fort du Roule'),patch('hill',[-28,7,9,16]),patch('forest',[-29,21,11,9]),patch('urban',[-6,-7,11,6]),patch('urban',[19,-14,8,4]),patch('grass',[7,-5,4,7])],
  bridges:[[-10,1],[-14,17]],roads:[road(0,1,[[-4,17]]),road(1,2,[[-10,1]]),road(2,3,[[6,-12],[14,-14]])],forts:[[-2,13],[-23,-2],[20,-10]],
  labels:[['Cherbourg roadstead',2,-23,'water'],['Roule heights',3,13,'land']],note:'A recessed harbor and headlands frame the northern port. Fort du Roule rises inland to the south, approached through a different river valley.'
 },
 'market-01-corridor':{
  size:40,towns:[[-22,26,1],[-5,-1,2],[18,-24,2]],front:['y',22,1],
  rivers:[river('Bocholt–Herentals Canal',[[-42,17],[-24,18],[-8,15],[8,17],[24,15],[42,13]],.9),river('Dommel',[[29,34],[23,21],[28,9],[19,-3],[23,-15],[18,-34]],.75)],
  patches:[patch('forest',[-18,1,9,13]),patch('forest',[4,-12,8,10]),patch('forest',[33,-23,8,9]),patch('swamp',[-28,12,7,4]),patch('hill',[6,12,7,5]),patch('urban',[18,-23,8,6])],
  bridges:[[-21,18],[22,-14]],roads:[road(0,1,[[-21,18],[-15,10],[-9,6]]),road(1,2,[[3,-9],[10,-16]])],forts:[[-10,6],[8,-15]],
  labels:[['Ground corridor',-8,14,'land'],['Wooded heath',-23,-4,'land']],note:'A diagonal road corridor links the canal bridgehead, wooded heath around Valkenswaard and the Eindhoven approach; the Dommel constrains the east flank.'
 },
 'market-02-son':{
  size:38,towns:[[-10,24,1],[-10,3,1],[-5,-17,2]],front:['y',0,1],
  rivers:[river('Wilhelmina Canal',[[-40,-3],[-24,-3],[-8,-4],[7,-7],[23,-8],[40,-12]],.95),river('Dommel',[[21,33],[15,22],[18,13],[12,3],[5,-7]],.65)],
  patches:[patch('forest',[-26,-18,10,10]),patch('forest',[29,-19,9,9]),patch('urban',[-10,23,12,7]),patch('urban',[-9,3,5,4]),patch('urban',[-5,-17,5,4]),patch('swamp',[19,10,4,6])],
  bridges:[[-31,-3]],broken:[-7,-4],roads:[road(0,1,[[-11,13]]),road(1,2,[[-7,-4],[-5,-10]])],forts:[[-1,-10],[4,-23]],
  labels:[['Broken crossing',-7,-5,'land'],['Wilhelmina Canal',21,-12,'water']],note:'The man-made canal has long straight reaches and a missing road bridge at Son; the curving Dommel joins from the southeast. A far-west crossing is a scaled gameplay detour.'
 },
 'market-03-arnhem':{
  size:37,towns:[[8,5,1],[29,-5,2],[-21,-9,2]],front:['perimeter',0,0],
  rivers:[river('Lower Rhine',[[-39,14],[-27,12],[-14,7],[-2,9],[12,15],[26,13],[39,6]],1.55)],
  patches:[patch('urban',[8,-8,26,14]),patch('urban',[-22,-9,8,8]),patch('forest',[-26,-24,13,6]),patch('forest',[-5,-21,7,5],'Sonsbeek'),patch('swamp',[-20,23,12,5]),patch('grass',[24,24,13,6])],
  bridges:[[10,14]],roads:[road(0,1,[[17,0],[23,-3]]),road(0,2,[[-4,0],[-12,-4]])],forts:[[22,-2],[-12,-5]],
  labels:[['Bridge perimeter',9,1,'land'],['Lower Rhine',-25,14,'water']],note:'The north-end bridge perimeter is backed by a broad river bend, with dense city streets north of the water and open polder on the south bank.'
 },
 'market-04-nijmegen':{
  size:42,towns:[[27,25,1],[2,7,2],[15,-23,2]],front:['y',19,1],
  rivers:[river('Waal',[[-44,-5],[-31,-10],[-18,-11],[-7,-5],[2,-3],[11,-6],[20,-13],[31,-15],[44,-10]],2.0)],
  patches:[patch('hill',[28,20,13,10],'Groesbeek heights'),patch('forest',[36,7,6,13],'Reichswald edge'),patch('urban',[0,8,12,7]),patch('urban',[15,-23,6,5]),patch('swamp',[-18,-22,17,5])],
  bridges:[[-12,-8],[11,-6]],roads:[road(0,1,[[20,20],[12,12]]),road(1,2,[[9,0],[11,-6],[15,-15]])],forts:[[7,1],[19,-18]],
  marine:[[-29,-9],[-25,-11],[-20,-11],[-16,-10],[-12,-8],[-8,-5]],
  labels:[['Waal assault crossing',-23,-16,'water'],['Groesbeek heights',27,25,'land']],note:'The Waal makes a broad bend north of Nijmegen. West-bank assault boats complement two bridge approaches, while Groesbeek rises to the southeast.'
 },
 'market-05-oosterbeek':{
  size:40,towns:[[-12,-9,1],[-8,25,1],[29,-9,2]],front:['evacuation',0,0],
  rivers:[river('Lower Rhine',[[-42,14],[-29,9],[-15,7],[0,11],[15,16],[29,14],[42,5]],1.6)],
  patches:[patch('forest',[-24,-16,15,12],'Oosterbeek woods'),patch('hill',[-9,-17,12,10]),patch('urban',[-12,-9,5,4]),patch('urban',[29,-9,9,7]),patch('swamp',[9,25,13,5]),patch('grass',[-15,0,16,5])],
  roads:[road(0,2,[[0,-12],[15,-11]])],forts:[[17,-7]],ferries:[[-23,8],[-19,7],[-15,7],[-11,8],[-7,9],[-3,10]],evacuees:[[-26,-3],[-23,-3],[-20,-3],[-17,-3],[-14,-3],[-11,-3],[-8,-3],[-5,-3],[-2,-3],[1,-3]],
  labels:[['Oosterbeek perimeter',-17,-14,'land'],['Driel evacuation bank',-8,28,'land']],note:'A wooded north-bank perimeter faces the sweeping Lower Rhine bend. The Driel landing area is across the river; there is no bridge through the evacuation sector.'
 }
};

function catmull(points){const out=[];for(let i=0;i<points.length-1;i++){const p0=points[Math.max(0,i-1)],p1=points[i],p2=points[i+1],p3=points[Math.min(points.length-1,i+2)];for(let s=0;s<16;s++){const t=s/16,t2=t*t,t3=t2*t;out.push([0,1].map(k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3)));}}out.push(points.at(-1));return out;}
function distance(q,r,points){let best=Infinity,index=0;for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((q-a[0])*dx+(r-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(q-a[0]-t*dx,r-a[1]-t*dy);if(d<best){best=d;index=i;}}return{d:best,index};}
function interpolate(points,value){const p=points.slice().sort((a,b)=>a[0]-b[0]);if(value<=p[0][0])return p[0][1];for(let i=1;i<p.length;i++)if(value<=p[i][0]){const t=(value-p[i-1][0])/(p[i][0]-p[i-1][0]);return p[i-1][1]*(1-t)+p[i][1]*t;}return p.at(-1)[1];}
function own(plan,q,r){const [axis,line,dir]=plan.front;if(axis==='perimeter'){const c=plan.towns[0];return Math.hypot((q-c[0])/1.05,r-c[1])<7?1:2;}if(axis==='beachhead'){const c=plan.towns[0];return Math.hypot(q-c[0],r-c[1])<8?1:2;}if(axis==='evacuation')return r>17||q>=-30&&q<=5&&r>=-17&&r<=6?1:2;return((axis==='x'?q:r)-line)*dir>0?1:2;}
function applyPlan(b,plan){
 b.mapShape='rectangle';b.each(h=>{h.type='grass';h.owner=own(plan,h.q,h.r);});
 for(const area of plan.patches||[]){const [q,r,rx,ry]=area.ellipse;b.each(h=>{const edge=1+.12*Math.sin(h.q*.28+h.r*.19)+.06*Math.sin(h.q*.51-h.r*.27);if(((h.q-q)/rx)**2+((h.r-r)/ry)**2<edge){const street=area.type==='urban'&&((h.q+80)%6===0||(h.r+80)%7===0);h.type=street?'grass':area.type;if(area.type==='urban')h._builtUpArea=true;}});}
 const waterways=(plan.rivers||[]).map(v=>({...v,samples:catmull(v.points)}));
 b.each(h=>{
  if(plan.sea){const s=plan.sea,v=s.axis==='y'?h.q:h.r,c=s.axis==='y'?h.r:h.q;if((c-interpolate(s.points,v))*s.side>0)h.type='water';}
  for(const v of waterways){const near=distance(h.q,h.r,v.samples),width=v.width*(1+.1*Math.sin(near.index*.13));if(near.d<=width)h.type='water';}
  for(const [q,r,rx,ry]of plan.lakes||[])if(((h.q-q)/rx)**2+((h.r-r)/ry)**2<=1)h.type='water';
 });
 // Mark only a narrow connected beach, following the authored shoreline.
 if(plan.sea){const sand=[],s=plan.sea;for(const h of b.hexes.values()){const v=s.axis==='y'?h.q:h.r,c=s.axis==='y'?h.r:h.q;if(h.type!=='water'&&Math.abs(c-interpolate(s.points,v))<2.3&&[[1,0],[-1,0],[0,1],[0,-1]].some(([q,r])=>b.at(h.q+q,h.r+r)?.type==='water'))sand.push(h);}for(const h of sand)if(h.type==='grass')h.type='sand';}
 for(const [q,r]of plan.bridges||[]){
  let best=null;for(const v of waterways){const near=distance(q,r,v.samples);if(!best||near.d<best.d)best={...near,v};}
  if(!best)continue;const i=best.index,a=best.v.samples[Math.max(0,i-2)],z=best.v.samples[Math.min(best.v.samples.length-1,i+2)],angle=Math.atan2(z[1]-a[1],z[0]-a[0])+Math.PI/2;
  b.bridge(q,r,angle,0);const br=b.bridges.at(-1);br.w=SP*(best.v.width*2+2.4);br.h=SP*1.3;
  b.each(h=>{const dx=h.q-q,dy=h.r-r,u=dx*Math.cos(angle)+dy*Math.sin(angle),v=-dx*Math.sin(angle)+dy*Math.cos(angle);if(Math.abs(u)<=br.w/SP/2&&Math.abs(v)<=.66){h.type='bridge';h.owner=own(plan,h.q,h.r);}});
 }
 b.each(h=>{if(h.type==='water')h.owner=0;});return waterways;
}
function buildBattlefield({MapBuilder,stage,seed}){
 const plan=PLANS[stage.id];if(!plan)throw Error('Missing authored battlefield '+stage.id);
 const b=new MapBuilder(plan.size,seed);applyPlan(b,plan);
 const towns=plan.towns.map(([q,r,owner],i)=>{
  const center=b.at(q,r);if(!center||['water','mountain'].includes(center.type))throw Error(stage.id+': town on invalid terrain '+q+','+r);
  // Connected city blocks have streets and park holes, never identical round stamps.
  const c={id:'city_'+(++b.citySeq),name:stage.towns[i],q,r,x:q*SP,y:r*SP,owner,hasFactory:false,hasHarbor:false,hasFarm:false,hp:1000,maxHp:1000,urbanStyle:i%4,incomeBonus:0,manpowerBonus:0};b.cities.push(c);
  const offsets=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1],[2,0],[-2,0],[0,2],[0,-2]];
  for(const [dq,dr]of offsets){const h=b.at(q+dq,r+dr);if(h&&h.type!=='water'&&h.type!=='bridge'){h.type='urban';h.cityId=c.id;h.owner=owner;h.urbanVariant=(Math.abs(h.q)+Math.abs(h.r))%5;}}
  // Initial friendly source positions all have a safe dry corridor into their town.
  b.each(h=>{if(h.type!=='water'&&h.type!=='bridge'&&Math.hypot(h.q-q,h.r-r)<5)h.owner=owner;});return c;
 });
 // Give every drawn urban block to its nearest named district on the same bank.
 for(const h of b.hexes.values())if(h.type!=='water'&&(h._builtUpArea||h.type==='urban')&&!h.cityId){const c=towns.slice().sort((a,c)=>(a.q-h.q)**2+(a.r-h.r)**2-((c.q-h.q)**2+(c.r-h.r)**2))[0];if(h.type==='urban'){h.cityId=c.id;h.urbanVariant=(Math.abs(h.q)+Math.abs(h.r*3))%5;}h.owner=c.owner;}
 // Avoid placing battlefield defenders in water, on towns or in a solid fort wall.
 for(const [q,r]of plan.forts||[]){const h=b.at(q,r);if(h&&!['water','bridge','mountain'].includes(h.type))b.fort(q,r,2);}
 const routes=(plan.roads||[]).map(v=>({from:towns[v.from],to:towns[v.to],points:[[towns[v.from].q,towns[v.from].r],...v.via,[towns[v.to].q,towns[v.to].r]].map(([q,r])=>({x:q*SP,y:r*SP}))}));
 const labels=[...(plan.labels||[])];for(const v of plan.rivers||[]){const p=v.points[Math.floor(v.points.length/2)];labels.push([v.name,p[0],p[1],'water']);}
 const names=new Set(),metadata={version:1,northUp:true,note:plan.note,features:labels.filter(([name])=>{if(names.has(name))return false;names.add(name);return true;}).map(([name,q,r,kind])=>({name,x:q*SP,y:r*SP,kind})),routes:routes.map(v=>v.points)};
 return{b,towns,plan,routes,metadata};
}
module.exports={PLANS,buildBattlefield,catmull,distance,applyPlan};
