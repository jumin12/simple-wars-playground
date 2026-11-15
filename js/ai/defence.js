// AI: defence. Threats to towns, forts and hospitals and the responses to them, defence plans built over several
// frames, town garrisons and fort guards, supply corridors that may be cut, troops that are cut off finding the
// way back, and walking troops into the empty streets of a town being taken.
'use strict';

/** Choose reachable cover using the same terrain multipliers as combat. */
function wodAiDefendStandHex(owner, target, unit) {
    if(!target)return null;
    const anchor=wodHexAt(target.q,target.r)||target, hr=gameData.hexRadius||20;
    if(anchor.x==null)return anchor;
    const defender=unit||{type:'light',owner}, near=wodAiKnownEntities(owner).filter(u=>u.hp>0&&u.type!=='convoy'&&wodIsHostileOwner(u.owner,owner)&&wodAiDist2(u.x,u.y,anchor.x,anchor.y)<Math.pow(hr*12,2));
    near.sort((a,b)=>wodAiDist2(a.x,a.y,anchor.x,anchor.y)-wodAiDist2(b.x,b.y,anchor.x,anchor.y));
    const enemy=near[0], candidates=[anchor], seen=new Set([getHexKey(anchor)]);
    // Expand over friendly walking edges only, so cover across a river or mountain is not selected.
    for(let i=0;i<candidates.length;i++)for(const d of cardinalHexDirections) {
        const h=candidates[i], n=wodHexAt(h.q+d.q,h.r+d.r);
        if(!n||seen.has(getHexKey(n))||Math.max(Math.abs(n.q-anchor.q),Math.abs(n.r-anchor.r))>2||
            n.owner!==owner||isWaterHex(n)||n.type==='mountain'&&!wodCanClimb(defender)||!canUnitEnterHex(defender,n))continue;
        seen.add(getHexKey(n));candidates.push(n);
    }
    let best=anchor, score=-Infinity;
    for(const h of candidates) {
        if(h.owner!==owner||isWaterHex(h)||h.type==='mountain'&&!wodCanClimb(defender))continue;
        let value=(1-getTerrainDefenseModifier(defender,h))*22+(getTerrainAttackModifier(defender,h)-1)*8-
            wodAiDist2(h.x,h.y,anchor.x,anchor.y)/(hr*hr)*1.15;
        if(enemy)value-=Math.abs(Math.sqrt(wodAiDist2(h.x,h.y,enemy.x,enemy.y))-Math.max(hr*2,(defender.range||hr*3)*.8))/hr*1.3;
        if(gameData.forts.some(f=>f.owner===owner&&wodAiDist2(h.x,h.y,f.x,f.y)<=wodFortPlacementRingRadiusSq()))value+=6;
        if(value>score){score=value;best=h;}
    }
    return best;
}

function wodAiFortGuardReachSq() {
    let hr = gameData.hexRadius || 20;
    return Math.pow(hr * 1.35 * 5.5, 2);
}

function wodAiFortHasGuard(fort, ownerId) {
    if(!fort || !ownerId) return false;
    let r2 = wodAiFortGuardReachSq();
    for(let u of gameData.entities) {
        if(u.hp <= 0 || u.owner !== ownerId || u.type === 'convoy' || wodIsNavalUnit(u)) continue;
        let dx = u.x - fort.x, dy = u.y - fort.y;
        if(dx * dx + dy * dy <= r2) return true;
    }
    return false;
}

function wodAiCountFortGuards(fort, ownerId) {
    if(!fort || !ownerId) return 0;
    let r2 = wodAiFortGuardReachSq();
    let n = 0;
    for(let u of gameData.entities) {
        if(u.hp <= 0 || u.owner !== ownerId || u.type === 'convoy' || wodIsNavalUnit(u)) continue;
        let dx = u.x - fort.x, dy = u.y - fort.y;
        if(dx * dx + dy * dy <= r2) n++;
    }
    return n;
}

function wodAiFortThreatNeed(fort, ownerId) {
    if(!fort || fort.owner !== ownerId) return 0;
    let hr = gameData.hexRadius || 20;
    let enemies = countNearbyUnits(ownerId, fort.x, fort.y, Math.max(300, hr * 13), true);
    // A fort far behind a quiet front needs nobody: its guards go back to the army. (It used to keep one man
    // forever, so troops parked near rear forts pinned their defenders.)
    if(!enemies && wodOpsTune(ownerId).fortGuards !== 0) {
        const fh = wodHexAt(fort.q, fort.r);
        const exposed = fh && getHexesInRadius(fort.q, fort.r, 6).some(p => {const h = wodHexAt(p.q, p.r);return h && !isWaterHex(h) && wodIsHostileOwner(h.owner, ownerId);});
        if(!exposed) return 0;
    }
    return Math.max(1,Math.min(4,enemies+1));
}

function wodAiEnsureFortGuard(ownerId, fortHex) {
    if(!ownerId || !fortHex || !gameData.forts || !gameData.forts.length) return;
    let fort = null;
    for(let fi = gameData.forts.length - 1; fi >= 0; fi--) {
        let ft = gameData.forts[fi];
        if(ft && ft.owner === ownerId && ft.q === fortHex.q && ft.r === fortHex.r) {
            fort = ft;
            break;
        }
    }
    if(!fort) return;
    let need = Math.max(1, wodAiFortThreatNeed(fort, ownerId) || (wodAiFortHasGuard(fort, ownerId) ? 0 : 1));
    let have = wodAiCountFortGuards(fort, ownerId);
    if(have >= need) return;
    let want = need - have;
    let hr = gameData.hexRadius || 20;
    let pullR2 = Math.pow(hr * (need > 1 ? 22 : 16), 2);
    while(want > 0) {
        let best = null, bestD = Infinity;
        for(let u of gameData.entities) {
            if(u.hp <= 0 || u.owner !== ownerId || u.type === 'convoy' || wodIsNavalUnit(u)) continue;
            if(u.moraleBroken || u.retreating || u.hp / u.maxHp < 0.42) continue;
            if(['armor', 'marine', 'naval', 'raid', 'support'].includes(u.aiTfKind)) continue;
            if(u.aiCityStriker) continue;
            if(u.aiFortGuard && u.aiFortGuard !== fort.id) continue;
            if(u.aiTfKind === 'defend' && u.aiTfJobId) continue;
            // (the field command guards its own works; a unit it holds would ignore this order and be counted anyway)
            if(u._opsUntil > wodAiOperationTime() && wodOpsTune(ownerId).fortGuards !== 0) continue;
            let dx = u.x - fort.x, dy = u.y - fort.y;
            let d = dx * dx + dy * dy;
            if(d > pullR2) continue;
            // Prefer units already near the fort / already tagged as its guard.
            if(u.aiFortGuard === fort.id) d *= 0.35;
            if(d < bestD) {
                bestD = d;
                best = u;
            }
        }
        if(!best) break;
        best.aiFortGuard = fort.id;
        best.aiCityStriker = false;
        best.aiTfKind = 'defend';
        best.aiTfRole = 'fix';
        wodAiMoveUnitTowardHex(best, fortHex, true, 0.22);
        want--;
    }
    if(want <= 0 || wodAiCountFortGuards(fort, ownerId) > 0) return;
    if(!canAffordUnit(ownerId, 'light')) return;
    // A recruit for a fort is paid for like any other: within upkeep, outside the money put by for buildings
    // or ships, and not while the field command is the one buying land troops.
    if(wodOpsTune(ownerId).fortGuards !== 0) {
        const plan = gameData._aiEconomyPlans?.[ownerId];
        if(wodOpsBuysLand(ownerId) || plan && !wodAiCanSpendOutsideReserve(ownerId, 'light', plan)) return;
        if(getOwnerIncome(ownerId) - getOwnerExpenses(ownerId) < getUnitUpkeep({type: 'light'}) + 1) return;
    }
    let spawnCity = null, spawnD = Infinity;
    for(let c of gameData.cities) {
        if(c.owner !== ownerId) continue;
        if(!cityEligibleForBuildPlacementForOwner(c, 'light', ownerId)) continue;
        let dx = c.x - fort.x, dy = c.y - fort.y;
        let d = dx * dx + dy * dy;
        if(d < spawnD) {
            spawnD = d;
            spawnCity = c;
        }
    }
    if(!spawnCity) return;
    wodApplyBuildAtCityForOwner(spawnCity, 'light', ownerId);
}

function wodAiMaintainFortGuards(ownerId) {
    wodAiFaction(ownerId, 'fort guards', wodAiKeepFortGuards, ownerId);
}

function wodAiKeepFortGuards(ownerId) {
    let forts = gameData.forts;
    if(!forts || !forts.length) return;
    for(let fi = 0, fl = forts.length; fi < fl; fi++) {
        let ft = forts[fi];
        if(!ft || ft.owner !== ownerId) continue;
        let need = wodAiFortThreatNeed(ft, ownerId);
        if(need <= 0) {
            for(let u of gameData.entities) {
                if(u && u.owner === ownerId && u.aiFortGuard === ft.id) u.aiFortGuard = null;
            }
            continue;
        }
        wodAiEnsureFortGuard(ownerId, wodHexAt(ft.q,ft.r) || { q: ft.q, r: ft.r, x: ft.x, y: ft.y });
    }
}

/** Faction-wide supply graph, shared with units and diagonal land connections. */
function wodAiReadDefense(owner, units, force=false) {
    const now=wodAiOperationTime(), hr=gameData.hexRadius||20;
    const cityStamp=wodAiKnownCities(owner).filter(c=>wodIsFriendlyOwner(c.owner,owner)).map(c=>c.id+':'+c.owner).sort().join('|');
    const topology=gameData._supplyTopologyVersion||0;
    gameData._aiDefenseByOwner ||= {};
    const old=gameData._aiDefenseByOwner[owner];
    if(!force && old && !old.pending && old.hexes===gameData.hexes && old.cityStamp===cityStamp && old.topology===topology && now>=old.at && now-old.at<2500)return old;
    const work=gameData._aiDefenseWork||=(new Map());
    if(!force&&gameData._wodPfFrameActive){
        if(work.get(owner)?.hexes!==gameData.hexes)work.set(owner,{hexes:gameData.hexes,cityStamp,iterator:wodAiBuildDefense(owner,units,old,now,hr,cityStamp,topology)});
        if(old?.hexes===gameData.hexes)return old;
        return gameData._aiDefenseByOwner[owner]={pending:true,hexes:gameData.hexes,at:now,jobs:[],unitJob:{},pockets:[],corridors:[],incursions:0,suppliedHexes:0,supplyDistance:new Map()};
    }
    work.delete(owner);
    const scan=wodAiBuildDefense(owner,units,old,now,hr,cityStamp,topology);let step;
    do{step=scan.next();}while(!step.done);return step.value;
}

function wodStepAiDefenseWork() {
    if(gameData._wodDefenseFrameDone)return;gameData._wodDefenseFrameDone=true;
    const work=gameData._aiDefenseWork;if(!work?.size)return;
    const start=performance.now(),budget=wodUsesVisualViewportLayout()?1.1:2;
    do{
        const [owner,job]=work.entries().next().value;work.delete(owner);
        if(job.hexes!==gameData.hexes||wodAiIsSuspended(owner))continue;
        try{const step=job.iterator.next();if(!step.done)work.set(owner,job);}
        catch(e){wodAiReportError(owner,'defence',e);}
    }while(work.size&&performance.now()-start<budget);
}

