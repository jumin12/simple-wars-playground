// Order arrows and frontline styles.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodFrontlineColorRgba(alpha) {
    return wodShopColorRgba('frontlineColor', alpha);
}
function wodCommandArrowStrokeRgba(unit, alpha) {
    if(wodBoardMapActive())return wodBoardMapActive()==='chalkboard'?'rgba(245,216,136,'+alpha+')':'rgba(201,83,76,'+alpha+')';
    return wodShopColorRgba('commandArrowColor', alpha);
}
function wodCommandArrowDashPattern(unit) {
    let def = wodCommandArrowStyleDef();
    if(def.dash) return def.dash.slice();
    if(unit && unit.type === 'convoy' && !def.rail) return [7, 6];
    return [];
}
function wodCommandArrowShowsHead() {
    let def = wodCommandArrowStyleDef();
    return !!(def.head && def.head !== 'none');
}
function wodRgbToHex(rgb) {
    return '#' + rgb.map(v => Math.min(255, Math.max(0, v | 0)).toString(16).padStart(2, '0')).join('');
}
/** Direction anchor for the arrowhead: walk back along the polyline until we are far
 * enough from the tip that the angle is stable. Using just points[len-2] let 1-3px
 * degenerate final segments (exact-click substitution, dedupe leftovers) spin the
 * head sideways. */
function wodCommandArrowHeadAnchor(pts) {
    if(!pts || pts.length < 2) return null;
    let end = pts[pts.length - 1];
    let minD2 = 100; // 10px lookback
    for(let i = pts.length - 2; i >= 0; i--) {
        let dx = end.x - pts[i].x;
        let dy = end.y - pts[i].y;
        if(dx * dx + dy * dy >= minD2) return pts[i];
    }
    return pts[0];
}
function wodStrokeCommandArrowHead(ctx, end, prev, size, kind) {
    kind = kind || (wodCommandArrowStyleDef().head || 'open');
    let angle = Math.atan2(end.y - prev.y, end.x - prev.x);
    function openV(ox, oy, s) {
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox - s * Math.cos(angle - Math.PI / 6), oy - s * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox - s * Math.cos(angle + Math.PI / 6), oy - s * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }
    if(kind === 'filled') {
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - size * 1.15 * Math.cos(angle - Math.PI / 6), end.y - size * 1.15 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(end.x - size * 1.15 * Math.cos(angle + Math.PI / 6), end.y - size * 1.15 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();
        return;
    }
    openV(end.x, end.y, size);
    if(kind === 'chevron') {
        let bx = end.x - size * 0.72 * Math.cos(angle);
        let by = end.y - size * 0.72 * Math.sin(angle);
        openV(bx, by, size * 0.92);
    }
}
function wodStrokeOpenPolyline(ctx, pts) {
    if(!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for(let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
}
function wodStrokeCommandOrderPath(ctx, points, unit, lineWidth, headSize) {
    if(wodBoardMapActive()){WodBoardArt.arrow(ctx,wodBoardMapActive(),points,lineWidth,headSize);return;}
    let def = wodCommandArrowStyleDef();
    ctx.lineWidth = lineWidth * (def.widthMul || 1);
    ctx.setLineDash(wodCommandArrowDashPattern(unit));
    if(def.rail) {
        let off = Math.max(2.2, lineWidth * 0.85);
        wodStrokeOpenPolyline(ctx, wodOffsetBorderPoints(points, false, off));
        wodStrokeOpenPolyline(ctx, wodOffsetBorderPoints(points, false, -off));
    } else {
        wodStrokeOpenPolyline(ctx, points);
    }
    ctx.setLineDash([]);
    if(wodCommandArrowShowsHead()) {
        let end = points[points.length - 1];
        let prev = wodCommandArrowHeadAnchor(points) || points[points.length - 2];
        wodStrokeCommandArrowHead(ctx, end, prev, headSize, def.head);
    }
}
function getUnitPathPoints(unit) {
    let corridor = wodPlayerMarchArrowPoints(unit);
    if(corridor) return corridor;
    if(unit.fullMarchWaypoints && unit.fullMarchWaypoints.length > 0) {
        let pts = [{x: unit.x, y: unit.y}];
        let c = unit.marchWpCursor || 0;
        for(let i = c; i < unit.fullMarchWaypoints.length; i++) {
            let w = unit.fullMarchWaypoints[i];
            pts.push({x: w.x, y: w.y});
        }
        let deduped = [];
        for(let i = 0; i < pts.length; i++) {
            let p = pts[i];
            if(deduped.length === 0) {
                deduped.push(p);
                continue;
            }
            let q = deduped[deduped.length - 1];
            let dx = p.x - q.x;
            let dy = p.y - q.y;
            if(dx * dx + dy * dy > 2) deduped.push(p);
        }
        return deduped;
    }
    let pts = [{x: unit.x, y: unit.y}];
    let tgt = unit.target;
    if(tgt && tgt.x !== undefined && tgt.y !== undefined && (!tgt.isCity || unit.type === 'convoy'))
        pts.push({x: tgt.x, y: tgt.y});
    if(unit.path && unit.path.length > 0) {
        for(let p of unit.path)
            pts.push({x: p.x, y: p.y});
    }
    let deduped = [];
    for(let i = 0; i < pts.length; i++) {
        let p = pts[i];
        if(deduped.length === 0) {
            deduped.push(p);
            continue;
        }
        let q = deduped[deduped.length - 1];
        let dx = p.x - q.x;
        let dy = p.y - q.y;
        if(dx * dx + dy * dy > 2) deduped.push(p);
    }
    return deduped;
}
function invalidateUnitOrderArrowCache(unit) {
    if(unit) {
        unit._routeArrowBuildGen = (unit._routeArrowBuildGen || 0) + 1;
        unit._routeArrowSig = null;
        unit._routeArrowThrottleUntil = 0;
        unit._routeArrowFrozenPts = null;
        unit._routeArrowMarchSig = null;
        unit._routeArrowProgressIdx = 0;
        unit._routeArrowFrozenReady = false;
    }
}
function wodEnsureOrderArrowFrozen(unit) {
    if(!unit || !unit.fullMarchWaypoints || unit.fullMarchWaypoints.length === 0) return;
    let sig = wodMarchArrowSignature(unit);
    if(unit._routeArrowFrozenPts && unit._routeArrowMarchSig === sig) return;
    for(let qi = 0; qi < wodOrderArrowBuildQueue.length; qi++) {
        if(wodOrderArrowBuildQueue[qi].uid === unit.uid && wodOrderArrowBuildQueue[qi].sig === sig) return;
    }
    let c = unit.marchWpCursor || 0;
    let remaining = unit.fullMarchWaypoints.slice(c);
    if(remaining.length === 0) return;
    wodEnqueueOrderArrowPathBuild(unit, remaining);
}
function wodMarchArrowSignature(unit) {
    if(!unit || !unit.fullMarchWaypoints || !unit.fullMarchWaypoints.length) return '';
    return unit.fullMarchWaypoints.map(w => Math.round(w.x / 8) + ',' + Math.round(w.y / 8)).join(';');
}
