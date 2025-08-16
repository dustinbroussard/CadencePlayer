#!/bin/bash

# --- Code Maniac Project Scaffold Script ---
# Sets up the directory structure and populates all the files
# for the enhanced Cadence Player.

set -e
echo "Code Maniac is deploying a new reality..."

# Create project directories
echo "Creating project directories..."
mkdir -p assets
mkdir -p src/js
mkdir -p src/css

# --- Create package.json ---
echo "Creating package.json..."
cat << 'EOF' > package.json
{
  "name": "cadence-player-enhanced",
  "version": "2.0.0",
  "description": "An enhanced Electron music player with a custom visualizer and modern UI/UX.",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "NODE_ENV=development electron .",
    "dist": "electron-builder"
  },
  "keywords": [
    "electron",
    "music",
    "player",
    "audio",
    "visualizer"
  ],
  "author": "Code Maniac",
  "license": "MIT",
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.13.3",
    "electron-reload": "^2.0.0-alpha.1"
  },
  "build": {
    "appId": "com.codemaniac.cadence",
    "productName": "Cadence Player",
    "linux": {
      "target": "AppImage",
      "category": "AudioVideo"
    },
    "mac": {
      "category": "public.app-category.music"
    },
    "win": {
      "target": "nsis"
    },
    "files": [
      "main.js",
      "index.html",
      "src/**/*",
      "assets/**/*"
    ]
  }
}
EOF

# --- Create main.js ---
echo "Creating main.js..."
cat << 'EOF' > main.js
const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Enable live reload for development
if (process.env.NODE_ENV === 'development') {
  try {
    require('electron-reload')(__dirname, {
      electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
      hardResetMethod: 'exit'
    });
  } catch (e) {
    console.error('electron-reload not found. Run "npm install electron-reload --save-dev".');
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// IPC Handlers
ipcMain.handle('select-audio-files', async () => {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] }]
  });

  if (result.canceled) {
    return [];
  } else {
    return result.filePaths.map(filePath => {
      const fileName = path.basename(filePath);
      return { path: filePath, name: fileName };
    });
  }
});

// App event handlers
app.whenReady().then(() => {
  createWindow();

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
EOF

# --- Create index.html ---
echo "Creating index.html..."
cat << 'EOF' > index.html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Cadence Player</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="src/css/styles.css">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
</head>
<body>
  <div class="titlebar">
    <div class="titlebar-title">
      <span class="material-symbols-outlined">
        radio
      </span>
      <span>Cadence Player</span>
    </div>
    <div class="titlebar-controls">
      <button id="minimize-btn" class="titlebar-btn">
        <span class="material-symbols-outlined">minimize</span>
      </button>
      <button id="maximize-btn" class="titlebar-btn">
        <span class="material-symbols-outlined">crop_square</span>
      </button>
      <button id="close-btn" class="titlebar-btn close-btn">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  </div>

  <div class="app-container">
    <div class="top-section">
      <div class="sidebar">
        <div class="file-actions">
          <button id="add-files-btn" class="control-btn">
            <span class="material-symbols-outlined">
              add_circle
            </span>
            Add Files
          </button>
          <button id="clear-queue-btn" class="control-btn">
            <span class="material-symbols-outlined">
              playlist_remove
            </span>
            Clear Queue
          </button>
          <button id="dark-mode-toggle" class="control-btn toggle-btn">
            <span class="material-symbols-outlined light-icon">
              light_mode
            </span>
            <span class="material-symbols-outlined dark-icon">
              dark_mode
            </span>
          </button>
        </div>
        <ul id="queue" class="queue-list"></ul>
      </div>

      <div class="main-content">
        <div id="visualizer-container">
          <canvas id="visualizer" class="visualizer-canvas"></canvas>
        </div>
      </div>
    </div>

    <div class="player-bar-container">
      <div class="track-info">
        <div id="current-track-name" class="track-name">No track loaded</div>
        <div id="current-track-duration" class="track-duration"></div>
      </div>

      <div class="player-controls">
        <div class="control-group">
          <button id="shuffle-btn" class="player-control-btn toggle-btn inactive">
            <span class="material-symbols-outlined">
              shuffle
            </span>
          </button>
          <button id="prev-btn" class="player-control-btn">
            <span class="material-symbols-outlined">
              skip_previous
            </span>
          </button>
          <button id="play-pause-btn" class="player-control-btn main-btn">
            <span id="play-icon" class="material-symbols-outlined">
              play_arrow
            </span>
            <span id="pause-icon" class="material-symbols-outlined hidden">
              pause
            </span>
          </button>
          <button id="next-btn" class="player-control-btn">
            <span class="material-symbols-outlined">
              skip_next
            </span>
          </button>
          <button id="repeat-btn" class="player-control-btn toggle-btn inactive">
            <span class="material-symbols-outlined">
              repeat
            </span>
          </button>
        </div>
        <div id="progress-container" class="progress-container">
          <input type="range" id="progress-bar" value="0" min="0" max="100" class="progress-bar">
        </div>
      </div>

      <div class="volume-and-eq">
        <div class="volume-control">
          <span class="material-symbols-outlined">
            volume_up
          </span>
          <input type="range" id="volume-slider" min="0" max="1" step="0.01" value="1" class="volume-slider">
        </div>
        <div class="eq-controls-container">
          <button id="toggle-eq-btn" class="player-control-btn">
            <span class="material-symbols-outlined">
              equalizer
            </span>
          </button>
          <div id="eq-controls" class="eq-controls hidden"></div>
        </div>
      </div>
    </div>
  </div>

  <script src="src/js/renderer.js" type="module"></script>
</body>
</html>
EOF

# --- Create preload.js ---
echo "Creating preload.js..."
cat << 'EOF' > preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Main process communication for file selection
  selectAudioFiles: () => ipcRenderer.invoke('select-audio-files'),
  
  // Custom title bar controls
  minimizeWindow: () => ipcRenderer.send('minimize'),
  maximizeWindow: () => ipcRenderer.send('maximize'),
  closeWindow: () => ipcRenderer.send('close')
});
EOF

