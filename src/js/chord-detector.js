// Enhanced chord-detector.js with dramatic improvements
export class ChordDetector {
  constructor(analyser, opts = {}) {
    this.analyser = analyser;
    this.sampleRate = opts.sampleRate ?? 44100;
    this.fftSize = analyser.fftSize ?? 16384;

    this.fftBins = new Float32Array(this.fftSize / 2);
    this.pitchClassEnergy = new Float32Array(12);
    this.chromaEma = new Float32Array(12);
    this.chromaHistory = Array(5).fill(null).map(() => new Float32Array(12));
    this.historyIndex = 0;

    // Enhanced frequency analysis
    this.minFreq = opts.minFreq ?? 60;  // Lower for better bass detection
    this.maxFreq = opts.maxFreq ?? 3000; // Extended range
    this.fundamentalRange = opts.fundamentalRange ?? [80, 400]; // Focus range for roots
    
    // Improved timing with adaptive behavior
    this.holdMsEnter = opts.holdMsEnter ?? 300;
    this.holdMsExit = opts.holdMsExit ?? 400;
    this.requiredStableFrames = opts.requiredStableFrames ?? 3;
    
    // Dynamic confidence thresholds
    this.confEnter = opts.confEnter ?? 0.45;
    this.confExit = opts.confExit ?? 0.35;
    this.confidenceBoost = 0; // Adaptive boost for strong signals
    
    // Enhanced activity detection
    this.harmonicThreshold = opts.harmonicThreshold ?? 0.12;
    this.noiseFloorAlpha = opts.noiseFloorAlpha ?? 0.05;
    this.noiseFloor = 0;
    this.dynamicGate = 0.04; // Adaptive activity gate
    this.disableEnergyGate = opts.disableEnergyGate ?? false;
    // Allow spectral clarity gate to be tuned/disabled (useful for tests)
    this.minSpectralClarity = opts.minSpectralClarity ?? ((opts.getRms ?? null) ? 0.3 : 0.0);
    
    // Superior smoothing with multiple time constants
    this.chromaAlphaFast = opts.chromaAlphaFast ?? 0.4;  // Quick response
    this.chromaAlphaSlow = opts.chromaAlphaSlow ?? 0.15; // Stability
    this.chromaEmaSlow = new Float32Array(12);
    
    // Advanced RMS and spectral gating
    this.getRms = opts.getRms ?? null;
    this.rmsGate = opts.rmsGate ?? 0.015;
    this.spectralCentroid = 0;
    this.spectralSpread = 0;
    this.quietFrames = 0;
    this.quietFramesMax = 2;
    
    // Intelligent bass analysis
    this.enableBassBias = opts.enableBassBias ?? true;
    this.bassMaxFreq = opts.bassMaxFreq ?? 250;
    this.bassBias = opts.bassBias ?? 0.15;
    this.bassHistory = new Float32Array(12);
    this.bassAlpha = 0.2;
    
    // Advanced harmonic analysis
    this.enableHarmonicAnalysis = opts.enableHarmonicAnalysis ?? true;
    this.harmonicWeights = [1.0, 0.8, 0.6, 0.4, 0.3]; // 1st-5th harmonics
    this.subharmonicWeight = 0.7; // For detecting roots from overtones
    
    // Chord quality detection improvements
    this.enableAdvancedQualities = opts.enableAdvancedQualities ?? true;
    this.templates = this._buildEnhancedTemplates();
    this.inversionDetection = opts.inversionDetection ?? true;
    
    // Multi-frame analysis for stability
    this.detectionHistory = [];
    this.maxDetectionHistory = 8;
    this.consensusWeight = 0.7; // Weight for historical consensus
    
    // State tracking
    this.lastChord = null;
    this.lastChangeTime = 0;
    this.stableChordCount = 0;
    this.chordConfidenceHistory = [];
    this.adaptiveThreshold = this.confEnter;
    
    // Enhanced diagnostics
    this.activeBins = 0;
    this.currentConfidence = 0;
    this.spectralClarity = 0;
    this.harmonicStrength = 0;
    this.bassStrength = 0;
    this._started = false;
    this.maxFps = opts.maxFps ?? 60;
    this._lastTick = 0;
    
    this.onChord = () => {};

    // Tuning and chroma mapping (improves pitch-class accuracy)
    this.tuningHz = opts.tuningHz ?? 440;
    this.tuningCents = 0; // relative to 440Hz
    this._lastTuningCheck = 0;
    this.tuningCheckMs = opts.tuningCheckMs ?? 1500;
    this.chromaMap = null; // Float32Array of length (bins*12)
    this.chromaMapLen = 0;
    this.chromaSigmaCents = opts.chromaSigmaCents ?? 35; // gaussian width for bin→PC weights
  }

  setOnChord(cb) { this.onChord = cb; }
  
