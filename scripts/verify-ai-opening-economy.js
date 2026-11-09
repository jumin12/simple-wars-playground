'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-opening-economy');
fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
    let file=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
    if(!file.startsWith(ROOT+path.sep))return res.writeHead(403).end();
    if(process.env.BASELINE&&['index.html','ai-command.js'].includes(path.relative(ROOT,file)))file=path.join(OUT,'baseline',path.basename(file));
    fs.readFile(file,(error,body)=>{if(error)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();
    const errors=[],results={};page.on('pageerror',e=>errors.push(e.stack));
    await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
    try{
        await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
        await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks,null,{timeout:180000});
        await page.evaluate(()=>{
            setGameSpeed(0,true);cancelAnimationFrame(animationFrameId);wodDismissChangelogPopup();wodCloudCanSync=()=>false;
            window.h=(q,r=0)=>gameData.hexes[q+','+r];
            window.town=(q,r,owner,id)=>{const p=h(q,r);p.type='urban';p.cityId=id;p.owner=owner;const c={id,name:id,q,r,x:p.x,y:p.y,owner,hp:1000,maxHp:1000,hasFactory:false,hasFarm:false,hasHarbor:false};gameData.cities.push(c);return c;};
            window.unit=(q,r=0,type='light',owner=2)=>{const p=h(q,r),u=createUnitAt(type,p.x,p.y,owner,{startSpawn:true});u.x=u._drawX=p.x;u.y=u._drawY=p.y;u.isGeneral=false;return u;};
            window.refresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._citySupplyCache=null;gameData._generalAuraCache=null;gameData._aiCombatContexts={};gameData._aiLocalSituation=new WeakMap();};
            window.world=(profile='balanced',fog=false,n=2,cash=10000)=>{
                wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(28);gameState='PLAYING';gameData.menuAttractMode=false;
                gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=fog;
                gameData.entities=[];gameData.cities=[];gameData.forts=[];gameData.hospitals=[];gameData.bridges=[];gameData.constructionJobs=[];gameData.selection=[];gameData.alliances=[];
                gameData.aiTaskForces={};gameData.aiBattlePlans={};gameData.aiNavalPlans={};gameData.aiCommanderProfiles={2:profile};gameData._aiEconomyPlans={};gameData._aiEconomyClock=0;
                gameData._aiDefenseByOwner={};gameData._aiFrontOffensives={};gameData._aiMoveQueue=new Map();gameData._factionIntel={};
                gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;gameData.aiMoneyByOwner={2:cash};gameData.aiManpowerByOwner={2:5000};gameData.money=gameData.manpower=100000;
                for(const p of gameData.hexList){p.type='grass';p.owner=p.q<0?2:1;p.cityId=null;}
                gameData._landIncomeCacheDirty=true;window.productionTrace=[];
                window.homes=Array.from({length:n},(_,i)=>town(-18+i*10,0,2,'Home'+i));town(20,0,1,'Enemy');
                for(const c of homes)unit(c.q,c.r);
                for(let i=homes.length;i<7;i++)unit(-18+(i%3)*2,3+Math.floor(i/3)*2);
                const general=unit(-18,-3,'heavy');general.isGeneral=true;refresh();if(fog)wodFogFactionIntel(2,true);
            };
            window.pulse=()=>{refresh();wodRunAiSpawnBurstForOwner('2',{2:homes},{2:getOwnerIncome(2)},{2:getOwnerExpenses(2)});};
            window.productionTrace=[];window.sim=seconds=>{for(let i=0;i<seconds*20;i++){if(i%47===0){pulse();const key=homes.map(c=>Number(c.hasFactory)+','+Number(c.hasFarm)).join(';');if(window.productionTrace.at(-1)?.key!==key)window.productionTrace.push({t:gameData._aiEconomyClock,key});}wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}};
            window.jobs=()=>gameData.constructionJobs.filter(j=>j.owner===2).map(j=>({type:j.mode,city:homes.find(c=>c.q===j.cq&&c.r===j.cr)?.id,remaining:j.remaining,total:j.total}));
        });
        // Also exercise the ordinary generated match and its autonomous purchase
        // timer, rather than only invoking the planner in controlled fixtures.
        results.generatedOpening=await page.evaluate(()=>{
            for(let i=0;i<200;i++){wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.05);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();}
            const cities=gameData.cities.filter(c=>c.owner===2);
            return{towns:cities.length,factories:gameData.constructionJobs.filter(j=>j.owner===2&&j.mode==='factory').length,opening:gameData._aiEconomyPlans?.[2]?.openingEconomy};
        });
        await page.evaluate(()=>{const cities=gameData.cities.filter(c=>c.owner===2),xs=cities.map(c=>c.x),ys=cities.map(c=>c.y),x=(Math.min(...xs)+Math.max(...xs))/2,y=(Math.min(...ys)+Math.max(...ys))/2;const zoom=Math.min(1.3,(canvas.clientWidth-280)/Math.max(350,Math.max(...xs)-Math.min(...xs)+250),(canvas.clientHeight-300)/Math.max(300,Math.max(...ys)-Math.min(...ys)+250));gameData.camera={zoom,x:x*zoom-canvas.clientWidth/2,y:y*zoom-canvas.clientHeight/2};wodMarkTerrainFullDirty();updateTerrainCache();draw();});
        await page.screenshot({path:path.join(OUT,process.env.BASELINE?'generated-baseline.png':'generated-opening.png')});
        results.openings=[];
        for(const profile of ['balanced','deliberate','defensive','maneuver','amphibious','highland'])for(const fog of [false,true]){
            results.openings.push(await page.evaluate(({profile,fog})=>{
                world(profile,fog);const empty=homes.every(c=>!c.hasFactory&&!c.hasFarm);pulse();const first=jobs(),money=gameData.aiMoneyByOwner[2];pulse();pulse();
                return{profile,fog,empty,first,money,after:jobs(),reservation:gameData._aiEconomyPlans[2]?.economyReservation};
            },{profile,fog}));
        }
        results.otherOwners=[];
        for(const owner of [3,4])results.otherOwners.push(await page.evaluate(owner=>{
            world();for(const p of gameData.hexList)if(p.owner===2)p.owner=owner;for(const c of homes)c.owner=owner;for(const u of gameData.entities)if(u.owner===2)u.owner=owner;
            gameData.aiMoneyByOwner={[owner]:10000};gameData.aiManpowerByOwner={[owner]:5000};gameData.aiCommanderProfiles[owner]='balanced';gameData._landIncomeCacheDirty=true;refresh();
            wodRunAiSpawnBurstForOwner(String(owner),{[owner]:homes},{[owner]:getOwnerIncome(owner)},{[owner]:getOwnerExpenses(owner)});
            return{owner,jobs:gameData.constructionJobs.filter(j=>j.owner===owner).map(j=>j.mode),money:gameData.aiMoneyByOwner[owner]};
        },owner));
        results.existingInfrastructure=await page.evaluate(()=>{
            world();for(const c of homes)c.hasFactory=true;pulse();return{jobs:jobs(),money:gameData.aiMoneyByOwner[2]};
        });
        results.savings=await page.evaluate(()=>{
            world('balanced',false,2,4500);pulse();const first=jobs(),saved=gameData._aiEconomyPlans[2];
            const protectedCash=!wodAiCanSpendOutsideReserve(2,'light',saved);
            gameData.aiMoneyByOwner[2]+=5500;pulse();return{first,protectedCash,after:jobs(),money:gameData.aiMoneyByOwner[2]};
        });
        results.defense=await page.evaluate(()=>{
            world();unit(homes[0].q+1,0,'light',1);refresh();pulse();return{jobs:jobs(),reservation:gameData._aiEconomyPlans[2]?.economyReservation};
        });
        results.understrength=await page.evaluate(()=>{
            world();for(const u of gameData.entities.filter(u=>u.owner===2).slice(2))u.hp=0;refresh();pulse();return{jobs:jobs(),reservation:gameData._aiEconomyPlans[2]?.economyReservation};
        });
        if(!process.env.BASELINE){
            results.progress=[];
            for(const n of [1,2])results.progress.push(await page.evaluate(n=>{
                world('balanced',false,n);pulse();wodUpdateConstruction(59.9);const early=homes.every(c=>!c.hasFactory);wodUpdateConstruction(.11);pulse();
                const factories=homes.every(c=>c.hasFactory),second=jobs();sim(160);
                return{n,early,factories,second,farms:homes.every(c=>c.hasFarm),jobs:jobs(),state:gameData._aiEconomyPlans[2]?.openingEconomy};
            },n));
            results.combinedArms=[];
            for(const profile of ['balanced','highland'])for(const fog of [false,true])results.combinedArms.push(await page.evaluate(({profile,fog})=>{
                world(profile,fog);const start=gameData.aiMoneyByOwner[2];sim(480);const army=gameData.entities.filter(u=>u.owner===2&&u.hp>0),events=gameData._aiDecisionLog?.owners[2]?.events||[];
                return{profile,fog,factories:homes.filter(c=>c.hasFactory).length,farms:homes.filter(c=>c.hasFarm).length,motorized:army.filter(u=>u.type==='motorized').length,armor:army.filter(u=>u.type==='heavy'&&!u.isGeneral).length,money:gameData.aiMoneyByOwner[2],income:getOwnerIncome(2),upkeep:getOwnerExpenses(2),investmentCount:gameData._aiDecisionLog?.owners[2]?.counts.investment||0,timeline:window.productionTrace,mpIncome:getOwnerManpowerIncome(2),count:army.length,start};
            },{profile,fog}));
            results.capturedTown=await page.evaluate(()=>{
                world();for(const c of homes)c.hasFactory=c.hasFarm=true;pulse();const c=town(-8,10,2,'Captured');unit(c.q,c.r);homes.push(c);pulse();return{newTown:jobs().filter(j=>j.city===c.id),targets:gameData._aiEconomyPlans[2].openingEconomy.towns};
            });
            await page.evaluate(()=>{
                world();pulse();UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';
                gameData.camera={zoom:1.3,x:-1100,y:-420};wodMarkTerrainFullDirty();updateTerrainCache();draw();
            });
            await page.screenshot({path:path.join(OUT,'opening-factories.png')});
        }
        fs.writeFileSync(path.join(OUT,process.env.BASELINE?'baseline-results.json':'results.json'),JSON.stringify({results,errors},null,2));
        console.log(JSON.stringify(results,null,2));
        if(!process.env.OBSERVE_ONLY){
            assert(results.generatedOpening.towns===2&&results.generatedOpening.factories===2,'both towns start factories in an ordinary generated match through the autonomous economy timer');
            assert(results.openings.every(r=>r.empty&&r.first.length===2&&r.first.every(j=>j.type==='factory'&&j.total===60)&&r.money===2000&&r.after.length===2),'both guarded starting towns immediately fund paid factories, across every commander/fog mode');
            assert(results.otherOwners.every(r=>r.jobs.length===2&&r.jobs.every(j=>j==='factory')&&r.money===2000),'all non-player faction slots share the opening rule');
            assert(results.existingInfrastructure.jobs.length===2&&results.existingInfrastructure.jobs.every(j=>j.type==='farm')&&results.existingInfrastructure.money===5200,'existing factories skip directly to farms without duplicate spending');
            assert(!results.savings.first.length&&results.savings.protectedCash&&results.savings.after.filter(j=>j.type==='factory').length===2,'save a shared opening budget without letting routine infantry consume it');
            assert(results.defense.jobs.some(j=>j.type==='light')&&results.defense.jobs.every(j=>!['factory','farm'].includes(j.type))&&!results.defense.reservation,'urgent town defense overrides opening investment');
            assert(results.understrength.jobs.some(j=>j.type==='light')&&!results.understrength.reservation,'a critically thin army recruits rather than saving for buildings');
            assert(results.progress.every(r=>r.early&&r.factories&&r.farms),'normal construction timers complete factories and farms at every starting town, including one-town matches');
            assert(results.combinedArms.every(r=>r.factories===2&&r.farms===2&&r.motorized>=1&&r.armor>=1),'actual funded economy supports both motorized infantry and additional armor');
            assert(!results.capturedTown.targets.includes('Captured')&&results.capturedTown.newTown.every(j=>!['factory','farm'].includes(j.type)),'capturing new territory does not restart opening spending');
            assert.deepEqual(errors,[]);
        }
    }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