function* wodAiBuildDefense(owner,units,old,now,hr,cityStamp,topology) {
    const walk=h=>h && (!isWaterHex(h)||isBridgeHex(h));
    const friendly=h=>walk(h)&&wodSupplyPassable(h,owner);
    const tiles=gameData.hexList.filter(friendly), index=new Map(tiles.map((h,i)=>[getHexKey(h),i]));
    yield;
    const geometry=yield* wodAiSupplyGeometrySteps(),local=new Int32Array(geometry.cells.length).fill(-1);
    for(let i=0;i<tiles.length;i++)local[geometry.index.get(tiles[i])]=i;
    const edges=[];
    for(let ti=0;ti<tiles.length;ti++){const links=[];for(const gid of geometry.neighbors[geometry.index.get(tiles[ti])]||[]){const i=local[gid];if(i>=0)links.push(i);}edges.push(links);if((ti&127)===127)yield;}
    const roots=[...new Set(wodAiKnownCities(owner).filter(c=>wodIsFriendlyOwner(c.owner,owner)).flatMap(c=>wodCitySupplySourceHexes(c).map(h=>index.get(getHexKey(h)))).filter(i=>i!==undefined))];
    const supplied=new Set(roots), queue=roots.slice(),supplyDepth=new Map(roots.map(i=>[i,0]));
    for(let qi=0;qi<queue.length;qi++){for(const j of edges[queue[qi]])if(!supplied.has(j)){supplied.add(j);supplyDepth.set(j,supplyDepth.get(queue[qi])+1);queue.push(j);}if((qi&255)===255)yield;}
    const supplyDistance=new Map([...supplyDepth].map(([i,d])=>[getHexKey(tiles[i]),d]));
    const army=units.filter(u=>u.hp>0&&u.type!=='convoy'&&!wodIsNavalUnit(u));
    army.forEach(ensureUnitId);
    const positions=new Map(army.map(u=>[u.uid,index.get(getHexKey(wodUnitSupplyHex(u,getNearestHexToPoint(u.x,u.y))||{}))]));
    const weights=new Int32Array(tiles.length);
    for(const u of army)if(u.type!=='marine'&&positions.get(u.uid)!==undefined)weights[positions.get(u.uid)]++;
    const enemies=wodAiKnownEntities(owner).filter(u=>u.hp>0&&(isLandArmyUnit(u)||u.type==='marine')&&wodIsHostileOwner(u.owner,owner));
    const nearbyEnemyRange2=(hr*8)**2;
    const closeEnemies=h=>enemies.some(e=>wodAiDist2(e.x,e.y,h.x,h.y)<nearbyEnemyRange2);
    const threats=[], pockets=[], seen=new Set(supplied);
    // Each disconnected component gets a shortest land breach to the supplied army.
    // Search the whole map, including large pockets; mountains/water are never shortcuts.
    for(let i=0;i<tiles.length;i++) {
        if((i&255)===255)yield;
        if(seen.has(i))continue;
        const component=[i];seen.add(i);
        for(let ci=0;ci<component.length;ci++){for(const j of edges[component[ci]])if(!seen.has(j)){seen.add(j);component.push(j);}if((ci&255)===255)yield;}
        const keys=new Set(component.map(j=>getHexKey(tiles[j])));
        const waterAccess=component.some(j=>cardinalHexDirections.some(d=>isWaterHex(wodHexAt(tiles[j].q+d.q,tiles[j].r+d.r))));
        const trapped=army.filter(u=>keys.has(getHexKey(getNearestHexToPoint(u.x,u.y)||{}))&&
            !(u.type==='marine'&&waterAccess));
        if(!trapped.length||!roots.length)continue;
        const search=component.map(j=>tiles[j]), visited=new Set(keys), parent=new Map();let end=null;
        for(let qi=0;qi<search.length&&!end;qi++) {
            if((qi&255)===255)yield;
            const h=search[qi];
            for(const d of cardinalHexDirections) {
                const n=wodHexAt(h.q+d.q,h.r+d.r), k=n&&getHexKey(n);
                if(!walk(n)||visited.has(k))continue;
                visited.add(k);parent.set(k,h);search.push(n);
                if(supplied.has(index.get(k))){end=n;break;}
            }
        }
        if(!end)continue; // Disconnected islands require a naval operation, not a land march into water.
        const path=[end];while(parent.has(getHexKey(path[path.length-1])))path.push(parent.get(getHexKey(path[path.length-1])));
        path.reverse();
        const hostile=path.filter(h=>!friendly(h));
        if(!hostile.length)continue;
        const rec={id:'relief-'+getHexKey(hostile[0]),kind:'relief',role:'relief',holdHex:hostile[hostile.length-1],
            innerHex:hostile[0],pocketKeys:keys,trapped:trapped.map(u=>u.uid),path,area:component.length,score:1000+trapped.length*30};
        pockets.push(rec);threats.push(rec);
    }
    // Iterative low-link traversal, rooted at ALL owned towns through a virtual node.
    // A threatened articulation point can cut off a whole army, even when it is far away.
    const n=tiles.length, root=n, adj=edges.concat([roots]);
    for(const i of roots)adj[i]=adj[i].concat(root);
    const disc=new Int32Array(n+1), low=new Int32Array(n+1), area=new Int32Array(n+1), troops=new Int32Array(n+1);
    const parents=new Int32Array(n+1).fill(-1);let tick=1;
    disc[root]=low[root]=tick;const stack=[{i:root,next:0}];
    const cuts=new Map();let scanTicks=0;
    while(stack.length) {
        if((++scanTicks&511)===0)yield;
        const frame=stack[stack.length-1], v=frame.i;
        if(frame.next<adj[v].length) {
            const w=adj[v][frame.next++];
            if(!disc[w]){parents[w]=v;disc[w]=low[w]=++tick;area[w]=1;troops[w]=weights[w]||0;stack.push({i:w,next:0});}
            else if(w!==parents[v])low[v]=Math.min(low[v],disc[w]);
        } else {
            stack.pop();const p=parents[v];if(p<0)continue;
            low[p]=Math.min(low[p],low[v]);area[p]+=area[v];troops[p]+=troops[v];
            if(p!==root&&low[v]>=disc[p]&&troops[v]>=1) {
                const prior=cuts.get(p)||{troops:0,area:0};prior.troops+=troops[v];prior.area+=area[v];cuts.set(p,prior);
            }
        }
    }
    // Check exposed adjacent pairs too: a two-tile neck is not an articulation point.
    // Bound these secondary floods; the main scan above stays linear in map size.
    const pairs=[], pairSeen=new Set();
    for(let i=0;i<n;i++) {
        if((i&127)===127)yield;
        if(!supplied.has(i)||tiles[i].owner!==owner||!closeEnemies(tiles[i]))continue;
        const exposed=h=>cardinalHexDirections.some(d=>{const x=wodHexAt(h.q+d.q,h.r+d.r);return walk(x)&&wodIsHostileOwner(x.owner,owner);});
        if(!exposed(tiles[i]))continue;
        for(const j of edges[i])if(j>i&&supplied.has(j)&&exposed(tiles[j])) {
            const key=i+','+j;if(pairSeen.has(key))continue;pairSeen.add(key);
            const d=Math.min(...enemies.map(e=>wodAiDist2(e.x,e.y,tiles[i].x,tiles[i].y)));
            pairs.push({i,j,d});
        }
    }
    pairs.sort((a,b)=>a.d-b.d);
    const pairReached=new Uint8Array(n),pairQueue=new Int32Array(n);
    for(const {i,j} of pairs.slice(0,12)) {
        yield;
        if(cuts.has(i)||cuts.has(j))continue;
        pairReached.fill(0);let tail=0;
        for(const r of roots)if(r!==i&&r!==j&&!pairReached[r]){pairReached[r]=1;pairQueue[tail++]=r;}
        for(let q=0;q<tail;q++)for(const k of edges[pairQueue[q]])if(k!==i&&k!==j&&!pairReached[k]){pairReached[k]=1;pairQueue[tail++]=k;}
        let count=0, size=0;
        for(const k of supplied)if(k!==i&&k!==j&&!pairReached[k]){count+=weights[k];size++;}
        if(count>=1)cuts.set(i,{troops:count,area:size,keys:[i,j]});
    }
    yield;
    const predicted=yield* wodAiPredictCorridorSteps(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth);
    for(const cut of predicted){
        if(!cuts.has(cut.i))cuts.set(cut.i,cut);
    }
    for(const [i,cut] of cuts) {
        yield;
        const h=tiles[i],crossing=(cut.keys||[i]).map(j=>tiles[j]);
        const screenPoints=cut.screenIndices?.map(j=>tiles[j])||(crossing.length>2?[crossing[0],crossing[crossing.length-1]]:[h]);
        const nearScreen=e=>screenPoints.some(p=>wodAiDist2(e.x,e.y,p.x,p.y)<Math.pow(hr*10,2));
        const pressure=enemies.filter(nearScreen).length;
        if(!friendly(h)||!pressure)continue;
        const approaching=enemies.filter(nearScreen);
        const cx=approaching.reduce((n,e)=>n+e.x,0)/Math.max(1,approaching.length),cy=approaching.reduce((n,e)=>n+e.y,0)/Math.max(1,approaching.length);
        threats.push({id:'corridor-'+getHexKey(h),kind:'corridor',role:'fix',holdHex:h,area:cut.area,atRisk:cut.troops,
            cutIndices:cut.keys||[i],cutHexes:crossing,screenPoints,riskTileKeys:cut.riskTileKeys,predictive:!!cut.predictive,wide:!!cut.wide,closureSeconds:cut.closureSeconds,withdrawSeconds:cut.withdrawSeconds,
            enemies:pressure,score:350+Math.min(8,cut.troops)*18+Math.min(80,cut.area)-Math.hypot(h.x-cx,h.y-cy)/hr*15});
    }
    // Wide pincers and attacks away from towns: defend contested territory, not just assets.
    // Cluster the invading force so one battle cannot request a garrison on every tile.
    const incursions=[];
    for(const e of enemies) {
        const h=getNearestHexToPoint(e.x,e.y);if(!h)continue;
        const near=getHexesInRadius(h.q,h.r,4).map(p=>wodHexAt(p.q,p.r)).filter(t=>t&&t.owner===owner&&friendly(t));
        if(near.length<2)continue;
        let cluster=incursions.find(t=>wodAiDist2(t.x,t.y,e.x,e.y)<Math.pow(hr*7,2));
        if(!cluster){cluster={x:e.x,y:e.y,count:0,near,contacts:[]};incursions.push(cluster);}cluster.count++;cluster.contacts.push(e.uid);
    }
    const usedTerritory=new Set();
    const oldTerritory=(old?.jobs||[]).filter(j=>j.kind==='territory');
    for(const t of incursions)t.affinity=Math.max(0,...oldTerritory.map(j=>t.contacts.filter(id=>j.contacts?.includes(id)).length));
    incursions.sort((a,b)=>b.affinity-a.affinity||b.count-a.count);
    for(const t of incursions) {
        if(wodAiBorderBattleCovered(owner,t,gameData.aiTaskForces?.[owner]))continue;
        const threat=wodAiTerritoryThreat(owner,t,old,usedTerritory);if(threat)threats.push(threat);
    }
    threats.push(...wodAiTownDefenseThreats(owner,army));
    threats.sort((a,b)=>b.score-a.score);
    let selected=[];
    for(const t of threats)if(t.kind==='counter'||t.kind==='relief'||!selected.some(s=>s.kind!=='relief'&&(
        wodAiDist2(s.holdHex.x,s.holdHex.y,t.holdHex.x,t.holdHex.y)<Math.pow(hr*7,2)||
        t.kind==='corridor'&&s.kind==='corridor'&&t.riskTileKeys&&s.riskTileKeys&&t.riskTileKeys.filter(k=>s.riskTileKeys.includes(k)).length>=Math.min(t.riskTileKeys.length,s.riskTileKeys.length)*.6)))selected.push(t);
    for(const cut of selected.filter(t=>t.kind==='corridor').slice(0,12)){
        yield;
        const blocked=new Set(cut.cutIndices),safe=new Set(roots.filter(r=>!blocked.has(r))),flood=[...safe];
        for(let q=0;q<flood.length;q++)for(const k of edges[flood[q]])if(!blocked.has(k)&&!safe.has(k)){safe.add(k);flood.push(k);}
        // Marines can keep coastal supply after a land corridor closes.
        // Test their actual component after this cut, not another island.
        const marineSafe=new Set(),marineChecked=new Set();
        for(const u of army.filter(u=>u.type==='marine')){
            const start=positions.get(u.uid);if(start===undefined||safe.has(start)||blocked.has(start)||marineChecked.has(start))continue;
            const component=[start];marineChecked.add(start);let waterAccess=false;
            for(let q=0;q<component.length;q++){
                const i=component[q],h=tiles[i];
                if(cardinalHexDirections.some(d=>isWaterHex(gameData.hexes[(h.q+d.q)+','+(h.r+d.r)])))waterAccess=true;
                for(const k of edges[i])if(!blocked.has(k)&&!safe.has(k)&&!marineChecked.has(k)){marineChecked.add(k);component.push(k);}
                if((q&255)===255)yield;
            }
            if(waterAccess)for(const i of component)marineSafe.add(i);
        }
        cut.riskUnits=new Set(army.filter(u=>positions.get(u.uid)!==undefined&&!safe.has(positions.get(u.uid))&&!blocked.has(positions.get(u.uid))&&
            !(u.type==='marine'&&marineSafe.has(positions.get(u.uid)))).map(u=>u.uid));
    }
    // Keep every proven cut for withdrawal safety, but allocate only
    // one screen where the same entrance protects the same troops.
    const corridorWarnings=selected.filter(t=>t.kind==='corridor');
    selected=wodAiSelectDefenseThreats(selected);
    wodAiStabilizeCorridorJobs(selected,old);
    for(const cut of corridorWarnings)if(cut._screenResponse){cut.responseId=cut._screenResponse.id;delete cut._screenResponse;}
    const trappedIds=new Set(pockets.flatMap(p=>p.trapped));
    const unitJob={}, jobs=[], available=army.filter(u=>!u.moraleBroken&&(trappedIds.has(u.uid)||!u._medicalRecovering&&!u.retreating&&u.hp/u.maxHp>.34)), plan=gameData.aiTaskForces?.[owner];
    const primaryTheater=wodAiDefenseTheater(owner,selected,available,plan);
    for(const cut of corridorWarnings)wodAiCorridorHoldRatio(owner,cut,{unitJob:old?.unitJob});
    let budget=wodAiDefenseResponseBudget(owner,available,selected,pockets);
    const responseThreats=selected.slice(0,12),screens=yield* wodAiReserveDefenseScreens(owner,responseThreats,
        available.filter(u=>supplied.has(positions.get(u.uid))),plan,budget,old);
    const responseWeight=t=>Math.max(1,Math.sqrt(t.enemies||t.atRisk||t.neededPower||2))*(t.kind==='counter'?2:t.kind==='corridor'?1.5:1);
    const add=(job,u)=>{unitJob[u.uid]=job.id;job.members.push(u.uid);if(u._aiDefenseLease?.id!==job.id||u._aiDefenseLease.until<=now)u._aiDefenseLease={id:job.id,until:now+18000};if(job.kind==='territory'&&u._aiTerritoryJob!==job.id){u._aiTerritoryJob=job.id;u._aiTerritoryAssignedAt=now;}};
    for(const [threatIndex,t] of responseThreats.entries()) {
        yield;
        const job={...t,owner,members:[],response:true};
        // Defense scans replace job objects; keep measured breakout
        // motion so a refresh cannot restart an immobile force's clock.
        const priorRelief=job.kind==='relief'&&old?.hexes===gameData.hexes&&old.jobs.find(j=>j.kind==='relief'&&j.id===job.id);
        if(priorRelief?.breakoutProgress)job.breakoutProgress=priorRelief.breakoutProgress;
        // Trapped units break outward while a limited relief force attacks the same cut from outside.
        for(const u of available)if(t.trapped?.includes(u.uid))add(job,u);
        const trappedCount=job.members.length;
        const limitedTown=t.kind==='counter'&&primaryTheater&&!t.primaryTheater&&!t.feasible;
        let want=t.kind==='counter'?(limitedTown?Math.min(2,Math.max(1,Math.ceil(t.neededPower*.35))):Math.min(24,Math.max(1,Math.ceil(t.neededPower*.85)))):t.kind==='relief'?Math.min(8,Math.max(4,Math.ceil(trappedCount*.5))):Math.min(12,Math.max(2,t.enemies||Math.ceil((t.atRisk||2)/2)));
        const responsePoints=t.screenPoints||[t.holdHex];
        const responseDistance=u=>Math.min(...responsePoints.map(p=>Math.hypot(u.x-p.x,u.y-p.y)));
        const opposition=wodAiThreats(owner).filter(e=>responseDistance(e)<hr*8);
        const neededPower=limitedTown?Math.min(2,t.neededPower):t.neededPower||opposition.reduce((n,e)=>n+wodAiUnitCombatPower(e),0)*(t.kind==='corridor'?1.4:1.15);
        let responsePower=available.filter(u=>job.members.includes(u.uid)).reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
        const reservedElsewhere=[...screens.byUnit].filter(([id,target])=>target!==t.id&&!unitJob[id]).length;
        const remainingWeight=responseThreats.slice(threatIndex).filter(s=>s===t||screens.counts.has(s.id)).reduce((n,s)=>n+responseWeight(s),0);
        const responseBudget=Math.min(Math.max(0,budget-reservedElsewhere),Math.max(screens.counts.get(t.id)||0,Math.ceil(budget*responseWeight(t)/Math.max(1,remainingWeight))));
        let recruited=0;
        const candidates=available.filter(u=>!unitJob[u.uid]&&wodAiDefenseFrontAvailable(u,t,plan)&&wodAiDefenseLeaseAllows(u,t,responseThreats,old)&&(!screens.byUnit.has(u.uid)||screens.byUnit.get(u.uid)===t.id)&&!t.pocketKeys?.has(getHexKey(getNearestHexToPoint(u.x,u.y)||{}))&&
            u.type!=='marine'&&supplied.has(positions.get(u.uid))&&
            responseDistance(u)<hr*(t.kind==='relief'||t.kind==='corridor'?60:24)&&wodAiResponseCanArrive(u,t,responseDistance(u)));
        const base=u=>plan?.jobs.find(j=>j.id===plan.unitJob[u.uid]);
        const critical=t.kind==='corridor'||t.kind==='relief'||t.kind==='counter';
        const routine=t.kind==='territory'||t.kind==='corridor'&&!wodAiCorridorUrgent(t);
        const hostileFront=new Set(t.frontOwner?[t.frontOwner]:opposition.map(e=>e.owner));
        const gateFor=u=>responsePoints.slice().sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];
        const gateSaturation=u=>{if(t.kind!=='corridor'||responsePoints.length<2)return 0;const gate=gateFor(u),need=opposition.filter(e=>gateFor(e)===gate).reduce((n,e)=>n+wodAiUnitCombatPower(e),0)*1.4,assigned=available.filter(a=>job.members.includes(a.uid)&&gateFor(a)===gate).reduce((n,a)=>n+wodAiUnitCombatPower(a),0);return assigned>=Math.max(1,need)?hr*hr*1000:0;};
        const cost=u=>gateSaturation(u)+(wodAiFrontOwner(u)&&hostileFront.size&&!hostileFront.has(wodAiFrontOwner(u))?hr*hr*180:0)+(t.arrivals?.[u.uid]!=null?Math.min(1000,t.arrivals[u.uid])*hr*hr*3:responseDistance(u)**2)/Math.max(.5,wodAiUnitCombatPower(u))+
            (t.kind==='corridor'&&t.riskUnits?.has(u.uid)?hr*hr*60:0)+
            (base(u)?.kind==='defend'?hr*hr*1000:0)+(['armor','main','raid'].includes(base(u)?.kind)?hr*hr*(routine?80:critical?1:100):0)+
            (t.kind==='counter'?Math.pow(Math.max(0,wodAiUnitCombatPower(u)-neededPower),2)*hr*hr*400+
                (base(u)?.phase==='assault'&&neededPower<4?hr*hr*150:0):0)+
            (old?.unitJob[u.uid]===t.id?-hr*hr*(t.kind==='corridor'?100:critical?20:200):0);
        candidates.sort((a,b)=>cost(a)-cost(b));
        const responseLimit=t.kind==='counter'&&t.primaryTheater?24:t.kind==='territory'?Math.min(20,Math.max(6,Math.ceil(neededPower*1.2))):10;
        while(candidates.length) {
            if(t.kind==='corridor')candidates.sort((a,b)=>cost(a)-cost(b));
            const u=candidates.shift();
            if(want<=0&&responsePower>=neededPower||budget<=0||recruited>=responseBudget||t.kind!=='corridor'&&job.members.length>=trappedCount+responseLimit)break;
            const previousResponse=old?.jobs.find(j=>j.id===old.unitJob[u.uid]);
            // Finish a short, still-valid response before changing
            // towns again. A real pocket or imminent cut can preempt it.
            if(!wodAiDefenseLeaseAllows(u,t,responseThreats,old))continue;
            if(!critical&&previousResponse?.kind==='territory'&&previousResponse.id!==t.id&&
                selected.some(s=>s.id===previousResponse.id)&&u.target&&(u.stuckTimer||0)<3&&
                now-(u._aiTerritoryAssignedAt??now)<18000)continue;
            // Keep the sole fort garrison in place. Its line and relief troops can reinforce it.
            if(base(u)?.fort||base(u)?.city||limitedTown&&t.arrivals?.[u.uid]>t.deadline)continue;
            // Routine land skirmishes must not repeatedly recall every
            // scout. Town emergencies and real supply cuts still can.
            if(base(u)?.kind==='scout'&&!critical)continue;
            add(job,u);want--;budget--;recruited++;responsePower+=wodAiUnitCombatPower(u);
        }
        if(job.kind==='corridor'){
            const rear=available.filter(u=>job.members.includes(u.uid)&&u.hp>u.maxHp*(u.isGeneral?.75:.6)).sort((a,b)=>(supplyDistance.get(getHexKey(getNearestHexToPoint(a.x,a.y)))??Infinity)-(supplyDistance.get(getHexKey(getNearestHexToPoint(b.x,b.y)))??Infinity));
            job.delayUnits=new Set(rear.slice(0,8).map(u=>u.uid));
        }
        if(job.members.length)jobs.push(job);
    }
    const rec={at:now,hexes:gameData.hexes,cityStamp,topology,jobs,unitJob,pockets,
        corridors:corridorWarnings,incursions:incursions.length,suppliedHexes:supplied.size,supplyDistance};
    gameData._aiDefenseByOwner[owner]=rec;
    for(const cut of rec.corridors)wodAiRecord(owner,'corridor-warning',{job:cut.id,width:cut.cutIndices.length,troops:cut.atRisk,predictive:cut.predictive});
    return rec;
}

