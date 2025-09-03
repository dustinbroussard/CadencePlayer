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
      chromaAlpha: 0.30,
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
    this.toggleChordsBtn = document.getElementById('toggle-chords-btn');
    this.eqControls = document.getElementById('eq-controls');
    this.darkModeToggle = document.getElementById('dark-mode-toggle');

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
    if (quality.includes('7') || quality.includes('9')) return { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
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
    this.toggleEqBtn.addEventListener('click', () => this.toggleEq());
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
      const files = [...e.dataTransfer.files]
        .filter(f => (f.type && f.type.startsWith('audio/')) || allowed.has((f.name.split('.').pop()||'').toLowerCase()))
        .map(f => ({ path: f.path, name: f.name }));
      if (files.length > 0) {
        this.audioManager.addFilesToQueue(files);
      }
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
    const enabled = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', enabled);
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
    const { noiseFloor, activeBins, confidence, spectralClarity, dynamicGate } = this.chordDetector.getDiagnostics();
    const rms = this.audioManager.getCurrentRms().toFixed(3);
    this.diagEl.textContent = `RMS: ${rms} | noiseFloor: ${noiseFloor.toFixed(3)} | activeBins: ${activeBins} | ` +
      `clarity: ${spectralClarity.toFixed(2)} | gate: ${dynamicGate.toFixed(3)} | conf: ${confidence.toFixed(2)}`;
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
