/**
 * Sequential classical BGM (HOI1-style playlist order).
 * Tracks live in sounds/music/playlist.json — commercially free recordings only.
 * Plays on main menu and during matches; preloads during the boot splash.
 */
(function () {
  const STORAGE_VOL = 'wodMusicVolume';
  const STORAGE_MUTE = 'wodMusicMuted';
  const PLAYLIST_URL = 'sounds/music/playlist.json';

  let tracks = [];
  let audio = null;
  let index = 0;
  let wanted = false;
  let ready = false;
  let loadPromise = null;
  let preloadPromise = null;
  let unlocked = false;
  const cache = new Map(); // file -> HTMLAudioElement (preloaded)

  function clamp01(n) {
    n = Number(n);
    if (!isFinite(n)) return 0.45;
    return Math.max(0, Math.min(1, n));
  }

  function getVolume() {
    try {
      const v = localStorage.getItem(STORAGE_VOL);
      return v == null ? 0.45 : clamp01(v);
    } catch (_) {
      return 0.45;
    }
  }

  function isMuted() {
    try {
      return localStorage.getItem(STORAGE_MUTE) === '1';
    } catch (_) {
      return false;
    }
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
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.volume = isMuted() ? 0 : getVolume();
    audio.addEventListener('ended', () => {
      if (!wanted || !tracks.length) return;
      index = (index + 1) % tracks.length;
      playCurrent();
    });
    audio.addEventListener('error', () => {
      if (!wanted || !tracks.length) return;
      index = (index + 1) % tracks.length;
      playCurrent();
    });
    return audio;
  }

  function trackUrl(file) {
    return 'sounds/music/' + file;
  }

  function playCurrent() {
    if (!wanted || !tracks.length) return;
    const t = tracks[index];
    if (!t || !t.file) return;
    const a = ensureAudio();
    const src = trackUrl(t.file);
    if (a.getAttribute('data-file') !== t.file) {
      a.setAttribute('data-file', t.file);
      // Prefer a preloaded element’s buffered URL when available
      const cached = cache.get(t.file);
      a.src = cached && cached.src ? cached.src : src;
    }
    a.volume = isMuted() ? 0 : getVolume();
    const p = a.play();
    if (p && typeof p.catch === 'function') {
      p.catch(() => {
        /* autoplay may be blocked until a user gesture unlocks audio */
      });
    }
  }

  async function loadPlaylist() {
    if (ready) return tracks;
    if (loadPromise) return loadPromise;
    loadPromise = fetch(PLAYLIST_URL, { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('playlist ' + r.status))))
      .then((data) => {
        tracks = Array.isArray(data.tracks) ? data.tracks.filter((t) => t && t.file) : [];
        ready = true;
        return tracks;
      })
      .catch((e) => {
        console.warn('Music playlist failed to load', e);
        tracks = [];
        ready = true;
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
   */
  async function preloadAll(onProgress) {
    await loadPlaylist();
    if (preloadPromise) return preloadPromise;
    preloadPromise = (async () => {
      const list = tracks.slice();
      if (!list.length) return { loaded: 0, total: 0 };
      let loaded = 0;
      // First track first (menu starts sooner), then the rest in parallel batches
      if (list[0]) {
        if (onProgress) onProgress(0.02, 'Loading music…');
        await preloadOne(list[0].file);
        loaded = 1;
        if (onProgress) onProgress(loaded / list.length, 'Loading music…');
      }
      const rest = list.slice(1);
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
    await loadPlaylist();
    if (!tracks.length) return;
    if (index < 0 || index >= tracks.length) index = 0;
    playCurrent();
  }

  /** Keep playlist running (menu ↔ match). Only pauses if muted externally via stop(). */
  function stop() {
    wanted = false;
    if (audio) {
      try { audio.pause(); } catch (_) {}
    }
  }

  function skip() {
    if (!tracks.length) return;
    index = (index + 1) % tracks.length;
    if (wanted) playCurrent();
  }

  function unlockFromGesture() {
    if (unlocked) return;
    unlocked = true;
    const a = ensureAudio();
    // Silent unlock trick then resume intended playback
    const prevVol = a.volume;
    a.volume = 0;
    const p = a.play();
    const resume = () => {
      a.volume = isMuted() ? 0 : getVolume();
      if (wanted) playCurrent();
    };
    if (p && typeof p.then === 'function') p.then(resume).catch(resume);
    else resume();
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
    syncUi();
  }

  function bindUnlockGestures() {
    if (window._wodMusicUnlockBound) return;
    window._wodMusicUnlockBound = true;
    const unlock = () => {
      unlockFromGesture();
      if (wanted) start();
    };
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => {
      window.addEventListener(ev, unlock, { once: true, capture: true });
    });
  }

  window.wodMusic = {
    start,
    stop,
    skip,
    setVolume,
    setMuted,
    getVolume,
    isMuted,
    bindUi,
    loadPlaylist,
    preloadAll,
    unlockFromGesture,
    bindUnlockGestures,
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