function wodAiIssueDefenseResponse(unit,job) {
    if(job.kind==='territory'&&wodAiIssueTerritoryResponse(unit,job))return true;
    const h=getNearestHexToPoint(unit.x,unit.y), trapped=job.pocketKeys?.has(h&&getHexKey(h));
    const anchor=trapped?job.innerHex:job.holdHex;
    const target=job.kind==='relief'?wodAiReliefStandHex(unit,job,trapped):job.kind==='corridor'?wodAiCorridorStandHex(unit,job):wodAiDefendStandHex(unit.owner,anchor,unit);
    if(!target)return false;
    const holding=job.kind!=='relief'&&wodAiDist2(unit.x,unit.y,target.x,target.y)<Math.pow((gameData.hexRadius||20)*2.4,2);
    const moved=wodAiMoveUnitTowardHex(unit,target,holding,job.kind==='relief'?.16:.12);
    if(moved){unit.aiHoldStartAt=0;wodAiStampOrder(unit,holding,target,job.kind==='corridor'?2000:5000);}
    return moved;
}

function wodAiMaintainTownGarrisons(owner,plan,ready) {
    for(const city of gameData.cities.filter(c=>c.owner===owner)) {
        let job=plan.jobs.find(j=>j.kind==='defend'&&j.city?.id===city.id);
        // (with no garrison job yet nobody is assigned: an unassigned regiment used to match the missing job's id)
        const assigned=job&&ready.find(u=>u.type==='light'&&plan.unitJob[u.uid]===job.id&&wodAiCanReach(u,city));
        if(assigned)continue;
        const candidates=ready.filter(u=>u.type==='light'&&!u.isGeneral&&wodAiCanReach(u,city)&&
            !plan.jobs.some(j=>j.id===plan.unitJob[u.uid]&&j.kind==='defend'&&j.city?.id!==city.id));
        candidates.sort((a,b)=>wodAiTravelCost(a,city)-wodAiTravelCost(b,city));
        if(job)for(const uid of job.members){delete plan.unitJob[uid];const old=ready.find(u=>u.uid===uid);if(old){old.aiTfJobId=null;old.aiTfKind=null;old.aiOrderUntil=0;}}
        if(job)job.members=[];
        const u=candidates[0];if(!u)continue;
        if(!job){job={id:owner+'-town-'+city.id,kind:'defend',role:'defend',city,quota:1,members:[]};plan.jobs.push(job);}
        const old=plan.jobs.find(j=>j.id===plan.unitJob[u.uid]);if(old)old.members=old.members.filter(id=>id!==u.uid);
        job.members=[u.uid];job.quota=1;plan.unitJob[u.uid]=job.id;
        u.aiTfJobId=job.id;u.aiTfKind='defend';u.aiTfRole='defend';u.aiOrderUntil=0;u.aiHoldUntil=0;
        if(gameData._aiDefenseByOwner)delete gameData._aiDefenseByOwner[owner];
    }
}

function wodAiSweepTownCells(dt) {
    gameData._townSweepTimer=(gameData._townSweepTimer||0)+dt;if(gameData._townSweepTimer<.65)return;gameData._townSweepTimer=0;
    let failed=null;
    for(const u of gameData.entities) {
        if(u.hp<=0||u.owner<=0||wodMpIsHumanOwner(u.owner)||wodIsNavalUnit(u)||u.type==='convoy'||u.retreating||u.moraleBroken||u.boardTransportUid||u._trafficYield||u._navalAssaultUntil>wodAiOperationTime())continue;
        if(failed?.has(u.owner)||wodAiIsSuspended(u.owner))continue;
        try{
        const towns=wodAiKnownCities(u.owner).filter(c=>Math.hypot(c.x-u.x,c.y-u.y)<gameData.hexRadius*7&&getCityUrbanTerrainHexes(c).some(h=>wodIsHostileOwner(h.owner,u.owner)||h.owner===0));
        const city=towns.sort((a,b)=>wodAiDist2(u.x,u.y,a.x,a.y)-wodAiDist2(u.x,u.y,b.x,b.y))[0];if(!city)continue;
        const current=u.aiCaptureHexKey&&gameData.hexes[u.aiCaptureHexKey];if(current&&current.owner!==u.owner&&u.target)continue;
        const members=gameData.entities.filter(m=>m.owner===u.owner&&m.hp>0&&!wodIsNavalUnit(m)&&m.type!=='convoy'&&Math.hypot(m.x-city.x,m.y-city.y)<gameData.hexRadius*9);
        const target=wodAiTownAssaultHex(u,city,members);if(!target||target.owner===u.owner)continue;
        const opsHeld=u._opsUntil>wodAiOperationTime();if(opsHeld&&!u._opsSweep)continue;
        if(opsHeld)gameData._opsIssuing=true;
        try{if(wodAiMoveUnitTowardHex(u,target,false,0)){u.aiCaptureHexKey=getHexKey(target);u.aiOrderUntil=wodAiOperationTime()+2500;u.aiHoldUntil=0;u.aiFormationSerial=-1;}}
        finally{if(opsHeld)gameData._opsIssuing=false;}
        }catch(e){(failed||(failed=new Set())).add(u.owner);wodAiReportError(u.owner,'town sweep',e);}
    }
}

function wodAiDefenseDemand(owner, ready, sectors, strategy=wodAiBattlePlan(owner,ready),garrisons) {
    const infantry=ready.filter(u=>['light','mountaineer'].includes(u.type)&&!u.isGeneral),towns=gameData.cities.filter(c=>c.owner===owner);
    const hr=gameData.hexRadius||20,threats=wodAiThreats(owner),front=wodCachedFrontlineHexes(owner);
    const ranked=sectors.map(s=>{
        const enemies=threats.filter(e=>Math.hypot(e.x-s.holdHex.x,e.y-s.holdHex.y)<hr*11);
        const power=enemies.reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
        const nearTown=towns.some(c=>Math.hypot(c.x-s.holdHex.x,c.y-s.holdHex.y)<hr*10);
        return {...s,defensePriority:1+power*2+(nearTown?1:0),required:Math.min(4,Math.max(1,Math.ceil(power*.7)))};
    }).sort((a,b)=>b.defensePriority-a.defensePriority);
    const guards=garrisons??towns.length;
    const spare=Math.max(0,infantry.length-guards),frontage=Math.min(18,Math.ceil(front.length/12));
    const clusters=[];for(const t of ranked.filter(s=>s.defensePriority>2))if(!clusters.some(p=>Math.hypot(p.x-t.holdHex.x,p.y-t.holdHex.y)<hr*10))clusters.push(t.holdHex);
    const contested=clusters.length;
    const urgent=strategy.intent==='defend',attackFloor=Math.max(2,Math.ceil(spare*(urgent?.35:contested?.5:.65)));
    const share=contested?Math.min(urgent?.55:.38,strategy.defenseShare):Math.min(.14,strategy.defenseShare);
    const line=Math.min(Math.max(0,spare-attackFloor),Math.max(contested?1:0,Math.round(spare*share),Math.min(frontage,contested*2)));
    const reserve=Math.min(Math.max(0,spare-line-attackFloor),Math.floor(ready.filter(isLandArmyUnit).length*strategy.reserveShare));
    return {line,reserve,frontage,contested,ranked,armyFloor:Math.min(140,guards+frontage+Math.max(4,towns.length*2)+Math.ceil(frontage*.2))};
}

// Distant predictions need a screen, not an army-wide recall. Actual town
// attacks, pockets and imminent major cuts retain their emergency budgets.
function wodAiDefenseResponseBudget(owner,available,threats,pockets) {
    if(!threats.length)return 0;
    const townEmergency=threats.some(t=>t.kind==='counter');
    const majorCut=threats.some(t=>t.kind==='corridor'&&wodAiCorridorUrgent(t)&&(t.riskUnits?.size??t.atRisk)>=Math.max(3,available.length*.3));
    const share=(townEmergency||majorCut) ? .85 : pockets.length ? .55 : Math.min(.44,Math.max(.3,wodAiCommander(owner).defense+.06));
    return Math.min(available.length,Math.max(1,Math.ceil(available.length*share)));
}

// A coast or map edge can close the other side of an enemy's pincer. Bridges
// remain real supply corridors, and unknown hostile land is not revealed.
function wodAiCorridorEdge(owner,h,d,explored) {
    const n=gameData.hexes[(h.q+d.q)+','+(h.r+d.r)];
    if(!n||isWaterHex(n)&&!isBridgeHex(n))return -1;
    return wodIsHostileOwner(n.owner,owner)&&(!explored||explored.has(getHexKey(n)))?1:0;
}

// Removing a tested section must actually disconnect troops from every town;
// a coast alone cannot manufacture a pocket. Work remains bounded and yielding.
function* wodAiPredictCorridorSteps(owner, tiles, index, edges, roots, supplied, weights, enemies, supplyDepth) {
    const hr=gameData.hexRadius||20,visible=wodAiThreats(owner,false).filter(e=>!wodIsNavalUnit(e)),sections=[],tested=new Set();
    if(!roots.length||!visible.length)return sections;
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    const outward=i=>cardinalHexDirections.map(d=>gameData.hexes[(tiles[i].q+d.q)+','+(tiles[i].r+d.r)])
        .filter(h=>h&&!isWaterHex(h)&&wodIsHostileOwner(h.owner,owner)&&(!explored||explored.has(getHexKey(h))));
    const boundary=[];
    let checked=0;
    for(const h of wodCachedFrontlineHexes(owner)){
        if((++checked&31)===0)yield;
        const i=index.get(getHexKey(h));if(i===undefined||!supplied.has(i)||!visible.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<hr*12))continue;
        const outside=outward(i);if(outside.length)boundary.push({i,outside,d:Math.min(...visible.map(e=>Math.hypot(e.x-tiles[i].x,e.y-tiles[i].y)))});
    }
    boundary.sort((a,b)=>a.d-b.d);let floods=0;
    const blockedTags=new Uint8Array(tiles.length),safeTags=new Uint8Array(tiles.length),flood=new Int32Array(tiles.length);
    for(const seed of boundary.slice(0,20)){
        yield;
        if(floods>=8)break;
        const start=tiles[seed.i],normal={x:seed.outside[0].x-start.x,y:seed.outside[0].y-start.y};
        const queue=[{i:seed.i,path:[seed.i]}],seen=new Set([seed.i]);let section=null;
        for(let q=0;q<queue.length&&q<160;q++){
            const {i,path}=queue[q],h=tiles[i];
            if(path.length>=3&&cardinalHexDirections.some(d=>wodAiCorridorEdge(owner,h,d,explored)!==0&&
                (d.q*normal.x+d.r*normal.y)<0)){section=path;break;}
            if(path.length>=6)continue;
            for(const j of edges[i])if(!seen.has(j)&&supplied.has(j)&&Math.hypot(tiles[j].x-start.x,tiles[j].y-start.y)<hr*7.5){seen.add(j);queue.push({i:j,path:path.concat(j)});}
        }
        if(!section)continue;
        const signature=section.slice().sort((a,b)=>a-b).join(',');if(tested.has(signature))continue;tested.add(signature);floods++;
        const stamp=floods;let tail=0;
        for(const i of section)blockedTags[i]=stamp;
        for(const i of roots)if(blockedTags[i]!==stamp&&safeTags[i]!==stamp){safeTags[i]=stamp;flood[tail++]=i;}
        for(let q=0;q<tail;q++){for(const j of edges[flood[q]])if(blockedTags[j]!==stamp&&safeTags[j]!==stamp){safeTags[j]=stamp;flood[tail++]=j;}if((q&255)===255)yield;}
        let troops=0,area=0,depth=0;const riskTileKeys=[];
        const neckDepth=Math.min(...section.map(i=>supplyDepth.get(i)??0));
        for(const i of supplied)if(blockedTags[i]!==stamp&&safeTags[i]!==stamp){troops+=weights[i];area++;depth+=weights[i]*Math.max(0,(supplyDepth.get(i)||0)-neckDepth);if(weights[i])riskTileKeys.push(getHexKey(tiles[i]));}
        if(troops<1||area<section.length*2)continue;
        const center=tiles[section[Math.floor(section.length/2)]];
        const closing=visible.filter(e=>Math.hypot(e.x-center.x,e.y-center.y)<hr*12);
        const closureSeconds=Math.min(...closing.map(e=>Math.max(0,Math.hypot(e.x-center.x,e.y-center.y)-(e.range||50))/Math.max(1,(e.speed||15)*WOD_MOVE_SPEED_FACTOR)))+section.length*1.5;
        const withdrawSeconds=wodAiCorridorEvacSeconds(owner,riskTileKeys,index,supplyDepth,neckDepth);
        const screenIndices=[section[0],section[section.length-1]].filter(i=>outward(i).length);
        sections.push({i:section[Math.floor(section.length/2)],troops,area,keys:section,screenIndices,riskTileKeys,predictive:true,closureSeconds,withdrawSeconds});
    }
    return sections.concat(yield* wodAiWideCorridorSteps(owner,tiles,index,edges,roots,supplied,weights,visible,supplyDepth));
}

