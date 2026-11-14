// Mouse, touch and keyboard handling, selection and group orders.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

// --- Interaction & Controls ---
let isDragging = false;
let dragStart = {x: 0, y: 0};
let dragStartClient = {x: 0, y: 0};
let isPanning = false;
let panStart = {x: 0, y: 0};
let cameraStart = {x: 0, y: 0};
let formationDrag = {active: false, startWorld: {x: 0, y: 0}, endWorld: {x: 0, y: 0}};
let pathOrderStroke = {active: false, pts: [], moved: false};
let pathStrokePreviewAt = 0;
let shiftWaypointDrag = {active: false, startClient: {x: 0, y: 0}, startWorld: {x: 0, y: 0}};
let leftMapOrderDrag = {active:false,mode:null,startWorld:null};
let mobileOrderMode = null;
let touchCamGesture = null;
let wodSuppressCanvasMouseUntil = 0;
let wodCamInteractUntil = 0;
function wodNoteCanvasTouchInteraction() {
    wodSuppressCanvasMouseUntil = performance.now() + 850;
}
function wodBumpCamInteract(ms) {
    let t = performance.now() + ms;
    if(t > wodCamInteractUntil) wodCamInteractUntil = t;
}
function wodIsCamInteracting() {
    return !!(touchCamGesture || isPanning || performance.now() < wodCamInteractUntil);
}
let wodGfxLiteLatch = false;
let wodGfxSimplifyLatch = false;
function wodShouldSimplifyDraw() {
    if(touchCamGesture) return true;
    let n = gameData && gameData.entities ? gameData.entities.length : 0;
    if(!wodGfxSimplifyLatch && n > 140) wodGfxSimplifyLatch = true;
    else if(wodGfxSimplifyLatch && n < 110) wodGfxSimplifyLatch = false;
    return wodGfxSimplifyLatch;
}
function wodShouldGfxLite() {
    if(touchCamGesture) return true;
    let n = gameData && gameData.entities ? gameData.entities.length : 0;
    if(!wodGfxLiteLatch && n > 100) wodGfxLiteLatch = true;
    else if(wodGfxLiteLatch && n < 78) wodGfxLiteLatch = false;
    return wodGfxLiteLatch;
}
let wodPinchCamRafId = null;
function wodApplyPinchSample(g, dist, midX, midY) {
    let oldZ = gameData.camera.zoom;
    let newZ = Math.max(0.1, Math.min(25, oldZ * (dist / g.lastDist)));
    let local = wodClientToCanvasLocal(g.lastMidX, g.lastMidY);
    let mx = local.x;
    let my = local.y;
    let worldX = (mx + gameData.camera.x) / oldZ;
    let worldY = (my + gameData.camera.y) / oldZ;
    gameData.camera.zoom = newZ;
    gameData.camera.x = worldX * newZ - mx;
    gameData.camera.y = worldY * newZ - my;
    let panD = wodOverlayCoordScale();
    gameData.camera.x -= (midX - g.lastMidX) * panD.sx;
    gameData.camera.y -= (midY - g.lastMidY) * panD.sy;
    g.lastDist = dist;
    g.lastMidX = midX;
    g.lastMidY = midY;
    wodBumpCamInteract(260);
}
function wodFlushPendingPinchCamera() {
    let g = touchCamGesture;
    if(!g || !g.latestPinch) return;
    let p = g.latestPinch;
    g.latestPinch = null;
    wodApplyPinchSample(g, p.dist, p.midX, p.midY);
}
function wodSchedulePinchCameraFrame() {
    let g = touchCamGesture;
    if(!g || g.rafArm) return;
    g.rafArm = true;
    wodPinchCamRafId = requestAnimationFrame(() => {
        wodPinchCamRafId = null;
        let g2 = touchCamGesture;
        if(!g2) return;
        g2.rafArm = false;
        if(g2.latestPinch) {
            let p = g2.latestPinch;
            g2.latestPinch = null;
            wodApplyPinchSample(g2, p.dist, p.midX, p.midY);
        }
        if(touchCamGesture && touchCamGesture.latestPinch)
            wodSchedulePinchCameraFrame();
    });
}
function wodCancelPinchCameraRaf() {
    if(wodPinchCamRafId != null) {
        cancelAnimationFrame(wodPinchCamRafId);
        wodPinchCamRafId = null;
    }
    if(touchCamGesture) touchCamGesture.rafArm = false;
}
function wodIsMobileOrderModeArmed() {
    return mobileOrderMode === 'move' || mobileOrderMode === 'waypoint' || mobileOrderMode === 'formation';
}
function setMobileOrderMode(mode) {
    if(mode !== 'move' && mode !== 'waypoint' && mode !== 'formation') mode = null;
    mobileOrderMode = mode;
    document.querySelectorAll('#infoCard .info-order-btn').forEach(btn => {
        let mo = btn.getAttribute('data-mo');
        if(mo !== 'move' && mo !== 'waypoint' && mo !== 'formation') return;
        let on = mo === mode;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    return mobileOrderMode;
}
function toggleMobileOrderMode(mode) {
    return setMobileOrderMode(mobileOrderMode === mode ? null : mode);
}
function toggleInfoCardMore(force) {
    let card = document.getElementById('infoCard');
    if(!card) return;
    let open = force === true ? true : (force === false ? false : !card.classList.contains('info-card--more-open'));
    card.classList.toggle('info-card--more-open', open);
    let moreBtn = card.querySelector('.info-order-btn[data-mo="more"]');
    if(moreBtn) {
        moreBtn.classList.toggle('active', open);
        moreBtn.setAttribute('aria-pressed', open ? 'true' : 'false');
    }
}
function deselectAllSelection() {
    if(gameState !== 'PLAYING') return;
    for(let i = 0, n = gameData.selection.length; i < n; i++) {
        let s = gameData.selection[i];
        if(s) s.selected = false;
    }
    gameData.selection = [];
    gameData.pathStrokePreview = null;
    pathOrderStroke.active = false;
    pathOrderStroke.pts = [];
    pathOrderStroke.moved = false;
    setMobileOrderMode(null);
    _infoCardUiThrottle.s = null;
    syncInfoCardPanel();
}
function wodCloseHudMenusForSelection() {
    let root = document.getElementById('inGameUI');
    if(root) {
        root.removeAttribute('data-mtab');
        root.removeAttribute('data-build-picking');
    }
    if(typeof exitBuildPlacementMode === 'function') exitBuildPlacementMode();
    if(typeof wodStatsMenuOpen === 'function' && wodStatsMenuOpen() && typeof toggleWodStatsPanel === 'function')
        toggleWodStatsPanel(false);
    if(typeof wodCitiesMenuOpen === 'function' && wodCitiesMenuOpen() && typeof toggleWodCitiesPanel === 'function')
        toggleWodCitiesPanel(false);
    let pop = document.getElementById('wodSpeedPop');
    let trig = document.getElementById('wodSpeedTrigger');
    if(pop) pop.hidden = true;
    if(trig) trig.setAttribute('aria-expanded', 'false');
    document.querySelectorAll('.wod-m-tab').forEach(b => {
        let id = b.getAttribute('data-wod-mtab');
        let on = id === 'intel' && typeof wodStatsMenuOpen === 'function' ? wodStatsMenuOpen()
            : (id === 'cities' && typeof wodCitiesMenuOpen === 'function' ? wodCitiesMenuOpen() : false);
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if(typeof wodSyncViewportAndCanvas === 'function') wodSyncViewportAndCanvas();
}
function wodApplyMapSelection(item) {
    if(!item) return false;
    wodCloseHudMenusForSelection();
    item.selected = true;
    gameData.selection.push(item);
    wodPlayUnitSelectionSound([item]);
    _infoCardUiThrottle.s = null;
    syncInfoCardPanel();
    return true;
}
function wodApplyMapSelectionBatch(items) {
    if(!items || !items.length) return false;
    wodCloseHudMenusForSelection();
    for(let i = 0; i < items.length; i++) {
        let item = items[i];
        if(!item) continue;
        item.selected = true;
        gameData.selection.push(item);
    }
    wodPlayUnitSelectionSound(items);
    _infoCardUiThrottle.s = null;
    syncInfoCardPanel();
    return true;
}
function wodReplaceMapSelection(item) {
    if(!item) return false;
    for(let i = 0; i < gameData.selection.length; i++) {
        let old = gameData.selection[i];
        if(old && old !== item) old.selected = false;
    }
    gameData.selection = [];
    item.selected = false;
    return wodApplyMapSelection(item);
}
function initWodHudDeselectOnClick() {
    let root = document.getElementById('inGameUI');
    if(!root || root._wodHudDeselectWired) return;
    root._wodHudDeselectWired = true;
    root.addEventListener('click', ev => {
        if(gameState !== 'PLAYING' || !gameData.selection.length) return;
        let t = ev.target;
        if(!t || !t.closest) return;
        if(t.closest('#infoCard')) return;
        if(t.closest('.build-btn, .speed-btn, .wod-stats-btn, .wod-cities-btn, .wod-m-tab, .wod-m-menu-btn, .wod-m-speed-trigger, .wod-m-speed-opt, .wod-m-dock-toggle, .wod-pc-prod-tab, .wod-pc-prod-toggle, .layer-btn, .cities-build-btn, .cities-name-btn, #citiesMenu')) {
            deselectAllSelection();
        }
    }, true);
}
function tryMobileMapOrderTap(clientX, clientY) {
    if(gameState !== 'PLAYING') return;
    let units = getMovableSelectedUnits();
    if(units.length === 0) return;
    let worldPos = getWorldPosFromClientXY(clientX, clientY);
    const target=pickInspectableUnitAt(worldPos);if(target&&wodIsHostileOwner(target.owner,wodLocalPlayerOwner())&&wodIssuePreferredTarget(target))return;
    if(mobileOrderMode === 'formation') {
        issueLineFormationOrder(worldPos,worldPos);
        return;
    }
    if(mobileOrderMode === 'waypoint') {
        wodCommitShiftWaypointAt(worldPos);
        return;
    }
    if(mobileOrderMode === 'move') {
        if(!pickAnyUnitAt(worldPos))
            issueMoveOrder(worldPos);
    }
}
function getWorldPosFromClientXY(clientX, clientY) {
    let p = wodClientToCanvasLocal(clientX, clientY);
    return {
        x: (p.x + gameData.camera.x) / gameData.camera.zoom,
        y: (p.y + gameData.camera.y) / gameData.camera.zoom
    };
}
function getMouseWorldPos(e) {
    return getWorldPosFromClientXY(e.clientX, e.clientY);
}
function pickAnyUnitAt(worldPos) {
    for(let unit of gameData.entities) {
        if(!unit || unit.hp <= 0) continue;
        let dx = worldPos.x - unit.x, dy = worldPos.y - unit.y;
        let r = unit.radius || 10;
        if(dx * dx + dy * dy < r * r) return unit;
    }
    return null;
}
function pickInspectableUnitAt(worldPos) {
    function inRange(unit) {
        if(!unit || unit.hp <= 0) return false;
        let dx = worldPos.x - unit.x, dy = worldPos.y - unit.y;
        let r = unit.radius || 10;
        return dx * dx + dy * dy < r * r;
    }
    let lo = wodLocalPlayerOwner();
    for(let unit of gameData.entities) {
        if(unit.owner === lo && unit.type !== 'convoy' && inRange(unit)) return unit;
    }
    for(let unit of gameData.entities) {
        if(unit.owner === lo && unit.type === 'convoy' && inRange(unit)) return unit;
    }
    for(let unit of gameData.entities) {
        if(unit.owner !== lo && unit.type !== 'convoy' && inRange(unit) && wodFogCanSeeUnit(unit)) return unit;
    }
    for(let unit of gameData.entities) {
        if(unit.owner !== lo && unit.type === 'convoy' && inRange(unit) && wodFogCanSeeUnit(unit)) return unit;
    }
    return null;
}
/** Unit on a city: first tap selects unit, second tap same stack selects city; city-only clicks still pick the city. */
function wodPickCityOrUnitForMapSelection(worldPos) {
    const CITY_R2 = 400;
    let bestCity = null;
    let bestD = Infinity;
    for(let city of gameData.cities) {
        if(!wodFogCanSeeCity(city)) continue;
        let dx = worldPos.x - city.x, dy = worldPos.y - city.y;
        let d = dx * dx + dy * dy;
        if(d < CITY_R2 && d < bestD) {
            bestD = d;
            bestCity = city;
        }
    }
    let pickedUnit = pickInspectableUnitAt(worldPos);
    if(pickedUnit && bestCity) {
        let uid = pickedUnit.uid;
        let cid = bestCity.id;
        let st = gameData._cityUnitStackTap;
        let sameStack = st && st.uid === uid && st.cityId === cid &&
            (worldPos.x - st.x) * (worldPos.x - st.x) + (worldPos.y - st.y) * (worldPos.y - st.y) < 900;
        if(sameStack) {
            if(st.lastPick === 'unit') {
                gameData._cityUnitStackTap = { uid, cityId: cid, x: worldPos.x, y: worldPos.y, lastPick: 'city' };
                return { city: bestCity, unit: null };
            }
            gameData._cityUnitStackTap = { uid, cityId: cid, x: worldPos.x, y: worldPos.y, lastPick: 'unit' };
            return { city: null, unit: pickedUnit };
        }
        gameData._cityUnitStackTap = { uid, cityId: cid, x: worldPos.x, y: worldPos.y, lastPick: 'unit' };
        return { city: null, unit: pickedUnit };
    }
    gameData._cityUnitStackTap = null;
    if(pickedUnit) return { city: null, unit: pickedUnit };
    if(bestCity) return { city: bestCity, unit: null };
    return { city: null, unit: null };
}
function getMovableSelectedUnits() {
    if(gameData._spectator)return [];
    let o = wodLocalPlayerOwner();
    return gameData.selection.filter(s => s && s.hp !== undefined && s.hp > 0 && !s.id && s.type !== 'convoy' && !s.moraleBroken && s.owner === o);
}
function wodMovableSelectionHasActiveMarch() {
    let u = getMovableSelectedUnits();
    if(!u.length) return false;
    return u.some(x => x.target || (x.path && x.path.length) || x.orderTarget
        || (x.fullMarchWaypoints && x.fullMarchWaypoints.length));
}
function assignUnitMoveTarget(unit, x, y) {
    let target = findReachableOrderHex(unit, x, y);
    if(!target) return;
    assignUnitMoveAlongWaypoints(unit, [{x: target.exactX, y: target.exactY}]);
}
function wodUnitRemainingMarchPoints(unit) {
    if(!unit) return [];
    if(unit.fullMarchWaypoints && unit.fullMarchWaypoints.length > 0) {
        let c = Math.max(0, unit.marchWpCursor || 0);
        return unit.fullMarchWaypoints.slice(c).map(p => ({ x: p.x, y: p.y }));
    }
    if(unit.orderTarget && unit.orderTarget.x != null)
        return [{ x: unit.orderTarget.x, y: unit.orderTarget.y }];
    if(unit.target && unit.target.x != null && !unit.target.isCity)
        return [{ x: unit.target.x, y: unit.target.y }];
    return [];
}
function wodReserveGroupPoint(unit,desired,used,selected,reference=desired,strict=false) {
    const hr=gameData.hexRadius||20,requested=getNearestHexToPoint(reference.x,reference.y),water=wodIsNavalUnit(unit)||unit.type==='convoy'&&unit.convoySeaRoute;
    const wet=water||requested&&isWaterHex(requested)&&!isBridgeHex(requested),reach=wodAiOperationReach(unit,water);
    const legal=p=>{
        const h=getNearestHexToPoint(p.x,p.y);if(!h||!canUnitEnterHex(unit,h)||(water||!wet)&&!reach.has(getHexKey(h))||(!wet||water)&&!wodSamplePosOnWalkableTerrain(unit,p.x,p.y))return false;
        if(water?!wodIsOpenWaterHex(h):!wet&&isWaterHex(h)&&!isBridgeHex(h)||wet&&!water&&!isWaterHex(h)&&!isBridgeHex(h))return false;
        if(used.some(s=>Math.hypot(s.point.x-p.x,s.point.y-p.y)<(unit.radius||12)+(s.unit.radius||12)+4))return false;
        let blocked=false;forEachNearbyUnit(gameData.unitSpatialGrid,p.x,p.y,(unit.radius||12)+65,u=>{
            if(u!==unit&&!selected.has(u)&&u.hp>0&&!u.boardTransportUid&&Math.hypot(u.x-p.x,u.y-p.y)<(unit.radius||12)+(u.radius||12)+4)blocked=true;
        });return !blocked;
    };
    if(legal(desired))return {x:desired.x,y:desired.y};
    if(strict)return null;
    const at=getNearestHexToPoint(desired.x,desired.y);if(!at)return null;
    const sites=getHexesInRadius(at.q,at.r,Math.max(4,Math.ceil(Math.sqrt(selected.size))+2)).map(p=>gameData.hexes[p.q+','+p.r]).filter(h=>h&&legal(h));
    sites.sort((a,b)=>Math.hypot(a.x-desired.x,a.y-desired.y)-Math.hypot(b.x-desired.x,b.y-desired.y));
    return sites[0]?{x:sites[0].x,y:sites[0].y}:null;
}
// Minimum total travel keeps the order independent of selection/UID order.
// The assignment is made once; traffic never changes these destinations.
function wodMatchGroupSlots(units,slots) {
    const n=units.length,u=new Float64Array(n+1),v=new Float64Array(n+1),p=new Int32Array(n+1),way=new Int32Array(n+1);
    if(n>128){
        const order=units.slice().sort((a,b)=>a.y-b.y||a.x-b.x),points=slots.slice().sort((a,b)=>a.y-b.y||a.x-b.x);
        return new Map(order.map((unit,i)=>[unit,points[i]]));
    }
    for(let i=1;i<=n;i++){
        p[0]=i;let j0=0;const min=new Float64Array(n+1).fill(Infinity),used=new Uint8Array(n+1);
        do{
            used[j0]=1;const i0=p[j0];let delta=Infinity,j1=0;
            for(let j=1;j<=n;j++)if(!used[j]){
                const cost=(units[i0-1].x-slots[j-1].x)**2+(units[i0-1].y-slots[j-1].y)**2-u[i0]-v[j];
                if(cost<min[j]){min[j]=cost;way[j]=j0;}if(min[j]<delta){delta=min[j];j1=j;}
            }
            for(let j=0;j<=n;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else min[j]-=delta;j0=j1;
        }while(p[j0]!==0);
        do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
    }
    const result=new Map();for(let j=1;j<=n;j++)result.set(units[p[j]-1],slots[j-1]);return result;
}
function wodFormationGestureIsLine(start,end,force=false) {
    // Distinguish a deliberate drag from click jitter in screen pixels.
    // Formation mode is always a line, including a tap at minimum spacing.
    return force||Math.hypot(end.x-start.x,end.y-start.y)*(gameData.camera.zoom||1)+1e-6>=4;
}
function wodFormationDragPlan(units) {
    const start=formationDrag.startWorld,end=formationDrag.endWorld;
    const mode=leftMapOrderDrag.active?leftMapOrderDrag.mode:mobileOrderMode;
    const pointMove=leftMapOrderDrag.active&&mode==='move';
    if(!pointMove&&(mode==='formation'||units.length>1&&wodFormationGestureIsLine(start,end)))
        return wodLineFormationPlan(units,start,end);
    if(shiftWaypointDrag.active||mode==='waypoint'){
        const offsets=wodGroupFormationOffsetMap(units),selected=new Set(units),used=[],slots=new Map();
        for(const unit of units){
            const off=offsets.get(unit)||{ox:0,oy:0},desired=wodSnapWaypointWorldPoint(unit,end.x+off.ox,end.y+off.oy);
            const point=desired&&wodReserveGroupPoint(unit,desired,used,selected);
            if(point){used.push({unit,point});slots.set(unit,point);}
        }return {slots};
    }
    return {slots:wodGroupDestinationSlots(units,end)};
}
function wodLineFormationLayout(units,start,end) {
    const count=units.length,dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy),ax=length?dx/length:1,ay=length?dy/length:0;
    // Pairwise clearance, independent of army size: one tank must not
    // impose tank-sized gaps between every pair of infantry.
    const order=units.slice().sort((a,b)=>(a.x-b.x)*ax+(a.y-b.y)*ay||String(a.uid).localeCompare(String(b.uid)));
    const gaps=order.slice(1).map((u,i)=>((u.radius||12)+(order[i].radius||12)+6)/Math.max(Math.abs(ax),Math.abs(ay)));
    const minimum=gaps.reduce((s,g)=>s+g,0),span=Math.max(length,minimum),extra=count>1?(span-minimum)/(count-1):0,cx=(start.x+end.x)/2,cy=(start.y+end.y)/2;
    const first={x:cx-ax*span/2,y:cy-ay*span/2},last={x:cx+ax*span/2,y:cy+ay*span/2};
    let along=0;
    return {start:first,end:last,spacing:count>1?span/(count-1):0,order,slots:order.map((u,i)=>{
        if(i)along+=gaps[i-1]+extra;const offset=count===1?span/2:along;return {x:first.x+ax*offset,y:first.y+ay*offset};
    })};
}
function wodLineFormationPlan(units,start,end) {
    // Selection ordering must not change the preview's unit-to-slot assignment
    // when the mouse is released or a multiplayer command is received.
    const ordered=units.slice().sort((a,b)=>String(a.uid).localeCompare(String(b.uid)));
    const key=start.x+','+start.y+'>'+end.x+','+end.y+'|'+ordered.map(u=>u.uid+':'+u.type+':'+u.radius+':'+Math.round(u.x/4)+','+Math.round(u.y/4)).join('|')+'|'+(gameData._wodPfVer||0);
    const cached=gameData._wodLinePreview;
    if(cached?.hexes===gameData.hexes&&cached.key===key&&performance.now()-cached.at<80)return cached;
    let layout=wodLineFormationLayout(ordered,start,end);
    const selected=new Set(ordered);
    const center={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
    const dx=layout.end.x-layout.start.x,dy=layout.end.y-layout.start.y,len=Math.hypot(dx,dy)||1,ax=dx/len,ay=dy/len;
    const fit=(shift,across=0)=>{
        const used=[],slots=new Map();
        for(let i=0;i<layout.order.length;i++){
            const unit=layout.order[i],p=layout.slots[i],point=wodReserveGroupPoint(unit,{x:p.x+ax*shift-ay*across,y:p.y+ay*shift+ax*across},used,selected,center,true);
            if(!point)return null;used.push({unit,point});slots.set(unit,point);
        }return slots;
    };
    let resolved=fit(0),shift=0,across=0;
    if(!resolved){
        let bounds=gameData._wodFormationBounds;
        if(bounds?.hexes!==gameData.hexes){bounds={hexes:gameData.hexes,minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};for(const h of gameData.hexList){bounds.minX=Math.min(bounds.minX,h.x);bounds.maxX=Math.max(bounds.maxX,h.x);bounds.minY=Math.min(bounds.minY,h.y);bounds.maxY=Math.max(bounds.maxY,h.y);}gameData._wodFormationBounds=bounds;}
        const pad=(gameData.hexRadius||20)*.675-1;
        const step=(gameData.hexRadius||20)*.675,candidates=[];
        for(const normal of [0,step*2,-step*2,step*4,-step*4]){
            let lo=-Infinity,hi=Infinity;
            for(const [axis,key,min,max,offset]of [[ax,'x',bounds.minX-pad,bounds.maxX+pad,-ay*normal],[ay,'y',bounds.minY-pad,bounds.maxY+pad,ax*normal]])if(Math.abs(axis)>1e-6){
                for(const p of [layout.start,layout.end]){const a=(min-p[key]-offset)/axis,b=(max-p[key]-offset)/axis;lo=Math.max(lo,Math.min(a,b));hi=Math.min(hi,Math.max(a,b));}
            }
            if(lo>hi)continue;
            const base=Math.max(lo,Math.min(hi,0));
            for(let i=0;i<241;i++){
                const trial=base+(i%2?1:-1)*Math.ceil(i/2)*step;if(trial>=lo&&trial<=hi)candidates.push({shift:trial,across:normal,cost:trial*trial+normal*normal});
            }
        }
        candidates.sort((a,b)=>a.cost-b.cost);
        for(const trial of candidates){resolved=fit(trial.shift,trial.across);if(resolved){shift=trial.shift;across=trial.across;break;}}
    }
    if(resolved){
        const sx=ax*shift-ay*across,sy=ay*shift+ax*across;
        layout={...layout,start:{x:layout.start.x+sx,y:layout.start.y+sy},end:{x:layout.end.x+sx,y:layout.end.y+sy},slots:layout.order.map(u=>resolved.get(u))};
        return gameData._wodLinePreview={hexes:gameData.hexes,key,at:performance.now(),layout,slots:resolved};
    }
    // Disconnected shores or a physically undersized clearing still use
    // legal reachable positions; never solve a tight line by overlapping bodies.
    const used=[];resolved=new Map();
    for(let i=0;i<layout.order.length;i++){
        const unit=layout.order[i],point=wodReserveGroupPoint(unit,layout.slots[i],used,selected,center);
        if(point){used.push({unit,point});resolved.set(unit,point);}
    }
    return gameData._wodLinePreview={hexes:gameData.hexes,key,at:performance.now(),layout,slots:resolved};
}
function wodGroupDestinationSlots(units,center,line) {
    if(line)return wodLineFormationPlan(units,line.start,line.end).slots;
    const n=units.length,spacing=Math.max(32,(gameData.hexRadius||20)*1.35,...units.map(u=>(u.radius||12)*4+6));
    const length=line?Math.hypot(line.end.x-line.start.x,line.end.y-line.start.y):0;
    const cols=line?Math.max(1,Math.min(n,Math.floor(length/spacing)+1)):Math.ceil(Math.sqrt(n)),rows=Math.ceil(n/cols),slots=[];
    const ax=line&&length?(line.end.x-line.start.x)/length:1,ay=line&&length?(line.end.y-line.start.y)/length:0;
    for(let i=0;i<n;i++){
        const row=Math.floor(i/cols),count=Math.min(cols,n-row*cols),lane=(i%cols-(count-1)/2)*spacing,back=(row-(rows-1)/2)*spacing;
        slots.push({x:center.x+ax*lane-ay*back,y:center.y+ay*lane+ax*back});
    }
    const match=wodMatchGroupSlots(units,slots),selected=new Set(units),used=[],result=new Map();
    for(const unit of units){
        if((wodIsNavalUnit(unit)||unit.type==='convoy'&&unit.convoySeaRoute)&&!wodResolveShipMarchHex(unit,center.x,center.y))continue;
        const point=wodReserveGroupPoint(unit,match.get(unit),used,selected,center);
        if(point){used.push({unit,point});result.set(unit,point);}
    }return result;
}
function wodGroupFormationOffsetMap(units) {
    let map = new Map();
    if(!units || !units.length) return map;
    let pts = units.map(u => {
        let rem = wodUnitRemainingMarchPoints(u);
        return rem.length ? rem[rem.length - 1] : { x: u.x, y: u.y };
    });
    let cx = 0, cy = 0;
    for(let p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length;
    cy /= pts.length;
    for(let i = 0; i < units.length; i++)
        map.set(units[i], { ox: pts[i].x - cx, oy: pts[i].y - cy });
    return map;
}
function wodSnapWaypointWorldPoint(unit, px, py) {
    if(!unit) return { x: px, y: py };
    if(wodIsNavalUnit(unit) || (unit.type === 'convoy' && unit.convoySeaRoute)) {
        let sea = wodResolveShipMarchHex(unit, px, py);
        return sea ? { x: sea.exactX, y: sea.exactY } : null;
    }
    const requested=getNearestHexToPoint(px,py);
    if(requested&&isWaterHex(requested)&&!isBridgeHex(requested))return {x:px,y:py};
    if(isLandArmyUnit(unit) || wodUnitPrefersLandOnlyPath(unit)) {
        let h = getNearestHexToPoint(px, py);
        if(h && (wodIsOpenWaterHex(h) || isBridgeHex(h))) {
            let landNear = null,
                landD = Infinity;
            let jc = pixelToHex(px, py);
            for(let pt of getHexesInRadius(jc.q, jc.r, 2)) {
                let lh = wodHexAt(pt.q,pt.r);
                if(!lh || lh.type === 'mountain' || isWaterHex(lh) || isBridgeHex(lh)) continue;
                if(!wodHexWalkableForLandPath(unit, lh, false)) continue;
                let dx = lh.x - px,
                    dy = lh.y - py;
                let d = dx * dx + dy * dy;
                if(d < landD) {
                    landD = d;
                    landNear = lh;
                }
            }
            let hr = gameData.hexRadius || 20;
            if(landNear && landD <= Math.pow(hr * 2.4, 2))
                return { x: landNear.x, y: landNear.y };
            if(wodPointOnBridgeForUnit(unit, px, py, 1.05) || wodIsOpenWaterHex(h)) {
                let snap = wodSnapLandArmyOrderPoint(unit, px, py);
                if(snap) return { x: snap.x, y: snap.y };
            }
        }
    }
    return { x: px, y: py };
}
function wodTrimNearMarchPoints(unit, pathPts) {
    if(!pathPts || pathPts.length <= 1) return pathPts;
    let trimR2 = Math.pow(Math.max(20, gameData.hexRadius * 1.45), 2);
    while(pathPts.length > 1) {
        let p = pathPts[0];
        let dx = p.x - unit.x;
        let dy = p.y - unit.y;
        if(dx * dx + dy * dy < trimR2) pathPts.shift();
        else break;
    }
    return pathPts;
}
function wodGroupWaypointPaths(units,wps,line) {
    const paths=new Map(units.map(u=>[u,[]]));
    for(let wi=0;wi<wps.length;wi++){
        const slots=wi===wps.length-1&&line?wodLineFormationPlan(units,line.start,line.end).slots:wodGroupDestinationSlots(units,wps[wi]);
        for(const unit of units){
            const path=paths.get(unit),dest=slots.get(unit);if(!path)continue;
            const snapped=dest&&wodSnapWaypointWorldPoint(unit,dest.x,dest.y);
            if(!snapped){paths.set(unit,null);continue;}
            path.push(snapped);
        }
    }
    for(const unit of units)if(paths.get(unit))paths.set(unit,wodTrimNearMarchPoints(unit,paths.get(unit)));
    return paths;
}
function wodApplyShiftWaypointPaths(units, wps, line) {
    if(!units?.length||!wps?.length)return;
    const paths=wodGroupWaypointPaths(units,wps,line);
    wodApplyPlayerMoveOrders(units,u=>paths.get(u));
}
function seedPlayerShiftWaypointsFromActiveMarch(units) {
    let wq = gameData.playerShiftWaypoints;
    if(!units || units.length === 0) return;
    if(wq && wq.length > 0) return;
    let moving = units.filter(u => u.target || (u.path && u.path.length > 0)
        || (u.fullMarchWaypoints && u.fullMarchWaypoints.length));
    if(!moving.length) return;
    if(units.length === 1) {
        let ref = units[0];
        if(ref.fullMarchWaypoints && ref.fullMarchWaypoints.length > 0) {
            let c = Math.max(0, ref.marchWpCursor || 0);
            gameData.playerShiftWaypoints = ref.fullMarchWaypoints.slice(c).map(p => ({x: p.x, y: p.y}));
            return;
        }
        if(ref.orderTarget) {
            gameData.playerShiftWaypoints = [{x: ref.orderTarget.x, y: ref.orderTarget.y}];
            return;
        }
        if(ref.target) {
            gameData.playerShiftWaypoints = [{x: ref.target.x, y: ref.target.y}];
        }
        return;
    }
    let ref = moving[0];
    if(ref.fullMarchWaypoints && ref.fullMarchWaypoints.length > 0) {
        let c = Math.max(0, ref.marchWpCursor || 0);
        let lenRemain = ref.fullMarchWaypoints.length - c;
        let sameShape = moving.length === units.length && lenRemain > 0 && moving.every(u => {
            if(!u.fullMarchWaypoints || u.fullMarchWaypoints.length === 0) return false;
            let uc = Math.max(0, u.marchWpCursor || 0);
            return u.fullMarchWaypoints.length - uc === lenRemain;
        });
        if(sameShape) {
            let seed = [];
            for(let i = c; i < ref.fullMarchWaypoints.length; i++) {
                let sx = 0, sy = 0, denom = 0;
                for(let u of moving) {
                    let uc = Math.max(0, u.marchWpCursor || 0);
                    let w = u.fullMarchWaypoints[uc + (i - c)];
                    if(!w) continue;
                    sx += w.x;
                    sy += w.y;
                    denom++;
                }
                if(denom) seed.push({x: sx / denom, y: sy / denom});
            }
            if(seed.length) gameData.playerShiftWaypoints = seed;
            return;
        }
    }
    let sx = 0, sy = 0, n = 0;
    for(let u of moving) {
        let ox, oy;
        if(u.fullMarchWaypoints && u.fullMarchWaypoints.length > 0) {
            let uc = Math.max(0, u.marchWpCursor || 0);
            let wp = u.fullMarchWaypoints[uc];
            if(wp) { ox = wp.x; oy = wp.y; }
        }
        if(ox === undefined && u.orderTarget) { ox = u.orderTarget.x; oy = u.orderTarget.y; }
        if(ox === undefined && u.target) { ox = u.target.x; oy = u.target.y; }
        if(ox !== undefined) {
            sx += ox;
            sy += oy;
            n++;
        }
    }
    if(n) gameData.playerShiftWaypoints = [{x: sx / n, y: sy / n}];
}
function wodPrepareShiftWaypointQueue(units) {
    let allIdle = units.every(u => !u.target && (!u.path || u.path.length === 0)
        && !(u.fullMarchWaypoints && u.fullMarchWaypoints.length));
    if(allIdle) gameData.playerShiftWaypoints = [];
    if(!gameData.playerShiftWaypoints) gameData.playerShiftWaypoints = [];
    seedPlayerShiftWaypointsFromActiveMarch(units);
}
function wodShiftWaypointNotice(n) {
    showNotification(n <= 1 ? 'Marching to waypoint' : `Marching via ${n} waypoints`);
}
function wodSendOrApplyShiftWaypointPaths(units, wps, line) {
    if(gameData.mp && gameData.mp.enabled && !wodMpMatchCanPlay()) return;
    if(wps.length > 32) wps.splice(0, wps.length - 32);
    let order = units.slice();
    const grouped=wodGroupWaypointPaths(order,wps,line);
    let paths=order.map(u=>grouped.get(u));
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        if(wodMpSendCmd({
            kind: 'shiftMarch',
            uids: order.map(u => u.uid),
            wps: wps.map(w => ({ x: w.x, y: w.y })),
            line: line ? { start: { x: line.start.x, y: line.start.y }, end: { x: line.end.x, y: line.end.y } } : null,
            paths: paths.map(p => (p || []).map(pt => ({ x: pt.x, y: pt.y })))
        })) {
            wodShiftWaypointNotice(wps.length);
            return;
        }
    }
    wodApplyPlayerMoveOrders(order, (unit) => {
        let i = order.indexOf(unit);
        return paths[i] && paths[i].length ? paths[i] : null;
    });
    wodShiftWaypointNotice(wps.length);
}
function wodCommitShiftWaypointAt(worldPos) {
    let units = getMovableSelectedUnits();
    if(!units.length || !worldPos) return false;
    if(wodCampaignDeployActive()) {
        wodCampaignDeployUnitsAt(worldPos);
        gameData.playerShiftWaypoints = [];
        return true;
    }
    wodPrepareShiftWaypointQueue(units);
    gameData.playerShiftWaypoints.push({ x: worldPos.x, y: worldPos.y });
    applyShiftWaypointMarch();
    return true;
}
function wodCommitShiftFormationWaypoint(start, end) {
    let units = getMovableSelectedUnits();
    if(!units.length || !start || !end) return false;
    if(wodCampaignDeployActive()) {
        wodCampaignDeployUnitsAlongLine(start, end);
        gameData.playerShiftWaypoints = [];
        return true;
    }
    if(units.length < 2) return wodCommitShiftWaypointAt(end);
    wodPrepareShiftWaypointQueue(units);
    gameData.playerShiftWaypoints.push({
        x: (start.x + end.x) * 0.5,
        y: (start.y + end.y) * 0.5
    });
    applyShiftWaypointMarch({ line: { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } } });
    return true;
}
function applyShiftWaypointMarch(opt) {
    if(wodCampaignDeployActive()) {
        let wps = gameData.playerShiftWaypoints;
        if(wps && wps.length >= 2) wodCampaignDeployUnitsAlongStroke(wps);
        else if(wps && wps.length) wodCampaignDeployUnitsAt(wps[wps.length - 1]);
        gameData.playerShiftWaypoints = [];
        return;
    }
    let units = getMovableSelectedUnits();
    if(units.length === 0) return;
    let wps = gameData.playerShiftWaypoints;
    if(!wps || wps.length === 0) return;
    wodSendOrApplyShiftWaypointPaths(units, wps, opt && opt.line ? opt.line : null);
}
function issueMoveOrder(worldPos) {
    if(wodCampaignDeployActive()) {
        wodCampaignDeployUnitsAt(worldPos);
        return;
    }
    if(gameData.mp && gameData.mp.enabled && !wodMpMatchCanPlay()) return;
    let units = getMovableSelectedUnits();
    if(units.length === 0) return;
    const focus=pickInspectableUnitAt(worldPos);
    if(focus&&wodIsHostileOwner(focus.owner,wodLocalPlayerOwner())&&focus.type!=='convoy'&&wodIssuePreferredTarget(focus))return;
    const hit=gameData.entities.find(t=>t.type==='transport'&&t.owner===wodLocalPlayerOwner()&&t.hp>0&&Math.hypot(t.x-worldPos.x,t.y-worldPos.y)<(t.radius||16)+10);
    if(hit&&!units.includes(hit)&&units.some(u=>!wodIsNavalUnit(u))){const u=units.find(u=>!wodIsNavalUnit(u));if(wodSendTransportCommand('boardTransport',u,hit)){showNotification('Boarding transport');return;}}
    const destination=getNearestHexToPoint(worldPos.x,worldPos.y);
    if(destination&&!isWaterHex(destination)){
        const ferries=units.filter(u=>u.type==='transport'&&u.cargo);
        for(const t of ferries)wodSendTransportCommand('unloadTransport',null,t,worldPos);
        units=units.filter(u=>!ferries.includes(u));if(!units.length)return;
    }
    gameData.playerShiftWaypoints = [];
    if(!gameData.mp||!gameData.mp.enabled||gameData.mp.isHost){
        const slots=wodGroupDestinationSlots(units,worldPos);
        wodApplyPlayerMoveOrders(units,u=>slots.has(u)?[slots.get(u)]:null);
        showNotification(slots.size===1?'Marching':slots.size?'Marching ('+slots.size+' units)':'No reachable formation space');
    }else showNotification(units.length===1?'Marching':'Marching ('+units.length+' units)');
    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost)
        wodMpSendCmd({ kind: 'move', uids: units.map(u => u.uid), x: worldPos.x, y: worldPos.y });
}
function issueLineFormationOrder(start, end) {
    if(wodCampaignDeployActive()) {
        wodCampaignDeployUnitsAlongLine(start, end || start);
        return;
    }
    if(gameData.mp && gameData.mp.enabled && !wodMpMatchCanPlay()) return;
    let units = getMovableSelectedUnits();
    if(units.length === 0) return;
    gameData.playerShiftWaypoints = [];
    units.sort((a, b) => {
        let dx = end.x - start.x;
        let dy = end.y - start.y;
        let len = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        let ax = ((a.x - start.x) * dx + (a.y - start.y) * dy) / len;
        let bx = ((b.x - start.x) * dx + (b.y - start.y) * dy) / len;
        return ax - bx;
    });

    if(gameData.mp && gameData.mp.enabled && !gameData.mp.isHost) {
        if(wodMpSendCmd({ kind: 'lineFormation', uids: units.map(u => u.uid), sx: start.x, sy: start.y, ex: end.x, ey: end.y }))
            return;
    }

    const slots=wodGroupDestinationSlots(units,{x:(start.x+end.x)/2,y:(start.y+end.y)/2},{start,end});
    wodApplyPlayerMoveOrders(units,u=>slots.has(u)?[slots.get(u)]:null);
}
let gameTouchTrackId = null;
let wodMobileOrderGesture = null;
let wodMobileNavTouch = null;
function wodCancelMobileNavTouch() {
    if(wodMobileNavTouch && wodMobileNavTouch.timer) clearTimeout(wodMobileNavTouch.timer);
    wodMobileNavTouch = null;
}
function finishGameTouchEnd(touch) {
    if(gameTouchTrackId !== null && touch.identifier !== gameTouchTrackId) return;
    gameTouchTrackId = null;
    if(gameData.buildMode === 'bridge' && gameData.bridgePlacement?.dragging) {
        wodRefreshInputRect();
        wodBridgeDragEnd(getWorldPosFromClientXY(touch.clientX, touch.clientY));
        return;
    }
    if(isPanning) {
        isPanning = false;
        wodCancelMobileNavTouch();
        return;
    }
    if(wodMobileOrderGesture) {
        wodRefreshInputRect();
        tryMobileMapOrderTap(touch.clientX, touch.clientY);
        wodMobileOrderGesture = null;
        return;
    }
    if(wodMobileNavTouch) {
        let g = wodMobileNavTouch;
        if(g.timer) { clearTimeout(g.timer); g.timer = null; }
        wodMobileNavTouch = null;
        wodRefreshInputRect();
        let local = wodClientToCanvasLocal(touch.clientX, touch.clientY);
        let cx = local.x;
        let cy = local.y;
        if(Math.abs(cx - g.startCx) < 5 && Math.abs(cy - g.startCy) < 5) {
            let worldPos = getWorldPosFromClientXY(touch.clientX, touch.clientY);
            if(gameData.buildMode) {
                wodHandleProductionPlacementClick(worldPos);
                return;
            }
            let pickSel = wodPickCityOrUnitForMapSelection(worldPos);
            if(pickSel.city) { wodReplaceMapSelection(pickSel.city); return; }
            if(pickSel.unit) { if(getMovableSelectedUnits().length&&wodIsHostileOwner(pickSel.unit.owner,wodLocalPlayerOwner())&&wodIssuePreferredTarget(pickSel.unit))return;wodReplaceMapSelection(pickSel.unit); return; }
            if(!wodIsMobileOrderModeArmed()) {
                deselectAllSelection();
                return;
            }
            tryMobileMapOrderTap(touch.clientX, touch.clientY);
        }
        return;
    }
    if(pathOrderStroke.active) {
        if(pathOrderStroke.moved && pathOrderStroke.pts.length >= 2)
            issueStrokeMoveOrder(pathOrderStroke.pts);
        pathOrderStroke.active = false;
        pathOrderStroke.pts = [];
        pathOrderStroke.moved = false;
        gameData.pathStrokePreview = null;
        return;
    }
    if(isDragging) {
        isDragging = false;
        UI.selectionBox.style.display = 'none';
        wodRefreshInputRect();
        let local = wodClientToCanvasLocal(touch.clientX, touch.clientY);
        let cx = local.x;
        let cy = local.y;
        if(Math.abs(cx - dragStart.x) < 5 && Math.abs(cy - dragStart.y) < 5) {
            let worldPos = getWorldPosFromClientXY(touch.clientX, touch.clientY);
            if(gameData.buildMode) {
                wodHandleProductionPlacementClick(worldPos);
                return;
            }
            let pickSel = wodPickCityOrUnitForMapSelection(worldPos);
            if(pickSel.city) { wodReplaceMapSelection(pickSel.city); return; }
            if(pickSel.unit) { wodReplaceMapSelection(pickSel.unit); return; }
            if(!wodIsMobileOrderModeArmed()) {
                deselectAllSelection();
                return;
            }
            tryMobileMapOrderTap(touch.clientX, touch.clientY);
        } else {
            const worldL = (Math.min(cx, dragStart.x) + gameData.camera.x) / gameData.camera.zoom;
            const worldR = (Math.max(cx, dragStart.x) + gameData.camera.x) / gameData.camera.zoom;
            const worldT = (Math.min(cy, dragStart.y) + gameData.camera.y) / gameData.camera.zoom;
            const worldB = (Math.max(cy, dragStart.y) + gameData.camera.y) / gameData.camera.zoom;
            let lo = wodLocalPlayerOwner();
            let batch = [];
            for(let unit of gameData.entities) {
                if(unit.owner === lo && unit.x >= worldL && unit.x <= worldR && unit.y >= worldT && unit.y <= worldB)
                    batch.push(unit);
            }
            if(batch.length) wodApplyMapSelectionBatch(batch);
        }
        return;
    }
    if(formationDrag.active) {
        let endWorld = getWorldPosFromClientXY(touch.clientX, touch.clientY);
        formationDrag.endWorld = endWorld;
        let startWorld = formationDrag.startWorld;
        let asWaypoint = shiftWaypointDrag.active || mobileOrderMode === 'waypoint';
        shiftWaypointDrag.active = false;
        formationDrag.active = false;
        if(asWaypoint) {
            if(getMovableSelectedUnits().length > 1 && wodFormationGestureIsLine(startWorld,endWorld))
                wodCommitShiftFormationWaypoint(startWorld, endWorld);
            else if(getMovableSelectedUnits().length > 0)
                wodCommitShiftWaypointAt(endWorld);
        } else if(mobileOrderMode==='formation'||getMovableSelectedUnits().length > 1 && wodFormationGestureIsLine(startWorld,endWorld)) {
            issueLineFormationOrder(startWorld, endWorld);
        } else {
            issueMoveOrder(endWorld);
        }
    }
}
function wodApplyWheelZoomBatch() {
    wodWheelZoomRaf = 0;
    if(!wodWheelBatch || gameState !== 'PLAYING') {
        wodWheelBatch = null;
        return;
    }
    let sumDy = wodWheelBatch.dy;
    let lx = wodWheelBatch.lx;
    let ly = wodWheelBatch.ly;
    wodWheelBatch = null;
    const zoomStep = 1.1;
    let f = Math.pow(zoomStep, -sumDy / 100);
    if(!isFinite(f) || Math.abs(f - 1) < 1e-6) return;
    const oldZoom = gameData.camera.zoom;
    let newZoom = oldZoom * f;
    newZoom = Math.max(0.1, Math.min(25.0, newZoom));
    if(Math.abs(newZoom - oldZoom) < 1e-6) return;
    let local = wodClientToCanvasLocal(lx, ly);
    let mx = local.x;
    let my = local.y;
    let worldX = (mx + gameData.camera.x) / oldZoom;
    let worldY = (my + gameData.camera.y) / oldZoom;
    gameData.camera.zoom = newZoom;
    gameData.camera.x = worldX * gameData.camera.zoom - mx;
    gameData.camera.y = worldY * gameData.camera.zoom - my;
    wodBumpCamInteract(200);
}
function wodSelectControlGroup(number) {
    let ids = new Set((gameData.controlGroups || {})[number] || []);
    for(let e of gameData.selection) e.selected = false;
    gameData.selection = gameData.entities.filter(u => u.hp > 0 && u.owner === wodLocalPlayerOwner() && ids.has(u.uid));
    for(let u of gameData.selection) u.selected = true;
    wodPlayUnitSelectionSound(gameData.selection);
    syncInfoCardPanel(); wodRefreshCommandHud(true);
}
function wodSaveTouchControlGroup() {
    const units=gameData.selection.filter(u=>u.owner===wodLocalPlayerOwner()&&u.hp>0&&gameData.entities.includes(u)&&u.type!=='convoy');
    if(!units.length)return;
    const groups=gameData.controlGroups||(gameData.controlGroups={}),ids=units.map(u=>u.uid),alive=new Set(gameData.entities.filter(u=>u.hp>0).map(u=>u.uid));
    for(const n of [1,2,3,4,5,6,7,8,9,0]) {
        const old=(groups[n]||[]).filter(id=>alive.has(id));
        if(old.length===ids.length&&ids.every(id=>old.includes(id))){showNotification('These units are already in group '+n,'info');return;}
    }
    const number=[1,2,3,4,5,6,7,8,9,0].find(n=>!(groups[n]||[]).some(id=>alive.has(id)));
    if(number===undefined){showNotification('All 10 unit groups are in use. Ctrl + number replaces a group.','info');return;}
    groups[number]=ids;wodRefreshCommandHud(true);showNotification('Group '+number+' saved · '+units.length+(units.length===1?' unit':' units'),'success');
}
function wodPositionCommandHud() {
    const hud=document.getElementById('wodCommandHud');if(!hud||hud.hidden)return;
    const ui=UI.inGameUI.getBoundingClientRect();
    const scale=ui.height/(UI.inGameUI.offsetHeight||ui.height)||1;let top=ui.bottom-60;
    for(const panel of UI.inGameUI.querySelectorAll('#wodPcProdRoot,.wod-m-sheet--units,.wod-m-sheet--build,#wodDockPack,#infoCard')) {
        const r=panel.getBoundingClientRect(),style=getComputedStyle(panel);
        const hr=hud.getBoundingClientRect();if(panel.id==='infoCard'&&(r.left>=hr.right||r.right<=hr.left))continue;
        if(r.width>0&&r.height>0&&style.display!=='none'&&style.visibility!=='hidden')top=Math.min(top,r.top);
    }
    hud.style.bottom=Math.max(10,(ui.bottom-top+10)/scale)+'px';
    hud.style.maxHeight=Math.max(60,(top-ui.top-100)/scale)+'px';
}
function wodRefreshCommandHud(force) {
    if(!UI.inGameUI || (!force && performance.now() - (wodRefreshCommandHud.last || 0) < 250)) return;
    wodRefreshCommandHud.last = performance.now();
    let hud = document.getElementById('wodCommandHud');
    if(!hud) {
        hud = document.createElement('div'); hud.id = 'wodCommandHud';
        hud.style.cssText = 'position:absolute;left:12px;bottom:70px;max-width:min(410px,70vw);overflow:auto;pointer-events:auto;z-index:25;font-size:12px;color:white;background:#142333e8;border-radius:8px;padding:8px';
        hud.innerHTML = '<div class="command-group-head"><span class="command-hint--desktop" style="color:#b4c5d6">Groups · Ctrl + number to save · number to select</span><span class="command-hint--touch">Unit groups</span><button type="button" class="command-save-group" data-save-control-group>Save group</button></div><div data-group-buttons></div><div data-reserve-count></div><div data-production-countdown style="margin-top:5px"></div>';
        hud.addEventListener('click', e => {
            if(e.target.closest('[data-save-control-group]')){wodSaveTouchControlGroup();return;}
            let b = e.target.closest('[data-control-group]');
            if(b) wodSelectControlGroup(b.dataset.controlGroup);
        });
        UI.inGameUI.appendChild(hud);
        if(typeof ResizeObserver!=='undefined') {
            const observer=new ResizeObserver(wodPositionCommandHud);
            UI.inGameUI.querySelectorAll('#wodPcProdRoot,.wod-m-sheet--units,.wod-m-sheet--build,#wodDockPack,#infoCard').forEach(p=>observer.observe(p));
            hud._dockObserver=observer;
        }
        window.addEventListener('resize',wodPositionCommandHud);
        window.visualViewport?.addEventListener('resize',wodPositionCommandHud);
    }
    let lo = wodLocalPlayerOwner(), alive = new Set(gameData.entities.filter(u => u.hp > 0 && u.owner === lo).map(u => u.uid));
    let groups = gameData.controlGroups || (gameData.controlGroups = {});
    let controls = '';
    for(let n of [1,2,3,4,5,6,7,8,9,0]) {
        if(!groups[n]) continue;
        groups[n] = groups[n].filter(id => alive.has(id));
        if(!groups[n].length) { delete groups[n]; continue; }
        let active = gameData.selection.length === groups[n].length && gameData.selection.every(u => groups[n].includes(u.uid));
        controls += '<button type="button" data-control-group="' + n + '" style="margin:2px;padding:6px;border:1px solid ' + (active ? '#f1c40f' : '#607080') + ';border-radius:4px;background:#263c50;color:white" title="Select group ' + n + '; Ctrl+' + n + ' replaces it">' + '<strong style="display:block;font-size:16px">' + n + '</strong><span style="display:block;font-size:10px;color:#b4c5d6;margin-top:2px">' + groups[n].length + ' units</span></button>';
    }
    let jobs = (gameData.constructionJobs || []).filter(j => j.owner === lo);
    hud.toggleAttribute('data-has-groups',!!controls);
    hud.querySelector('[data-save-control-group]').hidden=!gameData.selection.some(u=>u.owner===lo&&u.hp>0&&u.type!=='convoy'&&gameData.entities.includes(u));
    hud.hidden = gameState !== 'PLAYING';
    let groupButtons = hud.querySelector('[data-group-buttons]');
    if(groupButtons._markup !== controls) { groupButtons.innerHTML = controls; groupButtons._markup = controls; }
    hud.querySelector('[data-reserve-count]').textContent = gameData._campaignRun ? 'Reserve reinforcements: ' + wodCampaignReserveUnits().length : '';
    hud.querySelector('[data-production-countdown]').textContent = jobs.slice(0,4).map(j => wodProductionLabel(j.mode) + (j.rosterId ? ' reinforcements ' : ' ') + Math.ceil(j.remaining) + 's').join(' · ') + (jobs.length > 4 ? ' · +' + (jobs.length - 4) : '');
    if(gameData._campaignRun) {
        UI.inGameUI.querySelectorAll('button[onclick^="buyUnit"]').forEach(btn => {
            let type = /buyUnit\('([^']+)'\)/.exec(btn.getAttribute('onclick'))?.[1];
            if(!type) return;
            btn.title = 'Recruit a new unit · ' + WOD_PRODUCTION_SECONDS[type] + 's · normal building requirements';
            btn.disabled = !gameData._campaignRun.battleLive;
        });
    }
    wodInitRecruitInfoButtons();
    for(const parent of new Set([...UI.inGameUI.querySelectorAll('button[onclick^="buyUnit"]')].map(b=>b.closest('.unit-recruit-tile')?.parentElement||b.parentElement))) {
        let reservePanel=parent.querySelector('.campaign-reserves');
        if(!reservePanel){reservePanel=document.createElement('details');reservePanel.className='campaign-reserves';parent.prepend(reservePanel);}
        const types=['light','motorized','mountaineer','marine','heavy','ship','transport','supply'];
        const markup=gameData._campaignRun?'<summary>Call reserves · '+wodCampaignReserveUnits().length+' ready · already paid</summary><div class="campaign-reserve-buttons">'+types.filter(type=>wodCampaignReserveUnits(type).length).map(type=>{
            const count=wodCampaignReserveUnits(type).length;
            return '<button type="button" onclick="enterBuildPlacementMode(\'reserve:'+type+'\')" '+(!count||!gameData._campaignRun.battleLive?'disabled':'')+' title="Existing troops · '+WOD_PRODUCTION_SECONDS[type]+'s arrival · no extra money or manpower">'+wodProductionLabel(type)+' · '+count+' available</button>';
        }).join('')+(wodCampaignReserveUnits().length?'':'No reserves remain. Recruit additional troops below.')+'</div>':'';
        if(reservePanel._markup!==markup){reservePanel.innerHTML=markup;reservePanel._markup=markup;}
    }
    wodPositionCommandHud();
}
let keys = {};
function updateCamera(dt) {
    if(gameData.menuAttractMode || gameState !== 'PLAYING') return;
    // Ignore typing focus / chord modifiers so WASD does not fight text fields.
    let camSpeed = 800 * Math.max(0, dt || 0);
    if(camSpeed <= 0) return;
    if(keys['w'] || keys['arrowup']) gameData.camera.y -= camSpeed;
    if(keys['s'] || keys['arrowdown']) gameData.camera.y += camSpeed;
    if(keys['a'] || keys['arrowleft']) gameData.camera.x -= camSpeed;
    if(keys['d'] || keys['arrowright']) gameData.camera.x += camSpeed;
}
function wodHideMissionPopup() {
    let ov = document.getElementById('wodMissionPopupOverlay');
    if(ov) ov.classList.add('hidden');
}
function wodShowMissionPopupDialog(popup, onDone) {
    let ov = document.getElementById('wodMissionPopupOverlay');
    let panel = document.getElementById('wodMissionPopupPanel');
    let kicker = document.getElementById('wodMissionPopupKicker');
    let title = document.getElementById('wodMissionPopupTitle');
    let body = document.getElementById('wodMissionPopupBody');
    let ok = document.getElementById('wodMissionPopupOk');
    if(!ov || !panel || !title || !body || !ok) {
        if(typeof onDone === 'function') onDone();
        return;
    }
    popup = popup || {};
    let style = ['briefing', 'alert', 'victory'].includes(popup.style) ? popup.style : 'briefing';
    panel.classList.remove('wod-mission-style-briefing', 'wod-mission-style-alert', 'wod-mission-style-victory');
    panel.classList.add('wod-mission-style-' + style);
    if(kicker) {
        kicker.textContent = popup.kicker || (style === 'alert' ? 'Urgent report' : style === 'victory' ? 'Objective complete' : 'Mission briefing');
        kicker.style.display = kicker.textContent ? '' : 'none';
    }
    title.textContent = popup.title || 'Mission update';
    body.textContent = popup.body || '';
    ov.classList.remove('hidden');
    let done = false;
    function finish() {
        if(done) return;
        done = true;
        wodHideMissionPopup();
        ok.removeEventListener('click', finish);
        if(typeof onDone === 'function') onDone();
    }
    ok.addEventListener('click', finish);
}
