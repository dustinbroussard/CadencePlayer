// src/js/chord-detector.js
export class ChordDetector {
  constructor(analyser, opts = {}) {
    this.analyser = analyser; // dedicated chord analyser
    this.sampleRate = opts.sampleRate || 44100;
    this.fftSize = analyser.fftSize || 16384;

    this.fftBins = new Float32Array(this.fftSize / 2);
    this.pitchClassEnergy = new Float32Array(12);

    this.minFreq = opts.minFreq || 50;    // ignore sub-bass rumble
    this.maxFreq = opts.maxFreq || 5000;  // chords are clearest below ~5kHz
    this.holdMs  = opts.holdMs  || 120;   // display hold to reduce flicker
    this.minConfidence = opts.minConfidence || 0.22;
    this.extRatio = opts.extRatio || 0.3; // relative energy for extensions

    // Create major/minor templates (Krumhansl-ish, normalized)
    // Root=1.0, major third & fifth emphasized; likewise for minor.
    this.majorTemplate = this._norm([1,0,0,0,1,0,0,1,0,0,0,0]); // R, 3, 5
    this.minorTemplate = this._norm([1,0,0,1,0,0,0,1,0,0,0,0]); // R, b3, 5

    this.lastChord = null;
    this.lastChangeTime = 0;
    this.onChord = () => {}; // hook set by UI
  }

  setOnChord(callback) {
    this.onChord = callback;
  }

  start() {
    const tick = () => { this.update(); requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  update() {
    if (!this.analyser) return;
    this.analyser.getFloatFrequencyData(this.fftBins);
    const chroma = this._computeChroma();
    if (!chroma) return;

    // Find best (root, quality) by rotating templates
    let bestScore = -Infinity, bestRoot = 0, bestQual = 'maj';
    for (let root = 0; root < 12; root++) {
      const majScore = this._dot(chroma, this._rotate(this.majorTemplate, root));
      const minScore = this._dot(chroma, this._rotate(this.minorTemplate, root));
      const score = Math.max(majScore, minScore);
      const qual  = majScore >= minScore ? 'maj' : 'min';
      if (score > bestScore) {
        bestScore = score; bestRoot = root; bestQual = qual;
      }
    }

    // Confidence: cosine similarity (chroma normalized already)
    const normChroma = this._norm(chroma);
    const bestTemplate = this._rotate(bestQual === 'maj' ? this.majorTemplate : this.minorTemplate, bestRoot);
    const confidence = this._dot(normChroma, bestTemplate);

    // Determine extensions (7ths, 9ths)
    const triadMax = Math.max(
      chroma[bestRoot],
      chroma[(bestRoot + (bestQual === 'maj' ? 4 : 3)) % 12],
      chroma[(bestRoot + 7) % 12]
    );
    const extThresh = triadMax * this.extRatio;
    const hasDom7 = chroma[(bestRoot + 10) % 12] >= extThresh;
    const hasMaj7 = chroma[(bestRoot + 11) % 12] >= extThresh;
    const has9 = chroma[(bestRoot + 2) % 12] >= extThresh;

    let quality = bestQual;
    if (bestQual === 'maj') {
      if (hasDom7) quality = has9 ? '9' : '7';
      else if (hasMaj7) quality = has9 ? 'maj9' : 'maj7';
      else if (has9) quality = 'add9';
    } else {
      if (hasDom7) quality = has9 ? 'min9' : 'min7';
      else if (hasMaj7) quality = has9 ? 'minMaj9' : 'minMaj7';
      else if (has9) quality = 'madd9';
    }

    const chordName = `${this._pcToName(bestRoot)} ${quality}`;
    const now = performance.now();

    if (!this.lastChord || (chordName !== this.lastChord && (now - this.lastChangeTime) > this.holdMs)) {
      if (confidence >= this.minConfidence) {
        this.lastChord = chordName;
        this.lastChangeTime = now;
        this.onChord({ name: chordName, confidence });
      }
    }
  }

  _computeChroma() {
    this.pitchClassEnergy.fill(0);
    const binHz = this.sampleRate / (2 * this.fftBins.length); // Hz per bin
    for (let i = 0; i < this.fftBins.length; i++) {
      const mag = Math.pow(10, this.fftBins[i] / 20); // dB -> linear
      if (mag <= 0) continue;
      const freq = i * binHz;
      if (freq < this.minFreq || freq > this.maxFreq) continue;

      // freq -> MIDI -> pitch class
      const midi = 69 + 12 * Math.log2(freq / 440);
      const pc = ((Math.round(midi) % 12) + 12) % 12;
      this.pitchClassEnergy[pc] += mag;
    }
    // normalize chroma
    return this._norm(this.pitchClassEnergy);
  }

  _pcToName(pc) {
    // Prefer flats for black keys to feel more guitar-friendly
    const names = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
    return names[pc];
  }

  _rotate(arr, n) {
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[(i - n + arr.length) % arr.length];
    return out;
  }

  _dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  _norm(a) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
    if (sum === 0) return new Float32Array(a.length);
    const inv = 1 / Math.sqrt(sum);
    const out = new Float32Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] * inv;
    return out;
  }
}

