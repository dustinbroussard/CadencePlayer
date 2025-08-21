// src/js/chord-detector.js
export class ChordDetector {
  constructor(analyser, opts = {}) {
    this.analyser = analyser;
    this.sampleRate = opts.sampleRate ?? 44100;
    this.fftSize = analyser.fftSize ?? 16384;

    this.fftBins = new Float32Array(this.fftSize / 2);
    this.pitchClassEnergy = new Float32Array(12);
    this.chromaEma = new Float32Array(12);

    // Frequency range tuned for fundamentals + a bit of upper content
    this.minFreq = opts.minFreq ?? 70;
    this.maxFreq = opts.maxFreq ?? 2200;

    // Stabilization
    this.holdMsEnter = opts.holdMsEnter ?? 400;   // announce new chords faster
    this.holdMsExit  = opts.holdMsExit  ?? 250;   // clear stale chords sooner
    this.requiredStableFrames = opts.requiredStableFrames ?? 2;

    // Confidence (hysteresis)
    this.confEnter = opts.confEnter ?? 0.4;
    this.confExit  = opts.confExit  ?? 0.32;

    // Activity detection
    this.harmonicThreshold = opts.harmonicThreshold ?? 0.2;
    this.noiseFloorAlpha = opts.noiseFloorAlpha ?? 0.08;  // EMA for noise floor
    this.noiseFloor = 0;

    // Smoothing
    this.chromaAlpha = opts.chromaAlpha ?? 0.35; // EMA smoothing

    // Root biasing from bass region
    this.enableBassBias = opts.enableBassBias ?? true;
    this.bassMaxFreq = opts.bassMaxFreq ?? 220;  // Hz
    this.bassBias = opts.bassBias ?? 0.12;       // add to template root bin

    // Harmonic whitening (reduces 2f/3f dominance from single notes)
    this.enableWhitening = opts.enableWhitening ?? true;

    // Templates (weighted; normalized later)
    this.templates = this._buildTemplates();

    // State
    this.lastChord = null;
    this.lastChangeTime = 0;
    this.confidenceHistory = [];
    this.maxHistoryLength = 10;
    this.stableChordCount = 0;

    this.onChord = () => {};
  }

