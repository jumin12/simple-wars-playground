// Fog of war: vision and knowledge per faction.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

let lastPlayerSummaryMs = 0;
function wodFogActive() {
    return !!(gameData.fogOfWar && gameState === 'PLAYING' && !gameData.menuAttractMode);
}
function wodFogVisionRadiusForUnit(unit) {
    if(!unit || unit.hp<=0)return 0;
    return ({light:5,motorized:5,mountaineer:5,marine:5,heavy:4,ship:6,transport:5,supply:5,convoy:3})[unit.type]||4;
}
// Circular, symmetric vision follows the actual square lattice. All units
// scout, even in rear areas or while embarked on the open sea.
function wodFogRevealHexesAround(cq,cr,R,visible,explored) {
    for(let q=-R;q<=R;q++)for(let r=-R;r<=R;r++) {
        if(q*q+r*r>R*R+.25)continue;
        const key=`${cq+q},${cr+r}`;if(!gameData.hexes[key])continue;
        visible.add(key);explored.add(key);
    }
}
function wodFogFactionIntel(owner,force=false) {
    if(!gameData._factionIntel||gameData._factionIntelMap!==gameData.hexes) {
        gameData._factionIntel={};gameData._factionIntelMap=gameData.hexes;
    }
    let rec=gameData._factionIntel[owner];
    const now=performance.now();
    if(rec&&!force&&now-rec.at<220)return rec;
    if(!rec)rec={visible:new Set(),explored:new Set(),cities:new Map(),forts:new Map(),units:new Map(),revision:0};
    rec.units ||= new Map();rec.hospitals ||= new Map();
    const visible=new Set(),explored=rec.explored,friendly=o=>wodIsFriendlyOwner(o,owner);
    for(const h of gameData.hexList)if(friendly(h.owner)) {
        const key=getHexKey(h);visible.add(key);explored.add(key);
        if(cardinalHexDirections.some(d=>{const n=wodHexAt(h.q+d.q,h.r+d.r);return n&&!friendly(n.owner);}))
            wodFogRevealHexesAround(h.q,h.r,2,visible,explored);
    }
    for(const u of gameData.entities)if(u.hp>0&&friendly(u.owner)) {
        const h=getNearestHexToPoint(u.x,u.y);if(h)wodFogRevealHexesAround(h.q,h.r,wodFogVisionRadiusForUnit(u),visible,explored);
    }
    for(const c of gameData.cities)if(friendly(c.owner))wodFogRevealHexesAround(c.q,c.r,5,visible,explored);
    for(const f of gameData.forts||[])if(friendly(f.owner))wodFogRevealHexesAround(f.q,f.r,4,visible,explored);
    wodCloseTinyVisionHoles(visible,explored);
    const remember=(items,memory)=>{
        const seen=new Set();
        for(const item of items) {
            const key=item.id||`${item.q},${item.r}`;seen.add(key);
            if(friendly(item.owner)||visible.has(`${item.q},${item.r}`)) {
                const copy={};for(const field of ['id','name','q','r','x','y','owner','hp','maxHp','hasFactory','hasHarbor','hasFarm'])copy[field]=item[field];
                memory.set(key,copy);
            }
        }
        for(const [key,item] of memory)if(!seen.has(key)&&visible.has(`${item.q},${item.r}`))memory.delete(key);
    };
    remember(gameData.cities,rec.cities);remember(gameData.forts||[],rec.forts);remember(gameData.hospitals||[],rec.hospitals);
    const simNow=wodAiOperationTime(),seenUnits=new Set();
    const visibleGenerals=gameData.entities.filter(g=>g.hp>0&&g.isGeneral&&visible.has(getHexKey(getNearestHexToPoint(g.x,g.y)||{})));
    for(const u of gameData.entities){
        if(friendly(u.owner)||u.type==='convoy'||u.boardTransportUid)continue;
        const h=getNearestHexToPoint(u.x,u.y);if(!h||!visible.has(getHexKey(h)))continue;
        ensureUnitId(u);seenUnits.add(u.uid);
        if(u.hp<=0){rec.units.delete(u.uid);continue;}
        const copy={};for(const field of ['uid','type','owner','x','y','hp','maxHp','damage','attackCooldown','range','speed','morale','maxMorale','veteran','xp','isGeneral','moraleBroken','retreating','radius'])copy[field]=u[field];
        const previous=rec.units.get(u.uid),elapsed=previous?(simNow-previous.seenAt)/1000:0;
        if(elapsed>.05&&elapsed<3){copy.observedVx=(copy.x-previous.x)/elapsed;copy.observedVy=(copy.y-previous.y)/elapsed;}
        else if(previous&&elapsed<=.05){copy.observedVx=previous.observedVx;copy.observedVy=previous.observedVy;}
        copy.seenAt=simNow;copy.command=visibleGenerals.some(g=>g.owner===u.owner&&Math.hypot(g.x-u.x,g.y-u.y)<=wodFortCombatAuraRadiusPx())?1.05:1;
        rec.units.set(u.uid,copy);
    }
    for(const [uid,memory]of rec.units){
        if(simNow-memory.seenAt>45000){rec.units.delete(uid);continue;}
        if(!seenUnits.has(uid)&&visible.has(getHexKey(getNearestHexToPoint(memory.x,memory.y)||{})))memory.vacated=true;
    }
    const changed=visible.size!==rec.visible.size||[...visible].some(k=>!rec.visible.has(k));
    rec.visible=visible;rec.at=now;if(changed)rec.revision++;
    gameData._factionIntel[owner]=rec;return rec;
}
function wodOwnerCanSee(owner,item) {
    if(!wodFogActive()||!item||wodIsFriendlyOwner(item.owner,owner))return true;
    const h=item.q!=null?item:getNearestHexToPoint(item.x,item.y);
    return !!(h&&wodFogFactionIntel(owner).visible.has(`${h.q},${h.r}`));
}
function wodRefreshFogVision(dt,force=false) {
    if(!wodFogActive()){gameData._fogVisible=null;return;}
    gameData._fogVisionTimer=(gameData._fogVisionTimer||0)+dt;
    if(!force&&gameData._fogVisionTimer<.22&&gameData._fogVisible&&gameData._fogOwner===wodLocalPlayerOwner())return;
    gameData._fogVisionTimer=0;
    const owner=wodLocalPlayerOwner(),rec=wodFogFactionIntel(owner,true);
    if(gameData._fogOwner!==owner||gameData._fogRevision!==rec.revision||gameData._fogExplored!==rec.explored)gameData._fogCanvasDirty=true;
    gameData._fogVisible=rec.visible;gameData._fogExplored=rec.explored;
    gameData._fogOwner=owner;gameData._fogRevision=rec.revision;
}
function wodFogHexVisible(hex) {
    if(gameData._spectator?.active)return true;
    if(!wodFogActive() || !hex) return true;
    return !!(gameData._fogVisible && gameData._fogVisible.has(getHexKey(hex)));
}
function wodFogHexExplored(hex) {
    if(gameData._spectator?.active)return true;
    if(!wodFogActive() || !hex) return true;
    return !!(gameData._fogExplored && gameData._fogExplored.has(getHexKey(hex)));
}
function wodFogCanSeeUnit(unit) {
    if(!wodFogActive() || !unit) return true;
    if(unit.owner === wodLocalPlayerOwner()) return true;
    return wodFogHexVisible(getNearestHexToPoint(unit.x, unit.y));
}
function wodFogCanSeeCity(city) {
    if(!wodFogActive() || !city) return true;
    if(city.owner === wodLocalPlayerOwner()) return true;
    return wodFogHexVisible(wodHexAt(city.q,city.r));
}
function wodFogCanSeeFort(fort) {
    if(!wodFogActive() || !fort) return true;
    if(fort.owner === wodLocalPlayerOwner()) return true;
    return wodFogHexVisible(wodHexAt(fort.q,fort.r));
}
function wodEnsureFogCloudPattern() {
    if(gameData._fogCloudPattern) return gameData._fogCloudPattern;
    let sz = 128;
    let tile = document.createElement('canvas');
    tile.width = sz;
    tile.height = sz;
    let tctx = tile.getContext('2d');
    let img = tctx.createImageData(sz, sz);
    let d = img.data;
    for(let y = 0; y < sz; y++) {
        for(let x = 0; x < sz; x++) {
            let n = fbm(x * 0.05 + 11.7, y * 0.05 + 6.3, 4);
            let cloud = Math.min(1, n * 0.82 + 0.12);
            let idx = (y * sz + x) * 4;
            let bright = 246 + Math.floor(cloud * 9);
            d[idx] = bright;
            d[idx + 1] = bright - 2;
            d[idx + 2] = bright - 7;
            d[idx + 3] = Math.floor(30 + cloud * 90);
        }
    }
    tctx.putImageData(img, 0, 0);
    gameData._fogCloudPattern = tile;
    return tile;
}
function wodEnsureFogCanvas() {
    if(!gameData._fogCanvas) {
        gameData._fogCanvas = document.createElement('canvas');
        gameData._fogCtx = gameData._fogCanvas.getContext('2d');
    }
    let tw = terrainCanvas.width;
    let th = terrainCanvas.height;
    if(tw <= 0 || th <= 0) return false;
    if(gameData._fogCanvas.width !== tw || gameData._fogCanvas.height !== th) {
        gameData._fogCanvas.width = tw;
        gameData._fogCanvas.height = th;
        gameData._fogCanvasDirty = true;
    }
    return true;
}
let wodFogRebuildNextMs = 0;
function wodTryRebuildFogCanvas() {
    if(!gameData._fogCanvasDirty || !wodFogActive() || !gameData._fogVisible || !gameData._fogExplored) return;
    let now = performance.now();
    if(now < wodFogRebuildNextMs) return;
    wodFogRebuildNextMs = now + 180;
    wodRebuildFogCanvas();
}
function wodRebuildFogCanvas() {
    if(!wodFogActive()||!gameData._fogVisible||!gameData._fogExplored||!wodEnsureFogCanvas())return;
    const fc=gameData._fogCtx,w=gameData._fogCanvas.width,h=gameData._fogCanvas.height,
        spacing=gameData.hexRadius*1.35,ox=-terrainBounds.minX,oy=-terrainBounds.minY,
        visible=gameData._fogVisible,explored=gameData._fogExplored;
    fc.setTransform(1,0,0,1,0,0);fc.clearRect(0,0,w,h);
    fc.fillStyle='rgba(228,233,238,.94)';fc.fillRect(0,0,w,h);
    const pattern=fc.createPattern(wodEnsureFogCloudPattern(),'repeat');
    if(pattern){fc.save();fc.globalCompositeOperation='source-atop';fc.globalAlpha=.3;fc.fillStyle=pattern;fc.fillRect(0,0,w,h);fc.restore();}
    // Round the connected outline once instead of overlapping cell discs.
    // Holes retain their winding, so undiscovered areas stay covered.
    fc.save();fc.globalCompositeOperation='destination-out';fc.fillStyle='#000';fc.globalAlpha=.48;
    wodTraceCellRegion(fc,wodCellRegionLoops(explored),spacing,ox,oy);fc.fill();
    fc.globalAlpha=1;
    wodTraceCellRegion(fc,wodCellRegionLoops(visible),spacing,ox,oy);
    fc.fill();fc.restore();gameData._fogCanvasDirty=false;
}
const wodCityNameSpriteCache=new Map();
