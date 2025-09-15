export class Visualizer {
  constructor(canvasId, analyser) {
    this.canvas = document.getElementById(canvasId);
    this.canvasCtx = this.canvas.getContext('2d');
    this.analyser = analyser;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.timeArray = new Uint8Array(this.analyser.fftSize || 2048);
    this.hue = 0;
    this.particles = [];
    this.fpsCap = 60;
    this._lastDraw = 0;
    this._lastBass = 0;
    this._lastEnergy = 0;
    this.mode = 'orb'; // 'orb' | 'bars' | 'wave' | 'spectrogram' | 'particles'
    this.config = {
      orb: { scale: 0.4 },
      bars: { count: 160 },
      wave: { thickness: 2 },
      spectrogram: { speed: 1 },
      particles: { intensity: 1, size: 1, trail: 0.08, gravity: 0.02 }
    };
    this.themeName = 'neon';
    this.themes = {
      neon: {
        gradient: ['hsl(200,100%,60%)','hsl(320,100%,60%)','hsl(60,100%,60%)'],
        wave: null, // dynamic hue
        baseHue: 0, hueRange: 220
      },
      sunset: {
        gradient: ['#ff7e5f','#feb47b','#ffd166'],
        wave: '#ff9f1c', baseHue: 20, hueRange: 40
      },
      aurora: {
        gradient: ['#00c6ff','#7b2ff7','#17ead9'],
        wave: '#7b2ff7', baseHue: 200, hueRange: 120
      },
      ocean: {
        gradient: ['#00aaff','#0066ff','#00ffaa'],
        wave: '#00ccff', baseHue: 190, hueRange: 60
      },
      mono: {
        gradient: ['#bbb','#888','#ddd'],
        wave: '#eee', baseHue: 0, hueRange: 0
      }
    };

    // Spectrogram buffer
    this._specCanvas = document.createElement('canvas');
    this._specCtx = this._specCanvas.getContext('2d');

    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    // High-DPI aware sizing for crisper visuals
    const ratio = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const cssW = this.canvas.clientWidth || this.canvas.offsetWidth;
    const cssH = this.canvas.clientHeight || this.canvas.offsetHeight;
    this.canvas.width = Math.max(1, Math.floor(cssW * ratio));
    this.canvas.height = Math.max(1, Math.floor(cssH * ratio));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvasCtx.setTransform(ratio, 0, 0, ratio, 0, 0);

    // Spectrogram buffer mirrors canvas size (CSS pixels)
    this._specCanvas.width = cssW;
    this._specCanvas.height = cssH;
  }

  start() {
    this.draw();
  }

  draw() {
    if (!this.analyser) return;
    const now = performance.now();
    const minDt = 1000 / Math.max(1, this.fpsCap);
    if (this._lastDraw && (now - this._lastDraw) < minDt) return;
    this._lastDraw = now;

    this.analyser.getByteFrequencyData(this.dataArray);
    this.analyser.getByteTimeDomainData?.(this.timeArray);

    // For particles mode, use a fading overlay to create trails instead of a hard clear
    if (this.mode === 'particles') {
      const fade = Math.min(0.2, Math.max(0, this.config.particles?.trail ?? 0.08));
      this.canvasCtx.fillStyle = `rgba(0,0,0,${fade})`;
      this.canvasCtx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.hue = (this.hue + 0.5) % 360;

    switch (this.mode) {
      case 'bars':
        this.drawBars();
        break;
      case 'wave':
        this.drawWave();
        break;
      case 'spectrogram':
        this.drawSpectrogram();
        break;
      case 'particles':
        this.drawParticles();
        break;
      case 'orb':
      default: {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const baseRadius = Math.min(centerX, centerY) * (this.config.orb?.scale ?? 0.4);
        this.drawPulseOrb(centerX, centerY, baseRadius);
        this.drawFrequencyBars(centerX, centerY, baseRadius);
        break;
      }
    }
  }

  drawPulseOrb(centerX, centerY, baseRadius) {
    const frequencyValue = this.dataArray.reduce((sum, val) => sum + val, 0) / this.dataArray.length;
    const dynamicRadius = baseRadius + frequencyValue * 0.2;
    const orbHue = this.hue;
    
    // Outer glow
    this.canvasCtx.beginPath();
    this.canvasCtx.arc(centerX, centerY, dynamicRadius, 0, Math.PI * 2);
    this.canvasCtx.fillStyle = `hsla(${orbHue}, 100%, 70%, 0.1)`;
    this.canvasCtx.shadowBlur = 30;
    this.canvasCtx.shadowColor = `hsl(${orbHue}, 100%, 70%)`;
    this.canvasCtx.fill();
    this.canvasCtx.shadowBlur = 0;

    // Core orb
    this.canvasCtx.beginPath();
    this.canvasCtx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
    const gradient = this.canvasCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, baseRadius);
    const tg = this.themes[this.themeName]?.gradient;
    if (tg) {
      gradient.addColorStop(0, tg[0]);
      gradient.addColorStop(0.5, tg[1] || tg[0]);
      gradient.addColorStop(1, tg[2] || tg[1] || tg[0]);
    } else {
      gradient.addColorStop(0, `hsla(${orbHue + 40}, 100%, 80%, 1)`);
      gradient.addColorStop(0.5, `hsla(${orbHue}, 100%, 60%, 0.6)`);
      gradient.addColorStop(1, `hsla(${orbHue - 20}, 100%, 40%, 0.2)`);
    }
    this.canvasCtx.fillStyle = gradient;
    this.canvasCtx.fill();
  }

  drawFrequencyBars(centerX, centerY, baseRadius) {
    const barCount = Math.min(100, Math.round(this.canvas.width / 10));
    const angleStep = (Math.PI * 2) / barCount;
    const dataSize = this.dataArray.length;
    
    for (let i = 0; i < barCount; i++) {
      const angle = i * angleStep;
      const freqIndex = Math.floor((i / barCount) * dataSize);
      const barHeight = this.dataArray[freqIndex] * 0.8;
      
      const startRadius = baseRadius + 10;
      const endRadius = startRadius + barHeight;
      
      const startX = centerX + Math.cos(angle) * startRadius;
      const startY = centerY + Math.sin(angle) * startRadius;
      const endX = centerX + Math.cos(angle) * endRadius;
      const endY = centerY + Math.sin(angle) * endRadius;
      
      const barHue = (this.hue + (i * 360 / barCount)) % 360;
      this.canvasCtx.strokeStyle = `hsl(${barHue}, 100%, 70%)`;
      this.canvasCtx.lineWidth = 2;
      
      this.canvasCtx.beginPath();
      this.canvasCtx.moveTo(startX, startY);
      this.canvasCtx.lineTo(endX, endY);
      this.canvasCtx.stroke();
    }
  }

  // Mode: horizontal mirrored bars with rainbow gradient
  drawBars() {
    const { width, height } = this.canvas;
    const ctx = this.canvasCtx;
    const conf = this.config.bars || {};
    const barCount = Math.min(conf.count || 160, this.dataArray.length);
    const barWidth = width / barCount;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    const tg = this.themes[this.themeName]?.gradient || ['hsl(200,100%,60%)','hsl(320,100%,60%)','hsl(60,100%,60%)'];
    gradient.addColorStop(0, tg[0]);
    gradient.addColorStop(0.5, tg[1] || tg[0]);
    gradient.addColorStop(1, tg[2] || tg[1] || tg[0]);
    ctx.fillStyle = gradient;
    for (let i = 0; i < barCount; i++) {
      const v = this.dataArray[Math.floor(i * (this.dataArray.length / barCount))] / 255;
      const h = v * (height * 0.8);
      const x = i * barWidth;
      const y = (height - h) / 2;
      ctx.fillRect(x, y, Math.max(1, barWidth - 1), h);
    }
  }

  // Mode: neon waveform line
  drawWave() {
    const { width, height } = this.canvas;
    const ctx = this.canvasCtx;
    const arr = this.timeArray;
    if (!arr || arr.length === 0) return;
    ctx.lineWidth = this.config.wave?.thickness || 2;
    const waveColor = this.themes[this.themeName]?.wave;
    ctx.strokeStyle = waveColor || `hsla(${this.hue}, 100%, 60%, 0.9)`;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const v = (arr[i] - 128) / 128; // -1..1
      const x = (i / (arr.length - 1)) * width;
      const y = height / 2 + v * (height * 0.35);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Glow effect
    ctx.shadowBlur = 20;
    ctx.shadowColor = `hsla(${(this.hue + 40) % 360}, 100%, 70%, 0.6)`;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Mode: basic spectrogram (scrolling)
  drawSpectrogram() {
    const w = this._specCanvas.width;
    const h = this._specCanvas.height;
    const sctx = this._specCtx;
    const ctx = this.canvasCtx;
    // Scroll left by N px
    const speed = Math.max(1, this.config.spectrogram?.speed || 1);
    const imageData = sctx.getImageData(speed, 0, Math.max(1, w - speed), h);
    sctx.putImageData(imageData, 0, 0);
    // Draw new column at right
    const colXStart = Math.max(0, w - speed);
    const bins = this.dataArray.length;
    const baseHue = this.themes[this.themeName]?.baseHue ?? 0;
    const hueRange = this.themes[this.themeName]?.hueRange ?? 220;
    for (let x = colXStart; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const bin = Math.floor((1 - y / h) * (bins - 1));
        const v = this.dataArray[bin] / 255; // 0..1
        const hue = (baseHue + v * hueRange + this.hue * 0.1) % 360;
        sctx.fillStyle = `hsl(${hue}, 100%, ${Math.max(25, v * 60)}%)`;
        sctx.fillRect(x, y, 1, 1);
      }
    }
    // Composite to main canvas
    ctx.drawImage(this._specCanvas, 0, 0, this.canvas.width, this.canvas.height);
  }

  // Mode: particle bursts reacting to bass/mids/highs with trails
  drawParticles() {
    const { width, height } = this.canvas;
    const ctx = this.canvasCtx;
    const centerX = width / 2;
    const centerY = height / 2;

    // Analyze frequency bands
    const bins = this.dataArray.length;
    const bassEnd = Math.max(8, Math.floor(bins * 0.08));
    const midStart = Math.floor(bins * 0.08);
    const midEnd = Math.floor(bins * 0.35);
    const highStart = Math.floor(bins * 0.35);
    const highEnd = Math.floor(bins * 0.85);
    let bass = 0, mid = 0, high = 0;
    for (let i = 0; i < bassEnd; i++) bass += this.dataArray[i];
    for (let i = midStart; i < midEnd; i++) mid += this.dataArray[i];
    for (let i = highStart; i < highEnd; i++) high += this.dataArray[i];
    bass /= (Math.max(1, bassEnd) * 255);
    mid  /= (Math.max(1, midEnd - midStart) * 255);
    high /= (Math.max(1, highEnd - highStart) * 255);

    const energy = Math.min(1, (bass * 0.6 + mid * 0.3 + high * 0.1));
    const intensity = this.config.particles?.intensity || 1;
    const sizeBase = 1 + (this.config.particles?.size || 1);
    const gravity = this.config.particles?.gravity ?? 0.02;

    // Beat/burst detection from bass delta
    const bassDelta = Math.max(0, bass - this._lastBass);
    this._lastBass = bass * 0.6 + this._lastBass * 0.4; // smooth
    const burst = bassDelta > 0.12 ? Math.floor(bassDelta * 60 * intensity) : 0;

    // Continuous emission from all bands
    const emit = Math.floor((bass * 10 + mid * 7 + high * 4) * intensity) + burst;
    for (let i = 0; i < emit; i++) {
      const ang = Math.random() * Math.PI * 2;
      // Speed scales with energy, bass heavier
      const speed = (0.5 + Math.random() * (2.5 + energy * 3)) * (0.7 + bass * 0.6);
      const kind = Math.random() < 0.25 ? 'glow' : 'spark';
      const radius = kind === 'glow' ? (2 + Math.random() * 6) * sizeBase : (1 + Math.random() * 3) * sizeBase;
      const hue = (this.hue + (energy * 120) + Math.random() * 60) % 360;
      this.particles.push({
        x: centerX + Math.cos(ang) * Math.random() * (width * 0.05),
        y: centerY + Math.sin(ang) * Math.random() * (height * 0.05),
        vx: Math.cos(ang) * speed + (Math.random() - 0.5) * 1.2,
        vy: Math.sin(ang) * speed + (Math.random() - 0.5) * 1.2,
        life: 1,
        decay: 0.008 + Math.random() * 0.02,
        r: radius,
        hue,
        kind
      });
    }
    // Update/draw
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      // Slight drag
      p.vx *= 0.99; p.vy *= 0.99;
      // Pseudo-gravity pulls outward/up depending on band energy
      p.vy += gravity * (0.6 + 0.8 * (1 - energy));
      p.life -= p.decay;
      if (p.life <= 0 || p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) {
        this.particles.splice(i, 1);
        continue;
      }
      // Draw
      ctx.beginPath();
      const alpha = Math.max(0, p.life);
      const light = p.kind === 'glow' ? 70 : 60;
      ctx.fillStyle = `hsla(${p.hue}, 100%, ${light}%, ${alpha})`;
      ctx.shadowBlur = p.kind === 'glow' ? 20 : 6;
      ctx.shadowColor = `hsla(${p.hue}, 100%, ${light}%, ${alpha})`;
      ctx.arc(p.x, p.y, Math.max(1, p.r * (0.5 + energy)), 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalCompositeOperation = 'source-over';

    // Optional links between nearby particles for interest
    const linkThresh = Math.max(40, Math.min(width, height) * 0.06);
    ctx.lineWidth = 1;
    for (let i = 0; i < this.particles.length; i++) {
      const a = this.particles[i];
      for (let j = i + 1; j < this.particles.length && j < i + 50; j++) {
        const b = this.particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx*dx + dy*dy;
        if (d2 < linkThresh * linkThresh) {
          const t = 1 - Math.sqrt(d2) / linkThresh;
          ctx.strokeStyle = `hsla(${(a.hue + b.hue) / 2}, 100%, 65%, ${0.12 * t})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  setMode(mode) {
    const modes = new Set(['orb', 'bars', 'wave', 'spectrogram', 'particles']);
    this.mode = modes.has(mode) ? mode : 'orb';
  }

  setTheme(name) {
    this.themeName = this.themes[name] ? name : 'neon';
  }

  setConfig(mode, cfg) {
    if (!this.config[mode]) this.config[mode] = {};
    Object.assign(this.config[mode], cfg || {});
  }
}
