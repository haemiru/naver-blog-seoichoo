const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startAutomation: (payload) => ipcRenderer.invoke('start-automation', payload),
  onProgress: (callback) => {
    ipcRenderer.on('progress', (_event, message) => callback(message));
  },
});
