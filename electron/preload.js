const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startAutomation: (payload) => ipcRenderer.invoke('start-automation', payload),
});
