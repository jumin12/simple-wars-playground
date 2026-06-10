/**
 * Scan missions/*.json and regenerate missions/manifest.json.
 * Run after dropping new mission exports into the missions folder.
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'missions');
const manifestPath = path.join(dir, 'manifest.json');

function triggerLabel(type) {
  if (type === 'timer') return 'timer';
  if (type === 'time_survived') return 'survival';
  if (type === 'troops_killed') return 'kill goal';
  return type || 'event';
}

function buildDescription(mission) {
  if (!mission || !Array.isArray(mission.events) || !mission.events.length) return '';
  const types = [];
  for (const evt of mission.events) {
    const t = evt && evt.trigger && evt.trigger.type;
    if (t && !types.includes(t)) types.push(t);
  }
  const n = mission.events.length;
  const bits = types.map(triggerLabel);
  return n + ' event' + (n === 1 ? '' : 's') + (bits.length ? ': ' + bits.join(', ') : '');
}

function main() {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f.toLowerCase() !== 'manifest.json')
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  const missions = [];

  for (const file of files) {
    const full = path.join(dir, file);
    try {
      const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (!raw || !Array.isArray(raw.hexList) || !raw.hexList.length) {
        console.warn('skip (no map):', file);
        continue;
      }
      if (!raw.mission || !Array.isArray(raw.mission.events) || !raw.mission.events.length) {
        console.warn('skip (no mission events):', file);
        continue;
      }
      const id = file.replace(/\.json$/i, '');
      missions.push({
        id,
        name: String(raw.mission.title || raw.title || id.replace(/[-_]+/g, ' ')).trim() || id,
        description: buildDescription(raw.mission),
        file,
      });
    } catch (e) {
      console.warn('skip (invalid JSON):', file, e.message);
    }
  }

  missions.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  fs.writeFileSync(manifestPath, JSON.stringify({ missions }, null, 2) + '\n', 'utf8');
  console.log('Wrote ' + missions.length + ' mission(s) to missions/manifest.json');
}

main();
