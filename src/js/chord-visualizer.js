// Enhanced chord visualizer with multiple display modes
export class ChordVisualizer {
  constructor(container, opts = {}) {
    this.container = typeof container === 'string' ? 
      document.getElementById(container) : container;
    
    this.opts = {
      showCircleOfFifths: opts.showCircleOfFifths ?? true,
      showPianoRoll: opts.showPianoRoll ?? true,
      showSpectralAnalysis: opts.showSpectralAnalysis ?? true,
      showChordProgression: opts.showChordProgression ?? true,
      animationDuration: opts.animationDuration ?? 800,
      colorScheme: opts.colorScheme ?? 'enhanced',
      ...opts
    };
    
    this.currentChord = null;
    this.chordHistory = [];
    this.maxHistory = 20;
    this.chromaData = new Float32Array(12);
    this.isAnimating = false;
    
    this.initializeHTML();
    this.setupEventListeners();
    this.setupAnimationLoop();
  }

  initializeHTML() {
    this.container.innerHTML = `
      <div class="chord-visualizer">
        <div class="chord-display-main">
          <div class="chord-name-display">
            <div class="chord-name" id="chord-name">—</div>
            <div class="chord-details">
              <span class="confidence" id="confidence">0%</span>
              <span class="quality-badge" id="quality-badge"></span>
            </div>
          </div>
          
          <div class="visualization-modes">
            ${this.opts.showCircleOfFifths ? `
              <div class="viz-mode circle-of-fifths" id="circle-fifths">
                <svg viewBox="0 0 400 400" class="circle-svg">
                  <defs>
                    <radialGradient id="chord-glow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stop-color="currentColor" stop-opacity="0.8"/>
                      <stop offset="70%" stop-color="currentColor" stop-opacity="0.3"/>
                      <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
                    </radialGradient>
                    <filter id="glow">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                      <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                      </feMerge>
                    </filter>
                  </defs>
                  ${this.generateCircleOfFifths()}
                </svg>
              </div>
            ` : ''}
            
            ${this.opts.showPianoRoll ? `
              <div class="viz-mode piano-roll" id="piano-roll">
                <div class="piano-keys">
                  ${this.generatePianoKeys()}
                </div>
                <div class="chroma-bars">
                  ${this.generateChromaBars()}
                </div>
              </div>
            ` : ''}
            
            ${this.opts.showSpectralAnalysis ? `
              <div class="viz-mode spectral-display" id="spectral-display">
                <canvas class="spectral-canvas" id="spectral-canvas" width="300" height="120"></canvas>
                <div class="spectral-info">
                  <div class="spectral-metric">
                    <label>Clarity:</label>
                    <div class="metric-bar">
                      <div class="metric-fill" id="clarity-fill"></div>
                    </div>
                  </div>
                  <div class="spectral-metric">
                    <label>Harmonic:</label>
                    <div class="metric-bar">
                      <div class="metric-fill" id="harmonic-fill"></div>
                    </div>
                  </div>
                </div>
              </div>
            ` : ''}
          </div>
        </div>
        
        ${this.opts.showChordProgression ? `
          <div class="chord-progression-display">
            <div class="progression-header">Recent Progression</div>
            <div class="progression-chords" id="progression-chords"></div>
            <div class="progression-analysis" id="progression-analysis">
              <span class="key-signature" id="key-signature">Key: —</span>
              <span class="progression-pattern" id="progression-pattern"></span>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    this.initializeReferences();
    this.applyStyles();
  }

