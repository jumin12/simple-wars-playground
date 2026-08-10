/**
 * Sequential classical BGM (HOI1-style playlist order).
 * Tracks live in sounds/music/playlist.json — commercially free recordings only.
 * Plays on main menu and during matches; preloads during the boot splash.
 * Transport (pick track / pause / skip / repeat) is exposed for Settings UI only.
 */
(function () {
  const STORAGE_VOL = 'wodMusicVolume';
  const STORAGE_MUTE = 'wodMusicMuted';
  const STORAGE_REPEAT = 'wodMusicRepeat';
  const STORAGE_INDEX = 'wodMusicIndex';
  const PLAYLIST_URL = 'sounds/music/playlist.json';

  let tracks = [];
  let audio = null;
  let index = 0;
  let wanted = false;
  let paused = false;
  let repeat = false;
  let ready = false;
  let loadPromise = null;
  let preloadPromise = null;
  let unlocked = false;
  const cache = new Map(); // file -> HTMLAudioElement (preloaded)

  function clamp01(n) {
    n = Number(n);
    if (!isFinite(n)) return 1;
    return Math.max(0, Math.min(1, n));
  }

  function getVolume() {
    try {
      const v = localStorage.getItem(STORAGE_VOL);
      // New default is 100%; migrate the previous 45% factory default once.
      if (v == null || v === '0.45') return 1;
      return clamp01(v);
    } catch (_) {
      return 1;
    }
  }

  function isMuted() {
    try {
      return localStorage.getItem(STORAGE_MUTE) === '1';
    } catch (_) {
      return false;
    }
  }

  function isRepeat() {
    try {
      return localStorage.getItem(STORAGE_REPEAT) === '1';
    } catch (_) {
      return false;
    }
  }

  function loadSavedIndex() {
    try {
      const n = parseInt(localStorage.getItem(STORAGE_INDEX), 10);
      return isFinite(n) && n >= 0 ? n : 0;
    } catch (_) {
      return 0;
    }
  }

  function persistIndex() {
    try { localStorage.setItem(STORAGE_INDEX, String(index)); } catch (_) {}
  }

  function setVolume(v) {
    v = clamp01(v);
    try { localStorage.setItem(STORAGE_VOL, String(v)); } catch (_) {}
    if (audio) audio.volume = isMuted() ? 0 : v;
    syncUi();
  }

  function setMuted(m) {
    try { localStorage.setItem(STORAGE_MUTE, m ? '1' : '0'); } catch (_) {}
    if (audio) audio.volume = m ? 0 : getVolume();
    syncUi();
  }

  function setRepeat(on) {
    repeat = !!on;
    try { localStorage.setItem(STORAGE_REPEAT, repeat ? '1' : '0'); } catch (_) {}
    syncUi();
  }

  function trackLabel(t, i) {
    if (!t) return 'Track ' + (i + 1);
    return t.title || t.file || ('Track ' + (i + 1));
  }

  function isPlaying() {
    return !!(wanted && !paused && audio && !audio.paused);
  }

  function syncUi() {
    const vol = getVolume();
    const muted = isMuted();
    const pct = String(Math.round(vol * 100));
    document.querySelectorAll('.wod-music-vol').forEach((el) => {
      if (el.value !== pct) el.value = pct;
    });
    document.querySelectorAll('.wod-music-vol-label').forEach((el) => {
      el.textContent = pct;
    });
    document.querySelectorAll('.wod-music-mute').forEach((el) => {
      el.checked = muted;
    });
    document.querySelectorAll('.wod-music-repeat').forEach((el) => {
      el.checked = !!repeat;
    });
    const cur = tracks[index];
    const nowText = cur ? trackLabel(cur, index) : (tracks.length ? '—' : 'No tracks loaded');
    document.querySelectorAll('.wod-music-now').forEach((el) => {
      el.textContent = nowText;
      el.title = nowText;
    });
    document.querySelectorAll('.wod-music-track').forEach((sel) => {
      if (sel.tagName !== 'SELECT') return;
      if (sel.options.length !== tracks.length) fillTrackSelect(sel);
      if (tracks.length && sel.selectedIndex !== index) sel.selectedIndex = index;
    });
    const pauseLabel = paused || !wanted || (audio && audio.paused) ? 'Play' : 'Pause';
    document.querySelectorAll('.wod-music-pause').forEach((el) => {
      el.textContent = pauseLabel;
      el.setAttribute('aria-label', pauseLabel + ' music');
    });
  }

  function fillTrackSelect(sel) {
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '';
    if (!tracks.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No tracks loaded';
      sel.appendChild(opt);
      return;
    }
    for (let i = 0; i < tracks.length; i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = (i + 1) + '. ' + trackLabel(tracks[i], i);
      sel.appendChild(opt);
    }
    if (prev !== '' && sel.querySelector('option[value="' + prev + '"]')) sel.value = prev;
    else sel.selectedIndex = index;
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = isMuted() ? 0 : getVolume();
    audio.addEventListener('ended', () => {
      if (!wanted || !tracks.length) return;
      if (repeat) {
        playCurrent(true);
        return;
      }
      index = (index + 1) % tracks.length;
      persistIndex();
      playCurrent(true);
    });
    audio.addEventListener('error', () => {
      if (!wanted || !tracks.length) return;
      if (repeat) {
        // Skip broken track even in repeat so we do not spin forever.
        index = (index + 1) % tracks.length;
        persistIndex();
      } else {
        index = (index + 1) % tracks.length;
        persistIndex();
      }
      playCurrent(true);
    });
    audio.addEventListener('play', () => { paused = false; syncUi(); });
    audio.addEventListener('pause', () => { syncUi(); });
    return audio;
  }

  function trackUrl(file) {
    return 'sounds/music/' + file;
  }

  function playCurrent(forceRestart) {
    if (!wanted || !tracks.length) return;
    const t = tracks[index];
    if (!t || !t.file) return;
    paused = false;
    persistIndex();
    const a = ensureAudio();
    const src = trackUrl(t.file);
    const same = a.getAttribute('data-file') === t.file;
    if (!same || forceRestart) {
      a.setAttribute('data-file', t.file);
      const cached = cache.get(t.file);
      a.src = cached && cached.src ? cached.src : src;
      try { a.currentTime = 0; } catch (_) {}
    }
    a.volume = isMuted() ? 0 : getVolume();
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        /* autoplay may be blocked until a user gesture unlocks audio */
      });
    }
    syncUi();
  }

  async function loadPlaylist() {
    if (ready) return tracks;
    if (loadPromise) return loadPromise;
    loadPromise = fetch(PLAYLIST_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('playlist ' + r.status))))
      .then((data) => {
        tracks = Array.isArray(data.tracks) ? data.tracks.filter((t) => t && t.file) : [];
        ready = true;
        repeat = isRepeat();
        index = loadSavedIndex();
        if (index >= tracks.length) index = 0;
        syncUi();
        return tracks;
      })
      .catch((e) => {
        console.warn('Music playlist failed to load', e);
        tracks = [];
        ready = true;
        syncUi();
        return tracks;
      });
    return loadPromise;
  }

  function preloadOne(file) {
    return new Promise((resolve) => {
      if (!file || cache.has(file)) {
        resolve(true);
        return;
      }
      const el = new Audio();
      el.preload = 'auto';
      let done = false;
      const finish = (ok) => {
        if (done) return;
        done = true;
        if (ok) cache.set(file, el);
        resolve(!!ok);
      };
      el.addEventListener('canplaythrough', () => finish(true), { once: true });
      el.addEventListener('error', () => finish(false), { once: true });
      // Some browsers never fire canplaythrough for long oggs — accept canplay / timeout
      el.addEventListener('canplay', () => finish(true), { once: true });
      setTimeout(() => finish(el.readyState >= 2), 12000);
      el.src = trackUrl(file);
      try { el.load(); } catch (_) {}
    });
  }

  /**
   * Preload playlist audio during boot splash.
   * onProgress(fraction 0..1, label) is optional.
   * opts.playAsSoonAsReady — start BGM after the first track is buffered (during splash).
   */
  async function preloadAll(onProgress, opts) {
    opts = opts || {};
    await loadPlaylist();
    if (preloadPromise) return preloadPromise;
    preloadPromise = (async () => {
      const list = tracks.slice();
      if (!list.length) return { loaded: 0, total: 0 };
      let loaded = 0;
      const startFile = (tracks[index] && tracks[index].file) || (list[0] && list[0].file);
      if (startFile) {
        if (onProgress) onProgress(0.02, 'Loading music…');
        await preloadOne(startFile);
        loaded = 1;
        if (onProgress) onProgress(loaded / list.length, 'Loading music…');
        if (opts.playAsSoonAsReady) {
          wanted = true;
          playCurrent();
        }
      }
      const rest = list.filter((t) => t.file !== startFile);
      const batchSize = 3;
      for (let i = 0; i < rest.length; i += batchSize) {
        const batch = rest.slice(i, i + batchSize);
        await Promise.all(batch.map((t) => preloadOne(t.file)));
        loaded += batch.length;
        if (onProgress) onProgress(Math.min(1, loaded / list.length), 'Loading music…');
      }
      return { loaded, total: list.length };
    })();
    return preloadPromise;
  }

  async function start() {
    wanted = true;
    paused = false;
    await loadPlaylist();
    if (!tracks.length) return;
    if (index < 0 || index >= tracks.length) index = 0;
    playCurrent();
  }

  /** Keep playlist running (menu ↔ match). Only pauses if muted externally via stop(). */
  function stop() {
    wanted = false;
    paused = false;
    if (audio) {
      try { audio.pause(); } catch (_) {}
    }
    syncUi();
  }

  function pause() {
    paused = true;
    if (audio) {
      try { audio.pause(); } catch (_) {}
    }
    syncUi();
  }

  function resume() {
    if (!tracks.length) return;
    wanted = true;
    paused = false;
    playCurrent(false);
  }

  function togglePause() {
    if (paused || !wanted || (audio && audio.paused)) resume();
    else pause();
  }

  function skip() {
    next();
  }

  function next() {
    if (!tracks.length) return;
    index = (index + 1) % tracks.length;
    persistIndex();
    wanted = true;
    playCurrent(true);
  }

  function prev() {
    if (!tracks.length) return;
    const a = ensureAudio();
    // Restart current if more than a couple seconds in; otherwise previous track.
    if (a && a.currentTime > 2.5) {
      playCurrent(true);
      return;
    }
    index = (index - 1 + tracks.length) % tracks.length;
    persistIndex();
    wanted = true;
    playCurrent(true);
  }

  function playIndex(i) {
    if (!tracks.length) return;
    i = parseInt(i, 10);
    if (!isFinite(i) || i < 0 || i >= tracks.length) return;
    index = i;
    persistIndex();
    wanted = true;
    paused = false;
    playCurrent(true);
  }

  function unlockFromGesture() {
    if (unlocked) return;
    unlocked = true;
    const a = ensureAudio();
    // Silent unlock trick then resume intended playback
    const prevVol = a.volume;
    a.volume = 0;
    const p = a.play();
    const resumeUnlock = () => {
      a.volume = isMuted() ? 0 : getVolume();
      if (wanted && !paused) playCurrent();
      else if (a && !a.paused) {
        try { a.pause(); } catch (_) {}
      }
    };
    if (p && typeof p.then === 'function') p.then(resumeUnlock).catch(resumeUnlock);
    else resumeUnlock();
  }

  function bindUi() {
    document.querySelectorAll('.wod-music-vol').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('input', () => setVolume(Number(el.value) / 100));
    });
    document.querySelectorAll('.wod-music-mute').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('change', () => setMuted(!!el.checked));
    });
    document.querySelectorAll('.wod-music-repeat').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('change', () => setRepeat(!!el.checked));
    });
    document.querySelectorAll('.wod-music-track').forEach((sel) => {
      if (sel.dataset.bound) return;
      sel.dataset.bound = '1';
      fillTrackSelect(sel);
      sel.addEventListener('change', () => {
        const i = parseInt(sel.value, 10);
        if (isFinite(i)) playIndex(i);
      });
    });
    document.querySelectorAll('.wod-music-pause').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        togglePause();
      });
    });
    document.querySelectorAll('.wod-music-next').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        next();
      });
    });
    document.querySelectorAll('.wod-music-prev').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', (e) => {
        e.preventDefault();
        prev();
      });
    });
    // Ensure selects populate after playlist arrives.
    if (ready) {
      document.querySelectorAll('.wod-music-track').forEach(fillTrackSelect);
    } else {
      loadPlaylist().then(() => {
        document.querySelectorAll('.wod-music-track').forEach(fillTrackSelect);
        syncUi();
      });
    }
    syncUi();
  }

  function bindUnlockGestures() {
    if (window._wodMusicUnlockBound) return;
    window._wodMusicUnlockBound = true;
    const unlock = () => {
      unlockFromGesture();
      if (wanted && !paused) start();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
      window.addEventListener(ev, unlock, { once: true, capture: true });
    });
  }

  // Seed repeat from storage before UI binds.
  repeat = isRepeat();
  index = loadSavedIndex();

  window.wodMusic = {
    start,
    stop,
    skip,
    next,
    prev,
    pause,
    resume,
    togglePause,
    playIndex,
    setVolume,
    setMuted,
    setRepeat,
    getVolume,
    isMuted,
    isRepeat,
    isPaused: () => !!paused,
    isPlaying,
    getIndex: () => index,
    getTracks: () => tracks.slice(),
    getCurrent: () => tracks[index] || null,
    bindUi,
    loadPlaylist,
    preloadAll,
    unlockFromGesture,
    bindUnlockGestures,
    syncUi,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      bindUi();
      bindUnlockGestures();
    });
  } else {
    bindUi();
    bindUnlockGestures();
  }
})();
