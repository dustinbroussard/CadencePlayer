import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChordDetector } from '../src/js/chord-detector.js';
import { applyChordModePreset, CHORD_MODE_PRESETS } from '../src/js/chord-mode-presets.js';
import { CHORD_FIXTURES, buildFixtureFrames, createFrameAnalyser } from '../scripts/chord-fixtures.mjs';

const SAMPLE_RATE = 44100;

const runFixture = (fixture, mode) => {
  const preset = CHORD_MODE_PRESETS[mode] || CHORD_MODE_PRESETS.normal;
  const fftSize = preset.fftSize;
  const hopSize = Math.max(1024, fftSize / 8);
  const rendered = buildFixtureFrames(fixture, {
    sampleRate: SAMPLE_RATE,
    fftSize,
    hopSize
  });
  const analyser = createFrameAnalyser(rendered.frames, rendered.fftSize);
  const detector = new ChordDetector(analyser, {
    sampleRate: rendered.sampleRate,
    getRms: () => 0.08,
    rmsGate: 0.005,
    minSpectralClarity: 0.0,
    confEnter: 0,
    confExit: 0,
    holdMsEnter: 0,
    holdMsExit: 0,
    requiredStableFrames: 1
  });

  applyChordModePreset(detector, mode);
  detector.confEnter = Math.min(detector.confEnter, 0.28);
  detector.confExit = Math.min(detector.confExit, 0.22);
  detector.holdMsEnter = Math.min(detector.holdMsEnter, rendered.frameDurationMs);
  detector.holdMsExit = Math.min(detector.holdMsExit, rendered.frameDurationMs);
  detector.requiredStableFrames = Math.min(detector.requiredStableFrames, 2);
  detector.maxFps = 120;

  let nowMs = 0;
  const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  let firstDetection = null;
  let finalDetection = null;

  detector.setOnChord(({ name, confidence }) => {
    if (name && !firstDetection) firstDetection = { name, confidence, atMs: nowMs };
    if (name) finalDetection = { name, confidence, atMs: nowMs };
  });

  for (let i = 0; i < rendered.frames.length; i++) {
    analyser.setFrame(i);
    detector.update();
    nowMs += rendered.frameDurationMs;
  }

  nowSpy.mockRestore();

  return {
    firstDetection,
    finalDetection,
    frameDurationMs: rendered.frameDurationMs
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChordDetector audio fixtures', () => {
  it('locks onto a sustained major chord quickly in responsive mode', () => {
    const result = runFixture(CHORD_FIXTURES[0], 'responsive');
    expect(result.firstDetection?.name).toBe('C');
    expect(result.firstDetection?.atMs ?? Infinity).toBeLessThanOrEqual(400);
  });

  it('detects an audio-like dominant seventh voicing in responsive mode', () => {
    const fixture = CHORD_FIXTURES.find((item) => item.expected === 'G7');
    const result = runFixture(fixture, 'responsive');
    expect(result.finalDetection?.name).toBe('G7');
  });

  it('keeps the correct root family on an audio-like minor strum', () => {
    const fixture = CHORD_FIXTURES.find((item) => item.expected === 'Am');
    const result = runFixture(fixture, 'normal');
    expect(result.finalDetection?.name?.startsWith('Am')).toBe(true);
  });

  it('builds a reusable labeled fixture corpus', () => {
    expect(CHORD_FIXTURES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(CHORD_FIXTURES.map((fixture) => fixture.id)).size).toBe(CHORD_FIXTURES.length);
    expect(CHORD_FIXTURES.every((fixture) => fixture.expected && fixture.notes.length >= 3)).toBe(true);
  });
});
