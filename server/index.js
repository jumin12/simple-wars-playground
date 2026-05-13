/**
 * Simple Wars — multiplayer relay
 * Host-authoritative: host runs full sim; server forwards snapshots & player commands.
 */
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_PLAYERS = 6;
const MAX_INIT_BYTES = 48 * 1024 * 1024;

const rooms = new Map();

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function broadcast(room, msg, exceptWs) {
  const raw = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c.ws !== exceptWs && c.ws.readyState === 1) c.ws.send(raw);
  }
}

function broadcastAll(room, msg) {
  const raw = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c.ws.readyState === 1) c.ws.send(raw);
  }
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  const idx = room.clients.indexOf(client);
  if (idx >= 0) room.clients.splice(idx, 1);
  if (room.host === client) {
    room.host = room.clients[0] || null;
    if (room.host) {
      room.host.isHost = true;
      broadcastAll(room, { t: 'host_migrated', slot: room.host.slot });
    }
  }
  broadcastAll(room, { t: 'peer_left', slot: client.slot, count: room.clients.length });
  if (room.clients.length === 0) rooms.delete(room.code);
  client.room = null;
  client.slot = 0;
  client.isHost = false;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('simple-wars-mp ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server, maxPayload: MAX_INIT_BYTES });

wss.on('connection', (ws) => {
  const client = { ws, room: null, slot: 0, isHost: false };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const t = msg && msg.t;
    if (t === 'create') {
      leaveRoom(client);
      let code = genRoomCode();
      while (rooms.has(code)) code = genRoomCode();
      const room = { code, clients: [], host: null };
      rooms.set(code, room);
      client.room = room;
      client.slot = 1;
      client.isHost = true;
      room.clients.push(client);
      room.host = client;
      ws.send(JSON.stringify({ t: 'joined', code, slot: 1, isHost: true, max: MAX_PLAYERS }));
      return;
    }
    if (t === 'join') {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Room not found' }));
        return;
      }
      if (room.clients.length >= MAX_PLAYERS) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Room full' }));
        return;
      }
      leaveRoom(client);
      client.room = room;
      client.slot = room.clients.length + 1;
      client.isHost = room.host === client || false;
      room.clients.push(client);
      ws.send(JSON.stringify({ t: 'joined', code, slot: client.slot, isHost: client.isHost, max: MAX_PLAYERS }));
      broadcastAll(room, { t: 'peer_joined', slot: client.slot, count: room.clients.length });
      return;
    }
    if (t === 'leave') {
      leaveRoom(client);
      ws.send(JSON.stringify({ t: 'left' }));
      return;
    }

    if (!client.room) return;

    if (t === 'start' && client.isHost) {
      const payload = msg.payload;
      broadcastAll(client.room, { t: 'match_start', payload, fromSlot: client.slot });
      return;
    }
    if (t === 'snap' && client.isHost) {
      broadcast(client.room, { t: 'snap', payload: msg.payload, seq: msg.seq }, ws);
      return;
    }
    if (t === 'cmd' && !client.isHost) {
      if (msg.fromSlot !== client.slot) return;
      if (client.room.host && client.room.host.ws.readyState === 1) {
        client.room.host.ws.send(JSON.stringify({ t: 'cmd', fromSlot: client.slot, cmd: msg.cmd }));
      }
      return;
    }
    if (t === 'cmd' && client.isHost) {
      broadcast(client.room, { t: 'cmd', fromSlot: client.slot, cmd: msg.cmd }, ws);
      return;
    }
  });

  ws.on('close', () => leaveRoom(client));
});

server.listen(PORT, () => {
  console.log(`simple-wars-mp listening on ${PORT} (max ${MAX_PLAYERS} players / room)`);
});
