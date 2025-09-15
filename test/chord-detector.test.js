import { describe, it, expect } from 'vitest';

import { ChordDetector } from '../src/js/chord-detector.js';

describe('ChordDetector', () => {
  it('detects a C major chord from synthetic data', () => {
    const fftSize = 16384;
    const binsLength = fftSize / 2;
    const fakeBins = new Float32Array(binsLength).fill(-Infinity);

    const sampleRate = 44100;
    const binHz = sampleRate / (2 * binsLength);
    const freqToIndex = (f) => Math.round(f / binHz);
    [261.63, 329.63, 392.0].forEach((freq) => {
      fakeBins[freqToIndex(freq)] = 0;
    });

    const analyser = {
      fftSize,
      getFloatFrequencyData: (arr) => arr.set(fakeBins)
    };

    const detector = new ChordDetector(analyser, {
      sampleRate,
      confEnter: 0,
      confExit: 0,
      holdMsEnter: 0,
      holdMsExit: 0,
      requiredStableFrames: 1
    });

    let detected = null;
    detector.setOnChord((chord) => {
      detected = chord;
    });

    detector.update();

    expect(detected).not.toBeNull();
    expect(detected.name).toBe('C');
  });

  it('detects a C6 chord with added sixth', () => {
    const fftSize = 16384;
    const binsLength = fftSize / 2;
    const fakeBins = new Float32Array(binsLength).fill(-Infinity);

    const sampleRate = 44100;
    const binHz = sampleRate / (2 * binsLength);
    const freqToIndex = (f) => Math.round(f / binHz);
    [261.63, 329.63, 392.0, 440.0].forEach((freq) => {
      fakeBins[freqToIndex(freq)] = 0;
    });

    const analyser = {
      fftSize,
      getFloatFrequencyData: (arr) => arr.set(fakeBins)
    };

    const detector = new ChordDetector(analyser, {
      sampleRate,
      confEnter: 0,
      confExit: 0,
      holdMsEnter: 0,
      holdMsExit: 0,
      requiredStableFrames: 1
    });

    let detected = null;
    detector.setOnChord((chord) => {
      detected = chord;
    });

    detector.update();

    expect(detected).not.toBeNull();
    expect(detected.name).toBe('C6');
  });

  it('detects a Cm6 chord', () => {
    const fftSize = 16384;
    const binsLength = fftSize / 2;
    const fakeBins = new Float32Array(binsLength).fill(-Infinity);

    const sampleRate = 44100;
    const binHz = sampleRate / (2 * binsLength);
    const freqToIndex = (f) => Math.round(f / binHz);
    // C, Eb, G, A
    [261.63, 311.13, 392.0, 440.0].forEach((freq) => {
      fakeBins[freqToIndex(freq)] = 0;
    });

    const analyser = {
      fftSize,
      getFloatFrequencyData: (arr) => arr.set(fakeBins)
    };

    const detector = new ChordDetector(analyser, {
      sampleRate,
      confEnter: 0,
      confExit: 0,
      holdMsEnter: 0,
      holdMsExit: 0,
      requiredStableFrames: 1
    });

    let detected = null;
    detector.setOnChord((chord) => {
      detected = chord;
    });

    detector.update();

    expect(detected).not.toBeNull();
    expect(detected.name).toBe('Cm6');
  });

  it('detects a C13 chord', () => {
    const fftSize = 16384;
    const binsLength = fftSize / 2;
    const fakeBins = new Float32Array(binsLength).fill(-Infinity);

    const sampleRate = 44100;
    const binHz = sampleRate / (2 * binsLength);
    const freqToIndex = (f) => Math.round(f / binHz);
    // C, E, G at full strength; Bb and A slightly quieter to simulate overtones
    [261.63, 329.63, 392.0].forEach((freq) => {
      fakeBins[freqToIndex(freq)] = 0;
    });
    [466.16, 440.0].forEach((freq) => {
      fakeBins[freqToIndex(freq)] = -3;
    });

    const analyser = {
      fftSize,
      getFloatFrequencyData: (arr) => arr.set(fakeBins)
    };

    const detector = new ChordDetector(analyser, {
      sampleRate,
      confEnter: 0,
      confExit: 0,
      holdMsEnter: 0,
      holdMsExit: 0,
      requiredStableFrames: 1
    });

    let detected = null;
    detector.setOnChord((chord) => {
      detected = chord;
    });

    detector.update();

    expect(detected).not.toBeNull();
    expect(detected.name).toBe('C13');
  });

  it('pcToName wraps out-of-range values', () => {
    const analyser = { fftSize: 2048, getFloatFrequencyData: () => {} };
    const detector = new ChordDetector(analyser);
    expect(detector._pcToName(12)).toBe('C');
    expect(detector._pcToName(-1)).toBe('B');
  });

  it('ignores chords below the confidence threshold', () => {
    const analyser = {
      fftSize: 2048,
      getFloatFrequencyData: (arr) => arr.fill(-100) // essentially silence
    };

    const detector = new ChordDetector(analyser, {
      sampleRate: 44100,
      confEnter: 0.9,
      confExit: 0.9,
      holdMsEnter: 0,
      holdMsExit: 0,
      requiredStableFrames: 1
    });

    let called = false;
    detector.setOnChord(() => { called = true; });
    detector.update();
    expect(called).toBe(false);
  });
});
