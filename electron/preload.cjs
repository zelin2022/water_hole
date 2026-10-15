const { contextBridge, ipcRenderer } = require('electron');

// Keep the bridge limited to these two operations; no raw IPC or Node access.
contextBridge.exposeInMainWorld('waterHoleDesktop', {
  setDisplay: (options) => ipcRenderer.invoke('water-hole:set-display', {
    fullscreen: options?.fullscreen,
    width: options?.width,
    height: options?.height,
  }),
  quit: () => ipcRenderer.send('water-hole:quit'),
});
