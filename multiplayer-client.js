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
    if (h === 'localhost' || h === '127.0.0.1') return 'ws://localhost:8080';
    const sch = location.protocol === 'https:' ? 'wss' : 'ws';
    return sch + '://' + location.host;
  }

  let ws = null;
  const api = {
    code: '',
    slot: 0,
    isHost: false,
    max: 6,
    connected: false,
    socketOpen: false,
    lastSeq: 0,
    online: 0,
    lobbies: [],
  };

  let joinResolve = null;
  let joinReject = null;
  let createResolve = null;
  let createReject = null;

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

  function clearJoinHandlers(err) {
    if (joinReject) {
      joinReject(err);
      joinReject = null;
      joinResolve = null;
    }
  }
  function clearCreateHandlers(err) {
    if (createReject) {
      createReject(err);
      createReject = null;
      createResolve = null;
    }
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
        case 'welcome':
          api.socketOpen = true;
          api.online = msg.online | 0;
          api.lobbies = msg.lobbies || [];
          emit('Welcome', { online: api.online, lobbies: api.lobbies });
          emit('LobbyList', { online: api.online, lobbies: api.lobbies });
          break;
        case 'lobby_list':
          api.socketOpen = true;
          api.online = msg.online | 0;
          api.lobbies = msg.lobbies || [];
          emit('LobbyList', { online: api.online, lobbies: api.lobbies });
          break;
        case 'registered':
          emit('Registered', { playerId: msg.playerId || '', profile: msg.profile || null });
          break;
        case 'profile':
          emit('Profile', { profile: msg.profile || null });
          break;
        case 'shop_purchase_ok':
          emit('ShopPurchaseOk', { profile: msg.profile || null, alreadyOwned: !!msg.alreadyOwned });
          break;
        case 'shop_failed':
          emit('ShopFailed', { msg: msg.msg || 'Purchase failed' });
          break;
        case 'mp_match_end_ack':
          emit('MpMatchEndAck', { updatedPlayerIds: msg.updatedPlayerIds || [] });
          break;
        case 'register_failed':
          emit('RegisterFailed', { reason: msg.reason || '', msg: msg.msg || 'Registration failed' });
          break;
        case 'profile_failed':
          emit('ProfileFailed', { reason: msg.reason || '', msg: msg.msg || 'Profile update failed' });
          break;
        case 'friend_presence':
          emit('FriendPresence', { online: msg.online || [] });
          break;
        case 'friend_invite':
          emit('FriendInvite', {
            fromPlayerId: msg.fromPlayerId || '',
            fromName: msg.fromName || 'Friend',
            lobbyId: msg.lobbyId || '',
            lobbyName: msg.lobbyName || 'Game',
            locked: !!msg.locked,
            seat: msg.seat | 0,
          });
          break;
        case 'friend_invite_sent':
          emit('FriendInviteSent', { targetPlayerId: msg.targetPlayerId || '' });
          break;
        case 'friend_request':
          emit('FriendRequest', {
            fromPlayerId: msg.fromPlayerId || '',
            fromName: msg.fromName || 'Player',
            unitSkin: msg.unitSkin || 'nato',
          });
          break;
        case 'friend_request_sent':
          emit('FriendRequestSent', { targetPlayerId: msg.targetPlayerId || '' });
          break;
        case 'friend_request_reply':
          emit('FriendRequestReply', {
            fromPlayerId: msg.fromPlayerId || '',
            fromName: msg.fromName || 'Player',
            unitSkin: msg.unitSkin || 'nato',
            accept: !!msg.accept,
          });
          break;
        case 'leaderboard':
          emit('Leaderboard', { sort: msg.sort || 'wins', scope: msg.scope || 'global', rows: msg.rows || [] });
          break;
        case 'friend_removed':
          emit('FriendRemoved', {
            fromPlayerId: msg.fromPlayerId || '',
            fromName: msg.fromName || 'Player',
          });
          break;
        case 'friend_remove_ack':
          emit('FriendRemoveAck', { targetPlayerId: msg.targetPlayerId || '' });
          break;
        case 'joined':
          api.code = msg.code;
          api.slot = msg.slot;
          api.isHost = !!msg.isHost;
          api.max = msg.max || 6;
          api.connected = true;
          if (api.isHost) {
            joinResolve = null;
            joinReject = null;
            if (createResolve) {
              createResolve(api);
              createResolve = null;
              createReject = null;
            }
          } else {
            createResolve = null;
            createReject = null;
            if (joinResolve) {
              joinResolve(api);
              joinResolve = null;
              joinReject = null;
            }
          }
          emit('Joined', { ...api, lobbyName: msg.lobbyName, players: msg.players, meta: msg.meta || {} });
          break;
        case 'room_meta':
          emit('RoomMeta', { meta: msg.meta || {} });
          break;
        case 'peer_joined':
        case 'peer_left':
          emit('Peers', { count: msg.count, slot: msg.slot, t: msg.t });
          break;
        case 'player_disconnected':
          emit('PlayerDisconnected', { slot: msg.slot | 0, count: msg.count, canRejoin: !!msg.canRejoin });
          break;
        case 'player_reconnected':
          emit('PlayerReconnected', { slot: msg.slot | 0, count: msg.count });
          break;
        case 'rejoin_match':
          api.code = msg.code || '';
          api.slot = msg.slot | 0;
          api.isHost = !!msg.isHost;
          api.connected = true;
          joinResolve = null;
          joinReject = null;
          createResolve = null;
          createReject = null;
          emit('RejoinMatch', {
            code: api.code,
            slot: api.slot,
            isHost: api.isHost,
            payload: msg.payload || null,
            snap: msg.snap || null,
            lobbyName: msg.lobbyName || 'Game',
          });
          break;
        case 'host_migrated':
          api.isHost = true;
          if (msg.slot != null) api.slot = msg.slot;
          emit('HostMigrated', { slot: msg.slot });
          break;
        case 'slot_sync':
          if (msg.slot != null) api.slot = msg.slot;
          if (msg.isHost != null) api.isHost = !!msg.isHost;
          emit('SlotSync', { slot: api.slot, isHost: api.isHost });
          break;
        case 'kicked':
          emit('Kicked', { msg: msg.msg || 'Removed from lobby' });
          try {
            if (ws && ws.readyState === 1) ws.close();
          } catch (_) {}
          break;
        case 'match_start':
          emit('MatchStart', { payload: msg.payload, fromSlot: msg.fromSlot });
          break;
        case 'player_ready':
          emit('PlayerReady', { slot: msg.slot | 0 });
          break;
        case 'match_go':
          emit('MatchGo', {});
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
          clearJoinHandlers(new Error(msg.msg || 'Error'));
          clearCreateHandlers(new Error(msg.msg || 'Error'));
          emit('Error', { msg: msg.msg });
          break;
        case 'left':
          api.code = '';
          api.slot = 0;
          api.isHost = false;
          api.lastSeq = 0;
          emit('LeftLobby', {});
          break;
        default:
          break;
      }
    };
    ws.onclose = () => {
      api.socketOpen = false;
      api.connected = false;
      api.code = '';
      api.slot = 0;
      api.isHost = false;
      clearJoinHandlers(new Error('Disconnected'));
      clearCreateHandlers(new Error('Disconnected'));
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
    connect() {
      return new Promise((resolve, reject) => {
        if (ws && ws.readyState === 1) {
          resolve(api);
          return;
        }
        if (ws) {
          try {
            ws.close();
          } catch (_) {}
          ws = null;
        }
        try {
          ws = new WebSocket(defaultWsUrl());
        } catch (e) {
          reject(e);
          return;
        }
        const to = setTimeout(() => {
          global.removeEventListener('wod-mp-Welcome', onWel);
          reject(new Error('Connection timeout'));
        }, 15000);
        function onWel() {
          clearTimeout(to);
          global.removeEventListener('wod-mp-Welcome', onWel);
          resolve(api);
        }
        ws.onopen = () => {
          attachHandlers();
          global.addEventListener('wod-mp-Welcome', onWel, { once: true });
        };
      });
    },
    requestLobbyList() {
      send({ t: 'list_lobbies' });
    },
    createLobby(opts) {
      opts = opts || {};
      return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== 1) {
          reject(new Error('Not connected'));
          return;
        }
        createResolve = resolve;
        createReject = reject;
        setTimeout(() => {
          if (createReject) {
            createReject(new Error('timeout'));
            createReject = null;
            createResolve = null;
          }
        }, 12000);
        send({
          t: 'create_lobby',
          name: opts.name || 'Game',
          password: opts.password || '',
          meta: opts.meta || {},
        });
      });
    },
    joinLobby(id, password, opts) {
      opts = opts && typeof opts === 'object' ? opts : {};
      return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== 1) {
          reject(new Error('Not connected'));
          return;
        }
        joinResolve = resolve;
        joinReject = reject;
        setTimeout(() => {
          if (joinReject) {
            joinReject(new Error('timeout'));
            joinReject = null;
            joinResolve = null;
          }
        }, 12000);
        send({
          t: 'join_lobby',
          id: String(id || '').trim(),
          password: password || '',
          seat: opts.seat | 0,
          playerId: opts.playerId != null ? String(opts.playerId) : '',
        });
      });
    },
    sendLobbyMeta(meta) {
      send({ t: 'lobby_meta', meta: meta || {} });
    },
    sendLobbyColor(slot, color) {
      send({ t: 'lobby_color', slot: slot | 0, color: String(color || '').trim() });
    },
    sendLobbyProfile(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      send({
        t: 'lobby_profile',
        displayName: p.displayName != null ? String(p.displayName) : '',
        mpStats: p.mpStats && typeof p.mpStats === 'object' ? p.mpStats : null,
        unitSkin: p.unitSkin != null ? String(p.unitSkin) : '',
        playerId: p.playerId != null ? String(p.playerId) : '',
        combinedStats: p.combinedStats && typeof p.combinedStats === 'object' ? p.combinedStats : null,
      });
    },
    registerPlayer(payload) {
      const p = payload && typeof payload === 'object' ? payload : {};
      send({
        t: 'register_player',
        playerId: p.playerId != null ? String(p.playerId) : '',
        displayName: p.displayName != null ? String(p.displayName) : '',
        unitSkin: p.unitSkin != null ? String(p.unitSkin) : 'nato',
        mpStats: p.mpStats && typeof p.mpStats === 'object' ? p.mpStats : null,
        combinedStats: p.combinedStats && typeof p.combinedStats === 'object' ? p.combinedStats : null,
      });
    },
    getProfile(playerId) {
      send({ t: 'get_profile', playerId: String(playerId || '') });
    },
    syncProgress(playerId, progress) {
      send({ t: 'sync_progress', playerId: String(playerId || ''), progress: progress || {} });
    },
    shopPurchase(playerId, req) {
      send(Object.assign({ t: 'shop_purchase', playerId: String(playerId || '') }, req || {}));
    },
    reportMpMatchEnd(payload) {
      send(Object.assign({ t: 'mp_match_end' }, payload || {}));
    },
    sendFriendRequest(targetPlayerId) {
      send({ t: 'friend_request', targetPlayerId: String(targetPlayerId || '') });
    },
    replyFriendRequest(fromPlayerId, accept) {
      send({ t: 'friend_request_reply', fromPlayerId: String(fromPlayerId || ''), accept: !!accept });
    },
    requestLeaderboard(sort, friendIds) {
      send({
        t: 'leaderboard',
        sort: String(sort || 'wins'),
        friendIds: Array.isArray(friendIds) ? friendIds : undefined,
      });
    },
    removeFriend(targetPlayerId) {
      send({ t: 'friend_remove', targetPlayerId: String(targetPlayerId || '') });
    },
    queryFriendPresence(friendIds) {
      send({ t: 'friend_presence', friendIds: Array.isArray(friendIds) ? friendIds : [] });
    },
    sendFriendInvite(targetPlayerId, seat) {
      send({ t: 'friend_invite', targetPlayerId: String(targetPlayerId || ''), seat: seat | 0 });
    },
    kickPlayer(slot) {
      send({ t: 'kick_player', slot: slot | 0 });
    },
    leaveLobby() {
      if (ws && ws.readyState === 1) send({ t: 'leave' });
      api.code = '';
      api.slot = 0;
      api.isHost = false;
      api.lastSeq = 0;
      api.connected = false;
    },
    disconnect() {
      clearJoinHandlers(new Error('Disconnected'));
      clearCreateHandlers(new Error('Disconnected'));
      if (ws) {
        try {
          send({ t: 'leave' });
        } catch (_) {}
        try {
          ws.close();
        } catch (_) {}
        ws = null;
      }
      api.connected = false;
      api.socketOpen = false;
      api.code = '';
      api.slot = 0;
      api.isHost = false;
      api.lastSeq = 0;
      api.online = 0;
      api.lobbies = [];
    },
    hostSendMatchStart(payload) {
      send({ t: 'start', payload });
    },
    sendMatchReady() {
      send({ t: 'ready' });
    },
    hostSendMatchGo() {
      send({ t: 'match_go' });
    },
    hostSendSnap(seq, payload) {
      send({ t: 'snap', seq, payload });
    },
    sendCmd(cmd) {
      send({ t: 'cmd', fromSlot: api.slot, cmd });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
