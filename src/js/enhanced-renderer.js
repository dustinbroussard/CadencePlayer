import { AudioManager } from './audio-manager.js';
import { Visualizer } from './visualizer.js';
import { ChordDetector } from './chord-detector.js'; // Enhanced version
import { ChordVisualizer } from './chord-visualizer.js'; // New component

class Renderer {
  constructor() {
    this.audioManager = new AudioManager();
    this.visualizer = new Visualizer('visualizer', this.audioManager.getAnalyser());
    
    // Enhanced chord detector with optimized settings
    this.chordDetector = new ChordDetector(this.audioManager.getChordAnalyser(), {
      sampleRate: this.audioManager.ctx.sampleRate,
      // Faster, more responsive detection
      confEnter: 0.45,
      confExit: 0.35,
      holdMsEnter: 300,
      holdMsExit: 400,
      requiredStableFrames: 2,
      
      // Enhanced analysis
      harmonicThreshold: 0.12,
      noiseFloorAlpha: 0.05,
      chromaAlphaFast: 0.4,
      chromaAlphaSlow: 0.15,
      
      // Advanced features enabled
      enableBassBias: true,
      enableHarmonicAnalysis: true,
      enableAdvancedQualities: true,
      inversionDetection: true,
      
      // RMS gating
      getRms: () => this.audioManager.getCurrentRms(),
      rmsGate: 0.015
    });
    
    // Enhanced chord visualization
    this.chordVisualizer = new ChordVisualizer('chord-visualization', {
      showCircleOfFifths: true,
      showPianoRoll: true,
      showSpectralAnalysis: true,
      showChordProgression: true,
      animationDuration: 600,
      colorScheme: 'enhanced'
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
    this.eqControls = document.getElementById('eq-controls');
    this.darkModeToggle = document.getElementById('dark-mode-toggle');

    // Custom title bar buttons
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
    // Enhanced chord detection callback with rich data
    this.chordDetector.setOnChord((chordData) => {
      this.updateChordDisplay(chordData);
      this.updateChordVisualization(chordData);
    });
    
    // Set up real-time chroma data updates for visualization
    this.setupChromaDataStream();
  }

  setupChromaDataStream() {
    let lastChromaUpdate = 0;
    const updateChromaData = () => {
      if (performance.now() - lastChromaUpdate > 50) { // 20 FPS for chroma updates
        const chroma = this.chordDetector.chromaEma;
        if (chroma && this.chordVisualizer) {
          this.chordVisualizer.updateChromaData(chroma);
          
          const diagnostics = this.chordDetector.getDiagnostics();
          this.chordVisualizer.updateDiagnostics(diagnostics);
        }
        lastChromaUpdate = performance.now();
      }
      requestAnimationFrame(updateChromaData);
    };
    requestAnimationFrame(updateChromaData);
  }

  updateChordDisplay(chordData) {
    if (!this.chordReadout) return;

    if (!chordData.name) {
      this.chordReadout.textContent = '—';
      this.chordReadout.classList.add('dim');
      this.chordReadout.classList.remove('pulse', 'strong');
      this.chordReadout.style.removeProperty('color');
      this.chordReadout.style.removeProperty('background');
      this.chordReadout.style.removeProperty('border-color');
    } else {
      const conf = Math.round(chordData.confidence * 100);
      let displayText = chordData.name;
      
      // Add additional info for rich display
      if (chordData.inversion) {
        displayText += ` (${chordData.bass} bass)`;
      }
      
      displayText += ` · ${conf}%`;
      
      // Add quality description for complex chords
      if (chordData.quality && chordData.quality.length > 2) {
        const qualityDesc = this.getQualityDescription(chordData.quality);
        if (qualityDesc !== chordData.quality) {
          displayText += ` · ${qualityDesc}`;
        }
      }
      
      this.chordReadout.textContent = displayText;

      // Enhanced styling based on chord characteristics
      const { fg, bg } = this.getEnhancedChordColors(chordData);
      
      this.chordReadout.style.color = fg;
      this.chordReadout.style.background = bg;
      this.chordReadout.style.borderColor = fg;

      // Dynamic styling based on confidence and harmonic strength
      this.chordReadout.classList.remove('dim');
      this.chordReadout.classList.toggle('pulse', conf > 60);
      this.chordReadout.classList.toggle('strong', conf > 80 && chordData.harmonicStrength > 0.7);
      
      // Animate on chord changes
      setTimeout(() => {
        if (this.chordReadout) {
          this.chordReadout.classList.remove('pulse');
        }
      }, 300);
    }
  }

  updateChordVisualization(chordData) {
    if (this.chordVisualizer) {
      this.chordVisualizer.updateChordDisplay(chordData);
    }
  }

  getEnhancedChordColors(chordData) {
    const { quality, confidence, harmonicStrength } = chordData;
    
    // Base colors by chord type
    let baseColor;
    if (quality.includes('dim')) {
      baseColor = { fg: '#ff6b6b', bg: 'rgba(248,113,113,0.15)' };
    } else if (quality.includes('aug')) {
      baseColor = { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
    } else if (quality.startsWith('m') && !quality.includes('maj')) {
      baseColor = { fg: '#60a5fa', bg: 'rgba(96,165,250,0.15)' };
    } else if (quality.includes('sus')) {
      baseColor = { fg: '#c084fc', bg: 'rgba(192,132,252,0.15)' };
    } else if (quality.includes('6')) {
      baseColor = { fg: '#34d399', bg: 'rgba(52,211,153,0.15)' };
    } else if (quality.includes('7') || quality.includes('9') || quality.includes('11')) {
      baseColor = { fg: '#fbbf24', bg: 'rgba(251,191,36,0.15)' };
    } else if (quality.includes('5')) {
      baseColor = { fg: '#a1a1aa', bg: 'rgba(161,161,170,0.15)' };
    } else {
      baseColor = { fg: '#4ade80', bg: 'rgba(74,222,128,0.15)' };
    }
    
    // Enhance saturation based on confidence and harmonic strength
    const strength = Math.min(1, (confidence + (harmonicStr