# --- Create renderer.js ---
echo "Creating src/js/renderer.js..."
cat << 'EOF' > src/js/renderer.js
import { AudioManager } from './audio-manager.js';
import { Visualizer } from './visualizer.js';

class Renderer {
  constructor() {
    this.audioManager = new AudioManager();
    this.visualizer = new Visualizer('visualizer', this.audioManager.getAnalyser());
    
    // UI Elements
    this.addFilesBtn = document.getElementById('add-files-btn');
    this.clearQueueBtn = document.getElementById('clear-queue-btn');
    this.queueEl = document.getElementById('queue');
    this.trackNameEl = document.getElementById('current-track-name');
    this.trackDurationEl = document.getElementById('current-track-duration');
    this.playPauseBtn = document.getElementById('play-pause-btn');
    this.playIcon = document.getElementById('play-icon');
    this.pauseIcon = document.getElementById('pause-icon');
    this.nextBtn = document.getElementById('next-btn');
    this.prevBtn = document.getElementById('prev-btn');
    this.progressBar = document.getElementById('progress-bar');
    this.volumeSlider = document.getElementById('volume-slider');
    this.shuffleBtn = document.getElementById('shuffle-btn');
    this.repeatBtn = document.getElementById('repeat-btn');
    this.toggleEqBtn = document.getElementById('toggle-eq-btn');
    this.eqControls = document.getElementById('eq-controls');
    this.darkModeToggle = document.getElementById('dark-mode-toggle');

    // Custom title bar buttons
    this.minimizeBtn = document.getElementById('minimize-btn');
    this.maximizeBtn = document.getElementById('maximize-btn');
    this.closeBtn = document.getElementById('close-btn');

    this.initEventListeners();
    this.initEqControls();
    this.initDragAndDrop();
  }

  initEventListeners() {
    // Custom title bar
    this.minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    this.maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
    this.closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

    // Music Player Controls
    this.addFilesBtn.addEventListener('click', () => this.addFiles());
    this.clearQueueBtn.addEventListener('click', () => this.clearQueue());
    this.playPauseBtn.addEventListener('click', () => this.togglePlayback());
    this.nextBtn.addEventListener('click', () => this.nextTrack());
    this.prevBtn.addEventListener('click', () => this.prevTrack());
    this.volumeSlider.addEventListener('input', (e) => this.audioManager.setVolume(e.target.value));
    this.progressBar.addEventListener('input', (e) => this.seekTrack(e.target.value));
    this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
    this.toggleEqBtn.addEventListener('click', () => this.toggleEq());
    this.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());

