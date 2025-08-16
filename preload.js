const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Main process communication for file selection
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  
  // Custom title bar controls
  minimizeWindow: () => ipcRenderer.send('minimize'),
  maximizeWindow: () => ipcRenderer.send('maximize'),
  closeWindow: () => ipcRenderer.send('close')
});
