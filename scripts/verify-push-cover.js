'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('assert/strict');
const {chromium}=require('playwright');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/push-cover');
fs.mkdirSync(OUT,{recursive:true});
const server=http.createServer((req,res)=>{
    const f=path.resolve(ROOT,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));
    if(!f.startsWith(ROOT+path.sep))return res.writeHead(403).end();
    fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg'})[path.extname(f)]||'application/octet-stream');res.end(b);});
});
(async()=>{
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage(),errors=[],results={};
    await context.routeWebSocket(/.*/,s=>{s.onMessage(()=>{});s.send(JSON.stringify({t:'welcome',online:0,lobbies:[]}));});
    page.on('pageerror',e=>errors.push(e.stack));page.setDefaultTimeout(180000);
    try{
        await page.goto('http://127.0.0.1:'+server.address().port+'/?autostart=1');
        await page.waitForFunction(()=>gameState==='PLAYING'&&gameData._matchReadyForEndChecks);
        await page.evaluate(()=>{
            setGameSpeed(0,true);wodDismissChangelogPopup();cancelAnimationFrame(animationFrameId);
            window.coverWorld=(width=16)=>{
                wodPrepareForNewMatch({keepLiveMap:true});WOD.makeBlankMap(65);gameState='PLAYING';gameData.menuAttractMode=false;
                gameData.mp={enabled:false};gameData._campaignRun=null;gameData._matchReadyForEndChecks=false;gameData.fogOfWar=false;
                gameData.entities=[];gameData.cities=[];gameData.hospitals=[];gameData.forts=[];gameData.bridges=[];gameData.alliances=[];
                gameData._aiEconomyClock=0;gameData.aiCommanderProfiles={2:'balanced'};gameData.aiMoneyByOwner={2:10000};gameData.aiManpowerByOwner={2:10000};gameData.money=10000;gameData.manpower=10000;
                for(const h of gameData.hexList){h.type='grass';h.owner=h.q<-20||h.q<=5&&Math.abs(h.r)<=width/2||h.q<=30&&h.q>5&&Math.abs(h.r)<=width/2+7?2:1;h.cityId=null;}
                gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._aiLocalSituation=new WeakMap();gameData._healingCombatRange=null;
                gameData._cityCombatStagingKeys=new Set();gameData.cityCombatBlockForProd=new Set();
                gameData.aiTimer=gameData.aiStrategyTimer=gameData.convoyTimer=gameData._transportAiTimer=-1e6;
            };
            window.coverHex=(q,r=0)=>gameData.hexes[q+','+r];
            window.coverTown=(q,r,owner,id)=>{const h=coverHex(q,r);h.type='urban';h.owner=owner;h.cityId=id;const c={id,name:id,q,r,x:h.x,y:h.y,owner,hp:1000,maxHp:1000};gameData.cities.push(c);return c;};
            window.coverUnit=(q,r=0,type='light',owner=2)=>{const h=coverHex(q,r),u=createUnitAt(type,h.x,h.y,owner,{startSpawn:true});u.x=h.x;u.y=h.y;u.isGeneral=false;return u;};
            window.coverRefresh=()=>{gameData.unitSpatialGrid=buildUnitSpatialGrid();gameData._generalAuraCache=null;gameData._citySupplyCache=null;gameData._aiArrivalCache=null;gameData._healingCombatRange=null;wodInvalidateAiFrontlineHexCache();};
            window.coverSetup=(width)=>{
                coverWorld(width);coverTown(-35,0,2,'Home');coverTown(50,0,1,'Enemy');coverUnit(-35);
                const forward=Array.from({length:6},(_,i)=>coverUnit(18,i*2-5,i===0?'heavy':'light'));
                for(const side of [-1,1]){for(let i=0;i<8;i++)coverUnit(-13-i%3,side*(width/2-i%4),i%4===0?'heavy':'light');for(let i=0;i<3;i++)coverUnit(-8+i*2,side*(width/2+2+i),'light',1);}
                coverRefresh();return forward;
            };
        });
        results.hospital=[];
        for(const owner of [1,2])for(const type of ['light','heavy','ship','supply']){
            const row=await page.evaluate(({owner,type})=>{
                coverWorld();for(const h of gameData.hexList)h.owner=owner;
                coverTown(-35,0,owner,'Home');const site=coverHex(-15);placeHospitalAtHex(site,owner,{editor:true});
                if(wodIsNavalType(type)){const water=coverHex(-14);water.type='water';water.owner=0;}
                const patient=coverUnit(-14,0,type,owner),enemyOwner=owner===1?2:1;
                patient.hp=patient.maxHp*.5;patient.manpower=patient.maxManpower*.5;patient.morale=50;
                coverRefresh();const safe=canHealUnit(patient);updateUnitHealing(patient,.1);const before={hp:patient.hp,mp:patient.manpower,morale:patient.morale};
                const foe=coverUnit(-12,0,'heavy',enemyOwner);foe.range=100;patient.retreating=type==='supply';coverRefresh();
                const blocked=!canHealUnit(patient);updateUnitHealing(patient,1);const during={hp:patient.hp,mp:patient.manpower,morale:patient.morale,icon:wodUnitHealingIcon(patient)};
                foe.hp=0;coverRefresh();const resumes=canHealUnit(patient);updateUnitHealing(patient,.2);
                return{owner,type,safe,blocked,before,during,resumes,after:patient.hp};
            },{owner,type});
            assert(row.safe&&row.blocked&&row.resumes);assert.deepEqual(row.before,{hp:row.during.hp,mp:row.during.mp,morale:row.during.morale});assert(!row.during.icon&&row.after>row.before.hp);results.hospital.push(row);
        }
        results.wide=[];
        for(const width of [8,16,32,56]){
            const row=await page.evaluate(width=>{
                const forward=coverSetup(width),army=gameData.entities.filter(u=>u.owner===2),t=performance.now();
                let wideMs=0;const wide=wodAiWideCorridors;
                wodAiWideCorridors=function(...args){const start=performance.now();try{return wide(...args);}finally{wideMs+=performance.now()-start;}};
                const defense=wodAiReadDefense(2,army,true),cut=defense.corridors.find(c=>c.wide&&forward.every(u=>c.riskUnits?.has(u.uid)));
                wodAiWideCorridors=wide;
                const job=cut&&defense.jobs.find(j=>j.id===cut.id);
                const stands=job?.members.map(id=>{const u=army.find(u=>u.uid===id),h=wodAiCorridorStandHex(u,job);wodAiIssueDefenseResponse(u,job);return{unit:id,r:h.r,moving:!!u.target};})||[];
                return{width,ms:performance.now()-t,wideMs,detected:!!cut,cutWidth:cut?.cutIndices.length,risk:cut?.riskUnits.size,response:job?.members.length,stands,closure:cut?.closureSeconds,withdraw:cut?.withdrawSeconds,withdrawOrder:forward.some(u=>!!wodAiCorridorWithdrawal(u))};
            },width);
            console.log('wide',JSON.stringify(row));assert(row.detected&&row.cutWidth>6&&row.response>=2,'wide salient requests a real defense');assert(row.stands.some(p=>p.r<0)&&row.stands.some(p=>p.r>0),'both wings receive cover');results.wide.push(row);
        }
        results.townSupply=await page.evaluate(()=>{const forward=coverSetup(24);coverTown(20,0,2,'Beachhead');coverRefresh();const d=wodAiReadDefense(2,gameData.entities.filter(u=>u.owner===2),true);return{forwardAtRisk:d.corridors.some(c=>forward.some(u=>c.riskUnits?.has(u.uid)))};});
        assert(!results.townSupply.forwardAtRisk,'a controlled town supplies the surrounded advance');
        results.coverage=await page.evaluate(()=>{
            const forward=coverSetup(16),army=gameData.entities.filter(u=>u.owner===2),d=wodAiReadDefense(2,army,true),cut=d.corridors.find(c=>c.wide&&forward.every(u=>c.riskUnits?.has(u.uid)));
            cut.closureSeconds=2;cut.withdrawSeconds=30;d.unitJob={};
            const first=cut.screenPoints[0],last=cut.screenPoints[1];
            for(const u of army)if(!forward.includes(u)&&u.x>coverHex(-20).x){const at=coverHex(first.q-2,first.r+1);u.x=at.x;u.y=at.y;d.unitJob[u.uid]=cut.id;}
            coverRefresh();gameData._aiDefenseByOwner[2]=d;const oneWing=!!wodAiCorridorWithdrawal(forward[0]);
            for(let i=0;i<12;i++){const u=coverUnit(last.q-2,last.r-1+i%3,'heavy');d.unitJob[u.uid]=cut.id;}
            coverRefresh();gameData._aiDefenseByOwner[2]=d;gameData._aiEconomyClock=2;const bothWings=!wodAiCorridorWithdrawal(forward[0]);
            return{oneWing,bothWings,ratio:cut._holdRatio};
        });
        assert(results.coverage.oneWing&&results.coverage.bothWings,'one covered flank must not conceal the uncovered wing');
        results.withdrawal=await page.evaluate(()=>{
            const forward=coverSetup(16);gameData.entities=gameData.entities.filter(u=>forward.includes(u)||u.owner!==2||u.x<coverHex(-30).x);coverRefresh();
            const initial=forward.map(u=>u.x),job={id:'advance',kind:'main',members:forward.map(u=>u.uid)};
            let ordered=false;
            for(let tick=0;tick<2400;tick++){
                if(tick%10===0){wodAiReadDefense(2,gameData.entities.filter(u=>u.owner===2),true);for(const u of forward)ordered=wodAiTacticalFallback(u,job)||ordered;}
                wodBeginSimPfBudget(gameData.entities.length);gameData._wodPfFrameActive=true;try{update(.1);}finally{gameData._wodPfFrameActive=false;}wodDrainAiMoveQueue();
            }
            return{ordered,initial,final:forward.map(u=>u.x),alive:forward.every(u=>u.hp>0),cleared:forward.every(u=>u.x<coverHex(-8).x),attrition:forward.reduce((n,u)=>n+(u.attritionHpLost||0),0)};
        });
        assert(results.withdrawal.ordered&&results.withdrawal.alive&&results.withdrawal.cleared&&results.withdrawal.attrition===0,'the endangered column actually clears the threatened passage without attrition');
        results.solo=await page.evaluate(()=>{const forward=coverSetup(16),u=forward[0];gameData.entities=gameData.entities.filter(e=>e.owner!==2||e===u||e.x<coverHex(-30).x);coverRefresh();const d=wodAiReadDefense(2,gameData.entities.filter(e=>e.owner===2),true);return{protected:d.corridors.some(c=>c.riskUnits?.has(u.uid)),warned:!!wodAiCorridorWithdrawal(u)};});
        assert(results.solo.protected&&results.solo.warned,'a lone vanguard also receives an early supply warning');
        results.fog=await page.evaluate(()=>{coverSetup(24);gameData.entities=gameData.entities.filter(u=>u.owner===2);coverUnit(52,25,'heavy',1);coverRefresh();gameData.fogOfWar=true;wodFogFactionIntel(2,true);const visible=wodAiThreats(2,false),d=wodAiReadDefense(2,gameData.entities.filter(u=>u.owner===2),true);return{known:visible.length,corridors:d.corridors.length};});
        assert.equal(results.fog.known,0);assert.equal(results.fog.corridors,0,'hidden troops do not trigger omniscient defense');
        await page.evaluate(()=>{coverSetup(16);const d=wodAiReadDefense(2,gameData.entities.filter(u=>u.owner===2),true);for(const j of d.jobs)for(const id of j.members){const u=gameData.entities.find(u=>u.uid===id);wodAiIssueDefenseResponse(u,j);}UI.mainMenu.classList.add('hidden');UI.panels.forEach(p=>p.classList.add('hidden'));UI.inGameUI.style.display='block';gameData.layers.territory=true;gameData.camera={zoom:.65,x:-canvas.clientWidth/2-150,y:-canvas.clientHeight/2};wodMarkTerrainFullDirty();updateTerrainCache();draw();});
        await page.screenshot({path:path.join(OUT,'wide-cover.png')});
        assert.deepEqual(errors,[]);console.log('Hospital combat, wide supply defense and fog checks passed');
    }finally{fs.writeFileSync(path.join(OUT,'results.json'),JSON.stringify(results,null,2));fs.writeFileSync(path.join(OUT,'errors.json'),JSON.stringify(errors));await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
