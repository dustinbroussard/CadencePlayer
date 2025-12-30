const path = require('path');
const { pathToFileURL } = require('url');

const { app, BrowserWindow, ipcMain, shell, Menu, dialog } = require('electron');

// Enable live reload for development
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
  } catch (e) {
    console.error('electron-reload not found. Run "npm install electron-reload --save-dev".', e);
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false, // Don't show until ready
    frame: false, // Custom title bar
    titleBarStyle: 'hidden', // Hide title bar on macOS
    icon: path.join(__dirname, 'assets', 'icon.png'),
    // Prevent white flash while loading renderer
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Harden navigation: deny window.open and external navigation
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

function setAppMenu() {
  app.setAboutPanelOptions?.({
    applicationName: 'Cadence Player',
    applicationVersion: app.getVersion(),
    credits: 'Code Maniac',
  });

  const showShortcuts = () => {
    const msg = [
      'Keyboard Shortcuts:',
      '',
      'Space: Play/Pause',
      'Arrow Left/Right: Seek ±5s',
      'Arrow Up/Down: Volume ±5%',
      'S: Toggle Shuffle',
      'R: Toggle Repeat',
      'M: Toggle Chords',
      'C: Cycle Chord Mode',
      'D: Toggle Diagnostics Overlay',
      'Esc: Close panels/menus',
    ].join('\n');
    dialog.showMessageBox({ type: 'info', buttons: ['OK'], title: 'Keyboard Shortcuts', message: msg });
  };

  const template = [];
  if (process.platform === 'darwin') {
    template.push({ role: 'appMenu' });
  } else {
    template.push({ label: 'File', submenu: [{ role: 'quit' }] });
  }

  template.push(
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(process.env.NODE_ENV === 'development' ? [{ role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Keyboard Shortcuts', click: showShortcuts },
        { type: 'separator' },
        { label: 'About Cadence Player', click: () => (app.showAboutPanel ? app.showAboutPanel() : showShortcuts()) },
      ],
    }
  );

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC Handlers
ipcMain.handle('select-audio-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    // Keep in sync with renderer drag-and-drop acceptance
    filters: [{ name: 'Media Files', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'mp4', 'm4v', 'webm'] }]
  });

  if (result.canceled) {
    return [];
  } else {
    return result.filePaths.map(filePath => {
      const fileName = path.basename(filePath);
      const url = pathToFileURL(filePath).href;
      return { path: filePath, name: fileName, url };
    });
  }
});

// Convert filesystem paths to safe file:// URLs (for drag-and-drop)
ipcMain.handle('paths-to-file-urls', async (_evt, filePaths = []) => {
  try {
    return filePaths.map(fp => {
      const fileName = path.basename(fp);
      const url = pathToFileURL(fp).href;
      return { path: fp, name: fileName, url };
    });
  } catch (e) {
    console.error('Failed to convert paths to file URLs', e);
    return [];
  }
});

// Read metadata using music-metadata
ipcMain.handle('read-metadata', async (_evt, filePath) => {
  try {
    const mm = require('music-metadata');
    const meta = await mm.parseFile(filePath, { duration: false });
    const { common } = meta || {};
    return {
      success: true,
      tags: {
        title: common?.title || '',
        artist: (common?.artist || '') || (Array.isArray(common?.artists) ? common.artists.join(', ') : ''),
        album: common?.album || '',
        year: common?.year ? String(common.year) : '',
        genre: Array.isArray(common?.genre) ? common.genre.join(', ') : (common?.genre || '')
      }
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Check if paths exist on disk
ipcMain.handle('check-paths-exist', async (_evt, filePaths = []) => {
  try {
    const fs = require('fs');
    return filePaths.map(fp => {
      try { return fs.existsSync(fp); } catch { return false; }
    });
  } catch (e) {
    console.error('check-paths-exist failed', e);
    return filePaths.map(() => false);
  }
});

// Write metadata (currently supports MP3 via node-id3)
ipcMain.handle('write-metadata', async (_evt, payload) => {
  const { filePath, tags } = payload || {};
  try {
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    if (ext === 'mp3') {
      const NodeID3 = require('node-id3');
      const id3Tags = {
        title: tags?.title || undefined,
        artist: tags?.artist || undefined,
        album: tags?.album || undefined,
        year: tags?.year || undefined,
        genre: tags?.genre || undefined
      };
      const ok = NodeID3.update(id3Tags, filePath);
      return ok ? { success: true } : { success: false, error: 'Failed to write ID3 tags' };
    }
    // Unsupported write: report gracefully
    return { success: false, error: `Writing tags not supported for .${ext} yet` };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Reveal in folder
ipcMain.handle('reveal-in-folder', async (_evt, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// App event handlers
app.whenReady().then(() => {
  createWindow();
  setAppMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Custom title bar IPC
ipcMain.on('minimize', () => mainWindow.minimize());
ipcMain.on('maximize', () => {
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});
ipcMain.on('close', () => mainWindow.close());
