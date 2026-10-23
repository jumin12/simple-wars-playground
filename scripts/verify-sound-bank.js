const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),ffmpeg=require('ffmpeg-static');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'sounds/sfx/manifest.json'),'utf8'));
assert.equal(manifest.model,'eleven_text_to_sound_v3');assert.equal(manifest.assets.length,20);
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
console.table(rows);console.log('20 v3 effects: decoded, consistent loudness, no clipping, expected durations.');