    // Audio Manager events
    this.audioManager.on('track-loaded', (track) => this.updateTrackInfo(track));
    this.audioManager.on('playback-ended', () => this.handlePlaybackEnd());
    this.audioManager.on('queue-updated', () => this.renderQueue());

    // Start the visualizer
    this.visualizer.start();
    requestAnimationFrame(this.update.bind(this));
  }

  // File handling
  async addFiles() {
    const files = await window.electronAPI.selectAudioFiles();
    if (files.length > 0) {
      this.audioManager.addFilesToQueue(files);
    }
  }

  initDragAndDrop() {
    const dropZone = document.body;
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('audio/')).map(f => ({ path: f.path, name: f.name }));
      if (files.length > 0) {
        this.audioManager.addFilesToQueue(files);
      }
    });
  }

  // Player controls
  togglePlayback() {
    if (this.audioManager.isPlaying) {
      this.audioManager.pause();
      this.playIcon.classList.remove('hidden');
      this.pauseIcon.classList.add('hidden');
    } else {
      this.audioManager.play();
      this.playIcon.classList.add('hidden');
      this.pauseIcon.classList.remove('hidden');
    }
  }

  nextTrack() {
    this.audioManager.playNext();
    this.playIcon.classList.add('hidden');
    this.pauseIcon.classList.remove('hidden');
  }

  prevTrack() {
    this.audioManager.playPrev();
    this.playIcon.classList.add('hidden');
    this.pauseIcon.classList.remove('hidden');
  }
  
  seekTrack(value) {
    this.audioManager.seek(value / 100);
  }

  // UI rendering
  updateTrackInfo(track) {
    this.trackNameEl.textContent = track ? track.name : 'No track loaded';
    this.progressBar.value = 0;
    this.trackDurationEl.textContent = track ? '0:00 / ' + this.formatTime(track.duration) : '';
  }

  handlePlaybackEnd() {
    this.nextTrack();
  }

  renderQueue() {
    this.queueEl.innerHTML = '';
    this.audioManager.getQueue().forEach((track, index) => {
      const li = document.createElement('li');
      li.className = 'queue-item';
      if (index === this.audioManager.getCurrentIndex()) {
        li.classList.add('playing');
      }
      li.textContent = track.name;
      li.dataset.index = index;
      li.addEventListener('click', () => {
        this.audioManager.playTrack(index);
        this.playIcon.classList.add('hidden');
        this.pauseIcon.classList.remove('hidden');
      });
      this.queueEl.appendChild(li);
    });
  }

  // EQ and visualizer
  initEqControls() {
    this.audioManager.getFilters().forEach((filter, i) => {
      const container = document.createElement('div');
      container.className = 'slider-container';

      const label = document.createElement('label');
      label.textContent = filter.frequency.value < 1000 ? `${filter.frequency.value}Hz` : `${filter.frequency.value / 1000}kHz`;
      label.className = 'freq-label';
      label.setAttribute('for', `eq-slider-${i}`);

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.id = `eq-slider-${i}`;
      slider.className = 'eq-slider';
      slider.min = -20;
      slider.max = 20;
      slider.step = 1;
      slider.value = 0;
      slider.dataset.index = i;

      slider.addEventListener('input', (e) => {
        this.audioManager.setEqGain(e.target.dataset.index, e.target.value);
      });

      container.appendChild(label);
      container.appendChild(slider);
      this.eqControls.appendChild(container);
    });
  }

  toggleEq() {
    this.eqControls.classList.toggle('hidden');
    this.toggleEqBtn.classList.toggle('active');
  }

  toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
  }

  toggleShuffle() {
    this.audioManager.toggleShuffle();
    this.shuffleBtn.classList.toggle('inactive');
  }

  toggleRepeat() {
    this.audioManager.toggleRepeat();
    this.repeatBtn.classList.toggle('inactive');
  }

  // Animation Loop
  update() {
    if (this.audioManager.isPlaying) {
      this.visualizer.draw();
      this.updateProgressBar();
    }
    requestAnimationFrame(this.update.bind(this));
  }

  updateProgressBar() {
    const { currentTime, duration } = this.audioManager.getCurrentSource();
    if (duration > 0) {
      const progress = (currentTime / duration) * 100;
      this.progressBar.value = progress;
      this.trackDurationEl.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
    }
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new Renderer();
});

