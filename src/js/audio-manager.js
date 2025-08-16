export class AudioManager {
  constructor() {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
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

  connectNodes() {
    if (this.filters.length > 0) {
      // Chain filters in order
      for (let i = 0; i < this.filters.length - 1; i++) {
        this.filters[i].connect(this.filters[i + 1]);
      }

      // Connect analyser to the first filter and last filter to destination
      this.analyser.connect(this.filters[0]);
      this.filters[this.filters.length - 1].connect(this.ctx.destination);
    } else {
      // Fallback: connect analyser directly to destination
      this.analyser.connect(this.ctx.destination);
    }
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
            duration: audio.duration
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
    this.queue = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    if (this.source) {
      this.source.disconnect();
      this.source.mediaElement.pause();
      this.source.mediaElement.currentTime = 0;
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
      this.source.disconnect();
    }
    
    this.currentIndex = index;
    const track = this.queue[this.currentIndex];
    if (!track) return;
    
    // Create new source from existing audio element
    this.source = this.ctx.createMediaElementSource(track.audio);

    // Route audio through analyser (connected to EQ chain)
    this.source.connect(this.analyser);
    
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
