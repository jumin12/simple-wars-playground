'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/changelog-recovery');
fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=path.resolve(ROOT,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
    fs.readFile(file,(error,body)=>{
        if(error)return res.writeHead(404).end();
        res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream');
        res.end(body);
    });
});
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}});
    const page=await context.newPage(),errors=[],results={};
    page.on('pageerror',e=>errors.push(e.stack));
    await context.route('**/*',route=>/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(route.request().url())?route.fallback():route.abort());
    await context.routeWebSocket(/.*/,socket=>{socket.onMessage(()=>{});socket.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
    try{
        await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
        await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
        results.versions=await page.evaluate(()=>{
            const chronological=[...WOD_CHANGELOG].reverse();
            return {versions:chronological.map(e=>e.version),dates:chronological.map(e=>e.at),menu:document.querySelectorAll('#wodChangelogList .wod-changelog-version').length,popup:document.querySelectorAll('#wodChangelogPopupBody .wod-changelog-version').length};
        });
        const versions=results.versions;
        assert(versions.versions.length>100,'complete historical changelog retained');
        versions.versions.forEach((version,i)=>assert.equal(version,(Math.floor((10+i)/10))+'.'+((10+i)%10)));
        versions.dates.forEach((date,i)=>assert(Number.isFinite(Date.parse(date))&&(!i||Date.parse(date)>=Date.parse(versions.dates[i-1]))));
        assert.equal(versions.menu,versions.versions.length);assert.equal(versions.popup,versions.versions.length);
        await page.evaluate(()=>{
            setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();wodCloudCanSync=()=>false;
            updateAiStrategy=()=>{};wodAiMedicalLogistics=()=>{};
            window.h=(q,r=0)=>wodHexAt(q,r);
            window.world=(owner=1)=>{
                wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(18);gameState='PLAYING';gameData.menuAttractMode=false;
                gameData.mp={enabled:false};gameData._campaignRun=null;gameData._spectator=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;
                gameData.entities=[];gameData.nextUnitId=1;gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.roads=[];gameData.constructionJobs=[];gameData.selection=[];gameData.alliances=[];
                gameData._aiEconomyClock=0;gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;
                gameData.money=gameData.manpower=100000;gameData.aiMoneyByOwner={[owner]:100000};gameData.aiManpowerByOwner={[owner]:100000};gameData._wodClaimBatch=new Map();
                for(const hex of gameData.hexList){hex.type='grass';hex.owner=owner;hex.cityId=null;}
                const at=h(-4);at.type='urban';at.cityId='recovery-town';gameData.cities.push({id:at.cityId,name:'Recovery Town',q:at.q,r:at.r,x:at.x,y:at.y,owner,hp:1000,maxHp:1000});
            };
            window.unit=(q=0,type='light',owner=1)=>{
                const at=h(q),u=createUnitAt(type,at.x,at.y,owner,{startSpawn:true});u.x=at.x;u.y=at.y;u.isGeneral=false;
                u.hp=u.maxHp;u.manpower=u.maxManpower;u.morale=u.maxMorale=100;u._moraleLastHitAt=-Infinity;return u;
            };
            window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();wodRebuildHexCombatOccupancy();gameData._citySupplyCache=null;};
            window.sim=seconds=>{for(let i=0;i<Math.round(seconds*20);i++){refresh();wodBeginSimPfBudget(gameData.entities.length);update(.05);}};
            window.state=u=>({retreating:!!u.retreating,ordered:!!u._wodOrderedRetreat,risk:!!u._wodRiskRetreat,medical:!!u._medicalRecovering,routed:!!u.moraleBroken,hp:u.hp,morale:u.morale});
        });
        results.recovered=[];
        for(const owner of [1,2])results.recovered.push(await page.evaluate(owner=>{
            world(owner);if(owner===2)gameData.mp={enabled:true,isHost:true,localSlot:2,humanSlots:[1,2],allReady:true};
            const u=unit(-4,'light',owner);u.hp=u.maxHp-.1;u.manpower=u.maxManpower-1;
            u.retreating=u._wodOrderedRetreat=u._wodRiskRetreat=u._wodRecoveryRetreat=true;u._medicalRecovering=owner!==1;u._medicalGoal='6,0';
            u.target={x:h(6).x,y:h(6).y};u.orderTarget={...u.target};sim(.1);gameData.selection=[u];syncInfoCardPanel();
            return{owner,...state(u),target:!!u.target,label:document.getElementById('infoAction').textContent};
        },owner));
        for(const row of results.recovered){assert(!row.retreating&&!row.ordered&&!row.risk&&!row.medical&&!row.target);assert.equal(row.hp,100);assert(!/retreat/i.test(row.label));}
        results.ai=await page.evaluate(()=>{world(2);const u=unit(-4,'light',2);u.retreating=u._wodOrderedRetreat=u._wodRiskRetreat=true;u._medicalGoal='6,0';u._medicalRecovering=false;u.target={x:h(6).x,y:0};u.orderTarget={...u.target};refresh();wodAiManageRecovery(2);return state(u);});
        assert(!results.ai.retreating&&!results.ai.ordered&&!results.ai.risk&&!results.ai.medical);
        results.freshOrder=await page.evaluate(()=>{world();const u=unit(-4),goal=h(6),start=u.x;u.retreating=u._wodOrderedRetreat=u._wodRiskRetreat=true;u._medicalRecovering=true;u._medicalGoal='-4,0';assignUnitMoveAlongWaypoints(u,[goal]);sim(2);return{moved:u.x-start>10,goalPreserved:!!u.orderTarget&&u.orderTarget.x===goal.x,...state(u)};});
        assert(results.freshOrder.moved&&results.freshOrder.goalPreserved&&!results.freshOrder.retreating&&!results.freshOrder.medical);
        results.naval=await page.evaluate(()=>{world(2);h(-3).type='water';h(-3).owner=0;const u=unit(-3,'supply',2);u.retreating=true;u._medicalGoal='-3,0';u._medicalRecovering=true;sim(.1);return state(u);});
        assert(!results.naval.retreating&&!results.naval.medical);
        results.active=await page.evaluate(()=>{world();const u=unit(),goal=h(6),start=u.x;assignUnitMoveAlongWaypoints(u,[goal],{forceRetreat:true,riskRetreat:true});sim(2);const moving=u.x-start>10&&u.retreating&&u._wodOrderedRetreat;sim(36);return{moving,arrived:Math.hypot(u.x-goal.x,u.y-goal.y)<4,...state(u)};});
        assert(results.active.moving&&results.active.arrived&&!results.active.retreating&&!results.active.ordered&&!results.active.risk);
        results.blocked=await page.evaluate(()=>{
            world();for(const hex of gameData.hexList)if(hex.r!==0)hex.type='mountain';gameData._wodPfVer=(gameData._wodPfVer||0)+1;
            const u=unit(),blocker=unit(2),goal=h(6);blocker.holding=true;assignUnitMoveAlongWaypoints(u,[goal],{forceRetreat:true,riskRetreat:true});
            sim(14);const waiting={...state(u),goalPreserved:!!u.orderTarget&&Math.hypot(u.orderTarget.x-goal.x,u.orderTarget.y-goal.y)<1};
            blocker.hp=0;sim(30);return{waiting,arrived:Math.hypot(u.x-goal.x,u.y-goal.y)<4};
        });
        assert(!results.blocked.waiting.retreating&&!results.blocked.waiting.ordered&&!results.blocked.waiting.risk&&results.blocked.waiting.goalPreserved&&results.blocked.arrived);
        results.rout=await page.evaluate(()=>{
            world();const u=unit(-4),enemy=unit(-2,'light',2);enemy.damage=.001;u.moraleBroken=true;u.retreating=u._wodOrderedRetreat=u._wodRiskRetreat=true;
            u._moraleLastHitAt=0;assignUnitMoveAlongWaypoints(u,[h(-9)],{forceRetreat:true,retainMoraleBroken:true,riskRetreat:true});sim(.1);
            const pursued=u.moraleBroken&&u.retreating;enemy.hp=0;u._moraleLastHitAt=-Infinity;u.hp=u.maxHp;u.manpower=u.maxManpower;sim(4);return{pursued,...state(u)};
        });
        assert(results.rout.pursued&&!results.rout.routed&&!results.rout.retreating&&!results.rout.ordered&&!results.rout.risk);
        await page.evaluate(()=>returnToMenu());
        await page.waitForFunction(()=>gameState==='MENU'&&!UI.mainMenu.classList.contains('hidden')&&!window._wodMenuBootstrapBusy,null,{timeout:120000});
        await page.evaluate(()=>wodShowChangelogPopup());
        await page.locator('#wodChangelogPopupBody .wod-changelog-version').first().waitFor({state:'visible'});
        await page.screenshot({path:path.join(OUT,'versions-desktop.png')});
        await page.setViewportSize({width:390,height:844});
        await page.screenshot({path:path.join(OUT,'versions-mobile.png')});
        assert.deepEqual(errors,[]);console.log(JSON.stringify({results,errors},null,2));
    }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify({results,errors},null,2));await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
