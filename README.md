# Simple Wars (playground)

Browser strategy game with optional **host-authoritative multiplayer** (up to **4** human slots per room, same cap as faction setup). The **host** runs the full simulation; other players send commands and receive snapshots over a small Node **WebSocket** relay.

## Run locally

Opening forces are halved, with about 20% near the front and 80% around towns. Armor always starts in the rear. All starting towns have no buildings. All buildings (including forts and bridges) take 60 seconds; infantry mobilize in 15 seconds, marines in 20, heavy units in 25 and ships in 30. Campaign reinforcements use their unit type’s timer. A small circular countdown marks each production site, followed by the unit arrival animation. Each town handles one order at a time. Pausing stops production, and siege pauses town production.

Use **Ctrl + 0–9** to save selected units to a group; press its number or click the HUD group to recall it. Campaign troops can be dragged to reorder or dismissed with an undo option. The first half deploys at battle start. Unit buttons call the remaining reserves as timed reinforcements without charging resources again; names, wounds and experience persist. Undeployed reserves remain safe between battles.

Town, building, land and convoy cash income is doubled. Command funding adds $12/s while a faction owns a town; manpower growth supports repeat recruitment. AI factions share these rates, prioritize recruits below ten field units, budget for future upkeep, and build farms, factories, harbors and spaced forts according to need. Town guards and front defenders protect the army while most ready infantry join offense. Tanks assemble with nearby infantry around reachable town objectives; reinforcements and routine planning preserve those assaults. Marines and ships can rally at a friendly shore, cross to a shared beach behind the front, and land with naval support. Successful attacks continue to the next town. AI supply checks cover whole connected regions, protect threatened one- and two-tile corridors, and coordinate large-pocket breakouts with outside relief. Limited response groups intercept territory incursions away from towns and then resume their original missions. Defenders choose reachable terrain using their unit type’s combat bonuses. Forts require nearby land troops and a buffer of two clear tiles from hostile territory; construction sites and completed forts retain guards.

Money and manpower purchase requirements are doubled. Infantry and marines cost $1,000 / 2,000 MP; heavy units cost $8,000 / 2,000 MP; ships cost $7,600 / 10,000 MP. Factories cost $4,000, harbors $2,000, farms $2,400, forts $3,000 and bridges $4,000. Campaign recruitment, research and field repairs also cost twice as much. Existing paid reserves remain free to call in; unit strength and income/upkeep rates are unchanged.

Only marines receive ocean/river supply in cut-off coastal pockets. Other land units there still suffer encirclement attrition. A land connection to an owned town supplies all unit types; forts only reduce pocket attrition.

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
