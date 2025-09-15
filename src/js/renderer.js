import { AudioManager } from './audio-manager.js';
import { Visualizer } from './visualizer.js';
import { ChordDetector } from './chord-detector.js';

// Exported so tests can instantiate and exercise behaviour without relying on
// the global DOMContentLoaded hook at the bottom of the file.
export class Renderer {
  constructor() {
    this.audioManager = new AudioManager();
    this.visualizer = new Visualizer('visualizer', this.audioManager.getAnalyser());
    this.chordDetector = new ChordDetector(this.audioManager.getChordAnalyser(), {
      sampleRate: this.audioManager.ctx.sampleRate,
      // Tune detector for quicker response and smoother confidence
      confEnter: 0.4,
      confExit: 0.32,
      holdMsEnter: 500,
      holdMsExit: 250,
      requiredStableFrames: 2,
      harmonicThreshold: 0.15,
      noiseFloorAlpha: 0.06,
      chromaAlphaFast: 0.4,
      chromaAlphaSlow: 0.15,
      // Provide RMS data for gating
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
    this.diagEl = document.getElementById('diag'); // diagnostics overlay
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
    this.toggleChordsBtn = document.getElementById('toggle-chords-btn');
    this.eqControls = document.getElementById('eq-controls');
    this.darkModeToggle = document.getElementById('dark-mode-toggle');

    // Metadata overrides store (persisted in localStorage)
    this.metaOverrides = (() => { try { return JSON.parse(localStorage.getItem('metadataOverrides') || '{}'); } catch { return {}; } })();

    // Custom title bar buttons
    this.minimizeBtn = document.getElementById('minimize-btn');
    this.maximizeBtn = document.getElementById('maximize-btn');
    this.closeBtn = document.getElementById('close-btn');
    // Chord detection state/mode
    this.detectorRunning = false; // ensures detector starts only once per track
    this.chordsEnabled = true;
    this.chordMode = 'lowcpu'; // 'responsive' | 'normal' | 'accurate' | 'lowcpu'

    // Restore persisted preferences before wiring up handlers so UI reflects
    // the user's last session immediately on launch.
    this.loadPreferences();

    this.initEventListeners();
    this.initEqControls();
    this.initDragAndDrop();
    this.initMetadataUi();

    // Start chord detector loop
    this.chordDetector.setOnChord(({ name, confidence }) => {
      if (!this.chordReadout) return;

      if (!name) {
        this.chordReadout.textContent = '—';
        this.chordReadout.classList.add('dim');
        this.chordReadout.classList.remove('pulse');
        this.chordReadout.style.removeProperty('color');
        this.chordReadout.style.removeProperty('background');
        this.chordReadout.style.removeProperty('border-color');
      } else {
        const conf = Math.round(confidence * 100);
        this.chordReadout.textContent = `${name}  ·  ${conf}%`;

        const { fg, bg } = this.getChordColors(name);
        const greenThresh = Math.round(this.chordDetector.confEnter * 100);
        this.chordReadout.style.color = conf >= greenThresh ? fg : '';
        this.chordReadout.style.background = bg;
        this.chordReadout.style.borderColor = fg;

        this.chordReadout.classList.remove('dim');
        this.chordReadout.classList.add('pulse');
        setTimeout(() => this.chordReadout && this.chordReadout.classList.remove('pulse'), 120);
      }
    });
    this.applyChordMode(this.chordMode);
  }

  getChordColors(name) {
    const quality = name.replace(/^[A-G]#?/, '');
    if (quality.includes('dim')) return { fg: '#f87171', bg: 'rgba(248,113,113,0.15)' };
    if (quality.includes('aug')) return { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
    if (quality.startsWith('m') && !quality.startsWith('maj')) return { fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)' };
    if (quality.includes('sus')) return { fg: '#c084fc', bg: 'rgba(192,132,252,0.15)' };
    if (quality.includes('6')) return { fg: '#34d399', bg: 'rgba(52,211,153,0.15)' };
    if (quality.includes('7') || quality.includes('9') || quality.includes('11') || quality.includes('13'))
      return { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
    if (quality.includes('5')) return { fg: '#a1a1aa', bg: 'rgba(161,161,170,0.15)' };
    return { fg: '#4ade80', bg: 'rgba(74,222,128,0.15)' }; // major/default
  }

  // Start detector only when audio context is running and audio is flowing
  startChordDetectorWhenReady() {
    if (this.detectorRunning) return; // prevent multiple loops
    let lastTime = 0;
    const tryStart = () => {
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
      if (this.chordsEnabled && !this.detectorRunning) requestAnimationFrame(tryStart);
    };
    tryStart();
  }

  // Load persisted preferences for dark mode, volume and chord options.
  loadPreferences() {
    const dark = localStorage.getItem('darkMode');
    if (dark === 'true') {
      document.body.classList.add('dark-mode');
    }

    const vol = parseFloat(localStorage.getItem('volume'));
    if (!isNaN(vol)) {
      this.volumeSlider.value = vol;
      this.audioManager.setVolume(vol);
    }

    const savedChords = localStorage.getItem('chordsEnabled');
    if (savedChords === 'false') {
      this.chordsEnabled = false;
    }

    const savedMode = localStorage.getItem('chordMode');
    if (savedMode) {
      this.chordMode = savedMode;
    }

    // Shuffle / Repeat
    const savedShuffle = localStorage.getItem('shuffle');
    const savedRepeat = localStorage.getItem('repeat');
    if (savedShuffle === 'true') {
      this.audioManager.setShuffle(true);
      this.shuffleBtn.classList.remove('inactive');
      this.repeatBtn.classList.add('inactive');
    }
    if (savedRepeat === 'true') {
      this.audioManager.setRepeat(true);
      this.repeatBtn.classList.remove('inactive');
      this.shuffleBtn.classList.add('inactive');
    }

    // Visualization mode
    const viz = localStorage.getItem('vizMode');
    if (viz) {
      if (this.visualizer.setMode) this.visualizer.setMode(viz);
      this.updateVisualizationUi();
    }
    const theme = localStorage.getItem('vizTheme');
    if (theme && this.visualizer.setTheme) this.visualizer.setTheme(theme);
    const cfg = (() => { try { return JSON.parse(localStorage.getItem('vizConfig') || '{}'); } catch { return {}; } })();
    if (this.visualizer.setConfig && cfg) {
      Object.keys(cfg).forEach(mode => this.visualizer.setConfig(mode, cfg[mode]));
    }

    // Ensure UI reflects the restored settings
    this.updateChordToggleUi();
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
      this.detectorRunning = false; // allow detector to restart for new track
      this.startChordDetectorWhenReady();
    });
    this.audioManager.on('playback-ended', () => this.handlePlaybackEnd());
    this.audioManager.on('queue-updated', () => this.renderQueue());

    // Kick off chord detector after first user interaction
    document.addEventListener('click', () => this.startChordDetectorWhenReady(), { once: true });

    // Toggle diagnostics overlay with "D"
    document.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'd' && this.diagEl) {
        this.diagEl.classList.toggle('hidden');
      }
    });

    // Global playback and app shortcuts
    document.addEventListener('keydown', (e) => {
      const key = e.key;
      const activeTag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
      const isRange = activeTag === 'input' && (e.target.type === 'range');
      const src = this.audioManager.getCurrentSource();

      switch (key) {
        case ' ': // space toggles playback
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

    // Start the visualizer
    this.visualizer.start();
    requestAnimationFrame(this.update.bind(this));

    // Click-away to close floating control panels and context menus
    document.addEventListener('click', (e) => {
      this.maybeCloseFloatingPanels(e);
      this.hideQueueContextMenu();
    });
    // Escape to close panels
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeEq();
        this.closeVizControls();
        this.hideQueueContextMenu();
        this.closeMetadataModal();
      }
    });
  }

