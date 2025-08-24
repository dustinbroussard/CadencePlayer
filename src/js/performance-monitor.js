export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      chordDetectionTime: [],
      visualizationFPS: 0,
      memoryUsage: 0,
      cpuUsage: 0
    };
  }

  startTimer(operation) {
    return performance.now();
  }

  endTimer(operation, startTime) {
    const duration = performance.now() - startTime;
    if (!this.metrics[operation]) this.metrics[operation] = [];
    this.metrics[operation].push(duration);
    if (this.metrics[operation].length > 100) {
      this.metrics[operation].shift();
    }
  }

  getAverageTime(operation) {
    const times = this.metrics[operation] || [];
    return times.reduce((a, b) => a + b, 0) / times.length;
  }
}
