const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('simpleWarsDesktop', {
  quit() {
    ipcRenderer.send('simple-wars-quit');
  },
  unlockAchievement(id) {
    ipcRenderer.send('simple-wars-achievement', id);
  },
  store(action, payload) {
    return ipcRenderer.invoke('simple-wars-store', action, payload);
  },
  onStoreUpdate(callback) {
    if (typeof callback !== 'function') return;
    const listener = (_event, result) => callback(result);
    ipcRenderer.on('simple-wars-store-update', listener);
    return () => ipcRenderer.removeListener('simple-wars-store-update', listener);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  document.documentElement.dataset.simpleWarsDesktop = '1';
});
