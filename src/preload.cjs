const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dataBar', {
  initialState: () => ipcRenderer.invoke('bar:get-state'),
  resize: height => ipcRenderer.invoke('bar:resize', height),
  refresh: () => ipcRenderer.invoke('bar:refresh'),
  openPortal: () => ipcRenderer.invoke('bar:open-portal'),
  onState: callback => ipcRenderer.on('bar:state', (_event, state) => callback(state)),
  dismiss: () => ipcRenderer.invoke('bar:dismiss')
});