  setOnChord(cb) { this.onChord = cb; }
  start() {
    const tick = () => { this.update(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  update() {
    if (!this.analyser) return;

    this.analyser.getFloatFrequencyData(this.fftBins);
    const chroma = this._computeChroma();
    if (!chroma) return;

    // Adaptive noise floor & activity gate
    const totalEnergy = chroma.reduce((s, v) => s + v, 0);
    this.noiseFloor = (1 - this.noiseFloorAlpha) * this.noiseFloor + this.noiseFloorAlpha * totalEnergy;
    const gate = Math.max(0.04, this.noiseFloor * 1.3);
    if (totalEnergy < gate) {
      this._handleSilence();
      return;
    }

    // Need enough distinct pitch classes to be “chord-like”
    const active = chroma.filter(v => v > totalEnergy * this.harmonicThreshold).length;
    if (active < 2) {
      this._handleSingleNote();
      return;
    }

    // Optional bass-root bias
    let biasedChroma = chroma;
    if (this.enableBassBias) {
      const bassPc = this._lowestStrongPc();
      if (bassPc !== null) {
        biasedChroma = biasedChroma.slice();
        biasedChroma[bassPc] += this.bassBias * Math.max(...biasedChroma);
      }
    }

    const detection = this._findBestChord(biasedChroma);
    if (!detection) { this._handleLowConfidence(); return; }

    // Hysteresis thresholds
    const enterOK = detection.confidence >= this.confEnter;
    const exitOK  = detection.confidence >= this.confExit;

    const now = performance.now();
    const chordName = `${this._pcToName(detection.root)}${detection.quality}`;

    if (chordName !== this.lastChord) {
      if (enterOK) {
        this.stableChordCount++;
        if (this.stableChordCount >= this.requiredStableFrames &&
            (now - this.lastChangeTime) > this.holdMsEnter) {
          this._setCurrentChord(chordName, detection.confidence);
        }
      } else {
        this.stableChordCount = Math.max(0, this.stableChordCount - 1);
        // If we were holding something else for a while but new candidate is weak, keep old
      }
    } else {
      // Same chord—maintain or clear with exit hysteresis + time
      if (exitOK) {
        this.stableChordCount = Math.min(this.stableChordCount + 1, this.requiredStableFrames);
      } else if ((now - this.lastChangeTime) > this.holdMsExit) {
        this._clearChord();
      }
    }
  }

  _findBestChord(chroma) {
    let best = null;
    let bestScore = -Infinity;

    for (let root = 0; root < 12; root++) {
      for (const t of this.templates) {
        const rotated = this._rotate(t.vec, root);
        const score = this._dot(chroma, rotated);
        if (score > bestScore) {
          bestScore = score;
          const confidence = this._confidence(chroma, rotated);
          best = { root, quality: t.suffix, confidence, score };
        }
      }
    }

    // Lightweight 7th/add detection layered on top of common chord classes
    // Now also runs for detected 6th chords so we can upgrade to 6/9 etc.
    const checkQualities = ['', 'm', 'sus2', 'sus4', '6', 'm6'];
    if (best && checkQualities.includes(best.quality)) {
      best = this._checkForSeventhsAndAdds(chroma, best);
    }
    return best;
  }

  _checkForSeventhsAndAdds(chroma, det) {
    const { root, quality } = det;
    const isMinor = quality.startsWith('m');
    const third = (root + (isMinor ? 3 : 4)) % 12;
    const fifth = (root + 7) % 12;
    const triadRef = Math.max(chroma[root], chroma[third], chroma[fifth]);

    const b7 = chroma[(root + 10) % 12];
    const M7 = chroma[(root + 11) % 12];
    const add2 = chroma[(root + 2) % 12];
    const sixth = chroma[(root + 9) % 12];
    const thresh = triadRef * 0.45;

    if (M7 > b7 && M7 > thresh) {
      return { ...det, quality: isMinor ? 'mMaj7' : 'Maj7' };
    }
    if (b7 > thresh) {
      if (add2 > thresh * 0.9) return { ...det, quality: isMinor ? 'm9' : '9' };
      return { ...det, quality: isMinor ? 'm7' : '7' };
    }
    if (sixth > thresh) {
      if (add2 > thresh * 0.9) return { ...det, quality: isMinor ? 'm6/9' : '6/9' };
      return { ...det, quality: isMinor ? 'm6' : '6' };
    }
    if (add2 > thresh) return { ...det, quality: (isMinor ? 'madd9' : 'add9') };

    return det;
  }

  _confidence(chroma, template) {
    // cosine sim – off-template penalty – sparsity boost
    const nc = this._norm(chroma);
    const nt = this._norm(template);
    const sim = this._dot(nc, nt);

    let penalty = 0;
    for (let i = 0; i < 12; i++) {
      if (nt[i] < 0.08 && nc[i] > 0.18) penalty += nc[i] * 0.35;
    }
    const sparsity = 1 - (nc.filter(v => v > 0.12).length / 12); // fewer actives → slightly higher confidence
    return Math.max(0, sim - penalty + 0.06 * sparsity);
  }

  _computeChroma() {
    // reset & accumulate
    this.pitchClassEnergy.fill(0);
    const len = this.fftBins.length;
    const binHz = this.sampleRate / (2 * len);

    for (let i = 1; i < len; i++) {
      // convert dB → linear magnitude
      let mag = Math.pow(10, this.fftBins[i] / 20);
      if (mag <= 0) continue;

      const f = i * binHz;
      if (f < this.minFreq || f > this.maxFreq) continue;

      // simple harmonic whitening: down-weight 2f and 3f regions
      if (this.enableWhitening) {
        const i2 = Math.round(i * 0.5); // ~fundamental index if current is 2f
        const i3 = Math.round(i / 3);   // ~fundamental index if current is 3f
        if (i2 > 0 && this.fftBins[i2] > this.fftBins[i] + 6) mag *= 0.65;
        if (i3 > 0 && this.fftBins[i3] > this.fftBins[i] + 6) mag *= 0.75;
      }

      // map to nearest pitch class
      const midi = 69 + 12 * Math.log2(f / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;

      // weight lows more (fundamentals)
      const freqWeight = Math.exp(-f / 1100);
      this.pitchClassEnergy[pc] += mag * freqWeight;
    }

    // L2 → robust L1-ish normalization with small floor
    const maxVal = Math.max(...this.pitchClassEnergy);
    if (maxVal === 0) return null;

    const normed = new Float32Array(12);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      normed[i] = this.pitchClassEnergy[i] / (maxVal + 1e-8);
      sum += normed[i];
    }
    for (let i = 0; i < 12; i++) normed[i] = normed[i] / (sum + 1e-8);

    // EMA smoothing across frames
    for (let i = 0; i < 12; i++) {
      this.chromaEma[i] = (1 - this.chromaAlpha) * this.chromaEma[i] + this.chromaAlpha * normed[i];
    }

    // soft threshold relative to EMA peak
    const peak = Math.max(...this.chromaEma);
    const thr = peak * 0.10;
    const out = new Float32Array(12);
    for (let i = 0; i < 12; i++) out[i] = this.chromaEma[i] < thr ? 0 : this.chromaEma[i];

    return out;
  }

  _lowestStrongPc() {
    // scan bins up to bassMaxFreq, find strongest pc
    const len = this.fftBins.length;
    const binHz = this.sampleRate / (2 * len);
    const maxBin = Math.min(len - 1, Math.floor(this.bassMaxFreq / binHz));
    const accum = new Float32Array(12);

    for (let i = 1; i <= maxBin; i++) {
      const mag = Math.pow(10, this.fftBins[i] / 20);
      if (mag <= 0) continue;
      const f = i * binHz;
      const midi = 69 + 12 * Math.log2(f / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      accum[pc] += mag;
    }
    const peak = Math.max(...accum);
    if (peak <= 0) return null;
    return accum.indexOf(peak);
  }

  _handleSilence() {
    const now = performance.now();
    if (this.lastChord && (now - this.lastChangeTime) > this.holdMsExit * 2) this._clearChord();
  }
  _handleSingleNote() {
    this.stableChordCount = Math.max(0, this.stableChordCount - 1);
  }
  _handleLowConfidence() {
    this.stableChordCount = Math.max(0, this.stableChordCount - 1);
    const now = performance.now();
    if ((now - this.lastChangeTime) > this.holdMsExit) this._clearChord();
  }

  _setCurrentChord(name, confidence) {
    this.lastChord = name;
    this.lastChangeTime = performance.now();
    this.stableChordCount = this.requiredStableFrames;
    this.onChord({ name, confidence });
  }
  _clearChord() {
    if (this.lastChord !== null) {
      this.lastChord = null;
      this.lastChangeTime = performance.now();
      this.confidenceHistory = [];
      this.stableChordCount = 0;
      this.onChord({ name: null, confidence: 0 });
    }
  }

  _pcToName(pc) {
    return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((pc % 12)+12)%12];
  }
  _rotate(arr, n) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[(i - n + arr.length) % arr.length];
    return out;
  }
  _dot(a, b) {
    let s = 0; for (let i = 0; i < 12; i++) s += a[i] * b[i]; return s;
  }
  _norm(arr) {
    let sum = 0; for (let i = 0; i < arr.length; i++) sum += arr[i] * arr[i];
    if (sum === 0) return new Float32Array(arr.length);
    const mag = Math.sqrt(sum);
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[i] / mag;
    return out;
  }

  _buildTemplates() {
    const N = (v) => this._norm(v);

    // triads and sixths
    const maj  = N([1,0,0,0,0.75,0,0,0.9,0,0,0,0]);       // R,3,5
    const min  = N([1,0,0,0.75,0,0,0,0.9,0,0,0,0]);       // R,b3,5
    const dim  = N([1,0,0,0.75,0,0,0.65,0,0,0,0,0]);      // R,b3,b5
    const aug  = N([1,0,0,0,0.75,0,0,0,0.75,0,0,0]);      // R,3,#5
    const maj6 = N([1,0,0,0,0.75,0,0,0.9,0,0.65,0,0]);    // R,3,5,6
    const min6 = N([1,0,0,0.75,0,0,0,0.9,0,0.65,0,0]);    // R,b3,5,6

    // guitar-friendly shapes
    const pow5 = N([1,0,0,0,0,0,0,0.9,0,0,0,0]);         // R,5 (no 3rd)
    const sus2 = N([1,0.85,0,0,0,0,0,0.9,0,0,0,0]);      // R,2,5
    const sus4 = N([1,0,0,0,0,0.85,0,0.9,0,0,0,0]);      // R,4,5

    return [
      { vec: maj,  suffix: ''    },
      { vec: min,  suffix: 'm'   },
      { vec: dim,  suffix: 'dim' },
      { vec: aug,  suffix: 'aug' },
      { vec: maj6, suffix: '6'   },
      { vec: min6, suffix: 'm6'  },
      { vec: pow5, suffix: '5'   },
      { vec: sus2, suffix: 'sus2' },
      { vec: sus4, suffix: 'sus4' },
    ];
  }
}

