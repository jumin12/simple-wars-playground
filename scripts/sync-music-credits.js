// The playback manifest is the single catalog for runtime and offline music credits.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../sounds/music');
const tracks=JSON.parse(fs.readFileSync(path.join(root,'playlist.json'),'utf8')).tracks;
const media=fs.readdirSync(root).filter(f=>/\.(ogg|mp3)$/i.test(f)).sort();
assert.deepEqual(tracks.map(t=>t.file).sort(),media,'every shipped music file must appear exactly once in the playlist');
for(const [i,t]of tracks.entries()) {
 assert.equal(t.order,i+1,'sequential playback order');
 for(const key of ['title','credit','license','sourceUrl','licenseUrl','changes'])assert(t[key],t.file+' missing '+key);
 for(const key of ['sourceUrl','licenseUrl'])assert(/^https:\/\//.test(t[key]),'secure source/license link');
}
const sources='Simple Wars — music sources and attributions\n'+tracks.length+' shipped recordings, in playback order.\nGenerated from playlist.json with scripts/sync-music-credits.js.\n\n'+tracks.map((t,i)=>[
 `${i+1}. ${t.title}`,`File: ${t.file}`,`Recording credit: ${t.credit}`,`License: ${t.license}`,`License link: ${t.licenseUrl}`,`Original source: ${t.sourceUrl}`,`Changes: ${t.changes}`
].join('\n')).join('\n\n')+'\n\nCourtesy credit: Musopen.org and the Musopen Kickstarter recording project.\n';
const licenses='# Music recording credits\n\n'+tracks.length+' recordings are shipped. This list matches the playback manifest and in-game credits.\n\n'+tracks.map((t,i)=>`${i+1}. **${t.title}** — ${t.credit}. [${t.license}](${t.licenseUrl}). [Original recording](${t.sourceUrl}). ${t.changes}`).join('\n\n')+'\n\nThe composition and the recording have separate rights. The links above describe the selected recording; source pages include any additional credits and notices.\n';
for(const [file,text]of [['SOURCES.txt',sources],['LICENSES.md',licenses]]) {
 if(process.argv.includes('--check'))assert.equal(fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n'),text,file+' is stale; run node scripts/sync-music-credits.js');
 else fs.writeFileSync(path.join(root,file),text);
}
console.log(`Verified ${tracks.length} shipped music recordings, complete source/license credits, and matching offline documents.`);
