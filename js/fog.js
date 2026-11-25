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
// (The offsets of each radius are worked out once, and cells are found through the hex index with their cached
// keys: building a "q,r" string for every cell looked at was most of the cost of the fog. Same cells, same order.)
const WOD_FOG_REVEAL_OFFSETS=new Map();
function wodFogRevealOffsets(R) {
    let o=WOD_FOG_REVEAL_OFFSETS.get(R);
    if(!o){o=[];for(let q=-R;q<=R;q++)for(let r=-R;r<=R;r++)if(!(q*q+r*r>R*R+.25))o.push(q,r);WOD_FOG_REVEAL_OFFSETS.set(R,o);}
    return o;
}
function wodFogRevealHexesAround(cq,cr,R,visible,explored) {
    const o=wodFogRevealOffsets(R);
    for(let i=0;i<o.length;i+=2) {
        const h=wodHexAt(cq+o[i],cr+o[i+1]);if(!h)continue;
        const key=getHexKey(h);visible.add(key);explored.add(key);
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
    // (whether an owner is friendly is asked for every cell of the map: answered once per owner)
    const friendCache=new Map(),friendly=o=>{let v=friendCache.get(o);if(v===undefined){v=wodIsFriendlyOwner(o,owner);friendCache.set(o,v);}return v;};
    const explored=rec.explored,list=gameData.hexList;
    // Our own ground is visible, and so is everything within two cells of its border. That part changes only when
    // cells change hands, so it is kept (in the order it was first worked out) until the set of our cells differs:
    // two hashes and a count of our cells' places in the map, checked on every refresh, from whatever changed them.
    let ta=0x811c9dc5,tb=0,tn=0;
    for(let i=0;i<list.length;i++)if(friendly(list[i].owner)){ta=Math.imul(ta^i,16777619);tb=(tb+Math.imul(i+1,0x9e3779b1))|0;tn++;}
    let ground=rec.ground;
    if(!ground||ground.list!==list||ground.length!==list.length||ground.a!==ta||ground.b!==tb||ground.n!==tn){
        const seen=new Set();
        for(const h of list)if(friendly(h.owner)) {
            seen.add(getHexKey(h));
            if(cardinalHexDirections.some(d=>{const n=wodHexAt(h.q+d.q,h.r+d.r);return n&&!friendly(n.owner);}))
                wodFogRevealHexesAround(h.q,h.r,2,seen,seen);
        }
        ground=rec.ground={list,length:list.length,a:ta,b:tb,n:tn,keys:[...seen],explored:null};
    }
    const visible=new Set(ground.keys);
    // (once added, the same cells are already explored: only a new outline, or a new explored set, needs adding)
    if(ground.explored!==explored){for(const k of ground.keys)explored.add(k);ground.explored=explored;}
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
    let changed=visible.size!==rec.visible.size;
    if(!changed)for(const k of visible)if(!rec.visible.has(k)){changed=true;break;}
    rec.visible=visible;rec.at=now;if(changed)rec.revision++;
    gameData._factionIntel[owner]=rec;return rec;
}
function wodOwnerCanSee(owner,item) {
    if(!wodFogActive()||!item||wodIsFriendlyOwner(item.owner,owner))return true;
    // (a cell found from a position has its key cached; a town or fort passed in is not given one)
    if(item.q!=null)return wodFogFactionIntel(owner).visible.has(`${item.q},${item.r}`);
    const h=getNearestHexToPoint(item.x,item.y);
    return !!(h&&wodFogFactionIntel(owner).visible.has(getHexKey(h)));
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
// An enemy at the edge of your vision no longer blinks. Vision is worked out afresh about four times a second with a
// hard edge, so an enemy standing on it (or a front line jostling across it, or your own unit stepping into the next
// cell) used to vanish and reappear many times a minute. Now:
// - an enemy you have seen stays shown while its cell is next to one you can see (one cell of give at the edge: going
//   out of sight takes a step further than coming into it);
// - past that it is held at full strength for WOD_FOG_UNIT_HOLD_MS, then fades out over WOD_FOG_UNIT_FADE_MS;
// - back in sight, it is shown at once. An enemy you have not seen is shown only in sight, as before.
// (Page-clock times per unit object, never saved: js/game-saves.js leaves _fogSeenAt out.)
const WOD_FOG_UNIT_HOLD_MS = 400, WOD_FOG_UNIT_FADE_MS = 800;
const WOD_FOG_EDGE_STEPS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function wodFogCellBesideVision(hex) {
    if(!hex || !gameData._fogVisible) return false;
    for(const [dq, dr] of WOD_FOG_EDGE_STEPS) {
        const n = wodHexAt(hex.q + dq, hex.r + dr);
        if(n && gameData._fogVisible.has(getHexKey(n))) return true;
    }
    return false;
}
/** How strongly to draw a unit: 1 in sight (or ours), between 0 and 1 while it fades after leaving sight, 0 hidden. */
function wodFogUnitAlpha(unit) {
    if(!wodFogActive() || !unit) return 1;
    if(unit.owner === wodLocalPlayerOwner()) return 1;
    const seen = gameData._fogSeenAt instanceof WeakMap ? gameData._fogSeenAt : (gameData._fogSeenAt = new WeakMap());
    const now = performance.now(), hex = getNearestHexToPoint(unit.x, unit.y);
    if(wodFogHexVisible(hex)) { seen.set(unit, now); return 1; }
    const at = seen.get(unit);
    if(at === undefined) return 0;
    if(now - at <= WOD_FOG_UNIT_HOLD_MS && wodFogCellBesideVision(hex)) { seen.set(unit, now); return 1; }
    const since = now - at;
    if(since <= WOD_FOG_UNIT_HOLD_MS) return 1;
    const left = 1 - (since - WOD_FOG_UNIT_HOLD_MS) / WOD_FOG_UNIT_FADE_MS;
    if(left > 0) return left;
    seen.delete(unit);
    return 0;
}
function wodFogCanSeeUnit(unit) {
    return wodFogUnitAlpha(unit) > 0;
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
