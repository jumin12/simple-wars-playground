/**
 * Simple Wars — multiplayer relay
 * Host-authoritative: host runs full sim; server forwards snapshots & player commands.
 * Lobby browser: list open games, optional password, online count.
 */
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.PORT || '8080', 10);
const MAX_PLAYERS = 6;
const MAX_INIT_BYTES = 48 * 1024 * 1024;

const rooms = new Map();

function lobbyCap(room) {
  let mh = room.meta && room.meta.maxHumans != null ? parseInt(room.meta.maxHumans, 10) : MAX_PLAYERS;
  if (!Number.isFinite(mh)) mh = MAX_PLAYERS;
  return Math.min(MAX_PLAYERS, Math.max(2, mh));
}

function normalizeSeatTypes(meta) {
  if (!meta || typeof meta !== 'object') return;
  const cap = Math.min(MAX_PLAYERS, Math.max(2, parseInt(meta.maxHumans, 10) || MAX_PLAYERS));
  meta.maxHumans = cap;
  let st = Array.isArray(meta.seatTypes) ? meta.seatTypes.slice(0, cap) : [];
  while (st.length < cap) st.push('human');
  for (let i = 0; i < st.length; i++) {
    const v = st[i];
    if (v === 'bot' || v === 'closed') st[i] = v;
    else st[i] = 'human';
  }
  meta.seatTypes = st;
  let bots = 0;
  for (let i = 0; i < st.length; i++) {
    if (st[i] === 'bot') bots++;
  }
  meta.aiCount = bots;
}

/** First slot 1..cap that is `human` in seatTypes and not taken by a connected client. */
function firstFreeHumanSlot(room) {
  normalizeSeatTypes(room.meta);
  const cap = lobbyCap(room);
  const taken = new Set();
  for (const c of room.clients) taken.add(c.slot);
  const st = room.meta.seatTypes;
  for (let s = 1; s <= cap; s++) {
    if ((st[s - 1] || 'human') !== 'human') continue;
    if (!taken.has(s)) return s;
  }
  return 0;
}

function assertMetaCompatibleWithRoom(room, metaTrial) {
  const cap = Math.min(MAX_PLAYERS, Math.max(2, parseInt(metaTrial.maxHumans, 10) || MAX_PLAYERS));
  let humanSeats = 0;
  for (let i = 0; i < cap; i++) {
    if ((metaTrial.seatTypes[i] || 'human') === 'human') humanSeats++;
  }
  if (humanSeats < 1) return 'At least one seat must be Human for real players';
  for (const c of room.clients) {
    if (c.slot > cap) return `Seat ${c.slot} is in use — raise max seats or remove players first`;
    const st = metaTrial.seatTypes[c.slot - 1] || 'human';
    if (st !== 'human') return `Seat ${c.slot} has a player — set it to Human first`;
  }
  return null;
}

function metaWire(room) {
  normalizeSeatTypes(room.meta);
  return {
    ...room.meta,
    occupiedSlots: room.clients.map((c) => c.slot).sort((a, b) => a - b),
  };
}

function genLobbyId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
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

function countOnline() {
  let n = 0;
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) n++;
  });
  return n;
}

function getLobbyListPublic() {
  const out = [];
  for (const room of rooms.values()) {
    if (room.matchStarted) continue;
    normalizeSeatTypes(room.meta);
    const cap = lobbyCap(room);
    out.push({
      id: room.id,
      name: room.name,
      players: room.clients.length,
      max: cap,
      locked: !!room.password,
      meta: metaWire(room),
    });
  }
  return out;
}

function broadcastLobbyList() {
  const payload = JSON.stringify({
    t: 'lobby_list',
    lobbies: getLobbyListPublic(),
    online: countOnline(),
  });
  wss.clients.forEach((ws) => {
    if (ws.readyState === 1) ws.send(payload);
  });
}

