import { AudioManager } from './audio-manager.js';
import { Visualizer } from './visualizer.js';
import { ChordDetector } from './chord-detector.js';

class Renderer {
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
      rmsGate: 0.02
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
    this.eqControls = document.getElementById('eq-controls');
    this.darkModeToggle = document.getElementById('dark-mode-toggle');

    // Custom title bar buttons
    this.minimizeBtn = document.getElementById('minimize-btn');
    this.maximizeBtn = document.getElementById('maximize-btn');
    this.closeBtn = document.getElementById('close-btn');

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
    // Flag ensures detector starts only once per track
    this.detectorRunning = false;
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
    const startTime = performance.now();
    let lastTime = 0;
    const tryStart = () => {
      const ctx = this.audioManager.ctx;
      const src = this.audioManager.getCurrentSource();
      const running = ctx && ctx.state === 'running';
      const playing = src && !src.paused && src.duration > 0 && src.currentTime > lastTime;
      lastTime = src ? src.currentTime : 0;
      if (running && playing) {
        this.chordDetector.start();
        this.detectorRunning = true;
        return;
      }
      if (performance.now() - startTime < 2000) requestAnimationFrame(tryStart);
    };
    tryStart();
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
    this.updateDiagnostics(); // refresh diagnostic overlay if visible
    requestAnimationFrame(this.update.bind(this));
  }

  // Update diagnostic overlay with live metrics
  updateDiagnostics() {
    if (!this.diagEl || this.diagEl.classList.contains('hidden')) return;
    const { noiseFloor, activeBins, confidence } = this.chordDetector.getDiagnostics();
    const rms = this.audioManager.getCurrentRms().toFixed(3);
    this.diagEl.textContent = `RMS: ${rms} | noiseFloor: ${noiseFloor.toFixed(3)} | ` +
      `activeBins: ${activeBins} | conf: ${confidence.toFixed(2)}`;
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