  start() {
    if (this._started) return;
    this._started = true;
    const loop = () => {
      const now = performance.now();
      const frameInterval = 1000 / Math.max(1, this.maxFps);
      if (!this._lastTick || (now - this._lastTick) >= frameInterval) {
        this._lastTick = now;
        this.update();
      }
      if (this._started) this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  stop() {
    if (!this._started) return;
    this._started = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  update() {
    if (!this.analyser) return;

    // Adapt internal buffers if external analyser FFT size changes
    if (this.analyser.fftSize && this.analyser.fftSize !== this.fftSize) {
      this.fftSize = this.analyser.fftSize;
      this.fftBins = new Float32Array(this.fftSize / 2);
      // Rebuild chroma map for new resolution
      this._rebuildChromaMap();
    }

    // Enhanced RMS gating with spectral analysis
    if (this.getRms) {
      const rms = this.getRms();
      if (rms < this.rmsGate) {
        if (++this.quietFrames >= this.quietFramesMax) {
          this._handleSilence();
          this._resetDiagnostics();
        }
        return;
      }
      this.quietFrames = 0;
    }

    this.analyser.getFloatFrequencyData(this.fftBins);
    
    // Periodically estimate tuning and rebuild chroma map if needed
    const nowTs = performance.now();
    if (nowTs - this._lastTuningCheck > this.tuningCheckMs) {
      const changed = this._estimateTuning();
      if (changed) this._rebuildChromaMap();
      this._lastTuningCheck = nowTs;
    }

    // Compute spectral features for better analysis (includes flatness)
    this._computeSpectralFeatures();
    
    const chroma = this._computeEnhancedChroma();
    if (!chroma) {
      this._resetDiagnostics();
      return;
    }

    // Enhanced activity detection with spectral clarity
    const totalEnergy = chroma.reduce((s, v) => s + v, 0);
    this._updateAdaptiveGate(totalEnergy);
    
    const failEnergy = !this.disableEnergyGate && (totalEnergy < this.dynamicGate);
    // Additional gate for noise-like spectra when RMS available
    const isNoisy = (this.getRms != null) && (this.spectralFlatness || 0) > 0.8;
    const failClarity = (this.minSpectralClarity > 0) && (this.spectralClarity < this.minSpectralClarity);
    if (failEnergy || failClarity || isNoisy) {
      this._handleSilence();
      this._resetDiagnostics();
      return;
    }

    // Multi-dimensional harmonic analysis
    const activeCount = chroma.filter(v => v > totalEnergy * this.harmonicThreshold).length;
    this.activeBins = activeCount;
    
    if (activeCount < 2) {
      this._handleSingleNote();
      this.currentConfidence = 0;
      return;
    }

    // Enhanced bass analysis with harmonic context
    const enhancedChroma = this._applyIntelligentBassBias(chroma);
    
    // Multi-frame chord detection with consensus
    const detection = this._findBestChordWithConsensus(enhancedChroma);
    if (!detection) {
      this.currentConfidence = 0;
      this._handleLowConfidence();
      return;
    }
    
    this.currentConfidence = detection.confidence;
    this.harmonicStrength = detection.harmonicStrength || 0;
    
    // Adaptive confidence thresholding
    this._updateAdaptiveThreshold(detection);
    
    const enterOK = detection.confidence >= this.adaptiveThreshold;
    const exitOK = detection.confidence >= (this.adaptiveThreshold * 0.8);
    
    const now = performance.now();
    const chordName = detection.inversion ? 
      `${this._pcToName(detection.root)}${detection.quality}/${this._pcToName(detection.bass)}` :
      `${this._pcToName(detection.root)}${detection.quality}`;

    if (chordName !== this.lastChord) {
      if (enterOK) {
        this.stableChordCount++;
        const requiredFrames = this._getAdaptiveStableFrames(detection);
        if (this.stableChordCount >= requiredFrames &&
            (now - this.lastChangeTime) > this.holdMsEnter) {
          this._setCurrentChord(chordName, detection.confidence, detection);
        }
      } else {
        this.stableChordCount = Math.max(0, this.stableChordCount - 1);
      }
    } else {
      if (exitOK) {
        this.stableChordCount = Math.min(this.stableChordCount + 1, this.requiredStableFrames);
      } else if ((now - this.lastChangeTime) > this.holdMsExit) {
        this._clearChord();
      }
    }
  }

  getDiagnostics() {
    return {
      noiseFloor: this.noiseFloor,
      activeBins: this.activeBins,
      confidence: this.currentConfidence,
      spectralClarity: this.spectralClarity,
      harmonicStrength: this.harmonicStrength,
      bassStrength: this.bassStrength,
      adaptiveThreshold: this.adaptiveThreshold,
      dynamicGate: this.dynamicGate,
      tuningCents: this.tuningCents
    };
  }

  _computeSpectralFeatures() {
    let sumMag = 0, sumFreqWeighted = 0, sumFreqSq = 0;
    const len = this.fftBins.length;
    const binHz = this.sampleRate / (2 * len);
    
    // For spectral flatness
    let gmLogSum = 0; // log for geometric mean
    let count = 0;

    for (let i = 1; i < len; i++) {
      const mag = Math.max(1e-8, Math.pow(10, this.fftBins[i] / 20));
      const freq = i * binHz;
      
      if (freq >= this.minFreq && freq <= this.maxFreq) {
        sumMag += mag;
        sumFreqWeighted += mag * freq;
        sumFreqSq += mag * freq * freq;
        gmLogSum += Math.log(mag);
        count++;
      }
    }
    
    if (sumMag > 0) {
      this.spectralCentroid = sumFreqWeighted / sumMag;
      this.spectralSpread = Math.sqrt(Math.max(0, sumFreqSq / sumMag - this.spectralCentroid * this.spectralCentroid));
      this.spectralClarity = Math.min(1, sumMag / (this.spectralSpread + 100));
    }

    if (count > 0) {
      const geoMean = Math.exp(gmLogSum / count);
      const arithMean = sumMag / count;
      this.spectralFlatness = Math.min(1, Math.max(0, geoMean / Math.max(1e-8, arithMean)));
    } else {
      this.spectralFlatness = 0;
    }
  }

  _computeEnhancedChroma() {
    this.pitchClassEnergy.fill(0);
    const len = this.fftBins.length;
    if (!this.chromaMap || this.chromaMapLen !== len) {
      this._rebuildChromaMap();
    }

    // Aggregate energy into pitch classes using precomputed weights
    for (let i = 1; i < len; i++) {
      const mag = Math.max(0, Math.pow(10, this.fftBins[i] / 20));
      if (mag <= 0) continue;
      const base = i * 12;
      // Manual unroll for 12 classes for speed
      this.pitchClassEnergy[0]  += mag * this.chromaMap[base + 0];
      this.pitchClassEnergy[1]  += mag * this.chromaMap[base + 1];
      this.pitchClassEnergy[2]  += mag * this.chromaMap[base + 2];
      this.pitchClassEnergy[3]  += mag * this.chromaMap[base + 3];
      this.pitchClassEnergy[4]  += mag * this.chromaMap[base + 4];
      this.pitchClassEnergy[5]  += mag * this.chromaMap[base + 5];
      this.pitchClassEnergy[6]  += mag * this.chromaMap[base + 6];
      this.pitchClassEnergy[7]  += mag * this.chromaMap[base + 7];
      this.pitchClassEnergy[8]  += mag * this.chromaMap[base + 8];
      this.pitchClassEnergy[9]  += mag * this.chromaMap[base + 9];
      this.pitchClassEnergy[10] += mag * this.chromaMap[base + 10];
      this.pitchClassEnergy[11] += mag * this.chromaMap[base + 11];
    }

    const maxVal = Math.max(...this.pitchClassEnergy);
    if (maxVal === 0) return null;

    const normed = new Float32Array(12);
    for (let i = 0; i < 12; i++) {
      normed[i] = Math.pow(this.pitchClassEnergy[i] / maxVal, 0.8);
    }

    for (let i = 0; i < 12; i++) {
      this.chromaEma[i] = (1 - this.chromaAlphaFast) * this.chromaEma[i] + this.chromaAlphaFast * normed[i];
      this.chromaEmaSlow[i] = (1 - this.chromaAlphaSlow) * this.chromaEmaSlow[i] + this.chromaAlphaSlow * normed[i];
    }

    const stability = this._measureSignalStability();
    const alpha = stability > 0.7 ? 0.3 : 0.7;
    const out = new Float32Array(12);
    for (let i = 0; i < 12; i++) {
      out[i] = alpha * this.chromaEma[i] + (1 - alpha) * this.chromaEmaSlow[i];
    }

    this.chromaHistory[this.historyIndex] = new Float32Array(out);
    this.historyIndex = (this.historyIndex + 1) % this.chromaHistory.length;
    return out;
  }

  _rebuildChromaMap() {
    const len = this.fftBins.length;
    const binHz = this.sampleRate / (2 * len);
    const sigma = this.chromaSigmaCents;
    const weights = new Float32Array(len * 12);
    for (let i = 0; i < len; i++) {
      const f = i * binHz;
      if (f < this.minFreq || f > this.maxFreq || f <= 0) {
        // leave zeros
        continue;
      }
      const midi = 69 + 12 * Math.log2(f / this.tuningHz);
      const pcFloat = ((midi % 12) + 12) % 12; // 0..12
      let norm = 0;
      for (let pc = 0; pc < 12; pc++) {
        // distance in semitones wrapped to [-6,6]
        let d = pcFloat - pc;
        if (d > 6) d -= 12;
        if (d < -6) d += 12;
        const cents = d * 100;
        const w = Math.exp(-(cents * cents) / (2 * sigma * sigma));
        weights[i * 12 + pc] = w;
        norm += w;
      }
      if (norm > 0) {
        for (let pc = 0; pc < 12; pc++) {
          weights[i * 12 + pc] /= norm;
          // Apply gentle frequency weighting
          weights[i * 12 + pc] *= this._getFrequencyWeight(f);
        }
      }
    }
    this.chromaMap = weights;
    this.chromaMapLen = len;
  }

  _estimateTuning() {
    // Estimate tuning deviation in cents using spectral peaks
    const len = this.fftBins.length;
    const binHz = this.sampleRate / (2 * len);
    const centsResiduals = [];
    for (let i = 2; i < len - 2; i++) {
      const f = i * binHz;
      if (f < 100 || f > 2000) continue;
      const mag = this.fftBins[i];
      // simple local peak check in dB
      if (mag > this.fftBins[i - 1] && mag > this.fftBins[i + 1] && mag > -50) {
        const midi = 69 + 12 * Math.log2(f / this.tuningHz);
        const nearest = Math.round(midi);
        const residual = (midi - nearest) * 100; // cents
        // keep in [-50, 50]
        const wrapped = residual > 50 ? residual - 100 : (residual < -50 ? residual + 100 : residual);
        centsResiduals.push(wrapped);
      }
    }
    if (centsResiduals.length < 5) return false;
    centsResiduals.sort((a, b) => a - b);
    const mid = Math.floor(centsResiduals.length / 2);
    const median = centsResiduals.length % 2 ? centsResiduals[mid] : (centsResiduals[mid - 1] + centsResiduals[mid]) / 2;
    const clamped = Math.max(-20, Math.min(20, median));
    if (Math.abs(clamped) < 1) return false; // ignore tiny drift
    const factor = Math.pow(2, clamped / 1200);
    // smooth update
    const newTuning = this.tuningHz * factor;
    this.tuningHz = this.tuningHz * 0.7 + newTuning * 0.3;
    this.tuningCents = this.tuningCents * 0.7 + clamped * 0.3;
    return true;
  }

  _getFrequencyWeight(freq) {
    // Enhanced frequency weighting curve
    if (freq <= 100) return 1.2; // Boost fundamental bass
    if (freq <= 200) return 1.1;
    if (freq <= 400) return 1.0; // Reference
    if (freq <= 800) return 0.95;
    if (freq <= 1600) return 0.9;
    return Math.exp(-(freq - 1600) / 1000) * 0.8; // Gentle rolloff
  }

  _measureSignalStability() {
    if (this.chromaHistory.filter(h => h).length < 3) return 0;
    
    let totalVariance = 0;
    for (let pc = 0; pc < 12; pc++) {
      const values = this.chromaHistory.filter(h => h).map(h => h[pc]);
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
      totalVariance += variance;
    }
    return Math.exp(-totalVariance * 10); // Convert variance to stability [0,1]
  }

  _updateAdaptiveGate(totalEnergy) {
    this.noiseFloor = (1 - this.noiseFloorAlpha) * this.noiseFloor + 
                      this.noiseFloorAlpha * totalEnergy;
    
    // Adaptive gate based on spectral clarity and noise floor
    const baseGate = Math.max(0.03, this.noiseFloor * 1.5);
    const clarityFactor = Math.max(0.5, this.spectralClarity);
    this.dynamicGate = baseGate / clarityFactor;
  }

  _applyIntelligentBassBias(chroma) {
    if (!this.enableBassBias) return chroma;
    
    // Enhanced bass analysis with harmonic context
    const bassChroma = this._analyzeBassRegion();
    if (!bassChroma) return chroma;
    
    // Update bass history with smoothing
    for (let i = 0; i < 12; i++) {
      this.bassHistory[i] = (1 - this.bassAlpha) * this.bassHistory[i] + 
                            this.bassAlpha * bassChroma[i];
    }
    
    const dominantBass = this.bassHistory.indexOf(Math.max(...this.bassHistory));
    this.bassStrength = this.bassHistory[dominantBass];
    
    if (this.bassStrength > 0.3) {
      const biasedChroma = new Float32Array(chroma);
      const biasFactor = this.bassBias * Math.min(1, this.bassStrength * 2);
      biasedChroma[dominantBass] += biasFactor * Math.max(...chroma);
      return biasedChroma;
    }
    
    return chroma;
  }

  _analyzeBassRegion() {
    const bassChroma = new Float32Array(12);
    const len = this.fftBins.length;
    const binHz = this.sampleRate / (2 * len);
    const maxBin = Math.min(len - 1, Math.floor(this.bassMaxFreq / binHz));
    
    for (let i = 1; i <= maxBin; i++) {
      const mag = Math.pow(10, this.fftBins[i] / 20);
      if (mag <= 0) continue;
      
      const f = i * binHz;
      const midi = 69 + 12 * Math.log2(f / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      
      // Weight by both magnitude and fundamentalness
      const fundamentalWeight = f <= 150 ? 1.2 : Math.exp(-(f - 150) / 100);
      bassChroma[pc] += mag * fundamentalWeight;
    }
    
    const maxBass = Math.max(...bassChroma);
    if (maxBass === 0) return null;
    
    // Normalize bass chroma
    for (let i = 0; i < 12; i++) {
      bassChroma[i] /= maxBass;
    }
    
    return bassChroma;
  }

  _findBestChordWithConsensus(chroma) {
    const currentBest = this._findBestChord(chroma);
    if (!currentBest) return null;
    
    // Add to detection history
    this.detectionHistory.push({
      chord: currentBest,
      timestamp: performance.now(),
      chroma: new Float32Array(chroma)
    });
    
    // Trim history
    if (this.detectionHistory.length > this.maxDetectionHistory) {
      this.detectionHistory.shift();
    }
    
    // Compute consensus if we have enough history
    if (this.detectionHistory.length >= 3) {
      const consensus = this._computeDetectionConsensus();
      if (consensus && consensus.confidence > currentBest.confidence * 0.9) {
        return { ...consensus, consensusBoosted: true };
      }
    }
    
    return currentBest;
  }

  _computeDetectionConsensus() {
    const recentDetections = this.detectionHistory.slice(-5);
    const chordCounts = new Map();
    
    // Count chord occurrences with temporal weighting
    recentDetections.forEach((det, index) => {
      const age = recentDetections.length - index;
      const weight = Math.pow(0.8, age - 1); // Recent detections weighted more
      const chordKey = `${det.chord.root}-${det.chord.quality}`;
      
      if (!chordCounts.has(chordKey)) {
        chordCounts.set(chordKey, { count: 0, totalConf: 0, detection: det.chord });
      }
      
      const entry = chordCounts.get(chordKey);
      entry.count += weight;
      entry.totalConf += det.chord.confidence * weight;
    });
    
    // Find most consistent detection
    let bestEntry = null;
    let bestScore = 0;
    
    for (const [, entry] of chordCounts.entries()) {
      const avgConf = entry.totalConf / entry.count;
      const consistencyScore = entry.count * avgConf;
      
      if (consistencyScore > bestScore && entry.count >= 1.5) {
        bestScore = consistencyScore;
        bestEntry = entry;
      }
    }
    
    if (bestEntry) {
      return {
        ...bestEntry.detection,
        confidence: Math.min(1, bestEntry.totalConf / bestEntry.count * 1.1)
      };
    }
    
    return null;
  }

  _findBestChord(chroma) {
    let best = null;
    let bestScore = -Infinity;

    // Enhanced template matching with multiple techniques
    for (let root = 0; root < 12; root++) {
      for (const template of this.templates) {
        const rotated = this._rotate(template.vec, root);
        
        // Multiple scoring methods
        const dotScore = this._dot(chroma, rotated);
        const cosineScore = this._cosineScore(chroma, rotated);
        const harmonicScore = this._harmonicScore(chroma, rotated, root);
        
        // Weighted combination
        const combinedScore = dotScore * 0.4 + cosineScore * 0.4 + harmonicScore * 0.2;
        
        if (combinedScore > bestScore) {
          bestScore = combinedScore;
          const confidence = this._enhancedConfidence(chroma, rotated, root, template);
          const harmonicStrength = this._measureHarmonicStrength(chroma, rotated);
          
          best = {
            root,
            quality: template.suffix,
            confidence,
            score: combinedScore,
            harmonicStrength,
            template: template
          };
        }
      }
    }

    if (!best) return null;

    // Enhanced extension detection
    if (this.enableAdvancedQualities) {
      best = this._detectAdvancedExtensions(chroma, best);
    }
    
    // Inversion detection
    if (this.inversionDetection && best.quality !== '5') {
      const inversion = this._detectInversion(chroma, best);
      if (inversion) {
        best.inversion = true;
        best.bass = inversion.bass;
        best.confidence *= 0.95; // Slight confidence penalty for inversions
      }
    }
    
    return best;
  }

  _cosineScore(chroma, template) {
    return this._dot(this._norm(chroma), this._norm(template));
  }

  _harmonicScore(chroma, template, root) {
    // Score based on harmonic series alignment
    let score = 0;
    const harmonics = [0, 7, 4, 10, 2]; // Root, 5th, 3rd, 7th, 9th (in semitones)
    
    for (let i = 0; i < harmonics.length; i++) {
      const harmonic = (root + harmonics[i]) % 12;
      const expectedEnergy = template[harmonic];
      const actualEnergy = chroma[harmonic];
      
      if (expectedEnergy > 0.1) {
        const weight = this.harmonicWeights[i] || 0.1;
        score += weight * Math.min(actualEnergy / expectedEnergy, expectedEnergy / actualEnergy);
      }
    }
    
    return score / harmonics.length;
  }

  _enhancedConfidence(chroma, template, root, templateObj) {
    const baseConf = this._dot(this._norm(chroma), this._norm(template));
    
    // Penalty for energy in non-chord tones
    let penalty = 0;
    for (let i = 0; i < 12; i++) {
      if (template[i] < 0.1 && chroma[i] > 0.15) {
        penalty += chroma[i] * 0.3;
      }
    }
    
    // Bonus for strong chord tones
    let bonus = 0;
    const chordTones = templateObj.chordTones || [0, 2, 4]; // Default: root, 3rd, 5th positions in template
    for (const tone of chordTones) {
      const pc = (root + tone) % 12;
      if (chroma[pc] > 0.2) {
        bonus += chroma[pc] * 0.1;
      }
    }
    
    // Spectral clarity bonus
    const clarityBonus = this.spectralClarity * 0.05;
    
    return Math.max(0, Math.min(1, baseConf - penalty + bonus + clarityBonus));
  }

  _measureHarmonicStrength(chroma, template) {
    let harmonicEnergy = 0;
    let totalEnergy = 0;
    
    for (let i = 0; i < 12; i++) {
      totalEnergy += chroma[i];
      if (template[i] > 0.1) {
        harmonicEnergy += chroma[i];
      }
    }
    
    return totalEnergy > 0 ? harmonicEnergy / totalEnergy : 0;
  }

  _detectAdvancedExtensions(chroma, detection) {
    const { root, quality } = detection;
    
    // Enhanced extension detection for various chord types
    const extensions = this._analyzeExtensions(chroma, root, quality);
    
    if (extensions.maj7 > extensions.dom7 && extensions.maj7 > 0.4) {
      let newQuality = quality.startsWith('m') ? 'mMaj7' : 'Maj7';

      if (extensions.ninth > 0.35) {
        newQuality = quality.startsWith('m') ? 'mMaj9' : 'Maj9';
        if (extensions.eleventh > 0.3) {
          newQuality = quality.startsWith('m') ? 'mMaj11' : 'Maj11';
        }
      }

      if (extensions.thirteenth > 0.35) {
        newQuality = quality.startsWith('m') ? 'mMaj13' : 'Maj13';
      }

      return { ...detection, quality: newQuality };
    }

    if (extensions.dom7 > 0.4) {
      let newQuality = quality.startsWith('m') ? 'm7' : '7';

      if (extensions.ninth > 0.35) {
        newQuality = quality.startsWith('m') ? 'm9' : '9';
        if (extensions.eleventh > 0.3) {
          newQuality = quality.startsWith('m') ? 'm11' : '11';
        }
      }

      if (extensions.thirteenth > 0.35) {
        newQuality = quality.startsWith('m') ? 'm13' : '13';
      }

      return { ...detection, quality: newQuality };
    }
    
    if (extensions.sixth > 0.4) {
      if (extensions.ninth > 0.35) {
        return { ...detection, quality: quality.startsWith('m') ? 'm6/9' : '6/9' };
      }
      return { ...detection, quality: quality.startsWith('m') ? 'm6' : '6' };
    }
    
    if (extensions.ninth > 0.4) {
      return { ...detection, quality: quality.startsWith('m') ? 'madd9' : 'add9' };
    }
    
    return detection;
  }

  _analyzeExtensions(chroma, root, quality) {
    const isMinor = quality.startsWith('m');
    const third = (root + (isMinor ? 3 : 4)) % 12;
    const fifth = (root + 7) % 12;
    const triadPeak = Math.max(chroma[root], chroma[third], chroma[fifth]);
    
    return {
      dom7: chroma[(root + 10) % 12] / (triadPeak + 0.1),
      maj7: chroma[(root + 11) % 12] / (triadPeak + 0.1),
      sixth: chroma[(root + 9) % 12] / (triadPeak + 0.1),
      ninth: chroma[(root + 2) % 12] / (triadPeak + 0.1),
      eleventh: chroma[(root + 5) % 12] / (triadPeak + 0.1),
      thirteenth: chroma[(root + 9) % 12] / (triadPeak + 0.1)
    };
  }

  _detectInversion(chroma, detection) {
    if (!this.bassHistory) return null;
    
    const chordTones = this._getChordTones(detection.root, detection.quality);
    const strongestBass = this.bassHistory.indexOf(Math.max(...this.bassHistory));
    
    // Check if bass note is a chord tone but not the root
    if (chordTones.includes(strongestBass) && strongestBass !== detection.root) {
      if (this.bassHistory[strongestBass] > this.bassHistory[detection.root] * 1.3) {
        return { bass: strongestBass };
      }
    }
    
    return null;
  }

  _getChordTones(root, quality) {
    const tones = [root];
    
    if (quality.includes('m') && !quality.includes('maj')) {
      tones.push((root + 3) % 12); // Minor third
    } else {
      tones.push((root + 4) % 12); // Major third
    }
    
    if (!quality.includes('dim')) {
      tones.push((root + 7) % 12); // Perfect fifth
    } else {
      tones.push((root + 6) % 12); // Diminished fifth
    }
    
    const hasExtended = ['7','9','11','13'].some(ext => quality.includes(ext));

    if (hasExtended && !quality.includes('Maj')) {
      tones.push((root + 10) % 12); // Minor seventh
    }

    if (hasExtended && quality.includes('Maj')) {
      tones.push((root + 11) % 12); // Major seventh
    }

    if (quality.includes('6') || quality.includes('13')) {
      tones.push((root + 9) % 12); // Sixth / Thirteenth
    }
    
    return tones;
  }

  _updateAdaptiveThreshold(detection) {
    // Adjust threshold based on signal characteristics
    const baseThreshold = this.confEnter;
    let adjustment = 0;
    
    // Higher threshold for complex signals
    if (this.activeBins > 6) adjustment += 0.05;
    
    // Lower threshold for clear, harmonic signals
    if (this.spectralClarity > 0.8 && detection.harmonicStrength > 0.7) {
      adjustment -= 0.08;
    }
    
    // Adapt based on recent confidence history
    if (this.chordConfidenceHistory.length > 5) {
      const avgConf = this.chordConfidenceHistory.reduce((s, c) => s + c, 0) / this.chordConfidenceHistory.length;
      if (avgConf > 0.6) adjustment -= 0.03;
    }
    
    this.adaptiveThreshold = Math.max(0.25, Math.min(0.65, baseThreshold + adjustment));
  }

  _getAdaptiveStableFrames(detection) {
    // Require fewer stable frames for very confident detections
    if (detection.confidence > 0.8 && detection.harmonicStrength > 0.7) {
      return Math.max(1, this.requiredStableFrames - 2);
    }
    
    if (detection.confidence > 0.65) {
      return Math.max(2, this.requiredStableFrames - 1);
    }
    
    return this.requiredStableFrames;
  }

  _handleSilence() {
    const now = performance.now();
    if (this.lastChord && (now - this.lastChangeTime) > this.holdMsExit * 1.5) {
      this._clearChord();
    }
  }

  _handleSingleNote() {
    this.stableChordCount = Math.max(0, this.stableChordCount - 2);
  }

  _handleLowConfidence() {
    this.stableChordCount = Math.max(0, this.stableChordCount - 1);
    const now = performance.now();
    if ((now - this.lastChangeTime) > this.holdMsExit) {
      this._clearChord();
    }
  }

  _setCurrentChord(name, confidence, detection) {
    this.lastChord = name;
    this.lastChangeTime = performance.now();
    this.stableChordCount = this.requiredStableFrames;
    
    // Update confidence history
    this.chordConfidenceHistory.push(confidence);
    if (this.chordConfidenceHistory.length > 10) {
      this.chordConfidenceHistory.shift();
    }
    
    this.onChord({ 
      name, 
      confidence, 
      quality: detection.quality,
      root: this._pcToName(detection.root),
      bass: detection.bass ? this._pcToName(detection.bass) : null,
      inversion: detection.inversion || false,
      harmonicStrength: detection.harmonicStrength,
      spectralClarity: this.spectralClarity
    });
  }

  _clearChord() {
    if (this.lastChord !== null) {
      this.lastChord = null;
      this.lastChangeTime = performance.now();
      this.chordConfidenceHistory = [];
      this.stableChordCount = 0;
      this.onChord({ name: null, confidence: 0 });
    }
  }

  _resetDiagnostics() {
    this.activeBins = 0;
    this.currentConfidence = 0;
    this.spectralClarity = 0;
    this.harmonicStrength = 0;
  }

  // Utility methods
  _pcToName(pc) {
    return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((pc % 12)+12)%12];
  }

  _rotate(arr, n) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = arr[(i - n + arr.length) % arr.length];
    }
    return out;
  }

  _dot(a, b) {
    let s = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      s += a[i] * b[i];
    }
    return s;
  }