// Whole-map cross-sections complement the short, winding choke search above.
// A broad salient can have no articulation point and be far wider than six
// cells. Its hostile-facing ends, rather than its empty center, need cover.
function wodAiWideCorridors(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth) {
    const scan=wodAiWideCorridorSteps(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth);let step;do{step=scan.next();}while(!step.done);return step.value;
}

function* wodAiWideCorridorSteps(owner,tiles,index,edges,roots,supplied,weights,enemies,supplyDepth) {
    const hr=gameData.hexRadius||20,candidates=[],result=[];
    // Supplied insertion order is BFS order. Accumulate each column's actual
    // city routes in reverse, so empty frontier crossings cannot consume the
    // flood budget ahead of a distant push that really needs protection.
    const load=weights.slice(),ordered=[...supplied];
    for(let n=ordered.length-1;n>=0;n--){const i=ordered[n],parent=edges[i].find(j=>(supplyDepth.get(j)??Infinity)<supplyDepth.get(i));if(parent!==undefined)load[parent]+=load[i];if((n&255)===255)yield;}
    const explored=wodFogActive()?wodFogFactionIntel(owner).explored:null;
    for(const axis of ['q','r']){
        const other=axis==='q'?'r':'q',rows=new Map();
        let examined=0;
        for(const i of supplied){const h=tiles[i];if(!rows.has(h[axis]))rows.set(h[axis],[]);rows.get(h[axis]).push(i);if((++examined&255)===0)yield;}
        for(const row of rows.values()){
            yield;
            row.sort((a,b)=>tiles[a][other]-tiles[b][other]);let run=[];
            const consider=()=>{
                if(run.length<=6)return;
                const a=tiles[run[0]],b=tiles[run[run.length-1]],d=axis==='q'?{q:0,r:1}:{q:1,r:0};
                const sides=[wodAiCorridorEdge(owner,a,{q:-d.q,r:-d.r},explored),wodAiCorridorEdge(owner,b,d,explored)];
                if(sides.includes(0)||!sides.includes(1)||run.some(i=>roots.includes(i)))return;
                const gates=[a,b].filter((h,i)=>sides[i]===1);
                const traffic=run.reduce((n,i)=>n+load[i],0);if(traffic<1)return;
                const pressure=enemies.filter(e=>gates.some(g=>Math.hypot(e.x-g.x,e.y-g.y)<hr*10&&wodAiCanReach(e,g)));
                if(!pressure.length)return;
                const distance=Math.min(...pressure.flatMap(e=>gates.map(g=>Math.hypot(e.x-g.x,e.y-g.y))));
                candidates.push({keys:run.slice(),gates,pressure,score:(distance+run.length*hr*.08)/(1+Math.sqrt(traffic)*.1)});
            };
            for(const i of row){if(run.length&&!edges[run[run.length-1]].includes(i)){consider();run=[];}run.push(i);}consider();
        }
    }
    candidates.sort((a,b)=>a.score-b.score);
    const tested=[],blockedTags=new Uint16Array(tiles.length),safeTags=new Uint16Array(tiles.length),queue=new Int32Array(tiles.length);let floods=0;
    for(const candidate of candidates){
        yield;
        // Spread the bounded graph floods between different flanking axes.
        if(tested.some(p=>candidate.gates.every(g=>p.some(h=>Math.hypot(h.x-g.x,h.y-g.y)<hr*3))))continue;
        tested.push(candidate.gates);if(floods++>=10)break;
        const stamp=floods;let head=0,tail=0;
        for(const i of candidate.keys)blockedTags[i]=stamp;
        for(const i of roots){safeTags[i]=stamp;queue[tail++]=i;}
        while(head<tail){for(const j of edges[queue[head++]])if(blockedTags[j]!==stamp&&safeTags[j]!==stamp){safeTags[j]=stamp;queue[tail++]=j;}if((head&255)===0)yield;}
        let troops=0,area=0,depth=0;const riskTileKeys=[];
        const neckDepth=Math.min(...candidate.keys.map(i=>supplyDepth.get(i)??0));
        for(const i of supplied)if(blockedTags[i]!==stamp&&safeTags[i]!==stamp){
            troops+=weights[i];area++;
            if(weights[i]){riskTileKeys.push(getHexKey(tiles[i]));depth=Math.max(depth,(supplyDepth.get(i)||0)-neckDepth);}
        }
        if(troops<1||area<candidate.keys.length*2)continue;
        const speed=e=>Math.max(1,(e.speed||15)*WOD_MOVE_SPEED_FACTOR*.8);
        const closureSeconds=Math.max(...candidate.keys.map(i=>Math.min(...candidate.pressure.map(e=>
            Math.max(0,Math.hypot(e.x-tiles[i].x,e.y-tiles[i].y)-hr*(e.type==='heavy'?2:1))/speed(e)))))+2;
        const withdrawSeconds=wodAiCorridorEvacSeconds(owner,riskTileKeys,index,supplyDepth,neckDepth);
        const center=candidate.keys[Math.floor(candidate.keys.length/2)];
        result.push({i:center,troops,area,keys:candidate.keys,screenIndices:candidate.gates.map(g=>index.get(getHexKey(g))),riskTileKeys,predictive:true,wide:true,closureSeconds,withdrawSeconds});
    }
    return result;
}

function wodAiCorridorEvacSeconds(owner,riskTileKeys,index,supplyDepth,neckDepth) {
    const risk=new Set(riskTileKeys),hr=gameData.hexRadius||20;let longest=0;
    for(const u of gameData.entities){
        if(u.owner!==owner||u.hp<=0||u.boardTransportUid||u.type==='marine'||!isLandArmyUnit(u))continue;
        const h=getNearestHexToPoint(u.x,u.y),key=h&&getHexKey(h);if(!risk.has(key))continue;
        const distance=Math.max(0,(supplyDepth.get(index.get(key))||0)-neckDepth)*hr*1.35;
        const speed=Math.max(.5,(u.speed||12)*WOD_MOVE_SPEED_FACTOR*getUnitSpeedMultiplier(u,h)*.75);
        longest=Math.max(longest,distance/speed);
    }
    return longest;
}

// An observed invading group remains one task as its contact point moves.
// Changing a tile ID every scan used to cancel whole marches every 2.5 seconds.
function wodAiTerritoryThreat(owner,cluster,previous,used) {
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),contacts=cluster.contacts||[];
    const candidates=(previous?.hexes===gameData.hexes?previous.jobs:[]).filter(j=>j.kind==='territory'&&!used.has(j.id)&&
        Math.hypot(j.holdHex.x-cluster.x,j.holdHex.y-cluster.y)<hr*(j.contacts?.some(id=>contacts.includes(id))?14:4));
    candidates.sort((a,b)=>Number(!a.contacts?.some(id=>contacts.includes(id)))-Number(!b.contacts?.some(id=>contacts.includes(id)))||
        Math.hypot(a.holdHex.x-cluster.x,a.holdHex.y-cluster.y)-Math.hypot(b.holdHex.x-cluster.x,b.holdHex.y-cluster.y));
    const old=candidates[0];
    const fresh=cluster.near.slice().sort((a,b)=>wodAiDist2(a.x,a.y,cluster.x,cluster.y)-wodAiDist2(b.x,b.y,cluster.x,cluster.y))[0];
    const stable=old?.holdHex&&wodIsFriendlyOwner(old.holdHex.owner,owner)&&wodCurrentSupplyComponent(old.holdHex,owner).city&&
        Math.hypot(old.holdHex.x-cluster.x,old.holdHex.y-cluster.y)<hr*6&&now-(old.anchorAt??previous.at)<12000;
    const holdHex=stable?old.holdHex:fresh;if(!holdHex)return null;
    let id=old?.id||'territory-'+getHexKey(holdHex);if(used.has(id))id+=':'+String(contacts[0]||used.size);used.add(id);
    return {id,kind:'territory',role:'fix',coverageRequired:true,holdHex,contacts,contactPoint:{x:cluster.x,y:cluster.y},
        anchorAt:stable?(old.anchorAt??previous.at):now,responseState:old?.responseState,_formationSlots:old?._formationSlots,_pursuit:old?._pursuit,
        enemies:cluster.count,score:100+cluster.count*12};
}

// A wide cut's representative cell may be far from the entrance we actually
// defend. Compare every entrance, so nested warnings do not reserve two armies
// for the same gate, and distant wings of a real pincer remain separate.
function wodAiSelectDefenseThreats(threats) {
    const hr=gameData.hexRadius||20,selected=[];
    const entrances=t=>t.screenPoints?.length?t.screenPoints:[t.holdHex];
    const covered=(a,b)=>a.every(p=>b.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<hr*5));
    for(const t of threats){
        if(t.kind==='counter'||t.kind==='relief'){selected.push(t);continue;}
        // One town battle must not also requisition several separate corridor
        // screens against the very same attackers. Keep the cut warning for
        // escape safety, but let the nearby town response provide its screen.
        const townCover=t.kind==='corridor'&&selected.find(s=>s.kind==='counter'&&s.city&&wodIsFriendlyOwner(s.city.owner,t.holdHex?.owner)&&
            entrances(t).every(p=>Math.hypot(p.x-s.city.x,p.y-s.city.y)<hr*7)&&
            wodAiThreats(s.city.owner).filter(e=>entrances(t).some(p=>Math.hypot(e.x-p.x,e.y-p.y)<hr*8)).every(e=>s.enemyIds?.includes(e.uid)));
        if(townCover){t._screenResponse=townCover;continue;}
        const duplicate=t.kind==='corridor'&&selected.find(s=>{
            if(s.kind!=='corridor'||!t.riskUnits?.size||!s.riskUnits?.size)return false;
            const a=entrances(t),b=entrances(s);
            return [...t.riskUnits].every(id=>s.riskUnits.has(id))&&covered(a,b)&&covered(b,a);
        });
        if(duplicate)t._screenResponse=duplicate;else selected.push(t);
    }
    return selected;
}

// Reserve a nearby screen for each reachable threat before a large battle can
// spend the entire defense budget. Later reinforcement still favors urgency.
function wodAiDefenseFrontAvailable(unit,threat,plan) {
    const base=plan?.jobs.find(j=>j.id===plan.unitJob[unit.uid]);
    // An offensive owns its roster until an actual emergency requires a loan.
    // Ordinary border screens are filled from guards, reserves and recruits.
    if(!wodAiFrontCritical(threat,unit)&&!['hold','reserve','support'].includes(base?.kind)&&wodAiActiveFrontOperations(unit.owner).some(op=>op.members.includes(unit.uid)))return false;
    // Real town relief and breakout orders retain emergency authority. Routine
    // screens use their own front, rather than recalling a different invasion.
    if(threat.kind==='counter'||threat.kind==='relief')return true;
    const front=wodAiFrontOwner(unit)||base?.frontOwner;
    if(!front)return true;
    const hr=gameData.hexRadius||20,gates=threat.screenPoints||[threat.holdHex];
    const distance=Math.min(...gates.map(p=>Math.hypot(unit.x-p.x,unit.y-p.y)));
    if(distance<hr*7)return true;
    if(!threat._borrowFronts){
        const contacts=wodAiThreats(unit.owner).filter(e=>threat.contacts?.includes(e.uid)||gates.some(p=>Math.hypot(e.x-p.x,e.y-p.y)<hr*8));
        threat._borrowFronts=new Set(threat.frontOwner?[threat.frontOwner]:contacts.map(e=>e.owner));
    }
    if(threat._borrowFronts.has(front))return true;
    // A fast, substantial cut can justify crossing theaters when this unit can
    // actually arrive before closure; an ordinary prediction cannot.
    return threat.kind==='corridor'&&threat.atRisk>=4&&threat.closureSeconds<30&&
        gates.some(p=>wodAiArrivalSeconds(unit,p,hr*3,Math.max(5,threat.closureSeconds+3))<=Math.max(5,threat.closureSeconds+3));
}