  initializeReferences() {
    this.elements = {
      chordName: this.container.querySelector('#chord-name'),
      confidence: this.container.querySelector('#confidence'),
      qualityBadge: this.container.querySelector('#quality-badge'),
      circleOfFifths: this.container.querySelector('#circle-fifths'),
      pianoRoll: this.container.querySelector('#piano-roll'),
      spectralCanvas: this.container.querySelector('#spectral-canvas'),
      progressionChords: this.container.querySelector('#progression-chords'),
      keySignature: this.container.querySelector('#key-signature'),
      progressionPattern: this.container.querySelector('#progression-pattern'),
      clarityFill: this.container.querySelector('#clarity-fill'),
      harmonicFill: this.container.querySelector('#harmonic-fill')
    };
    
    // Get individual elements for piano and chroma
    this.pianoKeys = this.container.querySelectorAll('.piano-key');
    this.chromaBars = this.container.querySelectorAll('.chroma-bar');
    this.circleNotes = this.container.querySelectorAll('.circle-note');
  }

  generateCircleOfFifths() {
    const notes = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
    const radius = 160;
    const centerX = 200;
    const centerY = 200;
    
    return notes.map((note, i) => {
      const angle = (i * 30 - 90) * Math.PI / 180;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      const noteIndex = this.noteToIndex(note);
      
      return `
        <g class="circle-note" data-note="${noteIndex}">
          <circle cx="${x}" cy="${y}" r="24" 
                  class="note-circle" 
                  fill="var(--note-inactive)" 
                  stroke="var(--note-border)" 
                  stroke-width="2"/>
          <text x="${x}" y="${y + 5}" 
                text-anchor="middle" 
                class="note-text"
                fill="var(--note-text)">${note}</text>
        </g>
      `;
    }).join('');
  }

  generatePianoKeys() {
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const blackKeys = [1, 3, 6, 8, 10];
    
    return noteNames.map((note, i) => {
      const isBlack = blackKeys.includes(i);
      return `
        <div class="piano-key ${isBlack ? 'black-key' : 'white-key'}" 
             data-note="${i}" 
             data-note-name="${note}">
          <span class="key-label">${note}</span>
        </div>
      `;
    }).join('');
  }

  generateChromaBars() {
    return Array.from({length: 12}, (_, i) => `
      <div class="chroma-bar" data-note="${i}">
        <div class="chroma-fill"></div>
        <div class="chroma-label">${['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][i]}</div>
      </div>
    `).join('');
  }

  updateChordDisplay(chordData) {
    if (!chordData || !chordData.name) {
      this.clearDisplay();
      return;
    }
    
    this.currentChord = chordData;
    this.addToHistory(chordData);
    
    // Update main display
    this.elements.chordName.textContent = chordData.name;
    this.elements.confidence.textContent = `${Math.round(chordData.confidence * 100)}%`;
    
    // Update quality badge
    if (this.elements.qualityBadge) {
      this.elements.qualityBadge.textContent = this.getQualityDescription(chordData.quality);
      this.elements.qualityBadge.className = `quality-badge ${this.getQualityClass(chordData.quality)}`;
    }
    
    // Update visualizations with animation
    this.animateChordChange(chordData);
    
    // Update progression display
    if (this.opts.showChordProgression) {
      this.updateProgressionDisplay();
    }
  }

  updateChromaData(chromaArray) {
    if (!chromaArray) return;
    this.chromaData = new Float32Array(chromaArray);
    
    // Update chroma visualization
    if (this.opts.showPianoRoll) {
      this.updateChromaVisualization();
    }
    
    // Update spectral display
    if (this.opts.showSpectralAnalysis) {
      this.updateSpectralVisualization();
    }
  }

  updateDiagnostics(diagnostics) {
    if (!diagnostics) return;
    
    if (this.elements.clarityFill) {
      const clarity = Math.max(0, Math.min(1, diagnostics.spectralClarity || 0));
      this.elements.clarityFill.style.width = `${clarity * 100}%`;
      this.elements.clarityFill.style.backgroundColor = this.getMetricColor(clarity);
    }
    
    if (this.elements.harmonicFill) {
      const harmonic = Math.max(0, Math.min(1, diagnostics.harmonicStrength || 0));
      this.elements.harmonicFill.style.width = `${harmonic * 100}%`;
      this.elements.harmonicFill.style.backgroundColor = this.getMetricColor(harmonic);
    }
  }

