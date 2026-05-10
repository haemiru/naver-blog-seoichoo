const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startDiscovery: (payload) => ipcRenderer.invoke('start-discovery', payload),
  startApplying: (payload) => ipcRenderer.invoke('start-applying', payload),
  onProgress: (callback) => {
    ipcRenderer.on('progress', (_event, message) => callback(message));
  },
});