function* wodAiReserveDefenseScreens(owner,threats,available,plan,budget,previous) {
    const hr=gameData.hexRadius||20,byUnit=new Map(),counts=new Map();
    const base=u=>plan?.jobs.find(j=>j.id===plan.unitJob[u.uid]);
    const pool=available.filter(u=>u.type!=='marine'&&!u.boardTransportUid&&!base(u)?.city&&!base(u)?.fort);
    const quota=Math.min(3,Math.max(1,Math.floor(budget/Math.max(1,threats.length))));
    const reserve=t=>{
        if(byUnit.size>=budget)return null;
        const gates=t.screenPoints||[t.holdHex],critical=['counter','corridor','relief'].includes(t.kind);
        const distance=u=>Math.min(...gates.map(p=>Math.hypot(p.x-u.x,p.y-u.y)));
        const candidates=pool.filter(u=>!byUnit.has(u.uid)&&wodAiDefenseFrontAvailable(u,t,plan)&&wodAiDefenseLeaseAllows(u,t,threats,previous)&&!t.pocketKeys?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))&&
            (critical||base(u)?.kind!=='scout')&&distance(u)<hr*(critical?60:24)&&wodAiResponseCanArrive(u,t,distance(u)));
        const routine=t.kind==='territory'||t.kind==='corridor'&&t.predictive&&t.closureSeconds>60;
        const score=u=>distance(u)**2/Math.max(.5,wodAiUnitCombatPower(u))+(routine&&['main','armor','raid'].includes(base(u)?.kind)?hr*hr*80:0)+(previous?.unitJob[u.uid]===t.id?-hr*hr*20:0)+
            (t.kind==='corridor'&&t.riskUnits?.has(u.uid)?hr*hr*60:0);
        candidates.sort((a,b)=>score(a)-score(b));
        const deadline=t.kind==='corridor'?Math.min(75,Math.max(8,t.closureSeconds||35)):null;
        const u=candidates.slice(0,8).find(u=>gates.some(g=>wodAiCanReach(u,g)&&
            (deadline==null||wodAiArrivalSeconds(u,g,hr*3,deadline)<=deadline)));
        if(u){byUnit.set(u.uid,t.id);counts.set(t.id,(counts.get(t.id)||0)+1);}
        return u;
    };
    // Reserve still-needed screens before a new scan redistributes the same
    // soldiers. Holding a gate successfully must not immediately recall its
    // defenders, make the gate unsafe, and trigger the same loan next pulse.
    for(const u of pool){
        const id=previous?.unitJob?.[u.uid]||u._aiDefenseLease?.id,t=id&&threats.find(t=>t.id===id);
        if(!t||byUnit.size>=budget||!wodAiDefenseFrontAvailable(u,t,plan)||!wodAiDefenseLeaseAllows(u,t,threats,previous)||
            !wodAiResponseCanArrive(u,t,Math.hypot(u.x-t.holdHex.x,u.y-t.holdHex.y)))continue;
        if(threats.some(other=>other!==t&&wodAiDefensePriority(u,other)>wodAiDefensePriority(u,t)&&wodAiFrontCritical(other,u)))continue;
        const cap=t.kind==='counter'?Math.min(8,Math.max(2,Math.ceil(t.neededPower||2))):t.kind==='relief'?6:3;
        if((counts.get(t.id)||0)>=cap)continue;
        byUnit.set(u.uid,t.id);counts.set(t.id,(counts.get(t.id)||0)+1);
    }
    // An actual town assault needs viable relief before routine approach
    // screens reserve the remainder. Multiple towns share this priority.
    const counters=threats.filter(t=>t.kind==='counter'),cap=Math.min(8,Math.max(2,Math.floor(budget/Math.max(1,counters.length))));
    for(const t of counters){let power=0;for(let i=0;i<cap&&power<(t.neededPower||1)*.95;i++){
        yield;const u=reserve(t);if(!u)break;power+=wodAiUnitCombatPower(u);
    }}
    for(let round=0;round<quota;round++)for(const t of threats){
        yield;
        if((counts.get(t.id)||0)>round)continue;
        reserve(t);
    }
    return {byUnit,counts};
}

// A moving threat can shift the tested supply cross-section by one tile. It
// is still the same defense. Preserve its roster preference and wing choices
// instead of sending the same guards back and forth between fresh tile IDs.
function wodAiStabilizeCorridorJobs(selected,previous) {
    if(previous?.hexes!==gameData.hexes)return;
    const hr=gameData.hexRadius||20,used=new Set();
    for(const threat of selected.filter(t=>t.kind==='corridor')){
        const candidates=previous.jobs.filter(j=>j.kind==='corridor'&&!used.has(j.id)).map(job=>{
            const distance=Math.hypot(job.holdHex.x-threat.holdHex.x,job.holdHex.y-threat.holdHex.y);
            const overlap=[...(threat.riskUnits||[])].filter(id=>job.riskUnits?.has(id)).length;
            const share=overlap/Math.max(1,Math.min(threat.riskUnits?.size||0,job.riskUnits?.size||0));
            return{job,distance,share};
        }).filter(c=>c.distance<hr*5&&(c.share>=.5||c.job.id===threat.id)).sort((a,b)=>b.share-a.share||a.distance-b.distance);
        const old=candidates[0]?.job;
        if(!old){if(used.has(threat.id))threat.id+='-shift-'+getHexKey(threat.holdHex);used.add(threat.id);continue;}
        used.add(old.id);
        threat.id=old.id;threat._gateAssignments=old._gateAssignments&&{...old._gateAssignments};
        const gates=threat.screenPoints||[threat.holdHex],prior=old.screenPoints||[old.holdHex];
        if(gates.length!==prior.length)threat._gateAssignments=null;
        if(gates.length===2&&prior.length===2&&threat._gateAssignments&&
            Math.hypot(gates[1].x-prior[0].x,gates[1].y-prior[0].y)<Math.hypot(gates[0].x-prior[0].x,gates[0].y-prior[0].y))
            for(const id of Object.keys(threat._gateAssignments))threat._gateAssignments[id]=1-threat._gateAssignments[id];
        threat._corridorTargets=old._corridorTargets;
    }
}

function wodAiIssueTerritoryResponse(unit,job) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const members=gameData.entities.filter(u=>job.members.includes(u.uid)&&u.hp>u.maxHp*.4&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken);
    const foes=wodAiThreats(unit.owner,false).filter(e=>job.contacts?.includes(e.uid)||Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*7);
    if(!foes.length)return false;
    let goal=getNearestHexToPoint(job.contactPoint?.x??foes[0].x,job.contactPoint?.y??foes[0].y);
    if(!goal)return false;
    if(isWaterHex(goal))goal=job.holdHex;
    if(job.responseCheckedAt==null||now-job.responseCheckedAt>=900){
        // Troops from adjacent formations and real coastal fire support still
        // fight this battle. Counting only the response roster made a superior
        // front wait while the same nearby friendly tanks were ignored.
        const gathered=gameData.entities.filter(u=>u.owner===unit.owner&&u.hp>u.maxHp*.4&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u.boardTransportUid&&
            u.damage>0&&Math.hypot(u.x-goal.x,u.y-goal.y)<hr*9&&wodAiArrivalSeconds(u,goal,u.range||50,12)<=12);
        job.responseCheckedAt=now;job.responseGathered=gathered.length;job.responseBalance=wodAiForecast(unit.owner,gathered,foes);
    }
    const balance=job.responseBalance,gatheredN=job.responseGathered;
    let state=job.responseState;
    const ready=gatheredN>=Math.min(members.length,foes.length>1?2:1)&&balance.ratio>=wodAiCommander(unit.owner).ratio;
    const attack=ready||!!(state?.attack&&now-state.at<8000&&balance.ratio>=1);
    if(!state||state.attack!==attack)state=job.responseState={attack,at:now};
    const here=getNearestHexToPoint(unit.x,unit.y),firing=foes.some(e=>Math.hypot(e.x-unit.x,e.y-unit.y)<(unit.range||50)*1.05);
    const target=attack?wodAiAdvanceHex(unit,goal,members):firing&&here&&wodIsFriendlyOwner(here.owner,unit.owner)?here:wodAiFormationSlot(unit,job,job.holdHex,goal,members);
    if(!target)return false;
    const moved=wodAiMoveUnitTowardHex(unit,target,!attack,.1);
    if(moved){wodAiStampOrder(unit,!attack,target,attack?6500:4000);wodAiRecord(unit.owner,'territory-response',{job:job.id,attack,troops:gatheredN,ratio:Math.round(balance.ratio*100)/100});}
    return true;
}

function wodAiDefenseTheater(owner,selected,army,plan) {
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20,towns=gameData.cities.filter(c=>c.owner===owner);
    const base=u=>plan?.jobs.find(j=>j.id===plan.unitJob[u.uid]);
    const candidates=army.filter(u=>!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!wodIsNavalUnit(u)&&!base(u)?.city&&!base(u)?.fort);
    for(const t of selected.filter(t=>t.kind==='counter')){
        const foes=wodAiThreats(owner,false).filter(e=>t.enemyIds.includes(e.uid));
        const contact=foes.length?Math.min(...foes.map(e=>Math.max(0,Math.hypot(e.x-t.city.x,e.y-t.city.y)-(e.range||50))/Math.max(1,e.speed*WOD_MOVE_SPEED_FACTOR))):0;
        t.deadline=Math.max(14,contact+20);t.arrivals={};
        const nearest=candidates.slice().sort((a,b)=>Number(!!wodAiFrontOwner(a)&&wodAiFrontOwner(a)!==t.frontOwner)-Number(!!wodAiFrontOwner(b)&&wodAiFrontOwner(b)!==t.frontOwner)||Math.hypot(a.x-t.holdHex.x,a.y-t.holdHex.y)-Math.hypot(b.x-t.holdHex.x,b.y-t.holdHex.y)).slice(0,24);
        for(const u of nearest)t.arrivals[u.uid]=wodAiArrivalSeconds(u,t.holdHex,hr*3,Math.max(45,t.deadline));
        const timely=nearest.filter(u=>t.arrivals[u.uid]<=t.deadline),power=timely.reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
        t.feasible=power>=t.neededPower*.9;t.reliefPower=power;t.timelyIds=timely.map(u=>u.uid);
        t.theaterScore=(towns.length===1?400:0)+(t.feasible?240:0)+Math.min(120,t.enemies*15)+200/(1+contact/10)+Number(!!t.city.hasFactory)*35;
    }
    const counters=selected.filter(t=>t.kind==='counter').sort((a,b)=>b.theaterScore-a.theaterScore);
    const prior=plan?.defenseTheater,keep=counters.find(t=>t.id===prior?.id&&t.feasible);
    const primary=keep&&now-prior.at<12000&&keep.theaterScore+90>=counters[0]?.theaterScore?keep:counters[0];
    if(!primary)return null;
    if(plan){if(prior?.id!==primary.id)wodAiRecord(owner,'defense-theater',{job:primary.id,feasible:primary.feasible,seconds:Math.round(primary.deadline),power:primary.reliefPower});plan.defenseTheater={id:primary.id,at:prior?.id===primary.id?prior.at:now};}
    primary.primaryTheater=true;
    const theaters=[primary];
    for(const t of counters)if(t!==primary&&t.feasible&&!theaters.some(p=>Math.hypot(p.city.x-t.city.x,p.city.y-t.city.y)<hr*12||(!t.frontOwner||t.frontOwner===p.frontOwner)&&(t.timelyIds||[]).filter(id=>p.timelyIds?.includes(id)).length>Math.min(t.timelyIds?.length||0,p.timelyIds?.length||0)*.4)){t.primaryTheater=true;theaters.push(t);}
    selected.sort((a,b)=>Number(!!b.primaryTheater)-Number(!!a.primaryTheater)||b.score-a.score);
    return primary;
}

function wodAiCorridorCaptureThreats(owner,cut) {
    const stamp=Math.floor(wodAiOperationTime()/900),hr=gameData.hexRadius||20;
    if(cut._captureThreatStamp===stamp)return cut._captureThreats;
    const gates=cut.screenPoints||[cut.holdHex],horizon=Math.min(45,Math.max(12,(cut.withdrawSeconds||20)*1.1+5));
    const foes=wodAiThreats(owner).filter(e=>e.hp>0&&!wodIsNavalUnit(e)&&e.type!=='convoy'&&
        (!e._intelMemory||e._intelConfidence>=.4)&&gates.some(g=>g&&Math.hypot(e.x-g.x,e.y-g.y)<hr*10&&
            wodAiCanReach(e,g)&&wodAiArrivalSeconds(e,g,hr*.6,horizon)<=horizon));
    cut._captureThreatStamp=stamp;cut._captureThreats=foes;return foes;
}

function wodAiCorridorHoldRatio(owner,cut,defense=gameData._aiDefenseByOwner?.[owner]) {
    const hr=gameData.hexRadius||20,gates=cut.screenPoints||[cut.holdHex],known=wodAiThreats(owner);
    const threats=wodAiCorridorCaptureThreats(owner,cut);
    const stamp=Math.floor(wodAiOperationTime()/900);
    if(cut._holdStamp!==stamp){
        cut._holdStamp=stamp;
        const horizon=cut.predictive?Math.min(18,Math.max(3,cut.closureSeconds||12)):10;
        const ratios=gates.flatMap(gate=>{
            const foes=threats.filter(e=>Math.hypot(e.x-gate.x,e.y-gate.y)<hr*8);
            if(!foes.length)return [];
            const help=gameData.entities.filter(u=>u.owner===owner&&!u.boardTransportUid&&!wodIsNavalUnit(u)&&u.type!=='convoy'&&
                u.hp>u.maxHp*.55&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&Math.hypot(u.x-gate.x,u.y-gate.y)<hr*12&&
                // A reserve beyond the opposite wing cannot cover both ends.
                gates.every(p=>p===gate||Math.hypot(u.x-gate.x,u.y-gate.y)<=Math.hypot(u.x-p.x,u.y-p.y)||Math.hypot(p.x-gate.x,p.y-gate.y)<(u.range||50)*1.5)&&
                // Nearby ready troops can hold a neck before the enemy
                // enters firing range. Requiring an existing corridor job
                // or an active shot recalled already protected offensives.
                (defense?.unitJob?.[u.uid]===(cut.responseId||cut.id)||Math.hypot(u.x-gate.x,u.y-gate.y)<(u.range||50)+hr*2)&&
                wodAiArrivalSeconds(u,gate,u.range||50,horizon)<=horizon);
            return [help.length?wodAiForecast(owner,help,foes).ratio:0];
        });
        cut._holdRatio=ratios.length?Math.min(...ratios):Infinity;
    }
    return cut._holdRatio;
}

function wodAiCorridorWithdrawal(unit) {
    const defense=gameData._aiDefenseByOwner?.[unit.owner];
    if(!defense||defense.hexes!==gameData.hexes)return null;
    const hr=gameData.hexRadius||20,withdrawals=gameData._aiSupplyWithdrawals||=(new WeakMap());
    let pending=withdrawals.get(unit);
    const current=defense.supplyDistance?.get(getHexKey(getNearestHexToPoint(unit.x,unit.y)));
    if(pending&&(pending.hexes!==gameData.hexes||current<=pending.safeDepth)){withdrawals.delete(unit);pending=null;}
    for(const cut of defense.corridors||[]){
        if(!cut.riskUnits?.has(unit.uid))continue;
        const threats=wodAiCorridorCaptureThreats(unit.owner,cut);
        wodAiCorridorHoldRatio(unit.owner,cut,defense);
        // A fast hypothetical closure is not a forced retreat when a real,
        // timely force can hold the neck. The defense response screens it while
        // the main attack continues; distant reserves never count as protection.
        const urgent=wodAiCorridorUrgent(cut);
        if(threats.length&&urgent&&cut._holdRatio<(cut.predictive?1.15:1.05)){
            const safeDepth=Math.max(0,Math.min(...(cut.cutHexes||[cut.holdHex]).map(h=>defense.supplyDistance?.get(getHexKey(h))??0))-2);
            withdrawals.set(unit,{hexes:gameData.hexes,cut,safeDepth});return cut;
        }
        // A shrinking endangered roster can lower the next warning's urgency
        // before the last regiment is physically through the neck. Finish its
        // established evacuation unless the threat leaves or real cover arrives.
        if(pending?.cut.id===cut.id&&(!threats.length||cut._holdRatio>=(cut.predictive?1.15:1.05))){withdrawals.delete(unit);pending=null;}
    }
    // The last tank must finish leaving even after the infantry have cleared
    // the cut and the two-unit strategic warning has disappeared.
    if(pending&&wodAiCorridorCaptureThreats(unit.owner,pending.cut).length)return pending.cut;
    withdrawals.delete(unit);
    return null;
}

