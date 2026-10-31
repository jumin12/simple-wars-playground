const { app, BrowserWindow, shell, ipcMain } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createDesktopCommerce } = require('./commerce');

const STEAM_APP_ID = 5043620;

const isDev = !app.isPackaged;
const GAME_ROOT = isDev
  ? path.join(__dirname, '..', 'game')
  : path.join(process.resourcesPath, 'game');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wasm': 'application/wasm',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

let mainWindow = null;
let localServer = null;
let localPort = 0;
let steamClient = null;
let purchaseCallback = null;
const commerce = createDesktopCommerce({ getClient: () => steamClient, notify: result => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('simple-wars-store-update', result);
} });
try { require('steamworks.js').electronEnableSteamOverlay(); }
catch (_) { console.warn('Steam overlay unavailable'); }

function initSteam() {
  try {
    const steamworks = require('steamworks.js');
    steamClient = steamworks.init(STEAM_APP_ID);
    purchaseCallback = steamClient.callback.register(steamworks.SteamCallback.MicroTxnAuthorizationResponse, commerce.onAuthorized);
  } catch (err) {
    steamClient = null;
    console.warn('Steam init skipped:', err && err.message ? err.message : err);
  }
}
function trustedGameEvent(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return false;
  try { const url = new URL(event.senderFrame.url); return url.origin === `http://127.0.0.1:${localPort}` && url.pathname === '/index.html'; }
  catch (_) { return false; }
}

function resolveGamePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0].split('#')[0]);
  const rel = clean.replace(/^\/+/, '') || 'index.html';
  const full = path.resolve(GAME_ROOT, rel);
  const relative = path.relative(GAME_ROOT, full);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

function startLocalServer() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(path.join(GAME_ROOT, 'index.html'))) {
      reject(new Error(
        `Missing game/index.html.\nRun: npm run sync\nExpected folder:\n${GAME_ROOT}`
      ));
      return;
    }

    localServer = http.createServer((req, res) => {
      const filePath = resolveGamePath(req.url || '/');
      if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      fs.stat(filePath, (statErr, stat) => {
        if (statErr || !stat.isFile()) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const type = MIME[ext] || 'application/octet-stream';
        const total = stat.size;
        const range = req.headers.range;
        // Audio elements stall unless the local server answers byte ranges.
        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
          if (!match) {
            res.writeHead(416, { 'Content-Range': 'bytes */' + total });
            res.end();
            return;
          }
          let start = match[1] ? parseInt(match[1], 10) : 0;
          let end = match[2] ? parseInt(match[2], 10) : total - 1;
          if (!isFinite(start) || !isFinite(end) || start < 0 || start >= total) {
            res.writeHead(416, { 'Content-Range': 'bytes */' + total });
            res.end();
            return;
          }
          end = Math.min(end, total - 1);
          res.writeHead(206, {
            'Content-Type': type,
            'Accept-Ranges': 'bytes',
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Content-Length': end - start + 1,
            'Cache-Control': 'no-cache',
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }

        res.writeHead(200, {
          'Content-Type': type,
          'Accept-Ranges': 'bytes',
          'Content-Length': total,
          'Cache-Control': 'no-cache',
        });
        fs.createReadStream(filePath).pipe(res);
      });
    });

    // A changing origin discards Chromium's local saves on every launch. Reuse
    // this installation's port; Steam identity also restores cloud progress.
    const portFile=path.join(app.getPath('userData'),'game-origin-port.json');
    let preferred=0;try{const value=JSON.parse(fs.readFileSync(portFile,'utf8'));if(Number.isInteger(value)&&value>=1024&&value<=65535)preferred=value;}catch(_){}
    const listen=port=>{
      const failed=error=>{if(port&&error.code==='EADDRINUSE')listen(0);else reject(error);};
      localServer.once('error',failed);
      localServer.listen(port,'127.0.0.1',()=>{localServer.removeListener('error',failed);localPort=localServer.address().port;
        try{fs.mkdirSync(path.dirname(portFile),{recursive:true});fs.writeFileSync(portFile,JSON.stringify(localPort));}catch(_){}
        resolve(localPort);
      });
    };
    listen(preferred);
  });
}

function createWindow() {
  const iconPath = fs.existsSync(path.join(__dirname, '..', 'build', 'icon.ico'))
    ? path.join(__dirname, '..', 'build', 'icon.ico')
    : path.join(GAME_ROOT, 'favicon.ico');
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    fullscreen: true,
    backgroundColor: '#0a121c',
    icon: iconPath,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
    title: 'Simple Wars',
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow.isFullScreen()) mainWindow.setFullScreen(true);
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, target) => {
    try { const url = new URL(target); if (url.origin === `http://127.0.0.1:${localPort}` && url.pathname === '/index.html') return; }
    catch (_) {}
    event.preventDefault();
    if (/^https?:\/\//i.test(target)) shell.openExternal(target);
  });

  mainWindow.loadURL(`http://127.0.0.1:${localPort}/index.html`);
}

async function boot() {
  initSteam();
  await startLocalServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

ipcMain.on('simple-wars-quit', event => {
  if (trustedGameEvent(event)) app.quit();
});
ipcMain.handle('simple-wars-store', async (event, action, payload) => {
  if (!trustedGameEvent(event))
    return { ok: false, error: 'Store request was rejected.' };
  try { return { ok: true, ...(await commerce.action(action, payload)) }; }
  catch (error) { return { ok: false, error: error.message || 'Steam store unavailable.' }; }
});
app.on('will-quit', () => { commerce.close(); if (purchaseCallback) purchaseCallback.disconnect(); });

ipcMain.on('simple-wars-achievement', (event, id) => {
  if(!trustedGameEvent(event) || !steamClient || typeof id !== 'string' || !/^[A-Za-z0-9_]+$/.test(id)) return;
  try {
    steamClient.achievement.activate(id);
  } catch (err) {
    console.warn('Steam achievement skipped:', err && err.message ? err.message : err);
  }
});

app.whenReady().then(boot).catch((err) => {
  console.error(err);
  app.quit();
});

app.on('window-all-closed', () => {
  if (localServer) {
    try { localServer.close(); } catch (_) {}
  }
  if (process.platform !== 'darwin') app.quit();
});
