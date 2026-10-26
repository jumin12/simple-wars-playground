'use strict';
const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict'),{PLANS}=require('./historical-battlefields');
const catalog=require('../custom-maps/manifest.json'),stages=catalog.missions.flatMap(p=>p.stages||[p]),terrainHashes=new Set(),riverHashes=new Set(),townLayouts=new Set();
for(const stage of stages){
 const d=JSON.parse(fs.readFileSync('custom-maps/'+stage.file)),meta=d.mission.battlefield;
 assert(meta?.northUp&&meta.note&&meta.features.length>=2,stage.id+' needs an individual geographic plan');
 const hash=rows=>crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
 const terrain=hash(d.hexList.map(h=>[h.q,h.r,h.type]));assert(!terrainHashes.has(terrain),'duplicate battlefield '+stage.id);terrainHashes.add(terrain);
 for(const c of d.cities){const h=d.hexList.find(h=>h.q===c.q&&h.r===c.r);assert(h.type==='urban'&&h.cityId===c.id&&h.owner===c.owner,'town center overwritten '+stage.id);}
 if(PLANS[stage.id]){
  const water=hash(d.hexList.filter(h=>h.type==='water').map(h=>[h.q,h.r]));assert(!riverHashes.has(water),'reused water layout '+stage.id);riverHashes.add(water);
  const towns=hash(d.cities.map(c=>[c.q,c.r]));assert(!townLayouts.has(towns),'reused town layout '+stage.id);townLayouts.add(towns);
  assert(d.hexList.filter(h=>h.type==='urban').every(h=>d.cities.some(c=>c.id===h.cityId)),'orphan urban blocks '+stage.id);
  assert(d.roads.every(r=>r.points?.length>=2&&r.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))),'road plan lost '+stage.id);
 }
}
assert.equal(terrainHashes.size,24);assert.equal(riverHashes.size,17);assert.equal(townLayouts.size,17);
console.log('24 distinct complete battlefields; all 17 campaign maps have unique waterways, town layouts, explicit road routes and named landmarks.');
