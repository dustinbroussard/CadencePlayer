import { AudioManager } from './audio-manager.js';
import { Visualizer } from './visualizer.js';
import { ChordDetector } from './chord-detector.js';
import { safeAlert, safeConfirm } from './ui/utils.js';
import { BUILTIN_EQ_PRESETS, getCustomEqPresets } from './ui/eq-presets.js';
import { getSavedQueues } from './ui/queue-storage.js';
import { getChordColors } from './ui/chord-colors.js';

import { QueueManager } from './queue-manager.js';
import { SettingsManager } from './settings-manager.js';
import { ChordUi } from './chord-ui.js';
import { VideoHandler } from './video-handler.js';

export class Renderer {
  constructor() {
    this.audioManager = new AudioManager();
    this.visualizer = new Visualizer('visualizer', this.audioManager.getAnalyser());
    this.chordDetector = new ChordDetector(this.audioManager.getChordAnalyser(), {
      sampleRate: this.audioManager.ctx.sampleRate,
      confEnter: 0.4,
      confExit: 0.32,
      holdMsEnter: 500,
      holdMsExit: 250,
      requiredStableFrames: 2,
      harmonicThreshold: 0.15,
      noiseFloorAlpha: 0.06,
      chromaAlphaFast: 0.4,
      chromaAlphaSlow: 0.15,
      getRms: () => this.audioManager.getCurrentRms(),
      rmsGate: 0.01,
      minSpectralClarity: 0.15
    });
    
    // UI Elements
    this.addFilesBtn = document.getElementById('add-files-btn');
    this.clearQueueBtn = document.getElementById('clear-queue-btn');
    this.queueEl = document.getElementById('queue');
    this.trackNameEl = document.getElementById('current-track-name');
    this.trackDurationEl = document.getElementById('current-track-duration');
    this.chordReadout = document.getElementById('chord-readout');
    this.diagEl = document.getElementById('diag');
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
    this.visualModeBtn = document.getElementById('visual-mode-btn');
    this.visualSettingsBtn = document.getElementById('visual-settings-btn');
    this.vizControls = document.getElementById('viz-controls');
    this.videoContainer = document.getElementById('video-container');
    this.videoOverlay = document.getElementById('video-overlay');
    this.videoPlayPauseBtn = document.getElementById('video-playpause');
    this.videoPlayIcon = document.getElementById('video-play-icon');
    this.videoPauseIcon = document.getElementById('video-pause-icon');
    this.videoSeek = document.getElementById('video-seek');
    this.videoModeChip = document.getElementById('video-mode-chip');
    this.videoChipText = document.getElementById('video-chip-text');
    this.visualizerContainer = document.getElementById('visualizer-container');
    this.coverArtStage = document.getElementById('cover-art-stage');
    this.coverArtCta = document.getElementById('cover-art-cta');
    this.coverDropZone = document.getElementById('cover-drop-zone');
    this.coverFrames = Array.from(document.querySelectorAll('.cover-frame'));
    this.coverImages = Array.from(document.querySelectorAll('.cover-art-image'));
    this.activeCoverFrameIndex = 0;
    this.currentCoverUrl = '';
    this.currentCoverSource = 'placeholder';
    this.pendingCoverRequest = 0;

    // Cache visualization mode
    this._vizMode = localStorage.getItem('vizMode') || 'orb';
    this.prevNonVideoMode = this._vizMode === 'video' ? 'orb' : this._vizMode;
    this.toggleChordsBtn = document.getElementById('toggle-chords-btn');
    this.eqControls = document.getElementById('eq-controls');
    this.eqSliderEls = [];
    this.queueSaveModal = null;
    this.queueNameInput = null;
    this.queueSaveConfirmBtn = null;
    this.queueSaveCancelBtn = null;
    this.darkModeToggle = document.getElementById('dark-mode-toggle');
    this.appMenuBtn = document.getElementById('app-menu-btn');
    this.appMenu = document.getElementById('app-menu');
    this.errorBanner = document.getElementById('error-banner');
    this.errorBannerMessage = document.getElementById('error-banner-message');
    this.errorBannerClose = document.getElementById('error-banner-close');

    // Metadata overrides store
    this.metaOverrides = (() => { try { return JSON.parse(localStorage.getItem('metadataOverrides') || '{}'); } catch { return {}; } })();

    // Custom title bar buttons
    this.minimizeBtn = document.getElementById('minimize-btn');
    this.maximizeBtn = document.getElementById('maximize-btn');
    this.closeBtn = document.getElementById('close-btn');

    // Chord detection state/mode
    this.detectorRunning = false;
    this.chordsEnabled = true;
    this.chordMode = 'lowcpu';
    this.chordPulseTimeout = null;
    this.pendingDetectorStartRaf = null;
    this._updateLoop = this.update.bind(this);

    // Instantiate Sub-modules
    this.queueManager = new QueueManager(this);
    this.settingsManager = new SettingsManager(this);
    this.chordUi = new ChordUi(this);
    this.videoHandler = new VideoHandler(this);

    // Initialize/Restore preferences
    this.loadPreferences();

    this.initEventListeners();
    this.initEqControls();
    this.initDragAndDrop();
    this.initCoverArtUi();
    this.initMetadataUi();
    this.initQueueSaveUi();
    this.initAppMenu();
    this.initErrorHandling();
    this.initVideoOverlayHandlers();

    this.applyChordMode(this.chordMode);
  }

