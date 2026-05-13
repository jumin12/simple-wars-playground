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

   Default WebSocket URL: `ws://localhost:8080`. The in-game Multiplayer panel can override this (stored in `localStorage` as `wod_mp_ws`).

3. **Flow:** one player creates a room and shares the code; others join. The host configures the match and clicks **Launch match**; clients load the same map/state and stay in sync via periodic snapshots.

## Production on Render

Use **two** Render services: one for the **static site** (this repo root: `index.html`, `multiplayer-client.js`, assets) and one **Node Web** service for `server/` (the relay).

1. **Web service (relay)**  
   - Root directory: `server`  
   - Build: `npm install`  
   - Start: `npm start`  
   - Render sets `PORT`; the server already uses `process.env.PORT`.  
   - Note: on the free tier, idle Web services sleep; multiplayer rooms disconnect when the instance sleeps.

2. **Static site**  
   - Publish the repository root (or a subfolder that contains `index.html` at the site root).  
   - Point the game at the relay using **WSS**. Either:
     - Add **before** loading scripts in `index.html`:

       ```html
       <script>window.WOD_MP_WS_URL = 'wss://your-relay-name.onrender.com';</script>
       ```

     - Or set the WebSocket URL in the Multiplayer panel (must be `wss://` when the page is served over HTTPS).

3. **Optional:** import `render.yaml` as a Blueprint to provision the **Node relay**; add the static site as a second manual service (publish directory = repo root).

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
