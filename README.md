# Simple Wars (playground)

Browser strategy game with optional **host-authoritative multiplayer** (up to **6** human slots per room, same cap as faction setup). The **host** runs the full simulation; other players send commands and receive snapshots over a small Node **WebSocket** relay.

## Run locally

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