  animateChordChange(chordData) {
    if (this.isAnimating) return;
    this.isAnimating = true;
    
    // Get chord tones
    const chordTones = this.getChordTones(chordData.root, chordData.quality);
    const bassNote = chordData.bass !== undefined ? 
      this.noteToIndex(chordData.bass) : this.noteToIndex(chordData.root);
    
    // Animate circle of fifths
    if (this.opts.showCircleOfFifths && this.circleNotes) {
      this.animateCircleOfFifths(chordTones, bassNote, chordData.confidence);
    }
    
    // Animate piano roll
    if (this.opts.showPianoRoll && this.pianoKeys) {
      this.animatePianoKeys(chordTones, bassNote, chordData.confidence);
    }
    
    setTimeout(() => {
      this.isAnimating = false;
    }, this.opts.animationDuration);
  }

  animateCircleOfFifths(chordTones, bassNote, confidence) {
    this.circleNotes.forEach((noteEl, i) => {
      const noteIndex = parseInt(noteEl.dataset.note);
      const circle = noteEl.querySelector('.note-circle');
      const isChordTone = chordTones.includes(noteIndex);
      const isBass = noteIndex === bassNote;
      
      // Reset previous animations
      circle.style.transition = `all ${this.opts.animationDuration}ms ease-out`;
      
      if (isChordTone) {
        const color = this.getNoteColor(noteIndex, confidence);
        circle.style.fill = color;
        circle.style.stroke = this.lightenColor(color, 0.3);
        circle.style.strokeWidth = isBass ? '4px' : '3px';
        circle.style.filter = 'url(#glow)';
        circle.style.transform = `scale(${isBass ? 1.3 : 1.1})`;
      } else {
        circle.style.fill = 'var(--note-inactive)';
        circle.style.stroke = 'var(--note-border)';
        circle.style.strokeWidth = '2px';
        circle.style.filter = 'none';
        circle.style.transform = 'scale(1)';
      }
    });
  }

  animatePianoKeys(chordTones, bassNote, confidence) {
    this.pianoKeys.forEach((keyEl, i) => {
      const noteIndex = parseInt(keyEl.dataset.note);
      const isChordTone = chordTones.includes(noteIndex);
      const isBass = noteIndex === bassNote;
      
      keyEl.style.transition = `all ${this.opts.animationDuration}ms ease-out`;
      
      if (isChordTone) {
        const color = this.getNoteColor(noteIndex, confidence);
        keyEl.style.backgroundColor = color;
        keyEl.style.borderColor = this.lightenColor(color, 0.3);
        keyEl.style.boxShadow = isBass ? 
          `0 0 20px ${color}, 0 0 40px ${color}40` : 
          `0 0 10px ${color}80`;
        keyEl.style.transform = isBass ? 'translateY(-6px)' : 'translateY(-3px)';
      } else {
        keyEl.style.backgroundColor = '';
        keyEl.style.borderColor = '';
        keyEl.style.boxShadow = '';
        keyEl.style.transform = '';
      }
    });
  }

  updateChromaVisualization() {
    if (!this.chromaBars) return;
    
    const maxValue = Math.max(...this.chromaData);
    if (maxValue === 0) return;
    
    this.chromaBars.forEach((bar, i) => {
      const fill = bar.querySelector('.chroma-fill');
      const intensity = this.chromaData[i] / maxValue;
      const height = Math.max(2, intensity * 100);
      
      fill.style.height = `${height}%`;
      fill.style.backgroundColor = this.getChromaColor(intensity);
      fill.style.transition = 'all 200ms ease-out';
    });
  }

