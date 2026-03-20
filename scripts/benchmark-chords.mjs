import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

import { ChordDetector } from '../src/js/chord-detector.js';
import { applyChordModePreset, CHORD_MODE_PRESETS } from '../src/js/chord-mode-presets.js';
import { CHORD_FIXTURES, buildFixtureFrames, createFrameAnalyser } from './chord-fixtures.mjs';

const OUTPUT_PATH = path.resolve('docs/chord-benchmark-baseline.json');
const SAMPLE_RATE = 44100;

const runFixture = (mode, fixture) => {
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
  globalThis.performance = { now: () => nowMs };

  let firstDetection = null;
  let finalDetection = null;
  detector.setOnChord(({ name, confidence }) => {
    if (name && !firstDetection) {
      firstDetection = {
        name,
        confidence,
        atMs: nowMs
      };
    }
    if (name) {
      finalDetection = {
        name,
        confidence,
        atMs: nowMs
      };
    }
  });

  const t0 = performance.now();
  for (let i = 0; i < rendered.frames.length; i++) {
    analyser.setFrame(i);
    detector.update();
    nowMs += rendered.frameDurationMs;
  }
  const elapsedMs = performance.now() - t0;

  return {
    fixtureId: fixture.id,
    expected: fixture.expected,
    finalName: finalDetection?.name ?? null,
    firstDetectedAtMs: firstDetection?.atMs ?? null,
    matched: finalDetection?.name === fixture.expected,
    analysisElapsedMs: Number(elapsedMs.toFixed(2)),
    frames: rendered.frames.length
  };
};

const summarizeMode = (mode, results) => {
  const matched = results.filter((item) => item.matched).length;
  const lockTimes = results
    .map((item) => item.firstDetectedAtMs)
    .filter((value) => typeof value === 'number');
  const meanLockMs = lockTimes.length
    ? lockTimes.reduce((sum, value) => sum + value, 0) / lockTimes.length
    : null;
  const meanElapsedMs = results.reduce((sum, item) => sum + item.analysisElapsedMs, 0) / results.length;

  return {
    mode,
    preset: CHORD_MODE_PRESETS[mode],
    accuracy: matched / results.length,
    meanLockMs: meanLockMs == null ? null : Number(meanLockMs.toFixed(2)),
    meanAnalysisElapsedMs: Number(meanElapsedMs.toFixed(2)),
    fixtures: results
  };
};

const main = async () => {
  const modes = ['lowcpu', 'responsive', 'normal', 'accurate'];
  const summary = {
    generatedAt: new Date().toISOString(),
    sampleRate: SAMPLE_RATE,
    fixtures: CHORD_FIXTURES.map((fixture) => ({
      id: fixture.id,
      expected: fixture.expected
    })),
    modes: []
  };

  for (const mode of modes) {
    const results = CHORD_FIXTURES.map((fixture) => runFixture(mode, fixture));
    summary.modes.push(summarizeMode(mode, results));
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);

  for (const mode of summary.modes) {
    console.log(
      `${mode.mode.padEnd(10)} accuracy=${Math.round(mode.accuracy * 100)}% ` +
      `meanLock=${mode.meanLockMs ?? 'n/a'}ms meanAnalysis=${mode.meanAnalysisElapsedMs}ms`
    );
    for (const fixture of mode.fixtures) {
      console.log(
        `  ${fixture.fixtureId.padEnd(16)} expected=${fixture.expected.padEnd(5)} ` +
        `final=${String(fixture.finalName).padEnd(6)} lock=${fixture.firstDetectedAtMs ?? 'n/a'}ms`
      );
    }
  }

  console.log(`\nWrote ${OUTPUT_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
