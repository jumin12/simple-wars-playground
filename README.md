# Simple Wars (playground)

Browser strategy game with optional **host-authoritative multiplayer** (up to **4** human slots per room, same cap as faction setup). The **host** runs the full simulation; other players send commands and receive snapshots over a small Node **WebSocket** relay.

## Run locally

**Battle report** has responsive Economy, Forces, Combat and Players tabs. Faction cards show controlled land tiles and land share (excluding all water), composition and personnel, economy and infrastructure, supply/readiness, production queues, spending, combat damage, recovery, casualties, and territory gained/lost. Finished-match reports include all faction comparisons. Authoritative multiplayer snapshots preserve match counters for each seat. Mobilized-unit counts exclude opening armies and editor placements.

**Fog of war** uses independent faction knowledge with shared allied sight. Friendly territory reveals two tiles beyond its edge; infantry/marines see five tiles, armor four, warships six, transports five and convoys three. Towns see five tiles and forts four. Moving and rear-area units reveal ground continuously, with explored terrain retained. AI scouts explore unknown frontiers and coasts, and all threat/target/assault/fort decisions use visible troops and discovered, last-seen towns. Live enemy reports hide reserves, money, production and losses under fog; land totals remain public. Full reports unlock at match end.

Atlas HD uses 512px procedural mountain/hill relief with densely branched ridges, directional lighting, erosion grain, rounded biome junctions and radial boundary blending. Its terrain remains aligned with the same rounded cell topology and narrow-passage rules as the classic map.

Lifetime stats save immediately at the end of every played match, including surrenders, scenario/campaign defeats and mid-match menu exits. Match results show completed matches, wins, losses and surrenders separately from faction eliminations. Combat, production and peak totals retain their actual battle era; multiplayer snapshots credit each human seat and preserve delta watermarks across reconnects. Frequent combat cannot postpone the periodic save indefinitely, and browser close events flush pending progress. Opening armies and menu demo battles are excluded from trained-unit/combat totals.

Warships now have 300 HP, matching armor; marines take normal combat damage afloat and show the blue embarkment badge while remaining exempt from water attrition. Land and naval units exchange fire within weapon range. Healing indicators show only actual recovery and disappear at full strength.

**Transports** are harbor-built boats: $2,000 / 1,000 MP, 18 seconds, 50 HP, 500 crew and half infantry firepower. Each carries one infantry, marine or armor unit without passenger combat or attrition. Select a land unit and right-click a friendly empty transport, or press **Board transport**; the pair meets at a reachable shore. Transports also rescue troops already afloat. Select a loaded transport and right-click land, or press **Unload**, to land at a clear shore; blocked landings wait. Sinking loses the passenger. Cargo preserves its identity, health, XP, upkeep and campaign roster record. Controls work in multiplayer and on touch devices; all eras have transport art, with editor/scenario support and a help card.

Ordinary AI ground troops use dry routes, bridges or purpose-built ferries for water assaults; marines and escorts lead amphibious operations. Explicit player water orders preserve the sea destination and use useful dry approaches. Body separation applies immediately to both armies, paid production waits for free spawn space, and AI town sweeps keep capturing remaining urban cells.

The free **Atlas HD** skin is available under **Shop → Map skins**, with code-drawn aerial terrain, relief, forests, shore shallows, towns and era-aware units. Both skins use the same rounded cell footprints with complete terrain coverage, preserving narrow land passages without phantom diagonal bridges.

All unit types move 20% faster. Cities and territory layers start disabled in new matches and the map editor; players can enable either layer manually.

Territory capture uses a fixed footprint per unit type for both armies: one tile ring for infantry/marines, two for armor. Water cannot be captured, so ships do not claim territory. Empty ground grants no extra ring; enemy occupation and defended adjacent cells still block claims.

The Shop has seven standalone historical missions (D-Day/Normandy, Kursk and Midway at 200g; Thermopylae, Hastings, Austerlitz and El Alamein at 150g) plus three ordered campaign packs: **Berlin 1945** (7 stages, 350g), **Normandy: D-Day to Cherbourg** (5 stages, 300g), and **Market Garden: Bridges and Withdrawal** (5 stages, 300g). Purchase a pack once, then win each stage in **Missions → Store** to unlock the next. Progress saves; defeats and surrenders allow retries, and unlocked pack stages remain replayable. The victory screen offers the next stage’s preview. Standalone missions retain their one-shot entitlement. Mission-specific objectives include complete town-sector capture, timed defense, naval victory and evacuation using transports. Dates, historical context, adaptation notes and references appear in the previews. Historical missions supply their own era visuals/audio without unlocking cosmetic skins. Geography, unit roles and timing are scaled for RTS play; sources and design notes are in [custom-maps/HISTORICAL-NOTES.md](custom-maps/HISTORICAL-NOTES.md). Regenerate all 24 scenarios with `npm run missions:store`; the generator validates empty towns, minimum spacing, non-overlapping units and supplied ordinary land formations before writing files.

