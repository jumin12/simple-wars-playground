// Player profile, lifetime stats, achievements and rewards.
// Part of the game script; loaded by index.html in a fixed order (see the list there).

function wodSampleMapGenProfile(mapShape, factionCount, symSpec, randomStarts) {
    const gp = wodSampleFreeMapGenProfile(mapShape, factionCount);
    if(symSpec) return wodBalancedMapGenProfile(gp, mapShape, symSpec);
    if(randomStarts && mapShape === 'archipelago') {
        // Balance off: the same kind of island group, laid out freely (map-gen-worker.js archipelagoLayoutFree)
        gp.archSeed = (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
        gp.archTowns = wodCitiesPerPlayerSetting();
        gp.archPlayers = Math.max(1, randomStarts.players | 0);
        gp.mountElevThresh = 0.9;
    }
    return gp;
}
/** Shape settings for a balanced map (js/mapgen-sym.js): round outlines when three or four players
 *  need the same reach in every direction, continents that are copies of each other, and the seed of
 *  the island group on archipelago maps. */
function wodBalancedMapGenProfile(gp, mapShape, symSpec) {
    const n = symSpec.type === 'cont4' ? 4 : symSpec.n | 0;
    if(n >= 3 && symSpec.type === 'rot') { gp.stretchX = 1; gp.stretchY = 1; }
    if(mapShape === 'ring' && n >= 3) {
        // a round ring fits the grid's height only: it has to be broader to hold the same land
        gp.ringOuterFrac = 0.9 + Math.random() * 0.06;
        gp.ringInnerFrac = 0.16 + Math.random() * 0.2;
    }
    if(mapShape === 'island' && n >= 3) {
        // a long or wide outline cannot be the same for three or four players
        if(gp.islandMode === 'elongated' || gp.islandMode === 'wide') gp.islandMode = Math.random() < 0.5 ? 'blob' : 'crescent';
    }
    if(mapShape === 'archipelago') {
        gp.archSeed = (Math.floor(Math.random() * 4294967296) >>> 0) || 1;
        gp.archTowns = wodCitiesPerPlayerSetting();
        gp.mountElevThresh = 0.9;
    }
    if(mapShape === 'continents') {
        if(symSpec.type === 'rot' && symSpec.n === 3) {
            // three continents, one per player (the free profile's two lobes are not used)
            gp.contThree = true; gp.contShear = 0; gp.contChanX = 0; gp.contChanWave = 0;
            gp.contLobeR = 0.5 + Math.random() * 0.04;
            gp.contLobeRx = 0.44 + Math.random() * 0.05;
            gp.contLobeRy = 0.4 + Math.random() * 0.05;
            gp.contChanHalf = Math.max(0.13, 6 / ((Math.floor((gameData.mapRadius || 60) * 0.8) - 6) * 0.95));
        } else if(symSpec.type === 'cont4') {
            // one continent per half of the map, both the same, each turned about its own centre
            gp.contShear = 0; gp.contChanX = 0; gp.contChanWave = 0;
            gp.contLobeRx = 0.4 + Math.random() * 0.05;
            gp.contLobeRy = 0.8 + Math.random() * 0.08;
            gp.contChanHalf = Math.max(0.085, 4.6 / ((gameData.mapRadius || 60) * 0.95));
        } else {
            // two continents of one player each: the free profile already makes them equal and
            // half a turn apart; only the channel must run through the centre
            gp.contChanX = 0;
        }
    }
    return gp;
}
function wodSampleFreeMapGenProfile(mapShape, factionCount) {
    if(mapShape === 'ring') {
        let bio = wodRollIslandStyleBiomeFields('ring');
        let inner = 0.12 + Math.random() * 0.16;
        let span = 0.11 + Math.random() * 0.17;
        let outer = Math.min(0.97, inner + span + 0.07 + Math.random() * 0.22);
        if(outer - inner < 0.12) outer = inner + 0.12 + Math.random() * 0.1;
        let sx = Math.random() < 0.42 ? 0.84 + Math.random() * 0.28 : 0.98 + Math.random() * 0.22;
        let sy = Math.random() < 0.42 ? 0.84 + Math.random() * 0.28 : 0.98 + Math.random() * 0.22;
        if(Math.random() < 0.38) {
            let t = sx;
            sx = sy;
            sy = t;
        }
        return {
            islandMode: 'ring',
            stretchX: sx,
            stretchY: sy,
            coastNoiseAmp: 0.3 + Math.random() * 0.26,
            chainAX: 0,
            chainAY: 0,
            chainBX: 0,
            chainBY: 0,
            atollRing: 0.41 + Math.random() * 0.14,
            ringInnerFrac: inner,
            ringOuterFrac: outer,
            ...bio
        };
    }
    if(mapShape === 'continents') {
        // Two lobes side by side with a sea channel between them. Their sizes follow how
        // the players are split (1+1, 2+1, 2+2), so every player gets the same amount of
        // land. All numbers are in the island mask's units: the grid spans about -1.05..1.05.
        let bio = wodRollIslandStyleBiomeFields('blob');
        let f = Math.max(2, factionCount | 0);
        let nBig = Math.ceil(f / 2), nSmall = f - nBig;
        let mapR = gameData.mapRadius || 60;
        // Cells per mask unit. The edge-of-map water buffer is a fixed number of cells, so
        // small maps must keep the lobes further (in mask units) from the edge, or the
        // buffer shaves them into straight coasts.
        let unitX = mapR * 0.95, unitY = Math.floor(mapR * 0.8) * 0.95;
        let chanHalf = Math.max(0.085, 4.6 / unitX);
        let reach = 0.97 - 5.5 / unitX;
        let ryBig = 0.93 - 5.5 / unitY - Math.random() * 0.05;
        let rySmall = nBig === nSmall ? ryBig : ryBig * (0.8 + Math.random() * 0.06);
        // rxBig = k * rxSmall keeps (ellipse area / players) equal on both sides.
        let k = (nBig * rySmall) / (nSmall * ryBig);
        let rxSmall = (reach - chanHalf) / (1 + k), rxBig = reach - chanHalf - rxSmall;
        let flip = Math.random() < 0.5 ? -1 : 1;
        let bigX = -reach + rxBig, chanX = bigX + rxBig + chanHalf, smallX = chanX + chanHalf + rxSmall;
        let dy = (Math.random() - 0.5) * 0.14;
        return {
            islandMode: 'continents',
            stretchX: 1,
            stretchY: 1,
            coastNoiseAmp: 0.34 + Math.random() * 0.2,
            contShear: (Math.random() - 0.5) * 0.2,
            contChanX: chanX * flip,
            contChanHalf: chanHalf,
            contChanWave: 0.04 + Math.random() * 0.05,
            contLobes: [
                { x: bigX * flip, y: dy, rx: rxBig, ry: ryBig, players: nBig },
                { x: smallX * flip, y: nBig === nSmall ? -dy : -dy * 0.5, rx: rxSmall, ry: rySmall, players: nSmall }
            ],
            ...bio
        };
    }
    if(mapShape === 'archipelago') {
        let bio = wodRollIslandStyleBiomeFields('archipelago');
        return {
            islandMode: 'blob',
            archipelagoCenterClearFrac: 0.4 + Math.random() * 0.12,
            stretchX: 0.94 + Math.random() * 0.2,
            stretchY: 0.94 + Math.random() * 0.2,
            coastNoiseAmp: 0.4 + Math.random() * 0.18,
            chainAX: (Math.random() - 0.5) * 0.95,
            chainAY: (Math.random() - 0.5) * 0.9,
            chainBX: (Math.random() - 0.5) * 0.95 + 0.06,
            chainBY: (Math.random() - 0.5) * 0.85,
            atollRing: 0.4 + Math.random() * 0.16,
            ...bio
        };
    }
    if(wodMapShapeUsesRectanglePipeline(mapShape)) {
        let rectBiomePreset = mapShape === 'forest' ? 'forest' : mapShape === 'mountain' ? 'mountain' : mapShape === 'desert' ? 'desert' : null;
        let mz = (Math.random() - 0.5) * 0.14;
        let base = {
            islandMode: 'none',
            rectBiomePreset,
            waterElevThresh: 0.42 + Math.random() * 0.04,
            sandThresh: 0.32 + Math.random() * 0.06,
            grassThresh: 0.54 + Math.random() * 0.1,
            forestThresh: 0.76 + Math.random() * 0.1,
            mountElevThresh: 0.84 + Math.random() * 0.06,
            moistShift: (Math.random() - 0.5) * 0.14 + mz,
            forestMoistBoost: (Math.random() - 0.5) * 0.09,
            mountainThin: Math.random() < 0.7 ? (0.12 + Math.random() * 0.22) : 0,
            maxMountainLandFrac: 0.1 + Math.random() * 0.1,
            biomeAccent: Math.random() < 0.32 ? 'marsh' : 'balanced',
            minMountainHexReserve: 2
        };
        if(rectBiomePreset === 'forest') {
            base.moistShift += 0.034 + Math.random() * 0.028;
            base.waterElevThresh -= 0.005 + Math.random() * 0.006;
        } else if(rectBiomePreset === 'desert') {
            base.moistShift -= 0.042 + Math.random() * 0.034;
            base.waterElevThresh += 0.006 + Math.random() * 0.007;
        } else if(rectBiomePreset === 'mountain') {
            base.mountElevThresh -= 0.018 + Math.random() * 0.018;
            base.maxMountainLandFrac = Math.min(0.2, base.maxMountainLandFrac + 0.028 + Math.random() * 0.03);
        }
        return base;
    }
    if(mapShape !== 'island') {
        let mz = (Math.random() - 0.5) * 0.14;
        return {
            islandMode: 'none',
            waterElevThresh: 0.42 + Math.random() * 0.04,
            sandThresh: 0.32 + Math.random() * 0.06,
            grassThresh: 0.54 + Math.random() * 0.1,
            forestThresh: 0.76 + Math.random() * 0.1,
            mountElevThresh: 0.84 + Math.random() * 0.06,
            moistShift: (Math.random() - 0.5) * 0.14 + mz,
            forestMoistBoost: (Math.random() - 0.5) * 0.09,
            mountainThin: Math.random() < 0.7 ? (0.12 + Math.random() * 0.22) : 0,
            maxMountainLandFrac: 0.1 + Math.random() * 0.1,
            biomeAccent: Math.random() < 0.32 ? 'marsh' : 'balanced'
        };
    }
    /** Equal-ish pick — include split/broken silhouettes so islands do not all read as the same blob. */
    let modePool = ['blob', 'elongated', 'wide', 'archipelago', 'crescent', 'chain', 'atoll', 'double', 'hook', 'broken'];
    let islandMode = modePool[(Math.floor(Math.random() * modePool.length)) | 0];
    let stretchX = 1,
        stretchY = 1;
    let coastNoiseAmp = 0.38 + Math.random() * 0.22;
    let chainAX = (Math.random() - 0.5) * 1.05;
    let chainAY = (Math.random() - 0.5) * 0.95;
    let chainBX = (Math.random() - 0.5) * 1.05 + 0.08;
    let chainBY = (Math.random() - 0.5) * 0.85;
    let atollRing = 0.41 + Math.random() * 0.15;

    let crescentSweep = islandMode === 'crescent';
    let archipelagoExtra = islandMode === 'archipelago';
    let atollExtra = islandMode === 'atoll';

    if(islandMode === 'elongated') {
        if(Math.random() < 0.5) {
            stretchX = 0.62 + Math.random() * 0.12;
            stretchY = 1.05 + Math.random() * 0.35;
        } else {
            stretchX = 1.05 + Math.random() * 0.35;
            stretchY = 0.62 + Math.random() * 0.12;
        }
        coastNoiseAmp = 0.42 + Math.random() * 0.18;
    } else if(islandMode === 'wide') {
        stretchX = 1.12 + Math.random() * 0.22;
        stretchY = 0.78 + Math.random() * 0.18;
    } else if(archipelagoExtra) {
        stretchX = 1;
        stretchY = 1;
        coastNoiseAmp = 0.48 + Math.random() * 0.26;
    } else if(atollExtra) {
        stretchX = 1.02 + Math.random() * 0.16;
        stretchY = 1.02 + Math.random() * 0.16;
        coastNoiseAmp = 0.44 + Math.random() * 0.22;
        atollRing = 0.4 + Math.random() * 0.16;
    } else if(islandMode === 'double') {
        stretchX = 0.94 + Math.random() * 0.18;
        stretchY = 0.94 + Math.random() * 0.18;
        coastNoiseAmp = 0.42 + Math.random() * 0.22;
    } else if(islandMode === 'hook') {
        stretchX = 0.88 + Math.random() * 0.24;
        stretchY = 1.04 + Math.random() * 0.28;
        coastNoiseAmp = 0.46 + Math.random() * 0.2;
    } else if(islandMode === 'broken') {
        coastNoiseAmp = 0.55 + Math.random() * 0.24;
    } else if(crescentSweep) {
        coastNoiseAmp = 0.4 + Math.random() * 0.2;
    } else if(islandMode === 'chain') {
        coastNoiseAmp = 0.45 + Math.random() * 0.18;
    }

    return {
        islandMode,
        stretchX,
        stretchY,
        coastNoiseAmp,
        chainAX,
        chainAY,
        chainBX,
        chainBY,
        atollRing,
        ...wodRollIslandStyleBiomeFields(islandMode)
    };
}
function wodThinMountainsForProfile(gp, seedOffset) {
    if(!gp || !gp.mountainThin || !wodMapShapeUsesRadialIslandMask(gameData.mapShape)) return;
    let landM = gameData.hexList.filter(h => !isWaterHex(h) && h.type === 'mountain');
    if(!landM.length) return;
    let take = Math.floor(landM.length * gp.mountainThin);
    let reserve =
        gp.minMountainHexReserve != null
            ? Math.max(0, gp.minMountainHexReserve | 0)
            : Math.max(2, Math.min(12, Math.floor(landM.length * 0.04)));
    take = Math.min(take, Math.max(0, landM.length - reserve));
    if(take <= 0) return;
    const order = new Map(landM.map(h => [h, wodGenFbm(h.x, h.y, 0.017, seedOffset + 8800, 3)]));
    landM.sort((a, b) => order.get(a) - order.get(b));
    for(let i = 0; i < take; i++) {
        let h = landM[i];
        let wet = wodGenFbm(h.x, h.y, 0.009, seedOffset + 9200, 3);
        if((gp.biomeAccent === 'marsh' || gp.biomeAccent === 'forest') && wet > 0.48 && wet < 0.78 && Math.random() < 0.35) {
            h.type = wet > 0.62 ? 'swamp' : 'grass';
        } else if(gp.biomeAccent === 'marsh' && wet > 0.55 && Math.random() < 0.25) {
            h.type = 'swamp';
        } else h.type = wet > 0.55 ? 'forest' : 'hill';
        h.baseColor = getTerrainColor(h.type);
        h.renderColor = h.baseColor;
    }
}
let _wodProfileIdentity=null,_wodSteamProfileProof=null,_wodSteamProfileProofWork=null;
function wodSaveProfileIdentity(){try{localStorage.setItem('simplewars-player-identity-v1',JSON.stringify(_wodProfileIdentity));}catch(_){}}
function wodProfileIdentity() {
    if(_wodProfileIdentity)return _wodProfileIdentity;
    let saved=null;try{saved=JSON.parse(localStorage.getItem('simplewars-player-identity-v1')||'null');}catch(_){}
    if(!saved||!wodMpNormalizePlayerId(saved.playerId)||!(/^[a-f0-9]{64}$/).test(saved.secret||'')) {
        const bytes=crypto.getRandomValues(new Uint8Array(32));
        saved={playerId:wodMpNormalizePlayerId(wodProgress?.profile?.playerId)||wodMpGeneratePlayerId(),secret:[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('')};
        try{localStorage.setItem('simplewars-player-identity-v1',JSON.stringify(saved));}catch(_){}
    }
    saved.devicePlayerId=wodMpNormalizePlayerId(saved.devicePlayerId)||saved.playerId;
    return _wodProfileIdentity=saved;
}
function wodSelectSavedProfile(id,profile){
    const previous=wodProgress?.profile?.playerId;
    if(previous&&previous!==id){
        flushGameProfileToWod();
        try{localStorage.setItem('simplewars-profile-cache:'+previous,JSON.stringify(wodProgress));}catch(_){}
        let cached=null;try{cached=JSON.parse(localStorage.getItem('simplewars-profile-cache:'+id)||'null');}catch(_){}
        wodProgress=cached?.profile?.playerId===id?wodMergeProgressObject(cached):defaultWodProgress();
        wodProgress.profile.playerId=id;applyWodProfileToGame();
        const name=document.getElementById('mpDisplayName');if(name){name.value=wodProgress.profile.mpDisplayName||'';name._wodMpEditing=false;name.blur();}
    }
    wodMpAdoptIdentity(id);if(profile)wodApplyServerProfile(profile);persistWodProgressNow();
}
function wodRefreshAccountOptions(){
    const status=document.getElementById('mpAccountStatus'),hint=document.getElementById('mpAccountHint'),sign=document.getElementById('mpSteamSignIn'),device=document.getElementById('mpUseDeviceProfile');if(!status)return;
    const native=window.WodSteamStore?.native(),session=wodProfileIdentity().webSession;
    status.textContent=native?'Steam account':session?'Steam-linked profile':'Saved device profile';
    hint.textContent=native?'Your profile follows your Steam account.':session?'Signed in through Steam. Progress is saved to this account.':'Progress stays in this browser. Link Steam to restore it on other devices.';
    sign.hidden=!!native||!!session;device.hidden=!!native||!session;
}
function wodProfileApiBase(){
    if(window.WOD_PROFILE_API_URL)return window.WOD_PROFILE_API_URL;
    return 'https://simple-wars.onrender.com/api/profile/';
}
async function wodProfilePost(action,data){
    const response=await fetch(wodProfileApiBase()+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(20000)}),result=await response.json();
    if(!response.ok||!result.ok)throw new Error(result.error||'Your profile could not be restored.');return result;
}
async function wodWebSteamSignIn(){
    if(window.WodSteamStore?.native())return;
    if(window._wodWebSignInBusy){window._wodWebSignInCancel=true;return;}
    if(gameState==='PLAYING'||WodMultiplayer.api?.code){showNotification('Leave your match or lobby before switching profiles.');return;}
    const popup=window.open('about:blank','simplewars-steam-signin','width=720,height=760');
    if(!popup){showNotification('Allow the Steam sign-in window in your browser and try again.');return;}
    window._wodWebSignInBusy=true;window._wodWebSignInCancel=false;const button=document.getElementById('mpSteamSignIn');button.textContent='Cancel Steam sign-in';
    try{
        const anchor=wodProfileIdentity(),started=await wodProfilePost('start',{deviceSecret:anchor.secret,playerId:anchor.devicePlayerId,progress:wodBuildCloudSyncPayload()});
        if(window._wodWebSignInCancel)throw new Error('Steam sign-in cancelled.');popup.location=started.url;
        const deadline=Date.now()+10*60000;let restored=false;
        while(Date.now()<deadline){
            await new Promise(resolve=>setTimeout(resolve,1200));
            if(window._wodWebSignInCancel)throw new Error('Steam sign-in cancelled.');
            const result=await wodProfilePost('complete',{state:started.state,deviceSecret:anchor.secret});
            if(!result.pending){
                WodMultiplayer.disconnect();anchor.webSession={token:result.profileToken,expires:result.expires,playerId:result.playerId};wodSaveProfileIdentity();
                wodSelectSavedProfile(result.playerId,result.profile);await wodMpEnsureConnected();showNotification('Steam profile restored.');restored=true;break;
            }
        }
        if(!restored)throw new Error('Steam sign-in expired. Please try again.');
    }catch(error){showNotification(error.message||'Steam sign-in could not be completed.');}
    finally{try{popup.close();}catch(_){}window._wodWebSignInBusy=false;button.disabled=false;button.textContent='Sign in with Steam';wodRefreshAccountOptions();}
}
async function wodUseDeviceProfile(){
    if(gameState==='PLAYING'||WodMultiplayer.api?.code){showNotification('Leave your match or lobby before switching profiles.');return;}
    const anchor=wodProfileIdentity();WodMultiplayer.disconnect();delete anchor.webSession;wodSaveProfileIdentity();
    wodSelectSavedProfile(anchor.devicePlayerId);await wodMpEnsureConnected();showNotification('Device profile restored.');
}
function wodEnsurePlayerId() {
    if(!wodProgress)wodProgress=defaultWodProgress();if(!wodProgress.profile)wodProgress.profile={};
    wodProgress.profile.playerId=wodProfileIdentity().playerId;
    for(const key of ['friends','friendRequestsOut','friendRequestsIn'])if(!Array.isArray(wodProgress.profile[key]))wodProgress.profile[key]=[];
    return wodProgress.profile.playerId;
}
let wodProgress = null;
function defaultWodProgress() {
    return {
        achievements: {
            goldenChipMaster: false,
            periodNapoleonic: false,
            periodAncient: false,
            periodMedieval: false
        },
        statsByMode:{singleplayer:{totals:{},byPeriod:{}},multiplayer:{totals:{},byPeriod:{}}},
        lifetimeByPeriod: {},
        lifetime: {
            enemyTroopKills: 0,
            ownTroopLosses: 0,
            enemyMotorizedKills:0,ownMotorizedLosses:0,enemyMountaineerKills:0,ownMountaineerLosses:0,enemyTruckKills:0,ownTruckLosses:0,enemyHorseKills:0,ownHorseLosses:0,
            enemyMarineKills: 0,
            ownMarineLosses: 0,
            enemyTankKills: 0,
            ownTankLosses: 0,
            enemyShipKills: 0,
            ownShipLosses: 0,
            peakFieldManpower: 0,
            battlesWon: 0,
            campaignLosses: 0,
            citiesCaptured: 0,
            convoysCaptured: 0,
            factoriesBuilt: 0,
            harborsBuilt: 0,
            farmsBuilt: 0,
            fortsBuilt: 0, hospitalsBuilt:0,
            peakMoneyHeld: 0,
            unitsBuiltLight: 0, unitsBuiltMotorized:0,unitsBuiltMountaineer:0,
            unitsBuiltHeavy: 0,
            unitsBuiltShip: 0, unitsBuiltTransport:0, unitsBuiltSupply:0,
            unitsBuiltMarine: 0,
            gamesStarted: 0,
            matchesCompleted: 0, matchesWon: 0, matchesLost: 0, matchesSurrendered: 0,
            missionsCompleted: 0,
            campaignsWon: 0,
            campaignBattlesWon: 0
        },
        profile: { gold: 100, unitSkin: 'nato', aiUnitSkin: 'nato', ownedUnitSkins: { nato: true }, ownedShopVisuals: {}, supporterPack: false, gamePeriod: 'modern', mpDisplayName: '', playerId: '', friends: [], friendRequestsOut: [], friendRequestsIn: [] },
        secrets: { creditsCoin: 0 },
        multiplayer: { gamesPlayed: 0, wins: 0, losses: 0 },
        missions: { completed: {} },
        storeMissions: { completed: {}, spent: {} },
        achievementGoldGranted: {},
        matchGoldGranted: {}
    };
}
function wodMergeBoolMap(a, b) {
    let out = Object.assign({}, a || {});
    if(b && typeof b === 'object') {
        for(let k of Object.keys(b)) if(b[k]) out[k] = true;
    }
    return out;
}
function wodMergeLifetimeMax(a, b) {
    let out = Object.assign({}, a || {});
    if(!b || typeof b !== 'object') return out;
    for(let k of Object.keys(b)) {
        let av = Number(out[k]) || 0;
        let bv = Number(b[k]) || 0;
        out[k] = Math.max(av, bv);
    }
    // Keep keys that only exist on a.
    return out;
}
function wodMergeLifetimeByPeriodMax(a, b) {
    let out = Object.assign({}, a || {});
    if(!b || typeof b !== 'object') return out;
    for(let pid of Object.keys(b)) {
        out[pid] = wodMergeLifetimeMax(out[pid] || {}, b[pid] || {});
    }
    return out;
}
function wodMergeAchievementsMax(a, b) {
    let out = Object.assign({}, a || {});
    if(!b || typeof b !== 'object') return out;
    for(let k of Object.keys(b)) if(b[k]) out[k] = true;
    return out;
}
function wodMergeProgressObject(o) {
    let base = defaultWodProgress();
    if(!o || typeof o !== 'object') return base;
    return {
        achievements: Object.assign({}, base.achievements, o.achievements || {}),
        lifetime: Object.assign({}, base.lifetime, o.lifetime || {}),
        statsByMode:wodMergeModeStats({},o.statsByMode||wodLegacyModeStats(o)),
        lifetimeByPeriod: Object.assign({}, base.lifetimeByPeriod, o.lifetimeByPeriod || {}),
        profile: Object.assign({}, base.profile, o.profile || {}, {
            friends: Array.isArray(o.profile && o.profile.friends) ? o.profile.friends.slice() : (base.profile.friends || []),
            friendRequestsOut: Array.isArray(o.profile && o.profile.friendRequestsOut) ? o.profile.friendRequestsOut.slice() : (base.profile.friendRequestsOut || []),
            friendRequestsIn: Array.isArray(o.profile && o.profile.friendRequestsIn) ? o.profile.friendRequestsIn.slice() : (base.profile.friendRequestsIn || [])
        }),
        multiplayer: Object.assign({}, base.multiplayer, o.multiplayer || {}),
        missions: {
            completed: Object.assign({}, base.missions.completed, (o.missions && o.missions.completed) || {})
        },
        storeMissions: {
            completed: Object.assign({}, (base.storeMissions && base.storeMissions.completed) || {}, (o.storeMissions && o.storeMissions.completed) || {}),
            spent: Object.assign({}, (base.storeMissions && base.storeMissions.spent) || {}, (o.storeMissions && o.storeMissions.spent) || {})
        },
        achievementGoldGranted: Object.assign({}, base.achievementGoldGranted, o.achievementGoldGranted || {}),
        secrets: { creditsCoin: Math.max(0,Math.min(3,Number(o.secrets?.creditsCoin)|0)) },
        matchGoldGranted: wodMergeMatchGoldClaims({},o.matchGoldGranted),
        // (the guided tutorial, completed or skipped: it was dropped here, so the menu's "Start here" came back after
        // every reload)
        tutorial: wodNormalizeTutorialProgress(o.tutorial)
    };
}
function wodNormalizeTutorialProgress(t) {
    if(!t || typeof t !== 'object' || !(t.completed || t.skipped)) return undefined;
    return { ...(t.completed ? { completed: true } : {}), ...(t.skipped && !t.completed ? { skipped: true } : {}), at: Number(t.at) || 0 };
}
function wodMergeMatchGoldClaims(a,b) {
    const claims={};
    for(const map of [a,b])for(const [id,value] of Object.entries(map||{})) {
        if(!/^[a-zA-Z0-9:_-]{1,100}$/.test(id))continue;
        const n=Math.max(0,Math.min(50,Math.floor(Number(value)||0)));
        if(n)claims[id]=Math.max(claims[id]||0,n);
    }
    return Object.fromEntries(Object.entries(claims).slice(-128));
}
function wodReadProgressRawFromStorage() {
    try {
        return localStorage.getItem(SL_PROGRESS_LS_KEY)
            || localStorage.getItem(SL_PROGRESS_LS_BACKUP_KEY)
            || localStorage.getItem(SL_PROGRESS_LS_LEGACY);
    } catch (e) { return null; }
}
function loadWodProgress() {
    let base = defaultWodProgress();
    let raw = wodReadProgressRawFromStorage();
    if(!raw) { wodProgress = base; return; }
    let parseErr = null;
    try {
        wodProgress = wodMergeProgressObject(JSON.parse(raw));
        return;
    } catch (e) { parseErr = e; }
    try {
        let bak = localStorage.getItem(SL_PROGRESS_LS_BACKUP_KEY);
        if(bak && bak !== raw) {
            wodProgress = wodMergeProgressObject(JSON.parse(bak));
            persistWodProgressNow();
            return;
        }
    } catch (e2) { parseErr = e2; }
    console.warn('Progress save corrupted; starting fresh.', parseErr);
    wodProgress = base;
}
function persistWodProgressNow(notify) {
    if(!wodProgress) return false;
    flushGameProfileToWod();
    let json;
    try { json = JSON.stringify(wodProgress); } catch (e) { return false; }
    try {
        let prev = localStorage.getItem(SL_PROGRESS_LS_KEY);
        if(prev && prev !== json) localStorage.setItem(SL_PROGRESS_LS_BACKUP_KEY, prev);
        localStorage.setItem(SL_PROGRESS_LS_KEY, json);
        if(window.WodSteamStore) WodSteamStore.queueSync();
        if(notify) showNotification('Progress saved in this browser.');
        return true;
    } catch (e) {
        showNotification('Could not save (browser storage full). Export a backup in Settings.');
        return false;
    }
}
function applyWodProfileToGame() {
    if(!wodProgress || !wodProgress.profile) return;
    let p = wodProgress.profile;
    if(p.gold !== undefined) gameData.gold = p.gold;
    wodSyncCreditsCoin();
    gameData._equippedShopMapId = p.equippedShopMapId || null;
    let us = (!p.unitSkin || p.unitSkin === 'default') ? 'nato' : p.unitSkin;
    let as = (!p.aiUnitSkin || p.aiUnitSkin === 'default') ? 'nato' : p.aiUnitSkin;
    gameData.unitSkin = us;
    gameData.aiUnitSkin = as;
    if(p.shopPreviewPlayerColor && /^#[0-9A-Fa-f]{6}$/.test(p.shopPreviewPlayerColor))
        gameData.shopPreviewPlayerColor = p.shopPreviewPlayerColor;
    if(p.shopPreviewAiColor && /^#[0-9A-Fa-f]{6}$/.test(p.shopPreviewAiColor))
        gameData.shopPreviewAiColor = p.shopPreviewAiColor;
    gameData.ownedUnitSkins = Object.assign({ nato: true }, p.ownedUnitSkins || {});
    gameData.ownedShopVisuals = Object.assign({}, p.ownedShopVisuals || {});
    gameData.supporterPack = !!p.supporterPack;
    if(gameData.ownedUnitSkins.default) delete gameData.ownedUnitSkins.default;
    if(gameData.ownedUnitSkins.goldenChip && wodProgress.achievements) wodProgress.achievements.goldenChipMaster = true;
    for(let pid of ['napoleonic', 'medieval', 'ancient']) {
        if(gameData.ownedUnitSkins[pid] && wodProgress.achievements)
            wodProgress.achievements['period' + pid.charAt(0).toUpperCase() + pid.slice(1)] = true;
    }
    gameData.gamePeriod = WOD_PERIOD_IDS.includes(p.gamePeriod) && wodIsPeriodUnlocked(p.gamePeriod) ? p.gamePeriod : 'modern';
    if(wodProgress.profile) wodProgress.profile.gamePeriod = gameData.gamePeriod;
    gameData._periodPreferenceChangedAt=Number(p.gamePeriodChangedAt)||0;
    syncGoldenChipUnlockFromAchievements();
    wodRefreshUrbanHexColorsForPeriod(gameData.gamePeriod);
    wodSyncAllPeriodSelects();
    wodRefreshPeriodSelectorVisibility();
    wodSyncSetupShopMapButton();
    wodEnsureShopPreviewColors();
    factionColors[1] = gameData.shopPreviewPlayerColor;
    let setupCol = document.getElementById('setupPlayerColor');
    if(setupCol) setupCol.value = gameData.shopPreviewPlayerColor;
    let mpCol = document.getElementById('mpCfgPlayerColor');
    if(mpCol) mpCol.value = gameData.shopPreviewPlayerColor;
    if(window.WodSteamStore?.state.wallet) WodSteamStore.apply(WodSteamStore.state, false);
}
function syncGoldenChipUnlockFromAchievements() {
    if(!wodProgress || !wodProgress.achievements || !gameData.ownedUnitSkins) return;
    if(wodProgress.achievements.goldenChipMaster) gameData.ownedUnitSkins.goldenChip = true;
}
function flushGameProfileToWod() {
    if(!wodProgress) return;
    wodProgress.profile = {
        gold: gameData.gold,
        unitSkin: gameData.unitSkin,
        aiUnitSkin: gameData.aiUnitSkin || 'nato',
        shopPreviewPlayerColor: gameData.shopPreviewPlayerColor || '#2ecc71',
        shopPreviewAiColor: gameData.shopPreviewAiColor || '#e74c3c',
        mpDisplayName: (wodProgress.profile && wodProgress.profile.mpDisplayName) || '',
        playerId: (wodProgress.profile && wodProgress.profile.playerId) || '',
        friends: Array.isArray(wodProgress.profile && wodProgress.profile.friends)
            ? wodProgress.profile.friends.slice()
            : [],
        friendRequestsOut: Array.isArray(wodProgress.profile && wodProgress.profile.friendRequestsOut)
            ? wodProgress.profile.friendRequestsOut.slice()
            : [],
        friendRequestsIn: Array.isArray(wodProgress.profile && wodProgress.profile.friendRequestsIn)
            ? wodProgress.profile.friendRequestsIn.slice()
            : [],
        ownedUnitSkins: Object.assign({}, gameData.ownedUnitSkins || { nato: true }),
        ownedShopVisuals: Object.assign({}, gameData.ownedShopVisuals || {}),
        supporterPack: !!gameData.supporterPack,
        steamCommerceAccount: window.WodSteamStore?.state.steamId ? WodSteamStore.state.environment + ':' + WodSteamStore.state.steamId : wodProgress.profile?.steamCommerceAccount || '',
        equippedShopMapId: gameData._equippedShopMapId || null,
        gamePeriod: gameData.gamePeriod || 'modern',
        gamePeriodChangedAt:gameData._periodPreferenceChangedAt||0
    };
}
let wodSaveTimer = null;
function wodCloudCanSync() {
    return typeof WodMultiplayer !== 'undefined' && WodMultiplayer.api?.socketOpen && WodMultiplayer.api?.registered && WodMultiplayer.syncProgress;
}
function wodApplyServerProfile(profile, opts) {
    if(!profile || typeof profile !== 'object') return;
    if(profile.playerId&&profile.playerId!==wodEnsurePlayerId())return;
    opts = opts || {};
    // Snapshot local progress first — cloud responses must never wipe client-only
    // fields (achievement gold grants, missions) or regress lifetime/gold/skins.
    flushGameProfileToWod();
    let local = wodProgress || defaultWodProgress();
    let keepPlayerId = (local.profile && local.profile.playerId) || '';
    let localFriends = local.profile ? {
        friends: local.profile.friends,
        friendRequestsOut: local.profile.friendRequestsOut,
        friendRequestsIn: local.profile.friendRequestsIn
    } : null;
    let localDisplayName = (local.profile && local.profile.mpDisplayName) || '';
    let mpEl = document.getElementById('mpDisplayName');
    let editingName = !!(mpEl && (mpEl === document.activeElement || mpEl._wodMpEditing));
    if(editingName && mpEl && mpEl.value.trim())
        localDisplayName = mpEl.value.trim().slice(0, 24);
    let sp = profile.profile || {};
    let mergedGold = Math.max(local.profile.gold | 0, sp.gold | 0);
    // Shop purchase responses are authoritative for gold after a spend.
    if((opts.shopPurchase||sp.steamWalletManaged) && sp.gold != null) mergedGold = sp.gold | 0;
    let mergedOwned = sp.steamWalletManaged?{...sp.ownedUnitSkins}:wodMergeBoolMap(local.profile.ownedUnitSkins, sp.ownedUnitSkins);
    mergedOwned.nato = true;
    let mergedVisuals = sp.steamWalletManaged?{...sp.ownedShopVisuals}:wodMergeBoolMap(local.profile.ownedShopVisuals, sp.ownedShopVisuals);
    wodProgress = wodMergeProgressObject({
        tutorial: local.tutorial, // (kept on this device; the profile server doesn't store it)
        matchGoldGranted:wodMergeMatchGoldClaims(local.matchGoldGranted,profile.matchGoldGranted),
        secrets: {creditsCoin:Math.max(local.secrets?.creditsCoin||0,Number(profile.secrets?.creditsCoin)|0)},
        achievements: wodMergeAchievementsMax(local.achievements, profile.achievements),
        statsByMode:wodMergeModeStats(local.statsByMode,profile.statsByMode),
        lifetime: wodMergeLifetimeMax(local.lifetime, profile.lifetime),
        lifetimeByPeriod: wodMergeLifetimeByPeriodMax(local.lifetimeByPeriod, profile.lifetimeByPeriod),
        multiplayer: wodMergeMpStatsMax(local.multiplayer, profile.multiplayer),
        missions: {
            completed: wodMergeBoolMap(
                (local.missions && local.missions.completed) || {},
                (profile.missions && profile.missions.completed) || {}
            )
        },
        storeMissions: {
            completed: wodMergeBoolMap(
                (local.storeMissions && local.storeMissions.completed) || {},
                (profile.storeMissions && profile.storeMissions.completed) || {}
            ),
            spent: wodMergeBoolMap(
                (local.storeMissions && local.storeMissions.spent) || {},
                (profile.storeMissions && profile.storeMissions.spent) || {}
            )
        },
        achievementGoldGranted: wodMergeBoolMap(
            local.achievementGoldGranted,
            profile.achievementGoldGranted
        ),
        profile: Object.assign({}, local.profile, sp, {
            playerId: keepPlayerId || sp.playerId || '',
            gold: mergedGold,
            ownedUnitSkins: mergedOwned,
            ownedShopVisuals: mergedVisuals,
            supporterPack: sp.steamWalletManaged?!!sp.supporterPack:!!(local.profile.supporterPack || sp.supporterPack || (gameData && gameData.supporterPack)),
            unitSkin: sp.unitSkin || local.profile.unitSkin,
            aiUnitSkin: sp.aiUnitSkin || local.profile.aiUnitSkin,
            equippedShopMapId: (sp.equippedShopMapId != null ? sp.equippedShopMapId : local.profile.equippedShopMapId) || null,
            mpDisplayName: localDisplayName || sp.mpDisplayName || local.profile.mpDisplayName || '',
            gamePeriod:Number(sp.gamePeriodChangedAt||0)>Number(local.profile.gamePeriodChangedAt||0)?sp.gamePeriod:local.profile.gamePeriod || sp.gamePeriod || 'modern',
            gamePeriodChangedAt:Math.max(Number(local.profile.gamePeriodChangedAt)||0,Number(sp.gamePeriodChangedAt)||0)
        })
    });
    if(editingName && localDisplayName && wodProgress.profile)
        wodProgress.profile.mpDisplayName = localDisplayName;
    if(localFriends && wodProgress.profile) {
        wodProgress.profile.friends = wodMpMergeFriendEntries(localFriends.friends, wodProgress.profile.friends);
        wodProgress.profile.friendRequestsOut = wodMpMergeFriendEntries(localFriends.friendRequestsOut, wodProgress.profile.friendRequestsOut);
        wodProgress.profile.friendRequestsIn = wodMpMergeFriendEntries(localFriends.friendRequestsIn, wodProgress.profile.friendRequestsIn);
    }
    applyWodProfileToGame();
    syncGoldenChipUnlockFromAchievements();
    // Reconcile achievement gold without re-notifying already-paid badges.
    if(typeof checkWodAchievements === 'function') checkWodAchievements();
    if(typeof renderAchievementsUi === 'function') renderAchievementsUi();
    if(typeof updateSkinShop === 'function') updateSkinShop();
    if(typeof wodMpRefreshLocalMpStatsReadout === 'function') wodMpRefreshLocalMpStatsReadout();
    if(typeof wodMpRenderFriendsList === 'function') wodMpRenderFriendsList();
    persistWodProgressNow();
    // Do not echo sync_progress from profile acks — that loops forever.
    if(opts.pushCloud) scheduleCloudSyncProgress();
}
function wodBuildCloudSyncPayload() {
    flushGameProfileToWod();
    return {
        statsByMode:wodProgress.statsByMode,
        lifetime: wodProgress.lifetime,
        lifetimeByPeriod: wodProgress.lifetimeByPeriod,
        achievements: wodProgress.achievements,
        achievementGoldGranted: wodProgress.achievementGoldGranted || {},
        matchGoldGranted:wodProgress.matchGoldGranted || {},
        secrets: wodProgress.secrets || { creditsCoin: 0 },
        missions: wodProgress.missions || { completed: {} },
        storeMissions: wodProgress.storeMissions || { completed: {}, spent: {} },
        multiplayer: wodProgress.multiplayer || { gamesPlayed: 0, wins: 0, losses: 0 },
        profile: {
            playerId:wodEnsurePlayerId(),
            gold: wodProgress.profile.gold | 0,
            gamePeriod:wodProgress.profile.gamePeriod || 'modern',
            gamePeriodChangedAt:wodProgress.profile.gamePeriodChangedAt||0,
            unitSkin: wodProgress.profile.unitSkin,
            aiUnitSkin: wodProgress.profile.aiUnitSkin,
            ownedUnitSkins: wodProgress.profile.ownedUnitSkins,
            ownedShopVisuals: wodProgress.profile.ownedShopVisuals,
            supporterPack: !!wodProgress.profile.supporterPack,
            equippedShopMapId: wodProgress.profile.equippedShopMapId,
            mpDisplayName: wodProgress.profile.mpDisplayName || '',
            friends: wodProgress.profile.friends,
            friendRequestsOut: wodProgress.profile.friendRequestsOut,
            friendRequestsIn: wodProgress.profile.friendRequestsIn
        }
    };
}
let _wodCloudSyncTimer = null;
function scheduleCloudSyncProgress() {
    if(!wodCloudCanSync()) return;
    wodEnsurePlayerId();
    if(_wodCloudSyncTimer) return;
    _wodCloudSyncTimer = setTimeout(() => {
        _wodCloudSyncTimer = null;
        WodMultiplayer.syncProgress(wodProgress.profile.playerId, wodBuildCloudSyncPayload());
    }, 700);
}
function wodCloudFetchProfile() {
    if(!wodCloudCanSync()) return;
    wodEnsurePlayerId();
    WodMultiplayer.getProfile(wodProgress.profile.playerId);
}
function scheduleSaveWodProgress() {
    if(wodSaveTimer) return;
    wodSaveTimer = setTimeout(() => {
        wodSaveTimer = null;
        persistWodProgressNow();
        scheduleCloudSyncProgress();
    }, 320);
}
function wodFlushLifetimeProgress() {
    if(wodSaveTimer){clearTimeout(wodSaveTimer);wodSaveTimer=null;}
    persistWodProgressNow();scheduleCloudSyncProgress();
}
function wodBeginLifetimeMatch() {
    if(!wodProgress||gameState!=='PLAYING'||gameData.menuAttractMode||gameData._lifetimeMatch)return;
    const era=gameData._matchPeriod||gameData.gamePeriod||'modern';
    gameData._lifetimeMatch={period:WOD_PERIOD_IDS.includes(era)?era:'modern',mode:gameData.mp?.enabled?'multiplayer':'singleplayer',finished:false,applied:{}};
    if(!gameData.mp?.enabled)wodBumpLifetime('gamesStarted',1);else wodBumpModeStat('gamesStarted',1);
    wodSyncLocalMatchLifetime();wodTrackLifetimeMatchPeaks();wodFlushLifetimeProgress();
}
// Host totals travel with snapshots; each human seat applies its own typed
// combat/production deltas exactly once, including after reconnects.
function wodRecordOwnerLifetime(owner,field,amount) {
    wodBattleMetric(owner,field,amount);
    if(!amount||!wodProgress||gameState!=='PLAYING'||gameData.menuAttractMode)return;
    if(gameData.mp?.enabled) {
        if(!gameData.mp.isHost)return;
        const totals=gameData._lifetimeStatsByOwner||(gameData._lifetimeStatsByOwner={});
        const row=totals[owner]||(totals[owner]={});row[field]=(row[field]||0)+amount;
        wodSyncLocalMatchLifetime();
    } else if(owner===1&&!gameData._lifetimeMatch?.finished) {wodBumpLifetime(field,amount);checkWodAchievements();scheduleSaveWodProgress();}
}
function wodSyncLocalMatchLifetime() {
    const match=gameData._lifetimeMatch;
    if(!match||match.finished||!gameData.mp?.enabled||gameData.menuAttractMode)return;
    const row=gameData._lifetimeStatsByOwner?.[wodLocalPlayerOwner()]||{};
    for(const [field,value] of Object.entries(row)) {
        if(!Object.hasOwn(wodDefaultLifetimeStats(),field))continue;
        const total=Number(value)||0,delta=total-(match.applied[field]||0);
        if(delta>0){wodBumpLifetime(field,delta);match.applied[field]=total;scheduleSaveWodProgress();}
    }
}
function wodTrackLifetimeMatchPeaks() {
    if(!gameData._lifetimeMatch||gameData._lifetimeMatch.finished||gameData.menuAttractMode)return;
    const bucket=wodLifetimeBucket(),army=getOwnerTroopManpower(wodLocalPlayerOwner()),cash=Math.floor(wodHudMoney());
    let dirty=false;
    if(army>(bucket?.peakFieldManpower||0)){wodBumpLifetimeMax('peakFieldManpower',army);dirty=true;}
    if(cash>(bucket?.peakMoneyHeld||0)){wodBumpLifetimeMax('peakMoneyHeld',cash);dirty=true;}
    if(dirty)scheduleSaveWodProgress();
}
function wodFinishLifetimeMatch(outcome,reason) {
    const match=gameData._lifetimeMatch;
    if(!match||match.finished||!wodProgress||gameData.menuAttractMode)return false;
    wodSyncLocalMatchLifetime();
    wodBumpLifetimeMax('peakFieldManpower',getOwnerTroopManpower(wodLocalPlayerOwner()));
    wodBumpLifetimeMax('peakMoneyHeld',Math.floor(wodHudMoney()));
    match.finished=true;match.outcome=outcome;match.reason=reason||'';
    // Online MP outcome totals come from the relay's match receipts. A
    // profile packet may arrive before this screen, so adding again races it.
    const bumpResult=field=>{if(match.mode==='multiplayer'&&wodCloudCanSync()){
        wodProgress.lifetime[field]=(wodProgress.lifetime[field]||0)+1;const bucket=wodLifetimeBucket();if(bucket)bucket[field]=(bucket[field]||0)+1;
    }else wodBumpLifetime(field,1);};
    bumpResult('matchesCompleted');bumpResult(outcome==='victory'?'matchesWon':'matchesLost');
    if(reason==='surrender')wodBumpLifetime('matchesSurrendered',1);
    if(outcome!=='victory'&&!gameData.mp?.enabled)wodBumpLifetime('campaignLosses',1);
    wodAwardMatchGold(match,outcome,reason);
    checkWodAchievements();wodFlushLifetimeProgress();return true;
}
function formatLifetimeBig(n) {
    n = Math.max(0, n || 0);
    if(n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if(n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if(n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.?0+$/, '') + 'k';
    return Math.floor(n).toString();
}
const WOD_GOLD_PER_ACHIEVEMENT = 10;
function wodCalculateMatchGold(outcome,reason,ledger=wodBattleLedger(),owner=wodLocalPlayerOwner()) {
    const row=ledger.byOwner?.[owner]||{},count=n=>Math.max(0,Math.floor(Number(n)||0));
    const seconds=Math.max(0,Number(ledger.activeSeconds)||0),damage=Math.max(0,Number(row.damageDealt)||0);
    const eligible=Number.isFinite(seconds)&&seconds>=60&&Number.isFinite(damage)&&damage>0;
    const killed=count(row.unitsDestroyed),built=['Light','Motorized','Mountaineer','Marine','Heavy','Ship','Transport','Supply'].reduce((n,t)=>n+count(row['unitsBuilt'+t]),0),towns=count(row.citiesCaptured);
    const parts=eligible?{result:reason==='quit'?0:outcome==='victory'?10:5,time:Math.min(15,Math.floor(seconds/60)),combat:Math.min(20,killed*2),production:Math.min(8,Math.floor(built/2)),objectives:Math.min(5,towns)}:{result:0,time:0,combat:0,production:0,objectives:0};
    const raw=Object.values(parts).reduce((n,v)=>n+v,0);
    return {amount:Math.min(50,raw),raw,parts,killed,built,towns,seconds,damage,eligible,ineligibleReason:seconds<60?'Play at least 60 active seconds to earn match gold.':!eligible?'Deal damage to an enemy to earn match gold.':'',outcome,reason:reason||''};
}
function wodAwardMatchGold(match,outcome,reason) {
    const ledger=wodBattleLedger(),reward=wodCalculateMatchGold(outcome,reason,ledger);
    const claims=wodProgress.matchGoldGranted||(wodProgress.matchGoldGranted={});
    reward.alreadyClaimed=Object.hasOwn(claims,ledger.id);
    if(reward.alreadyClaimed)reward.amount=claims[ledger.id];
    match.goldReward=reward;
    if(!reward.amount||reward.alreadyClaimed)return;
    claims[ledger.id]=reward.amount;
    wodProgress.matchGoldGranted=wodMergeMatchGoldClaims({},claims);
    wodGrantGold(reward.amount);
}
function wodMatchGoldReport() {
    const r=gameData._lifetimeMatch?.goldReward;if(!r)return '';
    // (each box is the gold that part earned, "+n", with what it counted beneath: "Towns captured 0" read like a count
    // and contradicted the battle snapshot's real one when the match earned no gold)
    const count=(n,one,many)=>Number.isFinite(n)?Math.floor(n)+' '+(Math.floor(n)===1?one:many):'';
    const item=(label,n,detail)=>'<div><span>'+label+'</span><strong>+'+n+'</strong>'+(detail?'<small>'+detail+'</small>':'')+'</div>';
    return '<section class="cs-card cs-gold-reward"><div class="cs-gold-title"><div><p class="cs-card-title">Match gold</p><p class="cs-gold-note">'+(r.alreadyClaimed?'Already collected':r.ineligibleReason|| (r.raw>50?'50 gold limit applied':'Added to your wallet'))+'</p></div><strong class="cs-gold-total"><span class="wod-gold-coin" aria-hidden="true"></span>+'+r.amount+'</strong></div><div class="cs-gold-breakdown">'+item(r.reason==='quit'?'Unfinished match':r.outcome==='victory'?'Victory':'Defeat',r.parts.result)+item('Active time',r.parts.time,count(Number(r.seconds)/60,'minute','minutes'))+item('Enemy units',r.parts.combat,count(r.killed,'destroyed','destroyed'))+item('Units built',r.parts.production,count(r.built,'built','built'))+item('Towns captured',r.parts.objectives,count(r.towns,'town','towns'))+'</div></section>';
}
function wodSyncCreditsCoin() {
    const coin=document.getElementById('creditsGoldCoin'),status=document.getElementById('creditsCoinStatus');
    const found=(wodProgress?.secrets?.creditsCoin||0)>=3;
    if(coin){
        coin.hidden=found;coin.title='A curious little coin';
        if(found){coin.getAnimations?.().forEach(a=>a.cancel());document.querySelectorAll('#creditsPanel .coin-landing-card').forEach(e=>e.classList.remove('coin-landing-card'));}
        else if(!coin.classList.contains('is-falling')&&!document.getElementById('creditsPanel').classList.contains('hidden'))wodPlaceCreditsCoin(wodProgress?.secrets?.creditsCoin||0);
        if(!coin._perchObserver&&typeof ResizeObserver!=='undefined'){
            coin._perchObserver=new ResizeObserver(()=>{if(!coin.hidden&&!coin.classList.contains('is-falling')&&!document.getElementById('creditsPanel').classList.contains('hidden'))wodPlaceCreditsCoin(wodProgress?.secrets?.creditsCoin||0);});
            coin._perchObserver.observe(document.querySelector('#creditsPanel .credits-list'));
        }
    }
    if(status)status.textContent=found?'Treasure found':'';
}
function wodPlaceCreditsCoin(stage) {
    const coin=document.getElementById('creditsGoldCoin'),list=document.querySelector('#creditsPanel .credits-list');if(!coin||!list)return null;
    if(!stage){document.querySelectorAll('#creditsPanel .coin-landing-card').forEach(e=>e.classList.remove('coin-landing-card'));document.getElementById('creditsCoinHome').appendChild(coin);coin.style.cssText='';return null;}
    const anchor=list.querySelector('[data-coin-perch="'+stage+'"]');if(!anchor)return null;
    anchor.closest('.credit-card').classList.add('coin-landing-card');
    list.appendChild(coin);const a=anchor.getBoundingClientRect(),r=list.getBoundingClientRect();
    coin.style.cssText='position:absolute;z-index:3;left:'+(a.left-r.left+a.width/2-22)+'px;top:'+(a.top-r.top-38)+'px';
    return anchor;
}
async function wodShakeCreditsCoin() {
    const coin=document.getElementById('creditsGoldCoin');
    if(!coin||coin.hidden||!wodProgress||document.getElementById('creditsPanel').classList.contains('hidden')||coin.classList.contains('is-falling'))return;
    const secrets=wodProgress.secrets||(wodProgress.secrets={creditsCoin:0});
    if(secrets.creditsCoin>=3)return;
    const next=(secrets.creditsCoin||0)+1,before=coin.getBoundingClientRect(),anchor=wodPlaceCreditsCoin(next),after=coin.getBoundingClientRect();
    if(!anchor)return;
    coin.classList.add('is-falling');
    if(next<3){secrets.creditsCoin=next;persistWodProgressNow();scheduleCloudSyncProgress();}
    const reduced=window.matchMedia('(prefers-reduced-motion:reduce)').matches,dx=before.left-after.left,dy=before.top-after.top;
    const frames=reduced?[{opacity:.5},{opacity:1}]:[
        {transform:'translate('+dx+'px,'+dy+'px) rotate(0)',offset:0,easing:'cubic-bezier(.4,0,1,1)'},
        {transform:'translate(0,7px) rotate(310deg)',offset:.72},
        {transform:'translate(0,-10px) rotate(345deg)',offset:.86},
        {transform:'translate(0,0) rotate(360deg)',opacity:next===3?0:1,offset:1}
    ];
    const flight=coin.animate?.(frames,{duration:reduced?180:850,easing:'ease-out'});
    setTimeout(()=>{if(!coin.hidden)anchor.scrollIntoView({block:'nearest',behavior:reduced?'auto':'smooth'});},reduced?0:120);
    try {if(flight)await flight.finished;else await new Promise(resolve=>setTimeout(resolve,850));}catch(_){}
    coin.classList.remove('is-falling');
    if(next===3&&wodProgress.secrets?.creditsCoin===2){
        wodProgress.secrets.creditsCoin=3;wodGrantGold(100);showNotification('A little treasure — +100 gold','success');
        persistWodProgressNow();scheduleCloudSyncProgress();wodSyncCreditsCoin();
        document.getElementById('creditsCoinStatus').textContent='Treasure found · +100 gold!';
    }else {
        wodSyncCreditsCoin();
    }
}
function wodGrantGold(amount, notifyMsg) {
    if(!amount || amount <= 0 || !wodProgress) return;
    gameData.gold = (gameData.gold || 0) + amount;
    flushGameProfileToWod();
    if(typeof updateSkinShop === 'function') updateSkinShop();
    scheduleSaveWodProgress();
    if(notifyMsg) showNotification(notifyMsg);
}
function wodAchievementBadgeDefs(L, A) {
    L = L || {};
    A = A || {};
    let owned = gameData.ownedUnitSkins || {};
    let badgeFlavor = wodPeriodFlavor('modern');
    return [
        { id: 'brokenShield', title: 'Broken shield', prog: L.battlesWon || 0, need: 1 },
        { id: 'townTaker', title: 'Town taker', prog: L.citiesCaptured || 0, need: 15 },
        { id: 'tankHunter', title: badgeFlavor.achHunter, prog: L.enemyTankKills || 0, need: 200 },
        { id: 'depthCharge', title: 'Depth charge', prog: L.enemyShipKills || 0, need: 40 },
        { id: 'merchantMarine', title: 'Merchant marine', prog: L.convoysCaptured || 0, need: 30 },
        { id: 'industrial', title: badgeFlavor.achIndustrial, prog: L.factoriesBuilt || 0, need: 12 },
        { id: 'admiralty', title: badgeFlavor.achAdmiralty, prog: L.harborsBuilt || 0, need: 12 },
        { id: 'fortunesOfWar', title: 'Fortunes of war', prog: L.peakMoneyHeld || 0, need: 20000 },
        { id: 'grandHost', title: 'Grand host', prog: L.peakFieldManpower || 0, need: 50000 },
        { id: 'warmaster', title: 'Warmaster', prog: L.battlesWon || 0, need: 5 },
        { id: 'firstLanding', title: 'First landing', prog: L.missionsCompleted || 0, need: 1 },
        { id: 'missionChain', title: 'Mission chain', prog: L.missionsCompleted || 0, need: 5 },
        { id: 'fullDeployment', title: 'Full deployment', prog: L.missionsCompleted || 0, need: 10 },
        { id: 'ashenVictory', title: 'Ashen victory', prog: L.campaignsWon || 0, need: 1 },
        { id: 'regionalCommander', title: 'Regional commander', prog: L.campaignBattlesWon || 0, need: 10 },
        { id: 'periodNapoleonic', title: 'Age of Napoleon', prog: (A.periodNapoleonic || owned.napoleonic) ? 1 : 0, need: 1 },
        { id: 'periodAncient', title: 'Classical world', prog: (A.periodAncient || owned.ancient) ? 1 : 0, need: 1 },
        { id: 'periodMedieval', title: 'High medieval', prog: (A.periodMedieval || owned.medieval) ? 1 : 0, need: 1 },
        { id: 'sovereignChip', title: 'Sovereign chip', prog: A.goldenChipMaster ? 1 : 0, need: 1 }
    ];
}
function allWodAchievementsMet(L, A) {
    for(let r of wodAchievementBadgeDefs(L, A)) {
        if(r.id === 'sovereignChip') continue;
        if((r.prog || 0) < r.need) return false;
    }
    return true;
}
function wodGrantNewAchievementGold() {
    if(!wodProgress) return;
    if(!wodProgress.achievementGoldGranted) wodProgress.achievementGoldGranted = {};
    let paid = wodProgress.achievementGoldGranted;
    let L = wodProgress.lifetime, A = wodProgress.achievements;
    for(let r of wodAchievementBadgeDefs(L, A)) {
        if(r.prog < r.need || paid[r.id]) continue;
        paid[r.id] = true;
        wodGrantGold(WOD_GOLD_PER_ACHIEVEMENT, 'Achievement: ' + r.title + ' — +' + WOD_GOLD_PER_ACHIEVEMENT + ' gold');
    }
}
/** Returning players whose grant map was wiped by old cloud sync should not
 *  re-earn gold for badges they already met — mark them paid without payout. */
function wodReconcileAchievementGoldGrants() {
    if(!wodProgress) return;
    if(!wodProgress.achievementGoldGranted) wodProgress.achievementGoldGranted = {};
    let paid = wodProgress.achievementGoldGranted;
    if(Object.keys(paid).length > 0) return;
    let L = wodProgress.lifetime || {};
    let A = wodProgress.achievements || {};
    let hasHistory = (L.gamesStarted | 0) > 0 || (L.battlesWon | 0) > 0 ||
        (L.missionsCompleted | 0) > 0 || (L.campaignBattlesWon | 0) > 0 ||
        ((wodProgress.profile && wodProgress.profile.gold) | 0) > 0 ||
        (gameData.gold | 0) > 0;
    if(!hasHistory) return;
    for(let r of wodAchievementBadgeDefs(L, A)) {
        if((r.prog || 0) >= r.need) paid[r.id] = true;
    }
}
function checkWodAchievements() {
    if(!wodProgress) return;
    wodReconcileAchievementGoldGrants();
    let L = wodProgress.lifetime, A = wodProgress.achievements;
    if(!A.goldenChipMaster && allWodAchievementsMet(L, A)) {
        A.goldenChipMaster = true;
        if(!gameData.ownedUnitSkins) gameData.ownedUnitSkins = {};
        gameData.ownedUnitSkins.goldenChip = true;
        showNotification('Secret unlocked: Sovereign chip skin!');
        flushGameProfileToWod();
        scheduleSaveWodProgress();
        updateSkinShop();
    }
    wodGrantNewAchievementGold();
    wodSyncSteamAchievements(L, A);
    let achPanel = document.getElementById('achievementsPanel');
    if(achPanel && !achPanel.classList.contains('hidden')) renderAchievementsUi();
}
let _wodSteamAchSent = {};
function wodAchievementIconHtml(id, unlocked) {
    let state = unlocked ? 'ACHIEVED' : 'UNACHIEVED';
    return '<img class="ach-art" src="achievements/' + id + '_' + state + '.png" alt="" width="64" height="64" draggable="false">';
}
function wodSyncSteamAchievements(L, A) {
    let desk = window.simpleWarsDesktop;
    if(!desk || typeof desk.unlockAchievement !== 'function') return;
    for(let r of wodAchievementBadgeDefs(L, A)) {
        if((r.prog || 0) < r.need || _wodSteamAchSent[r.id]) continue;
        _wodSteamAchSent[r.id] = true;
        desk.unlockAchievement(r.id);
    }
}
function renderAchievementsUi() {
    if(!wodProgress) return;
    let badges = document.getElementById('achTabBadgesBody');
    let stats = document.getElementById('achTabStatsBody');
    if(!badges || !stats) return;
    let L = wodProgress.lifetime, A = wodProgress.achievements;
    let badgeFlavor = wodPeriodFlavor('modern');
    let rows = wodAchievementBadgeDefs(L, A).filter(r => r.id !== 'sovereignChip').map(r => ({
        id: r.id,
        title: r.title,
        desc: ({
            brokenShield: 'Eliminate an enemy faction by capturing all of their cities.',
            townTaker: 'Capture 15 enemy cities (lifetime).',
            tankHunter: badgeFlavor.achHunterDesc,
            depthCharge: 'Sink 40 enemy warships (lifetime).',
            merchantMarine: 'Capture 30 enemy trade convoys (lifetime).',
            industrial: badgeFlavor.achIndustrialDesc,
            admiralty: badgeFlavor.achAdmiraltyDesc,
            fortunesOfWar: 'Hold at least $20,000 at once in a campaign.',
            grandHost: 'Field at least 50,000 troops on the map at once.',
            warmaster: 'Eliminate 5 enemy factions across all campaigns (last city captured).',
            firstLanding: 'Complete your first mission.',
            missionChain: 'Complete 5 missions.',
            fullDeployment: 'Complete all 10 missions.',
            ashenVictory: 'Win The Ashen Front campaign.',
            regionalCommander: 'Win 10 campaign battles.',
            periodNapoleonic: 'Unlock the Napoleonic era in the Shop.',
            periodAncient: 'Unlock the Ancient era in the Shop.',
            periodMedieval: 'Unlock the Medieval era in the Shop.'
        })[r.id] || '',
        prog: r.prog,
        need: r.need
    }));
    let html = '<div class="ach-grid">' + rows.map((r) => {
        let ok = r.prog >= r.need;
        let pct = r.need > 0 ? Math.min(100, (r.prog / r.need) * 100) : 0;
        let sub = `${formatLifetimeBig(Math.min(r.prog, r.need))} / ${formatLifetimeBig(r.need)}`;
        return `<div class="ach-card${ok ? ' unlocked' : ''}"><div class="ach-icon">${wodAchievementIconHtml(r.id, ok)}</div><div><div class="ach-title">${r.title}</div><div class="ach-desc">${r.desc}</div><div class="ach-progress-track"><div class="ach-progress-fill" style="width:${pct}%"></div></div><div class="ach-progress-footer"><span>Progress</span><strong>${sub}</strong></div></div></div>`;
    }).join('');

    let secretOk = !!A.goldenChipMaster;
    html += secretOk
        ? `<div class="ach-card unlocked ach-secret"><div class="ach-icon">${wodAchievementIconHtml('sovereignChip', true)}</div><div><div class="ach-title">Sovereign chip</div><div class="ach-desc">Secret skin unlocked — equip <strong>Sovereign chip</strong> in the Shop.</div><div class="ach-progress-track"><div class="ach-progress-fill" style="width:100%"></div></div><div class="ach-progress-footer"><span>Status</span><strong>Complete</strong></div></div></div>`
        : `<div class="ach-card ach-secret locked"><div class="ach-icon">?</div><div><div class="ach-title">???</div><div class="ach-desc">???</div><div class="ach-progress-footer" style="margin-top:10px"><span>???</span><span>???</span></div></div></div>`;
    html += '</div>';
    badges.innerHTML = html;

    let statsL = wodStatsForMode(window._wodStatsMode||'singleplayer');
    let statsPeriod = 'all';
    if(_achStatsPeriodFilter && _achStatsPeriodFilter !== 'all') {
        statsL = wodStatsForMode(window._wodStatsMode||'singleplayer',_achStatsPeriodFilter);
        statsPeriod = _achStatsPeriodFilter;
    }
    let sf = wodStatsFlavor(statsPeriod);
    const specialistEra=statsPeriod==='all'?'modern':statsPeriod,specialistName=t=>statsPeriod==='all'?(t==='motorized'?'Mounted / motorized infantry':'Skirmishers / mountaineers'):wodSpecialistLabel(t,specialistEra);
    function sc(lab, val) {
        return `<div class="stat-cell"><div class="stat-label">${lab}</div><div class="stat-value">${val}</div></div>`;
    }
    let periodBar = '';
    if(wodHasAnyEraSkinUnlocked() || Object.keys(wodProgress.lifetimeByPeriod||{}).some(p=>p!=='modern')) {
        let periodOpts = '<option value="all"' + (_achStatsPeriodFilter === 'all' ? ' selected' : '') + '>All periods (combined)</option>';
        for(let pid of WOD_PERIOD_IDS) {
            periodOpts += '<option value="' + pid + '"' + (_achStatsPeriodFilter === pid ? ' selected' : '') + '>' + wodPeriodLabel(pid) + '</option>';
        }
        periodBar = `<div class="stats-period-bar setup-row" style="margin-bottom:14px;max-width:360px">
                    <label>Stats period</label>
                    <select id="achStatsPeriodFilter" style="flex:1">${periodOpts}</select>
                </div>`;
    }
    const mode=window._wodStatsMode||'singleplayer';
    const modeBar='<div class="stats-mode-tabs" role="tablist" aria-label="Statistics mode" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">'+[['singleplayer','Single player'],['multiplayer','Multiplayer'],...(wodProgress.statsByMode?.legacy?[['legacy','Earlier combined records']]:[])].map(([key,label])=>'<button type="button" role="tab" class="build-btn" data-stats-mode="'+key+'" aria-selected="'+(mode===key)+'" style="min-height:44px;flex:1;border-color:'+(mode===key?'#f1c40f':'#607080')+'">'+label+'</button>').join('')+'</div>'+(mode==='legacy'?'<p class="battle-note">Older versions mixed modes. These records are preserved here without guessing which battles they came from.</p>':'');
    stats.innerHTML = `${modeBar}${periodBar}
            <div class="stats-layout">
                <section class="stats-section">
                    <h3 class="stats-section-title">Match results</h3>
                    <div class="stats-grid">
                        ${sc('Matches completed',formatLifetimeBig(statsL.matchesCompleted))}
                        ${sc('Matches won',formatLifetimeBig(statsL.matchesWon))}
                        ${sc('Matches lost',formatLifetimeBig(statsL.matchesLost))}
                        ${sc('Surrenders',formatLifetimeBig(statsL.matchesSurrendered))}
                    </div>
                </section>
                <section class="stats-section">
                    <h3 class="stats-section-title">Combat</h3>
                    <div class="stats-combat-split">
                        <div>
                            <div class="stats-combat-sub">Your forces</div>
                            <div class="stats-grid stats-grid--combat-row">
                                ${sc('All personnel lost', formatLifetimeBig((statsL.ownTroopLosses||0)+(statsL.ownMarineLosses||0)))}
                                ${sc(sf.statOwnMarine, formatLifetimeBig(statsL.ownMarineLosses))}
                                ${sc(sf.statOwnHeavy, formatLifetimeBig(statsL.ownTankLosses))}
                                ${sc(sf.statOwnShips, formatLifetimeBig(statsL.ownShipLosses))}
                            </div>
                        </div>
                        <div>
                            <div class="stats-combat-sub">Enemy</div>
                            <div class="stats-grid stats-grid--combat-row">
                                ${sc('All personnel killed', formatLifetimeBig((statsL.enemyTroopKills||0)+(statsL.enemyMarineKills||0)))}
                                ${sc(sf.statEnemyMarine, formatLifetimeBig(statsL.enemyMarineKills))}
                                ${sc(sf.statEnemyHeavy, formatLifetimeBig(statsL.enemyTankKills))}
                                ${sc(sf.statEnemyShips, formatLifetimeBig(statsL.enemyShipKills))}
                            </div>
                        </div>
                    </div>
                </section>
                <section class="stats-section">
                    <h3 class="stats-section-title">Specialists &amp; equipment</h3><p class="battle-note">Specialist personnel are included in the personnel totals above.</p>
                    <div class="stats-grid">
                        ${sc(specialistName('motorized')+' personnel lost',formatLifetimeBig(statsL.ownMotorizedLosses))}${sc(specialistName('motorized')+' personnel killed',formatLifetimeBig(statsL.enemyMotorizedKills))}
                        ${sc(specialistName('mountaineer')+' lost',formatLifetimeBig(statsL.ownMountaineerLosses))}${sc(specialistName('mountaineer')+' killed',formatLifetimeBig(statsL.enemyMountaineerKills))}
                        ${statsPeriod==='all'||specialistEra==='modern'?sc('Trucks lost',formatLifetimeBig(statsL.ownTruckLosses))+sc('Enemy trucks destroyed',formatLifetimeBig(statsL.enemyTruckKills)):''}
                        ${statsPeriod==='all'||specialistEra!=='modern'?sc('Horses lost',formatLifetimeBig(statsL.ownHorseLosses))+sc('Enemy horses lost',formatLifetimeBig(statsL.enemyHorseKills)):''}
                    </div>
                </section>
                <section class="stats-section">
                    <h3 class="stats-section-title">Battlefield totals</h3>
                    <div class="stats-grid">
                        ${sc('Peak army (fielded)', formatLifetimeBig(statsL.peakFieldManpower))}
                        ${sc('Enemy factions eliminated', formatLifetimeBig(statsL.battlesWon))}
                        ${sc('Defeats (including surrender)', formatLifetimeBig(statsL.matchesLost))}
                        ${sc('Cities captured', formatLifetimeBig(statsL.citiesCaptured))}
                        ${sc('Convoys seized', formatLifetimeBig(statsL.convoysCaptured))}
                        ${sc('Battles started', formatLifetimeBig(statsL.gamesStarted))}
                    </div>
                </section>
                <section class="stats-section">
                    <h3 class="stats-section-title">Missions &amp; campaigns</h3>
                    <div class="stats-grid">
                        ${sc('Missions completed', formatLifetimeBig(statsL.missionsCompleted))}
                        ${sc('Campaigns won', formatLifetimeBig(statsL.campaignsWon))}
                        ${sc('Campaign battles won', formatLifetimeBig(statsL.campaignBattlesWon))}
                    </div>
                </section>
                <section class="stats-section">
                    <h3 class="stats-section-title">Economy &amp; infrastructure</h3>
                    <div class="stats-grid">
                        ${sc('Peak $ held (one battle)', formatLifetimeBig(statsL.peakMoneyHeld))}
                        ${sc(sf.statFactories, formatLifetimeBig(statsL.factoriesBuilt))}
                        ${sc(sf.statHarbors, formatLifetimeBig(statsL.harborsBuilt))}
                        ${sc(sf.statForts, formatLifetimeBig(statsL.fortsBuilt))}
                        ${sc('Hospitals built', formatLifetimeBig(statsL.hospitalsBuilt))}
                    </div>
                </section>
                <section class="stats-section">
                    <h3 class="stats-section-title">Troops trained</h3>
                    <div class="stats-grid">
                        ${sc(sf.statTrainLight, formatLifetimeBig(statsL.unitsBuiltLight))}
                        ${sc(sf.statTrainMarine, formatLifetimeBig(statsL.unitsBuiltMarine || 0))}
                        ${sc(sf.statTrainHeavy, formatLifetimeBig(statsL.unitsBuiltHeavy))}
                        ${sc(sf.statTrainShip, formatLifetimeBig(statsL.unitsBuiltShip))}
                        ${sc('Transports built',formatLifetimeBig(statsL.unitsBuiltTransport))}
                        ${sc('Supply ships built',formatLifetimeBig(statsL.unitsBuiltSupply))}${sc(specialistName('motorized')+' trained',formatLifetimeBig(statsL.unitsBuiltMotorized))}${sc(specialistName('mountaineer')+' trained',formatLifetimeBig(statsL.unitsBuiltMountaineer))}
                    </div>
                </section>
            </div>`;
    stats.querySelectorAll('[data-stats-mode]').forEach(b=>b.onclick=()=>{window._wodStatsMode=b.dataset.statsMode;renderAchievementsUi();});
    wodWireAchStatsPeriodFilter();
}
function switchAchTab(which) {
    let badges = document.getElementById('achTabBadges');
    let stats = document.getElementById('achTabStats');
    let bbtn = document.getElementById('achTabBtnBadges');
    let sbtn = document.getElementById('achTabBtnStats');
    if(!badges || !stats) return;
    let isBadges = which === 'badges';
    badges.classList.toggle('active', isBadges);
    stats.classList.toggle('active', !isBadges);
    if(bbtn) { bbtn.classList.toggle('active', isBadges); }
    if(sbtn) { sbtn.classList.toggle('active', !isBadges); }
    renderAchievementsUi();
}
const WOD_SAVE_BUNDLE_VERSION = 1;
const WOD_SAVE_FILE_PREFIX = 'simplewars_';
const WOD_IDB_PROGRESS_SLOTS_INDEX = 'progressSlotsIndex.v1';
const WOD_IDB_PROGRESS_SLOT_PREFIX = 'progressSlot:';
function wodBuildSaveBundle() {
    flushGameProfileToWod();
    return {
        format: 'simplewars_save',
        version: WOD_SAVE_BUNDLE_VERSION,
        savedAt: new Date().toISOString(),
        progress: JSON.parse(JSON.stringify(wodProgress)),
        uiSettings: {
            showOrdersWhenDeselected: gameData.uiSettings.showOrdersWhenDeselected !== false,
            orderArrowsUsePathfinding: !!gameData.uiSettings.orderArrowsUsePathfinding,
            frontlineStyle: gameData.uiSettings.frontlineStyle,
            commandArrowStyle: gameData.uiSettings.commandArrowStyle,
            frontlineColor: gameData.uiSettings.frontlineColor,
            commandArrowColor: gameData.uiSettings.commandArrowColor,
            mapSkin: gameData.uiSettings.mapSkin
        }
    };
}
function wodIdbGetProgressSlotIndex() {
    return wodIdbKvGet(WOD_IDB_PROGRESS_SLOTS_INDEX).then(function(r) {
        return Array.isArray(r) ? r : [];
    }).catch(function() { return []; });
}
function wodIdbPutProgressSlotIndex(arr) {
    return wodIdbKvPut(WOD_IDB_PROGRESS_SLOTS_INDEX, arr);
}
async function resetAllGameProgress() {
    if(resetAllGameProgress.pending)return;
    resetAllGameProgress.pending=true;
    let accepted=false;
    try {accepted=await wodShowConfirmDialog({title:'Reset your progress?',body:window.WodSteamStore?.native()?'This clears local achievements, lifetime stats and saved games. Your Steam wallet and permanent collection are kept and can be restored when connected. This cannot be undone.':'This clears this browser’s achievements, lifetime stats, gold, unlocked skins and saved games. Your starting balance returns to 100 gold. This cannot be undone.',confirmLabel:'Reset progress',cancelLabel:'Keep progress',danger:true});}
    finally {resetAllGameProgress.pending=false;}
    if(!accepted)return;
    wodProgress = defaultWodProgress();
    try {
        localStorage.removeItem(SL_PROGRESS_LS_KEY);
        localStorage.removeItem(SL_PROGRESS_LS_BACKUP_KEY);
        localStorage.removeItem(SL_PROGRESS_LS_LEGACY);
    } catch (e) {}
    void wodClearAllBrowserSaveSlots().catch(function() {});
    applyWodProfileToGame();
    persistWodProgressNow();
    updateSkinShop();
    renderAchievementsUi();
    wodRefreshBrowserSaveList();
    showNotification('Progress reset.','info');
}
function wodSetBootSplashProgress(pct) {
    let inner = document.getElementById('wodBootBarInner');
    let tr = document.getElementById('wodBootBarTrack');
    let p = Math.min(100, Math.max(0, +pct || 0));
    if(inner) inner.style.transform = `scaleX(${p / 100})`;
    if(tr) tr.setAttribute('aria-valuenow', String(Math.round(p)));
}
/** Advance boot splash caption/progress while async work runs (keeps bar from looking stuck). */
async function wodBootRunWithProgress(captionEl, fromPct, toPct, labelPrefix, work, subLabels) {
    subLabels = subLabels || [
        labelPrefix + ' — layout',
        labelPrefix + ' — terrain',
        labelPrefix + ' — borders',
        labelPrefix + ' — settlements',
        labelPrefix + ' — units'
    ];
    let shown = fromPct;
    let sub = 0;
    let iv = setInterval(() => {
        shown = Math.min(toPct - 2, shown + 1.4);
        wodSetBootSplashProgress(shown);
        if(captionEl && subLabels.length) {
            captionEl.textContent = subLabels[sub % subLabels.length];
            sub++;
        }
    }, 160);
    try {
        let out = work();
        if(out && typeof out.then === 'function') await out;
    } finally {
        clearInterval(iv);
    }
    wodSetBootSplashProgress(toPct);
    if(captionEl) captionEl.textContent = labelPrefix;
    await new Promise(r => requestAnimationFrame(r));
}
function wodDefaultLifetimeStats() {
    return {
        enemyMotorizedKills:0,ownMotorizedLosses:0,enemyMountaineerKills:0,ownMountaineerLosses:0,enemyTruckKills:0,ownTruckLosses:0,enemyHorseKills:0,ownHorseLosses:0,
        enemyTroopKills: 0, ownTroopLosses: 0, enemyMarineKills: 0, ownMarineLosses: 0,
        enemyTankKills: 0, ownTankLosses: 0, enemyShipKills: 0, ownShipLosses: 0,
        peakFieldManpower: 0, battlesWon: 0, campaignLosses: 0,
        citiesCaptured: 0, convoysCaptured: 0, factoriesBuilt: 0, harborsBuilt: 0, farmsBuilt: 0, fortsBuilt: 0, hospitalsBuilt:0, peakMoneyHeld: 0,
        unitsBuiltLight: 0, unitsBuiltMotorized:0,unitsBuiltMountaineer:0, unitsBuiltHeavy: 0, unitsBuiltShip: 0, unitsBuiltTransport:0, unitsBuiltSupply:0, unitsBuiltMarine: 0, gamesStarted: 0,
        matchesCompleted: 0, matchesWon: 0, matchesLost: 0, matchesSurrendered: 0,
        missionsCompleted: 0, campaignsWon: 0, campaignBattlesWon: 0
    };
}
function wodLegacyModeStats(progress) {
    const empty=()=>({totals:{},byPeriod:{}}),out={singleplayer:empty(),multiplayer:empty()};
    if(Object.values(progress?.lifetime||{}).some(v=>Number(v)>0))out.legacy={totals:{...progress.lifetime},byPeriod:JSON.parse(JSON.stringify(progress.lifetimeByPeriod||{}))};
    return out;
}
function wodMergeModeStats(a,b) {
    const out={};for(const mode of ['singleplayer','multiplayer','legacy']){
        const left=a?.[mode],right=b?.[mode];if(mode==='legacy'&&!left&&!right)continue;
        out[mode]={totals:wodMergeLifetimeMax(left?.totals,right?.totals),byPeriod:wodMergeLifetimeByPeriodMax(left?.byPeriod,right?.byPeriod)};
    }return out;
}
function wodBumpModeStat(field,value,peak=false) {
    if(!wodProgress)return;wodProgress.statsByMode||=wodLegacyModeStats(wodProgress);
    const mode=gameData._lifetimeMatch?.mode||(gameData.mp?.enabled?'multiplayer':'singleplayer'),era=gameData._lifetimeMatch?.period||wodGetMatchPeriod();
    const block=wodProgress.statsByMode[mode]||={totals:{},byPeriod:{}};block.byPeriod[era]||={};
    for(const row of [block.totals,block.byPeriod[era]])row[field]=peak?Math.max(row[field]||0,value):(row[field]||0)+value;
}
function wodLifetimeBucket(period) {
    if(!wodProgress) return null;
    if(!wodProgress.lifetimeByPeriod) wodProgress.lifetimeByPeriod = {};
    let id = period || gameData._lifetimeMatch?.period || wodGetMatchPeriod();
    if(!wodProgress.lifetimeByPeriod[id])
        wodProgress.lifetimeByPeriod[id] = Object.assign({}, wodDefaultLifetimeStats());
    return wodProgress.lifetimeByPeriod[id];
}
function wodBumpLifetime(field, amount) {
    if(!wodProgress || !amount) return;
    wodBumpModeStat(field,amount);
    wodProgress.lifetime[field] = (wodProgress.lifetime[field] || 0) + amount;
    let bp = wodLifetimeBucket();
    if(bp) bp[field] = (bp[field] || 0) + amount;
}
function wodBumpLifetimeMax(field, val) {
    if(!wodProgress || val == null) return;
    val = val | 0;wodBumpModeStat(field,val,true);
    if(val > (wodProgress.lifetime[field] || 0)) wodProgress.lifetime[field] = val;
    let bp = wodLifetimeBucket();
    if(bp && val > (bp[field] || 0)) bp[field] = val;
}
function wodGrantPeriodSkinAchievement(periodId) {
    if(!wodProgress || !periodId) return;
    let key = 'period' + periodId.charAt(0).toUpperCase() + periodId.slice(1);
    if(!wodProgress.achievements) wodProgress.achievements = {};
    if(wodProgress.achievements[key]) return;
    wodProgress.achievements[key] = true;
    showNotification('Achievement: ' + wodPeriodLabel(periodId) + ' era unlocked!');
    checkWodAchievements();
}
function wodRepairFerryProgress(t,dt) {
    t._ferryElapsed=(t._ferryElapsed||0)+dt;
    const passenger=t.pickupUid&&gameData.entities.find(u=>u.uid===t.pickupUid);
    const goal=t.cargo?(t.unloadGoal||t.ferryGoal):passenger;
    if(!goal||t.retreating||t._trafficYield||t._combatEngaged||t.cargo&&!wodAiFerryCanSail(t)){
        t._ferryProgress=null;return;
    }
    const key=t.cargo?'unload:'+t.cargo.uid+':'+t.unloadHexKey:'pickup:'+passenger.uid+':'+t.pickupLandKey;
    let p=t._ferryProgress;
    if(!p||p.key!==key)p=t._ferryProgress={key,x:t.x,y:t.y,px:passenger?.x,py:passenger?.y,idle:0,lost:0};
    const moved=Math.hypot(t.x-p.x,t.y-p.y)>4||passenger&&Math.hypot(passenger.x-p.px,passenger.y-p.py)>4;
    if(moved){p.x=t.x;p.y=t.y;p.px=passenger?.x;p.py=passenger?.y;p.idle=0;}else p.idle+=dt;
    const boatDone=!t.target&&!t.path?.length,unitDone=!passenger?.target&&!passenger?.path?.length;
    p.lost=boatDone&&(!passenger||unitDone)?p.lost+dt:0;
    if(p.idle<8&&p.lost<2)return;
    // Re-plan actual reachable shores, rather than perpetually retaining
    // a stale pickup lease or a blocked far-away unloading target.
    const shore=t.cargo?t.unloadHexKey:t.pickupLandKey;
    t._ferryBlockedShores||={};
    for(const k of Object.keys(t._ferryBlockedShores))if(t._ferryBlockedShores[k]<=t._ferryElapsed)delete t._ferryBlockedShores[k];
    if(shore)t._ferryBlockedShores[shore]=t._ferryElapsed+12;
    t._ferryRepairing=true;
    let repaired=false;
    if(passenger)repaired=wodOrderBoardTransport(passenger,t);
    else if(t.cargo)repaired=wodOrderUnloadTransport(t,goal);
    t._ferryRepairing=false;t._ferryProgress=null;
    if(!repaired&&passenger){
        passenger.boardTransportUid=null;passenger._wodBoardingNoWater=false;
        wodClearTransportMove(passenger);passenger.aiOrderUntil=0;
        t.pickupUid=null;t.pickupLandKey=null;wodClearTransportMove(t);
    }
}
