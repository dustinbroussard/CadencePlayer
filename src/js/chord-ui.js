import { applyChordModePreset } from './chord-mode-presets.js';
import { getChordColors } from './ui/chord-colors.js';

export class ChordUi {
  constructor(renderer) {
    this.renderer = renderer;
    this.audioManager = renderer.audioManager;
    this.chordDetector = renderer.chordDetector;

    this.chordDetector.setOnChord(({ name, confidence }) => {
      const readout = this.renderer.chordReadout;
      if (!readout) return;

      if (!name) {
        readout.textContent = '—';
        readout.classList.add('dim');
        readout.classList.remove('pulse');
        readout.style.removeProperty('color');
        readout.style.removeProperty('background');
        readout.style.removeProperty('border-color');
      } else {
        const conf = Math.round(confidence * 100);
        readout.textContent = `${name}  ·  ${conf}%`;

        const { fg, bg } = getChordColors(name);
        const greenThresh = Math.round(this.chordDetector.confEnter * 100);
        readout.style.color = conf >= greenThresh ? fg : '';
        readout.style.background = bg;
        readout.style.borderColor = fg;

        readout.classList.remove('dim');
        readout.classList.add('pulse');
        if (this.renderer.chordPulseTimeout) clearTimeout(this.renderer.chordPulseTimeout);
        this.renderer.chordPulseTimeout = setTimeout(() => {
          if (readout) readout.classList.remove('pulse');
          this.renderer.chordPulseTimeout = null;
        }, 120);
      }
    });
  }

  toggleChords() {
    this.renderer.chordsEnabled = !this.renderer.chordsEnabled;
    localStorage.setItem('chordsEnabled', this.renderer.chordsEnabled);
    this.updateChordToggleUi();
    if (!this.renderer.chordsEnabled) {
      this.chordDetector.stop();
      this.renderer.detectorRunning = false;
      const readout = this.renderer.chordReadout;
      if (readout) {
        readout.textContent = '—';
        readout.classList.add('dim');
        readout.style.removeProperty('color');
        readout.style.removeProperty('background');
        readout.style.removeProperty('border-color');
      }
    } else {
      this.renderer.startChordDetectorWhenReady();
    }
  }

  cycleChordMode() {
    const order = ['lowcpu', 'responsive', 'normal', 'accurate'];
    const next = order[(order.indexOf(this.renderer.chordMode) + 1) % order.length];
    this.renderer.chordMode = next;
    this.applyChordMode(next);
    localStorage.setItem('chordMode', next);
    this.updateChordToggleUi();
  }

  applyChordMode(mode) {
    applyChordModePreset(this.chordDetector, mode, {
      setChordFftSize: (fftSize) => this.audioManager.setChordFftSize(fftSize),
      setVisualizerFpsCap: (fpsCap) => { this.renderer.visualizer.fpsCap = fpsCap; }
    });
  }

  updateChordToggleUi() {
    const btn = this.renderer.toggleChordsBtn;
    if (!btn) return;
    btn.classList.toggle('inactive', !this.renderer.chordsEnabled);
    const label = (
      this.renderer.chordMode === 'lowcpu' ? 'Low-CPU' :
      this.renderer.chordMode === 'responsive' ? 'Responsive' :
      this.renderer.chordMode === 'accurate' ? 'Accurate' : 'Normal'
    );
    btn.title = this.renderer.chordsEnabled ? `Chords: ${label} (right-click to change mode)` : 'Chords: Off (click to enable)';
  }

  updateDiagnostics() {
    const diag = this.renderer.diagEl;
    if (!diag || diag.classList.contains('hidden')) return;
    const { noiseFloor, activeBins, confidence, spectralClarity, dynamicGate, tuningCents = 0 } = this.chordDetector.getDiagnostics();
    const rms = this.audioManager.getCurrentRms().toFixed(3);
    const tune = (tuningCents || 0).toFixed(1);
    const sign = (tuningCents || 0) > 0 ? '+' : '';
    diag.textContent = `RMS: ${rms} | noiseFloor: ${noiseFloor.toFixed(3)} | activeBins: ${activeBins} | ` +
      `clarity: ${spectralClarity.toFixed(2)} | gate: ${dynamicGate.toFixed(3)} | conf: ${confidence.toFixed(2)} | tune: ${sign}${tune}c`;
  }
}
