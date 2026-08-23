'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

const { app, BrowserWindow, ipcMain, shell, Menu, dialog, protocol, net, nativeImage, autoUpdater } = require('electron');
const mm = require('music-metadata');

const {
  buildCoverArtPayload,
  clearCoverOverride,
  getEmbeddedPicture,
  persistCoverOverride
} = require('./src/js/cover-art-service.cjs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app-data', privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } }
]);

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

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      // Fallback if dev server is not ready yet
      setTimeout(() => mainWindow.loadURL('http://localhost:3000'), 1000);
    });
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html')).catch(() => {
      // Fallback to root for legacy or single-executable cases
      mainWindow.loadFile(path.join(__dirname, 'index.html'));
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Harden navigation: deny window.open and external navigation
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
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
    const safePaths = Array.isArray(filePaths) ? filePaths.filter(isNonEmptyString) : [];
    return safePaths.map(fp => {
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
    if (!isNonEmptyString(filePath)) {
      return { success: false, error: 'Invalid file path' };
    }
    const meta = await mm.parseFile(filePath, { duration: false });
    const { common } = meta || {};
    const userData = app.getPath('userData');
    const picture = getEmbeddedPicture(common);
    const coverArt = buildCoverArtPayload(filePath, common, userData);

    return {
      success: true,
      tags: {
        title: common?.title || '',
        artist: (common?.artist || '') || (Array.isArray(common?.artists) ? common.artists.join(', ') : ''),
        album: common?.album || '',
        year: common?.year ? String(common.year) : '',
        genre: Array.isArray(common?.genre) ? common.genre.join(', ') : (common?.genre || ''),
        picture: picture ? { data: picture.data, format: picture.format } : null,
        coverArt
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
    const safePaths = Array.isArray(filePaths) ? filePaths.filter(isNonEmptyString) : [];
    return safePaths.map(fp => {
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
    if (!isNonEmptyString(filePath)) {
      return { success: false, error: 'Invalid file path' };
    }
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
    if (!isNonEmptyString(filePath)) {
      return { success: false, error: 'Invalid file path' };
    }
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

// Upload custom cover
ipcMain.handle('upload-custom-cover', async (_evt, { trackPath, imagePath }) => {
  try {
    if (!isNonEmptyString(trackPath) || !isNonEmptyString(imagePath)) {
      return { success: false, error: 'Invalid track or image path.' };
    }
    return persistCoverOverride({
      userDataPath: app.getPath('userData'),
      trackPath,
      imagePath,
      nativeImage
    });
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('select-cover-art-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  if (result.canceled || !result.filePaths.length) {
    return { success: false, canceled: true };
  }
  return { success: true, path: result.filePaths[0] };
});

ipcMain.handle('clear-custom-cover', async (_evt, trackPath) => {
  try {
    if (!isNonEmptyString(trackPath)) {
      return { success: false, error: 'Invalid track path.' };
    }
    return clearCoverOverride({
      userDataPath: app.getPath('userData'),
      trackPath
    });
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

function setupAutoUpdater() {
  if (process.env.NODE_ENV === 'development') {
    return;
  }

  const server = 'https://update.electronjs.org';
  const repo = 'dustinbroussard/CadencePlayer';
  const feedURL = `${server}/${repo}/${process.platform}-${process.arch}/${app.getVersion()}`;

  try {
    autoUpdater.setFeedURL({ url: feedURL });

    // Check for updates every 15 minutes
    setInterval(() => {
      autoUpdater.checkForUpdates();
    }, 15 * 60 * 1000);

    // Initial check after 5 seconds
    setTimeout(() => {
      autoUpdater.checkForUpdates();
    }, 5000);

    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update',
        message: process.platform === 'win32' ? releaseNotes : releaseName,
        detail: 'A new version of Cadence Player has been downloaded. Restart the application to apply the updates.'
      };

      dialog.showMessageBox(mainWindow, dialogOpts).then((returnValue) => {
        if (returnValue.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    });

    autoUpdater.on('error', (err) => {
      console.error('Update error:', err);
    });
  } catch (e) {
    console.error('Failed to configure autoUpdater:', e);
  }
}

// App event handlers
app.whenReady().then(() => {
  protocol.handle('app-data', (request) => {
    let filePath = decodeURIComponent(request.url.slice('app-data://'.length));
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    return net.fetch(pathToFileURL(filePath).href);
  });

  createWindow();
  setAppMenu();
  setupAutoUpdater();

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