  _norm(arr) {
    let sum = 0;
    for (let i = 0; i < arr.length; i++) {
      sum += arr[i] * arr[i];
    }
    if (sum === 0) return new Float32Array(arr.length);
    
    const mag = Math.sqrt(sum);
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      out[i] = arr[i] / mag;
    }
    return out;
  }

  _buildEnhancedTemplates() {
    const N = (v) => this._norm(new Float32Array(v));

    // Enhanced templates with better voicing and chord tone definitions
    const templates = [
      // Basic triads with improved voicings
      { 
        vec: N([1.0, 0, 0, 0, 0.85, 0, 0, 0.95, 0, 0, 0, 0]), 
        suffix: '', 
        chordTones: [0, 4, 7],
        category: 'major'
      },
      { 
        vec: N([1.0, 0, 0, 0.85, 0, 0, 0, 0.95, 0, 0, 0, 0]), 
        suffix: 'm', 
        chordTones: [0, 3, 7],
        category: 'minor'
      },
      { 
        vec: N([1.0, 0, 0, 0.85, 0, 0, 0.75, 0, 0, 0, 0, 0]), 
        suffix: 'dim', 
        chordTones: [0, 3, 6],
        category: 'diminished'
      },
      { 
        vec: N([1.0, 0, 0, 0, 0.85, 0, 0, 0, 0.8, 0, 0, 0]), 
        suffix: 'aug', 
        chordTones: [0, 4, 8],
        category: 'augmented'
      },

      // Suspended chords with better definition
      { 
        vec: N([1.0, 0, 0.9, 0, 0, 0, 0, 0.95, 0, 0, 0, 0]), 
        suffix: 'sus2', 
        chordTones: [0, 2, 7],
        category: 'suspended'
      },
      { 
        vec: N([1.0, 0, 0, 0, 0, 0.9, 0, 0.95, 0, 0, 0, 0]), 
        suffix: 'sus4', 
        chordTones: [0, 5, 7],
        category: 'suspended'
      },

      // Power chord (fifth)
      { 
        vec: N([1.0, 0, 0, 0, 0, 0, 0, 0.95, 0, 0, 0, 0]), 
        suffix: '5', 
        chordTones: [0, 7],
        category: 'power'
      },

      // Sixth chords
      { 
        vec: N([1.0, 0, 0, 0, 0.85, 0, 0, 0.95, 0, 0.75, 0, 0]), 
        suffix: '6', 
        chordTones: [0, 4, 7, 9],
        category: 'sixth'
      },
      { 
        vec: N([1.0, 0, 0, 0.85, 0, 0, 0, 0.95, 0, 0.75, 0, 0]), 
        suffix: 'm6', 
        chordTones: [0, 3, 7, 9],
        category: 'minor_sixth'
      },

      // Seventh chord foundations (extensions will be detected separately)
      { 
        vec: N([1.0, 0, 0, 0, 0.85, 0, 0, 0.95, 0, 0, 0.7, 0]), 
        suffix: 'Maj7', 
        chordTones: [0, 4, 7, 11],
        category: 'major_seventh'
      },
      { 
        vec: N([1.0, 0, 0, 0.85, 0, 0, 0, 0.95, 0, 0, 0.7, 0]), 
        suffix: 'mMaj7', 
        chordTones: [0, 3, 7, 11],
        category: 'minor_major_seventh'
      },
      { 
        vec: N([1.0, 0, 0, 0, 0.85, 0, 0, 0.95, 0, 0, 0.75, 0]), 
        suffix: '7', 
        chordTones: [0, 4, 7, 10],
        category: 'dominant_seventh'
      },
      { 
        vec: N([1.0, 0, 0, 0.85, 0, 0, 0, 0.95, 0, 0, 0.75, 0]), 
        suffix: 'm7', 
        chordTones: [0, 3, 7, 10],
        category: 'minor_seventh'
      },

      // Half-diminished and fully diminished
      { 
        vec: N([1.0, 0, 0, 0.85, 0, 0, 0.75, 0, 0, 0, 0.7, 0]), 
        suffix: 'm7♭5', 
        chordTones: [0, 3, 6, 10],
        category: 'half_diminished'
      },
      { 
        vec: N([1.0, 0, 0, 0.85, 0, 0, 0.75, 0, 0, 0.75, 0, 0]), 
        suffix: 'dim7', 
        chordTones: [0, 3, 6, 9],
        category: 'fully_diminished'
      },

      // Extended suspended chords
      { 
        vec: N([1.0, 0, 0.7, 0, 0, 0.9, 0, 0.95, 0, 0, 0.75, 0]), 
        suffix: '7sus2', 
        chordTones: [0, 2, 7, 10],
        category: 'suspended_seventh'
      },
      { 
        vec: N([1.0, 0, 0, 0, 0, 0.9, 0, 0.95, 0, 0, 0.75, 0]), 
        suffix: '7sus4', 
        chordTones: [0, 5, 7, 10],
        category: 'suspended_seventh'
      },

      // Add9 and 6/9 foundations
      { 
        vec: N([1.0, 0, 0.8, 0, 0.85, 0, 0, 0.95, 0, 0.75, 0, 0]), 
        suffix: '6/9', 
        chordTones: [0, 2, 4, 7, 9],
        category: 'sixth_ninth'
      },
      { 
        vec: N([1.0, 0, 0.8, 0.85, 0, 0, 0, 0.95, 0, 0.75, 0, 0]), 
        suffix: 'm6/9', 
        chordTones: [0, 2, 3, 7, 9],
        category: 'minor_sixth_ninth'
      }
    ];

    return templates;
  }
}
