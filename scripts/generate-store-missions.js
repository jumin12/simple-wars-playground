/**
 * Generates purchasable store missions into custom-maps/*.json.
 * Uses the same MapBuilder as generate-missions.js. The standalone missions are authored in scripts/modern-battles.js
 * and scripts/era-battles.js, the campaign packs in scripts/historical-campaigns.js.
 *
 * Run: node scripts/generate-store-missions.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'custom-maps');
const SRC = path.join(__dirname, 'generate-missions.js');

/** Load MapBuilder + ev from generate-missions.js without running main(). */
function loadToolkit() {
  let src = fs.readFileSync(SRC, 'utf8');
  src = src.replace(/\nmain\(\);\s*$/, '\n');
  src += '\nglobalThis.__WOD_MapBuilder = MapBuilder;\nglobalThis.__WOD_ev = ev;\n';
  const sandbox = {
    require,
    module: { exports: {} },
    exports: {},
    console,
    __dirname,
    __filename: SRC,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    globalThis: {},
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(src, sandbox, { filename: 'generate-missions.js' });
  return {
    MapBuilder: sandbox.__WOD_MapBuilder || sandbox.globalThis.__WOD_MapBuilder,
    ev: sandbox.__WOD_ev || sandbox.globalThis.__WOD_ev,
  };
}

const { MapBuilder, ev } = loadToolkit();
const {polishStoreMission}=require('./store-mission-design');
const {buildHistoricalCampaigns}=require('./historical-campaigns');
const {buildEraBattles}=require('./era-battles');
const {buildModernBattles}=require('./modern-battles');
if (!MapBuilder || !ev) throw new Error('Could not load MapBuilder/ev from generate-missions.js');

function validateMission(m) {
  const data = m.data;
  if (!data.mission || !Array.isArray(data.mission.events) || !data.mission.events.length) {
    throw new Error(m.file + ': missing mission events');
  }
  const byKey = new Map(data.hexList.map(h=>[h.q+','+h.r,h]));
  if(!['modern','ancient','medieval','napoleonic'].includes(data.gamePeriod))throw Error(m.file+': missing era');
  if(data.cities.length<2||data.cities.some(c=>c.hasFactory||c.hasHarbor||c.hasFarm))throw Error(m.file+': invalid starting towns');
  for(const a of data.cities)for(const b of data.cities)if(a!==b&&Math.max(Math.abs(a.q-b.q),Math.abs(a.r-b.r))<8)throw Error(m.file+': overlapping towns');
  const supply=new Map(),dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const c of data.cities){if(!supply.has(c.owner))supply.set(c.owner,new Set());const seen=supply.get(c.owner),queue=[byKey.get(`${c.q},${c.r}`)];for(const h of queue)seen.add(`${h.q},${h.r}`);
    for(let i=0;i<queue.length;i++)for(const [q,r]of dirs){const n=byKey.get(`${queue[i].q+q},${queue[i].r+r}`),k=n&&`${n.q},${n.r}`;if(n&&n.owner===c.owner&&!['water','mountain'].includes(n.type)&&!seen.has(k)){seen.add(k);queue.push(n);}}
  }
  const occupied=new Set();for(const u of data.entities){const key=`${Math.round(u.x/27)},${Math.round(u.y/27)}`,h=byKey.get(key);if(!h||occupied.has(key))throw Error(m.file+': invalid/overlapping unit');occupied.add(key);
    if(['ship','transport','supply'].includes(u.type)&&h.type!=='water'||!['ship','transport','supply','marine'].includes(u.type)&&!supply.get(u.owner)?.has(key))throw Error(m.file+': unsupplied unit '+u.name);
  }
}

function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const campaign=buildHistoricalCampaigns({MapBuilder,ev});
  // The standalone missions are authored whole (scripts/modern-battles.js, scripts/era-battles.js): whole named armies,
  // their own scripted waves and economy, so none of the campaign rewrites below apply to them.
  const modern = buildModernBattles({MapBuilder,ev});
  const eras = buildEraBattles({MapBuilder,ev});
  const singles = [...modern, ...eras];
  // (the campaign stages field their own mixed armies: scripts/historical-campaigns.js)
  const missions=[...singles,...campaign.missions.map(polishStoreMission)];
  const catalog=[...singles.map(m=>m.entry),...campaign.packs];
  const keep = new Set(catalog.map(m=>m.id));
  const manifest = { maps: [], missions: [] };
  // Preserve any legacy skirmish maps key for older clients.
  const existingPath = path.join(OUT_DIR, 'manifest.json');
  if (fs.existsSync(existingPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
      if (Array.isArray(prev.maps))
        manifest.maps = prev.maps.filter((m) => m && m.id && !keep.has(m.id));
    } catch (_) { /* ignore */ }
  }

  for (const m of missions) {
    validateMission(m);
    fs.writeFileSync(path.join(OUT_DIR, m.file), JSON.stringify(m.data));
    console.log(
      'wrote',
      m.file,
      Math.round(fs.statSync(path.join(OUT_DIR, m.file)).size / 1024) + 'KB',
      'cities:',
      m.data.cities.length,
      'units:',
      m.data.entities.length,
      'events:',
      m.data.mission.events.length
    );
  }
  manifest.missions=catalog;
  manifest.maps.push(...catalog.map(entry=>({...entry,kind:'mission'})));
  fs.writeFileSync(existingPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log('manifest written with', manifest.missions.length, 'store mission(s)');
}

main();