function addClientToRoom(client, room) {
  client.room = room;
  normalizeSeatTypes(room.meta);
  const isFirst = room.clients.length === 0;
  const slot = firstFreeHumanSlot(room);
  client.slot = slot > 0 ? slot : 1;
  room.clients.push(client);
  if (isFirst) {
    client.isHost = true;
    room.host = client;
  } else {
    client.isHost = false;
  }
  if (!room.meta.playerColors || typeof room.meta.playerColors !== 'object')
    room.meta.playerColors = {};
  const sk = String(client.slot);
  if (!room.meta.playerColors[sk]) {
    const defs = ['#2ecc71', '#3498db', '#e74c3c', '#9b59b6', '#e67e22', '#f1c40f'];
    room.meta.playerColors[sk] = defs[(client.slot - 1) % defs.length];
  }
}

function leaveRoom(client) {
  const room = client.room;
  if (!room) return;
  const leftSlot = client.slot;
  const idx = room.clients.indexOf(client);
  if (idx >= 0) room.clients.splice(idx, 1);
  const wasHost = room.host === client;
  if (wasHost) room.host = room.clients[0] || null;

  for (const c of room.clients) {
    c.isHost = room.host === c;
  }

  if (wasHost && room.host) {
    try {
      if (room.host.ws.readyState === 1)
        room.host.ws.send(
          JSON.stringify({ t: 'host_migrated', slot: room.host.slot, isHost: true }),
        );
    } catch (_) {}
  }
  broadcastAll(room, { t: 'peer_left', slot: leftSlot, count: room.clients.length });
  if (room.clients.length > 0) broadcastAll(room, { t: 'room_meta', meta: metaWire(room) });
  if (room.clients.length === 0) rooms.delete(room.id);
  client.room = null;
  client.slot = 0;
  client.isHost = false;
  broadcastLobbyList();
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
  ws._wodClient = client;

  try {
    ws.send(
      JSON.stringify({
        t: 'welcome',
        online: countOnline(),
        lobbies: getLobbyListPublic(),
      }),
    );
  } catch (_) {}
  broadcastLobbyList();

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    const t = msg && msg.t;

    if (t === 'list_lobbies') {
      ws.send(
        JSON.stringify({
          t: 'lobby_list',
          lobbies: getLobbyListPublic(),
          online: countOnline(),
        }),
      );
      return;
    }

    if (t === 'create_lobby') {
      leaveRoom(client);
      let id = genLobbyId();
      while (rooms.has(id)) id = genLobbyId();
      const name = String((msg.name || 'Game').trim()).slice(0, 40) || 'Game';
      const password = msg.password ? String(msg.password).slice(0, 80) : null;
      const room = {
        id,
        name,
        password: password || null,
        meta: {
          mapSize: 60,
          mapShape: 'island',
          aiCount: 1,
          victoryMode: 'domination',
          money: 1000,
          maxHumans: MAX_PLAYERS,
          playerColors: {},
          mapSizeLabel: 'Medium',
          mapShapeLabel: 'Island',
          victoryLabel: 'Domination',
          ...(typeof msg.meta === 'object' && msg.meta ? msg.meta : {}),
        },
        clients: [],
        host: null,
        matchStarted: false,
      };
      rooms.set(id, room);
      addClientToRoom(client, room);
      ws.send(
        JSON.stringify({
          t: 'joined',
          code: room.id,
          slot: client.slot,
          isHost: true,
          max: MAX_PLAYERS,
          lobbyName: room.name,
          players: room.clients.length,
          meta: metaWire(room),
        }),
      );
      broadcastAll(room, { t: 'peer_joined', slot: client.slot, count: room.clients.length });
      broadcastAll(room, { t: 'room_meta', meta: metaWire(room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'join_lobby') {
      const id = String(msg.id || '').trim();
      const room = rooms.get(id);
      if (!room || room.matchStarted) {
        ws.send(
          JSON.stringify({
            t: 'error',
            msg: room ? 'Match already started' : 'Lobby not found',
          }),
        );
        return;
      }
      normalizeSeatTypes(room.meta);
      if (!firstFreeHumanSlot(room)) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Lobby full' }));
        return;
      }
      const pw = String(msg.password || '');
      if (room.password && pw !== room.password) {
        ws.send(JSON.stringify({ t: 'error', msg: 'Wrong password' }));
        return;
      }
      leaveRoom(client);
      addClientToRoom(client, room);
      ws.send(
        JSON.stringify({
          t: 'joined',
          code: room.id,
          slot: client.slot,
          isHost: client.isHost,
          max: MAX_PLAYERS,
          lobbyName: room.name,
          players: room.clients.length,
          meta: metaWire(room),
        }),
      );
      broadcastAll(room, { t: 'peer_joined', slot: client.slot, count: room.clients.length });
      broadcastAll(room, { t: 'room_meta', meta: metaWire(room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'lobby_meta') {
      if (!client.room || !client.isHost || client.room.matchStarted) return;
      const m = msg.meta && typeof msg.meta === 'object' ? { ...msg.meta } : null;
      if (m) {
        delete m.occupiedSlots;
        const prevPc = (client.room.meta && client.room.meta.playerColors) || {};
        const trial = { ...client.room.meta, ...m };
        normalizeSeatTypes(trial);
        const bad = assertMetaCompatibleWithRoom(client.room, trial);
        if (bad) {
          try {
            ws.send(JSON.stringify({ t: 'error', msg: bad }));
          } catch (_) {}
          return;
        }
        client.room.meta = trial;
        if (!client.room.meta.playerColors || typeof client.room.meta.playerColors !== 'object')
          client.room.meta.playerColors = {};
        Object.assign(client.room.meta.playerColors, prevPc);
        normalizeSeatTypes(client.room.meta);
      }
      broadcastAll(client.room, { t: 'room_meta', meta: metaWire(client.room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'kick_player') {
      if (!client.room || !client.isHost || client.room.matchStarted) return;
      const target = parseInt(msg.slot, 10) || 0;
      if (target <= 0 || target === client.slot) return;
      const victim = client.room.clients.find((c) => c.slot === target);
      if (!victim) return;
      try {
        if (victim.ws.readyState === 1)
          victim.ws.send(JSON.stringify({ t: 'kicked', msg: msg.reason || 'Removed by host' }));
      } catch (_) {}
      try {
        victim.ws.close();
      } catch (_) {}
      return;
    }

    if (t === 'lobby_color') {
      if (!client.room || client.room.matchStarted) return;
      const slot = parseInt(msg.slot, 10) || 0;
      const cap = lobbyCap(client.room);
      if (slot < 1 || slot > cap) return;
      if (!client.isHost && slot !== client.slot) return;
      const hex = String(msg.color || '').trim();
      if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
      if (!client.room.meta.playerColors || typeof client.room.meta.playerColors !== 'object')
        client.room.meta.playerColors = {};
      const taken = Object.entries(client.room.meta.playerColors).some(
        ([k, v]) => parseInt(k, 10) !== slot && String(v).toLowerCase() === hex.toLowerCase(),
      );
      if (taken) {
        try {
          ws.send(JSON.stringify({ t: 'error', msg: 'Color already taken' }));
        } catch (_) {}
        return;
      }
      client.room.meta.playerColors[String(slot)] = hex;
      broadcastAll(client.room, { t: 'room_meta', meta: metaWire(client.room) });
      broadcastLobbyList();
      return;
    }

    if (t === 'leave') {
      leaveRoom(client);
      try {
        ws.send(JSON.stringify({ t: 'left' }));
      } catch (_) {}
      return;
    }

    if (!client.room) return;

    if (t === 'start' && client.isHost) {
      client.room.matchStarted = true;
      const payload = msg.payload;
      broadcastAll(client.room, { t: 'match_start', payload, fromSlot: client.slot });
      broadcastLobbyList();
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

  ws.on('close', () => {
    leaveRoom(client);
    broadcastLobbyList();
  });
});

server.listen(PORT, () => {
  console.log(`simple-wars-mp listening on ${PORT} (max ${MAX_PLAYERS} players / room)`);
});