The editor imports and exports map/scenario JSON and saves scenarios to its library, preserving the era, grid scale, units, roads, bridges, forts, alliances, faction resources, victory conditions and events. Event-free scenarios and zero-second events are supported. Loading validates the file before replacing the current map, and exported/library snapshots remain independent of later edits. Authored eras and starting resources carry into play. Select a unit and click its small **×** to delete it, or use Delete/Backspace; undo and redo restore deletions.

Opening forces are halved, with about 20% near the front and 80% around towns. Armor always starts in the rear. Every town starts without factories, harbors or farms in campaign, skirmish and multiplayer, including AI, neutral and custom-map towns. Rejoining a match preserves buildings constructed during play. All buildings (including forts and bridges) take 60 seconds; infantry mobilize in 15 seconds, transports in 18, marines in 20, heavy units in 25 and warships in 30. Campaign reinforcements use their unit type’s timer. A small circular countdown marks each production site, followed by the unit arrival animation. Each town handles one order at a time. Pausing stops production, and siege pauses town production.

Generated starts solve faction land quotas using gently warped distance fields, avoiding terrain-driven rings and winding borders. Primary faction seeds and first town candidates share the largest walkable landmass; procedural retries preserve compact regions instead of forcing capitals through another faction. Constrained seeds retry deterministically, town footprints use isolated seeded randomness, and supplied rear deployment space is checked. Reusing an input seed reproduces terrain, ownership, towns and starting deployment, with equal faction land and town totals within each match. Narrow mountain passes supply disconnected starting land within each political region while preserving its ownership and overall mountain terrain.

Before publishing a generated preview or deploying armies, a final quality gate rejects disconnected claims on the same landmass, enclosed ownership pockets, sustained one-cell border tendrils, excessive frontier distortion/winding, and unsupplied inhabited land. Generation retries fresh deterministic terrain until quality and equal land/town checks pass; it never accepts a relaxed layout after a retry cap. The loading UI yields between attempts. Terrain density limits account for filled rectangle presets and scattered archipelagos, while genuine separate islands remain valid. Skirmish, campaign and multiplayer share this gate; neutral-city editor requests do not require faction borders.

Townless offshore islands retain a single owner. Exact area balancing protects multi-cell islands and adjusts supplied mainland frontiers instead. Starting-map validation also rejects tiny coastal claims, split small islands, visible closed land border loops, folded frontlines and local hairpins. These checks use the same exact border graph as setup/lobby previews and gameplay; failed candidates retry before publication, retaining equal land/town counts and supplied opening troops.

Generated town centers stay at least eight cells apart and their urban footprints cannot touch. Constrained layouts regenerate instead of relaxing this spacing. Player and AI production share a siege lock: combat, hostile troops on the urban footprint, or hostile control of any town cells prevents recruitment and pauses paid production/reinforcement queues until cleared. Queued progress is preserved.

Oceans, rivers and lakes stay neutral and never count as territory, income or political border cells. Only ships can heal in open water; marines cannot. Every unit in open water except ships and marines is out of supply and cannot heal. After five full uninterrupted seconds in water it takes 3.5% maximum HP attrition per second. Returning to dry land or a completed bridge resets the water timer; pausing does not advance it. This applies equally to both armies, with or without move orders, regardless of nearby friendly towns or forts. Completed bridge decks count as land. Water attrition uses the supply pass once rather than stacking separate drowning damage. Ordinary units favor dry detours and existing bridges; entering water requires an explicit order, a proven lack of land access, or a very large shortcut after accounting for water exposure. Shore transition waypoints survive smoothing, and incremental shared land-connectivity searches retain progress between bounded AI path attempts. AI bridge planning includes armies waiting at internal rivers, handles one-cell channels, preserves recruitment funds and avoids duplicate pending bridges.

Use **Ctrl + 0–9** to save selected units to a group; press its number or click the HUD group to recall it. Campaign troops can be dragged to reorder or dismissed with an undo option. The first half deploys at battle start. Unit buttons call the remaining reserves as timed reinforcements without charging resources again; names, wounds and experience persist. Undeployed reserves remain safe between battles.

