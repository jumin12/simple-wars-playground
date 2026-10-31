'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{Pool}=require('pg');

function newPlayerId(){const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',bytes=crypto.randomBytes(8),text=[...bytes].map(b=>alphabet[b%32]).join('');return 'WOD-'+text.slice(0,4)+'-'+text.slice(4);}
class ProfileStore {
  constructor(env=process.env,pool){
    this.pool=pool||(env.DATABASE_URL?new Pool({connectionString:env.DATABASE_URL,max:2,connectionTimeoutMillis:10000,statement_timeout:30000}):null);
    this.file=path.join(env.WOD_DATA_DIR||__dirname,'player-profiles.json');this.links=new Map();this.sessions=new Map();this.ready=false;
    this.pool?.on('error',()=>console.warn('[profiles] database connection interrupted'));
  }
  async initialize(){
    if(this.pool){
      await this.pool.query('CREATE TABLE IF NOT EXISTS game_player_profiles (player_id TEXT PRIMARY KEY,data JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
      await this.pool.query('CREATE TABLE IF NOT EXISTS game_profile_identities (identity_key TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES game_player_profiles(player_id))');
      await this.pool.query('ALTER TABLE game_profile_identities DROP CONSTRAINT IF EXISTS game_profile_identities_player_id_key');
      await this.pool.query('CREATE TABLE IF NOT EXISTS game_profile_sessions (token_hash TEXT PRIMARY KEY,player_id TEXT NOT NULL REFERENCES game_player_profiles(player_id),identity_key TEXT NOT NULL,expires_at BIGINT NOT NULL)');
    }
    this.ready=true;
  }
  readDisk(){try{const data=JSON.parse(fs.readFileSync(this.file,'utf8'));if(data.identities)this.links=new Map(Object.entries(data.identities));if(data.sessions)this.sessions=new Map(Object.entries(data.sessions).filter(([,s])=>s.expires>Date.now()));return data.profiles||data;}catch(e){if(e.code!=='ENOENT')console.warn('[profiles] local save could not be read');return {};}}
  async load(){
    const legacy=this.readDisk();
    if(!this.pool)return legacy;
    const rows=await this.pool.query('SELECT player_id,data FROM game_player_profiles');
    const bindings=await this.pool.query('SELECT identity_key,player_id FROM game_profile_identities');this.links=new Map(bindings.rows.map(r=>[r.identity_key,r.player_id]));
    // Database rows always win over an old local copy after redeployment.
    return {...legacy,...Object.fromEntries(rows.rows.map(r=>[r.player_id,r.data]))};
  }
  async save(profiles){
    if(!this.ready)throw Error('Profiles are not ready');
    if(!this.pool){
      fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.tmp';
      fs.writeFileSync(temp,JSON.stringify({profiles,identities:Object.fromEntries(this.links),sessions:Object.fromEntries(this.sessions)}),'utf8');fs.renameSync(temp,this.file);return;
    }
    const connection=await this.pool.connect();
    try{await connection.query('BEGIN');for(const [id,data]of Object.entries(profiles))await connection.query('INSERT INTO game_player_profiles(player_id,data) VALUES($1,$2) ON CONFLICT(player_id) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()',[id,JSON.stringify(data)]);await connection.query('COMMIT');}
    catch(e){await connection.query('ROLLBACK').catch(()=>{});throw e;}finally{connection.release();}
  }
  async bind(identityKey,candidateId,makeProfile,allowLink=false){
    if(this.links.has(identityKey))return this.links.get(identityKey);
    if(!this.pool){let id=candidateId||newPlayerId();const used=[...this.links].filter(([,pid])=>pid===id);if(used.length&&(!allowLink||used.some(([key])=>key.startsWith('steam:'))))id=newPlayerId();this.links.set(identityKey,id);return id;}
    const connection=await this.pool.connect();
    try{
      await connection.query('BEGIN');
      await connection.query('SELECT pg_advisory_xact_lock(hashtext($1))',[identityKey]);
      const known=await connection.query('SELECT player_id FROM game_profile_identities WHERE identity_key=$1',[identityKey]);
      if(known.rows.length){await connection.query('COMMIT');this.links.set(identityKey,known.rows[0].player_id);return known.rows[0].player_id;}
      let id=candidateId||newPlayerId();
      await connection.query('SELECT pg_advisory_xact_lock(hashtext($1))',['profile:'+id]);
      for(let n=0;n<10;n++){
        const used=await connection.query('SELECT identity_key FROM game_profile_identities WHERE player_id=$1',[id]);
        if(!used.rows.length||(allowLink&&!used.rows.some(r=>r.identity_key.startsWith('steam:'))))break;id=newPlayerId();
      }
      await connection.query('INSERT INTO game_player_profiles(player_id,data) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,JSON.stringify(makeProfile(id))]);
      await connection.query('INSERT INTO game_profile_identities(identity_key,player_id) VALUES($1,$2)',[identityKey,id]);
      await connection.query('COMMIT');this.links.set(identityKey,id);return id;
    }catch(e){await connection.query('ROLLBACK').catch(()=>{});throw e;}finally{connection.release();}
  }
  async saveSession(hash,value){
    if(this.pool){await this.pool.query('DELETE FROM game_profile_sessions WHERE expires_at<$1',[Date.now()]);await this.pool.query('INSERT INTO game_profile_sessions(token_hash,player_id,identity_key,expires_at) VALUES($1,$2,$3,$4)',[hash,value.playerId,value.identityKey,value.expires]);}
    else this.sessions.set(hash,value);
  }
  async get(id){if(!this.pool)return null;const result=await this.pool.query('SELECT data FROM game_player_profiles WHERE player_id=$1',[id]);return result.rows[0]?.data||null;}
  async session(hash){
    if(!this.pool){const s=this.sessions.get(hash);return s?.expires>Date.now()?s:null;}
    const result=await this.pool.query('SELECT player_id,identity_key,expires_at FROM game_profile_sessions WHERE token_hash=$1 AND expires_at>$2',[hash,Date.now()]);
    const s=result.rows[0];return s?{playerId:s.player_id,identityKey:s.identity_key,expires:Number(s.expires_at)}:null;
  }
  async close(){if(this.pool)await this.pool.end();}
}
module.exports={ProfileStore,newPlayerId};
