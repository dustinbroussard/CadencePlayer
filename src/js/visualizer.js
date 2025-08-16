export class Visualizer {
  constructor(canvasId, analyser) {
    this.canvas = document.getElementById(canvasId);
    this.canvasCtx = this.canvas.getContext('2d');
    this.analyser = analyser;
    this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.hue = 0;
    this.particles = [];
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.canvas.offsetHeight;
  }

  start() {
    this.draw();
  }

  draw() {
    if (!this.analyser) return;

    this.analyser.getByteFrequencyData(this.dataArray);
    
    this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const baseRadius = Math.min(centerX, centerY) * 0.4;
    
    this.hue = (this.hue + 0.5) % 360;

    this.drawPulseOrb(centerX, centerY, baseRadius);
    this.drawFrequencyBars(centerX, centerY, baseRadius);
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
    gradient.addColorStop(0, `hsla(${orbHue + 40}, 100%, 80%, 1)`);
    gradient.addColorStop(0.5, `hsla(${orbHue}, 100%, 60%, 0.6)`);
    gradient.addColorStop(1, `hsla(${orbHue - 20}, 100%, 40%, 0.2)`);
    this.canvasCtx.fillStyle = gradient;
    this.canvasCtx.fill();
  }

  drawFrequencyBars(centerX, centerY, baseRadius) {
    const barCount = 100;
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
}