window.addEventListener('blur', () => {
  document.body.classList.add('is-inactive');
});

window.addEventListener('focus', () => {
  document.body.classList.remove('is-inactive');
});

EOF

# --- Create audio-manager.js ---
echo "Creating src/js/audio-manager.js..."
cat << 'EOF' > src/js/audio-manager.js
export class AudioManager {
  constructor() {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.source = null;
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isShuffled = false;
    this.isRepeating = false;
    this.eventListeners = new Map();
    this.connectNodes();
    
    // EQ setup
    this.filters = [60, 230, 910, 4000, 14000].map(f => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = f;
      filter.gain.value = 0;
      filter.Q.value = 1;
      return filter;
    });

    // Resume context on user gesture
    document.addEventListener('click', () => {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }, { once: true });
  }

  on(eventName, listener) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(listener);
  }

  emit(eventName, ...args) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }

  getAnalyser() {
    return this.analyser;
  }

  getFilters() {
    return this.filters;
  }

  getQueue() {
    return this.queue;
  }

  getCurrentSource() {
    return this.source ? this.source.mediaElement : { currentTime: 0, duration: 0 };
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  connectNodes() {
    this.filters.reduce((prevNode, currNode) => {
      prevNode.connect(currNode);
      return currNode;
    }, this.ctx.destination); // Start with destination

    this.filters.reduce((prevNode, currNode) => {
        prevNode.connect(currNode);
        return currNode;
    }, this.analyser); // Start with analyser

    this.filters[this.filters.length - 1].connect(this.ctx.destination);
    this.analyser.connect(this.ctx.destination);
  }

  async addFilesToQueue(files) {
    for (const file of files) {
      // Create a blob URL to load the file
      const blob = await fetch(`file://${file.path}`).then(r => r.blob());
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      // Get duration before adding to queue
      await new Promise(resolve => {
        audio.onloadedmetadata = () => {
          this.queue.push({ 
            path: file.path, 
            name: file.name, 
            url: url, 
            audio: audio,
            duration: audio.duration
          });
          resolve();
        };
      });
    }
    this.emit('queue-updated');
    if (this.queue.length === files.length) {
      this.playTrack(0);
    }
  }

  clearQueue() {
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    if (this.source) {
      this.source.disconnect();
      this.source.mediaElement.pause();
      this.source.mediaElement.currentTime = 0;
    }
    this.emit('track-loaded', null);
    this.emit('queue-updated');
  }

  play() {
    if (this.source && this.source.mediaElement.paused) {
      this.source.mediaElement.play();
      this.isPlaying = true;
    }
  }

  pause() {
    if (this.source && !this.source.mediaElement.paused) {
      this.source.mediaElement.pause();
      this.isPlaying = false;
    }
  }
  
  playTrack(index) {
    if (this.source) {
      this.source.mediaElement.pause();
      this.source.disconnect();
    }
    
    this.currentIndex = index;
    const track = this.queue[this.currentIndex];
    if (!track) return;
    
    // Create new source from existing audio element
    this.source = this.ctx.createMediaElementSource(track.audio);

    // Connect the source to the filter chain and analyser
    this.source.connect(this.filters[0]);
    this.source.connect(this.analyser);
    
    track.audio.currentTime = 0;
    track.audio.play();
    this.isPlaying = true;
    
    track.audio.onended = () => {
      this.emit('playback-ended');
    };
    
    this.emit('track-loaded', track);
    this.emit('queue-updated'); // Re-render queue to highlight playing track
  }
  
  playNext() {
    let nextIndex = this.currentIndex + 1;
    if (this.isShuffled) {
      const remainingTracks = this.queue.filter((_, i) => i !== this.currentIndex);
      if (remainingTracks.length > 0) {
        const randomTrack = remainingTracks[Math.floor(Math.random() * remainingTracks.length)];
        nextIndex = this.queue.findIndex(track => track.path === randomTrack.path);
      } else {
        nextIndex = 0; // Restart shuffle if all tracks played
      }
    } else if (this.isRepeating) {
      nextIndex = this.currentIndex;
    } else {
      if (nextIndex >= this.queue.length) {
        nextIndex = 0;
      }
    }
    this.playTrack(nextIndex);
  }
  
  playPrev() {
    let prevIndex = this.currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.queue.length - 1;
    }
    this.playTrack(prevIndex);
  }

  setVolume(value) {
    if (this.source) {
      this.source.mediaElement.volume = value;
    }
  }
  
  seek(progress) {
    if (this.source) {
      this.source.mediaElement.currentTime = this.source.mediaElement.duration * progress;
    }
  }
  
  setEqGain(index, value) {
    if (this.filters[index]) {
      this.filters[index].gain.value = parseFloat(value);
    }
  }

  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    this.isRepeating = false;
  }

  toggleRepeat() {
    this.isRepeating = !this.isRepeating;
    this.isShuffled = false;
  }
}
EOF

