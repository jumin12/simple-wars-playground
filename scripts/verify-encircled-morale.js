'use strict';
// A routed regiment cut off in a pocket does not regain morale or rally while cut off; it runs for the nearest
// supplied ground of its side and, once out, recovers as usual. Checked for a computer faction and a player.
const H=require('./lib/harness');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/encircled-morale');
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
    const {url,close}=await H.startServer();
    const browser=await H.launchBrowser(),results={};
    try{
        const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=H.collectErrors(page);
        await H.gotoAutostart(page,url);
        await page.evaluate(()=>{
            setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();wodCloudCanSync=()=>false;
            updateAiStrategy=()=>{};wodAiMedicalLogistics=()=>{};wodRunAiSpawnBurstForOwner=()=>{};
            window.h=(q,r=0)=>wodHexAt(q,r);
            // Own land in the west with a town (supplied); a three-by-three pocket of own land three cells east of it, with
            // enemy land between: beyond the one cell a unit at the front stays in touch over (WOD_FRONT_SUPPLY_REACH).
            window.world=owner=>{
                wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(36);gameState='PLAYING';gameData.menuAttractMode=false;
                gameData.mp={enabled:false};gameData._campaignRun=null;gameData._spectator=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;
                gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.roads=[];gameData.constructionJobs=[];gameData.selection=[];gameData.alliances=[];
                gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;
                gameData.money=gameData.manpower=100000;gameData.aiMoneyByOwner={[owner]:100000,9:100000};gameData.aiManpowerByOwner={[owner]:100000,9:100000};gameData._wodClaimBatch=new Map();
                const foe=owner===1?2:9;
                for(const hex of gameData.hexList){hex.type='grass';hex.cityId=null;hex.owner=hex.q<=-3?owner:foe;
                    if(hex.q>=1&&hex.q<=3&&Math.abs(hex.r)<=1)hex.owner=owner;}
                const at=h(-7);at.type='urban';at.cityId='home';gameData.cities.push({id:'home',name:'Home',q:at.q,r:at.r,x:at.x,y:at.y,owner,hp:1000,maxHp:1000});
                const fat=h(12,-6);fat.type='urban';fat.cityId='theirs';fat.owner=foe;gameData.cities.push({id:'theirs',name:'Theirs',q:fat.q,r:fat.r,x:fat.x,y:fat.y,owner:foe,hp:1000,maxHp:1000});
                gameData._supplyTopologyVersion=(gameData._supplyTopologyVersion||0)+1;gameData._citySupplyCache=null;
            };
            window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRebuildHexCombatOccupancy();};
            window.sim=seconds=>{for(let i=0;i<Math.round(seconds*20);i++){refresh();wodBeginSimPfBudget(gameData.entities.length);update(.05);}};
            window.run=owner=>{
                world(owner);
                const at=h(2),u=createUnitAt('light',at.x,at.y,owner,{startSpawn:true});u.x=at.x;u.y=at.y;u.isGeneral=false;
                u.hp=u.maxHp;u.manpower=u.maxManpower;u.morale=15;u.maxMorale=100;u._moraleLastHitAt=-Infinity;triggerMoraleRout(u);
                const homeX=h(-3).x,log=[];
                const look=t=>({t,morale:Math.round(u.morale*10)/10,broken:!!u.moraleBroken,cut:(u.encircledFlash||0)>0||(u.outOfSupplySeconds||0)>0,x:Math.round(u.x-homeX),alive:u.hp>0});
                let t=0;const step=s=>{sim(s);t+=s;log.push(look(t));};
                step(3);const atCut=log.at(-1);
                for(let i=0;i<20&&u.hp>0;i++){step(2);if(!log.at(-1).cut)break;}
                const whileCut=log.filter(l=>l.cut),out=log.find(l=>!l.cut&&l.t>3);
                const firstOut=log.at(-1);
                if(out&&u.hp>0)for(let i=0;i<10;i++)step(2);
                return {atCut,whileCut,out,firstOut,end:log.at(-1),log};
            };
        });
        for(const owner of [2,1]){
            const r=await page.evaluate(owner=>run(owner),owner);
            results[owner]=r;
            assert(r.atCut.cut,'the regiment in the pocket is cut off');
            assert(r.atCut.broken,'it starts routed');
            const morale=r.whileCut.map(l=>l.morale);
            assert(morale.every((m,i)=>!i||m<=morale[i-1]+.01),'no morale regained while cut off: '+morale.join(','));
            assert(r.whileCut.every(l=>l.broken),'no rally while cut off');
            assert(r.out,'it gets out of the pocket instead of standing in it');
            assert(r.out.x<r.atCut.x-27*3,'it moved toward its supplied ground');
            assert(r.end.alive,'it survives the walk out');
            assert(r.end.morale>r.out.morale,'once out of the pocket it recovers');
        }
        assert.deepEqual(errors.pageErrors,[],'no page errors');
        console.log(JSON.stringify(Object.fromEntries(Object.entries(results).map(([k,v])=>[k,{atCut:v.atCut,out:v.out,end:v.end,cutSamples:v.whileCut.length}])),null,1));
        console.log('verify-encircled-morale: PASS');
    }catch(e){console.error(JSON.stringify(results,null,1).slice(0,4000));console.error(e);process.exitCode=1;}
    finally{await browser.close();await close();}
})();