function wodAiSupplyRetreatHop(unit,defense) {
    let at=getNearestHexToPoint(unit.x,unit.y),best=null;
    const distance=h=>defense?.supplyDistance?.get(getHexKey(h))??Infinity,hr=gameData.hexRadius||20;
    if(!at||!Number.isFinite(distance(at)))return null;
    for(let step=0;step<6;step++){
        const choices=[];wodSupplyNeighbors(at,h=>{if(distance(h)<distance(at)&&canUnitEnterHex(unit,h)&&wodCanStepBetweenHexes(unit,at,h,true))choices.push(h);});
        choices.sort((a,b)=>distance(a)-distance(b));const next=choices[0];if(!next)break;
        // A shortest dry route may cut across the hostile corner of a salient.
        // Advance only as far as the direct chord stays on supplied terrain.
        let safe=true;const n=Math.max(1,Math.ceil(Math.hypot(next.x-unit.x,next.y-unit.y)/(hr*.45)));
        for(let i=1;i<=n;i++){const h=getNearestHexToPoint(unit.x+(next.x-unit.x)*i/n,unit.y+(next.y-unit.y)*i/n);if(!h||!wodSupplyPassable(h,unit.owner)||!canUnitEnterHex(unit,h)){safe=false;break;}}
        if(!safe)break;best=next;at=next;
    }
    return best;
}

function wodAiTownDefenseThreats(owner,army) {
    const hr=gameData.hexRadius||20,foes=wodAiThreats(owner,false).filter(e=>isLandArmyUnit(e)||e.type==='marine');
    let cache=gameData._aiTownApproaches;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiTownApproaches={hexes:gameData.hexes,owners:{}};
    const previous=cache.owners[owner]||{},now=wodAiOperationTime(),towns=gameData.cities.filter(c=>c.owner===owner),assignments=new Map();
    // One observed regiment threatens one town approach at a time. Counting a
    // force between two towns twice split relief into two losing responses.
    for(const enemy of foes){
        const choices=towns.filter(c=>Math.hypot(enemy.x-c.x,enemy.y-c.y)<hr*14&&wodAiCanReach(enemy,c))
            .sort((a,b)=>Math.hypot(enemy.x-a.x,enemy.y-a.y)-Math.hypot(enemy.x-b.x,enemy.y-b.y));
        let city=choices[0],old=choices.find(c=>c.id===previous[enemy.uid]?.town);
        if(old&&city&&Math.hypot(enemy.x-old.x,enemy.y-old.y)<Math.hypot(enemy.x-city.x,enemy.y-city.y)+hr*2)city=old;
        if(city)assignments.set(enemy.uid,city.id);
    }
    const result=towns.flatMap(city=>{
        const enemies=foes.filter(e=>{
            if(assignments.get(e.uid)!==city.id)return false;
            const distance=Math.hypot(e.x-city.x,e.y-city.y),old=previous[e.uid];
            const approaching=old&&now>old.at&&Math.hypot(old.x-city.x,old.y-city.y)-distance>hr*.25;
            return distance<hr*14&&(distance<hr*9||approaching)&&wodAiCanReach(e,city);
        });
        if(!enemies.length)return [];
        const power=enemies.reduce((n,e)=>n+wodAiUnitCombatPower(e),0);
        const plan=gameData.aiTaskForces?.[owner],guards=new Set(plan?.jobs.filter(j=>j.kind==='defend'&&j.city?.id===city.id).flatMap(j=>j.members)||[]);
        if(!guards.size){const guard=army.filter(u=>u.type==='light'&&Math.hypot(u.x-city.x,u.y-city.y)<hr*3).sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y))[0];if(guard)guards.add(guard.uid);}
        const garrisonPower=army.filter(u=>guards.has(u.uid)&&u.hp>0&&!u._medicalRecovering&&!u.retreating&&Math.hypot(u.x-city.x,u.y-city.y)<hr*4)
            .reduce((n,u)=>n+wodAiUnitCombatPower(u),0);
        const reinforcementPower=Math.max(0,power*1.2-garrisonPower);
        if(reinforcementPower<.3)return [];
        return [{id:'town-relief-'+city.id,kind:'counter',role:'counter',city,holdHex:getNearestHexToPoint(city.x,city.y),
            frontOwner:enemies.slice().sort((a,b)=>enemies.filter(e=>e.owner===b.owner).length-enemies.filter(e=>e.owner===a.owner).length)[0]?.owner,enemies:enemies.length,enemyIds:enemies.map(e=>e.uid),score:850+power*25,neededPower:reinforcementPower,contactAt:now}];
    });
    // A short break in the approach detector is not a new strategic order.
    // Finish gathering the same relief force while the observed enemy remains
    // near town; release immediately after destruction or a real withdrawal.
    for(const job of gameData._aiDefenseByOwner?.[owner]?.jobs||[]){
        const recapture=job.city&&wodIsHostileOwner(job.city.owner,owner)&&wodAiKnownCities(owner).some(c=>c.id===job.city.id&&c.owner===job.city.owner);
        if(job.kind!=='counter'||job.city?.owner!==owner&&!recapture||result.some(t=>t.id===job.id)||now-(job.contactAt??-Infinity)>(recapture?30000:10000))continue;
        const contacts=foes.filter(e=>job.enemyIds.includes(e.uid)&&(recapture||assignments.get(e.uid)===job.city.id)&&Math.hypot(e.x-job.city.x,e.y-job.city.y)<hr*14);
        if(contacts.length||recapture)result.push({...job,recapture,frontOwner:recapture?job.city.owner:job.frontOwner,primaryTheater:false,enemyIds:contacts.map(e=>e.uid),enemies:contacts.length});
    }
    cache.owners[owner]=Object.fromEntries(foes.map(e=>[e.uid,{x:e.x,y:e.y,at:now,town:assignments.get(e.uid)}]));
    return result;
}

function wodAiResponseCanArrive(unit,threat,distance) {
    const hr=gameData.hexRadius||20;
    if(threat.kind==='relief')return true;
    const eta=Math.max(0,distance-hr*3)/Math.max(1,(unit.speed||WOD_UNIT_BASE_SPEED)*WOD_MOVE_SPEED_FACTOR);
    if(threat.kind==='counter'){
        const actual=threat.arrivals?.[unit.uid]??eta;
        return actual<=Math.max(45,(threat.deadline||25)+(threat.primaryTheater?15:0));
    }
    if(threat.kind==='corridor')return eta<=Math.min(75,Math.max(20,threat.closureSeconds||35)+10);
    return eta<=45;
}

// One response line and commitment for the group. Local evasive orders cannot
// keep peeling away the troops needed to clear a town's production approaches.
function wodAiIssueTownDefense(unit,job) {
    if(job.kind!=='counter')return false;
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),owner=unit.owner;
    if(job.recapture&&wodIsHostileOwner(job.city?.owner,owner)){
        const members=gameData.entities.filter(u=>job.members.includes(u.uid)&&u.hp>u.maxHp*.4&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken),foes=wodAiThreats(owner,false).filter(e=>Math.hypot(e.x-job.city.x,e.y-job.city.y)<hr*6);
        if(wodAiForecast(owner,members,foes).ratio>=1.02){const target=wodAiTownAssaultHex(unit,job.city,members);if(target&&wodAiMoveUnitTowardHex(unit,target,false,.1))wodAiStampOrder(unit,false,target,4000);return true;}
    }
    let cache=gameData._aiDefensiveManeuvers;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiDefensiveManeuvers={hexes:gameData.hexes,byId:{}};
    let state=cache.byId[job.id];
    if(!state||now-state.at>=1800){
        const army=gameData.entities.filter(u=>u.owner===owner&&u.hp>u.maxHp*.34&&!u.boardTransportUid&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!wodIsNavalUnit(u)&&u.type!=='convoy');
        const members=army.filter(u=>job.members.includes(u.uid)||u.type==='light'&&Math.hypot(u.x-job.city.x,u.y-job.city.y)<hr*4);
        const foes=wodAiThreats(owner,false).filter(e=>job.enemyIds.includes(e.uid));
        if(!members.length||!foes.length)return false;
        const cx=members.reduce((n,u)=>n+u.x,0)/members.length,cy=members.reduce((n,u)=>n+u.y,0)/members.length;
        const ex=foes.reduce((n,u)=>n+u.x,0)/foes.length,ey=foes.reduce((n,u)=>n+u.y,0)/foes.length;
        const lead=members.find(u=>!wodCanClimb(u))||members[0],reach=wodAiOperationReach(lead);
        let anchor=state?.anchor;
        if(!anchor||anchor.owner!==owner||now-(state.anchorAt||0)>10000||foes.some(e=>Math.hypot(e.x-anchor.x,e.y-anchor.y)<hr*2)){
            const points=getHexesInRadius(job.city.q,job.city.r,6).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&h.owner===owner&&!isWaterHex(h)&&reach.has(getHexKey(h))&&canUnitEnterHex(lead,h)&&wodCurrentSupplyComponent(h,owner).city);
            const dx=ex-job.city.x,dy=ey-job.city.y,len=Math.hypot(dx,dy)||1,depth=Math.min(hr*3,len*.4);
            const intercept={x:job.city.x+dx/len*depth,y:job.city.y+dy/len*depth};
            const cityCells=getCityUrbanTerrainHexes(job.city),underAttack=foes.some(e=>cityCells.some(h=>Math.hypot(e.x-h.x,e.y-h.y)<=(e.range||50)+hr*2));
            const score=h=>Math.hypot(h.x-cx,h.y-cy)*.2+Math.hypot(h.x-intercept.x,h.y-intercept.y)*1.2+
                foes.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*2-Math.hypot(e.x-h.x,e.y-h.y))*3,0)-
                (underAttack&&cityCells.includes(h)?hr*14:0)-
                (1-getTerrainDefenseModifier(lead,h))*hr*4;
            points.sort((a,b)=>score(a)-score(b));anchor=points[0]||job.holdHex;
        }
        const balance=wodAiForecast(owner,members,foes),gathered=members.filter(u=>Math.hypot(u.x-anchor.x,u.y-anchor.y)<hr*6);
        const localBalance=wodAiForecast(owner,gathered,foes.filter(e=>Math.hypot(e.x-anchor.x,e.y-anchor.y)<hr*10));
        const close=foes.some(e=>Math.hypot(e.x-job.city.x,e.y-job.city.y)<hr*9);
        // Nearby defenders can clear a weak assault while reinforcements are
        // still marching. Distant roster members neither authorize an attack
        // nor increase the quorum required by the troops already in position.
        const attack=close&&(state?.attack?localBalance.ratio>=.88:
            localBalance.ratio>=1.08&&gathered.length>=Math.min(2,members.length));
        const fx=ex-anchor.x,fy=ey-anchor.y;
        const ordered=members.slice().sort((a,b)=>(a.x-anchor.x)*-fy+(a.y-anchor.y)*fx-((b.x-anchor.x)*-fy+(b.y-anchor.y)*fx));
        state=cache.byId[job.id]={at:now,anchor,anchorAt:anchor===state?.anchor?state.anchorAt:now,members:ordered.map(u=>u.uid),foes,ex,ey,attack,ratio:balance.ratio,localRatio:localBalance.ratio,gathered:gathered.length};
        wodAiRecord(owner,'town-response',{job:job.id,phase:attack?'counterattack':'gather',troops:members.length,ratio:Math.round(balance.ratio*100)/100});
    }
    const rank=Math.max(0,state.members.indexOf(unit.uid)),n=Math.max(1,state.members.length),columns=Math.min(5,n),laneIndex=Math.min(columns-1,Math.floor(rank*columns/n));
    const column=(5-columns)/2+laneIndex,row=rank-Math.ceil(laneIndex*n/columns);
    let target=state.anchor;
    if(state.attack){
        const foe=state.foes.slice().sort((a,b)=>Math.hypot(unit.x-a.x,unit.y-a.y)-Math.hypot(unit.x-b.x,unit.y-b.y))[0];
        if(foe){const dx=state.anchor.x-foe.x,dy=state.anchor.y-foe.y,base=Math.atan2(dy,dx),angle=base-(column-2)*.5,range=(unit.range||50)*.8;
            const stand=getNearestHexToPoint(foe.x+Math.cos(angle)*range,foe.y+Math.sin(angle)*range);
            const points=getHexesInRadius(stand.q,stand.r,2).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&wodAiCanReach(unit,h));
            const used=state.targets||=( {} );
            const firing=points.some(h=>Math.hypot(h.x-foe.x,h.y-foe.y)<=(unit.range||50)*wodGeneralStatMultiplier(unit)*.98);
            const score=h=>(firing&&Math.hypot(h.x-foe.x,h.y-foe.y)>(unit.range||50)*wodGeneralStatMultiplier(unit)*.98?hr*100:0)+Math.hypot(h.x-stand.x,h.y-stand.y)+Math.abs(Math.hypot(h.x-foe.x,h.y-foe.y)-(unit.range||50)*.75)*2+
                getTerrainDefenseModifier(unit,h)*hr*5+
                Object.entries(used).filter(([id,p])=>id!==unit.uid&&Math.hypot(p.x-h.x,p.y-h.y)<(unit.radius||12)*2+8).length*hr*30;
            points.sort((a,b)=>score(a)-score(b));target=points[0]||stand;used[unit.uid]={x:target.x,y:target.y};
        }
    }else{
        const dx=state.ex-state.anchor.x,dy=state.ey-state.anchor.y,len=Math.hypot(dx,dy)||1,lane=(column-2)*hr*1.7;
        const slot=getNearestHexToPoint(state.anchor.x-dy/len*lane-dx/len*row*hr*2,state.anchor.y+dx/len*lane-dy/len*row*hr*2);
        if(slot?.owner===owner&&!isWaterHex(slot)&&canUnitEnterHex(unit,slot)&&wodAiCanReach(unit,slot))target=slot;
    }
    if(!target||!canUnitEnterHex(unit,target)||isWaterHex(target)||!wodAiCanReach(unit,target))target=state.anchor;
    if(unit.target&&unit._aiTownResponse?.id===job.id&&unit._aiTownResponse.phase===state.attack&&now-unit._aiTownResponse.at<5000&&
        Math.hypot(unit.x-unit._aiTownResponse.x,unit.y-unit._aiTownResponse.y)>hr*.35)return true;
    const moved=wodAiMoveUnitTowardHex(unit,target,!state.attack,.1);
    if(moved){unit._aiTownResponse={id:job.id,at:now,x:unit.x,y:unit.y,phase:state.attack};unit._aiRegroupUntil=0;wodAiStampOrder(unit,!state.attack,target,2500);}
    return true;
}

function wodAiReliefStandHex(unit,job,trapped) {
    const anchor=trapped?job.innerHex:job.holdHex,hr=gameData.hexRadius||20;
    if(!anchor)return null;
    const ids=(trapped?job.trapped:job.members.filter(id=>!job.trapped?.includes(id))).slice().sort();
    const rank=Math.max(0,ids.indexOf(unit.uid)),lane=rank%5-2;
    const dx=job.holdHex.x-job.innerHex.x,dy=job.holdHex.y-job.innerHex.y,len=Math.hypot(dx,dy)||1;
    const x=anchor.x-dy/len*lane*hr*1.35,y=anchor.y+dx/len*lane*hr*1.35;
    const reach=wodAiOperationReach(unit);
    const points=getHexesInRadius(anchor.q,anchor.r,3).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&reach.has(getHexKey(h))&&canUnitEnterHex(unit,h)&&(!isWaterHex(h)||isBridgeHex(h)));
    const used=job._reliefTargets||=( {} );
    points.sort((a,b)=>{
        const score=h=>wodAiDist2(h.x,h.y,x,y)+Math.abs((h.x-anchor.x)*dx+(h.y-anchor.y)*dy)/len*hr*4+
            Object.entries(used).filter(([id,key])=>id!==unit.uid&&key===getHexKey(h)).length*hr*hr*10;
        return score(a)-score(b);
    });
    const target=points[0]||anchor;used[unit.uid]=getHexKey(target);return target;
}