  // Delegated QueueManager operations
  clearQueue() {
    this.queueManager.clearQueue();
  }

  addFiles() {
    this.queueManager.addFiles();
  }

  initDragAndDrop() {
    this.queueManager.initDragAndDrop();
  }

  renderQueue() {
    this.queueManager.renderQueue();
  }

  ensureQueueContextMenu() {
    return this.queueManager.ensureQueueContextMenu();
  }

  showQueueContextMenu(e, index) {
    this.queueManager.showQueueContextMenu(e, index);
  }

  hideQueueContextMenu() {
    this.queueManager.hideQueueContextMenu();
  }

  saveQueueAs() {
    this.queueManager.saveQueueAs();
  }

  openQueueSaveModal() {
    this.queueManager.openQueueSaveModal();
  }

  initQueueSaveUi() {
    this.queueManager.initQueueSaveUi();
  }

  closeQueueSaveModal() {
    this.queueManager.closeQueueSaveModal();
  }

  saveQueueFromModal() {
    this.queueManager.saveQueueFromModal();
  }

  loadQueueByName(name) {
    return this.queueManager.loadQueueByName(name);
  }

  deleteSavedQueue(name) {
    this.queueManager.deleteSavedQueue(name);
  }

  // Delegated SettingsManager preferences
  loadPreferences() {
    this.settingsManager.loadPreferences();
  }

  getVizMode() {
    return this.settingsManager.getVizMode();
  }

  setVizMode(mode) {
    return this.settingsManager.setVizMode(mode);
  }

  initEqControls() {
    this.settingsManager.initEqControls();
  }

  saveCustomEqPreset(name) {
    this.settingsManager.saveCustomEqPreset(name);
  }

  deleteCustomEqPreset(name) {
    this.settingsManager.deleteCustomEqPreset(name);
  }

  getCurrentEqGains() {
    return this.settingsManager.getCurrentEqGains();
  }

  setEqGains(gains, persist) {
    this.settingsManager.setEqGains(gains, persist);
  }

  toggleEq() {
    this.settingsManager.toggleEq();
  }

  closeEq() {
    this.settingsManager.closeEq();
  }

  toggleVizControls() {
    this.settingsManager.toggleVizControls();
  }

  closeVizControls() {
    this.settingsManager.closeVizControls();
  }

  maybeCloseFloatingPanels(e) {
    this.settingsManager.maybeCloseFloatingPanels(e);
  }

  toggleDarkMode() {
    this.settingsManager.toggleDarkMode();
  }

  initVizControls() {
    this.settingsManager.initVizControls();
  }

  // Delegated ChordUi operations
  toggleChords() {
    this.chordUi.toggleChords();
  }

  cycleChordMode() {
    this.chordUi.cycleChordMode();
  }

  applyChordMode(mode) {
    this.chordUi.applyChordMode(mode);
  }

  updateChordToggleUi() {
    this.chordUi.updateChordToggleUi();
  }

  updateDiagnostics() {
    this.chordUi.updateDiagnostics();
  }

  // Delegated VideoHandler operations
  autoSwitchVisualizationForTrack(track) {
    this.videoHandler.autoSwitchVisualizationForTrack(track);
  }

  initVideoOverlayHandlers() {
    this.videoHandler.initVideoOverlayHandlers();
  }

  toggleFullscreen() {
    this.videoHandler.toggleFullscreen();
  }

  updateVideoModeUi() {
    this.videoHandler.updateVideoModeUi();
  }

  // Shared implementation logic
  startChordDetectorWhenReady() {
    if (this.detectorRunning) return;
    if (this.pendingDetectorStartRaf) return;
    let lastTime = 0;
    const tryStart = () => {
      this.pendingDetectorStartRaf = null;
      const ctx = this.audioManager.ctx;
      const src = this.audioManager.getCurrentSource();
      const running = ctx && ctx.state === 'running';
      const playing = src && !src.paused && src.duration > 0 && src.currentTime > lastTime;
      lastTime = src ? src.currentTime : 0;
      if (this.chordsEnabled && running && playing) {
        this.chordDetector.start();
        this.detectorRunning = true;
        return;
      }
      if (this.chordsEnabled && !this.detectorRunning) {
        this.pendingDetectorStartRaf = requestAnimationFrame(tryStart);
      }
    };
    tryStart();
  }

