import { performChordDetection } from './chord-detector.js';

self.addEventListener('message', (e) => {
  const { fftData, config } = e.data;
  const result = performChordDetection(fftData, config);
  self.postMessage(result);
});