Town, building, land and convoy cash income is doubled. Command funding adds $12/s while a faction owns a town; manpower growth supports repeat recruitment. AI factions share these rates, prioritize recruits below ten field units, budget for future upkeep, and build farms, factories, harbors and spaced forts according to need. Town guards and front defenders protect the army while most ready infantry join offense. Tanks assemble with nearby infantry around reachable town objectives; reinforcements and routine planning preserve those assaults. Marines and ships can rally at a friendly shore, cross to a shared beach behind the front, and land with naval support. Successful attacks continue to the next town. AI supply checks cover whole connected regions, protect threatened one- and two-tile corridors, and coordinate large-pocket breakouts with outside relief. Limited response groups intercept territory incursions away from towns and then resume their original missions. Defenders choose reachable terrain using their unit type’s combat bonuses. Forts require nearby land troops and a buffer of two clear tiles from hostile territory; construction sites and completed forts retain guards.

Money and manpower purchase requirements are doubled. Infantry and marines cost $1,000 / 2,000 MP; heavy units cost $8,000 / 2,000 MP; ships cost $7,600 / 10,000 MP. Factories cost $4,000, harbors $2,000, farms $2,400, forts $3,000 and bridges $4,000. Campaign recruitment, research and field repairs also cost twice as much. Existing paid reserves remain free to call in; unit strength and income/upkeep rates are unchanged.

Group controls stay above expanded structures/unit panels on desktop and mobile. Infantry and armor preserve necessary turns through one-cell gaps, recover from wall-edge stalls, and use tighter friendly spacing in narrow lanes. Columns keep moving through narrow pass exits instead of stopping early under group-arrival rules. Enemy units and solid terrain still block movement. Empty inland one- or two-cell political remnants and small coastal cutoffs are absorbed during live host/solo simulation; towns, troops, forts, building sites and allies are preserved. Lakes, rivers and seas follow their nearest current land banks, including after shoreline captures, while retaining water terrain and naval movement. Frontlines use broad, bounded smoothing over the exact shared-edge graph, retaining real junctions and separate defended enclaves in game and map previews. Frontlines end at open-ocean shores in setup/lobby previews and gameplay; lake boundaries and genuine land enclaves remain visible. Initial balancing treats mountain connectivity separately from walkable supply and reserves offshore reassignment for actual townless shores, preventing isolated inland peaks from becoming ownership pockets.

AI starts an infantry in each town and reserves standing town garrisons before assigning assaults. Guards hold town centers, receive replacements when available, and remain exempt from routine outside relief orders. Vacant garrisons prioritize infantry recruitment over building investment. A slightly larger share of remaining infantry defends the front while combined-arms and coastal assault groups continue their missions.

Clear movement routes follow terrain-validated straight segments while retaining necessary corners and bridge waypoints. Friendly units sidestep congestion and can separate from overlapping positions; hostile collisions stay solid. Town assaults distribute infantry, armor, flankers and landed marines across remaining hostile urban cells, retarget cells as they fall, and finish the entire footprint before the town changes ownership.

The main-menu battle and terrain buffers remain cached during matches. Final stats trigger incremental preparation of the menu world while preserving the finished battle and its statistics. Returning to the menu adopts the preloaded terrain buffers and resumes the battle without regenerating its map.

Every friendly town supplies its land-connected friendly territory, including captured enemy towns and allied towns. A surrounded pocket containing a friendly town stays supplied, takes no encirclement attrition and can heal when safe. Capturing a town or reopening a cardinal land corridor restores supply immediately, even if old encirclement flags remain during the incremental scan. Pockets without a friendly town connection lose land supply; map edges, neutral borders and diagonal contacts do not replace that route. Only marines receive ocean/river supply in townless coastal pockets. Forts only reduce unsupplied attrition, and active combat can pause town production independently of supply.

Player and enemy armies share the same encirclement effects and attrition. A unit standing on hostile-owned ground checks its own faction's nearby land supply, so the hostile town cannot supply it. Heavy marching loads do not stop the incremental supply scan.

