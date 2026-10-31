// Capture real game frames for the shop; no independently illustrated preview terrain.
'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),{chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'skins/map-packs');fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(ROOT,'.'+(req.url.split('?')[0]==='/'?'/index.html':decodeURIComponent(req.url.split('?')[0])));if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.webp':'image/webp'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.stack));await context.routeWebSocket(/.*/,socket=>{socket.onMessage(()=>{});socket.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
 const metadata=await page.evaluate(()=>{
  setGameSpeed(0,true);wodDismissChangelogPopup();cancelAnimationFrame(animationFrameId);gameData.fogOfWar=false;gameData.layers.terrain=true;gameData.layers.diplomacy=true;gameData.layers.territory=false;gameData.layers.cities=true;gameData.layers.cityNames=true;gameData.layers.units=true;gameData.layers.structures=true;
  const front=findFrontlineCentroid(1)||{x:0,y:0},town=gameData.cities.filter(c=>c.owner===1).sort((a,b)=>Math.hypot(a.x-front.x,a.y-front.y)-Math.hypot(b.x-front.x,b.y-front.y))[0];
  let focus={x:front.x*.65+(town?.x||0)*.35,y:front.y*.65+(town?.y||0)*.35},best=-Infinity,visibleTerrain={};
  // Choose a representative view of a real map, without altering its terrain or armies.
  const candidates=gameData.hexList.filter(h=>h.q%8===0&&h.r%8===0&&!isWaterHex(h));candidates.push(focus,...gameData.cities);
  for(const point of candidates){const counts={},owners={};for(const h of gameData.hexList){if(Math.abs(h.x-point.x)>730||Math.abs(h.y-point.y)>410)continue;counts[h.type]=(counts[h.type]||0)+1;if(!isWaterHex(h))owners[h.owner]=(owners[h.owner]||0)+1;}
   const troops=gameData.entities.filter(u=>Math.abs(u.x-point.x)<730&&Math.abs(u.y-point.y)<410).length,cities=gameData.cities.filter(c=>Math.abs(c.x-point.x)<730&&Math.abs(c.y-point.y)<410).length;
   const score=Math.min(counts.mountain||0,160)*.13+Math.min(counts.hill||0,120)*.035+Math.min(counts.forest||0,120)*.025+Math.min((counts.water||0)+(counts.sand||0),100)*.035+Object.keys(counts).length*1.5+Math.min(troops,8)*1.3+cities*3+(owners[1]>15&&owners[2]>15?6:0);
   if(score>best){best=score;focus={x:point.x,y:point.y};visibleTerrain=counts;}}
  gameData.camera={zoom:1.05,x:focus.x*1.05-canvas.clientWidth/2,y:focus.y*1.05-canvas.clientHeight/2};
  const troop=gameData.entities.filter(u=>u.owner===1&&u.type==='light').sort((a,b)=>Math.hypot(a.x-front.x,a.y-front.y)-Math.hypot(b.x-front.x,b.y-front.y))[0];
  if(troop){const goal=gameData.hexList.filter(h=>h.owner===2&&!isWaterHex(h)&&h.type!=='mountain').sort((a,b)=>Math.hypot(a.x-troop.x,a.y-troop.y)-Math.hypot(b.x-troop.x,b.y-troop.y))[0];if(goal){gameData.selection=[troop];troop.selected=true;issueMoveOrder({x:goal.x,y:goal.y});}}
  const geometry=gameData.hexList.map(h=>[h.q,h.r,h.type,h.owner]);return{kind:'Actual generated skirmish, captured through draw() on the game canvas',cells:geometry.length,cities:gameData.cities.length,units:gameData.entities.length,terrain:[...new Set(gameData.hexList.map(h=>h.type))],visibleTerrain,camera:{...gameData.camera},geometry};
 });
 const geometryHash=require('crypto').createHash('sha256').update(JSON.stringify(metadata.geometry)).digest('hex');delete metadata.geometry;metadata.geometryHash=geometryHash;metadata.images=[];
 for(const pack of ['default','atlas_hd','chalkboard','whiteboard'])for(const era of ['ancient','medieval','napoleonic','modern']){
  const data=await page.evaluate(({pack,era})=>{
   gameData.ownedShopVisuals={map_atlas_hd:true,map_chalkboard:true,map_whiteboard:true};gameData.ownedUnitSkins={nato:true,ancient:true,medieval:true,napoleonic:true};gameData.uiSettings.mapSkin=pack;gameData.unitSkin=era==='modern'?'nato':era;gameData.aiUnitSkin=gameData.unitSkin;gameData.gamePeriod=era;gameData._matchPeriod=era;
   wodMarkTerrainFullDirty();updateTerrainCache();draw();
   const shot=document.createElement('canvas');shot.width=1280;shot.height=720;const g=shot.getContext('2d');const sourceRatio=canvas.width/canvas.height,targetRatio=1280/720;let sx=0,sy=0,sw=canvas.width,sh=canvas.height;if(sourceRatio<targetRatio){sh=sw/targetRatio;sy=(canvas.height-sh)/2;}else{sw=sh*targetRatio;sx=(canvas.width-sw)/2;}g.drawImage(canvas,sx,sy,sw,sh,0,0,1280,720);return shot.toDataURL('image/webp',.94);
  },{pack,era});
  const file=pack+'-'+era+'.webp',body=Buffer.from(data.split(',')[1],'base64');fs.writeFileSync(path.join(OUT,file),body);metadata.images.push({file,bytes:body.length});console.log(file,body.length);
 }
 if(errors.length)throw Error(errors.join('\n'));fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(metadata,null,2)+'\n');console.log(JSON.stringify({...metadata,images:metadata.images.length}));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
