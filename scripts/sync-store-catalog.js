'use strict';
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), check = process.argv.includes('--check');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'custom-maps/manifest.json'), 'utf8'));
const entries = new Map();
for (const entry of [...(manifest.maps || []), ...(manifest.missions || [])]) entries.set(entry.id, { id: entry.id, price: entry.price || 150 });
const files = {
  'server/store-catalog.js': fs.readFileSync(path.join(root, 'store-catalog.js'), 'utf8'),
  'server/mission-catalog.json': JSON.stringify({ missions: [...entries.values()] }, null, 2) + '\n',
};
for (const [relative, content] of Object.entries(files)) {
  const destination = path.join(root, relative);
  if (check) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) throw Error('Store catalog is stale: ' + relative);
  } else fs.writeFileSync(destination, content);
}
console.log((check ? 'Verified' : 'Synced') + ' standalone server catalogs: ' + entries.size + ' mission products');