function wodAiCorridorStandHex(unit,job) {
    const cut=job.cutHexes,hr=gameData.hexRadius||20;
    if(!cut?.length)return wodAiDefendStandHex(unit.owner,job.holdHex,unit);
    const ids=job.members.slice().sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),rank=Math.max(0,ids.indexOf(unit.uid));
    const gates=job.screenPoints||[cut[0],cut[cut.length-1]];
    if(!job._gateAssignments){
        const members=gameData.entities.filter(u=>job.members.includes(u.uid)),foes=wodAiThreats(unit.owner);
        const needed=gates.map(g=>Math.max(1,foes.filter(e=>Math.hypot(e.x-g.x,e.y-g.y)<hr*8).reduce((n,e)=>n+wodAiUnitCombatPower(e),0)*1.2));
        const pairs=members.flatMap(u=>gates.map((g,i)=>({u,i,d:Math.hypot(u.x-g.x,u.y-g.y)}))).sort((a,b)=>a.d-b.d);
        const assigned=job._gateAssignments={};
        for(const {u,i} of pairs)if(assigned[u.uid]===undefined&&needed[i]>0){assigned[u.uid]=i;needed[i]-=wodAiUnitCombatPower(u);}
        for(const u of members)if(assigned[u.uid]===undefined)assigned[u.uid]=gates.map((g,i)=>({i,d:Math.hypot(g.x-u.x,g.y-u.y)})).sort((a,b)=>a.d-b.d)[0].i;
    }
    const gateIndex=job._gateAssignments[unit.uid]??rank%gates.length;
    const endpoint=gates[gateIndex],center=job.holdHex;
    const axis={x:cut[cut.length-1].x-cut[0].x,y:cut[cut.length-1].y-cut[0].y},length=Math.hypot(axis.x,axis.y)||1;
    const used=job._corridorTargets||=( {} ),points=[],reach=wodAiOperationReach(unit);
    for(const p of getHexesInRadius(endpoint.q,endpoint.r,4)){
        const h=gameData.hexes[p.q+','+p.r];if(!h||!reach.has(getHexKey(h))||!wodSupplyPassable(h,unit.owner)||!canUnitEnterHex(unit,h)||isWaterHex(h)&&!isBridgeHex(h))continue;
        // Guard the hostile-facing ends, leaving the middle of a wider passage
        // clear for retreating columns instead of stacking at its center.
        const inward=((h.x-endpoint.x)*axis.x+(h.y-endpoint.y)*axis.y)/length*(gateIndex?-1:1);
        if(cut.length>=3&&inward>hr*.8)continue;
        const separation=Object.entries(used).filter(([id,point])=>id!==unit.uid&&Math.hypot(point.x-h.x,point.y-h.y)<(unit.radius||12)*2+7).length;
        const score=wodAiDist2(h.x,h.y,endpoint.x,endpoint.y)+separation*hr*hr*80+
            Math.hypot(h.x-unit.x,h.y-unit.y)*hr*.12-(1-getTerrainDefenseModifier(unit,h))*hr*hr*8;
        points.push({h,score});
    }
    points.sort((a,b)=>a.score-b.score);const target=points[0]?.h||center;
    used[unit.uid]={x:target.x,y:target.y};return target;
}

function wodAiSharedFallbackHex(unit,job,local,cut,defense) {
    const hr=gameData.hexRadius||20,now=wodAiOperationTime(),owner=unit.owner;
    const towns=gameData.cities.filter(c=>c.owner===owner&&wodAiCanReach(unit,c));
    towns.sort((a,b)=>Math.hypot(a.x-unit.x,a.y-unit.y)-Math.hypot(b.x-unit.x,b.y-unit.y));
    const city=towns[0];if(!city)return null;
    let cache=gameData._aiFallbackLines;
    if(cache?.hexes!==gameData.hexes)cache=gameData._aiFallbackLines={hexes:gameData.hexes,lines:{}};
    const key=owner+':'+(cut?.id||job?.id||city.id),old=cache.lines[key];
    let anchor=old?.anchor;
    if(!anchor||anchor.owner!==owner||now-old.at>12000||local.enemies.some(e=>Math.hypot(e.x-anchor.x,e.y-anchor.y)<hr*3)){
        const dx=city.x-unit.x,dy=city.y-unit.y,len=Math.hypot(dx,dy)||1,span=Math.min(len,hr*8);
        const center=getNearestHexToPoint(unit.x+dx/len*span,unit.y+dy/len*span),reach=wodAiOperationReach(unit);
        const points=getHexesInRadius(center.q,center.r,4).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&h.owner===owner&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&wodCurrentSupplyComponent(h,owner).city);
        const score=h=>Math.hypot(h.x-center.x,h.y-center.y)+local.enemies.reduce((n,e)=>n+Math.max(0,hr*6-Math.hypot(e.x-h.x,e.y-h.y))*4,0)+(getTerrainDefenseModifier(unit,h)-1)*hr*3;
        points.sort((a,b)=>score(a)-score(b));anchor=points[0];
        if(!anchor)return null;cache.lines[key]={at:now,anchor};
        if(Object.keys(cache.lines).length>96)cache.lines=Object.fromEntries(Object.entries(cache.lines).sort((a,b)=>b[1].at-a[1].at).slice(0,64));
    }
    // While a corridor is still open, follow the supply graph to its safe side.
    // Keep the agreed fallback line once the column has cleared that passage.
    if(cut){const hop=wodAiSupplyRetreatHop(unit,defense);if(hop)return hop;}
    const ids=(cut?.riskUnits?[...cut.riskUnits]:job?.members||local.allies.map(u=>u.uid)).slice().sort(),rank=Math.max(0,ids.indexOf(unit.uid));
    const dx=city.x-anchor.x,dy=city.y-anchor.y,len=Math.hypot(dx,dy)||1,lane=(rank%5-2)*hr*1.7;
    const slot=getNearestHexToPoint(anchor.x-dy/len*lane+dx/len*Math.floor(rank/5)*hr*2,anchor.y+dx/len*lane+dy/len*Math.floor(rank/5)*hr*2);
    return slot?.owner===owner&&!isWaterHex(slot)&&canUnitEnterHex(unit,slot)&&wodCurrentSupplyComponent(slot,owner).city&&!isWorldPositionBlockedByUnits(unit,slot.x,slot.y)&&wodAiCanReach(unit,slot)?slot:anchor;
}

function wodAiReliefReady(unit,job) {
    if(job?.kind!=='relief'||!job.holdHex||!job.innerHex||!job.members)return false;
    const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(job._reliefCheckAt==null||now-job._reliefCheckAt>=900){
        job._reliefCheckAt=now;
        const army=gameData.entities.filter(u=>job.members.includes(u.uid)&&u.hp>u.maxHp*.34&&!u.moraleBroken&&!u._medicalRecovering);
        const near=army.filter(u=>wodAiArrivalSeconds(u,job.pocketKeys?.has(getHexKey(getNearestHexToPoint(u.x,u.y)))?job.innerHex:job.holdHex,hr*2.5,18)<=18);
        const enemies=wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*8);
        job.breakoutBalance=wodAiForecast(unit.owner,near,enemies);
        const urgent=army.some(u=>(u.outOfSupplySeconds||0)>=4),old=job.breakoutProgress;
        if(!old||army.filter(u=>old.positions[u.uid]).length<Math.max(1,Math.ceil(army.length*.5))||army.filter(u=>old.positions[u.uid]&&Math.hypot(u.x-old.positions[u.uid].x,u.y-old.positions[u.uid].y)>hr*.35).length>=Math.max(1,Math.ceil(army.length*.5)))
            job.breakoutProgress={at:now,positions:Object.fromEntries(army.map(u=>[u.uid,{x:u.x,y:u.y}]))};
        else old.positions=Object.fromEntries(army.map(u=>[u.uid,old.positions[u.uid]||{x:u.x,y:u.y}]));
        const stalled=urgent&&now-job.breakoutProgress.at>8000;
        job.breakoutReady=army.length>0&&!stalled&&near.length>=Math.max(1,Math.ceil(army.length*.6))&&job.breakoutBalance.ratio>=(urgent?.88:1.05);
        if(job.breakoutReady){for(const u of army)u._aiReliefCommitUntil=now+4000;wodAiRecord(unit.owner,'breakout-commit',{job:job.id,troops:near.length,ratio:Math.round(job.breakoutBalance.ratio*100)/100});}
        else if(stalled){for(const u of army)u._aiReliefCommitUntil=0;wodAiRecord(unit.owner,'breakout-stalled',{job:job.id,troops:army.length});}
    }
    return !!job.breakoutReady;
}

function wodAiTacticalFallback(unit,job,issue=true) {
    if(!unit||wodIsNavalUnit(unit)||unit.type==='convoy'||unit.boardTransportUid||unit._medicalRecovering)return false;
    if(wodAiTownHoldContext(unit,job)){if(issue)wodAiCancelTownWithdrawal(unit);return false;}
    if(issue&&wodAiSupplyExit(unit,job))return true;
    const local=wodAiLocalSituation(unit),cut=wodAiCorridorWithdrawal(unit),now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    const recovering=(unit._aiRegroupUntil||0)>now&&local.enemies.length&&local.forecast.ratio<1.12;
    const operation=job?.frontOperation||job?.operationState;
    const pressure=wodAiUnitAssaultBudget(unit,job),combatFloor=pressure?(unit.isGeneral?.52:.35):.55;
    if(job?.frontOperation&&!cut&&!unit._aiWithdrawal&&unit.hp>unit.maxHp*combatFloor){
        const decision=wodAiCommandDecision(unit.owner,job.frontOperation);
        if(decision.phase==='advance'&&decision.ids.includes(unit.uid)&&
            (local.forecast.ratio>=(pressure?.55:.65)||gameData.entities.some(u=>u!==unit&&decision.ids.includes(u.uid)&&wodAiArrivalSeconds(u,unit,hr*3,8)<=8))){unit._aiRegroupUntil=0;return false;}
    }
    if(!job?.frontOperation&&!cut&&!unit._aiWithdrawal&&unit.hp>unit.maxHp*combatFloor&&operation&&
        (operation.phase==='advance'&&operation.mode==='breakthrough'||operation.stage==='attack')&&!job.route){
        if(operation.commitCheckAt==null||now-operation.commitCheckAt>=900){
            operation.commitCheckAt=now;
            const ids=job.frontOperation?.members||job.members,goal=operation.advanceGoal||operation.goal||job.objectiveCity||job.objectiveHex||job.attackHex;
            const roster=gameData.entities.filter(u=>ids?.includes(u.uid)&&u.hp>u.maxHp*combatFloor&&!u._medicalRecovering&&!u.retreating&&!u.moraleBroken&&!u.boardTransportUid);
            const lead=roster.slice().sort((a,b)=>roster.filter(u=>Math.hypot(u.x-b.x,u.y-b.y)<hr*6).length-roster.filter(u=>Math.hypot(u.x-a.x,u.y-a.y)<hr*6).length)[0];
            const foes=lead?wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-lead.x,e.y-lead.y)<hr*10):[];
            const core=lead?roster.filter(u=>Math.hypot(u.x-lead.x,u.y-lead.y)<hr*9&&wodCurrentSupplyComponent(getNearestHexToPoint(u.x,u.y),unit.owner).city&&
                (!foes.length||foes.some(e=>wodAiArrivalSeconds(u,e,u.range||50,12)<=12))):[];
            operation.commitCore=core.map(u=>u.uid);operation.commitRatio=wodAiForecast(unit.owner,core,foes).ratio;
        }
        // Keep a viable advancing cohort together. A genuinely isolated leader
        // still waits at the vanguard cohesion gate; severe local danger and
        // corridor warnings always retain their withdrawal authority.
        if(operation.commitCore?.length>=3&&operation.commitCore.includes(unit.uid)&&
            operation.commitRatio>=(pressure?.policy.continue??wodAiAttackThreshold(unit.owner,true))&&local.forecast.ratio>=(pressure?.55:.65)){unit._aiRegroupUntil=0;return false;}
    }
    if(job?.kind==='relief'){
        wodAiReliefReady(unit,job);
        // Both sides of a winnable breach commit together. Per-unit fallback
        // must not peel off the leading troops as their support approaches.
        if(job.breakoutReady||unit._aiReliefCommitUntil>now&&job.breakoutBalance?.ratio>=.85){unit._aiRegroupUntil=0;return false;}
    }
    // A healthy rear guard may briefly delay a moderately stronger force while
    // the exposed army exits. Do not flee the choke before that army can move.
    if(job?.kind==='corridor'&&job.delayUnits?.has(unit.uid)&&job.riskUnits?.size&&unit.hp>unit.maxHp*(unit.isGeneral?.75:.55)){
        if(job._screenCheckAt==null||now-job._screenCheckAt>=900){
            job._screenCheckAt=now;
            const helpers=gameData.entities.filter(u=>job.members.includes(u.uid)&&!u._medicalRecovering&&wodAiArrivalSeconds(u,job.holdHex,hr*3,12)<=12);
            const foes=wodAiThreats(unit.owner).filter(e=>Math.hypot(e.x-job.holdHex.x,e.y-job.holdHex.y)<hr*8);
            job.screenBalance=wodAiForecast(unit.owner,helpers,foes);
        }
        if(!local.enemies.length)return false;
        if(unit._aiDelayCorridor?.id!==job.id)unit._aiDelayCorridor={id:job.id,at:now};
        if(now-unit._aiDelayCorridor.at<18000&&Math.max(local.forecast.ratio,job.screenBalance?.ratio||0)>=.65){wodAiRecord(unit.owner,'delay-cover',{unit:unit.uid,job:job.id,reason:'cover-withdrawal'});return false;}
    }
    // Finish a purposeful withdrawal to safe ground. The old eight-second
    // timer could expire halfway there as contact left sight, causing the same
    // regiment to turn back into the enemy and flee again. Real supply cuts
    // and a newly superior local force can still interrupt the withdrawal.
    const withdrawal=unit._aiWithdrawal,goal=withdrawal?.goal&&gameData.hexes[withdrawal.goal];
    const route=unit._trafficYield?.points?.at(-1)||unit.orderTarget||unit.target?.finalTarget||unit.target;
    const queued=gameData._aiMoveQueue?.get(unit),sameGoal=p=>goal&&p&&Math.hypot(p.x-goal.x,p.y-goal.y)<hr*1.5;
    const followingWithdrawal=sameGoal(route)||sameGoal(queued);
    const finishWithdrawal=!cut&&unit._aiRegroupUntil>now&&goal&&
        wodIsFriendlyOwner(goal.owner,unit.owner)&&wodCurrentSupplyComponent(goal,unit.owner).city&&
        Math.hypot(goal.x-unit.x,goal.y-unit.y)>hr*1.5&&(!local.enemies.length||local.forecast.ratio<1.35);
    if(finishWithdrawal&&followingWithdrawal)return true;
    if(!local.retreat&&!cut&&!recovering&&!finishWithdrawal){unit._aiRegroupUntil=0;unit._aiWithdrawal=null;return false;}
    if(!issue)return true;
    if(unit.target&&unit._aiWithdrawal&&(!goal||followingWithdrawal)&&(!cut||unit._aiWithdrawal.cutId===cut.id)&&now-unit._aiWithdrawal.at<7000&&
        (Math.hypot(unit.x-unit._aiWithdrawal.x,unit.y-unit._aiWithdrawal.y)>hr*.3||now-unit._aiWithdrawal.at<3000))return true;
    const start=getNearestHexToPoint(unit.x,unit.y),reach=wodAiOperationReach(unit),defense=gameData._aiDefenseByOwner?.[unit.owner];
    const rootDistance=h=>defense?.supplyDistance?.get(getHexKey(h))??Infinity;
    const currentRoot=rootDistance(start),candidates=[];
    for(const p of getHexesInRadius(start.q,start.r,10)){
        const h=gameData.hexes[p.q+','+p.r];if(!h||isWaterHex(h)&&unit.type!=='marine'||!isWaterHex(h)&&!wodIsFriendlyOwner(h.owner,unit.owner)||!reach.has(getHexKey(h))||!canUnitEnterHex(unit,h)||isWorldPositionBlockedByUnits(unit,h.x,h.y))continue;
        const marineSupply=unit.type==='marine'&&(isWaterHex(h)||getNeighborHexes(h).some(isWaterHex));
        if(!wodCurrentSupplyComponent(h,unit.owner).city&&!marineSupply&&!job?.pocketKeys?.has(getHexKey(h)))continue;
        const d=Math.hypot(h.x-unit.x,h.y-unit.y);if(d<hr*1.5||d>hr*10)continue;
        const danger=local.enemies.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*4-Math.hypot(e.x-h.x,e.y-h.y))**2*(e._intelConfidence??1),0);
        const support=local.allies.reduce((n,u)=>n+(Math.hypot(u.x-h.x,u.y-h.y)<hr*4?1:0),0);
        const progress=Number.isFinite(currentRoot)?Math.max(-12,Math.min(12,currentRoot-rootDistance(h))):0;
        const cover=1/getTerrainDefenseModifier(unit,h);
        const score=-danger/(hr*hr)*3+support*2+cover*3+progress*(cut?5:.35)-d/hr*.45;
        candidates.push({h,score});
    }
    candidates.sort((a,b)=>b.score-a.score);const safe=finishWithdrawal?goal:wodAiSharedFallbackHex(unit,job,local,cut,defense)||cut&&wodAiSupplyRetreatHop(unit,defense)||candidates[0]?.h;
    if(!safe)return false;
    const travel=Math.hypot(safe.x-unit.x,safe.y-unit.y)/Math.max(1,unit.speed*WOD_MOVE_SPEED_FACTOR);
    unit._aiRegroupUntil=now+Math.min(30000,Math.max(8000,travel*1300));unit._aiFallbackAt=now;unit.aiCaptureHexKey=null;
    const moved=wodAiMoveUnitTowardHex(unit,safe,true,.08);
    if(moved){unit._aiWithdrawal={at:now,x:unit.x,y:unit.y,goal:getHexKey(safe),cutId:cut?.id||null};wodAiStampOrder(unit,true,safe,Math.max(7000,unit._aiRegroupUntil-now));unit.aiOrderPhase='regroup';wodAiRecord(unit.owner,'withdraw',{unit:unit.uid,reason:cut?'supply-corridor':'local-disadvantage',ratio:Math.round(local.forecast.ratio*100)/100});}
    return true;
}