# --- Create visualizer.js ---
echo "Creating src/js/visualizer.js..."
cat << 'EOF' > src/js/visualizer.js
export class Visualizer {
  constructor(canvasId, analyser) {
    this.canvas = document.getElementById(canvasId);
    this.canvasCtx = this.canvas.getContext('2d');
    this.analyser = analyser;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.hue = 0;
    this.particles = [];
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  start() {
    this.draw();
  }

  draw() {
    if (!this.analyser) return;

    this.analyser.getByteFrequencyData(this.dataArray);
    
    this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const baseRadius = Math.min(centerX, centerY) * 0.4;
    
    this.hue = (this.hue + 0.5) % 360;

    this.drawPulseOrb(centerX, centerY, baseRadius);
    this.drawFrequencyBars(centerX, centerY, baseRadius);
  }

  drawPulseOrb(centerX, centerY, baseRadius) {
    const frequencyValue = this.dataArray.reduce((sum, val) => sum + val, 0) / this.dataArray.length;
    const dynamicRadius = baseRadius + frequencyValue * 0.2;
    const orbHue = this.hue;
    
    // Outer glow
    this.canvasCtx.beginPath();
    this.canvasCtx.arc(centerX, centerY, dynamicRadius, 0, Math.PI * 2);
    this.canvasCtx.fillStyle = `hsla(${orbHue}, 100%, 70%, 0.1)`;
    this.canvasCtx.shadowBlur = 30;
    this.canvasCtx.shadowColor = `hsl(${orbHue}, 100%, 70%)`;
    this.canvasCtx.fill();
    this.canvasCtx.shadowBlur = 0;

    // Core orb
    this.canvasCtx.beginPath();
    this.canvasCtx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
    const gradient = this.canvasCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius);
    gradient.addColorStop(0, `hsla(${orbHue + 40}, 100%, 80%, 1)`);
    gradient.addColorStop(0.5, `hsla(${orbHue}, 100%, 60%, 0.6)`);
    gradient.addColorStop(1, `hsla(${orbHue - 20}, 100%, 40%, 0.2)`);
    this.canvasCtx.fillStyle = gradient;
    this.canvasCtx.fill();
  }

  drawFrequencyBars(centerX, centerY, baseRadius) {
    const barCount = 100;
    const angleStep = (Math.PI * 2) / barCount;
    const dataSize = this.dataArray.length;
    
    for (let i = 0; i < barCount; i++) {
      const angle = i * angleStep;
      const freqIndex = Math.floor((i / barCount) * dataSize);
      const barHeight = this.dataArray[freqIndex] * 0.8;
      
      const startRadius = baseRadius + 10;
      const endRadius = startRadius + barHeight;
      
      const startX = centerX + Math.cos(angle) * startRadius;
      const startY = centerY + Math.sin(angle) * startRadius;
      const endX = centerX + Math.cos(angle) * endRadius;
      const endY = centerY + Math.sin(angle) * endRadius;
      
      const barHue = (this.hue + (i * 360 / barCount)) % 360;
      this.canvasCtx.strokeStyle = `hsl(${barHue}, 100%, 70%)`;
      this.canvasCtx.lineWidth = 2;
      
      this.canvasCtx.beginPath();
      this.canvasCtx.moveTo(startX, startY);
      this.canvasCtx.lineTo(endX, endY);
      this.canvasCtx.stroke();
    }
  }
}
EOF

