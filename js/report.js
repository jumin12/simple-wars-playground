// End-of-match summary and faction comparisons.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function countEnemyCombatUnitsExcludingConvoys() {
    return countEnemyCombatExcludingConvoysFor(1);
}
function countPlayerCombatUnitsExcludingConvoys() {
    return countFriendlyCombatExcludingConvoys(1);
}
function formatGameDurationForSummary(seconds) {
    if(!isFinite(seconds) || seconds < 0) return '—';
    let m = Math.floor(seconds / 60);
    let s = Math.floor(seconds % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}
function wodSumNumericOwnedByAi(byOwnerObj) {
    let sum = 0;
    if(!byOwnerObj || typeof byOwnerObj !== 'object') return 0;
    for(let k of Object.keys(byOwnerObj)) {
        let o = parseInt(k, 10);
        if(o > 1) sum += byOwnerObj[k] || 0;
    }
    return sum;
}
function wodSumByOwnerMapExcluding(excludeOwner, byOwnerObj) {
    let sum = 0;
    if(!byOwnerObj || typeof byOwnerObj !== 'object') return 0;
    for(let k of Object.keys(byOwnerObj)) {
        let o = parseInt(k, 10);
        if(o > 0 && o !== excludeOwner) sum += byOwnerObj[k] || 0;
    }
    return sum;
}
/** Solo AI seats that were in the match (by setup count, plus any extras still on the map). */
function wodCollectSoloOpponentOwners() {
    let out = [];
    let seen = new Set();
    let n = Math.max(0, gameData.aiCount | 0);
    for(let o = 2; o <= n + 1; o++) {
        seen.add(o);
        out.push(o);
    }
    for(let c of gameData.cities || []) {
        let o = c && c.owner;
        if(o > 1 && !seen.has(o)) { seen.add(o); out.push(o); }
    }
    for(let u of gameData.entities || []) {
        let o = u && u.owner;
        if(o > 1 && !seen.has(o)) { seen.add(o); out.push(o); }
    }
    out.sort((a, b) => a - b);
    return out;
}
function wodParticipatingOwnersForSummary(isMp, soloOppOwners, lo) {
    let set = new Set();
    if(isMp && typeof wodMpAllFactionSlotsForScoreboard === 'function') {
        for(let o of wodMpAllFactionSlotsForScoreboard()) if(o > 0) set.add(o);
    } else {
        set.add((lo | 0) || 1);
        for(let o of soloOppOwners || []) if(o > 0) set.add(o);
    }
    return [...set].sort((a, b) => a - b);
}
/** Connected components of alliances. Isolated factions stay one-player teams. */
function wodBuildAllianceTeams(owners, lo) {
    let list = [];
    let seen = new Set();
    for(let i = 0; i < (owners || []).length; i++) {
        let o = owners[i] | 0;
        if(o < 1 || seen.has(o)) continue;
        seen.add(o);
        list.push(o);
    }
    let parent = {};
    for(let i = 0; i < list.length; i++) parent[list[i]] = list[i];
    function find(x) {
        while(parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    }
    function union(a, b) {
        a = find(a); b = find(b);
        if(a === b) return;
        if(a > b) { let t = a; a = b; b = t; }
        parent[b] = a;
    }
    let pairs = (typeof wodNormalizeAlliances === 'function')
        ? wodNormalizeAlliances(gameData.alliances)
        : (gameData.alliances || []);
    for(let i = 0; i < pairs.length; i++) {
        let p = pairs[i];
        if(!p) continue;
        let a = p[0] | 0, b = p[1] | 0;
        if(parent[a] != null && parent[b] != null) union(a, b);
    }
    let buckets = {};
    for(let i = 0; i < list.length; i++) {
        let o = list[i];
        let r = find(o);
        if(!buckets[r]) buckets[r] = [];
        buckets[r].push(o);
    }
    let teams = Object.keys(buckets).map(function(k) {
        let mem = buckets[k].sort((a, b) => a - b);
        return { owners: mem, allied: mem.length > 1 };
    });
    let local = lo | 0;
    teams.sort(function(a, b) {
        let ah = a.owners.indexOf(local) >= 0 ? 0 : 1;
        let bh = b.owners.indexOf(local) >= 0 ? 0 : 1;
        if(ah !== bh) return ah - bh;
        return a.owners[0] - b.owners[0];
    });
    return teams;
}
function wodSumByOwnerMapForOwners(owners, byOwnerObj) {
    let sum = 0;
    if(!byOwnerObj || typeof byOwnerObj !== 'object') return 0;
    for(let i = 0; i < (owners || []).length; i++) sum += byOwnerObj[owners[i]] || 0;
    return sum;
}
function wodCountCitiesForOwners(owners) {
    let n = 0;
    for(let i = 0; i < (owners || []).length; i++) n += countCitiesForOwner(owners[i]);
    return n;
}
function wodCountArmiesForOwners(owners) {
    let n = 0;
    for(let i = 0; i < (owners || []).length; i++) n += countFriendlyCombatExcludingConvoys(owners[i]);
    return n;
}
function wodCountHostileCitiesFor(owner) {
    let n = 0;
    for(let c of gameData.cities || []) {
        if(wodIsHostileOwner(c.owner, owner)) n++;
    }
    return n;
}
function wodSummaryOwnerLabel(o, lo, isMp) {
    if(isMp) {
        if(typeof wodMpIsHumanOwner === 'function' && wodMpIsHumanOwner(o))
            return wodMpEscapeHtml(wodMpDisplayNameForSlot(o, { gameDataMp: gameData.mp }));
        return 'AI seat ' + o;
    }
    if(o === lo) return 'You';
    let nm = (typeof wodSideLabel === 'function') ? wodSideLabel(o, { short: true }) : ('AI ' + (o - 1));
    return (typeof wodMpEscapeHtml === 'function') ? wodMpEscapeHtml(nm) : nm;
}
function wodSummaryOwnerResultHtml(o, lo, isMp, outcomeKind, ocEnd) {
    if(isMp) {
        let resRaw = ocEnd[String(o)];
        if(resRaw == null && ocEnd[o] != null) resRaw = ocEnd[o];
        return resRaw === 'won' ? '<span class="cs-mp-res-won">Victory</span>'
            : (resRaw === 'lost' ? '<span class="cs-mp-res-lost">Defeat</span>'
            : (resRaw === 'ongoing' ? '—' : (resRaw ? String(resRaw) : '—')));
    }
    if(o === lo) {
        return outcomeKind === 'victory'
            ? '<span class="cs-mp-res-won">Victory</span>'
            : '<span class="cs-mp-res-lost">Defeat</span>';
    }
    let citiesN = countCitiesForOwner(o);
    let armiesN = countFriendlyCombatExcludingConvoys(o);
    return (citiesN <= 0 && armiesN <= 0)
        ? '<span class="cs-mp-res-lost">Eliminated</span>'
        : '<span class="cs-mp-res-won">Active</span>';
}
function wodSummaryTeamResultHtml(team, lo, isMp, outcomeKind, ocEnd) {
    if(team.owners.indexOf(lo) >= 0) {
        return outcomeKind === 'victory'
            ? '<span class="cs-mp-res-won">Victory</span>'
            : '<span class="cs-mp-res-lost">Defeat</span>';
    }
    if(isMp) {
        let wins = 0, losses = 0;
        for(let i = 0; i < team.owners.length; i++) {
            let r = ocEnd[String(team.owners[i])];
            if(r == null && ocEnd[team.owners[i]] != null) r = ocEnd[team.owners[i]];
            if(r === 'won') wins++;
            else if(r === 'lost') losses++;
        }
        if(wins && !losses) return '<span class="cs-mp-res-won">Victory</span>';
        if(losses && !wins) return '<span class="cs-mp-res-lost">Defeat</span>';
        if(wins && losses) return 'Split';
        return '—';
    }
    let cities = wodCountCitiesForOwners(team.owners);
    let armies = wodCountArmiesForOwners(team.owners);
    return (cities <= 0 && armies <= 0)
        ? '<span class="cs-mp-res-lost">Eliminated</span>'
        : '<span class="cs-mp-res-won">Active</span>';
}
function wodSummaryFactionRow(o, lo, isMp, outcomeKind, ocEnd, byO, extraClass) {
    let label = wodSummaryOwnerLabel(o, lo, isMp);
    let col = factionColors[o] || '#999999';
    let inc = Math.max(0, Math.floor(byO[o] || 0));
    let cash = Math.floor(wodPlayerTreasury(o));
    let cls = extraClass ? (' class="' + extraClass + '"') : '';
    return '<tr' + cls + '>' +
        '<td><div class="cs-mp-fname"><span class="cs-mp-swatch" style="background:' + col + '"></span>' + label + '</div></td>' +
        '<td>' + wodSummaryOwnerResultHtml(o, lo, isMp, outcomeKind, ocEnd) + '</td>' +
        '<td>' + countCitiesForOwner(o) + '</td>' +
        '<td>' + countFriendlyCombatExcludingConvoys(o) + '</td>' +
        '<td>$' + inc.toLocaleString('en-US') + '</td>' +
        '<td>' + formatFullCount(getOwnerCasualties(o)) + '</td>' +
        '<td>' + formatTanks(getOwnerTankCasualties(o)) + '</td>' +
        '<td>' + formatTanks(getOwnerShipCasualties(o)) + '</td>' +
        '<td>$' + cash.toLocaleString('en-US') + '</td>' +
        '</tr>';
}
function wodRenderEndScreenTeamTable(isMp, teams, hasAlliedTeam, lo, outcomeKind, ocEnd, byO) {
    let pf = wodActivePeriodFlavor();
    let statusHead = isMp ? 'Result' : 'Status';
    let title, blurb;
    if(hasAlliedTeam) {
        title = 'Team results';
        blurb = 'Allied factions share a team. Each member still has their own cities, armies, income, and losses.';
    } else if(isMp) {
        title = 'Faction results (multiplayer)';
        blurb = 'Per-faction snapshot at match end: cities, armies on the field, gross city revenue this session, casualties, and treasuries.';
    } else {
        title = 'Faction breakdown';
        blurb = 'You first, then each opponent at match end (combined enemy totals above stay the same).';
    }
    let bodies = '';
    for(let ti = 0; ti < teams.length; ti++) {
        let team = teams[ti];
        let rows = '';
        if(hasAlliedTeam) {
            let swatches = '';
            for(let i = 0; i < team.owners.length; i++) {
                swatches += '<span class="cs-mp-swatch" style="background:' + (factionColors[team.owners[i]] || '#999999') + '"></span>';
            }
            rows += '<tr class="cs-team-banner"><td colspan="9"><div class="cs-team-banner-inner">' +
                '<span class="cs-team-banner-name">Team ' + (ti + 1) + '</span>' +
                (team.allied ? '<span class="cs-team-banner-tag">Allied</span>' : '') +
                '<span class="cs-team-swatches">' + swatches + '</span>' +
                '<span class="cs-team-banner-res">' + wodSummaryTeamResultHtml(team, lo, isMp, outcomeKind, ocEnd) + '</span>' +
                '</div></td></tr>';
        }
        for(let i = 0; i < team.owners.length; i++) {
            rows += wodSummaryFactionRow(team.owners[i], lo, isMp, outcomeKind, ocEnd, byO, team.allied ? 'cs-team-member' : '');
        }
        if(hasAlliedTeam && team.allied) {
            let cities = wodCountCitiesForOwners(team.owners);
            let armies = wodCountArmiesForOwners(team.owners);
            let inc = 0, mpL = 0, tk = 0, sh = 0, cash = 0;
            for(let i = 0; i < team.owners.length; i++) {
                let o = team.owners[i];
                inc += Math.max(0, Math.floor(byO[o] || 0));
                mpL += getOwnerCasualties(o);
                tk += getOwnerTankCasualties(o);
                sh += getOwnerShipCasualties(o);
                cash += Math.floor(wodPlayerTreasury(o));
            }
            rows += '<tr class="cs-team-sum">' +
                '<td>Team total</td><td></td>' +
                '<td>' + cities + '</td>' +
                '<td>' + armies + '</td>' +
                '<td>$' + inc.toLocaleString('en-US') + '</td>' +
                '<td>' + formatFullCount(mpL) + '</td>' +
                '<td>' + formatTanks(tk) + '</td>' +
                '<td>' + formatTanks(sh) + '</td>' +
                '<td>$' + cash.toLocaleString('en-US') + '</td>' +
                '</tr>';
        }
        bodies += '<tbody class="cs-team-block">' + rows + '</tbody>';
    }
    return '<section class="cs-card">' +
        '<p class="cs-card-title">' + title + '</p>' +
        '<p style="margin:0 0 10px;color:#95a5a6;font-size:0.88rem;line-height:1.45;">' + blurb + '</p>' +
        '<div class="cs-mp-table-wrap"><table class="cs-mp-table">' +
        '<thead><tr><th>Faction</th><th>' + statusHead + '</th><th>Cities</th><th>Armies</th><th>Income</th><th>MP losses</th><th>' + pf.statOwnHeavy + '</th><th>' + pf.statOwnShips + '</th><th>Cash</th></tr></thead>' +
        bodies +
        '</table></div></section>';
}
/** CSS widths for two-segment stacked bar (you vs combined AI). */
function wodDualLossBarWidths(youVal, aiVal) {
    let y = Math.max(0, youVal || 0);
    let a = Math.max(0, aiVal || 0);
    let t = y + a;
    if(t <= 0) return { wYou: '50%', wAi: '50%' };
    return { wYou: (100 * y / t).toFixed(2) + '%', wAi: (100 * a / t).toFixed(2) + '%' };
}