// Give each regiment a reachable slot, including during approach. Sending the
// whole operation to one exact anchor can prevent its own assembly quorum.
// A front is a shared operation, not independent small jobs each counting the
// entire opposing army. Base allocations remain available for real emergencies;
// routine contact responses cannot recall a committed offensive every pulse.
function wodAiCorridorUrgent(cut) {
    if(!cut)return false;
    if(!cut.predictive)return true;
    const risk=cut.atRisk??cut.riskUnits?.size??cut.troops??0;
    return risk>=1&&(risk>=2||cut.closureSeconds<=12)&&Number.isFinite(cut.closureSeconds)&&cut.closureSeconds<=Math.max(12,(cut.withdrawSeconds||20)*1.1+5)&&
        (risk>=4||cut.closureSeconds<=35)&&!(cut._holdRatio>=1.15);
}

function wodAiDefensePriority(unit,response) {
    if(!response)return 0;
    const hr=gameData.hexRadius||20,point=response.contactPoint||response.holdHex;
    if(response.kind==='relief')return response.trapped?.includes(unit.uid)||response.pocketKeys?.has(getHexKey(getNearestHexToPoint(unit.x,unit.y)))?6:4;
    if(response.kind==='counter')return response.city?.owner===unit.owner?5:3;
    if(response.kind==='corridor')return response.riskUnits?.has(unit.uid)?5:response.closureSeconds<=20?4:2;
    return response.coverageRequired&&point&&gameData.cities.some(c=>c.owner===unit.owner&&Math.hypot(c.x-point.x,c.y-point.y)<hr*6)?3:1;
}

function wodAiDefenseLeaseAllows(unit,response,selected,previous) {
    const now=wodAiOperationTime(),lease=unit._aiDefenseLease;
    if(!lease||lease.until<=now||lease.id===response.id)return true;
    const held=selected.find(t=>t.id===lease.id);if(!held)return true;
    if(!wodAiFrontCritical(held,unit))return true;
    if(wodAiDefensePriority(unit,response)>wodAiDefensePriority(unit,held)&&wodAiFrontCritical(response,unit))return true;
    const point=held.holdHex;
    if(!point||!canUnitEnterHex(unit,point)||!wodAiResponseCanArrive(unit,held,Math.hypot(point.x-unit.x,point.y-unit.y)))return true;
    return false;
}

function wodAiRefreshRally(owner,job,members,goal){
 const now=wodAiOperationTime(),hr=gameData.hexRadius||20;
 if(!members.length)return;
 const cx=members.reduce((n,u)=>n+u.x,0)/members.length,cy=members.reduce((n,u)=>n+u.y,0)/members.length;
 const lead=members.find(u=>u.uid===job._rallyLead)||members.filter(u=>!wodCanClimb(u)).sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0]||members[0];
 if(job._rallyAt!=null&&now-job._rallyAt<4000)return;
 job._rallyAt=now;job._rallyLead=lead.uid;
 const route=wodAiLandRoute(lead,goal);
 const force=members,center=getNearestHexToPoint(cx,cy),reach=wodAiOperationReach(lead),threats=wodAiThreats(owner,false);
 if(!center)return;
 const assembling=!job.operationState||['assemble','recover'].includes(job.operationState.stage);
 const goalKey=goal.id||getHexKey(goal),old=job._assemblyRally;
 if(assembling&&old?.goal===goalKey&&wodIsFriendlyOwner(old.hex.owner,owner)&&wodCurrentSupplyComponent(old.hex,owner).city&&
     !threats.some(e=>Math.hypot(e.x-old.hex.x,e.y-old.hex.y)<(e.range||50)+hr)){
  job.holdHex=old.hex;return;
 }
 // Reverse route fields fill over several bounded AI pulses. While they are
 // warming up, assemble at the supplied army center instead of issuing the
 // stale, distant rally order and retaining it until everybody arrives there.
 if(assembling&&!route&&!isWaterHex(center)&&canUnitEnterHex(lead,center)&&
     wodIsFriendlyOwner(center.owner,owner)&&wodCurrentSupplyComponent(center,owner).city&&
     !threats.some(e=>Math.hypot(e.x-center.x,e.y-center.y)<(e.range||50)+hr)){
  job.holdHex=center;job._assemblyRally={goal:goalKey,hex:center};return;
 }
 if(route){
  let rally=null;
  // Assemble near the actual army. The last friendly cell of a long route can
  // be minutes away, forcing scattered regiments to march there separately.
  for(const h of assembling?route.slice(0,5):route){
   if(!wodIsFriendlyOwner(h.owner,owner)||!wodCurrentSupplyComponent(h,owner).city)break;
   if(threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr))break;
   rally=h;
  }
  if(rally){
   const current=job.holdHex,safe=current&&wodIsFriendlyOwner(current.owner,owner)&&wodCurrentSupplyComponent(current,owner).city&&
       !threats.some(e=>Math.hypot(e.x-current.x,e.y-current.y)<(e.range||50)+hr);
   const oldIndex=current?route.indexOf(current):-1;
   const backwards=safe&&(oldIndex>=0&&route.indexOf(rally)<oldIndex||!wodAiNeedsLandDetour(lead,goal)&&Math.hypot(rally.x-goal.x,rally.y-goal.y)>Math.hypot(current.x-goal.x,current.y-goal.y)+hr*2);
   if((assembling||!backwards)&&!['secure-approach','protect-flanks'].includes(job.operationState?.stage))job.holdHex=rally;
   if(assembling)job._assemblyRally={goal:goalKey,hex:job.holdHex};
   return;
  }
 }
 const current=job.holdHex||center,oldDistance=Math.hypot(current.x-goal.x,current.y-goal.y);
 let best=null,score=Infinity;
 for(const p of getHexesInRadius(center.q,center.r,6)){
  const h=gameData.hexes[p.q+','+p.r];if(!h||isWaterHex(h)||!wodIsFriendlyOwner(h.owner,owner)||!reach.has(getHexKey(h))||!canUnitEnterHex(lead,h)||!wodCurrentSupplyComponent(h,owner).city)continue;
  if(threats.some(e=>Math.hypot(e.x-h.x,e.y-h.y)<(e.range||50)+hr*2))continue;
  const d=Math.hypot(h.x-goal.x,h.y-goal.y);if(!assembling&&d>oldDistance-hr*2)continue;
  const value=Math.hypot(h.x-cx,h.y-cy)*1.5+d*.6;if(value<score){score=value;best=h;}
 }
 if(best){job.holdHex=best;if(assembling)job._assemblyRally={goal:goalKey,hex:best};}
}

// Gather around the supplied force already at the front, never an obsolete rear rally.
function wodAiCohortAnchor(owner,members,goal) {
    const hr=gameData.hexRadius||20,ready=members.filter(u=>u.hp>u.maxHp*.4&&!u.retreating&&!u.moraleBroken&&!u._medicalRecovering);
    const points=ready.map(u=>({u,n:ready.reduce((n,v)=>n+Number(Math.hypot(u.x-v.x,u.y-v.y)<hr*7),0)}));
    points.sort((a,b)=>b.n-a.n||(goal?Math.hypot(a.u.x-goal.x,a.u.y-goal.y)-Math.hypot(b.u.x-goal.x,b.u.y-goal.y):0));
    for(const {u}of points){const h=wodUnitSupplyHex(u,getNearestHexToPoint(u.x,u.y));if(h&&!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,owner)&&wodCurrentSupplyComponent(h,owner).city)return h;}
    return null;
}

function wodAiSupplyExit(unit,job) {
    if(wodIsNavalUnit(unit)||unit.boardTransportUid)return false;
    const here=wodUnitSupplyHex(unit,getNearestHexToPoint(unit.x,unit.y)),now=wodAiOperationTime(),hr=gameData.hexRadius||20;
    if(here&&wodCurrentSupplyComponent(here,unit.owner).city){unit._aiSupplyTrail={key:getHexKey(here),at:now};return false;}
    if(!here||!wodGetUnitEncirclementState(unit,here)||(unit.outOfSupplySeconds||0)<1)return false;
    if(job?.kind==='relief'&&(wodAiReliefReady(unit,job)||job.breakoutReady&&unit._aiReliefCommitUntil>now&&job.breakoutBalance?.ratio>=.85))return false;
    if(unit._aiSupplyExit&&now-unit._aiSupplyExit.at<5000&&unit.target)return true;
    const old=unit._aiSupplyTrail&&gameData.hexes[unit._aiSupplyTrail.key],choices=[];
    if(old)choices.push(old);
    for(const p of getHexesInRadius(here.q,here.r,12)){const h=gameData.hexes[p.q+','+p.r];if(h)choices.push(h);}
    const foes=wodAiThreats(unit.owner,false),reach=wodAiOperationReach(unit);
    let safe=choices.filter(h=>!isWaterHex(h)&&wodIsFriendlyOwner(h.owner,unit.owner)&&reach.has(getHexKey(h))&&canUnitEnterHex(unit,h)&&wodCurrentSupplyComponent(h,unit.owner).city);
    // A large encirclement may contain no supplied cell inside the local
    // twelve-cell scan. Own towns remain known and are valid dry escape goals.
    if(!safe.length)safe=gameData.cities.filter(c=>c.owner===unit.owner).map(c=>gameData.hexes[c.q+','+c.r]).filter(h=>h&&!isWaterHex(h)&&canUnitEnterHex(unit,h)&&reach.has(getHexKey(h))&&wodCurrentSupplyComponent(h,unit.owner).city);
    const score=h=>Math.hypot(h.x-unit.x,h.y-unit.y)+foes.reduce((n,e)=>n+Math.max(0,(e.range||50)+hr*2-Math.hypot(e.x-h.x,e.y-h.y))*3,0);
    safe.sort((a,b)=>score(a)-score(b));const goal=safe[0];if(!goal)return false;
    // Escaping a pocket is a retreat, so use the same visible-enemy risk path
    // as the retreat button. A normal march could steer straight through the
    // force closing the neck, then repeatedly rejoin the offensive at its edge.
    if(wodAiAssignWaypoints(unit,[goal],{transportInternal:true,forceRetreat:true})){
        unit._medicalRecovering=false;unit._medicalGoal=null;unit._aiMoveIntent=null;gameData._aiMoveQueue?.delete(unit);
        const travel=Math.hypot(goal.x-unit.x,goal.y-unit.y)/Math.max(1,unit.speed*WOD_MOVE_SPEED_FACTOR);
        unit._aiSupplyExit={at:now,key:getHexKey(goal),until:now+Math.min(180000,Math.max(12000,travel*1800))};
        wodAiStampOrder(unit,false,goal,5000);wodAiRecord(unit.owner,'supply-exit',{unit:unit.uid,target:getHexKey(goal)});return true;
    }
    return false;
}

// Physical supply links are independent of political ownership. Share their
// exact native order across factions; each defense scan still filters its own
// friendly territory and computes fresh city reachability and enemy threats.
function* wodAiSupplyGeometrySteps() {
    const version=gameData._wodPfVer||0;let g=gameData._aiSupplyGeometry;
    if(!g||g.hexes!==gameData.hexes||g.version!==version)g=gameData._aiSupplyGeometry={hexes:gameData.hexes,version,cells:gameData.hexList,index:new Map(gameData.hexList.map((h,i)=>[h,i])),neighbors:[],cursor:0};
    while(g.cursor<g.cells.length){
        const end=Math.min(g.cells.length,g.cursor+128);
        while(g.cursor<end){const h=g.cells[g.cursor],links=[];wodSupplyNeighbors(h,n=>{const id=g.index.get(n);if(id!==undefined&&!links.includes(id))links.push(id);});g.neighbors[g.cursor++]=links;}
        yield;
    }
    return g;
}