  getChordColors(name) {
    return getChordColors(name);
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
    this.volumeSlider.addEventListener('input', (e) => {
      const v = e.target.value;
      this.audioManager.setVolume(v);
      localStorage.setItem('volume', v);
    });
    this.progressBar.addEventListener('input', (e) => this.seekTrack(e.target.value));
    this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
    this.toggleEqBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleEq(); });
    if (this.visualModeBtn) {
      this.visualModeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.cycleVisualization(); });
    }
    if (this.visualSettingsBtn && this.vizControls) {
      this.visualSettingsBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleVizControls(); });
    }
    if (this.toggleChordsBtn) {
      this.toggleChordsBtn.addEventListener('click', () => this.toggleChords());
      this.updateChordToggleUi();
      this.toggleChordsBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.cycleChordMode();
      });
    }
    this.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());

    // Audio Manager events
    this.audioManager.on('track-loaded', (track) => {
      this.updateTrackInfo(track);
      this.updateCoverArt(track);
      this.detectorRunning = false;
      this.startChordDetectorWhenReady();
      this.autoSwitchVisualizationForTrack(track);
      this.updateVideoModeUi();
      if (this.vizControls && !this.vizControls.classList.contains('hidden')) this.initVizControls();
    });
    this.audioManager.on('playback-ended', () => this.handlePlaybackEnd());
    this.audioManager.on('queue-updated', () => this.renderQueue());
    this.audioManager.on('playback-state', (playing) => this.syncPlaybackUi(playing));

    document.addEventListener('click', () => this.startChordDetectorWhenReady(), { once: true });

    document.addEventListener('keydown', (e) => {
      if (this.isEditableTarget(e.target)) return;
      if (e.key.toLowerCase() === 'd' && this.diagEl) {
        this.diagEl.classList.toggle('hidden');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (this.isEditableTarget(e.target)) return;
      const key = e.key;
      const activeTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isRange = activeTag === 'input' && (e.target.type === 'range');
      const src = this.audioManager.getCurrentSource();

      switch (key) {
        case ' ':
          e.preventDefault();
          this.togglePlayback();
          break;
        case 'ArrowLeft':
          if (!isRange && src) {
            e.preventDefault();
            src.currentTime = Math.max(0, src.currentTime - 5);
            this.updateProgressBar();
          }
          break;
        case 'ArrowRight':
          if (!isRange && src) {
            e.preventDefault();
            const d = src.duration || 0;
            src.currentTime = d ? Math.min(d, src.currentTime + 5) : src.currentTime + 5;
            this.updateProgressBar();
          }
          break;
        case 'ArrowUp':
          if (!isRange) {
            e.preventDefault();
            const v = Math.min(1, parseFloat(this.volumeSlider.value) + 0.05);
            this.volumeSlider.value = v;
            this.audioManager.setVolume(v);
          }
          break;
        case 'ArrowDown':
          if (!isRange) {
            e.preventDefault();
            const v2 = Math.max(0, parseFloat(this.volumeSlider.value) - 0.05);
            this.volumeSlider.value = v2;
            this.audioManager.setVolume(v2);
          }
          break;
        case 's': case 'S':
          this.toggleShuffle();
          break;
        case 'r': case 'R':
          this.toggleRepeat();
          break;
        case 'm': case 'M':
          this.toggleChords();
          break;
        case 'c': case 'C':
          this.cycleChordMode();
          this.updateChordToggleUi();
          break;
      }
    });

    this.visualizer.start();
    requestAnimationFrame(this._updateLoop);

    document.addEventListener('click', (e) => {
      this.maybeCloseFloatingPanels(e);
      this.hideQueueContextMenu();
      this.hideCoverArtContextMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeEq();
        this.closeVizControls();
        this.hideQueueContextMenu();
        this.hideCoverArtContextMenu();
        this.closeMetadataModal();
      }
    });
  }

  // Cover Art Operations
  async updateCoverArt(track) {
    const requestId = ++this.pendingCoverRequest;
    const coverArt = await this.ensureTrackCoverArt(track);
    if (requestId !== this.pendingCoverRequest) return;

    const dataUrl = coverArt?.url || '';
    if (this.visualizer?.setCoverArt) this.visualizer.setCoverArt(dataUrl);
    this.renderCoverArtStage(coverArt);
    if (this.getVizMode() === 'cover') this.visualizer.draw();
  }

  getCoverArtDataUrl(track) {
    const coverUrl = track?.meta?.coverArt?.url;
    if (coverUrl) return coverUrl;
    const picture = track?.meta?.picture;
    if (!picture?.data) return '';
    return `data:${picture.format || 'image/jpeg'};base64,${picture.data}`;
  }

  async ensureTrackCoverArt(track) {
    if (!track?.path) {
      return { url: '', source: 'placeholder', placeholder: true };
    }
    const existing = track.meta?.coverArt;
    if (existing?.url) return existing;
    try {
      const res = await window.electronAPI.readMetadata(track.path);
      if (res?.success) {
        track.meta = { ...(track.meta || {}), ...(res.tags || {}) };
      }
    } catch {
      // ignore
    }
    if (track.meta?.coverArt?.url) return track.meta.coverArt;
    const pictureUrl = this.getCoverArtDataUrl(track);
    if (pictureUrl) {
      return {
        url: pictureUrl,
        source: 'embedded',
        placeholder: false
      };
    }
    return { url: '', source: 'placeholder', placeholder: true };
  }

  initCoverArtUi() {
    if (!this.coverArtStage) return;

    this.coverArtCta?.addEventListener('click', () => this.uploadCustomCoverArt());
    this.coverArtStage.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.showCoverArtContextMenu(event);
    });

    const showDrop = (event) => {
      if (!this.extractDroppedImagePath(event.dataTransfer)) return;
      event.preventDefault();
      event.stopPropagation();
      this.coverDropZone?.classList.remove('hidden');
    };

    const hideDrop = () => {
      this.coverDropZone?.classList.add('hidden');
    };

    this.coverArtStage.addEventListener('dragenter', showDrop);
    this.coverArtStage.addEventListener('dragover', showDrop);
    this.coverArtStage.addEventListener('dragleave', (event) => {
      if (event.currentTarget === event.target) hideDrop();
    });
    this.coverArtStage.addEventListener('drop', async (event) => {
      const imagePath = this.extractDroppedImagePath(event.dataTransfer);
      if (!imagePath) return;
      event.preventDefault();
      event.stopPropagation();
      hideDrop();
      await this.applyCustomCoverArt(imagePath);
    });
  }

  renderCoverArtStage(coverArt) {
    if (!this.coverArtStage || !this.coverFrames.length || !this.coverImages.length) return;

    const url = coverArt?.url || '';
    const source = coverArt?.source || 'placeholder';
    const isPlaceholder = !!coverArt?.placeholder || source === 'placeholder';
    this.currentCoverSource = source;

    this.coverArtStage.classList.toggle('is-placeholder', isPlaceholder);
    this.coverArtStage.classList.toggle('has-cover', !!url);
    this.coverArtStage.classList.toggle('is-cover-mode', this.getVizMode() === 'cover');
    this.visualizerContainer?.classList.toggle('has-cover', !!url);
    this.coverArtCta?.classList.toggle('hidden', !isPlaceholder);

    if (!url) {
      this.currentCoverUrl = '';
      this.applyCoverPalette(['rgba(63, 147, 255, 0.45)', 'rgba(8, 18, 30, 0.78)']);
      return;
    }
    if (url === this.currentCoverUrl) return;
    this.currentCoverUrl = url;

    const nextIndex = this.activeCoverFrameIndex === 0 ? 1 : 0;
    const nextFrame = this.coverFrames[nextIndex];
    const nextImage = this.coverImages[nextIndex];
    const prevFrame = this.coverFrames[this.activeCoverFrameIndex];

    nextImage.src = url;
    nextImage.alt = 'Current track cover art';
    nextImage.onload = () => {
      this.updateCoverBackdropColors(nextImage);
      prevFrame.classList.remove('is-active');
      nextFrame.classList.add('is-active');
      this.activeCoverFrameIndex = nextIndex;
    };
    nextImage.onerror = () => {
      prevFrame.classList.remove('is-active');
      nextFrame.classList.add('is-active');
      this.activeCoverFrameIndex = nextIndex;
      this.applyCoverPalette(['rgba(63, 147, 255, 0.45)', 'rgba(8, 18, 30, 0.78)']);
    };
  }

  updateCoverBackdropColors(imageEl) {
    try {
      const palette = this.extractImagePalette(imageEl);
      this.applyCoverPalette(palette);
    } catch {
      this.applyCoverPalette(['rgba(63, 147, 255, 0.45)', 'rgba(8, 18, 30, 0.78)']);
    }
  }

  extractImagePalette(imageEl) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const width = 24;
    const height = 24;
    canvas.width = width;
    canvas.height = height;
    ctx.drawImage(imageEl, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    let r1 = 0, g1 = 0, b1 = 0, c1 = 0;
    let r2 = 0, g2 = 0, b2 = 0, c2 = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 100) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lightness = (r + g + b) / 3;
      if (lightness > 150) {
        r1 += r;
        g1 += g;
        b1 += b;
        c1 += 1;
      } else {
        r2 += r;
        g2 += g;
        b2 += b;
        c2 += 1;
      }
    }

    const primary = c1 ? `rgba(${Math.round(r1 / c1)}, ${Math.round(g1 / c1)}, ${Math.round(b1 / c1)}, 0.52)` : 'rgba(63, 147, 255, 0.45)';
    const secondary = c2 ? `rgba(${Math.round(r2 / c2)}, ${Math.round(g2 / c2)}, ${Math.round(b2 / c2)}, 0.78)` : 'rgba(8, 18, 30, 0.78)';
    return [primary, secondary];
  }

  applyCoverPalette([primary, secondary]) {
    document.documentElement.style.setProperty('--cover-primary', primary);
    document.documentElement.style.setProperty('--cover-secondary', secondary);
    document.documentElement.style.setProperty('--cover-glow', this.toGlowColor(primary));
  }

  toGlowColor(color) {
    const match = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([^)]+)\)/.exec(color || '');
    if (!match) return 'rgba(255, 255, 255, 0.16)';
    return `rgba(${match[1]}, ${match[2]}, ${match[3]}, 0.18)`;
  }

  extractDroppedImagePath(dataTransfer) {
    const files = Array.from(dataTransfer?.files || []);
    const file = files.find((entry) => this.isSupportedCoverImage(entry));
    return file?.path || '';
  }

  isSupportedCoverImage(file) {
    const name = file?.name || '';
    const ext = (name.split('.').pop() || '').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
  }

  async uploadCustomCoverArt() {
    const track = this.audioManager.getCurrentTrack();
    if (!track?.path) {
      this.showErrorBanner('Load a track before adding custom cover art.');
      return;
    }
    const picked = await window.electronAPI.selectCoverArtFile?.();
    if (!picked?.success || !picked.path) return;
    await this.applyCustomCoverArt(picked.path);
  }

  async applyCustomCoverArt(imagePath) {
    const track = this.audioManager.getCurrentTrack();
    if (!track?.path) return;
    const result = await window.electronAPI.uploadCustomCover({
      trackPath: track.path,
      imagePath
    });
    if (!result?.success) {
      this.showErrorBanner(result?.error || 'Could not update cover art.');
      return;
    }
    track.meta = {
      ...(track.meta || {}),
      coverArt: result.coverArt
    };
    await this.updateCoverArt(track);
    if (this.vizControls && !this.vizControls.classList.contains('hidden')) this.initVizControls();
  }

  async removeCustomCoverArt() {
    const track = this.audioManager.getCurrentTrack();
    if (!track?.path) return;
    const result = await window.electronAPI.clearCustomCover?.(track.path);
    if (!result?.success) {
      this.showErrorBanner(result?.error || 'Could not remove custom cover art.');
      return;
    }
    track.meta = { ...(track.meta || {}) };
    delete track.meta.coverArt;
    await this.updateCoverArt(track);
    if (this.vizControls && !this.vizControls.classList.contains('hidden')) this.initVizControls();
  }

  ensureCoverArtContextMenu() {
    if (this.coverCtx) return this.coverCtx;
    const menu = document.createElement('div');
    menu.id = 'cover-context-menu';
    menu.className = 'context-menu hidden';
    const change = document.createElement('div');
    change.className = 'context-item';
    change.textContent = 'Change Cover';
    const remove = document.createElement('div');
    remove.className = 'context-item destructive';
    remove.textContent = 'Remove Override';
    menu.appendChild(change);
    menu.appendChild(remove);
    document.body.appendChild(menu);
    this.coverCtx = { el: menu, change, remove };
    return this.coverCtx;
  }

  showCoverArtContextMenu(event) {
    const track = this.audioManager.getCurrentTrack();
    if (!track?.path) return;
    const ctx = this.ensureCoverArtContextMenu();
    const { el, change, remove } = ctx;
    const left = Number(event.clientX) || 0;
    const top = Number(event.clientY) || 0;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.classList.remove('hidden');
    if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxTop = Math.max(margin, window.innerHeight - rect.height - margin);
        el.style.left = `${Math.min(Math.max(margin, left), maxLeft)}px`;
        el.style.top = `${Math.min(Math.max(margin, top), maxTop)}px`;
      });
    }
    change.onclick = () => {
      this.hideCoverArtContextMenu();
      this.uploadCustomCoverArt();
    };
    remove.style.display = this.currentCoverSource === 'override' ? '' : 'none';
    remove.onclick = () => {
      this.hideCoverArtContextMenu();
      this.removeCustomCoverArt();
    };
  }

  hideCoverArtContextMenu() {
    if (this.coverCtx?.el) this.coverCtx.el.classList.add('hidden');
  }

  // App Menu UI Controls
  initAppMenu() {
    if (!this.appMenuBtn || !this.appMenu) return;
    try {
      if (this.appMenu.parentElement !== document.body) {
        document.body.appendChild(this.appMenu);
      }
      this.appMenu.style.position = 'fixed';
      this.appMenu.setAttribute('aria-hidden', 'true');
      this.appMenuBtn.setAttribute('aria-haspopup', 'menu');
      this.appMenuBtn.setAttribute('aria-expanded', 'false');
    } catch { /* ignore */ }
    const openMenu = (e) => {
      try { e.stopPropagation(); } catch { /* ignore */ }
      this.buildAppMenu();
      this.positionAppMenu();
      this.showAppMenu();
      this._menuJustOpenedAt = Date.now();
      this._menuJustOpened = true;
      clearTimeout(this._menuOpenTimer);
      this._menuOpenTimer = setTimeout(() => { this._menuJustOpened = false; }, 500);
    };
    this.appMenuBtn.addEventListener('pointerdown', openMenu);
    this.appMenuBtn.addEventListener('mousedown', openMenu);
    this.appMenuBtn.addEventListener('click', openMenu);
    this.appMenuBtn.addEventListener('touchstart', openMenu, { passive: true });
    this.appMenuBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') openMenu(e);
    });
    document.addEventListener('click', (e) => {
      if (!this.appMenu || this.appMenu.classList.contains('hidden')) return;
      if (this._menuJustOpened) return;
      if (this.appMenu.contains(e.target) || this.appMenuBtn.contains(e.target)) return;
      this.hideAppMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.hideAppMenu(); });
  }

  positionAppMenu() {
    try {
      const btnRect = this.appMenuBtn.getBoundingClientRect();
      const left = Math.max(8, Math.round(btnRect.left));
      const top = Math.round(btnRect.bottom + 6);
      this.appMenu.style.left = `${left}px`;
      this.appMenu.style.top = `${top}px`;
    } catch { /* ignore */ }
  }

  buildAppMenu() {
    if (!this.appMenu) return;
    this.appMenu.innerHTML = '';
    this.appMenu.setAttribute('role', 'menu');

    const addItem = (label, onClick, opts = {}) => {
      const it = document.createElement('div');
      it.className = 'menu-item' + (opts.destructive ? ' destructive' : '');
      it.textContent = label;
      it.tabIndex = 0;
      it.setAttribute('role', 'menuitem');
      it.addEventListener('click', (e) => { e.stopPropagation(); onClick?.(); this.hideAppMenu(); });
      it.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); this.hideAppMenu(); } });
      this.appMenu.appendChild(it);
      return it;
    };
    const addSeparator = () => {
      const sep = document.createElement('div'); sep.className = 'menu-separator'; this.appMenu.appendChild(sep);
    };

    addItem('Equalizer…', () => this.toggleEq());
    const eqPresetRow = document.createElement('div'); eqPresetRow.className = 'menu-row';
    const eqPresetLbl = document.createElement('span'); eqPresetLbl.textContent = 'EQ Preset';
    const eqPresetSelect = document.createElement('select');
    const builtins = BUILTIN_EQ_PRESETS;
    Object.keys(builtins).forEach(n => { const o = document.createElement('option'); o.value = `builtin:${n}`; o.textContent = n; eqPresetSelect.appendChild(o); });
    const custom = getCustomEqPresets();
    Object.keys(custom).forEach(n => { const o = document.createElement('option'); o.value = `custom:${n}`; o.textContent = n; eqPresetSelect.appendChild(o); });
    eqPresetSelect.addEventListener('change', (e) => {
      const v = e.target.value || '';
      if (!v) return;
      const [kind, name] = v.split(':');
      const map = kind === 'builtin' ? builtins : custom;
      const gains = map[name];
      if (Array.isArray(gains)) this.setEqGains(gains, true);
    });
    eqPresetRow.appendChild(eqPresetLbl); eqPresetRow.appendChild(eqPresetSelect); this.appMenu.appendChild(eqPresetRow);

    const eqSaveRow = document.createElement('div'); eqSaveRow.className = 'menu-row';
    const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.placeholder = 'Preset name'; nameInput.style.flex = '1';
    const saveBtn = document.createElement('button'); saveBtn.className = 'inline-btn'; saveBtn.textContent = 'Save';
    saveBtn.addEventListener('click', () => { const n = nameInput.value.trim(); if (!n) return; this.saveCustomEqPreset(n); this.buildAppMenu(); });
    eqSaveRow.appendChild(nameInput); eqSaveRow.appendChild(saveBtn); this.appMenu.appendChild(eqSaveRow);
    if (Object.keys(custom).length) {
      const eqDelRow = document.createElement('div'); eqDelRow.className = 'menu-row';
      const delSelect = document.createElement('select');
      Object.keys(custom).forEach(n => { const o = document.createElement('option'); o.value = n; o.textContent = n; delSelect.appendChild(o); });
      const delBtn = document.createElement('button'); delBtn.className = 'inline-btn'; delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', () => { const n = delSelect.value; if (!n) return; this.deleteCustomEqPreset(n); this.buildAppMenu(); });
      eqDelRow.appendChild(delSelect); eqDelRow.appendChild(delBtn); this.appMenu.appendChild(eqDelRow);
    }

    addSeparator();

    const vizRow = document.createElement('div'); vizRow.className = 'menu-row';
    const vizLbl = document.createElement('span'); vizLbl.textContent = 'Visualization Mode';
    const vizSelect = document.createElement('select');
    ;['orb','bars','wave','spectrogram','particles','cover','video'].forEach(m => {
      const opt = document.createElement('option'); opt.value = m; opt.textContent = m[0].toUpperCase() + m.slice(1);
      if (this.getVizMode() === m) opt.selected = true;
      vizSelect.appendChild(opt);
    });
    vizSelect.addEventListener('change', (e) => {
      const m = this.setVizMode(e.target.value);
      if (m !== 'video' && this.visualizer.setMode) this.visualizer.setMode(m);
      if (m !== 'video') this.prevNonVideoMode = m;
      this.updateVisualizationUi(m);
      this.updateVideoModeUi();
      if (m !== 'video') this.visualizer.draw();
    });
    vizRow.appendChild(vizLbl); vizRow.appendChild(vizSelect); this.appMenu.appendChild(vizRow);
    addItem('Visualization Settings…', () => this.toggleVizControls());
    addItem('Reset Visualization Settings', () => {
      try {
        localStorage.removeItem('vizConfig');
        localStorage.removeItem('vizTheme');
        const defaults = {
          orb: { scale: 0.4 },
          bars: { count: 160 },
          wave: { thickness: 2 },
          spectrogram: { speed: 1 },
          particles: { intensity: 1 }
        };
        if (this.visualizer?.setTheme) this.visualizer.setTheme('neon');
        if (this.visualizer?.setConfig) {
          Object.keys(defaults).forEach(m => this.visualizer.setConfig(m, defaults[m]));
        }
        if (this.vizControls && !this.vizControls.classList.contains('hidden')) {
          this.vizControls.dataset.initialized = '';
          this.initVizControls();
        }
      } catch { /* ignore */ }
    });

    addSeparator();

    addItem(this.chordsEnabled ? 'Chords: On' : 'Chords: Off', () => this.toggleChords());
    const chordRow = document.createElement('div'); chordRow.className = 'menu-row';
    const chordLbl = document.createElement('span'); chordLbl.textContent = 'Chord Mode';
    const chordSelect = document.createElement('select');
    ;['lowcpu','responsive','normal','accurate'].forEach(m => {
      const opt = document.createElement('option'); opt.value = m; opt.textContent = m[0].toUpperCase() + m.slice(1);
      if ((this.chordMode || 'normal') === m) opt.selected = true;
      chordSelect.appendChild(opt);
    });
    chordSelect.addEventListener('change', (e) => {
      this.chordMode = e.target.value;
      localStorage.setItem('chordMode', this.chordMode);
      this.applyChordMode(this.chordMode);
      this.updateChordToggleUi();
    });
    chordRow.appendChild(chordLbl); chordRow.appendChild(chordSelect); this.appMenu.appendChild(chordRow);

    addSeparator();
    addItem(document.body.classList.contains('dark-mode') ? 'Light Mode' : 'Dark Mode', () => this.toggleDarkMode());
    addSeparator();

    addItem('Save Queue As…', () => this.openQueueSaveModal());
    const saved = getSavedQueues();
    if (Object.keys(saved).length) {
      const loadRow = document.createElement('div'); loadRow.className = 'menu-row';
      const loadLbl = document.createElement('span'); loadLbl.textContent = 'Load Queue';
      const loadSelect = document.createElement('select');
      const def = document.createElement('option'); def.value = ''; def.textContent = 'Select…'; loadSelect.appendChild(def);
      Object.keys(saved).sort().forEach(name => { const opt = document.createElement('option'); opt.value = name; opt.textContent = name; loadSelect.appendChild(opt); });
      loadSelect.addEventListener('change', async (e) => { const name = e.target.value; if (name) { await this.loadQueueByName(name); this.hideAppMenu(); } });
      loadRow.appendChild(loadLbl); loadRow.appendChild(loadSelect); this.appMenu.appendChild(loadRow);
      const manageRow = document.createElement('div'); manageRow.className = 'menu-row';
      const delBtn = document.createElement('button'); delBtn.className = 'inline-btn'; delBtn.textContent = 'Delete Selected';
      delBtn.addEventListener('click', () => { const name = loadSelect.value; if (!name) return; this.deleteSavedQueue(name); this.buildAppMenu(); });
      manageRow.appendChild(delBtn); this.appMenu.appendChild(manageRow);
    }
  }

  toggleAppMenu() { this.appMenu.classList.toggle('hidden'); const open = !this.appMenu.classList.contains('hidden'); this.appMenuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false'); this.appMenu.setAttribute('aria-hidden', open ? 'false' : 'true'); }
  showAppMenu() { this.appMenu.classList.remove('hidden'); this.appMenuBtn?.setAttribute('aria-expanded', 'true'); this.appMenu.setAttribute('aria-hidden', 'false'); }
  hideAppMenu() {
    if (this._menuJustOpenedAt && (Date.now() - this._menuJustOpenedAt) < 200) return;
    this.appMenu.classList.add('hidden');
    this.appMenuBtn?.setAttribute('aria-expanded', 'false');
    this.appMenu.setAttribute('aria-hidden', 'true');
  }

  // Metadata Overrides UI & Form Controls
  initMetadataUi() {
    this.metaModal = document.getElementById('metadata-modal');
    this.metaForm = document.getElementById('metadata-form');
    this.metaFields = {
      title: document.getElementById('meta-title'),
      artist: document.getElementById('meta-artist'),
      album: document.getElementById('meta-album'),
      year: document.getElementById('meta-year'),
      genre: document.getElementById('meta-genre')
    };
    this.metaCancelBtn = document.getElementById('meta-cancel');
    this.metaSaveBtn = document.getElementById('meta-save');

    if (this.metaCancelBtn) this.metaCancelBtn.addEventListener('click', () => this.closeMetadataModal());
    if (this.metaModal) this.metaModal.addEventListener('click', (ev) => {
      if (ev.target === this.metaModal) this.closeMetadataModal();
    });
    if (this.metaForm) this.metaForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.saveMetadataFromForm();
    });
  }

  getDisplayName(track) {
    const m = this.metaOverrides[track.path];
    if (m && m.title) return m.title;
    if (track?.meta?.title) return track.meta.title;
    return track.name;
  }

  async openMetadataModalForIndex(index) {
    const t = this.audioManager.getQueue()[index];
    if (!t || !this.metaModal) return;
    this.metaModal.dataset.path = t.path;
    if (!t.meta) {
      try {
        const res = await window.electronAPI.readMetadata(t.path);
        if (res?.success) t.meta = res.tags || {};
      } catch { /* ignore */ }
    }
    const m = this.metaOverrides[t.path] || t.meta || {};
    if (this.metaFields.title) this.metaFields.title.value = m.title || '';
    if (this.metaFields.artist) this.metaFields.artist.value = m.artist || '';
    if (this.metaFields.album) this.metaFields.album.value = m.album || '';
    if (this.metaFields.year) this.metaFields.year.value = m.year || '';
    if (this.metaFields.genre) this.metaFields.genre.value = m.genre || '';
    this.metaModal.classList.remove('hidden');
    this.metaModal.classList.remove('closing');
    this.metaModal.setAttribute('aria-hidden', 'false');
    void this.metaModal.offsetWidth;
  }

  closeMetadataModal() {
    if (!this.metaModal) return;
    this.metaModal.classList.add('closing');
    const onEnd = () => {
      this.metaModal.classList.add('hidden');
      this.metaModal.classList.remove('closing');
      this.metaModal.setAttribute('aria-hidden', 'true');
      this.metaModal.removeEventListener('animationend', onEnd, true);
    };
    this.metaModal.addEventListener('animationend', onEnd, true);
  }

  async saveMetadataFromForm() {
    if (!this.metaModal) return;
    const path = this.metaModal.dataset.path;
    if (!path) return;
    const data = {
      title: this.metaFields.title ? this.metaFields.title.value.trim() : '',
      artist: this.metaFields.artist ? this.metaFields.artist.value.trim() : '',
      album: this.metaFields.album ? this.metaFields.album.value.trim() : '',
      year: this.metaFields.year ? this.metaFields.year.value.trim() : '',
      genre: this.metaFields.genre ? this.metaFields.genre.value.trim() : ''
    };

    try { await window.electronAPI.writeMetadata(path, data); } catch { /* ignore */ }

    this.metaOverrides[path] = data;
    localStorage.setItem('metadataOverrides', JSON.stringify(this.metaOverrides));

    const t = this.audioManager.getQueue().find(tr => tr.path === path);
    if (t) t.meta = { ...(t.meta || {}), ...data };

    const curIdx = this.audioManager.getCurrentIndex();
    const cur = this.audioManager.getQueue()[curIdx];
    if (cur && cur.path === path) this.updateTrackInfo(cur);
    this.renderQueue();
    this.closeMetadataModal();
  }

  // Playback Control Utilities
  togglePlayback() {
    const track = this.audioManager.getCurrentTrack();
    if (!track) return;
    if (this.audioManager.isPlaying) {
      if (!this.audioManager.pause()) return;
      this.chordDetector.stop();
      this.detectorRunning = false;
      this.syncPlaybackUi(false);
    } else {
      if (!this.audioManager.play()) return;
      this.syncPlaybackUi(true);
      this.startChordDetectorWhenReady();
    }
  }

  nextTrack() {
    if (!this.audioManager.getQueue().length) return;
    this.audioManager.playNext();
    this.syncPlaybackUi(true);
  }

  prevTrack() {
    if (!this.audioManager.getQueue().length) return;
    this.audioManager.playPrev();
    this.syncPlaybackUi(true);
  }
  
  seekTrack(value) {
    this.audioManager.seek(value / 100);
    this.updateProgressBar();
  }

  handlePlaybackEnd() {
    this.nextTrack();
  }

  toggleShuffle() {
    this.audioManager.toggleShuffle();
    this.shuffleBtn.classList.toggle('inactive');
    const on = !this.shuffleBtn.classList.contains('inactive');
    localStorage.setItem('shuffle', on);
  }

  toggleRepeat() {
    this.audioManager.toggleRepeat();
    this.repeatBtn.classList.toggle('inactive');
    const on = !this.repeatBtn.classList.contains('inactive');
    localStorage.setItem('repeat', on);
  }

  // UI Visualization & Diagnostics Synchronization
  cycleVisualization() {
    const order = ['orb', 'bars', 'wave', 'spectrogram', 'particles', 'cover', 'video'];
    const current = this.getVizMode();
    const next = order[(order.indexOf(current) + 1) % order.length];
    if (next !== 'video' && this.visualizer.setMode) this.visualizer.setMode(next);
    if (next !== 'video') this.prevNonVideoMode = next;
    this.setVizMode(next);
    this.updateVisualizationUi(next);
    this.updateVideoModeUi();
    this.initVideoOverlayHandlers();
    if (next !== 'video') this.visualizer.draw();
  }

  updateVisualizationUi(mode) {
    const m = mode || this.getVizMode();
    this.coverArtStage?.classList.toggle('is-cover-mode', m === 'cover');
    if (!this.visualModeBtn) return;
    const label = (
      m === 'bars' ? 'Bars' :
      m === 'wave' ? 'Wave' :
      m === 'spectrogram' ? 'Spectrogram' :
      m === 'particles' ? 'Particles' :
      m === 'cover' ? 'Cover' :
      m === 'video' ? 'Video' : 'Orb'
    );
    this.visualModeBtn.title = `Visualization: ${label} (click to change)`;
    this.initVideoOverlayHandlers();
  }

  update() {
    const mode = this.getVizMode();
    const usingCanvas = mode !== 'video';
    const src = this.audioManager.getCurrentSource();
    const duration = Number(src?.duration);
    const hasMedia = Number.isFinite(duration) && duration > 0;
    const isPlaying = !!(src && hasMedia && !src.paused);
    if (isPlaying && usingCanvas) {
      this.visualizer.draw();
    }
    if (hasMedia) this.updateProgressBar();
    this.updateDiagnostics();
    requestAnimationFrame(this._updateLoop);
  }

  isEditableTarget(target) {
    if (!target) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName ? target.tagName.toLowerCase() : '';
    if (tag === 'textarea' || tag === 'select') return true;
    if (tag === 'input') {
      const type = (target.type || '').toLowerCase();
      return type !== 'button' && type !== 'submit' && type !== 'reset';
    }
    return false;
  }

  initErrorHandling() {
    if (this._errorHandlersInit) return;
    this._errorHandlersInit = true;
    if (this.errorBannerClose) {
      this.errorBannerClose.addEventListener('click', () => this.hideErrorBanner());
    }
    window.addEventListener('error', (event) => {
      const msg = event?.message ? `Unexpected error: ${event.message}` : 'Unexpected error';
      this.showErrorBanner(msg);
      console.error('[Renderer Error]', event?.error || event);
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason || 'Unhandled rejection');
      this.showErrorBanner(`Unhandled promise rejection: ${msg}`);
      console.error('[Renderer Rejection]', reason);
    });
  }

  showErrorBanner(message) {
    if (!this.errorBanner || !this.errorBannerMessage) {
      console.error('[Renderer Error Banner]', message);
      return;
    }
    this.errorBannerMessage.textContent = message;
    this.errorBanner.classList.remove('hidden');
  }

  hideErrorBanner() {
    if (!this.errorBanner) return;
    this.errorBanner.classList.add('hidden');
  }

  updateProgressBar() {
    const { currentTime, duration } = this.audioManager.getCurrentSource();
    if (duration > 0) {
      const progress = (currentTime / duration) * 100;
      this.progressBar.value = progress;
      this.trackDurationEl.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
      if (this.videoSeek) this.videoSeek.value = progress;
    }
    else {
      this.progressBar.value = 0;
      if (this.videoSeek) this.videoSeek.value = 0;
    }
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  }

  syncPlaybackUi(isPlaying) {
    if (!this.playIcon || !this.pauseIcon) return;
    this.playIcon.classList.toggle('hidden', isPlaying);
    this.pauseIcon.classList.toggle('hidden', !isPlaying);
    if (this.videoPlayIcon && this.videoPauseIcon) {
      this.videoPlayIcon.classList.toggle('hidden', isPlaying);
      this.videoPauseIcon.classList.toggle('hidden', !isPlaying);
    }
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
