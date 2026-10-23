/** Generate and master the local RTS effects. Set ELEVENLABS_API_KEY; no credentials ship. */
const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const out=path.resolve(__dirname,'../sounds/sfx');
const raw=path.resolve(__dirname,'../output/sound-design-v2/raw');
const ffmpeg=require('ffmpeg-static');
const revision='rts-field-recordings-v3-2';
const common=' Outdoor field recording. Effects only: no music, speech, synthetic tones or close-up impacts.';
const eras={
 ancient:{battle:'An ancient battle heard from a hillside 200 meters away. A broad distant crowd struggling in combat, intermittent dull bronze-on-bronze clinks and wooden shield thuds, small surges of indistinct exertion. Continuous subdued battle activity with individual impacts blurred by distance.', 'battle-alt':'Ancient infantry fighting far across an open field. A low diffuse human battle murmur with scattered bronze blade clashes and muted wooden shield impacts. The fighting moves gently across the stereo field, without anything close to the microphone.',construction:'A small ancient building site heard from across the street. Several irregular wooden mallet knocks as timber joints are fitted, stone chisel taps and a brief scrape of stone on stone. Tactile ordinary workmanship, restrained and unhurried.',mobilize:'A small ancient infantry formation starting to march away on packed dirt. A few leather footsteps, restrained wooden shield and bronze equipment rattle, receding naturally.',complete:'A heavy timber beam being carefully seated into a wooden joint: one solid satisfying wooden knock with a little wood settling. Short natural completion cue.'},
 medieval:{battle:'A medieval battle heard from 200 meters across an open field. A distant diffuse mass of fighting soldiers, intermittent short steel sword clashes, dull wooden shield impacts and indistinct exertion. Realistic subdued melee ambience, individual actions muffled by distance.', 'battle-alt':'Distant medieval melee across a valley, a continuous low mass of combat activity with scattered metallic blade clinks and heavy shield thuds. Sporadic indistinct men exerting themselves, no distinct words, everything far from the microphone.',construction:'A medieval carpenter and mason working at a small building site across the street. Uneven hand hammer taps into timber, a short coarse hand saw stroke, restrained stone chisel taps. Dry believable worksite foley with brief pauses.',mobilize:'A small medieval infantry formation beginning to walk away. Several boots on earth, gentle chainmail rustle and muted equipment clinks, naturally receding.',complete:'A timber brace is fitted into place and secured by two firm wooden mallet taps. Short dry natural construction completion foley.'},
 napoleonic:{battle:'A Napoleonic battlefield recorded from 250 meters behind the fighting. Irregular groups of dry flintlock musket reports roll across the field, with an occasional deeper muffled black-powder cannon boom and a natural long outdoor echo. Clear separation between musket cracks and distant cannon tails, continuous scattered firing.', 'battle-alt':'Distant 1815 infantry combat heard across open farmland. Uneven flintlock musket volleys crackle in small waves, occasional low black-powder artillery reports bloom and decay in the open air. Spacious natural perspective, the weapons all far away.',construction:'An early nineteenth century field workshop heard across a small yard. Unhurried uneven hand hammer knocks on timber, a short hand saw stroke, a wooden cart creaking under load. Restrained dry practical construction foley.',mobilize:'A small Napoleonic infantry squad steps off on a dirt road. Several bootsteps, subtle leather cartridge-box and wooden musket equipment rattle. Brief natural military movement foley without instruments or signals.',complete:'A wooden workshop door settles shut with a restrained solid latch and one small metallic tool being set down. A short grounded completion sound.'},
 modern:{battle:'Real modern infantry firefight recorded outdoors from 300 meters away. Irregular short automatic rifle bursts and scattered individual rifle cracks, occasional soft low artillery thumps with long natural outdoor decay. Recognizable dry gunfire transients muffled by distance, open-air perspective, continuous scattered combat.', 'battle-alt':'A modern battlefield heard from a distant observation hill. Several separated positions exchange short machine-gun bursts and sporadic rifle shots, an occasional far-off low explosion rumbles and fades. Spacious realistic distant weapons recording, no nearby impacts.',construction:'A small modern field construction site heard from across a yard. A brief restrained cordless drill driver, several measured hammer taps on timber, one muted steel fitting clank and a little material handling. Ordinary believable worksite foley, brief gaps between actions.',mobilize:'A small modern infantry squad starts walking away on gravel. Several bootsteps, soft fabric webbing and equipment movement. Brief realistic military movement foley, naturally receding, no radio beeps.',complete:'A steel workshop latch closes with a compact muted clunk, followed by a light tool being set down. Short restrained practical completion foley.'}
};
async function main(){
 const dryRun=process.argv.includes('--dry-run'),masterOnly=process.argv.includes('--master-only');
 if(!dryRun&&!masterOnly&&!process.env.ELEVENLABS_API_KEY)throw Error('Set ELEVENLABS_API_KEY before regeneration.');
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(raw,{recursive:true});
 const manifest={provider:'ElevenLabs',model:'eleven_text_to_sound_v3',revision,generated:new Date().toISOString().slice(0,10),mastering:{battleLufs:-23,foleyLufs:-24,truePeakDb:-3,crossfadeSeconds:2},assets:[]};
 for(const [era,kinds] of Object.entries(eras))for(const [kind,text] of Object.entries(kinds)){
  const file=era+'-'+kind+'.mp3',duration=kind.startsWith('battle')?24:kind==='construction'?6:kind==='mobilize'?2.5:1.5;
  const prompt=text+common,dest=path.join(out,file),original=path.join(raw,file),stamp=original+'.revision';
  if(prompt.length>450)throw Error(file+' prompt exceeds 450 characters');
  if(dryRun){console.log(file+': '+duration+'s, '+prompt.length+' characters');continue;}
  if(!fs.existsSync(original)||!fs.existsSync(stamp)||fs.readFileSync(stamp,'utf8')!==revision){
   if(masterOnly)throw Error('Missing cached v3 source: '+file);
   const response=await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',{method:'POST',signal:AbortSignal.timeout(120000),headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json',Accept:'audio/mpeg'},body:JSON.stringify({text:prompt,duration_seconds:duration,loop:false,prompt_influence:.75,model_id:manifest.model})});
   if(!response.ok){const e=await response.json().catch(()=>({}));throw Error('ElevenLabs HTTP '+response.status+': '+JSON.stringify(e.detail||{}).replaceAll(process.env.ELEVENLABS_API_KEY,'[redacted]').slice(0,500));}
   const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length<1000)throw Error('Incomplete sound response');
   fs.writeFileSync(original,bytes);fs.writeFileSync(stamp,revision);console.log('Generated '+file);
  }
  const battle=kind.startsWith('battle'),target=battle?-23:-24;
  const pre=`highpass=f=${battle?85:110},lowpass=f=${battle?6500:7200},acompressor=threshold=0.125:ratio=2.5:attack=5:release=180,afade=t=in:d=0.015,afade=t=out:st=${duration-.04}:d=0.04`;
  const measurement=spawnSync(ffmpeg,['-hide_banner','-i',original,'-af',pre+`,loudnorm=I=${target}:TP=-3:LRA=8:print_format=json`,'-f','null','NUL'],{encoding:'utf8',windowsHide:true});
  const match=measurement.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);if(measurement.status!==0||!match)throw Error('Could not measure '+file);
  const m=JSON.parse(match[0]);
  const filters=pre+`,volume=${target-Number(m.input_i)}dB,alimiter=limit=0.7079:attack=3:release=100:level=false`;
  const result=spawnSync(ffmpeg,['-y','-hide_banner','-loglevel','error','-i',original,'-af',filters,'-ar','44100','-ac','2','-codec:a','libmp3lame','-b:a','160k',dest],{encoding:'utf8',windowsHide:true});
  if(result.status!==0)throw Error('Mastering failed: '+result.stderr);
  manifest.assets.push({file,era,kind,prompt,duration,loop:false,integratedLufs:target});
 }
 if(dryRun)return;
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');console.log('Mastered '+manifest.assets.length+' effects.');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
