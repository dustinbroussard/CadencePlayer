import { AudioManager } from './audio-manager.js';
import { Visualizer } from './visualizer.js';
import { ChordDetector } from './chord-detector.js';
import { ChordVisualizer } from './chord-visualizer.js';

class Renderer {
  constructor() {
    this.audioManager = new AudioManager();
    this.visualizer = new Visualizer('visualizer', this.audioManager.getAnalyser());
    this.chordDetector = new ChordDetector(this.audioManager.getChordAnalyser(), {
      sampleRate: this.audioManager.ctx.sampleRate,
      confEnter: 0.45,
      confExit: 0.35,
      holdMsEnter: 300,
      holdMsExit: 400,
      requiredStableFrames: 2,
      harmonicThreshold: 0.12,
      noiseFloorAlpha: 0.05,
      chromaAlphaFast: 0.4,
      chromaAlphaSlow: 0.15,
      enableBassBias: true,
      enableHarmonicAnalysis: true,
      enableAdvancedQualities: true,
      inversionDetection: true,
      getRms: () => this.audioManager.getCurrentRms(),
      rmsGate: 0.015
    });

    this.chordVisualizer = new ChordVisualizer('chord-visualization', {
      showCircleOfFifths: true,
      showPianoRoll: true,
      showSpectralAnalysis: true,
      showChordProgression: true,
      animationDuration: 600,
      colorScheme: 'enhanced'
    });

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
    this.eqControls = document.getElementById('eq-controls');
    this.darkModeToggle = document.getElementById('dark-mode-toggle');
    this.toggleChordVizBtn = document.getElementById('toggle-chord-viz-btn');

    this.minimizeBtn = document.getElementById('minimize-btn');
    this.maximizeBtn = document.getElementById('maximize-btn');
    this.closeBtn = document.getElementById('close-btn');

    this.initEventListeners();
    this.initEqControls();
    this.initDragAndDrop();
    this.setupChordDetection();

    this.detectorRunning = false;
  }

  setupChordDetection() {
    this.chordDetector.setOnChord((chordData) => {
      this.updateChordDisplay(chordData);
      this.chordVisualizer.updateChordDisplay(chordData);
    });
  }

  updateChordDisplay(chordData) {
    if (!this.chordReadout) return;
    if (!chordData.name) {
      this.chordReadout.textContent = '—';
      this.chordReadout.classList.add('dim');
      this.chordReadout.classList.remove('pulse');
    } else {
      const conf = Math.round(chordData.confidence * 100);
      this.chordReadout.textContent = `${chordData.name} · ${conf}%`;
      this.chordReadout.classList.remove('dim');
      this.chordReadout.classList.add('pulse');
      setTimeout(() => this.chordReadout && this.chordReadout.classList.remove('pulse'), 120);
    }
  }

  initEventListeners() {
    this.minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    this.maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
    this.closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

    this.playPauseBtn.addEventListener('click', () => this.togglePlayback());
    this.nextBtn.addEventListener('click', () => this.nextTrack());
    this.prevBtn.addEventListener('click', () => this.prevTrack());
    this.volumeSlider.addEventListener('input', (e) => this.audioManager.setVolume(e.target.value));
    this.progressBar.addEventListener('input', (e) => this.audioManager.seek(e.target.value / 100));
    this.shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    this.repeatBtn.addEventListener('click', () => this.toggleRepeat());
    this.toggleEqBtn.addEventListener('click', () => this.toggleEq());
    this.darkModeToggle.addEventListener('click', () => this.toggleDarkMode());
    if (this.toggleChordVizBtn) {
      this.toggleChordVizBtn.addEventListener('click', () => this.toggleChordVisualizer());
    }

    this.addFilesBtn.addEventListener('click', async () => {
      const files = await window.electronAPI.openFileDialog();
      if (files) {
        await this.audioManager.addFilesToQueue(files);
      }
    });
    this.clearQueueBtn.addEventListener('click', () => this.audioManager.clearQueue());

    this.audioManager.on('queue-updated', () => this.renderQueue());
    this.audioManager.on('track-loaded', (track) => this.handleTrackLoaded(track));
    this.audioManager.on('playback-ended', () => this.handlePlaybackEnd());

    this.update();
  }

  initDragAndDrop() {
    const dropZone = document.body;
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
      const fileCount = e.dataTransfer.items.length;
      this.showDropPreview(`Drop ${fileCount} audio files`);
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('drag-over');
      this.hideDropPreview();
    });

    dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      this.hideDropPreview();
      const files = [...e.dataTransfer.files]
        .filter(f => this.isAudioFile(f))
        .map(f => ({ path: f.path, name: f.name }));
      if (files.length > 0) {
        this.showLoadingProgress();
        await this.audioManager.addFilesToQueue(files);
        this.hideLoadingProgress();
      }
    });
  }

  isAudioFile(file) {
    const audioTypes = ['audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'];
    return audioTypes.includes(file.type) || /\.(mp3|wav|ogg|m4a)$/i.test(file.name);
  }

  showDropPreview(message) {
    if (!this.dropPreviewEl) {
      this.dropPreviewEl = document.createElement('div');
      this.dropPreviewEl.className = 'drop-preview';
      document.body.appendChild(this.dropPreviewEl);
    }
    this.dropPreviewEl.textContent = message;
    this.dropPreviewEl.classList.remove('hidden');
  }

  hideDropPreview() {
    if (this.dropPreviewEl) {
      this.dropPreviewEl.classList.add('hidden');
    }
  }

  showLoadingProgress() {
    if (!this.loadingEl) {
      this.loadingEl = document.createElement('div');
      this.loadingEl.className = 'loading-progress';
      this.loadingEl.textContent = 'Loading...';
      document.body.appendChild(this.loadingEl);
    }
    this.loadingEl.classList.remove('hidden');
  }

  hideLoadingProgress() {
    if (this.loadingEl) {
      this.loadingEl.classList.add('hidden');
    }
  }

  toggleChordVisualizer() {
    const el = document.getElementById('chord-visualization');
    if (el) {
      el.classList.toggle('hidden');
    }
  }

  togglePlayback() {
    if (this.audioManager.isPlaying) {
      this.audioManager.pause();
      this.playIcon.classList.remove('hidden');
      this.pauseIcon.classList.add('hidden');
    } else {
      this.audioManager.play();
      this.playIcon.classList.add('hidden');
      this.pauseIcon.classList.remove('hidden');
      this.startChordDetectorWhenReady();
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

  handleTrackLoaded(track) {
    this.trackNameEl.textContent = track ? track.name : 'No track loaded';
    this.progressBar.value = 0;
    this.trackDurationEl.textContent = track ? '0:00 / ' + this.formatTime(track.duration) : '';
    this.startChordDetectorWhenReady();
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

  startChordDetectorWhenReady() {
    if (this.detectorRunning) return;
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
}

document.addEventListener('DOMContentLoaded', () => {
  new Renderer();
});

export { Renderer };