  updateSpectralVisualization() {
    if (!this.elements.spectralCanvas) return;
    
    const canvas = this.elements.spectralCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    
    // Draw chroma spectrum as bars
    const barWidth = width / 12;
    const maxValue = Math.max(...this.chromaData);
    
    if (maxValue > 0) {
      this.chromaData.forEach((value, i) => {
        const barHeight = (value / maxValue) * height * 0.8;
        const x = i * barWidth;
        const y = height - barHeight;
        
        // Gradient fill for each bar
        const gradient = ctx.createLinearGradient(0, y, 0, height);
        const color = this.getChromaColor(value / maxValue);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, color + '40');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
        
        // Note labels
        ctx.fillStyle = '#ffffff80';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        const noteName = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][i];
        ctx.fillText(noteName, x + barWidth/2, height - 5);
      });
    }
  }

  updateProgressionDisplay() {
    if (!this.elements.progressionChords) return;
    
    // Display recent chord progression
    const recentChords = this.chordHistory.slice(-8);
    this.elements.progressionChords.innerHTML = recentChords.map((chord, i) => {
      const isRecent = i >= recentChords.length - 3;
      return `
        <div class="progression-chord ${isRecent ? 'recent' : ''}">
          <div class="chord-symbol">${chord.name}</div>
          <div class="chord-confidence">${Math.round(chord.confidence * 100)}%</div>
        </div>
      `;
    }).join('');
    
    // Analyze key and progression patterns
    this.analyzeProgression(recentChords);
  }

  analyzeProgression(chords) {
    if (chords.length < 3) return;
    
    // Simple key analysis based on chord frequency
    const rootCounts = {};
    chords.forEach(chord => {
      const root = chord.root || this.noteToIndex(chord.name.charAt(0));
      rootCounts[root] = (rootCounts[root] || 0) + 1;
    });
    
    const likelyKey = Object.keys(rootCounts).reduce((a, b) => 
      rootCounts[a] > rootCounts[b] ? a : b);
    
    if (this.elements.keySignature) {
      this.elements.keySignature.textContent = 
        `Key: ${this.indexToNote(parseInt(likelyKey))}`;
    }
    
    // Detect common progressions
    const progression = this.detectProgressionPattern(chords);
    if (this.elements.progressionPattern && progression) {
      this.elements.progressionPattern.textContent = progression;
    }
  }

  detectProgressionPattern(chords) {
    if (chords.length < 4) return '';
    
    const patterns = {
      'vi-IV-I-V': 'Pop Progression',
      'I-V-vi-IV': 'Pop Progression (Alt)',
      'ii-V-I': 'Jazz Turnaround',
      'I-vi-ii-V': 'Circle Progression',
      'vi-ii-V-I': 'Minor Circle',
      'I-VII-♭VI-♭VII': 'Rock Progression'
    };
    
    // Simplified pattern detection - look for common sequences
    const last4 = chords.slice(-4);
    const chordNames = last4.map(c => c.name).join('-');
    
    // Check for exact matches or partial matches
    for (const [pattern, name] of Object.entries(patterns)) {
      if (chordNames.includes(pattern.replace(/[♭#]/g, ''))) {
        return name;
      }
    }
    
    return 'Custom Progression';
  }

  clearDisplay() {
    if (this.elements.chordName) {
      this.elements.chordName.textContent = '—';
    }
    if (this.elements.confidence) {
      this.elements.confidence.textContent = '0%';
    }
    if (this.elements.qualityBadge) {
      this.elements.qualityBadge.textContent = '';
      this.elements.qualityBadge.className = 'quality-badge';
    }
    
    // Clear all visual indicators
    this.clearAllHighlights();
  }

  clearAllHighlights() {
    // Clear circle of fifths
    if (this.circleNotes) {
      this.circleNotes.forEach(noteEl => {
        const circle = noteEl.querySelector('.note-circle');
        if (circle) {
          circle.style.fill = 'var(--note-inactive)';
          circle.style.stroke = 'var(--note-border)';
          circle.style.strokeWidth = '2px';
          circle.style.filter = 'none';
          circle.style.transform = 'scale(1)';
        }
      });
    }
    
    // Clear piano keys
    if (this.pianoKeys) {
      this.pianoKeys.forEach(keyEl => {
        keyEl.style.backgroundColor = '';
        keyEl.style.borderColor = '';
        keyEl.style.boxShadow = '';
        keyEl.style.transform = '';
      });
    }
    
    // Clear chroma bars
    if (this.chromaBars) {
      this.chromaBars.forEach(bar => {
        const fill = bar.querySelector('.chroma-fill');
        if (fill) {
          fill.style.height = '2%';
          fill.style.backgroundColor = '';
        }
      });
    }
  }

  addToHistory(chordData) {
    this.chordHistory.push({
      ...chordData,
      timestamp: Date.now()
    });
    
    if (this.chordHistory.length > this.maxHistory) {
      this.chordHistory.shift();
    }
  }

  getChordTones(root, quality) {
    const rootIndex = typeof root === 'string' ? this.noteToIndex(root) : root;
    const tones = [rootIndex];
    
    // Determine chord tones based on quality
    if (quality.includes('m') && !quality.includes('maj')) {
      tones.push((rootIndex + 3) % 12); // Minor third
    } else if (!quality.includes('dim') && !quality.includes('sus')) {
      tones.push((rootIndex + 4) % 12); // Major third
    }
    
    if (quality.includes('sus2')) {
      tones.push((rootIndex + 2) % 12); // Second
    } else if (quality.includes('sus4')) {
      tones.push((rootIndex + 5) % 12); // Fourth
    }
    
    if (quality.includes('dim')) {
      tones.push((rootIndex + 6) % 12); // Diminished fifth
    } else if (quality.includes('aug')) {
      tones.push((rootIndex + 8) % 12); // Augmented fifth
    } else if (!quality.includes('5')) {
      tones.push((rootIndex + 7) % 12); // Perfect fifth
    }
    
    // Add extensions
    if (quality.includes('6')) {
      tones.push((rootIndex + 9) % 12); // Sixth
    }
    if (quality.includes('7')) {
      tones.push((rootIndex + 10) % 12); // Minor seventh
    }
    if (quality.includes('Maj7')) {
      tones.push((rootIndex + 11) % 12); // Major seventh
    }
    if (quality.includes('9')) {
      tones.push((rootIndex + 2) % 12); // Ninth
    }
    if (quality.includes('11')) {
      tones.push((rootIndex + 5) % 12); // Eleventh
    }
    if (quality.includes('13')) {
      tones.push((rootIndex + 9) % 12); // Thirteenth
    }
    
    return [...new Set(tones)]; // Remove duplicates
  }

  getQualityDescription(quality) {
    const descriptions = {
      '': 'Major',
      'm': 'Minor',
      'dim': 'Diminished',
      'aug': 'Augmented',
      'sus2': 'Sus 2',
      'sus4': 'Sus 4',
      '5': 'Power',
      '6': 'Sixth',
      'm6': 'Minor 6th',
      '7': 'Dominant 7th',
      'Maj7': 'Major 7th',
      'm7': 'Minor 7th',
      'mMaj7': 'Minor Maj7',
      '9': 'Ninth',
      'm9': 'Minor 9th',
      '11': 'Eleventh',
      '13': 'Thirteenth'
    };
    
    return descriptions[quality] || quality;
  }

  getQualityClass(quality) {
    if (quality.includes('dim')) return 'diminished';
    if (quality.includes('aug')) return 'augmented';
    if (quality.includes('m') && !quality.includes('maj')) return 'minor';
    if (quality.includes('sus')) return 'suspended';
    if (quality.includes('7') || quality.includes('9') || quality.includes('11')) return 'extended';
    if (quality.includes('6')) return 'sixth';
    return 'major';
  }

  getNoteColor(noteIndex, confidence = 1) {
    const colors = {
      enhanced: [
        '#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', 
        '#6c5ce7', '#a55eea', '#26d0ce', '#fd9644',
        '#ee5a24', '#0984e3', '#00b894', '#fdcb6e'
      ],
      classic: [
        '#ff0000', '#ff8800', '#ffff00', '#88ff00',
        '#00ff00', '#00ff88', '#00ffff', '#0088ff',
        '#0000ff', '#8800ff', '#ff00ff', '#ff0088'
      ],
      warm: [
        '#d63031', '#e17055', '#f39c12', '#e67e22',
        '#d35400', '#c0392b', '#e74c3c', '#ff7675',
        '#fd79a8', '#e84393', '#a29bfe', '#6c5ce7'
      ]
    };
    
    const colorSet = colors[this.opts.colorScheme] || colors.enhanced;
    const baseColor = colorSet[noteIndex % colorSet.length];
    
    // Adjust opacity based on confidence
    const alpha = Math.max(0.4, confidence);
    return this.hexToRgba(baseColor, alpha);
  }

  getChromaColor(intensity) {
    const hue = intensity * 240; // Blue to red spectrum
    const saturation = 70 + intensity * 30;
    const lightness = 50 + intensity * 20;
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }

  getMetricColor(value) {
    if (value < 0.3) return '#ff6b6b';
    if (value < 0.7) return '#f39c12';
    return '#00b894';
  }

  hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  lightenColor(color, amount) {
    if (color.startsWith('#')) {
      const num = parseInt(color.slice(1), 16);
      const r = Math.min(255, (num >> 16) + Math.round(255 * amount));
      const g = Math.min(255, ((num >> 8) & 0x00ff) + Math.round(255 * amount));
      const b = Math.min(255, (num & 0x0000ff) + Math.round(255 * amount));
      return `rgb(${r}, ${g}, ${b})`;
    }
    return color;
  }

  noteToIndex(note) {
    const noteMap = {
      'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
      'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8,
      'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
    };
    return noteMap[note] !== undefined ? noteMap[note] : 0;
  }

  indexToNote(index) {
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    return notes[index % 12];
  }

  setupEventListeners() {
    // Add interaction for visualization modes
    if (this.container) {
      this.container.addEventListener('click', (e) => {
        if (e.target.classList.contains('piano-key')) {
          this.handlePianoKeyClick(e.target);
        } else if (e.target.classList.contains('note-circle')) {
          this.handleCircleNoteClick(e.target.parentElement);
        }
      });
    }
  }

  handlePianoKeyClick(keyElement) {
    const noteIndex = parseInt(keyElement.dataset.note);
    const noteName = keyElement.dataset.noteName;
    
    // Trigger a custom event for external handling
    this.container.dispatchEvent(new CustomEvent('noteClick', {
      detail: { noteIndex, noteName }
    }));
  }

  handleCircleNoteClick(noteElement) {
    const noteIndex = parseInt(noteElement.dataset.note);
    const noteName = this.indexToNote(noteIndex);
    
    this.container.dispatchEvent(new CustomEvent('noteClick', {
      detail: { noteIndex, noteName }
    }));
  }

  setupAnimationLoop() {
    // Optional: Continuous animation updates for smooth transitions
    let lastTime = 0;
    const animate = (currentTime) => {
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;
      
      // Update any continuous animations here
      if (this.opts.showSpectralAnalysis && this.chromaData) {
        this.updateSpectralVisualization();
      }
      
      requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
  }

  applyStyles() {
    const styles = `
      <style>
        .chord-visualizer {
          background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
          border-radius: 16px;
          padding: 24px;
          color: white;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }

        .chord-display-main {
          text-align: center;
          margin-bottom: 24px;
        }

        .chord-name-display {
          margin-bottom: 20px;
        }

        .chord-name {
          font-size: 2.5rem;
          font-weight: bold;
          margin-bottom: 8px;
          text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          transition: all 0.3s ease;
        }

        .chord-details {
          display: flex;
          justify-content: center;
          gap: 16px;
          align-items: center;
        }

        .confidence {
          background: rgba(255, 255, 255, 0.2);
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.9rem;
          font-weight: 500;
        }

        .quality-badge {
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .quality-badge.major { background: #00b894; }
        .quality-badge.minor { background: #4ecdc4; }
        .quality-badge.diminished { background: #ff6b6b; }
        .quality-badge.augmented { background: #f39c12; }
        .quality-badge.suspended { background: #a55eea; }
        .quality-badge.extended { background: #fd9644; }
        .quality-badge.sixth { background: #6c5ce7; }

        .visualization-modes {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .viz-mode {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
          backdrop-filter: blur(10px);
        }

        .circle-of-fifths {
          min-height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .circle-svg {
          width: 100%;
          max-width: 280px;
          height: auto;
        }

        .note-circle {
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .note-text {
          font-size: 14px;
          font-weight: bold;
          pointer-events: none;
        }

        .piano-roll {
          padding: 12px;
        }

        .piano-keys {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 2px;
          margin-bottom: 16px;
          height: 60px;
        }

        .piano-key {
          display: flex;
          align-items: flex-end;
          justify-content: center;
          cursor: pointer;
          border-radius: 4px;
          transition: all 0.3s ease;
          position: relative;
        }

        .white-key {
          background: rgba(255, 255, 255, 0.9);
          color: #333;
          border: 1px solid rgba(0, 0, 0, 0.2);
        }

        .black-key {
          background: rgba(0, 0, 0, 0.8);
          color: white;
          height: 60%;
          margin-top: auto;
          z-index: 1;
        }

        .key-label {
          font-size: 10px;
          font-weight: bold;
          padding-bottom: 4px;
        }

        .chroma-bars {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 4px;
          height: 80px;
        }

        .chroma-bar {
          position: relative;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
        }

        .chroma-fill {
          background: #4ecdc4;
          border-radius: 4px;
          transition: all 0.2s ease;
          min-height: 2px;
        }

        .chroma-label {
          position: absolute;
          bottom: -20px;
          left: 50%;
          transform: translateX(-50%);
          font-size: 10px;
          color: rgba(255, 255, 255, 0.7);
        }

        .spectral-display {
          padding: 12px;
        }

        .spectral-canvas {
          width: 100%;
          height: auto;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 8px;
          margin-bottom: 12px;
        }

        .spectral-info {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
        }

        .spectral-metric {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .spectral-metric label {
          font-size: 0.85rem;
          min-width: 60px;
        }

        .metric-bar {
          flex: 1;
          height: 8px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          overflow: hidden;
        }

        .metric-fill {
          height: 100%;
          transition: all 0.3s ease;
          border-radius: 4px;
        }

        .chord-progression-display {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 12px;
          padding: 16px;
          backdrop-filter: blur(10px);
        }

        .progression-header {
          font-size: 1.1rem;
          font-weight: 600;
          margin-bottom: 12px;
          text-align: center;
        }

        .progression-chords {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: center;
          margin-bottom: 16px;
        }

        .progression-chord {
          background: rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          padding: 8px 12px;
          text-align: center;
          min-width: 60px;
          transition: all 0.3s ease;
        }

        .progression-chord.recent {
          background: rgba(74, 222, 128, 0.3);
          transform: scale(1.05);
        }

        .chord-symbol {
          font-weight: bold;
          font-size: 1rem;
        }

        .chord-confidence {
          font-size: 0.75rem;
          opacity: 0.8;
        }

        .progression-analysis {
          display: flex;
          justify-content: space-between;
          align-items: center;
          text-align: center;
          gap: 16px;
          flex-wrap: wrap;
        }

        .key-signature, .progression-pattern {
          background: rgba(255, 255, 255, 0.2);
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.9rem;
        }

        :root {
          --note-inactive: rgba(255, 255, 255, 0.2);
          --note-border: rgba(255, 255, 255, 0.3);
          --note-text: white;
        }

        @media (max-width: 768px) {
          .visualization-modes {
            grid-template-columns: 1fr;
          }
          
          .progression-analysis {
            flex-direction: column;
          }
        }
      </style>
    `;
    
    // Inject styles
    if (!document.querySelector('#chord-visualizer-styles')) {
      const styleEl = document.createElement('div');
      styleEl.id = 'chord-visualizer-styles';
      styleEl.innerHTML = styles;
      document.head.appendChild(styleEl);
    }
  }
}