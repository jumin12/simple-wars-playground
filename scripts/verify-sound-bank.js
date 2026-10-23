const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),ffmpeg=require('ffmpeg-static');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'sounds/sfx/manifest.json'),'utf8'));
assert.equal(manifest.model,'eleven_text_to_sound_v3');assert.equal(manifest.assets.length,60);
for(let era of ['ancient','medieval','napoleonic','modern']){
 let assets=manifest.assets.filter(a=>a.era===era);
 assert.equal(assets.length,15,era+' complete isolated bank');
 for(let kind of ['battle','battle-alt','select-light','select-light-alt','select-marine','select-heavy','select-ship','move-light','move-light-alt','move-marine','move-heavy','move-ship'])assert(assets.some(a=>a.kind===kind),era+' '+kind);
 for(let a of assets){assert(a.file.startsWith(era+'-'));if(['ancient','medieval'].includes(era)&&a.kind.startsWith('battle'))assert(a.prompt.includes('No firearms, gunpowder, explosions, engines or electronics.'),'explicit pre-gunpowder restrictions');}
}
let rows=[];
for(let a of manifest.assets){
 const result=spawnSync(ffmpeg,['-hide_banner','-i',path.join(ROOT,'sounds/sfx',a.file),'-af','loudnorm=I=-23:TP=-3:LRA=8:print_format=json','-f','null','NUL'],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,a.file+' decodes');
 const match=result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);assert(match,a.file+' loudness analysis');
 const stats=JSON.parse(match[0]),lufs=Number(stats.input_i),peak=Number(stats.input_tp);
 const time=result.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);assert(time);
 const duration=Number(time[1])*3600+Number(time[2])*60+Number(time[3]);
 assert(Number.isFinite(lufs)&&Math.abs(lufs-a.integratedLufs)<3,a.file+' consistent perceived level: '+lufs);
 assert(peak<=-2,a.file+' peak headroom: '+peak);
 assert(Math.abs(duration-a.duration)<.12,a.file+' expected length');
 rows.push({file:a.file,duration,lufs,truePeakDb:peak});
}
fs.mkdirSync(path.join(ROOT,'output/sound-design-v2'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'output/sound-design-v2/quality-report.json'),JSON.stringify(rows,null,2));
console.table(rows);console.log('60 v3 effects: decoded, consistent loudness, no clipping, expected durations.');
