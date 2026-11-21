// Terrain cache, borders and frontline drawing.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

let wodPoliticalStagingCanvas = null;
function wodFinishTerrainPoliticalBake(costMs) {
    wodTerrainPoliticalDirty = false;
    wodTerrainNeedFullRebuild = false;
    terrainNeedsUpdate = false;
    wodTerrainPolWork = null;
    if(costMs > 0) wodTerrainLastBakeCostMs = costMs;
    if(gameData._wodPolBakeAgain) {
        gameData._wodPolBakeAgain = false;
        wodTerrainPoliticalDirty = true;
        terrainNeedsUpdate = true;
    }
}
function wodEnsureTerritoryOverlayCtx(w, h) {
    if(!territoryOverlayCanvas) territoryOverlayCanvas = document.createElement('canvas');
    if(territoryOverlayCanvas.width !== w || territoryOverlayCanvas.height !== h) {
        territoryOverlayCanvas.width = w;
        territoryOverlayCanvas.height = h;
    }
    return territoryOverlayCanvas.getContext('2d');
}
function wodTerritoryOverlayChunk(w, batchSize) {
    let list = gameData.hexList;
    let spacing = gameData.hexRadius * 1.35;
    let discR = spacing * 0.78;
    let overlayCtx = w.overlayCtx;
    let ox = w.offsetX, oy = w.offsetY;
    let end = Math.min(list.length, w.hi + batchSize);
    for(let i = w.hi; i < end; i++) {
        let hex = list[i];
        let owner = hex.owner;
        if(owner <= 0 || isWaterHex(hex)) continue;
        overlayCtx.fillStyle = factionColors[owner];
        wodFillCellSquare(overlayCtx,hex,ox,oy,spacing);
    }
    w.hi = end;
    if(w.hi<list.length)return false;
    const cornerEnd=Math.min(list.length,(w.cornerHi||0)+batchSize);
    wodRoundPoliticalCorners(overlayCtx,ox,oy,list.slice(w.cornerHi||0,cornerEnd));w.cornerHi=cornerEnd;
    if(cornerEnd>=list.length)wodMaskTerritoryWaterCorners(overlayCtx,ox,oy);
    return cornerEnd>=list.length;
}
function wodEnsurePoliticalStagingCtx(w, h) {
    if(!wodPoliticalStagingCanvas) wodPoliticalStagingCanvas = document.createElement('canvas');
    if(wodPoliticalStagingCanvas.width !== w || wodPoliticalStagingCanvas.height !== h) {
        wodPoliticalStagingCanvas.width = w;
        wodPoliticalStagingCanvas.height = h;
    }
    return wodPoliticalStagingCanvas.getContext('2d', {alpha: false});
}
function wodBlitPoliticalStagingToTerrain() {
    if(!wodPoliticalStagingCanvas || !terrainCtx) return;
    terrainCtx.setTransform(1, 0, 0, 1, 0, 0);
    terrainCtx.drawImage(wodPoliticalStagingCanvas, 0, 0);
}
function wodCompositeTerritoryOverlayToCtx(targetCtx) {
    if(!gameData.layers.territory || !territoryOverlayCanvas || !targetCtx) return;
    targetCtx.save();
    targetCtx.globalAlpha = 0.32;
    targetCtx.drawImage(territoryOverlayCanvas, 0, 0);
    targetCtx.restore();
}
function wodDiplomacyBorderChunk(w, maxChains) {
    if(!gameData.layers.diplomacy) return true;
    let spacing = gameData.hexRadius * 1.35;
    let strokeCol = wodFrontlineColorRgba(1);
    let fillCol = wodFrontlineColorRgba(1);
    let style = w.style || gameData.uiSettings.frontlineStyle;
    let chains = w.chains;
    if(!chains || !chains.length) return true;
    let ctx = w.polCtx || terrainCtx;
    let drawn = 0;
    function strokeOne(lineWidth, dash, offsetPx, chain, col) {
        ctx.strokeStyle = col || strokeCol;
        ctx.fillStyle = col || fillCol;
        ctx.lineWidth = wodHdMapActive()?Math.min(lineWidth,2.4):lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(dash || []);
        let drawPts = offsetPx ? wodOffsetBorderPoints(chain.pts, chain.closed, offsetPx) : chain.pts;
        drawPaintStroke(ctx, drawPts, spacing, {
            closedLoop: chain.closed,
            suppressDegenerate: true,
            openLineCap: 'round',
            hybridBorder: true
        });
        ctx.setLineDash([]);
    }
    while(w.ci < chains.length && drawn < maxChains) {
        let chain = chains[w.ci];
        wodPaintFrontlineStyle(style, spacing, (lineWidth, dash, offsetPx, col) => {
            strokeOne(lineWidth, dash, offsetPx, chain, col);
        });
        w.ci++;
        drawn++;
    }
    return w.ci >= chains.length;
}
function wodStepTerrainPoliticalBake(budgetMs) {
    if(wodTerrainNeedFullRebuild || !wodTerrainBaseBuilt) {
        updateTerrainCache();
        return;
    }
    if(!gameData.layers.diplomacy && !gameData.layers.territory) {
        terrainCtx.setTransform(1, 0, 0, 1, 0, 0);
        terrainCtx.fillStyle = '#1e7ab8';
        terrainCtx.fillRect(0, 0, terrainCanvas.width, terrainCanvas.height);
        terrainCtx.drawImage(terrainBaseCanvas, 0, 0);
        wodFinishTerrainPoliticalBake(0.5);
        return;
    }
    let bakeStartMs = performance.now();
    let w = wodTerrainPolWork;
    if(!w) {
        let polCtx = wodEnsurePoliticalStagingCtx(terrainCanvas.width, terrainCanvas.height);
        polCtx.setTransform(1, 0, 0, 1, 0, 0);
        polCtx.fillStyle = '#1e7ab8';
        polCtx.fillRect(0, 0, terrainCanvas.width, terrainCanvas.height);
        polCtx.drawImage(terrainBaseCanvas, 0, 0);
        w = wodTerrainPolWork = {
            offsetX: -terrainBounds.minX,
            offsetY: -terrainBounds.minY,
            phase: gameData.layers.territory ? 'territory' : 'diplomacy',
            hi: 0,
            ci: 0,
            chains: null,
            style: null,
            overlayCtx: null,
            polCtx: polCtx
        };
        if(w.phase === 'territory') {
            w.overlayCtx = wodEnsureTerritoryOverlayCtx(terrainCanvas.width, terrainCanvas.height);
            w.overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
            w.overlayCtx.clearRect(0, 0, terrainCanvas.width, terrainCanvas.height);
        }
    }
    let batchHex = wodUsesVisualViewportLayout() ? 48 : 52;
    let chainBatch = wodUsesVisualViewportLayout() ? 3 : 4;
    while(performance.now() - bakeStartMs < budgetMs) {
        if(w.phase === 'territory') {
            if(wodTerritoryOverlayChunk(w, batchHex)) {
                wodCompositeTerritoryOverlayToCtx(w.polCtx);
                w.phase = gameData.layers.diplomacy ? 'diplomacy' : 'done';
                w.hi = 0;
            }
        } else if(w.phase === 'diplomacy') {
            if(!w.chains) {
                let spacing = gameData.hexRadius * 1.35;
                w.chains = wodCollectDiplomacyBorderChains(gameData.hexList, gameData.hexes, w.offsetX, w.offsetY, spacing);
                w.style = gameData.uiSettings.frontlineStyle;
                w.ci = 0;
            }
            if(wodDiplomacyBorderChunk(w, chainBatch)) w.phase = 'done';
        } else {
            break;
        }
    }
    if(w.phase === 'done') {
        wodBlitPoliticalStagingToTerrain();
        wodFinishTerrainPoliticalBake(performance.now() - bakeStartMs);
    }
}
function wodMarkTerrainPoliticalDirty() {
    let now = performance.now();
    let mn = gameData._wodMovingN || 0;
    let pn = gameData._wodPlayerMovingN || 0;
    let throttleMs = mn > 8 ? 280 : 180;
    if(pn > 0) throttleMs = Math.max(throttleMs, 220);
    if(gameData._terrDirtyNext && now < gameData._terrDirtyNext) {
        gameData._terrDirtyPending = true;
        return;
    }
    gameData._terrDirtyPending = false;
    gameData._terrDirtyNext = now + throttleMs;
    wodTerrainPoliticalDirty = true;
    terrainNeedsUpdate = true;
    if(wodTerrainPolWork) {
        gameData._wodPolBakeAgain = true;
        return;
    }
    wodTerrainPolWork = null;
}
function wodMarkTerrainFullDirty() {
    gameData._landGeometryRevision=(gameData._landGeometryRevision||0)+1;
    wodTerrainNeedFullRebuild = true;
    wodTerrainPoliticalDirty = true;
    wodTerrainBaseBuilt = false;
    terrainNeedsUpdate = true;
    wodTerrainPolWork = null;
}
function updateTerrainCache() {
    let bakeStartMs = performance.now();
    let minX, maxX, minY, maxY;
    let pad = gameData.hexRadius * 2;
    let needBoundsScan = wodTerrainNeedFullRebuild || !wodTerrainBaseBuilt || terrainCanvas.width <= 0;
    if(needBoundsScan) {
        minX = Infinity;
        maxX = -Infinity;
        minY = Infinity;
        maxY = -Infinity;
        for(let hex of gameData.hexList) {
            if(hex.x < minX) minX = hex.x;
            if(hex.x > maxX) maxX = hex.x;
            if(hex.y < minY) minY = hex.y;
            if(hex.y > maxY) maxY = hex.y;
        }
        minX -= pad;
        maxX += pad;
        minY -= pad;
        maxY += pad;
        terrainBounds = {minX, maxX, minY, maxY};
    } else {
        minX = terrainBounds.minX;
        maxX = terrainBounds.maxX;
        minY = terrainBounds.minY;
        maxY = terrainBounds.maxY;
    }
    let tw = Math.max(1, Math.round(maxX - minX));
    let th = Math.max(1, Math.round(maxY - minY));
    let sizeMismatch = terrainCanvas.width !== tw || terrainCanvas.height !== th;

    let doFull = wodTerrainNeedFullRebuild || !wodTerrainBaseBuilt || sizeMismatch;
    if(doFull) {
        terrainCanvas.width = tw;
        terrainCanvas.height = th;
        gameData._fogCanvasDirty = true;
        terrainBaseCanvas.width = tw;
        terrainBaseCanvas.height = th;

        terrainBaseCtx.fillStyle = getTerrainColor('water');
        terrainBaseCtx.fillRect(0, 0, terrainBaseCanvas.width, terrainBaseCanvas.height);

        if(gameData.terrainViewMode === 'schematic') {
            drawTerrainSchematicMap(terrainBaseCtx, -terrainBounds.minX, -terrainBounds.minY);
        } else if(wodBoardMapActive()) {
            WodBoardArt.terrain(terrainBaseCtx,wodBoardMapActive(),gameData.hexList,wodHdRegionGeometry(),wodTraceCellRegion,gameData.hexRadius*1.35,-terrainBounds.minX,-terrainBounds.minY);
        } else if(wodHdMapActive()) {
            wodDrawHdTerrain(terrainBaseCtx,-terrainBounds.minX,-terrainBounds.minY);
        } else {
            let paintOrder = ['water', 'sand', 'grass', 'forest', 'swamp', 'hill', 'mountain', 'urban'];
            for(let type of paintOrder) {
                drawTerrainBlobLayer(terrainBaseCtx, type, -terrainBounds.minX, -terrainBounds.minY);
            }
            drawTerrainTopography(terrainBaseCtx, -terrainBounds.minX, -terrainBounds.minY);
            drawForestTreeDecorations(terrainBaseCtx, -terrainBounds.minX, -terrainBounds.minY);
            drawMountainRockDecorations(terrainBaseCtx, -terrainBounds.minX, -terrainBounds.minY);
            drawTerrainWaterRipples(terrainBaseCtx, -terrainBounds.minX, -terrainBounds.minY);
            drawUrbanTerrainDetails(terrainBaseCtx, -terrainBounds.minX, -terrainBounds.minY);
            wodRoundTerrainCorners(terrainBaseCtx,-terrainBounds.minX,-terrainBounds.minY);
        }
        wodTerrainBaseBuilt = true;
        wodTerrainNeedFullRebuild = false;
    }

    terrainCtx.setTransform(1, 0, 0, 1, 0, 0);
    terrainCtx.fillStyle = getTerrainColor('water');
    terrainCtx.fillRect(0, 0, terrainCanvas.width, terrainCanvas.height);
    terrainCtx.drawImage(terrainBaseCanvas, 0, 0);

    drawTerritoryOverlay(terrainCtx, -terrainBounds.minX, -terrainBounds.minY);
    wodRedrawBorderLayer();
    if(gameData.layers.diplomacy && wodBorderLayerCanvas)
        terrainCtx.drawImage(wodBorderLayerCanvas, 0, 0);

    wodTerrainPoliticalDirty = false;
    wodTerrainNeedFullRebuild = false;
    terrainNeedsUpdate = false;
    wodTerrainLastBakeCostMs = performance.now() - bakeStartMs;
}
// Trace the union of lattice cells, keeping the filled region on the right.
// Right turns at diagonal contacts keep separate islands/passages separate.
function wodCellRegionLoops(keys) {
    const edges=[],starts=new Map(),has=(q,r)=>keys.has(`${q},${r}`);
    const add=(x,y,dx,dy,dir)=>{const e={x,y,ex:x+dx,ey:y+dy,dir,used:false};edges.push(e);const key=x+','+y;if(!starts.has(key))starts.set(key,[]);starts.get(key).push(e);};
    for(const key of keys) {
        const [q,r]=key.split(',').map(Number),x=q*2,y=r*2;
        if(!has(q,r-1))add(x-1,y-1,2,0,0);
        if(!has(q+1,r))add(x+1,y-1,0,2,1);
        if(!has(q,r+1))add(x+1,y+1,-2,0,2);
        if(!has(q-1,r))add(x-1,y+1,0,-2,3);
    }
    const loops=[];
    for(const first of edges) {
        if(first.used)continue;
        const points=[];let e=first,guard=0;
        while(e&&!e.used&&guard++<=edges.length) {
            e.used=true;points.push({x:e.x*.5,y:e.y*.5});
            if(e.ex===first.x&&e.ey===first.y)break;
            const candidates=(starts.get(e.ex+','+e.ey)||[]).filter(n=>!n.used);
            const rank=n=>{const turn=(n.dir-e.dir+4)%4;return turn===1?0:turn===0?1:turn===3?2:3;};
            candidates.sort((a,b)=>rank(a)-rank(b));e=candidates[0];
        }
        if(points.length<3)continue;
        // Eliminate straight intermediate vertices before rounding.
        const simple=points.filter((p,i)=>{const a=points[(i+points.length-1)%points.length],b=points[(i+1)%points.length];return (p.x-a.x)*(b.y-p.y)!==(p.y-a.y)*(b.x-p.x);});
        if(simple.length>=3) {
            // Sample long edges evenly before applying the same bounded
            // smoothing as frontlines. This removes the cell staircase
            // while keeping narrow passages and cell centers intact.
            const sampled=[];
            for(let i=0;i<simple.length;i++) {
                const a=simple[i],b=simple[(i+1)%simple.length],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*2));
                for(let j=0;j<steps;j++)sampled.push({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps});
            }
            loops.push(wodSmoothDiplomacyBorderPoints(sampled,1,true));
        }
    }
    return loops;
}
function wodTraceCellRegion(ctx,loops,spacing,ox=0,oy=0,radius=.5) {
    ctx.beginPath();
    for(const loop of loops) {
        const points=loop.map(p=>({x:p.x*spacing+ox,y:p.y*spacing+oy}));
        const turns=points.map((p,i)=>{
            const prev=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length],a=Math.hypot(p.x-prev.x,p.y-prev.y),b=Math.hypot(next.x-p.x,next.y-p.y),r=Math.min(spacing*radius,a*.49,b*.49);
            return {p,enter:{x:p.x+(prev.x-p.x)*r/a,y:p.y+(prev.y-p.y)*r/a},exit:{x:p.x+(next.x-p.x)*r/b,y:p.y+(next.y-p.y)*r/b}};
        });
        ctx.moveTo(turns[0].enter.x,turns[0].enter.y);
        for(const t of turns){ctx.lineTo(t.enter.x,t.enter.y);ctx.quadraticCurveTo(t.p.x,t.p.y,t.exit.x,t.exit.y);}
        ctx.closePath();
    }
}
function wodHdRegionGeometry() {
    const byType=new Map(),land=new Set();let signature=2166136261;
    for(const h of gameData.hexList) {
        const type=h.type||'grass',key=getHexKey(h);
        if(!byType.has(type))byType.set(type,new Set());byType.get(type).add(key);
        if(!isWaterHex(h))land.add(key);
        for(let i=0;i<type.length;i++)signature=Math.imul(signature^type.charCodeAt(i),16777619);
    }
    const old=gameData._hdRegionGeometry;
    if(old&&old.hexes===gameData.hexes&&old.signature===signature)return old;
    const rec={hexes:gameData.hexes,signature,land:wodCellRegionLoops(land),types:new Map([...byType].map(([type,keys])=>[type,wodCellRegionLoops(keys)]))};
    gameData._hdRegionGeometry=rec;return rec;
}
// (neighbours are found through the hex index and their cached keys instead of building a "q,r" string for each
// of the four neighbours of every visible cell; the same cells are filled, in the same order)
function wodCloseTinyVisionHoles(visible,explored) {
    const candidates=new Set(),D=cardinalHexDirections;
    for(const key of visible){const h=gameData.hexes[key];if(!h)continue;for(const d of D){const n=wodHexAt(h.q+d.q,h.r+d.r);if(!n)continue;const k=getHexKey(n);if(!visible.has(k))candidates.add(k);}}
    const visited=new Set();
    for(const seed of candidates) {
        if(visited.has(seed))continue;
        const component=[seed],seen=new Set(component);let open=false;
        for(let i=0;i<component.length&&!open;i++) {
            const h=gameData.hexes[component[i]];
            for(const d of D) {
                const n=wodHexAt(h.q+d.q,h.r+d.r);
                if(!n){open=true;break;}
                const k=getHexKey(n);
                if(visible.has(k)||seen.has(k))continue;
                seen.add(k);component.push(k);if(component.length>2){open=true;break;}
            }
        }
        for(const k of seen)visited.add(k);
        if(!open)for(const k of component){visible.add(k);explored.add(k);}
    }
}
function wodHdMapActive() { return gameData._artPreviewMapId!=null?gameData._artPreviewMapId==='atlas_hd':!!(gameData.uiSettings && gameData.uiSettings.mapSkin==='atlas_hd' && wodOwnsShopVisual('map_atlas_hd')); }
function wodBoardMapActive() {
    const id=gameData._artPreviewMapId??gameData.uiSettings?.mapSkin,pack=WodStoreCatalog.mapPacks[id];
    return ['chalkboard','whiteboard'].includes(id)&&(gameData._artPreviewMapId!=null||wodOwnsShopVisual(pack.shopId))?id:null;
}
function wodWithArtPreview(id,period,drawFn) {
    const oldId=gameData._artPreviewMapId,oldEra=gameData._artPreviewPeriod;
    try{gameData._artPreviewMapId=id;gameData._artPreviewPeriod=period;return drawFn();}
    finally{gameData._artPreviewMapId=oldId;gameData._artPreviewPeriod=oldEra;}
}
function wodMapPackPreviewArt() {
    return {
        bridge:(ctx,id,x,y,era)=>wodWithArtPreview(id,era,()=>drawBridgeSticker(ctx,{x,y,w:62,h:20,owner:1},false,null)),
        unit:(ctx,id,u,r,col,era)=>wodWithArtPreview(id,era,()=>wodDrawUnitBodyUncached(ctx,u,r,col,id==='atlas_hd'?'atlasUnits':era==='modern'?(u.owner===2?gameData.aiUnitSkin:gameData.unitSkin)||'nato':era)),
        structure:(ctx,id,kind,x,y,col,scale,era)=>wodWithArtPreview(id,era,()=>{ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);const obj={x:0,y:0,owner:col===WodBoardArt.palette(id).red?2:1};if(kind==='city')drawCitySkinMarker(ctx,obj);else if(kind==='fort')drawFortSticker(ctx,obj,col,false,null,era);else if(kind==='hospital')wodDrawHospital(ctx,obj);else if(kind==='factory')drawPeriodFactoryIcon(ctx,0,0,era,false);else if(kind==='harbor')drawPeriodHarborIcon(ctx,0,0,era,false);else drawPeriodFarmIcon(ctx,0,0,era,false);ctx.restore();})};
}
function wodPreviewMapPack(id) {
    WodBoardArt.open(id,{era:wodGetRenderPeriod,names:period=>{
        const f=wodPeriodFlavor(period);return {light:f.light,motorized:wodSpecialistLabel('motorized',period),mountaineer:wodSpecialistLabel('mountaineer',period),marine:f.marine,heavy:f.heavy,ship:f.ship,transport:({modern:'Landing craft',napoleonic:'Troop transport',medieval:'Transport galley',ancient:'Troop barge'})[period],supply:({modern:'Supply ship',napoleonic:'Stores ship',medieval:'Supply cog',ancient:'Supply barge'})[period],convoy:f.convoyLand};
    },art:wodMapPackPreviewArt(),owned:skin=>wodOwnsShopVisual(WodStoreCatalog.mapPacks[skin].shopId),equipped:()=>gameData.uiSettings.mapSkin,price:skin=>WodStoreCatalog.mapPacks[skin].price,gold:()=>Math.floor(gameData.gold||0),equip:setShopMapSkin});
}
const WOD_HD_PALETTE={water:'#284d60',deep_water:'#203e50',sand:'#b4aa86',grass:'#747f53',forest:'#344c35',swamp:'#4a6655',hill:'#8c896d',mountain:'#848d89',urban:'#9c9787',bridge:'#827763'};
let wodHdTextureCache=null;
function wodHdHash(x,y) { const n=Math.sin(x*127.1+y*311.7)*43758.5453123;return n-Math.floor(n); }
function wodHdNoise(x,y,period) {
    const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
    const hash=(a,b)=>wodHdHash(((a%period)+period)%period,((b%period)+period)%period);
    return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v)+(hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;
}
function wodHdRockTexture(type) {
    return WodHdRelief.texture(type,wodHdHash,wodHdNoise);
}
function wodHdTextures(ctx) {
    if(!wodHdTextureCache) {
        wodHdTextureCache={};
        // Seamless world-anchored textures, created entirely with math and Canvas.
        // Shared across all map bakes, with no downloads or generated art assets.
        for(const [type,color] of Object.entries(WOD_HD_PALETTE)) {
            if(type==='mountain'||type==='hill'){wodHdTextureCache[type]=wodHdRockTexture(type);continue;}
            const c=document.createElement('canvas');c.width=c.height=256;
            const cc=c.getContext('2d'),im=cc.createImageData(256,256),base=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));
            const height=(x,y)=>{
                let f=wodHdNoise(x/64,y/64,4)*.50+wodHdNoise(x/32,y/32,8)*.24+wodHdNoise(x/8,y/8,32)*.17+wodHdNoise(x/2,y/2,128)*.09;
                if(type==='mountain'||type==='hill') {
                    const warp=wodHdNoise(x/64+2,y/64+3,4)*26;
                    const ridge=1-Math.abs(2*wodHdNoise((x+warp)/32,(y+warp*.6)/32,8)-1);
                    f=ridge*ridge*.65+f*.35;
                }
                return f;
            };
            for(let y=0;y<256;y++)for(let x=0;x<256;x++) {
                const n=height(x,y),grain=wodHdHash(x+19,y+7)-.5;
                const relief=(height(x-1,y-1)-height(x+1,y+1))*(type==='mountain'?380:type==='hill'?175:30);
                let shade=(n-.5)*(type==='mountain'?94:type==='forest'?65:43)+relief+grain*13;
                if(type==='water'||type==='deep_water')shade=(n-.5)*21+Math.sin(y*.58+n*4)*1.8+grain*2;
                const i=(y*256+x)*4;
                for(let k=0;k<3;k++)im.data[i+k]=Math.max(0,Math.min(255,base[k]+shade*(k===2?.85:1)));
                im.data[i+3]=255;
            }
            cc.putImageData(im,0,0);
            if(type==='forest'||type==='swamp') {
                for(let i=0;i<1900;i++) {
                    const x=wodHdHash(i,2)*256,y=wodHdHash(i,3)*256,r=1+wodHdHash(i,4)*2.4;
                    cc.fillStyle='rgba(12,25,16,.20)';cc.beginPath();cc.ellipse(x+1.1,y+1.7,r*1.15,r*.85,0,0,Math.PI*2);cc.fill();
                    const l=25+Math.floor(wodHdHash(i,5)*20);cc.fillStyle=`hsl(${91+wodHdHash(i,6)*22} 22% ${l}%)`;
                    cc.beginPath();cc.arc(x,y,r,0,Math.PI*2);cc.fill();
                    cc.fillStyle='rgba(174,182,116,.16)';cc.beginPath();cc.arc(x-r*.25,y-r*.3,r*.48,0,Math.PI*2);cc.fill();
                }
            }
            if(type==='grass') {
                // Agricultural field strips and sparse windbreaks at aerial scale.
                for(let i=0;i<38;i++) {
                    const x=wodHdHash(i,41)*256,y=wodHdHash(i,42)*256,w=8+wodHdHash(i,43)*28,h=4+wodHdHash(i,44)*14;
                    cc.fillStyle=i%2?'rgba(173,160,100,.11)':'rgba(39,63,39,.10)';cc.fillRect(x,y,w,h);
                    cc.strokeStyle='rgba(40,53,29,.14)';cc.lineWidth=.5;cc.strokeRect(x,y,w,h);
                }
            }
            wodHdTextureCache[type]=c;
        }
    }
    const patterns={};for(const [type,c] of Object.entries(wodHdTextureCache))patterns[type]=ctx.createPattern(c,'repeat');return patterns;
}
function wodDrawHdTerrain(ctx,ox,oy) {
    const sp=gameData.hexRadius*1.35,patterns=wodHdTextures(ctx),geometry=wodHdRegionGeometry();
    ctx.save();ctx.translate(ox,oy);
    // Paint one connected material per biome. All patterns remain anchored
    // to world coordinates, including editor/chunk redraws.
    let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const h of gameData.hexList){left=Math.min(left,h.x-sp);top=Math.min(top,h.y-sp);right=Math.max(right,h.x+sp);bottom=Math.max(bottom,h.y+sp);}
    ctx.fillStyle=patterns.water;ctx.fillRect(left,top,right-left,bottom-top);
    const deep=geometry.types.get('deep_water');if(deep){wodTraceCellRegion(ctx,deep,sp);ctx.fillStyle=patterns.deep_water;ctx.fill();}
    // A continuous coastal shelf replaces per-cell gradient rectangles.
    wodTraceCellRegion(ctx,geometry.land,sp);ctx.strokeStyle='rgba(100,166,164,.30)';ctx.lineWidth=sp*.48;ctx.lineJoin='round';ctx.stroke();
    ctx.save();wodTraceCellRegion(ctx,geometry.land,sp);ctx.clip();
    ctx.fillStyle=patterns.grass;ctx.fillRect(left,top,right-left,bottom-top);
    for(const type of ['sand','grass','forest','swamp','hill','mountain','urban','bridge']) {
        const loops=geometry.types.get(type);if(!loops)continue;
        wodTraceCellRegion(ctx,loops,sp);ctx.fillStyle=patterns[type]||patterns.grass;ctx.fill();
    }
    WodHdRelief.blendMargins(ctx,geometry,sp,wodTraceCellRegion);
    const towns=geometry.types.get('urban');
    if(towns) {
        ctx.save();wodTraceCellRegion(ctx,towns,sp);ctx.clip();
        for(const h of gameData.hexList)if(h.type==='urban') {
            const seed=h.q*113+h.r*29;
            ctx.strokeStyle='rgba(203,195,168,.8)';ctx.lineWidth=sp*.10;
            ctx.beginPath();ctx.moveTo(h.x-sp/2,h.y);ctx.lineTo(h.x+sp/2,h.y);ctx.moveTo(h.x,h.y-sp/2);ctx.lineTo(h.x,h.y+sp/2);ctx.stroke();
            for(let i=0;i<7;i++) {
                const x=h.x+(wodHdHash(seed,i)-.5)*sp*.80,y=h.y+(wodHdHash(seed+9,i)-.5)*sp*.80,w=sp*(.10+wodHdHash(seed+4,i)*.13),hh=sp*.13;
                ctx.fillStyle='rgba(24,29,27,.44)';ctx.fillRect(x+1.3,y+1.7,w,hh);ctx.fillStyle=i%3?'#c0b49a':'#7c7970';ctx.fillRect(x,y,w,hh);ctx.fillStyle='rgba(237,219,178,.47)';ctx.fillRect(x,y,w,.6);
            }
        }
        ctx.restore();
    }
    ctx.restore();
    wodTraceCellRegion(ctx,geometry.land,sp);ctx.strokeStyle='rgba(192,214,190,.25)';ctx.lineWidth=.7;ctx.stroke();
    ctx.restore();
}
function wodDrawHdUnit(ctx,u,r,color) {
    const era=typeof wodGetRenderPeriod==='function'?wodGetRenderPeriod():'modern',old=era==='ancient'||era==='medieval',early=old||era==='napoleonic';
    ctx.save();ctx.scale(r/12,r/12);
    ctx.fillStyle='rgba(8,16,18,.28)';ctx.beginPath();ctx.ellipse(1,3,15,10,0,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle=color;ctx.lineWidth=1.4;ctx.globalAlpha=.9;ctx.beginPath();ctx.ellipse(0,0,16,12,0,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;
    ctx.rotate(typeof getUnitFacingAngle==='function'?getUnitFacingAngle(u):0);
    const metal=(a,b)=>{const g=ctx.createLinearGradient(-9,-9,8,9);g.addColorStop(0,a);g.addColorStop(.48,b);g.addColorStop(1,'#30362d');return g;};
    if(u.type==='ship'||u.type==='convoy'&&u.convoySeaRoute) {
        ctx.fillStyle=metal(early?'#b7a17a':'#b3bfc0',early?'#70523a':'#68777a');ctx.strokeStyle='#26343a';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(18,0);ctx.bezierCurveTo(8,-8,-9,-7,-16,-4);ctx.lineTo(-16,4);ctx.bezierCurveTo(-9,7,8,8,18,0);ctx.fill();ctx.stroke();
        ctx.fillStyle=early?'#a18559':'#858f8b';ctx.fillRect(-10,-3,20,6);
        if(early){ctx.strokeStyle='#52442c';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-10);ctx.lineTo(0,9);ctx.stroke();ctx.fillStyle='#e5ddc0';ctx.beginPath();ctx.moveTo(1,-9);ctx.lineTo(9,1);ctx.lineTo(1,6);ctx.fill();}
        else {ctx.fillStyle='#c2c8bd';ctx.fillRect(-3,-3.5,8,7);ctx.fillStyle='#343e3b';ctx.fillRect(-8,-2,3,4);for(const x of [-11,9]){ctx.fillStyle='#8e9997';ctx.beginPath();ctx.arc(x,0,2.2,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#bac4bc';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+5,0);ctx.stroke();}}
    } else if(u.type==='heavy'&&!early) {
        ctx.fillStyle='#252c28';ctx.fillRect(-12,-9,23,5);ctx.fillRect(-12,4,23,5);
        ctx.strokeStyle='#899184';ctx.lineWidth=.65;for(let x=-11;x<11;x+=2.5){ctx.beginPath();ctx.moveTo(x,-9);ctx.lineTo(x,-4);ctx.moveTo(x,4);ctx.lineTo(x,9);ctx.stroke();}
        ctx.fillStyle=metal('#a1aa87','#687751');ctx.fillRect(-11,-5,23,10);ctx.strokeStyle='#c0c3a1';ctx.lineWidth=.7;ctx.strokeRect(-10,-4,21,8);
        ctx.fillStyle=metal('#b6baa0','#788361');ctx.beginPath();ctx.ellipse(1,0,7,4.5,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#273026';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(20,0);ctx.stroke();ctx.strokeStyle='#9ca78d';ctx.lineWidth=1.4;ctx.stroke();
        ctx.fillStyle='#30382d';ctx.beginPath();ctx.arc(-1,-1,1.8,0,Math.PI*2);ctx.fill();ctx.fillStyle=color;ctx.fillRect(-9,-3,3,2);
    } else if(u.type==='heavy'&&era==='napoleonic') {
        ctx.fillStyle='#735c3b';ctx.fillRect(-8,-4,15,8);ctx.strokeStyle='#302d25';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(-6,-8);ctx.lineTo(-6,8);ctx.stroke();
        for(const y of [-7,7]){ctx.strokeStyle='#b5a17b';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(-6,y,4,2.5,0,0,Math.PI*2);ctx.stroke();}
        ctx.strokeStyle='#454b3e';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(-5,0);ctx.lineTo(14,0);ctx.stroke();ctx.strokeStyle='#b4b59c';ctx.lineWidth=1.8;ctx.stroke();
    } else if(u.type==='convoy'&&early) {
        ctx.fillStyle='#322f25';for(const y of [-6,6])for(const x of [-10,0]){ctx.beginPath();ctx.ellipse(x,y,3,1.6,0,0,Math.PI*2);ctx.fill();}
        ctx.fillStyle='#9d8d66';ctx.fillRect(-12,-5,16,10);ctx.fillStyle=metal('#d0c3a4','#a5997b');ctx.beginPath();ctx.ellipse(-4,0,8,5,0,0,Math.PI*2);ctx.fill();
        ctx.strokeStyle='#756344';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(3,-3);ctx.lineTo(12,-3);ctx.moveTo(3,3);ctx.lineTo(12,3);ctx.stroke();ctx.fillStyle='#63503a';ctx.beginPath();ctx.ellipse(12,0,6,2.7,0,0,Math.PI*2);ctx.fill();ctx.fillRect(15,-3,3,3);
    } else if(u.type==='convoy') {
        ctx.fillStyle='#272d29';for(const x of [-8,8])for(const y of [-6,6])ctx.fillRect(x-2,y-2,4,4);
        ctx.fillStyle=metal('#aba68a','#706f51');ctx.fillRect(-13,-5,19,10);ctx.fillStyle='#bbb89a';ctx.fillRect(-11,-4,16,8);
        ctx.fillStyle='#7d8869';ctx.fillRect(7,-5,6,10);ctx.fillStyle='#303f41';ctx.fillRect(10,-3,2,6);
    } else {
        const count=u.type==='heavy'&&old?3:6;
        for(let i=0;i<count;i++) {
            const x=(i%3-1)*9,y=(Math.floor(i/3)-.5)*12;
            ctx.save();ctx.translate(x,y);
            if(u.type==='heavy'&&old){ctx.fillStyle='#604a34';ctx.beginPath();ctx.ellipse(0,2,7,3.4,0,0,Math.PI*2);ctx.fill();ctx.fillRect(4,-2,3,4);ctx.strokeStyle='#332d24';ctx.lineWidth=1.3;ctx.beginPath();ctx.moveTo(-4,4);ctx.lineTo(-6,6);ctx.moveTo(3,4);ctx.lineTo(4,6);ctx.stroke();}
            ctx.strokeStyle='#2b3027';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-2,1);ctx.lineTo(-4,3);ctx.moveTo(-2,-1);ctx.lineTo(-4,-3);ctx.stroke();
            ctx.fillStyle=old?'#8b7153':u.type==='marine'?'#63755c':'#858666';ctx.beginPath();ctx.ellipse(0,0,3,2.3,0,0,Math.PI*2);ctx.fill();
            ctx.strokeStyle=old?'#bdb8a1':'#383d35';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(1,2);ctx.lineTo(old?11:7,2);ctx.stroke();
            ctx.fillStyle=era==='napoleonic'?'#333a36':old?'#a9a18b':'#a0a385';ctx.beginPath();ctx.arc(1,0,1.7,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(224,223,184,.55)';ctx.beginPath();ctx.arc(1,-.5,.75,0,Math.PI*2);ctx.fill();
            if(old){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(-.5,-2.1,2.6,1.1,0,0,Math.PI*2);ctx.fill();}
            ctx.restore();
        }
    }
    ctx.restore();
}
function wodFillCellSquare(ctx,hex,ox,oy,sp) {
    const x=Math.round(hex.x+ox-sp/2),y=Math.round(hex.y+oy-sp/2);
    ctx.fillRect(x,y,Math.round(hex.x+ox+sp/2)-x,Math.round(hex.y+oy+sp/2)-y);
}
function drawTerrainCell(ctx, hex, offsetX, offsetY) {
    const sp=gameData.hexRadius*1.35;
    ctx.fillStyle=getTerrainColor(hex.type);
    wodFillCellSquare(ctx,hex,offsetX,offsetY,sp);
}
// Round minority corners and disambiguate old checkerboard terrain joins.
// Water wins a wet/dry saddle, so rendering never invents a dry sea bridge.
function wodRoundTerrainCorners(ctx, ox, oy, paint, filter, list) {
    const sp=gameData.hexRadius*1.35, radius=sp*.5;
    for(const h of list||gameData.hexList) {
        if(wodDrawHexSet && !wodDrawHexSet.has(getHexKey(h))) continue;
        for(const sx of [-1,1]) for(const sy of [-1,1]) {
            const a=wodHexAt(h.q+sx,h.r),b=wodHexAt(h.q,h.r+sy),c=wodHexAt(h.q+sx,h.r+sy);
            if(!a||!b||!c||a.type===h.type||a.type!==b.type||a.type!==c.type&&c.type!==h.type)continue;
            if(c.type===h.type) {
                let winner;
                if(isWaterHex(a)!==isWaterHex(h))winner=isWaterHex(a)?a.type:h.type;
                else {
                    let side=0,diagonal=0;
                    const q=Math.min(h.q,c.q),r=Math.min(h.r,c.r);
                    for(let x=q-1;x<=q+2;x++)for(let y=r-1;y<=r+2;y++){
                        const type=wodHexAt(x,y)?.type;if(type===a.type)side++;if(type===h.type)diagonal++;
                    }
                    winner=side===diagonal?[a.type,h.type].sort()[0]:side>diagonal?a.type:h.type;
                }
                if(winner!==a.type)continue;
            }
            if(filter&&!filter(h,a))continue;
            // Match the pixel-snapped cell fill exactly. Half-pixel
            // cutouts left thin L-shaped strips of land in the ocean.
            const x=Math.round(h.x+ox+sx*sp/2),y=Math.round(h.y+oy+sy*sp/2);
            ctx.fillStyle=paint?paint(a.type):getTerrainColor(a.type);
            ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-sx*radius,y);
            ctx.bezierCurveTo(x-sx*radius*.447715,y,x,y-sy*radius*.447715,x,y-sy*radius);ctx.closePath();ctx.fill();
        }
    }
}
function wodMaskTerritoryWaterCorners(ctx,ox,oy,list) {
    if(wodHdMapActive()||wodBoardMapActive()) {
        ctx.save();ctx.globalCompositeOperation='destination-in';ctx.fillStyle='#000';
        wodTraceCellRegion(ctx,wodHdRegionGeometry().land,gameData.hexRadius*1.35,ox,oy);ctx.fill();ctx.restore();return;
    }
    ctx.save();ctx.globalCompositeOperation='destination-out';
    wodRoundTerrainCorners(ctx,ox,oy,()=>'#000',(h,a)=>!isWaterHex(h)&&isWaterHex(a),list);
    ctx.restore();
}
function wodCornerPinchedOwner(cells,lookup) {
    const q=cells[0].q,r=cells[0].r;
    const connected=(a,b)=>{
        const queue=[a],seen=new Set([getHexKey(a)]);
        for(let i=0;i<queue.length;i++)for(const d of cardinalHexDirections){
            const h=lookup[`${queue[i].q+d.q},${queue[i].r+d.r}`],k=h&&getHexKey(h);
            if(!h||isWaterHex(h)||h.owner!==a.owner||seen.has(k)||Math.abs(h.q-q)>3||Math.abs(h.r-r)>3)continue;
            if(h===b)return true;seen.add(k);queue.push(h);
        }
        return false;
    };
    const support=(a,b)=>Number(connected(a,b))*32+[a,b].reduce((sum,h)=>sum+cardinalHexDirections.filter(d=>{const n=lookup[`${h.q+d.q},${h.r+d.r}`];return n&&!isWaterHex(n)&&n.owner===h.owner;}).length,0);
    return support(cells[0],cells[3])<=support(cells[1],cells[2])?cells[0].owner:cells[1].owner;
}
// Political colors use the same corner decision as the border tracer.
// Full and patched bakes must not leave square claims outside a curve.
function wodRoundPoliticalCorners(ctx,ox,oy,list) {
    const sp=gameData.hexRadius*1.35,radius=sp*.44;
    for(const h of list||gameData.hexList){
      if(!h.owner||isWaterHex(h))continue;
      for(const sx of [-1,1])for(const sy of [-1,1]){
        const a=wodHexAt(h.q+sx,h.r),b=wodHexAt(h.q,h.r+sy),c=wodHexAt(h.q+sx,h.r+sy);
        if(!a||!b||!c||!a.owner||!b.owner||!c.owner||h.owner===a.owner||a.owner!==b.owner||c.owner!==a.owner&&c.owner!==h.owner||isWaterHex(a)||isWaterHex(b)||isWaterHex(c))continue;
        if(c.owner===h.owner){
            const q=Math.min(h.q,c.q),r=Math.min(h.r,c.r),cells=[[q,r],[q+1,r],[q,r+1],[q+1,r+1]].map(([x,y])=>wodHexAt(x,y));
            if(h.owner!==wodCornerPinchedOwner(cells,gameData.hexes))continue;
        }
        const x=Math.round(h.x+ox+sx*sp/2),y=Math.round(h.y+oy+sy*sp/2);
        ctx.fillStyle=factionColors[a.owner];ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-sx*radius,y);
        ctx.quadraticCurveTo(x,y,x,y-sy*radius);ctx.closePath();ctx.fill();
      }
    }
}
function drawTerrainSchematicMap(ctx, offsetX, offsetY) {
    const sp=gameData.hexRadius*1.35;
    for(const h of gameData.hexList) {
        if(wodDrawHexSet&&!wodDrawHexSet.has(getHexKey(h)))continue;
        ctx.fillStyle=isWaterHex(h)?getTerrainColor('water'):'#f7f9fc';
        wodFillCellSquare(ctx,h,offsetX,offsetY,sp);
    }
    wodRoundTerrainCorners(ctx,offsetX,offsetY,type=>type==='water'||type==='deep_water'?getTerrainColor('water'):'#f7f9fc');
}
function drawTerritoryOverlay(ctx, offsetX, offsetY) {
    if(!gameData.layers.territory) return;
    let spacing = gameData.hexRadius * 1.35;
    let discR = spacing * 0.78;
    let w = ctx.canvas.width, h = ctx.canvas.height;
    if(!territoryOverlayCanvas) territoryOverlayCanvas = document.createElement('canvas');
    if(territoryOverlayCanvas.width !== w || territoryOverlayCanvas.height !== h) {
        territoryOverlayCanvas.width = w;
        territoryOverlayCanvas.height = h;
    }
    let overlayCtx = territoryOverlayCanvas.getContext('2d');
    overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
    overlayCtx.clearRect(0, 0, w, h);
    for(const hex of gameData.hexList) {
        if(hex.owner<=0||isWaterHex(hex))continue;
        overlayCtx.fillStyle=factionColors[hex.owner];
        wodFillCellSquare(overlayCtx,hex,offsetX,offsetY,spacing);
    }
    wodRoundPoliticalCorners(overlayCtx,offsetX,offsetY);
    wodMaskTerritoryWaterCorners(overlayCtx,offsetX,offsetY);
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.drawImage(territoryOverlayCanvas, 0, 0);
    ctx.restore();
}
function terrainElevProxy(hex) {
    if(!hex || isWaterHex(hex)) return 0.05;
    if(hex.type === 'mountain') return 0.97;
    if(hex.type === 'hill') return 0.74;
    if(hex.type === 'forest') return 0.55;
    if(hex.type === 'urban') return 0.52;
    if(hex.type === 'grass') return 0.46;
    if(hex.type === 'sand') return 0.37;
    if(hex.type === 'swamp') return 0.27;
    if(hex.type === 'bridge') return 0.4;
    return 0.44;
}
/** Continuous noise elevation — hex type only biases height, never radial hex blobs. */
function wodSampleTopoElev(wx, wy) {
    let center = getNearestHexToPoint(wx, wy);
    let typeBias = 0.42;
    if(center) {
        if(isWaterHex(center)) return 0.05;
        if(center.type === 'bridge') return 0.22;
        typeBias = terrainElevProxy(center);
        // Soft neighbor blend so biome steps don't stamp hex discs.
        let sum = typeBias * 2, wsum = 2;
        for(let di = 0; di < hexDirections.length; di++) {
            let dir = hexDirections[di];
            let n = wodHexAt(center.q + dir.q,center.r + dir.r);
            if(!n || isWaterHex(n)) continue;
            sum += terrainElevProxy(n);
            wsum++;
        }
        typeBias = sum / wsum;
    }

    // Domain-warped multi-octave relief — long ridges / valleys, not circular mounds.
    let warpX = (fbm(wx * 0.0048 + 17.1, wy * 0.0048 + 9.4, 3) - 0.5) * 38;
    let warpY = (fbm(wx * 0.0048 + 61.2, wy * 0.0048 + 33.7, 3) - 0.5) * 38;
    let x = wx + warpX, y = wy + warpY;
    let n1 = fbm(x * 0.0062 + 3.1, y * 0.0062 + 1.7, 5);
    let n2 = fbm(x * 0.0145 + 22.4, y * 0.0145 + 14.8, 4);
    let n3 = fbm(x * 0.031 + 55.0, y * 0.031 + 41.2, 3);
    // Ridged component for mountain/hill spines
    let ridge = 1 - Math.abs(n2 * 2 - 1);
    ridge = ridge * ridge;
    let crumple = (n1 - 0.5) * 0.34 + (ridge - 0.5) * 0.22 + (n3 - 0.5) * 0.08;
    if(center) {
        if(center.type === 'mountain') crumple = crumple * 1.35 + ridge * 0.12;
        else if(center.type === 'hill') crumple = crumple * 1.18 + ridge * 0.06;
        else if(center.type === 'urban') crumple *= 0.42;
        else if(center.type === 'forest') crumple *= 0.72;
        else if(center.type === 'sand') crumple *= 0.38;
        else if(center.type === 'swamp') crumple *= 0.45;
    }
    return Math.max(0.05, Math.min(1.08, typeBias * 0.62 + 0.22 + crumple));
}
function wodBlurFloatGrid(src, w, h, passes) {
    let a = src, b = new Float32Array(src.length);
    for(let p = 0; p < passes; p++) {
        for(let y = 0; y < h; y++) {
            for(let x = 0; x < w; x++) {
                let i = y * w + x;
                let s = a[i] * 4;
                let c = 4;
                if(x > 0) { s += a[i - 1] * 2; c += 2; }
                if(x < w - 1) { s += a[i + 1] * 2; c += 2; }
                if(y > 0) { s += a[i - w] * 2; c += 2; }
                if(y < h - 1) { s += a[i + w] * 2; c += 2; }
                if(x > 0 && y > 0) { s += a[i - w - 1]; c++; }
                if(x < w - 1 && y > 0) { s += a[i - w + 1]; c++; }
                if(x > 0 && y < h - 1) { s += a[i + w - 1]; c++; }
                if(x < w - 1 && y < h - 1) { s += a[i + w + 1]; c++; }
                b[i] = s / c;
            }
        }
        let t = a; a = b; b = t;
    }
    return a;
}
/** Continuous cartographic hillshade — soft ridges/valleys, no circular hex blobs. */
function drawTerrainTopography(ctx, offsetX, offsetY) {
    if(!gameData.layers || gameData.terrainViewMode === 'schematic') return;
    let w = ctx.canvas.width | 0, h = ctx.canvas.height | 0;
    if(w < 8 || h < 8) return;
    let hr = gameData.hexRadius || 20;
    let step = Math.max(2, Math.min(4, Math.round(hr * 0.18)));
    let sw = Math.ceil(w / step), sh = Math.ceil(h / step);
    let elevRaw = new Float32Array(sw * sh);
    let land = new Uint8Array(sw * sh);
    for(let sy = 0; sy < sh; sy++) {
        let wy = sy * step - offsetY;
        for(let sx = 0; sx < sw; sx++) {
            let wx = sx * step - offsetX;
            let hex = getNearestHexToPoint(wx, wy);
            let i = sy * sw + sx;
            if(!hex || isWaterHex(hex) || hex.type === 'bridge') {
                elevRaw[i] = hex && isWaterHex(hex) ? 0.04 : 0.16;
                land[i] = 0;
                continue;
            }
            elevRaw[i] = wodSampleTopoElev(wx, wy);
            land[i] = 1;
        }
    }
    let elev = wodBlurFloatGrid(elevRaw, sw, sh, 4);
    if(!gameData._topoShadeCanvas) gameData._topoShadeCanvas = document.createElement('canvas');
    let oc = gameData._topoShadeCanvas;
    if(oc.width !== sw || oc.height !== sh) {
        oc.width = sw;
        oc.height = sh;
    }
    let octx = oc.getContext('2d', { willReadFrequently: true });
    let img = octx.createImageData(sw, sh);
    let data = img.data;
    // Northwest light — classic map relief
    let Lx = -0.42, Ly = -0.58, Lz = 0.7;
    let vert = 1.85;
    for(let sy = 0; sy < sh; sy++) {
        for(let sx = 0; sx < sw; sx++) {
            let i = sy * sw + sx;
            let p = i * 4;
            if(!land[i]) {
                data[p] = data[p + 1] = data[p + 2] = 0;
                data[p + 3] = 0;
                continue;
            }
            // Feather out at the waterline instead of hard dark/light rings.
            let coastNear = 0;
            for(let oy = -1; oy <= 1; oy++) {
                for(let ox = -1; ox <= 1; ox++) {
                    if(!ox && !oy) continue;
                    let nx = sx + ox, ny = sy + oy;
                    if(nx < 0 || ny < 0 || nx >= sw || ny >= sh) continue;
                    if(!land[ny * sw + nx]) coastNear++;
                }
            }
            if(coastNear >= 3) {
                data[p] = data[p + 1] = data[p + 2] = 0;
                data[p + 3] = 0;
                continue;
            }
            let eL = elev[sy * sw + Math.max(0, sx - 1)];
            let eR = elev[sy * sw + Math.min(sw - 1, sx + 1)];
            let eU = elev[Math.max(0, sy - 1) * sw + sx];
            let eD = elev[Math.min(sh - 1, sy + 1) * sw + sx];
            let dx = (eR - eL) * vert;
            let dy = (eD - eU) * vert;
            let nx = -dx, ny = -dy, nz = 1;
            let inv = 1 / Math.hypot(nx, ny, nz);
            let ndot = (nx * inv) * Lx + (ny * inv) * Ly + (nz * inv) * Lz;
            // Soft Lambert + ambient — avoid clipped black/white discs
            let shade = 0.62 + 0.48 * ndot;
            shade = Math.max(0.42, Math.min(1.12, shade));
            let coastFade = coastNear ? Math.max(0.15, 1 - coastNear * 0.28) : 1;
            // Shadow-only relief — highlights as white discs were reading as circles.
            if(shade >= 0.98) {
                data[p] = data[p + 1] = data[p + 2] = 0;
                data[p + 3] = 0;
            } else {
                let t = (0.98 - shade);
                let a = Math.min(72, Math.round(t * 125 * coastFade));
                data[p] = 32;
                data[p + 1] = 40;
                data[p + 2] = 28;
                data[p + 3] = a;
            }
        }
    }
    octx.putImageData(img, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha = 0.88;
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(oc, 0, 0, sw, sh, 0, 0, w, h);
    ctx.restore();
}
function drawForestTreeDecorations(ctx, offsetX, offsetY) {
    if(!gameData.layers || gameData.terrainViewMode === 'schematic') return;
    let spacing = gameData.hexRadius * 1.35;

    function det01(q, r, salt) {
        let x = Math.sin(q * 12.9898 + r * 78.233 + salt) * 43758.5453;
        return x - Math.floor(x);
    }

    // Soft ground contact under upright crowns (NW light → slight SE offset).
    // Keep shadows nearly round — long rotated ellipses read as sideways trees.
    let shadowDx = 0.42;
    let shadowDy = 0.28;

    for(let hex of gameData.hexList) {
        if(wodDrawHexSet && !wodDrawHexSet.has(hex.q + ',' + hex.r)) continue;
        if(hex.type !== 'forest') continue;
        if(det01(hex.q, hex.r, 9.4) < 0.04) continue;
        let bx = hex.x + offsetX, by = hex.y + offsetY;
        let nTrees = 6 + Math.floor(det01(hex.q, hex.r, 2.31) * 5);
        for(let ti = 0; ti < nTrees; ti++) {
            let u1 = det01(hex.q + ti * 3, hex.r - ti, 0.71);
            let u2 = det01(hex.q - ti * 5, hex.r + ti * 7, 1.93);
            let u3 = det01(hex.q + ti, hex.r + ti * 2, 4.2);
            let tx = bx + (u1 - 0.5) * spacing * 0.9;
            let ty = by + (u2 - 0.5) * spacing * 0.82;
            let crownR = spacing * (0.13 + (u1 + u2) * 0.04);
            let sx = tx + shadowDx * crownR * 0.85;
            let sy = ty + shadowDy * crownR * 0.85 + crownR * 0.22;
            // Soft, mostly round contact shadow under the canopy.
            ctx.fillStyle = 'rgba(8, 16, 10, 0.18)';
            ctx.beginPath();
            ctx.ellipse(sx, sy, crownR * 0.92, crownR * 0.58, 0.18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(6, 14, 8, 0.16)';
            ctx.beginPath();
            ctx.ellipse(sx + crownR * 0.06, sy + crownR * 0.04, crownR * 0.62, crownR * 0.4, 0.12, 0, Math.PI * 2);
            ctx.fill();
            // Short trunk so the form reads upright, not a flat sideways blob.
            ctx.fillStyle = '#3a2a18';
            ctx.fillRect(tx - crownR * 0.1, ty + crownR * 0.15, crownR * 0.2, crownR * 0.55);
            // Dark canopy base (slightly taller than wide).
            ctx.fillStyle = '#12301c';
            ctx.beginPath();
            ctx.ellipse(tx + crownR * 0.02, ty - crownR * 0.08, crownR * 0.78, crownR * 0.98, 0, 0, Math.PI * 2);
            ctx.fill();
            // Mid canopy volume.
            ctx.fillStyle = '#1d5a2c';
            ctx.beginPath();
            ctx.ellipse(tx - crownR * 0.08, ty - crownR * 0.28, crownR * 0.62, crownR * 0.78, 0, 0, Math.PI * 2);
            ctx.fill();
            // Lit lobe (popcorn highlight).
            ctx.fillStyle = '#2f7a3f';
            ctx.beginPath();
            ctx.ellipse(tx + crownR * 0.18, ty - crownR * 0.22, crownR * 0.42, crownR * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            // Specular highlight top-left.
            ctx.fillStyle = 'rgba(130, 195, 110, ' + (0.48 + u3 * 0.2) + ')';
            ctx.beginPath();
            ctx.ellipse(tx - crownR * 0.22, ty - crownR * 0.52, crownR * 0.22, crownR * 0.28, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
function drawMountainRockDecorations(ctx, offsetX, offsetY) {
    if(!gameData.layers || gameData.terrainViewMode === 'schematic') return;
    let spacing = gameData.hexRadius * 1.35;
    function det01(q, r, salt) {
        let x = Math.sin(q * 19.17 + r * 41.33 + salt) * 43758.5453;
        return x - Math.floor(x);
    }
    for(let hex of gameData.hexList) {
        if(wodDrawHexSet && !wodDrawHexSet.has(hex.q + ',' + hex.r)) continue;
        if(hex.type !== 'mountain' && hex.type !== 'hill') continue;
        let density = det01(hex.q, hex.r, 8.2);
        let bx = hex.x + offsetX, by = hex.y + offsetY;
        let isMount = hex.type === 'mountain';
        if((isMount && density < 0.34) || (!isMount && density < 0.7)) continue;
        let peaks = isMount && density > 0.78 ? 2 : 1;
        for(let pi = 0; pi < peaks; pi++) {
            let u1 = det01(hex.q + pi, hex.r - pi, 1.1);
            let u2 = det01(hex.q - pi, hex.r + pi, 2.7);
            let px = bx + (u1 - 0.5) * spacing * (isMount ? 0.5 : 0.34);
            let py = by + (u2 - 0.5) * spacing * (isMount ? 0.38 : 0.26);
            let h = spacing * (isMount ? (0.43 + u1 * 0.2) : (0.24 + u1 * 0.12));
            let w = spacing * (isMount ? (0.52 + u2 * 0.18) : (0.38 + u2 * 0.12));
            ctx.fillStyle = isMount ? 'rgba(72, 62, 48, 0.58)' : 'rgba(90, 68, 42, 0.45)';
            ctx.beginPath();
            ctx.moveTo(px - w * 0.62, py + h * 0.33);
            ctx.lineTo(px - w * 0.28, py - h * 0.16);
            ctx.lineTo(px - w * 0.04, py - h);
            ctx.lineTo(px + w * 0.19, py - h * 0.2);
            ctx.lineTo(px + w * 0.62, py + h * 0.33);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = isMount ? 'rgba(176, 162, 138, 0.58)' : 'rgba(186, 154, 108, 0.48)';
            ctx.beginPath();
            ctx.moveTo(px - w * 0.04, py - h);
            ctx.lineTo(px + w * 0.19, py - h * 0.2);
            ctx.lineTo(px + w * 0.1, py + h * 0.18);
            ctx.lineTo(px - w * 0.12, py - h * 0.28);
            ctx.closePath();
            ctx.fill();
            if(isMount) {
                ctx.fillStyle = 'rgba(230, 220, 200, 0.42)';
                ctx.beginPath();
                ctx.moveTo(px - w * 0.04, py - h);
                ctx.lineTo(px + w * 0.08, py - h * 0.55);
                ctx.lineTo(px - w * 0.12, py - h * 0.48);
                ctx.closePath();
                ctx.fill();
            }
            ctx.strokeStyle = isMount ? 'rgba(40, 32, 24, 0.28)' : 'rgba(50, 36, 22, 0.24)';
            ctx.lineWidth = Math.max(0.65, spacing * 0.025);
            ctx.beginPath();
            ctx.moveTo(px - w * 0.62, py + h * 0.33);
            ctx.lineTo(px - w * 0.04, py - h);
            ctx.lineTo(px + w * 0.62, py + h * 0.33);
            ctx.stroke();
        }
    }
}
function drawTerrainWaterRipples(ctx, offsetX, offsetY) {
    if(!gameData.layers || gameData.terrainViewMode === 'schematic') return;
    let spacing = gameData.hexRadius * 1.35;
    function det01(q, r, salt) {
        let x = Math.sin(q * 15.71 + r * 53.19 + salt) * 43758.5453;
        return x - Math.floor(x);
    }
    for(let hex of gameData.hexList) {
        if(wodDrawHexSet && !wodDrawHexSet.has(hex.q + ',' + hex.r)) continue;
        if(!isWaterHex(hex)) continue;
        let u1 = det01(hex.q, hex.r, 3.1);
        let u2 = det01(hex.q, hex.r, 7.7);
        if(u1 < 0.42) continue;
        let bx = hex.x + offsetX, by = hex.y + offsetY;
        let len = spacing * (0.5 + u2 * 0.36);
        let yJ = (u2 - 0.5) * spacing * 0.6;
        ctx.strokeStyle = 'rgba(200, 230, 245, 0.22)';
        ctx.lineWidth = Math.max(0.7, spacing * 0.045);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(bx - len * 0.5, by + yJ);
        ctx.quadraticCurveTo(bx - len * 0.12, by + yJ - spacing * 0.1, bx + len * 0.08, by + yJ);
        ctx.quadraticCurveTo(bx + len * 0.3, by + yJ + spacing * 0.08, bx + len * 0.5, by + yJ - spacing * 0.02);
        ctx.stroke();
    }
}
function drawTerrainBlobLayer(ctx, type, offsetX, offsetY) {
    for(const hex of gameData.hexList) {
        if(wodDrawHexSet && !wodDrawHexSet.has(getHexKey(hex)))continue;
        if(hex.type===type)drawTerrainCell(ctx,hex,offsetX,offsetY);
    }
    if(type==='urban')wodRoundTerrainCorners(ctx,offsetX,offsetY);
}
function drawUrbanTerrainDetails(ctx, offsetX, offsetY) {
    let spacing = gameData.hexRadius * 1.35;
    let cityById = {};
    for(let city of gameData.cities) cityById[city.id] = city;
    let us = wodUrbanPeriodStyle(wodGetRenderPeriod());
    for(let hex of gameData.hexList) {
        if(wodDrawHexSet && !wodDrawHexSet.has(hex.q + ',' + hex.r)) continue;
        if(hex.type !== 'urban') continue;
        let city = cityById[hex.cityId] || gameData.cities.find(c => Math.abs(c.q - hex.q) <= 3 && Math.abs(c.r - hex.r) <= 3);
        let style = city ? (city.urbanStyle || 0) : 0;
        let variant = hex.urbanVariant || Math.abs((hex.q * 17 + hex.r * 31) % 5);
        let px = hex.x + offsetX;
        let py = hex.y + offsetY;
        let blockCount = 2 + ((variant + style) % 3);
        for(let i = 0; i < blockCount; i++) {
            let w = spacing * (0.22 + ((variant + i) % 2) * 0.08);
            let h = spacing * (0.18 + ((style + i) % 3) * 0.06);
            let ox = ((i % 2) - 0.5) * spacing * 0.42 + ((variant % 3) - 1) * 2;
            let oy = (Math.floor(i / 2) - 0.35) * spacing * 0.42 + ((style % 3) - 1) * 2;
            let bx = px + ox - w / 2, by = py + oy - h / 2;
            ctx.fillStyle = i % 2 === 0 ? us.blockA : us.blockB;
            ctx.fillRect(bx, by, w, h);
            ctx.strokeStyle = us.stroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, w, h);
            wodDrawStructureWindows(ctx, bx, by, w, h);
        }
    }
}
function hexCellKey(h) {
    return `${h.q},${h.r}`;
}
function hexPairBorderKey(h1, h2) {
    let a = hexCellKey(h1);
    let b = hexCellKey(h2);
    return a < b ? a + '|' + b : b + '|' + a;
}
function borderAngleAtCorner(hx, hy, mx, my, dq, dr, spacing) {
    let cx = hx * spacing * 0.5;
    let cy = hy * spacing * 0.5;
    let dx = mx - cx;
    let dy = my - cy;
    if(dx * dx + dy * dy < Math.pow(spacing * 0.08, 2))
        return Math.atan2(dr, dq);
    return Math.atan2(dy, dx);
}
function registerBorderCornersForPair(cornerMap, hex, nHex, dir, ek, mx, my, spacing) {
    let q = hex.q;
    let r = hex.r;
    let dq = dir.q;
    let dr = dir.r;

    function ck(hxi, hyi) {
        return `${hxi},${hyi}`;
    }
    function add(hxi, hyi) {
        let ang = borderAngleAtCorner(hxi, hyi, mx, my, dq, dr, spacing);
        let key = ck(hxi, hyi);
        if(!cornerMap.has(key)) cornerMap.set(key, []);
        cornerMap.get(key).push({ ek, ang });
    }

    if(dq === 1 && dr === 0) {
        add(2 * q + 1, 2 * r - 1);
        add(2 * q + 1, 2 * r + 1);
    } else if(dq === -1 && dr === 0) {
        add(2 * q - 1, 2 * r - 1);
        add(2 * q - 1, 2 * r + 1);
    } else if(dq === 0 && dr === 1) {
        add(2 * q - 1, 2 * r + 1);
        add(2 * q + 1, 2 * r + 1);
    } else if(dq === 0 && dr === -1) {
        add(2 * q - 1, 2 * r - 1);
        add(2 * q + 1, 2 * r - 1);
    }
}
function edgeAdjacencyPairKey(a, b) {
    return a < b ? a + '¦' + b : b + '¦' + a;
}
function dedupeCornerBorderEdges(arr) {
    let byEk = new Map();
    for(let it of arr) {
        if(!byEk.has(it.ek)) byEk.set(it.ek, it);
    }
    return [...byEk.values()];
}
function linkBorderEdgesAroundCorners(cornerMap) {
    let adj = new Map();
    function addUndirected(ekA, ekB) {
        if(ekA === ekB) return;
        if(!adj.has(ekA)) adj.set(ekA, new Set());
        if(!adj.has(ekB)) adj.set(ekB, new Set());
        adj.get(ekA).add(ekB);
        adj.get(ekB).add(ekA);
    }
    for(let [, arrRaw] of cornerMap) {
        let arr = dedupeCornerBorderEdges(arrRaw);
        arr.sort((u, v) => u.ang - v.ang || (u.ek < v.ek ? -1 : u.ek > v.ek ? 1 : 0));
        if(arr.length < 2) continue;
        // Triple junction (3 factions meet): chain angular neighbors into one polyline
        // so A–B / B–C / A–C strokes form a continuous frontline through the point.
        if(arr.length === 3) {
            addUndirected(arr[0].ek, arr[1].ek);
            addUndirected(arr[1].ek, arr[2].ek);
            continue;
        }
        // Pair disjoint angular neighbors — chaining arr[i]→arr[i+1] for all i creates
        // degree-4 hubs (plus-sign spurs) when four borders touch one lattice corner.
        if(arr.length % 2 === 0) {
            for(let i = 0; i < arr.length; i += 2)
                addUndirected(arr[i].ek, arr[i + 1].ek);
        } else {
            // Odd counts on map edges / jagged coasts — link consecutive pairs.
            for(let i = 0; i + 1 < arr.length; i += 2)
                addUndirected(arr[i].ek, arr[i + 1].ek);
        }
    }
    return adj;
}
function walkBorderEdgeChains(adj, midpointByEdge) {
    let usedPair = new Set();
    let chains = [];

    function unusedNeighbors(ek) {
        let out = [];
        let set = adj.get(ek);
        if(!set) return out;
        for(let nb of set) {
            if(!usedPair.has(edgeAdjacencyPairKey(ek, nb))) out.push(nb);
        }
        return out;
    }

    function pickNeighbor(cur, prev, nbrs) {
        if(nbrs.length <= 1) return nbrs[0];
        if(prev === null) return nbrs[0];
        let P = midpointByEdge.get(prev);
        let C = midpointByEdge.get(cur);
        if(!P || !C) return nbrs[0];
        let inDx = C.x - P.x;
        let inDy = C.y - P.y;
        let inLen = Math.hypot(inDx, inDy) || 1;
        inDx /= inLen;
        inDy /= inLen;
        let best = nbrs[0];
        let bestDot = -2;
        for(let nb of nbrs) {
            let N = midpointByEdge.get(nb);
            if(!N) continue;
            let outDx = N.x - C.x;
            let outDy = N.y - C.y;
            let outLen = Math.hypot(outDx, outDy) || 1;
            outDx /= outLen;
            outDy /= outLen;
            let dot = inDx * outDx + inDy * outDy;
            if(dot > bestDot) {
                bestDot = dot;
                best = nb;
            }
        }
        return best;
    }

    function walkOpen(startEk) {
        let chain = [startEk];
        let cur = startEk;
        let prev = null;
        while(true) {
            let nbrs = unusedNeighbors(cur);
            if(nbrs.length === 0) break;
            let nx = pickNeighbor(cur, prev, nbrs);
            usedPair.add(edgeAdjacencyPairKey(cur, nx));
            chain.push(nx);
            prev = cur;
            cur = nx;
            if(chain.length > midpointByEdge.size * 4) break;
        }
        return chain;
    }

    function walkLoop(startEk) {
        let chain = [startEk];
        let cur = startEk;
        let prev = null;
        while(true) {
            let nbrs = unusedNeighbors(cur).filter(n => n !== prev);
            if(nbrs.length === 0) break;
            let nx = pickNeighbor(cur, prev, nbrs);
            if(nx === startEk && chain.length >= 2) {
                usedPair.add(edgeAdjacencyPairKey(cur, nx));
                return { chain, closed: true };
            }
            usedPair.add(edgeAdjacencyPairKey(cur, nx));
            chain.push(nx);
            prev = cur;
            cur = nx;
            if(chain.length > midpointByEdge.size * 4) break;
        }
        return { chain, closed: false };
    }

    let touched = new Set();
    for(let ek of midpointByEdge.keys()) {
        let deg = adj.get(ek) ? adj.get(ek).size : 0;
        if(deg === 1) {
            let nbrs = unusedNeighbors(ek);
            if(nbrs.length === 0) continue;
            let chain = walkOpen(ek);
            if(chain.length >= 2) {
                for(let e of chain) touched.add(e);
                chains.push({ keys: chain, closed: false });
            }
        }
    }

    for(let ek of midpointByEdge.keys()) {
        if(touched.has(ek)) continue;
        let deg = adj.get(ek) ? adj.get(ek).size : 0;
        if(deg >= 2 && unusedNeighbors(ek).length > 0) {
            let { chain, closed } = walkLoop(ek);
            if(chain.length >= 3 && closed) {
                for(let e of chain) touched.add(e);
                chains.push({ keys: chain, closed: true });
            } else if(chain.length >= 2 && !closed) {
                for(let e of chain) touched.add(e);
                chains.push({ keys: chain, closed: false });
            }
        }
    }

    for(let ek of midpointByEdge.keys()) {
        if(touched.has(ek)) continue;
        let nbrs = unusedNeighbors(ek);
        if(nbrs.length === 0) continue;
        let chain = walkOpen(ek);
        if(chain.length >= 2) {
            for(let e of chain) touched.add(e);
            chains.push({ keys: chain, closed: false });
        }
    }

    return chains;
}
function distPointToSegmentSquared(px, py, ax, ay, bx, by) {
    let abx = bx - ax, aby = by - ay;
    let apx = px - ax, apy = py - ay;
    let ab2 = abx * abx + aby * aby;
    if(ab2 < 1e-10) return apx * apx + apy * apy;
    let t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / ab2));
    let cx = ax + t * abx, cy = ay + t * aby;
    let dx = px - cx, dy = py - cy;
    return dx * dx + dy * dy;
}
let wodDiplomacyOceanCache = new WeakMap();
/** Open sea ownership is useful to the simulation, but is not a land
 * frontline. Enclosed lakes retain their ordinary political boundaries. */
function wodOpenOceanHexKeys(hexList,hexLookup) {
    let hash=2166136261,waterCount=0;
    for(const h of hexList)if(isWaterHex(h)) {
        waterCount++;hash=Math.imul(hash^h.q,16777619);hash=Math.imul(hash^h.r,16777619);
    }
    const cached=wodDiplomacyOceanCache.get(hexList);
    if(cached&&cached.hash===hash&&cached.waterCount===waterCount&&cached.length===hexList.length)return cached.keys;
    const keys=new Set(),queue=[];
    for(const h of hexList)if(isWaterHex(h)&&cardinalHexDirections.some(d=>!hexLookup[`${h.q+d.q},${h.r+d.r}`])) {
        keys.add(getHexKey(h));queue.push(h);
    }
    for(let i=0;i<queue.length;i++)for(const d of cardinalHexDirections) {
        const n=hexLookup[`${queue[i].q+d.q},${queue[i].r+d.r}`];
        if(!n||!isWaterHex(n)||keys.has(getHexKey(n)))continue;
        keys.add(getHexKey(n));queue.push(n);
    }
    wodDiplomacyOceanCache.set(hexList,{hash,waterCount,length:hexList.length,keys});
    return keys;
}
/**
 * Exact shared edges on land and inland lakes, ending at the open sea.
 * Shared by the live map and every lobby/setup preview.
 * @returns {Array<{closed:boolean, pts:Array<{x:number,y:number}>}>}
 */
function wodCollectDiplomacyBorderChains(hexList, hexLookup, offsetX, offsetY, spacing) {
    const nodes=new Map(), edges=[], seen=new Set();
    const node=(q,r)=>{
        const key=q+','+r;
        if(!nodes.has(key))nodes.set(key,{key,x:q*spacing/2+offsetX,y:r*spacing/2+offsetY,edges:[]});
        return nodes.get(key);
    };
    const directions=[{q:1,r:0},{q:0,r:1}];
    for(const h of hexList) {
        if(!h.owner||isWaterHex(h))continue;
        for(const d of directions) {
            const n=hexLookup[`${h.q+d.q},${h.r+d.r}`];
            if(!n||!n.owner||h.owner===n.owner||isWaterHex(n))continue;
            const key=hexPairBorderKey(h,n);if(seen.has(key))continue;seen.add(key);
            const a=d.q?node(2*h.q+1,2*h.r-1):node(2*h.q-1,2*h.r+1);
            const b=d.q?node(2*h.q+1,2*h.r+1):node(2*h.q+1,2*h.r+1);
            const edge={a,b,h,n,used:false};a.edges.push(edge);b.edges.push(edge);edges.push(edge);
        }
    }
    // A checkerboard is two separate corners, not a four-way branch.
    // Round around the less-connected diagonal. Prefer the side that
    // already has a real land route as the continuous outside region;
    // this closes the visible ring around a trapped unit instead of
    // terminating four unrelated strokes on top of one another.
    for(const junction of nodes.values())if(junction.edges.length===4) {
        const [x,y]=junction.key.split(',').map(Number),q=(x-1)/2,r=(y-1)/2;
        const cells=[[q,r],[q+1,r],[q,r+1],[q+1,r+1]].map(([a,b])=>hexLookup[`${a},${b}`]);
        if(cells.some(h=>!h)||cells[0].owner!==cells[3].owner||cells[1].owner!==cells[2].owner)continue;
        const pinched=wodCornerPinchedOwner(cells,hexLookup);
        junction.pairs=new Map();
        for(const cell of cells.filter(h=>h.owner===pinched)){
            const pair=junction.edges.filter(e=>e.h===cell||e.n===cell);
            if(pair.length===2){junction.pairs.set(pair[0],pair[1]);junction.pairs.set(pair[1],pair[0]);}
        }
    }
    const chains=[];
    const walk=(start,first)=>{
        const pts=[{x:start.x,y:start.y}];let current=start,edge=first,closed=false;
        while(edge&&!edge.used) {
            edge.used=true;const next=edge.a===current?edge.b:edge.a;
            if(next===start){closed=true;break;}
            pts.push({x:next.x,y:next.y});
            if(next.edges.length!==2&&!next.pairs)break; // Real multi-faction junctions stay exact.
            current=next;edge=next.pairs?next.pairs.get(edge):next.edges.find(e=>!e.used);
        }
        if(pts.length>=2)chains.push({closed,pts});
    };
    for(const n of nodes.values())if(n.edges.length!==2&&!n.pairs)for(const e of n.edges)if(!e.used)walk(n,e);
    for(const e of edges)if(!e.used)walk(e.a,e);
    return chains;
}
function wodOffsetBorderPoints(pts, closed, offsetPx) {
    if(!pts || pts.length === 0) return pts;
    let out = [];
    for(let i = 0; i < pts.length; i++) {
        let prev = pts[i - 1];
        let next = pts[i + 1];
        if(i === 0) prev = closed ? pts[pts.length - 1] : pts[0];
        if(i === pts.length - 1) next = closed ? pts[0] : pts[pts.length - 1];
        let dx = next.x - prev.x;
        let dy = next.y - prev.y;
        let len = Math.hypot(dx, dy) || 1;
        let nx = -dy / len * offsetPx;
        let ny = dx / len * offsetPx;
        out.push({ x: pts[i].x + nx, y: pts[i].y + ny });
    }
    return out;
}
function drawPaintedTerritoryBorders(ctx, offsetX, offsetY) {
    if(!gameData.layers.diplomacy) return;
    let spacing = gameData.hexRadius * 1.35;
    let paintChains = wodCollectDiplomacyBorderChains(gameData.hexList, gameData.hexes, offsetX, offsetY, spacing);

    wodEnsureUiShopDefaults();
    let style = gameData.uiSettings.frontlineStyle;
    let strokeCol = wodFrontlineColorRgba(1);
    let fillCol = wodFrontlineColorRgba(1);

    function strokeChains(lineWidth, dash, offsetPx, col) {
        ctx.strokeStyle = col || strokeCol;
        ctx.fillStyle = col || fillCol;
        ctx.lineWidth = wodHdMapActive()?Math.min(lineWidth,2.4):lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash(dash || []);
        for(let { closed, pts } of paintChains) {
            let drawPts = offsetPx ? wodOffsetBorderPoints(pts, closed, offsetPx) : pts;
            drawPaintStroke(ctx, drawPts, spacing, {
                closedLoop: closed,
                suppressDegenerate: true,
                openLineCap: 'round',
                hybridBorder: true
            });
        }
        ctx.setLineDash([]);
    }

    wodPaintFrontlineStyle(style, spacing, (lineWidth, dash, offsetPx, col) => {
        strokeChains(lineWidth, dash, offsetPx, col);
    });
}
function wodAcquirePatchCtx(w, h) {
    if(!wodEditorPatchCanvas) {
        wodEditorPatchCanvas = document.createElement('canvas');
        wodEditorPatchCtx = wodEditorPatchCanvas.getContext('2d', {alpha: false});
    }
    if(wodEditorPatchCanvas.width !== w || wodEditorPatchCanvas.height !== h) {
        wodEditorPatchCanvas.width = w;
        wodEditorPatchCanvas.height = h;
    }
    wodEditorPatchCtx.setTransform(1, 0, 0, 1, 0, 0);
    wodEditorPatchCtx.clearRect(0, 0, w, h);
    return wodEditorPatchCtx;
}
function wodRedrawBorderLayer() {
    if(!terrainCanvas.width || !terrainCanvas.height) return;
    if(!wodBorderLayerCanvas) {
        wodBorderLayerCanvas = document.createElement('canvas');
        wodBorderLayerCtx = wodBorderLayerCanvas.getContext('2d');
    }
    if(wodBorderLayerCanvas.width !== terrainCanvas.width || wodBorderLayerCanvas.height !== terrainCanvas.height) {
        wodBorderLayerCanvas.width = terrainCanvas.width;
        wodBorderLayerCanvas.height = terrainCanvas.height;
    }
    wodBorderLayerCtx.setTransform(1, 0, 0, 1, 0, 0);
    wodBorderLayerCtx.clearRect(0, 0, wodBorderLayerCanvas.width, wodBorderLayerCanvas.height);
    if(!gameData.layers.diplomacy) return;
    drawPaintedTerritoryBorders(wodBorderLayerCtx, -terrainBounds.minX, -terrainBounds.minY);
}
function wodCollectHexHalo(seeds, R) {
    let seen = new Set();
    let out = [];
    for(let s = 0; s < seeds.length; s++) {
        let seed = seeds[s];
        if(!seed) continue;
        // Square neighborhood. The map is a square lattice, and a hex disk
        // leaves the diagonal cells out, which the water fill then shows through.
        for(let dq = -R; dq <= R; dq++) {
            for(let dr = -R; dr <= R; dr++) {
                let hex = gameData.hexes[(seed.q + dq) + ',' + (seed.r + dr)];
                if(!hex) continue;
                let k = hex.q + ',' + hex.r;
                if(seen.has(k)) continue;
                seen.add(k);
                out.push(hex);
            }
        }
    }
    return out;
}
function wodPatchTerritoryOverlay(halo, x0, y0, w, h, ox, oy) {
    if(!gameData.layers.territory) return;
    let spacing = gameData.hexRadius * 1.35;
    let discR = spacing * 0.78;
    if(!territoryOverlayCanvas) territoryOverlayCanvas = document.createElement('canvas');
    if(territoryOverlayCanvas.width !== terrainCanvas.width || territoryOverlayCanvas.height !== terrainCanvas.height) {
        territoryOverlayCanvas.width = terrainCanvas.width;
        territoryOverlayCanvas.height = terrainCanvas.height;
    }
    let overlayCtx = territoryOverlayCanvas.getContext('2d');
    overlayCtx.save();
    overlayCtx.beginPath();
    overlayCtx.rect(x0, y0, w, h);
    overlayCtx.clip();
    overlayCtx.clearRect(x0, y0, w, h);
    for(const hex of halo) {
        if(hex.owner<=0||isWaterHex(hex))continue;
        overlayCtx.fillStyle=factionColors[hex.owner];
        wodFillCellSquare(overlayCtx,hex,ox,oy,spacing);
    }
    wodRoundPoliticalCorners(overlayCtx,ox,oy,halo);
    wodMaskTerritoryWaterCorners(overlayCtx,ox,oy,halo);
    overlayCtx.restore();
}
function wodCompositeTerrainRect(x, y, w, h) {
    terrainCtx.setTransform(1, 0, 0, 1, 0, 0);
    terrainCtx.save();
    terrainCtx.imageSmoothingEnabled = false;
    terrainCtx.drawImage(terrainBaseCanvas, x, y, w, h, x, y, w, h);
    if(gameData.layers.territory && territoryOverlayCanvas &&
        territoryOverlayCanvas.width === terrainCanvas.width && territoryOverlayCanvas.height === terrainCanvas.height) {
        terrainCtx.globalAlpha = 0.32;
        terrainCtx.drawImage(territoryOverlayCanvas, x, y, w, h, x, y, w, h);
        terrainCtx.globalAlpha = 1;
    }
    if(gameData.layers.diplomacy && wodBorderLayerCanvas &&
        wodBorderLayerCanvas.width === terrainCanvas.width && wodBorderLayerCanvas.height === terrainCanvas.height)
        terrainCtx.drawImage(wodBorderLayerCanvas, x, y, w, h, x, y, w, h);
    terrainCtx.restore();
}
function wodPatchEditorTerrain(seeds, opts) {
    if(!seeds || !seeds.length) return;
    if(terrainBaseCanvas.width < 2 || terrainCanvas.width !== terrainBaseCanvas.width || terrainCanvas.height !== terrainBaseCanvas.height) {
        updateTerrainCache();
        return;
    }
    let spacing = gameData.hexRadius * 1.35;
    let halo = wodCollectHexHalo(seeds, 3);
    if(!halo.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // Stay inside the redrawn neighborhood so the flat water fill at the
    // patch edge is never copied onto the map.
    let pad = spacing * 1.35;
    for(let i = 0; i < seeds.length; i++) {
        let hex = seeds[i];
        if(!hex) continue;
        if(hex.x < minX) minX = hex.x;
        if(hex.x > maxX) maxX = hex.x;
        if(hex.y < minY) minY = hex.y;
        if(hex.y > maxY) maxY = hex.y;
    }
    if(!isFinite(minX)) return;
    minX -= pad;
    maxX += pad;
    minY -= pad;
    maxY += pad;
    let ox = -terrainBounds.minX;
    let oy = -terrainBounds.minY;
    let x0 = Math.max(0, Math.floor(minX + ox));
    let y0 = Math.max(0, Math.floor(minY + oy));
    let x1 = Math.min(terrainBaseCanvas.width, Math.ceil(maxX + ox));
    let y1 = Math.min(terrainBaseCanvas.height, Math.ceil(maxY + oy));
    let w = x1 - x0;
    let hgt = y1 - y0;
    if(w < 1 || hgt < 1) return;
    if(w * hgt > terrainBaseCanvas.width * terrainBaseCanvas.height * 0.4) {
        updateTerrainCache();
        return;
    }
    let terrainChanged = !opts || opts.terrain !== false;
    let ownersChanged = !!(opts && opts.owners);
    if(terrainChanged) {
        let step = Math.max(2, Math.min(4, Math.round((gameData.hexRadius || 20) * 0.18)));
        let margin = step * 8;
        let pw = w + margin * 2;
        let ph = hgt + margin * 2;
        let pctx = wodAcquirePatchCtx(pw, ph);
        let offX = ox - x0 + margin;
        let offY = oy - y0 + margin;
        // Keep the existing ground. A flat water fill left blue specks wherever
        // the local redraw did not cover a pixel the full map had already sealed.
        pctx.fillStyle = getTerrainColor('water');
        pctx.fillRect(0, 0, pw, ph);
        pctx.drawImage(terrainBaseCanvas, x0 - margin, y0 - margin, pw, ph, 0, 0, pw, ph);
        let clearR = spacing * 0.95;
        for(let si = 0; si < seeds.length; si++) {
            let seed = seeds[si];
            if(!seed || !isWaterHex(seed)) continue;
            pctx.beginPath();
            pctx.arc(seed.x + offX, seed.y + offY, clearR, 0, Math.PI * 2);
            pctx.fill();
        }
        let set = new Set();
        for(let i = 0; i < halo.length; i++) set.add(halo[i].q + ',' + halo[i].r);
        wodDrawHexSet = set;
        try {
            if(gameData.terrainViewMode === 'schematic') {
                drawTerrainSchematicMap(pctx, offX, offY);
            } else if(wodBoardMapActive()) {
                WodBoardArt.terrain(pctx,wodBoardMapActive(),gameData.hexList,wodHdRegionGeometry(),wodTraceCellRegion,gameData.hexRadius*1.35,offX,offY);
            } else if(wodHdMapActive()) {
                wodDrawHdTerrain(pctx,offX,offY);
            } else {
                let paintOrder = ['water', 'sand', 'grass', 'forest', 'swamp', 'hill', 'mountain', 'urban'];
                for(let ti = 0; ti < paintOrder.length; ti++)
                    drawTerrainBlobLayer(pctx, paintOrder[ti], offX, offY);
                drawTerrainTopography(pctx, offX, offY);
                drawForestTreeDecorations(pctx, offX, offY);
                drawMountainRockDecorations(pctx, offX, offY);
                drawTerrainWaterRipples(pctx, offX, offY);
                drawUrbanTerrainDetails(pctx, offX, offY);
                wodRoundTerrainCorners(pctx,offX,offY);
            }
        } finally {
            wodDrawHexSet = null;
        }
        terrainBaseCtx.save();
        terrainBaseCtx.imageSmoothingEnabled = false;
        terrainBaseCtx.drawImage(wodEditorPatchCanvas, margin, margin, w, hgt, x0, y0, w, hgt);
        terrainBaseCtx.restore();
    }
    if(terrainChanged || ownersChanged) {
        if(gameData.layers.territory)
            wodPatchTerritoryOverlay(halo, x0, y0, w, hgt, ox, oy);
        else wodEditorOverlayDirty = true;
    }
    if(ownersChanged) {
        if(gameData.layers.diplomacy) {
            wodRedrawBorderLayer();
            wodEditorBordersDirty = false;
        } else wodEditorBordersDirty = true;
    }
    wodCompositeTerrainRect(x0, y0, w, hgt);
    wodTerrainPoliticalDirty = false;
    terrainNeedsUpdate = false;
}
function wodPaintFrontlineStyle(style, spacing, strokeFn) {
    if(wodBoardMapActive()){WodBoardArt.frontline(wodBoardMapActive(),spacing,strokeFn);return;}
    if(style === 'double') {
        let rail = Math.max(8, spacing * 0.28);
        strokeFn(3.5, [], rail);
        strokeFn(3.5, [], -rail);
    } else if(style === 'dotted') {
        strokeFn(8, [spacing * 0.26, spacing * 0.36], 0);
    } else if(style === 'dashed') {
        strokeFn(8, [spacing * 1.85, spacing * 0.4], 0);
    } else if(style === 'dashdot') {
        strokeFn(8, [spacing * 0.62, spacing * 0.2, spacing * 0.14, spacing * 0.2], 0);
    } else if(style === 'thick') {
        strokeFn(14, [], 0);
    } else if(style === 'glow') {
        strokeFn(18, [], 0, wodFrontlineColorRgba(0.24));
        strokeFn(6, [], 0);
    } else {
        strokeFn(8, [], 0);
    }
}
function wodSmoothDiplomacyBorderPoints(points,spacing,closed) {
    // (no size to smooth at, as on a canvas not laid out yet, leaves the line as it is: binning by a zero cell
    // never advanced and filled one bin until the array overflowed, freezing the page for seconds first)
    if(points.length<8||!(spacing>0)||!Number.isFinite(spacing))return points;
    const cacheKey=spacing+':'+!!closed;
    if(points._borderSmooth?.key===cacheKey)return points._borderSmooth.points;
    // Keep opposite sides of a narrow salient apart. Broad smoothing
    // previously pulled both sides toward each other until strokes met.
    const bins=new Map(),cell=spacing*2,segments=[];
    for(let i=0;i<points.length-(closed?0:1);i++){
        const a=points[i],b=points[(i+1)%points.length],seg={a,b,i};segments.push(seg);
        const x0=Math.floor(Math.min(a.x,b.x)/cell),x1=Math.floor(Math.max(a.x,b.x)/cell),y0=Math.floor(Math.min(a.y,b.y)/cell),y1=Math.floor(Math.max(a.y,b.y)/cell);
        // (a point off at infinity, or a segment spanning thousands of cells, is not binned: it only loosens the cap near it)
        if(!Number.isFinite(x0+x1+y0+y1)||(x1-x0+1)*(y1-y0+1)>4096)continue;
        for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++){
            const key=x+','+y;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(seg);
        }
    }
    const caps=points.map((p,i)=>{
        let cap=spacing*.42;const x=Math.floor(p.x/cell),y=Math.floor(p.y/cell),seen=new Set();
        for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const seg of bins.get((x+dx)+','+(y+dy))||[]){
            if(seen.has(seg.i))continue;seen.add(seg.i);
            const delta=Math.abs(seg.i-i),distance=closed?Math.min(delta,points.length-delta):delta;
            if(distance<=3)continue;
            const vx=seg.b.x-seg.a.x,vy=seg.b.y-seg.a.y,len=vx*vx+vy*vy,t=len?Math.max(0,Math.min(1,((p.x-seg.a.x)*vx+(p.y-seg.a.y)*vy)/len)):0;
            const d=Math.hypot(p.x-seg.a.x-t*vx,p.y-seg.a.y-t*vy);
            if(d<spacing*1.25)cap=Math.min(cap,Math.max(spacing*.06,d*.18));
        }
        return cap;
    });
    let smooth=points;
    for(let pass=0;pass<2;pass++)smooth=smooth.map((p,i)=>{
        if(!closed&&(i===0||i===points.length-1))return points[i];
        let x=0,y=0;
        for(let k=-2;k<=2;k++) {
            const j=closed?(i+k+points.length)%points.length:Math.max(0,Math.min(points.length-1,i+k));
            const weight=[1,4,6,4,1][k+2];x+=smooth[j].x*weight/16;y+=smooth[j].y*weight/16;
        }
        const origin=points[i],dx=x-origin.x,dy=y-origin.y,d=Math.hypot(dx,dy),t=d>caps[i]?caps[i]/d:1;
        return {x:origin.x+dx*t,y:origin.y+dy*t,_borderLimit:caps[i]};
    });
    points._borderSmooth={key:cacheKey,points:smooth};
    return smooth;
}
function drawPaintStroke(ctx, points, spacing, opts) {
    if(!points || points.length === 0) return;
    let closedLoop = opts && opts.closedLoop;
    let suppressDegenerate = opts && opts.suppressDegenerate;
    let capRestore = ctx.lineCap;
    if(points.length === 1) {
        if(!suppressDegenerate) {
            ctx.beginPath();
            ctx.arc(points[0].x, points[0].y, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        return;
    }

    // Broad, bounded smoothing removes the tile staircase. Exact endpoints
    // retain real junctions; no proximity bridges or invented loops are added.
    if(opts && opts.hybridBorder) {
        points=wodSmoothDiplomacyBorderPoints(points,spacing,closedLoop);
        ctx.lineJoin='round';ctx.beginPath();
        const count=points.length, radius=spacing*.44;
        const toward=(p,q)=>{const d=Math.hypot(q.x-p.x,q.y-p.y)||1,localRadius=Math.min(radius,(p._borderLimit??spacing*.42)*1.2),t=Math.min(.45,localRadius/d);return {x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};};
        if(closedLoop&&count>=3) {
            const first=toward(points[0],points[count-1]);ctx.moveTo(first.x,first.y);
            for(let i=0;i<count;i++) {
                const p=points[i],before=toward(p,points[(i+count-1)%count]),after=toward(p,points[(i+1)%count]);
                ctx.lineTo(before.x,before.y);ctx.quadraticCurveTo(p.x,p.y,after.x,after.y);
            }
            ctx.closePath();
        } else {
            ctx.moveTo(points[0].x,points[0].y);
            for(let i=1;i<count-1;i++) {
                const p=points[i],before=toward(p,points[i-1]),after=toward(p,points[i+1]);
                ctx.lineTo(before.x,before.y);ctx.quadraticCurveTo(p.x,p.y,after.x,after.y);
            }
            ctx.lineTo(points[count-1].x,points[count-1].y);
        }
        ctx.lineCap='round';ctx.stroke();ctx.lineCap=capRestore;return;
    }

    // Use a tighter bin for small/closed loops so we don't lose detail.
    let smoothBin = (closedLoop && points.length <= 16) ? spacing * 0.4 : spacing * 1.15;

    if(closedLoop && points.length >= 3) {
        // Use raw points directly for short loops to preserve all hex-edge midpoints.
        let smooth = points.length <= 8 ? points : averagePaintStrokePoints(points, smoothBin);
        if(smooth.length < 3) smooth = points;
        ctx.beginPath();
        ctx.moveTo(smooth[0].x, smooth[0].y);
        for(let i = 1; i < smooth.length; i++) {
            let cur = smooth[i];
            let next = smooth[(i + 1) % smooth.length];
            let midX = (cur.x + next.x) / 2;
            let midY = (cur.y + next.y) / 2;
            ctx.quadraticCurveTo(cur.x, cur.y, midX, midY);
        }
        ctx.closePath();
        ctx.lineCap = 'butt';
        ctx.stroke();
        ctx.lineCap = capRestore;
        return;
    }

    let maxDist2 = Math.pow(spacing * 1.5, 2);
    let ordered = orderPaintStrokePoints(points);
    let run = [ordered[0]];
    function flushRun() {
        if(run.length === 1) {
            if(!suppressDegenerate) {
                ctx.beginPath();
                ctx.arc(run[0].x, run[0].y, 3.8, 0, Math.PI * 2);
                ctx.fill();
            }
            return;
        }
        let smooth = averagePaintStrokePoints(run, smoothBin);
        if(smooth.length < 2) smooth = run;
        ctx.beginPath();
        ctx.moveTo(smooth[0].x, smooth[0].y);
        for(let i = 1; i < smooth.length - 1; i++) {
            let midX = (smooth[i].x + smooth[i + 1].x) / 2;
            let midY = (smooth[i].y + smooth[i + 1].y) / 2;
            ctx.quadraticCurveTo(smooth[i].x, smooth[i].y, midX, midY);
        }
        let lastPt = smooth[smooth.length - 1];
        ctx.lineTo(lastPt.x, lastPt.y);
        ctx.lineCap = (opts && opts.openLineCap) ? opts.openLineCap : capRestore;
        ctx.stroke();
        ctx.lineCap = capRestore;
    }
    for(let i = 1; i < ordered.length; i++) {
        let prev = ordered[i - 1];
        let p = ordered[i];
        let dx = p.x - prev.x;
        let dy = p.y - prev.y;
        if(dx * dx + dy * dy > maxDist2) {
            flushRun();
            run = [p];
        } else {
            run.push(p);
        }
    }
    flushRun();
}
function orderPaintStrokePoints(points) {
    if(points.length <= 2) return [...points];
    let remaining = [...points];
    let startIdx = 0;
    for(let i = 1; i < remaining.length; i++) {
        if(remaining[i].x < remaining[startIdx].x || (remaining[i].x === remaining[startIdx].x && remaining[i].y < remaining[startIdx].y)) {
            startIdx = i;
        }
    }
    let chain = [remaining.splice(startIdx, 1)[0]];
    while(remaining.length > 0) {
        let head = chain[0];
        let tail = chain[chain.length - 1];
        let bestIdx = -1;
        let bestDist = Infinity;
        let prepend = false;
        for(let i = 0; i < remaining.length; i++) {
            let p = remaining[i];
            let dh = (p.x - head.x) ** 2 + (p.y - head.y) ** 2;
            let dt = (p.x - tail.x) ** 2 + (p.y - tail.y) ** 2;
            if(dh < bestDist) {
                bestDist = dh;
                bestIdx = i;
                prepend = true;
            }
            if(dt < bestDist) {
                bestDist = dt;
                bestIdx = i;
                prepend = false;
            }
        }
        if(bestIdx < 0) {
            chain.push(...remaining);
            break;
        }
        let q = remaining.splice(bestIdx, 1)[0];
        if(prepend) chain.unshift(q);
        else chain.push(q);
    }
    return chain;
}
function averagePaintStrokePoints(points, binSize) {
    let averaged = [];
    let current = [points[0]];
    let distanceInBin = 0;

    for(let i = 1; i < points.length; i++) {
        let prev = points[i - 1];
        let p = points[i];
        let dx = p.x - prev.x;
        let dy = p.y - prev.y;
        distanceInBin += Math.sqrt(dx * dx + dy * dy);
        current.push(p);

        if(distanceInBin >= binSize) {
            averaged.push(averagePointGroup(current));
            current = [p];
            distanceInBin = 0;
        }
    }
    if(current.length > 0) averaged.push(averagePointGroup(current));
    return averaged;
}
function averagePointGroup(points) {
    let x = 0, y = 0;
    for(let p of points) {
        x += p.x;
        y += p.y;
    }
    return {x: x / points.length, y: y / points.length};
}
function drawHexes(ctx, list, camL, camR, camT, camB, drawBorders) {
    if(gameData._terrDirtyPending && performance.now() >= (gameData._terrDirtyNext || 0)) {
        gameData._terrDirtyPending = false;
        wodTerrainPoliticalDirty = true;
        terrainNeedsUpdate = true;
        wodTerrainPolWork = null;
        gameData._terrDirtyNext = performance.now() + 380;
    }
    if(terrainNeedsUpdate && !wodSuppressTerrainBake) {
        let now = performance.now();
        let forceImmediate = wodTerrainNeedFullRebuild || !wodTerrainBaseBuilt;
        let ownersChanging = !!(gameData.layers && (gameData.layers.diplomacy || gameData.layers.territory));
        let livePlay = gameState === 'PLAYING' && !gameData.menuAttractMode;
        let camBusy = wodIsCamInteracting();
        let gap;
        if(forceImmediate) gap = 0;
        else if(ownersChanging) gap = livePlay ? (wodUsesVisualViewportLayout() ? 720 : 180) : (wodUsesVisualViewportLayout() ? 72 : 48);
        else gap = livePlay ? (wodUsesVisualViewportLayout() ? 240 : 160) : (wodUsesVisualViewportLayout() ? 92 : 72);
        if(livePlay && (gameData._wodMovingN || 0) > 14)
            gap = Math.max(gap, wodUsesVisualViewportLayout() ? 400 : 280);
        else if(livePlay && (gameData._wodMovingN || 0) > 6)
            gap = Math.max(gap, wodUsesVisualViewportLayout() ? 320 : 230);
        if(livePlay && (gameData._wodPlayerMovingN || 0) > 0)
            gap = Math.max(gap, wodUsesVisualViewportLayout() ? 240 : 160);
        if(livePlay && !forceImmediate && wodTerrainLastBakeCostMs > 14)
            gap = Math.max(gap, Math.min(300, wodTerrainLastBakeCostMs * 6));
        if(camBusy && !forceImmediate) {
            // Keep last baked political frame visible while panning — avoids territory/frontline flicker.
        } else if(forceImmediate) {
            if(now >= wodTerrainBakeNextMs) {
                wodTerrainBakeNextMs = now + gap;
                updateTerrainCache();
            }
        } else if(now >= wodTerrainBakeNextMs || wodTerrainPolWork) {
            let playerMarching = livePlay && (gameData._wodPlayerMovingN || 0) > 0;
            // Keep baking during player marches (smaller time slices) — fully deferring
            // froze the border/territory paint for the whole march, which made captured
            // ground look like it wasn't being claimed at all.
            let budget = playerMarching
                ? (wodUsesVisualViewportLayout() ? 1.4 : 2.0)
                : (wodUsesVisualViewportLayout() ? (camBusy ? 1.2 : 2.4) : 2.6);
            wodStepTerrainPoliticalBake(budget);
            if(!terrainNeedsUpdate)
                wodTerrainBakeNextMs = now + gap;
        }
    }
    ctx.drawImage(terrainCanvas, terrainBounds.minX, terrainBounds.minY);
}
