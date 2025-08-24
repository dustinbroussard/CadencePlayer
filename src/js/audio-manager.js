export class AudioManager {
  constructor() {
    this.ctx = new AudioContext();

    // Visual analyser (byte data for the visualizer)
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // Chord analyser (high resolution FFT)
    this.chordAnalyser = this.ctx.createAnalyser();
    try {
      this.chordAnalyser.fftSize = 32768; // use higher resolution if supported
    } catch {
      this.chordAnalyser.fftSize = 16384; // fallback for older browsers
    }
    this.chordAnalyser.smoothingTimeConstant = 0.12; // allow slight temporal smoothing
    this.chordAnalyser.minDecibels = -110; // extend dynamic range for quiet passages
    this.chordAnalyser.maxDecibels = -10;  // raise ceiling to avoid clipping

    this.source = null;
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.isShuffled = false;
    this.isRepeating = false;
    this.eventListeners = new Map();
    
    // EQ setup
    this.filters = [60, 230, 910, 4000, 14000].map(f => {
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'peaking';
      filter.frequency.value = f;
      filter.gain.value = 0;
      filter.Q.value = 1;
      return filter;
    });

    // Connect nodes after filters are created
    this.connectNodes();
    
    // Resume context on user gesture
    document.addEventListener('click', () => {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }, { once: true });
  }

  on(eventName, listener) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(listener);
  }

  emit(eventName, ...args) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }

  getAnalyser() {
    return this.analyser;
  }

  getFilters() {
    return this.filters;
  }

  getQueue() {
    return this.queue;
  }

  getCurrentSource() {
    return this.source ? this.source.mediaElement : { currentTime: 0, duration: 0 };
  }

  getCurrentIndex() {
    return this.currentIndex;
  }

  getChordAnalyser() {
    return this.chordAnalyser;
  }

  connectNodes() {
    // Build EQ chain (filters in series) → destination
    if (this.filters.length > 1) {
      for (let i = 0; i < this.filters.length - 1; i++) {
        this.filters[i].connect(this.filters[i + 1]);
      }
    }
    const eqInput = this.filters[0] || null;
    const eqOutput = this.filters[this.filters.length - 1] || null;
    if (eqOutput) eqOutput.connect(this.ctx.destination);

    // Create a master gain as the tee point for analysers + EQ
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;
    // Light shelves to balance spectrum for chord detection
    this.lowShelf = this.ctx.createBiquadFilter();
    this.lowShelf.type = 'lowshelf';
    this.lowShelf.frequency.value = 120;
    this.lowShelf.gain.value = -3;
    this.highShelf = this.ctx.createBiquadFilter();
    this.highShelf.type = 'highshelf';
    this.highShelf.frequency.value = 2500;
    this.highShelf.gain.value = -2;

    // masterGain -> lowShelf -> highShelf -> EQ/destination
    if (eqInput) {
      this.masterGain.connect(this.lowShelf);
      this.lowShelf.connect(this.highShelf);
      this.highShelf.connect(eqInput);
    } else {
      this.masterGain.connect(this.lowShelf);
      this.lowShelf.connect(this.highShelf);
      this.highShelf.connect(this.ctx.destination);
    }

    // Feed analysers post-shelves for cleaner data
    this.highShelf.connect(this.analyser);
    this.highShelf.connect(this.chordAnalyser);
    // Time-domain analyser for RMS gating
    this.timeAnalyser = this.ctx.createAnalyser();
    this.timeAnalyser.fftSize = 2048;
    this.highShelf.connect(this.timeAnalyser);
  }

  // Return current RMS level of the signal [0..1]
  getCurrentRms() {
    const buf = new Uint8Array(this.timeAnalyser.fftSize);
    this.timeAnalyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128; // convert to [-1,1]
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }

  async addFilesToQueue(files) {
    for (const file of files) {
      // Create a blob URL to load the file
      const blob = await fetch(`file://${file.path}`).then(r => r.blob());
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      
      // Get duration before adding to queue
      await new Promise(resolve => {
        audio.onloadedmetadata = () => {
          this.queue.push({
            path: file.path,
            name: file.name,
            url: url,
            audio: audio,
            duration: audio.duration,
            source: null
          });
          resolve();
        };
      });
    }
    this.emit('queue-updated');
    if (this.queue.length === files.length) {
      this.playTrack(0);
    }
  }

  clearQueue() {
    // Disconnect and release any existing track resources
    this.queue.forEach(track => {
      if (track.source) {
        track.source.disconnect();
        track.source = null;
      }
      if (track.url) {
        URL.revokeObjectURL(track.url);
      }
    });

    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;

    if (this.source) {
      this.source.mediaElement.pause();
      this.source.mediaElement.currentTime = 0;
      this.source = null;
    }

    this.emit('track-loaded', null);
    this.emit('queue-updated');
  }

  play() {
    if (this.source && this.source.mediaElement.paused) {
      this.source.mediaElement.play();
      this.isPlaying = true;
    }
  }

  pause() {
    if (this.source && !this.source.mediaElement.paused) {
      this.source.mediaElement.pause();
      this.isPlaying = false;
    }
  }
  
  playTrack(index) {
    if (this.source) {
      this.source.mediaElement.pause();
    }

    this.currentIndex = index;
    const track = this.queue[this.currentIndex];
    if (!track) return;

    // Lazily create and wire source the first time this track plays
    if (!track.source) {
      track.source = this.ctx.createMediaElementSource(track.audio);
      track.source.connect(this.masterGain);
    }

    this.source = track.source;

    track.audio.currentTime = 0;
    track.audio.play();
    this.isPlaying = true;
    
    track.audio.onended = () => {
      this.emit('playback-ended');
    };
    
    this.emit('track-loaded', track);
    this.emit('queue-updated'); // Re-render queue to highlight playing track
  }
  
  playNext() {
    let nextIndex = this.currentIndex + 1;
    if (this.isShuffled) {
      const remainingTracks = this.queue.filter((_, i) => i !== this.currentIndex);
      if (remainingTracks.length > 0) {
        const randomTrack = remainingTracks[Math.floor(Math.random() * remainingTracks.length)];
        nextIndex = this.queue.findIndex(track => track.path === randomTrack.path);
      } else {
        nextIndex = 0; // Restart shuffle if all tracks played
      }
    } else if (this.isRepeating) {
      nextIndex = this.currentIndex;
    } else {
      if (nextIndex >= this.queue.length) {
        nextIndex = 0;
      }
    }
    this.playTrack(nextIndex);
  }
  
  playPrev() {
    let prevIndex = this.currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = this.queue.length - 1;
    }
    this.playTrack(prevIndex);
  }

  setVolume(value) {
    if (this.source) {
      this.source.mediaElement.volume = value;
    }
  }
  
  seek(progress) {
    if (this.source) {
      this.source.mediaElement.currentTime = this.source.mediaElement.duration * progress;
    }
  }
  
  setEqGain(index, value) {
    if (this.filters[index]) {
      this.filters[index].gain.value = parseFloat(value);
    }
  }

  toggleShuffle() {
    this.isShuffled = !this.isShuffled;
    this.isRepeating = false;
  }

  toggleRepeat() {
    this.isRepeating = !this.isRepeating;
    this.isShuffled = false;
  }
}
