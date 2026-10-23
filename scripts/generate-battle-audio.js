/** Regenerate shipped effects with ELEVENLABS_API_KEY; credentials never enter the game bundle. */
const fs=require('fs');
const path=require('path');
const out=path.resolve(__dirname,'../sounds/sfx');
const eras={
  ancient:{battle:'Distant ancient battlefield ambience: bronze swords and shields clashing, faint disciplined battle cries, spears, marching feet and occasional arrows. No gunfire, no engines, no music, no narration.',mobilize:'Ancient infantry formation arriving: brief leather sandal marching steps, shield and spear equipment rattle, a quiet short horn signal. No voice or music.',construction:'Ancient stone construction: soft stone mason hammer taps, wooden beams being set, rope creaks, a few gravel movements. No power tools, music or voice.'},
  medieval:{battle:'Distant medieval battlefield ambience: steel swords and shields clashing, faint battle cries, arrows whistling, occasional horse hooves and wooden siege machinery. No firearms, engines, music or narration.',mobilize:'Medieval soldiers assembling: short armored marching footsteps with chainmail and shield rattles and a quiet distant horn. No speech or music.',construction:'Medieval construction workshop: quiet stone chiseling, wooden hammer taps, saw and rope creaks. No powered machinery, music or voice.'},
  napoleonic:{battle:'Distant Napoleonic battlefield ambience: staggered flintlock musket volleys, black powder cannon booms with long soft tails, faint soldiers shouting and horse hooves. No automatic weapons, aircraft, engines, music or narration.',mobilize:'Napoleonic infantry arriving: brief boots marching in formation, musket equipment and leather rattle, a quiet short bugle signal. No music bed or speech.',construction:'Napoleonic era construction workshop: hammer taps, hand saw strokes, wooden cart creaks, stonework. No modern powered machinery, music or voice.'},
  modern:{battle:'Distant modern combined arms battlefield ambience: faint intermittent rifle and machine gun fire, occasional muffled artillery booms and low armored vehicle rumbles. Far away, subdued, no close explosions, no music or narration.',mobilize:'Modern military unit ready: short marching boots, equipment rattle, a soft armored engine starting and a brief quiet radio chirp. No intelligible speech or music.',construction:'Modern military construction: subdued mechanical tools and hammer taps, a brief metallic clank, low construction vehicle engine hum. No music or voice.'}
};
async function main(){
 if(!process.env.ELEVENLABS_API_KEY)throw Error('Set ELEVENLABS_API_KEY before regeneration.');
 fs.mkdirSync(out,{recursive:true});
 const manifest={provider:'ElevenLabs',model:'eleven_text_to_sound_v2',generated:'2026-10-23',assets:[]};
 for(const [era,kinds] of Object.entries(eras)) for(const [kind,text] of Object.entries(kinds)){
  const file=era+'-'+kind+'.mp3',duration=kind==='battle'?8:kind==='mobilize'?2:3;
  manifest.assets.push({file,era,kind,prompt:text,duration,loop:kind==='battle'});
  const dest=path.join(out,file);if(fs.existsSync(dest)&&fs.statSync(dest).size>1000){console.log('Exists '+file);continue;}
  const response=await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json',Accept:'audio/mpeg'},body:JSON.stringify({text,duration_seconds:duration,loop:kind==='battle',prompt_influence:.5,model_id:manifest.model})});
  if(!response.ok){const error=await response.json().catch(()=>({}));let detail=JSON.stringify(error.detail||error).replaceAll(process.env.ELEVENLABS_API_KEY,'[redacted]');throw Error('ElevenLabs HTTP '+response.status+' for '+file+': '+detail.slice(0,600));}
  const data=Buffer.from(await response.arrayBuffer());if(data.length<1000)throw Error('Incomplete audio response');
  fs.writeFileSync(dest,data);console.log('Generated '+file+' ('+data.length+' bytes)');
 }
 fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
