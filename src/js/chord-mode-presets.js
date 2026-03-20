export const CHORD_MODE_PRESETS = {
  lowcpu: {
    confEnter: 0.35,
    confExit: 0.28,
    holdMsEnter: 450,
    holdMsExit: 250,
    requiredStableFrames: 1,
    chromaAlphaFast: 0.4,
    chromaAlphaSlow: 0.2,
    harmonicThreshold: 0.1,
    rmsGate: 0.005,
    minSpectralClarity: 0.0,
    enableHarmonicAnalysis: false,
    disableEnergyGate: true,
    maxFps: 25,
    chromaSigmaCents: 45,
    fftSize: 8192,
    visualizerFpsCap: 30
  },
  responsive: {
    confEnter: 0.35,
    confExit: 0.28,
    holdMsEnter: 300,
    holdMsExit: 200,
    requiredStableFrames: 1,
    chromaAlphaFast: 0.5,
    chromaAlphaSlow: 0.12,
    harmonicThreshold: 0.12,
    enableHarmonicAnalysis: true,
    maxFps: 45,
    chromaSigmaCents: 40,
    fftSize: 16384,
    visualizerFpsCap: 45
  },
  accurate: {
    confEnter: 0.52,
    confExit: 0.42,
    holdMsEnter: 700,
    holdMsExit: 350,
    requiredStableFrames: 3,
    chromaAlphaFast: 0.35,
    chromaAlphaSlow: 0.18,
    harmonicThreshold: 0.15,
    enableHarmonicAnalysis: true,
    maxFps: 60,
    chromaSigmaCents: 30,
    fftSize: 32768,
    visualizerFpsCap: 60
  },
  normal: {
    confEnter: 0.4,
    confExit: 0.32,
    holdMsEnter: 500,
    holdMsExit: 250,
    requiredStableFrames: 2,
    chromaAlphaFast: 0.4,
    chromaAlphaSlow: 0.15,
    harmonicThreshold: 0.15,
    enableHarmonicAnalysis: true,
    maxFps: 40,
    chromaSigmaCents: 35,
    fftSize: 16384,
    visualizerFpsCap: 40
  }
};

export const applyChordModePreset = (detector, mode, hooks = {}) => {
  if (!detector) return null;
  const preset = CHORD_MODE_PRESETS[mode] || CHORD_MODE_PRESETS.normal;
  const { setChordFftSize, setVisualizerFpsCap } = hooks;
  const { fftSize, visualizerFpsCap, ...detectorConfig } = preset;
  Object.assign(detector, detectorConfig);
  if (typeof setChordFftSize === 'function') setChordFftSize(fftSize);
  if (typeof setVisualizerFpsCap === 'function') setVisualizerFpsCap(visualizerFpsCap);
  detector.refreshAnalysisConfig?.({ resetHistory: true });
  return preset;
};
