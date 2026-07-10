Original prompt: as a single index.html file, make a game that is a combination of  the gameplay of war of dots and the economy of openfront.io. It should essentially be a clone of war of dots with a better ui, less lag, and more economy and production options. The units should stay simple but 1 new unit a ship unit should be added. otherwise another change to the war of dots formula is that the user can build cities, factories, and harbors (which allow boat production) cities must have factories to provide heavy unit production and otherwise produce light infantry.  The cities and towns should automatically have roads connecting them Otherwise everything else should be exactly like war of dots with the various terrains and the way combat works. Units should be selectable in a better way and the front line should work in a better way. Make this a complete game. For now have a main menu with 2 game modes and a settings menu. The 2 game modes should be 1 that is against ai and one that is a placeholder for multiplayer. There should also be a map editor and achievments area as well as a credits area. Make the game look and player like war of dots but better.  Ensure the gameplay look and feel are like war of dots using the same type of maps, movement, and gameplay, ensuring a frontline and combat system exactly like war of dots with the users moving units and a frontline being created just like war of dots ensure the map and front lines and combat are all the same. Ensure the player controls individual units like war of dots and can group select as well.

# Progress
- [x] Initialized project and created TODOs.
- [x] Implement Main Menu & States
- [x] Implement Map Generation (Hex grid, procedural islands via noise).
- [x] Implement Economy (Cities produce income, factory & harbor construction).
- [x] Implement Units (Light, heavy, ships) & Selection UI (Drag select).
- [x] Implement Combat & Frontline rendering (dynamic hex capturing and color blending).
- [x] Implement simple AI.
- [x] UI & Visual Polish (Centered map wrapper, glassmorphism UI, city icons).
- [x] Map Panning and Zooming (Middle/right click to pan, scroll wheel to zoom).
- [x] Unit Physics & Balancing (Larger hitboxes, significantly slower movement speed, collision separation so they don't overlap/phase).
- [x] City Capturing (Units can now attack cities directly and flip their ownership).
- [x] Distinct Looks (Larger varied unit shapes, proper health bars for both cities and units).
- [x] High-fidelity Frontlines (Smaller hex scale to allow huge organic borders capturing multiple hexes per unit).
- [x] Urban Environments & Procedural Names (Cities are now clusters of gray "urban" hex terrain, and everything has procedural names).
- [x] UI Info Card (Selection card shows Name, Health, and Action state).
- [x] War of Dots Combat Animations (Units physically shake and jitter during combat and have perfectly circular wrap-around health bars).
- [x] Trade Convoys (Friendly cities will periodically spawn Trade Convoys to other cities which deliver a cash bounty upon safe arrival).
- [x] Game Startup Fix & Scale Corrections (Shrunk map scale, fixed main menu bug, added full War of Dots terrain suite).
- [x] Map Size & Density Adjustments (Dramatically reduced the number of towns on the map, drastically increased default map radius for authentic WoD scale).
- [x] Polished Town UI (Added a dark, rounded 'pill' background behind town names and faction color indicators to make towns stand out against the urban hexes).
- [x] Fullscreen & Clean Layout (Removed arbitrary game wrapper padding to allow 100vw, 100vh raw combat maps without scrolling issues).
- [x] Map Setup (Converted custom Map radius input to 5 fixed sizes: Tiny, Small, Medium, Large, Huge).
- [x] Troops & Casualties Tracking (Added continuous tracker to the top resource UI for active Troops and total overall faction Casualties).
- [x] Smoother Island Noise (Modified the noise boundaries to be Euclidean rather than hexagonal and layered the fBM generators so the shores are wild and organic, creating massive authentic continents and islands).
- [x] Unrestricted Zooming (Increased maximum and minimum map zoom limits allowing the user to zoom in massively close onto the units).
- [x] Enhanced Town Selectability (Removed all dot icons from towns, meaning they are now solely identified by the grey Urban terrain layout and text; clicking anywhere on the urban cells correctly selects the town).
- [x] Exact Map Preview Centering (Rewrote preview generation to calculate exact min/max bounds of the islands to perfectly center and scale the generated islands every single time).
- [x] Map Shape Toggles (Added a dedicated dropdown in the Map Setup allowing players to generate both sprawling procedural Islands or pure edge-to-edge Rectangular continents).
- [x] Movement UI & Selection Box Fixes (Fixed the CSS coordinate offset bugs making drag-selection weird, and added classic gold directional arrows plotting the path of moving units).
- [x] Crash Fixes (Resolved a critical undefined reference bug causing the physics loop to lock and freeze when selecting newly spawned units, and added dt capping so the physics engine never spirals out of control during lag).
- [x] Performance & Web Workers (Offloaded the entire AI simulation logic into a dedicated multi-threaded Web Worker to drastically reduce frame lag, and prepared a WebGPU context for future massive scale compatibility).
- [x] Offscreen Canvas Hex Caching (Implemented a high-performance OffscreenCanvas pre-rendering pipeline that caches the 30,000+ generated hex polygons to a background layer and incrementally updates them only when borders change, instantly bumping the game to a buttery smooth 60fps).
- [x] Authentic Territory Borders (Removed color-blending on claimed hexes so the original procedural terrain shines through cleanly, and implemented the iconic thick black War of Dots borders tracing identically along the front lines).
- [x] Expanded Terrain Types (Added all classic terrains: grass, sand, forest, swamp, snow, hill, water, and deep water).
- [x] Strategic Mountain Blockades (Ensured that mountain ranges act as impassable walls forcing armies into chokepoints and passes).
- [x] Organic AI Expansion (Fixed the AI routing algorithm so it genuinely pushes frontline expansions and secures neutral terrain/cities instead of tunneling aggressively at the player base).
- [x] Town capture logic streamlined (Towns are captured instantly on touch when left undefended, preventing weird freezing logic).
- [x] Visible frontlines and Borders (Borders dynamically check neighboring hex owners to draw authentic thick borders around your nation).
- [x] Game Setup Screen & Map Modes (Configure AI count, Map size, preview generation before starting; in-game toggle layers for Cities, Units, Diplomacy, and Terrain).
- [x] Map Save/Load (Functioning Save Map / Load Map logic directly accessible in the Setup screen to persist user maps).
- [x] War of Dots start split and front control pass (Starting territory now divides all land among player + AIs by nearest start, AIs beyond owner 2 spawn/economy correctly, and unit claiming advances from connected frontlines instead of isolated blobs).
- [x] Dot-map conversion pass (Stopped drawing hex polygons, generated dense War of Dots style dot cells, and changed opening ownership to equal land-cell slices across all participants).
- [x] Smooth map and skin shop pass (Terrain now renders as smooth paint-like fills with black ownership borders only, towns use faction color, and the main menu has a city skin shop).
- [x] Frontline polish and help UI pass (Smoothed terrain rendering with a blurred terrain cache and crisp borders, added mountain detours for movement, biased AI around shared front focuses, added a dynamic terrain key, and added an Esc help/settings/menu overlay).
- [x] Casualty/pathing/city polish pass (UI now shows player and enemy casualties separately, units spawn on valid non-mountain terrain, movement builds terrain-aware paths around mountains, towns render as grey WWII-style city blocks with faction flags, and trade convoys are selectable but no longer accept move orders).
- [x] Circle rendering and pathfinding pass (Terrain now uses larger overlapping circular stamps with less blur, borders are drawn from rounded boundary points instead of grid edges, and unit routing now uses costed path search with smoothed waypoints for both AI and player orders).
- [x] MS Paint map style pass (Removed terrain blur, grouped terrain into flat overlapping brush-circle fills, replaced the border point network with averaged hand-drawn paint strokes, and widened order search so pathfinding finds better reachable goals).
- [x] Continuous terrain and formation pass (Terrain now fills between same-terrain brush circles for smoother War of Dots-style blobs, starting frontlines receive organic noise while keeping balanced territory counts, pathfinding gets broader reachable-target selection, and multi-selected units support right-drag line formations).
- [x] Coastline/frontline and command polish pass (Water now carries ownership so borders continue through coasts/water, city clusters normalize surrounding ownership, AI groups receive line-formation attack/hold orders, safe damaged units heal with plus markers, selected owned units/towns can be renamed, and an off-by-default territory overlay layer was added).
- [x] AI/overlay/split refinement pass (AI now pushes when local support indicates it can win, healing plus signs remain tied to safe friendly territory, frontier strokes break at large gaps to prevent edge wrap, starting split uses shared land/water ownership with reduced noise and smoothing, and territory overlay now composites as a terrain tint mask).
- [x] Encirclement and frontline-start pass (Healing can occur closer to combat, starting sides spawn equal light units along the initial frontline, empty encircled land flips to the surrounding owner, trapped units suffer attrition with a warning marker, and AI target scoring favors flanking/encirclement pressure).
- [x] Unit effects and pathing fix pass (Unit cards now show emblems and active effects, encirclement attrition only applies to small pockets without owned cities to avoid false positives, land units can enter water but suffer heavy damage/speed penalties, and selected unit movement displays the actual waypoint path).
- [x] Upkeep/UI/path cleanup pass (Units now have upkeep expenses shown in the top bar, AI spawning is capped by troop count and net income, player summary shows faction troop/loss counts, move orders preserve exact clicked destinations when reachable, selected movement shows one merged arrow instead of every waypoint, encirclement ignores coastal/open pockets, and landscape mobile UI spacing was tightened).
- [x] Manpower/economy/casualty pass (Money is clamped at zero, unpaid troops take attrition, towns produce manpower, unit production costs manpower, units represent 1k manpower, all damage records casualties, troop/loss values are formatted in hundreds/thousands, AI spawning is limited by upkeep/net income/manpower, movement path display is simplified, and border strokes use local-only links to avoid random lines).
- [x] Tanks/caravan/UI/frontline follow-up pass (Player chart moved lower and expanded with money/troops/tanks/loss columns, heavy units now represent 5k manpower and 500 tanks, tank casualties and tank kills are tracked, top UI player losses/kills only reflect player losses and player-caused kills, city/unit/caravan cards show production/manpower/tank/trade data, caravans can be captured, AI spends the same money/manpower as the player, and frontline strokes were smoothed again without dotted artifacts).
- [x] Speed/combat/editor completion pass (Added pause/1x/2x controls, quit-to-surrender confirmation, slower combat with a 3 second retreat lock, broader city name variety, urban terrain building details, and a separate map-editor.js with blank/random/load/save, terrain painting, town/unit placement, dragging, and stat/look editing tools).
- [x] Economy table/frontline refinement pass (Player summary now uses two aligned rows per faction with money/troops/tanks and troop/tank losses, tank losses are shown as full counts, heavy production requires 5k manpower for AI and player, trade caravans show value and can be captured, unit/city cards show more readable manpower/tank/economy stats, and the smoother old-style border stroke is restored without the dotted artifacts).
- [x] Editor/shop/layers/credits pass (Map editor now opens on a blank map, has a paint palette, key, layer toggles, local saved-map browser with previews, and a main-menu exit; game layer buttons slide out from a master toggle and terrain-off mode shows land outlines; top UI now only shows economy values; credits list 502coderiver, Andrew Meehan, and Chris Meehan; shop is now a gold-based unit skin shop with NATO counters and five countryball skins).
- [x] Map key and setup balance pass (Town and forest map key swatches now draw small SVG art, rectangle maps use separate terrain thresholds with a hard mountain cap, setup start regenerates when map shape changes, and initial units spawn behind frontlines with enemy-distance spacing to avoid combat at game start).
- [x] Setup / menu UX pass (Map shape/size/AI dropdown changes regenerate preview; setup defaults to island; AI count is a dropdown; tighter WoD-style starting clusters; combat jitter only when units truly overlap; rectangle maps gain lakes/rivers/mountain passes and vales; main-menu attract renders one full terrain frame before the sim loop runs at 2x; starting a match resets gameplay speed to 1x).
- [x] Menu attract & rectangle hydrology pass (Multi-spine river fields with variable width, more mountain passes through valleys, lighter main-menu scrim + higher zoom, synchronous 2x warm-up updates so AI fronts move immediately with visible units.)
- [x] Procedural territory balance fix (Corrected Voronoi bias feedback so oversized factions shrink, then added a final protected-city frontier trim that equalizes non-water territory counts as closely as possible before units spawn.)
- [x] Runtime hitch and map-shape polish pass (Chunked AI strategy pulses across frames, throttled expensive live territory-cache bakes, batched ownership dirtying during unit claims, reduced rectangle map water to tighter rivers/lakes, added island edge-water padding, and expanded island silhouette modes.)
- [x] Esc guide and start parity pass (Esc help now embeds the full scrollable guide, island edge padding feathers inward to avoid straight border coasts, land tiles add cash income, and starting city economy/unit placement is normalized across players.)
- [x] Smooth movement / land-income HUD pass (Terrain cache dirtying now only fires when ownership changes, unit terrain safety checks are staggered, the top HUD shows land income separately while keeping it in total income, and pathfinding uses cardinal land-only routes for normal armies.)
- [x] Help/effects/combat marker/path polish pass (Guide now explains income sources, unit cards show current terrain attack/defense/speed modifiers, fighting labels became yellow burst icons, Esc back controls resume play, and mountain-edge path penalties were relaxed while preserving no-mountain routes.)
- [x] Preview start and boot polish pass (Solo Generate New now snapshots the exact generated map and Start restores it, preview loading uses a DOM/CSS busy overlay, and the initial boot bar has staged captions plus terrain/AI/path warm-up before the menu appears.)
- [x] Preview Start handoff fix (Start now restores any matching completed solo preview snapshot directly, clears stale snapshots at the beginning of generation, and disables Start while a preview is still generating.)
- [x] Armor and natural map pass (Heavy infantry is now player-facing Armor, costs much more cash but only 1k manpower, and procedural maps get smoother biome blending plus occasional natural rivers on island and rectangle maps.)
- [x] Multiplayer lobby map fix pass (Lobby map preview/launch now keys off active faction count not human-vs-bot labels; default seats are seat 1 human + closed slots; human/bot/color changes reuse terrain via politics-only or appearance-only refresh instead of full regen; launch reuses committed preview map; lobby mapgen skips overlay and uses faster cooperative yielding with single seeded accept try.)
- [x] MP lobby preview reliability pass (Lobby preview validates land/factions before commit, paints from committed snapshot after gen, retries seeded terrain up to 12?22 attempts, peer join auto-opens seats and politics-regens borders/troops, disconnect only repaints without regen.)
- [x] Menu-attract isolation pass (New solo/MP matches reset menu battle state, reject attract snapshots with AI-only owners 3/4, clear live menu map before match load, restore setup preview economy/units via assignStartingCities.)
- [x] MP politics-only terrain pass (Keep committed lobby terrain when seat count changes; store terrain politics base in committed snapshot; politics-only regen from committed terrain like solo; launch applies committed map without pre-clearing; sync launch uses politics-only when terrain unchanged; auto-kick lobby preview on host lobby render.)
- [x] MP match map isolation pass (Rebuild terrain cache on MP match load; stop restoring menu-attract live map after lobby preview; clear stale live map before host launch/guest join; build host init payload from committed lobby snapshot; remove premature initGame gameLoop before PLAYING.)
- [x] MP host blank map and client missing units pass (Build init payload from live match state with spawned frontline units; spawn units on client when payload empty; defer terrain bake until canvas visible; default in-game layer flags on match start.)
- [x] MP unified match-start sync pass (Host and clients apply identical match_start payload via wodMpApplyMatchStartPayload; rebuild hexList/hexes from one source; clear stale terrain caches on map reset; normalize hex terrain colors before bake.)

## Unit movement stutter fix (2026-06-17)
- Root causes: frame-rate-dependent draw smoothing (fixed k per frame), collision separation throttled to every 4 frames during large marches, territory/frontline canvas bakes firing on the draw path every ~420?680ms while units claim hexes, and HUD summary rescans every 400ms during play.
- Fixes: dt-based exponential draw interpolation using accumulated `_frameSimDt`; player-unit separation runs every sim tick; defer/slim territory political bakes while player units march; longer terrain dirty throttle during movement; defer player summary and troop HUD rescans while marching.

## March backward/stop stutter fix (2026-06-17 follow-up)
- Root cause: prior pass re-enabled collision separation on player marches (every-frame sync + 15% push) while draw smoothing lagged behind logic coords ? separation shoves logic position back, smoothed sprite catches up = visible backward hop. Terrain safety checks also ran on moving units and could teleport them. Friendly column blocking fired `isWorldPositionBlockedByUnits` stops every few frames.
- Fixes: skip all separation while player units march; restore human-march pair skip in sync separation; draw marching units at exact logic position; skip terrain safety on units with targets; no sep worker during player march; co-direction friendly marchers no longer block each other; longer human stuck/block thresholds in columns.

## Hitch elimination + AI upgrade pass (2026-07-05)
- Fixed broken separation Web Worker: its inline code string had a brace-count syntax error ("Unexpected identifier 'postMessage'"), so the worker never started and unit separation silently ran on the main thread every tick since the feature shipped.
- Fixed `generateMap` crash: `cols`/`rows`/`mapShape`/`landForCities` etc. were declared inside the procedural accept-retry loop but used by the post-loop fallback paths ? exhausting accept tries threw `ReferenceError: cols is not defined` and left a broken half-generated map. Hoisted the declarations.
- Fixed false instant-defeat pause: starting a solo match while the boot splash / menu-attract warm-up was still running let warm-up `update()` calls fire `checkCampaignEndConditions` against half-initialized match state, silently setting speed to Pause. startGame now waits for boot/bootstrap busy flags, re-asserts 1x after initGame, and end-condition checks are skipped while boot/mapgen is busy.
- Killed recurring frame spikes: AI bridge-site search (~150ms) ran fully before a 13% random keep-gate ? gate now rolls first; `wodBridgeHexAtPoint`/`bridgeAtHex` early-out when no bridges exist or the point is outside every bridge's bounding circle (these were the top CPU sinks in live profiling); `wodBridgeWaterHexNearPoint` skips its full-map fallback scan when deck keys resolve.
- Match-start freeze fix: `wodMinDistSqToEnemyTerritory` was an O(hexList) scan called per spawn candidate (O(n?), multi-second stall placing starting units). Replaced with a cached multi-source BFS distance field per owner (`wodEnsureEnemyDistanceField`), invalidated on new match / start-spawn.
- `wodUsesVisualViewportLayout` now caches its MediaQueryList (matchMedia showed up as ~2.7s self-time in 30s profiles; it is called from per-frame hot loops).
- Terrain full bake (~350ms) now runs at the end of initGame while the loading overlay is still up instead of stalling the first gameplay frame.
- AI upgrades: front-assignment scoring now prefers pushing into the weakest enemy (fielded-manpower ratio bonus) and expands eagerly into neutral land; attack gating adds a local-overrun rule (push when locally ~1.6x stronger with 3+ supports even without global superiority), lowered global-overwhelm threshold 1.18?1.12 and softened needed-support requirements so the AI stalls less on quiet fronts.
- Added dev/test hooks: `window.__wodDebug()`, `window.__wodGetGameData()` (used by Playwright e2e scripts in output/, which is gitignored).
- Verified via headless Playwright: 90s solo profile ? no long tasks >90ms after match start (was 3.7-7s stalls + periodic 170-500ms spikes); solo e2e ? select, right-click move order, AI captures territory, esc menu works, no console errors; multiplayer e2e ? create lobby, join, launch, identical territory on host+guest, guest move command applied on host, snapshots streaming, no errors.

## Mission look, ship/land, straight-border, hitch pass (2026-07-05 night)
- **Mission maps upgraded to procedural quality** (regenerate with `node scripts/generate-missions.js`):
  - `roughenCoasts` cellular pass erases every straight land/water edge (rect fills, map-boundary cuts);
  - `claimNations` now claims land AND water (like the game's start splits) with low-frequency wobble + per-cell jitter + majority smoothing ? organic frontlines, never straight;
  - `ridge()` uses a bounded random-walk drift + large-scale sway + width variation, so mountain ranges/rivers snake naturally; returns its centerline and all gates/bridges/forts anchor to the REAL feature course (`MapBuilder.nearestOn`);
  - build-time land-connectivity check: every enemy capital must be reachable from the player capital over land/bridges (naval missions exempt).
- **Ships can no longer slide through land**: `wodSamplePosOnWalkableTerrain` gave water-only movers (ships/sea convoys) the generous land-unit corner tolerance, letting movement chords cross narrow isthmuses when a water cell existed on the far side. Water-only movers now use a 0.6-radius tolerance. Verified: 3 ships crossing a full archipelago, 360 position samples, 0 land contacts.
- **Straight borders eliminated in generated maps**:
  - start-split Voronoi gets `wodStartSplitNoiseMult` ? deterministic per-(seed,owner) wave warp of the distance field, so two-faction bisectors are never mathematically straight (stable across the equalizer's iterations);
  - rectangle-map perimeter water uses a noise-varied waterline depth (1.5?7 cells) instead of a hard |q| cutoff ? coasts on rectangle/forest/mountain/desert maps are wavy on all four edges.
- **Combat hitch root-caused**: `wodAiTryFortForOwner` scored every candidate hex (unit-distance + frontline-distance scans per hex, thousands of candidates) ? single calls ran ~240ms on a periodic AI pulse. Now samples ?140 spread candidates with a 5ms deadline. Also: long-range AI move orders (city strikes/redeploys) route through the budgeted rAF order pump with an interim straight-walk target instead of synchronous multi-search assigns. March profile now: worst gap ~85ms (rare), all pathfind maxima ? ~50ms, typical frames clean.

## AI freeze fix, 10 missions, MP profile/leaderboard pass (2026-07-05 late)
- **AI "stops after a few seconds" fixed**: `wodDeferHeavySimDuringMarch` froze AI strategy/spawn/encirclement timers whenever 8+ units were moving IN TOTAL ? i.e. the AI's own attack wave paused its own brain permanently. Now only defers under an extreme player-march load (60+ player units marching). Verified: AI stays ordered/attacking continuously for 90s+, both with player idle and marching.
- **Pathfinding wall-clock caps** (the AI's new activity level exposed uncapped searches ? 3.1s single-frame stalls): `wodLandBfsPath` gets a 7ms in-play ceiling (26ms in menus), `wodFindBestBridgePath` an 8ms deadline across its composed candidate paths. Post-fix 40s march profile: worst frame gap 100ms once, all pathfind maxima ? 38ms.
- **10 new hand-crafted missions** (old beach-landing mission deleted; generator committed at `scripts/generate-missions.js`, run `node scripts/generate-missions.js` to rebuild):
  1 First Landing (easy beach invasion) ? 2 Brothers at War (river civil war, bridges) ? 3 The Mountain Passes (fortified chokepoints) ? 4 Isle Campaign (island hopping, navies) ? 5 Two-Front Gambit (2 enemy nations) ? 6 The Greywater Crossing (fortified river, 3 bridges) ? 7 Winter Citadel (mountain-ring fortress) ? 8 The Shattered Realm (4-way warlord FFA) ? 9 Ironshore (hard D-Day vs 5-fort coast) ? 10 World at War (3 empires vs small republic).
  Difficulty ramps via enemy economy (3.5k ? 15-20k), enemy unit counts, forts, and AI count; every mission has authored armies, briefing + scripted events (waves, reinforcements, path orders), and was verified end-to-end via the Missions panel (map loads, briefing shows, factions/units placed correctly, AI active, no console errors).
- **Multiplayer profile/leaderboard fixes**:
  - Server now refuses `create_lobby` / fresh `join_lobby` from sockets without a registered unique display name (previously only the client blocked it; rejoin-during-match unaffected).
  - Duplicate display names verified rejected ("That display name is already taken") across live sessions and the persisted leaderboard.
  - `mp_match_end` now updates the leaderboard rows immediately (server-authoritative combined stats; disconnected participants updated from their profile) ? rankings previously never changed after matches.
  - Fixed swapped/duplicated stats: `combinedStats.defeats` reported battlesWon and `losses` mixed match-losses in both client and server; now wins/defeats = matches won/lost, kills/losses = troops killed/lost. Leaderboard rows no longer print "Wins" twice.
  - Full verified loop: host+guest register unique names ? lobby ? match ? host reports result ? both profiles get wins/losses ? leaderboard reorders instantly.

## Territory / march-stutter / spawn corruption pass (2026-07-05 follow-up)
- **Preview-Start spawn corruption fixed**: the (newly repaired) separation worker returned index-based results computed against a PREVIOUS entity list; applying them blindly teleported freshly spawned match units (e.g. into the ocean in a diagonal line on archipelago). Worker results now carry a uid manifest + send-time positions, apply as clamped relative pushes only to the same unit identities, and are invalidated on new-match prep. Verified spawns across all 7 map shapes through the real Skirmish setup UI: 0 units on water/mountain, 0 on foreign hexes, min enemy distance ~79px on every shape.
- **Periodic in-match freeze fixed**: `wodRefreshUrbanHexColorsForPeriod` full-rebaked the terrain canvas (~330ms) on every server profile sync (register/progress/lobby events) even when urban colors were unchanged ? now only rebakes on actual change.
- **March micro-stutter fixed** (several compounding causes):
  - per-leg waypoint advances ran a synchronous ~30ms A* per unit (player columns now walk straight along their terrain-aware waypoint corridor; blocked legs queue one budgeted re-path through the rAF order pump with a 450ms per-unit cooldown);
  - failed full pathfinds fell back to greedy steps but re-ran the full (budget-exempt for humans) A* every single hex step ? 19 units in that state produced 80-100ms updates; failed pathfinds now grant 5 greedy-hop steps before retrying A*;
  - `runPathAst` gained a wall-clock ceiling (6ms during play, 10ms for human orders) alongside maxVisits;
  - `wodPickLandArmyMarchPath` skips the redundant full-map connectivity BFS when the land A* already reached the target, returns early on budget exhaustion, and the blocked-path fallback respects a 9ms deadline;
  - mass move orders assign only 1 unit synchronously for selections >6 (was 3 ? ~30ms in one frame).
  - Result: 40s march profile went from constant 25-45ms (worst 120ms+) updates to update avg 0.5ms / max 22ms with only 2 frames >16ms.
- **Territory paint frozen during marches fixed**: political terrain bakes were fully deferred while player units marched, so captured ground didn't repaint until the march ended (looked like territory capture was broken). Bakes now continue during marches with smaller time slices; dirty throttle tightened (900ms) and bake gap reduced (460ms desktop).
- **Frontline claims during firefights**: units wedged in combat never crossed a tile boundary, so the move-claim path never fired; fighting units now claim adjacent tiles every 4th tick, letting pushes visibly move the border.
- **Boot splash overlap fixed**: revealMenu no longer un-hides the main menu (and resumes the attract battle) if a match already started; startGame test hook races are also guarded by `_wodBootBusy`.
- Verified after all changes: territory claiming during attack marches (+borders repaint live), spawn placement via setup UI on all shapes, solo e2e (select/move/AI/esc), multiplayer host+guest e2e (identical synced territory, guest command applied, snapshots streaming), zero console errors.

## Arrow tips, water crossing, mountain tunneling, AI idle-hold pass (2026-07-07)
- **Arrow tips no longer skew sideways**: arrowheads took their angle from the last two polyline points; degenerate 1?3px final segments (exact-click substitution in `wodHexPathToWorldWaypoints`, dedupe leftovers) spun the head sideways. New `wodCommandArrowHeadAnchor` walks back along the polyline until ?10px from the tip; used by `drawUnitMovementPath` and `drawStrokePreviewArrows`.
- **Land units can now cross water to LAND objectives** (was: only worked if you first clicked a water tile). Root causes, all fixed:
  - `wodTryAssignPlayerCorridorPath` ? `buildConcatenatedHexPath` marked ORDER corridors with `_wodArrowPathBuild`, and `wodShouldUseWaterMarch`/`wodTryAmphibiousMarchFallback` refuse water while that flag is set ? player orders could never compose amphibious legs. `buildConcatenatedHexPath` now takes `{forOrder:true}` for real orders.
  - `wodFindAmphibiousShoreCrossing` searched around the WATER-side bias hex, so for islands further apart than the ring the start island's shore was never found. Now searches around the land-side hex.
  - Greedy water chains stall on concave coastlines; new bounded `wodWaterBfsPath` (open-water BFS, 7ms in-play ceiling) rescues stalled legs via `wodAmphibiousWaterLeg`. `findAmphibiousMarchPath` also validates the composed path actually reaches land targets (partial paths used to strand columns mid-ocean to drown), has a whole-compose 9ms deadline, and a 1.6s per-unit failure cooldown (uncooldowned re-composes caused 67ms frame gaps in march profiles).
  - `wodPathReachesTarget` used `wodHexStepDistance` (a step-type classifier, not a distance!) ? any path ending in the target's row/column counted as "arrived". Now requires true adjacency.
  - Ordered crossings are survivable: units actively marching with a destination drown at ?0.6%/s and move at 0.46? (stranded units keep ?2%/s and 0.28?). Esc guide updated.
  - Player corridors now set `_wodOrderIntoWater` when the route crosses open water so clamps/stuck logic treat water legs as legal.
- **Straight-through-mountains fixed**: `wodSamplePosOnWalkableTerrain` gave land units a 1.14?hexRadius neighbor tolerance even when the sampled hex was a MOUNTAIN ? straight-walking units slid clean through one-tile mountain walls along seams. Mountain samples now use the tight 0.6 tolerance. Verified: 90s march across a mountain map, 0 mountain contacts, and a forced raw straight target through a mountain wall does not tunnel.
- **Frozen units after failed orders fixed**: when the human corridor build failed (A* budget/blocked), `assignUnitMoveAlongWaypoints` returned false leaving orderTarget set but the unit motionless with a stale straight arrow. It now falls through to the generic leg assignment (terrain A* + greedy/amphibious hops), and the generic first-leg pathfind runs with the human over-budget allowance.
- **AI idle groups near frontline fixed**: `wodAiIssueSectorOrder` re-issued "hold" orders forever at sectors that never accumulated enough support (damaged units + stalemate = parked groups). Added an escalation valve: after ~22s of continuous holding the unit commits to the attack (`unit.aiHoldStartAt`). Watched 150s: max idle streak 0s, max hold streak 30s (was unbounded).
- Verified after all changes (headless Playwright, scripts in output/): water-march e2e (island?island order crosses and arrives), mountain-march e2e, AI idle watch, AI activity (idle + during player march), ship-land regression (0 land contacts), solo e2e, all 10 missions load/play (Isle Campaign badPlace:2 pre-exists on main), multiplayer host+guest e2e, 40s march profile (worst gap 83ms rare, typical ?33ms ? comparable to pre-change baseline), zero console errors everywhere.
- New test scripts: `output/test-water-march.cjs`, `output/test-mountain-march.cjs`, `output/test-ai-idle.cjs`, `output/shot-arrows.cjs` (static server on 127.0.0.1:8788).
- **Follow-up (same day): second AI idle deadlock closed** ? `wodAiIssueSectorOrder` stamped orders (holding=true, aiOrderUntil, sector key) even when `wodAiMoveUnitToward` failed to assign a target; since `assignUnitMoveAlongWaypoints` sets orderTarget before pathing, the unit ended up holding with orderTarget but NO target, its stuck/blocked timers never tick (they only grow while moving), and `wodAiShouldKeepCurrentOrder`'s holding branch kept it parked forever. Fixed twice over: stamps only apply when the move actually assigned a target, and the holding branch of `wodAiShouldKeepCurrentOrder` releases any unit with no target. Re-verified: AI idle watch (max idle 0s / max hold 35s), select+move e2e, no console errors. Note: `output/e2e-solo.cjs` select step is flaky because it clicks a unit without recentering the camera ? off-screen units make it report select=false; not a game bug.

## Mass-order arrows, Z-tips, AI concentration redesign, island edges pass (2026-07-07 late)
- **Mass move orders now assign ALL units in one frame** (was: arrows trickled in one at a time and late-queue units fell back to straight lines). `wodApplyPlayerMoveOrders` gained a group fast path: pathfind ONCE for a lead land unit near the selection centroid, then `wodAssignGroupCorridorClone` clones the corridor onto every other land unit with a start?end lerped offset (no per-unit A*). Formation offsets that land in water when the group clicked land shrink toward the group target until they hit land. Any lane clipping bad terrain self-heals via the existing 450ms budgeted blocked-repath. Verified: 19-unit select-all order ? 19 targets + 19 pathfollowing arrows immediately, apply ?30ms, 0 mountain contacts over a 45s march (`output/test-mass-order.cjs`).
- **Z-shaped arrow tips fixed**: two causes ? (1) `wodPlayerMarchArrowPoints` APPENDED `orderTarget` after the last path point even when nearly coincident, drawing a doubled-back tail that bent the head sideways; now replaces the last point when within ~1.25 tiles. (2) player corridors never ended at the exact click point (`wodWorldPointsFromHexMarchPath`'s third arg is startPt, not exactEnd ? the exact end was silently lost), so arrival triggered a fresh A* jog; new `wodApplyCorridorExactEnd` snaps the corridor's final point to the click and drops overshooting trail points.
- **Straight-line fallback hardened**: human-order A* wall ceiling 10?14ms (long map-crossing searches truncated and fell back to straight marches); queued orders that fail 10 retries now get a greedy terrain-following chain instead of being dropped; `findPathAroundTerrain(allowOverBudget)` sets `unit._wodPfRelaxUntil` which relaxes the amphibious-compose (9?26ms) and water-BFS (7?22ms) ceilings so long island-to-island orders complete; single-water-hex shore crossings (adjacent bays) accepted as zero-travel water legs.
- **AI redesign ? concentration of force**: the AI spread one unit per sector across up to 20 sectors, so it never assembled a winning attack.
  - `assignAiFormationOrders` now picks 1-2 **main effort** sectors (own mass nearby, weak enemy, city objectives) and masses ~62% of ready units on the nearest of them; the rest screen the wide front; city strikers unchanged.
  - Push gates loosened (`wodAiSectorFightStats`): canOverwhelm at power ratio ?1.02 (was 1.1), localOverrun ?1.3 ratio (was 1.45), neededSupport ceil(enemies?0.7/0.85) (was 0.85/0.92+1), push when enemies ?1.
  - Hold escalation valve 22s ? 14s; global under-power push penalty now only below 0.9 aggression (was 1.05).
  - **City defense outranks expansion**: new `wodAiThreatenedCities`/`wodAiPickThreatenedCityForUnit` (cached per pulse) divert nearby units to any own city with attackers and fewer defenders than enemies+2.
  - **Reinforcements spawn at the front**: AI spawn pulse orders candidate cities by distance to the owner's front focus instead of arbitrary order.
  - Verified: max idle streak 0s / max hold streak 15s over 150s watch; vs an idle player the AI now takes territory continuously and inflicts casualties from the first minute (`output/test-ai-idle.cjs`, `output/test-ai-activity.cjs`).
- **Island maps never touch map edges**: `wodForceIslandEdgeWaterBuffer` used only a RADIAL ring around the centroid ? its radius is the corner distance, so land could touch the middle of every edge. Added a rectangular min-distance-to-bounds buffer (hard water ? ~5 tiles from any edge, noise-wobbled waterline + sand feather inside), and the buffer re-runs at the END of terrain gen (speckle/river passes could re-add edge land). Verified: island/ring/archipelago ? 2 seeds each, 0 land cells in the outer 2 rings (`output/test-island-edges.cjs`).
- Perf after all changes: 40s march profile ? 4 rAF gaps >28ms (worst 33ms), update max 31ms, typical frames clean; solo e2e, missions (Isle badPlace:2 pre-exists), MP host+guest e2e all pass, zero console errors.

## Generated mission maps, sequential mission unlocks, mountain pathfind fix (2026-07-07 evening)
- **All 10 mission maps rebuilt on procedurally generated bases** (`scripts/generate-missions.js`): the in-game skirmish terrain algorithm (fbm noise heightmap/biomes from `map-gen-worker.js`) was ported into the mission builder as `procTerrainType` + `MapBuilder.generateBase(mapShape, seed, profile)`. Each mission now generates an organic base (island / archipelago / rectangle / mountain / forest pipelines, per-mission seeds & profiles) and then layers the HAND-DRAWN scenario details on top: mountain walls with carved gate passes (m03, m07 ring, m08 X-spurs, m09 coast range, m10 chains), rivers + bridges (m02, m06), staging islets / guaranteed isles (m01, m04, m09), forts, cities, ownership, armies, and events. New helpers: `smooth()` (same speckle pass as the worker), `edgeWaterBuffer` (islands never touch map edges), `ensureLand`/`ensureWater` (seat cities/carve straits), `landCorridor` (keep authored objectives land-connected). Exports carry the real `mapShape`. Verified: all 10 generate + pass builder sanity checks (spawns, connectivity), previews render organically, `output/preview-missions.cjs` screenshots reviewed.
- **Campaign removed, missions now a locked chain**: the placeholder Campaign button/panel is gone from Play vs AI. Missions unlock sequentially ? mission N needs mission N-1 completed, starting at mission 1. Completion persists in `simplewarsProgress.v1` under `missions.completed` (new progress field, merged safely for existing saves); `triggerCampaignVictory` records the active mission via `wodRecordMissionCompleted()`. The panel shows ?? Locked / ? Completed badges, auto-selects the first playable uncompleted mission, and blocks starting locked ones. Verified end-to-end: fresh save ? only mission 1 unlocked; win mission 1 (domination) ? persisted to localStorage, mission 2 unlocks, mission 3 stays locked (`output/test-mission-complete.cjs`).
- **Mountain pathfinding fixed** ("troops run at mountains and get stuck"):
  - **Root cause #1 ? wrong grid spacing on loaded maps**: `WOD.loadMapData` applied the size preset (`mapSize 40 ? hexRadius 18`) but mission/editor maps are authored at hexRadius 20 spacing (27px). Every `pixelToHex` lookup ? pathfinding, walkability, terrain clamps ? was skewed ~10% off-grid, so A* computed corridors against the wrong cells and units walked into real mountains and wedged there. Loaded maps now derive `hexRadius` from the data's actual hex spacing (`gameData._loadedMapHexRadius`), and `wodApplyMapSizePreset` never overrides it while a custom map is loaded.
  - **Root cause #2 ? truncated A* fell back to straight lines**: on long cross-wall orders the 14ms human A* ceiling truncated before finding the narrow pass, and `preparePathTarget` marked the raw click as a `pathPrepared` straight-line target forever. Now: `wodPickLandArmyMarchPath` threads `allowOverBudget` through its nested land A* and rescues failed human orders with a complete capped BFS (`wodLandBfsPath`, 26k nodes, relaxed 22ms ceiling via `_wodPfRelaxUntil`); the straight-line wait target while queued is replaced with a greedy mountain-avoiding hop.
  - **Blocked-repath escalation**: player-march terrain blocks now cool down full repaths (420ms) and slide around the face with `findGreedyLandStep`/`findLocalDetourHex` between attempts; units wedged ON a mountain hex slide back to the nearest walkable hex instead of being permanently clamp-locked. Group corridor clones (`wodAssignGroupCorridorClone`) now validate offset lanes and shrink offsets that land on mountains (or water on land marches) back toward the lead's proven lane. Queued-order greedy chain fallback raised 64 ? 140 steps.
  - Verified: mission 3 wall crossing ? 7 units, 0 mountain contacts, worst stall ~2 sim-s (was: permanent), steady progress through the passes (`output/test-mountain-march2.cjs`); skirmish island mass-march ? 19 units, 0 mountain contacts, no errors (`output/test-skirmish-smoke.cjs`); no console errors anywhere.

## Mountain-click edge cases, 30s victory countdowns, roguelike campaign (2026-07-07 night)
- **Mountain edge-case pathfinding** ("clicks close to mountains / thin passes still ram"):
  - `wodSamplePosOnWalkableTerrain` mountain rule rewritten as a cell-ownership test: a point on a mountain hex counts as walkable only if STRICTLY closer to a walkable neighbor's center ? interior mountain points always fail (walls stay solid) while the exact seam between two pass-flanking cells stays traversable.
  - `wodApplyCorridorExactEnd(corridor, exactEnd, unit)` now validates the final chord with `wodSegmentClearsTerrainForUnit` before snapping to the raw click ? wall-hugging clicks no longer cut mountain corners on the last leg.
  - Unit separation (`wodRunUnitSeparationSync` + sep-worker apply) is terrain-validated: crowds can no longer bulldoze idle units onto mountains/water, where they wedged.
  - Friendly-block arrivals: a player-march unit blocked by friends for >1.35s within ~5.5 tiles of its order target now completes in place (19 units can't all stand on the click point; the wait read as "stuck"). Amphibious shore queues excluded.
  - Verified: wall-hug + thin-pass click e2e ? 7/7 and 6/7 arrive, 0 mountain-hex samples, worst stall 1 sample (`output/test-mountain-clicks.cjs`); base wall-crossing march still PASS; 19-unit skirmish pure-movement march PASS.
- **30-second end countdowns**: objectives no longer end a match instantly. `checkCampaignEndConditions` runs every end condition (domination win, all-cities-lost, annihilation win/loss) through `wodTickEndCountdown` ? 30s of sim time with a pulsing top banner (`#wodEndCountdownBanner`, red for danger); the countdown cancels if the condition breaks (city retaken etc.). Applies to skirmish, missions, and campaign battles.
- **NEW: "The Ashen Front" roguelike campaign** (Play vs AI ? Campaign):
  - **War map**: seeded fbm-painted continent (same visual language as in-game maps) with 14 named regions in a branching node graph (north coast / central spine / southern fens routes converging on the enemy capital Concordia). Territory tint, frontline edges highlighted, alerts, HQ/capital markers.
  - **One persistent army**: 1500 starting requisition buys units (Infantry 200 / Marines 260 / Armor 480 / Warship 420, 24 cap). The roster deploys into every battle (default spawns replaced, `_campRosterId` tags); recruiting is BLOCKED mid-battle (fixed army). After each battle survivors sync back ? hp, manpower, tanks, xp, kills, veterancy ? and the dead are struck permanently. Field repairs cost points.
  - **Battles**: real matches on seeded procedural maps (per-node shape/size/difficulty: island, archipelago, mountain, forest, rectangle), story briefings via the mission popup, enemy economy scaled by node difficulty, domination + army-wipe defeat with the 30s countdowns. Quitting mid-battle = failed assault (survivors sync, no capture).
  - **Continuous simulated war** (`wodRogueWarTick`): per-turn requisition income (+80 holding the Ironworks), Concord counterattacks flag border regions (defend within a turn or lose them), flavor chronicle entries; the war log tells the run's story.
  - **Roguelike stakes**: HQ falls ? run over; army + points spent ? run over; capture Concordia ? campaign victory. New campaign = fresh seed, fresh war.
  - Verified end-to-end (`output/test-campaign.cjs`): buy 5 units ? persisted; launch node battle ? 5/5 roster deployed, recruit blocked, briefing shows; force win ? countdown ? victory ? node captured, +320 req, wounded unit's 40hp persisted, turn advanced, war-tick log entries, panel reopens. Panel screenshot reviewed (`output/shot-campaign.cjs`).
- Missions sequential-unlock regression PASS with the new countdown (`output/test-mission-complete.cjs`).

## Generated campaign worlds, terrain polish, AI unjam pass (2026-07-07 late night)
- **Campaign v2 ? fully generated worlds** (save key `simplewarsRogueCampaign.v2`):
  - Every campaign generates its own continent (seeded fbm with silhouette variety), regions, node graph, names (syllable pools themed by local terrain: Port/Isles, Pass/Fort, Forest, Fens, Wastes...), briefs, and garrisons. Node positions are adaptive poisson scatter on land; edges are 2-3 nearest neighbors with union-find connectivity repair; difficulty ramps HQ?capital; 1-2 industry regions.
  - **Pre-campaign settings screen** (no save = setup mode): difficulty (Easy/Normal/Hard/Brutal ? scales garrisons, AI economy, counterattack chance, rewards), campaign length (Short 9 / Standard 13 / Long 18 / Epic 24 regions with growing world size), starting requisition (default **3000 ? double the old army**), and a ?? regenerate button to reroll worlds until one looks right.
  - **Battle maps mirror the campaign map**: each node samples the terrain around it (water/mountain/forest/sand fractions) to pick its battle map shape (island/archipelago/mountain/forest/desert/rectangle) and size (40/60/80 by depth). Verified: node.shape === battle mapShape.
  - **Node intel on click**: difficulty stars, terrain + battlefield size, fuzzy-but-honest garrison intel ("5-9 infantry ? 1-3 armor ? 1-3 warships") ? the garrison actually fielded at battle start tops the AI up to the planned composition.
  - **Campaign stats strip**: battles (W-L), enemy troops killed, troops lost, units destroyed ? accumulated from real match stats every battle.
  - **One local save with Delete save** (replaces abandon); v1 saves are cleared.
- **Terrain generation quality** (in-game worker + inline pass + mission builder, all in sync):
  - Isolated 1-2 cell "ponds" wedged in land are filled with the dominant surrounding biome (was: only fully-surrounded cells).
  - Single-cell biomes with zero same-type neighbors dissolve into the local majority.
  - **Square island edges fixed**: the rectangular edge water buffer wobbled only ?0.8 tiles, drawing visibly straight coasts along all four sides; now two-octave noise with ?6.5-tile amplitude. Longest straight coast run measured 5-9 cells across seeds (was: whole map sides).
  - **No unclaimed land**: mission `claimNations` now assigns ALL land to the nearest nation (reach only limits water claims) ? all 10 missions regenerated, 0 unclaimed land cells in every file.
- **AI unjam pass** (from a full audit of the strategy/movement stack ? the "groups freeze" bug was several stacked deadlocks):
  - `wodAiShouldKeepCurrentOrder`: stuck/blocked release now runs BEFORE the far-march keep (rear column units were renewed forever); pair-sized rally clumps release at support?2; missing `aiOrderUntil` counts as expired; fresh orders get a 2.6s grace before stutter-release (prevented corridor-rebuild oscillation).
  - Hold-escalation clock no longer resets on FAILED push moves (hold?fail?hold cycle); `holding` clears on arrival; `wodAiMoveUnitToward` flags holding only on success.
  - **Ghost-through-friendlies**: AI units friend-jammed >3s pass through their own troops (like player marches always did), with separation push-back suspended while ghosting and a slow decay so the window persists through the squeeze.
  - **9s watchdog**: any AI unit with a far target that hasn't moved ~2 tiles in 9s (and isn't fighting) gets orders cleared, neighbors spread, and a ghost window ? catch-all for grind states the timers miss.
  - Fresh AI spawns march to the front focus immediately; formation pass sorts idle units first and scales per-frame throughput with the idle backlog.
  - Verified (`output/test-ai-active.cjs`, 210 sim-s, 2 AIs): max idle streak ~6 sim-s, worst frozen-with-far-target ~30 sim-s (was 86-144), AI inflicts thousands of casualties on an idle player. All regressions pass: mountain march, mountain clicks, skirmish smoke, campaign e2e, mission locking, terrain quality (0 ponds, 0 edge land, 0 unclaimed, straightest coast run ?9).

## March stutter deep fix (2026-06-17 thorough pass)
- Root causes confirmed: (1) `ensureUnitPixelOnWalkableHex` random jitter on every waypoint snap; (2) `blockedTimer`/`stuckTimer` replans every 0.25?1.15s causing detours/repath; (3) friendly blocking in formations with different waypoints; (4) pathfinding budget exhaustion mid-march; (5) terrain/fog canvas bakes during draw; (6) multi-step catch-up after frame hitches.
- Fixes: `wodIsPlayerMarchOrder` guard ? no terrain snap jitter, no replan/detour/stuck logic, no friendly blocking for player columns; immediate re-path after waypoint advance; PF budget boost + allowOverBudget for human pathfind; skip terrain/fog bakes entirely during player march with flush on march end; cap sim catch-up to 2 steps while marching.
- [x] Arrow/pathfinding/AI/map-edge fix pass (Group move orders now pre-seed every queued unit's march waypoints + arrow build so all arrows appear instantly instead of one at a time; player-order A* wall clock raised 10ms->26ms with more pump budget/retries so corridors stop failing into straight greedy lines; arrow corridor build retries raised 5->14; AI strategy overhauled: sector picking now correctly favors city objectives (sign bug fixed), force concentration via power-curve sector assignment, emergency defenders pulled back to cities under attack, faster strategy cadence (1.55s->1.15s), pushier fight thresholds, 2 factories per econ pulse, more forts/spawns; island-family maps now force an ocean guard band (outer 8% of grid) in both map-gen-worker.js and inline fallback so land can never touch the map edge. Verified via output/verify-fixes.mjs: 0 land cells on edge/outer band, 19/19 arrows drawable same tick as order, corridors pathfound, AI active, no console errors.)

## MP deselect vanish, rankings online, campaign roster pass (2026-07-08)
- **MP units disappearing on deselect**: frustum cull used auth `unit.x/y` while drawing used smoothed `_drawX/_drawY`. Selected units bypassed cull, so deselect could hide units that still looked on-screen (especially after host snaps). Cull now checks both positions; large snap jumps reset smooth coords; selection is revalidated after each client snap.
- **Rankings online/offline**: leaderboard cache no longer persists stale `online` flags; rankings tab refreshes friend presence; status shows `? Online` / `? Offline` with clearer styling; server normalizes player IDs to uppercase before the online map lookup.
- **Campaign**: Units recruit tab hidden during campaign battles (`wod-campaign-battle` HUD class); every win grants requisition (min 200, logged with new budget); roster rows show Veteran ? + XP and a dismiss button (50% refund); veteran flag syncs from XP threshold after battles.
- Verified: `output/test-campaign-fixes.cjs` ? buy/delete/veteran UI, win reward, HUD class, draw-pos cull logic all OK.

## Campaign region battle maps + aggressive AI (2026-07-08)
- **Region-zoomed battle maps**: launching a campaign battle now builds the map from the war-map cells around that node (`wodRogueBuildRegionBattleMap`) instead of a random similarly-shaped procgen map. City names come from the region's `towns` list (region name on the player's capital).
- **Split deployment**: roster units are distributed across owned cities (ships to nearby water) rather than stacked on one home city.
- **Aggressive campaign AI**: Concord pushes instead of camping hold lines (lower push threshold, deeper attack depth, more city strikers, faster strategy pulse via `_campaignAiAggressive`).
- Verified: `output/test-campaign-region.cjs` ? region terrain/names, 6 units split 3/3 across 2 cities, aggression flag set.

## Campaign roadblocks + difficulty-scaled points (2026-07-08)
- **Forced defenses**: counterattacks sometimes block further advances (`blockedAdvance`) until the player defends at least once; chance scales with difficulty (`blockChance`); capped at 5 per campaign (`forcedDefenses` / `WOD_ROGUE_MAX_FORCED_DEFENSES`).
- **Defense rewards**: successful defenses grant requisition like victories (extra +140 base), scaled by `rewardMult`.
- **Starting points by difficulty**: Easy 3600 / Normal 4500 / Hard 5600 / Brutal 7000; custom starting-requisition input removed.
- Verified: `output/test-campaign-blocks.cjs` ? start points, roadblock lock, defense playable, cap 5, defense reward > attack on hard.

## Campaign farms + richer battle economy (2026-07-08)
- **More starting resources**: campaign requisition raised (Easy 3600 ? Brutal 7000); campaign battles open with **$12000** and **8000 MP** for structures (army still fixed).
- **Farm building** ($1200): boosts manpower growth (+5 raw); build UI, icons, AI, capture clear, MP sync.
- **Factory cash bump**: factory money bonus 10 ? 15 raw (+50%).
- Verified: `output/test-farm-econ.cjs` ? farm build, factory income, start points, battle treasury.

## Campaign defense hold + surrender (2026-07-08)
- **Units lost** shown on the campaign stats strip (plus units recruited); battle summary notes units lost this fight and campaign total.
- **Defense battles**: win by surviving a difficulty-scaled hold (Easy 90s / Normal 120s / Hard 180s / Brutal 240s) **or** capturing all enemy cities; hold timer banner during the fight.
- **Surrender**: "Delete save" replaced with **Surrender**; always confirms that the save will be deleted.
- Verified: `output/test-defense-surrender.cjs`.

## Campaign units killed + roster rename (2026-07-08)
- **Units killed** added beside units lost on the campaign stats strip (enemy troop kills remain); battles accumulate `playerUnitsKilled` formation kills.
- **Rename**: campaign roster has a rename button; in-battle renames sync back to the persistent roster.
- Verified: `output/test-units-killed-rename.cjs`.

## Fix achievement/gold cloud wipe (2026-07-08)
- **Root cause**: cloud profile apply replaced local progress and dropped `achievementGoldGranted` / missions / gold, so badges vanished and gold notifications re-fired every session.
- **Client**: `wodApplyServerProfile` now merges lifetime/MP/gold/skins/achievements/missions/grants monotonically; boot pushes local progress before trusting cloud; shop spends still apply authoritative gold.
- **Server**: `syncProgress` stores and merges gold, achievements, achievement gold grants, missions, owned skins, and MP stats without regressing.
- Returning players with a wiped grant map are reconciled (mark already-met badges paid, no re-grant spam).
- Verified: `output/test-progress-persist.cjs`, `output/test-server-progress-persist.cjs`.

## AI farms + smarter river bridges (2026-07-08)
- **Farms**: AI builds farms earlier (lighter cash reserve than factories/harbors) so manpower income comes online.
- **Bridges**: AI can span rivers toward enemy/neutral shores when units are nearby and the crossing helps the front focus ? not only own-to-own channels.
- **Anti-spam**: tighter per-faction bridge cap (max 3), ~95s cooldown, strong score penalty near existing bridges, cash cushion before building.
- Verified: `output/test-ai-farm-bridge.cjs`.

## Fix pathPrepared crash on move orders (2026-07-08)
- **Bug**: `wodHexPathToWorldWaypoints` could return `[]` (empty bridge corridors), then callers did `unit.target = unit.path.shift()` and set `pathPrepared` on `undefined` ? crash on issue/replan move.
- **Fix**: always emit a fallback waypoint from hex conversion; add `wodTakeNextPathTarget` and use it everywhere that shifts the next path node (assign, replan, convoy init, path advance, marine greedy chain).
- Verified: Playwright unit checks for empty/null path + bridge waypoint conversion; no `pathPrepared` page errors.

## Fix bridge/water order arrows + ship land orders (2026-07-09)
- **Arrows**: bridge deck corridors now sweep in travel direction (was always min?max, causing triangular loops); caps for water?bridge; polyline cleaner drops reverse kinks/collinear midpoints; arrow seed no longer appends straight chords across remaining waypoints.
- **Ships**: open water only (not bridge deck/land); `wodResolveShipMarchHex` snaps land clicks to nearest open water; issue/replan/prepare fallbacks refuse land targets.

## Fix bridge pathing + ships stay still on land orders (2026-07-09)
- **Bridge movement**: stop kink-cleaning movement corridors (that collapsed deck paths to ~2 points); portal-bridge rescue on first order + order-queue fallback; flag `_wodRouteUsesBridge` so shore-to-deck clamps allow transit; longer human bridge search budget (22ms).
- **Ships in mixed groups**: land clicks return null (tiny shoreline fudge only) so ocean units stay put while land units march; stroke orders use the same rule.

## Group bridge crossings funnel onto the deck (2026-07-09)
- Group corridor clones used to keep formation lateral offsets across bridges, so units marched in parallel into the river.
- Bridge segments of the lead path now collapse offsets to the lead deck lane (approach funnel + exit ease-out); followers inherit `_wodRouteUsesBridge`.

## Drawn formation/stroke river crossings (2026-07-09)
- Drawn strokes and line-formation slots offset units into open water beside bridges, which became amphibious `intoWater` orders.
- Land stroke/formation waypoints now snap to bridge deck or shore (never open water), collapse lateral offset across the crossing, and concatenated order pathfinding re-snaps mid-stroke water samples the same way.

## Group bridge pathing: pathfind to join, then ride lead deck (2026-07-09)
- Offset corridor clones for 3+ unit groups sent flank units straight through open water toward the first deck waypoint (`pathPrepared` chords, no follower pathfind).
- Bridge group orders now use `wodAssignGroupBridgeCorridor`: each follower pathfinds to the lead's bridge join, then follows the lead deck/exit lane; plain offset clones refuse bridge routes and blocked chords; queued followers reuse the same join assignment.

## Stop mid-bridge freezes on group crossings (2026-07-09)
- Flank formation offsets were becoming `orderTarget` mid-deck, truncating corridors via exact-end snap; rear units also cleared orders when friend-blocked on the deck.
- Bridge followers now share the lead's far-shore destination, refuse mid-deck exact-end snaps, keep marching while on deck, and skip friend-block early-arrival / greedy off-deck hops during bridge transit.

## Bridge arrows, backtracking, shore formation accuracy (2026-07-09)
- **Backtrack / messy arrows**: `wodHexPathToWorldWaypoints` truncated to the closest waypoint before applying `exactEnd` (was replacing only the last point after a full deck sweep); approach paths strip trailing bridge hexes; on-deck joins are forward-only along the lead lane; `wodStripReversePathKinks` cleans approach-to-deck stitches for movement + arrows.
- **Shore formations**: land clicks near bridges no longer snap onto the deck (`wodBridgeHexAtPoint` radius / distant-bridge pull); only water/deck samples snap. `wodStrokeCrossesOpenWater` requires land-river-land so shore-parallel strokes don't funnel onto the bridge.

## AI bridge crossings (2026-07-09)
- Enemy land marches now use the same dense corridor path (exact-end + kink strip) when bridges exist, get higher bridge-search / PF budgets, and rescue via `wodTryPortalBridgeMarchPath` in `preparePathTarget`.
- AI no longer arrives mid-deck when friend-blocked, prefers advancing the deck path when blocked on a bridge, and snaps river-jitter targets onto land/deck instead of `intoWater` orders.
- Shore hexes are no longer remapped onto nearby bridges in `findPathAroundTerrain` / `getNearestWalkableHexForUnit` (that turned shore-to-shore into deck stubs / water chords). Bridge-start hex paths densify the full deck run in `wodHexPathToWorldWaypoints`.

## Land formations near bridges stay on land (2026-07-09)
- Same-shore / same-hex land orders no longer trigger bridge rescue (portal paths that looped onto the deck and back).
- Bridge funnel detection and land-march resolve ignore radius false-positives from `wodBridgeHexAtPoint`; formation/shift slots that sit on water beside a shore snap to nearby land instead of the deck.

## Store missions + D-Day Normandy (2026-07-09)
- **Shop**: renamed Maps tab ? **Missions**; sells purchasable mission packs from `custom-maps/` (200g D-Day).
- **Missions panel**: **Campaign** / **Store** tabs. Store lists owned shop missions; one-shots are spent on victory (`storeMissions.spent`), mini-campaign packs stay replayable.
- **D-Day: Normandy** (`custom-maps/normandy-dday.json`): historical beaches (Utah?Sword), Cherbourg/Caen/Bayeux/etc., Allied/German OOB labels, Atlantic Wall forts, 7 scripted events/popups (Overlord briefing, H-Hour, Bloody Omaha, airborne, 21st Panzer, Mulberry, Cherbourg).
- Generator: `node scripts/generate-store-missions.js` (also `npm run missions:store`).
- Cloud progress syncs `storeMissions` completed/spent via `server/profiles.js`.

## In-game dev menu (2026-07-09)
- Press **backtick three times** within ~900ms anytime to toggle `#wodDevMenu`.
- Shows live FPS (during PLAYING), frame ms, state/gold/units/hexes/simTick, recent function activity (`gameLoop` / `update` / `draw` / cheats), and cheat buttons (+gold, money, manpower, heal, spawn, force win, pause, unlock store missions).
- Esc closes the panel. Test: `node scripts/test-dev-menu.js`.

## Normandy D-Day accuracy pass (2026-07-09)
- Regenerated `custom-maps/normandy-dday.json` with Cotentin peninsula (Cherbourg tip north), Baie du Grand Vey gap, Utah on east Cotentin, Pointe du Hoc cliffs, Omaha bluffs, Gold/Juno/Sword sand belt, Carentan marsh, Vire/Orne rivers.
- Towns: Portsmouth, Southampton, Plymouth, Cherbourg, Valognes, Sainte-M�re-�glise, Carentan, Isigny-sur-Mer, Saint-L�, Bayeux, Caen, Ouistreham, Falaise.
- OOB labels: 4th/1st/29th/50th/3rd Cdn/3rd Inf, 82nd/101st/6th Airborne, Rangers, DD tanks, Force U/O/G/J/S + Warspite/Texas/Belfast/etc.; German 709th/91st/243rd/352nd/716th, 21st Panzer, Cherbourg Festung, LXXXIV Corps.
- Ownership fix so England seeds no longer claim the Cotentin; beach sand left contested for assault landings.
- 13 cities, 18 forts, 89 units, 7 events. Rebuild: `node scripts/generate-store-missions.js`.

## Normandy continents + offshore assault (2026-07-09)
- Map is no longer an island: contiguous **England** (north) and **France** (south) with a continuous **English Channel** belt; Cotentin still juts north.
- Assault infantry/armor start **afloat in the Channel** just off Utah?Sword; airborne stay inland; **no German navy**.
- Events retimed to Neptune: briefing, shore bombardment, H-Hour, Bloody Omaha, airborne link-up, 21st Panzer, Mulberry, Cherbourg.
- Towns now include Dover; 14 cities, 8 events. Rebuild: `node scripts/generate-store-missions.js`.

## Normandy Channel seal + no player auto-orders (2026-07-09)
- Hard Channel seal: England `r<=-30`, Cotentin tip capped at `r=-14`, mid-belt flooded so **France never land-connects to Britain**.
- Assault waves mid-Channel only (`r<=-10`); **no Allied troops on beach sand**. German infantry **man Atlantic Wall forts**.
- Removed all player `pathOrders` from Normandy events; engine `wodMissionApplyPathOrder` also skips owner 1 / local player.
- Rebuild: `node scripts/generate-store-missions.js`.

## Normandy England restore + nearshore assault (2026-07-09)
- Bug: Cotentin tip-cap flooded **all** land north of `r=-14`, wiping England. Cap is now Cotentin q-range only; England re-asserted at `r<=-18` (~5800 land hexes) with ports closer to the Channel.
- West France: Atlantic bite west of Cotentin; Cotentin tip ~`r=-10`; Channel still open (no land bridge).
- Assault waves sit just offshore (`r` ~ `-3..-7`); still **zero** Allies on beach sand.
- Rebuild: `node scripts/generate-store-missions.js`.

## Normandy thin England + Brittany west (2026-07-09)
- England shrunk to a Channel-facing strip (`r` -26..-18, ~1300 land hexes); far north is open sea.
- Left side of map is Brittany/western France (Saint-Malo, Rennes) instead of empty Atlantic.
- Assault/navy shifted east of Cotentin onto open water (`q` ? -26); zero Allies on land/sand.
- Rebuild: `node scripts/generate-store-missions.js`.

## Water?land pathing + England/rivers polish (2026-07-09)
- Fix: land armies standing on open water can path to land on the first order (embark flags + amphib compose). No more ?nudge in water first? workaround.
- England: organic Channel strip with Solent bite + Isle of Wight, downs/forest patches (not a flat slab).
- Rivers re-stamped after Channel seal: Vire, Douve, Orne (to Ouistreham), Seulles.
- Rebuild: `node scripts/generate-store-missions.js`.

## Large-army performance pass (2026-07-09)
- Merged combat proximity + movement slowdown into one spatial query per unit/tick.
- Pooled hex-ring scratch buffers; staggered idle territory claims; swap-and-pop deaths.
- Rebuild spatial grid after movement for accurate separation; cache AI frontline hex lists.
- Spatialize threat/foreign-unit distance queries; single-pass unit draw ordering.
- Gameplay unchanged ? same combat/movement/claims, cheaper calculations.

## Campaign economy / defense / deployment pass (2026-07-09)
- Turn income: **+50 requisition per controlled territory** (replaces flat +60 and industry +80).
- Defense hold timer: **5:00** on all difficulties (`defenseHoldSec: 300`).
- Defense streak cap: never more than **2 defenses in a row** (`consecutiveDefenses`); an attack battle resets the streak.
- Pre-battle **deployment phase**: after briefing, game stays paused; player places roster units anywhere in friendly territory (right-click / formation / stroke), then **Begin battle**.
- Campaign HUD shows `+/turn` income from held regions; `render_game_to_text` includes deploy/hold campaign fields.

## Deploy formations + butter-smooth movement (2026-07-09)
- Deployment now places along **drawn formation lines** and **stroke paths** (not just a grid at the click endpoint).
- Marching units use draw interpolation again (`wodUnitSmoothDrawXY` no longer hard-snaps while `target` is set).
- Movement hitch fixes: tighter dt caps while marching, smaller sim substeps, fewer waypoint snaps per tick, reset frame clock on unpause/popup resume, more PF budget on large maps, lighter terrain bake during marches.

## Defeat timer / surrender GUI / research / mobile (2026-07-09)
- End-condition countdown shortened to **15 seconds** (`WOD_END_COUNTDOWN_SECONDS`).
- Campaign + in-game surrender use a styled `#wodConfirmDlg` instead of native `confirm()`.
- Campaign panel stacks on mobile; Play vs AI / setup Back buttons centered via `.wod-panel-footer` / `.wod-setup-actions`.
- Campaign **Research** tree (requisition): War Chest (+battle money), Manpower Reserves (+battle MP), Supply Lines (+req/region). 3 levels each, costly but lasting.

## Campaign research popup + mobile centering (2026-07-09)
- Research moved into a designed popup (`#wodCampResearchDlg`); side-panel **Research** button replaces Surrender in the actions row.
- Campaign footer: **Back** bottom-left, **Surrender** bottom-right.
- Missions / Play vs AI / Skirmish Start+Back actions centered for mobile (`.wod-panel-footer`, `.wod-setup-actions`, `.wod-map-lib-actions`).

## Mobile button overflow fix (2026-07-09)
- Global mobile `.menu-btn { width: 88vw }` was left-shifting Play vs AI buttons and clipping campaign Back/Surrender.
- Play vs AI buttons now fill a centered column (`max-width: 280px`); campaign footer buttons are equal flex halves with `width: 100%` and no viewport-width overflow.

## Campaign map flash + surrender dialog polish (2026-07-09)
- Campaign war map caches terrain/tint/edges offscreen; taps only blit the cache and redraw node markers (no full cell rebuild / mobile flash).
- Map clicks update selection + node info without rebuilding the whole campaign panel.
- Surrender confirm dialog is centered with equal-width Cancel/Confirm actions on PC and mobile.

## Mobile Play vs AI / campaign Back centering (2026-07-09)
- `#playModePanel` uses `justify-content: center` on mobile so the menu sits mid-screen instead of the top.
- Campaign footer stacks and centers Back (and Surrender) as full-width centered buttons on mobile.

## Sharper UI + mobile unit sheet (2026-07-10)
- Game-wide dark charcoal / thin gold theme: CSS vars, sharper menu/build/speed buttons, panels, resource chips.
- Mobile unit selection redesigned to match reference: circular gold-ring emblem, status dot, personnel/condition/terrain KPI boxes, Move/Waypoint/Formation/More order row, circular expand toggle.
- More toggles effects/service details on mobile; desktop keeps full detail visible.
- Terrain polish: richer forest crowns, mountain/hill rock peaks, shore foam accents, higher-contrast terrain palette.
- Mobile dock active tabs use stronger gold chrome.

## NATO counters + terrain/UI match pass (2026-07-10)
- NATO map counters are solid faction-colored chips with black symbology and corner-bracket selection (not dashed rings).
- Removed dotted ocean shore strokes; shallow water is a soft continuous rim only. Diplomacy borders skip water hexes.
- Terrain: mottled surface detail, denser round tree clusters, browner mountain peaks, updated palette.
- Mobile unit sheet head is identity + KPI row; bottom dock active tab is solid gold with dark icon/label.

### TODOs / next agent
- Optional: more store packs (Market Garden, Bulge) using the same generator pattern.
- Optional: re-enable skirmish Shop Mission setup button if non-mission map packs return.
- Visual polish: Normandy map is large (~72 radius / ~16k hexes); consider a tighter Cotentin crop if load times matter on slow devices.
- Optional: sample attract-mode FPS when menu battle is running under `menuAttractMode`.
- Optional: paint beach-sector labels (Utah/Omaha/Gold/Juno/Sword) as map markers if the engine gains label entities.
- Optional: Playwright smoke for campaign deploy banner + Begin battle resume.