  // Clear the queue and reset related UI bits
  clearQueue() {
    this.audioManager.clearQueue();
    // Reset playback icons
    this.playIcon.classList.remove('hidden');
    this.pauseIcon.classList.add('hidden');
    // Reset progress and labels
    this.progressBar.value = 0;
    this.trackDurationEl.textContent = '';
    // Clear chord readout styling
    if (this.chordReadout) {
      this.chordReadout.textContent = '—';
      this.chordReadout.classList.add('dim');
      this.chordReadout.style.removeProperty('color');
      this.chordReadout.style.removeProperty('background');
      this.chordReadout.style.removeProperty('border-color');
    }
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
      const allowed = new Set(['mp3','wav','ogg','m4a','flac','aac']);
      const dropped = [...e.dataTransfer.files]
        .filter(f => (f.type && f.type.startsWith('audio/')) || allowed.has((f.name.split('.').pop()||'').toLowerCase()));

      if (dropped.length === 0) return;

      // Normalize to safe file URLs via main process (cross‑platform correctness)
      const paths = dropped.map(f => f.path).filter(Boolean);
      const normalized = await window.electronAPI.pathsToFileUrls(paths);
      if (normalized && normalized.length) this.audioManager.addFilesToQueue(normalized);
    });
  }

  // Player controls
  togglePlayback() {
    if (this.audioManager.isPlaying) {
      this.audioManager.pause();
      // Stop chord detection when paused to save CPU and avoid flicker
      this.chordDetector.stop();
      this.detectorRunning = false;
      this.playIcon.classList.remove('hidden');
      this.pauseIcon.classList.add('hidden');
    } else {
      this.audioManager.play();
      this.playIcon.classList.add('hidden');
      this.pauseIcon.classList.remove('hidden');
      this.startChordDetectorWhenReady(); // ensure detector starts when playback begins
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
    // Refresh UI when seeking while paused
    this.updateProgressBar();
  }

  // UI rendering
  updateTrackInfo(track) {
    const name = track ? this.getDisplayName(track) : 'No track loaded';
    this.trackNameEl.textContent = name;
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
      li.textContent = this.getDisplayName(track);
      li.dataset.index = index;
      li.addEventListener('click', () => {
        this.audioManager.playTrack(index);
        this.playIcon.classList.add('hidden');
        this.pauseIcon.classList.remove('hidden');
      });
      // Right-click context menu for queue actions
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showQueueContextMenu(e, index);
      });
      this.queueEl.appendChild(li);
    });
  }

  // EQ and visualizer
  initEqControls() {
    const savedGains = (() => { try { return JSON.parse(localStorage.getItem('eqGains') || '[]'); } catch { return []; } })();
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
      slider.value = (typeof savedGains[i] !== 'undefined') ? savedGains[i] : 0;
      slider.dataset.index = i;

      // Apply saved gain immediately
      if (typeof savedGains[i] !== 'undefined') {
        this.audioManager.setEqGain(i, savedGains[i]);
      }

      slider.addEventListener('input', (e) => {
        const idx = Number(e.target.dataset.index);
        const val = Number(e.target.value);
        this.audioManager.setEqGain(idx, val);
        const arr = (() => { try { return JSON.parse(localStorage.getItem('eqGains') || '[]'); } catch { return []; } })();
        arr[idx] = val;
        localStorage.setItem('eqGains', JSON.stringify(arr));
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

  closeEq() {
    if (!this.eqControls.classList.contains('hidden')) {
      this.eqControls.classList.add('hidden');
      this.toggleEqBtn.classList.remove('active');
    }
  }

  toggleVizControls() {
    this.vizControls.classList.toggle('hidden');
    if (!this.vizControls.dataset.initialized) {
      this.initVizControls();
      this.vizControls.dataset.initialized = '1';
    }
  }

  closeVizControls() {
    if (!this.vizControls.classList.contains('hidden')) {
      this.vizControls.classList.add('hidden');
    }
  }

  maybeCloseFloatingPanels(e) {
    const path = e.composedPath ? e.composedPath() : [];
    const clickedEq = path.includes(this.eqControls) || path.includes(this.toggleEqBtn);
    const clickedViz = path.includes(this.vizControls) || path.includes(this.visualSettingsBtn);
    if (!clickedEq) this.closeEq();
    if (!clickedViz) this.closeVizControls();
  }

  // Queue context menu
  ensureQueueContextMenu() {
    if (this.queueCtx) return this.queueCtx;
    const menu = document.createElement('div');
    menu.id = 'queue-context-menu';
    menu.className = 'context-menu hidden';
    const optPlay = document.createElement('div'); optPlay.className = 'context-item'; optPlay.textContent = 'Play';
    const optPlayNext = document.createElement('div'); optPlayNext.className = 'context-item'; optPlayNext.textContent = 'Play next';
    const optEdit = document.createElement('div'); optEdit.className = 'context-item'; optEdit.textContent = 'Edit tags';
    const optReveal = document.createElement('div'); optReveal.className = 'context-item'; optReveal.textContent = 'Reveal in folder';
    const sep = document.createElement('div'); sep.className = 'context-separator';
    const optRemove = document.createElement('div'); optRemove.className = 'context-item destructive'; optRemove.textContent = 'Remove from queue';
    menu.appendChild(optPlay); menu.appendChild(optPlayNext); menu.appendChild(optEdit); menu.appendChild(optReveal); menu.appendChild(sep); menu.appendChild(optRemove);
    document.body.appendChild(menu);
    this.queueCtx = { el: menu, optPlay, optPlayNext, optReveal, optRemove, optEdit };
    return this.queueCtx;
  }

  showQueueContextMenu(e, index) {
    const ctx = this.ensureQueueContextMenu();
    const { el, optPlay, optPlayNext, optReveal, optRemove, optEdit } = ctx;
    el.style.left = `${e.clientX}px`;
    el.style.top = `${e.clientY}px`;
    el.classList.remove('hidden');
    const off = () => this.hideQueueContextMenu();
    optPlay.onclick = () => { this.audioManager.playTrack(index); off(); };
    optPlayNext.onclick = () => { this.audioManager.moveTrackToNext(index); off(); };
    optReveal.onclick = () => { const t = this.audioManager.getQueue()[index]; if (t) window.electronAPI.revealInFolder(t.path); off(); };
    optRemove.onclick = () => { this.audioManager.removeTrackAt(index); off(); };
    optEdit.onclick = () => { this.openMetadataModalForIndex(index); off(); };
  }

  hideQueueContextMenu() {
    if (this.queueCtx?.el) this.queueCtx.el.classList.add('hidden');
  }

  // Metadata overrides: UI + helpers
  initMetadataUi() {
    // Wire modal if present
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
    // If no meta loaded yet, try to load from file
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
  }

  closeMetadataModal() {
    if (this.metaModal) this.metaModal.classList.add('hidden');
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

    // Try to write to file (MP3 supported); fall back to overrides only
    try { await window.electronAPI.writeMetadata(path, data); } catch { /* ignore */ }

    // Persist in-app override so UI reflects immediately and supports formats we don't write
    this.metaOverrides[path] = data;
    localStorage.setItem('metadataOverrides', JSON.stringify(this.metaOverrides));

    // Update cached meta on the track
    const t = this.audioManager.getQueue().find(tr => tr.path === path);
    if (t) t.meta = { ...(t.meta || {}), ...data };

    // Refresh UI
    const curIdx = this.audioManager.getCurrentIndex();
    const cur = this.audioManager.getQueue()[curIdx];
    if (cur && cur.path === path) this.updateTrackInfo(cur);
    this.renderQueue();
    this.closeMetadataModal();
  }

  toggleDarkMode() {
    const enabled = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', enabled);
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

  // Visualization controls
  cycleVisualization() {
    const order = ['orb', 'bars', 'wave', 'spectrogram', 'particles'];
    const current = localStorage.getItem('vizMode') || 'orb';
    const next = order[(order.indexOf(current) + 1) % order.length];
    if (this.visualizer.setMode) this.visualizer.setMode(next);
    localStorage.setItem('vizMode', next);
    this.updateVisualizationUi(next);
  }

  updateVisualizationUi(mode) {
    if (!this.visualModeBtn) return;
    const m = mode || localStorage.getItem('vizMode') || 'orb';
    const label = (
      m === 'bars' ? 'Bars' :
      m === 'wave' ? 'Wave' :
      m === 'spectrogram' ? 'Spectrogram' :
      m === 'particles' ? 'Particles' : 'Orb'
    );
    this.visualModeBtn.title = `Visualization: ${label} (click to change)`;
  }

  initVizControls() {
    const cfg = (() => { try { return JSON.parse(localStorage.getItem('vizConfig') || '{}'); } catch { return {}; } })();
    const theme = localStorage.getItem('vizTheme') || 'neon';
    const el = this.vizControls;
    el.innerHTML = '';
    // Mode select
    const modeRow = document.createElement('div');
    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Mode';
    modeLabel.style.marginRight = '8px';
    const modeSelect = document.createElement('select');
    modeSelect.id = 'viz-mode-select';
    ['orb','bars','wave','spectrogram','particles'].forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m[0].toUpperCase() + m.slice(1);
      if ((localStorage.getItem('vizMode') || 'orb') === m) opt.selected = true;
      modeSelect.appendChild(opt);
    });
    modeSelect.addEventListener('change', (e) => {
      const m = e.target.value;
      if (this.visualizer.setMode) this.visualizer.setMode(m);
      localStorage.setItem('vizMode', m);
      this.updateVisualizationUi(m);
    });
    modeRow.appendChild(modeLabel);
    modeRow.appendChild(modeSelect);
    el.appendChild(modeRow);

    // Theme select
    const themeRow = document.createElement('div');
    themeRow.style.marginTop = '8px';
    const themeLabel = document.createElement('label');
    themeLabel.textContent = 'Theme';
    themeLabel.style.marginRight = '8px';
    const themeSelect = document.createElement('select');
    themeSelect.id = 'viz-theme-select';
    ['neon','sunset','aurora','ocean','mono'].forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t[0].toUpperCase() + t.slice(1);
      if (theme === t) opt.selected = true;
      themeSelect.appendChild(opt);
    });
    themeSelect.addEventListener('change', (e) => {
      const t = e.target.value;
      if (this.visualizer.setTheme) this.visualizer.setTheme(t);
      localStorage.setItem('vizTheme', t);
    });
    themeRow.appendChild(themeLabel);
    themeRow.appendChild(themeSelect);
    el.appendChild(themeRow);

    // Per-mode controls
    const addSlider = (labelText, min, max, step, value, onInput) => {
      const row = document.createElement('div');
      row.style.marginTop = '8px';
      const label = document.createElement('label');
      label.textContent = labelText;
      label.style.marginRight = '8px';
      const input = document.createElement('input');
      input.type = 'range'; input.min = String(min); input.max = String(max); input.step = String(step); input.value = String(value);
      input.addEventListener('input', (e) => onInput(Number(e.target.value)));
      row.appendChild(label);
      row.appendChild(input);
      el.appendChild(row);
    };

    // Bars: count
    addSlider('Bars', 32, 256, 8, cfg?.bars?.count ?? 160, (val) => {
      const c = cfg.bars || (cfg.bars = {}); c.count = val;
      if (this.visualizer.setConfig) this.visualizer.setConfig('bars', { count: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });

    // Wave: thickness
    addSlider('Wave', 1, 6, 1, cfg?.wave?.thickness ?? 2, (val) => {
      const c = cfg.wave || (cfg.wave = {}); c.thickness = val;
      if (this.visualizer.setConfig) this.visualizer.setConfig('wave', { thickness: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });

    // Spectrogram: speed
    addSlider('Scroll', 1, 4, 1, cfg?.spectrogram?.speed ?? 1, (val) => {
      const c = cfg.spectrogram || (cfg.spectrogram = {}); c.speed = val;
      if (this.visualizer.setConfig) this.visualizer.setConfig('spectrogram', { speed: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });

    // Particles: intensity
    addSlider('Particles', 0, 2, 0.1, cfg?.particles?.intensity ?? 1, (val) => {
      const c = cfg.particles || (cfg.particles = {}); c.intensity = val;
      if (this.visualizer.setConfig) this.visualizer.setConfig('particles', { intensity: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });

    // Orb: scale
    addSlider('Orb size', 0.2, 0.6, 0.02, cfg?.orb?.scale ?? 0.4, (val) => {
      const c = cfg.orb || (cfg.orb = {}); c.scale = val;
      if (this.visualizer.setConfig) this.visualizer.setConfig('orb', { scale: val });
      localStorage.setItem('vizConfig', JSON.stringify(cfg));
    });
  }

  // Animation Loop
  update() {
    if (this.audioManager.isPlaying) {
      this.visualizer.draw();
      this.updateProgressBar();
    }
    this.updateDiagnostics(); // refresh diagnostic overlay if visible
    requestAnimationFrame(this.update.bind(this));
  }

  // Chord detection controls
  toggleChords() {
    this.chordsEnabled = !this.chordsEnabled;
    localStorage.setItem('chordsEnabled', this.chordsEnabled);
    this.updateChordToggleUi();
    if (!this.chordsEnabled) {
      this.chordDetector.stop();
      this.detectorRunning = false;
      if (this.chordReadout) {
        this.chordReadout.textContent = '—';
        this.chordReadout.classList.add('dim');
        this.chordReadout.style.removeProperty('color');
        this.chordReadout.style.removeProperty('background');
        this.chordReadout.style.removeProperty('border-color');
      }
    } else {
      this.startChordDetectorWhenReady();
    }
  }

  cycleChordMode() {
    const order = ['lowcpu', 'responsive', 'normal', 'accurate'];
    const next = order[(order.indexOf(this.chordMode) + 1) % order.length];
    this.chordMode = next;
    this.applyChordMode(next);
    localStorage.setItem('chordMode', next);
    this.updateChordToggleUi();
  }

  applyChordMode(mode) {
    // Adjust detector parameters live for different UX tradeoffs
    const d = this.chordDetector;
    if (!d) return;
    if (mode === 'lowcpu') {
      // Tune for low-powered devices
      d.confEnter = 0.35;
      d.confExit = 0.28;
      d.holdMsEnter = 450;
      d.holdMsExit = 250;
      d.requiredStableFrames = 1;
      d.chromaAlphaFast = 0.4;
      d.chromaAlphaSlow = 0.2;
      d.harmonicThreshold = 0.1;
      d.rmsGate = 0.005;
      d.minSpectralClarity = 0.0;
      d.enableHarmonicAnalysis = false; // fewer analysis passes
      d.disableEnergyGate = true; // never gate on low total energy
      d.maxFps = 25; // throttle detector loop
      d.chromaSigmaCents = 45; // wider buckets for robustness
      // Reduce FFT size to lower CPU
      this.audioManager.setChordFftSize(8192);
      // Throttle visualizer slightly
      this.visualizer.fpsCap = 30;
    } else if (mode === 'responsive') {
      d.confEnter = 0.35;
      d.confExit = 0.28;
      d.holdMsEnter = 300;
      d.holdMsExit = 200;
      d.requiredStableFrames = 1;
      d.chromaAlphaFast = 0.5;
      d.chromaAlphaSlow = 0.12;
      d.harmonicThreshold = 0.12;
      d.enableHarmonicAnalysis = true;
      d.maxFps = 45;
      d.chromaSigmaCents = 40;
      this.audioManager.setChordFftSize(16384);
      this.visualizer.fpsCap = 45;
    } else if (mode === 'accurate') {
      d.confEnter = 0.52;
      d.confExit = 0.42;
      d.holdMsEnter = 700;
      d.holdMsExit = 350;
      d.requiredStableFrames = 3;
      d.chromaAlphaFast = 0.35;
      d.chromaAlphaSlow = 0.18;
      d.harmonicThreshold = 0.15;
      d.enableHarmonicAnalysis = true;
      d.maxFps = 60;
      d.chromaSigmaCents = 30; // tighter mapping for precision
      this.audioManager.setChordFftSize(32768);
      this.visualizer.fpsCap = 60;
    } else { // normal
      d.confEnter = 0.4;
      d.confExit = 0.32;
      d.holdMsEnter = 500;
      d.holdMsExit = 250;
      d.requiredStableFrames = 2;
      d.chromaAlphaFast = 0.4;
      d.chromaAlphaSlow = 0.15;
      d.harmonicThreshold = 0.15;
      d.enableHarmonicAnalysis = true;
      d.maxFps = 40;
      d.chromaSigmaCents = 35;
      this.audioManager.setChordFftSize(16384);
      this.visualizer.fpsCap = 40;
    }
  }

  updateChordToggleUi() {
    if (!this.toggleChordsBtn) return;
    this.toggleChordsBtn.classList.toggle('inactive', !this.chordsEnabled);
    const label = (
      this.chordMode === 'lowcpu' ? 'Low-CPU' :
      this.chordMode === 'responsive' ? 'Responsive' :
      this.chordMode === 'accurate' ? 'Accurate' : 'Normal'
    );
    this.toggleChordsBtn.title = this.chordsEnabled ? `Chords: ${label} (right-click to change mode)` : 'Chords: Off (click to enable)';
  }

  // Update diagnostic overlay with live metrics
  updateDiagnostics() {
    if (!this.diagEl || this.diagEl.classList.contains('hidden')) return;
    const { noiseFloor, activeBins, confidence, spectralClarity, dynamicGate, tuningCents = 0 } = this.chordDetector.getDiagnostics();
    const rms = this.audioManager.getCurrentRms().toFixed(3);
    const tune = (tuningCents || 0).toFixed(1);
    const sign = (tuningCents || 0) > 0 ? '+' : '';
    this.diagEl.textContent = `RMS: ${rms} | noiseFloor: ${noiseFloor.toFixed(3)} | activeBins: ${activeBins} | ` +
      `clarity: ${spectralClarity.toFixed(2)} | gate: ${dynamicGate.toFixed(3)} | conf: ${confidence.toFixed(2)} | tune: ${sign}${tune}c`;
  }

  updateProgressBar() {
    const { currentTime, duration } = this.audioManager.getCurrentSource();
    if (duration > 0) {
      const progress = (currentTime / duration) * 100;
      this.progressBar.value = progress;
      this.trackDurationEl.textContent = `${this.formatTime(currentTime)} / ${this.formatTime(duration)}`;
    }
    else {
      this.progressBar.value = 0;
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
