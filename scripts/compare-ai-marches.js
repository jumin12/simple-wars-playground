'use strict';
// Compare the same saved-map replays. Small collision/path turns and deliberate
// medical withdrawals are distinct from large, conflicting destination orders.
const fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..'),before=path.resolve(process.argv[2]||path.join(ROOT,'output/ai-frontline/diagonal-corridors-release')),after=path.resolve(process.argv[3]||path.join(ROOT,'output/ai-frontline/march-commitment-v1'));
function measure(file){
 const d=JSON.parse(fs.readFileSync(file)),tracks=new Map(),stats={seconds:d.samples.at(-1).t,eligibleUnitSeconds:0,routineTaskChanges:0,destinationReversals:0,movementReversals:0,landChange:d.samples.at(-1).ai.land-d.samples[0].ai.land,towns:d.samples.at(-1).ai.towns.length,units:d.samples.at(-1).ai.units,unsuppliedUnitSeconds:d.metrics.unsuppliedSeconds,errors:d.errors};
 const eligible=u=>u&&u.owner===2&&!['ship','transport','supply','convoy'].includes(u.type)&&!u.medical&&!u.retreating&&!u.combat&&!u.inWater&&!u.scout&&!u.evacuating&&u.role!=='scout'&&u.hp>=(u.type==='heavy'?210:70);
 for(const t of d.traces)for(const u of t.units.filter(u=>u.owner===2)){if(!tracks.has(u.id))tracks.set(u.id,[]);tracks.get(u.id).push({...u,t:t.t});if(eligible(u))stats.eligibleUnitSeconds+=5;}
 for(const a of tracks.values())for(let i=1;i<a.length;i++){
  const p=a[i-1],q=a[i];if(!eligible(p)||!eligible(q))continue;
  if(p.role==='territory'&&q.role==='territory'&&p.job!==q.job)stats.routineTaskChanges++;
  if(p.goal&&q.goal){const x=p.goal.x-q.x,y=p.goal.y-q.y,xx=q.goal.x-q.x,yy=q.goal.y-q.y,da=Math.hypot(x,y),db=Math.hypot(xx,yy);if(da>40&&db>40&&Math.hypot(p.goal.x-q.goal.x,p.goal.y-q.goal.y)>80&&(x*xx+y*yy)/(da*db)<-.4)stats.destinationReversals++;}
  if(i>1&&eligible(a[i-2])){const r=a[i-2],x=p.x-r.x,y=p.y-r.y,xx=q.x-p.x,yy=q.y-p.y,da=Math.hypot(x,y),db=Math.hypot(xx,yy);if(da>8&&db>8&&(x*xx+y*yy)/(da*db)<-.45)stats.movementReversals++;}
 }
 for(const key of ['routineTaskChanges','destinationReversals','movementReversals'])stats[key+'Per1000UnitSeconds']=Math.round(stats[key]/Math.max(1,stats.eligibleUnitSeconds)*100000)/100;
 return stats;
}
const names=fs.readdirSync(after).filter(f=>/^(open-flank|island-flank)-(fog|clear)\.json$/.test(f)&&fs.existsSync(path.join(before,f)));
const rows=names.map(name=>({name,before:measure(path.join(before,name)),after:measure(path.join(after,name))}));
const totals=key=>{const result={};for(const metric of ['eligibleUnitSeconds','routineTaskChanges','destinationReversals','movementReversals','landChange','seconds'])result[metric]=rows.reduce((n,r)=>n+r[key][metric],0);return result;};
const result={before,after,rows,beforeTotals:totals('before'),afterTotals:totals('after')};
fs.writeFileSync(path.join(after,'march-comparison.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
