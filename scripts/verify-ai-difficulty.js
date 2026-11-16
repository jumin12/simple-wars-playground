'use strict';
// AI difficulty: chosen in skirmish setup and the campaign, applied to the match and shown in the battle report;
// commanders are drawn at random and never shown; difficulty settings reach the AI; the AI treats every enemy
// alike and pays the same upkeep penalty as a player.
const H=require('./lib/harness');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'output/ai-difficulty');
fs.mkdirSync(OUT,{recursive:true});
(async()=>{
    const {url,close}=await H.startServer();
    const browser=await H.launchBrowser(),results={};
    try{
        for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
            const page=await browser.newPage({viewport}),errors=H.collectErrors(page);
            await H.gotoMenu(page,url);await H.closeChangelog(page);
            await page.evaluate(()=>{localStorage.removeItem('simplewarsAiDifficulty');});
            await page.locator('#mainMenu').getByRole('button',{name:'Play vs AI',exact:true}).click();
            await page.getByRole('button',{name:'Skirmish',exact:true}).click();
            await page.waitForFunction(()=>!wodIsMapPreviewGenerating(),null,{timeout:180000});
            // defaults, then Hard with two opponents; no commander can be chosen or seen
            const defaults=await page.evaluate(()=>({value:document.getElementById('setupAiDifficulty').value,hint:document.getElementById('setupAiDifficultyDetail').textContent,
                pickers:document.querySelectorAll('#setupOpponentsBrief select').length}));
            assert.equal(defaults.value,'normal');assert.match(defaults.hint,/full computer opponent/);assert.equal(defaults.pickers,0,'no commander picker');
            await page.selectOption('#setupAI','2');
            await page.evaluate(()=>wodSyncSetupOpponentsBrief());
            await page.selectOption('#setupAiDifficulty','hard');
            const chosen=await page.evaluate(()=>({stored:localStorage.getItem('simplewarsAiDifficulty'),hint:document.getElementById('setupAiDifficultyDetail').textContent,
                brief:document.getElementById('setupOpponentsBrief').innerText,pickers:document.querySelectorAll('#setupOpponentsBrief select').length}));
            assert.equal(chosen.stored,'hard');assert.match(chosen.hint,/Same rules and income as you/);assert.equal(chosen.pickers,0);
            await page.screenshot({path:path.join(OUT,'setup-'+viewport.width+'.png')});
            await page.waitForFunction(()=>!wodIsMapPreviewGenerating(),null,{timeout:180000});
            await page.locator('#setupBtnStartAi').click();
            await H.waitForMatch(page);
            await page.waitForTimeout(1600);
            const match=await page.evaluate(()=>{const names=Object.values(WOD_AI_COMMANDERS).map(c=>c.name);const p=gameData.aiCommanderProfiles;
                return {difficulty:gameData.aiDifficulty,known:[2,3].every(o=>!!WOD_AI_COMMANDERS[p[o]?.id]),toast:document.querySelector('.wod-toast-note')?.textContent||'',names,
                    edge:wodAiDifficulty(2).edge,doctrine:wodOpsState(2,wodAiOperationTime()).doctrine.name,expected:WOD_AI_COMMANDERS[p[2].id].doctrine};});
            assert.equal(match.difficulty,'hard');assert(match.known,'every opponent has a commander drawn at random');
            assert(!match.names.some(n=>match.toast.includes(n)),'no commander is announced');
            assert.equal(match.edge,-.06);assert.equal(match.doctrine,match.expected,'the commander decides the doctrine');
            await page.evaluate(()=>toggleWodStatsPanel(true));
            const report=await page.locator('#wodStatsOpponents').innerText();
            assert.match(report,/Difficulty: Hard/);assert(!match.names.some(n=>report.includes(n)),'the battle report names no commander');
            await page.locator('#wodStatsOpponents').scrollIntoViewIfNeeded();
            await page.screenshot({path:path.join(OUT,'report-'+viewport.width+'.png')});
            results[viewport.width]={defaults,chosen,match,report:report.slice(0,160)};
            assert.deepEqual(errors.pageErrors,[],'no page errors');
            await page.close();
        }
        // The AI's rules, checked directly in a running page.
        const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=H.collectErrors(page);
        await H.gotoAutostart(page,url);
        results.rules=await page.evaluate(()=>{
            setGameSpeed(0,true);
            const out={};
            gameData.aiDifficulty='easy';out.easy={tricks:wodAiDifficulty(2).tricks,memory:wodAiDifficulty(2).memory,threshold:wodAiAttackThreshold(2)};
            gameData.aiDifficulty='normal';out.normal={tricks:wodAiDifficulty(2).tricks,threshold:wodAiAttackThreshold(2)};
            // every enemy is an enemy: owner 3 counts as a foe to owner 2 just as the player does
            gameData.alliances=[];out.foe3=wodAiIsFoe(2,3);out.foe1=wodAiIsFoe(2,1);out.friendSelf=wodAiIsFoe(2,2);
            // unpaid upkeep hurts a computer faction's troops the same way
            const u=gameData.entities.find(e=>e.owner===2&&e.hp>0&&isLandArmyUnit(e));
            gameData.aiMoneyByOwner[2]=0;const keep=getOwnerIncome;getOwnerIncome=o=>o===2?0:keep(o);
            const hp=u.hp;for(let i=0;i<20;i++){wodBeginSimPfBudget(gameData.entities.length);update(.05);}
            getOwnerIncome=keep;out.unpaid={before:hp,after:u.hp,flash:u.unpaidFlash>0};
            return out;
        });
        const r=results.rules;
        assert.equal(r.easy.tricks,false);assert.equal(r.easy.memory,20);assert(r.easy.threshold>r.normal.threshold+.25,'easy wants a bigger edge');
        assert.equal(r.normal.tricks,true);
        assert.equal(r.foe3,true);assert.equal(r.foe1,true);assert.equal(r.friendSelf,false);
        assert(r.unpaid.after<r.unpaid.before&&r.unpaid.flash,'an AI faction out of money and in deficit loses strength to unpaid upkeep');
        // campaign: chosen with the new war, saved with it, changeable in the campaign panel
        results.campaign=await page.evaluate(async()=>{
            returnToMenu();await new Promise(r=>setTimeout(r,500));
            localStorage.removeItem(WOD_ROGUE_LS_KEY);wodRogue=null;showPanel('campaign');await new Promise(r=>setTimeout(r,300));
            const set=document.getElementById('wodCampSetDifficulty');set.value='easy';set.dispatchEvent(new Event('change'));
            document.getElementById('wodCampBeginBtn').click();await new Promise(r=>setTimeout(r,300));
            const begun=wodRogueLoad().settings.aiDifficulty,shown=document.getElementById('wodCampActiveDifficulty').value;
            const active=document.getElementById('wodCampActiveDifficulty');active.value='hard';active.dispatchEvent(new Event('change'));
            const changed=wodRogueLoad().settings.aiDifficulty,applied=wodCampaignAiDifficulty();
            localStorage.removeItem(WOD_ROGUE_LS_KEY);wodRogue=null;
            return {begun,shown,changed,applied};
        });
        assert.deepEqual(results.campaign,{begun:'easy',shown:'easy',changed:'hard',applied:'hard'});
        assert.deepEqual(errors.pageErrors,[],'no page errors');
        console.log(JSON.stringify(results,null,1));
        console.log('verify-ai-difficulty: PASS');
    }catch(e){console.error(JSON.stringify(results,null,1));console.error(e);process.exitCode=1;}
    finally{await browser.close();await close();}
})();
