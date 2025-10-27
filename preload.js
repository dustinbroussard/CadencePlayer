const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Main process communication for file selection
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  
  // Custom title bar controls
  minimizeWindow: () => ipcRenderer.send('minimize'),
  maximizeWindow: () => ipcRenderer.send('maximize'),
  closeWindow: () => ipcRenderer.send('close'),

  // Utility: convert dropped file paths to safe file URLs
  pathsToFileUrls: (paths) => ipcRenderer.invoke('paths-to-file-urls', paths),
  // Check if filesystem paths exist
  checkPathsExist: (paths) => ipcRenderer.invoke('check-paths-exist', paths),

  // Metadata: read and write
  readMetadata: (filePath) => ipcRenderer.invoke('read-metadata', filePath),
  writeMetadata: (filePath, tags) => ipcRenderer.invoke('write-metadata', { filePath, tags }),

  // System: reveal file in folder
  revealInFolder: (filePath) => ipcRenderer.invoke('reveal-in-folder', filePath)
});
