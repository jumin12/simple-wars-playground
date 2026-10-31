'use strict';
const crypto=require('crypto');
const STEAM='https://steamcommunity.com/openid/login';
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
function createProfileHttp(profiles,env=process.env,request=fetch){
  const pending=new Map(),rates=new Map();
  function allowedOrigin(raw){
    try{const url=new URL(raw);return url.origin===raw&&(raw==='https://simple-wars-live.onrender.com'||raw===env.PROFILE_WEB_ORIGIN||(!env.RENDER&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(raw)));}catch(_){return false;}
  }
  function base(req){
    if(env.PROFILE_PUBLIC_URL)return new URL(env.PROFILE_PUBLIC_URL).origin;
    if(env.RENDER)return 'https://simple-wars.onrender.com';
    if(!/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(req.headers.host||''))throw Error('Invalid callback host');
    return 'http://'+req.headers.host;
  }
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  async function body(req){let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>256*1024)throw Error('Profile request too large');}return JSON.parse(text);}
  async function handle(req,res){
    const origin=req.headers.origin;
    if(allowedOrigin(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');}
    if(req.method==='OPTIONS'){res.writeHead(allowedOrigin(origin)?204:403);res.end();return;}
    const now=Date.now();for(const [key,value]of pending)if(value.expires<now)pending.delete(key);for(const [key,value]of rates)if(value.until<now)rates.delete(key);
    try{
      const url=new URL(req.url,base(req)),action=url.pathname.split('/').pop();
      if(action==='callback'&&req.method==='GET'){
        const state=url.searchParams.get('state'),entry=pending.get(state);
        if(!entry||entry.verified)throw Error('This sign-in request has expired. Start again in the game.');
        const fields=Object.fromEntries(url.searchParams),claimed=fields['openid.claimed_id']||'',match=claimed.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/);
        const signed=new Set(String(fields['openid.signed']||'').split(','));
        if(fields['openid.mode']!=='id_res'||fields['openid.op_endpoint']!==STEAM||fields['openid.identity']!==claimed||fields['openid.return_to']!==entry.returnTo||!match||!['op_endpoint','claimed_id','identity','return_to','response_nonce','assoc_handle'].every(k=>signed.has(k)))throw Error('Steam could not verify this sign-in.');
        const nonce=fields['openid.response_nonce']||'',stamp=Date.parse(nonce.slice(0,20));
        if(!Number.isFinite(stamp)||Math.abs(now-stamp)>10*60000||[...pending.values()].some(p=>p.nonce===nonce))throw Error('This Steam sign-in response has expired.');
        const verification=new URLSearchParams(Object.entries(fields).filter(([key])=>key.startsWith('openid.')));verification.set('openid.mode','check_authentication');
        const checked=await request(STEAM,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:verification.toString(),signal:AbortSignal.timeout(15000)});
        if(!checked.ok||!/^is_valid:true\s*$/m.test(await checked.text()))throw Error('Steam could not verify this sign-in.');
        entry.verified=match[1];entry.nonce=nonce;
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});
        res.end('<!doctype html><title>Steam sign-in complete</title><style>body{background:#0c1d28;color:#f3ead7;font:18px system-ui;text-align:center;padding:15vh 24px}h1{color:#eac66b}</style><h1>Steam sign-in complete</h1><p>Return to Simple Wars. You can close this window.</p>');return;
      }
      if(req.method!=='POST'||!allowedOrigin(origin))return json(res,403,{ok:false,error:'Open Steam sign-in from the game.'});
      if(!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,415,{ok:false,error:'Use a JSON profile request.'});
      const data=await body(req);
      if(!/^[a-f0-9]{64}$/.test(data.deviceSecret||''))throw Error('Your device profile could not be verified. Reload the game.');
      if(action==='start'){
        const address=env.RENDER==='true'?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',')[0]:req.socket.remoteAddress,key=digest(String(address));
        const rate=rates.get(key)||{count:0,until:now+60000};rates.set(key,rate);if(++rate.count>10||pending.size>10000)return json(res,429,{ok:false,error:'Please wait a minute before signing in again.'});
        const identity=await profiles.bindBrowser(data.deviceSecret,data.playerId),state=crypto.randomBytes(32).toString('hex'),returnTo=base(req)+'/api/profile/callback?state='+state;
        pending.set(state,{expires:now+10*60000,secretHash:digest(data.deviceSecret),playerId:identity.playerId,returnTo,progress:data.progress});
        const login=new URL(STEAM);for(const [key,value]of Object.entries({'openid.ns':'http://specs.openid.net/auth/2.0','openid.mode':'checkid_setup','openid.return_to':returnTo,'openid.realm':base(req)+'/','openid.identity':'http://specs.openid.net/auth/2.0/identifier_select','openid.claimed_id':'http://specs.openid.net/auth/2.0/identifier_select'}))login.searchParams.set(key,value);
        json(res,200,{ok:true,state,url:login.href});return;
      }
      if(action==='complete'){
        const entry=pending.get(data.state);
        if(!entry||entry.secretHash!==digest(data.deviceSecret))return json(res,401,{ok:false,error:'Steam sign-in expired. Please try again.'});
        if(!entry.verified)return json(res,200,{ok:true,pending:true});
        // Consume before awaiting: a callback can create only one session.
        pending.delete(data.state);
        const progress={...entry.progress,profile:{...entry.progress?.profile,playerId:entry.playerId}};
        json(res,200,{ok:true,...await profiles.webSteamIdentity(entry.verified,progress,data.deviceSecret)});return;
      }
      json(res,404,{ok:false,error:'Unknown profile action.'});
    }catch(error){json(res,400,{ok:false,error:error.message||'Steam sign-in could not be completed.'});}
  }
  return{handle};
}
module.exports={createProfileHttp};