# --- Create styles.css ---
echo "Creating src/css/styles.css..."
cat << 'EOF' > src/css/styles.css
/* --------------------------------------------------------------------------------
 * Global & Resets
 * -------------------------------------------------------------------------------- */
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap');
:root {
  --bg-color: #0c0c0c;
  --bg-gradient: linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 50%, #16213e 100%);
  --sidebar-bg: rgba(17, 17, 17, 0.5);
  --header-bg: rgba(17, 17, 17, 0.9);
  --text-color: #f0f0f0;
  --text-secondary: #aaaaaa;
  --accent-color: #4CAF50;
  --btn-bg: rgba(45, 45, 45, 0.7);
  --btn-hover-bg: rgba(68, 68, 68, 0.8);
  --border-color: rgba(255, 255, 255, 0.1);
  --playing-bg: rgba(76, 175, 80, 0.1);
  --playing-border: rgba(76, 175, 80, 0.5);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Poppins', sans-serif;
  background: var(--bg-gradient);
  color: var(--text-color);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s ease;
}

body.dark-mode {
  --bg-color: #f0f0f0;
  --bg-gradient: linear-gradient(135deg, #e0e0e0 0%, #f0f0f0 50%, #ffffff 100%);
  --sidebar-bg: rgba(240, 240, 240, 0.8);
  --header-bg: rgba(255, 255, 255, 0.9);
  --text-color: #333;
  --text-secondary: #666;
  --accent-color: #4CAF50;
  --btn-bg: rgba(220, 220, 220, 0.7);
  --btn-hover-bg: rgba(200, 200, 200, 0.8);
  --border-color: rgba(0, 0, 0, 0.1);
  --playing-bg: rgba(76, 175, 80, 0.1);
  --playing-border: rgba(76, 175, 80, 0.5);
}

body.drag-over .app-container {
  border: 4px dashed var(--accent-color);
  background: rgba(76, 175, 80, 0.1);
}

.hidden {
  display: none !important;
}

/* --------------------------------------------------------------------------------
 * Title Bar (Custom Electron Frame)
 * -------------------------------------------------------------------------------- */
.titlebar {
  -webkit-app-region: drag;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 10px;
  height: 35px;
  background: var(--header-bg);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--border-color);
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
}

.titlebar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.titlebar-controls {
  -webkit-app-region: no-drag;
}

.titlebar-btn {
  background: transparent;
  border: none;
  color: var(--text-color);
  font-size: 20px;
  width: 40px;
  height: 34px;
  cursor: pointer;
  transition: background 0.2s;
  opacity: 0.7;
}

.titlebar-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  opacity: 1;
}

.titlebar-btn.close-btn:hover {
  background: #e74c3c;
  color: white;
}

/* --------------------------------------------------------------------------------
 * Layout
 * -------------------------------------------------------------------------------- */
.app-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 35px);
  margin-top: 35px;
  padding: 20px;
  gap: 20px;
  transition: border 0.3s ease;
}

.top-section {
  flex-grow: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
}

.sidebar {
  width: 300px;
  background: var(--sidebar-bg);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow: hidden;
}

.main-content {
  flex-grow: 1;
  background: var(--sidebar-bg);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.player-bar-container {
  background: var(--sidebar-bg);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  padding: 15px 30px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 90px;
}

/* --------------------------------------------------------------------------------
 * Sidebar and Queue
 * -------------------------------------------------------------------------------- */
.file-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.queue-list {
  flex-grow: 1;
  list-style: none;
  overflow-y: auto;
  padding-right: 10px;
}

.queue-list::-webkit-scrollbar {
  width: 8px;
}

.queue-list::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

.queue-item {
  padding: 10px 15px;
  margin-bottom: 8px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.2s, background 0.2s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
  border: 1px solid transparent;
}

.queue-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateX(5px);
}

