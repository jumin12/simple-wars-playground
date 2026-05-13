/**
 * Simple Wars — browser multiplayer client (host-authoritative relay).
 * Configure production WebSocket URL on the HTML page:
 *   <script>window.WOD_MP_WS_URL = 'wss://your-service.onrender.com';</script>
 */
(function (global) {
  'use strict';

  function defaultWsUrl() {
    if (global.WOD_MP_WS_URL) return global.WOD_MP_WS_URL;
    const h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1')
      return 'ws://localhost:8080';
    const sch = location.protocol === 'https:' ? 'wss' : 'ws';
    return sch + '://' + location.host;
  }

  let ws = null;
  let reconnectTimer = null;
  const api = {
    code: '',
    slot: 0,
    isHost: false,
    max: 6,
    connected: false,
    lastSeq: 0
  };

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent('wod-mp-' + name, { detail }));
    } catch (_) {}
    if (typeof global['wodMpOn' + name] === 'function') {
      try {
        global['wodMpOn' + name](detail);
      } catch (e) {
        console.warn('wod-mp handler', e);
      }
    }
  }

  function send(obj) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  }

  function attachHandlers() {
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (msg.t) {
        case 'joined':
          api.code = msg.code;
          api.slot = msg.slot;
          api.isHost = !!msg.isHost;
          api.max = msg.max || 6;
          api.connected = true;
          emit('Joined', { ...api });
          break;
        case 'peer_joined':
        case 'peer_left':
          emit('Peers', { count: msg.count, slot: msg.slot, t: msg.t });
          break;
        case 'host_migrated':
          api.isHost = true;
          if (msg.slot != null) api.slot = msg.slot;
          emit('HostMigrated', { slot: msg.slot });
          break;
        case 'match_start':
          emit('MatchStart', { payload: msg.payload, fromSlot: msg.fromSlot });
          break;
        case 'snap':
          if (msg.seq != null && msg.seq <= api.lastSeq) return;
          if (msg.seq != null) api.lastSeq = msg.seq;
          emit('Snap', { payload: msg.payload, seq: msg.seq });
          break;
        case 'cmd':
          if (msg.fromSlot === api.slot) return;
          emit('RemoteCmd', { fromSlot: msg.fromSlot, cmd: msg.cmd });
          break;
        case 'error':
          emit('Error', { msg: msg.msg });
          break;
        default:
          break;
      }
    };
    ws.onclose = () => {
      api.connected = false;
      emit('Close', {});
    };
    ws.onerror = () => emit('Error', { msg: 'WebSocket error' });
  }

  global.WodMultiplayer = {
    api,
    defaultWsUrl,
    getUrl() {
      return defaultWsUrl();
    },
    createRoom() {
      return new Promise((resolve, reject) => {
        try {
          ws = new WebSocket(defaultWsUrl());
        } catch (e) {
          reject(e);
          return;
        }
        ws.onopen = () => {
          attachHandlers();
          send({ t: 'create' });
          const ok = (ev) => {
            global.removeEventListener('wod-mp-Joined', ok);
            resolve(api);
          };
          global.addEventListener('wod-mp-Joined', ok, { once: true });
          setTimeout(() => {
            global.removeEventListener('wod-mp-Joined', ok);
            if (!api.connected) reject(new Error('timeout'));
          }, 12000);
        };
      });
    },
    joinRoom(code) {
      return new Promise((resolve, reject) => {
        try {
          ws = new WebSocket(defaultWsUrl());
        } catch (e) {
          reject(e);
          return;
        }
        ws.onopen = () => {
          attachHandlers();
          send({ t: 'join', code: String(code || '').toUpperCase() });
          const ok = (ev) => {
            global.removeEventListener('wod-mp-Joined', ok);
            resolve(api);
          };
          global.addEventListener('wod-mp-Joined', ok, { once: true });
          setTimeout(() => {
            global.removeEventListener('wod-mp-Joined', ok);
            if (!api.connected) reject(new Error('timeout'));
          }, 12000);
        };
      });
    },
    disconnect() {
      if (ws) {
        try {
          send({ t: 'leave' });
        } catch (_) {}
        ws.close();
        ws = null;
      }
      api.connected = false;
      api.lastSeq = 0;
    },
    hostSendMatchStart(payload) {
      send({ t: 'start', payload });
    },
    hostSendSnap(seq, payload) {
      send({ t: 'snap', seq, payload });
    },
    sendCmd(cmd) {
      send({ t: 'cmd', fromSlot: api.slot, cmd });
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