Every engaged unit pair has its own independently positioned, phase-offset combat channel; reciprocal fire is deduplicated and the total mix is controlled as more fights begin. Partner IDs are shared with multiplayer clients. Visible battles have distant, era-specific effects (ancient, medieval, Napoleonic and modern) that remain quietly audible at every supported zoom. Sixty mastered ElevenLabs Sound Effects v3 recordings provide two crossfading 24-second battle variations per era, separate work/mobilization/completion cues, twenty short unit-selection acknowledgements, and twenty distinct movement-order cues. Selection uses era- and unit-specific equipment sounds, alternates infantry variations, and plays once per click, touch/drag selection or group recall, including while paused. Ancient and medieval combat explicitly excludes firearms, gunpowder, explosions, engines and electronics. Era changes stop previous effects immediately; unknown eras never fall back to modern audio. Distance filtering and a gentle temporary music dip preserve detail under the soundtrack; offscreen and fog-hidden battles remain silent. Move orders play one era- and unit-specific cue per action, including formations, drawn paths and multiplayer commands, with a brief music dip for clarity. Game SFX defaults to 100%; deliberate saved volume and mute settings are retained. Effects have independent saved volume/mute controls in Settings. Shipped audio is local: no API key or network generation is needed to play. To regenerate assets, set `ELEVENLABS_API_KEY` in your shell and run `node scripts/generate-battle-audio.js`; prompts and provenance are in `sounds/sfx/manifest.json`. Use `--master-only` to remaster cached sources without API calls, and `node scripts/verify-sound-bank.js` to verify duration, loudness and peak headroom.

Music credits are generated directly from the playback catalog of 25 shipped recordings, with recording credits, source/license links and change notices. Update `sounds/music/playlist.json`, then run `npm run music:credits` to refresh the offline source/license documents; `npm run music:credits:check` verifies their parity and checks that every packaged music file is listed exactly once.

1. **Game (static):** open `index.html` in a modern browser (double-click, or serve the folder with any static server).

2. **Multiplayer relay:**

   ```bash
   cd server
   npm install
   npm start
   ```

   Default WebSocket URL: `ws://localhost:8080` (or set `window.WOD_MP_WS_URL` before `multiplayer-client.js` loads).  
   On **`simple-wars-live.onrender.com`**, the game injects **`wss://simple-wars.onrender.com`** and connects when you open **Multiplayer** — no manual URL.

3. **Flow:** open **Multiplayer** (wait until status shows connected) → browse **Open games** or **Create lobby**. Optional lobby password; host sets **Map & rules** (same screen as **Play vs AI**), then **Launch match**. Clients stay in sync via snapshots.

## Production on Render

You need **two** services. They get **two different URLs**:

| Service | Example URL | Used for |
|--------|-------------|----------|
| **Static Site** | `https://simple-wars-live.onrender.com` | Opening the game in the browser |
| **Web Service (Node)** | `https://simple-wars.onrender.com` | WebSocket relay — game uses **`wss://simple-wars.onrender.com`** (wired automatically on the live static host) |

Do **not** set `WOD_MP_WS_URL` to your static `https://` link. Browsers need **`wss://`** to the **Node** service (same host as the Web Service, scheme `wss`).

### 1. Web Service (multiplayer relay)

In the service settings:

- **Root Directory:** `server` (recommended) — then **Build:** `npm install`, **Start:** `npm start`.

**If you leave Root Directory blank** (repo root), Render will use the root `package.json`: it runs `npm install` (which triggers `postinstall` → installs `server/`) and `npm start` → `node server/index.js`.

If you see `ENOENT ... package.json` under `/opt/render/project/src/`, you have **Root Directory** set to `src` or a wrong folder. Clear it, set it to `server`, or use repo root with the root `package.json` above.

### 2. Static Site (game)

Typical settings:

- **Root Directory:** leave **empty** (repository root, where `index.html` lives).
- **Build Command:** leave **empty** (unless you add a front-end build later).
- **Publish directory:** `.` — meaning “publish from the root of the repo” (the folder that contains `index.html`). On some Render UIs this field is labeled **Publish Directory** or “Directory to deploy”; use the repo root so `index.html` is at the site root.

### 3. Point the game at the relay

For a **custom domain or fork**, set `window.WOD_MP_WS_URL = 'wss://<your-node-service>.onrender.com'` in a small inline script in `index.html` **before** `multiplayer-client.js` (same pattern as the `simple-wars-live` block). Use **`wss://`** and no path — not the static site’s `https://` URL.

**Lobby list:** the server broadcasts open lobbies and **player count** to everyone connected. Join from the list (password prompt when locked). No room codes.

### Optional Blueprint

`render.yaml` only defines the Node Web Service. Add the Static Site manually in the dashboard.

## GitHub

If this folder is not yet a repository:

```bash
git init
git add .
git commit -m "Initial commit: Simple Wars with multiplayer relay"
```

Create a **new** empty repo on GitHub, then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

If you already have a `.git` folder, add the new `origin` (or replace it) and push as usual.

## Limits / caveats

- **Large maps:** the initial `match_start` payload can be big; very large maps may hit browser or proxy limits. Prefer moderate map sizes for multiplayer.  
- **Commands:** move, line formation, and shift-waypoint march are relayed from guests to the host; other interactions may still be host-only until extended.  
- **Fairness:** the host is authoritative; anti-cheat is not implemented—use with trusted players.
