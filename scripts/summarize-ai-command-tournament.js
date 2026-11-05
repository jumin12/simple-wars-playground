'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const ROOT=path.resolve(__dirname,'..'),BASE=path.join(ROOT,'output/ai-command-overhaul'),CAP=2400;
const read=(dir,id)=>JSON.parse(fs.readFileSync(path.join(BASE,dir,id+'.json'),'utf8'));
const starting=['hexRadius','hexList','cities','entities','money','manpower','aiMoneyByOwner','aiManpowerByOwner'];
const ids=['open-rush','woods-defense','hills-flank','river-rush','coast-probe'].flatMap(m=>['clear','fog'].map(f=>m+'-'+f));
const outcome=r=>r.winner&&r.t<=CAP?(r.winner===2?'Win':'Loss'):'Draw';
const rows=ids.map(id=>{
 const dir=id.endsWith('-fog')?'v4-fog':'v4-clear',before=read('baseline-final',id),after=read(dir,id),a=read('baseline-final',id+'-start'),b=read(dir,id+'-start');
 for(const key of starting)assert.deepEqual(a[key],b[key],id+': starting '+key);
 assert.deepEqual(before.errors,[],id+': baseline errors');assert.deepEqual(after.errors,[],id+': revised errors');
 const metrics=r=>({outcome:outcome(r),winner:r.winner,seconds:r.t,completed:r.completed,
  townCaptures:r.captures.filter(c=>c.owner===2&&c.t<=CAP).length,
  stationaryFieldPercent:100*r.metrics.idleSeconds/Math.max(1,r.metrics.offensiveSeconds),
  damage:r.ledger['2']?.damageDealt||0,lost:r.ledger['2']?.unitsLost||0,attritionPersonnel:r.ledger['2']?.attritionPersonnelLost||0,
  jointAssaults:r.events.filter(e=>e.event==='joint-assault').length,
  endLand:r.samples.at(-1)?.land,errors:r.errors.length});
 return{id,before:metrics(before),after:metrics(after)};
});
const totals=key=>({wins:rows.filter(r=>r[key].outcome==='Win').length,losses:rows.filter(r=>r[key].outcome==='Loss').length,draws:rows.filter(r=>r[key].outcome==='Draw').length,completed:rows.filter(r=>r[key].completed).length});
const sum={at:new Date().toISOString(),capSeconds:CAP,startingStatesEqual:true,baseline:totals('before'),revised:totals('after'),rows,
 matrixSources:Object.fromEntries(['ai-command.js','index.html'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE,'matrix-source',f))).digest('hex')])),
 releaseSources:Object.fromEntries(['ai-command.js','index.html'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,f))).digest('hex')]))};
fs.writeFileSync(path.join(BASE,'comparison.json'),JSON.stringify(sum,null,2));
const lines=[
 '# AI command comparison','',
 'Ten paired browser simulations: five terrain/opponent combinations, with and without fog. Normal resources, prices, construction, combat, morale, healing and supply rules; scripted opponents use observed information. All ten starting maps, cities, units and resource balances were compared and matched exactly.','',
 'Baseline: fca0d2a, with the same two missing-map-cell guards applied to its ambush layout so a pre-existing exception cannot decide a game. Revised: persistent squads, coordinated assaults, arrival-aware command, strategic follow-through and squad procurement.','',
 `At the matched **40-minute limit**, the baseline had **${sum.baseline.wins} wins, ${sum.baseline.losses} losses and ${sum.baseline.draws} draws**; the revision had **${sum.revised.wins} wins, ${sum.revised.losses} losses and ${sum.revised.draws} draws**. These are AI results against the scripted opponents. A timeout is a draw. Revised games were allowed up to another ten minutes to observe completion; wins after 40 minutes remain draws in this comparison.`,
 '', '| Scenario | Baseline at 40 min | Revised at 40 min | Revised finish (seconds) |', '|---|---|---|---|',
 ...rows.map(r=>`| ${r.id} | ${r.before.outcome} | ${r.after.outcome} | ${r.after.completed?r.after.seconds+' ('+(r.after.winner===2?'AI win':'AI loss')+')':'Time limit'} |`),
 '', `**${sum.baseline.completed+sum.revised.completed} games reached a domination winner.** The remaining runs reached their time limit. No renderer exceptions occurred in the reported runs.`,
 '', 'The raw comparison includes town captures, damage, units lost, attrition personnel, land, coordinated assaults and stationary time among healthy field troops. That stationary measure excludes guards, medical recovery, routing, transport boarding and dedicated defensive jobs; it includes assembly and fixing-force waits, so it is not a count of every unproductive second. Games have different lengths; end-of-game totals should be read alongside their duration.',
 '', 'These ten scenarios are a regression benchmark, not a human win-rate estimate. Pathfinding and AI work use bounded wall-clock budgets, so a fixed seed does not guarantee an identical replay. The forest opponent can sustain long defensive battles; gains on other maps do not establish that every stalemate is solved.',
 '', 'Focused checks separately verify exact squad return after healing and defense loans, distinct rosters in a shared assault, shared launch decisions, exclusion of distant reinforcements and guards from combat strength, staging against distant threats, retreat from imminent superior threats, real purchased recruits joining the intended squad after retargeting, and a strategic deadline that is not extended by trivial cells or skirmish kills.',
 '', 'After the matrix, final review added a narrow roster correction: a permanent town/fort garrison transfer frees its old squad slot, while temporary defense loans still retain membership. The focused test and two additional complete coastal games cover that final correction. Matrix and release source hashes are recorded separately in comparison.json.',
 '', 'Two older standalone tests have pre-existing failures confirmed against the baseline: the flank test expects a single 24-unit operation, and the medical-command test expects an immediate hospital queue that is absent on both versions. Current small-force, multi-front, encirclement, hospital-policy, recovery-rotation and naval-lifecycle checks cover the relevant behavior.'
];
fs.writeFileSync(path.join(BASE,'comparison.md'),lines.join('\n')+'\n');console.log(JSON.stringify(sum,null,2));
