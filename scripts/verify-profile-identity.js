'use strict';
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),http=require('http'),crypto=require('crypto');
const {PGlite}=require('../server/node_modules/@electric-sql/pglite');
const {ProfileStore}=require('../server/profile-store');
const {createProfileHttp}=require('../server/profile-http');
const OUT=path.resolve(__dirname,'../output/profile-identity');fs.mkdirSync(OUT,{recursive:true});
const dataDir=fs.mkdtempSync(path.join(OUT,'local-'));process.env.WOD_DATA_DIR=dataDir;process.env.DATABASE_URL='';
const profiles=require('../server/profiles');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
async function database(){
 const directory=fs.mkdtempSync(path.join(OUT,'pg-'));let db=new PGlite(directory);
 const pool={on(){},query:(q,v)=>db.query(q,v),connect:async()=>({query:(q,v)=>db.query(q,v),release(){}}),end:()=>db.close()};
 let store=new ProfileStore({},pool);await store.initialize();await store.load();
 const a='WOD-AAAA-AAAA',b='WOD-BBBB-BBBB',make=id=>({playerId:id,statsByMode:{singleplayer:{totals:{matchesWon:4}},multiplayer:{totals:{matchesLost:2}}}});
 assert.equal(await store.bind('browser:a',a,make),a);await store.save({[a]:make(a)});
 assert.notEqual(await store.bind('browser:impersonator',a,make),a,'Public IDs are not credentials');
 assert.equal(await store.bind('steam:76561198000000001',a,make,true),a,'Verified device can link a new Steam account');
 assert.notEqual(await store.bind('steam:76561198000000002',a,make,true),a,'Two Steam accounts cannot share a profile');
 assert.equal(await store.bind('browser:b',b,make),b);await store.save({[b]:make(b)});
 const token=crypto.randomBytes(32).toString('hex'),session={playerId:a,identityKey:'steam:76561198000000001',expires:Date.now()+86400000};await store.saveSession(hash(token),session);await store.close();
 db=new PGlite(directory);store=new ProfileStore({},pool);await store.initialize();const restored=await store.load();
 assert.equal(restored[a].statsByMode.singleplayer.totals.matchesWon,4);assert.equal(restored[a].statsByMode.multiplayer.totals.matchesLost,2);assert.equal(await store.bind('steam:76561198000000001',b,make,true),a);assert.deepEqual(await store.session(hash(token)),session);assert.equal(await store.session(hash('invalid')),null);
 assert(!JSON.stringify(await db.query('SELECT * FROM game_profile_sessions')).includes(token),'Only token hashes are persisted');await store.close();
}
async function openId(){
 await profiles.initialize();let requests=0;
 const handler=createProfileHttp(profiles,{},async(url,options)=>{assert.equal(url,'https://steamcommunity.com/openid/login');assert.equal(new URLSearchParams(options.body).get('openid.mode'),'check_authentication');requests++;return{ok:true,text:async()=>'ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'};});
 const server=http.createServer((req,res)=>handler.handle(req,res));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,origin='http://127.0.0.1:17171',secret='a'.repeat(64),other='b'.repeat(64);
 const post=async(action,data,source=origin)=>{const response=await fetch(base+'/api/profile/'+action,{method:'POST',headers:{Origin:source,'Content-Type':'application/json'},body:JSON.stringify(data)});return{status:response.status,...await response.json()};};
 try{
  assert.equal((await post('start',{deviceSecret:secret},'https://evil.example')).status,403);
  const progress={profile:{playerId:'WOD-AAAA-AAAA',mpDisplayName:'Linked tester'},statsByMode:{singleplayer:{totals:{enemyTroopKills:17}}}};
  const start=await post('start',{deviceSecret:secret,playerId:'WOD-AAAA-AAAA',progress});assert(start.ok);const login=new URL(start.url),returnTo=login.searchParams.get('openid.return_to');assert.equal(new URL(returnTo).origin,base);assert.equal((await post('complete',{state:start.state,deviceSecret:other})).status,401);
  const response=new URL(returnTo);for(const [key,value]of Object.entries({'openid.mode':'id_res','openid.op_endpoint':'https://steamcommunity.com/openid/login','openid.identity':'https://steamcommunity.com/openid/id/76561198000000001','openid.claimed_id':'https://steamcommunity.com/openid/id/76561198000000001','openid.return_to':returnTo,'openid.response_nonce':new Date().toISOString().replace(/\.\d{3}Z$/,'Z')+'unique','openid.assoc_handle':'test','openid.signed':'op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle'}))response.searchParams.set(key,value);
  const tampered=new URL(response);tampered.searchParams.set('openid.return_to','https://evil.example/');assert.equal((await fetch(tampered)).status,400);assert.equal(requests,0);
  assert.equal((await fetch(response)).status,200);assert.equal(requests,1);assert.equal((await fetch(response)).status,400);
  const done=await post('complete',{state:start.state,deviceSecret:secret});assert(done.ok);assert.equal(done.playerId,'WOD-AAAA-AAAA');assert.equal(done.profile.statsByMode.singleplayer.totals.enemyTroopKills,17);assert.equal((await post('complete',{state:start.state,deviceSecret:secret})).status,401);
  // Signing into an existing Steam account must not import a different device's stats.
  const existing=await profiles.webSteamIdentity('76561198000000001',{profile:{playerId:'WOD-BBBB-BBBB'},statsByMode:{singleplayer:{totals:{enemyTroopKills:999}}}},other);assert.equal(existing.playerId,done.playerId);assert.equal(existing.profile.statsByMode.singleplayer.totals.enemyTroopKills,17);
  const second=await profiles.webSteamIdentity('76561198000000002',progress,secret);assert.notEqual(second.playerId,done.playerId);assert.equal(second.profile.statsByMode.singleplayer.totals.enemyTroopKills||0,0,'Another Steam account cannot import a previously linked device account');
  assert.equal((await profiles.steamIdentityToken(done.profileToken)).playerId,done.playerId);await profiles.flush();
  const disk=fs.readFileSync(path.join(dataDir,'player-profiles.json'),'utf8');assert(!disk.includes(done.profileToken));assert(disk.includes(hash(done.profileToken)));
 }finally{await new Promise(r=>server.close(r));await profiles.close();}
}
async function desktopOrigin(){
 const vm=require('vm'),root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'desktop/main.js'),'utf8');
 const snippet=source.slice(source.indexOf('function startLocalServer()'),source.indexOf('function createWindow()'));
 const context={http,fs,path,GAME_ROOT:root,MIME:{'.html':'text/html'},localServer:null,localPort:0,app:{getPath:()=>dataDir},resolveGamePath:()=>path.join(root,'index.html')};
 vm.runInNewContext(snippet,context);let busy;
 try{
  const first=await context.startLocalServer();assert.equal((await fetch('http://127.0.0.1:'+first)).status,200);await new Promise(r=>context.localServer.close(r));
  const second=await context.startLocalServer();assert.equal(second,first,'Desktop save origin survives relaunch');await new Promise(r=>context.localServer.close(r));
  busy=http.createServer();await new Promise(r=>busy.listen(first,'127.0.0.1',r));const fallback=await context.startLocalServer();assert.notEqual(fallback,first);assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir,'game-origin-port.json'),'utf8')),fallback);await new Promise(r=>context.localServer.close(r));
 }finally{if(context.localServer?.listening)await new Promise(r=>context.localServer.close(r));if(busy)await new Promise(r=>busy.close(r));}
}
(async()=>{await database();await openId();await desktopOrigin();console.log('PostgreSQL cold restart, device identity, Steam linking, scoped sessions, OpenID verification and stable desktop origin checks passed.');})().catch(e=>{console.error(e);process.exitCode=1;});
