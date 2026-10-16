const { contextBridge, ipcRenderer } = require('electron');

// Keep the bridge limited to explicit game operations; no raw IPC or Node access.
contextBridge.exposeInMainWorld('waterHoleDesktop', {
  setDisplay: (options) => ipcRenderer.invoke('water-hole:set-display', {
    fullscreen: options?.fullscreen,
    width: options?.width,
    height: options?.height,
  }),
  openExternal: (url) => ipcRenderer.invoke('water-hole:open-external', url),
  quit: () => ipcRenderer.send('water-hole:quit'),
});