.queue-item.playing {
  background: var(--playing-bg);
  border-color: var(--playing-border);
  box-shadow: 0 0 15px var(--playing-border);
  position: relative;
}

.queue-item.playing::before {
  content: '▶';
  position: absolute;
  left: -15px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--accent-color);
  font-size: 14px;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* --------------------------------------------------------------------------------
 * Visualizer
 * -------------------------------------------------------------------------------- */
#visualizer-container {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.visualizer-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* --------------------------------------------------------------------------------
 * Player Bar
 * -------------------------------------------------------------------------------- */
.track-info {
  flex-basis: 25%;
  min-width: 0;
}

.track-name {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-color);
}

.track-duration {
  font-size: 12px;
  color: var(--text-secondary);
}

.player-controls {
  flex-basis: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.control-group {
  display: flex;
  gap: 15px;
}

.player-control-btn {
  background: var(--btn-bg);
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  color: var(--text-color);
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: background 0.2s, transform 0.2s;
}

.player-control-btn:hover {
  background: var(--btn-hover-bg);
  transform: scale(1.05);
}

.player-control-btn.main-btn {
  width: 50px;
  height: 50px;
  background: var(--accent-color);
  color: white;
}

.player-control-btn.main-btn:hover {
  background: var(--accent-color);
  transform: scale(1.1);
}

.player-control-btn.toggle-btn.inactive {
  opacity: 0.5;
}

.player-control-btn.toggle-btn.inactive:hover {
  opacity: 1;
}

.progress-container {
  width: 100%;
  display: flex;
  align-items: center;
}

.progress-bar {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 5px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 5px;
  cursor: pointer;
  outline: none;
  transition: background 0.2s;
}

.progress-bar::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 15px;
  height: 15px;
  background: var(--accent-color);
  border-radius: 50%;
  cursor: pointer;
}

.progress-bar::-moz-range-thumb {
  width: 15px;
  height: 15px;
  background: var(--accent-color);
  border-radius: 50%;
  cursor: pointer;
}

.volume-and-eq {
  flex-basis: 25%;
  display: flex;
  justify-content: flex-end;
  gap: 20px;
  align-items: center;
}

.volume-control {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100px;
}

.volume-slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 5px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 5px;
  cursor: pointer;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 12px;
  height: 12px;
  background: var(--text-color);
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 12px;
  height: 12px;
  background: var(--text-color);
  border-radius: 50%;
  cursor: pointer;
}

.eq-controls-container {
  position: relative;
}

.eq-controls {
  position: absolute;
  bottom: 60px;
  right: 0;
  display: flex;
  flex-direction: row;
  gap: 10px;
  background: var(--sidebar-bg);
  backdrop-filter: blur(10px);
  padding: 15px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  z-index: 10;
  transition: transform 0.3s ease-out, opacity 0.3s ease-out;
}

.eq-controls.hidden {
  transform: translateY(20px);
  opacity: 0;
  pointer-events: none;
}

.slider-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.eq-slider {
  -webkit-appearance: slider-vertical;
  appearance: slider-vertical;
  width: 8px;
  height: 100px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  cursor: pointer;
}

.eq-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: var(--accent-color);
  border-radius: 50%;
  border: none;
  margin-top: -4px;
}

.freq-label {
  font-size: 10px;
  color: var(--text-secondary);
}

/* --------------------------------------------------------------------------------
 * UI Elements
 * -------------------------------------------------------------------------------- */
.material-symbols-outlined {
  font-variation-settings:
    'FILL' 0,
    'wght' 400,
    'GRAD' 0,
    'opsz' 24
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 15px;
  background: var(--btn-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-color);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, transform 0.2s;
}

.control-btn:hover {
  background: var(--btn-hover-bg);
  transform: translateY(-2px);
}
EOF

# --- Create assets directory ---
echo "Creating empty 'assets' directory for custom icon..."
# The user's original `main.js` references an icon, so I'll create a placeholder for it.
echo "" > assets/icon.png

echo "Setup complete! Now run 'npm install' to get dependencies, then 'npm start' to run the player."
echo "Code Maniac out."
